/**
 * GET /api/cron/email-flows?secret=<CRON_SECRET>
 *
 * Executa os fluxos de e-mail lead→depósito (docs/emails/estrategia-fluxos-leads.md).
 * Chamado pelo n8n a cada 30 minutos. Toda a lógica mora aqui (versionada no
 * repo); o n8n é só o relógio.
 *
 * Fluxo A — ativação (cadastro sem depósito confirmado):
 *   A1 imediato · A2 +24h · A3 +72h · A4 +6 dias (oferta bônus 100%)
 * Fluxo B — Pix gerado e não pago:
 *   B1 +30min · B2 +24h
 *
 * Proteções:
 *  - Janela de envio 09h–21h BRT (fora disso a execução não envia nada)
 *  - Dedup por email_log (cada passo sai 1 única vez por usuário/depósito)
 *  - Máx. 1 e-mail do fluxo A por usuário a cada 20h (catch-up não vira rajada)
 *  - Só usuários criados nos últimos 14 dias (lançar o fluxo não dispara
 *    e-mail pra cadastros antigos)
 *  - Teto de 50 envios por execução (plano free do Resend = 100/dia)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  emailFlowA1, emailFlowA2, emailFlowA3, emailFlowA4,
  emailFlowB1, emailFlowB2,
} from '@/lib/email'

const MAX_SENDS_PER_RUN = 50
const FLOW_A_MIN_GAP_MS = 20 * 60 * 60 * 1000   // 20h entre e-mails do fluxo A
const MAX_ACCOUNT_AGE_D = 14                      // não alcança cadastros antigos

// Limiares de cada passo do fluxo A (horas desde o cadastro)
const A_STEPS: Array<{ kind: 'flow_a1' | 'flow_a2' | 'flow_a3' | 'flow_a4'; afterHours: number }> = [
  { kind: 'flow_a1', afterHours: 0 },
  { kind: 'flow_a2', afterHours: 24 },
  { kind: 'flow_a3', afterHours: 72 },
  { kind: 'flow_a4', afterHours: 144 },
]

function withinSendWindow(): boolean {
  const hourBRT = (new Date().getUTCHours() + 21) % 24   // BRT = UTC-3
  return hourBRT >= 9 && hourBRT < 21
}

export async function GET(req: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET
  if (!CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  if (req.nextUrl.searchParams.get('secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!withinSendWindow()) {
    return NextResponse.json({ ok: true, skipped: 'fora da janela 09h–21h BRT' })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const now = Date.now()
  const since = new Date(now - MAX_ACCOUNT_AGE_D * 24 * 3600 * 1000).toISOString()
  let sent = 0
  const report = { a1: 0, a2: 0, a3: 0, a4: 0, b1: 0, b2: 0 }

  // ── Dados de elegibilidade ──────────────────────────────────────────────
  const [{ data: profiles }, { data: admins }, { data: confirmedDeps }, { data: flowLog }] = await Promise.all([
    service.from('profiles')
      .select('id, created_at, blocked_at')
      .gte('created_at', since)
      .is('blocked_at', null),
    service.from('admin_users').select('user_id'),
    service.from('deposits').select('user_id').eq('status', 'confirmed').eq('is_fake', false),
    service.from('email_log').select('user_id, kind, ref_id, sent_at').like('kind', 'flow_%'),
  ])

  const adminIds     = new Set((admins ?? []).map(a => a.user_id))
  const depositorIds = new Set((confirmedDeps ?? []).map(d => d.user_id))
  const logRows      = flowLog ?? []
  const sentKinds    = new Set(logRows.map(r => `${r.kind}:${r.ref_id}`))
  const lastFlowASend = new Map<string, number>()
  for (const r of logRows) {
    if (!r.kind.startsWith('flow_a')) continue
    const t = new Date(r.sent_at).getTime()
    if (t > (lastFlowASend.get(r.user_id) ?? 0)) lastFlowASend.set(r.user_id, t)
  }

  // ── Fluxo A: ativação ───────────────────────────────────────────────────
  for (const prof of profiles ?? []) {
    if (sent >= MAX_SENDS_PER_RUN) break
    if (adminIds.has(prof.id) || depositorIds.has(prof.id)) continue

    const ageHours = (now - new Date(prof.created_at).getTime()) / 3600_000
    // Próximo passo não-enviado cujo limiar já passou (1 por execução)
    const next = A_STEPS.find(s => !sentKinds.has(`${s.kind}:${prof.id}`) && ageHours >= s.afterHours)
    if (!next) continue

    // Espaçamento mínimo entre e-mails do fluxo A (catch-up vira drip)
    const last = lastFlowASend.get(prof.id) ?? 0
    if (next.kind !== 'flow_a1' && now - last < FLOW_A_MIN_GAP_MS) continue

    if      (next.kind === 'flow_a1') { await emailFlowA1(prof.id); report.a1++ }
    else if (next.kind === 'flow_a2') { await emailFlowA2(prof.id); report.a2++ }
    else if (next.kind === 'flow_a3') { await emailFlowA3(prof.id); report.a3++ }
    else                              { await emailFlowA4(prof.id); report.a4++ }
    sent++
  }

  // ── Fluxo B: Pix gerado e não pago (30min–48h) ──────────────────────────
  const bSince = new Date(now - 48 * 3600 * 1000).toISOString()
  const bUntil = new Date(now - 30 * 60 * 1000).toISOString()
  const { data: pendings } = await service
    .from('deposits')
    .select('id, user_id, amount, created_at')
    .eq('status', 'pending')
    .eq('is_fake', false)
    .gte('created_at', bSince)
    .lte('created_at', bUntil)
    .order('created_at', { ascending: false })

  const seenUsers = new Set<string>()
  for (const dep of pendings ?? []) {
    if (sent >= MAX_SENDS_PER_RUN) break
    if (adminIds.has(dep.user_id) || depositorIds.has(dep.user_id)) continue
    if (seenUsers.has(dep.user_id)) continue   // 1 lembrete por usuário (Pix mais recente)
    seenUsers.add(dep.user_id)

    const ageHours = (now - new Date(dep.created_at).getTime()) / 3600_000
    const kind = ageHours >= 24 ? 'flow_b2' : 'flow_b1'
    if (sentKinds.has(`${kind}:${dep.id}`)) continue

    if (kind === 'flow_b1') { await emailFlowB1({ userId: dep.user_id, depositId: dep.id, amount: dep.amount }); report.b1++ }
    else                    { await emailFlowB2({ userId: dep.user_id, depositId: dep.id, amount: dep.amount }); report.b2++ }
    sent++
  }

  console.log('[email-flows] execução:', JSON.stringify({ sent, ...report }))
  return NextResponse.json({ ok: true, sent, ...report })
}
