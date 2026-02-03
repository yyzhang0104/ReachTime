/**
 * WebCrypto utilities for client-side encryption
 * Uses AES-GCM for encryption and PBKDF2 for key derivation
 */

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ITERATIONS = 100000;

/**
 * Derive an AES-GCM key from a password using PBKDF2
 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey', 'deriveBits']
  );

  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      // TS DOM lib is overly strict about Uint8Array<ArrayBufferLike> vs BufferSource
      salt: salt as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a random salt for key derivation
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Generate a random IV for encryption
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Encrypt data using AES-GCM
 * Returns: salt (16 bytes) + iv (12 bytes) + ciphertext
 */
export async function encrypt(data: string, password: string): Promise<Uint8Array> {
  const salt = generateSalt();
  const iv = generateIV();
  const key = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    dataBuffer
  );

  // Combine salt + iv + ciphertext
  const result = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return result;
}

/**
 * Decrypt data using AES-GCM
 * Input format: salt (16 bytes) + iv (12 bytes) + ciphertext
 */
export async function decrypt(encryptedData: Uint8Array, password: string): Promise<string> {
  const salt = encryptedData.slice(0, SALT_LENGTH);
  const iv = encryptedData.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = encryptedData.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Convert Uint8Array to base64 string for storage
 */
export function toBase64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}

/**
 * Convert base64 string back to Uint8Array
 */
export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Hash password for verification (not for encryption key)
 * This is used to verify the password without storing it
 */
export async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  /**
   * IMPORTANT:
   * We must NOT export the derived AES key for verification because it's non-extractable.
   * Instead, derive raw bits via PBKDF2 and hash those bits to get a stable verifier.
   */
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  // Hash derived bits as a verifier (base64)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bits);
  return toBase64(new Uint8Array(hashBuffer));
}
