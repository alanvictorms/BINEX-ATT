'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Users, X, Search, ArrowRight, ArrowUp, ArrowDown, Check, Crown, Wallet,
  AlertTriangle, PartyPopper, Info, UserPlus, Bookmark, Activity, TrendingUp,
  BarChart3, Trophy,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'

interface Trader {
  id: string; name: string; countryCode: string; avatarUrl: string | null
  vip: boolean; paid: boolean; accessPrice: number; weeklyGainPct: number
  copiers: number; copiedTrades: number; commissionPct: number
  profitPct: number; lossPct: number; copying: boolean
}
interface HistoryOp { id: string; result: 'WIN' | 'LOSS'; pnl: number; amount: number; settledAt: string | null }
interface Subscription {
  id: string; traderId: string; trader: Trader | null; activatedAt: string
  opsGenerated: number; accumulated: number; nextOpAt: string | null
  hasPending: boolean; history: HistoryOp[]
}

function fmtSigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  const abs = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}R$ ${abs}`
}
function fmtPrice(n: number): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function Flag({ code, size = 38 }: { code: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/w80/${(code || 'br').toLowerCase()}.png`}
      alt={code} width={size} height={size}
      className="rounded-full object-cover border-2 border-[#16202D] flex-shrink-0"
      style={{ width: size, height: size }}
    />
  )
}

function Avatar({ avatarUrl, code, size = 48 }: { avatarUrl?: string | null; code: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (!avatarUrl || broken) return <Flag code={code} size={size} />
  const flagSize = Math.round(size * 0.42)
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <img src={avatarUrl} alt="" width={size} height={size} onError={() => setBroken(true)}
        className="rounded-full object-cover ring-2 ring-[#22344A]" style={{ width: size, height: size }} />
      <img src={`https://flagcdn.com/w40/${(code || 'br').toLowerCase()}.png`} alt={code}
        className="absolute -bottom-0.5 -right-0.5 rounded-full object-cover border border-[#0E1620]"
        style={{ width: flagSize, height: flagSize }} />
    </div>
  )
}

type ModalState =
  | { type: 'success'; name: string }
  | { type: 'no_balance' }
  | { type: 'insufficient' }
  | null

interface CopyPanelProps {
  onClose: () => void
  onDeposit: () => void
}

