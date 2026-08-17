'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Users, X, Search, ArrowRight, ArrowUp, ArrowDown, Check, Crown, Wallet,
  AlertTriangle, PartyPopper, Info, UserPlus, Bookmark, Activity, TrendingUp,
  BarChart3, Trophy, ChevronDown, SlidersHorizontal, BadgeCheck,
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

function fmtSigned(n: number) { const s = n > 0 ? '+' : n < 0 ? '-' : ''; return `${s}R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function fmtPrice(n: number) { return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function fmtTime(iso: string | null) { if (!iso) return ''; return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) }

function FlagImg({ code, size = 16 }: { code: string; size?: number }) {
  return <img src={`https://flagcdn.com/w80/${(code || 'br').toLowerCase()}.png`} alt={code} className="rounded-full object-cover" style={{ width: size, height: size }} />
}

function Avatar({ avatarUrl, code, size = 54 }: { avatarUrl?: string | null; code: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (!avatarUrl || broken) return <img src={`https://flagcdn.com/w80/${(code || 'br').toLowerCase()}.png`} alt={code} className="rounded-full object-cover ring-2 ring-[#22344A]" style={{ width: size, height: size }} />
  return <img src={avatarUrl} alt="" onError={() => setBroken(true)} className="rounded-full object-cover ring-2 ring-[#22344A]" style={{ width: size, height: size }} />
}

const Spark = () => (
  <svg width="118" height="46" viewBox="0 0 118 46" className="shrink-0">
    <path d="M0 40 L12 36 L22 39 L32 30 L44 33 L56 22 L68 26 L80 16 L92 19 L104 9 L118 5" fill="none" stroke="#1FD196" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
)

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="leading-none">
    <span className="vx-label block text-[9px]">{label}</span>
    <span className="mt-2.5 block text-[14px] font-semibold text-white">{value}</span>
  </div>
)

type ModalState = { type: 'success'; name: string } | { type: 'no_balance' } | { type: 'insufficient' } | null

interface CopyPanelProps { onClose: () => void; onDeposit: () => void }

const HOW = [
  { n: 1, title: 'Escolha um trader', desc: 'Analise o desempenho, risco e estratégia' },
  { n: 2, title: 'Defina seu investimento', desc: 'Escolha o valor e as configurações' },
  { n: 3, title: 'Copie automaticamente', desc: 'Suas operações serão copiadas em tempo real' },
]

