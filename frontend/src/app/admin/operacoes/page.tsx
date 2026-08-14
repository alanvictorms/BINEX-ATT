'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Search, ChevronDown, ChevronUp, Loader2, Edit2, Trash2, RotateCw, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EditOperationStatusModal, type OperationRow as ModalOp } from '@/components/admin/EditOperationStatusModal'

interface Row {
  id:                 string
  asset_id:           string
  asset_symbol:       string
  direction:          'CALL' | 'PUT'
  amount:             number
  payout_pct:         number
  entry_price:        number
  exit_price:         number | null
  status:             string
  profit:             number | null
  created_at:         string
  expires_at:         string
  closed_at:          string | null
  account_type:       'REAL' | 'DEMO'
  user_id:            string
  user_name:          string
  user_email:         string
  duration_seconds:   number
  modified_by_admin:  string | null
  modified_at:        string | null
  admin_notes:        string | null
}

type Filter = 'all' | 'open' | 'won' | 'lost' | 'voided' | 'modified'

const PAGE_SIZE = 25

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: 'all',      label: 'Todos' },
  { value: 'open',     label: 'Em aberto' },
  { value: 'won',      label: 'Ganhou' },
  { value: 'lost',     label: 'Perdeu' },
  { value: 'voided',   label: 'Estornadas' },
  { value: 'modified', label: 'Modificadas por admin' },
]

