import WebSocket from 'ws'
import { prisma } from '../prisma.js'
import { getCurrentPriceMemory, getTickingOtcSymbols } from './otc/engine.js'
import { isForexOpenAt, isForexOpenNow } from './marketHours.js'

// Publica precos autoritativos na tabela live_prices (Postgres Supabase, mesma
// conexao Prisma usada pelos candles). settle_trade/place_trade leem dela em vez
// de confiar no preco do cliente.
//
// Forex real (EUR/USD, GBP/USD): Kraken — mercado fiat de verdade, API publica
// gratis e sem chave. Fonte primaria: WebSocket v2 (canal ticker/bbo, ~200-270
// updates/min por par) alimentando o mid continuamente; o REST /Ticker de 5s e
// fallback automatico quando o WS esta mudo. Twelve Data e a ultima reserva
// (cota 800/dia), no maximo 1 chamada a cada 240s. Cripto via Binance.
//
// Mapeamento asset_id (operations.asset_id) <-> simbolo. Casa com:
//   - OTC:    seed-otc.ts + web/src/lib/otcClient.ts (OTC_SYMBOL_MAP)
//   - cripto: web/src/lib/marketSymbols.ts (REAL_ASSETS)

type AssetEntry = { assetId: string; symbol: string }

// OTC: a lista vem do MOTOR (getTickingOtcSymbols), não de uma constante.
//
// Ela era chumbada aqui com 10 pares e o banco tinha 14 — BTCUSD/ETHUSD/SOLUSD/
// XRPUSD-OTC nunca chegaram em live_prices. Consequência: o place_trade do
// caminho Supabase recusava esses 4 com PRICE_UNAVAILABLE (só operavam pela API
// Fastify, que lê o Redis) e a Mesa de risco não mostrava preço deles. Cadastrar
// par no admin agora basta — sem mexer em código.
//
// slug = formato de operations.asset_id / live_prices.asset_id no caminho Supabase.
// Regra: 'EURUSD-OTC' → 'eur-usd-otc' (miolo de 6 chars = 3+3), que é o inverso
// exato da expressão usada pelo place_trade:
//   upper(replace(replace(asset_id,'-otc',''),'-','')) || '-OTC' = symbol
// Par que não siga o formato entra em OTC_SLUG_OVERRIDES.
const OTC_SLUG_OVERRIDES: Record<string, string> = {}
const otcSlugWarned = new Set<string>()

function otcSlug(symbol: string): string | null {
  const override = OTC_SLUG_OVERRIDES[symbol.toUpperCase()]
  if (override) return override
  const core = symbol.replace(/-OTC$/i, '')
  if (core.length !== 6) {
    if (!otcSlugWarned.has(symbol)) {
      otcSlugWarned.add(symbol)
      console.error(`[live-prices] ${symbol}: símbolo OTC fora do formato XXXYYY-OTC — sem slug pra live_prices. Adicione em OTC_SLUG_OVERRIDES.`)
    }
    return null
  }
  return `${core.slice(0, 3)}-${core.slice(3)}-otc`.toLowerCase()
}

const CRYPTO_ASSETS: AssetEntry[] = [
  { assetId: 'btc', symbol: 'BTCUSDT' },
  { assetId: 'eth', symbol: 'ETHUSDT' },
  { assetId: 'sol', symbol: 'SOLUSDT' },
  { assetId: 'xrp', symbol: 'XRPUSDT' },
  { assetId: 'bnb', symbol: 'BNBUSDT' },
]

// Forex real: SOMENTE o publisher busca o preco. O gráfico lê da live_prices
// (centralizado) -> nenhum navegador consome cota de provider.
const FOREX_ASSETS: AssetEntry[] = [
  { assetId: 'eur-usd', symbol: 'EUR/USD' },
  { assetId: 'gbp-usd', symbol: 'GBP/USD' },
]

