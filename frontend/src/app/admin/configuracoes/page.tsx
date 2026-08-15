'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, RefreshCw, Save, Check, ArrowDownCircle, ArrowUpCircle, ShieldAlert, KeyRound, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type Cfg = Record<string, any>

export default function ConfiguracoesPage() {
  const [orig,    setOrig]    = useState<Cfg>({})
  const [cfg,     setCfg]     = useState<Cfg>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [saved,   setSaved]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error } = await supabase.rpc('admin_list_config')
      if (error) throw error
      setOrig((data ?? {}) as Cfg)
      setCfg((data ?? {}) as Cfg)
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const dirty = JSON.stringify(orig) !== JSON.stringify(cfg)

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const changed = Object.keys(cfg).filter(k => JSON.stringify(cfg[k]) !== JSON.stringify(orig[k]))
      for (const k of changed) {
        const { error } = await supabase.rpc('admin_set_config', { p_key: k, p_value: cfg[k] })
        if (error) throw error
      }
      setOrig(cfg)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message ?? 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const num = (k: string, fallback = 0) => Number(cfg[k] ?? fallback)
  const setNum = (k: string, v: string) => setCfg(c => ({ ...c, [k]: v === '' ? 0 : Number(v) }))
  const setBool = (k: string, v: boolean) => setCfg(c => ({ ...c, [k]: v }))
  const str = (k: string) => (typeof cfg[k] === 'string' ? cfg[k] as string : '')
  const setStr = (k: string, v: string) => setCfg(c => ({ ...c, [k]: v }))

  if (loading) {
    return <div className="p-6 min-h-full flex items-center justify-center"><Loader2 className="animate-spin text-[#7E8DA2]" size={28} /></div>
  }

  return (
    <div className="p-4 md:p-6 min-h-full max-w-3xl">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Configurações</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Parâmetros operacionais da plataforma</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1e2433] bg-[#111827] text-sm font-semibold text-[#9ca3af] hover:text-white transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Recarregar
          </button>
          <button onClick={save} disabled={!dirty || saving} className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors', dirty && !saving ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-[#1a2030] text-[#6b7280] cursor-not-allowed')}>
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      {/* Limites de depósito */}
      <Section icon={<ArrowDownCircle size={15} />} title="Depósitos" desc="Valores mínimo e máximo por depósito (R$).">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Money label="Mínimo"  value={num('depositMin')}  onChange={v => setNum('depositMin', v)} />
          <Money label="Máximo"  value={num('depositMax')}  onChange={v => setNum('depositMax', v)} hint="0 = sem limite" />
        </div>
      </Section>

      {/* Limites de saque */}
      <Section icon={<ArrowUpCircle size={15} />} title="Saques" desc="Valores mínimo e máximo por solicitação de saque (R$).">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Money label="Mínimo" value={num('withdrawalMin')} onChange={v => setNum('withdrawalMin', v)} />
          <Money label="Máximo" value={num('withdrawalMax')} onChange={v => setNum('withdrawalMax', v)} hint="0 = sem limite" />
        </div>
      </Section>

      {/* Plataforma */}
      <Section icon={<ShieldAlert size={15} />} title="Plataforma" desc="Chaves operacionais que afetam toda a plataforma.">
        <Toggle
          label="Novos cadastros"
          desc="Quando desligado, novos usuários não conseguem se registrar."
          checked={cfg.registrationEnabled !== false}
          onChange={v => setBool('registrationEnabled', v)}
        />
        <Toggle
          label="Modo manutenção"
          desc="Exibe aviso e bloqueia novas operações para os usuários."
          checked={cfg.maintenanceMode === true}
          danger
          onChange={v => setBool('maintenanceMode', v)}
        />
        <Toggle
          label="Copy Trading"
          desc="Liga/desliga o módulo de Copy Trading na plataforma."
          checked={cfg.copyTradeEnabled !== false}
          onChange={v => setBool('copyTradeEnabled', v)}
        />
      </Section>

      {/* Credenciais BSPAY */}
      <Section
        icon={<KeyRound size={15} />}
        title="BSPAY"
        desc="Credenciais do provedor de PIX (depósito e saque). Ficam legíveis por qualquer admin."
      >
        <div className="grid grid-cols-1 gap-4">
          <Text
            label="Base URL"
            value={str('bspayBaseUrl')}
            placeholder="https://api.bspay.co"
            onChange={v => setStr('bspayBaseUrl', v)}
          />
          <Text
            label="Client ID"
            value={str('bspayClientId')}
            placeholder="ID fornecido pela BSPAY"
            onChange={v => setStr('bspayClientId', v)}
          />
          <Text
            label="Client Secret"
            value={str('bspayClientSecret')}
            placeholder="••••••••"
            secret
            onChange={v => setStr('bspayClientSecret', v)}
          />
          <Text
            label="Webhook Secret"
            value={str('bspayWebhookSecret')}
            placeholder="••••••••"
            secret
            hint="Usado para validar a assinatura dos callbacks de pagamento."
            onChange={v => setStr('bspayWebhookSecret', v)}
          />
        </div>
      </Section>
    </div>
  )
}

/** Campo de texto. `secret` esconde o valor mas permite revelar — digitar uma
 *  credencial às cegas é como a maioria dos erros de configuração acontece. */
function Text({ label, value, onChange, placeholder, hint, secret }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; hint?: string; secret?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-[#9ca3af]">{label}</span>
      <span className="relative block">
        <input
          type={secret && !show ? 'password' : 'text'}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={e => onChange(e.target.value)}
          className={cn(
            'w-full rounded-xl border border-[#1e2433] bg-[#0d1117] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#2E6BE6]',
            secret && 'pr-11 font-mono',
          )}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            aria-label={show ? 'Ocultar' : 'Mostrar'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#6b7280] transition-colors hover:text-white"
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </span>
      {hint && <span className="mt-1.5 block text-[11px] text-[#6b7280]">{hint}</span>}
    </label>
  )
}

// ── Componentes ─────────────────────────────────────────────────────────────────
function Section({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-4 md:p-5 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-green-400">{icon}</div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      <p className="text-xs text-[#6b7280] mb-4">{desc}</p>
      {children}
    </div>
  )
}

function Money({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] text-[#6b7280] mb-1">{label}</label>
      <div className="flex items-center gap-2 bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 focus-within:border-green-500">
        <span className="text-[#6b7280] text-sm">R$</span>
        <input
          type="number" min={0} step="1" value={Number.isFinite(value) ? value : 0}
          onChange={e => onChange(e.target.value)}
          className="bg-transparent text-white text-sm focus:outline-none w-full"
        />
      </div>
      {hint && <p className="text-[10px] text-[#4b5563] mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ label, desc, checked, onChange, danger }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#1e2433] last:border-0">
      <div className="pr-4">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-[11px] text-[#6b7280]">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn('relative w-11 h-6 rounded-full flex-shrink-0 transition-colors', checked ? (danger ? 'bg-red-500' : 'bg-green-500') : 'bg-[#2a3448]')}
        aria-pressed={checked}
      >
        <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}
