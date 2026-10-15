#!/usr/bin/env bash
# Godot 공식 릴리스(엔진 에디터 + 웹 export 템플릿)를 받아 SHA512 로 검증하고, 저장소 밖 캐시에 푼다.
# 저장소에는 엔진·wasm·템플릿 바이너리를 커밋하지 않는다(docs/adr/0028 공급망 정책).
#
# 사용:   bash tools/godot-3d-poc/scripts/fetch-engine.sh                 # 4.4.1-stable (운영 godot-space/play/cuts 와 같은 엔진)
#         GODOT_VERSION=4.7-stable bash tools/godot-3d-poc/scripts/fetch-engine.sh
# 환경:   GODOT_POC_CACHE  캐시 루트(기본 ~/.cache/toonstudio-godot-3d-poc)
#         --keep-archives  검증 뒤에도 내려받은 zip/tpz 를 지우지 않는다(tpz 는 약 1.2~1.3GB)
# 요구:   curl, sha512sum, unzip. 디스크 여유 약 1.5GB(검증 뒤 tpz 삭제 시 최종 약 160MB).
# 신뢰 앵커: checksums/SHA512-SUMS.<버전>.txt 에 고정한 공식 SHA512-SUMS.txt 의 해당 두 줄.
#            고정 파일이 없는 버전은 같은 릴리스의 SHA512-SUMS.txt 를 받아 쓰되 경고를 남긴다.
set -euo pipefail

POC="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${GODOT_VERSION:-4.4.1-stable}"
CACHE="${GODOT_POC_CACHE:-$HOME/.cache/toonstudio-godot-3d-poc}"
KEEP=0
for arg in "$@"; do
  [ "$arg" = "--keep-archives" ] && KEEP=1
done

BASE="https://github.com/godotengine/godot/releases/download/${VERSION}"
ENGINE_ZIP="Godot_v${VERSION}_linux.x86_64.zip"
TEMPLATES_TPZ="Godot_v${VERSION}_export_templates.tpz"
DL="${CACHE}/dl/${VERSION}"
mkdir -p "$DL"

echo "[1/4] 다운로드 → ${DL}"
for file in "$ENGINE_ZIP" "$TEMPLATES_TPZ"; do
  curl -sS -L -C - --retry 4 --retry-delay 5 -o "${DL}/${file}" "${BASE}/${file}"
done

echo "[2/4] SHA512 검증"
PINNED="${POC}/checksums/SHA512-SUMS.${VERSION}.txt"
if [ -f "$PINNED" ]; then
  grep -E "  (${ENGINE_ZIP}|${TEMPLATES_TPZ})$" "$PINNED" > "${DL}/subset.sha512"
  echo "  고정 체크섬 사용: ${PINNED}"
else
  echo "  경고: 고정 체크섬 파일이 없어 릴리스의 SHA512-SUMS.txt 를 내려받아 사용합니다(신뢰 앵커가 약해집니다)." >&2
  curl -sS -L --retry 4 -o "${DL}/SHA512-SUMS.txt" "${BASE}/SHA512-SUMS.txt"
  grep -E "  (${ENGINE_ZIP}|${TEMPLATES_TPZ})$" "${DL}/SHA512-SUMS.txt" > "${DL}/subset.sha512"
fi
[ "$(wc -l < "${DL}/subset.sha512")" -eq 2 ] || { echo "체크섬 항목 2개를 찾지 못했습니다." >&2; exit 1; }
(cd "$DL" && sha512sum -c subset.sha512)

echo "[3/4] 엔진 추출 → ${CACHE}/engine/${VERSION}"
mkdir -p "${CACHE}/engine/${VERSION}"
unzip -o -q "${DL}/${ENGINE_ZIP}" -d "${CACHE}/engine/${VERSION}"
chmod +x "${CACHE}/engine/${VERSION}/Godot_v${VERSION}_linux.x86_64"

echo "[4/4] 웹 템플릿만 추출(다른 플랫폼 템플릿은 풀지 않는다)"
TEMPLATE_VERSION="$(unzip -p "${DL}/${TEMPLATES_TPZ}" templates/version.txt | tr -d '\r\n')"
TARGET="${CACHE}/xdg/godot/export_templates/${TEMPLATE_VERSION}"
mkdir -p "$TARGET"
unzip -o -q -j "${DL}/${TEMPLATES_TPZ}" 'templates/web_*.zip' templates/version.txt -d "$TARGET"
ls -l "$TARGET"

if [ "$KEEP" -eq 0 ]; then
  rm -f "${DL}/${TEMPLATES_TPZ}" "${DL}/${ENGINE_ZIP}"
  echo "검증 뒤 내려받은 아카이브를 삭제했습니다(--keep-archives 로 유지)."
fi

echo
echo "완료. 다음을 사용하세요:"
echo "  export GODOT_POC_CACHE=${CACHE}"
echo "  export GODOT_VERSION=${VERSION}"
echo "  bash tools/godot-3d-poc/scripts/build.sh"
