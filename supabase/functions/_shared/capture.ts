// Shared capture logic for YouTube links and web pages.
// Used by telegram-bot (text a link) and capture (the app's YouTube and URL tabs).
// Runs on the server, so it can fetch other websites the browser is not allowed to.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPADATA_KEY = Deno.env.get('SUPADATA_API_KEY') ?? ''
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const MAX_CHARS = 100_000

export interface Capture {
  content: string
  sourceText: string
  sourceKind: 'youtube_transcript' | 'youtube_description' | 'web'
  title: string
  metadata: Record<string, unknown>
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  mdash: '—', ndash: '–', hellip: '…',
}

// &amp; decodes last so "&amp;lt;" stays "&lt;" instead of becoming "<"
export function decodeEntities(s: string): string {
  return s
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n === 'amp' ? m : ENTITIES[n] ?? m))
    .replace(/&#(?!0*38;)(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x(?!0*26;)([0-9a-fA-F]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;|&#0*38;|&#x0*26;/gi, '&')
}

export function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

// A message that is nothing but one link
export function loneUrl(text: string): string | null {
  const t = text.trim()
  return /^https?:\/\/\S+$/i.test(t) ? t : null
}

// ---------- YouTube ----------
// YouTube hides captions from servers, so try routes in order:
// Supadata (needs SUPADATA_API_KEY), then YouTube's own app API posing as
// the iPhone/Android app, then the video description as a last resort.

async function ytTitle(watch: string, id: string): Promise<string> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`,
      { signal: AbortSignal.timeout(8000) })
    if (r.ok) return decodeEntities((await r.json()).title ?? `YouTube video ${id}`)
  } catch { /* title is optional */ }
  return `YouTube video ${id}`
}

async function fromSupadata(watch: string): Promise<string | null> {
  if (!SUPADATA_KEY) return null
  try {
    const r = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(watch)}&lang=en`,
      { headers: { 'x-api-key': SUPADATA_KEY }, signal: AbortSignal.timeout(20_000) })
    if (!r.ok) {
      console.log(`[youtube] Supadata HTTP ${r.status}`)
      return null
    }
    const data = await r.json()
    const segs: Array<{ text?: string }> = Array.isArray(data?.content) ? data.content : []
    const text = (typeof data?.content === 'string' ? data.content : segs.map(s => s.text ?? '').join(' '))
      .replace(/\s+/g, ' ').trim()
    return text ? decodeEntities(text) : null
  } catch (e) {
    console.error('[youtube] Supadata error', String(e))
    return null
  }
}

async function fromInnertube(id: string): Promise<{ text: string; transcript: boolean } | null> {
  const clients = [
    { ua: 'com.google.ios.youtube/19.29.1 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      client: { clientName: 'IOS', clientVersion: '19.29.1', deviceMake: 'Apple', deviceModel: 'iPhone17,2', osName: 'iPhone', osVersion: '18.1.0.22B83', hl: 'en', gl: 'US' } },
    { ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
      client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en', gl: 'US' } },
  ]
  let best: any = null
  for (const c of clients) {
    try {
      const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua },
        body: JSON.stringify({ context: { client: c.client }, videoId: id }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!r.ok) continue
      const j = await r.json()
      const tracks = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks
      if (Array.isArray(tracks) && tracks.length) { best = j; break }
      if (!best) best = j
    } catch (e) {
      console.error('[youtube] Innertube error', String(e))
    }
  }
  if (!best) return null

  const tracks = best?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (Array.isArray(tracks) && tracks.length) {
    const track = tracks.find((t: any) => t.languageCode === 'en' && t.kind !== 'asr')
      ?? tracks.find((t: any) => String(t.languageCode ?? '').startsWith('en')) ?? tracks[0]
    try {
      const r = await fetch(track.baseUrl, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(12_000) })
      if (r.ok) {
        const xml = await r.text()
        const text = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
          .map(m => decodeEntities(m[1])).join(' ').replace(/\s+/g, ' ').trim()
        if (text) return { text, transcript: true }
      }
    } catch (e) {
      console.error('[youtube] caption fetch error', String(e))
    }
  }
  const d = best?.videoDetails
  const desc = [d?.shortDescription ?? '', d?.keywords?.length ? `Keywords: ${d.keywords.join(', ')}` : '']
    .filter(Boolean).join('\n\n')
  return desc ? { text: desc, transcript: false } : null
}

