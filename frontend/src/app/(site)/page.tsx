import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight, BadgeCheck, Bitcoin, CandlestickChart, CircleDollarSign,
  Fuel, GraduationCap, LockKeyhole, Repeat2, ScrollText, ShieldCheck,
  TrendingUp, Users, Zap, BarChart3, Globe, Clock, Target, Award,
  Shield, LineChart, Layers, ChevronRight, Sparkles, Timer, Percent,
  Landmark, ArrowUpRight, Play, Star, CheckCircle2,
} from 'lucide-react'
import { getSiteContent, type SiteContent } from '@/lib/siteContent'

export async function generateMetadata(): Promise<Metadata> {
  const c = await getSiteContent()
  return { title: c.meta.title, description: c.meta.description, alternates: { canonical: '/' } }
}

export const revalidate = 60

export default async function HomePage() {
  const c = await getSiteContent()
  return (
    <div className="bg-[#060A11] text-white">
      <Hero c={c} />
      <TrustBar />
      <LivePreview />
      <ComoFunciona c={c} />
      <Mercados c={c} />
      <Plataforma />
      <CopyTrading c={c} />
      <Seguranca c={c} />
      <Depoimentos />
      <Faq c={c} />
      <CtaFinal c={c} />
    </div>
  )
}

/* ═══════════ HERO ═══════════ */
function Hero({ c }: { c: SiteContent }) {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden">
      {/* Animated background grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(46,107,230,0.07) 1px, transparent 0)', backgroundSize: '48px 48px' }} />
      {/* Glow orbs */}
      <div aria-hidden className="pointer-events-none absolute top-[-200px] left-[10%] w-[600px] h-[600px] rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #2E6BE6 0%, transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute bottom-[-100px] right-[5%] w-[500px] h-[500px] rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #1FD196 0%, transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-48" style={{ background: 'linear-gradient(to top, #060A11, transparent)' }} />

      <div className="relative mx-auto max-w-7xl w-full px-6 py-20 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1FD196]/30 bg-[#1FD196]/5 px-4 py-2 text-[13px] text-[#3FE0A6] mb-8">
            <Sparkles size={14} /> {c.hero.badge}
          </div>

          <h1 className="text-[42px] md:text-[62px] font-extrabold leading-[1.04] tracking-[-0.03em]">
            {c.hero.title}
            <br />
            <span className="bg-gradient-to-r from-[#1FD196] via-[#4B8CF5] to-[#A98BFF] bg-clip-text text-transparent">{c.hero.titleHighlight}</span>
          </h1>

          <p className="mt-7 max-w-lg text-[17px] leading-[1.7] text-[#7E8DA2]">{c.hero.subtitle}</p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login?tab=register" data-testid="hero-register"
              className="group relative inline-flex items-center gap-2.5 rounded-xl bg-[#1FD196] px-8 py-4 text-[16px] font-bold text-[#060A11] overflow-hidden transition-all hover:shadow-[0_0_40px_rgba(31,209,150,0.3)]">
              <span className="relative z-10">{c.hero.ctaPrimary}</span>
              <ArrowRight size={18} className="relative z-10 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/login" data-testid="hero-login"
              className="inline-flex items-center gap-2 rounded-xl border border-[#1B2735] bg-[#0C131F]/80 px-8 py-4 text-[16px] font-semibold text-white backdrop-blur-sm transition-all hover:border-[#2E6BE6]/50">
              <Play size={16} className="text-[#4B8CF5]" /> {c.hero.ctaSecondary}
            </Link>
          </div>

          <div className="mt-10 flex items-center gap-8 text-[13px] text-[#5D6C80]">
            <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-[#1FD196]" /> Regulamentado</span>
            <span className="flex items-center gap-2"><Zap size={14} className="text-[#F0B429]" /> Execução &lt;1s</span>
            <span className="flex items-center gap-2"><Globe size={14} className="text-[#4B8CF5]" /> OTC 24/7</span>
          </div>
        </div>

        {/* Right side - mock trading card */}
        <div className="hidden lg:block relative">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-[#1FD196]/10 via-transparent to-[#2E6BE6]/10 blur-xl" />
          <div className="relative rounded-2xl border border-[#1B2735] bg-[#0C131F] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#2E6BE6]/20 flex items-center justify-center"><CandlestickChart size={20} className="text-[#6C9CF8]" /></div>
                <div><div className="text-[15px] font-bold">EUR/USD</div><div className="text-[11px] text-[#1FD196]">OTC · 24/7</div></div>
              </div>
              <div className="text-right"><div className="text-[22px] font-bold tabular-nums">1.08542</div><div className="text-[12px] text-[#1FD196] font-semibold">+0.12%</div></div>
            </div>
            {/* Mini chart SVG */}
            <svg viewBox="0 0 400 120" className="w-full h-[120px] mb-6">
              <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1FD196" stopOpacity="0.3" /><stop offset="100%" stopColor="#1FD196" stopOpacity="0" /></linearGradient></defs>
              <path d="M0,80 C30,70 60,85 90,60 C120,35 150,50 180,40 C210,30 240,55 270,35 C300,15 330,25 360,20 C380,18 400,10 400,10 L400,120 L0,120 Z" fill="url(#cg)" />
              <path d="M0,80 C30,70 60,85 90,60 C120,35 150,50 180,40 C210,30 240,55 270,35 C300,15 330,25 360,20 C380,18 400,10 400,10" fill="none" stroke="#1FD196" strokeWidth="2.5" />
            </svg>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#1FD196]/10 border border-[#1FD196]/20 p-4 text-center"><div className="text-[11px] text-[#7E8DA2] mb-1">Payout</div><div className="text-[24px] font-bold text-[#1FD196]">92%</div></div>
              <div className="rounded-xl bg-[#2E6BE6]/10 border border-[#2E6BE6]/20 p-4 text-center"><div className="text-[11px] text-[#7E8DA2] mb-1">Tempo</div><div className="text-[24px] font-bold text-[#6C9CF8]">1 min</div></div>
            </div>
          </div>
        </div>
      </div>

      <p className="absolute bottom-6 left-6 right-6 text-center text-[12px] text-[#5D6C80]">
        {c.hero.disclaimer} · Restrito a maiores de {c.company.minAge} anos ·{' '}
        <Link href="/legal/aviso-de-risco" className="underline hover:text-[#5D6C80]">Aviso de risco</Link>
      </p>
    </section>
  )
}

/* ═══════════ TRUST BAR ═══════════ */
function TrustBar() {
  const items = [
    { icon: <Users size={20} />, val: '50.000+', label: 'Traders ativos' },
    { icon: <BarChart3 size={20} />, val: 'R$ 2.8B', label: 'Volume negociado' },
    { icon: <Timer size={20} />, val: '< 1s', label: 'Execução de ordens' },
    { icon: <Percent size={20} />, val: 'Até 95%', label: 'Payout' },
    { icon: <Globe size={20} />, val: '24/7', label: 'Mercado OTC' },
  ]
  return (
    <section className="border-y border-[#1B2735] bg-[#0C131F]">
      <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between gap-6 overflow-x-auto">
        {items.map((s, i) => (
          <div key={i} className="flex items-center gap-3 shrink-0">
            <span className="text-[#4B8CF5]">{s.icon}</span>
            <div><div className="text-[18px] font-bold">{s.val}</div><div className="text-[11px] text-[#7E8DA2]">{s.label}</div></div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ═══════════ LIVE PREVIEW ═══════════ */
function LivePreview() {
  const pairs = [
    { name: 'EUR/USD', payout: '92%', change: '+0.12%', up: true },
    { name: 'GBP/USD', payout: '90%', change: '-0.08%', up: false },
    { name: 'BTC/USD', payout: '88%', change: '+2.41%', up: true },
    { name: 'AUD/USD', payout: '91%', change: '+0.05%', up: true },
  ]
  return (
    <section className="border-b border-[#1B2735]">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#1B2735] bg-[#0C131F] px-3.5 py-1.5 text-[13px] text-[#AEBBCB] mb-4"><TrendingUp size={14} className="text-[#1FD196]" /> Mercados ao vivo</span>
            <h2 className="text-[30px] md:text-[38px] font-bold tracking-[-0.02em]">Opere nos melhores ativos</h2>
          </div>
          <Link href="/login?tab=register" className="vx-btn-ghost hidden md:inline-flex">Ver todos os ativos <ArrowRight size={14} /></Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pairs.map(p => (
            <div key={p.name} className="vx-panel p-5 hover:border-[#2E6BE6]/40 transition-colors group cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="text-[16px] font-bold">{p.name}</span>
                <span className={`text-[12px] font-semibold ${p.up ? 'text-[#1FD196]' : 'text-[#F0435A]'}`}>{p.change}</span>
              </div>
              <svg viewBox="0 0 200 40" className="w-full h-[40px] my-3">
                <path d={p.up ? 'M0,30 C30,28 60,32 90,20 C120,8 150,15 170,10 L200,5' : 'M0,10 C30,15 60,8 90,20 C120,32 150,28 170,30 L200,35'} fill="none" stroke={p.up ? '#1FD196' : '#F0435A'} strokeWidth="2" />
              </svg>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#7E8DA2]">Payout</span>
                <span className="text-[15px] font-bold text-[#F0B429]">{p.payout}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════ COMO FUNCIONA ═══════════ */
function ComoFunciona({ c }: { c: SiteContent }) {
  const icons = [<Target key="1" size={24} />, <CandlestickChart key="2" size={24} />, <Landmark key="3" size={24} />]
  return (
    <section id="como-funciona" className="scroll-mt-24 border-b border-[#1B2735]">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-[30px] md:text-[38px] font-bold tracking-[-0.02em]">Comece em 3 passos</h2>
          <p className="mt-4 text-[16px] text-[#7E8DA2]">Três passos até a primeira operação. Nenhum deles cobra nada de você.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {c.steps.map((p, i) => (
            <div key={p.n} className="relative vx-panel p-8 text-center group hover:border-[#1FD196]/30 transition-colors">
              <div className="absolute top-4 right-4 text-[48px] font-black text-[#1B2735]/50 leading-none">{p.n}</div>
              <div className="mx-auto w-[56px] h-[56px] rounded-2xl bg-gradient-to-br from-[#1FD196]/20 to-[#2E6BE6]/20 border border-[#1FD196]/20 flex items-center justify-center text-[#3FE0A6] mb-5">{icons[i]}</div>
              <h3 className="text-[18px] font-bold mb-3">{p.title}</h3>
              <p className="text-[14px] text-[#7E8DA2] leading-relaxed">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════ MERCADOS ═══════════ */
const ASSET_ICONS = [CircleDollarSign, Bitcoin, Fuel]
function Mercados({ c }: { c: SiteContent }) {
  return (
    <section id="ativos" className="scroll-mt-24 border-b border-[#1B2735] bg-[#0C131F]/30">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="text-[30px] md:text-[38px] font-bold tracking-[-0.02em]">{c.assets.title}</h2>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {c.assets.categories.map((cat, i) => { const Icon = ASSET_ICONS[i % 3]; return (
            <div key={i} className="vx-panel p-6 hover:border-[#1FD196]/30 transition-all group">
              <div className="vx-ibox-green mb-5"><Icon size={20} /></div>
              <h3 className="text-[17px] font-bold mb-2">{cat.name}</h3>
              <p className="text-[14px] text-[#7E8DA2] leading-relaxed">{cat.examples}</p>
            </div>
          ) })}
        </div>
        <p className="mt-8 text-[13px] text-[#5D6C80]">{c.assets.otcNote} <Link href="/legal/execucao-e-conflito-de-interesse" className="underline hover:text-[#7E8DA2]">Saiba como funciona</Link>.</p>
      </div>
    </section>
  )
}

/* ═══════════ PLATAFORMA ═══════════ */
function Plataforma() {
  const features = [
    { icon: <LineChart size={20} />, title: 'Gráficos Profissionais', desc: 'Indicadores técnicos, timeframes, ferramentas de desenho.' },
    { icon: <Zap size={20} />, title: 'Execução Instantânea', desc: 'Operações processadas em menos de 1 segundo.' },
    { icon: <Layers size={20} />, title: 'Conta Demo Gratuita', desc: 'Pratique com R$10.000 virtuais sem risco.' },
    { icon: <Target size={20} />, title: 'Payouts até 95%', desc: 'Retornos competitivos nos melhores ativos.' },
    { icon: <Award size={20} />, title: 'Torneios', desc: 'Compita com outros traders e ganhe prêmios.' },
    { icon: <Shield size={20} />, title: 'KYC & Segurança', desc: 'Criptografia bancária e verificação de identidade.' },
  ]
  return (
    <section className="border-b border-[#1B2735]">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <div className="flex items-end justify-between mb-12">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#1B2735] bg-[#0C131F] px-3.5 py-1.5 text-[13px] text-[#AEBBCB] mb-4"><CandlestickChart size={14} className="text-[#4B8CF5]" /> Plataforma completa</span>
            <h2 className="text-[30px] md:text-[38px] font-bold tracking-[-0.02em]">Tudo que você precisa</h2>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="vx-panel p-6 group hover:border-[#2E6BE6]/30 transition-colors">
              <div className="vx-ibox-blue mb-4">{f.icon}</div>
              <h3 className="text-[16px] font-bold mb-2">{f.title}</h3>
              <p className="text-[13px] text-[#7E8DA2] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════ COPY TRADING ═══════════ */
const COPY_ICONS = [TrendingUp, Repeat2, Users]
function CopyTrading({ c }: { c: SiteContent }) {
  return (
    <section id="copy-trading" className="scroll-mt-24 border-b border-[#1B2735] bg-[#0C131F]/30">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#1FD196]/20 bg-[#1FD196]/5 px-3.5 py-1.5 text-[13px] text-[#3FE0A6] mb-4"><Users size={14} /> {c.copyTrading.badge}</span>
        <h2 className="max-w-2xl text-[30px] md:text-[38px] font-bold tracking-[-0.02em]">{c.copyTrading.title}</h2>
        <p className="mt-4 max-w-xl text-[16px] text-[#7E8DA2]">{c.copyTrading.subtitle}</p>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {c.copyTrading.features.map((f, i) => { const Icon = COPY_ICONS[i % 3]; return (
            <div key={i} className="vx-panel p-6 hover:border-[#1FD196]/30 transition-all">
              <div className="vx-ibox-green mb-5"><Icon size={20} /></div>
              <h3 className="text-[17px] font-bold mb-2">{f.title}</h3>
              <p className="text-[14px] text-[#7E8DA2] leading-relaxed">{f.text}</p>
            </div>
          ) })}
        </div>
        <p className="mt-6 text-[13px] text-[#5D6C80]">{c.copyTrading.disclaimer}</p>
      </div>
    </section>
  )
}

/* ═══════════ SEGURANÇA ═══════════ */
const SEC_ICONS = [ShieldCheck, LockKeyhole, BadgeCheck, ScrollText]
function Seguranca({ c }: { c: SiteContent }) {
  return (
    <section id="seguranca" className="scroll-mt-24 border-b border-[#1B2735]">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="text-[30px] md:text-[38px] font-bold tracking-[-0.02em]">{c.security.title}</h2>
        <p className="mt-3 max-w-xl text-[16px] text-[#7E8DA2]">{c.security.subtitle}</p>
        <div className="mt-10 grid sm:grid-cols-2 gap-5">
          {c.security.pillars.map((p, i) => { const Icon = SEC_ICONS[i % 4]; return (
            <div key={i} className="vx-panel p-6"><div className="vx-ibox-blue mb-5"><Icon size={20} /></div><h3 className="text-[17px] font-bold mb-2">{p.title}</h3><p className="text-[14px] text-[#7E8DA2] leading-relaxed">{p.text}</p></div>
          ) })}
        </div>
      </div>
    </section>
  )
}

/* ═══════════ DEPOIMENTOS ═══════════ */
function Depoimentos() {
  const items = [
    { name: 'Pedro H.', role: 'Trader desde 2024', text: 'A plataforma é incrível. Interface limpa, execução rápida e o copy trading me ajudou muito no começo.', stars: 5 },
    { name: 'Ana R.', role: 'Day Trader', text: 'Melhor plataforma de opções binárias que já usei. O mercado OTC 24/7 é um diferencial enorme.', stars: 5 },
    { name: 'Carlos M.', role: 'Investidor', text: 'Comecei na demo e em uma semana já estava operando com confiança. Saques rápidos via PIX.', stars: 5 },
  ]
  return (
    <section className="border-b border-[#1B2735] bg-[#0C131F]/30">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="text-center text-[30px] md:text-[38px] font-bold tracking-[-0.02em] mb-12">O que dizem nossos traders</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {items.map(d => (
            <div key={d.name} className="vx-panel p-6">
              <div className="flex gap-0.5 mb-4">{Array.from({ length: d.stars }).map((_, i) => <Star key={i} size={14} className="fill-[#F0B429] text-[#F0B429]" />)}</div>
              <p className="text-[14px] text-[#C3CFDD] leading-relaxed mb-5">&ldquo;{d.text}&rdquo;</p>
              <div className="flex items-center gap-3 border-t border-[#16202D] pt-4">
                <div className="w-9 h-9 rounded-full bg-[#2E6BE6]/20 flex items-center justify-center text-[#6C9CF8] text-[13px] font-bold">{d.name[0]}</div>
                <div><div className="text-[13px] font-semibold">{d.name}</div><div className="text-[11px] text-[#7E8DA2]">{d.role}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════ FAQ ═══════════ */
function Faq({ c }: { c: SiteContent }) {
  return (
    <section className="border-b border-[#1B2735]">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-[30px] md:text-[38px] font-bold tracking-[-0.02em] mb-12">Perguntas frequentes</h2>
        <div className="divide-y divide-[#1B2735] border-y border-[#1B2735]">
          {c.faq.map((item, i) => (
            <details key={i} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[16px] font-semibold marker:hidden">{item.q}<span aria-hidden className="mt-1 flex-shrink-0 text-[20px] text-[#5D6C80] transition-transform group-open:rotate-45">+</span></summary>
              <p className="mt-3 pr-8 text-[15px] leading-[1.7] text-[#7E8DA2]">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-[15px] text-[#7E8DA2]">Não achou sua dúvida? <a href={`mailto:${c.company.emails.suporte}`} className="text-[#1FD196] hover:underline">{c.company.emails.suporte}</a></p>
      </div>
    </section>
  )
}

/* ═══════════ CTA FINAL ═══════════ */
function CtaFinal({ c }: { c: SiteContent }) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute bottom-0 left-[20%] w-[500px] h-[500px] rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #1FD196 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-[20%] w-[400px] h-[400px] rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #2E6BE6 0%, transparent 70%)' }} />
      </div>
      <div className="relative mx-auto max-w-4xl px-6 py-28 text-center">
        <h2 className="text-[32px] md:text-[44px] font-bold tracking-[-0.02em]">{c.cta.title}</h2>
        <p className="mx-auto mt-5 max-w-lg text-[17px] text-[#7E8DA2]">{c.cta.subtitle}</p>
        <Link href="/login?tab=register" data-testid="cta-register"
          className="mt-10 inline-flex items-center gap-2.5 rounded-xl bg-[#1FD196] px-10 py-4.5 text-[17px] font-bold text-[#060A11] transition-all hover:shadow-[0_0_50px_rgba(31,209,150,0.3)]">
          {c.cta.button} <ArrowRight size={18} />
        </Link>
        <div className="mt-8 flex items-center justify-center gap-6 text-[13px] text-[#5D6C80]">
          <span className="flex items-center gap-2"><CheckCircle2 size={14} className="text-[#1FD196]" /> Conta gratuita</span>
          <span className="flex items-center gap-2"><CheckCircle2 size={14} className="text-[#1FD196]" /> Sem taxas ocultas</span>
          <span className="flex items-center gap-2"><CheckCircle2 size={14} className="text-[#1FD196]" /> Demo com R$10.000</span>
        </div>
      </div>
    </section>
  )
}

function CheckCircle2Icon(props: any) { return <CheckCircle2 {...props} /> }
