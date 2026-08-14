import type { LegalDoc } from './types'
import { EMPRESA, LEGAL_ATUALIZADO_EM } from './empresa'

export const politicaDeCookies: LegalDoc = {
  slug: 'politica-de-cookies',
  title: 'Política de Cookies',
  short: 'Cookies',
  summary:
    `Quais cookies a ${EMPRESA.marca} usa, para que servem e como você controla o consentimento.`,
  updatedAt: LEGAL_ATUALIZADO_EM,
  intro: [
    {
      t: 'p',
      text: 'Cookies são pequenos arquivos gravados no seu navegador. Usamos cookies e tecnologias semelhantes (armazenamento local, pixels) para manter você conectado, proteger a conta e — apenas com seu consentimento — medir campanhas de divulgação.',
    },
  ],
  sections: [
    {
      id: 'categorias',
      title: '1. Categorias que usamos',
      blocks: [
        {
          t: 'table',
          head: ['Categoria', 'Para que serve', 'Precisa de consentimento?'],
          rows: [
            [
              'Essenciais',
              'Sessão de login, token de autenticação, proteção contra CSRF, preferência de conta demo/real, memória das abas de ativos abertas',
              'Não — sem eles a plataforma não funciona',
            ],
            [
              'Preferências',
              'Tema do gráfico, configurações de operação (1 clique, rótulos curtos), silenciar avisos por 24h',
              'Não — guardados no seu próprio navegador',
            ],
            [
              'Analíticos',
              'Entender quais páginas são acessadas e onde ocorrem erros, de forma agregada',
              'Sim',
            ],
            [
              'Atribuição própria',
              'Guardar, no seu próprio navegador, de qual anúncio ou parceiro você veio (parâmetros ref, aff, utm, fbclid) para remunerar corretamente quem indicou',
              'Não — dado de primeira parte, tratado por legítimo interesse; você pode se opor',
            ],
            [
              'Publicidade de terceiros',
              'Compartilhar eventos com plataformas de anúncios e mensuração para otimizar campanhas',
              'Sim',
            ],
          ],
        },
      ],
    },
    {
      id: 'atribuicao',
      title: '2. Identificadores de campanha (ref e click_id)',
      blocks: [
        {
          t: 'p',
          text: 'Quando você chega ao site por um anúncio ou link de parceiro, a URL pode conter parâmetros como ref, aff, utm e fbclid. Guardamos esse identificador no armazenamento local do seu navegador para associar um eventual cadastro à origem correta e remunerar o parceiro que indicou.',
        },
        {
          t: 'p',
          text: 'É um dado de primeira parte: fica no seu navegador, não contém seu nome, e-mail ou dado financeiro, e não é usado para exibir anúncios direcionados. Tratamos com base em legítimo interesse, e você pode se opor pelo canal indicado na Política de Privacidade.',
        },
        {
          t: 'p',
          text: 'O compartilhamento desse identificador com plataformas de anúncios, para medição de campanha, depende do seu consentimento no banner.',
        },
      ],
    },
    {
      id: 'terceiros',
      title: '3. Cookies de terceiros',
      blocks: [
        {
          t: 'p',
          text: 'Cookies analíticos e de publicidade podem ser gravados por parceiros que operam sob nossas instruções (plataformas de anúncios e de mensuração). Esses parceiros têm políticas próprias e podem combinar o dado com informações que já possuem sobre você.',
        },
      ],
    },
    {
      id: 'controle',
      title: '4. Como controlar',
      blocks: [
        {
          t: 'ul',
          items: [
            'No banner exibido no primeiro acesso, escolhendo "Aceitar todos" ou "Somente essenciais";',
            'A qualquer momento, pelo link "Preferências de cookies" no rodapé do site;',
            'Nas configurações do seu navegador, bloqueando ou apagando cookies.',
          ],
        },
        {
          t: 'alert',
          text: 'Bloquear cookies essenciais no navegador impede o login e o funcionamento da plataforma. Os demais podem ser recusados sem prejuízo de uso.',
        },
        {
          t: 'p',
          text: 'Revogar o consentimento não apaga o que já foi coletado no período em que ele esteve válido; para isso, use os direitos descritos na Política de Privacidade.',
        },
      ],
    },
    {
      id: 'contato',
      title: '5. Contato',
      blocks: [
        {
          t: 'p',
          text: `Dúvidas sobre cookies e tratamento de dados: ${EMPRESA.dpo.email}.`,
        },
      ],
    },
  ],
}
