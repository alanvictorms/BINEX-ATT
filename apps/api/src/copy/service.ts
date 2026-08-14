// Copy Trading — modulo ISOLADO.
//
// Regras-chave (ver plano):
//  - Opera SOMENTE na conta REAL do usuario (type='REAL'). DEMO nunca e lida/escrita.
//  - Tabelas proprias, SEM FK para profiles/accounts. NUNCA toca a tabela `operations`
//    (rollover/ranking/estatisticas ficam intactos).
//  - Toda mudanca de saldo e ATOMICA via CTE unica (SELECT ... FOR UPDATE + UPDATE +
//    INSERT transacao), respeitando a constraint CHECK (balance >= 0) em accounts.
//
// Distribuicao de um ciclo: 5 operacoes, 2 WIN / 3 LOSS. A 1a e sempre WIN (gancho).
// Valor de cada op = 10% do saldo REAL no inicio do ciclo (fixo para as 5).
// Resultado liquido de um ciclo ~= -10% da banca (2x +10% - 3x 10%).

import { prisma } from '../prisma.js'

// ─── Constantes do ciclo ──────────────────────────────────────────────────────
export const CYCLE_OPS          = 5
export const STAKE_PCT          = 0.10
const FIRST_OP_DELAY_MS         = 1  * 60_000          // 1a op: +1min
const OP_INTERVAL_MS            = 30 * 60_000          // demais: a cada +30min
export const CYCLE_DURATION_MS  = FIRST_OP_DELAY_MS + (CYCLE_OPS - 1) * OP_INTERVAL_MS // ~121min
const RESTART_DELAY_MS          = 24 * 60 * 60_000     // reinicio 24h apos o fim do ciclo

// ─── Helpers puros (testaveis sem banco) ───────────────────────────────────────

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 1a op SEMPRE WIN; as 4 restantes = 1 WIN + 3 LOSS embaralhadas => total 2 WIN / 3 LOSS.
export function planCycleResults(): ('WIN' | 'LOSS')[] {
  return ['WIN', ...shuffle<'WIN' | 'LOSS'>(['WIN', 'LOSS', 'LOSS', 'LOSS'])]
}

// scheduledAt[i] = start + 1min + i*30min  ->  +1, +31, +61, +91, +121 min
export function buildCycleSchedule(start: Date): Date[] {
  return Array.from({ length: CYCLE_OPS }, (_, i) =>
    new Date(start.getTime() + FIRST_OP_DELAY_MS + i * OP_INTERVAL_MS),
  )
}

export function computeNextCycleAt(start: Date): Date {
  return new Date(start.getTime() + CYCLE_DURATION_MS + RESTART_DELAY_MS)
}

// ─── Config global ─────────────────────────────────────────────────────────────

export async function isCopyEnabled(): Promise<boolean> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'copyTradeEnabled' } })
  if (!row) return false
  const v = row.value as unknown
  return v === true || v === 'true'
}

// ─── Geracao de ciclo ──────────────────────────────────────────────────────────

// Insere as 5 ops PENDING do ciclo (se stake>0) e (re)agenda o nextCycleAt da assinatura.
// Roda dentro de uma transacao para nao deixar estado parcial.
async function insertCycle(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  args: { subId: string; userId: string; traderId: string; balance: number; cycleStart: Date },
): Promise<{ stake: number; opsCreated: number }> {
  const stake       = roundMoney(args.balance * STAKE_PCT)
  const nextCycleAt = computeNextCycleAt(args.cycleStart)
  let opsCreated = 0

  // Saldo zerado/insuficiente: NAO cria ciclo de R$0 — apenas reagenda.
  if (stake > 0) {
    const results  = planCycleResults()
    const schedule = buildCycleSchedule(args.cycleStart)
    await tx.copyTradeOperation.createMany({
      data: results.map((result, i) => ({
        userId:      args.userId,
        traderId:    args.traderId,
        result,
        amount:      stake,
        status:      'PENDING',
        scheduledAt: schedule[i],
      })),
    })
    opsCreated = results.length
  }

  await tx.userCopyTrader.update({ where: { id: args.subId }, data: { nextCycleAt } })
  return { stake, opsCreated }
}

// Reinicio recorrente (chamado pelo worker apos o claim atomico). Recalcula 10% do
// saldo REAL ATUAL. Saldo zerado -> so reagenda (sem ops).
export async function generateCycleForSubscription(
  subId: string, userId: string, traderId: string,
): Promise<{ stake: number; opsCreated: number }> {
  const acct    = await prisma.account.findUnique({
    where:  { userId_type: { userId, type: 'REAL' } },
    select: { balance: true },
  })
  const balance = Number(acct?.balance ?? 0)
  return prisma.$transaction((tx) =>
    insertCycle(tx, { subId, userId, traderId, balance, cycleStart: new Date() }),
  )
}

// ─── Copiar trader (gratuito / pago) ───────────────────────────────────────────

export class CopyError extends Error {
  constructor(public code: string) { super(code) }
}

