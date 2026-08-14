/**
 * Criptografia híbrida RSA + AES-256-GCM (client-side)
 * 
 * - Client encripta payloads com AES-256-GCM (chave aleatória por request)
 * - A chave AES é envolvida (wrapped) com a chave pública RSA do servidor
 * - Apenas o servidor (com a chave privada RSA) pode decriptar
 * - No Network tab do browser, aparece apenas um blob Base64 ilegível
 */

const RSA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7UhoBPH0E//Bl9B9GsGP
RhaiLs4ArqGpWAh46AxybUJWBJcf/sZ4GLZXidZ4xbTJKQzrqsDhGU76mS/YVm55
6mkWvrrXUmaIzhJCnfgogxw0y6b9+4e0pH5ZweBDUtAZKMgL97Pw33k6T3RXVkac
4oa0yRgsGbg15Qf/5oyrSUkPKKYE9cet269ipG1ElJ6TFb+jE8g/hx+OwtGyvCnj
e9NX5CGKUygXOwy8p6ozsHIN7rksXiDk2gzK7vPWOVWsxfG1rPenNCrx1t0MWjUO
7wN8dJyileV3sl9g1O/YwmBS0jtAD3BAIfTpNXHMpSktkpllZdIvx2VFZJXx/O8N
RQIDAQAB
-----END PUBLIC KEY-----`

// Converte PEM para ArrayBuffer
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '')
  const binary = atob(b64)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf.buffer
}

// Importa a chave pública RSA para uso com Web Crypto API
async function getPublicKey(): Promise<CryptoKey> {
  const keyData = pemToArrayBuffer(RSA_PUBLIC_KEY_PEM)
  return crypto.subtle.importKey(
    'spki',
    keyData,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  )
}

// Converte Uint8Array para Base64
function toBase64(buf: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary)
}

export interface EncryptedEnvelope {
  /** Chave AES-256 wrapped com RSA-OAEP (base64) */
  k: string
  /** IV de 12 bytes para AES-GCM (base64) */
  iv: string
  /** Payload encriptado com AES-256-GCM (base64) - inclui auth tag */
  d: string
}

/**
 * Encripta um objeto arbitrário usando criptografia híbrida RSA+AES.
 * O resultado é um envelope JSON que só o servidor pode decriptar.
 */
export async function encryptPayload(data: unknown): Promise<EncryptedEnvelope> {
  // 1. Gera chave AES-256 aleatória (por request)
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  )

  // 2. Gera IV aleatório de 12 bytes
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // 3. Encripta o payload com AES-256-GCM
  const encoded = new TextEncoder().encode(JSON.stringify(data))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  )

  // 4. Exporta a chave AES em formato raw
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey)

  // 5. Envolve (wrap) a chave AES com RSA-OAEP (public key do servidor)
  const rsaPubKey = await getPublicKey()
  const wrappedKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    rsaPubKey,
    rawAesKey
  )

  return {
    k: toBase64(new Uint8Array(wrappedKey)),
    iv: toBase64(iv),
    d: toBase64(new Uint8Array(encrypted)),
  }
}
