"""체형 morph 9종(±)의 위치 변위 필드와 관절 오프셋.

각 필드는 T-포즈 레스트 위치 (N,3)[m]를 받아 "+1" 타깃의 변위 (N,3)을 돌려준다("−1"은 부호 반전).
크기는 `docs/authored-kit-spec.md` 4.4의 정량 기준(절차 소스 `resolveProportions`와 같은 의미)을 따른다.

    height ±1 = 전신 ±8 %, legLength ±1 = 다리 ±10 %, armLength ±1 = 팔 ±12 %, shoulderWidth ±1 = 어깨 반폭 ±20 %,
    hip ±1 = 엉덩이 반폭 ±20 %·깊이 ±15 %, waist ±1 = 허리 반폭·깊이 ±20 %, chestDepth ±1 = 가슴 깊이 ±25 %·폭 ±10 %,
    headSize ±1 = 머리 ±12 %, neckLength ±1 = 목 길이 ±40 %

필드는 공간 함수이므로 몸·속옷·의상·신발 어느 메시든 같은 규칙으로 변위가 나온다(심 일치와 따라가기 검사에 유리).
관절 변위도 같은 필드를 관절 위치에서 평가해 만든다(부모 로컬 = 자식 월드 변위 − 부모 월드 변위, 회전 항등).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .rig import MIXAMO, Rig

BODY_KEYS = ("height", "shoulderWidth", "chestDepth", "waist", "hip", "armLength", "legLength", "headSize", "neckLength")


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def bump(x: np.ndarray, center: float, width: float) -> np.ndarray:
    return np.exp(-(((x - center) / width) ** 2))


def soft_min(x: np.ndarray, limit: float, k: float) -> np.ndarray:
    """min(x, limit)를 폭 k로 매끄럽게 한 값."""
    a = -x / k
    b = -limit / k
    m = np.maximum(a, b)
    return -k * (m + np.log(np.exp(a - m) + np.exp(b - m)))


def soft_relu(x: np.ndarray, k: float) -> np.ndarray:
    """max(x, 0)를 폭 k로 매끄럽게 한 값."""
    return k * np.logaddexp(0.0, x / k)


@dataclass(frozen=True)
class BodyLandmarks:
    """T-포즈 레스트에서 필드가 쓰는 기준 위치."""

    hip_y: float
    arm_x: float
    arm_y: float
    chest_y: float
    waist_y: float
    hip_center_y: float
    neck_base_y: float
    head_pivot: np.ndarray
    foot_z: float
    chest_z: float
    waist_z: float
    pelvis_z: float

    @staticmethod
    def from_rig(rig: Rig) -> BodyLandmarks:
        t = rig.t_pose
        j = rig.index
        hip_y = float((t[j(MIXAMO + "LeftUpLeg")][1] + t[j(MIXAMO + "RightUpLeg")][1]) / 2.0)
        arm_x = float((abs(t[j(MIXAMO + "LeftArm")][0]) + abs(t[j(MIXAMO + "RightArm")][0])) / 2.0)
        arm_y = float((t[j(MIXAMO + "LeftArm")][1] + t[j(MIXAMO + "RightArm")][1]) / 2.0)
        spine = t[j(MIXAMO + "Spine")]
        spine1 = t[j(MIXAMO + "Spine1")]
        spine2 = t[j(MIXAMO + "Spine2")]
        head = t[j(MIXAMO + "Head")]
        feet = (t[j(MIXAMO + "LeftFoot")] + t[j(MIXAMO + "RightFoot")]) / 2.0
        toes = (t[j(MIXAMO + "LeftToeBase")] + t[j(MIXAMO + "RightToeBase")]) / 2.0
        return BodyLandmarks(
            hip_y=hip_y,
            arm_x=arm_x,
            arm_y=arm_y,
            chest_y=float((spine1[1] + spine2[1]) / 2.0),
            waist_y=float(spine[1] + 0.06),
            hip_center_y=float(hip_y + 0.02),
            neck_base_y=float(t[j(MIXAMO + "Neck")][1] - 0.03),
            head_pivot=np.array([0.0, head[1] - 0.05, head[2] - 0.01]),
            foot_z=float((feet[2] + toes[2]) / 2.0),
            chest_z=float(spine2[2]),
            waist_z=float(spine[2] - 0.01),
            pelvis_z=float(t[j(MIXAMO + "Hips")][2]),
        )


class BodyFields:
    """체형 필드 모음. `field(key, points)`는 "+1" 타깃의 변위를 돌려준다."""

    def __init__(self, landmarks: BodyLandmarks) -> None:
        self.lm = landmarks

    def field(self, key: str, p: np.ndarray) -> np.ndarray:
        return getattr(self, f"_{key}")(np.asarray(p, dtype=np.float64))

    # --- 전신 ---------------------------------------------------------------
    def _height(self, p: np.ndarray) -> np.ndarray:
        center = np.array([0.0, 0.0, self.lm.foot_z])
        return 0.08 * (p - center)

    def _legLength(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        out = np.zeros_like(p)
        out[:, 1] = 0.10 * soft_min(p[:, 1], lm.hip_y, 0.035)
        return out

    # --- 상체 ---------------------------------------------------------------
    def _shoulderWidth(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        ax = np.abs(p[:, 0])
        side = np.where(p[:, 0] >= 0.0, 1.0, -1.0)
        across = smoothstep(0.05, lm.arm_x + 0.03, ax)
        vertical = smoothstep(1.0, 1.25, p[:, 1]) * (1.0 - smoothstep(1.37, 1.43, p[:, 1]))
        out = np.zeros_like(p)
        out[:, 0] = side * 0.20 * lm.arm_x * across * vertical
        return out

    def _armLength(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        ax = np.abs(p[:, 0])
        side = np.where(p[:, 0] >= 0.0, 1.0, -1.0)
        vertical = smoothstep(1.1, 1.25, p[:, 1])
        out = np.zeros_like(p)
        out[:, 0] = side * 0.12 * soft_relu(ax - lm.arm_x, 0.02) * vertical
        return out

    def _chestDepth(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        w = bump(p[:, 1], lm.chest_y + 0.02, 0.09)
        arms = 1.0 - smoothstep(0.12, 0.2, np.abs(p[:, 0]))
        out = np.zeros_like(p)
        out[:, 0] = 0.10 * np.clip(p[:, 0], -0.15, 0.15) * w
        out[:, 2] = 0.25 * (p[:, 2] - lm.chest_z) * w * arms
        return out

    def _waist(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        w = bump(p[:, 1], lm.waist_y, 0.07) * (1.0 - smoothstep(0.1, 0.18, np.abs(p[:, 0])))
        out = np.zeros_like(p)
        out[:, 0] = 0.20 * p[:, 0] * w
        out[:, 2] = 0.20 * (p[:, 2] - lm.waist_z) * w
        return out

    def _hip(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        w = bump(p[:, 1], lm.hip_center_y, 0.10)
        out = np.zeros_like(p)
        out[:, 0] = 0.20 * p[:, 0] * w
        out[:, 2] = 0.15 * (p[:, 2] - lm.pelvis_z) * w
        return out

    # --- 머리·목 ------------------------------------------------------------
    def _headSize(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        m = smoothstep(lm.neck_base_y + 0.015, lm.neck_base_y + 0.115, p[:, 1]) * (1.0 - smoothstep(0.08, 0.14, np.abs(p[:, 0])))
        return 0.12 * (p - lm.head_pivot) * m[:, None]

    def _neckLength(self, p: np.ndarray) -> np.ndarray:
        lm = self.lm
        m = smoothstep(lm.neck_base_y, lm.neck_base_y + 0.095, p[:, 1]) * (1.0 - smoothstep(0.07, 0.12, np.abs(p[:, 0])))
        out = np.zeros_like(p)
        out[:, 1] = 0.40 * 0.075 * m
        return out


def joint_offsets(fields: BodyFields, rig: Rig, key: str, sign: float, threshold: float = 1e-6) -> dict[str, list[float]]:
    """한 morph(`key`, 부호 sign)의 관절 오프셋 {joint: [dx,dy,dz]} (부모 로컬 평행이동에 더하는 양, m)."""
    world = sign * fields.field(key, rig.t_pose)
    result: dict[str, list[float]] = {}
    for i, name in enumerate(rig.names):
        parent = rig.parents[name]
        local = world[i] - (world[rig.index(parent)] if parent is not None else 0.0)
        if float(np.max(np.abs(local))) >= threshold:
            result[name] = [float(v) for v in local]
    return result
