'use client'

import { useState } from 'react'
import { ChevronDown, Plus, X, Eye, EyeOff, LayoutGrid, Flame } from 'lucide-react'
import { type Asset } from '@/lib/mockData'
import { cn } from '@/lib/utils'
import { AccountDropdown } from './AccountDropdown'
import { FlagPair } from '@/components/ui/FlagPair'
import { useStudioMode } from '@/lib/studioMode'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { isRealMarket, getMarketSource } from '@/lib/marketSymbols'
import { isMarketOpen } from '@/lib/marketHours'
import { useSiteBrand } from '@/lib/useSiteBrand'

interface HeaderProps {
  selectedAsset: Asset
  onSelectAsset: (asset: Asset) => void
  openAssets: Asset[]
  onOpenAsset: (asset: Asset) => void
  onCloseAsset: (asset: Asset) => void
  onOpenSelector: () => void
  onDeposito?: () => void
  onRetirada?: () => void
  onTransacoes?: () => void
  onOperacoes?: () => void
  onMinhaConta?: () => void
  onLogout?: () => void
  onResetDemo?: () => Promise<void>
  isDemo: boolean
  onSelectDemo: () => void
  onSelectReal: () => void
  demoBalance: number
  realBalance: number
  balance: number | null
  userEmail?: string
  userId?: string
  /** assetId -> andamento da ordem aberta nele. Opcional: sem isso o header
   *  renderiza exatamente como antes. */
  tradeStatus?: Record<string, 'up' | 'down'>
}

