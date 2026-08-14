'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Plus, Pencil, Trash2, RefreshCcw, X, Power } from 'lucide-react'

type Trader = {
  id: string
  name: string
  countryCode: string
  avatarUrl: string | null
  vip: boolean
  paid: boolean
  accessPrice: string | number
  weeklyGainPct: string | number
  copiers: number
  copiedTrades: number
  commissionPct: string | number
  profitPct: string | number
  lossPct: string | number
  active: boolean
  displayOrder: number
}

type FormState = {
  id?: string
  name: string; countryCode: string; avatarUrl: string
  vip: boolean; paid: boolean; accessPrice: string; weeklyGainPct: string
  copiers: string; copiedTrades: string; commissionPct: string
  profitPct: string; lossPct: string; active: boolean; displayOrder: string
}

const emptyForm: FormState = {
  name: '', countryCode: 'br', avatarUrl: '', vip: false, paid: false,
  accessPrice: '0', weeklyGainPct: '0', copiers: '0', copiedTrades: '0',
  commissionPct: '0', profitPct: '0', lossPct: '0', active: true, displayOrder: '0',
}

type Stats = {
  activeSubscriptions: number; cancelledSubscriptions: number; uniqueActiveUsers: number
  settledOps: number; pendingOps: number; userPnl: number; houseResult: number
  accessRevenue: number; houseTotal: number
}
type Sub = {
  id: string; userId: string; userName: string; traderName: string; status: string
  pricePaid: number; activatedAt: string; settledOps: number; accumulated: number
}

