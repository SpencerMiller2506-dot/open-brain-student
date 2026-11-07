import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const URL = 'https://nygetekyfxtjumfknjdc.supabase.co/functions/v1/open-brain-mcp'
const INBOX = path.join(os.homedir(), 'Open Brain Inbox')
const DONE = path.join(INBOX, 'Imported')
const MAX = 100_000
const key = fs.readFileSync(path.join(os.homedir(), '.open-brain-mcp-key'), 'utf8').trim()
fs.mkdirSync(DONE, { recursive: true })

function textOf(file) {
  const ext = path.extname(file).toLowerCase()
  if (['.txt', '.md', '.csv', '.json'].includes(ext)) return fs.readFileSync(file, 'utf8')
  if (['.docx', '.doc', '.rtf', '.html', '.htm', '.odt', '.webarchive'].includes(ext))
    return execFileSync('textutil', ['-convert', 'txt', '-stdout', file], { encoding: 'utf8', maxBuffer: 50e6 })
  if (ext === '.pdf') {
    const js = `ObjC.import('PDFKit'); const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(${JSON.stringify(file)})); d.isNil() ? '' : (d.string.js || '')`
    return execFileSync('osascript', ['-l', 'JavaScript', '-e', js], { encoding: 'utf8', maxBuffer: 50e6 })
  }
  return null
}

async function save(content) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_thought', arguments: { content } } }),
  })
  const msg = await res.json()
  const text = msg.result?.content?.[0]?.text ?? ''
  if (!text.startsWith('Saved')) throw new Error(text || JSON.stringify(msg).slice(0, 200))
}

const files = fs.readdirSync(INBOX).filter(f => !f.startsWith('.') && fs.statSync(path.join(INBOX, f)).isFile())
if (!files.length) console.log(`Inbox is empty. Drop files into: ${INBOX}`)
let ok = 0, skipped = 0
for (const f of files) {
  const p = path.join(INBOX, f)
  try {
    const raw = textOf(p)
    if (raw == null) { console.log(`SKIP ${f} (file type not supported)`); skipped++; continue }
    const text = raw.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
    if (text.length < 20) { console.log(`SKIP ${f} (no readable text, maybe a scanned image)`); skipped++; continue }
    await save(`📄 File: ${f}\n\n${text.slice(0, MAX)}`)
    fs.renameSync(p, path.join(DONE, f))
    console.log(`SAVED ${f} (${text.length.toLocaleString()} characters${text.length > MAX ? ', trimmed to 100,000' : ''})`)
    ok++
  } catch (e) {
    console.log(`ERROR ${f}: ${e instanceof Error ? e.message : e}`)
    skipped++
  }
}
if (files.length) console.log(`Done: ${ok} saved, ${skipped} skipped. Search for them in a minute or two.`)