export async function captureYouTube(url: string): Promise<Capture> {
  const id = youTubeId(url)
  if (!id) throw new Error('That does not look like a YouTube link.')
  const watch = `https://www.youtube.com/watch?v=${id}`
  const title = await ytTitle(watch, id)

  let text = await fromSupadata(watch)
  let via = 'supadata'
  let transcript = true
  if (!text) {
    const r = await fromInnertube(id)
    if (!r) throw new Error('Could not read that video. It may be private, age-restricted or have no captions.')
    text = r.text
    transcript = r.transcript
    via = r.transcript ? 'youtube_app' : 'description'
  }
  text = text.slice(0, MAX_CHARS)
  const note = transcript ? '' : '(No transcript was available, so this is the video description.)\n\n'
  return {
    content: `📹 YouTube: ${title}\n\n${note}${text}`,
    sourceText: text,
    sourceKind: transcript ? 'youtube_transcript' : 'youtube_description',
    title,
    metadata: { source: 'youtube', video_id: id, url: watch, title, has_transcript: transcript, fetched_via: via },
  }
}

// ---------- Web pages ----------

function htmlToText(html: string): { title: string; text: string } {
  const t = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i) ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = t ? decodeEntities(t[1]).trim() : 'Untitled page'
  const main = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ?? html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
  const body = (main ? main[1] : html)
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const text = decodeEntities(body)
    .replace(/[ \t ]+/g, ' ')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
    .trim()
  return { title, text }
}

export async function capturePage(url: string): Promise<Capture> {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error('That is not a valid web address.') }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Only http and https links work.')
  // Don't let the server be pointed at its own internal addresses
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i.test(parsed.hostname)) {
    throw new Error('That address is not allowed.')
  }
  const r = await fetch(parsed.toString(), {
    headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })
  if (!r.ok) throw new Error(`That page returned an error (HTTP ${r.status}). It may need a login or block readers.`)
  const type = r.headers.get('content-type') ?? ''
  if (!type.includes('html') && !type.includes('text')) throw new Error('That link is a file, not a web page. Use the PDF tab for PDFs.')
  const raw = await r.text()
  if (raw.length > 3_000_000) throw new Error('That page is too large.')
  const { title, text: full } = htmlToText(raw)
  if (full.length < 200) throw new Error('Almost no readable text on that page. Copy the text in by hand instead.')
  const text = full.slice(0, MAX_CHARS)
  return {
    content: `🔗 Web: ${title}\n${parsed.toString()}\n\n${text}`,
    sourceText: text,
    sourceKind: 'web',
    title,
    metadata: { source: 'url', url: parsed.toString(), hostname: parsed.hostname, title },
  }
}

export function captureAny(url: string): Promise<Capture> {
  return youTubeId(url) ? captureYouTube(url) : capturePage(url)
}

// Save the thought, then the full text alongside it (non-fatal, same as the app)
export async function saveCapture(db: SupabaseClient, userId: string, c: Capture): Promise<string> {
  const { data, error } = await db.from('thoughts')
    .insert({ user_id: userId, content: c.content, metadata: c.metadata })
    .select('id').single()
  if (error) throw error
  const { error: srcErr } = await db.from('thought_sources').insert({
    thought_id: data.id, user_id: userId, source_text: c.sourceText,
    source_kind: c.sourceKind, char_count: c.sourceText.length, truncated: false,
  })
  if (srcErr) console.error('[capture] thought_sources insert failed', srcErr.message)
  return data.id
}
