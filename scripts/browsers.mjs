import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const HOME = os.homedir()
const URL = 'https://nygetekyfxtjumfknjdc.supabase.co/functions/v1/open-brain-mcp'
const DONE = path.join(HOME, '.open-brain', 'browser-saved.json')
const SUP = path.join(HOME, 'Library', 'Application Support')
const BROWSERS = { Chrome: path.join(SUP, 'Google', 'Chrome'), Brave: path.join(SUP, 'BraveSoftware', 'Brave-Browser') }
const SKIP = /bank|chase\.com|wellsfargo|capitalone|amex|paypal|venmo|zelle|mail\.google|outlook\.|icloud\.com|salesforce|blackbaud|raisersedge|donorsearch|windfall|asana\.com|docs\.google|drive\.google|sheets\.google|calendar\.google|zoom\.us|teams\.microsoft|sharepoint|onedrive|linkedin\.com\/in\/|google\.com\/search|search\.brave|bing\.com\/search|login|signin|sign-in|password|account|checkout|localhost|supabase\.com\/dashboard|\.gcu\.edu|gcu\.edu\/(?!$)/i
const OK_GCU = /^https?:\/\/(www\.gcu\.edu|news\.gcu\.edu|thegcudifference\.gcu\.edu)/i
const done = new Set(fs.existsSync(DONE) ? JSON.parse(fs.readFileSync(DONE, 'utf8')) : [])
const keep = u => /^https?:/.test(u) && !done.has(u) && (OK_GCU.test(u) || !SKIP.test(u))
const groups = new Map()
const add = (key, url, line) => { if (!groups.has(key)) groups.set(key, new Map()); groups.get(key).set(url, line) }

function walk(node, trail, browser) {
  if (node.type === 'url') { if (keep(node.url)) add(`🔖 ${browser} bookmarks: ${trail.join(' / ') || 'Top'}`, node.url, `- ${node.name || node.url}: ${node.url}`); return }
  for (const c of node.children ?? []) walk(c, node.name && trail.length < 4 ? [...trail, node.name] : trail, browser)
}

for (const [browser, dir] of Object.entries(BROWSERS)) {
  if (!fs.existsSync(dir)) continue
  for (const prof of fs.readdirSync(dir)) {
    const b = path.join(dir, prof, 'Bookmarks')
    if (fs.existsSync(b)) for (const r of Object.values(JSON.parse(fs.readFileSync(b, 'utf8')).roots)) if (r && typeof r === 'object') walk(r, [], browser)
    const h = path.join(dir, prof, 'History')
    if (!fs.existsSync(h)) continue
    const copy = path.join(os.tmpdir(), `brain-history-${Date.now()}`)
    fs.copyFileSync(h, copy)
    const rows = JSON.parse(execFileSync('sqlite3', ['-json', copy,
      "SELECT url, title, visit_count AS n, date(last_visit_time/1000000-11644473600,'unixepoch') AS d FROM urls WHERE hidden=0 AND title<>'' ORDER BY last_visit_time DESC LIMIT 30000"],
      { encoding: 'utf8', maxBuffer: 200e6 }) || '[]')
    fs.rmSync(copy)
    for (const r of rows) {
      if (!keep(r.url)) continue
      let host; try { host = new globalThis.URL(r.url).hostname.replace(/^www\./, '') } catch { continue }
      add(`🌐 Sites I visit: ${host}`, r.url, `- ${r.title} (${r.n}x, last ${r.d}): ${r.url}`)
    }
  }
}

async function save(content) {
  const key = fs.readFileSync(path.join(HOME, '.open-brain-mcp-key'), 'utf8').trim()
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_thought', arguments: { content } } }),
  })
  const text = (await res.json()).result?.content?.[0]?.text ?? ''
  if (!text.startsWith('Saved')) throw new Error(text.slice(0, 200))
}

const list = [...groups].filter(([k, m]) => k.startsWith('🔖') || m.size >= 2)
if (!list.length) console.log('Nothing new to save.')
let total = 0
for (const [title, items] of list) {
  try {
    await save(`${title}\n\n${[...items.values()].slice(0, 300).join('\n')}`.slice(0, 100_000))
    for (const u of items.keys()) done.add(u)
    fs.writeFileSync(DONE, JSON.stringify([...done]))
    console.log(`SAVED ${title} (${items.size})`); total += items.size
  } catch (e) { console.log(`ERROR ${title}: ${e instanceof Error ? e.message : e}`) }
}
if (list.length) console.log(`Done: ${list.length} notes, ${total} links. They'll become searchable over the next day.`)
