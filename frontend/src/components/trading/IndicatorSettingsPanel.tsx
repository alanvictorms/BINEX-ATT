'use client'

// Painel genérico de configurações de indicador, dirigido por schema de campos.
// Cada indicador declara seus campos (number/select/color) e o arquivo do
// painel vira um wrapper fino — antes MA/BB/RSI/MACD duplicavam ~120 linhas
// de UI idêntica cada um.

import { useState } from 'react'
import { ChevronDown, ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type IndicatorField =
  | { kind: 'number'; key: string; label: string; min: number; max: number }
  | { kind: 'select'; key: string; label: string; options: readonly string[] }
  | { kind: 'color';  key: string; label: string }

const COLOR_PRESETS = [
  '#f97316', '#ef4444', '#facc15', '#4ade80', '#22d3ee', '#1FD196',
  '#c084fc', '#f472b6', '#e879f9', '#b91c1c', '#a78bfa', '#60a5fa',
  '#fb923c', '#22c55e', '#67e8f9', '#818cf8', '#f9a8d4', '#38bdf8',
]

function NumberField({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number
}) {
  return (
    <div className="px-4 py-3 border-b border-[#16202D]">
      <span className="text-[11px] text-[#7E8DA2] uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-7 h-7 flex items-center justify-center rounded bg-[#101825] text-white hover:bg-[#2d3347] transition-colors"
        >
          <Minus size={12} />
        </button>
        <span className="flex-1 text-center text-white font-bold text-lg tabular-nums">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-7 h-7 flex items-center justify-center rounded bg-[#101825] text-white hover:bg-[#2d3347] transition-colors"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: readonly string[]; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-4 py-3 border-b border-[#16202D]">
      <span className="text-[11px] text-[#7E8DA2] uppercase tracking-wider">{label}</span>
      <div className="relative mt-2">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 rounded bg-[#101825] border border-[#16202D] text-white text-sm hover:border-[#3a3f52] transition-colors"
        >
          <span className="font-medium">{value}</span>
          <ChevronDown size={14} className={cn('text-[#7E8DA2] transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-[#0E1620] border border-[#16202D] rounded shadow-xl z-50 overflow-hidden">
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false) }}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors',
                  opt === value ? 'bg-blue-600/30 text-white' : 'text-[#7E8DA2] hover:bg-white/5 hover:text-white'
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <div className="px-4 py-3 border-b border-[#16202D]">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-5 h-5 rounded-full flex-shrink-0 border border-white/20" style={{ backgroundColor: value }} />
        <span className="text-[13px] text-white">{label}</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {COLOR_PRESETS.map(color => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={cn(
              'w-7 h-7 rounded-full border-2 transition-all',
              value === color ? 'border-white scale-110' : 'border-transparent hover:border-white/40'
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
}

export interface IndicatorSettingsPanelProps<S extends Record<string, number | string>> {
  title: string
  fields: readonly IndicatorField[]
  settings: S
  onChange: (s: S) => void
  onBack: () => void
  onDelete: () => void
}

export function IndicatorSettingsPanel<S extends Record<string, number | string>>({
  title, fields, settings, onChange, onBack, onDelete,
}: IndicatorSettingsPanelProps<S>) {
  const set = (key: string, value: number | string) => onChange({ ...settings, [key]: value } as S)

  return (
    <div className="absolute top-0 left-0 h-full z-30 flex" style={{ width: 200 }}>
      <div className="flex flex-col w-full bg-[#0E1620] border-r border-[#16202D] shadow-2xl">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-[#16202D] flex-shrink-0">
          <button
            onClick={onBack}
            className="w-6 h-6 flex items-center justify-center text-[#7E8DA2] hover:text-white transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-bold text-white">{title}</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {fields.map(f => {
            if (f.kind === 'number') {
              return <NumberField key={f.key} label={f.label} value={settings[f.key] as number} onChange={v => set(f.key, v)} min={f.min} max={f.max} />
            }
            if (f.kind === 'select') {
              return <SelectField key={f.key} label={f.label} value={settings[f.key] as string} options={f.options} onChange={v => set(f.key, v)} />
            }
            return <ColorPicker key={f.key} label={f.label} value={settings[f.key] as string} onChange={v => set(f.key, v)} />
          })}
        </div>

        <div className="border-t border-[#16202D] p-3 flex-shrink-0">
          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-sm font-semibold"
          >
            <Trash2 size={13} />
            Excluir
          </button>
        </div>
      </div>
    </div>
  )
}
