#!/usr/bin/env bash
# PoC 프로젝트를 임포트하고 웹 export(단일 스레드 + 스레드 변형)를 build/ 에 만든다.
# 사용:   bash tools/godot-3d-poc/scripts/build.sh
# 환경:   GODOT_POC_CACHE  fetch-engine.sh 의 캐시 루트(기본 ~/.cache/toonstudio-godot-3d-poc)
#         GODOT_VERSION    기본 4.4.1-stable
#         GODOT_BIN        엔진 실행 파일(기본 캐시의 엔진)
#         POC_BUILD_DIR    산출물 폴더(기본 tools/godot-3d-poc/build). 버전별로 나누려면 build-4.7 처럼 지정한다.
# 주의:   export 는 반드시 포그라운드로 실행한다(기존 tools/play-godot 가 백그라운드 실행 시 pck 가 잘린 전례를 기록했다).
#         버전 간 .godot 임포트 캐시 충돌을 피하려고 프로젝트를 캐시 아래 작업 폴더에 복사해서 빌드한다.
set -euo pipefail

POC="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${GODOT_VERSION:-4.4.1-stable}"
CACHE="${GODOT_POC_CACHE:-$HOME/.cache/toonstudio-godot-3d-poc}"
GODOT_BIN="${GODOT_BIN:-${CACHE}/engine/${VERSION}/Godot_v${VERSION}_linux.x86_64}"
OUT="${POC_BUILD_DIR:-${POC}/build}"
WORK="${CACHE}/work/${VERSION}"

[ -x "$GODOT_BIN" ] || { echo "엔진이 없습니다: ${GODOT_BIN} — 먼저 scripts/fetch-engine.sh 를 실행하세요." >&2; exit 1; }
export XDG_DATA_HOME="${XDG_DATA_HOME:-${CACHE}/xdg}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-${CACHE}/xdg-config-${VERSION}}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-${CACHE}/xdg-cache-${VERSION}}"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"

echo "[1/3] 프로젝트 복사 → ${WORK}/project (.godot 캐시 제외)"
rm -rf "$WORK"
mkdir -p "${WORK}/project" "${OUT}/web" "${OUT}/web-threads"
(cd "${POC}/project" && tar --exclude=.godot -cf - .) | tar -xf - -C "${WORK}/project"

echo "[2/3] 임포트"
"$GODOT_BIN" --headless --path "${WORK}/project" --import 2>&1 | grep -E "SCRIPT ERROR|Parse Error|ERROR:" || true

echo "[3/3] 웹 export (포그라운드)"
df -h "$OUT" | tail -1
"$GODOT_BIN" --headless --path "${WORK}/project" --export-release Web "${OUT}/web/index.html" 2>&1 | grep -E "ERROR|SCRIPT" || true
"$GODOT_BIN" --headless --path "${WORK}/project" --export-release Web-Threads "${OUT}/web-threads/index.html" 2>&1 | grep -E "ERROR|SCRIPT" || true

for variant in web web-threads; do
  for file in index.wasm index.pck index.js; do
    path="${OUT}/${variant}/${file}"
    [ -f "$path" ] || { echo "산출물 누락: ${path}" >&2; exit 1; }
    echo "${variant}/${file}: raw $(stat -c%s "$path") / gzip $(gzip -9 -c "$path" | wc -c) / sha256 $(sha256sum "$path" | cut -d' ' -f1)"
  done
done
echo "완료: ${OUT}  (정적 서버 + 측정은 README.md 의 '측정' 절 참고)"
