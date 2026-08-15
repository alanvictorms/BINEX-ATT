'use client'

/**
 * Provedor de dados de candle — Deriv.
 *
 * Escopo de propósito estreito: liga/desliga a Deriv como FONTE DE HISTÓRICO e
 * mostra a cobertura. Não mexe em ativo, engine, liquidação nem em qualquer
 * outra parte do fluxo — o resto da estrutura segue exatamente como está.
 *
 * A associação ativo → símbolo do provedor vive só no backend
 * (integrations/deriv/symbols.ts). Nada de nome de provedor gravado no ativo.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Loader2, RefreshCw, Check, AlertTriangle, Power, Database, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

interface OtcAsset { symbol: string; name: string }
interface FrozenFactor { factor: number; frozenAt?: string }

export default function DerivProviderPage() {
  const [enabled, setEnabled]   = useState(false)
  const [origEnabled, setOrig]  = useState(false)
  const [factors, setFactors]   = useState<Record<string, FrozenFactor>>({})
  const [assets, setAssets]     = useState<OtcAsset[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [saved, setSaved]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error } = await supabase.rpc('admin_list_config')
      if (error) throw error
      const cfg = (data ?? {}) as Record<string, any>
      const on = cfg.derivEnabled === true || cfg.derivEnabled === 'true'
      setEnabled(on); setOrig(on)
      setFactors((cfg['otc:deriv:factors'] ?? {}) as Record<string, FrozenFactor>)

      // Ativos vêm da API pública — a tela não precisa de RPC própria pra isso.
      try {
        const res = await fetch(`${API_URL}/market-data/otc/`, { cache: 'no-store' })
        if (res.ok) {
          const j = await res.json()
          setAssets(Array.isArray(j?.assets) ? j.assets : [])
        }
      } catch { /* lista de ativos é complementar; a tela funciona sem ela */ }
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const { error } = await supabase.rpc('admin_set_config', {
        p_key: 'derivEnabled', p_value: enabled,
      })
      if (error) throw error
      setOrig(enabled)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message ?? 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const dirty = enabled !== origEnabled
  const covered = assets.filter(a => factors[a.symbol]?.factor > 0)
  const uncovered = assets.filter(a => !(factors[a.symbol]?.factor > 0))

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="animate-spin text-[#7E8DA2]" size={22} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-white">Provedor de dados — Deriv</h1>
          <p className="mt-2 text-[12.5px] text-[#8B9BB0]">
            Fonte de histórico de candles. Afeta apenas o histórico profundo do gráfico —
            preço ao vivo, liquidação e cadastro de ativos seguem inalterados.
          </p>
        </div>
        <button
          onClick={load}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-[#1B2735] px-3 py-2 text-[12px] font-semibold text-[#AEBBCB] transition-colors hover:bg-white/5"
        >
          <RefreshCw size={13} /> Atualizar
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Liga/desliga */}
      <section className="rounded-xl border border-[#16202D] bg-[#0C131F] p-5">
        <div className="flex items-center gap-4">
          <span className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
            enabled ? 'bg-[#1FD196]/15 text-[#1FD196]' : 'bg-[#1B2735] text-[#6B7A8E]',
          )}>
            <Power size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-white">
              {enabled ? 'Provedor ativo' : 'Provedor inativo'}
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-[#7E8DA2]">
              {enabled
                ? 'O gráfico completa pela Deriv o histórico que o banco não cobre.'
                : 'O gráfico usa apenas o histórico já armazenado no banco.'}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(v => !v)}
            className={cn(
              'relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors',
              enabled ? 'bg-[#1D5FE0]' : 'bg-[#1B2735]',
            )}
          >
            <span className={cn(
              'absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-[23px]' : 'translate-x-[3px]',
            )} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-[#141C28] pt-4">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-2 rounded-lg bg-[#1D5FE0] px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {saving && <Loader2 size={13} className="animate-spin" />} Salvar
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1FD196]">
              <Check size={13} /> Salvo
            </span>
          )}
          {dirty && !saved && (
            <span className="text-[12px] text-[#7E8DA2]">Alteração não salva</span>
          )}
        </div>
      </section>

      {/* Cobertura */}
      <section className="rounded-xl border border-[#16202D] bg-[#0C131F] p-5">
        <div className="mb-1 flex items-center gap-2">
          <Database size={15} className="text-[#4B8CF5]" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#8B9BB0]">Cobertura</h2>
        </div>
        <p className="mb-4 text-[12px] text-[#7E8DA2]">
          {covered.length} de {assets.length} ativos com histórico calibrado.
        </p>

        <div className="overflow-hidden rounded-lg border border-[#18222F]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[#18222F] bg-[#0A1017] px-4 py-2.5">
            {['Ativo', 'Calibração', 'Status'].map(h => (
              <span key={h} className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#6B7A8E]">{h}</span>
            ))}
          </div>
          {assets.length === 0 && (
            <div className="px-4 py-6 text-center text-[12px] text-[#7E8DA2]">Nenhum ativo OTC ativo.</div>
          )}
          {[...covered, ...uncovered].map(a => {
            const f = factors[a.symbol]
            const ok = f?.factor > 0
            return (
              <div key={a.symbol} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[#18222F]/50 px-4 py-2.5 last:border-0">
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-white">{a.symbol}</span>
                  <span className="mt-1 block truncate text-[11px] text-[#7E8DA2]">{a.name}</span>
                </span>
                <span className="font-mono text-[11.5px] tabular-nums text-[#AEBBCB]">
                  {ok ? f.factor.toFixed(6) : '—'}
                </span>
                <span className={cn(
                  'rounded-md px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide',
                  ok ? 'bg-[#1FD196]/12 text-[#1FD196]' : 'bg-[#F0435A]/12 text-[#F0435A]',
                )}>
                  {ok ? 'Calibrado' : 'Sem calibração'}
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#1B2735] bg-[#0A1017] px-3.5 py-3">
          <Info size={14} className="mt-0.5 shrink-0 text-[#6B7A8E]" />
          <p className="text-[11.5px] leading-relaxed text-[#8B9BB0]">
            A calibração alinha a série externa ao nível de preço do ativo e é congelada
            uma única vez — por isso o mesmo candle antigo devolve sempre o mesmo valor.
            Ativo sem calibração simplesmente não recebe histórico externo; nada quebra.
            Para calibrar, rode <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-[#C3CFDD]">npm run db:freeze-deriv-factors</code> na API.
          </p>
        </div>
      </section>
    </div>
  )
}
