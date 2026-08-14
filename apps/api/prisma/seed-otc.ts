import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Catalogo OTC definitivo Vertex Markets MVP — 14 pares server-authoritative.
// Mapping front correspondente em apps/web/src/lib/otcClient.ts (OTC_SYMBOL_MAP).
//
// Cripto aqui e OTC SINTETICO (motor da casa, estilo "Bitcoin OTC" da Quotex),
// NAO cripto LIVE/real. O feed real Binance (BTC/ETH/SOL/XRP/BNB) mora em
// marketSymbols.ts e e coisa separada — estes -OTC rodam 24/7 no motor proprio.
//
// O que NAO entra aqui (e por que):
// - Cripto LIVE/real: feed Binance via marketSymbols.ts (nao e server-authoritative)
// - Forex majors (EUR/USD, GBP/USD, USD/JPY): feed real Yahoo (versão LIVE)
//   PORÉM duplicamos como -OTC aqui para operar 24/7 quando mercado real fecha
//
// Pra promover novo par a OTC server-authoritative:
//   1) add aqui em SEEDS; 2) add asset em mockData.ts ASSETS; 3) add mapping em
//   OTC_SYMBOL_MAP; 4) garante que asset.id NAO esta em REAL_ASSETS (sem conflito).
// Volatility calibrada para o engine: mean-reversion hardcoded = 0.001/tick em rng.ts,
// resulta em range estacionario 3σ ≈ volatility * 67 * 100 (em %). Valores escolhidos
// para imitar comportamento Quotex-style (forex calmo, commodities mais agressivas).
const SEEDS = [
  // Forex OTC — espelham os majors reais para cobrir fim de semana
  { symbol: 'EURUSD-OTC', name: 'EUR/USD OTC', basePrice: 1.08540,    volatility: 0.00015, payout: 85, decimals: 5 },
  { symbol: 'GBPUSD-OTC', name: 'GBP/USD OTC', basePrice: 1.27340,    volatility: 0.00015, payout: 85, decimals: 5 },
  { symbol: 'USDJPY-OTC', name: 'USD/JPY OTC', basePrice: 158.92000,  volatility: 0.00018, payout: 85, decimals: 3 },
  // Forex OTC exclusivos (sem versao real)
  { symbol: 'USDBRL-OTC', name: 'USD/BRL OTC', basePrice: 5.20000,    volatility: 0.00025, payout: 85, decimals: 5 },
  { symbol: 'EURJPY-OTC', name: 'EUR/JPY OTC', basePrice: 170.54000,  volatility: 0.00018, payout: 87, decimals: 3 },
  { symbol: 'AUDCAD-OTC', name: 'AUD/CAD OTC', basePrice: 0.91800,    volatility: 0.00015, payout: 87, decimals: 5 },
  { symbol: 'NZDUSD-OTC', name: 'NZD/USD OTC', basePrice: 0.59500,    volatility: 0.00015, payout: 87, decimals: 5 },
  { symbol: 'USDCHF-OTC', name: 'USD/CHF OTC', basePrice: 0.89710,    volatility: 0.00015, payout: 85, decimals: 5 },
  // Commodities OTC
  { symbol: 'XAUUSD-OTC', name: 'Ouro OTC',    basePrice: 2680.50000, volatility: 0.00040, payout: 87, decimals: 2 },
  { symbol: 'XAGUSD-OTC', name: 'Prata OTC',   basePrice: 31.40000,   volatility: 0.00055, payout: 85, decimals: 3 },
  // Cripto OTC sintetico — motor da casa 24/7 (NAO e cripto LIVE/Binance)
  { symbol: 'BTCUSD-OTC', name: 'BTC/USD OTC', basePrice: 65000.00000, volatility: 0.00150, payout: 85, decimals: 2 },
  { symbol: 'ETHUSD-OTC', name: 'ETH/USD OTC', basePrice: 1815.00000,  volatility: 0.00150, payout: 85, decimals: 2 },
  { symbol: 'SOLUSD-OTC', name: 'SOL/USD OTC', basePrice: 73.00000,    volatility: 0.00150, payout: 85, decimals: 3 },
  { symbol: 'XRPUSD-OTC', name: 'XRP/USD OTC', basePrice: 1.24000,     volatility: 0.00150, payout: 85, decimals: 5 },
]

// Symbols que ja existiram em seeds anteriores mas nao fazem mais parte do catalogo.
// Sao marcados INACTIVE para o engine parar de gastar CPU. Historico fica preservado.
const DEPRECATED = [
  'DOGEUSD-OTC', 'EURAUD-OTC', 'AAPL-OTC', 'TSLA-OTC',
]

async function main() {
  console.log(`Seeding ${SEEDS.length} OTC assets...`)
  for (const s of SEEDS) {
    await prisma.otcAsset.upsert({
      where: { symbol: s.symbol },
      create: { ...s, trend: 0, status: 'ACTIVE' },
      update: {
        name: s.name, basePrice: s.basePrice, volatility: s.volatility,
        payout: s.payout, decimals: s.decimals, status: 'ACTIVE',
      },
    })
    console.log(`  ok ${s.symbol}`)
  }

  console.log(`Deactivating ${DEPRECATED.length} dormant assets...`)
  for (const symbol of DEPRECATED) {
    const existing = await prisma.otcAsset.findUnique({ where: { symbol } })
    if (existing && existing.status === 'ACTIVE') {
      await prisma.otcAsset.update({ where: { symbol }, data: { status: 'INACTIVE' } })
      console.log(`  -> ${symbol} INACTIVE`)
    }
  }

  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
