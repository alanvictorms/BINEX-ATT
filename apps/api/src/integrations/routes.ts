import type { FastifyInstance } from 'fastify'
import { integrationOperationSchema, buildOperationMessage } from './schema.js'
import { createIntegrationOperation, getIntegrationOperation, IntegrationError } from './service.js'
import { verifyServiceRequest, ServiceAuthError } from './auth.js'

// Rotas de INTEGRACAO — chamadas server-to-server pelo backend do PulseHacker.
// Autenticadas por HMAC de servico (ver auth.ts), NUNCA por JWT de usuario.
// Prefixo: /integrations  (registrado em app.ts)

// Mapeia erros conhecidos para status HTTP. Retorna null se nao reconhecer.
function mapError(err: any): { status: number; body: Record<string, unknown> } | null {
  if (err instanceof ServiceAuthError) {
    return { status: 401, body: { error: err.code } }
  }
  if (err instanceof IntegrationError) {
    const map: Record<string, number> = {
      ASSET_NOT_FOUND:        404,
      ASSET_NOT_OTC:          422,
      ASSET_DISABLED:         422,
      MARKET_CLOSED:          422,
      LIVE_ASSETS_DISABLED:   422,
      AMOUNT_TOO_LARGE:       422,
      IDEMPOTENT_IN_PROGRESS: 409,
    }
    return { status: map[err.code] ?? 400, body: { error: err.code } }
  }
  const m = err?.message
  if (m === 'ACCOUNT_NOT_FOUND')    return { status: 404, body: { error: 'ACCOUNT_NOT_FOUND' } }
  if (m === 'INSUFFICIENT_BALANCE') return { status: 422, body: { error: 'INSUFFICIENT_BALANCE' } }
  if (m === 'PRICE_UNAVAILABLE')    return { status: 503, body: { error: 'PRICE_UNAVAILABLE' } }
  if (m === 'PRICE_DIVERGED')       return { status: 409, body: { error: 'PRICE_DIVERGED' } }
  if (m === 'NOT_FOUND')            return { status: 404, body: { error: 'NOT_FOUND' } }
  return null
}

export async function integrationRoutes(app: FastifyInstance) {
  // POST /integrations/operations — abrir trade em nome do lead (1-clique).
  // OTC por default; market:'LIVE' abre em ativo real (exige flag ligada).
  app.post('/operations', async (req, reply) => {
    const parsed = integrationOperationSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }

    try {
      // Assinatura cobre exatamente os campos validados (string canonica + timestamp).
      verifyServiceRequest(req.headers, buildOperationMessage(parsed.data))
    } catch (err) {
      const mapped = mapError(err)
      if (mapped) return reply.status(mapped.status).send(mapped.body)
      throw err
    }

    try {
      const { operation, idempotentReplay } = await createIntegrationOperation(parsed.data)
      return reply.status(idempotentReplay ? 200 : 201).send({ operation, idempotentReplay })
    } catch (err: any) {
      const mapped = mapError(err)
      if (mapped) return reply.status(mapped.status).send(mapped.body)
      req.log.error({ err: err?.message }, 'integration createOperation failed')
      throw err
    }
  })

  // GET /integrations/operations/:id?vertexUserId=... — status para polling do resultado
  app.get('/operations/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { vertexUserId } = req.query as { vertexUserId?: string }
    if (!vertexUserId) return reply.status(400).send({ error: 'VALIDATION_ERROR', details: 'vertexUserId required' })

    try {
      verifyServiceRequest(req.headers, ['GET', id, vertexUserId].join('|'))
    } catch (err) {
      const mapped = mapError(err)
      if (mapped) return reply.status(mapped.status).send(mapped.body)
      throw err
    }

    try {
      const operation = await getIntegrationOperation(vertexUserId, id)
      return reply.send({ operation })
    } catch (err: any) {
      const mapped = mapError(err)
      if (mapped) return reply.status(mapped.status).send(mapped.body)
      throw err
    }
  })
}
