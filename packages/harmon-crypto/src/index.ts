/**
 * Harmon Crypto - Encryption utilities for sensitive data
 *
 * Uses AES-256-GCM with scrypt key derivation.
 * Format v2: keyFingerprint:salt:iv:authTag:encrypted (all hex-encoded)
 * Legacy format v1: salt:iv:authTag:encrypted (still supported for decryption)
 * Salt is included in ciphertext so data survives process restarts.
 * Key fingerprint enables clear error messages on secret mismatch.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

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
 * Format v2: keyFingerprint:salt:iv:authTag:encrypted (all hex-encoded)
 * Decryption also supports legacy v1 format: salt:iv:authTag:encrypted
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
   * @returns Encrypted string in format: keyFingerprint:salt:iv:authTag:encrypted
   */
  encrypt(plaintext: string): string {
    if (this.destroyed) {
      throw new Error('Encryptor has been destroyed');
    }

    const salt = randomBytes(SALT_LENGTH);
    const key = scryptSync(this.secret, salt, KEY_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    try {
      // Compute a short fingerprint of the derived key (first 4 bytes of SHA-256)
      const keyFingerprint = createHash('sha256').update(key).digest('hex').slice(0, 8);

      const cipher = createCipheriv(ALGORITHM, key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      return `${keyFingerprint}:${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } finally {
      key.fill(0);
    }
  }

  /**
   * Decrypt an encrypted string
   *
   * Supports both the new v2 format (keyFingerprint:salt:iv:authTag:encrypted)
   * and the legacy v1 format (salt:iv:authTag:encrypted).
   *
   * @param ciphertext Encrypted string in v2 or legacy v1 format
   * @returns Decrypted plaintext string
   */
  decrypt(ciphertext: string): string {
    if (this.destroyed) {
      throw new Error('Encryptor has been destroyed');
    }

    const parts = ciphertext.split(':');

    let saltHex: string, ivHex: string, authTagHex: string, encrypted: string;

    if (parts.length === 5) {
      // New v2 format: keyFingerprint:salt:iv:authTag:encrypted
      const [storedFingerprint, ...rest] = parts;
      [saltHex, ivHex, authTagHex, encrypted] = rest;

      if (!storedFingerprint || !saltHex || !ivHex || !authTagHex || encrypted === undefined) {
        throw new Error('Invalid encrypted format - missing parts');
      }

      // Derive key early to check fingerprint before attempting decrypt
      const salt = Buffer.from(saltHex, 'hex');
      if (salt.length !== SALT_LENGTH) {
        throw new Error(`Invalid salt length: ${salt.length}, expected ${SALT_LENGTH}`);
      }

      const key = scryptSync(this.secret, salt, KEY_LENGTH);
      const actualFingerprint = createHash('sha256').update(key).digest('hex').slice(0, 8);

      if (storedFingerprint !== actualFingerprint) {
        key.fill(0);
        throw new Error(
          'Encryption key mismatch: the stored credentials were encrypted with a different HARMON_ENCRYPTION_SECRET. ' +
          'Restore the original secret or re-authenticate your providers.'
        );
      }

      key.fill(0);
      // Fall through to shared decrypt logic below
    } else if (parts.length === 4) {
      // Legacy v1 format: salt:iv:authTag:encrypted (no fingerprint)
      [saltHex, ivHex, authTagHex, encrypted] = parts;

      if (!saltHex || !ivHex || !authTagHex || encrypted === undefined) {
        throw new Error('Invalid encrypted format - missing parts');
      }
    } else {
      throw new Error('Invalid encrypted format: expected keyFingerprint:salt:iv:authTag:encrypted or legacy salt:iv:authTag:encrypted');
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
    const plaintextChunks: Buffer[] = [];
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      plaintextChunks.push(decipher.update(encrypted, 'hex'));
      plaintextChunks.push(decipher.final());
      return Buffer.concat(plaintextChunks).toString('utf8');
    } finally {
      for (const chunk of plaintextChunks) {
        chunk.fill(0);
      }
      key.fill(0);
    }
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
