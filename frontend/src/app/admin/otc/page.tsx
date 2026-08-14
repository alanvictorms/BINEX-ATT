'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import {
  Plus, Pencil, Trash2, Power, RefreshCcw, X, Activity, Settings, Lock,
  AlertTriangle, ShieldCheck, Waves, Clock, History,
} from 'lucide-react'

type OtcAsset = {
  id: string
  symbol: string
  name: string
  basePrice: string | number
  volatility: string | number
  trend: string | number
  payout: number
  decimals: number
  status: 'ACTIVE' | 'INACTIVE'
  sessionStartUtc: string | null
  sessionEndUtc:   string | null
  updatedAt: string
}

type FormState = {
  id?: string
  symbol:          string
  name:            string
  basePrice:       string
  volatility:      string
  trend:           string
  payout:          string
  decimals:        string
  status:          'ACTIVE' | 'INACTIVE'
  sessionStartUtc: string
  sessionEndUtc:   string
}

const emptyForm: FormState = {
  symbol: '', name: '', basePrice: '', volatility: '0.001', trend: '0',
  payout: '85', decimals: '5', status: 'ACTIVE', sessionStartUtc: '', sessionEndUtc: '',
}

// ─── Mesa de risco ───────────────────────────────────────────────────────────

type DeskRow = {
  id: string; symbol: string; name: string; status: 'ACTIVE' | 'INACTIVE'
  payout: number; volatility: number; trend: number; decimals: number
  price: number | null; price_age_s: number | null
  open_calls: number; open_puts: number
  amount_call: number; amount_put: number
  traders: number; exposure: number
  net_if_call: number; net_if_put: number
  // Cadeado: vem de otc_open_positions(), a MESMA funcao que o trigger usa —
  // inclui conta interna, que a exposicao acima exclui. Sem isso o badge dizia
  // "Livre" e o UPDATE falhava com OTC_DIRECTIONAL_LOCKED.
  params_locked: boolean
  locked_positions: number
  session_start: string | null
  session_end:   string | null
  session_open:  boolean
}

function brl(n: number | null) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Tradução da volatilidade para algo lido em segundos.
//
// O motor aplica shock = gauss × volatility × preço A CADA SEGUNDO (otc/rng.ts).
// Somando 60 passos independentes, o desvio típico de um minuto é
// volatility × √60 do preço. É a única forma de comparar pares — 0.00015 no
// EUR/USD e 0.0015 no BTC não significam a mesma agitação na tela.
const MIN_SD = Math.sqrt(60)
function volPctPerMin(v: number): string {
  const pct = v * MIN_SD * 100
  return pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}

// Acima disso a vela vira ruído e o par fica visivelmente diferente dos outros.
// O banco recusa acima de 0.1 (admin_set_otc_volatility); aqui é só o aviso.
const VOL_ALERTA = 0.005

function sessionLabel(start: string | null, end: string | null) {
  if (!start || !end) return '24 horas'
  return `${start}–${end} UTC`
}

