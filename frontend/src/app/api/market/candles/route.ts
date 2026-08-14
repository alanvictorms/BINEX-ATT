import { NextRequest, NextResponse } from 'next/server'
import type { Candle } from '@/lib/mockData'
import { tfToTwelveDataInterval } from '@/lib/marketSymbols'

const cache = new Map<string, { candles: Candle[]; ts: number; provider?: string }>()

// TTLs diferenciados. Forex vem da Kraken (sem cota) com TTL curto — a mesma
// fonte do preco ao vivo (live_prices), entao historico e vela ao vivo emendam
// sem degrau. Twelve Data e so reserva do forex (cota 800/dia, TTL maior).
const CACHE_TTL: Record<string, number> = {
  own:        5_000,   // nossas velas (vertex-api) — mesma fonte da liquidacao
  binance:    10_000,  // sem cota; TTL curto = historico chega no minuto corrente
  yahoo:      60_000,
  kraken:     10_000,  // sem cota; idem (limite publico ~1 req/s, folga p/ 2 pares)
  twelvedata: 120_000, // reserva com cota (800/dia)
}

// ── Velas próprias (vertex-api) — fonte primária do forex ───────────────────
// Construídas pelo publisher a partir do MID de 5s que alimenta a live_prices:
// o gráfico exibe exatamente a série que liquida operação, com corpo/pavio de
// verdade (o OHLC da Kraken vira "vela-ponto" nos pares de livro fino).
// Só entram se estiverem FRESCAS — publisher parado/fim de semana => Kraken/TD.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const OWN_ASSET_BY_SYMBOL: Record<string, string> = {
  'EUR/USD': 'eur-usd',
  'GBP/USD': 'gbp-usd',
}

async function fetchOwnForexCandles(assetId: string, tfSeconds: number, limit: number): Promise<Candle[]> {
  const url = `${API_BASE}/market-data/forex/${encodeURIComponent(assetId)}/candles?tf=${tfSeconds}&limit=${limit}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5_000) })
  const json = await res.json()
  const rows: Array<{ t: number; o: number; h: number; l: number; c: number }> = json?.candles ?? []
  if (rows.length === 0) throw new Error('own: sem candles')
  const ageS = Math.floor(Date.now() / 1000) - Number(rows[rows.length - 1].t)
  if (ageS > 2 * tfSeconds + 30) throw new Error('own: historico velho (publisher parado?)')
  return rows.map(r => ({
    time:  Number(r.t) + BRT_OFFSET,
    open:  Number(r.o),
    high:  Number(r.h),
    low:   Number(r.l),
    close: Number(r.c),
  }))
}

const BRT_OFFSET = -3 * 3600

function tfSecondsToYahoo(seconds: number): { interval: string; range: string } {
  if (seconds <= 60)    return { interval: '1m',  range: '1d'  }
  if (seconds <= 300)   return { interval: '5m',  range: '5d'  }
  if (seconds <= 900)   return { interval: '15m', range: '60d' }
  if (seconds <= 1800)  return { interval: '30m', range: '60d' }
  if (seconds <= 3600)  return { interval: '60m', range: '60d' }
  if (seconds <= 14400) return { interval: '1h',  range: '60d' }
  return { interval: '1d', range: '1y' }
}

async function fetchYahooCandles(symbol: string, tfSeconds: number, limit: number): Promise<Candle[]> {
  const { interval, range } = tfSecondsToYahoo(tfSeconds)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('Yahoo Finance: no result')

  const timestamps: number[] = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0] ?? {}
  const { open = [], high = [], low = [], close = [] } = quote

  const candles: Candle[] = []
  for (let i = 0; i < timestamps.length; i++) {
    if (open[i] == null || close[i] == null) continue
    candles.push({
      time:  timestamps[i] + BRT_OFFSET,
      open:  open[i],
      high:  high[i],
      low:   low[i],
      close: close[i],
    })
  }

  return candles.slice(-limit)
}

async function fetchBinanceCandles(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  // data-api.binance.vision: endpoint publico oficial sem bloqueio geografico
  // (api.binance.com retorna 451 para IPs dos EUA, onde roda a VPS/SFO).
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`
  const res  = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5_000) })
  const json = await res.json()
  if (!Array.isArray(json)) throw new Error('Binance error')

  return json.map((k: any[]) => ({
    time:  Math.floor(k[0] / 1000) + BRT_OFFSET,
    open:  parseFloat(k[1]),
    high:  parseFloat(k[2]),
    low:   parseFloat(k[3]),
    close: parseFloat(k[4]),
  }))
}

