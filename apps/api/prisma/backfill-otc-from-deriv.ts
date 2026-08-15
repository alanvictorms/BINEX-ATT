// Backfill de historico OTC a partir do mercado real da Deriv.
//
// POR QUE ISSO EXISTE
// Os ativos OTC daqui sao sinteticos: o engine (rng.ts) gera o preco ao vivo.
// O grafico so tem historico do momento em que o engine rodou, entao voltar
// alguns dias no chart mostra vazio. Este script preenche ate 3 meses de
// candles usando a forma do mercado real correspondente na Deriv.
//
// SEGURANCA (o script e ADITIVO, por construcao)
//   - Escreve com createMany({ skipDuplicates: true }): insere apenas candles
//     que ainda nao existem. NUNCA sobrescreve nem apaga linha existente.
//   - Nao toca em otc_assets, Redis, engine, operations nem em qualquer outra
//     tabela. So INSERT em otc_candles.
//   - Rode com --dry-run primeiro pra ver o volume antes de gravar.
//
// CONTINUIDADE DE PRECO (--mode)
//   normalize (padrao): escala a serie da Deriv por um fator constante pra que
//     o candle historico mais recente termine no preco OTC atual. Preserva a
//     forma e a volatilidade reais do mercado e emenda sem degrau no preco vivo
//     do engine. E o que faz o grafico ficar continuo.
//   raw: grava os precos reais da Deriv sem escalar. O historico fica fiel ao
//     mercado, mas o grafico da um salto na fronteira com o preco sintetico.
//
// TIMEFRAMES
//   A Deriv nao oferece candle de 5s nem 15s (minimo 60s), entao o backfill
//   cobre 60 e 300. Os timeframes curtos continuam vindo do engine, como hoje.
//   As janelas por tf sao diferentes por causa de espaco em disco — ver TF_DAYS.
//
// USO
//   npx tsx prisma/backfill-otc-from-deriv.ts --dry-run
//   npx tsx prisma/backfill-otc-from-deriv.ts --days-300 90 --days-60 30
//   npx tsx prisma/backfill-otc-from-deriv.ts --mode raw --symbols EURUSD-OTC
//
// Rodando de fora da rede do EasyPanel, defina OTC_PRICE_API pro fator de
// normalizacao sair do preco vivo em vez do basePrice:
//   OTC_PRICE_API=https://recoverypf.com/api/be

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import { DerivClient, DERIV_MAX_CANDLES, type DerivCandle } from '../src/integrations/deriv/client.js'
import { derivSymbolFor } from '../src/integrations/deriv/symbols.js'
import { getOrFreezeFactor } from '../src/integrations/deriv/factors.js'

const prisma = new PrismaClient()

// Janela por timeframe, em dias. Sao diferentes de proposito: otc_candles mede
// ~262 bytes/linha, entao 60s por 90 dias nos 14 ativos daria ~1,55M linhas
// (~400 MB) e estouraria o limite de 500 MB do plano free do Supabase. Com
// 300s cobrindo os 3 meses inteiros o grafico tem o historico pedido, e 60s
// cobre o periodo recente, que e onde o zoom fino e usado.
const TF_DAYS: Record<number, number> = { 60: 30, 300: 90 }
const INSERT_CHUNK = 5000

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function flag(name: string): boolean { return argv.includes(`--${name}`) }
function opt(name: string, fallback: string): string {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const DRY_RUN = flag('dry-run')
const DAYS_60 = Math.min(parseInt(opt('days-60', String(TF_DAYS[60])), 10) || TF_DAYS[60], 180)
const DAYS_300 = Math.min(parseInt(opt('days-300', String(TF_DAYS[300])), 10) || TF_DAYS[300], 180)
TF_DAYS[60] = DAYS_60
TF_DAYS[300] = DAYS_300
const TIMEFRAMES = Object.keys(TF_DAYS).map(Number).sort((a, b) => a - b)
const MODE    = opt('mode', 'normalize') as 'normalize' | 'raw'
const ONLY    = opt('symbols', '').split(',').map(s => s.trim()).filter(Boolean)

if (MODE !== 'normalize' && MODE !== 'raw') {
  console.error(`--mode precisa ser "normalize" ou "raw" (recebido: ${MODE})`)
  process.exit(1)
}

// ── helpers ──────────────────────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL
const redis = REDIS_URL ? new Redis(REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 }) : null

function round(v: number, decimals: number): number {
  const m = Math.pow(10, decimals)
  return Math.round(v * m) / m
}

/**
 * Preco OTC atual, na ordem: Redis -> API publica -> basePrice.
 *
 * O Redis vive na rede interna do EasyPanel, entao rodando de fora ele nao
 * responde. Nesse caso OTC_PRICE_API (ex: https://recoverypf.com/api/be) le o
 * mesmo valor que o engine publicou, e a emenda fica no preco real de agora em
 * vez de no basePrice — que ja pode ter drifado.
 */
async function currentOtcPrice(symbol: string, basePrice: number): Promise<number> {
  if (redis) {
    try {
      const cached = await redis.get(`otc:price:${symbol}`)
      const n = cached == null ? NaN : Number(cached)
      if (Number.isFinite(n) && n > 0) return n
    } catch { /* cai pro proximo */ }
  }

  const api = process.env.OTC_PRICE_API
  if (api) {
    try {
      const res = await fetch(`${api.replace(/\/$/, '')}/market-data/otc/${symbol}/price`)
      if (res.ok) {
        const j = await res.json() as { price?: number }
        if (Number.isFinite(j.price) && (j.price as number) > 0) return j.price as number
      }
    } catch { /* cai pro basePrice */ }
  }

  return basePrice
}

