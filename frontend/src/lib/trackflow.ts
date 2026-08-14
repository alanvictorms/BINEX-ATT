// Cliente do webhook TrackFlow (server-only). NUNCA importar no client:
// usa VERTEX_WEBHOOK_SECRET e a service_role do Supabase.
//
// Contrato (ver memory project_trackflow_integration):
//   POST {TRACKFLOW_EVENT_URL}  ->  ex: https://<dominio-trackflow>/api/vertex/event
//   Header: X-Vertex-Webhook-Secret: <VERTEX_WEBHOOK_SECRET>
//   Body:   { type, ref, trader_id, amount?, currency, email?, country?, event_id, occurred_at }
//   type:   registration | ftd | deposit
//   event_id ESTAVEL por evento -> reenvio em 5xx/timeout e idempotente do lado TrackFlow.

import { createClient } from '@supabase/supabase-js'

const EVENT_URL = process.env.TRACKFLOW_EVENT_URL ?? ''
const SECRET    = process.env.VERTEX_WEBHOOK_SECRET ?? ''

// Piso de deposito reportado ao TrackFlow (e dali ao Facebook CAPI). Depositos
// abaixo disso NAO viram evento: mantem o sinal de otimizacao limpo e casa com o
// minimo anunciado na oferta. FTD = 1o deposito confirmado >= este piso.
// Override opcional via env; default R$50.
const FTD_MIN = Number(process.env.TRACKFLOW_FTD_MIN_BRL ?? 50)

// Integracao com o PulsePro: um deposito confirmado >= piso FTD libera/renova
// 30 dias de acesso a ferramenta. Desligada enquanto as duas envs faltarem.
const PULSEPRO_URL    = process.env.PULSEPRO_DEPOSIT_WEBHOOK_URL ?? ''
const PULSEPRO_SECRET = process.env.PULSEPRO_DEPOSIT_WEBHOOK_SECRET ?? ''

export type TrackFlowType = 'registration' | 'ftd' | 'deposit'

interface TrackFlowEvent {
  type:        TrackFlowType
  ref:         string | null
  trader_id:   string
  amount?:     number
  currency?:   string
  email?:      string
  country?:    string
  event_id:    string
  occurred_at: string
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Envia um evento ao TrackFlow. Tolera falha: nunca lanca para o chamador
 * (cadastro/deposito do usuario nao pode quebrar se o tracker estiver fora).
 * Reenvia em 5xx/timeout (idempotencia protege via event_id).
 */
async function sendTrackFlowEvent(event: TrackFlowEvent): Promise<void> {
  if (!EVENT_URL || !SECRET) {
    console.warn('[trackflow] TRACKFLOW_EVENT_URL/VERTEX_WEBHOOK_SECRET ausentes — evento ignorado:', event.type)
    return
  }

  const body = JSON.stringify({ currency: 'BRL', ...event })
  const MAX_ATTEMPTS = 3

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(EVENT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vertex-Webhook-Secret': SECRET,
        },
        body,
        signal: ctrl.signal,
      })
      clearTimeout(timer)

      // 2xx (inclui duplicate:true) -> entregue. 4xx (ex: 403 secret, 400 type) -> nao reenvia.
      if (res.ok) {
        console.log(`[trackflow] ${event.type} entregue (event_id=${event.event_id})`)
        return
      }
      if (res.status >= 400 && res.status < 500) {
        const txt = await res.text().catch(() => '')
        console.error(`[trackflow] ${event.type} rejeitado ${res.status}: ${txt}`)
        return
      }
      console.warn(`[trackflow] ${event.type} 5xx (tentativa ${attempt}/${MAX_ATTEMPTS}) status=${res.status}`)
    } catch (err: any) {
      clearTimeout(timer)
      console.warn(`[trackflow] ${event.type} falha de rede (tentativa ${attempt}/${MAX_ATTEMPTS}): ${err?.message}`)
    }
    if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 500 * attempt))
  }
  console.error(`[trackflow] ${event.type} desistiu apos ${MAX_ATTEMPTS} tentativas (event_id=${event.event_id})`)
}

/**
 * Avisa o PulsePro que um deposito confirmado (>= piso FTD) aconteceu, para
 * liberar/renovar 30 dias de acesso. Casa o usuario por vertex_user_id
 * (preferencial) ou email. Idempotente do lado do PulsePro via deposit_id.
 * Tolera falha: nunca lanca — o deposito do usuario nao pode quebrar se o
 * PulsePro estiver fora.
 */
