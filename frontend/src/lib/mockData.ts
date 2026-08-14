export interface ActiveTrade {
  id: string
  assetId: string
  entryPrice: number
  entryTime: number
  expiryTime: number
  direction: 'CALL' | 'PUT'
  amount: number
  payout: number
}

export interface Asset {
  id: string
  symbol: string
  label: string
  type: 'OTC' | 'Forex' | 'Crypto'
  category: 'Moedas' | 'Cripto' | 'Matérias-Primas' | 'Ações'
  payout: number
  payout5min: number
  flag1: string
  flag2: string
  code1: string  // ISO 3166-1 alpha-2 for flagcdn.com
  code2: string
  price: number
  change24h: number
  decimals?: number  // override explicito de casas decimais (ex: OTC server-authoritative)
}

// Catalogo definitivo do MVP — 22 ativos.
// Fontes: 3 forex Yahoo (LIVE), 5 cripto Binance (LIVE), 14 OTC engine proprio (24/7).
// Ver ROADMAP em CLAUDE.md e marketSymbols.ts/otcClient.ts para fontes de cada um.
export const ASSETS: Asset[] = [
  // ── FOREX REAL (Yahoo) — operam so com mercado aberto seg-sex
  { id: 'eur-usd', symbol: 'EUR/USD', label: 'EUR/USD', type: 'Forex', category: 'Moedas', payout: 92, payout5min: 92, flag1: '🇪🇺', flag2: '🇺🇸', code1: 'eu', code2: 'us', price: 1.0854, change24h: 0.12 },
  { id: 'gbp-usd', symbol: 'GBP/USD', label: 'GBP/USD', type: 'Forex', category: 'Moedas', payout: 92, payout5min: 92, flag1: '🇬🇧', flag2: '🇺🇸', code1: 'gb', code2: 'us', price: 1.2734, change24h: 0.42 },

  // ── FOREX OTC (engine proprio) — 24/7, substitui o real fora de mercado
  { id: 'eur-usd-otc', symbol: 'EUR/USD', label: 'EUR/USD (OTC)', type: 'OTC', category: 'Moedas', payout: 85, payout5min: 85, flag1: '🇪🇺', flag2: '🇺🇸', code1: 'eu', code2: 'us', price: 1.0854, change24h: 0.12 },
  { id: 'gbp-usd-otc', symbol: 'GBP/USD', label: 'GBP/USD (OTC)', type: 'OTC', category: 'Moedas', payout: 85, payout5min: 85, flag1: '🇬🇧', flag2: '🇺🇸', code1: 'gb', code2: 'us', price: 1.2734, change24h: 0.42 },
  { id: 'usd-jpy-otc', symbol: 'USD/JPY', label: 'USD/JPY (OTC)', type: 'OTC', category: 'Moedas', payout: 85, payout5min: 85, flag1: '🇺🇸', flag2: '🇯🇵', code1: 'us', code2: 'jp', price: 158.92, change24h: -0.18 },
  { id: 'usd-brl-otc', symbol: 'USD/BRL', label: 'USD/BRL (OTC)', type: 'OTC', category: 'Moedas', payout: 85, payout5min: 85, flag1: '🇺🇸', flag2: '🇧🇷', code1: 'us', code2: 'br', price: 5.20, change24h: -0.05 },
  { id: 'eur-jpy-otc', symbol: 'EUR/JPY', label: 'EUR/JPY (OTC)', type: 'OTC', category: 'Moedas', payout: 87, payout5min: 87, flag1: '🇪🇺', flag2: '🇯🇵', code1: 'eu', code2: 'jp', price: 170.54, change24h: 0.05 },
  { id: 'aud-cad-otc', symbol: 'AUD/CAD', label: 'AUD/CAD (OTC)', type: 'OTC', category: 'Moedas', payout: 87, payout5min: 87, flag1: '🇦🇺', flag2: '🇨🇦', code1: 'au', code2: 'ca', price: 0.918, change24h: 0.10 },
  { id: 'nzd-usd-otc', symbol: 'NZD/USD', label: 'NZD/USD (OTC)', type: 'OTC', category: 'Moedas', payout: 87, payout5min: 87, flag1: '🇳🇿', flag2: '🇺🇸', code1: 'nz', code2: 'us', price: 0.595, change24h: 0.21 },
  { id: 'usd-chf-otc', symbol: 'USD/CHF', label: 'USD/CHF (OTC)', type: 'OTC', category: 'Moedas', payout: 85, payout5min: 85, flag1: '🇺🇸', flag2: '🇨🇭', code1: 'us', code2: 'ch', price: 0.8971, change24h: -0.31 },

  // ── COMMODITIES OTC
  { id: 'xau-usd-otc', symbol: 'XAU/USD', label: 'Ouro (OTC)',  type: 'OTC', category: 'Matérias-Primas', payout: 87, payout5min: 87, flag1: '🥇', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 2680.50, change24h: 0.75 },
  { id: 'xag-usd-otc', symbol: 'XAG/USD', label: 'Prata (OTC)', type: 'OTC', category: 'Matérias-Primas', payout: 85, payout5min: 85, flag1: '🥈', flag2: '🇺🇸', code1: 'us', code2: 'us', price: 31.40,   change24h: 2.24 },

  // ── CRIPTO OTC (engine proprio) — 24/7, sintetico (NAO e o feed Binance real)
  { id: 'btc-usd-otc', symbol: 'BTC/USD', label: 'Bitcoin (OTC)',  type: 'OTC', category: 'Cripto', payout: 85, payout5min: 85, flag1: '₿', flag2: '🇺🇸', code1: 'crypto:btc', code2: 'us', price: 65000,  change24h: 0, decimals: 2 },
  { id: 'eth-usd-otc', symbol: 'ETH/USD', label: 'Ethereum (OTC)', type: 'OTC', category: 'Cripto', payout: 85, payout5min: 85, flag1: 'Ξ', flag2: '🇺🇸', code1: 'crypto:eth', code2: 'us', price: 1815,   change24h: 0, decimals: 2 },
  { id: 'sol-usd-otc', symbol: 'SOL/USD', label: 'Solana (OTC)',   type: 'OTC', category: 'Cripto', payout: 85, payout5min: 85, flag1: '◎', flag2: '🇺🇸', code1: 'crypto:sol', code2: 'us', price: 73,     change24h: 0, decimals: 3 },
  { id: 'xrp-usd-otc', symbol: 'XRP/USD', label: 'Ripple (OTC)',   type: 'OTC', category: 'Cripto', payout: 85, payout5min: 85, flag1: '◉', flag2: '🇺🇸', code1: 'crypto:xrp', code2: 'us', price: 1.24,   change24h: 0, decimals: 5 },

  // ── CRIPTO REAL (Binance) — feed ao vivo 24/7
  { id: 'btc', symbol: 'BTC/USD', label: 'Bitcoin',  type: 'Crypto', category: 'Cripto', payout: 88, payout5min: 88, flag1: '₿', flag2: '🇺🇸', code1: 'crypto:btc', code2: 'us', price: 67420,   change24h: 0.49 },
  { id: 'eth', symbol: 'ETH/USD', label: 'Ethereum', type: 'Crypto', category: 'Cripto', payout: 88, payout5min: 88, flag1: 'Ξ', flag2: '🇺🇸', code1: 'crypto:eth', code2: 'us', price: 3521,    change24h: -1.12 },
  { id: 'sol', symbol: 'SOL/USD', label: 'Solana',   type: 'Crypto', category: 'Cripto', payout: 85, payout5min: 85, flag1: '◎', flag2: '🇺🇸', code1: 'crypto:sol', code2: 'us', price: 172.40,  change24h: 4.25 },
  { id: 'xrp', symbol: 'XRP/USD', label: 'Ripple',   type: 'Crypto', category: 'Cripto', payout: 85, payout5min: 85, flag1: '◉', flag2: '🇺🇸', code1: 'crypto:xrp', code2: 'us', price: 0.5123,  change24h: 7.50 },
  { id: 'bnb', symbol: 'BNB/USD', label: 'BNB',      type: 'Crypto', category: 'Cripto', payout: 85, payout5min: 85, flag1: '🪙', flag2: '🇺🇸', code1: 'crypto:bnb', code2: 'us', price: 612.30,  change24h: -0.11 },
]

