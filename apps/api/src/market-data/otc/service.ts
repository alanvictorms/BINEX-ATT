import { prisma } from '../../prisma.js'
import type { CreateOtcAssetInput, UpdateOtcAssetInput } from './schema.js'

export async function listOtcAssets() {
  return prisma.otcAsset.findMany({ orderBy: { symbol: 'asc' } })
}

export async function getOtcAsset(id: string) {
  const asset = await prisma.otcAsset.findUnique({ where: { id } })
  if (!asset) throw new Error('NOT_FOUND')
  return asset
}

export async function createOtcAsset(input: CreateOtcAssetInput) {
  const symbol = input.symbol.toUpperCase()
  const existing = await prisma.otcAsset.findUnique({ where: { symbol } })
  if (existing) throw new Error('SYMBOL_ALREADY_EXISTS')

  return prisma.otcAsset.create({
    data: {
      symbol,
      name:            input.name,
      basePrice:       input.basePrice,
      volatility:      input.volatility       ?? 0.0010,
      trend:           input.trend            ?? 0,
      payout:          input.payout           ?? 85,
      decimals:        input.decimals         ?? 5,
      status:          input.status           ?? 'ACTIVE',
      sessionStartUtc: input.sessionStartUtc  ?? null,
      sessionEndUtc:   input.sessionEndUtc    ?? null,
    },
  })
}

export async function updateOtcAsset(id: string, input: UpdateOtcAssetInput) {
  await getOtcAsset(id)
  return prisma.otcAsset.update({ where: { id }, data: input })
}

export async function deleteOtcAsset(id: string) {
  await getOtcAsset(id)
  await prisma.otcAsset.delete({ where: { id } })
  return { ok: true }
}

export async function toggleOtcAsset(id: string) {
  const asset = await getOtcAsset(id)
  return prisma.otcAsset.update({
    where: { id },
    data:  { status: asset.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
  })
}
