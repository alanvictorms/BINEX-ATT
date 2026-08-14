'use client'

import { X, ChevronRight, MousePointer, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const DRAWING_TOOLS = [
  { id: 'Linha horizontal',        label: 'Linha horizontal',        impl: true },
  { id: 'Linha vertical',          label: 'Linha vertical',          impl: true },
  { id: 'Linha de trend',          label: 'Linha de trend',          impl: true },
  { id: 'Retração de Fibonacci',   label: 'Retração de Fibonacci',   impl: true },
  { id: 'Faixa de preço',          label: 'Faixa de preço' },
  { id: 'Parte superior/inferior plana', label: 'Parte superior/inferior plana' },
  { id: 'Canal separado',          label: 'Canal separado',          dot: '#ef4444' },
  { id: 'Arco',                    label: 'Arco' },
  { id: 'Linha Cruzada',           label: 'Linha Cruzada' },
  { id: 'Caixa Gann',              label: 'Caixa Gann' },
  { id: 'Ângulo de tendência',     label: 'Ângulo de tendência' },
  { id: 'Curva',                   label: 'Curva' },
  { id: 'Data e faixa de preço',   label: 'Data e faixa de preço' },
  { id: 'Pitchfan',                label: 'Pitchfan' },
  { id: 'Triângulo',               label: 'Triângulo' },
  { id: 'Canal paralelo',          label: 'Canal paralelo',          impl: true },
  { id: 'Pitchfork',               label: 'Pitchfork' },
  { id: 'Leque de Fibonacci',      label: 'Leque de Fibonacci' },
  { id: 'Período',                 label: 'Período' },
  { id: 'Raio',                    label: 'Raio' },
  { id: 'Linha Estendida',         label: 'Linha Estendida',         impl: true },
  { id: 'Retângulo',               label: 'Retângulo',               impl: true },
]

interface DrawingsPanelProps {
  onClose: () => void
  activeTool?: string | null
  onSelectTool?: (tool: string | null) => void
  onClearAll?: () => void
}

export function DrawingsPanel({ onClose, activeTool, onSelectTool, onClearAll }: DrawingsPanelProps) {
  return (
    <div className="absolute top-0 left-0 h-full z-30 flex" style={{ width: 220 }}>
      <div className="flex flex-col w-full bg-[#0E1620] border-r border-[#16202D] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#16202D] flex-shrink-0">
          <h2 className="text-sm font-bold text-white">Desenhos</h2>
          <div className="flex items-center gap-1">
            {onClearAll && (
              <button
                onClick={onClearAll}
                title="Apagar todos os desenhos"
                className="w-6 h-6 flex items-center justify-center text-[#7E8DA2] hover:text-red-400 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-[#7E8DA2] hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Cursor (deselect tool) */}
        <button
          onClick={() => onSelectTool?.(null)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 w-full transition-colors',
            activeTool == null
              ? 'bg-blue-600/20 text-white'
              : 'text-[#7E8DA2] hover:bg-white/5 hover:text-white'
          )}
        >
          <MousePointer size={13} />
          <span className="text-[13px] font-medium">Cursor</span>
        </button>

        {/* Section label */}
        <div className="px-4 pt-2 pb-1">
          <span className="text-[10px] font-bold text-[#7E8DA2] tracking-widest">DESENHOS</span>
        </div>

        {/* Tools list */}
        <div className="flex-1 overflow-y-auto">
          {DRAWING_TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => { if (tool.impl) onSelectTool?.(tool.id) }}
              className={cn(
                'w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors group',
                !tool.impl && 'opacity-40 cursor-not-allowed',
                activeTool === tool.id
                  ? 'bg-blue-600/20 text-white'
                  : tool.impl
                    ? 'text-white hover:bg-white/5'
                    : 'text-[#7E8DA2]'
              )}
            >
              <div className="flex items-center gap-2">
                {tool.dot && (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tool.dot }} />
                )}
                <span className="text-[13px] font-medium leading-tight">{tool.label}</span>
              </div>
              {tool.impl && (
                <ChevronRight size={13} className={cn(
                  'flex-shrink-0 transition-colors',
                  activeTool === tool.id ? 'text-blue-400' : 'text-[#7E8DA2] group-hover:text-white'
                )} />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
