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

"$NODE" scripts/export-supabase-to-json.mjs
"$NODE" scripts/build-data-js.mjs
"$NODE" scripts/generate-cloudflare-d1.mjs

echo ""
echo "Done. Supabase data was exported and Cloudflare D1 SQL files were regenerated."
