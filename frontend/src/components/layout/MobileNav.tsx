'use client'

/**
 * Barra inferior do mobile.
 *
 * Antes espelhava as abas do desktop (Trade, Suporte, Conta, Copy, Mais) — cinco
 * destinos competindo por espaço numa barra que só precisa dar acesso rápido ao
 * que se usa operando. Agora são três AÇÕES, e por isso o contrato deixou de ser
 * `SidebarTab` e virou um verbo: quem chama decide o que abrir.
 *
 * Baixa de propósito: cada pixel aqui é pixel a menos de gráfico.
 */

import { Briefcase, BarChart3, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MobileNavAction = 'POSICOES' | 'HISTORICO' | 'DEPOSITO'

interface MobileNavProps {
  /** Ação atualmente aberta, pra destacar o item. */
  active?: MobileNavAction | null
  onAction: (action: MobileNavAction) => void
}

const ITEMS: { icon: React.FC<{ size?: number; strokeWidth?: number }>; label: string; action: MobileNavAction }[] = [
  { icon: Briefcase,  label: 'Posições',  action: 'POSICOES'  },
  { icon: BarChart3,  label: 'Histórico', action: 'HISTORICO' },
  { icon: Plus,       label: 'Depósito',  action: 'DEPOSITO'  },
]

export function MobileNav({ active, onAction }: MobileNavProps) {
  return (
    <nav className="flex shrink-0 items-stretch border-t border-[#16202D] bg-[#0C131F]">
      {ITEMS.map(({ icon: Icon, label, action }) => {
        const isActive = active === action
        return (
          <button
            key={action}
            data-testid={`mobile-nav-${action.toLowerCase()}`}
            onClick={() => onAction(action)}
            className={cn(
              // flex-1 divide o comprimento igualmente entre os três.
              'relative flex flex-1 flex-col items-center justify-center gap-[3px] py-[7px] transition-colors',
              isActive ? 'text-[#6C9CF8]' : 'text-[#7E8DA2] active:text-white',
            )}
          >
            {isActive && <span className="absolute left-3 right-3 top-0 h-[2px] rounded-b bg-[#1D5FE0]" />}
            <Icon size={17} strokeWidth={2} />
            <span className="text-[9.5px] font-semibold leading-none">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
