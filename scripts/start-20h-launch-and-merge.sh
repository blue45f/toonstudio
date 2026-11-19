#!/usr/bin/env bash
set -euo pipefail

# One-command unattended launcher for ToonStudio 20h commercial upgrade + CI-gated main merge.
# Respects AGENTS.md: never uses --no-verify, never pushes directly to main, never runs deploy:web/onpod.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${LAUNCH_BRANCH:-feat/commercial-launch-20h}"
AGENT="${AGENT:-auto}"
MAX_HOURS="${MAX_HOURS:-20}"
MAX_CYCLES="${MAX_CYCLES:-60}"

cd "$REPO_ROOT"

if [[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]]; then
  git checkout -B "$BRANCH"
fi

if ! git diff --cached --quiet; then
  git commit -m "feat(launch-loop): 상용 고도화 선행 슬라이스 및 20시간 무인 자동 머지 러너 반영"
fi

git push -u origin "$(git rev-parse --abbrev-ref HEAD)"

./scripts/launch-loop-runner.sh \
  --agent "$AGENT" \
  --max-hours "$MAX_HOURS" \
  --max-cycles "$MAX_CYCLES" \
  --auto-pr-merge

echo "[start-20h] Syncing local main after PR auto-merge..."
git fetch origin main
if [[ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]]; then
  echo "[start-20h] Feature branch $(git rev-parse --abbrev-ref HEAD) pushed and PR auto-merge enabled."
  echo "[start-20h] Once GitHub CI finishes squash merge, run: git checkout main && git pull --ff-only"
fi
