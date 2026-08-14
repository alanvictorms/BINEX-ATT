import { createHash } from 'node:crypto'
import { prisma } from '../prisma.js'
import { redis, KEYS } from '../redis.js'
import { PriceSource } from '@prisma/client'
import type { CreateOperationInput } from './schema.js'
import { ensureFreshLiveAssets, isLiveAssetId, liveAssetsEnabled, readLivePrice } from '../market-data/liveAssets.js'

// Tolerancia maxima entre entryPrice enviado pelo cliente e preco atual do servidor.
const ENTRY_PRICE_TOLERANCE = 0.002

// Atraso maximo pos-vencimento para liquidar live a preco de mercado. Alem disso
// o preco atual ja nao representa o vencimento (ex.: downtime longo) — melhor
// deixar o sweeper devolver como DRAW do que liquidar com preco errado.
const LIVE_SETTLE_MAX_LATE_MS = Number(process.env.LIVE_SETTLE_MAX_LATE_MS ?? '60000')

// Set de simbolos OTC server-authoritative, alimentado dinamicamente do banco.
// Refresh a cada 30s pega ativos adicionados/desativados via admin sem precisar deploy.
// Se o banco estiver indisponivel no startup, fica vazio ate o proximo refresh dar certo.
let serverAuthSymbols = new Set<string>()
let lastRefreshAt = 0
const REFRESH_INTERVAL_MS = 30_000

async function refreshServerAuthSymbols() {
  try {
    const rows = await prisma.otcAsset.findMany({
      where:  { status: 'ACTIVE' },
      select: { symbol: true },
    })
    serverAuthSymbols = new Set(rows.map(r => r.symbol))
    lastRefreshAt = Date.now()
  } catch (err: any) {
    console.error('[operations] refreshServerAuthSymbols failed:', err.message)
  }
}

// Refresh lazy: se passou o intervalo, recarrega antes de validar.
// Evita setInterval orfao em testes/scripts que importam o modulo sem subir o app.
async function ensureFreshSymbols() {
  if (Date.now() - lastRefreshAt > REFRESH_INTERVAL_MS) await refreshServerAuthSymbols()
}

// Slug do caminho Supabase -> simbolo do backend. Inverso exato da expressao que o
// place_trade usa pra achar o par:
//   upper(replace(replace(asset_id,'-otc',''),'-','')) || '-OTC'
// 'aud-cad-otc' -> 'AUDCAD-OTC'   'xag-usd-otc' -> 'XAGUSD-OTC'
// Devolve null pro cuid do caminho Fastify (nao termina em '-otc'), que cai no passo 2
// do resolver abaixo.
export function otcSymbolFromAssetId(assetId: string): string | null {
  if (!/-otc$/i.test(assetId)) return null
  return assetId.replace(/-otc$/i, '').replace(/-/g, '').toUpperCase() + '-OTC'
}

// Resolve o simbolo OTC autoritativo de uma operacao, ou null se ela nao for OTC.
//
// POR QUE PELO asset_id E NAO PELO SIMBOLO (regressao cara, 05/08): a versao antiga
// olhava so pro asset_symbol e canonizava com replace(/[\/\-\s]/g,''), que remove
// barra, hifen e espaco — mas NAO parenteses. O front manda o rotulo da UI, entao
// 'AUD/CAD (OTC)' virava 'AUDCAD(OTC)-OTC', que nao existe. A operacao era
// classificada como orfa e o sweeper devolvia 100% da entrada como DRAW.
//
// Isso era uma OPCAO GRATIS: o navegador liquidava quando o cliente ganhava, e quando
// perdia bastava fechar a aba pra receber o dinheiro de volta. 122 operacoes de
// clientes reais, R$ 1.709 devolvidos, ainda correndo em 05/08.
//
// O asset_id nao tem esse problema — o cliente nao escolhe o slug (o place_trade valida
// contra otc_assets) e ele cobre ate os rotulos que nao derivam do par, como
// 'Prata (OTC)' (asset_id 'xag-usd-otc'). Mesmo principio que o ramo LIVE ja usava.
function resolveOtcSymbol(assetId: string, assetSymbol: string): string | null {
  // 1) Slug do caminho Supabase — a fonte confiavel.
  const fromId = otcSymbolFromAssetId(assetId)
  if (fromId && serverAuthSymbols.has(fromId)) return fromId

  // 2) Caminho Fastify: asset_id e cuid e o asset_symbol ja e o simbolo do backend.
  if (serverAuthSymbols.has(assetSymbol)) return assetSymbol

  // 3) Rotulo da UI, com o marcador '(OTC)' removido antes de canonizar.
  const legacy = assetSymbol
    .replace(/\(\s*otc\s*\)/ig, '')
    .replace(/[\/\-\s]/g, '')
    .toUpperCase() + '-OTC'
  return serverAuthSymbols.has(legacy) ? legacy : null
}

