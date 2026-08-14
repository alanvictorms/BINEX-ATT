import { z } from 'zod'

export const createOperationSchema = z.object({
  accountId:        z.string().uuid(),
  assetId:          z.string().min(1),
  assetSymbol:      z.string().min(1),
  direction:        z.enum(['CALL', 'PUT']),
  amount:           z.number().positive().multipleOf(0.01),
  payout:           z.number().int().min(1).max(99),
  entryPrice:       z.number().positive(),
  expiresInSeconds: z.number().int().min(5).max(3600),
})

export type CreateOperationInput = z.infer<typeof createOperationSchema>
