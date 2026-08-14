'use client'

import { useBrandContext } from '@/components/brand/BrandProvider'
import type { Brand } from './brand'

/**
 * Marca do site (wordmark, subtítulo, nome por extenso, logo).
 *
 * Vem do servidor via BrandProvider, montado no layout raiz — o valor já
 * chega no HTML, sem busca no cliente e sem piscar. O fallback, quando não há
 * provider acima, é o BRAND_FALLBACK do lib/brand.
 */
export function useSiteBrand(): Brand {
  return useBrandContext()
}
