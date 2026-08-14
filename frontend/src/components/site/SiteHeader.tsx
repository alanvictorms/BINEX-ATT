'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { cn } from '@/lib/utils'
import { useSiteBrand } from '@/lib/useSiteBrand'

const NAV = [
  { href: '/#como-funciona', label: 'Como funciona' },
  { href: '/#ativos',        label: 'Ativos' },
  { href: '/#seguranca',     label: 'Segurança' },
  { href: '/legal',          label: 'Documentos' },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const siteBrand = useSiteBrand()

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0d12]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <BrandLogo size={30} where="site">
            <span className="text-[15px] font-bold tracking-[0.14em] text-white">{siteBrand.name}</span>
          </BrandLogo>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[14px] text-white/65 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-[14px] font-semibold text-white/80 transition-colors hover:text-white"
          >
            Entrar
          </Link>
          <Link
            href="/login?tab=register"
            className="rounded-lg bg-gradient-to-r from-[#00e0a4] to-[#00b3ff] px-4 py-2 text-[14px] font-bold text-[#06121b] transition-opacity hover:opacity-90"
          >
            Abrir conta
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          className="text-white md:hidden"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <div className={cn('border-t border-white/10 md:hidden', open ? 'block' : 'hidden')}>
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2.5 text-[15px] text-white/75 hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-3 flex flex-col gap-2">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/15 px-4 py-2.5 text-center text-[15px] font-semibold text-white"
            >
              Entrar
            </Link>
            <Link
              href="/login?tab=register"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-gradient-to-r from-[#00e0a4] to-[#00b3ff] px-4 py-2.5 text-center text-[15px] font-bold text-[#06121b]"
            >
              Abrir conta
            </Link>
          </div>
        </nav>
      </div>
    </header>
  )
}
