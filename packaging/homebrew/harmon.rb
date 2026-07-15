# Homebrew cask for the Harmon menubar app.
#
# Lives in the tap repo `sriinnu/homebrew-harmon` as Casks/harmon.rb —
# this copy is the template kept in-tree. After each release:
#   1. Update `version`
#   2. Update `sha256` (shasum -a 256 Harmon.app.zip)
#   3. Push to the tap repo
#
# Install: brew install --cask sriinnu/harmon/harmon
cask "harmon" do
  version "0.4.0"
  sha256 "REPLACE_WITH_RELEASE_ZIP_SHA256"

  url "https://github.com/sriinnu/harmon/releases/download/v#{version}/Harmon.app.zip"
  name "Harmon"
  desc "Policy-driven music daemon menubar app — Spotify, Apple Music, YouTube Music"
  homepage "https://github.com/sriinnu/harmon"

  depends_on macos: ">= :sonoma"

  app "Harmon.app"

  zap trash: [
    "~/Library/Preferences/com.sriinnu.harmon.menubar.plist",
  ]
end
