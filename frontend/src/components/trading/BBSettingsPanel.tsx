'use client'

import { IndicatorSettingsPanel, type IndicatorField } from './IndicatorSettingsPanel'

export type BBSettings = {
  period: number
  deviation: number
  colorTop: string
  colorMid: string
  colorBot: string
  colorFill: string
}

export const BB_DEFAULTS: BBSettings = {
  period: 20, deviation: 2,
  colorTop: '#eab308', colorMid: '#eab308', colorBot: '#eab308', colorFill: '#eab308',
}

const FIELDS: IndicatorField[] = [
  { kind: 'number', key: 'period',    label: 'Período', min: 2, max: 200 },
  { kind: 'number', key: 'deviation', label: 'Desvio',  min: 1, max: 10 },
  { kind: 'color',  key: 'colorTop',  label: 'top' },
  { kind: 'color',  key: 'colorMid',  label: 'middle' },
  { kind: 'color',  key: 'colorBot',  label: 'bottom' },
  { kind: 'color',  key: 'colorFill', label: 'background' },
]

interface BBSettingsPanelProps {
  settings: BBSettings
  onChange: (s: BBSettings) => void
  onBack: () => void
  onDelete: () => void
}

export function BBSettingsPanel(props: BBSettingsPanelProps) {
  return <IndicatorSettingsPanel title="Bollinger Bands" fields={FIELDS} {...props} />
}
