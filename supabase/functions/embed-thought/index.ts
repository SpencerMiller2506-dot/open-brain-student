// Embedding agent. A database trigger calls this right after a thought is saved:
// it stores the thought's embedding, then links it to its closest thoughts (the graph).
// Send {"backfill": 5} to do the same for up to 5 older thoughts that have no embedding yet.
// Protected by CRON_SECRET (the trigger and the backfill send it).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { embed } from '../_shared/search.ts'

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function process(row: { id: string; content: string }) {
  const { error } = await db.from('thoughts').update({ embedding: await embed(row.content) }).eq('id', row.id)
  if (error) throw error
  const links = await db.rpc('link_thought', { tid: row.id })
  if (links.error) throw links.error
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-brain-cron') !== secret) return json({ error: 'Unauthorized' }, 401)
  try {
    const body = await req.json()

    if (body.backfill) {
      const { data, error } = await db.from('thoughts').select('id, content')
        .is('embedding', null).order('created_at', { ascending: true }).limit(Math.min(Number(body.backfill) || 5, 20))
      if (error) throw error
      let done = 0, failed = 0
      for (const row of data ?? []) {
        try { await process(row); done++ } catch (e) { failed++; console.error(row.id, e) }
      }
      const { count } = await db.from('thoughts').select('id', { count: 'exact', head: true }).is('embedding', null)
      return json({ done, failed, remaining: count ?? 0 })
    }

    if (body.record?.id) await process(body.record)
    return json({ ok: true })
  } catch (e) {
    console.error('embed failed:', e instanceof Error ? e.message : e)
    return json({ ok: false }, 200) // never break a save
  }
})