// Kraken retorna as chaves do result em formato interno (ZEURZUSD) ou altname
// (EURUSD) dependendo do par — aceita ambas.
const KRAKEN_KEYS: Record<string, string[]> = {
  'eur-usd': ['ZEURZUSD', 'EURUSD'],
  'gbp-usd': ['ZGBPZUSD', 'GBPUSD'],
}

type PriceRow = { assetId: string; symbol: string; price: number; source: string }

// Upsert batch via Prisma raw. assetId/symbol/source sao constantes do servidor
// (nao input de usuario) e price e number validado -> sem vetor de injecao.
async function upsert(rows: PriceRow[]) {
  const valid = rows.filter(r => Number.isFinite(r.price) && r.price > 0)
  if (valid.length === 0) return
  const values = valid
    .map(r => `('${r.assetId}','${r.symbol}',${r.price},'${r.source}',now())`)
    .join(',')
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO live_prices (asset_id, symbol, price, source, updated_at)
       VALUES ${values}
       ON CONFLICT (asset_id) DO UPDATE
         SET price = EXCLUDED.price, symbol = EXCLUDED.symbol,
             source = EXCLUDED.source, updated_at = now()`,
    )
  } catch (err: any) {
    console.error('[live-prices] upsert:', err?.message ?? err)
  }
}

// OTC: le preco corrente da memoria do engine (sem I/O externo). Par fora da
// sessao ou desligado devolve null e sai da publicacao — live_prices envelhece e
// o place_trade recusa por PRICE_UNAVAILABLE mesmo se a checagem de sessao falhar.
function publishOtc() {
  const rows: PriceRow[] = []
  for (const symbol of getTickingOtcSymbols()) {
    const price = getCurrentPriceMemory(symbol)
    if (price == null) continue
    const assetId = otcSlug(symbol)
    if (!assetId) continue
    rows.push({ assetId, symbol, price, source: 'otc' })
  }
  return upsert(rows)
}

async function fetchBinance(symbol: string): Promise<number> {
  // data-api.binance.vision: endpoint publico sem bloqueio geografico (VPS em SFO).
  const res = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, {
    signal: AbortSignal.timeout(4_000),
  })
  const json = (await res.json()) as { price?: string }
  const price = parseFloat(json.price ?? '')
  if (!price || isNaN(price)) throw new Error(`binance ${symbol}: sem preco`)
  return price
}

// Cripto: Binance a cada 10s. Falha de um par nao derruba os outros.
async function publishCrypto() {
  const rows: PriceRow[] = []
  await Promise.all(
    CRYPTO_ASSETS.map(async a => {
      try { rows.push({ assetId: a.assetId, symbol: a.symbol, price: await fetchBinance(a.symbol), source: 'binance' }) }
      catch (e: any) { console.error('[live-prices]', e.message) }
    }),
  )
  return upsert(rows)
}

async function fetchTwelveData(symbol: string): Promise<number> {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY ausente')
  const res = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`, {
    signal: AbortSignal.timeout(5_000),
  })
  const json = (await res.json()) as { price?: string; status?: string; message?: string }
  if (json.status === 'error') throw new Error(`twelvedata ${symbol}: ${json.message}`)
  const price = parseFloat(json.price ?? '')
  if (!price || isNaN(price)) throw new Error(`twelvedata ${symbol}: preco invalido`)
  return price
}

// Kraken: par fiat real (EUR/USD, GBP/USD), API publica sem chave nem cota
// diaria. 1 chamada traz os 2 pares.
//
// Preco = MID do livro ((bid+ask)/2), NAO o ultimo negocio: os pares fiat da
// Kraken tem livro fino (especialmente GBP) e um "flash trade" pode imprimir
// preco centenas de pips fora por 1s. O mid e estavel (e o que corretoras
// cotam) e ainda passa por um filtro anti-salto abaixo.
const SPIKE_DEV             = 0.005   // rejeita desvio >0.5% vs ultimo preco aceito
const SPIKE_ACCEPT_AFTER_MS = 15_000  // ...a menos que persista 15s (movimento real)
const spikeGuard = new Map<string, { price: number; deviantSince: number | null }>()

