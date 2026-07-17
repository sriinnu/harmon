# Releasing harmon

Everything is driven by GitHub Releases: publish a release with a `v*` tag
and CI does the rest.

## What ships where

| Artifact | Channel | Workflow job |
| --- | --- | --- |
| `@sriinnu/harmon` (CLI + daemon + MCP server + web UI) | npm, with provenance | `publish-npm` |
| `Harmon.app` (menubar app, signed + notarized when secrets exist) | GitHub Release asset | `publish-app` |
| `sriinnu/harmond` image (headless — no `/app` UI baked in yet) | Docker Hub | `publish-docker` |
| Homebrew cask | `sriinnu/homebrew-harmon` tap (manual bump from `packaging/homebrew/harmon.rb`) | — |

## Cutting a release

1. Bump versions: root `package.json` and `apps/harmon-cli/package.json`
   (the only public package). Keep them in lockstep.
2. Commit, PR, merge to `main`.
3. `gh release create v0.4.0 --generate-notes` (tag must match the version).
4. Watch the `Release` workflow. When it finishes:
   - `npm view @sriinnu/harmon version` shows the new version
   - the release page has `Harmon.app.zip`
5. Homebrew: update `version` + `sha256` in the tap from
   `packaging/homebrew/harmon.rb`.

## One-time setup (repo secrets)

- `NPM_TOKEN` — npm automation token scoped to `@sriinnu/harmon`
  (npmjs.com → Access Tokens → Granular, publish-only).
- `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` — Docker Hub push.
- macOS signing (optional; without these the app ships ad-hoc signed and
  users must right-click → Open on first launch):
  - `CODESIGN_IDENTITY` — `Developer ID Application: <Name> (<TEAMID>)`
  - `MACOS_CERT_P12` — the Developer ID certificate exported as .p12,
    base64-encoded (`base64 -i cert.p12 | pbcopy`)
  - `MACOS_CERT_PASSWORD` — password chosen at export
  - Notarization, preferred route — App Store Connect API key (create at
    appstoreconnect.apple.com → Users and Access → Integrations →
    App Store Connect API, role Developer):
    `ASC_API_KEY_P8` (the .p8 contents), `ASC_KEY_ID`, `ASC_ISSUER_ID`
  - Notarization fallback: `APPLE_ID` / `APPLE_TEAM_ID` /
    `APPLE_APP_PASSWORD` (app-specific password from account.apple.com)

Creating the Developer ID certificate (once): Xcode → Settings → Accounts →
Manage Certificates → + → Developer ID Application, then export it from
Keychain Access as .p12.

## What users get

- `npm i -g @sriinnu/harmon` → `harmon` (CLI), `harmond` (daemon, serves the
  web player at `http://127.0.0.1:17373/app`), `harmon-mcp` (MCP server).
  `harmon init` walks through provider credentials.
- `Harmon.app` → menubar app + notch island. Point it at a repo checkout or
  an npm-installed daemon.

## Licensing reminder

Distribution is AGPL-3.0-only (protocol package: Apache-2.0). Builds are
public, so the source must be public too — never ship builds from a private
fork without publishing the matching source.