function isServerAuthoritative(assetId: string, assetSymbol: string): boolean {
  return resolveOtcSymbol(assetId, assetSymbol) !== null
}

async function readServerPrice(assetId: string, assetSymbol: string): Promise<number | null> {
  const symbol = resolveOtcSymbol(assetId, assetSymbol)
  if (!symbol) return null
  const cached = await redis.get(KEYS.price(symbol))
  return cached ? Number(cached) : null
}

function computeAuditHash(parts: {
  operationId: string
  entryPrice:  number
  exitPrice:   number
  openedAt:    Date
  closedAt:    Date
  direction:   string
  amount:      number
  payout:      number
}): string {
  const payload = [
    parts.operationId,
    parts.entryPrice.toFixed(8),
    parts.exitPrice.toFixed(8),
    parts.openedAt.toISOString(),
    parts.closedAt.toISOString(),
    parts.direction,
    parts.amount.toFixed(2),
    String(parts.payout),
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}

// opts.serverPricedLive: uso INTERNO (integrations/service.ts). Marca que o
// entryPrice ja foi lido de live_prices pelo proprio servidor — grava SERVER e
// pula o ramo OTC (que lancaria PRICE_UNAVAILABLE para um ativo live). A rota
// publica POST /operations nunca seta isso, entao nao e forjavel via HTTP.
export async function createOperation(
  userId: string,
  input: CreateOperationInput,
  opts?: { serverPricedLive?: boolean },
) {
  await ensureFreshSymbols()

  const account = await prisma.account.findUnique({ where: { id: input.accountId } })
  if (!account || account.userId !== userId) throw new Error('ACCOUNT_NOT_FOUND')

  const balance = Number(account.balance)
  if (balance < input.amount) throw new Error('INSUFFICIENT_BALANCE')

  // Posicao travada (CALL + PUT no mesmo par ao mesmo tempo) — proibida pelo
  // Regulamento de Bonus, usada pra cumprir rollover sem risco de direcao.
  //
  // Chama a MESMA funcao do Postgres que o place_trade usa, de proposito: as duas
  // rotas precisam concordar exatamente. A cliente que motivou isso abria uma perna
  // por cada caminho ('eur-jpy-otc' aqui, uuid do OtcAsset la), entao guard so num
  // lado seria contornado trocando de rota. asset_match_key casa os dois formatos.
  const hedge = await prisma.$queryRaw<Array<{ symbol: string | null }>>`
    SELECT public.opposite_open_leg(
      ${input.accountId}::uuid, ${input.assetId}, ${input.direction}
    ) AS symbol
  `
  if (hedge[0]?.symbol) throw new Error('HEDGE_BLOCKED')

  let entryPrice       = input.entryPrice
  let entryPriceSource: PriceSource = PriceSource.CLIENT

  if (opts?.serverPricedLive) {
    entryPriceSource = PriceSource.SERVER
  } else if (isServerAuthoritative(input.assetId, input.assetSymbol)) {
    const serverPrice = await readServerPrice(input.assetId, input.assetSymbol)
    if (serverPrice == null) throw new Error('PRICE_UNAVAILABLE')
    const drift = Math.abs(input.entryPrice - serverPrice) / serverPrice
    if (drift > ENTRY_PRICE_TOLERANCE) throw new Error('PRICE_DIVERGED')
    entryPrice       = serverPrice
    entryPriceSource = PriceSource.SERVER
  }

  const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000)

  // Payout autoritativo: nunca acima do maior payout legitimo (92%). Defesa contra
  // payout inflado caso esta rota seja usada (o RPC place_trade ja aplica o mesmo teto).
  const authPayout = Math.min(input.payout, 92)

  const [operation] = await prisma.$transaction([
    prisma.operation.create({
      data: {
        accountId:   input.accountId,
        assetId:     input.assetId,
        assetSymbol: input.assetSymbol,
        direction:   input.direction,
        amount:      input.amount,
        payoutPct:   authPayout,
        entryPrice,
        entryPriceSource,
        expiresAt,
      },
    }),
    prisma.account.update({
      where: { id: input.accountId },
      data:  { balance: { decrement: input.amount } },
    }),
    prisma.transaction.create({
      data: {
        accountId:   input.accountId,
        type:        'TRADE_LOSS',
        amount:      -input.amount,
        description: `Operacao aberta: ${input.assetSymbol} ${input.direction}`,
      },
    }),
  ])

  scheduleExpiry(operation.id, input.expiresInSeconds)

  return operation
}

