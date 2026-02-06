# Encryption Enforcement - Code Changes Summary

## Overview
This document shows the exact code changes made to enforce encryption in production.

---

## 1. apps/harmond/src/index.ts

### Location: Constructor (lines ~128-135)

**BEFORE:**
```typescript
// Initialize encryption if secret provided
const encryptionSecret = process.env.HARMON_ENCRYPTION_SECRET;
if (encryptionSecret) {
  this.encryptor = createEncryptor({ secret: encryptionSecret });
  this.logger.info('Token encryption enabled');
} else {
  this.logger.warn('Token encryption disabled (HARMON_ENCRYPTION_SECRET not set)');
}
```

**AFTER:**
```typescript
// Initialize encryption if secret provided
const encryptionSecret = process.env.HARMON_ENCRYPTION_SECRET;

// Enforce encryption in production
if (process.env.NODE_ENV === 'production' && !encryptionSecret) {
  this.logger.error({
    message: 'Encryption is required in production',
    hint: 'Set HARMON_ENCRYPTION_SECRET environment variable (min 32 characters)',
    example: 'export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)',
  }, 'FATAL: Missing required encryption configuration');
  console.error('\n❌ FATAL ERROR: Encryption is required in production\n');
  console.error('Harmon stores sensitive tokens (Spotify OAuth tokens, cookies) and requires');
  console.error('encryption to be enabled when running in production mode.\n');
  console.error('Please set HARMON_ENCRYPTION_SECRET environment variable:');
  console.error('  export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)\n');
  console.error('The encryption secret must be at least 32 characters long.\n');
  process.exit(1);
}

if (encryptionSecret) {
  this.encryptor = createEncryptor({ secret: encryptionSecret });
  this.logger.info('Token encryption enabled');
} else {
  this.logger.warn('Token encryption disabled (HARMON_ENCRYPTION_SECRET not set)');
  this.logger.warn('This is only acceptable in development. DO NOT run in production without encryption.');
}
```

**Key Changes:**
- Added production environment check
- Daemon exits with code 1 if encryption is missing in production
- Enhanced error messages with clear instructions
- Added additional warning for development mode

---

## 2. packages/harmon-store/src/index.ts

### Location: End of HarmonStore class (after getDbPath method)

**ADDED:**
```typescript
/**
 * Validate encryption is enabled in production
 * This should be called after the store is initialized
 */
static validateEncryptionInProduction(encryptionEnabled: boolean): void {
  if (process.env.NODE_ENV === 'production' && !encryptionEnabled) {
    throw new Error(
      'Encryption is required in production. Set HARMON_ENCRYPTION_SECRET environment variable.'
    );
  }
}

/**
 * Check if encryption should be required based on environment
 */
static isEncryptionRequired(): boolean {
  return process.env.NODE_ENV === 'production';
}
```

**Purpose:**
- Provides reusable validation utilities
- Can be used by other packages that depend on harmon-store
- Consistent error messaging across the codebase

---

## 3. README.md

### Section: "Production Requirements"

**BEFORE:**
```markdown
### Production Requirements

Harmon enforces strict security in production environments:

- ✅ **API Token Required**: Set `HARMON_API_TOKEN` (required in production)
- ✅ **Encryption Required**: Set `HARMON_ENCRYPTION_SECRET` for token/cookie encryption
- ✅ **CORS Whitelist**: No wildcard origins allowed in production
- ✅ **Rate Limiting**: Automatic protection against abuse
- ✅ **Timing-Safe Auth**: Constant-time token comparison prevents timing attacks
```

**AFTER:**
```markdown
### Production Requirements

Harmon enforces strict security in production environments:

- ✅ **API Token Required**: Set `HARMON_API_TOKEN` (required in production)
- 🔐 **Encryption REQUIRED**: Set `HARMON_ENCRYPTION_SECRET` (min 32 chars) - **daemon will not start without it**
- ✅ **CORS Whitelist**: No wildcard origins allowed in production
- ✅ **Rate Limiting**: Automatic protection against abuse
- ✅ **Timing-Safe Auth**: Constant-time token comparison prevents timing attacks

**⚠️ Critical**: The daemon will **refuse to start** in production (`NODE_ENV=production`) if `HARMON_ENCRYPTION_SECRET` is not set. This prevents accidental plaintext storage of Spotify OAuth tokens and cookies.
```

### Section: "Environment Variables - Required in Production"

**BEFORE:**
```markdown
#### Required in Production
```bash
HARMON_API_TOKEN=your_api_token              # API authentication
HARMON_ENCRYPTION_SECRET=your_secret         # Token/cookie encryption (min 32 chars)
HARMON_CORS_ORIGINS=https://app.example.com  # Comma-separated, no wildcards
SPOTIFY_CLIENT_ID=your_client_id             # Spotify OAuth
```

**AFTER:**
```markdown
#### Required in Production
```bash
HARMON_API_TOKEN=your_api_token              # API authentication
HARMON_ENCRYPTION_SECRET=your_secret         # Token/cookie encryption (min 32 chars) - REQUIRED
HARMON_CORS_ORIGINS=https://app.example.com  # Comma-separated, no wildcards
SPOTIFY_CLIENT_ID=your_client_id             # Spotify OAuth
```