export default function OperacoesAdminPage() {
  const [rows,      setRows]      = useState<Row[]>([])
  const [total,     setTotal]     = useState(0)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState<Filter>('all')
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [editing,   setEditing]   = useState<ModalOp | null>(null)
  const [busyId,    setBusyId]    = useState<string | null>(null)
  const [filterOpen,setFilterOpen]= useState(false)

  const loadRows = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('admin_list_operations', {
      p_search:  search || null,
      p_filter:  filter,
      p_account: 'all',
      p_limit:   PAGE_SIZE,
      p_offset:  page * PAGE_SIZE,
    })
    if (error) {
      setError(error.message)
    } else if (data) {
      setRows((data as any).rows ?? [])
      setTotal((data as any).total ?? 0)
    }
    setLoading(false)
  }, [search, filter, page])

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); loadRows() }, 300)
    return () => clearTimeout(t)
  }, [search, filter])

  useEffect(() => { loadRows() }, [page])

  async function handleVoid(op: Row) {
    if (op.status === 'voided') return
    const reason = prompt(
      `⚠ Estornar operação?\n\nIsso vai:\n• Devolver R$ ${Number(op.amount).toFixed(2)} ao saldo\n• Anular qualquer lucro/prejuízo\n• Marcar como "Estornada"\n\nMotivo (mínimo 5 caracteres):`
    )
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) alert('Motivo obrigatório (mínimo 5 caracteres).')
      return
    }
    setBusyId(op.id)
    try {
      const { error } = await supabase.rpc('admin_void_operation', {
        p_operation_id: op.id,
        p_reason:       reason.trim(),
      })
      if (error) throw error
      await loadRows()
    } catch (e: any) {
      alert('Erro: ' + (e.message ?? 'desconhecido'))
    } finally {
      setBusyId(null)
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function timeframe(seconds: number) {
    if (seconds < 60) return `${seconds}s`
    const m = Math.round(seconds / 60)
    if (m < 60) return `${m}m`
    return `${Math.round(m / 60)}h`
  }

  function statusBadge(r: Row) {
    // DB usa enum maiusculo. Comparacao case-insensitive evita silent bug
    // (codigo antigo comparava minusculo e nunca matchava OPEN/VOIDED).
    const s = String(r.status ?? '').toUpperCase()
    if (s === 'VOIDED') return <Badge color="gray">Estornada</Badge>
    if (s === 'OPEN')   return <Badge color="yellow">Em aberto</Badge>
    if ((r.profit ?? 0) > 0) return <Badge color="green">Ganhou</Badge>
    return <Badge color="red">Perdeu</Badge>
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">Operações</h1>
        <button
          onClick={loadRows}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#16202D] text-[#7E8DA2] hover:text-white hover:border-white/30 transition-colors text-xs font-medium"
        >
          <RotateCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>
      <p className="text-sm text-[#7E8DA2] mb-6">Gerencie as operações de trading dos usuários</p>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E8DA2]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar operação..."
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg pl-8 pr-3 text-sm text-white placeholder-[#7E8DA2] outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
        <div className="relative w-full sm:w-48">
          <button
            onClick={() => setFilterOpen(v => !v)}
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg px-3 text-sm text-white text-left flex items-center justify-between hover:border-blue-500/40 transition-colors"
          >
            {FILTER_OPTIONS.find(o => o.value === filter)?.label}
            <ChevronDown size={13} className={cn('text-[#7E8DA2] transition-transform', filterOpen && 'rotate-180')} />
          </button>
          {filterOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#0C131F] border border-[#16202D] rounded-lg shadow-xl z-10">
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setFilter(opt.value); setFilterOpen(false) }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors',
                    filter === opt.value ? 'bg-blue-500/10 text-blue-400' : 'text-white hover:bg-white/5'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0C131F] border border-[#16202D] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1100px]">
            <thead>
              <tr className="text-[#7E8DA2] border-b border-[#16202D]">
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Data/Hora</th>
                <th className="text-left px-4 py-3 font-medium">Timeframe</th>
                <th className="text-right px-4 py-3 font-medium">Apostado</th>
                <th className="text-right px-4 py-3 font-medium">Ganho</th>
                <th className="text-center px-4 py-3 font-medium">Carteira</th>
                <th className="text-center px-4 py-3 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 font-medium">Mercado</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-20"><Loader2 className="inline-block animate-spin text-[#7E8DA2]" size={20} /></td></tr>
              ) : error ? (
                <tr><td colSpan={11} className="text-center py-10 text-red-400">{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-10 text-[#7E8DA2]">Nenhuma operação encontrada</td></tr>
              ) : rows.map((r) => {
                const isWin  = (r.profit ?? 0) > 0
                const isLoss = (r.profit ?? 0) < 0
                const isVoid = r.status === 'voided'
                return (
                  <tr key={r.id} className={cn('border-b border-[#1e2433] text-white hover:bg-white/5 transition-colors', isVoid && 'opacity-60')}>
                    <td className="px-4 py-3 font-medium">{r.user_name || '—'}</td>
                    <td className="px-4 py-3 text-[#7E8DA2]">{r.user_email}</td>
                    <td className="px-4 py-3 text-[#AEBBCB]">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 font-mono text-[#AEBBCB]">{timeframe(r.duration_seconds)}</td>
                    <td className="px-4 py-3 text-right font-mono">R$ {Number(r.amount).toFixed(2)}</td>
                    <td className={cn('px-4 py-3 text-right font-mono font-bold', isWin && 'text-green-400', isLoss && 'text-red-400', isVoid && 'text-[#7E8DA2]')}>
                      {r.profit !== null ? `${isWin ? '+' : ''}R$ ${Number(r.profit).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge color={r.account_type === 'REAL' ? 'green' : 'blue'}>{r.account_type === 'REAL' ? 'Real' : 'Demo'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border',
                        r.direction === 'CALL' ? 'bg-green-500/10 text-green-400 border-green-500/40' : 'bg-red-500/10 text-red-400 border-red-500/40'
                      )}>
                        {r.direction === 'CALL' ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        {r.direction === 'CALL' ? 'UP' : 'DOWN'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#AEBBCB]">{r.asset_symbol}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        {statusBadge(r)}
                        {r.modified_by_admin && (
                          <span title={r.admin_notes ?? 'Modificada por admin'} className="text-[9px] text-orange-400 font-bold flex items-center gap-0.5">
                            <AlertCircle size={9} /> editado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditing({
                            id:             r.id,
                            asset_symbol:   r.asset_symbol,
                            direction:      r.direction,
                            amount:         r.amount,
                            payout_pct:     r.payout_pct,
                            status:         r.status,
                            profit:         r.profit,
                            user_name:      r.user_name || '—',
                            account_type:   r.account_type,
                          })}
                          disabled={isVoid || busyId === r.id}
                          title={isVoid ? 'Operação estornada' : 'Alterar status'}
                          className="w-7 h-7 flex items-center justify-center rounded text-[#7E8DA2] hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleVoid(r)}
                          disabled={isVoid || busyId === r.id}
                          title={isVoid ? 'Já estornada' : 'Estornar operação'}
                          className="w-7 h-7 flex items-center justify-center rounded text-[#7E8DA2] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 py-3 border-t border-[#16202D] text-xs text-[#7E8DA2]">
          <div>
            Mostrando <span className="text-white">{total === 0 ? 0 : page * PAGE_SIZE + 1}</span> a{' '}
            <span className="text-white">{Math.min((page + 1) * PAGE_SIZE, total)}</span> de{' '}
            <span className="text-white">{total}</span> registros
          </div>
          <div className="flex items-center gap-1">
            <PageBtn onClick={() => setPage(0)}                     disabled={page === 0}>«</PageBtn>
            <PageBtn onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>‹</PageBtn>
            {Array.from({ length: Math.min(4, pageCount) }, (_, i) => i).map(i => {
              const num = Math.max(0, Math.min(pageCount - 4, page - 1)) + i
              if (num >= pageCount) return null
              return (
                <PageBtn key={num} onClick={() => setPage(num)} active={num === page}>
                  {num + 1}
                </PageBtn>
              )
            })}
            {pageCount > 4 && page < pageCount - 3 && <span className="px-1">…</span>}
            {pageCount > 4 && page < pageCount - 1 && (
              <PageBtn onClick={() => setPage(pageCount - 1)} active={page === pageCount - 1}>{pageCount}</PageBtn>
            )}
            <PageBtn onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}>›</PageBtn>
            <PageBtn onClick={() => setPage(pageCount - 1)}                     disabled={page >= pageCount - 1}>»</PageBtn>
          </div>
        </div>
      </div>

      {editing && (
        <EditOperationStatusModal
          operation={editing}
          onClose={() => setEditing(null)}
          onSaved={loadRows}
        />
      )}
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: 'green' | 'red' | 'yellow' | 'gray' | 'blue' }) {
  const colorMap = {
    green:  'bg-green-500/15  text-green-400  border-green-500/30',
    red:    'bg-red-500/15    text-red-400    border-red-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    gray:   'bg-[#16202D]     text-[#AEBBCB]  border-[#1B2735]',
    blue:   'bg-blue-500/15   text-blue-400   border-blue-500/30',
  } as const
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border', colorMap[color])}>
      {children}
    </span>
  )
}

function PageBtn({ children, onClick, active, disabled }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-w-[28px] h-7 px-2 rounded text-xs font-medium transition-colors',
        active ? 'bg-green-500 text-white' : 'border border-[#16202D] text-[#AEBBCB] hover:border-blue-500/40 hover:text-white',
        disabled && 'opacity-30 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  )
}
