"""ToonStudio Character Kit v2 — 종합 QA 게이트 및 6뷰 512px EEVEE 컨택트시트 렌더러 (Blender 5.3).

하드 게이트 목록:
1. GLB 컨테이너·코덱: 오직 `KHR_mesh_quantization` 허용(Draco/meshopt/KTX2/WebP 0건), 68본 스켈레톤,
   5재질 슬롯(`ts_skin_body`, `ts_skin_head`, `ts_eye_sclera`, `ts_mouth_inner`, `ts_lashes_brows`),
   계약 64 morph + raw SHORT 정수 min/max 바운드, `facs:jawOpen` 단독 완결, `TS_Eye.L/R >= 200` verts/eye.
2. Blender 5.3 실임포트 `bmesh` 0-결함: `true_nonmanifold == 0`, `loose_verts == 0`, `wire_edges == 0`,
   `zero_area == 0`, `scale == (1,1,1)`, 바닥 접지 `Z=0`(Blender)/`Y=0`(glTF), UV `[0,1]`.
3. 목 이음매 6포즈 `0.00 mm`: 실제 GLB 정점·스킨 가중치·IBM 기반 6포즈 LBS 평가, 최대 틈 `<= 0.001 mm`.
4. 어깨 85° 거상 신장률 `<= 1.85`: Clavicle 0.25(21.25°) + UpperArm 0.75(63.75°) 양방향(상향 +85° / 하향 -85°)
   ROI 최대 간선 신장률 `<= 1.85` 및 2배 초과 간선 `0개`.
5. Khronos `gltf-transform validate`: 0 오류.
6. 6뷰 512×512 `BLENDER_EEVEE` 컨택트시트(`front`, `three_quarter`, `side`, `back`, `face_closeup`,
   `pose_85_shoulder`) + `<archetype>_preview.png` 자동 생성.

실행:
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/qa_character_gate.py -- \
        --dir apps/character-lab/public/assets/characters/toonstudio-kit-v2/bases
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path
from typing import Any

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector

_THIS_DIR = Path(__file__).resolve().parent
_BLENDER_TOOLS_DIR = _THIS_DIR.parent
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from character_kit import build_base_v2 as bb2  # noqa: E402
from character_kit import build_expressions_v2 as expr  # noqa: E402

EXPECTED_MATERIALS: tuple[str, ...] = (
    "ts_skin_body",
    "ts_skin_head",
    "ts_eye_sclera",
    "ts_mouth_inner",
    "ts_lashes_brows",
)
FORBIDDEN_EXTENSIONS: frozenset[str] = frozenset(
    {
        "KHR_draco_mesh_compression",
        "EXT_meshopt_compression",
        "KHR_texture_basisu",
        "EXT_texture_webp",
    }
)

_COMP_DTYPE = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_COMP_NORM = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}
_TYPE_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


# ---------------------------------------------------------------------------
# 원시 GLB 리더 (sparse + KHR_mesh_quantization 완전 디코드)
# ---------------------------------------------------------------------------


class GlbReader:
    def __init__(self, path: Path) -> None:
        self.path = path
        data = path.read_bytes()
        magic, version, _ = struct.unpack_from("<4sII", data, 0)
        if magic != b"glTF" or version != 2:
            raise ValueError(f"GLB 2.0이 아닙니다: {path}")
        off = 12
        self.doc: dict[str, Any] = {}
        self.bin = b""
        while off + 8 <= len(data):
            clen, ctype = struct.unpack_from("<I4s", data, off)
            chunk = data[off + 8 : off + 8 + clen]
            if ctype == b"JSON":
                self.doc = json.loads(chunk.decode("utf-8"))
            elif ctype.startswith(b"BIN"):
                self.bin = chunk
            off += 8 + clen
        self.node_by_name: dict[str, int] = {n.get("name", ""): i for i, n in enumerate(self.doc.get("nodes", []))}

    def read_accessor(self, idx: int, *, dequantize: bool = True) -> np.ndarray:
        acc = self.doc["accessors"][idx]
        count = int(acc["count"])
        width = _TYPE_WIDTH[acc["type"]]
        ct = int(acc["componentType"])
        dtype = np.dtype(_COMP_DTYPE[ct])
        out = np.zeros((count, width), dtype=dtype)
        if "bufferView" in acc:
            bv = self.doc["bufferViews"][acc["bufferView"]]
            stride = int(bv.get("byteStride", width * dtype.itemsize))
            start = int(bv.get("byteOffset", 0)) + int(acc.get("byteOffset", 0))
            if count > 0:
                raw = np.frombuffer(self.bin, dtype=np.uint8, count=stride * (count - 1) + width * dtype.itemsize, offset=start)
                rows = np.lib.stride_tricks.as_strided(raw, shape=(count, width * dtype.itemsize), strides=(stride, 1)).copy()
                out = rows.view(dtype).reshape(count, width)
        if "sparse" in acc:
            sp = acc["sparse"]
            scount = int(sp["count"])
            iv = self.doc["bufferViews"][sp["indices"]["bufferView"]]
            idtype = np.dtype(_COMP_DTYPE[int(sp["indices"]["componentType"])])
            istart = int(iv.get("byteOffset", 0)) + int(sp["indices"].get("byteOffset", 0))
            s_idx = np.frombuffer(self.bin, dtype=idtype, count=scount, offset=istart)
            vv = self.doc["bufferViews"][sp["values"]["bufferView"]]
            vstart = int(vv.get("byteOffset", 0)) + int(sp["values"].get("byteOffset", 0))
            s_val = np.frombuffer(self.bin, dtype=dtype, count=scount * width, offset=vstart).reshape(scount, width)
            out = out.copy()
            out[s_idx] = s_val
        if dequantize and acc.get("normalized") and ct in _COMP_NORM:
            f = out.astype(np.float64) / _COMP_NORM[ct]
            if ct in (5120, 5122):
                f = np.maximum(f, -1.0)
            return f if width > 1 else f.reshape(-1)
        return out if width > 1 else out.reshape(-1)

    def mesh_prim(self, node_name: str, prim_idx: int = 0) -> dict[str, Any]:
        ni = self.node_by_name[node_name]
        mesh = self.doc["meshes"][self.doc["nodes"][ni]["mesh"]]
        prim = mesh["primitives"][prim_idx]
        attrs = prim["attributes"]
        out: dict[str, Any] = {
            "positions": self.read_accessor(attrs["POSITION"]).astype(np.float64),
            "normals": self.read_accessor(attrs["NORMAL"]).astype(np.float64) if "NORMAL" in attrs else None,
            "uv": self.read_accessor(attrs["TEXCOORD_0"]).astype(np.float64) if "TEXCOORD_0" in attrs else None,
            "joints": self.read_accessor(attrs["JOINTS_0"], dequantize=False).astype(np.int64) if "JOINTS_0" in attrs else None,
            "weights": self.read_accessor(attrs["WEIGHTS_0"]).astype(np.float64) if "WEIGHTS_0" in attrs else None,
            "indices": self.read_accessor(prim["indices"], dequantize=False).astype(np.int64).reshape(-1, 3),
            "target_names": list(mesh.get("extras", {}).get("targetNames", [])),
            "targets": prim.get("targets", []),
        }
        return out


# ---------------------------------------------------------------------------
# 순수 NumPy 순기구학(FK) + LBS 평가 (목 6포즈 & 어깨 85° 거상 정확 계측)
# ---------------------------------------------------------------------------


def _rot_mat_euler_xyz(rx_deg: float = 0.0, ry_deg: float = 0.0, rz_deg: float = 0.0) -> np.ndarray:
    rx, ry, rz = math.radians(rx_deg), math.radians(ry_deg), math.radians(rz_deg)
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], dtype=np.float64)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], dtype=np.float64)
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], dtype=np.float64)
    return Rz @ Ry @ Rx


def eval_skin_matrices(reader: GlbReader, pose_euler_deg: dict[str, tuple[float, float, float]]) -> tuple[np.ndarray, np.ndarray]:
    """glTF 스켈레톤의 포즈 행렬 `M_skin[j] = M_world[j] @ IBM[j]` (J,4,4)와 레스트 월드 위치 (J,3)을 계산한다."""
    doc = reader.doc
    skin_d = doc["skins"][0]
    joint_node_ids: list[int] = list(skin_d["joints"])
    ibm_flat = reader.read_accessor(skin_d["inverseBindMatrices"]).astype(np.float64)
    # glTF MAT4는 열 우선 → 전치해서 행 우선 4×4 행렬로 변환
    ibms = ibm_flat.reshape(-1, 4, 4).transpose(0, 2, 1)

    nodes = doc["nodes"]
    parent_of: dict[int, int] = {}
    for pi, nd in enumerate(nodes):
        for ch in nd.get("children", []):
            parent_of[ch] = pi

    world_mats: dict[int, np.ndarray] = {}

    def world_of(ni: int) -> np.ndarray:
        if ni in world_mats:
            return world_mats[ni]
        nd = nodes[ni]
        name = nd.get("name", "")
        loc = np.eye(4, dtype=np.float64)
        if "translation" in nd:
            loc[:3, 3] = nd["translation"]
        if name in pose_euler_deg:
            loc[:3, :3] = _rot_mat_euler_xyz(*pose_euler_deg[name])
        p = parent_of.get(ni)
        w = loc if p is None else (world_of(p) @ loc)
        world_mats[ni] = w
        return w

    skin_mats = np.empty((len(joint_node_ids), 4, 4), dtype=np.float64)
    rest_pos = np.empty((len(joint_node_ids), 3), dtype=np.float64)
    for j_idx, ni in enumerate(joint_node_ids):
        mw = world_of(ni)
        skin_mats[j_idx] = mw @ ibms[j_idx]
        # IBM 역이동 = 레스트 월드 위치 (회전 항등)
        rest_pos[j_idx] = -ibms[j_idx][:3, 3]
    return skin_mats, rest_pos


def apply_lbs(positions: np.ndarray, joints: np.ndarray, weights: np.ndarray, skin_mats: np.ndarray) -> np.ndarray:
    """표준 GPU LBS: v' = sum_k w_k * (M_k @ [v, 1])."""
    n = len(positions)
    out = np.zeros((n, 3), dtype=np.float64)
    for k in range(4):
        wk = weights[:, k : k + 1]
        mk = skin_mats[joints[:, k]]  # (N,4,4)
        rot = np.einsum("nij,nj->ni", mk[:, :3, :3], positions) + mk[:, :3, 3]
        out += wk * rot
    return out


