'use client'

import { X, Check, MousePointer, Trash2 } from 'lucide-react'
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

// Só as ferramentas que o chart desenha de fato. A lista antiga trazia 22 itens
// com 15 acinzentados que não respondiam ao clique.
const AVAILABLE_TOOLS = DRAWING_TOOLS.filter(t => t.impl)

export function DrawingsPanel({ onClose, activeTool, onSelectTool, onClearAll }: DrawingsPanelProps) {
  // Escolher a ferramenta FECHA o drawer. É o que resolve a sobreposição: o
  // painel de personalização (cor, espessura) abre logo em seguida no mesmo
  // canto de baixo, e com a lista aberta ele ficava encoberto.
  function pick(tool: string | null) {
    onSelectTool?.(tool)
    onClose()
  }

  return (
    <>
      <div className="absolute inset-0 z-30" onClick={onClose} />

      <div
        data-testid="desenhos-drawer"
        className="vx-drawer-up absolute bottom-0 left-0 right-0 z-40 flex max-h-[62%] flex-col rounded-t-2xl border-t border-[#1B2735] bg-[#0E1620] shadow-[0_-20px_50px_rgba(0,0,0,0.6)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#16202D] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="h-1 w-9 rounded-full bg-[#2A3A4D]" aria-hidden="true" />
            <h2 className="text-[13.5px] font-bold text-white">Desenhos</h2>
          </div>
          <div className="flex items-center gap-1">
            {onClearAll && (
              <button
                onClick={onClearAll}
                title="Apagar todos os desenhos"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#7E8DA2] transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#7E8DA2] transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <button
            onClick={() => pick(null)}
            className={cn(
              'flex items-center gap-2 self-start rounded-lg border px-3 py-2 transition-colors',
              activeTool == null
                ? 'border-[#1D5FE0] bg-[#1D5FE0]/15 text-white'
                : 'border-[#1B2735] bg-[#0A1017] text-[#C3CFDD] hover:border-[#2A3A4D] hover:text-white',
            )}
          >
            <MousePointer size={13} />
            <span className="text-[12.5px] font-medium">Cursor</span>
          </button>

          <div>
            <span className="mb-2 block text-[10px] font-bold tracking-widest text-[#7E8DA2]">FERRAMENTAS</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {AVAILABLE_TOOLS.map(tool => {
                const active = activeTool === tool.id
                return (
                  <button
                    key={tool.id}
                    onClick={() => pick(tool.id)}
                    aria-pressed={active}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'border-[#1D5FE0] bg-[#1D5FE0]/15 text-white'
                        : 'border-[#1B2735] bg-[#0A1017] text-[#C3CFDD] hover:border-[#2A3A4D] hover:text-white',
                    )}
                  >
                    <span className="min-w-0 truncate text-[12.5px] font-medium leading-tight">{tool.label}</span>
                    {active && <Check size={13} className="shrink-0 text-[#6C9CF8]" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
