import { prisma } from '../prisma.js'
import { redis, KEYS } from '../redis.js'
import { createOperation, getOperation } from '../operations/service.js'
import {
  ensureFreshLiveAssets, liveAssetsEnabled, readLivePrice, resolveLiveAssetBySymbol,
} from '../market-data/liveAssets.js'
import { isForexOpenAt } from '../market-data/marketHours.js'
import type { IntegrationOperationInput } from './schema.js'

// Teto de valor por ordem vinda do PulseHacker (defesa contra request malformado
// ou abuso). Configuravel por env; default conservador.
const MAX_AMOUNT = Number(process.env.PULSEHACKER_MAX_AMOUNT ?? '5000')

// Quanto tempo uma chave de idempotencia e lembrada (replay retorna a mesma op).
const IDEM_TTL_SECONDS = 24 * 60 * 60

export class IntegrationError extends Error {
  constructor(
    public code:
      | 'ASSET_NOT_FOUND'
      | 'ASSET_NOT_OTC'
      | 'ASSET_DISABLED'
      | 'MARKET_CLOSED'
      | 'LIVE_ASSETS_DISABLED'
      | 'AMOUNT_TOO_LARGE'
      | 'IDEMPOTENT_IN_PROGRESS',
  ) {
    super(code)
  }
}

// Resolve o simbolo enviado (ETH/USD, ETHUSD, ETHUSD-OTC) para um OtcAsset ACTIVE.
// Tenta a forma como veio (uppercase) e a forma canonica OTC (`<base>-OTC`).
async function resolveOtcAsset(rawSymbol: string) {
  const upper    = rawSymbol.toUpperCase()
  const stripped = upper.replace(/[\/\-\s]/g, '')
  const base     = stripped.endsWith('OTC') ? stripped.slice(0, -3) : stripped
  const candidates = Array.from(new Set([upper, `${base}-OTC`]))

  const asset = await prisma.otcAsset.findFirst({
    where: { symbol: { in: candidates }, status: 'ACTIVE' },
  })
  if (!asset) throw new IntegrationError('ASSET_NOT_FOUND')
  return asset
}

export interface IntegrationOperationResult {
  operation: Awaited<ReturnType<typeof createOperation>>
  idempotentReplay: boolean
}

// Parametros do trade ja resolvidos server-side (por um dos dois mercados).
interface ResolvedTrade {
  assetId:          string
  assetSymbol:      string
  payout:           number
  entryPrice:       number
  serverPricedLive: boolean
}

// Mercado OTC (comportamento original): OtcAsset ACTIVE + preco do Redis.
async function resolveOtcTrade(input: IntegrationOperationInput): Promise<ResolvedTrade> {
  // Ativo precisa ser OTC server-authoritative: so assim a Vertex liquida sozinha.
  const asset = await resolveOtcAsset(input.assetSymbol)

  // Preco autoritativo do Redis (mesmo que createOperation vai reler) — se a engine
  // nao estiver publicando este simbolo, falha cedo como PRICE_UNAVAILABLE.
  const cached = await redis.get(KEYS.price(asset.symbol))
  if (cached == null) throw new Error('PRICE_UNAVAILABLE')

  return {
    assetId:          asset.id,
    assetSymbol:      asset.symbol,
    payout:           asset.payout,
    entryPrice:       Number(cached),
    serverPricedLive: false,
  }
}

