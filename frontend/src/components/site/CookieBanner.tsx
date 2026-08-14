'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * Consentimento de cookies (LGPD).
 *
 * Modelo opt-in: nada além do essencial roda até o usuário aceitar. O valor
 * fica em localStorage e é lido por quem for disparar pixel/analytics — hoje
 * ninguém dispara, então o banner já nasce correto pro dia em que disparar.
 *
 * `vx_cookie_consent` = 'all' | 'essential'. Ausente = ainda não decidiu.
 */

const KEY = 'vx_cookie_consent'
const ABERTO_EVENT = 'vx:open-cookie-prefs'

export type ConsentValue = 'all' | 'essential'

/** Leitura segura do consentimento. Use antes de disparar qualquer tracking. */
export function getCookieConsent(): ConsentValue | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'all' || v === 'essential' ? v : null
  } catch {
    return null
  }
}

export function CookieBanner() {
  // null = ainda não sabemos (SSR / primeiro paint). Evita piscar o banner
  // pra quem já decidiu.
  const [decidido, setDecidido] = useState<boolean | null>(null)

  useEffect(() => {
    setDecidido(getCookieConsent() !== null)
    const abrir = () => setDecidido(false)
    window.addEventListener(ABERTO_EVENT, abrir)
    return () => window.removeEventListener(ABERTO_EVENT, abrir)
  }, [])

  function decidir(valor: ConsentValue) {
    try { localStorage.setItem(KEY, valor) } catch { /* modo privado — segue sem persistir */ }
    setDecidido(true)
  }

  if (decidido !== false) return null

  return (
    <div
      role="dialog"
      aria-label="Preferências de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#11151c] shadow-[0_-8px_32px_rgba(0,0,0,0.5)]"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
        <p className="text-[13px] leading-relaxed text-white/65">
          Usamos cookies essenciais para manter você conectado e proteger sua conta. Com sua
          autorização, usamos também cookies de medição e de atribuição de campanhas.{' '}
          <Link href="/legal/politica-de-cookies" className="font-semibold text-white underline underline-offset-2">
            Política de Cookies
          </Link>
        </p>
        <div className="flex flex-shrink-0 gap-2.5">
          <button
            type="button"
            onClick={() => decidir('essential')}
            className="rounded-lg border border-white/15 px-4 py-2 text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/5"
          >
            Somente essenciais
          </button>
          <button
            type="button"
            onClick={() => decidir('all')}
            className="rounded-lg bg-gradient-to-r from-[#00e0a4] to-[#00b3ff] px-4 py-2 text-[13px] font-bold text-[#06121b] transition-opacity hover:opacity-90"
          >
            Aceitar todos
          </button>
        </div>
      </div>
    </div>
  )
}

/** Link do rodapé que reabre o banner para o usuário rever a escolha. */
export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ABERTO_EVENT))}
      className="text-white/45 underline-offset-2 hover:text-white hover:underline"
    >
      Preferências de cookies
    </button>
  )
}
