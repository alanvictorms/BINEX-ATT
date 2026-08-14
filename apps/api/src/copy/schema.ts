import { z } from 'zod'

// Validacao dos campos editaveis pelo admin (catalogo de traders).
export const createCopyTraderSchema = z.object({
  name:          z.string().min(1),
  countryCode:   z.string().min(2).max(3).default('br'),
  avatarUrl:     z.string().nullable().optional(),
  vip:           z.boolean().default(false),
  paid:          z.boolean().default(false),
  accessPrice:   z.number().min(0).default(0),
  weeklyGainPct: z.number().default(0),
  copiers:       z.number().int().min(0).default(0),
  copiedTrades:  z.number().int().min(0).default(0),
  commissionPct: z.number().min(0).default(0),
  profitPct:     z.number().min(0).max(100).default(0),
  lossPct:       z.number().min(0).max(100).default(0),
  active:        z.boolean().default(true),
  displayOrder:  z.number().int().default(0),
})

export const updateCopyTraderSchema = createCopyTraderSchema.partial()

export const copyConfigSchema = z.object({
  copyTradeEnabled: z.boolean(),
})

export type CreateCopyTraderInput = z.infer<typeof createCopyTraderSchema>
export type UpdateCopyTraderInput = z.infer<typeof updateCopyTraderSchema>
