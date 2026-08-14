import type { FastifyInstance } from 'fastify'
import { getProfile } from './service.js'

// Apos a migracao para Supabase Auth, este modulo so expoe /me.
// signup/signin/refresh/signout sao chamadas direto do frontend p/ Supabase via SDK.
export async function authRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const payload = req.user as { sub: string; email?: string }
    try {
      const profile = await getProfile(payload.sub)
      // Email vem direto do JWT (Supabase coloca no payload) -> nao precisa query extra.
      return reply.send({ user: { ...profile, email: payload.email ?? null } })
    } catch {
      return reply.status(404).send({ error: 'PROFILE_NOT_FOUND' })
    }
  })
}
