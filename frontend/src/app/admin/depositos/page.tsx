'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { notifyEmail } from '@/lib/notifyEmail'
import {
  Search, Loader2, RotateCw, CheckCircle2, Clock, XCircle, AlertCircle, FileX,
  ArrowDownCircle, TrendingUp, DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id:                 string
  user_id:            string
  user_name:          string
  user_email:         string
  amount:             number
  bonus_amount:       number
  status:             'pending' | 'confirmed' | 'failed'
  is_fake:            boolean
  fake_reason:        string | null
  external_id:        string | null
  bspay_id:           string | null
  created_at:         string
  confirmed_at:       string | null
  confirmed_by_admin: string | null
  confirm_notes:      string | null
}

interface Stats {
  total_count:    number
  total_amount:   number
  paid_count:     number
  paid_amount:    number
  pending_count:  number
  avg_ticket:     number
  conversion_pct: number
}

type Filter = 'all' | 'paid' | 'pending' | 'failed' | 'fake'

const PAGE_SIZE = 50

export default function DepositosAdminPage() {
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [rows,    setRows]    = useState<Row[]>([])
  const [total,   setTotal]   = useState(0)
  const [filter,  setFilter]  = useState<Filter>('all')
  const [search,  setSearch]  = useState('')
  const [page,    setPage]    = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [busyId,  setBusyId]  = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    const { data } = await supabase.rpc('admin_deposits_stats')
    if (data) setStats(data as Stats)
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('admin_list_deposits', {
      p_search: search || null,
      p_filter: filter,
      p_limit:  PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    })
    if (error) {
      setError(error.message)
    } else if (data) {
      setRows((data as any).rows ?? [])
      setTotal((data as any).total ?? 0)
    }
    setLoading(false)
  }, [search, filter, page])

  useEffect(() => { loadStats() }, [loadStats])

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); loadRows() }, 300)
    return () => clearTimeout(t)
  }, [search, filter])

  useEffect(() => { loadRows() }, [page])

  async function handleToggleFake(r: Row, isFakeNow: boolean) {
    let reason: string | null = null
    if (isFakeNow) {
      reason = prompt(`Marcar depósito de ${r.user_name} (R$ ${Number(r.amount).toFixed(2)}) como FAKE?\n\nMotivo (mín. 3 caracteres):`)
      if (reason === null) return
      if (reason.trim().length < 3) { alert('Motivo obrigatório.'); return }
    } else {
      if (!confirm('Desmarcar este depósito como fake?')) return
    }
    setBusyId(r.id)
    try {
      const { error } = await supabase.rpc('admin_mark_deposit_fake', {
        p_deposit_id: r.id,
        p_is_fake:    isFakeNow,
        p_reason:     reason?.trim() ?? null,
      })
      if (error) throw error
      await Promise.all([loadRows(), loadStats()])
    } catch (e: any) {
      alert('Erro: ' + e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleManualConfirm(r: Row) {
    const reason = prompt(
      `⚠ Confirmar manualmente o depósito de R$ ${Number(r.amount).toFixed(2)}?\n\n` +
      `Isso vai creditar o valor no saldo do usuário ${r.user_name}.\n` +
      `Use APENAS se o webhook BSPay falhou e você confirmou o pagamento por outros meios.\n\n` +
      `Motivo (mín. 5 caracteres):`
    )
    if (reason === null) return
    if (reason.trim().length < 5) { alert('Motivo obrigatório.'); return }
    setBusyId(r.id)
    try {
      const { error } = await supabase.rpc('admin_confirm_deposit_manually', {
        p_deposit_id: r.id,
        p_reason:     reason.trim(),
      })
      if (error) throw error

      // E-mail de deposito confirmado (servidor valida o estado antes de enviar)
      notifyEmail('deposit_confirmed', r.id)

      // Avisa o TrackFlow (ftd|deposit). Fire-and-forget e idempotente: nao
      // bloqueia a tela nem desfaz a confirmacao se o tracker falhar.
      if (r.external_id) {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        if (token) {
          fetch('/api/trackflow/deposit', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ externalId: r.external_id }),
          }).catch(() => { /* tracker offline — ignora */ })
        }
      }

      await Promise.all([loadRows(), loadStats()])
    } catch (e: any) {
      alert('Erro: ' + e.message)
    } finally {
      setBusyId(null)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Depósitos</h1>
          <p className="text-sm text-[#7E8DA2] mt-1">Visualize os depósitos dos usuários</p>
        </div>
        <button
          onClick={() => { loadStats(); loadRows() }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#16202D] text-[#7E8DA2] hover:text-white hover:border-white/30 transition-colors text-xs font-medium"
        >
          <RotateCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* 3 stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<ArrowDownCircle size={20} />}
          title="Depósitos Gerados"
          big={stats?.total_count}
          sub={stats ? `R$ ${stats.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} total` : '—'}
        />
        <StatCard
          icon={<CheckCircle2 size={20} />}
          title="Depósitos Pagos"
          big={stats?.paid_count}
          sub={stats ? `R$ ${stats.paid_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} recebidos` : '—'}
          color="green"
        />
        <StatCard
          icon={<DollarSign size={20} />}
          title="Ticket Médio"
          bigText={stats ? `R$ ${stats.avg_ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
          sub={stats ? `${stats.conversion_pct.toFixed(1)}% conversão` : '—'}
          color="blue"
        />
      </div>

      {/* Tabs + search */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex flex-wrap items-center gap-1 border border-[#16202D] bg-[#0C131F] rounded-lg p-1">
          <Tab active={filter==='all'}     onClick={() => setFilter('all')}>     Todos    ({stats?.total_count   ?? '—'}) </Tab>
          <Tab active={filter==='paid'}    onClick={() => setFilter('paid')}>    Pagos    ({stats?.paid_count    ?? '—'}) </Tab>
          <Tab active={filter==='pending'} onClick={() => setFilter('pending')}> Pendentes ({stats?.pending_count ?? '—'}) </Tab>
          <Tab active={filter==='fake'}    onClick={() => setFilter('fake')}>    Fake     </Tab>
        </div>
        <div className="relative w-full md:w-80">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E8DA2]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email ou ID BSPay..."
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg pl-8 pr-3 text-sm text-white placeholder-[#7E8DA2] outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0C131F] border border-[#16202D] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1000px]">
            <thead>
              <tr className="text-[#7E8DA2] border-b border-[#16202D]">
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-right px-4 py-3 font-medium">Valor</th>
                <th className="text-right px-4 py-3 font-medium">Bônus</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-center px-4 py-3 font-medium">Fake</th>
                <th className="text-center px-4 py-3 font-medium">Recebido</th>
                <th className="text-right px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-20"><Loader2 className="inline-block animate-spin text-[#7E8DA2]" size={20} /></td></tr>
              ) : error ? (
                <tr><td colSpan={8} className="text-center py-10 text-red-400">{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-[#7E8DA2]">Nenhum depósito encontrado</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className={cn('border-b border-[#1e2433] text-white hover:bg-white/5 transition-colors', r.is_fake && 'opacity-60')}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.user_name || '—'}</div>
                    <div className="text-[10px] text-[#7E8DA2] font-mono">
                      {r.bspay_id ? r.bspay_id.slice(0, 7) + '...' : (r.external_id?.slice(0, 7) ?? r.id.slice(0, 7)) + '...'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">R$ {Number(r.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#AEBBCB]">
                    {Number(r.bonus_amount) > 0 ? `R$ ${Number(r.bonus_amount).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-[#AEBBCB]">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={r.is_fake}
                      disabled={busyId === r.id}
                      onChange={(e) => handleToggleFake(r, e.target.checked)}
                      title={r.is_fake ? `Marcado como fake: ${r.fake_reason ?? ''}` : 'Marcar como fake'}
                      className="accent-red-500 w-3.5 h-3.5 cursor-pointer disabled:opacity-50"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.status === 'confirmed' ? (
                      <CheckCircle2 size={16} className="inline-block text-green-400" />
                    ) : (
                      <span className="text-[#7E8DA2]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'pending' && !r.is_fake && (
                      <button
                        onClick={() => handleManualConfirm(r)}
                        disabled={busyId === r.id}
                        title="Confirmar manualmente (fallback de webhook)"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-green-500/40 text-green-400 hover:bg-green-500/10 text-[10px] font-bold transition-colors disabled:opacity-50"
                      >
                        {busyId === r.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                        Confirmar
                      </button>
                    )}
                    {r.confirmed_by_admin && (
                      <span title={r.confirm_notes ?? 'Confirmado pelo admin'} className="text-[9px] text-orange-400 font-bold flex items-center gap-0.5 justify-end">
                        <AlertCircle size={9} /> manual
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="flex flex-wrap gap-2 items-center justify-between px-4 py-3 border-t border-[#16202D] text-xs text-[#7E8DA2]">
            <div>
              Mostrando <span className="text-white">{total === 0 ? 0 : page * PAGE_SIZE + 1}</span>–<span className="text-white">{Math.min((page + 1) * PAGE_SIZE, total)}</span> de <span className="text-white">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded border border-[#16202D] hover:border-blue-500/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <span className="text-white">Página {page + 1} de {pageCount}</span>
              <button
                onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
                disabled={page >= pageCount - 1}
                className="px-3 py-1 rounded border border-[#16202D] hover:border-blue-500/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, title, big, bigText, sub, color = 'gray' }: {
  icon: React.ReactNode; title: string; big?: number | undefined; bigText?: string; sub: string
  color?: 'gray' | 'green' | 'blue'
}) {
  const iconBg = {
    gray:  'bg-[#16202D] text-[#AEBBCB]',
    green: 'bg-green-500/15 text-green-400',
    blue:  'bg-blue-500/15 text-blue-400',
  }[color]
  return (
    <div className="bg-[#0C131F] border border-[#16202D] rounded-xl p-5 flex items-start justify-between">
      <div>
        <div className="text-xs text-[#7E8DA2] mb-2">{title}</div>
        <div className="text-3xl font-bold text-white">
          {bigText ?? (big === undefined ? '—' : big.toLocaleString('pt-BR'))}
        </div>
        <div className="text-[11px] text-[#7E8DA2] mt-1">{sub}</div>
      </div>
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
        {icon}
      </div>
    </div>
  )
}

function Tab({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 h-8 rounded-md text-xs font-semibold transition-colors',
        active ? 'bg-[#101825] text-white' : 'text-[#7E8DA2] hover:text-white'
      )}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'confirmed') {
    return <Pill icon={<CheckCircle2 size={10} />} color="green" label="Recebido" />
  }
  if (status === 'pending') {
    return <Pill icon={<Clock size={10} />} color="yellow" label="Pendente" />
  }
  if (status === 'failed') {
    return <Pill icon={<XCircle size={10} />} color="red" label="Falhou" />
  }
  return <Pill icon={<FileX size={10} />} color="gray" label={status} />
}

function Pill({ icon, color, label }: { icon: React.ReactNode; color: 'green' | 'yellow' | 'red' | 'gray'; label: string }) {
  const map = {
    green:  'bg-green-500/15  text-green-400  border-green-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    red:    'bg-red-500/15    text-red-400    border-red-500/30',
    gray:   'bg-[#16202D]     text-[#AEBBCB]  border-[#1B2735]',
  }[color]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border', map)}>
      {icon} {label}
    </span>
  )
}
