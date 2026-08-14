import type { WebSocket } from '@fastify/websocket'
import { redisSub } from '../../redis.js'

const CHANNEL_PREFIX = 'otc:tick:'

const clients      = new Map<string, Set<WebSocket>>()
const ipConnCount  = new Map<string, number>()
const MAX_CONN_IP  = 10

let initialized = false

export async function initOtcHub() {
  if (initialized) return
  initialized = true

  await redisSub.psubscribe(`${CHANNEL_PREFIX}*`)
  redisSub.on('pmessage', (_pattern, channel, message) => {
    const symbol = channel.slice(CHANNEL_PREFIX.length)
    const sockets = clients.get(symbol)
    if (!sockets || sockets.size === 0) return
    for (const ws of sockets) {
      try {
        if (ws.readyState === 1 /* OPEN */) ws.send(message)
      } catch { /* ignora cliente quebrado */ }
    }
  })

  console.log(`[otc-hub] subscribed to ${CHANNEL_PREFIX}*`)
}

export function attachClient(symbol: string, ws: WebSocket, ip: string): { ok: true } | { ok: false; reason: string } {
  const current = ipConnCount.get(ip) ?? 0
  if (current >= MAX_CONN_IP) return { ok: false, reason: 'TOO_MANY_CONNECTIONS' }

  let set = clients.get(symbol)
  if (!set) { set = new Set(); clients.set(symbol, set) }
  set.add(ws)
  ipConnCount.set(ip, current + 1)

  const cleanup = () => {
    set!.delete(ws)
    if (set!.size === 0) clients.delete(symbol)
    const c = (ipConnCount.get(ip) ?? 1) - 1
    if (c <= 0) ipConnCount.delete(ip); else ipConnCount.set(ip, c)
  }
  ws.on('close', cleanup)
  ws.on('error', cleanup)
  return { ok: true }
}

export function hubStats() {
  const perSymbol: Record<string, number> = {}
  for (const [s, set] of clients) perSymbol[s] = set.size
  return { symbols: perSymbol, totalConnections: [...clients.values()].reduce((a, s) => a + s.size, 0) }
}
