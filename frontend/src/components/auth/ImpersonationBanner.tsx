'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, LogOut } from 'lucide-react'

const STORAGE_KEY = 'vtx_impersonating'

export function ImpersonationBanner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [active,  setActive]  = useState(false)
  const [email,   setEmail]   = useState('')
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    // Detecta entrada via magic link
    if (searchParams?.get('impersonated') === '1') {
      sessionStorage.setItem(STORAGE_KEY, '1')
      // limpa o query param da URL
      const url = new URL(window.location.href)
      url.searchParams.delete('impersonated')
      window.history.replaceState({}, '', url.toString())
    }

    const flag = sessionStorage.getItem(STORAGE_KEY) === '1'
    setActive(flag)

    if (flag) {
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.email) setEmail(data.user.email)
      })
    }
  }, [searchParams])

  async function handleExit() {
    setExiting(true)
    sessionStorage.removeItem(STORAGE_KEY)
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (!active) return null

  return (
    <div className="sticky top-0 z-[100] bg-orange-500 text-white px-4 py-2 flex items-center justify-between gap-3 shadow-lg">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle size={16} className="flex-shrink-0" />
        <span>
          ⚠ Você está logado como <span className="font-bold underline">{email || 'usuário'}</span> (modo impersonação admin). Todas as ações são registradas em audit log.
        </span>
      </div>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="flex items-center gap-1.5 px-3 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors flex-shrink-0 disabled:opacity-50"
      >
        <LogOut size={12} />
        {exiting ? 'Saindo...' : 'Sair da impersonação'}
      </button>
    </div>
  )
}
