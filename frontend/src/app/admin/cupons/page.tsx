'use client'

/**
 * Cupons de bônus (depósito) e desconto (copy trading).
 *
 * A lista vem de admin_list_coupons já com a contagem de resgates, então a tela
 * mostra "usados / total" sem uma segunda consulta por linha.
 *
 * Salvar é por cupom, não em lote: cada linha é uma campanha independente e um
 * "salvar tudo" faria o admin publicar sem querer um cupom que só estava
 * rascunhando.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Loader2, RefreshCw, Plus, Trash2, Check, AlertTriangle, Ticket, Percent,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Kind = 'deposit_bonus' | 'copy_discount'

interface Coupon {
  id?: string
  code: string
  kind: Kind
  percent: number
  min_amount: number
  max_benefit: number
  total_quantity: number
  per_user_limit: number
  rollover_mult: number
  starts_at?: string | null
  ends_at?: string | null
  enabled: boolean
  used?: number
}

function novo(): Coupon {
  return {
    code: '', kind: 'deposit_bonus', percent: 100, min_amount: 100, max_benefit: 300,
    total_quantity: 0, per_user_limit: 1, rollover_mult: 20, enabled: true, used: 0,
  }
}

export default function CuponsPage() {
  const [list, setList] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string>('')
  const [error, setError] = useState('')
  const [okId, setOkId] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error } = await supabase.rpc('admin_list_coupons')
      if (error) throw error
      setList(Array.isArray(data) ? (data as Coupon[]) : [])
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar cupons')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function patch(i: number, p: Partial<Coupon>) {
    setList(l => l.map((c, k) => (k === i ? { ...c, ...p } : c)))
  }

  async function salvar(i: number) {
    const c = list[i]
    if (!c.code.trim()) { setError('Informe o código do cupom.'); return }
    setBusyId(c.id ?? `novo-${i}`); setError(''); setOkId('')
    try {
      const { data, error } = await supabase.rpc('admin_upsert_coupon', {
        p: {
          ...c,
          code: c.code.trim().toUpperCase(),
          starts_at: c.starts_at || null,
          ends_at: c.ends_at || null,
        },
      })
      if (error) throw error
      setOkId(String(data ?? c.id ?? ''))
      setTimeout(() => setOkId(''), 2500)
      await load()
    } catch (e: any) {
      setError(e.message ?? 'Falha ao salvar')
    } finally { setBusyId('') }
  }

  async function remover(i: number) {
    const c = list[i]
    if (!c.id) { setList(l => l.filter((_, k) => k !== i)); return }
    if (!confirm(`Remover o cupom ${c.code}?\n\nOs resgates já feitos continuam registrados.`)) return
    setBusyId(c.id)
    try {
      const { error } = await supabase.rpc('admin_delete_coupon', { p_id: c.id })
      if (error) throw error
      await load()
    } catch (e: any) {
      setError(e.message ?? 'Falha ao remover')
    } finally { setBusyId('') }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center py-20"><Loader2 className="animate-spin text-[#7E8DA2]" size={22} /></div>
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-white">Cupons</h1>
          <p className="mt-2 text-[12.5px] text-[#8B9BB0]">
            Bônus no depósito e desconto na comissão de copy trading.
            O usuário digita o código no depósito e o benefício é calculado na hora.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 rounded-lg border border-[#1B2735] px-3 py-2 text-[12px] font-semibold text-[#AEBBCB] hover:bg-white/5">
            <RefreshCw size={13} /> Recarregar
          </button>
          <button
            onClick={() => setList(l => [novo(), ...l])}
            className="flex items-center gap-2 rounded-lg bg-[#1D5FE0] px-4 py-2 text-[12.5px] font-semibold text-white"
          >
            <Plus size={14} /> Novo cupom
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {list.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#1B2735] px-4 py-10 text-center text-[13px] text-[#7E8DA2]">
          Nenhum cupom cadastrado.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {list.map((c, i) => {
          const busy = busyId === (c.id ?? `novo-${i}`)
          const esgotado = c.total_quantity > 0 && (c.used ?? 0) >= c.total_quantity
          return (
            <section key={c.id ?? `novo-${i}`} className="rounded-xl border border-[#16202D] bg-[#0C131F] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', c.kind === 'deposit_bonus' ? 'bg-[#1FD196]/15 text-[#1FD196]' : 'bg-[#1D5FE0]/15 text-[#6C9CF8]')}>
                  {c.kind === 'deposit_bonus' ? <Ticket size={15} /> : <Percent size={15} />}
                </span>
                <input
                  value={c.code}
                  onChange={e => patch(i, { code: e.target.value.toUpperCase().replace(/\s/g, '') })}
                  placeholder="BONUS100"
                  className="w-[160px] rounded-lg border border-[#1e2433] bg-[#0d1117] px-3 py-2 font-mono text-[13px] font-bold uppercase text-white outline-none focus:border-[#2E6BE6]"
                />
                <select
                  value={c.kind}
                  onChange={e => patch(i, { kind: e.target.value as Kind })}
                  className="rounded-lg border border-[#1e2433] bg-[#0d1117] px-3 py-2 text-[12.5px] text-white outline-none focus:border-[#2E6BE6]"
                >
                  <option value="deposit_bonus">Bônus no depósito</option>
                  <option value="copy_discount">Desconto no copy trading</option>
                </select>

                <span className="ml-auto flex items-center gap-2">
                  <span className={cn('rounded-md px-2 py-1 text-[10.5px] font-bold uppercase',
                    esgotado ? 'bg-[#F0435A]/12 text-[#F0435A]' : 'bg-[#1B2735] text-[#8B9BB0]')}>
                    {c.used ?? 0}{c.total_quantity > 0 ? ` / ${c.total_quantity}` : ''} usados
                  </span>
                  <button
                    onClick={() => patch(i, { enabled: !c.enabled })}
                    className={cn('rounded-md px-2.5 py-1 text-[11px] font-bold uppercase',
                      c.enabled ? 'bg-[#1FD196]/15 text-[#1FD196]' : 'bg-[#1B2735] text-[#7E8DA2]')}
                  >
                    {c.enabled ? 'Ativo' : 'Inativo'}
                  </button>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Num label={c.kind === 'deposit_bonus' ? 'Bônus (%)' : 'Desconto (%)'} value={c.percent} onChange={v => patch(i, { percent: v })} />
                <Num label="Valor mínimo (R$)" value={c.min_amount} onChange={v => patch(i, { min_amount: v })} />
                <Num label="Teto do bônus (R$)" value={c.max_benefit} onChange={v => patch(i, { max_benefit: v })} hint="0 = sem teto" />
                <Num label="Qtd. total" value={c.total_quantity} onChange={v => patch(i, { total_quantity: v })} hint="0 = ilimitado" />
                <Num label="Por usuário" value={c.per_user_limit} onChange={v => patch(i, { per_user_limit: v })} hint="0 = ilimitado" />
                <Num label="Rollover (x)" value={c.rollover_mult} onChange={v => patch(i, { rollover_mult: v })} />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Dt label="Início (opcional)" value={c.starts_at} onChange={v => patch(i, { starts_at: v })} />
                <Dt label="Fim (opcional)" value={c.ends_at} onChange={v => patch(i, { ends_at: v })} />
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-[#141C28] pt-3">
                <button
                  onClick={() => salvar(i)}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-lg bg-[#1D5FE0] px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salvar
                </button>
                {okId && (okId === c.id) && <span className="text-[12px] font-semibold text-[#1FD196]">Salvo</span>}
                <button
                  onClick={() => remover(i)}
                  disabled={busy}
                  className="ml-auto flex items-center gap-2 rounded-lg border border-[#1B2735] px-3 py-2 text-[12px] font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 size={13} /> Remover
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Num({ label, value, onChange, hint }: {
  label: string; value: number; onChange: (v: number) => void; hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-[#9ca3af]">{label}</span>
      <input
        type="number" min={0} step="0.01"
        value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className="w-full rounded-lg border border-[#1e2433] bg-[#0d1117] px-3 py-2 text-[13px] tabular-nums text-white outline-none focus:border-[#2E6BE6]"
      />
      {hint && <span className="mt-1 block text-[10.5px] text-[#6b7280]">{hint}</span>}
    </label>
  )
}

function Dt({ label, value, onChange }: {
  label: string; value?: string | null; onChange: (v: string) => void
}) {
  // datetime-local não aceita offset; corta no minuto.
  const v = value ? String(value).slice(0, 16) : ''
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-[#9ca3af]">{label}</span>
      <input
        type="datetime-local"
        value={v}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#1e2433] bg-[#0d1117] px-3 py-2 text-[13px] text-white outline-none focus:border-[#2E6BE6]"
      />
    </label>
  )
}
