'use client'

import { IndicatorSettingsPanel, type IndicatorField } from './IndicatorSettingsPanel'

export type StochasticSettings = {
  kPeriod: number
  smooth: number
  dPeriod: number
  overbought: number
  oversold: number
  colorK: string
  colorD: string
  colorOverbought: string
  colorOversold: string
}

export const STOCH_DEFAULTS: StochasticSettings = {
  kPeriod: 14,
  smooth: 3,
  dPeriod: 3,
  overbought: 80,
  oversold: 20,
  colorK: '#60a5fa',
  colorD: '#ef4444',
  colorOverbought: '#ef4444',
  colorOversold: '#ef4444',
}

const FIELDS: IndicatorField[] = [
  { kind: 'number', key: 'kPeriod',         label: 'Período %K',           min: 2,  max: 100 },
  { kind: 'number', key: 'smooth',          label: 'Suavização %K',        min: 1,  max: 50 },
  { kind: 'number', key: 'dPeriod',         label: 'Período %D',           min: 1,  max: 50 },
  { kind: 'number', key: 'overbought',      label: 'Nível de sobrecompra', min: 51, max: 99 },
  { kind: 'number', key: 'oversold',        label: 'Nível de sobrevenda',  min: 1,  max: 49 },
  { kind: 'color',  key: 'colorK',          label: 'k' },
  { kind: 'color',  key: 'colorD',          label: 'd' },
  { kind: 'color',  key: 'colorOverbought', label: 'overbought' },
  { kind: 'color',  key: 'colorOversold',   label: 'oversold' },
]

interface StochasticSettingsPanelProps {
  settings: StochasticSettings
  onChange: (s: StochasticSettings) => void
  onBack: () => void
  onDelete: () => void
}

export function StochasticSettingsPanel(props: StochasticSettingsPanelProps) {
  return <IndicatorSettingsPanel title="Stochastic" fields={FIELDS} {...props} />
}
