import { describe, it, expect } from 'vitest';
import { Encryptor, createEncryptor } from './index.js';

describe('Encryptor', () => {
  const validSecret = 'a'.repeat(32);

  it('rejects secrets shorter than 32 chars', () => {
    expect(() => new Encryptor({ secret: 'short' })).toThrow('at least 32 characters');
  });

  it('rejects empty secret', () => {
    expect(() => new Encryptor({ secret: '' })).toThrow();
  });

  it('encrypts and decrypts round-trip', () => {
    const enc = createEncryptor({ secret: validSecret });
    const plaintext = 'hello world';
    const ciphertext = enc.encrypt(plaintext);
    expect(enc.decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext for same plaintext', () => {
    const enc = createEncryptor({ secret: validSecret });
    const a = enc.encrypt('test');
    const b = enc.encrypt('test');
    expect(a).not.toBe(b);
  });

  it('ciphertext format is fingerprint:salt:iv:authTag:encrypted', () => {
    const enc = createEncryptor({ secret: validSecret });
    const ct = enc.encrypt('test');
    const parts = ct.split(':');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toHaveLength(8);   // fingerprint: first 4 bytes of SHA-256 = 8 hex
    expect(parts[1]).toHaveLength(64);  // salt: 32 bytes = 64 hex
    expect(parts[2]).toHaveLength(24);  // iv: 12 bytes = 24 hex
    expect(parts[3]).toHaveLength(32);  // authTag: 16 bytes = 32 hex
    expect(parts[4].length).toBeGreaterThan(0);
  });

  it('decrypts across different Encryptor instances (same secret)', () => {
    const enc1 = createEncryptor({ secret: validSecret });
    const ciphertext = enc1.encrypt('cross-instance test');
    const enc2 = createEncryptor({ secret: validSecret });
    expect(enc2.decrypt(ciphertext)).toBe('cross-instance test');
  });

  it('fails to decrypt with wrong secret', () => {
    const enc1 = createEncryptor({ secret: validSecret });
    const ciphertext = enc1.encrypt('secret data');
    const enc2 = createEncryptor({ secret: 'b'.repeat(32) });
    expect(() => enc2.decrypt(ciphertext)).toThrow(/key mismatch/i);
  });

  it('fails to decrypt tampered ciphertext', () => {
    const enc = createEncryptor({ secret: validSecret });
    const ct = enc.encrypt('sensitive');
    const parts = ct.split(':');
    // Tamper with the encrypted data (index 4 in the new 5-part format)
    parts[4] = 'ff' + parts[4].slice(2);
    expect(() => enc.decrypt(parts.join(':'))).toThrow();
  });

  it('handles empty string plaintext', () => {
    const enc = createEncryptor({ secret: validSecret });
    const ct = enc.encrypt('');
    expect(enc.decrypt(ct)).toBe('');
  });

  it('handles unicode plaintext', () => {
    const enc = createEncryptor({ secret: validSecret });
    const text = '日本語テスト 🎵 émojis';
    expect(enc.decrypt(enc.encrypt(text))).toBe(text);
  });

  it('handles large plaintext', () => {
    const enc = createEncryptor({ secret: validSecret });
    const text = 'x'.repeat(100000);
    expect(enc.decrypt(enc.encrypt(text))).toBe(text);
  });

  it('destroy prevents further encryption', () => {
    const enc = createEncryptor({ secret: validSecret });
    enc.destroy();
    expect(() => enc.encrypt('after destroy')).toThrow('destroyed');
  });

  it('destroy prevents further decryption', () => {
    const enc = createEncryptor({ secret: validSecret });
    const ct = enc.encrypt('before destroy');
    enc.destroy();
    expect(() => enc.decrypt(ct)).toThrow('destroyed');
  });

  it('detects key mismatch on decrypt', () => {
    const enc1 = createEncryptor({ secret: 'aaaa'.repeat(8) });
    const enc2 = createEncryptor({ secret: 'bbbb'.repeat(8) });
    const ciphertext = enc1.encrypt('hello');
    expect(() => enc2.decrypt(ciphertext)).toThrow(/key mismatch/i);
    enc1.destroy();
    enc2.destroy();
  });

  it('decrypts legacy format without fingerprint', () => {
    // Manually construct a legacy 4-part ciphertext (salt:iv:authTag:encrypted)
    // by encrypting with the current code and stripping the fingerprint
    const enc = createEncryptor({ secret: validSecret });
    const ct = enc.encrypt('legacy test');
    const parts = ct.split(':');
    // Remove the fingerprint (first part) to simulate the old format
    const legacyCt = parts.slice(1).join(':');
    expect(legacyCt.split(':')).toHaveLength(4);
    expect(enc.decrypt(legacyCt)).toBe('legacy test');
  });

  it('fails on invalid format (too few parts)', () => {
    const enc = createEncryptor({ secret: validSecret });
    expect(() => enc.decrypt('aabbcc:ddeeff')).toThrow(/invalid encrypted format/i);
  });

  it('fails on invalid format (too many parts)', () => {
    const enc = createEncryptor({ secret: validSecret });
    expect(() => enc.decrypt('a:b:c:d:e:f')).toThrow(/invalid encrypted format/i);
  });
});