// ── Kraken OHLC: fonte primaria do forex ─────────────────────────────────────
// MESMA fonte do preco ao vivo (publisher -> live_prices) — elimina o "degrau"
// visual entre historico e vela ao vivo que existia com fontes distintas (TD e
// Kraken divergem alguns pips entre si). Gratis, sem chave, ate 720 candles e
// inclui a vela do minuto CORRENTE (tempo real). TD fica como reserva.
const KRAKEN_PAIRS: Record<string, string> = {
  'EUR/USD': 'EURUSD',
  'GBP/USD': 'GBPUSD',
}

function tfSecondsToKrakenInterval(seconds: number): number | null {
  const min = seconds / 60
  return [1, 5, 15, 30, 60, 240, 1440].includes(min) ? min : null
}

// Fim de semana: o publisher congela o preco em sexta 22h UTC, mas a Kraken
// (exchange) segue negociando 24/7 — sem este corte o historico "andaria" no
// fim de semana enquanto a vela ao vivo fica parada, descolando de novo.
function forexWeekendCutoffEpoch(nowMs: number): number | null {
  const d = new Date(nowMs)
  const day = d.getUTCDay(), hour = d.getUTCHours()
  const closed = day === 6 || (day === 5 && hour >= 22) || (day === 0 && hour < 22)
  if (!closed) return null
  const cutoff = new Date(d)
  const daysBack = day === 6 ? 1 : day === 0 ? 2 : 0   // sab->sexta=1, dom->sexta=2
  cutoff.setUTCDate(cutoff.getUTCDate() - daysBack)
  cutoff.setUTCHours(22, 0, 0, 0)
  return Math.floor(cutoff.getTime() / 1000)
}

// Limpeza de "bad ticks": os pares fiat da Kraken tem livro fino e um flash
// trade imprime pavios centenas de pips fora do preco real por 1s (visto no
// GBP/USD: pavio de 1.6% numa vela de 1m). Clampa OHLC de cada vela a um
// desvio maximo da MEDIANA dos fechamentos vizinhos — filtro simetrico e
// padrao em charting; remove artefato de microestrutura, nao direcao.
const WICK_MAX_DEV = 0.004  // 0.4% — vela real de 1m raramente passa de 0.1%
function sanitizeCandles(candles: Candle[]): Candle[] {
  const closes = candles.map(c => c.close)
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  return candles.map((c, i) => {
    const from = Math.max(0, i - 3)
    const ref  = median(closes.slice(from, Math.min(closes.length, i + 4)))
    const lo   = ref * (1 - WICK_MAX_DEV)
    const hi   = ref * (1 + WICK_MAX_DEV)
    const clamp = (v: number) => Math.max(lo, Math.min(hi, v))
    const open  = clamp(c.open), close = clamp(c.close)
    return {
      time:  c.time,
      open,
      close,
      high: Math.max(open, close, clamp(c.high)),
      low:  Math.min(open, close, clamp(c.low)),
    }
  })
}

async function fetchKrakenCandles(pair: string, tfSeconds: number, limit: number): Promise<Candle[]> {
  const interval = tfSecondsToKrakenInterval(tfSeconds)
  if (!interval) throw new Error(`Kraken: timeframe ${tfSeconds}s nao suportado`)

  const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${interval}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6_000) })
  const json = await res.json()
  if (json.error?.length) throw new Error(`Kraken: ${json.error.join('; ')}`)

  // result = { ZEURZUSD: [[time, open, high, low, close, vwap, vol, count], ...], last: n }
  const rows = (Object.values(json.result ?? {}).find(Array.isArray) ?? []) as any[]
  if (rows.length === 0) throw new Error('Kraken: sem candles')

  const cutoff = forexWeekendCutoffEpoch(Date.now())
  let candles: Candle[] = rows.map((r: any[]) => ({
    time:  Number(r[0]) + BRT_OFFSET,
    open:  parseFloat(r[1]),
    high:  parseFloat(r[2]),
    low:   parseFloat(r[3]),
    close: parseFloat(r[4]),
  }))
  if (cutoff != null) candles = candles.filter(c => c.time < cutoff + BRT_OFFSET)
  return sanitizeCandles(candles.slice(-limit))
}

