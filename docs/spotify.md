## Spotify Integration How-To

This guide walks through connecting Spotify to Harmon and using the new browsing endpoints.

### Prerequisites

- Spotify Developer account
- A Spotify Developer app with a redirect URI set
- Harmon daemon running locally

### Create a Spotify App

1) Visit `https://developer.spotify.com/dashboard` and sign in.
2) Click "Create app" and finish setup.
3) Open the app "Settings".
4) Add redirect URI:
   - `http://127.0.0.1:17373/v1/auth/spotify/callback`
5) Save settings.

### Environment Variables

Set these before starting `harmond`:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:17373/v1/auth/spotify/callback
```

Optional (recommended if you access the daemon from a browser):

```
HARMON_API_TOKEN=your_api_token
HARMON_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Start the Daemon

```
pnpm --filter @athena/harmond start
```

### Authenticate Spotify

1) Get a login URL:

```
curl -X POST http://127.0.0.1:17373/v1/auth/spotify/login
```

2) Open the returned URL in a browser and approve access.
3) You should see "Spotify connected" in the callback page.
4) Verify:

```
curl http://127.0.0.1:17373/v1/status
```

If `HARMON_API_TOKEN` is set, add:

```
Authorization: Bearer $HARMON_API_TOKEN
```

### Cookie Import (Silo)

If you are already logged into Spotify in a browser, you can import cookies instead of OAuth:

```
harmon auth import --browser chrome
```

Notes:
- Uses the helper at `tools/harmon-silo` to read browser cookies via Silo.
- You can set `HARMON_SILO_HELPER` to a prebuilt helper binary to skip `swift run`.
- If you already have a cookie export JSON file, use `--cookie-path /path/to/cookies.json`.

### Endpoints

Search (tracks, albums, artists, playlists):

```
curl "http://127.0.0.1:17373/v1/spotify/search?q=daft%20punk&type=track,album&limit=10"
```

Playlists:

```
curl "http://127.0.0.1:17373/v1/spotify/playlists?limit=20"
```

Playlist tracks:

```
curl "http://127.0.0.1:17373/v1/spotify/playlists/{playlistId}/tracks?limit=50"
```

Recently played history:

```
curl "http://127.0.0.1:17373/v1/spotify/history?limit=20"
```

Saved library:

```
curl "http://127.0.0.1:17373/v1/spotify/library/tracks?limit=20"
curl "http://127.0.0.1:17373/v1/spotify/library/albums?limit=20"
```

### Scopes Used

Harmon requests these scopes:

- `user-read-playback-state`
- `user-modify-playback-state`
- `user-read-currently-playing`
- `playlist-read-private`
- `playlist-read-collaborative`
- `user-read-recently-played`
- `user-library-read`

If you add or change scopes, log out and re-authenticate:

```
curl -X POST http://127.0.0.1:17373/v1/auth/spotify/logout
curl -X POST http://127.0.0.1:17373/v1/auth/spotify/login
```

### Next Steps / TODOs

- Verify cookie import on macOS with Silo (ensure cookie extraction is implemented).
- Add tests around cookie-based auth and token refresh.

### Troubleshooting

- "Spotify not connected": verify auth flow completed and `SPOTIFY_CLIENT_ID` is correct.
- "Spotify token refresh failed": check `SPOTIFY_CLIENT_SECRET` and re-login.
- "Invalid redirect URI": make sure your Spotify app settings match `SPOTIFY_REDIRECT_URI`.
