// Determinístico: mesma seed → mesma sequência.
// xmur3 (hash) + mulberry32 (PRNG) — baratos e estáveis entre processos.

export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededRng(seedStr: string): () => number {
  const hash = xmur3(seedStr)
  return mulberry32(hash())
}

// Box–Muller: Gaussiana(0,1) determinística a partir de duas uniformes.
export function gauss(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-9)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

// Passo do random walk para 1 segundo. Mean-reverte suavemente em torno do basePrice.
export function nextPrice(args: {
  currentPrice: number
  basePrice:    number
  volatility:   number   // 0..1, escala do movimento por segundo
  trend:        number   // -1..1, drift adicional
  seed:         string   // ex: `${assetId}:${epochSec}`
}): number {
  const { currentPrice, basePrice, volatility, trend, seed } = args
  const rng       = seededRng(seed)
  const shock     = gauss(rng) * volatility * currentPrice
  const driftBias = trend * volatility * currentPrice
  // mean-reversion fraco — impede o preço fugir muito do basePrice
  const reversion = (basePrice - currentPrice) * 0.001
  return currentPrice + shock + driftBias + reversion
}
