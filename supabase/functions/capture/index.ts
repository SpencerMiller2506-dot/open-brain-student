// Called by the app's YouTube and URL tabs: send a link, it fetches and saves it.
// Who you are comes from your login token, never from the request body.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { captureAny, saveCapture } from '../_shared/capture.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return json({ ok: false, error: 'Please log in again.' }, 401)

    const { url: link } = await req.json()
    if (!link || typeof link !== 'string') return json({ ok: false, error: 'Paste a link first.' }, 400)

    const c = await captureAny(link.trim())
    await saveCapture(admin, user.id, c)
    return json({ ok: true, title: c.title, kind: c.sourceKind, chars: c.sourceText.length })
  } catch (e) {
    console.error('[capture]', e)
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200)
  }
})
