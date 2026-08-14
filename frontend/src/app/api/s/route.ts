/**
 * POST /api/s — Proxy Seguro Unificado
 *
 * Recebe payloads encriptados (RSA+AES) do frontend, decripta no servidor,
 * executa a operação no Supabase usando client server-side (sem expor credenciais),
 * e retorna a resposta.
 *
 * O browser NÃO vê: apikey, Bearer token, payload em texto claro.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { decryptPayload, type EncryptedEnvelope } from '@/lib/serverCrypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** Cria Supabase client autenticado como o usuário (via cookies) */
function createUserClient(req: NextRequest, res: NextResponse) {
  return createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options)
        })
      },
    },
  })
}

/** Cria Supabase client com service role (para operações admin e auth) */
function createServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

interface ProxyPayload {
  action: 'rpc' | 'db' | 'auth' | 'storage'
  // Para 'rpc':
  fn?: string
  params?: Record<string, unknown>
  // Para 'db':
  table?: string
  method?: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  data?: unknown
  filters?: Array<{ col: string; op: string; val: unknown }>
  select?: string
  order?: { col: string; asc: boolean }
  limit?: number
  single?: boolean
  eq?: Record<string, unknown>
  // Para 'auth':
  authAction?: 'login' | 'register' | 'logout' | 'resetPassword' | 'updatePassword'
  email?: string
  password?: string
  name?: string
  metadata?: Record<string, unknown>
  // Para 'storage':
  bucket?: string
  path?: string
  fileBase64?: string
  contentType?: string
}

export async function POST(req: NextRequest) {
  try {
    // 1. Lê e decripta o envelope
    const envelope: EncryptedEnvelope = await req.json()

    if (!envelope.k || !envelope.iv || !envelope.d) {
      return NextResponse.json({ error: 'Invalid envelope' }, { status: 400 })
    }

    const payload = decryptPayload(envelope) as ProxyPayload
    const response = NextResponse.next()

    // 2. Roteia conforme a ação
    switch (payload.action) {
      case 'rpc': {
        const supabase = createUserClient(req, response)
        const { data, error } = await supabase.rpc(payload.fn as string, payload.params ?? {})
        if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
        return NextResponse.json({ data })
      }

      case 'db': {
        const supabase = createUserClient(req, response)
        const result = await executeDbOperation(supabase, payload)
        if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
        return NextResponse.json({ data: result.data })
      }

      case 'auth': {
        return await handleAuth(req, payload)
      }

      case 'storage': {
        const supabase = createUserClient(req, response)
        return await handleStorage(supabase, payload)
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err: any) {
    console.error('[secure-proxy] Error:', err.message)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── DB Operations ──────────────────────────────────────────────────────────

async function executeDbOperation(supabase: any, payload: ProxyPayload) {
  let query = supabase.from(payload.table!)

  switch (payload.method) {
    case 'select': {
      query = query.select(payload.select ?? '*')
      // Aplica filtros
      if (payload.filters) {
        for (const f of payload.filters) {
          query = query.filter(f.col, f.op, f.val)
        }
      }
      if (payload.eq) {
        for (const [col, val] of Object.entries(payload.eq)) {
          query = query.eq(col, val)
        }
      }
      if (payload.order) {
        query = query.order(payload.order.col, { ascending: payload.order.asc })
      }
      if (payload.limit) query = query.limit(payload.limit)
      if (payload.single) query = query.single()
      break
    }
    case 'insert': {
      query = query.insert(payload.data)
      if (payload.select) query = query.select(payload.select)
      break
    }
    case 'update': {
      query = query.update(payload.data)
      if (payload.eq) {
        for (const [col, val] of Object.entries(payload.eq)) {
          query = query.eq(col, val)
        }
      }
      if (payload.select) query = query.select(payload.select)
      break
    }
    case 'upsert': {
      query = query.upsert(payload.data)
      if (payload.select) query = query.select(payload.select)
      break
    }
    case 'delete': {
      query = query.delete()
      if (payload.eq) {
        for (const [col, val] of Object.entries(payload.eq)) {
          query = query.eq(col, val)
        }
      }
      break
    }
  }

  return await query
}

// ─── Auth Operations ────────────────────────────────────────────────────────

async function handleAuth(req: NextRequest, payload: ProxyPayload) {
  const res = NextResponse.json({})

  // Cria client com capacidade de setar cookies na resposta
  const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options)
        })
      },
    },
  })

  switch (payload.authAction) {
    case 'login': {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: payload.email!,
        password: payload.password!,
      })
      if (error) {
        return NextResponse.json({ error: error.message, code: error.status }, { status: 401 })
      }
      // Retorna user info (cookies setados automaticamente pelo SSR)
      const responseData = {
        user: data.user ? {
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata,
        } : null,
      }
      const successRes = NextResponse.json({ data: responseData })
      // Copia cookies do res temporário
      res.cookies.getAll().forEach(c => {
        successRes.cookies.set(c.name, c.value)
      })
      return successRes
    }

    case 'register': {
      const { data, error } = await supabase.auth.signUp({
        email: payload.email!,
        password: payload.password!,
        options: { data: payload.metadata ?? { name: payload.name } },
      })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      const responseData = {
        user: data.user ? { id: data.user.id, email: data.user.email } : null,
      }
      const successRes = NextResponse.json({ data: responseData })
      res.cookies.getAll().forEach(c => {
        successRes.cookies.set(c.name, c.value)
      })
      return successRes
    }

    case 'logout': {
      await supabase.auth.signOut()
      const logoutRes = NextResponse.json({ data: { success: true } })
      res.cookies.getAll().forEach(c => {
        logoutRes.cookies.set(c.name, c.value)
      })
      return logoutRes
    }

    case 'resetPassword': {
      const { error } = await supabase.auth.resetPasswordForEmail(payload.email!, {
        redirectTo: `${req.nextUrl.origin}/reset-password`,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      // Repassa cookies (PKCE code verifier) — sem isso o link do e-mail
      // não consegue estabelecer sessão nem no mesmo navegador
      const resetRes = NextResponse.json({ data: { success: true } })
      res.cookies.getAll().forEach(c => {
        resetRes.cookies.set(c.name, c.value)
      })
      return resetRes
    }

    case 'updatePassword': {
      const { error } = await supabase.auth.updateUser({ password: payload.password! })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ data: { success: true } })
    }

    default:
      return NextResponse.json({ error: 'Unknown auth action' }, { status: 400 })
  }
}

// ─── Storage Operations ─────────────────────────────────────────────────────

async function handleStorage(supabase: any, payload: ProxyPayload) {
  if (!payload.bucket || !payload.path || !payload.fileBase64) {
    return NextResponse.json({ error: 'Missing storage params' }, { status: 400 })
  }

  // Converte base64 para buffer
  const fileBuffer = Buffer.from(payload.fileBase64, 'base64')

  const { data, error } = await supabase.storage
    .from(payload.bucket)
    .upload(payload.path, fileBuffer, {
      contentType: payload.contentType ?? 'application/octet-stream',
      upsert: true,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
