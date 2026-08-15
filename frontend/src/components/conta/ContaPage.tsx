'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2, X, ChevronDown, AlertCircle, ChevronRight, Zap,
  ChevronLeft, Loader2, CheckCheck, Ban, UserCircle2, User, Calendar,
  Mail, Info, Phone, Shuffle, Building2, Clock4,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnalisePage } from '@/components/analise/AnalisePage'
import { VerificacaoTab } from '@/components/conta/VerificacaoTab'
import { SegurancaCard } from '@/components/conta/SegurancaCard'
import { supabase } from '@/lib/supabase'
import { secureRpc, secureDb } from '@/lib/secureClient'
import { notifyEmail } from '@/lib/notifyEmail'
import { useAuthStore, useCurrentAccount } from '@/store/auth'

type ContaTab = 'retirada' | 'transacoes' | 'operacoes' | 'minha-conta' | 'verificacao' | 'mercado' | 'torneios' | 'analise'

const CONTA_TABS: { key: ContaTab; label: string }[] = [
  { key: 'retirada', label: 'Retirada' },
  { key: 'transacoes', label: 'Transações' },
  { key: 'operacoes', label: 'Operações' },
  { key: 'minha-conta', label: 'Minha Conta' },
  { key: 'verificacao', label: 'Verificação' },
]


const PIX_KEY_TYPES = [
  { value: 'cpf',    label: 'CPF',    icon: User },
  { value: 'email',  label: 'E-mail', icon: Mail },
  { value: 'phone',  label: 'Telefone', icon: Phone },
  { value: 'random', label: 'Chave aleatória', icon: Shuffle },
  { value: 'cnpj',   label: 'CNPJ',   icon: Building2 },
]

interface Withdrawal {
  id: string
  amount: number
  pix_key_type: string
  pix_key: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  admin_notes: string | null
  created_at: string
  processed_at: string | null
}

/* ═══ vx-* helper components ═══ */

