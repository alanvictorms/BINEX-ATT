import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { dispatchRegistration } from '@/lib/trackflow'

// Dispara o evento `registration` no TrackFlow apos o signUp.
// Autenticacao: o proprio access_token do usuario recem-criado (Bearer).
// O `ref` vem dos metadados do JWT (gravados no signUp via options.data.attribution),
// portanto nao confiamos em nada do body — so no token validado.
export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const token = header.slice(7).trim()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const user = data.user
  const ref = (user.user_metadata as any)?.attribution?.ref ?? null

  // Idempotente (event_id=reg_<id>); nunca quebra a resposta ao usuario.
  await dispatchRegistration(user.id, user.email ?? undefined, ref)

  return NextResponse.json({ ok: true })
}
