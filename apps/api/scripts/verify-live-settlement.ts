/**
 * Verificacao de seguranca da liquidacao LIVE (rodar contra a stack local isolada,
 * NUNCA contra producao — cria/deleta operacoes de teste).
 *
 *  1. Op live com entry_price_source=CLIENT NUNCA e liquidada a preco (SKIPPED)
 *     — gate anti-forjacao: entry CLIENT + liquidacao contra preco real = WIN garantido.
 *  2. Tres liquidacoes concorrentes -> credito UNICO (guard updateMany status='OPEN').
 *  3. isForexOpenAt: ordem que venceria apos sexta 22:00 UTC seria rejeitada na abertura.
 *
 * Pre-requisitos: docker compose -f infra/docker-compose.dev.yml up -d
 *                 npx prisma db push + seed-integration-test.ts
 *                 live_prices com preco fresco de 'btc' (API local rodando OU insert manual)
 *
 *   DOTENV_CONFIG_PATH=.env.test.local INTEGRATIONS_LIVE_ASSETS_ENABLED=true \
 *     npx tsx scripts/verify-live-settlement.ts
 */
import 'dotenv/config'
import { prisma } from '../src/prisma.js'
import { settleOperation } from '../src/operations/service.js'
import { isForexOpenAt } from '../src/market-data/marketHours.js'
import { readLivePrice } from '../src/market-data/liveAssets.js'

const USER_ID = process.env.TEST_USER_ID || '11111111-1111-1111-1111-111111111111'
function die(msg: string): never { console.error('❌ ' + msg); process.exit(1) }
function ok(msg: string) { console.log('✅ ' + msg) }

async function main() {
  const account = await prisma.account.findUnique({
    where: { userId_type: { userId: USER_ID, type: 'DEMO' } },
  })
  if (!account) die('conta DEMO de teste nao encontrada (rode o seed-integration-test)')

  // ── 1. Entry CLIENT: gate anti-forjacao ────────────────────────────────────
  const clientOp = await prisma.operation.create({
    data: {
      accountId: account.id, assetId: 'btc', assetSymbol: 'BTC/USD',
      direction: 'CALL', amount: 1, payoutPct: 92,
      entryPrice: 1,                    // entry forjado absurdo (CALL ganharia sempre)
      entryPriceSource: 'CLIENT',
      expiresAt: new Date(Date.now() - 5_000),
    },
  })
  const r1 = await settleOperation(clientOp.id)
  const after1 = await prisma.operation.findUnique({ where: { id: clientOp.id } })
  if (r1 !== 'SKIPPED' || after1!.status !== 'OPEN') {
    die(`op CLIENT foi processada! result=${r1} status=${after1!.status}`)
  }
  ok('op live com entry CLIENT: SKIPPED, continua OPEN (nunca liquida a preco)')
  await prisma.operation.delete({ where: { id: clientOp.id } })  // limpa antes do grace/DRAW

  // ── 2. Corrida: tres liquidacoes concorrentes, credito unico ───────────────
  const balBefore = Number((await prisma.account.findUnique({ where: { id: account.id } }))!.balance)
  const raceOp = await prisma.operation.create({
    data: {
      accountId: account.id, assetId: 'btc', assetSymbol: 'BTC/USD',
      direction: 'CALL', amount: 1, payoutPct: 92,
      entryPrice: 1,                    // bem abaixo do preco real -> WON garantido
      entryPriceSource: 'SERVER',
      expiresAt: new Date(Date.now() - 2_000),
    },
  })
  const results = await Promise.all([
    settleOperation(raceOp.id), settleOperation(raceOp.id), settleOperation(raceOp.id),
  ])
  const afterRace = await prisma.operation.findUnique({ where: { id: raceOp.id } })
  const txs = await prisma.transaction.findMany({ where: { operationId: raceOp.id } })
  const balAfter = Number((await prisma.account.findUnique({ where: { id: account.id } }))!.balance)
  if (afterRace!.status !== 'WON') die(`esperava WON, veio ${afterRace!.status} (live_prices tem preco fresco de btc?)`)
  if (txs.length !== 1) die(`credito duplicado! ${txs.length} transacoes`)
  const expectedCredit = 1 + 0.92
  if (Math.abs(balAfter - balBefore - expectedCredit) > 0.001) {
    die(`saldo errado: delta ${(balAfter - balBefore).toFixed(2)}, esperado ${expectedCredit}`)
  }
  ok(`corrida 3x settleOperation: WON unico, 1 transacao, saldo +${expectedCredit} (results: ${results.join(',')})`)

  // ── 3. Janela forex: vencimento depois de sexta 22:00 UTC ──────────────────
  const fri2158 = new Date('2026-07-10T21:58:00Z')  // sexta
  const in5min  = new Date(fri2158.getTime() + 5 * 60_000)
  if (!isForexOpenAt(fri2158)) die('sexta 21:58 UTC deveria estar ABERTO')
  if (isForexOpenAt(in5min))   die('sexta 22:03 UTC deveria estar FECHADO')
  if (isForexOpenAt(new Date('2026-07-11T10:00:00Z'))) die('sabado deveria estar FECHADO')
  if (isForexOpenAt(new Date('2026-07-12T21:59:00Z'))) die('domingo 21:59 UTC deveria estar FECHADO')
  if (!isForexOpenAt(new Date('2026-07-12T22:01:00Z'))) die('domingo 22:01 UTC deveria estar ABERTO')
  ok('isForexOpenAt: abertura sexta 21:58 com vencimento 22:03 seria rejeitada (MARKET_CLOSED)')

  // ── 4. Frescor: preco com mais de LIVE_PRICE_MAX_AGE_MS nunca e usado ───────
  await prisma.$executeRawUnsafe(
    `INSERT INTO live_prices (asset_id, symbol, price, source, updated_at)
     VALUES ('stale-test','STALE',123,'test', now() - interval '60 seconds')
     ON CONFLICT (asset_id) DO UPDATE SET updated_at = now() - interval '60 seconds'`,
  )
  const stale = await readLivePrice('stale-test')
  await prisma.$executeRawUnsafe(`DELETE FROM live_prices WHERE asset_id = 'stale-test'`)
  if (stale !== null) die(`preco de 60s foi aceito (${stale})!`)
  ok('frescor: preco >15s retorna null (abertura rejeita PRICE_UNAVAILABLE; liquidacao pula -> DRAW via sweeper)')

  await prisma.$disconnect()
  console.log('\n✅ Todas as verificacoes de seguranca passaram.')
  // exit explicito: o import de operations/service.js puxa o client ioredis,
  // que mantem o event loop vivo — sem isso o processo nunca encerra.
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
