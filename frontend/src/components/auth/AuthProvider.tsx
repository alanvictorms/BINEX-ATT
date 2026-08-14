'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { captureAttribution, captureAffiliate } from '@/lib/attribution'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const init = useAuthStore(s => s.init)

  useEffect(() => {
    // Captura o `ref` (TrackFlow) e o codigo de afiliado (?aff=) o quanto antes,
    // em qualquer pagina de entrada (antes de /register descartar os query params).
    captureAttribution()
    captureAffiliate()
    init()
  }, [init])

  return <>{children}</>
}
