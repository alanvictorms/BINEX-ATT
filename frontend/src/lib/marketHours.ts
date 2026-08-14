/**
 * Horário de funcionamento dos mercados.
 *
 * Regras:
 * - Forex / Matérias-Primas / Ações: abre Domingo 22:00 UTC, fecha Sexta 22:00 UTC
 *   (= 17:00 NY time / 19:00 BRT inverno)
 * - Crypto: 24/7
 * - OTC: 24/7 por padrão, ou a janela definida por par no Admin → OTC → Sessão
 *
 * Referência: Forex segue horário do mercado de Nova York. O mercado fica fechado
 * de Sexta-feira 17:00 EST até Domingo 17:00 EST.
 */

import type { Asset } from '@/lib/mockData'
import { assetIdToOtcSymbol } from '@/lib/otcClient'
import { otcWindowOpen, otcWindowNextOpen } from '@/lib/otcSession'

export type MarketStatus = 'open' | 'closed'

// ── Sessões OTC (Admin → OTC → Sessão) ──────────────────────────────────────
// Cache de módulo alimentado por loadOtcSessions() (lib/useOtcSessions.ts). Fica
// aqui porque isMarketOpen é síncrona e chamada a cada tick de render.
//
// Quem decide de verdade é o place_trade no Postgres — isto é só pra tela não
// oferecer um botão que vai falhar. Cache vazio = tudo aberto (nunca fecha par
// por falha de rede).
export type OtcSession = { start: string | null; end: string | null }
const otcSessions = new Map<string, OtcSession>()   // chave: símbolo OTC do backend

export function setOtcSessions(entries: Array<{ symbol: string } & OtcSession>) {
  otcSessions.clear()
  for (const e of entries) otcSessions.set(e.symbol.toUpperCase(), { start: e.start, end: e.end })
}

/**
 * A regra da janela vive em lib/otcSession.ts — mesma aritmética de
 * public.otc_session_open() no Postgres e do motor OTC.
 */
export function isOtcSessionOpen(assetId: string, now: Date = new Date()): boolean {
  const symbol = assetIdToOtcSymbol(assetId)
  if (!symbol) return true
  const s = otcSessions.get(symbol.toUpperCase())
  if (!s) return true
  return otcWindowOpen(s.start, s.end, now)
}

/**
 * Retorna se o mercado de um determinado ativo está aberto agora.
 */
export function isMarketOpen(asset: Asset, now: Date = new Date()): boolean {
  // OTC: 24/7, a menos que o par tenha janela de negociação definida no admin
  if (asset.type === 'OTC') return isOtcSessionOpen(asset.id, now)

  // Crypto opera 24/7
  if (asset.type === 'Crypto') return true

  // Forex / Commodities / Stocks → checa janela de funcionamento
  return isForexOpen(now)
}

/**
 * Forex/Stock/Commodity:
 *   Aberto:  Domingo 22:00 UTC  →  Sexta-feira 22:00 UTC
 *   Fechado: Sexta 22:00 UTC    →  Domingo 22:00 UTC
 */
export function isForexOpen(now: Date = new Date()): boolean {
  const day  = now.getUTCDay()    // 0 = Domingo, 1..5 = Seg..Sex, 6 = Sábado
  const hour = now.getUTCHours()

  // Sábado: sempre fechado
  if (day === 6) return false

  // Domingo: fechado antes das 22:00 UTC, aberto depois
  if (day === 0) return hour >= 22

  // Sexta: aberto antes das 22:00 UTC, fechado depois
  if (day === 5) return hour < 22

  // Segunda a Quinta: sempre aberto
  return true
}

/**
 * Próximo horário em que o mercado abre (para countdown).
 * Retorna null se o mercado já está aberto.
 */
export function nextOpenAt(asset: Asset, now: Date = new Date()): Date | null {
  if (isMarketOpen(asset, now)) return null
  if (asset.type === 'OTC') return nextOtcOpenAt(asset.id, now)
  return nextForexOpenAt(now)
}

/**
 * Próxima abertura de um par OTC com janela definida: a próxima ocorrência do
 * horário de início, em UTC. Cai no comportamento do forex se não houver janela
 * (não deveria acontecer — o caller só chega aqui com o par fechado).
 */
export function nextOtcOpenAt(assetId: string, now: Date = new Date()): Date {
  const symbol = assetIdToOtcSymbol(assetId)
  const s = symbol ? otcSessions.get(symbol.toUpperCase()) : undefined
  return otcWindowNextOpen(s?.start, s?.end, now) ?? nextForexOpenAt(now)
}

export function nextForexOpenAt(now: Date = new Date()): Date {
  // Sempre aponta para o próximo Domingo 22:00 UTC
  const result = new Date(now)
  const day = result.getUTCDay()

  // Se hoje é Domingo antes das 22:00, abre hoje mesmo às 22:00
  if (day === 0 && result.getUTCHours() < 22) {
    result.setUTCHours(22, 0, 0, 0)
    return result
  }

  // Caso contrário, avança até o próximo Domingo
  const daysUntilSunday = (7 - day) % 7 || 7  // se hoje é Dom > 22:00, próximo Dom
  result.setUTCDate(result.getUTCDate() + daysUntilSunday)
  result.setUTCHours(22, 0, 0, 0)
  return result
}

/**
 * Formata "tempo restante até abertura" em pt-BR.
 *   "abre em 2d 14h"
 *   "abre em 3h 22min"
 *   "abre em 45min"
 */
export function formatTimeUntil(target: Date, now: Date = new Date()): string {
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) return 'abrindo...'
  const totalMinutes = Math.floor(ms / 60000)
  const days  = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const mins  = totalMinutes % 60

  if (days  > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}min`
  return `${mins}min`
}
