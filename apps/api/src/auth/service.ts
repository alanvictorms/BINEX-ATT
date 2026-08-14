import { prisma } from '../prisma.js'

// Apos a migracao para Supabase Auth, o Fastify nao gerencia mais usuarios:
// - signup/login/refresh sao feitos pelo @supabase/supabase-js no frontend
// - bcrypt + JWT proprio foram removidos
// - este service so le profile + accounts a partir do user_id do JWT validado

export async function getProfile(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: {
      id:                true,
      name:              true,
      kycStatus:         true,
      phone:             true,
      cpf:               true,
      blockedAt:         true,
      blockedReason:     true,
      bonusBalance:      true,
      rolloverRequired:  true,
      rolloverCompleted: true,
      createdAt:         true,
      accounts: {
        select: { id: true, type: true, balance: true, currency: true },
      },
    },
  })
  if (!profile) throw new Error('PROFILE_NOT_FOUND')
  return profile
}
