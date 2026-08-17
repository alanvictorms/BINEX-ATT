'use client'

/**
 * Cortador de imagem para banners.
 *
 * Aceita qualquer arquivo que o browser saiba decodificar e SEMPRE devolve um
 * PNG no formato exato do card. Isso é o ponto: sem recorte, cada arte subia
 * numa proporção diferente e o carrossel virava um festival de imagem
 * esticada ou com barra preta.
 *
 * Implementação em canvas puro, sem dependência nova: arrastar move, o range
 * dá zoom, e o recorte sai do que está visível na moldura.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ZoomIn, Check, Loader2 } from 'lucide-react'

interface ImageCropperProps {
  file: File
  /** Proporção largura/altura do recorte. Padrão = card do banner (420x64). */
  aspect?: number
  /** Largura final em px; a altura sai da proporção. */
  outputWidth?: number
  onCancel: () => void
  onCropped: (blob: Blob) => void
}

const MOLDURA_W = 420

export function ImageCropper({
  file,
  aspect = 420 / 64,
  outputWidth = 1260, // 3x o card, pra ficar nítido em tela retina
  onCancel,
  onCropped,
}: ImageCropperProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [erro, setErro] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [salvando, setSalvando] = useState(false)
  const arrasto = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const molduraH = Math.round(MOLDURA_W / aspect)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const im = new Image()
    im.onload = () => { setImg(im); setPos({ x: 0, y: 0 }); setZoom(1) }
    im.onerror = () => setErro('Não foi possível ler esta imagem. Tente outro arquivo.')
    im.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Escala mínima que cobre a moldura inteira — impede sobrar buraco nas bordas.
  const escalaBase = img ? Math.max(MOLDURA_W / img.width, molduraH / img.height) : 1
  const escala = escalaBase * zoom

  const limita = useCallback((p: { x: number; y: number }) => {
    if (!img) return p
    const w = img.width * escala
    const h = img.height * escala
    const maxX = Math.max(0, (w - MOLDURA_W) / 2)
    const maxY = Math.max(0, (h - molduraH) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, p.x)),
      y: Math.min(maxY, Math.max(-maxY, p.y)),
    }
  }, [img, escala, molduraH])

  useEffect(() => { setPos(p => limita(p)) }, [limita])

  function onPointerDown(e: React.PointerEvent) {
    arrasto.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    const a = arrasto.current
    if (!a) return
    setPos(limita({ x: a.px + (e.clientX - a.x), y: a.py + (e.clientY - a.y) }))
  }
  function onPointerUp() { arrasto.current = null }

  async function confirmar() {
    if (!img) return
    setSalvando(true)
    try {
      const outH = Math.round(outputWidth / aspect)
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas indisponível')

      // Converte da moldura de preview pro tamanho final.
      const k = outputWidth / MOLDURA_W
      const w = img.width * escala * k
      const h = img.height * escala * k
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, outputWidth / 2 - w / 2 + pos.x * k, outH / 2 - h / 2 + pos.y * k, w, h)

      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
      if (!blob) throw new Error('falha ao gerar imagem')
      onCropped(blob)
    } catch (e: any) {
      setErro(e?.message ?? 'Falha ao recortar')
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-[520px] rounded-2xl border border-[#1B2735] bg-[#0A101A] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-white">Ajustar imagem</h3>
          <button onClick={onCancel} aria-label="Fechar" className="flex h-7 w-7 items-center justify-center rounded-full text-[#7E8DA2] hover:bg-white/10 hover:text-white">
            <X size={15} />
          </button>
        </div>

        {erro ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">{erro}</p>
        ) : (
          <>
            <p className="mb-3 text-[12px] text-[#7E8DA2]">
              Arraste para posicionar e use o zoom. O recorte segue o formato do card.
            </p>

            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="relative mx-auto touch-none overflow-hidden rounded-lg border border-[#2A3A4D] bg-[#060A11]"
              style={{ width: MOLDURA_W, maxWidth: '100%', height: molduraH, cursor: 'grab' }}
            >
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: '50%', top: '50%',
                    width: img.width * escala,
                    height: img.height * escala,
                    transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
                    maxWidth: 'none',
                  }}
                />
              )}
              {!img && (
                <div className="flex h-full items-center justify-center text-[12px] text-[#7E8DA2]">Carregando…</div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <ZoomIn size={15} className="shrink-0 text-[#7E8DA2]" />
              <input
                type="range" min={1} max={4} step={0.01}
                value={zoom}
                onChange={e => setZoom(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-[#1D5FE0]"
                aria-label="Zoom"
              />
            </div>

            <div className="mt-5 flex gap-2">
              <button onClick={onCancel} className="flex-1 rounded-lg border border-[#1B2735] py-2.5 text-[13px] font-semibold text-[#AEBBCB] hover:bg-white/5">
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={!img || salvando}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1D5FE0] py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Usar imagem
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
