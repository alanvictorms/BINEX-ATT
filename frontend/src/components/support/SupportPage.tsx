'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BadgeCheck, Search, MessageSquare, BookOpen, Headphones, ArrowRight,
  Zap, CheckCircle2, Upload, Send, Bookmark, FileText, ChevronRight,
  ShieldCheck, ChevronDown, Plus, HelpCircle, Loader2, AlertCircle,
  Clock, Hourglass, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { TicketChatView } from '@/components/support/TicketChatView'

type SupportTab = 'solicitacoes' | 'criar' | 'faq'

interface TicketRow { id: string; subject: string; category: string; status: 'open' | 'in_progress' | 'resolved' | 'closed'; priority: string; created_at: string; last_message_at: string }
interface MessagePreview { body: string; sender_type: 'user' | 'admin'; created_at: string }

const CATEGORIES = [
  { value: 'pagamento', label: 'Pagamento (depósitos / saques)' },
  { value: 'trading', label: 'Trading (operações / mercados)' },
  { value: 'conta', label: 'Minha conta (cadastro / KYC)' },
  { value: 'tecnico', label: 'Problema técnico (bug / erro)' },
  { value: 'outros', label: 'Outros' },
]

const FAQ_ITEMS = [
  { question: 'Como fazer um depósito?', answer: 'Acesse Depósito no menu superior e escolha PIX. Mínimo R$10,00.' },
  { question: 'Como sacar meu dinheiro?', answer: 'Acesse Conta → Retirada, informe o valor e sua chave PIX.' },
  { question: 'O que é conta demo?', answer: 'Conta com saldo virtual (R$10.000) para praticar sem risco real.' },
  { question: 'Qual o depósito mínimo?', answer: 'R$10,00 via PIX.' },
  { question: 'Como funciona o payout?', answer: 'O payout é o percentual de lucro sobre o valor apostado.' },
  { question: 'Posso cancelar uma operação?', answer: 'Operações em aberto podem ser encerradas antecipadamente.' },
  { question: 'Quanto tempo demora um saque?', answer: 'Após aprovação, até 24 horas úteis.' },
  { question: 'Como verifico minha conta (KYC)?', answer: 'Acesse Conta → Verificação e envie 3 fotos.' },
]

const TIPS = ['Depósitos', 'Saques', 'Verificação', 'Conta']
const ARTICLES = [
  { title: 'Como funciona o PIX na plataforma', tag: 'Depósitos', time: '5 min de leitura' },
  { title: 'Verificação de conta: passo a passo', tag: 'Conta', time: '7 min de leitura' },
  { title: 'Saques: prazos e informações', tag: 'Saques', time: '4 min de leitura' },
  { title: 'Problemas ao acessar a conta', tag: 'Acesso', time: '3 min de leitura' },
]

