// Telegram bot for Open Brain.
// Text it anything and it saves to your brain. "/search word" or "? word" searches,
// "/recent" shows your last 5. Only answers your own chat (TELEGRAM_CHAT_ID).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const OWNER = Deno.env.get('OWNER_USER_ID') ?? ''
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

async function reply(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
  })
}

function list(rows: { content: string; created_at: string }[]) {
  return rows
    .map((r, i) => `${i + 1}. ${r.content.slice(0, 300)}\n   (${r.created_at.slice(0, 10)})`)
    .join('\n\n')
}

Deno.serve(async (req) => {
  // Always answer Telegram with 200 so it never retries the same message.
  const ok = new Response('ok', { status: 200 })
  if (req.method !== 'POST') return ok
  let chatId: number | undefined
  try {
    const update = await req.json()
    const msg = update.message
    const text: string | undefined = msg?.text
    chatId = msg?.chat?.id
    if (!text || !chatId) return ok

    // Lock the bot to your chat. Until TELEGRAM_CHAT_ID is set, it just tells you your id.
    const allowed = Deno.env.get('TELEGRAM_CHAT_ID')
    if (!allowed) {
      await reply(chatId, `Your chat ID is: ${chatId}\nSave it in Supabase as the secret TELEGRAM_CHAT_ID.`)
      return ok
    }
    if (String(chatId) !== allowed.trim()) return ok

    const t = text.trim()
    if (t === '/start') {
      await reply(chatId, 'Brain connected. Text me anything to save it. "/search word" or "? word" to search. "/recent" for your last 5.')
    } else if (t.startsWith('/search') || t.startsWith('?')) {
      const q = t.replace(/^\/search(@\w+)?/, '').replace(/^\?/, '').trim()
      if (!q) {
        await reply(chatId, 'Search for what? Try: /search leadership')
        return ok
      }
      const { data, error } = await db.from('thoughts').select('content, created_at')
        .eq('user_id', OWNER).ilike('content', `%${q}%`)
        .order('created_at', { ascending: false }).limit(5)
      if (error) throw error
      await reply(chatId, data?.length ? `Found ${data.length}:\n\n${list(data)}` : `Nothing found for "${q}".`)
    } else if (t.startsWith('/recent')) {
      const { data, error } = await db.from('thoughts').select('content, created_at')
        .eq('user_id', OWNER).order('created_at', { ascending: false }).limit(5)
      if (error) throw error
      await reply(chatId, data?.length ? `Your last ${data.length}:\n\n${list(data)}` : 'Your brain is empty so far.')
    } else {
      const { error } = await db.from('thoughts').insert({
        user_id: OWNER,
        content: t,
        metadata: { source: 'telegram', telegram_message_id: msg.message_id },
      })
      if (error) throw error
      await reply(chatId, 'Saved to your brain 🧠')
    }
  } catch (e) {
    console.error(e)
    if (chatId) await reply(chatId, 'Something went wrong. Check the function logs in Supabase.').catch(() => {})
  }
  return ok
})
