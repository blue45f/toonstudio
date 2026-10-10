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
    d_max_open: float = float("inf"),
) -> np.ndarray:
    """대표 정점의 몸 표면 부호 거리를 [d_min, d_max]로 제한한다.

    `protected`가 True인 정점(예: 열린 가장자리)은 d_max 대신 `d_max_open`(기본 무한)까지만 당겨 의상 고유의 헐렁한 끝선을 지킨다.
    """
    field = vertex_normals(surface.positions, surface.triangles)
    p = np.array(canon_positions, dtype=np.float64)
    keep_loose = np.zeros(len(p), dtype=bool) if protected is None else np.asarray(protected, dtype=bool)
    for _ in range(passes):
        d, _, normal = signed_distance(p, surface, field)
        upper = np.where(keep_loose, d_max_open, d_max)
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


# ---------------------------------------------------------------- 본 근접 스킨 웨이트 (A→T 변환용)


def bone_segments(joint_positions: np.ndarray, parents: list[int]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """각 joint에서 자식 joint로 가는 선분을 모은다. (joint 번호 (S,), 선분 시작 (S,3), 선분 끝 (S,3)). 자식이 없는 끝 본은 선분이 없다."""
    owners, starts, ends = [], [], []
    for child, parent in enumerate(parents):
        if parent < 0:
            continue
        owners.append(parent)
        starts.append(joint_positions[parent])
        ends.append(joint_positions[child])
    return np.array(owners), np.array(starts), np.array(ends)


def bone_proximity_weights(
    points: np.ndarray,
    joint_positions: np.ndarray,
    parents: list[int],
    canon_edges: np.ndarray | None = None,
    power: float = 6.0,
    epsilon: float = 0.01,
    influences: int = 4,
    smooth_iterations: int = 8,
    exclude_joints: tuple[int, ...] = (),
) -> tuple[np.ndarray, np.ndarray]:
    """점마다 본 선분까지의 거리로 스킨 웨이트를 정한다(가까운 본일수록 거의 독점). (joint 번호 (n,K), 가중치 (n,K))를 돌려준다.

    몸 표면에서 가장 가까운 삼각형의 웨이트를 옮기면, 겨드랑이 같은 오목한 곳에서 소매 정점이 위팔이 아니라 몸통 웨이트를 받아
    팔이 올라갈 때 소매가 찢어진다. 본 선분 거리는 소매가 위팔 축에 가깝다는 사실을 그대로 쓴다. `power`가 클수록 가장 가까운 본이 독점한다.
    평활화는 의상 위상(대표 정점 간선)에서 웨이트를 이웃과 섞어 경계 노이즈를 지운다.
    """
    owners, starts, ends = bone_segments(joint_positions, parents)
    direction = ends - starts
    length_sq = np.maximum((direction**2).sum(axis=1), 1e-12)
    joint_count = len(joint_positions)
    distance = np.full((len(points), joint_count), np.inf)
    for segment in range(len(owners)):
        if int(owners[segment]) in exclude_joints:
            continue
        offset = points - starts[segment]
        t = np.clip((offset @ direction[segment]) / length_sq[segment], 0.0, 1.0)
        closest = starts[segment] + t[:, None] * direction[segment]
        d = np.linalg.norm(points - closest, axis=1)
        owner = int(owners[segment])
        distance[:, owner] = np.minimum(distance[:, owner], d)
    weights = np.where(np.isfinite(distance), 1.0 / (distance + epsilon) ** power, 0.0)
    weights /= np.maximum(weights.sum(axis=1, keepdims=True), 1e-30)
    if canon_edges is not None and smooth_iterations > 0:
        weights = laplacian_smooth(weights, canon_edges, smooth_iterations, 0.5)
    order = np.argsort(-weights, axis=1)[:, :influences]
    top = np.take_along_axis(weights, order, axis=1)
    top /= np.maximum(top.sum(axis=1, keepdims=True), 1e-30)
    return order.astype(np.int64), top


# ---------------------------------------------------------------- 안쪽 광선으로 덮고 있는 몸 표면의 웨이트를 가져오기


def orient_outward(points: np.ndarray, normals: np.ndarray, surface: Surface) -> np.ndarray:
    """법선이 몸에서 멀어지는 쪽(바깥)을 향하게 맞춘다. 대부분의 점에서 반대면 전체를 뒤집는다."""
    d, _, _ = signed_distance(points, surface)
    hits = surface.closest(points)
    sign = np.einsum("ij,ij->i", points - hits.point, normals)
    return -normals if float(np.median(sign)) < 0 else normals


def inward_ray_skin(
    points: np.ndarray,
    normals: np.ndarray,
    surface: Surface,
    joints: np.ndarray,
    weights: np.ndarray,
    max_distance: float = 0.15,
    influences: int = 4,
) -> tuple[np.ndarray, np.ndarray, float]:
    """의상 정점에서 법선 반대(몸 쪽)로 광선을 쏴 맞은 몸 삼각형의 스킨을 무게중심으로 섞어 가져온다.

    가장 가까운 표면점 대신 이렇게 하는 이유: 소매 안쪽처럼 몸통이 더 가까운 곳에서도 광선은 소매가 실제로 감싼 팔을 맞힌다.
    맞히지 못한 정점(열린 가장자리 등)은 가장 가까운 표면점으로 대신한다. (joint 번호 (n,K), 가중치 (n,K), 광선 성공 비율)을 돌려준다.
    """
    origins = points + normals * 1e-4
    hit_points, triangle = surface.ray(origins, -normals, max_distance)
    ok = triangle >= 0
    bary = np.zeros((len(points), 3))
    if ok.any():
        corners = surface.triangles[triangle[ok]]
        a, b, c = surface.positions[corners[:, 0]], surface.positions[corners[:, 1]], surface.positions[corners[:, 2]]
        from .surface import barycentric

        bary[ok] = np.clip(barycentric(hit_points[ok], a, b, c), 0.0, 1.0)
        bary[ok] /= np.maximum(bary[ok].sum(axis=1, keepdims=True), 1e-12)
    if (~ok).any():
        near = surface.closest(points[~ok])
        triangle = triangle.copy()
        triangle[~ok] = near.triangle
        bary[~ok] = near.bary
    binding = Binding(triangle, bary, np.zeros(len(points)), np.zeros((len(points), 2)))
    out_joints, out_weights = transfer_skin(binding, surface.triangles, joints, weights, influences)
    return out_joints, out_weights, float(ok.mean())


# ---------------------------------------------------------------- 법선이 호환되는 몸 정점의 웨이트 (소매 안쪽·겨드랑이)


def compatible_vertex_skin(
    points: np.ndarray,
    normals: np.ndarray,
    body_positions: np.ndarray,
    body_normals: np.ndarray,
    joints: np.ndarray,
    weights: np.ndarray,
    search: int = 96,
    take: int = 3,
    min_dot: float = 0.2,
    influences: int = 4,
) -> tuple[np.ndarray, np.ndarray, float]:
    """의상 정점마다 가까운 몸 정점 `search`개 중 **법선이 의상 법선과 같은 쪽을 향하는**(dot ≥ min_dot) 가장 가까운 `take`개의
    스킨을 거리 역수로 섞어 가져온다. (joint 번호 (n,K), 가중치 (n,K), 호환 후보를 찾은 비율)을 돌려준다.

    몸 표면에서 그냥 가장 가까운 곳의 웨이트를 가져오면 소매 안쪽·겨드랑이 정점이 팔이 아니라 몸통 옆면 웨이트를 받는다.
    소매 안쪽의 법선은 몸통을 향하지만 몸통 옆면의 법선은 팔을 향해 서로 반대이므로, 법선 호환 조건이 팔 안쪽 면을 고르게 해 준다.
    호환 후보가 하나도 없으면 가장 가까운 몸 정점으로 대신한다.
    """
    import bpy  # noqa: F401 - mathutils는 bpy 뒤에만 가져올 수 있다
    from mathutils import kdtree

    tree = kdtree.KDTree(len(body_positions))
    for index, position in enumerate(body_positions.tolist()):
        tree.insert(position, index)
    tree.balance()
    count = len(points)
    out_joints = np.zeros((count, influences), dtype=np.int64)
    out_weights = np.zeros((count, influences))
    found = 0
    for row in range(count):
        candidates = tree.find_n(points[row].tolist(), search)
        chosen = [(idx, dist) for _, idx, dist in candidates if float(np.dot(body_normals[idx], normals[row])) >= min_dot][:take]
        if chosen:
            found += 1
        else:
            chosen = [(candidates[0][1], candidates[0][2])]
        accum: dict[int, float] = {}
        total_w = 0.0
        for idx, dist in chosen:
            blend = 1.0 / (dist + 0.004) ** 2
            total_w += blend
            for j, w in zip(joints[idx].tolist(), weights[idx].tolist(), strict=True):
                if w > 0.0:
                    accum[j] = accum.get(j, 0.0) + blend * w
        ranked = sorted(accum.items(), key=lambda item: -item[1])[:influences]
        norm = sum(w for _, w in ranked) or 1.0
        for slot, (j, w) in enumerate(ranked):
            out_joints[row, slot] = j
            out_weights[row, slot] = w / norm
    return out_joints, out_weights, found / max(count, 1)


# ---------------------------------------------------------------- 법선 호환 삼각형 결합 (겨드랑이·소매 안쪽)


def compatible_hits(points: np.ndarray, normals: np.ndarray, surface: Surface, margin: float = 0.05, min_dot: float = 0.2):
    """점마다 가장 가까운 거리 + margin 안의 삼각형 중 **면 법선이 점의 법선과 같은 쪽**(dot ≥ min_dot)인 가장 가까운 삼각형의 표면점을 고른다.

    소매 안쪽처럼 몸통 옆면이 더 가까운 곳에서 팔 안쪽 면을 고르게 해 준다(몸통 옆면의 법선은 팔을 향해 반대다).
    호환 삼각형이 없으면 가장 가까운 삼각형으로 대신한다. `SurfaceHits`(삼각형·무게중심·점·거리·법선)와 호환 후보를 찾은 비율을 돌려준다.
    """
    from .surface import SurfaceHits, barycentric

    count = len(points)
    triangle = np.full(count, -1, dtype=np.int64)
    hit_point = np.zeros((count, 3))
    distance = np.full(count, np.inf)
    found = 0
    tree = surface._tree
    for i, p in enumerate(np.asarray(points, dtype=np.float64).tolist()):
        location, _, index, d0 = tree.find_nearest(p)
        best = None
        if float(np.dot(surface.face_normals[index], normals[i])) >= min_dot:
            best = (location, index, d0)
        else:
            for loc, _, idx, dist in tree.find_nearest_range(p, d0 + margin):
                if float(np.dot(surface.face_normals[idx], normals[i])) >= min_dot and (best is None or dist < best[2]):
                    best = (loc, idx, dist)
        if best is not None:
            found += 1
        else:
            best = (location, index, d0)
        triangle[i] = best[1]
        hit_point[i] = (best[0].x, best[0].y, best[0].z)
        distance[i] = best[2]
    corners = surface.triangles[triangle]
    bary = barycentric(hit_point, surface.positions[corners[:, 0]], surface.positions[corners[:, 1]], surface.positions[corners[:, 2]])
    bary = np.clip(bary, 0.0, 1.0)
    bary /= np.maximum(bary.sum(axis=1, keepdims=True), 1e-12)
    hits = SurfaceHits(triangle=triangle, bary=bary, point=hit_point, distance=distance, normal=surface.face_normals[triangle])
    return hits, found / max(count, 1)


def bind_compatible(points: np.ndarray, normals: np.ndarray, surface: Surface, margin: float = 0.05, min_dot: float = 0.2) -> tuple[Binding, float]:
    """`bind`와 같지만 법선이 호환되는 삼각형만 후보로 삼는다."""
    hits, ratio = compatible_hits(points, normals, surface, margin, min_dot)
    point, normal, e1, e2 = _frame(surface.positions, surface.triangles, hits.triangle, hits.bary)
    residual = np.asarray(points, dtype=np.float64) - point
    offset_normal = np.einsum("ij,ij->i", residual, normal)
    tangent = residual - offset_normal[:, None] * normal
    offset_tangent = np.stack([np.einsum("ij,ij->i", tangent, e1), np.einsum("ij,ij->i", tangent, e2)], axis=1)
    return Binding(hits.triangle.copy(), hits.bary.copy(), offset_normal, offset_tangent), ratio


# ---------------------------------------------------------------- 웹툰풍 정리: 부피를 지키는 스무딩


def stylize_smooth(positions: np.ndarray, triangles: np.ndarray, pinned: np.ndarray | None, iterations: int, lam: float = 0.5, mu: float = -0.53) -> np.ndarray:
    """Taubin(수축 없는) 라플라시안 스무딩으로 사진식 잔주름을 지우고 큰 면과 부드러운 접힘만 남긴다.

    `pinned`가 True인 정점(열린 가장자리: 밑단·소매 끝·칼라 선)은 움직이지 않아 의상의 끝선을 지킨다. 단색 큰 면 + 얇은 접힘선이라는
    웹툰 의상 화풍은 법선이 매끈해야 툰 램프의 경계가 깨끗하게 나오기 때문에 지오메트리 잔주름을 지우는 것이 효과가 크다.
    """
    if iterations <= 0:
        return positions
    from .skin import taubin_smooth, vertex_adjacency

    ptr, idx = vertex_adjacency(np.asarray(triangles, dtype=np.int64), len(positions))
    free_mask = np.ones(len(positions), dtype=bool) if pinned is None else ~np.asarray(pinned, dtype=bool)
    return taubin_smooth(np.asarray(positions, dtype=np.float64), np.flatnonzero(free_mask), ptr, idx, iterations=iterations, lam=lam, mu=mu)
