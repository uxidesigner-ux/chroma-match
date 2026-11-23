#!/bin/zsh
# Double-click to run this personal game on this Mac.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if curl -fsS http://127.0.0.1:5173/ 2>/dev/null | grep -q 'Chroma Royale'; then
  open http://127.0.0.1:5173/
  exit 0
fi
if [ ! -d node_modules ]; then npm ci || exit 1; fi
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort --open
