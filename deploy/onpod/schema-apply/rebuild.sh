#!/bin/bash
# 오프라인 작업공간을 만든다(DB 접속 없음): 고정 커밋의 일부 + 패치된 공식 스크립트 + onpod 전용 스크립트.
# 저장소 작업트리는 읽기만 한다(git archive). 전제: 저장소 루트에서 `pnpm install`이 끝나 있다.
# 사용법: deploy/onpod/schema-apply/rebuild.sh <새 빈 디렉터리>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(git -C "$HERE" rev-parse --show-toplevel)}"
TARGET="${1:?사용법: rebuild.sh <새 빈 디렉터리>}"
C="${PINNED_COMMIT:-37b51837787ea67ee26b14358a1ac84664a7c584}"
[ ! -e "$TARGET/repo" ] || { echo "대상에 repo/ 가 이미 있다. 새 디렉터리를 고르세요." >&2; exit 1; }
mkdir -p "$TARGET/repo"
git -C "$REPO_ROOT" archive "$C" packages apps/api/src apps/api/drizzle.config.ts apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json \
  pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json package.json scripts config | tar -x -C "$TARGET/repo"
cp -R "$TARGET/repo/scripts" "$TARGET/orig-scripts"                     # 원본 사본(git blob과 바이트 동일)
cp "$HERE/apply-patches.mjs" "$HERE/link-node-modules.mjs" "$HERE/redact.mjs" "$HERE/onpod-run.sh" "$TARGET/"
node "$TARGET/link-node-modules.mjs" "$REPO_ROOT" "$TARGET/repo"         # node_modules 거울. @toonstudio/* 는 고정 커밋의 packages 로 연결
node "$TARGET/apply-patches.mjs"                                          # 패치된 스크립트와 patches/*.diff 를 쓴다
cp "$HERE/onpod-scripts/"* "$TARGET/repo/scripts/"                        # onpod-apply-schema.mjs / onpod-verify.mjs / onpod-readiness-replay.mjs
mkdir -p "$TARGET/sql" && cp "$HERE/sql/"* "$TARGET/sql/"
echo "오프라인 작업공간 준비: $TARGET/repo"
