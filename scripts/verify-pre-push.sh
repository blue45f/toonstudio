#!/usr/bin/env sh
# 푸시 검사는 문서만 바뀌거나 변경 목록이 비어 있어도 구조·타입 검사를 수행한다.
set -e
cd "$(dirname "$0")/.."

node --test scripts/agent-harness.test.mjs scripts/verify-ui-ux-v2-contracts.test.mjs scripts/run-changed-unit-tests.test.mjs
node scripts/verify-pnpm-lockfile.mjs

BASE="${PRE_PUSH_BASE:-origin/main}"
git rev-parse --verify --quiet "$BASE" >/dev/null || BASE=""

# 빠른 검사 결과가 모두 도착한 뒤에만 전체 타입 검사를 시작한다.
pnpm run validate:architecture &
PID_ARCH=$!

if [ -n "$BASE" ]; then
  node scripts/lint-changed.mjs "--base=$BASE" &
  PID_LINT=$!
  node scripts/secretlint-files.mjs "--base=$BASE" &
  PID_SECRET=$!
else
  node scripts/lint-changed.mjs &
  PID_LINT=$!
  pnpm run quality:secrets &
  PID_SECRET=$!
fi

quick_status=0
for check_pid in "$PID_ARCH" "$PID_LINT" "$PID_SECRET"; do
  wait "$check_pid" || quick_status=$?
done
[ "$quick_status" -eq 0 ] || exit "$quick_status"
NODE_OPTIONS='--max-old-space-size=16384' pnpm run typecheck

if [ -n "$BASE" ]; then
  node scripts/run-changed-unit-tests.mjs "--base=$BASE"
  if git diff --name-only "$BASE...HEAD" -- package.json pnpm-lock.yaml packages/studio-hokusai-wasm \
    | grep -q .; then
    pnpm run audit:security
    pnpm run audit:licenses
  fi
else
  node scripts/run-changed-unit-tests.mjs
fi
