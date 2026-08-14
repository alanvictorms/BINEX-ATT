'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { secureAuth } from '@/lib/secureClient'
import { BrandMark } from '@/components/brand/BrandMark'
import { useSiteBrand } from '@/lib/useSiteBrand'

export default function ForgotPasswordPage() {
  const siteBrand = useSiteBrand()
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await secureAuth.resetPasswordForEmail(email)
      if (error) throw error
      setSent(true)
    } catch (err: any) {
      setError('Não foi possível enviar o link. Verifique o e-mail e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-[#060A11] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-center py-3 sm:py-5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BrandMark size={32} />
          <span className="text-white font-bold text-lg tracking-widest">{siteBrand.name}</span>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-start pt-4 sm:pt-12 px-4 overflow-y-auto pb-6">
        <h1 className="text-white text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Recuperar senha</h1>

        <div className="w-full max-w-sm bg-[#0C131F]/90 backdrop-blur rounded-xl shadow-2xl border border-white/5 p-6">
          {sent ? (
            <div className="flex flex-col gap-4 text-center">
              <div className="text-green-400 text-4xl">✓</div>
              <h2 className="text-white font-semibold text-lg">E-mail enviado</h2>
              <p className="text-[#7E8DA2] text-sm leading-relaxed">
                Se o e-mail <span className="text-white">{email}</span> estiver cadastrado,
                você receberá um link para redefinir sua senha em alguns minutos.
              </p>
              <p className="text-[#7E8DA2] text-xs">
                Verifique também a caixa de spam.
              </p>
              <Link
                href="/login"
                className="mt-2 w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors font-bold text-white flex items-center justify-center text-sm"
              >
                Voltar para login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-[#7E8DA2] text-sm leading-relaxed">
                Digite o e-mail da sua conta. Enviaremos um link para você definir uma nova senha.
              </p>

              <div className="relative">
                <span className="absolute -top-2.5 left-3 px-1 text-[10px] text-[#7E8DA2] bg-[#0C131F] z-10">E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-transparent border border-[#1B2735] rounded-lg px-3 py-3 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {error && <p className="text-red-400 text-xs text-center">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors font-bold text-white flex items-center justify-center text-sm disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>

              <Link
                href="/login"
                className="text-center text-blue-400 hover:text-blue-300 transition-colors text-xs"
              >
                Voltar para login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
