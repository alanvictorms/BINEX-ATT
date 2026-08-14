'use client'

import { X, Gift, Check, ArrowRight } from 'lucide-react'

// Popup de boas-vindas do bônus (estilo promo de corretora). Aparece na
// plataforma pra quem ainda tem degrau da escada disponível (< nº de depósitos
// bonificados). Valores vêm de /api/bonus/offer — a MESMA regra do banco que o
// grant_first_deposit_bonus aplica: nunca anuncia um número que o banco não conceda.

export interface BonusOffer {
  enabled: boolean
  pcts: number[]     // escada [200, 100, 50]
  pct: number        // pcts[0]
  maxAmount: number
  rollover: number
  minDeposit: number
}

interface BonusWelcomeModalProps {
  offer: BonusOffer
  depositCount: number   // depósitos confirmados não-fake já feitos (0 = 1º depósito)
  onDeposit: () => void
  onClose: () => void
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const ordinal = (n: number) => `${n}º`

export function BonusWelcomeModal({ offer, depositCount, onDeposit, onClose }: BonusWelcomeModalProps) {
  // Percentual do PRÓXIMO depósito do lead (degrau atual da escada).
  const tierPct = offer.pcts[depositCount] ?? offer.pct
  const depositNumber = depositCount + 1
  // Código da campanha (visual): sempre o do 1º degrau. O bônus é aplicado
  // automaticamente na confirmação — o código é só o gatilho de marketing.
  const code = `BONUS${offer.pcts[0]}`

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
      <div className="relative w-full max-w-[400px] rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-[0_0_60px_rgba(37,99,235,0.45)] p-6 sm:p-7">

        {/* Fechar */}
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors"
        >
          <X size={16} />
        </button>

        {/* Título + ícone */}
        <div className="flex items-start justify-between gap-3 pr-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
            Ganhe {fmtBRL(tierPct)}% de bônus no {depositCount === 0 ? '' : `${ordinal(depositNumber)} `}depósito!
          </h2>
          <Gift size={26} className="text-white/90 flex-shrink-0 mt-0.5" />
        </div>

        {/* Benefícios */}
        <ul className="mt-5 space-y-3">
          <li className="flex items-start gap-2.5 text-sm text-white/95">
            <Check size={16} className="mt-0.5 flex-shrink-0 text-white" />
            <span>
              Deposite com o código{' '}
              <span className="font-bold tracking-wide">{code}</span>{' '}
              e receba bônus direto no saldo!
            </span>
          </li>
          {offer.minDeposit > 0 && (
            <li className="flex items-start gap-2.5 text-sm text-white/95">
              <Check size={16} className="mt-0.5 flex-shrink-0 text-white" />
              <span>Depósito mínimo: <span className="font-bold">R$ {fmtBRL(offer.minDeposit)}</span></span>
            </li>
          )}
          <li className="flex items-start gap-2.5 text-sm text-white/95">
            <Check size={16} className="mt-0.5 flex-shrink-0 text-white" />
            <span>Bônus aplicado automaticamente ao confirmar depósito</span>
          </li>
        </ul>

        {/* CTA */}
        <button
          onClick={onDeposit}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-white text-blue-700 font-bold text-sm sm:text-base rounded-xl py-3.5 hover:bg-blue-50 active:scale-[0.99] transition-all"
        >
          Depositar agora
          <ArrowRight size={17} />
        </button>

        {/* Condição em letra honesta — evita surpresa no saque */}
        <p className="mt-3 text-center text-[11px] text-white/60 leading-snug">
          Bônus liberado para saque após operar {fmtBRL(offer.rollover)}× o valor recebido
          (até R$ {fmtBRL(offer.maxAmount)}). Seu depósito fica disponível para saque normalmente.
        </p>
      </div>
    </div>
  )
}
