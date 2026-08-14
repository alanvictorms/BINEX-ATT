import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { ImpersonationBanner } from '@/components/auth/ImpersonationBanner'
import { BrandProvider } from '@/components/brand/BrandProvider'
import { SITE_URL } from '@/lib/site'

import { getSiteContent } from '@/lib/siteContent'

const inter = Inter({ subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent()
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: c.meta.title,
      template: `%s | ${c.brand.fullName}`,
    },
    description: c.meta.description,
  }
}

// O lock de zoom vive no layout do grupo (app) — o site público precisa de
// zoom liberado (acessibilidade). Aqui fica só o básico.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Marca resolvida no servidor e injetada no provider: o wordmark já sai no
  // HTML, em vez de o cliente buscar depois e trocar na frente do usuário.
  // Mesma chamada do generateMetadata acima — o cache() dedupa por request.
  const { brand } = await getSiteContent()

  return (
    <html lang="pt-BR" className="h-full">
      <body className={`${inter.className} h-full overflow-hidden`}>
        <BrandProvider value={brand}>
          <AuthProvider>
            <Suspense fallback={null}><ImpersonationBanner /></Suspense>
            {children}
          </AuthProvider>
        </BrandProvider>
      </body>
    </html>
  )
}
