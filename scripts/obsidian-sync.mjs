// Open Brain -> Obsidian. Copies everything in your brain into an Obsidian vault
// (the "Open Brain" folder in your home folder) as notes, with [[links]] between
// related thoughts so Obsidian's graph view shows your brain's connections.
// Run it any time with: brainsync   (it also runs by itself every hour)
// Only touches notes it made itself (they have "open_brain: true" at the top).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const URL = 'https://nygetekyfxtjumfknjdc.supabase.co/functions/v1/open-brain-mcp'
const VAULT = path.join(os.homedir(), 'Open Brain')
const FOLDERS = ['Notes', 'YouTube', 'Web', 'Life Log']
const key = fs.readFileSync(path.join(os.homedir(), '.open-brain-mcp-key'), 'utf8').trim()

const res = await fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'brain/export', params: {} }),
})
const msg = await res.json()
if (!msg.result) throw new Error('Export failed: ' + JSON.stringify(msg).slice(0, 300))
const { thoughts, links } = msg.result

// Phoenix time (no daylight saving), so dates match your day
const day = (iso) => new Date(new Date(iso).getTime() - 7 * 3600_000).toISOString().slice(0, 10)
const time = (iso) => new Date(new Date(iso).getTime() - 7 * 3600_000).toISOString().slice(11, 16)
const clean = (s) => s.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim() || 'Untitled'
const yaml = (o) => '---\n' + Object.entries(o).filter(([, v]) => v != null && v !== '')
  .map(([k, v]) => `${k}: ${Array.isArray(v) ? '[' + v.join(', ') + ']' : JSON.stringify(v)}`).join('\n') + '\n---\n'

// Work out every note's folder and file name first, so links can point at them
const notes = new Map()
const used = new Set()
for (const t of thoughts) {
  if (t.metadata?.log) continue
  const src = t.metadata?.source
  const folder = src === 'youtube' ? 'YouTube' : src === 'url' ? 'Web' : 'Notes'
  const firstLine = t.content.split('\n')[0].replace(/^(📹 YouTube:|🔗 Web:)\s*/u, '')
  let name = `${day(t.created_at)} ${clean(t.metadata?.title || firstLine)}`
  if (used.has(name.toLowerCase())) name += ` (${t.id.slice(0, 4)})`
  used.add(name.toLowerCase())
  notes.set(t.id, { t, folder, name, tag: folder === 'Notes' ? 'note' : folder.toLowerCase() })
}

const related = new Map()
for (const l of links) {
  for (const [a, b] of [[l.source_thought_id, l.target_thought_id], [l.target_thought_id, l.source_thought_id]]) {
    if (!notes.has(b)) continue
    if (!related.has(a)) related.set(a, [])
    related.get(a).push({ name: notes.get(b).name, score: l.similarity_score })
  }
}

// Clear out notes this script made last time (your own notes are never touched)
for (const f of FOLDERS) {
  const dir = path.join(VAULT, f)
  fs.mkdirSync(dir, { recursive: true })
  for (const file of fs.readdirSync(dir)) {
    const p = path.join(dir, file)
    if (file.endsWith('.md') && fs.readFileSync(p, 'utf8').startsWith('---\nopen_brain: true')) fs.unlinkSync(p)
  }
}

const write = (folder, name, text) => fs.writeFileSync(path.join(VAULT, folder, name + '.md'), text)

for (const { t, folder, name, tag } of notes.values()) {
  const rel = (related.get(t.id) ?? []).sort((a, b) => b.score - a.score)
  write(folder, name, yaml({ open_brain: true, id: t.id, created: t.created_at, source: t.metadata?.source, url: t.metadata?.url, tags: [tag] })
    + '\n' + t.content + '\n'
    + (rel.length ? '\n## Related\n' + rel.map(r => `- [[${r.name}]] (${Math.round(r.score * 100)}% similar)`).join('\n') + '\n' : ''))
}

// Life logs: one note per day
const days = new Map()
for (const t of thoughts) {
  if (!t.metadata?.log) continue
  const d = day(t.created_at)
  if (!days.has(d)) days.set(d, [])
  days.get(d).push(`- ${time(t.created_at)} **${t.metadata.log}**: ${t.content.replace(/\n/g, ' ')}`)
}
for (const [d, lines] of days) write('Life Log', d, yaml({ open_brain: true, tags: ['life-log'] }) + `\n# ${d}\n\n` + lines.join('\n') + '\n')

fs.writeFileSync(path.join(VAULT, 'Start Here.md'), `# Open Brain

This vault is a copy of your Open Brain, refreshed every hour (or type \`brainsync\` in Terminal).

- **Notes**: things you saved from Telegram, the app or Claude
- **YouTube** and **Web**: saved videos and articles, full text
- **Life Log**: one page per day of workouts, meals, sleep, weight and spending

Each note's **Related** section links to similar thoughts. Open **Graph view** (left sidebar) to see them all connected.

Edits made inside those four folders get replaced on the next refresh. Write your own notes anywhere else.

Last refresh: ${new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' })}, ${notes.size} notes, ${days.size} days of logs.
`)
console.log(`Synced ${notes.size} notes and ${days.size} days of logs to ${VAULT}`)
