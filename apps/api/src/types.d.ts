import type { FastifyRequest, FastifyReply } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void>
    requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void>
  }

  interface FastifyRequest {
    // Payload do JWT do Supabase apos verificacao via JWKS.
    user?: {
      sub:   string
      email?: string
      aud?:  string | string[]
      role?: string
      exp?:  number
      iat?:  number
      [key: string]: unknown
    }
  }
}
