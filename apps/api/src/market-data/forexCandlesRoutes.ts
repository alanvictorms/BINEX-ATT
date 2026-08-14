import type { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'

// Velas próprias do forex (construídas pelo livePricePublisher a partir do mid
// da Kraken, 12 amostras/min). Servidas ao frontend como fonte primária do
// histórico dos pares LIVE — mesma fonte exata do preço que liquida operação.
// Base 1m no banco; timeframes maiores agregados aqui em JS (volume pequeno:
// máx ~10k linhas por request, cap abaixo).

const ALLOWED_ASSETS = new Set(['eur-usd', 'gbp-usd'])
const ALLOWED_TFS    = new Set([60, 300, 900, 1800, 3600, 14400, 86400])
const MAX_BASE_ROWS  = 10_080   // 7 dias de 1m — teto da retenção

export async function forexCandlesRoutes(app: FastifyInstance) {
  // GET /:asset/candles?tf=60&limit=300 — candles ASC, t = epoch UTC (início do bucket)
  app.get('/:asset/candles', async (req, reply) => {
    const { asset } = req.params as { asset: string }
    const q      = req.query as { tf?: string; limit?: string }
    const tf     = parseInt(q.tf ?? '60', 10)
    const limit  = Math.min(500, Math.max(1, parseInt(q.limit ?? '300', 10) || 300))

    if (!ALLOWED_ASSETS.has(asset)) return reply.status(400).send({ error: 'ASSET_INVALIDO' })
    if (!ALLOWED_TFS.has(tf))       return reply.status(400).send({ error: 'TF_INVALIDO' })

    const minutesNeeded = Math.min(MAX_BASE_ROWS, (tf / 60) * limit)
    const since = Math.floor(Date.now() / 1000) - minutesNeeded * 60

    const rows = await prisma.$queryRawUnsafe<Array<{ t: bigint; o: number; h: number; l: number; c: number }>>(
      `SELECT t, o, h, l, c FROM forex_candles
        WHERE asset_id = $1 AND t >= $2
        ORDER BY t ASC`,
      asset, since,
    )

    // Agrega 1m -> tf em JS (buckets alinhados em epoch)
    const buckets = new Map<number, { t: number; o: number; h: number; l: number; c: number }>()
    for (const r of rows) {
      const b = Math.floor(Number(r.t) / tf) * tf
      const k = buckets.get(b)
      if (!k) buckets.set(b, { t: b, o: r.o, h: r.h, l: r.l, c: r.c })
      else {
        if (r.h > k.h) k.h = r.h
        if (r.l < k.l) k.l = r.l
        k.c = r.c
      }
    }
    const candles = [...buckets.values()].sort((a, b) => a.t - b.t).slice(-limit)
    return { asset, tf, candles }
  })
}
