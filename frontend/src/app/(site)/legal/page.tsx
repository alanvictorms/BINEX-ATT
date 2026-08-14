import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { LEGAL_DOCS } from '@/content/legal'
import { EMPRESA, IDENTIFICACAO_LINHAS, LEGAL_ATUALIZADO_EM, formatarData } from '@/content/legal/empresa'

export const metadata: Metadata = {
  title: 'Documentos e Políticas',
  description:
    `Termos de Uso, Aviso de Risco, Política de Privacidade, regras de bônus e demais documentos da ${EMPRESA.marca}.`,
  alternates: { canonical: '/legal' },
}

export default function LegalIndexPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-14">
      <header className="max-w-2xl">
        <h1 className="text-[30px] font-bold leading-tight text-white md:text-[38px]">
          Documentos e Políticas
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-white/60">
          Todas as regras que valem entre você e a {EMPRESA.marca}, em linguagem direta. Se for ler
          só um antes de depositar, leia o Aviso de Risco.
        </p>
        <p className="mt-3 text-[14px] text-white/40">
          Última revisão do conjunto: {formatarData(LEGAL_ATUALIZADO_EM)}
        </p>
      </header>

      <ul className="mt-10 grid gap-3 md:grid-cols-2">
        {LEGAL_DOCS.map(doc => (
          <li key={doc.slug}>
            <Link
              href={`/legal/${doc.slug}`}
              className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/25 hover:bg-white/[0.05]"
            >
              <span className="flex items-center gap-2 text-[16px] font-semibold text-white">
                {doc.short}
                <ArrowRight
                  size={15}
                  className="text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70"
                />
              </span>
              <span className="mt-2 text-[14px] leading-relaxed text-white/50">{doc.summary}</span>
              <span className="mt-3 text-[12px] text-white/30">
                Atualizado em {formatarData(doc.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-12 rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-[16px] font-bold text-white">Fale com a gente</h2>
        {/* Some enquanto a entidade não estiver definida em empresa.ts */}
        {IDENTIFICACAO_LINHAS.length > 0 && (
          <div className="mt-3 space-y-1 text-[14px] leading-relaxed text-white/55">
            {IDENTIFICACAO_LINHAS.map(linha => (
              <p key={linha}>{linha}</p>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
          <a href={`mailto:${EMPRESA.emails.suporte}`} className="text-[#00e0a4] hover:underline">
            Suporte: {EMPRESA.emails.suporte}
          </a>
          <a href={`mailto:${EMPRESA.emails.privacidade}`} className="text-[#00e0a4] hover:underline">
            Privacidade: {EMPRESA.emails.privacidade}
          </a>
          <a href={`mailto:${EMPRESA.emails.compliance}`} className="text-[#00e0a4] hover:underline">
            Compliance: {EMPRESA.emails.compliance}
          </a>
        </div>
      </section>
    </div>
  )
}
