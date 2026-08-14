import type { FastifyInstance } from 'fastify'
import {
  getTraders, getMy, copyTrader, cancelCopy, isCopyEnabled, CopyError,
} from './service.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Endpoints do usuario (prefixo /copy). Tudo autenticado.
export async function copyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /copy/traders — catalogo de traders ativos + flag "ja copiando".
  app.get('/traders', async (req) => {
    const { sub } = req.user as { sub: string }
    if (!(await isCopyEnabled())) return { enabled: false, traders: [] }
    return { enabled: true, traders: await getTraders(sub) }
  })

  // GET /copy/my — assinaturas ativas + resumo + historico das operacoes liquidadas.
  app.get('/my', async (req) => {
    const { sub } = req.user as { sub: string }
    const data = await getMy(sub)
    return { enabled: await isCopyEnabled(), ...data }
  })

  // POST /copy/:traderId/copy — copiar um trader (gratuito ou pago).
  app.post('/:traderId/copy', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { traderId } = req.params as { traderId: string }
    if (!UUID_RE.test(traderId)) return reply.status(404).send({ error: 'TRADER_NOT_FOUND' })
    if (!(await isCopyEnabled())) return reply.status(403).send({ error: 'COPY_DISABLED' })
    try {
      const r = await copyTrader(sub, traderId)
      return reply.status(201).send(r)
    } catch (err) {
      if (err instanceof CopyError) {
        const status = err.code === 'TRADER_NOT_FOUND' ? 404 : 400
        return reply.status(status).send({ error: err.code })
      }
      throw err
    }
  })

  // POST /copy/:traderId/cancel — cancelar copia (sempre permitido, mesmo desabilitado).
  app.post('/:traderId/cancel', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { traderId } = req.params as { traderId: string }
    if (!UUID_RE.test(traderId)) return reply.status(404).send({ error: 'TRADER_NOT_FOUND' })
    try {
      return await cancelCopy(sub, traderId)
    } catch (err) {
      if (err instanceof CopyError) return reply.status(400).send({ error: err.code })
      throw err
    }
  })
}
