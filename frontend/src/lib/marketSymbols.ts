type MarketSource = 'twelvedata' | 'binance' | 'yahoo'

export interface RealAssetConfig {
  symbol: string
  source: MarketSource
}

// Ativos com fonte de dados real (LIVE).
// Twelve Data: forex (qualidade superior ao Yahoo, requer API key — proxy via /api/market/*).
// Binance: cripto — gratuito, sem API key para dados públicos.
// Yahoo: legado, mantido como fallback (pode ser usado pra futuros pares).
//
// Asset IDs aqui devem casar com ASSETS em mockData.ts. Pra adicionar novo asset
// real: 1) add em ASSETS; 2) add aqui; 3) confirma que symbol existe no provider.
export const REAL_ASSETS: Record<string, RealAssetConfig> = {
  // ── Forex via Twelve Data (2 majors, centralizado via live_prices) ──
  'eur-usd': { symbol: 'EUR/USD', source: 'twelvedata' },
  'gbp-usd': { symbol: 'GBP/USD', source: 'twelvedata' },

  // ── Cripto via Binance (5 majors) ──────────────────────────────────
  'btc': { symbol: 'BTCUSDT', source: 'binance' },
  'eth': { symbol: 'ETHUSDT', source: 'binance' },
  'sol': { symbol: 'SOLUSDT', source: 'binance' },
  'xrp': { symbol: 'XRPUSDT', source: 'binance' },
  'bnb': { symbol: 'BNBUSDT', source: 'binance' },
}

// Retorna true se o ativo tem dados de mercado real
export function isRealMarket(assetId: string): boolean {
  return assetId in REAL_ASSETS
}

// Retorna a fonte do ativo, ou null se OTC simulado.
export function getMarketSource(assetId: string): MarketSource | null {
  return REAL_ASSETS[assetId]?.source ?? null
}

// Converte timeframe em segundos para intervalo da Binance.
export function tfToBinanceInterval(seconds: number): string {
  if (seconds <= 60)     return '1m'
  if (seconds === 300)   return '5m'
  if (seconds === 900)   return '15m'
  if (seconds === 1800)  return '30m'
  if (seconds === 3600)  return '1h'
  if (seconds === 14400) return '4h'
  return '1d'
}

// Converte timeframe em segundos para intervalo Twelve Data.
// Twelve Data nao tem 5s/15s/30s — caller deve cair em mock client-side nesses.
export function tfToTwelveDataInterval(seconds: number): string | null {
  if (seconds === 60)    return '1min'
  if (seconds === 300)   return '5min'
  if (seconds === 900)   return '15min'
  if (seconds === 1800)  return '30min'
  if (seconds === 3600)  return '1h'
  if (seconds === 14400) return '4h'
  if (seconds === 86400) return '1day'
  return null
}
