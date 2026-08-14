import type { FastifyInstance } from 'fastify'
import { createOtcAssetSchema, updateOtcAssetSchema } from './schema.js'
import {
  listOtcAssets, getOtcAsset, createOtcAsset,
  updateOtcAsset, deleteOtcAsset, toggleOtcAsset,
} from './service.js'
import { redis, KEYS } from '../../redis.js'
import { prisma } from '../../prisma.js'
import { isOtcSessionOpen } from './session.js'

export async function otcAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)
  app.addHook('preHandler', app.requireAdmin)

  app.get('/', async () => ({ assets: await listOtcAssets() }))

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try { return { asset: await getOtcAsset(id) } }
    catch { return reply.status(404).send({ error: 'NOT_FOUND' }) }
  })

  app.post('/', async (req, reply) => {
    const parsed = createOtcAssetSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    try {
      const asset = await createOtcAsset(parsed.data)
      return reply.status(201).send({ asset })
    } catch (err: any) {
      if (err.message === 'SYMBOL_ALREADY_EXISTS') return reply.status(409).send({ error: 'SYMBOL_ALREADY_EXISTS' })
      throw err
    }
  })

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = updateOtcAssetSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    try { return { asset: await updateOtcAsset(id, parsed.data) } }
    catch { return reply.status(404).send({ error: 'NOT_FOUND' }) }
  })

  app.post('/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string }
    try { return { asset: await toggleOtcAsset(id) } }
    catch { return reply.status(404).send({ error: 'NOT_FOUND' }) }
  })

  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try { return await deleteOtcAsset(id) }
    catch { return reply.status(404).send({ error: 'NOT_FOUND' }) }
  })
}

export async function otcPublicRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const assets = await listOtcAssets()
    const now = new Date()
    return {
      assets: assets
        .filter(a => a.status === 'ACTIVE')
        .map(a => ({
          id: a.id, symbol: a.symbol, name: a.name,
          payout: a.payout, decimals: a.decimals,
          // Janela de negociação (HH:MM UTC). null nos dois = 24 horas.
          // O front usa pra mostrar "Fechado · abre HH:MM" antes de o cliente
          // clicar; quem decide de verdade é o place_trade.
          sessionStartUtc: a.sessionStartUtc,
          sessionEndUtc:   a.sessionEndUtc,
          open: isOtcSessionOpen(a.sessionStartUtc, a.sessionEndUtc, now),
        })),
    }
  })

  // Preço atual (server-authoritative, lido do Redis)
  app.get('/:symbol/price', async (req, reply) => {
    const { symbol } = req.params as { symbol: string }
    const cached = await redis.get(KEYS.price(symbol))
    if (!cached) return reply.status(404).send({ error: 'NO_PRICE' })
    return { symbol, price: Number(cached), t: Math.floor(Date.now() / 1000) }
  })

  // Historico de candles — Redis (hot) com fallback Postgres (cold).
  //
  // Estrategia: so usa Redis se tiver pelo menos limit/2 candles. Senao, vai pro
  // Postgres (autoritativo). Evita o cenario em que Redis esta esparso (engine
  // com problema ou recem-restartado) e o chart recebe so 5-10 candles em vez
  // dos 300 que o Postgres tem.
  app.get('/:symbol/candles', async (req, reply) => {
    const { symbol } = req.params as { symbol: string }
    const q = req.query as { tf?: string; limit?: string }
    const tf    = parseInt(q.tf    ?? '60', 10)
    const limit = Math.min(parseInt(q.limit ?? '200', 10), 500)
    if (![5, 15, 60, 300].includes(tf)) return reply.status(400).send({ error: 'INVALID_TF' })

    const MIN_REDIS_COVERAGE = Math.ceil(limit / 2)
    const raw = await redis.zrevrange(KEYS.candleBuffer(symbol, tf), 0, limit - 1)
    if (raw.length >= MIN_REDIS_COVERAGE) {
      return { symbol, tf, candles: raw.map(s => JSON.parse(s)).reverse() }
    }

    // Redis esparso/vazio -> Postgres autoritativo
    const asset = await prisma.otcAsset.findUnique({ where: { symbol } })
    if (!asset) return reply.status(404).send({ error: 'ASSET_NOT_FOUND' })
    const rows = await prisma.otcCandle.findMany({
      where:   { assetId: asset.id, timeframe: tf },
      orderBy: { openTime: 'desc' },
      take:    limit,
    })
    const candles = rows.reverse().map(r => ({
      t: Math.floor(r.openTime.getTime() / 1000),
      o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close),
    }))
    return { symbol, tf, candles }
  })
}
