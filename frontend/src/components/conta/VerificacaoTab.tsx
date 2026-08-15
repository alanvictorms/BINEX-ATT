'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { secureStorage, secureDb } from '@/lib/secureClient'
import { useAuthStore } from '@/store/auth'
import {
  ShieldCheck, ShieldAlert, Clock, Upload, X, Loader2, CheckCircle2, XCircle,
  FileImage, Camera, RefreshCw, AlertCircle, Check, IdCard, ScanFace,
  UploadCloud, Lock, FileCheck2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const BUCKET = 'kyc-documents'
const MAX_SIZE = 10 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

type Submission = { id: string; status: 'pending' | 'approved' | 'rejected'; reject_reason: string | null; submitted_at: string; reviewed_at: string | null; doc_front_path: string; doc_back_path: string; selfie_path: string }

const DOCS = [
  { icon: IdCard, box: 'vx-ibox-blue', title: 'Documento (frente)', sub: 'RG, CNH ou Passaporte' },
  { icon: FileCheck2, box: 'vx-ibox-purple', title: 'Documento (verso)', sub: 'Verso do mesmo documento' },
  { icon: ScanFace, box: 'vx-ibox-green', title: 'Selfie com documento', sub: 'Você segurando o documento' },
]

const TIPS_LIST = [
  'Foto nítida, sem reflexos ou cortes',
  'Documento original (não cópia)',
  'Todos os dados legíveis',
  'Selfie: rosto e documento visíveis no mesmo enquadramento',
  'Formatos aceitos: JPG, PNG, WEBP ou PDF (até 10 MB cada)',
]

const STATUS = [
  { n: 1, title: 'Dados pessoais', state: 'Concluído', done: true },
  { n: 2, title: 'Verificação de identidade', state: 'Em andamento', active: true },
  { n: 3, title: 'Verificação de endereço', state: 'Pendente' },
]

export function VerificacaoTab() {
  const user = useAuthStore(s => s.user)

  const [latest, setLatest] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [front, setFront] = useState<File | null>(null)
  const [back, setBack] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadLatest = useCallback(async () => {
    if (!user) return; setLoading(true)
    const { data } = await supabase.from('kyc_submissions').select('id, status, reject_reason, submitted_at, reviewed_at, doc_front_path, doc_back_path, selfie_path').eq('user_id', user.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle()
    setLatest(data as Submission | null); setLoading(false)
  }, [user])

  useEffect(() => { loadLatest() }, [loadLatest])

  function reset() { setFront(null); setBack(null); setSelfie(null); setError('') }

  async function handleSubmit() {
    if (!user) return; setError('')
    if (!front || !back || !selfie) { setError('Envie as 3 imagens antes de continuar.'); return }
    setSubmitting(true)
    try {
      const submissionId = crypto.randomUUID(); const folder = `${user.id}/${submissionId}`
      async function upload(file: File, kind: string) { const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'; const path = `${folder}/${kind}.${ext}`; const { error } = await secureStorage.from(BUCKET).upload(path, file, { contentType: file.type }); if (error) throw error; return path }
      const [frontPath, backPath, selfiePath] = await Promise.all([upload(front, 'front'), upload(back, 'back'), upload(selfie, 'selfie')])
      const { error: insErr } = await secureDb.from('kyc_submissions').insert({ id: submissionId, user_id: user.id, doc_front_path: frontPath, doc_back_path: backPath, selfie_path: selfiePath, status: 'pending' })
      if (insErr) throw insErr; reset(); await loadLatest()
    } catch (e: any) { setError(e.message?.includes('one_pending') ? 'Você já tem uma verificação em análise.' : e.message || 'Erro ao enviar') }
    finally { setSubmitting(false) }
  }

  const files = [
    { file: front, set: setFront, doc: DOCS[0] },
    { file: back, set: setBack, doc: DOCS[1] },
    { file: selfie, set: setSelfie, doc: DOCS[2] },
  ]

  if (loading) return <div className="flex-1 flex items-center justify-center text-[#7E8DA2]"><Loader2 className="animate-spin" /></div>

  if (latest?.status === 'approved') return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="vx-panel max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-[#1FD196]/10 flex items-center justify-center mb-4"><ShieldCheck size={32} className="text-[#1FD196]" /></div>
        <h2 className="vx-h2 mb-2">Verificação aprovada</h2>
        <p className="vx-sub">Sua conta está verificada. Você pode operar e sacar normalmente.</p>
        <p className="vx-sub-sm mt-6">Aprovado em {latest.reviewed_at ? new Date(latest.reviewed_at).toLocaleString('pt-BR') : '—'}</p>
      </div>
    </div>
  )

  if (latest?.status === 'pending') return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="vx-panel max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-[#2E6BE6]/10 flex items-center justify-center mb-4"><Clock size={32} className="text-[#6C9CF8]" /></div>
        <h2 className="vx-h2 mb-2">Aguardando análise</h2>
        <p className="vx-sub">Seus documentos foram enviados. Nossa equipe vai analisar em até 24 horas úteis.</p>
        <p className="vx-sub-sm mt-6">Enviado em {new Date(latest.submitted_at).toLocaleString('pt-BR')}</p>
      </div>
    </div>
  )

  const isRejected = latest?.status === 'rejected'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-start gap-4 p-5">
        <div className="vx-col min-w-0 flex-1">
          {/* Stepper */}
          <div className="vx-panel flex items-center gap-4 px-6 py-4">
            <div className="flex items-center gap-2.5"><span className="vx-step-done"><Check size={15} strokeWidth={3} /></span><span className="text-[12.5px] font-medium text-[#C3CFDD]">01. Dados pessoais</span></div>
            <span className="h-[2px] flex-1 rounded-full bg-[#1FD196]/70" />
            <div className="flex items-center gap-2.5"><span className="vx-step-active">2</span><span className="text-[12.5px] font-semibold text-white">02. Verificação de identidade</span></div>
            <span className="h-[2px] flex-1 rounded-full bg-[#1B2735]" />
            <div className="flex items-center gap-2.5"><span className="vx-step-idle">3</span><span className="text-[12.5px] font-medium text-[#6B7A8E]">03. Verificação de endereço</span></div>
          </div>

          {isRejected && latest && (
            <div className="vx-panel p-5 border-red-500/30 bg-red-500/5">
              <div className="flex items-start gap-2"><XCircle size={16} className="text-red-400 mt-0.5" /><div><div className="text-[13px] font-bold text-red-400">Verificação anterior rejeitada</div>{latest.reject_reason && <div className="vx-sub mt-1"><strong>Motivo:</strong> {latest.reject_reason}</div>}</div></div>
            </div>
          )}

          {/* Documents */}
          <div className="vx-panel p-6">
            <div className="flex items-start gap-4">
              <span className="vx-ibox-green h-[46px] w-[46px]"><ShieldCheck size={22} /></span>
              <div>
                <h2 className="vx-h1 text-[23px]">Verificação de identidade</h2>
                <p className="vx-sub mt-3">Para sua segurança e conformidade regulatória, precisamos verificar sua identidade.<br />Todos os dados são criptografados e utilizados apenas para validação.</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4">
              {files.map(({ file, set, doc }, i) => {
                const Icon = doc.icon
                return (
                  <div key={i} className="vx-card p-4">
                    <div className="flex items-center gap-3">
                      <span className={doc.box}><Icon size={18} /></span>
                      <span className="leading-none"><span className="block text-[14px] font-semibold text-white">{doc.title}</span><span className="vx-sub-sm mt-2 block">{doc.sub}</span></span>
                    </div>
                    <FileUploader file={file} onChange={set} onError={setError} />
                    <div className="vx-sub-sm mt-3 text-center">JPG, PNG ou PDF (máx. 10 MB)</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tips + protection */}
          <div className="vx-panel grid grid-cols-2 gap-8 p-6">
            <div>
              <h3 className="vx-h3 text-[15px]">Dicas para uma verificação rápida</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {TIPS_LIST.map(t => <li key={t} className="flex items-start gap-2.5"><Check size={14} className="mt-[3px] shrink-0 text-[#1FD196]" strokeWidth={3} /><span className="text-[12.5px] text-[#C3CFDD]">{t}</span></li>)}
              </ul>
            </div>
            <div>
              <h3 className="vx-h3 text-[15px]">Seus dados estão protegidos</h3>
              <div className="mt-4 flex items-start gap-4"><Lock size={22} className="mt-1 shrink-0 text-[#7A8AA0]" /><p className="vx-sub">Suas informações são criptografadas e utilizadas apenas para verificação. Não compartilhamos seus dados com terceiros.</p></div>
            </div>
          </div>

          {error && <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[12px]"><AlertCircle size={13} className="flex-shrink-0 mt-0.5" />{error}</div>}

          <button type="button" onClick={handleSubmit} disabled={submitting || !front || !back || !selfie} className="vx-btn-blue w-full py-[16px] text-[15px] disabled:opacity-50" data-testid="kyc-submit-btn">
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : <><Upload size={18} /> Enviar para análise</>}
          </button>

          <div className="flex items-center justify-center gap-2 pb-1"><ShieldCheck size={14} className="text-[#6B7A8E]" /><span className="vx-sub-sm">Verificação geralmente concluída em até 15 minutos úteis</span></div>
        </div>

        {/* Right column */}
        <div className="vx-col w-[290px] shrink-0">
          <div className="vx-panel p-5">
            <h3 className="vx-h3 text-[16px]">Status da verificação</h3>
            <div className="mt-4 flex flex-col gap-4">
              {STATUS.map(s => (
                <div key={s.n} className="flex items-start gap-3">
                  {s.done ? <span className="vx-step-done h-[22px] w-[22px]"><Check size={13} strokeWidth={3} /></span> : s.active ? <span className="vx-step-active h-[22px] w-[22px] text-[10px]">{s.n}</span> : <span className="vx-step-idle h-[22px] w-[22px] text-[10px]">{s.n}</span>}
                  <span className="leading-none"><span className="block text-[12.5px] font-medium text-[#EAF1FA]">{s.title}</span><span className={`mt-2 block text-[11.5px] ${s.done ? 'text-[#1FD196]' : 'text-[#7E8DA2]'}`}>{s.state}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FileUploader({ file, onChange, onError }: { file: File | null; onChange: (f: File | null) => void; onError: (msg: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => { if (!file || file.type === 'application/pdf') { setPreview(null); return }; const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url) }, [file])

  function handlePick(f: File | undefined | null) {
    if (!f) return; if (!ACCEPTED.includes(f.type)) { onError('Tipo inválido.'); return }; if (f.size > MAX_SIZE) { onError('Arquivo muito grande.'); return }; onError(''); onChange(f)
  }

  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} className={cn('vx-dropzone mt-4 w-full relative overflow-hidden group', file && 'border-[#1FD196]/40 bg-[#1FD196]/5')}>
        {file && preview ? (
          <><img src={preview} alt="" className="w-full h-full object-contain absolute inset-0" /><div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><span className="text-white text-[12px] font-bold flex items-center gap-1"><RefreshCw size={12} /> Trocar</span></div></>
        ) : file?.type === 'application/pdf' ? (
          <div className="text-center"><FileImage size={28} className="text-[#1FD196] mx-auto mb-1" /><div className="text-[12px] font-semibold text-white truncate max-w-[140px]">{file.name}</div></div>
        ) : (
          <><UploadCloud size={22} className="text-[#7A8AA0]" /><span className="mt-1 text-[12.5px] font-medium text-[#C3CFDD]">Clique para enviar</span><span className="vx-sub-sm">ou arraste o arquivo aqui</span></>
        )}
      </button>
      {file && <button onClick={() => onChange(null)} className="mt-1 text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1"><X size={10} /> Remover</button>}
      <input ref={ref} type="file" accept={ACCEPTED.join(',')} onChange={e => handlePick(e.target.files?.[0])} className="hidden" />
    </>
  )
}
