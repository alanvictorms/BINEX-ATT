'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Users, X, Search, ArrowRight, ArrowUp, ArrowDown, Check, Crown, Wallet, AlertTriangle, PartyPopper } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'

// ─── Tipos (espelham as respostas do backend /copy) ────────────────────────────
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

// ─── Formatacao de moeda (negativo = "-R$ 50,00", sinal antes do R$) ────────────
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

// Foto real do trader (avatar_url) com a bandeira sobreposta no canto.
// Sem avatar -> cai pro flag redondo simples. Se a foto falhar, mostra o flag.
function Avatar({ avatarUrl, code, size = 42 }: { avatarUrl?: string | null; code: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (!avatarUrl || broken) return <Flag code={code} size={size} />
  const flagSize = Math.round(size * 0.42)
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <img
        src={avatarUrl} alt="" width={size} height={size} onError={() => setBroken(true)}
        className="rounded-full object-cover border-2 border-[#16202D]"
        style={{ width: size, height: size }}
      />
      <img
        src={`https://flagcdn.com/w40/${(code || 'br').toLowerCase()}.png`} alt={code}
        className="absolute -bottom-0.5 -right-0.5 rounded-full object-cover border border-[#0E1620]"
        style={{ width: flagSize, height: flagSize }}
      />
    </div>
  )
}

function VipBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-300 text-[10px] font-bold">
      <Crown size={10} /> VIP
    </span>
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
  // Notificacao in-app: detecta operacoes recem-liquidadas entre os polls.
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

      // Toast quando uma operacao nova liquida (apos o 1o carregamento).
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
    } catch {
      /* mantem estado atual em erro transitorio */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Poll leve enquanto houver operacao pendente — atualiza historico + saldo.
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
    } finally {
      setBusyId(null)
    }
  }

  async function handleCancel(traderId: string) {
    if (!confirm('Cancelar a cópia deste trader? As operações pendentes serão encerradas (sem reembolso).')) return
    setBusyId(traderId)
    try {
      await api.post(`/copy/${traderId}/cancel`)
      await Promise.all([load(), refreshAccounts()])
    } catch (err: any) {
      alert(err?.response?.data?.error ?? err.message)
    } finally {
      setBusyId(null)
    }
  }

  const filtered = traders.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
  const myCount = subs.length

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#0A101A]">
      <div className="mx-auto w-full max-w-2xl flex flex-col min-h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[#0C131F] border-b border-[#16202D]">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-400" />
            <h2 className="text-base font-bold text-white">Copy Trading</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-[#7E8DA2] hover:text-white hover:bg-white/10 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#0C131F] border-b border-[#16202D]">
          {([['TRADERS', 'Traders'], ['MY', `Meus Traders (${myCount})`]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 py-3 text-sm font-semibold relative transition-colors',
                tab === key ? 'text-white' : 'text-[#7E8DA2] hover:text-white',
              )}
            >
              {label}
              {tab === key && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500" />}
            </button>
          ))}
        </div>

        {!enabled && (
          <div className="m-4 p-4 rounded-xl bg-[#0E1620] border border-[#16202D] text-center text-sm text-[#7E8DA2]">
            O Copy Trading está temporariamente indisponível.
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-sm text-[#7E8DA2]">Carregando…</div>
        ) : tab === 'TRADERS' ? (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-xs text-[#7E8DA2] leading-snug">
              Copie os melhores traders para aprender e crescer. Forma fácil pra quem está começando.
            </p>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E8DA2]" />
              <input
                value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar"
                className="w-full bg-[#0E1620] border border-[#16202D] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-[#7E8DA2] focus:border-blue-500 focus:outline-none"
              />
            </div>
            {filtered.map(t => <TraderCard key={t.id} t={t} busy={busyId === t.id} onCopy={() => handleCopy(t)} />)}
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-[#7E8DA2]">Nenhum trader encontrado.</div>
            )}
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-3">
            {subs.length === 0 ? (
              <div className="py-16 text-center text-sm text-[#7E8DA2]">
                Você ainda não está copiando nenhum trader.
              </div>
            ) : (
              subs.map(s => (
                <MyTraderCard key={s.id} s={s} busy={busyId === s.traderId} onCancel={() => handleCancel(s.traderId)} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Toast in-app quando uma operacao copiada liquida */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0E1620] border border-[#16202D] shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <span className={cn('w-8 h-8 rounded-full flex items-center justify-center', toast.result === 'WIN' ? 'bg-green-500/15' : 'bg-red-500/15')}>
            {toast.result === 'WIN' ? <ArrowUp size={16} className="text-green-400" /> : <ArrowDown size={16} className="text-red-400" />}
          </span>
          <div>
            <div className="text-sm font-semibold text-white">Operação copiada liquidada</div>
            <div className={cn('text-xs font-semibold', toast.result === 'WIN' ? 'text-green-400' : 'text-red-400')}>
              {toast.result === 'WIN' ? 'Ganho' : 'Perda'} de {fmtSigned(toast.pnl)}
            </div>
          </div>
        </div>
      )}

      {/* Modais */}
      {modal?.type === 'success' && (
        <Modal onClose={() => setModal(null)} icon={<PartyPopper className="text-green-400" size={28} />}
          title="Copiado com sucesso!"
          desc={`Sua conta agora está conectada ao trader ${modal.name}.`}>
          <button onClick={() => { setModal(null); setTab('MY') }} className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">
            Ver meus traders
          </button>
        </Modal>
      )}
      {modal?.type === 'no_balance' && (
        <Modal onClose={() => setModal(null)} icon={<Wallet className="text-yellow-400" size={28} />}
          title="Você ainda não tem saldo"
          desc="Para copiar um trader, faça um depósito na sua conta real.">
          <button onClick={() => { setModal(null); onDeposit() }} className="w-full py-2.5 rounded-lg bg-green-500 hover:bg-green-400 text-white text-sm font-semibold">
            Depositar
          </button>
        </Modal>
      )}
      {modal?.type === 'insufficient' && (
        <Modal onClose={() => setModal(null)} icon={<AlertTriangle className="text-orange-400" size={28} />}
          title="Saldo insuficiente"
          desc="Seu saldo real não cobre o valor de acesso deste trader. Faça um depósito para continuar.">
          <button onClick={() => { setModal(null); onDeposit() }} className="w-full py-2.5 rounded-lg bg-green-500 hover:bg-green-400 text-white text-sm font-semibold">
            Depositar
          </button>
        </Modal>
      )}
    </div>
  )
}

// ─── Card do catalogo ──────────────────────────────────────────────────────────
function TraderCard({ t, busy, onCopy }: { t: Trader; busy: boolean; onCopy: () => void }) {
  const profit = Math.max(0, Math.min(100, t.profitPct))
  const loss   = Math.max(0, Math.min(100, t.lossPct))
  const total  = profit + loss || 1

  return (
    <div className="rounded-2xl bg-[#0E1620] border border-[#16202D] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={t.avatarUrl} code={t.countryCode} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-[15px] truncate">{t.name}</span>
            {t.vip && <VipBadge />}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[#7E8DA2] mt-0.5">
            <Users size={11} /> Copiadores: {t.copiers.toLocaleString('pt-BR')}/100
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="GANHO/SEM" value={`${t.weeklyGainPct}%`} accent />
        <Stat label="NEGOCIAÇÕES" value={t.copiedTrades.toLocaleString('pt-BR')} />
        <Stat label="COMISSÃO" value={`${t.commissionPct}%`} />
      </div>

      {/* Barra Lucro / Perda */}
      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-green-400 font-semibold">{profit}% Lucro</span>
          <span className="text-red-400 font-semibold">Perda {loss}%</span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-[#16202D]">
          <span className="bg-green-500" style={{ width: `${(profit / total) * 100}%` }} />
          <span className="bg-red-500" style={{ width: `${(loss / total) * 100}%` }} />
        </div>
      </div>

      {t.copying ? (
        <button disabled className="w-full py-2.5 rounded-lg bg-[#243042] text-green-400 text-sm font-semibold flex items-center justify-center gap-1.5">
          <Check size={15} /> Copiando
        </button>
      ) : t.paid ? (
        <button onClick={onCopy} disabled={busy} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 text-white text-sm font-semibold">
          {busy ? 'Processando…' : `Adquirir · ${fmtPrice(t.accessPrice)}`}
        </button>
      ) : (
        <button onClick={onCopy} disabled={busy} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-1.5">
          {busy ? 'Processando…' : <>Copiar grátis <ArrowRight size={15} /></>}
        </button>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[9px] text-[#7E8DA2] font-semibold tracking-wide">{label}</div>
      <div className={cn('text-base font-bold mt-0.5', accent ? 'text-blue-400' : 'text-white')}>{value}</div>
    </div>
  )
}

// ─── Card "Meus Traders" ───────────────────────────────────────────────────────
function MyTraderCard({ s, busy, onCancel }: { s: Subscription; busy: boolean; onCancel: () => void }) {
  const t = s.trader
  const resultColor = s.accumulated > 0 ? 'text-green-400' : s.accumulated < 0 ? 'text-red-400' : 'text-white'

  return (
    <div className="rounded-2xl bg-[#0E1620] border border-[#16202D] p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={t?.avatarUrl} code={t?.countryCode ?? 'br'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-[15px] truncate">{t?.name ?? '—'}</span>
            {t?.vip && <VipBadge />}
          </div>
          <div className="text-[11px] text-[#7E8DA2] mt-0.5">
            Ativo desde {fmtDate(s.activatedAt)} · {t?.paid ? 'Pago' : 'Gratuito'}
          </div>
        </div>
      </div>

      {/* Operacoes / Resultado */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#0A101A] border border-[#16202D] p-3 text-center">
          <div className="text-[9px] text-[#7E8DA2] font-semibold tracking-wide">OPERAÇÕES</div>
          <div className="text-lg font-bold text-white mt-0.5">{s.opsGenerated}</div>
        </div>
        <div className="rounded-xl bg-[#0A101A] border border-[#16202D] p-3 text-center">
          <div className="text-[9px] text-[#7E8DA2] font-semibold tracking-wide">RESULTADO</div>
          <div className={cn('text-lg font-bold mt-0.5', resultColor)}>{fmtSigned(s.accumulated)}</div>
        </div>
      </div>

      {/* Historico (somente liquidadas) */}
      {s.history.length > 0 && (
        <div>
          <div className="text-[10px] text-[#7E8DA2] font-semibold tracking-wide mb-2">HISTÓRICO DE OPERAÇÕES</div>
          <div className="flex flex-col">
            {s.history.map(op => {
              const win = op.result === 'WIN'
              return (
                <div key={op.id} className="flex items-center justify-between py-2 border-b border-[#16202D] last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-5 h-5 rounded-full flex items-center justify-center', win ? 'bg-green-500/15' : 'bg-red-500/15')}>
                      {win ? <ArrowUp size={12} className="text-green-400" /> : <ArrowDown size={12} className="text-red-400" />}
                    </span>
                    <span className="text-sm text-white">{win ? 'Ganho' : 'Perda'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#7E8DA2]">{fmtTime(op.settledAt)}</span>
                    <span className={cn('text-sm font-semibold', win ? 'text-green-400' : 'text-red-400')}>{fmtSigned(op.pnl)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Texto fixo (sem countdown da proxima operacao) */}
      <div className="flex items-center gap-1.5 text-[11px] text-[#7E8DA2]">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Sua conta está conectada ao trader.
      </div>

      <button onClick={onCancel} disabled={busy} className="w-full py-2.5 rounded-lg bg-[#0A101A] border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 text-sm font-semibold">
        {busy ? 'Cancelando…' : 'Cancelar Cópia'}
      </button>
    </div>
  )
}

// ─── Modal generico ────────────────────────────────────────────────────────────
function Modal({ onClose, icon, title, desc, children }: {
  onClose: () => void; icon: React.ReactNode; title: string; desc: string; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#0E1620] border border-[#16202D] rounded-2xl w-full max-w-sm p-6 flex flex-col items-center text-center gap-3" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-2xl bg-[#0A101A] border border-[#16202D] flex items-center justify-center">{icon}</div>
        <h3 className="text-white font-bold text-base">{title}</h3>
        <p className="text-sm text-[#7E8DA2] leading-snug">{desc}</p>
        <div className="w-full mt-2 flex flex-col gap-2">
          {children}
          <button onClick={onClose} className="w-full py-2 rounded-lg text-[#7E8DA2] hover:text-white text-sm">Fechar</button>
        </div>
      </div>
    </div>
  )
}