// Favoritos default — exibe inicialmente. EUR/USD real + USD/BRL OTC + BTC sao os
// 3 ativos "porta de entrada" pra usuario novo.
export const DEFAULT_FAVORITES = ['eur-usd', 'usd-brl-otc', 'btc', 'gbp-usd', 'eth', 'eur-usd-otc', 'usd-jpy-otc']

export function getAssetDecimals(asset: Asset): number {
  if (asset.decimals != null)                return asset.decimals  // override (ex: OTC backend)
  if (asset.category === 'Cripto')           return asset.price < 1 ? 4 : 2
  if (asset.category === 'Ações')            return 2
  if (asset.category === 'Matérias-Primas')  return 2
  // Moedas / Forex
  if (asset.symbol.includes('JPY'))          return 3
  if (asset.price >= 20)                     return 2  // USD/EGP, USD/INR, USD/DZD, USD/COP, USD/ARS…
  if (asset.price >= 5)                      return 3  // USD/BRL, USD/MXN
  return 5                                             // EUR/USD, GBP/USD, AUD/USD…
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

const BRT_OFFSET = -3 * 3600 // UTC-3 (Horário de Brasília)

function hashSeed(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h >>> 0
}

function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
}

// Single deterministic value in [-1, 1] from a seed integer
function randFromSeed(seed: number): number {
  let s = (seed >>> 0) || 1
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5
  return (s >>> 0) / 0xFFFFFFFF * 2 - 1
}

