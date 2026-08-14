/**
 * POST /api/notify — dispara e-mail transacional após um evento.
 * body: { kind, id? }
 *
 * Chamado pelo frontend (fire-and-forget) após ações que acontecem via RPC
 * direto do navegador (confirmação manual de depósito, KYC, saques) — onde
 * não há rota server-side pra plugar o envio.
 *
 * Segurança: o e-mail NUNCA é enviado com base no que o cliente diz.
 * Esta rota lê o estado real no banco (via service role) e só envia se o
 * evento de fato aconteceu. Eventos de admin exigem sessão de admin; o
 * withdrawal_requested exige que o caller seja o dono do saque.
 * O dedup por (kind, ref_id) na email_log impede reenvio/spam.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import {
  emailDepositConfirmed,
  emailWithdrawalRequested,
  emailWithdrawalPaid,
  emailWithdrawalRejected,
  emailKycApproved,
  emailKycRejected,
  type EmailKind,
} from '@/lib/email'

const ADMIN_KINDS: EmailKind[] = [
  'deposit_confirmed', 'withdrawal_rejected', 'withdrawal_paid', 'kyc_approved', 'kyc_rejected',
]

export async function POST(req: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SERVICE_KEY) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as { kind?: EmailKind; id?: string }
  const kind = body.kind
  if (!kind) return NextResponse.json({ error: 'kind obrigatório' }, { status: 400 })

  // 1. Autentica o caller via cookies
  const userClient = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // 2. Eventos de admin exigem admin
  if (ADMIN_KINDS.includes(kind)) {
    const { data: isAdmin } = await userClient.rpc('is_admin', { uid: user.id })
    if (!isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 3. Verifica o estado real no banco e envia
  switch (kind) {
    case 'deposit_confirmed': {
      if (!body.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      const { data: d } = await service
        .from('deposits')
        .select('id, user_id, amount, status, is_fake')
        .eq('id', body.id)
        .single()
      if (!d || d.status !== 'confirmed' || d.is_fake) {
        return NextResponse.json({ error: 'Depósito não confirmado' }, { status: 400 })
      }
      await emailDepositConfirmed({ userId: d.user_id, depositId: d.id, amount: d.amount })
      return NextResponse.json({ ok: true })
    }

    case 'withdrawal_requested': {
      // Caller notifica o PRÓPRIO saque. Sem id: pega o pending mais recente dele.
      let q = service
        .from('withdrawals')
        .select('id, user_id, amount, status')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
      if (body.id) q = q.eq('id', body.id)
      const { data: rows } = await q
      const w = rows?.[0]
      if (!w) return NextResponse.json({ error: 'Saque pendente não encontrado' }, { status: 400 })
      await emailWithdrawalRequested({ userId: w.user_id, withdrawalId: w.id, amount: w.amount })
      return NextResponse.json({ ok: true })
    }

    case 'withdrawal_rejected':
    case 'withdrawal_paid': {
      if (!body.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      const { data: w } = await service
        .from('withdrawals')
        .select('id, user_id, amount, status, admin_notes')
        .eq('id', body.id)
        .single()
      if (!w) return NextResponse.json({ error: 'Saque não encontrado' }, { status: 404 })

      if (kind === 'withdrawal_rejected') {
        if (w.status !== 'rejected') return NextResponse.json({ error: 'Saque não está rejeitado' }, { status: 400 })
        await emailWithdrawalRejected({ userId: w.user_id, withdrawalId: w.id, amount: w.amount, reason: w.admin_notes })
      } else {
        if (w.status !== 'paid') return NextResponse.json({ error: 'Saque não está pago' }, { status: 400 })
        await emailWithdrawalPaid({ userId: w.user_id, withdrawalId: w.id, amount: w.amount })
      }
      return NextResponse.json({ ok: true })
    }

    case 'kyc_approved':
    case 'kyc_rejected': {
      if (!body.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
      const { data: s } = await service
        .from('kyc_submissions')
        .select('id, user_id, status, reject_reason')
        .eq('id', body.id)
        .single()
      if (!s) return NextResponse.json({ error: 'Submissão não encontrada' }, { status: 404 })

      if (kind === 'kyc_approved') {
        if (s.status !== 'approved') return NextResponse.json({ error: 'KYC não está aprovado' }, { status: 400 })
        await emailKycApproved({ userId: s.user_id, submissionId: s.id })
      } else {
        if (s.status !== 'rejected') return NextResponse.json({ error: 'KYC não está rejeitado' }, { status: 400 })
        await emailKycRejected({ userId: s.user_id, submissionId: s.id, reason: s.reject_reason })
      }
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: 'kind desconhecido' }, { status: 400 })
  }
}
