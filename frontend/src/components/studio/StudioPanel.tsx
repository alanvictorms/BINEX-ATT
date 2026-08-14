'use client'

// ============================================================================
// STUDIO PANEL — Painel flutuante de controle do Modo Studio
// ============================================================================
// So renderiza para STUDIO_OWNER_EMAIL. Outros usuarios nunca veem nem o atalho
// nem o painel. Toggles persistem em localStorage via useStudioMode.
// ============================================================================

import { useEffect, useState } from 'react'
import { X, Sparkles, Plus, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { isStudioOwner, useStudioMode } from '@/lib/studioMode'

export function StudioPanel() {
  const email = useAuthStore(s => s.user?.email)
  const isOwner = isStudioOwner(email)
  const studio = useStudioMode()

  // Atalho global Ctrl+Shift+S — so funciona pro owner
  useEffect(() => {
    if (!isOwner) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault()
        studio.set('panelOpen', !studio.panelOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOwner, studio])

  if (!isOwner) return null

  return (
    <>
      {/* Badge flutuante sempre visivel pro owner indicando estado.
          bottom-center: no canto esquerdo cobria o botão "Ajuda" do sidebar
          em telas de altura baixa (notebook 1366×768). */}
      <button
        type="button"
        onClick={() => studio.set('panelOpen', !studio.panelOpen)}
        className={`fixed bottom-2 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-bold border shadow-lg transition-all ${
          studio.enabled
            ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300'
            : 'bg-black/60 border-white/10 text-white/40 hover:text-white/80'
        }`}
        title="Studio Mode (Ctrl+Shift+S)"
      >
        <Sparkles size={12} />
        {studio.enabled ? 'STUDIO ON' : 'studio'}
      </button>

      {studio.panelOpen && <StudioControls />}
    </>
  )
}

function StudioControls() {
  const studio = useStudioMode()
  const [newTrade, setNewTrade] = useState({
    asset_symbol: 'EUR/USD (OTC)',
    direction: 'CALL' as 'CALL' | 'PUT',
    amount: 100,
    payout_pct: 87,
  })

  return (
    <div className="fixed inset-y-0 right-0 z-[100] w-[380px] bg-[#0f1320] border-l border-fuchsia-500/30 shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0f1320] border-b border-fuchsia-500/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-fuchsia-400" />
          <span className="text-sm font-bold text-white">Studio Mode</span>
        </div>
        <button
          onClick={() => studio.set('panelOpen', false)}
          className="text-white/40 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Master toggle */}
        <Toggle
          label="Ativar Studio Mode"
          desc="Liga/desliga todos os efeitos abaixo"
          checked={studio.enabled}
          onChange={() => studio.toggle('enabled')}
          accent
        />

        <div className={studio.enabled ? '' : 'opacity-40 pointer-events-none'}>
          {/* ── Saldo ───────────────────────────────────────────────────── */}
          <Section title="Saldo">
            <Toggle
              label="1. Saldo customizado"
              checked={studio.customBalanceEnabled}
              onChange={() => studio.toggle('customBalanceEnabled')}
            />
            {studio.customBalanceEnabled && (
              <NumberInput
                label="Valor exibido (R$)"
                value={studio.customBalance}
                onChange={v => studio.set('customBalance', v)}
                step={100}
              />
            )}
            <Toggle
              label="5. Saldo so cresce (n. decresce em perdas)"
              checked={studio.balanceOnlyGrows}
              onChange={() => studio.toggle('balanceOnlyGrows')}
            />
          </Section>

          {/* ── Operacoes ───────────────────────────────────────────────── */}
          <Section title="Operacoes">
            <Toggle
              label="2. Esconder perdas do historico"
              checked={studio.hideLosses}
              onChange={() => studio.toggle('hideLosses')}
            />
            <Toggle
              label="3. Boost de payout visual"
              checked={studio.payoutBoostEnabled}
              onChange={() => studio.toggle('payoutBoostEnabled')}
            />
            {studio.payoutBoostEnabled && (
              <NumberInput
                label="Adicional (%)"
                value={studio.payoutBoostPct}
                onChange={v => studio.set('payoutBoostPct', v)}
                step={1}
              />
            )}
            <Toggle
              label="4. Forcar vitoria na proxima operacao"
              desc={studio.forceNextWin ? 'Ativo — proxima trade aparecera GANHOU' : ''}
              checked={studio.forceNextWin}
              onChange={() => studio.toggle('forceNextWin')}
            />
            <Toggle
              label="6. Silenciar popup/som de derrota"
              checked={studio.silenceLossPopup}
              onChange={() => studio.toggle('silenceLossPopup')}
            />
          </Section>

          {/* ── Identidade ──────────────────────────────────────────────── */}
          <Section title="Identidade">
            <Toggle
              label="7. Nome/email customizado"
              checked={studio.customIdentityEnabled}
              onChange={() => studio.toggle('customIdentityEnabled')}
            />
            {studio.customIdentityEnabled && (
              <>
                <TextInput
                  label="Nome exibido"
                  value={studio.customName}
                  onChange={v => studio.set('customName', v)}
                />
                <TextInput
                  label="Email exibido"
                  value={studio.customEmail}
                  onChange={v => studio.set('customEmail', v)}
                />
              </>
            )}
          </Section>

          {/* ── Visual ──────────────────────────────────────────────────── */}
          <Section title="Visual">
            <Toggle
              label='8. Esconder tag "(OTC)"'
              checked={studio.hideOtcTag}
              onChange={() => studio.toggle('hideOtcTag')}
            />
            <Toggle
              label="9. Modo limpo (DEV/leaderboards)"
              checked={studio.cleanMode}
              onChange={() => studio.toggle('cleanMode')}
            />
            <Toggle
              label="13. Esconder botao MUDAR (demo)"
              checked={studio.hideMudarButton}
              onChange={() => studio.toggle('hideMudarButton')}
            />
          </Section>

          {/* ── Engajamento ─────────────────────────────────────────────── */}
          <Section title="Engajamento">
            <Toggle
              label="10. Streak counter fake"
              checked={studio.streakEnabled}
              onChange={() => studio.toggle('streakEnabled')}
            />
            {studio.streakEnabled && (
              <NumberInput
                label="Vitorias seguidas"
                value={studio.streakCount}
                onChange={v => studio.set('streakCount', v)}
                step={1}
              />
            )}
          </Section>

          {/* ── Timezone ────────────────────────────────────────────────── */}
          <Section title="Timezone">
            <Toggle
              label="12. Timezone customizado"
              checked={studio.customTimezoneEnabled}
              onChange={() => studio.toggle('customTimezoneEnabled')}
            />
            {studio.customTimezoneEnabled && (
              <select
                value={studio.customTimezone}
                onChange={e => studio.set('customTimezone', e.target.value)}
                className="w-full bg-[#0E1620] border border-white/10 rounded px-2 py-1.5 text-xs text-white"
              >
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
              </select>
            )}
          </Section>

          {/* ── Historico injetavel ─────────────────────────────────────── */}
          <Section title="11. Historico fake (adicionar)">
            <TextInput
              label="Ativo"
              value={newTrade.asset_symbol}
              onChange={v => setNewTrade({ ...newTrade, asset_symbol: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setNewTrade({ ...newTrade, direction: 'CALL' })}
                className={`px-2 py-1 rounded text-[11px] font-bold ${newTrade.direction === 'CALL' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/40'}`}
              >
                Compra
              </button>
              <button
                onClick={() => setNewTrade({ ...newTrade, direction: 'PUT' })}
                className={`px-2 py-1 rounded text-[11px] font-bold ${newTrade.direction === 'PUT' ? 'bg-rose-500/20 text-rose-300' : 'bg-white/5 text-white/40'}`}
              >
                Venda
              </button>
            </div>
            <NumberInput label="Stake (R$)" value={newTrade.amount} onChange={v => setNewTrade({ ...newTrade, amount: v })} step={10} />
            <NumberInput label="Payout (%)" value={newTrade.payout_pct} onChange={v => setNewTrade({ ...newTrade, payout_pct: v })} step={1} />
            <button
              onClick={() => {
                const profit = Math.round(newTrade.amount * (newTrade.payout_pct / 100) * 100) / 100
                studio.addFakeHistory({
                  asset_symbol: newTrade.asset_symbol,
                  direction:    newTrade.direction,
                  amount:       newTrade.amount,
                  payout_pct:   newTrade.payout_pct,
                  profit,
                  closed_at:    new Date().toISOString(),
                  status:       'WON',
                })
              }}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded bg-fuchsia-500/20 text-fuchsia-300 text-xs font-bold hover:bg-fuchsia-500/30"
            >
              <Plus size={12} />
              Adicionar ao historico
            </button>
            {studio.fakeHistory.length > 0 && (
              <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                {studio.fakeHistory.map(h => (
                  <div key={h.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-white/5 text-[10px]">
                    <span className="text-white/80 truncate">{h.asset_symbol} · +R${h.profit.toFixed(2)}</span>
                    <button onClick={() => studio.removeFakeHistory(h.id)} className="text-rose-400 hover:text-rose-300">
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Reset */}
          <button
            onClick={() => {
              if (confirm('Resetar todas as configuracoes do Studio Mode?')) studio.reset()
            }}
            className="w-full mt-4 px-2 py-2 rounded border border-rose-500/30 text-rose-400 text-[11px] font-bold hover:bg-rose-500/10"
          >
            Resetar tudo
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pt-3 border-t border-white/5 first:border-t-0 first:pt-0">
      <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">{title}</div>
      {children}
    </div>
  )
}

function Toggle({ label, desc, checked, onChange, accent }: { label: string; desc?: string; checked: boolean; onChange: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onChange}
      className={`w-full flex items-start gap-2 px-2 py-1.5 rounded text-left hover:bg-white/5 transition-colors ${accent && checked ? 'bg-fuchsia-500/10' : ''}`}
    >
      <div className={`mt-0.5 w-8 h-4 rounded-full flex-shrink-0 transition-colors relative ${checked ? (accent ? 'bg-fuchsia-500' : 'bg-emerald-500') : 'bg-white/10'}`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-white leading-tight">{label}</div>
        {desc && <div className="text-[10px] text-white/50 mt-0.5">{desc}</div>}
      </div>
    </button>
  )
}

function NumberInput({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step: number }) {
  return (
    <label className="block">
      <div className="text-[10px] text-white/50 mb-1">{label}</div>
      <input
        type="number"
        value={value}
        step={step}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-full bg-[#0E1620] border border-white/10 rounded px-2 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-fuchsia-500/50"
      />
    </label>
  )
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="text-[10px] text-white/50 mb-1">{label}</div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-[#0E1620] border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-fuchsia-500/50"
      />
    </label>
  )
}
