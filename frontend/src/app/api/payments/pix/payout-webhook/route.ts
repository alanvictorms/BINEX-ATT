import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { emailWithdrawalPaid } from '@/lib/email'

/**
 * Webhook BSPay para callbacks de cash-out (payout).
 *
 * A URL é enviada por transação pelo /api/admin/withdrawals/payout, montada a
 * partir de WEBHOOK_BASE_URL — que por padrão é a URL DIRETA do EasyPanel, não
 * o domínio. Isso é de propósito: a Cloudflare pode bloquear a chamada de
 * entrada da BSPay, e foi por isso que o webhook de depósito saiu do domínio.
 *   {WEBHOOK_BASE_URL}/api/payments/pix/payout-webhook?secret=<BSPAY_WEBHOOK_SECRET>
 *
 * BSPay vai chamar com payload no formato (varia, consulte a doc oficial):
 *   {
 *     "event": "cashout.completed" | "cashout.failed",
 *     "data": {
 *       "id":     "<bspay_payout_id>",
 *       "e2e_id": "<E2E_PIX_ID>",
 *       "status": "completed" | "failed"
 *     }
 *   }
 */
export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.BSPAY_WEBHOOK_SECRET!
  const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!

  // 1. Valida secret no query (mecanismo simples; BSPay também suporta HMAC)
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Lê payload
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const event:    string = payload.event ?? payload.type ?? ''
  const data:     any    = payload.data ?? payload
  const bspayId:  string = data?.id ?? data?.transaction_id ?? ''
  const e2eId:    string = data?.e2e_id ?? data?.end_to_end_id ?? ''
  const rawStatus: string = data?.status ?? ''

  // Determina status final
  let newStatus: 'completed' | 'failed' | null = null
  if (event.includes('completed') || rawStatus === 'completed' || rawStatus === 'paid') {
    newStatus = 'completed'
  } else if (event.includes('failed') || event.includes('error') || rawStatus === 'failed' || rawStatus === 'rejected') {
    newStatus = 'failed'
  }

  if (!newStatus || !bspayId) {
    // Evento desconhecido — retorna OK mas não processa (não quer reentregas)
    console.warn('[BSPay payout-webhook] evento ignorado', { event, rawStatus, bspayId })
    return NextResponse.json({ ok: true, ignored: true })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: result, error } = await supabase.rpc('settle_bspay_payout', {
      p_bspay_payout_id: bspayId,
      p_new_status:      newStatus,
      p_e2e_id:          e2eId || null,
    })

    if (error) throw error

    // E-mail de saque pago. Idempotente (email_log) e tolerante a falha.
    if (newStatus === 'completed' && result) {
      const { data: w } = await supabase
        .from('withdrawals')
        .select('id, user_id, amount, status')
        .eq('id', result)
        .single()
      if (w && w.status === 'paid') {
        await emailWithdrawalPaid({ userId: w.user_id, withdrawalId: w.id, amount: w.amount })
      }
    }

    return NextResponse.json({ ok: true, withdrawal_id: result, status: newStatus })
  } catch (e: any) {
    console.error('[BSPay payout-webhook] settle failed', e)
    return NextResponse.json({ error: e.message ?? 'settle failed' }, { status: 500 })
  }
}