// Filtro anti-flash-spike compartilhado entre REST e WebSocket. Janela por
// TEMPO, nao por contagem de amostras: no REST (1 amostra/5s) e no WS (~4/s)
// o desvio precisa persistir os MESMOS 15s pra ser aceito — contagem fixa
// deixaria o WS aceitar um flash de <1s.
function passSpikeGuard(assetId: string, symbol: string, price: number): boolean {
  const now = Date.now()
  const g = spikeGuard.get(assetId)
  if (g && Math.abs(price - g.price) / g.price > SPIKE_DEV) {
    if (g.deviantSince == null) {
      g.deviantSince = now
      console.warn(`[live-prices] ${symbol}: amostra ${price} em quarentena (>${SPIKE_DEV * 100}% de ${g.price})`)
      return false
    }
    if (now - g.deviantSince < SPIKE_ACCEPT_AFTER_MS) return false
    // desvio sustentado por 15s+: movimento real — aceita e rebaseia abaixo
  }
  spikeGuard.set(assetId, { price, deviantSince: null })
  return true
}

async function fetchKraken(): Promise<PriceRow[]> {
  const res = await fetch('https://api.kraken.com/0/public/Ticker?pair=EURUSD,GBPUSD', {
    signal: AbortSignal.timeout(4_000),
  })
  const json = (await res.json()) as { error?: string[]; result?: Record<string, { a?: string[]; b?: string[]; c?: string[] }> }
  if (json.error && json.error.length > 0) throw new Error(`kraken: ${json.error.join('; ')}`)
  const result = json.result ?? {}
  const rows: PriceRow[] = []
  for (const a of FOREX_ASSETS) {
    const key = (KRAKEN_KEYS[a.assetId] ?? []).find(k => result[k]?.a?.[0] || result[k]?.c?.[0])
    const t = key ? result[key] : undefined
    const ask = parseFloat(t?.a?.[0] ?? '')
    const bid = parseFloat(t?.b?.[0] ?? '')
    // mid do livro; se bid/ask indisponiveis, cai pro ultimo negocio
    let price = Number.isFinite(ask) && Number.isFinite(bid) && ask > 0 && bid > 0
      ? (ask + bid) / 2
      : parseFloat(t?.c?.[0] ?? '')
    if (!Number.isFinite(price) || price <= 0) {
      console.error(`[live-prices] kraken sem preco p/ ${a.symbol}`)
      continue
    }
    price = Number(price.toFixed(6))
    if (!passSpikeGuard(a.assetId, a.symbol, price)) continue
    rows.push({ assetId: a.assetId, symbol: a.symbol, price, source: 'kraken' })
  }
  return rows
}

// Freio de fim de semana: regra compartilhada em marketHours.ts. A Kraken
// negocia esses pares 24/7 — sem este freio o grafico se moveria no fim de
// semana com o trading bloqueado (confuso pro cliente).

// ── Kraken WebSocket v2: fluxo denso de mid (ticker/bbo) ────────────────────
// ~200-270 updates/min por par em horario ativo (vs 12/min do REST de 5s):
// as velas de 1m ganham corpo/pavio praticamente completos e o mid publicado
// esta sempre fresco. MESMO book e mesma conta (bid+ask)/2 do REST — nenhuma
// mudanca de fonte. Sem chave, sem custo. Reconexao com backoff disciplinado
// (Cloudflare bane o IP por 10min acima de ~150 tentativas/10min).
const KRAKEN_WS_URL = 'wss://ws.kraken.com/v2'
const WS_ASSET_BY_SYMBOL: Record<string, string> = {
  'EUR/USD': 'eur-usd',
  'GBP/USD': 'gbp-usd',
}
type MinuteCandle = { t: number; o: number; h: number; l: number; c: number }
const wsMid = new Map<string, { price: number; at: number }>()   // ultimo mid aceito por asset
const liveCandles  = new Map<string, MinuteCandle>()             // vela do minuto corrente (WS ou REST)
const candleFlushQueue: Array<{ assetId: string; c: MinuteCandle }> = []  // minutos fechados aguardando flush
let krakenWs: WebSocket | null = null
let krakenWsStopped = false
let krakenWsRetryMs = 5_000
let krakenWsLastMsgAt = 0   // qualquer mensagem (heartbeat conta) — watchdog abaixo

