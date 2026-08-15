'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, ZoomIn, ZoomOut, Crosshair, ChevronDown, Eye, Pen, X, Activity, Bell, MoreHorizontal, Maximize, Minus, Plus, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { generateMockCandles, getOTCPrice, getAssetDecimals, type Asset, type Candle, type ActiveTrade } from '@/lib/mockData'
import { REAL_ASSETS, tfToBinanceInterval } from '@/lib/marketSymbols'
import { isForexOpen } from '@/lib/marketHours'
import { subscribeOtc, assetIdToOtcSymbol, fetchOtcCandles, OTC_BACKEND_TFS, type OtcSubscription } from '@/lib/otcClient'
import { cn } from '@/lib/utils'
import { FlagPair } from '@/components/ui/FlagPair'
import { ChartLoader } from './ChartLoader'
import { PromoBanners } from './PromoBanners'
import { getCandleColors, type CandleColors } from '@/lib/candleColors'
import { useIsMobile } from '@/lib/useIsMobile'
import { useStudioMode } from '@/lib/studioMode'
import { DrawingsPanel } from './DrawingsPanel'
import { DrawingSettingsPanel } from './DrawingSettingsPanel'
import { IndicadoresPanel, IMPLEMENTED_INDICATOR_IDS } from './IndicadoresPanel'
import { loadChartPrefs, saveGlobalChartPrefs, saveAssetChartPrefs } from '@/lib/chartPrefs'
import { BBSettingsPanel, type BBSettings, BB_DEFAULTS } from './BBSettingsPanel'
import { MASettingsPanel, type MASettings, type MAType, MA_DEFAULTS } from './MASettingsPanel'
import { MACDSettingsPanel, type MACDSettings, MACD_DEFAULTS } from './MACDSettingsPanel'
import { RSISettingsPanel, type RSISettings, RSI_DEFAULTS } from './RSISettingsPanel'
import { StochasticSettingsPanel, type StochasticSettings, STOCH_DEFAULTS } from './StochasticSettingsPanel'
import { AlligatorSettingsPanel, type AlligatorSettings, ALLIGATOR_DEFAULTS } from './AlligatorSettingsPanel'
import { FractalSettingsPanel, type FractalSettings, FRACTAL_DEFAULTS } from './FractalSettingsPanel'

// Só cabe UM oscilador no sub-painel — ligar um desliga os outros.
const OSC_INDICATOR_IDS = ['rsi', 'macd', 'stochastic'] as const

type ChartTheme = 'diurno' | 'crepusculo' | 'noite'
type ChartType = 'velas' | 'area' | 'barras' | 'heiken-ashi'

// ── Drawing tools ────────────────────────────────────────────────────────────
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
const FIB_COLORS = ['#F0435A', '#f7931a', '#f1c40f', '#1FD196', '#42a5f5', '#ab47bc', '#F0435A']
const DRAW_PALETTE = ['#2196f3', '#1FD196', '#F0435A', '#f7931a', '#ab47bc', '#f1c40f']
let _drawColorIdx = 0
function nextDrawColor() { return DRAW_PALETTE[(_drawColorIdx++) % DRAW_PALETTE.length] }

type DrawingStyle = 'solid' | 'dashed'
type Drawing =
  | { id: string; type: 'hline'; price: number; color: string; style?: DrawingStyle }
  | { id: string; type: 'vline'; time: number; color: string; style?: DrawingStyle }
  | { id: string; type: 'trendline'; p1: { time: number; price: number }; p2: { time: number; price: number }; color: string; style?: DrawingStyle }
  | { id: string; type: 'fib'; p1: { time: number; price: number }; p2: { time: number; price: number }; color: string; style?: DrawingStyle }
  | { id: string; type: 'rect'; p1: { time: number; price: number }; p2: { time: number; price: number }; color: string; style?: DrawingStyle }
  | { id: string; type: 'extline'; p1: { time: number; price: number }; p2: { time: number; price: number }; color: string; style?: DrawingStyle }
  // offset = distância em PREÇO entre a linha base (p1→p2) e a paralela
  | { id: string; type: 'channel'; p1: { time: number; price: number }; p2: { time: number; price: number }; offset: number; color: string; style?: DrawingStyle }

type DrawingPx =
  | { id: string; type: 'hline'; y: number; price: number; color: string }
  | { id: string; type: 'vline'; x: number; color: string }
  | { id: string; type: 'trendline'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { id: string; type: 'fib'; x1: number; y1: number; x2: number; y2: number; color: string; levels: Array<{ ratio: number; y: number; price: number }> }
  | { id: string; type: 'rect'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { id: string; type: 'extline'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { id: string; type: 'channel'; x1: number; y1: number; x2: number; y2: number; yOff: number; color: string }

// Ferramentas que precisam de DOIS cliques (ponto inicial + ponto final)
const TWO_POINT_TOOLS = new Set(['Linha de trend', 'Retração de Fibonacci', 'Retângulo', 'Linha Estendida', 'Canal paralelo'])

// Desenhos vindos do localStorage podem ter shape antigo/corrompido — só
// aceita os tipos que o chart sabe renderizar.
const DRAWING_TYPES: ReadonlySet<string> = new Set(['hline', 'vline', 'trendline', 'fib', 'rect', 'extline', 'channel'])
function sanitizeStoredDrawings(raw: unknown): Drawing[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((d: any) =>
    d && typeof d.id === 'string' && typeof d.color === 'string' && DRAWING_TYPES.has(d.type) &&
    (d.type !== 'channel' || typeof d.offset === 'number')
  ) as Drawing[]
}

const THEME_COLORS: Record<ChartTheme, {
  bg: string; text: string; grid: string; border: string; crosshair: string; labelBg: string
}> = {
  noite:     { bg: '#0A101A', text: '#7E8DA2', grid: '#131B27', border: '#16202D', crosshair: '#4a5568', labelBg: '#2d3748' },
  diurno:    { bg: '#ffffff', text: '#374151', grid: '#e5e7eb', border: '#d1d5db', crosshair: '#9ca3af', labelBg: '#f3f4f6' },
  crepusculo:{ bg: '#1f1b2e', text: '#a78bfa', grid: '#2d2640', border: '#3d3554', crosshair: '#6d5eac', labelBg: '#2d2640' },
}

interface Timeframe { label: string; seconds: number }
const TIMEFRAMES: Timeframe[] = [
  { label: '5s',  seconds: 5    },
  { label: '15s', seconds: 15   },
  { label: '30s', seconds: 30   },
  { label: '1m',  seconds: 60   },
  { label: '5m',  seconds: 300  },
  { label: '15m', seconds: 900  },
  { label: '30m', seconds: 1800 },
  { label: '1h',  seconds: 3600 },
  { label: '4h',  seconds: 14400},
  { label: '1D',  seconds: 86400},
]

const CHART_TYPES: { key: ChartType; label: string; icon: React.ReactNode }[] = [
  { key: 'area', label: 'Área', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <polyline points="1,12 5,7 9,9 13,3 15,5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <polygon points="1,12 5,7 9,9 13,3 15,5 15,13 1,13" fill="currentColor" opacity="0.3"/>
    </svg>
  )},
  { key: 'velas', label: 'Velas', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <line x1="4" y1="2" x2="4" y2="14" stroke="currentColor" strokeWidth="1"/>
      <rect x="2.5" y="5" width="3" height="5" fill="#1FD196"/>
      <line x1="11" y1="2" x2="11" y2="14" stroke="currentColor" strokeWidth="1"/>
      <rect x="9.5" y="7" width="3" height="5" fill="#F0435A"/>
    </svg>
  )},
  { key: 'barras', label: 'Barras', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <line x1="4" y1="3" x2="4" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="2" y1="5" x2="4" y2="5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="4" y1="9" x2="6" y2="9" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="11" y1="4" x2="11" y2="13" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="9" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="11" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )},
  { key: 'heiken-ashi', label: 'Heiken Ashi', icon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <line x1="4" y1="2" x2="4" y2="14" stroke="currentColor" strokeWidth="1"/>
      <rect x="2.5" y="4" width="3" height="7" fill="#1FD196"/>
      <line x1="11" y1="3" x2="11" y2="14" stroke="currentColor" strokeWidth="1"/>
      <rect x="9.5" y="6" width="3" height="6" fill="#F0435A"/>
    </svg>
  )},
]

interface OhlcData { open: number; high: number; low: number; close: number }

interface TradingChartProps {
  asset: Asset
  onInfoClick: () => void
  theme?: ChartTheme
  autoScroll?: boolean
  performanceMode?: boolean
  activeTrades?: ActiveTrade[]
  onPriceUpdate?: (price: number) => void
}

function calculateBollingerBands(candles: Candle[], period = 20, mult = 2) {
  return candles.map((c, i) => {
    if (i < period - 1) return null
    const slice = candles.slice(i - period + 1, i + 1)
    const avg = slice.reduce((s, x) => s + x.close, 0) / period
    const std = Math.sqrt(slice.reduce((s, x) => s + Math.pow(x.close - avg, 2), 0) / period)
    return {
      time: c.time as number,
      upper:  parseFloat((avg + mult * std).toFixed(5)),
      middle: parseFloat(avg.toFixed(5)),
      lower:  parseFloat((avg - mult * std).toFixed(5)),
    }
  }).filter(Boolean) as { time: number; upper: number; middle: number; lower: number }[]
}

function calculateParabolicSAR(candles: Candle[], step = 0.02, maxAf = 0.2): { time: number; value: number; bull: boolean }[] {
  if (candles.length < 2) return []
  const result: { time: number; value: number; bull: boolean }[] = []
  let bull = true, af = step
  let ep = candles[0].high, sar = candles[0].low
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1]
    if (bull) {
      sar = sar + af * (ep - sar)
      sar = Math.min(sar, prev.low, i > 1 ? candles[i - 2].low : prev.low)
      if (c.low < sar)       { bull = false; sar = ep; ep = c.low;  af = step }
      else if (c.high > ep)  { ep = c.high;  af = Math.min(af + step, maxAf) }
    } else {
      sar = sar + af * (ep - sar)
      sar = Math.max(sar, prev.high, i > 1 ? candles[i - 2].high : prev.high)
      if (c.high > sar)      { bull = true;  sar = ep; ep = c.high; af = step }
      else if (c.low < ep)   { ep = c.low;   af = Math.min(af + step, maxAf) }
    }
    result.push({ time: c.time as number, value: parseFloat(sar.toFixed(5)), bull })
  }
  return result
}

function calculateRSI(candles: Candle[], period = 14): { time: number; value: number }[] {
  if (candles.length < period + 1) return []
  const result: { time: number; value: number }[] = []
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close
    if (d > 0) avgGain += d; else avgLoss -= d
  }
  avgGain /= period; avgLoss /= period
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss
    result.push({ time: candles[i].time as number, value: parseFloat((100 - 100 / (1 + rs)).toFixed(2)) })
  }
  return result
}

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1), out: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) out.push((values[i] - out[i - 1]) * k + out[i - 1])
  return out
}

function calculateMACD(candles: Candle[], fast = 12, slow = 26, signal = 9) {
  const closes = candles.map(c => c.close)
  const emaFast = calcEMA(closes, fast), emaSlow = calcEMA(closes, slow)
  const macdVals = closes.map((_, i) => emaFast[i] - emaSlow[i])
  const sigVals  = calcEMA(macdVals, signal)
  const skip = slow - 1
  return {
    macdLine:   candles.slice(skip).map((c, i) => ({ time: c.time as number, value: parseFloat(macdVals[i + skip].toFixed(5)) })),
    signalLine: candles.slice(skip).map((c, i) => ({ time: c.time as number, value: parseFloat(sigVals[i + skip].toFixed(5)) })),
    histogram:  candles.slice(skip).map((c, i) => ({
      time: c.time as number,
      value: parseFloat((macdVals[i + skip] - sigVals[i + skip]).toFixed(5)),
    })),
  }
}

function calculateStochastic(candles: Candle[], kPeriod: number, smooth: number, dPeriod: number) {
  const rawK: number[] = []
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) { rawK.push(NaN); continue }
    let hh = -Infinity, ll = Infinity
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high
      if (candles[j].low  < ll) ll = candles[j].low
    }
    rawK.push(hh === ll ? 50 : ((candles[i].close - ll) / (hh - ll)) * 100)
  }
  const smaOf = (arr: number[], p: number) => arr.map((_, i) => {
    if (i < p - 1) return NaN
    let s = 0
    for (let j = i - p + 1; j <= i; j++) { if (Number.isNaN(arr[j])) return NaN; s += arr[j] }
    return s / p
  })
  const kVals = smaOf(rawK, smooth)
  const dVals = smaOf(kVals, dPeriod)
  const toLine = (vals: number[]) => candles
    .map((c, i) => ({ time: c.time as number, value: vals[i] }))
    .filter(p => !Number.isNaN(p.value))
    .map(p => ({ time: p.time, value: parseFloat(p.value.toFixed(2)) }))
  return { kLine: toLine(kVals), dLine: toLine(dVals) }
}

// Alligator (Bill Williams): SMMA do preço MEDIANO (H+L)/2, deslocada `shift`
// velas pro futuro — por isso os pontos finais têm time além da última vela.
function calculateAlligatorLine(candles: Candle[], period: number, shift: number, tfSec: number): { time: number; value: number }[] {
  if (candles.length < period) return []
  const median = candles.map(c => (c.high + c.low) / 2)
  const result: { time: number; value: number }[] = []
  let smma = median.slice(0, period).reduce((s, v) => s + v, 0) / period
  result.push({ time: (candles[period - 1].time as number) + shift * tfSec, value: parseFloat(smma.toFixed(5)) })
  for (let i = period; i < candles.length; i++) {
    smma = (smma * (period - 1) + median[i]) / period
    result.push({ time: (candles[i].time as number) + shift * tfSec, value: parseFloat(smma.toFixed(5)) })
  }
  return result
}

// Fractal (Bill Williams): pivô com `n` velas estritamente menores de cada lado.
// As últimas `n` velas nunca confirmam fractal — comportamento padrão.
function calculateFractals(candles: Candle[], n: number) {
  const ups: number[] = [], downs: number[] = []
  for (let i = n; i < candles.length - n; i++) {
    let isUp = true, isDown = true
    for (let j = 1; j <= n; j++) {
      if (!(candles[i].high > candles[i - j].high && candles[i].high > candles[i + j].high)) isUp = false
      if (!(candles[i].low  < candles[i - j].low  && candles[i].low  < candles[i + j].low))  isDown = false
      if (!isUp && !isDown) break
    }
    if (isUp)   ups.push(candles[i].time as number)
    if (isDown) downs.push(candles[i].time as number)
  }
  return { ups, downs }
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function calculateSMA(candles: Candle[], period: number): { time: number; value: number }[] {
  return candles
    .map((c, i) => {
      if (i < period - 1) return null
      const avg = candles.slice(i - period + 1, i + 1).reduce((s, x) => s + x.close, 0) / period
      return { time: c.time as number, value: parseFloat(avg.toFixed(5)) }
    })
    .filter(Boolean) as { time: number; value: number }[]
}

function calculateEMAIndicator(candles: Candle[], period: number): { time: number; value: number }[] {
  const emas = calcEMA(candles.map(c => c.close), period)
  return candles.map((c, i) => ({ time: c.time as number, value: parseFloat(emas[i].toFixed(5)) }))
}

function calculateWMA(candles: Candle[], period: number): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = []
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0, weights = 0
    for (let j = 0; j < period; j++) { const w = j + 1; sum += candles[i - period + 1 + j].close * w; weights += w }
    result.push({ time: candles[i].time as number, value: parseFloat((sum / weights).toFixed(5)) })
  }
  return result
}

function calculateSMMA(candles: Candle[], period: number): { time: number; value: number }[] {
  if (candles.length < period) return []
  const result: { time: number; value: number }[] = []
  let smma = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  for (let i = period; i < candles.length; i++) {
    smma = (smma * (period - 1) + candles[i].close) / period
    result.push({ time: candles[i].time as number, value: parseFloat(smma.toFixed(5)) })
  }
  return result
}

function calculateMA(candles: Candle[], settings: { period: number; type: MAType }): { time: number; value: number }[] {
  switch (settings.type) {
    case 'EMA':  return calculateEMAIndicator(candles, settings.period)
    case 'WMA':  return calculateWMA(candles, settings.period)
    case 'SMMA': return calculateSMMA(candles, settings.period)
    default:     return calculateSMA(candles, settings.period)
  }
}

function calculateZigZag(candles: Candle[], depth = 5): { time: number; value: number }[] {
  const points: { time: number; value: number }[] = []
  let lastDir = 0
  for (let i = depth; i < candles.length - depth; i++) {
    const c = candles[i]
    const win = candles.slice(i - depth, i + depth + 1)
    const isHigh = c.high >= Math.max(...win.map(x => x.high))
    const isLow  = c.low  <= Math.min(...win.map(x => x.low))
    if (isHigh && lastDir !== 1)  { points.push({ time: c.time as number, value: c.high }); lastDir = 1 }
    else if (isLow && lastDir !== -1) { points.push({ time: c.time as number, value: c.low });  lastDir = -1 }
  }
  return points
}

function toHeikenAshi(candles: Candle[]): Candle[] {
  const ha: Candle[] = []
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const haClose = parseFloat(((c.open + c.high + c.low + c.close) / 4).toFixed(5))
    const haOpen  = i === 0 ? parseFloat(((c.open + c.close) / 2).toFixed(5)) : parseFloat(((ha[i-1].open + ha[i-1].close) / 2).toFixed(5))
    const haHigh  = Math.max(c.high, haOpen, haClose)
    const haLow   = Math.min(c.low,  haOpen, haClose)
    ha.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose })
  }
  return ha
}

const BRT_OFFSET_CHART = -3 * 3600

