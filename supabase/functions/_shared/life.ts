// Life tracking for the Telegram bot: workouts, meals, weight, sleep, spending
// and daily priorities. Each log is a normal thought, tagged in metadata.log,
// so it also shows up in the app and in /search.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

export type LogKind = 'workout' | 'meal' | 'weight' | 'sleep' | 'spending' | 'priorities'

const PREFIXES: Record<string, LogKind> = {
  workout: 'workout', gym: 'workout', ran: 'workout', run: 'workout',
  ate: 'meal', meal: 'meal', food: 'meal',
  weight: 'weight', weighed: 'weight',
  sleep: 'sleep', slept: 'sleep',
  spent: 'spending', spend: 'spending', bought: 'spending',
  today: 'priorities', priorities: 'priorities',
}

// Words that sort a purchase into a category. Add "#category" to a message to pick one yourself.
const CATEGORY_WORDS: Record<string, string[]> = {
  Food: ['lunch', 'dinner', 'breakfast', 'coffee', 'food', 'grocer', 'restaurant', 'snack', 'chipotle', 'starbucks', 'dutch', 'pizza', 'taco', 'burger', 'drink', 'doordash', 'ubereats'],
  Transport: ['gas', 'uber', 'lyft', 'parking', 'car', 'oil', 'toll'],
  Bills: ['rent', 'phone', 'insurance', 'subscription', 'netflix', 'spotify', 'utility', 'internet', 'electric'],
  Shopping: ['amazon', 'target', 'walmart', 'clothes', 'shoes', 'costco'],
  Fun: ['movie', 'game', 'concert', 'bar', 'golf', 'ticket', 'trip'],
  Giving: ['church', 'tithe', 'gift', 'donation', 'donate', 'give'],
  Health: ['gym', 'doctor', 'pharmacy', 'medicine', 'supplement', 'protein'],
}

export interface ParsedLog {
  kind: LogKind
  detail: string
  amount?: number
  category?: string
  value?: number
}

// "workout: chest 45 min" -> { kind: 'workout', detail: 'chest 45 min' }
export function parseLog(text: string): ParsedLog | null {
  const m = text.trim().match(/^([a-zA-Z]+)\s*:\s*([\s\S]+)$/)
  if (!m) return null
  const kind = PREFIXES[m[1].toLowerCase()]
  if (!kind) return null
  const detail = m[2].trim()
  const log: ParsedLog = { kind, detail }
  if (kind === 'spending') {
    const amt = detail.match(/\$?\s*(\d+(?:[.,]\d{1,2})?)/)
    if (amt) log.amount = Number(amt[1].replace(',', '.'))
    const tag = detail.match(/#(\w+)/)
    const lower = detail.toLowerCase()
    log.category = tag
      ? tag[1][0].toUpperCase() + tag[1].slice(1).toLowerCase()
      : Object.keys(CATEGORY_WORDS).find(c => CATEGORY_WORDS[c].some(w => lower.includes(w))) ?? 'Other'
  }
  if (kind === 'weight' || kind === 'sleep') {
    const n = detail.match(/(\d+(?:\.\d+)?)/)
    if (n) log.value = Number(n[1])
  }
  return log
}

export function confirmLog(l: ParsedLog): string {
  switch (l.kind) {
    case 'workout': return '💪 Workout logged.'
    case 'meal': return '🍽️ Meal logged.'
    case 'weight': return l.value ? `⚖️ Weight logged: ${l.value}` : '⚖️ Weight logged.'
    case 'sleep': return l.value ? `😴 Sleep logged: ${l.value} hours` : '😴 Sleep logged.'
    case 'spending': return l.amount != null
      ? `💵 $${l.amount.toFixed(2)} logged under ${l.category}.`
      : `💵 Logged under ${l.category}, but I didn't see an amount. Try: spent: $14 lunch`
    case 'priorities': return '✅ Today\'s priorities saved. Go get it.'
  }
}

export async function saveLog(db: SupabaseClient, userId: string, l: ParsedLog, original: string) {
  const { error } = await db.from('thoughts').insert({
    user_id: userId,
    content: original.trim(),
    metadata: { source: 'telegram', log: l.kind, amount: l.amount, category: l.category, value: l.value },
  })
  if (error) throw error
}

interface Row { content: string; created_at: string; metadata: Record<string, any> }

async function logsSince(db: SupabaseClient, userId: string, days: number): Promise<Row[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await db.from('thoughts').select('content, created_at, metadata')
    .eq('user_id', userId).gte('created_at', since).not('metadata->>log', 'is', null)
    .order('created_at', { ascending: true }).limit(1000)
  if (error) throw error
  return (data ?? []) as Row[]
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ })
export const TZ = Deno.env.get('BRAIN_TIMEZONE') ?? 'America/Phoenix'
const strip = (s: string) => s.replace(/^[a-zA-Z]+\s*:\s*/, '')

