'use client'

import { useSiteBrand } from '@/lib/useSiteBrand'

/**
 * Símbolo da marca (Vértice Broker).
 *
 * Era uma escada de PNGs em duas medidas ópticas, porque o desenho antigo tinha
 * degradê e perdia legibilidade abaixo de 32 px. O símbolo atual é vetorial e de
 * cor chapada, então um único SVG serve de 16 px a 512 px sem escada nem
 * srcSet — e fica nítido em qualquer densidade de tela.
 */
const SIMBOLO = '/marca/verticebroker-icon.svg'

interface BrandMarkProps {
  size?: number
  className?: string
}

export function BrandMark({ size = 32, className }: BrandMarkProps) {
  const { logoUrl, fullName } = useSiteBrand()

  // Logo enviado pelo painel manda no símbolo embutido.
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoUrl}
        width={size}
        height={size}
        alt={fullName}
        className={className}
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SIMBOLO}
      width={size}
      height={size}
      alt={fullName}
      className={className}
      // objectFit contain porque o símbolo não é quadrado (43.55 x 53.84):
      // sem isso ele esticaria dentro da caixa quadrada pedida pelo `size`.
      style={{ width: size, height: size, objectFit: 'contain' }}
      draggable={false}
    />
  )
}
