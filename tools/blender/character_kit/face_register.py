"""애니풍 얼굴 흉상(Hyper3D 생성물)의 모양으로 베이스 머리를 옮긴다 — 변위 평활화 ICP 비강체 정합 (numpy + mathutils BVH).

왜 필요한가
-----------
HBM 머리는 사실 해부학 형태(눈썹뼈·비순구·콧방울·입술 윤곽)라 툰 음영에서 줄무늬 그림자와 성인 얼굴이 된다. 변형 필드(`webtoon_style.StyleField`)로 눈·코·입
크기만 바꿔서는 "애니·웹툰 얼굴"에 닿지 못한다. 그래서 Hyper3D로 만든 애니 인형풍 얼굴 흉상(`fig-anime-f` 등, 대머리·중립 표정)의 **얼굴 모양**을
HBM 머리 메시에 옮긴다. 위상·UV·리그·morph 델타·눈/입 메시는 그대로고 정점 위치만 바뀐다(키트 계약 불변).

알고리즘
--------
1. 정렬: 베이스 머리 윗부분(정수리 아래 10 cm)을 목표 표면에 닮음 변환(배율+이동)으로 맞춘다(`garment_fit.fit_similarity`). 정수리끼리 겹치게 시작해 배율을 후보 격자에서 찾는다.
2. 비강체: 목표 공간에서 정점마다 가장 가까운 목표 표면점을 찾아(법선이 어긋나면 약하게) 변위 `d = w·(hit − p)`를 만들고, 메시 위에서 `w·d`와 `w`를 같은 횟수만큼
   평균해 나눈다(커널 회귀). 평활화 횟수를 반복마다 줄여 큰 형태부터 세부로 간다. 목 이음매 쪽은 `seam_taper` 마스크로 0으로 줄어 몸과 이어진다.
3. 결과 변위(베이스 좌표)를 용접 정점마다 저장한다. 눈·입·속눈썹·눈썹·홍채·관절처럼 머리 메시 밖의 점은 가장 가까운 용접 정점 8개의 역거리 가중 평균 변위를 받는다.

목표 메시는 같은 좌표계(+Y 위, +Z 앞)의 정면 흉상이어야 한다. 눈·입 위치를 목표의 눈·입에 맞추는 별도 지표 정렬은 하지 않으므로, 이후 `StyleField`(눈·코·입 배율)가 얼굴 구성을 마무리한다.

상태: 실험(미완성) — 기본 스타일은 `LookStyle.target_head`를 비워 두어 이 경로를 쓰지 않는다
------------------------------------------------------------------------------------------
첫 시도(`fig-anime-f` 흉상)는 코가 주둥이처럼 늘고 눈이 파묻히는 실패였다. 확인한 원인:
1. 정수리 띠만으로 맞춘 닮음 변환은 돔끼리라 배율이 정해지지 않는다(후보 1.3~2.6이 틀렸고 실제 약 5배: 흉상은 높이 ±0.95로 정규화되고 베이스 머리는 폭 0.17 m).
2. 목표는 이마가 길고 아래 얼굴이 짧은 인형 비례(정수리~턱에서 눈 54 %·입 86 %, HBM은 47 %·81 %)라 균일 배율로는 눈·코·입이 겹치지 않는다. 다음 시도는
   목표의 눈·입 높이 지표를 재서 높이를 구간별로 맞춘 뒤(`StyleField._layout`과 같은 워프) 가까운 표면점 정합으로 남은 모양만 옮긴다.
3. 목표가 실사 조각 얼굴이라(Hyper3D "anime" 프롬프트도 사실적인 K-뷰티 얼굴이 나왔다; "scale figure"를 넣은 프롬프트가 더 인형답다) 얼굴 모양을 옮겨도 웹툰 얼굴이 되지는 않는다.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .garment_fit import fit_similarity, laplacian_smooth
from .gltf_read import read_static_mesh
from .surface import Surface, vertex_normals


def load_target(path: str | Path) -> tuple[np.ndarray, np.ndarray]:
    """목표 흉상 GLB의 (정점, 삼각형). 단일 메시 가정."""
    mesh = read_static_mesh(str(path))
    return np.asarray(mesh.positions, dtype=np.float64), np.asarray(mesh.triangles, dtype=np.int64)


def _edges(triangles: np.ndarray) -> np.ndarray:
    pairs = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    return np.unique(np.sort(pairs, axis=1), axis=0)


class FaceRegistration:
    """용접된 베이스 머리 정점 → 목표 얼굴 모양으로 가는 변위 필드."""

    def __init__(
        self,
        head_positions: np.ndarray,
        head_triangles: np.ndarray,
        mask: np.ndarray,
        target_positions: np.ndarray,
        target_triangles: np.ndarray,
        *,
        strength: float = 1.0,
        iterations: int = 22,
        crown_depth: float = 0.10,
        scale_candidates: tuple[float, ...] = (1.3, 1.5, 1.7, 1.9, 2.1, 2.3, 2.6),
        match_distance: float = 0.035,
    ) -> None:
        self.head_positions = np.asarray(head_positions, dtype=np.float64)
        triangles = np.asarray(head_triangles, dtype=np.int64)
        target_surface = Surface(target_positions, target_triangles)
        target_top = np.array([0.0, float(target_positions[:, 1].max()), 0.0])

        # 1) 정수리 띠를 목표 표면에 맞추는 닮음 변환(베이스 → 목표 좌표)
        top = float(self.head_positions[:, 1].max())
        crown = self.head_positions[self.head_positions[:, 1] >= top - crown_depth]
        crown_anchor = np.array([float(crown[:, 0].mean()), top, float(crown[:, 2].mean())])
        top_band = target_positions[target_positions[:, 1] >= target_top[1] - 0.25]
        target_anchor = np.array([float(top_band[:, 0].mean()), float(target_top[1]), float(top_band[:, 2].mean())])
        scale, translation, _ = fit_similarity(crown, target_surface, list(scale_candidates), crown_anchor, target_anchor, cap=0.2, scale_limit=(1.0, 3.2), shift_limit=0.25)
        self.scale = float(scale)
        self.translation = np.asarray(translation, dtype=np.float64)

        # 2) 목표 공간에서 비강체 정합
        moved = self.head_positions * self.scale + self.translation
        base_normals = vertex_normals(moved, triangles)
        edges = _edges(triangles)
        mask = np.asarray(mask, dtype=np.float64)
        limit = match_distance * self.scale
        for step in range(iterations):
            hits = target_surface.closest(moved, max_distance=limit * 2.0)
            found = hits.triangle >= 0
            distance = np.where(found, hits.distance, np.inf)
            weight = np.clip(1.0 - distance / limit, 0.0, 1.0)
            agree = np.einsum("ij,ij->i", base_normals, hits.normal)
            weight = weight * np.where(agree > 0.2, 1.0, 0.15) * mask
            raw = np.where(found[:, None], hits.point - moved, 0.0) * weight[:, None]
            smooth_rounds = max(2, int(round(30 * (1.0 - step / max(iterations - 1, 1)) + 2)))
            numerator = laplacian_smooth(raw, edges, smooth_rounds, 0.5)
            denominator = laplacian_smooth(weight[:, None], edges, smooth_rounds, 0.5)[:, 0]
            delta = numerator / np.maximum(denominator, 1e-3)[:, None] * np.clip(denominator * 3.0, 0.0, 1.0)[:, None]
            moved = moved + 0.55 * delta * mask[:, None]
            base_normals = vertex_normals(moved, triangles)
        final = (moved - self.translation) / self.scale
        displacement = (final - self.head_positions) * float(strength)
        self.displacement = displacement
        self._tree = None
        self.report = {
            "scale": round(self.scale, 4),
            "meanDisplacementMm": round(float(np.linalg.norm(displacement, axis=1)[mask > 0.5].mean()) * 1000.0, 2),
            "maxDisplacementMm": round(float(np.linalg.norm(displacement, axis=1).max()) * 1000.0, 2),
        }

    def _kd(self):
        if self._tree is None:
            import bpy  # noqa: F401 - mathutils는 bpy 뒤에만 가져올 수 있다
            from mathutils import kdtree

            tree = kdtree.KDTree(len(self.head_positions))
            for index, point in enumerate(self.head_positions.tolist()):
                tree.insert(point, index)
            tree.balance()
            self._tree = tree
        return self._tree

    def offset(self, points: np.ndarray, neighbors: int = 8) -> np.ndarray:
        """임의 점 (N,3)이 받을 변위 — 가장 가까운 용접 머리 정점 `neighbors`개의 역거리 가중 평균."""
        tree = self._kd()
        points = np.asarray(points, dtype=np.float64)
        out = np.zeros_like(points)
        for i, point in enumerate(points.tolist()):
            found = tree.find_n(point, neighbors)
            weights = np.array([1.0 / (distance + 1e-4) for _, _, distance in found])
            indices = np.array([index for _, index, _ in found])
            out[i] = (self.displacement[indices] * weights[:, None]).sum(axis=0) / weights.sum()
        return out

    def apply(self, points: np.ndarray) -> np.ndarray:
        return np.asarray(points, dtype=np.float64) + self.offset(points)
