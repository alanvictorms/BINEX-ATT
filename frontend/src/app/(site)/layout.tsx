import type { Viewport } from 'next'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { CookieBanner } from '@/components/site/CookieBanner'

// O site público precisa de zoom liberado — requisito de acessibilidade.
// A plataforma trava o zoom no layout do grupo (app), não aqui.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  // O atributo data-vx-site é o gatilho das regras em globals.css que liberam
  // o scroll da janela e sobem a raiz pra 16px — a plataforma trava as duas
  // coisas por padrão. Sem ele o site não rola.
  return (
    <div data-vx-site className="flex min-h-dvh flex-col bg-[#0a0d12] text-white antialiased">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CookieBanner />
    </div>
  )
}
