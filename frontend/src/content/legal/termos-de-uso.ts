import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const termosDeUso: LegalDoc = {
  slug: 'termos-de-uso',
  title: 'Termos de Uso e Acordo de Cliente',
  short: 'Termos de Uso',
  summary:
    `Condições que regem o uso da plataforma ${EMPRESA.marca}, a abertura de conta e a negociação de opções digitais.`,
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'p',
      text: `Este documento é o contrato entre você ("Cliente", "Usuário") e ${EMPRESA.entidade} ("${EMPRESA.curta}", "nós"), responsável pela plataforma disponível em ${EMPRESA.site}. Ao criar uma conta, depositar fundos ou executar qualquer operação, você declara ter lido, compreendido e aceitado integralmente estes Termos.`,
    },
    {
      t: 'alert',
      text: 'Se você não concorda com qualquer cláusula deste documento, não crie conta e não utilize a plataforma. A negociação de opções digitais envolve risco elevado de perda total do capital.',
    },
  ],
  sections: [
    {
      id: 'objeto',
      title: '1. Objeto',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.curta} disponibiliza uma plataforma tecnológica pela qual o Cliente negocia contratos de opções digitais — instrumentos de resultado binário, em que o Cliente prevê se o preço de um ativo estará acima ou abaixo do preço de entrada no momento da expiração.`,
        },
        {
          t: 'p',
          text: `A ${EMPRESA.curta} não presta consultoria de investimento, não faz recomendação personalizada, não administra carteira de terceiros e não garante resultado. Toda decisão de operação é exclusiva do Cliente.`,
        },
      ],
    },
    {
      id: 'elegibilidade',
      title: '2. Elegibilidade e abertura de conta',
      blocks: [
        { t: 'p', text: 'Para abrir e manter conta, o Cliente deve:' },
        {
          t: 'ul',
          items: [
            `Ter no mínimo ${EMPRESA.idadeMinima} anos completos e plena capacidade civil;`,
            'Não residir nem ser nacional de jurisdição restrita (ver Jurisdições Restritas);',
            'Fornecer dados verdadeiros, completos e atualizados;',
            'Operar em nome próprio, com recursos de origem lícita e titularidade própria;',
            'Manter uma única conta. Contas múltiplas do mesmo titular podem ser encerradas.',
          ],
        },
        {
          t: 'p',
          text: `A ${EMPRESA.curta} pode recusar, suspender ou encerrar a abertura de conta a seu critério, inclusive quando a verificação de identidade não for concluída.`,
        },
      ],
    },
    {
      id: 'contas',
      title: '3. Conta demonstração e conta real',
      blocks: [
        {
          t: 'p',
          text: `A conta DEMO usa saldo virtual, sem valor econômico, destinada exclusivamente a treino. O saldo demo pode ser reiniciado pelo Cliente ou pela ${EMPRESA.curta} a qualquer momento e não é conversível, sacável ou transferível.`,
        },
        {
          t: 'p',
          text: 'A conta REAL opera com recursos efetivamente depositados. Resultados obtidos na conta demo não representam, projetam nem garantem resultados na conta real — as condições de execução, o comportamento emocional e a gestão de risco são diferentes.',
        },
      ],
    },
    {
      id: 'ativos',
      title: '4. Ativos, preços e payout',
      blocks: [
        {
          t: 'p',
          text: 'A plataforma oferece duas categorias de ativos, identificadas na interface:',
        },
        {
          t: 'ul',
          items: [
            'Ativos LIVE — o preço é derivado de fontes externas de mercado (provedores de dados e exchanges). Podem sofrer atraso, interrupção ou indisponibilidade por falha do provedor.',
            `Ativos OTC (sintéticos) — o preço é gerado pela própria ${EMPRESA.curta} por modelo algorítmico. NÃO representam mercado real, não são cotação de bolsa e existem apenas dentro da plataforma. Ficam disponíveis inclusive quando os mercados tradicionais estão fechados.`,
          ],
        },
        {
          t: 'alert',
          text: `Em ativos OTC, a ${EMPRESA.curta} atua como contraparte da sua operação: quando o Cliente ganha, quem paga é a ${EMPRESA.curta}; quando o Cliente perde, o valor fica com a ${EMPRESA.curta}. Isso configura conflito de interesse estrutural, detalhado na Política de Execução e Conflito de Interesse.`,
        },
        {
          t: 'p',
          text: `O payout (percentual de retorno em caso de acerto) é exibido na tela antes da confirmação da operação e é o percentual que vale para aquela entrada. A ${EMPRESA.curta} pode alterar o payout de qualquer ativo a qualquer momento, inclusive por condição de mercado, liquidez ou exposição; a alteração não retroage a operações já abertas.`,
        },
      ],
    },
    {
      id: 'operacoes',
      title: '5. Execução e apuração das operações',
      blocks: [
        {
          t: 'p',
          text: `Ao confirmar uma operação, o Cliente define ativo, valor, direção (compra ou venda) e tempo de expiração. A operação é registrada com o preço de entrada apurado pelo servidor da ${EMPRESA.curta} no instante do recebimento da ordem.`,
        },
        {
          t: 'p',
          text: 'O resultado é apurado exclusivamente pelo servidor, comparando o preço de entrada ao preço no instante da expiração. Valores exibidos no dispositivo do Cliente são informativos; em caso de divergência, prevalece o registro do servidor.',
        },
        {
          t: 'ul',
          items: [
            'Acerto: o Cliente recebe o valor investido acrescido do payout aplicável.',
            'Erro: o Cliente perde o valor investido naquela operação.',
            'Empate (preço de expiração idêntico ao de entrada): o valor investido é devolvido, sem ganho.',
          ],
        },
        {
          t: 'p',
          text: 'Operações confirmadas não podem ser canceladas, revertidas ou editadas pelo Cliente. O valor investido é debitado do saldo no momento da confirmação.',
        },
      ],
    },
    {
      id: 'limites',
      title: '6. Limites e recusa de operação',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.curta} pode estabelecer e alterar valores mínimo e máximo por operação, número máximo de operações simultâneas, exposição máxima por ativo e limites por conta.`,
        },
        {
          t: 'p',
          text: `A ${EMPRESA.curta} pode recusar, suspender ou anular operações em caso de: falha técnica evidente, erro manifesto de preço, indisponibilidade do provedor de dados, latência anormal, suspeita de fraude, uso de automação não autorizada ou exploração de defeito da plataforma.`,
        },
      ],
    },
    {
      id: 'conduta',
      title: '7. Condutas proibidas',
      blocks: [
        { t: 'p', text: 'É vedado ao Cliente:' },
        {
          t: 'ul',
          items: [
            `Usar robôs, scripts, automação ou qualquer acesso não oficial à plataforma sem autorização escrita da ${EMPRESA.curta};`,
            'Explorar falha, atraso de preço, erro de arredondamento ou defeito de software para obter vantagem;',
            'Operar de forma coordenada entre múltiplas contas com o objetivo de neutralizar risco ou capturar bônus;',
            'Fornecer documento falso, adulterado ou de terceiro na verificação de identidade;',
            'Usar meio de pagamento de terceiro, sem titularidade própria;',
            'Utilizar a plataforma para lavagem de dinheiro, financiamento de atividade ilícita ou evasão de sanções;',
            'Realizar engenharia reversa, copiar, redistribuir ou reproduzir a plataforma ou suas marcas.',
          ],
        },
        {
          t: 'p',
          text: `A constatação de qualquer dessas condutas autoriza a ${EMPRESA.curta} a suspender a conta, anular operações e lucros dela decorrentes, reter valores para apuração e encerrar a relação, sem prejuízo das medidas legais cabíveis.`,
        },
      ],
    },
    {
      id: 'financeiro',
      title: '8. Depósitos, saques e bônus',
      blocks: [
        {
          t: 'p',
          text: 'As condições de depósito e saque — métodos, prazos, limites, custos e exigências de verificação — estão na Política de Depósitos e Saques, que integra estes Termos.',
        },
        {
          t: 'p',
          text: `Bônus e promoções são liberalidades da ${EMPRESA.curta}, sujeitas a regras próprias de rollover, teto e prazo, descritas no Regulamento de Bônus. Aceitar um bônus vincula o Cliente àquelas regras.`,
        },
      ],
    },
    {
      id: 'disponibilidade',
      title: '9. Disponibilidade e falhas',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.curta} empreende esforços razoáveis para manter a plataforma disponível, mas não garante funcionamento ininterrupto ou livre de erros. Podem ocorrer paradas para manutenção, falhas de terceiros (provedores de dados, processadores de pagamento, hospedagem, internet do Cliente) e eventos fora do controle da ${EMPRESA.curta}.`,
        },
        {
          t: 'p',
          text: `A ${EMPRESA.curta} não responde por perdas decorrentes de indisponibilidade da conexão do Cliente, do dispositivo do Cliente ou de terceiros, nem por operação não executada por essas causas.`,
        },
      ],
    },
    {
      id: 'responsabilidade',
      title: '10. Limitação de responsabilidade',
      blocks: [
        {
          t: 'p',
          text: `Na máxima extensão permitida pela lei aplicável, a responsabilidade total da ${EMPRESA.curta} perante o Cliente, por qualquer causa, fica limitada ao saldo disponível na conta do Cliente no momento do evento.`,
        },
        {
          t: 'p',
          text: `A ${EMPRESA.curta} não responde por lucros cessantes, perda de oportunidade, dano indireto ou dano moral decorrente de decisão de investimento do Cliente. Nada nesta cláusula afasta direitos que a lei aplicável considere irrenunciáveis.`,
        },
      ],
    },
    {
      id: 'encerramento',
      title: '11. Encerramento da conta',
      blocks: [
        {
          t: 'p',
          text: `O Cliente pode encerrar a conta a qualquer momento solicitando por ${EMPRESA.emails.suporte}. Havendo saldo, ele é devolvido pelo meio de pagamento de origem, após conclusão da verificação de identidade e cumprimento de eventual rollover de bônus pendente.`,
        },
        {
          t: 'p',
          text: `A ${EMPRESA.curta} pode encerrar a conta mediante aviso, e imediatamente em caso de violação destes Termos, exigência legal ou suspeita fundada de fraude.`,
        },
      ],
    },
    {
      id: 'alteracoes',
      title: '12. Alterações destes Termos',
      blocks: [
        {
          t: 'p',
          text: `A ${EMPRESA.curta} pode alterar estes Termos. Alterações relevantes serão comunicadas por e-mail e/ou aviso na plataforma com antecedência razoável. O uso da plataforma após a vigência implica aceitação. A data da última revisão consta no topo desta página.`,
        },
      ],
    },
    {
      id: 'lei',
      title: '13. Lei aplicável e foro',
      blocks: [
        {
          t: 'p',
          // A menção à jurisdição só entra quando ela estiver definida em
          // empresa.ts — melhor omitir do que citar um país errado.
          text: EMPRESA.jurisdicao
            ? `Estes Termos são regidos pelas leis de ${EMPRESA.jurisdicao}. Fica eleito o foro da sede da ${EMPRESA.entidade} para dirimir controvérsias, ressalvada a competência que a lei atribuir de forma imperativa ao domicílio do consumidor.`
            : `Fica eleito o foro da sede da ${EMPRESA.entidade} para dirimir controvérsias, ressalvada a competência que a lei atribuir de forma imperativa ao domicílio do consumidor.`,
        },
        {
          t: 'p',
          text: `Dúvidas sobre este documento: ${EMPRESA.emails.juridico}.`,
        },
      ],
    },
  ],
}