function VxField({ label, value, onChange, placeholder, rightLabel, icon, readOnly = false, type = 'text' }: {
  label: string; value: string; onChange?: (v: string) => void; placeholder?: string
  rightLabel?: string; icon?: React.ReactNode; readOnly?: boolean; type?: string
}) {
  const ro = readOnly || !onChange
  return (
    <div className="vx-field">
      <span className="text-[12px] font-medium text-[#AEBBCB]">{label}</span>
      <div className="relative">
        <input
          type={type} value={value} onChange={(e) => onChange?.(e.target.value)} readOnly={ro}
          placeholder={placeholder}
          className={cn('vx-input', icon && 'pr-10', rightLabel && 'pr-24', ro && 'cursor-default text-[#AEBBCB]')}
        />
        {icon && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7A8AA0]">{icon}</span>}
        {rightLabel && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11.5px] font-semibold text-[#1FD196]">{rightLabel}</span>}
      </div>
    </div>
  )
}


/* ═══ Minha Conta — Perfil Form (dados reais do Supabase) ═══ */
function MinhaContaForm() {
  const user = useAuthStore(s => s.user)
  const [nickname,  setNickname]  = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [cpf,       setCpf]       = useState('')
  // CPF e data de nascimento sao definitivos: uma vez gravados, viram somente leitura.
  const [birthLocked, setBirthLocked] = useState(false)
  const [cpfLocked,   setCpfLocked]   = useState(false)
  const [country,   setCountry]   = useState('Brasil')
  const [address,   setAddress]   = useState('')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      const parts = (user.name || '').trim().split(/\s+/)
      setFirstName(parts.shift() ?? '')
      setLastName(parts.join(' '))
      const { data } = await secureDb.from('profiles').select('*').eq('id', user.id).single()
      if (cancelled) return
      const p = (data ?? {}) as Record<string, any>
      if (p.name) {
        const np = String(p.name).trim().split(/\s+/)
        setFirstName(np.shift() ?? '')
        setLastName(np.join(' '))
      }
      setNickname(p.nickname ?? '')
      setCpf(p.cpf ?? '')
      setBirthDate(p.birth_date ?? '')
      setCpfLocked(Boolean(p.cpf))
      setBirthLocked(Boolean(p.birth_date))
      setCountry(p.country ?? 'Brasil')
      setAddress(p.address ?? '')
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user?.id])

  async function handleSave() {
    setSaving(true); setMsg(null)
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
      const { error } = await secureRpc('update_my_profile', {
        p_name: fullName || null, p_nickname: nickname.trim() || null,
        p_cpf: cpf.trim() || null, p_birth_date: birthDate || null,
        p_country: country.trim() || null, p_address: address.trim() || null,
      })
      if (error) throw new Error(error.message)
      setMsg({ ok: true, text: 'Dados salvos com sucesso.' })
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'Erro ao salvar.' }) }
    finally { setSaving(false) }
  }

  return (
    <div className="vx-panel p-5">
      <div className="flex items-start gap-3">
        <UserCircle2 size={20} className="mt-[2px] text-[#7A8AA0]" />
        <div className="min-w-0 flex-1">
          <h2 className="vx-h3 text-[15px]">Perfil</h2>
          <p className="vx-sub mt-2">Gerencie suas informações pessoais e preferências da conta.</p>
        </div>
        <button type="button" className="vx-btn-ghost px-4 py-[9px] text-[12px]">
          <User size={14} /> Alterar foto
        </button>
      </div>

      <div className="mt-6 flex items-center gap-5">
        <div className="relative">
          <div className="h-[86px] w-[86px] rounded-full bg-[#2E6BE6]/20 border-2 border-[#22344A] flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-10 h-10 text-[#6C9CF8] fill-current">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
          </div>
          <span className="absolute bottom-[5px] right-[5px] h-[13px] w-[13px] rounded-full bg-[#1FD196] ring-[3px] ring-[#0C131F]" />
        </div>
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[21px] font-bold text-white">{user?.email?.split('@')[0] ?? '—'}</span>
            <span className={cn('vx-chip-green', user?.kycStatus !== 'approved' && 'opacity-50')}>
              {user?.kycStatus === 'approved' ? 'Verificado' : 'Não verificado'}
            </span>
          </div>
          <div className="vx-sub-sm mt-2.5">ID: {user?.id?.slice(0, 8) ?? '—'}</div>
          <div className="mt-4 flex items-center gap-3">
            <span className="vx-sub-sm">Status da conta</span>
          </div>
          <span className="vx-chip-green mt-2">Ativa</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-[#7E8DA2]"><Loader2 className="animate-spin" size={18} /></div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4">
            <VxField label="Nome completo" value={firstName} onChange={setFirstName} placeholder="Seu nome" />
            <VxField label="Sobrenome" value={lastName} onChange={setLastName} placeholder="Seu sobrenome" />
            <VxField label="Data de nascimento" value={birthDate} onChange={setBirthDate} placeholder="dd/mm/aaaa" icon={<Calendar size={15} />} type="date" readOnly={birthLocked} />
            <VxField label="CPF" value={cpf} onChange={setCpf} placeholder="000.000.000-00" readOnly={cpfLocked} />
            <VxField label="E-mail" value={user?.email ?? ''} rightLabel="Verificado" readOnly />
            <div className="vx-field">
              <span className="text-[12px] font-medium text-[#AEBBCB]">País</span>
              <div className="vx-select-wrap">
                <select value={country} onChange={(e) => setCountry(e.target.value)} className="vx-select">
                  <option>Brasil</option>
                  <option>Portugal</option>
                  <option>Outro</option>
                </select>
                <ChevronDown size={16} className="vx-select-icon" />
              </div>
            </div>
            <VxField label="Endereço" value={address} onChange={setAddress} placeholder="Rua, número, cidade, estado, CEP" />
          </div>

          {(cpfLocked || birthLocked) && (
            <p className="vx-sub-sm mt-3">
              CPF e data de nascimento não podem ser alterados depois de confirmados. Fale com o suporte se precisar corrigir.
            </p>
          )}

          {msg && (
            <div className={cn('mt-3 text-[12px] font-medium px-3 py-2 rounded-[10px] border',
              msg.ok ? 'bg-[#1FD196]/10 border-[#1FD196]/30 text-[#1FD196]' : 'bg-red-500/10 border-red-500/30 text-red-400'
            )}>{msg.text}</div>
          )}

          <div className="mt-6 flex items-center gap-6">
            <button onClick={handleSave} disabled={saving} data-testid="save-profile-btn" className="vx-btn-blue px-5 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button className="text-[13px] font-medium text-[#7E8DA2] transition-colors duration-200 hover:text-white">Descartar</button>
          </div>
        </>
      )}
    </div>
  )
}

