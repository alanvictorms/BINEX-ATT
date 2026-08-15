'use client'

import { Settings, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GridIcon, ShieldCheckIcon, UserCircleIcon, HeadsetIcon } from './MenuIcons'

type SidebarTab = 'TRADE' | 'SUPORTE' | 'CONTA' | 'TORNEIOS' | 'MERCADO' | 'MAIS' | 'COPY'

interface SidebarProps {
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  onSettings?: () => void
}

const NAV: { tab: SidebarTab; label: string; icon: React.ReactNode; badge?: string }[] = [
  { tab: 'TRADE',    label: 'Negociar',     icon: <GridIcon size={21} /> },
  { tab: 'COPY',     label: 'Copy Trading', icon: <ShieldCheckIcon size={21} /> },
  { tab: 'CONTA',    label: 'Conta',        icon: <UserCircleIcon size={21} /> },
  { tab: 'SUPORTE',  label: 'Suporte',      icon: <HeadsetIcon size={21} /> },
]

export function Sidebar({ activeTab, onTabChange, onSettings }: SidebarProps) {
  return (
    <aside
      data-testid="sidebar"
      className="flex w-[96px] shrink-0 select-none flex-col rounded-xl border border-[#141C28] bg-[#0A101A] p-2"
    >
      <div className="flex flex-col gap-[3px]">
        {NAV.map(item => {
          const isActive = activeTab === item.tab
          return (
            <button
              key={item.tab}
              data-testid={`sidebar-${item.tab.toLowerCase()}`}
              title={item.label}
              onClick={() => onTabChange(item.tab)}
              className={cn(
                'relative flex w-full flex-col items-center gap-[8px] rounded-xl border px-1 py-[13px] transition-colors duration-200',
                isActive
                  ? 'border-[#1D5FE0] bg-[#1D5FE0] text-white'
                  : 'border-transparent text-[#66768C] hover:bg-[#0D1420] hover:text-[#BCC9D8]',
              )}
            >
              {item.badge && (
                <span className="absolute right-[5px] top-[4px] rounded-[4px] bg-[#1E8F63] px-[4px] py-[2px] text-[7.5px] font-bold uppercase tracking-[0.08em] text-[#C9FFE8]">
                  {item.badge}
                </span>
              )}
              {item.icon}
              <span className="whitespace-nowrap text-[8.5px] font-semibold uppercase leading-tight tracking-[0.08em]">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-4 pb-2">
        <button
          title="Som"
          className="text-[#66768C] transition-colors duration-200 hover:text-white"
        >
          <Volume2 size={18} strokeWidth={1.8} />
        </button>
        <button
          data-testid="sidebar-settings"
          title="Configurações"
          onClick={onSettings}
          className="text-[#66768C] transition-colors duration-200 hover:text-white"
        >
          <Settings size={18} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  )
}
