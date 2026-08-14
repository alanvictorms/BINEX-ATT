import { z } from 'zod'

export const registerSchema = z.object({
  name:     z.string().min(2, 'Nome muito curto').max(100),
  email:    z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  phone:    z.string().optional(),
  country:  z.string().optional(),
})

export const loginSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput    = z.infer<typeof loginSchema>
