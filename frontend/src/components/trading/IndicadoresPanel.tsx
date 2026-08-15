'use client'

import { X, Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Indicator {
  id: string
  label: string
  impl?: boolean
}

const TREND_INDICATORS: Indicator[] = [
  { id: 'alligator',       label: 'Alligator',        impl: true },
  { id: 'bollinger-bands', label: 'Bollinger Bands',  impl: true },
  { id: 'envelopes',       label: 'Envelopes'         },
  { id: 'fractal',         label: 'Fractal',          impl: true },
  { id: 'ichimoku',        label: 'Ichimoku Cloud'    },
  { id: 'keltner',         label: 'Keltner channel'   },
  { id: 'donchian',        label: 'Donchian channel'  },
  { id: 'supertrend',      label: 'Supertrend'        },
  { id: 'moving-average',  label: 'Moving Average',   impl: true },
  { id: 'parabolic-sar',   label: 'Parabolic SAR',    impl: true },
  { id: 'zig-zag',         label: 'Zig Zag',          impl: true },
]

const OSCILLATOR_INDICATORS: Indicator[] = [
  { id: 'adx',                 label: 'ADX'                },
  { id: 'aroon',               label: 'Aroon'              },
  { id: 'awesome-oscillator',  label: 'Awesome Oscillator' },
  { id: 'bears-power',         label: 'Bears power'        },
  { id: 'bulls-power',         label: 'Bulls power'        },
  { id: 'cci',                 label: 'CCI'                },
  { id: 'demarker',            label: 'DeMarker'           },
  { id: 'atr',                 label: 'ATR'                },
  { id: 'macd',                label: 'MACD',              impl: true },
  { id: 'momentum',            label: 'Momentum'           },
  { id: 'rsi',                 label: 'RSI',               impl: true },
  { id: 'stochastic',          label: 'Stochastic',        impl: true },
  { id: 'williams',            label: 'Williams %R'        },
]

// Fonte da verdade de quais indicadores o TradingChart sabe renderizar —
// usada também pra filtrar ids fantasma vindos do localStorage.
export const IMPLEMENTED_INDICATOR_IDS: ReadonlySet<string> = new Set(
  [...TREND_INDICATORS, ...OSCILLATOR_INDICATORS].filter(i => i.impl).map(i => i.id)
)

interface IndicadoresPanelProps {
  onClose: () => void
  activeIds: Set<string>
  onToggle: (id: string) => void
  onClearAll: () => void
}

// Só o que o TradingChart realmente sabe desenhar. A lista antiga mostrava 13
// itens acinzentados que não faziam nada ao clicar — ocupavam espaço e davam a
// impressão de recurso quebrado.
const AVAILABLE_TREND = TREND_INDICATORS.filter(i => i.impl)
const AVAILABLE_OSC   = OSCILLATOR_INDICATORS.filter(i => i.impl)

function IndicatorChip({ indicator, active, onToggle }: {
  indicator: Indicator; active: boolean; onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
        active
          ? 'border-[#1D5FE0] bg-[#1D5FE0]/15 text-white'
          : 'border-[#1B2735] bg-[#0A1017] text-[#C3CFDD] hover:border-[#2A3A4D] hover:text-white',
      )}
    >
      <span className="min-w-0 truncate text-[12.5px] font-medium">{indicator.label}</span>
      {active && <Check size={13} className="shrink-0 text-[#6C9CF8]" />}
    </button>
  )
}

function Group({ label, items, activeIds, onToggle }: {
  label: string; items: Indicator[]; activeIds: Set<string>; onToggle: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <span className="mb-2 block text-[10px] font-bold tracking-widest text-[#7E8DA2]">{label}</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map(ind => (
          <IndicatorChip
            key={ind.id}
            indicator={ind}
            active={activeIds.has(ind.id)}
            onToggle={() => onToggle(ind.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function IndicadoresPanel({ onClose, activeIds, onToggle, onClearAll }: IndicadoresPanelProps) {
  return (
    <>
      {/* Clique fora fecha. Transparente: o gráfico continua visível enquanto
          se escolhe o indicador — é isso que faz o drawer inferior ganhar do
          painel lateral, que cobria justamente a área útil. */}
      <div className="absolute inset-0 z-30" onClick={onClose} />

      <div
        data-testid="indicadores-drawer"
        className="vx-drawer-up absolute bottom-0 left-0 right-0 z-40 flex max-h-[62%] flex-col rounded-t-2xl border-t border-[#1B2735] bg-[#0E1620] shadow-[0_-20px_50px_rgba(0,0,0,0.6)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#16202D] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="h-1 w-9 rounded-full bg-[#2A3A4D]" aria-hidden="true" />
            <h2 className="text-[13.5px] font-bold text-white">Indicadores</h2>
            {activeIds.size > 0 && (
              <span className="rounded-md bg-[#1D5FE0]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#6C9CF8]">
                {activeIds.size}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#7E8DA2] transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <Group label="TREND" items={AVAILABLE_TREND} activeIds={activeIds} onToggle={onToggle} />
          <Group label="OSCILADORES" items={AVAILABLE_OSC} activeIds={activeIds} onToggle={onToggle} />
        </div>

        {activeIds.size > 0 && (
          <div className="shrink-0 border-t border-[#16202D] p-3">
            <button
              onClick={onClearAll}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-semibold text-red-400 transition-colors hover:bg-red-500/10"
            >
              <Trash2 size={13} /> Excluir tudo
            </button>
          </div>
        )}
      </div>
    </>
  )
}
