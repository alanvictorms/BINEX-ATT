'use client'

import { useState, useMemo, useEffect } from 'react'
import { X, Search, Star, ChevronUp, ChevronDown } from 'lucide-react'
import { ASSETS, DEFAULT_FAVORITES, getOTCPrice, type Asset } from '@/lib/mockData'
import { disabledRealAssetIds } from '@/lib/marketAssets'
import { cn } from '@/lib/utils'
import { FlagPair } from '@/components/ui/FlagPair'
import { isRealMarket, getMarketSource } from '@/lib/marketSymbols'
import { isMarketOpen } from '@/lib/marketHours'
import { useOtcSessions } from '@/lib/useOtcSessions'
import { isOtcServerAuthoritative } from '@/lib/otcClient'

interface AssetSelectorModalProps {
  selectedAsset: Asset
  onSelect: (asset: Asset) => void
  onClose: () => void
  /** Layout mobile fullscreen (overlay fixo cobrindo toda a viewport) */
  mobile?: boolean
}

type Category = 'Moedas' | 'Cripto' | 'Matérias-Primas' | 'Ações'

const CATEGORIES: Category[] = ['Moedas', 'Cripto', 'Matérias-Primas', 'Ações']

export function AssetSelectorModal({ selectedAsset, onSelect, onClose, mobile = false }: AssetSelectorModalProps) {
  const [activeCategory, setActiveCategory] = useState<Category>('Moedas')
  const [search, setSearch] = useState('')
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('asset_favorites')
        if (saved) return new Set(JSON.parse(saved))
      } catch {}
    }
    return new Set<string>()
  })

  // Janelas de sessão dos pares OTC — sem isto a lista mostraria como aberto um
  // par que o servidor recusa (Admin → OTC → Sessão).
  useOtcSessions()

  // Mudança 24h DE VERDADE (os valores da lista estática eram decorativos e
  // congelados — BTC mostrava +0.49% pra sempre e OTC +0.00%). Feeds reais vêm
  // de /api/market/change24h (Binance oficial + velas próprias do forex); OTC é
  // calculada aqui da própria série sintética determinística (mesma do gráfico).
  const [chg24h, setChg24h] = useState<Record<string, number>>({})
  useEffect(() => {
    const BRT_OFFSET = -3 * 3600
    const now = Math.floor(Date.now() / 1000) + BRT_OFFSET
    const otc: Record<string, number> = {}
    for (const a of ASSETS) {
      if (a.type !== 'OTC') continue
      const cur = getOTCPrice(a.id, now, a.price)
      const ago = getOTCPrice(a.id, now - 86_400, a.price)
      if (ago > 0) otc[a.id] = ((cur - ago) / ago) * 100
    }
    setChg24h(otc)
    fetch('/api/market/change24h')
      .then(r => r.json())
      .then((real: Record<string, number>) => {
        if (real && typeof real === 'object') setChg24h(prev => ({ ...prev, ...real }))
      })
      .catch(() => { /* vitrine: fica com estático/OTC */ })
  }, [])

  const filtered = useMemo(() => {
    return ASSETS
      .filter((a) => {
        if (disabledRealAssetIds.has(a.id)) return false
        if (a.category !== activeCategory) return false
        if (showFavOnly && !favorites.has(a.id)) return false
        if (search && !a.symbol.toLowerCase().includes(search.toLowerCase())) return false
        return true
      })
      .sort((a, b) => {
        // 1) OTC server-authoritative (LIVE) primeiro
        const aLive = a.type === 'OTC' && isOtcServerAuthoritative(a.id)
        const bLive = b.type === 'OTC' && isOtcServerAuthoritative(b.id)
        if (aLive && !bLive) return -1
        if (!aLive && bLive) return 1
        // 2) OTC depois (fallback client-side)
        if (a.type === 'OTC' && b.type !== 'OTC') return -1
        if (a.type !== 'OTC' && b.type === 'OTC') return 1
        // 3) Dentro do mesmo grupo, ordenar por payout desc
        return b.payout - a.payout
      })
  }, [activeCategory, search, showFavOnly, favorites])

  function toggleFavorite(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setFavorites((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      if (typeof window !== 'undefined') {
        localStorage.setItem('asset_favorites', JSON.stringify([...next]))
      }
      return next
    })
  }

  const body = (
    <>
      {/* Panel header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#16202D] px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[16px] font-bold leading-none text-white">Selecione o par de negociação</h2>
        </div>
        <button
          data-testid="asset-selector-close"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#7E8DA2] transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
      <div className="pt-3" />

      {/* Category tabs */}
      <div className="flex items-center gap-1 px-4 pb-3">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-colors',
              activeCategory === cat
                ? 'bg-blue-600 text-white'
                : 'text-[#7E8DA2] hover:text-white hover:bg-white/5'
            )}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Search + favorites */}
      <div className="flex items-center gap-2 px-4 pb-3">
        {/* Favorites toggle */}
        <button
          onClick={() => setShowFavOnly((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-bold flex-shrink-0 transition-colors',
            showFavOnly
              ? 'border-yellow-500/60 bg-yellow-500/10 text-yellow-400'
              : 'border-[#16202D] text-[#7E8DA2] hover:border-yellow-500/40 hover:text-yellow-400'
          )}
        >
          <Star size={13} className={showFavOnly ? 'fill-yellow-400 text-yellow-400' : ''} />
          <span>{favorites.size}</span>
        </button>

        {/* Search */}
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E8DA2]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar"
            className="w-full h-9 bg-[#0C131F] border border-[#16202D] rounded-lg pl-8 pr-3 text-sm text-white placeholder-[#7E8DA2] outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_100px_90px_80px] px-4 pb-1">
        <div className="text-[11px] text-[#7E8DA2]">Nome</div>
        <div className="text-[11px] text-[#7E8DA2]">Mudança 24h</div>
        <div className="flex items-center gap-0.5 text-[11px] text-[#7E8DA2]">
          Lucro 1+ min
          <ChevronDown size={10} />
        </div>
        <div className="text-[11px] text-[#7E8DA2]">5+ min</div>
      </div>

      {/* Asset list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#7E8DA2]">
            Nenhum ativo encontrado
          </div>
        ) : (
          filtered.map((asset, index) => {
            const isActive = asset.id === selectedAsset.id
            const isFav = favorites.has(asset.id)
            const pct24h = chg24h[asset.id] ?? asset.change24h
            const isUp = pct24h >= 0
            const prevAsset = filtered[index - 1]
            const isLive = asset.type === 'OTC' && isOtcServerAuthoritative(asset.id)
            const prevIsLive = prevAsset?.type === 'OTC' && isOtcServerAuthoritative(prevAsset.id)
            const showGroupDivider = false
            // Rótulo por TIPO real do ativo — antes tudo que não era OTC virava
            // "Forex", e o BTC da Binance aparecia listado debaixo de FOREX.
            const groupLabel =
              asset.type === 'OTC'      ? 'OTC'
              : asset.type === 'Crypto' ? 'Cripto (Binance)'
              : 'Forex (ao vivo)'
            const marketOpen = isMarketOpen(asset)

            return (
              <div key={asset.id}>
                {showGroupDivider && (
                  <div className="px-4 py-2 bg-[#0E1620] border-y border-[#16202D]">
                    <span className={cn(
                      'text-[10px] font-bold tracking-widest uppercase',
                      isLive ? 'text-green-400' : 'text-[#7E8DA2]'
                    )}>
                      {groupLabel}
                    </span>
                  </div>
                )}
              <div
                onClick={() => { onSelect(asset); onClose() }}
                className={cn(
                  'grid grid-cols-[1fr_100px_90px_80px] items-center px-4 py-2.5 cursor-pointer transition-colors border-b border-[#1e2235]',
                  isActive ? 'bg-[#101825]' : 'hover:bg-white/5',
                  !marketOpen && 'opacity-50'
                )}
              >
                {/* Name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={(e) => toggleFavorite(asset.id, e)}
                    className="flex-shrink-0 transition-colors"
                  >
                    <Star
                      size={14}
                      className={isFav ? 'fill-yellow-400 text-yellow-400' : 'text-[#1B2735] hover:text-yellow-400'}
                    />
                  </button>
                  <FlagPair code1={asset.code1} code2={asset.code2} size={22} />
                  <span className="text-sm font-semibold text-white truncate">{asset.symbol}</span>
                  {!marketOpen && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 leading-none bg-red-500/15 text-red-400 border border-red-500/30">
                      FECHADO
                    </span>
                  )}
                  {marketOpen && isRealMarket(asset.id) && getMarketSource(asset.id) === 'binance' ? (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 leading-none bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                      BINANCE
                    </span>
                  ) : marketOpen && asset.type === 'OTC' && (
                    isOtcServerAuthoritative(asset.id) ? (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 leading-none bg-green-500/15 text-green-400 border border-green-500/30">
                        OTC
                      </span>
                    ) : (
                      <span className="text-[9px] text-[#7E8DA2] border border-[#1B2735] px-1 py-0.5 rounded flex-shrink-0">OTC</span>
                    )
                  )}
                </div>

                {/* 24h change */}
                <div className={cn('flex items-center gap-1 text-xs font-semibold', isUp ? 'text-green-400' : 'text-red-400')}>
                  {isUp ? <ChevronUp size={12} className="flex-shrink-0" /> : <ChevronDown size={12} className="flex-shrink-0" />}
                  {isUp ? '+' : ''}{pct24h.toFixed(2)}%
                </div>

                {/* Payout 1min */}
                <div className="text-sm font-bold text-orange-400">{asset.payout}%</div>

                {/* Payout 5min */}
                <div className="text-sm font-bold text-orange-400">{asset.payout5min}%</div>
              </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )

  if (mobile) {
    return <div className="fixed inset-0 z-50 flex flex-col bg-[#0A101A]">{body}</div>
  }

  return (
    <div
      data-testid="asset-selector-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#03060B]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-[#1B2735] bg-[#0A101A] shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      >
        {body}
      </div>
    </div>
  )
}
