import type { FastifyInstance } from 'fastify'
import { attachClient, hubStats } from './ws-hub.js'
import { redis, KEYS } from '../../redis.js'

export async function otcWsRoutes(app: FastifyInstance) {
  app.get('/market/:symbol', { websocket: true }, async (socket, req) => {
    const { symbol } = req.params as { symbol: string }
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip

    const ok = attachClient(symbol, socket, ip)
    if (!ok.ok) {
      socket.send(JSON.stringify({ type: 'error', reason: ok.reason }))
      socket.close()
      return
    }

    // envia snapshot do preço atual imediatamente (se houver)
    const cached = await redis.get(KEYS.price(symbol))
    if (cached) {
      socket.send(JSON.stringify({ symbol, price: Number(cached), t: Math.floor(Date.now() / 1000), snapshot: true }))
    } else {
      socket.send(JSON.stringify({ type: 'info', message: 'NO_PRICE_YET' }))
    }

    // heartbeat: ping a cada 25s para evitar idle disconnect de proxies
    const ping = setInterval(() => {
      try { if (socket.readyState === 1) socket.ping() } catch { /* noop */ }
    }, 25_000)
    socket.on('close', () => clearInterval(ping))
  })

  // diagnóstico (público — sem dados sensíveis)
  app.get('/stats', async () => hubStats())
}
