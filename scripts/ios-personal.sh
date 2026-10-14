#!/usr/bin/env bash
#
# Lets the iOS app be signed with a free Apple ID ("Personal Team") so it can
# run on your own iPhone without the paid Apple Developer Program.
#
#   npm run ios:personal           # sign without push + associated domains
#   npm run ios:personal -- off    # back to the full app (paid account)
#
# A free Apple ID cannot sign Push Notifications or Associated Domains, and
# Xcode refuses to build an app that asks for them. This writes
# ios/App/Signing.local.xcconfig (git-ignored), which ios/App/Signing.xcconfig
# includes, to leave the entitlements out. Everything else in the app works;
# see docs/iphone-without-the-app-store.md for what does not.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
local_config="${root}/ios/App/Signing.local.xcconfig"

if [[ "${1:-on}" == "off" ]]; then
  rm -f "${local_config}"
  echo "Back to full signing: push notifications and associated domains are on."
  exit 0
fi

cat > "${local_config}" <<'XCCONFIG'
// Written by `npm run ios:personal`: a free Apple ID cannot sign push
// notifications or associated domains, so the app is signed without them.
// Remove with `npm run ios:personal -- off`.
CODE_SIGN_ENTITLEMENTS =
XCCONFIG

cd "${root}"
npx cap sync ios >/dev/null
echo "Free-account signing is on."
echo "Next: npm run ios:open, then App target → Signing & Capabilities → Team: \"<your name> (Personal Team)\","
echo "pick your iPhone as the run destination and press ▶︎. Full steps: docs/iphone-without-the-app-store.md"
