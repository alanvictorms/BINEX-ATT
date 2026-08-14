'use client'

import { BrandMark } from './BrandMark'
import { useSiteBrand } from '@/lib/useSiteBrand'

/**
 * Marca completa: símbolo + nome, OU um logo horizontal único.
 *
 * O modo é definido em /admin/site → Marca. No modo `wide`, a imagem mantém a
 * altura do símbolo (`size`) e o comprimento fica proporcional; `logoScope`
 * define se vale só na tela de trade ou também no header do site.
 */
export function BrandLogo({
  size,
  where,
  children,
}: {
  size: number
  where: 'trade' | 'site'
  children?: React.ReactNode
}) {
  const { logoWideUrl, logoMode, logoScope, fullName } = useSiteBrand()
  const useWide = logoMode === 'wide' && !!logoWideUrl && (where === 'trade' || logoScope === 'both')

  if (useWide) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoWideUrl}
        alt={fullName}
        style={{ height: size, width: 'auto', objectFit: 'contain' }}
        draggable={false}
      />
    )
  }

  return (
    <>
      <BrandMark size={size} />
      {children}
    </>
  )
}
