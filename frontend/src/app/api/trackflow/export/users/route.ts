import { NextRequest, NextResponse } from 'next/server'
import { authorizeExport, serviceClient } from '@/lib/trackflow-export'

// GET /api/trackflow/export/users?page=1&perPage=200
//
// Lista usuários para o TrackFlow casar atribuição (ref) e fazer backfill.
// email + ref vivem no Supabase Auth (auth.users.user_metadata.attribution),
// por isso paginamos pela Admin API (page/perPage 1-based, perPage máx 1000).
// name + kyc_status vêm da tabela `profiles` (1 query por página, sem N+1).
// NÃO expomos cpf/phone (PII desnecessária ao tracker).
export async function GET(req: NextRequest) {
  const deny = authorizeExport(req)
  if (deny) return deny

  const sp = req.nextUrl.searchParams
  const perPage = Math.min(1000, Math.max(1, Number(sp.get('perPage') ?? 200) || 200))
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1)

  const svc = serviceClient()

  const { data, error } = await svc.auth.admin.listUsers({ page, perPage })
  if (error) {
    return NextResponse.json({ error: 'LIST_USERS_FAILED', detail: error.message }, { status: 502 })
  }
  const users = data?.users ?? []

  // Enriquece com profiles (name, kyc_status) numa única query in(ids).
  const ids = users.map((u) => u.id)
  const profileById = new Map<string, { name: string | null; kyc_status: string | null }>()
  if (ids.length) {
    const { data: profs } = await svc
      .from('profiles')
      .select('id, name, kyc_status')
      .in('id', ids)
    for (const p of profs ?? []) {
      profileById.set(p.id, { name: p.name ?? null, kyc_status: p.kyc_status ?? null })
    }
  }

  const rows = users.map((u) => {
    const attr = ((u.user_metadata as any)?.attribution ?? {}) as Record<string, unknown>
    const prof = profileById.get(u.id)
    return {
      trader_id:    u.id,
      email:        u.email ?? null,
      name:         prof?.name ?? null,
      ref:          (attr.ref as string | null) ?? null,
      utm_source:   (attr.utm_source as string) ?? null,
      utm_medium:   (attr.utm_medium as string) ?? null,
      utm_campaign: (attr.utm_campaign as string) ?? null,
      fbclid:       (attr.fbclid as string) ?? null,
      kyc_status:   prof?.kyc_status ?? null,
      country:      null, // não capturamos país hoje (só cpf/phone existem)
      created_at:   u.created_at ?? null,
    }
  })

  return NextResponse.json({
    resource: 'users',
    page,
    perPage,
    count: rows.length,
    has_more: rows.length === perPage,
    data: rows,
  })
}
