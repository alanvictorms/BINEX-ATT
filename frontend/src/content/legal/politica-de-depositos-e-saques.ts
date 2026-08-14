import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const politicaDeDepositosESaques: LegalDoc = {
  slug: 'politica-de-depositos-e-saques',
  title: 'Política de Depósitos e Saques',
  short: 'Depósitos e Saques',
  summary:
    `Métodos aceitos, prazos, limites, verificação exigida e regras de devolução para movimentações financeiras na ${EMPRESA.marca}.`,
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'p',
      text: 'Esta Política descreve como entram e saem recursos da sua conta. Ela integra os Termos de Uso.',
    },
    {
      t: 'alert',
      text: 'Regra central: só aceitamos e devolvemos recursos em nome do próprio titular da conta. Depósito ou saque em nome de terceiro é recusado.',
    },
  ],
  sections: [
    {
      id: 'metodos',
      title: '1. Métodos aceitos',
      blocks: [
        {
          t: 'table',
          head: ['Método', 'Depósito', 'Saque', 'Confirmação típica'],
          rows: [
            ['Pix', 'Sim', 'Sim', 'Automática, poucos minutos'],
            ['USDT (criptomoeda)', 'Sim', 'Conforme disponibilidade', 'Após confirmações na rede'],
          ],
        },
        {
          t: 'p',
          text: `As transações são processadas por ${EMPRESA.gateway}, provedor de pagamentos contratado. Métodos disponíveis, limites e custos podem mudar; o que vale é o exibido na tela no momento da operação.`,
        },
      ],
    },
    {
      id: 'deposito',
      title: '2. Depósitos',
      blocks: [
        {
          t: 'ul',
          items: [
            `O valor mínimo e máximo por depósito é exibido na tela de depósito e pode ser alterado pela ${EMPRESA.curta}.`,
            'O crédito é feito automaticamente após a confirmação do pagamento pelo processador.',
            'A conta é denominada em reais (BRL). Depósitos em cripto são convertidos pela cotação aplicada pelo processador no momento da liquidação.',
            `A ${EMPRESA.curta} não cobra taxa própria de depósito. Custos de rede (blockchain) ou do seu banco são de sua responsabilidade.`,
          ],
        },
        {
          t: 'alert',
          text: `Pague sempre pelo QR Code ou código gerado na plataforma, dentro do prazo de validade. Pagamento feito para chave enviada por terceiro, grupo de mensagens ou pessoa que se diz representante da ${EMPRESA.curta} é golpe e não será creditado.`,
        },
        {
          t: 'p',
          text: 'Se o pagamento foi debitado e não creditou em até 1 hora, abra um chamado com o comprovante e o identificador da transação.',
        },
      ],
    },
    {
      id: 'saque',
      title: '3. Saques',
      blocks: [
        {
          t: 'p',
          text: 'A solicitação de saque é feita na área da conta. Para ser processada, é preciso que:',
        },
        {
          t: 'ul',
          items: [
            'A verificação de identidade (KYC) esteja concluída e aprovada;',
            'A chave Pix ou carteira informada pertença ao titular da conta;',
            'Não exista bônus ativo com rollover pendente (ver Regulamento de Bônus);',
            'O valor esteja dentro dos limites mínimo e máximo vigentes;',
            'Não haja apuração de fraude, disputa ou requisição de autoridade em curso sobre a conta.',
          ],
        },
        {
          t: 'p',
          text: 'Solicitações passam por conferência antes do pagamento. O prazo usual de análise é de até 1 dia útil; casos que exijam verificação adicional podem levar até 5 dias úteis. Após a aprovação, a liquidação por Pix costuma ocorrer em minutos.',
        },
        {
          t: 'p',
          text: 'Saques recusados têm o valor devolvido ao saldo da conta, com informação do motivo.',
        },
      ],
    },
    {
      id: 'origem',
      title: '4. Devolução pelo mesmo caminho',
      blocks: [
        {
          t: 'p',
          text: `Como medida de prevenção à lavagem de dinheiro, a ${EMPRESA.curta} pode exigir que o saque seja feito para o mesmo meio de pagamento e titularidade usados no depósito, até o limite do valor depositado. Lucros acima disso são pagos ao titular pelo método disponível.`,
        },
      ],
    },
    {
      id: 'kyc',
      title: '5. Verificação de identidade',
      blocks: [
        {
          t: 'p',
          text: 'A verificação pode ser exigida a qualquer momento, e é sempre exigida antes do primeiro saque. Podem ser solicitados documento oficial com foto, selfie, comprovante de endereço e comprovação de origem de recursos.',
        },
        {
          t: 'p',
          text: 'Enquanto a verificação estiver pendente ou reprovada, saques ficam bloqueados. Documentos ilegíveis, vencidos ou de terceiro são recusados.',
        },
      ],
    },
    {
      id: 'inatividade',
      title: '6. Contas inativas e saldos residuais',
      blocks: [
        {
          t: 'p',
          text: 'Contas sem qualquer login ou operação por período prolongado podem ser suspensas por segurança. O saldo permanece do Cliente e é devolvido mediante solicitação e verificação de identidade.',
        },
      ],
    },
    {
      id: 'disputas',
      title: '7. Estornos e contestações',
      blocks: [
        {
          t: 'p',
          text: `Abrir contestação junto ao banco ou ao provedor de pagamento sem antes acionar o suporte da ${EMPRESA.curta} pode resultar em suspensão da conta enquanto a disputa corre, e em cobrança dos custos gerados quando a contestação for indevida.`,
        },
        {
          t: 'p',
          text: 'Perda decorrente de operação malsucedida não é erro de processamento e não é motivo válido de estorno — é o risco do produto, descrito no Aviso de Risco.',
        },
      ],
    },
    {
      id: 'tributos',
      title: '8. Tributos',
      blocks: [
        {
          t: 'p',
          text: `A apuração e o recolhimento de tributos incidentes sobre eventuais ganhos são de responsabilidade exclusiva do Cliente, conforme a legislação do seu país de residência. A ${EMPRESA.curta} não retém tributos na fonte nem presta consultoria tributária.`,
        },
      ],
    },
    {
      id: 'contato',
      title: '9. Contato',
      blocks: [
        {
          t: 'p',
          text: `Problemas com depósito ou saque: ${EMPRESA.emails.suporte}. Tenha em mãos data, valor e identificador da transação.`,
        },
      ],
    },
  ],
}
