'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ChevronRight, CheckCircle2, MessageSquare, Plus, HelpCircle, Loader2,
  AlertCircle, Clock, Hourglass, Lock, BadgeCheck, Search, BookOpen,
  Headphones, ArrowRight, Zap, Upload, Send, Bookmark, FileText,
  ChevronDown, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { TicketChatView } from '@/components/support/TicketChatView'

type SupportTab = 'solicitacoes' | 'criar' | 'faq'

interface TicketRow {
  id: string; subject: string; category: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: string; created_at: string; last_message_at: string
}

interface MessagePreview {
  body: string; sender_type: 'user' | 'admin'; created_at: string
}

const CATEGORIES = [
  { value: 'pagamento', label: 'Pagamento (depósitos / saques)' },
  { value: 'trading', label: 'Trading (operações / mercados)' },
  { value: 'conta', label: 'Minha conta (cadastro / KYC)' },
  { value: 'tecnico', label: 'Problema técnico (bug / erro)' },
  { value: 'outros', label: 'Outros' },
]

const FAQ_ITEMS = [
  { question: 'Como fazer um depósito?', answer: 'Acesse Depósito no menu superior e escolha PIX. Mínimo R$10,00.' },
  { question: 'Como sacar meu dinheiro?', answer: 'Acesse Conta → Retirada, informe o valor e sua chave PIX. Sua conta precisa estar verificada (KYC aprovado).' },
  { question: 'O que é conta demo?', answer: 'Conta com saldo virtual (R$10.000) para praticar sem risco real.' },
  { question: 'Qual o depósito mínimo?', answer: 'R$10,00 via PIX.' },
  { question: 'Como funciona o payout?', answer: 'O payout é o percentual de lucro sobre o valor apostado, em caso de acerto.' },
  { question: 'Posso cancelar uma operação?', answer: 'Operações em aberto podem ser encerradas antecipadamente — o lucro/perda é ajustado proporcionalmente.' },
  { question: 'Quanto tempo demora um saque?', answer: 'Após aprovação, até 24 horas úteis. Acompanhe na aba Retirada.' },
  { question: 'Como verifico minha conta (KYC)?', answer: 'Acesse Conta → Verificação e envie 3 fotos: documento (frente), documento (verso) e selfie com o documento.' },
]

