'use client'

import { useEffect, useState } from 'react'
import {
  X, Check, Volume2, VolumeX, SlidersHorizontal, Palette, Gauge, MousePointerClick,
  MoveHorizontal, Tag,
} from 'lucide-react'
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

/* ─── Primitivos ─────────────────────────────────────────────────────────── */

function Section({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[#16202D] bg-[#0C131F] p-4">
      <header className="mb-3 flex items-center gap-2">
        <span className="text-[#4B8CF5]">{icon}</span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#8B9BB0]">{title}</h3>
      </header>
      {children}
    </section>
  )
}

function Switch({ on }: { on: boolean }) {
  return (
    <span className={cn(
      'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200',
      on ? 'bg-[#1D5FE0]' : 'bg-[#1B2735]',
    )}>
      <span className={cn(
        'absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
        on ? 'translate-x-[19px]' : 'translate-x-[3px]',
      )} />
    </span>
  )
}

/** Linha de opção booleana — um único padrão pra tudo, em vez de misturar
 *  checkbox numa seção e switch em outra como era antes. */
function OptionRow({ icon, label, sub, checked, onChange, testid, last }: {
  icon: React.ReactNode; label: string; sub: string
  checked: boolean; onChange: (v: boolean) => void; testid: string; last?: boolean
}) {
  return (
    <button
      data-testid={testid}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={cn(
        'flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-white/[0.02]',
        !last && 'border-b border-[#141C28]',
      )}
    >
      <span className={cn('shrink-0 transition-colors', checked ? 'text-[#6C9CF8]' : 'text-[#5B6A7E]')}>{icon}</span>
      <span className="min-w-0 flex-1 leading-none">
        <span className="block text-[13px] font-semibold text-[#EAF1FA]">{label}</span>
        <span className="mt-1.5 block text-[11.5px] leading-snug text-[#7E8DA2]">{sub}</span>
      </span>
      <Switch on={checked} />
    </button>
  )
}

function ColorRow({ label, colors, value, onChange, testid }: {
  label: string; colors: string[]; value: string; onChange: (c: string) => void; testid: string
}) {
  return (
    <div className="py-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/10" style={{ background: value }} />
        <span className="text-[12.5px] font-semibold text-[#EAF1FA]">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {colors.map(c => {
          const active = value.toLowerCase() === c.toLowerCase()
          return (
            <button
              key={c}
              data-testid={`${testid}-${c.replace('#', '')}`}
              onClick={() => onChange(c)}
              aria-label={c}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150',
                active ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0C131F]' : 'ring-1 ring-white/10 hover:scale-110',
              )}
              style={{ background: c }}
            >
              {active && <Check size={13} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Som ────────────────────────────────────────────────────────────────── */

function SoundSection() {
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
    <Section icon={muted ? <VolumeX size={15} /> : <Volume2 size={15} />} title="Som">
      <OptionRow
        testid="config-sound-toggle"
        icon={muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        label="Efeitos sonoros"
        sub="Sons de vitória, perda e operações"
        checked={!muted}
        onChange={toggleMuted}
        last
      />
      <div className={cn('mt-1 transition-opacity', muted && 'pointer-events-none opacity-40')}>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11.5px] text-[#7E8DA2]">Volume</span>
          <span className="text-[11.5px] font-bold tabular-nums text-white">{Math.round(volume * 100)}%</span>
        </div>
        <input
          type="range" min={0} max={100} value={Math.round(volume * 100)}
          onChange={e => changeVolume(parseInt(e.target.value, 10) / 100)}
          onMouseUp={() => { if (!muted && volume > 0) playSound('win') }}
          disabled={muted}
          className="w-full cursor-pointer accent-[#1D5FE0]"
        />
      </div>
    </Section>
  )
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */

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
        role="dialog"
        aria-label="Configurações"
        className="flex max-h-[88vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-[#1B2735] bg-[#0A101A] shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[#16202D] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1D5FE0]/15 text-[#6C9CF8]">
              <SlidersHorizontal size={16} />
            </span>
            <div className="leading-none">
              <h2 className="text-[15px] font-bold text-white">Configurações</h2>
              <p className="mt-1.5 text-[11.5px] text-[#7E8DA2]">Preferências salvas neste dispositivo</p>
            </div>
          </div>
          <button
            data-testid="config-close"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#7E8DA2] transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <Section icon={<SlidersHorizontal size={15} />} title="Plataforma">
            <OptionRow
              testid="config-autoscroll"
              icon={<MoveHorizontal size={17} />}
              label="Rolagem automática"
              sub="O gráfico acompanha o candle mais recente"
              checked={settings.autoScroll}
              onChange={v => setSetting('autoScroll', v)}
            />
            <OptionRow
              testid="config-oneclick"
              icon={<MousePointerClick size={17} />}
              label="Negociação com 1 clique"
              sub="Abre a operação sem tela de confirmação"
              checked={settings.oneClickTrade}
              onChange={v => setSetting('oneClickTrade', v)}
            />
            <OptionRow
              testid="config-performance"
              icon={<Gauge size={17} />}
              label="Modo desempenho"
              sub="Reduz efeitos visuais em máquinas mais fracas"
              checked={settings.performanceMode}
              onChange={v => setSetting('performanceMode', v)}
            />
            <OptionRow
              testid="config-shortlabels"
              icon={<Tag size={17} />}
              label="Rótulos curtos"
              sub="Abrevia nomes de ativos e valores na interface"
              checked={settings.shortLabels}
              onChange={v => setSetting('shortLabels', v)}
              last
            />
          </Section>

          <SoundSection />

          <Section icon={<Palette size={15} />} title="Cores do gráfico">
            <ColorRow
              testid="config-color-up"
              label="Tendência de alta" colors={UP_COLORS}
              value={colors.up} onChange={c => updateColor({ up: c })}
            />
            <div className="border-t border-[#141C28]" />
            <ColorRow
              testid="config-color-down"
              label="Tendência de baixa" colors={DOWN_COLORS}
              value={colors.down} onChange={c => updateColor({ down: c })}
            />
          </Section>
        </div>
      </div>
    </div>
  )
}
