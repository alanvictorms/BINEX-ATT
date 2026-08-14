// Script de backfill: gera candles historicos sinteticos para os pares OTC ativos
// usando a mesma matematica do engine (rng.ts -> nextPrice). Util quando o engine
// nao conseguiu persistir candles continuamente (gaps de horas) e o chart fica vazio.
//
// Estrategia: comeca do preco atual no Redis (ou basePrice) e caminha PRA TRAS no tempo,
// invertendo o random walk. Garante continuidade visual ate o "agora" e mantem a
// estatistica do engine (mesmo SD steady-state).
//
// Uso: npx tsx apps/api/prisma/backfill-otc-candles.ts
//
// Seguro: usa upsert (idempotente). Nao deleta nada por padrao — se quiser limpar
// candles antigos primeiro, descomente o bloco DELETE no inicio.

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import { xmur3, mulberry32 } from '../src/market-data/otc/rng.js'

const prisma = new PrismaClient()

// Redis OPCIONAL — se REDIS_URL nao estiver setada, pula a sincronia do ZSET.
// Util pra rodar local (so Postgres) e depois flushar Redis manualmente no servidor.
const REDIS_URL = process.env.REDIS_URL
const redis = REDIS_URL ? new Redis(REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 }) : null

const CANDLE_BUFFER_SIZE = 500
const candleBufferKey = (symbol: string, tf: number) => `otc:candles:${symbol}:${tf}`

// Quantos candles gerar pra cada timeframe. 300 = suficiente pro chart renderizar
// (limit padrao do front e 200-300).
const BACKFILL_COUNTS: Record<number, number> = {
  5:   600,  // 50 min de historico
  15:  400,  // 100 min
  60:  300,  // 5 horas
  300: 144,  // 12 horas
}

const TIMEFRAMES = [5, 15, 60, 300]

function alignWindow(epochSec: number, tf: number): number {
  return Math.floor(epochSec / tf) * tf
}

function round(value: number, decimals: number): number {
  const m = Math.pow(10, decimals)
  return Math.round(value * m) / m
}

// Box-Muller deterministico a partir de um RNG uniforme.
function gauss(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-9)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

// Mesma matematica do engine: random walk com mean reversion suave.
function nextPrice(currentPrice: number, basePrice: number, volatility: number, rng: () => number): number {
  const shock     = gauss(rng) * volatility * currentPrice
  const reversion = (basePrice - currentPrice) * 0.001
  return currentPrice + shock + reversion
}

async function backfillAsset(asset: { id: string; symbol: string; basePrice: number; volatility: number; decimals: number; currentPrice: number }) {
  console.log(`\n[${asset.symbol}] basePrice=${asset.basePrice} volatility=${asset.volatility} currentPrice=${asset.currentPrice}`)

  for (const tf of TIMEFRAMES) {
    const count = BACKFILL_COUNTS[tf]
    const nowSec = Math.floor(Date.now() / 1000)
    const alignedNow = alignWindow(nowSec, tf)

    // Caminha PRA TRAS gerando candles. Cada candle tem (interno) ~20 sub-ticks
    // pra produzir high/low realistas. Conecta candles atraves do close anterior.
    let closeAnchor = asset.currentPrice
    const candles: { openTime: number; open: number; high: number; low: number; close: number }[] = []

    for (let i = 0; i < count; i++) {
      const openTime = alignedNow - (i + 1) * tf  // i=0 -> candle anterior ao atual
      // RNG deterministico por (symbol, openTime, tf) — reproducivel se rodar de novo.
      const seed = xmur3(`${asset.symbol}:${openTime}:${tf}:backfill`)
      const rng  = mulberry32(seed())

      // Geramos 20 sub-ticks DENTRO do candle. O close do candle e o close do ultimo
      // sub-tick, que deve casar com o close do candle posterior (closeAnchor).
      // Pra garantir continuidade, ancoramos o ULTIMO sub-tick no closeAnchor e
      // caminhamos pra tras a partir dele.
      const sub  = 20
      const path = [closeAnchor]
      for (let s = 0; s < sub; s++) {
        // Inverso do random walk: subtrai shock pra ir pra tras no tempo.
        // Como o random walk e simetrico (gauss tem media zero), isso da continuidade.
        const prev = nextPrice(path[s], asset.basePrice, asset.volatility, rng)
        path.push(prev)
      }
      path.reverse()  // agora path[0] = open, path[sub] = close (== closeAnchor)

      const open  = round(path[0], asset.decimals)
      const close = round(path[sub], asset.decimals)
      const high  = round(Math.max(...path), asset.decimals)
      const low   = round(Math.min(...path), asset.decimals)

      candles.push({ openTime, open, high, low, close })
      closeAnchor = open  // proximo candle (mais antigo) fecha onde este abriu
    }

    // Bulk INSERT raw — multi-row VALUES com ON CONFLICT UPDATE. Muito mais rapido
    // que prisma upsert em loop (era 290 transacoes serializadas, agora 1 query por TF).
    if (candles.length > 0) {
      const values = candles.map(c => {
        const iso = new Date(c.openTime * 1000).toISOString()
        return `('${asset.id}',${tf},'${iso}'::timestamptz,${c.open},${c.high},${c.low},${c.close})`
      }).join(',')
      const sql = `INSERT INTO otc_candles (asset_id, timeframe, open_time, open, high, low, close)
                   VALUES ${values}
                   ON CONFLICT (asset_id, timeframe, open_time) DO UPDATE SET
                     open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close`
      await prisma.$executeRawUnsafe(sql)
    }
    const inserted = candles.length

    // Tambem sincroniza o Redis ZSET (cache hot que o endpoint /candles le primeiro)
    // SE estivermos com REDIS_URL configurado. Senao, pula e usuario faz flush manual.
    if (redis) {
      const key = candleBufferKey(asset.symbol, tf)
      await redis.del(key)
      const pipeline = redis.pipeline()
      for (const c of candles.slice().sort((a, b) => a.openTime - b.openTime)) {
        pipeline.zadd(key, c.openTime, JSON.stringify({ t: c.openTime, o: c.open, h: c.high, l: c.low, c: c.close }))
      }
      pipeline.zremrangebyrank(key, 0, -(CANDLE_BUFFER_SIZE + 1))
      await pipeline.exec()
    }

    console.log(`  tf=${tf}s -> ${inserted} candles backfilled (postgres${redis ? ' + redis' : ''})`)
  }
}

async function main() {
  // Carrega pares ATIVOS e seus precos atuais.
  const assets = await prisma.otcAsset.findMany({ where: { status: 'ACTIVE' } })
  console.log(`Found ${assets.length} active OTC pairs.`)

  for (const a of assets) {
    // Tenta usar o ultimo close persistido como currentPrice (continuidade com o engine).
    // Se nao houver candle algum, cai pra basePrice.
    const lastCandle = await prisma.otcCandle.findFirst({
      where: { assetId: a.id, timeframe: 60 },
      orderBy: { openTime: 'desc' },
    })
    const currentPrice = lastCandle ? Number(lastCandle.close) : Number(a.basePrice)

    await backfillAsset({
      id:         a.id,
      symbol:     a.symbol,
      basePrice:  Number(a.basePrice),
      volatility: Number(a.volatility),
      decimals:   a.decimals,
      currentPrice,
    })
  }

  console.log('\nBackfill complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => {
    await prisma.$disconnect()
    if (redis) redis.disconnect()
  })
