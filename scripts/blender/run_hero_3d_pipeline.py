#!/usr/bin/env python3
"""ToonStudio Hero 3D 통합 빌드 & `toonstudio-kit-v2/kit.json` 조립 오케스트레이터 CLI.

배경 5대 히어로 세트(`tools/blender/webtoon_hero_bg/build_*.py`), 캐릭터 키트 v2
(`build_base_v2.py`, `forge_hair_v2.py`, `forge_garments_v2.py`, `build_hand_poses_v2.py`),
VRM 1.0 히어로 아바타 8종(`export_vrm1_hero.py`), 그리고 `toonstudio-kit-v2/kit.json` +
`NOTICE.md` + SHA-256 매니페스트 갱신을 단일 재현 가능 CLI로 통합 실행한다.

Blender 5.3 불변 실행 규약:
- `/Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 --python <script.py> -- <args>`
- `--addons` 플래그 사용 금지(각 스크립트 내부에서 `addon_enable` 직접 호출).
- Character Lab 키트 v2 코덱: 오직 `KHR_mesh_quantization` 허용(Draco/meshopt/KTX2/WebP 전면 금지).
- BG3D 코덱: `EXT_meshopt_compression` 허용(`KHR_draco_mesh_compression` 금지, 8노드 보존).

실행 예:
    python3 scripts/blender/run_hero_3d_pipeline.py --stages all
    python3 scripts/blender/run_hero_3d_pipeline.py --stages hand-poses,vrm,kit-json
    python3 scripts/blender/run_hero_3d_pipeline.py --verify-only --stages kit-json,vrm
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import struct
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
BLENDER_TOOLS_DIR = REPO_ROOT / "tools" / "blender"
if str(BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(BLENDER_TOOLS_DIR))

DEFAULT_BLENDER_BIN = Path(os.environ.get("BLENDER_BIN", "/Users/hjunkim/.local/bin/blender"))
KIT_V2_DIR = REPO_ROOT / "data" / "character-studio-assets" / "characters" / "toonstudio-kit-v2"
VRM_HERO_DIR = REPO_ROOT / "apps" / "web" / "public" / "vrm" / "toonstudio-hero-v1"
BG_HERO_DIR = REPO_ROOT / "apps" / "web" / "public" / "assets" / "3d" / "environments" / "hero-v1"

BG_BUILD_SCRIPTS: tuple[tuple[str, str], ...] = (
    ("kr_modern_apartment_living", "tools/blender/webtoon_hero_bg/build_kr_apartment_living.py"),
    ("kr_atelier_cafe_interior", "tools/blender/webtoon_hero_bg/build_kr_atelier_cafe.py"),
    ("kr_highschool_classroom_corridor", "tools/blender/webtoon_hero_bg/build_kr_highschool_classroom.py"),
    ("kr_school_rooftop_and_alley", "tools/blender/webtoon_hero_bg/build_kr_rooftop_and_alley.py"),
    ("rofan_imperial_palace_hall_balcony", "tools/blender/webtoon_hero_bg/build_rofan_palace_hall.py"),
)

ARCHETYPE_ORDER: tuple[str, ...] = (
    "female-romance",
    "male-webtoon",
    "male-action",
    "youth-academy",
    "sd-chibi",
)

HERO_VRM_ORDER: tuple[str, ...] = (
    "romance-female",
    "romance-male",
    "academy-female",
    "academy-male",
    "rofan-empress",
    "rofan-duke",
    "action-hunter",
    "chibi-mascot",
)

KIT_FORBIDDEN_EXTENSIONS: frozenset[str] = frozenset(
    {
        "KHR_draco_mesh_compression",
        "EXT_meshopt_compression",
        "KHR_texture_basisu",
        "EXT_texture_webp",
    }
)

ACCESSORY_ANCHOR_BONES: dict[str, str] = {
    "head-top": "head",
    "hair": "head",
    "face": "head",
    "ear-l": "head",
    "ear-r": "head",
    "neck": "neck",
    "wrist-l": "leftLowerArm",
    "wrist-r": "rightLowerArm",
    "waist": "hips",
    "back": "upperChest",
    "hand-l": "leftHand",
    "hand-r": "rightHand",
    "foot-l": "leftFoot",
    "foot-r": "rightFoot",
}


# ---------------------------------------------------------------------------
# 공통 헬퍼 (SHA-256, GLB 헤더 파싱, Blender 실행)
# ---------------------------------------------------------------------------


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def file_entry(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(root).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def _read_glb_json_and_bin(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"유효한 GLB 2.0이 아닙니다: {path}")
    off = 12
    doc: dict[str, Any] = {}
    binary = b""
    while off + 8 <= len(data):
        clen, ctype = struct.unpack_from("<I4s", data, off)
        chunk = data[off + 8 : off + 8 + clen]
        if ctype == b"JSON":
            doc = json.loads(chunk.decode("utf-8"))
        elif ctype.startswith(b"BIN"):
            binary = chunk
        off += 8 + clen
    if not doc:
        raise ValueError(f"JSON 청크가 없습니다: {path}")
    return doc, binary


def read_glb_json(path: Path) -> dict[str, Any]:
    return _read_glb_json_and_bin(path)[0]


def _compute_anchors_pure_python(glb_path: Path, bone_map: dict[str, str]) -> dict[str, dict[str, Any]]:
    """numpy/bpy 없이 순수 Python stdlib로 GLB 정점·조인트에서 14개 소품 앵커를 실측한다."""
    doc, binary = _read_glb_json_and_bin(glb_path)
    nodes = doc.get("nodes", [])
    parents: dict[int, int] = {}
    for pi, nd in enumerate(nodes):
        for ch in nd.get("children", []):
            parents[ch] = pi
    node_idx = {nd.get("name", ""): i for i, nd in enumerate(nodes)}

    world_pos: dict[int, tuple[float, float, float]] = {}

    def get_world(i: int) -> tuple[float, float, float]:
        if i in world_pos:
            return world_pos[i]
        t = nodes[i].get("translation", [0.0, 0.0, 0.0])
        p = parents.get(i)
        if p is None:
            res = (float(t[0]), float(t[1]), float(t[2]))
        else:
            pw = get_world(p)
            res = (pw[0] + float(t[0]), pw[1] + float(t[1]), pw[2] + float(t[2]))
        world_pos[i] = res
        return res

    def read_positions(mesh_node_name: str) -> list[tuple[float, float, float]]:
        ni = node_idx[mesh_node_name]
        mesh = doc["meshes"][nodes[ni]["mesh"]]
        pts: list[tuple[float, float, float]] = []
        for prim in mesh["primitives"]:
            acc = doc["accessors"][prim["attributes"]["POSITION"]]
            bv = doc["bufferViews"][acc["bufferView"]]
            start = int(bv.get("byteOffset", 0)) + int(acc.get("byteOffset", 0))
            stride = int(bv.get("byteStride", 12))
            count = int(acc["count"])
            for k in range(count):
                x, y, z = struct.unpack_from("<fff", binary, start + k * stride)
                pts.append((x, y, z))
        return pts

    head = read_positions("TS_Head")
    body = read_positions("TS_Body")
    skin = head + body
    joint_of_bone = {bone: joint for joint, bone in bone_map.items()}
    jpos = lambda b: get_world(node_idx[joint_of_bone[b]])

    eye_l = jpos("leftEye")
    eye_r = jpos("rightEye")
    eye_mid = ((eye_l[0] + eye_r[0]) * 0.5, (eye_l[1] + eye_r[1]) * 0.5, (eye_l[2] + eye_r[2]) * 0.5)
    head_max = max(head, key=lambda p: p[1])
    head_min_y = min(p[1] for p in head)
    above_eye = [p[2] for p in head if p[1] > eye_mid[1]]
    skull = (0.0, (head_max[1] + head_min_y) * 0.5, sum(above_eye) / max(len(above_eye), 1))

    def support(pts: list[tuple[float, float, float]], origin: tuple[float, float, float], d: tuple[float, float, float]) -> tuple[float, float, float]:
        if not pts:
            return origin
        return max(pts, key=lambda p: (p[0] - origin[0]) * d[0] + (p[1] - origin[1]) * d[1] + (p[2] - origin[2]) * d[2])

    def band(pts: list[tuple[float, float, float]], center: tuple[float, float, float], axes: tuple[int, ...], half: float) -> list[tuple[float, float, float]]:
        return [p for p in pts if all(abs(p[a] - center[a]) <= half for a in axes)]

    ear_band = band(head, (eye_mid[0], eye_mid[1] - 0.01, eye_mid[2]), (1,), 0.015)
    neck = jpos("neck")
    chest = jpos("upperChest")
    lh, lmp = jpos("leftHand"), jpos("leftMiddleProximal")
    rh, rmp = jpos("rightHand"), jpos("rightMiddleProximal")

    anchor_world = {
        "head-top": head_max,
        "hair": support(head, skull, (0.0, 0.6, -0.8)),
        "face": support(band(head, eye_mid, (0, 1), 0.012), eye_mid, (0.0, 0.0, 1.0)),
        "ear-l": support(ear_band, skull, (1.0, 0.0, 0.0)),
        "ear-r": support(ear_band, skull, (-1.0, 0.0, 0.0)),
        "neck": support(band(skin, neck, (0, 1), 0.012), neck, (0.0, 0.0, 1.0)),
        "wrist-l": lh,
        "wrist-r": rh,
        "waist": jpos("spine"),
        "back": support(band(body, chest, (0, 1), 0.015), chest, (0.0, 0.0, -1.0)),
        "hand-l": ((lh[0] + lmp[0]) * 0.5, (lh[1] + lmp[1]) * 0.5, (lh[2] + lmp[2]) * 0.5),
        "hand-r": ((rh[0] + rmp[0]) * 0.5, (rh[1] + rmp[1]) * 0.5, (rh[2] + rmp[2]) * 0.5),
        "foot-l": jpos("leftFoot"),
        "foot-r": jpos("rightFoot"),
    }
    anchors: dict[str, dict[str, Any]] = {}
    for anchor, bone in ACCESSORY_ANCHOR_BONES.items():
        joint = joint_of_bone[bone]
        jw = get_world(node_idx[joint])
        pw = anchor_world[anchor]
        anchors[anchor] = {
            "joint": joint,
            "offsetM": [round(pw[0] - jw[0], 4), round(pw[1] - jw[1], 4), round(pw[2] - jw[2], 4)],
        }
    return anchors


def audit_vrm1_standalone(vrm_path: Path) -> dict[str, Any]:
    """순수 Python stdlib로 VRM 1.0 GLB JSON 청크를 전수 감사한다."""
    doc = read_glb_json(vrm_path)
    errors: list[str] = []
    exts = doc.get("extensions", {})
    vrmc = exts.get("VRMC_vrm", {})
    if vrmc.get("specVersion") != "1.0":
        errors.append(f"VRMC_vrm.specVersion != '1.0': {vrmc.get('specVersion')}")
    hbones = vrmc.get("humanoid", {}).get("humanBones", {})
    if len(hbones) != 55:
        errors.append(f"humanoidBones={len(hbones)} != 55")
    presets = vrmc.get("expressions", {}).get("preset", {})
    if len(presets) < 18:
        errors.append(f"presetExpressions={len(presets)} < 18")
    sb = exts.get("VRMC_springBone", {})
    springs = sb.get("springs", [])
    min_hr = float("inf")
    j_cnt = 0
    for sp in springs:
        for jt in sp.get("joints", []):
            j_cnt += 1
            hr = float(jt.get("hitRadius", 0.0))
            min_hr = min(min_hr, hr)
            if hr <= 0.0:
                errors.append(f"SpringBone hitRadius={hr} <= 0")
    if j_cnt == 0:
        errors.append("SpringBone joints=0")
    mats = doc.get("materials", [])
    sc_cnt = 0
    for mat in mats:
        mt = mat.get("extensions", {}).get("VRMC_materials_mtoon", {})
        if mt.get("outlineWidthMode") != "screenCoordinates":
            errors.append(f"{mat.get('name')}: outlineWidthMode={mt.get('outlineWidthMode')}")
        else:
            sc_cnt += 1
        if abs(float(mt.get("outlineLightingMixFactor", -1.0))) > 1e-5:
            errors.append(f"{mat.get('name')}: outlineLightingMixFactor={mt.get('outlineLightingMixFactor')}")
        if abs(float(mt.get("shadingToonyFactor", -1.0)) - 0.9) > 1e-3:
            errors.append(f"{mat.get('name')}: shadingToonyFactor={mt.get('shadingToonyFactor')}")
    return {
        "file": vrm_path.name,
        "bytes": vrm_path.stat().st_size,
        "sha256": sha256_file(vrm_path),
        "ok": len(errors) == 0,
        "errorCount": len(errors),
        "errors": errors,
        "humanoidBones": len(hbones),
        "presetExpressions": len(presets),
        "springCount": len(springs),
        "springJointCount": j_cnt,
        "minHitRadius": round(min_hr, 5) if j_cnt else 0.0,
        "materialCount": len(mats),
        "mtoonScreenCoordinatesCount": sc_cnt,
    }


def run_blender_script(
    blender_bin: Path,
    script_rel: str,
    extra_args: list[str],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    script_path = REPO_ROOT / script_rel
    if not script_path.is_file():
        return {"script": script_rel, "status": "missing", "returncode": None, "seconds": 0.0}
    cmd = [
        str(blender_bin),
        "--background",
        "--factory-startup",
        "--python-exit-code",
        "42",
        "--python",
        str(script_path),
        "--",
        *extra_args,
    ]
    if dry_run:
        return {"script": script_rel, "status": "dry-run", "cmd": cmd, "returncode": 0, "seconds": 0.0}
    t0 = time.time()
    print(f"[pipeline] 실행: {' '.join(cmd)}", flush=True)
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT), check=False)
    elapsed = round(time.time() - t0, 2)
    status = "ok" if proc.returncode == 0 else "failed"
    if proc.returncode != 0:
        raise RuntimeError(f"Blender 스크립트 실패({script_rel}, exit={proc.returncode})")
    return {"script": script_rel, "status": status, "returncode": proc.returncode, "seconds": elapsed}


# ---------------------------------------------------------------------------
# 계약 68본 스켈레톤 생성기 (kit-skeleton.ts 1:1)
# ---------------------------------------------------------------------------


def build_kit_skeleton_block() -> dict[str, Any]:
    mixamo = "mixamorig:"
    fingers = (
        ("Thumb", ("ThumbMetacarpal", "ThumbProximal", "ThumbDistal")),
        ("Index", ("IndexProximal", "IndexIntermediate", "IndexDistal")),
        ("Middle", ("MiddleProximal", "MiddleIntermediate", "MiddleDistal")),
        ("Ring", ("RingProximal", "RingIntermediate", "RingDistal")),
        ("Pinky", ("LittleProximal", "LittleIntermediate", "LittleDistal")),
    )
    joints: list[str] = []
    parents: dict[str, str | None] = {}
    bone_map: dict[str, str] = {}
    end_bones: list[str] = []

    def add(name: str, parent: str | None, vrm: str | None) -> None:
        joints.append(name)
        parents[name] = parent
        if vrm is None:
            end_bones.append(name)
        else:
            bone_map[name] = vrm

    m = lambda s: f"{mixamo}{s}"
    add(m("Hips"), None, "hips")
    add(m("Spine"), m("Hips"), "spine")
    add(m("Spine1"), m("Spine"), "chest")
    add(m("Spine2"), m("Spine1"), "upperChest")
    add(m("Neck"), m("Spine2"), "neck")
    add(m("Head"), m("Neck"), "head")
    add(m("HeadTop_End"), m("Head"), None)
    for side in ("Left", "Right"):
        lo = side.lower()
        add(m(f"{side}Shoulder"), m("Spine2"), f"{lo}Shoulder")
        add(m(f"{side}Arm"), m(f"{side}Shoulder"), f"{lo}UpperArm")
        add(m(f"{side}ForeArm"), m(f"{side}Arm"), f"{lo}LowerArm")
        add(m(f"{side}Hand"), m(f"{side}ForeArm"), f"{lo}Hand")
        for f_name, vrm_segs in fingers:
            for seg in range(1, 5):
                parent = m(f"{side}Hand") if seg == 1 else m(f"{side}Hand{f_name}{seg - 1}")
                vrm_name = f"{lo}{vrm_segs[seg - 1]}" if seg <= 3 else None
                add(m(f"{side}Hand{f_name}{seg}"), parent, vrm_name)
        add(m(f"{side}UpLeg"), m("Hips"), f"{lo}UpperLeg")
        add(m(f"{side}Leg"), m(f"{side}UpLeg"), f"{lo}LowerLeg")
        add(m(f"{side}Foot"), m(f"{side}Leg"), f"{lo}Foot")
        add(m(f"{side}ToeBase"), m(f"{side}Foot"), f"{lo}Toes")
        add(m(f"{side}Toe_End"), m(f"{side}ToeBase"), None)
    add("TS_Jaw", m("Head"), "jaw")
    add("TS_Eye.L", m("Head"), "leftEye")
    add("TS_Eye.R", m("Head"), "rightEye")
    assert len(joints) == 68 and len(bone_map) == 55 and len(end_bones) == 13
    return {
        "root": "Armature",
        "joints": joints,
        "parents": parents,
        "boneMap": bone_map,
        "endBones": end_bones,
    }


# ---------------------------------------------------------------------------
# GLB 메시·재질·코덱 검사기 (kit.json 조립용)
# ---------------------------------------------------------------------------


def inspect_kit_glb_meshes(glb_path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    """Character Lab 키트 GLB의 메시 목록, 재질 목록, 확장 목록을 추출하고 금지 코덱을 차단한다."""
    doc = read_glb_json(glb_path)
    exts = sorted(set(doc.get("extensionsUsed", [])) | set(doc.get("extensionsRequired", [])))
    bad = sorted(set(exts) & KIT_FORBIDDEN_EXTENSIONS)
    if bad:
        raise RuntimeError(f"Character Lab 키트 금지 코덱 감지({glb_path.name}): {bad}")

    accessors = doc.get("accessors", [])
    raw_mats = doc.get("materials", [])
    raw_meshes = doc.get("meshes", [])
    nodes = doc.get("nodes", [])

    mesh_entries: list[dict[str, Any]] = []
    for nd in nodes:
        if "mesh" not in nd:
            continue
        m_obj = raw_meshes[nd["mesh"]]
        prims = m_obj.get("primitives", [])
        target_names = list(m_obj.get("extras", {}).get("targetNames", []))
        tris = 0
        verts = 0
        prim_mats: list[str] = []
        has_uv1 = True
        has_joints = False
        for prim in prims:
            attrs = prim.get("attributes", {})
            if "POSITION" in attrs:
                verts += int(accessors[attrs["POSITION"]]["count"])
            if "indices" in prim:
                tris += int(accessors[prim["indices"]]["count"]) // 3
            if "TEXCOORD_1" not in attrs:
                has_uv1 = False
            if "JOINTS_0" in attrs:
                has_joints = True
            mi = prim.get("material")
            if mi is not None:
                prim_mats.append(str(raw_mats[mi].get("name", f"mat_{mi}")))

        entry: dict[str, Any] = {
            "node": nd.get("name", m_obj.get("name", "Mesh")),
            "triangles": tris,
            "vertices": verts,
            "skinned": ("skin" in nd) or has_joints,
            "morphs": target_names,
        }
        if len(prim_mats) == 1:
            entry["material"] = prim_mats[0]
        elif len(prim_mats) > 1:
            entry["primitiveMaterials"] = prim_mats
        if has_uv1:
            entry["hasUv1"] = True
        mesh_entries.append(entry)

    mat_entries = [
        {"name": str(m.get("name", f"mat_{i}")), "doubleSided": bool(m.get("doubleSided", False))}
        for i, m in enumerate(raw_mats)
    ]
    return mesh_entries, mat_entries, exts


def _infer_material_entry(mat_name: str, double_sided: bool, slot_hint: str = "") -> dict[str, Any]:
    """재질 이름 규칙으로부터 v2 다채널 재질 선언을 추론한다."""
    fixed_base = {
        "ts_skin_body": {"role": "skin", "channel": "skin", "tint": {"mode": "recolor"}, "doubleSided": double_sided},
        "ts_skin_head": {"role": "head", "channel": "skin", "tint": {"mode": "recolor"}, "doubleSided": double_sided},
        "ts_eye_sclera": {"role": "eyeball", "channel": "sclera", "tint": {"mode": "recolor"}, "doubleSided": double_sided},
        "ts_mouth_inner": {"role": "teeth", "tint": {"mode": "fixed", "hex": "#f4f4f6"}, "doubleSided": double_sided},
        "ts_lashes_brows": {"role": "lash", "channel": "brow", "tint": {"mode": "recolor"}, "doubleSided": double_sided},
    }
    if mat_name in fixed_base:
        return fixed_base[mat_name]

    role = slot_hint or "top"
    if "hair" in mat_name:
        role = "hair-accessory" if "acc" in mat_name else "hair"
    elif "outer" in mat_name:
        role = "outer"
    elif "inner" in mat_name:
        role = "inner"
    elif "legwear" in mat_name or "sock" in mat_name:
        role = "legwear"
    elif "bottom" in mat_name or "skirt" in mat_name or "pants" in mat_name or "slacks" in mat_name:
        role = "bottom"
    elif "shoe" in mat_name or "boot" in mat_name or "loafer" in mat_name:
        role = "shoes"
    elif "accessory" in mat_name or "tiara" in mat_name or "harness" in mat_name:
        role = "accessory"

    channel = role
    if "trim" in mat_name and role in ("top", "inner", "outer", "bottom"):
        channel = f"{role}-trim"
    elif "accent" in mat_name and role in ("top", "outer", "accessory", "hair-accessory", "hair"):
        channel = f"{role}-accent"
    elif "tip" in mat_name and role == "hair":
        channel = "hair-tip"
    elif "sole" in mat_name and role == "shoes":
        channel = "shoes-sole"
    elif "lace" in mat_name and role == "shoes":
        channel = "shoes-lace"

    return {
        "role": role,
        "channel": channel,
        "tint": {"mode": "recolor"},
        "doubleSided": double_sided,
    }


# ---------------------------------------------------------------------------
# `toonstudio-kit-v2/kit.json` + `NOTICE.md` 최종 조립
# ---------------------------------------------------------------------------


def assemble_kit_v2_manifest(
    *,
    kit_dir: Path = KIT_V2_DIR,
    vrm_hero_dir: Path = VRM_HERO_DIR,
) -> dict[str, Any]:
    """5종 베이스 + 표정 + 16종 핸드 포즈 + 발견된 파츠 + 8종 VRM 히어로를 종합해 `kit.json`을 생성한다."""
    bases_dir = kit_dir / "bases"
    if not bases_dir.is_dir():
        raise FileNotFoundError(f"v2 베이스 디렉터리가 없습니다: {bases_dir}")

    skeleton = build_kit_skeleton_block()
    materials: dict[str, dict[str, Any]] = {}
    bases_block: dict[str, Any] = {}
    default_joint_offsets: dict[str, Any] = {}

    for arch_id in ARCHETYPE_ORDER:
        glb_path = bases_dir / f"{arch_id}.glb"
        meta_path = bases_dir / f"{arch_id}_meta.json"
        if not glb_path.is_file() or not meta_path.is_file():
            raise FileNotFoundError(f"필수 v2 베이스 산출물 누락: {arch_id}")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meshes, mat_list, exts = inspect_kit_glb_meshes(glb_path)
        for me in mat_list:
            materials.setdefault(me["name"], _infer_material_entry(me["name"], me["doubleSided"]))

        # 14개 강체 소품 앵커 실측 (순수 Python stdlib)
        anchors = _compute_anchors_pure_python(glb_path, skeleton["boneMap"])

        if arch_id == "female-romance":
            default_joint_offsets = meta.get("jointOffsets", {})

        bases_block[arch_id] = {
            "archetypeId": arch_id,
            "labelKo": meta.get("labelKo", arch_id),
            "genre": meta.get("genre", ""),
            "file": file_entry(glb_path, kit_dir),
            "heightM": meta["heightM"],
            "headHeightM": meta["headHeightM"],
            "headToBodyRatio": (
                round(float(meta["headToBodyRatio"]), 1)
                if meta.get("headToBodyRatio") is not None
                else None
            ),
            "boundsM": meta["boundsM"],
            "extensions": exts,
            "meshes": meshes,
            "bodyRegions": meta.get("bodyRegions", []),
            "anchors": anchors,
            "eyeVertexCounts": meta.get("eyeVertexCounts", {}),
            "neckSeamVertexPairs": meta.get("neckSeamVertexPairs", 0),
        }

    # 2) 파츠 자동 탐색 (`parts/<base>/<slot|layer>/<name>.glb` 또는 `parts/<slot>/<name>.glb`)
    parts_dir = kit_dir / "parts"
    parts_by_id: dict[str, dict[str, Any]] = {}
    if parts_dir.is_dir():
        for glb_path in sorted(parts_dir.rglob("*.glb")):
            rel_parts = glb_path.relative_to(parts_dir).parts
            if len(rel_parts) == 3:
                base_or_group, slot_or_layer, fname = rel_parts
            elif len(rel_parts) == 2:
                base_or_group, slot_or_layer, fname = "shared", rel_parts[0], rel_parts[1]
            else:
                continue
            stem = Path(fname).stem
            slot = "top" if slot_or_layer in ("inner", "outer") else ("bottom" if slot_or_layer == "legwear" else slot_or_layer)
            layer = slot_or_layer if slot_or_layer in ("inner", "outer", "legwear") else None
            part_id = f"{slot}/{stem}"
            meshes, mat_list, exts = inspect_kit_glb_meshes(glb_path)
            for me in mat_list:
                materials.setdefault(me["name"], _infer_material_entry(me["name"], me["doubleSided"], slot_hint=slot_or_layer))
            shapes = sorted(
                {
                    m.split(":")[1]
                    for mesh in meshes
                    for m in mesh.get("morphs", [])
                    if isinstance(m, str) and m.startswith("shape:") and len(m.split(":")) >= 3
                }
            )
            variant_obj = {
                "file": file_entry(glb_path, kit_dir),
                "extensions": exts,
                "meshes": meshes,
                "shapes": shapes,
            }
            rec = parts_by_id.setdefault(part_id, {"id": part_id, "slot": slot, "variants": {}, "layerVariants": {}})
            if layer is None:
                rec["variants"][base_or_group] = variant_obj
            else:
                rec["layerVariants"].setdefault(base_or_group, {})[layer] = variant_obj

    parts_list: list[dict[str, Any]] = []
    for pid in sorted(parts_by_id):
        rec = parts_by_id[pid]
        if not rec["layerVariants"]:
            del rec["layerVariants"]
        parts_list.append(rec)

    # 3) 표정(64 morph + 8 웹툰 감정 + 18 VRM 1.0)
    expr_path = bases_dir / "expressions_v2.json"
    expressions_block: dict[str, Any] | None = None
    if expr_path.is_file():
        expr_doc = json.loads(expr_path.read_text(encoding="utf-8"))
        expressions_block = {
            "file": file_entry(expr_path, kit_dir),
            "morphCount": expr_doc.get("morphCount", 64),
            "webtoonEmotionPresets": list(expr_doc.get("webtoonEmotionPresets", {}).keys()),
            "vrm1Presets": list(expr_doc.get("vrm1ExpressionMappings", {}).keys()),
        }

    # 4) 16종 웹툰 핸드 포즈 + VRMA 1.0
    hand_poses_path = kit_dir / "hand-poses.json"
    hand_poses_block: dict[str, Any] | None = None
    if hand_poses_path.is_file():
        hp_doc = json.loads(hand_poses_path.read_text(encoding="utf-8"))
        hand_poses_block = {
            "file": file_entry(hand_poses_path, kit_dir),
            "count": hp_doc.get("count", 0),
            "poseIds": hp_doc.get("poseIds", []),
            "vrmaCount": sum(1 for p in hp_doc.get("poses", []) if "vrma" in p),
            "contactSheet": hp_doc.get("contactSheet"),
        }

    # 5) 8종 VRM 1.0 히어로 아바타 링크
    hero_vrms: list[dict[str, Any]] = []
    hero_manifest_path = vrm_hero_dir / "manifest.json"
    if hero_manifest_path.is_file():
        hm = json.loads(hero_manifest_path.read_text(encoding="utf-8"))
        for av in hm.get("avatars", []):
            vrm_p = vrm_hero_dir / av["file"]
            if vrm_p.is_file():
                hero_vrms.append(
                    {
                        "id": av["heroId"],
                        "nameKo": av.get("metaName", av["heroId"]),
                        "baseArchetype": av.get("baseArchetype"),
                        "genre": av.get("genre"),
                        "publicUrl": f"/vrm/toonstudio-hero-v1/{av['file']}",
                        "bytes": vrm_p.stat().st_size,
                        "sha256": sha256_file(vrm_p),
                        "humanoidBones": av.get("humanoidBones"),
                        "presetExpressions": av.get("presetExpressions"),
                        "mtoonOutlineWidthMode": "screenCoordinates",
                        "springCount": av.get("springCount"),
                        "minHitRadius": av.get("minHitRadius"),
                    }
                )

    manifest: dict[str, Any] = {
        "schema": "toonstudio.character-kit/2",
        "kitId": "toonstudio-kit-v2",
        "kitVersion": 2,
        "displayName": "ToonStudio 캐릭터 키트 v2 (5종 아키타입 · 16 핸드포즈 · VRM 1.0 히어로 연동)",
        "generatedAt": datetime.date(2026, 11, 21).isoformat(),
        "generator": {
            "tool": "scripts/blender/run_hero_3d_pipeline.py",
            "blender": "5.3.0",
            "command": [
                "build_base_v3.py",
                "build_expressions_v2.py",
                "forge_hair_v3.py",
                "forge_garments_v3.py",
                "build_hand_poses_v2.py",
                "export_vrm1_hero.py",
                "render_portrait_4x5_webp.py",
                "run_hero_3d_pipeline.py --stages kit-json",
            ],
        },
        "coordinateSystem": {
            "up": "+Y",
            "forward": "+Z",
            "unit": "m",
            "handedness": "right",
            "rest": "T-pose",
            "rootScale": 1,
        },
        "codecPolicy": {
            "allowedExtensions": ["KHR_mesh_quantization"],
            "forbiddenExtensions": sorted(KIT_FORBIDDEN_EXTENSIONS),
        },
        "provenance": {
            "noticeFile": "NOTICE.md",
            "summaryKo": (
                "ToonStudio Character Kit v2의 5종 베이스 아키타입, 64 계약 morph, 16종 웹툰 핸드 포즈(JSON/VRMA), "
                "모듈러 파츠 및 8종 VRM 1.0 히어로 아바타는 모두 Blender 5.3 절차 스크립트로 자체 제작된 원본(original / CC0-1.0) "
                "자산입니다. 외부 상업 에셋이나 생성 AI 메시를 포함하지 않습니다."
            ),
            "sources": [
                {
                    "id": "toonstudio-kit-v2-original",
                    "name": "ToonStudio Character Kit v2 절차 생성 원본 (베이스 5종 · 표정 · 핸드포즈 16종 · VRM 1.0 히어로 8종)",
                    "license": "original",
                    "derivative": False,
                    "changesKo": "tools/blender/character_kit/* 및 scripts/blender/run_hero_3d_pipeline.py로 Blender 5.3에서 결정적 절차 생성.",
                }
            ],
        },
        "skeleton": skeleton,
        "materials": materials,
        "jointOffsets": default_joint_offsets,
        "baseAliases": {
            "female": "female-romance",
            "male": "male-webtoon",
        },
        "bases": bases_block,
        "parts": parts_list,
        "expressions": expressions_block,
        "handPoses": hand_poses_block,
        "heroVrmAvatars": hero_vrms,
        "defaults": {
            "base": "female-romance",
            "handPose": "hand-pose/relax",
            "expression": "neutral",
        },
        "physics": {
            "mode": "vrm-spring-bone-1.0",
            "minHitRadiusGt": 0.0,
        },
        "budgets": {
            "baseGlbMaxBytes": 16 * 1024 * 1024,
            "partGlbMaxBytes": 1_572_864,
            "totalMaxBytes": 64 * 1024 * 1024,
            "jointCount": 68,
            "maxInfluencesPerVertex": 4,
            "weightSumTolerance": 1e-3,
            "maxMorphTargetsPerMesh": 96,
            "maxShapesPerVariant": 8,
        },
    }

    kit_json_path = kit_dir / "kit.json"
    kit_json_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    notice_md = (
        "# ToonStudio Character Kit v2 출처 및 라이선스 고지\n\n"
        "- **키트 ID**: `toonstudio-kit-v2` (`toonstudio.character-kit/2`)\n"
        "- **생성일**: 2026-11-21\n"
        "- **라이선스**: `original` / `CC0-1.0` (ToonStudio 자체 절차 제작)\n"
        "- **생성 도구**: Blender 5.3.0 + `tools/blender/character_kit/*` + `scripts/blender/run_hero_3d_pipeline.py`\n\n"
        "## 포함 산출물\n"
        f"- **베이스 아키타입**: {len(bases_block)}종 ({', '.join(bases_block.keys())})\n"
        f"- **등록 모듈러 파츠**: {len(parts_list)}종\n"
        f"- **웹툰 핸드 포즈**: {hand_poses_block['count'] if hand_poses_block else 0}종 (JSON + VRMA 1.0)\n"
        f"- **VRM 1.0 히어로 아바타**: {len(hero_vrms)}종 (`apps/web/public/vrm/toonstudio-hero-v1/`)\n"
    )
    (kit_dir / "NOTICE.md").write_text(notice_md, encoding="utf-8")
    print(
        f"[kit-json] 작성 완료: {kit_json_path} "
        f"(bases={len(bases_block)}, parts={len(parts_list)}, handPoses={hand_poses_block['count'] if hand_poses_block else 0}, heroVrms={len(hero_vrms)})"
    )
    return manifest


def write_bg_manifest_if_present(bg_dir: Path = BG_HERO_DIR) -> dict[str, Any] | None:
    if not bg_dir.is_dir():
        return None
    glbs = sorted(bg_dir.glob("*.glb"))
    if not glbs:
        return None
    entries = []
    for p in glbs:
        doc = read_glb_json(p)
        exts = sorted(set(doc.get("extensionsUsed", [])) | set(doc.get("extensionsRequired", [])))
        if "KHR_draco_mesh_compression" in exts:
            raise RuntimeError(f"BG3D Draco 금지 위반: {p.name}")
        entries.append(
            {
                **file_entry(p, bg_dir),
                "extensions": exts,
                "nodes": [n.get("name") for n in doc.get("nodes", []) if n.get("name")],
                "materials": [m.get("name") for m in doc.get("materials", []) if m.get("name")],
            }
        )
    manifest = {
        "schema": "toonstudio.bg3d.hero-v1-manifest/1",
        "generatedAt": "2026-11-20",
        "count": len(entries),
        "assets": entries,
    }
    out = bg_dir / "manifest.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[bg-manifest] 갱신 완료: {out} ({len(entries)} GLB)")
    return manifest


# ---------------------------------------------------------------------------
# 파이프라인 실행기
# ---------------------------------------------------------------------------


def parse_stages(spec: str) -> list[str]:
    all_stages = ["bg", "bases", "hair", "garments", "hand-poses", "vrm", "kit-json"]
    if spec.strip().lower() == "all":
        return all_stages
    chosen = [s.strip() for s in spec.split(",") if s.strip()]
    unknown = [s for s in chosen if s not in all_stages]
    if unknown:
        raise SystemExit(f"알 수 없는 스테이지: {unknown} (허용: {', '.join(all_stages)})")
    return chosen


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ToonStudio Hero 3D 통합 빌드 & kit.json 조립 CLI")
    parser.add_argument("--blender", type=Path, default=DEFAULT_BLENDER_BIN, help="Blender 5.3 실행 파일 경로")
    parser.add_argument(
        "--stages",
        default="all",
        help="실행 스테이지 (all 또는 콤마 구분: bg,bases,hair,garments,hand-poses,vrm,kit-json)",
    )
    parser.add_argument("--dry-run", action="store_true", help="실제 실행 없이 명령만 출력")
    parser.add_argument("--verify-only", action="store_true", help="Blender 생성 없이 감사·매니페스트 조립만 수행")
    parser.add_argument("--report", type=Path, default=None, help="실행 결과 JSON 리포트 저장 경로")
    args = parser.parse_args(argv)

    stages = parse_stages(args.stages)
    report: dict[str, Any] = {
        "schema": "toonstudio.hero-3d-pipeline-report/1",
        "generatedAt": "2026-11-20",
        "stagesRequested": stages,
        "dryRun": args.dry_run,
        "verifyOnly": args.verify_only,
        "steps": [],
    }

    for stage in stages:
        if stage == "bg":
            if not args.verify_only:
                for slug, rel in BG_BUILD_SCRIPTS:
                    step = run_blender_script(args.blender, rel, ["--out-dir", str(BG_HERO_DIR)], dry_run=args.dry_run)
                    step["stage"] = "bg"
                    step["target"] = slug
                    report["steps"].append(step)
            if not args.dry_run:
                bg_m = write_bg_manifest_if_present(BG_HERO_DIR)
                report["bgManifestCount"] = bg_m["count"] if bg_m else 0

        elif stage == "bases":
            if not args.verify_only:
                report["steps"].append(
                    {
                        "stage": "bases",
                        **run_blender_script(
                            args.blender,
                            "tools/blender/character_kit/build_base_v2.py",
                            ["--archetype", "all", "--out-dir", str(KIT_V2_DIR / "bases")],
                            dry_run=args.dry_run,
                        ),
                    }
                )
            report["steps"].append(
                {
                    "stage": "bases-qa",
                    **run_blender_script(
                        args.blender,
                        "tools/blender/character_kit/qa_character_gate.py",
                        ["--dir", str(KIT_V2_DIR / "bases")],
                        dry_run=args.dry_run,
                    ),
                }
            )

        elif stage == "hair":
            if not args.verify_only:
                report["steps"].append(
                    {
                        "stage": "hair",
                        **run_blender_script(
                            args.blender,
                            "tools/blender/character_kit/forge_hair_v2.py",
                            ["--out-dir", str(KIT_V2_DIR / "parts")],
                            dry_run=args.dry_run,
                        ),
                    }
                )

        elif stage == "garments":
            if not args.verify_only:
                report["steps"].append(
                    {
                        "stage": "garments",
                        **run_blender_script(
                            args.blender,
                            "tools/blender/character_kit/forge_garments_v2.py",
                            ["--out-dir", str(KIT_V2_DIR / "parts")],
                            dry_run=args.dry_run,
                        ),
                    }
                )

        elif stage == "hand-poses":
            if not args.verify_only:
                report["steps"].append(
                    {
                        "stage": "hand-poses",
                        **run_blender_script(
                            args.blender,
                            "tools/blender/character_kit/build_hand_poses_v2.py",
                            [
                                "--out-json",
                                str(KIT_V2_DIR / "hand-poses.json"),
                                "--base-glb",
                                str(KIT_V2_DIR / "bases" / "female-romance.glb"),
                            ],
                            dry_run=args.dry_run,
                        ),
                    }
                )

        elif stage == "vrm":
            if not args.verify_only:
                report["steps"].append(
                    {
                        "stage": "vrm",
                        **run_blender_script(
                            args.blender,
                            "tools/blender/character_kit/export_vrm1_hero.py",
                            [
                                "--hero",
                                "all",
                                "--bases-dir",
                                str(KIT_V2_DIR / "bases"),
                                "--out-dir",
                                str(VRM_HERO_DIR),
                            ],
                            dry_run=args.dry_run,
                        ),
                    }
                )
            elif not args.dry_run:
                # verify-only 모드: 순수 Python stdlib GLB JSON 청크 직접 감사
                audits = []
                for hid in HERO_VRM_ORDER:
                    vp = VRM_HERO_DIR / f"{hid}.vrm"
                    if not vp.is_file():
                        raise FileNotFoundError(f"VRM 파일 누락: {vp}")
                    a = audit_vrm1_standalone(vp)
                    if not a["ok"]:
                        raise RuntimeError(f"VRM 감사 실패({hid}): {a['errors']}")
                    audits.append(a)
                report["vrmAudits"] = audits

        elif stage == "kit-json":
            if not args.dry_run:
                manifest = assemble_kit_v2_manifest(kit_dir=KIT_V2_DIR, vrm_hero_dir=VRM_HERO_DIR)
                report["kitJsonSummary"] = {
                    "schema": manifest["schema"],
                    "bases": len(manifest["bases"]),
                    "parts": len(manifest["parts"]),
                    "handPoses": manifest["handPoses"]["count"] if manifest["handPoses"] else 0,
                    "heroVrmAvatars": len(manifest["heroVrmAvatars"]),
                }

    if args.report is not None and not args.dry_run:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"[run_hero_3d_pipeline] 완료: stages={stages}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
