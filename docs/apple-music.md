## Apple Music Integration How-To

This guide covers configuring Apple Music for Harmon and using the API endpoints.

### Prerequisites — read before starting

- **Apple Developer Program membership ($99/year)** — required for the MusicKit key. There is no free tier for the Apple Music API.
- **Apple Music subscription** on your Apple ID — required for playback and library.
- macOS with the Music app for local playback.

Honest guidance: if you don't already pay for both, skip Apple Music — Spotify and YouTube Music cover playback without the membership fee.

### Getting the key material (recommended path: auto-JWT)

At [developer.apple.com/account](https://developer.apple.com/account) → Certificates, Identifiers & Profiles:

1. **Identifiers → + → Media IDs** (⚠️ not App IDs — it's a separate radio option). The identifier **must start with `media.`**, e.g. `media.com.you.harmon`.
2. **Keys → + →** name it, check **MusicKit**, associate the Media ID → Register → **download the `.p8`** — ⚠️ shown exactly once.
3. Note the **Key ID** (10 chars, on the key page) and your **Team ID** (10 chars, under Membership details — a *different* 10-char code; easy to mix up).

### Environment Variables

Recommended: key material with auto-generated, auto-refreshing JWTs. The private key is multi-line, so store it in the macOS Keychain ([secrets.md](secrets.md)):

```bash
 security add-generic-password -s harmon -a APPLE_MUSIC_PRIVATE_KEY -w "$(cat ~/Downloads/AuthKey_<KEYID>.p8)" -U
echo "APPLE_MUSIC_TEAM_ID=<team id>" >> .env
echo "APPLE_MUSIC_KEY_ID=<key id>" >> .env
```

The daemon mints the developer JWT itself at startup and regenerates it before expiry — no token pasting, nothing else to maintain.

> Note: reading a multi-line Keychain value back manually prints **hex** (`security -w` quirk). harmon decodes this automatically; for manual use pipe through `xxd -r -p`.

Alternative: a pre-generated static token (expires in ≤6 months, manual renewal):

```
APPLE_MUSIC_DEVELOPER_TOKEN=your_developer_token
APPLE_MUSIC_USER_TOKEN=your_user_token       # optional, library endpoints
APPLE_MUSIC_STOREFRONT=us
```

Notes:
- The user token (library access) is obtained via MusicKit JS in a browser: run `pnpm auth:apple`, or with the key in the Keychain:
  ```bash
  APPLE_MUSIC_PRIVATE_KEY="$(security find-generic-password -s harmon -a APPLE_MUSIC_PRIVATE_KEY -w | xxd -r -p)" pnpm auth:apple
  ```
- Restart the daemon after any credential change — configuration is read at startup.

### Start the Daemon

```
pnpm --filter @sriinnu/harmond start
```

### Endpoints

Search (songs, albums, artists, playlists):

```
curl "http://127.0.0.1:17373/v1/apple/search?q=daft%20punk&type=songs,albums&limit=10"
```

Catalog lookups:

```
curl "http://127.0.0.1:17373/v1/apple/songs/{songId}"
curl "http://127.0.0.1:17373/v1/apple/albums/{albumId}"
curl "http://127.0.0.1:17373/v1/apple/artists/{artistId}"
curl "http://127.0.0.1:17373/v1/apple/playlists/{playlistId}"
```

Library endpoints (require user token):

```
curl "http://127.0.0.1:17373/v1/apple/library/songs?limit=20"
curl "http://127.0.0.1:17373/v1/apple/library/albums?limit=20"
curl "http://127.0.0.1:17373/v1/apple/library/playlists?limit=20"
```

### AppleScript Playback (macOS)

AppleScript playback targets the Music app and works on macOS only:

```
curl -X POST http://127.0.0.1:17373/v1/apple/play \
  -H "Content-Type: application/json" \
  -d '{"url": "https://music.apple.com/us/album/1132331970"}'

curl -X POST http://127.0.0.1:17373/v1/apple/pause
curl -X POST http://127.0.0.1:17373/v1/apple/next
curl -X POST http://127.0.0.1:17373/v1/apple/prev
```

CLI example:

```
harmon play applemusic:album:1132331970 --engine applescript
```

If `HARMON_API_TOKEN` is set, include:

```
Authorization: Bearer $HARMON_API_TOKEN
```

### Auto-regenerating JWT

Instead of manually generating and rotating `APPLE_MUSIC_DEVELOPER_TOKEN`, the daemon can auto-generate the JWT from your Apple Music key material. Set these environment variables:

```
APPLE_MUSIC_TEAM_ID=your_apple_team_id
APPLE_MUSIC_KEY_ID=your_musickit_key_id
APPLE_MUSIC_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

When all three are present, the daemon generates a short-lived JWT on startup and regenerates it before expiry. You do not need to set `APPLE_MUSIC_DEVELOPER_TOKEN` when using auto-generation.

### Daemon Auth Endpoints

These endpoints manage the Apple Music user token, which is required for library and playback operations.

**Set user token** (obtained via MusicKit JS in a browser):
```
curl -X POST http://127.0.0.1:17373/v1/auth/apple/set-user-token \
  -H "Content-Type: application/json" \
  -d '{"userToken": "your_musickit_user_token"}'
```

**Refresh user token** (re-validates and extends the session):
```
curl -X POST http://127.0.0.1:17373/v1/auth/apple/refresh
```

**Logout** (clears the stored user token):
```
curl -X POST http://127.0.0.1:17373/v1/auth/apple/logout
```

### CLI Commands

```
harmon auth apple set-token <user-token>   # Store a MusicKit user token
harmon auth apple refresh                  # Refresh the current session
harmon auth apple logout                   # Clear stored Apple credentials
```

### Troubleshooting

- "Apple Music is not configured": set `APPLE_MUSIC_DEVELOPER_TOKEN` or the auto-JWT variables.
- "Apple Music user token required": set `APPLE_MUSIC_USER_TOKEN` or call `/v1/auth/apple/set-user-token`.