async function notifyPulseProDeposit(input: {
  vertexUserId: string
  email?: string
  amount: number
  depositId: string
}): Promise<void> {
  if (!PULSEPRO_URL || !PULSEPRO_SECRET) return // integracao desligada

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(PULSEPRO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-token': PULSEPRO_SECRET,
      },
      body: JSON.stringify({
        source:         'vertex',
        vertex_user_id: input.vertexUserId,
        email:          input.email,
        amount:         input.amount,
        deposit_id:     input.depositId,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (res.ok) {
      console.log(`[pulsepro] acesso notificado (deposit_id=${input.depositId})`)
    } else {
      console.warn(`[pulsepro] deposito nao aceito ${res.status} (deposit_id=${input.depositId})`)
    }
  } catch (err: any) {
    clearTimeout(timer)
    console.warn(`[pulsepro] falha ao notificar deposito (deposit_id=${input.depositId}): ${err?.message}`)
  }
}

/** Le ref + email do usuario a partir dos metadados do auth (onde o signUp gravou a atribuicao). */
async function readUserMarketing(userId: string): Promise<{ ref: string | null; email?: string }> {
  const supabase = adminClient()
  const { data, error } = await supabase.auth.admin.getUserById(userId)
  if (error || !data?.user) {
    console.warn('[trackflow] getUserById falhou:', error?.message)
    return { ref: null }
  }
  const attribution = (data.user.user_metadata as any)?.attribution
  return { ref: attribution?.ref ?? null, email: data.user.email ?? undefined }
}

/**
 * Dispara o evento de cadastro. Idempotente: event_id = reg_<userId>.
 * Chamado pela rota /api/trackflow/register logo apos o signUp.
 */
export async function dispatchRegistration(userId: string, email?: string, ref?: string | null): Promise<void> {
  // ref/email podem vir do JWT (rota register) ou serem lidos do auth como fallback.
  let finalRef = ref ?? null
  let finalEmail = email
  if (finalRef === undefined || finalRef === null || !finalEmail) {
    const m = await readUserMarketing(userId)
    if (finalRef == null) finalRef = m.ref
    if (!finalEmail) finalEmail = m.email
  }
  await sendTrackFlowEvent({
    type:        'registration',
    ref:         finalRef,
    trader_id:   userId,
    email:       finalEmail,
    event_id:    `reg_${userId}`,
    occurred_at: new Date().toISOString(),
  })
}

/**
 * Dispara o evento de deposito (ftd no 1o, deposit nos demais).
 * Idempotente: event_id = o external_id do deposito (unico e estavel).
 * Le tudo do banco com service_role -> nao confia em valores do chamador.
 */
export async function dispatchDeposit(externalId: string): Promise<void> {
  const supabase = adminClient()

  const { data: dep, error } = await supabase
    .from('deposits')
    .select('user_id, amount, status, confirmed_at, created_at, is_fake')
    .eq('external_id', externalId)
    .single()

  if (error || !dep) {
    console.warn('[trackflow] deposito nao encontrado para dispatch:', externalId, error?.message)
    return
  }
  if (dep.status !== 'confirmed') {
    console.log('[trackflow] deposito nao confirmado, ignorando dispatch:', externalId, dep.status)
    return
  }
  if (dep.is_fake) {
    console.log('[trackflow] deposito marcado fake, ignorando dispatch:', externalId)
    return
  }
  if (Number(dep.amount) < FTD_MIN) {
    console.log(`[trackflow] deposito abaixo do piso de R$${FTD_MIN}, ignorando dispatch:`, externalId, dep.amount)
    return
  }

  // FTD = este e o 1o deposito confirmado >= o piso (ordenado por confirmacao).
  // Depositos abaixo do piso nao contam nem como FTD nem deslocam o FTD real.
  const { data: firstRows } = await supabase
    .from('deposits')
    .select('external_id')
    .eq('user_id', dep.user_id)
    .eq('status', 'confirmed')
    .or('is_fake.is.null,is_fake.eq.false')
    .gte('amount', FTD_MIN)
    .order('confirmed_at', { ascending: true, nullsFirst: false })
    .order('created_at',   { ascending: true })
    .limit(1)

  const isFtd = firstRows?.[0]?.external_id === externalId
  const { ref, email } = await readUserMarketing(dep.user_id)

  await sendTrackFlowEvent({
    type:        isFtd ? 'ftd' : 'deposit',
    ref,
    trader_id:   dep.user_id,
    amount:      Number(dep.amount),
    email,
    event_id:    externalId,
    occurred_at: dep.confirmed_at ?? new Date().toISOString(),
  })

  // Alem do tracking, libera/renova 30 dias de acesso no PulsePro. Vale para ftd
  // E deposit (recarga) — o piso FTD ja foi garantido pelos guards acima.
  await notifyPulseProDeposit({
    vertexUserId: dep.user_id,
    email,
    amount:       Number(dep.amount),
    depositId:    externalId,
  })
}
