import type { LegalDoc } from './types'
import { termosDeUso } from './termos-de-uso'
import { avisoDeRisco } from './aviso-de-risco'
import { politicaDePrivacidade } from './politica-de-privacidade'
import { politicaDeCookies } from './politica-de-cookies'
import { politicaAmlKyc } from './politica-aml-kyc'
import { politicaDeDepositosESaques } from './politica-de-depositos-e-saques'
import { regulamentoDeBonus } from './regulamento-de-bonus'
import { execucaoEConflitoDeInteresse } from './execucao-e-conflito-de-interesse'
import { politicaDeReclamacoes } from './politica-de-reclamacoes'
import { tradingResponsavel } from './trading-responsavel'
import { jurisdicoesRestritas } from './jurisdicoes-restritas'

export type { LegalDoc, LegalSection, LegalBlock } from './types'

/**
 * Ordem importa: é a ordem do índice em /legal e do rodapé.
 * Os documentos que o usuário mais precisa ler antes de depositar vêm primeiro.
 */
export const LEGAL_DOCS: LegalDoc[] = [
  avisoDeRisco,
  termosDeUso,
  politicaDePrivacidade,
  politicaDeCookies,
  politicaDeDepositosESaques,
  regulamentoDeBonus,
  execucaoEConflitoDeInteresse,
  politicaAmlKyc,
  tradingResponsavel,
  politicaDeReclamacoes,
  jurisdicoesRestritas,
]

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find(d => d.slug === slug)
}

export const LEGAL_SLUGS = LEGAL_DOCS.map(d => d.slug)
