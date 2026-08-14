'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Users, UserPlus, Search, Eye, Edit2, Ban, RefreshCw, Trash2,
  RotateCw, Loader2, TrendingUp, DollarSign, FlaskConical,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserDetailsModal } from '@/components/admin/UserDetailsModal'
import { EditUserModal } from '@/components/admin/EditUserModal'

interface Row {
  id:                  string
  name:                string
  email:               string
  kyc_status:          string
  bonus_balance:       number
  rollover_required:   number
  rollover_completed:  number
  blocked_at:          string | null
  is_admin:            boolean
  is_internal:         boolean
  real_balance:        number
  demo_balance:        number
  created_at:          string
  deposited:           number
  deposits_count:      number
  withdrawn:           number
  net_house:           number
  volume:              number
  ops_count:           number
  user_result:         number
  first_deposit_at:    string | null
  last_op_at:          string | null
}

// Colunas ordenáveis — os valores batem com a whitelist do admin_list_users no banco.
type SortKey =
  | 'created_at' | 'deposited' | 'withdrawn' | 'net_house' | 'volume'
  | 'ops_count' | 'user_result' | 'real_balance' | 'first_deposit_at' | 'last_op_at'

interface Stats {
  total:    number
  today:    number
  last_7d:  number
  last_30d: number
}

const PAGE_SIZE = 50

