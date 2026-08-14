'use client'

import { IndicatorSettingsPanel, type IndicatorField } from './IndicatorSettingsPanel'

// Fractal de Bill Williams: pivô com `period` velas menores de cada lado.
export type FractalSettings = {
  period: number
  colorUp: string
  colorDown: string
}

export const FRACTAL_DEFAULTS: FractalSettings = {
  period: 2,
  colorUp: '#1FD196',
  colorDown: '#ef4444',
}

const FIELDS: IndicatorField[] = [
  { kind: 'number', key: 'period',    label: 'Velas por lado', min: 1, max: 10 },
  { kind: 'color',  key: 'colorUp',   label: 'up' },
  { kind: 'color',  key: 'colorDown', label: 'down' },
]

interface FractalSettingsPanelProps {
  settings: FractalSettings
  onChange: (s: FractalSettings) => void
  onBack: () => void
  onDelete: () => void
}

export function FractalSettingsPanel(props: FractalSettingsPanelProps) {
  return <IndicatorSettingsPanel title="Fractal" fields={FIELDS} {...props} />
}
