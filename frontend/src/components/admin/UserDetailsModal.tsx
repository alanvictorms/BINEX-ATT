'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, TrendingUp, TrendingDown, DollarSign, LogIn, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Op {
  id:            string
  asset_symbol:  string
  direction:     'CALL' | 'PUT'
  amount:        number
  entry_price:   number
  exit_price:    number | null
  profit:        number | null
  status:        string
  created_at:    string
  closed_at:     string | null
}

interface Details {
  user: {
    id:         string
    name:       string
    email:      string
    kyc_status: string
    blocked_at: string | null
    created_at: string
    is_admin:   boolean
  }
  real_balance:    number
  total_won:       number
  total_lost:      number
  total_deposited: number
  operations:      Op[]
}

interface Props {
  userId: string
  onClose: () => void
}

export function UserDetailsModal({ userId, onClose }: Props) {
  const [data, setData]       = useState<Details | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [impersonating, setImpersonating] = useState(false)

  async function handleImpersonate() {
    if (!data) return
    const reason = prompt(
      `Você está prestes a logar como ${data.user.name}.\n\nDigite o motivo (será registrado no audit log):`
    )
    if (!reason || reason.trim().length < 3) {
      alert('Motivo obrigatório (mínimo 3 caracteres).')
      return
    }
    setImpersonating(true)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: data.user.id, reason: reason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha')
      // Abre em nova aba — sessão admin atual permanece intacta
      window.open(json.action_link, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      alert('Erro: ' + e.message)
    } finally {
      setImpersonating(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase.rpc('admin_get_user_details', { p_user_id: userId }).then(({ data, error }) => {
      if (cancelled) return
      if (error) setError(error.message)
      else setData(data as Details)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])

  const fullName = data?.user.name ?? '—'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-[#0C131F] border border-[#16202D] rounded-xl shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0C131F] border-b border-[#16202D] px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold text-white">Detalhes do Usuário: {fullName}</h2>
            {data?.user.email && <p className="text-xs text-[#7E8DA2] mt-0.5">{data.user.email}</p>}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleImpersonate}
              disabled={impersonating || !data || data.user.is_admin}
              title={data?.user.is_admin ? 'Não é possível impersonar outro admin' : 'Logar como este usuário em nova aba'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn size={12} /> {impersonating ? 'Gerando...' : 'Logar como Usuário'}
            </button>
            <button onClick={onClose} className="text-[#7E8DA2] hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#7E8DA2]">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : error ? (
          <div className="p-8 text-red-400 text-sm">{error}</div>
        ) : data ? (
          <div className="p-6">
            {/* 4 stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard
                icon={<TrendingUp className="text-green-400" size={16} />}
                label="Saldo Operacional"
                value={data.real_balance}
                color="green"
              />
              <StatCard
                icon={<TrendingUp className="text-green-400" size={16} />}
                label="Total Ganho"
                value={data.total_won}
                color="green"
              />
              <StatCard
                icon={<TrendingDown className="text-red-400" size={16} />}
                label="Total Perdido"
                value={data.total_lost}
                color="red"
              />
              <StatCard
                icon={<DollarSign className="text-blue-400" size={16} />}
                label="Total Depositado"
                value={data.total_deposited}
                color="blue"
              />
            </div>

            {/* Operations table */}
            <div>
              <h3 className="text-sm font-bold text-white mb-3">Histórico de Operações</h3>
              <div className="border border-[#16202D] rounded-lg overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead className="bg-[#1a1f2e]">
                    <tr className="text-[#7E8DA2]">
                      <th className="text-left px-3 py-2 font-medium">Data</th>
                      <th className="text-left px-3 py-2 font-medium">Ativo</th>
                      <th className="text-left px-3 py-2 font-medium">Direção</th>
                      <th className="text-right px-3 py-2 font-medium">Valor</th>
                      <th className="text-right px-3 py-2 font-medium">Entrada</th>
                      <th className="text-right px-3 py-2 font-medium">Saída</th>
                      <th className="text-center px-3 py-2 font-medium">Resultado</th>
                      <th className="text-right px-3 py-2 font-medium">Lucro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.operations.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-[#7E8DA2]">
                          Nenhuma operação encontrada
                        </td>
                      </tr>
                    ) : data.operations.map((op) => {
                      const isWin = (op.profit ?? 0) > 0
                      const isOpen = op.status !== 'closed'
                      return (
                        <tr key={op.id} className="border-t border-[#16202D] text-white hover:bg-white/5">
                          <td className="px-3 py-2 text-[#7E8DA2]">{new Date(op.created_at).toLocaleString('pt-BR')}</td>
                          <td className="px-3 py-2 font-semibold">{op.asset_symbol}</td>
                          <td className="px-3 py-2">
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', op.direction === 'CALL' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>
                              {op.direction === 'CALL' ? '↑ CALL' : '↓ PUT'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">R$ {Number(op.amount).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-[#7E8DA2]">{Number(op.entry_price).toFixed(5)}</td>
                          <td className="px-3 py-2 text-right text-[#7E8DA2]">{op.exit_price ? Number(op.exit_price).toFixed(5) : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            {isOpen ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400">ABERTA</span>
                            ) : isWin ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400">WIN</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">LOSS</span>
                            )}
                          </td>
                          <td className={cn('px-3 py-2 text-right font-bold', isOpen ? 'text-[#7E8DA2]' : isWin ? 'text-green-400' : 'text-red-400')}>
                            {op.profit !== null ? `${isWin ? '+' : ''}R$ ${Number(op.profit).toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: 'green' | 'red' | 'blue' }) {
  const colorMap = {
    green: 'text-green-400',
    red:   'text-red-400',
    blue:  'text-blue-400',
  } as const
  return (
    <div className="bg-[#1a1f2e] border border-[#16202D] rounded-lg p-3">
      <div className="flex items-center gap-2 text-[10px] text-[#7E8DA2] mb-1">
        <div className={cn('w-6 h-6 rounded flex items-center justify-center', `bg-${color}-500/10`)}>{icon}</div>
        {label}
      </div>
      <div className={cn('text-base font-bold', colorMap[color])}>
        R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </div>
    </div>
  )
}
