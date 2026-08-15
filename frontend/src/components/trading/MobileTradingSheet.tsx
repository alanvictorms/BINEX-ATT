'use client'

import React, { useRef } from 'react'
import { ChevronDown, ArrowUp, ArrowDown } from 'lucide-react'
import { type Asset, type ActiveTrade } from '@/lib/mockData'
import { FlagPair } from '@/components/ui/FlagPair'
import { TradingPanel, type TradingPanelHandle } from './TradingPanel'
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
  /** Drawer de Posições/Histórico, controlado pela barra inferior. */
  positionsDrawer?: 'operacoes' | 'historico' | null
  onPositionsDrawerClose?: () => void
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
  positionsDrawer = null,
  onPositionsDrawerClose,
}: MobileTradingSheetProps) {
  const panelRef = useRef<TradingPanelHandle>(null)
  const isLandscape = useIsPhoneLandscape()

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

        {/* Chip de ativo no canto superior esquerdo */}
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

  // ── Portrait: painel fixo, sem sheet ──────────────────────────────────────
  //
  // Antes isto era um sheet arrastável: colapsado mostrava só dois botões de
  // atalho, e "Negociar" subia uma janela de 72vh com o painel real. Ou seja,
  // tempo e investimento — os dois campos que se ajusta a cada operação —
  // ficavam escondidos atrás de um toque extra, e o atalho colapsado duplicava
  // os botões de compra/venda que já existem dentro do painel.
  //
  // Agora o TradingPanel fica sempre visível: Tempo, Valor e Lucro aparecem
  // direto acima dos botões, sem janela nenhuma pra abrir.
  return (
    <div className="md:hidden flex shrink-0 flex-col overflow-hidden border-t border-[#16202D] bg-[#0C131F]">
      {/* Linha do ativo — único ponto de entrada do seletor de paridade no
          portrait, então continua aqui mesmo sem o handle do sheet. */}
      <button
        type="button"
        onClick={() => onAssetTap?.()}
        className="flex shrink-0 items-center gap-2 border-b border-[#16202D] px-4 py-1.5 active:bg-white/5"
      >
        <FlagPair code1={asset.code1} code2={asset.code2} size={16} />
        <span className="text-[13px] font-bold text-white">{asset.symbol}</span>
        <span className="text-[13px] font-bold text-green-400">{asset.payout}%</span>
        <ChevronDown size={12} className="text-[#7E8DA2]" />
      </button>

      <div className="max-h-[38vh] overflow-y-auto">
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
          positionsDrawer={positionsDrawer}
          onPositionsDrawerClose={onPositionsDrawerClose}
        />
      </div>
    </div>
  )
}