/* ═══ Tabela e Helpers ═══ */

const TX_LABEL: Record<string, string> = {
  TRADE_WIN: 'Operação vencida', TRADE_LOSS: 'Operação perdida', TRADE_DRAW: 'Empate',
  EARLY_CLOSE: 'Saída antecipada', DEPOSIT: 'Depósito', WITHDRAWAL: 'Retirada',
  DEMO_RESET: 'Reset demo', BONUS: 'Bônus', ADJUSTMENT: 'Ajuste',
  COPY_PURCHASE: 'Copy trading', COPY_RESULT: 'Resultado do copy', BOOSTER_PURCHASE: 'Booster',
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ', ' + d.toLocaleTimeString('pt-BR')
}

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending') return (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full border-2 border-[#7E8DA2] flex-shrink-0" />
      <span className="text-xs text-[#7E8DA2]">Aguardando confirmação</span>
    </div>
  )
  if (status === 'failed') return (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0"><X size={9} className="text-white" /></div>
      <span className="text-xs text-red-400 font-medium">Falhado</span>
    </div>
  )
  return (
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><CheckCircle2 size={9} className="text-white" /></div>
      <span className="text-xs text-green-400 font-medium">Bem-sucedido</span>
    </div>
  )
}

/* ═══ Transações ═══ */
function TransacoesTab() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(100)
      setTransactions(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto px-3 sm:px-6 pt-4">
        <div className="grid grid-cols-[260px_200px_220px_1fr_140px] gap-4 pb-2 border-b border-[#16202D] mb-1 min-w-[900px]">
          {['ID da Transação','Data e hora','Status','Tipo','Valor'].map(h => (
            <span key={h} className="text-xs text-[#7E8DA2] font-medium">{h}</span>
          ))}
        </div>
        {loading && <div className="flex items-center justify-center py-16"><Loader2 size={20} className="text-[#7E8DA2] animate-spin" /></div>}
        {!loading && transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-[#7E8DA2] text-sm">Nenhuma transação ainda</span>
          </div>
        )}
        {transactions.map(tx => {
          const positive = Number(tx.amount) >= 0
          return (
            <div key={tx.id} className="grid grid-cols-[260px_200px_220px_1fr_140px] gap-4 py-3 border-b border-[#16202D]/40 hover:bg-white/[0.02] transition-colors items-center min-w-[900px]">
              <span className="text-xs text-white font-mono truncate">{tx.id}</span>
              <span className="text-xs text-[#7E8DA2]">{fmtDate(tx.created_at)}</span>
              <StatusBadge status="success" />
              <span className="text-xs text-[#7E8DA2]">{TX_LABEL[tx.type] ?? tx.type}</span>
              <span className={cn('text-xs font-semibold text-right tabular-nums', positive ? 'text-green-400' : 'text-red-400')}>
                {positive ? '+' : ''}R$ {fmtBRL(Math.abs(Number(tx.amount)))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══ Operações ═══ */
function MiniChartIcon() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none" className="text-[#7E8DA2]">
      <polyline points="0,12 5,8 9,10 13,4 17,6 22,2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function OperacoesTab() {
  const store = useAuthStore()
  const [subTab, setSubTab] = useState<'historico' | 'pendentes'>('historico')
  const [contaTipo, setContaTipo] = useState<'REAL' | 'DEMO'>('REAL')
  const [contaDropOpen, setContaDropOpen] = useState(false)
  const [operations, setOperations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const account = store.user?.accounts.find(a => a.type === contaTipo)
      if (!account) { setOperations([]); setLoading(false); return }
      const statusFilter = subTab === 'pendentes' ? ['OPEN'] : ['WON','LOST','DRAW']
      const { data } = await supabase
        .from('operations').select('*').eq('account_id', account.id)
        .in('status', statusFilter).order('created_at', { ascending: false }).limit(100)
      setOperations(data ?? [])
      setLoading(false)
    }
    load()
  }, [subTab, contaTipo, store.user])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-6 px-3 sm:px-6 pt-4 pb-0 border-b border-[#16202D] flex-shrink-0 overflow-x-auto">
        {(['historico', 'pendentes'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={cn('pb-3 text-sm font-medium border-b-2 -mb-px transition-colors flex-shrink-0 whitespace-nowrap',
              subTab === t ? 'text-white border-white font-semibold' : 'text-blue-400 border-transparent hover:text-blue-300'
            )}>
            {t === 'historico' ? 'Histórico de negociações' : 'Negociações pendentes'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 px-3 sm:px-6 py-3 flex-shrink-0 overflow-x-auto">
        <div className="relative min-w-[160px]">
          <button onClick={() => setContaDropOpen(!contaDropOpen)}
            className="relative w-full border border-[#16202D] rounded-lg px-3 pt-5 pb-2 bg-[#0E1620] text-left hover:border-blue-500/40 transition-colors">
            <span className="absolute top-1.5 left-3 text-[10px] text-[#7E8DA2] font-medium">Tipo de Conta:</span>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-white">{contaTipo === 'REAL' ? 'Conta real' : 'Conta demo'}</span>
              <ChevronDown size={13} className={cn('text-[#7E8DA2] transition-transform', contaDropOpen && 'rotate-180')} />
            </div>
          </button>
          {contaDropOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#0E1620] border border-[#16202D] rounded-lg overflow-hidden shadow-xl z-50">
              {(['REAL', 'DEMO'] as const).map(tipo => (
                <button key={tipo} onClick={() => { setContaTipo(tipo); setContaDropOpen(false) }}
                  className={cn('w-full px-4 py-2.5 text-sm text-left transition-colors',
                    contaTipo === tipo ? 'bg-white/10 text-white font-semibold' : 'text-[#7E8DA2] hover:bg-white/5 hover:text-white'
                  )}>
                  {tipo === 'REAL' ? 'Conta real' : 'Conta demo'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#16202D] text-xs text-[#7E8DA2] hover:text-white hover:border-white/30 transition-colors">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 9v2h9V9M6.5 1v7M4 5l2.5 3L9 5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Exportar para <ChevronDown size={12} />
        </button>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#16202D] text-xs text-[#7E8DA2] hover:text-white hover:border-white/30 transition-colors">
          <ChevronLeft size={13} /> Anterior
        </button>
        <span className="text-xs text-[#7E8DA2] font-medium px-1">1/422</span>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-semibold transition-colors">
          Próximo <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center"><ChevronRight size={10} className="text-white" /></div>
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 sm:px-6">
        <div className="grid grid-cols-[200px_260px_60px_160px_160px_120px_130px] gap-3 py-2 border-b border-[#16202D] mb-1 min-w-[1100px]">
          {['Ativo','Informações','Gráfico','Preço de abertura','Preço de fechamento','Status','Valor / Lucro'].map(h => (
            <span key={h} className="text-xs text-[#7E8DA2] font-medium">{h}</span>
          ))}
        </div>
        {loading && <div className="flex items-center justify-center py-16"><Loader2 size={20} className="text-[#7E8DA2] animate-spin" /></div>}
        {!loading && operations.length === 0 && <div className="flex flex-col items-center justify-center py-16 gap-2"><span className="text-[#7E8DA2] text-sm">Nenhuma operação encontrada</span></div>}
        {operations.map(op => {
          const isCall = op.direction === 'CALL'
          const won = op.status === 'WON'
          const lost = op.status === 'LOST'
          const open = op.status === 'OPEN'
          const profit = Number(op.profit ?? 0)
          return (
            <div key={op.id} className="grid grid-cols-[200px_260px_60px_160px_160px_120px_130px] gap-3 py-3 border-b border-[#16202D]/40 hover:bg-white/[0.02] transition-colors items-center min-w-[1100px]">
              <div className="flex items-center gap-2">
                <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white', isCall ? 'bg-green-600' : 'bg-red-600')}>
                  {isCall ? '▲' : '▼'}
                </div>
                <span className="text-xs text-white font-medium leading-tight">{op.asset_symbol}</span>
              </div>
              <div>
                <div className="text-xs font-semibold text-white mb-0.5">{op.payout_pct}%</div>
                <div className="text-[10px] text-[#7E8DA2] font-mono truncate leading-tight">{op.id}</div>
              </div>
              <div className="flex items-center justify-center"><MiniChartIcon /></div>
              <div>
                <div className="text-xs text-white font-medium font-mono">{Number(op.entry_price).toFixed(5)}</div>
                <div className="text-[10px] text-[#7E8DA2] mt-0.5">{fmtDate(op.created_at)}</div>
              </div>
              <div>
                {op.exit_price
                  ? <><div className="text-xs text-white font-medium font-mono">{Number(op.exit_price).toFixed(5)}</div><div className="text-[10px] text-[#7E8DA2] mt-0.5">{op.closed_at ? fmtDate(op.closed_at) : '—'}</div></>
                  : <span className="text-xs text-yellow-400 font-semibold">Em aberto</span>
                }
              </div>
              <div>
                {open && <span className="text-xs text-yellow-400 font-semibold">Aberta</span>}
                {won  && <span className="text-xs text-green-400 font-semibold">Ganhou</span>}
                {lost && <span className="text-xs text-red-400 font-semibold">Perdeu</span>}
                {op.status === 'DRAW' && <span className="text-xs text-[#7E8DA2] font-semibold">Empate</span>}
              </div>
              <div className="text-right">
                <div className="text-xs text-[#7E8DA2]">R$ {fmtBRL(Number(op.amount))}</div>
                {!open && <div className={cn('text-xs font-bold tabular-nums', won ? 'text-green-400' : lost ? 'text-red-400' : 'text-[#7E8DA2]')}>{won ? '+' : ''}R$ {fmtBRL(Math.abs(profit))}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══ Withdrawal Helpers ═══ */
function WithdrawalStatusBadge({ status }: { status: Withdrawal['status'] }) {
  if (status === 'pending')   return <span className="flex items-center gap-1.5 text-xs text-yellow-400"><div className="w-3 h-3 rounded-full border-2 border-yellow-400" />Aguardando aprovação</span>
  if (status === 'approved')  return <span className="flex items-center gap-1.5 text-xs text-green-400"><CheckCheck size={13} />Aprovada</span>
  if (status === 'rejected')  return <span className="flex items-center gap-1.5 text-xs text-red-400"><Ban size={13} />Rejeitada</span>
  if (status === 'cancelled') return <span className="flex items-center gap-1.5 text-xs text-[#7E8DA2]"><X size={13} />Cancelada</span>
  return null
}

/* ═══ Retirada — layout vx-* com 3 colunas ═══ */
function RetiradaTab() {
  const user    = useAuthStore(s => s.user)
  const account = useAuthStore(useCurrentAccount)

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [expandedId, setExpandedId]   = useState<string | null>(null)

  const [pixKeyType, setPixKeyType] = useState('cpf')
  const [pixKey, setPixKey]         = useState('')
  const [amount, setAmount]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [limits, setLimits] = useState<{ min: number; max: number }>({ min: 50, max: 5000 })

  const realAccount = account?.type === 'REAL' ? account : user?.accounts.find(a => a.type === 'REAL')
  const balance = realAccount ? parseFloat(realAccount.balance) : 0
  const hasPending = withdrawals.some(w => w.status === 'pending')

  const [bonusStatus, setBonusStatus] = useState<{
    active: boolean; bonus_balance: number; remaining_volume: number
  } | null>(null)

  const loadWithdrawals = useCallback(async () => {
    if (!user) return
    setLoadingList(true)
    const { data } = await supabase
      .from('withdrawals')
      .select('id,amount,pix_key_type,pix_key,status,admin_notes,created_at,processed_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
    setWithdrawals((data ?? []) as Withdrawal[])
    setLoadingList(false)
    const { data: bonus } = await secureRpc('get_bonus_status', {})
    if (bonus) setBonusStatus(bonus as any)
    const { data: cfg } = await supabase.rpc('get_public_config')
    if (cfg) setLimits({ min: Number((cfg as any).withdrawalMin ?? 50), max: Number((cfg as any).withdrawalMax ?? 5000) })
  }, [user])

  useEffect(() => { loadWithdrawals() }, [loadWithdrawals])

  const handleSubmit = async () => {
    const val = parseFloat(amount.replace(',', '.'))
    if (isNaN(val) || val < limits.min) { setFormError(`Valor mínimo: R$${limits.min},00`); return }
    if (limits.max > 0 && val > limits.max) { setFormError(`Valor máximo: R$${limits.max},00`); return }
    if (val > balance)           { setFormError('Saldo insuficiente'); return }
    if (!pixKey.trim())          { setFormError('Informe a chave PIX'); return }
    if (!realAccount)            { setFormError('Conta REAL não encontrada'); return }
    if (hasPending)              { setFormError('Você já tem uma retirada pendente. Aguarde a aprovação.'); return }
    setSubmitting(true); setFormError(null)
    const { error } = await secureRpc('request_withdrawal', {
      p_account_id: realAccount.id, p_amount: val,
      p_pix_key_type: pixKeyType, p_pix_key: pixKey.trim(),
    })
    setSubmitting(false)
    if (error) { setFormError(error.message); return }
    notifyEmail('withdrawal_requested')
    setAmount(''); setPixKey('')
    await loadWithdrawals()
    await useAuthStore.getState().refreshAccounts()
  }

  const handleCancel = async (id: string) => {
    setCancellingId(id)
    await secureRpc('cancel_withdrawal', { p_withdrawal_id: id })
    setCancellingId(null)
    await loadWithdrawals()
    await useAuthStore.getState().refreshAccounts()
  }

  const availableForWithdrawal = bonusStatus?.active ? Math.max(balance - Number(bonusStatus.bonus_balance), 0) : balance

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="flex items-start gap-4">
        {/* ── Coluna única: formulário + histórico ── */}
        <div className="vx-col w-full shrink-0">
          <div className="vx-panel p-5">
            <h2 className="vx-h3 text-[16px]">Solicitar retirada via PIX</h2>
            <p className="vx-sub mt-2.5">Escolha o tipo de chave PIX e informe os dados para retirada.</p>

            {/* Aviso de bônus */}
            {bonusStatus?.active && (
              <div className="vx-card mt-4 flex items-start gap-3 p-4">
                <Zap size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="vx-sub">
                  Você tem <span className="text-white font-semibold">R$ {fmtBRL(Number(bonusStatus.bonus_balance))}</span> de
                  bônus ativo. Opere mais <span className="text-white font-semibold">R$ {fmtBRL(Number(bonusStatus.remaining_volume))}</span> em
                  volume para liberar o bônus para saque.
                </span>
              </div>
            )}

            {/* Aviso pendente */}
            {hasPending && (
              <div className="vx-card mt-4 flex items-start gap-3 p-4 border-orange-500/30">
                <AlertCircle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
                <span className="vx-sub">Você possui uma retirada aguardando aprovação. Aguarde o processamento antes de solicitar uma nova.</span>
              </div>
            )}

            {!hasPending && (
              <>
                {/* Tipo de chave PIX — grid 5 colunas */}
                <div className="mt-5 grid grid-cols-5 overflow-hidden rounded-[10px] border border-[#1B2735]">
                  {PIX_KEY_TYPES.map(k => {
                    const Icon = k.icon
                    const active = pixKeyType === k.value
                    return (
                      <button key={k.value} type="button" onClick={() => setPixKeyType(k.value)}
                        className={cn(
                          'flex items-center justify-center gap-2 py-[13px] text-[12.5px] font-semibold transition-colors duration-200',
                          active ? 'border border-[#2E6BE6] bg-[#0F1A2C] text-white' : 'border-l border-[#1B2735] text-[#8B9BB0] hover:bg-[#0D1420] hover:text-white'
                        )}>
                        <Icon size={15} className={active ? 'text-[#6C9CF8]' : 'text-[#6B7A8E]'} />
                        {k.label}
                      </button>
                    )
                  })}
                </div>

                {/* Chave PIX */}
                <div className="mt-5 vx-field">
                  <span className="text-[12px] font-medium text-[#AEBBCB]">
                    Chave PIX ({PIX_KEY_TYPES.find(t => t.value === pixKeyType)?.label})
                  </span>
                  <input className="vx-input" value={pixKey}
                    onChange={e => { setPixKey(e.target.value); setFormError(null) }}
                    placeholder={pixKeyType === 'cpf' ? '000.000.000-00' : pixKeyType === 'email' ? 'seu@email.com' : pixKeyType === 'phone' ? '+55 11 9 0000-0000' : 'Cole a chave aqui'}
                  />
                </div>

                {/* Valor */}
                <div className="mt-4 vx-field">
                  <span className="text-[12px] font-medium text-[#AEBBCB]">Valor da retirada</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[#8B9BB0]">R$</span>
                    <input className="vx-input pl-11 pr-[70px]" type="number" min={limits.min} step={1}
                      value={amount} onChange={e => { setAmount(e.target.value); setFormError(null) }}
                      placeholder="0,00" />
                    <button type="button" onClick={() => setAmount(String(Math.floor(availableForWithdrawal)))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-[#1B2735] bg-[#101825] px-2.5 py-[5px] text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#AEBBCB] transition-colors duration-200 hover:text-white">
                      Máx
                    </button>
                  </div>
                </div>

                {/* Info card */}
                <div className="vx-card mt-5 flex items-start gap-3 p-4">
                  <Info size={17} className="mt-[1px] text-[#4B8CF5]" />
                  <span className="vx-sub">
                    O valor será transferido para a conta vinculada à chave PIX informada.
                    <br />Verifique os dados antes de confirmar sua solicitação.
                  </span>
                </div>

                {formError && (
                  <div className="mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                    <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
                    <span className="text-xs text-red-400">{formError}</span>
                  </div>
                )}

                <button onClick={handleSubmit} disabled={submitting || !amount || !pixKey} data-testid="submit-withdrawal-btn"
                  className="vx-btn-blue mt-5 w-full py-[14px] text-[14px] flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={15} className="animate-spin" />}
                  {submitting ? 'Enviando…' : 'Solicitar retirada'}
                </button>
              </>
            )}
          </div>

          {/* Pedidos recentes */}
          <div className="vx-panel p-5">
            <div className="flex items-center justify-between">
              <h3 className="vx-h3 text-[16px]">Pedidos recentes</h3>
              <button type="button" className="vx-btn-ghost px-4 py-[8px] text-[12px]">Ver todas</button>
            </div>
            <div className="mt-4 overflow-hidden rounded-[10px] border border-[#18222F]">
              <div className="grid grid-cols-4 border-b border-[#18222F] bg-[#0A1017]">
                {['Data/Hora', 'Chave PIX', 'Valor', 'Status'].map(h => (
                  <span key={h} className="vx-th">{h}</span>
                ))}
              </div>
              {loadingList ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="text-[#7E8DA2] animate-spin" />
                </div>
              ) : withdrawals.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Clock4 size={34} className="text-[#2A3A4D]" />
                  <span className="text-[13px] text-[#AEBBCB]">Nenhuma retirada solicitada ainda.</span>
                  <span className="vx-sub-sm">Suas solicitações aparecerão aqui.</span>
                </div>
              ) : (
                withdrawals.map(w => (
                  <div key={w.id}>
                    <button onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                      className="w-full grid grid-cols-4 items-center py-3 text-left hover:bg-white/[0.02] transition-colors border-b border-[#18222F]/50">
                      <span className="px-4 text-xs text-[#AEBBCB]">{fmtDate(w.created_at)}</span>
                      <span className="px-4 text-xs text-white font-mono truncate">{w.pix_key}</span>
                      <span className="px-4 text-xs font-bold text-red-400">-R$ {fmtBRL(w.amount)}</span>
                      <span className="px-4"><WithdrawalStatusBadge status={w.status} /></span>
                    </button>
                    {expandedId === w.id && (
                      <div className="bg-[#0E1620] border border-[#16202D] rounded-xl px-4 py-3 mx-2 mb-2 mt-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] text-[#7E8DA2]">Tipo:</span>
                          <span className="text-xs text-white">{PIX_KEY_TYPES.find(t => t.value === w.pix_key_type)?.label}</span>
                        </div>
                        {w.admin_notes && <p className="text-xs text-[#ccc] mb-2">{w.admin_notes}</p>}
                        {w.status === 'pending' && (
                          <button onClick={() => handleCancel(w.id)} disabled={cancellingId === w.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1B2735] text-xs font-semibold text-white hover:bg-white/5 transition-colors disabled:opacity-50">
                            {cancellingId === w.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                            Cancelar solicitação
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══ MAIN COMPONENT ═══ */
export function ContaPage({ initialTab = 'minha-conta' }: { initialTab?: ContaTab }) {
  const [activeTab, setActiveTab] = useState<ContaTab>(initialTab)
  const barUser = useAuthStore(s => s.user)
  const barBalance = (() => {
    const real = barUser?.accounts?.find(a => a.type === 'REAL')
    return real ? parseFloat(real.balance) : 0
  })()

  return (
    <div className="flex-1 flex flex-col bg-[#0A101A] min-h-0 overflow-hidden" data-testid="conta-page">
      {/* Top tabs */}
      <div className="vx-tabs px-5 flex-shrink-0 overflow-x-auto">
        {CONTA_TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} data-testid={`conta-tab-${t.key}`}
            className={activeTab === t.key ? 'vx-tab-active flex-shrink-0 whitespace-nowrap' : 'vx-tab flex-shrink-0 whitespace-nowrap'}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Balance bar — oculta em Minha conta e Verificação, que já não repetem saldo */}
      {activeTab !== 'minha-conta' && activeTab !== 'verificacao' && (
        <div className="flex items-center justify-end gap-6 px-5 py-3 border-b border-[#16202D] bg-[#0C131F] flex-shrink-0 overflow-x-auto">
          <div className="text-right flex-shrink-0">
            <div className="text-[11px] text-[#7E8DA2]">Disponível para retirada</div>
            <div className="text-[14px] font-bold text-white mt-0.5">R$ {fmtBRL(barBalance)}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[11px] text-[#7E8DA2]">Na conta</div>
            <div className="text-[14px] font-bold text-white mt-0.5">R$ {fmtBRL(barBalance)}</div>
          </div>
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'retirada' && <RetiradaTab />}
      {activeTab === 'transacoes' && <TransacoesTab />}
      {activeTab === 'operacoes' && <OperacoesTab />}
      {activeTab === 'verificacao' && <VerificacaoTab />}

      {activeTab === 'minha-conta' && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-[1.24fr_1fr] items-start gap-4">
            {/* ── Coluna esquerda ── */}
            <div className="vx-col">
              <MinhaContaForm />
            </div>

            {/* ── Coluna direita ── */}
            <div className="vx-col">
              <SegurancaCard />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analise' && <AnalisePage />}

      {activeTab !== 'minha-conta' && activeTab !== 'retirada' && activeTab !== 'transacoes' && activeTab !== 'operacoes' && activeTab !== 'analise' && activeTab !== 'verificacao' && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[#7E8DA2]">Em breve</p>
        </div>
      )}
    </div>
  )
}
