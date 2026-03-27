# HARMON CLI spec (v0.1.0)

One-liner: daemon-first music control CLI for harmon.
Parser: Commander.
Output: human by default; `--plain` or `--json` for machine use.
Platforms: macOS, Linux, Windows. AppleScript playback is macOS-only.

## Usage

```bash
harmon [global flags] <command> [args]
```

## Global flags

- `-h, --help`
- `-V, --version`
- `-q, --quiet`
- `-v, --verbose`
- `-d, --debug`
- `--json`
- `--plain`
- `--no-color`
- `--timeout <dur>` default: `10s`
- `--market <cc>`
- `--provider <spotify|apple|youtube>` default: `spotify`
- `--device <name|id>`
- `--engine <connect|applescript>` default: `connect`

## Commands

### status

- `harmon status`

### auth

- `harmon auth status`
- `harmon auth import`
  - flags: `--browser <chrome|brave|edge|firefox|safari>` default: `chrome`
  - `--browser-profile <name>`
  - `--cookie-path <file>`
  - `--domain <host>` default: `spotify.com`
- `harmon auth clear`

### search

- `harmon search track <query> [--limit N] [--offset N]`
- `harmon search album <query> [--limit N] [--offset N]`
- `harmon search artist <query> [--limit N] [--offset N]`
- `harmon search playlist <query> [--limit N] [--offset N]`
- `harmon search episode <query> [--limit N] [--offset N]`
- `harmon search show <query> [--limit N] [--offset N]`

### session

- `harmon session start [--mode <mode>] [--duration <dur>] [--energy <n>] [--instrumental]`
  - session policy now carries the selected provider and provider-aware source defaults
- `harmon session stop`
- `harmon session nudge <calmer|sharper> [--amount <n>]`

### playback

- `harmon play [<idOrUrl>] [--type <track|album|playlist|artist|show|episode>]`
- `harmon pause`
- `harmon next`
- `harmon prev`
- `harmon seek <ms|mm:ss>`
- `harmon volume <0-100>`
- `harmon shuffle <on|off>`
- `harmon repeat <off|track|context>`

### devices

- `harmon device list`
- `harmon device set <nameOrId>`
- `harmon devices` legacy alias for `device list`
- `harmon use <device-id>` legacy alias for `device set`

### queue

- `harmon queue add <idOrUrl>`

## Playback engine contract

- `connect`: uses the daemon's Spotify playback/device surface.
- `applescript`: routes playback control to the macOS Music app.
- `--provider apple`: routes session and playback control through the Apple Music runtime; local playback is macOS-only.
- `--provider youtube`: routes playback through the daemon's browser-handoff YouTube runtime.
- Apple Music URLs and URIs auto-route to Apple playback for `play`.

## Output contract

- stdout carries primary command results.
- stderr carries errors and diagnostic output.
- `--plain` uses stable tab-separated fields.
- `--json` returns stable JSON payloads from the daemon or CLI wrapper.

## Exit codes

- `0` success
- `1` generic runtime failure
- `2` usage or validation error
- `3` authentication failure
- `4` network or daemon reachability failure
