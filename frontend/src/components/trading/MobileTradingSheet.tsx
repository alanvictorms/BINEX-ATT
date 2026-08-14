'use client'

import React, { useRef, useState } from 'react'
import { ChevronUp, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react'
import { type Asset, type ActiveTrade } from '@/lib/mockData'
import { FlagPair } from '@/components/ui/FlagPair'
import { TradingPanel, type TradingPanelHandle } from './TradingPanel'
import { cn } from '@/lib/utils'
import { useIsPhoneLandscape } from '@/lib/useIsMobile'

interface MobileTradingSheetProps {
  asset: Asset
  oneClickTrade?: boolean
  shortLabels?: boolean
  accountId?: string
  onTradeOpened?: (trade: ActiveTrade) => void
  onTradeExpired?: (id: string) => void
  livePrice?: number | null
  livePriceRef?: React.MutableRefObject<number | null>
  /** Disparado quando o usuário toca no chip do ativo (abre seletor de paridade) */
  onAssetTap?: () => void
  /** Repassado ao TradingPanel: só a layout ativa mostra o popup de resultado */
  showResultPopup?: boolean
}

export function MobileTradingSheet({
  asset,
  oneClickTrade = true,
  shortLabels = true,
  accountId,
  onTradeOpened,
  onTradeExpired,
  livePrice,
  livePriceRef,
  onAssetTap,
  showResultPopup = true,
}: MobileTradingSheetProps) {
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef<TradingPanelHandle>(null)
  const isLandscape = useIsPhoneLandscape()

  // ── Drag state ────────────────────────────────────────────────────────────
  // Altura do sheet enquanto o usuário arrasta — `null` = usa classes Tailwind
  // (84px colapsado / 72vh expandido). Setamos número durante o drag pra seguir o dedo.
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragRef = useRef<{ startY: number; startHeight: number; pointerId: number } | null>(null)

  function collapsedPx() { return 84 }
  function expandedPx() { return Math.round(window.innerHeight * 0.72) }

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Só arraste com dedo/caneta — clique de mouse continua usando onClick
    if (e.pointerType === 'mouse') return
    const startHeight = expanded ? expandedPx() : collapsedPx()
    dragRef.current = { startY: e.clientY, startHeight, pointerId: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDragHeight(startHeight)
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const delta = d.startY - e.clientY // arrasta pra cima = positivo
    const max = Math.round(window.innerHeight * 0.9)
    const next = Math.max(collapsedPx(), Math.min(max, d.startHeight + delta))
    setDragHeight(next)
  }

  function onHandlePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const finalHeight = dragHeight ?? d.startHeight
    // Snap: se passou de 40% da altura expandida, abre; caso contrário fecha
    const threshold = expandedPx() * 0.4
    setExpanded(finalHeight > threshold)
    setDragHeight(null)
    dragRef.current = null
  }

  function quickTrade(direction: 'CALL' | 'PUT') {
    panelRef.current?.placeTrade(direction)
  }

  // ── Landscape: chart cheio + botões flutuantes laterais (estilo Quotex) ───
  if (isLandscape) {
    return (
      // Wrapper md:hidden — garante que MobileTradingSheet nunca aparece em
      // tela desktop (>=768px), mesmo que o JS isMobile demore a resolver ou
      // o container pai esteja visivel por algum bug.
      <div className="md:hidden contents">
        {/* TradingPanel montado mas invisível — preserva estado, timers e ref */}
        <div className="hidden">
          <TradingPanel
            ref={panelRef}
            asset={asset}
            oneClickTrade={oneClickTrade}
            shortLabels={shortLabels}
            mobile
            accountId={accountId}
            onTradeOpened={onTradeOpened}
            onTradeExpired={onTradeExpired}
            livePrice={livePrice}
            livePriceRef={livePriceRef}
            showResultPopup={showResultPopup}
          />
        </div>

        {/* Chip de ativo no canto superior esquerdo (substitui o handle do sheet em paisagem) */}
        <button
          type="button"
          onClick={() => onAssetTap?.()}
          className="fixed top-2 left-2 z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-white/10 active:scale-95 transition-all"
        >
          <FlagPair code1={asset.code1} code2={asset.code2} size={16} />
          <span className="text-xs font-bold text-white">{asset.symbol}</span>
          <span className="text-xs font-bold text-green-400">{asset.payout}%</span>
          <ChevronDown size={11} className="text-[#7E8DA2]" />
        </button>

        {/* Overlay flutuante de CALL/PUT no lado direito */}
        <div className="fixed right-3 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2.5 pointer-events-none">
          <button
            onClick={() => quickTrade('CALL')}
            disabled={livePrice == null}
            className="pointer-events-auto w-14 h-14 rounded-full bg-[#1FD196] hover:bg-[#2bbbad] active:scale-95 shadow-xl shadow-[#1FD196]/30 flex items-center justify-center text-white transition-all disabled:opacity-50"
            aria-label="Compra (preço para cima)"
          >
            <ArrowUp size={26} strokeWidth={2.8} />
          </button>
          <div className="pointer-events-auto self-center px-2 py-1 rounded-md bg-black/60 backdrop-blur text-[10px] font-bold text-white tabular-nums">
            {asset.payout}%
          </div>
          <button
            onClick={() => quickTrade('PUT')}
            disabled={livePrice == null}
            className="pointer-events-auto w-14 h-14 rounded-full bg-[#F0435A] hover:bg-[#f44336] active:scale-95 shadow-xl shadow-[#F0435A]/30 flex items-center justify-center text-white transition-all disabled:opacity-50"
            aria-label="Venda (preço para baixo)"
          >
            <ArrowDown size={26} strokeWidth={2.8} />
          </button>
        </div>
      </div>
    )
  }

  // ── Portrait: sheet tradicional ───────────────────────────────────────────
  const dragging = dragHeight !== null
  return (
    <div
      className={cn(
        // md:hidden — garante que o sheet mobile nunca aparece em desktop,
        // mesmo que o container pai esteja visivel por inconsistencia de estado.
        'md:hidden flex-shrink-0 bg-[#0C131F] border-t border-[#16202D] overflow-hidden flex flex-col',
        // Durante o drag a altura é controlada via inline style — sem transition
        // pra acompanhar o dedo. Fora do drag, transition suaviza o snap.
        !dragging && 'transition-all duration-300',
        !dragging && (expanded ? 'h-[72vh]' : 'h-[84px]')
      )}
      style={dragging ? { height: dragHeight! } : undefined}
    >
      {/* Handle bar — duas zonas tap + drag em qualquer ponto */}
      <div
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerEnd}
        onPointerCancel={onHandlePointerEnd}
        className="flex items-center justify-between px-4 py-2.5 border-b border-[#16202D] flex-shrink-0 relative cursor-grab touch-none select-none"
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-[7px] w-8 h-[3px] bg-[#1B2735] rounded-full pointer-events-none" />

        {/* Zona esquerda: chip do ativo abre seletor de paridade */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (!dragging) onAssetTap?.()
          }}
          className="flex items-center gap-2 px-2 -mx-2 py-1 rounded-md active:bg-white/5"
        >
          <FlagPair code1={asset.code1} code2={asset.code2} size={18} />
          <span className="text-sm font-bold text-white">{asset.symbol}</span>
          <span className="text-sm font-bold text-green-400">{asset.payout}%</span>
          <ChevronDown size={12} className="text-[#7E8DA2]" />
        </button>

        {/* Zona direita: expande/fecha o painel */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (!dragging) setExpanded(v => !v)
          }}
          className="flex items-center gap-1 text-[#7E8DA2] px-2 -mx-2 py-1 rounded-md active:bg-white/5"
        >
          <span className="text-[10px] font-semibold">{expanded ? 'Fechar' : 'Negociar'}</span>
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Collapsed: quick CALL/PUT buttons — escondidos durante o drag pra revelar o painel */}
      {!expanded && !dragging && (
        <div className="flex gap-2 px-3 py-2.5 flex-shrink-0">
          <button
            onClick={() => quickTrade('CALL')}
            className="flex-1 h-10 rounded-xl bg-green-500 hover:bg-green-400 active:scale-[0.98] flex items-center justify-center gap-2 font-bold text-white text-sm transition-all disabled:opacity-50"
            disabled={livePrice == null}
          >
            <span>Compra</span>
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <ArrowUp size={13} strokeWidth={2.5} />
            </div>
          </button>
          <button
            onClick={() => quickTrade('PUT')}
            className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-400 active:scale-[0.98] flex items-center justify-center gap-2 font-bold text-white text-sm transition-all disabled:opacity-50"
            disabled={livePrice == null}
          >
            <span>Venda</span>
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <ArrowDown size={13} strokeWidth={2.5} />
            </div>
          </button>
        </div>
      )}

      {/* TradingPanel sempre montado — preserva estado/timers e expõe placeTrade via ref.
          Esconde via prop `hidden` quando colapsado pra não consumir altura. */}
      <div className={cn('flex-1 overflow-y-auto', !expanded && !dragging && 'hidden')}>
        <TradingPanel
          ref={panelRef}
          asset={asset}
          oneClickTrade={oneClickTrade}
          shortLabels={shortLabels}
          mobile
          accountId={accountId}
          onTradeOpened={onTradeOpened}
          onTradeExpired={onTradeExpired}
          livePrice={livePrice}
          livePriceRef={livePriceRef}
          showResultPopup={showResultPopup}
        />
      </div>
    </div>
  )
}
