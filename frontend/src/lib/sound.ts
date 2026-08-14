// SoundManager — camada de feedback sonoro da plataforma.
//
// Filosofia (regra de ouro): discreto e informativo, não festivo. Som confirma
// uma ação, não gera euforia. Acerto e erro têm volume/duração simétricos
// (feedback honesto, e é o que soa profissional). Curto: 40–250 ms.
//
// Som por SÍNTESE (Web Audio + ADSR + reverb curto) por padrão — soa limpo e
// "premium", sem o corte abrupto que dá cara de brinquedo. Para usar um arquivo
// real (CC0 do Pixabay/Freesound), basta apontar o caminho em SOUND_FILES abaixo:
// o manager carrega o buffer e toca o arquivo em vez de sintetizar — sem mexer
// em mais nada no código.
//
// À prova de falha: som é cosmético. Qualquer erro aqui é engolido e a operação
// de trade segue normal.

export type SoundName =
  | 'open'   // abertura de operação — clique de confirmação seco
  | 'win'    // operação vencedora — chime ascendente sóbrio
  | 'loss'   // operação perdedora — descendente, MESMO volume/duração do win
  | 'draw'   // empate/devolução — neutro
  | 'tick'   // contagem regressiva — tick discreto
  | 'click'  // clique de UI — quase subliminar
  | 'toggle' // toggle/seleção — tick suave, distinto do click
  | 'notify' // notificação/alerta de sistema — 2 tons neutros
  | 'error'  // ação inválida — tom grave curto, distinto da perda

/**
 * Mapa evento → arquivo de áudio. `null` = som sintetizado (padrão).
 * Para trocar por um arquivo real CC0: coloque o arquivo em public/sounds/ e
 * aponte o caminho aqui, ex.: win: '/sounds/win.webm'. Nada mais muda.
 */
export const SOUND_FILES: Record<SoundName, string | null> = {
  open:   null,
  win:    null,
  loss:   null,
  draw:   null,
  tick:   null,
  click:  null,
  toggle: null,
  notify: null,
  error:  null,
}

// --- preferências (localStorage) ----------------------------------------

const LS_MUTED  = 'vertex.sound.muted'
const LS_VOLUME = 'vertex.sound.volume'
const DEFAULT_VOLUME = 0.65

export interface SoundPrefs {
  muted: boolean
  /** 0..1 */
  volume: number
}

export function getSoundPrefs(): SoundPrefs {
  if (typeof window === 'undefined') return { muted: false, volume: DEFAULT_VOLUME }
  try {
    const muted = localStorage.getItem(LS_MUTED) === '1'
    const raw = parseFloat(localStorage.getItem(LS_VOLUME) ?? '')
    const volume = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : DEFAULT_VOLUME
    return { muted, volume }
  } catch {
    return { muted: false, volume: DEFAULT_VOLUME }
  }
}

export function setSoundPrefs(prefs: Partial<SoundPrefs>): void {
  if (typeof window === 'undefined') return
  try {
    if (prefs.muted !== undefined) localStorage.setItem(LS_MUTED, prefs.muted ? '1' : '0')
    if (prefs.volume !== undefined) {
      localStorage.setItem(LS_VOLUME, String(Math.min(1, Math.max(0, prefs.volume))))
    }
  } catch {
    /* localStorage indisponível (modo privado etc.) — ignora */
  }
}

// --- engine de áudio (Web Audio) ----------------------------------------

const DEBOUNCE_MS = 80 // ignora o mesmo som disparado de novo nessa janela

interface Voice {
  freq: number
  /** segundos a partir do início do som */
  at: number
  dur: number
  type: OscillatorType
  peak: number
  /** parcial harmônico opcional (amplitude relativa do 2º harmônico) */
  harm?: number
  /** envelope ADSR (segundos / 0..1) */
  attack?: number
  decay?: number
  sustain?: number
  release?: number
  /** glide de frequência até esta freq ao longo da nota (ex.: erro "afundando") */
  glideTo?: number
  /** quanto desta voz vai pro reverb (0..1) */
  reverb?: number
}

class SoundManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private reverb: ConvolverNode | null = null
  private wet: GainNode | null = null
  private buffers = new Map<SoundName, AudioBuffer>()
  private last = new Map<SoundName, number>()
  private armed = false

  /** Pré-carrega e arma o desbloqueio de áudio no 1º gesto do usuário. */
  init(): void {
    if (typeof window === 'undefined' || this.armed) return
    this.armed = true
    const unlock = () => {
      this.ensureContext()
      this.ctx?.resume().catch(() => {})
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchstart', unlock)
  }

  private ensureContext(): boolean {
    if (this.ctx) return true
    try {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext
        webkitAudioContext?: typeof AudioContext
      }
      const Ctor = w.AudioContext ?? w.webkitAudioContext
      if (!Ctor) return false

      const ctx = new Ctor()
      const master = ctx.createGain()
      // Compressor no master: garante que nada distorce no volume máximo,
      // mesmo com notas sobrepostas.
      const comp = ctx.createDynamicsCompressor()
      master.connect(comp)
      comp.connect(ctx.destination)

      // Reverb curtíssimo (acabamento) — IR sintético decaindo rápido.
      const reverb = ctx.createConvolver()
      reverb.buffer = this.makeImpulse(ctx, 0.18, 3)
      const wet = ctx.createGain()
      wet.gain.value = 0.12
      reverb.connect(wet)
      wet.connect(master)

      this.ctx = ctx
      this.master = master
      this.reverb = reverb
      this.wet = wet

      // Decodifica eventuais arquivos configurados (assíncrono, não bloqueia).
      this.preloadFiles()
      return true
    } catch {
      return false
    }
  }

  private makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate
    const len = Math.max(1, Math.floor(rate * seconds))
    const buf = ctx.createBuffer(2, len, rate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
      }
    }
    return buf
  }

  private async preloadFiles(): Promise<void> {
    if (!this.ctx) return
    for (const name of Object.keys(SOUND_FILES) as SoundName[]) {
      const url = SOUND_FILES[name]
      if (!url || this.buffers.has(name)) continue
      try {
        const res = await fetch(url)
        const arr = await res.arrayBuffer()
        const buf = await this.ctx.decodeAudioData(arr)
        this.buffers.set(name, buf)
      } catch {
        /* arquivo ausente/inválido — cai pra síntese */
      }
    }
  }

  play(name: SoundName): void {
    if (typeof window === 'undefined') return
    try {
      const { muted, volume } = getSoundPrefs()
      if (muted || volume <= 0) return

      // Debounce: não "metralha" o mesmo som em sequência rápida.
      const now = performance.now()
      const prev = this.last.get(name) ?? 0
      if (now - prev < DEBOUNCE_MS) return
      this.last.set(name, now)

      if (!this.ensureContext() || !this.ctx || !this.master) return
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})

      this.master.gain.value = volume

      const fileBuf = this.buffers.get(name)
      if (fileBuf) {
        this.playBuffer(fileBuf)
        return
      }
      this.synthesize(name)
    } catch {
      /* ignora qualquer falha de áudio */
    }
  }

  private playBuffer(buffer: AudioBuffer): void {
    if (!this.ctx || !this.master || !this.reverb) return
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.master)
    src.connect(this.reverb)
    src.start()
  }

  // --- síntese das vozes -------------------------------------------------

  private playVoice(v: Voice): void {
    if (!this.ctx || !this.master || !this.reverb) return
    const ctx = this.ctx
    const t0 = ctx.currentTime + v.at

    const osc = ctx.createOscillator()
    osc.type = v.type
    osc.frequency.setValueAtTime(v.freq, t0)
    if (v.glideTo) osc.frequency.exponentialRampToValueAtTime(v.glideTo, t0 + v.dur)

    const gain = ctx.createGain()

    // Envelope ADSR — rampas suaves eliminam o "click" de corte.
    const attack  = v.attack  ?? 0.004
    const decay   = v.decay   ?? v.dur * 0.5
    const sustain = v.sustain ?? 0.0
    const release = v.release ?? 0.04
    const peak    = v.peak

    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack)
    const susLevel = Math.max(0.0001, peak * sustain)
    gain.gain.exponentialRampToValueAtTime(susLevel, t0 + attack + decay)
    const end = t0 + attack + decay + Math.max(0, v.dur)
    gain.gain.setValueAtTime(susLevel, end)
    gain.gain.exponentialRampToValueAtTime(0.0001, end + release)

    osc.connect(gain)
    gain.connect(this.master)
    if ((v.reverb ?? 0.25) > 0) {
      const send = ctx.createGain()
      send.gain.value = v.reverb ?? 0.25
      gain.connect(send)
      send.connect(this.reverb)
    }

    osc.start(t0)
    osc.stop(end + release + 0.02)

    // Parcial harmônico (dá corpo de "sino/marimba" sem soar eletrônico).
    if (v.harm && v.harm > 0) {
      this.playVoice({ ...v, freq: v.freq * 2, peak: peak * v.harm, harm: 0, reverb: (v.reverb ?? 0.25) * 0.6 })
    }
  }

  private synthesize(name: SoundName): void {
    switch (name) {
      // 1. Abertura — clique de confirmação seco, tom médio, "registrado".
      case 'open':
        this.playVoice({ freq: 720, at: 0, dur: 0.07, type: 'triangle', peak: 0.5, attack: 0.003, decay: 0.06, release: 0.03, reverb: 0.15 })
        break

      // 2. Acerto — ascendente sóbrio (quinta justa E5→B5), timbre de sino.
      case 'win':
        this.playVoice({ freq: 659.25, at: 0.00, dur: 0.10, type: 'sine', peak: 0.42, decay: 0.14, release: 0.10, harm: 0.18 })
        this.playVoice({ freq: 987.77, at: 0.09, dur: 0.12, type: 'sine', peak: 0.42, decay: 0.16, release: 0.12, harm: 0.18 })
        break

      // 3. Erro/perda — descendente uma OITAVA abaixo do win (B4→E4): registro
      // grave e sóbrio, claramente distinto do acerto. MESMO volume e duração.
      case 'loss':
        this.playVoice({ freq: 493.88, at: 0.00, dur: 0.10, type: 'sine', peak: 0.42, decay: 0.14, release: 0.10, harm: 0.22 })
        this.playVoice({ freq: 329.63, at: 0.09, dur: 0.12, type: 'sine', peak: 0.42, decay: 0.16, release: 0.12, harm: 0.22 })
        break

      // Empate — neutro: duas notas iguais (sem subir nem descer).
      case 'draw':
        this.playVoice({ freq: 587.33, at: 0.00, dur: 0.10, type: 'sine', peak: 0.38, decay: 0.14, release: 0.10, harm: 0.12 })
        this.playVoice({ freq: 587.33, at: 0.10, dur: 0.12, type: 'sine', peak: 0.38, decay: 0.14, release: 0.10, harm: 0.12 })
        break

      // 4. Tick de contagem — bem baixo e curto.
      case 'tick':
        this.playVoice({ freq: 1000, at: 0, dur: 0.02, type: 'sine', peak: 0.16, attack: 0.002, decay: 0.03, release: 0.02, reverb: 0 })
        break

      // 5. Clique de UI — quase subliminar.
      case 'click':
        this.playVoice({ freq: 1200, at: 0, dur: 0.015, type: 'triangle', peak: 0.22, attack: 0.002, decay: 0.03, release: 0.02, reverb: 0.08 })
        break

      // 6. Toggle/seleção — tick suave, distinto do click comum.
      case 'toggle':
        this.playVoice({ freq: 880, at: 0, dur: 0.03, type: 'triangle', peak: 0.26, attack: 0.002, decay: 0.04, release: 0.03, reverb: 0.1 })
        break

      // 7. Notificação — 2 tons neutros (quarta justa A5→D6), suave.
      case 'notify':
        this.playVoice({ freq: 880.0,  at: 0.00, dur: 0.10, type: 'sine', peak: 0.34, decay: 0.12, release: 0.10, harm: 0.1 })
        this.playVoice({ freq: 1174.7, at: 0.12, dur: 0.12, type: 'sine', peak: 0.34, decay: 0.14, release: 0.12, harm: 0.1 })
        break

      // 8. Ação inválida — tom grave curto "afundando", distinto da perda.
      case 'error':
        this.playVoice({ freq: 233.08, at: 0, dur: 0.10, type: 'triangle', peak: 0.40, attack: 0.004, decay: 0.10, release: 0.06, glideTo: 174.61, harm: 0.2, reverb: 0.1 })
        break
    }
  }
}

const manager = new SoundManager()

/** Chamar uma vez no carregamento do app (client). Arma o desbloqueio de áudio. */
export function initSound(): void {
  manager.init()
}

/** Toca um efeito. Silencioso e seguro: nunca lança, respeita mudo/volume. */
export function playSound(name: SoundName): void {
  manager.play(name)
}
