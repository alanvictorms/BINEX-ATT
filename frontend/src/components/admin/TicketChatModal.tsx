'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  X, Loader2, Send, ChevronDown, CheckCircle2, Clock, Lock, ShieldCheck, ShieldAlert,
  Zap, Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  id:          string
  sender_type: 'user' | 'admin'
  sender_id:   string
  body:        string
  created_at:  string
}

interface Ticket {
  id:              string
  user_id:         string
  user_name:       string
  user_email:      string
  kyc_status:      string
  subject:         string
  category:        string
  status:          'open' | 'in_progress' | 'resolved' | 'closed'
  priority:        'low' | 'medium' | 'high' | 'urgent'
  created_at:      string
  last_message_at: string
}

interface Props {
  ticketId: string
  onClose:  () => void
  onChanged: () => void
}

const TEMPLATES = [
  { label: 'Saque em análise',     body: 'Olá! Seu saque está em análise e será processado em até 24h úteis. Caso precise de qualquer informação adicional, estamos à disposição.' },
  { label: 'Depósito confirmado',  body: 'Olá! Confirmamos o recebimento do seu depósito. O valor já está disponível na sua conta. Bons trades!' },
  { label: 'Verificação KYC',      body: 'Para liberar saques, você precisa enviar seus documentos de verificação. Acesse Conta → Verificação e siga o passo a passo. Qualquer dúvida, estamos aqui.' },
  { label: 'Aguardando informações', body: 'Para podermos seguir com o seu pedido, precisamos de mais informações. Pode nos enviar mais detalhes?' },
  { label: 'Resolvido',            body: 'Tudo certo! Marquei seu ticket como resolvido. Se precisar de algo mais, é só abrir um novo. Obrigado!' },
]

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'trading',   label: 'Trading' },
  { value: 'conta',     label: 'Conta' },
  { value: 'tecnico',   label: 'Técnico' },
  { value: 'outros',    label: 'Outros' },
]

