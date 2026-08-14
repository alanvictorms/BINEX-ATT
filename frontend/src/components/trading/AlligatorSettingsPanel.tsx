'use client'

import { IndicatorSettingsPanel, type IndicatorField } from './IndicatorSettingsPanel'

// Padrão Bill Williams: 3 SMMAs do preço mediano (H+L)/2, deslocadas pro futuro.
export type AlligatorSettings = {
  jawPeriod: number
  jawShift: number
  teethPeriod: number
  teethShift: number
  lipsPeriod: number
  lipsShift: number
  colorJaw: string
  colorTeeth: string
  colorLips: string
}

export const ALLIGATOR_DEFAULTS: AlligatorSettings = {
  jawPeriod: 13,  jawShift: 8,
  teethPeriod: 8, teethShift: 5,
  lipsPeriod: 5,  lipsShift: 3,
  colorJaw: '#60a5fa',
  colorTeeth: '#ef4444',
  colorLips: '#4ade80',
}

const FIELDS: IndicatorField[] = [
  { kind: 'number', key: 'jawPeriod',   label: 'Período mandíbula (jaw)', min: 2, max: 100 },
  { kind: 'number', key: 'jawShift',    label: 'Desloc. mandíbula',       min: 0, max: 50 },
  { kind: 'number', key: 'teethPeriod', label: 'Período dentes (teeth)',  min: 2, max: 100 },
  { kind: 'number', key: 'teethShift',  label: 'Desloc. dentes',          min: 0, max: 50 },
  { kind: 'number', key: 'lipsPeriod',  label: 'Período lábios (lips)',   min: 2, max: 100 },
  { kind: 'number', key: 'lipsShift',   label: 'Desloc. lábios',          min: 0, max: 50 },
  { kind: 'color',  key: 'colorJaw',    label: 'jaw' },
  { kind: 'color',  key: 'colorTeeth',  label: 'teeth' },
  { kind: 'color',  key: 'colorLips',   label: 'lips' },
]

interface AlligatorSettingsPanelProps {
  settings: AlligatorSettings
  onChange: (s: AlligatorSettings) => void
  onBack: () => void
  onDelete: () => void
}

export function AlligatorSettingsPanel(props: AlligatorSettingsPanelProps) {
  return <IndicatorSettingsPanel title="Alligator" fields={FIELDS} {...props} />
}