export function Header({
  selectedAsset,
  onSelectAsset,
  openAssets,
  onCloseAsset,
  onOpenSelector,
  onDeposito,
  onRetirada,
  onTransacoes,
  onOperacoes,
  onMinhaConta,
  onLogout,
  onResetDemo,
  isDemo,
  onSelectDemo,
  onSelectReal,
  demoBalance,
  realBalance,
  balance,
  userEmail = '',
  userId = '',
  tradeStatus,
}: HeaderProps) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [balanceHidden, setBalanceHidden] = useState(false)

  const studioEnabled     = useStudioMode(s => s.enabled)
  const studioStreakOn    = useStudioMode(s => s.streakEnabled)
  const studioStreakCount = useStudioMode(s => s.streakCount)
  const showStreak        = studioEnabled && studioStreakOn && studioStreakCount > 0
  const siteBrand         = useSiteBrand()

  const initial = (userEmail || '?').trim().charAt(0).toUpperCase()

  return (
    <header className="relative z-30 flex h-[70px] shrink-0 items-center gap-2.5 border-b border-[#141C28] bg-[#080D15] pl-4 pr-4">
      {/* Marca */}
      <div className="flex shrink-0 items-center gap-2.5 pr-4">
        <BrandLogo size={34} where="trade">
          <div className="text-[17px] leading-none tracking-[-0.01em]">
            <span className="font-extrabold text-white">{siteBrand.name}</span>{' '}
            <span className="font-medium text-[#9AA9BC]">{siteBrand.subtitle}</span>
          </div>
        </BrandLogo>
      </div>

      {/* Seletor de ativos + abas */}
      <button
        data-testid="open-asset-selector"
        onClick={onOpenSelector}
        title="Selecionar ativo"
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] border border-[#1A2432] bg-[#0C1320] text-[#7A8AA0] transition-colors duration-200 hover:border-[#26374A] hover:text-white"
      >
        <LayoutGrid size={18} />
      </button>
      <span className="mr-1 h-[26px] w-px shrink-0 bg-[#161F2C]" />

      <div className="flex min-w-0 items-center gap-2.5 overflow-x-auto">
        {openAssets.map(asset => {
          const isActive = selectedAsset.id === asset.id
          return (
            <div
              key={asset.id}
              data-testid={`asset-tab-${asset.id}`}
              onClick={() => onSelectAsset(asset)}
              className={cn(
                'group flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-[8px] transition-colors duration-200',
                isActive
                  ? 'border-[#2E6BE6] bg-[#101D31] shadow-[0_4px_14px_rgba(0,0,0,0.35)]'
                  : 'border-[#1A2432] bg-[#0C1320] hover:border-[#26374A] hover:bg-[#101825]',
              )}
            >
              <FlagPair code1={asset.code1} code2={asset.code2} size={20} />
              <span className="flex flex-col items-start leading-none">
                <span className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold tracking-wide text-[#E4EBF5]">{asset.symbol}</span>
                  {!isMarketOpen(asset) ? (
                    <span className="rounded bg-[#F0435A]/20 px-1 py-[1px] text-[8px] font-bold leading-none text-[#F0435A]">FECHADO</span>
                  ) : isRealMarket(asset.id) && getMarketSource(asset.id) === 'binance' && (
                    <span className="rounded bg-[#F0B429]/20 px-1 py-[1px] text-[8px] font-bold leading-none text-[#F0B429]">
                      BINANCE
                    </span>
                  )}
                </span>
                <span className="mt-[4px] flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-[#22D39A]">{asset.payout}%</span>
                  {/* Andamento da ordem aberta NESTE ativo. Fica aqui pra dar pra
                      acompanhar o resultado mesmo estando com outro ativo na tela. */}
                  {tradeStatus?.[asset.id] && (
                    <span
                      title={tradeStatus[asset.id] === 'up' ? 'Operação ganhando' : 'Operação perdendo'}
                      className={cn(
                        'inline-block h-[7px] w-[7px] shrink-0 rounded-full',
                        tradeStatus[asset.id] === 'up'
                          ? 'bg-[#22D39A] shadow-[0_0_6px_rgba(34,211,154,0.8)]'
                          : 'bg-[#F0435A] shadow-[0_0_6px_rgba(240,67,90,0.8)]',
                      )}
                    />
                  )}
                </span>
              </span>
              {isActive && (
                <button
                  data-testid={`close-asset-${asset.id}`}
                  onClick={e => { e.stopPropagation(); onCloseAsset(asset) }}
                  className="ml-0.5 text-[#5D6C80] transition-colors hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {showStreak && (
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/15 px-2 py-1">
          <Flame size={12} className="text-orange-400" />
          <span className="text-[11px] font-bold tabular-nums text-orange-300">{studioStreakCount}</span>
        </div>
      )}

      {/* Conta / saldo / depósito */}
      <div className="ml-auto flex shrink-0 items-center gap-4 pl-4">
        <div className="relative">
          <div className="flex flex-col items-end leading-none">
            <span className={cn(
              'text-[10px] font-semibold uppercase tracking-[0.13em]',
              isDemo ? 'text-[#E0A82E]' : 'text-[#5D6C80]',
            )}>
              {isDemo ? 'Conta demo' : 'Conta real'}
            </span>
            <button
              data-testid="account-balance-button"
              onClick={() => setAccountOpen(v => !v)}
              className="mt-[6px] flex items-center gap-1.5 text-[15px] font-bold tracking-[-0.01em] text-white"
            >
              {balance == null
                ? <span className="inline-block h-4 w-20 animate-pulse rounded bg-white/15" />
                : balanceHidden
                  ? <span className="tabular-nums">R$ ••••••</span>
                  : <span className="tabular-nums">R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
              <ChevronDown size={16} className={cn('mt-[2px] text-[#7A8AA0] transition-transform', accountOpen && 'rotate-180')} />
            </button>
          </div>

          {accountOpen && (
            <AccountDropdown
              isDemo={isDemo}
              onSelectDemo={() => { onSelectDemo(); setAccountOpen(false) }}
              onSelectReal={() => { onSelectReal(); setAccountOpen(false) }}
              demoBalance={demoBalance}
              realBalance={realBalance}
              userEmail={userEmail}
              userId={userId}
              onClose={() => setAccountOpen(false)}
              onLogout={onLogout ?? (() => {})}
              onResetDemo={onResetDemo ?? (() => Promise.resolve())}
              onDeposito={onDeposito ?? (() => {})}
              onRetirada={onRetirada ?? (() => {})}
              onTransacoes={onTransacoes ?? (() => {})}
              onOperacoes={onOperacoes ?? (() => {})}
              onMinhaConta={onMinhaConta ?? (() => {})}
            />
          )}
        </div>

        <button
          data-testid="toggle-balance-visibility"
          onClick={() => setBalanceHidden(v => !v)}
          title={balanceHidden ? 'Exibir saldo' : 'Ocultar saldo'}
          className="text-[#6C7C92] transition-colors duration-200 hover:text-white"
        >
          {balanceHidden ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>

        <button
          data-testid="deposit-button"
          onClick={onDeposito}
          className="flex items-center gap-2 rounded-[9px] border border-[#2BC98E]/60 bg-gradient-to-b from-[#123C2E] to-[#0D2E23] px-[16px] py-[10px] text-[12px] font-bold uppercase tracking-[0.09em] text-[#3FE0A6] transition-colors duration-200 hover:from-[#164A38] hover:to-[#0F372A]"
        >
          <Plus size={14} strokeWidth={3} />
          Depósito
        </button>

        <button
          data-testid="header-avatar"
          onClick={onMinhaConta}
          title="Minha conta"
          className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-gradient-to-b from-[#1C2836] to-[#111A26] text-[13px] font-bold text-[#BCC9D8] ring-2 ring-[#22D39A]/60 transition-colors hover:text-white"
        >
          {initial}
        </button>
      </div>
    </header>
  )
}
