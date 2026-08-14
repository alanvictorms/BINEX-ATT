import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const regulamentoDeBonus: LegalDoc = {
  slug: 'regulamento-de-bonus',
  title: 'Regulamento de Bônus e Promoções',
  short: 'Regulamento de Bônus',
  summary:
    `Como funcionam os bônus de depósito da ${EMPRESA.marca}: concessão, rollover, teto, saque e cancelamento.`,
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'alert',
      text: 'Bônus não é dinheiro livre. Ao aceitar um bônus, o saque do seu saldo fica condicionado ao cumprimento de um volume de negociação (rollover). Leia antes de aceitar.',
    },
    {
      t: 'p',
      text: `Bônus são liberalidades da ${EMPRESA.curta}, concedidas a critério dela e sujeitas a este Regulamento, que integra os Termos de Uso.`,
    },
  ],
  sections: [
    {
      id: 'como-funciona',
      title: '1. Como o bônus é concedido',
      blocks: [
        {
          t: 'p',
          text: 'O bônus de depósito é um percentual aplicado sobre o valor depositado e creditado no saldo da conta real. Os percentuais podem ser escalonados — isto é, diferentes para o primeiro, o segundo e o terceiro depósito.',
        },
        {
          t: 'p',
          text: 'Os valores vigentes — percentual de cada degrau, depósito mínimo que ativa a oferta, valor máximo de bônus por depósito e multiplicador de rollover — são exibidos na tela da oferta e na tela de depósito antes da confirmação. É o que está exibido ali que vale para aquele depósito.',
        },
        {
          t: 'p',
          text: 'O bônus é creditado automaticamente após a confirmação do depósito, desde que o valor atinja o mínimo da oferta e o degrau ainda esteja disponível para a conta.',
        },
      ],
    },
    {
      id: 'rollover',
      title: '2. Rollover — a condição para sacar',
      blocks: [
        {
          t: 'p',
          text: 'Rollover é o volume total de negociação que precisa ser executado antes de liberar o saque. Ele é calculado multiplicando o valor do bônus concedido pelo multiplicador vigente.',
        },
        {
          t: 'table',
          head: ['Exemplo', 'Valor'],
          rows: [
            ['Depósito', 'R$ 100,00'],
            ['Bônus concedido (200%)', 'R$ 200,00'],
            ['Multiplicador de rollover', '20×'],
            ['Volume a negociar para liberar saque', 'R$ 4.000,00'],
          ],
        },
        {
          t: 'p',
          text: 'O volume é somado pelo valor investido em cada operação encerrada na conta real, independentemente do resultado. Operações em conta demo não contam. O progresso do rollover é visível na área da conta.',
        },
        {
          t: 'alert',
          text: 'Enquanto o rollover não é cumprido, o saque fica bloqueado — inclusive sobre o valor que você depositou. Se você não quer essa restrição, recuse o bônus.',
        },
      ],
    },
    {
      id: 'teto',
      title: '3. Teto e limites',
      blocks: [
        {
          t: 'ul',
          items: [
            'Há um valor máximo de bônus por depósito, exibido na oferta. Depósitos maiores recebem o bônus limitado a esse teto.',
            'Cada degrau da escada pode ser usado uma única vez por conta.',
            'O bônus é pessoal e intransferível, vinculado ao titular da conta.',
            'Bônus não podem ser acumulados com outras promoções, salvo indicação expressa.',
          ],
        },
      ],
    },
    {
      id: 'recusa',
      title: '4. Recusar ou cancelar o bônus',
      blocks: [
        {
          t: 'p',
          text: 'Você pode não aceitar a oferta — basta depositar sem ativá-la, e nenhuma restrição de saque é aplicada.',
        },
        {
          t: 'p',
          text: `Se o bônus já foi creditado e você quiser cancelá-lo antes de cumprir o rollover, solicite por ${EMPRESA.emails.suporte}. O valor do bônus e os ganhos proporcionais a ele são removidos do saldo, e a restrição de saque é liberada sobre o valor remanescente.`,
        },
      ],
    },
    {
      id: 'abuso',
      title: '5. Uso abusivo',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.curta} pode cancelar bônus, anular lucros dele decorrentes e encerrar a conta quando identificar, entre outras condutas:`,
        },
        {
          t: 'ul',
          items: [
            'Múltiplas contas do mesmo titular, ou contas coordenadas, para capturar a oferta mais de uma vez;',
            'Operações simultâneas em direções opostas com o objetivo de cumprir rollover sem assumir risco;',
            'Uso de automação não autorizada;',
            'Dados de cadastro falsos ou meio de pagamento de terceiro;',
            'Qualquer prática que esvazie a finalidade do rollover.',
          ],
        },
        {
          t: 'p',
          text: 'Nesses casos, o valor efetivamente depositado pelo Cliente é preservado e devolvido, descontados custos comprovados; apenas o bônus e os ganhos a ele atribuíveis são anulados.',
        },
      ],
    },
    {
      id: 'alteracoes',
      title: '6. Alterações e encerramento das ofertas',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.curta} pode alterar percentuais, tetos, multiplicadores, prazos ou encerrar qualquer promoção a qualquer momento. Alterações não retroagem: bônus já concedidos seguem as condições vigentes na data da concessão.`,
        },
      ],
    },
    {
      id: 'contato',
      title: '7. Dúvidas',
      blocks: [
        {
          t: 'p',
          text: `Antes de aceitar um bônus, se algo não estiver claro, pergunte: ${EMPRESA.emails.suporte}.`,
        },
      ],
    },
  ],
}
