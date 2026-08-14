'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { notifyEmail } from '@/lib/notifyEmail'
import { X, Loader2, CheckCircle2, XCircle, Clock, ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface KycSubmission {
  id:              string
  user_id:         string
  user_name:       string
  user_email:      string
  status:          'pending' | 'approved' | 'rejected'
  reject_reason:   string | null
  submitted_at:    string
  reviewed_at:     string | null
  doc_front_path:  string
  doc_back_path:   string
  selfie_path:     string
  real_balance:    number   // retornado por admin_list_kyc (saldo real do usuario)
}

interface Props {
  submission: KycSubmission
  onClose:    () => void
  onSaved:    () => void
}

const BUCKET = 'kyc-documents'
const SIGNED_TTL = 300 // 5 min

export function KycReviewModal({ submission, onClose, onSaved }: Props) {
  const [frontUrl,   setFrontUrl]   = useState<string | null>(null)
  const [backUrl,    setBackUrl]    = useState<string | null>(null)
  const [selfieUrl,  setSelfieUrl]  = useState<string | null>(null)
  const [loadingUrls,setLoadingUrls]= useState(true)
  const [busy,       setBusy]       = useState<'approve' | 'reject' | null>(null)
  const [error,      setError]      = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingUrls(true)
      try {
        const paths = [submission.doc_front_path, submission.doc_back_path, submission.selfie_path]
        const results = await Promise.all(
          paths.map(p => supabase.storage.from(BUCKET).createSignedUrl(p, SIGNED_TTL))
        )
        if (cancelled) return
        setFrontUrl( results[0].data?.signedUrl ?? null)
        setBackUrl(  results[1].data?.signedUrl ?? null)
        setSelfieUrl(results[2].data?.signedUrl ?? null)
      } finally {
        if (!cancelled) setLoadingUrls(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [submission.id])

  async function handleApprove() {
    if (!confirm(`Aprovar verificação de ${submission.user_name}?`)) return
    setBusy('approve'); setError('')
    try {
      const { error } = await supabase.rpc('admin_approve_kyc', { p_submission_id: submission.id })
      if (error) throw error
      // E-mail de KYC aprovado (servidor valida o estado antes de enviar)
      notifyEmail('kyc_approved', submission.id)
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Erro ao aprovar')
    } finally {
      setBusy(null)
    }
  }

  async function handleReject() {
    const reason = prompt(
      `Rejeitar verificação de ${submission.user_name}?\n\nDigite o motivo (mín. 5 caracteres) — o usuário verá:`
    )
    if (reason === null) return
    if (reason.trim().length < 5) {
      alert('Motivo obrigatório (mínimo 5 caracteres).')
      return
    }
    setBusy('reject'); setError('')
    try {
      const { error } = await supabase.rpc('admin_reject_kyc', {
        p_submission_id: submission.id,
        p_reason:        reason.trim(),
      })
      if (error) throw error
      // E-mail de KYC rejeitado com o motivo (servidor valida antes de enviar)
      notifyEmail('kyc_rejected', submission.id)
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Erro ao rejeitar')
    } finally {
      setBusy(null)
    }
  }

  const isPending = submission.status === 'pending'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl bg-[#0C131F] border border-[#16202D] rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0C131F] border-b border-[#16202D] px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold text-white">Documentos de {submission.user_name}</h2>
            <p className="text-xs text-[#7E8DA2] mt-0.5">{submission.user_email}</p>
          </div>
          <button onClick={onClose} className="text-[#7E8DA2] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* 3 Imagens */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DocCard title="Documento (Frente)" url={frontUrl} loading={loadingUrls} />
            <DocCard title="Documento (Verso)"  url={backUrl}  loading={loadingUrls} />
            <DocCard title="Selfie com Documento" url={selfieUrl} loading={loadingUrls} />
          </div>

          {/* Footer status + actions */}
          <div className="mt-6 pt-4 border-t border-[#16202D] flex items-center justify-between flex-wrap gap-3">
            <StatusBadge status={submission.status} reason={submission.reject_reason} />

            {isPending && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReject}
                  disabled={busy !== null}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#16202D] hover:border-red-500/50 text-[#AEBBCB] hover:text-red-400 transition-colors text-sm font-semibold disabled:opacity-50"
                >
                  {busy === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Rejeitar
                </button>
                <button
                  onClick={handleApprove}
                  disabled={busy !== null}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-400 text-white text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {busy === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Aprovar
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
        </div>
      </div>
    </div>
  )
}

function DocCard({ title, url, loading }: { title: string; url: string | null; loading: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold text-white mb-2">{title}</div>
      <div className="aspect-[4/3] bg-[#060A11] border border-[#16202D] rounded-lg overflow-hidden flex items-center justify-center">
        {loading ? (
          <Loader2 className="animate-spin text-[#7E8DA2]" size={20} />
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
            <img src={url} alt={title} className="w-full h-full object-contain hover:opacity-90 transition-opacity cursor-zoom-in" />
          </a>
        ) : (
          <div className="flex flex-col items-center gap-1 text-[#6b7280]">
            <ImageOff size={20} />
            <span className="text-[10px]">Arquivo não encontrado</span>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status, reason }: { status: string; reason: string | null }) {
  if (status === 'pending') {
    return (
      <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold">
        <Clock size={14} /> Aguardando análise
      </div>
    )
  }
  if (status === 'approved') {
    return (
      <div className="flex items-center gap-2 text-green-400 text-xs font-semibold">
        <CheckCircle2 size={14} /> Aprovado
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 text-red-400 text-xs">
      <XCircle size={14} className="flex-shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold">Rejeitado</div>
        {reason && <div className="text-[#AEBBCB] mt-0.5">Motivo: {reason}</div>}
      </div>
    </div>
  )
}
