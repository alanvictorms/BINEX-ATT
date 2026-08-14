// API de LEITURA (pull) para o TrackFlow puxar Usuários / Depósitos / Saques
// (backfill + reconciliação). Complementa o empurrão em tempo real de `trackflow.ts`.
//
// SEGURANÇA (server-only, NUNCA importar no client):
//  - Protegida por TRACKFLOW_READ_TOKEN — token DEDICADO e SÓ-LEITURA.
//    NÃO é a service_role e NÃO é o VERTEX_WEBHOOK_SECRET (esse é do empurrão).
//  - As rotas só fazem SELECT/listUsers (nenhuma escrita).
//  - PII minimizada: não expomos cpf, phone nem pix_key (o TrackFlow não precisa).

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

// Piso de FTD (mesmo default do empurrão). O TrackFlow usa pra derivar FTD na leitura.
export const FTD_MIN = Number(process.env.TRACKFLOW_FTD_MIN_BRL ?? 50)

/** Compara dois segredos em tempo constante (evita timing attack no token). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Autoriza a requisição de leitura do TrackFlow via `Authorization: Bearer <token>`.
 * Retorna null se ok; senão devolve um NextResponse de erro já pronto.
 */
export function authorizeExport(req: NextRequest): NextResponse | null {
  const token = process.env.TRACKFLOW_READ_TOKEN
  if (!token) {
    // Endpoint construído mas não configurado (sem token em ambiente) -> recusa.
    return NextResponse.json({ error: 'EXPORT_NOT_CONFIGURED' }, { status: 503 })
  }
  const header = req.headers.get('authorization') ?? ''
  const got = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!got || !safeEqual(got, token)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  return null
}

/** Cliente service-role sem sessão (server-only). */
export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/** Lê limit/offset/since da query com tetos seguros (paginação por offset). */
export function readPaging(req: NextRequest, def = 500, max = 1000) {
  const sp = req.nextUrl.searchParams
  const limit = Math.min(max, Math.max(1, Number(sp.get('limit') ?? def) || def))
  const offset = Math.max(0, Number(sp.get('offset') ?? 0) || 0)
  const sinceRaw = sp.get('since')
  const since =
    sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : null
  return { limit, offset, since }
}