// Acumula uma amostra na vela do minuto corrente (em memoria). Na virada do
// minuto, a vela fechada vai pra fila de flush — o tick de 5s persiste tudo.
// Freio de fim de semana AQUI (ponto unico): amostra REST/TD que atravessou a
// virada de sexta 22h UTC num await pendente nao vira vela de mercado fechado.
function accumulateCandleSample(assetId: string, price: number) {
  if (!isForexOpenNow()) return
  const t = Math.floor(Date.now() / 1000 / 60) * 60
  const cur = liveCandles.get(assetId)
  if (!cur || cur.t !== t) {
    if (cur && cur.t < t) candleFlushQueue.push({ assetId, c: cur })
    liveCandles.set(assetId, { t, o: price, h: price, l: price, c: price })
  } else {
    if (price > cur.h) cur.h = price
    if (price < cur.l) cur.l = price
    cur.c = price
  }
}

function onKrakenWsTick(symbol: string, bid: number, ask: number) {
  const assetId = WS_ASSET_BY_SYMBOL[symbol]
  if (!assetId) return
  if (!isForexOpenNow()) return   // fim de semana: freio (Kraken negocia 24/7)
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return
  const price = Number(((bid + ask) / 2).toFixed(6))
  if (!passSpikeGuard(assetId, symbol, price)) return
  wsMid.set(assetId, { price, at: Date.now() })
  accumulateCandleSample(assetId, price)
}

function connectKrakenWs() {
  if (krakenWsStopped) return
  try {
    const ws = new WebSocket(KRAKEN_WS_URL, { handshakeTimeout: 10_000 })
    krakenWs = ws
    ws.on('open', () => {
      // Arma o watchdog já no open: conexão que nasce muda (handshake ok,
      // zero mensagens) é derrubada em 30s em vez de ficar invisível.
      krakenWsLastMsgAt = Date.now()
      ws.send(JSON.stringify({
        method: 'subscribe',
        params: { channel: 'ticker', symbol: Object.keys(WS_ASSET_BY_SYMBOL), event_trigger: 'bbo', snapshot: true },
      }))
      console.log('[live-prices] kraken WS conectado (ticker/bbo EUR/USD, GBP/USD)')
    })
    ws.on('message', (raw: Buffer) => {
      krakenWsLastMsgAt = Date.now()
      // Backoff só reseta com conexão comprovadamente ÚTIL (1ª mensagem) —
      // resetar no open deixava um loop accept-then-close reconectando a 5s
      // fixos (~110 tentativas/10min, perto do ban de IP do Cloudflare).
      krakenWsRetryMs = 5_000
      try {
        const msg = JSON.parse(raw.toString())
        if (msg?.channel !== 'ticker' || !Array.isArray(msg.data)) return
        for (const d of msg.data) onKrakenWsTick(d?.symbol, Number(d?.bid), Number(d?.ask))
      } catch { /* mensagem nao-JSON (heartbeat malformado) — ignora */ }
    })
    ws.on('error', (e: Error) => { console.error('[live-prices] kraken WS:', e.message) })
    ws.on('close', () => {
      if (krakenWsStopped) return
      // Backoff exponencial ate 60s: pior caso ~10 tentativas/10min, longe do
      // limite do Cloudflare. O REST de 5s cobre o buraco enquanto isso.
      const delay = krakenWsRetryMs
      krakenWsRetryMs = Math.min(krakenWsRetryMs * 2, 60_000)
      setTimeout(connectKrakenWs, delay)
      console.warn(`[live-prices] kraken WS caiu — reconectando em ${Math.round(delay / 1000)}s`)
    })
  } catch (e: any) {
    console.error('[live-prices] kraken WS connect:', e?.message ?? e)
    setTimeout(connectKrakenWs, krakenWsRetryMs)
    krakenWsRetryMs = Math.min(krakenWsRetryMs * 2, 60_000)
  }
}

