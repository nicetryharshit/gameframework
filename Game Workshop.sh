#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Game Workshop needs Node.js 24 or newer. Opening the download page..."
  xdg-open "https://nodejs.org/"
  echo "Install Node.js, then double-click this file again."
  read -r -p "Press Enter to close..." _
  exit 1
fi
node "scripts/export-ui/server.mjs" --open