function TradeTimer({ expiryTime, x, y, color }: { expiryTime: number; x: number; y: number; color: string }) {
  const nowBRT = () => Math.floor(Date.now() / 1000) + BRT_OFFSET_CHART
  const [remaining, setRemaining] = React.useState(Math.max(0, expiryTime - nowBRT()))
  React.useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, expiryTime - nowBRT())), 200)
    return () => clearInterval(t)
  }, [expiryTime])
  const m = Math.floor(remaining / 60).toString().padStart(2, '0')
  const s = (remaining % 60).toString().padStart(2, '0')
  return (
    <div className="absolute pointer-events-none z-[8]" style={{ left: x - 18, top: y + 6 }}>
      <div className="text-[10px] font-mono font-bold px-1.5 py-[1px] rounded border" style={{ color, borderColor: color + '80', backgroundColor: '#0A101A' }}>
        {m}:{s}
      </div>
    </div>
  )
}

// Cache de candles históricos por "assetId:tfSeconds" — evita regenerar ao voltar para um par.
// Chave expira após 60s: encurta a defasagem do histórico ao trocar de paridade
// (o custo de re-fetch é absorvido pelo cache da rota /api/market/candles).
const candleCache = new Map<string, { candles: import('@/lib/mockData').Candle[]; ts: number }>()
const CANDLE_CACHE_TTL = 60 * 1000