export async function copyTrader(userId: string, traderId: string) {
  const trader = await prisma.copyTrader.findUnique({ where: { id: traderId } })
  if (!trader || !trader.active) throw new CopyError('TRADER_NOT_FOUND')

  const already = await prisma.userCopyTrader.findFirst({
    where: { userId, traderId, status: 'ACTIVE' }, select: { id: true },
  })
  if (already) throw new CopyError('ALREADY_COPYING')

  const price = Number(trader.accessPrice)
  const isPaid = trader.paid && price > 0

  try {
    return await prisma.$transaction(async (tx) => {
      let subId: string
      let cycleBalance: number

      if (isPaid) {
        // Compra ATOMICA: valida saldo + debita + lanca COPY_PURCHASE + cria assinatura,
        // tudo numa unica query (CTE). Se saldo insuficiente, nada e escrito.
        const desc = `Compra de Copy Trader - ${trader.name}`
        const rows = await tx.$queryRaw<{ sub_id: string | null; new_balance: string | null }[]>`
          WITH acct AS (
            SELECT id, balance FROM accounts
            WHERE user_id = ${userId}::uuid AND type = 'REAL'
            FOR UPDATE
          ),
          upd AS (
            UPDATE accounts SET balance = balance - ${price}::numeric
            WHERE id IN (SELECT id FROM acct WHERE balance >= ${price}::numeric)
            RETURNING id, balance
          ),
          txn AS (
            INSERT INTO transactions (account_id, type, amount, description)
            SELECT id, 'COPY_PURCHASE', ${-price}::numeric, ${desc} FROM upd
            RETURNING id
          ),
          sub AS (
            INSERT INTO user_copy_traders (user_id, trader_id, price_paid, status)
            SELECT ${userId}::uuid, ${traderId}::uuid, ${price}::numeric, 'ACTIVE'
            WHERE EXISTS (SELECT 1 FROM upd)
            RETURNING id
          )
          SELECT (SELECT id FROM sub) AS sub_id, (SELECT balance FROM upd) AS new_balance
        `
        const row = rows[0]
        if (!row || !row.sub_id) throw new CopyError('INSUFFICIENT_BALANCE')
        subId        = row.sub_id
        cycleBalance = Number(row.new_balance)
      } else {
        // Gratuito: exige saldo REAL > 0, mas NAO debita.
        const acct = await tx.account.findUnique({
          where:  { userId_type: { userId, type: 'REAL' } },
          select: { balance: true },
        })
        const balance = Number(acct?.balance ?? 0)
        if (balance <= 0) throw new CopyError('NO_BALANCE')
        const sub = await tx.userCopyTrader.create({
          data: { userId, traderId, pricePaid: 0, status: 'ACTIVE' },
        })
        subId        = sub.id
        cycleBalance = balance
      }

      // 1o ciclo
      await insertCycle(tx, { subId, userId, traderId, balance: cycleBalance, cycleStart: new Date() })
      return { ok: true, subId }
    })
  } catch (err: any) {
    if (err instanceof CopyError) throw err
    // Corrida na unica assinatura ACTIVE (indice parcial unico) -> ALREADY_COPYING.
    if (err?.code === 'P2002' || err?.code === '23505' ||
        String(err?.message ?? '').includes('user_copy_traders_active_uniq')) {
      throw new CopyError('ALREADY_COPYING')
    }
    throw err
  }
}

// ─── Liquidacao atomica de UMA operacao (idempotente) ──────────────────────────
// Trava a conta REAL (FOR UPDATE) e aplica o resultado numa unica query:
//  WIN  -> +amount (10% da banca)
//  LOSS -> -LEAST(amount, saldo); saldo = GREATEST(0, saldo - amount) (nunca negativo)
// So age se a op ainda estiver PENDING -> rodar 2x nao duplica saldo.
export async function settleOperation(
  opId: string,
): Promise<{ pnl: number; newBalance: number } | null> {
  const rows = await prisma.$queryRaw<{ op_id: string; pnl: string; new_balance: string }[]>`
    WITH op AS (
      SELECT id, user_id, trader_id, result, amount
      FROM copy_trade_operations
      WHERE id = ${opId}::uuid AND status = 'PENDING'
    ),
    acct AS (
      SELECT a.id, a.balance
      FROM accounts a JOIN op ON a.user_id = op.user_id AND a.type = 'REAL'
      FOR UPDATE
    ),
    calc AS (
      SELECT
        op.id AS op_id, op.trader_id, op.result, op.amount,
        acct.id AS account_id, acct.balance,
        CASE WHEN op.result = 'WIN' THEN op.amount
             ELSE -LEAST(op.amount, acct.balance) END AS pnl,
        CASE WHEN op.result = 'WIN' THEN acct.balance + op.amount
             ELSE GREATEST(0, acct.balance - op.amount) END AS new_balance
      FROM op JOIN acct ON true
    ),
    upd_op AS (
      UPDATE copy_trade_operations o
      SET status = 'SETTLED', settled_at = now(), pnl = calc.pnl
      FROM calc
      WHERE o.id = calc.op_id AND o.status = 'PENDING'
      RETURNING o.id, o.trader_id, calc.pnl AS pnl, calc.account_id AS account_id,
                calc.new_balance AS new_balance, calc.result AS result
    ),
    upd_acct AS (
      UPDATE accounts a SET balance = u.new_balance
      FROM upd_op u WHERE a.id = u.account_id
      RETURNING a.id
    ),
    txn AS (
      INSERT INTO transactions (account_id, type, amount, description)
      SELECT u.account_id, 'COPY_RESULT', u.pnl,
             'Copy Trade - ' || t.name ||
             CASE WHEN u.result = 'WIN' THEN ' (Ganho)' ELSE ' (Perda)' END
      FROM upd_op u JOIN copy_traders t ON t.id = u.trader_id
      RETURNING id
    )
    SELECT u.id AS op_id, u.pnl, u.new_balance FROM upd_op u
  `
  const row = rows[0]
  if (!row) return null   // ja liquidada, cancelada, ou sem conta REAL
  return { pnl: Number(row.pnl), newBalance: Number(row.new_balance) }
}

