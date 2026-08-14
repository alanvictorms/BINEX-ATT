'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { Loader2, Menu } from 'lucide-react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const user    = useAuthStore(s => s.user)
  const loading = useAuthStore(s => s.loading)

  const [adminCheck, setAdminCheck] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }

    let cancelled = false
    supabase.rpc('is_admin', { uid: user.id }).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setAdminCheck('denied')
        router.replace('/trade')
      } else {
        setAdminCheck('allowed')
      }
    })
    return () => { cancelled = true }
  }, [user, loading, router])

  // A gaveta fecha sozinha ao navegar: cada link da sidebar chama onClose no clique.

  if (loading || adminCheck === 'checking') {
    return (
      <div className="min-h-screen bg-[#060A11] flex items-center justify-center">
        <Loader2 className="animate-spin text-green-400" size={32} />
      </div>
    )
  }

  if (adminCheck !== 'allowed') return null

  return (
    <div className="flex h-[100dvh] bg-[#060A11] overflow-hidden">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra de topo — apenas mobile. No desktop (md+) fica oculta e o layout é idêntico ao atual. */}
        <header className="md:hidden flex items-center gap-3 h-14 px-4 border-b border-[#1e2433] bg-[#060A11] flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg text-[#9ca3af] hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <span className="text-sm font-bold text-white">Admin Panel</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
