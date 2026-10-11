#!/usr/bin/env bash
# 컷츠 Godot 플레이어 빌드: 웹 익스포트(포그라운드) → 서빙 사본 복사.
# Godot 프로젝트는 repo 밖에 있다(README 참고). 경로는 환경변수로 바꿀 수 있다.
# 폰트는 프로젝트 에셋의 font_kr_subset.otf를 그대로 쓴다 — 한글 음절
# 11,172자 전체를 커버하는 서브셋이라 동적 자막에도 추가 공정이 필요 없다.
set -euo pipefail

PROJECT_DIR="${CUTS_GODOT_PROJECT:-$HOME/workspace/godot-motion-full/project}"
BUILD_DIR="${CUTS_GODOT_BUILD:-$HOME/workspace/godot-motion-full/build}"
GODOT_BIN="${GODOT_BIN:-$HOME/workspace/godot-pilot/engine/Godot_v4.4.1-stable_linux.x86_64}"
DEST="$PWD/apps/web/public/cuts-godot"

echo "[1/2] 웹 익스포트 (포그라운드 — 백그라운드 시 pck 절단 전례)"
df -h /tmp | tail -1
mkdir -p "$BUILD_DIR"
"$GODOT_BIN" --headless --path "$PROJECT_DIR" --import
"$GODOT_BIN" --headless --path "$PROJECT_DIR" --export-release Web "$BUILD_DIR/index.html"

echo "[2/2] 서빙 사본 복사 → $DEST"
mkdir -p "$DEST"
cp "$BUILD_DIR"/index.html "$BUILD_DIR"/index.js "$BUILD_DIR"/index.wasm \
   "$BUILD_DIR"/index.pck "$BUILD_DIR"/index.png "$BUILD_DIR"/index.icon.png \
   "$BUILD_DIR"/index.apple-touch-icon.png "$BUILD_DIR"/index.audio.worklet.js \
   "$BUILD_DIR"/index.audio.position.worklet.js "$DEST"/
for f in index.wasm index.pck index.js; do
  echo "$f: raw $(stat -c%s "$DEST/$f") / gzip $(gzip -c "$DEST/$f" | wc -c)"
done
echo "완료. apps/web/public/cuts-godot/ 를 함께 커밋하세요."
