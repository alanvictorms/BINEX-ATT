'use client'

/**
 * Carrossel de banners de promoção/evento/bônus na barra da tela de trade.
 *
 * Ocupa o lugar do antigo card "Notícias importantes", que era estático e nunca
 * mostrou notícia nenhuma — dizia sempre "Nenhum evento de alto impacto agora".
 *
 * Dois formatos, de propósito:
 *   text   mantém o desenho do card antigo (ícone + título + linha de apoio),
 *          então banner de texto continua parecendo parte da interface.
 *   image  preenche o card inteiro, sem padding, pro criativo mandar no visual.
 *
 * Sem banner cadastrado o componente não renderiza nada: card vazio ocupando
 * 420px é pior que espaço livre.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export interface PromoBanner {
  id: string
  type: 'text' | 'image'
  title?: string
  subtitle?: string
  imageUrl?: string
  href?: string
  /**
   * O que o clique faz. Ausente = regra antiga (tem href, vira link), pra banner
   * já cadastrado continuar se comportando igual sem ninguém reeditar.
   */
  action?: 'none' | 'link' | 'deposit'
  enabled?: boolean
}

const ROTATE_MS = 6000

export function PromoBanners({
  className, onDeposit,
}: { className?: string; onDeposit?: () => void }) {
  const [banners, setBanners] = useState<PromoBanner[]>([])
  const [index, setIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_promo_banners')
      if (error) return
      const list = Array.isArray(data) ? (data as PromoBanner[]) : []
      setBanners(list.filter(b => b?.enabled !== false && (b?.type === 'image' ? !!b.imageUrl : !!b.title)))
    } catch { /* banner é enfeite: falha silenciosa, nunca derruba a tela */ }
  }, [])

  useEffect(() => { load() }, [load])

  // Reinicia o ciclo quando a lista muda, senão o índice pode ficar fora do range.
  useEffect(() => {
    setIndex(0)
    if (timerRef.current) clearInterval(timerRef.current)
    if (banners.length > 1) {
      timerRef.current = setInterval(() => setIndex(i => (i + 1) % banners.length), ROTATE_MS)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [banners])

  if (banners.length === 0) return null

  const b = banners[Math.min(index, banners.length - 1)]
  const action = b.action ?? (b.href ? 'link' : 'none')
  // Só vira botão se o pai souber abrir o depósito — banner marcado como
  // 'deposit' numa tela sem modal fica inerte em vez de clicar e não fazer nada.
  const abreDeposito = action === 'deposit' && !!onDeposit
  const abreLink     = action === 'link' && !!b.href

  const inner = b.type === 'image' ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={b.imageUrl}
      alt={b.title ?? 'Promoção'}
      className="h-full w-full object-cover"
      draggable={false}
    />
  ) : (
    <div className="flex h-full w-full items-center gap-3.5 px-4 py-[13px]">
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-[#1E2A39] bg-[#101825] text-[#6C9CF8]">
        <Megaphone size={18} />
      </span>
      <div className="flex min-w-0 flex-col gap-[7px] leading-none">
        <span className="truncate text-[12.5px] font-bold text-[#E4EBF5]">{b.title}</span>
        {b.subtitle && <span className="truncate text-[12px] text-[#7E8DA2]">{b.subtitle}</span>}
      </div>
    </div>
  )

  return (
    <section
      className={cn(
        'relative h-[64px] w-[420px] shrink-0 overflow-hidden rounded-xl border border-[#141C28] bg-[#0A101A]',
        className,
      )}
    >
      {abreDeposito ? (
        <button
          type="button"
          onClick={onDeposit}
          className="block h-full w-full cursor-pointer text-left"
        >
          {inner}
        </button>
      ) : abreLink ? (
        <a href={b.href} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
          {inner}
        </a>
      ) : inner}

      {banners.length > 1 && (
        <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Banner ${i + 1}`}
              className={cn(
                'h-[3px] rounded-full transition-all duration-300',
                i === index ? 'w-4 bg-white/80' : 'w-1.5 bg-white/30 hover:bg-white/50',
              )}
            />
          ))}
        </div>
      )}
    </section>
  )
}