// ── Velas próprias do forex (1m) ─────────────────────────────────────────────
// Constrói velas a partir do MESMO mid publicado em live_prices (12 amostras de
// 5s por minuto). Motivo: os pares fiat da Kraken têm pouquíssimos negócios por
// minuto — o OHLC de lá vira "vela-ponto" (o=h=l=c), quase invisível no gráfico.
// O mid se move continuamente, então as velas ganham corpo/pavio reais e ficam
// 100% consistentes com o preço que liquida operação (mesma fonte exata).
// Tabela criada aqui mesmo, idempotente — sem passo manual de migração.
let forexCandlesReady = false

async function ensureForexCandlesTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS forex_candles (
        asset_id text             NOT NULL,
        t        bigint           NOT NULL,
        o        double precision NOT NULL,
        h        double precision NOT NULL,
        l        double precision NOT NULL,
        c        double precision NOT NULL,
        PRIMARY KEY (asset_id, t)
      )`)
    forexCandlesReady = true
    console.log('[live-prices] forex_candles pronta')
  } catch (e: any) {
    console.error('[live-prices] forex_candles create:', e?.message ?? e)
  }
}

// Flush das velas em memoria (minutos fechados na fila + snapshot do minuto
// corrente) via upsert-merge: o abre no 1º sample (preservado no conflito),
// high/low expandem, close acompanha. Restart no meio do minuto só perde a
// amplitude desde o último flush (≤5s) — nunca corrompe.
let lastEnsureRetry = 0
async function flushForexCandles() {
  // Blindagem: se o CREATE TABLE falhou no boot (Postgres indisponível durante
  // o deploy), retenta a cada 30s em vez de silenciar a gravação pra sempre.
  if (!forexCandlesReady) {
    if (Date.now() - lastEnsureRetry < 30_000) return
    lastEnsureRetry = Date.now()
    await ensureForexCandlesTable()
    if (!forexCandlesReady) return
  }
  runBackfillIfPending()   // tabela ok => garante que o buraco pré-boot foi tapado
  const closed = candleFlushQueue.splice(0)
  // Dedup por (asset,minuto) — ON CONFLICT não aceita a mesma chave 2x no
  // mesmo INSERT. Merge em memória espelha o merge do SQL.
  const entries = new Map<string, { assetId: string; c: MinuteCandle }>()
  const put = (assetId: string, c: MinuteCandle) => {
    const k = `${assetId}:${c.t}`
    const e = entries.get(k)
    if (!e) entries.set(k, { assetId, c: { ...c } })
    else {
      if (c.h > e.c.h) e.c.h = c.h
      if (c.l < e.c.l) e.c.l = c.l
      e.c.c = c.c
    }
  }
  closed.forEach(x => put(x.assetId, x.c))
  for (const [assetId, c] of liveCandles) put(assetId, c)
  if (entries.size === 0) return
  const values = [...entries.values()]
    .map(e => `('${e.assetId}', ${e.c.t}, ${e.c.o}, ${e.c.h}, ${e.c.l}, ${e.c.c})`)
    .join(',')
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO forex_candles (asset_id, t, o, h, l, c) VALUES ${values}
       ON CONFLICT (asset_id, t) DO UPDATE
         SET h = GREATEST(forex_candles.h, EXCLUDED.h),
             l = LEAST(forex_candles.l, EXCLUDED.l),
             c = EXCLUDED.c`)
  } catch (e: any) {
    // Minutos fechados voltam pra fila (retry no próximo tick); o corrente
    // re-snapshota sozinho. O merge é idempotente — duplicar não corrompe.
    // Teto de 600 entradas (~5h de 2 pares): Postgres fora por horas não
    // acumula um INSERT gigante. Minutos descartados além do teto só voltam
    // num restart futuro (backfill pré-boot, alcance ~12h do OHLC da Kraken).
    candleFlushQueue.push(...closed)
    if (candleFlushQueue.length > 600) candleFlushQueue.splice(0, candleFlushQueue.length - 600)
    console.error('[live-prices] forex_candles upsert:', e?.message ?? e)
  }
}

