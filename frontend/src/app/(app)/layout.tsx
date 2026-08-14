import type { Viewport } from 'next'

// Bloqueia pinch-to-zoom da página inteira para o chart capturar o gesto.
// Trading apps tipicamente desativam zoom da página — usuário pincha no gráfico.
// Fica AQUI e não no root layout: o site público (marketing/jurídico) precisa
// de zoom liberado, que é requisito de acessibilidade.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div data-vx-app className="h-full overflow-hidden overscroll-none">{children}</div>
}
