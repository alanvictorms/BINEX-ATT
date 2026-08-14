import { NextRequest, NextResponse } from 'next/server'
import { authorizeExport, serviceClient, readPaging, FTD_MIN } from '@/lib/trackflow-export'

// GET /api/trackflow/export/deposits?since=ISO&limit=500&offset=0&status=confirmed
//
// Depósitos para reconciliação. Ordenado por created_at asc (paginação estável).
// `since` filtra por created_at >= ISO; `status` opcional ('confirmed' | 'pending').
//
// FTD NÃO é marcado por linha (a classificação é por trader e atravessa páginas).
// O TrackFlow deriva FTD = 1º depósito confirmed, !is_fake e amount >= `ftd_min`
// (devolvido no rodapé) — mesma regra do empurrão em tempo real.
export async function GET(req: NextRequest) {
  const deny = authorizeExport(req)
  if (deny) return deny

  const { limit, offset, since } = readPaging(req)
  const status = req.nextUrl.searchParams.get('status')
  const svc = serviceClient()

  let q = svc
    .from('deposits')
    .select('id, external_id, user_id, amount, status, is_fake, created_at, confirmed_at')
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)
  if (since) q = q.gte('created_at', since)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: 'QUERY_FAILED', detail: error.message }, { status: 502 })
  }

  const rows = (data ?? []).map((d) => ({
    id:           d.id,
    external_id:  d.external_id ?? null,
    trader_id:    d.user_id,
    amount:       Number(d.amount),
    currency:     'BRL',
    status:       d.status,
    is_fake:      d.is_fake ?? false,
    created_at:   d.created_at,
    confirmed_at: d.confirmed_at ?? null,
  }))

  return NextResponse.json({
    resource: 'deposits',
    ftd_min: FTD_MIN,
    limit,
    offset,
    since,
    count: rows.length,
    has_more: rows.length === limit,
    data: rows,
  })
}
