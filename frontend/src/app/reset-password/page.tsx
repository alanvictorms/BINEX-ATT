'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { secureAuth } from '@/lib/secureClient'
import { BrandMark } from '@/components/brand/BrandMark'
import { useSiteBrand } from '@/lib/useSiteBrand'

export default function ResetPasswordPage() {
  const siteBrand = useSiteBrand()
  const router = useRouter()

  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [done,        setDone]        = useState(false)
  const [sessionOk,   setSessionOk]   = useState<boolean | null>(null)

  // Verifica se chegou aqui através do link de recuperação válido
  useEffect(() => {
    let mounted = true
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setSessionOk(true)
      }
    })

    const tokenHash = new URLSearchParams(window.location.search).get('token_hash')

    async function validate() {
      // Link novo (token_hash no template do e-mail): valida direto no Supabase.
      // Funciona em qualquer dispositivo — não depende de cookie do navegador
      // onde o reset foi pedido (limitação do fluxo PKCE com ?code).
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
        if (!mounted) return
        setSessionOk(!error)
        return
      }

      // Fallback: links antigos (?code) ou sessão já existente
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      if (data.session) setSessionOk(true)
      else {
        // dá um pequeno tempo para o evento PASSWORD_RECOVERY chegar
        setTimeout(() => mounted && setSessionOk((cur) => cur === null ? false : cur), 1500)
      }
    }
    validate()

    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)
    try {
      const { error } = await secureAuth.updatePassword(password)
      if (error) throw error
      setDone(true)
      setTimeout(() => router.replace('/login'), 2500)
    } catch (err: any) {
      setError('Não foi possível redefinir a senha. Solicite um novo link e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-[#060A11] flex flex-col overflow-hidden">
      <div className="relative z-10 flex items-center justify-center py-3 sm:py-5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BrandMark size={32} />
          <span className="text-white font-bold text-lg tracking-widest">{siteBrand.name}</span>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-start pt-4 sm:pt-12 px-4 overflow-y-auto pb-6">
        <h1 className="text-white text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Nova senha</h1>

        <div className="w-full max-w-sm bg-[#0C131F]/90 backdrop-blur rounded-xl shadow-2xl border border-white/5 p-6">
          {sessionOk === null ? (
            <div className="text-center text-[#7E8DA2] text-sm py-6">Validando link...</div>
          ) : sessionOk === false ? (
            <div className="flex flex-col gap-4 text-center">
              <div className="text-red-400 text-4xl">✕</div>
              <p className="text-white text-sm">Link inválido ou expirado.</p>
              <Link
                href="/forgot-password"
                className="w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors font-bold text-white flex items-center justify-center text-sm"
              >
                Solicitar novo link
              </Link>
            </div>
          ) : done ? (
            <div className="flex flex-col gap-4 text-center">
              <div className="text-green-400 text-4xl">✓</div>
              <h2 className="text-white font-semibold text-lg">Senha atualizada</h2>
              <p className="text-[#7E8DA2] text-sm">Redirecionando para o login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-[#7E8DA2] text-sm leading-relaxed">
                Defina uma nova senha com pelo menos 8 caracteres.
              </p>

              <div className="relative">
                <span className="absolute -top-2.5 left-3 px-1 text-[10px] text-[#7E8DA2] bg-[#0C131F] z-10">Nova senha</span>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full bg-transparent border border-[#1B2735] rounded-lg px-3 py-3 pr-10 text-white text-sm outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7E8DA2] hover:text-white transition-colors text-xs"
                >
                  {showPass ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>

              <div className="relative">
                <span className="absolute -top-2.5 left-3 px-1 text-[10px] text-[#7E8DA2] bg-[#0C131F] z-10">Confirmar senha</span>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
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
                {loading ? 'Salvando...' : 'Definir nova senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
