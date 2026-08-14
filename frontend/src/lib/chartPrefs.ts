// Persistência local do setup do gráfico — indicadores, configurações,
// desenhos, timeframe e tipo de gráfico. Sem isso, F5 apagava tudo que o
// trader montou (comportamento padrão do nicho é o setup sobreviver).
//
// Escopo de cada coisa:
// - Global (segue o trader em qualquer ativo): indicadores ativos,
//   configurações dos indicadores, tipo de gráfico.
// - Por ativo: desenhos e timeframe — linha de suporte em EUR/USD não faz
//   sentido nenhum plotada em BTC/USD.
//
// A validação de shape fica no TradingChart, que conhece os tipos; aqui os
// campos por ativo são `unknown` de propósito.

const KEY = 'vx_chart_prefs'
const MAX_ASSETS = 30 // descarta os ativos mexidos há mais tempo pro storage não crescer sem limite

export interface AssetChartPrefs {
  drawings?: unknown[]
  tfIndex?: number
  savedAt?: number
}

export interface ChartPrefs {
  indicators?: string[]
  chartType?: string
  // Uma entrada por indicador ('ma', 'bb', 'rsi', 'stochastic', ...) — shape
  // de cada uma é validado no TradingChart via merge por cima dos defaults.
  settings?: Record<string, Record<string, unknown> | undefined>
  perAsset?: Record<string, AssetChartPrefs>
}

export function loadChartPrefs(): ChartPrefs {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as ChartPrefs) : {}
  } catch {
    return {} /* JSON corrompido ou localStorage indisponível — recomeça limpo */
  }
}

function write(prefs: ChartPrefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch { /* localStorage indisponível (modo privado etc.) — ignora */ }
}

export function saveGlobalChartPrefs(patch: Omit<ChartPrefs, 'perAsset'>) {
  write({ ...loadChartPrefs(), ...patch })
}

export function saveAssetChartPrefs(assetId: string, patch: Omit<AssetChartPrefs, 'savedAt'>) {
  const prefs = loadChartPrefs()
  const perAsset: Record<string, AssetChartPrefs> = {
    ...prefs.perAsset,
    [assetId]: { ...patch, savedAt: Date.now() },
  }
  const ids = Object.keys(perAsset)
  if (ids.length > MAX_ASSETS) {
    ids.sort((a, b) => (perAsset[a].savedAt ?? 0) - (perAsset[b].savedAt ?? 0))
    for (const id of ids.slice(0, ids.length - MAX_ASSETS)) delete perAsset[id]
  }
  write({ ...prefs, perAsset })
}