export async function weeklyRecap(db: SupabaseClient, userId: string): Promise<string> {
  const rows = await logsSince(db, userId, 7)
  const of = (k: LogKind) => rows.filter(r => r.metadata?.log === k)
  const workouts = of('workout'), meals = of('meal'), weights = of('weight'), sleeps = of('sleep'), spend = of('spending')
  const out: string[] = ['📊 Your last 7 days']

  out.push(`\n💪 Workouts: ${workouts.length}`)
  workouts.forEach(w => out.push(`• ${day(w.created_at)}: ${strip(w.content)}`))

  out.push(`\n🍽️ Meals logged: ${meals.length}`)

  const ws = weights.map(w => w.metadata.value).filter((v: unknown) => typeof v === 'number')
  if (ws.length) {
    const change = ws[ws.length - 1] - ws[0]
    out.push(`⚖️ Weight: ${ws[ws.length - 1]}${ws.length > 1 ? ` (${change >= 0 ? '+' : ''}${change.toFixed(1)} this week)` : ''}`)
  }
  const ss = sleeps.map(s => s.metadata.value).filter((v: unknown) => typeof v === 'number')
  if (ss.length) out.push(`😴 Sleep: ${(ss.reduce((a: number, b: number) => a + b, 0) / ss.length).toFixed(1)} hrs average`)

  const amounts = spend.filter(s => typeof s.metadata.amount === 'number')
  const total = amounts.reduce((a, s) => a + s.metadata.amount, 0)
  out.push(`\n💵 Spent: $${total.toFixed(2)}`)
  const byCat: Record<string, number> = {}
  amounts.forEach(s => { byCat[s.metadata.category ?? 'Other'] = (byCat[s.metadata.category ?? 'Other'] ?? 0) + s.metadata.amount })
  Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([c, v]) => out.push(`• ${c}: $${v.toFixed(2)}`))

  if (!rows.length) out.push('\nNothing logged yet. Try: workout: chest day 45 min')
  return out.join('\n')
}

export async function morningCheckIn(db: SupabaseClient, userId: string): Promise<string> {
  const rows = await logsSince(db, userId, 7)
  const lastPriorities = [...rows].reverse().find(r => r.metadata?.log === 'priorities')
  const workouts = rows.filter(r => r.metadata?.log === 'workout').length
  const out = ['☀️ Good morning, Spencer!']
  if (lastPriorities) out.push(`\nLast priorities (${day(lastPriorities.created_at)}):\n${strip(lastPriorities.content)}`)
  out.push(`\n💪 Workouts this week: ${workouts}`)
  out.push('\nWhat are your top 3 for today? Reply starting with:\ntoday: 1) ... 2) ... 3) ...')
  return out.join('\n')
}

export const HELP = [
  'Here\'s what I can do:',
  '• Just text me: saves a thought',
  '• Send a link: saves the YouTube transcript or page',
  '• workout: chest day 45 min',
  '• ate: chicken bowl',
  '• weight: 182',
  '• sleep: 7.5',
  '• spent: $14 lunch  (add #category to choose one)',
  '• today: 1) ... 2) ... 3) ...',
  '• /week: your 7-day recap',
  '• /search word, /recent',
].join('\n')
