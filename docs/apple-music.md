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

### Troubleshooting

- "Apple Music is not configured": set `APPLE_MUSIC_DEVELOPER_TOKEN`.
- "Apple Music user token required": set `APPLE_MUSIC_USER_TOKEN` for library endpoints.
