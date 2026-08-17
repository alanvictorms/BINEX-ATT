'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import {
  LayoutDashboard, Brain, Users, Wallet, TrendingUp, ShieldCheck,
  ArrowDownCircle, ArrowUpCircle, MessageSquare, UserPlus, Copy,
  Trophy, Gift, Zap, BarChart2, Clock, Cpu, Settings,
  LogOut, Lock, FileSearch, X, Activity, Globe, Database, Megaphone, Ticket,
} from 'lucide-react'

type NavItem = { label: string; href: string; icon: any }
type NavSection = { title: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Dashboard',      href: '/admin',            icon: LayoutDashboard },
      { label: 'Análise IA',     href: '/admin/analise-ia',  icon: Brain },
    ],
  },
  {
    title: 'Usuários',
    items: [
      { label: 'Usuários',       href: '/admin/usuarios',    icon: Users },
      { label: 'Verificação',    href: '/admin/verificacao',  icon: ShieldCheck },
      { label: 'Afiliados',      href: '/admin/afiliados',    icon: UserPlus },
      { label: 'Tickets',        href: '/admin/tickets',      icon: MessageSquare },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { label: 'Carteira',       href: '/admin/carteira',    icon: Wallet },
      { label: 'Depósitos',      href: '/admin/depositos',    icon: ArrowDownCircle },
      { label: 'Saques',         href: '/admin/saques',       icon: ArrowUpCircle },
    ],
  },
  {
    title: 'Trading',
    items: [
      { label: 'Operações',      href: '/admin/operacoes',    icon: TrendingUp },
      { label: 'Copy Trading',   href: '/admin/copy-trading',  icon: Copy },
      { label: 'Boosters',       href: '/admin/boosters',      icon: Zap },
      { label: 'Ranking',        href: '/admin/ranking',       icon: Trophy },
    ],
  },
  {
    title: 'Mercado',
    items: [
      { label: 'Ativos',         href: '/admin/ativos',       icon: BarChart2 },
      { label: 'Horário Mercado',href: '/admin/horario',       icon: Clock },
      { label: 'Cadastro OTC',   href: '/admin/otc',           icon: Cpu },
      { label: 'Deriv',          href: '/admin/deriv',         icon: Database },
    ],
  },
  {
    title: 'Plataforma',
    items: [
      { label: 'Níveis',         href: '/admin/niveis',       icon: Trophy },
      { label: 'Bônus',          href: '/admin/bonus',        icon: Gift },
      { label: 'Cupons',         href: '/admin/cupons',       icon: Ticket },
      { label: 'Provedor de Liquidez', href: '/admin/provedor-liquidez', icon: Activity },
      { label: 'Banners',        href: '/admin/banners',      icon: Megaphone },
      { label: 'Site / Landing Page', href: '/admin/site',     icon: Globe },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { label: 'Configurações',  href: '/admin/configuracoes', icon: Settings },
      { label: 'Segurança (2FA)',href: '/admin/seguranca/2fa',  icon: Lock },
      { label: 'Audit Log',      href: '/admin/audit-log',     icon: FileSearch },
    ],
  },
]

