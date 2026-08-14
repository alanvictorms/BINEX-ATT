'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Search, Loader2, RotateCw, FileText, ChevronDown, User, Activity, AlertTriangle,
  ShieldCheck, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuditLogDetailsModal, type AuditLogEntry } from '@/components/admin/AuditLogDetailsModal'

interface Stats {
  total:       number
  today:       number
  top_actions: { action: string; count: number }[]
  top_admins:  { admin_id: string; email: string; count: number }[]
}

const PAGE_SIZE = 50

// Categorias amigáveis pra agrupar ações
const ACTION_GROUPS: Record<string, { label: string; color: string }> = {
  // Usuários
  update_user:         { label: 'Editou usuário',       color: 'blue' },
  block_user:          { label: 'Bloqueou usuário',     color: 'red' },
  unblock_user:        { label: 'Desbloqueou usuário',  color: 'green' },
  reset_demo:          { label: 'Resetou demo',         color: 'gray' },
  adjust_balance:      { label: 'Ajustou saldo',        color: 'orange' },
  soft_delete_user:    { label: 'Deletou usuário',      color: 'red' },
  impersonate_user:    { label: 'Impersonou usuário',   color: 'purple' },
  // Operações
  update_operation_status: { label: 'Alterou trade',    color: 'orange' },
  void_operation:      { label: 'Estornou trade',       color: 'red' },
  // KYC
  approve_kyc:         { label: 'Aprovou KYC',          color: 'green' },
  reject_kyc:          { label: 'Rejeitou KYC',         color: 'red' },
  // Depósitos
  mark_deposit_fake:   { label: 'Marcou fake',          color: 'red' },
  unmark_deposit_fake: { label: 'Desmarcou fake',       color: 'gray' },
  manual_confirm_deposit: { label: 'Confirmou dep.',    color: 'orange' },
  // Saques
  approve_withdrawal:  { label: 'Aprovou saque',        color: 'green' },
  reject_withdrawal:   { label: 'Rejeitou saque',       color: 'red' },
  mark_withdrawal_paid:{ label: 'Marcou saque pago',    color: 'blue' },
  bspay_payout:        { label: 'Pagou BSPay',          color: 'purple' },
  // Tickets
  update_ticket:       { label: 'Atualizou ticket',     color: 'blue' },
}

const COLOR_CLASSES: Record<string, string> = {
  red:    'bg-red-500/15    text-red-400    border-red-500/30',
  green:  'bg-green-500/15  text-green-400  border-green-500/30',
  blue:   'bg-blue-500/15   text-blue-400   border-blue-500/30',
  orange: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  gray:   'bg-[#16202D]     text-[#AEBBCB]  border-[#1B2735]',
}

