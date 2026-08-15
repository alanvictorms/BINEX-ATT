'use client'

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, ArrowUp, ArrowDown, ChevronDown, ChevronUp, ArrowLeftRight, Package, X, ExternalLink } from 'lucide-react'
import { ASSETS, getOTCPrice, type Asset, type OpenTrade, type ActiveTrade } from '@/lib/mockData'
import { cn } from '@/lib/utils'
import { FlagPair } from '@/components/ui/FlagPair'
import { supabase } from '@/lib/supabase'
import { otcSymbolToAssetId } from '@/lib/otcClient'
import { secureRpc, secureDb } from '@/lib/secureClient'
import { useAuthStore } from '@/store/auth'
import { isMarketOpen, nextOpenAt, formatTimeUntil } from '@/lib/marketHours'
import { useOtcSessions } from '@/lib/useOtcSessions'
import { playSound } from '@/lib/sound'
import { useStudioMode, applyHideOtc, type FakeHistoryItem } from '@/lib/studioMode'

interface TradingPanelProps {
  asset: Asset
  oneClickTrade?: boolean
  shortLabels?: boolean
  mobile?: boolean
  accountId?: string
  onTradeOpened?: (trade: ActiveTrade) => void
  onTradeExpired?: (id: string) => void
  livePrice?: number | null
  livePriceRef?: React.MutableRefObject<number | null>
  /** Quando true, esconde o painel visualmente mas mantém estado/timers vivos */
  hidden?: boolean
  /** Se false, NÃO renderiza o popup de resultado. Usado pra garantir que só o
   *  painel da layout ativa (desktop OU mobile) mostre o popup — evita popups
   *  duplicados, já que os dois layouts ficam montados simultaneamente. */
  showResultPopup?: boolean
  /** Abre a página de Conta → Operações */
  onVerTodasPosicoes?: () => void
  /**
   * Mobile: transforma a seção Posições/Histórico num drawer inferior
   * controlado de fora (pela barra inferior). `null` esconde a seção.
   *
   * É prop em vez de um segundo TradingPanel de propósito: montar outra
   * instância duplicaria timers de operação e estado de liquidação.
   */
  positionsDrawer?: 'operacoes' | 'historico' | null
  onPositionsDrawerClose?: () => void
}

export interface TradingPanelHandle {
  /** Dispara uma operação rápida usando os defaults atuais (investimento + duração) */
  placeTrade: (direction: 'CALL' | 'PUT') => void
  canTrade: boolean
}

interface ClosedTrade {
  id: string
  asset_symbol: string
  direction: 'CALL' | 'PUT'
  amount: number
  payout_pct: number
  entry_price: number
  exit_price: number | null
  status: 'WON' | 'LOST' | 'DRAW'
  profit: number | null
  created_at: string
  closed_at: string | null
}

// Durações em segundos — correspondem aos horários absolutos exibidos como no Quotex
const TIME_OPTIONS = [60, 120, 180, 240, 300, 600, 900, 1800, 2700, 3600, 7200, 10800, 14400]

const BRT_OFFSET = -3 * 3600 // UTC-3 (Horário de Brasília)

function nowBRTSec() {
  return Math.floor(Date.now() / 1000) + BRT_OFFSET
}

function expiryLabel(duration: number, base: number) {
  const ts = base + duration
  const h = Math.floor(ts / 3600) % 24
  const m = Math.floor(ts / 60) % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function FloatingBox({ label, link, sub, children }: {
  label: string
  link?: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="px-4 pt-3.5">
      <span className="text-[11.5px] font-medium text-[#7E8DA2]">{label}</span>
      <div className="mt-2.5 border-b border-[#1B2735] pb-[11px]">
        {children}
      </div>
      {sub && <p className="mt-2 text-center text-[10.5px] text-[#67768B]">{sub}</p>}
      {link && (
        <p className="text-center mt-1.5">
          <button className="text-[10px] font-semibold text-[#67768B] hover:text-[#AEBBCB] tracking-[0.08em] transition-colors">
            {link}
          </button>
        </p>
      )}
    </div>
  )
}

function TradeItem({ trade, shortLabels, currentPrice, onDoubleUp, onEarlyClose }: {
  trade: OpenTrade
  shortLabels: boolean
  currentPrice?: number
  onDoubleUp: (trade: OpenTrade, remaining: number) => void
  onEarlyClose: (trade: OpenTrade, refund: number) => void
}) {
  const [remaining, setRemaining] = useState(() => Math.max(0, trade.expiryTime - Math.floor(Date.now() / 1000)))
  const [expanded, setExpanded] = useState(false)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    const t = setInterval(() => {
      const r = Math.max(0, trade.expiryTime - Math.floor(Date.now() / 1000))
      setRemaining(r)
      // Tick discreto nos últimos 5s (debounce no SoundManager dedup entre
      // múltiplas operações/instâncias que expiram no mesmo segundo).
      if (r >= 1 && r <= 5) playSound('tick')
    }, 1000)
    return () => clearInterval(t)
  }, [trade.expiryTime])

  const h = Math.floor(remaining / 3600).toString().padStart(2, '0')
  const m = Math.floor((remaining % 3600) / 60).toString().padStart(2, '0')
  const s = (remaining % 60).toString().padStart(2, '0')

  const studioOtc = useStudioMode(s => s.enabled && s.hideOtcTag)
  const labelRaw = studioOtc ? applyHideOtc(trade.asset.label, true) : trade.asset.label
  const name = labelRaw.length > 13 ? labelRaw.slice(0, 13) + '...' : labelRaw
  // Saída antecipada: 20% do valor quando há tempo restante, decrescendo até 0
  const decay = trade.duration && trade.duration > 0 ? remaining / trade.duration : 1
  const earlyExitValue = Math.max(1, Math.round(trade.amount * 0.20 * decay))
  const canAct = remaining > 5 && !acting

  // P&L em tempo real
  const isWinning = currentPrice != null
    ? (trade.direction === 'CALL' ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice)
    : null
  const unrealizedPnL = isWinning ? Math.round(trade.amount * (trade.asset.payout / 100)) : 0

  return (
    <div className="px-2 mb-px">
      <div
        className="px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-1.5">
          <ChevronDown size={11} className={cn('text-[#7E8DA2] flex-shrink-0 transition-transform', expanded && 'rotate-180')} />
          <FlagPair code1={trade.asset.code1} code2={trade.asset.code2} size={15} />
          <span className="flex-1 text-[12px] font-semibold text-white truncate">
            {shortLabels ? name : labelRaw}
          </span>
          <span className="text-[11px] font-mono text-[#7E8DA2] flex-shrink-0">{h}:{m}:{s}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 pl-5">
          <span className={cn(
            'w-3 h-3 rounded-full flex-shrink-0',
            trade.direction === 'CALL' ? 'bg-green-500' : 'bg-red-500'
          )} />
          <span className="text-[11px] text-[#7E8DA2] flex-1">R$ {fmtMoney(trade.amount)}</span>
          <span className={cn(
            'text-[11px] font-bold tabular-nums',
            isWinning === null ? 'text-[#7E8DA2]' : isWinning ? 'text-[#1FD196]' : 'text-[#F0435A]'
          )}>
            {isWinning === null ? '—' : isWinning ? `+R$ ${fmtMoney(unrealizedPnL)}` : 'R$ 0,00'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-2 pb-2 flex gap-2">
          <button
            disabled={!canAct}
            onClick={async (e) => {
              e.stopPropagation()
              if (!canAct) return
              setActing(true)
              await onDoubleUp(trade, remaining)
              setActing(false)
            }}
            className="flex-1 h-7 rounded-lg bg-[#101825] border border-[#16202D] text-[11px] font-bold text-white hover:border-blue-500/50 transition-colors disabled:opacity-40"
          >
            x2
          </button>
          <button
            disabled={!canAct}
            onClick={async (e) => {
              e.stopPropagation()
              if (!canAct) return
              setActing(true)
              await onEarlyClose(trade, earlyExitValue)
              setActing(false)
            }}
            className="flex-1 h-7 rounded-lg bg-blue-600 hover:bg-blue-500 text-[11px] font-bold text-white transition-colors px-2 disabled:opacity-40"
          >
            Vender agora &nbsp;{fmtMoney(earlyExitValue)} R$
          </button>
        </div>
      )}
    </div>
  )
}

