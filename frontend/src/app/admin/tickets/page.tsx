'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Search, Loader2, RotateCw, MessageSquare, CheckCircle2, Clock,
  AlertTriangle, Lock, ChevronDown, Hourglass,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TicketChatModal } from '@/components/admin/TicketChatModal'

interface Row {
  id:              string
  user_id:         string
  user_name:       string
  user_email:      string
  subject:         string
  category:        string
  status:          'open' | 'in_progress' | 'resolved' | 'closed'
  priority:        'low' | 'medium' | 'high' | 'urgent'
  created_at:      string
  last_message_at: string
  age_seconds:     number
}

interface Stats {
  open:         number
  in_progress:  number
  resolved:     number
  closed:       number
  overdue:      number
  avg_hours:    number
}

type Filter = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed' | 'overdue'

const FILTER_OPTIONS: { value: Filter; label: string; key: keyof Stats | null }[] = [
  { value: 'open',        label: 'Abertos',      key: 'open' },
  { value: 'in_progress', label: 'Em andamento', key: 'in_progress' },
  { value: 'overdue',     label: 'Atrasados',    key: 'overdue' },
  { value: 'resolved',    label: 'Resolvidos',   key: 'resolved' },
  { value: 'closed',      label: 'Fechados',     key: 'closed' },
  { value: 'all',         label: 'Todos',        key: null },
]

const PAGE_SIZE = 50

export default function TicketsAdminPage() {
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [rows,    setRows]    = useState<Row[]>([])
  const [total,   setTotal]   = useState(0)
  const [filter,  setFilter]  = useState<Filter>('open')
  const [search,  setSearch]  = useState('')
  const [page,    setPage]    = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    const { data } = await supabase.rpc('admin_tickets_stats')
    if (data) setStats(data as Stats)
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('admin_list_tickets', {
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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tickets de Suporte</h1>
          <p className="text-sm text-[#7E8DA2] mt-1">
            {stats?.open ?? 0} tickets abertos · Tempo médio de resolução: {stats?.avg_hours ?? 0}h
          </p>
        </div>
        <button
          onClick={() => { loadStats(); loadRows() }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#16202D] text-[#7E8DA2] hover:text-white hover:border-white/30 transition-colors text-xs font-medium"
        >
          <RotateCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MiniStat icon={<MessageSquare size={16} />} label="Abertos"      value={stats?.open}        color="blue"   onClick={() => setFilter('open')} />
        <MiniStat icon={<Hourglass size={16} />}     label="Em andamento" value={stats?.in_progress} color="yellow" onClick={() => setFilter('in_progress')} />
        <MiniStat icon={<AlertTriangle size={16} />} label="Atrasados"    value={stats?.overdue}     color="red"    onClick={() => setFilter('overdue')} />
        <MiniStat icon={<CheckCircle2 size={16} />}  label="Resolvidos"   value={stats?.resolved}    color="green"  onClick={() => setFilter('resolved')} />
      </div>

      {/* Filters + search */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1 border border-[#16202D] bg-[#0C131F] rounded-lg p-1 flex-wrap">
          {FILTER_OPTIONS.map(opt => (
            <Tab key={opt.value} active={filter === opt.value} onClick={() => setFilter(opt.value)}>
              {opt.label}
              {opt.key && stats && (
                <span className="ml-1 text-[#7E8DA2]">({stats[opt.key] as number})</span>
              )}
            </Tab>
          ))}
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E8DA2]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por assunto ou usuário..."
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg pl-8 pr-3 text-sm text-white placeholder-[#7E8DA2] outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0C131F] border border-[#16202D] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[760px]">
          <thead>
            <tr className="text-[#7E8DA2] border-b border-[#16202D]">
              <th className="text-left px-4 py-3 font-medium">Usuário</th>
              <th className="text-left px-4 py-3 font-medium">Assunto</th>
              <th className="text-center px-4 py-3 font-medium">Categoria</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-center px-4 py-3 font-medium">Prioridade</th>
              <th className="text-left px-4 py-3 font-medium">Última atividade</th>
              <th className="text-right px-4 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-20"><Loader2 className="inline-block animate-spin text-[#7E8DA2]" size={20} /></td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="text-center py-10 text-red-400">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-[#7E8DA2]">Nenhum ticket encontrado</td></tr>
            ) : rows.map((r) => {
              const isOverdue = r.age_seconds > 86400 && (r.status === 'open' || r.status === 'in_progress')
              return (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className="border-b border-[#1e2433] text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {(r.user_name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{r.user_name || '—'}</div>
                        <div className="text-[10px] text-[#7E8DA2] truncate">{r.user_email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-[300px] truncate text-[#AEBBCB]">{r.subject}</td>
                  <td className="px-4 py-3 text-center"><CategoryBadge value={r.category} /></td>
                  <td className="px-4 py-3 text-center"><StatusBadge value={r.status} /></td>
                  <td className="px-4 py-3 text-center"><PriorityBadge value={r.priority} /></td>
                  <td className="px-4 py-3">
                    <div className={cn('text-[11px]', isOverdue ? 'text-red-400 font-semibold' : 'text-[#AEBBCB]')}>
                      {ageLabel(r.age_seconds)}
                      {isOverdue && <AlertTriangle size={10} className="inline ml-1" />}
                    </div>
                    <div className="text-[10px] text-[#7E8DA2]">{new Date(r.last_message_at).toLocaleString('pt-BR')}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelected(r.id) }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[#16202D] hover:border-blue-500/40 hover:text-white text-[#AEBBCB] text-[10px] font-medium transition-colors"
                    >
                      <MessageSquare size={11} /> Abrir
                    </button>
                  </td>
                </tr>
              )
            })}
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
        <TicketChatModal
          ticketId={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { loadStats(); loadRows() }}
        />
      )}
    </div>
  )
}

function ageLabel(seconds: number): string {
  if (seconds < 60)        return `${seconds}s atrás`
  if (seconds < 3600)      return `${Math.floor(seconds/60)}min atrás`
  if (seconds < 86400)     return `${Math.floor(seconds/3600)}h atrás`
  return `${Math.floor(seconds/86400)}d atrás`
}

function MiniStat({ icon, label, value, color, onClick }: {
  icon: React.ReactNode; label: string; value: number | undefined
  color: 'blue' | 'yellow' | 'red' | 'green'
  onClick: () => void
}) {
  const iconBg = {
    blue:   'bg-blue-500/15 text-blue-400',
    yellow: 'bg-yellow-500/15 text-yellow-400',
    red:    'bg-red-500/15 text-red-400',
    green:  'bg-green-500/15 text-green-400',
  }[color]
  return (
    <button
      onClick={onClick}
      className="bg-[#0C131F] border border-[#16202D] hover:border-blue-500/30 rounded-xl p-4 flex items-center gap-3 transition-colors text-left"
    >
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>{icon}</div>
      <div>
        <div className="text-[11px] text-[#7E8DA2]">{label}</div>
        <div className="text-xl font-bold text-white leading-tight">{value ?? '—'}</div>
      </div>
    </button>
  )
}

function Tab({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 h-8 rounded-md text-xs font-semibold transition-colors',
        active ? 'bg-[#101825] text-white' : 'text-[#7E8DA2] hover:text-white'
      )}
    >
      {children}
    </button>
  )
}

function CategoryBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    pagamento: 'Pagamento', trading: 'Trading', conta: 'Conta', tecnico: 'Técnico', outros: 'Outros'
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#16202D] text-[#AEBBCB] text-[10px] font-semibold border border-[#1B2735]">
      {map[value] ?? value}
    </span>
  )
}

