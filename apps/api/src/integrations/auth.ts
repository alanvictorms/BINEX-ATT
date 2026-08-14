import { createHmac, timingSafeEqual } from 'node:crypto'

// ── Autenticacao de SERVICO (maquina-a-maquina) ─────────────────────────────────
//
// Usada SOMENTE pelas rotas /integrations, chamadas pelo backend do PulseHacker
// (nunca pelo navegador). Em vez de um JWT de usuario, o chamador assina cada
// request com um segredo compartilhado (PULSEHACKER_SERVICE_SECRET).
//
// Assinatura = HMAC-SHA256(secret, message), onde `message` e uma string canonica
// montada pela rota a partir dos campos ja validados (nao do corpo cru) — assim
// nao dependemos de capturar o raw body no Fastify, e cliente/servidor montam a
// mesma string de forma deterministica.
//
// Protecoes:
//  - timestamp obrigatorio e dentro de uma janela curta  -> anti-replay
//  - comparacao em tempo constante (timingSafeEqual)      -> anti timing attack
//  - segredo so existe no servidor                        -> nunca vai pro client

export const SERVICE_HEADERS = {
  timestamp: 'x-vertex-timestamp',
  signature: 'x-vertex-signature',
} as const

// Janela maxima de validade de um request assinado (anti-replay).
const MAX_SKEW_MS = 5 * 60 * 1000

export class ServiceAuthError extends Error {
  constructor(public code: 'SERVICE_AUTH_MISSING' | 'SERVICE_AUTH_STALE' | 'SERVICE_AUTH_INVALID') {
    super(code)
  }
}

function serviceSecret(): string {
  const secret = process.env.PULSEHACKER_SERVICE_SECRET
  if (!secret || secret.length < 16) {
    // Falha fechada: sem segredo configurado, a integracao inteira fica indisponivel.
    throw new ServiceAuthError('SERVICE_AUTH_MISSING')
  }
  return secret
}

export function signMessage(message: string): string {
  return createHmac('sha256', serviceSecret()).update(message).digest('hex')
}

/**
 * Verifica a assinatura de servico de um request.
 * `message` deve ser a MESMA string canonica que o chamador assinou.
 * Lanca ServiceAuthError em qualquer falha — nunca retorna false silencioso.
 */
export function verifyServiceRequest(
  headers: Record<string, string | string[] | undefined>,
  message: string,
): void {
  const tsRaw  = headers[SERVICE_HEADERS.timestamp]
  const sigRaw = headers[SERVICE_HEADERS.signature]
  const ts  = Array.isArray(tsRaw)  ? tsRaw[0]  : tsRaw
  const sig = Array.isArray(sigRaw) ? sigRaw[0] : sigRaw
  if (!ts || !sig) throw new ServiceAuthError('SERVICE_AUTH_MISSING')

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > MAX_SKEW_MS) {
    throw new ServiceAuthError('SERVICE_AUTH_STALE')
  }

  // A mensagem assinada inclui o proprio timestamp -> assinatura amarra o tempo.
  const expected = signMessage(`${tsNum}.${message}`)

  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(sig, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ServiceAuthError('SERVICE_AUTH_INVALID')
  }
}
