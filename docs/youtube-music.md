# YouTube Music setup

YouTube Music support runs on the official YouTube Data API v3 with OAuth. Every harmon install uses its **own** Google credentials (bring-your-own-credentials — see the note at the bottom), so this is a one-time, ~10-minute Google Cloud setup. Each gotcha below cost a real user real time; read the callouts.

## 1. Google Cloud project + API

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project (any name, e.g. `harmon`).
2. **APIs & Services → Library** → search **"YouTube Data API v3"** → **Enable**.

## 2. OAuth consent screen

**APIs & Services → OAuth consent screen** (newer console: the **Audience** tab):

- User type: **External**; fill only the required fields (app name, your email).
- Stay in **Testing** mode — no Google verification needed.
- ⚠️ **Add your own Google account under "Test users."** Skipping this yields `Error 403: access_denied` at login — the most common failure in this flow.

## 3. OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID**:

- Application type: **Web application** (not Desktop).
- **Authorized JavaScript origins: leave empty** — that's for browser JS; harmon exchanges the code server-side.
- **Authorized redirect URIs** — add exactly:
  ```
  http://127.0.0.1:17373/v1/auth/youtube/callback
  ```
  (`127.0.0.1`, not `localhost`; adjust the port only if you changed `HARMON_PORT` — and then set `YOUTUBE_MUSIC_REDIRECT_URI` to match.)
- Create → copy the **Client ID** (`…apps.googleusercontent.com`) and the **Client secret** (`GOCSPX-…`, 35 characters).

> ⚠️ Google shows the client secret **once**. If it's hidden later, use **"Add secret"** on the client page to mint a new one. And check the paste: a truncated secret produces `invalid_client: The provided client secret is invalid` at the token exchange — after the consent screen already succeeded, which makes it confusing. `harmon init` validates the length for you.

## 4. Configure harmon

Client ID is not a secret → `.env`. Client secret → macOS Keychain (or `.env` if you must; see [secrets.md](secrets.md)):

```bash
echo "YOUTUBE_MUSIC_CLIENT_ID=<client id>" >> .env
 security add-generic-password -s harmon -a YOUTUBE_MUSIC_CLIENT_SECRET -w '<client secret>' -U
```

**Restart the daemon** — it reads configuration at startup (menubar: power → Start daemon).

## 5. Log in

Menubar → **Connect** next to YouTube Music, or:

```bash
harmon auth youtube login     # opens the browser
```

Pick the Google account you allowlisted → Google shows an "unverified app" warning (normal for Testing mode — it's your own app) → Continue → approve. `harmon auth status` should show youtube `oauth`.

## Expectations (honest)

- **Playback is browser-handoff**: harmon opens/queues tracks in a browser tab (see the mini player at `/player/youtube`). There is deliberately **no pause** — the daemon can't reach into the tab.
- **Quota**: the free tier is 10,000 units/day and a search costs ~100 units per type — roughly 25–100 searches/day depending on usage. Fine for personal use; heavy `smart-search` sessions can exhaust it (harmon surfaces `quotaExceeded` clearly).
- **Testing-mode refresh tokens expire after ~7 days.** harmon auto-refreshes within the window; when it lapses, just Connect again. Publishing the app removes the limit but triggers Google's verification process — not worth it for personal use.
- Recommendations are a search-based heuristic (Google removed the related-videos API); "recently played" and "top tracks" come from harmon's local listening history.

## Bring-your-own-credentials

harmon is local-first: your Google client, your quota, your tokens, your machine. There is no shared app to allowlist against — which also means Google's "Test users" cap and Spotify's 25-user dev limit are non-issues: each install has exactly one user, its owner.
