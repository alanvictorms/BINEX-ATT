import { NextResponse } from 'next/server'

// Mudança 24h REAL por ativo, pro seletor de pares (vitrine). Fontes:
// - Cripto: ticker/24hr oficial da Binance (priceChangePercent, 1 chamada)
// - Forex LIVE: nossas velas próprias de 1h (close atual vs ~24h atrás)
// OTC NÃO sai daqui — é calculado no cliente da própria série sintética.
// Cache 60s em módulo: informação de vitrine, não de operação.

const BINANCE_BY_ID: Record<string, string> = {
  btc: 'BTCUSDT',
  eth: 'ETHUSDT',
  sol: 'SOLUSDT',
  xrp: 'XRPUSDT',
  bnb: 'BNBUSDT',
}
const FOREX_IDS = ['eur-usd', 'gbp-usd']
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

let cached: { data: Record<string, number>; ts: number } | null = null
const CACHE_TTL = 60_000

export async function GET() {
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  const out: Record<string, number> = {}

  // Binance: 1 chamada cobre todos os símbolos
  try {
    const symbols = encodeURIComponent(JSON.stringify(Object.values(BINANCE_BY_ID)))
    const res = await fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${symbols}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    const json = await res.json()
    if (Array.isArray(json)) {
      for (const [id, sym] of Object.entries(BINANCE_BY_ID)) {
        const t = json.find((x: { symbol?: string }) => x?.symbol === sym)
        const pct = parseFloat((t as { priceChangePercent?: string })?.priceChangePercent ?? '')
        if (Number.isFinite(pct)) out[id] = pct
      }
    }
  } catch { /* vitrine: sem dado é melhor que dado errado (cliente vê o estático) */ }

  // Forex: velas próprias de 1h — no fim de semana mostra a variação das
  // últimas 24h NEGOCIADAS (mercado fechado já tem badge próprio na lista)
  await Promise.all(FOREX_IDS.map(async id => {
    try {
      const res = await fetch(`${API_BASE}/market-data/forex/${id}/candles?tf=3600&limit=25`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      })
      const json = await res.json()
      const candles: Array<{ c: number }> = json?.candles ?? []
      if (candles.length >= 2) {
        const last = candles[candles.length - 1].c
        const prev = candles[0].c
        if (prev > 0) out[id] = ((last - prev) / prev) * 100
      }
    } catch { /* idem */ }
  }))

  cached = { data: out, ts: Date.now() }
  return NextResponse.json(out)
}
