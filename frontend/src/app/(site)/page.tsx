import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight, BadgeCheck, Bitcoin, CandlestickChart, CircleDollarSign,
  Fuel, GraduationCap, LockKeyhole, Repeat2, ScrollText, ShieldCheck,
  TrendingUp, Users, Zap, ChevronRight, BarChart3, Globe, Clock,
  Wallet, Target, Award, Shield, LineChart, Layers, ArrowUpRight,
} from 'lucide-react'
import { getSiteContent, type SiteContent } from '@/lib/siteContent'

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent()
  return {
    title: c.meta.title,
    description: c.meta.description,
    alternates: { canonical: '/' },
  }
}

export const revalidate = 60

export default async function HomePage() {
  const c = await getSiteContent()
  return (
    <>
      <Hero c={c} />
      <Stats />
      <ComoFunciona c={c} />
      <Ativos c={c} />
      <Features />
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
    <section className="relative overflow-hidden border-b border-[#1B2735]">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[500px] opacity-20"
        style={{ background: 'radial-gradient(50% 60% at 50% 0%, #2E6BE6 0%, transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute top-0 right-0 w-[600px] h-[600px] opacity-10"
        style={{ background: 'radial-gradient(50% 50% at 70% 30%, #1FD196 0%, transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{ background: 'linear-gradient(to top, #0A101A 0%, transparent 100%)' }} />

      <div className="relative mx-auto max-w-6xl px-5 py-24 md:py-36">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1B2735] bg-[#0C131F] px-3.5 py-1.5 text-[13px] text-[#AEBBCB]">
            <GraduationCap size={14} className="text-[#1FD196]" />
            {c.hero.badge}
          </span>

          <h1 className="mt-7 text-[38px] font-bold leading-[1.08] tracking-tight text-white md:text-[56px]">
            {c.hero.title}{' '}
            <span className="text-[#1FD196]">{c.hero.titleHighlight}</span>
          </h1>

          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[#7E8DA2]">
            {c.hero.subtitle}
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/login?tab=register" data-testid="hero-cta-register"
              className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#1FD196] px-8 py-3.5 text-[15px] font-bold text-[#0A101A] transition-all hover:bg-[#17B882] hover:shadow-[0_0_30px_rgba(31,209,150,0.25)]">
              {c.hero.ctaPrimary}
              <ArrowRight size={17} />
            </Link>
            <Link href="/login" data-testid="hero-cta-login"
              className="inline-flex items-center justify-center rounded-[10px] border border-[#1B2735] bg-[#0C131F] px-8 py-3.5 text-[15px] font-semibold text-white transition-colors hover:border-[#2E6BE6]/50 hover:bg-[#0C131F]/80">
              {c.hero.ctaSecondary}
            </Link>
          </div>

          <p className="mt-7 max-w-lg text-[13px] leading-relaxed text-[#5D6C80]">
            {c.hero.disclaimer}{' '}
            Restrito a maiores de {c.company.minAge} anos.{' '}
            <Link href="/legal/aviso-de-risco" className="underline underline-offset-2 hover:text-[#7E8DA2]">
              Aviso de risco
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}

/* ── Stats bar ────────────────────────────────────────────────────────────── */
function Stats() {
  const stats = [
    { icon: <Users size={18} />, value: '50.000+', label: 'Traders ativos' },
    { icon: <BarChart3 size={18} />, value: 'R$ 2.8B', label: 'Volume negociado' },
    { icon: <Globe size={18} />, value: '24/7', label: 'Mercado OTC' },
    { icon: <Clock size={18} />, value: '< 1s', label: 'Execução' },
  ]
  return (
    <section className="border-b border-[#1B2735] bg-[#0C131F]">
      <div className="mx-auto max-w-6xl px-5 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[#4B8CF5]">{s.icon}</span>
              <div>
                <div className="text-[20px] font-bold text-white">{s.value}</div>
                <div className="text-[12px] text-[#7E8DA2]">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Como funciona ────────────────────────────────────────────────────────── */
function ComoFunciona({ c }: { c: SiteContent }) {
  return (
    <section id="como-funciona" className="scroll-mt-24 border-b border-[#1B2735]">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-[28px] font-bold text-white md:text-[34px]">Como funciona</h2>
        <p className="mt-3 max-w-xl text-[15px] text-[#7E8DA2]">
          Tres passos ate a primeira operacao. Nenhum deles cobra nada de voce.
        </p>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {c.steps.map(passo => (
            <li key={passo.n} className="rounded-[10px] border border-[#1B2735] bg-[#0C131F] p-6">
              <span className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-full border border-[#2E6BE6]/50 bg-[#2E6BE6]/10 text-[13px] font-bold text-[#6C9CF8]">{passo.n}</span>
              <h3 className="mt-4 text-[17px] font-bold text-white">{passo.title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-[#7E8DA2]">{passo.text}</p>
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
    <section id="ativos" className="scroll-mt-24 border-b border-[#1B2735] bg-[#0C131F]/50">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-[28px] font-bold text-white md:text-[34px]">{c.assets.title}</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {c.assets.categories.map((cat, i) => {
            const Icone = ASSET_ICONS[i % ASSET_ICONS.length]
            return (
              <div key={i} className="rounded-[10px] border border-[#1B2735] bg-[#0A101A] p-6 hover:border-[#2E6BE6]/30 transition-colors">
                <div className="flex items-center justify-center w-[42px] h-[42px] rounded-[10px] bg-[#1FD196]/10 border border-[#1FD196]/20">
                  <Icone size={20} className="text-[#1FD196]" />
                </div>
                <h3 className="mt-4 text-[17px] font-bold text-white">{cat.name}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#7E8DA2]">{cat.examples}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-8 max-w-3xl text-[13px] text-[#5D6C80]">
          {c.assets.otcNote}{' '}
          <Link href="/legal/execucao-e-conflito-de-interesse" className="underline underline-offset-2 hover:text-[#7E8DA2]">
            Saiba como funciona
          </Link>.
        </p>
      </div>
    </section>
  )
}

/* ── Features ─────────────────────────────────────────────────────────────── */
function Features() {
  const items = [
    { icon: <LineChart size={20} />, title: 'Gráficos Profissionais', desc: 'Ferramentas avançadas de análise técnica com indicadores em tempo real.' },
    { icon: <Zap size={20} />, title: 'Execução Instantânea', desc: 'Operações processadas em menos de 1 segundo com preços precisos.' },
    { icon: <Layers size={20} />, title: 'Conta Demo Gratuita', desc: 'Pratique com R$10.000 virtuais sem arriscar seu capital.' },
    { icon: <Target size={20} />, title: 'Payouts até 95%', desc: 'Retornos competitivos nos principais pares de moedas e ativos OTC.' },
    { icon: <Award size={20} />, title: 'Torneios', desc: 'Compita com outros traders e ganhe prêmios reais.' },
    { icon: <Shield size={20} />, title: 'Regulamentado', desc: 'Plataforma segura com criptografia de nível bancário e KYC.' },
  ]
  return (
    <section className="border-b border-[#1B2735]">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1B2735] bg-[#0C131F] px-3.5 py-1.5 text-[13px] text-[#AEBBCB]">
            <CandlestickChart size={14} className="text-[#4B8CF5]" />
            Plataforma completa
          </span>
        </div>
        <h2 className="mt-4 text-[28px] font-bold text-white md:text-[34px]">
          Tudo que você precisa para operar
        </h2>
        <p className="mt-3 max-w-xl text-[15px] text-[#7E8DA2]">
          Uma plataforma pensada para traders de todos os níveis.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-[10px] border border-[#1B2735] bg-[#0C131F] p-5 hover:border-[#2E6BE6]/30 transition-colors group">
              <div className="flex items-center justify-center w-[38px] h-[38px] rounded-[10px] bg-[#2E6BE6]/10 border border-[#2E6BE6]/20 text-[#6C9CF8] group-hover:bg-[#2E6BE6]/20 transition-colors">
                {item.icon}
              </div>
              <h3 className="mt-4 text-[16px] font-bold text-white">{item.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[#7E8DA2]">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Copy Trading ─────────────────────────────────────────────────────────── */
const COPY_ICONS = [TrendingUp, Repeat2, Users]

function CopyTrading({ c }: { c: SiteContent }) {
  return (
    <section id="copy-trading" className="scroll-mt-24 border-b border-[#1B2735] bg-[#0C131F]/50">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#1B2735] bg-[#0C131F] px-3.5 py-1.5 text-[13px] text-[#AEBBCB]">
          <Users size={14} className="text-[#1FD196]" />
          {c.copyTrading.badge}
        </span>
        <h2 className="mt-6 max-w-2xl text-[28px] font-bold text-white md:text-[34px]">{c.copyTrading.title}</h2>
        <p className="mt-4 max-w-xl text-[15px] text-[#7E8DA2]">{c.copyTrading.subtitle}</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {c.copyTrading.features.map((feat, i) => {
            const Icone = COPY_ICONS[i % COPY_ICONS.length]
            return (
              <div key={i} className="rounded-[10px] border border-[#1B2735] bg-[#0A101A] p-6 hover:border-[#1FD196]/30 transition-colors">
                <div className="flex items-center justify-center w-[42px] h-[42px] rounded-[10px] bg-[#1FD196]/10 border border-[#1FD196]/20">
                  <Icone size={20} className="text-[#1FD196]" />
                </div>
                <h3 className="mt-4 text-[17px] font-bold text-white">{feat.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#7E8DA2]">{feat.text}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-6 max-w-3xl text-[13px] text-[#5D6C80]">{c.copyTrading.disclaimer}</p>
      </div>
    </section>
  )
}

/* ── Seguranca ────────────────────────────────────────────────────────────── */
const SEC_ICONS = [ShieldCheck, LockKeyhole, BadgeCheck, ScrollText]

function Seguranca({ c }: { c: SiteContent }) {
  return (
    <section id="seguranca" className="scroll-mt-24 border-b border-[#1B2735]">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-[28px] font-bold text-white md:text-[34px]">{c.security.title}</h2>
        <p className="mt-3 max-w-xl text-[15px] text-[#7E8DA2]">{c.security.subtitle}</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {c.security.pillars.map((pilar, i) => {
            const Icone = SEC_ICONS[i % SEC_ICONS.length]
            return (
              <div key={i} className="rounded-[10px] border border-[#1B2735] bg-[#0C131F] p-6">
                <div className="flex items-center justify-center w-[42px] h-[42px] rounded-[10px] bg-[#4B8CF5]/10 border border-[#4B8CF5]/20">
                  <Icone size={20} className="text-[#4B8CF5]" />
                </div>
                <h3 className="mt-4 text-[17px] font-bold text-white">{pilar.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#7E8DA2]">{pilar.text}</p>
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
    <section className="border-b border-[#1B2735] bg-[#0C131F]/50">
      <div className="mx-auto max-w-3xl px-5 py-20">
        <h2 className="text-[28px] font-bold text-white md:text-[34px]">Perguntas frequentes</h2>
        <div className="mt-10 divide-y divide-[#1B2735] border-y border-[#1B2735]">
          {c.faq.map((item, i) => (
            <details key={i} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[16px] font-semibold text-white marker:hidden">
                {item.q}
                <span aria-hidden className="mt-1 flex-shrink-0 text-[20px] leading-none text-[#5D6C80] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 pr-8 text-[15px] leading-[1.7] text-[#7E8DA2]">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-[15px] text-[#7E8DA2]">
          Nao achou sua duvida?{' '}
          <a href={`mailto:${c.company.emails.suporte}`} className="text-[#1FD196] hover:underline">{c.company.emails.suporte}</a>
        </p>
      </div>
    </section>
  )
}

/* ── CTA final ────────────────────────────────────────────────────────────── */
function CtaFinal({ c }: { c: SiteContent }) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-15"
        style={{ background: 'radial-gradient(50% 80% at 50% 100%, #1FD196 0%, transparent 70%)' }} />
      <div className="relative mx-auto max-w-6xl px-5 py-24 text-center">
        <h2 className="text-[28px] font-bold text-white md:text-[36px]">{c.cta.title}</h2>
        <p className="mx-auto mt-4 max-w-lg text-[16px] text-[#7E8DA2]">{c.cta.subtitle}</p>
        <Link href="/login?tab=register" data-testid="cta-register-btn"
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#1FD196] px-8 py-3.5 text-[15px] font-bold text-[#0A101A] transition-all hover:bg-[#17B882] hover:shadow-[0_0_30px_rgba(31,209,150,0.25)]">
          {c.cta.button}
          <ArrowRight size={17} />
        </Link>
      </div>
    </section>
  )
}
