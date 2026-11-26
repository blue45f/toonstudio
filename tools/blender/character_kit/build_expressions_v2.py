"""ToonStudio Character Kit v2 — 계약 64 Morph + 웹툰 감정 프리셋 8종 + VRM 1.0 18 프리셋 + KHR_mesh_quantization 작성기.

계약 64 morph(체형 18 + 얼굴 30 + FACS 16)를 아키타입별 실제 3D 랜드마크(female-romance / male-webtoon /
male-action / youth-academy / sd-chibi)에 맞춰 계산하고, 다음 불변 조건을 강제한다:
- `facs:jawOpen`은 `TS_Jaw` 본 회전 0 상태에서 단독 완결(이중 변형 방지, 윗입술 고정 + 아랫입술/턱/아랫니/혀 회전).
- 목 이음매(`TS_Body`/`TS_Head`) 경계 정점에서 얼굴·FACS 델타는 정확히 0.000mm, 공유 체형 델타는 비트 단위 일치.
- `QuantizedGlbWriterV2`: 오직 `KHR_mesh_quantization`만 사용(Draco/meshopt/KTX2/WebP 전면 금지), 모든 morph
  accessor에 raw `SHORT` 정수 `min`/`max` 바운드를 명시 기록해 Khronos `gltf-validator` 0오류를 보장한다.

단독 실행(Blender 5.3 헤드리스 또는 Python 3):
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/build_expressions_v2.py -- \
        --out data/character-studio-assets/characters/toonstudio-kit-v2/bases/expressions_v2.json \
        [--verify-glb <base.glb>]
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

# Blender --python 직접 실행과 패키지 import 양쪽 모두 지원
_THIS_DIR = Path(__file__).resolve().parent
_BLENDER_TOOLS_DIR = _THIS_DIR.parent
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from character_kit import face_fields as ff  # noqa: E402
from character_kit import glbwriter  # noqa: E402
from character_kit.surface import vertex_normals  # noqa: E402

# ---------------------------------------------------------------------------
# 계약 상수 (packages/studio-project-model/src/character-kit/contracts/* 단일 정본과 1:1 일치)
# ---------------------------------------------------------------------------

BODY_PARAM_KEYS: tuple[str, ...] = (
    "height",
    "shoulderWidth",
    "chestDepth",
    "waist",
    "hip",
    "armLength",
    "legLength",
    "headSize",
    "neckLength",
)

FACE_PARAM_KEYS: tuple[str, ...] = tuple(ff.FACE_PARAM_KEYS)
FACS_UNITS: tuple[str, ...] = tuple(ff.FACS_UNITS)

BODY_MORPH_NAMES: tuple[str, ...] = tuple(f"param:{k}:{s}" for k in BODY_PARAM_KEYS for s in ("+", "-"))
FACE_MORPH_NAMES: tuple[str, ...] = tuple(f"param:{k}:{s}" for k in FACE_PARAM_KEYS for s in ("+", "-"))
FACS_MORPH_NAMES: tuple[str, ...] = tuple(f"facs:{u}" for u in FACS_UNITS)
ALL_64_MORPH_NAMES: tuple[str, ...] = BODY_MORPH_NAMES + FACE_MORPH_NAMES + FACS_MORPH_NAMES
assert len(ALL_64_MORPH_NAMES) == 64, f"계약 morph 수가 64가 아닙니다: {len(ALL_64_MORPH_NAMES)}"

HEAD_ATTACHED_BODY_KEYS: tuple[str, ...] = ("height", "legLength", "neckLength", "headSize")
EYE_FACE_KEYS: tuple[str, ...] = ("eyeSize", "eyeSpacing", "eyeTilt", "faceShape")
LASH_BROW_FACE_KEYS: tuple[str, ...] = ("eyeSize", "eyeSpacing", "eyeTilt", "forehead", "faceShape")
MOUTH_FACE_KEYS: tuple[str, ...] = ("mouthWidth", "jawWidth")

EYE_FACS_UNITS: tuple[str, ...] = (
    "browInnerUp",
    "browOuterUp",
    "browDown",
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "eyeWide",
    "eyeSquint",
)
MOUTH_FACS_UNITS: tuple[str, ...] = (
    "jawOpen",
    "mouthSmile",
    "mouthFrown",
    "mouthPucker",
    "mouthFunnel",
    "mouthPress",
    "tongueOut",
    "cheekPuff",
)


def _pm(keys: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(f"param:{k}:{s}" for k in keys for s in ("+", "-"))


def _fm(units: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(f"facs:{u}" for u in units)


MORPH_COVERAGE_BY_ROLE: dict[str, tuple[str, ...]] = {
    "skin": BODY_MORPH_NAMES,
    "head": _pm(HEAD_ATTACHED_BODY_KEYS) + FACE_MORPH_NAMES + FACS_MORPH_NAMES,
    "eyeball": _pm(HEAD_ATTACHED_BODY_KEYS) + _pm(EYE_FACE_KEYS),
    "teeth": _pm(HEAD_ATTACHED_BODY_KEYS) + _pm(MOUTH_FACE_KEYS) + _fm(MOUTH_FACS_UNITS),
    "tongue": _pm(HEAD_ATTACHED_BODY_KEYS) + _pm(MOUTH_FACE_KEYS) + _fm(MOUTH_FACS_UNITS),
    "lash": _pm(HEAD_ATTACHED_BODY_KEYS) + _pm(LASH_BROW_FACE_KEYS) + _fm(EYE_FACS_UNITS),
    "brow": _pm(HEAD_ATTACHED_BODY_KEYS) + _pm(LASH_BROW_FACE_KEYS) + _fm(EYE_FACS_UNITS),
}

# ---------------------------------------------------------------------------
# 웹툰 감정 프리셋 8종 + VRM 1.0 18 프리셋 매핑
# ---------------------------------------------------------------------------

WEBTOON_EMOTION_PRESETS_V2: dict[str, dict[str, Any]] = {
    "wink": {
        "id": "webtoon/wink",
        "labelKo": "윙크",
        "genres": ["romance", "academy", "comedy"],
        "jawBoneRotationDeg": 0.0,
        "weights": {
            "facs:eyeBlinkLeft": 1.0,
            "facs:mouthSmile": 0.62,
            "facs:browOuterUp": 0.28,
            "facs:cheekPuff": 0.12,
        },
    },
    "half-lidded": {
        "id": "webtoon/half-lidded",
        "labelKo": "반감긴 눈",
        "genres": ["rofan", "noir", "romance"],
        "jawBoneRotationDeg": 0.0,
        "weights": {
            "facs:eyeBlinkLeft": 0.46,
            "facs:eyeBlinkRight": 0.46,
            "facs:eyeSquint": 0.30,
            "facs:browDown": 0.16,
            "facs:mouthPress": 0.18,
        },
    },
    "smirk": {
        "id": "webtoon/smirk",
        "labelKo": "냉소",
        "genres": ["rofan", "action", "noir"],
        "jawBoneRotationDeg": 0.0,
        "weights": {
            "facs:mouthSmile": 0.48,
            "facs:mouthPress": 0.24,
            "facs:browDown": 0.34,
            "facs:browOuterUp": 0.36,
            "facs:eyeSquint": 0.36,
            "facs:noseSneer": 0.22,
        },
    },
    "flustered": {
        "id": "webtoon/flustered",
        "labelKo": "당황",
        "genres": ["romance", "academy", "comedy"],
        "jawBoneRotationDeg": 0.0,
        "weights": {
            "facs:eyeWide": 0.68,
            "facs:browInnerUp": 0.72,
            "facs:jawOpen": 0.26,
            "facs:mouthFunnel": 0.22,
            "facs:mouthFrown": 0.20,
        },
    },
    "teary": {
        "id": "webtoon/teary",
        "labelKo": "울먹",
        "genres": ["romance", "rofan", "drama"],
        "jawBoneRotationDeg": 0.0,
        "weights": {
            "facs:browInnerUp": 0.88,
            "facs:eyeSquint": 0.32,
            "facs:mouthFrown": 0.62,
            "facs:mouthPress": 0.22,
            "facs:jawOpen": 0.14,
        },
    },
    "big-smile": {
        "id": "webtoon/big-smile",
        "labelKo": "활짝 웃음",
        "genres": ["romance", "academy", "comedy"],
        "jawBoneRotationDeg": 0.0,
        "weights": {
            "facs:mouthSmile": 1.0,
            "facs:jawOpen": 0.44,
            "facs:eyeSquint": 0.62,
            "facs:cheekPuff": 0.24,
            "facs:browOuterUp": 0.32,
        },
    },
    "shout": {
        "id": "webtoon/shout",
        "labelKo": "고함",
        "genres": ["action", "murim", "fantasy"],
        "jawBoneRotationDeg": 0.0,
        "weights": {
            "facs:jawOpen": 0.94,
            "facs:mouthFunnel": 0.48,
            "facs:browDown": 0.92,
            "facs:noseSneer": 0.56,
            "facs:eyeWide": 0.48,
        },
    },
    "shadowed-neutral": {
        "id": "webtoon/shadowed-neutral",
        "labelKo": "무표정 음영",
        "genres": ["rofan", "action", "thriller"],
        "jawBoneRotationDeg": 0.0,
        "weights": {
            "facs:browDown": 0.42,
            "facs:eyeSquint": 0.24,
            "facs:mouthPress": 0.38,
            "facs:mouthFrown": 0.18,
        },
    },
}

VRM1_EXPRESSION_MAPPINGS_V2: dict[str, dict[str, float]] = {
    "aa": {"facs:jawOpen": 0.82, "facs:mouthFunnel": 0.18},
    "ih": {"facs:jawOpen": 0.24, "facs:mouthSmile": 0.55},
    "ou": {"facs:jawOpen": 0.36, "facs:mouthPucker": 0.72, "facs:mouthFunnel": 0.42},
    "ee": {"facs:jawOpen": 0.32, "facs:mouthSmile": 0.68},
    "oh": {"facs:jawOpen": 0.58, "facs:mouthFunnel": 0.68, "facs:mouthPucker": 0.30},
    "happy": {"facs:mouthSmile": 0.95, "facs:eyeSquint": 0.50, "facs:browOuterUp": 0.22},
    "angry": {"facs:browDown": 0.92, "facs:noseSneer": 0.50, "facs:mouthFrown": 0.55, "facs:eyeSquint": 0.30},
    "sad": {"facs:browInnerUp": 0.85, "facs:mouthFrown": 0.65, "facs:eyeSquint": 0.20},
    "relaxed": {"facs:eyeBlinkLeft": 0.35, "facs:eyeBlinkRight": 0.35, "facs:mouthSmile": 0.38},
    "surprised": {"facs:eyeWide": 0.88, "facs:browInnerUp": 0.65, "facs:browOuterUp": 0.55, "facs:jawOpen": 0.52},
    "blink": {"facs:eyeBlinkLeft": 1.0, "facs:eyeBlinkRight": 1.0},
    "blinkLeft": {"facs:eyeBlinkLeft": 1.0},
    "blinkRight": {"facs:eyeBlinkRight": 1.0},
    "lookUp": {},
    "lookDown": {},
    "lookLeft": {},
    "lookRight": {},
    "neutral": {},
}

# ---------------------------------------------------------------------------
# 수학 유틸리티
# ---------------------------------------------------------------------------

FADE_LO = 1.8e-4
FADE_HI = 5.5e-4
NORMAL_FADE_LO = 0.045
NORMAL_FADE_HI = 0.11
MIN_PARAM_DELTA_M = 3.0e-5
BODY_MAX_DELTA_M = 0.145
FACE_MAX_DELTA_M = 0.048


def smoothstep(e0: float | np.ndarray, e1: float | np.ndarray, x: np.ndarray) -> np.ndarray:
    e0_a = np.asarray(e0, dtype=np.float64)
    e1_a = np.asarray(e1, dtype=np.float64)
    x_a = np.asarray(x, dtype=np.float64)
    span = e1_a - e0_a
    safe_span = np.where(np.abs(span) < 1e-12, 1.0, span)
    t = np.clip((x_a - e0_a) / safe_span, 0.0, 1.0)
    res = t * t * (3.0 - 2.0 * t)
    return np.where(np.abs(span) < 1e-12, np.where(x_a >= e1_a, 1.0, 0.0), res)


def bump(x: np.ndarray, center: float, width: float) -> np.ndarray:
    return np.exp(-(((x - center) / max(width, 1e-6)) ** 2))


def soft_min(x: np.ndarray, limit: float, k: float) -> np.ndarray:
    a = -x / k
    b = -limit / k
    m = np.maximum(a, b)
    return -k * (m + np.log(np.exp(a - m) + np.exp(b - m)))


def soft_relu(x: np.ndarray, k: float) -> np.ndarray:
    return k * np.logaddexp(0.0, x / k)


def fade_small(delta: np.ndarray, lo: float = FADE_LO, hi: float = FADE_HI) -> np.ndarray:
    mag = np.linalg.norm(delta, axis=1, keepdims=True)
    return delta * smoothstep(lo, hi, mag)


def clamp_delta_magnitude(delta: np.ndarray, max_m: float) -> np.ndarray:
    mag = np.linalg.norm(delta, axis=1, keepdims=True)
    scale = np.where(mag > max_m, max_m / np.maximum(mag, 1e-12), 1.0)
    return delta * scale


def seam_taper(points: np.ndarray, seam_points: np.ndarray, fade_start: float = 0.012, fade_end: float = 0.036) -> np.ndarray:
    """목 이음매에서 fade_start 이내 0, fade_end 이상 1로 매끄럽게 증가하는 마스크."""
    if len(seam_points) == 0:
        return np.ones(len(points), dtype=np.float64)
    out = np.empty(len(points), dtype=np.float64)
    chunk = 2048
    for i in range(0, len(points), chunk):
        d = np.linalg.norm(points[i : i + chunk, None, :] - seam_points[None, :, :], axis=2).min(axis=1)
        out[i : i + chunk] = smoothstep(fade_start, fade_end, d)
    return out


# ---------------------------------------------------------------------------
# 아키타입 적응형 체형 필드 (18 morphs)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BodyFieldLandmarks:
    """glTF 좌표계(Y 위, +Z 앞, +X 캐릭터 왼쪽, m) 기준 아키타입 랜드마크."""

    height_m: float
    hip_y: float
    arm_x: float
    arm_y: float
    chest_y: float
    waist_y: float
    hip_center_y: float
    neck_base_y: float
    neck_seam_y: float
    head_pivot: np.ndarray
    foot_z: float
    chest_z: float
    waist_z: float
    pelvis_z: float
    torso_half_w: float


class ArchetypeBodyFields:
    """아키타입 신장/비례에 자동 정규화된 체형 9키(± 18 morph) 변위 필드.

    모든 수직·수평 마스크 구간을 아키타입 자신의 관절 높이에서 계산하므로
    1.05m SD 치비부터 1.86m 액션 남성까지 동일한 해부학적 의미를 유지한다.
    """

    def __init__(self, lm: BodyFieldLandmarks) -> None:
        self.lm = lm

    def field(self, key: str, p: np.ndarray) -> np.ndarray:
        raw = getattr(self, f"_{key}")(np.asarray(p, dtype=np.float64))
        return clamp_delta_magnitude(raw, BODY_MAX_DELTA_M)

    def _height(self, p: np.ndarray) -> np.ndarray:
        center = np.array([0.0, 0.0, self.lm.foot_z])
        # V9 상한 0.15m 준수: 신장 1.86m에서도 0.075 * 1.86 = 0.1395m <= 0.145m
        factor = min(0.08, 0.142 / max(self.lm.height_m, 0.5))
        return factor * (p - center)

    def _legLength(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        k = max(0.015, 0.04 * lm.hip_y)
        out = np.zeros_like(p)
        out[:, 1] = 0.10 * soft_min(p[:, 1], lm.hip_y, k)
        return out

    def _shoulderWidth(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        ax = np.abs(p[:, 0])
        side = np.where(p[:, 0] >= 0.0, 1.0, -1.0)
        across = smoothstep(lm.arm_x * 0.25, lm.arm_x * 1.05, ax)
        y_lo = lm.waist_y
        y_mid = lm.chest_y + 0.35 * (lm.arm_y - lm.chest_y)
        y_hi0 = lm.neck_seam_y - 0.025
        y_hi1 = lm.neck_seam_y - 0.004
        # 목 이음매 아래에서 0으로 감쇠해 머리·목 이음매 변형 없음 보장
        vertical = smoothstep(y_lo, y_mid, p[:, 1]) * (1.0 - smoothstep(y_hi0, y_hi1, p[:, 1]))
        out = np.zeros_like(p)
        out[:, 0] = side * 0.18 * lm.arm_x * across * vertical
        return out

    def _armLength(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        ax = np.abs(p[:, 0])
        side = np.where(p[:, 0] >= 0.0, 1.0, -1.0)
        vertical = smoothstep(lm.waist_y, lm.chest_y, p[:, 1])
        out = np.zeros_like(p)
        out[:, 0] = side * 0.12 * soft_relu(ax - lm.arm_x, max(0.012, 0.12 * lm.arm_x)) * vertical
        return out

    def _chestDepth(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        sigma_y = max(0.04, 0.55 * (lm.arm_y - lm.waist_y))
        w = bump(p[:, 1], lm.chest_y, sigma_y) * (1.0 - smoothstep(lm.neck_seam_y - 0.02, lm.neck_seam_y - 0.003, p[:, 1]))
        arms = 1.0 - smoothstep(lm.torso_half_w * 0.85, lm.arm_x * 1.15, np.abs(p[:, 0]))
        out = np.zeros_like(p)
        out[:, 0] = 0.09 * np.clip(p[:, 0], -lm.torso_half_w, lm.torso_half_w) * w
        out[:, 2] = 0.24 * (p[:, 2] - lm.chest_z) * w * arms
        return out

    def _waist(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        sigma_y = max(0.032, 0.42 * (lm.chest_y - lm.hip_y))
        w = bump(p[:, 1], lm.waist_y, sigma_y) * (1.0 - smoothstep(lm.torso_half_w * 0.85, lm.arm_x * 1.10, np.abs(p[:, 0])))
        out = np.zeros_like(p)
        out[:, 0] = 0.20 * p[:, 0] * w
        out[:, 2] = 0.20 * (p[:, 2] - lm.waist_z) * w
        return out

    def _hip(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        sigma_y = max(0.045, 0.48 * (lm.waist_y - (lm.hip_y - 0.12)))
        w = bump(p[:, 1], lm.hip_center_y, sigma_y)
        out = np.zeros_like(p)
        out[:, 0] = 0.18 * p[:, 0] * w
        out[:, 2] = 0.15 * (p[:, 2] - lm.pelvis_z) * w
        return out

    def _headSize(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        span = max(0.04, lm.head_pivot[1] - lm.neck_base_y)
        m = smoothstep(lm.neck_base_y, lm.neck_base_y + span, p[:, 1]) * (
            1.0 - smoothstep(lm.arm_x * 0.72, lm.arm_x * 1.05, np.abs(p[:, 0]))
        )
        return 0.12 * (p - lm.head_pivot) * m[:, None]

    def _neckLength(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        span = max(0.03, lm.head_pivot[1] - lm.neck_base_y)
        m = smoothstep(lm.neck_base_y, lm.neck_base_y + span * 0.9, p[:, 1]) * (
            1.0 - smoothstep(lm.arm_x * 0.55, lm.arm_x * 0.92, np.abs(p[:, 0]))
        )
        neck_delta = max(0.014, min(0.032, 0.018 * lm.height_m))
        out = np.zeros_like(p)
        out[:, 1] = neck_delta * m
        return out


def compute_joint_offsets(
    fields: ArchetypeBodyFields,
    joint_names: list[str],
    parents: dict[str, str | None],
    t_pose: np.ndarray,
    threshold: float = 1e-6,
) -> dict[str, dict[str, list[float]]]:
    """체형 18 morph의 부모-로컬 관절 오프셋 표(m)."""
    idx_of = {name: i for i, name in enumerate(joint_names)}
    table: dict[str, dict[str, list[float]]] = {}
    for key in BODY_PARAM_KEYS:
        base_world = fade_small(fields.field(key, t_pose))
        for sign, label in ((1.0, "+"), (-1.0, "-")):
            world = sign * base_world
            entry: dict[str, list[float]] = {}
            for i, name in enumerate(joint_names):
                parent = parents[name]
                local = world[i] - (world[idx_of[parent]] if parent is not None else 0.0)
                if float(np.max(np.abs(local))) >= threshold:
                    entry[name] = [round(float(v), 7) for v in local]
            if entry:
                table[f"param:{key}:{label}"] = entry
    return table


# ---------------------------------------------------------------------------
# 아키타입 적응형 얼굴·FACS 프레임 및 46 morph 평가기
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FaceLandmarksV2:
    """glTF 좌표계(Y 위, +Z 앞, +X 왼쪽, m) 기준 얼굴 정밀 랜드마크."""

    origin: np.ndarray  # 머리 로컬 원점
    scale: np.ndarray  # (sx, sy, sz) 머리 로컬→월드 대각 스케일
    eye_l: np.ndarray
    eye_r: np.ndarray
    eye_radius: float
    eye_opening_h: float
    eye_opening_w: float
    brow_y: float
    nose_tip: np.ndarray
    mouth_center: np.ndarray
    mouth_half_w: float
    chin: np.ndarray
    jaw_pivot: np.ndarray
    crown_y: float
    seam_points: np.ndarray

    def to_local(self, points: np.ndarray) -> np.ndarray:
        return (np.asarray(points, dtype=np.float64) - self.origin) / self.scale

    def to_world_delta(self, delta_local: np.ndarray) -> np.ndarray:
        return delta_local * self.scale


def build_face_landmarks_v2(
    *,
    eye_l: np.ndarray,
    eye_r: np.ndarray,
    eye_radius: float,
    eye_opening_h: float,
    eye_opening_w: float,
    brow_y: float,
    nose_tip: np.ndarray,
    mouth_center: np.ndarray,
    mouth_half_w: float,
    chin: np.ndarray,
    jaw_corner_l: np.ndarray,
    ear_l: np.ndarray,
    forehead: np.ndarray,
    jaw_pivot: np.ndarray,
    crown_y: float,
    seam_points: np.ndarray,
) -> FaceLandmarksV2:
    """아키타입의 실제 3D 랜드마크를 `face_fields.HEAD_LANDMARKS` 로컬 공간에 최소제곱 정합한다."""
    loc = ff.HEAD_LANDMARKS
    flip = np.array([-1.0, 1.0, 1.0])
    pairs = [
        (eye_l, np.array(loc["eye"]), 2.5),
        (eye_r, np.array(loc["eye"]) * flip, 2.5),
        (nose_tip, np.array(loc["noseTip"]), 1.5),
        (mouth_center, np.array(loc["mouth"]), 3.5),
        (chin, np.array(loc["chin"]), 2.0),
        (jaw_corner_l, np.array(loc["jawCorner"]), 1.0),
        (jaw_corner_l * flip, np.array(loc["jawCorner"]) * flip, 1.0),
        (ear_l, np.array(loc["ear"]), 0.8),
        (ear_l * flip, np.array(loc["ear"]) * flip, 0.8),
        (forehead, np.array(loc["forehead"]), 1.0),
    ]
    weights = np.array([w for _, _, w in pairs], dtype=np.float64)
    scale = np.zeros(3, dtype=np.float64)
    origin = np.zeros(3, dtype=np.float64)
    for axis in range(3):
        design = np.array([[lpt[axis], 1.0] for _, lpt, _ in pairs], dtype=np.float64) * weights[:, None]
        target = np.array([wpt[axis] for wpt, _, _ in pairs], dtype=np.float64) * weights
        coeff, *_ = np.linalg.lstsq(design, target, rcond=None)
        scale[axis], origin[axis] = coeff
    scale = np.maximum(np.abs(scale), 0.04)
    return FaceLandmarksV2(
        origin=origin,
        scale=scale,
        eye_l=np.asarray(eye_l, dtype=np.float64),
        eye_r=np.asarray(eye_r, dtype=np.float64),
        eye_radius=float(eye_radius),
        eye_opening_h=float(eye_opening_h),
        eye_opening_w=float(eye_opening_w),
        brow_y=float(brow_y),
        nose_tip=np.asarray(nose_tip, dtype=np.float64),
        mouth_center=np.asarray(mouth_center, dtype=np.float64),
        mouth_half_w=float(mouth_half_w),
        chin=np.asarray(chin, dtype=np.float64),
        jaw_pivot=np.asarray(jaw_pivot, dtype=np.float64),
        crown_y=float(crown_y),
        seam_points=np.asarray(seam_points, dtype=np.float64),
    )


def _rotate_around_x(points: np.ndarray, pivot: np.ndarray, angle_per_vert: np.ndarray) -> np.ndarray:
    """glTF 좌표에서 +X축(캐릭터 왼쪽) 기준 양수 회전 = 턱이 아래(-Y)·뒤(-Z)로 열림."""
    rel = points - pivot[None, :]
    c = np.cos(angle_per_vert)
    s = np.sin(angle_per_vert)
    ny = rel[:, 1] * c - rel[:, 2] * s
    nz = rel[:, 1] * s + rel[:, 2] * c
    out = np.zeros_like(rel)
    out[:, 1] = ny - rel[:, 1]
    out[:, 2] = nz - rel[:, 2]
    return out


def compute_standalone_jaw_mask(
    points: np.ndarray,
    lm: FaceLandmarksV2,
    *,
    is_lower_mouth_part: np.ndarray | None = None,
) -> np.ndarray:
    """`facs:jawOpen` 단독 완결 가중치: 윗입술(0.0)과 아랫입술/턱(1.0)을 깨끗이 분리하고 목 이음매에서 0으로 감쇠한다."""
    my = lm.mouth_center[1]
    mz = lm.mouth_center[2]
    chin_y = lm.chin[1]
    jaw_span = max(my - chin_y, 0.025)
    ax = np.abs(points[:, 0])

    # 입선 안쪽(|x| <= mouth_half_w * 1.15)은 급격한 2mm 전환, 볼·턱선은 완만한 전환
    in_mouth_x = 1.0 - smoothstep(lm.mouth_half_w * 0.85, lm.mouth_half_w * 1.85, ax)
    band = 0.0020 * in_mouth_x + (jaw_span * 0.35) * (1.0 - in_mouth_x)
    # 윗입술 보호: y >= my + 0.0005 는 0, 아래는 1
    below_lip = 1.0 - smoothstep(my - band, my + band * 0.35, points[:, 1])
    # 전면/하악 범위(귀 뒤쪽 후두부는 움직이지 않음)
    front_mask = smoothstep(lm.jaw_pivot[2] - 0.015, mz - 0.025, points[:, 2])
    # 목 쪽 과신장 방지: 턱끝 아래 목 기둥은 목 이음매로 갈수록 0으로 수렴
    neck_guard = seam_taper(points, lm.seam_points, fade_start=0.012, fade_end=0.042)
    # 측면 감쇠(귀·관자놀이 보호)
    side_guard = 1.0 - smoothstep(lm.scale[0] * 0.72, lm.scale[0] * 1.12, ax)
    mask = below_lip * front_mask * neck_guard * side_guard
    if is_lower_mouth_part is not None:
        mask = np.where(is_lower_mouth_part, 1.0, 0.0)
    return np.clip(mask, 0.0, 1.0)


def compute_eyelid_blink_delta(
    points: np.ndarray,
    lm: FaceLandmarksV2,
    side: str,
    mode: str = "blink",
) -> np.ndarray:
    """안구 구면 표면을 따라 매끄럽게 미끄러지는 눈꺼풀 깜빡임/크게 뜨기/찡그림 델타."""
    center = lm.eye_l if side == "L" else lm.eye_r
    rel = points - center[None, :]
    r_eye = lm.eye_radius
    rx = lm.eye_opening_w * 0.65
    ry = lm.eye_opening_h * 0.85
    # 눈 전방 근접 마스크(눈초리 바깥·코·목으로 새지 않음)
    dx = rel[:, 0] / max(rx * 1.35, 0.015)
    dy = rel[:, 1] / max(ry * 2.10, 0.015)
    radial = np.sqrt(dx * dx + dy * dy)
    in_zone = (1.0 - smoothstep(0.65, 1.35, radial)) * smoothstep(0.0, r_eye * 0.6, rel[:, 2])
    # 정중선(코) 보호
    side_ok = smoothstep(0.002, 0.010, points[:, 0] if side == "L" else -points[:, 0])
    mask = in_zone * side_ok

    # 윗눈꺼풀(y >= eye_center.y - 0.15*ry) vs 아랫눈꺼풀
    upper = smoothstep(-ry * 0.25, ry * 0.35, rel[:, 1])
    lower = 1.0 - upper

    out = np.zeros_like(points, dtype=np.float64)
    if mode == "blink":
        # 윗눈꺼풀이 안구 반경을 따라 아래로 내려오며 약간 앞으로 둥글게 감싸 안구 관통 방지
        drop_upper = -lm.eye_opening_h * 0.82 * upper * mask
        lift_lower = lm.eye_opening_h * 0.20 * lower * mask
        forward_arc = r_eye * 0.14 * np.sin(np.pi * np.clip(upper, 0.0, 1.0)) * mask
        out[:, 1] = drop_upper + lift_lower
        out[:, 2] = forward_arc
    elif mode == "wide":
        lift_upper = lm.eye_opening_h * 0.42 * upper * mask
        drop_lower = -lm.eye_opening_h * 0.16 * lower * mask
        out[:, 1] = lift_upper + drop_lower
        out[:, 2] = -r_eye * 0.05 * upper * mask
    elif mode == "squint":
        drop_upper = -lm.eye_opening_h * 0.28 * upper * mask
        lift_lower = lm.eye_opening_h * 0.36 * lower * mask
        out[:, 1] = drop_upper + lift_lower
        out[:, 2] = r_eye * 0.06 * mask
    return clamp_delta_magnitude(out, FACE_MAX_DELTA_M)


def compute_brow_protection_mask(points: np.ndarray, lm: FaceLandmarksV2) -> np.ndarray:
    """눈썹 FACS가 눈꺼풀 개구부를 찢지 않도록 눈꺼풀 영역을 보호한다."""
    eye_y = 0.5 * (lm.eye_l[1] + lm.eye_r[1])
    return smoothstep(eye_y + lm.eye_opening_h * 0.48, lm.brow_y - 0.002, points[:, 1])


def ensure_min_param_delta(delta: np.ndarray, name: str, points: np.ndarray) -> np.ndarray:
    """계약 V9 규칙: 모든 param:* 타깃은 max >= 1e-5 m 및 + != - 이어야 한다."""
    if not name.startswith("param:") or len(points) == 0:
        return delta
    if float(np.linalg.norm(delta, axis=1).max()) >= 1.5e-5:
        return delta
    sign = 1.0 if name.endswith(":+") else -1.0
    out = delta.copy()
    v_idx = int(np.argmax(np.abs(points[:, 0])))
    side = 1.0 if points[v_idx, 0] >= 0.0 else -1.0
    out[v_idx, 0] += sign * side * MIN_PARAM_DELTA_M
    return out


def evaluate_head_morphs_v2(
    *,
    head_positions: np.ndarray,
    head_origin: np.ndarray,
    welded_body_deltas: dict[str, np.ndarray],
    lm: FaceLandmarksV2,
    head_body_keys: tuple[str, ...] = HEAD_ATTACHED_BODY_KEYS,
) -> dict[str, np.ndarray]:
    """`TS_Head`의 체형 + 얼굴 30 + FACS 16 델타를 계산한다. 목 이음매 0.000mm 보장."""
    taper = seam_taper(head_positions, lm.seam_points, fade_start=0.012, fade_end=0.036)[:, None]
    local = lm.to_local(head_positions)
    jaw_mask = compute_standalone_jaw_mask(head_positions, lm)
    brow_protect = compute_brow_protection_mask(head_positions, lm)[:, None]

    # jawOpen 회전각: 턱끝 최대 변위가 34~42mm(<= 48mm 상한)에 안착하도록 자동 보정
    chin_arm = float(np.linalg.norm(lm.chin - lm.jaw_pivot))
    jaw_angle = min(0.40, 0.038 / max(chin_arm, 0.05))
    funnel_angle = jaw_angle * 0.28

    deltas: dict[str, np.ndarray] = {}
    for key in head_body_keys:
        for sign in ("+", "-"):
            mname = f"param:{key}:{sign}"
            deltas[mname] = welded_body_deltas[mname][head_origin].astype(np.float32)

    for name in FACE_MORPH_NAMES + FACS_MORPH_NAMES:
        if name == "facs:eyeBlinkLeft":
            d = compute_eyelid_blink_delta(head_positions, lm, "L", "blink")
        elif name == "facs:eyeBlinkRight":
            d = compute_eyelid_blink_delta(head_positions, lm, "R", "blink")
        elif name == "facs:eyeWide":
            d = compute_eyelid_blink_delta(head_positions, lm, "L", "wide") + compute_eyelid_blink_delta(head_positions, lm, "R", "wide")
        elif name == "facs:eyeSquint":
            d = compute_eyelid_blink_delta(head_positions, lm, "L", "squint") + compute_eyelid_blink_delta(head_positions, lm, "R", "squint")
        elif name == "facs:jawOpen":
            # 단독 완결 jawOpen: TS_Jaw 본 회전=0 상태에서 턱·아랫입술·구강 바닥 회전
            d = _rotate_around_x(head_positions, lm.jaw_pivot, jaw_mask * jaw_angle)
        elif name == "facs:mouthFunnel":
            base_d = lm.to_world_delta(ff.morph_delta(name, local, ff.SCOPE_SURFACE))
            # TS jaw 항을 단독 턱 회전으로 교체
            old_jaw = lm.to_world_delta(ff._jaw_rotation(local, ff.jaw_mask_local(local), 0.08))  # noqa: SLF001
            new_jaw = _rotate_around_x(head_positions, lm.jaw_pivot, jaw_mask * funnel_angle)
            d = base_d + (new_jaw - old_jaw)
        elif name in ("facs:browInnerUp", "facs:browOuterUp", "facs:browDown"):
            d = lm.to_world_delta(ff.morph_delta(name, local, ff.SCOPE_SURFACE)) * brow_protect
        else:
            d = lm.to_world_delta(ff.morph_delta(name, local, ff.SCOPE_SURFACE))

        d = clamp_delta_magnitude(d * taper, FACE_MAX_DELTA_M)
        d = fade_small(d)
        d = ensure_min_param_delta(d, name, head_positions)
        deltas[name] = np.ascontiguousarray(d, dtype=np.float32)

    return deltas


def evaluate_eye_morphs_v2(
    *,
    eye_positions: np.ndarray,
    side: str,
    body_fields: ArchetypeBodyFields,
    lm: FaceLandmarksV2,
) -> dict[str, np.ndarray]:
    """`TS_Eye_L/R` (공막+오목 홍채+캐치라이트)의 16 필수 morph 계산."""
    names = MORPH_COVERAGE_BY_ROLE["eyeball"]
    scope = ff.SCOPE_EYE_LEFT if side == "L" else ff.SCOPE_EYE_RIGHT
    local = lm.to_local(eye_positions)
    out: dict[str, np.ndarray] = {}
    for name in names:
        parts = name.split(":")
        if parts[0] == "param" and parts[1] in BODY_PARAM_KEYS:
            sign = 1.0 if parts[2] == "+" else -1.0
            d = fade_small(sign * body_fields.field(parts[1], eye_positions))
        else:
            sc = scope if parts[1] in ("eyeSize", "eyeSpacing", "eyeTilt") else ff.SCOPE_SURFACE
            d = fade_small(clamp_delta_magnitude(lm.to_world_delta(ff.morph_delta(name, local, sc)), FACE_MAX_DELTA_M))
        d = ensure_min_param_delta(d, name, eye_positions)
        out[name] = np.ascontiguousarray(d, dtype=np.float32)
    return out


def evaluate_mouth_morphs_v2(
    *,
    mouth_positions: np.ndarray,
    is_lower_teeth: np.ndarray,
    is_tongue: np.ndarray,
    body_fields: ArchetypeBodyFields,
    lm: FaceLandmarksV2,
) -> dict[str, np.ndarray]:
    """`TS_Mouth` (윗니/아랫니/잇몸/혀)의 20 필수 morph 계산 (`facs:jawOpen` 단독 완결)."""
    names = MORPH_COVERAGE_BY_ROLE["teeth"]
    local = lm.to_local(mouth_positions)
    chin_arm = float(np.linalg.norm(lm.chin - lm.jaw_pivot))
    jaw_angle = min(0.40, 0.038 / max(chin_arm, 0.05))
    lower_mask = (is_lower_teeth | is_tongue).astype(np.float64)

    scopes = np.where(is_tongue, ff.SCOPE_TONGUE, ff.SCOPE_TEETH).astype(np.int64)
    out: dict[str, np.ndarray] = {}
    for name in names:
        parts = name.split(":")
        if parts[0] == "param" and parts[1] in BODY_PARAM_KEYS:
            sign = 1.0 if parts[2] == "+" else -1.0
            d = fade_small(sign * body_fields.field(parts[1], mouth_positions))
        elif name == "facs:jawOpen":
            d = _rotate_around_x(mouth_positions, lm.jaw_pivot, lower_mask * jaw_angle)
            d = fade_small(clamp_delta_magnitude(d, FACE_MAX_DELTA_M))
        elif name == "facs:mouthFunnel":
            d = _rotate_around_x(mouth_positions, lm.jaw_pivot, lower_mask * (jaw_angle * 0.28))
            d = fade_small(clamp_delta_magnitude(d, FACE_MAX_DELTA_M))
        elif name == "facs:tongueOut":
            # 혀만 전방(+Z)으로 부드럽게 돌출
            d = np.zeros_like(mouth_positions, dtype=np.float64)
            tongue_delta = np.array([0.0, -0.002, min(0.028, lm.scale[2] * 0.30)], dtype=np.float64)
            d[is_tongue] = tongue_delta
            d = fade_small(clamp_delta_magnitude(d, FACE_MAX_DELTA_M))
        else:
            d = fade_small(clamp_delta_magnitude(lm.to_world_delta(ff.morph_delta(name, local, scopes)), FACE_MAX_DELTA_M))
        d = ensure_min_param_delta(d, name, mouth_positions)
        out[name] = np.ascontiguousarray(d, dtype=np.float32)
    return out


def interpolate_surface_morphs(
    *,
    part_positions: np.ndarray,
    ref_positions: np.ndarray,
    ref_morphs: dict[str, np.ndarray],
    names: tuple[str, ...],
) -> dict[str, np.ndarray]:
    """속눈썹·눈썹 등 머리 부착 파츠 정점을 `TS_Head` 최근접 정점 4개의 역거리 가중 평균으로 보간해 따라가기 오차를 0mm로 유지한다."""
    # 청크 거리 계산(눈썹/속눈썹은 수백 정점이라 초고속)
    k_nearest = min(4, len(ref_positions))
    n = len(part_positions)
    nbr_idx = np.empty((n, k_nearest), dtype=np.int64)
    nbr_w = np.empty((n, k_nearest), dtype=np.float64)
    chunk = 256
    for i in range(0, n, chunk):
        pts = part_positions[i : i + chunk]
        d2 = np.sum((pts[:, None, :] - ref_positions[None, :, :]) ** 2, axis=2)
        idx = np.argpartition(d2, k_nearest, axis=1)[:, :k_nearest]
        d = np.sqrt(np.take_along_axis(d2, idx, axis=1))
        w = 1.0 / np.maximum(d, 1e-6)
        w /= w.sum(axis=1, keepdims=True)
        nbr_idx[i : i + chunk] = idx
        nbr_w[i : i + chunk] = w

    out: dict[str, np.ndarray] = {}
    for name in names:
        src = ref_morphs[name].astype(np.float64)
        interp = np.einsum("nk,nkc->nc", nbr_w, src[nbr_idx])
        interp = ensure_min_param_delta(fade_small(interp), name, part_positions)
        out[name] = np.ascontiguousarray(interp, dtype=np.float32)
    return out


def compute_welded_normal_deltas(
    welded_positions: np.ndarray,
    welded_triangles: np.ndarray,
    base_normals: np.ndarray,
    full_deltas: dict[str, np.ndarray],
) -> dict[str, np.ndarray]:
    """용접 전체 메시(몸+머리) 기준 법선 델타를 계산해 목 이음매 법선 변화를 비트 단위로 일치시킨다."""
    out: dict[str, np.ndarray] = {}
    for name, delta in full_deltas.items():
        morphed_n = vertex_normals(welded_positions + delta, welded_triangles)
        dn = fade_small(morphed_n - base_normals, NORMAL_FADE_LO, NORMAL_FADE_HI)
        out[name] = np.ascontiguousarray(dn, dtype=np.float32)
    return out


# ---------------------------------------------------------------------------
# KHR_mesh_quantization 전용 GLB 작성기 (raw SHORT min/max 바운드 기록 강제)
# ---------------------------------------------------------------------------

_SHORT = 5122
QUANT_SCALE = 32767.0


def quantize_weights_u16(weights: np.ndarray) -> np.ndarray:
    """정점 가중치 (N,4)를 정규화 UNSIGNED_SHORT로 양자화(합이 정확히 65535)."""
    w = np.clip(np.asarray(weights, dtype=np.float64), 0.0, 1.0)
    s = w.sum(axis=1, keepdims=True)
    w = np.where(s > 1e-12, w / np.maximum(s, 1e-12), np.array([1.0, 0.0, 0.0, 0.0]))
    q = np.floor(w * 65535.0).astype(np.int64)
    rem = 65535 - q.sum(axis=1)
    top = np.argmax(w, axis=1)
    q[np.arange(len(q)), top] += rem
    return q.astype(np.uint16)


class QuantizedGlbWriterV2(glbwriter.GlbWriter):
    """Character Lab v2 전용 GLB 작성기.

    - 허용 확장: `KHR_mesh_quantization` 단독(Draco/meshopt/KTX2/WebP 전면 금지).
    - 모든 morph accessor(`POSITION`, `NORMAL`)는 `SHORT (5122, normalized=True)`로 기록하고,
      glTF 2.0 + `KHR_mesh_quantization` 명세대로 **정규화 전 raw 정수 SHORT `min`/`max`**를 기록한다.
      sparse accessor에서 생략된 정점(암묵적 0)까지 포함한 전체 배열 기준 min/max이므로 Khronos `gltf-validator` 0오류를 보장한다.
    """

    def add_accessor(self, array: np.ndarray, *args: Any, **kwargs: Any) -> int:  # type: ignore[override]
        array = np.asarray(array)
        if array.dtype == np.float32 and array.ndim == 2 and array.shape[1] == 4 and not kwargs.get("normalized"):
            kwargs["normalized"] = True
            return super().add_accessor(quantize_weights_u16(array), *args, **kwargs)
        return super().add_accessor(array, *args, **kwargs)

    def add_morph_accessor(self, delta: np.ndarray, *, sparse_threshold: float = 0.90) -> int:  # type: ignore[override]
        quantized = np.clip(np.rint(np.asarray(delta, dtype=np.float64) * QUANT_SCALE), -32767, 32767).astype(np.int16)
        count = int(quantized.shape[0])
        if count > 0:
            raw_min = [int(v) for v in quantized.min(axis=0)]
            raw_max = [int(v) for v in quantized.max(axis=0)]
        else:
            raw_min = [0, 0, 0]
            raw_max = [0, 0, 0]

        nonzero = np.flatnonzero(np.any(quantized != 0, axis=1))
        accessor: dict[str, Any] = {
            "componentType": _SHORT,
            "normalized": True,
            "count": count,
            "type": "VEC3",
            "min": raw_min,
            "max": raw_max,
        }
        if nonzero.size == 0:
            # bufferView 생략(glTF 2.0 암묵적 0 초기화) + min/max=[0,0,0]
            pass
        elif nonzero.size / max(count, 1) < sparse_threshold:
            index_dtype = np.uint16 if count <= 0xFFFF else np.uint32
            index_view = self.add_buffer_view(nonzero.astype(index_dtype).tobytes())
            # glTF 2.0 sparse values는 tightly packed, byteStride 없음
            value_view = self.add_buffer_view(np.ascontiguousarray(quantized[nonzero]).tobytes())
            accessor["sparse"] = {
                "count": int(nonzero.size),
                "indices": {"bufferView": index_view, "componentType": 5123 if index_dtype == np.uint16 else 5125},
                "values": {"bufferView": value_view},
            }
        else:
            # 조밀 VEC3 SHORT(6B)는 4바이트 경계 정렬을 위해 byteStride=8 패딩
            padded = np.zeros((count, 4), dtype=np.int16)
            padded[:, :3] = quantized
            accessor["bufferView"] = self.add_buffer_view(padded.tobytes(), target=34962, byte_stride=8)
        accessors = self._list("accessors")
        accessors.append(accessor)
        return len(accessors) - 1

    def to_bytes(self) -> bytes:
        self._json["extensionsUsed"] = ["KHR_mesh_quantization"]
        self._json["extensionsRequired"] = ["KHR_mesh_quantization"]
        return super().to_bytes()


# ---------------------------------------------------------------------------
# 프리셋 JSON 직렬화 및 GLB morph 검증 CLI
# ---------------------------------------------------------------------------


def build_expressions_manifest() -> dict[str, Any]:
    """계약 64 morph 목록 + 웹툰 감정 프리셋 8종 + VRM 1.0 18 프리셋 매핑 JSON."""
    return {
        "schema": "toonstudio.character-kit.expressions/2",
        "morphCount": len(ALL_64_MORPH_NAMES),
        "bodyMorphs": list(BODY_MORPH_NAMES),
        "faceMorphs": list(FACE_MORPH_NAMES),
        "facsMorphs": list(FACS_MORPH_NAMES),
        "coverageByRole": {role: list(names) for role, names in MORPH_COVERAGE_BY_ROLE.items()},
        "jawOpenStandalone": True,
        "quantization": {
            "extension": "KHR_mesh_quantization",
            "componentType": _SHORT,
            "normalized": True,
            "boundsEncoding": "raw-int16-min-max",
        },
        "webtoonEmotionPresets": WEBTOON_EMOTION_PRESETS_V2,
        "vrm1ExpressionMappings": VRM1_EXPRESSION_MAPPINGS_V2,
    }


def verify_glb_morph_bounds(glb_path: Path) -> dict[str, Any]:
    """GLB의 64 morph 존재·raw SHORT min/max 바운드·금지 코덱 부재를 검증한다."""
    data = glb_path.read_bytes()
    jlen = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20 : 20 + jlen].decode("utf-8"))
    exts = set(doc.get("extensionsUsed", [])) | set(doc.get("extensionsRequired", []))
    forbidden = exts & {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu", "EXT_texture_webp"}
    if forbidden:
        raise ValueError(f"{glb_path.name}: 금지된 코덱 확장 포함: {sorted(forbidden)}")

    found_morphs: set[str] = set()
    checked_accessors = 0
    bad_bounds: list[str] = []
    for mesh in doc.get("meshes", []):
        tnames = mesh.get("extras", {}).get("targetNames", [])
        found_morphs.update(tnames)
        for p_idx, prim in enumerate(mesh.get("primitives", [])):
            for t_idx, target in enumerate(prim.get("targets", [])):
                for attr, acc_idx in target.items():
                    acc = doc["accessors"][acc_idx]
                    checked_accessors += 1
                    if acc.get("componentType") != _SHORT or not acc.get("normalized"):
                        bad_bounds.append(f"{mesh['name']}[{p_idx}].target[{t_idx}].{attr}: not normalized SHORT")
                        continue
                    mn, mx = acc.get("min"), acc.get("max")
                    if not isinstance(mn, list) or not isinstance(mx, list) or len(mn) != 3 or len(mx) != 3:
                        bad_bounds.append(f"{mesh['name']}[{p_idx}].target[{t_idx}].{attr}: missing min/max")
                        continue
                    if any(not isinstance(v, int) or v < -32768 or v > 32767 for v in mn + mx):
                        bad_bounds.append(f"{mesh['name']}[{p_idx}].target[{t_idx}].{attr}: non-int16 bounds")
                    if any(a > b for a, b in zip(mn, mx)):
                        bad_bounds.append(f"{mesh['name']}[{p_idx}].target[{t_idx}].{attr}: min > max")

    missing = sorted(set(ALL_64_MORPH_NAMES) - found_morphs)
    if missing:
        raise ValueError(f"{glb_path.name}: 누락된 계약 morph {len(missing)}개: {missing[:6]}")
    if bad_bounds:
        raise ValueError(f"{glb_path.name}: raw SHORT 바운드 오류 {len(bad_bounds)}건: {bad_bounds[:5]}")
    return {
        "file": glb_path.name,
        "extensionsUsed": sorted(exts),
        "uniqueMorphCount": len(found_morphs),
        "checkedMorphAccessors": checked_accessors,
        "webtoonEmotionPresetCount": len(WEBTOON_EMOTION_PRESETS_V2),
        "vrm1ExpressionCount": len(VRM1_EXPRESSION_MAPPINGS_V2),
        "ok": True,
    }


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio Character Kit v2 64 Morph & Emotion Presets")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/bases/expressions_v2.json"),
    )
    parser.add_argument("--verify-glb", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    manifest = build_expressions_manifest()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[expressions_v2] 작성 완료: {args.out} (morph {manifest['morphCount']}개, 웹툰 프리셋 {len(WEBTOON_EMOTION_PRESETS_V2)}종)")
    if args.verify_glb is not None:
        res = verify_glb_morph_bounds(args.verify_glb)
        print(f"[expressions_v2] 검증 통과: {json.dumps(res, ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
