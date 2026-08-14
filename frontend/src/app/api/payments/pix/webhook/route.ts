import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { dispatchDeposit } from '@/lib/trackflow'
import { emailDepositConfirmed } from '@/lib/email'

const WEBHOOK_SECRET = process.env.BSPAY_WEBHOOK_SECRET ?? ''
const CLIENT_SECRET  = process.env.BSPAY_CLIENT_SECRET ?? ''

// Autenticacao do webhook, em ordem de preferencia:
//
//  1. HMAC-SHA256 no header `X-Webhook-Signature`, sobre o CORPO CRU, com o
//     webhook_secret da conta (dev.bspay.co/webhooks). E o metodo oficial e o
//     unico que continua valendo se a BSPay trocar de servidor.
//  2. IP de origem na allowlist — nao e falsificavel numa conexao HTTPS
//     (precisaria controlar o IP pra completar o handshake e responder), mas
//     QUEBRA EM SILENCIO no dia em que a BSPay mudar de IP: os depositos param
//     de confirmar e ninguem e avisado. E rede de seguranca, nao a defesa.
//
// Preencha BSPAY_WEBHOOK_SECRET no painel da BSPay pra sair da dependencia do IP.
const BSPAY_IPS = (process.env.BSPAY_WEBHOOK_IPS ?? '185.193.127.186')
  .split(',').map(s => s.trim()).filter(Boolean)

// A doc manda rejeitar eventos de sandbox em producao (header `X-Sandbox: 1`).
// Sem isso, um evento de teste creditaria saldo real.
const ALLOW_SANDBOX = process.env.BSPAY_ALLOW_SANDBOX === 'true'

// Janela anti-replay da assinatura (a doc usa +/- 5 min).
const SIGNATURE_WINDOW_MS = 5 * 60 * 1000

// Disputas (MED do Pix): a BSPay bloqueia o valor no saldo e da 7 dias corridos
// pra defesa. Sem resposta, perde por revelia. Estes eventos chegavam aqui e
// eram descartados junto com o resto do "evento nao-confirmado".
// Grafias que significam "o dinheiro entrou" e "ainda esperando". Batidas
// case-insensitive contra o nome do evento E contra data.status, porque o
// BSPay usa os dois canais dependendo do fluxo.
const PAID_WORDS    = /^(cashin\.)?(confirmed|paid|completed|approved|settled|success(ful)?)$/i
const WAITING_WORDS = /^(cashin\.)?(pending|created|waiting|processing|generated)$/i

const DISPUTE_STATUS: Record<string, string> = {
  'chargeback.opened':    'open',
  'chargeback.responded': 'responded',
  'chargeback.confirmed': 'confirmed',
  'chargeback.won':       'won',
  'chargeback.lost':      'lost',
  'chargeback.canceled':  'canceled',
}

