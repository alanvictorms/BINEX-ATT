import type { FastifyInstance } from 'fastify'
import { createOperationSchema } from './schema.js'
import { createOperation, listOperations, getOperation } from './service.js'

export async function operationRoutes(app: FastifyInstance) {
  // POST /operations — abrir trade
  app.post('/', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = createOperationSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }

    const { sub } = req.user as { sub: string }
    try {
      const operation = await createOperation(sub, parsed.data)
      return reply.status(201).send({ operation })
    } catch (err: any) {
      if (err.message === 'ACCOUNT_NOT_FOUND')    return reply.status(404).send({ error: 'ACCOUNT_NOT_FOUND' })
      if (err.message === 'INSUFFICIENT_BALANCE') return reply.status(422).send({ error: 'INSUFFICIENT_BALANCE' })
      if (err.message === 'HEDGE_BLOCKED')        return reply.status(409).send({ error: 'HEDGE_BLOCKED', message: 'Voce ja tem uma operacao aberta em direcao oposta neste ativo. Aguarde ela encerrar.' })
      if (err.message === 'PRICE_UNAVAILABLE')    return reply.status(503).send({ error: 'PRICE_UNAVAILABLE', message: 'Engine de precos indisponivel, tente novamente em alguns segundos.' })
      if (err.message === 'PRICE_DIVERGED')       return reply.status(409).send({ error: 'PRICE_DIVERGED', message: 'Preco do cliente divergiu do servidor; recarregue a cotacao.' })
      throw err
    }
  })

  // GET /operations — listar operações
  app.get('/', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { accountId } = req.query as { accountId?: string }
    try {
      const operations = await listOperations(sub, accountId)
      return reply.send({ operations })
    } catch (err: any) {
      if (err.message === 'ACCOUNT_NOT_FOUND') return reply.status(404).send({ error: 'ACCOUNT_NOT_FOUND' })
      throw err
    }
  })

  // GET /operations/:id — detalhe de uma operação
  app.get('/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    try {
      const operation = await getOperation(sub, id)
      return reply.send({ operation })
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') return reply.status(404).send({ error: 'NOT_FOUND' })
      throw err
    }
  })
}
