/**
 * secureClient — Cliente seguro para operações sensíveis
 *
 * Substitui chamadas diretas ao Supabase (que expõem apikey/Bearer/payload no Network)
 * por chamadas encriptadas ao proxy /api/s (server-side).
 *
 * No Network tab do browser:
 *  - URL: /api/s (sem referência ao Supabase)
 *  - Headers: Sem apikey, sem Bearer (auth via cookie httpOnly)
 *  - Body: { k: "...", iv: "...", d: "..." } (blob encriptado, ilegível)
 *
 * Uso:
 *   import { secureRpc, secureDb, secureAuth, secureStorage } from '@/lib/secureClient'
 *
 *   // Substituir: supabase.rpc('place_trade', { ... })
 *   const { data, error } = await secureRpc('place_trade', { p_amount: 100 })
 *
 *   // Substituir: supabase.from('kyc_submissions').insert({ ... })
 *   const { data, error } = await secureDb.from('kyc_submissions').insert(kycData)
 */

import { encryptPayload } from './crypto'

interface SecureResponse<T = any> {
  data: T | null
  error: { message: string; code?: string } | null
}

/**
 * Envia payload encriptado ao proxy /api/s
 */
async function securePost(payload: unknown): Promise<SecureResponse> {
  try {
    const envelope = await encryptPayload(payload)
    const res = await fetch('/api/s', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
      credentials: 'include', // envia cookies httpOnly
    })

    const json = await res.json()

    if (!res.ok) {
      return { data: null, error: { message: json.error ?? 'Request failed', code: json.code } }
    }

    return { data: json.data ?? json, error: null }
  } catch (err: any) {
    return { data: null, error: { message: err.message ?? 'Network error' } }
  }
}

// ─── RPC ────────────────────────────────────────────────────────────────────

/**
 * Substitui supabase.rpc(fn, params)
 */
export async function secureRpc<T = any>(fn: string, params?: Record<string, unknown>): Promise<SecureResponse<T>> {
  return securePost({ action: 'rpc', fn, params: params ?? {} })
}

// ─── DB Operations ──────────────────────────────────────────────────────────

interface DbQuery {
  select(columns?: string): DbQuery & PromiseLike<SecureResponse>
  insert(data: unknown): DbQuery & PromiseLike<SecureResponse>
  update(data: unknown): DbQuery & PromiseLike<SecureResponse>
  upsert(data: unknown): DbQuery & PromiseLike<SecureResponse>
  delete(): DbQuery & PromiseLike<SecureResponse>
  eq(col: string, val: unknown): DbQuery & PromiseLike<SecureResponse>
  filter(col: string, op: string, val: unknown): DbQuery & PromiseLike<SecureResponse>
  order(col: string, opts?: { ascending?: boolean }): DbQuery & PromiseLike<SecureResponse>
  limit(n: number): DbQuery & PromiseLike<SecureResponse>
  single(): DbQuery & PromiseLike<SecureResponse>
  then: PromiseLike<SecureResponse>['then']
}

function createDbQuery(table: string): DbQuery {
  const state: any = { table, method: 'select', filters: [], eq: {} }

  const builder: DbQuery = {
    select(columns = '*') {
      state.method = 'select'
      state.select = columns
      return builder
    },
    insert(data) {
      state.method = 'insert'
      state.data = data
      return builder
    },
    update(data) {
      state.method = 'update'
      state.data = data
      return builder
    },
    upsert(data) {
      state.method = 'upsert'
      state.data = data
      return builder
    },
    delete() {
      state.method = 'delete'
      return builder
    },
    eq(col, val) {
      state.eq[col] = val
      return builder
    },
    filter(col, op, val) {
      state.filters.push({ col, op, val })
      return builder
    },
    order(col, opts) {
      state.order = { col, asc: opts?.ascending ?? true }
      return builder
    },
    limit(n) {
      state.limit = n
      return builder
    },
    single() {
      state.single = true
      return builder
    },
    then(resolve, reject) {
      const payload = {
        action: 'db' as const,
        table: state.table,
        method: state.method,
        data: state.data,
        filters: state.filters.length > 0 ? state.filters : undefined,
        eq: Object.keys(state.eq).length > 0 ? state.eq : undefined,
        select: state.select,
        order: state.order,
        limit: state.limit,
        single: state.single,
      }
      return securePost(payload).then(resolve, reject)
    },
  }

  return builder
}

/**
 * Substitui supabase.from('table')
 *
 * Uso:
 *   const { data, error } = await secureDb.from('kyc_submissions').insert({ ... })
 *   const { data, error } = await secureDb.from('profiles').select('*').eq('id', userId).single()
 */
export const secureDb = {
  from(table: string): DbQuery {
    return createDbQuery(table)
  },
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export const secureAuth = {
  async signInWithPassword(credentials: { email: string; password: string }): Promise<SecureResponse> {
    return securePost({
      action: 'auth',
      authAction: 'login',
      email: credentials.email,
      password: credentials.password,
    })
  },

  async signUp(params: { email: string; password: string; options?: { data?: Record<string, unknown> } }): Promise<SecureResponse> {
    return securePost({
      action: 'auth',
      authAction: 'register',
      email: params.email,
      password: params.password,
      metadata: params.options?.data,
    })
  },

  async signOut(): Promise<SecureResponse> {
    return securePost({ action: 'auth', authAction: 'logout' })
  },

  async resetPasswordForEmail(email: string): Promise<SecureResponse> {
    return securePost({ action: 'auth', authAction: 'resetPassword', email })
  },

  async updatePassword(password: string): Promise<SecureResponse> {
    return securePost({ action: 'auth', authAction: 'updatePassword', password })
  },
}

// ─── Storage ────────────────────────────────────────────────────────────────

/**
 * Upload de arquivo via proxy (sem expor storage credentials no browser)
 */
export const secureStorage = {
  from(bucket: string) {
    return {
      async upload(path: string, file: File | Blob, options?: { contentType?: string; upsert?: boolean }): Promise<SecureResponse> {
        // Converte o arquivo para base64
        const arrayBuffer = await file.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        const fileBase64 = btoa(binary)

        return securePost({
          action: 'storage',
          bucket,
          path,
          fileBase64,
          contentType: options?.contentType ?? file.type ?? 'application/octet-stream',
        })
      },
    }
  },
}
