/**
 * Ícones do menu lateral, em SVG inline no estilo duotone do set enviado:
 * contorno grosso arredondado + uma forma de acento deslocada atrás.
 *
 * O acento NÃO usa azul fixo de propósito. O botão ativo tem fundo azul sólido,
 * e azul sobre azul sumiria. Usando currentColor com opacidade, o acento vira
 * branco translúcido no estado ativo e cinza sutil no inativo — o duotone se
 * mantém nos dois, sem um caso ilegível.
 */

interface IconProps { size?: number; className?: string }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
})

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Grade de 4 quadrados arredondados, com acento atrás do quadrante superior direito. */
export function GridIcon({ size = 21, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="15" y="3.6" width="6.6" height="6.6" rx="2.2" fill="currentColor" opacity="0.32" />
      <rect x="3.2" y="3.2" width="7.6" height="7.6" rx="2.5" {...stroke} />
      <rect x="13.2" y="3.2" width="7.6" height="7.6" rx="2.5" {...stroke} />
      <rect x="3.2" y="13.2" width="7.6" height="7.6" rx="2.5" {...stroke} />
      <rect x="13.2" y="13.2" width="7.6" height="7.6" rx="2.5" {...stroke} />
    </svg>
  )
}

/** Escudo com check, acento deslocado sob o traço do check. */
export function ShieldCheckIcon({ size = 21, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M9.2 12.9l2.3 2.3 5-4.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.34" />
      <path d="M12 2.6l7.2 3v6c0 4.4-3 8.2-7.2 9.8-4.2-1.6-7.2-5.4-7.2-9.8v-6l7.2-3z" {...stroke} />
      <path d="M8.4 12.1l2.3 2.3 5-4.6" {...stroke} />
    </svg>
  )
}

/** Usuário dentro de círculo, acento atrás da cabeça. */
export function UserCircleIcon({ size = 21, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <circle cx="13.1" cy="10.2" r="3.5" fill="currentColor" opacity="0.32" />
      <circle cx="12" cy="12" r="9.2" {...stroke} />
      <circle cx="12" cy="9.9" r="3.4" {...stroke} />
      <path d="M5.6 19.2a7.2 7.2 0 0 1 12.8 0" {...stroke} />
    </svg>
  )
}

/** Headset de suporte, acentos deslocados atrás dos protetores. */
export function HeadsetIcon({ size = 21, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="3.4" y="11.4" width="4.4" height="6.4" rx="1.9" fill="currentColor" opacity="0.32" />
      <rect x="16.2" y="11.4" width="4.4" height="6.4" rx="1.9" fill="currentColor" opacity="0.32" />
      <path d="M4.2 12.4v-.6a7.8 7.8 0 0 1 15.6 0v.6" {...stroke} />
      <rect x="2.4" y="11.6" width="4" height="6" rx="1.8" {...stroke} />
      <rect x="17.6" y="11.6" width="4" height="6" rx="1.8" {...stroke} />
      <path d="M19.6 17.6v1.2a2.4 2.4 0 0 1-2.4 2.4h-2.6" {...stroke} />
    </svg>
  )
}
