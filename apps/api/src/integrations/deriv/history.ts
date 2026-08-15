// Historico profundo sob demanda, direto da Deriv.
//
// A ideia: o Postgres guarda a janela recente (rapida, autoritativa, e a unica
// fonte possivel dos timeframes de 5s/15s, que a Deriv nao tem). Qualquer coisa
// mais antiga que isso vem da Deriv na hora, normalizada pelo fator CONGELADO
// do ativo (ver factors.ts) — que e o que garante que o mesmo candle antigo
// sempre devolva o mesmo preco.
//
// Regras de seguranca:
//   - Nunca lanca pro caller. Qualquer erro/timeout vira lista vazia, e a rota
//     simplesmente entrega o que o Postgres tinha. O grafico nao pode quebrar
//     porque um terceiro caiu.
//   - Resultado vai pro Redis com TTL longo: candle passado e imutavel.
//   - Desligavel por env (OTC_DERIV_HISTORY=false).

import { DerivClient } from './client.js'
import { derivSymbolFor, isDerivGranularity } from './symbols.js'
import { loadFactors } from './factors.js'
import { redis } from '../../redis.js'

export interface OhlcPoint { t: number; o: number; h: number; l: number; c: number }

const ENABLED   = process.env.OTC_DERIV_HISTORY !== 'false'
const TIMEOUT_MS = parseInt(process.env.OTC_DERIV_TIMEOUT_MS ?? '6000', 10)
const CACHE_TTL  = 60 * 60 * 24 * 7  // 7 dias

// Uma conexao por processo, reaproveitada entre requests: abrir WS custa ~1s e
// seria absurdo pagar isso a cada carregamento de grafico.
let client: DerivClient | null = null
let connecting: Promise<void> | null = null

async function ensureClient(): Promise<DerivClient> {
  if (!client) client = new DerivClient()
  if (!connecting) {
    connecting = client.connect().finally(() => { connecting = null })
  }
  await connecting
  return client
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('deriv: timeout')), ms)),
  ])
}

function round(v: number, decimals: number): number {
  const m = Math.pow(10, decimals)
  return Math.round(v * m) / m
}

/**
 * Candles anteriores a `before`, do mais antigo pro mais novo.
 * Devolve [] se desligado, sem mapeamento, sem fator congelado, ou se a Deriv
 * falhar — nunca lanca.
 */
export async function fetchDeepHistory(params: {
  otcSymbol: string
  tf: number
  before: Date
  limit: number
  decimals: number
}): Promise<OhlcPoint[]> {
  const { otcSymbol, tf, before, limit, decimals } = params
  if (!ENABLED || !isDerivGranularity(tf)) return []

  const derivSymbol = derivSymbolFor(otcSymbol)
  if (!derivSymbol) return []

  const end = Math.floor(before.getTime() / 1000)
  const cacheKey = `otc:deriv:hist:${otcSymbol}:${tf}:${end}:${limit}`

  try {
    const hit = await redis.get(cacheKey)
    if (hit) return JSON.parse(hit) as OhlcPoint[]
  } catch { /* cache e otimizacao, nao dependencia */ }

  try {
    // Sem fator congelado nao da pra normalizar de forma deterministica, e
    // devolver preco cru aqui criaria um degrau no meio do grafico. Melhor nada.
    const factors = await loadFactors()
    const frozen = factors[otcSymbol]
    if (!frozen || !(frozen.factor > 0)) return []

    const deriv = await withTimeout(ensureClient(), TIMEOUT_MS)
    const raw = await withTimeout(
      deriv.candles({
        symbol: derivSymbol,
        granularity: tf,
        start: end - limit * tf,
        end,
        count: limit,
      }),
      TIMEOUT_MS,
    )

    const out = raw
      .filter(c => c.epoch < end)
      .map(c => ({
        t: c.epoch,
        o: round(c.open  * frozen.factor, decimals),
        h: round(c.high  * frozen.factor, decimals),
        l: round(c.low   * frozen.factor, decimals),
        c: round(c.close * frozen.factor, decimals),
      }))

    if (out.length) {
      redis.set(cacheKey, JSON.stringify(out), 'EX', CACHE_TTL).catch(() => {})
    }
    return out
  } catch {
    // Deriv fora do ar, rate limit, timeout: o caller segue com o Postgres.
    return []
  }
}
