import { z } from 'zod'

const decimalStr = z.union([z.number(), z.string()]).transform((v) => Number(v))

export const createOtcAssetSchema = z.object({
  symbol:          z.string().min(2).max(20).regex(/^[A-Z0-9\/\-_]+$/i),
  name:            z.string().min(2).max(80),
  basePrice:       decimalStr.refine(n => n > 0, 'basePrice must be > 0'),
  volatility:      decimalStr.refine(n => n >= 0 && n <= 1, 'volatility 0..1').optional(),
  trend:           decimalStr.refine(n => n >= -1 && n <= 1, 'trend -1..1').optional(),
  payout:          z.number().int().min(1).max(99).optional(),
  decimals:        z.number().int().min(0).max(8).optional(),
  status:          z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sessionStartUtc: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  sessionEndUtc:   z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
})

export const updateOtcAssetSchema = createOtcAssetSchema.partial().omit({ symbol: true })

export type CreateOtcAssetInput = z.infer<typeof createOtcAssetSchema>
export type UpdateOtcAssetInput = z.infer<typeof updateOtcAssetSchema>
