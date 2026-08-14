'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DollarSign, ArrowUpCircle, Receipt, TrendingUp,
  Wallet, Gift, BarChart2, Users, Layers,
  TrendingDown, Activity, RefreshCw, Loader2,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area,
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'

type Period = 'today' | 'yesterday' | '7d' | '15d' | '30d'

const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: 'today',     label: 'Hoje',    days: 1 },
  { key: 'yesterday', label: 'Ontem',   days: 2 },
  { key: '7d',        label: '7 dias',  days: 7 },
  { key: '15d',       label: '15 dias', days: 15 },
  { key: '30d',       label: '30 dias', days: 30 },
]

interface Stats {
  total_deposits:    number
  total_withdrawals: number
  avg_ticket:        number
  net_flow:          number
  user_balance:      number
  user_bonus:        number
  balance_and_bonus: number
  total_users:       number
  new_users:         number
  total_wagered:     number
  platform_gains:    number
  platform_losses:   number
  platform_result:   number
}

interface PerfPoint {
  day:         string
  deposits:    number
  withdrawals: number
  gains:       number
  losses:      number
  result:      number
}

interface ResultDist { name: string; value: number; pct: number; color: string }
interface ActiveUsersPoint { day: string; users: number }
interface VolumePoint { asset: string; volume: number }

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function AdminDashboard() {
  const [period,  setPeriod]  = useState<Period>('30d')
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [perf,    setPerf]    = useState<PerfPoint[]>([])
  const [results, setResults] = useState<ResultDist[]>([])
  const [active,  setActive]  = useState<ActiveUsersPoint[]>([])
  const [volume,  setVolume]  = useState<VolumePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const periodDays = PERIODS.find(p => p.key === period)?.days ?? 30

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [s, p, r, a, v] = await Promise.all([
        supabase.rpc('admin_dashboard_stats',                 { p_period: period }),
        supabase.rpc('admin_dashboard_perf_series',           { p_days: Math.min(periodDays, 30) }),
        supabase.rpc('admin_dashboard_result_distribution',   { p_days: periodDays }),
        supabase.rpc('admin_dashboard_active_users',          { p_days: Math.min(periodDays, 30) }),
        supabase.rpc('admin_dashboard_volume_by_asset',       { p_days: periodDays, p_limit: 8 }),
      ])

      if (s.error) throw s.error
      setStats(s.data as Stats)
      setPerf((p.data as PerfPoint[]) ?? [])
      setResults((r.data as ResultDist[]) ?? [])
      setActive((a.data as ActiveUsersPoint[]) ?? [])
      setVolume((v.data as VolumePoint[]) ?? [])
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar dashboard')
    } finally {
      setLoading(false)
    }
  }, [period, periodDays])

  useEffect(() => { load() }, [load])

  if (loading && !stats) {
    return (
      <div className="p-3 sm:p-6 min-h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-[#7E8DA2]" size={28} />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Visão geral da plataforma</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1e2433] bg-[#111827] text-sm font-semibold text-[#9ca3af] hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Period filter */}
      <div className="mb-6 flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-[#6b7280] mr-1">Período:</span>
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border',
              period === p.key
                ? 'bg-green-500 border-green-400 text-white'
                : 'bg-[#151c2c] border-[#1e2433] text-[#6b7280] hover:text-white hover:border-[#2a3448]'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{error}</div>
      )}

      {/* 12 cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          <Card title="Total Depósitos"      value={`R$ ${fmtBRL(stats.total_deposits)}`}    icon={<DollarSign size={16} className="text-white" />}   iconBg="bg-green-500"  valueColor="text-green-400" highlight />
          <Card title="Total Saques"         value={`R$ ${fmtBRL(stats.total_withdrawals)}`} icon={<ArrowUpCircle size={16} className="text-white" />} iconBg="bg-red-500" />
          <Card title="Ticket Médio"         value={`R$ ${fmtBRL(stats.avg_ticket)}`}        icon={<Receipt size={16} className="text-white" />}      iconBg="bg-blue-500" />
          <Card title="Fluxo Líquido"        value={`R$ ${fmtBRL(stats.net_flow)}`}          icon={<TrendingUp size={16} className="text-white" />}   iconBg="bg-purple-500" valueColor={stats.net_flow >= 0 ? 'text-green-400' : 'text-red-400'} />
          <Card title="Saldo Total Usuários" value={`R$ ${fmtBRL(stats.user_balance)}`}      icon={<Wallet size={16} className="text-white" />}       iconBg="bg-teal-500" />
          <Card title="Bônus Total Usuários" value={`R$ ${fmtBRL(stats.user_bonus)}`}        icon={<Gift size={16} className="text-white" />}         iconBg="bg-orange-500" />
          <Card title="Saldo + Bônus"        value={`R$ ${fmtBRL(stats.balance_and_bonus)}`} icon={<BarChart2 size={16} className="text-white" />}    iconBg="bg-indigo-500" />
          <Card title="Total Usuários"       value={stats.total_users.toLocaleString('pt-BR')} sub={`+${stats.new_users} ${period === 'today' ? 'hoje' : 'no período'}`} icon={<Users size={16} className="text-white" />} iconBg="bg-pink-500" />
          <Card title="Valor Apostado"       value={`R$ ${fmtBRL(stats.total_wagered)}`}     icon={<Layers size={16} className="text-white" />}       iconBg="bg-amber-500" />
          <Card title="Ganhos Plataforma"    value={`R$ ${fmtBRL(stats.platform_gains)}`}    sub="Perdas dos usuários" icon={<TrendingUp size={16} className="text-white" />}   iconBg="bg-green-600" valueColor="text-green-400" />
          <Card title="Perdas Plataforma"    value={`R$ ${fmtBRL(stats.platform_losses)}`}   sub="Ganhos dos usuários" icon={<TrendingDown size={16} className="text-white" />} iconBg="bg-red-600" valueColor="text-red-400" />
          <Card title="Resultado Plataforma" value={`R$ ${fmtBRL(stats.platform_result)}`}   sub="Ganhos - Perdas"     icon={<Activity size={16} className="text-white" />}     iconBg="bg-emerald-500" valueColor={stats.platform_result >= 0 ? 'text-green-400' : 'text-red-400'} highlight />
        </div>
      )}

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-[#111827] border border-[#1e2433] rounded-xl p-5">
          <SectionTitle icon={<Activity size={15} />} title="Desempenho diário (ganhos / perdas / resultado)" />
          {perf.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={perf} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gGains"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gLosses" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gResult" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="gains"  name="Ganhos plat."  stroke="#22c55e" fill="url(#gGains)"  strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="losses" name="Perdas plat."  stroke="#ef4444" fill="url(#gLosses)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="result" name="Resultado"     stroke="#6366f1" fill="url(#gResult)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
          <SectionTitle icon={<BarChart2 size={15} />} title="Distribuição de resultados" />
          {results.every(r => r.value === 0) ? (
            <EmptyChart />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={results} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {results.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, _n: any, e: any) => `${e.payload.pct}% (${v})`} contentStyle={{ background: '#1a2235', border: '1px solid #2a3448', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 mt-2">
                {results.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-[11px] text-[#9ca3af]">{d.name}</span>
                    </div>
                    <span className="text-[11px] font-bold text-white">{d.pct}% ({d.value})</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
          <SectionTitle icon={<DollarSign size={15} />} title="Depósitos vs Saques (diário)" />
          {perf.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={perf} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="deposits"    name="Depósitos" fill="#22c55e" radius={[4,4,0,0]} />
                <Bar dataKey="withdrawals" name="Saques"    fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
          <SectionTitle icon={<Users size={15} />} title="Usuários ativos por dia" />
          {active.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={active} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1a2235', border: '1px solid #2a3448', borderRadius: 8, fontSize: 11 }} />
                <Area type="monotone" dataKey="users" name="Usuários ativos" stroke="#6366f1" fill="url(#gUsers)" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 3 */}
      <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
        <SectionTitle icon={<Layers size={15} />} title="Volume apostado por ativo (top 8)" />
        {volume.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, volume.length * 28)}>
            <BarChart data={volume} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="asset" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ background: '#1a2235', border: '1px solid #2a3448', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => `R$ ${fmtBRL(v)}`} />
              <Bar dataKey="volume" name="Volume" fill="#f59e0b" radius={[0,4,4,0]}>
                {volume.map((_, i) => <Cell key={i} fill={`hsl(${160 + i * 20}, 70%, 50%)`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function Card({ title, value, sub, icon, iconBg, valueColor = 'text-white', highlight }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; iconBg: string
  valueColor?: string; highlight?: boolean
}) {
  return (
    <div className={cn(
      'relative bg-[#111827] border rounded-xl px-3 py-3 sm:px-5 sm:py-4 flex flex-col justify-between min-h-[100px]',
      highlight ? 'border-green-500/30' : 'border-[#1e2433]'
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-[#6b7280] font-medium mb-2 leading-tight">{title}</div>
          <div className={cn('text-base sm:text-xl font-bold leading-tight', valueColor)}>{value}</div>
          {sub && <div className="text-[10px] text-[#4b5563] mt-1 leading-tight">{sub}</div>}
        </div>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ml-3', iconBg)}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a2235] border border-[#2a3448] rounded-xl px-3 py-2 shadow-2xl">
      <p className="text-[11px] text-[#6b7280] mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[11px] text-[#9ca3af]">{p.name}:</span>
          <span className="text-[11px] font-bold text-white">R$ {fmtBRL(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="text-green-400">{icon}</div>
      <h3 className="text-sm font-bold text-white">{title}</h3>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="h-[180px] flex items-center justify-center text-[#4b5563] text-xs">
      Sem dados no período selecionado
    </div>
  )
}
