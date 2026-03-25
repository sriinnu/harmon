/**
 * Harmon Crypto - Encryption utilities for sensitive data
 *
 * Uses AES-256-GCM with scrypt key derivation.
 * Format: salt:iv:authTag:encrypted (all hex-encoded)
 * Salt is included in ciphertext so data survives process restarts.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12; // NIST recommended for GCM
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

export interface EncryptionConfig {
  secret: string;
}

/**
 * Encryptor for encrypting/decrypting sensitive data using AES-256-GCM
 *
 * Uses scrypt for key derivation from the secret.
 * Each encrypt() call generates a fresh salt and IV.
 * Format: salt:iv:authTag:encrypted (all hex-encoded)
 */
export class Encryptor {
  private secret: string;
  private destroyed = false;

  constructor(config: EncryptionConfig) {
    if (!config.secret || config.secret.length < 32) {
      throw new Error('Encryption secret must be at least 32 characters');
    }
    this.secret = config.secret;
  }

  /**
   * Encrypt a plaintext string
   *
   * @param plaintext String to encrypt
   * @returns Encrypted string in format: salt:iv:authTag:encrypted
   */
  encrypt(plaintext: string): string {
    if (this.destroyed) {
      throw new Error('Encryptor has been destroyed');
    }

    const salt = randomBytes(SALT_LENGTH);
    const key = scryptSync(this.secret, salt, KEY_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Zero the derived key
    key.fill(0);

    return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt an encrypted string
   *
   * @param ciphertext Encrypted string in format: salt:iv:authTag:encrypted
   * @returns Decrypted plaintext string
   */
  decrypt(ciphertext: string): string {
    if (this.destroyed) {
      throw new Error('Encryptor has been destroyed');
    }

    const parts = ciphertext.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted format: expected salt:iv:authTag:encrypted');
    }

    const [saltHex, ivHex, authTagHex, encrypted] = parts;
    if (!saltHex || !ivHex || !authTagHex || encrypted === undefined) {
      throw new Error('Invalid encrypted format - missing parts');
    }

    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    if (salt.length !== SALT_LENGTH) {
      throw new Error(`Invalid salt length: ${salt.length}, expected ${SALT_LENGTH}`);
    }
    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: ${iv.length}, expected ${IV_LENGTH}`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: ${authTag.length}, expected ${AUTH_TAG_LENGTH}`);
    }

    const key = scryptSync(this.secret, salt, KEY_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // Zero the derived key
    key.fill(0);

    return decrypted;
  }

  /**
   * Destroy this encryptor, zeroing sensitive state.
   * After calling destroy(), encrypt/decrypt will throw.
   */
  destroy(): void {
    this.secret = '';
    this.destroyed = true;
  }
}

/**
 * Create an encryptor instance
 */
export function createEncryptor(config: EncryptionConfig): Encryptor {
  return new Encryptor(config);
}
