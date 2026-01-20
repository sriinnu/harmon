# HARMON CLI spec (v0.2.0)

One-liner: Spotify power CLI using web cookies; search + playback control.
Parser: Kong.
Cookies: https://github.com/sriinnu/Silo
Output: human by default; `--plain` or `--json`.
Color: on by default; respects `NO_COLOR`, `TERM=dumb`, `--no-color`.
Platforms: macOS, Linux, Windows.

## Usage

```
HARMON [global flags] <command> [args]
```

## Global flags

- `-h, --help`
- `--version`
- `-q, --quiet`
- `-v, --verbose`
- `-d, --debug`
- `--json`
- `--plain`
- `--no-color`
- `--config <path>` default: `os.UserConfigDir()/HARMON/config.toml`
- `--profile <name>` default: `default`
- `--timeout <dur>` default: `10s`
- `--market <cc>` default: account market or `US`
- `--language <tag>` default: `en`
- `--device <name|id>` default: active device
- `--engine <auto|web|connect|applescript>` default: `connect` (`applescript` is macOS-only)
- `--no-input`

## Commands

### auth

- `HARMON auth status`
- `HARMON auth import`
  - flags: `--browser <chrome|brave|edge|firefox|safari>` default: `chrome`
  - `--browser-profile <name>`
  - `--cookie-path <file>`
  - `--domain <host>` default `spotify.com`
- `HARMON auth clear`

### search

- `HARMON search track <query> [--limit N] [--offset N]`
- `HARMON search album <query> [--limit N] [--offset N]`
- `HARMON search artist <query> [--limit N] [--offset N]`
- `HARMON search playlist <query> [--limit N] [--offset N]`
- `HARMON search episode <query> [--limit N] [--offset N]`
- `HARMON search show <query> [--limit N] [--offset N]`

### info

- `HARMON track info <id|url>`
- `HARMON album info <id|url>`
- `HARMON artist info <id|url>`
- `HARMON playlist info <id|url>`
- `HARMON show info <id|url>`
- `HARMON episode info <id|url>`

### playback

- `HARMON play [<id|url>]` (track/album/playlist/show)
  - optional: `--type <track|album|playlist|show|episode>` for raw IDs
  - artist URIs play top tracks (starts with the first)
- `HARMON pause`
- `HARMON next`
- `HARMON prev`
- `HARMON seek <ms|mm:ss>`
- `HARMON volume <0-100>`
- `HARMON shuffle <on|off>`
- `HARMON repeat <off|track|context>`
- `HARMON status`

### queue

- `HARMON queue add <id|url>`
- `HARMON queue show`
- `HARMON queue clear` (not supported by Spotify API yet)

### library

- `HARMON library tracks list [--limit N]`
- `HARMON library tracks add <id|url...>`
- `HARMON library tracks remove <id|url...>`
- `HARMON library albums list [--limit N]`
- `HARMON library albums add <id|url...>`
- `HARMON library albums remove <id|url...>`
- `HARMON library artists list [--limit N] [--after <artist-id>]`
- `HARMON library artists follow <id|url...>`
- `HARMON library artists unfollow <id|url...>`
- `HARMON library playlists list [--limit N]`

### playlists

- `HARMON playlist create <name> [--public] [--collab]`
- `HARMON playlist add <playlist> <track...>`
- `HARMON playlist remove <playlist> <track...>`
- `HARMON playlist tracks <playlist> [--limit N]`

### devices

- `HARMON device list`
- `HARMON device set <name|id>`

## Output contract

- stdout: primary results; human or machine modes.
- stderr: warnings/errors/logs.
- `--plain`: stable, line-oriented, tab-separated fields.
- `--json`: stable, documented keys per command.

## Engines

- `auto`: connect first; fall back to web for unsupported features or rate limits.
- `connect`: internal connect-state endpoints for playback; GraphQL for search/info.
- `web`: Web API endpoints; search/info/playback auto-fallback to connect when rate limited.

## Exit codes

- `0` success
- `1` generic failure
- `2` invalid usage/validation
- `3` auth/cookies missing or invalid
- `4` network/timeouts

## Config / env

- Env prefix: `HARMON_`
- Precedence: flags > env > config
- Secrets: never via flags; use browser cookies only.
- Overrides:
  - `HARMON_TOTP_SECRET_URL` (http(s) or `file://...`)
  - `HARMON_CONNECT_VERSION` (connect playback client version)

## Examples

- ` auth import --browser chrome`
- `HARMON search track "weezer" --limit 5 --plain`
- `HARMON play spotify:track:7hQJA50XrCWABAu5v6QZ4i`
- `HARMON device list --json`
- `HARMON playlist create "Road Trip" --public`