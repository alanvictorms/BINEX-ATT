import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/admin/impersonate
 * body: { user_id: string, reason?: string }
 *
 * Gera um magic link para o admin abrir uma nova aba logado como o usuário.
 * Sessão admin original permanece intacta na aba atual.
 */
export async function POST(req: NextRequest) {
  const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!SERVICE_KEY) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // 1. Cliente baseado nos cookies do admin (para validar quem está chamando)
  const adminClient = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: () => {},
    },
  })

  const { data: { user }, error: userErr } = await adminClient.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  // 2. Verifica que é admin
  const { data: isAdmin, error: adminErr } = await adminClient.rpc('is_admin', { uid: user.id })
  if (adminErr || !isAdmin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // 3. Verifica AAL2 (precisa estar com 2FA ativo nesta sessão)
  const { data: aal } = await adminClient.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'Requer autenticação de 2 fatores' }, { status: 403 })
  }

  // 4. Lê body
  const body = await req.json().catch(() => ({})) as { user_id?: string; reason?: string }
  const targetUserId = body.user_id
  if (!targetUserId) {
    return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })
  }
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'Você não precisa se logar como si mesmo' }, { status: 400 })
  }

  // 5. Service-role client para gerar magic link e auditar
  const service = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 6. Busca email do alvo
  const { data: { user: targetUser }, error: getUserErr } = await service.auth.admin.getUserById(targetUserId)
  if (getUserErr || !targetUser?.email) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  // 7. Bloqueia impersonar outro admin (proteção extra)
  const { data: targetIsAdmin } = await service.rpc('is_admin', { uid: targetUserId })
  if (targetIsAdmin) {
    return NextResponse.json({ error: 'Não é permitido impersonar outro admin' }, { status: 403 })
  }

  // 8. Gera magic link (1 uso, expira rápido)
  const origin = req.nextUrl.origin
  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type:  'magiclink',
    email: targetUser.email,
    options: {
      redirectTo: `${origin}/?impersonated=1`,
    },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: linkErr?.message ?? 'Falha ao gerar link' }, { status: 500 })
  }

  // 9. Audit log
  await service.rpc('log_admin_action', {
    p_action:      'impersonate_user',
    p_target_type: 'user',
    p_target_id:   targetUserId,
    p_before:      null,
    p_after:       { target_email: targetUser.email },
    p_reason:      body.reason ?? null,
  })

  return NextResponse.json({ action_link: linkData.properties.action_link })
}
