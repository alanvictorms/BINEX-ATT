'use client'

import { IndicatorSettingsPanel, type IndicatorField } from './IndicatorSettingsPanel'

export type MACDSettings = {
  fastPeriod: number
  slowPeriod: number
  signalPeriod: number
  colorHistogram: string
  colorMACD: string
  colorSignal: string
}

export const MACD_DEFAULTS: MACDSettings = {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  colorHistogram: '#1FD196',
  colorMACD: '#60a5fa',
  colorSignal: '#ef4444',
}

const FIELDS: IndicatorField[] = [
  { kind: 'number', key: 'fastPeriod',     label: 'Período rápido',   min: 1, max: 200 },
  { kind: 'number', key: 'slowPeriod',     label: 'Período lento',    min: 1, max: 500 },
  { kind: 'number', key: 'signalPeriod',   label: 'Período de sinal', min: 1, max: 200 },
  { kind: 'color',  key: 'colorHistogram', label: 'histogram' },
  { kind: 'color',  key: 'colorMACD',      label: 'macd' },
  { kind: 'color',  key: 'colorSignal',    label: 'signal' },
]

interface MACDSettingsPanelProps {
  settings: MACDSettings
  onChange: (s: MACDSettings) => void
  onBack: () => void
  onDelete: () => void
}

export function MACDSettingsPanel(props: MACDSettingsPanelProps) {
  return <IndicatorSettingsPanel title="MACD" fields={FIELDS} {...props} />
}
