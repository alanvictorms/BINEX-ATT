import { NextRequest, NextResponse } from 'next/server'
import { authorizeExport, serviceClient, readPaging } from '@/lib/trackflow-export'

// GET /api/trackflow/export/withdrawals?since=ISO&limit=500&offset=0&status=paid
//
// Saques para o TrackFlow calcular o LÍQUIDO (depósitos − saques) por trader.
// Ordenado por created_at asc; `since` e `status` opcionais.
// NÃO expomos pix_key/pix_key_type (PII): o tracker só precisa de valor/data/trader_id.
export async function GET(req: NextRequest) {
  const deny = authorizeExport(req)
  if (deny) return deny

  const { limit, offset, since } = readPaging(req)
  const status = req.nextUrl.searchParams.get('status')
  const svc = serviceClient()

  let q = svc
    .from('withdrawals')
    .select('id, user_id, amount, status, created_at, processed_at')
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)
  if (since) q = q.gte('created_at', since)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: 'QUERY_FAILED', detail: error.message }, { status: 502 })
  }

  const rows = (data ?? []).map((w) => ({
    id:           w.id,
    trader_id:    w.user_id,
    amount:       Number(w.amount),
    currency:     'BRL',
    status:       w.status,
    created_at:   w.created_at,
    processed_at: w.processed_at ?? null,
  }))

  return NextResponse.json({
    resource: 'withdrawals',
    limit,
    offset,
    since,
    count: rows.length,
    has_more: rows.length === limit,
    data: rows,
  })
}
