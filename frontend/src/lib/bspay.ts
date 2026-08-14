/**
 * BSPay API helpers compartilhados.
 *
 * Documentação oficial: https://www.bspay.co/docs (verifique endpoints
 * de cashout — variam conforme habilitação da conta).
 */

const BSPAY_BASE = 'https://api.bspay.co/v2'

const CLIENT_ID     = process.env.BSPAY_CLIENT_ID!
const CLIENT_SECRET = process.env.BSPAY_CLIENT_SECRET!

// BSPay tem allowlist de User-Agent — o valor precisa estar liberado no
// dashboard. Sem isso (fetch do Node manda 'node'), a resposta e 401
// INVALID_CREDENTIALS mesmo com credencial correta.
const USER_AGENT = process.env.BSPAY_USER_AGENT ?? 'VertexMarkets/1.0'

let tokenCache: { token: string; expiresAt: number } | null = null

export async function getBspayToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token

  // Corpo JSON + User-Agent: e a forma exercitada em producao pelo cashin
  // (api/payments/pix/create). A variante form-urlencoded sem User-Agent que
  // morava aqui nunca chegou a rodar em producao — o cashout nao foi usado.
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`${BSPAY_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`BSPay auth failed: ${text}`)
  }

  const data = await res.json()
  tokenCache = {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return tokenCache.token
}

// ---------------------------------------------------------------------------
// CONSULTA DE TRANSACAO — usado pela reconciliacao de depositos
// ---------------------------------------------------------------------------

/** Status que significam "o dinheiro entrou". Comparacao case-insensitive. */
const PAID_WORDS     = /^(cashin\.)?(confirmed|paid|completed|approved|settled|success(ful)?)$/i
/** Status que significam "voltou pro pagador" — nunca creditar. */
const REFUNDED_WORDS = /^(cashin\.)?(refunded|reversed|chargeback|canceled|cancelled|failed|expired)$/i

export interface BspayTxLookup {
  found:      boolean
  status:     string | null   // status cru, exatamente como o BSPay devolveu
  paid:       boolean
  refunded:   boolean
  amount:     number | null
  endToEndId: string | null
  endpoint:   string | null   // qual template de URL respondeu (diagnostico)
  raw:        any
}

// A doc publica do BSPay nao fixa o endpoint de consulta de cashin, e ele varia
// conforme a habilitacao da conta. Em vez de chutar um so, tentamos os
// candidatos em ordem e memorizamos o primeiro que responder 2xx — as chamadas
// seguintes do mesmo processo vao direto nele.
const LOOKUP_TEMPLATES = [
  '/transactions/{id}',
  '/transactions/cashin/{id}',
  '/transaction/{id}',
  '/cashin/{id}',
  '/transactions?id={id}',
  '/transactions?external_id={ext}',
]

let workingTemplate: string | null = null

function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) {
    const v = k.split('.').reduce((o: any, part) => (o == null ? o : o[part]), obj)
    if (v !== undefined && v !== null && v !== '') return v
  }
  return null
}

/** Desembrulha `{data:{...}}`, `{data:[{...}]}` e listas cruas num objeto so. */
function unwrap(raw: any): any {
  let d = raw?.data ?? raw
  if (Array.isArray(d)) d = d[0]
  if (d?.transaction) d = d.transaction
  return d ?? {}
}

/**
 * Pergunta ao BSPay o estado real de uma transacao de cashin.
 *
 * NUNCA lanca por transacao nao encontrada — devolve `found:false`. So lanca se
 * a autenticacao falhar (ai o problema e de configuracao, nao de uma transacao).
 */
export async function bspayGetTransaction(
  bspayId: string | null,
  externalId: string,
): Promise<BspayTxLookup> {
  const token = await getBspayToken()
  const miss: BspayTxLookup = {
    found: false, status: null, paid: false, refunded: false,
    amount: null, endToEndId: null, endpoint: null, raw: null,
  }

  const build = (tpl: string) =>
    tpl.replace('{id}', encodeURIComponent(bspayId ?? externalId))
       .replace('{ext}', encodeURIComponent(externalId))

  // Sem bspay_id, so o template por external_id faz sentido.
  const templates = workingTemplate
    ? [workingTemplate]
    : LOOKUP_TEMPLATES.filter(t => bspayId || t.includes('{ext}'))

  for (const tpl of templates) {
    let res: Response
    try {
      res = await fetch(BSPAY_BASE + build(tpl), {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
      })
    } catch { continue }

    // 404 = este template existe mas nao achou; 4xx/5xx = template errado.
    if (!res.ok) continue

    const raw = await res.json().catch(() => null)
    if (!raw) continue

    const d = unwrap(raw)
    const status = pick(d, 'status', 'transaction_status', 'state')
    if (status === null) continue   // respondeu 200 mas nao e o recurso esperado

    workingTemplate = tpl

    const amountRaw = pick(d, 'amount', 'value', 'payment_info.amount')
    const amount    = amountRaw === null ? null : Number(amountRaw)
    const s         = String(status).trim()

    return {
      found:      true,
      status:     s,
      paid:       PAID_WORDS.test(s),
      refunded:   REFUNDED_WORDS.test(s),
      amount:     Number.isFinite(amount as number) ? (amount as number) : null,
      endToEndId: pick(d, 'e2e_id', 'end_to_end_id', 'endToEndId', 'payment_info.e2e_id'),
      endpoint:   tpl,
      raw,
    }
  }

  return miss
}

/** Templates tentados — usado no relatorio quando nenhum responde. */
export const BSPAY_LOOKUP_TEMPLATES = LOOKUP_TEMPLATES

// ---------------------------------------------------------------------------
// CASHOUT (PIX payout) — usado para pagar saques de usuários
// ---------------------------------------------------------------------------

export interface CashoutPayload {
  amount:        number          // R$, mesmo formato do cashin
  pixKey:        string
  pixKeyType:    'cpf' | 'cnpj' | 'email' | 'phone' | 'random'
  externalId:    string          // ID interno (vamos usar o withdrawal.id)
  postbackUrl?:  string          // BSPay chama quando o pagamento liquida
  payerName?:    string
}

export interface CashoutResponse {
  bspayPayoutId: string           // ID gerado pela BSPay
  status:        'pending' | 'completed' | 'failed' | string
  e2eId?:        string           // End-to-end ID do PIX (pra comprovante)
  raw:           any              // resposta completa pra debug
}

export async function bspayCashout(p: CashoutPayload): Promise<CashoutResponse> {
  const token = await getBspayToken()

  // Mapeamento de tipo de chave (BSPay usa códigos próprios — verifique a doc)
  const KEY_TYPE_MAP: Record<string, string> = {
    cpf:    'CPF',
    cnpj:   'CNPJ',
    email:  'EMAIL',
    phone:  'PHONE',
    random: 'EVP',     // Endereço Virtual de Pagamento (chave aleatória)
  }

  const body: any = {
    amount:      p.amount,
    currency:    'BRL',
    external_id: p.externalId,
    pix: {
      key:      p.pixKey,
      key_type: KEY_TYPE_MAP[p.pixKeyType] ?? p.pixKeyType.toUpperCase(),
    },
  }
  if (p.postbackUrl) body.postback_url = p.postbackUrl
  if (p.payerName)   body.payer_name   = p.payerName

  const res = await fetch(`${BSPAY_BASE}/transactions/cashout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,   // allowlist do BSPay — sem isso, 401
    },
    body: JSON.stringify(body),
  })

  const raw = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg = raw?.message || raw?.error || JSON.stringify(raw)
    throw new Error(`BSPay cashout failed (${res.status}): ${msg}`)
  }

  return {
    bspayPayoutId: raw?.data?.id ?? raw?.data?.transaction_id ?? raw?.id ?? '',
    status:        raw?.data?.status ?? raw?.status ?? 'pending',
    e2eId:         raw?.data?.e2e_id ?? raw?.data?.end_to_end_id ?? raw?.e2e_id,
    raw,
  }
}