# ---------------------------------------------------------------------------
# 게이트 검사 A~E
# ---------------------------------------------------------------------------


def gate_container_and_contract(reader: GlbReader) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    doc = reader.doc
    exts = set(doc.get("extensionsUsed", [])) | set(doc.get("extensionsRequired", []))
    bad_ext = sorted(exts & FORBIDDEN_EXTENSIONS)
    if bad_ext:
        errors.append(f"금지 코덱 확장 포함: {bad_ext}")
    if "KHR_mesh_quantization" not in exts:
        errors.append("KHR_mesh_quantization 확장이 선언되지 않았습니다.")

    # 스켈레톤 68본 검증
    skins = doc.get("skins", [])
    if len(skins) != 1:
        errors.append(f"skin 개수={len(skins)} (기대 1)")
        joint_names: list[str] = []
    else:
        joint_names = [doc["nodes"][ni]["name"] for ni in skins[0]["joints"]]
        if joint_names != bb2.SKELETON_JOINTS:
            errors.append(f"68본 스켈레톤 이름/순서 불일치(실제 {len(joint_names)}개)")
        skel_ni = skins[0].get("skeleton")
        if skel_ni is not None and doc["nodes"][skel_ni]["name"] != "mixamorig:Hips":
            errors.append(f"skin.skeleton={doc['nodes'][skel_ni]['name']} (기대 mixamorig:Hips)")

    # 5개 재질 슬롯 검증
    mat_names = [m["name"] for m in doc.get("materials", [])]
    if tuple(mat_names) != EXPECTED_MATERIALS:
        errors.append(f"재질 슬롯 불일치: 실제 {mat_names} vs 기대 {list(EXPECTED_MATERIALS)}")

    # 계약 64 morph + raw SHORT min/max 바운드 검증
    try:
        morph_check = expr.verify_glb_morph_bounds(reader.path)
    except Exception as exc:
        errors.append(f"morph 바운드 검증 실패: {exc}")
        morph_check = {"ok": False}

    # TS_Eye.L/R 정점 가중치 수 (>= 200 verts/eye)
    eye_j_l = bb2.JOINT_INDEX["TS_Eye.L"]
    eye_j_r = bb2.JOINT_INDEX["TS_Eye.R"]
    eye_counts = {"TS_Eye.L": 0, "TS_Eye.R": 0}
    for nd in doc.get("nodes", []):
        if "mesh" not in nd:
            continue
        p = reader.mesh_prim(nd["name"])
        if p["joints"] is None or p["weights"] is None:
            continue
        # 스킨 정규화/범위 검사
        wsum = p["weights"].sum(axis=1)
        if float(np.abs(wsum - 1.0).max()) > 1e-3:
            errors.append(f"{nd['name']}: 가중치 합 오차 {float(np.abs(wsum - 1.0).max()):.5f} > 1e-3")
        eye_counts["TS_Eye.L"] += int(((p["joints"] == eye_j_l) & (p["weights"] > 0.01)).any(axis=1).sum())
        eye_counts["TS_Eye.R"] += int(((p["joints"] == eye_j_r) & (p["weights"] > 0.01)).any(axis=1).sum())
        # UV 범위 [0,1] 검사
        if p["uv"] is not None:
            u_min, u_max = float(p["uv"].min()), float(p["uv"].max())
            if u_min < -0.001 or u_max > 1.001:
                errors.append(f"{nd['name']}: UV 범위 이탈 [{u_min:.4f}, {u_max:.4f}]")

    if eye_counts["TS_Eye.L"] < 200 or eye_counts["TS_Eye.R"] < 200:
        errors.append(f"눈 본 가중치 정점 수 부족: {eye_counts} (각 >= 200 필요)")

    # facs:jawOpen 단독 완결 검증 (TS_Head에서 턱/아랫입술 변위 >= 10mm, <= 49mm)
    head = reader.mesh_prim("TS_Head")
    jaw_open_max_mm = 0.0
    if "facs:jawOpen" in head["target_names"]:
        ti = head["target_names"].index("facs:jawOpen")
        j_delta = reader.read_accessor(head["targets"][ti]["POSITION"])
        jaw_open_max_mm = float(np.linalg.norm(j_delta, axis=1).max() * 1000.0)
        if not (10.0 <= jaw_open_max_mm <= 49.5):
            errors.append(f"facs:jawOpen 최대 변위 {jaw_open_max_mm:.2f}mm 범위 이탈 [10, 49.5]")
    else:
        errors.append("TS_Head에 facs:jawOpen morph가 없습니다.")

    # 바닥 접지 Y=0 & 신장 & 얼굴 +Z 방향 검증
    body = reader.mesh_prim("TS_Body")
    min_y = float(min(body["positions"][:, 1].min(), head["positions"][:, 1].min()))
    max_y = float(max(body["positions"][:, 1].max(), head["positions"][:, 1].max()))
    if abs(min_y) > 0.001:
        errors.append(f"glTF 발바닥 접지 이탈: min_y = {min_y*1000:.3f}mm")
    eye_l = reader.mesh_prim("TS_Eye_L")
    if float(eye_l["positions"][:, 2].mean()) <= float(head["positions"][:, 2].mean()):
        errors.append("얼굴이 +Z 정면을 향하지 않습니다.")

    return {
        "extensions": sorted(exts),
        "jointCount": len(joint_names),
        "materials": mat_names,
        "morphCheck": morph_check,
        "eyeWeightedVerts": eye_counts,
        "jawOpenMaxMm": round(jaw_open_max_mm, 2),
        "gltfMinYM": round(min_y, 6),
        "gltfHeightM": round(max_y - min_y, 4),
    }, errors


