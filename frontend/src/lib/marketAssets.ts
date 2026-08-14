import { supabase } from './supabase'
import { ASSETS } from './mockData'

// Ativos reais (forex/cripto). IDs devem casar com a tabela market_assets e com
// REAL_ASSETS (marketSymbols.ts). O payout aqui é a fonte autoritativa do servidor.
const REAL_IDS = ['eur-usd', 'gbp-usd', 'btc', 'eth', 'sol', 'xrp', 'bnb']

// Ativos reais desativados pelo admin. A leitura pública de market_assets só retorna
// enabled=true (RLS); um id real ausente da resposta significa "desativado".
export const disabledRealAssetIds = new Set<string>()

// Sincroniza payout/disponibilidade dos ativos reais a partir de market_assets.
// Sobrepõe o payout estático do mockData (display) e marca os desativados, para que
// mudanças feitas no admin (aba Ativos) reflitam na UI sem novo deploy.
// O motor (place_trade) já é autoritativo no servidor — isto é apenas a camada visual.
export async function syncMarketAssets(): Promise<void> {
  const { data, error } = await supabase
    .from('market_assets')
    .select('id,payout') // RLS já filtra enabled=true
  if (error || !data) return

  const present = new Set<string>()
  for (const row of data as { id: string; payout: number }[]) {
    present.add(row.id)
    const a = ASSETS.find(x => x.id === row.id)
    if (a) { a.payout = row.payout; a.payout5min = row.payout }
  }

  disabledRealAssetIds.clear()
  for (const id of REAL_IDS) if (!present.has(id)) disabledRealAssetIds.add(id)
}