export function CopyPanel({ onClose, onDeposit }: CopyPanelProps) {
  const [tab, setTab] = useState<'TRADERS' | 'MY'>('TRADERS')
  const [enabled, setEnabled] = useState(true)
  const [traders, setTraders] = useState<Trader[]>([])
  const [subs, setSubs] = useState<Subscription[]>([])
  const [hasPending, setHasPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState<{ result: 'WIN' | 'LOSS'; pnl: number } | null>(null)
  const refreshAccounts = useAuthStore(s => s.refreshAccounts)
  const knownSettled = useRef<Set<string>>(new Set())
  const seeded = useRef(false)

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([
        api.get<{ enabled: boolean; traders: Trader[] }>('/copy/traders'),
        api.get<{ enabled: boolean; subscriptions: Subscription[]; hasPending: boolean }>('/copy/my'),
      ])
      setEnabled(t.data.enabled)
      setTraders(t.data.traders ?? [])
      const nextSubs = m.data.subscriptions ?? []
      setSubs(nextSubs)
      setHasPending(m.data.hasPending ?? false)
      const settled = nextSubs.flatMap(s => s.history)
      if (!seeded.current) {
        settled.forEach(o => knownSettled.current.add(o.id))
        seeded.current = true
      } else {
        const fresh = settled.filter(o => !knownSettled.current.has(o.id))
        fresh.forEach(o => knownSettled.current.add(o.id))
        if (fresh.length > 0) {
          const newest = fresh.reduce((a, b) => ((b.settledAt ?? '') > (a.settledAt ?? '') ? b : a))
          setToast({ result: newest.result, pnl: newest.pnl })
          setTimeout(() => setToast(null), 4500)
        }
      }
    } catch { /* keep current state */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!hasPending) return
    const id = setInterval(() => { load(); refreshAccounts() }, 30_000)
    return () => clearInterval(id)
  }, [hasPending, load, refreshAccounts])

  async function handleCopy(t: Trader) {
    if (t.copying || busyId) return
    setBusyId(t.id)
    try {
      await api.post(`/copy/${t.id}/copy`)
      await Promise.all([load(), refreshAccounts()])
      setModal({ type: 'success', name: t.name })
    } catch (err: any) {
      const code = err?.response?.data?.error
      if (code === 'NO_BALANCE') setModal({ type: 'no_balance' })
      else if (code === 'INSUFFICIENT_BALANCE') setModal({ type: 'insufficient' })
      else if (code === 'ALREADY_COPYING') await load()
      else alert(code ?? err.message)
    } finally { setBusyId(null) }
  }

  async function handleCancel(traderId: string) {
    if (!confirm('Cancelar a cópia deste trader? As operações pendentes serão encerradas (sem reembolso).')) return
    setBusyId(traderId)
    try {
      await api.post(`/copy/${traderId}/cancel`)
      await Promise.all([load(), refreshAccounts()])
    } catch (err: any) { alert(err?.response?.data?.error ?? err.message) }
    finally { setBusyId(null) }
  }

  const filtered = traders.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
  const myCount = subs.length

  const HOW = [
    { n: 1, title: 'Escolha um trader', desc: 'Analise o desempenho, risco e estratégia' },
    { n: 2, title: 'Defina seu investimento', desc: 'Escolha o valor e as configurações' },
    { n: 3, title: 'Copie automaticamente', desc: 'Suas operações serão copiadas em tempo real' },
  ]

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#0A101A]" data-testid="copy-trading-panel">
      <div className="p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-bold text-white">Copy Trading</h1>
              <Info size={16} className="text-[#6B7A8E]" />
            </div>
            <p className="text-[12.5px] text-[#7E8DA2] mt-1">
              Siga traders experientes, copie suas operações e potencialize seus resultados.
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-[#7E8DA2] hover:text-white hover:bg-white/10 transition-colors" data-testid="copy-close-btn">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex rounded-[10px] border border-[#1B2735] overflow-hidden">
          {([['TRADERS', 'Traders'], ['MY', `Meus Traders (${myCount})`]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              data-testid={`copy-tab-${key.toLowerCase()}`}
              className={cn('flex-1 py-2.5 text-[12.5px] font-semibold transition-colors',
                tab === key ? 'bg-[#101B29] text-white border border-[#2E6BE6]' : 'text-[#8B9BB0] hover:text-white'
              )}>
              {label}
            </button>
          ))}
        </div>

        {!enabled && (
          <div className="rounded-[10px] border border-[#1B2735] bg-[#0C131F] p-4 text-center text-[13px] text-[#7E8DA2]">
            O Copy Trading está temporariamente indisponível.
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-[13px] text-[#7E8DA2]">Carregando...</div>
        ) : tab === 'TRADERS' ? (
          <div className="flex flex-col gap-4">
            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8AA0]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar traders..."
                data-testid="copy-search-input"
                className="w-full h-[38px] bg-[#0C131F] border border-[#1B2735] rounded-[10px] pl-9 pr-3 text-[13px] text-white placeholder-[#7A8AA0] outline-none focus:border-[#2E6BE6] transition-colors" />
            </div>

            {/* Trader cards */}
            <div className="flex flex-col gap-3">
              {filtered.map(t => (
                <TraderCard key={t.id} t={t} busy={busyId === t.id} onCopy={() => handleCopy(t)} />
              ))}
              {filtered.length === 0 && (
                <div className="py-12 text-center text-[13px] text-[#7E8DA2]">Nenhum trader encontrado.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {subs.length === 0 ? (
              <div className="py-16 text-center text-[13px] text-[#7E8DA2]">
                Você ainda não está copiando nenhum trader.
              </div>
            ) : subs.map(s => (
              <MyTraderCard key={s.id} s={s} busy={busyId === s.traderId} onCancel={() => handleCancel(s.traderId)} />
            ))}
          </div>
        )}

        {/* How it works */}
        {tab === 'TRADERS' && (
          <div className="rounded-[10px] border border-[#1B2735] bg-[#0C131F] p-5">
            <h3 className="text-[15px] font-bold text-white">Como funciona</h3>
            <div className="mt-4 flex flex-col gap-4">
              {HOW.map(h => (
                <div key={h.n} className="flex items-start gap-3">
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-[#22344A] bg-[#101B29] text-[11px] font-bold text-[#AEBBCB]">{h.n}</span>
                  <span className="leading-none">
                    <span className="block text-[12.5px] font-semibold text-[#EAF1FA]">{h.title}</span>
                    <span className="mt-1.5 block text-[11px] text-[#7E8DA2]">{h.desc}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-[10px] bg-[#0C131F] border border-[#1B2735] shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <span className={cn('w-8 h-8 rounded-full flex items-center justify-center', toast.result === 'WIN' ? 'bg-[#1FD196]/15' : 'bg-red-500/15')}>
            {toast.result === 'WIN' ? <ArrowUp size={16} className="text-[#1FD196]" /> : <ArrowDown size={16} className="text-red-400" />}
          </span>
          <div>
            <div className="text-[13px] font-semibold text-white">Operação copiada liquidada</div>
            <div className={cn('text-[12px] font-semibold', toast.result === 'WIN' ? 'text-[#1FD196]' : 'text-red-400')}>
              {toast.result === 'WIN' ? 'Ganho' : 'Perda'} de {fmtSigned(toast.pnl)}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'success' && (
        <Modal onClose={() => setModal(null)} icon={<PartyPopper className="text-[#1FD196]" size={28} />}
          title="Copiado com sucesso!" desc={`Sua conta agora está conectada ao trader ${modal.name}.`}>
          <button onClick={() => { setModal(null); setTab('MY') }} data-testid="copy-success-view-btn"
            className="w-full py-2.5 rounded-[10px] bg-[#2E6BE6] hover:bg-[#3B7BF6] text-white text-[13px] font-semibold transition-colors">
            Ver meus traders
          </button>
        </Modal>
      )}
      {modal?.type === 'no_balance' && (
        <Modal onClose={() => setModal(null)} icon={<Wallet className="text-yellow-400" size={28} />}
          title="Você ainda não tem saldo" desc="Para copiar um trader, faça um depósito na sua conta real.">
          <button onClick={() => { setModal(null); onDeposit() }} data-testid="copy-deposit-btn"
            className="w-full py-2.5 rounded-[10px] bg-[#1FD196] hover:bg-[#17B882] text-white text-[13px] font-semibold transition-colors">
            Depositar
          </button>
        </Modal>
      )}
      {modal?.type === 'insufficient' && (
        <Modal onClose={() => setModal(null)} icon={<AlertTriangle className="text-orange-400" size={28} />}
          title="Saldo insuficiente" desc="Seu saldo real não cobre o valor de acesso deste trader. Faça um depósito para continuar.">
          <button onClick={() => { setModal(null); onDeposit() }}
            className="w-full py-2.5 rounded-[10px] bg-[#1FD196] hover:bg-[#17B882] text-white text-[13px] font-semibold transition-colors">
            Depositar
          </button>
        </Modal>
      )}
    </div>
  )
}

function TraderCard({ t, busy, onCopy }: { t: Trader; busy: boolean; onCopy: () => void }) {
  const profit = Math.max(0, Math.min(100, t.profitPct))
  const loss = Math.max(0, Math.min(100, t.lossPct))
  const total = profit + loss || 1
  return (
    <div className="rounded-[10px] bg-[#0C131F] border border-[#1B2735] p-4 flex flex-col gap-3" data-testid={`trader-card-${t.id}`}>
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={t.avatarUrl} code={t.countryCode} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-white truncate">{t.name}</span>
            {t.vip && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#2E6BE6]/15 text-[#6C9CF8] text-[10px] font-bold">
                <Crown size={10} /> VIP
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[#7E8DA2] mt-0.5">
            <Users size={11} /> {t.copiers.toLocaleString('pt-BR')} copiadores
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-[8px] bg-[#0A101A] border border-[#16202D] p-2.5 text-center">
          <div className="text-[9px] text-[#7E8DA2] font-semibold tracking-wide">GANHO/SEM</div>
          <div className="text-[15px] font-bold text-[#6C9CF8] mt-0.5">{t.weeklyGainPct}%</div>
        </div>
        <div className="rounded-[8px] bg-[#0A101A] border border-[#16202D] p-2.5 text-center">
          <div className="text-[9px] text-[#7E8DA2] font-semibold tracking-wide">NEGOCIAÇÕES</div>
          <div className="text-[15px] font-bold text-white mt-0.5">{t.copiedTrades.toLocaleString('pt-BR')}</div>
        </div>
        <div className="rounded-[8px] bg-[#0A101A] border border-[#16202D] p-2.5 text-center">
          <div className="text-[9px] text-[#7E8DA2] font-semibold tracking-wide">COMISSÃO</div>
          <div className="text-[15px] font-bold text-white mt-0.5">{t.commissionPct}%</div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-[#1FD196] font-semibold">{profit}% Lucro</span>
          <span className="text-red-400 font-semibold">Perda {loss}%</span>
        </div>
        <div className="flex h-[3px] rounded-full overflow-hidden bg-[#1E2A39]">
          <span className="bg-[#1FD196]" style={{ width: `${(profit / total) * 100}%` }} />
          <span className="bg-red-500" style={{ width: `${(loss / total) * 100}%` }} />
        </div>
      </div>

      {t.copying ? (
        <button disabled className="w-full py-2.5 rounded-[10px] bg-[#0F2A21] border border-[#1E5140] text-[#1FD196] text-[13px] font-semibold flex items-center justify-center gap-1.5">
          <Check size={15} /> Copiando
        </button>
      ) : t.paid ? (
        <button onClick={onCopy} disabled={busy} data-testid={`copy-paid-btn-${t.id}`}
          className="w-full py-2.5 rounded-[10px] bg-[#2E6BE6] hover:bg-[#3B7BF6] disabled:opacity-50 text-white text-[13px] font-semibold transition-colors">
          {busy ? 'Processando...' : `Adquirir · ${fmtPrice(t.accessPrice)}`}
        </button>
      ) : (
        <button onClick={onCopy} disabled={busy} data-testid={`copy-free-btn-${t.id}`}
          className="w-full py-2.5 rounded-[10px] bg-[#1FD196] hover:bg-[#17B882] disabled:opacity-50 text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors">
          {busy ? 'Processando...' : <><UserPlus size={15} /> Seguir Trader</>}
        </button>
      )}
    </div>
  )
}

function MyTraderCard({ s, busy, onCancel }: { s: Subscription; busy: boolean; onCancel: () => void }) {
  const t = s.trader
  const resultColor = s.accumulated > 0 ? 'text-[#1FD196]' : s.accumulated < 0 ? 'text-red-400' : 'text-white'
  return (
    <div className="rounded-[10px] bg-[#0C131F] border border-[#1B2735] p-4 flex flex-col gap-3" data-testid={`my-trader-card-${s.id}`}>
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={t?.avatarUrl} code={t?.countryCode ?? 'br'} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-white truncate">{t?.name ?? '—'}</span>
            {t?.vip && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#2E6BE6]/15 text-[#6C9CF8] text-[10px] font-bold"><Crown size={10} /> VIP</span>}
          </div>
          <div className="text-[11px] text-[#7E8DA2] mt-0.5">
            Ativo desde {fmtDate(s.activatedAt)} · {t?.paid ? 'Pago' : 'Gratuito'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[8px] bg-[#0A101A] border border-[#16202D] p-3 text-center">
          <div className="text-[9px] text-[#7E8DA2] font-semibold tracking-wide">OPERAÇÕES</div>
          <div className="text-lg font-bold text-white mt-0.5">{s.opsGenerated}</div>
        </div>
        <div className="rounded-[8px] bg-[#0A101A] border border-[#16202D] p-3 text-center">
          <div className="text-[9px] text-[#7E8DA2] font-semibold tracking-wide">RESULTADO</div>
          <div className={cn('text-lg font-bold mt-0.5', resultColor)}>{fmtSigned(s.accumulated)}</div>
        </div>
      </div>

      {s.history.length > 0 && (
        <div>
          <div className="text-[10px] text-[#7E8DA2] font-semibold tracking-wide mb-2">HISTÓRICO</div>
          <div className="flex flex-col">
            {s.history.map(op => {
              const win = op.result === 'WIN'
              return (
                <div key={op.id} className="flex items-center justify-between py-2 border-b border-[#16202D] last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-5 h-5 rounded-full flex items-center justify-center', win ? 'bg-[#1FD196]/15' : 'bg-red-500/15')}>
                      {win ? <ArrowUp size={12} className="text-[#1FD196]" /> : <ArrowDown size={12} className="text-red-400" />}
                    </span>
                    <span className="text-[13px] text-white">{win ? 'Ganho' : 'Perda'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[#7E8DA2]">{fmtTime(op.settledAt)}</span>
                    <span className={cn('text-[13px] font-semibold', win ? 'text-[#1FD196]' : 'text-red-400')}>{fmtSigned(op.pnl)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-[#7E8DA2]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#1FD196]" />
        Sua conta está conectada ao trader.
      </div>

      <button onClick={onCancel} disabled={busy} data-testid={`cancel-copy-btn-${s.id}`}
        className="w-full py-2.5 rounded-[10px] bg-[#0A101A] border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 text-[13px] font-semibold transition-colors">
        {busy ? 'Cancelando...' : 'Cancelar Cópia'}
      </button>
    </div>
  )
}

function Modal({ onClose, icon, title, desc, children }: {
  onClose: () => void; icon: React.ReactNode; title: string; desc: string; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#0C131F] border border-[#1B2735] rounded-[14px] w-full max-w-sm p-6 flex flex-col items-center text-center gap-3" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-xl bg-[#0A101A] border border-[#1B2735] flex items-center justify-center">{icon}</div>
        <h3 className="text-white font-bold text-[15px]">{title}</h3>
        <p className="text-[13px] text-[#7E8DA2] leading-snug">{desc}</p>
        <div className="w-full mt-2 flex flex-col gap-2">
          {children}
          <button onClick={onClose} className="w-full py-2 rounded-[10px] text-[#7E8DA2] hover:text-white text-[13px] transition-colors">Fechar</button>
        </div>
      </div>
    </div>
  )
}
