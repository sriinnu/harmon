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

  it('ciphertext format is salt:iv:authTag:encrypted', () => {
    const enc = createEncryptor({ secret: validSecret });
    const ct = enc.encrypt('test');
    const parts = ct.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toHaveLength(64);  // salt: 32 bytes = 64 hex
    expect(parts[1]).toHaveLength(24);  // iv: 12 bytes = 24 hex
    expect(parts[2]).toHaveLength(32);  // authTag: 16 bytes = 32 hex
    expect(parts[3].length).toBeGreaterThan(0);
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
    expect(() => enc2.decrypt(ciphertext)).toThrow();
  });

  it('fails to decrypt tampered ciphertext', () => {
    const enc = createEncryptor({ secret: validSecret });
    const ct = enc.encrypt('sensitive');
    const parts = ct.split(':');
    parts[3] = 'ff' + parts[3].slice(2);
    expect(() => enc.decrypt(parts.join(':'))).toThrow();
  });

  it('fails on invalid format (too few parts)', () => {
    const enc = createEncryptor({ secret: validSecret });
    expect(() => enc.decrypt('aabbcc:ddeeff')).toThrow('Invalid encrypted format');
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
});
