'use client'

const CSS = `
.bxl-draw{width:120px;height:auto;overflow:visible;}
.bxl-draw path{
  fill:#4a7cf2; stroke:#4a7cf2; stroke-width:1.4; stroke-linejoin:round;
  stroke-dasharray:1;
  animation:bxl-draw 6.00s cubic-bezier(.65,0,.35,1) infinite;
}
@keyframes bxl-draw{
  0%{stroke-dashoffset:1;fill-opacity:0}
  45%{stroke-dashoffset:0;fill-opacity:0}
  62%{fill-opacity:1}
  86%{fill-opacity:1;stroke-opacity:1}
  100%{fill-opacity:0;stroke-opacity:0}
}
@media (prefers-reduced-motion:reduce){
  .bxl::after,.bxl--pulse,.bxl-draw path{animation:none}
}
`

export function ChartLoader() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <svg className="bxl-draw" viewBox="0 0 70.6 75.79" role="status" aria-label="Carregando">
        <path pathLength="1" d="M25.44 27.67c4.86,-25.22 14.31,-27.7 -5.18,-27.63 -4.89,0.02 -9.82,-0.25 -14.67,0.35 -1.62,2.96 -7.01,18.9 -5.23,23.26 2.75,6.74 16.49,4.17 24.25,4.49 -3,14.83 -21.41,47.49 14.31,47.36 20.8,-0.08 19.16,3.76 24.3,-14.32 7.17,-25.2 13.08,-33.47 -2.2,-33.41l-35.59 -0.1z" />
      </svg>
    </>
  )
}
