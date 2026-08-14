'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, ShieldCheck, Loader2, AlertCircle } from 'lucide-react'

interface Props {
  title?:    string
  message?:  string
  onSuccess: () => void
  onClose:   () => void
}

/**
 * Modal de step-up authentication.
 * Pede o código TOTP atual do app autenticador e revalida a sessão MFA.
 * Após sucesso, o backend require_recent_mfa() vai liberar a ação por até 5 min.
 */
export function Confirm2FAModal({ title = 'Confirmação de segurança', message, onSuccess, onClose }: Props) {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code,     setCode]     = useState('')
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const f = data?.totp?.find((x: any) => x.status === 'verified')
      if (!f) {
        setError('Você precisa ter 2FA cadastrado para essa ação.')
        return
      }
      setFactorId(f.id)
    })
  }, [])

  async function handleVerify() {
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
      // Refresca a sessão pra garantir que o JWT novo (com amr/totp atualizado) seja usado
      await supabase.auth.refreshSession()
      onSuccess()
    } catch (e: any) {
      setError('Código inválido. Tente novamente.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && code.length === 6 && !busy) handleVerify()
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#0C131F] border border-[#16202D] rounded-xl shadow-2xl">
        <div className="px-5 py-4 border-b border-[#16202D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-blue-400" />
            <h2 className="text-sm font-bold text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="text-[#7E8DA2] hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {message && (
            <p className="text-xs text-[#AEBBCB] leading-relaxed">
              {message}
            </p>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[#AEBBCB] mb-2">
              Digite o código de 6 dígitos do seu app autenticador:
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={onKeyDown}
              placeholder="000000"
              className="w-full bg-[#060A11] border border-[#16202D] rounded-lg px-3 py-3 text-white text-2xl font-mono tracking-[0.4em] text-center outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="flex-1 h-10 rounded-lg border border-[#16202D] text-[#AEBBCB] hover:text-white hover:border-white/30 transition-colors text-sm font-medium disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleVerify}
              disabled={busy || code.length !== 6 || !factorId}
              className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
