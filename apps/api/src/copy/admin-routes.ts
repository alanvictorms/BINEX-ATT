import type { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { createCopyTraderSchema, updateCopyTraderSchema, copyConfigSchema } from './schema.js'

// Registra a acao no admin_audit_log (admin_id = quem fez, via JWT verificado).
async function logAudit(
  adminId: string, action: string, targetId: string | null, before: unknown, after: unknown,
) {
  await prisma.$executeRaw`
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, before_data, after_data)
    VALUES (
      ${adminId}::uuid, ${action}, 'copy_trader', ${targetId}::uuid,
      ${JSON.stringify(before ?? null)}::jsonb, ${JSON.stringify(after ?? null)}::jsonb
    )
  `
}

// Endpoints de admin (prefixo /admin/copy). Requer auth + admin.
export async function copyAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)
  app.addHook('preHandler', app.requireAdmin)

  // ── Traders (CRUD) ──────────────────────────────────────────────────────────
  app.get('/traders', async () => ({
    traders: await prisma.copyTrader.findMany({ orderBy: { displayOrder: 'asc' } }),
  }))

  app.post('/traders', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const parsed = createCopyTraderSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }
    const trader = await prisma.copyTrader.create({ data: parsed.data })
    await logAudit(sub, 'copy_trader_create', trader.id, null, trader)
    return reply.status(201).send({ trader })
  })

  app.patch('/traders/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    const parsed = updateCopyTraderSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }
    const before = await prisma.copyTrader.findUnique({ where: { id } })
    if (!before) return reply.status(404).send({ error: 'NOT_FOUND' })
    const trader = await prisma.copyTrader.update({ where: { id }, data: parsed.data })
    await logAudit(sub, 'copy_trader_update', id, before, trader)
    return { trader }
  })

  app.delete('/traders/:id', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const { id } = req.params as { id: string }
    const before = await prisma.copyTrader.findUnique({ where: { id } })
    if (!before) return reply.status(404).send({ error: 'NOT_FOUND' })
    await prisma.copyTrader.delete({ where: { id } })
    await logAudit(sub, 'copy_trader_delete', id, before, null)
    return { ok: true }
  })

  // ── Config global (copyTradeEnabled) ─────────────────────────────────────────
  app.get('/config', async () => {
    const row = await prisma.appConfig.findUnique({ where: { key: 'copyTradeEnabled' } })
    const v = row?.value as unknown
    return { copyTradeEnabled: v === true || v === 'true' }
  })

  app.patch('/config', async (req, reply) => {
    const { sub } = req.user as { sub: string }
    const parsed = copyConfigSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    }
    const before = await prisma.appConfig.findUnique({ where: { key: 'copyTradeEnabled' } })
    const row = await prisma.appConfig.upsert({
      where:  { key: 'copyTradeEnabled' },
      create: { key: 'copyTradeEnabled', value: parsed.data.copyTradeEnabled },
      update: { value: parsed.data.copyTradeEnabled },
    })
    await logAudit(sub, 'copy_config_update', null, before?.value ?? null, row.value)
    return { copyTradeEnabled: parsed.data.copyTradeEnabled }
  })

  // ── KPIs do negocio ───────────────────────────────────────────────────────────
  // Lucro da casa = -(soma dos pnl liquidados). Receita de acesso = soma de price_paid.
  app.get('/stats', async () => {
    const [activeSubs, cancelledSubs, settledAgg, pendingCount, accessAgg, uniq] = await Promise.all([
      prisma.userCopyTrader.count({ where: { status: 'ACTIVE' } }),
      prisma.userCopyTrader.count({ where: { status: 'CANCELLED' } }),
      prisma.copyTradeOperation.aggregate({ where: { status: 'SETTLED' }, _sum: { pnl: true }, _count: true }),
      prisma.copyTradeOperation.count({ where: { status: 'PENDING' } }),
      prisma.userCopyTrader.aggregate({ _sum: { pricePaid: true } }),
      prisma.$queryRaw<{ c: number }[]>`SELECT count(DISTINCT user_id)::int AS c FROM user_copy_traders WHERE status = 'ACTIVE'`,
    ])
    const userPnl       = Number(settledAgg._sum.pnl ?? 0)
    const houseResult   = -userPnl                       // ganho da casa nas operacoes
    const accessRevenue = Number(accessAgg._sum.pricePaid ?? 0)
    return {
      activeSubscriptions:    activeSubs,
      cancelledSubscriptions: cancelledSubs,
      uniqueActiveUsers:      Number(uniq[0]?.c ?? 0),
      settledOps:             settledAgg._count,
      pendingOps:             pendingCount,
      userPnl,
      houseResult,
      accessRevenue,
      houseTotal:             Math.round((houseResult + accessRevenue) * 100) / 100,
    }
  })

  // ── Lista de assinaturas (quem copia / quem cancelou) ─────────────────────────
  app.get('/subscriptions', async (req) => {
    const q = req.query as { limit?: string; status?: string }
    const take = Math.min(parseInt(q.limit ?? '50', 10) || 50, 200)
    const where = q.status === 'ACTIVE' || q.status === 'CANCELLED' ? { status: q.status } : {}

    const subs = await prisma.userCopyTrader.findMany({ where, orderBy: { activatedAt: 'desc' }, take })
    if (subs.length === 0) return { subscriptions: [] }

    const userIds   = [...new Set(subs.map(s => s.userId))]
    const traderIds = [...new Set(subs.map(s => s.traderId))]
    const [profiles, traders, pnlGroups] = await Promise.all([
      prisma.profile.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      prisma.copyTrader.findMany({ where: { id: { in: traderIds } }, select: { id: true, name: true } }),
      prisma.copyTradeOperation.groupBy({
        by: ['userId', 'traderId'],
        where: { status: 'SETTLED', userId: { in: userIds }, traderId: { in: traderIds } },
        _sum: { pnl: true }, _count: true,
      }),
    ])
    const nameOf   = new Map(profiles.map(p => [p.id, p.name]))
    const traderOf = new Map(traders.map(t => [t.id, t.name]))
    const pnlOf    = new Map(pnlGroups.map(g => [`${g.userId}|${g.traderId}`, { pnl: Number(g._sum.pnl ?? 0), ops: g._count }]))

    return {
      subscriptions: subs.map(s => {
        const agg = pnlOf.get(`${s.userId}|${s.traderId}`)
        return {
          id:          s.id,
          userId:      s.userId,
          userName:    nameOf.get(s.userId) ?? '—',
          traderName:  traderOf.get(s.traderId) ?? '—',
          status:      s.status,
          pricePaid:   Number(s.pricePaid),
          activatedAt: s.activatedAt,
          settledOps:  agg?.ops ?? 0,
          accumulated: Math.round((agg?.pnl ?? 0) * 100) / 100,
        }
      }),
    }
  })
}
