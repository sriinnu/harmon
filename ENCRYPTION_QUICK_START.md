# Harmon Encryption - Quick Start Guide

## TL;DR

**Production deployments now require encryption:**

```bash
# Generate and set encryption secret
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)

# Start daemon
export NODE_ENV=production
harmond
```

**Without this, the daemon will NOT start in production.**

---

## Why This Matters

Harmon stores sensitive Spotify OAuth tokens and cookies. In production, these **must** be encrypted. The daemon will refuse to start without encryption configured, preventing accidental security vulnerabilities.

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

## Error Messages

### ❌ If You See This:

```
❌ FATAL ERROR: Encryption is required in production

Harmon stores sensitive tokens (Spotify OAuth tokens, cookies) and requires
encryption to be enabled when running in production mode.

Please set HARMON_ENCRYPTION_SECRET environment variable:
  export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

### ✅ Fix It Like This:

```bash
# Generate and set secret
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)

# Restart daemon
harmond
```

---

## Environment-Specific Behavior

| Environment | Encryption Secret | Behavior |
|-------------|------------------|----------|
| **Production** | Not set | ❌ Fails to start (exit code 1) |
| **Production** | Set | ✅ Starts with encryption |
| **Development** | Not set | ⚠️ Starts with warning |
| **Development** | Set | ✅ Starts with encryption |

---

## Check If Encryption Is Enabled

### View Daemon Logs

```bash
# Look for this message:
"Token encryption enabled"

# Or this warning (only acceptable in dev):
"Token encryption disabled (HARMON_ENCRYPTION_SECRET not set)"
```

### Test Production Mode

```bash
# Should fail without encryption:
NODE_ENV=production harmond
# Expected: Exit with error

# Should succeed with encryption:
NODE_ENV=production HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32) harmond
# Expected: Starts normally
```

---

## FAQ

### Q: Do I need this for development?
**A:** No, but it's recommended. The daemon will work but show warnings.

### Q: What if I already have tokens stored?
**A:** You'll need to re-authenticate with Spotify after enabling encryption. Old plaintext tokens won't be readable.

### Q: Can I use the same secret across environments?
**A:** No! Use different secrets for dev, staging, and production.

### Q: How long should the secret be?
**A:** Minimum 32 characters. The command `openssl rand -base64 32` generates 44 characters, which is perfect.

### Q: Where should I store the secret?
**A:** In environment variables, never in code. Use secret management tools (AWS Secrets Manager, Vault, etc.) for production.

### Q: What happens if I lose the secret?
**A:** Encrypted tokens become unreadable. You'll need to re-authenticate with Spotify.

### Q: Can I rotate the secret?
**A:** Yes, but you'll need to re-authenticate after rotation.

---

## Security Best Practices

✅ **DO:**
- Generate a unique secret for each environment
- Store secrets in environment variables
- Use secret management tools in production
- Rotate secrets periodically
- Keep secrets out of version control

❌ **DON'T:**
- Hardcode secrets in your code
- Commit secrets to Git
- Share secrets between environments
- Use weak or short secrets
- Store secrets in plaintext files

---

## Troubleshooting

### Issue: "Daemon won't start in production"

**Check:**
1. Is `NODE_ENV=production`?
2. Is `HARMON_ENCRYPTION_SECRET` set?
3. Is the secret at least 32 characters?

**Solution:**
```bash
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

### Issue: "Can't read existing tokens"

**Cause:** Encryption was just enabled, but tokens were stored in plaintext.

**Solution:** Re-authenticate with Spotify:
```bash
# Get new login URL
curl -H "Authorization: Bearer $HARMON_API_TOKEN" \
  http://localhost:17373/v1/auth/spotify/login

# Open the URL in browser and complete OAuth flow
```

### Issue: "Warning about encryption in development"

**Not an error!** This is informational. To silence it:
```bash
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

---

## Production Deployment Checklist

Before deploying:

- [ ] Generated `HARMON_ENCRYPTION_SECRET` with `openssl rand -base64 32`
- [ ] Added secret to environment configuration
- [ ] Set `NODE_ENV=production`
- [ ] Tested daemon starts successfully
- [ ] Verified "Token encryption enabled" in logs
- [ ] Completed Spotify OAuth flow
- [ ] Documented secret location for your team
- [ ] Set up secret rotation schedule

---

## Alternative Secret Generation Methods

### OpenSSL (Recommended)
```bash
openssl rand -base64 32
```

### Node.js
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Python
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Manual (Not Recommended)
```bash
# Use a password manager to generate a 32+ character password
# Example: LastPass, 1Password, Bitwarden
```

---

## Getting Help

If you're still having issues:

1. Check logs: `LOG_LEVEL=debug harmond`
2. Verify environment: `env | grep HARMON`
3. Test encryption: See "Check If Encryption Is Enabled" above
4. Open an issue: [GitHub Issues](https://github.com/athena/harmon/issues)

---

## Summary

**Before (Insecure):**
```bash
# Tokens stored in plaintext 😱
harmond
```

**After (Secure):**
```bash
# Tokens encrypted with AES-256-GCM 🔐
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
harmond
```

**That's it!** Your Spotify tokens are now secure.
