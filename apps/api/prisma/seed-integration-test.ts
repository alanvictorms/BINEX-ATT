/**
 * Seed de TESTE da integracao PulseHacker (stack local isolada).
 * Cria: 1 Profile + 1 conta DEMO + 1 ativo OTC ACTIVE + tabelas/seed dos ativos
 * LIVE (market_assets + live_prices, que em producao existem so via SQL no
 * Supabase — fora do schema Prisma).
 * Idempotente (upsert / IF NOT EXISTS / ON CONFLICT) — pode rodar varias vezes.
 *
 *   DOTENV_CONFIG_PATH=.env.test.local npx tsx prisma/seed-integration-test.ts
 */
import 'dotenv/config'
import { prisma } from '../src/prisma.js'

const TEST_USER_ID = process.env.TEST_USER_ID || '11111111-1111-1111-1111-111111111111'
const SYMBOL       = process.env.SEED_SYMBOL  || 'ETHUSD-OTC'

// Espelho local de sql/2026-06-14-market-assets.sql (tabela + seed) e da
// live_prices que o livePricePublisher alimenta. Sem RLS/grants aqui: o teste
// local nao tem os roles anon/authenticated do Supabase.
async function ensureLiveTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS live_prices (
      asset_id   text PRIMARY KEY,
      symbol     text NOT NULL,
      price      double precision NOT NULL,
      source     text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS market_assets (
      id            text PRIMARY KEY,
      symbol        text NOT NULL,
      name          text NOT NULL,
      category      text NOT NULL,
      source        text NOT NULL,
      payout        int  NOT NULL DEFAULT 90 CHECK (payout >= 0 AND payout <= 100),
      enabled       boolean NOT NULL DEFAULT true,
      decimals      int  NOT NULL DEFAULT 5,
      display_order int  NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    )`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO market_assets (id, symbol, name, category, source, payout, decimals, display_order) VALUES
      ('eur-usd', 'EUR/USD', 'EUR/USD',  'forex',  'twelvedata', 92, 5, 1),
      ('gbp-usd', 'GBP/USD', 'GBP/USD',  'forex',  'twelvedata', 92, 5, 2),
      ('btc',     'BTC/USD', 'Bitcoin',  'crypto', 'binance',    88, 2, 3),
      ('eth',     'ETH/USD', 'Ethereum', 'crypto', 'binance',    88, 2, 4),
      ('sol',     'SOL/USD', 'Solana',   'crypto', 'binance',    85, 2, 5),
      ('xrp',     'XRP/USD', 'Ripple',   'crypto', 'binance',    85, 4, 6),
      ('bnb',     'BNB/USD', 'BNB',      'crypto', 'binance',    85, 2, 7)
    ON CONFLICT (id) DO NOTHING`)
}

async function main() {
  await ensureLiveTables()
  // Profile e FK obrigatorio de Account (onDelete: Cascade).
  await prisma.profile.upsert({
    where:  { id: TEST_USER_ID },
    update: {},
    create: { id: TEST_USER_ID, name: 'PulseHacker Test User', kycStatus: 'verified' },
  })

  const account = await prisma.account.upsert({
    where:  { userId_type: { userId: TEST_USER_ID, type: 'DEMO' } },
    update: { balance: 10000 },
    create: { userId: TEST_USER_ID, type: 'DEMO', balance: 10000, currency: 'BRL' },
  })

  const asset = await prisma.otcAsset.upsert({
    where:  { symbol: SYMBOL },
    update: { status: 'ACTIVE' },
    create: {
      symbol:     SYMBOL,
      name:       'ETH/USD OTC',
      basePrice:  2000,
      volatility: 0.0015,
      trend:      0,
      payout:     85,
      decimals:   2,
      status:     'ACTIVE',
    },
  })

  console.log('\n✅ Seed de teste pronto:')
  console.log(`   VERTEX_USER_ID = ${TEST_USER_ID}`)
  console.log(`   conta DEMO     = ${account.id} (saldo R$${account.balance})`)
  console.log(`   ASSET_SYMBOL   = ${asset.symbol} (payout ${asset.payout}%)\n`)
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
