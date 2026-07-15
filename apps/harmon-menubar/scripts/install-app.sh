#!/usr/bin/env bash
#
# Build (via build-app.sh) and install the menubar app to /Applications
# (override with HARMON_MENUBAR_INSTALL_DIR), then launch it. Also seeds the
# repo path into the app's defaults so "Start daemon" works out of the box.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
INSTALL_DIR="${HARMON_MENUBAR_INSTALL_DIR:-/Applications}"
APP_NAME="Harmon"
APP_PATH="$INSTALL_DIR/$APP_NAME.app"
BUNDLE_ID="com.sriinnu.harmon.menubar"

bash "$SCRIPT_DIR/build-app.sh"
APP_BUNDLE="$PACKAGE_DIR/dist/$APP_NAME.app"

echo "▸ Installing to ${APP_PATH}…"
if pgrep -x HarmonMenubar > /dev/null; then
  # Quit via AppleScript so AppKit tears down the status item — a raw pkill
  # leaves a dead "ghost" icon in the menubar that swallows clicks.
  # (Try both names: pre-rename installs answer to "Harmon Menubar".)
  osascript -e 'tell application "Harmon" to quit' > /dev/null 2>&1 || true
  osascript -e 'tell application "Harmon Menubar" to quit' > /dev/null 2>&1 || true
  for _ in 1 2 3 4 5; do
    pgrep -x HarmonMenubar > /dev/null || break
    sleep 1
  done
  pkill -x HarmonMenubar 2> /dev/null || true
fi
rm -rf "$APP_PATH"
# Migration: clear the pre-rename bundle so two copies never coexist.
rm -rf "$INSTALL_DIR/Harmon Menubar.app"
ditto "$APP_BUNDLE" "$APP_PATH"

# A Finder-launched app has cwd=/ and no HARMON_REPO env, so it can't guess
# where the checkout lives. Seed it (the app persists later edits itself).
echo "▸ Pointing the app at this checkout…"
defaults write "$BUNDLE_ID" harmon.repoPath "$REPO_ROOT"

echo "▸ Launching…"
# LaunchServices can return -600 if the previous instance is still mid-exit.
for ATTEMPT in 1 2 3; do
  open "$APP_PATH" 2> /dev/null && break
  [ "$ATTEMPT" -eq 3 ] && { echo "  (auto-launch failed — open it from /Applications)"; break; }
  sleep 2
done

echo "✓ Installed: $APP_PATH"
echo "  Tip: System Settings → General → Login Items → add 'Harmon' to start it at login."
