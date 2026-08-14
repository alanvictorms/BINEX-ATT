'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { notifyEmail } from '@/lib/notifyEmail'
import {
  Search, Loader2, RotateCw, CheckCircle2, Clock, XCircle, AlertTriangle,
  DollarSign, ArrowUpCircle, AlertCircle, ShieldCheck, ShieldAlert,
  CheckCheck, Ban, Banknote, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Confirm2FAModal } from '@/components/auth/Confirm2FAModal'

interface Row {
  id:               string
  user_id:          string
  user_name:        string
  user_email:       string
  user_cpf:         string | null
  kyc_status:       string
  account_type:     'REAL' | 'DEMO'
  amount:           number
  pix_key_type:     string
  pix_key:          string
  status:           'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled' | 'payout_processing' | 'payout_failed'
  admin_notes:      string | null
  created_at:       string
  processed_at:     string | null
  paid_at:          string | null
  payment_proof_id: string | null
  payment_notes:    string | null
  shared_pix_key:   boolean
  deposited_30d:    number
  withdrawn_30d:    number
  risk_aml:         boolean
}

interface Stats {
  total_count:     number; total_amount:    number
  paid_count:      number; paid_amount:     number
  pending_count:   number; pending_amount:  number
  approved_count:  number; approved_amount: number
  to_pay_amount:   number
  avg_ticket:      number
}

type Filter = 'all' | 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled'

const PAGE_SIZE = 50

const PIX_LABEL: Record<string, string> = {
  cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Telefone', random: 'Aleatória',
}

