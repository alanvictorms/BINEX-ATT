/**
 * Script de teste da integracao PulseHacker -> Vertex (/integrations/operations).
 *
 * Simula o que o BACKEND do PulseHacker vai fazer: monta o request, assina com
 * HMAC e chama a Vertex. NUNCA importa prisma/redis nos modos de rede — so fala
 * HTTP — entao nao tem como tocar o banco por engano.
 *
 * Modos:
 *   --check-auth   Round-trip puro da assinatura HMAC. SEM rede, SEM banco. (rode primeiro)
 *   --discover     Lista ativos OTC ACTIVE + um userId com conta DEMO. So-leitura (precisa DATABASE_URL).
 *   (sem flag)     E2E: abre um trade DEMO na API rodando e faz polling ate liquidar.
 *
 * Env:
 *   PULSEHACKER_SERVICE_SECRET   (obrigatorio) mesmo segredo do .env da API
 *   API_URL                       default http://localhost:3001
 *   VERTEX_USER_ID                (E2E) usuario com conta DEMO  (use --discover p/ achar)
 *   ASSET_SYMBOL                  default ETHUSD-OTC
 *   MARKET                        'LIVE' abre em ativo real (BTC/USD, EUR/USD...);
 *                                 ausente = OTC (comportamento original)
 *   DIRECTION                     default CALL
 *   AMOUNT                        default 1
 *   EXPIRES                       default 30  (segundos)
 *
 * Exemplos:
 *   PULSEHACKER_SERVICE_SECRET=xxx npx tsx scripts/test-pulsehacker-integration.ts --check-auth
 *   PULSEHACKER_SERVICE_SECRET=xxx npx tsx scripts/test-pulsehacker-integration.ts --discover
 *   PULSEHACKER_SERVICE_SECRET=xxx VERTEX_USER_ID=... npx tsx scripts/test-pulsehacker-integration.ts
 */
import 'dotenv/config'
import { createHmac } from 'node:crypto'
import { buildOperationMessage } from '../src/integrations/schema.js'
import { verifyServiceRequest } from '../src/integrations/auth.js'

const SECRET  = process.env.PULSEHACKER_SERVICE_SECRET ?? ''
const API_URL = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
const MODE = process.argv.includes('--check-auth') ? 'check-auth'
           : process.argv.includes('--discover')   ? 'discover'
           : 'e2e'

function die(msg: string): never { console.error('\n❌ ' + msg + '\n'); process.exit(1) }
function ok(msg: string)  { console.log('   ✅ ' + msg) }

// Assina como o PulseHacker fara: HMAC-SHA256(secret, `${ts}.${msg}`).
function sign(message: string, ts: number): string {
  return createHmac('sha256', SECRET).update(`${ts}.${message}`).digest('hex')
}

