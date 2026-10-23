"""`kit.json`·`NOTICE.md` 작성 CLI — 키트 폴더의 GLB를 검사해 manifest를 만든다.

실행(저장소 루트)::

    <venv>/bin/python -I tools/blender/character_kit/build_kit_json.py \
        --kit-dir ~/.cache/toonstudio-kit/out/kit/toonstudio-kit-v1 \
        --meta ~/.cache/toonstudio-kit/out/base_meta_female.json [--extra-meta <base_meta_male.json>] \
        --contract <contract.json> [--parts-json <레지스트리.json>] [--schema 1|2]

- 베이스 GLB(`bases/female.glb`)와 `parts/<base>/<슬롯>/<이름>.glb` 파츠를 자동으로 찾아 검사한다(`kit_manifest.discover_parts`).
- 파츠가 숨길 몸 영역은 `--parts-json`(키트 폴더 밖 JSON)으로 준다: `{"top/tee": {"female": {"hides": ["torso", "upperArm.L", "upperArm.R"]}}}`.
  포지 레지스트리(`parts-registry.json`)를 그대로 줄 수 있다. 항목의 `license`가 `original`인데 Hyper3D 출처 표에도 같은 키가 있으면 멈춘다.
- 프리셋 어휘 32개 가운데 GLB가 없는 것은 한글 `unavailable` 사유로 선언한다.
- 슬롯 능력은 `deriveKitCapabilities`(TS)를 node+tsx로 불러 계산한다(저장소 루트에 node_modules가 있어야 한다).
- Hyper3D 파생 파츠의 출처는 `--hyper3d-sources <json>`(기본값 `tools/blender/character_kit/hyper3d_sources.json`이 있으면 그것)으로 준다.
  키트에 **실제로 등록된** 파츠 중 표에 키(프리셋 id)가 있는 것마다 `provenance.sources`에 `license: hyper3d-rodin-output` 항목을 더하고
  `summaryKo`·`NOTICE.md`에 그 사실(법적 허용이 아님, 반입 기록·생성 id 참조, 원본 GLB는 저장소에 없음)을 적는다. 형식은 `kit_manifest` docstring.
- **손 기록 보존(기본)**: 키트 폴더에 `kit.json`이 있으면(또는 `--preserve-from <kit.json>`) 미제공 사유·`hides`·`summaryKo`와 `NOTICE.md`의
  "원천 3 … 제외" 역사 절·"제외한 …" 줄을 새 파일로 옮긴다. `--no-preserve`면 생성기 기본 문장만 쓴다.
- `--meta-from-kit`: 베이스 메타(높이·경계·영역 범위·관절 오프셋)를 사이드카 대신 보존 원본 `kit.json`에서 읽는다(베이스 GLB를 바꾸지 않았을 때).
- `--schema 2`: 키트 v2(`toonstudio.character-kit/2`) manifest를 `--out`(기본 `<키트>/kit.json`)에 쓴다(`kit_manifest_v2`). 공개 키트
  (`apps/character-lab/public/` 아래)에는 쓰지 않는다 — 앱 로더가 v2를 읽기 전(R-3b)이라 앱이 깨진다.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from character_kit import contract as contract_mod  # noqa: E402
from character_kit import kit_manifest as km  # noqa: E402
from character_kit.garment_presets import HELD_PRESETS_KO  # noqa: E402

CACHE = Path.home() / ".cache" / "toonstudio-kit"
REPO_ROOT = Path(__file__).resolve().parents[3]
PUBLIC_ASSETS = REPO_ROOT / "apps" / "character-lab" / "public"


def base_metas_from_kit(kit: dict) -> list[dict]:
    """보존 원본 kit.json의 베이스 블록에서 `build_manifest`가 읽는 메타를 되살린다(기본 베이스가 먼저). 관절 오프셋은 키트에 하나뿐이다."""
    metas = []
    for base_id in ("female", "male"):
        block = kit.get("bases", {}).get(base_id)
        if block is not None:
            metas.append({"baseId": base_id, "heightM": block["heightM"], "boundsM": block["boundsM"], "bodyRegions": block["bodyRegions"], "jointOffsets": kit["jointOffsets"]})
    default = kit.get("defaults", {}).get("base")
    metas.sort(key=lambda meta: meta["baseId"] != default)
    return metas


def load_preserved(args: argparse.Namespace) -> tuple[km.PreservedRecords | None, dict | None, Path | None]:
    if args.no_preserve:
        return None, None, None
    source = args.preserve_from or (args.kit_dir / km.MANIFEST_FILE)
    if not Path(source).is_file():
        if args.preserve_from:
            raise SystemExit(f"--preserve-from 파일이 없습니다: {source}")
        return None, None, None
    old_kit = json.loads(Path(source).read_text(encoding="utf-8"))
    notice_path = Path(source).parent / old_kit.get("provenance", {}).get("noticeFile", km.KIT_NOTICE_FILE)
    notice = notice_path.read_text(encoding="utf-8") if notice_path.is_file() else None
    return km.PreservedRecords.from_kit(old_kit, notice), old_kit, Path(source)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--kit-dir", type=Path, default=CACHE / "out" / "kit" / "toonstudio-kit-v1")
    parser.add_argument("--meta", type=Path, default=CACHE / "out" / "base_meta_female.json")
    parser.add_argument("--extra-meta", type=Path, action="append", default=[], help="기본 베이스 말고 더 넣을 베이스의 메타(예: base_meta_male.json). 반복 가능")
    parser.add_argument("--contract", type=Path, default=CACHE / "out" / "contract.json")
    parser.add_argument("--parts-json", type=Path, default=None)
    parser.add_argument(
        "--hyper3d-sources",
        type=Path,
        default=None,
        help=f"Hyper3D 파생 파츠 출처 표 JSON(기본값: {km.HYPER3D_SOURCES_FILE.relative_to(REPO_ROOT)}이 있으면 그것). 지정한 파일이 없으면 오류",
    )
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--no-notice", action="store_true")
    parser.add_argument("--preserve-from", type=Path, default=None, help="손 기록을 옮겨 올 이전 kit.json(기본: <kit-dir>/kit.json이 있으면 그것)")
    parser.add_argument("--no-preserve", action="store_true", help="이전 kit.json·NOTICE.md의 손 기록을 옮기지 않는다")
    parser.add_argument("--meta-from-kit", action="store_true", help="베이스 메타를 --meta 대신 보존 원본 kit.json에서 읽는다")
    parser.add_argument("--schema", type=int, choices=(1, 2), default=1, help="1 = 현행 계약(기본), 2 = 키트 v2 manifest(kit_manifest_v2)")
    parser.add_argument("--out", type=Path, default=None, help="manifest를 쓸 경로(기본: <kit-dir>/kit.json)")
    parser.add_argument("--base-meta-v2", type=Path, action="append", default=[], help="--schema 2: 베이스별 v2 메타 JSON(headHeightM·anchors·headRegionMask 덮어쓰기). 반복 가능")
    args = parser.parse_args(argv)

    contract = contract_mod.load(args.contract)
    preserved, old_kit, preserve_source = load_preserved(args)
    hides_input = json.loads(args.parts_json.read_text(encoding="utf-8")) if args.parts_json else {}
    if args.meta_from_kit:
        if old_kit is None:
            raise SystemExit("--meta-from-kit에는 보존 원본 kit.json이 필요합니다(--preserve-from 또는 키트 폴더의 kit.json).")
        metas = base_metas_from_kit(old_kit)
        meta, extra_metas = metas[0], metas[1:]
    else:
        meta = json.loads(args.meta.read_text(encoding="utf-8"))
        extra_metas = [json.loads(path.read_text(encoding="utf-8")) for path in args.extra_meta]
    hides_table = km.merge_hides_table(preserved, hides_input)
    base_id = meta.get("baseId", "female")
    try:
        import bpy

        blender_version = bpy.app.version_string.split()[0]
    except Exception:  # noqa: BLE001 — bpy가 없어도 manifest는 만든다
        blender_version = old_kit.get("generator", {}).get("blender", "unknown") if old_kit else "unknown"
    extra_bases = [{"base_id": item["baseId"], "base_path": f"bases/{item['baseId']}.glb", "base_meta": item} for item in extra_metas]
    parts = km.discover_parts(args.kit_dir, [base_id, *[item["base_id"] for item in extra_bases]], hides_table)
    hyper3d_path = args.hyper3d_sources
    if hyper3d_path is None and km.HYPER3D_SOURCES_FILE.is_file():
        hyper3d_path = km.HYPER3D_SOURCES_FILE
    out_path = args.out or (args.kit_dir / km.MANIFEST_FILE)
    if args.schema == 2 and PUBLIC_ASSETS.resolve() in [out_path.resolve(), *out_path.resolve().parents]:
        print(f"공개 키트에는 v2 manifest를 쓰지 않습니다({out_path}). 앱 로더가 v2를 읽기 전(R-3b)이라 앱이 깨집니다 — 캐시 폴더의 스테이지에 쓰세요.", file=sys.stderr)
        return 2
    try:
        hyper3d = km.load_hyper3d_sources(hyper3d_path, args.repo_root) if hyper3d_path is not None else None
        common = {
            "kit_dir": args.kit_dir,
            "contract": contract,
            "base_id": base_id,
            "base_path": f"bases/{base_id}.glb",
            "base_meta": meta,
            "parts": parts,
            "repo_root": args.repo_root,
            "generator_command": ["build_base.py", "build_irises.py", "build_kit_json.py"],
            "blender_version": blender_version,
            "hyper3d_sources": hyper3d,
            "extra_bases": extra_bases,
            "unavailable_reasons": HELD_PRESETS_KO,
            "preserved": preserved,
            "registry_licenses": km.registry_licenses_of(hides_input),
        }
        if args.schema == 2:
            from character_kit import kit_manifest_v2 as km2

            base_v2 = {item["baseId"]: item for item in (json.loads(path.read_text(encoding="utf-8")) for path in args.base_meta_v2)}
            manifest = km2.build_manifest_v2(**common, registry=hides_input, base_v2_meta=base_v2)
        else:
            manifest = km.build_manifest(**common)
    except km.ManifestError as error:
        print(f"manifest를 만들지 못했습니다: {error}", file=sys.stderr)
        return 1
    out_path.parent.mkdir(parents=True, exist_ok=True)
    km.write_manifest(manifest, out_path)
    if not args.no_notice:
        (out_path.parent / km.KIT_NOTICE_FILE).write_text(km.notice_text(contract, manifest, preserved), encoding="utf-8")
    provided = [part["id"] for part in manifest["parts"] if part["variants"]]
    missing = [part["id"] for part in manifest["parts"] if not part["variants"]]
    print(f"kit.json({manifest['schema']}): {out_path}")
    print(f"파츠 제공 {len(provided)}종: {', '.join(provided) or '-'}")
    print(f"파츠 미제공 {len(missing)}종(한글 사유 선언): 필수 중 없음 = {[m for m in missing if m in contract.required_presets]}")
    hyper3d_ids = [source["id"] for source in manifest["provenance"]["sources"] if source["license"] == km.HYPER3D_LICENSE]
    skipped = sorted(set(hyper3d.sources) - set(provided)) if hyper3d is not None else []
    print(f"Hyper3D 출처 {len(hyper3d_ids)}건({hyper3d_path or '출처 표 없음'}): {', '.join(hyper3d_ids) or '-'}")
    if skipped:
        print(f"  출처 표에는 있으나 키트에 등록되지 않아 넣지 않은 파츠: {', '.join(skipped)}")
    print(f"손 기록 보존: {preserve_source or '안 함'}")
    if not extra_bases:
        print(f"남성 베이스: {km.MALE_SKIPPED_NOTE_KO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
