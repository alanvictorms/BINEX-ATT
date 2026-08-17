import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { secureAuth, secureDb, secureRpc } from '@/lib/secureClient'
import { readAttribution, readAffiliateCode, clearAffiliateCode } from '@/lib/attribution'

// Garante que o listener de auth + canal Realtime sejam registrados UMA vez so.
// Em dev (Next/React StrictMode) e em HMR o init() roda mais de uma vez; sem essa
// trava, o segundo .channel('account-balance').on(...) estoura
// "cannot add postgres_changes callbacks after subscribe()".
let realtimeInitialized = false

// Lembra a conta escolhida (DEMO/REAL) entre recarregamentos da pagina.
// Sem isso o isDemo sempre volta para true (demo) ao dar F5.
const DEMO_PREF_KEY = 'vertex:isDemo'

function readIsDemoPref(): boolean {
  if (typeof window === 'undefined') return true   // SSR: default demo
  const v = window.localStorage.getItem(DEMO_PREF_KEY)
  return v === null ? true : v === 'true'          // sem preferencia salva => demo
}

function writeIsDemoPref(v: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_PREF_KEY, String(v))
}

export interface Account {
  id:       string
  type:     'DEMO' | 'REAL'
  balance:  string
  currency: string
}

export interface User {
  id:        string
  name:      string
  email:     string
  kycStatus: string
  accounts:  Account[]
}

interface AuthState {
  user:     User | null
  token:    string | null
  isDemo:   boolean
  loading:  boolean

  login:           (email: string, password: string) => Promise<void>
  register:        (name: string, email: string, password: string) => Promise<void>
  /** Confirma o cadastro com o código de 6 dígitos do e-mail. */
  confirmSignup:   (email: string, token: string) => Promise<void>
  resendSignupOtp: (email: string) => Promise<void>
  logout:          () => Promise<void>
  init:            () => Promise<void>
  setIsDemo:       (v: boolean) => void
  refreshAccounts: () => Promise<void>
  resetDemo:       () => Promise<void>
}

async function fetchAccounts(userId: string): Promise<Account[]> {
  const { data, error } = await secureDb
    .from('accounts')
    .select('id, type, balance, currency')
    .eq('user_id', userId)
  if (error) {
    console.warn('[accounts] fetch error:', error.message)
    return []
  }
  return (data ?? []).map((a: any) => ({ ...a, balance: String(a.balance) }))
}

async function buildUser(supabaseUser: any, accounts: Account[]): Promise<User> {
  const { data: profile } = await secureDb
    .from('profiles')
    .select('name, kyc_status')
    .eq('id', supabaseUser.id)
    .single()

  return {
    id:        supabaseUser.id,
    name:      profile?.name ?? supabaseUser.email?.split('@')[0] ?? '',
    email:     supabaseUser.email ?? '',
    kycStatus: profile?.kyc_status ?? 'pending',
    accounts,
  }
}

/**
 * Fim do cadastro: monta o usuário e dispara os avisos de atribuição.
 *
 * Vive aqui fora porque o cadastro passou a terminar em DOIS lugares — direto
 * (projeto sem confirmação de e-mail) ou depois do código de 6 dígitos. Deixar
 * isso dentro do register faria o TrackFlow e o vínculo de afiliado sumirem
 * justamente para quem confirma por e-mail, que é o caminho padrão.
 */
