import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const tradingResponsavel: LegalDoc = {
  slug: 'trading-responsavel',
  title: 'Trading Responsável',
  short: 'Trading Responsável',
  summary:
    `Sinais de comportamento de risco, ferramentas de autolimitação e como pedir pausa ou autoexclusão da ${EMPRESA.marca}.`,
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'p',
      text: 'Negociar de forma frequente e de curto prazo pode deixar de ser uma decisão financeira e virar um comportamento compulsivo. Esta página existe para você reconhecer isso cedo e ter como parar.',
    },
  ],
  sections: [
    {
      id: 'sinais',
      title: '1. Sinais de alerta',
      blocks: [
        {
          t: 'p',
          text: 'Se você se reconhece em dois ou mais itens abaixo, pare e reavalie:',
        },
        {
          t: 'ul',
          items: [
            'Aumentar o valor das operações para recuperar uma perda recente;',
            'Operar por mais tempo do que planejou, repetidamente;',
            'Depositar de novo logo após zerar o saldo;',
            'Usar dinheiro reservado para contas, aluguel, alimentação ou saúde;',
            'Usar crédito, empréstimo ou cartão para depositar;',
            'Esconder de família ou amigos quanto está operando ou perdendo;',
            'Sentir ansiedade, irritação ou insônia ligadas às operações;',
            'Deixar de cumprir obrigações de trabalho, estudo ou família por causa da plataforma;',
            'Pensar em operar como forma de resolver um problema financeiro.',
          ],
        },
        {
          t: 'alert',
          text: 'Tentar recuperar prejuízo aumentando o valor das entradas é o comportamento mais associado a perda grave. Se você está fazendo isso agora, o passo correto é parar hoje, não amanhã.',
        },
      ],
    },
    {
      id: 'praticas',
      title: '2. Práticas que reduzem risco',
      blocks: [
        {
          t: 'ul',
          items: [
            'Defina antes de começar quanto pode perder no dia — e encerre ao atingir o limite;',
            'Nunca aumente o valor da entrada depois de uma perda;',
            'Opere apenas com dinheiro que, perdido integralmente, não muda sua vida;',
            'Estabeleça horário e duração fixos, e respeite;',
            'Trate qualquer ganho como excepcional, não como renda esperada;',
            'Use a conta demo para testar ideias, sabendo que ela não reproduz a pressão do dinheiro real;',
            'Não opere sob efeito de álcool, sob estresse agudo ou privado de sono.',
          ],
        },
      ],
    },
    {
      id: 'ferramentas',
      title: '3. Pausa e autoexclusão',
      blocks: [
        {
          t: 'p',
          text: `Você pode solicitar, a qualquer momento, escrevendo para ${EMPRESA.emails.suporte} a partir do e-mail cadastrado:`,
        },
        {
          t: 'table',
          head: ['Medida', 'O que acontece'],
          rows: [
            ['Pausa temporária', 'Conta bloqueada para novas operações e novos depósitos pelo período escolhido (7, 30 ou 90 dias). O saldo permanece seu e pode ser sacado.'],
            ['Autoexclusão permanente', 'Conta encerrada em definitivo, com bloqueio de reabertura. O saldo é devolvido após verificação de identidade.'],
            ['Limite de depósito', 'Teto diário ou mensal de depósito aplicado à sua conta.'],
            ['Descadastro de marketing', 'Você deixa de receber comunicações promocionais.'],
          ],
        },
        {
          t: 'p',
          text: 'Pedidos de pausa e autoexclusão são aplicados sem cobrança e sem exigência de justificativa. Durante uma pausa ativa, não revertemos o bloqueio a pedido antes do prazo escolhido — é justamente esse o propósito da ferramenta.',
        },
      ],
    },
    {
      id: 'terceiros',
      title: '4. Se a preocupação é com outra pessoa',
      blocks: [
        {
          t: 'p',
          text: `Se você suspeita que alguém está usando sua conta, ou que um familiar está em situação de risco, escreva para ${EMPRESA.emails.suporte}. Podemos bloquear a conta preventivamente enquanto a situação é apurada.`,
        },
      ],
    },
    {
      id: 'ajuda',
      title: '5. Onde buscar ajuda',
      blocks: [
        {
          t: 'p',
          text: 'Compulsão por jogo e por negociação é condição de saúde e tem tratamento. No Brasil, procure um profissional de saúde mental, o CAPS da sua região, ou grupos de apoio como Jogadores Anônimos. Em situação de crise ou risco à vida, o CVV atende 24 horas pelo telefone 188, gratuitamente.',
        },
      ],
    },
    {
      id: 'menores',
      title: '6. Menores de idade',
      blocks: [
        {
          t: 'p',
          text: `A plataforma é restrita a maiores de ${EMPRESA.idadeMinima} anos. Se você compartilha dispositivo com menores, use bloqueio de tela, mantenha as credenciais protegidas e considere ferramentas de controle parental.`,
        },
      ],
    },
  ],
}
