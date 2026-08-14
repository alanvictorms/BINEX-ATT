import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Área logada e endpoints não têm o que indexar — e /admin não deve
      // sequer aparecer em busca.
      disallow: ['/trade', '/admin', '/api', '/login', '/register', '/reset-password', '/forgot-password'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
