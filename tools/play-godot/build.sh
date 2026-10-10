#!/usr/bin/env bash
# /play Godot 에디션 빌드: 폰트 서브셋 → 웹 익스포트(포그라운드) → 산출물 복사.
# Godot 프로젝트는 repo 밖에 있다(README 참고). 경로는 환경변수로 바꿀 수 있다.
set -euo pipefail

PROJECT_DIR="${PLAY_GODOT_PROJECT:-$HOME/workspace/godot-minigame-full/project}"
BUILD_DIR="${PLAY_GODOT_BUILD:-$HOME/workspace/godot-minigame-full/build}"
GODOT_BIN="${GODOT_BIN:-$HOME/workspace/godot-pilot/engine/Godot_v4.4.1-stable_linux.x86_64}"
RANKING_JSON="${RANKING_JSON:-$PWD/apps/web/public/data/ranking/popular-webtoon.json}"
DEST="$PWD/apps/web/public/play-godot"

echo "[1/3] 폰트 서브셋 (문자집합 수집 + Noto Sans CJK KR)"
python3 "$PROJECT_DIR/tools/build_font.py" "$RANKING_JSON"

echo "[2/3] 웹 익스포트 (포그라운드 — 백그라운드 시 pck 절단 전례)"
df -h /tmp | tail -1
mkdir -p "$BUILD_DIR"
"$GODOT_BIN" --headless --path "$PROJECT_DIR" --import
"$GODOT_BIN" --headless --path "$PROJECT_DIR" --export-release Web "$BUILD_DIR/index.html"

echo "[3/3] 산출물 복사 → $DEST"
mkdir -p "$DEST"
cp "$BUILD_DIR"/index.html "$BUILD_DIR"/index.js "$BUILD_DIR"/index.wasm \
   "$BUILD_DIR"/index.pck "$BUILD_DIR"/index.png "$BUILD_DIR"/index.icon.png \
   "$BUILD_DIR"/index.apple-touch-icon.png "$BUILD_DIR"/index.audio.worklet.js \
   "$BUILD_DIR"/index.audio.position.worklet.js "$DEST"/
for f in index.wasm index.pck index.js; do
  echo "$f: raw $(stat -c%s "$DEST/$f") / gzip $(gzip -c "$DEST/$f" | wc -c)"
done
echo "완료. apps/web/public/play-godot/ 를 함께 커밋하세요."