async function fetchTwelveDataCandles(symbol: string, tfSeconds: number, limit: number): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not configured')

  const interval = tfToTwelveDataInterval(tfSeconds)
  if (!interval) throw new Error(`Twelve Data: timeframe ${tfSeconds}s not supported`)

  // timezone=UTC explicito: o default ("Exchange") devolve forex em fuso de
  // Sydney (UTC+10) -> candles ~10h "no futuro" -> lightweight-charts recusa o
  // update da vela ao vivo (time menor que o historico) e o grafico congela.
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${limit}&timezone=UTC&apikey=${apiKey}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
  const json = await res.json()
  if (json.status === 'error') throw new Error(`Twelve Data: ${json.message}`)
  if (!Array.isArray(json.values)) throw new Error('Twelve Data: invalid response')

  // Cinto de seguranca: descarta candle com time no futuro (provider com fuso
  // errado nao pode congelar o grafico de novo).
  const maxTime = Math.floor(Date.now() / 1000) + BRT_OFFSET + tfSeconds

  // Twelve Data devolve em ordem desc (mais recente primeiro). Invertemos para asc.
  return json.values.map((v: any) => ({
    time:  Math.floor(new Date(v.datetime + 'Z').getTime() / 1000) + BRT_OFFSET,
    open:  parseFloat(v.open),
    high:  parseFloat(v.high),
    low:   parseFloat(v.low),
    close: parseFloat(v.close),
  })).filter((c: Candle) => c.time <= maxTime).reverse()
}

export async function GET(req: NextRequest) {
  const symbol   = req.nextUrl.searchParams.get('symbol')
  const source   = req.nextUrl.searchParams.get('source') as 'yahoo' | 'binance' | 'twelvedata' | null
  const interval = req.nextUrl.searchParams.get('interval') ?? '60'
  const limit    = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') ?? '80'))

  if (!symbol || !source) return NextResponse.json({ error: 'symbol and source required' }, { status: 400 })

  const cacheKey = `${source}:${symbol}:${interval}:${limit}`
  const cached   = cache.get(cacheKey)
  // TTL do provedor que de fato serviu o cache (forex: kraken 20s; reserva TD 120s)
  const ttl      = CACHE_TTL[cached?.provider ?? source] ?? 60_000
  if (cached && Date.now() - cached.ts < ttl) {
    return NextResponse.json({ candles: cached.candles, cached: true })
  }

  try {
    let candles: Candle[]
    let provider: string = source
    if (source === 'binance') {
      candles = await fetchBinanceCandles(symbol, interval, limit)
    } else if (source === 'twelvedata') {
      // Forex — ordem de preferência:
      // 1) Nossas velas (vertex-api, mid de 5s = fonte da liquidação)
      // 2) Kraken OHLC sanitizado (backfill do que falta / fallback)
      // 3) Twelve Data (última reserva, cota limitada)
      const tfSeconds  = parseInt(interval)
      const ownAsset   = OWN_ASSET_BY_SYMBOL[symbol]
      const krakenPair = KRAKEN_PAIRS[symbol]
      let own: Candle[] = []
      if (ownAsset) {
        try { own = await fetchOwnForexCandles(ownAsset, tfSeconds, limit) } catch { /* fresco indisponível */ }
      }
      if (own.length >= limit) {
        candles  = own
        provider = 'own'
      } else if (ownAsset || krakenPair) {
        // Completa o início do gráfico com Kraken enquanto as nossas acumulam
        let older: Candle[] = []
        if (krakenPair) {
          try { older = await fetchKrakenCandles(krakenPair, tfSeconds, limit) } catch { /* kraken fora */ }
        }
        if (older.length === 0 && own.length === 0) {
          candles  = await fetchTwelveDataCandles(symbol, tfSeconds, limit)
        } else {
          const cut = own.length > 0 ? own[0].time : Infinity
          candles  = [...older.filter(c => c.time < cut), ...own].slice(-limit)
          provider = own.length > 0 ? 'own' : 'kraken'
        }
      } else {
        candles = await fetchTwelveDataCandles(symbol, tfSeconds, limit)
      }
    } else {
      candles = await fetchYahooCandles(symbol, parseInt(interval), limit)
    }
    cache.set(cacheKey, { candles, ts: Date.now(), provider })
    return NextResponse.json({ candles })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'fetch failed' }, { status: 502 })
  }
}
