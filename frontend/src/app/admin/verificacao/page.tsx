'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Search, ChevronDown, Loader2, Eye, RotateCw, Clock, CheckCircle2, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { KycReviewModal, type KycSubmission } from '@/components/admin/KycReviewModal'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'pending',  label: 'Em análise' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'rejected', label: 'Rejeitados' },
  { value: 'all',      label: 'Todos' },
]

const PAGE_SIZE = 50

export default function VerificacaoAdminPage() {
  const [rows,       setRows]       = useState<KycSubmission[]>([])
  const [total,      setTotal]      = useState(0)
  const [pendingCnt, setPendingCnt] = useState(0)
  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState<StatusFilter>('pending')
  const [page,       setPage]       = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [reviewing,  setReviewing]  = useState<KycSubmission | null>(null)

  const loadStats = useCallback(async () => {
    const { data } = await supabase.rpc('admin_kyc_stats')
    if (data) setPendingCnt((data as any).pending ?? 0)
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('admin_list_kyc', {
      p_search: search || null,
      p_status: status,
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
  }, [search, status, page])

  useEffect(() => { loadStats() }, [loadStats])

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); loadRows() }, 300)
    return () => clearTimeout(t)
  }, [search, status])

  useEffect(() => { loadRows() }, [page])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Verificação de Documentos</h1>
          <p className="text-sm text-[#7E8DA2] mt-1">Aprove ou rejeite documentos de verificação</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadStats(); loadRows() }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#16202D] text-[#7E8DA2] hover:text-white hover:border-white/30 transition-colors text-xs font-medium"
          >
            <RotateCw size={12} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          {pendingCnt > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold">
              {pendingCnt} pendente{pendingCnt !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="relative w-full md:w-80">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E8DA2]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email..."
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg pl-8 pr-3 text-sm text-white placeholder-[#7E8DA2] outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
        <div className="relative w-full md:w-44">
          <button
            onClick={() => setFilterOpen(v => !v)}
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg px-3 text-sm text-white text-left flex items-center justify-between hover:border-blue-500/40 transition-colors"
          >
            {FILTER_OPTIONS.find(o => o.value === status)?.label}
            <ChevronDown size={13} className={cn('text-[#7E8DA2] transition-transform', filterOpen && 'rotate-180')} />
          </button>
          {filterOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#0C131F] border border-[#16202D] rounded-lg shadow-xl z-10">
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setStatus(opt.value); setFilterOpen(false) }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors',
                    status === opt.value ? 'bg-blue-500/10 text-blue-400' : 'text-white hover:bg-white/5'
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
        <table className="w-full text-xs min-w-[720px]">
          <thead>
            <tr className="text-[#7E8DA2] border-b border-[#16202D]">
              <th className="text-left px-4 py-3 font-medium">Usuário</th>
              <th className="text-right px-4 py-3 font-medium">Saldo Real</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Data de Envio</th>
              <th className="text-left px-4 py-3 font-medium">Motivo Rejeição</th>
              <th className="text-right px-4 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-20"><Loader2 className="inline-block animate-spin text-[#7E8DA2]" size={20} /></td></tr>
            ) : error ? (
              <tr><td colSpan={6} className="text-center py-10 text-red-400">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-[#7E8DA2]">Nenhuma submissão encontrada nesse filtro</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b border-[#1e2433] text-white hover:bg-white/5 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-semibold">{r.user_name || '—'}</div>
                  <div className="text-[10px] text-[#7E8DA2]">{r.user_email}</div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-green-400">
                  R$ {Number(r.real_balance).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-center"><StatusPill status={r.status} /></td>
                <td className="px-4 py-3 text-[#AEBBCB]">{new Date(r.submitted_at).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3 text-[#AEBBCB] max-w-[240px] truncate" title={r.reject_reason ?? ''}>
                  {r.reject_reason || '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setReviewing(r)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#16202D] hover:border-blue-500/40 hover:text-white text-[#AEBBCB] text-xs font-medium transition-colors"
                  >
                    <Eye size={12} />
                    Ver Documentos
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

      {reviewing && (
        <KycReviewModal
          submission={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={() => { loadRows(); loadStats() }}
        />
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
        <Clock size={10} /> Em análise
      </span>
    )
  }
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30 text-[10px] font-bold">
        <CheckCircle2 size={10} /> Aprovado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] font-bold">
      <XCircle size={10} /> Rejeitado
    </span>
  )
}
