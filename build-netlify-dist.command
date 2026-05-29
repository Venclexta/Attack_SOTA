#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

BUNDLED_NODE="/Users/jianing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

if [[ -x "$BUNDLED_NODE" ]]; then
  "$BUNDLED_NODE" scripts/build-netlify-dist.mjs
elif command -v node >/dev/null 2>&1; then
  node scripts/build-netlify-dist.mjs
else
  echo "Node.js was not found. Install Node or update build-netlify-dist.command with a valid node path."
  exit 1
fi
