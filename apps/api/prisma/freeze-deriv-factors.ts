// Congela o fator de normalizacao de cada ativo OTC em app_config.
//
// POR QUE ELE E DERIVADO DO BANCO, E NAO RECALCULADO
// O backfill ja gravou ~750k candles usando um fator calculado naquele momento
// (preco vivo / close da Deriv). Recalcular agora daria um numero diferente — o
// preco sintetico anda o tempo todo — e o historico servido ao vivo pela Deriv
// nao encaixaria no que esta em otc_candles: apareceria um degrau exatamente na
// fronteira dos 3 meses.
//
// Entao o fator e RECUPERADO: pega candles ja gravados, busca os candles da
// Deriv do mesmo epoch e tira a razao close_gravado / close_deriv. Usa a mediana
// de varias amostras pra nao depender de um ponto solto.
//
// Idempotente: nao sobrescreve fator ja congelado (use --force pra regravar).
//
// Uso:
//   npx tsx prisma/freeze-deriv-factors.ts
//   npx tsx prisma/freeze-deriv-factors.ts --force

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { DerivClient } from '../src/integrations/deriv/client.js'
import { derivSymbolFor } from '../src/integrations/deriv/symbols.js'
import { loadFactors, saveFactors, type FactorMap } from '../src/integrations/deriv/factors.js'

const prisma = new PrismaClient()
const FORCE = process.argv.includes('--force')
const SAMPLE_TF = 300
const SAMPLE_N  = 200

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

async function main() {
  const assets = await prisma.otcAsset.findMany({ where: { status: 'ACTIVE' }, orderBy: { symbol: 'asc' } })
  const targets = assets.filter(a => derivSymbolFor(a.symbol))
  const map: FactorMap = await loadFactors()

  const deriv = new DerivClient()
  await deriv.connect()

  try {
    for (const asset of targets) {
      const derivSymbol = derivSymbolFor(asset.symbol)!
      if (map[asset.symbol] && !FORCE) {
        console.log(`${asset.symbol.padEnd(12)} ja congelado (${map[asset.symbol].factor.toFixed(6)}) — pulando`)
        continue
      }

      // Amostra do meio da serie: candles antigos o bastante pra estarem finais.
      const rows = await prisma.otcCandle.findMany({
        where:   { assetId: asset.id, timeframe: SAMPLE_TF },
        orderBy: { openTime: 'asc' },
        take:    SAMPLE_N,
      })
      if (rows.length === 0) { console.log(`${asset.symbol.padEnd(12)} sem candles gravados — pulando`); continue }

      const fromSec = Math.floor(rows[0].openTime.getTime() / 1000)
      const toSec   = Math.floor(rows[rows.length - 1].openTime.getTime() / 1000)
      const dv = await deriv.candles({ symbol: derivSymbol, granularity: SAMPLE_TF, start: fromSec, end: toSec + SAMPLE_TF, count: 5000 })
      const byEpoch = new Map(dv.map(c => [c.epoch, c]))

      const ratios: number[] = []
      for (const r of rows) {
        const epoch = Math.floor(r.openTime.getTime() / 1000)
        const d = byEpoch.get(epoch)
        if (!d || !(d.close > 0)) continue
        const ratio = Number(r.close) / d.close
        if (Number.isFinite(ratio) && ratio > 0) ratios.push(ratio)
      }

      if (ratios.length < 5) { console.log(`${asset.symbol.padEnd(12)} amostras insuficientes (${ratios.length}) — pulando`); continue }

      const factor = median(ratios)
      // Espalhamento alto indica que a razao nao e constante — sinal de que a
      // premissa (fator unico) nao vale pra esse ativo. Melhor avisar que gravar.
      const spread = (Math.max(...ratios) - Math.min(...ratios)) / factor
      map[asset.symbol] = {
        factor,
        derivSymbol,
        target: Number(rows[rows.length - 1].close),
        frozenAt: new Date().toISOString(),
      }
      console.log(`${asset.symbol.padEnd(12)} fator=${factor.toFixed(6)}  amostras=${ratios.length}  dispersao=${(spread * 100).toFixed(3)}%${spread > 0.001 ? '  <-- ATENCAO' : ''}`)
    }

    await saveFactors(map)
    console.log(`\n${Object.keys(map).length} fatores congelados em app_config.`)
  } finally {
    deriv.close()
  }
}

main().catch(e => { console.error('FALHOU:', e.message); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
