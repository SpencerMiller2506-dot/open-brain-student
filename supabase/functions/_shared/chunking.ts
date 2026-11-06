// Chunking: cut a long capture (a transcript or article) into ~1,200-character pieces
// that overlap a little, so a detail buried in the middle gets its own "meaning" point.
// Short thoughts (2,000 characters or less) are left alone.
export const CHUNK_OVER = 2000
const SIZE = 1200
const OVERLAP = 200

export interface Chunk { content: string; start: number; end: number }

export function chunkText(text: string): Chunk[] {
  if (text.length <= CHUNK_OVER) return []
  const out: Chunk[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + SIZE, text.length)
    if (end < text.length) {
      // Prefer to cut right after a sentence or line break, otherwise at a space
      const window = text.slice(start + Math.floor(SIZE * 0.6), end)
      const m = [...window.matchAll(/[.!?](\s)|\n/g)].pop()
      const cut = m ? start + Math.floor(SIZE * 0.6) + (m.index ?? 0) + 1 : text.lastIndexOf(' ', end)
      if (cut > start + SIZE * 0.5) end = cut
    }
    const content = text.slice(start, end).trim()
    if (content) out.push({ content, start, end })
    if (end >= text.length) break
    // Step back a little so a passage split across two chunks is whole in one of them
    let next = end - OVERLAP
    const sp = text.indexOf(' ', next)
    if (sp !== -1 && sp < end) next = sp + 1
    start = Math.max(next, start + 1)
  }
  return out
}
