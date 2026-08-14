import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const execucaoEConflitoDeInteresse: LegalDoc = {
  slug: 'execucao-e-conflito-de-interesse',
  title: 'Política de Execução de Ordens e Conflito de Interesse',
  short: 'Execução e Conflito de Interesse',
  summary:
    `Como as ordens são executadas e apuradas na ${EMPRESA.marca}, e como tratamos o conflito de interesse de atuar como contraparte em ativos OTC.`,
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'p',
      text: `Este documento existe para ser franco sobre um ponto que muitas plataformas escondem: em parte dos ativos oferecidos, a ${EMPRESA.curta} é a contraparte da sua operação. Aqui explicamos o que isso significa, como as ordens são executadas e quais limites nos impusemos.`,
    },
  ],
  sections: [
    {
      id: 'modelo',
      title: '1. Modelo de negócio',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.marca} não é bolsa nem intermediária que encaminha ordens a um mercado organizado. As operações são celebradas diretamente entre o Cliente e ${EMPRESA.entidade}.`,
        },
        {
          t: 'alert',
          text: `Consequência direta: o que o Cliente perde fica com a ${EMPRESA.curta}, e o que o Cliente ganha sai do caixa da ${EMPRESA.curta}. Nossos interesses financeiros e os seus são opostos em cada operação individual.`,
        },
      ],
    },
    {
      id: 'precos',
      title: '2. Formação de preço',
      blocks: [
        {
          t: 'p',
          text: 'Cada ativo é identificado na plataforma como LIVE ou OTC.',
        },
        {
          t: 'ul',
          items: [
            `LIVE — o preço é derivado de provedores externos de dados de mercado. A ${EMPRESA.curta} não define esse preço; apenas o recebe, normaliza e exibe. Pode haver atraso ou interrupção por falha do provedor.`,
            `OTC — o preço é gerado por modelo algorítmico da própria ${EMPRESA.curta}. É um preço sintético: não corresponde a um mercado real e existe apenas dentro da plataforma. Por isso os ativos OTC ficam disponíveis inclusive fora do horário dos mercados tradicionais.`,
          ],
        },
      ],
    },
    {
      id: 'execucao',
      title: '3. Execução e apuração',
      blocks: [
        {
          t: 'ul',
          items: [
            `O preço de entrada é o preço apurado pelo servidor da ${EMPRESA.curta} no instante em que a ordem é recebida — não o preço desenhado na tela do Cliente, que pode estar alguns instantes atrás por latência de rede.`,
            'O resultado é apurado exclusivamente pelo servidor, comparando o preço de entrada com o preço no instante da expiração.',
            'O payout aplicado é o exibido no momento da confirmação da ordem. Alterações posteriores de payout não afetam operações já abertas.',
            'Empate (preço de expiração idêntico ao de entrada) devolve o valor investido, sem ganho nem perda.',
          ],
        },
        {
          t: 'p',
          text: 'Em caso de divergência entre o que foi exibido no dispositivo do Cliente e o registro do servidor, prevalece o registro do servidor. O extrato da conta reflete esse registro.',
        },
      ],
    },
    {
      id: 'controles',
      title: '4. Controles sobre o conflito',
      blocks: [
        {
          t: 'p',
          text: 'Reconhecido o conflito, adotamos os seguintes controles:',
        },
        {
          t: 'ul',
          items: [
            'Parâmetros de ativo OTC (tendência e preço de referência) não podem ser alterados enquanto houver operação aberta naquele ativo — a trava é aplicada no banco de dados, não apenas na interface;',
            'A apuração de resultado é feita pelo servidor a partir da série de preços registrada, sem intervenção manual por operação;',
            'Alterações administrativas sensíveis ficam registradas em log de auditoria, com identificação de autor e horário;',
            'O acesso administrativo exige autenticação em dois fatores;',
            'O payout de cada ativo é exibido ao Cliente antes da confirmação da ordem.',
          ],
        },
        {
          t: 'alert',
          text: `Estes controles reduzem o risco de manipulação de operações já abertas, mas não eliminam o conflito estrutural: a ${EMPRESA.curta} continua definindo o preço sintético dos ativos OTC e os percentuais de payout. Quem não aceita esse arranjo não deve operar ativos OTC.`,
        },
      ],
    },
    {
      id: 'gestao-risco',
      title: '5. Gestão de risco e limites',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.curta} acompanha sua exposição agregada por ativo e direção. Para gerir esse risco, pode alterar payouts, ajustar limites de valor por operação, limitar a exposição total em um ativo ou suspender temporariamente a negociação de um ativo.`,
        },
        {
          t: 'p',
          text: 'Essas medidas são aplicadas de forma geral aos parâmetros do ativo, e não como decisão caso a caso sobre a operação de um Cliente identificado.',
        },
      ],
    },
    {
      id: 'anulacao',
      title: '6. Quando uma operação pode ser anulada',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.curta} pode anular operação e reverter o resultado ao estado anterior nos casos de: erro manifesto de preço, falha comprovada do provedor de dados, defeito de software, uso de automação não autorizada ou exploração deliberada de falha.`,
        },
        {
          t: 'p',
          text: `A anulação é comunicada ao Cliente com o motivo. Discordando, o Cliente pode acionar a Política de Reclamações.`,
        },
      ],
    },
    {
      id: 'copy',
      title: '7. Copy trading e operações de terceiros',
      blocks: [
        {
          t: 'p',
          text: `Recursos que replicam operações de outros usuários não constituem recomendação, gestão de carteira ou consultoria da ${EMPRESA.curta}. O Cliente que copia assume integralmente o risco das decisões copiadas, e a ${EMPRESA.curta} não garante o desempenho de nenhum operador.`,
        },
      ],
    },
    {
      id: 'contato',
      title: '8. Contato',
      blocks: [
        {
          t: 'p',
          text: `Dúvidas sobre execução de uma operação específica: ${EMPRESA.emails.suporte}, informando data, horário, ativo e valor.`,
        },
      ],
    },
  ],
}
