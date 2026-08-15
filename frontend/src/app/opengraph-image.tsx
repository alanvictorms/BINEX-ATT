/**
 * Imagem de preview quando o link é compartilhado (WhatsApp, X, Telegram,
 * LinkedIn...). Antes não existia nenhuma, então o link ia "pelado".
 *
 * Gerada via ImageResponse em vez de PNG estático: o nome vem do BRAND_FALLBACK,
 * então trocar a marca num lugar só continua valendo aqui.
 *
 * O símbolo é SVG inline (não <img>) porque o Satori resolve os paths direto,
 * sem depender de fetch de asset em build.
 */

import { ImageResponse } from 'next/og'
import { BRAND_FALLBACK } from '@/lib/brand'

export const alt = `${BRAND_FALLBACK.fullName} — ${BRAND_FALLBACK.subtitle}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const AZUL = '#2E6BE5'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A101A',
          position: 'relative',
        }}
      >
        {/* Faixa superior — dá peso de marca sem depender de imagem de fundo */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 8, background: AZUL, display: 'flex' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <svg width="150" height="185" viewBox="0 0 43.55 53.84" fill={AZUL}>
            <polygon points="35.73,8.8 40.36,8.84 40.38,45.62 15.92,45.68 15.86,48.82 43.46,48.85 43.55,5.67 35.75,5.66 " />
            <path d="M0.18 48.85l6.6 -0.01 0.05 -3.13 -3.58 -0.05 -0.01 -36.82 22.7 -0.02 0.02 -3.16 -25.86 -0.01c-0.06,1.76 -0.24,41.82 0.08,43.2z" />
            <path d="M27.96 2.21c-0.21,9.41 -0.03,20.99 -0.02,30.62l0.02 1.54c0.87,-0.23 3.92,-1.73 5.3,-2.3 1.08,-0.45 0.8,-0.55 0.8,-1.83l-0.01 -30.25 -6.09 2.21z" />
            <path d="M8.3 23.27l0.03 30.57c1.05,-0.22 5.02,-2.65 6.27,-3.23l0.04 -30.05 -6.34 2.7z" />
            <path d="M18.44 14.8l0 23.22 0 0.77c0.79,-0.15 5.63,-2.25 6.26,-2.67l0.08 -1.56 -0.01 -22.89 -6.33 3.12z" />
          </svg>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 96, fontWeight: 700, color: '#FFFFFF', letterSpacing: -2, lineHeight: 1 }}>
              {BRAND_FALLBACK.name}
            </div>
            <div style={{ fontSize: 40, fontWeight: 600, color: AZUL, letterSpacing: 10, marginTop: 14 }}>
              {BRAND_FALLBACK.subtitle}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 28, color: '#8B9BB0', marginTop: 48, display: 'flex' }}>
          Opções digitais · Negocie em minutos
        </div>
      </div>
    ),
    size,
  )
}
