'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Brain, Users, Wallet, TrendingUp, ShieldCheck,
  ArrowDownCircle, ArrowUpCircle, MessageSquare, UserPlus, Copy,
  Trophy, Gift, Zap, BarChart2, Clock, Cpu, Settings, ChevronRight,
  LogOut, Lock, FileSearch, X, Activity, Globe, Gauge, Database,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useRouter } from 'next/navigation'

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
      { label: 'Provedor de Liquidez', href: '/admin/provedor-liquidez', icon: Activity },
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

export function AdminSidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const router   = useRouter()

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[220px] flex-shrink-0 bg-[#060A11] border-r border-[#1e2433] flex flex-col h-full transition-transform duration-200 ease-out',
          'md:static md:z-auto md:translate-x-0 md:transition-none',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="px-4 py-4 border-b border-[#1e2433] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
              <LayoutDashboard size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight">Admin Panel</div>
              <div className="text-[10px] text-[#4b5563]">Gerenciamento</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 -mr-1.5 rounded-lg text-[#6b7280] hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-3">
              <div className="px-3 pt-2 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#4b5563]">
                  {section.title}
                </span>
              </div>
              {section.items.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-[13px] font-medium transition-colors group',
                    isActive(href)
                      ? 'bg-green-500/15 text-green-400'
                      : 'text-[#6b7280] hover:text-white hover:bg-white/5'
                  )}
                >
                  <Icon size={15} className={cn('flex-shrink-0', isActive(href) ? 'text-green-400' : 'text-[#4b5563] group-hover:text-white')} />
                  <span className="flex-1 leading-tight">{label}</span>
                  {isActive(href) && <ChevronRight size={12} className="text-green-400 flex-shrink-0" />}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-2 pb-4 border-t border-[#1e2433] pt-2">
          <button
            onClick={() => { useAuthStore.getState().logout(); router.replace('/') }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg w-full text-[13px] font-medium text-[#6b7280] hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut size={15} className="flex-shrink-0" />
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}
