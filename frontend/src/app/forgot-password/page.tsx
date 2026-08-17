'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MailCheck, Loader2 } from 'lucide-react'
import { secureAuth } from '@/lib/secureClient'
import { BrandMark } from '@/components/brand/BrandMark'
import { OtpInput } from '@/components/auth/OtpInput'
import { useSiteBrand } from '@/lib/useSiteBrand'

/**
 * Recuperação de senha em duas etapas, por CÓDIGO.
 *
 * O link do e-mail continua funcionando (o template manda os dois), mas o
 * caminho principal é o código: link de recuperação aberto no celular abre
 * noutro navegador, e o fluxo PKCE do Supabase depende do cookie do navegador
 * onde o pedido saiu. Com o código, quem pediu no desktop termina no desktop.
 *
 * O verifyOtp de 'recovery' devolve sessão — é ela que autoriza o updateUser da
 * senha em /reset-password.
 */
export default function ForgotPasswordPage() {
  const router    = useRouter()
  const siteBrand = useSiteBrand()

  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  const [otpError,   setOtpError]   = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpTry,     setOtpTry]     = useState(0)
  const [cooldown,   setCooldown]   = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await secureAuth.resetPasswordForEmail(email)
      if (error) throw error
      setSent(true)
      setCooldown(60)
    } catch {
      setError('Não foi possível enviar o código. Verifique o e-mail e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtp(code: string) {
    setOtpError('')
    setOtpLoading(true)
    try {
      const { error } = await secureAuth.verifyOtp({ email, token: code, type: 'recovery' })
      if (error) throw new Error(error.message)
      router.replace('/reset-password')
    } catch (err: any) {
      const msg = (err.message ?? '').toLowerCase()
      setOtpError(
        msg.includes('expired')
          ? 'Código expirado. Peça um novo.'
          : 'Código inválido. Confira e tente de novo.',
      )
      setOtpTry(t => t + 1)
    } finally {
      setOtpLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0) return
    setOtpError('')
    try {
      await secureAuth.resetPasswordForEmail(email)
      setCooldown(60)
    } catch {
      setOtpError('Não foi possível reenviar agora. Tente em alguns instantes.')
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#060A11]">
      <div className="relative z-10 flex flex-shrink-0 items-center justify-center border-b border-white/5 py-3 sm:py-5">
        <div className="flex items-center gap-2">
          <BrandMark size={32} />
          <span className="text-lg font-bold tracking-widest text-white">{siteBrand.name}</span>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 pb-6 pt-4 sm:pt-12">
        <h1 className="mb-4 text-xl font-bold text-white sm:mb-6 sm:text-2xl">Recuperar senha</h1>

        <div className="w-full max-w-sm rounded-xl border border-[#1B2735] bg-[#0C131F] p-6 shadow-2xl">
          {sent ? (
            <>
              <div className="flex flex-col items-center text-center">
                <span className="vx-ibox-green h-[52px] w-[52px]"><MailCheck size={22} /></span>
                <h2 className="vx-h2 mt-4 text-[19px]">Digite o código</h2>
                <p className="vx-sub mt-2.5">
                  Enviamos um código para{' '}
                  <span className="font-semibold text-[#E4EBF5]">{email}</span>.
                </p>
              </div>

              <div className="mt-6">
                <OtpInput
                  key={otpTry}
                  disabled={otpLoading}
                  error={!!otpError}
                  onComplete={handleOtp}
                  onChange={() => setOtpError('')}
                />
              </div>

              {otpError && <p className="mt-4 text-center text-[12px] text-[#F0435A]">{otpError}</p>}
              {otpLoading && (
                <p className="vx-sub-sm mt-4 flex items-center justify-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Verificando…
                </p>
              )}

              <div className="mt-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0}
                  className="vx-link disabled:cursor-not-allowed disabled:text-[#54637A]"
                >
                  {cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Reenviar código'}
                </button>
                <button
                  type="button"
                  onClick={() => { setSent(false); setOtpError(''); setError('') }}
                  className="vx-sub-sm transition-colors hover:text-white"
                >
                  Usar outro e-mail
                </button>
              </div>

              <p className="vx-sub-sm mt-6 text-center leading-relaxed">
                Verifique também a caixa de spam. O e-mail traz um link como alternativa —
                ele funciona, mas o código é mais direto.
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="vx-sub leading-relaxed">
                Digite o e-mail da sua conta. Enviaremos um código para você definir uma nova senha.
              </p>

              <label className="vx-field">
                <span className="text-[12px] font-medium text-[#AEBBCB]">E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="voce@email.com"
                  className="vx-input py-[12px]"
                />
              </label>

              {error && <p className="text-center text-[12px] text-[#F0435A]">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="vx-btn-blue w-full py-[13px] disabled:opacity-50"
              >
                {loading ? 'Enviando…' : 'Enviar código'}
              </button>

              <Link href="/login" className="vx-link justify-center text-[12px]">
                Voltar para login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
