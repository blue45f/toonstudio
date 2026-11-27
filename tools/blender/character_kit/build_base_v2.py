"""ToonStudio Character Kit v2 — 5종 웹툰 아키타입 베이스 생성기 (Blender 5.3 헤드리스).

5종 아키타입:
- `female-romance`: 7.8 등신, 1.65 m (로맨스 · 학원 · 로판 주연)
- `male-webtoon`:   8.6 등신, 1.82 m (현대 · 로판 북부대공 · 학원 남주)
- `male-action`:    8.4 등신, 1.86 m (액션 · 헌터 · 무협 근육형)
- `youth-academy`:  7.0 등신, 1.56 m (소년만화 · 일상 · 중학생)
- `sd-chibi`:       3.1 등신, 1.05 m (코미디 · 개그 컷 · 이모티콘)

핵심 불변 규격:
- 100% 올-쿼드 통일 바디+헤드 토폴로지(원주 >= 16 세그먼트, SUBSURF Lv1 후 36~64 세그먼트),
  bmesh 0-결함(`true_nonmanifold == 0, loose_verts == 0, wire_edges == 0, zero_area == 0`),
  미터 스케일(`1.0 = 1m`), 발바닥 접지(`Z = 0` Blender / `Y = 0` glTF).
- 68본 스켈레톤(`mixamorig:*` 65 + `TS_Jaw` + `TS_Eye.L/R`), T-포즈 레스트.
- 어깨 85° 혹 돌출 제거: 해부학적 견관절 피벗 + 3단계 웨이트 확산(`Spine2` → `Clavicle 0.25` → `UpperArm 0.75`)
  + 85° 거상 ROI 최대 간선 신장률 `<= 1.85`.
- 목 이음매 `0.00 mm`: `TS_Body`/`TS_Head` 경계 64쌍 정점 좌표·법선·웨이트·체형 morph 비트 일치.
- 입체 6층 눈 구조(안와 + 공막 + 오목 홍채 + 캐치라이트 + 입체 속눈썹 + 0.7mm BVH 스냅 눈썹),
  `TS_Eye.L/R` 각 `>= 200` verts, 타원체 프록시 커스텀 안면 법선(`0.85` 블렌드).
- 정확히 5개 재질 슬롯(`ts_skin_body`, `ts_skin_head`, `ts_eye_sclera`, `ts_mouth_inner`, `ts_lashes_brows`),
  계약 64 morph(`KHR_mesh_quantization` 단독 + raw SHORT min/max 바운드).

실행:
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/build_base_v2.py -- \
        --archetype all --out-dir data/character-studio-assets/characters/toonstudio-kit-v2/bases
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

_THIS_DIR = Path(__file__).resolve().parent
_BLENDER_TOOLS_DIR = _THIS_DIR.parent
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from character_kit import build_expressions_v2 as expr  # noqa: E402
from character_kit import glbwriter, skin, uvtools  # noqa: E402
from character_kit.surface import vertex_normals  # noqa: E402

# ---------------------------------------------------------------------------
# 계약 68본 스켈레톤 및 16개 영역 (packages/studio-project-model/src/character-kit/contracts/kit-skeleton.ts 1:1)
# ---------------------------------------------------------------------------

MIXAMO = "mixamorig:"
FINGERS = ("Thumb", "Index", "Middle", "Ring", "Pinky")

KIT_REGION_IDS: tuple[str, ...] = (
    "head",
    "neck",
    "torso",
    "pelvis",
    "upperArm.L",
    "upperArm.R",
    "forearm.L",
    "forearm.R",
    "hand.L",
    "hand.R",
    "thigh.L",
    "thigh.R",
    "calf.L",
    "calf.R",
    "foot.L",
    "foot.R",
)
KIT_HIDEABLE_REGION_IDS: tuple[str, ...] = KIT_REGION_IDS[1:]
REGION_INDEX: dict[str, int] = {name: i for i, name in enumerate(KIT_REGION_IDS)}

# 얼굴/바디 세부 태그(서브서프 후에도 면 속도로 유지)
TAG_BODY = 0
TAG_HEAD_SKIN = 1
TAG_EYE_SOCKET_L = 2
TAG_EYE_SOCKET_R = 3
TAG_LIP = 4
TAG_ORAL_CAVITY = 5
TAG_EAR_L = 6
TAG_EAR_R = 7


def build_contract_skeleton_spec() -> tuple[list[str], dict[str, str | None]]:
    """계약 68 joint 이름 목록과 부모 매핑(kit-skeleton.ts와 순서·이름 100% 일치)."""
    joints: list[str] = []
    parents: dict[str, str | None] = {}

    def add(name: str, parent: str | None) -> None:
        joints.append(name)
        parents[name] = parent

    m = lambda s: f"{MIXAMO}{s}"
    add(m("Hips"), None)
    add(m("Spine"), m("Hips"))
    add(m("Spine1"), m("Spine"))
    add(m("Spine2"), m("Spine1"))
    add(m("Neck"), m("Spine2"))
    add(m("Head"), m("Neck"))
    add(m("HeadTop_End"), m("Head"))
    for side in ("Left", "Right"):
        add(m(f"{side}Shoulder"), m("Spine2"))
        add(m(f"{side}Arm"), m(f"{side}Shoulder"))
        add(m(f"{side}ForeArm"), m(f"{side}Arm"))
        add(m(f"{side}Hand"), m(f"{side}ForeArm"))
        for finger in FINGERS:
            for seg in range(1, 5):
                parent = m(f"{side}Hand") if seg == 1 else m(f"{side}Hand{finger}{seg - 1}")
                add(m(f"{side}Hand{finger}{seg}"), parent)
        add(m(f"{side}UpLeg"), m("Hips"))
        add(m(f"{side}Leg"), m(f"{side}UpLeg"))
        add(m(f"{side}Foot"), m(f"{side}Leg"))
        add(m(f"{side}ToeBase"), m(f"{side}Foot"))
        add(m(f"{side}Toe_End"), m(f"{side}ToeBase"))
    add("TS_Jaw", m("Head"))
    add("TS_Eye.L", m("Head"))
    add("TS_Eye.R", m("Head"))
    assert len(joints) == 68
    return joints, parents


SKELETON_JOINTS, SKELETON_PARENTS = build_contract_skeleton_spec()
JOINT_INDEX: dict[str, int] = {n: i for i, n in enumerate(SKELETON_JOINTS)}

# ---------------------------------------------------------------------------
# 5종 아키타입 명세
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ArchetypeSpec:
    archetype_id: str
    label_ko: str
    genre: str
    target_heads: float
    height_m: float
    # 두상·안면 파라미터
    head_w: float  # 두상 반폭(x)
    head_d: float  # 두상 반깊이(y)
    eye_line_frac: float  # 정수리에서 눈선 비율(0.50~0.58)
    eye_spacing_frac: float  # head_w 대비 눈 중심 x 비율
    eye_radius_frac: float  # head_h 대비 안구 반지름 비율
    eye_open_h_frac: float  # head_h 대비 눈 개구 높이 비율
    eye_open_w_frac: float  # head_h 대비 눈 개구 폭 비율
    iris_ratio: float  # 안구 반지름 대비 홍채 반지름 비율
    jaw_taper: float  # 0.0(각진)~1.0(갸름한 V라인)
    cheek_round: float  # 볼 볼륨(SD/유스 높음)
    nose_protrude: float  # 코 돌출량(m)
    nose_width: float  # 코 폭(m)
    mouth_half_w: float  # 입 반폭(m)
    lash_wing: float  # 속눈썹/아이라인 볼륨 배율
    brow_thick: float  # 눈썹 두께(m)
    brow_arch: float  # 눈썹 아치 높이(m)
    # 목·몸통·사지 치수(m)
    neck_rx: float
    neck_ry: float
    neck_free_h: float  # 턱끝~목 이음매 자유 목 기둥 길이
    shoulder_half_w: float  # 견관절 피벗 x
    chest_rx: float
    chest_ry: float
    bust_lift: float  # 여성 가슴 볼륨(m)
    pec_relief: float  # 남성 흉근/액션 근육 면분할 강도
    trap_slope: float  # 승모근 경사 보강
    waist_rx: float
    waist_ry: float
    hip_rx: float
    hip_ry: float
    crotch_frac: float  # 신장 대비 가랑이 높이 비율
    arm_len_frac: float  # 견관절→손목 길이(신장 대비)
    arm_r: float  # 상완 평균 반지름
    forearm_r: float
    wrist_r: float
    hand_len: float
    hand_w: float
    thigh_r: float
    knee_r: float
    calf_r: float
    ankle_r: float
    foot_len: float
    foot_w: float
    # 토폴로지 밀도(SD는 18~24k tris, 표준은 36~50k tris)
    torso_rings_extra: int
    limb_rings_scale: float
    # 화풍 텍스처 팔레트(recolor 호환 고휘도 피부 + 아키타입 보석 홍채)
    skin_hex: str
    blush_hex: str
    lip_hex: str
    iris_upper_hex: str
    iris_lower_hex: str
    has_bandeau: bool


ARCHETYPES: dict[str, ArchetypeSpec] = {
    "female-romance": ArchetypeSpec(
        archetype_id="female-romance",
        label_ko="로맨스 여성 주연 (7.8등신)",
        genre="romance/rofan/academy",
        target_heads=7.8,
        height_m=1.65,
        head_w=0.075,
        head_d=0.084,
        eye_line_frac=0.54,
        eye_spacing_frac=0.45,
        eye_radius_frac=0.064,
        eye_open_h_frac=0.078,
        eye_open_w_frac=0.220,
        iris_ratio=0.58,
        jaw_taper=0.78,
        cheek_round=0.35,
        nose_protrude=0.0155,
        nose_width=0.0115,
        mouth_half_w=0.0195,
        lash_wing=1.18,
        brow_thick=0.0036,
        brow_arch=0.0042,
        neck_rx=0.045,
        neck_ry=0.044,
        neck_free_h=0.068,
        shoulder_half_w=0.156,
        chest_rx=0.138,
        chest_ry=0.098,
        bust_lift=0.026,
        pec_relief=0.0,
        trap_slope=0.18,
        waist_rx=0.106,
        waist_ry=0.078,
        hip_rx=0.164,
        hip_ry=0.110,
        crotch_frac=0.494,
        arm_len_frac=0.312,
        arm_r=0.039,
        forearm_r=0.032,
        wrist_r=0.024,
        hand_len=0.155,
        hand_w=0.036,
        thigh_r=0.072,
        knee_r=0.047,
        calf_r=0.049,
        ankle_r=0.031,
        foot_len=0.215,
        foot_w=0.042,
        torso_rings_extra=2,
        limb_rings_scale=1.0,
        skin_hex="#F7E4D8",
        blush_hex="#F4A3AC",
        lip_hex="#E58191",
        iris_upper_hex="#2F2659",
        iris_lower_hex="#8E7CE6",
        has_bandeau=True,
    ),
    "male-webtoon": ArchetypeSpec(
        archetype_id="male-webtoon",
        label_ko="웹툰 미남 주연 (8.6등신)",
        genre="modern/rofan-duke/academy",
        target_heads=8.6,
        height_m=1.82,
        head_w=0.079,
        head_d=0.089,
        eye_line_frac=0.51,
        eye_spacing_frac=0.44,
        eye_radius_frac=0.059,
        eye_open_h_frac=0.062,
        eye_open_w_frac=0.205,
        iris_ratio=0.52,
        jaw_taper=0.56,
        cheek_round=0.18,
        nose_protrude=0.0185,
        nose_width=0.0135,
        mouth_half_w=0.0220,
        lash_wing=0.72,
        brow_thick=0.0052,
        brow_arch=0.0022,
        neck_rx=0.057,
        neck_ry=0.055,
        neck_free_h=0.078,
        shoulder_half_w=0.198,
        chest_rx=0.172,
        chest_ry=0.114,
        bust_lift=0.0,
        pec_relief=0.45,
        trap_slope=0.40,
        waist_rx=0.132,
        waist_ry=0.095,
        hip_rx=0.160,
        hip_ry=0.108,
        crotch_frac=0.495,
        arm_len_frac=0.318,
        arm_r=0.048,
        forearm_r=0.040,
        wrist_r=0.029,
        hand_len=0.175,
        hand_w=0.042,
        thigh_r=0.081,
        knee_r=0.054,
        calf_r=0.056,
        ankle_r=0.036,
        foot_len=0.245,
        foot_w=0.047,
        torso_rings_extra=3,
        limb_rings_scale=1.08,
        skin_hex="#F4DFD0",
        blush_hex="#E6A69B",
        lip_hex="#D68786",
        iris_upper_hex="#1D324D",
        iris_lower_hex="#68A3D9",
        has_bandeau=False,
    ),
    "male-action": ArchetypeSpec(
        archetype_id="male-action",
        label_ko="액션 근육형 남성 (8.4등신)",
        genre="action/hunter/murim",
        target_heads=8.4,
        height_m=1.86,
        head_w=0.083,
        head_d=0.092,
        eye_line_frac=0.50,
        eye_spacing_frac=0.44,
        eye_radius_frac=0.057,
        eye_open_h_frac=0.058,
        eye_open_w_frac=0.198,
        iris_ratio=0.50,
        jaw_taper=0.42,
        cheek_round=0.12,
        nose_protrude=0.0195,
        nose_width=0.0145,
        mouth_half_w=0.0235,
        lash_wing=0.68,
        brow_thick=0.0062,
        brow_arch=0.0018,
        neck_rx=0.062,
        neck_ry=0.060,
        neck_free_h=0.076,
        shoulder_half_w=0.214,
        chest_rx=0.190,
        chest_ry=0.128,
        bust_lift=0.0,
        pec_relief=1.00,
        trap_slope=0.72,
        waist_rx=0.142,
        waist_ry=0.104,
        hip_rx=0.170,
        hip_ry=0.116,
        crotch_frac=0.490,
        arm_len_frac=0.316,
        arm_r=0.058,
        forearm_r=0.047,
        wrist_r=0.032,
        hand_len=0.182,
        hand_w=0.045,
        thigh_r=0.092,
        knee_r=0.058,
        calf_r=0.064,
        ankle_r=0.038,
        foot_len=0.255,
        foot_w=0.050,
        torso_rings_extra=4,
        limb_rings_scale=1.15,
        skin_hex="#F0D8C5",
        blush_hex="#DDA090",
        lip_hex="#CC817E",
        iris_upper_hex="#472814",
        iris_lower_hex="#D99838",
        has_bandeau=False,
    ),
    "youth-academy": ArchetypeSpec(
        archetype_id="youth-academy",
        label_ko="학원 유스 (7.0등신)",
        genre="shonen/daily/academy",
        target_heads=7.0,
        height_m=1.56,
        head_w=0.080,
        head_d=0.088,
        eye_line_frac=0.55,
        eye_spacing_frac=0.46,
        eye_radius_frac=0.068,
        eye_open_h_frac=0.088,
        eye_open_w_frac=0.238,
        iris_ratio=0.61,
        jaw_taper=0.72,
        cheek_round=0.55,
        nose_protrude=0.0135,
        nose_width=0.0110,
        mouth_half_w=0.0185,
        lash_wing=1.02,
        brow_thick=0.0040,
        brow_arch=0.0038,
        neck_rx=0.043,
        neck_ry=0.042,
        neck_free_h=0.062,
        shoulder_half_w=0.144,
        chest_rx=0.126,
        chest_ry=0.088,
        bust_lift=0.010,
        pec_relief=0.0,
        trap_slope=0.14,
        waist_rx=0.104,
        waist_ry=0.078,
        hip_rx=0.140,
        hip_ry=0.096,
        crotch_frac=0.482,
        arm_len_frac=0.308,
        arm_r=0.036,
        forearm_r=0.030,
        wrist_r=0.023,
        hand_len=0.145,
        hand_w=0.034,
        thigh_r=0.066,
        knee_r=0.044,
        calf_r=0.045,
        ankle_r=0.030,
        foot_len=0.205,
        foot_w=0.040,
        torso_rings_extra=1,
        limb_rings_scale=0.95,
        skin_hex="#F8E5D9",
        blush_hex="#F4A3AA",
        lip_hex="#E68894",
        iris_upper_hex="#1E4738",
        iris_lower_hex="#73CC9C",
        has_bandeau=True,
    ),
    "sd-chibi": ArchetypeSpec(
        archetype_id="sd-chibi",
        label_ko="SD 치비 (3.1등신)",
        genre="comedy/gag/emoticon",
        target_heads=3.1,
        height_m=1.05,
        head_w=0.142,
        head_d=0.146,
        eye_line_frac=0.58,
        eye_spacing_frac=0.47,
        eye_radius_frac=0.088,
        eye_open_h_frac=0.125,
        eye_open_w_frac=0.315,
        iris_ratio=0.68,
        jaw_taper=0.55,
        cheek_round=0.95,
        nose_protrude=0.0105,
        nose_width=0.0110,
        mouth_half_w=0.0240,
        lash_wing=1.30,
        brow_thick=0.0062,
        brow_arch=0.0060,
        neck_rx=0.048,
        neck_ry=0.046,
        neck_free_h=0.042,
        shoulder_half_w=0.114,
        chest_rx=0.104,
        chest_ry=0.082,
        bust_lift=0.004,
        pec_relief=0.0,
        trap_slope=0.10,
        waist_rx=0.094,
        waist_ry=0.076,
        hip_rx=0.116,
        hip_ry=0.092,
        crotch_frac=0.340,
        arm_len_frac=0.205,
        arm_r=0.036,
        forearm_r=0.031,
        wrist_r=0.025,
        hand_len=0.098,
        hand_w=0.032,
        thigh_r=0.056,
        knee_r=0.042,
        calf_r=0.043,
        ankle_r=0.031,
        foot_len=0.138,
        foot_w=0.039,
        torso_rings_extra=-3,
        limb_rings_scale=0.55,
        skin_hex="#F9E7DC",
        blush_hex="#F89AA7",
        lip_hex="#EB8696",
        iris_upper_hex="#47214C",
        iris_lower_hex="#E080C0",
        has_bandeau=True,
    ),
}


# ---------------------------------------------------------------------------
# 공통 수학·좌표 변환 (Blender +Z up, -Y fwd, +X left ↔ glTF +Y up, +Z fwd, +X left)
# ---------------------------------------------------------------------------


def b2g(p: np.ndarray) -> np.ndarray:
    """Blender (x, y, z) → glTF (x, z, -y). 오른손 좌표계·감김 유지."""
    arr = np.asarray(p, dtype=np.float64)
    if arr.ndim == 1:
        return np.array([arr[0], arr[2], -arr[1]], dtype=np.float64)
    return np.stack([arr[:, 0], arr[:, 2], -arr[:, 1]], axis=-1)


def _clamp01(x: float) -> float:
    return 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)


def _sstep(e0: float, e1: float, x: float) -> float:
    if abs(e1 - e0) < 1e-12:
        return 1.0 if x >= e1 else 0.0
    t = _clamp01((x - e0) / (e1 - e0))
    return t * t * (3.0 - 2.0 * t)


def _hex_rgb(h: str) -> tuple[float, float, float]:
    s = h.lstrip("#")
    return (int(s[0:2], 16) / 255.0, int(s[2:4], 16) / 255.0, int(s[4:6], 16) / 255.0)


def _lerp_rgb(a: tuple[float, float, float], b: tuple[float, float, float], t: float) -> tuple[float, float, float]:
    t = _clamp01(t)
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


# ---------------------------------------------------------------------------
# 아키타입별 해부학 랜드마크 및 68본 스켈레톤 계산 (Blender 좌표계 Z-up, -Y fwd)
# ---------------------------------------------------------------------------


@dataclass
class ArchetypePlan:
    spec: ArchetypeSpec
    head_h: float
    z_crown: float
    z_chin: float
    z_eye: float
    z_nose: float
    z_mouth: float
    z_brow: float
    z_neck_cut: float
    z_neck_base: float
    z_shoulder: float
    z_chest: float
    z_waist: float
    z_hips: float
    z_crotch: float
    z_knee: float
    z_ankle: float
    eye_center_l: np.ndarray  # Blender coords
    eye_center_r: np.ndarray
    eye_radius: float
    eye_open_h: float
    eye_open_w: float
    nose_tip: np.ndarray
    mouth_center: np.ndarray
    chin_pt: np.ndarray
    jaw_pivot: np.ndarray
    jaw_corner_l: np.ndarray
    ear_l: np.ndarray
    forehead_pt: np.ndarray
    joints_b: dict[str, np.ndarray]  # 68 joints in Blender coords


def compute_archetype_plan(spec: ArchetypeSpec) -> ArchetypePlan:
    h = spec.height_m
    head_h = h / spec.target_heads
    z_crown = h
    z_chin = z_crown - head_h
    z_eye = z_crown - spec.eye_line_frac * head_h
    z_nose = z_eye - 0.165 * head_h
    z_mouth = z_eye - 0.285 * head_h
    z_brow = z_eye + (0.095 if spec.archetype_id != "sd-chibi" else 0.105) * head_h

    z_neck_cut = z_chin - spec.neck_free_h * 0.52
    z_neck_base = z_chin - spec.neck_free_h

    z_crotch = h * spec.crotch_frac
    z_hips = z_crotch + (z_neck_base - z_crotch) * 0.16
    z_waist = z_crotch + (z_neck_base - z_crotch) * 0.44
    # 해부학적 견관절 피벗: 쇄골/승모근 아래 상완골두 정중앙 (arm_r 비례로 z_deltoid_top < z_neck_base 항상 보장)
    sh_drop = max(0.038, spec.arm_r * (1.28 if spec.archetype_id != "sd-chibi" else 1.18))
    z_shoulder = z_neck_base - sh_drop
    z_chest = min(z_crotch + (z_neck_base - z_crotch) * 0.72, z_shoulder - max(0.024, spec.arm_r * 0.55))

    z_ankle = max(0.048, h * 0.044)
    z_knee = z_ankle + (z_crotch - z_ankle) * 0.515

    # 두상 앞면 중심 및 눈·코·입 위치 (Blender -Y가 정면)
    y_head_c = 0.008  # 머리 중심이 목 중심보다 살짝 뒤(+Y)로 안정된 자세
    y_face_front = y_head_c - spec.head_d

    eye_x = spec.head_w * spec.eye_spacing_frac
    eye_r = head_h * spec.eye_radius_frac
    eye_open_h = head_h * spec.eye_open_h_frac
    eye_open_w = head_h * spec.eye_open_w_frac
    # 안구 중심: 얼굴 전면 곡면보다 약간 안쪽(+Y)에 안착
    eye_y_surf = y_head_c - spec.head_d * math.sqrt(max(0.2, 1.0 - (eye_x / max(spec.head_w, 1e-4)) ** 2))
    eye_center_l = np.array([+eye_x, eye_y_surf + eye_r * 0.42, z_eye], dtype=np.float64)
    eye_center_r = np.array([-eye_x, eye_y_surf + eye_r * 0.42, z_eye], dtype=np.float64)

    nose_tip = np.array([0.0, y_face_front - spec.nose_protrude, z_nose], dtype=np.float64)
    mouth_center = np.array([0.0, y_face_front + 0.006, z_mouth], dtype=np.float64)
    chin_pt = np.array([0.0, y_face_front + 0.018, z_chin], dtype=np.float64)
    jaw_pivot = np.array([0.0, y_head_c - spec.head_d * 0.14, z_mouth + 0.022 * (head_h / 0.21)], dtype=np.float64)
    jaw_corner_l = np.array([spec.head_w * 0.72, y_head_c - spec.head_d * 0.15, z_chin + head_h * 0.20], dtype=np.float64)
    ear_l = np.array([spec.head_w * 1.06, y_head_c + spec.head_d * 0.06, z_eye - head_h * 0.06], dtype=np.float64)
    forehead_pt = np.array([0.0, y_face_front + 0.008, z_eye + head_h * 0.22], dtype=np.float64)

    # 68본 스켈레톤 좌표 (Blender Z-up, -Y fwd, +X left)
    j: dict[str, np.ndarray] = {}
    m = lambda s: f"{MIXAMO}{s}"
    j[m("Hips")] = np.array([0.0, 0.004, z_hips])
    j[m("Spine")] = np.array([0.0, 0.008, z_hips + (z_waist - z_hips) * 0.65])
    j[m("Spine1")] = np.array([0.0, 0.012, z_waist + (z_chest - z_waist) * 0.62])
    j[m("Spine2")] = np.array([0.0, 0.012, z_chest + (z_neck_base - z_chest) * 0.55])
    j[m("Neck")] = np.array([0.0, 0.006, z_neck_base + (z_neck_cut - z_neck_base) * 0.55])
    j[m("Head")] = np.array([0.0, y_head_c, z_chin + head_h * 0.18])
    j[m("HeadTop_End")] = np.array([0.0, y_head_c, z_crown])
    j["TS_Jaw"] = jaw_pivot.copy()
    j["TS_Eye.L"] = eye_center_l.copy()
    j["TS_Eye.R"] = eye_center_r.copy()

    arm_total = h * spec.arm_len_frac
    upper_len = arm_total * 0.52
    fore_len = arm_total * 0.48
    hip_x = spec.hip_rx * 0.50

    for side_sign, label in ((1.0, "Left"), (-1.0, "Right")):
        # 쇄골 피벗(Clavicle) → 해부학 견관절(Arm) → 팔꿈치(ForeArm) → 손목(Hand)
        x_clav = side_sign * (spec.neck_rx * 0.85)
        x_arm = side_sign * spec.shoulder_half_w
        x_elbow = x_arm + side_sign * upper_len
        x_hand = x_elbow + side_sign * fore_len
        j[m(f"{label}Shoulder")] = np.array([x_clav, 0.006, z_shoulder + 0.012])
        j[m(f"{label}Arm")] = np.array([x_arm, 0.008, z_shoulder])
        j[m(f"{label}ForeArm")] = np.array([x_elbow, 0.014, z_shoulder])
        j[m(f"{label}Hand")] = np.array([x_hand, 0.008, z_shoulder])

        # 손가락 5개 × 4마디 (손바닥 아래 -Z, 엄지 앞 -Y)
        hl = spec.hand_len
        hw = spec.hand_w
        # Thumb
        t0 = np.array([x_hand + side_sign * hl * 0.18, 0.008 - hw * 0.78, z_shoulder - 0.008])
        t_dir = np.array([side_sign * 0.76, -0.62, -0.18])
        t_dir /= np.linalg.norm(t_dir)
        t_lens = (hl * 0.19, hl * 0.16, hl * 0.13)
        cur = t0.copy()
        j[m(f"{label}HandThumb1")] = cur.copy()
        for seg, sl in enumerate(t_lens, start=2):
            cur = cur + t_dir * sl
            j[m(f"{label}HandThumb{seg}")] = cur.copy()

        # Index, Middle, Ring, Pinky
        f_specs = (
            ("Index", -hw * 0.74, 0.50, (0.21, 0.14, 0.11)),
            ("Middle", -hw * 0.24, 0.52, (0.23, 0.15, 0.12)),
            ("Ring", +hw * 0.26, 0.50, (0.21, 0.14, 0.11)),
            ("Pinky", +hw * 0.74, 0.46, (0.17, 0.11, 0.09)),
        )
        for fname, y_off, base_f, seg_f in f_specs:
            cur = np.array([x_hand + side_sign * hl * base_f, 0.008 + y_off, z_shoulder - 0.002])
            j[m(f"{label}Hand{fname}1")] = cur.copy()
            for seg, sf in enumerate(seg_f, start=2):
                cur = cur + np.array([side_sign * hl * sf, 0.0, -0.001])
                j[m(f"{label}Hand{fname}{seg}")] = cur.copy()

        # 다리·발 체인
        j[m(f"{label}UpLeg")] = np.array([side_sign * hip_x, 0.004, z_crotch + 0.030])
        j[m(f"{label}Leg")] = np.array([side_sign * (hip_x * 0.94), 0.002, z_knee])
        j[m(f"{label}Foot")] = np.array([side_sign * (hip_x * 0.90), 0.012, z_ankle])
        j[m(f"{label}ToeBase")] = np.array([side_sign * (hip_x * 0.90), -spec.foot_len * 0.54, z_ankle * 0.34])
        j[m(f"{label}Toe_End")] = np.array([side_sign * (hip_x * 0.90), -spec.foot_len * 0.84, z_ankle * 0.22])

    return ArchetypePlan(
        spec=spec,
        head_h=head_h,
        z_crown=z_crown,
        z_chin=z_chin,
        z_eye=z_eye,
        z_nose=z_nose,
        z_mouth=z_mouth,
        z_brow=z_brow,
        z_neck_cut=z_neck_cut,
        z_neck_base=z_neck_base,
        z_shoulder=z_shoulder,
        z_chest=z_chest,
        z_waist=z_waist,
        z_hips=z_hips,
        z_crotch=z_crotch,
        z_knee=z_knee,
        z_ankle=z_ankle,
        eye_center_l=eye_center_l,
        eye_center_r=eye_center_r,
        eye_radius=eye_r,
        eye_open_h=eye_open_h,
        eye_open_w=eye_open_w,
        nose_tip=nose_tip,
        mouth_center=mouth_center,
        chin_pt=chin_pt,
        jaw_pivot=jaw_pivot,
        jaw_corner_l=jaw_corner_l,
        ear_l=ear_l,
        forehead_pt=forehead_pt,
        joints_b=j,
    )


# ---------------------------------------------------------------------------
# 100% 올-쿼드 통일 바디+헤드 메쉬 조형 (Blender bmesh + SUBSURF Lv1)
# ---------------------------------------------------------------------------


def _eval_torso_profile(plan: ArchetypePlan, z: float, theta: float) -> tuple[float, float]:
    """높이 z, 방위각 theta(0=전면 -Y, pi/2=+X 좌측, pi=후면 +Y)에서 해부학 몸통 (x, y)."""
    s = plan.spec
    ct = math.cos(theta)  # +1 전면, -1 후면
    st = math.sin(theta)  # +1 좌측, -1 우측
    front = max(0.0, ct)
    back = max(0.0, -ct)
    side = abs(st)

    # 구간별 기본 반폭/반깊이 보간 (어깨→승모근→목 기둥 매끄러운 연결 + 85° 거상 신장률 안정)
    stops = [
        (plan.z_crotch, s.hip_rx * 0.94, s.hip_ry * 0.92, 0.008),
        (plan.z_hips, s.hip_rx, s.hip_ry, 0.010),
        (plan.z_waist, s.waist_rx, s.waist_ry, 0.012),
        (plan.z_chest, s.chest_rx, s.chest_ry, 0.010),
        (plan.z_shoulder, s.shoulder_half_w * 0.96, s.chest_ry * 0.85, 0.010),
        (plan.z_neck_base, s.neck_rx * 1.18, s.neck_ry * 1.12, 0.005),
        (plan.z_neck_cut, s.neck_rx, s.neck_ry, 0.004),
    ]
    zs = [p[0] for p in stops]
    rxs = [p[1] for p in stops]
    rys = [p[2] for p in stops]
    ycs = [p[3] for p in stops]
    rx = float(np.interp(z, zs, rxs))
    ry = float(np.interp(z, zs, rys))
    yc = float(np.interp(z, zs, ycs))

    # 부드러운 superellipse(인체 흉곽/골반의 편평한 전면·후면)
    is_neck = _sstep(plan.z_shoulder + 0.015, plan.z_neck_cut, z)
    pwr = 0.88 * (1.0 - is_neck) + 1.0 * is_neck
    sx = math.copysign(abs(st) ** pwr, st)
    sy = -math.copysign(abs(ct) ** pwr, ct)
    x = rx * sx
    y = yc + ry * sy

    # 해부학 조형 디테일
    # 1) 둔부(글루트) 곡선
    glute_z = math.exp(-(((z - (plan.z_crotch + (plan.z_hips - plan.z_crotch) * 0.58)) / max(0.035, 0.45 * (plan.z_waist - plan.z_crotch))) ** 2))
    glute_lobe = math.exp(-(((abs(st) - 0.42) / 0.34) ** 2))
    y += back * glute_z * glute_lobe * (s.hip_ry * 0.24)
    # 척추 홈(등 중앙)
    spine_z = _sstep(plan.z_hips, plan.z_waist, z) * (1.0 - _sstep(plan.z_shoulder, plan.z_neck_base, z))
    spine_groove = math.exp(-((st / 0.14) ** 2))
    y -= back * spine_z * spine_groove * (0.008 + 0.005 * s.pec_relief)

    # 2) 여성 바스트 / 남성 대흉근·광배근
    if s.bust_lift > 0.0:
        bust_z = math.exp(-(((z - (plan.z_chest - 0.012)) / max(0.032, 0.28 * (plan.z_neck_base - plan.z_waist))) ** 2))
        bust_x = math.exp(-(((abs(st) - 0.44) / 0.28) ** 2))
        y -= front * bust_z * bust_x * s.bust_lift * 1.45
        # 흉골 사이 얕은 계곡
        cleavage = math.exp(-((st / 0.12) ** 2))
        y += front * bust_z * cleavage * (s.bust_lift * 0.30)

    if s.pec_relief > 0.0:
        pec_z = math.exp(-(((z - (plan.z_chest + 0.008)) / 0.048) ** 2))
        pec_x = math.exp(-(((abs(st) - 0.48) / 0.34) ** 2))
        y -= front * pec_z * pec_x * (0.017 * s.pec_relief)
        # 광배근 V테이퍼
        lat_z = math.exp(-(((z - (plan.z_chest - 0.03)) / 0.085) ** 2))
        x += math.copysign(side * lat_z * (0.014 * s.pec_relief), st)
        # 복근 완만한 면 분할
        ab_z = math.exp(-(((z - (plan.z_waist + 0.03)) / 0.070) ** 2))
        ab_x = math.exp(-(((abs(st) - 0.22) / 0.22) ** 2))
        y -= front * ab_z * ab_x * (0.007 * s.pec_relief)

    # 3) 쇄골·승모근 윗선(어깨 혹 없이 부드러운 해부학 사선)
    clav_z = math.exp(-(((z - (plan.z_neck_base - 0.008)) / 0.022) ** 2))
    y -= front * clav_z * (0.004 * (1.0 - abs(st) * 0.5))
    trap_z = _sstep(plan.z_shoulder, plan.z_neck_base + 0.01, z) * (1.0 - _sstep(plan.z_neck_base + 0.01, plan.z_neck_cut, z))
    y += back * trap_z * side * (0.010 * s.trap_slope)

    return x, y


def _eval_cranium_surface(plan: ArchetypePlan, sv: float, theta: float) -> tuple[float, float, float]:
    """메인 얼굴·두개골 곡면(sv in [0, 1]: 0=턱끝/후두하선, 1=정수리 캡 테두리)."""
    s = plan.spec
    ct = math.cos(theta)  # +1 앞(-Y), -1 뒤(+Y)
    st = math.sin(theta)  # +1 좌(+X), -1 우(-X)
    back = max(0.0, -ct)
    y_hc = 0.008

    # 구면 위도각: -0.46*pi(턱끝) → +0.34*pi(정수리 8x8 캡 테두리 — 둥글고 풍성한 두개골!)
    phi = -0.46 * math.pi + sv * (0.80 * math.pi)
    z_mid = plan.z_chin + plan.head_h * 0.515
    half_h = plan.head_h * 0.485
    z = z_mid + half_h * math.sin(phi)
    if sv < 0.08:
        z = plan.z_chin + (z - plan.z_chin) * _sstep(0.0, 0.08, sv)
    # 후두부는 목 뒤에서 자연스럽게 살짝 올라가며 두개골로 연결
    z += back * (plan.head_h * 0.045) * (1.0 - _sstep(0.0, 0.35, sv))

    zn = (z - z_mid) / max(half_h, 1e-4)
    if zn >= 0.0:
        dome = math.sqrt(max(0.22, 1.0 - (min(0.95, zn) ** 1.90)))
        parietal = 1.0 + 0.10 * math.sin(math.pi * _clamp01(zn / 0.85))
    else:
        dome = math.sqrt(max(0.16, 1.0 - (min(0.95, abs(zn)) ** 1.65)))
        parietal = 1.0

    # 턱 V-라인 테이퍼(한국 웹툰 갸름한 턱선)
    lower_t = 1.0 - _sstep(0.0, 0.44, sv)
    v_narrow = 1.0 - (0.30 * s.jaw_taper + 0.08) * (lower_t ** 1.35)
    jaw_angle_zone = math.exp(-(((sv - 0.22) / 0.12) ** 2)) * (1.0 - s.jaw_taper)
    cheek_puff = math.exp(-(((sv - 0.30) / 0.16) ** 2)) * s.cheek_round * 0.13

    rx = s.head_w * 1.06 * dome * parietal * (v_narrow + 0.09 * jaw_angle_zone + cheek_puff)
    cranium_back = _sstep(0.22, 0.65, sv)
    ry_front = s.head_d * 1.02 * dome * (0.94 + 0.08 * _sstep(0.18, 0.65, sv))
    ry_back = s.head_d * 1.04 * dome * (0.86 + 0.20 * cranium_back)
    # 턱밑·후두하 목 연결부(sv < 0.22)가 목 기둥 반경보다 좁게 잘록해지지 않도록 해부학 하한 보장
    neck_join = 1.0 - _sstep(0.0, 0.24, sv)
    if neck_join > 0.0:
        min_rx = s.neck_rx * (0.95 * neck_join)
        min_ry_f = s.neck_ry * (0.98 * neck_join)
        min_ry_b = s.neck_ry * (0.96 * neck_join)
        rx = max(rx, min_rx)
        ry_front = max(ry_front, min_ry_f)
        ry_back = max(ry_back, min_ry_b)
    ry = ry_front if ct >= 0.0 else ry_back

    x = rx * st
    y = y_hc - ry * ct

    # --- 안면 세부 해부학 스컬프팅 ---
    chin_w = math.exp(-(((z - plan.z_chin) / (plan.head_h * 0.08)) ** 2)) * math.exp(-((theta / 0.42) ** 2))
    y -= chin_w * (0.008 + 0.004 * (1.0 - s.jaw_taper))

    brow_w = math.exp(-(((z - plan.z_brow) / (plan.head_h * 0.055)) ** 2)) * math.exp(-((theta / 0.65) ** 2))
    y -= brow_w * (0.0036 + 0.0024 * s.pec_relief)

    # 3) 한국 웹툰 콧대·코끝(측면·3/4 실루엣 선명, 정면 우아한 콧날)
    nose_h_norm = (z - plan.z_nose) / max(plan.z_eye - plan.z_nose, 1e-4)
    if -0.35 < nose_h_norm < 1.15:
        ridge_v = _sstep(-0.28, 0.02, nose_h_norm) * (1.0 - _sstep(0.08, 1.08, nose_h_norm) * 0.58)
        tip_peak = math.exp(-((nose_h_norm / 0.20) ** 2))
        half_ang = max(0.095, s.nose_width / max(s.head_w, 1e-4))
        ridge_x = math.exp(-((theta / half_ang) ** 2))
        y -= (ridge_v * 0.68 + tip_peak * 0.88) * ridge_x * (s.nose_protrude * 1.28)
        wing_x = math.exp(-(((abs(theta) - half_ang * 1.12) / (half_ang * 0.50)) ** 2))
        wing_v = math.exp(-(((nose_h_norm - 0.04) / 0.16) ** 2))
        y -= wing_v * wing_x * (s.nose_protrude * 0.30)

    phil_z = math.exp(-(((z - (plan.z_mouth + 0.48 * (plan.z_nose - plan.z_mouth))) / (plan.head_h * 0.035)) ** 2))
    y += phil_z * math.exp(-((theta / 0.10) ** 2)) * 0.0020

    lip_x = math.exp(-((theta / max(0.16, s.mouth_half_w / max(s.head_w * 0.75, 1e-4))) ** 2))
    upper_lip = math.exp(-(((z - (plan.z_mouth + plan.head_h * 0.018)) / (plan.head_h * 0.018)) ** 2))
    lower_lip = math.exp(-(((z - (plan.z_mouth - plan.head_h * 0.020)) / (plan.head_h * 0.020)) ** 2))
    y -= (upper_lip * 0.0048 + lower_lip * 0.0052) * lip_x
    mento = math.exp(-(((z - (plan.z_mouth - plan.head_h * 0.058)) / (plan.head_h * 0.025)) ** 2))
    y += mento * math.exp(-((theta / 0.34) ** 2)) * 0.0036

    return x, y, z


def _eval_head_profile(plan: ArchetypePlan, u_ring: float, theta: float) -> tuple[float, float, float]:
    """목 이음매(u=0) → 턱밑(C1 연속 보간, 단차 0) → 얼굴/두개골 → 정수리 외곽(u=1)."""
    s = plan.spec
    ct = math.cos(theta)
    st = math.sin(theta)
    z_neck_top = plan.z_neck_cut + (plan.z_chin - plan.z_neck_cut) * 0.72

    if u_ring <= 0.14:
        t = u_ring / 0.14
        z = plan.z_neck_cut + (z_neck_top - plan.z_neck_cut) * t
        rx = s.neck_rx * (1.0 - 0.03 * t)
        ry = s.neck_ry * (1.0 - 0.02 * t)
        yc = 0.004 + 0.003 * t
        return rx * st, yc - ry * ct, z

    if u_ring < 0.28:
        # 목 상단(u=0.14) → 두개골 하단(sv=0.0, u=0.28)을 정확히 연속 보간해 턱밑 칼라 단차 완전 제거!
        t = (u_ring - 0.14) / 0.14
        st_t = t * t * (3.0 - 2.0 * t)
        x0 = (s.neck_rx * 0.97) * st
        y0 = 0.007 - (s.neck_ry * 0.98) * ct
        z0 = z_neck_top
        x1, y1, z1 = _eval_cranium_surface(plan, 0.0, theta)
        return (
            x0 + (x1 - x0) * st_t,
            y0 + (y1 - y0) * st_t,
            z0 + (z1 - z0) * (0.75 * st_t + 0.25 * t),
        )

    sv = (u_ring - 0.28) / 0.72
    return _eval_cranium_surface(plan, sv, theta)


def _fill_grid_cap(
    bm: bmesh.types.BMesh,
    loop_verts: list[bmesh.types.BMVert],
    nx: int,
    ny: int,
    dome_dir: Vector,
    dome_height: float,
    tag_layer: Any,
    region_layer: Any,
    tag_val: int,
    region_val: int,
) -> list[bmesh.types.BMFace]:
    """2*(nx + ny) 경계 정점 루프를 100% 올-쿼드 (nx × ny) 돔 그리드로 닫는다.

    loop_verts 순서: bottom(0..nx), right(nx..nx+ny), top(nx+ny..2nx+ny), left(2nx+ny..2nx+2ny-1).
    """
    assert len(loop_verts) == 2 * (nx + ny)
    grid: list[list[bmesh.types.BMVert | None]] = [[None] * (nx + 1) for _ in range(ny + 1)]
    for i in range(nx + 1):
        grid[0][i] = loop_verts[i]
    for j in range(1, ny + 1):
        grid[j][nx] = loop_verts[nx + j]
    for i in range(1, nx + 1):
        grid[ny][nx - i] = loop_verts[nx + ny + i]
    for j in range(1, ny):
        grid[ny - j][0] = loop_verts[2 * nx + ny + j]

    # Coons patch 보간 + 부드러운 돔 상승
    for j in range(1, ny):
        v = j / ny
        for i in range(1, nx):
            u = i / nx
            p0 = grid[0][i].co
            p1 = grid[ny][i].co
            q0 = grid[j][0].co
            q1 = grid[j][nx].co
            c00, c10, c01, c11 = grid[0][0].co, grid[0][nx].co, grid[ny][0].co, grid[ny][nx].co
            bilinear = (1 - u) * (1 - v) * c00 + u * (1 - v) * c10 + (1 - u) * v * c01 + u * v * c11
            pt = (1 - v) * p0 + v * p1 + (1 - u) * q0 + u * q1 - bilinear
            bulge = math.sin(math.pi * u) * math.sin(math.pi * v)
            grid[j][i] = bm.verts.new(pt + dome_dir * (dome_height * bulge))

    faces: list[bmesh.types.BMFace] = []
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            f.smooth = True
            f[tag_layer] = tag_val
            f[region_layer] = region_val
            faces.append(f)
    return faces


def _build_arm_and_hand(
    bm: bmesh.types.BMesh,
    plan: ArchetypePlan,
    side_sign: float,
    port_loop: list[bmesh.types.BMVert],
    tag_layer: Any,
    region_layer: Any,
) -> None:
    """18-정점 어깨 개구부에서 팔·손바닥·5손가락(100% 올-쿼드)을 압출 조형한다.

    port_loop(18개) 순서(좌/우 공통 로컬 정렬):
      dorsal_top(4에지, 앞→뒤) → back(5에지, 위→아래) → palmar_bot(4에지, 뒤→앞) → front(5에지, 아래→위).
    """
    s = plan.spec
    lab = "Left" if side_sign > 0 else "Right"
    reg_uarm = REGION_INDEX[f"upperArm.{lab[0]}"]
    reg_farm = REGION_INDEX[f"forearm.{lab[0]}"]
    reg_hand = REGION_INDEX[f"hand.{lab[0]}"]

    p_arm = plan.joints_b[f"{MIXAMO}{lab}Arm"]
    p_elbow = plan.joints_b[f"{MIXAMO}{lab}ForeArm"]
    p_hand = plan.joints_b[f"{MIXAMO}{lab}Hand"]

    # 18-정점 루프를 손바닥 규약 [d0..d7(8), pk_mid(1), p7..p0(8), th_mid(1)]과
    # 매끄럽게 1:1 대응하는 각도 매개변수(0..2pi)로 배치한다.
    # port_loop[0] = top-front, [4] = top-back, [9] = bot-back, [13] = bot-front.
    # 인덱스 정렬: d0=index 16(앞-위), d1..d6(위), d7=4(뒤-위), pk_mid=6(뒤), p7=9(뒤-아래), p6..p1(아래), p0=13(앞-아래), th_mid=15(앞)
    # => 회전 시프트하여 idx 0 = top-front 쪽(d0)으로 맞추고 18개 위상각 생성!
    # port_loop의 실제 3D 좌표에서 시작하므로 첫 링은 port_loop 그대로 연결하고, 이후 링들은 각도를 점진 보간한다.
    arm_len = abs(p_hand[0] - p_arm[0])
    upper_len = abs(p_elbow[0] - p_arm[0])
    n_arm = max(10, int(round(16 * s.limb_rings_scale)))

    # 각 슬롯 k=0..17의 원형 타깃 각도(손바닥 평면 정렬):
    # k=0..7: dorsal (+Z), y from -hw(thumb) to +hw(pinky)
    # k=8: pinky side (+Y, z=0)
    # k=9..16: palmar (-Z), y from +hw to -hw
    # k=17: thumb side (-Y, z=0)
    palm_uv: list[tuple[float, float]] = []
    for k in range(8):
        u = -1.0 + 2.0 * (k / 7.0)  # -1(thumb/-Y) -> +1(pinky/+Y)
        palm_uv.append((u, +1.0))
    palm_uv.append((+1.0, 0.0))
    for k in range(8):
        u = +1.0 - 2.0 * (k / 7.0)
        palm_uv.append((u, -1.0))
    palm_uv.append((-1.0, 0.0))

    # port_loop 시작 방향 정렬: port_loop의 각 점의 (y, z) 기준 중심에서 가장 (-Y, +Z)에 가까운 점을 k=0으로 정렬하고,
    # 진행 방향이 (-Y,+Z) -> (+Y,+Z) -> (+Y,-Z) -> (-Y,-Z)가 되도록 회전/반전 정렬한다.
    center0 = sum((v.co for v in port_loop), Vector()) / len(port_loop)
    # 목표 위상: k=0은 (-Y, +Z), k=4는 (+Y, +Z), k=8은 (+Y, 0), k=13은 (-Y, -Z)
    # port_loop는 이미 시계/반시계 순환이므로 각도 기준 방향 검사
    angs = [math.atan2(v.co.z - center0.z, v.co.y - center0.y) for v in port_loop]
    # (-Y, +Z) 방향은 atan2(+1, -1) = 3*pi/4 = 2.356 rad; (+Y, +Z)는 pi/4 = 0.785 rad (각도 감소 방향!)
    # 인접 각도 차이 합으로 진행 방향 판정
    d_ang = sum(((angs[(i + 1) % 18] - angs[i] + math.pi) % (2 * math.pi) - math.pi) for i in range(18))
    ordered = list(port_loop)
    if d_ang > 0:
        ordered = list(reversed(ordered))
    # k=0을 목표각 2.40 rad((-Y, +Z))에 가장 가까운 정점으로 회전
    target0 = 2.38
    best_i = min(range(18), key=lambda i: abs(((math.atan2(ordered[i].co.z - center0.z, ordered[i].co.y - center0.y) - target0 + math.pi) % (2 * math.pi)) - math.pi))
    ordered = ordered[best_i:] + ordered[:best_i]

    # 시작 링의 각 정점 방향 (y, z) 정규화 각도
    start_yz = [((v.co.y - center0.y), (v.co.z - center0.z)) for v in ordered]
    start_ang = [math.atan2(z, y) for y, z in start_yz]
    # 타깃 원형 각도 (k=0..17, 2.38 -> 0.76 -> 0 -> -0.76 -> -2.38 -> pi)
    circle_ang = [math.atan2(pz * 0.78, py) for py, pz in palm_uv]

    def _interp_angle(a0: float, a1: float, t: float) -> float:
        diff = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        return a0 + diff * t

    rings: list[list[bmesh.types.BMVert]] = [ordered]
    ring_regions: list[int] = [reg_uarm]
    # 포트 외곽(x_port_outer)에서 바깥으로 균일하게 전진시켜 겨드랑이/삼각근 2mm 압착 간선을 원천 제거!
    x_port_outer = max(v.co.x * side_sign for v in ordered)
    x0_s = side_sign * x_port_outer
    port_dx = [v.co.x - x0_s for v in ordered]
    port_yz = [(v.co.y, v.co.z) for v in ordered]
    x_wrist = float(p_hand[0])

    for step in range(1, n_arm + 1):
        t = step / n_arm
        x_lin = x0_s + (x_wrist - x0_s) * t
        # 축 중심 y, z (어깨 → 팔꿈치 살짝 뒤 → 손목)
        yc = float(p_arm[1]) + 0.006 * math.sin(math.pi * t)
        zc = float(p_arm[2])
        # 해부학 팔 반지름 프로파일: 삼각근 완만한 캡(t~0.11) → 이두/삼두(t~0.32) → 팔꿈치(t~0.52) → 전완근(t~0.66) → 손목(t=1.0)
        deltoid = math.exp(-(((t - 0.11) / 0.13) ** 2)) * (0.15 + 0.13 * s.pec_relief)
        bicep = math.exp(-(((t - 0.32) / 0.16) ** 2)) * (0.07 + 0.12 * s.pec_relief)
        elbow_dip = -math.exp(-(((t - 0.52) / 0.07) ** 2)) * 0.06
        forearm_bulge = math.exp(-(((t - 0.65) / 0.13) ** 2)) * (0.10 + 0.12 * s.pec_relief)
        base_r = s.arm_r * (1.0 - _sstep(0.0, 0.55, t)) + s.forearm_r * (_sstep(0.0, 0.55, t) - _sstep(0.55, 1.0, t)) + s.wrist_r * _sstep(0.55, 1.0, t)
        r = base_r * (1.0 + deltoid + bicep + elbow_dip + forearm_bulge)

        # 손목에 가까워질수록 원형 → 편평 타원(손바닥 단면)
        flat = _sstep(0.75, 1.0, t)
        ry = r * (1.0 + 0.26 * flat)
        rz = r * (1.0 - 0.30 * flat)
        ring: list[bmesh.types.BMVert] = []
        ang_blend = _sstep(0.0, 0.45, t)
        x_flat_blend = _sstep(0.0, 0.30, t)
        yz_blend = _sstep(0.0, 0.24, t)
        for k in range(18):
            ang = _interp_angle(start_ang[k], circle_ang[k], ang_blend)
            cy_c = ry * math.cos(ang)
            cz_c = rz * math.sin(ang)
            pu, pv = palm_uv[k]
            cy_p = pu * ry * 0.96
            cz_p = pv * rz * (0.86 + 0.14 * (1.0 - pu * pu))
            cy_tgt = yc + cy_c * (1.0 - flat * 0.72) + cy_p * (flat * 0.72)
            cz_tgt = zc + cz_c * (1.0 - flat * 0.72) + cz_p * (flat * 0.72)
            # 포트 루프(t=0)에서 목표 원형 단면으로 연속 전이(겨드랑이 급격한 접힘·단차 방지)
            xk = x_lin + port_dx[k] * ((1.0 - x_flat_blend) ** 1.2)
            yk = port_yz[k][0] * (1.0 - yz_blend) + cy_tgt * yz_blend
            zk = port_yz[k][1] * (1.0 - yz_blend) + cz_tgt * yz_blend
            ring.append(bm.verts.new((xk, yk, zk)))
        rings.append(ring)
        ring_regions.append(reg_uarm if abs(x_lin - p_arm[0]) < upper_len else reg_farm)

    # 손바닥 3링 (palm_0 = wrist, palm_1 = mid-palm, palm_2 = MCP knuckles)
    hl = s.hand_len
    hw = s.hand_w
    ht = max(0.0085, s.wrist_r * 0.52)
    palm_rings: list[list[bmesh.types.BMVert]] = [rings[-1]]
    palm_specs = (
        (0.24, hw * 0.94, ht * 1.04, 0.002),
        (0.47, hw * 1.00, ht * 0.96, 0.000),
    )
    for frac, p_hw, p_ht, z_arch in palm_specs:
        x = x_wrist + side_sign * hl * frac
        ring = []
        for k in range(18):
            pu, pv = palm_uv[k]
            # 엄지 두덩(thenar) 볼륨
            thenar = 0.004 * max(0.0, -pu) * max(0.0, -pv) * (1.0 - frac)
            y = float(p_hand[1]) + pu * p_hw
            z = float(p_hand[2]) + pv * p_ht * (0.85 + 0.18 * (1.0 - pu * pu)) + z_arch - thenar
            ring.append(bm.verts.new((x, y, z)))
        palm_rings.append(ring)
        rings.append(ring)
        ring_regions.append(reg_hand)

    # 팔+손바닥 측면 쿼드 연결
    thumb_hole_faces: list[bmesh.types.BMFace] = []
    palm_start_idx = len(rings) - len(palm_rings)
    for r_idx in range(len(rings) - 1):
        r0, r1 = rings[r_idx], rings[r_idx + 1]
        reg = ring_regions[r_idx + 1]
        for k in range(18):
            kn = (k + 1) % 18
            f = bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))
            f.smooth = True
            f[tag_layer] = TAG_BODY
            f[region_layer] = reg
            # 엄지 개구부: 첫 손바닥 세그먼트의 엄지 측면 2쿼드(k=16: p0->th_mid, k=17: th_mid->d0)
            if r_idx == palm_start_idx and k in (16, 17):
                thumb_hole_faces.append(f)

    # 3개 손가락 사이 웹(web) 구축 + 4손가락 6-정점 개구부 생성
    dist = palm_rings[-1]  # d0..d7 (0..7), pk_mid (8), p7..p0 (9..16), th_mid (17)
    d = [dist[k] for k in range(8)]
    pk_mid = dist[8]
    p = [dist[16 - k] for k in range(8)]  # p[0]=dist[16](thumb side) .. p[7]=dist[9](pinky side)
    th_mid = dist[17]

    # 웹 중간 정점 6개 (k=1,2,3,4,5,6)
    mid_v: dict[int, bmesh.types.BMVert] = {0: th_mid, 7: pk_mid}
    for k in range(1, 7):
        pos = 0.5 * (d[k].co + p[k].co) + Vector((side_sign * hl * 0.02, 0.0, 0.0))
        mid_v[k] = bm.verts.new(pos)

    # 3개 웹 스트립 (k=1..2, k=3..4, k=5..6) — 각각 2쿼드
    for wk in (1, 3, 5):
        f_top = bm.faces.new((d[wk], d[wk + 1], mid_v[wk + 1], mid_v[wk]))
        f_bot = bm.faces.new((mid_v[wk], mid_v[wk + 1], p[wk + 1], p[wk]))
        for f in (f_top, f_bot):
            f.smooth = True
            f[tag_layer] = TAG_BODY
            f[region_layer] = reg_hand

    def _extrude_finger(loop6: list[bmesh.types.BMVert], chain: list[np.ndarray], r_base: float) -> None:
        """6-정점 손가락 개구부를 3마디 관절 루프로 압출하고 2-쿼드 둥근 손끝으로 닫는다."""
        prev = loop6
        # 방향 기준 벡터 (chain[0] -> chain[-1])
        c_pts = [Vector(pt.tolist()) for pt in chain]
        # 마디별 세부 샘플(MCP→PIP→DIP→Tip, 6링)
        seg_samples = [
            (0.08, 0.96),
            (0.28, 0.92),
            (0.48, 0.88),
            (0.68, 0.82),
            (0.86, 0.72),
            (0.98, 0.50),
        ]
        # 총 폴리라인 길이
        segl = [(c_pts[i + 1] - c_pts[i]).length for i in range(len(c_pts) - 1)]
        tot = sum(segl) or 1e-4

        def eval_chain(u: float) -> tuple[Vector, Vector]:
            d_target = u * tot
            acc = 0.0
            for i, sl in enumerate(segl):
                if d_target <= acc + sl or i == len(segl) - 1:
                    lt = (d_target - acc) / max(sl, 1e-6)
                    pos = c_pts[i].lerp(c_pts[i + 1], lt)
                    tang = (c_pts[i + 1] - c_pts[i]).normalized()
                    return pos, tang
                acc += sl
            return c_pts[-1], (c_pts[-1] - c_pts[-2]).normalized()

        # loop6의 로컬 기저 계산(k=0..5의 중심 기준 오프셋 방향 보존)
        c0 = sum((v.co for v in loop6), Vector()) / 6.0
        _, tang0 = eval_chain(0.0)
        up0 = Vector((0.0, 0.0, 1.0))
        if abs(tang0.dot(up0)) > 0.92:
            up0 = Vector((0.0, 1.0, 0.0))
        side0 = tang0.cross(up0).normalized()
        up0 = side0.cross(tang0).normalized()
        # 각 정점의 초기 (side, up) 방향 정규화
        local_dirs = []
        for v in loop6:
            dv = v.co - c0
            lu, lv = dv.dot(side0), dv.dot(up0)
            ln = math.hypot(lu, lv) or 1.0
            local_dirs.append((lu / ln, lv / ln))

        for u, r_mul in seg_samples:
            pos, tang = eval_chain(u)
            up = Vector((0.0, 0.0, 1.0))
            if abs(tang.dot(up)) > 0.92:
                up = Vector((0.0, 1.0, 0.0))
            sd = tang.cross(up).normalized()
            up = sd.cross(tang).normalized()
            # 마디 관절 미세 너클 볼륨
            knuckle = 1.0 + 0.06 * math.exp(-(((u - 0.45) / 0.08) ** 2)) + 0.04 * math.exp(-(((u - 0.75) / 0.08) ** 2))
            rad = r_base * r_mul * knuckle
            nxt = [bm.verts.new(pos + sd * (lu * rad) + up * (lv * rad * 0.90)) for lu, lv in local_dirs]
            for k in range(6):
                kn = (k + 1) % 6
                f = bm.faces.new((prev[k], prev[kn], nxt[kn], nxt[k]))
                f.smooth = True
                f[tag_layer] = TAG_BODY
                f[region_layer] = reg_hand
            prev = nxt

        # 6-정점 링을 2개 쿼드로 100% 올-쿼드 마감 (둥근 손톱끝)
        f1 = bm.faces.new((prev[0], prev[1], prev[2], prev[3]))
        f2 = bm.faces.new((prev[3], prev[4], prev[5], prev[0]))
        for f in (f1, f2):
            f.smooth = True
            f[tag_layer] = TAG_BODY
            f[region_layer] = reg_hand

    # 4손가락 압출
    for f_idx, (fname, r_mul) in enumerate((("Index", 0.21), ("Middle", 0.22), ("Ring", 0.20), ("Pinky", 0.175))):
        s0 = 2 * f_idx
        loop6 = [d[s0], d[s0 + 1], mid_v[s0 + 1], p[s0 + 1], p[s0], mid_v[s0]]
        chain = [plan.joints_b[f"{MIXAMO}{lab}Hand{fname}{seg}"] for seg in range(1, 5)]
        _extrude_finger(loop6, chain, hw * r_mul)

    # 엄지 개구부 삭제 후 6-정점 엄지 압출
    for f in thumb_hole_faces:
        bm.faces.remove(f)
    r_p0, r_p1 = palm_rings[0], palm_rings[1]
    # k=16은 p0->th_mid, k=17은 th_mid->d0 -> 6정점 루프: [r_p0[0], r_p1[0], r_p1[17], r_p1[16], r_p0[16], r_p0[17]]
    thumb_loop = [r_p0[0], r_p1[0], r_p1[17], r_p1[16], r_p0[16], r_p0[17]]
    thumb_chain = [plan.joints_b[f"{MIXAMO}{lab}HandThumb{seg}"] for seg in range(1, 5)]
    _extrude_finger(thumb_loop, thumb_chain, hw * 0.25)


def _build_leg_and_foot(
    bm: bmesh.types.BMesh,
    plan: ArchetypePlan,
    side_sign: float,
    leg_loop: list[bmesh.types.BMVert],
    tag_layer: Any,
    region_layer: Any,
) -> None:
    """18-정점 골반 다리 개구부에서 허벅지·무릎·종아리·발목·발(Z=0 평평한 발바닥, 100% 올-쿼드)을 압출한다."""
    s = plan.spec
    lab = "Left" if side_sign > 0 else "Right"
    reg_thigh = REGION_INDEX[f"thigh.{lab[0]}"]
    reg_calf = REGION_INDEX[f"calf.{lab[0]}"]
    reg_foot = REGION_INDEX[f"foot.{lab[0]}"]

    p_hip = plan.joints_b[f"{MIXAMO}{lab}UpLeg"]
    p_knee = plan.joints_b[f"{MIXAMO}{lab}Leg"]
    p_ankle = plan.joints_b[f"{MIXAMO}{lab}Foot"]

    # leg_loop(18개)를 전면(-Y, theta=0)에서 시작해 CCW(위에서 볼 때)로 정렬
    center0 = sum((v.co for v in leg_loop), Vector()) / 18.0
    angs = [math.atan2(v.co.x - center0.x, -(v.co.y - center0.y)) for v in leg_loop]
    d_ang = sum(((angs[(i + 1) % 18] - angs[i] + math.pi) % (2 * math.pi) - math.pi) for i in range(18))
    ordered = list(leg_loop)
    if d_ang < 0:
        ordered = list(reversed(ordered))
    # 전면(theta=0, x≈center, y<center)에 가장 가까운 정점을 0번으로 회전
    best_i = min(range(18), key=lambda i: abs(math.atan2(ordered[i].co.x - center0.x, -(ordered[i].co.y - center0.y))))
    ordered = ordered[best_i:] + ordered[:best_i]

    start_ang = [math.atan2(v.co.x - center0.x, -(v.co.y - center0.y)) for v in ordered]
    target_ang = [2.0 * math.pi * (k / 18.0) for k in range(18)]

    def _interp_angle(a0: float, a1: float, t: float) -> float:
        diff = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        return a0 + diff * t

    n_leg = max(12, int(round(20 * s.limb_rings_scale)))
    z_top = float(center0.z)
    z_bot = float(p_ankle[2])
    rings: list[list[bmesh.types.BMVert]] = [ordered]
    ring_regs: list[int] = [reg_thigh]

    for step in range(1, n_leg + 1):
        t = step / n_leg  # 0=가랑이, 1=발목
        z = z_top + (z_bot - z_top) * t
        # 다리 중심 x, y (위에서 발목으로 살짝 모이는 우아한 라인)
        cx = float(p_hip[0]) * (1.0 - t) + float(p_ankle[0]) * t
        cy = float(p_hip[1]) * (1.0 - t) + float(p_ankle[1]) * t
        # 반지름 프로파일: 허벅지(0..0.48) → 무릎(0.48) → 종아리(0.66) → 발목(1.0)
        if t <= 0.48:
            lt = t / 0.48
            r = s.thigh_r * (1.0 - lt) + s.knee_r * lt
            # 대퇴사두근 완만한 곡선
            r *= 1.0 + (0.06 + 0.08 * s.pec_relief) * math.sin(math.pi * lt)
        else:
            lt = (t - 0.48) / 0.52
            calf_peak = math.exp(-(((lt - 0.34) / 0.24) ** 2))
            r = s.knee_r * (1.0 - lt) + s.ankle_r * lt + (s.calf_r - 0.5 * (s.knee_r + s.ankle_r)) * calf_peak * 1.15
        # 종아리 뒤쪽(비복근) 돌출 & 무릎 앞쪽 슬개골
        ring = []
        ab = _sstep(0.0, 0.30, t)
        for k in range(18):
            ang = _interp_angle(start_ang[k], target_ang[k], ab)
            st, ct = math.sin(ang), math.cos(ang)  # ct=+1 전면(-Y), ct=-1 후면(+Y)
            rx_k = r * (0.98 + 0.04 * s.pec_relief)
            ry_k = r * 1.02
            y_off = 0.0
            if t > 0.52 and t < 0.88 and ct < 0.0:
                calf_b = math.exp(-(((t - 0.67) / 0.12) ** 2))
                y_off += (-ct) * calf_b * (s.calf_r * 0.24)
            if abs(t - 0.48) < 0.08 and ct > 0.0:
                y_off -= ct * math.exp(-(((t - 0.48) / 0.04) ** 2)) * (s.knee_r * 0.08)
            ring.append(bm.verts.new((cx + rx_k * st, cy - ry_k * ct + y_off, z)))
        rings.append(ring)
        ring_regs.append(reg_thigh if z >= plan.z_knee else reg_calf)

    # 발(Foot): 발목(z_ankle)에서 아래·전방(-Y)으로 90° 회전해 평평한 발바닥(Z=0.0)을 형성!
    # 18-정점 발 단면을 6(발등) + 3(외측) + 6(발바닥) + 3(내측) 구조로 정렬해 6×3 올-쿼드 발끝 캡으로 닫는다.
    # 각도: k=0..5 발등 위(+Z), k=6..8 좌측(+X), k=9..14 발바닥(Z=0), k=15..17 우측(-X)
    fx = float(p_ankle[0])
    fy_heel = float(p_ankle[1]) + s.ankle_r * 1.15
    fl = s.foot_len
    fw = s.foot_w
    fh = float(p_ankle[2])

    # 발목 뒤꿈치 전이 2링 + 중족/전족 5링 (모두 발바닥 Z=0.0 고정!)
    foot_sections = [
        # (y_center, half_w, z_top, z_bot, pitch_blend)
        (fy_heel - fl * 0.14, fw * 0.84, fh * 0.92, fh * 0.22),
        (fy_heel - fl * 0.32, fw * 0.88, fh * 0.72, 0.0),
        (fy_heel - fl * 0.54, fw * 0.96, fh * 0.52, 0.0),
        (fy_heel - fl * 0.76, fw * 1.00, fh * 0.38, 0.0),
        (fy_heel - fl * 0.92, fw * 0.84, fh * 0.28, 0.0),
    ]
    # 18개 단면 좌표: (u in [-1,1] 좌우, v in [0,1] 발바닥→발등)
    # 기존 다리 링의 k=0..17은 ang = 2pi*k/18 (0=전면 -Y, 4.5=+X, 9=후면 +Y, 13.5=-X)
    # 발목이 앞으로 꺾이면: 전면(k=0)→발등 중앙(+Z), +X(k=4.5)→+X 측면, 후면(k=9)→발바닥 중앙(Z=0), -X(k=13.5)→-X 측면!
    # 정확히 일치한다!! (k=0..17 순서 그대로 꺾으면 비틀림 0°!)
    foot_uv: list[tuple[float, float]] = []
    for k in range(18):
        ang = 2.0 * math.pi * (k / 18.0)
        sx = math.sin(ang)  # +1 (+X), -1 (-X)
        cz = math.cos(ang)  # +1 (발등 위), -1 (발바닥 아래)
        # 발바닥 쪽(cz < -0.25)은 평평하게 Z=0에 안착
        v_top = 0.5 + 0.5 * cz
        if cz < -0.30:
            v_top = 0.0
        else:
            v_top = (cz + 0.30) / 1.30
        foot_uv.append((sx, v_top))

    for sec_i, (fy, f_hw, z_top_f, z_bot_f) in enumerate(foot_sections):
        ring = []
        for k in range(18):
            sx, vt = foot_uv[k]
            # 앞쪽 발등 곡률
            y_k = fy - (fl * 0.05 if sec_i == 0 else 0.0) * (vt - 0.5)
            # 엄지발가락 쪽 살짝 긴 해부학 비대칭
            toe_asym = (-side_sign * sx) * (fl * 0.035) * _sstep(2, 4, sec_i)
            z_k = z_bot_f + (z_top_f - z_bot_f) * (vt ** 0.85)
            if sec_i >= 1 and vt <= 0.01:
                z_k = 0.0
            ring.append(bm.verts.new((fx + sx * f_hw, y_k - toe_asym, z_k)))
        rings.append(ring)
        ring_regs.append(reg_foot)

    for r_idx in range(len(rings) - 1):
        r0, r1 = rings[r_idx], rings[r_idx + 1]
        reg = ring_regs[r_idx + 1]
        for k in range(18):
            kn = (k + 1) % 18
            f = bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))
            f.smooth = True
            f[tag_layer] = TAG_BODY
            f[region_layer] = reg

    # 18-정점 발끝 루프를 6×3 올-쿼드 돔으로 닫는다 (k=15,16,17,0,1,2,3 = 발등 6에지)
    toe_ring = rings[-1]
    # _fill_grid_cap(nx=6, ny=3): bottom(0..6)=발등 6에지, right(6..9)=+X 3에지, top(9..15)=발바닥 6에지, left(15..18)=-X 3에지
    # toe_ring에서 k=15(-X,위)→0(중앙,위)→3(+X,위)→6(+X,아래)→9(중앙,아래)→12(-X,아래)→15
    # 시작점을 k=15로 시프트하면 정확히 6(발등) + 3(+X) + 6(발바닥) + 3(-X)!
    cap_loop = toe_ring[15:] + toe_ring[:15]
    _fill_grid_cap(
        bm,
        cap_loop,
        nx=6,
        ny=3,
        dome_dir=Vector((0.0, -1.0, 0.0)),
        dome_height=fl * 0.08,
        tag_layer=tag_layer,
        region_layer=region_layer,
        tag_val=TAG_BODY,
        region_val=reg_foot,
    )


def build_unified_body_head_mesh(plan: ArchetypePlan) -> tuple[bpy.types.Mesh, dict[str, Any]]:
    """32-컬럼 통일 올-쿼드 바디+헤드 메쉬를 생성하고 SUBSURF Lv1을 베이크한다."""
    s = plan.spec
    bm = bmesh.new()
    tag_layer = bm.faces.layers.int.new("ts_part_tag")
    region_layer = bm.faces.layers.int.new("ts_region_id")

    # 1) 몸통 + 목 기둥 (32컬럼)
    n_torso_low = max(7, 10 + s.torso_rings_extra // 2)  # 가랑이 -> 겨드랑이
    n_arm_rows = 5  # 팔 개구부 정확히 5행 (4열 × 5행 = 18-정점 루프!)
    n_neck_body = 3  # 겨드랑이 위 -> 목 이음매
    z_axilla = max(plan.z_shoulder - s.arm_r * 0.96, plan.z_waist + 0.032)
    z_deltoid_top = min(plan.z_shoulder + s.arm_r * 0.88, plan.z_neck_base - 0.008)

    torso_zs: list[float] = []
    # 가랑이 ~ 겨드랑이
    for i in range(n_torso_low):
        t = i / n_torso_low
        torso_zs.append(plan.z_crotch + (z_axilla - plan.z_crotch) * t)
    r_axilla_idx = len(torso_zs)
    # 팔 개구부 5구간 (6개 링: r_axilla_idx .. r_axilla_idx + 5)
    for i in range(n_arm_rows + 1):
        t = i / n_arm_rows
        torso_zs.append(z_axilla + (z_deltoid_top - z_axilla) * t)
    # 어깨 위 ~ 목 이음매(z_neck_cut)
    for i in range(1, n_neck_body + 1):
        t = i / n_neck_body
        torso_zs.append(z_deltoid_top + (plan.z_neck_cut - z_deltoid_top) * t)
    r_seam_idx = len(torso_zs) - 1

    # 2) 두상 링 (목 이음매 위 u_ring in (0, 1])
    n_head_rings = 22 if s.archetype_id != "sd-chibi" else 18
    head_us = [i / n_head_rings for i in range(1, n_head_rings + 1)]

    all_rings: list[list[bmesh.types.BMVert]] = []
    # 몸통 링 생성
    for z in torso_zs:
        ring = []
        for c in range(32):
            theta = 2.0 * math.pi * (c / 32.0)
            x, y = _eval_torso_profile(plan, z, theta)
            ring.append(bm.verts.new((x, y, z)))
        all_rings.append(ring)

    # 두상 링 생성
    for u in head_us:
        ring = []
        for c in range(32):
            theta = 2.0 * math.pi * (c / 32.0)
            x, y, z = _eval_head_profile(plan, u, theta)
            ring.append(bm.verts.new((x, y, z)))
        all_rings.append(ring)

    # 몸통+두상 면 생성 (팔 개구부 좌 c=6..9, 우 c=22..25, 행 r_axilla_idx..r_axilla_idx+4 제외)
    reg_neck = REGION_INDEX["neck"]
    reg_torso = REGION_INDEX["torso"]
    reg_pelvis = REGION_INDEX["pelvis"]
    reg_head = REGION_INDEX["head"]

    # 얼굴 특징 패치 면 수집용
    eye_l_faces: list[bmesh.types.BMFace] = []
    eye_r_faces: list[bmesh.types.BMFace] = []
    mouth_faces: list[bmesh.types.BMFace] = []
    ear_l_faces: list[bmesh.types.BMFace] = []
    ear_r_faces: list[bmesh.types.BMFace] = []

    for r in range(len(all_rings) - 1):
        r0, r1 = all_rings[r], all_rings[r + 1]
        z_mid = 0.5 * (r0[0].co.z + r1[0].co.z)
        is_head = r >= r_seam_idx
        for c in range(32):
            # 팔 개구부 건너뛰기
            if r_axilla_idx <= r < r_axilla_idx + n_arm_rows and (6 <= c <= 9 or 22 <= c <= 25):
                continue
            cn = (c + 1) % 32
            f = bm.faces.new((r0[c], r0[cn], r1[cn], r1[c]))
            f.smooth = True
            if is_head:
                f[tag_layer] = TAG_HEAD_SKIN
                f[region_layer] = reg_head
                # 눈·입·귀 패치 분류
                fc = f.calc_center_median()
                # 눈 안와 패치: 좌 c in {2,3,4}, 우 c in {27,28,29}, z가 눈 높이 ± eye_open_h*0.72
                if abs(fc.z - plan.z_eye) < plan.eye_open_h * 0.85 and fc.y < 0.0:
                    if c in (2, 3, 4):
                        eye_l_faces.append(f)
                    elif c in (27, 28, 29):
                        eye_r_faces.append(f)
                # 입술·구강 패치: c in {30,31,0,1}, z가 입 높이 근방
                if c in (30, 31, 0, 1) and abs(fc.z - plan.z_mouth) < plan.head_h * 0.048 and fc.y < 0.0:
                    mouth_faces.append(f)
                # 귀 패치: 좌 c in {8,9}, 우 c in {22,23}, z가 귀 높이
                if plan.z_mouth - 0.005 < fc.z < plan.z_eye + 0.008:
                    if c in (8, 9):
                        ear_l_faces.append(f)
                    elif c in (22, 23):
                        ear_r_faces.append(f)
            else:
                f[tag_layer] = TAG_BODY
                if r >= r_seam_idx - 2:
                    f[region_layer] = reg_neck
                elif z_mid < plan.z_hips + (plan.z_waist - plan.z_hips) * 0.35:
                    f[region_layer] = reg_pelvis
                else:
                    f[region_layer] = reg_torso

    # 3) 정수리 8×8 올-쿼드 돔 캡 (32-정점 루프)
    crown_ring = all_rings[-1]
    crown_z = float(sum(v.co.z for v in crown_ring) / 32.0)
    crown_dome = max(0.012, plan.z_crown - crown_z)
    _fill_grid_cap(
        bm,
        crown_ring,
        nx=8,
        ny=8,
        dome_dir=Vector((0.0, 0.0, 1.0)),
        dome_height=crown_dome,
        tag_layer=tag_layer,
        region_layer=region_layer,
        tag_val=TAG_HEAD_SKIN,
        region_val=reg_head,
    )

    # 4) 가랑이(Crotch) 2×4 올-쿼드 브리지 + 양다리 18-정점 압출
    bot = all_rings[0]
    # 전면 [bot[31], bot[0], bot[1]] ↔ 후면 [bot[17], bot[16], bot[15]] 사이 3개 중간 행
    crotch_rows: list[list[bmesh.types.BMVert]] = [[bot[31], bot[0], bot[1]]]
    for k in range(1, 4):
        t = k / 4.0
        dip = -s.hip_ry * 0.22 * math.sin(math.pi * t)
        row_k = []
        for fi, bi in ((31, 17), (0, 16), (1, 15)):
            pt = bot[fi].co.lerp(bot[bi].co, t) + Vector((0.0, 0.0, dip))
            row_k.append(bm.verts.new(pt))
        crotch_rows.append(row_k)
    crotch_rows.append([bot[17], bot[16], bot[15]])
    for k in range(4):
        for col in range(2):
            f = bm.faces.new((crotch_rows[k][col], crotch_rows[k][col + 1], crotch_rows[k + 1][col + 1], crotch_rows[k + 1][col]))
            f.smooth = True
            f[tag_layer] = TAG_BODY
            f[region_layer] = reg_pelvis

    # 왼다리 18-정점 루프: bot[1..15] + crotch_rows[3][2], [2][2], [1][2]
    left_leg_loop = [bot[c] for c in range(1, 16)] + [crotch_rows[3][2], crotch_rows[2][2], crotch_rows[1][2]]
    right_leg_loop = [bot[c] for c in range(17, 32)] + [crotch_rows[1][0], crotch_rows[2][0], crotch_rows[3][0]]
    _build_leg_and_foot(bm, plan, +1.0, left_leg_loop, tag_layer, region_layer)
    _build_leg_and_foot(bm, plan, -1.0, right_leg_loop, tag_layer, region_layer)

    # 5) 양팔 18-정점 포트 루프 추출 + 팔/손/5손가락 압출
    def _arm_port_loop(c0: int) -> list[bmesh.types.BMVert]:
        c1 = c0 + 4
        r0 = r_axilla_idx
        r1 = r_axilla_idx + n_arm_rows
        loop = (
            [all_rings[r1][c] for c in range(c0, c1 + 1)]
            + [all_rings[r][c1] for r in range(r1 - 1, r0 - 1, -1)]
            + [all_rings[r0][c] for c in range(c1 - 1, c0 - 1, -1)]
            + [all_rings[r][c0] for r in range(r0 + 1, r1)]
        )
        assert len(loop) == 18
        return loop

    _build_arm_and_hand(bm, plan, +1.0, _arm_port_loop(6), tag_layer, region_layer)
    _build_arm_and_hand(bm, plan, -1.0, _arm_port_loop(22), tag_layer, region_layer)

    # 6) 깔끔한 매니폴드 압출 헬퍼 (원본 내부 면·내부 간선 제거, 0 non-manifold 보장)
    def _clean_orphans() -> None:
        for e in [ed for ed in bm.edges if len(ed.link_faces) == 0]:
            bm.edges.remove(e)
        for v in [vt for vt in bm.verts if len(vt.link_faces) == 0]:
            bm.verts.remove(v)

    def _extrude_patch(cur_faces: list[bmesh.types.BMFace]) -> tuple[list[bmesh.types.BMFace], list[bmesh.types.BMVert], list[bmesh.types.BMFace]]:
        old_set = set(cur_faces)
        before_faces = set(bm.faces)
        ext = bmesh.ops.extrude_face_region(bm, geom=list(cur_faces))
        new_verts = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
        new_caps = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMFace)]
        bmesh.ops.delete(bm, geom=list(cur_faces), context="FACES_ONLY")
        _clean_orphans()
        side_faces = [f for f in bm.faces if f not in before_faces and f not in new_caps and f not in old_set]
        return new_caps, new_verts, side_faces

    # 팔 개구부·엄지 개구부로 남은 고아 정점·간선 선제 정리
    _clean_orphans()

    # 6) 입체 안와(3D Eye Socket, Layer 1) — 양안 인셋 + 오목 압출(100% 폐곡면 올-쿼드)
    def _sculpt_eye_socket(faces: list[bmesh.types.BMFace], eye_center: np.ndarray, side_tag: int) -> None:
        if not faces:
            return
        ec = Vector(eye_center.tolist())
        # 1단계 인셋: 눈꺼풀 테두리 림(eyelid rim) 형성
        res1 = bmesh.ops.inset_region(bm, faces=faces, thickness=plan.eye_open_h * 0.22, depth=0.0012, use_even_offset=True)
        for rf in res1["faces"]:
            rf[tag_layer] = TAG_HEAD_SKIN
            rf[region_layer] = reg_head
            rf.smooth = True
        # 눈꺼풀 외곽을 아몬드형 웹툰 곡선 + 두개골 곡면 추적(외측 눈꼬리 뺨 돌출 방지)으로 정리
        rim_verts = list({v for f in faces for v in f.verts})
        max_outer_x = min(s.head_w * 0.84, abs(ec.x) + plan.eye_open_w * 0.46)
        for v in rim_verts:
            if abs(v.co.x) > max_outer_x:
                v.co.x = math.copysign(max_outer_x, v.co.x)
            orig_y = v.co.y
            rel = v.co - ec
            nx_e = rel.x / max(plan.eye_open_w * 0.50, 1e-4)
            u_lat = min(1.15, abs(nx_e))
            arch_z = plan.eye_open_h * 0.50 * max(0.24, 1.0 - 0.60 * nx_e * nx_e)
            y_wrap = plan.eye_radius * 0.62 * (u_lat * u_lat)
            if rel.z >= 0.0:
                v.co.z = ec.z + arch_z
                v.co.y = max(orig_y - 0.0018, ec.y - plan.eye_radius * 0.90 - 0.0016 + y_wrap)
            else:
                v.co.z = ec.z - arch_z * 0.78
                v.co.y = max(orig_y - 0.0012, ec.y - plan.eye_radius * 0.86 + y_wrap)

        # 2단계 안쪽 오목 압출: 안구를 감싸는 실제 3D 안와(eye socket)
        new_caps, ext_verts, side_faces = _extrude_patch(faces)
        for v in ext_verts:
            # 안구 뒤쪽(+Y)으로 깊게 들어가며 수축해 안구와 간섭 없음
            v.co.y = ec.y + plan.eye_radius * 0.45
            v.co.x = ec.x + (v.co.x - ec.x) * 0.72
            v.co.z = ec.z + (v.co.z - ec.z) * 0.72
        for f in new_caps + side_faces:
            f[tag_layer] = side_tag
            f[region_layer] = reg_head
            f.smooth = True

    _sculpt_eye_socket(eye_l_faces, plan.eye_center_l, TAG_EYE_SOCKET_L)
    _sculpt_eye_socket(eye_r_faces, plan.eye_center_r, TAG_EYE_SOCKET_R)

    # 7) 입체 입술 + 닫힌 3D 구강 주머니(Oral Cavity — 중립 자세에서 입구 틈/치아 노출 0!)
    if mouth_faces:
        mc = Vector(plan.mouth_center.tolist())
        # 먼저 입술 외곽(mouth_faces 경계) 정점의 폭·높이를 한국 웹툰 단정한 입술 비율로 정리
        lip_res = bmesh.ops.inset_region(bm, faces=mouth_faces, thickness=plan.head_h * 0.010, depth=0.0012, use_even_offset=True)
        for f in lip_res["faces"]:
            f[tag_layer] = TAG_LIP
            f[region_layer] = reg_head
            f.smooth = True
        inner_set = {v for f in mouth_faces for v in f.verts}
        outer_lip_v = list({v for f in lip_res["faces"] for v in f.verts} - inner_set)
        lip_half_h = min(0.0050, plan.head_h * 0.018)
        lip_max_x = s.mouth_half_w * 1.12
        # 입술 외곽 림을 단정한 아몬드형 입술 쿠션으로 정돈 (SD 치비에서도 과대한 입 구멍 방지)
        for v in outer_lip_v:
            if abs(v.co.x) > lip_max_x:
                v.co.x = math.copysign(lip_max_x + (abs(v.co.x) - lip_max_x) * 0.25, v.co.x)
            u = min(1.0, abs(v.co.x) / max(lip_max_x, 1e-4))
            dz = v.co.z - mc.z
            sign_z = 1.0 if dz >= 0.0 else -1.0
            taper_h = lip_half_h * (0.24 + 0.76 * max(0.0, 1.0 - u * u))
            v.co.z = mc.z + sign_z * min(abs(dz), taper_h) + 0.0012 * (u * u)
            # 입술 쿠션 앞쪽 볼륨 유지
            v.co.y = min(v.co.y, mc.y + 0.0005 + 0.0028 * (u * u))

        # 중립 자세에서 윗입술·아랫입술이 0.3mm 미세 입선으로 밀착되도록 정렬 (중립 포즈 치아 노출 0!)
        inner_v = list(inner_set)
        for v in inner_v:
            if abs(v.co.x) > s.mouth_half_w * 0.90:
                v.co.x = math.copysign(s.mouth_half_w * 0.90, v.co.x)
            u = min(1.0, abs(v.co.x) / max(s.mouth_half_w * 0.92, 1e-4))
            dz = v.co.z - mc.z
            # 위/중/아래 행 순서(±0.15mm)를 정확히 유지하면서 밀착
            if abs(dz) < 0.0005:
                v.co.z = mc.z
            else:
                v.co.z = mc.z + math.copysign(0.00015, dz)
            v.co.y = mc.y + 0.0014 + 0.0024 * (u * u)
        # 입선 바로 뒤쪽에 0.32mm 밀착 지지 루프(TAG_LIP)를 한 번 더 압출해 SUBSURF 후에도 중립 입술이 틈 없이 닫히도록 고정!
        cur_m = list(mouth_faces)
        mouth_steps = (
            (0.0042, 0.96, 0.00015, 0.00018, TAG_LIP),
            (0.0170, 1.05, 0.00018, 0.0068, TAG_ORAL_CAVITY),
            (0.0320, 1.12, 0.0068, 0.0098, TAG_ORAL_CAVITY),
        )
        for dy, sx_m, prev_h, next_h, step_tag in mouth_steps:
            cur_m, ev, side_f = _extrude_patch(cur_m)
            for v in ev:
                v.co.y = mc.y + dy
                v.co.x = mc.x + (v.co.x - mc.x) * sx_m
                ratio_z = max(-1.0, min(1.0, (v.co.z - mc.z) / prev_h))
                v.co.z = mc.z + ratio_z * next_h
            for f in cur_m + side_f:
                f[tag_layer] = step_tag
                f[region_layer] = reg_head
                f.smooth = True

    # 8) 입체 3D 귀(좌/우 올-쿼드 압출)
    def _sculpt_ear(faces: list[bmesh.types.BMFace], side_sign: float, ear_tag: int) -> None:
        if not faces:
            return
        ear_out = s.head_w * (0.20 if s.archetype_id != "sd-chibi" else 0.14)
        cur_e = list(faces)
        for dx, dy, dz, sc in ((ear_out * 0.45, 0.005, 0.001, 0.88), (ear_out * 0.55, 0.007, 0.001, 0.72)):
            cur_e, ev, side_f = _extrude_patch(cur_e)
            center = sum((v.co for v in ev), Vector()) / max(len(ev), 1)
            for v in ev:
                v.co = center + (v.co - center) * sc + Vector((side_sign * dx, dy, dz))
            for f in cur_e + side_f:
                f[tag_layer] = ear_tag
                f[region_layer] = reg_head
                f.smooth = True

    _sculpt_ear(ear_l_faces, +1.0, TAG_EAR_L)
    _sculpt_ear(ear_r_faces, -1.0, TAG_EAR_R)
    _clean_orphans()

    # 법선 일관화 및 bmesh 무결성 검증(서브서프 전)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    raw_mesh = bpy.data.meshes.new(f"ts_unified_cage_{s.archetype_id}")
    bm.to_mesh(raw_mesh)
    bm.free()

    # Catmull-Clark SUBSURF Lv1 베이크 (100% 올-쿼드 고품질 곡면 확보)
    obj = bpy.data.objects.new(f"ts_unified_{s.archetype_id}", raw_mesh)
    bpy.context.scene.collection.objects.link(obj)
    sub = obj.modifiers.new(name="Subsurf", type="SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    sub.boundary_smooth = "ALL"
    deps = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(deps)
    baked = bpy.data.meshes.new_from_object(eval_obj)
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(raw_mesh, do_unlink=True)

    # 정확한 바닥 접지(Z=0.000000) + 신장 보정
    n_verts = len(baked.vertices)
    coords = np.empty(n_verts * 3, dtype=np.float64)
    baked.vertices.foreach_get("co", coords)
    coords = coords.reshape(-1, 3)
    min_z = float(coords[:, 2].min())
    max_z = float(coords[:, 2].max())
    # 바닥을 정확히 Z=0으로 올리고 목표 신장(height_m)에 정밀 정합
    coords[:, 2] -= min_z
    cur_h = max_z - min_z
    if abs(cur_h - s.height_m) > 1e-4:
        # 발바닥(Z=0) 기준 비례 보정 (정확히 target height_m 일치)
        scale_z = s.height_m / cur_h
        coords[:, 2] *= scale_z
        # 스켈레톤·랜드마크도 동일 보정
        plan.z_crown *= scale_z
        plan.z_chin = (plan.z_chin - min_z) * scale_z
        plan.z_eye = (plan.z_eye - min_z) * scale_z
        plan.z_nose = (plan.z_nose - min_z) * scale_z
        plan.z_mouth = (plan.z_mouth - min_z) * scale_z
        plan.z_brow = (plan.z_brow - min_z) * scale_z
        plan.z_neck_cut = (plan.z_neck_cut - min_z) * scale_z
        plan.z_neck_base = (plan.z_neck_base - min_z) * scale_z
        plan.z_shoulder = (plan.z_shoulder - min_z) * scale_z
        plan.z_chest = (plan.z_chest - min_z) * scale_z
        plan.z_waist = (plan.z_waist - min_z) * scale_z
        plan.z_hips = (plan.z_hips - min_z) * scale_z
        plan.z_crotch = (plan.z_crotch - min_z) * scale_z
        plan.z_knee = (plan.z_knee - min_z) * scale_z
        plan.z_ankle = (plan.z_ankle - min_z) * scale_z
        for vec in (
            plan.eye_center_l,
            plan.eye_center_r,
            plan.nose_tip,
            plan.mouth_center,
            plan.chin_pt,
            plan.jaw_pivot,
            plan.jaw_corner_l,
            plan.ear_l,
            plan.forehead_pt,
        ):
            vec[2] = (vec[2] - min_z) * scale_z
        for jv in plan.joints_b.values():
            jv[2] = (jv[2] - min_z) * scale_z
    # 발바닥 미세 평탄화(0.6mm 이하만 정확히 0.0으로 스냅해 바닥 접지 완벽 보장)
    coords[coords[:, 2] < 0.0006, 2] = 0.0
    baked.vertices.foreach_set("co", coords.astype(np.float32).ravel())
    baked.update()

    # bmesh 0-결함 하드 게이트
    audit = audit_bmesh_mesh(baked)
    if (
        audit["trueNonManifold"] != 0
        or audit["looseVerts"] != 0
        or audit["wireEdges"] != 0
        or audit["zeroAreaFaces"] != 0
        or audit["quadRatio"] < 0.999
    ):
        raise RuntimeError(f"{s.archetype_id} 통일 메쉬 bmesh 결함 발견: {audit}")

    return baked, audit


def audit_bmesh_mesh(mesh: bpy.types.Mesh) -> dict[str, Any]:
    """bmesh 0-결함 지표 측정."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    loose_verts = sum(1 for v in bm.verts if len(v.link_edges) == 0)
    wire_edges = sum(1 for e in bm.edges if len(e.link_faces) == 0)
    boundary_edges = sum(1 for e in bm.edges if len(e.link_faces) == 1)
    true_nonmanifold = sum(1 for e in bm.edges if len(e.link_faces) > 2 or (len(e.link_faces) == 2 and not e.is_contiguous))
    zero_area = sum(1 for f in bm.faces if f.calc_area() <= 1e-10)
    quads = sum(1 for f in bm.faces if len(f.verts) == 4)
    tris = sum(1 for f in bm.faces if len(f.verts) == 3)
    ngons = sum(1 for f in bm.faces if len(f.verts) > 4)
    total_f = max(len(bm.faces), 1)
    zs = [v.co.z for v in bm.verts]
    bm.free()
    return {
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "quads": quads,
        "tris": tris,
        "ngons": ngons,
        "quadRatio": round(quads / total_f, 5),
        "trueNonManifold": true_nonmanifold,
        "boundaryEdges": boundary_edges,
        "looseVerts": loose_verts,
        "wireEdges": wire_edges,
        "zeroAreaFaces": zero_area,
        "minZ": round(min(zs), 6) if zs else 0.0,
        "maxZ": round(max(zs), 6) if zs else 0.0,
    }


