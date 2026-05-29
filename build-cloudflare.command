#!/bin/zsh
set -e

cd "$(dirname "$0")"

NODE="/Applications/Codex.app/Contents/Resources/node"
if [ ! -x "$NODE" ]; then
  NODE="$(command -v node || true)"
fi

if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "Node.js was not found. Install Node.js from https://nodejs.org/ or run this inside Codex."
  exit 1
fi

"$NODE" scripts/generate-cloudflare-d1.mjs
"$NODE" scripts/build-cloudflare-dist.mjs

echo ""
echo "Done. cloudflare-dist is ready for Cloudflare Pages."
