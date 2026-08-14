'use client'

import { useEffect, useState } from 'react'

// Detecta "celular real" (touch + sem hover) OU janela estreita.
// Captura tablets/telefones em qualquer orientação e desktops com janela pequena.
const MOBILE_QUERY = '(hover: none) and (pointer: coarse), (max-width: 767px)'

// Detecta celular em paisagem — altura limitada distingue phone landscape
// de tablet landscape ou desktop em janela larga e baixa.
const PHONE_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px)'

function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null)

  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])

  return matches
}

export function useIsMobile(): boolean | null {
  return useMediaQuery(MOBILE_QUERY)
}

export function useIsPhoneLandscape(): boolean {
  return useMediaQuery(PHONE_LANDSCAPE_QUERY) === true
}
