'use client'

/**
 * Cadastro dos banners que rodam em carrossel na tela de trade.
 *
 * Dois formatos:
 *   texto   título + linha de apoio, no mesmo desenho do card antigo.
 *   imagem  preenche o card inteiro; o criativo manda no visual.
 *
 * Upload vai direto pro bucket público `banners` do Storage. Público de
 * propósito: é arte de campanha exibida pra qualquer usuário logado, então
 * assinar URL a cada render só somaria latência sem esconder nada.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ImageCropper } from '@/components/admin/ImageCropper'
import {
  Loader2, RefreshCw, Save, Check, Trash2, GripVertical, Upload,
  Image as ImageIcon, Type, AlertTriangle, Eye, EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Acao = 'none' | 'link' | 'deposit'

interface Banner {
  id: string
  type: 'text' | 'image'
  title?: string
  subtitle?: string
  imageUrl?: string
  href?: string
  action?: Acao
  enabled: boolean
}

const MAX_BYTES = 5 * 1024 * 1024

function novoBanner(type: Banner['type']): Banner {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
    type,
    enabled: true,
    action: 'none',
    ...(type === 'text' ? { title: '', subtitle: '' } : { imageUrl: '' }),
  }
}

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [orig, setOrig] = useState<string>('[]')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data, error } = await supabase.rpc('get_promo_banners')
      if (error) throw error
      const raw = Array.isArray(data) ? (data as Banner[]) : []
      // Banner cadastrado antes da ação existir: assume o que ele já fazia (tem
      // link, abre link). Normalizar aqui e no `orig` evita a tela abrir suja.
      const list = raw.map(b => ({ ...b, action: b.action ?? (b.href ? 'link' : 'none') as Acao }))
      setBanners(list)
      setOrig(JSON.stringify(list))
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar banners')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const dirty = JSON.stringify(banners) !== orig

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const { error } = await supabase.rpc('admin_set_config', {
        p_key: 'promoBanners', p_value: banners,
      })
      if (error) throw error
      setOrig(JSON.stringify(banners))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message ?? 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function patch(id: string, p: Partial<Banner>) {
    setBanners(bs => bs.map(b => (b.id === id ? { ...b, ...p } : b)))
  }

  function remove(id: string) {
    if (!confirm('Remover este banner?')) return
    setBanners(bs => bs.filter(b => b.id !== id))
  }

  function move(id: string, dir: -1 | 1) {
    setBanners(bs => {
      const i = bs.findIndex(b => b.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= bs.length) return bs
      const copy = [...bs]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
  }

  // O arquivo escolhido NAO sobe direto: abre o cortador. Sem isso cada arte
  // subia numa proporcao diferente e o carrossel alternava imagem esticada com
  // imagem sobrando barra preta.
  const [cropAlvo, setCropAlvo] = useState<{ id: string; file: File } | null>(null)

  async function upload(id: string, blob: Blob) {
    setError('')
    if (blob.size > MAX_BYTES) { setError('Imagem acima de 5 MB depois do recorte.'); return }
    setUploadingId(id)
    try {
      // Sempre PNG: e o que o cortador devolve, independente do formato de origem.
      const path = `${id}-${Date.now()}.png`
      const { error: upErr } = await supabase.storage
        .from('banners')
        .upload(path, blob, { contentType: 'image/png', upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('banners').getPublicUrl(path)
      patch(id, { imageUrl: data.publicUrl })
    } catch (e: any) {
      setError(e.message ?? 'Falha no upload')
    } finally {
      setUploadingId(null)
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center py-20"><Loader2 className="animate-spin text-[#7E8DA2]" size={22} /></div>
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-white">Banners</h1>
          <p className="mt-2 text-[12.5px] text-[#8B9BB0]">
            Promoções, eventos e bônus que rodam em carrossel na tela de trade.
            Sem banner ativo, o espaço simplesmente não aparece.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 rounded-lg border border-[#1B2735] px-3 py-2 text-[12px] font-semibold text-[#AEBBCB] hover:bg-white/5">
            <RefreshCw size={13} /> Recarregar
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-semibold transition-colors',
              dirty && !saving ? 'bg-[#1D5FE0] text-white' : 'cursor-not-allowed bg-[#1a2030] text-[#6b7280]',
            )}
          >
            {saved ? <Check size={14} /> : saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar'}
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setBanners(bs => [...bs, novoBanner('text')])}
          className="flex items-center gap-2 rounded-lg border border-[#1B2735] bg-[#0C131F] px-3 py-2 text-[12.5px] font-semibold text-[#C3CFDD] hover:border-[#2A3A4D] hover:text-white"
        >
          <Type size={14} /> Novo banner de texto
        </button>
        <button
          onClick={() => setBanners(bs => [...bs, novoBanner('image')])}
          className="flex items-center gap-2 rounded-lg border border-[#1B2735] bg-[#0C131F] px-3 py-2 text-[12.5px] font-semibold text-[#C3CFDD] hover:border-[#2A3A4D] hover:text-white"
        >
          <ImageIcon size={14} /> Novo banner de imagem
        </button>
      </div>

      {banners.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#1B2735] px-4 py-10 text-center text-[13px] text-[#7E8DA2]">
          Nenhum banner cadastrado.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {banners.map((b, i) => (
          <section key={b.id} className="rounded-xl border border-[#16202D] bg-[#0C131F] p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex flex-col text-[#4B5A6E]">
                <button onClick={() => move(b.id, -1)} disabled={i === 0} className="hover:text-white disabled:opacity-20">▲</button>
                <button onClick={() => move(b.id, 1)} disabled={i === banners.length - 1} className="hover:text-white disabled:opacity-20">▼</button>
              </span>
              <GripVertical size={14} className="text-[#2A3A4D]" />
              <span className={cn(
                'rounded-md px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide',
                b.type === 'image' ? 'bg-[#1D5FE0]/15 text-[#6C9CF8]' : 'bg-[#1FD196]/12 text-[#1FD196]',
              )}>
                {b.type === 'image' ? 'Imagem' : 'Texto'}
              </span>
              <span className="text-[11.5px] text-[#7E8DA2]">#{i + 1}</span>

              <button
                onClick={() => patch(b.id, { enabled: !b.enabled })}
                title={b.enabled ? 'Ativo — clique para ocultar' : 'Oculto — clique para ativar'}
                className={cn('ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-semibold',
                  b.enabled ? 'text-[#1FD196] hover:bg-[#1FD196]/10' : 'text-[#7E8DA2] hover:bg-white/5')}
              >
                {b.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                {b.enabled ? 'Ativo' : 'Oculto'}
              </button>
              <button onClick={() => remove(b.id)} className="rounded-md p-1.5 text-[#7E8DA2] hover:bg-red-500/10 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>

            {b.type === 'text' ? (
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Título" value={b.title ?? ''} onChange={v => patch(b.id, { title: v })} placeholder="Bônus de 100% no primeiro depósito" />
                <Campo label="Linha de apoio" value={b.subtitle ?? ''} onChange={v => patch(b.id, { subtitle: v })} placeholder="Válido até domingo" />
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex h-[64px] w-[420px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#1B2735] bg-[#0A1017]">
                  {b.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={b.imageUrl} alt="" className="h-full w-full object-cover" />
                    : <span className="text-[11.5px] text-[#5B6A7E]">Prévia no tamanho real (420 × 64)</span>}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <input
                    ref={el => { fileInputs.current[b.id] = el }}
                    type="file"
                    // image/* aceita qualquer formato que o browser decodifique,
                    // inclusive HEIC do iPhone — o cortador normaliza tudo em PNG.
                    accept="image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setCropAlvo({ id: b.id, file: f }); e.target.value = '' }}
                  />
                  <button
                    onClick={() => fileInputs.current[b.id]?.click()}
                    disabled={uploadingId === b.id}
                    className="flex items-center justify-center gap-2 rounded-lg border border-[#1B2735] bg-[#0A1017] px-3 py-2 text-[12.5px] font-semibold text-[#C3CFDD] hover:border-[#2A3A4D] hover:text-white disabled:opacity-50"
                  >
                    {uploadingId === b.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {uploadingId === b.id ? 'Enviando…' : 'Enviar imagem'}
                  </button>
                  <p className="text-[11px] text-[#6B7A8E]">Qualquer imagem · você recorta no formato do card antes de enviar</p>
                </div>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#9ca3af]">Ao clicar</span>
                <select
                  value={b.action ?? 'none'}
                  onChange={e => patch(b.id, { action: e.target.value as Acao })}
                  className="w-full rounded-lg border border-[#1e2433] bg-[#0d1117] px-3 py-2 text-[13px] text-white outline-none transition-colors focus:border-[#2E6BE6]"
                >
                  <option value="none">Nada — banner só informativo</option>
                  <option value="deposit">Abrir a tela de depósito</option>
                  <option value="link">Abrir um link</option>
                </select>
              </label>

              {b.action === 'link' && (
                <Campo label="Link" value={b.href ?? ''} onChange={v => patch(b.id, { href: v })} placeholder="https://…" />
              )}
            </div>
          </section>
        ))}
      </div>

      {cropAlvo && (
        <ImageCropper
          file={cropAlvo.file}
          onCancel={() => setCropAlvo(null)}
          onCropped={blob => { const alvo = cropAlvo; setCropAlvo(null); upload(alvo.id, blob) }}
        />
      )}
    </div>
  )
}

function Campo({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-[#9ca3af]">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#1e2433] bg-[#0d1117] px-3 py-2 text-[13px] text-white outline-none transition-colors focus:border-[#2E6BE6]"
      />
    </label>
  )
}
