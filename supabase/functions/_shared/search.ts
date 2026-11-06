// Search by meaning. Text becomes an "embedding" (384 numbers describing what it means)
// using gte-small, a small AI model built into Supabase, so it's free and needs no key.
// Similar meanings get similar numbers, so "how to get clients" finds a note about sales.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// Supabase provides this global inside edge functions
declare const Supabase: { ai: { Session: new (model: string) => { run(input: string, opts: Record<string, boolean>): Promise<unknown> } } }

let session: { run(input: string, opts: Record<string, boolean>): Promise<unknown> } | undefined

// gte-small reads about the first 512 words' worth of text, so long captures are trimmed
export async function embed(text: string): Promise<number[]> {
  session ??= new Supabase.ai.Session('gte-small')
  const out = await session.run(text.slice(0, 2000), { mean_pool: true, normalize: true })
  return Array.from(out as ArrayLike<number>)
}

export interface Hit { id: string; content: string; created_at: string; similarity?: number; matched_chunk?: string | null }

// Hybrid search: meaning (whole thoughts and pieces of long captures) + exact words,
// fused into one ranked list by the database. Falls back to plain word matching if needed.
export async function searchBrain(db: SupabaseClient, owner: string, query: string, count = 10): Promise<Hit[]> {
  let vector: number[] | null = null
  try { vector = await embed(query) } catch (e) {
    console.error('embedding failed, exact words only:', e instanceof Error ? e.message : e)
  }
  const hits: Hit[] = []
  const { data, error } = await db.rpc('hybrid_search', {
    query_text: query, query_embedding: vector, owner, match_count: count,
  })
  if (error) console.error('hybrid search failed:', error.message)
  else hits.push(...(data ?? []))
  if (hits.length < count) {
    const { data: words, error: wErr } = await db.from('thoughts').select('id, content, created_at')
      .eq('user_id', owner).ilike('content', `%${query}%`)
      .order('created_at', { ascending: false }).limit(count)
    if (wErr) throw wErr
    for (const r of words ?? []) if (!hits.some(h => h.id === r.id)) hits.push(r)
  }
  return hits.slice(0, count)
}

// Thoughts the graph has linked to this one, strongest first
export async function relatedThoughts(db: SupabaseClient, owner: string, id: string): Promise<Hit[]> {
  const { data, error } = await db.rpc('related_thoughts', { tid: id, owner })
  if (error) throw error
  return data ?? []
}
