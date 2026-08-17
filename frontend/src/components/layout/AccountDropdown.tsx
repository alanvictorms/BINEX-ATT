'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, LogOut, ArrowRightLeft, BarChart2, User, Gem, PiggyBank, Wallet, GraduationCap, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BRAND_DOMAIN } from '@/lib/brand'
import { useStudioMode } from '@/lib/studioMode'

interface AccountDropdownProps {
  isDemo: boolean
  onSelectDemo: () => void
  onSelectReal: () => void
  demoBalance: number
  realBalance: number
  userEmail: string
  userId: string
  onClose: () => void
  onLogout: () => void
  onResetDemo: () => void
  onDeposito: () => void
  onRetirada: () => void
  onTransacoes: () => void
  onOperacoes: () => void
  onMinhaConta: () => void
}

const menuItems = (actions: {
  onDeposito: () => void
  onRetirada: () => void
  onTransacoes: () => void
  onOperacoes: () => void
  onMinhaConta: () => void
}) => [
  { label: 'Depósito',    icon: <PiggyBank size={15} />,      action: actions.onDeposito },
  { label: 'Retirada',    icon: <Wallet size={15} />,         action: actions.onRetirada },
  { label: 'Transações',  icon: <ArrowRightLeft size={15} />, action: actions.onTransacoes },
  { label: 'Operações',   icon: <BarChart2 size={15} />,      action: actions.onOperacoes },
  { label: 'Minha Conta', icon: <User size={15} />,           action: actions.onMinhaConta },
]

const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

/**
 * Linha de conta do seletor. O saldo é o dado principal — é o que a pessoa veio
 * conferir ao clicar no saldo do header —, então ele domina a linha e o resto é
 * apoio.
 */
function ContaLinha({
  tipo, saldo, ativo, onSelect, extra,
}: {
  tipo: 'real' | 'demo'
  saldo: number
  ativo: boolean
  onSelect: () => void
  extra?: React.ReactNode
}) {
  const isReal = tipo === 'real'
  const Icone = isReal ? Gem : GraduationCap
  const cor = isReal ? '#3FE0A6' : '#F0B429'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
        ativo
          ? 'border-[#2E6BE6]/60 bg-[#101B2E]'
          : 'border-[#16202D] bg-[#0A1017] hover:border-[#243448]',
      )}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
        style={{ borderColor: `${cor}40`, backgroundColor: `${cor}14`, color: cor }}
      >
        <Icone size={16} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col leading-none">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7E8DA2]">
          {isReal ? 'Conta real' : 'Conta demo'}
        </span>
        <span className="mt-2 truncate text-[15px] font-bold tabular-nums text-white">{fmt(saldo)}</span>
      </span>

      {extra}

      <span className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        ativo ? 'border-[#2E6BE6] bg-[#2E6BE6]' : 'border-[#2A3A4D]',
      )}>
        {ativo && <Check size={11} strokeWidth={3} className="text-white" />}
      </span>
    </button>
  )
}

export function AccountDropdown({
  isDemo,
  onSelectDemo,
  onSelectReal,
  demoBalance,
  realBalance,
  userEmail,
  userId,
  onClose,
  onLogout,
  onResetDemo,
  onDeposito,
  onRetirada,
  onTransacoes,
  onOperacoes,
  onMinhaConta,
}: AccountDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [resetting, setResetting] = useState(false)

  // Studio Mode: overrides cosmeticos de identidade
  const studioEnabled         = useStudioMode(s => s.enabled)
  const studioIdentityEnabled = useStudioMode(s => s.customIdentityEnabled)
  const studioCustomName      = useStudioMode(s => s.customName)
  const studioCustomEmail     = useStudioMode(s => s.customEmail)
  const displayUser = studioEnabled && studioIdentityEnabled
    ? (studioCustomName || studioCustomEmail || userEmail)
    : userEmail

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  async function handleResetDemo(e: React.MouseEvent) {
    e.stopPropagation()
    setResetting(true)
    try { await onResetDemo() } finally { setResetting(false) }
  }

  const shortId = userId ? userId.slice(0, 8).toUpperCase() : '--------'
  const items = menuItems({ onDeposito, onRetirada, onTransacoes, onOperacoes, onMinhaConta })

  return (
    <div
      ref={ref}
      className="fixed left-1/2 top-14 z-50 flex w-[calc(100vw-1.5rem)] max-w-[420px] -translate-x-1/2 flex-col overflow-hidden overflow-y-auto rounded-xl border border-[#1B2735] shadow-[0_30px_80px_rgba(0,0,0,0.7)] lg:absolute lg:left-auto lg:right-0 lg:top-full lg:mt-1.5 lg:max-h-none lg:w-auto lg:min-w-[500px] lg:max-w-none lg:translate-x-0 lg:flex-row lg:overflow-y-visible"
      style={{ maxHeight: 'min(80vh, 640px)' }}
    >
      {/* Contas — em mobile em cima, em desktop à esquerda */}
      <div className="flex w-full flex-col gap-3 bg-[#0C131F] p-4 lg:w-[300px] lg:shrink-0">
        {/* Identidade */}
        <div className="leading-none">
          <div className="truncate text-[13px] font-semibold text-white">
            {displayUser || `usuario@${BRAND_DOMAIN}`}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[#6B7A8E]">
            <span>ID {shortId}</span>
            <span className="h-2.5 w-px bg-[#243448]" />
            <span>BRL</span>
          </div>
        </div>

        <div className="h-px bg-[#16202D]" />

        <ContaLinha tipo="real" saldo={realBalance} ativo={!isDemo} onSelect={onSelectReal} />
        <ContaLinha
          tipo="demo"
          saldo={demoBalance}
          ativo={isDemo}
          onSelect={onSelectDemo}
          extra={
            <span
              role="button"
              tabIndex={0}
              aria-label="Recarregar saldo demo"
              title="Recarregar saldo demo"
              onClick={handleResetDemo}
              onKeyDown={e => { if (e.key === 'Enter') handleResetDemo(e as unknown as React.MouseEvent) }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#7E8DA2] transition-colors hover:bg-white/10 hover:text-white"
            >
              <RefreshCw size={13} className={resetting ? 'animate-spin' : ''} />
            </span>
          }
        />
      </div>

      {/* Navegação — em mobile embaixo, em desktop à direita */}
      <div className="flex w-full flex-col border-t border-[#16202D] bg-[#0A101A] py-2 lg:w-[200px] lg:shrink-0 lg:border-l lg:border-t-0">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => { item.action(); onClose() }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-[#E4EBF5] transition-colors hover:bg-white/5"
          >
            <span className="text-[#7E8DA2]">{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div className="mx-4 my-2 h-px bg-[#16202D]" />

        <button
          onClick={() => { onLogout(); onClose() }}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-[#F0435A] transition-colors hover:bg-red-500/10"
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>
    </div>
  )
}
