'use client'

import { X, GraduationCap, Gem, ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccountSwitchModalProps {
  switchedTo: 'demo' | 'real'
  demoBalance: number
  realBalance: number
  onClose: () => void
}

const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

/**
 * Confirmação da troca de conta.
 *
 * O ponto da tela é responder "estou operando com dinheiro de verdade agora?".
 * Por isso o destino aparece aceso e com selo, e a origem fica apagada: quem bate
 * o olho por meio segundo precisa sair sabendo em qual conta caiu — não comparar
 * dois cartões iguais.
 */
function ContaCard({
  tipo, saldo, ativo,
}: { tipo: 'demo' | 'real'; saldo: number; ativo: boolean }) {
  const isReal = tipo === 'real'
  const Icone = isReal ? Gem : GraduationCap

  return (
    <div className={cn(
      'relative flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 transition-colors',
      ativo
        ? isReal
          ? 'border-[#2BD68F]/50 bg-[#0D2119]'
          : 'border-[#F0B429]/45 bg-[#221B0C]'
        : 'border-[#16202D] bg-[#0A1017] opacity-45',
    )}>
      {ativo && (
        <span className={cn(
          'absolute -top-2 right-3 flex h-5 w-5 items-center justify-center rounded-full',
          isReal ? 'bg-[#1FD196]' : 'bg-[#F0B429]',
        )}>
          <Check size={12} strokeWidth={3} className="text-[#04140E]" />
        </span>
      )}

      <Icone
        size={26}
        className={ativo ? (isReal ? 'text-[#3FE0A6]' : 'text-[#F0B429]') : 'text-[#4B5A6E]'}
      />
      <span className={cn(
        'text-[10px] font-bold tracking-[0.14em]',
        ativo ? (isReal ? 'text-[#3FE0A6]' : 'text-[#F0B429]') : 'text-[#5D6C80]',
      )}>
        {isReal ? 'CONTA REAL' : 'CONTA DEMO'}
      </span>
      <span className={cn('text-[15px] font-bold tabular-nums', ativo ? 'text-white' : 'text-[#5D6C80]')}>
        {fmt(saldo)}
      </span>
    </div>
  )
}

export function AccountSwitchModal({
  switchedTo,
  demoBalance,
  realBalance,
  onClose,
}: AccountSwitchModalProps) {
  const isNowReal = switchedTo === 'real'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#03060B]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-[#1B2735] bg-[#0A101A] shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
          <div>
            <h2 className="text-[15px] font-bold leading-none text-white">
              O tipo de conta foi alterado
            </h2>
            <p className="mt-2.5 text-[12.5px] leading-snug text-[#7E8DA2]">
              {isNowReal
                ? 'Você está negociando com dinheiro real a partir de agora.'
                : 'Você voltou para a conta demo — saldo virtual, sem risco.'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#7E8DA2] transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="h-px bg-[#16202D]" />

        <div className="flex items-center gap-3 px-5 py-6">
          <ContaCard tipo="demo" saldo={demoBalance} ativo={!isNowReal} />
          <ArrowRight size={18} className="shrink-0 text-[#4B5A6E]" />
          <ContaCard tipo="real" saldo={realBalance} ativo={isNowReal} />
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-[#1D5FE0] py-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#2A6DF0]"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
