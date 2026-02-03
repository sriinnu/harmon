/**
 * Harmon Crypto - Encryption utilities for sensitive data
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

export interface EncryptionConfig {
  secret: string;
}

/**
 * Encryptor for encrypting/decrypting sensitive data using AES-256-GCM
 *
 * Uses scrypt for key derivation from the secret
 * Format: iv:authTag:encrypted (all hex-encoded)
 */
export class Encryptor {
  private key: Buffer;
  private salt: Buffer;

  constructor(config: EncryptionConfig) {
    if (!config.secret || config.secret.length < 32) {
      throw new Error('Encryption secret must be at least 32 characters');
    }

    this.salt = randomBytes(SALT_LENGTH);
    this.key = scryptSync(config.secret, this.salt, KEY_LENGTH);
  }

  /**
   * Encrypt a plaintext string
   *
   * @param plaintext String to encrypt
   * @returns Encrypted string in format: iv:authTag:encrypted
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt an encrypted string
   *
   * @param ciphertext Encrypted string in format: iv:authTag:encrypted
   * @returns Decrypted plaintext string
   */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const [ivHex, authTagHex, encrypted] = parts;

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted format - missing parts');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: ${iv.length}, expected ${IV_LENGTH}`);
    }

    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: ${authTag.length}, expected ${AUTH_TAG_LENGTH}`);
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

/**
 * Create an encryptor instance
 *
 * @param config Encryption configuration
 * @returns Encryptor instance
 */
export function createEncryptor(config: EncryptionConfig): Encryptor {
  return new Encryptor(config);
}
