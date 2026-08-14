import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 1. Sem sessão → login
  if (!user) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // 2. Não é admin → plataforma (a raiz agora é o site público)
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin', { uid: user.id })
  if (adminErr || !isAdmin) {
    const url = req.nextUrl.clone()
    url.pathname = '/trade'
    return NextResponse.redirect(url)
  }

  // 3. Verifica AAL (MFA enforcement)
  // Permite acessar a página de cadastro 2FA mesmo sem aal2
  const is2faSetupPage = req.nextUrl.pathname.startsWith('/admin/seguranca/2fa')
  if (!is2faSetupPage) {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasVerifiedFactor = (factors?.totp ?? []).some((f: any) => f.status === 'verified')

    // Se já tem 2FA cadastrado, exige aal2
    if (hasVerifiedFactor) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel !== 'aal2') {
        const url = req.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('redirect', req.nextUrl.pathname)
        return NextResponse.redirect(url)
      }
    }
    // Se NÃO tem 2FA → força ir cadastrar antes de qualquer outra página admin
    else {
      const url = req.nextUrl.clone()
      url.pathname = '/admin/seguranca/2fa'
      return NextResponse.redirect(url)
    }
  }

  return res
}

export const config = {
  matcher: ['/admin/:path*'],
}
