# Managing secrets

How harmon finds credentials, and how to keep them out of plaintext files.

## Resolution order

Every harmon entry point (harmond, the `harmon` CLI, `harmon-mcp`) resolves configuration in the same order — first hit wins:

1. **Shell environment** — an exported variable always takes precedence.
2. **`./.env`** — loaded from the directory the process starts in (gitignored; convenient for non-secret config).
3. **macOS Keychain** — for the secret-shaped variables below, a missing value falls back to a Keychain lookup: service `harmon`, account = the variable name. Non-macOS platforms skip this step silently.

Keychain-backed variables:

```
HARMON_API_TOKEN
HARMON_ENCRYPTION_SECRET
SPOTIFY_CLIENT_SECRET
YOUTUBE_MUSIC_CLIENT_SECRET
APPLE_MUSIC_PRIVATE_KEY
APPLE_MUSIC_REMOTE_TOKEN
AUDD_API_TOKEN
```

## What goes where

| Kind | Examples | Home |
|---|---|---|
| Secrets | API token, encryption secret, client secrets, private keys | **Keychain** |
| Non-secret config | client IDs, redirect URIs, ports, storefront | `.env` |
| Provider OAuth tokens | Spotify/YouTube access + refresh tokens | Nowhere you manage — the daemon stores them AES-256-GCM-encrypted in SQLite |

## Keychain commands

`security` is Apple's built-in Keychain CLI (`/usr/bin/security`) — the same keychain Safari uses, encrypted by the OS, unlocked at login.

```bash
# Store (or update, thanks to -U):
security add-generic-password -s harmon -a YOUTUBE_MUSIC_CLIENT_SECRET -w '<secret>' -U

# Read back (this is exactly what harmond does at startup):
security find-generic-password -s harmon -a YOUTUBE_MUSIC_CLIENT_SECRET -w

# Remove:
security delete-generic-password -s harmon -a YOUTUBE_MUSIC_CLIENT_SECRET
```

Entries are visible in the **Keychain Access** app — search "harmon".

The first time harmond reads an entry, macOS may show a permission dialog ("security wants to use your confidential information") — choose **Always Allow** and it stays silent afterwards.

### Multi-line values print as hex

`security … -w` outputs **hex** instead of raw text when the stored value spans multiple lines (e.g. a PEM private key like `APPLE_MUSIC_PRIVATE_KEY`). harmon's loaders detect and decode this automatically. When reading manually, decode with:

```bash
security find-generic-password -s harmon -a APPLE_MUSIC_PRIVATE_KEY -w | xxd -r -p
```

Also: store the **file's contents**, not its path — `-w "$(cat AuthKey_XXXX.p8)"`.

## Migrating `HARMON_ENCRYPTION_SECRET` to the Keychain

This is the highest-value migration: it's the key that encrypts every stored OAuth token, and keeping it in a plaintext file next to the encrypted database is the classic key-taped-to-the-safe. Move it **with the exact same value**:

```bash
security add-generic-password -s harmon -a HARMON_ENCRYPTION_SECRET \
  -w "$(grep '^HARMON_ENCRYPTION_SECRET' .env | cut -d= -f2-)" -U
```

Restart the daemon and confirm it logs `Credential encryption enabled` and providers still show connected. **Only then** delete the line from `.env`.

> ⚠️ A *different* value would mean previously encrypted tokens no longer decrypt. That is not data loss — harmon reports a clear key-mismatch error and you re-authenticate each provider — but save yourself the round trip: copy the value, don't regenerate it.

## Shell-history hygiene

Typing `-w '<secret>'` puts the secret in your shell history. Either prefix the command with a space (with zsh's `HIST_IGNORE_SPACE` set), pull the value from where it already is (like the migration command above), or clean up afterwards:

```bash
history -d $((HISTCMD-1))
```

## Encryption at rest

`HARMON_ENCRYPTION_SECRET` (32+ chars; `openssl rand -base64 32`) encrypts every stored provider credential with **AES-256-GCM** (scrypt key derivation, `@sriinnu/harmon-crypto`): Spotify/YouTube OAuth tokens and Apple tokens in the SQLite `settings` table, plus the per-provider auth files under `~/.chitragupta/harmon/provider-packs/`. Journal, session, and event rows are local unencrypted SQLite data.

**Production enforces it.** With `NODE_ENV=production`, daemon construction throws `HARMON_ENCRYPTION_SECRET is required in production.` before accepting any traffic (the same validator requires `HARMON_API_TOKEN` in production or on non-loopback binds, and rejects `HARMON_CORS_ORIGINS=*`). In development the daemon starts but prints an unmissable plaintext-storage warning. Log lines to confirm: `Credential encryption enabled` vs `Credential encryption disabled — development only`.

Ciphertext format (v2): `keyFingerprint:salt:iv:authTag:encrypted`, all hex — the fingerprint detects key mismatches on decrypt; legacy v1 (`salt:iv:authTag:encrypted`) still decrypts. If the secret's *value* changes, existing credentials no longer decrypt: the daemon reports a clear key-mismatch error and you re-authenticate each provider. Legacy plaintext provider-pack files keep loading and are transparently re-encrypted on the next write.

## The safety nets underneath

Even if a secret does end up in `.env`, the file is gitignored and a pre-commit secret scanner guards the repo. The daemon warns loudly at startup when `HARMON_API_TOKEN` or `HARMON_ENCRYPTION_SECRET` is missing entirely, refuses non-loopback binds without a token, and the logger redacts token-shaped fields. Defense in depth — the Keychain is the top layer, not the only one.
