# Encryption Enforcement in Production

## Summary

Harmon now **requires** encryption to be enabled in production environments. The daemon will refuse to start if `NODE_ENV=production` and `HARMON_ENCRYPTION_SECRET` is not set.

## Changes Made

### 1. Daemon Enforcement (apps/harmond/src/index.ts)

Added validation in the `Harmond` constructor:

```typescript
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
```

**Behavior:**
- In production (`NODE_ENV=production`): Daemon exits with code 1 if encryption is not configured
- In development: Daemon logs a warning but continues (for local development convenience)
- Clear error messages guide users on how to fix the issue

### 2. Store Validation Utilities (packages/harmon-store/src/index.ts)

Added static helper methods to `HarmonStore`:

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

**Usage:**
- Can be used by other packages that depend on harmon-store
- Provides a consistent way to check encryption requirements
- Reusable validation logic

### 3. Documentation Updates (README.md)

Updated multiple sections:

#### Security Section
- Added warning icon and bold emphasis
- Added explicit note that daemon will refuse to start
- Clarified the security rationale

#### Environment Variables Section
- Marked `HARMON_ENCRYPTION_SECRET` as **REQUIRED** in production
- Added explicit generation instructions
- Added note about exit behavior

#### Production Checklist
- Made encryption the most prominent item
- Added warning about startup failure
- Emphasized the safety mechanism

## Testing the Implementation

### Test Case 1: Production Without Encryption (Should Fail)
```bash
export NODE_ENV=production
unset HARMON_ENCRYPTION_SECRET
harmond
# Expected: Exits with code 1 and clear error message
```

### Test Case 2: Production With Encryption (Should Succeed)
```bash
export NODE_ENV=production
export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
harmond
# Expected: Starts normally with encryption enabled
```

### Test Case 3: Development Without Encryption (Should Warn)
```bash
export NODE_ENV=development
unset HARMON_ENCRYPTION_SECRET
harmond
# Expected: Starts with warning message in logs
```

## Security Rationale

### Why This Is Important

1. **Sensitive Data Storage**: Harmon stores OAuth tokens and cookies that provide full access to users' Spotify accounts
2. **Default Secure**: Makes the secure option (encryption) mandatory rather than optional in production
3. **Fail-Safe**: Prevents accidental deployment without encryption
4. **Clear Errors**: Provides actionable error messages to guide users

### What Is Protected

- Spotify OAuth access tokens
- Spotify OAuth refresh tokens
- Spotify session cookies (sp_dc, sp_key)
- Any future authentication credentials

### Encryption Method

- Algorithm: AES-256-GCM (authenticated encryption)
- Implementation: `@sriinnu/harmon-crypto` package
- Storage: Encrypted data stored in SQLite `settings` table

## Migration Guide

If you're upgrading from a previous version:

### For Production Deployments

1. Generate a secure encryption secret:
   ```bash
   export HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
   ```

2. Add it to your environment configuration:
   - Docker: Add to `docker-compose.yml` or `.env` file
   - Systemd: Add to service environment file
   - PM2: Add to ecosystem config

3. **Important**: If you already have tokens stored in plaintext, they will need to be re-authenticated after enabling encryption

4. Restart the daemon - it will now start with encryption enabled

### For Development

No action required - the daemon will continue to work but will log warnings. However, we recommend enabling encryption in development too for testing purposes.

## Environment Variable Reference

```bash
# Production (required)
HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)

# Development (optional but recommended)
HARMON_ENCRYPTION_SECRET=$(openssl rand -base64 32)
```

**Length Requirements:**
- Minimum: 32 characters (enforced by harmon-crypto package)
- Recommended: 44 characters (32 bytes base64-encoded)

**Generation Commands:**
```bash
# OpenSSL (recommended)
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Files Modified

1. `/apps/harmond/src/index.ts` - Added production enforcement check
2. `/packages/harmon-store/src/index.ts` - Added validation utility methods
3. `/README.md` - Updated documentation in 3 sections

## Backward Compatibility

- **Breaking Change**: Production deployments without `HARMON_ENCRYPTION_SECRET` will no longer start
- **Development**: No breaking changes - works as before with warnings
- **Migration**: Requires setting environment variable before upgrading

## Related Issues

This change addresses the security concern of accidentally deploying the daemon in production without encryption, which would store OAuth tokens in plaintext in the SQLite database.

## Next Steps

Consider adding:
1. Integration tests that verify the production enforcement
2. Startup healthcheck that validates encryption is enabled
3. Admin API endpoint to check encryption status
4. Token migration utility for upgrading from plaintext to encrypted storage
