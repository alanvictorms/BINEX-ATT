'use client'

import { useEffect, useRef, useState } from 'react'
import { Renderer, Program, Triangle, Mesh } from 'ogl'

/**
 * Feixes de luz em WebGL para o fundo do hero do site público.
 *
 * Adaptado do componente LightRays original. O que mudou em relação a ele:
 *  - respeita `prefers-reduced-motion` (não inicia nada e deixa o fallback CSS);
 *  - não roda em ponteiro grosso / tela pequena — em celular o efeito quase não
 *    aparece e come bateria, então lá fica só o gradiente estático;
 *  - conserta o vazamento de contexto quando o componente desmonta durante a
 *    inicialização assíncrona (o cleanup do React rodava antes do cleanup real
 *    ser registrado);
 *  - libera o contexto WebGL no unmount (navegador limita ~16 contextos vivos);
 *  - separa a atualização de uniforms da criação do contexto, então mudar uma
 *    prop não reconstrói o renderer inteiro;
 *  - ResizeObserver no container em vez de só o resize da janela.
 */

export type RaysOrigin =
  | 'top-center' | 'top-left' | 'top-right'
  | 'left' | 'right'
  | 'bottom-center' | 'bottom-left' | 'bottom-right'

interface LightRaysProps {
  raysOrigin?: RaysOrigin
  /** Cor dos feixes em hex. Padrão: o azul da marca. */
  raysColor?: string
  raysSpeed?: number
  lightSpread?: number
  rayLength?: number
  pulsating?: boolean
  fadeDistance?: number
  saturation?: number
  followMouse?: boolean
  mouseInfluence?: number
  noiseAmount?: number
  distortion?: number
  className?: string
}

type Vec2 = [number, number]
type Vec3 = [number, number, number]

interface Uniforms {
  iTime: { value: number }
  iResolution: { value: Vec2 }
  rayPos: { value: Vec2 }
  rayDir: { value: Vec2 }
  raysColor: { value: Vec3 }
  raysSpeed: { value: number }
  lightSpread: { value: number }
  rayLength: { value: number }
  pulsating: { value: number }
  fadeDistance: { value: number }
  saturation: { value: number }
  mousePos: { value: Vec2 }
  mouseInfluence: { value: number }
  noiseAmount: { value: number }
  distortion: { value: number }
}

const hexToRgb = (hex: string): Vec3 => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m
    ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
    : [1, 1, 1]
}

function getAnchorAndDir(origin: RaysOrigin, w: number, h: number): { anchor: Vec2; dir: Vec2 } {
  const outside = 0.2
  switch (origin) {
    case 'top-left':      return { anchor: [0, -outside * h],            dir: [0.7, 0.7] }
    case 'top-right':     return { anchor: [w, -outside * h],            dir: [-0.7, 0.7] }
    case 'left':          return { anchor: [-outside * w, 0.5 * h],      dir: [1, 0] }
    case 'right':         return { anchor: [(1 + outside) * w, 0.5 * h], dir: [-1, 0] }
    case 'bottom-left':   return { anchor: [0, (1 + outside) * h],       dir: [0.7, -0.7] }
    case 'bottom-center': return { anchor: [0.5 * w, (1 + outside) * h], dir: [0, -1] }
    case 'bottom-right':  return { anchor: [w, (1 + outside) * h],       dir: [-0.7, -0.7] }
    default:              return { anchor: [0.5 * w, -outside * h],      dir: [0, 1] }
  }
}

const VERT = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
uniform float iTime;
uniform vec2  iResolution;
uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2  mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;
varying vec2 vUv;

float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
                  float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  vec2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);

  float d = distortion * sin(iTime * 1.5 + length(sourceToCoord) * 0.005);
  float distortedAngle = cosAngle + d;

  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));
  float dist = length(sourceToCoord);
  float maxDistance = max(iResolution.x, iResolution.y) * rayLength;
  float lengthFalloff = clamp((maxDistance - dist) / maxDistance, 0.0, 1.0);

  float fadeFactor = fadeDistance * max(iResolution.x, iResolution.y);
  float fadeFalloff = clamp((fadeFactor - dist) / fadeFactor, 0.0, 1.0);

  float pulse = pulsating > 0.5 ? (0.85 + 0.15 * sin(iTime * speed * 4.0)) : 1.0;

  float baseStrength = clamp(
    (0.5 + 0.2 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed * 0.8)),
    0.0, 1.0
  );

  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}

