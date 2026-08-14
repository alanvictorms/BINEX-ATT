'use client'

import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body>
        {/* NextError é a página de erro padrão do Next.js. O App Router não
            expõe status code para erros, então passamos 0 (mensagem genérica). */}
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