// ─── Cancelar copia ────────────────────────────────────────────────────────────
// Assinatura -> CANCELLED e ops PENDING -> CANCELLED (worker para de liquida-las).
// Sem reembolso. Operacoes ja liquidadas permanecem no historico e no saldo.
export async function cancelCopy(userId: string, traderId: string) {
  const sub = await prisma.userCopyTrader.findFirst({
    where: { userId, traderId, status: 'ACTIVE' }, select: { id: true },
  })
  if (!sub) throw new CopyError('NOT_COPYING')

  await prisma.$transaction([
    prisma.userCopyTrader.update({
      where: { id: sub.id }, data: { status: 'CANCELLED', nextCycleAt: null },
    }),
    prisma.copyTradeOperation.updateMany({
      where: { userId, traderId, status: 'PENDING' }, data: { status: 'CANCELLED' },
    }),
  ])
  return { ok: true }
}

// ─── Leitura para o usuario ────────────────────────────────────────────────────

function serializeTrader(t: any) {
  return {
    id:            t.id,
    name:          t.name,
    countryCode:   t.countryCode,
    avatarUrl:     t.avatarUrl,
    vip:           t.vip,
    paid:          t.paid,
    accessPrice:   Number(t.accessPrice),
    weeklyGainPct: Number(t.weeklyGainPct),
    copiers:       t.copiers,
    copiedTrades:  t.copiedTrades,
    commissionPct: Number(t.commissionPct),
    profitPct:     Number(t.profitPct),
    lossPct:       Number(t.lossPct),
    displayOrder:  t.displayOrder,
  }
}

export async function getTraders(userId: string) {
  const [traders, active] = await Promise.all([
    prisma.copyTrader.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } }),
    prisma.userCopyTrader.findMany({ where: { userId, status: 'ACTIVE' }, select: { traderId: true } }),
  ])
  const copyingSet = new Set(active.map(a => a.traderId))
  return traders.map(t => ({ ...serializeTrader(t), copying: copyingSet.has(t.id) }))
}

export async function getMy(userId: string) {
  const subs = await prisma.userCopyTrader.findMany({
    where: { userId, status: 'ACTIVE' }, orderBy: { activatedAt: 'desc' },
  })
  if (subs.length === 0) return { subscriptions: [], hasPending: false }

  const traderIds = subs.map(s => s.traderId)
  const [traders, ops] = await Promise.all([
    prisma.copyTrader.findMany({ where: { id: { in: traderIds } } }),
    prisma.copyTradeOperation.findMany({
      where:   { userId, traderId: { in: traderIds }, status: { in: ['SETTLED', 'PENDING'] } },
      orderBy: { scheduledAt: 'desc' },
    }),
  ])
  const traderMap = new Map(traders.map(t => [t.id, t]))

  let anyPending = false
  const subscriptions = subs.map(sub => {
    const settled = ops.filter(o => o.traderId === sub.traderId && o.status === 'SETTLED')
    const pending = ops.filter(o => o.traderId === sub.traderId && o.status === 'PENDING')
    if (pending.length > 0) anyPending = true

    const accumulated = settled.reduce((s, o) => s + Number(o.pnl), 0)
    const nextOpAt    = pending.length > 0
      ? pending.reduce((min, o) => o.scheduledAt < min ? o.scheduledAt : min, pending[0].scheduledAt)
      : null
    const trader = traderMap.get(sub.traderId)

    return {
      id:          sub.id,
      traderId:    sub.traderId,
      trader:      trader ? serializeTrader(trader) : null,
      activatedAt: sub.activatedAt,
      opsGenerated: settled.length,           // so liquidadas
      accumulated:  roundMoney(accumulated),  // soma dos pnl liquidados
      nextOpAt,
      hasPending:   pending.length > 0,
      // Historico = SOMENTE operacoes liquidadas (PENDING ficam ocultas ate liquidar).
      history: settled
        .sort((a, b) => (b.settledAt?.getTime() ?? 0) - (a.settledAt?.getTime() ?? 0))
        .map(o => ({
          id:        o.id,
          result:    o.result,
          pnl:       Number(o.pnl),
          amount:    Number(o.amount),
          settledAt: o.settledAt,
        })),
    }
  })

  return { subscriptions, hasPending: anyPending }
}
