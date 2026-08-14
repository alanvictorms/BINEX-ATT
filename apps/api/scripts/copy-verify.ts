// Verificacao da LOGICA PURA do ciclo de copy (sem tocar no banco).
// Roda: npx tsx scripts/copy-verify.ts
//
// Cobre: distribuicao 2W/3L, 1a op sempre WIN, agendamento +1/+31/+61/+91/+121,
// valor = 10% do saldo, e nextCycleAt = inicio + 121min + 24h.

import {
  planCycleResults, buildCycleSchedule, computeNextCycleAt, roundMoney,
  CYCLE_OPS, STAKE_PCT, CYCLE_DURATION_MS,
} from '../src/copy/service.js'

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) { console.log(`  ok   ${name}`) }
  else      { console.error(`  FAIL ${name} ${extra}`); failures++ }
}

console.log('\n== Distribuicao do ciclo (1000 amostras) ==')
let firstAlwaysWin = true
let always2W3L = true
let always5 = true
for (let i = 0; i < 1000; i++) {
  const r = planCycleResults()
  if (r.length !== CYCLE_OPS) always5 = false
  if (r[0] !== 'WIN') firstAlwaysWin = false
  const wins = r.filter(x => x === 'WIN').length
  const loss = r.filter(x => x === 'LOSS').length
  if (wins !== 2 || loss !== 3) always2W3L = false
}
check('sempre 5 operacoes', always5)
check('1a operacao sempre WIN', firstAlwaysWin)
check('sempre 2 WIN / 3 LOSS', always2W3L)

console.log('\n== Agendamento ==')
const start = new Date('2026-06-13T12:00:00.000Z')
const sched = buildCycleSchedule(start)
const mins = sched.map(d => (d.getTime() - start.getTime()) / 60_000)
check('offsets +1/+31/+61/+91/+121 min', JSON.stringify(mins) === JSON.stringify([1, 31, 61, 91, 121]), JSON.stringify(mins))

console.log('\n== nextCycleAt = inicio + 121min + 24h ==')
const next = computeNextCycleAt(start)
const expectedNext = start.getTime() + CYCLE_DURATION_MS + 24 * 60 * 60_000
check('nextCycleAt correto', next.getTime() === expectedNext)
check('duracao do ciclo == 121min', CYCLE_DURATION_MS === 121 * 60_000)

console.log('\n== Valor da operacao = 10% do saldo ==')
check('10% de 1000 = 100', roundMoney(1000 * STAKE_PCT) === 100)
check('10% de 875.10 = 87.51', roundMoney(875.10 * STAKE_PCT) === 87.51)
check('arredonda 2 casas (10% de 33.333 = 3.33)', roundMoney(33.333 * STAKE_PCT) === 3.33)

console.log('\n== Resultado liquido do ciclo ~= -10% da banca ==')
// 2 WIN (+amount cada) + 3 LOSS (-amount cada) = -1*amount = -10% da banca.
const bank = 1000
const amount = roundMoney(bank * STAKE_PCT)
const net = 2 * amount - 3 * amount
check('net de um ciclo = -10% da banca', net === -amount && net === -100, `net=${net}`)

console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM ✅\n' : `\n${failures} TESTE(S) FALHARAM ❌\n`)
process.exit(failures === 0 ? 0 : 1)
