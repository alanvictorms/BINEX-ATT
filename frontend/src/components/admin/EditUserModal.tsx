'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Loader2, Save, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UserData {
  id:                   string
  name:                 string
  email:                string
  cpf:                  string | null
  phone:                string | null
  kyc_status:           string
  bonus_balance:        number
  rollover_required:    number
  rollover_completed:   number
  custom_payout_forex:  number | null
  custom_payout_otc:    number | null
  custom_payout_crypto: number | null
}

interface Props {
  userId: string
  onClose: () => void
  onSaved: () => void
}

export function EditUserModal({ userId, onClose, onSaved }: Props) {
  const [user,    setUser]    = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [cpf,       setCpf]       = useState('')
  const [phone,     setPhone]     = useState('')
  const [bonus,     setBonus]     = useState('')
  const [rollReq,   setRollReq]   = useState('')
  const [rollDone,  setRollDone]  = useState('')
  const [forexOn,   setForexOn]   = useState(false)
  const [forexPct,  setForexPct]  = useState('85')
  const [otcOn,     setOtcOn]     = useState(false)
  const [otcPct,    setOtcPct]    = useState('85')
  const [cryptoOn,  setCryptoOn]  = useState(false)
  const [cryptoPct, setCryptoPct] = useState('85')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase.rpc('admin_get_user_details', { p_user_id: userId }).then(({ data, error }) => {
      if (cancelled) return
      if (error) { setError(error.message); setLoading(false); return }
      const u = (data as any).user as UserData
      setUser(u)
      const parts = (u.name || '').trim().split(/\s+/)
      setFirstName(parts.shift() ?? '')
      setLastName(parts.join(' '))
      setCpf(u.cpf ?? '')
      setPhone(u.phone ?? '')
      setBonus(String(u.bonus_balance ?? 0))
      setRollReq(String(u.rollover_required ?? 0))
      setRollDone(String(u.rollover_completed ?? 0))
      setForexOn(u.custom_payout_forex   !== null); if (u.custom_payout_forex   !== null) setForexPct(String(u.custom_payout_forex))
      setOtcOn(u.custom_payout_otc       !== null); if (u.custom_payout_otc     !== null) setOtcPct(String(u.custom_payout_otc))
      setCryptoOn(u.custom_payout_crypto !== null); if (u.custom_payout_crypto  !== null) setCryptoPct(String(u.custom_payout_crypto))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
      const { error } = await supabase.rpc('admin_update_user', {
        p_user_id:              userId,
        p_name:                 fullName || null,
        p_cpf:                  cpf.trim() || null,
        p_phone:                phone.trim() || null,
        p_bonus_balance:        Number(bonus)    || 0,
        p_rollover_required:    Number(rollReq)  || 0,
        p_rollover_completed:   Number(rollDone) || 0,
        p_custom_payout_forex:  forexOn  ? Number(forexPct)  : null,
        p_custom_payout_otc:    otcOn    ? Number(otcPct)    : null,
        p_custom_payout_crypto: cryptoOn ? Number(cryptoPct) : null,
        p_clear_payout_forex:   !forexOn,
        p_clear_payout_otc:     !otcOn,
        p_clear_payout_crypto:  !cryptoOn,
      })
      if (error) throw error
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-end" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#0C131F] border-l border-[#16202D] shadow-2xl h-full overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0C131F] border-b border-[#16202D] px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-white">Editar Usuário</h2>
          <button onClick={onClose} className="text-[#7E8DA2] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#7E8DA2]">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : user ? (
          <div className="p-5 space-y-5">
            {/* Nome + Sobrenome */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome">
                <Input value={firstName} onChange={setFirstName} />
              </Field>
              <Field label="Sobrenome">
                <Input value={lastName} onChange={setLastName} />
              </Field>
            </div>

            {/* Email (read-only) */}
            <Field label="Email">
              <Input value={user.email} onChange={() => {}} disabled />
            </Field>

            {/* CPF + Telefone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="CPF">
                <Input value={cpf} onChange={setCpf} placeholder="000.000.000-00" />
              </Field>
              <Field label="Telefone">
                <Input value={phone} onChange={setPhone} placeholder="(00) 00000-0000" />
              </Field>
            </div>

            {/* Saldo + Bônus */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Saldo (R$)" hint="Use 'Ajustar saldo' na lista para creditar/debitar com motivo">
                <Input value={String(user ? '—' : '')} onChange={() => {}} disabled />
              </Field>
              <Field label="Bônus (R$)">
                <Input value={bonus} onChange={setBonus} type="number" />
              </Field>
            </div>

            {/* Rollover */}
            <div>
              <div className="text-[11px] font-bold text-white mb-2">Rollover do Bônus</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Requerido (R$)">
                  <Input value={rollReq} onChange={setRollReq} type="number" />
                </Field>
                <Field label="Completado (R$)">
                  <Input value={rollDone} onChange={setRollDone} type="number" />
                </Field>
              </div>
            </div>

            {/* Payout Personalizado */}
            <div className="pt-4 border-t border-[#16202D]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-bold text-white">% Payout Personalizado</span>
              </div>
              <p className="text-[10px] text-[#7E8DA2] mb-3">
                Defina um payout fixo para este usuário em cada mercado. Quando ativo, sobrescreve o payout padrão do ativo.
              </p>
              <div className="space-y-2">
                <PayoutRow label="Forex"  on={forexOn}  setOn={setForexOn}  value={forexPct}  setValue={setForexPct} />
                <PayoutRow label="OTC"    on={otcOn}    setOn={setOtcOn}    value={otcPct}    setValue={setOtcPct} />
                <PayoutRow label="Cripto" on={cryptoOn} setOn={setCryptoOn} value={cryptoPct} setValue={setCryptoPct} />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Footer */}
            <div className="sticky bottom-0 bg-[#0C131F] pt-4 -mx-5 px-5 border-t border-[#16202D] flex gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 h-10 rounded-lg border border-[#16202D] text-[#AEBBCB] hover:text-white hover:border-white/30 transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#AEBBCB] mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[#6b7280] mt-1">{hint}</p>}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder, disabled }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        'w-full h-10 bg-[#1a1f2e] border border-[#16202D] rounded-lg px-3 text-sm text-white outline-none focus:border-blue-500/50 transition-colors',
        disabled && 'opacity-60 cursor-not-allowed'
      )}
    />
  )
}

function PayoutRow({ label, on, setOn, value, setValue }: { label: string; on: boolean; setOn: (v: boolean) => void; value: string; setValue: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3 bg-[#1a1f2e] border border-[#16202D] rounded-lg px-3 py-2">
      <button
        onClick={() => setOn(!on)}
        className={cn(
          'w-9 h-5 rounded-full transition-colors flex items-center px-0.5',
          on ? 'bg-green-500 justify-end' : 'bg-[#16202D] justify-start'
        )}
      >
        <span className="w-4 h-4 rounded-full bg-white" />
      </button>
      <span className={cn('text-sm font-medium flex-1', on ? 'text-white' : 'text-[#6b7280]')}>{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!on}
          className={cn(
            'w-14 h-7 bg-[#060A11] border border-[#16202D] rounded px-2 text-sm text-white text-right outline-none focus:border-blue-500/50',
            !on && 'opacity-40'
          )}
        />
        <span className={cn('text-sm', on ? 'text-[#AEBBCB]' : 'text-[#1B2735]')}>%</span>
      </div>
    </div>
  )
}
