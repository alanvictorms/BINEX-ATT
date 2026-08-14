'use client'

// Carrega as janelas de negociação dos pares OTC (Admin → OTC → Sessão) e
// alimenta o cache de módulo que isMarketOpen() consulta.
//
// Por que existe: isMarketOpen(asset, now) é síncrona e roda a cada tick de
// render — não pode fazer fetch. Então o fetch acontece aqui, uma vez por
// processo (deduplicado), e o hook força um re-render quando o dado chega.
//
// Quem decide de verdade é o place_trade no Postgres. Isto é só pra tela não
// oferecer um botão que vai falhar com MARKET_CLOSED. Falha de rede = cache
// vazio = tudo aberto, exatamente como era antes.

import { useEffect, useState } from 'react'
import { setOtcSessions } from '@/lib/marketHours'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const REFRESH_MS = 60_000

type ApiAsset = {
  symbol: string
  sessionStartUtc: string | null
  sessionEndUtc:   string | null
}

let inFlight: Promise<void> | null = null
let lastLoadedAt = 0

export async function loadOtcSessions(force = false): Promise<void> {
  if (!force && Date.now() - lastLoadedAt < REFRESH_MS) return
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/market-data/otc`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      const assets: ApiAsset[] = Array.isArray(json?.assets) ? json.assets : []
      setOtcSessions(assets.map(a => ({
        symbol: a.symbol,
        start:  a.sessionStartUtc,
        end:    a.sessionEndUtc,
      })))
      lastLoadedAt = Date.now()
    } catch {
      // sem sessões = tudo aberto; o servidor recusa se estiver fechado
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/**
 * Mantém as sessões OTC carregadas enquanto o componente estiver montado.
 * Retorna um contador que muda quando os dados chegam — só serve pra disparar
 * o re-render de quem chama isMarketOpen().
 */
export function useOtcSessions(): number {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    const tick = (force = false) => {
      loadOtcSessions(force).then(() => { if (alive) setVersion(v => v + 1) })
    }
    tick()
    const t = setInterval(() => tick(true), REFRESH_MS)
    return () => { alive = false; clearInterval(t) }
  }, [])

  return version
}
