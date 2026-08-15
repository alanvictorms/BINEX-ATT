// Persistência local das preferências de negociação (modal de Configurações).
//
// Antes o estado nascia hardcoded num useState, então desmarcar "Rolagem
// automática" durava até o F5 — o padrão voltava sozinho e parecia bug de
// salvamento. Mesma ideia do chartPrefs, mas separado de propósito: aquilo é
// setup do gráfico (indicadores, desenhos), isto é comportamento da plataforma.

const KEY = 'vx_trade_prefs'

export interface TradePrefs {
  autoScroll: boolean
  oneClickTrade: boolean
  performanceMode: boolean
  shortLabels: boolean
}

export const DEFAULT_TRADE_PREFS: TradePrefs = {
  autoScroll: true,
  oneClickTrade: true,
  performanceMode: true,
  shortLabels: true,
}

export function loadTradePrefs(): TradePrefs {
  if (typeof window === 'undefined') return DEFAULT_TRADE_PREFS
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_TRADE_PREFS
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return DEFAULT_TRADE_PREFS
    // Merge por cima dos defaults: chave nova que apareça numa versão futura
    // não fica undefined pra quem já tem preferência salva.
    return {
      autoScroll:      typeof parsed.autoScroll      === 'boolean' ? parsed.autoScroll      : DEFAULT_TRADE_PREFS.autoScroll,
      oneClickTrade:   typeof parsed.oneClickTrade   === 'boolean' ? parsed.oneClickTrade   : DEFAULT_TRADE_PREFS.oneClickTrade,
      performanceMode: typeof parsed.performanceMode === 'boolean' ? parsed.performanceMode : DEFAULT_TRADE_PREFS.performanceMode,
      shortLabels:     typeof parsed.shortLabels     === 'boolean' ? parsed.shortLabels     : DEFAULT_TRADE_PREFS.shortLabels,
    }
  } catch {
    return DEFAULT_TRADE_PREFS /* JSON corrompido ou storage indisponível */
  }
}

export function saveTradePrefs(prefs: TradePrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch { /* modo privado / storage cheio — preferência só não persiste */ }
}
