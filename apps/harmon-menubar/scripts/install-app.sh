#!/usr/bin/env bash
#
# Build the menubar app as a proper macOS .app bundle and install it to
# /Applications (override with HARMON_MENUBAR_INSTALL_DIR). Ad-hoc signed;
# LSUIElement so it never shows a Dock icon.
#
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
INSTALL_DIR="${HARMON_MENUBAR_INSTALL_DIR:-/Applications}"
APP_NAME="Harmon Menubar"
APP_PATH="$INSTALL_DIR/$APP_NAME.app"
VERSION="$(git -C "$REPO_ROOT" describe --tags --always 2>/dev/null || echo 0.1.0)"

echo "▸ Building release binary…"
swift build --package-path "$PACKAGE_DIR" -c release > /dev/null
BINARY="$PACKAGE_DIR/.build/release/HarmonMenubar"
[ -x "$BINARY" ] || { echo "build produced no binary" >&2; exit 1; }

echo "▸ Assembling bundle…"
STAGING="$(mktemp -d)/$APP_NAME.app"
mkdir -p "$STAGING/Contents/MacOS" "$STAGING/Contents/Resources"
cp "$BINARY" "$STAGING/Contents/MacOS/HarmonMenubar"

cat > "$STAGING/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>HarmonMenubar</string>
  <key>CFBundleIdentifier</key><string>com.sriinnu.harmon.menubar</string>
  <key>CFBundleName</key><string>Harmon Menubar</string>
  <key>CFBundleDisplayName</key><string>Harmon Menubar</string>
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

# Icon: render the repo logo (SVG) into an .icns. Best effort — a missing
# icon never blocks the install.
ICONSET="$(mktemp -d)/Harmon.iconset"
mkdir -p "$ICONSET"
PNG_1024="$(mktemp -d)/harmon-1024.png"
if qlmanage -t -s 1024 -o "$(dirname "$PNG_1024")" "$REPO_ROOT/logo.svg" > /dev/null 2>&1 \
  && mv "$(dirname "$PNG_1024")/logo.svg.png" "$PNG_1024" 2>/dev/null; then
  for SIZE in 16 32 64 128 256 512; do
    sips -z "$SIZE" "$SIZE" "$PNG_1024" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" > /dev/null
    DOUBLE=$((SIZE * 2))
    sips -z "$DOUBLE" "$DOUBLE" "$PNG_1024" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" > /dev/null
  done
  if iconutil -c icns "$ICONSET" -o "$STAGING/Contents/Resources/Harmon.icns" 2>/dev/null; then
    echo "▸ Icon rendered from logo.svg"
  fi
else
  echo "▸ Icon skipped (SVG render unavailable) — using the system default"
fi

echo "▸ Signing (ad-hoc)…"
codesign --force --deep -s - "$STAGING" > /dev/null 2>&1 || echo "  (codesign unavailable — unsigned bundle)"

echo "▸ Installing to ${APP_PATH}…"
if pgrep -x HarmonMenubar > /dev/null; then
  pkill -x HarmonMenubar || true
  sleep 1
fi
rm -rf "$APP_PATH"
mv "$STAGING" "$APP_PATH"

echo "▸ Launching…"
open "$APP_PATH"

echo "✓ Installed: $APP_PATH"
echo "  Tip: System Settings → General → Login Items → add 'Harmon Menubar' to start it at login."
