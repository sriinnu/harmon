# Harmon Encryption - Quick Start Guide

## TL;DR

**Production deployments require encryption:**

```bash
# Generate and set encryption secret
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)

# Start daemon
export NODE_ENV=production
harmond
```

**Without this, the daemon throws `HARMON_ENCRYPTION_SECRET is required in production.` during startup and never accepts traffic.**

---

## Why This Matters

Harmon stores OAuth tokens for Spotify, YouTube Music, and Apple Music. In production these **must** be encrypted at rest. The startup validator in `apps/harmond/src/config.ts` refuses to construct the daemon without the secret, preventing accidental plaintext deployments.

The same secret also encrypts the provider auth CLI files under `~/.chitragupta/harmon/provider-packs/` (written by `npm run auth` in each provider package). Legacy plaintext files keep loading and are re-encrypted on the next write.

---

## Quick Setup

### 1. Generate Secret (One-Time)

```bash
openssl rand -base64 32
```

### 2. Set Environment Variable

#### Option A: Export in Shell
```bash
export HARMON_ENCRYPTION_SECRET="your_generated_secret_here"
```

#### Option B: Add to .env File
```bash
echo "HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)" >> .env
```

#### Option C: Docker Compose
```yaml
services:
  harmond:
    environment:
      - HARMON_ENCRYPTION_SECRET=${HARMON_ENCRYPTION_SECRET}
```

#### Option D: Systemd Service
```ini
[Service]
Environment="HARMON_ENCRYPTION_SECRET=your_secret_here"
```

### 3. Start Daemon

```bash
harmond
```

---

## Environment-Specific Behavior

| Environment | Encryption Secret | Behavior |
|-------------|------------------|----------|
| **Production** | Not set | Startup throws `HARMON_ENCRYPTION_SECRET is required in production.` |
| **Production** | Set | Starts with encryption |
| **Development** | Not set | Starts; logs `Credential encryption disabled — development only` plus a console WARNING block |
| **Development** | Set | Starts with encryption |

The development console warning looks like:

```
[harmond] WARNING: HARMON_ENCRYPTION_SECRET is not set.
[harmond] OAuth tokens will be stored UNENCRYPTED in the SQLite database.
[harmond] Set HARMON_ENCRYPTION_SECRET (32+ random characters) to encrypt credentials at rest.
```

---

## Check If Encryption Is Enabled

### View Daemon Logs

```bash
# Enabled:
"Credential encryption enabled"

# Disabled (only acceptable in dev):
"Credential encryption disabled — development only"
```

### Test Production Mode

```bash
# Should fail without encryption:
NODE_ENV=production HARMON_API_TOKEN=x harmond
# Expected: startup error 'HARMON_ENCRYPTION_SECRET is required in production.'

# Should succeed with encryption:
NODE_ENV=production HARMON_API_TOKEN=x \
  HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32) harmond
```

---

## FAQ

### Q: Do I need this for development?
**A:** No, but it's recommended. The daemon works but logs the warning above.

### Q: What if I already have tokens stored?
**A:** Daemon-stored plaintext tokens need re-authentication after enabling encryption. CLI auth files under `~/.chitragupta` keep loading as plaintext and are re-encrypted automatically on the next write.

### Q: Can I use the same secret across environments?
**A:** No! Use different secrets for dev, staging, and production.

### Q: How long should the secret be?
**A:** Minimum 32 characters. `openssl rand -base64 32` generates 44, which is perfect. A shorter secret is treated as unset by the token stores (with a console error).

### Q: Where should I store the secret?
**A:** In environment variables, never in code. Use secret management tools (AWS Secrets Manager, Vault, etc.) for production.

### Q: What happens if I lose or rotate the secret?
**A:** Encrypted credentials become unreadable — the daemon logs a key-mismatch warning (the v2 ciphertext embeds a key fingerprint) and you must re-authenticate providers.

---

## Ciphertext Format (v2)

Encrypted values use the format:
```
keyFingerprint:salt:iv:authTag:encrypted     (all hex-encoded)
```

- **keyFingerprint**: first 8 hex chars of SHA-256(derived key); detects key mismatches on decrypt
- **salt**: 32 random bytes for scrypt key derivation
- **iv**: 12 random bytes for AES-256-GCM
- **authTag**: 16-byte authentication tag
- **encrypted**: the ciphertext

Legacy v1 format (`salt:iv:authTag:encrypted`) is still supported for decryption. On-disk CLI auth files wrap the ciphertext in `{ "encrypted": true, "data": "..." }`.

---

## Security Best Practices

**DO:**
- Generate a unique secret for each environment
- Store secrets in environment variables
- Use secret management tools in production
- Rotate secrets periodically (expect provider re-auth after rotation)
- Keep secrets out of version control

**DON'T:**
- Hardcode secrets in your code
- Commit secrets to Git
- Share secrets between environments
- Use weak or short (<32 char) secrets

---

## Troubleshooting

### Issue: "Daemon won't start in production"

**Check:**
1. Is `NODE_ENV=production`?
2. Are `HARMON_ENCRYPTION_SECRET` **and** `HARMON_API_TOKEN` set? (production requires both)
3. Is the secret at least 32 characters?

### Issue: "Can't read existing tokens"

**Cause:** Encryption was just enabled, but daemon tokens were stored in plaintext — or the secret changed.

**Solution:** Re-authenticate the provider:
```bash
curl -X POST -H "Authorization: Bearer $HARMON_API_TOKEN" \
  http://localhost:17373/v1/auth/spotify/login
# Open the returned URL in a browser and complete OAuth
```

### Issue: "auth file is encrypted at rest" error from a provider auth CLI

**Cause:** The file under `~/.chitragupta/harmon/provider-packs/` was encrypted with a secret that is not currently set.

**Solution:** Set `HARMON_ENCRYPTION_SECRET` to the secret it was encrypted with, or delete the file and re-run `npm run auth`.

---

## Production Deployment Checklist

- [ ] Generated `HARMON_ENCRYPTION_SECRET` with `openssl rand -base64 32`
- [ ] Added secret to environment configuration
- [ ] Set `NODE_ENV=production` and `HARMON_API_TOKEN`
- [ ] Verified `Credential encryption enabled` in logs
- [ ] Completed provider OAuth flows
- [ ] Documented secret location for your team

---

## Summary

**Before (insecure):**
```bash
harmond          # tokens stored in plaintext, loud warning on console
```

**After (secure):**
```bash
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
harmond          # tokens encrypted with AES-256-GCM
```
