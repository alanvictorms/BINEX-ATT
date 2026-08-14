'use client'

import { IndicatorSettingsPanel, type IndicatorField } from './IndicatorSettingsPanel'

export type MAType = 'SMA' | 'EMA' | 'WMA' | 'SMMA'

export type MASettings = {
  period: number
  type: MAType
  color: string
}

export const MA_DEFAULTS: MASettings = {
  period: 20,
  type: 'SMA',
  color: '#ef4444',
}

const FIELDS: IndicatorField[] = [
  { kind: 'number', key: 'period', label: 'Período', min: 1, max: 500 },
  { kind: 'select', key: 'type',   label: 'Moving average', options: ['SMA', 'EMA', 'WMA', 'SMMA'] },
  { kind: 'color',  key: 'color',  label: 'main' },
]

interface MASettingsPanelProps {
  settings: MASettings
  onChange: (s: MASettings) => void
  onBack: () => void
  onDelete: () => void
}

export function MASettingsPanel(props: MASettingsPanelProps) {
  return <IndicatorSettingsPanel title="Moving Average" fields={FIELDS} {...props} />
}
