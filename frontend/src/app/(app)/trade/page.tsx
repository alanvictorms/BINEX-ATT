'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, useCurrentAccount } from '@/store/auth'
import { GraduationCap, Gem, Plus, ChevronDown } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { StatusBar } from '@/components/layout/StatusBar'
import { MobileNav } from '@/components/layout/MobileNav'
import { TradingChart } from '@/components/trading/TradingChart'
import { TradingPanel } from '@/components/trading/TradingPanel'
import { MobileTradingSheet } from '@/components/trading/MobileTradingSheet'
import { StudioPanel } from '@/components/studio/StudioPanel'
import { useStudioMode } from '@/lib/studioMode'
import { AccountSwitchModal } from '@/components/layout/AccountSwitchModal'
import { AssetInfoModal } from '@/components/trading/AssetInfoModal'
import { AssetSelectorModal } from '@/components/trading/AssetSelectorModal'
import { SupportPanel } from '@/components/layout/SupportPanel'
import { SupportPage } from '@/components/support/SupportPage'
import { ContaPage } from '@/components/conta/ContaPage'
import { TorneiosPage } from '@/components/torneios/TorneiosPage'
import { MercadoPage } from '@/components/mercado/MercadoPage'
import { CopyPanel } from '@/components/copy/CopyPanel'
import { MaisPanel } from '@/components/layout/MaisPanel'
import { ConfiguracoesPanel, type TradeSettings } from '@/components/layout/ConfiguracoesPanel'
import { loadTradePrefs, saveTradePrefs, DEFAULT_TRADE_PREFS } from '@/lib/tradePrefs'
import { DepositoModal } from '@/components/deposito/DepositoModal'
import { BonusWelcomeModal, type BonusOffer } from '@/components/deposito/BonusWelcomeModal'
import { supabase } from '@/lib/supabase'
import { AccountDropdown } from '@/components/layout/AccountDropdown'
import { BrandMark } from '@/components/brand/BrandMark'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { ASSETS, getOTCPrice, type Asset, type ActiveTrade } from '@/lib/mockData'
import { syncMarketAssets } from '@/lib/marketAssets'
import { assetIdToOtcSymbol } from '@/lib/otcClient'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''
import { cn } from '@/lib/utils'
import { useIsMobile, useIsPhoneLandscape } from '@/lib/useIsMobile'
import { initSound } from '@/lib/sound'
import { useSiteBrand } from '@/lib/useSiteBrand'

type SidebarTab = 'TRADE' | 'SUPORTE' | 'CONTA' | 'TORNEIOS' | 'MERCADO' | 'MAIS' | 'COPY'