const PRIORITIES: { value: string; label: string }[] = [
  { value: 'low',    label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high',   label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
]

const STATUSES: { value: string; label: string }[] = [
  { value: 'open',        label: 'Aberto' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'resolved',    label: 'Resolvido' },
  { value: 'closed',      label: 'Fechado' },
]

export function TicketChatModal({ ticketId, onClose, onChanged }: Props) {
  const [ticket,   setTicket]   = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading,  setLoading]  = useState(true)
  const [reply,    setReply]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [tplOpen,  setTplOpen]  = useState(false)
  const [error,    setError]    = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  async function load() {
    const { data, error } = await supabase.rpc('admin_get_ticket', { p_ticket_id: ticketId })
    if (error) setError(error.message)
    else if (data) {
      setTicket((data as any).ticket as Ticket)
      setMessages(((data as any).messages ?? []) as Message[])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [ticketId])

  useEffect(() => {
    // scroll pro fim quando nova msg chega
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (reply.trim().length === 0) return
    setSending(true); setError('')
    try {
      const { error } = await supabase.rpc('admin_reply_ticket', {
        p_ticket_id: ticketId,
        p_body:      reply.trim(),
      })
      if (error) throw error
      setReply('')
      await load()
      onChanged()
    } catch (e: any) {
      setError(e.message ?? 'Erro ao enviar')
    } finally {
      setSending(false)
    }
  }

  async function handleUpdate(field: 'status' | 'priority' | 'category', value: string) {
    try {
      const params: any = { p_ticket_id: ticketId }
      params[`p_${field}`] = value
      const { error } = await supabase.rpc('admin_update_ticket', params)
      if (error) throw error
      await load()
      onChanged()
    } catch (e: any) {
      alert('Erro: ' + e.message)
    }
  }

  if (loading || !ticket) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
        <Loader2 className="animate-spin text-[#7E8DA2]" size={24} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-[85vh] bg-[#0C131F] border border-[#16202D] rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#16202D] flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-bold text-white truncate">{ticket.subject}</h2>
              {ticket.kyc_status === 'verified'
                ? <span title="KYC verificado"><ShieldCheck size={13} className="text-green-400" /></span>
                : <span title={`KYC ${ticket.kyc_status}`}><ShieldAlert size={13} className="text-yellow-400" /></span>
              }
            </div>
            <div className="text-[11px] text-[#7E8DA2]">
              <span className="text-white font-semibold">{ticket.user_name}</span> · {ticket.user_email}
              <span className="ml-2">· Aberto em {new Date(ticket.created_at).toLocaleString('pt-BR')}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-[#7E8DA2] hover:text-white"><X size={18} /></button>
        </div>

        {/* Meta controls (status/priority/category) */}
        <div className="px-5 py-2 border-b border-[#16202D] bg-[#060A11] flex items-center gap-2 flex-wrap text-xs">
          <ControlSelect label="Status"     value={ticket.status}   options={STATUSES}   onChange={(v) => handleUpdate('status', v)}    />
          <ControlSelect label="Prioridade" value={ticket.priority} options={PRIORITIES} onChange={(v) => handleUpdate('priority', v)}  />
          <ControlSelect label="Categoria"  value={ticket.category} options={CATEGORIES} onChange={(v) => handleUpdate('category', v)}  />
        </div>

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#060A11]">
          {messages.length === 0 ? (
            <div className="text-center text-[#7E8DA2] text-xs py-10">Nenhuma mensagem ainda</div>
          ) : messages.map((m) => (
            <Bubble key={m.id} msg={m} userName={ticket.user_name} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Reply box */}
        <div className="border-t border-[#16202D] p-3 space-y-2 bg-[#0C131F]">
          {/* Templates */}
          <div className="relative">
            <button
              onClick={() => setTplOpen(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Zap size={11} /> Templates de resposta
              <ChevronDown size={10} className={cn('transition-transform', tplOpen && 'rotate-180')} />
            </button>
            {tplOpen && (
              <div className="absolute bottom-full mb-1 left-0 right-0 bg-[#1a1f2e] border border-[#16202D] rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                {TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    onClick={() => { setReply(t.body); setTplOpen(false) }}
                    className="block w-full text-left px-3 py-2 text-xs hover:bg-white/5 border-b border-[#16202D] last:border-0"
                  >
                    <div className="font-semibold text-white">{t.label}</div>
                    <div className="text-[10px] text-[#7E8DA2] mt-0.5 line-clamp-1">{t.body}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() }
              }}
              placeholder="Digite sua resposta... (Ctrl+Enter envia)"
              rows={3}
              className="flex-1 bg-[#060A11] border border-[#16202D] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || reply.trim().length === 0}
              className="h-[72px] px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Enviar
            </button>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      </div>
    </div>
  )
}

function Bubble({ msg, userName }: { msg: Message; userName: string }) {
  const isAdmin = msg.sender_type === 'admin'
  return (
    <div className={cn('flex gap-2', isAdmin && 'flex-row-reverse')}>
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
        isAdmin ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
      )}>
        {isAdmin ? 'A' : userName.charAt(0).toUpperCase()}
      </div>
      <div className={cn('flex-1 max-w-[80%]', isAdmin && 'flex flex-col items-end')}>
        <div className={cn(
          'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
          isAdmin ? 'bg-green-500/10 border border-green-500/20 text-white' : 'bg-[#1a1f2e] border border-[#16202D] text-[#AEBBCB]'
        )}>
          {msg.body}
        </div>
        <div className="text-[10px] text-[#7E8DA2] mt-1 px-1">
          {isAdmin ? 'Você' : userName} · {new Date(msg.created_at).toLocaleString('pt-BR')}
        </div>
      </div>
    </div>
  )
}

function ControlSelect({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[#7E8DA2]">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#1a1f2e] border border-[#16202D] rounded px-2 py-1 text-white text-[11px] outline-none focus:border-blue-500/50 cursor-pointer"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