const brl = (n: number) => `${n < 0 ? '-' : ''}R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function CopyTradingAdminPage() {
  const [traders, setTraders] = useState<Trader[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [modal, setModal]     = useState<FormState | null>(null)
  const [saving, setSaving]   = useState(false)
  const [copyEnabled, setCopyEnabled] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [subs, setSubs]   = useState<Sub[]>([])
  const [view, setView]   = useState<'traders' | 'subscriptions'>('traders')

  async function load() {
    setLoading(true); setError(null)
    try {
      const [t, c, s, sub] = await Promise.all([
        api.get<{ traders: Trader[] }>('/admin/copy/traders'),
        api.get<{ copyTradeEnabled: boolean }>('/admin/copy/config'),
        api.get<Stats>('/admin/copy/stats'),
        api.get<{ subscriptions: Sub[] }>('/admin/copy/subscriptions'),
      ])
      setTraders(t.data.traders)
      setCopyEnabled(c.data.copyTradeEnabled)
      setStats(s.data)
      setSubs(sub.data.subscriptions)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function toggleGlobal() {
    const next = !copyEnabled
    setCopyEnabled(next)
    try { await api.patch('/admin/copy/config', { copyTradeEnabled: next }) }
    catch (err: any) { setCopyEnabled(!next); alert(err?.response?.data?.error ?? err.message) }
  }

  function openCreate() { setModal({ ...emptyForm }) }
  function openEdit(t: Trader) {
    setModal({
      id: t.id, name: t.name, countryCode: t.countryCode, avatarUrl: t.avatarUrl ?? '',
      vip: t.vip, paid: t.paid, accessPrice: String(t.accessPrice), weeklyGainPct: String(t.weeklyGainPct),
      copiers: String(t.copiers), copiedTrades: String(t.copiedTrades), commissionPct: String(t.commissionPct),
      profitPct: String(t.profitPct), lossPct: String(t.lossPct), active: t.active, displayOrder: String(t.displayOrder),
    })
  }

  async function save() {
    if (!modal) return
    setSaving(true)
    const payload = {
      name: modal.name, countryCode: modal.countryCode.toLowerCase(),
      avatarUrl: modal.avatarUrl || null,
      vip: modal.vip, paid: modal.paid,
      accessPrice: Number(modal.accessPrice), weeklyGainPct: Number(modal.weeklyGainPct),
      copiers: Number(modal.copiers), copiedTrades: Number(modal.copiedTrades),
      commissionPct: Number(modal.commissionPct), profitPct: Number(modal.profitPct),
      lossPct: Number(modal.lossPct), active: modal.active, displayOrder: Number(modal.displayOrder),
    }
    try {
      if (modal.id) await api.patch(`/admin/copy/traders/${modal.id}`, payload)
      else          await api.post('/admin/copy/traders', payload)
      setModal(null)
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.error ?? err.message)
    } finally { setSaving(false) }
  }

  async function remove(t: Trader) {
    if (!confirm(`Remover o trader ${t.name}? Esta ação não pode ser desfeita.`)) return
    try { await api.delete(`/admin/copy/traders/${t.id}`); await load() }
    catch (err: any) { alert(err?.response?.data?.error ?? err.message) }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Copy Trading</h1>
          <p className="text-sm text-[#6b7280]">Catálogo de traders e configuração do módulo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2030] text-[#9ca3af] hover:text-white text-sm">
            <RefreshCcw size={14} /> Atualizar
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium">
            <Plus size={16} /> Novo trader
          </button>
        </div>
      </div>

      {/* Toggle global */}
      <div className="mb-6 flex items-center justify-between rounded-xl border border-[#1e2433] bg-[#0a0e16] px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">Copy Trading habilitado</div>
          <div className="text-xs text-[#6b7280]">Desliga o módulo inteiro para os usuários (gate global).</div>
        </div>
        <button onClick={toggleGlobal}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${copyEnabled ? 'bg-green-500/15 text-green-400' : 'bg-[#1a2030] text-[#9ca3af]'}`}>
          <Power size={14} /> {copyEnabled ? 'Ativo' : 'Desativado'}
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

      {/* KPIs do negócio */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Kpi label="Assinaturas ativas" value={String(stats.activeSubscriptions)} sub={`${stats.uniqueActiveUsers} usuário(s) · ${stats.cancelledSubscriptions} canceladas`} />
          <Kpi label="Lucro da casa (operações)" value={brl(stats.houseResult)} accent={stats.houseResult >= 0 ? 'green' : 'red'} sub={`${stats.settledOps} liquidadas · ${stats.pendingOps} pendentes`} />
          <Kpi label="Receita de acesso (pagos)" value={brl(stats.accessRevenue)} accent="green" />
          <Kpi label="Total da casa no Copy" value={brl(stats.houseTotal)} accent={stats.houseTotal >= 0 ? 'green' : 'red'} />
        </div>
      )}

      {/* Alternador de visão */}
      <div className="flex gap-1 mb-4 bg-[#0a0e16] border border-[#1e2433] rounded-lg p-1 w-fit">
        {([['traders', 'Traders'], ['subscriptions', 'Assinaturas']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium ${view === k ? 'bg-[#1a2030] text-white' : 'text-[#9ca3af] hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>

      {view === 'traders' && (
      <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">#</th>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">País</th>
              <th className="text-center px-4 py-3">VIP</th>
              <th className="text-right px-4 py-3">Preço</th>
              <th className="text-right px-4 py-3">Ganho/sem</th>
              <th className="text-right px-4 py-3">Lucro/Perda</th>
              <th className="text-center px-4 py-3">Ativo</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {loading && <tr><td colSpan={9} className="px-4 py-8 text-center text-[#6b7280]">Carregando…</td></tr>}
            {!loading && traders.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-[#6b7280]">Nenhum trader. Clique em "Novo trader".</td></tr>
            )}
            {traders.map(t => (
              <tr key={t.id} className="text-white hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-[#6b7280]">{t.displayOrder}</td>
                <td className="px-4 py-3 font-semibold">{t.name}</td>
                <td className="px-4 py-3 uppercase text-[#9ca3af]">{t.countryCode}</td>
                <td className="px-4 py-3 text-center">{t.vip ? '⭐' : '—'}</td>
                <td className="px-4 py-3 text-right font-mono">{t.paid ? `R$ ${Number(t.accessPrice).toFixed(2)}` : 'Grátis'}</td>
                <td className="px-4 py-3 text-right text-blue-400 font-semibold">{Number(t.weeklyGainPct)}%</td>
                <td className="px-4 py-3 text-right text-[#9ca3af]">
                  <span className="text-green-400">{Number(t.profitPct)}%</span> / <span className="text-red-400">{Number(t.lossPct)}%</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${t.active ? 'bg-green-500/15 text-green-400' : 'bg-[#1e2433] text-[#6b7280]'}`}>
                    {t.active ? 'SIM' : 'NÃO'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => openEdit(t)} title="Editar" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-blue-400"><Pencil size={14} /></button>
                    <button onClick={() => remove(t)} title="Remover" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {view === 'subscriptions' && (
        <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Usuário</th>
                <th className="text-left px-4 py-3">Trader</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Pago</th>
                <th className="text-right px-4 py-3">Ops</th>
                <th className="text-right px-4 py-3">Resultado (usuário)</th>
                <th className="text-right px-4 py-3">Desde</th>
              </tr>
            </thead>
            <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
              {subs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#6b7280]">Nenhuma assinatura ainda.</td></tr>}
              {subs.map(s => (
                <tr key={s.id} className="text-white hover:bg-white/[0.02]">
                  <td className="px-4 py-3">{s.userName}</td>
                  <td className="px-4 py-3 text-[#9ca3af]">{s.traderName}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.status === 'ACTIVE' ? 'bg-green-500/15 text-green-400' : 'bg-[#1e2433] text-[#6b7280]'}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{s.pricePaid > 0 ? brl(s.pricePaid) : '—'}</td>
                  <td className="px-4 py-3 text-right">{s.settledOps}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${s.accumulated > 0 ? 'text-green-400' : s.accumulated < 0 ? 'text-red-400' : 'text-[#9ca3af]'}`}>{brl(s.accumulated)}</td>
                  <td className="px-4 py-3 text-right text-[#6b7280]">{new Date(s.activatedAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setModal(null)}>
          <div className="bg-[#060A11] border border-[#1e2433] rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">{modal.id ? 'Editar trader' : 'Novo trader'}</h2>
              <button onClick={() => setModal(null)} className="p-1 text-[#6b7280] hover:text-white"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Nome" value={modal.name} onChange={v => setModal({ ...modal, name: v })} placeholder="Diego S." />
              <Field label="País (ISO: br, jp, id…)" value={modal.countryCode} onChange={v => setModal({ ...modal, countryCode: v })} placeholder="br" />
              <Field label="Avatar URL (opcional)" value={modal.avatarUrl} onChange={v => setModal({ ...modal, avatarUrl: v })} placeholder="https://…" />
              <Field label="Ganho semanal %" value={modal.weeklyGainPct} onChange={v => setModal({ ...modal, weeklyGainPct: v })} placeholder="95" />
              <Field label="Copiadores" value={modal.copiers} onChange={v => setModal({ ...modal, copiers: v })} placeholder="1586" />
              <Field label="Negociações" value={modal.copiedTrades} onChange={v => setModal({ ...modal, copiedTrades: v })} placeholder="203" />
              <Field label="Comissão %" value={modal.commissionPct} onChange={v => setModal({ ...modal, commissionPct: v })} placeholder="5" />
              <Field label="Preço de acesso (R$)" value={modal.accessPrice} onChange={v => setModal({ ...modal, accessPrice: v })} placeholder="249" />
              <Field label="% Lucro (barra)" value={modal.profitPct} onChange={v => setModal({ ...modal, profitPct: v })} placeholder="93" />
              <Field label="% Perda (barra)" value={modal.lossPct} onChange={v => setModal({ ...modal, lossPct: v })} placeholder="7" />
              <Field label="Ordem de exibição" value={modal.displayOrder} onChange={v => setModal({ ...modal, displayOrder: v })} placeholder="1" />
              <div className="flex items-end gap-4 pb-1">
                <Check label="VIP" checked={modal.vip} onChange={v => setModal({ ...modal, vip: v })} />
                <Check label="Pago" checked={modal.paid} onChange={v => setModal({ ...modal, paid: v })} />
                <Check label="Ativo" checked={modal.active} onChange={v => setModal({ ...modal, active: v })} />
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

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'green' | 'red' }) {
  const color = accent === 'green' ? 'text-green-400' : accent === 'red' ? 'text-red-400' : 'text-white'
  return (
    <div className="rounded-xl border border-[#1e2433] bg-[#0a0e16] p-4">
      <div className="text-[11px] text-[#6b7280] font-semibold uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#6b7280] mt-1">{sub}</div>}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[11px] text-[#6b7280] mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white focus:border-green-500 focus:outline-none" />
    </div>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-white">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-green-500" />
      <span className="text-sm">{label}</span>
    </label>
  )
}