export function TradingChart({ asset, onInfoClick, theme = 'noite', autoScroll = true, performanceMode = true, activeTrades = [], onPriceUpdate }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)
  const autoScrollRef = useRef(autoScroll)
  const priceLinesRef = useRef<Record<string, any>>({})
  const tradesPosIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Refresh suave ao reabrir a aba: preenchido pelo initChart quando o ativo tem
  // feed real e nenhum overlay ativo; null => a volta de aba faz o remount
  // clássico (comportamento antigo). O remount é SEMPRE o fallback de erro.
  const softRefreshRef = useRef<(() => Promise<boolean>) | null>(null)
  // Rastreia trades ja "scrollados" — evita re-snap a cada rerender do pai
  // (activeTrades.filter cria nova referencia a cada render, disparando o effect).
  const scrolledTradeIdsRef = useRef<Set<string>>(new Set())
  const tfSecRef = useRef(TIMEFRAMES[3].seconds) // synced below after tfIndex state
  const onPriceUpdateRef = useRef(onPriceUpdate)
  useEffect(() => { onPriceUpdateRef.current = onPriceUpdate }, [onPriceUpdate])

  const [currentPrice, setCurrentPrice] = useState(asset.price)
  const [priceChange, setPriceChange] = useState(0)
  const [liveOhlc, setLiveOhlc] = useState<{ open: number; high: number; low: number; close: number } | null>(null)
  const lastStateSyncRef = useRef(0)


  function zoomBy(factor: number) {
    const ts = chartRef.current?.timeScale()
    if (!ts) return
    try {
      const bs = ts.options().barSpacing ?? 8
      ts.applyOptions({ barSpacing: Math.min(60, Math.max(2, bs * factor)) })
    } catch {}
  }

  function scrollBy(bars: number) {
    const ts = chartRef.current?.timeScale()
    if (!ts) return
    try { ts.scrollToPosition((ts.scrollPosition() ?? 0) + bars, true) } catch {}
  }

  // Cores das velas vindas das Configuracoes (localStorage). Aplicadas via
  // applyOptions para nao recriar a serie nem refazer setData.
  useEffect(() => {
    const apply = (c: CandleColors) => {
      if (!seriesRef.current) return
      try {
        seriesRef.current.applyOptions({
          upColor: c.up, downColor: c.down,
          borderUpColor: c.up, borderDownColor: c.down,
          wickUpColor: c.up, wickDownColor: c.down,
        })
      } catch {}
    }
    const handler = (e: Event) => apply((e as CustomEvent<CandleColors>).detail)
    window.addEventListener('vx-candle-colors', handler)
    return () => window.removeEventListener('vx-candle-colors', handler)
  }, [])

  // Hover nos botões de Compra/Venda do painel -> fade sutil no gráfico.
  useEffect(() => {
    const handler = (e: Event) => setHoverDir((e as CustomEvent<'CALL' | 'PUT' | null>).detail ?? null)
    window.addEventListener('vx-trade-hover', handler)
    return () => window.removeEventListener('vx-trade-hover', handler)
  }, [])
  const [timestamp, setTimestamp] = useState('')
  const [ohlc, setOhlc] = useState<OhlcData | null>(null)
  const [tfIndex, setTfIndex] = useState(3)
  const [tfOpen, setTfOpen] = useState(false)
  useEffect(() => { tfSecRef.current = TIMEFRAMES[tfIndex].seconds }, [tfIndex])
  const [candleTime, setCandleTime] = useState('')
  const [tradePositions, setTradePositions] = useState<Record<string, { entryX: number; expiryX: number; entryY: number }>>({})

  const [candleSecsLeft, setCandleSecsLeft] = useState(0)
  const [candleTimerY, setCandleTimerY] = useState<number | null>(null)
  const [drawingsOpen, setDrawingsOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const drawingsRef = useRef<Drawing[]>([])
  useEffect(() => { drawingsRef.current = drawings }, [drawings])
  const [pendingPoint, setPendingPoint] = useState<{ price: number; time: number } | null>(null)
  const pendingPointRef = useRef<{ price: number; time: number } | null>(null)
  useEffect(() => { pendingPointRef.current = pendingPoint }, [pendingPoint])
  const activeToolRef = useRef<string | null>(null)
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])
  const [drawingPixels, setDrawingPixels] = useState<DrawingPx[]>([])
  const [mousePx, setMousePx] = useState<{ x: number; y: number } | null>(null)
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)
  const selectedDrawingIdRef = useRef<string | null>(null)
  useEffect(() => { selectedDrawingIdRef.current = selectedDrawingId }, [selectedDrawingId])
  const draggingRef = useRef<{
    id: string
    handle: 'body' | 'p1' | 'p2' | 'offset'
    startClientX: number
    startClientY: number
    origDrawing: Drawing
  } | null>(null)
  const [indicadoresOpen, setIndicadoresOpen] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('velas')
  const [chartTypeOpen, setChartTypeOpen] = useState(false)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const isMobile = useIsMobile() === true
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(new Set())
  const [chartKey, setChartKey] = useState(0) // incrementa cada vez que o gráfico é recriado
  const [remountKey, setRemountKey] = useState(0) // bump p/ reconstruir o chart do zero (ex: aba volta a ficar visível)
  const [isLoading, setIsLoading] = useState(true) // true enquanto fetch + render do chart inicial
  const [alertSet, setAlertSet] = useState(false)
  // Pré-loader sem piso de tempo: libera assim que o gráfico está pronto.
  //
  // Havia um mínimo de 5s aqui. Trocar de 1m pra 30s carrega em bem menos que
  // isso, então o usuário ficava olhando um loader por tempo puramente
  // artificial. O loader continua aparecendo enquanto o fetch e o render
  // acontecem de verdade — só não segura mais depois de prontos.
  const loadStartRef   = useRef(0)
  const loaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Marca que o chart já apareceu uma vez nesta montagem — a partir daí nenhuma
  // troca de ativo/timeframe volta a mostrar o loader.
  const hasLoadedOnceRef = useRef(false)
  const releaseLoader  = useCallback(() => {
    if (loaderTimerRef.current) clearTimeout(loaderTimerRef.current)
    hasLoadedOnceRef.current = true
    setIsLoading(false)
  }, [])
  // Etiqueta de preço: escrita direta no DOM (sem re-render do React) para
  // acompanhar o preço a cada frame sem engasgar o canvas.
  const priceBadgeRef = useRef<HTMLDivElement>(null)
  const priceValueRef = useRef<HTMLSpanElement>(null)
  const livePulseRef  = useRef<HTMLDivElement>(null)
  // Direção "em pré-visualização" (mouse sobre Compra/Venda no painel).
  const [hoverDir, setHoverDir] = useState<'CALL' | 'PUT' | null>(null)
  const [bbSettings, setBBSettings] = useState<BBSettings>(BB_DEFAULTS)
  const [bbEditOpen, setBBEditOpen] = useState(false)
  const [maSettings, setMASettings] = useState<MASettings>(MA_DEFAULTS)
  const [maEditOpen, setMAEditOpen] = useState(false)
  const [macdSettings, setMACDSettings] = useState<MACDSettings>(MACD_DEFAULTS)
  const [macdEditOpen, setMACDEditOpen] = useState(false)
  const [rsiSettings, setRSISettings] = useState<RSISettings>(RSI_DEFAULTS)
  const [rsiEditOpen, setRSIEditOpen] = useState(false)
  const [stochSettings, setStochSettings] = useState<StochasticSettings>(STOCH_DEFAULTS)
  const [stochEditOpen, setStochEditOpen] = useState(false)
  const [alligatorSettings, setAlligatorSettings] = useState<AlligatorSettings>(ALLIGATOR_DEFAULTS)
  const [alligatorEditOpen, setAlligatorEditOpen] = useState(false)
  const [fractalSettings, setFractalSettings] = useState<FractalSettings>(FRACTAL_DEFAULTS)
  const [fractalEditOpen, setFractalEditOpen] = useState(false)

  const showSMA       = activeIndicators.has('moving-average')
  const showZigzag    = activeIndicators.has('zig-zag')
  const showBB        = activeIndicators.has('bollinger-bands')
  const showPSAR      = activeIndicators.has('parabolic-sar')
  const showAlligator = activeIndicators.has('alligator')
  const showFractal   = activeIndicators.has('fractal')
  const showRSI       = activeIndicators.has('rsi')
  const showMACD      = activeIndicators.has('macd')
  const showStoch     = activeIndicators.has('stochastic')
  const oscActive     = showRSI || showMACD || showStoch
  const activeOsc: 'rsi' | 'macd' | 'stochastic' | null =
    showRSI ? 'rsi' : showMACD ? 'macd' : showStoch ? 'stochastic' : null

  const oscChartContainerRef = useRef<HTMLDivElement>(null)
  const oscChartRef = useRef<any>(null)
  // Velas reais do gráfico principal compartilhadas com o sub-painel de
  // oscilador (keyed por ativo+TF pra nunca vazar velas de outro par).
  const oscCandlesRef = useRef<{ key: string; candles: Candle[] } | null>(null)

  function toggleIndicator(id: string) {
    setActiveIndicators(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        // Só existe um sub-painel de oscilador: ligar um DESLIGA os outros no
        // menu também — antes ficavam marcados sem renderizar.
        if ((OSC_INDICATOR_IDS as readonly string[]).includes(id)) {
          for (const osc of OSC_INDICATOR_IDS) if (osc !== id) next.delete(osc)
        }
        next.add(id)
      }
      return next
    })
  }

  function clearAllIndicators() {
    setActiveIndicators(new Set())
  }

  // ── Persistência do setup do gráfico (localStorage) ──────────────────────
  // Restaura no mount (global + ativo) e a cada troca de ativo (só a parte por
  // ativo). Rodar via useEffect (e não no useState inicial) evita mismatch de
  // hidratação — o servidor não tem localStorage.
  const prefsLoadedRef = useRef(false)
  useEffect(() => {
    const prefs = loadChartPrefs()
    if (!prefsLoadedRef.current) {
      prefsLoadedRef.current = true
      if (prefs.indicators) {
        const ids = new Set(prefs.indicators.filter(id => IMPLEMENTED_INDICATOR_IDS.has(id)))
        const oscOn = OSC_INDICATOR_IDS.filter(id => ids.has(id))
        for (const id of oscOn.slice(1)) ids.delete(id)
        setActiveIndicators(ids)
      }
      if (prefs.settings?.ma)         setMASettings(s => ({ ...s, ...prefs.settings!.ma } as MASettings))
      if (prefs.settings?.bb)         setBBSettings(s => ({ ...s, ...prefs.settings!.bb } as BBSettings))
      if (prefs.settings?.rsi)        setRSISettings(s => ({ ...s, ...prefs.settings!.rsi } as RSISettings))
      if (prefs.settings?.macd)       setMACDSettings(s => ({ ...s, ...prefs.settings!.macd } as MACDSettings))
      if (prefs.settings?.stochastic) setStochSettings(s => ({ ...s, ...prefs.settings!.stochastic } as StochasticSettings))
      if (prefs.settings?.alligator)  setAlligatorSettings(s => ({ ...s, ...prefs.settings!.alligator } as AlligatorSettings))
      if (prefs.settings?.fractal)    setFractalSettings(s => ({ ...s, ...prefs.settings!.fractal } as FractalSettings))
      if (prefs.chartType && CHART_TYPES.some(t => t.key === prefs.chartType)) setChartType(prefs.chartType as ChartType)
    }
    // Por ativo: também LIMPA os desenhos do ativo anterior — antes eles
    // vazavam de um ativo pro outro.
    const ap = prefs.perAsset?.[asset.id]
    setDrawings(sanitizeStoredDrawings(ap?.drawings))
    setSelectedDrawingId(null)
    setPendingPoint(null)
    if (ap?.tfIndex != null && Number.isInteger(ap.tfIndex) && ap.tfIndex >= 0 && ap.tfIndex < TIMEFRAMES.length) {
      setTfIndex(ap.tfIndex)
    }
  }, [asset.id])

  // Salva a parte global (debounce curto — cor/período mudam em rajada).
  useEffect(() => {
    if (!prefsLoadedRef.current) return
    const t = setTimeout(() => {
      saveGlobalChartPrefs({
        indicators: [...activeIndicators],
        chartType,
        settings: {
          ma: maSettings, bb: bbSettings, rsi: rsiSettings, macd: macdSettings,
          stochastic: stochSettings, alligator: alligatorSettings, fractal: fractalSettings,
        },
      })
    }, 400)
    return () => clearTimeout(t)
  }, [activeIndicators, chartType, maSettings, bbSettings, rsiSettings, macdSettings, stochSettings, alligatorSettings, fractalSettings])

  // Salva a parte por ativo. Na troca de ativo, este render ainda carrega os
  // desenhos do ativo ANTERIOR — o guard pula esse ciclo pra não gravá-los na
  // chave do ativo novo; o efeito de restore acima já disparou o re-render.
  const savedAssetRef = useRef<string | null>(null)
  useEffect(() => {
    if (!prefsLoadedRef.current) return
    if (savedAssetRef.current !== asset.id) {
      savedAssetRef.current = asset.id
      return
    }
    const t = setTimeout(() => saveAssetChartPrefs(asset.id, { drawings, tfIndex }), 400)
    return () => clearTimeout(t)
  }, [drawings, tfIndex, asset.id])

  const selectedTf = TIMEFRAMES[tfIndex]
  const selectedChartType = CHART_TYPES.find(t => t.key === chartType)!

  useEffect(() => {
    const updateTimestamp = () => {
      // Studio Mode: timezone customizado (cosmetico — usado so no display do clock)
      const studio = useStudioMode.getState()
      if (studio.enabled && studio.customTimezoneEnabled) {
        try {
          const formatter = new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false, timeZone: studio.customTimezone,
          })
          const parts = formatter.format(new Date())
          // Abreviacao do TZ (ex: EST, BRT)
          const tzAbbr = new Intl.DateTimeFormat('en-US', {
            timeZone: studio.customTimezone, timeZoneName: 'short',
          }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? ''
          setTimestamp(`${parts} ${tzAbbr}`)
          return
        } catch { /* fallback para UTC-3 abaixo */ }
      }
      // UTC-3 fixo (horário de Brasília), independente do timezone do sistema
      const nowUtc = Date.now()
      const brt = new Date(nowUtc - 3 * 3600 * 1000)
      const h = brt.getUTCHours().toString().padStart(2, '0')
      const m = brt.getUTCMinutes().toString().padStart(2, '0')
      const s = brt.getUTCSeconds().toString().padStart(2, '0')
      setTimestamp(`${h}:${m}:${s} UTC-3`)
    }
    updateTimestamp()
    const t = setInterval(updateTimestamp, 1000)
    return () => clearInterval(t)
  }, [])

  // ── Reconstrução do gráfico ao reabrir a aba ──────────────────────────────
  // Navegadores congelam requestAnimationFrame e estrangulam setInterval em abas
  // em segundo plano. Enquanto a aba fica oculta, o motor ao vivo para de desenhar
  // velas; ao voltar, a visão pula pro "agora" e abre um buraco no gráfico (gap).
  // Solução: quando a aba volta a ficar visível após um tempo relevante, forçamos
  // o rebuild do chart (re-fetch do histórico do backend + reconexão do WS). O
  // endpoint de candles tem cache (5min p/ Twelve Data), então não queima cota.
  useEffect(() => {
    let hiddenAt: number | null = null
    const REBUILD_AFTER_MS = 2_000  // ignora alt-tabs rápidos (< 2s não geram gap visível)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (document.visibilityState === 'visible') {
        const awayFor = hiddenAt ? Date.now() - hiddenAt : 0
        hiddenAt = null
        if (awayFor >= REBUILD_AFTER_MS) {
          // Preferência: refresh suave (atualiza dados SEM desmontar — sem
          // skeleton, zoom preservado). Qualquer falha => remount clássico.
          const soft = softRefreshRef.current
          if (soft) {
            soft().then(ok => { if (!ok) setRemountKey(k => k + 1) })
                  .catch(() => setRemountKey(k => k + 1))
          } else {
            setRemountKey(k => k + 1)
          }
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (!chartRef.current) return
    const c = THEME_COLORS[theme]
    chartRef.current.applyOptions({
      layout: { background: { color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border, textColor: c.text },
      timeScale: { borderColor: c.border },
      crosshair: {
        vertLine: { color: c.crosshair, labelBackgroundColor: c.labelBg },
        horzLine: { color: c.crosshair, labelBackgroundColor: c.labelBg },
      },
    })
  }, [theme])

  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.applyOptions({
      // Touch kinetic scroll fica SEMPRE on — momentum no celular não é problema
      // de performance, é UX essencial. performanceMode controla só mouse/axis drag.
      kineticScroll: { touch: true, mouse: !performanceMode },
      handleScale: {
        // Coluna de preço sempre arrastável (comprime/expande a escala vertical);
        // o eixo de tempo segue a regra do modo performance.
        axisPressedMouseMove: { time: !performanceMode, price: true },
        pinch: true,
        mouseWheel: true,
      },
      handleScroll: {
        horzTouchDrag: true,
        vertTouchDrag: false,
        pressedMouseMove: true,
        mouseWheel: true,
      },
    })
  }, [performanceMode])

  // ── Bloqueia o arrasto VERTICAL do gráfico ───────────────────────────────
  // O lightweight-charts não tem opção pra isso: quando a escala sai do modo
  // automático (após comprimir pela coluna de preço), arrastar o corpo do
  // gráfico desloca o preço pra cima/baixo. Aqui o Y do arrasto é travado no
  // ponto onde o botão foi pressionado — o arrasto lateral segue intacto e a
  // compressão pela coluna de preço continua liberada.
  useEffect(() => {
    let dragStartY: number | null = null
    let synthetic = false
    const AXIS_W = 80  // faixa da coluna de preço, à direita: fica livre

    const onDown = (e: MouseEvent) => {
      const el = chartContainerRef.current
      if (!el || e.button !== 0 || !el.contains(e.target as Node)) return
      const rect = el.getBoundingClientRect()
      if (e.clientX > rect.right - AXIS_W) return   // arrasto na coluna de preço
      dragStartY = e.clientY
    }
    const onMove = (e: MouseEvent) => {
      if (synthetic || dragStartY == null) return
      if (e.buttons === 0) { dragStartY = null; return }
      if (e.clientY === dragStartY) return
      e.stopPropagation()
      e.stopImmediatePropagation()
      synthetic = true
      try {
        ;(e.target as HTMLElement)?.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true, cancelable: true, view: window,
          clientX: e.clientX, clientY: dragStartY,
          screenX: e.screenX, screenY: e.screenY,
          button: e.button, buttons: e.buttons,
          ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
        }))
      } catch {}
      synthetic = false
    }
    const onUp = () => { dragStartY = null }

    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp, true)
    }
  }, [])

  useEffect(() => {
    autoScrollRef.current = autoScroll
    if (autoScroll && chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime()
    }
  }, [autoScroll])

  // ── Active trades: price lines + overlay positions ───────────────────────
  useEffect(() => {
    if (!seriesRef.current) return

    // Sync price lines: add new, remove stale
    const activeIds = new Set(activeTrades.map(t => t.id))

    // Remove price lines for expired trades
    Object.keys(priceLinesRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        try { seriesRef.current.removePriceLine(priceLinesRef.current[id]) } catch {}
        delete priceLinesRef.current[id]
      }
    })

    // Create price lines for new trades — linha colorida + label no eixo Y
    const createLines = async () => {
      const { LineStyle } = await import('lightweight-charts')
      for (const trade of activeTrades) {
        if (priceLinesRef.current[trade.id]) continue
        if (!seriesRef.current) continue
        const color = trade.direction === 'CALL' ? '#1FD196' : '#F0435A'
        try {
          priceLinesRef.current[trade.id] = seriesRef.current.createPriceLine({
            price: trade.entryPrice,
            color: color + '60',   // linha sutil — o CSS cuida da visual principal
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: '',
          })
        } catch {}
      }
    }
    createLines()

    // Mantém a linha de preço atual sempre visível para o usuário ter referência
    try {
      seriesRef.current.applyOptions({ priceLineVisible: true })
    } catch {}

    // Remove positions for closed trades
    setTradePositions(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => { if (!activeIds.has(id)) delete next[id] })
      return next
    })
  }, [activeTrades, chartKey])

  // ── Poll overlay positions for all active trades ──────────────────────────
  useEffect(() => {
    if (tradesPosIntervalRef.current) clearInterval(tradesPosIntervalRef.current)
    if (activeTrades.length === 0) { setTradePositions({}); return }

    const updatePositions = () => {
      if (!chartRef.current || !seriesRef.current) return
      const ts = chartRef.current.timeScale()
      const tfSec = tfSecRef.current
      setTradePositions(() => {
        const next: Record<string, { entryX: number; expiryX: number; entryY: number }> = {}
        for (const trade of activeTrades) {
          // Alinha ao início do candle — o gráfico sempre tem esse timestamp
          const alignedEntry = Math.floor(trade.entryTime / tfSec) * tfSec
          const entryX = ts.timeToCoordinate(alignedEntry) ?? ts.timeToCoordinate(trade.entryTime)
          const alignedExpiry = Math.floor(trade.expiryTime / tfSec) * tfSec
          const expiryX = ts.timeToCoordinate(alignedExpiry) ?? ts.timeToCoordinate(trade.expiryTime)
          const entryY = seriesRef.current.priceToCoordinate(trade.entryPrice)
          if (entryX != null && entryY != null) {
            next[trade.id] = { entryX, expiryX: expiryX ?? entryX + 120, entryY }
          }
        }
        return next
      })
    }

    // Trade nova: scroll o chart pro tempo real (garante que entryTime esta no
    // range visivel) e calcula a posicao imediatamente — sem isso, marker
    // aparece em posicao errada nos primeiros 200ms ate o setInterval rodar.
    // Importante: so scrollToRealTime para trades NOVAS — caso contrario o pan
    // do usuario eh anulado a cada rerender (activeTrades.filter cria nova ref).
    const currentIds = new Set(activeTrades.map(t => t.id))
    const hasNewTrade = activeTrades.some(t => !scrolledTradeIdsRef.current.has(t.id))
    if (hasNewTrade && chartRef.current) {
      try { chartRef.current.timeScale().scrollToRealTime() } catch {}
    }
    // Atualiza o set: mantem apenas trades ainda ativas + adiciona as novas
    scrolledTradeIdsRef.current = currentIds
    updatePositions()

    tradesPosIntervalRef.current = setInterval(updatePositions, 200)

    return () => {
      if (tradesPosIntervalRef.current) clearInterval(tradesPosIntervalRef.current)
    }
  }, [activeTrades])

  // ── Drawing pixels: convert stored price/time to pixel coords ────────────
  useEffect(() => {
    const iv = setInterval(() => {
      if (!chartRef.current || !seriesRef.current) return
      const ts = chartRef.current.timeScale()
      const pixels: DrawingPx[] = []
      for (const d of drawingsRef.current) {
        if (d.type === 'hline') {
          const y = seriesRef.current.priceToCoordinate(d.price)
          if (y != null) pixels.push({ id: d.id, type: 'hline', y, price: d.price, color: d.color })
        } else if (d.type === 'vline') {
          const x = ts.timeToCoordinate(d.time)
          if (x != null) pixels.push({ id: d.id, type: 'vline', x, color: d.color })
        } else if (d.type === 'trendline') {
          const x1 = ts.timeToCoordinate(d.p1.time) ?? 0
          const y1 = seriesRef.current.priceToCoordinate(d.p1.price) ?? 0
          const x2 = ts.timeToCoordinate(d.p2.time) ?? 0
          const y2 = seriesRef.current.priceToCoordinate(d.p2.price) ?? 0
          pixels.push({ id: d.id, type: 'trendline', x1, y1, x2, y2, color: d.color })
        } else if (d.type === 'fib') {
          const x1 = ts.timeToCoordinate(d.p1.time) ?? 0
          const y1 = seriesRef.current.priceToCoordinate(d.p1.price) ?? 0
          const x2 = ts.timeToCoordinate(d.p2.time) ?? 0
          const y2 = seriesRef.current.priceToCoordinate(d.p2.price) ?? 0
          const levels = FIB_LEVELS.map((r, i) => {
            const price = d.p2.price + (d.p1.price - d.p2.price) * r
            const y = seriesRef.current!.priceToCoordinate(price) ?? 0
            return { ratio: r, y, price }
          })
          pixels.push({ id: d.id, type: 'fib', x1, y1, x2, y2, color: d.color, levels })
        } else if (d.type === 'rect' || d.type === 'extline') {
          const x1 = ts.timeToCoordinate(d.p1.time) ?? 0
          const y1 = seriesRef.current.priceToCoordinate(d.p1.price) ?? 0
          const x2 = ts.timeToCoordinate(d.p2.time) ?? 0
          const y2 = seriesRef.current.priceToCoordinate(d.p2.price) ?? 0
          pixels.push({ id: d.id, type: d.type, x1, y1, x2, y2, color: d.color })
        } else if (d.type === 'channel') {
          const x1 = ts.timeToCoordinate(d.p1.time) ?? 0
          const y1 = seriesRef.current.priceToCoordinate(d.p1.price) ?? 0
          const x2 = ts.timeToCoordinate(d.p2.time) ?? 0
          const y2 = seriesRef.current.priceToCoordinate(d.p2.price) ?? 0
          const yBase = seriesRef.current.priceToCoordinate(d.p1.price + d.offset) ?? y1
          pixels.push({ id: d.id, type: 'channel', x1, y1, x2, y2, yOff: yBase - y1, color: d.color })
        }
      }
      // Sem desenhos: não dispara setState (re-render a 10Hz engasga o canvas).
      setDrawingPixels(prev => (prev.length === 0 && pixels.length === 0 ? prev : pixels))
    }, 100)
    return () => clearInterval(iv)
  }, [])

  // Escape cancels active drawing tool / deselects drawing; Delete removes selected drawing
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTool(null); setPendingPoint(null); setMousePx(null)
        setSelectedDrawingId(null)
      }
      if (e.key === 'Delete' && selectedDrawingIdRef.current) {
        const id = selectedDrawingIdRef.current
        setDrawings(prev => prev.filter(d => d.id !== id))
        setSelectedDrawingId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    // Loader SÓ no primeiro carregamento. Trocar de ativo ou de timeframe leva
    // fração de segundo e reaproveita o chart existente — piscar um overlay a
    // cada troca dava sensação de lentidão que não existe, e atrapalhava quem
    // fica alternando entre paridades.
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true)
      loadStartRef.current = Date.now()
    }

    // Trava de cancelamento: se o efeito re-roda (troca de paridade/tf) enquanto
    // um fetch lento de preco/candles ainda esta pendente, a continuacao antiga
    // bailaria e sobrescreveria o grafico novo. Cada await checa `cancelled`.
    let cancelled = false
    let chart: any = null
    let priceInterval: ReturnType<typeof setInterval>
    let realPriceInterval: ReturnType<typeof setInterval> | null = null
    let rafId: number | null = null
    let otcWs: OtcSubscription | null = null
    let binanceWs: WebSocket | null = null // stream público de klines (cripto ao vivo)
    let krakenWs: WebSocket | null = null  // stream público de ticker (forex ao vivo)
    let otcWsPrice: number | null = null   // último preço recebido do backend (server-authoritative)
    let otcResetNeeded = false             // sinaliza ao priceInterval pra "snap" no primeiro tick (evita candle gigante)

    async function initChart() {
      if (!chartContainerRef.current) return

      const { createChart, ColorType, CrosshairMode, LineStyle, CandlestickSeries, LineSeries, AreaSeries, BarSeries, createSeriesMarkers } = await import('lightweight-charts')
      if (cancelled || !chartContainerRef.current) return

      // Real data for configured assets; OTC engine for everything else.
      // (Definido ANTES do createChart: barSpacing/priceFormat dependem da classe do ativo.)
      const realConfig = REAL_ASSETS[asset.id] ?? null
      const isBinance  = realConfig?.source === 'binance'
      const isForex    = realConfig != null && !isBinance
      const interval   = realConfig
        ? (isBinance ? tfToBinanceInterval(selectedTf.seconds) : String(selectedTf.seconds))
        : null
      // Formato de preço na escala REAL do par: o default da lib é precision 2 —
      // no forex o eixo mostrava um único "1.14" sem grade nenhuma.
      const assetDecimals = getAssetDecimals(asset)
      const priceFormat = { type: 'price' as const, precision: assetDecimals, minMove: Math.pow(10, -assetDecimals) }

      const tc = THEME_COLORS[theme]
      chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: tc.bg },
          textColor: tc.text,
          fontSize: 11,
          attributionLogo: false,  // remove watermark "TV" do lightweight-charts v5+
        },
        grid: {
          vertLines: { color: tc.grid, style: 1 },
          horzLines: { color: tc.grid, style: 1 },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: tc.crosshair, labelBackgroundColor: tc.labelBg },
          horzLine: { color: tc.crosshair, labelBackgroundColor: tc.labelBg },
        },
        // scaleMargins: menos "ar" em cima/embaixo — velas preenchem ~88% da tela
        // (default do lightweight-charts deixa 20% vazio no topo).
        rightPriceScale: { borderColor: tc.border, textColor: tc.text, scaleMargins: { top: 0.06, bottom: 0.06 } },
        timeScale: {
          borderColor: tc.border,
          timeVisible: true,
          secondsVisible: selectedTf.seconds < 60,
          fixLeftEdge: false,
          rightOffset: 5,
          // Forex: janela mais curta (menos pips no range visivel => mais px por
          // pip => velas mais ALTAS, alem de mais largas). Cripto/OTC: 13.
          barSpacing: isForex ? 16 : 13,
          lockVisibleTimeRangeOnResize: true,
        },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      })

      chartRef.current = chart

      // Era 300, que dava ~25h de scrollback no tf de 5min e escondia os 3 meses
      // de historico que existem em otc_candles. 5000 cobre ~17 dias em 5min e
      // ~3,5 dias em 1min, e o lightweight-charts renderiza isso sem suar.
      // As fontes de mercado ao vivo (Binance/Kraken/Twelve Data) tem teto proprio
      // de 500 na rota /api/market/candles e simplesmente clampam esse valor.
      const candleLimit = 5000
      const cacheKey = `${asset.id}:${selectedTf.seconds}`
      const cached = candleCache.get(cacheKey)
      // Feed real: cache curtissimo — historico velho abre "buraco" visivel entre
      // a ultima vela e a vela ao vivo na troca de par (o custo do re-fetch e
      // absorvido pelo cache da rota, que tambem ficou de 10s p/ binance/kraken).
      const cacheTtl = realConfig ? 10_000 : CANDLE_CACHE_TTL

      // 1. Busca preço real ANTES dos candles para poder seedar os mock corretamente
      let realPrice: number | null = null
      // Saúde da série de liquidação (live_prices via poll). O WS do forex SÓ
      // pode comandar o tick enquanto o poll confirmar que a liquidação está
      // viva e colada — REGRA DE OURO: publisher caiu => o gráfico congela
      // JUNTO da série que liquida, nunca segue vivo sozinho pela Kraken.
      let wsForexLastMsgAt = 0     // último tick aceito do WS Kraken
      let lastPollOkAt     = 0     // última resposta FRESCA do poll (stale não conta)
      let lastPollPrice: number | null = null
      if (realConfig) {
        const priceParams = new URLSearchParams({ symbol: realConfig.symbol, source: realConfig.source })
        try {
          const res = await fetch(`/api/market/price?${priceParams}`)
          const json = await res.json()
          if (json.price) {
            realPrice = json.price
            lastPollPrice = json.price
            if (!json.stale && (json.ageMs == null || json.ageMs < 15_000)) lastPollOkAt = Date.now()
          }
        } catch {}
        if (cancelled) return  // trocou de ativo durante o fetch — aborta (nao seta interval velho)
        realPriceInterval = setInterval(async () => {
          try {
            // O poll SEMPRE roda (é o health-check da liquidação), mesmo com o
            // WS no comando do tick. Prova de vida exige stale=false E idade
            // real <15s (a rota tolera até 60s pra EXIBIÇÃO — pra liquidação
            // "viva" o critério é o ritmo de 5s do publisher com folga).
            const r = await fetch(`/api/market/price?${priceParams}`)
            const j = await r.json()
            if (!j.price) return
            lastPollPrice = j.price   // exibição/colagem usa sempre o último valor
            if (!j.stale && (j.ageMs == null || j.ageMs < 15_000)) lastPollOkAt = Date.now()
            // WS fresco E colado no autoritativo => poll não sobrescreve (o
            // snapshot tem até ~9s e faria o preço "pular pra trás"). WS
            // divergente ou mudo => o valor autoritativo manda.
            const wsFresh = Date.now() - wsForexLastMsgAt < 5_000
            const wsClose = realPrice != null && Math.abs(realPrice - j.price) / j.price < 0.001
            if (!wsFresh || !wsClose) realPrice = j.price
          } catch {}
        }, 5_000)
      }

      // ── WebSocket Binance: vela oficial em tempo real (só cripto) ─────────
      // Canal público de klines do TF selecionado: a vela ao vivo espelha o
      // OHLC oficial da Binance a cada trade (a MESMA série que vira o
      // histórico), então a virada de minuto emenda perfeita por construção.
      // Se o WS não conectar ou cair, o poll de 5s acima segue alimentando
      // (fallback automático) — o tick só confia no WS com mensagem fresca.
      let wsKline: { start: number; open: number; high: number; low: number; close: number } | null = null
      let wsLastMsgAt = 0
      if (isBinance && interval && realConfig) {
        const wsUrl = `wss://data-stream.binance.vision/ws/${realConfig.symbol.toLowerCase()}@kline_${interval}`
        const connectBinanceWs = () => {
          if (cancelled) return
          try {
            const ws = new WebSocket(wsUrl)
            binanceWs = ws
            ws.onmessage = (ev) => {
              try {
                const k = JSON.parse(ev.data)?.k
                if (!k) return
                wsKline = {
                  start: Math.floor(k.t / 1000),  // epoch UTC; eixo soma BRT_OFFSET no tick
                  open:  parseFloat(k.o),
                  high:  parseFloat(k.h),
                  low:   parseFloat(k.l),
                  close: parseFloat(k.c),
                }
                wsLastMsgAt = Date.now()
                realPrice   = wsKline.close     // mais fresco que o poll de 5s
              } catch {}
            }
            // Binance encerra conexões periodicamente (~24h): reconecta em 5s
            ws.onclose = () => { if (!cancelled) setTimeout(connectBinanceWs, 5_000) }
            ws.onerror = () => { try { ws.close() } catch {} }
          } catch { binanceWs = null }
        }
        connectBinanceWs()
      }

      // ── WebSocket Kraken: tick ao vivo do forex (EUR/GBP) ──────────────────
      // Mesmo book que alimenta o servidor (ticker/bbo v2): o preço pulsa
      // várias vezes por segundo entre os polls de 5s, e as velas do servidor
      // nascem do MESMO stream — emenda consistente. Cada tick só é exibido
      // com a liquidação comprovadamente viva (poll fresco <20s) e colada
      // (<0.1%) — ver comentário da REGRA DE OURO acima. Guard anti-flash por
      // TEMPO igual ao do servidor (>0.5% precisa persistir 15s), com baseline
      // semeada no preço autoritativo.
      if (isForex && realConfig) {
        const fxSymbol = realConfig.symbol   // formato Kraken v2: 'EUR/USD'
        let fxGuard: { price: number; deviantSince: number | null } | null = null
        const connectKrakenWs = () => {
          if (cancelled) return
          // Mercado fechado (sexta 22h → domingo 22h UTC): fica num loop
          // dormente de 60s — quem deixa a aba aberta na virada de domingo
          // ganha o tempo real sem precisar trocar de par.
          if (!isForexOpen()) { setTimeout(connectKrakenWs, 60_000); return }
          try {
            const ws = new WebSocket('wss://ws.kraken.com/v2')
            krakenWs = ws
            ws.onopen = () => {
              ws.send(JSON.stringify({
                method: 'subscribe',
                params: { channel: 'ticker', symbol: [fxSymbol], event_trigger: 'bbo', snapshot: true },
              }))
            }
            ws.onmessage = (ev) => {
              try {
                if (!isForexOpen()) return   // mercado fechou no meio da sessão
                // Liquidação sem prova de vida recente => tick NÃO é exibido
                // (o gráfico congela junto do preço que liquida — honesto).
                if (Date.now() - lastPollOkAt > 20_000) return
                const msg = JSON.parse(ev.data)
                if (msg?.channel !== 'ticker' || !Array.isArray(msg.data)) return
                const d = msg.data.find((x: { symbol?: string }) => x?.symbol === fxSymbol)
                const bid = Number(d?.bid)
                const ask = Number(d?.ask)
                if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return
                const mid = Number(((bid + ask) / 2).toFixed(6))
                // Colagem no autoritativo: >0.1% longe do último live_prices => descarta
                if (lastPollPrice != null && Math.abs(mid - lastPollPrice) / lastPollPrice > 0.001) return
                // Guard anti-flash por tempo, baseline no preço autoritativo
                if (fxGuard == null && lastPollPrice != null) fxGuard = { price: lastPollPrice, deviantSince: null }
                if (fxGuard && Math.abs(mid - fxGuard.price) / fxGuard.price > 0.005) {
                  if (fxGuard.deviantSince == null) { fxGuard.deviantSince = Date.now(); return }
                  if (Date.now() - fxGuard.deviantSince < 15_000) return
                }
                fxGuard = { price: mid, deviantSince: null }
                realPrice        = mid
                wsForexLastMsgAt = Date.now()
              } catch {}
            }
            // Reconexão em 10-15s com jitter (limite de ~150 tentativas/10min por IP)
            ws.onclose = () => { if (!cancelled) setTimeout(connectKrakenWs, 10_000 + Math.random() * 5_000) }
            ws.onerror = () => { try { ws.close() } catch {} }
          } catch { krakenWs = null }
        }
        connectKrakenWs()
      }

      // 2. Gera candles mock usando o preço real como seed (fallback para asset.price)
      const seedPrice = realPrice ?? asset.price
      let candles: Candle[]
      if (cached && Date.now() - cached.ts < cacheTtl) {
        candles = cached.candles
      } else {
        candles = generateMockCandles(seedPrice, candleLimit, selectedTf.seconds, cacheKey)
        candleCache.set(cacheKey, { candles, ts: Date.now() })
      }

      // 2b. OTC server-authoritative: se o asset é OTC mapeado E o tf é suportado pelo
      //     backend (5, 15, 60, 300), substitui o mock pelos candles reais do servidor.
      //     Garante que histórico e (futuramente) ticks ao vivo são da mesma fonte.
      const otcSymbolForHistory = assetIdToOtcSymbol(asset.id)
      const tfSupportedByOtc    = (OTC_BACKEND_TFS as readonly number[]).includes(selectedTf.seconds)
      let otcBackendActive = false   // true quando histórico veio do backend OTC (etapa C)
      if (otcSymbolForHistory && tfSupportedByOtc && !realConfig) {
        const otcCandles = await fetchOtcCandles(otcSymbolForHistory, selectedTf.seconds, candleLimit)
        if (cancelled) return  // trocou de ativo durante o fetch OTC — aborta
        if (otcCandles && otcCandles.length > 0) {
          candles = otcCandles.map(c => ({
            time:  (c.t - 3 * 3600) as any,   // backend epoch UTC -> eixo BRT do chart (UTC-3)
            open:  c.o, high: c.h, low: c.l, close: c.c,
          }))
          candleCache.set(cacheKey, { candles, ts: Date.now() })
          otcBackendActive = true
        }
      }

      // 2c. WS server-authoritative: live ticks do backend. Roda só se temos o símbolo
      //     mapeado E o asset não tem fonte real (Binance/Yahoo) — caso contrário, os ticks
      //     OTC conflitam com o feed real e fazem o preço saltar (ex: BTC histórico 77k da
      //     Binance + tick OTC a 67k = candle gigante de queda fantasma).
      //
      // Tambem requisita reset quando o tick do WS diverge >0.5% do ultimo candle
      // historico — engine pode ter restartado/driftado entre persistir candle e enviar
      // o tick atual, causando candle gigante na transicao hist -> live.
      const PRICE_GAP_THRESHOLD = 0.005  // 0.5%
      if (otcSymbolForHistory && !realConfig && process.env.NEXT_PUBLIC_OTC_WS !== '0') {
        otcWs = subscribeOtc(otcSymbolForHistory, (tick) => {
          if (otcWsPrice == null) {
            // Primeiro tick — decide se precisa resetar o candle vivo
            const lastClose = candles[candles.length - 1]?.close
            if (!otcBackendActive) {
              otcResetNeeded = true  // fallback mock → tick real
            } else if (lastClose != null && Math.abs(tick.price - lastClose) / lastClose > PRICE_GAP_THRESHOLD) {
              otcResetNeeded = true  // backend hist desincronizado com tick atual
            }
          }
          otcWsPrice = tick.price
        })
      }

      // 3. Tenta substituir pelos candles reais — mas só se não estiverem velhos
      //    (Forex fecha no fim de semana; candles velhos causam gap visual enorme)
      if (realConfig && interval) {
        try {
          const params = new URLSearchParams({
            symbol:   realConfig.symbol,
            source:   realConfig.source,
            interval,
            limit:    String(candleLimit),
          })
          const res = await fetch(`/api/market/candles?${params}`)
          const json = await res.json()
          if (json.candles?.length > 0) {
            const last = json.candles[json.candles.length - 1]
            const nowBRT = Math.floor(Date.now() / 1000) - 3 * 3600
            const ageHours = (nowBRT - (last.time as number)) / 3600
            // Binance: sempre usa (cripto 24/7). Yahoo: só usa se candles < 3h
            const useReal = isBinance || ageHours < 3
            if (useReal) {
              candles = json.candles
              candleCache.set(cacheKey, { candles, ts: Date.now() })
            }
            // Se candles estão velhos (forex fechado), mantém OTC mock
            // seedado do preço real — visual coerente com o preço atual
          }
        } catch {}
      }

      if (cancelled) return  // trocou de ativo durante o fetch de candles reais — aborta antes de renderizar

      // BB fill areas must be added BEFORE the main series so candles render on top
      const bbData = showBB ? calculateBollingerBands(candles, bbSettings.period, bbSettings.deviation) : []
      if (showBB && bbData.length > 0) {
        const fillRgba = hexToRgba(bbSettings.colorFill, 0.14)
        const areaCommon = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, lineWidth: 0 as const }
        const upperFill = chart.addSeries(AreaSeries, { lineColor: 'transparent', topColor: fillRgba, bottomColor: fillRgba, ...areaCommon })
        upperFill.setData(bbData.map(d => ({ time: d.time, value: d.upper })))
        // Erase area below lower band so fill only appears between the bands
        const eraseFill = chart.addSeries(AreaSeries, { lineColor: 'transparent', topColor: tc.bg, bottomColor: tc.bg, ...areaCommon })
        eraseFill.setData(bbData.map(d => ({ time: d.time, value: d.lower })))
      }

      // Main series based on chart type
      const CC = getCandleColors()
      let mainSeries: any
      if (chartType === 'area') {
        mainSeries = chart.addSeries(AreaSeries, {
          lineColor: '#1FD196',
          topColor: 'rgba(38, 166, 154, 0.3)',
          bottomColor: 'rgba(38, 166, 154, 0.01)',
          lineWidth: 2,
          priceFormat,
        })
        mainSeries.setData(candles.map(c => ({ time: c.time, value: c.close })))
      } else if (chartType === 'barras') {
        mainSeries = chart.addSeries(BarSeries, {
          upColor: CC.up,
          downColor: CC.down,
          priceFormat,
        })
        mainSeries.setData(candles)
      } else if (chartType === 'heiken-ashi') {
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: CC.up,
          downColor: CC.down,
          borderUpColor: CC.up,
          borderDownColor: CC.down,
          wickUpColor: CC.up,
          wickDownColor: CC.down,
          priceFormat,
        })
        mainSeries.setData(toHeikenAshi(candles))
      } else {
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: CC.up,
          downColor: CC.down,
          borderUpColor: CC.up,
          borderDownColor: CC.down,
          wickUpColor: CC.up,
          wickDownColor: CC.down,
          priceFormat,
        })
        mainSeries.setData(candles)
      }

      seriesRef.current = mainSeries
      // Compartilha as velas com o sub-painel de oscilador (RSI/MACD/Stoch) —
      // o bump de chartKey logo abaixo faz o sub-painel redesenhar com elas.
      oscCandlesRef.current = { key: `${asset.id}:${TIMEFRAMES[tfIndex].seconds}`, candles }
      setChartKey(k => k + 1) // sinaliza que o gráfico está pronto para receber price lines
      releaseLoader()          // libera o pre-loader (respeitando o piso de 5s)

      // Dashed price line at current close — estilo Quotex
      mainSeries.applyOptions({
        priceLineVisible: true,
        priceLineStyle: LineStyle.Dashed,
        priceLineColor: '#2E6BE6',
        priceLineWidth: 1,
        lastValueVisible: false,
      })

      let maSeriesLive: any = null
      let maCloses: number[] = []
      let maLastStart = 0

      // Moving Average overlay.
      // maSeriesLive/maCloses: a MA é recalculada a cada tick pra linha
      // acompanhar a vela em formação — sem isso ela congela no fim do
      // histórico e vai ficando pra trás do preço até o chart rebuildar.
      if (showSMA) {
        const maData = calculateMA(candles, maSettings)
        const smaSeries = chart.addSeries(LineSeries, {
          color: maSettings.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        smaSeries.setData(maData)
        maSeriesLive = smaSeries
        maCloses = candles.map(c => c.close)
      }

      // ZigZag overlay
      if (showZigzag) {
        const zzData = calculateZigZag(candles, 5)
        if (zzData.length > 1) {
          const zzSeries = chart.addSeries(LineSeries, {
            color: '#ef4444',
            lineWidth: 1.5,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          zzSeries.setData(zzData)
        }
      }

      // Bollinger Bands — line overlays (fill was added before main series for correct z-order)
      if (showBB && bbData.length > 0) {
        const bbCommon = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
        const bbUpper = chart.addSeries(LineSeries, { color: bbSettings.colorTop, lineWidth: 1, ...bbCommon })
        const bbMid   = chart.addSeries(LineSeries, { color: hexToRgba(bbSettings.colorMid, 0.6), lineWidth: 1, lineStyle: LineStyle.Dashed, ...bbCommon })
        const bbLower = chart.addSeries(LineSeries, { color: bbSettings.colorBot, lineWidth: 1, ...bbCommon })
        bbUpper.setData(bbData.map(d => ({ time: d.time, value: d.upper })))
        bbMid.setData(bbData.map(d => ({ time: d.time, value: d.middle })))
        bbLower.setData(bbData.map(d => ({ time: d.time, value: d.lower })))
      }

      // Parabolic SAR overlay — split into segments by trend direction
      if (showPSAR) {
        const sarData = calculateParabolicSAR(candles)
        const segments: { time: number; value: number }[][] = []
        let seg: { time: number; value: number }[] = []
        let lastBull: boolean | null = null
        for (const d of sarData) {
          if (lastBull !== null && d.bull !== lastBull) { segments.push(seg); seg = [] }
          seg.push({ time: d.time, value: d.value }); lastBull = d.bull
        }
        if (seg.length > 0) segments.push(seg)
        for (const segment of segments) {
          const sarSeg = chart.addSeries(LineSeries, {
            color: '#f59e0b',
            lineWidth: 2,
            lineStyle: LineStyle.Dotted,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          sarSeg.setData(segment)
        }
      }

      // Alligator overlay — 3 SMMAs do preço mediano deslocadas pro futuro
      if (showAlligator) {
        const tfSecAll = TIMEFRAMES[tfIndex].seconds
        const gatorLines = [
          { period: alligatorSettings.jawPeriod,   shift: alligatorSettings.jawShift,   color: alligatorSettings.colorJaw },
          { period: alligatorSettings.teethPeriod, shift: alligatorSettings.teethShift, color: alligatorSettings.colorTeeth },
          { period: alligatorSettings.lipsPeriod,  shift: alligatorSettings.lipsShift,  color: alligatorSettings.colorLips },
        ]
        for (const ln of gatorLines) {
          const data = calculateAlligatorLine(candles, ln.period, ln.shift, tfSecAll)
          if (data.length === 0) continue
          const gatorSeries = chart.addSeries(LineSeries, {
            color: ln.color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          gatorSeries.setData(data)
        }
      }

      // Fractal overlay — setas acima/abaixo das velas de pivô
      if (showFractal) {
        const { ups, downs } = calculateFractals(candles, fractalSettings.period)
        const markers = [
          ...ups.map(t => ({ time: t as any, position: 'aboveBar' as const, color: fractalSettings.colorUp,   shape: 'arrowUp' as const })),
          ...downs.map(t => ({ time: t as any, position: 'belowBar' as const, color: fractalSettings.colorDown, shape: 'arrowDown' as const })),
        ].sort((a, b) => (a.time as number) - (b.time as number))
        if (markers.length > 0) createSeriesMarkers(mainSeries, markers)
      }

      // OHLC crosshair subscription
      chart.subscribeCrosshairMove((param: any) => {
        if (!param || !param.time || !param.seriesData) { setOhlc(null); setCandleTime(''); return }
        const data = param.seriesData.get(mainSeries)
        if (!data) { setOhlc(null); return }
        const open  = data.open  ?? data.value ?? 0
        const close = data.close ?? data.value ?? 0
        const high  = data.high  ?? data.value ?? 0
        const low   = data.low   ?? data.value ?? 0
        setOhlc({ open, high, low, close })
        const t = typeof param.time === 'number' ? param.time : 0
        const d = new Date(t * 1000)
        const h = d.getHours().toString().padStart(2, '0')
        const m = d.getMinutes().toString().padStart(2, '0')
        const s = d.getSeconds().toString().padStart(2, '0')
        setCandleTime(`${h}:${m}:${s}`)
      })

      chart.timeScale().scrollToRealTime()

      // ── Limites de Zoom e Pan ─────────────────────────────────────────────
      // 3.1: Limite máximo de zoom-in (mín 10 barras visíveis)
      // 3.2: Limite de arrasto para esquerda (máx 50% da tela vazia)
      let dataCount = candles.length
      let enforcingChartLimits = false
      const MIN_VISIBLE_BARS = 10
      chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
        if (enforcingChartLimits || !range) return
        const visibleBars = range.to - range.from

        // 3.1: Impede zoom-in além de MIN_VISIBLE_BARS
        if (visibleBars < MIN_VISIBLE_BARS) {
          enforcingChartLimits = true
          const center = (range.from + range.to) / 2
          chart.timeScale().setVisibleLogicalRange({
            from: center - MIN_VISIBLE_BARS / 2,
            to: center + MIN_VISIBLE_BARS / 2,
          })
          requestAnimationFrame(() => { enforcingChartLimits = false })
          return
        }

        // 3.2: Impede arrasto para esquerda além de 50% da tela
        const maxTo = dataCount + visibleBars * 0.5
        if (range.to > maxTo) {
          enforcingChartLimits = true
          chart.timeScale().setVisibleLogicalRange({
            from: maxTo - visibleBars,
            to: maxTo,
          })
          requestAnimationFrame(() => { enforcingChartLimits = false })
          return
        }
      })

      // ── OTC Live Engine ───────────────────────────────────────────────────
      const decimals = getAssetDecimals(asset)
      const fmt5 = (v: number) => parseFloat(v.toFixed(decimals))
      const tfSec = selectedTf.seconds

      const BRT_OFFSET = -3 * 3600
      const nowSec = () => Math.floor(Date.now() / 1000) + BRT_OFFSET
      const alignedStart = (t: number) => Math.floor(t / tfSec) * tfSec

      const getPrice = () => {
        // 1) Tick ao vivo do servidor (etapa D, quando WS estiver ligado)
        if (otcWsPrice != null) return fmt5(otcWsPrice)
        // 2) Histórico OTC veio do backend mas WS ainda OFF: congela no último fechamento
        //    (sem isso o engine local gera ticks em outra escala de preço e causa candle gigante).
        if (otcBackendActive) return fmt5(candles[candles.length - 1].close)
        // 3) Ativo com feed real: NUNCA inventa preco. Se o realPrice ainda nao
        //    chegou (fetch pendente/falhou), retorna 0 = tick ignorado. Antes
        //    caia no engine OTC seedado no price estatico da lista (EUR/USD
        //    1.0854) e desenhava vela fantasma fora da escala real.
        if (realConfig) {
          if (realPrice == null) return 0
          // Preco real PURO, sem blend de ruido OTC: o ruido (8% de um passeio
          // de ate ±2.9%) fabricava ate ±9 pips no preco exibido — vela ao vivo
          // descolava do historico e o cliente via um preco que nao e o que
          // liquida (live_prices). Entre polls de 5s a vela fica parada: honesto.
          return fmt5(realPrice)
        }
        // 4) Fallback engine client-side (OTC fora do backend, ou TF não suportado)
        return fmt5(getOTCPrice(asset.id, nowSec(), asset.price))
      }

      // ── Separação tick / frame ────────────────────────────────────────────
      // targetPrice  → preço real do tick (200ms)
      // displayedPrice → interpola suavemente até targetPrice a cada frame (~60fps)
      // Constante de TEMPO, nao fator por frame. Com fator fixo por frame a
      // suavizacao depende do refresh: num monitor de 120Hz ela converge no
      // dobro da velocidade de um de 60Hz e o movimento fica seco/arranhado.
      // 130ms reproduz o comportamento antigo de 0.12 a 60fps.
      const SMOOTH_TAU_MS = 130

      // O "micro tremor estilo Quotex" que existia aqui foi REMOVIDO.
      //
      // Era um random-walk somado ao preço a cada frame pra vela "respirar" entre
      // ticks. Na prática é ruído aleatório: a vela vibrava mesmo com preço
      // parado, antes e depois de qualquer movimento real, e o pavio crescia
      // sozinho porque high/low acompanhavam o ruído. Nenhuma suavização resolve
      // isso — o tremor não era engasgo de render, era movimento fabricado.
      //
      // Agora o desenho segue exatamente o displayedPrice: parado quando o preço
      // está parado, e liso quando ele anda.

      // Âncora de abertura: fechamento do último candle histórico.
      // Garante continuidade visual — a vela ao vivo abre exatamente onde a
      // história terminou, evitando o corpo inicial enorme causado por pico do OTC.
      const lastHistClose = fmt5(candles[candles.length - 1].close)
      let targetPrice     = getPrice() || lastHistClose  // 0 (sem preco real ainda) -> segura no fechamento
      let displayedPrice  = lastHistClose  // anima DO histórico ATÉ o preço real

      let candleStart  = alignedStart(nowSec())
      let candleOpen   = lastHistClose     // abre no fechamento anterior
      let candleHigh   = Math.max(lastHistClose, targetPrice)
      let candleLow    = Math.min(lastHistClose, targetPrice)

      // Feed real: a vela ao vivo abre NO preco real de agora, nao no fechamento
      // do historico. O historico chega defasado (cache de ate ~2min + atraso do
      // provider); abrir nele esticava uma "vela gigante" cobrindo o movimento
      // perdido a cada troca de paridade. Degrau honesto > velao fabricado.
      if (realConfig && realPrice != null) {
        displayedPrice = targetPrice
        candleOpen     = fmt5(targetPrice)
        candleHigh     = candleOpen
        candleLow      = candleOpen
      }
      const entryPrice = fmt5(displayedPrice)
      let lastSecsLeft = -1

      // Preenche gap entre último candle histórico e o motor ao vivo (só pro engine local).
      // Quando o backend OTC fornece o histórico, o gap é mínimo (engine grava candle em tempo real)
      // e qualquer preço gerado client-side estaria em escala errada.
      // Ativo com feed REAL (realConfig): NUNCA preencher — o engine client-side é
      // seedado no price estático da lista (EUR/USD 1.0854) e pintava "velas
      // fantasma" ~500 pips abaixo do real nos minutos entre o fim do histórico
      // (cache de até 5min) e o agora, esticando a escala. Gap visual honesto.
      const lastHistTime = candles[candles.length - 1].time as number
      if (!otcBackendActive && !realConfig) {
        for (let gapT = lastHistTime + tfSec; gapT < candleStart; gapT += tfSec) {
          const gapPrice = fmt5(getOTCPrice(asset.id, gapT, asset.price))
          if (chartType === 'area') mainSeries.update({ time: gapT, value: gapPrice })
          else mainSeries.update({ time: gapT, open: gapPrice, high: gapPrice, low: gapPrice, close: gapPrice })
          maCloses.push(gapPrice) // vela de gap também conta pra MA ao vivo
        }
      }
      // Candle inicial (abre no preco ja "snapado" acima quando ha feed real)
      const initClose = fmt5(displayedPrice)
      if (chartType === 'area') mainSeries.update({ time: candleStart, value: initClose })
      else mainSeries.update({ time: candleStart, open: candleOpen, high: candleHigh, low: candleLow, close: initClose })
      // Vela ao vivo entra no buffer da MA como último elemento
      maCloses.push(initClose)
      maLastStart = candleStart

      chart.timeScale().scrollToRealTime()
      setCurrentPrice(initClose)
      onPriceUpdateRef.current?.(initClose)

      // ── Tick (200ms): atualiza targetPrice, high/low e estado de tempo ────
      priceInterval = setInterval(() => {
        const now = nowSec()

        // WS da Binance fresco (<15s) => a vela OFICIAL comanda; senão poll/engine
        const wsFresh = wsKline != null && Date.now() - wsLastMsgAt < 15_000

        if (!wsFresh) {
          const next = getPrice()
          if (next > 0) targetPrice = next
        }

        // Reset solicitado pelo primeiro tick OTC do servidor:
        // evita candle gigante quando o preço mock diverge muito do real.
        if (otcResetNeeded) {
          otcResetNeeded = false
          candleStart    = alignedStart(now)
          displayedPrice = targetPrice
          candleOpen     = fmt5(targetPrice)
          candleHigh     = candleOpen
          candleLow      = candleOpen
        }

        if (wsFresh && wsKline) {
          // Espelha a vela oficial da Binance: OHLC verdadeiro, trade a trade.
          const wsStart = wsKline.start + BRT_OFFSET
          if (wsStart > candleStart) {
            // Virada oficial do candle — a Binance decide, não o relógio local
            candleStart    = wsStart
            displayedPrice = targetPrice        // cancela lag pendente da animação
            candleOpen     = fmt5(wsKline.open)
            candleHigh     = fmt5(wsKline.high)
            candleLow      = fmt5(wsKline.low)
            dataCount++                         // atualiza limite de pan (3.2)
          } else if (wsStart === candleStart) {
            candleOpen = fmt5(wsKline.open)
            const wsHigh = fmt5(wsKline.high)
            const wsLow  = fmt5(wsKline.low)
            if (wsHigh > candleHigh) candleHigh = wsHigh
            if (wsLow  < candleLow)  candleLow  = wsLow
          }
          // Se wsStart < candleStart (relógio local adiantado já abriu vela nova),
          // só o preço acompanha até a Binance virar o candle oficial.
          targetPrice = fmt5(wsKline.close)
        } else if (now >= candleStart + tfSec) {
          // Avança candle quando o período termina (relógio local).
          // Snap de displayedPrice → targetPrice na troca de vela:
          // garante que a nova vela abre no preço real, sem herdar o lag
          // da interpolação anterior (que causava candles enormes no primeiro tick).
          candleStart    = alignedStart(now)
          displayedPrice = targetPrice          // cancela lag pendente
          candleOpen     = fmt5(targetPrice)
          candleHigh     = candleOpen
          candleLow      = candleOpen
          dataCount++                           // atualiza limite de pan (3.2)
        }

        // High/low atualizados pelo preço real (tick), não pela animação.
        // Isso evita que o caminho da interpolação expanda o corpo da vela.
        if (targetPrice > candleHigh) candleHigh = targetPrice
        if (targetPrice < candleLow)  candleLow  = targetPrice

        // MA ao vivo: acompanha a vela em formação. Usa o preço limpo
        // (targetPrice), nunca o tremor cosmético do RAF.
        if (maSeriesLive) {
          const cleanClose = fmt5(targetPrice)
          if (candleStart !== maLastStart) {
            maCloses.push(cleanClose)          // virada: vela anterior consolidada
            maLastStart = candleStart
            if (maCloses.length > 2000) maCloses.splice(0, maCloses.length - 1500)
          } else {
            maCloses[maCloses.length - 1] = cleanClose
          }
          if (maCloses.length >= maSettings.period) {
            try {
              // Janela de 3× o período: EMA/SMMA convergem, SMA/WMA são exatas
              const win = maCloses.slice(-Math.max(maSettings.period * 3, maSettings.period + 1))
              const pts = calculateMA(win.map((v, i) => ({ time: i, close: v })) as any, maSettings)
              const lastPt = pts[pts.length - 1]
              if (lastPt) maSeriesLive.update({ time: candleStart, value: lastPt.value })
            } catch {}
          }
        }

        // Timer de expiração do candle
        const secsLeft = tfSec - (now % tfSec)
        if (secsLeft !== lastSecsLeft) {
          lastSecsLeft = secsLeft
          setCandleSecsLeft(secsLeft)
        }

        // Posição X do timer (eixo de tempo) — escrita direta no DOM
        if (chartRef.current) {
          const x = chartRef.current.timeScale().timeToCoordinate(now)
          const chartW = chartContainerRef.current?.clientWidth ?? 0
          const dotEl = livePulseRef.current
          if (dotEl) {
            if (x != null && x > 0 && x < chartW) {
              dotEl.style.opacity = '1'
              dotEl.style.left = `${x}px`
            } else {
              dotEl.style.opacity = '0'
            }
          }
        }
      }, 200)

      // ── RAF (~60fps): interpola displayedPrice → targetPrice e renderiza ─
      let lastFrameMs = performance.now()

      function animate() {
        const frameNow = performance.now()
        // Clamp em 100ms: aba em background, GC longo ou stall de rede geram um
        // dt gigante que teleportaria o preço num salto só.
        const dt = Math.min(Math.max(frameNow - lastFrameMs, 1), 100)
        lastFrameMs = frameNow

        // Preço LIMPO: interpola suavemente até o tick real. Alimenta o preço
        // exibido e a entrada/saída de operação — NUNCA recebe o tremor cosmético.
        // Suavização exponencial por TEMPO: idêntica em 60Hz, 120Hz ou 144Hz.
        const kSmooth = 1 - Math.exp(-dt / SMOOTH_TAU_MS)
        displayedPrice = displayedPrice + (targetPrice - displayedPrice) * kSmooth
        const dp = fmt5(displayedPrice)

        // Desenho = preço interpolado, sem nada somado por cima.
        const renderClose = dp

        // Pavio "respira": high/low acompanham o tremor ao vivo (puramente visual,
        // resetados a cada nova vela pelo tick de 200ms).
        if (renderClose > candleHigh) candleHigh = renderClose
        if (renderClose < candleLow)  candleLow  = renderClose

        const candle = { time: candleStart, open: candleOpen, high: candleHigh, low: candleLow, close: renderClose }

        try {
          if (chartType === 'area') {
            mainSeries.update({ time: candleStart, value: renderClose })
          } else if (chartType === 'heiken-ashi') {
            const haClose = fmt5((candleOpen + candleHigh + candleLow + renderClose) / 4)
            mainSeries.update({ ...candle, close: haClose })
          } else {
            mainSeries.update(candle)
          }
        } catch {}

        if (autoScrollRef.current && chartRef.current) {
          // Respeita o pan do usuario: se ele rolou pra historia (scrollPosition > 0),
          // NAO snap de volta. Caso contrario auto-scroll briga com gesto de toque
          // e o grafico fica imovel em mobile.
          const ts = chartRef.current.timeScale()
          if (ts.scrollPosition() <= 0) ts.scrollToRealTime()
        }

        // A serie do grafico segue atualizando a cada frame (series.update acima).
        // Os states de React sao sincronizados a ~7Hz: re-render a 60fps engasga
        // o canvas do lightweight-charts sem ganho visual nenhum.
        // Etiqueta de preço: posição e valor escritos DIRETO no DOM a cada
        // frame — sem re-render do React, o movimento fica contínuo.
        let y: number | null = null
        try { y = mainSeries.priceToCoordinate(dp) ?? null } catch {}
        const badgeEl = priceBadgeRef.current
        if (badgeEl) {
          if (y == null) badgeEl.style.opacity = '0'
          else {
            badgeEl.style.opacity = '1'
            badgeEl.style.transform = `translateY(${y}px) translateY(-50%)`
            if (priceValueRef.current) priceValueRef.current.textContent = dp.toFixed(assetDecimals)
          }
        }
        if (livePulseRef.current && y != null) livePulseRef.current.style.top = `${y}px`

        // Aqui estava o "arranhado": cinco setState a ~7Hz forçavam uma
        // reconciliação completa deste componente (que é grande) no meio da
        // animação, derrubando frames em intervalos regulares — exatamente o
        // padrão de travada periódica que aparecia na formação da vela.
        //
        // O desenho não depende disto: a série e a etiqueta de preço já são
        // escritas direto acima, a cada frame. Estes states só alimentam texto
        // auxiliar, então caem pra ~5Hz e, com update funcional, o React nem
        // re-renderiza quando o valor não mudou.
        if (frameNow - lastStateSyncRef.current > 200) {
          lastStateSyncRef.current = frameNow
          const pc = fmt5(dp - entryPrice)
          setCurrentPrice(prev => (prev === dp ? prev : dp))
          setPriceChange(prev => (prev === pc ? prev : pc))
          setLiveOhlc(prev => (
            prev && prev.open === candleOpen && prev.high === candleHigh &&
            prev.low === candleLow && prev.close === renderClose
              ? prev
              : { open: candleOpen, high: candleHigh, low: candleLow, close: renderClose }
          ))
          setCandleTimerY(prev => (prev === y ? prev : y))
          onPriceUpdateRef.current?.(dp)
        }

        rafId = requestAnimationFrame(animate)
      }

      rafId = requestAnimationFrame(animate)

      // ── Refresh suave ao reabrir a aba ─────────────────────────────────
      // Só p/ ativos com feed real e SEM overlays (indicadores recalculam no
      // remount clássico). Re-busca o histórico e re-ancora a vela ao vivo em
      // cima do chart existente: sem skeleton, sem perder zoom. Retornar false
      // (ou lançar) faz o caller cair no remount antigo — fallback garantido.
      const rc = realConfig
      const iv = interval
      const softEligible = Boolean(rc && iv) &&
        !showSMA && !showBB && !showZigzag && !showPSAR && !showRSI && !showMACD &&
        !showStoch && !showAlligator && !showFractal
      softRefreshRef.current = !softEligible ? null : async () => {
        if (cancelled || !rc || !iv || !chartRef.current || !seriesRef.current) return false
        try {
          const params = new URLSearchParams({ symbol: rc.symbol, source: rc.source, interval: iv, limit: String(candleLimit) })
          const res  = await fetch(`/api/market/candles?${params}`)
          const json = await res.json()
          if (cancelled) return true   // trocou de par durante o fetch — não força remount do chart novo
          const fresh: Candle[] = json?.candles ?? []
          if (fresh.length === 0) return false
          candleCache.set(cacheKey, { candles: fresh, ts: Date.now() })
          if (chartType === 'area')             mainSeries.setData(fresh.map(c => ({ time: c.time, value: c.close })))
          else if (chartType === 'heiken-ashi') mainSeries.setData(toHeikenAshi(fresh))
          else                                  mainSeries.setData(fresh)
          // Re-ancora a vela ao vivo: preço real atual ou, sem ele, o último fechamento
          const next  = getPrice()
          targetPrice = next > 0 ? next : fmt5(fresh[fresh.length - 1].close)
          candleStart    = alignedStart(nowSec())
          displayedPrice = targetPrice
          candleOpen     = fmt5(targetPrice)
          candleHigh     = candleOpen
          candleLow      = candleOpen
          return true
        } catch {
          return false
        }
      }
    }

    softRefreshRef.current = null   // até o init concluir, volta de aba = remount clássico
    initChart()

    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    })

    if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current)

    return () => {
      cancelled = true
      softRefreshRef.current = null
      if (loaderTimerRef.current) { clearTimeout(loaderTimerRef.current); loaderTimerRef.current = null }
      clearInterval(priceInterval)
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (realPriceInterval) clearInterval(realPriceInterval)
      if (otcWs) { otcWs.close(); otcWs = null }
      if (binanceWs) { try { binanceWs.close() } catch {} binanceWs = null }
      if (krakenWs) { try { krakenWs.close() } catch {} krakenWs = null }
      resizeObserver.disconnect()
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
      // Limpa refs de séries destruídas para que as linhas sejam recriadas no novo gráfico
      seriesRef.current = null
      priceLinesRef.current = {}
    }
  }, [asset.id, asset.price, tfIndex, chartType, showSMA, showZigzag, showBB, showPSAR, showAlligator, showFractal, bbSettings, maSettings, alligatorSettings, fractalSettings, remountKey])

  // ── Oscillator sub-panel (RSI / MACD) ────────────────────────────────────
  useEffect(() => {
    if (!activeOsc) {
      if (oscChartRef.current) { oscChartRef.current.remove(); oscChartRef.current = null }
      return
    }

    let oscChart: any = null
    let unsubMain = () => {}, unsubOsc = () => {}

    async function initOscChart() {
      if (!oscChartContainerRef.current) return
      const { createChart, ColorType, LineSeries, HistogramSeries } = await import('lightweight-charts')
      const tc = THEME_COLORS[theme]

      oscChart = createChart(oscChartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: tc.bg }, textColor: tc.text, fontSize: 10, attributionLogo: false },
        grid:   { vertLines: { color: tc.grid }, horzLines: { color: tc.grid } },
        rightPriceScale: { borderColor: tc.border, textColor: tc.text, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: tc.border, timeVisible: false, visible: false },
        crosshair: { vertLine: { color: tc.crosshair, labelVisible: false }, horzLine: { color: tc.crosshair, labelBackgroundColor: tc.labelBg } },
        handleScroll: { mouseWheel: false },
        handleScale:  { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
        width:  oscChartContainerRef.current.clientWidth,
        height: oscChartContainerRef.current.clientHeight,
      })
      oscChartRef.current = oscChart

      const tfSec = TIMEFRAMES[tfIndex].seconds
      // Usa as velas REAIS do gráfico principal quando disponíveis (mesmo
      // ativo+TF); mock só como fallback enquanto o principal ainda carrega.
      const shared = oscCandlesRef.current
      const candles = shared && shared.key === `${asset.id}:${tfSec}` && shared.candles.length > 0
        ? shared.candles
        : generateMockCandles(asset.price, 80, tfSec, `${asset.id}:${tfSec}`)

      if (activeOsc === 'rsi') {
        const rsiSeries = oscChart.addSeries(LineSeries, {
          color: rsiSettings.colorMain, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        })
        rsiSeries.setData(calculateRSI(candles, rsiSettings.period))
        rsiSeries.createPriceLine({ price: rsiSettings.overbought, color: rsiSettings.colorOverbought, lineWidth: 1, lineStyle: 2, axisLabelVisible: true })
        rsiSeries.createPriceLine({ price: rsiSettings.oversold,   color: rsiSettings.colorOversold,   lineWidth: 1, lineStyle: 2, axisLabelVisible: true })
        rsiSeries.createPriceLine({ price: 50, color: '#ffffff18', lineWidth: 1, lineStyle: 2, axisLabelVisible: false })
      } else if (activeOsc === 'stochastic') {
        const { kLine, dLine } = calculateStochastic(candles, stochSettings.kPeriod, stochSettings.smooth, stochSettings.dPeriod)
        const kSeries = oscChart.addSeries(LineSeries, {
          color: stochSettings.colorK, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: true,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        })
        kSeries.setData(kLine)
        const dSeries = oscChart.addSeries(LineSeries, { color: stochSettings.colorD, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false })
        dSeries.setData(dLine)
        kSeries.createPriceLine({ price: stochSettings.overbought, color: stochSettings.colorOverbought, lineWidth: 1, lineStyle: 2, axisLabelVisible: true })
        kSeries.createPriceLine({ price: stochSettings.oversold,   color: stochSettings.colorOversold,   lineWidth: 1, lineStyle: 2, axisLabelVisible: true })
      } else {
        const { macdLine, signalLine, histogram } = calculateMACD(candles, macdSettings.fastPeriod, macdSettings.slowPeriod, macdSettings.signalPeriod)
        const histSeries = oscChart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false })
        histSeries.setData(histogram.map(d => ({
          ...d,
          color: d.value >= 0
            ? hexToRgba(macdSettings.colorHistogram, 0.9)
            : hexToRgba(macdSettings.colorHistogram, 0.45),
        })))
        const macdSeries = oscChart.addSeries(LineSeries, { color: macdSettings.colorMACD, lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
        macdSeries.setData(macdLine)
        const sigSeries = oscChart.addSeries(LineSeries, { color: macdSettings.colorSignal, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false })
        sigSeries.setData(signalLine)
      }

      // Sync timeScale with main chart
      const mainRange = chartRef.current?.timeScale().getVisibleLogicalRange()
      if (mainRange) try { oscChart.timeScale().setVisibleLogicalRange(mainRange) } catch {}

      let syncing = false
      const handleMain = (range: any) => {
        if (syncing || !range) return; syncing = true
        try { oscChart?.timeScale().setVisibleLogicalRange(range) } catch {}
        syncing = false
      }
      const handleOsc = (range: any) => {
        if (syncing || !range) return; syncing = true
        try { chartRef.current?.timeScale().setVisibleLogicalRange(range) } catch {}
        syncing = false
      }
      chartRef.current?.timeScale().subscribeVisibleLogicalRangeChange(handleMain)
      oscChart.timeScale().subscribeVisibleLogicalRangeChange(handleOsc)
      unsubMain = () => { try { chartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(handleMain) } catch {} }
      unsubOsc  = () => { try { oscChart?.timeScale().unsubscribeVisibleLogicalRangeChange(handleOsc) } catch {} }

      const ro = new ResizeObserver(() => {
        if (oscChart && oscChartContainerRef.current)
          oscChart.applyOptions({ width: oscChartContainerRef.current.clientWidth, height: oscChartContainerRef.current.clientHeight })
      })
      if (oscChartContainerRef.current) ro.observe(oscChartContainerRef.current)
    }

    initOscChart()
    return () => {
      unsubMain(); unsubOsc()
      if (oscChartRef.current) { oscChartRef.current.remove(); oscChartRef.current = null }
    }
  // chartKey nas deps: quando o gráfico principal termina de (re)carregar as
  // velas reais, o sub-painel redesenha com elas em vez do fallback mock.
  }, [activeOsc, asset.id, asset.price, tfIndex, theme, macdSettings, rsiSettings, stochSettings, chartKey])

  const fmt = (v: number) => v.toFixed(getAssetDecimals(asset))

  // ── Select + drag drawings ────────────────────────────────────────────────
  const startDrawingDrag = useCallback((
    id: string,
    handle: 'body' | 'p1' | 'p2' | 'offset',
    e: React.MouseEvent,
    origDrawing: Drawing,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedDrawingId(id)
    setDrawingsOpen(true)
    draggingRef.current = { id, handle, startClientX: e.clientX, startClientY: e.clientY, origDrawing }

    const onMove = (me: MouseEvent) => {
      const drag = draggingRef.current
      if (!drag || !chartRef.current || !seriesRef.current || !chartContainerRef.current) return
      const ts = chartRef.current.timeScale()
      const dx = me.clientX - drag.startClientX
      const dy = me.clientY - drag.startClientY
      const orig = drag.origDrawing

      setDrawings(prev => prev.map(item => {
        if (item.id !== drag.id) return item

        if (item.type === 'hline') {
          const origY = seriesRef.current!.priceToCoordinate((orig as typeof item).price)
          if (origY == null) return item
          const newPrice = seriesRef.current!.coordinateToPrice(origY + dy) as number | null
          return newPrice != null ? { ...item, price: newPrice } : item
        }

        if (item.type === 'vline') {
          const origX = ts.timeToCoordinate((orig as typeof item).time)
          if (origX == null) return item
          const newTime = ts.coordinateToTime(origX + dx) as number | null
          return newTime != null ? { ...item, time: newTime } : item
        }

        if (item.type === 'trendline' || item.type === 'fib' || item.type === 'rect' || item.type === 'extline' || item.type === 'channel') {
          const o = orig as Extract<Drawing, { type: 'trendline' | 'fib' | 'rect' | 'extline' | 'channel' }>
          const getNew = (p: { time: number; price: number }, ddx: number, ddy: number) => {
            const ox = ts.timeToCoordinate(p.time)
            const oy = seriesRef.current!.priceToCoordinate(p.price)
            if (ox == null || oy == null) return p
            const nt = ts.coordinateToTime(ox + ddx) as number | null
            const np = seriesRef.current!.coordinateToPrice(oy + ddy) as number | null
            return nt != null && np != null ? { time: nt, price: np } : p
          }

          // Alça da linha paralela do canal: só ajusta a distância (offset em preço)
          if (drag.handle === 'offset' && item.type === 'channel' && o.type === 'channel') {
            const oy = seriesRef.current!.priceToCoordinate(o.p1.price)
            if (oy == null) return item
            const pa = seriesRef.current!.coordinateToPrice(oy) as number | null
            const pb = seriesRef.current!.coordinateToPrice(oy + dy) as number | null
            return pa != null && pb != null ? { ...item, offset: o.offset + (pb - pa) } : item
          }

          if (drag.handle === 'p1') return { ...item, p1: getNew(o.p1, dx, dy) }
          if (drag.handle === 'p2') return { ...item, p2: getNew(o.p2, dx, dy) }
          // body: move both points
          return { ...item, p1: getNew(o.p1, dx, dy), p2: getNew(o.p2, dx, dy) }
        }

        return item
      }))
    }

    const onUp = () => {
      draggingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const updateDrawingColor = useCallback((id: string, color: string) => {
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, color } : d))
  }, [])

  const updateDrawingStyle = useCallback((id: string, style: DrawingStyle) => {
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, style } : d))
  }, [])

  const deleteDrawing = useCallback((id: string) => {
    setDrawings(prev => prev.filter(d => d.id !== id))
    setSelectedDrawingId(null)
  }, [])

  const ohlcNow = ohlc ?? liveOhlc

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 min-h-0">
    <section className="flex-1 flex flex-col min-h-0 bg-[#0A101A] relative overflow-hidden rounded-xl border border-[#141C28]" onClick={() => { setTfOpen(false); setChartTypeOpen(false) }} onKeyDown={() => {}}>

      {/* Cabecalho do ativo + OHLC da vela.
          Oculto no mobile: o mesmo par/payout ja aparece na linha do ativo do
          painel de negociacao, e aqui so roubava altura util do grafico. */}
      <div className="absolute top-3 left-4 z-10 hidden flex-col gap-2 pointer-events-none md:flex">
        <div className="flex items-center gap-3">
          <FlagPair code1={asset.code1} code2={asset.code2} size={28} />
          <div className="flex flex-col gap-[7px]">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[19px] font-bold leading-none tracking-[-0.01em] text-white">{asset.symbol}</h2>
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px] leading-none">
              <span className="text-[#7E8DA2]">{asset.type === 'OTC' ? 'OTC' : 'Opções'}</span>
              <span className="h-[4px] w-[4px] rounded-full bg-[#1FD196]" />
              <span className="font-bold text-[#E4EBF5]">{asset.payout}%</span>
              <span className="ml-2 text-[#5D6C80]">{timestamp}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active indicators bar */}
      {(showSMA || showZigzag || showBB || showPSAR || showAlligator || showFractal || showRSI || showMACD || showStoch) && (
        <div className="absolute top-[74px] left-4 z-10 flex flex-wrap items-center gap-2 pointer-events-none max-w-[calc(100%-120px)]">
          <button className="pointer-events-auto w-5 h-5 flex items-center justify-center text-[#7E8DA2] hover:text-white transition-colors">
            <Eye size={12} />
          </button>

          {showSMA && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#0C131F]/80 border border-[#16202D] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#7E8DA2] tracking-widest">MOVING AVERAGE</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ml-0.5" style={{ backgroundColor: maSettings.color }} />
              <span className="text-[#7E8DA2]">{maSettings.type}</span>
              <span className="text-white font-bold">{maSettings.period}</span>
              <button onClick={() => setMAEditOpen(v => !v)} className="text-[#7E8DA2] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('moving-average')} className="text-[#7E8DA2] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showZigzag && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#0C131F]/80 border border-[#16202D] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#7E8DA2] tracking-widest">ZIG ZAG</span>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0 ml-0.5" />
              <button onClick={() => toggleIndicator('zig-zag')} className="text-[#7E8DA2] hover:text-red-400 ml-1 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showBB && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#0C131F]/80 border border-[#16202D] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#7E8DA2] tracking-widest">BOLLINGER BANDS</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ml-0.5 border" style={{ backgroundColor: bbSettings.colorFill + '60', borderColor: bbSettings.colorTop }} />
              <span className="text-white font-bold">{bbSettings.period}</span>
              <span className="text-white font-bold">{bbSettings.deviation}</span>
              <button onClick={() => setBBEditOpen(v => !v)} className="text-[#7E8DA2] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('bollinger-bands')} className="text-[#7E8DA2] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showPSAR && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#0C131F]/80 border border-[#16202D] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#7E8DA2] tracking-widest">PSAR</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0 ml-0.5" />
              <button onClick={() => toggleIndicator('parabolic-sar')} className="text-[#7E8DA2] hover:text-red-400 ml-1 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showAlligator && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#0C131F]/80 border border-[#16202D] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#7E8DA2] tracking-widest">ALLIGATOR</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ml-0.5" style={{ backgroundColor: alligatorSettings.colorJaw }} />
              <span className="text-white font-bold">{alligatorSettings.jawPeriod}</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: alligatorSettings.colorTeeth }} />
              <span className="text-white font-bold">{alligatorSettings.teethPeriod}</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: alligatorSettings.colorLips }} />
              <span className="text-white font-bold">{alligatorSettings.lipsPeriod}</span>
              <button onClick={() => setAlligatorEditOpen(v => !v)} className="text-[#7E8DA2] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('alligator')} className="text-[#7E8DA2] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showFractal && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#0C131F]/80 border border-[#16202D] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#7E8DA2] tracking-widest">FRACTAL</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ml-0.5" style={{ backgroundColor: fractalSettings.colorUp }} />
              <span className="text-white font-bold">{fractalSettings.period}</span>
              <button onClick={() => setFractalEditOpen(v => !v)} className="text-[#7E8DA2] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('fractal')} className="text-[#7E8DA2] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showStoch && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#0C131F]/80 border border-[#16202D] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#7E8DA2] tracking-widest">STOCHASTIC</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ml-0.5" style={{ backgroundColor: stochSettings.colorK }} />
              <span className="text-white font-bold">{stochSettings.kPeriod}</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: stochSettings.colorD }} />
              <span className="text-white font-bold">{stochSettings.smooth}</span>
              <span className="text-white font-bold">{stochSettings.dPeriod}</span>
              <button onClick={() => setStochEditOpen(v => !v)} className="text-[#7E8DA2] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('stochastic')} className="text-[#7E8DA2] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showRSI && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#0C131F]/80 border border-[#16202D] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#7E8DA2] tracking-widest">RSI</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ml-0.5" style={{ backgroundColor: rsiSettings.colorMain }} />
              <span className="text-white font-bold">{rsiSettings.period}</span>
              <span className="text-white font-bold">{rsiSettings.overbought}</span>
              <span className="text-white font-bold">{rsiSettings.oversold}</span>
              <button onClick={() => setRSIEditOpen(v => !v)} className="text-[#7E8DA2] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('rsi')} className="text-[#7E8DA2] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}

          {showMACD && (
            <div className="pointer-events-auto flex items-center gap-1 bg-[#0C131F]/80 border border-[#16202D] rounded px-2 py-0.5 text-[10px]">
              <span className="font-bold text-[#7E8DA2] tracking-widest">MACD</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: macdSettings.colorHistogram }} />
              <span className="text-white font-bold">{macdSettings.fastPeriod}</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: macdSettings.colorMACD }} />
              <span className="text-white font-bold">{macdSettings.slowPeriod}</span>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: macdSettings.colorSignal }} />
              <span className="text-white font-bold">{macdSettings.signalPeriod}</span>
              <button onClick={() => setMACDEditOpen(v => !v)} className="text-[#7E8DA2] hover:text-white ml-1 transition-colors"><Pen size={9} /></button>
              <button onClick={() => toggleIndicator('macd')} className="text-[#7E8DA2] hover:text-red-400 ml-0.5 transition-colors"><X size={9} /></button>
            </div>
          )}
        </div>
      )}

      {/* ── Ponto pulsante na ponta da vela ao vivo (estilo Quotex) ──────── */}
      <div
        ref={livePulseRef}
        className="pointer-events-none absolute top-0 z-10"
        style={{ opacity: 0, transform: 'translate(-50%, -50%)' }}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
        </span>
      </div>

      {/* ── Label flutuante de preço atual (segue o preço no eixo Y) ─────── */}
      <div
        ref={priceBadgeRef}
        className="absolute right-0 top-0 z-10 flex items-center gap-1"
        style={{ opacity: 0, transform: 'translateY(-50%)' }}
      >
        {/* Timer de expiração do candle atual */}
        <div className="rounded-md border border-[#16202D] bg-[#0C131F] px-1.5 py-[2px] font-mono text-[10px] font-bold text-white">
          {String(Math.floor(candleSecsLeft / 60)).padStart(2, '0')}:{String(candleSecsLeft % 60).padStart(2, '0')}
        </div>

        {/* Sino de alerta — clicável para ativar alerta de preço */}
        <button
          onClick={() => setAlertSet(v => !v)}
          className={cn(
            'flex h-[20px] w-[20px] items-center justify-center rounded-md border transition-colors',
            alertSet
              ? 'bg-yellow-500 text-[#0A101A] border-yellow-400'
              : 'bg-[#0C131F] text-[#7E8DA2] border-[#16202D] hover:text-yellow-400 hover:border-yellow-500/50'
          )}
        >
          <Bell size={11} />
        </button>

        {/* Valor do preço — mesma cor da linha, cantos suaves, texto branco */}
        <span
          ref={priceValueRef}
          className="rounded-md bg-[#2E6BE6] px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-white shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
        >
          {fmt(currentPrice)}
        </span>
      </div>

      {/* Drawings panel / settings overlay */}
      {drawingsOpen && (() => {
        const selDraw = selectedDrawingId ? drawings.find(d => d.id === selectedDrawingId) : null
        if (selDraw) {
          return (
            <DrawingSettingsPanel
              drawingType={selDraw.type}
              color={selDraw.color}
              style={selDraw.style ?? 'dashed'}
              onColorChange={c => updateDrawingColor(selDraw.id, c)}
              onStyleChange={s => updateDrawingStyle(selDraw.id, s)}
              onDelete={() => { deleteDrawing(selDraw.id); setDrawingsOpen(false) }}
              onBack={() => setSelectedDrawingId(null)}
            />
          )
        }
        return (
          <DrawingsPanel
            onClose={() => setDrawingsOpen(false)}
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            onClearAll={() => { setDrawings([]); setDrawingPixels([]); setSelectedDrawingId(null) }}
          />
        )
      })()}

      {/* Indicators panel overlay */}
      {indicadoresOpen && !bbEditOpen && !maEditOpen && !macdEditOpen && !rsiEditOpen && !stochEditOpen && !alligatorEditOpen && !fractalEditOpen && (
        <IndicadoresPanel
          onClose={() => setIndicadoresOpen(false)}
          activeIds={activeIndicators}
          onToggle={toggleIndicator}
          onClearAll={clearAllIndicators}
        />
      )}

      {/* BB settings panel */}
      {bbEditOpen && (
        <BBSettingsPanel
          settings={bbSettings}
          onChange={setBBSettings}
          onBack={() => setBBEditOpen(false)}
          onDelete={() => { toggleIndicator('bollinger-bands'); setBBEditOpen(false) }}
        />
      )}

      {/* MA settings panel */}
      {maEditOpen && (
        <MASettingsPanel
          settings={maSettings}
          onChange={setMASettings}
          onBack={() => setMAEditOpen(false)}
          onDelete={() => { toggleIndicator('moving-average'); setMAEditOpen(false) }}
        />
      )}

      {/* MACD settings panel */}
      {macdEditOpen && (
        <MACDSettingsPanel
          settings={macdSettings}
          onChange={setMACDSettings}
          onBack={() => setMACDEditOpen(false)}
          onDelete={() => { toggleIndicator('macd'); setMACDEditOpen(false) }}
        />
      )}

      {/* RSI settings panel */}
      {rsiEditOpen && (
        <RSISettingsPanel
          settings={rsiSettings}
          onChange={setRSISettings}
          onBack={() => setRSIEditOpen(false)}
          onDelete={() => { toggleIndicator('rsi'); setRSIEditOpen(false) }}
        />
      )}

      {/* Stochastic settings panel */}
      {stochEditOpen && (
        <StochasticSettingsPanel
          settings={stochSettings}
          onChange={setStochSettings}
          onBack={() => setStochEditOpen(false)}
          onDelete={() => { toggleIndicator('stochastic'); setStochEditOpen(false) }}
        />
      )}

      {/* Alligator settings panel */}
      {alligatorEditOpen && (
        <AlligatorSettingsPanel
          settings={alligatorSettings}
          onChange={setAlligatorSettings}
          onBack={() => setAlligatorEditOpen(false)}
          onDelete={() => { toggleIndicator('alligator'); setAlligatorEditOpen(false) }}
        />
      )}

      {/* Fractal settings panel */}
      {fractalEditOpen && (
        <FractalSettingsPanel
          settings={fractalSettings}
          onChange={setFractalSettings}
          onBack={() => setFractalEditOpen(false)}
          onDelete={() => { toggleIndicator('fractal'); setFractalEditOpen(false) }}
        />
      )}

      {/* ── Trade overlays estilo Quotex ─────────────────────────────────────── */}
      {activeTrades.map(trade => {
        const pos = tradePositions[trade.id]
        if (!pos) return null
        const isCall  = trade.direction === 'CALL'
        const color   = isCall ? '#1FD196' : '#F0435A'
        const { entryX, expiryX, entryY } = pos
        const segW    = Math.max(0, expiryX - entryX)

        // Zona P&L: entre preço de entrada e preço atual
        const currentY   = candleTimerY ?? entryY
        const isWinning  = isCall
          ? currentPrice > trade.entryPrice
          : currentPrice < trade.entryPrice
        const zoneColor  = isWinning ? '#1FD196' : '#F0435A'
        const zoneTop    = Math.min(entryY, currentY)
        const zoneHeight = Math.abs(currentY - entryY)

        return (
          <React.Fragment key={trade.id}>
            {/* Linha vertical tracejada — Abertura da negociação */}
            <div className="absolute pointer-events-none z-[4]"
              style={{
                left: entryX,
                top: 0,
                bottom: 0,
                width: 1,
                backgroundImage: `repeating-linear-gradient(to bottom, ${color}90 0px, ${color}90 6px, transparent 6px, transparent 12px)`,
              }} />

            {/* Linha vertical tracejada — Fechamento da negociação */}
            <div className="absolute pointer-events-none z-[4]"
              style={{
                left: expiryX,
                top: 0,
                bottom: 0,
                width: 1,
                backgroundImage: `repeating-linear-gradient(to bottom, ${color}90 0px, ${color}90 6px, transparent 6px, transparent 12px)`,
              }} />

            {/* Zona de P&L — faixa entre entrada e preço atual */}
            {zoneHeight > 0 && (
              <div className="absolute pointer-events-none z-[3]"
                style={{
                  left: entryX,
                  top: zoneTop,
                  width: segW,
                  height: zoneHeight,
                  backgroundColor: zoneColor,
                  opacity: 0.10,
                }} />
            )}

            {/* Linha horizontal da entrada até o vencimento */}
            <div className="absolute pointer-events-none z-[5]"
              style={{ left: entryX, top: entryY, width: segW, height: 1, backgroundColor: color, opacity: 0.85 }} />

            {/* Círculo de entrada com seta de direção */}
            <div className="absolute pointer-events-none z-[7] rounded-full flex items-center justify-center"
              style={{ left: entryX - 9, top: entryY - 9, width: 18, height: 18, backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="white">
                {isCall
                  ? <polygon points="5,1 9,9 1,9" />
                  : <polygon points="5,9 9,1 1,1" />}
              </svg>
            </div>

            {/* Círculo de vencimento */}
            <div className="absolute pointer-events-none z-[7] rounded-full"
              style={{ left: expiryX - 6, top: entryY - 6, width: 12, height: 12, backgroundColor: color, border: '2px solid rgba(255,255,255,0.7)' }} />

            {/* Contador regressivo abaixo da linha de vencimento */}
            <TradeTimer expiryTime={trade.expiryTime} x={expiryX} y={entryY} color={color} />
          </React.Fragment>
        )
      })}

      {/* ── Drawing SVG overlay — interactive hit areas + visuals ─────────── */}
      {drawingPixels.length > 0 && (
        <svg
          className="absolute z-[6]"
          style={{ inset: 0, bottom: oscActive ? 130 : 0, overflow: 'visible', pointerEvents: activeTool ? 'none' : undefined }}
          width="100%" height="100%"
          onClick={() => { if (!draggingRef.current) setSelectedDrawingId(null) }}
        >
          {drawingPixels.map(dp => {
            const sel = dp.id === selectedDrawingId
            const dash = (() => {
              const orig = drawings.find(d => d.id === dp.id)
              return (orig?.style ?? 'dashed') === 'dashed' ? '5,4' : undefined
            })()
            const origDraw = drawings.find(d => d.id === dp.id)

            if (dp.type === 'hline') return (
              <g key={dp.id} style={{ pointerEvents: 'none' }}>
                {/* Hit area */}
                <line x1={0} y1={dp.y} x2="9999" y2={dp.y}
                  stroke="transparent" strokeWidth={14}
                  style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }}
                  onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                />
                {/* Visible line */}
                <line x1={0} y1={dp.y} x2="9999" y2={dp.y}
                  stroke={sel ? '#ffffff' : dp.color}
                  strokeWidth={sel ? 1.5 : 1}
                  strokeDasharray={dash}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Price label */}
                <rect x={4} y={dp.y - 8} width={62} height={14} fill="#0A101Add" rx={2} style={{ pointerEvents: 'none' }} />
                <text x={7} y={dp.y + 2} fill={sel ? '#ffffff' : dp.color} fontSize={9} fontFamily="monospace" style={{ pointerEvents: 'none' }}>
                  {dp.price.toFixed(5)}
                </text>
                {/* Selection circle handle */}
                {sel && <circle cx={200} cy={dp.y} r={5} fill={dp.color} stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />}
              </g>
            )

            if (dp.type === 'vline') return (
              <g key={dp.id} style={{ pointerEvents: 'none' }}>
                <line x1={dp.x} y1={0} x2={dp.x} y2="9999"
                  stroke="transparent" strokeWidth={14}
                  style={{ pointerEvents: 'stroke', cursor: 'ew-resize' }}
                  onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                />
                <line x1={dp.x} y1={0} x2={dp.x} y2="9999"
                  stroke={sel ? '#ffffff' : dp.color}
                  strokeWidth={sel ? 1.5 : 1}
                  strokeDasharray={dash}
                  style={{ pointerEvents: 'none' }}
                />
                {sel && <circle cx={dp.x} cy={80} r={5} fill={dp.color} stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />}
              </g>
            )

            if (dp.type === 'trendline') return (
              <g key={dp.id} style={{ pointerEvents: 'none' }}>
                {/* Body hit area */}
                <line x1={dp.x1} y1={dp.y1} x2={dp.x2} y2={dp.y2}
                  stroke="transparent" strokeWidth={14}
                  style={{ pointerEvents: 'stroke', cursor: 'move' }}
                  onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                />
                <line x1={dp.x1} y1={dp.y1} x2={dp.x2} y2={dp.y2}
                  stroke={sel ? '#ffffff' : dp.color}
                  strokeWidth={sel ? 2 : 1.5}
                  strokeDasharray={dash}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Endpoint handles */}
                <circle cx={dp.x1} cy={dp.y1} r={sel ? 6 : 4} fill={sel ? '#fff' : dp.color}
                  stroke={dp.color} strokeWidth={sel ? 2 : 0}
                  style={{ pointerEvents: sel ? 'all' : 'none', cursor: 'crosshair' }}
                  onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p1', e, origDraw)}
                />
                <circle cx={dp.x2} cy={dp.y2} r={sel ? 6 : 4} fill={sel ? '#fff' : dp.color}
                  stroke={dp.color} strokeWidth={sel ? 2 : 0}
                  style={{ pointerEvents: sel ? 'all' : 'none', cursor: 'crosshair' }}
                  onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p2', e, origDraw)}
                />
              </g>
            )

            if (dp.type === 'fib') {
              const xLeft  = Math.min(dp.x1, dp.x2)
              const xRight = Math.max(dp.x1, dp.x2)
              return (
                <g key={dp.id} style={{ pointerEvents: 'none' }}>
                  {/* Diagonal guide */}
                  <line x1={dp.x1} y1={dp.y1} x2={dp.x2} y2={dp.y2}
                    stroke={dp.color} strokeWidth={1} strokeDasharray="3,3" opacity={0.35}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Fib levels */}
                  {dp.levels.map((lv, i) => (
                    <g key={lv.ratio} style={{ pointerEvents: 'none' }}>
                      <line x1={xLeft} y1={lv.y} x2={xRight} y2={lv.y}
                        stroke="transparent" strokeWidth={12}
                        style={{ pointerEvents: 'stroke', cursor: 'move' }}
                        onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                      />
                      <line x1={xLeft} y1={lv.y} x2={xRight} y2={lv.y}
                        stroke={sel ? '#ffffff' : FIB_COLORS[i % FIB_COLORS.length]}
                        strokeWidth={1}
                        style={{ pointerEvents: 'none' }}
                      />
                      <rect x={xRight + 4} y={lv.y - 7} width={48} height={12} fill="#0A101Add" rx={2} style={{ pointerEvents: 'none' }} />
                      <text x={xRight + 7} y={lv.y + 2}
                        fill={sel ? '#ffffff' : FIB_COLORS[i % FIB_COLORS.length]}
                        fontSize={9} fontFamily="monospace"
                        style={{ pointerEvents: 'none' }}
                      >
                        {(lv.ratio * 100).toFixed(1)}%
                      </text>
                    </g>
                  ))}
                  {/* Endpoint handles when selected */}
                  {sel && <>
                    <circle cx={dp.x1} cy={dp.y1} r={6} fill="#fff" stroke={dp.color} strokeWidth={2}
                      style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                      onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p1', e, origDraw)}
                    />
                    <circle cx={dp.x2} cy={dp.y2} r={6} fill="#fff" stroke={dp.color} strokeWidth={2}
                      style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                      onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p2', e, origDraw)}
                    />
                  </>}
                </g>
              )
            }

            if (dp.type === 'rect') {
              const rx = Math.min(dp.x1, dp.x2), ry = Math.min(dp.y1, dp.y2)
              const rw = Math.abs(dp.x2 - dp.x1), rh = Math.abs(dp.y2 - dp.y1)
              return (
                <g key={dp.id} style={{ pointerEvents: 'none' }}>
                  {/* Preenchimento translúcido (não captura mouse — chart continua clicável) */}
                  <rect x={rx} y={ry} width={rw} height={rh} fill={dp.color} opacity={0.12} style={{ pointerEvents: 'none' }} />
                  {/* Hit area só na borda */}
                  <rect x={rx} y={ry} width={rw} height={rh} fill="none"
                    stroke="transparent" strokeWidth={14}
                    style={{ pointerEvents: 'stroke', cursor: 'move' }}
                    onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                  />
                  <rect x={rx} y={ry} width={rw} height={rh} fill="none"
                    stroke={sel ? '#ffffff' : dp.color}
                    strokeWidth={sel ? 2 : 1.5}
                    strokeDasharray={dash}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Cantos opostos = alças p1/p2 */}
                  <circle cx={dp.x1} cy={dp.y1} r={sel ? 6 : 4} fill={sel ? '#fff' : dp.color}
                    stroke={dp.color} strokeWidth={sel ? 2 : 0}
                    style={{ pointerEvents: sel ? 'all' : 'none', cursor: 'nwse-resize' }}
                    onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p1', e, origDraw)}
                  />
                  <circle cx={dp.x2} cy={dp.y2} r={sel ? 6 : 4} fill={sel ? '#fff' : dp.color}
                    stroke={dp.color} strokeWidth={sel ? 2 : 0}
                    style={{ pointerEvents: sel ? 'all' : 'none', cursor: 'nwse-resize' }}
                    onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p2', e, origDraw)}
                  />
                </g>
              )
            }

            if (dp.type === 'extline') {
              // Estende a reta p1→p2 pros dois lados até bem além da viewport
              const ddx = dp.x2 - dp.x1, ddy = dp.y2 - dp.y1
              const len = Math.hypot(ddx, ddy) || 1
              const ux = ddx / len, uy = ddy / len
              const ex1 = dp.x1 - ux * 5000, ey1 = dp.y1 - uy * 5000
              const ex2 = dp.x1 + ux * 5000, ey2 = dp.y1 + uy * 5000
              return (
                <g key={dp.id} style={{ pointerEvents: 'none' }}>
                  <line x1={ex1} y1={ey1} x2={ex2} y2={ey2}
                    stroke="transparent" strokeWidth={14}
                    style={{ pointerEvents: 'stroke', cursor: 'move' }}
                    onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                  />
                  <line x1={ex1} y1={ey1} x2={ex2} y2={ey2}
                    stroke={sel ? '#ffffff' : dp.color}
                    strokeWidth={sel ? 2 : 1.5}
                    strokeDasharray={dash}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Pontos de ancoragem (definem a inclinação) */}
                  <circle cx={dp.x1} cy={dp.y1} r={sel ? 6 : 4} fill={sel ? '#fff' : dp.color}
                    stroke={dp.color} strokeWidth={sel ? 2 : 0}
                    style={{ pointerEvents: sel ? 'all' : 'none', cursor: 'crosshair' }}
                    onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p1', e, origDraw)}
                  />
                  <circle cx={dp.x2} cy={dp.y2} r={sel ? 6 : 4} fill={sel ? '#fff' : dp.color}
                    stroke={dp.color} strokeWidth={sel ? 2 : 0}
                    style={{ pointerEvents: sel ? 'all' : 'none', cursor: 'crosshair' }}
                    onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p2', e, origDraw)}
                  />
                </g>
              )
            }

            if (dp.type === 'channel') {
              const y1b = dp.y1 + dp.yOff, y2b = dp.y2 + dp.yOff
              const midX = (dp.x1 + dp.x2) / 2
              const midYb = (y1b + y2b) / 2
              return (
                <g key={dp.id} style={{ pointerEvents: 'none' }}>
                  {/* Faixa translúcida entre as duas linhas */}
                  <polygon
                    points={`${dp.x1},${dp.y1} ${dp.x2},${dp.y2} ${dp.x2},${y2b} ${dp.x1},${y1b}`}
                    fill={dp.color} opacity={0.10} style={{ pointerEvents: 'none' }}
                  />
                  {/* Linha base (arrasta o canal todo) */}
                  <line x1={dp.x1} y1={dp.y1} x2={dp.x2} y2={dp.y2}
                    stroke="transparent" strokeWidth={14}
                    style={{ pointerEvents: 'stroke', cursor: 'move' }}
                    onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'body', e, origDraw)}
                  />
                  <line x1={dp.x1} y1={dp.y1} x2={dp.x2} y2={dp.y2}
                    stroke={sel ? '#ffffff' : dp.color}
                    strokeWidth={sel ? 2 : 1.5}
                    strokeDasharray={dash}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Linha paralela (arrasta só a largura do canal) */}
                  <line x1={dp.x1} y1={y1b} x2={dp.x2} y2={y2b}
                    stroke="transparent" strokeWidth={14}
                    style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }}
                    onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'offset', e, origDraw)}
                  />
                  <line x1={dp.x1} y1={y1b} x2={dp.x2} y2={y2b}
                    stroke={sel ? '#ffffff' : dp.color}
                    strokeWidth={sel ? 2 : 1.5}
                    strokeDasharray={dash}
                    style={{ pointerEvents: 'none' }}
                  />
                  <circle cx={dp.x1} cy={dp.y1} r={sel ? 6 : 4} fill={sel ? '#fff' : dp.color}
                    stroke={dp.color} strokeWidth={sel ? 2 : 0}
                    style={{ pointerEvents: sel ? 'all' : 'none', cursor: 'crosshair' }}
                    onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p1', e, origDraw)}
                  />
                  <circle cx={dp.x2} cy={dp.y2} r={sel ? 6 : 4} fill={sel ? '#fff' : dp.color}
                    stroke={dp.color} strokeWidth={sel ? 2 : 0}
                    style={{ pointerEvents: sel ? 'all' : 'none', cursor: 'crosshair' }}
                    onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'p2', e, origDraw)}
                  />
                  {/* Alça central da paralela quando selecionado */}
                  {sel && (
                    <circle cx={midX} cy={midYb} r={6} fill="#fff" stroke={dp.color} strokeWidth={2}
                      style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                      onMouseDown={e => origDraw && startDrawingDrag(dp.id, 'offset', e, origDraw)}
                    />
                  )}
                </g>
              )
            }
            return null
          })}
        </svg>
      )}

      {/* ── Inline toolbar for selected drawing ────────────────────────────── */}
      {selectedDrawingId && (() => {
        const dp = drawingPixels.find(p => p.id === selectedDrawingId)
        const draw = drawings.find(d => d.id === selectedDrawingId)
        if (!dp || !draw) return null
        const toolbarY = dp.type === 'hline' ? dp.y
          : dp.type === 'vline' ? 40
          : 'x1' in dp ? Math.min(dp.y1, dp.y2) - 8
          : 40
        const toolbarX = dp.type === 'vline' ? dp.x + 10
          : 'x1' in dp ? Math.min(dp.x1, dp.x2) + 10
          : 10
        const label = { hline: 'LINHA HORIZ.', vline: 'LINHA VERT.', trendline: 'TENDÊNCIA', fib: 'FIBONACCI', rect: 'RETÂNGULO', extline: 'LINHA EST.', channel: 'CANAL' }[dp.type] ?? dp.type.toUpperCase()
        return (
          <div
            className="absolute z-[8] flex items-center gap-1 px-2 py-1 rounded"
            style={{
              left: toolbarX, top: toolbarY - 26,
              background: '#0E1620',
              border: '1px solid #16202D',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              pointerEvents: 'auto',
              userSelect: 'none',
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: draw.color }} />
            <span className="text-[10px] font-bold text-white tracking-wide">{label}</span>
            <div className="w-px h-3 bg-[#16202D] mx-0.5" />
            <button
              onClick={() => { setDrawingsOpen(true); setSelectedDrawingId(selectedDrawingId) }}
              className="w-5 h-5 flex items-center justify-center text-[#7E8DA2] hover:text-white transition-colors text-[10px]"
              title="Configurações"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              onClick={() => deleteDrawing(selectedDrawingId)}
              className="w-5 h-5 flex items-center justify-center text-[#7E8DA2] hover:text-red-400 transition-colors"
              title="Remover"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )
      })()}

      {/* ── Live preview while drawing ──────────────────────────────────────── */}
      {activeTool && mousePx && (
        <svg
          className="absolute pointer-events-none z-[6]"
          style={{ inset: 0, bottom: oscActive ? 130 : 0, overflow: 'visible' }}
          width="100%" height="100%"
        >
          {activeTool === 'Linha horizontal' && (
            <line x1={0} y1={mousePx.y} x2="9999" y2={mousePx.y} stroke="#ffffff" strokeWidth={1} strokeDasharray="4,4" opacity={0.45} />
          )}
          {activeTool === 'Linha vertical' && (
            <line x1={mousePx.x} y1={0} x2={mousePx.x} y2="9999" stroke="#ffffff" strokeWidth={1} strokeDasharray="4,4" opacity={0.45} />
          )}
          {TWO_POINT_TOOLS.has(activeTool) && pendingPoint && chartRef.current && seriesRef.current && (() => {
            const px1 = chartRef.current.timeScale().timeToCoordinate(pendingPoint.time) ?? mousePx.x
            const py1 = seriesRef.current.priceToCoordinate(pendingPoint.price) ?? mousePx.y
            if (activeTool === 'Retângulo') {
              const rx = Math.min(px1, mousePx.x), ry = Math.min(py1, mousePx.y)
              return (
                <>
                  <rect x={rx} y={ry} width={Math.abs(mousePx.x - px1)} height={Math.abs(mousePx.y - py1)}
                    fill="#ffffff" opacity={0.08} />
                  <rect x={rx} y={ry} width={Math.abs(mousePx.x - px1)} height={Math.abs(mousePx.y - py1)}
                    fill="none" stroke="#ffffff" strokeWidth={1} strokeDasharray="4,4" opacity={0.45} />
                  <circle cx={px1} cy={py1} r={4} fill="#ffffff" opacity={0.6} />
                </>
              )
            }
            return (
              <>
                <line x1={px1} y1={py1} x2={mousePx.x} y2={mousePx.y} stroke="#ffffff" strokeWidth={1} strokeDasharray="4,4" opacity={0.45} />
                <circle cx={px1} cy={py1} r={4} fill="#ffffff" opacity={0.6} />
              </>
            )
          })()}
        </svg>
      )}

      {/* ── Mouse capture layer (active only when a tool is selected) ────────── */}
      {activeTool && (
        <div
          className="absolute z-[15]"
          style={{ top: 0, left: 0, right: 0, bottom: oscActive ? 130 : 0, cursor: 'crosshair' }}
          onClick={(e) => {
            if (!chartRef.current || !seriesRef.current) return
            const rect = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            const ts = chartRef.current.timeScale()
            const time = ts.coordinateToTime(x) as number | null
            const price = seriesRef.current.coordinateToPrice(y) as number | null
            if (time == null || price == null) return
            const tool = activeToolRef.current!
            if (!TWO_POINT_TOOLS.has(tool)) {
              const color = nextDrawColor()
              const id = `d${Date.now()}`
              setDrawings(prev => [...prev, tool === 'Linha horizontal'
                ? { id, type: 'hline', price, color }
                : { id, type: 'vline', time, color }
              ])
              setActiveTool(null)
            } else {
              const pp = pendingPointRef.current
              if (!pp) {
                setPendingPoint({ price, time })
              } else {
                const color = nextDrawColor()
                const id = `d${Date.now()}`
                const p2 = { price, time }
                let nova: Drawing
                if (tool === 'Linha de trend')        nova = { id, type: 'trendline', p1: pp, p2, color }
                else if (tool === 'Retração de Fibonacci') nova = { id, type: 'fib', p1: pp, p2, color }
                else if (tool === 'Retângulo')        nova = { id, type: 'rect', p1: pp, p2, color }
                else if (tool === 'Linha Estendida')  nova = { id, type: 'extline', p1: pp, p2, color }
                else {
                  // Canal paralelo: largura inicial = 60px convertidos pra preço
                  const pBase = seriesRef.current.coordinateToPrice(y) as number | null
                  const pDown = seriesRef.current.coordinateToPrice(y + 60) as number | null
                  const offset = pBase != null && pDown != null ? pDown - pBase : 0
                  nova = { id, type: 'channel', p1: pp, p2, offset, color }
                }
                setDrawings(prev => [...prev, nova])
                setPendingPoint(null)
                setActiveTool(null)
              }
            }
          }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            setMousePx({ x: e.clientX - rect.left, y: e.clientY - rect.top })
          }}
          onMouseLeave={() => setMousePx(null)}
        />
      )}

      {/* Chart — absolute so oscillator panel doesn't depend on flex shrink.
          touch-action:none cede 100% dos gestos pro lightweight-charts (pan + pinch). */}
      <div
        ref={chartContainerRef}
        className="absolute inset-0"
        style={{ bottom: oscActive ? 130 : 0, touchAction: 'none' }}
      />

      {/* Pré-visualização da direção — fade suave a partir da linha de preço */}
      {hoverDir && candleTimerY != null && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-[2] transition-opacity duration-200"
          style={
            hoverDir === 'CALL'
              ? {
                  top: 0,
                  height: Math.max(0, candleTimerY),
                  background: 'linear-gradient(to top, rgba(31,209,150,0.14), rgba(31,209,150,0.01))',
                }
              : {
                  top: candleTimerY,
                  bottom: oscActive ? 130 : 0,
                  background: 'linear-gradient(to bottom, rgba(240,67,90,0.14), rgba(240,67,90,0.01))',
                }
          }
        />
      )}

      {/* Pré-loader do bloco do gráfico — fundo do design system + marca animada */}
      {isLoading && (
        <div
          data-testid="chart-loader"
          className="absolute inset-0 z-[30] flex items-center justify-center bg-[#0E1620]"
          style={{ bottom: oscActive ? 130 : 0 }}
        >
          <ChartLoader />
        </div>
      )}

      {/* Oscillator sub-panel — absolute at the bottom */}
      {oscActive && (
        <div className="absolute bottom-0 left-0 right-0 border-t border-[#16202D]" style={{ height: 130 }}>
          <div className="absolute top-1.5 left-3 z-10 pointer-events-none">
            <span className="text-[10px] font-bold text-[#7E8DA2] tracking-wide">
              {activeOsc === 'rsi'
                ? `RSI (${rsiSettings.period}) ${rsiSettings.overbought} ${rsiSettings.oversold}`
                : activeOsc === 'stochastic'
                  ? `STOCHASTIC (${stochSettings.kPeriod}, ${stochSettings.smooth}, ${stochSettings.dPeriod})`
                  : `MACD (${macdSettings.fastPeriod}, ${macdSettings.slowPeriod}, ${macdSettings.signalPeriod})`}
            </span>
          </div>
          <div ref={oscChartContainerRef} className="w-full h-full" />
        </div>
      )}

      {/* Bottom left toolbar — vertical column.
          Em mobile, colapsa em um único botão "+"; expande sob demanda. */}
      <div className="absolute right-[92px] top-3 flex flex-row items-center gap-2 z-10">
        {/* Botão "Mais ferramentas" — só aparece em mobile */}
        {isMobile && (
          <button
            onClick={() => setMobileToolsOpen(v => !v)}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded border transition-colors',
              mobileToolsOpen ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#0C131F] border-[#16202D] text-[#7E8DA2]'
            )}
            aria-label={mobileToolsOpen ? 'Esconder ferramentas' : 'Mostrar ferramentas'}
          >
            {mobileToolsOpen ? <X size={12} /> : <MoreHorizontal size={12} />}
          </button>
        )}

        {/* Pencil / Drawings — oculto em mobile colapsado */}
        {(!isMobile || mobileToolsOpen) && (
        <button
          onClick={() => setDrawingsOpen(v => !v)}
          className={cn(
            'flex h-[36px] w-[36px] items-center justify-center rounded-lg border transition-colors duration-200',
            drawingsOpen ? 'border-[#2E6BE6] bg-[#101D31] text-white' : 'border-[#1A2432] bg-[#0C1320] text-[#7A8AA0] hover:border-[#26374A] hover:text-white'
          )}
        >
          <Pencil size={15} />
        </button>
        )}

        {/* Timeframe selector */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setTfOpen(v => !v); setChartTypeOpen(false) }}
            className="flex h-[36px] items-center gap-6 rounded-lg border border-[#1A2432] bg-[#0C1320] px-3 text-[12.5px] font-semibold text-[#E4EBF5] transition-colors duration-200 hover:border-[#26374A]"
          >
            {selectedTf.label} <ChevronDown size={14} className="text-[#7A8AA0]" />
          </button>
          {tfOpen && (
            <div
              className="absolute top-full mt-1 right-0 bg-[#0C131F] border border-[#16202D] rounded-lg overflow-hidden shadow-xl z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-2 gap-px p-1 w-[100px]">
                {TIMEFRAMES.map((tf, i) => (
                  <button
                    key={tf.label}
                    onClick={() => { setTfIndex(i); setTfOpen(false) }}
                    className={cn('px-2 py-1.5 text-xs font-bold rounded transition-colors', i === tfIndex ? 'bg-blue-600 text-white' : 'text-[#7E8DA2] hover:text-white hover:bg-white/5')}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart type selector — oculto em mobile colapsado */}
        {(!isMobile || mobileToolsOpen) && (
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setChartTypeOpen(v => !v); setTfOpen(false) }}
            className={cn(
              'flex h-[36px] items-center gap-3 rounded-lg border px-3 transition-colors duration-200',
              chartTypeOpen ? 'border-[#2E6BE6] bg-[#101D31] text-white' : 'border-[#1A2432] bg-[#0C1320] text-[#7A8AA0] hover:border-[#26374A] hover:text-white'
            )}
          >
            {selectedChartType.icon} <ChevronDown size={14} />
          </button>
          {chartTypeOpen && (
            <div
              className="absolute top-full mt-1 right-0 bg-[#0C131F] border border-[#16202D] rounded-lg overflow-hidden shadow-xl z-50 w-[140px]"
              onClick={(e) => e.stopPropagation()}
            >
              {CHART_TYPES.map((ct) => (
                <button
                  key={ct.key}
                  onClick={() => { setChartType(ct.key); setChartTypeOpen(false) }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                    ct.key === chartType ? 'bg-blue-600/30 text-white' : 'text-[#7E8DA2] hover:bg-white/5 hover:text-white'
                  )}
                >
                  <span className={ct.key === chartType ? 'text-white' : 'text-[#7E8DA2]'}>{ct.icon}</span>
                  <span className="font-medium">{ct.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Indicators toggle — oculto em mobile colapsado */}
        {(!isMobile || mobileToolsOpen) && (
        <button
          onClick={() => { setIndicadoresOpen(v => !v); setDrawingsOpen(false) }}
          className={cn(
            'flex h-[36px] w-[36px] items-center justify-center rounded-lg border transition-colors duration-200',
            indicadoresOpen ? 'border-[#2E6BE6] bg-[#101D31] text-white' : 'border-[#1A2432] bg-[#0C1320] text-[#7A8AA0] hover:border-[#26374A] hover:text-white'
          )}
        >
          <Activity size={15} />
        </button>
        )}

        {/* Crosshair — oculto em mobile colapsado */}
        {(!isMobile || mobileToolsOpen) && (
        <button
          onClick={() => {
            const el = chartContainerRef.current?.parentElement
            if (!el) return
            if (document.fullscreenElement) document.exitFullscreen()
            else el.requestFullscreen?.()
          }}
          title="Tela cheia"
          className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-[#1A2432] bg-[#0C1320] text-[#7A8AA0] transition-colors duration-200 hover:border-[#26374A] hover:text-white"
        >
          <Maximize size={15} />
        </button>
        )}

      </div>

      {/* Controles de zoom / navegação — centralizados no rodapé do gráfico */}
      <div
        className="absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-2"
        style={{ bottom: oscActive ? 142 : 40 }}
      >
        <NavBtn title="Diminuir zoom" onClick={() => zoomBy(0.8)}><Minus size={14} /></NavBtn>
        <NavBtn title="Aumentar zoom" onClick={() => zoomBy(1.25)}><Plus size={14} /></NavBtn>
        <NavBtn title="Voltar" onClick={() => scrollBy(-5)}><ChevronLeft size={14} /></NavBtn>
        <NavBtn title="Avançar" onClick={() => scrollBy(5)}><ChevronRight size={14} /></NavBtn>
        <NavBtn title="Redefinir" onClick={() => chartRef.current?.timeScale().scrollToRealTime()}><RotateCcw size={13} /></NavBtn>
      </div>
    </section>

      {/* Estatísticas da vela + notícias — replica do layout novo */}
      {!isMobile && (
        <div className="flex shrink-0 items-stretch gap-3">
          <section className="flex flex-1 items-center gap-[52px] rounded-xl border border-[#141C28] bg-[#0A101A] px-6 py-[15px]">
            <StatCol label="Aberto"     value={ohlcNow ? fmt(ohlcNow.open) : '—'} />
            <StatCol label="Máximo"     value={ohlcNow ? fmt(ohlcNow.high) : '—'} />
            <StatCol label="Mínimo"     value={ohlcNow ? fmt(ohlcNow.low) : '—'} />
            <StatCol label="Fechamento" value={ohlcNow ? fmt(ohlcNow.close) : '—'} />
            <StatCol
              label={`Variação (${selectedTf.label})`}
              value={ohlcNow && ohlcNow.open ? `${((ohlcNow.close - ohlcNow.open) / ohlcNow.open * 100).toFixed(2)}%` : '—'}
              valueClass={ohlcNow ? (ohlcNow.close >= ohlcNow.open ? 'text-[#1FD196]' : 'text-[#F0435A]') : 'text-white'}
            />
          </section>

          {/* Antes havia aqui um card "Notícias importantes" fixo, que sempre
              dizia "Nenhum evento de alto impacto agora" — não existia fonte de
              notícia por trás. Virou o carrossel de banners, alimentado pelo
              admin. Sem banner cadastrado ele não renderiza nada. */}
          <PromoBanners />
        </div>
      )}
    </div>
  )
}

function NavBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={e => { e.stopPropagation(); onClick() }}
      className="flex h-[30px] w-[34px] items-center justify-center rounded-md border border-[#1A2432] bg-[#0C1320]/90 text-[#7A8AA0] backdrop-blur transition-colors duration-200 hover:border-[#26374A] hover:text-white"
    >
      {children}
    </button>
  )
}

function StatCol({ label, value, valueClass = 'text-white' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-[9px] leading-none">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#67768B]">{label}</span>
      <span className={`text-[15px] font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  )
}
