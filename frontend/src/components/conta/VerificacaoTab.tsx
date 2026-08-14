'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { secureStorage, secureDb } from '@/lib/secureClient'
import { useAuthStore } from '@/store/auth'
import {
  ShieldCheck, ShieldAlert, Clock, Upload, X, Loader2, CheckCircle2, XCircle,
  FileImage, Camera, RefreshCw, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const BUCKET = 'kyc-documents'
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

type Submission = {
  id:             string
  status:         'pending' | 'approved' | 'rejected'
  reject_reason:  string | null
  submitted_at:   string
  reviewed_at:    string | null
  doc_front_path: string
  doc_back_path:  string
  selfie_path:    string
}

export function VerificacaoTab() {
  const user = useAuthStore(s => s.user)

  const [latest, setLatest] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)

  // Upload state
  const [front,    setFront]    = useState<File | null>(null)
  const [back,     setBack]     = useState<File | null>(null)
  const [selfie,   setSelfie]   = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error,    setError]    = useState('')

  const loadLatest = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('kyc_submissions')
      .select('id, status, reject_reason, submitted_at, reviewed_at, doc_front_path, doc_back_path, selfie_path')
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setLatest(data as Submission | null)
    setLoading(false)
  }, [user])

  useEffect(() => { loadLatest() }, [loadLatest])

  function reset() {
    setFront(null); setBack(null); setSelfie(null); setError('')
  }

  async function handleSubmit() {
    if (!user) return
    setError('')
    if (!front || !back || !selfie) {
      setError('Envie as 3 imagens antes de continuar.')
      return
    }

    setSubmitting(true)
    try {
      const submissionId = crypto.randomUUID()
      const folder = `${user.id}/${submissionId}`

      async function upload(file: File, kind: 'front' | 'back' | 'selfie') {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${folder}/${kind}.${ext}`
        const { error } = await secureStorage.from(BUCKET).upload(path, file, {
          contentType: file.type,
        })
        if (error) throw error
        return path
      }

      const [frontPath, backPath, selfiePath] = await Promise.all([
        upload(front,  'front'),
        upload(back,   'back'),
        upload(selfie, 'selfie'),
      ])

      const { error: insErr } = await secureDb.from('kyc_submissions').insert({
        id:             submissionId,
        user_id:        user.id,
        doc_front_path: frontPath,
        doc_back_path:  backPath,
        selfie_path:    selfiePath,
        status:         'pending',
      })
      if (insErr) throw insErr

      reset()
      await loadLatest()
    } catch (e: any) {
      const msg = e.message ?? ''
      if (msg.includes('one_pending_per_user') || msg.includes('duplicate')) {
        setError('Você já tem uma verificação em análise. Aguarde a resposta antes de enviar outra.')
      } else {
        setError(msg || 'Erro ao enviar documentos')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[#7E8DA2]"><Loader2 className="animate-spin" /></div>
  }

  // === STATUS APROVADO ===
  if (latest?.status === 'approved') {
    return (
      <CenteredCard>
        <StatusHeader
          icon={<ShieldCheck size={32} className="text-green-400" />}
          color="green"
          title="Verificação aprovada"
          subtitle="Sua conta está verificada. Você pode operar e sacar normalmente."
        />
        <p className="text-[11px] text-[#7E8DA2] mt-6">
          Aprovado em {latest.reviewed_at ? new Date(latest.reviewed_at).toLocaleString('pt-BR') : '—'}
        </p>
      </CenteredCard>
    )
  }

  // === STATUS PENDENTE ===
  if (latest?.status === 'pending') {
    return (
      <CenteredCard>
        <StatusHeader
          icon={<Clock size={32} className="text-blue-400" />}
          color="blue"
          title="Aguardando análise"
          subtitle="Seus documentos foram enviados. Nossa equipe vai analisar em até 24 horas úteis."
        />
        <p className="text-[11px] text-[#7E8DA2] mt-6">
          Enviado em {new Date(latest.submitted_at).toLocaleString('pt-BR')}
        </p>
      </CenteredCard>
    )
  }

  // === REJEITADO ou PRIMEIRA VEZ ===
  const isRejected = latest?.status === 'rejected'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">

        <div className="flex items-start gap-3 mb-6">
          <ShieldAlert size={28} className={cn(isRejected ? 'text-red-400' : 'text-yellow-400', 'flex-shrink-0 mt-0.5')} />
          <div>
            <h1 className="text-xl font-bold text-white">Verificação de identidade (KYC)</h1>
            <p className="text-sm text-[#7E8DA2] mt-1">
              Para sacar fundos, você precisa verificar sua identidade. Envie 3 imagens claras:
            </p>
          </div>
        </div>

        {isRejected && latest && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <div className="flex items-start gap-2 mb-2">
              <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-red-400">Sua verificação anterior foi rejeitada</div>
                {latest.reject_reason && (
                  <div className="text-xs text-[#AEBBCB] mt-1">
                    <span className="font-semibold">Motivo: </span>{latest.reject_reason}
                  </div>
                )}
              </div>
            </div>
            <p className="text-[11px] text-[#7E8DA2] mt-2">Corrija os pontos acima e envie novamente.</p>
          </div>
        )}

        {/* 3 file uploaders */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <FileUploader
            label="Documento (Frente)"
            hint="RG, CNH ou Passaporte"
            icon={<FileImage size={20} />}
            file={front}
            onChange={setFront}
            onError={setError}
          />
          <FileUploader
            label="Documento (Verso)"
            hint="Verso do mesmo documento"
            icon={<FileImage size={20} />}
            file={back}
            onChange={setBack}
            onError={setError}
          />
          <FileUploader
            label="Selfie com Documento"
            hint="Você segurando o documento próximo ao rosto"
            icon={<Camera size={20} />}
            file={selfie}
            onChange={setSelfie}
            onError={setError}
          />
        </div>

        {/* Tips */}
        <div className="mb-6 p-4 rounded-lg bg-[#0C131F] border border-[#16202D]">
          <div className="text-xs font-bold text-white mb-2">Dicas para evitar rejeição:</div>
          <ul className="text-[11px] text-[#AEBBCB] space-y-1 list-disc list-inside">
            <li>Foto nítida, sem reflexos ou cortes</li>
            <li>Documento original (não cópia)</li>
            <li>Todos os dados legíveis</li>
            <li>Selfie: rosto e documento visíveis no mesmo enquadramento</li>
            <li>JPG, PNG, WEBP ou PDF (até 10 MB cada)</li>
          </ul>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || !front || !back || !selfie}
            className="flex-1 h-12 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? <><Loader2 size={14} className="animate-spin" /> Enviando...</>
              : <><Upload size={14} /> Enviar para análise</>
            }
          </button>
          {(front || back || selfie) && !submitting && (
            <button onClick={reset} className="px-4 h-12 rounded-lg border border-[#16202D] text-[#AEBBCB] hover:text-white hover:border-white/30 transition-colors text-sm">
              Limpar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------- helpers ----------------

function FileUploader({
  label, hint, icon, file, onChange, onError,
}: {
  label: string; hint: string; icon: React.ReactNode
  file: File | null
  onChange: (f: File | null) => void
  onError: (msg: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) { setPreview(null); return }
    if (file.type === 'application/pdf') { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handlePick(f: File | undefined | null) {
    if (!f) return
    if (!ACCEPTED.includes(f.type)) {
      onError('Tipo inválido. Use JPG, PNG, WEBP ou PDF.')
      return
    }
    if (f.size > MAX_SIZE) {
      onError(`Arquivo muito grande (${(f.size / 1024 / 1024).toFixed(1)}MB). Máximo: 10MB.`)
      return
    }
    onError('')
    onChange(f)
  }

  return (
    <div>
      <div className="text-xs font-semibold text-white mb-2">{label}</div>
      <button
        onClick={() => ref.current?.click()}
        className={cn(
          'w-full aspect-[4/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors relative overflow-hidden group',
          file
            ? 'border-green-500/40 bg-green-500/5'
            : 'border-[#1B2735] bg-[#060A11] hover:border-blue-500/50 hover:bg-blue-500/5'
        )}
      >
        {file && preview ? (
          <>
            <img src={preview} alt={label} className="w-full h-full object-contain" />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-bold flex items-center gap-1.5">
                <RefreshCw size={12} /> Trocar
              </span>
            </div>
          </>
        ) : file && file.type === 'application/pdf' ? (
          <div className="text-center px-3">
            <FileImage size={28} className="text-green-400 mx-auto mb-1" />
            <div className="text-xs font-semibold text-white truncate max-w-[140px]">{file.name}</div>
            <div className="text-[10px] text-[#7E8DA2] mt-1">{(file.size / 1024).toFixed(0)} KB · PDF</div>
          </div>
        ) : (
          <>
            <div className="text-[#7E8DA2] group-hover:text-blue-400 transition-colors">{icon}</div>
            <div className="text-xs font-semibold text-white">Clique para enviar</div>
            <div className="text-[10px] text-[#7E8DA2] px-3 text-center">{hint}</div>
          </>
        )}
      </button>

      {file && (
        <button
          onClick={() => onChange(null)}
          className="mt-1 text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
        >
          <X size={10} /> Remover
        </button>
      )}

      <input
        ref={ref}
        type="file"
        accept={ACCEPTED.join(',')}
        onChange={(e) => handlePick(e.target.files?.[0])}
        className="hidden"
      />
    </div>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#0C131F] border border-[#16202D] rounded-xl p-8 text-center">
        {children}
      </div>
    </div>
  )
}

function StatusHeader({ icon, color, title, subtitle }: { icon: React.ReactNode; color: 'green' | 'blue' | 'red'; title: string; subtitle: string }) {
  const ringMap = { green: 'bg-green-500/10', blue: 'bg-blue-500/10', red: 'bg-red-500/10' } as const
  return (
    <>
      <div className={cn('w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4', ringMap[color])}>
        {icon}
      </div>
      <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
      <p className="text-sm text-[#AEBBCB]">{subtitle}</p>
    </>
  )
}
