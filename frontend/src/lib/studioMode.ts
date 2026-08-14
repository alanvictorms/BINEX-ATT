// ============================================================================
// STUDIO MODE — Modo de gravacao/marketing exclusivo para conta admin
// ============================================================================
// Este modulo concentra TODO o estado e logica do "Modo Studio". Toda alteracao
// e PURAMENTE de visualizacao (render-layer): banco de dados, RLS, transacoes
// e regras de negocio permanecem 100% intactas. Outros usuarios — incluindo
// outros admins — nao tem acesso ao toggle nem veem qualquer mudanca.
//
// Ativacao: somente o email STUDIO_OWNER_EMAIL pode ligar o modo.
// Persistencia: localStorage (nao vaza no servidor, nao sincroniza entre devices).
// Atalho: Ctrl+Shift+S abre/fecha o painel de controle.
// ============================================================================

import { create } from 'zustand'

/** Email autorizado a usar o Studio Mode. Hardcoded por seguranca. */
export const STUDIO_OWNER_EMAIL = 'janielmadeira@gmail.com'

const STORAGE_KEY = 'vm_studio_mode_v1'

export type FakeHistoryItem = {
  id: string
  asset_symbol: string
  direction: 'CALL' | 'PUT'
  amount: number
  payout_pct: number
  profit: number
  closed_at: string   // ISO
  status: 'WON'
}

export type StudioState = {
  // ── Master ──────────────────────────────────────────────────────────────
  enabled: boolean
  panelOpen: boolean

  // ── 1+5: Saldo ajustavel + saldo so cresce ────────────────────────────────
  customBalanceEnabled: boolean
  customBalance: number              // valor exato exibido
  balanceOnlyGrows: boolean          // saldo nunca decresce visualmente

  // ── 2: Filtrar perdas do historico ──────────────────────────────────────
  hideLosses: boolean

  // ── 3: Boost de payout visual ────────────────────────────────────────────
  payoutBoostEnabled: boolean
  payoutBoostPct: number             // adicionado ao payout real (ex: +7)

  // ── 4: Forcar vitoria na proxima operacao ────────────────────────────────
  forceNextWin: boolean              // consumido apos uma trade fechar

  // ── 6: Silenciar popup/som de derrota ───────────────────────────────────
  silenceLossPopup: boolean

  // ── 7: Nome/email customizado ────────────────────────────────────────────
  customIdentityEnabled: boolean
  customName: string
  customEmail: string

  // ── 8: Esconder tag (OTC) ────────────────────────────────────────────────
  hideOtcTag: boolean

  // ── 9: Modo limpo de tela ────────────────────────────────────────────────
  cleanMode: boolean                 // esconde DEV badges, leaderboards com nomes

  // ── 10: Streak counter fake ──────────────────────────────────────────────
  streakEnabled: boolean
  streakCount: number

  // ── 11: Historico injetavel ──────────────────────────────────────────────
  fakeHistory: FakeHistoryItem[]

  // ── 12: Timezone customizado ─────────────────────────────────────────────
  customTimezoneEnabled: boolean
  customTimezone: string             // ex: 'America/New_York'

  // ── 13: Esconder botao MUDAR da conta demo ──────────────────────────────
  hideMudarButton: boolean
}

const DEFAULTS: StudioState = {
  enabled:                  false,
  panelOpen:                false,
  customBalanceEnabled:     false,
  customBalance:            10000,
  balanceOnlyGrows:         false,
  hideLosses:               false,
  payoutBoostEnabled:       false,
  payoutBoostPct:           7,
  forceNextWin:             false,
  silenceLossPopup:         false,
  customIdentityEnabled:    false,
  customName:               'Carlos Silva',
  customEmail:              'carlos.trader@email.com',
  hideOtcTag:               false,
  cleanMode:                false,
  streakEnabled:            false,
  streakCount:              7,
  fakeHistory:              [],
  customTimezoneEnabled:    false,
  customTimezone:           'America/New_York',
  hideMudarButton:          false,
}

function loadFromStorage(): StudioState {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed, panelOpen: false }
  } catch {
    return DEFAULTS
  }
}

function saveToStorage(state: StudioState) {
  if (typeof window === 'undefined') return
  try {
    // panelOpen nao persiste (sempre comeca fechado)
    const { panelOpen: _drop, ...rest } = state
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
  } catch { /* localStorage indisponivel — ignora */ }
}

type Actions = {
  set: <K extends keyof StudioState>(key: K, value: StudioState[K]) => void
  toggle: (key: keyof StudioState) => void
  reset: () => void
  addFakeHistory: (item: Omit<FakeHistoryItem, 'id'>) => void
  removeFakeHistory: (id: string) => void
  consumeForceWin: () => boolean
}

export const useStudioMode = create<StudioState & Actions>((setState, getState) => ({
  ...loadFromStorage(),

  set: (key, value) => {
    setState(s => {
      const next = { ...s, [key]: value }
      saveToStorage(next)
      return next
    })
  },

  toggle: (key) => {
    setState(s => {
      const cur = s[key]
      if (typeof cur !== 'boolean') return s
      const next = { ...s, [key]: !cur }
      saveToStorage(next)
      return next
    })
  },

  reset: () => {
    setState(() => {
      saveToStorage(DEFAULTS)
      return { ...DEFAULTS } as any
    })
  },

  addFakeHistory: (item) => {
    setState(s => {
      const fake: FakeHistoryItem = { ...item, id: `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
      const next = { ...s, fakeHistory: [fake, ...s.fakeHistory] }
      saveToStorage(next)
      return next
    })
  },

  removeFakeHistory: (id) => {
    setState(s => {
      const next = { ...s, fakeHistory: s.fakeHistory.filter(h => h.id !== id) }
      saveToStorage(next)
      return next
    })
  },

  consumeForceWin: () => {
    const wasOn = getState().forceNextWin
    if (wasOn) {
      setState(s => {
        const next = { ...s, forceNextWin: false }
        saveToStorage(next)
        return next
      })
    }
    return wasOn
  },
}))

// ─── Helpers seletivos (uso fora de componentes/ssr-safe) ──────────────────
export function isStudioOwner(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === STUDIO_OWNER_EMAIL.toLowerCase()
}

/** Remove " (OTC)" do final do label de um ativo quando hideOtcTag esta ativo. */
export function applyHideOtc(label: string, hideOtc: boolean): string {
  if (!hideOtc) return label
  return label.replace(/\s*\(OTC\)\s*$/i, '').trim()
}
