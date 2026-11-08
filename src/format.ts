// Small display helpers shared by components.

// '' -> null, otherwise a number. Accepts a comma decimal ("18,5").
export const num = (s: string) => (s.trim() === '' ? null : Number(s.trim().replace(',', '.')))
export const str = (n: number | null) => (n == null ? '' : String(n))

export function ratio(dose: number | null, yieldG: number | null): string | null {
  if (!dose || !yieldG) return null
  return `1:${(yieldG / dose).toFixed(1)}`
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const DAY = 86_400_000

// Days since roast, counted in local calendar days. roastDate is 'YYYY-MM-DD'.
export function daysOffRoast(roastDate: string | null): number | null {
  if (!roastDate) return null
  const [y, m, d] = roastDate.split('-').map(Number)
  return Math.round((startOfDay(new Date()).getTime() - new Date(y, m - 1, d).getTime()) / DAY)
}

// "Today", "Yesterday", "Tuesday", or "12 Oct" for older shots
export function dayLabel(iso: string): string {
  const d = new Date(iso)
  const diff = Math.round((startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: diff > 300 ? 'numeric' : undefined })
}

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
