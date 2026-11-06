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

export interface Hit { id: string; content: string; created_at: string; similarity?: number }

// Meaning matches first, then exact-word matches the meaning search missed
export async function searchBrain(db: SupabaseClient, owner: string, query: string, count = 10): Promise<Hit[]> {
  const hits: Hit[] = []
  try {
    const { data, error } = await db.rpc('match_thoughts', {
      query_embedding: await embed(query), owner, match_count: count, min_similarity: 0.75,
    })
    if (error) throw error
    hits.push(...(data ?? []))
  } catch (e) {
    console.error('meaning search failed, using words only:', e instanceof Error ? e.message : e)
  }
  const { data, error } = await db.from('thoughts').select('id, content, created_at')
    .eq('user_id', owner).ilike('content', `%${query}%`)
    .order('created_at', { ascending: false }).limit(count)
  if (error) throw error
  for (const r of data ?? []) if (!hits.some(h => h.id === r.id)) hits.push(r)
  return hits.slice(0, count)
}

// Thoughts the graph has linked to this one, strongest first
export async function relatedThoughts(db: SupabaseClient, owner: string, id: string): Promise<Hit[]> {
  const { data, error } = await db.rpc('related_thoughts', { tid: id, owner })
  if (error) throw error
  return data ?? []
}
