'use client'

import { useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Loader2, AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OperationRow {
  id:                 string
  asset_symbol:       string
  direction:          'CALL' | 'PUT'
  amount:             number
  payout_pct:         number
  status:             string
  profit:             number | null
  user_name:          string
  account_type:       string
}

interface Props {
  operation: OperationRow
  onClose:   () => void
  onSaved:   () => void
}

type NewStatus = 'won' | 'lost'

export function EditOperationStatusModal({ operation, onClose, onSaved }: Props) {
  // DB usa enum maiusculo (OPEN, WON, LOST, DRAW, VOIDED). Comparacao case-insensitive
  // pra robustez (codigo antigo comparava minusculo e nunca dava match).
  const statusUpper = String(operation.status ?? '').toUpperCase()
  const currentKind: 'open' | 'won' | 'lost' | 'voided' =
    statusUpper === 'VOIDED' ? 'voided' :
    statusUpper === 'OPEN'   ? 'open' :
    (operation.profit ?? 0) > 0 ? 'won' : 'lost'

  const [newStatus, setNewStatus] = useState<NewStatus>(currentKind === 'won' ? 'lost' : 'won')
  const [reason,    setReason]    = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [open,      setOpen]      = useState(false)

  const newProfit = useMemo(() => {
    return newStatus === 'won'
      ? Math.round(operation.amount * operation.payout_pct) / 100
      : -operation.amount
  }, [newStatus, operation])

  async function handleSubmit() {
    if (reason.trim().length < 5) {
      setError('Motivo obrigatório (mínimo 5 caracteres)')
      return
    }
    setSaving(true); setError('')
    try {
      const { error } = await supabase.rpc('admin_update_operation_status', {
        p_operation_id: operation.id,
        p_new_status:   newStatus,
        p_reason:       reason.trim(),
      })
      if (error) throw error
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#0C131F] border border-[#16202D] rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#16202D] flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Alterar Status da Operação</h2>
          <button onClick={onClose} className="text-[#7E8DA2] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Info usuário/mercado */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Info label="Usuário"        value={operation.user_name} />
            <Info label="Mercado"        value={operation.asset_symbol} />
            <Info label="Valor Apostado" value={`R$ ${Number(operation.amount).toFixed(2)}`} />
            <Info label="Payout"         value={`${Number(operation.payout_pct).toFixed(0)}%`} />
          </div>

          {/* Aviso para operações abertas */}
          {currentKind === 'open' && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              Esta operação ainda está aberta. Definir status manualmente vai fechá-la.
            </div>
          )}

          {/* Status dropdown */}
          <div>
            <label className="block text-[11px] font-semibold text-[#AEBBCB] mb-1">Status</label>
            <div className="relative">
              <button
                onClick={() => setOpen(v => !v)}
                className="w-full h-11 bg-[#1a1f2e] border border-green-500/40 rounded-lg px-3 text-sm text-white text-left flex items-center justify-between hover:border-green-500/60 transition-colors"
              >
                <span className={cn('font-semibold', newStatus === 'won' ? 'text-green-400' : 'text-red-400')}>
                  {newStatus === 'won' ? 'Ganhou' : 'Perdeu'}
                </span>
                <ChevronDown size={14} className={cn('text-[#7E8DA2] transition-transform', open && 'rotate-180')} />
              </button>
              {open && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1f2e] border border-[#16202D] rounded-lg shadow-xl z-10">
                  <button
                    onClick={() => { setNewStatus('won'); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-green-400 hover:bg-white/5 transition-colors font-semibold"
                  >
                    Ganhou
                  </button>
                  <button
                    onClick={() => { setNewStatus('lost'); setOpen(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-white/5 transition-colors font-semibold"
                  >
                    Perdeu
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Resultado financeiro */}
          <div className={cn('rounded-lg p-3 border', newStatus === 'won' ? 'bg-green-500/5 border-green-500/30' : 'bg-red-500/5 border-red-500/30')}>
            <div className="text-[11px] text-[#7E8DA2] mb-1">
              {newStatus === 'won' ? 'Lucro do usuário' : 'Prejuízo do usuário'}
            </div>
            <div className={cn('text-lg font-bold', newStatus === 'won' ? 'text-green-400' : 'text-red-400')}>
              {newStatus === 'won' ? '+' : ''}R$ {newProfit.toFixed(2)}
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-[11px] font-semibold text-[#AEBBCB] mb-1">
              Motivo da alteração <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Bug no feed de preço causou liquidação incorreta. Trade refeito conforme histórico do Twelve Data."
              rows={3}
              className="w-full bg-[#1a1f2e] border border-[#16202D] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
            <p className="text-[10px] text-[#6b7280] mt-1">Será registrado no audit log permanentemente.</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-10 rounded-lg border border-[#16202D] text-[#AEBBCB] hover:text-white hover:border-white/30 transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 h-10 rounded-lg bg-green-500 hover:bg-green-400 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : 'Atualizar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[#7E8DA2] mb-0.5">{label}:</div>
      <div className="text-white font-semibold">{value}</div>
    </div>
  )
}
