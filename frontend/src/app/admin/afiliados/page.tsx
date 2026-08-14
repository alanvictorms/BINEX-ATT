'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  UserPlus, Wallet, CheckCircle2, RefreshCcw, Plus, Pencil, Users,
  Link2, Copy, Check, X, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AffiliateRow {
  id:               string
  code:             string
  name:             string
  contact:          string | null
  cpa_amount:       number
  min_deposit:      number
  status:           'active' | 'inactive'
  created_at:       string
  referrals:        number
  qualified:        number
  commission_owed:  number
  commission_paid:  number
}

interface Totals { affiliates: number; commission_owed: number; commission_paid: number }

interface Referral {
  user_id:           string
  user_name:         string | null
  user_email:        string | null
  qualified:         boolean
  qualified_at:      string | null
  commission_amount: number
  commission_paid:   boolean
  paid_at:           string | null
  created_at:        string
}

type FormState = {
  id?: string; code: string; name: string; contact: string; cpa_amount: string; min_deposit: string; status: 'active' | 'inactive'
}

const emptyForm: FormState = { code: '', name: '', contact: '', cpa_amount: '50', min_deposit: '250', status: 'active' }

function fmtBRL(n: number) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function AfiliadosAdminPage() {
  const [rows,    setRows]    = useState<AffiliateRow[]>([])
  const [totals,  setTotals]  = useState<Totals>({ affiliates: 0, commission_owed: 0, commission_paid: 0 })
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [modal,   setModal]   = useState<FormState | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [details, setDetails] = useState<AffiliateRow | null>(null)
  const [copied,  setCopied]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, error } = await supabase.rpc('admin_list_affiliates')
      if (error) throw error
      setRows(((data as any)?.rows ?? []) as AffiliateRow[])
      setTotals(((data as any)?.totals ?? { affiliates: 0, commission_owed: 0, commission_paid: 0 }) as Totals)
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar afiliados')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  function openCreate() { setModal({ ...emptyForm }) }
  function openEdit(a: AffiliateRow) {
    setModal({ id: a.id, code: a.code, name: a.name, contact: a.contact ?? '', cpa_amount: String(a.cpa_amount), min_deposit: String(a.min_deposit), status: a.status })
  }

  async function save() {
    if (!modal) return
    if (!modal.code.trim() || !modal.name.trim()) { alert('Código e nome são obrigatórios.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('admin_upsert_affiliate', {
        p_id: modal.id ?? null, p_code: modal.code.trim(), p_name: modal.name.trim(),
        p_contact: modal.contact.trim() || null,
        p_cpa_amount: Number(modal.cpa_amount) || 0, p_min_deposit: Number(modal.min_deposit) || 0,
        p_status: modal.status,
      })
      if (error) throw error
      setModal(null); await load()
    } catch (e: any) {
      alert(e.message ?? 'Falha ao salvar')
    } finally { setSaving(false) }
  }

  async function markPaid(a: AffiliateRow) {
    if (a.commission_owed <= 0) return
    if (!confirm(`Marcar R$ ${fmtBRL(a.commission_owed)} como pago para ${a.name}?`)) return
    try {
      const { error } = await supabase.rpc('admin_mark_affiliate_paid', { p_affiliate_id: a.id })
      if (error) throw error
      await load()
    } catch (e: any) { alert(e.message ?? 'Falha ao marcar como pago') }
  }

  function copyLink(code: string) {
    const url = `${window.location.origin}/?aff=${encodeURIComponent(code)}`
    navigator.clipboard?.writeText(url).then(() => { setCopied(code); setTimeout(() => setCopied(null), 1800) }).catch(() => {})
  }

  if (loading && rows.length === 0) {
    return <div className="p-6 min-h-full flex items-center justify-center"><Loader2 className="animate-spin text-[#7E8DA2]" size={28} /></div>
  }

  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Afiliados</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Parceiros (CPA) — comissão fixa por depósito qualificado</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2030] text-[#9ca3af] hover:text-white text-sm">
            <RefreshCcw size={14} /> Atualizar
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium">
            <Plus size={16} /> Novo afiliado
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Card title="Afiliados" value={totals.affiliates.toLocaleString('pt-BR')} icon={<UserPlus size={16} className="text-white" />} iconBg="bg-pink-500" />
        <Card title="Comissão a pagar" value={`R$ ${fmtBRL(totals.commission_owed)}`} icon={<Wallet size={16} className="text-white" />} iconBg="bg-amber-500" valueColor="text-amber-300" highlight />
        <Card title="Comissão paga" value={`R$ ${fmtBRL(totals.commission_paid)}`} icon={<CheckCircle2 size={16} className="text-white" />} iconBg="bg-green-600" valueColor="text-green-400" />
      </div>

      <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Afiliado</th>
              <th className="text-left px-4 py-3">Código</th>
              <th className="text-right px-4 py-3">CPA / mín.</th>
              <th className="text-center px-4 py-3">Indicados</th>
              <th className="text-right px-4 py-3">A pagar</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[#6b7280]">Nenhum afiliado. Clique em "Novo afiliado".</td></tr>
            )}
            {rows.map(a => (
              <tr key={a.id} className={cn('text-white hover:bg-white/[0.02]', a.status === 'inactive' && 'opacity-50')}>
                <td className="px-4 py-3">
                  <div className="font-medium leading-tight">{a.name}</div>
                  {a.contact && <div className="text-[11px] text-[#6b7280] leading-tight">{a.contact}</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-[#9ca3af]">{a.code}</span>
                    <button onClick={() => copyLink(a.code)} title="Copiar link de indicação" className="p-1 rounded hover:bg-white/5 text-[#6b7280] hover:text-green-400">
                      {copied === a.code ? <Check size={12} className="text-green-400" /> : <Link2 size={12} />}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className="text-green-400 font-semibold">R$ {fmtBRL(a.cpa_amount)}</span>
                  <span className="text-[#4b5563]"> / R$ {fmtBRL(a.min_deposit)}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-white font-semibold">{a.qualified}</span>
                  <span className="text-[#4b5563]">/{a.referrals}</span>
                  <div className="text-[10px] text-[#4b5563]">qualif./total</div>
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-amber-300">R$ {fmtBRL(a.commission_owed)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', a.status === 'active' ? 'bg-green-500/15 text-green-400' : 'bg-[#1e2433] text-[#6b7280]')}>
                    {a.status === 'active' ? 'ATIVO' : 'INATIVO'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => setDetails(a)} title="Ver indicados" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-blue-400"><Users size={14} /></button>
                    <button onClick={() => markPaid(a)} disabled={a.commission_owed <= 0} title="Marcar comissão como paga" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-green-400 disabled:opacity-30 disabled:hover:text-[#9ca3af]"><Wallet size={14} /></button>
                    <button onClick={() => openEdit(a)} title="Editar" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-yellow-400"><Pencil size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setModal(null)}>
          <div className="bg-[#060A11] border border-[#1e2433] rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">{modal.id ? 'Editar afiliado' : 'Novo afiliado'}</h2>
              <button onClick={() => setModal(null)} className="p-1 text-[#6b7280] hover:text-white"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Código (no link)" value={modal.code} onChange={v => setModal({ ...modal, code: v.replace(/\s/g, '') })} placeholder="JOAO10" />
              <Field label="Nome" value={modal.name} onChange={v => setModal({ ...modal, name: v })} placeholder="João Silva" />
              <Field label="Contato (opcional)" value={modal.contact} onChange={v => setModal({ ...modal, contact: v })} placeholder="email / telefone" />
              <div>
                <label className="block text-[11px] text-[#6b7280] mb-1">Status</label>
                <select value={modal.status} onChange={e => setModal({ ...modal, status: e.target.value as any })} className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white">
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
              <Field label="CPA — R$ por depósito qualificado" value={modal.cpa_amount} onChange={v => setModal({ ...modal, cpa_amount: v })} placeholder="50" />
              <Field label="Depósito mín. p/ qualificar (R$)" value={modal.min_deposit} onChange={v => setModal({ ...modal, min_deposit: v })} placeholder="250" />
            </div>
            {modal.code && (
              <div className="mt-4 flex items-center gap-2 text-xs text-[#6b7280] bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2">
                <Link2 size={12} />
                <span className="font-mono truncate">{typeof window !== 'undefined' ? window.location.origin : ''}/?aff={modal.code}</span>
                <button onClick={() => copyLink(modal.code)} className="ml-auto text-[#9ca3af] hover:text-green-400 flex items-center gap-1">
                  {copied === modal.code ? <Check size={12} /> : <Copy size={12} />} copiar
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-[#9ca3af] hover:text-white text-sm">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {details && <ReferralsModal affiliate={details} onClose={() => setDetails(null)} />}
    </div>
  )
}

function ReferralsModal({ affiliate, onClose }: { affiliate: AffiliateRow; onClose: () => void }) {
  const [rows, setRows] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.rpc('admin_affiliate_referrals', { p_affiliate_id: affiliate.id }).then(({ data }) => {
      if (active) { setRows((data ?? []) as Referral[]); setLoading(false) }
    })
    return () => { active = false }
  }, [affiliate.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#060A11] border border-[#1e2433] rounded-2xl w-full max-w-2xl p-6 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Indicados de {affiliate.name}</h2>
            <p className="text-xs text-[#6b7280]">Código {affiliate.code}</p>
          </div>
          <button onClick={onClose} className="p-1 text-[#6b7280] hover:text-white"><X size={18} /></button>
        </div>
        <div className="overflow-auto rounded-lg border border-[#1e2433]">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Usuário</th>
                <th className="text-center px-3 py-2">Qualificado</th>
                <th className="text-right px-3 py-2">Comissão</th>
                <th className="text-center px-3 py-2">Pago</th>
              </tr>
            </thead>
            <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
              {loading && <tr><td colSpan={4} className="px-3 py-6 text-center text-[#6b7280]">Carregando…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-[#6b7280]">Nenhum indicado ainda.</td></tr>}
              {!loading && rows.map(r => (
                <tr key={r.user_id} className="text-white">
                  <td className="px-3 py-2">
                    <div className="font-medium leading-tight">{r.user_name ?? '—'}</div>
                    <div className="text-[11px] text-[#6b7280] leading-tight">{r.user_email}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', r.qualified ? 'bg-green-500/15 text-green-400' : 'bg-[#1e2433] text-[#6b7280]')}>
                      {r.qualified ? 'Sim' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.qualified ? `R$ ${fmtBRL(r.commission_amount)}` : '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {r.commission_paid ? <span className="text-[10px] font-semibold text-green-400">Pago</span> : r.qualified ? <span className="text-[10px] font-semibold text-amber-300">A pagar</span> : <span className="text-[#4b5563]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[11px] text-[#6b7280] mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white focus:border-green-500 focus:outline-none" />
    </div>
  )
}

function Card({ title, value, icon, iconBg, valueColor = 'text-white', highlight }: {
  title: string; value: string; icon: React.ReactNode; iconBg: string; valueColor?: string; highlight?: boolean
}) {
  return (
    <div className={cn('relative bg-[#111827] border rounded-xl px-5 py-4 flex flex-col justify-between min-h-[100px]', highlight ? 'border-amber-500/30' : 'border-[#1e2433]')}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-[#6b7280] font-medium mb-2 leading-tight">{title}</div>
          <div className={cn('text-xl font-bold leading-tight', valueColor)}>{value}</div>
        </div>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ml-3', iconBg)}>{icon}</div>
      </div>
    </div>
  )
}