// ── Backfill de buracos (boot) ───────────────────────────────────────────────
// Deploy/restart deixava minutos sem vela própria (buraco permanente). Preenche
// desde a última vela PRÉ-BOOT (âncora bootMin: imune à corrida com o flush do
// minuto corrente) com o OHLC 1m REST da Kraken (mesma fonte), só minutos com
// mercado aberto, sem NUNCA sobrescrever vela própria (ON CONFLICT DO NOTHING).
// O OHLC da Kraken é de NEGÓCIOS (flash trades inclusos) — cada vela é validada
// e clampada numa cadeia de closes (±0.5% vs anterior) com o/h/l consistentes.
// Retorna true quando todos os pares processaram sem erro (controla o retry).
const KRAKEN_OHLC_PAIR: Record<string, string> = { 'eur-usd': 'EURUSD', 'gbp-usd': 'GBPUSD' }
let publisherBootMin = 0   // setado no startLivePricePublisher
async function backfillForexCandles(): Promise<boolean> {
  if (!forexCandlesReady) return false
  let allOk = true
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
  for (const a of FOREX_ASSETS) {
    try {
      // Âncora: última vela anterior ao boot — o que o publisher atual já
      // gravou depois de subir não conta como "fim do buraco".
      const rows = await prisma.$queryRawUnsafe<Array<{ t: bigint; c: number }>>(
        `SELECT t, c FROM forex_candles WHERE asset_id = '${a.assetId}' AND t < ${publisherBootMin}
         ORDER BY t DESC LIMIT 1`)
      const maxT = rows?.[0]?.t != null ? Number(rows[0].t) : 0
      let prev   = rows?.[0]?.c != null ? Number(rows[0].c) : NaN
      const nowMin = Math.floor(Date.now() / 1000 / 60) * 60
      if (maxT === 0 || nowMin - maxT < 3 * 60) continue   // serie nova ou sem buraco relevante
      const res = await fetch(
        `https://api.kraken.com/0/public/OHLC?pair=${KRAKEN_OHLC_PAIR[a.assetId]}&interval=1`,
        { signal: AbortSignal.timeout(8_000) },
      )
      const json = (await res.json()) as { error?: string[]; result?: Record<string, unknown> }
      if (json.error && json.error.length > 0) throw new Error(json.error.join('; '))
      const key = Object.keys(json.result ?? {}).find(k => k !== 'last')
      const ohlc = key ? ((json.result as Record<string, unknown>)[key] as unknown[][]) : []
      const values: string[] = []
      for (const k of ohlc) {
        const t = Number(k[0])
        const o = parseFloat(String(k[1])), h = parseFloat(String(k[2]))
        const l = parseFloat(String(k[3])), c = parseFloat(String(k[4]))
        if (![t, o, h, l, c].every(Number.isFinite) || c <= 0) continue
        if (t <= maxT || t >= Math.min(nowMin, publisherBootMin)) continue   // só o buraco pré-boot
        if (!isForexOpenAt(new Date(t * 1000))) continue                     // fim de semana fora
        // Cadeia de closes: cada close clampado a ±0.5% do anterior; o dentro
        // da mesma banda; h/l consistentes com o corpo e clampados na banda.
        const cc = Number.isFinite(prev) && prev > 0 ? clamp(c, prev * (1 - SPIKE_DEV), prev * (1 + SPIKE_DEV)) : c
        const oo = clamp(o, cc * (1 - SPIKE_DEV), cc * (1 + SPIKE_DEV))
        const hi = clamp(Math.max(h, oo, cc), Math.max(oo, cc), cc * (1 + SPIKE_DEV))
        const lo = clamp(Math.min(l, oo, cc), cc * (1 - SPIKE_DEV), Math.min(oo, cc))
        prev = cc
        values.push(`('${a.assetId}', ${t}, ${oo}, ${hi}, ${lo}, ${cc})`)
      }
      if (values.length === 0) continue
      await prisma.$executeRawUnsafe(
        `INSERT INTO forex_candles (asset_id, t, o, h, l, c) VALUES ${values.join(',')}
         ON CONFLICT (asset_id, t) DO NOTHING`)
      console.log(`[live-prices] backfill ${a.symbol}: ${values.length} velas (buraco de ${Math.round((nowMin - maxT) / 60)}min)`)
    } catch (e: any) {
      allOk = false
      console.error(`[live-prices] backfill ${a.symbol}:`, e?.message ?? e)
    }
  }
  return allOk
}