**Note**: `HARMON_ENCRYPTION_SECRET` is **mandatory** in production. The daemon will exit with code 1 if this is not set when `NODE_ENV=production`. Generate a secure secret using:
```bash
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

### Section: "Production Checklist"

**BEFORE:**
```markdown
## Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Generate and set `HARMON_API_TOKEN`
- [ ] Generate and set `HARMON_ENCRYPTION_SECRET` (min 32 chars)
- [ ] Configure `HARMON_CORS_ORIGINS` (no wildcards)
- [ ] Set up Spotify OAuth credentials
- [ ] Configure logging level (`LOG_LEVEL=info`)
- [ ] Set up process manager (PM2, systemd)
- [ ] Configure reverse proxy (nginx, caddy)
- [ ] Set up SSL/TLS certificates
- [ ] Monitor logs and error rates
- [ ] Set up database backups
```

**AFTER:**
```markdown
## Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Generate and set `HARMON_API_TOKEN`
- [ ] **Generate and set `HARMON_ENCRYPTION_SECRET` (min 32 chars) - MANDATORY**
- [ ] Configure `HARMON_CORS_ORIGINS` (no wildcards)
- [ ] Set up Spotify OAuth credentials
- [ ] Configure logging level (`LOG_LEVEL=info`)
- [ ] Set up process manager (PM2, systemd)
- [ ] Configure reverse proxy (nginx, caddy)
- [ ] Set up SSL/TLS certificates
- [ ] Monitor logs and error rates
- [ ] Set up database backups

**⚠️ Important**: The daemon will not start if `HARMON_ENCRYPTION_SECRET` is missing in production. This is a safety mechanism to prevent accidental plaintext token storage.
```

---

## Testing Matrix

| Scenario | NODE_ENV | HARMON_ENCRYPTION_SECRET | Expected Behavior |
|----------|----------|--------------------------|-------------------|
| Production without encryption | `production` | (not set) | ❌ Exit with code 1 + error message |
| Production with encryption | `production` | (set) | ✅ Start normally |
| Development without encryption | `development` | (not set) | ⚠️ Start with warning |
| Development with encryption | `development` | (set) | ✅ Start normally |
| No NODE_ENV without encryption | (not set) | (not set) | ⚠️ Start with warning |
| No NODE_ENV with encryption | (not set) | (set) | ✅ Start normally |

---

## Error Message Example

When daemon fails to start in production:

```
❌ FATAL ERROR: Encryption is required in production

Harmon stores sensitive tokens (Spotify OAuth tokens, cookies) and requires
encryption to be enabled when running in production mode.

Please set HARMON_ENCRYPTION_SECRET environment variable:
  export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)

The encryption secret must be at least 32 characters long.
```

**Plus structured log:**
```json
{
  "level": "error",
  "time": 1704067200000,
  "name": "harmond",
  "message": "FATAL: Missing required encryption configuration",
  "hint": "Set HARMON_ENCRYPTION_SECRET environment variable (min 32 characters)",
  "example": "export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)"
}
```

---

## Files Changed

1. **apps/harmond/src/index.ts** (27 lines added)
2. **packages/harmon-store/src/index.ts** (16 lines added)
3. **README.md** (multiple sections updated)

---

## Deployment Guide

### Step 1: Generate Secret
```bash
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

### Step 2: Add to Environment
**Docker Compose:**
```yaml
environment:
  - NODE_ENV=production
  - HARMON_ENCRYPTION_SECRET=${HARMON_ENCRYPTION_SECRET}
```

**Systemd:**
```ini
[Service]
Environment="NODE_ENV=production"
Environment="HARMON_ENCRYPTION_SECRET=your_secret_here"
```

**PM2:**
```json
{
  "env": {
    "NODE_ENV": "production",
    "HARMON_ENCRYPTION_SECRET": "your_secret_here"
  }
}
```

### Step 3: Restart Daemon
```bash
# Will now require encryption
harmond
```

---

## Security Benefits

1. **Prevents Plaintext Storage**: OAuth tokens and cookies are always encrypted in production
2. **Fail-Safe Design**: Daemon refuses to start rather than defaulting to insecure mode
3. **Clear Errors**: Users immediately know what to fix
4. **Environment-Aware**: Development remains flexible, production is strict
5. **Defense in Depth**: Multiple layers of security enforcement

---

## Backward Compatibility

**Breaking Change for Production:**
- Existing production deployments without `HARMON_ENCRYPTION_SECRET` will fail to start
- Action Required: Set the environment variable before upgrading

**No Breaking Change for Development:**
- Development continues to work as before
- Warning messages added but no behavior change
