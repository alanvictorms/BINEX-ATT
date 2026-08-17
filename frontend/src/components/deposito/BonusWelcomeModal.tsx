'use client'

import { X, Gift, Check, ArrowRight, ShieldCheck } from 'lucide-react'

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

/** Linha de benefício: painel próprio + selo de check, como no material da campanha. */
function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3.5 rounded-2xl border border-[#2A5CC4]/50 bg-[#0F3084]/40 px-4 py-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#3C8DFF] to-[#1A63E8] shadow-[0_2px_10px_rgba(38,116,255,0.55)]">
        <Check size={16} strokeWidth={3} className="text-white" />
      </span>
      <span className="text-[13.5px] leading-snug text-white sm:text-[14.5px]">{children}</span>
    </li>
  )
}

export function BonusWelcomeModal({ offer, depositCount, onDeposit, onClose }: BonusWelcomeModalProps) {
  // Percentual do PRÓXIMO depósito do lead (degrau atual da escada).
  const tierPct = offer.pcts[depositCount] ?? offer.pct
  const depositNumber = depositCount + 1
  // Código da campanha (visual): sempre o do 1º degrau. O bônus é aplicado
  // automaticamente na confirmação — o código é só o gatilho de marketing.
  const code = `BONUS${offer.pcts[0]}`

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[3px]">
      <div className="relative w-full max-w-[520px] overflow-hidden rounded-[28px] border border-[#3D7BE8]/60 bg-gradient-to-b from-[#0E2E76] to-[#071A45] p-6 shadow-[0_0_90px_rgba(29,95,224,0.45)] sm:p-8">

        {/* Brilho de topo — o mesmo realce do criativo, sem virar imagem estática */}
        <span className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-[#8FC2FF] to-transparent" />

        {/* Fechar */}
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-[#3D7BE8]/60 bg-[#123479]/60 text-white/80 transition-colors hover:bg-[#1A4290] hover:text-white"
        >
          <X size={17} />
        </button>

        {/* Título + selo do presente */}
        <div className="flex items-center gap-4 pr-11 sm:gap-5">
          <span className="relative flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#2E7BFF] to-[#0B47C4] shadow-[0_0_35px_rgba(45,120,255,0.6)] sm:h-[86px] sm:w-[86px]">
            <span className="absolute inset-[3px] rounded-full bg-gradient-to-b from-white/25 to-transparent" />
            <Gift size={38} className="relative text-white drop-shadow" />
          </span>
          <h2 className="text-[26px] font-extrabold leading-[1.12] tracking-tight text-white sm:text-[32px]">
            Ganhe <span className="text-[#6FB4FF]">{fmtBRL(tierPct)}%</span>
            <br />
            de bônus no {depositCount === 0 ? '' : `${ordinal(depositNumber)} `}depósito!
          </h2>
        </div>

        {/* Benefícios */}
        <ul className="mt-6 flex flex-col gap-2.5">
          <Item>
            Deposite com o código <span className="font-bold text-[#6FB4FF]">{code}</span>{' '}
            e receba bônus direto no saldo!
          </Item>
          {offer.minDeposit > 0 && (
            <Item>
              Depósito mínimo: <span className="font-bold text-[#6FB4FF]">R$ {fmtBRL(offer.minDeposit)}</span>
            </Item>
          )}
          <Item>Bônus aplicado automaticamente ao confirmar depósito</Item>
        </ul>

        {/* CTA */}
        <button
          onClick={onDeposit}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-b from-[#3B8BFF] to-[#0F58DD] py-4 text-[17px] font-extrabold text-white shadow-[0_0_35px_rgba(37,110,240,0.65)] transition-all hover:from-[#4F97FF] hover:to-[#1663EC] active:scale-[0.99] sm:text-[19px]"
        >
          Depositar agora
          <ArrowRight size={22} strokeWidth={2.6} />
        </button>

        {/* Condição em letra honesta — evita surpresa no saque */}
        <div className="mt-5 border-t border-[#2A5CC4]/45 pt-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={22} className="mt-0.5 shrink-0 text-[#7FA8DE]" />
            <p className="text-[12.5px] leading-snug text-[#9DB6DA]">
              Bônus liberado para saque após operar {fmtBRL(offer.rollover)}× o valor recebido
              (até R$ {fmtBRL(offer.maxAmount)}). Seu depósito fica disponível para saque normalmente.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
