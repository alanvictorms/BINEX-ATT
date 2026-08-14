'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Copy, Check, Loader2, CheckCircle2, AlertCircle, QrCode, Gift } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import QRCode from 'qrcode'

interface PixCheckoutProps {
  onSuccess: () => void
  /** Seletor de método — montado pelo modal, aparece só na escolha de valor. */
  methodSelector?: React.ReactNode
  /** % do bônus do próximo depósito (0 = sem degrau disponível). */
  bonusPct?: number
  /** Valor mínimo de depósito que ativa o bônus. */
  bonusMinDeposit?: number
}

const AMOUNT_PRESETS = [50, 100, 250, 500, 1000, 2500]

// Fallbacks: valem só até o get_public_config responder. Os números de verdade
// saem do admin (depositMin / depositMax).
const FALLBACK_MIN = 50
const FALLBACK_MAX = 5000

type Step = 'amount' | 'qrcode' | 'success'

/* ── CPF ───────────────────────────────────────────────────────────────── */

const onlyDigits = (s: string) => s.replace(/\D/g, '')

function fmtCpf(s: string) {
  const d = onlyDigits(s).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// Dígitos verificadores de verdade — campo de CPF que aceita 111.111.111-11
// não inspira confiança nenhuma numa tela de depósito.
function cpfValido(raw: string) {
  const d = onlyDigits(raw)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

/* ──────────────────────────────────────────────────────────────────────── */

export function PixCheckout({
  onSuccess,
  methodSelector,
  bonusPct = 0,
  bonusMinDeposit = 0,
}: PixCheckoutProps) {
  const user = useAuthStore(s => s.user)
  // Depósito de dinheiro real vai SEMPRE pra conta REAL — nunca a conta atual,
  // que pode estar em DEMO (bug: R$ creditava na DEMO).
  const realAccount = user?.accounts?.find(a => a.type === 'REAL') ?? null

  const [step, setStep]             = useState<Step>('amount')
  const [amount, setAmount]         = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [qrcode, setQrcode]         = useState<string | null>(null)
  const [qrImg, setQrImg]           = useState<string | null>(null)
  const [externalId, setExternalId] = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)

  // Limites vindos do admin. O backend valida de novo — isto aqui é só pra UI
  // não prometer o que a rota vai recusar.
  const [limits, setLimits] = useState({ min: FALLBACK_MIN, max: FALLBACK_MAX })

  // CPF do pagador: vem do perfil quando já existe; senão o usuário preenche
  // aqui e a gente grava. 78% das contas ainda estão sem.
  const [cpf, setCpf]               = useState('')
  const [cpfFromProfile, setCpfFromProfile] = useState(false)

  useEffect(() => {
    supabase.rpc('get_public_config').then(({ data }) => {
      if (!data) return
      const cfg = data as Record<string, unknown>
      const min = Number(cfg.depositMin)
      const max = Number(cfg.depositMax)
      setLimits({
        min: Number.isFinite(min) && min > 0 ? min : FALLBACK_MIN,
        max: Number.isFinite(max) && max > 0 ? max : FALLBACK_MAX,
      })
    })
  }, [])

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('cpf')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.cpf && onlyDigits(data.cpf).length === 11) {
          setCpf(fmtCpf(data.cpf))
          setCpfFromProfile(true)
        }
      })
  }, [user?.id])

  // Gera imagem QR quando qrcode (string EMV) chega
  useEffect(() => {
    if (!qrcode) return
    QRCode.toDataURL(qrcode, { width: 220, margin: 1, color: { dark: '#000', light: '#fff' } })
      .then(setQrImg)
      .catch(() => setQrImg(null))
  }, [qrcode])

  // Poll: verifica se depósito foi confirmado a cada 4s
  useEffect(() => {
    if (step !== 'qrcode' || !externalId) return
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from('deposits')
        .select('status')
        .eq('external_id', externalId)
        .single()
      if (data?.status === 'confirmed') {
        clearInterval(iv)
        setStep('success')
        setTimeout(onSuccess, 3000)
      }
    }, 4000)
    return () => clearInterval(iv)
  }, [step, externalId, onSuccess])

  const handleCreate = useCallback(async () => {
    const val = parseFloat(amount.replace(',', '.'))
    if (isNaN(val) || val < limits.min) { setError(`Valor mínimo: R$ ${limits.min},00`); return }
    if (limits.max > 0 && val > limits.max) { setError(`Valor máximo: R$ ${limits.max},00`); return }
    if (!cpfValido(cpf)) { setError('Informe um CPF válido — ele identifica o pagador do PIX.'); return }
    if (!user || !realAccount) { setError('Conta REAL não encontrada'); return }

    setLoading(true)
    setError(null)
    try {
      // Guarda o CPF no perfil antes de gerar a cobrança, via RPC — `profiles`
      // não tem policy de UPDATE (só SELECT), então escrita direta seria negada
      // em silêncio. Falha aqui não impede o depósito: o campo é de
      // identificação, não de autorização.
      if (!cpfFromProfile) {
        const { data: saved, error: rpcErr } = await supabase.rpc('set_own_cpf', { p_cpf: onlyDigits(cpf) })
        if (!rpcErr && saved) setCpfFromProfile(true)
      }

      // Só o valor vai no corpo. Quem deposita e em qual conta vem da sessão, no
      // servidor — mandar userId/accountId daqui seria decorativo (a rota ignora)
      // e sugeriria que o cliente escolhe a conta de destino, que não é o caso.
      const res = await fetch('/api/payments/pix/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ amount: val }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao criar PIX')
      setQrcode(json.qrcode)
      setExternalId(json.externalId)
      setStep('qrcode')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [amount, user, realAccount, limits, cpf, cpfFromProfile])

  const copyCode = () => {
    if (!qrcode) return
    navigator.clipboard.writeText(qrcode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  /* ── Sucesso ── */
  if (step === 'success') {
    const val = parseFloat(amount.replace(',', '.'))
    return (
      <div className="flex flex-col items-center justify-center py-10 sm:py-16 gap-4">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-green-400" />
        </div>
        <p className="text-xl font-bold text-white">Depósito confirmado!</p>
        <p className="text-sm text-[#7E8DA2]">R$ {fmtBRL(val)} adicionado à sua conta REAL</p>
      </div>
    )
  }

  /* ── QR Code ── */
  if (step === 'qrcode') {
    const val = parseFloat(amount.replace(',', '.'))
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-[#16202D]">
          <button onClick={() => setStep('amount')} className="text-[#7E8DA2] hover:text-white">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-white">PIX — R$ {fmtBRL(val)}</span>
        </div>

        <div className="flex flex-col items-center gap-4 sm:gap-6 p-4 sm:p-8">
          {/* QR Image */}
          <div className="bg-white rounded-2xl p-3 shadow-xl">
            {qrImg ? (
              <img src={qrImg} alt="QR Code PIX" width={220} height={220} />
            ) : (
              <div className="w-[220px] h-[220px] flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-[#7E8DA2]" />
              </div>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 text-sm text-[#7E8DA2]">
            <Loader2 size={14} className="animate-spin" />
            <span>Aguardando pagamento…</span>
          </div>

          {/* Copy button */}
          {qrcode && (
            <button
              onClick={copyCode}
              className={cn(
                'flex items-center gap-2 w-full max-w-xs py-3 rounded-xl font-semibold text-sm transition-colors',
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-[#1e2235] border border-[#16202D] text-white hover:border-blue-500/40'
              )}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span className="flex-1 text-center">
                {copied ? 'Código copiado!' : 'Copiar código PIX'}
              </span>
            </button>
          )}

          <p className="text-[11px] text-[#7E8DA2] text-center max-w-xs leading-relaxed">
            Abra o app do seu banco, escolha PIX → Pagar com QR Code ou Cole o código acima.
            O saldo é creditado automaticamente após confirmação.
          </p>
        </div>
      </div>
    )
  }

  /* ── Seleção de valor ── */
  const val         = parseFloat(amount.replace(',', '.'))
  const temValor    = Number.isFinite(val) && val > 0
  const cpfOk       = cpfValido(cpf)
  // Só cutuca sobre o bônus quando ele está ao alcance e o valor digitado não chega lá.
  const perdendoBonus = bonusPct > 0 && bonusMinDeposit > 0 && temValor && val < bonusMinDeposit

  return (
    <div className="flex flex-col">
      <div className="p-4 sm:p-6 flex flex-col gap-5">

        {methodSelector}

        {/* Valor */}
        <div>
          <div className="flex items-end justify-between mb-2 gap-2">
            <label className="text-[10px] font-bold text-[#7E8DA2] tracking-widest">
              VALOR DO DEPÓSITO
            </label>
            <span className="text-[10px] text-[#6b7080] text-right leading-tight">
              Mín R$ {fmtBRL(limits.min)} · Máx R$ {fmtBRL(limits.max)}
            </span>
          </div>
          <div className="relative border border-[#16202D] rounded-xl px-4 py-3.5 bg-[#0E1620] focus-within:border-green-500/50 transition-colors flex items-center gap-2">
            <span className="text-lg font-bold text-green-400">R$</span>
            <input
              type="number"
              min={limits.min}
              max={limits.max}
              step={1}
              placeholder="0,00"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="flex-1 bg-transparent text-lg font-bold text-white outline-none placeholder-[#1B2735]"
              autoFocus
            />
          </div>
        </div>

        {/* Presets — só os que cabem nos limites configurados */}
        <div className="grid grid-cols-3 gap-2">
          {AMOUNT_PRESETS.filter(v => v >= limits.min && (limits.max <= 0 || v <= limits.max)).map(v => (
            <button
              key={v}
              onClick={() => { setAmount(String(v)); setError(null) }}
              className={cn(
                'py-2.5 rounded-xl text-sm font-semibold transition-colors border',
                amount === String(v)
                  ? 'bg-green-600 border-green-500 text-white'
                  : 'bg-[#0E1620] border-[#16202D] text-[#c9ccd4] hover:text-white hover:border-[#1B2735]'
              )}
            >
              R$ {v.toLocaleString('pt-BR')}
            </button>
          ))}
        </div>

        {/* CPF do pagador */}
        <div>
          <div className="flex items-end justify-between mb-2 gap-2">
            <label className="text-[10px] font-bold text-[#7E8DA2] tracking-widest">
              CPF DO PAGADOR
            </label>
            {cpfFromProfile && cpfOk && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-green-400">
                <Check size={11} /> cadastrado
              </span>
            )}
          </div>
          <div className={cn(
            'border rounded-xl px-4 py-3 bg-[#0E1620] transition-colors',
            cpf && !cpfOk ? 'border-red-500/40' : 'border-[#16202D] focus-within:border-green-500/50'
          )}>
            <input
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={e => { setCpf(fmtCpf(e.target.value)); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full bg-transparent font-mono text-sm text-white outline-none placeholder-[#1B2735] tracking-wide"
            />
          </div>
          {!cpfFromProfile && (
            <p className="text-[10px] text-[#6b7080] mt-1.5">
              O PIX precisa sair de uma conta no seu nome — depósito de terceiros não é aceito.
            </p>
          )}
        </div>

        {/* Bônus ao alcance mas fora do valor digitado */}
        {perdendoBonus && (
          <div className="flex items-start gap-2.5 bg-green-500/[0.07] border border-green-500/25 rounded-xl px-3.5 py-2.5">
            <Gift size={15} className="text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#c9ccd4] leading-snug">
              Deposite <span className="font-bold text-white">R$ {fmtBRL(bonusMinDeposit)}</span> ou mais
              e receba <span className="font-bold text-green-400">{bonusPct}% de bônus</span> neste depósito.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={loading || !temValor || !cpfOk}
          className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:bg-[#1e2235] disabled:text-[#5a5f70] disabled:cursor-not-allowed font-bold text-white text-sm transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
          {loading ? 'Gerando QR Code…' : 'Gerar QR Code PIX'}
        </button>

        <p className="text-[10px] text-[#5a5f70] text-center -mt-1">
          Crédito automático na conta REAL após a confirmação do PIX.
        </p>
      </div>
    </div>
  )
}
