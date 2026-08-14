'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronRight, CheckCircle2, MessageSquare, Plus, HelpCircle, Loader2, AlertCircle, Clock, Hourglass, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { TicketChatView } from '@/components/support/TicketChatView'

type SupportTab = 'solicitacoes' | 'criar' | 'faq'

interface TicketRow {
  id:              string
  subject:         string
  category:        string
  status:          'open' | 'in_progress' | 'resolved' | 'closed'
  priority:        string
  created_at:      string
  last_message_at: string
}

interface MessagePreview {
  body:        string
  sender_type: 'user' | 'admin'
  created_at:  string
}

const CATEGORIES = [
  { value: 'pagamento', label: 'Pagamento (depósitos / saques)' },
  { value: 'trading',   label: 'Trading (operações / mercados)' },
  { value: 'conta',     label: 'Minha conta (cadastro / KYC)' },
  { value: 'tecnico',   label: 'Problema técnico (bug / erro)' },
  { value: 'outros',    label: 'Outros' },
]

const FAQ_ITEMS = [
  { question: 'Como fazer um depósito?',         answer: 'Acesse Depósito no menu superior e escolha PIX. Mínimo R$10,00.' },
  { question: 'Como sacar meu dinheiro?',        answer: 'Acesse Conta → Retirada, informe o valor e sua chave PIX. Sua conta precisa estar verificada (KYC aprovado).' },
  { question: 'O que é conta demo?',             answer: 'Conta com saldo virtual (R$10.000) para praticar sem risco real.' },
  { question: 'Qual o depósito mínimo?',         answer: 'R$10,00 via PIX.' },
  { question: 'Como funciona o payout?',         answer: 'O payout é o percentual de lucro sobre o valor apostado, em caso de acerto.' },
  { question: 'Posso cancelar uma operação?',    answer: 'Operações em aberto podem ser encerradas antecipadamente — o lucro/perda é ajustado proporcionalmente.' },
  { question: 'Quanto tempo demora um saque?',   answer: 'Após aprovação, até 24 horas úteis. Acompanhe na aba Retirada.' },
  { question: 'Como verifico minha conta (KYC)?', answer: 'Acesse Conta → Verificação e envie 3 fotos: documento (frente), documento (verso) e selfie com o documento.' },
]

