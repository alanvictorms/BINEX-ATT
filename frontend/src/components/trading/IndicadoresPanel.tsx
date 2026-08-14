'use client'

import { X, ChevronRight, Trash2 } from 'lucide-react'
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

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-4 pt-4 pb-1">
      <span className="text-[10px] font-bold text-[#7E8DA2] tracking-widest">{label}</span>
    </div>
  )
}

function IndicatorRow({ indicator, active, onToggle }: { indicator: Indicator; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={() => { if (indicator.impl) onToggle() }}
      className={cn(
        'w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group',
        !indicator.impl && 'opacity-40 cursor-not-allowed',
        active
          ? 'bg-[#101825] text-white'
          : indicator.impl
            ? 'text-white hover:bg-white/5'
            : 'text-[#7E8DA2]'
      )}
    >
      <span className="text-[13px] font-medium">{indicator.label}</span>
      {indicator.impl && (
        <ChevronRight size={13} className={cn('transition-colors flex-shrink-0', active ? 'text-blue-400' : 'text-[#7E8DA2] group-hover:text-white')} />
      )}
    </button>
  )
}

export function IndicadoresPanel({ onClose, activeIds, onToggle, onClearAll }: IndicadoresPanelProps) {
  return (
    <div className="absolute top-0 left-0 h-full z-30 flex" style={{ width: 200 }}>
      <div className="flex flex-col w-full bg-[#0E1620] border-r border-[#16202D] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#16202D] flex-shrink-0">
          <h2 className="text-sm font-bold text-white">Indicadores</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-[#7E8DA2] hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto">
          <SectionLabel label="INDICADORES DE TREND" />
          {TREND_INDICATORS.map((ind) => (
            <IndicatorRow
              key={ind.id}
              indicator={ind}
              active={activeIds.has(ind.id)}
              onToggle={() => onToggle(ind.id)}
            />
          ))}

          <SectionLabel label="OSCILADORES" />
          {OSCILLATOR_INDICATORS.map((ind) => (
            <IndicatorRow
              key={ind.id}
              indicator={ind}
              active={activeIds.has(ind.id)}
              onToggle={() => onToggle(ind.id)}
            />
          ))}
        </div>

        {/* Footer */}
        {activeIds.size > 0 && (
          <div className="border-t border-[#16202D] p-3 flex-shrink-0">
            <button
              onClick={onClearAll}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-sm font-semibold"
            >
              <Trash2 size={13} />
              Excluir tudo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
