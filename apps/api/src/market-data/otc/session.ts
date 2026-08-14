// Janela de negociação de um par OTC. Sem dependências de propósito: esta função
// existe em TRÊS lugares que precisam concordar exatamente, senão o motor para de
// tickar um par que o place_trade ainda aceita (ou o contrário).
//
//   1. public.otc_session_open()          — sql/2026-08-05-otc-controle-preco.sql
//   2. esta (motor OTC + rota pública)
//   3. apps/web/src/lib/otcSession.ts     — só pra tela; não decide nada
//
// Regras:
//   null/vazio em qualquer um dos dois campos = 24 horas
//   início == fim                            = 24 horas
//   início <  fim                            = janela normal, fim EXCLUSIVO
//   início >  fim                            = janela que cruza a meia-noite
//
// Falha segura: string malformada devolve ABERTO. Um par não deve sumir do ar por
// causa de valor corrompido no banco.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function toMin(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
}

export function isOtcSessionOpen(
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
export function nextOtcOpenAt(
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
