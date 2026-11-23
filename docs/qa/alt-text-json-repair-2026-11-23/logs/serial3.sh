#!/bin/sh
set -eu
qa_dir=$(mktemp -d "${TMPDIR:-/tmp}/toonstudio-alt-text-json.XXXXXX")
echo "$qa_dir"
qa_rule='(version 1)(allow default)(deny network-outbound (remote ip "*:*"))(allow network-outbound (remote ip "localhost:47631"))'
if lsof -nP -iTCP:47631-47634 -sTCP:LISTEN > "$qa_dir/ports-before.txt"; then exit 30; fi
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" NEST_API_URL=http://127.0.0.1:47632 TOONSTUDIO_VITE_DISABLE_WATCH=1 TOONSPECTRUM_VITE_DISABLE_OPTIMIZE_DEPS=1 /usr/bin/sandbox-exec -p "$qa_rule" node node_modules/vite/bin/vite.js --config apps/web/vite.config.ts --host 127.0.0.1 --port 47631 --strictPort > "$qa_dir/vite-run3.log" 2>&1 &
qa_vite=$!
trap 'kill "$qa_vite" 2>/dev/null || true' EXIT
for qa_try in $(seq 1 40); do
  if lsof -nP -a -p "$qa_vite" -iTCP:47631 -sTCP:LISTEN > "$qa_dir/ports-active.txt"; then break; fi
  kill -0 "$qa_vite"
  sleep 1
done
test -s "$qa_dir/ports-active.txt"
for qa_mode in "$@"; do
  env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" QA_RESULTS_DIR="$qa_dir" /usr/bin/sandbox-exec -p "$qa_rule" node --import tsx docs/qa/alt-text-json-repair-2026-11-23/browser.mjs "$qa_mode" run3 > "$qa_dir/$qa_mode-run3.log" 2>&1
done
