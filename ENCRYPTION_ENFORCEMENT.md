# Encryption Enforcement in Production

## Summary

Harmon **requires** encryption in production. When `NODE_ENV=production` and `HARMON_ENCRYPTION_SECRET` is not set, the daemon throws during startup validation and never begins accepting traffic.

## How It Is Enforced

### 1. Daemon startup validation (`apps/harmond/src/config.ts`)

`validateDaemonEnvironment()` runs in the `Harmond` constructor, before any runtime state is created:

```typescript
if (isProduction && !options.encryptionSecret) {
  throw new Error('HARMON_ENCRYPTION_SECRET is required in production.');
}
```

There is no `process.exit(1)` block — the constructor throws, so `createDaemon()` fails with that error. The same validator also requires `HARMON_API_TOKEN` in production and whenever the daemon binds a non-loopback address, and rejects `HARMON_CORS_ORIGINS=*` in production.

**Behavior:**
- Production (`NODE_ENV=production`): construction throws if the secret is missing.
- Development: the daemon starts, logs a warning, and prints an unmissable console block:

```
[harmond] WARNING: HARMON_ENCRYPTION_SECRET is not set.
[harmond] OAuth tokens will be stored UNENCRYPTED in the SQLite database.
[harmond] Set HARMON_ENCRYPTION_SECRET (32+ random characters) to encrypt credentials at rest.
```

(The console block is suppressed only under `NODE_ENV=test`.)

### 2. Log lines to look for (`apps/harmond/src/index.ts`)

| Secret | Log line |
|--------|----------|
| Set | `Credential encryption enabled` |
| Unset | `Credential encryption disabled — development only` (plus the console WARNING block above) |

### 3. Auth CLI token files (`packages/harmon-{spotify,apple,youtube}/src/token-store.ts`)

The per-provider auth CLIs (`npm run auth` in each provider package) persist token state under `~/.chitragupta/harmon/provider-packs/`. When `HARMON_ENCRYPTION_SECRET` is set, those files are written as an encrypted envelope (`{ "encrypted": true, "data": "<ciphertext>" }`) using `@sriinnu/harmon-crypto`. Legacy plaintext files remain readable and are **re-encrypted on the next write**. Reading an encrypted file without the secret fails with a message telling you to set it. A secret shorter than 32 characters is treated as unset (with a console error).

### 4. Store helper (informational only)

`HarmonStore.validateEncryptionInProduction()` exists in `packages/harmon-store/src/index.ts` but currently has **no callers** — it is not part of the active enforcement path. Enforcement lives in the daemon config validation described above.

## Testing the Behavior

```bash
# Should fail (constructor throws 'HARMON_ENCRYPTION_SECRET is required in production.')
NODE_ENV=production HARMON_API_TOKEN=x harmond

# Should start with encryption
NODE_ENV=production HARMON_API_TOKEN=x \
  HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32) harmond

# Development without secret: starts, logs 'Credential encryption disabled — development only'
harmond
```

## What Is Protected

- Spotify OAuth access/refresh tokens (and legacy cookies)
- YouTube Music (Google) OAuth tokens
- Apple Music developer/user tokens
- Provider-pack auth files under `~/.chitragupta/harmon/provider-packs/`

Journal, session, and event rows remain unencrypted local SQLite data.

## Encryption Method

- Algorithm: AES-256-GCM (authenticated encryption), scrypt key derivation
- Implementation: `@sriinnu/harmon-crypto`
- Daemon storage: encrypted values in the SQLite `settings` table; CLI storage: encrypted JSON envelopes on disk

### Ciphertext Format (v2)

```
keyFingerprint:salt:iv:authTag:encrypted     (all hex-encoded)
```

- **keyFingerprint**: first 8 hex chars of SHA-256(derived key); detects key mismatches on decrypt
- **salt**: 32 random bytes for scrypt key derivation
- **iv**: 12 random bytes for AES-256-GCM
- **authTag**: 16-byte authentication tag

Legacy v1 format (`salt:iv:authTag:encrypted`) is still accepted for decryption. If you change `HARMON_ENCRYPTION_SECRET`, existing credentials cannot be decrypted — the daemon logs a clear key-mismatch warning and you must re-authenticate.

## Migration Guide

1. Generate a secret: `export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)` (min 32 chars; the base64 output is 44).
2. Add it to your environment configuration (Docker env, systemd unit, PM2 ecosystem, shell profile).
3. Existing **daemon-stored plaintext tokens** need re-authentication after enabling encryption. Existing **CLI plaintext auth files** keep loading and are transparently re-encrypted on the next write.
4. Restart the daemon and confirm `Credential encryption enabled` in the logs.
