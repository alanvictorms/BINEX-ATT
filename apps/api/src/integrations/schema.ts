import { z } from 'zod'

// Request que o backend do PulseHacker envia para abrir um trade em nome do lead.
// NAO recebe entryPrice nem payout: ambos sao resolvidos server-side (preco do
// Redis + payout do OtcAsset) — assim o chamador nunca consegue inflar payout
// nem divergir o preco, e some o erro PRICE_DIVERGED.
export const integrationOperationSchema = z.object({
  // Usuario da Vertex (sub do Supabase Auth da Vertex), mapeado no PulseHacker.
  vertexUserId:     z.string().uuid(),
  accountType:      z.enum(['DEMO', 'REAL']),
  // Simbolo do ativo. Aceita forma canonica (ETHUSD-OTC) ou amigavel (ETH/USD);
  // o service canonicaliza e exige que seja um OTC ACTIVE (server-authoritative).
  assetSymbol:      z.string().min(1).max(40),
  direction:        z.enum(['CALL', 'PUT']),
  amount:           z.number().positive().multipleOf(0.01),
  expiresInSeconds: z.number().int().min(5).max(3600),
  // Chave unica por intencao de trade (ex: `${leadId}:${signalId}`) — anti duplo-clique.
  idempotencyKey:   z.string().min(8).max(128),
  // Mercado EXPLICITO. 'LIVE' abre em ativo real (market_assets: BTC, ETH, SOL,
  // XRP, BNB, EUR/USD, GBP/USD) com preco de live_prices e liquidacao server-side.
  // Ausente ou 'OTC' = comportamento original (OTC only). Explicito porque o mesmo
  // simbolo ('EUR/USD') existe legitimamente nos dois mercados — nunca adivinhar.
  market:           z.enum(['OTC', 'LIVE']).optional(),
})

export type IntegrationOperationInput = z.infer<typeof integrationOperationSchema>

/**
 * String canonica assinada por HMAC. Cliente (PulseHacker) e servidor (Vertex)
 * DEVEM montar exatamente esta mesma string, nesta ordem, a partir dos campos.
 * Qualquer mudanca aqui e um breaking change na integracao.
 *
 * `market` so entra na string QUANDO PRESENTE no body: assinaturas do PulseHacker
 * atual (sem o campo) continuam validas, e um atacante nao consegue injetar nem
 * remover o campo em transito sem quebrar o HMAC.
 */
export function buildOperationMessage(input: IntegrationOperationInput): string {
  const parts = [
    input.idempotencyKey,
    input.vertexUserId,
    input.accountType,
    input.assetSymbol,
    input.direction,
    input.amount.toFixed(2),
    String(input.expiresInSeconds),
  ]
  if (input.market !== undefined) parts.push(input.market)
  return parts.join('|')
}
