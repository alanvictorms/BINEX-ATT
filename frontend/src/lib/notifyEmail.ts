/**
 * Dispara um e-mail transacional via /api/notify (fire-and-forget).
 * Nunca lança nem bloqueia a UI — o servidor valida o estado real no banco
 * antes de enviar, então chamar isto "à toa" não envia nada indevido.
 */
export function notifyEmail(
  kind:
    | 'deposit_confirmed'
    | 'withdrawal_requested'
    | 'withdrawal_rejected'
    | 'withdrawal_paid'
    | 'kyc_approved'
    | 'kyc_rejected',
  id?: string,
): void {
  fetch('/api/notify', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ kind, id }),
  }).catch(() => { /* e-mail é best-effort — nunca quebra o fluxo principal */ })
}