// Value noise: smoothly interpolates between random targets at period boundaries.
// Ensures price continuity (no jumps) while producing realistic trend-like movement.
function valueNoise(periodSec: number, t: number, seed: number): number {
  const idx  = Math.floor(t / periodSec)
  const frac = (t % periodSec) / periodSec
  const v0   = randFromSeed(seed ^ hashSeed(String(idx)))
  const v1   = randFromSeed(seed ^ hashSeed(String(idx + 1)))
  // Smoothstep — removes derivative discontinuities at period edges
  const s    = frac * frac * (3 - 2 * frac)
  return v0 * (1 - s) + v1 * s
}

// OTC price engine v2 — fractal value noise.
// Replaces sine waves with realistic-looking trend phases that have momentum,
// pullbacks, and volatility clustering. Each asset gets unique behavior via assetSeed.
export function getOTCPrice(assetId: string, timestampSec: number, basePrice: number): number {
  const seed = hashSeed(assetId)
  const t    = timestampSec
  // Amplitudes calibradas para OTC estilo Quotex:
  // Mini-tendências de 3–8 candles com reversões frequentes.
  // Componentes de curto prazo (5m, 15m) dominam o visual — parecido com o que
  // um trader vê no 1m: mercado "vivo" sem tendência direcional forte.
  const move =
    valueNoise(14400, t, seed ^ 0xA1B2C3D4) * 0.008 +  // 4h macro (sutil — só define viés geral)
    valueNoise(3600,  t, seed ^ 0xB2C3D4E5) * 0.006 +  // 1h sessão
    valueNoise(900,   t, seed ^ 0xC3D4E5F6) * 0.005 +  // 15m momentum (mini-runs de 8–12 candles)
    valueNoise(300,   t, seed ^ 0xD4E5F6A7) * 0.004 +  // 5m flow (mini-runs de 3–6 candles) ← dominante
    valueNoise(120,   t, seed ^ 0xE1F2A3B4) * 0.003 +  // 2m oscilação rápida
    valueNoise(60,    t, seed ^ 0xE5F6A7B8) * 0.0020 + // 1m tick individual
    valueNoise(15,    t, seed ^ 0xF6A7B8C9) * 0.0008 + // 15s intra-candle
    valueNoise(5,     t, seed ^ 0xA7B8C9DA) * 0.0003   // 5s micro
  return Math.max(basePrice * (1 + move), basePrice * 0.001)
}