/**
 * Puxa o intervalo inteiro paginando por `end`, andando pra tras.
 * A Deriv devolve no maximo DERIV_MAX_CANDLES por chamada.
 */
async function fetchRange(
  deriv: DerivClient, symbol: string, granularity: number, from: number, to: number,
): Promise<DerivCandle[]> {
  const out = new Map<number, DerivCandle>()
  let cursor = to
  let guard = 0

  while (cursor > from && guard++ < 200) {
    const page = await deriv.candles({ symbol, granularity, start: from, end: cursor, count: DERIV_MAX_CANDLES })
    if (page.length === 0) break

    let added = 0
    for (const c of page) if (!out.has(c.epoch)) { out.set(c.epoch, c); added++ }

    const oldest = page[0].epoch
    // Sem candle novo ou ja chegamos no inicio: nao ha o que paginar.
    if (added === 0 || oldest <= from) break
    cursor = oldest - granularity
  }

  return [...out.values()].sort((a, b) => a.epoch - b.epoch)
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const now = Math.floor(Date.now() / 1000)
  const fromFor = (tf: number) => now - TF_DAYS[tf] * 24 * 3600

  console.log(`\nBackfill OTC via Deriv`)
  console.log(`  modo   : ${MODE}${MODE === 'normalize' ? ' (emenda no preco atual)' : ' (precos reais, degrau no grafico)'}`)
  console.log(`  janelas: ${TIMEFRAMES.map(tf => `${tf}s=${TF_DAYS[tf]}d`).join('  ')}`)
  console.log(`  escrita: ${DRY_RUN ? 'DRY-RUN (nada gravado)' : 'INSERT (skipDuplicates)'}\n`)

  const assets = await prisma.otcAsset.findMany({ where: { status: 'ACTIVE' }, orderBy: { symbol: 'asc' } })
  const targets = assets.filter(a => derivSymbolFor(a.symbol) && (ONLY.length === 0 || ONLY.includes(a.symbol)))

  if (targets.length === 0) { console.log('Nenhum ativo elegivel.'); return }

  const deriv = new DerivClient()
  await deriv.connect()

  let grandInserted = 0
  try {
    for (const asset of targets) {
      const derivSymbol = derivSymbolFor(asset.symbol)!
      const decimals    = asset.decimals
      const basePrice   = Number(asset.basePrice)

      console.log(`${asset.symbol} -> ${derivSymbol}`)

      // Fator congelado UMA vez por ativo (ver factors.ts), nao por timeframe.
      // Sem isso, uma re-execucao meses depois pegaria o preco vivo ja drifado e
      // gravaria candles novos com fator diferente dos que ja estao no banco,
      // criando uma emenda torta no meio da serie.
      let factor = 1
      if (MODE === 'normalize') {
        const frozen = await getOrFreezeFactor(asset.symbol, derivSymbol, async () => {
          const target = await currentOtcPrice(asset.symbol, basePrice)
          const probe  = await deriv.candles({ symbol: derivSymbol, granularity: 60, start: now - 12 * 3600, end: now, count: 500 })
          const close  = probe.length ? probe[probe.length - 1].close : 0
          if (!(close > 0)) throw new Error(`sem preco recente da Deriv pra ${derivSymbol}`)
          return { factor: target / close, target }
        })
        factor = frozen.factor
      }

      for (const tf of TIMEFRAMES) {
        const candles = await fetchRange(deriv, derivSymbol, tf, fromFor(tf), now)
        if (candles.length === 0) { console.log(`  tf ${tf}s: nada retornado`); continue }

        const rows = candles.map(c => ({
          assetId:   asset.id,
          timeframe: tf,
          openTime:  new Date(c.epoch * 1000),
          open:      round(c.open  * factor, decimals),
          high:      round(c.high  * factor, decimals),
          low:       round(c.low   * factor, decimals),
          close:     round(c.close * factor, decimals),
        }))

        if (DRY_RUN) {
          const span = `${new Date(candles[0].epoch * 1000).toISOString().slice(0, 16)} -> ${new Date(lastClose ? candles[candles.length - 1].epoch * 1000 : 0).toISOString().slice(0, 16)}`
          console.log(`  tf ${String(tf).padStart(3)}s: ${String(rows.length).padStart(6)} candles  ${span}  fator=${factor.toFixed(6)}`)
          continue
        }

        let inserted = 0
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          const chunk = rows.slice(i, i + INSERT_CHUNK)
          // skipDuplicates respeita @@unique([assetId, timeframe, openTime]):
          // o que ja existe fica intacto.
          const res = await prisma.otcCandle.createMany({ data: chunk, skipDuplicates: true })
          inserted += res.count
        }
        grandInserted += inserted
        console.log(`  tf ${String(tf).padStart(3)}s: ${String(rows.length).padStart(6)} candles -> ${inserted} novos (fator=${factor.toFixed(6)})`)
      }
    }
  } finally {
    deriv.close()
  }

  console.log(`\n${DRY_RUN ? 'DRY-RUN concluido.' : `Concluido. ${grandInserted} candles inseridos.`}\n`)
}

main()
  .catch(e => { console.error('\nFALHOU:', e.message); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect(); redis?.disconnect() })
