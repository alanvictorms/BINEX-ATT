import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Oferta de bônus de 1º depósito — a MESMA regra que o grant_first_deposit_bonus
// lê no banco (app_config, editável em /admin/bonus). Serve o popup de boas-vindas
// e o banner do modal de depósito: o que o lead vê é o que o banco concede.
// Leitura com service role (app_config não tem leitura pública); só chaves de
// bônus saem daqui — nada sensível.

const BONUS_KEYS = [
  'bonusFirstDepositEnabled',
  'bonusDepositPcts',            // escada [200,100,50] — bônus dos 3 primeiros depósitos
  'bonusFirstDepositPct',        // fallback (banco: pct único do 1º depósito)
  'bonusFirstDepositMaxAmount',
  'bonusRolloverMultiplier',
  'bonusMinDeposit',
] as const

let cached: { offer: Offer; ts: number } | null = null
const CACHE_TTL = 60_000  // regra muda raramente; 60s de cache segura a carga

interface Offer {
  enabled: boolean
  pcts: number[]     // escada de percentuais por depósito (1º, 2º, 3º...)
  pct: number        // pcts[0] — compat com quem só lê o 1º percentual
  maxAmount: number
  rollover: number
  minDeposit: number
}

export async function GET() {
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.offer)
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', [...BONUS_KEYS])
    if (error) throw error

    const cfg = new Map((data ?? []).map(r => [r.key as string, r.value]))
    const num = (k: string, fallback: number) => {
      const v = Number(cfg.get(k))
      return Number.isFinite(v) ? v : fallback
    }

    // Escada: usa bonusDepositPcts se válida; senão cai pro pct único (comportamento antigo).
    // Espelha exatamente o fallback do grant_first_deposit_bonus no banco.
    const firstPct = num('bonusFirstDepositPct', 100)
    let pcts: number[] = []
    const raw = cfg.get('bonusDepositPcts')
    const arr = typeof raw === 'string' ? safeParse(raw) : raw
    if (Array.isArray(arr)) {
      pcts = arr.map(Number).filter(n => Number.isFinite(n) && n > 0)
    }
    if (pcts.length === 0) pcts = [firstPct]

    const offer: Offer = {
      enabled:    String(cfg.get('bonusFirstDepositEnabled') ?? 'true') === 'true',
      pcts,
      pct:        pcts[0],
      maxAmount:  num('bonusFirstDepositMaxAmount', 300),
      rollover:   num('bonusRolloverMultiplier', 20),
      minDeposit: num('bonusMinDeposit', 0),
    }
    cached = { offer, ts: Date.now() }
    return NextResponse.json(offer)
  } catch {
    // Sem regra legível => sem oferta anunciada (popup não aparece; banner usa fallback)
    return NextResponse.json({ error: 'offer unavailable' }, { status: 502 })
  }
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}
