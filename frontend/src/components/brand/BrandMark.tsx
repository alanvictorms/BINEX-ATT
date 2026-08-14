'use client'

import { useSiteBrand } from '@/lib/useSiteBrand'

/**
 * Símbolo da marca.
 *
 * Existem duas medidas ópticas do mesmo desenho, como o corte de texto e o de
 * título de uma fonte:
 *
 *   ui       núcleo aproximado e contorno reforçado. É o que sobrevive a 32 px —
 *            sem isso a fita vira borrão. Em troca, a ponta da lâmina fica cortada.
 *   display  proporção original, com as lâminas inteiras. Só serve de 96 px pra cima,
 *            onde há pixel suficiente para o degradê do cromado acontecer.
 *
 * A escolha da escada é feita pelo tamanho pedido, e o srcSet nunca cruza de uma
 * escada para a outra — se cruzasse, a marca mudaria de proporção entre uma tela
 * comum e uma retina.
 */
const UI = [32, 48, 64, 96]
const DISPLAY = [192, 256, 512]
const CORTE = 64

function fontes(px: number) {
  const escada = px <= CORTE ? UI : DISPLAY
  const prefixo = px <= CORTE ? '/marca/simbolo-ui-' : '/marca/simbolo-'
  const escolhe = (alvo: number) => escada.find(v => v >= alvo) ?? escada[escada.length - 1]
  const um = `${prefixo}${escolhe(px)}.png`
  return {
    src: um,
    srcSet: `${um} 1x, ${prefixo}${escolhe(px * 2)}.png 2x, ${prefixo}${escolhe(px * 3)}.png 3x`,
  }
}

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

  const { src, srcSet } = fontes(size)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet}
      width={size}
      height={size}
      alt={fullName}
      className={className}
      style={{ width: size, height: size }}
      draggable={false}
    />
  )
}