// Mercado LIVE (market:'LIVE'): ativo real de market_assets, preco de live_prices
// com checagem de frescor, payout autoritativo da tabela. Forex respeita o horario
// de mercado INCLUSIVE no vencimento: ordem que venceria com o mercado fechado e
// rejeitada na abertura (o navegador nao estara la pra liquidar — e o servidor
// nao deve liquidar com preco congelado de sexta).
async function resolveLiveTrade(input: IntegrationOperationInput): Promise<ResolvedTrade> {
  if (!liveAssetsEnabled()) throw new IntegrationError('LIVE_ASSETS_DISABLED')

  await ensureFreshLiveAssets()
  const asset = resolveLiveAssetBySymbol(input.assetSymbol)
  if (!asset) throw new IntegrationError('ASSET_NOT_FOUND')
  if (!asset.enabled) throw new IntegrationError('ASSET_DISABLED')

  if (asset.category === 'forex') {
    const now = Date.now()
    const expiry = new Date(now + input.expiresInSeconds * 1000)
    if (!isForexOpenAt(new Date(now)) || !isForexOpenAt(expiry)) {
      throw new IntegrationError('MARKET_CLOSED')
    }
  }

  const entryPrice = await readLivePrice(asset.id)
  if (entryPrice == null) throw new Error('PRICE_UNAVAILABLE')  // ausente OU velho demais

  return {
    assetId:          asset.id,
    assetSymbol:      asset.symbol,
    payout:           asset.payout,   // createOperation ainda aplica o teto de 92
    entryPrice,
    serverPricedLive: true,
  }
}

/**
 * Abre um trade (OTC ou LIVE) em nome de um usuario da Vertex, a pedido do
 * PulseHacker. O mercado e EXPLICITO no request (`market`): sem o campo, o
 * comportamento e o original (OTC only) — nada de fallback implicito, porque o
 * mesmo simbolo ('EUR/USD') existe legitimamente nos dois mercados.
 *
 * Reusa createOperation() (que valida conta/saldo, fixa preco/payout server-side
 * e agenda a liquidacao automatica). NAO duplica logica de liquidacao.
 *
 * Idempotente: dois requests com a mesma idempotencyKey retornam a MESMA operacao.
 */
export async function createIntegrationOperation(
  input: IntegrationOperationInput,
): Promise<IntegrationOperationResult> {
  if (input.amount > MAX_AMOUNT) throw new IntegrationError('AMOUNT_TOO_LARGE')

  // Conta do lead (DEMO/REAL). createOperation revalida o dono — checagem dupla.
  const account = await prisma.account.findUnique({
    where: { userId_type: { userId: input.vertexUserId, type: input.accountType } },
  })
  if (!account) throw new Error('ACCOUNT_NOT_FOUND')

  const trade = input.market === 'LIVE'
    ? await resolveLiveTrade(input)
    : await resolveOtcTrade(input)

  // ── Idempotencia (anti duplo-clique) ──────────────────────────────────────────
  const idemKey   = `pulsehacker:idem:${input.idempotencyKey}`
  const acquired  = await redis.set(idemKey, 'LOCK', 'EX', IDEM_TTL_SECONDS, 'NX')

  if (!acquired) {
    const stored = await redis.get(idemKey)
    if (stored && stored !== 'LOCK') {
      const existing = await prisma.operation.findUnique({ where: { id: stored } })
      if (existing) return { operation: existing, idempotentReplay: true }
    }
    // Outro request com a mesma chave ainda esta processando -> cliente deve repetir.
    throw new IntegrationError('IDEMPOTENT_IN_PROGRESS')
  }

  try {
    const operation = await createOperation(
      input.vertexUserId,
      {
        accountId:        account.id,
        assetId:          trade.assetId,
        assetSymbol:      trade.assetSymbol,
        direction:        input.direction,
        amount:           input.amount,
        payout:           trade.payout,
        entryPrice:       trade.entryPrice,
        expiresInSeconds: input.expiresInSeconds,
      },
      { serverPricedLive: trade.serverPricedLive },
    )
    // Troca o LOCK pelo id real -> replays futuros retornam esta operacao.
    await redis.set(idemKey, operation.id, 'EX', IDEM_TTL_SECONDS)
    return { operation, idempotentReplay: false }
  } catch (err) {
    // Falhou antes de criar: libera a chave pra permitir nova tentativa.
    await redis.del(idemKey)
    throw err
  }
}

/** Status de uma operacao (para o PulseHacker fazer polling do resultado). */
export async function getIntegrationOperation(vertexUserId: string, operationId: string) {
  return getOperation(vertexUserId, operationId)
}
