// Cliente WebSocket minimo da Deriv, so pra leitura de historico publico.
//
// ticks_history nao exige token — so o app_id na URL. Nada aqui autentica nem
// envia ordem: e um leitor de candles, isolado do resto da aplicacao.
//
// Docs: https://developers.deriv.com/docs/data/ticks-history/

import WebSocket from 'ws'
import { isDerivGranularity } from './symbols.js'

export interface DerivCandle {
  epoch: number
  open: number
  high: number
  low: number
  close: number
}

const DEFAULT_URL = 'wss://ws.derivws.com/websockets/v3'
// 1089 e o app_id publico usado nos exemplos da propria Deriv. Serve pra ler
// historico, mas registre um proprio em https://api.deriv.com pra producao.
const DEFAULT_APP_ID = '1089'

// A Deriv limita style:'candles' a 5000 barras por resposta.
export const DERIV_MAX_CANDLES = 5000

export class DerivClient {
  private ws: WebSocket | null = null
  private seq = 0
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()

  constructor(
    private readonly appId = process.env.DERIV_APP_ID ?? DEFAULT_APP_ID,
    private readonly baseUrl = process.env.DERIV_WS_URL ?? DEFAULT_URL,
  ) {}

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${this.baseUrl}?app_id=${this.appId}`)
      const timer = setTimeout(() => reject(new Error('deriv: timeout na conexao')), 30_000)

      ws.on('open', () => { clearTimeout(timer); this.ws = ws; resolve() })
      ws.on('error', (err) => { clearTimeout(timer); reject(err) })
      ws.on('message', (raw) => this.onMessage(raw.toString()))
      ws.on('close', () => {
        this.ws = null
        for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error('deriv: conexao fechada')) }
        this.pending.clear()
      })
    })
  }

  private onMessage(raw: string) {
    let msg: any
    try { msg = JSON.parse(raw) } catch { return }
    const id = msg?.echo_req?.passthrough?.rid
    if (!id) return
    const p = this.pending.get(id)
    if (!p) return
    this.pending.delete(id)
    clearTimeout(p.timer)
    if (msg.error) p.reject(new Error(`deriv ${msg.error.code}: ${msg.error.message}`))
    else p.resolve(msg)
  }

  private send(payload: Record<string, unknown>, timeoutMs = 45_000): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('deriv: nao conectado'))
    }
    const rid = `q${++this.seq}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid)
        reject(new Error('deriv: timeout na resposta'))
      }, timeoutMs)
      this.pending.set(rid, { resolve, reject, timer })
      this.ws!.send(JSON.stringify({ ...payload, passthrough: { rid } }))
    })
  }

  /**
   * Uma pagina de candles OHLC. A Deriv devolve no maximo DERIV_MAX_CANDLES por
   * chamada, entao quem precisa de um intervalo longo pagina por `end`.
   *
   * Retorna em ordem crescente de epoch (a Deriv ja entrega assim).
   */
  async candles(params: {
    symbol: string
    granularity: number
    start: number
    end: number
    count?: number
  }): Promise<DerivCandle[]> {
    if (!isDerivGranularity(params.granularity)) {
      throw new Error(`deriv: granularity ${params.granularity} nao suportada`)
    }
    const res = await this.send({
      ticks_history:     params.symbol,
      style:             'candles',
      granularity:       params.granularity,
      start:             params.start,
      end:               String(params.end),
      count:             Math.min(params.count ?? DERIV_MAX_CANDLES, DERIV_MAX_CANDLES),
      adjust_start_time: 1,
    })
    const raw: any[] = res?.candles ?? []
    return raw.map(c => ({
      epoch: Number(c.epoch),
      open:  Number(c.open),
      high:  Number(c.high),
      low:   Number(c.low),
      close: Number(c.close),
    })).filter(c =>
      Number.isFinite(c.epoch) && Number.isFinite(c.open) &&
      Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close),
    )
  }

  close() {
    this.ws?.close()
    this.ws = null
  }
}