const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR')
const fmtPctSigned = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(0)}%`

/**
 * Risco do trader, derivado do percentual de operações perdedoras (lossPct — o
 * mesmo número que o admin cadastra e que já alimenta a barra de rentabilidade).
 *
 * O catálogo não tem campo de risco. Derivar do que já está na tela é honesto;
 * cravar "Moderado" fixo pra todo mundo, como no material de referência, seria
 * um selo sem lastro nenhum.
 */
function riscoDe(lossPct: number): { label: string; nivel: 1 | 2 | 3; cor: string } {
  if (lossPct <= 20) return { label: 'Baixo',    nivel: 1, cor: '#1FD196' }
  if (lossPct <= 35) return { label: 'Moderado', nivel: 2, cor: '#F0B429' }
  return { label: 'Alto', nivel: 3, cor: '#F0435A' }
}

/** Cartão de número grande do topo. */
const Kpi = ({ label, value, hint, green }: { label: string; value: string; hint: string; green?: boolean }) => (
  <div className="vx-panel min-w-0 flex-1 px-5 py-4">
    <span className="vx-label block text-[9.5px]">{label}</span>
    <span className={cn('mt-3 block truncate text-[26px] font-bold leading-none', green ? 'text-[#1FD196]' : 'text-white')}>{value}</span>
    <span className="vx-sub-sm mt-2.5 block">{hint}</span>
  </div>
)

const Filtro = ({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode
}) => (
  <div className="vx-select-wrap w-[150px] shrink-0">
    <select value={value} onChange={e => onChange(e.target.value)} className="vx-select py-[9px] text-[12.5px]">
      {children}
    </select>
    <ChevronDown size={14} className="vx-select-icon" />
  </div>
)

export function CopyPanel({ onClose, onDeposit }: CopyPanelProps) {
  const [tab, setTab] = useState<'TRADERS' | 'MY'>('TRADERS')
  const [enabled, setEnabled] = useState(true)
  const [traders, setTraders] = useState<Trader[]>([])
  const [subs, setSubs] = useState<Subscription[]>([])
  const [hasPending, setHasPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Filtros do catálogo. Todos batem em campo que o trader já tem — nada aqui é
  // botão decorativo: se não dá pra filtrar de verdade, não vira filtro.
  const [fRetorno, setFRetorno] = useState('all')
  const [fRisco, setFRisco]     = useState('all')
  const [fPais, setFPais]       = useState('all')
  const [ordem, setOrdem]       = useState('pop')
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
      setEnabled(t.data.enabled); setTraders(t.data.traders ?? [])
      const nextSubs = m.data.subscriptions ?? []; setSubs(nextSubs); setHasPending(m.data.hasPending ?? false)
      const settled = nextSubs.flatMap(s => s.history)
      if (!seeded.current) { settled.forEach(o => knownSettled.current.add(o.id)); seeded.current = true }
      else {
        const fresh = settled.filter(o => !knownSettled.current.has(o.id)); fresh.forEach(o => knownSettled.current.add(o.id))
        if (fresh.length > 0) { const newest = fresh.reduce((a, b) => ((b.settledAt ?? '') > (a.settledAt ?? '') ? b : a)); setToast({ result: newest.result, pnl: newest.pnl }); setTimeout(() => setToast(null), 4500) }
      }
    } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!hasPending) return; const id = setInterval(() => { load(); refreshAccounts() }, 30_000); return () => clearInterval(id) }, [hasPending, load, refreshAccounts])

  async function handleCopy(t: Trader) {
    if (t.copying || busyId) return; setBusyId(t.id)
    try { await api.post(`/copy/${t.id}/copy`); await Promise.all([load(), refreshAccounts()]); setModal({ type: 'success', name: t.name }) }
    catch (err: any) { const code = err?.response?.data?.error; if (code === 'NO_BALANCE') setModal({ type: 'no_balance' }); else if (code === 'INSUFFICIENT_BALANCE') setModal({ type: 'insufficient' }); else if (code === 'ALREADY_COPYING') await load(); else alert(code ?? err.message) }
    finally { setBusyId(null) }
  }
  async function handleCancel(traderId: string) {
    if (!confirm('Cancelar a cópia deste trader?')) return; setBusyId(traderId)
    try { await api.post(`/copy/${traderId}/cancel`); await Promise.all([load(), refreshAccounts()]) } catch (err: any) { alert(err?.response?.data?.error ?? err.message) } finally { setBusyId(null) }
  }

  const paises = useMemo(
    () => [...new Set(traders.map(t => (t.countryCode || 'br').toLowerCase()))].sort(),
    [traders],
  )

  const filtered = useMemo(() => {
    const termo = search.trim().toLowerCase()
    const minRetorno = fRetorno === 'all' ? -Infinity : Number(fRetorno)
    return traders
      .filter(t => t.name.toLowerCase().includes(termo))
      .filter(t => t.weeklyGainPct >= minRetorno)
      .filter(t => fRisco === 'all' || riscoDe(t.lossPct).label === fRisco)
      .filter(t => fPais === 'all' || (t.countryCode || 'br').toLowerCase() === fPais)
      .sort((a, b) => (
        ordem === 'retorno'  ? b.weeklyGainPct - a.weeklyGainPct
        : ordem === 'comissao' ? a.commissionPct - b.commissionPct
        : b.copiers - a.copiers
      ))
  }, [traders, search, fRetorno, fRisco, fPais, ordem])

  // Números do topo e da barra lateral: somados do catálogo que a própria tela
  // está mostrando. Assim o "1.248 traders ativos" nunca briga com a lista.
  const stats = useMemo(() => {
    const n = traders.length
    return {
      traders:    n,
      copiadores: traders.reduce((s, t) => s + t.copiers, 0),
      operacoes:  traders.reduce((s, t) => s + t.copiedTrades, 0),
      retorno:    n ? traders.reduce((s, t) => s + t.weeklyGainPct, 0) / n : 0,
      comissao:   n ? traders.reduce((s, t) => s + t.commissionPct, 0) / n : 0,
    }
  }, [traders])

  const myCount = subs.length

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#0A101A]" data-testid="copy-trading-panel">
      <div className="vx-page flex-col m-0 rounded-none border-0">
        {/* Header */}
        <div className="flex items-start">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="vx-h1">Copy Trading</h1>
              <Info size={16} className="text-[#6B7A8E]" />
            </div>
            <p className="vx-sub mt-3">Siga traders experientes, copie suas operações e potencialize seus resultados.</p>
          </div>
          <div className="vx-segment">
            <button type="button" onClick={() => setTab('TRADERS')} className={tab === 'TRADERS' ? 'vx-segment-item-active' : 'vx-segment-item'}>Traders</button>
            <button type="button" onClick={() => setTab('MY')} className={tab === 'MY' ? 'vx-segment-item-active' : 'vx-segment-item'}>Meus Traders ({myCount})</button>
          </div>
        </div>

        {!enabled && <div className="vx-panel p-4 text-center text-[13px] text-[#7E8DA2]">O Copy Trading está temporariamente indisponível.</div>}

        {loading ? <div className="p-8 text-center text-[13px] text-[#7E8DA2]">Carregando...</div> : tab === 'TRADERS' ? (
          <div className="flex flex-col gap-4">
          {/* Resumo do catálogo */}
          <div className="flex items-stretch gap-3">
            <Kpi label="Traders ativos"    value={fmtInt(stats.traders)}    hint="No catálogo agora" />
            <Kpi label="Copiadores"        value={fmtInt(stats.copiadores)} hint="Somando todos os traders" />
            <Kpi label="Operações copiadas" value={fmtInt(stats.operacoes)} hint="Desde o início" />
            <Kpi label="Retorno médio"     value={fmtPctSigned(stats.retorno)} hint="Últimos 30 dias" green />
          </div>

          <div className="flex items-start gap-4">
            <div className="vx-col min-w-0 flex-1">
              {/* Filters */}
              <div className="vx-panel flex flex-wrap items-center gap-3 p-3.5">
                <div className="relative w-[220px] shrink-0">
                  <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8AA0]" />
                  <input className="vx-input pl-9 py-[9px]" placeholder="Buscar traders..." value={search} onChange={e => setSearch(e.target.value)} data-testid="copy-search-input" />
                </div>
                <Filtro value={fRetorno} onChange={setFRetorno}>
                  <option value="all">Retorno: todos</option>
                  <option value="30">Acima de +30%</option>
                  <option value="50">Acima de +50%</option>
                  <option value="80">Acima de +80%</option>
                </Filtro>
                <Filtro value={fRisco} onChange={setFRisco}>
                  <option value="all">Risco: todos</option>
                  <option value="Baixo">Baixo</option>
                  <option value="Moderado">Moderado</option>
                  <option value="Alto">Alto</option>
                </Filtro>
                <Filtro value={fPais} onChange={setFPais}>
                  <option value="all">País: todos</option>
                  {paises.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </Filtro>
                <div className="ml-auto flex items-center gap-2">
                  <span className="vx-sub-sm shrink-0">Ordenar por</span>
                  <Filtro value={ordem} onChange={setOrdem}>
                    <option value="pop">Popularidade</option>
                    <option value="retorno">Maior retorno</option>
                    <option value="comissao">Menor comissão</option>
                  </Filtro>
                </div>
              </div>

              {/* Trader list */}
              <div className="vx-panel divide-y divide-[#141C28]">
                {filtered.length === 0 && <div className="py-12 text-center text-[13px] text-[#7E8DA2]">Nenhum trader encontrado.</div>}
                {filtered.map(t => {
                  const profit = Math.max(0, Math.min(100, t.profitPct))
                  const loss = Math.max(0, Math.min(100, t.lossPct))
                  const slider = profit
                  const risco = riscoDe(loss)
                  return (
                    <div key={t.id} className="relative flex items-center gap-6 px-5 py-5" data-testid={`trader-card-${t.id}`}>
                      <div className="flex w-[212px] shrink-0 flex-col gap-3">
                        <div className="flex items-start gap-3">
                          <Avatar avatarUrl={t.avatarUrl} code={t.countryCode} size={54} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <FlagImg code={t.countryCode} size={16} />
                              <span className="whitespace-nowrap text-[15px] font-bold text-white">{t.name}</span>
                              {t.vip && <span className="vx-chip-blue"><Crown size={10} /> VIP</span>}
                            </div>
                            <div className="vx-sub-sm mt-2 flex items-center gap-1.5"><Users size={11} /> {t.copiers.toLocaleString('pt-BR')} copiadores</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex w-[190px] shrink-0 flex-col gap-2">
                        <span className="vx-label block text-[9px]">Retorno (30D)</span>
                        <span className="text-[26px] font-bold leading-none text-[#1FD196]">+{t.weeklyGainPct}%</span>
                        <Spark />
                      </div>
                      <div className="flex w-[95px] shrink-0 flex-col gap-5">
                        <Metric label="Operações" value={t.copiedTrades.toLocaleString('pt-BR')} />
                      </div>
                      <div className="flex w-[120px] shrink-0 flex-col gap-5">
                        <Metric label="Taxa de sucesso" value={`${t.profitPct}%`} />
                      </div>
                      <div className="flex w-[95px] shrink-0 flex-col gap-5">
                        <Metric label="Comissão" value={`${t.commissionPct}%`} />
                      </div>
                      <div className="w-[110px] shrink-0 leading-none">
                        <span className="vx-label block text-[9px]">Risco</span>
                        <span className="mt-2.5 block text-[14px] font-semibold" style={{ color: risco.cor }}>{risco.label}</span>
                        <span className="mt-2.5 flex gap-1">
                          {[1, 2, 3].map(i => (
                            <span
                              key={i}
                              className="h-[3px] w-[14px] rounded-full"
                              style={{ background: i <= risco.nivel ? risco.cor : '#1E2A39' }}
                            />
                          ))}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-4">
                        <div>
                          <span className="vx-label block text-[9px]">Rentabilidade (30D)</span>
                          <div className="relative mt-4 h-[3px] w-full rounded-full bg-[#1E2A39]">
                            <span className="absolute left-1/2 top-0 h-full rounded-full bg-[#1FD196]" style={{ width: `${slider / 2}%` }} />
                          </div>
                          <div className="mt-2.5 flex justify-between text-[9.5px] font-medium text-[#5D6C80]"><span>-100%</span><span>0%</span><span>+100%</span></div>
                        </div>
                        {t.copying ? (
                          <button disabled className="vx-btn-ghost w-full text-[#1FD196]"><Check size={15} /> Copiando</button>
                        ) : t.paid ? (
                          <button onClick={() => handleCopy(t)} disabled={busyId === t.id} className="vx-btn-blue w-full" data-testid={`copy-btn-${t.id}`}>{busyId === t.id ? 'Processando...' : `Adquirir · ${fmtPrice(t.accessPrice)}`}</button>
                        ) : (
                          <button onClick={() => handleCopy(t)} disabled={busyId === t.id} className="vx-btn-green w-full" data-testid={`copy-btn-${t.id}`}>{busyId === t.id ? 'Processando...' : <><UserPlus size={16} /> Seguir Trader</>}</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Right column */}
            <div className="vx-col w-[300px] shrink-0">
              <div className="vx-panel p-5">
                <h3 className="vx-h3 text-[15px]">Como funciona</h3>
                <div className="mt-4 flex flex-col gap-4">
                  {HOW.map(h => (
                    <div key={h.n} className="flex items-start gap-3">
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-[#22344A] bg-[#101B29] text-[11px] font-bold text-[#AEBBCB]">{h.n}</span>
                      <span className="leading-none">
                        <span className="block text-[12.5px] font-semibold text-[#EAF1FA]">{h.title}</span>
                        <span className="vx-sub-sm mt-2 block">{h.desc}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="vx-divider my-4" />
                <button type="button" className="vx-link">Saiba mais sobre Copy Trading <ArrowRight size={13} /></button>
              </div>

              {/* Estatísticas — mesmos números do topo, somados do catálogo. */}
              <div className="vx-panel p-5">
                <h3 className="vx-h3 text-[15px]">Estatísticas do Copy Trading</h3>
                <div className="mt-4 flex flex-col gap-3.5">
                  {[
                    { icon: <Users size={15} />,      label: 'Traders ativos',      value: fmtInt(stats.traders) },
                    { icon: <Activity size={15} />,   label: 'Copiadores ativos',   value: fmtInt(stats.copiadores) },
                    { icon: <BarChart3 size={15} />,  label: 'Operações copiadas',  value: fmtInt(stats.operacoes) },
                    { icon: <TrendingUp size={15} />, label: 'Retorno médio (30D)', value: fmtPctSigned(stats.retorno), green: true },
                    { icon: <Wallet size={15} />,     label: 'Comissão média',      value: `${stats.comissao.toFixed(1)}%` },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-2.5">
                      <span className="shrink-0 text-[#6B7A8E]">{s.icon}</span>
                      <span className="vx-label min-w-0 flex-1 truncate text-[9.5px]">{s.label}</span>
                      <span className={cn('shrink-0 text-[13px] font-bold', s.green ? 'text-[#1FD196]' : 'text-white')}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="vx-panel relative overflow-hidden p-5">
                <h3 className="vx-h3 text-[15px]">Seja um Trader</h3>
                <p className="vx-sub mt-3 max-w-[170px]">Compartilhe sua estratégia e ganhe comissões</p>
                <button type="button" className="vx-btn-ghost mt-5">Tornar-se Trader</button>
                <Trophy size={74} className="pointer-events-none absolute -bottom-2 right-2 text-[#4B8CF5]/25" />
              </div>
            </div>
          </div>
          </div>
        ) : (
          /* MY TRADERS tab */
          <div className="flex flex-col gap-3">
            {subs.length === 0 ? <div className="py-16 text-center text-[13px] text-[#7E8DA2]">Você ainda não está copiando nenhum trader.</div> : subs.map(s => {
              const t = s.trader; const resultColor = s.accumulated > 0 ? 'text-[#1FD196]' : s.accumulated < 0 ? 'text-red-400' : 'text-white'
              return (
                <div key={s.id} className="vx-panel p-5 flex flex-col gap-3" data-testid={`my-trader-${s.id}`}>
                  <div className="flex items-center gap-3">
                    <Avatar avatarUrl={t?.avatarUrl} code={t?.countryCode ?? 'br'} size={48} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-white truncate">{t?.name ?? '—'}</span>
                        {t?.vip && <span className="vx-chip-blue"><Crown size={10} /> VIP</span>}
                      </div>
                      <div className="vx-sub-sm mt-0.5">Ativo desde {fmtDate(s.activatedAt)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="vx-card p-3 text-center"><div className="vx-label">OPERAÇÕES</div><div className="text-lg font-bold text-white mt-0.5">{s.opsGenerated}</div></div>
                    <div className="vx-card p-3 text-center"><div className="vx-label">RESULTADO</div><div className={cn('text-lg font-bold mt-0.5', resultColor)}>{fmtSigned(s.accumulated)}</div></div>
                  </div>
                  {s.history.length > 0 && <div>{s.history.map(op => { const win = op.result === 'WIN'; return (
                    <div key={op.id} className="flex items-center justify-between py-2 border-b border-[#16202D] last:border-0">
                      <div className="flex items-center gap-2"><span className={cn('w-5 h-5 rounded-full flex items-center justify-center', win ? 'bg-[#1FD196]/15' : 'bg-red-500/15')}>{win ? <ArrowUp size={12} className="text-[#1FD196]" /> : <ArrowDown size={12} className="text-red-400" />}</span><span className="text-[13px] text-white">{win ? 'Ganho' : 'Perda'}</span></div>
                      <div className="flex items-center gap-3"><span className="vx-sub-sm">{fmtTime(op.settledAt)}</span><span className={cn('text-[13px] font-semibold', win ? 'text-[#1FD196]' : 'text-red-400')}>{fmtSigned(op.pnl)}</span></div>
                    </div>
                  ) })}</div>}
                  <div className="flex items-center gap-1.5 vx-sub-sm"><span className="w-1.5 h-1.5 rounded-full bg-[#1FD196]" />Conectado ao trader.</div>
                  <button onClick={() => handleCancel(s.traderId)} disabled={busyId === s.traderId} className="vx-btn-ghost w-full text-red-400 border-red-500/30 hover:bg-red-500/10">{busyId === s.traderId ? 'Cancelando...' : 'Cancelar Cópia'}</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {toast && <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 vx-panel shadow-xl"><span className={cn('w-8 h-8 rounded-full flex items-center justify-center', toast.result === 'WIN' ? 'bg-[#1FD196]/15' : 'bg-red-500/15')}>{toast.result === 'WIN' ? <ArrowUp size={16} className="text-[#1FD196]" /> : <ArrowDown size={16} className="text-red-400" />}</span><div><div className="text-[13px] font-semibold text-white">Operação copiada liquidada</div><div className={cn('text-[12px] font-semibold', toast.result === 'WIN' ? 'text-[#1FD196]' : 'text-red-400')}>{toast.result === 'WIN' ? 'Ganho' : 'Perda'} de {fmtSigned(toast.pnl)}</div></div></div>}

      {modal?.type === 'success' && <Modal onClose={() => setModal(null)} icon={<PartyPopper className="text-[#1FD196]" size={28} />} title="Copiado com sucesso!" desc={`Conectado ao trader ${modal.name}.`}><button onClick={() => { setModal(null); setTab('MY') }} className="vx-btn-blue w-full">Ver meus traders</button></Modal>}
      {modal?.type === 'no_balance' && <Modal onClose={() => setModal(null)} icon={<Wallet className="text-yellow-400" size={28} />} title="Sem saldo" desc="Faça um depósito na conta real."><button onClick={() => { setModal(null); onDeposit() }} className="vx-btn-green w-full">Depositar</button></Modal>}
      {modal?.type === 'insufficient' && <Modal onClose={() => setModal(null)} icon={<AlertTriangle className="text-orange-400" size={28} />} title="Saldo insuficiente" desc="Faça um depósito para continuar."><button onClick={() => { setModal(null); onDeposit() }} className="vx-btn-green w-full">Depositar</button></Modal>}
    </div>
  )
}

function Modal({ onClose, icon, title, desc, children }: { onClose: () => void; icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="vx-panel w-full max-w-sm p-6 flex flex-col items-center text-center gap-3" onClick={e => e.stopPropagation()}>
        <div className="vx-ibox h-[56px] w-[56px]">{icon}</div>
        <h3 className="text-white font-bold text-[15px]">{title}</h3>
        <p className="vx-sub leading-snug">{desc}</p>
        <div className="w-full mt-2 flex flex-col gap-2">{children}<button onClick={onClose} className="w-full py-2 text-[#7E8DA2] hover:text-white text-[13px]">Fechar</button></div>
      </div>
    </div>
  )
}
