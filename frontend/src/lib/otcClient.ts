// Cliente WebSocket + REST helpers para o sistema OTC server-authoritative.
// - subscribeOtc(symbol, cb): WS em /ws/market/:symbol, auto-reconecta.
// - fetchOtcCandles(symbol, tf, limit): GET /market-data/otc/:symbol/candles
// - assetIdToOtcSymbol(): mapeia asset.id do front -> símbolo do backend.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function wsUrl(symbol: string): string {
  const base = API_URL.replace(/^http/, 'ws')
  return `${base}/ws/market/${encodeURIComponent(symbol)}`
}

export type OtcTick = { symbol: string; price: number; t: number; snapshot?: boolean }

export type OtcSubscription = {
  close: () => void
}

// Pares roteados para o OTC engine proprio (server-authoritative).
// Cripto/forex com feed real (Binance/Yahoo) NAO entram aqui — ver REAL_ASSETS em
// marketSymbols.ts. Pra adicionar um par: garanta que o symbol esteja em otc_assets
// como ACTIVE no banco Supabase (admin -> POST /market-data/otc-admin).
const OTC_SYMBOL_MAP: Record<string, string> = {
  'eur-usd-otc': 'EURUSD-OTC',
  'gbp-usd-otc': 'GBPUSD-OTC',
  'usd-jpy-otc': 'USDJPY-OTC',
  'usd-brl-otc': 'USDBRL-OTC',
  'eur-jpy-otc': 'EURJPY-OTC',
  'aud-cad-otc': 'AUDCAD-OTC',
  'nzd-usd-otc': 'NZDUSD-OTC',
  'usd-chf-otc': 'USDCHF-OTC',
  'xau-usd-otc': 'XAUUSD-OTC',
  'xag-usd-otc': 'XAGUSD-OTC',
  'btc-usd-otc': 'BTCUSD-OTC',
  'eth-usd-otc': 'ETHUSD-OTC',
  'sol-usd-otc': 'SOLUSD-OTC',
  'xrp-usd-otc': 'XRPUSD-OTC',
}

// Mapeia asset.id do front para o símbolo do backend. Retorna null se o asset
// não estiver na lista server-authoritative — caller cai em fallback client-side.
export function assetIdToOtcSymbol(assetId: string): string | null {
  return OTC_SYMBOL_MAP[assetId] ?? null
}

// Reverso: símbolo do backend (ex: 'BTCUSD-OTC') -> asset.id do front ('btc-usd-otc').
// Usado pra resolver operações abertas por fora (ex: PulseHacker via /integrations),
// que gravam operations.asset_symbol = símbolo OTC do backend e asset_id = cuid do
// OtcAsset (que NÃO casa com ASSETS por id). Case-insensitive no símbolo.
const OTC_SYMBOL_TO_ASSET_ID: Record<string, string> = Object.fromEntries(
  Object.entries(OTC_SYMBOL_MAP).map(([assetId, symbol]) => [symbol.toUpperCase(), assetId])
)

export function otcSymbolToAssetId(symbol: string | null | undefined): string | null {
  if (!symbol) return null
  return OTC_SYMBOL_TO_ASSET_ID[symbol.toUpperCase()] ?? null
}

// Lista os assetIds com cobertura server-authoritative (útil pra UI mostrar badge).
export const OTC_SERVER_AUTHORITATIVE_IDS: ReadonlySet<string> = new Set(Object.keys(OTC_SYMBOL_MAP))

export function isOtcServerAuthoritative(assetId: string): boolean {
  return OTC_SERVER_AUTHORITATIVE_IDS.has(assetId)
}

// Timeframes suportados pelo backend (segundos)
export const OTC_BACKEND_TFS = [5, 15, 60, 300] as const

export type OtcCandle = { t: number; o: number; h: number; l: number; c: number }

// Busca candles históricos do backend OTC. Retorna null se o backend não responder
// (ex: símbolo não cadastrado, rede caiu) — caller deve cair em fallback.
export async function fetchOtcCandles(symbol: string, tf: number, limit = 300): Promise<OtcCandle[] | null> {
  if (!OTC_BACKEND_TFS.includes(tf as any)) return null
  try {
    const url = `${API_URL}/market-data/otc/${encodeURIComponent(symbol)}/candles?tf=${tf}&limit=${limit}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    return Array.isArray(json?.candles) ? (json.candles as OtcCandle[]) : null
  } catch {
    return null
  }
}

export function subscribeOtc(symbol: string, onTick: (tick: OtcTick) => void): OtcSubscription {
  let ws: WebSocket | null = null
  let closed = false
  let retryDelay = 1_000

  function connect() {
    if (closed) return
    try {
      ws = new WebSocket(wsUrl(symbol))
    } catch (err) {
      console.error('[otc-ws] connect error', err)
      scheduleReconnect()
      return
    }

    ws.onopen = () => { retryDelay = 1_000 }

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string)
        if (typeof data?.price === 'number' && typeof data?.t === 'number') {
          onTick(data as OtcTick)
        }
      } catch { /* ignora payloads inválidos */ }
    }

    ws.onerror = () => { /* o onclose vai disparar e tratar a reconexão */ }

    ws.onclose = () => {
      ws = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (closed) return
    setTimeout(connect, retryDelay)
    retryDelay = Math.min(retryDelay * 2, 15_000)
  }

  connect()

  return {
    close: () => {
      closed = true
      if (ws) {
        try { ws.close() } catch { /* noop */ }
        ws = null
      }
    },
  }
}