function sampleInput() {
  return {
    vertexUserId:     process.env.VERTEX_USER_ID || '00000000-0000-0000-0000-000000000000',
    accountType:      'DEMO' as const,
    assetSymbol:      process.env.ASSET_SYMBOL || 'ETHUSD-OTC',
    direction:        (process.env.DIRECTION || 'CALL') as 'CALL' | 'PUT',
    amount:           Number(process.env.AMOUNT || '1'),
    expiresInSeconds: Number(process.env.EXPIRES || '30'),
    idempotencyKey:   `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    // market:'LIVE' entra no body E na string assinada (so quando presente —
    // requests sem o campo mantem a assinatura antiga valida).
    ...(process.env.MARKET ? { market: process.env.MARKET as 'OTC' | 'LIVE' } : {}),
  }
}

// ── Modo 1: round-trip da assinatura (sem infra) ────────────────────────────────
function checkAuth() {
  if (!SECRET) die('Defina PULSEHACKER_SERVICE_SECRET no ambiente.')
  console.log('\n🔐 Teste de assinatura HMAC (local, sem rede)\n')
  const input = sampleInput()
  const msg = buildOperationMessage(input)
  const ts  = Date.now()
  const sig = sign(msg, ts)

  // 1) assinatura valida deve passar
  verifyServiceRequest({ 'x-vertex-timestamp': String(ts), 'x-vertex-signature': sig }, msg)
  ok('assinatura valida ACEITA')

  // 2) corpo adulterado deve ser rejeitado
  const tampered = buildOperationMessage({ ...input, amount: input.amount + 1 })
  try {
    verifyServiceRequest({ 'x-vertex-timestamp': String(ts), 'x-vertex-signature': sig }, tampered)
    die('FALHA: corpo adulterado foi aceito (nao deveria!)')
  } catch { ok('corpo adulterado REJEITADO') }

  // 3) timestamp velho (anti-replay) deve ser rejeitado
  const oldTs = ts - 10 * 60 * 1000
  try {
    verifyServiceRequest({ 'x-vertex-timestamp': String(oldTs), 'x-vertex-signature': sign(msg, oldTs) }, msg)
    die('FALHA: timestamp velho foi aceito (replay!)')
  } catch { ok('timestamp velho (replay) REJEITADO') }

  // 4) sem headers deve ser rejeitado
  try {
    verifyServiceRequest({}, msg)
    die('FALHA: request sem assinatura foi aceito')
  } catch { ok('request sem assinatura REJEITADO') }

  console.log('\n✅ Camada de seguranca OK — assinatura, anti-tamper e anti-replay funcionando.\n')
}

// ── Modo 2: descoberta de dados de teste (so-leitura) ───────────────────────────
async function discover() {
  const { prisma } = await import('../src/prisma.js')
  console.log('\n🔎 Descoberta (so-leitura)\n')
  const assets = await prisma.otcAsset.findMany({ where: { status: 'ACTIVE' }, select: { symbol: true, payout: true } })
  console.log('Ativos OTC ACTIVE:')
  if (!assets.length) console.log('   (nenhum — rode o seed: npm run db:seed-otc)')
  for (const a of assets) console.log(`   - ${a.symbol}  (payout ${a.payout}%)`)

  const demo = await prisma.account.findFirst({ where: { type: 'DEMO' }, select: { userId: true, balance: true } })
  console.log('\nConta DEMO de exemplo:')
  if (!demo) console.log('   (nenhuma conta DEMO encontrada)')
  else console.log(`   VERTEX_USER_ID=${demo.userId}  (saldo demo R$${demo.balance})`)
  console.log()
  await prisma.$disconnect()
}

// ── Modo 3: E2E contra a API rodando ────────────────────────────────────────────
async function e2e() {
  if (!SECRET) die('Defina PULSEHACKER_SERVICE_SECRET (mesmo valor do .env da API).')
  if (!process.env.VERTEX_USER_ID) die('Defina VERTEX_USER_ID (use --discover pra achar um). Conta DEMO.')

  const input = sampleInput()
  const msg = buildOperationMessage(input)
  const ts  = Date.now()
  const sig = sign(msg, ts)

  console.log(`\n🚀 Abrindo trade DEMO em ${API_URL}/integrations/operations`)
  console.log(`   ${input.assetSymbol} ${input.direction} R$${input.amount} exp ${input.expiresInSeconds}s\n`)

  const res = await fetch(`${API_URL}/integrations/operations`, {
    method:  'POST',
    headers: {
      'content-type':       'application/json',
      'x-vertex-timestamp': String(ts),
      'x-vertex-signature': sig,
    },
    body: JSON.stringify(input),
  })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok) die(`API respondeu ${res.status}: ${JSON.stringify(json)}`)
  const opId = json.operation?.id
  ok(`trade aberto: ${opId} (status ${json.operation?.status}, entry ${json.operation?.entryPrice})`)

  // Polling do resultado
  const deadline = Date.now() + (input.expiresInSeconds + 20) * 1000
  console.log('\n⏳ Aguardando liquidacao...')
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000))
    const gts = Date.now()
    const gsig = sign(['GET', opId, input.vertexUserId].join('|'), gts)
    const gres = await fetch(
      `${API_URL}/integrations/operations/${opId}?vertexUserId=${input.vertexUserId}`,
      { headers: { 'x-vertex-timestamp': String(gts), 'x-vertex-signature': gsig } },
    )
    const gjson: any = await gres.json().catch(() => ({}))
    const st = gjson.operation?.status
    process.stdout.write(`   status: ${st}\n`)
    if (st && st !== 'OPEN') {
      const won = st === 'WON'
      console.log(`\n${won ? '🟢' : st === 'LOST' ? '🔴' : '⚪'} Resultado: ${st}  | profit R$${gjson.operation?.profit}  | exit ${gjson.operation?.exitPrice}\n`)
      return
    }
  }
  die('Timeout esperando a liquidacao (a engine OTC esta rodando?).')
}

;(async () => {
  if (MODE === 'check-auth')  checkAuth()
  else if (MODE === 'discover') await discover()
  else await e2e()
})().catch(e => die(e?.message ?? String(e)))
