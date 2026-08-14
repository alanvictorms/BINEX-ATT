import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import websocket from '@fastify/websocket'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { authRoutes } from './auth/routes.js'
import { operationRoutes } from './operations/routes.js'
import { accountRoutes } from './accounts/routes.js'
import { otcAdminRoutes, otcPublicRoutes } from './market-data/otc/routes.js'
import { forexCandlesRoutes } from './market-data/forexCandlesRoutes.js'
import { cryptoCandlesRoutes } from './market-data/cryptoCandlesRoutes.js'
import { otcWsRoutes } from './market-data/otc/ws-routes.js'
import { auditRoutes } from './admin/audit.js'
import { copyRoutes } from './copy/routes.js'
import { copyAdminRoutes } from './copy/admin-routes.js'
import { integrationRoutes } from './integrations/routes.js'
import { prisma } from './prisma.js'

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' } })

  // ── Plugins ───────────────────────────────────────────────────────────────
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.FRONTEND_URL ?? '').split(',').map(o => o.trim()).filter(Boolean),
  ]
  function isOriginAllowed(origin: string): boolean {
    if (allowedOrigins.some(o => origin.startsWith(o))) return true
    try {
      const host = new URL(origin).hostname
      if (host.endsWith('.easypanel.host')) return true
      if (host.endsWith('.vercel.app'))     return true
    } catch { /* origin malformado */ }
    return false
  }
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || isOriginAllowed(origin)) return cb(null, true)
      app.log.warn({ origin }, 'CORS rejected origin')
      cb(new Error('Not allowed by CORS'), false)
    },
    credentials: true,
  })

  await app.register(cookie)
  await app.register(websocket)

  // ── JWT via JWKS (Supabase Auth) ──────────────────────────────────────────
  // Supabase migrou para chaves assimetricas (ECC P-256). O JWKS endpoint expoe
  // a chave atual + chaves anteriores ainda usadas para verificar tokens nao expirados.
  // jose cacheia o JWKS em memoria e revalida automaticamente quando aparece um
  // 'kid' desconhecido. Sem precisar de segredo no .env.
  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) throw new Error('SUPABASE_URL precisa estar no .env (ex: https://yilmbwrfaljxgvsygmyz.supabase.co)')
  const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`))

  // ── Auth decorator ─────────────────────────────────────────────────────────
  app.decorate('authenticate', async (req: any, reply: any) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'UNAUTHORIZED' })
    }
    const token = header.slice(7).trim()
    try {
      const { payload } = await jwtVerify(token, jwks, {
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256', 'HS256'],
      })
      req.user = payload as JWTPayload & { sub: string; email?: string }
    } catch (err: any) {
      req.log.debug({ err: err.message }, 'JWT verify failed')
      return reply.status(401).send({ error: 'UNAUTHORIZED' })
    }
  })

  // ── Admin guard ───────────────────────────────────────────────────────────
  app.decorate('requireAdmin', async (req: any, reply: any) => {
    const sub = req.user?.sub as string | undefined
    if (!sub) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const admin = await prisma.adminUser.findUnique({ where: { userId: sub } })
    if (!admin) return reply.status(403).send({ error: 'FORBIDDEN' })
  })

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // ── Routes ────────────────────────────────────────────────────────────────
  await app.register(authRoutes,       { prefix: '/auth' })
  await app.register(operationRoutes,  { prefix: '/operations' })
  await app.register(accountRoutes,    { prefix: '/accounts' })
  await app.register(otcPublicRoutes,  { prefix: '/market-data/otc' })
  await app.register(forexCandlesRoutes, { prefix: '/market-data/forex' })
  await app.register(cryptoCandlesRoutes, { prefix: '/market-data/crypto' })
  await app.register(otcAdminRoutes,   { prefix: '/admin/otc' })
  await app.register(auditRoutes,      { prefix: '/admin/audit' })
  await app.register(copyRoutes,       { prefix: '/copy' })
  await app.register(copyAdminRoutes,  { prefix: '/admin/copy' })
  await app.register(integrationRoutes,{ prefix: '/integrations' })
  await app.register(otcWsRoutes,      { prefix: '/ws' })

  return app
}
