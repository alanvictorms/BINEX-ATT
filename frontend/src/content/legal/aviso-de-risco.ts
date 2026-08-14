import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const avisoDeRisco: LegalDoc = {
  slug: 'aviso-de-risco',
  title: 'Aviso de Risco',
  short: 'Aviso de Risco',
  summary:
    'Divulgação dos riscos da negociação de opções digitais: perda total do capital, produto de resultado binário e natureza sintética dos ativos OTC.',
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'alert',
      text: 'A negociação de opções digitais envolve risco elevado e pode resultar na perda total do capital investido. Não invista dinheiro que você não pode perder integralmente.',
    },
    {
      t: 'p',
      text: 'Este documento existe para que você entenda, antes de depositar, o que está comprando. Leia até o fim. Ele integra os Termos de Uso.',
    },
  ],
  sections: [
    {
      id: 'natureza',
      title: '1. O que é o produto',
      blocks: [
        {
          t: 'p',
          text: 'Opção digital é um contrato de resultado binário e prazo fixo. Você prevê se o preço de um ativo estará acima ou abaixo do preço de entrada em um instante determinado. Só existem dois desfechos possíveis:',
        },
        {
          t: 'ul',
          items: [
            'Você acerta a direção: recebe o valor investido acrescido do payout anunciado.',
            'Você erra a direção: perde 100% do valor investido naquela operação.',
          ],
        },
        {
          t: 'p',
          text: 'Não existe posição parcialmente correta. Errar por um centésimo de ponto produz o mesmo resultado que errar por muito.',
        },
      ],
    },
    {
      id: 'matematica',
      title: '2. A matemática é assimétrica contra você',
      blocks: [
        {
          t: 'p',
          text: 'O payout é sempre inferior a 100%. Isso significa que você ganha menos quando acerta do que perde quando erra, e por isso acertar metade das operações não empata: dá prejuízo.',
        },
        {
          t: 'table',
          head: ['Payout', 'Taxa de acerto necessária só para empatar'],
          rows: [
            ['70%', '58,8%'],
            ['80%', '55,6%'],
            ['85%', '54,1%'],
            ['90%', '52,6%'],
          ],
        },
        {
          t: 'p',
          text: 'Qualquer taxa de acerto abaixo desses valores produz perda no longo prazo, com matemática certa. Para ter lucro consistente é preciso superar esse limiar de forma sustentada — o que a maioria dos participantes não consegue.',
        },
        {
          t: 'alert',
          text: 'A maioria das contas de varejo que negocia produtos alavancados de curto prazo perde dinheiro. Trate a possibilidade de perda como o cenário mais provável, não como exceção.',
        },
      ],
    },
    {
      id: 'otc',
      title: '3. Ativos OTC são sintéticos',
      blocks: [
        {
          t: 'p',
          text: `Os ativos marcados como OTC têm preço gerado por algoritmo da própria ${EMPRESA.curta}. Eles não são cotação de bolsa, não refletem mercado real e existem apenas dentro desta plataforma. É por isso que continuam disponíveis nos fins de semana e fora do horário dos mercados tradicionais.`,
        },
        {
          t: 'alert',
          text: `Em ativos OTC a ${EMPRESA.curta} é a contraparte da sua operação. O que você perde fica com a ${EMPRESA.curta}; o que você ganha sai do caixa da ${EMPRESA.curta}. Leia a Política de Execução e Conflito de Interesse para entender como esse conflito é tratado.`,
        },
        {
          t: 'p',
          text: 'Análise técnica, indicadores e padrões gráficos aplicados a ativos sintéticos descrevem uma série de preços gerada artificialmente — não um mercado com oferta e demanda reais.',
        },
      ],
    },
    {
      id: 'live',
      title: '4. Ativos LIVE dependem de terceiros',
      blocks: [
        {
          t: 'p',
          text: 'Ativos marcados como LIVE derivam o preço de provedores externos de dados de mercado. Esses provedores podem apresentar atraso, interrupção, dado inconsistente ou indisponibilidade, o que pode impedir a abertura de operações ou afetar a apuração.',
        },
        {
          t: 'p',
          text: 'Em mercados reais, notícias, decisões de política monetária e eventos de liquidez podem causar variações bruscas de preço e alargamento de spread em segundos.',
        },
      ],
    },
    {
      id: 'sem-garantia',
      title: '5. Não existe garantia de resultado',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.curta} não promete, projeta nem garante lucro. Desconfie de qualquer pessoa — inclusive afiliados, influenciadores, grupos de sinais e "mentores" — que prometa retorno certo, renda fixa mensal ou estratégia infalível. Essas promessas não vêm da ${EMPRESA.curta} e não são endossadas por ela.`,
        },
        {
          t: 'p',
          text: 'Resultado passado, próprio ou de terceiro, não indica resultado futuro. Isso vale também para operações copiadas de outros usuários: copiar não transfere risco, apenas replica decisões de alguém que também pode perder.',
        },
      ],
    },
    {
      id: 'demo',
      title: '6. Conta demo não simula a experiência real',
      blocks: [
        {
          t: 'p',
          text: 'A conta demo usa saldo virtual sem valor econômico. O desempenho nela não se traduz em desempenho na conta real: sem dinheiro em risco, as decisões mudam. Ganhar consistentemente na demo não é indicativo de que você ganhará com dinheiro próprio.',
        },
      ],
    },
    {
      id: 'bonus',
      title: '7. Bônus impõem condições',
      blocks: [
        {
          t: 'p',
          text: 'Bônus não são dinheiro livre. Aceitar um bônus condiciona o saque ao cumprimento de volume de negociação (rollover). Enquanto o rollover não é cumprido, o saque fica bloqueado. Leia o Regulamento de Bônus antes de aceitar.',
        },
      ],
    },
    {
      id: 'financeiro-pessoal',
      title: '8. Antes de depositar',
      blocks: [
        { t: 'p', text: 'Não utilize para negociar:' },
        {
          t: 'ul',
          items: [
            'Dinheiro destinado a moradia, alimentação, saúde ou educação;',
            'Recursos de empréstimo, cartão de crédito, cheque especial ou financiamento;',
            'Reserva de emergência;',
            'Dinheiro de terceiros, sob qualquer arranjo.',
          ],
        },
        {
          t: 'p',
          text: 'Negociação não é fonte de renda previsível e não substitui trabalho ou investimento de longo prazo. Se você está tentando recuperar perdas anteriores, pare — esse é o comportamento mais associado a prejuízo grave. Veja a página de Trading Responsável.',
        },
      ],
    },
    {
      id: 'regulatorio',
      title: '9. Situação regulatória',
      blocks: [
        {
          t: 'p',
          text: 'O tratamento regulatório de opções binárias e digitais varia entre países, e em várias jurisdições esses produtos são restritos, proibidos para o varejo ou não supervisionados. Cabe ao Cliente verificar a legalidade e as consequências, inclusive tributárias, no seu país de residência antes de operar.',
        },
        {
          t: 'p',
          text: `Por não haver supervisão prudencial aplicável, o Cliente não conta com mecanismos como fundo garantidor, seguro de depósito ou compensação estatal em caso de insolvência da ${EMPRESA.curta}.`,
        },
      ],
    },
    {
      id: 'contato',
      title: '10. Dúvidas',
      blocks: [
        {
          t: 'p',
          text: `Se qualquer ponto deste aviso não estiver claro, não opere antes de perguntar: ${EMPRESA.emails.suporte}.`,
        },
      ],
    },
  ],
}
