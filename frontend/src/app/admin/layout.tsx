'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { Loader2, Menu, Sun, Moon } from 'lucide-react'
import './admin-skin.css'

type AdmTheme = 'dark' | 'light'
const THEME_KEY = 'admin:theme'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const user    = useAuthStore(s => s.user)
  const loading = useAuthStore(s => s.loading)

  const [adminCheck, setAdminCheck] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Tema do painel. Lido depois da montagem de propósito: ler localStorage no
  // primeiro render faria o HTML do servidor divergir do cliente.
  const [theme, setTheme] = useState<AdmTheme>('dark')
  useEffect(() => {
    const salvo = window.localStorage.getItem(THEME_KEY)
    if (salvo === 'light' || salvo === 'dark') setTheme(salvo)
  }, [])

  function toggleTheme() {
    setTheme(t => {
      const proximo: AdmTheme = t === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem(THEME_KEY, proximo)
      return proximo
    })
  }

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
    <div className="admin-skin flex h-[100dvh] bg-[#060A11] overflow-hidden" data-theme={theme}>
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra de topo. O menu sanduíche continua só no mobile; a barra passou
            a existir no desktop também para abrigar o seletor de tema. */}
        <header className="flex items-center gap-3 h-12 px-4 border-b border-[#1e2433] bg-[#060A11] flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 -ml-2 rounded-lg text-[#9ca3af] hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <span className="md:hidden text-sm font-bold text-white">Admin Panel</span>

          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e2433] text-[#9ca3af] transition-colors hover:text-white hover:bg-white/5"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
