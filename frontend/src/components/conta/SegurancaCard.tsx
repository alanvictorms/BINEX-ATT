'use client'

/**
 * Card de segurança da conta do usuário — troca de senha e sessões.
 *
 * 2FA fica de fora de propósito: é exigido só no painel admin, onde o
 * enrollment vive em /admin/seguranca/2fa e o step-up de aal2 acontece no
 * login (ver src/middleware.ts e components/auth/MfaChallenge).
 *
 * Sessões: o supabase-js não expõe listagem de sessões por usuário, então o que
 * dá pra oferecer com honestidade é encerrar as *outras* sessões
 * (signOut scope 'others'), mantendo a atual.
 */

import { useState, useEffect } from 'react'
import { ShieldCheck, KeyRound, MonitorSmartphone, Loader2, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { secureAuth } from '@/lib/secureClient'

type Panel = null | 'senha' | 'sessoes'
type Msg = { ok: boolean; text: string } | null

function Row({ icon, title, desc, children }: {
  icon: React.ReactNode; title: string; desc: string; children: React.ReactNode
}) {
  return (
    <div className="vx-card px-4 py-[13px]">
      <div className="flex items-center gap-3">
        <span className="text-[#6C9CF8]">{icon}</span>
        <span className="min-w-0 flex-1 leading-none">
          <span className="block text-[13px] font-semibold text-[#EAF1FA]">{title}</span>
          <span className="vx-sub-sm mt-2 block">{desc}</span>
        </span>
        {children}
      </div>
    </div>
  )
}

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null
  return (
    <div className={cn(
      'mt-3 flex items-start gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-medium',
      msg.ok ? 'border-[#1FD196]/30 bg-[#1FD196]/10 text-[#1FD196]'
             : 'border-red-500/30 bg-red-500/10 text-red-400',
    )}>
      {msg.ok ? <Check size={13} className="mt-0.5 shrink-0" /> : <AlertCircle size={13} className="mt-0.5 shrink-0" />}
      <span>{msg.text}</span>
    </div>
  )
}

export function SegurancaCard() {
  const [panel, setPanel] = useState<Panel>(null)

  // ── Senha ──────────────────────────────────────────────────────────────────
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busyPw, setBusyPw] = useState(false)
  const [msgPw, setMsgPw] = useState<Msg>(null)

  async function changePassword() {
    setMsgPw(null)
    if (pw1.length < 8) { setMsgPw({ ok: false, text: 'A senha precisa ter pelo menos 8 caracteres.' }); return }
    if (pw1 !== pw2)    { setMsgPw({ ok: false, text: 'As senhas não conferem.' }); return }
    setBusyPw(true)
    try {
      const { error } = await secureAuth.updatePassword(pw1)
      if (error) throw error
      setMsgPw({ ok: true, text: 'Senha alterada com sucesso.' })
      setPw1(''); setPw2('')
    } catch (e: any) {
      setMsgPw({ ok: false, text: e?.message ?? 'Não foi possível alterar a senha.' })
    } finally { setBusyPw(false) }
  }

  // ── Sessões ────────────────────────────────────────────────────────────────
  const [busySess, setBusySess] = useState(false)
  const [msgSess, setMsgSess] = useState<Msg>(null)
  const [sessSince, setSessSince] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const at = data.session?.user?.last_sign_in_at
      if (at) setSessSince(new Date(at).toLocaleString('pt-BR'))
    })
  }, [])

  async function endOtherSessions() {
    setBusySess(true); setMsgSess(null)
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' })
      if (error) throw error
      setMsgSess({ ok: true, text: 'Todas as outras sessões foram encerradas.' })
    } catch (e: any) {
      setMsgSess({ ok: false, text: e?.message ?? 'Não foi possível encerrar as sessões.' })
    } finally { setBusySess(false) }
  }

  return (
    <div className="vx-panel p-5">
      <div className="flex items-start gap-3">
        <span className="vx-ibox-blue"><ShieldCheck size={18} /></span>
        <div>
          <h3 className="vx-h3 text-[15px]">Segurança da conta</h3>
          <p className="vx-sub mt-2">Proteja sua conta e gerencie o acesso.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {/* ── Senha ── */}
        <div>
          <Row icon={<KeyRound size={18} />} title="Alterar senha" desc="Defina uma nova senha de acesso.">
            <button type="button" data-testid="change-password-btn"
              onClick={() => { setPanel(panel === 'senha' ? null : 'senha'); setMsgPw(null) }}
              className="vx-btn-ghost shrink-0 px-3 py-[7px] text-[12px]">
              {panel === 'senha' ? 'Fechar' : 'Alterar'}
            </button>
          </Row>

          {panel === 'senha' && (
            <div className="vx-card mt-2 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="vx-field">
                  <span className="text-[12px] font-medium text-[#AEBBCB]">Nova senha</span>
                  <input type="password" className="vx-input" value={pw1} autoComplete="new-password"
                    onChange={e => { setPw1(e.target.value); setMsgPw(null) }} placeholder="Mínimo 8 caracteres" />
                </div>
                <div className="vx-field">
                  <span className="text-[12px] font-medium text-[#AEBBCB]">Confirmar senha</span>
                  <input type="password" className="vx-input" value={pw2} autoComplete="new-password"
                    onChange={e => { setPw2(e.target.value); setMsgPw(null) }} placeholder="Repita a nova senha" />
                </div>
              </div>
              <button type="button" onClick={changePassword} disabled={busyPw || !pw1 || !pw2}
                className="vx-btn-blue mt-3 px-4 py-[9px] text-[12px] disabled:opacity-50">
                {busyPw && <Loader2 size={12} className="animate-spin" />} Salvar nova senha
              </button>
              <Feedback msg={msgPw} />
            </div>
          )}
        </div>

        {/* ── Sessões ── */}
        <div>
          <Row
            icon={<MonitorSmartphone size={18} />}
            title="Sessões ativas"
            desc={sessSince ? `Esta sessão iniciou em ${sessSince}.` : 'Gerencie dispositivos conectados à sua conta.'}
          >
            <button type="button" data-testid="manage-sessions-btn"
              onClick={() => { setPanel(panel === 'sessoes' ? null : 'sessoes'); setMsgSess(null) }}
              className="vx-btn-ghost shrink-0 px-3 py-[7px] text-[12px]">
              {panel === 'sessoes' ? 'Fechar' : 'Gerenciar'}
            </button>
          </Row>

          {panel === 'sessoes' && (
            <div className="vx-card mt-2 p-4">
              <p className="vx-sub">
                Encerra a sessão em todos os outros dispositivos e mantém apenas este.
                Use isso se suspeitar de acesso indevido.
              </p>
              <button type="button" onClick={endOtherSessions} disabled={busySess}
                className="vx-btn-blue mt-3 px-4 py-[9px] text-[12px] disabled:opacity-50">
                {busySess && <Loader2 size={12} className="animate-spin" />} Encerrar outras sessões
              </button>
              <Feedback msg={msgSess} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