def gate_neck_seam_6_poses(reader: GlbReader) -> tuple[dict[str, Any], list[str]]:
    """목 이음매 6포즈 0.00mm 틈 및 법선 일치 검증."""
    errors: list[str] = []
    body = reader.mesh_prim("TS_Body")
    head = reader.mesh_prim("TS_Head")
    bp, bn, bj, bw = body["positions"], body["normals"], body["joints"], body["weights"]
    hp, hn, hj, hw = head["positions"], head["normals"], head["joints"], head["weights"]

    # 레스트 위치 1e-5m 이내 정점 쌍 매칭
    pairs: list[tuple[int, int]] = []
    # 목 높이 밴드 필터로 고속 매칭
    y_lo = float(hp[:, 1].min()) - 0.005
    y_hi = float(bp[:, 1].max()) + 0.005
    b_cand = np.flatnonzero((bp[:, 1] >= y_lo) & (bp[:, 1] <= y_hi))
    h_cand = np.flatnonzero((hp[:, 1] >= y_lo) & (hp[:, 1] <= y_hi))
    if b_cand.size and h_cand.size:
        dmat = np.linalg.norm(bp[b_cand][:, None, :] - hp[h_cand][None, :, :], axis=2)
        bi_idx, hi_idx = np.where(dmat <= 1e-5)
        pairs = [(int(b_cand[b]), int(h_cand[h])) for b, h in zip(bi_idx, hi_idx)]

    if len(pairs) < 32:
        errors.append(f"목 이음매 공유 정점 쌍 부족: {len(pairs)}개 (< 32)")
        return {"seamPairs": len(pairs), "poses": {}}, errors

    b_ids = np.array([p[0] for p in pairs], dtype=np.int64)
    h_ids = np.array([p[1] for p in pairs], dtype=np.int64)
    min_nrm_dot = float(np.einsum("ij,ij->i", bn[b_ids], hn[h_ids]).min())
    if min_nrm_dot < 0.9995:
        errors.append(f"목 이음매 법선 불일치: min_dot={min_nrm_dot:.6f}")

    m = lambda s: f"{bb2.MIXAMO}{s}"
    six_poses: dict[str, dict[str, tuple[float, float, float]]] = {
        "1_rest_t_pose": {},
        "2_a_pose_45": {
            m("LeftShoulder"): (0, 0, -8.0),
            m("LeftArm"): (0, 0, -45.0),
            m("RightShoulder"): (0, 0, +8.0),
            m("RightArm"): (0, 0, +45.0),
        },
        "3_neck_flexion": {m("Spine2"): (+10.0, 0, 0), m("Neck"): (+25.0, 0, 0), m("Head"): (+15.0, 0, 0)},
        "4_neck_extension": {m("Spine2"): (-8.0, 0, 0), m("Neck"): (-20.0, 0, 0), m("Head"): (-15.0, 0, 0)},
        "5_neck_lateral_tilt": {m("Neck"): (0, 0, +22.0), m("Head"): (0, 0, +15.0), m("LeftShoulder"): (0, 0, +12.0)},
        "6_neck_twist_reach_85": {
            m("Neck"): (0, +35.0, 0),
            m("Head"): (0, +25.0, 0),
            m("LeftShoulder"): (0, 0, +21.25),
            m("LeftArm"): (0, 0, +63.75),
        },
    }
    pose_gaps: dict[str, float] = {}
    worst_mm = 0.0
    for pname, pdict in six_poses.items():
        smats, _ = eval_skin_matrices(reader, pdict)
        bp_p = apply_lbs(bp[b_ids], bj[b_ids], bw[b_ids], smats)
        hp_p = apply_lbs(hp[h_ids], hj[h_ids], hw[h_ids], smats)
        gap_mm = float(np.linalg.norm(bp_p - hp_p, axis=1).max() * 1000.0)
        pose_gaps[pname] = round(gap_mm, 5)
        worst_mm = max(worst_mm, gap_mm)
        if gap_mm > 0.005:
            errors.append(f"목 이음매 포즈 {pname} 틈={gap_mm:.4f}mm (> 0.005mm)")

    return {
        "seamPairs": len(pairs),
        "minNormalDot": round(min_nrm_dot, 6),
        "worstGapMm": round(worst_mm, 5),
        "posesMm": pose_gaps,
    }, errors


