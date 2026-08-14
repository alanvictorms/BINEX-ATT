/**
 * Constantes do site público. Fonte única pra metadata, sitemap e links
 * canônicos — não espalhar URL literal pelo código.
 */
import { BRAND_DOMAIN } from './brand'

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || `https://${BRAND_DOMAIN}`

/** URL da plataforma logada. Hoje é a mesma origem, em /trade. */
export const APP_PATH = '/trade'
