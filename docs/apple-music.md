## Apple Music Integration How-To

This guide covers configuring Apple Music for Harmon and using the API endpoints.

### Prerequisites

- Apple Developer account (for Apple Music API access)
- Apple Music API developer token (JWT)
- Optional: Apple Music user token (for library endpoints)

### Environment Variables

Set these before starting `harmond`:

```
APPLE_MUSIC_DEVELOPER_TOKEN=your_developer_token
APPLE_MUSIC_USER_TOKEN=your_user_token
APPLE_MUSIC_STOREFRONT=us
```

Notes:
- The developer token is a JWT signed with your Apple Music private key.
- The user token is obtained via MusicKit JS in a browser client.

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
