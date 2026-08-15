'use client'

/**
 * Loader da marca Vértice.
 *
 * O símbolo entra como máscara CSS e o preenchimento sobe por dentro dele, em
 * vez de ser um SVG animado por stroke-dasharray como era antes. Duas
 * vantagens: o desenho fica idêntico ao logo real (mesma geometria do
 * verticebroker-icon.svg) e a animação anima só `transform`, que roda na
 * composição — não força layout nem repaint enquanto o gráfico carrega.
 */

const CSS = `
.vbl{
  --vbl-c:#2E6BE5;
  --vbl-s:96px;
  --vbl-t:1.8s;
  --vbl-track:rgba(46,107,229,.18);
  --vbl-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 43.55 53.84'%3E%3Cpolygon points='35.73,8.8 40.36,8.84 40.38,45.62 15.92,45.68 15.86,48.82 43.46,48.85 43.55,5.67 35.75,5.66'/%3E%3Cpath d='M0.18 48.85l6.6 -0.01 0.05 -3.13 -3.58 -0.05 -0.01 -36.82 22.7 -0.02 0.02 -3.16 -25.86 -0.01c-0.06,1.76 -0.24,41.82 0.08,43.2z'/%3E%3Cpath d='M27.96 2.21c-0.21,9.41 -0.03,20.99 -0.02,30.62l0.02 1.54c0.87,-0.23 3.92,-1.73 5.3,-2.3 1.08,-0.45 0.8,-0.55 0.8,-1.83l-0.01 -30.25 -6.09 2.21z'/%3E%3Cpath d='M8.3 23.27l0.03 30.57c1.05,-0.22 5.02,-2.65 6.27,-3.23l0.04 -30.05 -6.34 2.7z'/%3E%3Cpath d='M18.44 14.8l0 23.22 0 0.77c0.79,-0.15 5.63,-2.25 6.26,-2.67l0.08 -1.56 -0.01 -22.89 -6.33 3.12z'/%3E%3C/svg%3E");
  position:relative; display:inline-block; overflow:hidden;
  width:var(--vbl-s); height:calc(var(--vbl-s) * 1.2363);
  -webkit-mask:var(--vbl-mask) center / contain no-repeat;
          mask:var(--vbl-mask) center / contain no-repeat;
}
.vbl::before,.vbl::after{content:'';position:absolute}
.vbl::before{inset:0;background:var(--vbl-track)}
.vbl::after{
  left:0;right:0;height:100%;
  background:linear-gradient(180deg,var(--vbl-c) 0%,var(--vbl-c) 45%,transparent 100%);
  animation:vbl-rise var(--vbl-t) cubic-bezier(.45,0,.55,1) infinite;
}
@keyframes vbl-rise{0%{transform:translateY(105%)}100%{transform:translateY(-105%)}}
@media (prefers-reduced-motion:reduce){.vbl::after{animation:none;transform:none}}
`

interface ChartLoaderProps {
  /** Largura em px; a altura sai da proporção do símbolo (43.55 x 53.84). */
  size?: number
}

export function ChartLoader({ size }: ChartLoaderProps = {}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div
        className="vbl"
        role="status"
        aria-label="Carregando"
        style={size ? ({ ['--vbl-s' as string]: `${size}px` } as React.CSSProperties) : undefined}
      />
    </>
  )
}
