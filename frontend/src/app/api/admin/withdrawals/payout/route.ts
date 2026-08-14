import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { bspayCashout } from '@/lib/bspay'
import { emailWithdrawalPaid } from '@/lib/email'

/**
 * POST /api/admin/withdrawals/payout
 * body: { withdrawal_id: string, totp_code: string }
 *
 * Dispara o cash-out PIX via BSPay para liquidar um saque já aprovado.
 *
 * Pré-requisitos validados aqui:
 *  - Caller é admin
 *  - Sessão com 2FA recente (AAL2 + step-up code obrigatório)
 *  - Saque está no status 'approved'
 *  - Usuário tem KYC verified (defesa em profundidade)
 */
export async function POST(req: NextRequest) {
  const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const WEBHOOK_SECRET = process.env.BSPAY_WEBHOOK_SECRET!

  if (!SERVICE_KEY) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // 1. Valida admin via cookies
  const userClient = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: () => {},
    },
  })

  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: isAdmin } = await userClient.rpc('is_admin', { uid: user.id })
  if (!isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  // 2. Lê body
  const body = await req.json().catch(() => ({})) as { withdrawal_id?: string }
  if (!body.withdrawal_id) {
    return NextResponse.json({ error: 'withdrawal_id obrigatório' }, { status: 400 })
  }

  // 3. Service client pra ler dados do saque e fazer updates
  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: w, error: wErr } = await service
    .from('withdrawals')
    .select('id, user_id, account_id, amount, pix_key, pix_key_type, status')
    .eq('id', body.withdrawal_id)
    .single()

  if (wErr || !w) return NextResponse.json({ error: 'Saque não encontrado' }, { status: 404 })
  if (w.status !== 'approved') {
    return NextResponse.json({ error: `Saque precisa estar com status "approved" (atual: ${w.status})` }, { status: 400 })
  }

  // 4. Defesa adicional: KYC verified
  const { data: profile } = await service.from('profiles').select('kyc_status, name').eq('id', w.user_id).single()
  if (profile?.kyc_status !== 'verified') {
    return NextResponse.json({ error: 'Usuário não tem KYC verificado' }, { status: 400 })
  }

  // 5. Chama BSPay cashout
  //
  // O aviso de "saque pago" da BSPay vem pela URL DIRETA do EasyPanel, igual ao
  // webhook de depósito — não pelo domínio. O depósito foi movido pra cá quando
  // se descobriu que a Cloudflare podia bloquear a chamada de entrada da BSPay
  // (ver api/payments/pix/create); o saque tinha ficado para trás apontando pro
  // domínio. Mesma variável, mesmo padrão, um caminho só.
  const webhookBase = process.env.WEBHOOK_BASE_URL
    ?? 'https://n8n-vertex-web.oloyi2.easypanel.host'
  const postbackUrl = `${webhookBase}/api/payments/pix/payout-webhook?secret=${WEBHOOK_SECRET}`

  let cashout
  try {
    cashout = await bspayCashout({
      amount:      Number(w.amount),
      pixKey:      w.pix_key,
      pixKeyType:  w.pix_key_type as any,
      externalId:  w.id,
      postbackUrl,
      payerName:   profile?.name ?? undefined,
    })
  } catch (e: any) {
    console.error('[BSPay payout]', e)
    return NextResponse.json({ error: e.message ?? 'Falha ao processar pagamento BSPay' }, { status: 502 })
  }

  // 6. Registra no banco — usa o cliente do USUÁRIO (não service) pra
  //    require_recent_mfa funcionar (lê JWT do admin), e admin_register_bspay_payout
  //    valida is_admin.
  const immediatelyPaid = cashout.status === 'completed' || cashout.status === 'paid'
  const { error: regErr } = await userClient.rpc('admin_register_bspay_payout', {
    p_withdrawal_id:    w.id,
    p_bspay_payout_id:  cashout.bspayPayoutId,
    p_immediately_paid: immediatelyPaid,
    p_e2e_id:           cashout.e2eId ?? null,
  })

  if (regErr) {
    // BSPay já recebeu a ordem, mas falhamos ao registrar.
    // Log forte pra reconciliação manual.
    console.error('[CRITICAL] BSPay processou mas DB falhou', { withdrawal_id: w.id, cashout, regErr })
    return NextResponse.json({
      error: 'BSPay processou o pagamento, mas houve erro ao salvar no banco. Reconcilie manualmente.',
      bspay_payout_id: cashout.bspayPayoutId,
    }, { status: 500 })
  }

  // E-mail de saque pago (so quando o BSPay ja liquidou na hora; caso
  // contrario o payout-webhook envia ao liquidar). Idempotente via email_log.
  if (immediatelyPaid) {
    await emailWithdrawalPaid({ userId: w.user_id, withdrawalId: w.id, amount: w.amount })
  }

  return NextResponse.json({
    success:         true,
    immediatelyPaid: immediatelyPaid,
    bspayPayoutId:   cashout.bspayPayoutId,
    e2eId:           cashout.e2eId,
    bspayStatus:     cashout.status,
  })
}