export default function TradingPage() {
  const router        = useRouter()
  const authStore     = useAuthStore()
  const currentAccount = useCurrentAccount(authStore)
  // Referencia ESTAVEL da action (zustand devolve a mesma funcao entre renders).
  // Usar isto em vez de `authStore.refreshAccounts` evita que os callbacks abaixo
  // mudem de identidade a cada render — o que reinjetava deps no loadOpenTrades
  // do TradingPanel e disparava um loop infinito de refreshAccounts (VERTEX-WEB-2).
  const refreshAccounts = useAuthStore(s => s.refreshAccounts)
  const siteBrand = useSiteBrand()

  useEffect(() => {
    authStore.init().then(() => {
      if (!useAuthStore.getState().user) router.replace('/login')
    })
  }, [])

  // Pré-carrega os efeitos sonoros e arma o desbloqueio de áudio no 1º gesto
  // do usuário (política de autoplay dos navegadores). Tudo à prova de falha.
  useEffect(() => { initSound() }, [])

  // Sobrepõe payout/disponibilidade dos ativos reais com a fonte do servidor
  // (admin → Ativos). À prova de falha: se falhar, mantém o payout estático.
  const [, setMarketSync] = useState(0)
  useEffect(() => { syncMarketAssets().then(() => setMarketSync(t => t + 1)) }, [])

  const [selectedAsset, setSelectedAsset] = useState<Asset>(ASSETS[3])
  const [openAssets, setOpenAssets] = useState<Asset[]>([ASSETS[0], ASSETS[3]])
  const [switchModal, setSwitchModal] = useState<'demo' | 'real' | null>(null)
  const [assetInfoOpen, setAssetInfoOpen] = useState(false)
  const [assetSelectorOpen, setAssetSelectorOpen] = useState(false)
  const [depositoOpen, setDepositoOpen] = useState(false)
  const [contaInitialTab, setContaInitialTab] = useState<'retirada' | 'minha-conta' | 'operacoes'>('minha-conta')
  const [configOpen, setConfigOpen] = useState(false)
  const [theme, setTheme] = useState<'diurno' | 'crepusculo' | 'noite'>('noite')
  // Comeca nos defaults pra bater com o SSR (nao existe localStorage no
  // servidor) e carrega o que estava salvo logo apos montar. Sem isso,
  // desmarcar "Rolagem automatica" durava ate o F5.
  const [tradeSettings, setTradeSettingsState] = useState<TradeSettings>(DEFAULT_TRADE_PREFS)
  useEffect(() => { setTradeSettingsState(loadTradePrefs()) }, [])
  const setTradeSettings = useCallback((next: TradeSettings) => {
    setTradeSettingsState(next)
    saveTradePrefs(next)
  }, [])
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('TRADE')
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false)
  // Drawer de Posições/Histórico do mobile, controlado pela barra inferior.
  const [positionsDrawer, setPositionsDrawer] = useState<'operacoes' | 'historico' | null>(null)
  const isMobile = useIsMobile()
  const isPhoneLandscape = useIsPhoneLandscape()
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([])
  const [livePrice, setLivePrice] = useState<number | null>(null)
  // Ref síncrono — TradingChart escreve diretamente, TradingPanel lê sem passar por re-render
  const livePriceRef = useRef<number | null>(null)

  // Pré-popula o ref com o preço OTC atual quando o asset muda,
  // garantindo que o botão de compra use sempre o mesmo preço exibido no gráfico
  useEffect(() => {
    const BRT_OFFSET = -3 * 3600
    const nowSec = Math.floor(Date.now() / 1000) + BRT_OFFSET
    const p = getOTCPrice(selectedAsset.id, nowSec, selectedAsset.price)
    livePriceRef.current = p
    setLivePrice(p)
  }, [selectedAsset.id])

  function handlePriceUpdate(price: number) {
    livePriceRef.current = price
    setLivePrice(price)
  }

  // ── Andamento das ordens abertas em ativos que NÃO estão na tela ──────────
  // O chart só reporta o preço do ativo selecionado. Sem buscar o preço dos
  // outros, o ponto de status no header acenderia só onde ele já é óbvio — que
  // é justamente o caso sem utilidade.
  //
  // Só ativos OTC: o preço autoritativo deles vem do backend. Ativo de mercado
  // real fica de fora e simplesmente não mostra ponto.
  const [offscreenPrices, setOffscreenPrices] = useState<Record<string, number>>({})
  const offscreenIds = useMemo(
    () => [...new Set(activeTrades.map(t => t.assetId))].filter(id => id !== selectedAsset.id),
    [activeTrades, selectedAsset.id],
  )
  const offscreenKey = offscreenIds.join(',')

  useEffect(() => {
    if (!offscreenKey) { setOffscreenPrices({}); return }
    const ids = offscreenKey.split(',')
    let cancelled = false

    async function poll() {
      const pairs = await Promise.all(ids.map(async id => {
        const symbol = assetIdToOtcSymbol(id)
        if (!symbol) return null
        try {
          const res = await fetch(`${API_BASE}/market-data/otc/${encodeURIComponent(symbol)}/price`, { cache: 'no-store' })
          if (!res.ok) return null
          const j = await res.json()
          return Number.isFinite(j?.price) ? [id, Number(j.price)] as const : null
        } catch { return null }
      }))
      if (cancelled) return
      setOffscreenPrices(Object.fromEntries(pairs.filter(Boolean) as [string, number][]))
    }

    poll()
    // 3s basta: é um indicador de acompanhamento, não o preço de liquidação.
    const timer = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [offscreenKey])

  const tradeStatus = useMemo(() => {
    const out: Record<string, 'up' | 'down'> = {}
    for (const t of activeTrades) {
      const price = t.assetId === selectedAsset.id ? livePrice : offscreenPrices[t.assetId]
      if (price == null || !Number.isFinite(price)) continue
      const winning = t.direction === 'CALL' ? price > t.entryPrice : price < t.entryPrice
      out[t.assetId] = winning ? 'up' : 'down'
    }
    return out
  }, [activeTrades, selectedAsset.id, livePrice, offscreenPrices])

  // ── Popup de boas-vindas: bônus escalonado dos primeiros depósitos ─────────
  // Aparece pra quem ainda tem degrau da escada disponível (fez menos depósitos
  // confirmados que o nº de percentuais da oferta), 2s após a plataforma
  // carregar. Fechar = silencia por 24h (localStorage). Valores vêm do banco
  // (/api/bonus/offer) — a mesma regra que o admin configura e o banco concede.
  const [bonusPopup, setBonusPopup] = useState<{ offer: BonusOffer; depositCount: number } | null>(null)
  const userId = authStore.user?.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const last = Number(localStorage.getItem('vx_bonus_popup_at') ?? 0)
        if (Date.now() - last < 24 * 3600 * 1000) return

        const [offerRes, depRes] = await Promise.all([
          fetch('/api/bonus/offer').then(r => r.json()),
          supabase.from('deposits').select('id', { count: 'exact', head: true })
            .eq('status', 'confirmed').eq('is_fake', false),
        ])
        if (cancelled) return
        const offer = offerRes as BonusOffer
        const depositCount = depRes.error ? -1 : (depRes.count ?? 0)
        // Só mostra se a oferta é válida E o lead ainda tem um degrau da escada.
        const tierAvailable = depositCount >= 0 && depositCount < (offer?.pcts?.length ?? 0)
        if (offer?.enabled && offer.pct > 0 && tierAvailable) {
          setBonusPopup({ offer, depositCount })
        }
      } catch { /* sem oferta legível => sem popup */ }
    }, 2_000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [userId])

  const dismissBonusPopup = () => {
    try { localStorage.setItem('vx_bonus_popup_at', String(Date.now())) } catch {}
    setBonusPopup(null)
  }

  // useCallback com deps estaveis: estes callbacks sao deps do loadOpenTrades
  // (useCallback) no TradingPanel. Se mudassem de identidade a cada render, o
  // effect que roda loadOpenTrades re-disparava em loop -> refreshAccounts ->
  // re-render -> ... (Maximum update depth exceeded). Ver VERTEX-WEB-2.
  const handleTradeOpened = useCallback((trade: ActiveTrade) => {
    // Dedupe por id — handleTradeOpened pode ser chamado mais de uma vez pra mesma
    // operacao (loadOpenTrades em multiplas instancias de TradingPanel, ou React
    // strict mode rodando useEffect 2x em dev). Sem dedupe, a linha de entrada
    // aparece duplicada no chart e o contador de pendentes infla.
    setActiveTrades(prev => prev.some(t => t.id === trade.id) ? prev : [...prev, trade])
    refreshAccounts()
  }, [refreshAccounts])

  const handleTradeExpired = useCallback((id: string) => {
    setActiveTrades(prev => prev.filter(t => t.id !== id))
    refreshAccounts()
  }, [refreshAccounts])

  // Bug A fix: ao trocar de conta (DEMO <-> REAL), reseta activeTrades pra evitar
  // que trades da conta anterior fiquem visualmente "vazando" pra nova.
  // O TradingPanel vai recarregar via loadOpenTrades automaticamente (depende de accountId).
  useEffect(() => {
    setActiveTrades([])
  }, [currentAccount?.id])

  const isDemo      = authStore.isDemo
  const accounts    = authStore.user?.accounts ?? []
  const demoBalanceRaw = parseFloat(accounts.find(a => a.type === 'DEMO')?.balance ?? '0')
  const realBalanceRaw = parseFloat(accounts.find(a => a.type === 'REAL')?.balance ?? '0')
  const balanceRaw     = isDemo ? demoBalanceRaw : realBalanceRaw

  // ─── Studio Mode overrides (cosmetico) ────────────────────────────────
  // Aplica saldo customizado + "so cresce" sem alterar dados reais.
  const studioEnabled              = useStudioMode(s => s.enabled)
  const studioCustomBalanceEnabled = useStudioMode(s => s.customBalanceEnabled)
  const studioCustomBalance        = useStudioMode(s => s.customBalance)
  const studioBalanceOnlyGrows     = useStudioMode(s => s.balanceOnlyGrows)
  const studioCustomIdentityEnabled = useStudioMode(s => s.customIdentityEnabled)
  const studioCustomEmail          = useStudioMode(s => s.customEmail)

  // Track maximo historico do saldo (para "so cresce")
  const [maxBalanceSeen, setMaxBalanceSeen] = useState<number | null>(null)
  useEffect(() => {
    if (studioEnabled && studioBalanceOnlyGrows) {
      setMaxBalanceSeen(prev => (prev == null || balanceRaw > prev ? balanceRaw : prev))
    } else if (!studioBalanceOnlyGrows) {
      setMaxBalanceSeen(null)
    }
  }, [balanceRaw, studioEnabled, studioBalanceOnlyGrows])

  const applyBalance = (raw: number) => {
    if (!studioEnabled) return raw
    if (studioCustomBalanceEnabled) return studioCustomBalance
    if (studioBalanceOnlyGrows && maxBalanceSeen != null) return Math.max(raw, maxBalanceSeen)
    return raw
  }

  const demoBalance = applyBalance(demoBalanceRaw)
  const realBalance = applyBalance(realBalanceRaw)
  // Contas ainda não carregadas => null (Header mostra skeleton, não "R$ 0,00").
  // Todo usuário tem DEMO+REAL criadas no cadastro; lista vazia = load pendente.
  const accountsReady = accounts.length > 0
  const balance: number | null = accountsReady ? applyBalance(balanceRaw) : null

  const displayedEmail = studioEnabled && studioCustomIdentityEnabled
    ? studioCustomEmail
    : (authStore.user?.email ?? '')

  // Persiste as abas abertas + ativo selecionado no navegador, pra sobreviver ao F5.
  function persistTabs(open: Asset[], selectedId: string) {
    try {
      localStorage.setItem('vertex.tabs', JSON.stringify({ openIds: open.map(a => a.id), selectedId }))
    } catch { /* localStorage indisponivel — ignora */ }
  }

  // Restaura abas/ativo salvos ao montar (uma vez). Roda so no cliente.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('vertex.tabs')
      if (!raw) return
      const saved = JSON.parse(raw) as { openIds?: string[]; selectedId?: string }
      const open = (saved.openIds ?? []).map(id => ASSETS.find(a => a.id === id)).filter(Boolean) as Asset[]
      if (open.length === 0) return
      setOpenAssets(open)
      const sel = ASSETS.find(a => a.id === saved.selectedId)
      setSelectedAsset(sel ?? open[open.length - 1])
    } catch { /* json invalido — ignora */ }
  }, [])

  function handleSelectAsset(asset: Asset) {
    setSelectedAsset(asset)
    const nextOpen = openAssets.find((a) => a.id === asset.id) ? openAssets : [...openAssets, asset]
    if (nextOpen !== openAssets) setOpenAssets(nextOpen)
    persistTabs(nextOpen, asset.id)
  }

  function handleCloseAsset(asset: Asset) {
    const remaining = openAssets.filter((a) => a.id !== asset.id)
    setOpenAssets(remaining)
    let selectedId = selectedAsset.id
    if (selectedAsset.id === asset.id && remaining.length > 0) {
      const next = remaining[remaining.length - 1]
      setSelectedAsset(next)
      selectedId = next.id
    }
    persistTabs(remaining, selectedId)
  }

  function handleSelectDemo() {
    if (!isDemo) { authStore.setIsDemo(true); setSwitchModal('demo') }
  }

  function handleSelectReal() {
    if (isDemo) { authStore.setIsDemo(false); setSwitchModal('real') }
  }

  // ─── Shared content renderers ──────────────────────────────────────────────

  function renderMainContent(forMobile = false) {
    // Só o painel da layout ATIVA mostra o popup de resultado (os dois layouts
    // ficam montados ao mesmo tempo). Aqui (layout desktop) ativa quando o device
    // nao é mobile.
    const desktopPopup = isMobile === false
    if (sidebarTab === 'SUPORTE') return (
      <div className={cn('flex flex-1 min-h-0 overflow-hidden', forMobile && 'flex-col')}>
        {!forMobile && <SupportPanel onClose={() => setSidebarTab('TRADE')} />}
        <SupportPage />
      </div>
    )
    if (sidebarTab === 'CONTA')    return <ContaPage key={contaInitialTab} initialTab={contaInitialTab} />
    if (sidebarTab === 'TORNEIOS') return <TorneiosPage />
    if (sidebarTab === 'MERCADO')  return <MercadoPage />
    if (sidebarTab === 'COPY')     return <CopyPanel onClose={() => setSidebarTab('TRADE')} onDeposit={() => setDepositoOpen(true)} />
    if (sidebarTab === 'MAIS') {
      // Em mobile o MaisPanel ocupa a tela toda — não tem sidebar pra acomodar
      if (forMobile) return (
        <MaisPanel
          mobile
          onClose={() => setSidebarTab('TRADE')}
          onSelectAsset={(asset) => { handleSelectAsset(asset); setSidebarTab('TRADE') }}
          onOpenConfig={() => { setSidebarTab('TRADE'); setConfigOpen(true) }}
        />
      )
      return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <MaisPanel onClose={() => setSidebarTab('TRADE')} onSelectAsset={(asset) => { handleSelectAsset(asset); setSidebarTab('TRADE') }} />
          <TradingChart asset={selectedAsset} onInfoClick={() => setAssetInfoOpen(true)} autoScroll={tradeSettings.autoScroll} performanceMode={tradeSettings.performanceMode} activeTrades={activeTrades.filter(t => t.assetId === selectedAsset.id)} onPriceUpdate={handlePriceUpdate} />
          <TradingPanel asset={selectedAsset} oneClickTrade={tradeSettings.oneClickTrade} shortLabels={tradeSettings.shortLabels} accountId={currentAccount?.id} onTradeOpened={handleTradeOpened} onTradeExpired={handleTradeExpired} livePrice={livePrice} livePriceRef={livePriceRef} showResultPopup={desktopPopup} onVerTodasPosicoes={() => { setContaInitialTab('operacoes'); setSidebarTab('CONTA') }} />
        </div>
      )
    }
    // TRADE (default)
    return (
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!forMobile && configOpen && (
          <ConfiguracoesPanel onClose={() => setConfigOpen(false)} theme={theme} onThemeChange={setTheme} settings={tradeSettings} onSettingsChange={setTradeSettings} />
        )}
        {!forMobile && assetSelectorOpen && (
          <AssetSelectorModal selectedAsset={selectedAsset} onSelect={handleSelectAsset} onClose={() => setAssetSelectorOpen(false)} />
        )}
        <TradingChart asset={selectedAsset} onInfoClick={() => setAssetInfoOpen(true)} theme={theme} autoScroll={tradeSettings.autoScroll} performanceMode={tradeSettings.performanceMode} activeTrades={activeTrades.filter(t => t.assetId === selectedAsset.id)} onPriceUpdate={handlePriceUpdate} />
        {!forMobile && <TradingPanel asset={selectedAsset} oneClickTrade={tradeSettings.oneClickTrade} shortLabels={tradeSettings.shortLabels} accountId={currentAccount?.id} onTradeOpened={handleTradeOpened} onTradeExpired={handleTradeExpired} livePrice={livePrice} livePriceRef={livePriceRef} showResultPopup={desktopPopup} onVerTodasPosicoes={() => { setContaInitialTab('operacoes'); setSidebarTab('CONTA') }} />}
      </div>
    )
  }

  return (
    <div className="h-full bg-[#0A101A] overflow-hidden">

      {/* ── DESKTOP layout (somente quando NÃO é mobile detectado) ──────── */}
      <div className={cn(isMobile === false ? 'flex' : 'hidden', 'h-full flex-col overflow-hidden bg-[#060A11]')}>
          <Header
            selectedAsset={selectedAsset}
            onSelectAsset={handleSelectAsset}
            openAssets={openAssets}
            onOpenAsset={handleSelectAsset}
            tradeStatus={tradeStatus}
            onCloseAsset={handleCloseAsset}
            onOpenSelector={() => setAssetSelectorOpen(true)}
            onDeposito={() => setDepositoOpen(true)}
            onRetirada={() => { setContaInitialTab('retirada'); setSidebarTab('CONTA') }}
            onTransacoes={() => { setContaInitialTab('minha-conta'); setSidebarTab('CONTA') }}
            onOperacoes={() => setSidebarTab('TRADE')}
            onMinhaConta={() => { setContaInitialTab('minha-conta'); setSidebarTab('CONTA') }}
            onLogout={() => { authStore.logout().then(() => router.replace('/login')) }}
            onResetDemo={() => authStore.resetDemo()}
            isDemo={isDemo}
            onSelectDemo={handleSelectDemo}
            onSelectReal={handleSelectReal}
            demoBalance={demoBalance}
            realBalance={realBalance}
            balance={balance}
            userEmail={displayedEmail}
            userId={authStore.user?.id ?? ''}
          />
          <div className="flex min-h-0 flex-1 gap-3 p-3">
            <Sidebar activeTab={sidebarTab} onTabChange={setSidebarTab} onSettings={() => setConfigOpen(!configOpen)} />
            <div className="relative flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden">
              {renderMainContent(false)}
            </div>
          </div>
          <StatusBar />
      </div>

      {/* ── MOBILE layout (touch device ou janela estreita) ─────────────── */}
      <div className={cn(isMobile === true ? 'flex' : 'hidden', 'h-full flex-col overflow-hidden')}>

        {/* Mobile header — escondido em paisagem pra liberar tela pro gráfico */}
        <header className={cn(
          'items-center justify-between px-4 h-12 bg-[#0C131F] border-b border-[#16202D] flex-shrink-0',
          isPhoneLandscape ? 'hidden' : 'flex'
        )}>
          {/* Logo */}
          <div className="flex items-center gap-2">
            <BrandLogo size={28} where="trade">
              <div className="flex flex-col">
                <span className="text-white font-bold text-sm tracking-widest">{siteBrand.name}</span>
                <div className="text-[8px] text-[#7E8DA2] tracking-widest font-medium -mt-0.5">{siteBrand.subtitle}</div>
              </div>
            </BrandLogo>
          </div>

          {/* Right: balance + deposit */}
          <div className="flex items-center gap-2">
            {/* Balance chip */}
            <div className="relative">
              <button
                onClick={() => setMobileAccountOpen(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#101825] border border-[#16202D]"
              >
                {isDemo
                  ? <GraduationCap size={14} className="text-yellow-400 flex-shrink-0" />
                  : <Gem size={14} className="text-purple-400 flex-shrink-0" />
                }
                <div className="text-left">
                  <div className={cn('text-[8px] font-bold leading-tight', isDemo ? 'text-yellow-400' : 'text-green-400')}>
                    {isDemo ? 'DEMO' : 'REAL'}
                  </div>
                  <div className="text-[15px] font-bold text-white leading-tight">
                    {balance == null
                      ? <span className="inline-block w-16 h-4 rounded bg-white/15 animate-pulse" />
                      : <>R${balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>}
                  </div>
                </div>
                <ChevronDown size={10} className={cn('text-[#7E8DA2] transition-transform', mobileAccountOpen && 'rotate-180')} />
              </button>

              {mobileAccountOpen && (
                <div className="absolute top-full right-0 mt-1 z-50">
                  <AccountDropdown
                    isDemo={isDemo}
                    onSelectDemo={() => { handleSelectDemo(); setMobileAccountOpen(false) }}
                    onSelectReal={() => { handleSelectReal(); setMobileAccountOpen(false) }}
                    demoBalance={demoBalance}
                    realBalance={realBalance}
                    userEmail={displayedEmail}
                    userId={authStore.user?.id ?? ''}
                    onClose={() => setMobileAccountOpen(false)}
                    onLogout={() => { authStore.logout().then(() => router.replace('/login')) }}
                    onResetDemo={() => authStore.resetDemo()}
                    onDeposito={() => { setDepositoOpen(true); setMobileAccountOpen(false) }}
                    onRetirada={() => { setContaInitialTab('retirada'); setSidebarTab('CONTA'); setMobileAccountOpen(false) }}
                    onTransacoes={() => { setContaInitialTab('minha-conta'); setSidebarTab('CONTA'); setMobileAccountOpen(false) }}
                    onOperacoes={() => { setSidebarTab('TRADE'); setMobileAccountOpen(false) }}
                    onMinhaConta={() => { setContaInitialTab('minha-conta'); setSidebarTab('CONTA'); setMobileAccountOpen(false) }}
                  />
                </div>
              )}
            </div>

            {/* Depósito — só o "+" no mobile, pra sobrar largura pro saldo */}
            <button
              onClick={() => setDepositoOpen(true)}
              aria-label="Depósito"
              title="Depósito"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500 text-white transition-colors hover:bg-green-400"
            >
              <Plus size={18} strokeWidth={2.6} />
            </button>

            {/* Avatar — atalho pra conta */}
            <button
              onClick={() => { setContaInitialTab('minha-conta'); setSidebarTab('CONTA') }}
              aria-label="Minha conta"
              title="Minha conta"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#22344A] bg-[#2E6BE6]/20 text-[13px] font-bold uppercase text-[#6C9CF8] transition-colors hover:bg-[#2E6BE6]/30"
            >
              {(displayedEmail?.[0] ?? 'A')}
            </button>
          </div>
        </header>

        {/* Main content area */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {renderMainContent(true)}
        </div>

        {/* Mobile trading sheet (only on TRADE tab) */}
        {sidebarTab === 'TRADE' && (
          <MobileTradingSheet
            asset={selectedAsset}
            oneClickTrade={tradeSettings.oneClickTrade}
            shortLabels={tradeSettings.shortLabels}
            accountId={currentAccount?.id}
            onTradeOpened={handleTradeOpened}
            onTradeExpired={handleTradeExpired}
            livePrice={livePrice}
            livePriceRef={livePriceRef}
            showResultPopup={isMobile === true}
            onAssetTap={() => setAssetSelectorOpen(true)}
            positionsDrawer={positionsDrawer}
            onPositionsDrawerClose={() => setPositionsDrawer(null)}
          />
        )}

        {/* Mobile bottom navigation — oculto em paisagem */}
        {!isPhoneLandscape && (
          <MobileNav
            active={
              depositoOpen ? 'DEPOSITO'
                : positionsDrawer === 'operacoes' ? 'POSICOES'
                : positionsDrawer === 'historico' ? 'HISTORICO'
                : sidebarTab === 'TRADE' ? 'NEGOCIAR'
                : null
            }
            onAction={action => {
              if (action === 'DEPOSITO') { setDepositoOpen(true); return }
              if (action === 'NEGOCIAR') {
                // Volta pra tela de negociação e fecha qualquer drawer aberto.
                setPositionsDrawer(null)
                setSidebarTab('TRADE')
                return
              }
              const tab = action === 'POSICOES' ? 'operacoes' : 'historico'
              // Tocar de novo no mesmo item fecha — comportamento esperado
              // numa barra de navegação que abre drawer.
              setPositionsDrawer(cur => (cur === tab ? null : tab))
            }}
          />
        )}
      </div>

      {/* ── Global modals (shared desktop + mobile) ──────────────────────── */}
      {assetInfoOpen && (
        <AssetInfoModal asset={selectedAsset} onClose={() => setAssetInfoOpen(false)} onTrade={() => setAssetInfoOpen(false)} />
      )}
      {/* Seletor de ativo em mobile: overlay fullscreen */}
      {isMobile && assetSelectorOpen && (
        <AssetSelectorModal
          mobile
          selectedAsset={selectedAsset}
          onSelect={(asset) => { handleSelectAsset(asset); setAssetSelectorOpen(false) }}
          onClose={() => setAssetSelectorOpen(false)}
        />
      )}
      {/* Configuracoes em mobile: overlay fullscreen (em desktop fica no Sidebar) */}
      {isMobile && configOpen && (
        <div className="fixed inset-0 z-50 bg-[#0E1620]">
          <ConfiguracoesPanel
            mobile
            onClose={() => setConfigOpen(false)}
            theme={theme}
            onThemeChange={setTheme}
            settings={tradeSettings}
            onSettingsChange={setTradeSettings}
          />
        </div>
      )}
      {depositoOpen && (
        <DepositoModal onClose={() => setDepositoOpen(false)} />
      )}
      {bonusPopup && !depositoOpen && (
        <BonusWelcomeModal
          offer={bonusPopup.offer}
          depositCount={bonusPopup.depositCount}
          onDeposit={() => { dismissBonusPopup(); setDepositoOpen(true) }}
          onClose={dismissBonusPopup}
        />
      )}
      {switchModal && (
        <AccountSwitchModal switchedTo={switchModal} demoBalance={demoBalance} realBalance={realBalance} onClose={() => setSwitchModal(null)} />
      )}
      {/* Studio Mode — apenas owner ve, controla via Ctrl+Shift+S */}
      <StudioPanel />
    </div>
  )
}
