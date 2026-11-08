#!/usr/bin/env bash
#
# Builds the macOS desktop app for download from the website: a universal
# (Apple Silicon + Intel) RECAVO.app against production, signed with the
# Developer ID certificate, notarised by Apple, stapled, and wrapped in a .dmg.
# Then (unless --no-publish) attaches it to a GitHub release so it is served
# from a stable URL:
#
#   https://github.com/RichAppz/recavo-bookings-portal/releases/latest/download/RECAVO-mac.dmg
#
# Run it from your own Terminal, not an agent or CI: the .dmg step scripts
# Finder (macOS asks once to allow it) and signing may prompt for the keychain.
#
# Needs, once per machine:
#   - A "Developer ID Application: RichAppz Limited (P3VAW47988)" certificate in
#     the login keychain. Xcode → Settings → Accounts → RichAppz Limited →
#     Manage Certificates → + → Developer ID Application (account holder only).
#     "Apple Distribution" is NOT enough: Gatekeeper only accepts Developer ID
#     for apps that did not come from the App Store.
#   - The App Store Connect API key fastlane uses (~/.private_keys/AuthKey_*.p8),
#     which notarytool accepts as-is.
#   - `gh auth login` for publishing.
#
# Bump `version` in src-tauri/tauri.conf.json and src-tauri/Cargo.toml first;
# the release is tagged desktop-v<version> and a tag cannot be reused.

set -euo pipefail
cd "$(dirname "$0")/.."

TEAM_ID="P3VAW47988"
# Same key fastlane/Fastfile uses for TestFlight.
export APPLE_API_KEY="QLBXLNY339"
export APPLE_API_ISSUER="69a6de78-bc86-47e3-e053-5b8c7c11a4d1"
export APPLE_API_KEY_PATH="${APPLE_API_KEY_PATH:-$HOME/.private_keys/AuthKey_${APPLE_API_KEY}.p8}"

PUBLISH=1
for arg in "$@"; do
  case "$arg" in
    --no-publish) PUBLISH=0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

fail() { echo "error: $*" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------

export PATH="$HOME/.cargo/bin:$PATH"
command -v cargo >/dev/null || fail "Rust is not installed (curl https://sh.rustup.rs -sSf | sh)"
command -v xcrun >/dev/null || fail "Xcode command line tools are not installed"

IDENTITY="${APPLE_SIGNING_IDENTITY:-$(security find-identity -v -p codesigning \
  | sed -n 's/.*"\(Developer ID Application: [^"]*('"$TEAM_ID"')\)".*/\1/p' | head -1)}"
[ -n "$IDENTITY" ] || fail "no 'Developer ID Application' certificate for team $TEAM_ID in the keychain.
  Create one in Xcode → Settings → Accounts → Manage Certificates → + → Developer ID Application
  (you must be the account holder), then run this again."
export APPLE_SIGNING_IDENTITY="$IDENTITY"

[ -f "$APPLE_API_KEY_PATH" ] || fail "App Store Connect API key not found at $APPLE_API_KEY_PATH"

for target in aarch64-apple-darwin x86_64-apple-darwin; do
  rustup target list --installed | grep -qx "$target" || rustup target add "$target"
done

VERSION="$(node -p 'require("./src-tauri/tauri.conf.json").version')"
TAG="desktop-v$VERSION"
if [ "$PUBLISH" = 1 ]; then
  command -v gh >/dev/null || fail "GitHub CLI (gh) is not installed; pass --no-publish to only build"
  gh auth status >/dev/null 2>&1 || fail "run 'gh auth login' first, or pass --no-publish"
  if gh release view "$TAG" >/dev/null 2>&1; then
    fail "release $TAG already exists; bump the version in src-tauri/tauri.conf.json and Cargo.toml"
  fi
fi

echo "Signing as:  $APPLE_SIGNING_IDENTITY"
echo "Notarising:  API key $APPLE_API_KEY"
echo "Version:     $VERSION ($TAG)"
echo

# --- build -------------------------------------------------------------------

# Tauri signs the .app with the hardened runtime, submits it to notarytool,
# waits for the ticket, staples it, then builds and staples the .dmg.
npx tauri build \
  --target universal-apple-darwin \
  --config src-tauri/tauri.production.conf.json

BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"
DMG_SRC="$BUNDLE_DIR/dmg/RECAVO_${VERSION}_universal.dmg"
DMG="$BUNDLE_DIR/dmg/RECAVO-mac.dmg"
[ -f "$DMG_SRC" ] || fail "expected $DMG_SRC to exist after the build"
cp -f "$DMG_SRC" "$DMG"

# What a downloader's Mac will check, before anyone downloads it.
echo
echo "Verifying Gatekeeper acceptance…"
spctl --assess --type open --context context:primary-signature -v "$DMG"
xcrun stapler validate "$DMG"
xcrun stapler validate "$BUNDLE_DIR/macos/RECAVO.app"

echo
echo "Built: $DMG"

# --- publish -----------------------------------------------------------------

if [ "$PUBLISH" = 1 ]; then
  gh release create "$TAG" "$DMG" \
    --title "RECAVO for Mac $VERSION" \
    --notes "Universal macOS app (Apple Silicon + Intel), macOS 12 or later. Signed and notarised." \
    --latest
  echo
  echo "Published. Link this from the website:"
  echo "  https://github.com/RichAppz/recavo-bookings-portal/releases/latest/download/RECAVO-mac.dmg"
fi
