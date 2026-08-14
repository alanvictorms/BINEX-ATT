/**
 * GET /api/cron/reconcile-deposits?secret=<CRON_SECRET>
 *
 * Rede de seguranca do webhook de deposito. Varre os depositos que continuam
 * `pending`, pergunta ao BSPay o estado real de cada um e credita os que foram
 * pagos de fato.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * Ate 02/08/2026 o credito dependia 100% do webhook chegar de primeira. Um
 * webhook perdido (queda do container, retries esgotados, evento com nome fora
 * do matcher) deixava o dinheiro no BSPay, o saldo zerado e NINGUEM era
 * avisado — so se descobria quando o usuario reclamava. Foi exatamente o que
 * aconteceu com o deposito 68bada4f (R$100, pago 02/08 02:29 UTC, creditado a
 * mao 11h depois).
 *
 * Parametros:
 *   secret  obrigatorio, = CRON_SECRET
 *   hours   janela em horas (default 48). Use um valor grande p/ varrer o
 *           backlog inteiro numa passada (ex.: hours=2000).
 *   dry     dry=1 analisa e reporta sem creditar nada.
 *
 * Chamado pelo n8n de hora em hora. A resposta traz `alertas` — o n8n roteia
 * pro WhatsApp. Divergencia de valor e estorno NUNCA sao resolvidos sozinhos:
 * viram alerta pra decisao humana.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { bspayGetTransaction, BSPAY_LOOKUP_TEMPLATES } from '@/lib/bspay'
import { dispatchDeposit } from '@/lib/trackflow'
import { emailDepositConfirmed } from '@/lib/email'

const DEFAULT_WINDOW_H = 48
const MAX_PER_RUN      = 200   // trava de seguranca contra varredura infinita
const CONCURRENCY      = 3     // BSPay e API de terceiro — nao martelar
const AMOUNT_TOLERANCE = 0.01  // centavo de arredondamento

interface Row {
  id: string
  user_id: string
  account_id: string
  external_id: string
  bspay_id: string | null
  amount: number
  created_at: string
}

interface Alerta {
  deposit_id: string
  external_id: string
  motivo: string
  detalhe: string
}

/** Roda `fn` sobre `items` com no maximo `limit` chamadas simultaneas. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

export async function GET(req: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET
  if (!CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  if (req.nextUrl.searchParams.get('secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ausente' }, { status: 500 })
  }

  const hours = Math.max(1, Number(req.nextUrl.searchParams.get('hours')) || DEFAULT_WINDOW_H)
  const dry   = req.nextUrl.searchParams.get('dry') === '1'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const desde = new Date(Date.now() - hours * 3_600_000).toISOString()

  const { data: pendentes, error: selErr } = await supabase
    .from('deposits')
    .select('id, user_id, account_id, external_id, bspay_id, amount, created_at')
    .eq('status', 'pending')
    .or('is_fake.is.null,is_fake.eq.false')
    .gte('created_at', desde)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (selErr) {
    console.error('[reconcile] falha ao listar pendentes:', selErr)
    return NextResponse.json({ error: selErr.message }, { status: 500 })
  }

  const rows = (pendentes ?? []) as Row[]
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, janela_horas: hours, analisados: 0, confirmados: [], alertas: [] })
  }

  const confirmados: Array<{ deposit_id: string; external_id: string; amount: number; e2e: string | null }> = []
  const alertas: Alerta[] = []
  const erros: Array<{ deposit_id: string; erro: string }> = []
  let naoEncontrados = 0
  let seguemPendentes = 0
  let endpointUsado: string | null = null
  let authFalhou: string | null = null

  await mapLimit(rows, CONCURRENCY, async (d) => {
    // Auth quebrada derruba tudo — para de tentar em vez de gerar N erros iguais.
    if (authFalhou) return

    let tx
    try {
      tx = await bspayGetTransaction(d.bspay_id, d.external_id)
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      if (/auth failed/i.test(msg)) authFalhou = msg
      erros.push({ deposit_id: d.id, erro: msg })
      return
    }

    if (tx.endpoint) endpointUsado = tx.endpoint

    if (!tx.found) { naoEncontrados++; return }

    if (tx.refunded) {
      alertas.push({
        deposit_id: d.id, external_id: d.external_id,
        motivo: 'estorno_ou_falha',
        detalhe: `BSPay reporta status "${tx.status}" — não creditado, requer decisão manual.`,
      })
      return
    }

    if (!tx.paid) { seguemPendentes++; return }

    // Validacao dupla (CLAUDE.md: dinheiro real). O valor que o BSPay recebeu
    // precisa bater com o que esta gravado — confirm_deposit credita o valor do
    // BANCO, entao divergencia aqui creditaria a mais.
    if (tx.amount !== null && Math.abs(tx.amount - Number(d.amount)) > AMOUNT_TOLERANCE) {
      alertas.push({
        deposit_id: d.id, external_id: d.external_id,
        motivo: 'valor_divergente',
        detalhe: `banco R$ ${Number(d.amount).toFixed(2)} × BSPay R$ ${tx.amount.toFixed(2)} — NÃO creditado.`,
      })
      return
    }

    if (dry) {
      confirmados.push({ deposit_id: d.id, external_id: d.external_id, amount: Number(d.amount), e2e: tx.endToEndId })
      return
    }

    // Mesma RPC do webhook: idempotente (só age em status='pending'), credita o
    // valor do banco, grava no extrato e concede o bônus escalonado.
    const { error: rpcErr } = await supabase.rpc('confirm_deposit', { p_external_id: d.external_id })
    if (rpcErr) {
      console.error('[reconcile] confirm_deposit falhou:', d.external_id, rpcErr)
      erros.push({ deposit_id: d.id, erro: rpcErr.message })
      return
    }

    confirmados.push({ deposit_id: d.id, external_id: d.external_id, amount: Number(d.amount), e2e: tx.endToEndId })

    // Espelha o rabo do webhook: atribuição de marketing + e-mail. Ambos são
    // idempotentes e tolerantes a falha — nunca desfazem o crédito.
    try { await dispatchDeposit(d.external_id) } catch (e) { console.error('[reconcile] trackflow:', e) }
    try {
      await emailDepositConfirmed({ userId: d.user_id, depositId: d.id, amount: d.amount })
    } catch (e) { console.error('[reconcile] email:', e) }
  })

  // Um deposito confirmado aqui = um webhook que se perdeu. Nunca é rotina.
  if (confirmados.length > 0) {
    console.error(
      `[reconcile] ${confirmados.length} depósito(s) pagos que o webhook NÃO creditou: ` +
      confirmados.map(c => `${c.external_id} (R$ ${c.amount.toFixed(2)})`).join(', '),
    )
  }
  for (const a of alertas) {
    console.error(`[reconcile] ALERTA ${a.motivo} — ${a.external_id}: ${a.detalhe}`)
  }
  if (authFalhou) {
    console.error('[reconcile] autenticação no BSPay falhou — reconciliação NÃO rodou:', authFalhou)
  }
  if (!endpointUsado && !authFalhou && rows.length > 0) {
    console.error(
      '[reconcile] nenhum endpoint de consulta do BSPay respondeu. Tentados: ' +
      BSPAY_LOOKUP_TEMPLATES.join(', '),
    )
  }

  return NextResponse.json({
    ok: !authFalhou,
    dry,
    janela_horas:    hours,
    analisados:      rows.length,
    confirmados,
    alertas,
    erros,
    nao_encontrados: naoEncontrados,
    seguem_pendentes: seguemPendentes,
    endpoint_bspay:  endpointUsado,
    endpoints_tentados: endpointUsado ? undefined : BSPAY_LOOKUP_TEMPLATES,
    auth_falhou:     authFalhou ?? undefined,
  })
}
