import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: 'standalone',
  // nodemailer é CommonJS e abre socket TLS — empacotar junto quebra o build.
  serverExternalPackages: ['nodemailer'],
  typescript: { ignoreBuildErrors: true },
  eslint:     { ignoreDuringBuilds: true },
};

export default withSentryConfig(nextConfig, {
  org: "vertex-jq",
  project: "vertex-web",

  // Só loga upload de source maps em CI (evita ruído no build local)
  silent: !process.env.CI,

  // Token de upload de source maps (stack traces legíveis em produção).
  // Configurar como variável de ambiente no CI/CD, NUNCA commitar.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Sobe um conjunto maior de source maps para stack traces mais bonitas
  widenClientFileUpload: true,
});
