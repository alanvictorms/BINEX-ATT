// Copy Trading — worker de liquidacao + reinicio de ciclo.
//
// Espelha o padrao do startOrphanSweeper (operations/service.ts): polling ~30s,
// idempotente, com cleanup em SIGTERM/SIGINT.
//
// CUIDADOS DE PRODUCAO (ver plano):
//  1. So roda em producao. Guarda extra: se NODE_ENV!=production mas DATABASE_URL
//     aponta para o banco de producao, NAO inicia (evita liquidar saldo real numa
//     execucao local de dev).
//  2. Pre-check: confere que as tabelas do copy existem e que transactions_type_check
//     ja inclui COPY_RESULT; senao NAO inicia (evita liquidar quebrado em silencio).

import { prisma } from '../prisma.js'
import { settleOperation, generateCycleForSubscription, isCopyEnabled } from './service.js'

let copyTimer: NodeJS.Timeout | null = null

function looksLikeProdDb(): boolean {
  const url = process.env.DATABASE_URL ?? ''
  return /supabase\.(co|com)|yilmbwrfaljxgvsygmyz|pooler\.supabase/i.test(url)
}

// Pre-check: retorna mensagem do problema, ou null se estiver tudo ok.
async function precheck(): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ tables_ok: boolean; types_ok: boolean }[]>`
    SELECT
      (to_regclass('public.copy_traders')          IS NOT NULL
       AND to_regclass('public.user_copy_traders')     IS NOT NULL
       AND to_regclass('public.copy_trade_operations') IS NOT NULL
       AND to_regclass('public.app_config')            IS NOT NULL) AS tables_ok,
      (COALESCE(position('COPY_RESULT' in (
         SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'transactions_type_check'
       )), 0) > 0) AS types_ok
  `
  const r = rows[0]
  if (!r?.tables_ok) return 'tabelas do copy ausentes (migration nao aplicada)'
  if (!r?.types_ok)  return 'transactions_type_check sem COPY_RESULT (migration nao aplicada)'
  return null
}

async function tick(): Promise<void> {
  // ── 1) Liquidacao das operacoes vencidas de assinaturas ainda ACTIVE ──────────
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT o.id
    FROM copy_trade_operations o
    JOIN user_copy_traders s
      ON s.user_id = o.user_id AND s.trader_id = o.trader_id AND s.status = 'ACTIVE'
    WHERE o.status = 'PENDING' AND o.scheduled_at <= now()
    ORDER BY o.scheduled_at ASC
    LIMIT 200
  `
  let settled = 0
  for (const op of due) {
    const res = await settleOperation(op.id).catch(err => {
      console.error('[copy-worker] liquidacao falhou:', op.id, err?.message ?? err)
      return null
    })
    if (res) settled++
  }

  // ── 2) Reinicio de ciclo (claim atomico via RETURNING) ────────────────────────
  // So gera novos ciclos se o copy estiver habilitado (settlement acima roda sempre,
  // para nao deixar saldo preso quando o admin desliga o modulo).
  let restarted = 0
  if (await isCopyEnabled()) {
    const claimed = await prisma.$queryRaw<{ id: string; user_id: string; trader_id: string }[]>`
      UPDATE user_copy_traders
      SET next_cycle_at = NULL, updated_at = now()
      WHERE status = 'ACTIVE' AND next_cycle_at IS NOT NULL AND next_cycle_at <= now()
      RETURNING id, user_id, trader_id
    `
    for (const c of claimed) {
      try {
        await generateCycleForSubscription(c.id, c.user_id, c.trader_id)
        restarted++
      } catch (err: any) {
        console.error('[copy-worker] gerar ciclo falhou:', c.id, err?.message ?? err)
        // Evita ficar preso com next_cycle_at=NULL: reagenda retry em ~1h.
        await prisma.userCopyTrader.update({
          where: { id: c.id },
          data:  { nextCycleAt: new Date(Date.now() + 60 * 60_000) },
        }).catch(() => { /* best-effort */ })
      }
    }
  }

  if (settled || restarted) {
    const parts: string[] = []
    if (settled)   parts.push(`${settled} liquidada(s)`)
    if (restarted) parts.push(`${restarted} ciclo(s) reiniciado(s)`)
    console.log(`[copy-worker] ${parts.join(', ')}`)
  }
}

export async function startCopyWorker(intervalMs = 30_000): Promise<void> {
  if (copyTimer) return

  if (process.env.COPY_WORKER_ENABLED === 'false') {
    console.log('[copy-worker] desabilitado via COPY_WORKER_ENABLED=false')
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    if (looksLikeProdDb()) {
      console.warn('[copy-worker] BLOQUEADO: NODE_ENV!=production mas DATABASE_URL aponta para producao. Worker NAO iniciado (protege saldo real).')
    } else {
      console.log('[copy-worker] inativo fora de producao (NODE_ENV!=production)')
    }
    return
  }

  const problem = await precheck().catch(e => `precheck falhou: ${e?.message ?? e}`)
  if (problem) {
    console.error(`[copy-worker] NAO iniciado — ${problem}`)
    return
  }

  console.log(`[copy-worker] iniciado (a cada ${intervalMs}ms)`)
  copyTimer = setInterval(() => {
    tick().catch(err => console.error('[copy-worker] tick erro:', err?.message ?? err))
  }, intervalMs)
  tick().catch(err => console.error('[copy-worker] tick erro:', err?.message ?? err))

  const stop = () => { if (copyTimer) clearInterval(copyTimer); copyTimer = null }
  process.once('SIGTERM', stop)
  process.once('SIGINT',  stop)
}
