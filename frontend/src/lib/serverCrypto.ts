/**
 * Decriptação server-side (RSA + AES-256-GCM)
 * Roda APENAS em API routes (Node.js runtime)
 */
import crypto from 'crypto'

const PRIVATE_KEY = process.env.PAYLOAD_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? ''

export interface EncryptedEnvelope {
  k: string   // Chave AES wrapped com RSA-OAEP (base64)
  iv: string  // IV 12 bytes (base64)
  d: string   // Payload encriptado AES-GCM (base64)
}

/**
 * Decripta um envelope encriptado pelo client.
 * 1. Unwrap a chave AES com RSA private key
 * 2. Decripta o payload com AES-256-GCM
 */
export function decryptPayload(envelope: EncryptedEnvelope): unknown {
  if (!PRIVATE_KEY) throw new Error('PAYLOAD_PRIVATE_KEY não configurada')

  // 1. Unwrap da chave AES com RSA-OAEP
  const wrappedKey = Buffer.from(envelope.k, 'base64')
  const aesKeyBuffer = crypto.privateDecrypt(
    {
      key: PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    wrappedKey
  )

  // 2. Decripta o payload com AES-256-GCM
  const iv = Buffer.from(envelope.iv, 'base64')
  const encryptedData = Buffer.from(envelope.d, 'base64')

  // No Web Crypto API, o auth tag (16 bytes) é appended ao ciphertext
  const authTag = encryptedData.subarray(encryptedData.length - 16)
  const ciphertext = encryptedData.subarray(0, encryptedData.length - 16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKeyBuffer, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return JSON.parse(decrypted.toString('utf8'))
}

/**
 * Encripta resposta para enviar ao client (AES-256-GCM simétrico com chave efêmera)
 * Nota: A resposta usa uma chave simples pois já está no caminho server→client
 * e o objetivo principal é ofuscar no Network tab
 */
export function encryptResponse(data: unknown): { d: string; iv: string; k: string } {
  const key = crypto.randomBytes(32)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const payload = JSON.stringify(data)
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    k: key.toString('base64'),
    iv: iv.toString('base64'),
    d: Buffer.concat([encrypted, tag]).toString('base64'),
  }
}