// Liquida uma operacao OPEN: calcula exitPrice, atualiza status, credita conta se ganhou.
// Idempotente: se nao for OPEN (ja liquidada ou inexistente), retorna sem fazer nada.
//
// Dois motores server-side, escolhidos por IDENTIDADE do ativo:
//   - OTC (asset_symbol no set server-authoritative): preco do Redis (engine sintetica).
//   - LIVE (asset_id em market_assets, ex. 'btc', 'eur-usd'): preco de live_prices,
//     espelhando o settle_trade do Supabase — que o navegador continua podendo chamar;
//     quem chegar primeiro liquida, o outro vira no-op (guard status='OPEN').
// A classificacao LIVE vem PRIMEIRO e por asset_id, nunca por simbolo: 'EUR/USD'
// canonizaria pra 'EURUSD-OTC' (ativo OTC real) e cairia no feed sintetico errado.
//
// Retorno: 'SETTLED' = operacao resolvida (por nos ou por outro motor);
//          'SKIPPED' = continua OPEN (sem preco fresco / condicoes nao atendidas)
//          — o sweeper decide o DRAW apos o grace period.
//
// Eh chamada tanto pelo setTimeout (caminho feliz) quanto pelo sweeper (caminho de
// recuperacao apos restart do container, que perde os setTimeout em memoria).
export type SettleResult = 'SETTLED' | 'SKIPPED'

export async function settleOperation(operationId: string): Promise<SettleResult> {
  await ensureFreshSymbols()
  await ensureFreshLiveAssets()

  const op = await prisma.operation.findUnique({ where: { id: operationId } })
  if (!op || op.status !== 'OPEN') return 'SETTLED'  // ja resolvida: nada a fazer

  if (isLiveAssetId(op.assetId)) return settleLiveOperation(op)

  const assetSymbol = op.assetSymbol

  // Non-OTC (e nao-live): nao auto-liquida. Cliente eh responsavel via
  // supabase.rpc('settle_trade'). Se nao liquidar, sweeper trata depois do
  // grace period (DRAW = refund).
  if (!isServerAuthoritative(op.assetId, assetSymbol)) return 'SKIPPED'

  const entryPrice = Number(op.entryPrice)
  const amount     = Number(op.amount)
  const payout     = Number(op.payoutPct)
  const direction  = op.direction

  // OTC: preco autoritativo do Redis.
  //
  // Sem preco NAO se inventa mais um. A versao antiga sorteava um random walk de
  // +-0.5% em torno da entrada e gravava como FALLBACK — 124 operacoes de conta REAL
  // foram decididas por moeda ao ar. Agora devolve SKIPPED: o sweeper aplica o grace
  // e reembolsa como DRAW, que e o que settleOrphanAsDraw ja documenta ("o sistema
  // nao tem como saber qual era o preco no momento exato da expiracao").
  //
  // Nao abre opcao gratis: o cliente nao controla a disponibilidade do Redis, e o
  // motor publica preco a cada 2s — inclusive de par fora de sessao que ainda tenha
  // posicao aberta (otc/engine.ts).
  const serverPrice = await readServerPrice(op.assetId, assetSymbol)
  if (serverPrice == null) {
    console.error(`[operations] OTC sem preco no Redis, liquidacao adiada: ${op.id} (${assetSymbol})`)
    return 'SKIPPED'
  }
  const exitPrice       = serverPrice
  const exitPriceSource = PriceSource.SERVER

  const won =
    (direction === 'CALL' && exitPrice > entryPrice) ||
    (direction === 'PUT'  && exitPrice < entryPrice)

  // LOST grava -amount, igual ao settle_trade do Supabase e ao settleLiveOperation
  // abaixo. profit e a UNICA fonte de P&L (admin_dashboard_stats soma profit<0 pra
  // achar o ganho da casa); gravar 0 aqui apagava o lucro do relatorio. O saldo
  // nunca foi afetado — na derrota o stake ja saiu na abertura e nao ha lancamento.
  const profit   = won ? parseFloat((amount * (payout / 100)).toFixed(2)) : -amount
  const closedAt = new Date()

  const auditHash = computeAuditHash({
    operationId, entryPrice, exitPrice, direction, amount, payout,
    openedAt: op.createdAt, closedAt,
  })

  // Liquidacao atomica e idempotente: so age se a operacao ainda estiver OPEN.
  // Se o outro motor (RPC settle_trade do cliente) ja liquidou no mesmo instante,
  // updateMany afeta 0 linhas e saimos sem creditar — evita credito dobrado.
  await prisma.$transaction(async (tx) => {
    const settled = await tx.operation.updateMany({
      where: { id: operationId, status: 'OPEN' },
      data: {
        status:    won ? 'WON' : 'LOST',
        exitPrice,
        exitPriceSource,
        auditHash,
        profit,
        closedAt,
      },
    })
    if (settled.count === 0) return  // outro caminho liquidou primeiro

    if (won) {
      await tx.account.update({
        where: { id: op.accountId },
        data:  { balance: { increment: amount + profit } },
      })
      await tx.transaction.create({
        data: {
          accountId:   op.accountId,
          type:        'TRADE_WIN',
          amount:      amount + profit,
          description: `Operacao encerrada: ganho de R$${profit.toFixed(2)}`,
          operationId,
        },
      })
    }
  })

  return 'SETTLED'
}

