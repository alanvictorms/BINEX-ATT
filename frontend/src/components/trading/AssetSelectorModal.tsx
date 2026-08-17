'use client'

import { useState, useMemo, useEffect } from 'react'
import { X, Search, Star, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react'
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

/** Quantos pares a lista "Populares" mostra antes do "Ver todos os ativos". */
const POPULARES = 8
/** Atalhos de favorito no topo — mais que isso vira uma segunda lista, não atalho. */
const MAX_ATALHOS = 4

export function AssetSelectorModal({ selectedAsset, onSelect, onClose, mobile = false }: AssetSelectorModalProps) {
  const [activeCategory, setActiveCategory] = useState<Category>('Moedas')
  const [search, setSearch] = useState('')
  // "Gerenciar" nos favoritos: troca a estrela do atalho por um × de remover, em
  // vez de abrir outra tela só pra desmarcar par.
  const [gerenciando, setGerenciando] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('asset_favorites')
        if (saved) return new Set(JSON.parse(saved))
      } catch {}
    }
    // Conta nova abre com os pares de sempre marcados — a faixa de favoritos
    // vazia no primeiro acesso não ensina nada sobre o que ela faz.
    return new Set<string>(DEFAULT_FAVORITES)
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
    const termo = search.trim().toLowerCase()
    return ASSETS
      .filter((a) => {
        if (disabledRealAssetIds.has(a.id)) return false
        if (a.category !== activeCategory) return false
        // Busca por par ou por nome ("Ouro", "Bitcoin") — o campo promete "ativo
        // ou código", então procurar por "ouro" tem que achar XAU/USD.
        if (termo && !a.symbol.toLowerCase().includes(termo) && !a.label.toLowerCase().includes(termo)) return false
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
  }, [activeCategory, search])

  const atalhos = useMemo(
    () => ASSETS.filter(a =>
      favorites.has(a.id) && a.category === activeCategory && !disabledRealAssetIds.has(a.id),
    ).slice(0, MAX_ATALHOS),
    [favorites, activeCategory],
  )

  // Busca sempre mostra tudo que casou: cortar resultado de busca em 8 esconde
  // justamente o par que a pessoa foi procurar.
  const buscando = search.trim().length > 0
  const visiveis  = buscando || verTodos ? filtered : filtered.slice(0, POPULARES)
  const temMais   = !buscando && filtered.length > POPULARES

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
      {/* Cabeçalho */}
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div>
          <h2 className="text-[17px] font-bold leading-none text-white">Selecionar ativo</h2>
          <p className="mt-2 text-[12px] text-[#7E8DA2]">Descubra oportunidades nos mercados globais</p>
        </div>
        <button
          data-testid="asset-selector-close"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#7E8DA2] transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {/* Busca */}
      <div className="shrink-0 px-5 pb-3.5">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ativo ou código"
            className="h-11 w-full rounded-xl border border-[#1B2735] bg-[#0C131F] pl-4 pr-10 text-[13px] text-white outline-none transition-colors placeholder:text-[#5B6A7E] focus:border-blue-500/50"
          />
          <Search size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#7E8DA2]" />
        </div>
      </div>

      {/* Categorias */}
      <div className="flex shrink-0 items-center gap-1.5 px-5 pb-4">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => { setActiveCategory(cat); setVerTodos(false) }}
            className={cn(
              'rounded-lg px-3.5 py-2 text-[11.5px] font-bold tracking-wide transition-colors',
              activeCategory === cat
                ? 'bg-[#1D5FE0] text-white'
                : 'text-[#7E8DA2] hover:bg-white/5 hover:text-white',
            )}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Favoritos */}
      {atalhos.length > 0 && (
        <div className="shrink-0 px-5 pb-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[13px] font-bold text-white">Favoritos</span>
            <button
              onClick={() => setGerenciando(v => !v)}
              className="text-[12px] font-semibold text-[#4C8DFF] transition-colors hover:text-[#7FB0FF]"
            >
              {gerenciando ? 'Concluir' : 'Gerenciar'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {atalhos.map((a) => {
              const ativo = a.id === selectedAsset.id
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    if (gerenciando) return
                    onSelect(a); onClose()
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    ativo
                      ? 'border-[#2E6BE6] bg-[#12233E]'
                      : 'border-[#16202D] bg-[#0C131F] hover:border-[#243448]',
                  )}
                >
                  <FlagPair code1={a.code1} code2={a.code2} size={20} />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-[12px] font-bold text-white">{a.symbol}</span>
                      {ativo && !gerenciando && <Star size={11} className="shrink-0 fill-yellow-400 text-yellow-400" />}
                    </span>
                    <span className="text-[11.5px] font-bold text-[#1FD196]">{a.payout}%</span>
                  </span>
                  {gerenciando && (
                    <span
                      role="button"
                      aria-label={`Remover ${a.symbol} dos favoritos`}
                      onClick={(e) => toggleFavorite(a.id, e)}
                      className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#7E8DA2] hover:bg-red-500/15 hover:text-red-400"
                    >
                      <X size={12} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Populares */}
      <div className="shrink-0 px-5 pb-2">
        <span className="text-[13px] font-bold text-white">{buscando ? 'Resultados' : 'Populares'}</span>
      </div>
      <div className="grid shrink-0 grid-cols-[1fr_110px_110px_100px] px-5 pb-1.5">
        <div className="text-[11px] text-[#7E8DA2]">Ativo</div>
        <div className="text-[11px] text-[#7E8DA2]">Variação 24h</div>
        <div className="text-[11px] text-[#7E8DA2]">Payout 1+ min</div>
        <div className="text-[11px] text-[#7E8DA2]">Payout 5+ min</div>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        {visiveis.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-[#7E8DA2]">
            Nenhum ativo encontrado
          </div>
        ) : (
          visiveis.map((asset) => {
            const isActive = asset.id === selectedAsset.id
            const isFav = favorites.has(asset.id)
            const pct24h = chg24h[asset.id] ?? asset.change24h
            const isUp = pct24h >= 0
            const marketOpen = isMarketOpen(asset)

            return (
              <div
                key={asset.id}
                onClick={() => { onSelect(asset); onClose() }}
                className={cn(
                  'grid cursor-pointer grid-cols-[1fr_110px_110px_100px] items-center rounded-lg border px-2 py-2.5 transition-colors',
                  isActive
                    ? 'border-[#2E6BE6]/70 bg-[#101B2E]'
                    : 'border-transparent hover:bg-white/5',
                  !marketOpen && 'opacity-50',
                )}
              >
                {/* Nome */}
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    onClick={(e) => toggleFavorite(asset.id, e)}
                    aria-label={isFav ? `Remover ${asset.symbol} dos favoritos` : `Favoritar ${asset.symbol}`}
                    className="shrink-0 transition-colors"
                  >
                    <Star
                      size={14}
                      className={isFav ? 'fill-yellow-400 text-yellow-400' : 'text-[#26364A] hover:text-yellow-400'}
                    />
                  </button>
                  <FlagPair code1={asset.code1} code2={asset.code2} size={22} />
                  <span className="truncate text-[13px] font-semibold text-white">{asset.symbol}</span>

                  {/* Selo de origem/estado — carrega informação, não é enfeite:
                      FECHADO some com o par, BINANCE e OTC dizem de onde vem o preço. */}
                  {!marketOpen ? (
                    <span className="shrink-0 rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-[8px] font-bold leading-none text-red-400">
                      FECHADO
                    </span>
                  ) : isRealMarket(asset.id) && getMarketSource(asset.id) === 'binance' ? (
                    <span className="shrink-0 rounded border border-yellow-500/30 bg-yellow-500/15 px-1.5 py-0.5 text-[8px] font-bold leading-none text-yellow-400">
                      BINANCE
                    </span>
                  ) : asset.type === 'OTC' ? (
                    isOtcServerAuthoritative(asset.id) ? (
                      <span className="shrink-0 rounded border border-green-500/30 bg-green-500/15 px-1.5 py-0.5 text-[8px] font-bold leading-none text-green-400">
                        OTC
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-[#1B2735] px-1.5 py-0.5 text-[8px] font-bold leading-none text-[#8B9BB0]">
                        OTC
                      </span>
                    )
                  ) : null}
                </div>

                {/* Variação 24h */}
                <div className={cn('flex items-center gap-1 text-[12px] font-semibold', isUp ? 'text-[#1FD196]' : 'text-[#F0435A]')}>
                  {isUp ? <ChevronUp size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
                  {isUp ? '+' : ''}{pct24h.toFixed(2)}%
                </div>

                {/* Payouts */}
                <div className="text-[13px] font-bold text-[#F5A524]">{asset.payout}%</div>
                <div className="text-[13px] font-bold text-[#F5A524]">{asset.payout5min}%</div>
              </div>
            )
          })
        )}
      </div>

      {temMais && (
        <div className="shrink-0 px-5 pb-5 pt-3">
          <button
            onClick={() => setVerTodos(v => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#1B2735] bg-[#0C131F] py-3 text-[13px] font-semibold text-[#C3CFDD] transition-colors hover:border-[#243448] hover:text-white"
          >
            {verTodos ? 'Ver menos' : 'Ver todos os ativos'}
            <ChevronRight size={15} className={cn('transition-transform', verTodos && 'rotate-90')} />
          </button>
        </div>
      )}
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
