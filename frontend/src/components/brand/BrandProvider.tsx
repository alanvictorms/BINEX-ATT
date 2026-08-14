'use client'

import { createContext, useContext } from 'react'
import { BRAND_FALLBACK, type Brand } from '@/lib/brand'

/**
 * Marca entregue pelo servidor.
 *
 * O layout raiz lê `app_config.site_content` e injeta o valor aqui, então o
 * nome já sai renderizado no HTML. Antes disso o hook buscava por fetch no
 * cliente e começava com um valor fixo — o que fazia toda visita piscar a
 * marca antiga antes de trocar. Ver docs/plano-rebrand.md.
 */
const BrandContext = createContext<Brand>(BRAND_FALLBACK)

export function BrandProvider({
  value,
  children,
}: {
  value: Brand
  children: React.ReactNode
}) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

export function useBrandContext(): Brand {
  return useContext(BrandContext)
}
