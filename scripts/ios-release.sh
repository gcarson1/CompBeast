#!/usr/bin/env bash
#
# Archives the iOS app and uploads it to App Store Connect.
#
#   APPLE_TEAM_ID=XXXXXXXXXX npm run ios:release
#
# Needs: Xcode signed in to an Apple ID on the Apple Developer Program team
# (Xcode → Settings → Accounts), and the app record created in App Store
# Connect for bundle id `app.compbeast`. Signing is automatic: the first run
# registers the bundle id with Push Notifications and Associated Domains and
# makes the certificates and profiles it needs. Build numbers are assigned by
# App Store Connect on upload, so re-running never collides with an earlier
# build. See docs/app-store/README.md for the whole submission.
set -euo pipefail

if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "Set APPLE_TEAM_ID to your 10-character Team ID (developer.apple.com → Membership)." >&2
  exit 1
fi
if [[ -n "${CAP_SERVER_URL:-}" ]]; then
  echo "CAP_SERVER_URL is set (${CAP_SERVER_URL}); a release must load https://compbeast.app. Unset it." >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${root}/ios/build"
archive="${out}/CompBeast.xcarchive"
mkdir -p "${out}"

cd "${root}"
npx cap sync ios

cat > "${out}/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${APPLE_TEAM_ID}</string>
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <true/>
</dict>
</plist>
PLIST

xcodebuild archive \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "${archive}" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="${APPLE_TEAM_ID}"

xcodebuild -exportArchive \
  -archivePath "${archive}" \
  -exportOptionsPlist "${out}/ExportOptions.plist" \
  -exportPath "${out}/export" \
  -allowProvisioningUpdates

echo
echo "Uploaded. It appears in App Store Connect → TestFlight once Apple has processed it (usually 10–30 minutes)."
