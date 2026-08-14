import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Envia IP e headers do usuário (ajuda no suporte: identificar quem teve o erro)
  sendDefaultPii: true,

  // Performance: 100% em dev, 10% em produção. Ajustar conforme volume de tráfego.
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

  // Só envia em produção e com DSN configurado. O `npm run dev` na máquina do
  // dev tem o mesmo DSN do .env.local e estava disparando alerta de verdade a
  // cada erro de hot-reload — alerta que ninguém confia é pior que nenhum.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) && process.env.NODE_ENV !== 'development',
})

// Instrumenta navegações do router (App Router)
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