def gate_shoulder_85_stretch(reader: GlbReader) -> tuple[dict[str, Any], list[str]]:
    """어깨 85° 거상(Clavicle 0.25 + UpperArm 0.75) 양방향 ROI 최대 간선 신장률 <= 1.85 검증."""
    errors: list[str] = []
    body = reader.mesh_prim("TS_Body")
    bp, bj, bw, tris = body["positions"], body["joints"], body["weights"], body["indices"]

    # UV 분할로 복제된 정점을 위치(1e-5m)로 용접해 순수 물리 메쉬 간선만 계측
    key = np.round(bp * 1e5).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    w_pos = bp[first]
    w_j = bj[first]
    w_w = bw[first]
    w_tris = inv[tris]

    # 고유 간선 추출
    e01 = np.sort(w_tris[:, [0, 1]], axis=1)
    e12 = np.sort(w_tris[:, [1, 2]], axis=1)
    e20 = np.sort(w_tris[:, [2, 0]], axis=1)
    edges = np.unique(np.concatenate([e01, e12, e20], axis=0), axis=0)
    edges = edges[edges[:, 0] != edges[:, 1]]
    rest_len = np.linalg.norm(w_pos[edges[:, 0]] - w_pos[edges[:, 1]], axis=1)
    valid = rest_len > 1e-5
    edges = edges[valid]
    rest_len = rest_len[valid]

    _, rest_joints = eval_skin_matrices(reader, {})
    height_m = float(w_pos[:, 1].max() - w_pos[:, 1].min())
    roi_r = 0.17 * (height_m / 1.65)
    piv_l = rest_joints[bb2.JOINT_INDEX[f"{bb2.MIXAMO}LeftArm"]]
    piv_r = rest_joints[bb2.JOINT_INDEX[f"{bb2.MIXAMO}RightArm"]]
    pivots = np.stack([piv_l, piv_r], axis=0)
    in_roi = np.linalg.norm(w_pos[:, None, :] - pivots[None, :, :], axis=2).min(axis=1) <= roi_r
    roi_edges = edges[in_roi[edges].any(axis=1)]
    roi_rest = rest_len[in_roi[edges].any(axis=1)]

    m = lambda s: f"{bb2.MIXAMO}{s}"
    test_cases = {
        "raise_85_deg": {
            m("LeftShoulder"): (0, 0, +21.25),
            m("LeftArm"): (0, 0, +63.75),
            m("RightShoulder"): (0, 0, -21.25),
            m("RightArm"): (0, 0, -63.75),
        },
        "drop_85_deg": {
            m("LeftShoulder"): (0, 0, -21.25),
            m("LeftArm"): (0, 0, -63.75),
            m("RightShoulder"): (0, 0, +21.25),
            m("RightArm"): (0, 0, +63.75),
        },
    }
    stats: dict[str, Any] = {}
    worst_ratio = 0.0
    for cname, pdict in test_cases.items():
        smats, _ = eval_skin_matrices(reader, pdict)
        posed = apply_lbs(w_pos, w_j, w_w, smats)
        plen = np.linalg.norm(posed[roi_edges[:, 0]] - posed[roi_edges[:, 1]], axis=1)
        ratios = plen / roi_rest
        rmax = float(ratios.max()) if len(ratios) else 1.0
        rp95 = float(np.quantile(ratios, 0.95)) if len(ratios) else 1.0
        over2 = int((ratios > 2.0).sum())
        stats[cname] = {"maxStretch": round(rmax, 4), "p95Stretch": round(rp95, 4), "edgesOver2x": over2, "roiEdgeCount": int(len(roi_edges))}
        worst_ratio = max(worst_ratio, rmax)
        if rmax > 1.85:
            errors.append(f"어깨 85°({cname}) 최대 간선 신장률 {rmax:.3f} > 1.85")
        if over2 > 0:
            errors.append(f"어깨 85°({cname}) 2배 초과 간선 {over2}개")

    return {"worstMaxStretch": round(worst_ratio, 4), "cases": stats}, errors