// Backfill com retry: roda quando a tabela estiver pronta e repete (throttle
// 60s) enquanto não completar sem erro — Postgres fora no boot não cancela.
let backfillPending = true
let lastBackfillTry = 0
function runBackfillIfPending() {
  if (!backfillPending || !forexCandlesReady) return
  if (Date.now() - lastBackfillTry < 60_000) return
  lastBackfillTry = Date.now()
  backfillForexCandles()
    .then(ok => { if (ok) backfillPending = false })
    .catch(() => {})
}

// Retenção: 7 dias (2.880 velas/dia/par = poucos KB; DELETE minúsculo, 1x/hora)
let lastCandlePrune = 0
function pruneForexCandles() {
  if (Date.now() - lastCandlePrune < 3600_000) return
  lastCandlePrune = Date.now()
  const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400
  prisma.$executeRawUnsafe(`DELETE FROM forex_candles WHERE t < ${cutoff}`)
    .catch((e: any) => console.error('[live-prices] forex_candles prune:', e?.message ?? e))
}

// Forex: Kraken a cada 5s (gratis). Se o Kraken falhar, cai pro Twelve Data —
// mas no maximo 1 vez a cada 240s, senao o retry de 5s estoura a cota diaria
// (800 creditos/dia no plano free).
let lastTwelveDataFallback = 0
let lastForexRows: PriceRow[] = []   // ultimo preco publicado (congela no fim de semana)

async function publishForex() {
  // Mercado fechado: re-publica o ULTIMO preco (updated_at fresco pra liquidar
  // operacoes pendentes; grafico fica numa linha parada honesta, sem tick novo).
  if (!isForexOpenNow()) {
    if (lastForexRows.length === 0) {
      // cold start no fim de semana (restart do container): 1 fetch pra ter base
      try { lastForexRows = await fetchKraken() }
      catch (e: any) { console.error('[live-prices] kraken:', e.message); return }
    }
    return upsert(lastForexRows)
  }
  // 1) WS fresco cobre o ativo? Usa o mid do stream (sem chamada REST). As
  //    velas do minuto já foram acumuladas tick a tick pelo onKrakenWsTick.
  const now = Date.now()
  const rows: PriceRow[] = []
  const restNeeded: AssetEntry[] = []
  for (const a of FOREX_ASSETS) {
    const m = wsMid.get(a.assetId)
    if (m && now - m.at < 15_000) rows.push({ assetId: a.assetId, symbol: a.symbol, price: m.price, source: 'kraken' })
    else restNeeded.push(a)
  }

  // 2) REST de 5s: fallback automático pros ativos sem WS fresco (modo antigo,
  //    1 amostra a cada 5s na vela)
  if (restNeeded.length > 0) {
    try {
      const fetched = await fetchKraken()
      for (const r of fetched) {
        if (!restNeeded.some(a => a.assetId === r.assetId)) continue
        rows.push(r)
        accumulateCandleSample(r.assetId, r.price)
      }
    } catch (e: any) {
      console.error('[live-prices] kraken:', e.message)
    }
  }

  if (rows.length > 0) {
    lastForexRows = rows
    flushForexCandles().catch(() => {})   // persiste velas acumuladas (fire-and-forget)
    pruneForexCandles()
    return upsert(rows)
  }

  // 3) Twelve Data: última reserva (outro feed) — só com Kraken 100% fora
  if (Date.now() - lastTwelveDataFallback < 240_000) return
  lastTwelveDataFallback = Date.now()
  const tdRows: PriceRow[] = []
  await Promise.all(
    FOREX_ASSETS.map(async a => {
      try { tdRows.push({ assetId: a.assetId, symbol: a.symbol, price: await fetchTwelveData(a.symbol), source: 'twelvedata' }) }
      catch (e: any) { console.error('[live-prices]', e.message) }
    }),
  )
  if (tdRows.length > 0) {
    lastForexRows = tdRows
    for (const r of tdRows) accumulateCandleSample(r.assetId, r.price)
    flushForexCandles().catch(() => {})
  }
  return upsert(tdRows)
}