function StatusBadge({ value }: { value: string }) {
  const map = {
    open:        { color: 'blue',   label: 'Aberto',      icon: <MessageSquare size={9} /> },
    in_progress: { color: 'yellow', label: 'Em andamento', icon: <Hourglass size={9} /> },
    resolved:    { color: 'green',  label: 'Resolvido',   icon: <CheckCircle2 size={9} /> },
    closed:      { color: 'gray',   label: 'Fechado',     icon: <Lock size={9} /> },
  } as const
  const cfg = (map as any)[value] ?? { color: 'gray', label: value, icon: null }
  return <Pill color={cfg.color} icon={cfg.icon}>{cfg.label}</Pill>
}

function PriorityBadge({ value }: { value: string }) {
  const map = {
    low:    { color: 'gray',   label: 'Baixa' },
    medium: { color: 'blue',   label: 'Média' },
    high:   { color: 'yellow', label: 'Alta' },
    urgent: { color: 'red',    label: 'Urgente' },
  } as const
  const cfg = (map as any)[value] ?? { color: 'gray', label: value }
  return <Pill color={cfg.color}>{cfg.label}</Pill>
}

function Pill({ children, color, icon }: { children: React.ReactNode; color: 'green' | 'red' | 'yellow' | 'gray' | 'blue'; icon?: React.ReactNode }) {
  const map = {
    green:  'bg-green-500/15  text-green-400  border-green-500/30',
    red:    'bg-red-500/15    text-red-400    border-red-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    gray:   'bg-[#16202D]     text-[#AEBBCB]  border-[#1B2735]',
    blue:   'bg-blue-500/15   text-blue-400   border-blue-500/30',
  }[color]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border', map)}>
      {icon}{children}
    </span>
  )
}
