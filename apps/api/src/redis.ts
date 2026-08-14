import Redis from 'ioredis'

const url = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const redis    = new Redis(url, { lazyConnect: false })
export const redisSub = new Redis(url, { lazyConnect: false })
export const redisPub = new Redis(url, { lazyConnect: false })

redis.on('error',    (e) => console.error('[redis]    error:', e.message))
redisSub.on('error', (e) => console.error('[redisSub] error:', e.message))
redisPub.on('error', (e) => console.error('[redisPub] error:', e.message))

export const KEYS = {
  price:        (symbol: string) => `otc:price:${symbol}`,
  tickChannel:  (symbol: string) => `otc:tick:${symbol}`,
  candleBuffer: (symbol: string, tf: number) => `otc:candles:${symbol}:${tf}`,
}