export default function UsuariosAdminPage() {
  const [stats,     setStats]     = useState<Stats | null>(null)
  const [rows,      setRows]      = useState<Row[]>([])
  const [total,     setTotal]     = useState(0)
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [editingUser,  setEditingUser]  = useState<string | null>(null)
  const [actionBusy,   setActionBusy]   = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Clicar num cabeçalho ordena por ele; clicar de novo inverte a direção.
  function toggleSort(col: SortKey) {
    if (sortCol === col) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortCol(col); setSortDir('desc')
    }
    setPage(0)
  }

  async function handleToggleBlock(u: Row) {
    const isBlocked = !!u.blocked_at
    const confirmMsg = isBlocked
      ? `Desbloquear ${u.name}? Ele poderá fazer login novamente.`
      : `Bloquear ${u.name}? Ele não poderá fazer login.`
    if (!confirm(confirmMsg)) return

    setActionBusy(u.id)
    try {
      const rpc = isBlocked ? 'admin_unblock_user' : 'admin_block_user'
      const params: any = { p_user_id: u.id }
      if (!isBlocked) params.p_reason = prompt('Motivo do bloqueio (opcional):') || null
      const { error } = await supabase.rpc(rpc, params)
      if (error) throw error
      await loadUsers()
    } catch (e: any) {
      alert('Erro: ' + (e.message ?? 'desconhecido'))
    } finally {
      setActionBusy(null)
    }
  }

  async function handleResetDemo(u: Row) {
    if (!confirm(`Resetar saldo demo de ${u.name} para R$ 10.000,00?`)) return
    setActionBusy(u.id)
    try {
      const { error } = await supabase.rpc('admin_reset_demo', { p_user_id: u.id })
      if (error) throw error
      await loadUsers()
    } catch (e: any) {
      alert('Erro: ' + (e.message ?? 'desconhecido'))
    } finally {
      setActionBusy(null)
    }
  }

  // Crédito/débito manual de saldo (fallback enquanto o gateway nao esta ativo:
  // usuario paga Pix na chave da casa -> admin credita aqui). Usa admin_adjust_balance,
  // que registra transacao + audit log. p_delta positivo credita, negativo debita.
  async function handleAdjustBalance(u: Row) {
    const tipo = (prompt('Tipo de conta (REAL ou DEMO):', 'REAL') || '').trim().toUpperCase()
    if (tipo !== 'REAL' && tipo !== 'DEMO') { if (tipo) alert('Tipo inválido. Use REAL ou DEMO.'); return }

    const valorStr = prompt(`Valor em R$ na conta ${tipo} de ${u.name}\n(positivo credita, negativo debita):`)
    if (!valorStr) return
    const valor = Number(valorStr.replace(',', '.'))
    if (!Number.isFinite(valor) || valor === 0) { alert('Valor inválido.'); return }

    const reason = prompt('Motivo (registrado no audit log):')
    if (!reason || reason.trim().length < 3) { alert('Motivo obrigatório (mín. 3 caracteres).'); return }

    const acao = valor > 0 ? 'CREDITAR' : 'DEBITAR'
    if (!confirm(`${acao} R$ ${Math.abs(valor).toFixed(2)} na conta ${tipo} de ${u.name}?`)) return

    setActionBusy(u.id)
    try {
      const { error } = await supabase.rpc('admin_adjust_balance', {
        p_user_id:      u.id,
        p_account_type: tipo,
        p_delta:        valor,
        p_reason:       reason.trim(),
      })
      if (error) throw error
      await loadUsers()
    } catch (e: any) {
      alert('Erro: ' + (e.message ?? 'desconhecido'))
    } finally {
      setActionBusy(null)
    }
  }

  async function handleDelete(u: Row) {
    if (u.is_admin) {
      alert('Não é permitido deletar outro admin.')
      return
    }
    const typed = prompt(
      `⚠ DELETAR usuário ${u.name}?\n\n` +
      `Isso vai:\n` +
      `• Bloquear o login permanentemente\n` +
      `• Anonimizar o nome para "[Conta deletada]"\n` +
      `• Manter todo histórico financeiro intacto (compliance)\n\n` +
      `Para confirmar, digite: DELETAR`
    )
    if (typed !== 'DELETAR') return

    const reason = prompt('Motivo da deleção (será registrado no audit log):')
    if (!reason || reason.trim().length < 3) {
      alert('Motivo obrigatório (mínimo 3 caracteres).')
      return
    }

    setActionBusy(u.id)
    try {
      const { error } = await supabase.rpc('admin_soft_delete_user', {
        p_user_id: u.id,
        p_reason:  reason.trim(),
      })
      if (error) throw error
      await loadUsers()
    } catch (e: any) {
      alert('Erro: ' + (e.message ?? 'desconhecido'))
    } finally {
      setActionBusy(null)
    }
  }

  // Conta interna = do time, para demonstracao. Continua funcionando normal e
  // continua nesta lista; so sai das SOMAS (saldo total, nº de usuarios,
  // depositos, resultado da plataforma). Ver apps/api/sql/2026-07-16-contas-internas.sql
  async function handleToggleInternal(u: Row) {
    const msg = u.is_internal
      ? `Voltar ${u.name} a contar nas métricas?\n\nA conta volta a somar em saldo total, nº de usuários, depósitos e resultado da plataforma.`
      : `Marcar ${u.name} como conta INTERNA?\n\nA conta continua funcionando normal e continua nesta lista — só para de somar nas métricas do painel.`
    if (!confirm(msg)) return

    setActionBusy(u.id)
    try {
      const { error } = await supabase.rpc('admin_set_internal', {
        p_user_id:     u.id,
        p_is_internal: !u.is_internal,
        p_reason:      null,
      })
      if (error) throw error
      await Promise.all([loadUsers(), loadStats()])
    } catch (e: any) {
      alert('Erro: ' + (e.message ?? 'desconhecido'))
    } finally {
      setActionBusy(null)
    }
  }

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_user_stats')
    if (!error && data) setStats(data as Stats)
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('admin_list_users', {
      p_search: search || null,
      p_limit:  PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
      p_sort:   sortCol,
      p_dir:    sortDir,
    })
    if (error) {
      setError(error.message)
    } else if (data) {
      setRows((data as any).rows ?? [])
      setTotal((data as any).total ?? 0)
    }
    setLoading(false)
  }, [search, page, sortCol, sortDir])

  useEffect(() => { loadStats() }, [loadStats])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); loadUsers() }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { loadUsers() }, [page, sortCol, sortDir])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">Usuários</h1>
        <button
          onClick={() => { loadStats(); loadUsers() }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#16202D] text-[#7E8DA2] hover:text-white hover:border-white/30 transition-colors text-xs font-medium"
        >
          <RotateCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>
      <p className="text-sm text-[#7E8DA2] mb-6">Gerencie todos os usuários da plataforma</p>

      {/* 4 stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<Users size={18} />}      label="Total de Usuários" value={stats?.total} color="green" />
        <StatCard icon={<UserPlus size={18} />}   label="Cadastros Hoje"   value={stats?.today} color="green" />
        <StatCard icon={<UserPlus size={18} />}   label="Novos (7 dias)"   value={stats?.last_7d} color="green" />
        <StatCard icon={<TrendingUp size={18} />} label="Novos (30 dias)"  value={stats?.last_30d} color="blue" />
      </div>

      {/* Tabs + search */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex border-b border-[#16202D]">
          <TabButton active>Todos Usuários</TabButton>
          <TabButton disabled>Todos Traders</TabButton>
        </div>
        <div className="relative w-72">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E8DA2]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuário..."
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg pl-8 pr-3 text-sm text-white placeholder-[#7E8DA2] outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0C131F] border border-[#16202D] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1180px]">
          <thead>
            <tr className="text-[#7E8DA2] border-b border-[#16202D]">
              <th className="text-left px-4 py-3 font-medium w-8"><input type="checkbox" className="accent-blue-500" /></th>
              <th className="text-left px-4 py-3 font-medium">Nome</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <SortTh col="deposited"   label="Depositado" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortTh col="volume"      label="Volume"     sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortTh col="ops_count"   label="Ops"        sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortTh col="user_result" label="Result. dele" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortTh col="real_balance" label="Saldo"     sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <th className="text-right px-4 py-3 font-medium">Bônus</th>
              <th className="text-center px-4 py-3 font-medium">Rollover</th>
              <SortTh col="last_op_at"  label="Últ. op"    sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={14} className="text-center py-20"><Loader2 className="inline-block animate-spin text-[#7E8DA2]" size={20} /></td></tr>
            ) : error ? (
              <tr><td colSpan={14} className="text-center py-10 text-red-400">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={14} className="text-center py-10 text-[#7E8DA2]">Nenhum usuário encontrado</td></tr>
            ) : rows.map((u) => {
              const blocked = !!u.blocked_at
              const rolloverPct = u.rollover_required > 0 ? Math.min(100, (Number(u.rollover_completed) / Number(u.rollover_required)) * 100) : 0
              return (
                <tr key={u.id} className="border-b border-[#1e2433] text-white hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3"><input type="checkbox" className="accent-blue-500" /></td>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-[#7E8DA2] text-[11px]">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold border', u.is_admin ? 'bg-purple-500/15 text-purple-400 border-purple-500/40' : 'bg-[#16202D] text-[#AEBBCB] border-[#1B2735]')}>
                        {u.is_admin ? 'Admin' : 'Usuário'}
                      </span>
                      {u.is_internal && (
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-500/15 text-amber-400 border-amber-500/40"
                          title="Conta interna — não entra em nenhuma métrica do painel"
                        >
                          Interna
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div>R$ {Number(u.deposited).toFixed(2)}</div>
                    {u.deposits_count > 0 && (
                      <div className="text-[10px] text-[#7E8DA2]">{u.deposits_count} depósito{u.deposits_count > 1 ? 's' : ''}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-[#AEBBCB]">R$ {Number(u.volume).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[#AEBBCB]">{u.ops_count}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className={cn(Number(u.user_result) > 0 ? 'text-green-400' : Number(u.user_result) < 0 ? 'text-red-400' : 'text-[#7E8DA2]')}>
                      {Number(u.user_result) > 0 ? '+' : ''}R$ {Number(u.user_result).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">R$ {Number(u.real_balance).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">R$ {Number(u.bonus_balance).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-center gap-0.5 min-w-[80px]">
                      <span className="text-[10px] text-[#7E8DA2]">
                        {Number(u.rollover_completed).toFixed(0)} / {Number(u.rollover_required).toFixed(0)}
                      </span>
                      {u.rollover_required > 0 && (
                        <div className="w-full h-1 bg-[#16202D] rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${rolloverPct}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-[11px] text-[#7E8DA2] whitespace-nowrap">
                    {u.last_op_at ? new Date(u.last_op_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold', blocked ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400')}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', blocked ? 'bg-red-400' : 'bg-green-400')} />
                      {blocked ? 'Bloqueado' : 'Ativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <ActionBtn onClick={() => setSelectedUser(u.id)} title="Ver detalhes"><Eye size={14} /></ActionBtn>
                      <ActionBtn onClick={() => setEditingUser(u.id)} title="Editar"><Edit2 size={14} /></ActionBtn>
                      <ActionBtn onClick={() => handleAdjustBalance(u)} disabled={actionBusy === u.id} title="Creditar/debitar saldo">
                        <DollarSign size={14} className="text-green-400" />
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => handleToggleBlock(u)}
                        disabled={actionBusy === u.id}
                        title={blocked ? 'Desbloquear' : 'Bloquear'}
                        variant={blocked ? undefined : 'danger'}
                      >
                        <Ban size={14} className={blocked ? 'text-green-400' : ''} />
                      </ActionBtn>
                      <ActionBtn onClick={() => handleResetDemo(u)} disabled={actionBusy === u.id} title="Resetar demo">
                        <RefreshCw size={14} className={actionBusy === u.id ? 'animate-spin' : ''} />
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => handleToggleInternal(u)}
                        disabled={actionBusy === u.id}
                        title={u.is_internal ? 'Voltar a contar nas métricas' : 'Marcar como conta interna (some das métricas)'}
                      >
                        <FlaskConical size={14} className={u.is_internal ? 'text-amber-400' : ''} />
                      </ActionBtn>
                      <ActionBtn
                        onClick={() => handleDelete(u)}
                        disabled={actionBusy === u.id || u.is_admin}
                        title={u.is_admin ? 'Não é permitido deletar admin' : 'Deletar conta'}
                        variant="danger"
                      >
                        <Trash2 size={14} />
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#16202D] text-xs text-[#7E8DA2]">
            <div>
              Mostrando <span className="text-white">{page * PAGE_SIZE + 1}</span>–<span className="text-white">{Math.min((page + 1) * PAGE_SIZE, total)}</span> de <span className="text-white">{total}</span>
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

      {selectedUser && (
        <UserDetailsModal userId={selectedUser} onClose={() => setSelectedUser(null)} />
      )}

      {editingUser && (
        <EditUserModal
          userId={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => loadUsers()}
        />
      )}
    </div>
  )
}

function SortTh({ col, label, sortCol, sortDir, onSort }: {
  col: SortKey; label: string; sortCol: SortKey; sortDir: 'asc' | 'desc'; onSort: (c: SortKey) => void
}) {
  const active = sortCol === col
  return (
    <th className="text-right px-4 py-3 font-medium">
      <button
        onClick={() => onSort(col)}
        className={cn('inline-flex items-center gap-1 hover:text-white transition-colors', active && 'text-white')}
      >
        {label}
        {active
          ? (sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />)
          : <ArrowUpDown size={12} className="opacity-40" />}
      </button>
    </th>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | undefined; color: 'green' | 'blue' }) {
  return (
    <div className="bg-[#0C131F] border border-[#16202D] rounded-xl p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color === 'green' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400')}>
        {icon}
      </div>
      <div>
        <div className="text-[11px] text-[#7E8DA2]">{label}</div>
        <div className="text-2xl font-bold text-white leading-tight">
          {value === undefined ? '—' : value.toLocaleString('pt-BR')}
        </div>
      </div>
    </div>
  )
}

function TabButton({ children, active, disabled }: { children: React.ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'px-4 py-2 text-sm font-semibold transition-colors border-b-2',
        active ? 'border-green-400 text-white' : 'border-transparent text-[#7E8DA2] hover:text-white',
        disabled && 'opacity-40 cursor-not-allowed hover:text-[#7E8DA2]'
      )}
    >
      {children}
    </button>
  )
}

function ActionBtn({ children, onClick, title, disabled, variant }: { children: React.ReactNode; onClick?: () => void; title: string; disabled?: boolean; variant?: 'danger' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'w-7 h-7 flex items-center justify-center rounded transition-colors',
        disabled ? 'text-[#1B2735] cursor-not-allowed' : 'text-[#7E8DA2] hover:bg-white/5',
        !disabled && (variant === 'danger' ? 'hover:text-red-400' : 'hover:text-white')
      )}
    >
      {children}
    </button>
  )
}
