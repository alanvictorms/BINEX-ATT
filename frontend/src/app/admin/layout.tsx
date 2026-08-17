'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { AdminSidebar, PAGE_META } from '@/components/admin/AdminSidebar'
import { Bell, Loader2, Menu, Moon, Search, Sun, TrendingUp } from 'lucide-react'
import './admin-skin.css'

// As famílias que o admin-skin.css pede. Sem carregar aqui, o CSS caía no
// system-ui e o painel ficava com a fonte do sistema — o desenho depende delas.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-adm-sans',
  display: 'swap',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-adm-mono',
  display: 'swap',
})

type AdmTheme = 'dark' | 'light'
const THEME_KEY = 'admin:theme'

const TOP_LINKS = ['Analytics', 'Operação', 'Tempo real', 'Tendências']

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const user    = useAuthStore(s => s.user)
  const loading = useAuthStore(s => s.loading)

  const [adminCheck, setAdminCheck] = useState<'checking' | 'allowed' | 'denied'>('checking')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState<AdmTheme>('light')

  // Portão de acesso. É a única coisa que separa o painel do resto da internet:
  // sem sessão vai pro login, sem is_admin volta pra plataforma. As RPCs também
  // checam no servidor, mas deixar a tela abrir para qualquer um entregaria de
  // graça a estrutura inteira do admin.
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

  // Iniciais de quem está logado — o "AD" fixo dizia a mesma coisa para todo
  // admin, e num painel com audit log importa saber com qual conta você está.
  const iniciais = useMemo(() => {
    const base = (user?.name || user?.email || '').trim()
    if (!base) return 'AD'
    const partes = base.split(/[\s.@_-]+/).filter(Boolean)
    return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || base.slice(0, 2).toUpperCase()
  }, [user?.name, user?.email])

  const meta = PAGE_META[pathname] ?? PAGE_META['/admin']

  if (loading || adminCheck === 'checking') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#EEF1F7]">
        <Loader2 className="animate-spin text-[#1D5EFF]" size={32} />
      </div>
    )
  }

  if (adminCheck !== 'allowed') return null

  return (
    <div
      className={`admin-skin nx-root ${jakarta.variable} ${plexMono.variable}`}
      data-theme={theme}
      data-testid="admin-shell"
    >
      <header className="nx-topbar">
        <div className="nx-nav">
          <button
            className="nx-iconbtn nx-menubtn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            data-testid="sidebar-open-button"
          >
            <Menu size={18} />
          </button>

          <div className="nx-brand">
            <span className="nx-brand__mark"><TrendingUp size={17} /></span>
            <span className="nx-brand__name">Admin Panel</span>
          </div>

          <nav className="nx-toplinks">
            {TOP_LINKS.map((l, i) => (
              <span key={l} className="nx-toplink" data-active={i === 0} data-testid={`topnav-${i}`}>{l}</span>
            ))}
          </nav>

          <div className="nx-search">
            <Search size={14} />
            <input placeholder="Buscar por nome, e-mail ou ID" data-testid="global-search-input" />
          </div>

          <button className="nx-iconbtn" aria-label="Notificações" data-testid="notifications-button">
            <Bell size={16} />
            <span className="nx-iconbtn__dot" />
          </button>

          <button
            className="nx-iconbtn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            data-testid="theme-toggle-button"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <span className="nx-avatar" title={user?.email ?? ''} data-testid="admin-avatar">{iniciais}</span>
        </div>

        <div className="nx-hero">
          <div className="nx-hero__eyebrow">Painel administrativo</div>
          <h2 className="nx-hero__title" data-testid="page-hero-title">{meta.title}</h2>
        </div>
      </header>

      <div className="nx-shell">
        <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="nx-main" data-testid="admin-main">{children}</main>
      </div>
    </div>
  )
}
