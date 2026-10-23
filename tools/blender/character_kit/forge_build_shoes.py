"""포지(forge) 진입 스크립트 — 이 저장소가 직접 만드는 원본 신발 4종·소품을 두 베이스에 빌드하고 근접 렌더를 만든다 (bpy venv 파이썬).

사용(저장소 루트)::

    <venv>/bin/python -I tools/blender/character_kit/forge_build_shoes.py build \\
        [--base female|male|all] [--base-model-dir ~/.cache/toonstudio-kit/out4] \\
        [--out ~/.cache/toonstudio-kit/out5/shoes] [--only shoes/sneakers,accessory/cap] [--profiles v1,ext]
    <venv>/bin/python -I tools/blender/character_kit/forge_build_shoes.py render \\
        --base-model <npz> --glb <파츠.glb> --out <접두> [--focus feet|head|auto] [--tint #rrggbb[,#sole,#accent]]

산출(`--out` 아래, 키트 폴더 밖):
- `v1/parts/<base>/<slot>/<name>.glb` — **현재 계약(v1)** 그대로: 메시 하나·재질 하나(역할 `shoes`/`accessory`), morph는 계약 어휘 64개만.
- `ext/parts/<base>/<slot>/<name>.glb` — **확장 제안**: 같은 지오메트리를 역할별 프리미티브로 나눈다(신발 `shoes`·`shoes-sole`·`shoes-lace`,
  소품 `accessory`·`accessory-accent`)와 형상 키 `shape:<이름>:±`. 계약이 바뀌기 전에는 검증기 V1·V6·V9·V13·V16이 이 파일을 거부한다(의도된 것).
- `<profile>/parts-registry.json` — `build_kit_json.py --parts-json`과 같은 평평한 표(`{프리셋: {베이스: {"hides": [...], ...}}}`)에
  `license`·`changesKo`·`roles`·`materials`·`shapeKeys`·`anchor`·`layer`·`groundOffsetM` 같은 메타를 더한다(`forge_install.py`가 읽는다).
- `build-report.json` — 파츠·베이스별 삼각형·바이트·V9 따라가기 최댓값·숨김 영역·관통·땅 높이.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

CACHE = Path.home() / ".cache" / "toonstudio-kit"
DEFAULT_BASE_DIR = CACHE / "out4"
DEFAULT_OUT = CACHE / "out5" / "shoes"
PROFILES = ("v1", "ext")


# ---------------------------------------------------------------- 신발


def build_shoe(name: str, base_id: str, base: Any, out: Path, profiles: tuple[str, ...]) -> dict[str, Any]:
    from character_kit import forge_shoes as fs
    from character_kit.base_assembly import follow_deviation
    from character_kit.retarget_garment import HIDE_COVERAGE

    started = time.time()
    definition = fs.SHOE_DEFINITIONS[name]
    ctx = fs.body_context(base, "body")
    pair = fs.build_pair(definition, base, ctx, definition.params)
    atlas = fs.bake_shoe_atlas(definition, pair)
    texture = atlas.jpeg()
    label = f"shoes/{name}@{base_id}"
    attach = fs.attach_to_body(ctx, pair.positions, pair.normals, label, mode="nearest")
    piece = fs.Piece(name=name, positions=pair.positions, triangles=pair.triangles, uvs=pair.uvs, normals=pair.normals)
    body = base.mesh("body_")
    names = ctx.names
    reference_targets = {n: body["morph_delta"][list(map(str, body["morph_names"])).index(n)] for n in names}
    follow = follow_deviation(pair.positions, attach["deltas"], body["tpose_positions"].astype(np.float64), reference_targets, names=names)
    coverage = shoe_coverage(pair.positions, pair.triangles, base)
    hideable = [r for r in base.region_ids if r != "head"]
    hides = [r for r in hideable if coverage.get(r, 0.0) >= HIDE_COVERAGE]
    regions = (f"foot.L", f"foot.R", f"calf.L", f"calf.R")
    penetration = fs.penetration_report(ctx, piece, regions)
    clearance = fs.clearance_report(ctx, piece)
    ground = min(b.ground_v for b in pair.builds.values())
    report: dict[str, Any] = {
        "preset": f"shoes/{name}",
        "base": base_id,
        "triangles": int(len(pair.triangles)),
        "vertices": int(len(pair.positions)),
        "degenerateTriangles": fs.degenerate_count(pair.positions, pair.triangles),
        "textureMeanLuminance": round(atlas.mean_luminance(), 4),
        "textureBytes": len(texture),
        "follow": {"matched": follow["matched"], "unmatched": follow["unmatched"], "worstMm": round(follow["worst"]["statistic"] * 1000, 2) if follow["worst"] else None, "worstMorph": follow["worst"]["name"] if follow["worst"] else None},
        "hides": hides,
        "coverage": {k: round(v, 3) for k, v in coverage.items() if v > 0.02},
        "penetration": penetration,
        "clearance": clearance,
        "groundOffsetM": round(ground, 4),
        "floorsApplied": len(attach["floorsApplied"]),
        "info": {side: {k: (round(v, 4) if isinstance(v, float) else v) for k, v in build.info.items() if not isinstance(v, list)} for side, build in pair.builds.items()},
        "outputs": {},
    }
    node = f"TS_Shoes_{name}"
    common = {"hides": hides, "license": "original", "changesKo": definition.changes_ko, "anchors": ["foot-l", "foot-r"], "layer": "shoe", "groundOffsetM": round(ground, 4), "meshRole": "shoes", "node": node}
    registry: dict[str, dict[str, Any]] = {}
    if "v1" in profiles:
        path = out / "v1" / "parts" / base_id / "shoes" / f"{name}.glb"
        size = fs.write_shoe_glb(path, node, [(f"ts_shoes_{name}", np.ones(len(pair.positions), dtype=bool))], pair, attach, base, texture, names)
        report["outputs"]["v1"] = {"path": str(path), "bytes": size}
        registry["v1"] = {**common, "channels": ["shoes"], "materials": {f"ts_shoes_{name}": {"role": "shoes", "channel": "shoes"}}, "shapes": [], "shapeKeys": []}
    if "ext" in profiles:
        shape = fs.shape_key_deltas(definition, base, ctx, pair)
        materials = []
        for index, role in enumerate(fs.SHOE_ROLES):
            mask = pair.vertex_role == index
            if mask.any():
                suffix = "" if role == fs.ROLE_UPPER else ("_sole" if role == fs.ROLE_SOLE else "_lace")
                materials.append((f"ts_shoes_{name}{suffix}", mask))
        path = out / "ext" / "parts" / base_id / "shoes" / f"{name}.glb"
        size = fs.write_shoe_glb(path, node, materials, pair, attach, base, texture, names, extra_targets=shape)
        # 형상 키 안전: 가중치 0.5·1.0에서 몸과의 최소 간격과 관통(선형 morph 중간값에서 정점이 곡면의 현을 지나 발로 들어가지 않는지)
        safety = {}
        for key, delta in shape.items():
            entry: dict[str, Any] = {"maxDeltaMm": round(float(np.linalg.norm(delta, axis=1).max()) * 1000, 2)}
            for weight in (0.5, 1.0):
                moved = fs.Piece(name=name, positions=pair.positions + weight * delta, triangles=pair.triangles, uvs=pair.uvs, normals=pair.normals)
                entry[f"clearanceMinMm@{weight}"] = fs.clearance_report(ctx, moved)["minMm"]
                entry[f"penetration@{weight}"] = fs.penetration_report(ctx, moved, regions)["inside"]
            safety[key] = entry
        report["outputs"]["ext"] = {"path": str(path), "bytes": size, "shapeKeys": safety}
        # 키트 v2: 메시 역할은 shoes 하나, 밑창·끈은 재질 채널(shoes-sole·shoes-lace, PART_ROLE_CHANNELS.shoes)
        channels = [fs.SHOE_ROLES[i] for i in range(len(fs.SHOE_ROLES)) if (pair.vertex_role == i).any()]
        shapes = sorted({key.split(":")[1] for key in shape})
        registry["ext"] = {
            **common,
            "channels": channels,
            "materials": {m: {"role": "shoes", "channel": channel} for channel, (m, _) in zip(channels, materials, strict=True)},
            "shapes": [{"name": s, "labelKo": SHOE_SHAPES_KO.get(s, s)} for s in shapes],
            "shapeKeys": sorted(shape),
        }
    report["seconds"] = round(time.time() - started, 1)
    report["registry"] = registry
    return report


SHOE_SHAPES_KO = {"height": "목 높이", "sole": "밑창 두께", "toe": "코 모양"}


# ---------------------------------------------------------------- 소품

#: `build --variants`: 형상 키 미리보기 GLB를 `<out>/variants/`에 쓴다(렌더 확인용)
WRITE_VARIANTS = [False]
#: 모자 맞춤 계측에 쓰는 forge 헤어 산출물(있을 때만). 환경 변수 TOONSTUDIO_FORGE_HAIR_<BASE>로 바꿀 수 있다
HAIR_DIRS = {base: os.environ.get(f"TOONSTUDIO_FORGE_HAIR_{base.upper()}", str(CACHE / "out5" / "hair" / "iter12" / "v1" / "parts" / base / "hair")) for base in ("female", "male")}
# 겹쳐 입기 계측용 forge 의상(층별 하위 폴더 top·outer·bottom). 기하에는 쓰지 않는다 — 간격은 proc_accessories.GARMENT_STANDOFF_M 상수(실측값)다
GARMENT_DIRS = {base: os.environ.get(f"TOONSTUDIO_FORGE_GARMENTS_{base.upper()}", str(CACHE / "out5" / "garments" / "layered" / base)) for base in ("female", "male")}


def read_lod0_mesh(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """헤어 GLB의 LOD0 메시(위치, 삼각형)."""
    from character_kit.gltf_read import accessor_array, read_glb

    document, binary = read_glb(str(path))
    points, triangles = [], []
    offset = 0
    for node in document["nodes"]:
        name = node.get("name", "")
        if "mesh" in node and (name.endswith("_LOD0") or "_LOD" not in name):  # LOD 이름이 없는 GLB(의상)는 메시 노드 전부
            for prim in document["meshes"][node["mesh"]]["primitives"]:
                p = accessor_array(document, binary, prim["attributes"]["POSITION"]).astype(np.float64)
                t = accessor_array(document, binary, prim["indices"]).reshape(-1, 3).astype(np.int64)
                points.append(p)
                triangles.append(t + offset)
                offset += len(p)
    if not points:
        return np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)
    return np.concatenate(points), np.concatenate(triangles)


def read_lod0_points(path: Path) -> np.ndarray:
    return read_lod0_mesh(path)[0]


def hair_buried_report(lm: Any, positions: np.ndarray, hair_dir: Path, reach: float = 0.04, only: set[str] | None = None) -> dict[str, Any]:
    """머리카락 위에 얹는 소품: 소품 정점에서 머리 중심 반대쪽(바깥)으로 쏜 광선이 `reach` 안에서 머리카락 면을 맞히면 묻힌 것이다(헤어별 개수)."""
    from character_kit.surface import Surface

    center = lm.head_shell().center
    directions = positions - center
    directions /= np.maximum(np.linalg.norm(directions, axis=1, keepdims=True), 1e-12)
    out: dict[str, Any] = {}
    for path in sorted(Path(hair_dir).glob("*.glb")):
        if only is not None and path.stem not in only:
            continue
        points, triangles = read_lod0_mesh(path)
        if not len(triangles):
            continue
        _, triangle = Surface(points, triangles).ray(positions + directions * 1e-4, directions, reach)
        out[path.stem] = int((triangle >= 0).sum())
    return out


def garment_buried_report(lm: Any, positions: np.ndarray, garment_dir: Path, reach: float = 0.06) -> dict[str, int]:
    """의상 위에 메는 소품: 소품 정점에서 몸 바깥(최근접 몸 법선)으로 쏜 광선이 `reach` 안에서 의상 면을 맞히면 의상이 소품을 뚫고 나온 것이다
    (층/이름별 개수, 예: "top/tee"). 의상 폴더가 없으면 빈 dict."""
    from character_kit import proc_accessories as pa
    from character_kit.surface import Surface

    root = Path(garment_dir)
    if not root.is_dir():
        return {}
    _, normals = pa.body_signed_distance(lm, positions)
    out: dict[str, int] = {}
    for path in sorted(root.glob("*/*.glb")):
        points, triangles = read_lod0_mesh(path)
        if not len(triangles):
            continue
        _, triangle = Surface(points, triangles).ray(positions + normals * 1e-4, normals, reach)
        out[f"{path.parent.name}/{path.stem}"] = int((triangle >= 0).sum())
    return out


@dataclass
class AssembledAccessory:
    """소품 조각을 정점 순서대로 합친 것(`forge_shoes.write_shoe_glb`가 받는 꼴: positions·normals·uvs·triangles)."""

    positions: np.ndarray
    normals: np.ndarray
    uvs: np.ndarray
    triangles: np.ndarray
    vertex_role: np.ndarray  # ACC_ROLES 번호
    vertex_part: np.ndarray  # build.parts 번호


def assemble_accessory(build: Any) -> AssembledAccessory:
    from character_kit import forge_shoes as fs
    from character_kit import proc_accessories as pa
    from character_kit.surface import vertex_normals

    positions, normals, uvs, triangles, roles, parts = [], [], [], [], [], []
    offset = 0
    for index, part in enumerate(build.parts):
        piece = part.piece
        positions.append(piece.positions)
        normals.append(piece.normals if piece.normals is not None else vertex_normals(piece.positions, piece.triangles))
        uvs.append(piece.uvs)
        triangles.append(piece.triangles + offset)
        roles.append(np.full(len(piece.positions), pa.ACC_ROLES.index(part.role)))
        parts.append(np.full(len(piece.positions), index))
        offset += len(piece.positions)
    return AssembledAccessory(
        positions=np.concatenate(positions),
        normals=fs.unit(np.concatenate(normals)),
        uvs=np.concatenate(uvs),
        triangles=np.concatenate(triangles),
        vertex_role=np.concatenate(roles),
        vertex_part=np.concatenate(parts),
    )


def accessory_morph_candidates(base: Any, groups: tuple[str, ...]) -> list[str]:
    """후보 morph: body(몸 메시가 가진 체형 param) · head(머리 메시에만 있는 얼굴 param) · facs(표정)."""
    body_names = [str(n) for n in base.mesh("body_")["morph_names"]]
    head_names = [str(n) for n in base.mesh("head_")["morph_names"]]
    out: list[str] = []
    if "body" in groups:
        out += body_names
    if "head" in groups:
        out += [n for n in head_names if n.startswith("param:") and n not in body_names]
    if "facs" in groups:
        out += [n for n in head_names if n.startswith("facs:")]
    return out


def support_vertices(ctx: Any, lm: Any, support: str, points: np.ndarray, build: Any = None) -> np.ndarray:
    """rigid 결합의 맞춤(또는 nearest 후보)에 쓸 몸+머리 정점 번호. `info:<키>:<반지름>`은 빌드 정보의 점들 둘레(접촉점: 안경 테·귀 위, 귓볼)."""
    import bpy  # noqa: F401 — mathutils
    from mathutils import kdtree

    bs = ctx.bs
    head_index = bs.region_ids.index("head")
    if support == "cranium":
        # 눈썹 위 두개골(이마 포함). 눈·광대·턱 morph(눈 간격·턱 폭 등)가 모자에 새어 들지 않게 눈 높이 + 2 cm 위만 쓴다
        return np.flatnonzero((bs.region == head_index) & (bs.tpose[:, 1] > lm.eye_y + 0.020))
    if support == "head":
        return np.flatnonzero(bs.region == head_index)
    if support.startswith("region:"):
        wanted = [bs.region_ids.index(r) for r in support.split(":", 1)[1].split(",")]
        return np.flatnonzero(np.isin(bs.region, wanted))
    if support.startswith("info:"):
        _, key, radius_text = support.split(":", 2)
        points = np.asarray(build.info[key], dtype=np.float64)
        support = f"local:{radius_text}"
    if support.startswith("local"):
        radius = float(support.split(":", 1)[1]) if ":" in support else 0.03
        tree = kdtree.KDTree(len(points))
        for i, p in enumerate(np.asarray(points, dtype=np.float64).tolist()):
            tree.insert(p, i)
        tree.balance()
        near = [i for i, p in enumerate(bs.tpose.tolist()) if tree.find(p)[2] <= radius]
        return np.array(near, dtype=np.int64)
    raise ValueError(f"알 수 없는 지지 정점 규칙: {support}")


def attach_accessory(ctx: Any, lm: Any, build: Any, asm: AssembledAccessory, names: list[str], label: str) -> dict[str, Any]:
    """조각을 (결합 방식, 지지) 묶음으로 나눠 결합하고 정점 순서대로 합친다."""
    from character_kit import forge_shoes as fs

    count = len(asm.positions)
    joints = np.zeros((count, 4), dtype=np.int64)
    weights = np.zeros((count, 4))
    deltas = {name: np.zeros((count, 3)) for name in names}
    floors: list[str] = []
    groups: dict[tuple[str, str, str], list[int]] = {}
    for index, part in enumerate(build.parts):
        groups.setdefault((part.bind, part.support, getattr(part, "group", "")), []).append(index)
    for (bind, support, _group), part_indices in groups.items():
        idx = np.flatnonzero(np.isin(asm.vertex_part, part_indices))
        points = asm.positions[idx]
        if bind.startswith("rigid:"):
            fit = "affine" if bind.startswith("rigid:affine:") else "similarity"
            joint = bind.split(":", 2)[2] if fit == "affine" else bind.split(":", 1)[1]
            result = fs.attach_rigid(ctx, points, joint, support_vertices(ctx, lm, support, points, build), names, label, fit=fit)
        elif bind in ("nearest", "surface"):
            mask = None
            if support.startswith("region:"):
                mask = np.zeros(len(ctx.bs.tpose), dtype=bool)
                mask[support_vertices(ctx, lm, support, points, build)] = True
            result = fs.attach_surface(ctx, points, asm.normals[idx], names, label, mode=bind, region_mask=mask)
        else:
            raise ValueError(f"알 수 없는 결합 방식: {bind}")
        joints[idx] = result["joints"]
        weights[idx] = result["weights"]
        for name in names:
            deltas[name][idx] = result["deltas"][name]
        floors += result["floorsApplied"]
    return {"joints": joints, "weights": weights, "deltas": deltas, "floorsApplied": floors}


def accessory_shape_deltas(definition: Any, lm: Any, reference: AssembledAccessory) -> dict[str, np.ndarray]:
    """형상 키 ± 빌드와 기본 빌드의 정점 위치 차. 정점 수·삼각형(감김 포함)이 다르면 오류."""
    deltas: dict[str, np.ndarray] = {}
    for key, params in definition.shape_variants(definition.params).items():
        variant = assemble_accessory(definition.build(lm, params))
        if variant.positions.shape != reference.positions.shape or not np.array_equal(variant.triangles, reference.triangles):
            raise ValueError(f"{definition.name} {key}: 형상 키 변형의 위상이 기본 빌드와 다르다")
        deltas[key] = variant.positions - reference.positions
    return deltas


def signed_clearance(ctx: Any, positions: np.ndarray) -> np.ndarray:
    from character_kit import garment_fit as gf

    d, _, _ = gf.signed_distance(positions, ctx.surface, ctx.body_normals)
    return d


def clearance_summary(d: np.ndarray) -> dict[str, Any]:
    return {"minMm": round(float(d.min()) * 1000, 2), "p01Mm": round(float(np.percentile(d, 1)) * 1000, 2), "medianMm": round(float(np.median(d)) * 1000, 2), "inside": int((d < 0.0).sum())}


def build_accessory(name: str, base_id: str, base: Any, out: Path, profiles: tuple[str, ...]) -> dict[str, Any]:
    from character_kit import forge_shoes as fs
    from character_kit import proc_accessories as pa

    started = time.time()
    definition = pa.ACCESSORY_DEFINITIONS[name]
    lm = pa.Landmarks(base)
    lm.base_id = base_id  # 의상 위 간격 표(GARMENT_STANDOFF_M)를 베이스별로 고른다
    build = definition.build(lm, definition.params)
    asm = assemble_accessory(build)
    candidates = accessory_morph_candidates(base, definition.morph_groups)
    ctx = fs.body_context(base, names=candidates)
    label = f"accessory/{name}@{base_id}"
    attach = attach_accessory(ctx, lm, build, asm, candidates, label)
    magnitude = {n: float(np.linalg.norm(attach["deltas"][n], axis=1).max()) for n in candidates}
    names = [n for n in candidates if n in pa.ACC_REQUIRED_MORPHS or magnitude[n] >= pa.ACC_MORPH_KEEP_M]
    atlas = fs.ShoeAtlas(fill=0.92)
    definition.bake(atlas, build)
    texture = atlas.jpeg()
    clearance = clearance_summary(signed_clearance(ctx, asm.positions))
    hair_fit = None
    hair_dir = HAIR_DIRS.get(base_id)
    if "rhoTable" in build.info and hair_dir is not None and Path(hair_dir).is_dir():
        hairs = {p.stem: read_lod0_points(p) for p in sorted(Path(hair_dir).glob("*.glb"))}
        hair_fit = {"default": pa.hair_poke_report(lm, build, hairs)}
        # 헤어와의 겹쳐 쓰기 규칙(형상 키 가중치 1)을 적용한 빌드로 그 헤어만 다시 잰다
        variants = definition.shape_variants(definition.params)
        for rule in definition.stacking:
            keys = [k for k, w in rule.get("shapes", {}).items() if w == 1.0 and k in variants]
            targets = [h.split("/", 1)[1] for h in rule.get("with", []) if h.startswith("hair/") and h.split("/", 1)[1] in hairs]
            for key in keys:
                if targets:
                    hair_fit[key] = pa.hair_poke_report(lm, definition.build(lm, variants[key]), {t: hairs[t] for t in targets})
    elif set(definition.anchors) & {"hair", "head-top", "ear-l", "ear-r"} and hair_dir is not None and Path(hair_dir).is_dir():
        hair_fit = {"buried": hair_buried_report(lm, asm.positions, Path(hair_dir))}
        variants = definition.shape_variants(definition.params)
        for rule in definition.stacking:
            targets = {h.split("/", 1)[1] for h in rule.get("with", []) if h.startswith("hair/")}
            for key, weight in rule.get("shapes", {}).items():
                if targets and weight == 1.0 and key in variants:
                    moved = assemble_accessory(definition.build(lm, variants[key])).positions
                    hair_fit[f"buried@{key}"] = hair_buried_report(lm, moved, Path(hair_dir), only=targets)
    garment_fit = None
    garment_dir = GARMENT_DIRS.get(base_id)
    if definition.layer.startswith("over") and garment_dir is not None and Path(garment_dir).is_dir():
        # 의상 위 소품: 기본(상의 위)과 fit ± 변형을 의상마다 잰다 — 겹쳐 쓰기 규칙(stacking)·충돌(conflicts)의 근거
        garment_fit = {"default": garment_buried_report(lm, asm.positions, Path(garment_dir))}
        for key, params in definition.shape_variants(definition.params).items():
            if key.startswith("shape:fit:"):
                garment_fit[key] = garment_buried_report(lm, assemble_accessory(definition.build(lm, params)).positions, Path(garment_dir))
    report: dict[str, Any] = {
        "preset": f"accessory/{name}",
        "base": base_id,
        "triangles": int(len(asm.triangles)),
        "vertices": int(len(asm.positions)),
        "roleTriangles": {role: int((asm.vertex_role[asm.triangles[:, 0]] == i).sum()) for i, role in enumerate(pa.ACC_ROLES)},
        "degenerateTriangles": fs.degenerate_count(asm.positions, asm.triangles),
        "textureMeanLuminance": round(atlas.mean_luminance(), 4),
        "textureBytes": len(texture),
        "morphs": names,
        "morphMaxMm": {n: round(magnitude[n] * 1000, 2) for n in names},
        "clearance": clearance,
        "hairFit": hair_fit,
        "garmentFit": garment_fit,
        "floorsApplied": len(attach["floorsApplied"]),
        "info": {k: v for k, v in build.info.items() if isinstance(v, (int, float, str, dict))},
        "outputs": {},
    }
    hides: list[str] = []
    if definition.hide_regions:
        from character_kit.retarget_garment import HIDE_COVERAGE

        coverage = skin_coverage(base, asm.positions, asm.triangles, definition.hide_regions)
        if set(definition.hide_regions) & {"foot.L", "foot.R", "calf.L", "calf.R"}:
            # 발을 통째로 감싸는 소품(양말)은 신발과 같은 갇힘 판정도 본다: 발가락 사이 면의 법선 광선은 옆 발가락을 지나 옆벽까지 1.5 cm를 넘는다
            enclosed = shoe_coverage(asm.positions, asm.triangles, base)
            report["enclosed"] = {k: round(enclosed.get(k, 0.0), 4) for k in definition.hide_regions}
            coverage = {k: max(v, enclosed.get(k, 0.0)) for k, v in coverage.items()}
        report["coverage"] = {k: round(v, 4) for k, v in coverage.items()}
        hides = [r for r in definition.hide_regions if coverage.get(r, 0.0) >= HIDE_COVERAGE]
    common: dict[str, Any] = {
        "hides": hides,
        "license": "original",
        "changesKo": definition.changes_ko,
        "anchors": list(definition.anchors),
        "layer": definition.layer,
        "conflicts": list(definition.conflicts),
        "stacking": [dict(rule) for rule in definition.stacking],
    }
    registry: dict[str, dict[str, Any]] = {}
    material = f"ts_accessory_{name}"
    if "v1" in profiles and definition.vocabulary and definition.make_v1:
        path = out / "v1" / "parts" / base_id / "accessory" / f"{name}.glb"
        size = fs.write_shoe_glb(path, f"TS_Accessory_{name}", [(material, np.ones(len(asm.positions), dtype=bool))], asm, attach, base, texture, names)
        report["outputs"]["v1"] = {"path": str(path), "bytes": size}
        registry["v1"] = {**common, "meshRole": "accessory", "node": f"TS_Accessory_{name}", "channels": ["accessory"], "materials": {material: {"role": "accessory", "channel": "accessory"}}, "shapes": [], "shapeKeys": []}
    if "ext" in profiles:
        shape = accessory_shape_deltas(definition, lm, asm)
        # 키트 v2: 메시 역할 accessory(헤어 부속은 hair-accessory, 노드 접두 TS_HairAccessory), 포인트는 재질 채널 <역할>-accent
        mesh_role = definition.mesh_role
        node = f"TS_HairAccessory_{name}" if mesh_role == "hair-accessory" else f"TS_Accessory_{name}"
        materials, channels = [], []
        for index, role in enumerate(pa.ACC_ROLES):
            mask = asm.vertex_role == index
            if mask.any():
                materials.append((material if role == pa.ACC_BODY else f"{material}_accent", mask))
                channels.append(mesh_role if role == pa.ACC_BODY else f"{mesh_role}-accent")
        path = out / "ext" / "parts" / base_id / "accessory" / f"{name}.glb"
        size = fs.write_shoe_glb(path, node, materials, asm, attach, base, texture, names, extra_targets=shape)
        safety = {}
        for key, delta in shape.items():
            entry: dict[str, Any] = {"maxDeltaMm": round(float(np.linalg.norm(delta, axis=1).max()) * 1000, 2)}
            for weight in (0.5, 1.0):
                entry[f"clearance@{weight}"] = clearance_summary(signed_clearance(ctx, asm.positions + weight * delta))
            safety[key] = entry
        report["outputs"]["ext"] = {"path": str(path), "bytes": size, "shapeKeys": safety}
        if WRITE_VARIANTS[0]:
            # 형상 키 미리보기: 가중치 1을 적용한 지오메트리를 v1 꼴 파츠로 쓴다(이름에 "__"가 있어 forge_install은 무시한다)
            for key, delta in shape.items():
                moved = AssembledAccessory(asm.positions + delta, asm.normals, asm.uvs, asm.triangles, asm.vertex_role, asm.vertex_part)
                tag = key.replace("shape:", "").replace(":+", "_plus").replace(":-", "_minus")
                fs.write_shoe_glb(out / "variants" / base_id / "accessory" / f"{name}__{tag}.glb", f"TS_Accessory_{name}", [(material, np.ones(len(asm.positions), dtype=bool))], moved, attach, base, texture, names)
        shapes = sorted({key.split(":")[1] for key in shape})
        registry["ext"] = {
            **common,
            "meshRole": mesh_role,
            "node": node,
            "channels": channels,
            "materials": {m: {"role": mesh_role, "channel": channel} for channel, (m, _) in zip(channels, materials, strict=True)},
            "shapeKeys": sorted(shape),
            "shapes": [{"name": s, "labelKo": definition.shapes_ko.get(s, s)} for s in shapes],
        }
        if len(definition.anchors) == 1:
            registry["ext"]["anchor"] = definition.anchors[0]  # 키트 v2 변형 `anchor`(기본 앵커 하나). 양손·양발 소품은 anchors 목록만 둔다
    report["seconds"] = round(time.time() - started, 1)
    report["registry"] = registry
    return report


def skin_coverage(base: Any, positions: np.ndarray, triangles: np.ndarray, regions: tuple[str, ...], reach: float = 0.015) -> dict[str, float]:
    """영역별로 몸 정점에서 바깥 법선 방향으로 쏜 광선이 `reach` 안에서 소품 면을 맞히는 비율(장갑·양말처럼 피부를 감싸는 소품의 숨김 판정)."""
    from character_kit.surface import Surface

    body = base.mesh("body_")
    shell = Surface(positions, triangles)
    out: dict[str, float] = {}
    for region in regions:
        mask = body["region"] == base.region_ids.index(region)
        points = body["tpose_positions"].astype(np.float64)[mask]
        normals = body["normals"].astype(np.float64)[mask]
        normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
        _, tri = shell.ray(points + normals * 1e-4, normals, reach)
        out[region] = float((tri >= 0).mean()) if len(points) else 0.0
    return out


SHOE_ENCLOSE_RAY_M = 0.30


def shoe_coverage(positions: np.ndarray, triangles: np.ndarray, base: Any) -> dict[str, float]:
    """영역별 '신발 안에 갇힌' 정점 비율: 정점에서 아래·앞뒤·좌우(월드 축) 5방향 광선이 모두 신발 면을 맞히면 갇힌 것이다.

    `retarget_garment.covered_regions`(법선 방향 광선 3 cm)는 옷에는 맞지만 신발에서는 발가락 사이 면(법선이 옆 발가락을 향한다)의 광선이
    발가락 몇 개를 지나 앞코 옆벽까지 3 cm를 넘고, 아치 발바닥에서 밑창 바닥까지도 3 cm를 넘어 발을 완전히 감싼 부츠도 숨김을 선언할 수 없었다.
    갇힘 판정은 입구(위)가 열린 낮은 신발에서 발목 위 정점을 덮인 것으로 세지 않는다(옆 광선이 칼라 위로 빠진다). 판정 기준(98.5 %)은 같다."""
    from character_kit.surface import Surface

    body = base.mesh("body_")
    shoe = Surface(positions, triangles)
    points = body["tpose_positions"].astype(np.float64)
    candidates = np.isin(body["region"], [base.region_ids.index(n) for n in ("foot.L", "foot.R", "calf.L", "calf.R")])
    enclosed = np.zeros(len(points), dtype=bool)
    idx = np.flatnonzero(candidates)
    ok = np.ones(len(idx), dtype=bool)
    for direction in ((0, -1, 0), (1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, 0, -1)):
        d = np.tile(np.array(direction, dtype=np.float64), (len(idx), 1))
        _, triangle = shoe.ray(points[idx], d, SHOE_ENCLOSE_RAY_M)
        ok &= triangle >= 0
    enclosed[idx] = ok
    out: dict[str, float] = {}
    for index, name in enumerate(base.region_ids):
        mask = body["region"] == index
        if mask.any():
            out[name] = float(enclosed[mask].mean())
    return out


# ---------------------------------------------------------------- 레지스트리·보고서


def merge_registry(out: Path, profile: str, preset_id: str, base_id: str, entry: dict[str, Any]) -> None:
    import fcntl

    path = out / profile / "parts-registry.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with (path.parent / "parts-registry.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        table = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        table.setdefault(preset_id, {})[base_id] = entry
        path.write_text(json.dumps(table, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def command_build(args: argparse.Namespace) -> int:
    import bpy  # noqa: F401 — mathutils·bmesh 등록

    from character_kit import forge_shoes as fs
    from character_kit import proc_accessories as pa
    from character_kit.base_assembly import load_base_model

    bases = ["female", "male"] if args.base == "all" else [args.base]
    WRITE_VARIANTS[0] = bool(args.variants)
    wanted = [item for item in args.only.split(",") if item] or [f"shoes/{n}" for n in fs.SHOE_DEFINITIONS] + [f"accessory/{n}" for n in pa.ACCESSORY_DEFINITIONS]
    profiles = tuple(p for p in args.profiles.split(",") if p)
    out = Path(args.out).expanduser()
    reports = []
    failures = []
    for base_id in bases:
        base = load_base_model(Path(args.base_model_dir).expanduser() / f"base_model_{base_id}.npz")
        for preset_id in wanted:
            slot, name = preset_id.split("/", 1)
            try:
                if slot == "shoes":
                    report = build_shoe(name, base_id, base, out, profiles)
                elif slot == "accessory":
                    report = build_accessory(name, base_id, base, out, profiles)
                else:
                    raise SystemExit(f"알 수 없는 프리셋: {preset_id}")
            except Exception as error:  # noqa: BLE001 — 한 파츠 실패가 나머지를 막지 않게 하고 끝에서 실패로 끝낸다
                failures.append({"preset": preset_id, "base": base_id, "error": repr(error)})
                print(f"[실패] {preset_id}@{base_id}: {error!r}", file=sys.stderr)
                continue
            for profile, entry in report.pop("registry").items():
                merge_registry(out, profile, preset_id, base_id, entry)
            reports.append(report)
            print(json.dumps({k: report[k] for k in ("preset", "base", "triangles", "vertices", "follow", "hides", "penetration", "clearance", "groundOffsetM", "morphs", "seconds") if k in report}, ensure_ascii=False))
    report_path = out / "build-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    previous = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {"parts": []}
    keep = [r for r in previous.get("parts", []) if (r["preset"], r["base"]) not in {(x["preset"], x["base"]) for x in reports}]
    report_path.write_text(json.dumps({"schema": "toonstudio.forge-build-report/1", "parts": keep + reports, "failures": failures}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 1 if failures else 0


# ---------------------------------------------------------------- 근접 렌더(Workbench)


def hex_rgb(value: str) -> tuple[float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def read_glb_primitives(path: Path) -> list[dict[str, Any]]:
    """파츠 GLB의 프리미티브(위치·인덱스·UV·재질 이름·기본색 이미지). morph·스킨은 읽지 않는다(레스트 포즈 렌더)."""
    from character_kit.gltf_read import image_bytes, read_glb

    document, binary = read_glb(str(path))

    def accessor(index: int) -> np.ndarray:
        acc = document["accessors"][index]
        view = document["bufferViews"][acc["bufferView"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
        dtype = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[acc["componentType"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = view.get("byteStride") or np.dtype(dtype).itemsize * width
        rows = np.ndarray(shape=(acc["count"],), dtype=np.dtype([("v", dtype, (width,))]), buffer=binary, offset=start, strides=(stride,))["v"]
        values = np.array(rows)
        if acc.get("normalized") and np.issubdtype(values.dtype, np.integer):
            return values.astype(np.float64) / float(np.iinfo(values.dtype).max)
        return values

    out = []
    import re

    mesh_indices = [node["mesh"] for node in document.get("nodes", []) if "mesh" in node and not re.search(r"_LOD[1-9]$", node.get("name", ""))]
    for mesh in (document["meshes"][i] for i in mesh_indices):
        for prim in mesh["primitives"]:
            material = document["materials"][prim["material"]]
            texture = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
            image = image_bytes(document, binary, texture["index"])[0] if texture else None
            out.append(
                {
                    "positions": accessor(prim["attributes"]["POSITION"]).astype(np.float64),
                    "indices": accessor(prim["indices"]).reshape(-1, 3).astype(np.int64),
                    "uvs": accessor(prim["attributes"]["TEXCOORD_0"]).astype(np.float64),
                    "material": material["name"],
                    "image": image,
                }
            )
    return out


VIEWS_FEET = {"front": (0, 6), "side": (90, 4), "back": (180, 6), "bottom": (15, -82), "q45": (45, 32), "inner": (-90, 4)}
VIEWS_HEAD = {"front": (0, 4), "side": (90, 2), "back": (180, 4), "bottom": (20, -55), "q45": (45, 25), "top": (0, 80)}


def command_render(args: argparse.Namespace) -> int:
    import math

    import bpy
    from mathutils import Vector
    from PIL import Image

    from character_kit.base_assembly import load_base_model

    bpy.ops.wm.read_factory_settings(use_empty=True)
    base = load_base_model(args.base_model)

    def add_mesh(name: str, positions: np.ndarray, triangles: np.ndarray, color: tuple[float, float, float], uvs: np.ndarray | None = None, image: Any = None) -> None:
        p = np.asarray(positions, dtype=np.float64)
        bp = np.stack([p[:, 0], -p[:, 2], p[:, 1]], axis=1)
        me = bpy.data.meshes.new(name)
        me.from_pydata(bp.tolist(), [], np.asarray(triangles).tolist())
        me.update()
        for poly in me.polygons:
            poly.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        mat = bpy.data.materials.new(name + "_m")
        mat.diffuse_color = (*color, 1.0)
        if image is not None and uvs is not None:
            layer = me.uv_layers.new(name="UV")
            loops = np.asarray(triangles).reshape(-1)
            layer.data.foreach_set("uv", np.stack([uvs[loops, 0], 1.0 - uvs[loops, 1]], axis=1).reshape(-1).tolist())
            mat.use_nodes = True
            tree = mat.node_tree
            node = tree.nodes.new("ShaderNodeTexImage")
            node.image = image
            tree.links.new(node.outputs["Color"], tree.nodes["Principled BSDF"].inputs["Base Color"])
        ob.data.materials.append(mat)

    skin = hex_rgb(args.skin)
    body = base.mesh("body_")
    head = base.mesh("head_")
    body_triangles = body["triangles"]
    if args.hide:
        # 부품 hides처럼 그 영역 삼각형을 그리지 않는다(앱에서 보이는 모습)
        hidden = np.isin(body["region"], [base.region_ids.index(r) for r in args.hide.split(",")])
        body_triangles = body_triangles[~hidden[body_triangles].all(axis=1)]
    add_mesh("body", body["tpose_positions"], body_triangles, skin)
    add_mesh("head", head["tpose_positions"], head["triangles"], skin)
    for extra in [str(v) for v in base.arrays["extra_mesh_names"]]:
        key = f"mesh/{extra}/0/"
        if key + "tpose_positions" in base.arrays:
            shade = (0.12, 0.1, 0.1) if "Brow" in extra or "Lash" in extra else (0.95, 0.95, 0.96)
            add_mesh(extra, base.arrays[key + "tpose_positions"], base.arrays[key + "triangles"], shade)
    tints = [hex_rgb(t) for t in args.tint.split(",")]
    focus_points = []

    def add_glb(glb: str, colors: list[tuple[float, float, float]], focus: bool, tag: str) -> None:
        import io

        for index, prim in enumerate(read_glb_primitives(Path(glb))):
            tint = colors[min(index, len(colors) - 1)]
            image = None
            if prim["image"] is not None:
                gray = np.asarray(Image.open(io.BytesIO(prim["image"])).convert("L"), dtype=np.float64) / 255.0
                h, w = gray.shape
                image = bpy.data.images.new(f"{tag}tex{index}", width=w, height=h)
                rgba = np.ones((h, w, 4))
                for k in range(3):
                    rgba[..., k] = gray * tint[k]
                image.pixels.foreach_set(np.flipud(rgba).reshape(-1).tolist())
            add_mesh(f"{tag}{index}", prim["positions"], prim["indices"], tint, prim["uvs"], image)
            if focus:
                focus_points.append(prim["positions"])

    for k, glb in enumerate(args.glb):
        add_glb(glb, tints, True, f"part{k}_")
    for k, glb in enumerate(args.extra or []):
        add_glb(glb, [hex_rgb(args.extra_tint)], False, f"extra{k}_")
    points = np.concatenate(focus_points)
    focus = args.focus
    if focus == "auto":
        focus = "feet" if float(points[:, 1].mean()) < 0.5 else "head"
    views = VIEWS_FEET if focus == "feet" else VIEWS_HEAD
    if args.views:
        views = {k: v for k, v in views.items() if k in args.views.split(",")}
    lo, hi = points.min(axis=0), points.max(axis=0)
    target = 0.5 * (lo + hi)
    span = float(max(hi - lo)) * (1.25 if focus == "feet" else 1.6)
    if args.center:
        target = np.array([float(v) for v in args.center.split(",")])
    if args.span:
        span = float(args.span)
    ground_objects = []
    if args.ground is not None:
        # 땅 표시: 발 둘레 사각 틀(가는 막대) — 원래 바닥 y 0(초록)과 신발 바닥(빨강). 면을 깔면 바닥 뷰를 가리므로 막대만 쓴다
        ground = float(args.ground)
        cx, cz = float(points[:, 0].mean()), float(points[:, 2].mean())
        for y, color in ((0.0, (0.1, 0.55, 0.2)), (ground, (0.80, 0.12, 0.12))):
            corners = [(cx - 0.30, cz - 0.22), (cx + 0.30, cz - 0.22), (cx + 0.30, cz + 0.30), (cx - 0.30, cz + 0.30)]
            for k in range(4):
                (x0, z0), (x1, z1) = corners[k], corners[(k + 1) % 4]
                n = np.array([z1 - z0, 0.0, -(x1 - x0)])
                n = n / np.linalg.norm(n) * 0.0007
                quad = np.array([[x0, y - 0.0007, z0], [x1, y - 0.0007, z1], [x1, y + 0.0007, z1], [x0, y + 0.0007, z0]]) + n
                add_mesh(f"g{y:.3f}_{k}", quad, np.array([[0, 1, 2], [0, 2, 3]]), color)
                ground_objects.append(f"g{y:.3f}_{k}")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = args.size
    scene.render.resolution_y = args.size
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "TEXTURE"
    shading.show_object_outline = True
    shading.object_outline_color = (0.05, 0.05, 0.08)
    shading.show_cavity = True
    shading.cavity_type = "WORLD"
    shading.show_backface_culling = False
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (0.80, 0.82, 0.86)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = span
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    tb = Vector((target[0], -target[2], target[1]))
    files = []
    for name, (yaw, pitch) in views.items():
        y, p = math.radians(yaw), math.radians(pitch)
        d = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
        cam.location = tb + d * 2.0
        cam.rotation_euler = (tb - cam.location).to_track_quat("-Z", "Y").to_euler()
        for obj_name in ground_objects:
            bpy.data.objects[obj_name].hide_render = pitch < -30
        path = f"{args.out}_{name}.png"
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        files.append((name, path))
    tile = 400
    cols = 3
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tile, rows * tile), (40, 40, 48))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(sheet)
    for k, (name, path) in enumerate(files):
        x, y = (k % cols) * tile, (k // cols) * tile
        sheet.paste(Image.open(path).convert("RGB").resize((tile, tile)), (x, y))
        draw.text((x + 6, y + 6), name, fill=(190, 20, 20))
    sheet.save(f"{args.out}__sheet.png")
    print(json.dumps({"sheet": f"{args.out}__sheet.png", "views": [p for _, p in files]}, ensure_ascii=False))
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("--base", default="all", choices=["female", "male", "all"])
    build.add_argument("--base-model-dir", default=str(DEFAULT_BASE_DIR))
    build.add_argument("--out", default=str(DEFAULT_OUT))
    build.add_argument("--only", default="")
    build.add_argument("--profiles", default=",".join(PROFILES))
    build.add_argument("--variants", action="store_true", help="형상 키 미리보기 GLB(가중치 1)를 <out>/variants/에 쓴다")
    render = sub.add_parser("render")
    render.add_argument("--base-model", required=True)
    render.add_argument("--glb", action="append", required=True)
    render.add_argument("--extra", action="append", help="함께 그릴 GLB(헤어 등, LOD0만). 화면 맞춤에는 쓰지 않는다")
    render.add_argument("--extra-tint", default="#6b4a35")
    render.add_argument("--views", default="", help="그릴 뷰(쉼표). 기본: 초점(feet|head)의 뷰 6개")
    render.add_argument("--center", default="", help="화면 중심 x,y,z(m) — 자동 맞춤 대신")
    render.add_argument("--span", default="", help="화면 폭(m) — 자동 맞춤 대신")
    render.add_argument("--out", required=True)
    render.add_argument("--focus", default="auto", choices=["auto", "feet", "head"])
    render.add_argument("--tint", default="#f5f5f5")
    render.add_argument("--skin", default="#f3d3bd")
    render.add_argument("--hide", default="", help="그리지 않을 몸 영역(쉼표, 예: foot.L,foot.R) — 부품 hides 적용 모습")
    render.add_argument("--size", type=int, default=640)
    render.add_argument("--ground", default=None, help="땅 높이 y(m): 원래 바닥(y 0, 초록)과 신발 바닥(빨강) 면을 같이 그린다")
    args = parser.parse_args(argv)
    if args.command == "build":
        return command_build(args)
    return command_render(args)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