// Liquidacao server-authoritative de ativo LIVE (forex Kraken / cripto Binance).
// Espelha EXATAMENTE a semantica do settle_trade do Supabase (snapshot em
// sql/2026-07-09-rpc-snapshot-live-settlement.sql): mesmo feed (live_prices),
// empate = DRAW + reembolso integral, profit = -amount no LOST. Os dois motores
// correm em paralelo; o guard status='OPEN' garante que so um credita.
async function settleLiveOperation(
  op: NonNullable<Awaited<ReturnType<typeof prisma.operation.findUnique>>>,
): Promise<SettleResult> {
  const now         = Date.now()
  const expiresAtMs = op.expiresAt.getTime()

  // Todas as condicoes precisam valer; senao SKIPPED. NUNCA fallback random-walk
  // para live — preco indisponivel vira DRAW/refund via sweeper, nao preco inventado.
  if (!liveAssetsEnabled()) return 'SKIPPED'

  // Gate de seguranca: so liquida a preco se a ENTRADA foi precificada pelo
  // servidor (place_trade ou integracao). Uma op live com entry CLIENT (forjavel
  // via POST /operations) liquidada contra o preco real seria WIN garantido.
  if (op.entryPriceSource !== PriceSource.SERVER) return 'SKIPPED'

  if (now < expiresAtMs) return 'SKIPPED'                           // ainda nao venceu
  if (now - expiresAtMs > LIVE_SETTLE_MAX_LATE_MS) return 'SKIPPED' // preco atual ja nao representa o vencimento

  const exitPrice = await readLivePrice(op.assetId)
  if (exitPrice == null) return 'SKIPPED'  // preco velho/ausente: nao liquidar com preco parado

  const entryPrice = Number(op.entryPrice)
  const amount     = Number(op.amount)
  const payout     = Number(op.payoutPct)

  let status: 'WON' | 'LOST' | 'DRAW'
  let profit: number
  if ((op.direction === 'CALL' && exitPrice > entryPrice) ||
      (op.direction === 'PUT'  && exitPrice < entryPrice)) {
    status = 'WON';  profit = parseFloat((amount * (payout / 100)).toFixed(2))
  } else if (exitPrice === entryPrice) {
    status = 'DRAW'; profit = 0
  } else {
    status = 'LOST'; profit = -amount
  }

  const closedAt  = new Date()
  const auditHash = computeAuditHash({
    operationId: op.id, entryPrice, exitPrice, direction: op.direction,
    amount, payout, openedAt: op.createdAt, closedAt,
  })

  await prisma.$transaction(async (tx) => {
    const settled = await tx.operation.updateMany({
      where: { id: op.id, status: 'OPEN' },
      data: {
        status,
        exitPrice,
        exitPriceSource: PriceSource.SERVER,
        auditHash,
        profit,
        closedAt,
      },
    })
    if (settled.count === 0) return  // settle_trade do navegador chegou primeiro

    if (status === 'WON') {
      await tx.account.update({
        where: { id: op.accountId },
        data:  { balance: { increment: amount + profit } },
      })
      await tx.transaction.create({
        data: {
          accountId:   op.accountId,
          type:        'TRADE_WIN',
          amount:      amount + profit,
          description: `Operacao encerrada: ganho de R$${profit.toFixed(2)}`,
          operationId: op.id,
        },
      })
    } else if (status === 'DRAW') {
      await tx.account.update({
        where: { id: op.accountId },
        data:  { balance: { increment: amount } },  // reembolso integral
      })
      await tx.transaction.create({
        data: {
          accountId:   op.accountId,
          type:        'TRADE_DRAW',
          amount,
          description: 'Operacao empatada: valor devolvido',
          operationId: op.id,
        },
      })
    }
    // LOST: stake ja debitado na abertura; nenhum lancamento adicional.
  })

  return 'SETTLED'
}

