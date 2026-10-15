#!/usr/bin/env bash
# glTF 확장 호환 확인: 같은 프로브(ext_probe.gd)를 `--headless` 와 Xvfb + Mesa 소프트웨어 GL 두 경로로 실행해 JSON 으로 낸다.
# 웹 측정(ext 스위트)과 같은 픽스처·같은 호출이며, "렌더러가 없는 실행(모드 B)에서도 같은 결과인가"를 보는 용도다.
#
# 사용:   bash tools/godot-3d-poc/native/probe-ext.sh [픽스처 폴더] > ext-probe.json
# 전제:   node tools/godot-3d-poc/measure/make-fixtures.mjs 로 픽스처를 만들었고, fetch-engine.sh 와 build.sh 를 먼저 실행해
#         임포트된 작업 프로젝트가 있어야 한다. Xvfb 경로는 xvfb-run 과 Mesa(libGL, OpenGL 3.3+) 필요.
# 환경:   GODOT_POC_CACHE, GODOT_VERSION(기본 4.4.1-stable), GODOT_BIN, GODOT_PROJECT(작업 프로젝트 폴더를 직접 지정)
# 결과:   표준 출력에 JSON 한 개. 엔진이 낸 ERROR/WARNING 줄 전체 개수는 "engineMessageLines", 그중 glTF·KTX·이미지와 관련된
#         서로 다른 줄 최대 12개는 "engineMessages" 에 담는다(`--headless` 는 표준 오류로, X11 경로는 표준 출력으로 내므로 둘 다 읽는다).
set -euo pipefail

POC="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${GODOT_VERSION:-4.4.1-stable}"
CACHE="${GODOT_POC_CACHE:-$HOME/.cache/toonstudio-godot-3d-poc}"
GODOT_BIN="${GODOT_BIN:-${CACHE}/engine/${VERSION}/Godot_v${VERSION}_linux.x86_64}"
PROJECT="${GODOT_PROJECT:-${CACHE}/work/${VERSION}/project}"
FIXTURES="$(cd "${1:-${POC}/.cache/fixtures}" && pwd)"

[ -x "$GODOT_BIN" ] || { echo "엔진이 없습니다: ${GODOT_BIN}" >&2; exit 1; }
[ -d "${PROJECT}/.godot" ] || { echo "임포트된 작업 프로젝트가 없습니다: ${PROJECT} — 먼저 build.sh 를 실행하세요." >&2; exit 1; }
command -v xvfb-run >/dev/null || { echo "xvfb-run 이 필요합니다." >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 이 필요합니다." >&2; exit 1; }

export XDG_DATA_HOME="${XDG_DATA_HOME:-${CACHE}/xdg}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-${CACHE}/xdg-config-${VERSION}}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-${CACHE}/xdg-cache-${VERSION}}"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME"
export TS3D_FIXTURES="$FIXTURES"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

timeout 180 "$GODOT_BIN" --headless --path "$PROJECT" --script "${POC}/native/ext_probe.gd" >"$WORK/headless.out" 2>"$WORK/headless.err" || true
timeout 240 xvfb-run -a -s '-screen 0 1280x720x24' "$GODOT_BIN" --rendering-driver opengl3 --path "$PROJECT" --script "${POC}/native/ext_probe.gd" >"$WORK/xvfb.out" 2>"$WORK/xvfb.err" || true

python3 -I - "$VERSION" "$WORK" <<'PY'
import json, re, sys

version, work = sys.argv[1], sys.argv[2]

def parse(name):
    env, files, messages = None, [], []
    with open(f"{work}/{name}.out", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.startswith("[ext-probe-env] "):
                env = json.loads(line[len("[ext-probe-env] "):])
            elif line.startswith("[ext-probe] "):
                files.append(json.loads(line[len("[ext-probe] "):]))
            elif line.startswith("ERROR:") or line.startswith("WARNING:"):
                messages.append(line.rstrip())
    with open(f"{work}/{name}.err", encoding="utf-8", errors="replace") as handle:
        messages.extend(line.rstrip() for line in handle if line.startswith("ERROR:") or line.startswith("WARNING:"))
    relevant = []
    for line in messages:
        if re.search(r"glTF|KTX|ktx|basis|image", line) and line not in relevant:
            relevant.append(line)
    return {"env": env, "files": files, "engineMessages": relevant[:12], "engineMessageLines": len(messages)}

result = {
    "note": "ext_probe.gd: 폴더의 각 GLB 를 GLTFDocument.append_from_buffer -> generate_scene 으로 연다. headless = --headless, xvfb = xvfb-run + --rendering-driver opengl3 (Mesa 소프트웨어 GL).",
    "godot": version,
    "headless": parse("headless"),
    "xvfb": parse("xvfb"),
}
print(json.dumps(result, ensure_ascii=False, indent=1))
PY
