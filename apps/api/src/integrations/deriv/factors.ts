// Fator de normalizacao congelado, por ativo OTC.
//
// POR QUE CONGELAR
// O preco OTC e sintetico e caminha o tempo todo (engine + rng.ts). O fator que
// alinha a serie da Deriv ao nosso nivel de preco e `precoVivoOTC / closeDeriv`.
// Se ele for recalculado a cada leitura, o MESMO candle de dois meses atras
// devolve um valor diferente a cada request — o historico "respira" e, como
// operacao liquida contra preco, isso vira problema de correcao.
//
// Congelando uma unica vez por ativo, qualquer leitura (backfill ou proxy ao
// vivo) e deterministica: mesma entrada, mesma saida, sempre.
//
// Guardado em app_config (key/value JSONB que ja existia) pra nao precisar de
// migracao no schema.

import { prisma } from '../../prisma.js'

export const FACTORS_KEY = 'otc:deriv:factors'

export interface FrozenFactor {
  factor:      number
  derivSymbol: string
  /** Preco OTC usado como alvo no momento do congelamento — so pra auditoria. */
  target:      number
  frozenAt:    string
}

export type FactorMap = Record<string, FrozenFactor>

export async function loadFactors(): Promise<FactorMap> {
  const row = await prisma.appConfig.findUnique({ where: { key: FACTORS_KEY } })
  const val = row?.value as unknown
  if (!val || typeof val !== 'object' || Array.isArray(val)) return {}
  return val as FactorMap
}

export async function saveFactors(map: FactorMap): Promise<void> {
  await prisma.appConfig.upsert({
    where:  { key: FACTORS_KEY },
    create: { key: FACTORS_KEY, value: map as any },
    update: { value: map as any },
  })
}

/**
 * Devolve o fator congelado do ativo. Se ainda nao existir, congela com o valor
 * calculado agora e persiste — a partir dai todo mundo le o mesmo numero.
 */
export async function getOrFreezeFactor(
  otcSymbol: string,
  derivSymbol: string,
  compute: () => Promise<{ factor: number; target: number }>,
): Promise<FrozenFactor> {
  const map = await loadFactors()
  const existing = map[otcSymbol]
  if (existing && Number.isFinite(existing.factor) && existing.factor > 0) return existing

  const { factor, target } = await compute()
  const frozen: FrozenFactor = {
    factor, derivSymbol, target, frozenAt: new Date().toISOString(),
  }
  // Rele antes de gravar: reduz a janela de corrida entre dois processos
  // congelando o mesmo ativo ao mesmo tempo.
  const fresh = await loadFactors()
  if (fresh[otcSymbol]) return fresh[otcSymbol]
  fresh[otcSymbol] = frozen
  await saveFactors(fresh)
  return frozen
}
