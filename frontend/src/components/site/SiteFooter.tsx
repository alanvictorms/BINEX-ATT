'use client'

import Link from 'next/link'
import { BrandMark } from '@/components/brand/BrandMark'
import { LEGAL_DOCS } from '@/content/legal'
import { EMPRESA, IDENTIFICACAO_LINHAS } from '@/content/legal/empresa'
import { CookiePreferencesButton } from './CookieBanner'
import { useSiteBrand } from '@/lib/useSiteBrand'

/** Metade dos documentos em cada coluna, na ordem definida em LEGAL_DOCS. */
const meio = Math.ceil(LEGAL_DOCS.length / 2)
const colunaA = LEGAL_DOCS.slice(0, meio)
const colunaB = LEGAL_DOCS.slice(meio)

export function SiteFooter() {
  const siteBrand = useSiteBrand()
  return (
    <footer className="border-t border-white/10 bg-[#070a0e]">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <BrandMark size={30} />
              <span className="text-[15px] font-bold tracking-[0.14em] text-white">{siteBrand.name}</span>
            </div>
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-white/50">
              Plataforma de negociação de opções digitais. Conta demonstração gratuita, depósito e
              saque via Pix.
            </p>

            {/* Some enquanto a entidade não estiver definida em empresa.ts */}
            {IDENTIFICACAO_LINHAS.length > 0 && (
              <div className="mt-6 space-y-1 text-[13px] leading-relaxed text-white/40">
                {IDENTIFICACAO_LINHAS.map(linha => (
                  <p key={linha}>{linha}</p>
                ))}
              </div>
            )}

            <p className="mt-6 max-w-md text-[13px] leading-relaxed text-white/40">
              A {EMPRESA.curta} não é instituição financeira, não presta consultoria de investimento e não
              possui registro ou autorização de órgão regulador do mercado de valores mobiliários.
              Serviço restrito a maiores de {EMPRESA.idadeMinima} anos.
            </p>
          </div>

          <FooterColuna titulo="Documentos" docs={colunaA} />
          <FooterColuna docs={colunaB} extra />
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-white/35">
            © {new Date().getFullYear()} {EMPRESA.marca}. Todos os direitos reservados.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            <a href={`mailto:${EMPRESA.emails.suporte}`} className="text-white/45 hover:text-white">
              {EMPRESA.emails.suporte}
            </a>
            <CookiePreferencesButton />
          </div>
        </div>

        {/* Aviso de risco: última linha do rodapé, em cinza discreto — mesmo
            lugar e mesmo peso que as corretoras do nicho usam. Precisa existir
            em todas as páginas, mas não precisa gritar. */}
        <p className="mt-6 text-[12px] leading-relaxed text-white/25">
          A negociação de opções digitais envolve risco elevado e pode resultar na perda total do
          capital investido. Não invista dinheiro que você não pode perder.{' '}
          <Link href="/legal/aviso-de-risco" className="underline underline-offset-2 hover:text-white/50">
            Aviso de risco completo
          </Link>
          .
        </p>
      </div>
    </footer>
  )
}

function FooterColuna({
  titulo,
  docs,
  extra,
}: {
  /** Sem título = coluna de continuação, alinhada com a anterior por um espaçador. */
  titulo?: string
  docs: typeof LEGAL_DOCS
  extra?: boolean
}) {
  return (
    <div>
      {titulo
        ? <h3 className="text-[13px] font-bold uppercase tracking-wider text-white/70">{titulo}</h3>
        : <div aria-hidden className="hidden h-[19px] md:block" />}
      <ul className="mt-4 space-y-2.5">
        {docs.map(doc => (
          <li key={doc.slug}>
            <Link
              href={`/legal/${doc.slug}`}
              className="text-[14px] leading-snug text-white/50 hover:text-white"
            >
              {doc.short}
            </Link>
          </li>
        ))}
        {extra && (
          <li>
            <Link href="/legal" className="text-[14px] text-white/50 hover:text-white">
              Todos os documentos
            </Link>
          </li>
        )}
      </ul>
    </div>
  )
}