void main() {
  vec2 coord = gl_FragCoord.xy;

  vec2 finalRayDir = normalize(rayDir);
  if (mouseInfluence > 0.0) {
    vec2 mouseScreenPos = mousePos * iResolution.xy;
    vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
    finalRayDir = normalize(mix(finalRayDir, mouseDirection, mouseInfluence));
  }

  float r1 = rayStrength(rayPos, finalRayDir, coord, 45.2, 31.4, 0.8 * raysSpeed);
  float r2 = rayStrength(rayPos, finalRayDir, coord, 28.5, 19.8, 1.2 * raysSpeed);
  float r3 = rayStrength(rayPos, finalRayDir, coord, 12.1, 56.2, 0.5 * raysSpeed);

  float combined = (r1 * 0.4 + r2 * 0.4 + r3 * 0.2);
  combined = pow(combined, 0.7);
  combined *= 1.5;
  vec3 finalColor = raysColor * combined;

  if (noiseAmount > 0.0) {
    float n = noise(coord * 0.01 + iTime * 0.05);
    finalColor *= (1.0 - noiseAmount + noiseAmount * n);
  }

  if (saturation != 1.0) {
    float gray = dot(finalColor, vec3(0.299, 0.587, 0.114));
    finalColor = mix(vec3(gray), finalColor, saturation);
  }

  gl_FragColor = vec4(finalColor, combined);
}
`

/** Só liga o efeito onde ele compensa: ponteiro fino, tela grande, sem reduced-motion. */
function podeRodar(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (window.matchMedia('(pointer: coarse)').matches) return false
  return window.innerWidth >= 1024
}

export function LightRays({
  raysOrigin = 'top-center',
  raysColor = '#00b3ff',
  raysSpeed = 1,
  lightSpread = 1,
  rayLength = 2,
  pulsating = false,
  fadeDistance = 1.0,
  saturation = 1.0,
  followMouse = true,
  mouseInfluence = 0.1,
  noiseAmount = 0.0,
  distortion = 0.0,
  className = '',
}: LightRaysProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const uniformsRef  = useRef<Uniforms | null>(null)
  const mouseRef     = useRef({ x: 0.5, y: 0.5 })
  const smoothMouse  = useRef({ x: 0.5, y: 0.5 })

  const [ativo, setAtivo]   = useState(false)   // ambiente permite rodar
  const [visivel, setVisivel] = useState(false) // está na viewport

  // Decide uma vez, no cliente, se vale ligar o WebGL.
  useEffect(() => setAtivo(podeRodar()), [])

  // Pausa quando sai da tela — sem isso a GPU fica desenhando o hero
  // enquanto o usuário lê o rodapé.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => setVisivel(e.isIntersecting), { threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Criação do contexto WebGL. Roda uma vez por ciclo de visibilidade —
  // as props entram por uniforms, no efeito seguinte.
  useEffect(() => {
    const container = containerRef.current
    if (!ativo || !visivel || !container) return

    let cancelado = false
    let rafId: number | null = null
    let renderer: Renderer | null = null
    let resizeObs: ResizeObserver | null = null

    // O original esperava 10ms antes de montar e registrava o cleanup só
    // depois — se o componente desmontasse nesse meio-tempo, o canvas e o
    // contexto ficavam órfãos. A flag `cancelado` fecha essa janela.
    const timer = setTimeout(() => {
      if (cancelado || !containerRef.current) return

      renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), alpha: true })
      const gl = renderer.gl
      gl.canvas.style.width = '100%'
      gl.canvas.style.height = '100%'
      gl.canvas.style.display = 'block'
      container.replaceChildren(gl.canvas)

      const uniforms: Uniforms = {
        iTime:          { value: 0 },
        iResolution:    { value: [1, 1] },
        rayPos:         { value: [0, 0] },
        rayDir:         { value: [0, 1] },
        raysColor:      { value: hexToRgb(raysColor) },
        raysSpeed:      { value: raysSpeed },
        lightSpread:    { value: lightSpread },
        rayLength:      { value: rayLength },
        pulsating:      { value: pulsating ? 1 : 0 },
        fadeDistance:   { value: fadeDistance },
        saturation:     { value: saturation },
        mousePos:       { value: [0.5, 0.5] },
        mouseInfluence: { value: mouseInfluence },
        noiseAmount:    { value: noiseAmount },
        distortion:     { value: distortion },
      }
      uniformsRef.current = uniforms

      const mesh = new Mesh(gl, {
        geometry: new Triangle(gl),
        program: new Program(gl, { vertex: VERT, fragment: FRAG, uniforms, transparent: true }),
      })

      const reposicionar = () => {
        if (!renderer || !containerRef.current) return
        const { clientWidth: wCSS, clientHeight: hCSS } = containerRef.current
        if (wCSS === 0 || hCSS === 0) return
        renderer.setSize(wCSS, hCSS)
        const w = wCSS * renderer.dpr
        const h = hCSS * renderer.dpr
        uniforms.iResolution.value = [w, h]
        const { anchor, dir } = getAnchorAndDir(raysOrigin, w, h)
        uniforms.rayPos.value = anchor
        uniforms.rayDir.value = dir
      }

      const loop = (t: number) => {
        if (cancelado || !renderer) return
        uniforms.iTime.value = t * 0.001
        if (followMouse && mouseInfluence > 0) {
          const s = 0.95
          smoothMouse.current.x = smoothMouse.current.x * s + mouseRef.current.x * (1 - s)
          smoothMouse.current.y = smoothMouse.current.y * s + mouseRef.current.y * (1 - s)
          uniforms.mousePos.value = [smoothMouse.current.x, 1 - smoothMouse.current.y]
        }
        renderer.render({ scene: mesh })
        rafId = requestAnimationFrame(loop)
      }

      // ResizeObserver pega mudança de altura do container, não só da janela.
      resizeObs = new ResizeObserver(reposicionar)
      resizeObs.observe(container)
      reposicionar()
      rafId = requestAnimationFrame(loop)
    }, 10)

    return () => {
      cancelado = true
      clearTimeout(timer)
      if (rafId != null) cancelAnimationFrame(rafId)
      resizeObs?.disconnect()
      uniformsRef.current = null
      if (renderer) {
        // Sem isto o navegador acumula contextos e derruba os mais antigos.
        renderer.gl.getExtension('WEBGL_lose_context')?.loseContext()
        renderer.gl.canvas.parentNode?.removeChild(renderer.gl.canvas)
      }
    }
  }, [ativo, visivel, raysOrigin, followMouse])

  // Mudança de prop atualiza uniform, sem reconstruir o contexto.
  useEffect(() => {
    const u = uniformsRef.current
    if (!u) return
    u.raysColor.value      = hexToRgb(raysColor)
    u.raysSpeed.value      = raysSpeed
    u.lightSpread.value    = lightSpread
    u.rayLength.value      = rayLength
    u.pulsating.value      = pulsating ? 1 : 0
    u.fadeDistance.value   = fadeDistance
    u.saturation.value     = saturation
    u.mouseInfluence.value = mouseInfluence
    u.noiseAmount.value    = noiseAmount
    u.distortion.value     = distortion
  }, [raysColor, raysSpeed, lightSpread, rayLength, pulsating, fadeDistance, saturation, mouseInfluence, noiseAmount, distortion])

  // Mouse só é escutado enquanto o efeito está de fato desenhando.
  useEffect(() => {
    if (!ativo || !visivel || !followMouse) return
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      }
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [ativo, visivel, followMouse])

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    />
  )
}

export default LightRays
