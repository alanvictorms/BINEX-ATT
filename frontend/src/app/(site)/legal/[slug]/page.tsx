import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { LEGAL_DOCS, getLegalDoc } from '@/content/legal'
import { EMPRESA, formatarData } from '@/content/legal/empresa'
import { LegalBlocks } from '@/components/site/LegalBody'

/** Todos os documentos são conhecidos em build — nada aqui é dinâmico. */
export function generateStaticParams() {
  return LEGAL_DOCS.map(doc => ({ slug: doc.slug }))
}

export const dynamicParams = false

export async function generateMetadata(props: PageProps<'/legal/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params
  const doc = getLegalDoc(slug)
  if (!doc) return {}
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: `/legal/${doc.slug}` },
    openGraph: { title: `${doc.title} | ${EMPRESA.marca}`, description: doc.summary, type: 'article' },
  }
}

export default async function LegalDocPage(props: PageProps<'/legal/[slug]'>) {
  const { slug } = await props.params
  const doc = getLegalDoc(slug)
  if (!doc) notFound()

  return (
    <article className="mx-auto max-w-6xl px-5 py-12">
      <Link
        href="/legal"
        className="inline-flex items-center gap-1.5 text-[14px] text-white/50 hover:text-white"
      >
        <ChevronLeft size={15} />
        Todos os documentos
      </Link>

      <header className="mt-6 border-b border-white/10 pb-8">
        <h1 className="text-[28px] font-bold leading-tight text-white md:text-[34px]">{doc.title}</h1>
        <p className="mt-3 text-[14px] text-white/45">
          Última atualização: {formatarData(doc.updatedAt)}
        </p>
      </header>

      <div className="mt-10 gap-12 lg:flex">
        {/* Índice — fica grudado na lateral em telas grandes */}
        <nav aria-label="Índice do documento" className="mb-10 flex-shrink-0 lg:mb-0 lg:w-60">
          <div className="lg:sticky lg:top-24">
            <p className="text-[12px] font-bold uppercase tracking-wider text-white/40">Nesta página</p>
            <ul className="mt-3 space-y-1.5 border-l border-white/10 pl-4">
              {doc.sections.map(section => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block text-[13px] leading-snug text-white/50 hover:text-white"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          <LegalBlocks blocks={doc.intro} />

          {doc.sections.map(section => (
            <section key={section.id} id={section.id} className="mt-10 scroll-mt-24">
              <h2 className="text-[19px] font-bold leading-snug text-white">{section.title}</h2>
              <div className="mt-3">
                <LegalBlocks blocks={section.blocks} />
              </div>
            </section>
          ))}

          <OutrosDocumentos slug={doc.slug} />
        </div>
      </div>
    </article>
  )
}

function OutrosDocumentos({ slug }: { slug: string }) {
  const outros = LEGAL_DOCS.filter(d => d.slug !== slug)
  return (
    <nav className="mt-16 border-t border-white/10 pt-8">
      <p className="text-[12px] font-bold uppercase tracking-wider text-white/40">Outros documentos</p>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2.5">
        {outros.map(d => (
          <li key={d.slug}>
            <Link href={`/legal/${d.slug}`} className="text-[14px] text-white/55 hover:text-white">
              {d.short}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
