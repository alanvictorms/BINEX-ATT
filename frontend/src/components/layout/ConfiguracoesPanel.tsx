'use client'

import { useEffect, useState } from 'react'
import { X, Check, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { playSound, getSoundPrefs, setSoundPrefs } from '@/lib/sound'
import { getCandleColors, setCandleColors, type CandleColors } from '@/lib/candleColors'

type Theme = 'diurno' | 'crepusculo' | 'noite'

export interface TradeSettings {
  autoScroll: boolean
  oneClickTrade: boolean
  performanceMode: boolean
  shortLabels: boolean
}

interface ConfiguracoesPanelProps {
  onClose: () => void
  theme?: Theme
  onThemeChange?: (t: Theme) => void
  settings?: TradeSettings
  onSettingsChange?: (s: TradeSettings) => void
  mobile?: boolean
}

const UP_COLORS   = ['#1FD196', '#22c55e', '#16a34a', '#06b6d4', '#67e8f9', '#e5e7eb']
const DOWN_COLORS = ['#F0435A', '#ef4444', '#b91c1c', '#f97316', '#a855f7', '#111827']

const DEFAULT_SETTINGS: TradeSettings = {
  autoScroll: true,
  oneClickTrade: true,
  performanceMode: true,
  shortLabels: true,
}

function SectionLabel({ label }: { label: string }) {
  return <p className="vx-label mb-3">{label}</p>
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-[#1D5FE0]' : 'bg-[#1B2735]')}>
      <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', on ? 'translate-x-4' : 'translate-x-0.5')} />
    </div>
  )
}

function CheckItem({ label, sub, checked, onChange, testid }: {
  label: string; sub: string; checked: boolean; onChange: (v: boolean) => void; testid: string
}) {
  return (
    <button data-testid={testid} onClick={() => onChange(!checked)} className="group mb-4 flex w-full items-start gap-3 text-left">
      <div className={cn(
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        checked ? 'border-[#1D5FE0] bg-[#1D5FE0]' : 'border-[#1B2735] bg-transparent',
      )}>
        {checked && <Check size={10} className="text-white" />}
      </div>
      <div>
        <div className="text-[13px] font-semibold text-white">{label}</div>
        <div className="vx-sub-sm mt-0.5">{sub}</div>
      </div>
    </button>
  )
}

function ColorPicker({ label, colors, value, onChange, testid }: {
  label: string; colors: string[]; value: string; onChange: (c: string) => void; testid: string
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-4 w-4 shrink-0 rounded-full" style={{ background: value }} />
        <span className="text-[13px] font-semibold text-white">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {colors.map(c => (
          <button
            key={c}
            data-testid={`${testid}-${c.replace('#', '')}`}
            onClick={() => onChange(c)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-transform hover:scale-105"
            style={{ background: c, borderColor: value.toLowerCase() === c.toLowerCase() ? 'white' : 'transparent' }}
          >
            {value.toLowerCase() === c.toLowerCase() && <Check size={14} className="text-white drop-shadow" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function SoundSettings() {
  const [muted, setMuted] = useState(() => getSoundPrefs().muted)
  const [volume, setVolume] = useState(() => getSoundPrefs().volume)

  function toggleMuted() {
    const next = !muted
    setMuted(next)
    setSoundPrefs({ muted: next })
    if (!next) playSound('win')
  }

  function changeVolume(v: number) {
    setVolume(v)
    if (muted && v > 0) setMuted(false)
    setSoundPrefs({ volume: v, muted: v > 0 ? false : muted })
  }

  return (
    <>
      <SectionLabel label="SOM" />
      <button data-testid="config-sound-toggle" onClick={toggleMuted} className="group mb-4 flex w-full items-center justify-between">
        <div className="flex items-center gap-3">
          {muted
            ? <VolumeX size={18} className="shrink-0 text-[#7E8DA2]" />
            : <Volume2 size={18} className="shrink-0 text-[#4B8CF5]" />}
          <div className="text-left">
            <div className="text-[13px] font-semibold text-white">Efeitos sonoros</div>
            <div className="vx-sub-sm mt-0.5">Sons de vitória, perda e operações</div>
          </div>
        </div>
        <Toggle on={!muted} />
      </button>
      <div className="mb-5 px-1">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] text-[#7E8DA2]">Volume</span>
          <span className="text-[11px] font-bold tabular-nums text-white">{Math.round(volume * 100)}%</span>
        </div>
        <input
          type="range" min={0} max={100} value={Math.round(volume * 100)}
          onChange={e => changeVolume(parseInt(e.target.value, 10) / 100)}
          onMouseUp={() => { if (!muted && volume > 0) playSound('win') }}
          disabled={muted}
          className="w-full cursor-pointer accent-[#1D5FE0] disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>
    </>
  )
}

export function ConfiguracoesPanel({ onClose, settings = DEFAULT_SETTINGS, onSettingsChange }: ConfiguracoesPanelProps) {
  const [colors, setColors] = useState<CandleColors>(() => getCandleColors())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function setSetting<K extends keyof TradeSettings>(key: K, value: TradeSettings[K]) {
    onSettingsChange?.({ ...settings, [key]: value })
  }

  function updateColor(patch: Partial<CandleColors>) {
    const next = { ...colors, ...patch }
    setColors(next)
    setCandleColors(next)
  }

  return (
    <div
      data-testid="config-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#03060B]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-[#1B2735] bg-[#0A101A] shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#16202D] px-5 py-4">
          <h2 className="vx-h3 text-[16px]">Configurações</h2>
          <button
            data-testid="config-close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#7E8DA2] transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <SectionLabel label="PLATAFORMA" />
          <CheckItem
            testid="config-autoscroll"
            label="Rolagem automática" sub="Rolagem gráfica automática"
            checked={settings.autoScroll} onChange={v => setSetting('autoScroll', v)}
          />
          <CheckItem
            testid="config-oneclick"
            label="Negociação com 1 clique" sub="Negociações abertas sem confirmação"
            checked={settings.oneClickTrade} onChange={v => setSetting('oneClickTrade', v)}
          />

          <SoundSettings />

          <SectionLabel label="CORES DO GRÁFICO" />
          <ColorPicker
            testid="config-color-up"
            label="Tendência de alta" colors={UP_COLORS}
            value={colors.up} onChange={c => updateColor({ up: c })}
          />
          <ColorPicker
            testid="config-color-down"
            label="Tendência de baixa" colors={DOWN_COLORS}
            value={colors.down} onChange={c => updateColor({ down: c })}
          />
        </div>
      </div>
    </div>
  )
}
