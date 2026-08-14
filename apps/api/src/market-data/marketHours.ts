// Horario do mercado forex: fecha no fim de semana (Sex 22:00 UTC -> Dom 22:00 UTC),
// como o mercado tradicional. MESMA regra de apps/web/src/lib/marketHours.ts
// (banner + botoes) e da RPC is_forex_open_now() no Supabase (place_trade rejeita
// MARKET_CLOSED no servidor) — ver apps/api/sql/2026-07-09-rpc-snapshot-live-settlement.sql.
// Se mudar a regra aqui, mude nos tres lugares.
export function isForexOpenAt(d: Date): boolean {
  const day  = d.getUTCDay()      // 0 = domingo ... 6 = sabado
  const hour = d.getUTCHours()
  if (day === 6) return false                  // sabado: fechado
  if (day === 5 && hour >= 22) return false    // sexta apos 22h UTC
  if (day === 0 && hour < 22)  return false    // domingo antes das 22h UTC
  return true
}

export function isForexOpenNow(): boolean { return isForexOpenAt(new Date()) }
