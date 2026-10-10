"""`kit.json`·`NOTICE.md` 작성 CLI — 키트 폴더의 GLB를 검사해 manifest를 만든다.

실행(저장소 루트)::

    <venv>/bin/python -I tools/blender/character_kit/build_kit_json.py \
        --kit-dir ~/.cache/toonstudio-kit/out/kit/toonstudio-kit-v1 \
        --meta ~/.cache/toonstudio-kit/out/base_meta_female.json \
        [--parts-json <hides.json>]

- 베이스 GLB(`bases/female.glb`)와 `parts/female/<슬롯>/<이름>.glb` 파츠를 자동으로 찾아 검사한다(`kit_manifest.discover_parts`).
- 파츠가 숨길 몸 영역은 `--parts-json`(키트 폴더 밖 JSON)으로 준다: `{"top/tee": {"female": {"hides": ["torso", "upperArm.L", "upperArm.R"]}}}`.
- 프리셋 어휘 32개 가운데 GLB가 없는 것은 한글 `unavailable` 사유로 선언한다(필수 5종이면 검증기 V1·V16이 오류를 낸다 — 정상).
- 슬롯 능력은 `deriveKitCapabilities`(TS)를 node+tsx로 불러 계산한다(저장소 루트에 node_modules가 있어야 한다).
- Hyper3D 파생 파츠의 출처는 `--hyper3d-sources <json>`(기본값 `tools/blender/character_kit/hyper3d_sources.json`이 있으면 그것)으로 준다.
  키트에 **실제로 등록된** 파츠 중 표에 키(프리셋 id)가 있는 것마다 `provenance.sources`에 `license: hyper3d-rodin-output` 항목을 더하고
  `summaryKo`·`NOTICE.md`에 그 사실(법적 허용이 아님, 반입 기록·생성 id 참조, 원본 GLB는 저장소에 없음)을 적는다. 형식은 `kit_manifest` docstring.
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
    args = parser.parse_args(argv)

    contract = contract_mod.load(args.contract)
    meta = json.loads(args.meta.read_text(encoding="utf-8"))
    hides_table = json.loads(args.parts_json.read_text(encoding="utf-8")) if args.parts_json else {}
    base_id = meta.get("baseId", "female")
    try:
        import bpy

        blender_version = bpy.app.version_string.split()[0]
    except Exception:  # noqa: BLE001 — bpy가 없어도 manifest는 만든다
        blender_version = "unknown"
    extra_metas = [json.loads(path.read_text(encoding="utf-8")) for path in args.extra_meta]
    extra_bases = [{"base_id": item["baseId"], "base_path": f"bases/{item['baseId']}.glb", "base_meta": item} for item in extra_metas]
    parts = km.discover_parts(args.kit_dir, [base_id, *[item["base_id"] for item in extra_bases]], hides_table)
    hyper3d_path = args.hyper3d_sources
    if hyper3d_path is None and km.HYPER3D_SOURCES_FILE.is_file():
        hyper3d_path = km.HYPER3D_SOURCES_FILE
    try:
        hyper3d = km.load_hyper3d_sources(hyper3d_path, args.repo_root) if hyper3d_path is not None else None
        manifest = km.build_manifest(
            kit_dir=args.kit_dir,
            contract=contract,
            base_id=base_id,
            base_path=f"bases/{base_id}.glb",
            base_meta=meta,
            parts=parts,
            repo_root=args.repo_root,
            generator_command=["build_base.py", "build_irises.py", "build_kit_json.py"],
            blender_version=blender_version,
            hyper3d_sources=hyper3d,
            extra_bases=extra_bases,
            unavailable_reasons=HELD_PRESETS_KO,
        )
    except km.ManifestError as error:
        print(f"manifest를 만들지 못했습니다: {error}", file=sys.stderr)
        return 1
    km.write_manifest(manifest, args.kit_dir / km.MANIFEST_FILE)
    if not args.no_notice:
        (args.kit_dir / km.KIT_NOTICE_FILE).write_text(km.notice_text(contract, manifest), encoding="utf-8")
    provided = [part["id"] for part in manifest["parts"] if part["variants"]]
    missing = [part["id"] for part in manifest["parts"] if not part["variants"]]
    print(f"kit.json: {args.kit_dir / km.MANIFEST_FILE}")
    print(f"파츠 제공 {len(provided)}종: {', '.join(provided) or '-'}")
    print(f"파츠 미제공 {len(missing)}종(한글 사유 선언): 필수 중 없음 = {[m for m in missing if m in contract.required_presets]}")
    hyper3d_ids = [source["id"] for source in manifest["provenance"]["sources"] if source["license"] == km.HYPER3D_LICENSE]
    skipped = sorted(set(hyper3d.sources) - set(provided)) if hyper3d is not None else []
    print(f"Hyper3D 출처 {len(hyper3d_ids)}건({hyper3d_path or '출처 표 없음'}): {', '.join(hyper3d_ids) or '-'}")
    if skipped:
        print(f"  출처 표에는 있으나 키트에 등록되지 않아 넣지 않은 파츠: {', '.join(skipped)}")
    if not extra_bases:
        print(f"남성 베이스: {km.MALE_SKIPPED_NOTE_KO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