export const TradingPanel = forwardRef<TradingPanelHandle, TradingPanelProps>(function TradingPanel({ asset, oneClickTrade = true, shortLabels = true, mobile = false, accountId, onTradeOpened, onTradeExpired, livePrice, livePriceRef: externalPriceRef, hidden = false, showResultPopup = true, onVerTodasPosicoes, positionsDrawer = null, onPositionsDrawerClose }, ref) {
  // ─── Studio Mode (cosmetico, apenas owner) ───────────────────────────
  const studioEnabled            = useStudioMode(s => s.enabled)
  const studioHideLosses         = useStudioMode(s => s.hideLosses)
  const studioPayoutBoostOn      = useStudioMode(s => s.payoutBoostEnabled)
  const studioPayoutBoostPct     = useStudioMode(s => s.payoutBoostPct)
  const studioSilenceLossPopup   = useStudioMode(s => s.silenceLossPopup)
  const studioHideOtcTag         = useStudioMode(s => s.hideOtcTag)
  const studioFakeHistory        = useStudioMode(s => s.fakeHistory)
  const studioConsumeForceWin    = useStudioMode(s => s.consumeForceWin)
  // Boost aplicado ao payout exibido (puramente visual)
  const studioPayoutBoost = studioEnabled && studioPayoutBoostOn ? studioPayoutBoostPct : 0
  // Label do ativo com (OTC) eventualmente removido
  const displayAssetLabel = studioEnabled && studioHideOtcTag ? applyHideOtc(asset.label, true) : asset.label

  const [investment, setInvestment] = useState(50)
  const [investmentRaw, setInvestmentRaw] = useState('')
  const [editingInvestment, setEditingInvestment] = useState(false)
  const [timeIndex, setTimeIndex] = useState(4) // 300s = 5 min
  const [timerPickerOpen, setTimerPickerOpen] = useState(false)
  const [nowBRT, setNowBRT] = useState(nowBRTSec)

  useEffect(() => {
    const id = setInterval(() => setNowBRT(nowBRTSec()), 1000)
    return () => clearInterval(id)
  }, [])

  // Market hours: re-render a cada minuto pra atualizar countdown
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  // Janelas de sessão dos pares OTC (Admin → OTC → Sessão). Alimenta o cache que
  // isMarketOpen consulta; o retorno só serve pra re-renderizar quando chega.
  useOtcSessions()
  const marketOpen = isMarketOpen(asset, new Date(nowTick))
  const nextOpen   = !marketOpen ? nextOpenAt(asset, new Date(nowTick)) : null
  const reopenIn   = nextOpen ? formatTimeUntil(nextOpen, new Date(nowTick)) : ''
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([])
  const [confirmTrade, setConfirmTrade] = useState<'CALL' | 'PUT' | null>(null)
  const [activeTab, setActiveTab] = useState<'operacoes' | 'historico' | 'pedidos'>('operacoes')

  // Abrir o drawer pela barra inferior ja escolhe a aba correspondente. Dentro
  // dele as abas seguem clicaveis normalmente.
  useEffect(() => {
    if (positionsDrawer) setActiveTab(positionsDrawer)
  }, [positionsDrawer])
  const [placing, setPlacing] = useState(false)
  const [tradeError, setTradeError] = useState('')
  const [tradeResult, setTradeResult] = useState<{ direction: 'CALL' | 'PUT'; amount: number; profit: number; won: boolean; draw?: boolean } | null>(null)

  // Auto-dismiss do popup após 4s — comum em apps de trading, evita acúmulo de cliques
  useEffect(() => {
    if (!tradeResult) return
    const t = setTimeout(() => setTradeResult(null), 4000)
    return () => clearTimeout(t)
  }, [tradeResult])

  // Reconcilia o resultado mostrado no popup com o resultado oficial do banco.
  // Trata o caso comum em que o backend api (service.ts setTimeout) ja liquidou
  // a operacao antes do cliente chamar settle_trade — nesse caso a RPC retorna
  // erro OPERATION_NOT_FOUND e precisamos buscar o status real direto da tabela.
  // So atualiza o popup se tivermos certeza do resultado oficial e ele divergir.
  async function reconcileWithBackend(
    operationId: string,
    exitPrice:   number,
    direction:   'CALL' | 'PUT',
    investment:  number,
    localWon:    boolean,
    localProfit: number,
  ) {
    let backendStatus: 'WON' | 'LOST' | 'DRAW' | null = null
    let backendProfit = 0
    try {
      const { data: result, error } = await secureRpc('settle_trade', {
        p_operation_id: operationId,
        p_exit_price:   exitPrice,
      })
      if (error) {
        // OPERATION_NOT_FOUND = backend ja liquidou antes; buscar resultado oficial.
        if (String(error.message ?? '').includes('OPERATION_NOT_FOUND')) {
          const { data: op } = await secureDb
            .from('operations')
            .select('status, profit')
            .eq('id', operationId)
            .single()
          if (op && ['WON', 'LOST', 'DRAW'].includes(op.status as string)) {
            backendStatus = op.status as 'WON' | 'LOST' | 'DRAW'
            backendProfit = Number(op.profit ?? 0)
          }
        } else {
          console.warn('[trade] settle_trade erro inesperado:', error.message)
        }
      } else if (result && (result as any).status) {
        const s = String((result as any).status)
        if (['WON', 'LOST', 'DRAW'].includes(s)) {
          backendStatus = s as 'WON' | 'LOST' | 'DRAW'
          backendProfit = Number((result as any).profit ?? 0)
        }
      }
    } catch (err) {
      console.warn('[trade] reconcileWithBackend falhou:', err)
      return
    }

    // Sem resultado oficial — mantem popup local.
    if (!backendStatus) return

    const backendWon  = backendStatus === 'WON'
    const backendDraw = backendStatus === 'DRAW'

    // Som: o popup local ja tocou win/loss na hora da expiracao. Se o resultado
    // oficial diverge (raro), recorrige o audio pra bater com a realidade; empate
    // sempre toca o som proprio (o local nunca produz DRAW). Gated por
    // showResultPopup pra tocar uma vez so — ha 3 paineis montados em paralelo.
    if (showResultPopup) {
      if (backendDraw) playSound('draw')
      else if (backendWon !== localWon) playSound(backendWon ? 'win' : 'loss')
    }

    if (backendWon === localWon && !backendDraw && Math.abs(backendProfit - localProfit) < 0.01) return

    // Functional update: respeita fechamento manual ou auto-dismiss.
    // Se o usuario ja fechou o popup (state=null) antes do reconcile terminar,
    // NAO reabre — caso contrario o popup "pisca" e parece nao fechar.
    setTradeResult(prev => prev
      ? { direction, amount: investment, profit: backendWon ? backendProfit : 0, won: backendWon, draw: backendDraw }
      : null)
  }

  const refreshAccounts = useAuthStore(s => s.refreshAccounts)

  // Histórico de operações fechadas
  const [history, setHistory] = useState<ClosedTrade[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Mapa de timeouts por trade ID — permite cancelar no early close
  const timeoutMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // IDs de operações abertas POR FORA deste navegador (ex: PulseHacker via API).
  // São display-only: o painel exibe ao vivo, mas NÃO liquida pelo client — quem
  // liquida é o backend (server-authoritative OTC). Só visibilidade.
  const externalIdsRef = useRef<Set<string>>(new Set())
  // ID único por instância de painel — há 2-3 montados (desktop/mobile/mais) sobre o
  // mesmo client Supabase; nomes de canal Realtime precisam ser distintos por instância.
  const instanceIdRef = useRef(Math.random().toString(36).slice(2))
  // Trava SINCRONA contra duplo-disparo de operacao. O estado `placing` (async)
  // nao protege contra dois cliques no mesmo tick antes do re-render — este ref
  // bloqueia de imediato. Evita operacao duplicada (1 clique = 1 operacao).
  const submitLockRef = useRef(false)
  // Lista de operacoes abertas sem duplicatas por id (defensivo). Usada na UI
  // tanto pra renderizar a lista quanto pros contadores — mantem tudo coerente.
  const openTradesUnique = openTrades.filter((t, i, a) => a.findIndex(x => x.id === t.id) === i)

  // Preços em tempo real por asset ID para calcular P&L das operações abertas
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (openTrades.length === 0) return

    const update = async () => {
      const now = Math.floor(Date.now() / 1000)
      const next = new Map<string, number>()

      for (const trade of openTrades) {
        const a = trade.asset

        // Ativo atual: usa o preço ao vivo já disponível
        if (a.id === asset.id && livePriceRef.current != null) {
          next.set(a.id, livePriceRef.current)
          continue
        }

        // OTC: calcula localmente (determinístico, sem API)
        if (a.type === 'OTC') {
          next.set(a.id, getOTCPrice(a.id, now, a.price))
          continue
        }

        // Forex/Crypto: busca da API (mantém último valor se falhar)
        try {
          const { REAL_ASSETS } = await import('@/lib/marketSymbols')
          const cfg = REAL_ASSETS[a.id]
          if (!cfg) { next.set(a.id, a.price); continue }
          const res = await fetch(`/api/market/price?symbol=${encodeURIComponent(cfg.symbol)}&source=${cfg.source}`)
          const json = await res.json()
          if (json.price) next.set(a.id, json.price)
          else next.set(a.id, priceMap.get(a.id) ?? a.price)
        } catch {
          next.set(a.id, priceMap.get(a.id) ?? a.price)
        }
      }

      setPriceMap(next)
    }

    update()
    const interval = setInterval(update, 500)
    return () => clearInterval(interval)
  }, [openTrades, asset.id])

  const loadHistory = useCallback(async () => {
    if (!accountId) return
    setHistoryLoading(true)
    try {
      const { data, error } = await supabase
        .from('operations')
        .select('id, asset_symbol, direction, amount, payout_pct, entry_price, exit_price, status, profit, created_at, closed_at')
        .eq('account_id', accountId)
        .in('status', ['WON', 'LOST', 'DRAW'])
        .order('closed_at', { ascending: false })
        .limit(50)
      if (error) {
        console.warn('[history] supabase error:', error.message)
      } else {
        setHistory((data ?? []) as ClosedTrade[])
      }
    } catch (err) {
      // Sem try/catch + finally, qualquer falha (rede, auth expirado, RLS)
      // deixava historyLoading=true pra sempre -> "Carregando..." eterno.
      console.warn('[history] fetch failed:', err)
    } finally {
      setHistoryLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (activeTab === 'historico') loadHistory()
  }, [activeTab, loadHistory])

  // Carrega operações abertas ao montar E quando o Realtime sinaliza mudança.
  // Idempotente: só processa ops AINDA não rastreadas (guard por timeoutMap), então
  // pode ser chamada várias vezes (mount + cada INSERT do Realtime) sem duplicar
  // timers/marcadores.
  const loadOpenTrades = useCallback(async () => {
    if (!accountId) return

    const { data, error } = await supabase
      .from('operations')
      .select('id, asset_id, asset_symbol, direction, amount, payout_pct, entry_price, expires_at, created_at')
      .eq('account_id', accountId)
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false })

    if (error || !data || data.length === 0) return

    const now = Date.now()
    const toAdd: OpenTrade[] = []

    for (const op of data) {
      // Já rastreada (timer pendente) — pula pra não duplicar timer/marcador.
      if (timeoutMap.current.has(op.id)) continue

      // Resolve o ativo do front. Operações manuais gravam asset_id = id do front
      // ('eur-usd-otc'). Operações abertas POR FORA (PulseHacker via /integrations)
      // gravam asset_id = cuid do OtcAsset e asset_symbol = símbolo OTC ('BTCUSD-OTC')
      // — por isso o fallback por símbolo. `external` marca essas: display-only, o
      // client NÃO liquida (backend liquida OTC server-authoritative).
      const matchedById = ASSETS.find(a => a.id === op.asset_id)
      const assetObj    = matchedById ?? ASSETS.find(a => a.id === otcSymbolToAssetId(op.asset_symbol))
      if (!assetObj) continue
      const external = !matchedById

      const expiresAtMs     = new Date(op.expires_at).getTime()
      const createdAtMs     = new Date(op.created_at).getTime()
      const remainingMs     = expiresAtMs - now
      const totalDurationSec = Math.round((expiresAtMs - createdAtMs) / 1000)
      // UTC: usado pelo countdown local (compara com Date.now()/1000)
      const utcExpiryTime   = Math.floor(expiresAtMs / 1000)
      // BRT: usado pelo eixo de tempo do chart (timeline em UTC-3).
      // entryTime e expiryTime precisam ESTAR NO MESMO offset, senao a linha
      // de entrada fica fora do range visivel (estava 3h pra tras).
      const entryTimeChart  = Math.floor(createdAtMs / 1000) + BRT_OFFSET
      const expiryTimeChart = Math.floor(expiresAtMs / 1000) + BRT_OFFSET

      if (remainingMs <= 0) {
        // Já venceu enquanto o usuário estava fora.
        // Manual/own: liquida via client (comportamento existente).
        // Externa: NÃO toca na liquidação — backend resolve e o Realtime (UPDATE)
        // joga pro Histórico.
        if (!external) {
          secureRpc('settle_trade', {
            p_operation_id: op.id,
            p_exit_price:   livePriceRef.current ?? assetObj.price,
          }).then(() => refreshAccounts())
        }
        continue
      }

      // Ainda ativa — recria no estado local (countdown usa UTC)
      toAdd.push({
        id: op.id,
        asset: assetObj,
        direction: op.direction as 'CALL' | 'PUT',
        amount: op.amount,
        profit: 0,
        expiryTime: utcExpiryTime,
        entryPrice: op.entry_price,
        duration: totalDurationSec,
      })

      // Notifica o gráfico (precisa de BRT em ambos os campos)
      onTradeOpened?.({
        id: op.id,
        assetId: assetObj.id,
        entryPrice: op.entry_price,
        entryTime:  entryTimeChart,
        expiryTime: expiryTimeChart,
        direction: op.direction as 'CALL' | 'PUT',
        amount: op.amount,
        payout: op.payout_pct,
      })

      if (external) {
        // DISPLAY-ONLY (ex: PulseHacker): ao expirar só some das abertas e atualiza
        // saldo/histórico. SEM settle_trade, SEM popup, SEM reconcile — a liquidação
        // é responsabilidade exclusiva do backend.
        externalIdsRef.current.add(op.id)
        const tidExt = setTimeout(() => {
          timeoutMap.current.delete(op.id)
          externalIdsRef.current.delete(op.id)
          setOpenTrades(prev => prev.filter(t => t.id !== op.id))
          onTradeExpired?.(op.id)
          refreshAccounts()
          loadHistory()
        }, remainingMs)
        timeoutMap.current.set(op.id, tidExt)
        continue
      }

      // Manual/own: reregistra o timer de liquidação com o tempo restante real.
      // Mesma estrategia do caminho fresh (placeTrade): popup imediato com
      // calculo local + reconcileWithBackend para corrigir se necessario.
      const tid = setTimeout(async () => {
        timeoutMap.current.delete(op.id)
        const exitPrice = livePriceRef.current ?? assetObj.price
        const dir = op.direction as 'CALL' | 'PUT'

        const realWon    = dir === 'CALL' ? exitPrice > op.entry_price : exitPrice < op.entry_price
        const realProfit = realWon ? parseFloat((op.amount * (op.payout_pct / 100)).toFixed(2)) : 0
        // Studio Mode: forca vitoria visual / silencia popup de derrota (cosmetico)
        const forcedWin = studioEnabled && studioConsumeForceWin()
        const localWon    = forcedWin ? true : realWon
        const localProfit = forcedWin
          ? parseFloat((op.amount * (op.payout_pct / 100)).toFixed(2))
          : realProfit
        const suppressPopup = studioEnabled && studioSilenceLossPopup && !localWon

        setOpenTrades(prev => prev.filter(t => t.id !== op.id))
        onTradeExpired?.(op.id)
        if (!suppressPopup) {
          setTradeResult({ direction: dir, amount: op.amount, profit: localProfit, won: localWon })
          if (showResultPopup) playSound(localWon ? 'win' : 'loss')
        }

        await reconcileWithBackend(op.id, exitPrice, dir, op.amount, realWon, realProfit)
        await refreshAccounts()
        loadHistory()
      }, remainingMs)
      timeoutMap.current.set(op.id, tid)
    }

    if (toAdd.length > 0) {
      setOpenTrades(prev => {
        const existingIds = new Set(prev.map(t => t.id))
        return [...toAdd.filter(t => !existingIds.has(t.id)), ...prev]
      })
      setActiveTab('operacoes')
    }
  }, [accountId, onTradeOpened, onTradeExpired, refreshAccounts, loadHistory])

  useEffect(() => {
    loadOpenTrades()
  }, [loadOpenTrades])

  // Liquidação vinda de FORA deste navegador (backend OTC, outro device, early close
  // remoto). Mantém o painel coerente. Para trade manual/own com timer local pendente,
  // NÃO interfere — deixa o timer local mostrar o popup + reconcile. Só visibilidade.
  const onRemoteSettle = useCallback((opId: string) => {
    const hasLocalTimer = timeoutMap.current.has(opId)
    const isExternal    = externalIdsRef.current.has(opId)
    if (hasLocalTimer && !isExternal) return  // manual/own: timer local cuida

    const tid = timeoutMap.current.get(opId)
    if (tid !== undefined) { clearTimeout(tid); timeoutMap.current.delete(opId) }
    externalIdsRef.current.delete(opId)
    setOpenTrades(prev => prev.filter(t => t.id !== opId))
    onTradeExpired?.(opId)
    refreshAccounts()
    loadHistory()
  }, [onTradeExpired, refreshAccounts, loadHistory])

  // ── Realtime: operações da conta (qualquer origem) aparecem/somem ao vivo ──────
  // Assina a tabela operations filtrando por account_id (a RLS "select own" já
  // restringe ao dono). INSERT (status OPEN) -> recarrega abertas (dedup-safe).
  // UPDATE p/ status final -> remove das abertas + atualiza saldo/histórico. Cobre
  // trades abertos por fora (PulseHacker). NÃO mexe na liquidação — só visibilidade.
  useEffect(() => {
    if (!accountId) return
    const channel = supabase
      .channel(`ops:${accountId}:${instanceIdRef.current}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'operations', filter: `account_id=eq.${accountId}` },
        (payload) => { if ((payload.new as { status?: string })?.status === 'OPEN') loadOpenTrades() })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'operations', filter: `account_id=eq.${accountId}` },
        (payload) => {
          const op = payload.new as { id?: string; status?: string }
          if (op?.id && ['WON', 'LOST', 'DRAW'].includes(op.status ?? '')) onRemoteSettle(op.id)
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [accountId, loadOpenTrades, onRemoteSettle])

  // Cancela todos os timeouts pendentes ao desmontar o componente
  useEffect(() => {
    return () => {
      timeoutMap.current.forEach(tid => clearTimeout(tid))
      timeoutMap.current.clear()
    }
  }, [])

  // Ref interno como fallback — preferimos o externalPriceRef (síncrono, sem lag de re-render)
  const internalPriceRef = useRef(livePrice)
  useEffect(() => { internalPriceRef.current = livePrice }, [livePrice])
  const livePriceRef = externalPriceRef ?? internalPriceRef

  async function handleDoubleUp(trade: OpenTrade, remaining: number) {
    if (!accountId) return
    const entryPrice = livePriceRef.current ?? trade.entryPrice
    const expiresAt  = new Date(Date.now() + remaining * 1000).toISOString()
    const BRT_OFFSET = -3 * 3600
    const entryTime  = Math.floor(Date.now() / 1000) + BRT_OFFSET
    const expiryTime = entryTime + remaining

    const { data, error } = await secureRpc('place_trade', {
      p_account_id:   accountId,
      p_asset_id:     trade.asset.id,
      p_asset_symbol: trade.asset.label,
      p_direction:    trade.direction,
      p_amount:       trade.amount,
      p_payout_pct:   trade.asset.payout,
      p_entry_price:  entryPrice,
      p_expires_at:   expiresAt,
    })

    if (error) {
      if (error.message.includes('INSUFFICIENT_BALANCE')) setTradeError('Saldo insuficiente para dobrar.')
      else setTradeError('Erro ao dobrar operação.')
      if (showResultPopup) playSound('error')
      return
    }

    const newId = (data as any)?.id ?? `local-${Date.now()}`
    const utcExpiry = Math.floor(Date.now() / 1000) + remaining

    setOpenTrades(prev => [{
      id: newId, asset: trade.asset, direction: trade.direction,
      amount: trade.amount, profit: 0, expiryTime: utcExpiry, entryPrice,
      duration: remaining,
    }, ...prev])

    onTradeOpened?.({ id: newId, assetId: trade.asset.id, entryPrice, entryTime, expiryTime, direction: trade.direction, amount: trade.amount, payout: trade.asset.payout })
    if (showResultPopup) playSound('open')

    const tidDouble = setTimeout(async () => {
      timeoutMap.current.delete(newId)
      const exitPrice = livePriceRef.current ?? trade.asset.price
      if (!newId.startsWith('local-')) {
        await secureRpc('settle_trade', { p_operation_id: newId, p_exit_price: exitPrice })
      }
      setOpenTrades(prev => prev.filter(t => t.id !== newId))
      onTradeExpired?.(newId)
      await refreshAccounts()
      if (activeTab === 'historico') loadHistory()
    }, remaining * 1000)
    timeoutMap.current.set(newId, tidDouble)
  }

  async function handleEarlyClose(trade: OpenTrade, refund: number) {
    // Cancela o timeout de liquidação para evitar double-settle
    const tid = timeoutMap.current.get(trade.id)
    if (tid !== undefined) {
      clearTimeout(tid)
      timeoutMap.current.delete(trade.id)
    }

    // Quem manda no valor devolvido e o servidor (early_close_trade). Ele usa a
    // mesma formula do botao, mas o cronometro do navegador nunca bate no
    // milissegundo com o now() do banco — entao o popup mostra o refund que
    // voltou da RPC, nao o que estava na tela no instante do clique.
    let refundFinal = refund
    if (!trade.id.startsWith('local-')) {
      const { data, error } = await secureRpc<{ ok: boolean; refund: number }>('early_close_trade', {
        p_operation_id: trade.id,
        p_refund_amount: refund,
      })
      if (error) { setTradeError('Erro ao fechar antecipado.'); if (showResultPopup) playSound('error'); return }
      if (typeof data?.refund === 'number') refundFinal = data.refund
    }
    setOpenTrades(prev => prev.filter(t => t.id !== trade.id))
    onTradeExpired?.(trade.id)
    setTradeResult({ direction: trade.direction, amount: trade.amount, profit: refundFinal - trade.amount, won: false })
    await refreshAccounts()
    if (activeTab === 'historico') loadHistory()
  }

  const selectedDuration = TIME_OPTIONS[timeIndex]
  const payoutPct = selectedDuration === 300 ? asset.payout5min : asset.payout
  const payout    = payoutPct / 100
  const payment   = Math.round(investment + investment * payout)
  // Studio Mode: payout exibido pode ser boostado (puramente cosmetico).
  // payoutPct/payout reais continuam alimentando o backend (linhas 729, 759).
  const payoutPctDisplay = payoutPct + studioPayoutBoost
  const payoutDisplay    = payoutPctDisplay / 100

  function commitInvestment(raw: string) {
    const num = parseFloat(raw.replace(/[^0-9.,]/g, '').replace(',', '.'))
    if (!isNaN(num) && num >= 1) setInvestment(Math.round(num * 100) / 100)
    setEditingInvestment(false)
  }

  async function placeTrade(direction: 'CALL' | 'PUT') {
    if (!accountId) return
    // Trava sincrona: se ja tem um disparo em andamento, ignora o segundo clique.
    if (submitLockRef.current) return
    const entryPrice = livePriceRef.current
    if (entryPrice == null) {
      setTradeError('Aguarde o gráfico carregar o preço.')
      if (showResultPopup) playSound('error')
      return
    }
    submitLockRef.current = true
    setTradeError('')
    setPlacing(true)
    try {
      const expiresInSec = TIME_OPTIONS[timeIndex]
      const BRT_OFFSET   = -3 * 3600
      const entryTime    = Math.floor(Date.now() / 1000) + BRT_OFFSET
      const expiryTime   = entryTime + expiresInSec
      const expiresAt    = new Date(Date.now() + expiresInSec * 1000).toISOString()

      const { data, error } = await secureRpc('place_trade', {
        p_account_id:   accountId,
        p_asset_id:     asset.id,
        p_asset_symbol: asset.label,
        p_direction:    direction,
        p_amount:       investment,
        p_payout_pct:   payoutPct,
        p_entry_price:  entryPrice,
        p_expires_at:   expiresAt,
      })

      if (error) {
        const msg = error.message ?? ''
        console.error('[trade] place_trade error:', msg, error)
        if (msg.includes('INSUFFICIENT_BALANCE'))      setTradeError('Saldo insuficiente.')
        else if (msg.includes('PRICE_UNAVAILABLE'))    setTradeError('Preço indisponível, tente novamente.')
        else if (msg.includes('MARKET_CLOSED'))        setTradeError('Mercado fechado para este ativo.')
        else if (msg.includes('ACCOUNT_NOT_FOUND'))    setTradeError('Conta não encontrada.')
        else setTradeError(`Erro ao abrir: ${msg.slice(0, 80)}`)
        if (showResultPopup) playSound('error')
        return
      }

      const operationId: string = (data as any)?.id ?? `local-${Date.now()}`
      const utcExpiryTime = Math.floor(Date.now() / 1000) + expiresInSec

      setOpenTrades(prev => [{
        id: operationId, asset, direction,
        amount: investment, profit: 0,
        expiryTime: utcExpiryTime, entryPrice,
        duration: expiresInSec,
      }, ...prev])
      setActiveTab('operacoes')

      onTradeOpened?.({
        id: operationId, assetId: asset.id, entryPrice, entryTime, expiryTime,
        direction, amount: investment, payout: payoutPct,
      })

      setConfirmTrade(null)
      if (showResultPopup) playSound('open')

      // Liquidar operação ao expirar com o preço atual no momento da expiração.
      // UX: popup IMEDIATO baseado no preço local (livePriceRef = mesmo que aparece
      // no chart). Em paralelo, busca o resultado oficial do banco. Se houver
      // divergencia clara, atualiza o popup. Se nao, mantem o local.
      const tidPlace = setTimeout(async () => {
        timeoutMap.current.delete(operationId)
        const exitPrice = livePriceRef.current ?? asset.price

        // Calculo local imediato — popup sem esperar nada do servidor
        const realWon    = direction === 'CALL' ? exitPrice > entryPrice : exitPrice < entryPrice
        // payout ja eh decimal (0.87 pra 87%) — definido na linha 562. Dividir por
        // 100 de novo daria 0.0087, fazendo o profit aparecer 100x menor (R$ 0,10
        // em vez de R$ 9,57 num stake de R$ 11 com 87% de payout).
        const realProfit = realWon ? parseFloat((investment * payout).toFixed(2)) : 0
        // Studio Mode: cosmetico — forca vitoria / silencia popup de derrota
        const forcedWin   = studioEnabled && studioConsumeForceWin()
        const localWon    = forcedWin ? true : realWon
        const localProfit = forcedWin ? parseFloat((investment * payout).toFixed(2)) : realProfit
        const suppressPopup = studioEnabled && studioSilenceLossPopup && !localWon

        setOpenTrades(prev => prev.filter(t => t.id !== operationId))
        onTradeExpired?.(operationId)
        if (!suppressPopup) {
          setTradeResult({ direction, amount: investment, profit: localProfit, won: localWon })
          if (showResultPopup) playSound(localWon ? 'win' : 'loss')
        }

        // Background: confirma resultado oficial no banco (sempre passa o real
        // pro reconcile — banco/saldo refletem realidade)
        if (!operationId.startsWith('local-')) {
          await reconcileWithBackend(operationId, exitPrice, direction, investment, realWon, realProfit)
        }

        await refreshAccounts()
        if (activeTab === 'historico') loadHistory()
      }, expiresInSec * 1000)
      timeoutMap.current.set(operationId, tidPlace)

    } catch (err: any) {
      console.error('[trade] placeTrade exception:', err)
      setTradeError(`Erro ao abrir: ${err?.message?.slice(0, 80) ?? 'desconhecido'}`)
      if (showResultPopup) playSound('error')
    } finally {
      setPlacing(false)
      submitLockRef.current = false
    }
  }

  const timeDisplay = expiryLabel(TIME_OPTIONS[timeIndex], nowBRT)

  function adjustInvestment(delta: number) {
    setInvestment(v => Math.max(1, Math.round((v + delta) * 100) / 100))
    playSound('toggle')
  }

  function adjustTime(delta: number) {
    setTimeIndex(i => Math.max(0, Math.min(TIME_OPTIONS.length - 1, i + delta)))
    playSound('toggle')
  }

  // Expõe placeTrade pro pai (usado pelo MobileTradingSheet pra disparar trade
  // a partir dos botões rápidos sem expandir o painel)
  useImperativeHandle(ref, () => ({
    placeTrade: (direction: 'CALL' | 'PUT') => {
      if (placing || livePriceRef.current == null || !marketOpen) return
      if (oneClickTrade) placeTrade(direction)
      else setConfirmTrade(direction)
    },
    canTrade: !placing && livePrice != null && marketOpen,
  }), [placing, livePrice, marketOpen, oneClickTrade])

  return (
    <aside className={cn(
      mobile ? 'w-full' : 'w-[290px] flex-shrink-0 ml-3',
      'flex flex-col gap-3 overflow-hidden',
      hidden && 'hidden'
    )}>

      {/* Trade result popup — portal pro <body> pra escapar do display:none quando
          o painel está oculto (sheet colapsado em mobile, modo paisagem, etc.) */}
      {tradeResult && showResultPopup && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div
            data-testid="trade-result-popup"
            className="pointer-events-auto relative flex items-center gap-3.5 rounded-2xl border border-[#1A2432] bg-[#0B1220]/95 pl-4 pr-9 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Faixa de acento à esquerda */}
            <span
              className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
              style={{ backgroundColor: tradeResult.draw ? '#F0B429' : tradeResult.won ? '#1FD196' : '#F0435A' }}
            />

            {/* Ícone */}
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
              style={{
                color: tradeResult.draw ? '#F0B429' : tradeResult.won ? '#1FD196' : '#F0435A',
                borderColor: (tradeResult.draw ? '#F0B429' : tradeResult.won ? '#1FD196' : '#F0435A') + '40',
                backgroundColor: (tradeResult.draw ? '#F0B429' : tradeResult.won ? '#1FD196' : '#F0435A') + '14',
              }}
            >
              {tradeResult.draw
                ? <Minus size={17} strokeWidth={2.6} />
                : tradeResult.won
                  ? <ArrowUp size={17} strokeWidth={2.6} />
                  : <ArrowDown size={17} strokeWidth={2.6} />}
            </span>

            <div className="flex flex-col gap-[3px] leading-none">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#7E8DA2]">
                {tradeResult.draw ? 'Empate' : tradeResult.won ? 'Operação ganha' : 'Operação perdida'}
              </span>
              <span
                className="text-[21px] font-bold tabular-nums tracking-[-0.01em]"
                style={{ color: tradeResult.draw ? '#F0B429' : tradeResult.won ? '#1FD196' : '#F0435A' }}
              >
                {tradeResult.draw
                  ? 'R$ 0,00'
                  : tradeResult.won
                    ? `+R$ ${fmtMoney(tradeResult.profit)}`
                    : `-R$ ${fmtMoney(tradeResult.amount)}`}
              </span>
              <span className="text-[10.5px] font-medium text-[#5D6C80]">
                {tradeResult.direction === 'CALL' ? 'Compra' : 'Venda'} · R$ {fmtMoney(tradeResult.amount)}
              </span>
            </div>

            <button
              onClick={() => setTradeResult(null)}
              className="absolute right-2.5 top-2.5 text-[#3E4C5E] transition-colors hover:text-white"
            >
              <X size={13} />
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── Painel de negociação ──────────────────────────────────────── */}
      <section className={cn('flex flex-col', mobile ? '' : 'rounded-xl border border-[#141C28] bg-[#0A101A] pb-4')}>
      <div className="flex items-center justify-between px-4 pt-3.5">
        <h3 className="text-[11.5px] font-bold uppercase tracking-[0.11em] text-[#D3DCE8]">Negociação</h3>
      </div>

      {/* Tempo */}
      {/* ── Mobile: Tempo, Valor e Lucro numa linha só ──────────────────────
          O empilhado do desktop consome altura demais no celular, onde o que
          importa é ver o gráfico e ajustar rápido antes de entrar. Atalhos de
          investimento e "retorno estimado" saem: o Lucro aqui já dá a leitura. */}
      {mobile && (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 pt-3">
          <div>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#7E8DA2]">Tempo</span>
            <div className="flex items-center justify-between rounded-lg border border-[#1B2735] bg-[#0C1320] px-1 py-1">
              <button
                onClick={() => adjustTime(-1)}
                disabled={timeIndex === 0}
                aria-label="Menos tempo"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#7A8AA0] transition-colors active:bg-[#131E2C] disabled:opacity-30"
              >
                <Minus size={15} />
              </button>
              <span className="min-w-0 truncate text-[14px] font-bold tabular-nums text-white">
                {expiryLabel(TIME_OPTIONS[timeIndex], nowBRT)}
              </span>
              <button
                onClick={() => adjustTime(1)}
                disabled={timeIndex === TIME_OPTIONS.length - 1}
                aria-label="Mais tempo"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#7A8AA0] transition-colors active:bg-[#131E2C] disabled:opacity-30"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#7E8DA2]">Valor</span>
            <div className="flex items-center justify-between rounded-lg border border-[#1B2735] bg-[#0C1320] px-1 py-1">
              <button
                onClick={() => adjustInvestment(-10)}
                aria-label="Menos investimento"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#7A8AA0] transition-colors active:bg-[#131E2C]"
              >
                <Minus size={15} />
              </button>
              <span className="min-w-0 truncate text-[14px] font-bold tabular-nums text-white">
                R${fmtMoney(investment)}
              </span>
              <button
                onClick={() => adjustInvestment(10)}
                aria-label="Mais investimento"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#7A8AA0] transition-colors active:bg-[#131E2C]"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#7E8DA2]">Lucro</span>
            <div className="flex h-[42px] items-center justify-center rounded-lg border border-[#1FD196]/30 bg-[#1FD196]/10 px-3">
              <span className="text-[14px] font-bold tabular-nums text-[#1FD196]">+{payoutPctDisplay}%</span>
            </div>
          </div>
        </div>
      )}

      {!mobile && (
      <>
      <FloatingBox label="Tempo" sub={TIME_OPTIONS[timeIndex] >= 60 ? `Duração: ${Math.round(TIME_OPTIONS[timeIndex] / 60)} min` : `Duração: ${TIME_OPTIONS[timeIndex]} s`}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => adjustTime(-1)}
            disabled={timeIndex === 0}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-md text-[#7A8AA0] hover:bg-[#131E2C] hover:text-white transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <Minus size={15} />
          </button>

          {/* Horário absoluto de expiração — abre grid ao clicar */}
          <div className="flex-1 text-center relative">
            <button
              onClick={() => setTimerPickerOpen(v => !v)}
              className="text-[15px] font-bold text-white tracking-[0.02em] w-full tabular-nums"
            >
              {timeDisplay}
            </button>

            {timerPickerOpen && (
              <div
                className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-[#0E1620] border border-[#16202D] rounded-xl z-50 p-2 shadow-2xl"
                style={{ width: '240px' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="grid grid-cols-4 gap-1">
                  {TIME_OPTIONS.map((duration, i) => (
                    <button
                      key={duration}
                      onClick={() => { setTimeIndex(i); setTimerPickerOpen(false); playSound('toggle') }}
                      className={cn(
                        'py-1.5 text-[11px] font-bold rounded-lg transition-colors',
                        i === timeIndex
                          ? 'bg-blue-600 text-white'
                          : 'text-[#7E8DA2] hover:text-white hover:bg-white/5'
                      )}
                    >
                      {expiryLabel(duration, nowBRT)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => adjustTime(1)}
            disabled={timeIndex === TIME_OPTIONS.length - 1}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-md text-[#7A8AA0] hover:bg-[#131E2C] hover:text-white transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <Plus size={15} />
          </button>
        </div>
      </FloatingBox>

      {/* Investimento */}
      <FloatingBox label="Investimento">
        <div className="flex items-center gap-2">
          <button
            onClick={() => adjustInvestment(-10)}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-md text-[#7A8AA0] hover:bg-[#131E2C] hover:text-white transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <Minus size={15} />
          </button>
          <div className="flex-1 text-center">
            {editingInvestment ? (
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={investmentRaw}
                onChange={e => setInvestmentRaw(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => commitInvestment(investmentRaw)}
                onKeyDown={e => { if (e.key === 'Enter') commitInvestment(investmentRaw); if (e.key === 'Escape') setEditingInvestment(false) }}
                placeholder={String(investment)}
                className="w-full bg-transparent text-[15px] font-bold text-white text-center outline-none border-b border-blue-500 placeholder:text-white/30"
              />
            ) : (
              <button
                onClick={() => { setInvestmentRaw(''); setEditingInvestment(true) }}
                className="text-[15px] font-bold text-white w-full tabular-nums"
                title="Clique para editar"
              >
                R$ {fmtMoney(investment)}
              </button>
            )}
          </div>
          <button
            onClick={() => adjustInvestment(10)}
            className="w-[26px] h-[26px] flex items-center justify-center rounded-md text-[#7A8AA0] hover:bg-[#131E2C] hover:text-white transition-colors disabled:opacity-30 flex-shrink-0"
          >
            <Plus size={15} />
          </button>
        </div>
      </FloatingBox>

      {/* Atalhos de investimento */}
      <div className="grid grid-cols-4 gap-2 px-4 pt-3.5">
        {[5, 10, 50, 100].map(q => (
          <button
            key={q}
            data-testid={`quick-invest-${q}`}
            onClick={() => adjustInvestment(q)}
            className="rounded-lg border border-[#1B2735] bg-[#0C1320] py-[9px] text-[11.5px] font-semibold text-[#AEBBCB] transition-colors duration-200 hover:border-[#2B3D52] hover:text-white"
          >
            +{q}
          </button>
        ))}
      </div>

      {/* Pagamento */}
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <span className="text-[11.5px] text-[#7E8DA2]">Retorno estimado</span>
        <span className="text-[15px] font-bold leading-none tabular-nums text-[#1FD196]">
          +R$ {fmtMoney(Math.round(investment * payoutDisplay))}
        </span>
        <span className="hidden">{payoutPctDisplay}%</span>
      </div>
      </>
      )}

      {/* CALL / PUT buttons — lado a lado no mobile, empilhados no desktop */}
      <div className={cn('px-3 pb-3 flex gap-2', mobile && !confirmTrade ? 'flex-row' : 'flex-col')}>
        {confirmTrade ? (
          <div className="flex flex-col gap-2">
            <div className="text-center text-xs text-[#7E8DA2] font-semibold py-1">
              Confirmar{' '}
              <span className={cn('font-bold', confirmTrade === 'CALL' ? 'text-[#1FD196]' : 'text-[#F0435A]')}>
                {confirmTrade === 'CALL' ? 'Compra' : 'Venda'}
              </span>
              {' '}— R$ {fmtMoney(investment)}?
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmTrade(null)}
                className="flex-1 h-10 rounded-xl border border-[#1B2735] text-[#7E8DA2] hover:text-white hover:border-white/30 text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmTrade && placeTrade(confirmTrade)}
                disabled={placing}
                className={cn(
                  'flex-1 h-10 rounded-xl font-bold text-white text-sm transition-all active:scale-[0.97] disabled:opacity-50',
                  confirmTrade === 'CALL' ? 'bg-[#1FD196] hover:bg-[#2bbbad]' : 'bg-[#F0435A] hover:bg-[#f44336]'
                )}
              >
                {placing ? '...' : 'Confirmar'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {!marketOpen && (
              <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-center">
                <div className="text-xs font-bold text-red-400 mb-0.5">⏸ Mercado fechado</div>
                <div className="text-[10px] text-[#AEBBCB]">
                  Forex opera de Dom 22h UTC a Sex 22h UTC. Reabre em <span className="font-bold text-white">{reopenIn}</span>.
                </div>
              </div>
            )}
            <button
              onClick={() => oneClickTrade ? placeTrade('CALL') : setConfirmTrade('CALL')}
              onMouseEnter={() => window.dispatchEvent(new CustomEvent('vx-trade-hover', { detail: 'CALL' }))}
              onMouseLeave={() => window.dispatchEvent(new CustomEvent('vx-trade-hover', { detail: null }))}
              disabled={placing || livePrice == null || !marketOpen}
              title={!marketOpen ? `Mercado fechado · reabre em ${reopenIn}` : ''}
              className={cn(
                'rounded-[10px] border border-[#2BD68F]/40 bg-gradient-to-b from-[#1BB878] to-[#12915B] px-4 flex items-center gap-2 shadow-[0_6px_18px_rgba(27,184,120,0.18)] transition-all duration-200 hover:from-[#20C983] hover:to-[#149E63] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
                // No mobile divide a linha com o ABAIXO; no desktop ocupa tudo.
                mobile ? 'flex-1 min-w-0 py-[18px] justify-center text-center' : 'w-full py-[13px] text-left gap-3',
              )}
            >
              <ArrowUp size={mobile ? 24 : 22} strokeWidth={2.4} className="text-white" />
              <span className={cn('flex leading-none', mobile ? 'items-center' : 'flex-col')}>
                <span className={cn('font-bold uppercase tracking-[0.06em] text-white', mobile ? 'text-[16px]' : 'text-[14px]')}>
                  {mobile ? 'Acima' : 'Compra'}
                </span>
                {!mobile && (
                  <span className="mt-[5px] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/70">Call</span>
                )}
              </span>
            </button>
            <button
              onClick={() => oneClickTrade ? placeTrade('PUT') : setConfirmTrade('PUT')}
              onMouseEnter={() => window.dispatchEvent(new CustomEvent('vx-trade-hover', { detail: 'PUT' }))}
              onMouseLeave={() => window.dispatchEvent(new CustomEvent('vx-trade-hover', { detail: null }))}
              disabled={placing || livePrice == null || !marketOpen}
              title={!marketOpen ? `Mercado fechado · reabre em ${reopenIn}` : ''}
              className={cn(
                'rounded-[10px] border border-[#E5384F]/35 bg-gradient-to-b from-[#B62B41] to-[#8A1C2C] px-4 flex items-center gap-2 shadow-[0_6px_18px_rgba(182,43,65,0.18)] transition-all duration-200 hover:from-[#C7304A] hover:to-[#991F31] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
                mobile ? 'flex-1 min-w-0 py-[18px] justify-center text-center' : 'w-full py-[13px] text-left gap-3',
              )}
            >
              <ArrowDown size={mobile ? 24 : 22} strokeWidth={2.4} className="text-white" />
              <span className={cn('flex leading-none', mobile ? 'items-center' : 'flex-col')}>
                <span className={cn('font-bold uppercase tracking-[0.06em] text-white', mobile ? 'text-[16px]' : 'text-[14px]')}>
                  {mobile ? 'Abaixo' : 'Venda'}
                </span>
                {!mobile && (
                  <span className="mt-[5px] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/70">Put</span>
                )}
              </span>
            </button>
            {tradeError && <p className="text-red-400 text-xs text-center mt-1">{tradeError}</p>}
          </>
        )}
      </div>

      </section>

      {/* ── Posições / Histórico ──────────────────────────────────────── */}
      {/* No mobile vira drawer: fundo clicável só existe quando está aberto. */}
      {mobile && positionsDrawer && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => onPositionsDrawerClose?.()} />
      )}
      <section className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        !mobile && 'flex-1 rounded-xl border border-[#141C28] bg-[#0A101A]',
        // Mobile sem drawer aberto: some. O painel fixo mostra só Tempo, Valor
        // e os botões — que é o que se usa a cada operação.
        mobile && !positionsDrawer && 'hidden',
        mobile && positionsDrawer &&
          'vx-drawer-up fixed inset-x-0 bottom-0 z-50 max-h-[72vh] flex-1 rounded-t-2xl border-t border-[#1B2735] bg-[#0C131F] shadow-[0_-20px_50px_rgba(0,0,0,0.6)]',
      )}>
      {mobile && positionsDrawer && (
        <div className="flex shrink-0 items-center justify-between px-4 pt-3">
          <span className="h-1 w-9 rounded-full bg-[#2A3A4D]" aria-hidden="true" />
          <button
            onClick={() => onPositionsDrawerClose?.()}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#7E8DA2] transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex border-b border-[#141C28] flex-shrink-0">
        <button
          data-testid="tab-posicoes"
          onClick={() => { setActiveTab('operacoes'); playSound('click') }}
          className={cn(
            'relative flex flex-1 items-center justify-center gap-2 py-[13px] text-[11px] font-bold uppercase tracking-[0.1em] transition-colors duration-200',
            activeTab === 'operacoes' ? 'text-[#E4EBF5]' : 'text-[#67768B] hover:text-[#AEBBCB]',
          )}
        >
          Posições
          <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#2E6BE6] px-1 text-[9.5px] font-bold text-white">
            {openTradesUnique.length}
          </span>
          {activeTab === 'operacoes' && <span className="absolute bottom-[-1px] left-0 h-[2px] w-full bg-[#2E6BE6]" />}
        </button>
        <button
          data-testid="tab-historico"
          onClick={() => { setActiveTab('historico'); playSound('click') }}
          className={cn(
            'relative flex-1 py-[13px] text-[11px] font-bold uppercase tracking-[0.1em] transition-colors duration-200',
            activeTab === 'historico' ? 'text-[#E4EBF5]' : 'text-[#67768B] hover:text-[#AEBBCB]',
          )}
        >
          Histórico
          {activeTab === 'historico' && <span className="absolute bottom-[-1px] left-0 h-[2px] w-full bg-[#2E6BE6]" />}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {activeTab === 'operacoes' ? (
          openTradesUnique.length === 0 ? (
            <EmptyState message="Não há operações abertas." />
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-1.5 mt-1">
                <span className="text-[10px] font-bold text-[#7E8DA2] tracking-wide">
                  {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }).toUpperCase()}
                </span>
                <div className="w-5 h-5 rounded-full bg-[#101825] flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white">{openTradesUnique.length}</span>
                </div>
              </div>
              {openTradesUnique.map((trade) => (
                <TradeItem
                  key={trade.id}
                  trade={trade}
                  shortLabels={shortLabels}
                  currentPrice={priceMap.get(trade.asset.id)}
                  onDoubleUp={handleDoubleUp}
                  onEarlyClose={handleEarlyClose}
                />
              ))}
            </>
          )
        ) : activeTab === 'historico' ? (
          historyLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[#7E8DA2] text-xs animate-pulse">Carregando...</span>
            </div>
          ) : history.length === 0 && !(studioEnabled && studioFakeHistory.length > 0) ? (
            <EmptyState message="Nenhuma operação encerrada ainda." />
          ) : (() => {
            // Studio Mode: injeta historico fake + filtra perdas (cosmetico)
            let displayed: ClosedTrade[] = history
            if (studioEnabled && studioFakeHistory.length > 0) {
              const fakeAsClosed: ClosedTrade[] = studioFakeHistory.map((f: FakeHistoryItem) => ({
                id:           f.id,
                asset_symbol: f.asset_symbol,
                direction:    f.direction,
                amount:       f.amount,
                payout_pct:   f.payout_pct,
                entry_price:  0,
                exit_price:   null,
                status:       'WON',
                profit:       f.profit,
                created_at:   f.closed_at,
                closed_at:    f.closed_at,
              }))
              displayed = [...fakeAsClosed, ...displayed]
            }
            if (studioEnabled && studioHideLosses) {
              displayed = displayed.filter(op => op.status === 'WON')
            }
            if (displayed.length === 0) {
              return <EmptyState message="Nenhuma operação encerrada ainda." />
            }
            return (
              <div className="flex flex-col">
                {displayed.map((op) => (
                  <HistoryItem key={op.id} op={op} />
                ))}
              </div>
            )
          })()
          ) : (
          <EmptyState message={'A lista de pedidos está vazia.\nCrie uma negociação pendente usando o formulário acima.'} />
        )}
      </div>

      {/* Rodapé */}
      <div className="border-t border-[#141C28] p-3 flex-shrink-0">
        <button
          data-testid="ver-todas-posicoes"
          onClick={onVerTodasPosicoes}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#1B2735] bg-[#0C1320] py-[11px] text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#AEBBCB] transition-colors duration-200 hover:border-[#2B3D52] hover:text-white"
        >
          Ver todas posições
          <ExternalLink size={13} />
        </button>
      </div>
      </section>
    </aside>
  )
})

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
      <div className="w-14 h-14 rounded-full bg-[#101825] flex items-center justify-center mb-4">
        <Package size={24} className="text-[#7E8DA2]" />
      </div>
      <p className="text-[13px] text-[#7E8DA2] leading-relaxed whitespace-pre-line">{message}</p>
    </div>
  )
}

function HistoryItem({ op }: { op: ClosedTrade }) {
  const studioOtc = useStudioMode(s => s.enabled && s.hideOtcTag)
  const assetSymbol = studioOtc ? applyHideOtc(op.asset_symbol, true) : op.asset_symbol
  const won  = op.status === 'WON'
  const draw = op.status === 'DRAW'
  const profit = op.profit ?? 0
  const date = op.closed_at
    ? new Date(op.closed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#131B27] hover:bg-white/[0.02] transition-colors">
      {/* Direção */}
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
        op.direction === 'CALL' ? 'bg-[#1FD196]/20' : 'bg-[#F0435A]/20'
      )}>
        {op.direction === 'CALL'
          ? <ArrowUp size={13} className="text-[#1FD196]" />
          : <ArrowDown size={13} className="text-[#F0435A]" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-white truncate">{assetSymbol}</span>
          <span className={cn(
            'text-[12px] font-bold',
            won ? 'text-[#1FD196]' : draw ? 'text-yellow-400' : 'text-[#F0435A]'
          )}>
            {won ? `+${profit.toFixed(2)} R$` : draw ? '0.00 R$' : `-${op.amount.toFixed(2)} R$`}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-[#7E8DA2]">{date}</span>
          <span className={cn(
            'text-[9px] font-bold px-1.5 py-0.5 rounded',
            won ? 'bg-[#1FD196]/20 text-[#1FD196]' : draw ? 'bg-yellow-400/20 text-yellow-400' : 'bg-[#F0435A]/20 text-[#F0435A]'
          )}>
            {won ? 'GANHOU' : draw ? 'EMPATE' : 'PERDEU'}
          </span>
        </div>
      </div>
    </div>
  )
}