// UTC → horário de Brasília, só pra conferência visual no painel.
function toBrt(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
  return `${String((h + 24 - 3) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function RiskDesk() {
  const [rows,   setRows]   = useState<DeskRow[]>([])
  const [endsIn, setEndsIn] = useState(0)
  const [err,    setErr]    = useState('')
  const [first,  setFirst]  = useState(true)
  const [auto,   setAuto]   = useState(true)
  const [busy,   setBusy]   = useState<string | null>(null)
  const [volFor,  setVolFor]  = useState<DeskRow | null>(null)
  const [sessFor, setSessFor] = useState<DeskRow | null>(null)

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('admin_otc_risk_desk')
      if (error) throw error
      setRows(((data as any)?.rows ?? []) as DeskRow[])
      setEndsIn(Number((data as any)?.candle_ends_in ?? 0))
      setErr('')
    } catch (e: any) {
      setErr(e.message ?? 'Erro ao carregar a mesa')
    } finally {
      setFirst(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    // Pausa o polling enquanto um modal está aberto — recarregar por baixo troca
    // o valor que está sendo editado.
    if (!auto || volFor || sessFor) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [auto, load, volFor, sessFor])

  // Contagem regressiva local da vela de 60s (evita bater na RPC a cada segundo)
  useEffect(() => {
    const t = setInterval(() => setEndsIn(s => (s <= 1 ? 60 : s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  async function toggleLiquidity(r: DeskRow) {
    const on = r.status !== 'ACTIVE'
    if (!on && !confirm(`Desligar a liquidez de ${r.symbol}?\n\nNenhuma operação nova é aceita a partir de agora (o place_trade recusa com ASSET_DISABLED). As posições já abertas continuam recebendo preço até liquidarem.`)) return
    setBusy(r.id)
    try {
      const { error } = await supabase.rpc('admin_set_otc_liquidity', { p_id: r.id, p_active: on })
      if (error) throw error
      await load()
    } catch (e: any) { setErr(e.message ?? 'Falha ao alternar liquidez') }
    finally { setBusy(null) }
  }

  const totalExposure = rows.reduce((s, r) => s + Number(r.exposure || 0), 0)
  // Sem preço fresco = o par não está gerando tick. Pares fora da sessão saem da
  // conta: silêncio ali é o comportamento correto, não uma falha.
  const stale = rows.filter(r => r.status === 'ACTIVE' && r.session_open
                                 && (r.price_age_s == null || r.price_age_s > 30))
  const fechados = rows.filter(r => r.status === 'ACTIVE' && !r.session_open)

  if (first) return <div className="px-4 py-10 text-center text-[#6b7280]">Carregando mesa…</div>

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1e2433]">
          <span className="text-[11px] text-[#6b7280]">Vela de 60s fecha em</span>
          <span className="font-mono font-bold text-white tabular-nums">{endsIn}s</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1e2433]">
          <span className="text-[11px] text-[#6b7280]">Exposição aberta</span>
          <span className="font-mono font-bold text-white">R$ {brl(totalExposure)}</span>
        </div>
        <button onClick={() => setAuto(a => !a)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${auto ? 'bg-green-500/10 border-green-500/40 text-green-300' : 'bg-[#111827] border-[#1e2433] text-[#6b7280]'}`}>
          <Activity size={12} /> {auto ? 'Ao vivo (5s)' : 'Pausado'}
        </button>
        <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1a2030] text-[#9ca3af] hover:text-white text-[11px]">
          <RefreshCcw size={12} /> Atualizar
        </button>
      </div>

      <div className="mb-4 p-3 rounded-xl bg-[#060A11] border border-[#1e2433] flex gap-3">
        <ShieldCheck size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-[#9ca3af] leading-relaxed">
          <span className="font-semibold text-white">O que você controla aqui.</span>{' '}
          <span className="text-[#d1d5db]">Volatilidade</span> (quanto o preço balança — sobe a variância dos dois lados,
          sem favorecer CALL nem PUT), <span className="text-[#d1d5db]">sessão</span> (em que horas o par aceita entrada) e{' '}
          <span className="text-[#d1d5db]">liquidez</span> (liga/desliga o par). O que move o preço numa direção —{' '}
          <code className="mx-1">trend</code> e <code className="mx-1">preço base</code> — fica bloqueado por um trigger
          no Postgres sempre que houver posição aberta, e a trava vale para o painel, para a API e para SQL manual.
          Fechar par ou sessão bloqueia só a <span className="text-[#d1d5db]">entrada</span>: quem já está dentro continua
          recebendo preço até liquidar.
        </div>
      </div>

      {fechados.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-[#111827] border border-[#1e2433] flex gap-3">
          <Clock size={16} className="text-[#6b7280] flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-[#9ca3af] leading-relaxed">
            <span className="font-semibold text-white">{fechados.length} par(es) fora da sessão agora:</span>{' '}
            {fechados.map(s => `${s.symbol} (${sessionLabel(s.session_start, s.session_end)})`).join(', ')}.
            Não aceitam entrada nova e não geram tick — a menos que ainda tenham posição aberta.
          </div>
        </div>
      )}

      {stale.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex gap-3">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-300">{stale.length} par(es) ativos, dentro da sessão e sem preço fresco em live_prices:</span>{' '}
            {stale.map(s => s.symbol).join(', ')}. Isso agora indica motor OTC parado ou publisher fora do ar — o{' '}
            <code>place_trade</code> recusa esses pares com PRICE_UNAVAILABLE.
          </div>
        </div>
      )}

      {err && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{err}</div>}

      <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
        <table className="w-full text-sm min-w-[1180px]">
          <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left   px-4 py-3">Par</th>
              <th className="text-right  px-4 py-3">Preço</th>
              <th className="text-right  px-4 py-3">CALL aberto</th>
              <th className="text-right  px-4 py-3">PUT aberto</th>
              <th className="text-right  px-4 py-3">Se fechar CALL</th>
              <th className="text-right  px-4 py-3">Se fechar PUT</th>
              <th className="text-center px-4 py-3">Payout</th>
              <th className="text-center px-4 py-3">Volatilidade</th>
              <th className="text-center px-4 py-3">Sessão</th>
              <th className="text-center px-4 py-3">Parâmetros</th>
              <th className="text-center px-4 py-3">Liquidez</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-[#6b7280]">Nenhum par OTC cadastrado.</td></tr>
            )}
            {rows.map(r => {
              const semPreco = r.price == null
              const velho    = r.price_age_s != null && r.price_age_s > 30
              const vol      = Number(r.volatility)
              return (
                <tr key={r.id} className="text-white hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold leading-tight">{r.symbol}</div>
                    <div className="text-[10px] text-[#4b5563] leading-tight">
                      {r.traders > 0 ? `${r.traders} operando agora` : 'sem posição'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {semPreco ? (
                      <span className="text-[11px] text-amber-400/80">sem preço</span>
                    ) : (
                      <>
                        <div className="font-mono text-white">{Number(r.price).toFixed(r.decimals)}</div>
                        <div className={`text-[10px] ${velho ? 'text-amber-400' : 'text-[#4b5563]'}`}>{r.price_age_s}s atrás</div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-mono text-green-400">R$ {brl(r.amount_call)}</div>
                    <div className="text-[10px] text-[#4b5563]">{r.open_calls} op.</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-mono text-red-400">R$ {brl(r.amount_put)}</div>
                    <div className="text-[10px] text-[#4b5563]">{r.open_puts} op.</div>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${Number(r.net_if_call) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {Number(r.net_if_call) >= 0 ? '+' : ''}R$ {brl(r.net_if_call)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${Number(r.net_if_put) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {Number(r.net_if_put) >= 0 ? '+' : ''}R$ {brl(r.net_if_put)}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-green-400">{r.payout}%</td>

                  {/* Volatilidade — editável ao vivo, sem trava (não tem direção) */}
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setVolFor(r)}
                      title="Ajustar volatilidade"
                      className="inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded-md hover:bg-white/5 group">
                      <span className={`font-mono text-[12px] ${vol >= VOL_ALERTA ? 'text-amber-300' : 'text-white'} group-hover:text-blue-300`}>
                        {vol.toFixed(6)}
                      </span>
                      <span className="text-[10px] text-[#4b5563]">≈ {volPctPerMin(vol)}/min</span>
                    </button>
                  </td>

                  {/* Sessão — janela HH:MM UTC; vazio = 24 horas */}
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setSessFor(r)}
                      title="Definir janela de negociação"
                      className="inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded-md hover:bg-white/5 group">
                      <span className="font-mono text-[11px] text-[#d1d5db] group-hover:text-blue-300">
                        {sessionLabel(r.session_start, r.session_end)}
                      </span>
                      {r.session_start && r.session_end ? (
                        <span className={`text-[10px] font-semibold ${r.session_open ? 'text-green-400' : 'text-[#6b7280]'}`}>
                          {r.session_open ? 'aberto agora' : 'fechado agora'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#4b5563]">sempre aberto</span>
                      )}
                    </button>
                  </td>

                  <td className="px-4 py-3 text-center">
                    {r.params_locked ? (
                      <span
                        title={`${r.locked_positions} posição(ões) aberta(s) em conta REAL — trend e preço base bloqueados pelo trigger. Inclui contas internas, que não entram na exposição acima.`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[10px] font-semibold">
                        <Lock size={10} /> Travado
                      </span>
                    ) : (
                      <span title="Sem posição aberta: trend e preço base podem ser alterados no Cadastro" className="text-[10px] text-[#4b5563]">Livre</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleLiquidity(r)} disabled={busy === r.id}
                      title={r.status === 'ACTIVE' ? 'Desligar liquidez' : 'Ligar liquidez'}
                      className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${r.status === 'ACTIVE' ? 'bg-green-500' : 'bg-[#2a3448]'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${r.status === 'ACTIVE' ? 'translate-x-5' : ''}`} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {volFor  && <VolatilityModal row={volFor}  onClose={() => setVolFor(null)}  onSaved={() => { setVolFor(null);  load() }} />}
      {sessFor && <SessionModal    row={sessFor} onClose={() => setSessFor(null)} onSaved={() => { setSessFor(null); load() }} />}
    </>
  )
}

// ─── Volatilidade ao vivo ────────────────────────────────────────────────────

function VolatilityModal({ row, onClose, onSaved }: { row: DeskRow; onClose: () => void; onSaved: () => void }) {
  const inicial = Number(row.volatility)
  const [valor, setValor] = useState(inicial.toFixed(6))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const n = Number(valor)
  const valido = Number.isFinite(n) && n > 0 && n <= 0.1
  const fator  = valido && inicial > 0 ? n / inicial : 1

  function multiplicar(f: number) {
    setValor(Math.min(Math.max(inicial * f, 0.000001), 0.1).toFixed(6))
  }

  async function salvar() {
    if (!valido) { setErr('Informe um número entre 0.000001 e 0.1.'); return }
    setSaving(true); setErr('')
    try {
      const { error } = await supabase.rpc('admin_set_otc_volatility', { p_id: row.id, p_volatility: n })
      if (error) throw error
      onSaved()
    } catch (e: any) {
      setErr(e.message ?? 'Falha ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Volatilidade — ${row.symbol}`} icon={<Waves size={16} className="text-blue-400" />} onClose={onClose}>
      <p className="text-[11px] text-[#9ca3af] leading-relaxed mb-4">
        Volatilidade é o tamanho do passo que o preço dá por segundo. Ela aumenta a oscilação nos{' '}
        <span className="text-white font-medium">dois sentidos</span> — não empurra o preço para CALL nem para PUT, então
        pode ser mudada mesmo com posição aberta. Toda alteração fica registrada na aba Histórico.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="p-3 rounded-lg bg-[#0a0e16] border border-[#1e2433]">
          <div className="text-[10px] text-[#6b7280] mb-1">Agora</div>
          <div className="font-mono text-white">{inicial.toFixed(6)}</div>
          <div className="text-[10px] text-[#4b5563]">≈ {volPctPerMin(inicial)} por minuto</div>
        </div>
        <div className={`p-3 rounded-lg border ${valido ? 'bg-blue-500/5 border-blue-500/30' : 'bg-[#0a0e16] border-[#1e2433]'}`}>
          <div className="text-[10px] text-[#6b7280] mb-1">Depois</div>
          <div className="font-mono text-white">{valido ? n.toFixed(6) : '—'}</div>
          <div className="text-[10px] text-[#4b5563]">
            {valido ? `≈ ${volPctPerMin(n)} por minuto (${fator.toFixed(2)}× do atual)` : 'valor inválido'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {[0.5, 0.75, 1, 1.5, 2].map(f => (
          <button key={f} onClick={() => multiplicar(f)}
            className="px-2.5 py-1 rounded-md bg-[#1a2030] hover:bg-[#232b3d] text-[#9ca3af] hover:text-white text-[11px] font-mono">
            {f === 1 ? 'voltar ao atual' : `${f}×`}
          </button>
        ))}
      </div>

      <label className="block text-[11px] text-[#6b7280] mb-1">Valor</label>
      <input type="text" value={valor} onChange={e => setValor(e.target.value)}
        className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none" />

      {valido && n >= VOL_ALERTA && (
        <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200/90">
          <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />
          {volPctPerMin(n)} por minuto é bem acima do que os outros pares fazem. A vela fica visualmente ruidosa e o
          cliente percebe a diferença entre os ativos.
        </div>
      )}
      {row.params_locked && (
        <div className="mt-3 p-2.5 rounded-lg bg-[#111827] border border-[#1e2433] text-[11px] text-[#9ca3af]">
          Este par tem <span className="text-white font-medium">{row.open_calls + row.open_puts} posição(ões) aberta(s)</span>.
          A mudança vale para elas também, nos dois sentidos.
        </div>
      )}
      {err && <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11px]">{err}</div>}

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-[#9ca3af] hover:text-white text-sm">Cancelar</button>
        <button onClick={salvar} disabled={saving || !valido}
          className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium">
          {saving ? 'Salvando…' : 'Aplicar'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Sessão de negociação ────────────────────────────────────────────────────

function SessionModal({ row, onClose, onSaved }: { row: DeskRow; onClose: () => void; onSaved: () => void }) {
  const [inicio, setInicio] = useState(row.session_start ?? '')
  const [fim,    setFim]    = useState(row.session_end   ?? '')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const vazio  = !inicio.trim() && !fim.trim()
  const hhmm   = /^([01]\d|2[0-3]):[0-5]\d$/
  const valido = vazio || (hhmm.test(inicio.trim()) && hhmm.test(fim.trim()))
  const cruzaMeiaNoite = valido && !vazio && inicio.trim() > fim.trim()

  async function salvar() {
    if (!valido) { setErr('Use HH:MM em UTC nos dois campos, ou deixe os dois vazios para 24 horas.'); return }
    setSaving(true); setErr('')
    try {
      const { error } = await supabase.rpc('admin_set_otc_session', {
        p_id:    row.id,
        p_start: vazio ? null : inicio.trim(),
        p_end:   vazio ? null : fim.trim(),
      })
      if (error) throw error
      onSaved()
    } catch (e: any) {
      setErr(e.message ?? 'Falha ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={`Janela de negociação — ${row.symbol}`} icon={<Clock size={16} className="text-blue-400" />} onClose={onClose}>
      <p className="text-[11px] text-[#9ca3af] leading-relaxed mb-4">
        Fora da janela o par não aceita entrada nova (<code>MARKET_CLOSED</code>) e para de gerar preço. Uma opção que
        venceria depois do fechamento também é recusada — assim nenhuma posição atravessa o fechamento. Quem já está
        dentro continua recebendo preço normalmente até liquidar. Deixe os dois campos vazios para 24 horas.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-[#6b7280] mb-1">Abre (UTC)</label>
          <input type="text" value={inicio} onChange={e => setInicio(e.target.value)} placeholder="09:00"
            className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none" />
          {hhmm.test(inicio.trim()) && <div className="text-[10px] text-[#4b5563] mt-1">{toBrt(inicio.trim())} em Brasília</div>}
        </div>
        <div>
          <label className="block text-[11px] text-[#6b7280] mb-1">Fecha (UTC)</label>
          <input type="text" value={fim} onChange={e => setFim(e.target.value)} placeholder="21:00"
            className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none" />
          {hhmm.test(fim.trim()) && <div className="text-[10px] text-[#4b5563] mt-1">{toBrt(fim.trim())} em Brasília</div>}
        </div>
      </div>

      <button onClick={() => { setInicio(''); setFim('') }}
        className="mt-3 px-2.5 py-1 rounded-md bg-[#1a2030] hover:bg-[#232b3d] text-[#9ca3af] hover:text-white text-[11px]">
        Deixar 24 horas
      </button>

      {cruzaMeiaNoite && (
        <div className="mt-3 p-2.5 rounded-lg bg-[#111827] border border-[#1e2433] text-[11px] text-[#9ca3af]">
          Janela que cruza a meia-noite: o par fica aberto de {inicio.trim()} até {fim.trim()} do dia seguinte.
        </div>
      )}
      {err && <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11px]">{err}</div>}

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-[#9ca3af] hover:text-white text-sm">Cancelar</button>
        <button onClick={salvar} disabled={saving || !valido}
          className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium">
          {saving ? 'Salvando…' : 'Aplicar'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Histórico de parâmetros ─────────────────────────────────────────────────

type LogRow = {
  symbol: string; field: string
  old_value: string | null; new_value: string | null
  open_ops: number; created_at: string; changed_by: string
}

const FIELD_LABEL: Record<string, string> = {
  trend:      'Trend',
  volatility: 'Volatilidade',
  base_price: 'Preço base',
  payout:     'Payout',
  status:     'Liquidez',
  session:    'Sessão',
}

function ParamHistory() {
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('admin_otc_param_log', { p_limit: 200 })
      if (error) throw error
      setRows((data ?? []) as LogRow[])
      setErr('')
    } catch (e: any) {
      setErr(e.message ?? 'Erro ao carregar o histórico')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <>
      <div className="mb-4 p-3 rounded-xl bg-[#060A11] border border-[#1e2433] flex gap-3">
        <History size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-[#9ca3af] leading-relaxed">
          Toda mudança de parâmetro de par OTC, venha de onde vier — painel, API ou SQL rodado na mão. O registro é feito
          por um trigger no Postgres, então não há caminho de escrita que escape dele. A coluna{' '}
          <span className="text-white font-medium">posições abertas</span> é quantas operações estavam em voo no momento
          exato da mudança: é ela que mostra se um ajuste foi feito com clientes dentro.
        </div>
      </div>

      <div className="flex justify-end mb-3">
        <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1a2030] text-[#9ca3af] hover:text-white text-[11px]">
          <RefreshCcw size={12} /> Atualizar
        </button>
      </div>

      {err && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{err}</div>}

      <div className="rounded-xl border border-[#1e2433] overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left   px-4 py-3">Quando</th>
              <th className="text-left   px-4 py-3">Par</th>
              <th className="text-left   px-4 py-3">Campo</th>
              <th className="text-right  px-4 py-3">De</th>
              <th className="text-right  px-4 py-3">Para</th>
              <th className="text-center px-4 py-3">Posições abertas</th>
              <th className="text-left   px-4 py-3">Quem</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#6b7280]">Carregando…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[#6b7280]">Nenhuma mudança registrada ainda.</td></tr>
            )}
            {rows.map((l, i) => (
              <tr key={i} className="text-white hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-[#9ca3af] text-[12px] whitespace-nowrap">
                  {new Date(l.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-[12px]">{l.symbol}</td>
                <td className="px-4 py-3 text-[#d1d5db] text-[12px]">{FIELD_LABEL[l.field] ?? l.field}</td>
                <td className="px-4 py-3 text-right font-mono text-[#6b7280] text-[12px]">{l.old_value ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono text-white text-[12px]">{l.new_value ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  {l.open_ops > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[10px] font-semibold">
                      <AlertTriangle size={10} /> {l.open_ops}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#4b5563]">nenhuma</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#9ca3af] text-[12px]">{l.changed_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function OtcAdminPage() {
  const [tab, setTab] = useState<'DESK' | 'CRUD' | 'LOG'>('DESK')
  const [assets, setAssets] = useState<OtcAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [modal,   setModal]   = useState<FormState | null>(null)
  const [saving,  setSaving]  = useState(false)

  async function load() {
    setLoading(true); setError(null)
    try {
      const { data } = await api.get<{ assets: OtcAsset[] }>('/admin/otc')
      setAssets(data.assets)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function openCreate() { setModal({ ...emptyForm }) }
  function openEdit(a: OtcAsset) {
    setModal({
      id: a.id, symbol: a.symbol, name: a.name,
      basePrice: String(a.basePrice), volatility: String(a.volatility), trend: String(a.trend),
      payout: String(a.payout), decimals: String(a.decimals), status: a.status,
      sessionStartUtc: a.sessionStartUtc ?? '', sessionEndUtc: a.sessionEndUtc ?? '',
    })
  }

  async function save() {
    if (!modal) return
    setSaving(true)
    const payload: any = {
      name:       modal.name,
      basePrice:  Number(modal.basePrice),
      volatility: Number(modal.volatility),
      trend:      Number(modal.trend),
      payout:     Number(modal.payout),
      decimals:   Number(modal.decimals),
      status:     modal.status,
      sessionStartUtc: modal.sessionStartUtc || null,
      sessionEndUtc:   modal.sessionEndUtc   || null,
    }
    try {
      if (modal.id) {
        await api.patch(`/admin/otc/${modal.id}`, payload)
      } else {
        await api.post('/admin/otc', { ...payload, symbol: modal.symbol })
      }
      setModal(null)
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.error ?? err.message)
    } finally { setSaving(false) }
  }

  async function toggle(a: OtcAsset) {
    try { await api.post(`/admin/otc/${a.id}/toggle`); await load() }
    catch (err: any) { alert(err?.response?.data?.error ?? err.message) }
  }
  async function remove(a: OtcAsset) {
    if (!confirm(`Remover ${a.symbol}? Esta ação não pode ser desfeita.`)) return
    try { await api.delete(`/admin/otc/${a.id}`); await load() }
    catch (err: any) { alert(err?.response?.data?.error ?? err.message) }
  }

  const subtitulo =
    tab === 'DESK' ? 'Exposição ao vivo e controle do preço sintético'
    : tab === 'CRUD' ? 'Ativos sintéticos gerados pelo servidor'
    : 'Toda mudança de parâmetro, por qualquer caminho'

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">OTC</h1>
          <p className="text-sm text-[#6b7280]">{subtitulo}</p>
        </div>
        {tab === 'CRUD' && (
          <div className="flex gap-2">
            <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2030] text-[#9ca3af] hover:text-white text-sm">
              <RefreshCcw size={14} /> Atualizar
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium">
              <Plus size={16} /> Novo ativo
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-5 p-1 rounded-xl bg-[#060A11] border border-[#1e2433] w-fit">
        <button onClick={() => setTab('DESK')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'DESK' ? 'bg-[#1e2433] text-white' : 'text-[#6b7280] hover:text-white'}`}>
          <Activity size={14} /> Mesa de risco
        </button>
        <button onClick={() => setTab('CRUD')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'CRUD' ? 'bg-[#1e2433] text-white' : 'text-[#6b7280] hover:text-white'}`}>
          <Settings size={14} /> Cadastro
        </button>
        <button onClick={() => setTab('LOG')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'LOG' ? 'bg-[#1e2433] text-white' : 'text-[#6b7280] hover:text-white'}`}>
          <History size={14} /> Histórico
        </button>
      </div>

      {tab === 'DESK' && <RiskDesk />}
      {tab === 'LOG'  && <ParamHistory />}

      {error && tab === 'CRUD' && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

      <div className={`rounded-xl border border-[#1e2433] overflow-x-auto ${tab === 'CRUD' ? '' : 'hidden'}`}>
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-[#060A11] text-[#6b7280] text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Símbolo</th>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-right px-4 py-3">Preço base</th>
              <th className="text-right px-4 py-3">Volatilidade</th>
              <th className="text-right px-4 py-3">Trend</th>
              <th className="text-right px-4 py-3">Payout</th>
              <th className="text-left px-4 py-3">Sessão</th>
              <th className="text-center px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-[#0a0e16] divide-y divide-[#1e2433]">
            {loading && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-[#6b7280]">Carregando…</td></tr>
            )}
            {!loading && assets.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-[#6b7280]">Nenhum ativo cadastrado. Clique em "Novo ativo".</td></tr>
            )}
            {assets.map(a => (
              <tr key={a.id} className="text-white hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono font-semibold">{a.symbol}</td>
                <td className="px-4 py-3 text-[#9ca3af]">{a.name}</td>
                <td className="px-4 py-3 text-right font-mono">{Number(a.basePrice).toFixed(a.decimals)}</td>
                <td className="px-4 py-3 text-right font-mono text-[#9ca3af]">{Number(a.volatility).toFixed(6)}</td>
                <td className="px-4 py-3 text-right font-mono text-[#9ca3af]">{Number(a.trend).toFixed(4)}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-400">{a.payout}%</td>
                <td className="px-4 py-3 font-mono text-[11px] text-[#9ca3af]">
                  {sessionLabel(a.sessionStartUtc, a.sessionEndUtc)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.status === 'ACTIVE' ? 'bg-green-500/15 text-green-400' : 'bg-[#1e2433] text-[#6b7280]'}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => toggle(a)} title="Ativar/Desativar" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-yellow-400"><Power size={14} /></button>
                    <button onClick={() => openEdit(a)} title="Editar" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-blue-400"><Pencil size={14} /></button>
                    <button onClick={() => remove(a)} title="Remover" className="p-1.5 rounded-md hover:bg-white/5 text-[#9ca3af] hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setModal(null)}>
          <div className="bg-[#060A11] border border-[#1e2433] rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">{modal.id ? 'Editar ativo' : 'Novo ativo OTC'}</h2>
              <button onClick={() => setModal(null)} className="p-1 text-[#6b7280] hover:text-white"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Field label="Símbolo" disabled={!!modal.id} value={modal.symbol} onChange={v => setModal({ ...modal, symbol: v.toUpperCase() })} placeholder="USDBRL-OTC" />
              <Field label="Nome" value={modal.name} onChange={v => setModal({ ...modal, name: v })} placeholder="USD/BRL OTC" />
              <Field label="Preço base" value={modal.basePrice} onChange={v => setModal({ ...modal, basePrice: v })} placeholder="5.20000" />
              <Field label="Decimais" value={modal.decimals} onChange={v => setModal({ ...modal, decimals: v })} placeholder="5" />
              <Field label="Volatilidade (0..1)" value={modal.volatility} onChange={v => setModal({ ...modal, volatility: v })} placeholder="0.001" />
              <Field label="Trend (-1..1)" value={modal.trend} onChange={v => setModal({ ...modal, trend: v })} placeholder="0" />
              <Field label="Payout %" value={modal.payout} onChange={v => setModal({ ...modal, payout: v })} placeholder="85" />
              <div>
                <label className="block text-[11px] text-[#6b7280] mb-1">Status</label>
                <select value={modal.status} onChange={e => setModal({ ...modal, status: e.target.value as any })} className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
              <Field label="Sessão início UTC (HH:MM)" value={modal.sessionStartUtc} onChange={v => setModal({ ...modal, sessionStartUtc: v })} placeholder="vazio = 24h" />
              <Field label="Sessão fim UTC (HH:MM)" value={modal.sessionEndUtc} onChange={v => setModal({ ...modal, sessionEndUtc: v })} placeholder="vazio = 24h" />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-[#9ca3af] hover:text-white text-sm">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium">
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Modal({ title, icon, onClose, children }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#060A11] border border-[#1e2433] rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-white">{icon}{title}</h2>
          <button onClick={onClose} className="p-1 text-[#6b7280] hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] text-[#6b7280] mb-1">{label}</label>
      <input
        type="text" value={value} onChange={e => onChange(e.target.value)}
        disabled={disabled} placeholder={placeholder}
        className="w-full bg-[#0a0e16] border border-[#1e2433] rounded-lg px-3 py-2 text-white disabled:opacity-50 focus:border-green-500 focus:outline-none"
      />
    </div>
  )
}
