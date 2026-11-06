// Embedding agent. A database trigger calls this right after a thought is saved:
// it stores the thought's meaning (embedding), links it to its closest thoughts (the graph),
// and if it's a long capture, cuts it into pieces (chunks) that each get their own meaning.
// Send {"backfill": 5} to catch up on anything still waiting (a job does this every 10 minutes).
// Protected by CRON_SECRET (the trigger, the job, and the backfill send it).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { embed } from '../_shared/search.ts'
import { chunkText, CHUNK_OVER } from '../_shared/chunking.ts'

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
// The free plan only allows a little computer time per call, so each call embeds just a few things
const PER_CALL = 3

async function process(row: { id: string; content: string }) {
  const { error } = await db.from('thoughts').update({ embedding: await embed(row.content) }).eq('id', row.id)
  if (error) throw error
  const links = await db.rpc('link_thought', { tid: row.id })
  if (links.error) throw links.error
}

// Cut one long thought into chunk rows (their meanings get filled in by embedChunks)
async function makeChunks(id: string) {
  const { data, error } = await db.from('thoughts').select('content').eq('id', id).single()
  if (error) throw error
  const pieces = chunkText(data.content ?? '')
  if (!pieces.length) return 0
  const { error: insErr } = await db.from('thought_chunks').upsert(
    pieces.map((p, i) => ({ thought_id: id, chunk_index: i, content: p.content, char_start: p.start, char_end: p.end })),
    { onConflict: 'thought_id,chunk_index', ignoreDuplicates: true })
  if (insErr) throw insErr
  return pieces.length
}

// Give up to `limit` waiting chunks their meaning
async function embedChunks(limit: number, thoughtId?: string) {
  let q = db.from('thought_chunks').select('id, content').is('embedding', null)
  if (thoughtId) q = q.eq('thought_id', thoughtId)
  const { data, error } = await q.order('created_at').order('chunk_index').limit(limit)
  if (error) throw error
  let done = 0, failed = 0
  for (const c of data ?? []) {
    try {
      const { error: upErr } = await db.from('thought_chunks').update({ embedding: await embed(c.content) }).eq('id', c.id)
      if (upErr) throw upErr
      done++
    } catch (e) { failed++; console.error('chunk', c.id, e) }
  }
  return { done, failed }
}

async function countWaiting() {
  const a = await db.from('thoughts').select('id', { count: 'exact', head: true }).is('embedding', null)
  const b = await db.from('thought_chunks').select('id', { count: 'exact', head: true }).is('embedding', null)
  const c = await db.rpc('thoughts_needing_chunks', { n: 1000 })
  return (a.count ?? 0) + (b.count ?? 0) + (c.data?.length ?? 0)
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-brain-cron') !== secret) return json({ error: 'Unauthorized' }, 401)
  try {
    const body = await req.json()

    if (body.backfill) {
      let budget = PER_CALL, done = 0, failed = 0
      // 1) thoughts with no meaning yet
      const { data, error } = await db.from('thoughts').select('id, content')
        .is('embedding', null).order('created_at', { ascending: true }).limit(budget)
      if (error) throw error
      for (const row of data ?? []) {
        budget--
        try { await process(row); done++ } catch (e) { failed++; console.error(row.id, e) }
      }
      // 2) cut one long thought into chunks (cheap, no AI needed)
      const need = await db.rpc('thoughts_needing_chunks', { n: 1 })
      if (need.error) throw need.error
      for (const r of need.data ?? []) {
        try { if (await makeChunks(r.id)) done++ } catch (e) { failed++; console.error('chunking', r.id, e) }
      }
      // 3) chunks waiting for their meaning, with whatever budget is left
      if (budget > 0) {
        const ch = await embedChunks(budget)
        done += ch.done; failed += ch.failed
      }
      return json({ done, failed, remaining: await countWaiting() })
    }

    if (body.record?.id) {
      await process(body.record)
      // Long capture? Cut it up and start on its chunks (the 10-minute job finishes the rest)
      if ((body.record.content ?? '').length >= CHUNK_OVER) {
        try {
          if (await makeChunks(body.record.id)) await embedChunks(2, body.record.id)
        } catch (e) { console.error('chunking failed:', e instanceof Error ? e.message : e) }
      }
    }
    return json({ ok: true })
  } catch (e) {
    console.error('embed failed:', e instanceof Error ? e.message : e)
    return json({ ok: false }, 200) // never break a save
  }
})