function hmacOk(rawBody: string, sigHex: string, secret: string): boolean {
  if (!sigHex || !secret) return false
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    const a = Buffer.from(sigHex, 'hex')
    const b = Buffer.from(expected, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch { return false }
}

// A doc nao fixa o formato do timestamp — aceita epoch em s, em ms ou ISO.
function parseTs(ts: string): number | null {
  if (!ts) return null
  const n = Number(ts)
  if (Number.isFinite(n) && n > 0) return n > 1e11 ? n : n * 1000
  const d = Date.parse(ts)
  return Number.isNaN(d) ? null : d
}

// IP de origem real: Traefik/EasyPanel poe o IP do cliente em x-real-ip.
// x-forwarded-for pode ter varios (pega o primeiro = origem).
function clientIp(req: NextRequest): string {
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return ''
}

/**
 * Registra um evento de disputa em `payment_disputes`.
 *
 * NAO mexe em saldo: a defesa e humana e a decisao e da BSPay. O que esta rotina
 * garante e que o evento pare de ser descartado em silencio — com o relogio de
 * 7 dias correndo, passar batido significa perder por revelia.
 *
 * Idempotente por (transaction_id|external_id) + evento, porque a BSPay
 * reentrega o mesmo evento ate 6x. Nunca lanca: erro aqui viraria retry infinito.
 */
async function recordDispute(supabase: any, evt: string, body: any, externalId: string | null) {
  const d      = body?.data ?? {}
  const txId   = body?.transaction_id ?? d?.transaction_id ?? d?.id ?? null
  const status = DISPUTE_STATUS[evt]
  const key    = `${txId ?? externalId ?? 'sem-id'}:${evt}`

  let depositId: string | null = null
  let userId:    string | null = null
  if (externalId) {
    const { data: dep } = await supabase
      .from('deposits')
      .select('id, user_id')
      .eq('external_id', externalId)
      .maybeSingle()
    if (dep) { depositId = dep.id; userId = dep.user_id }
  }

  // Prazo de defesa: usa o da BSPay se vier; senao, 7 dias corridos da abertura.
  const rawDeadline = d?.deadline ?? d?.deadline_at ?? d?.due_date ?? null
  let deadlineAt: string | null = null
  if (rawDeadline) {
    const parsed = new Date(rawDeadline)
    if (!Number.isNaN(parsed.getTime())) deadlineAt = parsed.toISOString()
  }
  if (!deadlineAt && status === 'open') {
    deadlineAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
  }

  const { error } = await supabase.from('payment_disputes').insert({
    dedup_key:            key,
    event:                evt,
    status,
    external_id:          externalId,
    bspay_transaction_id: txId,
    deposit_id:           depositId,
    user_id:              userId,
    amount:               Number(d?.amount) || null,
    reason:               d?.reason ?? d?.type ?? null,
    deadline_at:          deadlineAt,
    payload:              body,
  })

  // 23505 = reentrega do mesmo evento. E o comportamento esperado, nao erro.
  if (error && error.code !== '23505') {
    console.error('[PIX webhook] falha ao gravar disputa:', key, error)
  }

  console.error(
    `[PIX webhook] DISPUTA ${status.toUpperCase()} — external_id=${externalId ?? '?'} ` +
    `valor=${d?.amount ?? '?'} prazo=${deadlineAt ?? 'n/a'} — defesa em dev.bspay.co/disputes/reply`,
  )
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const sigHeader   = req.headers.get('x-webhook-signature') ?? ''
  const tsHeader    = req.headers.get('x-webhook-timestamp') ?? ''
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
  const ip          = clientIp(req)
  const event       = req.headers.get('x-webhook-event') ?? ''
  const isSandbox   = req.headers.get('x-sandbox') === '1'

  console.log('[PIX webhook] received', { ip, event, hasSig: !!sigHeader, isSandbox })

  // Evento de teste nao credita saldo real.
  if (isSandbox && !ALLOW_SANDBOX) {
    console.warn('[PIX webhook] rejeitado: evento de sandbox em producao')
    return NextResponse.json({ error: 'Sandbox event rejected' }, { status: 401 })
  }

  // Assinatura velha nao vale (replay). Sem header de timestamp nao da pra
  // checar — ai o HMAC segue valendo pelo corpo, como antes.
  const tsMs    = parseTs(tsHeader)
  const tsFresh = tsMs === null || Math.abs(Date.now() - tsMs) <= SIGNATURE_WINDOW_MS

  // Autenticacao: aceita se QUALQUER um bater —
  //  (a) HMAC com webhook_secret ou client_secret (rawBody ou ts.rawBody)
  //  (b) IP de origem na allowlist do BSPay (rede de seguranca)
  //  (c) query ?secret= (legado)
  const hmacAny = tsFresh && (
    hmacOk(rawBody, sigHeader, WEBHOOK_SECRET) ||
    hmacOk(rawBody, sigHeader, CLIENT_SECRET) ||
    hmacOk(`${tsHeader}.${rawBody}`, sigHeader, WEBHOOK_SECRET) ||
    hmacOk(`${tsHeader}.${rawBody}`, sigHeader, CLIENT_SECRET)
  )
  const ipOk    = !!ip && BSPAY_IPS.includes(ip)
  const queryOk = !!querySecret && querySecret === WEBHOOK_SECRET

  if (!hmacAny && !ipOk && !queryOk) {
    console.warn('[PIX webhook] rejected: sem auth valida', { ip, hasSig: !!sigHeader, tsFresh })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Sinaliza quando so o IP esta segurando a autenticacao — e o modo fragil.
  if (!hmacAny && ipOk) {
    console.warn('[PIX webhook] autenticado SO pelo IP — configure BSPAY_WEBHOOK_SECRET')
  }

  try {
    const body = JSON.parse(rawBody)

    // BSPay Envelope V2: { event, timestamp, transaction_id, data: { external_id, ... } }
    const evt        = body?.event ?? body?.type ?? event
    const externalId = body?.external_id ?? body?.data?.external_id ?? null

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[PIX webhook] SUPABASE_SERVICE_ROLE_KEY ausente')
      return NextResponse.json({ error: 'Server config error' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    // Disputa (MED) — registra e sai. Tem prazo, entao nao pode cair no
    // "evento nao-confirmado, ignorando" la embaixo.
    if (DISPUTE_STATUS[evt]) {
      await recordDispute(supabase, evt, body, externalId)
      return NextResponse.json({ ok: true })
    }

    if (!externalId) {
      console.warn('[PIX webhook] external_id ausente no payload')
      return NextResponse.json({ error: 'external_id missing' }, { status: 400 })
    }

    // Estorno: o dinheiro volta pro pagador, mas o saldo ja foi creditado aqui.
    // NAO ha reversao automatica ainda — registra alto pra nao passar batido.
    if (evt === 'cashin.refunded') {
      console.error(`[PIX webhook] ESTORNO recebido e NAO tratado — external_id=${externalId}`)
      return NextResponse.json({ ok: true })
    }

    // O vocabulario de status do BSPay varia por fluxo: o webhook de SAQUE ja
    // aceitava 'paid'/'completed' enquanto este aqui exigia exatamente
    // 'confirmed', case-sensitive. Qualquer outra grafia caia no `ok: true` la
    // embaixo — o BSPay marcava como entregue e nunca reenviava, entao um
    // pagamento real virava deposito eternamente pendente, sem alarme nenhum.
    const rawStatus = String(body?.data?.status ?? body?.status ?? '').trim()
    const evtStr    = String(evt ?? '').trim()

    const isConfirmed = PAID_WORDS.test(evtStr) || PAID_WORDS.test(rawStatus)

    if (!isConfirmed) {
      // "Aguardando pagamento" e rotina e nao merece ruido. Qualquer outra
      // coisa e vocabulario que nao conhecemos — pode ser pagamento sendo
      // descartado, entao sai como erro. A reconciliacao horaria
      // (/api/cron/reconcile-deposits) e a rede que pega o que passar aqui.
      if (WAITING_WORDS.test(evtStr) || WAITING_WORDS.test(rawStatus)) {
        console.log('[PIX webhook] evento de espera, ignorando:', evtStr || rawStatus)
      } else {
        console.error(
          `[PIX webhook] EVENTO DESCONHECIDO descartado — event="${evtStr}" ` +
          `status="${rawStatus}" external_id=${externalId}`,
        )
      }
      return NextResponse.json({ ok: true })
    }

    // confirm_deposit é idempotente (só age em status='pending') e credita o valor
    // gravado no banco — nao confia no valor do payload.
    const { error } = await supabase.rpc('confirm_deposit', { p_external_id: externalId })
    if (error) {
      console.error('[PIX webhook] confirm_deposit error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[PIX webhook] deposit confirmed: ${externalId}`)

    // Atribuicao de marketing: avisa o TrackFlow (ftd|deposit). Idempotente e
    // tolerante a falha — nunca derruba a confirmacao do deposito.
    await dispatchDeposit(externalId)

    // E-mail de deposito confirmado. Idempotente (email_log) e tolerante a falha.
    const { data: dep } = await supabase
      .from('deposits')
      .select('id, user_id, amount, status, is_fake')
      .eq('external_id', externalId)
      .single()
    if (dep && dep.status === 'confirmed' && !dep.is_fake) {
      await emailDepositConfirmed({ userId: dep.user_id, depositId: dep.id, amount: dep.amount })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[PIX webhook]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