# ---------------------------------------------------------------------------
# 해부학 68본 스키닝 + 어깨 3단계 웨이트 확산 (Clavicle 0.25 → UpperArm 0.75)
# ---------------------------------------------------------------------------


def _dist_to_segment(pts: np.ndarray, a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """각 점 pts (N,3)에서 선분 a->b까지 최단거리와 매개변수 t in [0,1]."""
    ab = b - a
    l2 = float(np.dot(ab, ab))
    if l2 < 1e-12:
        return np.linalg.norm(pts - a[None, :], axis=1), np.zeros(len(pts), dtype=np.float64)
    t = np.clip(((pts - a[None, :]) @ ab) / l2, 0.0, 1.0)
    proj = a[None, :] + np.outer(t, ab)
    return np.linalg.norm(pts - proj, axis=1), t


def compute_anatomical_skin_weights_v2(
    positions_b: np.ndarray,
    quads: np.ndarray,
    face_region: np.ndarray,
    plan: ArchetypePlan,
) -> tuple[np.ndarray, np.ndarray]:
    """통일 바디+헤드 정점의 68본 스킨 웨이트를 계산한다.

    어깨 85° 혹 돌출 제거 전략:
    1) 해부학 견관절 피벗(LeftArm/RightArm) 중심으로 반경 75mm(아키타입 비례) 3단계 확산:
       Spine2 → Clavicle(LeftShoulder, 피크 ~0.25~0.42 브리지) → UpperArm(LeftArm, 0→0.75→1.0).
    2) 견관절·겨드랑이·삼각근 전환 대역을 토폴로지 라플라시안 조화 평활(90회)로 매끄럽게 펴서
       어깨 85° 거상 시 ROI 최대 간선 신장률을 1.85 이하(목표 ~1.35~1.55)로 유지한다.
    3) 목 이음매 정점은 용접 상태에서 1회 계산하므로 TS_Body/TS_Head가 비트 단위 동일한 웨이트를 공유한다.
    """
    n = len(positions_b)
    j_count = len(SKELETON_JOINTS)
    w = np.zeros((n, j_count), dtype=np.float64)
    jb = plan.joints_b
    J = JOINT_INDEX
    m = lambda s: f"{MIXAMO}{s}"

    # 정점별 주 소속 영역 (다수결)
    votes = np.zeros((n, len(KIT_REGION_IDS)), dtype=np.int32)
    for k in range(4):
        np.add.at(votes, (quads[:, k], face_region), 1)
    v_reg = votes.argmax(axis=1)

    px, py, pz = positions_b[:, 0], positions_b[:, 1], positions_b[:, 2]

    # --- 1) 척추·목·머리 체인: 인접 2본 구간 분할(최대 2본만 활성 → top-4 절단 절벽 원천 차단!) ---
    spine_bones = [m("Hips"), m("Spine"), m("Spine1"), m("Spine2"), m("Neck"), m("Head")]
    spine_z = np.array([jb[b][2] for b in spine_bones], dtype=np.float64)
    is_core = np.isin(v_reg, [REGION_INDEX["head"], REGION_INDEX["neck"], REGION_INDEX["torso"], REGION_INDEX["pelvis"]])

    # 모든 정점에 대해 인접 2개 척추 본만 보간 (합=1.0, 비영 본 <= 2!)
    w_spine = np.zeros((n, j_count), dtype=np.float64)
    for i_seg in range(len(spine_bones) - 1):
        z0, z1 = spine_z[i_seg], spine_z[i_seg + 1]
        in_seg = (pz >= z0) & (pz < z1)
        if in_seg.any():
            t = expr.smoothstep(z0, z1, pz[in_seg])
            w_spine[in_seg, J[spine_bones[i_seg]]] = 1.0 - t
            w_spine[in_seg, J[spine_bones[i_seg + 1]]] = t
    below = pz < spine_z[0]
    w_spine[below, J[spine_bones[0]]] = 1.0
    above = pz >= spine_z[-1]
    w_spine[above, J[spine_bones[-1]]] = 1.0
    w[is_core] = w_spine[is_core]

    # 머리는 턱 위 100% Head (목 이음매는 Neck/Head 2본 매끄러운 공유)
    head_only = (v_reg == REGION_INDEX["head"]) & (pz > plan.z_chin + 0.008)
    w[head_only, :] = 0.0
    w[head_only, J[m("Head")]] = 1.0

    # --- 2) 양팔 + 해부학 견관절 메트릭 조화 확산 (Dirichlet 최대원리: 0 <= s_arm <= s_tot <= 1, s_clav = s_tot - s_arm) ---
    # 간선 길이 역수(1/L) 가중 라플라시안으로 짧은 간선의 기울기 집중을 원천 차단하고,
    # UpperArm은 목/흉골에 절대 누설되지 않으며, ForeArm/Hand는 s_arm을 연속 곱셈 분할해 절벽 0건을 보장한다!
    ptr, idx = skin.vertex_adjacency(quads, n)
    counts = np.diff(ptr).astype(np.float64)
    src = np.repeat(np.arange(n), np.diff(ptr))
    edge_len = np.linalg.norm(positions_b[src] - positions_b[idx], axis=1)
    edge_w = 1.0 / np.maximum(edge_len, 0.0025)
    w_deg = np.zeros(n, dtype=np.float64)
    np.add.at(w_deg, src, edge_w)
    w_deg = np.maximum(w_deg, 1e-8)
    scale_ref = plan.spec.height_m / 1.65

    for side_sign, lab in ((1.0, "Left"), (-1.0, "Right")):
        s_code = lab[0]
        j_clav = J[m(f"{lab}Shoulder")]
        j_arm = J[m(f"{lab}Arm")]
        j_fore = J[m(f"{lab}ForeArm")]
        j_hand = J[m(f"{lab}Hand")]

        p_clav = jb[m(f"{lab}Shoulder")]
        p_arm = jb[m(f"{lab}Arm")]
        p_fore = jb[m(f"{lab}ForeArm")]
        p_hand = jb[m(f"{lab}Hand")]

        ax = px * side_sign
        x_clav = abs(p_clav[0])
        x_arm = abs(p_arm[0])
        x_fore = abs(p_fore[0])
        x_hand = abs(p_hand[0])
        upper_len = max(x_fore - x_arm, 0.06)
        elbow_w = min(0.036 * scale_ref, upper_len * 0.24)
        wrist_w = min(0.024 * scale_ref, max(x_hand - x_fore, 0.05) * 0.24)

        arm_mask = np.isin(v_reg, [REGION_INDEX[f"upperArm.{s_code}"], REGION_INDEX[f"forearm.{s_code}"], REGION_INDEX[f"hand.{s_code}"]])
        # 핵심 해부학 3단계 경계 (Maximum Principle: fixed_one_arm ⊂ fixed_one_tot & fixed_zero_tot ⊂ fixed_zero_arm):
        # 1) s_tot(척추→어깨+팔): 삼각근 바깥(x_arm + 0.14*upper_len)에서 1.0 도달 → 이두근 원거리 레버암에 Spine2 잔여 0!
        # 2) s_arm(쇄골→상완): 상완 상단(x_arm + 0.30*upper_len)에서 1.0 도달 → Clavicle 0.25~0.35 브리지 형성 + ROI stretch <= 1.60!
        x_tot_one = min(x_arm + 0.14 * upper_len, x_fore - elbow_w - 0.024)
        x_arm_one = min(x_arm + 0.30 * upper_len, x_fore - elbow_w - 0.008)
        x_tot_one = min(x_tot_one, x_arm_one - 0.010)
        fixed_one_tot = arm_mask & (ax >= x_tot_one)
        fixed_one_arm = arm_mask & (ax >= x_arm_one)

        # 중요: fixed_zero는 절대 arm_mask를 침범하지 않는다 (male-action/sd-chibi 상완 삼각근 클램핑 원천 차단!)
        z_waist_cut = min(plan.z_waist + 0.025 * scale_ref, plan.z_chest - 0.045 * scale_ref)
        fixed_zero_tot = (~arm_mask) & (
            (ax <= x_clav * 0.28)
            | (pz >= plan.z_neck_cut - 0.005)
            | (pz <= z_waist_cut)
            | (v_reg == REGION_INDEX["head"])
        )
        # UpperArm은 목·내측 승모근(x_clav..0.42)에 절대 누설되지 않고 Clavicle(21.25°)만 부드럽게 담당!
        x_arm_zero = x_clav + 0.42 * (x_arm - x_clav)
        fixed_zero_arm = fixed_zero_tot | (
            (~arm_mask)
            & (
                (ax <= x_arm_zero)
                | (pz >= plan.z_neck_base + 0.014)
                | (pz <= plan.z_chest - 0.050 * scale_ref)
            )
        )

        # 초기 선형 시드 (수렴 가속)
        s_tot = expr.smoothstep(x_clav * 0.28, x_tot_one, ax)
        s_arm = expr.smoothstep(x_arm_zero, x_arm_one, ax)
        s_tot = np.where(fixed_one_tot, 1.0, np.where(fixed_zero_tot, 0.0, s_tot))
        s_arm = np.where(fixed_one_arm, 1.0, np.where(fixed_zero_arm, 0.0, s_arm))

        free_tot = (~fixed_one_tot) & (~fixed_zero_tot) & (counts > 0) & (is_core | arm_mask)
        free_arm = (~fixed_one_arm) & (~fixed_zero_arm) & (counts > 0) & (is_core | arm_mask)

        # 240회 1/L-가중 메트릭 조화 라플라시안 수렴 (디리클레 에너지 최소화 → ROI 최대 간선 신장률 <= 1.65 보장!)
        for _ in range(240):
            acc_t = np.zeros(n, dtype=np.float64)
            acc_a = np.zeros(n, dtype=np.float64)
            np.add.at(acc_t, src, edge_w * s_tot[idx])
            np.add.at(acc_a, src, edge_w * s_arm[idx])
            avg_t = acc_t / w_deg
            avg_a = acc_a / w_deg
            s_tot[free_tot] = 0.15 * s_tot[free_tot] + 0.85 * avg_t[free_tot]
            s_arm[free_arm] = 0.15 * s_arm[free_arm] + 0.85 * avg_a[free_arm]

        # 경계 기울기 완충(8회 1/L 평활): x_tot_one/x_arm_one 도달 직전의 C0 꺾임을 부드러운 C1 곡선으로 완화
        far_one = arm_mask & (ax >= min(x_arm + 0.42 * upper_len, x_fore - elbow_w - 0.004))
        soft_tot = (~far_one) & (~fixed_zero_tot) & (counts > 0) & (is_core | arm_mask)
        soft_arm = (~far_one) & (~fixed_zero_arm) & (counts > 0) & (is_core | arm_mask)
        for _ in range(8):
            acc_t = np.zeros(n, dtype=np.float64)
            acc_a = np.zeros(n, dtype=np.float64)
            np.add.at(acc_t, src, edge_w * s_tot[idx])
            np.add.at(acc_a, src, edge_w * s_arm[idx])
            s_tot[soft_tot] = 0.50 * s_tot[soft_tot] + 0.50 * (acc_t[soft_tot] / w_deg[soft_tot])
            s_arm[soft_arm] = 0.50 * s_arm[soft_arm] + 0.50 * (acc_a[soft_arm] / w_deg[soft_arm])

        s_tot = np.clip(s_tot, 0.0, 1.0)
        s_arm = np.clip(np.minimum(s_arm, s_tot), 0.0, 1.0)
        s_clav = np.clip(s_tot - s_arm, 0.0, 1.0)

        # 연속 팔꿈치/손목 분할 (hard overwrite 완전 제거: t_fore는 shoulder ROI에서 정확히 0.0!)
        t_fore = np.where(arm_mask, expr.smoothstep(x_fore - elbow_w, x_fore + elbow_w, ax), 0.0)
        t_hand = np.where(arm_mask, expr.smoothstep(x_hand - wrist_w, x_hand + wrist_w, ax), 0.0)

        # 적용 영역: 2본 척추 × (1 - s_tot) + Clavicle(s_clav) + UpperArm/ForeArm/Hand(s_arm 분할)
        apply_m = (s_tot > 1e-4) & (is_core | arm_mask)
        if apply_m.any():
            w[apply_m] = w_spine[apply_m] * (1.0 - s_tot[apply_m, None])
            w[apply_m, j_clav] += s_clav[apply_m]
            w[apply_m, j_arm] += s_arm[apply_m] * (1.0 - t_fore[apply_m])
            w[apply_m, j_fore] += s_arm[apply_m] * t_fore[apply_m] * (1.0 - t_hand[apply_m])
            w[apply_m, j_hand] += s_arm[apply_m] * t_fore[apply_m] * t_hand[apply_m]

        # 손가락 5개(손 영역 정점 중 손가락 본 체인 근처만 정밀 배정)
        hand_verts = np.flatnonzero(v_reg == REGION_INDEX[f"hand.{s_code}"])
        if hand_verts.size:
            h_pts = positions_b[hand_verts]
            best_dist = np.full(len(hand_verts), np.inf)
            best_f = np.full(len(hand_verts), -1, dtype=np.int64)
            f_chains: list[tuple[str, np.ndarray]] = []
            for fi, fname in enumerate(FINGERS):
                ch = np.stack([jb[m(f"{lab}Hand{fname}{seg}")] for seg in range(1, 5)], axis=0)
                f_chains.append((fname, ch))
                d_min = np.full(len(hand_verts), np.inf)
                for seg_i in range(3):
                    ds, _ = _dist_to_segment(h_pts, ch[seg_i], ch[seg_i + 1])
                    d_min = np.minimum(d_min, ds)
                better = d_min < best_dist
                best_dist[better] = d_min[better]
                best_f[better] = fi

            finger_reach = plan.spec.hand_w * 0.58
            for fi, (fname, ch) in enumerate(f_chains):
                f_dir = ch[1] - ch[0]
                f_dir = f_dir / max(np.linalg.norm(f_dir), 1e-6)
                along = (h_pts - ch[0][None, :]) @ f_dir
                sel_local = np.flatnonzero((best_f == fi) & (best_dist < finger_reach) & (along > -0.008 * scale_ref))
                if sel_local.size == 0:
                    continue
                v_ids = hand_verts[sel_local]
                bones = [J[m(f"{lab}Hand{fname}{seg}")] for seg in range(1, 4)]
                fw = skin.finger_weights(positions_b[v_ids], ch, bones, j_hand, j_count, blend=0.14)
                w[v_ids] = fw

    # --- 3) 양다리·발 체인 (Hips → UpLeg → Leg → Foot → ToeBase) ---
    for side_sign, lab in ((1.0, "Left"), (-1.0, "Right")):
        s_code = lab[0]
        j_hips = J[m("Hips")]
        j_up = J[m(f"{lab}UpLeg")]
        j_leg = J[m(f"{lab}Leg")]
        j_foot = J[m(f"{lab}Foot")]
        j_toe = J[m(f"{lab}ToeBase")]

        leg_mask = np.isin(v_reg, [REGION_INDEX[f"thigh.{s_code}"], REGION_INDEX[f"calf.{s_code}"], REGION_INDEX[f"foot.{s_code}"]])
        hip_pelvis = (v_reg == REGION_INDEX["pelvis"]) & (px * side_sign > 0.012) & (pz < plan.z_hips + 0.025 * scale_ref)
        zone = leg_mask | hip_pelvis
        if not zone.any():
            continue
        zp = pz[zone]
        yp = py[zone]
        hip_w = 0.042 * scale_ref
        knee_w = 0.032 * scale_ref
        ankle_w = 0.022 * scale_ref

        t_up = 1.0 - expr.smoothstep(plan.z_crotch - hip_w * 0.4, plan.z_hips + hip_w * 0.4, zp)
        lat = expr.smoothstep(0.008, 0.055 * scale_ref, px[zone] * side_sign)
        t_up = np.where(leg_mask[zone], np.maximum(t_up, 0.55 * lat), t_up * lat * 0.65)
        t_knee = 1.0 - expr.smoothstep(plan.z_knee - knee_w, plan.z_knee + knee_w, zp)
        t_ankle = 1.0 - expr.smoothstep(plan.z_ankle - ankle_w, plan.z_ankle + ankle_w, zp)
        y_toe_cut = float(jb[m(f"{lab}ToeBase")][1])
        t_toe = expr.smoothstep(y_toe_cut + 0.015, y_toe_cut - 0.015, yp) * t_ankle

        w_hips = 1.0 - t_up
        w_up = t_up * (1.0 - t_knee)
        w_leg = t_up * t_knee * (1.0 - t_ankle)
        w_foot = t_up * t_knee * t_ankle * (1.0 - t_toe)
        w_toe = t_up * t_knee * t_ankle * t_toe

        z_idx = np.flatnonzero(zone)
        for loc_i, vi in enumerate(z_idx):
            if leg_mask[vi]:
                w[vi, :] = 0.0
                w[vi, j_hips] = w_hips[loc_i]
                w[vi, j_up] = w_up[loc_i]
                w[vi, j_leg] = w_leg[loc_i]
                w[vi, j_foot] = w_foot[loc_i]
                w[vi, j_toe] = w_toe[loc_i]
            else:
                blend = w_up[loc_i]
                w[vi, :] *= (1.0 - blend)
                w[vi, j_up] += blend

    # 정규화 + 상위 4개 영향 제한 (어깨 ROI는 이미 <= 4본이므로 절단 절벽 0건!)
    w = np.clip(w, 0.0, None)
    s_row = w.sum(axis=1, keepdims=True)
    zero_rows = s_row[:, 0] <= 1e-8
    if zero_rows.any():
        w[zero_rows, J[m("Hips")]] = 1.0
    return skin.top_influences(w.astype(np.float32), limit=4, cutoff=0.002)


# ---------------------------------------------------------------------------
# 타원체 프록시 커스텀 안면 법선 (0.85 블렌드, 목 이음매·귀·안와·구강 마스킹)
# ---------------------------------------------------------------------------


def compute_ellipsoid_proxy_face_normals(
    head_pos_g: np.ndarray,
    head_geo_normals_g: np.ndarray,
    head_tags: np.ndarray,
    seam_pos_g: np.ndarray,
    plan: ArchetypePlan,
    blend_strength: float = 0.85,
) -> np.ndarray:
    """타원체 프록시 법선을 얼굴 전면 정점에 0.85 블렌드로 전사한다(glTF 좌표계).

    - 목 이음매에서 25mm 이내: 블렌드 0.0 (TS_Body와 비트 단위 동일 법선 보존!)
    - 귀·안와 내부·입술/구강 내부: 블렌드 0.0 (선명한 해부학 음영 유지)
    - 콧날 중앙: 블렌드 0.38 (한국 웹툰 코 옆 그림자 쐐기 선명도 유지)
    """
    s = plan.spec
    center_g = b2g(np.array([0.0, 0.008, plan.z_chin + plan.head_h * 0.52]))
    radii_g = np.array([s.head_w * 1.04, plan.head_h * 0.52, s.head_d * 1.04], dtype=np.float64)

    q = (head_pos_g - center_g[None, :]) / radii_g[None, :]
    n_proxy = q / radii_g[None, :]
    n_proxy /= np.maximum(np.linalg.norm(n_proxy, axis=1, keepdims=True), 1e-9)

    # 1) 목 이음매 보호 (seam에서 0.0)
    seam_mask = expr.seam_taper(head_pos_g, seam_pos_g, fade_start=0.012, fade_end=0.032)
    # 2) 전면 얼굴 영역 (뒤통수보다 앞얼굴에 강하게 적용)
    front_mask = expr.smoothstep(-0.02, 0.03, head_pos_g[:, 2] - center_g[2])
    # 3) 귀·안와·입술·구강 제외
    keep_geo = np.isin(head_tags, [TAG_EYE_SOCKET_L, TAG_EYE_SOCKET_R, TAG_LIP, TAG_ORAL_CAVITY, TAG_EAR_L, TAG_EAR_R])
    # 4) 콧날 보호 (코 중앙만 블렌드를 낮춰 툰 코 음영 선명화)
    nose_g = b2g(plan.nose_tip)
    eye_y_g = b2g(plan.eye_center_l)[1]
    nose_ridge = (
        np.exp(-((head_pos_g[:, 0] / max(s.nose_width * 1.15, 0.009)) ** 2))
        * expr.smoothstep(nose_g[1] - 0.012, nose_g[1] + 0.006, head_pos_g[:, 1])
        * (1.0 - expr.smoothstep(eye_y_g - 0.008, eye_y_g + 0.014, head_pos_g[:, 1]))
        * expr.smoothstep(nose_g[2] - 0.035, nose_g[2] - 0.005, head_pos_g[:, 2])
    )
    alpha = blend_strength * seam_mask * (0.25 + 0.75 * front_mask) * (1.0 - 0.55 * nose_ridge)
    alpha = np.where(keep_geo, 0.0, alpha)

    blended = (1.0 - alpha[:, None]) * head_geo_normals_g + alpha[:, None] * n_proxy
    blended /= np.maximum(np.linalg.norm(blended, axis=1, keepdims=True), 1e-9)
    return blended


# ---------------------------------------------------------------------------
# 입체 6층 눈 (공막 + 오목 홍채 + 캐치라이트 + 입체 속눈썹 + 0.7mm BVH 스냅 눈썹) & 구강
# ---------------------------------------------------------------------------


def _make_quad_sphere(center: np.ndarray, radius: float, segs: int = 8) -> tuple[np.ndarray, np.ndarray]:
    """큐브 투영 올-쿼드 구(극점 핀치 없음, 6*segs*segs 쿼드, segs=8 -> 386 verts)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=segs - 1, use_grid_fill=True)
    for v in bm.verts:
        d = v.co.normalized()
        v.co = Vector(center.tolist()) + d * radius
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.verts.ensure_lookup_table()
    pts = np.array([list(v.co) for v in bm.verts], dtype=np.float64)
    tris: list[list[int]] = []
    for f in bm.faces:
        vs = [v.index for v in f.verts]
        tris.append([vs[0], vs[1], vs[2]])
        if len(vs) == 4:
            tris.append([vs[0], vs[2], vs[3]])
    bm.free()
    return pts, np.array(tris, dtype=np.int64)


def build_eye_6layer_eyeball(plan: ArchetypePlan, side: str) -> dict[str, Any]:
    """`TS_Eye_L` / `TS_Eye_R`: 공막(Layer 2) + 오목 홍채 디스크(Layer 3) + 3D 캐치라이트(Layer 4).

    3개 층을 단일 재질 `ts_eye_sclera` 아틀라스 UV로 통합하고, 전 정점을 `TS_Eye.L/R` 100% 스키닝한다.
    정점 수 ~580 verts/eye (>= 200 verts/eye 요구 충족).
    """
    s = plan.spec
    ec = plan.eye_center_l if side == "L" else plan.eye_center_r
    r_eye = plan.eye_radius
    r_iris = r_eye * s.iris_ratio

    parts_pos: list[np.ndarray] = []
    parts_tri: list[np.ndarray] = []
    parts_uv: list[np.ndarray] = []

    # Layer 2: 공막(Sclera) 큐브 투영 쿼드 구 (386 verts, 폐곡면 0-defect)
    # 전방 홍채 개구부(rho < r_iris)는 안쪽으로 2.4mm 오목하게 밀어 넣어 오목 홍채 디스크가 공막에 절대 가려지지 않게 한다!
    sc_pts, sc_tri = _make_quad_sphere(ec, r_eye, segs=8)
    rel_s = sc_pts - ec[None, :]
    rho_front = np.hypot(rel_s[:, 0], rel_s[:, 2])
    front_eye = rel_s[:, 1] < -0.25 * r_eye
    iris_pocket = front_eye * (1.0 - expr.smoothstep(r_iris * 0.88, r_iris * 1.06, rho_front))
    sc_pts[:, 1] += iris_pocket * (r_eye * 0.24)
    # 좌반 아틀라스 u in [0.03, 0.47], v in [0.04, 0.96]
    sc_u = 0.25 + 0.21 * np.clip(rel_s[:, 0] / max(r_eye, 1e-5), -1.0, 1.0)
    sc_v = 0.50 - 0.44 * np.clip(rel_s[:, 2] / max(r_eye, 1e-5), -1.0, 1.0)
    parts_pos.append(sc_pts)
    parts_tri.append(sc_tri)
    parts_uv.append(np.stack([sc_u, sc_v], axis=1))

    # Layer 3: 오목 홍채 디스크(Concave Iris Dish — 공막 앞 포켓 안에 완전히 노출, 바깥 림 +0.25mm, 중앙 오목 1.2mm!)
    bm = bmesh.new()
    n_ang = 24
    n_rad = 4
    front_rings: list[list[bmesh.types.BMVert]] = []
    back_rings: list[list[bmesh.types.BMVert]] = []
    # 앞쪽 오목 접시 + 뒤쪽 닫힌 뒷판 (폐곡면 manifold!)
    y_rim = ec[1] - math.sqrt(max(1e-8, r_eye * r_eye - r_iris * r_iris)) - 0.00025
    c_front = bm.verts.new((ec[0], y_rim + r_eye * 0.10, ec[2]))
    c_back = bm.verts.new((ec[0], c_front.co.y + 0.0008, ec[2]))
    for ri in range(1, n_rad + 1):
        rho = ri / n_rad  # 0..1
        rad = r_iris * rho
        # 가장자리(rho=1)는 y_rim, 중앙(rho=0)은 r_eye*0.10 만큼 오목한 보석 접시!
        concave_dip = (1.0 - rho * rho) * (r_eye * 0.10)
        y_f = y_rim + concave_dip
        y_b = y_f + 0.0008
        f_ring, b_ring = [], []
        for ai in range(n_ang):
            a = 2.0 * math.pi * (ai / n_ang)
            vx = ec[0] + rad * math.cos(a)
            vz = ec[2] + rad * math.sin(a)
            f_ring.append(bm.verts.new((vx, y_f, vz)))
            b_ring.append(bm.verts.new((vx, y_b, vz)))
        front_rings.append(f_ring)
        back_rings.append(b_ring)

    # 앞면 부채꼴 + 동심 링 + 뒷면 + 외곽 림 (100% 폐곡면!)
    for ai in range(n_ang):
        an = (ai + 1) % n_ang
        bm.faces.new((c_front, front_rings[0][ai], front_rings[0][an]))
        bm.faces.new((c_back, back_rings[0][an], back_rings[0][ai]))
    for ri in range(n_rad - 1):
        for ai in range(n_ang):
            an = (ai + 1) % n_ang
            bm.faces.new((front_rings[ri][ai], front_rings[ri + 1][ai], front_rings[ri + 1][an], front_rings[ri][an]))
            bm.faces.new((back_rings[ri][ai], back_rings[ri][an], back_rings[ri + 1][an], back_rings[ri + 1][ai]))
    for ai in range(n_ang):
        an = (ai + 1) % n_ang
        bm.faces.new((front_rings[-1][ai], back_rings[-1][ai], back_rings[-1][an], front_rings[-1][an]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.verts.ensure_lookup_table()
    ir_pts = np.array([list(v.co) for v in bm.verts], dtype=np.float64)
    ir_tris: list[list[int]] = []
    for f in bm.faces:
        vs = [v.index for v in f.verts]
        ir_tris.append([vs[0], vs[1], vs[2]])
        if len(vs) == 4:
            ir_tris.append([vs[0], vs[2], vs[3]])
    bm.free()
    # 우상단 사분면 아틀라스 u in [0.53, 0.97], v in [0.03, 0.47]
    ir_rel = ir_pts - ec[None, :]
    ir_u = 0.75 + 0.21 * np.clip(ir_rel[:, 0] / max(r_iris, 1e-5), -1.0, 1.0)
    ir_v = 0.25 - 0.21 * np.clip(ir_rel[:, 2] / max(r_iris, 1e-5), -1.0, 1.0)
    parts_pos.append(ir_pts)
    parts_tri.append(np.array(ir_tris, dtype=np.int64))
    parts_uv.append(np.stack([ir_u, ir_v], axis=1))

    # Layer 4: 3D 캐치라이트 보석 2개 (주 상단 + 보조 하단, 닫힌 타원 렌즈)
    catch_specs = (
        (-0.34, +0.34, 0.24, 0.19),  # 주 캐치라이트 (관찰자 기준 좌상단)
        (+0.30, -0.32, 0.11, 0.10),  # 보조 스파클
    )
    for ox, oz, rx_f, rz_f in catch_specs:
        cx = ec[0] + ox * r_iris
        cz = ec[2] + oz * r_iris
        rad_xy = math.hypot(cx - ec[0], cz - ec[2])
        cy = ec[1] - math.sqrt(max(1e-8, r_eye * r_eye - min(rad_xy, r_eye * 0.95) ** 2)) - 0.00055
        hl_pts, hl_tri = _make_quad_sphere(np.array([0.0, 0.0, 0.0]), 1.0, segs=2)
        hl_pts[:, 0] = cx + hl_pts[:, 0] * (r_iris * rx_f)
        hl_pts[:, 1] = cy + hl_pts[:, 1] * 0.00035
        hl_pts[:, 2] = cz + hl_pts[:, 2] * (r_iris * rz_f)
        # 우하단 사분면 순백 아틀라스 u in [0.58, 0.92], v in [0.58, 0.92]
        hl_u = 0.75 + 0.12 * np.clip((hl_pts[:, 0] - cx) / max(r_iris * rx_f, 1e-5), -1.0, 1.0)
        hl_v = 0.75 - 0.12 * np.clip((hl_pts[:, 2] - cz) / max(r_iris * rz_f, 1e-5), -1.0, 1.0)
        parts_pos.append(hl_pts)
        parts_tri.append(hl_tri)
        parts_uv.append(np.stack([hl_u, hl_v], axis=1))

    # 합치기 + glTF 좌표 변환
    offset = 0
    tris_all = []
    for p, t in zip(parts_pos, parts_tri):
        tris_all.append(t + offset)
        offset += len(p)
    pos_b = np.concatenate(parts_pos, axis=0)
    tris = np.concatenate(tris_all, axis=0)
    uv = np.concatenate(parts_uv, axis=0).astype(np.float32)
    pos_g = b2g(pos_b)
    nrm_g = vertex_normals(pos_g, tris)

    eye_joint = JOINT_INDEX[f"TS_Eye.{side}"]
    joints = np.zeros((len(pos_g), 4), dtype=np.uint8)
    joints[:, 0] = eye_joint
    weights = np.zeros((len(pos_g), 4), dtype=np.float32)
    weights[:, 0] = 1.0
    assert len(pos_g) >= 200, f"TS_Eye.{side} 정점 수 부족: {len(pos_g)}"
    return {
        "positions": pos_g,
        "triangles": tris,
        "normals": nrm_g,
        "uv": uv,
        "joints": joints,
        "weights": weights,
        "vertexCount": len(pos_g),
    }


def _build_closed_ribbon_tube(
    spine_pts: np.ndarray,
    normals_out: np.ndarray,
    up_vecs: np.ndarray,
    half_widths: np.ndarray,
    thicknesses: np.ndarray,
    u_range: tuple[float, float],
    v_range: tuple[float, float],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """곡선(M,3)을 따라 6-세그먼트 폐곡면 3D 리본 튜브(0-defect)를 생성한다."""
    bm = bmesh.new()
    m = len(spine_pts)
    n_prof = 6
    rings: list[list[bmesh.types.BMVert]] = []
    ring_uv_t: list[float] = []
    for i in range(m):
        c = Vector(spine_pts[i].tolist())
        nout = Vector(normals_out[i].tolist()).normalized()
        upv = Vector(up_vecs[i].tolist()).normalized()
        hw = float(half_widths[i])
        th = float(thicknesses[i])
        ring: list[bmesh.types.BMVert] = []
        for k in range(n_prof):
            ang = 2.0 * math.pi * (k / n_prof)
            # 단면: upv 방향으로 폭(hw), nout 방향으로 두께(0..th)
            pt = c + upv * (hw * math.cos(ang)) + nout * (th * (0.5 + 0.5 * math.sin(ang)))
            ring.append(bm.verts.new(pt))
        rings.append(ring)
        ring_uv_t.append(i / max(m - 1, 1))

    for i in range(m - 1):
        for k in range(n_prof):
            kn = (k + 1) % n_prof
            bm.faces.new((rings[i][k], rings[i][kn], rings[i + 1][kn], rings[i + 1][k]))
    # 양 끝단 2-쿼드 올-쿼드 마감
    bm.faces.new((rings[0][3], rings[0][2], rings[0][1], rings[0][0]))
    bm.faces.new((rings[0][0], rings[0][5], rings[0][4], rings[0][3]))
    bm.faces.new((rings[-1][0], rings[-1][1], rings[-1][2], rings[-1][3]))
    bm.faces.new((rings[-1][3], rings[-1][4], rings[-1][5], rings[-1][0]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.verts.ensure_lookup_table()
    pts = np.array([list(v.co) for v in bm.verts], dtype=np.float64)
    tris: list[list[int]] = []
    for f in bm.faces:
        vs = [v.index for v in f.verts]
        tris.append([vs[0], vs[1], vs[2]])
        if len(vs) == 4:
            tris.append([vs[0], vs[2], vs[3]])
    bm.free()
    # 깔끔한 2D UV 매핑 (u_range, v_range 범위 내)
    uv = np.zeros((len(pts), 2), dtype=np.float32)
    for i in range(m):
        u_val = u_range[0] + (u_range[1] - u_range[0]) * ring_uv_t[i]
        for k in range(n_prof):
            v_val = v_range[0] + (v_range[1] - v_range[0]) * (k / (n_prof - 1))
            uv[i * n_prof + k] = (u_val, v_val)
    return pts, np.array(tris, dtype=np.int64), uv


def build_3d_lashes_and_brows(
    plan: ArchetypePlan,
    head_pos_b: np.ndarray,
    head_tris: np.ndarray,
    head_joints: np.ndarray,
    head_weights: np.ndarray,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Layer 5 입체 3D 속눈썹(`TS_Lashes`) + Layer 6 0.7mm BVH 스냅 눈썹(`TS_Brow_L`, `TS_Brow_R`)."""
    s = plan.spec
    bvh = BVHTree.FromPolygons(head_pos_b.tolist(), head_tris.tolist())
    head_joint = JOINT_INDEX[f"{MIXAMO}Head"]

    def make_head_skin(n: int) -> tuple[np.ndarray, np.ndarray]:
        jj = np.zeros((n, 4), dtype=np.uint8)
        jj[:, 0] = head_joint
        ww = np.zeros((n, 4), dtype=np.float32)
        ww[:, 0] = 1.0
        return jj, ww

    # --- Layer 5: 입체 3D 아이라인 속눈썹 (양안 상·하단 합쳐 TS_Lashes — 두상 곡률 + 외측 뺨 BVH 밀착!) ---
    lash_pts_list, lash_tri_list, lash_uv_list = [], [], []
    for side_sign, side in ((1.0, "L"), (-1.0, "R")):
        ec = plan.eye_center_l if side == "L" else plan.eye_center_r
        r_e = plan.eye_radius
        ew = plan.eye_open_w * 0.48
        eh = plan.eye_open_h * 0.50
        r_wrap = max(r_e * 1.06, ew * 1.24)
        y_front = ec[1] - r_e * 1.02 - 0.0005
        y_wrap_c = y_front + r_wrap
        max_lash_x = s.head_w * 0.85

        def _lash_y(x_val: float, z_val: float, u_x_val: float) -> float:
            dx_c = x_val - ec[0]
            dz_c = z_val - ec[2]
            r2 = min(dx_c * dx_c + dz_c * dz_c, (r_wrap * 0.90) ** 2)
            y_val = y_wrap_c - math.sqrt(max(1e-7, r_wrap * r_wrap - r2))
            if u_x_val > 0.42:
                hit, _, _, _ = bvh.ray_cast(Vector((x_val, -0.40, z_val)), Vector((0.0, 1.0, 0.0)), 0.80)
                if hit is not None and hit.y < ec[1] + r_e * 0.25 and hit.y > y_val + 0.0012:
                    y_val = hit.y - 0.0011
            return y_val

        # 윗속눈썹 아치 (안쪽 눈초리 t=0 → 바깥 날개 t=1)
        m = 16
        ts = np.linspace(0.0, 1.0, m)
        pts_u = np.zeros((m, 3), dtype=np.float64)
        nrm_u = np.zeros((m, 3), dtype=np.float64)
        up_u = np.zeros((m, 3), dtype=np.float64)
        hw_u = np.zeros(m, dtype=np.float64)
        th_u = np.zeros(m, dtype=np.float64)
        for i, t in enumerate(ts):
            u_x = -0.88 + 1.84 * t  # 바깥 눈꼬리가 뺨 실루엣을 절대 벗어나지 않도록 정밀 억제
            x = ec[0] + side_sign * ew * u_x
            if abs(x) > max_lash_x:
                x = math.copysign(max_lash_x, x)
            arch = max(0.02, 1.0 - 0.88 * (u_x * u_x))
            wing_lift = 0.0013 * s.lash_wing * max(0.0, (t - 0.78) / 0.22) ** 1.5
            z = ec[2] + eh * 0.96 * arch + wing_lift
            y_eye = _lash_y(x, z, u_x)
            pts_u[i] = (x, y_eye, z)
            nrm_u[i] = (side_sign * 0.20 * u_x, -0.95, 0.22)
            up_u[i] = (0.0, -0.15, 0.98)
            taper = math.sin(min(1.0, t * 1.15) * math.pi * 0.5) * (1.0 - 0.56 * max(0.0, (t - 0.80) / 0.20))
            hw_u[i] = max(0.00035, (0.0008 + 0.0010 * t) * s.lash_wing * taper)
            th_u[i] = max(0.0004, (0.00075 + 0.0009 * t) * s.lash_wing * taper)

        p1, t1, uv1 = _build_closed_ribbon_tube(pts_u, nrm_u, up_u, hw_u, th_u, (0.04, 0.46), (0.06, 0.94))
        lash_pts_list.append(p1)
        lash_tri_list.append(t1)
        lash_uv_list.append(uv1)

        # 아랫속눈썹 바깥 1/3 포인트 액센트
        m2 = 8
        ts2 = np.linspace(0.45, 0.95, m2)
        pts_l = np.zeros((m2, 3), dtype=np.float64)
        nrm_l = np.zeros((m2, 3), dtype=np.float64)
        up_l = np.zeros((m2, 3), dtype=np.float64)
        hw_l = np.zeros(m2, dtype=np.float64)
        th_l = np.zeros(m2, dtype=np.float64)
        for i, t in enumerate(ts2):
            u_x = -0.86 + 1.80 * t
            x = ec[0] + side_sign * ew * u_x
            if abs(x) > max_lash_x:
                x = math.copysign(max_lash_x, x)
            arch = max(0.10, 1.0 - 0.62 * (u_x * u_x))
            z = ec[2] - eh * 0.78 * arch
            y_eye = _lash_y(x, z, u_x) + 0.0003
            pts_l[i] = (x, y_eye, z)
            nrm_l[i] = (side_sign * 0.18 * u_x, -0.95, -0.20)
            up_l[i] = (0.0, 0.12, 0.99)
            env = math.sin(((t - 0.45) / 0.50) * math.pi)
            hw_l[i] = max(0.00035, 0.00080 * s.lash_wing * env)
            th_l[i] = max(0.00035, 0.00070 * s.lash_wing * env)
        p2, t2, uv2 = _build_closed_ribbon_tube(pts_l, nrm_l, up_l, hw_l, th_l, (0.04, 0.46), (0.06, 0.94))
        lash_pts_list.append(p2)
        lash_tri_list.append(t2)
        lash_uv_list.append(uv2)

    off = 0
    ltris = []
    for p, t in zip(lash_pts_list, lash_tri_list):
        ltris.append(t + off)
        off += len(p)
    lash_pos_g = b2g(np.concatenate(lash_pts_list, axis=0))
    lash_tri = np.concatenate(ltris, axis=0)
    lash_uv = np.concatenate(lash_uv_list, axis=0).astype(np.float32)
    lj, lw = make_head_skin(len(lash_pos_g))
    lashes_dict = {
        "positions": lash_pos_g,
        "triangles": lash_tri,
        "normals": vertex_normals(lash_pos_g, lash_tri),
        "uv": lash_uv,
        "joints": lj,
        "weights": lw,
    }

    # --- Layer 6: 0.7mm BVH 스냅 입체 눈썹 (TS_Brow_L, TS_Brow_R) ---
    brows: list[dict[str, Any]] = []
    BROW_SNAP_OFFSET_M = 0.0007  # 계약 정확히 0.7 mm 피부 스냅!
    for side_sign, side in ((1.0, "L"), (-1.0, "R")):
        ec = plan.eye_center_l if side == "L" else plan.eye_center_r
        ec_x = abs(float(ec[0]))
        # 미간 여백(최소 ec_x*0.36)을 강제해 SD 치비 포함 5종 모두 눈썹 중앙 붙음(일자눈썹) 원천 방지!
        x_in = max(ec_x * 0.36, ec_x - plan.eye_open_w * 0.46)
        x_out = min(s.head_w * 0.90, ec_x + plan.eye_open_w * 0.56)
        m_b = 14
        ts = np.linspace(0.0, 1.0, m_b)
        pts_b = np.zeros((m_b, 3), dtype=np.float64)
        nrm_b = np.zeros((m_b, 3), dtype=np.float64)
        up_b = np.zeros((m_b, 3), dtype=np.float64)
        hw_b = np.zeros(m_b, dtype=np.float64)
        th_b = np.zeros(m_b, dtype=np.float64)
        for i, t in enumerate(ts):
            x = side_sign * (x_in + (x_out - x_in) * t)
            # 자연스러운 눈썹 아치(안쪽 낮고 65% 지점 정점 → 꼬리 살짝 하강)
            arch = math.sin(t * math.pi * 0.92) * s.brow_arch + 0.0012 * t
            z = plan.z_brow + arch
            # 전방(-Y)에서 머리 표면으로 광선 투영 → 정확히 0.7mm 바깥 스냅!
            ray_orig = Vector((x, -0.40, z))
            ray_dir = Vector((0.0, 1.0, 0.0))
            hit, hit_n, _, _ = bvh.ray_cast(ray_orig, ray_dir, 0.80)
            if hit is None or hit_n is None:
                hit, hit_n, _, _ = bvh.find_nearest(Vector((x, ec[1] - plan.eye_radius, z)))
            n_out = hit_n.normalized() if hit_n is not None and hit_n.length > 1e-6 else Vector((0.0, -1.0, 0.0))
            if n_out.y > 0.0:
                n_out = -n_out
            pts_b[i] = tuple(hit + n_out * BROW_SNAP_OFFSET_M)
            nrm_b[i] = tuple(n_out)
            up_b[i] = (0.0, 0.0, 1.0)
            # 눈썹 머리 부드러운 시작 → 도톰한 본체 → 꼬리 날렵 테이퍼
            profile = (0.62 + 0.38 * math.sin(min(1.0, t * 3.0) * math.pi * 0.5)) * (1.0 - 0.72 * (t ** 1.6))
            hw_b[i] = max(0.0005, s.brow_thick * 0.52 * profile)
            th_b[i] = max(0.00045, 0.00072 * profile)

        bp, bt_arr, buv = _build_closed_ribbon_tube(pts_b, nrm_b, up_b, hw_b, th_b, (0.54, 0.96), (0.06, 0.94))
        bp_g = b2g(bp)
        bj, bw = make_head_skin(len(bp_g))
        brows.append(
            {
                "positions": bp_g,
                "triangles": bt_arr,
                "normals": vertex_normals(bp_g, bt_arr),
                "uv": buv,
                "joints": bj,
                "weights": bw,
            }
        )

    return lashes_dict, brows[0], brows[1]


def build_3d_mouth_interior(plan: ArchetypePlan, head_pos_b: np.ndarray, head_tags: np.ndarray) -> dict[str, Any]:
    """`TS_Mouth`: 닫힌 3D 윗니·아랫니·잇몸·혀 (단일 재질 `ts_mouth_inner` 3구역 아틀라스).

    실제 서브서프 후 입술 전면/내면 좌표를 계측해 닫힌 입술 뒤 7mm 안쪽 구강 주머니에 정확히 안착시킨다(입술 돌출 0건!).
    """
    s = plan.spec
    mc = plan.mouth_center.copy()
    # 실제 헤드 입술/구강 정점에서 입술 뒷면 Y 좌표 계측 (+Y = 머리 안쪽)
    lip_pts = head_pos_b[head_tags == TAG_LIP]
    cav_pts = head_pos_b[head_tags == TAG_ORAL_CAVITY]
    if len(lip_pts) > 0:
        y_lip_inner = float(np.quantile(lip_pts[:, 1], 0.85))
        mc[2] = float(lip_pts[:, 2].mean())
    else:
        y_lip_inner = float(mc[1] + 0.008)
    if len(cav_pts) > 0:
        y_cav_mid = float(np.quantile(cav_pts[:, 1], 0.55))
        y_teeth_front = max(y_lip_inner + 0.0115, y_cav_mid + 0.001)
    else:
        y_teeth_front = y_lip_inner + 0.013

    mw = s.mouth_half_w * 0.68
    depth = max(0.011, plan.head_h * 0.070)
    head_j = JOINT_INDEX[f"{MIXAMO}Head"]
    jaw_j = JOINT_INDEX["TS_Jaw"]

    parts_pos, parts_tri, parts_uv = [], [], []
    is_lower_flags, is_tongue_flags = [], []
    skin_j_list = []

    def _arch_strip(z_c: float, half_h: float, thick: float, u_rng: tuple[float, float], v_rng: tuple[float, float]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        m = 13
        ts = np.linspace(-1.0, 1.0, m)
        pts = np.zeros((m, 3), dtype=np.float64)
        nrm = np.zeros((m, 3), dtype=np.float64)
        up = np.zeros((m, 3), dtype=np.float64)
        hw = np.full(m, half_h, dtype=np.float64)
        th = np.full(m, thick, dtype=np.float64)
        for i, u in enumerate(ts):
            ang = u * 1.10
            x = mw * math.sin(ang)
            y = y_teeth_front + depth * (1.0 - math.cos(ang))
            pts[i] = (x, y, z_c)
            nrm[i] = (math.sin(ang), -math.cos(ang), 0.0)
            up[i] = (0.0, 0.0, 1.0)
        return _build_closed_ribbon_tube(pts, nrm, up, hw, th, u_rng, v_rng)

    # 1) 윗니 + 윗잇몸 (u in [0.03, 0.30] 상아색 치아)
    th_h = max(0.0019, plan.head_h * 0.011)
    p_ut, t_ut, uv_ut = _arch_strip(mc[2] + th_h * 1.05, th_h, 0.0018, (0.03, 0.30), (0.08, 0.92))
    parts_pos.append(p_ut); parts_tri.append(t_ut); parts_uv.append(uv_ut)
    is_lower_flags.append(np.zeros(len(p_ut), dtype=bool))
    is_tongue_flags.append(np.zeros(len(p_ut), dtype=bool))
    skin_j_list.append(np.full(len(p_ut), head_j, dtype=np.uint8))

    # 2) 아랫니 + 아랫잇몸
    p_lt, t_lt, uv_lt = _arch_strip(mc[2] - th_h * 1.05, th_h * 0.90, 0.0018, (0.03, 0.30), (0.08, 0.92))
    parts_pos.append(p_lt); parts_tri.append(t_lt); parts_uv.append(uv_lt)
    is_lower_flags.append(np.ones(len(p_lt), dtype=bool))
    is_tongue_flags.append(np.zeros(len(p_lt), dtype=bool))
    skin_j_list.append(np.full(len(p_lt), jaw_j, dtype=np.uint8))

    # 3) 입체 3D 혀 (u in [0.68, 0.96] 장밋빛 혀 아틀라스)
    tg_pts, tg_tri = _make_quad_sphere(np.array([0.0, 0.0, 0.0]), 1.0, segs=4)
    tg_pts[:, 0] *= mw * 0.56
    tg_pts[:, 1] = y_teeth_front + 0.009 + tg_pts[:, 1] * (depth * 0.65)
    tg_pts[:, 2] = mc[2] - th_h * 1.35 + tg_pts[:, 2] * (th_h * 0.85)
    tg_u = 0.82 + 0.13 * np.clip(tg_pts[:, 0] / max(mw * 0.60, 1e-4), -1.0, 1.0)
    tg_v = 0.50 + 0.42 * np.clip((tg_pts[:, 1] - (y_teeth_front + 0.009)) / max(depth * 0.70, 1e-4), -1.0, 1.0)
    parts_pos.append(tg_pts); parts_tri.append(tg_tri); parts_uv.append(np.stack([tg_u, tg_v], axis=1))
    is_lower_flags.append(np.ones(len(tg_pts), dtype=bool))
    is_tongue_flags.append(np.ones(len(tg_pts), dtype=bool))
    skin_j_list.append(np.full(len(tg_pts), jaw_j, dtype=np.uint8))

    off = 0
    tris_all = []
    for p, t in zip(parts_pos, parts_tri):
        tris_all.append(t + off)
        off += len(p)
    pos_g = b2g(np.concatenate(parts_pos, axis=0))
    tris = np.concatenate(tris_all, axis=0)
    uv = np.concatenate(parts_uv, axis=0).astype(np.float32)
    j_arr = np.zeros((len(pos_g), 4), dtype=np.uint8)
    j_arr[:, 0] = np.concatenate(skin_j_list)
    w_arr = np.zeros((len(pos_g), 4), dtype=np.float32)
    w_arr[:, 0] = 1.0
    return {
        "positions": pos_g,
        "triangles": tris,
        "normals": vertex_normals(pos_g, tris),
        "uv": uv,
        "joints": j_arr,
        "weights": w_arr,
        "is_lower": np.concatenate(is_lower_flags),
        "is_tongue": np.concatenate(is_tongue_flags),
    }


# ---------------------------------------------------------------------------
# UV 전개 (아일랜드 마진 >= 0.015, 겹침 < 0.002) & 5종 절차 텍스처(JPEG, 무PIL)
# ---------------------------------------------------------------------------


def unwrap_mesh_clean(
    positions_g: np.ndarray,
    quads: np.ndarray,
    margin: float = 0.018,
    angles: tuple[float, ...] = (60.0, 48.0, 38.0, 28.0),
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """`uvtools.unwrap_and_pack` 기반 비중첩 UV 전개(마진 >= 0.018, [0,1] 엄수)."""
    best = None
    best_overlap = 1.0
    for ang in angles:
        raw = uvtools.unwrap_quads(positions_g, quads, angle_limit_deg=ang)
        origin, uv, inv = uvtools.split_by_uv(quads, raw)
        new_quads = inv.reshape(-1, 4)
        packed = uvtools.pack_uv_islands(uv, new_quads, margin=margin, allow_rotation=True)
        tris = np.concatenate([new_quads[:, [0, 1, 2]], new_quads[:, [0, 2, 3]]], axis=0)
        ov, _, _ = uvtools.overlap_ratio(packed, tris, 512)
        if ov < best_overlap:
            best_overlap = ov
            best = (origin, packed, new_quads)
        if ov <= 0.0005:
            break
    assert best is not None
    origin, packed, new_quads = best
    packed = np.clip(packed, 0.002, 0.998).astype(np.float32)
    return origin, packed, new_quads, float(best_overlap)


def encode_baseline_jpeg_bpy(image_rgb: np.ndarray, quality: int = 90) -> bytes:
    """float32 (H,W,3) sRGB [0,1] → 베이스라인 JPEG 바이트 (PIL 불필요, Blender 5.3 내장 인코더)."""
    h, w, _ = image_rgb.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    # glTF v=0(상단) ↔ Blender 이미지 하단 기준 반전 보정
    rgba[..., :3] = np.clip(image_rgb[::-1], 0.0, 1.0)
    img = bpy.data.images.new("_ts_jpg_tmp", width=w, height=h, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.ravel())

    scene = bpy.context.scene
    old_vt = scene.view_settings.view_transform
    old_look = scene.view_settings.look
    old_fmt = scene.render.image_settings.file_format
    old_cm = scene.render.image_settings.color_mode
    old_q = scene.render.image_settings.quality
    try:
        scene.view_settings.view_transform = "Raw"
        scene.view_settings.look = "None"
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.color_mode = "RGB"
        scene.render.image_settings.quality = quality
        with tempfile.TemporaryDirectory() as tmp:
            p = os.path.join(tmp, "tex.jpg")
            img.save_render(p, scene=scene)
            data = Path(p).read_bytes()
    finally:
        scene.view_settings.view_transform = old_vt
        scene.view_settings.look = old_look
        scene.render.image_settings.file_format = old_fmt
        scene.render.image_settings.color_mode = old_cm
        scene.render.image_settings.quality = old_q
        bpy.data.images.remove(img)
    return data


def _dilate_fill(image: np.ndarray, cov: np.ndarray, iters: int = 6) -> tuple[np.ndarray, np.ndarray]:
    col = image.copy()
    mask = cov > 0.5
    for _ in range(iters):
        acc = np.zeros_like(col)
        cnt = np.zeros(mask.shape, dtype=np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                sm = np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
                sc = np.roll(np.roll(col, dy, axis=0), dx, axis=1)
                acc += sc * sm[..., None]
                cnt += sm
        fill = (~mask) & (cnt > 0)
        col[fill] = acc[fill] / cnt[fill][:, None]
        mask = mask | fill
    return col, mask.astype(np.float32)


def _gauss_blur(image: np.ndarray, sigma: float = 1.1) -> np.ndarray:
    radius = max(1, int(math.ceil(3.0 * sigma)))
    k = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    k /= k.sum()
    out = image.astype(np.float32)
    for axis in (0, 1):
        pad = np.pad(out, [(radius, radius) if a == axis else (0, 0) for a in range(out.ndim)], mode="edge")
        acc = np.zeros_like(out)
        for i, w in enumerate(k):
            sl = [slice(None)] * out.ndim
            sl[axis] = slice(i, i + out.shape[axis])
            acc += w * pad[tuple(sl)]
        out = acc
    return out


def bake_head_skin_texture(
    plan: ArchetypePlan,
    head_pos_b: np.ndarray,
    head_tags: np.ndarray,
    head_uv: np.ndarray,
    head_tris: np.ndarray,
    size: int = 1024,
) -> bytes:
    """3D 랜드마크 정밀 연동 한국 웹툰 두상 피부 텍스처(ts_skin_head, 휘도 >= 0.82)."""
    s = plan.spec
    skin = np.array(_hex_rgb(s.skin_hex), dtype=np.float32)
    blush = np.array(_hex_rgb(s.blush_hex), dtype=np.float32)
    lip = np.array(_hex_rgb(s.lip_hex), dtype=np.float32)
    shade = skin * np.array([0.92, 0.85, 0.83], dtype=np.float32)
    cavity = np.array([0.32, 0.12, 0.15], dtype=np.float32)

    n = len(head_pos_b)
    vcol = np.tile(skin, (n, 1))
    px, py, pz = head_pos_b[:, 0], head_pos_b[:, 1], head_pos_b[:, 2]
    front = expr.smoothstep(0.02, -0.02, py)

    # 1) 에어브러시 한국 웹툰 볼 홍조 (눈 아래 바깥쪽)
    ey_l = plan.eye_center_l
    cheek_z = plan.z_eye - plan.head_h * 0.145
    cheek_x = ey_l[0] * 1.15
    blush_str = 0.24 if s.archetype_id in ("female-romance", "youth-academy", "sd-chibi") else 0.10
    for sx in (+1.0, -1.0):
        d2 = ((px - sx * cheek_x) / (s.head_w * 0.34)) ** 2 + ((pz - cheek_z) / (plan.head_h * 0.095)) ** 2
        w_b = np.exp(-d2 * 1.5) * front * blush_str
        vcol = vcol * (1.0 - w_b[:, None]) + blush * w_b[:, None]

    # 2) 코 옆 부드러운 그림자 & 코끝 아래 미세 음영(정면·3/4 가독성)
    nose_b = plan.nose_tip
    d_n = ((px - 0.004) / max(s.nose_width * 0.78, 0.007)) ** 2 + ((pz - (nose_b[2] + 0.006)) / (plan.head_h * 0.060)) ** 2
    d_n_under = (px / max(s.nose_width * 0.72, 0.006)) ** 2 + ((pz - (nose_b[2] - 0.0045)) / (plan.head_h * 0.016)) ** 2
    w_n = np.clip(np.exp(-d_n * 1.6) * 0.34 + np.exp(-d_n_under * 1.8) * 0.44, 0.0, 0.52) * front
    vcol = vcol * (1.0 - w_n[:, None]) + shade * w_n[:, None]

    # 3) 쌍꺼풀/안와 상단 미세 음영
    for sx in (+1.0, -1.0):
        ec = plan.eye_center_l if sx > 0 else plan.eye_center_r
        dc = ((px - ec[0]) / (plan.eye_open_w * 0.56)) ** 2 + ((pz - (ec[2] + plan.eye_open_h * 0.64)) / (plan.head_h * 0.016)) ** 2
        w_c = np.exp(-dc * 1.8) * front * 0.28
        vcol = vcol * (1.0 - w_c[:, None]) + shade * w_c[:, None]

    # 4) 한국 웹툰 그라데이션 입술(TAG_LIP) + 섬세한 미소 입선 + 구강 내부(TAG_ORAL_CAVITY)
    lip_mask = (head_tags == TAG_LIP).astype(np.float32) * (0.50 if s.archetype_id in ("female-romance", "youth-academy", "sd-chibi") else 0.26)
    vcol = vcol * (1.0 - lip_mask[:, None]) + lip * lip_mask[:, None]
    lip_line_c = lip * np.array([0.70, 0.52, 0.55], dtype=np.float32)
    lip_seam = (
        np.exp(-(((pz - plan.z_mouth) / max(plan.head_h * 0.0055, 0.0012)) ** 2))
        * np.exp(-((px / max(s.mouth_half_w * 0.88, 0.009)) ** 2))
        * front
        * 0.52
    ).astype(np.float32)
    vcol = vcol * (1.0 - lip_seam[:, None]) + lip_line_c * lip_seam[:, None]
    cav_depth = expr.smoothstep(float(plan.mouth_center[1]) + 0.0085, float(plan.mouth_center[1]) + 0.016, py)
    cav_mask = ((head_tags == TAG_ORAL_CAVITY).astype(np.float32) * cav_depth).astype(np.float32)
    vcol = vcol * (1.0 - cav_mask[:, None]) + cavity * cav_mask[:, None]

    # 5) 귀 미세 홍조 & 안와 내부 은은한 그림자
    ear_m = np.isin(head_tags, [TAG_EAR_L, TAG_EAR_R]).astype(np.float32) * 0.14
    vcol = vcol * (1.0 - ear_m[:, None]) + blush * ear_m[:, None]
    sock_m = np.isin(head_tags, [TAG_EYE_SOCKET_L, TAG_EYE_SOCKET_R]).astype(np.float32) * 0.35
    vcol = vcol * (1.0 - sock_m[:, None]) + shade * sock_m[:, None]

    # 목 이음매 근처는 정확히 순수 skin 색으로 통일해 TS_Body와 색 이음매 0!
    neck_clean = (1.0 - expr.smoothstep(plan.z_neck_cut, plan.z_neck_cut + 0.022, pz)).astype(np.float32)
    vcol = vcol * (1.0 - neck_clean[:, None]) + skin * neck_clean[:, None]

    corner_vals = np.concatenate([vcol[head_tris].reshape(-1, 3), np.ones((len(head_tris) * 3, 1), dtype=np.float32)], axis=1)
    painted = uvtools.paint_triangles(head_uv, head_tris, corner_vals, size, background=np.array([*skin.tolist(), 0.0], dtype=np.float32))
    rgb, cov = _dilate_fill(painted[..., :3], painted[..., 3], iters=6)
    rgb = np.where(cov[..., None] > 0.5, rgb, skin)
    rgb = _gauss_blur(rgb, 1.0)
    return encode_baseline_jpeg_bpy(np.clip(rgb, 0.0, 1.0), quality=91)


def bake_body_skin_texture(
    plan: ArchetypePlan,
    body_pos_b: np.ndarray,
    body_uv: np.ndarray,
    body_tris: np.ndarray,
    size: int = 1024,
) -> bytes:
    """바디 피부 + 스튜디오 모데스티 이너웨어 톤(ts_skin_body, 목 이음매 색 완전 일치, 휘도 >= 0.85)."""
    s = plan.spec
    skin = np.array(_hex_rgb(s.skin_hex), dtype=np.float32)
    blush = np.array(_hex_rgb(s.blush_hex), dtype=np.float32)
    shade = skin * np.array([0.94, 0.88, 0.86], dtype=np.float32)
    modesty = np.array([0.92, 0.93, 0.96], dtype=np.float32)  # 깔끔한 아틀리에 라벤더 화이트

    n = len(body_pos_b)
    vcol = np.tile(skin, (n, 1))
    px, py, pz = body_pos_b[:, 0], body_pos_b[:, 1], body_pos_b[:, 2]

    # 관절(무릎·팔꿈치·쇄골) 부드러운 웹툰 혈색
    knee_w = np.exp(-(((pz - plan.z_knee) / 0.045) ** 2)) * 0.14
    vcol = vcol * (1.0 - knee_w[:, None]) + blush * knee_w[:, None]
    clav_w = np.exp(-(((pz - (plan.z_neck_base - 0.012)) / 0.025) ** 2)) * expr.smoothstep(0.02, -0.04, py) * 0.12
    vcol = vcol * (1.0 - clav_w[:, None]) + shade * clav_w[:, None]

    # 깔끔한 스튜디오 모데스티 쇼츠(골반) + 여성/유스 밴도 탑(가슴)
    shorts = expr.smoothstep(plan.z_crotch - 0.032, plan.z_crotch - 0.016, pz) * (
        1.0 - expr.smoothstep(plan.z_hips + 0.032, plan.z_hips + 0.046, pz)
    )
    if s.has_bandeau:
        bandeau = (
            expr.smoothstep(plan.z_chest - 0.055, plan.z_chest - 0.042, pz)
            * (1.0 - expr.smoothstep(plan.z_chest + 0.042, plan.z_chest + 0.056, pz))
            * (1.0 - expr.smoothstep(s.chest_rx * 0.96, s.shoulder_half_w * 1.05, np.abs(px)))
        )
        m_mask = np.maximum(shorts, bandeau).astype(np.float32)
    else:
        m_mask = shorts.astype(np.float32)
    vcol = vcol * (1.0 - m_mask[:, None]) + modesty * m_mask[:, None]

    # 목 이음매 20mm 이내 순수 skin 고정
    neck_clean = expr.smoothstep(plan.z_neck_cut - 0.024, plan.z_neck_cut - 0.004, pz).astype(np.float32)
    vcol = vcol * (1.0 - neck_clean[:, None]) + skin * neck_clean[:, None]

    corner_vals = np.concatenate([vcol[body_tris].reshape(-1, 3), np.ones((len(body_tris) * 3, 1), dtype=np.float32)], axis=1)
    painted = uvtools.paint_triangles(body_uv, body_tris, corner_vals, size, background=np.array([*skin.tolist(), 0.0], dtype=np.float32))
    rgb, cov = _dilate_fill(painted[..., :3], painted[..., 3], iters=6)
    rgb = np.where(cov[..., None] > 0.5, rgb, skin)
    rgb = _gauss_blur(rgb, 1.0)
    return encode_baseline_jpeg_bpy(np.clip(rgb, 0.0, 1.0), quality=91)


def bake_eye_atlas_texture(spec: ArchetypeSpec, size: int = 512) -> bytes:
    """`ts_eye_sclera` 3구역 아틀라스: 좌=공막, 우상=보석 오목 홍채, 우하=순백 캐치라이트."""
    img = np.ones((size, size, 3), dtype=np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size
    v = (yy + 0.5) / size  # 0=상단, 1=하단

    # 1) 좌측 절반: 공막 (따뜻한 백색 + 상단 윗눈꺼풀 소프트 그늘)
    left = u < 0.5
    sx = (u - 0.25) / 0.22
    sy = (0.50 - v) / 0.44
    sr = np.hypot(sx, sy)
    sclera = np.stack([np.full_like(u, 0.98), np.full_like(u, 0.97), np.full_like(u, 0.965)], axis=-1)
    top_sh = expr.smoothstep(0.10, 0.82, sy) * 0.14
    rim_sh = expr.smoothstep(0.75, 1.05, sr) * 0.12
    sclera *= (1.0 - top_sh - rim_sh)[..., None]
    img[left] = sclera[left]

    # 2) 우상단 사분면 (u in [0.5,1], v in [0,0.5]): 한국 웹툰 보석 홍채
    upper_c = np.array(_hex_rgb(spec.iris_upper_hex), dtype=np.float32)
    lower_c = np.array(_hex_rgb(spec.iris_lower_hex), dtype=np.float32)
    glow_c = lower_c * 0.55 + np.array([1.0, 1.0, 1.0], dtype=np.float32) * 0.45
    limbal_c = upper_c * 0.35 + np.array([0.04, 0.03, 0.07], dtype=np.float32) * 0.65
    pupil_c = np.array([0.05, 0.04, 0.08], dtype=np.float32)

    q_iris = (u >= 0.5) & (v < 0.5)
    ix = (u - 0.75) / 0.21
    iy = (0.25 - v) / 0.21  # +1 상단, -1 하단
    ir = np.hypot(ix, iy)
    iang = np.arctan2(iy, ix)

    grad_t = np.clip(0.52 - iy * 0.62, 0.0, 1.0)[..., None]
    icol = upper_c * (1.0 - grad_t) + lower_c * grad_t
    # 방사형 보석 결
    stri = (0.5 + 0.5 * np.sin(iang * 28.0 + 0.6 * np.sin(iang * 6.0))) * expr.smoothstep(0.22, 0.45, ir) * (1.0 - expr.smoothstep(0.75, 0.92, ir))
    icol = icol * (1.0 - stri[..., None] * 0.24) + glow_c * (stri[..., None] * 0.24)
    # 하단 초승달 반사광
    cres_d = np.hypot(ix * 0.80, (iy + 0.40) * 1.55)
    cres = np.clip(1.0 - cres_d / 0.56, 0.0, 1.0) ** 1.5 * 0.62 * (ir < 0.84)
    icol = icol * (1.0 - cres[..., None]) + glow_c * cres[..., None]
    # 상단 눈꺼풀 그림자 + 윤부 링 + 동공
    sh_t = expr.smoothstep(0.08, 0.68, iy) * 0.58
    icol = icol * (1.0 - sh_t[..., None]) + limbal_c * sh_t[..., None]
    limbal = expr.smoothstep(0.76, 0.95, ir)
    icol = icol * (1.0 - limbal[..., None]) + limbal_c * limbal[..., None]
    pr = np.hypot(ix * 1.12, iy * 0.92)
    pupil = 1.0 - expr.smoothstep(0.26, 0.35, pr)
    icol = icol * (1.0 - pupil[..., None]) + pupil_c * pupil[..., None]
    img[q_iris] = icol[q_iris]

    # 3) 우하단 사분면: 순백 캐치라이트 (#FFFFFF)
    q_hl = (u >= 0.5) & (v >= 0.5)
    img[q_hl] = 1.0
    return encode_baseline_jpeg_bpy(np.clip(img, 0.0, 1.0), quality=92)


def bake_mouth_atlas_texture(size: int = 512) -> bytes:
    """`ts_mouth_inner`: 좌=상아색 치아, 중=잇몸, 우=장밋빛 혀."""
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size
    v = (yy + 0.5) / size
    img = np.zeros((size, size, 3), dtype=np.float32)

    # 치아 (u < 0.34)
    tv = 1.0 - np.abs(v - 0.5) * 2.0
    teeth = np.stack([0.975 - 0.05 * (1 - tv), 0.955 - 0.08 * (1 - tv), 0.91 - 0.12 * (1 - tv)], axis=-1)
    # 잇몸 (0.34 <= u < 0.66)
    gums = np.stack([0.88 - 0.08 * v, 0.50 - 0.10 * v, 0.52 - 0.10 * v], axis=-1)
    # 혀 (u >= 0.66)
    tu = (u - 0.82) / 0.15
    groove = np.exp(-((tu / 0.16) ** 2)) * 0.14
    tongue = np.stack([0.84 - groove, 0.43 - groove * 0.6, 0.46 - groove * 0.6], axis=-1)

    m_t = u < 0.34
    m_g = (u >= 0.34) & (u < 0.66)
    m_tg = u >= 0.66
    img[m_t] = teeth[m_t]
    img[m_g] = gums[m_g]
    img[m_tg] = tongue[m_tg]
    return encode_baseline_jpeg_bpy(np.clip(img, 0.0, 1.0), quality=90)


def bake_lashes_brows_texture(size: int = 512) -> bytes:
    """`ts_lashes_brows`: 좌=진한 잉크 아이라인/속눈썹, 우=부드러운 딥에스프레소 눈썹 결."""
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size
    v = (yy + 0.5) / size
    img = np.zeros((size, size, 3), dtype=np.float32)

    # 좌: 속눈썹/아이라인 (#1B141E)
    lash_c = np.array([0.11, 0.085, 0.125], dtype=np.float32)
    grain_l = 0.03 * np.sin(u * 180.0 + v * 12.0)
    img[:, : size // 2] = np.clip(lash_c + grain_l[:, : size // 2, None], 0.0, 1.0)

    # 우: 눈썹 (#3D2C2B, 부드러운 딥브라운 털 결)
    brow_c = np.array([0.26, 0.19, 0.19], dtype=np.float32)
    grain_b = 0.04 * np.sin((u * 90.0 + v * 45.0))
    img[:, size // 2 :] = np.clip(brow_c + grain_b[:, size // 2 :, None], 0.0, 1.0)
    return encode_baseline_jpeg_bpy(np.clip(img, 0.0, 1.0), quality=90)


# ---------------------------------------------------------------------------
# 아키타입 1종 전체 조립 및 GLB 출력
# ---------------------------------------------------------------------------


def _quads_to_tris(positions: np.ndarray, quads: np.ndarray) -> np.ndarray:
    d02 = np.linalg.norm(positions[quads[:, 0]] - positions[quads[:, 2]], axis=1)
    d13 = np.linalg.norm(positions[quads[:, 1]] - positions[quads[:, 3]], axis=1)
    use13 = d13 < d02
    out = np.empty((len(quads) * 2, 3), dtype=np.int64)
    out[0::2] = np.where(use13[:, None], quads[:, [0, 1, 3]], quads[:, [0, 1, 2]])
    out[1::2] = np.where(use13[:, None], quads[:, [1, 2, 3]], quads[:, [0, 2, 3]])
    return out


def _vertex_regions(quads: np.ndarray, face_region: np.ndarray, v_count: int) -> np.ndarray:
    votes = np.zeros((v_count, len(KIT_REGION_IDS)), dtype=np.int32)
    for k in range(4):
        np.add.at(votes, (quads[:, k], face_region), 1)
    return votes.argmax(axis=1).astype(np.uint8)


def _vertex_tags(quads: np.ndarray, face_tag: np.ndarray, v_count: int) -> np.ndarray:
    votes = np.zeros((v_count, 8), dtype=np.int32)
    for k in range(4):
        np.add.at(votes, (quads[:, k], face_tag), 1)
    # 구강·안와·귀·입술이 피부보다 우선
    return votes.argmax(axis=1).astype(np.int32)


def build_archetype_base_v2(spec: ArchetypeSpec, out_dir: Path) -> dict[str, Any]:
    """단일 아키타입 v2 베이스 GLB + 메타 JSON을 생성한다."""
    t_start = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    plan = compute_archetype_plan(spec)
    unified_mesh, bmesh_audit = build_unified_body_head_mesh(plan)

    # 용접 배열 추출 (Blender 좌표 & glTF 좌표)
    n_v = len(unified_mesh.vertices)
    n_f = len(unified_mesh.polygons)
    pos_b = np.empty(n_v * 3, dtype=np.float64)
    unified_mesh.vertices.foreach_get("co", pos_b)
    pos_b = pos_b.reshape(-1, 3)
    pos_g = b2g(pos_b)

    quads = np.empty(n_f * 4, dtype=np.int64)
    unified_mesh.polygons.foreach_get("vertices", quads)
    quads = quads.reshape(-1, 4)

    face_region = np.empty(n_f, dtype=np.int64)
    unified_mesh.attributes["ts_region_id"].data.foreach_get("value", face_region)
    face_tag = np.empty(n_f, dtype=np.int64)
    unified_mesh.attributes["ts_part_tag"].data.foreach_get("value", face_tag)

    # 1) 68본 스키닝 (어깨 3단계 웨이트 확산 포함) — 용접 상태에서 계산해 목 이음매 웨이트 비트 일치!
    skin_idx, skin_val = compute_anatomical_skin_weights_v2(pos_b, quads, face_region, plan)

    # 2) 용접 법선 및 목 이음매 정점 파악
    head_mask = face_region == REGION_INDEX["head"]
    body_mask = ~head_mask
    head_verts_welded = np.unique(quads[head_mask].ravel())
    body_verts_welded = np.unique(quads[body_mask].ravel())
    seam_welded = np.intersect1d(head_verts_welded, body_verts_welded)
    assert len(seam_welded) >= 32, f"목 이음매 정점 쌍 부족: {len(seam_welded)}"

    welded_tris = _quads_to_tris(pos_g, quads)
    welded_nrm_g = vertex_normals(pos_g, welded_tris)
    v_region_welded = _vertex_regions(quads, face_region, n_v)
    v_tag_welded = _vertex_tags(quads, face_tag, n_v)

    # 3) TS_Body / TS_Head 분할 및 비중첩 UV 전개 (마진 >= 0.018)
    def _split_part(f_mask: np.ndarray, order_by_reg: bool) -> dict[str, Any]:
        f_ids = np.flatnonzero(f_mask)
        used = np.unique(quads[f_ids].ravel())
        remap = -np.ones(n_v, dtype=np.int64)
        remap[used] = np.arange(len(used))
        local_q = remap[quads[f_ids]]
        orig_local, uv, new_q, ov = unwrap_mesh_clean(pos_g[used], local_q, margin=0.018)
        origin = used[orig_local]
        if order_by_reg:
            order = np.argsort(face_region[f_ids], kind="stable")
            new_q = new_q[order]
            f_ids = f_ids[order]
        p_g = pos_g[origin]
        p_b = pos_b[origin]
        tris = _quads_to_tris(p_g, new_q)
        return {
            "origin": origin,
            "uv": uv,
            "quads": new_q,
            "face_ids": f_ids,
            "positions_g": p_g,
            "positions_b": p_b,
            "triangles": tris,
            "normals_g": welded_nrm_g[origin].copy(),
            "joints": skin_idx[origin].copy(),
            "weights": skin_val[origin].copy(),
            "region": v_region_welded[origin].copy(),
            "tags": v_tag_welded[origin].copy(),
            "uv_overlap": ov,
        }

    body_part = _split_part(body_mask, order_by_reg=True)
    head_part = _split_part(head_mask, order_by_reg=False)

    # TS_Body 영역 인덱스 범위 (15개 hideable regions)
    quad_reg = face_region[body_part["face_ids"]]
    body_regions: list[dict[str, Any]] = []
    cursor = 0
    for r_id in np.unique(quad_reg):
        cnt = int((quad_reg == r_id).sum())
        r_name = KIT_REGION_IDS[int(r_id)]
        body_regions.append({"id": r_name, "mesh": "TS_Body", "indexStart": cursor * 6, "indexCount": cnt * 6})
        cursor += cnt

    # 4) 타원체 프록시 커스텀 안면 법선 (0.85 블렌드, 목 이음매 0.0 마스킹으로 TS_Body와 비트 일치!)
    head_part["normals_g"] = compute_ellipsoid_proxy_face_normals(
        head_part["positions_g"],
        head_part["normals_g"],
        head_part["tags"],
        pos_g[seam_welded],
        plan,
        blend_strength=0.85,
    )
    # 목 이음매 법선 강제 비트 일치 보장
    seam_set = set(seam_welded.tolist())
    seam_head_mask = np.isin(head_part["origin"], seam_welded)
    head_part["normals_g"][seam_head_mask] = welded_nrm_g[head_part["origin"][seam_head_mask]]

    # 5) 6층 눈 + 입체 속눈썹 + 0.7mm 스냅 눈썹 + 3D 구강 내부
    eye_l = build_eye_6layer_eyeball(plan, "L")
    eye_r = build_eye_6layer_eyeball(plan, "R")
    lashes, brow_l, brow_r = build_3d_lashes_and_brows(
        plan, head_part["positions_b"], head_part["triangles"], head_part["joints"], head_part["weights"]
    )
    mouth = build_3d_mouth_interior(plan, head_part["positions_b"], head_part["tags"])

    # 6) 계약 64 Morph (체형 18 + 얼굴 30 + FACS 16) 및 관절 오프셋
    joints_g = np.stack([b2g(plan.joints_b[name]) for name in SKELETON_JOINTS], axis=0)
    m = lambda s: f"{MIXAMO}{s}"
    body_lm = expr.BodyFieldLandmarks(
        height_m=spec.height_m,
        hip_y=float(joints_g[JOINT_INDEX[m("Hips")], 1]),
        arm_x=float(abs(joints_g[JOINT_INDEX[m("LeftArm")], 0])),
        arm_y=float(joints_g[JOINT_INDEX[m("LeftArm")], 1]),
        chest_y=float(plan.z_chest),
        waist_y=float(plan.z_waist),
        hip_center_y=float(plan.z_hips + 0.015),
        neck_base_y=float(plan.z_neck_base),
        neck_seam_y=float(plan.z_neck_cut),
        head_pivot=b2g(np.array([0.0, 0.008, plan.z_chin + plan.head_h * 0.14])),
        foot_z=float(joints_g[JOINT_INDEX[m("LeftFoot")], 2]),
        chest_z=float(joints_g[JOINT_INDEX[m("Spine2")], 2]),
        waist_z=float(joints_g[JOINT_INDEX[m("Spine")], 2]),
        pelvis_z=float(joints_g[JOINT_INDEX[m("Hips")], 2]),
        torso_half_w=spec.chest_rx,
    )
    body_fields = expr.ArchetypeBodyFields(body_lm)
    welded_body_morphs: dict[str, np.ndarray] = {}
    for key in expr.BODY_PARAM_KEYS:
        plus = expr.fade_small(body_fields.field(key, pos_g))
        welded_body_morphs[f"param:{key}:+"] = plus
        welded_body_morphs[f"param:{key}:-"] = -plus

    # 목 이음매에서 움직이는 추가 체형 키 확인 → 머리와 공유해 틈 0.00mm 강제!
    head_body_keys = list(expr.HEAD_ATTACHED_BODY_KEYS)
    for key in expr.BODY_PARAM_KEYS:
        if key not in head_body_keys:
            gap = float(np.linalg.norm(welded_body_morphs[f"param:{key}:+"][seam_welded], axis=1).max())
            if gap > 1e-5:
                head_body_keys.append(key)

    face_lm = expr.build_face_landmarks_v2(
        eye_l=b2g(plan.eye_center_l),
        eye_r=b2g(plan.eye_center_r),
        eye_radius=plan.eye_radius,
        eye_opening_h=plan.eye_open_h,
        eye_opening_w=plan.eye_open_w,
        brow_y=float(plan.z_brow),
        nose_tip=b2g(plan.nose_tip),
        mouth_center=b2g(plan.mouth_center),
        mouth_half_w=spec.mouth_half_w,
        chin=b2g(plan.chin_pt),
        jaw_corner_l=b2g(plan.jaw_corner_l),
        ear_l=b2g(plan.ear_l),
        forehead=b2g(plan.forehead_pt),
        jaw_pivot=b2g(plan.jaw_pivot),
        crown_y=float(plan.z_crown),
        seam_points=pos_g[seam_welded],
    )

    body_morphs = {
        name: expr.ensure_min_param_delta(welded_body_morphs[name][body_part["origin"]], name, body_part["positions_g"]).astype(np.float32)
        for name in expr.BODY_MORPH_NAMES
    }
    head_morphs = expr.evaluate_head_morphs_v2(
        head_positions=head_part["positions_g"],
        head_origin=head_part["origin"],
        welded_body_deltas=welded_body_morphs,
        lm=face_lm,
        head_body_keys=tuple(head_body_keys),
    )

    # 용접 전체 법선 델타 (TS_Body & TS_Head)
    full_deltas: dict[str, np.ndarray] = {}
    for name in list(dict.fromkeys([*body_morphs.keys(), *head_morphs.keys()])):
        arr = np.zeros((n_v, 3), dtype=np.float64)
        if name in body_morphs:
            arr[body_part["origin"]] = body_morphs[name]
        if name in head_morphs:
            arr[head_part["origin"]] = head_morphs[name]
        full_deltas[name] = arr
    welded_nrm_deltas = expr.compute_welded_normal_deltas(pos_g, welded_tris, welded_nrm_g, full_deltas)
    body_nrm_morphs = {name: welded_nrm_deltas[name][body_part["origin"]] for name in body_morphs}
    head_nrm_morphs = {name: welded_nrm_deltas[name][head_part["origin"]] for name in head_morphs}

    eye_l_morphs = expr.evaluate_eye_morphs_v2(eye_positions=eye_l["positions"], side="L", body_fields=body_fields, lm=face_lm)
    eye_r_morphs = expr.evaluate_eye_morphs_v2(eye_positions=eye_r["positions"], side="R", body_fields=body_fields, lm=face_lm)
    mouth_morphs = expr.evaluate_mouth_morphs_v2(
        mouth_positions=mouth["positions"],
        is_lower_teeth=mouth["is_lower"],
        is_tongue=mouth["is_tongue"],
        body_fields=body_fields,
        lm=face_lm,
    )
    lash_morphs = expr.interpolate_surface_morphs(
        part_positions=lashes["positions"],
        ref_positions=head_part["positions_g"],
        ref_morphs=head_morphs,
        names=expr.MORPH_COVERAGE_BY_ROLE["lash"],
    )
    brow_l_morphs = expr.interpolate_surface_morphs(
        part_positions=brow_l["positions"],
        ref_positions=head_part["positions_g"],
        ref_morphs=head_morphs,
        names=expr.MORPH_COVERAGE_BY_ROLE["brow"],
    )
    brow_r_morphs = expr.interpolate_surface_morphs(
        part_positions=brow_r["positions"],
        ref_positions=head_part["positions_g"],
        ref_morphs=head_morphs,
        names=expr.MORPH_COVERAGE_BY_ROLE["brow"],
    )

    joint_offsets = expr.compute_joint_offsets(body_fields, SKELETON_JOINTS, SKELETON_PARENTS, joints_g)

    # 7) 5개 재질 슬롯 텍스처 베이크 (ts_skin_body, ts_skin_head, ts_eye_sclera, ts_mouth_inner, ts_lashes_brows)
    tex_body = bake_body_skin_texture(plan, body_part["positions_b"], body_part["uv"], body_part["triangles"], size=1024)
    tex_head = bake_head_skin_texture(plan, head_part["positions_b"], head_part["tags"], head_part["uv"], head_part["triangles"], size=1024)
    tex_eye = bake_eye_atlas_texture(spec, size=512)
    tex_mouth = bake_mouth_atlas_texture(size=512)
    tex_lashes = bake_lashes_brows_texture(size=512)

    # 8) QuantizedGlbWriterV2 (KHR_mesh_quantization 단독 + raw SHORT min/max)로 GLB 작성
    writer = expr.QuantizedGlbWriterV2(generator=f"toonstudio character_kit v2 ({spec.archetype_id})")
    writer.add_skeleton(SKELETON_JOINTS, SKELETON_PARENTS, joints_g, root_name="Armature")

    mat_idx = {
        "ts_skin_body": writer.add_material(
            "ts_skin_body",
            base_color_texture=writer.add_texture(tex_body, "image/jpeg", name="ts_skin_body_color"),
            metallic=0.0,
            roughness=0.78,
        ),
        "ts_skin_head": writer.add_material(
            "ts_skin_head",
            base_color_texture=writer.add_texture(tex_head, "image/jpeg", name="ts_skin_head_color"),
            metallic=0.0,
            roughness=0.74,
        ),
        "ts_eye_sclera": writer.add_material(
            "ts_eye_sclera",
            base_color_texture=writer.add_texture(tex_eye, "image/jpeg", name="ts_eye_sclera_color"),
            metallic=0.0,
            roughness=0.18,
        ),
        "ts_mouth_inner": writer.add_material(
            "ts_mouth_inner",
            base_color_texture=writer.add_texture(tex_mouth, "image/jpeg", name="ts_mouth_inner_color"),
            metallic=0.0,
            roughness=0.48,
        ),
        "ts_lashes_brows": writer.add_material(
            "ts_lashes_brows",
            base_color_texture=writer.add_texture(tex_lashes, "image/jpeg", name="ts_lashes_brows_color"),
            metallic=0.0,
            roughness=0.65,
        ),
    }

    def _targets(morphs: dict[str, np.ndarray], nrm_morphs: dict[str, np.ndarray] | None = None) -> list[glbwriter.MorphTarget]:
        return [
            glbwriter.MorphTarget(name=k, position=morphs[k], normal=None if nrm_morphs is None else nrm_morphs.get(k))
            for k in morphs
        ]

    writer.add_mesh_node(
        "TS_Body",
        [
            glbwriter.Primitive(
                positions=body_part["positions_g"].astype(np.float32),
                indices=body_part["triangles"].astype(np.uint32),
                normals=body_part["normals_g"].astype(np.float32),
                uvs=body_part["uv"],
                joints=body_part["joints"],
                weights=body_part["weights"],
                region=body_part["region"],
                material=mat_idx["ts_skin_body"],
                targets=_targets(body_morphs, body_nrm_morphs),
            )
        ],
    )
    writer.add_mesh_node(
        "TS_Head",
        [
            glbwriter.Primitive(
                positions=head_part["positions_g"].astype(np.float32),
                indices=head_part["triangles"].astype(np.uint32),
                normals=head_part["normals_g"].astype(np.float32),
                uvs=head_part["uv"],
                joints=head_part["joints"],
                weights=head_part["weights"],
                region=head_part["region"],
                material=mat_idx["ts_skin_head"],
                targets=_targets(head_morphs, head_nrm_morphs),
            )
        ],
    )
    for node_name, eye_data, eye_m in (("TS_Eye_L", eye_l, eye_l_morphs), ("TS_Eye_R", eye_r, eye_r_morphs)):
        writer.add_mesh_node(
            node_name,
            [
                glbwriter.Primitive(
                    positions=eye_data["positions"].astype(np.float32),
                    indices=eye_data["triangles"].astype(np.uint32),
                    normals=eye_data["normals"].astype(np.float32),
                    uvs=eye_data["uv"],
                    joints=eye_data["joints"],
                    weights=eye_data["weights"],
                    material=mat_idx["ts_eye_sclera"],
                    targets=_targets(eye_m),
                )
            ],
        )
    writer.add_mesh_node(
        "TS_Mouth",
        [
            glbwriter.Primitive(
                positions=mouth["positions"].astype(np.float32),
                indices=mouth["triangles"].astype(np.uint32),
                normals=mouth["normals"].astype(np.float32),
                uvs=mouth["uv"],
                joints=mouth["joints"],
                weights=mouth["weights"],
                material=mat_idx["ts_mouth_inner"],
                targets=_targets(mouth_morphs),
            )
        ],
    )
    for node_name, part_data, part_m in (
        ("TS_Lashes", lashes, lash_morphs),
        ("TS_Brow_L", brow_l, brow_l_morphs),
        ("TS_Brow_R", brow_r, brow_r_morphs),
    ):
        writer.add_mesh_node(
            node_name,
            [
                glbwriter.Primitive(
                    positions=part_data["positions"].astype(np.float32),
                    indices=part_data["triangles"].astype(np.uint32),
                    normals=part_data["normals"].astype(np.float32),
                    uvs=part_data["uv"],
                    joints=part_data["joints"],
                    weights=part_data["weights"],
                    material=mat_idx["ts_lashes_brows"],
                    targets=_targets(part_m),
                )
            ],
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    glb_path = out_dir / f"{spec.archetype_id}.glb"
    byte_size = writer.write(str(glb_path))
    sha256 = hashlib.sha256(glb_path.read_bytes()).hexdigest()

    # 정밀 측정 메타데이터 기록
    all_pts_g = np.concatenate([body_part["positions_g"], head_part["positions_g"]], axis=0)
    actual_h = float(all_pts_g[:, 1].max() - all_pts_g[:, 1].min())
    actual_head_h = float(plan.z_crown - plan.z_chin)
    actual_heads = actual_h / max(actual_head_h, 1e-4)

    meta = {
        "schema": "toonstudio.character-kit.base-v2/1",
        "archetypeId": spec.archetype_id,
        "labelKo": spec.label_ko,
        "genre": spec.genre,
        "file": {"path": glb_path.name, "bytes": byte_size, "sha256": sha256},
        "targetHeightM": spec.height_m,
        "heightM": round(actual_h, 4),
        "headHeightM": round(actual_head_h, 4),
        "targetHeadToBodyRatio": spec.target_heads,
        "headToBodyRatio": round(actual_heads, 2),
        "boundsM": {
            "min": [round(float(v), 5) for v in all_pts_g.min(axis=0)],
            "max": [round(float(v), 5) for v in all_pts_g.max(axis=0)],
        },
        "materials": list(mat_idx.keys()),
        "jointCount": len(SKELETON_JOINTS),
        "eyeVertexCounts": {"TS_Eye.L": eye_l["vertexCount"], "TS_Eye.R": eye_r["vertexCount"]},
        "neckSeamVertexPairs": int(len(seam_welded)),
        "ellipsoidFaceNormalBlend": 0.85,
        "browSnapOffsetMm": 0.7,
        "unifiedBmeshAudit": bmesh_audit,
        "uvOverlap": {"TS_Body": round(body_part["uv_overlap"], 5), "TS_Head": round(head_part["uv_overlap"], 5)},
        "triangles": {
            "TS_Body": len(body_part["triangles"]),
            "TS_Head": len(head_part["triangles"]),
            "TS_Eye_L": len(eye_l["triangles"]),
            "TS_Eye_R": len(eye_r["triangles"]),
            "TS_Mouth": len(mouth["triangles"]),
            "TS_Lashes": len(lashes["triangles"]),
            "TS_Brow_L": len(brow_l["triangles"]),
            "TS_Brow_R": len(brow_r["triangles"]),
            "total": (
                len(body_part["triangles"])
                + len(head_part["triangles"])
                + len(eye_l["triangles"])
                + len(eye_r["triangles"])
                + len(mouth["triangles"])
                + len(lashes["triangles"])
                + len(brow_l["triangles"])
                + len(brow_r["triangles"])
            ),
        },
        "morphCounts": {
            "TS_Body": len(body_morphs),
            "TS_Head": len(head_morphs),
            "TS_Eye_L": len(eye_l_morphs),
            "TS_Eye_R": len(eye_r_morphs),
            "TS_Mouth": len(mouth_morphs),
            "TS_Lashes": len(lash_morphs),
            "TS_Brow_L": len(brow_l_morphs),
            "TS_Brow_R": len(brow_r_morphs),
            "uniqueContractTotal": len(set(body_morphs) | set(head_morphs)),
        },
        "bodyRegions": body_regions,
        "jointOffsets": joint_offsets,
        "buildSeconds": round(time.time() - t_start, 2),
    }
    meta_path = out_dir / f"{spec.archetype_id}_meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    bpy.data.meshes.remove(unified_mesh, do_unlink=True)
    print(
        f"[build_base_v2] {spec.archetype_id}: {byte_size / 1048576:.2f} MiB | "
        f"h={actual_h:.3f}m ({actual_heads:.2f}등신) | tris={meta['triangles']['total']} | "
        f"quad={bmesh_audit['quadRatio']*100:.1f}% | seam={len(seam_welded)}쌍 | "
        f"eyes={eye_l['vertexCount']}/{eye_r['vertexCount']}v | {meta['buildSeconds']}s"
    )
    return meta


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio Character Kit v2 5종 아키타입 베이스 빌더")
    parser.add_argument(
        "--archetype",
        default="all",
        choices=("all", *ARCHETYPES.keys()),
        help="생성할 아키타입 ID 또는 all",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/bases"),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    targets = list(ARCHETYPES.values()) if args.archetype == "all" else [ARCHETYPES[args.archetype]]
    results = []
    for spec in targets:
        results.append(build_archetype_base_v2(spec, args.out_dir))
    # expressions_v2.json 함께 갱신
    expr_path = args.out_dir / "expressions_v2.json"
    expr_path.write_text(json.dumps(expr.build_expressions_manifest(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary_path = args.out_dir / "bases_v2_index.json"
    summary_path.write_text(
        json.dumps(
            {
                "schema": "toonstudio.character-kit.bases-v2-index/1",
                "count": len(results),
                "archetypes": [r["archetypeId"] for r in results],
                "bases": {r["archetypeId"]: r["file"] for r in results},
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"[build_base_v2] 전체 완료 ({len(results)}종) → {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
