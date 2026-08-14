'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, ShieldAlert, Copy, Loader2, Check, X } from 'lucide-react'

type Status = 'loading' | 'no_factor' | 'unverified' | 'active' | 'enrolling'

export default function Admin2FAPage() {
  const [status,    setStatus]    = useState<Status>('loading')
  const [factorId,  setFactorId]  = useState<string | null>(null)
  const [qrCode,    setQrCode]    = useState<string | null>(null)
  const [secret,    setSecret]    = useState<string | null>(null)
  const [code,      setCode]      = useState('')
  const [error,     setError]     = useState('')
  const [busy,      setBusy]      = useState(false)
  const [copied,    setCopied]    = useState(false)

  async function loadFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) { setStatus('no_factor'); return }
    const totp = data.totp?.[0]
    if (!totp) { setStatus('no_factor'); return }
    setFactorId(totp.id)
    setStatus(totp.status === 'verified' ? 'active' : 'unverified')
  }

  useEffect(() => { loadFactors() }, [])

  async function startEnroll() {
    setBusy(true); setError('')
    try {
      // Limpa qualquer fator não-verificado anterior
      const { data: list } = await supabase.auth.mfa.listFactors()
      for (const f of list?.totp ?? []) {
        if (f.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Admin TOTP',
      })
      if (error) throw error
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStatus('enrolling')
    } catch (e: any) {
      setError(e.message ?? 'Erro ao iniciar cadastro')
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    if (!factorId || code.length !== 6) return
    setBusy(true); setError('')
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code,
      })
      if (vErr) throw vErr
      setStatus('active')
      setQrCode(null); setSecret(null); setCode('')
    } catch (e: any) {
      setError('Código inválido. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    if (!factorId) return
    if (!confirm('Tem certeza que quer desativar a autenticação de 2 fatores?\n\nIsso reduz a segurança da sua conta admin.')) return
    setBusy(true); setError('')
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      setStatus('no_factor')
      setFactorId(null)
    } catch (e: any) {
      setError(e.message ?? 'Erro ao desativar')
    } finally {
      setBusy(false)
    }
  }

  function copySecret() {
    if (!secret) return
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck className="text-green-400" size={28} />
        <h1 className="text-2xl font-bold text-white">Autenticação de 2 Fatores</h1>
      </div>
      <p className="text-[#7E8DA2] text-sm mb-8">
        Adiciona uma camada extra de proteção ao seu acesso admin. Mesmo que sua senha vaze, o atacante não consegue entrar sem o código do seu celular.
      </p>

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-[#7E8DA2]">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </div>
      )}

      {status === 'active' && (
        <div className="bg-green-500/5 border border-green-500/30 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="text-green-400" size={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white mb-1">2FA ativo</h2>
              <p className="text-[#7E8DA2] text-sm mb-4">
                Sua conta admin está protegida. A cada login você precisa digitar o código do seu aplicativo autenticador.
              </p>
              <button
                onClick={disable}
                disabled={busy}
                className="px-4 py-2 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors text-sm font-semibold disabled:opacity-50"
              >
                {busy ? 'Desativando...' : 'Desativar 2FA'}
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
        </div>
      )}

      {status === 'no_factor' && (
        <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-yellow-500/15 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="text-yellow-400" size={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white mb-1">2FA não está ativo</h2>
              <p className="text-[#7E8DA2] text-sm mb-4">
                Sua conta admin está protegida apenas pela senha. Recomendamos fortemente ativar a autenticação de 2 fatores.
              </p>
              <button
                onClick={startEnroll}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? 'Iniciando...' : 'Ativar 2FA agora'}
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
        </div>
      )}

      {(status === 'enrolling' || status === 'unverified') && (
        <div className="bg-[#0C131F] border border-[#16202D] rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-1">Configurar autenticador</h2>
          <p className="text-[#7E8DA2] text-sm mb-6">
            Escaneie o QR Code com seu aplicativo autenticador.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* QR Code */}
            <div>
              <div className="bg-white rounded-lg p-4 inline-block">
                {qrCode ? (
                  <div dangerouslySetInnerHTML={{ __html: qrCode }} />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-gray-400">
                    <Loader2 className="animate-spin" />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-[#7E8DA2] mt-3">
                Apps recomendados: <span className="text-white">Google Authenticator</span>, <span className="text-white">Authy</span>, <span className="text-white">Microsoft Authenticator</span>
              </p>
            </div>

            {/* Secret + code input */}
            <div className="flex flex-col gap-4">
              {secret && (
                <div>
                  <label className="text-xs text-[#7E8DA2] block mb-1">Não consegue escanear? Digite o código manualmente:</label>
                  <div className="flex items-center gap-2 bg-[#060A11] border border-[#16202D] rounded-lg px-3 py-2">
                    <code className="text-xs text-white font-mono flex-1 break-all">{secret}</code>
                    <button onClick={copySecret} className="text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0">
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-yellow-500/80 mt-1.5">
                    ⚠ Salve esse código em local seguro. Serve como backup caso perca o celular.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs text-[#7E8DA2] block mb-1">Digite o código de 6 dígitos do app:</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full bg-[#060A11] border border-[#16202D] rounded-lg px-3 py-3 text-white text-lg font-mono tracking-widest text-center outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                onClick={verify}
                disabled={busy || code.length !== 6}
                className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? 'Verificando...' : 'Verificar e ativar'}
              </button>

              {status === 'unverified' && (
                <button
                  onClick={async () => {
                    if (factorId) await supabase.auth.mfa.unenroll({ factorId })
                    setFactorId(null); setStatus('no_factor'); setQrCode(null); setSecret(null); setCode('')
                  }}
                  className="text-xs text-[#7E8DA2] hover:text-white transition-colors"
                >
                  Cancelar e começar de novo
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
