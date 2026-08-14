'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import {
  Activity, Settings2, Eye, Zap, AlertTriangle, RefreshCw, Save, Check,
  ArrowUp, ArrowDown, TrendingUp, TrendingDown, Loader2, X, Power,
  ShieldAlert, BarChart3, Gauge, Timer, DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────
type Tab = 'config' | 'orders' | 'force'
type OrderFilter = 'OPEN' | 'CLOSED' | 'ALL'

interface ManipulationSettings {
  manipulation_enabled: boolean
  manipulation_mode: 'all' | 'real_only' | 'demo_only'
  house_win_pct: number
  volume_manipulation_enabled: boolean
  volume_manipulation_strength: number
}

interface Order {
  id: string
  account_id: string
  user_email: string
  account_type: string
  asset_id: string
  asset_symbol: string
  direction: string
  amount: number
  payout_pct: number
  entry_price: number
  exit_price: number | null
  status: string
  profit: number | null
  created_at: string
  expires_at: string
  closed_at: string | null
}

interface Asset {
  id: string
  symbol: string
  name: string
  category: string
  active_force: { direction: string; strength: number; expires_at: string } | null
}

const defaultSettings: ManipulationSettings = {
  manipulation_enabled: false,
  manipulation_mode: 'all',
  house_win_pct: 55,
  volume_manipulation_enabled: false,
  volume_manipulation_strength: 1,
}

