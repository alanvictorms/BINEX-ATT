import { Construction } from 'lucide-react'

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-1">{title}</h1>
      <p className="text-sm text-[#6b7280] mb-12">{description ?? 'Módulo em construção'}</p>
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[#111827] border border-[#1e2433] flex items-center justify-center">
          <Construction size={28} className="text-green-400" />
        </div>
        <p className="text-white font-semibold">Em breve</p>
        <p className="text-xs text-[#6b7280] text-center max-w-xs">
          Este módulo será construído em breve. A estrutura de navegação já está pronta.
        </p>
      </div>
    </div>
  )
}
