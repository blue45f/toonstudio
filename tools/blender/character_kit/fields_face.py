"""HBM 머리 메시를 `face-fields` 로컬 공간에 정합하고 얼굴 morph 46종의 위치 델타를 만든다.

`face_fields.py`(TS 이식본)의 필드는 "머리 로컬 단위 반경 공간"에서 정의돼 있다. HBM 머리의 해부 지표(눈 중심, 귀, 턱 모서리,
코끝, 입 선, 턱끝, 이마)를 그 공간의 `HEAD_LANDMARKS`에 맞춰 축별 최소제곱으로 스케일·원점을 구하고(대각 스케일),
로컬 변위에 스케일을 곱해 월드 변위(m)로 되돌린다.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import face_fields as ff
from . import hbm

FACE_MORPH_NAMES = tuple([f"param:{key}:{sign}" for key in ff.FACE_PARAM_KEYS for sign in ("+", "-")] + [f"facs:{unit}" for unit in ff.FACS_UNITS])


@dataclass(frozen=True)
class HeadFrame:
    """월드 = origin + scale * 로컬."""

    origin: np.ndarray
    scale: np.ndarray
    residual_mm: dict[str, float]

    def to_local(self, points: np.ndarray) -> np.ndarray:
        return (np.asarray(points, dtype=np.float64) - self.origin) / self.scale

    def to_world_delta(self, delta_local: np.ndarray) -> np.ndarray:
        return delta_local * self.scale


def _vertices_of_set(body: hbm.Body, set_id: int) -> np.ndarray:
    return np.unique(body.faces[body.face_set == set_id].ravel())


def fit_head_frame(body: hbm.Body) -> HeadFrame:
    """HBM 머리 지표로 로컬 프레임을 맞춘다(T-포즈 몸 `body`; 머리는 A→T 변환에서 움직이지 않는다)."""
    p = body.positions
    local = ff.HEAD_LANDMARKS
    nose_pool = np.flatnonzero((np.abs(p[:, 0]) < 0.004) & (p[:, 1] > 1.47) & (p[:, 1] < 1.53) & (p[:, 2] > 0.1))
    nose_tip = p[nose_pool[np.argmax(p[nose_pool, 2])]]
    jaw = _vertices_of_set(body, hbm.JAW_SET)
    left_jaw = jaw[p[jaw, 0] > 0]
    jaw_corner = p[left_jaw[np.argmax(p[left_jaw, 0] * (p[left_jaw, 1] < 1.47))]]
    ear = p[_vertices_of_set(body, 4)].mean(axis=0)
    forehead_pool = np.flatnonzero((np.abs(p[:, 0]) < 0.003) & (np.abs(p[:, 1] - 1.59) < 0.004) & (p[:, 2] > 0.0))
    forehead = p[forehead_pool[np.argmax(p[forehead_pool, 2])]]
    eye_l = body.eyes["L"][0].mean(axis=0)
    eye_r = body.eyes["R"][0].mean(axis=0)
    flip = np.array([-1.0, 1.0, 1.0])
    # (이름, 월드, 로컬, 가중치). 입 선과 턱끝은 해부 지표라 HBM 값을 쓴다(입 선은 입술 틈의 중앙).
    pairs = [
        ("eyeL", eye_l, np.array(local["eye"]), 2.0),
        ("eyeR", eye_r, np.array(local["eye"]) * flip, 2.0),
        ("noseTip", nose_tip, np.array(local["noseTip"]), 1.0),
        ("mouth", np.array([0.0, 1.4645, 0.1444]), np.array(local["mouth"]), 1.5),
        ("chin", np.array([0.0, 1.4118, 0.091]), np.array(local["chin"]), 1.0),
        ("jawL", jaw_corner, np.array(local["jawCorner"]), 1.0),
        ("jawR", jaw_corner * flip, np.array(local["jawCorner"]) * flip, 1.0),
        ("earL", ear, np.array(local["ear"]), 0.7),
        ("earR", ear * flip, np.array(local["ear"]) * flip, 0.7),
        ("forehead", forehead, np.array(local["forehead"]), 0.7),
    ]
    scale = np.zeros(3)
    origin = np.zeros(3)
    weights = np.array([w for *_, w in pairs])
    for axis in range(3):
        design = np.array([[loc[axis], 1.0] for _, _, loc, _ in pairs]) * weights[:, None]
        target = np.array([world[axis] for _, world, _, _ in pairs]) * weights
        coefficient, *_ = np.linalg.lstsq(design, target, rcond=None)
        scale[axis], origin[axis] = coefficient
    residual = {name: float(np.linalg.norm((scale * loc + origin) - world) * 1000.0) for name, world, loc, _ in pairs}
    return HeadFrame(origin=origin, scale=scale, residual_mm=residual)


def face_deltas(frame: HeadFrame, points: np.ndarray, scope: int | np.ndarray, names: tuple[str, ...] = FACE_MORPH_NAMES) -> dict[str, np.ndarray]:
    """월드 좌표 점 (N,3)에 대한 얼굴 morph 이름별 월드 변위 (N,3) float32."""
    local = frame.to_local(points)
    result: dict[str, np.ndarray] = {}
    for name in names:
        delta = ff.morph_delta(name, local, scope)
        result[name] = frame.to_world_delta(delta).astype(np.float32)
    return result


def seam_taper(points: np.ndarray, seam_points: np.ndarray, fade_start: float = 0.012, fade_end: float = 0.035) -> np.ndarray:
    """목 이음매(`seam_points`)에서 멀어질수록 0→1로 커지는 마스크 (N,). 얼굴 델타가 이음매를 못 움직이게 곱한다."""
    # 점-점 최근접 거리(작은 집합이라 청크 브루트포스로 충분)
    out = np.empty(len(points))
    chunk = 2048
    for i in range(0, len(points), chunk):
        d = np.linalg.norm(points[i : i + chunk, None, :] - seam_points[None, :, :], axis=2).min(axis=1)
        t = np.clip((d - fade_start) / (fade_end - fade_start), 0.0, 1.0)
        out[i : i + chunk] = t * t * (3.0 - 2.0 * t)
    return out