export function SupportPage() {
  const user = useAuthStore(s => s.user)
  const [tab, setTab] = useState<SupportTab>('criar')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [previews, setPreviews] = useState<Record<string, MessagePreview>>({})
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('')
  const [firstMsg, setFirstMsg] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')

  const loadTickets = useCallback(async () => {
    if (!user) return; setLoading(true)
    const { data: ts } = await supabase.from('support_tickets').select('id, subject, category, status, priority, created_at, last_message_at').eq('user_id', user.id).order('last_message_at', { ascending: false }).limit(50)
    const rows = (ts ?? []) as TicketRow[]; setTickets(rows)
    if (rows.length > 0) {
      const { data: msgs } = await supabase.from('support_messages').select('ticket_id, body, sender_type, created_at').in('ticket_id', rows.map(r => r.id)).order('created_at', { ascending: false })
      const map: Record<string, MessagePreview> = {}
      for (const m of msgs ?? []) { if (!map[(m as any).ticket_id]) map[(m as any).ticket_id] = { body: (m as any).body, sender_type: (m as any).sender_type, created_at: (m as any).created_at } }
      setPreviews(map)
    }
    setLoading(false)
  }, [user])

  useEffect(() => { if (tab === 'solicitacoes' && !selectedTicket) loadTickets() }, [tab, selectedTicket, loadTickets])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); if (!user) return; setCreateErr('')
    if (subject.trim().length < 3) { setCreateErr('Assunto muito curto.'); return }
    if (firstMsg.trim().length < 5) { setCreateErr('Descreva com pelo menos 5 caracteres.'); return }
    setCreating(true)
    try {
      const { data: newTicket, error: tErr } = await supabase.from('support_tickets').insert({ user_id: user.id, subject: subject.trim(), category: category || 'outros', priority: 'medium', status: 'open' }).select('id').single()
      if (tErr) throw tErr
      const { error: mErr } = await supabase.from('support_messages').insert({ ticket_id: newTicket.id, sender_id: user.id, sender_type: 'user', body: firstMsg.trim() })
      if (mErr) throw mErr
      setSubject(''); setCategory(''); setFirstMsg(''); setSelectedTicket(newTicket.id); setTab('solicitacoes')
    } catch (e: any) { setCreateErr(e.message ?? 'Erro ao criar ticket') } finally { setCreating(false) }
  }

  if (selectedTicket) return <TicketChatView ticketId={selectedTicket} onBack={() => { setSelectedTicket(null); loadTickets() }} />

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#0A101A]" data-testid="support-page">
      <div className="vx-page flex-col m-0 rounded-none border-0">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="vx-h1">Centro de Suporte</h1>
              <BadgeCheck size={19} className="text-[#4B8CF5]" />
            </div>
            <p className="vx-sub mt-3">Estamos aqui para ajudar você a operar com confiança.</p>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 items-start gap-4">
          {/* Left column - channels */}
          <div className="vx-col w-[324px] shrink-0">
            <div className="vx-panel p-3.5">
              {[
                { icon: MessageSquare, title: 'Minhas solicitações', desc: 'Veja e acompanhe suas solicitações.', key: 'solicitacoes' as const },
                { icon: Plus, title: 'Criar solicitação', desc: 'Abra uma nova solicitação.', key: 'criar' as const },
              ].map((c, i) => {
                const Icon = c.icon; const active = tab === c.key
                return (
                  <button key={c.key} type="button" onClick={() => setTab(c.key)}
                    className={cn(active ? 'vx-card-active' : 'border border-transparent', 'flex w-full items-start gap-3 rounded-[10px] p-4 text-left transition-colors duration-200 hover:border-[#2B3D52]', i ? 'mt-1' : '')}>
                    <Icon size={20} className={active ? 'mt-[2px] text-[#6C9CF8]' : 'mt-[2px] text-[#5F8FE8]'} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-white">{c.title}</span>
                      <span className="vx-sub mt-2 block">{c.desc}</span>
                    </span>
                    <span className="vx-icon-btn h-[26px] w-[26px] rounded-full"><ArrowRight size={13} /></span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Center */}
          <div className="min-w-0 flex-1">
            {tab === 'solicitacoes' && (
              loading ? <div className="flex items-center justify-center py-20 text-[#7E8DA2]"><Loader2 className="animate-spin" size={20} /></div> :
              tickets.length === 0 ? <div className="flex flex-col items-center justify-center py-20 gap-3"><MessageSquare size={40} className="text-[#1B2735]" /><p className="vx-sub">Nenhuma solicitação ainda</p><button onClick={() => setTab('criar')} className="vx-btn-blue">Criar primeira solicitação</button></div> :
              <div className="flex flex-col gap-2">{tickets.map(ticket => {
                const preview = previews[ticket.id]
                return (
                  <button key={ticket.id} onClick={() => setSelectedTicket(ticket.id)} className="vx-list-item" data-testid={`ticket-${ticket.id}`}>
                    <span className="vx-ibox h-[34px] w-[34px]"><MessageSquare size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-white truncate">{ticket.subject}</span>
                      {preview && <span className="vx-sub-sm mt-1 block truncate">{preview.sender_type === 'admin' ? 'Suporte: ' : 'Você: '}{preview.body}</span>}
                      <span className="vx-sub-sm mt-1 block">#{ticket.id.slice(0,8)} · {new Date(ticket.created_at).toLocaleDateString('pt-BR')}</span>
                    </span>
                    <StatusBadge status={ticket.status} />
                  </button>
                )
              })}</div>
            )}

            {tab === 'criar' && (
              <>
                <div className="vx-tabs">
                  <button type="button" onClick={() => setTab('solicitacoes')} className="vx-tab">Minhas solicitações</button>
                  <button type="button" className="vx-tab-active">Criar solicitação</button>
                  <button type="button" onClick={() => setTab('faq')} className="vx-tab">Base de conhecimento</button>
                </div>
                <div className="mt-5 flex items-start gap-4">
                  <div className="min-w-0 flex-1"><h2 className="vx-h2">Nova solicitação</h2><p className="vx-sub mt-3">Nossa equipe responde em até 24h úteis.</p></div>
                  <div className="flex shrink-0 items-center gap-6 rounded-[10px] border border-[#2B2350] bg-gradient-to-r from-[#171232] to-[#101a2e] px-5 py-3">
                    <div className="flex items-center gap-2.5"><Zap size={17} className="text-[#A98BFF]" /><span className="leading-none"><span className="vx-sub-sm block">Tempo médio</span><span className="mt-1.5 block text-[14px] font-bold text-white">2h 15m</span></span></div>
                    <div className="flex items-center gap-2.5"><CheckCircle2 size={17} className="text-[#1FD196]" /><span className="leading-none"><span className="vx-sub-sm block">Resolução</span><span className="mt-1.5 block text-[14px] font-bold text-white">98%</span></span></div>
                  </div>
                </div>
                <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-4">
                  <div className="vx-field"><span className="vx-label">Assunto</span><input className="vx-input" placeholder="Ex: Meu PIX não caiu na conta" value={subject} onChange={e => setSubject(e.target.value)} data-testid="support-subject" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="vx-field"><span className="vx-label">Categoria</span><div className="vx-select-wrap"><select className="vx-select" value={category} onChange={e => setCategory(e.target.value)} data-testid="support-category"><option value="">Selecione</option>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select><ChevronDown size={16} className="vx-select-icon" /></div></div>
                    <div className="vx-field"><span className="vx-label">Prioridade</span><div className="vx-select-wrap"><span className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-[#1FD196]" /><select className="vx-select pl-7" defaultValue="Normal"><option>Baixa</option><option>Normal</option><option>Alta</option></select><ChevronDown size={16} className="vx-select-icon" /></div></div>
                  </div>
                  <div className="vx-field"><span className="vx-label">Descrição</span><textarea rows={4} className="vx-textarea" placeholder="Descreva detalhadamente o problema..." value={firstMsg} onChange={e => setFirstMsg(e.target.value)} data-testid="support-message" /><span className="vx-sub-sm">Quanto mais detalhes, mais rápido podemos te ajudar.</span></div>
                  {createErr && <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[12px]"><AlertCircle size={13} className="flex-shrink-0 mt-0.5" />{createErr}</div>}
                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={creating} className="vx-btn-blue px-6 py-[13px]" data-testid="support-submit">{creating ? <Loader2 size={14} className="animate-spin" /> : <Send size={16} />} Enviar solicitação</button>
                    <button type="button" className="vx-btn-ghost px-6 py-[13px]"><Bookmark size={16} /> Salvar como rascunho</button>
                  </div>
                </form>
              </>
            )}

            {tab === 'faq' && (
              <div className="flex flex-col gap-2">{FAQ_ITEMS.map((item, i) => (
                <div key={i} className="vx-card overflow-hidden">
                  <button onClick={() => setExpandedFaq(expandedFaq === i ? null : i)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/3 transition-colors" data-testid={`faq-${i}`}>
                    <span className="text-[13px] font-medium text-[#C3CFDD]">{item.question}</span>
                    <ChevronRight size={15} className={cn('text-[#6B7A8E] transition-transform', expandedFaq === i && 'rotate-90')} />
                  </button>
                  {expandedFaq === i && <div className="px-4 pb-4 vx-sub border-t border-[#16202D] pt-3">{item.answer}</div>}
                </div>
              ))}</div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    open: { color: 'bg-[#2E6BE6]/15 text-[#6C9CF8] border-[#2E6BE6]/30', label: 'Aberto', icon: <Clock size={10} /> },
    in_progress: { color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', label: 'Em andamento', icon: <Hourglass size={10} /> },
    resolved: { color: 'bg-[#1FD196]/15 text-[#1FD196] border-[#1FD196]/30', label: 'Resolvido', icon: <CheckCircle2 size={10} /> },
    closed: { color: 'bg-[#16202D] text-[#AEBBCB] border-[#1B2735]', label: 'Fechado', icon: <Lock size={10} /> },
  }
  const cfg = map[status] ?? { color: 'bg-[#16202D] text-[#AEBBCB]', label: status, icon: null }
  return <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border', cfg.color)}>{cfg.icon}{cfg.label}</span>
}