export default function AuditLogPage() {
  const [stats,       setStats]       = useState<Stats | null>(null)
  const [rows,        setRows]        = useState<AuditLogEntry[]>([])
  const [total,       setTotal]       = useState(0)
  const [actions,     setActions]     = useState<string[]>([])
  const [page,        setPage]        = useState(0)
  const [search,      setSearch]      = useState('')
  const [actionFilter,setActionFilter]= useState<string>('')
  const [targetFilter,setTargetFilter]= useState<string>('')
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [selected,    setSelected]    = useState<AuditLogEntry | null>(null)
  const [actionOpen,  setActionOpen]  = useState(false)

  const loadStats = useCallback(async () => {
    const [s, a] = await Promise.all([
      supabase.rpc('admin_audit_log_stats',   { p_days: 30 }),
      supabase.rpc('admin_audit_log_actions'),
    ])
    if (s.data) setStats(s.data as Stats)
    if (a.data) setActions((a.data as string[]) ?? [])
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('admin_list_audit_log', {
      p_search:      search || null,
      p_action:      actionFilter || null,
      p_target_type: targetFilter || null,
      p_admin_id:    null,
      p_from:        null,
      p_to:          null,
      p_limit:       PAGE_SIZE,
      p_offset:      page * PAGE_SIZE,
    })
    if (error) {
      setError(error.message)
    } else if (data) {
      setRows(((data as any).rows ?? []) as AuditLogEntry[])
      setTotal((data as any).total ?? 0)
    }
    setLoading(false)
  }, [search, actionFilter, targetFilter, page])

  useEffect(() => { loadStats() }, [loadStats])

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); loadRows() }, 300)
    return () => clearTimeout(t)
  }, [search, actionFilter, targetFilter])

  useEffect(() => { loadRows() }, [page])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function actionBadge(action: string) {
    const cfg = ACTION_GROUPS[action] ?? { label: action, color: 'gray' }
    return (
      <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border', COLOR_CLASSES[cfg.color])}>
        {cfg.label}
      </span>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck size={22} className="text-green-400" />
            Audit Log
          </h1>
          <p className="text-sm text-[#7E8DA2] mt-1">Histórico completo de ações administrativas</p>
        </div>
        <button
          onClick={() => { loadStats(); loadRows() }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#16202D] text-[#7E8DA2] hover:text-white hover:border-white/30 transition-colors text-xs font-medium"
        >
          <RotateCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MiniStat icon={<FileText size={16} />}     label="Ações (30d)" value={stats?.total} color="blue" />
        <MiniStat icon={<Activity size={16} />}     label="Hoje"        value={stats?.today} color="green" />
        <div className="bg-[#0C131F] border border-[#16202D] rounded-xl p-4 col-span-2 lg:col-span-2">
          <div className="text-[11px] text-[#7E8DA2] mb-2 font-semibold">Top ações (30d)</div>
          <div className="flex flex-wrap gap-1.5">
            {(stats?.top_actions ?? []).slice(0, 4).map(a => (
              <button
                key={a.action}
                onClick={() => setActionFilter(a.action)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#1a1f2e] border border-[#16202D] hover:border-blue-500/40 transition-colors"
              >
                {actionBadge(a.action)}
                <span className="text-[10px] text-white font-bold">{a.count}</span>
              </button>
            ))}
            {(stats?.top_actions ?? []).length === 0 && (
              <span className="text-[11px] text-[#7E8DA2]">Sem dados</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 w-full sm:min-w-[260px] max-w-md min-w-0">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E8DA2]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ação, motivo, email ou target ID..."
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg pl-8 pr-3 text-sm text-white placeholder-[#7E8DA2] outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>

        {/* Action filter */}
        <div className="relative w-full sm:w-56">
          <button
            onClick={() => setActionOpen(v => !v)}
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg px-3 text-sm text-white text-left flex items-center justify-between hover:border-blue-500/40 transition-colors"
          >
            {actionFilter
              ? (ACTION_GROUPS[actionFilter]?.label ?? actionFilter)
              : 'Todas as ações'}
            <ChevronDown size={13} className={cn('text-[#7E8DA2] transition-transform', actionOpen && 'rotate-180')} />
          </button>
          {actionOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#0C131F] border border-[#16202D] rounded-lg shadow-xl z-10 max-h-72 overflow-y-auto">
              <button
                onClick={() => { setActionFilter(''); setActionOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors"
              >
                Todas as ações
              </button>
              {actions.map(a => (
                <button
                  key={a}
                  onClick={() => { setActionFilter(a); setActionOpen(false) }}
                  className={cn('w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors',
                    actionFilter === a ? 'bg-blue-500/10 text-blue-400' : 'text-white')}
                >
                  {ACTION_GROUPS[a]?.label ?? a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Target type filter */}
        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          className="h-9 bg-[#0C131F] border border-[#16202D] rounded-lg px-3 text-sm text-white outline-none focus:border-blue-500/50 cursor-pointer"
        >
          <option value="">Todos os alvos</option>
          <option value="user">Usuário</option>
          <option value="operation">Operação</option>
          <option value="withdrawal">Saque</option>
          <option value="deposit">Depósito</option>
          <option value="kyc_submission">KYC</option>
          <option value="ticket">Ticket</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#0C131F] border border-[#16202D] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[760px]">
          <thead>
            <tr className="text-[#7E8DA2] border-b border-[#16202D]">
              <th className="text-left px-4 py-3 font-medium">Data</th>
              <th className="text-left px-4 py-3 font-medium">Admin</th>
              <th className="text-left px-4 py-3 font-medium">Ação</th>
              <th className="text-left px-4 py-3 font-medium">Alvo</th>
              <th className="text-left px-4 py-3 font-medium">Motivo</th>
              <th className="text-right px-4 py-3 font-medium">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-20"><Loader2 className="inline-block animate-spin text-[#7E8DA2]" size={20} /></td></tr>
            ) : error ? (
              <tr><td colSpan={6} className="text-center py-10 text-red-400">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-[#7E8DA2]">Nenhuma ação registrada</td></tr>
            ) : rows.map(r => (
              <tr
                key={r.id}
                onClick={() => setSelected(r)}
                className="border-b border-[#1e2433] text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 text-[#AEBBCB] whitespace-nowrap">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {(r.admin_name || 'A').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{r.admin_name}</div>
                      <div className="text-[10px] text-[#7E8DA2] truncate">{r.admin_email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{actionBadge(r.action)}</td>
                <td className="px-4 py-3 text-[#AEBBCB]">
                  <div className="font-mono text-[10px]">{r.target_type}</div>
                  {r.target_id && <div className="text-[10px] text-[#7E8DA2] font-mono">{r.target_id.slice(0, 8)}...</div>}
                </td>
                <td className="px-4 py-3 max-w-[280px] truncate text-[#AEBBCB]" title={r.reason ?? ''}>
                  {r.reason || '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelected(r) }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#16202D] hover:border-blue-500/40 hover:text-white text-[#AEBBCB] text-[10px] font-medium transition-colors"
                  >
                    <Eye size={10} /> Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {pageCount > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-[#16202D] text-xs text-[#7E8DA2]">
            <div>
              Mostrando <span className="text-white">{total === 0 ? 0 : page * PAGE_SIZE + 1}</span>–<span className="text-white">{Math.min((page + 1) * PAGE_SIZE, total)}</span> de <span className="text-white">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="px-3 py-1 rounded border border-[#16202D] hover:border-blue-500/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Anterior
              </button>
              <span className="text-white">Página {page + 1} de {pageCount}</span>
              <button onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}
                className="px-3 py-1 rounded border border-[#16202D] hover:border-blue-500/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <AuditLogDetailsModal entry={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function MiniStat({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number | undefined; color: 'blue' | 'green' | 'red'
}) {
  const iconBg = {
    blue:  'bg-blue-500/15 text-blue-400',
    green: 'bg-green-500/15 text-green-400',
    red:   'bg-red-500/15 text-red-400',
  }[color]
  return (
    <div className="bg-[#0C131F] border border-[#16202D] rounded-xl p-4 flex items-center gap-3">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>{icon}</div>
      <div>
        <div className="text-[11px] text-[#7E8DA2]">{label}</div>
        <div className="text-xl font-bold text-white leading-tight">{value ?? '—'}</div>
      </div>
    </div>
  )
}
