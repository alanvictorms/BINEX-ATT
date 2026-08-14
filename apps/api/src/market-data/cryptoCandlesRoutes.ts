import type { FastifyInstance } from 'fastify'

// Velas dos pares cripto LIVE, no MESMO contrato do forexCandlesRoutes:
// GET /:asset/candles?tf=60&limit=300 -> { asset, tf, candles: [{t,o,h,l,c}] }.
//
// Implementacao: proxy das klines PUBLICAS da Binance (data-api.binance.vision,
// sem chave/cota) em vez de construir velas proprias como o forex. Motivo: a
// Binance ja entrega OHLC oficial em todos os timeframes — velas proprias so
// existem no forex porque a Kraken nao da klines no formato que precisamos.
// Zero tabela nova, zero backfill/retencao, e a MESMA fonte que alimenta o
// preco de entrada/saida (live_prices via publisher).
//
// Protecao de upstream: cache em memoria por (asset,tf) com TTL curto — o
// PulseHacker/frontend podem marretar o endpoint que a Binance ve no maximo
// ~7 req/s no pior caso (35 chaves / 5s), folga enorme vs 6000 weight/min.
// Upstream fora do ar ou 429/418: serve o cache mesmo vencido (stale) e respeita
// Retry-After antes de tentar de novo.

const BINANCE_SYMBOL: Record<string, string> = {
  btc: 'BTCUSDT',
  eth: 'ETHUSDT',
  sol: 'SOLUSDT',
  xrp: 'XRPUSDT',
  bnb: 'BNBUSDT',
}

// tf em segundos -> intervalo nativo da Binance (mesmos tfs do forex).
const BINANCE_INTERVAL: Record<number, string> = {
  60: '1m', 300: '5m', 900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d',
}

const CACHE_TTL_MS = 5_000

type Candle = { t: number; o: number; h: number; l: number; c: number }
const cache = new Map<string, { at: number; candles: Candle[] }>()
let binanceCooldownUntil = 0   // 429/418: nao bater no upstream ate aqui

async function fetchBinanceKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  const res = await fetch(url, { signal: AbortSignal.timeout(4_000) })

  if (res.status === 429 || res.status === 418) {
    const retryAfterS = parseInt(res.headers.get('retry-after') ?? '60', 10) || 60
    binanceCooldownUntil = Date.now() + retryAfterS * 1000
    throw new Error(`binance klines: rate limited (${res.status}), cooldown ${retryAfterS}s`)
  }
  if (!res.ok) throw new Error(`binance klines: HTTP ${res.status}`)

  // Kline: [openTimeMs, open, high, low, close, volume, ...] — t vira epoch-segundos.
  const raw = (await res.json()) as unknown[][]
  const candles: Candle[] = []
  for (const k of raw) {
    const t = Math.floor(Number(k[0]) / 1000)
    const o = parseFloat(String(k[1])), h = parseFloat(String(k[2]))
    const l = parseFloat(String(k[3])), c = parseFloat(String(k[4]))
    if (![t, o, h, l, c].every(Number.isFinite) || c <= 0) continue
    candles.push({ t, o, h, l, c })
  }
  return candles
}

export async function cryptoCandlesRoutes(app: FastifyInstance) {
  // GET /:asset/candles?tf=60&limit=300 — candles ASC, t = epoch UTC (início do bucket)
  app.get('/:asset/candles', async (req, reply) => {
    const { asset } = req.params as { asset: string }
    const q     = req.query as { tf?: string; limit?: string }
    const tf    = parseInt(q.tf ?? '60', 10)
    const limit = Math.min(500, Math.max(1, parseInt(q.limit ?? '300', 10) || 300))

    const symbol   = BINANCE_SYMBOL[asset]
    const interval = BINANCE_INTERVAL[tf]
    if (!symbol)   return reply.status(400).send({ error: 'ASSET_INVALIDO' })
    if (!interval) return reply.status(400).send({ error: 'TF_INVALIDO' })

    // Cache por (asset,tf) no limite maximo (500): um unico fetch serve qualquer
    // limit menor com slice — evita uma entrada de cache por combinacao de limit.
    const key = `${asset}:${tf}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { asset, tf, candles: hit.candles.slice(-limit) }
    }

    if (Date.now() < binanceCooldownUntil) {
      if (hit) return { asset, tf, candles: hit.candles.slice(-limit) }  // stale > nada
      return reply.status(503).send({ error: 'UPSTREAM_UNAVAILABLE' })
    }

    try {
      const candles = await fetchBinanceKlines(symbol, interval, 500)
      cache.set(key, { at: Date.now(), candles })
      return { asset, tf, candles: candles.slice(-limit) }
    } catch (err: any) {
      console.error('[crypto-candles]', err?.message ?? err)
      if (hit) return { asset, tf, candles: hit.candles.slice(-limit) }  // stale > nada
      return reply.status(503).send({ error: 'UPSTREAM_UNAVAILABLE' })
    }
  })
}
