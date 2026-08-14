'use client'

import { IndicatorSettingsPanel, type IndicatorField } from './IndicatorSettingsPanel'

export type RSISettings = {
  period: number
  overbought: number
  oversold: number
  colorOverbought: string
  colorOversold: string
  colorMain: string
}

export const RSI_DEFAULTS: RSISettings = {
  period: 14,
  overbought: 70,
  oversold: 30,
  colorOverbought: '#ef4444',
  colorOversold: '#ef4444',
  colorMain: '#22c55e',
}

const FIELDS: IndicatorField[] = [
  { kind: 'number', key: 'period',          label: 'Período',              min: 2,  max: 200 },
  { kind: 'number', key: 'overbought',      label: 'Nível de sobrecompra', min: 51, max: 99 },
  { kind: 'number', key: 'oversold',        label: 'Nível de sobrevenda',  min: 1,  max: 49 },
  { kind: 'color',  key: 'colorOverbought', label: 'overbought' },
  { kind: 'color',  key: 'colorOversold',   label: 'oversold' },
  { kind: 'color',  key: 'colorMain',       label: 'main' },
]

interface RSISettingsPanelProps {
  settings: RSISettings
  onChange: (s: RSISettings) => void
  onBack: () => void
  onDelete: () => void
}

export function RSISettingsPanel(props: RSISettingsPanelProps) {
  return <IndicatorSettingsPanel title="RSI" fields={FIELDS} {...props} />
}
