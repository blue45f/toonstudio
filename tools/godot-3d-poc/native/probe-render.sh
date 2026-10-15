#!/usr/bin/env bash
# 모드 B 확인: 같은 프로브(render_probe.gd)를 `--headless` 와 Xvfb + Mesa 소프트웨어 GL 두 경로로 실행해 "실제로 그려지는가"를 JSON 으로 낸다.
#
# 사용:   bash tools/godot-3d-poc/native/probe-render.sh > render-probe.json
# 전제:   fetch-engine.sh 와 build.sh 를 먼저 실행(임포트된 작업 프로젝트 필요). Xvfb 경로는 xvfb-run 과 Mesa(libGL, OpenGL 3.3+) 필요.
# 환경:   GODOT_POC_CACHE, GODOT_VERSION(기본 4.4.1-stable), GODOT_BIN
# 결과:   표준 출력에 JSON 한 개. 표준 오류에는 엔진 로그 일부(경고·오류 줄)만 남긴다. 소프트웨어 렌더링이라 시간은 성능 증거가 아니다.
set -euo pipefail

POC="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${GODOT_VERSION:-4.4.1-stable}"
CACHE="${GODOT_POC_CACHE:-$HOME/.cache/toonstudio-godot-3d-poc}"
GODOT_BIN="${GODOT_BIN:-${CACHE}/engine/${VERSION}/Godot_v${VERSION}_linux.x86_64}"
PROJECT="${CACHE}/work/${VERSION}/project"

[ -x "$GODOT_BIN" ] || { echo "엔진이 없습니다: ${GODOT_BIN}" >&2; exit 1; }
[ -d "${PROJECT}/.godot" ] || { echo "임포트된 작업 프로젝트가 없습니다: ${PROJECT} — 먼저 build.sh 를 실행하세요." >&2; exit 1; }
command -v xvfb-run >/dev/null || { echo "xvfb-run 이 필요합니다." >&2; exit 1; }

export XDG_DATA_HOME="${XDG_DATA_HOME:-${CACHE}/xdg}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-${CACHE}/xdg-config-${VERSION}}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-${CACHE}/xdg-cache-${VERSION}}"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"

probe_line() { grep -E '^\[render-probe\] ' | head -1 | sed 's/^\[render-probe\] //'; }

HEADLESS="$(timeout 60 "$GODOT_BIN" --headless --path "$PROJECT" --script "${POC}/native/render_probe.gd" 2> >(grep -E 'ERROR|WARNING' >&2) | probe_line || true)"
XVFB="$(timeout 90 xvfb-run -a -s '-screen 0 1280x720x24' "$GODOT_BIN" --rendering-driver opengl3 --path "$PROJECT" --script "${POC}/native/render_probe.gd" 2> >(grep -E 'ERROR|WARNING' >&2) | probe_line || true)"

printf '{\n "note": "render_probe.gd: 64x64 SubViewport 에 빨간 ColorRect 를 그리고 20 프레임 뒤 중앙 픽셀을 읽는다. headless = --headless, xvfb = xvfb-run + --rendering-driver opengl3 (Mesa 소프트웨어 GL).",\n "godot": "%s",\n "headless": %s,\n "xvfb": %s\n}\n' "$VERSION" "${HEADLESS:-null}" "${XVFB:-null}"