export function generateMockCandles(basePrice = 158.92, count = 120, interval = 60, seedKey = ''): Candle[] {
  const candles: Candle[] = []
  const now = Math.floor(Date.now() / 1000) + BRT_OFFSET
  const alignedNow = Math.floor(now / interval) * interval

  // Extract assetId from seedKey (format: "assetId:interval") — falls back to random walk if absent
  const assetId = seedKey.includes(':') ? seedKey.split(':')[0] : ''

  if (!assetId) {
    // Fallback: seeded random walk (non-OTC assets without a seedKey)
    const rng = seedKey ? makeRng(hashSeed(seedKey)) : Math.random.bind(Math)
    let price = basePrice * (1 + (rng() - 0.5) * 0.02)
    let trend = (rng() - 0.5) * 0.3
    let trendAge = 0
    const vol = basePrice * 0.0008
    for (let i = count; i >= 1; i--) {
      trendAge++
      if (trendAge > 8 + Math.floor(rng() * 12)) { trend = (rng() - 0.5) * 0.4; trendAge = 0 }
      trend += (basePrice - price) / basePrice * 0.15
      const open = price
      let lo = open, hi = open
      for (let t = 0; t < 8; t++) {
        price += trend * vol + (rng() - 0.5) * vol * 1.5
        if (price < lo) lo = price; if (price > hi) hi = price
      }
      const close = price
      const wicks = vol * (0.3 + rng() * 0.5)
      candles.push({ time: alignedNow - i * interval, open: parseFloat(open.toFixed(5)), high: parseFloat((hi + wicks).toFixed(5)), low: parseFloat((lo - wicks).toFixed(5)), close: parseFloat(close.toFixed(5)) })
    }
    return candles
  }

  // OTC: sample getOTCPrice at sub-intervals to build OHLC.
  // 20 samples per candle gives accurate high/low without being too expensive.
  const SAMPLES = 20
  const step = Math.max(1, Math.floor(interval / SAMPLES))
  const fmt = (v: number) => parseFloat(v.toFixed(5))

  for (let i = count; i >= 1; i--) {
    const candleStart = alignedNow - i * interval
    let hi = -Infinity, lo = Infinity
    let open = 0, close = 0
    for (let j = 0; j <= SAMPLES; j++) {
      const s = getOTCPrice(assetId, candleStart + j * step, basePrice)
      if (j === 0)       open  = s
      if (j === SAMPLES) close = s
      if (s > hi) hi = s
      if (s < lo) lo = s
    }
    // Wicks proporcionais ao corpo — estilo Quotex OTC: discretos, não exagerados.
    const bodySize  = Math.abs(close - open)
    const wickScale = (randFromSeed(hashSeed(assetId) ^ (candleStart >>> 2)) + 1) / 2  // [0, 1]
    const wickExtra = bodySize * (0.08 + wickScale * 0.18)  // 8–26% do corpo
    candles.push({
      time:  candleStart,
      open:  fmt(open),
      high:  fmt(hi  + wickExtra),
      low:   fmt(lo  - wickExtra),
      close: fmt(close),
    })
  }

  return candles
}

export interface OpenTrade {
  id: string
  asset: Asset
  direction: 'CALL' | 'PUT'
  amount: number
  profit: number
  expiryTime: number  // Unix timestamp (seconds) when the trade expires
  entryPrice: number
  duration?: number   // total duration in seconds (used for early exit decay)
}

export const MOCK_OPEN_TRADES: OpenTrade[] = []