async function finishSignup(session: Session, set: (partial: Partial<AuthState>) => void) {
  const accounts = await fetchAccounts(session.user.id)
  const user = await buildUser(session.user, accounts)
  set({ user, token: session.access_token })

  // Avisa o TrackFlow do cadastro (server-side le o `ref` do JWT e dispara).
  // Fire-and-forget: nao bloqueia nem quebra o cadastro se o tracker falhar.
  fetch('/api/trackflow/register', {
    method:  'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  }).catch(() => { /* tracker offline — ignora */ })

  // Vincula ao afiliado (?aff=CODIGO), se houver. Fire-and-forget; o RPC usa
  // auth.uid() do usuario recem-criado e e idempotente (1 afiliado por usuario).
  const affCode = readAffiliateCode()
  if (affCode) {
    supabase.rpc('link_affiliate_referral', { p_code: affCode })
      .then(() => clearAffiliateCode(), () => { /* falha no vinculo nao quebra o cadastro */ })
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user:    null,
  token:   null,
  // Le a conta escolhida ja na criacao do estado (localStorage e sincrono, sem rede).
  // Assim o primeiro render ja sai na conta certa e nao ha "flash" de DEMO no F5.
  isDemo:  readIsDemoPref(),
  loading: true,

  setIsDemo: (v) => { writeIsDemoPref(v); set({ isDemo: v }) },

  login: async (email, password) => {
    // Auth via proxy encriptado (senha NÃO aparece no Network tab)
    const { error } = await secureAuth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    // Após cookies serem setados pelo proxy, lê a sessão localmente
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sessão não estabelecida')
    const accounts = await fetchAccounts(session.user.id)
    const user = await buildUser(session.user, accounts)
    set({ user, token: session.access_token })
  },

  register: async (name, email, password) => {
    // Gate de cadastro (Admin → Configurações). Server-authoritative via get_public_config.
    const { data: cfg } = await supabase.rpc('get_public_config')
    if ((cfg as any)?.registrationEnabled === false) {
      throw new Error('Os cadastros estão temporariamente desabilitados. Tente novamente mais tarde.')
    }

    // Anexa a atribuicao (ref/utm do TrackFlow) aos metadados do novo usuario,
    // pra que o backend recupere o `ref` na hora de disparar o webhook de deposito.
    const attribution = readAttribution()
    const { error } = await secureAuth.signUp({
      email,
      password,
      options: { data: { name, ...(attribution ? { attribution } : {}) } },
    })
    if (error) throw new Error(error.message)
    // Após cookies serem setados pelo proxy, lê a sessão localmente
    const { data: { session } } = await supabase.auth.getSession()
    // Sem sessão = projeto exige confirmação de e-mail. Quem chama abre a tela
    // do código de 6 dígitos e termina em confirmSignup().
    if (!session) throw new Error('EMAIL_CONFIRMATION_REQUIRED')
    await finishSignup(session, set)
  },

  confirmSignup: async (email, token) => {
    const { error } = await secureAuth.verifyOtp({ email, token })
    if (error) throw new Error(error.message)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sessão não estabelecida')
    await finishSignup(session, set)
  },

  resendSignupOtp: async (email) => {
    const { error } = await secureAuth.resendSignupOtp(email)
    if (error) throw new Error(error.message)
  },

  logout: async () => {
    await secureAuth.signOut()
    set({ user: null, token: null })
  },

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { set({ loading: false }); return }
    const accounts = await fetchAccounts(session.user.id)
    const user = await buildUser(session.user, accounts)
    set({ user, token: session.access_token, loading: false, isDemo: readIsDemoPref() })

    if (realtimeInitialized) return
    realtimeInitialized = true

    // Mantém sessão sincronizada automaticamente
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) set({ token: session.access_token })
      else set({ user: null, token: null })
    })

    // Real-time: atualiza saldo sempre que uma conta do usuário mudar.
    // Defensivo: nunca substitui accounts por array vazio (causaria flash de
    // R$ 0,00 se o fetch falhar transitoriamente - auth refresh, race, RLS).
    supabase
      .channel('account-balance')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'accounts',
        filter: `user_id=eq.${session.user.id}`,
      }, async () => {
        const updated = await fetchAccounts(session.user.id)
        if (updated.length === 0) return  // mantem estado atual em caso de fetch vazio
        set(state => state.user ? { user: { ...state.user, accounts: updated } } : {})
      })
      .subscribe()
  },

  refreshAccounts: async () => {
    const user = get().user
    if (!user) return
    const accounts = await fetchAccounts(user.id)
    // Mesma defesa do realtime: nao zera o saldo visivel se o fetch retornar vazio.
    if (accounts.length === 0) return
    set({ user: { ...user, accounts } })
  },

  resetDemo: async () => {
    await secureRpc('reset_demo_account')
    await get().refreshAccounts()
  },
}))

export function useCurrentAccount(state: AuthState) {
  const accounts = state.user?.accounts ?? []
  return state.isDemo
    ? accounts.find(a => a.type === 'DEMO')
    : accounts.find(a => a.type === 'REAL')
}