// Liquida uma operacao non-OTC orfa como DRAW (devolve o valor da entrada).
// Usado pelo sweeper quando o cliente nao liquidou apos grace period (provavelmente
// fechou o navegador). DRAW eh mais justo que LOSS pra essa situacao: o sistema
// nao tem como saber qual era o preco no momento exato da expiracao.
async function settleOrphanAsDraw(operationId: string): Promise<void> {
  const op = await prisma.operation.findUnique({ where: { id: operationId } })
  if (!op || op.status !== 'OPEN') return

  const amount     = Number(op.amount)
  const entryPrice = Number(op.entryPrice)
  const closedAt   = new Date()

  // Audit hash mesmo pra DRAW: documenta que a settlement foi automatica/expirada.
  const auditHash = computeAuditHash({
    operationId, entryPrice, exitPrice: entryPrice, direction: op.direction,
    amount, payout: Number(op.payoutPct),
    openedAt: op.createdAt, closedAt,
  })

  await prisma.$transaction(async (tx) => {
    const settled = await tx.operation.updateMany({
      where: { id: operationId, status: 'OPEN' },
      data: {
        status:          'DRAW',
        exitPrice:       entryPrice,  // sem info, marca = entry (movimento zero)
        exitPriceSource: PriceSource.FALLBACK,
        auditHash,
        profit:          0,
        closedAt,
      },
    })
    if (settled.count === 0) return  // ja liquidada por outro caminho

    await tx.account.update({
      where: { id: op.accountId },
      data:  { balance: { increment: amount } },  // refund integral
    })
    await tx.transaction.create({
      data: {
        accountId:   op.accountId,
        type:        'TRADE_DRAW',
        amount,
        description: `Operacao expirada sem liquidacao (cliente offline) - valor devolvido`,
        operationId,
      },
    })
  })
}

function scheduleExpiry(operationId: string, expiresInSeconds: number) {
  setTimeout(() => {
    settleOperation(operationId).catch(err =>
      console.error('[expiry] erro ao resolver operacao:', operationId, err)
    )
  }, expiresInSeconds * 1000)
}

// Sweeper: roda periodicamente buscando operacoes OPEN cuja expires_at ja passou.
// Garante que operacoes nao ficam orfas se o container reiniciar (perdendo
// os setTimeout em memoria). Tambem cobre janela em que o setTimeout falha
// silenciosamente por qualquer motivo. Idempotente — settleOperation eh no-op
// se a operacao ja nao estiver OPEN.
let sweeperTimer: NodeJS.Timeout | null = null

// Grace period antes do sweeper liquidar uma operacao non-OTC orfa como DRAW.
// Da tempo do cliente liquidar via supabase.rpc apos um F5 / reconexao.
const NON_OTC_ORPHAN_GRACE_MS = 2 * 60 * 1000  // 2 minutos

