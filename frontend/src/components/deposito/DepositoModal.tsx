'use client'

import { useEffect, useState } from 'react'
import { X, Wallet, Gift } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { PixCheckout } from './PixCheckout'

interface DepositoModalProps {
  onClose: () => void
}

/* ─── ícones dos métodos ─── */
function PixIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="flex-shrink-0">
      <circle cx="16" cy="16" r="16" fill="#32BCAD" />
      <path d="M20.5 11.5L16 16l-4.5-4.5m9 9L16 16l4.5 4.5m-9 0L16 16l-4.5 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function UsdtIcon({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-[#26A17B] flex items-center justify-center flex-shrink-0"
    >
      <span className="text-white text-sm font-bold">₮</span>
    </div>
  )
}

type PaymentMethod = {
  id:        string
  name:      string
  hint:      string
  icon:      React.ReactNode
  badge?:    string
  available: boolean
}

/**
 * Métodos de depósito.
 *
 * `available: false` renderiza o card apagado e sem clique — nunca um botão que
 * promete e não entrega. Esta tela já teve 16 métodos decorativos (Bitcoin,
 * Litecoin, Binance Pay, USDT em 3 redes) cujo clique caía num `if` vazio.
 *
 * Pra ligar o USDT: virar `available: true` e tratar o id na renderização do
 * checkout. A integração é o mesmo POST /v2/transactions/cashin do PIX, com
 * `currency: "USDT"` e `chain: "tron"`.
 */
const METHODS: PaymentMethod[] = [
  { id: 'pix',  name: 'PIX',  hint: 'Depósito instantâneo', icon: <PixIcon />,  available: true },
  { id: 'usdt', name: 'USDT', hint: 'Em breve', badge: 'TRON', icon: <UsdtIcon />, available: false },
]

function MethodCard({
  method, active, onSelect,
}: { method: PaymentMethod; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      disabled={!method.available}
      className={cn(
        'flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-colors w-full',
        active
          ? 'bg-green-500/10 border-green-500/60'
          : method.available
            ? 'bg-[#0E1620] border-[#16202D] hover:border-[#1B2735]'
            : 'bg-[#0E1620]/50 border-[#16202D]/60 opacity-50 cursor-not-allowed',
      )}
    >
      {method.icon}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-white">{method.name}</span>
          {method.badge && (
            <span className="px-1.5 py-0.5 rounded bg-[#16202D] text-[9px] font-bold text-[#7E8DA2] tracking-wide">
              {method.badge}
            </span>
          )}
        </div>
        <div className={cn('text-[10px] mt-0.5 truncate', active ? 'text-green-400' : 'text-[#7E8DA2]')}>
          {method.hint}
        </div>
      </div>
    </button>
  )
}

export function DepositoModal({ onClose }: DepositoModalProps) {
  const enabled = METHODS.filter(m => m.available)
  const [activeMethod, setActiveMethod] = useState<string>(enabled[0]?.id ?? 'pix')

  // Oferta escalonada dos primeiros depósitos: mostra o banner com o percentual
  // do PRÓXIMO depósito do lead (200% no 1º, 100% no 2º, 50% no 3º). Valores
  // lidos do banco (/api/bonus/offer — a regra do admin); fallback [100] se a
  // rota falhar. Oferta desligada no admin ou escada esgotada => sem banner.
  const [depositCount, setDepositCount] = useState(-1)  // -1 = desconhecido
  const [offer, setOffer] = useState<{ enabled: boolean; pcts: number[]; maxAmount: number; minDeposit: number }>(
    { enabled: true, pcts: [100], maxAmount: 300, minDeposit: 0 },
  )
  useEffect(() => {
    supabase
      .from('deposits')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .eq('is_fake', false)
      .then(({ count, error }) => {
        if (!error) setDepositCount(count ?? 0)
      })
    fetch('/api/bonus/offer')
      .then(r => r.json())
      .then(o => {
        if (Array.isArray(o?.pcts) && o.pcts.length > 0) {
          setOffer({
            enabled:    !!o.enabled,
            pcts:       o.pcts,
            maxAmount:  o.maxAmount,
            minDeposit: Number(o.minDeposit) || 0,
          })
        }
      })
      .catch(() => {})
  }, [])

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  const tierPct = depositCount >= 0 ? (offer.pcts[depositCount] ?? 0) : 0
  const tierAvailable = offer.enabled && depositCount >= 0 && depositCount < offer.pcts.length && tierPct > 0

  const methodSelector = (
    <div className="grid grid-cols-2 gap-2">
      {METHODS.map(m => (
        <MethodCard
          key={m.id}
          method={m}
          active={m.id === activeMethod}
          onSelect={() => m.available && setActiveMethod(m.id)}
        />
      ))}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#03060B]/80 backdrop-blur-sm p-3 sm:p-0">
      <div className="relative bg-[#0A101A] rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.7)] border border-[#1B2735] w-full max-w-[520px] max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-4 sm:px-6 py-4 sm:py-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#0F2A21] border border-[#1E5140] flex items-center justify-center flex-shrink-0">
              <Wallet size={20} className="text-[#3FE0A6]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Depósito</h2>
              <p className="text-xs text-[#7E8DA2] mt-0.5">Escolha o método e faça seu depósito</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#7E8DA2] hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {tierAvailable && (
          <div className="mx-4 sm:mx-6 flex items-center gap-3 bg-gradient-to-r from-green-600/15 to-blue-600/15 border border-green-500/30 rounded-xl px-4 py-3 flex-shrink-0">
            <Gift size={18} className="text-green-400 flex-shrink-0" />
            <p className="text-xs sm:text-sm text-white leading-snug">
              <span className="font-bold text-green-400">Bônus de {fmtBRL(tierPct)}%</span>
              {depositCount === 0 ? ' no seu primeiro depósito' : ` no seu ${depositCount + 1}º depósito`} —
              ganhe até <span className="font-bold">R$ {fmtBRL(offer.maxAmount)}</span> extras no saldo!
            </p>
          </div>
        )}

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeMethod === 'pix' && (
            <PixCheckout
              methodSelector={methodSelector}
              bonusPct={tierAvailable ? tierPct : 0}
              bonusMinDeposit={offer.minDeposit}
              onSuccess={onClose}
            />
          )}
        </div>

      </div>
    </div>
  )
}
