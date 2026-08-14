import { prisma } from '../prisma.js'

// Registro dos ativos LIVE (forex/cripto com feed real) a partir da tabela
// market_assets — a MESMA fonte autoritativa de payout/enabled que o place_trade
// usa no Supabase. market_assets nao esta no schema Prisma (foi criada via SQL,
// ver sql/2026-06-14-market-assets.sql), entao o acesso e por $queryRaw.
//
// Cache com refresh lazy de 30s, mesmo padrao de serverAuthSymbols em
// operations/service.ts: admin liga/desliga ativo sem precisar de deploy.

export interface LiveAsset {
  id:       string   // 'btc', 'eur-usd' — chave de live_prices e operations.asset_id
  symbol:   string   // 'BTC/USD', 'EUR/USD'
  category: string   // 'crypto' | 'forex'
  payout:   number
  enabled:  boolean
}

// Feature flag do 1-clique LIVE: gate unico do endpoint de integracao E da
// liquidacao server-side. Desligada (default) = comportamento original.
// Lida a cada chamada: da pra ligar/desligar so trocando a env + restart da API,
// sem redeploy do app parceiro.
export function liveAssetsEnabled(): boolean {
  return process.env.INTEGRATIONS_LIVE_ASSETS_ENABLED === 'true'
}

let liveAssetsById = new Map<string, LiveAsset>()
let lastRefreshAt = 0
const REFRESH_INTERVAL_MS = 30_000

async function refreshLiveAssets() {
  try {
    const rows = await prisma.$queryRaw<Array<{
      id: string; symbol: string; category: string; payout: number; enabled: boolean
    }>>`SELECT id, symbol, category, payout::int AS payout, enabled FROM market_assets`
    liveAssetsById = new Map(rows.map(r => [r.id, {
      id: r.id, symbol: r.symbol, category: r.category,
      payout: Number(r.payout), enabled: r.enabled,
    }]))
    lastRefreshAt = Date.now()
  } catch (err: any) {
    console.error('[live-assets] refresh failed:', err?.message ?? err)
  }
}

export async function ensureFreshLiveAssets() {
  if (Date.now() - lastRefreshAt > REFRESH_INTERVAL_MS) await refreshLiveAssets()
}

// Classificacao por IDENTIDADE (asset_id), nunca por simbolo: 'EUR/USD' canoniza
// pra 'EURUSD-OTC' no matcher OTC e colidiria com o feed sintetico (bug real).
// Tambem nunca inferir por existencia de linha em live_prices — o publisher
// grava OTC la tambem.
export function isLiveAssetId(assetId: string): boolean {
  return liveAssetsById.has(assetId)
}

export function getLiveAsset(assetId: string): LiveAsset | undefined {
  return liveAssetsById.get(assetId)
}

// Resolve o simbolo enviado pelo parceiro para um ativo live. Aceita id
// ('btc', 'eur-usd'), simbolo de exibicao ('BTC/USD', 'EUR/USD'), formas sem
// separador ('BTCUSD', 'EURUSD') e ticker Binance ('BTCUSDT'). Ambiguidade
// (0 ou >1 ids distintos) resolve como "nao encontrado" — nunca adivinhar.
export function resolveLiveAssetBySymbol(rawSymbol: string): LiveAsset | null {
  const lower = rawSymbol.trim().toLowerCase()
  const byId = liveAssetsById.get(lower)
  if (byId) return byId

  const canon = (s: string) =>
    s.toUpperCase().replace(/[\/\-_\s]/g, '').replace(/USDT$/, 'USD')

  const target  = canon(rawSymbol)
  const matches = [...liveAssetsById.values()]
    .filter(a => canon(a.id) === target || canon(a.symbol) === target)
  const distinct = new Set(matches.map(a => a.id))

  if (distinct.size !== 1) {
    if (distinct.size > 1) {
      console.warn(`[live-assets] simbolo ambiguo '${rawSymbol}':`, [...distinct].join(', '))
    }
    return null
  }
  return matches[0]
}

// Frescor maximo do preco em live_prices, para entrada E saida. Bem mais
// estrito que o place_trade (300s/120s): aqui uma ordem/liquidacao 1-clique
// nao deve nunca usar preco parado — melhor recusar/cair no DRAW.
const LIVE_PRICE_MAX_AGE_MS = Number(process.env.LIVE_PRICE_MAX_AGE_MS ?? '15000')

// Le o preco live com idade calculada NO SQL (extract epoch), evitando skew de
// relogio entre app e banco — mesmo padrao do place_trade. Preco ausente ou
// mais velho que o limite retorna null (chamador decide: rejeitar ou pular).
export async function readLivePrice(assetId: string): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ price: number; age_s: number }>>`
      SELECT price::float8 AS price,
             extract(epoch FROM (now() - updated_at))::float8 AS age_s
      FROM live_prices
      WHERE asset_id = ${assetId}
    `
    if (rows.length === 0) return null
    const { price, age_s } = rows[0]
    if (!Number.isFinite(price) || price <= 0) return null
    if (age_s * 1000 > LIVE_PRICE_MAX_AGE_MS) return null
    return price
  } catch (err: any) {
    console.error('[live-assets] readLivePrice failed:', assetId, err?.message ?? err)
    return null
  }
}
