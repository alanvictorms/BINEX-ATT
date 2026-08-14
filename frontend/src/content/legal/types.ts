/**
 * Formato dos documentos jurídicos.
 *
 * Escolha deliberada: conteúdo em TypeScript, não MDX. Evita adicionar toda a
 * pipeline de MDX ao build por causa de 11 páginas de texto, mantém tipagem, e
 * o texto continua sendo string simples de editar. Se um dia virar dezenas de
 * documentos com formatação rica, aí vale trocar por MDX.
 */

export type LegalBlock =
  /** Parágrafo comum. */
  | { t: 'p'; text: string }
  /** Lista de itens. */
  | { t: 'ul'; items: string[] }
  /** Destaque — usado para avisos que não podem passar despercebidos. */
  | { t: 'alert'; text: string }
  /** Tabela simples (cabeçalho + linhas). */
  | { t: 'table'; head: string[]; rows: string[][] }

export interface LegalSection {
  /** Âncora da seção (usada no índice lateral e no link direto). */
  id: string
  title: string
  blocks: LegalBlock[]
}

export interface LegalDoc {
  slug: string
  /** Título completo, usado como H1 e no <title>. */
  title: string
  /** Rótulo curto para menus e rodapé. */
  short: string
  /** Uma linha explicando do que trata — vira <meta description>. */
  summary: string
  /** Data da última revisão (ISO). */
  updatedAt: string
  /** Parágrafos de abertura, antes da primeira seção. */
  intro: LegalBlock[]
  sections: LegalSection[]
}
