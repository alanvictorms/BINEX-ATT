import { NextResponse } from 'next/server'
import { getSiteContent } from '@/lib/siteContent'

/**
 * Marca do site, público e sem autenticação. Devolve só os campos da marca —
 * nunca o resto do site_content.
 *
 * As telas NÃO consomem mais esta rota: a marca chega pelo BrandProvider, que
 * o layout raiz resolve no servidor. Isto fica de pé para consumo externo e
 * para checagem rápida do que está publicado.
 *
 * Os valores de fallback vivem em lib/brand.ts — não escrever o nome da marca
 * aqui dentro. Ver docs/plano-rebrand.md.
 */
export const revalidate = 60

export async function GET() {
  const { brand } = await getSiteContent()
  return NextResponse.json(brand)
}
