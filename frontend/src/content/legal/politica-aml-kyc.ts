import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const politicaAmlKyc: LegalDoc = {
  slug: 'politica-aml-kyc',
  title: 'Política de Prevenção à Lavagem de Dinheiro e Conheça Seu Cliente (PLD/FT — AML/KYC)',
  short: 'AML / KYC',
  summary:
    `Como a ${EMPRESA.marca} identifica clientes, monitora transações e previne lavagem de dinheiro e financiamento ao terrorismo.`,
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'p',
      text: `${EMPRESA.entidade} adota controles para impedir que a plataforma seja usada para lavagem de dinheiro, financiamento ao terrorismo, evasão de sanções ou qualquer finalidade ilícita. Esta Política resume esses controles e o que se espera do Cliente.`,
    },
  ],
  sections: [
    {
      id: 'principios',
      title: '1. Princípios',
      blocks: [
        {
          t: 'ul',
          items: [
            'Abordagem baseada em risco: quanto maior o risco identificado, mais intensa a verificação;',
            'Identificação obrigatória antes de qualquer saque;',
            'Recusa de relacionamento quando a identidade ou a origem dos recursos não puder ser estabelecida;',
            'Sigilo da comunicação de operação suspeita — o Cliente não é informado de que foi objeto de comunicação a autoridade.',
          ],
        },
      ],
    },
    {
      id: 'kyc',
      title: '2. Identificação do Cliente (KYC)',
      blocks: [
        { t: 'p', text: 'Coletamos e verificamos, no mínimo:' },
        {
          t: 'ul',
          items: [
            'Nome completo, data de nascimento e nacionalidade;',
            'Documento oficial de identificação com foto, válido;',
            'Selfie para conferência de vivacidade e correspondência com o documento;',
            'CPF ou identificador fiscal equivalente;',
            'Comprovante de endereço recente, quando aplicável;',
            'País de residência.',
          ],
        },
        {
          t: 'p',
          text: `A ${EMPRESA.curta} é obrigada a manter esses registros por, no mínimo, 5 anos após o encerramento do relacionamento. Isso prevalece sobre pedidos de exclusão de dados — ver Política de Privacidade.`,
        },
      ],
    },
    {
      id: 'reforcada',
      title: '3. Diligência reforçada',
      blocks: [
        {
          t: 'p',
          text: 'Verificação adicional, incluindo comprovação documental de origem de recursos e de patrimônio, é exigida quando:',
        },
        {
          t: 'ul',
          items: [
            'Os valores movimentados forem incompatíveis com o perfil informado;',
            'O Cliente for pessoa exposta politicamente (PEP) ou pessoa próxima;',
            'Houver residência ou vínculo com jurisdição de alto risco;',
            'Houver indício de uso de conta por terceiro (conta laranja);',
            'A conta apresentar padrão de depósito e saque sem correspondência com atividade de negociação.',
          ],
        },
      ],
    },
    {
      id: 'monitoramento',
      title: '4. Monitoramento de transações',
      blocks: [
        {
          t: 'p',
          text: 'Depósitos, saques e operações são monitorados. Sinais de alerta incluem: fracionamento de valores, depósito seguido de saque imediato sem negociação relevante, múltiplas contas com o mesmo dispositivo ou meio de pagamento, operações coordenadas entre contas em direções opostas e uso de identificadores de pagamento de terceiros.',
        },
        {
          t: 'p',
          text: `Detectado alerta, a ${EMPRESA.curta} pode congelar a movimentação, solicitar esclarecimento documental, recusar a operação, encerrar a conta e comunicar a autoridade competente.`,
        },
      ],
    },
    {
      id: 'restricoes',
      title: '5. Restrições',
      blocks: [
        {
          t: 'p',
          text: 'Não abrimos nem mantemos conta para: pessoas em listas de sanções internacionais, pessoas sem identificação verificável, contas anônimas ou fictícias, e residentes de jurisdições restritas (ver Jurisdições Restritas).',
        },
        {
          t: 'p',
          text: 'Não aceitamos dinheiro em espécie, nem pagamento originado de conta de terceiro.',
        },
      ],
    },
    {
      id: 'deveres',
      title: '6. Deveres do Cliente',
      blocks: [
        {
          t: 'ul',
          items: [
            'Fornecer informação verdadeira e mantê-la atualizada;',
            'Operar exclusivamente com recursos próprios e de origem lícita;',
            'Não permitir que terceiros usem sua conta;',
            'Responder às solicitações de documentação nos prazos indicados.',
          ],
        },
        {
          t: 'p',
          text: 'A prestação de informação falsa é motivo de encerramento imediato da conta e pode caracterizar crime.',
        },
      ],
    },
    {
      id: 'governanca',
      title: '7. Governança e contato',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.curta} mantém registro auditável das ações administrativas sensíveis, controle de acesso por perfil e autenticação em dois fatores para operações críticas.`,
        },
        {
          t: 'p',
          text: `Comunicações relacionadas a esta Política: ${EMPRESA.emails.compliance}.`,
        },
      ],
    },
  ],
}
