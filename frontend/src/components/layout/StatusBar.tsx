'use client'

import { useEffect, useState } from 'react'
import { Wifi, Globe, Clock } from 'lucide-react'

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

/** Barra de status do rodapé. Servidor fixo, latência simulada e relógio local. */
export function StatusBar() {
  const [ping, setPing] = useState(12)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const clock = setInterval(() => setNow(new Date()), 1000)
    const latency = setInterval(() => {
      setPing(p => {
        const next = p + Math.round((Math.random() - 0.5) * 9)
        return Math.min(48, Math.max(8, next))
      })
    }, 2400)
    return () => { clearInterval(clock); clearInterval(latency) }
  }, [])

  const pad = (n: number) => String(n).padStart(2, '0')
  const date = now ? `${pad(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}` : '--'
  const time = now ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` : '--:--:--'
  const tz = now ? `(UTC${-now.getTimezoneOffset() / 60 >= 0 ? '+' : ''}${-now.getTimezoneOffset() / 60})` : ''

  return (
    <footer
      data-testid="status-bar"
      className="flex h-[42px] shrink-0 items-center gap-5 border-t border-[#141C28] bg-[#080D15] px-5"
    >
      <div className="flex items-center gap-2.5">
        <Wifi size={16} className="text-[#1FD196]" />
        <span className="flex flex-col leading-none">
          <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#5D6C80]">Conexão</span>
          <span className="mt-[3px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#1FD196]">Estável</span>
        </span>
      </div>

      <span className="h-[24px] w-px bg-[#161F2C]" />

      <div className="flex items-center gap-2.5">
        <Globe size={16} className="text-[#6C7C92]" />
        <span className="flex flex-col leading-none">
          <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#5D6C80]">Servidor</span>
          <span className="mt-[3px] text-[11.5px] font-semibold text-[#D3DCE8]">New York, NY</span>
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[#1FD196]" data-testid="status-ping">
        <Clock size={12} />
        <span className="text-[11px] font-semibold tabular-nums">{ping}ms</span>
      </div>

      <div className="ml-auto flex items-center gap-2 text-[11px]" data-testid="status-clock">
        <span className="font-semibold uppercase tracking-[0.09em] text-[#5D6C80]">Hora atual:</span>
        <span className="font-semibold text-[#D3DCE8] tabular-nums">{date}</span>
        <span className="font-bold text-white tabular-nums">{time}</span>
        <span className="text-[#5D6C80]">{tz}</span>
      </div>
    </footer>
  )
}
