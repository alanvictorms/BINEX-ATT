'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, RefreshCw, Save, Check, Gift, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Cfg = Record<string, any>

interface ActiveBonus {
  user_id:            string
  user_name:          string
  user_email:         string
  bonus_balance:      number
  rollover_required:  number
  rollover_completed: number
  remaining:          number
  bonus_granted_at:   string | null
}

const BONUS_KEYS = [
  'bonusFirstDepositEnabled',
  'bonusDepositPcts',            // escada [200,100,50] — % por depósito (1º, 2º, 3º)
  'bonusFirstDepositPct',        // espelho do 1º degrau (compat/fallback)
  'bonusFirstDepositMaxAmount',
  'bonusRolloverMultiplier',
  'bonusMinDeposit',
] as const

// Rótulos dos degraus da escada. Índice = nº do depósito - 1.
const TIER_LABELS = ['1º depósito', '2º depósito', '3º depósito']

function fmtBRL(n: number) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
}

export default function BonusAdminPage() {
  const [origCfg, setOrigCfg] = useState<Cfg>({})
  const [cfg,     setCfg]     = useState<Cfg>({})
  const [rows,    setRows]    = useState<ActiveBonus[]>([])
  const [liability, setLiability] = useState(0)
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')
  const [revoke,  setRevoke]  = useState<ActiveBonus | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [c, b] = await Promise.all([
        supabase.rpc('admin_list_config'),
        supabase.rpc('admin_list_active_bonuses', { p_search: null, p_limit: 100, p_offset: 0 }),
      ])
      if (c.error) throw c.error
      if (b.error) throw b.error
      const full = (c.data ?? {}) as Cfg
      const picked: Cfg = {}
      for (const k of BONUS_KEYS) picked[k] = full[k]
      setOrigCfg(picked); setCfg(picked)
      setRows(((b.data as any)?.rows ?? []) as ActiveBonus[])
      setLiability(Number((b.data as any)?.liability ?? 0))
      setTotal(Number((b.data as any)?.total ?? 0))
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar bônus')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const dirty = JSON.stringify(origCfg) !== JSON.stringify(cfg)

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const changed = BONUS_KEYS.filter(k => JSON.stringify(cfg[k]) !== JSON.stringify(origCfg[k]))
      for (const k of changed) {
        const { error } = await supabase.rpc('admin_set_config', { p_key: k, p_value: cfg[k] })
        if (error) throw error
      }
      setOrigCfg(cfg); setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message ?? 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const num = (k: string, d = 0) => Number(cfg[k] ?? d)
  const setNum = (k: string, v: string) => setCfg(c => ({ ...c, [k]: v === '' ? 0 : Number(v) }))
  const enabled = cfg.bonusFirstDepositEnabled !== false

  // Escada de percentuais. Fonte: bonusDepositPcts; fallback ao pct único antigo.
  const pcts: number[] = Array.isArray(cfg.bonusDepositPcts) && cfg.bonusDepositPcts.length > 0
    ? cfg.bonusDepositPcts.map(Number)
    : [num('bonusFirstDepositPct', 100)]
  const tierValue = (i: number) => Number(pcts[i] ?? 0)
  const setTier = (i: number, v: string) => setCfg(c => {
    const arr = Array.isArray(c.bonusDepositPcts) && c.bonusDepositPcts.length > 0
      ? c.bonusDepositPcts.map(Number)
      : [Number(c.bonusFirstDepositPct ?? 100)]
    while (arr.length < TIER_LABELS.length) arr.push(0)
    arr[i] = v === '' ? 0 : Number(v)
    // Espelha o 1º degrau em bonusFirstDepositPct (fallback/legado coerente).
    return { ...c, bonusDepositPcts: arr, bonusFirstDepositPct: arr[0] }
  })
  const tiersSummary = pcts.map((p, i) => `${i + 1}º ${p}%`).join(' · ')

  if (loading) {
    return <div className="p-6 min-h-full flex items-center justify-center"><Loader2 className="animate-spin text-[#7E8DA2]" size={28} /></div>
  }

  return (
    <div className="p-4 md:p-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Bônus</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Escada de bônus dos primeiros depósitos e bônus ativos</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1e2433] bg-[#111827] text-sm font-semibold text-[#9ca3af] hover:text-white transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card title="Passivo de bônus" value={`R$ ${fmtBRL(liability)}`} sub="Bônus travado (rollover)" icon={<Gift size={16} className="text-white" />} iconBg="bg-orange-500" valueColor="text-orange-300" highlight />
        <Card title="Usuários com bônus" value={total.toLocaleString('pt-BR')} icon={<Users size={16} className="text-white" />} iconBg="bg-pink-500" />
      </div>

      {/* Regra do bônus de 1º depósito */}
      <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-4 md:p-5 mb-6 max-w-3xl">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="text-green-400"><Gift size={15} /></div>
            <h3 className="text-sm font-bold text-white">Escada de bônus dos primeiros depósitos</h3>
          </div>
          <button onClick={save} disabled={!dirty || saving} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors', dirty && !saving ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-[#1a2030] text-[#6b7280] cursor-not-allowed')}>
            {saved ? <Check size={13} /> : <Save size={13} />}
            {saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar regra'}
          </button>
        </div>
        <p className="text-xs text-[#6b7280] mb-4">
          Concedido automaticamente nos primeiros depósitos confirmados. Resumo:
          <span className="text-[#9ca3af]"> {tiersSummary} · teto R$ {fmtBRL(num('bonusFirstDepositMaxAmount',300))} · rollover {num('bonusRolloverMultiplier',20)}×</span>.
        </p>

        <div className="flex items-center justify-between py-3 border-b border-[#1e2433]">
          <div className="pr-4">
            <div className="text-sm font-medium text-white">Oferta ativa</div>
            <div className="text-[11px] text-[#6b7280]">Quando desligada, nenhum bônus novo é concedido.</div>
          </div>
          <button onClick={() => setCfg(c => ({ ...c, bonusFirstDepositEnabled: !enabled }))} className={cn('relative w-11 h-6 rounded-full transition-colors', enabled ? 'bg-green-500' : 'bg-[#2a3448]')}>
            <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', enabled && 'translate-x-5')} />
          </button>
        </div>

        <div className={cn('pt-4', !enabled && 'opacity-50 pointer-events-none')}>
          {/* Escada: % por depósito */}
          <div className="text-[11px] text-[#6b7280] mb-2 font-medium">Percentual por depósito</div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {TIER_LABELS.map((label, i) => (
              <Field key={i} label={label} value={tierValue(i)} onChange={v => setTier(i, v)} suffix="%" />
            ))}
          </div>
          <div className="text-[10px] text-[#4b5563] mb-4 -mt-2">0% em um degrau = sem bônus naquele depósito.</div>

          {/* Parâmetros gerais da oferta */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Teto do bônus (R$)"  value={num('bonusFirstDepositMaxAmount')} onChange={v => setNum('bonusFirstDepositMaxAmount', v)} prefix="R$" hint="por depósito" />
            <Field label="Rollover (vezes)"    value={num('bonusRolloverMultiplier')}    onChange={v => setNum('bonusRolloverMultiplier', v)} suffix="×" />
            <Field label="Depósito mín. (R$)"  value={num('bonusMinDeposit')}            onChange={v => setNum('bonusMinDeposit', v)} prefix="R$" hint="0 = qualquer valor" />
          </div>
        </div>
      </div>

      {/* Bônus ativos */}
      <h3 className="text-sm font-bold text-white mb-3">Bônus ativos</h3>
      <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Usuário</th>
              <th className="text-right px-4 py-3">Bônus</th>
              <th className="text-left px-4 py-3">Rollover</th>
              <th className="text-right px-4 py-3">Falta operar</th>
              <th className="text-center px-4 py-3">Concedido</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6b7280]">Nenhum bônus ativo no momento.</td></tr>}
            {rows.map(r => {
              const pct = r.rollover_required > 0 ? Math.min(100, Math.round((r.rollover_completed / r.rollover_required) * 100)) : 0
              return (
                <tr key={r.user_id} className="text-white hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium leading-tight">{r.user_name}</div>
                    <div className="text-[11px] text-[#6b7280] leading-tight">{r.user_email}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-orange-300">R$ {fmtBRL(r.bonus_balance)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-[#1e2433] overflow-hidden">
                        <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-[#9ca3af]">{pct}%</span>
                    </div>
                    <div className="text-[10px] text-[#4b5563] mt-0.5">R$ {fmtBRL(r.rollover_completed)} / {fmtBRL(r.rollover_required)}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[#9ca3af]">R$ {fmtBRL(r.remaining)}</td>
                  <td className="px-4 py-3 text-center text-[#9ca3af]">{fmtDate(r.bonus_granted_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setRevoke(r)} className="text-[11px] font-semibold text-[#9ca3af] hover:text-red-400">Revogar</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {revoke && <RevokeModal bonus={revoke} onClose={() => setRevoke(null)} onDone={() => { setRevoke(null); load() }} />}
    </div>
  )
}

function RevokeModal({ bonus, onClose, onDone }: { bonus: ActiveBonus; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  async function submit() {
    if (reason.trim().length < 3) { setErr('Motivo obrigatório (mínimo 3 caracteres).'); return }
    if (!confirm(`Revogar o bônus de R$ ${fmtBRL(bonus.bonus_balance)} de ${bonus.user_name}? O valor ainda travado será estornado do saldo.`)) return
    setSaving(true); setErr('')
    try {
      const { error } = await supabase.rpc('admin_revoke_bonus', { p_user_id: bonus.user_id, p_reason: reason.trim() })
      if (error) throw error
      onDone()
    } catch (e: any) {
      setErr(e.message ?? 'Falha ao revogar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#060A11] border border-[#1e2433] rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Revogar bônus</h2>
          <button onClick={onClose} className="p-1 text-[#6b7280] hover:text-white"><X size={18} /></button>
        </div>
        <p className="text-xs text-[#6b7280] mb-1">Usuário: <span className="text-white font-medium">{bonus.user_name}</span></p>
        <p className="text-xs text-[#6b7280] mb-4">Bônus travado: <span className="text-orange-300 font-medium">R$ {fmtBRL(bonus.bonus_balance)}</span> (será estornado do saldo).</p>
        <div>
          <label className="block text-[11px] text-[#6b7280] mb-1">Motivo (obrigatório)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="ex: abuso de múltiplas contas" className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white focus:border-red-500 focus:outline-none text-sm" />
        </div>
        {err && <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">{err}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[#9ca3af] hover:text-white text-sm">Cancelar</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? 'Revogando…' : 'Revogar bônus'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, prefix, suffix, hint }: { label: string; value: number; onChange: (v: string) => void; prefix?: string; suffix?: string; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] text-[#6b7280] mb-1">{label}</label>
      <div className="flex items-center gap-1.5 bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 focus-within:border-green-500">
        {prefix && <span className="text-[#6b7280] text-sm">{prefix}</span>}
        <input type="number" min={0} step="1" value={Number.isFinite(value) ? value : 0} onChange={e => onChange(e.target.value)} className="bg-transparent text-white text-sm focus:outline-none w-full" />
        {suffix && <span className="text-[#6b7280] text-sm">{suffix}</span>}
      </div>
      {hint && <p className="text-[10px] text-[#4b5563] mt-1">{hint}</p>}
    </div>
  )
}

function Card({ title, value, sub, icon, iconBg, valueColor = 'text-white', highlight }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; iconBg: string; valueColor?: string; highlight?: boolean
}) {
  return (
    <div className={cn('relative bg-[#111827] border rounded-xl px-5 py-4 flex flex-col justify-between min-h-[100px]', highlight ? 'border-orange-500/30' : 'border-[#1e2433]')}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-[#6b7280] font-medium mb-2 leading-tight">{title}</div>
          <div className={cn('text-lg md:text-xl font-bold leading-tight', valueColor)}>{value}</div>
          {sub && <div className="text-[10px] text-[#4b5563] mt-1 leading-tight">{sub}</div>}
        </div>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ml-3', iconBg)}>{icon}</div>
      </div>
    </div>
  )
}
