import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const politicaDeReclamacoes: LegalDoc = {
  slug: 'politica-de-reclamacoes',
  title: 'Política de Reclamações',
  short: 'Reclamações',
  summary:
    `Como registrar uma reclamação na ${EMPRESA.marca}, quais são os prazos de resposta e como escalar se a solução não for satisfatória.`,
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'p',
      text: 'Toda reclamação é registrada, recebe protocolo e é respondida. Esta política descreve o caminho e os prazos.',
    },
  ],
  sections: [
    {
      id: 'como',
      title: '1. Como registrar',
      blocks: [
        {
          t: 'ul',
          items: [
            'Pelo suporte dentro da plataforma (canal preferencial — já identifica sua conta);',
            `Por e-mail para ${EMPRESA.emails.suporte}, a partir do endereço cadastrado.`,
          ],
        },
        {
          t: 'p',
          text: 'Para acelerar a análise, informe: e-mail da conta, data e horário do ocorrido, ativo e valor envolvidos, identificador da transação quando houver, e o que você espera como solução.',
        },
      ],
    },
    {
      id: 'prazos',
      title: '2. Prazos',
      blocks: [
        {
          t: 'table',
          head: ['Etapa', 'Prazo'],
          rows: [
            ['Confirmação de recebimento e protocolo', 'Até 1 dia útil'],
            ['Resposta conclusiva', 'Até 10 dias úteis'],
            ['Casos que dependem de terceiro (processador de pagamento, provedor de dados)', 'Até 30 dias, com atualizações periódicas'],
          ],
        },
        {
          t: 'p',
          text: 'Se precisarmos de mais prazo, informaremos o motivo e a nova previsão antes do vencimento do prazo original.',
        },
      ],
    },
    {
      id: 'escalonamento',
      title: '3. Se a resposta não resolver',
      blocks: [
        {
          t: 'p',
          text: `Você pode pedir revisão em segunda instância escrevendo para ${EMPRESA.emails.ouvidoria}, citando o número do protocolo. A revisão é feita por pessoa diferente da que analisou originalmente, com resposta em até 10 dias úteis.`,
        },
        {
          t: 'p',
          text: 'Esgotado o atendimento interno, permanecem à sua disposição os canais externos de defesa do consumidor e as vias judiciais cabíveis. Nada nesta política limita seu direito de recorrer a eles a qualquer momento.',
        },
      ],
    },
    {
      id: 'privacidade',
      title: '4. Reclamações sobre dados pessoais',
      blocks: [
        {
          t: 'p',
          text: `Questões de privacidade e proteção de dados devem ser dirigidas ao Encarregado de Dados: ${EMPRESA.dpo.email}. Você também pode reclamar diretamente à Autoridade Nacional de Proteção de Dados (ANPD).`,
        },
      ],
    },
    {
      id: 'registro',
      title: '5. Registro e melhoria',
      blocks: [
        {
          t: 'p',
          text: 'Reclamações são registradas com histórico e revisadas periodicamente para identificar causas recorrentes. Os registros são mantidos por 2 anos após o encerramento do atendimento.',
        },
      ],
    },
  ],
}
