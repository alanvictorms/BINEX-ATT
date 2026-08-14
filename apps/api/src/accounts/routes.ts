import type { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'

export async function accountRoutes(app: FastifyInstance) {
  // GET /accounts — contas do usuario com saldo
  app.get('/', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const accounts = await prisma.account.findMany({
      where:  { userId: sub },
      select: { id: true, type: true, balance: true, currency: true, createdAt: true },
    })
    return reply.send({ accounts })
  })

  // POST /accounts/demo/reset — resetar saldo demo
  app.post('/demo/reset', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const DEMO_BALANCE = parseFloat(process.env.DEMO_INITIAL_BALANCE ?? '10000')

    const account = await prisma.account.findUnique({
      where: { userId_type: { userId: sub, type: 'DEMO' } },
    })
    if (!account) return reply.status(404).send({ error: 'ACCOUNT_NOT_FOUND' })

    await prisma.$transaction([
      prisma.account.update({
        where: { id: account.id },
        data:  { balance: DEMO_BALANCE },
      }),
      prisma.transaction.create({
        data: {
          accountId:   account.id,
          type:        'DEMO_CREDIT',
          amount:      DEMO_BALANCE,
          description: 'Reset de saldo demo',
        },
      }),
    ])

    return reply.send({ ok: true, balance: DEMO_BALANCE })
  })

  // GET /accounts/:id/transactions — historico de transacoes
  app.get('/:id/transactions', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { id } = req.params as { id: string }

    const account = await prisma.account.findUnique({ where: { id } })
    if (!account || account.userId !== sub) return reply.status(404).send({ error: 'ACCOUNT_NOT_FOUND' })

    const transactions = await prisma.transaction.findMany({
      where:   { accountId: id },
      orderBy: { createdAt: 'desc' },
      take:    50,
    })
    return reply.send({ transactions })
  })
}
