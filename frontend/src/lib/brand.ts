/**
 * Marca de fallback — o ÚNICO lugar do código com o nome escrito à mão.
 *
 * É o que aparece quando o banco não responde, e é o que semeia o
 * `DEFAULT_CONTENT` do siteContent. O valor real vem de
 * `app_config.site_content` e é editável em /admin/site; isto aqui é a rede
 * de segurança.
 *
 * NA TROCA DE NOME DA CORRETORA: este arquivo muda e o resto acompanha.
 * Se ficar com o nome antigo, uma falha de banco derruba o site de volta pra
 * marca velha — que é justamente o que a troca existe pra evitar.
 * Ver docs/plano-rebrand.md.
 */

export type Brand = {
  /** Wordmark em caixa alta, exibido no header e na tela de trade. */
  name: string
  /** Linha fina abaixo do wordmark na tela de trade. */
  subtitle: string
  /** Nome por extenso — título da aba, rodapé, e-mails. */
  fullName: string
  /** URL de imagem do logo. Vazio = usa o símbolo padrão em SVG. */
  logoUrl: string
  /** URL do logo horizontal completo (símbolo + nome numa única imagem). */
  logoWideUrl: string
  /** 'icon-text' = símbolo + nome em texto. 'wide' = logo horizontal único. */
  logoMode: 'icon-text' | 'wide'
  /** Alcance do logo horizontal: só a tela de trade, ou o site inteiro. */
  logoScope: 'trade' | 'both'
}

export const BRAND_FALLBACK: Brand = {
  name:     'VÉRTICE',
  subtitle: 'BROKER',
  fullName: 'Vértice Broker',
  logoUrl:  '',
  logoWideUrl: '',
  logoMode: 'icon-text',
  logoScope: 'trade',
}

/**
 * Nome curto, como aparece na prosa dos documentos legais:
 * "A Norvero pode recusar...", "o caixa da Norvero".
 *
 * A marca não tem sobrenome, então este valor é igual ao `fullName`. Os dois
 * continuam separados de propósito: se um dia entrar um sobrenome, a prosa dos
 * contratos não deve virar "a Norvero Markets pode recusar".
 */
export const BRAND_SHORT = 'Vértice'

/**
 * Domínio principal, sem protocolo. Base dos e-mails institucionais e do
 * fallback de SITE_URL.
 */
// Domínio definitivo (registrado no Dynadot). NÃO é só fallback de URL: o
// remetente dos e-mails transacionais é montado daqui em lib/email.ts, então
// errar a extensão faz o Resend recusar o envio por domínio não verificado.
export const BRAND_DOMAIN = 'verticebroker.co'
