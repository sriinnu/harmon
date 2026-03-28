---
name: harmon-crypto
description: AES-256-GCM encryption with scrypt key derivation for sensitive data at rest
capabilities:
  - Encrypt plaintext strings with per-operation random salt and IV
  - Decrypt ciphertext using the salt:iv:authTag:encrypted format
  - Securely destroy encryptor state to zero sensitive memory
tags:
  - encryption
  - crypto
  - security
  - aes
provider: harmon
version: 0.1.0
---

# Harmon Crypto

## What this does
harmon-crypto provides authenticated encryption for sensitive data stored by harmon (tokens, cookies, journal content). It uses AES-256-GCM with scrypt-derived keys. Each call to encrypt generates a fresh 32-byte salt and 12-byte IV, producing a self-contained ciphertext string that survives process restarts. The Encryptor can be destroyed to zero its internal secret.

## When to use
- Encrypting OAuth tokens or refresh tokens before writing them to the store
- Decrypting stored credentials when the daemon starts up
- Enforcing encryption-at-rest in production environments

## Key exports
- `Encryptor` — class with `encrypt(plaintext)`, `decrypt(ciphertext)`, and `destroy()` methods
- `createEncryptor` — factory that validates the secret (min 32 chars) and returns an Encryptor

## Example
```typescript
import { createEncryptor } from '@sriinnu/harmon-crypto';

const enc = createEncryptor({ secret: process.env.HARMON_ENCRYPTION_SECRET! });
const cipher = enc.encrypt('my-refresh-token');
const plain = enc.decrypt(cipher);
enc.destroy();
```