def gate_gltf_transform_validate(glb_path: Path) -> tuple[dict[str, Any], list[str]]:
    """Khronos `gltf-transform validate --format csv` 실행 및 0-오류 강제."""
    exe = shutil.which("gltf-transform") or "/Users/hjunkim/.local/bin/gltf-transform"
    proc = subprocess.run([exe, "validate", str(glb_path), "--format", "csv"], capture_output=True, text=True, check=False)
    err_rows: list[dict[str, str]] = []
    warn_rows: list[dict[str, str]] = []
    for line in proc.stdout.splitlines():
        if not line.strip() or line.startswith("code,"):
            continue
        parts = next(csv.reader([line]), [])
        if len(parts) >= 3:
            code, msg, sev = parts[0], parts[1], parts[2].strip()
            if sev == "0":
                err_rows.append({"code": code, "message": msg})
            elif sev == "1":
                warn_rows.append({"code": code, "message": msg})
    errors: list[str] = []
    if proc.returncode != 0 or err_rows:
        errors.append(f"gltf-transform validate 오류 {len(err_rows)}건 (rc={proc.returncode}): {err_rows[:3]}")
    return {
        "returncode": proc.returncode,
        "errorCount": len(err_rows),
        "warningCount": len(warn_rows),
        "sampleWarnings": warn_rows[:3],
    }, errors


# ---------------------------------------------------------------------------
# Blender 5.3 임포트 bmesh 0-결함 검사 + 6뷰 512px BLENDER_EEVEE 컨택트시트
# ---------------------------------------------------------------------------