export default function ProvedorLiquidezPage() {
  const [tab, setTab] = useState<Tab>('config')

  return (
    <div className="p-4 md:p-6 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Activity size={20} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Provedor de Liquidez</h1>
          <p className="text-xs text-[#6b7280]">Controle de resultados, manipulacao via grafico e historico de ordens</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-[#1e2433]">
        {[
          { key: 'config' as Tab, label: 'CONFIGURACAO', icon: Settings2 },
          { key: 'orders' as Tab, label: 'ORDENS AO VIVO', icon: Eye },
          { key: 'force'  as Tab, label: 'FORCA POR ATIVO', icon: Zap },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-xs font-bold tracking-wide transition-colors border-b-2 -mb-[1px]',
              tab === key
                ? 'text-white border-green-500'
                : 'text-[#6b7280] border-transparent hover:text-white'
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'config'  && <ConfigTab />}
      {tab === 'orders'  && <OrdersTab />}
      {tab === 'force'   && <ForceTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CONFIGURACAO
// ═══════════════════════════════════════════════════════════════════════════════
function ConfigTab() {
  const [settings, setSettings] = useState<ManipulationSettings>(defaultSettings)
  const [original, setOriginal] = useState<ManipulationSettings>(defaultSettings)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/manipulation/settings')
      if (!res.ok) throw new Error('Falha ao carregar')
      const data = await res.json()
      setSettings(data)
      setOriginal(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const dirty = JSON.stringify(settings) !== JSON.stringify(original)

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/admin/manipulation/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Falha ao salvar')
      setOriginal(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (k: keyof ManipulationSettings, v: any) =>
    setSettings(s => ({ ...s, [k]: v }))

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-[#6b7280]" size={24} /></div>
  }

  return (
    <div className="max-w-full space-y-5">
      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      {/* ── Card 1: Ativar/Desativar ──────────────────────────────── */}
      <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', settings.manipulation_enabled ? 'bg-green-500/15' : 'bg-red-500/10')}>
              <Power size={18} className={settings.manipulation_enabled ? 'text-green-400' : 'text-red-400'} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Manipulacao do Grafico</h3>
              <p className="text-[11px] text-[#6b7280]">Quando ativado, o motor OTC aplica vies direcional nos precos para influenciar resultados</p>
            </div>
          </div>
          <ToggleSwitch
            checked={settings.manipulation_enabled}
            onChange={v => set('manipulation_enabled', v)}
            color={settings.manipulation_enabled ? 'green' : 'gray'}
          />
        </div>

        {settings.manipulation_enabled && (
          <div className="mt-4 pt-4 border-t border-[#1e2433]">
            <label className="block text-[10px] text-[#6b7280] mb-2 font-bold tracking-wide">APLICAR EM QUAIS CONTAS?</label>
            <div className="flex gap-2">
              {[
                { value: 'all',       label: 'Real + Demo', desc: 'Todas as contas' },
                { value: 'real_only', label: 'Apenas Real', desc: 'So contas reais' },
                { value: 'demo_only', label: 'Apenas Demo', desc: 'So contas demo' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => set('manipulation_mode', opt.value)}
                  className={cn(
                    'flex-1 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-colors text-center',
                    settings.manipulation_mode === opt.value
                      ? 'bg-green-500/15 border-green-500/30 text-green-400'
                      : 'bg-[#0a0e16] border-[#1e2433] text-[#6b7280] hover:text-white hover:border-[#3a4a60]'
                  )}
                >
                  {opt.label}
                  <div className="text-[9px] font-normal mt-0.5 opacity-60">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Card 2: Win Rate da Casa ──────────────────────────────── */}
      <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert size={15} className="text-amber-400" />
          <h3 className="text-sm font-bold text-white">Win Rate da Casa</h3>
        </div>
        <p className="text-[11px] text-[#6b7280] mb-4">Define a porcentagem de ordens que a casa vence. O motor move o grafico contra o trader para atingir esse alvo.</p>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#9ca3af] font-medium">Casa ganha</span>
            <span className="text-lg font-bold text-white">{settings.house_win_pct}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={95}
            step={1}
            value={settings.house_win_pct}
            onChange={e => set('house_win_pct', parseInt(e.target.value))}
            className="w-full h-2 rounded-full appearance-none bg-[#2a3448] cursor-pointer accent-amber-500"
          />
          <div className="flex justify-between text-[10px] text-[#4b5563] mt-1.5">
            <span>50% (justo)</span>
            <span>70% (moderado)</span>
            <span>95% (agressivo)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0a0e16] border border-[#1e2433] mt-3">
          <BarChart3 size={13} className="text-blue-400 flex-shrink-0" />
          <p className="text-[10px] text-[#6b7280]">
            <span className="text-white font-semibold">Como funciona:</span> A cada segundo, o motor verifica as ordens abertas. Se o trader esta ganhando e o house_win_pct exige perda, o preco e empurrado contra a posicao. Quanto maior o %, mais agressivo o vies.
          </p>
        </div>
      </div>

      {/* ── Card 3: Manipulacao por Volume ────────────────────────── */}
      <div className="bg-[#111827] border border-[#1e2433] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Gauge size={15} className="text-blue-400" />
          <h3 className="text-sm font-bold text-white">Manipulacao por Volume</h3>
        </div>
        <p className="text-[11px] text-[#6b7280] mb-4">O grafico se move contra a exposicao liquida dos traders. Se a maioria apostou CALL, o preco tende a cair (e vice-versa).</p>

        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-white font-medium">Volume manipulation ativo</div>
            <div className="text-[10px] text-[#4b5563]">Soma CALL {'>'} PUT = preco desce. PUT {'>'} CALL = preco sobe.</div>
          </div>
          <ToggleSwitch
            checked={settings.volume_manipulation_enabled}
            onChange={v => set('volume_manipulation_enabled', v)}
            color="blue"
          />
        </div>

        {settings.volume_manipulation_enabled && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#9ca3af] font-medium">Intensidade da pressao</span>
              <span className="text-sm font-bold text-white">{settings.volume_manipulation_strength.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.1}
              value={settings.volume_manipulation_strength}
              onChange={e => set('volume_manipulation_strength', parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-[#2a3448] cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-[#4b5563] mt-1.5">
              <span>0.5x Sutil</span>
              <span>2.5x Medio</span>
              <span>5x Forte</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Save bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-[#4b5563]">
          O motor OTC recarrega as configuracoes a cada 10 segundos.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1e2433] bg-[#111827] text-xs font-semibold text-[#9ca3af] hover:text-white transition-colors"
          >
            <RefreshCw size={13} /> Recarregar
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={cn(
              'flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold transition-colors',
              dirty && !saving
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-[#1a2030] text-[#6b7280] cursor-not-allowed'
            )}
          >
            {saved ? <Check size={13} /> : <Save size={13} />}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: ORDENS AO VIVO
// ═══════════════════════════════════════════════════════════════════════════════
function OrdersTab() {
  const [filter, setFilter] = useState<OrderFilter>('OPEN')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [forcing, setForcing] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/manipulation/orders?status=${filter}`)
      if (!res.ok) throw new Error('Falha ao carregar ordens')
      const data = await res.json()
      setOrders(data.orders ?? [])
      setError('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setLoading(true)
    load()
    timerRef.current = setInterval(load, 3000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [load])

  async function forceResult(order: Order, result: 'WIN' | 'LOSS') {
    setForcing(order.id)
    try {
      const res = await fetch('/api/admin/manipulation/orders/force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation_id: order.id, result }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Falha ao forcar resultado')
      }
      await load()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setForcing(null)
    }
  }

  function fmtTime(iso: string) {
    try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
    catch { return '-' }
  }

  function fmtBRL(n: number) {
    return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  function timeLeft(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'expirado'
    const s = Math.floor(diff / 1000)
    return `${s}s`
  }

  return (
    <div>
      {/* Info banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-4">
        <Zap size={14} className="text-blue-400 flex-shrink-0" />
        <span className="text-[11px] text-blue-300">
          <strong>Win/Loss via grafico:</strong> Ao clicar Win ou Loss, uma forca direcional e aplicada no ativo ate a ordem expirar, movendo o grafico a favor ou contra o trader.
        </span>
      </div>

      {/* Sub-filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          {(['OPEN', 'CLOSED', 'ALL'] as OrderFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                filter === f ? 'bg-white/10 text-white' : 'text-[#6b7280] hover:text-white'
              )}
            >
              {f === 'OPEN' ? 'ABERTAS' : f === 'CLOSED' ? 'FECHADAS' : 'TODAS'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[#6b7280] text-xs ml-auto">
          <RefreshCw size={11} className="animate-spin" />
          {orders.length} ordem(ns)
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{error}</div>}

      {/* Table */}
      <div className="bg-[#111827] border border-[#1e2433] rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1e2433]">
              <th className="text-left px-3 py-3 text-[#6b7280] font-semibold">USUARIO</th>
              <th className="text-left px-3 py-3 text-[#6b7280] font-semibold">TIPO</th>
              <th className="text-left px-3 py-3 text-[#6b7280] font-semibold">ATIVO</th>
              <th className="text-left px-3 py-3 text-[#6b7280] font-semibold">DIR.</th>
              <th className="text-left px-3 py-3 text-[#6b7280] font-semibold">VALOR</th>
              <th className="text-left px-3 py-3 text-[#6b7280] font-semibold">ENTRADA</th>
              <th className="text-left px-3 py-3 text-[#6b7280] font-semibold">SAIDA</th>
              <th className="text-left px-3 py-3 text-[#6b7280] font-semibold">STATUS</th>
              <th className="text-left px-3 py-3 text-[#6b7280] font-semibold">TEMPO</th>
              <th className="text-left px-3 py-3 text-[#6b7280] font-semibold">ACOES</th>
            </tr>
          </thead>
          <tbody>
            {loading && orders.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-[#4b5563]"><Loader2 className="animate-spin mx-auto" size={20} /></td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-[#4b5563]">Nenhuma ordem encontrada</td></tr>
            ) : orders.map(order => (
              <tr key={order.id} className="border-b border-[#1e2433] hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2.5">
                  <div className="text-white font-medium text-[11px] truncate max-w-[120px]">{order.user_email}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded',
                    order.account_type === 'REAL' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'
                  )}>
                    {order.account_type}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-white font-medium text-[11px]">{order.asset_symbol}</td>
                <td className="px-3 py-2.5">
                  <span className={cn('font-bold text-[11px]', order.direction === 'CALL' ? 'text-green-400' : 'text-red-400')}>
                    {order.direction === 'CALL' ? '▲' : '▼'} {order.direction}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-white text-[11px]">{fmtBRL(order.amount)}</td>
                <td className="px-3 py-2.5 text-white font-mono text-[10px]">{Number(order.entry_price).toFixed(5)}</td>
                <td className="px-3 py-2.5 font-mono text-[10px]">
                  {order.exit_price ? (
                    <span className={Number(order.exit_price) > Number(order.entry_price) ? 'text-green-400' : 'text-red-400'}>
                      {Number(order.exit_price).toFixed(5)}
                    </span>
                  ) : <span className="text-[#4b5563]">-</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    order.status === 'OPEN' ? 'bg-amber-500/15 text-amber-400' :
                    order.status === 'WON'  ? 'bg-green-500/10 text-green-400' :
                    order.status === 'LOST' ? 'bg-red-500/10 text-red-400' :
                    'bg-[#1e2433] text-[#6b7280]'
                  )}>
                    {order.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[#9ca3af] text-[11px]">
                  {order.status === 'OPEN' ? (
                    <span className="flex items-center gap-1"><Timer size={10} /> {timeLeft(order.expires_at)}</span>
                  ) : fmtTime(order.closed_at || order.expires_at)}
                </td>
                <td className="px-3 py-2.5">
                  {order.status === 'OPEN' ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => forceResult(order, 'WIN')}
                        disabled={forcing === order.id}
                        title="Aplicar forca no grafico para esta ordem GANHAR"
                        className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-bold hover:bg-green-500/25 transition-colors disabled:opacity-50"
                      >
                        <TrendingUp size={10} /> Win
                      </button>
                      <button
                        onClick={() => forceResult(order, 'LOSS')}
                        disabled={forcing === order.id}
                        title="Aplicar forca no grafico para esta ordem PERDER"
                        className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-bold hover:bg-red-500/25 transition-colors disabled:opacity-50"
                      >
                        <TrendingDown size={10} /> Loss
                      </button>
                    </div>
                  ) : order.status !== 'OPEN' ? (
                    <span className={cn('text-[10px] font-semibold', order.status === 'WON' ? 'text-green-400' : order.status === 'LOST' ? 'text-red-400' : 'text-[#6b7280]')}>
                      {order.status === 'WON' ? 'Ganhou' : order.status === 'LOST' ? 'Perdeu' : order.status}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: FORCA POR ATIVO
// ═══════════════════════════════════════════════════════════════════════════════
function ForceTab() {
  const [assets, setAssets]   = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [modal, setModal]     = useState<Asset | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/manipulation/assets')
      if (!res.ok) throw new Error('Falha ao carregar ativos')
      const data = await res.json()
      setAssets(data.assets ?? [])
      setError('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
        <Zap size={14} className="text-amber-400 flex-shrink-0" />
        <span className="text-[11px] text-amber-300">
          <strong>Forca direcional:</strong> Aplica um vies de compra (preco sobe) ou venda (preco desce) no ativo escolhido por um tempo determinado. O grafico se move na direcao forcada.
        </span>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{error}</div>}

      <div className="bg-[#111827] border border-[#1e2433] rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#1e2433]">
              <th className="text-left px-4 py-3 text-[#6b7280] font-semibold">ATIVO</th>
              <th className="text-left px-4 py-3 text-[#6b7280] font-semibold">FORCA ATIVA</th>
              <th className="text-left px-4 py-3 text-[#6b7280] font-semibold">TEMPO RESTANTE</th>
              <th className="text-left px-4 py-3 text-[#6b7280] font-semibold">ACAO</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-[#4b5563]"><Loader2 className="animate-spin mx-auto" size={20} /></td></tr>
            ) : assets.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-[#4b5563]">Nenhum ativo OTC encontrado</td></tr>
            ) : assets.map(asset => {
              const remaining = asset.active_force ? Math.max(0, Math.floor((new Date(asset.active_force.expires_at).getTime() - Date.now()) / 1000)) : 0
              return (
                <tr key={asset.id} className="border-b border-[#1e2433] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-white font-semibold">{asset.symbol}</div>
                    <div className="text-[10px] text-[#4b5563]">{asset.category}</div>
                  </td>
                  <td className="px-4 py-3">
                    {asset.active_force && remaining > 0 ? (
                      <span className={cn(
                        'flex items-center gap-1.5 text-xs font-bold',
                        asset.active_force.direction === 'buy' ? 'text-green-400' : 'text-red-400'
                      )}>
                        {asset.active_force.direction === 'buy' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        {asset.active_force.direction === 'buy' ? 'COMPRA' : 'VENDA'} {asset.active_force.strength}x
                      </span>
                    ) : (
                      <span className="text-[#4b5563]">Nenhuma</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {remaining > 0 ? (
                      <span className="text-amber-400 text-xs font-mono">{remaining}s</span>
                    ) : (
                      <span className="text-[#4b5563]">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setModal(asset)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a3448] bg-[#1a2030] text-[#9ca3af] text-xs font-medium hover:text-white hover:border-[#3a4a60] transition-colors"
                    >
                      <Zap size={12} /> Aplicar forca
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <ForceModal
          asset={modal}
          onClose={() => setModal(null)}
          onApplied={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}

function ForceModal({ asset, onClose, onApplied }: { asset: Asset; onClose: () => void; onApplied: () => void }) {
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy')
  const [strength, setStrength]   = useState(2)
  const [duration, setDuration]   = useState(60)
  const [applying, setApplying]   = useState(false)

  const DURATIONS = [
    { label: '30 seg', value: 30 },
    { label: '1 min',  value: 60 },
    { label: '2 min',  value: 120 },
    { label: '5 min',  value: 300 },
    { label: '10 min', value: 600 },
    { label: '30 min', value: 1800 },
    { label: '1 hora', value: 3600 },
  ]

  async function apply() {
    setApplying(true)
    try {
      const res = await fetch('/api/admin/manipulation/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: asset.symbol, direction, strength, duration_seconds: duration }),
      })
      if (!res.ok) throw new Error('Falha ao aplicar forca')
      onApplied()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#111827] border border-[#1e2433] rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-white">Forca direcional - {asset.symbol}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-[#6b7280] hover:text-white hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Direction */}
        <div className="mb-5">
          <label className="block text-[10px] text-[#6b7280] mb-2 font-bold tracking-wide">DIRECAO DO PRECO</label>
          <div className="flex gap-2">
            <button
              onClick={() => setDirection('buy')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-colors border',
                direction === 'buy'
                  ? 'bg-green-500 border-green-400 text-white'
                  : 'bg-[#1a2030] border-[#2a3448] text-[#6b7280] hover:text-white'
              )}
            >
              <TrendingUp size={16} /> Subir (Compra)
            </button>
            <button
              onClick={() => setDirection('sell')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-colors border',
                direction === 'sell'
                  ? 'bg-red-500 border-red-400 text-white'
                  : 'bg-[#1a2030] border-[#2a3448] text-[#6b7280] hover:text-white'
              )}
            >
              <TrendingDown size={16} /> Descer (Venda)
            </button>
          </div>
        </div>

        {/* Intensity */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#6b7280] font-bold tracking-wide">INTENSIDADE</span>
            <span className="text-sm font-bold text-white">{strength.toFixed(1)}x</span>
          </div>
          <input
            type="range" min={0.5} max={5} step={0.1}
            value={strength}
            onChange={e => setStrength(parseFloat(e.target.value))}
            className="w-full h-2 rounded-full appearance-none bg-[#2a3448] accent-blue-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#4b5563] mt-1">
            <span>0.5x Sutil</span>
            <span>5x Forte</span>
          </div>
        </div>

        {/* Duration */}
        <div className="mb-6">
          <label className="block text-[10px] text-[#6b7280] mb-2 font-bold tracking-wide">DURACAO</label>
          <div className="grid grid-cols-4 gap-1.5">
            {DURATIONS.map(d => (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                className={cn(
                  'px-2 py-2 rounded-lg text-[11px] font-semibold border transition-colors',
                  duration === d.value
                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                    : 'bg-[#0a0e16] border-[#1e2433] text-[#6b7280] hover:text-white'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={apply}
            disabled={applying}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            {applying ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            Aplicar forca
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl border border-[#2a3448] text-[#9ca3af] text-sm font-semibold hover:text-white transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Components ───────────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange, color = 'green' }: {
  checked: boolean; onChange: (v: boolean) => void; color?: string
}) {
  const colors: Record<string, string> = {
    green: 'bg-green-500', amber: 'bg-amber-500', blue: 'bg-blue-500', red: 'bg-red-500', gray: 'bg-[#2a3448]',
  }
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-11 h-6 rounded-full flex-shrink-0 transition-colors',
        checked ? (colors[color] ?? 'bg-green-500') : 'bg-[#2a3448]'
      )}
      aria-pressed={checked}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
        checked && 'translate-x-5'
      )} />
    </button>
  )
}
