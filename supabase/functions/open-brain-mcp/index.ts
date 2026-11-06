// Open Brain MCP server.
// MCP (Model Context Protocol) is the open standard AI apps use to call tools.
// Claude Desktop connects here (through mcp-remote) and gets tools to search,
// list, add to, link and recap your brain. Every request must carry your
// MCP_ACCESS_KEY, and every query is limited to your own thoughts (OWNER_USER_ID).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { weeklyRecap } from '../_shared/life.ts'
import { relatedThoughts, searchBrain } from '../_shared/search.ts'

const OWNER = Deno.env.get('OWNER_USER_ID') ?? ''
const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// The tools Claude sees, with plain-English descriptions so it knows when to use each one
const TOOLS = [
  {
    name: 'search_thoughts',
    description: "Search Spencer's brain (notes, YouTube transcripts, articles, workouts, spending, priorities) by meaning, so different wording still matches. Returns up to 10 matches, closest first.",
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What to look for, in plain words' } }, required: ['query'] },
  },
  {
    name: 'related_thoughts',
    description: "Given a thought's id (from search_thoughts or list_recent), list the other thoughts the brain has linked to it by meaning.",
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The thought id' } }, required: ['id'] },
  },
  {
    name: 'list_recent',
    description: "List the most recent things saved to Spencer's brain.",
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'How many (default 10, max 50)' } } },
  },
  {
    name: 'add_thought',
    description: "Save a new thought to Spencer's brain. Only use when Spencer asks you to save something.",
    inputSchema: { type: 'object', properties: { content: { type: 'string', description: 'The text to save' } }, required: ['content'] },
  },
  {
    name: 'life_recap',
    description: "Spencer's last 7 days of logged workouts, meals, weight, sleep and spending by category.",
    inputSchema: { type: 'object', properties: {} },
  },
]

interface Thought { id: string; content: string; created_at: string; similarity?: number; matched_chunk?: string | null }

const format = (rows: Thought[]) => rows.length
  ? rows.map(r => `[${r.created_at.slice(0, 10)}] (id ${r.id})${r.similarity ? ` match ${Math.round(r.similarity * 100)}%` : ''}`
      + (r.matched_chunk ? `\nMatched part (from partway through a longer capture):\n"${r.matched_chunk}"\n\nFull text:` : '')
      + `\n${r.content}`).join('\n\n---\n\n')
  : 'No thoughts found.'

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'search_thoughts': {
      const q = String(args.query ?? '').trim()
      if (!q) return 'Please give a search query.'
      return format(await searchBrain(db, OWNER, q))
    }
    case 'related_thoughts': {
      const id = String(args.id ?? '').trim()
      if (!id) return 'Please give a thought id.'
      return format(await relatedThoughts(db, OWNER, id))
    }
    case 'list_recent': {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50)
      const { data, error } = await db.from('thoughts').select('id, content, created_at')
        .eq('user_id', OWNER).order('created_at', { ascending: false }).limit(limit)
      if (error) throw error
      return format(data ?? [])
    }
    case 'add_thought': {
      const content = String(args.content ?? '').trim()
      if (!content) return 'Nothing to save.'
      const { data, error } = await db.from('thoughts')
        .insert({ user_id: OWNER, content, metadata: { source: 'mcp' } })
        .select('id, created_at').single()
      if (error) throw error
      return `Saved (id ${data.id}).`
    }
    case 'life_recap':
      return await weeklyRecap(db, OWNER)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  // The lock: only callers with your MCP_ACCESS_KEY get in
  const key = Deno.env.get('MCP_ACCESS_KEY') ?? ''
  const auth = req.headers.get('Authorization') ?? ''
  if (!key || auth !== `Bearer ${key}`) return json({ error: 'Unauthorized' }, 401)

  let msg: { jsonrpc?: string; id?: string | number | null; method?: string; params?: any }
  try {
    msg = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }
  const id = msg.id ?? null
  const result = (r: unknown) => json({ jsonrpc: '2.0', id, result: r })

  // Notifications (no id) just get acknowledged
  if (msg.id === undefined) return new Response(null, { status: 202, headers: cors })

  try {
    switch (msg.method) {
      case 'initialize':
        return result({
          protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'open-brain', version: '1.0.0' },
          instructions: "This is Spencer's personal brain. Search it whenever Spencer asks about something he saved, learned, logged or worked on.",
        })
      // Not a tool Claude sees: the Obsidian sync uses this to copy your whole brain
      case 'brain/export': {
        const thoughts: unknown[] = []
        for (let from = 0; ; from += 500) {
          const { data, error } = await db.from('thoughts').select('id, content, created_at, metadata')
            .eq('user_id', OWNER).order('created_at').range(from, from + 499)
          if (error) throw error
          thoughts.push(...(data ?? []))
          if ((data ?? []).length < 500) break
        }
        const links: unknown[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await db.from('thought_links').select('source_thought_id, target_thought_id, similarity_score')
            .eq('user_id', OWNER).range(from, from + 999)
          if (error) throw error
          links.push(...(data ?? []))
          if ((data ?? []).length < 1000) break
        }
        return result({ thoughts, links })
      }
      case 'ping':
        return result({})
      case 'tools/list':
        return result({ tools: TOOLS })
      case 'tools/call': {
        const text = await callTool(msg.params?.name, msg.params?.arguments ?? {})
        return result({ content: [{ type: 'text', text: text.slice(0, 60_000) }] })
      }
      default:
        return json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${msg.method}` } })
    }
  } catch (e) {
    console.error(e)
    const message = e instanceof Error ? e.message : String(e)
    if (msg.method === 'tools/call') return result({ content: [{ type: 'text', text: `Error: ${message}` }], isError: true })
    return json({ jsonrpc: '2.0', id, error: { code: -32603, message } })
  }
})
