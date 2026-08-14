'use client'

import { X, User, Target, FileText, Clock, MapPin, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AuditLogEntry {
  id:           string
  admin_id:     string
  admin_email:  string
  admin_name:   string
  action:       string
  target_type:  string
  target_id:    string | null
  before_data:  any
  after_data:   any
  reason:       string | null
  ip_address:   string | null
  created_at:   string
}

interface Props {
  entry:   AuditLogEntry
  onClose: () => void
}

export function AuditLogDetailsModal({ entry, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-[#0C131F] border border-[#16202D] rounded-xl shadow-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-[#0C131F] border-b border-[#16202D] px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold text-white">Detalhes da Ação</h2>
            <p className="text-xs text-[#7E8DA2] mt-0.5 font-mono">{entry.id}</p>
          </div>
          <button onClick={onClose} className="text-[#7E8DA2] hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3">
            <InfoRow icon={<User size={12} />}     label="Admin"      value={entry.admin_name} sub={entry.admin_email} />
            <InfoRow icon={<Clock size={12} />}    label="Data"       value={new Date(entry.created_at).toLocaleString('pt-BR')} />
            <InfoRow icon={<FileText size={12} />} label="Ação"       value={entry.action} mono />
            <InfoRow icon={<Target size={12} />}   label="Alvo"       value={`${entry.target_type}${entry.target_id ? ' · ' + entry.target_id.slice(0,8) : ''}`} mono />
            {entry.ip_address && <InfoRow icon={<MapPin size={12} />} label="IP" value={entry.ip_address} mono />}
            {entry.target_id  && <InfoRow icon={<Hash size={12} />}   label="Target ID" value={entry.target_id} mono />}
          </div>

          {/* Motivo */}
          {entry.reason && (
            <div className="bg-[#1a1f2e] border border-[#16202D] rounded-lg p-3">
              <div className="text-[10px] font-semibold text-[#7E8DA2] uppercase tracking-wide mb-1">Motivo / Observação</div>
              <div className="text-xs text-white whitespace-pre-wrap">{entry.reason}</div>
            </div>
          )}

          {/* Before / After JSON */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <JsonBlock title="Antes" data={entry.before_data} color="red" />
            <JsonBlock title="Depois" data={entry.after_data} color="green" />
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value, sub, mono }: { icon: React.ReactNode; label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="bg-[#1a1f2e] border border-[#16202D] rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-[#7E8DA2] font-semibold uppercase tracking-wide mb-1">
        {icon}{label}
      </div>
      <div className={cn('text-xs text-white truncate', mono && 'font-mono')}>{value}</div>
      {sub && <div className="text-[10px] text-[#7E8DA2] truncate mt-0.5">{sub}</div>}
    </div>
  )
}

function JsonBlock({ title, data, color }: { title: string; data: any; color: 'red' | 'green' }) {
  const borderColor = color === 'red' ? 'border-red-500/20' : 'border-green-500/20'
  const titleColor  = color === 'red' ? 'text-red-400'      : 'text-green-400'
  return (
    <div className={cn('bg-[#060A11] border rounded-lg overflow-hidden', borderColor)}>
      <div className={cn('px-3 py-2 text-[10px] font-bold uppercase tracking-wide border-b', borderColor, titleColor)}>
        {title}
      </div>
      <pre className="p-3 text-[11px] text-[#AEBBCB] font-mono overflow-x-auto max-h-80">
        {data ? JSON.stringify(data, null, 2) : '—'}
      </pre>
    </div>
  )
}
