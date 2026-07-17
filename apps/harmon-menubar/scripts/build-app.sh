#!/usr/bin/env bash
#
# Build the menubar app as a proper macOS .app bundle into
# apps/harmon-menubar/dist/. Ad-hoc signed; LSUIElement so it never shows a
# Dock icon. Install it with install-app.sh (or `pnpm menubar:install`).
#
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
APP_NAME="Harmon"
DIST_DIR="$PACKAGE_DIR/dist"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
VERSION="$(git -C "$REPO_ROOT" describe --tags --always 2>/dev/null || echo 0.1.0)"
# CFBundleShortVersionString wants dotted numerics — strip the tag's v prefix.
VERSION="${VERSION#v}"

echo "▸ Building release binary…"
swift build --package-path "$PACKAGE_DIR" -c release > /dev/null
BINARY="$PACKAGE_DIR/.build/release/HarmonMenubar"
[ -x "$BINARY" ] || { echo "build produced no binary" >&2; exit 1; }

echo "▸ Assembling bundle…"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
cp "$BINARY" "$APP_BUNDLE/Contents/MacOS/HarmonMenubar"

cat > "$APP_BUNDLE/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>HarmonMenubar</string>
  <key>CFBundleIdentifier</key><string>com.sriinnu.harmon.menubar</string>
  <key>CFBundleName</key><string>Harmon</string>
  <key>CFBundleDisplayName</key><string>Harmon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleIconFile</key><string>Harmon</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# Icon: render the app icon SVG (falls back to the repo logo) into an .icns.
# Best effort — a missing icon never blocks the build.
ICON_SVG="$PACKAGE_DIR/scripts/icon.svg"
[ -f "$ICON_SVG" ] || ICON_SVG="$REPO_ROOT/logo.svg"
ICON_NAME="$(basename "$ICON_SVG")"
ICONSET="$(mktemp -d)/Harmon.iconset"
mkdir -p "$ICONSET"
PNG_1024="$(mktemp -d)/harmon-1024.png"
if qlmanage -t -s 1024 -o "$(dirname "$PNG_1024")" "$ICON_SVG" > /dev/null 2>&1 \
  && mv "$(dirname "$PNG_1024")/$ICON_NAME.png" "$PNG_1024" 2>/dev/null; then
  for SIZE in 16 32 64 128 256 512; do
    sips -z "$SIZE" "$SIZE" "$PNG_1024" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" > /dev/null
    DOUBLE=$((SIZE * 2))
    sips -z "$DOUBLE" "$DOUBLE" "$PNG_1024" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" > /dev/null
  done
  if iconutil -c icns "$ICONSET" -o "$APP_BUNDLE/Contents/Resources/Harmon.icns" 2>/dev/null; then
    echo "▸ Icon rendered from $ICON_NAME"
  fi
else
  echo "▸ Icon skipped (SVG render unavailable) — using the system default"
fi

# Signing: Developer ID + notarization when credentials are provided
# (CI release builds); ad-hoc otherwise (local dev — fine on this machine,
# Gatekeeper-blocked on others).
if [ -n "${CODESIGN_IDENTITY:-}" ]; then
  echo "▸ Signing ($CODESIGN_IDENTITY)…"
  codesign --force --deep --options runtime --timestamp -s "$CODESIGN_IDENTITY" "$APP_BUNDLE"

  # Notarization auth, preferred route first:
  #   1. App Store Connect API key — ASC_KEY_ID + ASC_ISSUER_ID + the key as
  #      either ASC_API_KEY_PATH (file) or ASC_API_KEY_P8 (contents, CI secret)
  #   2. Apple ID + app-specific password (APPLE_ID/APPLE_TEAM_ID/APPLE_APP_PASSWORD)
  NOTARY_ARGS=()
  if [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then
    KEY_FILE="${ASC_API_KEY_PATH:-}"
    if [ -z "$KEY_FILE" ] && [ -n "${ASC_API_KEY_P8:-}" ]; then
      KEY_FILE="$(mktemp -d)/AuthKey_${ASC_KEY_ID}.p8"
      printf '%s' "$ASC_API_KEY_P8" > "$KEY_FILE"
    fi
    if [ -n "$KEY_FILE" ]; then
      NOTARY_ARGS=(--key "$KEY_FILE" --key-id "$ASC_KEY_ID" --issuer "$ASC_ISSUER_ID")
    fi
  fi
  if [ ${#NOTARY_ARGS[@]} -eq 0 ] && [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ] && [ -n "${APPLE_APP_PASSWORD:-}" ]; then
    NOTARY_ARGS=(--apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD")
  fi

  if [ ${#NOTARY_ARGS[@]} -gt 0 ]; then
    echo "▸ Notarizing (this takes a few minutes)…"
    NOTARIZE_ZIP="$(mktemp -d)/Harmon.zip"
    ditto -c -k --keepParent "$APP_BUNDLE" "$NOTARIZE_ZIP"
    xcrun notarytool submit "$NOTARIZE_ZIP" "${NOTARY_ARGS[@]}" --wait
    xcrun stapler staple "$APP_BUNDLE"
    echo "▸ Notarized and stapled"
  else
    echo "▸ Notarization skipped (set ASC_KEY_ID/ASC_ISSUER_ID + key, or APPLE_ID/APPLE_TEAM_ID/APPLE_APP_PASSWORD)"
  fi
else
  echo "▸ Signing (ad-hoc)…"
  codesign --force --deep -s - "$APP_BUNDLE" > /dev/null 2>&1 || echo "  (codesign unavailable — unsigned bundle)"
fi

echo "✓ Built: $APP_BUNDLE"