export function SupportPage() {
  const user = useAuthStore(s => s.user)
  const [tab, setTab] = useState<SupportTab>('solicitacoes')
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [previews, setPreviews] = useState<Record<string, MessagePreview>>({})
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('outros')
  const [firstMsg, setFirstMsg] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')

  const loadTickets = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data: ts } = await supabase
      .from('support_tickets')
      .select('id, subject, category, status, priority, created_at, last_message_at')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })
      .limit(50)
    const rows = (ts ?? []) as TicketRow[]
    setTickets(rows)
    if (rows.length > 0) {
      const ids = rows.map(r => r.id)
      const { data: msgs } = await supabase
        .from('support_messages')
        .select('ticket_id, body, sender_type, created_at')
        .in('ticket_id', ids)
        .order('created_at', { ascending: false })
      const map: Record<string, MessagePreview> = {}
      for (const m of msgs ?? []) {
        if (!map[(m as any).ticket_id]) {
          map[(m as any).ticket_id] = { body: (m as any).body, sender_type: (m as any).sender_type, created_at: (m as any).created_at }
        }
      }
      setPreviews(map)
    }
    setLoading(false)
  }, [user])

  useEffect(() => { if (tab === 'solicitacoes' && !selectedTicket) loadTickets() }, [tab, selectedTicket, loadTickets])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setCreateErr('')
    if (subject.trim().length < 3) { setCreateErr('Assunto muito curto.'); return }
    if (firstMsg.trim().length < 5) { setCreateErr('Descreva o problema com pelo menos 5 caracteres.'); return }
    setCreating(true)
    try {
      const { data: newTicket, error: tErr } = await supabase
        .from('support_tickets').insert({ user_id: user.id, subject: subject.trim(), category, priority: 'medium', status: 'open' }).select('id').single()
      if (tErr) throw tErr
      const { error: mErr } = await supabase.from('support_messages').insert({ ticket_id: newTicket.id, sender_id: user.id, sender_type: 'user', body: firstMsg.trim() })
      if (mErr) throw mErr
      setSubject(''); setCategory('outros'); setFirstMsg('')
      setSelectedTicket(newTicket.id); setTab('solicitacoes')
    } catch (e: any) { setCreateErr(e.message ?? 'Erro ao criar ticket') }
    finally { setCreating(false) }
  }

  if (selectedTicket) return <TicketChatView ticketId={selectedTicket} onBack={() => { setSelectedTicket(null); loadTickets() }} />

  return (
    <div className="flex-1 flex flex-col bg-[#0A101A] min-h-0 overflow-hidden" data-testid="support-page">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[20px] font-bold text-white">Centro de Suporte</h1>
          <BadgeCheck size={19} className="text-[#4B8CF5]" />
        </div>
        <p className="text-[12.5px] text-[#7E8DA2] mt-1">Estamos aqui para ajudar você a operar com confiança.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 pb-3 flex-shrink-0">
        {[
          { key: 'solicitacoes', label: 'Minhas solicitações', icon: <MessageSquare size={14} /> },
          { key: 'criar', label: 'Criar solicitação', icon: <Plus size={14} /> },
          { key: 'faq', label: 'Perguntas frequentes', icon: <HelpCircle size={14} /> },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as SupportTab)}
            data-testid={`support-tab-${t.key}`}
            className={cn('flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[12.5px] font-semibold transition-colors',
              tab === t.key ? 'bg-[#101B29] text-white border border-[#2E6BE6]' : 'text-[#7E8DA2] hover:text-white hover:bg-white/5 border border-transparent'
            )}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {/* Solicitações */}
        {tab === 'solicitacoes' && (
          loading ? (
            <div className="flex items-center justify-center py-20 text-[#7E8DA2]"><Loader2 className="animate-spin" size={20} /></div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <MessageSquare size={40} className="text-[#1B2735]" />
              <p className="text-[13px] text-[#7E8DA2]">Você ainda não criou nenhuma solicitação</p>
              <button onClick={() => setTab('criar')} data-testid="support-create-first-btn"
                className="px-4 py-2.5 rounded-[10px] bg-[#2E6BE6] hover:bg-[#3B7BF6] text-white text-[13px] font-semibold transition-colors">
                Criar primeira solicitação
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tickets.map((ticket) => {
                const preview = previews[ticket.id]
                return (
                  <div key={ticket.id} onClick={() => setSelectedTicket(ticket.id)}
                    data-testid={`ticket-row-${ticket.id}`}
                    className="rounded-[10px] bg-[#0C131F] border border-[#1B2735] p-4 hover:border-[#2E6BE6]/40 transition-colors cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-[8px] bg-[#101825] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <MessageSquare size={14} className="text-[#7E8DA2]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[13px] font-semibold text-white truncate">{ticket.subject}</div>
                          <StatusBadge status={ticket.status} />
                        </div>
                        <div className="text-[10px] text-[#7E8DA2] mt-0.5">#{ticket.id.slice(0, 8)} · {new Date(ticket.created_at).toLocaleDateString('pt-BR')}</div>
                        {preview && (
                          <div className="mt-2 text-[12px] text-[#AEBBCB] truncate">{preview.sender_type === 'admin' ? 'Suporte: ' : 'Você: '}{preview.body}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* Criar */}
        {tab === 'criar' && (
          <div className="max-w-2xl">
            <div className="flex items-start gap-4 mb-5">
              <div className="flex-1">
                <h2 className="text-[16px] font-bold text-white">Nova solicitação</h2>
                <p className="text-[12.5px] text-[#7E8DA2] mt-1">Nossa equipe responde em até 24h úteis.</p>
              </div>
              <div className="flex items-center gap-5 rounded-[10px] border border-[#2B2350] bg-gradient-to-r from-[#171232] to-[#101a2e] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Zap size={15} className="text-[#A98BFF]" />
                  <span className="text-[11px] text-[#7E8DA2]">Resposta média</span>
                  <span className="text-[13px] font-bold text-white">2h 15m</span>
                </div>
              </div>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="text-[12px] font-medium text-[#AEBBCB] mb-2 block">Assunto</label>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={140}
                  placeholder="Ex: Meu PIX não caiu na conta" data-testid="support-subject-input"
                  className="w-full h-[42px] bg-[#0C131F] border border-[#1B2735] rounded-[10px] px-4 text-[13px] text-white placeholder-[#7A8AA0] outline-none focus:border-[#2E6BE6] transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-[#AEBBCB] mb-2 block">Categoria</label>
                  <div className="relative">
                    <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="support-category-select"
                      className="w-full h-[42px] bg-[#0C131F] border border-[#1B2735] rounded-[10px] px-4 text-[13px] text-white outline-none focus:border-[#2E6BE6] transition-colors cursor-pointer appearance-none">
                      {CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#0C131F]">{c.label}</option>)}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A8AA0] pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[#AEBBCB] mb-2 block">Prioridade</label>
                  <div className="w-full h-[42px] bg-[#0C131F] border border-[#1B2735] rounded-[10px] px-4 flex items-center text-[13px] text-white">
                    <span className="w-[7px] h-[7px] rounded-full bg-[#1FD196] mr-2" />Normal
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#AEBBCB] mb-2 block">Descrição</label>
                <textarea rows={5} value={firstMsg} onChange={(e) => setFirstMsg(e.target.value)} required
                  placeholder="Descreva detalhadamente o problema ou dúvida..." data-testid="support-message-textarea"
                  className="w-full bg-[#0C131F] border border-[#1B2735] rounded-[10px] px-4 py-3 text-[13px] text-white placeholder-[#7A8AA0] outline-none focus:border-[#2E6BE6] transition-colors resize-none" />
                <span className="text-[11px] text-[#7E8DA2] mt-1 block">Quanto mais detalhes, mais rápido podemos te ajudar.</span>
              </div>
              {createErr && (
                <div className="flex items-start gap-2 p-3 rounded-[10px] bg-red-500/10 border border-red-500/30 text-red-400 text-[12px]">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" /> {createErr}
                </div>
              )}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={creating} data-testid="support-submit-btn"
                  className="px-6 py-[13px] rounded-[10px] bg-[#2E6BE6] hover:bg-[#3B7BF6] text-[13px] font-semibold text-white flex items-center gap-2 disabled:opacity-50 transition-colors">
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Enviar solicitação
                </button>
              </div>
            </form>
          </div>
        )}

        {/* FAQ */}
        {tab === 'faq' && (
          <div className="max-w-2xl">
            <h2 className="text-[16px] font-bold text-white mb-4">Perguntas frequentes</h2>
            <div className="flex flex-col gap-2">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="rounded-[10px] bg-[#0C131F] border border-[#1B2735] overflow-hidden">
                  <button onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    data-testid={`faq-item-${i}`}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/3 transition-colors">
                    <span className="text-[13px] font-medium text-[#C3CFDD]">{item.question}</span>
                    <ChevronRight size={15} className={cn('text-[#6B7A8E] transition-transform flex-shrink-0', expandedFaq === i && 'rotate-90')} />
                  </button>
                  {expandedFaq === i && (
                    <div className="px-4 pb-4 text-[13px] text-[#7E8DA2] border-t border-[#1B2735] pt-3">{item.answer}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map = {
    open: { color: 'bg-[#2E6BE6]/15 text-[#6C9CF8] border-[#2E6BE6]/30', label: 'Aberto', icon: <Clock size={10} /> },
    in_progress: { color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', label: 'Em andamento', icon: <Hourglass size={10} /> },
    resolved: { color: 'bg-[#1FD196]/15 text-[#1FD196] border-[#1FD196]/30', label: 'Resolvido', icon: <CheckCircle2 size={10} /> },
    closed: { color: 'bg-[#16202D] text-[#AEBBCB] border-[#1B2735]', label: 'Fechado', icon: <Lock size={10} /> },
  } as const
  const cfg = (map as any)[status] ?? { color: 'bg-[#16202D] text-[#AEBBCB]', label: status, icon: null }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border', cfg.color)}>
      {cfg.icon}{cfg.label}
    </span>
  )
}
