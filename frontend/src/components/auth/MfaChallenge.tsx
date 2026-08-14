'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, Loader2 } from 'lucide-react'

interface Props {
  onSuccess: () => void
  onCancel:  () => void
}

export function MfaChallenge({ onSuccess, onCancel }: Props) {
  const [factorId,    setFactorId]    = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code,        setCode]        = useState('')
  const [busy,        setBusy]        = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    async function init() {
      setBusy(true)
      try {
        const { data: list } = await supabase.auth.mfa.listFactors()
        const verified = list?.totp?.find((f: any) => f.status === 'verified')
        if (!verified) { onSuccess(); return } // Sem MFA → segue
        setFactorId(verified.id)
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: verified.id })
        if (chErr) throw chErr
        setChallengeId(ch.id)
      } catch (e: any) {
        setError('Não foi possível iniciar a verificação.')
      } finally {
        setBusy(false)
      }
    }
    init()
  }, [])

  async function verify() {
    if (!factorId || !challengeId || code.length !== 6) return
    setBusy(true); setError('')
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      })
      if (error) throw error
      onSuccess()
    } catch (e: any) {
      setError('Código inválido. Tente novamente.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="text-blue-400" size={20} />
        </div>
        <div>
          <h2 className="text-white font-bold">Verificação em 2 etapas</h2>
          <p className="text-[#7E8DA2] text-xs">Digite o código de 6 dígitos do seu app autenticador</p>
        </div>
      </div>

      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="000000"
        className="w-full bg-[#060A11] border border-[#16202D] rounded-lg px-3 py-3 text-white text-2xl font-mono tracking-[0.5em] text-center outline-none focus:border-blue-500 transition-colors"
      />

      {error && <p className="text-red-400 text-xs text-center">{error}</p>}

      <button
        onClick={verify}
        disabled={busy || code.length !== 6}
        className="w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors font-bold text-white flex items-center justify-center text-sm disabled:opacity-50"
      >
        {busy ? <Loader2 className="animate-spin" size={16} /> : 'Verificar'}
      </button>

      <button
        onClick={onCancel}
        className="text-xs text-[#7E8DA2] hover:text-white transition-colors"
      >
        Cancelar e voltar
      </button>
    </div>
  )
}
