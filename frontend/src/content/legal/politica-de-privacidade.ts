import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const politicaDePrivacidade: LegalDoc = {
  slug: 'politica-de-privacidade',
  title: 'Política de Privacidade',
  short: 'Privacidade',
  summary:
    `Como a ${EMPRESA.marca} coleta, usa, compartilha e protege dados pessoais, e como exercer seus direitos sob a LGPD.`,
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'p',
      text: `Esta Política explica como ${EMPRESA.entidade}, controladora dos dados, trata os dados pessoais de quem usa a plataforma. Ela segue a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).`,
    },
    {
      t: 'p',
      text: EMPRESA.dpo.nome
        ? `Encarregado de Dados (DPO): ${EMPRESA.dpo.nome} — ${EMPRESA.dpo.email}.`
        : `Encarregado de Dados (DPO): contato por ${EMPRESA.dpo.email}.`,
    },
  ],
  sections: [
    {
      id: 'dados',
      title: '1. Dados que coletamos',
      blocks: [
        {
          t: 'table',
          head: ['Categoria', 'Exemplos', 'Origem'],
          rows: [
            ['Cadastro', 'Nome, e-mail, telefone, país, data de nascimento', 'Você, no cadastro'],
            ['Identificação (KYC)', 'Documento oficial, selfie, comprovante de endereço, CPF', 'Você, na verificação'],
            ['Financeiros', 'Depósitos, saques, chave Pix, carteira USDT, saldo, extrato', 'Você e o processador de pagamento'],
            ['Operacionais', 'Operações abertas e encerradas, ativos, valores, horários, resultados', 'Gerados pelo seu uso'],
            ['Técnicos', 'Endereço IP, dispositivo, navegador, sistema, identificadores de sessão', 'Coletados automaticamente'],
            ['Comunicações', 'Mensagens de suporte, tickets, e-mails trocados', 'Você'],
            ['Marketing', 'Origem do clique, campanha, identificador de referência (ref/click_id)', 'Parceiros de divulgação e cookies'],
          ],
        },
        {
          t: 'p',
          text: 'Não coletamos intencionalmente dados sensíveis (origem racial, opinião política, saúde, biometria para fins diversos da verificação de identidade). A selfie usada na verificação é tratada exclusivamente para conferir a identidade e prevenir fraude.',
        },
      ],
    },
    {
      id: 'finalidades',
      title: '2. Para que usamos e com que base legal',
      blocks: [
        {
          t: 'table',
          head: ['Finalidade', 'Base legal (LGPD)'],
          rows: [
            ['Criar e manter sua conta; executar operações', 'Execução de contrato (art. 7º, V)'],
            ['Processar depósitos e saques', 'Execução de contrato (art. 7º, V)'],
            ['Verificar identidade e prevenir lavagem de dinheiro', 'Cumprimento de obrigação legal/regulatória (art. 7º, II)'],
            ['Prevenir fraude e proteger a plataforma', 'Legítimo interesse (art. 7º, IX)'],
            ['Suporte ao cliente', 'Execução de contrato (art. 7º, V)'],
            ['Comunicações de marketing e promoções', 'Consentimento (art. 7º, I) — revogável a qualquer momento'],
            ['Atribuir seu cadastro ao parceiro que indicou, para remunerá-lo (ref, aff, utm)', 'Legítimo interesse (art. 7º, IX) — cabe oposição'],
            ['Compartilhar eventos com plataformas de anúncios para medir campanhas', 'Consentimento, via banner de cookies (art. 7º, I)'],
            ['Cumprir ordem judicial ou de autoridade competente', 'Cumprimento de obrigação legal (art. 7º, II)'],
            ['Defesa em processo administrativo, judicial ou arbitral', 'Exercício regular de direitos (art. 7º, VI)'],
          ],
        },
      ],
    },
    {
      id: 'compartilhamento',
      title: '3. Com quem compartilhamos',
      blocks: [
        {
          t: 'p',
          text: 'Não vendemos dados pessoais. Compartilhamos apenas o necessário, com as seguintes categorias de terceiros:',
        },
        {
          t: 'ul',
          items: [
            `Processador de pagamentos (${EMPRESA.gateway}) — para liquidar depósitos e saques via Pix e criptomoedas;`,
            'Provedor de verificação de identidade (KYC) — para conferir documentos;',
            'Provedores de infraestrutura, banco de dados e hospedagem — para operar a plataforma;',
            'Provedor de envio de e-mails transacionais;',
            'Plataformas de publicidade e mensuração — apenas mediante seu consentimento no banner de cookies;',
            'Autoridades públicas — quando houver requisição legal válida;',
            'Assessores jurídicos e contábeis, sob dever de sigilo.',
          ],
        },
        {
          t: 'p',
          text: 'Todos os operadores são contratualmente obrigados a tratar os dados apenas conforme nossas instruções e a adotar medidas de segurança compatíveis.',
        },
      ],
    },
    {
      id: 'internacional',
      title: '4. Transferência internacional',
      blocks: [
        {
          t: 'p',
          text: 'Parte da infraestrutura e alguns fornecedores estão fora do Brasil. Nesses casos, a transferência internacional é feita com base em cláusulas contratuais de proteção equivalentes ao padrão da LGPD (art. 33), ou com seu consentimento específico quando exigido.',
        },
      ],
    },
    {
      id: 'retencao',
      title: '5. Por quanto tempo guardamos',
      blocks: [
        {
          t: 'table',
          head: ['Dado', 'Prazo de retenção'],
          rows: [
            ['Cadastro e conta', 'Enquanto a conta existir'],
            ['Registros de KYC e transações financeiras', 'Até 5 anos após o encerramento da relação, para fins de prevenção à lavagem de dinheiro e defesa'],
            ['Registros de acesso (IP, sessão)', '6 meses, conforme Marco Civil da Internet (Lei 12.965/2014)'],
            ['Histórico de operações', 'Enquanto a conta existir e por até 5 anos após o encerramento'],
            ['Tickets de suporte', '2 anos após o encerramento do atendimento'],
            ['Dados de marketing', 'Até a revogação do consentimento'],
          ],
        },
        {
          t: 'p',
          text: 'Encerrado o prazo, os dados são eliminados ou anonimizados, salvo quando a conservação for exigida por lei ou necessária para exercício regular de direitos.',
        },
      ],
    },
    {
      id: 'direitos',
      title: '6. Seus direitos',
      blocks: [
        { t: 'p', text: 'Você pode, a qualquer momento, solicitar:' },
        {
          t: 'ul',
          items: [
            'Confirmação da existência de tratamento e acesso aos seus dados;',
            'Correção de dados incompletos, inexatos ou desatualizados;',
            'Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;',
            'Portabilidade a outro fornecedor;',
            'Eliminação dos dados tratados com base no consentimento;',
            'Informação sobre com quem compartilhamos seus dados;',
            'Revogação do consentimento;',
            'Oposição a tratamento fundado em legítimo interesse.',
          ],
        },
        {
          t: 'p',
          text: `Para exercer, escreva para ${EMPRESA.dpo.email}. Respondemos em até 15 dias. Podemos pedir informações adicionais para confirmar sua identidade antes de atender — é uma medida de segurança, não um obstáculo.`,
        },
        {
          t: 'alert',
          text: 'Alguns dados não podem ser eliminados a pedido: registros de KYC e de transações têm retenção obrigatória por lei de prevenção à lavagem de dinheiro. Nesses casos, informaremos a base legal da recusa.',
        },
      ],
    },
    {
      id: 'seguranca',
      title: '7. Segurança',
      blocks: [
        {
          t: 'p',
          text: 'Adotamos medidas técnicas e organizacionais para proteger seus dados, entre elas: criptografia em trânsito (TLS), controle de acesso por perfil, segregação de ambientes, autenticação em dois fatores para acesso administrativo, registro de auditoria de ações sensíveis e monitoramento de erros.',
        },
        {
          t: 'p',
          text: 'Nenhum sistema é totalmente imune. Em caso de incidente de segurança com risco relevante aos seus direitos, comunicaremos você e a ANPD nos prazos legais.',
        },
        {
          t: 'p',
          text: `A segurança da sua conta também depende de você: use senha única e forte, ative os recursos de segurança disponíveis e nunca compartilhe credenciais. A ${EMPRESA.curta} nunca solicita sua senha por e-mail, telefone ou mensagem.`,
        },
      ],
    },
    {
      id: 'menores',
      title: '8. Menores de idade',
      blocks: [
        {
          t: 'p',
          text: `A plataforma é destinada exclusivamente a maiores de ${EMPRESA.idadeMinima} anos. Não coletamos intencionalmente dados de menores. Identificado o cadastro de menor, a conta é encerrada e os dados eliminados, ressalvada a retenção legal obrigatória.`,
        },
      ],
    },
    {
      id: 'cookies',
      title: '9. Cookies',
      blocks: [
        {
          t: 'p',
          text: 'O uso de cookies e tecnologias semelhantes é detalhado na Política de Cookies, onde você também pode rever suas escolhas de consentimento.',
        },
      ],
    },
    {
      id: 'alteracoes',
      title: '10. Alterações',
      blocks: [
        {
          t: 'p',
          text: 'Esta Política pode ser atualizada. Mudanças relevantes serão comunicadas por e-mail ou aviso na plataforma. A data da última revisão consta no topo desta página.',
        },
        {
          t: 'p',
          text: 'Se você entender que seus direitos não foram atendidos, pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).',
        },
      ],
    },
  ],
}
