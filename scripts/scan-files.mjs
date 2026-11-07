import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const HOME = os.homedir()
const URL = 'https://nygetekyfxtjumfknjdc.supabase.co/functions/v1/open-brain-mcp'
const LIST = path.join(HOME, '.open-brain', 'scan-list.txt')
const DONE = path.join(HOME, '.open-brain', 'scanned.json')
const ROOTS = ['Desktop', 'Documents', 'Downloads'].map(d => path.join(HOME, d))
const TYPES = ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf', '.html', '.htm', '.odt']
const SKIP_DIR = /^(\.|node_modules$|Library$|Open Brain|open-brain-student$|.*\.app$|.*_files$)/
const SKIP_NAME = /donor|prospect|pledge|gift|portal|crm|bank|statement|tax|w-?2|1099|ssn|passport|license|medical|lease|password|invoice|payroll|salary/i
const MAX = 100_000
const done = new Set(fs.existsSync(DONE) ? JSON.parse(fs.readFileSync(DONE, 'utf8')) : [])

function walk(dir, out, depth = 0) {
  if (depth > 6) return
  let items = []
  try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const it of items) {
    const p = path.join(dir, it.name)
    if (it.isDirectory()) { if (!SKIP_DIR.test(it.name)) walk(p, out, depth + 1); continue }
    if (!it.isFile() || it.name.startsWith('.')) continue
    if (!TYPES.includes(path.extname(it.name).toLowerCase())) continue
    if (SKIP_NAME.test(it.name) || done.has(p)) continue
    try { if (fs.statSync(p).size > 25e6) continue } catch { continue }
    out.push(p)
  }
}

function textOf(file) {
  const ext = path.extname(file).toLowerCase()
  if (['.txt', '.md'].includes(ext)) return fs.readFileSync(file, 'utf8')
  if (ext === '.pdf') {
    const js = `ObjC.import('PDFKit'); const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(${JSON.stringify(file)})); d.isNil() ? '' : (d.string.js || '')`
    return execFileSync('osascript', ['-l', 'JavaScript', '-e', js], { encoding: 'utf8', maxBuffer: 50e6 })
  }
  return execFileSync('textutil', ['-convert', 'txt', '-stdout', file], { encoding: 'utf8', maxBuffer: 50e6 })
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

if (process.argv[2] !== 'go') {
  const found = []
  ROOTS.forEach(r => walk(r, found))
  const head = '# Files your brain will save. DELETE any line you do NOT want saved (anything GCU donor/prospect, private, or junk).\n# Then press Command+S, close this window, and type:  brainscan go\n\n'
  fs.writeFileSync(LIST, head + found.map(p => p.replace(HOME, '~')).join('\n') + '\n')
  console.log(`Found ${found.length} new files. Opening the list so you can check it...`)
  execFileSync('open', ['-e', LIST])
} else {
  const paths = fs.readFileSync(LIST, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.replace(/^~/, HOME))
  let ok = 0, skipped = 0
  for (const p of paths) {
    const name = path.basename(p)
    if (done.has(p)) continue
    try {
      const text = textOf(p).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
      if (text.length < 20) { console.log(`SKIP ${name} (no readable text)`); skipped++; continue }
      await save(`📄 File: ${name}\n\n${text.slice(0, MAX)}`)
      done.add(p); fs.writeFileSync(DONE, JSON.stringify([...done]))
      console.log(`SAVED ${name}`); ok++
    } catch (e) { console.log(`ERROR ${name}: ${e instanceof Error ? e.message : e}`); skipped++ }
  }
  console.log(`Done: ${ok} saved, ${skipped} skipped. They'll become searchable over the next few hours.`)
}
