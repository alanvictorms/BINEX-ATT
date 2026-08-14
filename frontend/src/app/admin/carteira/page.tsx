'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Wallet, Gift, ArrowDownCircle, ArrowUpCircle, Activity,
  TrendingUp, Layers, RefreshCw, Loader2, Search, SlidersHorizontal, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Overview {
  real_balance:        number
  demo_balance:        number
  bonus_balance:       number
  deposits_confirmed:  number
  deposits_pending:    number
  withdrawals_paid:    number
  withdrawals_pending: number
  open_exposure:       number
  net_deposits:        number
  users_count:         number
  real_accounts:       number
}

interface Tx {
  id:           string
  type:         string
  amount:       number
  description:  string | null
  operation_id: string | null
  created_at:   string
  account_type: string
  user_id:      string
  user_name:    string
  user_email:   string
}

const PAGE_SIZE = 25

const TYPE_LABELS: Record<string, string> = {
  DEPOSIT:          'Depósito',
  WITHDRAWAL:       'Saque',
  BONUS:            'Bônus',
  TRADE_WIN:        'Trade ganho',
  TRADE_LOSS:       'Trade perda',
  TRADE_DRAW:       'Trade empate',
  EARLY_CLOSE:      'Fech. antecipado',
  COPY_RESULT:      'Copy resultado',
  COPY_PURCHASE:    'Copy compra',
  DEMO_RESET:       'Reset demo',
  ADJUSTMENT:       'Ajuste manual',
  BOOSTER_PURCHASE: 'Booster',
}

const TYPE_FILTERS = ['all', ...Object.keys(TYPE_LABELS)]

