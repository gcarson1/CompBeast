#!/usr/bin/env bash
#
# Runs the site locally over HTTPS and points the iOS app's next build at it.
#
#   npm run ios:dev            # then ▶︎ Run the App scheme in Xcode (a Debug build)
#   npm run ios:sync           # afterwards: point the app back at compbeast.app
#
# Why HTTPS: over plain http://localhost the app cannot even load a page.
# Clerk's development instance keeps its session handshake in `Secure`
# cookies, which WebKit refuses on an insecure origin, so every request loops
# through the handshake. A self-signed certificate for localhost fixes that;
# the app's Debug builds accept it for localhost only (NavigationGuard.swift),
# and nothing is installed in the system keychain — the certificate lives in
# .cert/ (git-ignored) and is trusted by nobody else.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
certs="${root}/.cert"
port="${PORT:-3443}"

if [[ ! -f "${certs}/localhost.pem" ]]; then
  mkdir -p "${certs}"
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -keyout "${certs}/localhost-key.pem" -out "${certs}/localhost.pem" 2>/dev/null
  echo "Made a self-signed certificate for localhost in .cert/"
fi

cd "${root}"
CAP_SERVER_URL="https://localhost:${port}" npx cap sync ios
echo
echo "The app now loads https://localhost:${port}. Run it from Xcode (Debug)."
echo "When you are done: npm run ios:sync  (back to https://compbeast.app)"
echo

exec npx next dev \
  --experimental-https \
  --experimental-https-key "${certs}/localhost-key.pem" \
  --experimental-https-cert "${certs}/localhost.pem" \
  -p "${port}"
