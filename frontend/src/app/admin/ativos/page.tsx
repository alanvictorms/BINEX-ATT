'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCcw, Pencil, Power, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type MarketAsset = {
  id:            string
  symbol:        string
  name:          string
  category:      string
  source:        string
  payout:        number
  enabled:       boolean
  decimals:      number
  display_order: number
  updated_at:    string
}

type FormState = { id: string; symbol: string; payout: string; enabled: boolean; display_order: string }

export default function AtivosAdminPage() {
  const [assets,  setAssets]  = useState<MarketAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [modal,   setModal]   = useState<FormState | null>(null)
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error } = await supabase.rpc('admin_list_market_assets')
      if (error) throw error
      setAssets((data ?? []) as MarketAsset[])
    } catch (err: any) {
      setError(err.message ?? 'Erro ao carregar ativos')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  function openEdit(a: MarketAsset) {
    setModal({ id: a.id, symbol: a.symbol, payout: String(a.payout), enabled: a.enabled, display_order: String(a.display_order) })
  }

  async function update(id: string, payout: number, enabled: boolean, displayOrder: number) {
    const { error } = await supabase.rpc('admin_update_market_asset', {
      p_id: id, p_payout: payout, p_enabled: enabled, p_display_order: displayOrder,
    })
    if (error) throw error
  }

  async function save() {
    if (!modal) return
    const payout = Number(modal.payout)
    if (Number.isNaN(payout) || payout < 0 || payout > 100) { alert('Payout inválido (0 a 100).'); return }
    setSaving(true)
    try {
      await update(modal.id, payout, modal.enabled, Number(modal.display_order) || 0)
      setModal(null)
      await load()
    } catch (err: any) {
      alert(err.message ?? 'Falha ao salvar')
    } finally { setSaving(false) }
  }

  async function toggle(a: MarketAsset) {
    try { await update(a.id, a.payout, !a.enabled, a.display_order); await load() }
    catch (err: any) { alert(err.message ?? 'Falha ao alterar status') }
  }

  if (loading && assets.length === 0) {
    return <div className="p-4 md:p-6 min-h-full flex items-center justify-center"><Loader2 className="animate-spin text-[#7E8DA2]" size={28} /></div>
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Ativos</h1>
          <p className="text-sm text-[#6b7280]">Ativos reais (forex/cripto) — payout autoritativo lido pelo motor</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2030] text-[#9ca3af] hover:text-white text-sm">
          <RefreshCcw size={14} /> Atualizar
        </button>
      </div>

      <p className="text-xs text-[#4b5563] mb-6">
        Ativos sintéticos (OTC) são gerenciados na aba <span className="text-[#9ca3af]">Cadastro OTC</span>.
      </p>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

      <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Símbolo</th>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Categoria</th>
              <th className="text-left px-4 py-3">Fonte</th>
              <th className="text-right px-4 py-3">Payout</th>
              <th className="text-center px-4 py-3">Ordem</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {!loading && assets.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[#6b7280]">Nenhum ativo real cadastrado.</td></tr>
            )}
            {assets.map(a => (
              <tr key={a.id} className={cn('text-white hover:bg-white/[0.02]', !a.enabled && 'opacity-50')}>
                <td className="px-4 py-3 font-mono font-semibold">{a.symbol}</td>
                <td className="px-4 py-3 text-[#9ca3af]">{a.name}</td>
                <td className="px-4 py-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', a.category === 'forex' ? 'bg-blue-500/15 text-blue-300' : 'bg-amber-500/15 text-amber-300')}>{a.category}</span>
                </td>
                <td className="px-4 py-3 text-[#6b7280] text-xs">{a.source}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-400">{a.payout}%</td>
                <td className="px-4 py-3 text-center text-[#9ca3af]">{a.display_order}</td>
                <td className="px-4 py-3 text-center">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', a.enabled ? 'bg-green-500/15 text-green-400' : 'bg-[#1e2433] text-[#6b7280]')}>
                    {a.enabled ? 'ATIVO' : 'INATIVO'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => toggle(a)} title={a.enabled ? 'Desativar' : 'Ativar'} className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-yellow-400"><Power size={14} /></button>
                    <button onClick={() => openEdit(a)} title="Editar" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-blue-400"><Pencil size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setModal(null)}>
          <div className="bg-[#060A11] border border-[#1e2433] rounded-2xl w-full max-w-sm p-5 md:p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Editar {modal.symbol}</h2>
              <button onClick={() => setModal(null)} className="p-1 text-[#6b7280] hover:text-white"><X size={18} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-[11px] text-[#6b7280] mb-1">Payout %</label>
                <input value={modal.payout} onChange={e => setModal({ ...modal, payout: e.target.value })} inputMode="numeric" placeholder="92" className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white focus:border-green-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] text-[#6b7280] mb-1">Ordem de exibição</label>
                <input value={modal.display_order} onChange={e => setModal({ ...modal, display_order: e.target.value })} inputMode="numeric" placeholder="1" className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white focus:border-green-500 focus:outline-none" />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-[#6b7280]">Ativo (disponível para operar)</span>
                <button onClick={() => setModal({ ...modal, enabled: !modal.enabled })} className={cn('relative w-11 h-6 rounded-full transition-colors', modal.enabled ? 'bg-green-500' : 'bg-[#2a3448]')}>
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', modal.enabled && 'translate-x-5')} />
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-[#9ca3af] hover:text-white text-sm">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
