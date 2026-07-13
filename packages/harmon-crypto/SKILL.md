---
name: harmon-crypto
description: AES-256-GCM encryption with scrypt key derivation for sensitive data at rest
capabilities:
  - Encrypt plaintext strings with per-operation random salt and IV
  - Decrypt v2 keyFingerprint:salt:iv:authTag:encrypted ciphertexts (plus legacy v1 salt:iv:authTag:encrypted)
  - Securely destroy encryptor state to zero sensitive memory
tags:
  - encryption
  - crypto
  - security
  - aes
provider: harmon
version: 0.2.0
---

# Harmon Crypto

## What this does
harmon-crypto provides authenticated encryption for sensitive data stored by harmon (tokens, cookies, journal content). It uses AES-256-GCM with scrypt-derived keys. Each `encrypt` call generates a fresh 32-byte salt and 12-byte IV.

Ciphertext format (v2, what `encrypt` produces):
```
keyFingerprint:salt:iv:authTag:encrypted     (all hex-encoded)
```
`keyFingerprint` is the first 8 hex chars of SHA-256(derived key), used to detect key mismatches on decrypt with a clear error. `decrypt` also accepts the legacy v1 format `salt:iv:authTag:encrypted` (4 parts, no fingerprint) — decrypt-only fallback; new writes are always v2.

## When to use
- Encrypting OAuth tokens or refresh tokens before writing them to the store
- Decrypting stored credentials when the daemon starts up
- Enforcing encryption-at-rest in production environments

## Key exports
- `Encryptor` — `encrypt(plaintext)`, `decrypt(ciphertext)`, `destroy()`
- `createEncryptor({ secret })` — validates the secret (min 32 chars) and returns an Encryptor

## Example
```typescript
import { createEncryptor } from '@sriinnu/harmon-crypto';

const enc = createEncryptor({ secret: process.env.HARMON_ENCRYPTION_SECRET! });
const cipher = enc.encrypt('my-refresh-token'); // "a1b2c3d4:<salt>:<iv>:<tag>:<data>"
const plain = enc.decrypt(cipher);              // also accepts legacy 4-part v1
enc.destroy();
```
