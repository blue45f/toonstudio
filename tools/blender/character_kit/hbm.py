"""추출된 Human Base Meshes npz를 glTF 좌표(Y 위, +Z 앞, 캐릭터 왼쪽 +X, m)의 순수 numpy 구조로 읽는다.

Blender 월드 좌표 (x, y, z) → glTF (x - cx, z - z0, -y). 이 변환은 행렬식이 +1이라 면 감김 방향이 유지된다.
`cx`는 몸 bbox의 x 중앙, `z0`는 몸 bbox의 최저 z(발바닥)이며 눈·홍채에도 같은 값을 쓴다.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

# `.sculpt_face_set` 해부학 분할의 의미(2026-10-10 여성 몸 위치·크기 분석으로 확인; 남성도 같은 번호 체계).
# 좌우는 하드코딩하지 않고 면 중심의 x 부호로 정한다(+x = 캐릭터 왼쪽).
HEAD_SETS = frozenset({17, 2, 3, 4, 5, 7, 8, 22})
TORSO_SETS = frozenset({1, 19, 18})  # 가슴·목·등, 복부, 골반
PELVIS_SET = 18
ABDOMEN_SET = 19
CHEST_SET = 1
EYE_REGION_SETS = frozenset({2, 3})
EAR_SETS = frozenset({4, 5})
NOSE_SET = 7
LIP_SET = 8
JAW_SET = 22
SKULL_SET = 17
UPPER_ARM_SETS = frozenset({20, 21})
FOREARM_SETS = frozenset({11, 12})
HAND_PALM_SETS = frozenset({9, 10})
FINGER_SETS = frozenset(range(64, 104))
THIGH_SETS = frozenset({23, 24})
CALF_SETS = frozenset({15, 16})
FOOT_SETS = frozenset({13, 14})
FOREFOOT_SETS = frozenset({25, 26})
TOE_SETS = frozenset(range(27, 64))


@dataclass
class Body:
    """glTF 좌표의 몸 메시(전부 쿼드)와 면 분할."""

    positions: np.ndarray  # (N,3) float64
    faces: np.ndarray  # (M,4) int64
    face_set: np.ndarray  # (M,) int32
    cx: float
    z0: float
    eyes: dict[str, tuple[np.ndarray, np.ndarray]] = field(default_factory=dict)  # 'L'/'R' -> (positions, triangles)
    iris: dict[str, tuple[np.ndarray, np.ndarray]] = field(default_factory=dict)  # 홍채 원반, 몸의 눈 위치로 옮긴 좌표
    face_center: np.ndarray | None = None  # (M,3)

    def vertex_sets(self) -> list[set[int]]:
        """정점이 속한 면 분할 번호 집합."""
        result: list[set[int]] = [set() for _ in range(len(self.positions))]
        for fs, quad in zip(self.face_set.tolist(), self.faces.tolist(), strict=True):
            for v in quad:
                result[v].add(fs)
        return result


def to_gltf(points: np.ndarray, cx: float, z0: float) -> np.ndarray:
    """Blender 월드 좌표 → glTF 좌표."""
    return np.stack([points[:, 0] - cx, points[:, 2] - z0, -points[:, 1]], axis=1)


def load(npz_path: str | Path) -> Body:
    data = np.load(npz_path)
    raw = data["body_positions"]
    cx = float((raw[:, 0].min() + raw[:, 0].max()) / 2.0)
    z0 = float(raw[:, 2].min())
    body = Body(
        positions=to_gltf(raw, cx, z0),
        faces=data["body_faces"].astype(np.int64),
        face_set=data["body_face_set"].astype(np.int32),
        cx=cx,
        z0=z0,
    )
    for side in ("L", "R"):
        body.eyes[side] = (to_gltf(data[f"eye{side}_positions"], cx, z0), data[f"eye{side}_triangles"].astype(np.int64))
        # 홍채 원반은 머리 에셋 기준 좌표라, 같은 에셋의 공막 중심 대비 상대 위치를 몸의 눈 중심에 얹는다.
        iris_raw = data[f"iris{side}_positions"]
        sclera_raw = data[f"sclera{side}_positions"]
        body_eye_center = data[f"eye{side}_positions"].mean(axis=0)
        shifted = iris_raw - sclera_raw.mean(axis=0) + body_eye_center
        body.iris[side] = (to_gltf(shifted, cx, z0), data[f"iris{side}_triangles"].astype(np.int64))
    body.face_center = body.positions[body.faces].mean(axis=1)
    return body


def face_adjacency(faces: np.ndarray) -> list[list[int]]:
    """간선을 공유하는 면 인접 리스트."""
    edge_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for f, quad in enumerate(faces.tolist()):
        for k in range(4):
            a, b = quad[k], quad[(k + 1) % 4]
            edge_faces[(a, b) if a < b else (b, a)].append(f)
    adjacency: list[list[int]] = [[] for _ in range(len(faces))]
    for owners in edge_faces.values():
        if len(owners) == 2:
            adjacency[owners[0]].append(owners[1])
            adjacency[owners[1]].append(owners[0])
    return adjacency


def connected_components(selected: np.ndarray, adjacency: list[list[int]]) -> list[list[int]]:
    """선택된 면(불리언 배열)의 연결 성분."""
    seen = np.zeros(len(selected), dtype=bool)
    components: list[list[int]] = []
    for start in np.flatnonzero(selected).tolist():
        if seen[start]:
            continue
        stack = [start]
        seen[start] = True
        component = [start]
        while stack:
            current = stack.pop()
            for nxt in adjacency[current]:
                if selected[nxt] and not seen[nxt]:
                    seen[nxt] = True
                    stack.append(nxt)
                    component.append(nxt)
        components.append(component)
    return components


def head_face_mask(body: Body) -> np.ndarray:
    """머리 면 마스크. 머리 분할 번호의 면에 더해, 머리 안쪽에 갇힌 작은 비머리 섬(극점 주변 패치)을 머리로 합쳐
    머리/몸 경계가 닫힌 루프 하나가 되게 한다."""
    mask = np.isin(body.face_set, list(HEAD_SETS))
    adjacency = face_adjacency(body.faces)
    components = connected_components(~mask, adjacency)
    if not components:
        return mask
    largest = max(components, key=len)
    for component in components:
        if component is largest:
            continue
        mask[component] = True
    return mask
