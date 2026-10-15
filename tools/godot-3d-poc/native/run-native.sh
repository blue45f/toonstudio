#!/usr/bin/env bash
# 모드 B/C 확인: PoC 프로젝트를 네이티브 Linux 엔진으로 Xvfb 가상 디스플레이 + Mesa 소프트웨어 GL(OpenGL 3.3+, Compatibility 렌더러)에서 실행해
# 웹과 같은 GDScript 로 패스를 캡처한다. GPU·실제 디스플레이가 필요 없다.
#
# 사용:   bash tools/godot-3d-poc/native/run-native.sh <입력.glb> <출력 폴더> [WxH]
# 전제:   fetch-engine.sh 와 build.sh 를 먼저 실행해 엔진과 임포트된 작업 프로젝트(캐시)가 있어야 한다. xvfb-run 과 Mesa(libGL) 필요.
# 환경:   GODOT_POC_CACHE, GODOT_VERSION(기본 4.4.1-stable)
# 주의:   소프트웨어 렌더링이라 CPU 를 많이 쓴다. 결과 시간은 성능 증거가 아니다(README 의 측정 방법과 한계).
set -euo pipefail

POC="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${GODOT_VERSION:-4.4.1-stable}"
CACHE="${GODOT_POC_CACHE:-$HOME/.cache/toonstudio-godot-3d-poc}"
GODOT_BIN="${GODOT_BIN:-${CACHE}/engine/${VERSION}/Godot_v${VERSION}_linux.x86_64}"
PROJECT="${CACHE}/work/${VERSION}/project"
GLB="${1:?입력 GLB 경로가 필요합니다}"
OUT="${2:?출력 폴더가 필요합니다}"
SIZE="${3:-960x540}"

[ -x "$GODOT_BIN" ] || { echo "엔진이 없습니다: ${GODOT_BIN}" >&2; exit 1; }
[ -d "${PROJECT}/.godot" ] || { echo "임포트된 작업 프로젝트가 없습니다: ${PROJECT} — 먼저 build.sh 를 실행하세요." >&2; exit 1; }
command -v xvfb-run >/dev/null || { echo "xvfb-run 이 필요합니다." >&2; exit 1; }

export XDG_DATA_HOME="${XDG_DATA_HOME:-${CACHE}/xdg}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-${CACHE}/xdg-config-${VERSION}}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-${CACHE}/xdg-cache-${VERSION}}"
export TS3D_GLB="$(cd "$(dirname "$GLB")" && pwd)/$(basename "$GLB")"
mkdir -p "$OUT"
export TS3D_OUT="$(cd "$OUT" && pwd)"
export TS3D_SIZE="$SIZE"

xvfb-run -a -s "-screen 0 1280x720x24" "$GODOT_BIN" --rendering-driver opengl3 --path "$PROJECT" --script "${POC}/native/native_capture.gd" 2>&1 | grep -v -E "^\s*$" || true
ls -l "$TS3D_OUT"