export function SupportPage() {
  const user = useAuthStore(s => s.user)
  const [tab, setTab]                   = useState<SupportTab>('solicitacoes')
  const [expandedFaq, setExpandedFaq]   = useState<number | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)

  // List state
  const [tickets,  setTickets]  = useState<TicketRow[]>([])
  const [previews, setPreviews] = useState<Record<string, MessagePreview>>({})
  const [loading,  setLoading]  = useState(true)

  // Create form state
  const [subject,    setSubject]    = useState('')
  const [category,   setCategory]   = useState('outros')
  const [firstMsg,   setFirstMsg]   = useState('')
  const [creating,   setCreating]   = useState(false)
  const [createErr,  setCreateErr]  = useState('')

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

    // Carrega última mensagem de cada ticket pra preview
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
          map[(m as any).ticket_id] = {
            body:        (m as any).body,
            sender_type: (m as any).sender_type,
            created_at:  (m as any).created_at,
          }
        }
      }
      setPreviews(map)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (tab === 'solicitacoes' && !selectedTicket) loadTickets()
  }, [tab, selectedTicket, loadTickets])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setCreateErr('')
    if (subject.trim().length < 3)   { setCreateErr('Assunto muito curto.'); return }
    if (firstMsg.trim().length < 5)  { setCreateErr('Descreva o problema com pelo menos 5 caracteres.'); return }

    setCreating(true)
    try {
      const { data: newTicket, error: tErr } = await supabase
        .from('support_tickets')
        .insert({
          user_id:  user.id,
          subject:  subject.trim(),
          category,
          priority: 'medium',
          status:   'open',
        })
        .select('id')
        .single()
      if (tErr) throw tErr

      const { error: mErr } = await supabase.from('support_messages').insert({
        ticket_id:   newTicket.id,
        sender_id:   user.id,
        sender_type: 'user',
        body:        firstMsg.trim(),
      })
      if (mErr) throw mErr

      // Reseta form e abre conversa
      setSubject(''); setCategory('outros'); setFirstMsg('')
      setSelectedTicket(newTicket.id)
      setTab('solicitacoes')
    } catch (e: any) {
      setCreateErr(e.message ?? 'Erro ao criar ticket')
    } finally {
      setCreating(false)
    }
  }

  // Se um ticket está selecionado, mostra o chat
  if (selectedTicket) {
    return <TicketChatView ticketId={selectedTicket} onBack={() => { setSelectedTicket(null); loadTickets() }} />
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0A101A] min-h-0 overflow-hidden">

      {/* Tabs bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#16202D] bg-[#0E1620] flex-shrink-0">
        <div className="flex items-center gap-1">
          {[
            { key: 'solicitacoes', label: 'Minhas solicitações', icon: <MessageSquare size={14} /> },
            { key: 'criar',        label: 'Criar solicitação',    icon: <Plus size={14} /> },
            { key: 'faq',          label: 'Perguntas frequentes', icon: <HelpCircle size={14} /> },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as SupportTab)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                tab === t.key
                  ? 'bg-white text-[#0A101A] font-semibold'
                  : 'text-[#7E8DA2] hover:text-white hover:bg-white/5'
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* Minhas solicitações */}
        {tab === 'solicitacoes' && (
          <div className="px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-[#7E8DA2]">
                <Loader2 className="animate-spin" size={20} />
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <MessageSquare size={40} className="text-[#1B2735]" />
                <p className="text-sm text-[#7E8DA2]">Você ainda não criou nenhuma solicitação</p>
                <button
                  onClick={() => setTab('criar')}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors"
                >
                  Criar primeira solicitação
                </button>
              </div>
            ) : (
              <>
                {/* Table header */}
                <div className="grid grid-cols-[180px_1fr_140px] gap-4 px-4 py-2 mb-1">
                  <span className="text-xs text-[#7E8DA2] font-medium">Solicitação</span>
                  <span className="text-xs text-[#7E8DA2] font-medium">Última mensagem</span>
                  <span className="text-xs text-[#7E8DA2] font-medium">Status</span>
                </div>

                {tickets.map((ticket) => {
                  const preview = previews[ticket.id]
                  return (
                    <div
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket.id)}
                      className="grid grid-cols-[180px_1fr_140px] gap-4 px-4 py-4 rounded-xl bg-[#0E1620] border border-[#16202D] mb-2 hover:border-blue-500/30 transition-colors cursor-pointer"
                    >
                      {/* Ticket ID + date */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#101825] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <MessageSquare size={14} className="text-[#7E8DA2]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{ticket.subject}</div>
                          <div className="text-[10px] text-[#7E8DA2] mt-0.5">
                            #{ticket.id.slice(0, 8)} · {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      </div>

                      {/* Last message preview */}
                      <div className="flex flex-col gap-1 min-w-0">
                        {preview ? (
                          <>
                            <span className={cn(
                              'text-[10px] font-bold w-fit px-2 py-0.5 rounded border',
                              preview.sender_type === 'admin'
                                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            )}>
                              {preview.sender_type === 'admin' ? 'Suporte' : 'Você'}:
                            </span>
                            <div className="text-sm text-[#AEBBCB] truncate">{preview.body}</div>
                            <div className="text-[10px] text-[#7E8DA2]">{new Date(preview.created_at).toLocaleString('pt-BR')}</div>
                          </>
                        ) : (
                          <div className="text-sm text-[#7E8DA2]">—</div>
                        )}
                      </div>

                      {/* Status */}
                      <div className="flex items-center"><StatusBadge status={ticket.status} /></div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* Criar solicitação */}
        {tab === 'criar' && (
          <div className="px-6 py-6 max-w-2xl">
            <h2 className="text-base font-bold text-white mb-1">Nova solicitação</h2>
            <p className="text-xs text-[#7E8DA2] mb-5">Nossa equipe responde em até 24h úteis.</p>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-[#7E8DA2] tracking-wide mb-2 block">ASSUNTO</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  maxLength={140}
                  placeholder="Ex: Meu PIX não caiu na conta"
                  className="w-full h-10 bg-[#0E1620] border border-[#16202D] rounded-lg px-4 text-sm text-white placeholder-[#7E8DA2] outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#7E8DA2] tracking-wide mb-2 block">CATEGORIA</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 bg-[#0E1620] border border-[#16202D] rounded-lg px-4 text-sm text-white outline-none focus:border-blue-500/50 transition-colors cursor-pointer"
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#7E8DA2] tracking-wide mb-2 block">MENSAGEM</label>
                <textarea
                  rows={6}
                  value={firstMsg}
                  onChange={(e) => setFirstMsg(e.target.value)}
                  required
                  placeholder="Descreva detalhadamente o problema ou dúvida. Inclua datas, valores, IDs de transação se aplicável..."
                  className="w-full bg-[#0E1620] border border-[#16202D] rounded-lg px-4 py-3 text-sm text-white placeholder-[#7E8DA2] outline-none focus:border-blue-500/50 transition-colors resize-none"
                />
              </div>

              {createErr && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" /> {createErr}
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-fit px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Enviar solicitação
              </button>
            </form>
          </div>
        )}

        {/* Perguntas frequentes */}
        {tab === 'faq' && (
          <div className="px-6 py-6 max-w-2xl">
            <h2 className="text-base font-bold text-white mb-4">Perguntas frequentes</h2>
            <div className="flex flex-col gap-2">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="bg-[#0E1620] border border-[#16202D] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm font-medium text-white">{item.question}</span>
                    <ChevronRight
                      size={16}
                      className={cn('text-[#7E8DA2] transition-transform flex-shrink-0', expandedFaq === i && 'rotate-90')}
                    />
                  </button>
                  {expandedFaq === i && (
                    <div className="px-4 pb-4 text-sm text-[#7E8DA2] border-t border-[#16202D] pt-3">
                      {item.answer}
                    </div>
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
    open:        { color: 'bg-blue-500/15 text-blue-400 border-blue-500/30',       label: 'Aberto',       icon: <Clock size={10} /> },
    in_progress: { color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', label: 'Em andamento', icon: <Hourglass size={10} /> },
    resolved:    { color: 'bg-green-500/15 text-green-400 border-green-500/30',    label: 'Resolvido',    icon: <CheckCircle2 size={10} /> },
    closed:      { color: 'bg-[#16202D] text-[#AEBBCB] border-[#1B2735]',          label: 'Fechado',      icon: <Lock size={10} /> },
  } as const
  const cfg = (map as any)[status] ?? { color: 'bg-[#16202D] text-[#AEBBCB]', label: status, icon: null }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border', cfg.color)}>
      {cfg.icon}{cfg.label}
    </span>
  )
}
