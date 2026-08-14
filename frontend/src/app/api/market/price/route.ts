import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const cache = new Map<string, { price: number; ts: number; stale?: boolean; ageMs?: number }>()

// Cliente Supabase (anon) para ler live_prices. live_prices tem RLS read-all,
// entao a anon key basta. So leitura.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// Le o preco forex publicado pelo vertex-api em live_prices (centralizado:
// nenhum navegador chama provider direto). live_prices.symbol guarda o simbolo
// do provider (ex: 'EUR/USD'). O publisher atualiza a cada 5s (Kraken); rejeita
// se ausente ou muito velho (>60s), pro caller cair no fallback direto.
async function readLivePrice(symbol: string): Promise<{ price: number; ageMs: number }> {
  const { data, error } = await supabase
    .from('live_prices')
    .select('price, updated_at')
    .eq('symbol', symbol)
    .maybeSingle()
  if (error || !data) throw new Error('live_prices: sem registro')
  const ageMs = Date.now() - new Date(data.updated_at as string).getTime()
  if (ageMs > 60_000) throw new Error('live_prices: preco velho')
  const price = Number(data.price)
  if (!price || isNaN(price)) throw new Error('live_prices: preco invalido')
  // ageMs sai na resposta: o gate de "prova de vida" do WS forex no chart usa
  // a idade REAL (frescor de liquidacao ~15s), nao os 60s de tolerancia de
  // exibicao acima — sem isso o grafico seguia vivo ate ~85s com o publisher
  // morto antes de congelar.
  return { price, ageMs }
}

// TTLs diferenciados por fonte. 'twelvedata' na pratica le da live_prices
// (barato, atualizada a cada 5s pelo Kraken) — o Twelve Data direto so roda
// como fallback e tem throttle proprio (abaixo). Binance/Yahoo nao tem cota.
const CACHE_TTL: Record<string, number> = {
  binance:    10_000,  // 10s — cripto se move rapido
  yahoo:      15_000,  // 15s — fallback legado
  twelvedata: 4_000,   // 4s — leitura da live_prices (Kraken publica a cada 5s)
}

// Fallback direto no Twelve Data (cota 800/dia): no maximo 1 chamada a cada
// 120s por simbolo — senao o TTL de 4s estouraria a cota quando live_prices cair.
const lastDirectTd = new Map<string, number>()

// Ultimo preco bom lido da live_prices, por simbolo. Se a leitura falhar por um
// instante (solucao do Supabase, timeout), servimos esse valor por ate 90s antes
// de apelar pro Twelve Data direto — que e OUTRO feed (2-9 pips longe do mid da
// Kraken) e descolaria a vela ao vivo do historico (que vem da mesma serie da
// live_prices). Preco parado por segundos e honesto; preco de outra fonte nao.
const lastGoodLive = new Map<string, { price: number; ts: number }>()

async function fetchYahoo(symbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  const json = await res.json()
  const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice
  if (!price) throw new Error('Yahoo Finance: no price')
  return price
}

async function fetchBinance(symbol: string): Promise<number> {
  // data-api.binance.vision: endpoint publico oficial sem bloqueio geografico
  // (api.binance.com retorna 451 para IPs dos EUA, onde roda a VPS/SFO).
  const url = `https://data-api.binance.vision/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3_000) })
  const json = await res.json()
  if (!json.price) throw new Error('Binance error')
  return parseFloat(json.price)
}

async function fetchTwelveData(symbol: string): Promise<number> {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not configured')
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5_000) })
  const json = await res.json()
  if (json.status === 'error') throw new Error(`Twelve Data: ${json.message}`)
  const price = parseFloat(json.price)
  if (!price || isNaN(price)) throw new Error('Twelve Data: invalid price')
  return price
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')
  const source = req.nextUrl.searchParams.get('source') as 'yahoo' | 'binance' | 'twelvedata' | null

  if (!symbol || !source) return NextResponse.json({ error: 'symbol and source required' }, { status: 400 })

  const cacheKey = `${source}:${symbol}`
  const cached = cache.get(cacheKey)
  const ttl = CACHE_TTL[source] ?? 15_000
  if (cached && Date.now() - cached.ts < ttl) {
    return NextResponse.json({
      price: cached.price,
      cached: true,
      stale: cached.stale || undefined,
      // idade envelhece junto com o cache — o gate do chart ve o valor real
      ageMs: cached.ageMs != null ? cached.ageMs + (Date.now() - cached.ts) : undefined,
    })
  }

  try {
    let price: number
    let ageMs: number | undefined
    if (source === 'binance') {
      price = await fetchBinance(symbol)
    } else if (source === 'twelvedata') {
      // Centralizado: le da live_prices (alimentada pelo publisher do vertex-api).
      // Fallback pro Twelve Data direto so se a tabela estiver ausente/velha,
      // com throttle de 120s p/ nao estourar a cota diaria.
      try {
        const lp = await readLivePrice(symbol)
        price = lp.price
        ageMs = lp.ageMs
        lastGoodLive.set(symbol, { price, ts: Date.now() })
      } catch {
        // Qualquer caminho daqui pra baixo NAO e a live_prices fresca: o chart
        // pode exibir o valor, mas ele nao vale como prova de vida da
        // liquidacao (gate do WebSocket do forex exige stale=false).
        const good = lastGoodLive.get(symbol)
        let stalePrice: number
        if (good && Date.now() - good.ts < 90_000) {
          stalePrice = good.price
        } else {
          const last = lastDirectTd.get(symbol) ?? 0
          if (Date.now() - last < 120_000) throw new Error('live_prices indisponivel; fallback aguardando throttle')
          lastDirectTd.set(symbol, Date.now())
          stalePrice = await fetchTwelveData(symbol)
        }
        cache.set(cacheKey, { price: stalePrice, ts: Date.now(), stale: true })
        return NextResponse.json({ price: stalePrice, stale: true })
      }
    } else {
      price = await fetchYahoo(symbol)
    }
    cache.set(cacheKey, { price, ts: Date.now(), ageMs })
    return NextResponse.json({ price, ageMs })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'fetch failed' }, { status: 502 })
  }
}