export const PAGE_META: Record<string, { title: string; desc: string }> = {
  '/admin':                    { title: 'Visão geral da plataforma', desc: 'Fluxo financeiro, resultado da casa e comportamento dos usuários em um só lugar.' },
  '/admin/analise-ia':         { title: 'Análise com IA',            desc: 'Leitura assistida de risco e padrões de operação.' },
  '/admin/usuarios':           { title: 'Usuários',                  desc: 'Base completa, saldos, volume negociado e resultado por conta.' },
  '/admin/verificacao':        { title: 'Verificação de identidade', desc: 'Fila de KYC: documentos, selfie e decisão de aprovação.' },
  '/admin/afiliados':          { title: 'Afiliados',                 desc: 'Códigos, indicações qualificadas e comissões a pagar.' },
  '/admin/tickets':            { title: 'Atendimento',               desc: 'Tickets abertos, tempo de resposta e prioridade.' },
  '/admin/carteira':           { title: 'Carteira da plataforma',    desc: 'Exposição, saldos e movimentações consolidadas.' },
  '/admin/depositos':          { title: 'Depósitos',                 desc: 'Entradas via PIX, conversão e confirmações manuais.' },
  '/admin/saques':             { title: 'Saques',                    desc: 'Aprovação, risco AML e execução de pagamentos.' },
  '/admin/operacoes':          { title: 'Operações',                 desc: 'Histórico de trades, resultado e ajustes administrativos.' },
  '/admin/copy-trading':       { title: 'Copy Trading',              desc: 'Traders publicados, assinaturas e resultado da casa.' },
  '/admin/boosters':           { title: 'Boosters',                  desc: 'Campanhas, loja de boosters e compras dos usuários.' },
  '/admin/ranking':            { title: 'Ranking',                   desc: 'Competições e classificação dos usuários.' },
  '/admin/ativos':             { title: 'Ativos de mercado',         desc: 'Payout, ordenação e disponibilidade de cada ativo.' },
  '/admin/horario':            { title: 'Horário de mercado',        desc: 'Janelas de negociação por ativo.' },
  '/admin/otc':                { title: 'Cadastro OTC',              desc: 'Parâmetros sintéticos e mesa de risco em tempo real.' },
  '/admin/deriv':              { title: 'Provedor Deriv',            desc: 'Fonte de histórico de candles e cobertura por ativo.' },
  '/admin/niveis':             { title: 'Níveis',                    desc: 'Progressão e benefícios por nível.' },
  '/admin/bonus':              { title: 'Bônus',                     desc: 'Escada de bônus por depósito e rollover ativo.' },
  '/admin/cupons':             { title: 'Cupons',                    desc: 'Códigos promocionais, limites e uso.' },
  '/admin/provedor-liquidez':  { title: 'Provedor de liquidez',      desc: 'Ajuste de resultado, ordens abertas e força por ativo.' },
  '/admin/banners':            { title: 'Banners promocionais',      desc: 'Peças exibidas na plataforma e destino de cada clique.' },
  '/admin/site':               { title: 'Site / Landing page',       desc: 'Conteúdo público, SEO e dados institucionais.' },
  '/admin/configuracoes':      { title: 'Configurações',             desc: 'Parâmetros operacionais e credenciais de provedores.' },
  '/admin/seguranca/2fa':      { title: 'Segurança (2FA)',           desc: 'Autenticação em dois fatores da conta administrativa.' },
  '/admin/audit-log':          { title: 'Audit log',                 desc: 'Trilha completa de ações administrativas.' },
}

export function AdminSidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const router   = useRouter()

  async function sair() {
    await useAuthStore.getState().logout()
    router.replace('/')
  }

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 md:hidden" data-nx-scrim onClick={onClose} aria-hidden />
      )}

      <aside className="nx-side" data-open={open} data-testid="admin-sidebar">
        <div className="nx-side__head">
          <div>
            <div className="nx-side__title">Navegação</div>
            <div className="nx-side__sub">Gerenciamento</div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-[#6b7280] hover:bg-white/5"
            aria-label="Fechar menu"
            data-testid="sidebar-close-button"
          >
            <X size={17} />
          </button>
        </div>

        <nav className="nx-side__nav">
          {SECTIONS.map(section => (
            <div key={section.title} className="nx-side__group">
              <div className="nx-side__grouptitle">{section.title}</div>
              {section.items.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className="nx-item"
                  data-active={isActive(href)}
                  data-testid={`nav-${href.replace(/\//g, '-').replace(/^-/, '')}`}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="nx-side__foot">
          <button className="nx-item w-full" onClick={sair} data-testid="logout-button">
            <LogOut size={15} />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </>
  )
}
