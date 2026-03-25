# @athena/harmon-crypto

![logo](./logo.svg)

> AES-256-GCM encryption with scrypt key derivation for harmon secrets and tokens.

## Install

```bash
pnpm add @athena/harmon-crypto
```

## Quick Start

```typescript
import { createEncryptor } from '@athena/harmon-crypto';

const enc = createEncryptor({ secret: process.env.HARMON_ENCRYPTION_SECRET! });
const cipher = enc.encrypt('spotify-refresh-token-value');
const plain = enc.decrypt(cipher);
enc.destroy(); // zero sensitive state
```

## API

| Export | Description |
|---|---|
| `createEncryptor(config)` | Create an Encryptor instance |
| `Encryptor` | Class: `encrypt(plaintext)`, `decrypt(ciphertext)`, `destroy()` |
| `EncryptionConfig` | `{ secret: string }` (min 32 chars) |

### Ciphertext format

```
salt:iv:authTag:encrypted  (all hex-encoded)
```

Each call to `encrypt()` generates a fresh random salt and IV.

## Architecture

harmon-crypto provides the encryption primitive used by harmon-store and harmond to protect OAuth tokens, refresh tokens, and cookie data at rest. It is required in production (`NODE_ENV=production`) and optional in development.

## License

MIT
