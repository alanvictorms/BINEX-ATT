'use client'

/**
 * Campo de código de verificação — um quadrado por dígito.
 *
 * Dispara onComplete sozinho quando o último dígito entra, então não existe
 * botão de confirmar: digitou os 6, já vai. Isso corta um toque no celular,
 * que é onde esse fluxo mais acontece.
 *
 * Detalhes que costumam faltar nesse tipo de campo e estão aqui:
 *   - colar o código inteiro distribui pelos quadrados (o usuário copia do
 *     e-mail, não digita);
 *   - Backspace num quadrado vazio volta pro anterior;
 *   - setas navegam;
 *   - inputMode numeric abre o teclado numérico no celular;
 *   - autoComplete one-time-code deixa o iOS/Android oferecer o código do SMS
 *     ou do e-mail direto no teclado.
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface OtpInputProps {
  length?: number
  disabled?: boolean
  error?: boolean
  /** Chamado quando todos os dígitos estão preenchidos. */
  onComplete: (code: string) => void
  /** Chamado a cada mudança — útil pra limpar mensagem de erro. */
  onChange?: (code: string) => void
}

export function OtpInput({ length = 6, disabled, error, onComplete, onChange }: OtpInputProps) {
  const [vals, setVals] = useState<string[]>(() => Array(length).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => { refs.current[0]?.focus() }, [])

  function push(next: string[]) {
    setVals(next)
    const code = next.join('')
    onChange?.(code)
    if (code.length === length && !next.includes('')) onComplete(code)
  }

  function handleChange(i: number, raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return

    const next = [...vals]
    // Colagem: espalha a partir da posição atual em vez de encher só um quadrado.
    for (let k = 0; k < digits.length && i + k < length; k++) next[i + k] = digits[k]
    push(next)

    const proximo = Math.min(i + digits.length, length - 1)
    refs.current[proximo]?.focus()
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const next = [...vals]
      if (next[i]) { next[i] = '' ; push(next); return }
      if (i > 0) { next[i - 1] = ''; push(next); refs.current[i - 1]?.focus() }
      return
    }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus() }
    if (e.key === 'ArrowRight' && i < length - 1) { e.preventDefault(); refs.current[i + 1]?.focus() }
  }

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-2.5" role="group" aria-label="Código de verificação">
      {vals.map((v, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          value={v}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onFocus={e => e.target.select()}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          aria-label={`Dígito ${i + 1}`}
          className={cn(
            'h-[52px] w-[44px] rounded-xl border bg-[#0C1320] text-center text-[22px] font-bold text-white outline-none transition-colors sm:h-[56px] sm:w-[48px]',
            'focus:border-[#2E6BE6] focus:ring-2 focus:ring-[#2E6BE6]/25',
            error ? 'border-[#F0435A]' : v ? 'border-[#2E6BE6]/60' : 'border-[#1B2735]',
            disabled && 'opacity-50',
          )}
        />
      ))}
    </div>
  )
}
