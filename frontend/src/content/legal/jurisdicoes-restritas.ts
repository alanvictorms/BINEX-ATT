import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const jurisdicoesRestritas: LegalDoc = {
  slug: 'jurisdicoes-restritas',
  title: 'Jurisdições Restritas',
  short: 'Jurisdições Restritas',
  summary:
    `Países e territórios cujos residentes não podem abrir conta na ${EMPRESA.marca}, e responsabilidade do Cliente quanto à legalidade local.`,
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'p',
      text: `A ${EMPRESA.curta} não oferece seus serviços em todos os países. Esta página lista as restrições e explica de quem é a responsabilidade de verificar a legalidade local.`,
    },
  ],
  sections: [
    {
      id: 'restritas',
      title: '1. Onde não abrimos conta',
      blocks: [
        {
          t: 'p',
          text: 'Não aceitamos clientes que sejam residentes, nacionais ou estejam localizados em:',
        },
        {
          t: 'ul',
          items: [
            'Territórios submetidos a sanções econômicas abrangentes (incluindo, entre outros, Coreia do Norte, Irã, Síria, Cuba, e as regiões da Crimeia, Donetsk e Luhansk);',
            'Jurisdições classificadas como de alto risco para lavagem de dinheiro por organismos internacionais (lista GAFI/FATF de países sob call for action);',
            'Estados Unidos da América e seus territórios;',
            'Canadá, Reino Unido, Israel, Bélgica, Austrália e Estados-Membros do Espaço Econômico Europeu, onde a oferta de opções binárias ao público de varejo é vedada ou restrita por regulação local;',
            'Qualquer país cuja legislação proíba a oferta ou a contratação deste tipo de produto.',
          ],
        },
        {
          t: 'p',
          text: 'A lista pode ser atualizada sem aviso prévio, para acompanhar mudanças em sanções e regulação. A versão vigente é sempre a publicada nesta página.',
        },
      ],
    },
    {
      id: 'responsabilidade',
      title: '2. Responsabilidade do Cliente',
      blocks: [
        {
          t: 'p',
          text: 'O tratamento regulatório de opções digitais varia entre países. Cabe exclusivamente ao Cliente verificar, antes de abrir conta, se a contratação deste produto é permitida no seu país de residência e quais são as consequências legais e tributárias.',
        },
        {
          t: 'alert',
          text: 'A disponibilidade do site ou da plataforma no seu país não constitui oferta, promoção ou declaração de que o produto é permitido, autorizado ou supervisionado ali.',
        },
      ],
    },
    {
      id: 'verificacao',
      title: '3. Como verificamos',
      blocks: [
        {
          t: 'p',
          text: 'Usamos país declarado no cadastro, documentos apresentados na verificação de identidade e indicadores técnicos de localização. Detectada residência em jurisdição restrita, a conta é bloqueada para novas operações e depósitos.',
        },
        {
          t: 'p',
          text: 'Nesse caso, o saldo remanescente é devolvido ao titular após verificação de identidade, descontadas operações já liquidadas. Lucros obtidos mediante declaração falsa de residência podem ser anulados.',
        },
        {
          t: 'p',
          text: 'Usar VPN, proxy ou dados falsos para contornar essas restrições é violação dos Termos de Uso e motivo de encerramento imediato da conta.',
        },
      ],
    },
    {
      id: 'contato',
      title: '4. Dúvidas',
      blocks: [
        {
          t: 'p',
          text: `Para confirmar se seu país é atendido antes de se cadastrar: ${EMPRESA.emails.compliance}.`,
        },
      ],
    },
  ],
}
