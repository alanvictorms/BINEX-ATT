'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ASSETS } from '@/lib/mockData'
import {
  Loader2, RefreshCw, X, Zap, Plus, AlertTriangle, Users, Wallet,
  Trash2, Pencil, ShoppingBag, Crown, TrendingUp, Rocket,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Kind = 'PAYOUT' | 'CASHBACK'
type Source = 'CAMPAIGN' | 'SHOP'
type Tier = 'NORMAL' | 'VIP'
type TriggerEvent = 'LOSS_STREAK' | 'DEPOSIT' | 'SIGNUP' | 'INACTIVE_DAYS'
type Tab = 'CAMPAIGN' | 'SHOP' | 'PURCHASES'

interface Booster {
  id:                  string
  name:                string
  kind:                Kind
  source:              Source
  enabled:             boolean
  value:               number
  tier:                Tier
  price:               number | null
  duration_minutes:    number | null
  max_stake:           number | null
  max_boosted_volume:  number | null
  max_amount:          number | null
  max_grants_per_user: number | null
  asset_scope:         string[] | null
  display_order:       number
  starts_at:           string | null
  ends_at:             string | null
  daily_start:         string | null
  daily_end:           string | null
  trigger_event:       TriggerEvent | null
  trigger_param:       number | null
  grant_ttl_hours:     number
  uses_per_grant:      number
  created_at:          string
  active_grants:       number
  sold:                number
  total_revenue:       number
  total_cost:          number
}

interface Purchase {
  grant_id:      string
  user_name:     string
  booster:       string
  kind:          Kind
  tier:          Tier
  price_paid:    number
  bought_at:     string
  expires_at:    string | null
  status:        string
  volume_used:   number
  cost:          number
  trades:        number
  traded_volume: number
}

const TRIGGERS: { value: TriggerEvent; label: string; paramLabel: string | null; hint: string }[] = [
  { value: 'LOSS_STREAK',   label: 'Perdeu N operações seguidas', paramLabel: 'Nº de perdas',       hint: 'Reativa quem está prestes a desistir.' },
  { value: 'DEPOSIT',       label: 'Fez um depósito',             paramLabel: 'Depósito mín. (R$)', hint: 'Recompensa quem acabou de colocar dinheiro.' },
  { value: 'SIGNUP',        label: 'Acabou de se cadastrar',      paramLabel: null,                 hint: 'Empurra a primeira operação.' },
  { value: 'INACTIVE_DAYS', label: 'Ficou N dias sem operar',     paramLabel: 'Dias parado',        hint: 'Traz de volta quem sumiu.' },
]

// Presets da loja. Preço já cobre o custo do pior caso (volume × 0,5 × boost/100).
const PRESETS = [
  { icon: Rocket,     name: 'Booster Inicial', value: 5,  price: 9.90,   minutes: 30,   tier: 'NORMAL' as Tier, stake: 100, volume: 300  },
  { icon: Zap,        name: 'Booster Padrão',  value: 8,  price: 24.90,  minutes: 60,   tier: 'NORMAL' as Tier, stake: 150, volume: 500  },
  { icon: TrendingUp, name: 'Booster Power',   value: 10, price: 49.90,  minutes: 360,  tier: 'NORMAL' as Tier, stake: 200, volume: 800  },
  { icon: Crown,      name: 'Booster Premium', value: 12, price: 74.90,  minutes: 720,  tier: 'NORMAL' as Tier, stake: 250, volume: 1000 },
  { icon: Crown,      name: 'Booster VIP',     value: 15, price: 139.90, minutes: 1440, tier: 'VIP'    as Tier, stake: 300, volume: 1500 },
]

function fmtBRL(n: number | null) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDateTime(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtDuration(min: number | null) {
  if (!min) return '—'
  if (min < 60) return `${min}min`
  if (min < 1440) return `${min / 60}h`
  return `${min / 1440}d`
}
function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null
}
function hhmm(t: string | null) {
  return t ? t.slice(0, 5) : ''
}
// Custo esperado no pior caso: o usuário consome todo o volume permitido.
// Paga-se o extra só nas vitórias — daí o 0,5.
function worstCaseCost(value: number, volume: number | null) {
  if (!volume) return null
  return volume * 0.5 * (value / 100)
}

export default function BoostersAdminPage() {
  const [tab,     setTab]     = useState<Tab>('CAMPAIGN')
  const [rows,    setRows]    = useState<Booster[]>([])
  const [buys,    setBuys]    = useState<Purchase[]>([])
  const [totals,  setTotals]  = useState({ revenue: 0, cost: 0, net: 0 })
  const [cap,     setCap]     = useState(95)
  const [vipMin,  setVipMin]  = useState(1000)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [editing, setEditing] = useState<Booster | Source | null>(null)
  const [busyId,  setBusyId]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [b, p] = await Promise.all([
        supabase.rpc('admin_list_boosters'),
        supabase.rpc('admin_list_booster_purchases', { p_search: null, p_limit: 100, p_offset: 0 }),
      ])
      if (b.error) throw b.error
      if (p.error) throw p.error
      setRows(((b.data as any)?.rows ?? []) as Booster[])
      setCap(Number((b.data as any)?.max_payout_cap ?? 95))
      setVipMin(Number((b.data as any)?.vip_min_deposits ?? 1000))
      setBuys(((p.data as any)?.rows ?? []) as Purchase[])
      setTotals({
        revenue: Number((p.data as any)?.revenue ?? 0),
        cost:    Number((p.data as any)?.cost ?? 0),
        net:     Number((p.data as any)?.net ?? 0),
      })
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar boosters')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const campaigns = useMemo(() => rows.filter(r => r.source === 'CAMPAIGN'), [rows])
  const shop      = useMemo(() => rows.filter(r => r.source === 'SHOP'), [rows])

  async function toggle(b: Booster) {
    if (!b.enabled && !confirm(
      b.source === 'SHOP'
        ? `Colocar "${b.name}" à venda?\n\nOs usuários vão poder comprar por R$ ${fmtBRL(b.price)}.`
        : `Ligar "${b.name}"?\n\nIsto passa a valer dinheiro assim que o motor estiver religado.`
    )) return
    setBusyId(b.id); setError('')
    try {
      const { error } = await supabase.rpc('admin_toggle_booster', { p_id: b.id, p_enabled: !b.enabled })
      if (error) throw error
      await load()
    } catch (e: any) {
      setError(e.message ?? 'Falha ao alternar')
    } finally { setBusyId(null) }
  }

  async function remove(b: Booster) {
    if (!confirm(`Excluir "${b.name}"? O histórico de receita e custo dela também some.`)) return
    setBusyId(b.id); setError('')
    try {
      const { error } = await supabase.rpc('admin_delete_booster', { p_id: b.id })
      if (error) throw error
      await load()
    } catch (e: any) {
      setError(e.message ?? 'Falha ao excluir')
    } finally { setBusyId(null) }
  }

  if (loading) {
    return <div className="p-6 min-h-full flex items-center justify-center"><Loader2 className="animate-spin text-[#7E8DA2]" size={28} /></div>
  }

  return (
    <div className="p-4 md:p-6 min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Boosters</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Campanhas grátis e loja de boosters pagos</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl border border-[#1e2433] bg-[#111827] text-sm font-semibold text-[#9ca3af] hover:text-white transition-colors">
            <RefreshCw size={14} /> <span className="hidden md:inline">Atualizar</span>
          </button>
          {tab !== 'PURCHASES' && (
            <button onClick={() => setEditing(tab === 'SHOP' ? 'SHOP' : 'CAMPAIGN')} className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-sm font-semibold text-white transition-colors">
              <Plus size={14} /> {tab === 'SHOP' ? 'Novo produto' : 'Nova campanha'}
            </button>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl bg-[#060A11] border border-[#1e2433] w-fit">
        <TabButton active={tab === 'CAMPAIGN'} onClick={() => setTab('CAMPAIGN')} icon={<Zap size={14} />} label="Campanhas" count={campaigns.length} />
        <TabButton active={tab === 'SHOP'}     onClick={() => setTab('SHOP')}     icon={<ShoppingBag size={14} />} label="Loja" count={shop.length} />
        <TabButton active={tab === 'PURCHASES'} onClick={() => setTab('PURCHASES')} icon={<Wallet size={14} />} label="Compras" count={buys.length} />
      </div>

      {/* Aviso: motor ainda nao le boosters */}
      <div className="mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex gap-3">
        <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200/90 leading-relaxed">
          <span className="font-bold text-amber-300">O motor ainda não lê estes boosters.</span> Dá pra cadastrar,
          precificar e ligar aqui, mas o <code className="text-amber-300">place_trade</code> continua pagando o payout
          normal. Se você colocar um produto à venda agora, o usuário paga e <span className="font-semibold">não recebe
          o boost</span> — só ligue a loja depois da Etapa 3.
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      {tab === 'CAMPAIGN' && <CampaignsTab rows={campaigns} busyId={busyId} onEdit={setEditing} onToggle={toggle} onRemove={remove} />}
      {tab === 'SHOP'     && <ShopTab      rows={shop}      busyId={busyId} onEdit={setEditing} onToggle={toggle} onRemove={remove} vipMin={vipMin} />}
      {tab === 'PURCHASES'&& <PurchasesTab rows={buys} totals={totals} />}

      {editing && (
        <BoosterModal
          booster={typeof editing === 'string' ? null : editing}
          source={typeof editing === 'string' ? editing : editing.source}
          cap={cap}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Aba: Campanhas ──────────────────────────────────────────────────────────

function CampaignsTab({ rows, busyId, onEdit, onToggle, onRemove }: {
  rows: Booster[]; busyId: string | null
  onEdit: (b: Booster) => void; onToggle: (b: Booster) => void; onRemove: (b: Booster) => void
}) {
  return (
    <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
      <table className="w-full text-sm min-w-[820px]">
        <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-3">Campanha</th>
            <th className="text-left px-4 py-3">Efeito</th>
            <th className="text-left px-4 py-3">Quando vale</th>
            <th className="text-left px-4 py-3">Ativos</th>
            <th className="text-right px-4 py-3">Custo</th>
            <th className="text-center px-4 py-3">Status</th>
            <th className="text-right px-4 py-3">Ações</th>
          </tr>
        </thead>
        <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
          {rows.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-10 text-center text-[#6b7280]">
              Nenhuma campanha. Comece por um happy hour de payout com janela curta.
            </td></tr>
          )}
          {rows.map(b => (
            <tr key={b.id} className="text-white hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <div className="font-medium leading-tight">{b.name}</div>
                <div className="text-[11px] text-[#6b7280] leading-tight">
                  {b.kind === 'PAYOUT' ? 'Payout turbinado' : 'Cashback'}
                  {b.active_grants > 0 && ` · ${b.active_grants} usuário${b.active_grants === 1 ? '' : 's'}`}
                </div>
              </td>
              <td className="px-4 py-3">
                {b.kind === 'PAYOUT' ? (
                  <>
                    <span className="font-mono font-semibold text-green-400">+{b.value} p.p.</span>
                    <div className="text-[10px] text-[#4b5563]">
                      {b.max_stake ? `entrada até R$ ${fmtBRL(b.max_stake)}` : <span className="text-amber-400/80">sem teto de entrada</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-mono font-semibold text-orange-300">{b.value}% da perda</span>
                    <div className="text-[10px] text-[#4b5563]">
                      em saldo bônus{b.max_amount ? ` · teto R$ ${fmtBRL(b.max_amount)}` : ''}
                    </div>
                  </>
                )}
              </td>
              <td className="px-4 py-3 text-[11px] text-[#9ca3af] leading-tight">
                {b.trigger_event ? (
                  <>
                    <div className="text-white">{TRIGGERS.find(t => t.value === b.trigger_event)?.label.replace('N', String(b.trigger_param ?? 'N'))}</div>
                    <div className="text-[10px] text-[#4b5563]">vale {b.grant_ttl_hours}h · {b.uses_per_grant} operação{b.uses_per_grant === 1 ? '' : 's'}</div>
                  </>
                ) : (
                  <>
                    <div>{fmtDateTime(b.starts_at)} → {fmtDateTime(b.ends_at)}</div>
                    <div className="text-[10px] text-[#4b5563]">
                      {b.daily_start ? `todo dia ${hhmm(b.daily_start)}–${hhmm(b.daily_end)}` : '24h por dia'}
                    </div>
                  </>
                )}
              </td>
              <td className="px-4 py-3 text-[11px] text-[#9ca3af]">
                {b.asset_scope?.length ? `${b.asset_scope.length} selecionado${b.asset_scope.length === 1 ? '' : 's'}` : 'Todos'}
              </td>
              <td className="px-4 py-3 text-right font-mono text-[#9ca3af]">R$ {fmtBRL(b.total_cost)}</td>
              <td className="px-4 py-3"><Toggle b={b} busyId={busyId} onToggle={onToggle} /></td>
              <td className="px-4 py-3"><RowActions b={b} busyId={busyId} onEdit={onEdit} onRemove={onRemove} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Aba: Loja ───────────────────────────────────────────────────────────────

function ShopTab({ rows, busyId, onEdit, onToggle, onRemove, vipMin }: {
  rows: Booster[]; busyId: string | null; vipMin: number
  onEdit: (b: Booster) => void; onToggle: (b: Booster) => void; onRemove: (b: Booster) => void
}) {
  return (
    <>
      <p className="text-xs text-[#6b7280] mb-3">
        O usuário compra com <span className="text-[#9ca3af]">saldo livre</span> (bônus travado no rollover não pode
        comprar booster). VIP = quem já depositou <span className="text-[#9ca3af]">R$ {fmtBRL(vipMin)}</span> ou mais.
      </p>
      <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left   px-4 py-3">Produto</th>
              <th className="text-left   px-4 py-3">Boost</th>
              <th className="text-left   px-4 py-3">Duração</th>
              <th className="text-right  px-4 py-3">Teto de volume</th>
              <th className="text-right  px-4 py-3">Custo máx.</th>
              <th className="text-right  px-4 py-3">Preço</th>
              <th className="text-right  px-4 py-3">Vendas</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-right  px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-[#6b7280]">
                Nenhum produto na loja. Use os modelos prontos ao criar — eles já vêm com preço que cobre o custo.
              </td></tr>
            )}
            {rows.map(b => {
              const cost   = worstCaseCost(b.value, b.max_boosted_volume)
              const margin = cost != null && b.price != null ? b.price - cost : null
              return (
                <tr key={b.id} className="text-white hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium leading-tight flex items-center gap-1.5">
                      {b.tier === 'VIP' && <Crown size={12} className="text-amber-400" />}
                      {b.name}
                    </div>
                    <div className="text-[11px] text-[#6b7280] leading-tight">
                      {b.kind === 'PAYOUT' ? 'Payout turbinado' : 'Cashback'}
                      {b.max_stake ? ` · entrada até R$ ${fmtBRL(b.max_stake)}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-green-400">
                    {b.kind === 'PAYOUT' ? `+${b.value} p.p.` : `${b.value}%`}
                  </td>
                  <td className="px-4 py-3 text-[#9ca3af]">{fmtDuration(b.duration_minutes)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#9ca3af]">R$ {fmtBRL(b.max_boosted_volume)}</td>
                  <td className="px-4 py-3 text-right font-mono text-orange-300">{cost != null ? `R$ ${fmtBRL(cost)}` : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-mono font-semibold text-white">R$ {fmtBRL(b.price)}</div>
                    {margin != null && (
                      <div className={cn('text-[10px]', margin >= 0 ? 'text-green-400/70' : 'text-red-400')}>
                        {margin >= 0 ? '+' : ''}R$ {fmtBRL(margin)} no pior caso
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-mono text-white">{b.sold}</div>
                    <div className="text-[10px] text-[#4b5563]">R$ {fmtBRL(b.total_revenue)}</div>
                  </td>
                  <td className="px-4 py-3"><Toggle b={b} busyId={busyId} onToggle={onToggle} /></td>
                  <td className="px-4 py-3"><RowActions b={b} busyId={busyId} onEdit={onEdit} onRemove={onRemove} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Aba: Compras ────────────────────────────────────────────────────────────

function PurchasesTab({ rows, totals }: { rows: Purchase[]; totals: { revenue: number; cost: number; net: number } }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <Card title="Receita de boosters" value={`R$ ${fmtBRL(totals.revenue)}`} sub="Total vendido" icon={<Wallet size={16} className="text-white" />} iconBg="bg-green-500" valueColor="text-green-400" />
        <Card title="Custo pago" value={`R$ ${fmtBRL(totals.cost)}`} sub="Payout extra + cashback" icon={<TrendingUp size={16} className="text-white" />} iconBg="bg-orange-500" valueColor="text-orange-300" />
        <Card title="Líquido" value={`R$ ${fmtBRL(totals.net)}`} sub="Receita − custo" icon={<Zap size={16} className="text-white" />} iconBg={totals.net >= 0 ? 'bg-green-500' : 'bg-red-500'} valueColor={totals.net >= 0 ? 'text-green-400' : 'text-red-400'} highlight />
      </div>

      <p className="text-xs text-[#6b7280] mb-3">Quem comprou, qual booster, quando, e quanto operou na janela.</p>

      <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left   px-4 py-3">Usuário</th>
              <th className="text-left   px-4 py-3">Booster</th>
              <th className="text-right  px-4 py-3">Pagou</th>
              <th className="text-left   px-4 py-3">Janela</th>
              <th className="text-right  px-4 py-3">Operações</th>
              <th className="text-right  px-4 py-3">Volume</th>
              <th className="text-right  px-4 py-3">Custou</th>
              <th className="text-center px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[#6b7280]">Nenhuma compra de booster ainda.</td></tr>
            )}
            {rows.map(r => {
              const net = Number(r.price_paid || 0) - Number(r.cost || 0)
              return (
                <tr key={r.grant_id} className="text-white hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium">{r.user_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {r.tier === 'VIP' && <Crown size={12} className="text-amber-400" />}
                      <span className="text-[#9ca3af]">{r.booster}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-green-400">R$ {fmtBRL(r.price_paid)}</td>
                  <td className="px-4 py-3 text-[11px] text-[#9ca3af] leading-tight">
                    <div>{fmtDateTime(r.bought_at)}</div>
                    <div className="text-[10px] text-[#4b5563]">até {fmtDateTime(r.expires_at)}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[#9ca3af]">{r.trades}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#9ca3af]">R$ {fmtBRL(r.traded_volume)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-mono text-orange-300">R$ {fmtBRL(r.cost)}</div>
                    <div className={cn('text-[10px]', net >= 0 ? 'text-green-400/70' : 'text-red-400')}>
                      {net >= 0 ? '+' : ''}R$ {fmtBRL(net)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold',
                      r.status === 'ACTIVE' ? 'bg-green-500/15 text-green-400' : 'bg-[#1e2433] text-[#6b7280]')}>
                      {r.status === 'ACTIVE' ? 'Ativo' : r.status === 'EXPIRED' ? 'Expirado' : r.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function BoosterModal({ booster, source, cap, onClose, onDone }: {
  booster: Booster | null; source: Source; cap: number; onClose: () => void; onDone: () => void
}) {
  const isShop = source === 'SHOP'

  const [name,   setName]   = useState(booster?.name ?? '')
  const [kind,   setKind]   = useState<Kind>(booster?.kind ?? 'PAYOUT')
  const [value,  setValue]  = useState(String(booster?.value ?? (isShop ? 8 : 7)))
  const [tier,   setTier]   = useState<Tier>(booster?.tier ?? 'NORMAL')
  const [price,  setPrice]  = useState(booster?.price != null ? String(booster.price) : '24.90')
  const [minutes, setMinutes] = useState(String(booster?.duration_minutes ?? 60))
  const [maxStake, setMaxStake] = useState(booster?.max_stake != null ? String(booster.max_stake) : (isShop ? '150' : '200'))
  const [maxVolume, setMaxVolume] = useState(booster?.max_boosted_volume != null ? String(booster.max_boosted_volume) : '500')
  const [maxAmount, setMaxAmount] = useState(booster?.max_amount != null ? String(booster.max_amount) : '')
  const [maxGrants, setMaxGrants] = useState(booster?.max_grants_per_user != null ? String(booster.max_grants_per_user) : '1')
  const [scope,  setScope]  = useState<string[]>(booster?.asset_scope ?? [])
  const [mode,   setMode]   = useState<'GLOBAL' | 'EVENT'>(booster?.trigger_event ? 'EVENT' : 'GLOBAL')
  const [startsAt, setStartsAt] = useState(toLocalInput(booster?.starts_at ?? null))
  const [endsAt,   setEndsAt]   = useState(toLocalInput(booster?.ends_at ?? null))
  const [daily,    setDaily]    = useState(!!booster?.daily_start)
  const [dailyStart, setDailyStart] = useState(hhmm(booster?.daily_start ?? null) || '20:00')
  const [dailyEnd,   setDailyEnd]   = useState(hhmm(booster?.daily_end ?? null) || '22:00')
  const [trigger,  setTrigger]  = useState<TriggerEvent>(booster?.trigger_event ?? 'LOSS_STREAK')
  const [triggerParam, setTriggerParam] = useState(String(booster?.trigger_param ?? 3))
  const [ttl,      setTtl]      = useState(String(booster?.grant_ttl_hours ?? 24))
  const [uses,     setUses]     = useState(String(booster?.uses_per_grant ?? 1))

  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const numValue = Number(value) || 0
  const triggerCfg = TRIGGERS.find(t => t.value === trigger)!

  function applyPreset(p: typeof PRESETS[number]) {
    setName(p.name); setKind('PAYOUT'); setValue(String(p.value)); setPrice(String(p.price))
    setMinutes(String(p.minutes)); setTier(p.tier); setMaxStake(String(p.stake)); setMaxVolume(String(p.volume))
  }

  // Conta de padeiro exibida ao vivo.
  const economics = useMemo(() => {
    const vol  = Number(maxVolume) || 0
    const cost = worstCaseCost(numValue, vol) ?? 0
    const p    = Number(price) || 0
    if (isShop) return { cost, margin: p - cost }
    return { cost, margin: null as number | null }
  }, [numValue, maxVolume, price, isShop])

  const payoutPreview = useMemo(() => {
    const base = 85
    const boosted = Math.min(base + numValue, cap)
    return `Num ativo que paga ${base}%, vira ${boosted}%${base + numValue > cap ? ` (travado no teto de ${cap}%)` : ''}.`
  }, [numValue, cap])

  function toggleAsset(id: string) {
    setScope(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function submit() {
    setErr('')
    if (name.trim().length < 3) { setErr('Dê um nome (mínimo 3 caracteres).'); return }
    if (numValue <= 0) { setErr('O valor precisa ser maior que zero.'); return }
    if (kind === 'PAYOUT' && numValue > 30) { setErr('Boost de payout no máximo 30 pontos percentuais.'); return }
    if (kind === 'CASHBACK' && numValue > 100) { setErr('Cashback no máximo 100% da perda.'); return }
    if (isShop) {
      if ((Number(price) || 0) <= 0)     { setErr('Produto de loja precisa de preço.'); return }
      if ((Number(minutes) || 0) <= 0)   { setErr('Produto de loja precisa de duração.'); return }
      if ((Number(maxVolume) || 0) <= 0) { setErr('Produto de loja precisa de teto de volume.'); return }
      if (economics.margin != null && economics.margin < 0) {
        setErr(`Preço abaixo do custo do pior caso (R$ ${fmtBRL(economics.cost)}). Suba o preço ou baixe o teto de volume.`); return
      }
    } else {
      if (mode === 'GLOBAL' && (!startsAt || !endsAt)) { setErr('Campanha global precisa de início e fim.'); return }
      if (mode === 'GLOBAL' && startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) { setErr('O fim tem que ser depois do início.'); return }
      if (kind === 'CASHBACK' && (Number(maxGrants) || 0) <= 0) { setErr('Cashback de campanha precisa de limite por usuário.'); return }
    }

    setSaving(true)
    try {
      const { error } = await supabase.rpc('admin_upsert_booster', {
        p_id:                  booster?.id ?? null,
        p_name:                name.trim(),
        p_kind:                kind,
        p_source:              source,
        p_value:               numValue,
        p_price:               isShop ? Number(price) : null,
        p_duration_minutes:    isShop ? Number(minutes) : null,
        p_tier:                tier,
        p_max_stake:           maxStake  !== '' ? Number(maxStake)  : null,
        p_max_boosted_volume:  isShop ? Number(maxVolume) : (maxVolume !== '' ? Number(maxVolume) : null),
        p_max_amount:          kind === 'CASHBACK' && maxAmount !== '' ? Number(maxAmount) : null,
        p_max_grants_per_user: maxGrants !== '' ? Number(maxGrants) : null,
        p_asset_scope:         scope.length ? scope : null,
        p_starts_at:           !isShop && mode === 'GLOBAL' ? fromLocalInput(startsAt) : null,
        p_ends_at:             !isShop && mode === 'GLOBAL' ? fromLocalInput(endsAt)   : null,
        p_daily_start:         !isShop && mode === 'GLOBAL' && daily ? dailyStart : null,
        p_daily_end:           !isShop && mode === 'GLOBAL' && daily ? dailyEnd   : null,
        p_trigger_event:       !isShop && mode === 'EVENT' ? trigger : null,
        p_trigger_param:       !isShop && mode === 'EVENT' && triggerCfg.paramLabel ? Number(triggerParam) : null,
        p_grant_ttl_hours:     Number(ttl)  || 24,
        p_uses_per_grant:      Number(uses) || 1,
        p_display_order:       booster?.display_order ?? 0,
      })
      if (error) throw error
      onDone()
    } catch (e: any) {
      setErr(e.message ?? 'Falha ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#060A11] border border-[#1e2433] rounded-2xl w-full max-w-2xl p-6 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">
              {booster ? 'Editar' : 'Novo'} {isShop ? 'produto da loja' : 'campanha'}
            </h2>
            <p className="text-[11px] text-[#6b7280]">
              {isShop ? 'O usuário compra com saldo livre e o booster corre pelo tempo contratado.' : 'Você concede de graça — é custo de marketing.'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-[#6b7280] hover:text-white"><X size={18} /></button>
        </div>

        {/* Modelos prontos */}
        {isShop && !booster && (
          <div className="mb-5">
            <label className="block text-[11px] text-[#6b7280] mb-1.5">Começar de um modelo pronto (preço já cobre o custo)</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {PRESETS.map(p => {
                const Icon = p.icon
                return (
                  <button key={p.name} onClick={() => applyPreset(p)}
                    className="text-left px-3 py-2 rounded-lg border border-[#1e2433] bg-[#0a0e16] hover:border-green-500/40 transition-colors">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                      <Icon size={12} className={p.tier === 'VIP' ? 'text-amber-400' : 'text-green-400'} />
                      {p.name.replace('Booster ', '')}
                    </div>
                    <div className="text-[10px] text-[#6b7280] mt-0.5">+{p.value} p.p. · {fmtDuration(p.minutes)} · R$ {fmtBRL(p.price)}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-[11px] text-[#6b7280] mb-1">Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={isShop ? 'ex: Booster Padrão' : 'ex: Happy Hour de sexta'}
            className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none" />
        </div>

        <div className="mb-4">
          <label className="block text-[11px] text-[#6b7280] mb-1.5">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            <Choice active={kind === 'PAYOUT'} onClick={() => setKind('PAYOUT')} title="Payout turbinado" sub="Paga mais em cada vitória" />
            <Choice active={kind === 'CASHBACK'} onClick={() => setKind('CASHBACK')} title="Cashback" sub="Devolve parte da perda em saldo bônus" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Field
            label={kind === 'PAYOUT' ? 'Boost (pontos percentuais)' : 'Cashback (% da perda)'}
            value={value} onChange={setValue}
            prefix={kind === 'PAYOUT' ? '+' : undefined} suffix={kind === 'PAYOUT' ? 'p.p.' : '%'}
            hint={kind === 'PAYOUT' ? payoutPreview : 'devolvido em saldo bônus, com rollover'}
          />
          <Field label="Entrada máxima com boost (R$)" value={maxStake} onChange={setMaxStake} prefix="R$"
            hint="operação acima disso paga o payout normal" />
        </div>

        {isShop ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
              <Field label="Preço (R$)" value={price} onChange={setPrice} prefix="R$" />
              <Field label="Duração (minutos)" value={minutes} onChange={setMinutes} suffix="min" hint={fmtDuration(Number(minutes) || 0)} />
              <Field label="Teto de volume (R$)" value={maxVolume} onChange={setMaxVolume} prefix="R$" hint="volume total que recebe boost" />
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {[30, 60, 120, 360, 720, 1440].map(m => (
                <button key={m} onClick={() => setMinutes(String(m))}
                  className={cn('px-2 py-1 rounded-md text-[11px] border transition-colors',
                    Number(minutes) === m ? 'bg-green-500/15 border-green-500/40 text-green-300' : 'bg-[#0a0e16] border-[#1e2433] text-[#6b7280] hover:text-white')}>
                  {fmtDuration(m)}
                </button>
              ))}
            </div>

            <div className={cn('mb-4 p-3 rounded-lg border text-[11px] leading-relaxed',
              (economics.margin ?? 0) >= 0 ? 'bg-[#0a0e16] border-[#1e2433] text-[#9ca3af]' : 'bg-red-500/10 border-red-500/30 text-red-300')}>
              <span className="text-white font-semibold">Conta: </span>
              se o usuário consumir todo o teto de R$ {fmtBRL(Number(maxVolume) || 0)}, o custo máximo é{' '}
              <span className="text-orange-300 font-semibold">R$ {fmtBRL(economics.cost)}</span>{' '}
              (volume × 0,5 × {numValue}%). Vendendo por R$ {fmtBRL(Number(price) || 0)}, seu pior caso é{' '}
              <span className={cn('font-semibold', (economics.margin ?? 0) >= 0 ? 'text-green-400' : 'text-red-400')}>
                {(economics.margin ?? 0) >= 0 ? '+' : ''}R$ {fmtBRL(economics.margin ?? 0)}
              </span>.
              {(economics.margin ?? 0) < 0 && ' Assim você perde dinheiro em toda venda usada até o fim.'}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-[11px] text-[#6b7280] mb-1.5">Quem pode comprar</label>
                <div className="grid grid-cols-2 gap-2">
                  <Choice active={tier === 'NORMAL'} onClick={() => setTier('NORMAL')} title="Todos" sub="qualquer conta real" />
                  <Choice active={tier === 'VIP'} onClick={() => setTier('VIP')} title="Só VIP" sub="acima do mínimo depositado" />
                </div>
              </div>
              <Field label="Máximo de compras por usuário" value={maxGrants} onChange={setMaxGrants} suffix="×" hint="vazio = ilimitado" />
            </div>
          </>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-[11px] text-[#6b7280] mb-1.5">Quando vale</label>
              <div className="grid grid-cols-2 gap-2">
                <Choice active={mode === 'GLOBAL'} onClick={() => setMode('GLOBAL')} title="Campanha por tempo" sub="Vale pra todo mundo numa janela" />
                <Choice active={mode === 'EVENT'} onClick={() => setMode('EVENT')} title="Automático por evento" sub="Concedido quando o gatilho dispara" />
              </div>
            </div>

            {mode === 'GLOBAL' ? (
              <div className="mb-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-[11px] text-[#6b7280] mb-1">Início</label>
                    <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)}
                      className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#6b7280] mb-1">Fim</label>
                    <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)}
                      className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none" />
                  </div>
                </div>

                <div className="flex items-center justify-between py-2.5 border-t border-[#1e2433]">
                  <div className="pr-4">
                    <div className="text-sm font-medium text-white">Só em um horário do dia</div>
                    <div className="text-[11px] text-[#6b7280]">Happy hour: repete todo dia dentro da janela acima.</div>
                  </div>
                  <button onClick={() => setDaily(d => !d)} className={cn('relative w-11 h-6 rounded-full transition-colors flex-shrink-0', daily ? 'bg-green-500' : 'bg-[#2a3448]')}>
                    <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', daily && 'translate-x-5')} />
                  </button>
                </div>

                {daily && (
                  <div className="grid grid-cols-2 gap-4 pt-3">
                    <div>
                      <label className="block text-[11px] text-[#6b7280] mb-1">Começa às</label>
                      <input type="time" value={dailyStart} onChange={e => setDailyStart(e.target.value)}
                        className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#6b7280] mb-1">Termina às</label>
                      <input type="time" value={dailyEnd} onChange={e => setDailyEnd(e.target.value)}
                        className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white text-sm focus:border-green-500 focus:outline-none" />
                    </div>
                    <p className="col-span-2 text-[10px] text-[#4b5563] -mt-2">Horário de Brasília. Pode cruzar a meia-noite (ex: 22:00 → 02:00).</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-5">
                <label className="block text-[11px] text-[#6b7280] mb-1.5">Gatilho</label>
                <div className="grid grid-cols-1 gap-2 mb-3">
                  {TRIGGERS.map(t => (
                    <Choice key={t.value} active={trigger === t.value} onClick={() => setTrigger(t.value)} title={t.label} sub={t.hint} />
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {triggerCfg.paramLabel && <Field label={triggerCfg.paramLabel} value={triggerParam} onChange={setTriggerParam} />}
                  <Field label="Validade (horas)" value={ttl} onChange={setTtl} suffix="h" />
                  <Field label="Cobre quantas operações" value={uses} onChange={setUses} suffix="×" />
                </div>
              </div>
            )}

            {kind === 'CASHBACK' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <Field label="Teto do cashback (R$)" value={maxAmount} onChange={setMaxAmount} prefix="R$" hint="máximo devolvido por concessão" />
                <Field label="Máximo por usuário (vezes)" value={maxGrants} onChange={setMaxGrants} suffix="×" hint="obrigatório — limita o passivo" />
              </div>
            )}
          </>
        )}

        {/* Escopo de ativos */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[11px] text-[#6b7280]">Ativos ({scope.length === 0 ? 'todos' : `${scope.length} selecionados`})</label>
            {scope.length > 0 && <button onClick={() => setScope([])} className="text-[11px] text-[#6b7280] hover:text-white">Limpar</button>}
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 rounded-lg bg-[#0a0e16] border border-[#1e2433]">
            {ASSETS.map(a => (
              <button key={a.id} onClick={() => toggleAsset(a.id)}
                className={cn('px-2 py-1 rounded-md text-[11px] font-medium transition-colors border',
                  scope.includes(a.id) ? 'bg-green-500/15 border-green-500/40 text-green-300' : 'bg-[#111827] border-[#1e2433] text-[#6b7280] hover:text-white')}>
                {a.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#4b5563] mt-1">Nenhum selecionado = vale para todos os ativos.</p>
        </div>

        {err && <div className="mb-4 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">{err}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[#9ca3af] hover:text-white text-sm">Cancelar</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium">
            {saving ? 'Salvando…' : booster ? 'Salvar alterações' : isShop ? 'Criar produto' : 'Criar campanha'}
          </button>
        </div>
        <p className="text-[10px] text-[#4b5563] text-right mt-2">Nasce desligado. Ligue na lista quando quiser.</p>
      </div>
    </div>
  )
}

// ─── Peças ───────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, label, count }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number
}) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors',
      active ? 'bg-[#1e2433] text-white' : 'text-[#6b7280] hover:text-white')}>
      {icon} {label}
      <span className={cn('px-1.5 py-0.5 rounded text-[10px]', active ? 'bg-[#0a0e16] text-[#9ca3af]' : 'bg-[#111827] text-[#4b5563]')}>{count}</span>
    </button>
  )
}

function Toggle({ b, busyId, onToggle }: { b: Booster; busyId: string | null; onToggle: (b: Booster) => void }) {
  return (
    <div className="flex justify-center">
      <button onClick={() => onToggle(b)} disabled={busyId === b.id} title={b.enabled ? 'Desligar' : 'Ligar'}
        className={cn('relative w-11 h-6 rounded-full transition-colors disabled:opacity-50', b.enabled ? 'bg-green-500' : 'bg-[#2a3448]')}>
        <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', b.enabled && 'translate-x-5')} />
      </button>
    </div>
  )
}

function RowActions({ b, busyId, onEdit, onRemove }: {
  b: Booster; busyId: string | null; onEdit: (b: Booster) => void; onRemove: (b: Booster) => void
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      <button onClick={() => onEdit(b)} title="Editar" className="text-[#9ca3af] hover:text-white"><Pencil size={14} /></button>
      <button onClick={() => onRemove(b)} disabled={b.enabled || busyId === b.id}
        title={b.enabled ? 'Desligue antes de excluir' : 'Excluir'}
        className="text-[#9ca3af] hover:text-red-400 disabled:opacity-30 disabled:hover:text-[#9ca3af]"><Trash2 size={14} /></button>
    </div>
  )
}

function Choice({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button onClick={onClick} className={cn('text-left px-3 py-2.5 rounded-lg border transition-colors',
      active ? 'bg-green-500/10 border-green-500/40' : 'bg-[#0a0e16] border-[#1e2433] hover:border-[#2a3448]')}>
      <div className={cn('text-sm font-medium', active ? 'text-white' : 'text-[#9ca3af]')}>{title}</div>
      <div className="text-[10px] text-[#4b5563] leading-tight mt-0.5">{sub}</div>
    </button>
  )
}

function Field({ label, value, onChange, prefix, suffix, hint }: {
  label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; hint?: string
}) {
  return (
    <div>
      <label className="block text-[11px] text-[#6b7280] mb-1">{label}</label>
      <div className="flex items-center gap-1.5 bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 focus-within:border-green-500">
        {prefix && <span className="text-[#6b7280] text-sm">{prefix}</span>}
        <input type="number" min={0} step="any" value={value} onChange={e => onChange(e.target.value)}
          className="bg-transparent text-white text-sm focus:outline-none w-full" />
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
    <div className={cn('relative bg-[#111827] border rounded-xl px-5 py-4 flex flex-col justify-between min-h-[100px]', highlight ? 'border-green-500/30' : 'border-[#1e2433]')}>
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