function fmtBRL(n: number) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default function CarteiraAdminPage() {
  const [ov,      setOv]      = useState<Overview | null>(null)
  const [rows,    setRows]    = useState<Tx[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const [type,   setType]   = useState('all')
  const [search, setSearch] = useState('')
  const [page,   setPage]   = useState(0)

  const [adjust, setAdjust] = useState<{ userId: string; userName: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [o, t] = await Promise.all([
        supabase.rpc('admin_wallet_overview'),
        supabase.rpc('admin_list_transactions', {
          p_type: type, p_search: search || null, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE,
        }),
      ])
      if (o.error) throw o.error
      if (t.error) throw t.error
      setOv(o.data as Overview)
      setRows(((t.data as any)?.rows ?? []) as Tx[])
      setTotal(((t.data as any)?.total ?? 0) as number)
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar a carteira')
    } finally {
      setLoading(false)
    }
  }, [type, search, page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (loading && !ov) {
    return (
      <div className="p-6 min-h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-[#7E8DA2]" size={28} />
      </div>
    )
  }

  return (
    <div className="p-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Carteira</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Tesouraria e razão global de transações</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1e2433] bg-[#111827] text-sm font-semibold text-[#9ca3af] hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{error}</div>}

      {/* KPIs de tesouraria */}
      {ov && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          <Card title="Saldo Real (passivo)" value={`R$ ${fmtBRL(ov.real_balance)}`}      sub={`${ov.real_accounts} contas reais`} icon={<Wallet size={16} className="text-white" />}        iconBg="bg-teal-500"   valueColor="text-teal-300" highlight />
          <Card title="Saldo Demo"           value={`R$ ${fmtBRL(ov.demo_balance)}`}      icon={<Layers size={16} className="text-white" />}        iconBg="bg-slate-500" />
          <Card title="Bônus em aberto"       value={`R$ ${fmtBRL(ov.bonus_balance)}`}     icon={<Gift size={16} className="text-white" />}          iconBg="bg-orange-500" />
          <Card title="Exposição aberta"      value={`R$ ${fmtBRL(ov.open_exposure)}`}     sub="Operações em andamento" icon={<Activity size={16} className="text-white" />}  iconBg="bg-purple-500" />
          <Card title="Depósitos confirmados" value={`R$ ${fmtBRL(ov.deposits_confirmed)}`} sub={`Pendente: R$ ${fmtBRL(ov.deposits_pending)}`} icon={<ArrowDownCircle size={16} className="text-white" />} iconBg="bg-green-500" valueColor="text-green-400" />
          <Card title="Saques pagos"          value={`R$ ${fmtBRL(ov.withdrawals_paid)}`}  sub={`Pendente: R$ ${fmtBRL(ov.withdrawals_pending)}`} icon={<ArrowUpCircle size={16} className="text-white" />}  iconBg="bg-red-500" valueColor="text-red-400" />
          <Card title="Depósito líquido"      value={`R$ ${fmtBRL(ov.net_deposits)}`}      sub="Confirmados − pagos" icon={<TrendingUp size={16} className="text-white" />}    iconBg="bg-emerald-500" valueColor={ov.net_deposits >= 0 ? 'text-green-400' : 'text-red-400'} highlight />
          <Card title="Usuários"              value={ov.users_count.toLocaleString('pt-BR')} icon={<Wallet size={16} className="text-white" />}     iconBg="bg-pink-500" />
        </div>
      )}

      {/* Filtros da razão */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0 sm:min-w-[220px] bg-[#111827] border border-[#1e2433] rounded-lg px-3 py-2">
          <Search size={14} className="text-[#6b7280]" />
          <input
            value={search}
            onChange={e => { setPage(0); setSearch(e.target.value) }}
            placeholder="Buscar por nome, e-mail ou descrição…"
            className="bg-transparent text-sm text-white placeholder:text-[#4b5563] focus:outline-none w-full"
          />
        </div>
        <div className="flex items-center gap-2 bg-[#111827] border border-[#1e2433] rounded-lg px-3 py-2">
          <SlidersHorizontal size={14} className="text-[#6b7280]" />
          <select
            value={type}
            onChange={e => { setPage(0); setType(e.target.value) }}
            className="bg-transparent text-sm text-white focus:outline-none"
          >
            {TYPE_FILTERS.map(t => (
              <option key={t} value={t} className="bg-[#060A11]">{t === 'all' ? 'Todos os tipos' : (TYPE_LABELS[t] ?? t)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Razão */}
      <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-left px-4 py-3">Usuário</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-center px-4 py-3">Conta</th>
              <th className="text-right px-4 py-3">Valor</th>
              <th className="text-left px-4 py-3">Descrição</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#6b7280]">Carregando…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#6b7280]">Nenhuma transação encontrada.</td></tr>}
            {!loading && rows.map(tx => (
              <tr key={tx.id} className="text-white hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-[#9ca3af] whitespace-nowrap">{fmtDate(tx.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium leading-tight">{tx.user_name}</div>
                  <div className="text-[11px] text-[#6b7280] leading-tight">{tx.user_email}</div>
                </td>
                <td className="px-4 py-3"><span className="text-[11px] font-semibold text-[#9ca3af]">{TYPE_LABELS[tx.type] ?? tx.type}</span></td>
                <td className="px-4 py-3 text-center">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', tx.account_type === 'REAL' ? 'bg-teal-500/15 text-teal-300' : 'bg-[#1e2433] text-[#6b7280]')}>{tx.account_type}</span>
                </td>
                <td className={cn('px-4 py-3 text-right font-mono font-semibold', Number(tx.amount) >= 0 ? 'text-green-400' : 'text-red-400')}>
                  {Number(tx.amount) >= 0 ? '+' : '−'}R$ {fmtBRL(Math.abs(Number(tx.amount)))}
                </td>
                <td className="px-4 py-3 text-[#9ca3af] max-w-[260px] truncate" title={tx.description ?? ''}>{tx.description ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setAdjust({ userId: tx.user_id, userName: tx.user_name })}
                    className="text-[11px] font-semibold text-[#9ca3af] hover:text-green-400"
                  >
                    Ajustar saldo
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between mt-3 text-xs text-[#6b7280]">
        <span>{total} transação(ões) · página {page + 1} de {totalPages}</span>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1e2433] disabled:opacity-40 hover:text-white">Anterior</button>
          <button disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1e2433] disabled:opacity-40 hover:text-white">Próxima</button>
        </div>
      </div>

      {adjust && <AdjustModal userId={adjust.userId} userName={adjust.userName} onClose={() => setAdjust(null)} onDone={() => { setAdjust(null); load() }} />}
    </div>
  )
}

// ── Modal de ajuste de saldo (reusa admin_adjust_balance) ───────────────────────
function AdjustModal({ userId, userName, onClose, onDone }: { userId: string; userName: string; onClose: () => void; onDone: () => void }) {
  const [accountType, setAccountType] = useState<'REAL' | 'DEMO'>('REAL')
  const [delta,  setDelta]  = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  async function submit() {
    const d = Number(delta)
    if (!d || Number.isNaN(d)) { setErr('Informe um valor diferente de zero (use negativo para debitar).'); return }
    if (reason.trim().length < 3) { setErr('Motivo obrigatório (mínimo 3 caracteres).'); return }
    if (!confirm(`Confirmar ajuste de R$ ${d.toLocaleString('pt-BR')} na conta ${accountType} de ${userName}?`)) return
    setSaving(true); setErr('')
    try {
      const { error } = await supabase.rpc('admin_adjust_balance', {
        p_user_id: userId, p_account_type: accountType, p_delta: d, p_reason: reason.trim(),
      })
      if (error) throw error
      onDone()
    } catch (e: any) {
      setErr(e.message ?? 'Falha ao ajustar saldo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#060A11] border border-[#1e2433] rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Ajustar saldo</h2>
          <button onClick={onClose} className="p-1 text-[#6b7280] hover:text-white"><X size={18} /></button>
        </div>
        <p className="text-xs text-[#6b7280] mb-4">Usuário: <span className="text-white font-medium">{userName}</span></p>

        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-[11px] text-[#6b7280] mb-1">Conta</label>
            <select value={accountType} onChange={e => setAccountType(e.target.value as any)} className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white">
              <option value="REAL">REAL</option>
              <option value="DEMO">DEMO</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#6b7280] mb-1">Valor (negativo debita)</label>
            <input value={delta} onChange={e => setDelta(e.target.value)} placeholder="ex: 50 ou -50" inputMode="decimal" className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white focus:border-green-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-[11px] text-[#6b7280] mb-1">Motivo (obrigatório)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="ex: estorno de depósito duplicado" className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white focus:border-green-500 focus:outline-none" />
          </div>
        </div>

        {err && <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">{err}</div>}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[#9ca3af] hover:text-white text-sm">Cancelar</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? 'Salvando…' : 'Aplicar ajuste'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card (mesmo estilo do dashboard) ────────────────────────────────────────────
function Card({ title, value, sub, icon, iconBg, valueColor = 'text-white', highlight }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; iconBg: string; valueColor?: string; highlight?: boolean
}) {
  return (
    <div className={cn('relative bg-[#111827] border rounded-xl px-5 py-4 flex flex-col justify-between min-h-[100px]', highlight ? 'border-green-500/30' : 'border-[#1e2433]')}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-[#6b7280] font-medium mb-2 leading-tight">{title}</div>
          <div className={cn('text-base sm:text-xl font-bold leading-tight', valueColor)}>{value}</div>
          {sub && <div className="text-[10px] text-[#4b5563] mt-1 leading-tight">{sub}</div>}
        </div>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ml-3', iconBg)}>{icon}</div>
      </div>
    </div>
  )
}