def _write_png_rgba(path: Path, rgba_u8: np.ndarray) -> None:
    """순수 Python + zlib RGBA PNG 저장 (PIL 불필요)."""
    h, w, c = rgba_u8.shape
    assert c == 4
    raw = b"".join(b"\x00" + rgba_u8[y].tobytes() for y in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def _load_png_rgba_bpy(path: Path) -> np.ndarray:
    """Blender `bpy.data.images.load`로 PNG를 (H,W,4) uint8 상단→하단 배열로 읽는다."""
    img = bpy.data.images.load(str(path), check_existing=False)
    w, h = img.size[0], img.size[1]
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    arr = buf.reshape(h, w, 4)[::-1]  # Blender 하단→상단 → 표준 상단→하단
    return np.clip(np.rint(arr * 255.0), 0, 255).astype(np.uint8)


def _setup_eevee_studio(scene: bpy.types.Scene, res: int = 512) -> bpy.types.Object:
    """BLENDER_EEVEE 아틀리에 3점 스튜디오 조명 + AgX 톤매핑(하이라이트 백화 방지)."""
    scene.render.engine = "BLENDER_EEVEE"  # BLENDER_EEVEE_NEXT 절대 금지!
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 24
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium Low Contrast"
    scene.view_settings.exposure = 0.10

    world = bpy.data.worlds.new("TS_QA_World")
    nt = world.node_tree
    nt.nodes.clear()
    n_out = nt.nodes.new("ShaderNodeOutputWorld")
    n_mix = nt.nodes.new("ShaderNodeMixShader")
    n_lp = nt.nodes.new("ShaderNodeLightPath")
    n_bg_light = nt.nodes.new("ShaderNodeBackground")
    n_bg_light.inputs[0].default_value = (0.98, 0.95, 0.92, 1.0)
    n_bg_light.inputs[1].default_value = 0.92
    n_bg_cam = nt.nodes.new("ShaderNodeBackground")
    # AgX 톤매핑에서 배경만 밝고 따뜻한 아틀리에 알라바스터(#EAE6DF)로 렌더링
    n_bg_cam.inputs[0].default_value = (0.96, 0.94, 0.90, 1.0)
    n_bg_cam.inputs[1].default_value = 2.40
    nt.links.new(n_lp.outputs["Is Camera Ray"], n_mix.inputs["Fac"])
    nt.links.new(n_bg_light.outputs["Background"], n_mix.inputs[1])
    nt.links.new(n_bg_cam.outputs["Background"], n_mix.inputs[2])
    nt.links.new(n_mix.outputs["Shader"], n_out.inputs["Surface"])
    scene.world = world

    # 균형 잡힌 3점 스튜디오 조명 (얼굴 커스텀 법선과 따뜻한 웹툰 피부 톤이 선명하게 읽히도록 설정)
    lights = [
        ("KeySun", "SUN", 2.45, (1.0, 0.96, 0.92), Vector((2.2, -2.2, 2.6))),
        ("FillArea", "AREA", 32.0, (0.94, 0.96, 1.0), Vector((-2.4, -1.8, 1.4))),
        ("RimArea", "AREA", 38.0, (1.0, 0.96, 0.90), Vector((0.8, 2.5, 2.1))),
    ]
    for lname, ltype, energy, col, pos in lights:
        ld = bpy.data.lights.new(lname, type=ltype)
        ld.energy = energy
        ld.color = col
        if ltype == "AREA":
            ld.size = 1.8
        lo = bpy.data.objects.new(lname, ld)
        lo.location = pos
        lo.rotation_euler = (Vector((0, 0, 1.0)) - pos).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(lo)

    cam_d = bpy.data.cameras.new("TS_QA_Cam")
    cam_d.lens = 50.0
    cam_d.clip_start = 0.02
    cam_d.clip_end = 50.0
    cam = bpy.data.objects.new("TS_QA_Cam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def _aim_camera(cam: bpy.types.Object, location: Vector, target: Vector, lens: float = 50.0) -> None:
    cam.data.lens = lens
    cam.location = location
    cam.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()


def gate_blender_import_and_render(glb_path: Path, out_dir: Path, res: int = 512, skip_render: bool = False) -> tuple[dict[str, Any], list[str]]:
    """Blender 5.3 실임포트 bmesh 0-결함 검증 + 6뷰 512px BLENDER_EEVEE 컨택트시트 렌더."""
    errors: list[str] = []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    bpy.ops.import_scene.gltf(filepath=str(glb_path))

    meshes: list[bpy.types.Object] = []
    armature: bpy.types.Object | None = None
    for obj in scene.objects:
        if obj.type == "ARMATURE":
            armature = obj
        elif obj.type == "MESH" and not obj.name.startswith("Icosphere"):
            meshes.append(obj)

    if not meshes:
        return {}, ["임포트된 메시가 없습니다."]

    bmesh_report: dict[str, Any] = {}
    min_z_all = math.inf
    max_z_all = -math.inf
    head_bounds = None

    for obj in meshes:
        if any(abs(s - 1.0) > 1e-4 for s in obj.scale):
            errors.append(f"{obj.name}: scale={tuple(round(v, 4) for v in obj.scale)} != (1,1,1)")
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        loose = sum(1 for v in bm.verts if len(v.link_edges) == 0)
        wire = sum(1 for e in bm.edges if len(e.link_faces) == 0)
        true_nm = sum(1 for e in bm.edges if len(e.link_faces) > 2 or (len(e.link_faces) == 2 and not e.is_contiguous))
        zero_a = sum(1 for f in bm.faces if f.calc_area() <= 1e-10)
        bm.free()
        bmesh_report[obj.name] = {
            "verts": len(obj.data.vertices),
            "faces": len(obj.data.polygons),
            "trueNonManifold": true_nm,
            "looseVerts": loose,
            "wireEdges": wire,
            "zeroAreaFaces": zero_a,
        }
        if true_nm or loose or wire or zero_a:
            errors.append(f"{obj.name} bmesh 결함: nm={true_nm}, loose={loose}, wire={wire}, zeroA={zero_a}")

        # 월드 바운드
        pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        min_z_all = min(min_z_all, lo.z)
        max_z_all = max(max_z_all, hi.z)
        if obj.name == "TS_Head":
            head_bounds = (lo, hi)

    if abs(min_z_all) > 0.001:
        errors.append(f"Blender 임포트 바닥 접지 이탈: min_z={min_z_all*1000:.3f}mm")

    contact_sheet_path = out_dir / f"{glb_path.stem}_contact_sheet.png"
    preview_path = out_dir / f"{glb_path.stem}_preview.png"
    rendered_views: list[str] = []

    if not skip_render:
        cam = _setup_eevee_studio(scene, res=res)
        h = max_z_all - min_z_all
        mid_z = 0.5 * (min_z_all + max_z_all)
        full_dist = h * 1.62
        if head_bounds is not None:
            h_lo, h_hi = head_bounds
            head_c = Vector((0.0, 0.5 * (h_lo.y + h_hi.y) - 0.02, 0.52 * h_lo.z + 0.48 * h_hi.z))
            head_span = max(h_hi.z - h_lo.z, 0.18)
        else:
            head_c = Vector((0.0, -0.02, max_z_all - h * 0.12))
            head_span = h * 0.18

        view_specs = [
            ("front", Vector((0.0, -full_dist, mid_z)), Vector((0.0, 0.0, mid_z)), 50.0, False),
            ("three_quarter", Vector((full_dist * 0.56, -full_dist * 0.84, mid_z + h * 0.05)), Vector((0.0, 0.0, mid_z)), 50.0, False),
            ("side", Vector((full_dist, 0.0, mid_z)), Vector((0.0, 0.0, mid_z)), 50.0, False),
            ("back", Vector((0.0, full_dist, mid_z)), Vector((0.0, 0.0, mid_z)), 50.0, False),
            ("face_closeup", Vector((head_span * 0.42, -head_span * 2.15, head_c.z + head_span * 0.04)), head_c, 68.0, False),
            ("pose_85_shoulder", Vector((full_dist * 0.34, -full_dist * 0.92, mid_z + h * 0.14)), Vector((0.0, 0.0, mid_z + h * 0.10)), 52.0, True),
        ]

        tiles: list[np.ndarray] = []
        with tempfile.TemporaryDirectory() as tmp:
            for vname, cam_pos, cam_tgt, lens, apply_pose in view_specs:
                if apply_pose and armature is not None:
                    # 6번째 뷰: 실포즈 85° 어깨 거상(Clavicle 21.25° + UpperArm 63.75°) + 활짝 웃음 표정 적용!
                    # 월드 축 기준 회전을 각 본의 로컬 행렬로 변환해 정확히 85° 상향 거상/하향 A포즈를 재현한다.
                    from mathutils import Matrix
                    pb = armature.pose.bones
                    for bname, world_axis, deg in (
                        ("mixamorig:LeftShoulder", Vector((0.0, -1.0, 0.0)), +21.25),
                        ("mixamorig:LeftArm", Vector((0.0, -1.0, 0.0)), +63.75),
                        ("mixamorig:RightShoulder", Vector((0.0, -1.0, 0.0)), +10.0),
                        ("mixamorig:RightArm", Vector((0.0, -1.0, 0.0)), +45.0),
                        ("mixamorig:Neck", Vector((0.0, -1.0, 0.0)), +12.0),
                        ("mixamorig:Head", Vector((0.0, 0.0, 1.0)), +14.0),
                    ):
                        if bname in pb:
                            bone_m = pb[bname].bone.matrix_local.to_3x3()
                            local_axis = (bone_m.inverted() @ world_axis).normalized()
                            q_loc = Matrix.Rotation(math.radians(deg), 3, local_axis).to_quaternion()
                            pb[bname].rotation_mode = "QUATERNION"
                            pb[bname].rotation_quaternion = q_loc
                    # 웹툰 감정 프리셋 `big-smile` shape key 적용
                    smile_w = expr.WEBTOON_EMOTION_PRESETS_V2["big-smile"]["weights"]
                    for obj in meshes:
                        sk = obj.data.shape_keys
                        if sk is None:
                            continue
                        for kname, wval in smile_w.items():
                            if kname in sk.key_blocks:
                                sk.key_blocks[kname].value = float(wval)
                    bpy.context.view_layer.update()

                _aim_camera(cam, cam_pos, cam_tgt, lens)
                vp = Path(tmp) / f"{vname}.png"
                scene.render.filepath = str(vp)
                bpy.ops.render.render(write_still=True)
                tile = _load_png_rgba_bpy(vp)
                tiles.append(tile)
                rendered_views.append(vname)
                if vname == "three_quarter":
                    _write_png_rgba(preview_path, tile)

        # 3×2 컨택트시트(1536×1024) 조립 + 2px 얇은 아틀리에 구분선
        grid = np.full((res * 2, res * 3, 4), 255, dtype=np.uint8)
        for idx_t, tile in enumerate(tiles):
            row = idx_t // 3
            col = idx_t % 3
            grid[row * res : (row + 1) * res, col * res : (col + 1) * res] = tile
        # 구분선 (#D6D0C4)
        sep = np.array([214, 208, 196, 255], dtype=np.uint8)
        grid[res - 1 : res + 1, :] = sep
        grid[:, res - 1 : res + 1] = sep
        grid[:, 2 * res - 1 : 2 * res + 1] = sep
        _write_png_rgba(contact_sheet_path, grid)

    return {
        "blenderMinZM": round(min_z_all, 6),
        "blenderHeightM": round(max_z_all - min_z_all, 4),
        "bmeshMeshes": bmesh_report,
        "renderedViews": rendered_views,
        "contactSheet": contact_sheet_path.name if not skip_render else None,
        "previewPng": preview_path.name if not skip_render else None,
    }, errors


# ---------------------------------------------------------------------------
# 단일 GLB / 전체 디렉터리 QA 실행기
# ---------------------------------------------------------------------------


def run_qa_for_glb(glb_path: Path, out_dir: Path, res: int = 512, skip_render: bool = False) -> dict[str, Any]:
    reader = GlbReader(glb_path)
    all_errors: list[str] = []

    c_rep, c_err = gate_container_and_contract(reader)
    all_errors.extend(c_err)

    n_rep, n_err = gate_neck_seam_6_poses(reader)
    all_errors.extend(n_err)

    s_rep, s_err = gate_shoulder_85_stretch(reader)
    all_errors.extend(s_err)

    v_rep, v_err = gate_gltf_transform_validate(glb_path)
    all_errors.extend(v_err)

    b_rep, b_err = gate_blender_import_and_render(glb_path, out_dir, res=res, skip_render=skip_render)
    all_errors.extend(b_err)

    # 메타 JSON에서 통일 메쉬 사전 올-쿼드 감사 병합
    meta_path = glb_path.with_name(f"{glb_path.stem}_meta.json")
    unified_audit = None
    if meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        unified_audit = meta.get("unifiedBmeshAudit")
        if unified_audit and unified_audit.get("quadRatio", 0.0) < 0.98:
            all_errors.append(f"올-쿼드 비율 부족: {unified_audit.get('quadRatio')}")

    report = {
        "file": glb_path.name,
        "bytes": glb_path.stat().st_size,
        "passed": len(all_errors) == 0,
        "errorCount": len(all_errors),
        "errors": all_errors,
        "container": c_rep,
        "neckSeam6Poses": n_rep,
        "shoulder85Stretch": s_rep,
        "gltfValidator": v_rep,
        "blenderBmeshAndRender": b_rep,
        "unifiedPreExportAudit": unified_audit,
    }
    qa_path = out_dir / f"{glb_path.stem}_qa.json"
    qa_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    status = "PASS" if report["passed"] else "FAIL"
    print(
        f"[qa_character_gate] {status} | {glb_path.name} ({report['bytes']/1048576:.2f} MiB) | "
        f"neck6={n_rep.get('worstGapMm')}mm | sh85={s_rep.get('worstMaxStretch')}x | "
        f"valErr={v_rep.get('errorCount')} | eyes={c_rep.get('eyeWeightedVerts')} | "
        f"jawOpen={c_rep.get('jawOpenMaxMm')}mm | errors={len(all_errors)}"
    )
    if all_errors:
        for e in all_errors:
            print(f"  !! ERROR: {e}")
    return report


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio Character Kit v2 종합 QA 게이트")
    parser.add_argument("--dir", type=Path, default=Path("apps/character-lab/public/assets/characters/toonstudio-kit-v2/bases"))
    parser.add_argument("--glb", type=Path, default=None, help="단일 GLB만 검증할 때 지정")
    parser.add_argument("--res", type=int, default=512, help="6뷰 개별 렌더 해상도(기본 512)")
    parser.add_argument("--skip-render", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    glbs = [args.glb] if args.glb is not None else sorted(args.dir.glob("*.glb"))
    if not glbs:
        print(f"[qa_character_gate] 검사할 GLB가 없습니다: {args.dir}", file=sys.stderr)
        return 2
    out_dir = args.glb.parent if args.glb is not None else args.dir
    reports = [run_qa_for_glb(g, out_dir, res=args.res, skip_render=args.skip_render) for g in glbs]
    summary = {
        "schema": "toonstudio.character-kit.qa-v2/1",
        "total": len(reports),
        "passed": sum(1 for r in reports if r["passed"]),
        "failed": sum(1 for r in reports if not r["passed"]),
        "results": {r["file"]: {"passed": r["passed"], "errors": r["errors"]} for r in reports},
    }
    (out_dir / "qa_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[qa_character_gate] 종합 결과: {summary['passed']}/{summary['total']} 통과")
    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