export default function SaquesAdminPage() {
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [rows,    setRows]    = useState<Row[]>([])
  const [total,   setTotal]   = useState(0)
  const [filter,  setFilter]  = useState<Filter>('all')
  const [search,  setSearch]  = useState('')
  const [page,    setPage]    = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [busyId,  setBusyId]  = useState<string | null>(null)
  const [mfaPrompt, setMfaPrompt] = useState<{ message: string; onSuccess: () => void } | null>(null)

  // Detecta erro de MFA do banco e abre o modal step-up
  function isMfaError(msg: string): boolean {
    return msg.includes('MFA_REQUIRED') || msg.includes('MFA_STALE')
  }

  const loadStats = useCallback(async () => {
    const { data } = await supabase.rpc('admin_withdrawals_stats')
    if (data) setStats(data as Stats)
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('admin_list_withdrawals', {
      p_search: search || null,
      p_filter: filter,
      p_limit:  PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    })
    if (error) {
      setError(error.message)
    } else if (data) {
      setRows((data as any).rows ?? [])
      setTotal((data as any).total ?? 0)
    }
    setLoading(false)
  }, [search, filter, page])

  useEffect(() => { loadStats() }, [loadStats])

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); loadRows() }, 300)
    return () => clearTimeout(t)
  }, [search, filter])

  useEffect(() => { loadRows() }, [page])

  async function handleApprove(r: Row) {
    if (r.kyc_status !== 'verified') {
      alert(`Bloqueado: usuário precisa ter KYC verificado (atual: ${r.kyc_status}).`)
      return
    }
    const note = prompt(`Aprovar saque de R$ ${Number(r.amount).toFixed(2)} para ${r.user_name}?\n\nObservação (opcional):`)
    if (note === null) return

    const doApprove = async () => {
      setBusyId(r.id)
      try {
        const { error } = await supabase.rpc('admin_process_withdrawal', {
          p_withdrawal_id: r.id, p_action: 'approve', p_notes: note || null,
        })
        if (error) {
          if (isMfaError(error.message)) {
            setMfaPrompt({
              message: `Por segurança, confirme seu código 2FA para APROVAR o saque de R$ ${Number(r.amount).toFixed(2)} para ${r.user_name}.`,
              onSuccess: () => { setMfaPrompt(null); doApprove() },
            })
            return
          }
          throw error
        }
        await Promise.all([loadRows(), loadStats()])
      } catch (e: any) { alert('Erro: ' + e.message) } finally { setBusyId(null) }
    }

    await doApprove()
  }

  async function handleReject(r: Row) {
    const note = prompt(`Rejeitar saque de R$ ${Number(r.amount).toFixed(2)}?\n\nMotivo (será visível ao usuário):`)
    if (note === null) return
    if (note.trim().length < 5) { alert('Motivo obrigatório (mín. 5 caracteres).'); return }
    setBusyId(r.id)
    try {
      const { error } = await supabase.rpc('admin_process_withdrawal', {
        p_withdrawal_id: r.id, p_action: 'reject', p_notes: note.trim(),
      })
      if (error) throw error
      // E-mail de saque rejeitado (servidor valida o estado antes de enviar)
      notifyEmail('withdrawal_rejected', r.id)
      await Promise.all([loadRows(), loadStats()])
    } catch (e: any) { alert('Erro: ' + e.message) } finally { setBusyId(null) }
  }

  async function handlePayoutBSPay(r: Row) {
    if (!confirm(
      `⚡ PAGAR via BSPay (automático)?\n\n` +
      `Usuário: ${r.user_name}\n` +
      `Valor: R$ ${Number(r.amount).toFixed(2)}\n` +
      `Chave PIX: ${r.pix_key} (${r.pix_key_type})\n\n` +
      `Isso vai DEBITAR sua carteira BSPay e enviar o PIX agora.\n` +
      `Sem volta.\n\nConfirmar?`
    )) return

    const doPayout = async () => {
      setBusyId(r.id)
      try {
        const res = await fetch('/api/admin/withdrawals/payout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ withdrawal_id: r.id }),
        })
        const json = await res.json()
        if (!res.ok) {
          if (typeof json.error === 'string' && (json.error.includes('MFA_REQUIRED') || json.error.includes('MFA_STALE'))) {
            setMfaPrompt({
              message: `Por segurança, confirme seu código 2FA para EXECUTAR o pagamento BSPay de R$ ${Number(r.amount).toFixed(2)} para ${r.user_name}.`,
              onSuccess: () => { setMfaPrompt(null); doPayout() },
            })
            return
          }
          throw new Error(json.error ?? 'Falha no pagamento')
        }
        if (json.immediatelyPaid) {
          alert(`✅ Pago com sucesso!\n\nE2E ID: ${json.e2eId ?? json.bspayPayoutId}`)
        } else {
          alert(`⏳ Pagamento enviado para BSPay (status: ${json.bspayStatus}).\n\nID BSPay: ${json.bspayPayoutId}\n\nO status será atualizado automaticamente via webhook quando liquidar.`)
        }
        await Promise.all([loadRows(), loadStats()])
      } catch (e: any) { alert('Erro: ' + e.message) } finally { setBusyId(null) }
    }

    await doPayout()
  }

  async function handleMarkPaid(r: Row) {
    const proof = prompt(
      `Marcar saque como PAGO?\n\n` +
      `Usuário: ${r.user_name}\n` +
      `Valor: R$ ${Number(r.amount).toFixed(2)}\n` +
      `Chave PIX: ${r.pix_key}\n\n` +
      `Cole o ID/E2E do comprovante PIX (mín. 3 caracteres):`
    )
    if (proof === null) return
    if (proof.trim().length < 3) { alert('ID do comprovante obrigatório.'); return }
    const notes = prompt('Observações adicionais (opcional):')

    const doPay = async () => {
      setBusyId(r.id)
      try {
        const { error } = await supabase.rpc('admin_mark_withdrawal_paid', {
          p_withdrawal_id:    r.id,
          p_payment_proof_id: proof.trim(),
          p_notes:            notes || null,
        })
        if (error) {
          if (isMfaError(error.message)) {
            setMfaPrompt({
              message: `Por segurança, confirme seu código 2FA para DEBITAR R$ ${Number(r.amount).toFixed(2)} pagos a ${r.user_name}.`,
              onSuccess: () => { setMfaPrompt(null); doPay() },
            })
            return
          }
          throw error
        }
        // E-mail de saque pago (servidor valida o estado antes de enviar)
        notifyEmail('withdrawal_paid', r.id)
        await Promise.all([loadRows(), loadStats()])
      } catch (e: any) { alert('Erro: ' + e.message) } finally { setBusyId(null) }
    }

    await doPay()
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Saques</h1>
          <p className="text-sm text-[#7E8DA2] mt-1">Gerencie as solicitações de saque dos usuários</p>
        </div>
        <button
          onClick={() => { loadStats(); loadRows() }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#16202D] text-[#7E8DA2] hover:text-white hover:border-white/30 transition-colors text-xs font-medium"
        >
          <RotateCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* 4 stat cards (incluindo "A pagar" em destaque) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<ArrowUpCircle size={20} />}
          title="Saques Gerados"
          big={stats?.total_count}
          sub={stats ? `R$ ${stats.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} total` : '—'}
        />
        <StatCard
          icon={<CheckCircle2 size={20} />}
          title="Saques Pagos"
          big={stats?.paid_count}
          sub={stats ? `R$ ${stats.paid_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} pagos` : '—'}
          color="green"
        />
        <StatCard
          icon={<DollarSign size={20} />}
          title="Ticket Médio"
          bigText={stats ? `R$ ${stats.avg_ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
          sub={stats ? `${stats.pending_count} pendente(s)` : '—'}
          color="blue"
        />
        <StatCard
          icon={<Banknote size={20} />}
          title="A Pagar"
          bigText={stats ? `R$ ${stats.to_pay_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
          sub={stats ? `${stats.approved_count} aprovado(s) aguardando PIX` : '—'}
          color={stats && stats.to_pay_amount > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 border border-[#16202D] bg-[#0C131F] rounded-lg p-1 flex-wrap">
          <Tab active={filter==='all'}       onClick={() => setFilter('all')}>      Todos     ({stats?.total_count ?? '—'})</Tab>
          <Tab active={filter==='pending'}   onClick={() => setFilter('pending')}>  Pendentes ({stats?.pending_count ?? '—'})</Tab>
          <Tab active={filter==='approved'}  onClick={() => setFilter('approved')}> Aprovados ({stats?.approved_count ?? '—'})</Tab>
          <Tab active={filter==='paid'}      onClick={() => setFilter('paid')}>     Pagos     ({stats?.paid_count ?? '—'})</Tab>
          <Tab active={filter==='rejected'}  onClick={() => setFilter('rejected')}> Rejeitados</Tab>
          <Tab active={filter==='cancelled'} onClick={() => setFilter('cancelled')}>Cancelados</Tab>
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E8DA2]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email, chave PIX ou CPF..."
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg pl-8 pr-3 text-sm text-white placeholder-[#7E8DA2] outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0C131F] border border-[#16202D] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1200px]">
            <thead>
              <tr className="text-[#7E8DA2] border-b border-[#16202D]">
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-left px-4 py-3 font-medium">CPF</th>
                <th className="text-center px-4 py-3 font-medium">Tipo Conta</th>
                <th className="text-center px-4 py-3 font-medium">KYC</th>
                <th className="text-right px-4 py-3 font-medium">Valor</th>
                <th className="text-left px-4 py-3 font-medium">Chave PIX</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-center px-4 py-3 font-medium">Risco</th>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-right px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-20"><Loader2 className="inline-block animate-spin text-[#7E8DA2]" size={20} /></td></tr>
              ) : error ? (
                <tr><td colSpan={10} className="text-center py-10 text-red-400">{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-[#7E8DA2]">Nenhum saque encontrado</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="border-b border-[#1e2433] text-white hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.user_name || '—'}</div>
                    <div className="text-[10px] text-[#7E8DA2]">{r.user_email}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[#AEBBCB]">{r.user_cpf || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <Pill color={r.account_type === 'REAL' ? 'green' : 'blue'}>{r.account_type === 'REAL' ? 'Real' : 'Demo'}</Pill>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.kyc_status === 'verified' ? (
                      <span title="KYC verificado" className="inline-flex"><ShieldCheck size={14} className="text-green-400" /></span>
                    ) : (
                      <span title={`KYC ${r.kyc_status}`} className="inline-flex"><ShieldAlert size={14} className="text-yellow-400" /></span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold">R$ {Number(r.amount).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-[11px]">{r.pix_key}</div>
                    <div className="text-[10px] text-[#7E8DA2]">{PIX_LABEL[r.pix_key_type] ?? r.pix_key_type}</div>
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-center">
                    <RiskFlags r={r} />
                  </td>
                  <td className="px-4 py-3 text-[#AEBBCB]">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.status === 'pending' && (
                        <>
                          <ActionBtn onClick={() => handleApprove(r)} disabled={busyId === r.id || r.kyc_status !== 'verified'} title={r.kyc_status !== 'verified' ? 'KYC não verificado' : 'Aprovar'} variant="approve">
                            <CheckCheck size={11} />Aprovar
                          </ActionBtn>
                          <ActionBtn onClick={() => handleReject(r)} disabled={busyId === r.id} title="Rejeitar" variant="reject">
                            <Ban size={11} />Rejeitar
                          </ActionBtn>
                        </>
                      )}
                      {r.status === 'approved' && (
                        <>
                          <ActionBtn onClick={() => handlePayoutBSPay(r)} disabled={busyId === r.id} title="Pagar automaticamente via BSPay" variant="bspay">
                            <Zap size={11} />Pagar BSPay
                          </ActionBtn>
                          <ActionBtn onClick={() => handleMarkPaid(r)} disabled={busyId === r.id} title="Marcar como pago manualmente (PIX externo)" variant="pay">
                            <Banknote size={11} />Manual
                          </ActionBtn>
                        </>
                      )}
                      {r.status === 'payout_processing' && (
                        <span className="text-[10px] text-blue-400 font-bold flex items-center gap-1">
                          <Loader2 size={11} className="animate-spin" /> Processando BSPay
                        </span>
                      )}
                      {r.status === 'payout_failed' && (
                        <ActionBtn onClick={() => handlePayoutBSPay(r)} disabled={busyId === r.id} title="Tentar pagamento novamente" variant="bspay">
                          <Zap size={11} />Tentar novamente
                        </ActionBtn>
                      )}
                      {r.status === 'paid' && r.payment_proof_id && (
                        <span title={`Comprovante: ${r.payment_proof_id}`} className="text-[10px] text-green-400 font-mono">
                          ✓ {r.payment_proof_id.slice(0, 8)}...
                        </span>
                      )}
                      {(r.status === 'rejected' || r.status === 'cancelled') && (
                        <span className="text-[10px] text-[#7E8DA2]">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {mfaPrompt && (
          <Confirm2FAModal
            title="Confirmação de débito"
            message={mfaPrompt.message}
            onSuccess={mfaPrompt.onSuccess}
            onClose={() => setMfaPrompt(null)}
          />
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#16202D] text-xs text-[#7E8DA2]">
            <div>
              Mostrando <span className="text-white">{total === 0 ? 0 : page * PAGE_SIZE + 1}</span>–<span className="text-white">{Math.min((page + 1) * PAGE_SIZE, total)}</span> de <span className="text-white">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="px-3 py-1 rounded border border-[#16202D] hover:border-blue-500/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Anterior
              </button>
              <span className="text-white">Página {page + 1} de {pageCount}</span>
              <button onClick={() => setPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}
                className="px-3 py-1 rounded border border-[#16202D] hover:border-blue-500/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, title, big, bigText, sub, color = 'gray' }: {
  icon: React.ReactNode; title: string; big?: number; bigText?: string; sub: string
  color?: 'gray' | 'green' | 'blue' | 'red'
}) {
  const iconBg = {
    gray:  'bg-[#16202D] text-[#AEBBCB]',
    green: 'bg-green-500/15 text-green-400',
    blue:  'bg-blue-500/15 text-blue-400',
    red:   'bg-red-500/15 text-red-400',
  }[color]
  const bigColor = color === 'red' ? 'text-red-400' : 'text-white'
  return (
    <div className="bg-[#0C131F] border border-[#16202D] rounded-xl p-5 flex items-start justify-between">
      <div>
        <div className="text-xs text-[#7E8DA2] mb-2">{title}</div>
        <div className={cn('text-3xl font-bold', bigColor)}>
          {bigText ?? (big === undefined ? '—' : big.toLocaleString('pt-BR'))}
        </div>
        <div className="text-[11px] text-[#7E8DA2] mt-1">{sub}</div>
      </div>
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
        {icon}
      </div>
    </div>
  )
}

function Tab({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 h-8 rounded-md text-xs font-semibold transition-colors',
        active ? 'bg-[#101825] text-white' : 'text-[#7E8DA2] hover:text-white'
      )}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: 'green' | 'yellow' | 'red' | 'gray' | 'blue'; label: string; icon: React.ReactNode }> = {
    paid:               { color: 'green',  label: 'Pago',         icon: <CheckCircle2 size={10} /> },
    approved:           { color: 'blue',   label: 'Aprovado',     icon: <CheckCheck size={10} /> },
    pending:            { color: 'yellow', label: 'Pendente',     icon: <Clock size={10} /> },
    rejected:           { color: 'red',    label: 'Rejeitado',    icon: <XCircle size={10} /> },
    cancelled:          { color: 'gray',   label: 'Cancelado',    icon: <Ban size={10} /> },
    payout_processing:  { color: 'blue',   label: 'Processando',  icon: <Loader2 size={10} className="animate-spin" /> },
    payout_failed:      { color: 'red',    label: 'Falha PIX',    icon: <AlertCircle size={10} /> },
  }
  const cfg = map[status] ?? { color: 'gray', label: status, icon: null }
  return <Pill color={cfg.color} icon={cfg.icon}>{cfg.label}</Pill>
}

function Pill({ children, color, icon }: { children: React.ReactNode; color: 'green' | 'red' | 'yellow' | 'gray' | 'blue'; icon?: React.ReactNode }) {
  const map = {
    green:  'bg-green-500/15  text-green-400  border-green-500/30',
    red:    'bg-red-500/15    text-red-400    border-red-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    gray:   'bg-[#16202D]     text-[#AEBBCB]  border-[#1B2735]',
    blue:   'bg-blue-500/15   text-blue-400   border-blue-500/30',
  }[color]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border', map)}>
      {icon}{children}
    </span>
  )
}

function RiskFlags({ r }: { r: Row }) {
  const flags = []
  if (r.shared_pix_key) flags.push({ icon: <AlertTriangle size={11} />, label: 'PIX compartilhada', color: 'text-orange-400' })
  if (r.risk_aml)        flags.push({ icon: <AlertCircle size={11} />, label: `AML: sacou R$ ${r.withdrawn_30d.toFixed(0)} vs depositou R$ ${r.deposited_30d.toFixed(0)} em 30d`, color: 'text-red-400' })

  if (flags.length === 0) return <span className="text-[#1B2735]">—</span>

  return (
    <div className="flex items-center justify-center gap-1.5">
      {flags.map((f, i) => (
        <span key={i} title={f.label} className={cn('inline-flex', f.color)}>
          {f.icon}
        </span>
      ))}
    </div>
  )
}

function ActionBtn({ children, onClick, disabled, title, variant }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string
  variant: 'approve' | 'reject' | 'pay' | 'bspay'
}) {
  const styleMap = {
    approve: 'border-green-500/40 text-green-400 hover:bg-green-500/10',
    reject:  'border-red-500/40 text-red-400 hover:bg-red-500/10',
    pay:     'border-blue-500/40 text-blue-400 hover:bg-blue-500/10',
    bspay:   'border-purple-500/40 text-purple-400 hover:bg-purple-500/10 bg-purple-500/5',
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
        styleMap
      )}
    >
      {children}
    </button>
  )
}
