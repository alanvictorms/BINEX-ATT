import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { dispatchDeposit } from '@/lib/trackflow'

// Dispara o evento de deposito (ftd|deposit) no TrackFlow apos confirmacao MANUAL no admin.
// (O caminho automatico do webhook BSPay ja dispara direto no servidor.)
// Autenticacao: precisa ser um admin (valida JWT + tabela admin_users via service_role).
export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const token = header.slice(7).trim()

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: auth, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 })
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
  const { data: isAdmin } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!isAdmin) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const { externalId } = await req.json().catch(() => ({}))
  if (!externalId || typeof externalId !== 'string') {
    return NextResponse.json({ error: 'externalId obrigatorio' }, { status: 400 })
  }

  await dispatchDeposit(externalId)
  return NextResponse.json({ ok: true })
}
