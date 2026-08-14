/**
 * Identificação da entidade que opera a marca.
 *
 * O nome da marca em si NÃO mora aqui — vem de lib/brand, que é a fonte única.
 *
 * Os campos abaixo estão em `null` porque a entidade ainda não foi definida.
 * Enquanto estiverem assim, nada aparece no site: o rodapé e os documentos
 * omitem as linhas de identificação e a prosa cai no nome da marca. Preencha
 * com string e o dado passa a aparecer sozinho em todos os 11 documentos, no
 * rodapé e na página /legal — este é o único arquivo a mudar.
 *
 * NÃO declare registro, licença ou autorização regulatória que a entidade não
 * tenha. Afirmar supervisão inexistente é o tipo de coisa que derruba gateway
 * de pagamento e vira responsabilidade pessoal.
 */

import { BRAND_FALLBACK, BRAND_SHORT, BRAND_DOMAIN } from '@/lib/brand'

interface DadosSocietarios {
  /** Razão social completa da entidade operadora. */
  razaoSocial: string | null
  /** CNPJ (Brasil) ou número de registro societário da jurisdição. */
  registro: string | null
  /** Endereço da sede, completo, como consta no registro. */
  endereco: string | null
  /** País/jurisdição de constituição da entidade. */
  jurisdicao: string | null
  /** Nome do Encarregado de Dados (DPO) exigido pela LGPD, art. 41. */
  dpoNome: string | null
}

// ⬇️ É AQUI que se preenche. Troque cada null pela string correspondente.
const DADOS: DadosSocietarios = {
  razaoSocial: null,
  registro: null,
  endereco: null,
  jurisdicao: null,
  dpoNome: null,
}

const { razaoSocial, registro, endereco, jurisdicao, dpoNome } = DADOS

// A marca vem de lib/brand — mesma fonte do header e dos e-mails. Documentos
// legais NÃO leem do painel /admin/site de propósito: contrato é texto
// versionado em git, não configuração que um clique altera.
const MARCA = BRAND_FALLBACK.fullName

export const EMPRESA = {
  marca: MARCA,

  /** Nome curto para a prosa dos documentos: "A ___ pode recusar a conta...". */
  curta: BRAND_SHORT,

  razaoSocial,
  registro,
  endereco,
  jurisdicao,

  /**
   * Nome a usar no corpo dos documentos. Enquanto a razão social não estiver
   * definida, a prosa fala em nome da marca — continua correta e não expõe
   * campo vazio.
   */
  entidade: razaoSocial ?? MARCA,

  site: BRAND_DOMAIN,

  emails: {
    suporte:     `suporte@${BRAND_DOMAIN}`,
    privacidade: `privacidade@${BRAND_DOMAIN}`,
    compliance:  `compliance@${BRAND_DOMAIN}`,
    juridico:    `juridico@${BRAND_DOMAIN}`,
    ouvidoria:   `ouvidoria@${BRAND_DOMAIN}`,
  },

  dpo: {
    nome: dpoNome,
    email: `privacidade@${BRAND_DOMAIN}`,
  },

  /** Processador de pagamentos usado hoje (Pix e USDT). */
  gateway: 'BSPay',

  /** Idade mínima para abrir conta. */
  idadeMinima: 18,
}

/**
 * Linhas de identificação societária para o rodapé e a página /legal.
 * Vem vazio enquanto os dados não existirem — quem consome faz `.map()` e
 * simplesmente não renderiza nada.
 */
export const IDENTIFICACAO_LINHAS: string[] = [
  razaoSocial && `${MARCA} é marca operada por ${razaoSocial}`,
  registro && `Registro: ${registro}`,
  endereco && `Sede: ${endereco}`,
].filter(Boolean) as string[]

/** Data de última revisão do conjunto de documentos (ISO). */
export const LEGAL_ATUALIZADO_EM = '2026-07-31'

/** Formata a data ISO no padrão brasileiro, sem depender de locale do runtime. */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
