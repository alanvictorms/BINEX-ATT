import type { MetadataRoute } from 'next'
import { LEGAL_DOCS } from '@/content/legal'
import { LEGAL_ATUALIZADO_EM } from '@/content/legal/empresa'
import { SITE_URL } from '@/lib/site'

/** Só páginas públicas entram. Plataforma, login e admin ficam de fora. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`,      changeFrequency: 'weekly',  priority: 1 },
    { url: `${SITE_URL}/legal`, changeFrequency: 'monthly', priority: 0.5 },
    ...LEGAL_DOCS.map(doc => ({
      url: `${SITE_URL}/legal/${doc.slug}`,
      lastModified: new Date(doc.updatedAt || LEGAL_ATUALIZADO_EM),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]
}
