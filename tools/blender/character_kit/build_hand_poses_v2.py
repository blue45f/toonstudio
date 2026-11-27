"""ToonStudio Character Kit v2 — 16종 웹툰 필수 핸드 포즈 JSON + VRMA 1.0 생성기 (Blender 5.3).

설계 정본: `loop-stack/competitor-parity/blender-3d-plan.md` §3.5 B
16종 웹툰 필수 핸드 포즈:
  1. relax         (자연 이완)         9. hold-sword   (검/무기 파지)
  2. fist          (쥔 주먹)          10. hold-gun     (권총 그립)
  3. open-palm     (손바닥 펼침)      11. pray         (기도/모은 손)
  4. point         (검지 가리키기)    12. chin-rest    (턱 괴기)
  5. peace-v       (V 사인)           13. finger-heart (손하트)
  6. hold-pen      (펜/붓 쥐기)       14. grab-collar  (멱살/천 잡기)
  7. hold-phone    (스마트폰 파지)    15. beckon       (손짓/부르기)
  8. hold-cup      (찻잔/머그 쥐기)   16. thumbs-up    (엄지척)

회전 좌표 규약 (`apps/character-lab/src/animation/presets/rotation-dsl.ts` 1:1 패리티):
- 우수 좌표계, Y-up, 정면 +Z, 캐릭터 왼쪽 +X (`LEFT_X_SIGN = +1`).
- rest = T-pose (팔 ±X, 손바닥 -Y, 엄지 +Z).
- 쿼터니언 `[x, y, z, w]` (단위 정규화, w >= 0 정준형), 좌/우 YZ 평면 거울 대칭 검증.
- 모든 관절 굴곡·벌림 각은 인체 해부학 가동 범위(`MCP <= 95°`, `PIP <= 100°`, `DIP <= 75°`) 준수.

실행:
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/build_hand_poses_v2.py -- \
        --out-json data/character-studio-assets/characters/toonstudio-kit-v2/hand-poses.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

try:
    import bpy
    from mathutils import Vector

    HAS_BPY = True
except ImportError:
    HAS_BPY = False


# ---------------------------------------------------------------------------
# VRM 1.0 / Character Lab 회전 DSL (rotation-dsl.ts 1:1 정합)
# ---------------------------------------------------------------------------

Quat = tuple[float, float, float, float]  # (x, y, z, w)
Vec3 = tuple[float, float, float]

IDENTITY_QUAT: Quat = (0.0, 0.0, 0.0, 1.0)
LEFT_X_SIGN = 1


def side_sign(side: str) -> int:
    return LEFT_X_SIGN if side == "left" else -LEFT_X_SIGN


def q_normalize(q: Quat) -> Quat:
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w)
    if n < 1e-12 or not math.isfinite(n):
        return IDENTITY_QUAT
    inv = 1.0 / n
    x, y, z, w = x * inv, y * inv, z * inv, w * inv
    # 정준 부호(w >= 0)로 고정해 이중 덮개 불연속 방지
    if w < 0.0:
        x, y, z, w = -x, -y, -z, -w
    return (x, y, z, w)


def q_mul(a: Quat, b: Quat) -> Quat:
    """a ∘ b (b 먼저 적용 후 a 적용)."""
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def q_from_axis_angle(axis: Vec3, deg: float) -> Quat:
    ax, ay, az = axis
    n = math.sqrt(ax * ax + ay * ay + az * az)
    if n < 1e-12 or abs(deg) < 1e-12:
        return IDENTITY_QUAT
    half = math.radians(deg) * 0.5
    s = math.sin(half) / n
    return q_normalize((ax * s, ay * s, az * s, math.cos(half)))


def seq(*rotations: Quat) -> Quat:
    """나열 순서대로 적용: seq(a, b) = b ∘ a."""
    res = IDENTITY_QUAT
    for r in rotations:
        res = q_mul(r, res)
    return q_normalize(res)


def rot_x(deg: float) -> Quat:
    return q_from_axis_angle((1.0, 0.0, 0.0), deg)


def rot_y(deg: float) -> Quat:
    return q_from_axis_angle((0.0, 1.0, 0.0), deg)


def rot_z(deg: float) -> Quat:
    return q_from_axis_angle((0.0, 0.0, 1.0), deg)


def finger_curl(side: str, deg: float) -> Quat:
    """검지~소지 굴곡(손바닥 -Y 쪽, 양수)."""
    return rot_z(-side_sign(side) * deg)


def finger_spread(side: str, deg: float) -> Quat:
    """검지~소지 벌림(엄지 쪽 +Z가 양수)."""
    return rot_y(-side_sign(side) * deg)


def thumb_curl(side: str, deg: float) -> Quat:
    """엄지 굴곡: 엄지 방향(±X, +Z 대각)과 손바닥 법선(-Y)에 수직인 축 둘레 회전."""
    s = side_sign(side)
    inv_sqrt2 = math.sqrt(0.5)
    return q_from_axis_angle((inv_sqrt2, 0.0, -s * inv_sqrt2), deg)


def thumb_spread(side: str, deg: float) -> Quat:
    """엄지 벌림(손바닥 면 안에서 검지에서 멀어지면 양수)."""
    return rot_y(-side_sign(side) * deg)


def thumb_oppose(deg: float) -> Quat:
    """엄지 대립(손바닥 안쪽으로 감싸는 내회전, 좌/우 동일 부호로 YZ 거울 대칭 유지)."""
    return rot_x(-deg)


def wrist_flex(side: str, deg: float) -> Quat:
    return rot_z(-side_sign(side) * deg)


def wrist_deviate(side: str, deg: float) -> Quat:
    return rot_y(-side_sign(side) * deg)


def mirror_quat_yz(q: Quat) -> Quat:
    """YZ 평면(x -> -x) 거울 반사 회전: (x, y, z, w) -> (x, -y, -z, w)."""
    return q_normalize((q[0], -q[1], -q[2], q[3]))


def round_quat(q: Quat, digits: int = 6) -> list[float]:
    return [round(float(c), digits) for c in q_normalize(q)]


def is_non_identity(q: Quat, eps: float = 1e-8) -> bool:
    return abs(q[0]) > eps or abs(q[1]) > eps or abs(q[2]) > eps


# ---------------------------------------------------------------------------
# 30본 손가락 어휘 (VRM 1.0 Humanoid ↔ Mixamo 1:1 매핑)
# ---------------------------------------------------------------------------

FINGERS: tuple[str, ...] = ("Index", "Middle", "Ring", "Little")

VRM_FINGER_TO_MIXAMO: dict[str, str] = {}
for _side_l, _side_m in (("left", "Left"), ("right", "Right")):
    VRM_FINGER_TO_MIXAMO[f"{_side_l}ThumbMetacarpal"] = f"mixamorig:{_side_m}HandThumb1"
    VRM_FINGER_TO_MIXAMO[f"{_side_l}ThumbProximal"] = f"mixamorig:{_side_m}HandThumb2"
    VRM_FINGER_TO_MIXAMO[f"{_side_l}ThumbDistal"] = f"mixamorig:{_side_m}HandThumb3"
    for _vf, _mf in (("Index", "Index"), ("Middle", "Middle"), ("Ring", "Ring"), ("Little", "Pinky")):
        VRM_FINGER_TO_MIXAMO[f"{_side_l}{_vf}Proximal"] = f"mixamorig:{_side_m}Hand{_mf}1"
        VRM_FINGER_TO_MIXAMO[f"{_side_l}{_vf}Intermediate"] = f"mixamorig:{_side_m}Hand{_mf}2"
        VRM_FINGER_TO_MIXAMO[f"{_side_l}{_vf}Distal"] = f"mixamorig:{_side_m}Hand{_mf}3"

assert len(VRM_FINGER_TO_MIXAMO) == 30

# VRM 1.0 전체 55본 매핑 (VRMA 익스포트용)
VRM1_55_BONE_MAP: dict[str, str] = {
    "hips": "mixamorig:Hips",
    "spine": "mixamorig:Spine",
    "chest": "mixamorig:Spine1",
    "upper_chest": "mixamorig:Spine2",
    "neck": "mixamorig:Neck",
    "head": "mixamorig:Head",
    "jaw": "TS_Jaw",
    "left_eye": "TS_Eye.L",
    "right_eye": "TS_Eye.R",
    "left_shoulder": "mixamorig:LeftShoulder",
    "left_upper_arm": "mixamorig:LeftArm",
    "left_lower_arm": "mixamorig:LeftForeArm",
    "left_hand": "mixamorig:LeftHand",
    "right_shoulder": "mixamorig:RightShoulder",
    "right_upper_arm": "mixamorig:RightArm",
    "right_lower_arm": "mixamorig:RightForeArm",
    "right_hand": "mixamorig:RightHand",
    "left_upper_leg": "mixamorig:LeftUpLeg",
    "left_lower_leg": "mixamorig:LeftLeg",
    "left_foot": "mixamorig:LeftFoot",
    "left_toes": "mixamorig:LeftToeBase",
    "right_upper_leg": "mixamorig:RightUpLeg",
    "right_lower_leg": "mixamorig:RightLeg",
    "right_foot": "mixamorig:RightFoot",
    "right_toes": "mixamorig:RightToeBase",
    "left_thumb_metacarpal": "mixamorig:LeftHandThumb1",
    "left_thumb_proximal": "mixamorig:LeftHandThumb2",
    "left_thumb_distal": "mixamorig:LeftHandThumb3",
    "left_index_proximal": "mixamorig:LeftHandIndex1",
    "left_index_intermediate": "mixamorig:LeftHandIndex2",
    "left_index_distal": "mixamorig:LeftHandIndex3",
    "left_middle_proximal": "mixamorig:LeftHandMiddle1",
    "left_middle_intermediate": "mixamorig:LeftHandMiddle2",
    "left_middle_distal": "mixamorig:LeftHandMiddle3",
    "left_ring_proximal": "mixamorig:LeftHandRing1",
    "left_ring_intermediate": "mixamorig:LeftHandRing2",
    "left_ring_distal": "mixamorig:LeftHandRing3",
    "left_little_proximal": "mixamorig:LeftHandPinky1",
    "left_little_intermediate": "mixamorig:LeftHandPinky2",
    "left_little_distal": "mixamorig:LeftHandPinky3",
    "right_thumb_metacarpal": "mixamorig:RightHandThumb1",
    "right_thumb_proximal": "mixamorig:RightHandThumb2",
    "right_thumb_distal": "mixamorig:RightHandThumb3",
    "right_index_proximal": "mixamorig:RightHandIndex1",
    "right_index_intermediate": "mixamorig:RightHandIndex2",
    "right_index_distal": "mixamorig:RightHandIndex3",
    "right_middle_proximal": "mixamorig:RightHandMiddle1",
    "right_middle_intermediate": "mixamorig:RightHandMiddle2",
    "right_middle_distal": "mixamorig:RightHandMiddle3",
    "right_ring_proximal": "mixamorig:RightHandRing1",
    "right_ring_intermediate": "mixamorig:RightHandRing2",
    "right_ring_distal": "mixamorig:RightHandRing3",
    "right_little_proximal": "mixamorig:RightHandPinky1",
    "right_little_intermediate": "mixamorig:RightHandPinky2",
    "right_little_distal": "mixamorig:RightHandPinky3",
}
assert len(VRM1_55_BONE_MAP) == 55


# ---------------------------------------------------------------------------
# 16종 웹툰 필수 핸드 포즈 정의 (blender-3d-plan.md §3.5 B)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FingerSpec:
    curl: tuple[float, float, float]  # [근위 MCP, 중위 PIP, 원위 DIP] (도)
    spread: float = 0.0  # 엄지 쪽(+) 벌림 (도)


@dataclass(frozen=True)
class ThumbSpec:
    curl: tuple[float, float, float]  # [중수 CMC, 근위 MCP, 원위 IP] (도)
    spread: float = 0.0  # 검지에서 멀어지면(+) (도)
    oppose: float = 0.0  # 손바닥 대립 내회전 (도, 좌/우 대칭)


@dataclass(frozen=True)
class HandPoseSpec:
    pose_id: str
    label_ko: str
    category: str
    genres: tuple[str, ...]
    v1_alias: str | None
    prop_anchor: str | None
    thumb: ThumbSpec
    index: FingerSpec
    middle: FingerSpec
    ring: FingerSpec
    little: FingerSpec
    wrist_flex_deg: float = 0.0
    wrist_deviate_deg: float = 0.0


_FIST = FingerSpec((85.0, 90.0, 60.0), 0.0)
_STRAIGHT = FingerSpec((0.0, 0.0, 0.0), 0.0)

HAND_POSE_SPECS_V2: tuple[HandPoseSpec, ...] = (
    HandPoseSpec(
        pose_id="relax",
        label_ko="자연 이완",
        category="basic",
        genres=("romance", "academy", "daily", "rofan", "action"),
        v1_alias="relaxed",
        prop_anchor=None,
        thumb=ThumbSpec((10.0, 15.0, 10.0), spread=10.0, oppose=4.0),
        index=FingerSpec((18.0, 22.0, 12.0), spread=2.0),
        middle=FingerSpec((22.0, 26.0, 14.0), spread=0.0),
        ring=FingerSpec((26.0, 30.0, 16.0), spread=-3.0),
        little=FingerSpec((30.0, 32.0, 18.0), spread=-6.0),
    ),
    HandPoseSpec(
        pose_id="fist",
        label_ko="쥔 주먹",
        category="action",
        genres=("action", "murim", "academy", "comedy"),
        v1_alias="fist",
        prop_anchor=None,
        thumb=ThumbSpec((40.0, 46.0, 36.0), spread=-10.0, oppose=18.0),
        index=_FIST,
        middle=_FIST,
        ring=_FIST,
        little=_FIST,
    ),
    HandPoseSpec(
        pose_id="open-palm",
        label_ko="손바닥 펼침",
        category="basic",
        genres=("romance", "academy", "action", "comedy"),
        v1_alias="open",
        prop_anchor=None,
        thumb=ThumbSpec((0.0, 0.0, 0.0), spread=35.0, oppose=0.0),
        index=FingerSpec((0.0, 0.0, 0.0), spread=12.0),
        middle=FingerSpec((0.0, 0.0, 0.0), spread=3.0),
        ring=FingerSpec((0.0, 0.0, 0.0), spread=-8.0),
        little=FingerSpec((0.0, 0.0, 0.0), spread=-18.0),
    ),
    HandPoseSpec(
        pose_id="point",
        label_ko="검지 가리키기",
        category="gesture",
        genres=("academy", "mystery", "action", "comedy"),
        v1_alias="point",
        prop_anchor=None,
        thumb=ThumbSpec((30.0, 35.0, 25.0), spread=5.0, oppose=12.0),
        index=FingerSpec((0.0, 0.0, 0.0), spread=4.0),
        middle=_FIST,
        ring=_FIST,
        little=_FIST,
    ),
    HandPoseSpec(
        pose_id="peace-v",
        label_ko="V 사인",
        category="gesture",
        genres=("academy", "romance", "comedy", "daily"),
        v1_alias="peace",
        prop_anchor=None,
        thumb=ThumbSpec((35.0, 40.0, 30.0), spread=0.0, oppose=14.0),
        index=FingerSpec((0.0, 0.0, 0.0), spread=14.0),
        middle=FingerSpec((0.0, 0.0, 0.0), spread=-11.0),
        ring=_FIST,
        little=_FIST,
    ),
    HandPoseSpec(
        pose_id="hold-pen",
        label_ko="펜/붓 쥐기",
        category="prop-grip",
        genres=("academy", "office", "romance", "daily"),
        v1_alias=None,
        prop_anchor="hand-r",
        thumb=ThumbSpec((26.0, 34.0, 22.0), spread=16.0, oppose=22.0),
        index=FingerSpec((42.0, 52.0, 28.0), spread=6.0),
        middle=FingerSpec((52.0, 58.0, 30.0), spread=2.0),
        ring=FingerSpec((68.0, 72.0, 42.0), spread=-4.0),
        little=FingerSpec((76.0, 78.0, 48.0), spread=-8.0),
        wrist_flex_deg=-8.0,
        wrist_deviate_deg=6.0,
    ),
    HandPoseSpec(
        pose_id="hold-phone",
        label_ko="스마트폰 파지",
        category="prop-grip",
        genres=("romance", "academy", "office", "daily"),
        v1_alias=None,
        prop_anchor="hand-r",
        thumb=ThumbSpec((16.0, 22.0, 18.0), spread=22.0, oppose=14.0),
        index=FingerSpec((34.0, 48.0, 32.0), spread=6.0),
        middle=FingerSpec((36.0, 52.0, 34.0), spread=0.0),
        ring=FingerSpec((40.0, 56.0, 36.0), spread=-3.0),
        little=FingerSpec((58.0, 62.0, 36.0), spread=-8.0),
        wrist_flex_deg=10.0,
    ),
    HandPoseSpec(
        pose_id="hold-cup",
        label_ko="찻잔/머그 쥐기",
        category="prop-grip",
        genres=("romance", "rofan", "office", "daily"),
        v1_alias=None,
        prop_anchor="hand-r",
        thumb=ThumbSpec((20.0, 26.0, 20.0), spread=26.0, oppose=12.0),
        index=FingerSpec((44.0, 54.0, 34.0), spread=5.0),
        middle=FingerSpec((48.0, 58.0, 36.0), spread=0.0),
        ring=FingerSpec((52.0, 60.0, 38.0), spread=-4.0),
        little=FingerSpec((56.0, 62.0, 40.0), spread=-8.0),
    ),
    HandPoseSpec(
        pose_id="hold-sword",
        label_ko="검/무기 파지",
        category="prop-grip",
        genres=("action", "murim", "rofan", "fantasy"),
        v1_alias=None,
        prop_anchor="hand-r",
        thumb=ThumbSpec((36.0, 44.0, 34.0), spread=-6.0, oppose=20.0),
        index=FingerSpec((68.0, 78.0, 50.0), spread=4.0),
        middle=FingerSpec((74.0, 82.0, 54.0), spread=0.0),
        ring=FingerSpec((78.0, 86.0, 56.0), spread=-3.0),
        little=FingerSpec((82.0, 88.0, 58.0), spread=-6.0),
        wrist_deviate_deg=-12.0,
    ),
    HandPoseSpec(
        pose_id="hold-gun",
        label_ko="권총 그립",
        category="prop-grip",
        genres=("action", "noir", "thriller"),
        v1_alias=None,
        prop_anchor="hand-r",
        thumb=ThumbSpec((14.0, 18.0, 12.0), spread=26.0, oppose=8.0),
        index=FingerSpec((28.0, 48.0, 34.0), spread=6.0),
        middle=FingerSpec((78.0, 86.0, 56.0), spread=0.0),
        ring=FingerSpec((82.0, 88.0, 58.0), spread=-2.0),
        little=FingerSpec((84.0, 90.0, 60.0), spread=-5.0),
        wrist_deviate_deg=-10.0,
    ),
    HandPoseSpec(
        pose_id="pray",
        label_ko="기도/모은 손",
        category="emotion",
        genres=("rofan", "romance", "fantasy", "drama"),
        v1_alias=None,
        prop_anchor=None,
        thumb=ThumbSpec((12.0, 10.0, 8.0), spread=6.0, oppose=4.0),
        index=FingerSpec((6.0, 6.0, 4.0), spread=2.0),
        middle=FingerSpec((7.0, 7.0, 4.0), spread=0.0),
        ring=FingerSpec((8.0, 8.0, 5.0), spread=-1.5),
        little=FingerSpec((10.0, 10.0, 6.0), spread=-3.0),
    ),
    HandPoseSpec(
        pose_id="chin-rest",
        label_ko="턱 괴기",
        category="emotion",
        genres=("romance", "rofan", "academy", "office"),
        v1_alias=None,
        prop_anchor=None,
        thumb=ThumbSpec((12.0, 14.0, 10.0), spread=28.0, oppose=6.0),
        index=FingerSpec((14.0, 16.0, 10.0), spread=6.0),
        middle=FingerSpec((18.0, 22.0, 12.0), spread=0.0),
        ring=FingerSpec((46.0, 52.0, 30.0), spread=-4.0),
        little=FingerSpec((56.0, 60.0, 34.0), spread=-8.0),
        wrist_flex_deg=-14.0,
    ),
    HandPoseSpec(
        pose_id="finger-heart",
        label_ko="손하트",
        category="gesture",
        genres=("romance", "academy", "comedy", "daily"),
        v1_alias=None,
        prop_anchor=None,
        thumb=ThumbSpec((26.0, 22.0, 16.0), spread=18.0, oppose=24.0),
        index=FingerSpec((46.0, 56.0, 32.0), spread=16.0),
        middle=FingerSpec((80.0, 86.0, 58.0), spread=-2.0),
        ring=FingerSpec((84.0, 88.0, 60.0), spread=-4.0),
        little=FingerSpec((86.0, 90.0, 62.0), spread=-6.0),
    ),
    HandPoseSpec(
        pose_id="grab-collar",
        label_ko="멱살/천 잡기",
        category="action",
        genres=("action", "rofan", "drama", "noir"),
        v1_alias=None,
        prop_anchor=None,
        thumb=ThumbSpec((34.0, 48.0, 40.0), spread=10.0, oppose=20.0),
        index=FingerSpec((54.0, 78.0, 58.0), spread=8.0),
        middle=FingerSpec((58.0, 82.0, 62.0), spread=2.0),
        ring=FingerSpec((64.0, 84.0, 64.0), spread=-4.0),
        little=FingerSpec((70.0, 86.0, 66.0), spread=-10.0),
        wrist_flex_deg=14.0,
    ),
    HandPoseSpec(
        pose_id="beckon",
        label_ko="손짓/부르기",
        category="gesture",
        genres=("rofan", "romance", "action", "noir"),
        v1_alias=None,
        prop_anchor=None,
        thumb=ThumbSpec((16.0, 18.0, 12.0), spread=20.0, oppose=8.0),
        index=FingerSpec((36.0, 62.0, 48.0), spread=6.0),
        middle=FingerSpec((42.0, 66.0, 50.0), spread=-2.0),
        ring=FingerSpec((68.0, 76.0, 52.0), spread=-5.0),
        little=FingerSpec((76.0, 82.0, 56.0), spread=-9.0),
        wrist_flex_deg=18.0,
    ),
    HandPoseSpec(
        pose_id="thumbs-up",
        label_ko="엄지척",
        category="gesture",
        genres=("comedy", "academy", "daily", "action"),
        v1_alias="thumbs-up",
        prop_anchor=None,
        thumb=ThumbSpec((0.0, 0.0, 0.0), spread=45.0, oppose=0.0),
        index=_FIST,
        middle=_FIST,
        ring=_FIST,
        little=_FIST,
    ),
)

assert len(HAND_POSE_SPECS_V2) == 16


def build_side_pose(side: str, spec: HandPoseSpec) -> dict[str, Quat]:
    """한쪽 손 15개 손가락 본의 로컬 회전 쿼터니언(VRM 1.0 좌표계)을 계산한다."""
    pose: dict[str, Quat] = {}

    def put(bone: str, q: Quat) -> None:
        qn = q_normalize(q)
        if is_non_identity(qn):
            pose[bone] = qn

    tm = seq(thumb_oppose(spec.thumb.oppose), thumb_spread(side, spec.thumb.spread), thumb_curl(side, spec.thumb.curl[0]))
    put(f"{side}ThumbMetacarpal", tm)
    put(f"{side}ThumbProximal", thumb_curl(side, spec.thumb.curl[1]))
    put(f"{side}ThumbDistal", thumb_curl(side, spec.thumb.curl[2]))

    for fname, fspec in (
        ("Index", spec.index),
        ("Middle", spec.middle),
        ("Ring", spec.ring),
        ("Little", spec.little),
    ):
        prox = seq(finger_spread(side, fspec.spread), finger_curl(side, fspec.curl[0]))
        put(f"{side}{fname}Proximal", prox)
        put(f"{side}{fname}Intermediate", finger_curl(side, fspec.curl[1]))
        put(f"{side}{fname}Distal", finger_curl(side, fspec.curl[2]))

    return pose


def verify_hand_pose_spec(spec: HandPoseSpec, left: dict[str, Quat], right: dict[str, Quat]) -> None:
    """해부학 가동 범위, 단위 쿼터니언, 좌/우 YZ 거울 대칭 불변식을 검증한다."""
    for fname, fspec in (
        ("index", spec.index),
        ("middle", spec.middle),
        ("ring", spec.ring),
        ("little", spec.little),
    ):
        c0, c1, c2 = fspec.curl
        assert -10.0 <= c0 <= 95.0, f"{spec.pose_id}.{fname} MCP {c0}° 범위 이탈"
        assert 0.0 <= c1 <= 100.0, f"{spec.pose_id}.{fname} PIP {c1}° 범위 이탈"
        assert 0.0 <= c2 <= 75.0, f"{spec.pose_id}.{fname} DIP {c2}° 범위 이탈"
        assert -25.0 <= fspec.spread <= 25.0, f"{spec.pose_id}.{fname} spread {fspec.spread}° 범위 이탈"

    tc0, tc1, tc2 = spec.thumb.curl
    assert -10.0 <= tc0 <= 60.0 and -10.0 <= tc1 <= 65.0 and -10.0 <= tc2 <= 60.0
    assert -20.0 <= spec.thumb.spread <= 50.0 and -10.0 <= spec.thumb.oppose <= 35.0

    for side_name, pose_dict in (("left", left), ("right", right)):
        for bone, q in pose_dict.items():
            length = math.sqrt(sum(c * c for c in q))
            assert abs(length - 1.0) < 1e-6, f"{spec.pose_id}.{side_name}.{bone} 비정규 쿼터니언"

    for l_bone, l_q in left.items():
        r_bone = "right" + l_bone[len("left") :]
        assert r_bone in right, f"{spec.pose_id}: 좌/우 본 누락 {r_bone}"
        expected_r = mirror_quat_yz(l_q)
        actual_r = right[r_bone]
        dot = abs(sum(a * b for a, b in zip(expected_r, actual_r)))
        assert dot > 0.999999, f"{spec.pose_id}.{l_bone} 좌/우 거울 대칭 불일치 (dot={dot})"


# ---------------------------------------------------------------------------
# Blender 5.3 VRMA 1.0 익스포트 & 4x4 핸드 포즈 컨택트시트 렌더
# ---------------------------------------------------------------------------


def _clear_scene_keep_addons() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in (
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.actions,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for item in list(col):
            if item.users == 0:
                col.remove(item)


def _setup_vrm1_humanoid_armature(base_glb: Path) -> Any:
    _clear_scene_keep_addons()
    bpy.ops.import_scene.gltf(filepath=str(base_glb))
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Icosphere") and obj.parent is None:
            bpy.data.objects.remove(obj, do_unlink=True)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    ext = arm.data.vrm_addon_extension
    ext.spec_version = "1.0"
    hb = ext.vrm1.humanoid.human_bones
    hb.initial_automatic_bone_assignment = False
    hb.filter_by_human_bone_hierarchy = False
    for vrm_prop, bone_name in VRM1_55_BONE_MAP.items():
        getattr(hb, vrm_prop).node.bone_name = bone_name
    assert hb.bones_are_correctly_assigned(), f"VRM1 휴머노이드 본 할당 실패: {list(hb.error_messages())}"
    return arm


def _apply_hand_pose_to_armature(arm: Any, pose_both: dict[str, Quat], *, keyframe: bool = False) -> None:
    if arm.animation_data:
        arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)

    # 키프레임 대상: 30개 손가락 본 전체(포즈가 항등이어도 0/rest 채널을 명시 기록해 블렌드 누수 방지)
    for vrm_bone, mixamo_bone in VRM_FINGER_TO_MIXAMO.items():
        pb = arm.pose.bones[mixamo_bone]
        q = pose_both.get(vrm_bone, IDENTITY_QUAT)
        # VRM 1.0 본 로컬 좌표 == glTF 임포트 Blender 본 로컬 좌표 → (w, x, y, z)
        pb.rotation_quaternion = (q[3], q[0], q[1], q[2])
        if keyframe:
            pb.keyframe_insert(data_path="rotation_quaternion", frame=1)
            pb.keyframe_insert(data_path="rotation_quaternion", frame=2)

    bpy.context.view_layer.update()


def _audit_vrma(path: Path, min_channels: int = 2) -> dict[str, Any]:
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2, f"VRMA GLB 헤더 오류: {path}"
    clen, ctype = struct.unpack_from("<I4s", data, 12)
    assert ctype == b"JSON"
    doc = json.loads(data[20 : 20 + clen].decode("utf-8"))
    ext = doc.get("extensions", {}).get("VRMC_vrm_animation")
    assert ext is not None, f"VRMC_vrm_animation 누락: {path}"
    assert ext.get("specVersion") == "1.0", f"VRMA specVersion != 1.0: {ext.get('specVersion')}"
    hbones = ext.get("humanoid", {}).get("humanBones", {})
    assert len(hbones) == 55, f"VRMA humanoid bones != 55: {len(hbones)}"
    anims = doc.get("animations", [])
    ch_count = len(anims[0].get("channels", [])) if anims else 0
    assert len(anims) >= 1 and ch_count >= min_channels, f"VRMA 애니메이션 채널 부족({ch_count} < {min_channels}): {path}"
    return {
        "specVersion": ext["specVersion"],
        "humanoidBones": len(hbones),
        "channels": ch_count,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def _render_hand_poses_contact_sheet(
    arm: Any,
    poses_built: list[tuple[HandPoseSpec, dict[str, Quat]]],
    out_png: Path,
) -> None:
    """16종 핸드 포즈(왼손 클로즈업) 4x4 BLENDER_EEVEE 컨택트시트 렌더."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 16

    world = bpy.data.worlds.new("HandSheetWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.93, 0.92, 0.90, 1.0)
        bg.inputs[1].default_value = 0.85

    # 조명 2점
    for name, loc, energy, color in (
        ("HandKey", (1.2, -1.0, 2.2), 180.0, (1.0, 0.98, 0.95)),
        ("HandFill", (0.2, -1.2, 0.8), 90.0, (0.90, 0.94, 1.0)),
    ):
        ldata = bpy.data.lights.new(name, type="AREA")
        ldata.energy = energy
        ldata.size = 0.8
        ldata.color = color
        lobj = bpy.data.objects.new(name, ldata)
        scene.collection.objects.link(lobj)
        lobj.location = loc
        direction = Vector((0.68, 0.0, 1.32)) - Vector(loc)
        lobj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    cam_data = bpy.data.cameras.new("HandCam")
    cam_data.lens = 68.0
    cam_obj = bpy.data.objects.new("HandCam", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    hand_bone = arm.data.bones["mixamorig:LeftHand"]
    mid_bone = arm.data.bones["mixamorig:LeftHandMiddle2"]
    target = (arm.matrix_world @ hand_bone.head_local) * 0.35 + (arm.matrix_world @ mid_bone.head_local) * 0.65
    cam_pos = target + Vector((0.02, -0.26, -0.20))
    cam_obj.location = cam_pos
    cam_obj.rotation_euler = (target - cam_pos).to_track_quat("-Z", "Y").to_euler()

    tile = 256
    sheet = np.zeros((tile * 4, tile * 4, 4), dtype=np.float32)
    tmp_tile = out_png.parent / "_tmp_hand_tile.png"

    try:
        for idx, (spec, pose_both) in enumerate(poses_built):
            _apply_hand_pose_to_armature(arm, pose_both, keyframe=False)
            scene.render.filepath = str(tmp_tile)
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(str(tmp_tile), check_existing=False)
            pix = np.array(img.pixels[:], dtype=np.float32).reshape(tile, tile, 4)
            bpy.data.images.remove(img)
            # Blender 이미지는 하단→상단 순. 4x4 상단 행부터 배치하기 위해 행 역순 배치.
            row = idx // 4
            col = idx % 4
            y0 = (3 - row) * tile
            x0 = col * tile
            sheet[y0 : y0 + tile, x0 : x0 + tile, :] = pix
    finally:
        if tmp_tile.exists():
            tmp_tile.unlink()

    out_png.parent.mkdir(parents=True, exist_ok=True)
    out_img = bpy.data.images.new("HandPoseSheet", width=tile * 4, height=tile * 4, alpha=True)
    out_img.pixels.foreach_set(sheet.ravel())
    out_img.filepath_raw = str(out_png)
    out_img.file_format = "PNG"
    out_img.save()
    bpy.data.images.remove(out_img)


# ---------------------------------------------------------------------------
# 메인 빌드 진입점
# ---------------------------------------------------------------------------


def build_hand_poses_v2(
    *,
    out_json: Path,
    base_glb: Path,
    export_vrma: bool = True,
    render_sheet: bool = True,
) -> dict[str, Any]:
    out_json = out_json.resolve()
    kit_dir = out_json.parent
    vrma_dir = kit_dir / "hand-poses" / "vrma"
    sheet_path = kit_dir / "hand-poses" / "hand-poses-contact-sheet.png"
    vrma_dir.mkdir(parents=True, exist_ok=True)

    arm = None
    if HAS_BPY and (export_vrma or render_sheet):
        bpy.ops.preferences.addon_enable(module="bl_ext.user_default.vrm")
        arm = _setup_vrm1_humanoid_armature(base_glb)
        bpy.context.scene.frame_start = 1
        bpy.context.scene.frame_end = 2
        bpy.context.scene.render.fps = 30

    poses_entries: list[dict[str, Any]] = []
    poses_built_for_render: list[tuple[HandPoseSpec, dict[str, Quat]]] = []

    for spec in HAND_POSE_SPECS_V2:
        left_q = build_side_pose("left", spec)
        right_q = build_side_pose("right", spec)
        verify_hand_pose_spec(spec, left_q, right_q)
        both_q: dict[str, Quat] = {**left_q, **right_q}
        poses_built_for_render.append((spec, both_q))

        wrist_hint: dict[str, list[float]] | None = None
        if abs(spec.wrist_flex_deg) > 1e-6 or abs(spec.wrist_deviate_deg) > 1e-6:
            wrist_hint = {
                "leftHand": round_quat(seq(wrist_deviate("left", spec.wrist_deviate_deg), wrist_flex("left", spec.wrist_flex_deg))),
                "rightHand": round_quat(seq(wrist_deviate("right", spec.wrist_deviate_deg), wrist_flex("right", spec.wrist_flex_deg))),
            }

        vrma_meta: dict[str, Any] | None = None
        if arm is not None and export_vrma:
            _apply_hand_pose_to_armature(arm, both_q, keyframe=True)
            vrma_path = vrma_dir / f"{spec.pose_id}.vrma"
            res = bpy.ops.export_scene.vrma(filepath=str(vrma_path), armature_object_name=arm.name)
            if res != {"FINISHED"}:
                raise RuntimeError(f"VRMA 익스포트 실패({spec.pose_id}): {res}")
            audit = _audit_vrma(vrma_path, min_channels=len(both_q))
            vrma_meta = {
                "path": vrma_path.relative_to(kit_dir).as_posix(),
                **audit,
            }

        entry: dict[str, Any] = {
            "id": spec.pose_id,
            "presetId": f"hand-pose/{spec.pose_id}",
            "labelKo": spec.label_ko,
            "category": spec.category,
            "genres": list(spec.genres),
            "v1Alias": spec.v1_alias,
            "propAnchor": spec.prop_anchor,
            "mirrorable": True,
            "anglesDeg": {
                "thumb": {"curl": list(spec.thumb.curl), "spread": spec.thumb.spread, "oppose": spec.thumb.oppose},
                "index": {"curl": list(spec.index.curl), "spread": spec.index.spread},
                "middle": {"curl": list(spec.middle.curl), "spread": spec.middle.spread},
                "ring": {"curl": list(spec.ring.curl), "spread": spec.ring.spread},
                "little": {"curl": list(spec.little.curl), "spread": spec.little.spread},
            },
            "left": {k: round_quat(v) for k, v in left_q.items()},
            "right": {k: round_quat(v) for k, v in right_q.items()},
            "both": {k: round_quat(v) for k, v in both_q.items()},
        }
        if wrist_hint is not None:
            entry["wristHint"] = wrist_hint
        if vrma_meta is not None:
            entry["vrma"] = vrma_meta
        poses_entries.append(entry)

    contact_sheet_rel: str | None = None
    if arm is not None and render_sheet:
        _render_hand_poses_contact_sheet(arm, poses_built_for_render, sheet_path)
        contact_sheet_rel = sheet_path.relative_to(kit_dir).as_posix()

    doc: dict[str, Any] = {
        "schema": "toonstudio.character-kit.hand-poses/2",
        "version": 2,
        "generatedAt": "2026-11-20",
        "generator": {
            "tool": "tools/blender/character_kit/build_hand_poses_v2.py",
            "blender": bpy.app.version_string.split()[0] if HAS_BPY else "python",
            "vrmAddon": "bl_ext.user_default.vrm (4.5.0)",
        },
        "coordinateSystem": {
            "up": "+Y",
            "forward": "+Z",
            "left": "+X",
            "handedness": "right",
            "rest": "T-pose",
            "quaternionOrder": "xyzw",
        },
        "fingerBoneCount": 30,
        "boneMap": VRM_FINGER_TO_MIXAMO,
        "count": len(poses_entries),
        "poseIds": [p["id"] for p in poses_entries],
        "contactSheet": contact_sheet_rel,
        "poses": poses_entries,
    }
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"[build_hand_poses_v2] 완료: {len(poses_entries)}종 포즈 → {out_json} "
        f"(VRMA={sum(1 for p in poses_entries if 'vrma' in p)}개, sheet={contact_sheet_rel})"
    )
    return doc


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio Character Kit v2 16종 핸드 포즈 JSON/VRMA 생성기")
    parser.add_argument(
        "--out-json",
        type=Path,
        default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/hand-poses.json"),
    )
    parser.add_argument(
        "--base-glb",
        type=Path,
        default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/bases/female-romance.glb"),
    )
    parser.add_argument("--no-vrma", action="store_true", help="VRMA 1.0 파일 생성을 건너뜀")
    parser.add_argument("--no-sheet", action="store_true", help="4x4 컨택트시트 렌더를 건너뜀")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    build_hand_poses_v2(
        out_json=args.out_json,
        base_glb=args.base_glb,
        export_vrma=not args.no_vrma,
        render_sheet=not args.no_sheet,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
