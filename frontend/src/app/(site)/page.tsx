import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight, BadgeCheck, Bitcoin, CandlestickChart, CircleDollarSign,
  Fuel, GraduationCap, LockKeyhole, Repeat2, ScrollText, ShieldCheck,
  TrendingUp, Users, Zap,
} from 'lucide-react'
import { LightRays } from '@/components/site/LightRays'
import { getSiteContent, type SiteContent } from '@/lib/siteContent'

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent()
  return {
    title: c.meta.title,
    description: c.meta.description,
    alternates: { canonical: '/' },
  }
}

export const revalidate = 60 // revalidate every 60 seconds

export default async function HomePage() {
  const c = await getSiteContent()
  return (
    <>
      <Hero c={c} />
      <Numeros c={c} />
      <ComoFunciona c={c} />
      <Ativos c={c} />
      <CopyTrading c={c} />
      <Seguranca c={c} />
      <Faq c={c} />
      <CtaFinal c={c} />
    </>
  )
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */

function Hero({ c }: { c: SiteContent }) {
  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(50% 50% at 50% 50%, #00b3ff 0%, transparent 70%)' }}
      />

      <LightRays
        raysOrigin="top-center"
        raysColor="#00b3ff"
        raysSpeed={0.8}
        lightSpread={0.9}
        rayLength={1.6}
        followMouse
        mouseInfluence={0.12}
        noiseAmount={0.02}
        distortion={0.03}
        className="opacity-55"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{ background: 'linear-gradient(to top, #0a0d12 0%, transparent 100%)' }}
      />

      <div className="relative mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] text-white/70">
            <GraduationCap size={14} className="text-[#00e0a4]" />
            {c.hero.badge}
          </span>

          <h1 className="mt-6 text-[36px] font-bold leading-[1.1] tracking-tight text-white md:text-[54px]">
            {c.hero.title}{' '}
            <span className="bg-gradient-to-r from-[#00e0a4] to-[#00b3ff] bg-clip-text text-transparent">
              {c.hero.titleHighlight}
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/60">
            {c.hero.subtitle}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login?tab=register"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#00e0a4] to-[#00b3ff] px-7 py-3.5 text-[15px] font-bold text-[#06121b] transition-opacity hover:opacity-90"
            >
              {c.hero.ctaPrimary}
              <ArrowRight size={17} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg border border-white/15 px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-white/5"
            >
              {c.hero.ctaSecondary}
            </Link>
          </div>

          <p className="mt-6 max-w-lg text-[13px] leading-relaxed text-white/40">
            {c.hero.disclaimer}{' '}
            Restrito a maiores de {c.company.minAge} anos.{' '}
            <Link href="/legal/aviso-de-risco" className="underline underline-offset-2 hover:text-white/70">
              Aviso de risco
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}

/* ── Faixa de destaques ───────────────────────────────────────────────────── */

const HIGHLIGHT_ICONS = [Zap, CandlestickChart, GraduationCap, LockKeyhole]

function Numeros({ c }: { c: SiteContent }) {
  return (
    <section className="border-b border-white/10 bg-white/[0.02]">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {c.highlights.map((item, i) => {
          const Icone = HIGHLIGHT_ICONS[i % HIGHLIGHT_ICONS.length]
          return (
            <div key={i} className="flex gap-3.5">
              <Icone size={20} className="mt-0.5 flex-shrink-0 text-[#00e0a4]" />
              <div>
                <p className="text-[15px] font-bold text-white">{item.title}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-white/50">{item.text}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ── Como funciona ────────────────────────────────────────────────────────── */

function ComoFunciona({ c }: { c: SiteContent }) {
  return (
    <section id="como-funciona" className="scroll-mt-24 border-b border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-[28px] font-bold leading-tight text-white md:text-[34px]">Como funciona</h2>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-white/55">
          Tres passos ate a primeira operacao. Nenhum deles cobra nada de voce.
        </p>

        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {c.steps.map(passo => (
            <li key={passo.n} className="border-t border-white/15 pt-5">
              <span className="text-[13px] font-bold tracking-widest text-[#00b3ff]">{passo.n}</span>
              <h3 className="mt-3 text-[18px] font-bold text-white">{passo.title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-white/55">{passo.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ── Ativos ───────────────────────────────────────────────────────────────── */

const ASSET_ICONS = [CircleDollarSign, Bitcoin, Fuel]

function Ativos({ c }: { c: SiteContent }) {
  return (
    <section id="ativos" className="scroll-mt-24 border-b border-white/10 bg-white/[0.02]">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-[28px] font-bold leading-tight text-white md:text-[34px]">
          {c.assets.title}
        </h2>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {c.assets.categories.map((cat, i) => {
            const Icone = ASSET_ICONS[i % ASSET_ICONS.length]
            return (
              <div key={i} className="rounded-xl border border-white/10 bg-[#0a0d12] p-6">
                <Icone size={22} className="text-[#00e0a4]" />
                <h3 className="mt-4 text-[17px] font-bold text-white">{cat.name}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/50">{cat.examples}</p>
              </div>
            )
          })}
        </div>

        <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-white/35">
          {c.assets.otcNote}{' '}
          <Link
            href="/legal/execucao-e-conflito-de-interesse"
            className="underline underline-offset-2 hover:text-white/70"
          >
            Saiba como funciona
          </Link>
          .
        </p>
      </div>
    </section>
  )
}

/* ── Copy Trading ─────────────────────────────────────────────────────────── */

const COPY_ICONS = [TrendingUp, Repeat2, Users]

function CopyTrading({ c }: { c: SiteContent }) {
  return (
    <section id="copy-trading" className="scroll-mt-24 border-b border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] text-white/70">
          <Users size={14} className="text-[#00e0a4]" />
          {c.copyTrading.badge}
        </span>

        <h2 className="mt-6 max-w-2xl text-[28px] font-bold leading-tight text-white md:text-[34px]">
          {c.copyTrading.title}
        </h2>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-white/55">
          {c.copyTrading.subtitle}
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {c.copyTrading.features.map((feat, i) => {
            const Icone = COPY_ICONS[i % COPY_ICONS.length]
            return (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <Icone size={20} className="text-[#00e0a4]" />
                <h3 className="mt-4 text-[17px] font-bold text-white">{feat.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/55">{feat.text}</p>
              </div>
            )
          })}
        </div>

        <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-white/35">
          {c.copyTrading.disclaimer}
        </p>
      </div>
    </section>
  )
}

/* ── Seguranca ────────────────────────────────────────────────────────────── */

const SEC_ICONS = [ShieldCheck, LockKeyhole, BadgeCheck, ScrollText]

function Seguranca({ c }: { c: SiteContent }) {
  return (
    <section id="seguranca" className="scroll-mt-24 border-b border-white/10">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-[28px] font-bold leading-tight text-white md:text-[34px]">
          {c.security.title}
        </h2>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-white/55">
          {c.security.subtitle}
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {c.security.pillars.map((pilar, i) => {
            const Icone = SEC_ICONS[i % SEC_ICONS.length]
            return (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <Icone size={20} className="text-[#00b3ff]" />
                <h3 className="mt-4 text-[17px] font-bold text-white">{pilar.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/55">{pilar.text}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ── FAQ ──────────────────────────────────────────────────────────────────── */

function Faq({ c }: { c: SiteContent }) {
  return (
    <section className="border-b border-white/10 bg-white/[0.02]">
      <div className="mx-auto max-w-3xl px-5 py-20">
        <h2 className="text-[28px] font-bold leading-tight text-white md:text-[34px]">
          Perguntas frequentes
        </h2>

        <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
          {c.faq.map((item, i) => (
            <details key={i} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[16px] font-semibold text-white marker:hidden">
                {item.q}
                <span
                  aria-hidden
                  className="mt-1 flex-shrink-0 text-[20px] leading-none text-white/40 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 pr-8 text-[15px] leading-[1.7] text-white/60">{item.a}</p>
            </details>
          ))}
        </div>

        <p className="mt-8 text-[15px] text-white/50">
          Nao achou sua duvida?{' '}
          <a href={`mailto:${c.company.emails.suporte}`} className="text-[#00e0a4] hover:underline">
            {c.company.emails.suporte}
          </a>
        </p>
      </div>
    </section>
  )
}

/* ── CTA final ────────────────────────────────────────────────────────────── */

function CtaFinal({ c }: { c: SiteContent }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 text-center">
      <h2 className="text-[28px] font-bold leading-tight text-white md:text-[34px]">
        {c.cta.title}
      </h2>
      <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-white/55">
        {c.cta.subtitle}
      </p>
      <Link
        href="/login?tab=register"
        className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#00e0a4] to-[#00b3ff] px-8 py-3.5 text-[15px] font-bold text-[#06121b] transition-opacity hover:opacity-90"
      >
        {c.cta.button}
        <ArrowRight size={17} />
      </Link>
    </section>
  )
}
