'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { ArrowLeft, Send, Loader2, CheckCircle2, Clock, Lock, Hourglass } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  id:          string
  sender_type: 'user' | 'admin'
  sender_id:   string
  body:        string
  created_at:  string
}

interface Ticket {
  id:        string
  subject:   string
  category:  string
  status:    'open' | 'in_progress' | 'resolved' | 'closed'
  priority:  string
}

interface Props {
  ticketId: string
  onBack:   () => void
}

const CATEGORY_LABEL: Record<string, string> = {
  pagamento: 'Pagamento', trading: 'Trading', conta: 'Conta', tecnico: 'Técnico', outros: 'Outros'
}

export function TicketChatView({ ticketId, onBack }: Props) {
  const user = useAuthStore(s => s.user)

  const [ticket,   setTicket]   = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading,  setLoading]  = useState(true)
  const [reply,    setReply]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  async function load() {
    const [tRes, mRes] = await Promise.all([
      supabase.from('support_tickets').select('id, subject, category, status, priority').eq('id', ticketId).maybeSingle(),
      supabase.from('support_messages').select('id, sender_type, sender_id, body, created_at').eq('ticket_id', ticketId).order('created_at'),
    ])
    if (tRes.data)  setTicket(tRes.data as Ticket)
    if (mRes.data)  setMessages(mRes.data as Message[])
    setLoading(false)
  }

  useEffect(() => { load() }, [ticketId])

  // Real-time: escuta novas mensagens
  useEffect(() => {
    const channel = supabase
      .channel(`ticket:${ticketId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'support_messages',
        filter: `ticket_id=eq.${ticketId}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === (payload.new as any).id)) return prev
          return [...prev, payload.new as Message]
        })
      })
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'support_tickets',
        filter: `id=eq.${ticketId}`,
      }, (payload) => {
        setTicket(prev => prev ? { ...prev, ...(payload.new as any) } : prev)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ticketId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!user || reply.trim().length === 0) return
    setSending(true); setError('')
    try {
      const { error } = await supabase.from('support_messages').insert({
        ticket_id:   ticketId,
        sender_id:   user.id,
        sender_type: 'user',
        body:        reply.trim(),
      })
      if (error) throw error
      setReply('')
    } catch (e: any) {
      setError(e.message ?? 'Erro ao enviar')
    } finally {
      setSending(false)
    }
  }

  if (loading || !ticket) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#7E8DA2]">
        <Loader2 className="animate-spin" size={20} />
      </div>
    )
  }

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'

  return (
    <div className="flex-1 flex flex-col bg-[#0A101A] min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b border-[#16202D] bg-[#0E1620] flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#7E8DA2] hover:text-white hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">{ticket.subject}</div>
          <div className="text-xs text-[#7E8DA2] mt-0.5">
            #{ticket.id.slice(0, 8)} · {CATEGORY_LABEL[ticket.category] ?? ticket.category}
          </div>
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-[#060A11]">
        {messages.length === 0 ? (
          <div className="text-center text-[#7E8DA2] text-xs py-10">Nenhuma mensagem ainda</div>
        ) : messages.map((m) => (
          <Bubble key={m.id} msg={m} userName={user?.name ?? 'Você'} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply */}
      <div className="border-t border-[#16202D] p-3 bg-[#0E1620]">
        {isClosed ? (
          <div className="text-center text-xs text-[#7E8DA2] py-3">
            Este ticket está {ticket.status === 'resolved' ? 'resolvido' : 'fechado'}. Para uma nova questão, crie outro ticket.
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() }
              }}
              placeholder="Digite sua mensagem... (Ctrl+Enter envia)"
              rows={2}
              className="flex-1 bg-[#060A11] border border-[#16202D] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || reply.trim().length === 0}
              className="h-[58px] px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Enviar
            </button>
          </div>
        )}
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>
    </div>
  )
}

function Bubble({ msg, userName }: { msg: Message; userName: string }) {
  const isMe = msg.sender_type === 'user'
  return (
    <div className={cn('flex gap-2', isMe && 'flex-row-reverse')}>
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
        isMe ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
      )}>
        {isMe ? userName.charAt(0).toUpperCase() : 'S'}
      </div>
      <div className={cn('max-w-[75%]', isMe && 'flex flex-col items-end')}>
        <div className={cn(
          'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
          isMe ? 'bg-blue-500/10 border border-blue-500/20 text-white' : 'bg-[#1a1f2e] border border-[#16202D] text-[#AEBBCB]'
        )}>
          {msg.body}
        </div>
        <div className="text-[10px] text-[#7E8DA2] mt-1 px-1">
          {isMe ? 'Você' : 'Suporte'} · {new Date(msg.created_at).toLocaleString('pt-BR')}
        </div>
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
