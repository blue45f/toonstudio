"""절차 헤어 7종 빌드 진입점(`forge_hair`) — 베이스마다 헤어 파츠 GLB·통합용 레지스트리·품질 보고를 낸다 (bpy venv 파이썬으로 실행).

사용(저장소 루트)::

    <venv>/bin/python -I tools/blender/character_kit/forge_build_hair.py \\
        --base female --base-model ~/.cache/toonstudio-kit/out4/base_model_female.npz \\
        --out ~/.cache/toonstudio-kit/out5/hair [--only soft-bob,hime-cut] [--kit-dir <키트 복사본>] [--no-v2]

출력
- `<out>/v1/parts/<base>/hair/<스타일>.glb` — **현재 계약(v1)** 파츠: LOD 3단(`TS_AuthoredHair_<스타일>_LOD<n>`), 재질 하나(`ts_hair_<스타일>`), morph 8개
  (머리 부착 체형), `COLOR_0` 회색 AO, `TEXCOORD_1` 흐름값·층 부호. 검증기 V1~V20 대상이며 `--kit-dir`(임시 복사본)에 같은 상대 경로로 복사한다.
  원본 키트 폴더(`apps/character-lab/public/...`)에는 쓰지 않는다.
- `<out>/v2/parts/<base>/hair/<스타일>.glb` — **커스터마이즈 제안(v2)**: LOD마다 색 영역 프리미티브 3개(hair·hair-tip·hair-accent)와 재질 3개,
  LOD0·LOD1에 형태 슬라이더 `shape:<이름>:±`. 현재 계약 밖(역할·morph 어휘)이라 검증기 대상이 아니고, 계약이 바뀐 뒤 통합한다.
- `<out>/parts-registry.json` — `build_kit_json.py --parts-json`이 읽는 형식(`{"hair/<스타일>": {"<base>": {"hides": []}}}`, 헤어는 숨김 영역이 없다).
  여러 베이스·여러 실행이 같은 파일을 갱신하므로 파일 잠금 아래에서 합친다.
- `<out>/report-<base>.json` — 스타일별 LOD 삼각형·정점·바이트(v1·v2), 텍스처 휘도, 관통(최소 부호 거리), 눈·눈썹 가림, 형태 극값 점검, 치수.
- `--accessories`면 `<out>/accessories/<base>/<부속>.glb`(기본 배치)와 `<부속>@<스타일>.glb`(배치 변형), `<out>/accessories/anchors-<base>.json`
  (앵커 표·스타일별 권장 파일/fit·역할/재질)을 더 쓴다. 헤어 부속 12종은 현재 계약 슬롯 밖(제안)이라 검증기 대상이 아니다.

라이선스: 산출물은 이 저장소의 원본(`license: original`, provenance `toonstudio-original`)이다. 외부 생성 AI 산출물·에셋을 쓰지 않는다.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from character_kit import forge_hair as fh  # noqa: E402
from character_kit.base_assembly import load_base_model  # noqa: E402

PART_LIMIT_BYTES = 1_572_864  # 계약 partGlbMaxBytes(1.5 MiB)
HAIR_LOD0_TRIANGLES = 20_000  # 계약 triangles.hairLod0
SHAPE_LODS = 2  # v2에서 형태 슬라이더를 싣는 LOD 수(LOD0·LOD1)
#: v2 형태 키 법선 델타 기준(법선 변화 길이, 0.2 ≈ 11.5°): 앞에서부터 시도해 한도 안에 드는 첫 값을 쓴다(None = 법선 델타 없음)
SHAPE_NORMAL_THRESHOLDS = (0.12, 0.2, 0.3, 0.45, None)


def update_registry(path: Path, base_id: str, styles: list[str]) -> None:
    """`parts-registry.json`에 헤어 항목을 합친다(다른 파츠 항목은 그대로 둔다)."""
    lock_path = Path(str(path) + ".lock")
    with lock_path.open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        registry = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        for style_id in styles:
            registry.setdefault(f"hair/{style_id}", {})[base_id] = {"hides": []}
        path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def shape_checks(frame: fh.HeadFrame, lod: fh.LodMesh) -> dict:
    """형태 슬라이더 극값(±1)에서 관통·눈 가림을 잰다."""
    out = {}
    for name, delta in sorted(lod.shapes.items()):
        qa = fh.qa_metrics(frame, lod.positions + delta, lod.triangles, lod.groups, lod.group_names)
        out[name] = {"minDistanceMm": qa["minDistanceMm"], "verticesInside": qa["verticesInside"], "eyeCoverage": max(qa["eyeCoverage"]), "browCoverage": max(qa["browCoverage"]), "lowestY": qa["lowestY"], "maxDeltaM": round(float(np.linalg.norm(delta, axis=1).max()), 4)}
    return out


def build_accessories(frame: fh.HeadFrame, base, out_dir: Path, hair_texture: bytes, style_positions: dict[str, np.ndarray]) -> dict:
    """헤어 부속 12종(+ 배치 변형)을 쓰고 앵커·권장 배치 문서를 돌려준다."""
    from character_kit import garment_fit as gf

    anchors = fh.accessory_anchors(frame)
    acc_texture, acc_stats = fh.accessory_texture()
    folder = out_dir / "accessories" / frame.base_id
    rows = {}
    for accessory_id in fh.HAIR_ACCESSORY_IDS:
        placements = [(None, None)] + [(style, names) for (acc, style), names in fh.ACCESSORY_PLACEMENTS.items() if acc == accessory_id]
        for style, names in placements:
            surface = style_positions.get(style) if style is not None and accessory_id in fh.SURFACE_FITTED_ACCESSORIES else None
            mesh = fh.build_accessory(frame, accessory_id, anchors, names, surface=surface)
            name = accessory_id if style is None else f"{accessory_id}@{style}"
            path = folder / f"{name}.glb"
            size = fh.write_accessory_glb(path, accessory_id, base, mesh, hair_texture, acc_texture)
            d, _, _ = gf.signed_distance(mesh["positions"], frame.collision, frame.collision_field)
            zones = sorted({fh.ACCESSORY_ZONES[i] for i in mesh["tri_zone"].tolist()})
            problems = []
            if size > PART_LIMIT_BYTES:
                problems.append(f"파일 {size} B > {PART_LIMIT_BYTES} B")
            if len(mesh["triangles"]) > fh.ACCESSORY_TRIANGLES:
                problems.append(f"삼각형 {len(mesh['triangles'])} > {fh.ACCESSORY_TRIANGLES}")
            if float(d.min()) < 0.0:
                problems.append(f"관통 {float(d.min()) * 1000:.2f} mm")
            rows[name] = {
                "accessory": accessory_id,
                "placement": style or "default",
                "anchors": mesh["anchors"],
                "path": str(path),
                "bytes": size,
                "triangles": int(len(mesh["triangles"])),
                "vertices": int(len(np.unique(mesh["triangles"]))),
                "minDistanceMm": round(float(d.min()) * 1000.0, 2),
                "materials": {fh.accessory_material_name(accessory_id, zone): {"role": zone, "colorKey": fh.ACCESSORY_COLOR_KEYS[zone]} for zone in zones},
                "morphs": list(fh.ACCESSORY_MORPHS),
                "problems": problems,
            }
            flag = "OK" if not problems else "문제: " + "; ".join(problems)
            print(f"{frame.base_id:6s} 부속 {name:28s} 삼각형 {len(mesh['triangles']):5d}  {size:7d} B  최소거리 {float(d.min()) * 1000:6.2f} mm  {flag}")
    document = {
        "schema": "toonstudio.hair-accessories/1",
        "base": frame.base_id,
        "license": "original",
        "provenance": "toonstudio-original",
        "node": "TS_HairAccessory_<id> (메시 노드 하나, 머리 본 100 % 스킨)",
        "roles": {zone: {"colorKey": key} for zone, key in fh.ACCESSORY_COLOR_KEYS.items()},
        "fit": {"morphs": ["shape:fit:+", "shape:fit:-"], "outPerUnitM": fh.FIT_OUT_M, "inPerUnitM": fh.FIT_IN_M, "baseHeightM": fh.ACCESSORY_BASE_H},
        "texture": acc_stats,
        "anchors": fh.anchor_table(anchors),
        "files": rows,
        "recommendations": fh.accessory_fit_report(frame, anchors, style_positions),
    }
    path = out_dir / "accessories" / f"anchors-{frame.base_id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return document


def build_one(frame: fh.HeadFrame, base, style_id: str, out_dir: Path, texture: bytes, texture_stats: dict, with_v2: bool) -> dict:
    started = time.time()
    build = fh.build_style(frame, style_id)
    variants = fh.shape_variants(frame, style_id) if with_v2 else {}
    lods = [fh.assemble_lod(frame, build, level, variants if level < SHAPE_LODS else None) for level in range(len(fh.LOD_SPACING_M))]
    v1_path = out_dir / "v1" / "parts" / frame.base_id / "hair" / f"{style_id}.glb"
    v1_bytes = fh.write_hair_glb(v1_path, style_id, base, lods, texture)
    v2_bytes = None
    normal_threshold = None
    if with_v2:
        v2_path = out_dir / "v2" / "parts" / frame.base_id / "hair" / f"{style_id}.glb"
        # 형태 키 법선 델타(LOD0): 크게 도는 정점만 싣고, 한도를 넘으면 기준을 올린다(마지막은 법선 없이)
        for normal_threshold in SHAPE_NORMAL_THRESHOLDS:
            v2_bytes = fh.write_hair_glb(v2_path, style_id, base, lods, texture, zoned=True, shape_lods=SHAPE_LODS, shape_normal_threshold=normal_threshold)
            if v2_bytes <= PART_LIMIT_BYTES:
                break
    qa = [fh.qa_metrics(frame, lod.positions, lod.triangles, lod.groups, lod.group_names) for lod in lods]
    triangles = [len(lod.triangles) for lod in lods]
    zones = {zone: int((lods[0].tri_zone == index).sum()) for index, zone in enumerate(fh.ZONES)}
    shapes = shape_checks(frame, lods[0]) if with_v2 else {}
    problems = []
    if v1_bytes > PART_LIMIT_BYTES:
        problems.append(f"v1 파일 {v1_bytes} B > 한도 {PART_LIMIT_BYTES} B")
    if v2_bytes is not None and v2_bytes > PART_LIMIT_BYTES:
        problems.append(f"v2 파일 {v2_bytes} B > 한도 {PART_LIMIT_BYTES} B")
    if triangles[0] > HAIR_LOD0_TRIANGLES:
        problems.append(f"LOD0 삼각형 {triangles[0]} > {HAIR_LOD0_TRIANGLES}")
    if any(b >= a for a, b in zip(triangles, triangles[1:])):
        problems.append(f"LOD 삼각형이 단조 감소하지 않음 {triangles}")
    if qa[0]["verticesInside"]:
        problems.append(f"LOD0 관통 정점 {qa[0]['verticesInside']}개")
    if max(qa[0]["eyeCoverage"]) > 0.0:
        problems.append(f"앞머리가 눈을 가림 {qa[0]['eyeCoverage']}")
    for name, check in shapes.items():
        if check["verticesInside"]:
            problems.append(f"{name} 극값 관통 정점 {check['verticesInside']}개")
        if check["eyeCoverage"] > 0.0:
            problems.append(f"{name} 극값 눈 가림 {check['eyeCoverage']}")
    # 부속 권장 fit을 잴 헤어 겉면: 덮개·머리끈·꼬리는 뺀다(머리끈·꼬리 뿌리까지 재면 그 옆 부속이 공중에 뜬다)
    surface = np.ones(len(lods[0].positions), dtype=bool)
    for group in ("cap", "tie", "tail"):
        if group in lods[0].group_names:
            surface &= lods[0].groups != lods[0].group_names.index(group)
    hair_points = lods[0].positions[surface]
    return {
        "_hair_points": hair_points,
        "style": style_id,
        "base": frame.base_id,
        "v1": {"path": str(v1_path), "bytes": v1_bytes},
        "v2": None if v2_bytes is None else {"path": str(out_dir / "v2" / "parts" / frame.base_id / "hair" / f"{style_id}.glb"), "bytes": v2_bytes, "shapeKeys": sorted(variants), "zones": zones, "shapeNormalThreshold": normal_threshold},
        "triangles": triangles,
        "locks": len(build.locks),
        "groups": sorted({lock.group for lock in build.locks}),
        "lockLengthM": {"min": round(min(lock.length() for lock in build.locks), 4), "max": round(max(lock.length() for lock in build.locks), 4)},
        "bandY": round(build.band_y, 4),
        "texture": texture_stats,
        "qa": qa,
        "shapes": shapes,
        "problems": problems,
        "seconds": round(time.time() - started, 1),
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", choices=("female", "male"), required=True)
    parser.add_argument("--base-model", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--only", default="", help="쉼표로 구분한 스타일(기본: 7종 전부)")
    parser.add_argument("--kit-dir", type=Path, default=None, help="v1 파츠를 복사할 키트 폴더(임시 복사본만)")
    parser.add_argument("--no-v2", action="store_true", help="v2(색 영역·형태 슬라이더) 산출물을 만들지 않는다(빠른 반복용)")
    parser.add_argument("--accessories", action="store_true", help="헤어 부속 12종(+배치 변형)과 앵커 문서를 함께 쓴다")
    parser.add_argument("--no-hair", action="store_true", help="헤어 GLB를 쓰지 않는다(부속만 다시 만들 때; 권장 fit은 헤어 LOD0을 메모리에서 다시 만들어 잰다)")
    args = parser.parse_args(argv)
    styles = [item for item in args.only.split(",") if item] or list(fh.HAIR_STYLE_IDS)
    unknown = [item for item in styles if item not in fh.STYLES]
    if unknown:
        raise SystemExit(f"알 수 없는 스타일: {unknown}")
    if args.kit_dir is not None and "public/assets/characters" in args.kit_dir.resolve().as_posix():
        raise SystemExit("원본 키트 폴더에는 쓰지 않는다. 임시 복사본을 --kit-dir로 준다.")
    args.out.mkdir(parents=True, exist_ok=True)
    base = load_base_model(args.base_model)
    frame = fh.build_head_frame(base, args.base)
    texture, texture_stats = fh.hair_texture()
    results = []
    style_positions: dict[str, np.ndarray] = {}
    for style_id in styles if not args.no_hair else []:
        result = build_one(frame, base, style_id, args.out, texture, texture_stats, not args.no_v2)
        style_positions[style_id] = result.pop("_hair_points")
        results.append(result)
        if args.kit_dir is not None:
            target = args.kit_dir / "parts" / args.base / "hair" / f"{style_id}.glb"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(result["v1"]["path"], target)
        flag = "OK" if not result["problems"] else "문제: " + "; ".join(result["problems"])
        v2 = f"v2 {result['v2']['bytes']:8d} B" if result["v2"] else "v2 -"
        print(f"{args.base:6s} {style_id:14s} v1 {result['v1']['bytes']:8d} B  {v2}  삼각형 {'/'.join(map(str, result['triangles'])):>17s}  최소거리 {result['qa'][0]['minDistanceMm']:6.2f} mm  눈가림 {max(result['qa'][0]['eyeCoverage']):.3f}  눈썹 {max(result['qa'][0]['browCoverage']):.2f}  {result['seconds']:5.1f}s  {flag}")
    accessory_problems = False
    if args.accessories:
        for style_id in fh.HAIR_STYLE_IDS:
            if style_id not in style_positions:
                lod = fh.assemble_lod(frame, fh.build_style(frame, style_id), 0)
                surface = np.ones(len(lod.positions), dtype=bool)
                for group in ("cap", "tie", "tail"):
                    if group in lod.group_names:
                        surface &= lod.groups != lod.group_names.index(group)
                style_positions[style_id] = lod.positions[surface]
        document = build_accessories(frame, base, args.out, texture, style_positions)
        accessory_problems = any(row["problems"] for row in document["files"].values())
    if results:
        update_registry(args.out / "parts-registry.json", args.base, [r["style"] for r in results])
        report_path = args.out / f"report-{args.base}.json"
        existing = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {}
        existing.update({r["style"]: r for r in results})
        report_path.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 1 if any(r["problems"] for r in results) or accessory_problems else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]))