let otcTimer: NodeJS.Timeout | null = null
let cryptoTimer: NodeJS.Timeout | null = null
let forexTimer: NodeJS.Timeout | null = null
let wsWatchdogTimer: NodeJS.Timeout | null = null

export function startLivePricePublisher() {
  publisherBootMin = Math.floor(Date.now() / 1000 / 60) * 60   // âncora do backfill
  ensureForexCandlesTable()
    .then(() => runBackfillIfPending())   // tapa buracos do deploy anterior (retry no flush)
    .catch(() => {})
  connectKrakenWs()                       // fluxo denso de mid (fallback = REST 5s)
  // OTC: 2s (memoria, barato). Cripto: 5s (Binance publica, sem cota — aperta a
  // liquidacao pra ficar colada no que o cliente ve no grafico via WS). Forex:
  // tick de 5s publica o mid corrente do WS Kraken (ou REST se o WS estiver mudo).
  otcTimer    = setInterval(() => { publishOtc().catch(e => console.error('[live-prices] otc:', e.message)) }, 2_000)
  cryptoTimer = setInterval(() => { publishCrypto().catch(e => console.error('[live-prices] crypto:', e.message)) }, 5_000)
  forexTimer  = setInterval(() => { publishForex().catch(e => console.error('[live-prices] forex:', e.message)) }, 5_000)
  // Watchdog do WS: conexão half-open não emite 'close' — sem isto a fonte
  // primária degradaria pro REST por horas em silêncio. Kraken manda heartbeat
  // ~1/s; 30s de silêncio total = conexão morta => derruba e deixa reconectar.
  wsWatchdogTimer = setInterval(() => {
    if (krakenWsStopped || !krakenWs) return
    if (krakenWsLastMsgAt > 0 && Date.now() - krakenWsLastMsgAt > 30_000) {
      console.warn('[live-prices] kraken WS mudo ha 30s — derrubando pra reconectar')
      krakenWsLastMsgAt = Date.now()   // re-arma (novo disparo só em +30s de silêncio)
      try { krakenWs.terminate() } catch { /* já morto */ }
    }
  }, 15_000)
  publishCrypto().catch(() => {})  // primeiro publish imediato
  publishForex().catch(() => {})
  console.log('[live-prices] publisher iniciado via Prisma (OTC 2s, cripto 5s, forex WS Kraken + tick 5s)')

  const stop = () => {
    if (otcTimer) clearInterval(otcTimer)
    if (cryptoTimer) clearInterval(cryptoTimer)
    if (forexTimer) clearInterval(forexTimer)
    if (wsWatchdogTimer) clearInterval(wsWatchdogTimer)
    krakenWsStopped = true
    try { krakenWs?.close() } catch { /* já fechado */ }
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}
