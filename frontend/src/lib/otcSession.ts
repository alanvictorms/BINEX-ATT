// Janela de negociação de um par OTC — cópia da regra do servidor, só pra tela.
//
// A mesma função existe em três lugares e as três precisam concordar:
//   1. public.otc_session_open()                    — autoridade (place_trade)
//   2. apps/api/src/market-data/otc/session.ts      — motor de preço
//   3. esta                                         — só decide o que a tela mostra
//
// Sem imports de propósito: qualquer dependência aqui vira dependência do
// isMarketOpen(), que roda a cada tick de render.
//
// Regras:
//   null/vazio em qualquer um dos dois campos = 24 horas
//   início == fim                            = 24 horas
//   início <  fim                            = janela normal, fim EXCLUSIVO
//   início >  fim                            = janela que cruza a meia-noite
// Falha segura: string malformada devolve ABERTO.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function toMin(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
}

export function otcWindowOpen(
  start: string | null | undefined,
  end: string | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!start || !end) return true
  const s = start.trim()
  const e = end.trim()
  if (!HHMM.test(s) || !HHMM.test(e)) return true

  const now  = at.getUTCHours() * 60 + at.getUTCMinutes()
  const from = toMin(s)
  const to   = toMin(e)

  if (from === to) return true
  return from < to ? now >= from && now < to : now >= from || now < to
}

/** Próxima abertura da janela, em UTC. null quando o par é 24 horas. */
export function otcWindowNextOpen(
  start: string | null | undefined,
  end: string | null | undefined,
  at: Date = new Date(),
): Date | null {
  if (!start || !end) return null
  const s = start.trim()
  if (!HHMM.test(s) || !HHMM.test(end.trim())) return null

  const open = new Date(at)
  open.setUTCHours(Number(s.slice(0, 2)), Number(s.slice(3, 5)), 0, 0)
  if (open.getTime() <= at.getTime()) open.setUTCDate(open.getUTCDate() + 1)
  return open
}
