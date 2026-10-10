"""의상 리타깃 코어: 외부 메시(Hyper3D 생성물)를 베이스 몸에 맞추고 몸 표면에 결합한다 (numpy + `surface.Surface`).

흐름(모두 A-포즈 몸 기준으로 맞춘 뒤, 결합 정보로 T-포즈·morph 변형 몸에서 다시 평가한다):

1. `weld_vertices`      UV 이음매로 쪼개진 정점을 위치로 합쳐 "대표 정점" 위상을 만든다(이웃·스무딩은 대표 정점에서 한다).
2. `fit_similarity`     균일 스케일 + 평행이동을 몸 표면까지의 거리(상한 적용)로 최적화한다(다중 시작 + 패턴 탐색).
3. `conform`            몸 표면 기준 부호 있는 거리 d를 [d_min, d_max]로 제한한다. 안쪽(충돌)은 d_min까지 밀고, 너무 떠 있으면
                        d_max까지 당긴다. 이동량은 라플라시안으로 퍼뜨려 울퉁불퉁함을 막고, 마지막에 충돌만 한 번 더 해소한다.
4. `bind`               의상 정점을 몸 삼각형(무게중심 + 법선 방향 거리 + 접선 성분)에 결합한다.
5. `evaluate`           결합을 다른 몸 형상(T-포즈, morph 변위 몸)에 적용해 의상 정점 위치를 얻는다.
6. `transfer_skin`      결합한 삼각형 세 정점의 스킨 웨이트를 무게중심으로 섞어 상위 4개를 남긴다.

좌표는 glTF(Y 위, +Z 앞, 미터)이고 삼각형은 바깥쪽이 반시계(CCW)다.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .surface import Surface, triangle_normals, vertex_normals


# ---------------------------------------------------------------- 위상


def weld_vertices(positions: np.ndarray, tolerance: float = 1e-6) -> tuple[np.ndarray, np.ndarray]:
    """위치가 같은(허용오차 이내) 정점을 합친다. (정점→대표 번호 (n,), 대표 위치 (m,3))을 돌려준다."""
    quantized = np.round(np.asarray(positions, dtype=np.float64) / tolerance).astype(np.int64)
    _, first, inverse = np.unique(quantized, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.reshape(-1)
    return inverse, np.asarray(positions, dtype=np.float64)[first]


def undirected_edges(triangles: np.ndarray) -> np.ndarray:
    """삼각형의 무방향 간선 (e,2), 중복 제거."""
    triangles = np.asarray(triangles, dtype=np.int64)
    pairs = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    pairs = np.sort(pairs, axis=1)
    return np.unique(pairs, axis=0)


def boundary_vertex_mask(vertex_count: int, triangles: np.ndarray) -> np.ndarray:
    """열린 가장자리(삼각형 하나만 가진 간선)에 닿는 정점 마스크."""
    triangles = np.asarray(triangles, dtype=np.int64)
    pairs = np.sort(np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]]), axis=1)
    unique, counts = np.unique(pairs, axis=0, return_counts=True)
    boundary = unique[counts == 1]
    mask = np.zeros(vertex_count, dtype=bool)
    mask[boundary.ravel()] = True
    return mask


def laplacian_smooth(values: np.ndarray, edges: np.ndarray, iterations: int, lam: float = 0.5) -> np.ndarray:
    """정점 값 (m,k)을 이웃 평균 쪽으로 lam만큼 당기기를 반복한다."""
    values = np.array(values, dtype=np.float64)
    count = len(values)
    degree = np.zeros(count)
    np.add.at(degree, edges[:, 0], 1.0)
    np.add.at(degree, edges[:, 1], 1.0)
    degree = np.maximum(degree, 1.0)[:, None]
    for _ in range(iterations):
        total = np.zeros_like(values)
        np.add.at(total, edges[:, 0], values[edges[:, 1]])
        np.add.at(total, edges[:, 1], values[edges[:, 0]])
        values = (1.0 - lam) * values + lam * (total / degree)
    return values


# ---------------------------------------------------------------- 표면 질의 보조


def _smooth_normals_at(surface: Surface, vertex_normal_field: np.ndarray, hits) -> np.ndarray:
    corners = surface.triangles[hits.triangle]
    interpolated = np.einsum("mc,mck->mk", hits.bary, vertex_normal_field[corners])
    length = np.linalg.norm(interpolated, axis=1, keepdims=True)
    return interpolated / np.maximum(length, 1e-12)


def signed_distance(points: np.ndarray, surface: Surface, vertex_normal_field: np.ndarray | None = None):
    """몸 표면까지의 부호 있는 거리(바깥 +)와 최근접 정보를 돌려준다. (d, hits, normal)"""
    field = vertex_normals(surface.positions, surface.triangles) if vertex_normal_field is None else vertex_normal_field
    hits = surface.closest(points)
    normal = _smooth_normals_at(surface, field, hits)
    d = np.einsum("ij,ij->i", points - hits.point, normal)
    return d, hits, normal


def mesh_signed_volume(positions: np.ndarray, triangles: np.ndarray) -> float:
    """닫힌 메시의 부호 있는 부피. 양수면 삼각형 법선이 바깥(CCW)이다."""
    a, b, c = positions[triangles[:, 0]], positions[triangles[:, 1]], positions[triangles[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


# ---------------------------------------------------------------- 정렬


def fit_similarity(
    points: np.ndarray,
    surface: Surface,
    scale_candidates: list[float],
    anchor_source: np.ndarray,
    anchor_target: np.ndarray,
    sample: int = 1800,
    cap: float = 0.08,
    max_rounds: int = 80,
    seed: int = 0,
) -> tuple[float, np.ndarray, float]:
    """균일 스케일 s와 평행이동 t를 최적화한다: 점 p → s·p + t.

    비용 = 표본점의 몸 표면 거리(cap으로 상한)의 평균. 스케일 후보마다 `anchor_source`(의상 쪽 기준점)가
    `anchor_target`(몸 쪽 기준점)에 오도록 t를 초기화하고, 좌표별 패턴 탐색(보폭 반감)으로 다듬은 뒤 가장 좋은 후보를 고른다.
    (s, t, 비용)을 돌려준다.
    """
    rng = np.random.default_rng(seed)
    pick = rng.choice(len(points), size=min(sample, len(points)), replace=False)
    sampled = np.asarray(points, dtype=np.float64)[pick]

    def cost(s: float, t: np.ndarray) -> float:
        hits = surface.closest(s * sampled + t)
        return float(np.minimum(hits.distance, cap).mean())

    best: tuple[float, float, np.ndarray] | None = None
    for s0 in scale_candidates:
        t0 = np.asarray(anchor_target, dtype=np.float64) - s0 * np.asarray(anchor_source, dtype=np.float64)
        s, t = s0, t0.copy()
        c = cost(s, t)
        steps = np.array([0.03 * s0, 0.02, 0.02, 0.02])
        for _ in range(max_rounds):
            improved = False
            for axis in range(4):
                for sign in (1.0, -1.0):
                    s2, t2 = s, t.copy()
                    if axis == 0:
                        s2 = s + sign * steps[0]
                    else:
                        t2[axis - 1] += sign * steps[axis]
                    if s2 <= 0:
                        continue
                    c2 = cost(s2, t2)
                    if c2 < c - 1e-9:
                        s, t, c = s2, t2, c2
                        improved = True
            if not improved:
                steps *= 0.5
                if steps[1] < 5e-4:
                    break
        if best is None or c < best[0]:
            best = (c, s, t)
    assert best is not None
    return best[1], best[2], best[0]


# ---------------------------------------------------------------- 밀착(충돌 해소 + 간격 제한)


def conform(
    canon_positions: np.ndarray,
    canon_edges: np.ndarray,
    protected: np.ndarray | None,
    surface: Surface,
    d_min: float,
    d_max: float,
    passes: int = 4,
    smooth_iterations: int = 6,
    smooth_lambda: float = 0.5,
) -> np.ndarray:
    """대표 정점의 몸 표면 부호 거리를 [d_min, d_max]로 제한한다.

    `protected`가 True인 정점(예: 열린 가장자리)은 d_max로 당기지 않고(충돌 해소만) 의상 고유의 헐렁한 끝선을 지킨다.
    """
    field = vertex_normals(surface.positions, surface.triangles)
    p = np.array(canon_positions, dtype=np.float64)
    keep_loose = np.zeros(len(p), dtype=bool) if protected is None else np.asarray(protected, dtype=bool)
    for _ in range(passes):
        d, _, normal = signed_distance(p, surface, field)
        upper = np.where(keep_loose, np.inf, d_max)
        target = np.minimum(np.maximum(d, d_min), upper)
        delta = (target - d)[:, None] * normal
        delta = laplacian_smooth(delta, canon_edges, smooth_iterations, smooth_lambda)
        p = p + delta
    # 마지막 충돌 해소: 스무딩 없이 d_min 미만만 밀어낸다.
    for _ in range(2):
        d, _, normal = signed_distance(p, surface, field)
        p = p + np.maximum(d_min - d, 0.0)[:, None] * normal
    return p


# ---------------------------------------------------------------- 결합


@dataclass
class Binding:
    triangle: np.ndarray  # (n,) 몸 삼각형 번호
    bary: np.ndarray  # (n,3)
    offset_normal: np.ndarray  # (n,) 보간 법선 방향 거리(m)
    offset_tangent: np.ndarray  # (n,2) 삼각형 접선 기저(e1, e2)에서의 성분(m)


def _frame(surface_like_positions: np.ndarray, triangles: np.ndarray, triangle: np.ndarray, bary: np.ndarray):
    """삼각형 위 한 점의 (표면점, 보간 법선 N, 접선 e1, e2)를 돌려준다."""
    corners = triangles[triangle]
    v0 = surface_like_positions[corners[:, 0]]
    v1 = surface_like_positions[corners[:, 1]]
    v2 = surface_like_positions[corners[:, 2]]
    point = bary[:, 0:1] * v0 + bary[:, 1:2] * v1 + bary[:, 2:3] * v2
    field = vertex_normals(surface_like_positions, triangles)
    normal = np.einsum("mc,mck->mk", bary, field[corners])
    normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-12)
    edge = v1 - v0
    e1 = edge - np.einsum("ij,ij->i", edge, normal)[:, None] * normal
    e1 /= np.maximum(np.linalg.norm(e1, axis=1, keepdims=True), 1e-12)
    e2 = np.cross(normal, e1)
    return point, normal, e1, e2


def bind(points: np.ndarray, surface: Surface) -> Binding:
    """점 (n,3)을 몸 표면에 결합한다."""
    hits = surface.closest(points)
    if (hits.triangle < 0).any():
        raise RuntimeError("표면을 찾지 못한 점이 있다")
    point, normal, e1, e2 = _frame(surface.positions, surface.triangles, hits.triangle, hits.bary)
    residual = np.asarray(points, dtype=np.float64) - point
    offset_normal = np.einsum("ij,ij->i", residual, normal)
    tangent = residual - offset_normal[:, None] * normal
    offset_tangent = np.stack([np.einsum("ij,ij->i", tangent, e1), np.einsum("ij,ij->i", tangent, e2)], axis=1)
    return Binding(hits.triangle.copy(), hits.bary.copy(), offset_normal, offset_tangent)


def evaluate(binding: Binding, positions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    """결합을 다른 몸 형상(정점 위치 (N,3), 같은 삼각형)에 적용한다."""
    point, normal, e1, e2 = _frame(np.asarray(positions, dtype=np.float64), triangles, binding.triangle, binding.bary)
    return point + binding.offset_normal[:, None] * normal + binding.offset_tangent[:, 0:1] * e1 + binding.offset_tangent[:, 1:2] * e2


# ---------------------------------------------------------------- 스킨 웨이트 전이


def transfer_skin(binding: Binding, triangles: np.ndarray, joints: np.ndarray, weights: np.ndarray, influences: int = 4) -> tuple[np.ndarray, np.ndarray]:
    """결합한 삼각형 세 정점의 스킨(joints (N,4), weights (N,4))을 무게중심으로 섞어 상위 `influences`개를 남긴다."""
    corners = np.asarray(triangles, dtype=np.int64)[binding.triangle]  # (n,3)
    count = len(corners)
    out_joints = np.zeros((count, influences), dtype=np.int64)
    out_weights = np.zeros((count, influences), dtype=np.float64)
    for row in range(count):
        accum: dict[int, float] = {}
        for k in range(3):
            vertex = corners[row, k]
            bary = binding.bary[row, k]
            for j, w in zip(joints[vertex].tolist(), weights[vertex].tolist(), strict=True):
                if w > 0.0:
                    accum[j] = accum.get(j, 0.0) + bary * w
        ranked = sorted(accum.items(), key=lambda item: -item[1])[:influences]
        total = sum(w for _, w in ranked)
        if total <= 0.0:
            ranked, total = [(int(joints[corners[row, 0], 0]), 1.0)], 1.0
        for slot, (j, w) in enumerate(ranked):
            out_joints[row, slot] = j
            out_weights[row, slot] = w / total
    return out_joints, out_weights


# ---------------------------------------------------------------- 법선


def canonical_vertex_normals(canon_index: np.ndarray, canon_count: int, positions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    """이음매로 쪼개진 정점도 같은 법선을 갖도록 대표 정점 위상에서 면적 가중 법선을 구해 정점 수만큼 펼친다."""
    canon_tris = canon_index[triangles]
    canon_positions = np.zeros((canon_count, 3))
    canon_positions[canon_index] = positions
    normals = vertex_normals(canon_positions, canon_tris)
    return normals[canon_index]


def part_triangle_normals(positions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    return triangle_normals(positions, triangles)
