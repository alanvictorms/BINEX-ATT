'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, TrendingUp, Zap, BadgeCheck, Globe, ChevronDown,
  MailCheck,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { MfaChallenge } from '@/components/auth/MfaChallenge'
import { OtpInput } from '@/components/auth/OtpInput'
import { BrandMark } from '@/components/brand/BrandMark'
import { useSiteBrand } from '@/lib/useSiteBrand'

const COUNTRIES = [
  'Brasil', 'Portugal', 'Angola', 'Moçambique', 'Cabo Verde',
  'Estados Unidos', 'Reino Unido', 'Alemanha', 'França', 'Espanha',
  'Argentina', 'Chile', 'Colômbia', 'México', 'Peru',
]

// Plataforma opera 100% em BRL (carteira, motor e Pix).
const CURRENCIES = ['BRL']

const HIGHLIGHTS = [
  { icon: <TrendingUp size={17} />,  title: 'Payouts elevados',            desc: 'Opere moedas, cripto e ações com retornos competitivos.' },
  { icon: <Zap size={17} />,         title: 'Depósito instantâneo via PIX', desc: 'Saldo disponível em segundos, 24 horas por dia.' },
  { icon: <ShieldCheck size={17} />, title: 'Ambiente seguro',              desc: 'Criptografia de nível bancário e conformidade LGPD.' },
]

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#060A11]" />}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const siteBrand    = useSiteBrand()
  const redirectTo   = searchParams?.get('redirect') || '/trade'
  const [tab, setTab] = useState<'login' | 'register'>(
    searchParams?.get('tab') === 'register' ? 'register' : 'login'
  )
  const login    = useAuthStore(s => s.login)
  const register = useAuthStore(s => s.register)
  const confirmSignup   = useAuthStore(s => s.confirmSignup)
  const resendSignupOtp = useAuthStore(s => s.resendSignupOtp)

  const [mfaStep, setMfaStep] = useState(false)

  // Confirmação de e-mail por código. Guarda o e-mail que está esperando o
  // código — é ele que vai no verifyOtp, não o campo da tela (o usuário pode
  // trocar a aba e mexer no input enquanto o e-mail está a caminho).
  const [otpEmail, setOtpEmail] = useState<string | null>(null)
  const [otpError, setOtpError] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  // Remonta o OtpInput pra limpar os dígitos depois de um código recusado.
  const [otpTry, setOtpTry] = useState(0)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  const [country,   setCountry]   = useState('')
  const [currency,  setCurrency]  = useState('BRL')
  const [rEmail,    setREmail]    = useState('')
  const [rPassword, setRPassword] = useState('')
  const [showRPass, setShowRPass] = useState(false)
  const [terms18,   setTerms18]   = useState(false)
  const [termsNoUS, setTermsNoUS] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')
  const [countryOpen,   setCountryOpen]   = useState(false)

  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const isLogin = tab === 'login'
  const filteredCountries = COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()))

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.nextLevel === 'aal2' && aal?.currentLevel === 'aal1') {
        setMfaStep(true)
        return
      }
      router.replace(redirectTo)
    } catch (err: any) {
      const msg = err.message ?? ''
      if (msg.includes('Invalid login credentials')) setError('E-mail ou senha incorretos.')
      // Conta criada e nunca confirmada: em vez de um beco sem saída ("confirme
      // seu e-mail" e nada mais), manda um código novo e abre a tela do código.
      else if (/email not confirmed|not confirmed/i.test(msg)) {
        resendSignupOtp(email).catch(() => { /* o código anterior ainda vale */ })
        setOtpEmail(email)
        setCooldown(60)
      }
      else setError('Erro ao entrar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtp(code: string) {
    if (!otpEmail) return
    setOtpError('')
    setOtpLoading(true)
    try {
      await confirmSignup(otpEmail, code)
      router.replace('/trade')
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
    if (!otpEmail || cooldown > 0) return
    setOtpError('')
    try {
      await resendSignupOtp(otpEmail)
      setCooldown(60)
    } catch {
      setOtpError('Não foi possível reenviar agora. Tente em alguns instantes.')
    }
  }

  async function handleMfaCancel() {
    await supabase.auth.signOut()
    setMfaStep(false)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!terms18) { setError('Confirme que você tem 18 anos ou mais.'); return }
    if (rPassword.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return }
    setLoading(true)
    try {
      const name = rEmail.split('@')[0]
      await register(name, rEmail, rPassword)
      router.replace('/trade')
    } catch (err: any) {
      const msg = err.message ?? ''
      if (msg.includes('EMAIL_CONFIRMATION_REQUIRED')) { setOtpEmail(rEmail); setCooldown(60) }
      else if (msg.includes('already registered')) setError('Este e-mail já está em uso.')
      else setError('Erro ao criar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-[#060A11] text-[#E4EBF5] antialiased">
      <div className="flex min-h-screen w-full items-center justify-center px-4 py-6 sm:px-5 sm:py-10">
        <div className="flex w-full max-w-[1080px] items-stretch gap-10">

          {/* Marca / argumentos */}
          <div className="hidden min-w-0 flex-1 flex-col justify-center lg:flex">
            <div className="flex items-center gap-3">
              <BrandMark size={44} />
              <div className="text-[21px] leading-none tracking-[-0.01em]">
                <span className="font-extrabold text-white">{siteBrand.name}</span>{' '}
                <span className="font-medium text-[#9AA9BC]">{siteBrand.subtitle}</span>
              </div>
            </div>

            <h1 className="mt-10 text-[34px] font-bold leading-[1.15] tracking-[-0.02em] text-white">
              Negocie os mercados<br />globais com confiança.
            </h1>
            <p className="vx-sub mt-5 max-w-[420px] text-[13.5px]">
              Crie sua conta em menos de um minuto e comece a operar com uma plataforma
              rápida, segura e feita para traders brasileiros.
            </p>

            <div className="mt-10 flex flex-col gap-4">
              {HIGHLIGHTS.map(h => (
                <div key={h.title} className="flex items-start gap-3.5">
                  <span className="vx-ibox-green">{h.icon}</span>
                  <span className="leading-none">
                    <span className="block text-[13.5px] font-semibold text-[#EAF1FA]">{h.title}</span>
                    <span className="vx-sub-sm mt-2 block">{h.desc}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-10 flex items-center gap-2.5">
              <BadgeCheck size={16} className="text-[#4B8CF5]" />
              <span className="vx-sub-sm">Plataforma de opções digitais com conta demo gratuita</span>
            </div>
          </div>

          {/* Formulário — no mobile ocupa a largura toda; o max-w só vale a
              partir de lg, onde ele divide a tela com a coluna institucional. */}
          <div className="vx-panel w-full shrink-0 rounded-2xl p-5 sm:p-7 lg:max-w-[430px]">
            {/* Marca — só no mobile, onde a coluna da esquerda não aparece e a
                tela ficaria sem nenhuma identificação. */}
            <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
              <BrandMark size={30} />
              <span className="text-[18px] leading-none tracking-[-0.01em]">
                <span className="font-extrabold text-white">{siteBrand.name}</span>{' '}
                <span className="font-medium text-[#9AA9BC]">{siteBrand.subtitle}</span>
              </span>
            </div>

            {mfaStep ? (
              <>
                <h2 className="vx-h2">Verificação de segurança</h2>
                <div className="mt-6">
                  <MfaChallenge onSuccess={() => router.replace(redirectTo)} onCancel={handleMfaCancel} />
                </div>
              </>
            ) : otpEmail ? (
              <>
                <div className="flex flex-col items-center text-center">
                  <span className="vx-ibox-green h-[52px] w-[52px]"><MailCheck size={22} /></span>
                  <h2 className="vx-h2 mt-4">Confirme seu e-mail</h2>
                  <p className="vx-sub mt-2.5">
                    Enviamos um código de 6 dígitos para{' '}
                    <span className="font-semibold text-[#E4EBF5]">{otpEmail}</span>.
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

                {otpError && (
                  <p data-testid="otp-error" className="mt-4 text-center text-[12px] text-[#F0435A]">{otpError}</p>
                )}
                {otpLoading && <p className="vx-sub-sm mt-4 text-center">Verificando…</p>}

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
                    onClick={() => { setOtpEmail(null); setOtpError(''); setError('') }}
                    className="vx-sub-sm transition-colors hover:text-white"
                  >
                    Usar outro e-mail
                  </button>
                </div>

                <p className="vx-sub-sm mt-6 text-center leading-relaxed">
                  Não achou? O código costuma chegar em menos de um minuto — vale conferir
                  a caixa de spam antes de pedir outro.
                </p>
              </>
            ) : (
              <>
                <div className="vx-segment w-full">
                  <button
                    data-testid="tab-login"
                    type="button"
                    onClick={() => { setTab('login'); setError('') }}
                    className={`flex-1 ${isLogin ? 'vx-segment-item-active' : 'vx-segment-item'}`}
                  >
                    Entrar
                  </button>
                  <button
                    data-testid="tab-register"
                    type="button"
                    onClick={() => { setTab('register'); setError('') }}
                    className={`flex-1 ${!isLogin ? 'vx-segment-item-active' : 'vx-segment-item'}`}
                  >
                    Criar conta
                  </button>
                </div>

                <h2 className="vx-h2 mt-6">{isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}</h2>
                <p className="vx-sub mt-2.5">
                  {isLogin
                    ? 'Acesse sua conta para continuar operando.'
                    : 'Leva menos de um minuto e é totalmente gratuito.'}
                </p>

                {isLogin ? (
                  <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-4">
                    <Field label="E-mail" icon={<Mail size={16} />}>
                      <input
                        data-testid="login-email"
                        type="email" required value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="voce@email.com" className="vx-input py-[12px] pl-10"
                      />
                    </Field>

                    <Field label="Senha" icon={<Lock size={16} />}>
                      <input
                        data-testid="login-password"
                        type={showPass ? 'text' : 'password'} required value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••" className="vx-input py-[12px] pl-10 pr-10"
                      />
                      <ToggleEye show={showPass} onClick={() => setShowPass(v => !v)} />
                    </Field>

                    <div className="flex items-center justify-between">
                      <label className="flex cursor-pointer items-center gap-2.5 select-none">
                        <input type="checkbox" className="h-[15px] w-[15px] rounded border-[#2A3A4D] bg-[#0A1017] accent-[#1D5FE0]" />
                        <span className="vx-sub-sm">Manter conectado</span>
                      </label>
                      <Link href="/forgot-password" className="vx-link">Esqueci minha senha</Link>
                    </div>

                    {error && <p data-testid="auth-error" className="text-center text-[12px] text-[#F0435A]">{error}</p>}

                    <button data-testid="login-submit" type="submit" disabled={loading} className="vx-btn-green mt-2 w-full py-[14px] text-[14px] disabled:opacity-50">
                      {loading ? '...' : <>Entrar na conta <ArrowRight size={17} /></>}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRegister} className="mt-6 flex flex-col gap-4">
                    {/* País */}
                    <div className="vx-field">
                      <span className="text-[12px] font-medium text-[#AEBBCB]">País / Região de residência</span>
                      <div className="relative">
                        <button
                          data-testid="country-select"
                          type="button"
                          onClick={() => setCountryOpen(v => !v)}
                          className="vx-input flex items-center justify-between py-[12px] text-left"
                        >
                          <span className="flex items-center gap-2">
                            <Globe size={15} className="text-[#7A8AA0]" />
                            <span className={country ? 'text-[#E4EBF5]' : 'text-[#54637A]'}>{country || 'Procurar'}</span>
                          </span>
                          <ChevronDown size={15} className={`text-[#7A8AA0] transition-transform ${countryOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {countryOpen && (
                          <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-[#1B2735] bg-[#0C131F] shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
                            <div className="p-2">
                              <input
                                autoFocus value={countrySearch} onChange={e => setCountrySearch(e.target.value)}
                                placeholder="Procurar país..." className="vx-input py-[9px]"
                              />
                            </div>
                            <div className="max-h-40 overflow-y-auto">
                              {filteredCountries.map(c => (
                                <button
                                  key={c} type="button"
                                  onClick={() => { setCountry(c); setCountryOpen(false); setCountrySearch('') }}
                                  className="w-full px-4 py-2.5 text-left text-[13px] text-[#C3CFDD] transition-colors hover:bg-white/5 hover:text-white"
                                >
                                  {c}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Moeda */}
                    <div className="vx-field">
                      <span className="text-[12px] font-medium text-[#AEBBCB]">Moeda</span>
                      <div className="relative">
                        <select value={currency} onChange={e => setCurrency(e.target.value)} className="vx-select py-[12px]">
                          {CURRENCIES.map(c => <option key={c} value={c} className="bg-[#0C131F]">{c}</option>)}
                        </select>
                        <ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7A8AA0]" />
                      </div>
                    </div>

                    <Field label="E-mail" icon={<Mail size={16} />}>
                      <input
                        data-testid="register-email"
                        type="email" required value={rEmail} onChange={e => setREmail(e.target.value)}
                        placeholder="voce@email.com" className="vx-input py-[12px] pl-10"
                      />
                    </Field>

                    <Field label="Senha" icon={<Lock size={16} />}>
                      <input
                        data-testid="register-password"
                        type={showRPass ? 'text' : 'password'} required value={rPassword}
                        onChange={e => setRPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres" className="vx-input py-[12px] pl-10 pr-10"
                      />
                      <ToggleEye show={showRPass} onClick={() => setShowRPass(v => !v)} />
                    </Field>

                    <label className="flex cursor-pointer items-start gap-2.5 select-none">
                      <input
                        data-testid="terms-18"
                        type="checkbox" checked={terms18} onChange={e => setTerms18(e.target.checked)}
                        className="mt-[2px] h-[15px] w-[15px] rounded border-[#2A3A4D] bg-[#0A1017] accent-[#1D5FE0]"
                      />
                      <span className="vx-sub-sm">
                        Confirmo que tenho 18 anos ou mais e aceito o <span className="text-[#4B8CF5]">Acordo de Serviço</span>
                      </span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-2.5 select-none">
                      <input
                        type="checkbox" checked={termsNoUS} onChange={e => setTermsNoUS(e.target.checked)}
                        className="mt-[2px] h-[15px] w-[15px] rounded border-[#2A3A4D] bg-[#0A1017] accent-[#1D5FE0]"
                      />
                      <span className="vx-sub-sm">
                        Declaro que não sou cidadão ou residente dos EUA para fins fiscais
                      </span>
                    </label>

                    {error && <p data-testid="auth-error" className="text-center text-[12px] text-[#F0435A]">{error}</p>}

                    <button data-testid="register-submit" type="submit" disabled={loading} className="vx-btn-green mt-2 w-full py-[14px] text-[14px] disabled:opacity-50">
                      {loading ? '...' : <>Criar minha conta <ArrowRight size={17} /></>}
                    </button>
                  </form>
                )}

                <p className="vx-sub-sm mt-6 text-center">
                  {isLogin ? 'Ainda não tem conta?' : 'Já possui uma conta?'}{' '}
                  <button
                    type="button"
                    onClick={() => { setTab(isLogin ? 'register' : 'login'); setError('') }}
                    className="font-semibold text-[#4B8CF5] transition-colors duration-200 hover:text-[#75A8FF]"
                  >
                    {isLogin ? 'Criar conta grátis' : 'Fazer login'}
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="vx-field">
      <span className="text-[12px] font-medium text-[#AEBBCB]">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8AA0]">{icon}</span>
        {children}
      </div>
    </div>
  )
}

function ToggleEye({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7A8AA0] transition-colors duration-200 hover:text-white"
    >
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )
}