export function startOrphanSweeper(intervalMs = 30_000): void {
  if (sweeperTimer) return
  console.log(`[operations] orphan sweeper started (every ${intervalMs}ms)`)

  const tick = async () => {
    try {
      await ensureFreshSymbols()     // precisa pra classificar OTC vs non-OTC corretamente
      await ensureFreshLiveAssets()  // idem pra classificar LIVE por asset_id

      const now = new Date()
      const orphans = await prisma.operation.findMany({
        where:  { status: 'OPEN', expiresAt: { lte: now } },
        select: { id: true, assetId: true, assetSymbol: true, expiresAt: true },
        take:   100,  // limite de seguranca por iteracao
      })
      if (orphans.length === 0) return

      let otcSettled = 0
      let liveSettled = 0
      let drawRefunded = 0
      let waitingGrace = 0

      // Grace/DRAW: rede de seguranca pra op que nenhum motor conseguiu liquidar.
      const drawAfterGrace = async (opId: string, expiredForMs: number) => {
        if (expiredForMs >= NON_OTC_ORPHAN_GRACE_MS) {
          await settleOrphanAsDraw(opId).catch(err =>
            console.error('[operations] sweep DRAW failed:', opId, err?.message ?? err)
          )
          drawRefunded++
        } else {
          waitingGrace++
        }
      }

      for (const op of orphans) {
        const expiredForMs = now.getTime() - op.expiresAt.getTime()

        // LIVE primeiro, por asset_id ('btc', 'eur-usd'): 'EUR/USD' canonizaria
        // pra 'EURUSD-OTC' no teste de simbolo e cairia no feed sintetico errado.
        if (isLiveAssetId(op.assetId)) {
          let result: SettleResult = 'SKIPPED'
          try { result = await settleOperation(op.id) }
          catch (err: any) { console.error('[operations] sweep LIVE settle failed:', op.id, err?.message ?? err) }
          if (result === 'SETTLED') liveSettled++
          else await drawAfterGrace(op.id, expiredForMs)
        } else if (isServerAuthoritative(op.assetId, op.assetSymbol)) {
          // OTC: liquida com o preco do Redis. Se o preco nao estiver la, settleOperation
          // devolve SKIPPED em vez de inventar um — cai no grace/DRAW como o ramo LIVE,
          // senao a operacao ficaria OPEN pra sempre.
          let result: SettleResult = 'SKIPPED'
          try { result = await settleOperation(op.id) }
          catch (err: any) { console.error('[operations] sweep OTC settle failed:', op.id, err?.message ?? err) }
          if (result === 'SETTLED') otcSettled++
          else await drawAfterGrace(op.id, expiredForMs)
        } else {
          // Non-OTC sem motor server-side: cliente eh quem liquida. Grace antes de refund.
          await drawAfterGrace(op.id, expiredForMs)
        }
      }

      const parts: string[] = []
      if (otcSettled)    parts.push(`${otcSettled} OTC settled`)
      if (liveSettled)   parts.push(`${liveSettled} LIVE settled`)
      if (drawRefunded)  parts.push(`${drawRefunded} non-OTC refunded as DRAW`)
      if (waitingGrace)  parts.push(`${waitingGrace} non-OTC waiting grace`)
      if (parts.length)  console.log(`[operations] sweep: ${parts.join(', ')}`)
    } catch (err: any) {
      console.error('[operations] sweep error:', err?.message ?? err)
    }
  }

  sweeperTimer = setInterval(tick, intervalMs)
  // Roda uma vez no startup pra limpar backlog acumulado.
  tick()

  const stop = () => { if (sweeperTimer) clearInterval(sweeperTimer); sweeperTimer = null }
  process.once('SIGTERM', stop)
  process.once('SIGINT',  stop)
}

export async function listOperations(userId: string, accountId?: string) {
  const accounts = await prisma.account.findMany({
    where:  { userId },
    select: { id: true },
  })
  const accountIds = accounts.map(a => a.id)

  if (accountId && !accountIds.includes(accountId)) throw new Error('ACCOUNT_NOT_FOUND')

  return prisma.operation.findMany({
    where:   { accountId: accountId ? accountId : { in: accountIds } },
    orderBy: { createdAt: 'desc' },
    take:    50,
  })
}

export async function getOperation(userId: string, operationId: string) {
  const op = await prisma.operation.findUnique({
    where:   { id: operationId },
    include: { account: { select: { userId: true } } },
  })
  if (!op || op.account.userId !== userId) throw new Error('NOT_FOUND')
  return op
}
