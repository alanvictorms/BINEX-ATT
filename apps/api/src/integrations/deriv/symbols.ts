// Mapa simbolo OTC (nosso) -> simbolo Deriv.
//
// Os ativos OTC daqui sao sinteticos (engine + rng.ts). Este mapa existe pro
// backfill de historico: puxamos a FORMA do mercado real da Deriv pra encher o
// grafico com 3 meses de candles, sem mexer no motor de preco ao vivo.
//
// Verificado contra a API em 2026-08-15: todos respondem ticks_history com
// granularity 60 e tem dados de pelo menos 90 dias.

export const OTC_TO_DERIV: Record<string, string> = {
  'EURUSD-OTC': 'frxEURUSD',
  'GBPUSD-OTC': 'frxGBPUSD',
  'USDJPY-OTC': 'frxUSDJPY',
  'AUDCAD-OTC': 'frxAUDCAD',
  'EURJPY-OTC': 'frxEURJPY',
  'NZDUSD-OTC': 'frxNZDUSD',
  'USDCHF-OTC': 'frxUSDCHF',
  'USDBRL-OTC': 'frxUSDBRL',
  'XAUUSD-OTC': 'frxXAUUSD',
  'XAGUSD-OTC': 'frxXAGUSD',
  'BTCUSD-OTC': 'cryBTCUSD',
  'ETHUSD-OTC': 'cryETHUSD',
  'SOLUSD-OTC': 'crySOLUSD',
  'XRPUSD-OTC': 'cryXRPUSD',
}

export function derivSymbolFor(otcSymbol: string): string | null {
  return OTC_TO_DERIV[otcSymbol] ?? null
}

// Granularidades aceitas pela Deriv em style:'candles'. Nao inclui 5s/15s —
// por isso o backfill so cobre 60 e 300 (ver backfill-otc-from-deriv.ts).
export const DERIV_GRANULARITIES = [
  60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400,
] as const

export function isDerivGranularity(tf: number): boolean {
  return (DERIV_GRANULARITIES as readonly number[]).includes(tf)
}
