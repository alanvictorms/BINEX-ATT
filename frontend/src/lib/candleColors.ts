/**
 * Cores das velas — preferência do usuário, persistida em localStorage.
 * O gráfico lê no init e reage ao evento 'vx-candle-colors'.
 */
export interface CandleColors { up: string; down: string }

export const DEFAULT_CANDLE_COLORS: CandleColors = { up: '#1FD196', down: '#F0435A' }

const KEY = 'vx.candleColors'

export function getCandleColors(): CandleColors {
  if (typeof window === 'undefined') return DEFAULT_CANDLE_COLORS
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_CANDLE_COLORS
    const p = JSON.parse(raw) as Partial<CandleColors>
    return { up: p.up ?? DEFAULT_CANDLE_COLORS.up, down: p.down ?? DEFAULT_CANDLE_COLORS.down }
  } catch {
    return DEFAULT_CANDLE_COLORS
  }
}

export function setCandleColors(next: CandleColors) {
  try { window.localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  window.dispatchEvent(new CustomEvent<CandleColors>('vx-candle-colors', { detail: next }))
}
