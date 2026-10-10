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
    scale_limit: tuple[float, float] | None = None,
    shift_limit: float | None = None,
    target_distance: float | None = None,
) -> tuple[float, np.ndarray, float]:
    """균일 스케일 s와 평행이동 t를 최적화한다: 점 p → s·p + t.

    비용 = 표본점의 몸 표면 거리(cap으로 상한)의 평균. 스케일 후보마다 `anchor_source`(의상 쪽 기준점)가
    `anchor_target`(몸 쪽 기준점)에 오도록 t를 초기화하고, 좌표별 패턴 탐색(보폭 반감)으로 다듬은 뒤 가장 좋은 후보를 고른다.
    (s, t, 비용)을 돌려준다.

    비용이 "몸에 가까울수록 좋다"뿐이라 제한이 없으면 치마·후디처럼 몸에서 뜬 의상은 계속 줄어들며 몸에 붙으려 한다.
    그래서 초기 정렬을 믿을 수 있을 때(`frame`)는 `scale_limit`(허용 스케일 구간)과 `shift_limit`(기준점이 목표에서 벗어날 수 있는 최대 거리)로 가둔다.
    `target_distance`를 주면 비용을 부호 있는 거리(바깥 +)가 그 값(의상이 몸에서 뜨는 전형적인 간격)에 가까울수록 낮게 매긴다 —
    몸 안으로 파고든 정렬이 "가깝다"고 높게 평가되는 것을 막는다.
    """
    rng = np.random.default_rng(seed)
    pick = rng.choice(len(points), size=min(sample, len(points)), replace=False)
    sampled = np.asarray(points, dtype=np.float64)[pick]

    normal_field = vertex_normals(surface.positions, surface.triangles) if target_distance is not None else None

    def cost(s: float, t: np.ndarray) -> float:
        moved = s * sampled + t
        if target_distance is None:
            hits = surface.closest(moved)
            return float(np.minimum(hits.distance, cap).mean())
        distance, _, _ = signed_distance(moved, surface, normal_field)
        return float(np.minimum(np.abs(distance - target_distance), cap).mean())

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
                    if scale_limit is not None and not (scale_limit[0] <= s2 <= scale_limit[1]):
                        continue
                    if shift_limit is not None and float(np.linalg.norm(s2 * np.asarray(anchor_source, dtype=np.float64) + t2 - np.asarray(anchor_target, dtype=np.float64))) > shift_limit:
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


# ---------------------------------------------------------------- 소매 정렬 (헐렁한 A-포즈 소매를 몸의 팔 방향으로)


def _smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    """edge0 → edge1에서 0 → 1로 부드럽게 오른다. edge1 < edge0이면 1 → 0으로 내려간다."""
    span = edge1 - edge0
    t = np.clip((x - edge0) / (span if abs(span) > 1e-9 else 1e-9), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _rotate_about_axis(vectors: np.ndarray, axis: np.ndarray, angles: np.ndarray) -> np.ndarray:
    """벡터마다 다른 각도로 같은 축을 중심으로 돌린다(Rodrigues)."""
    cos = np.cos(angles)[:, None]
    sin = np.sin(angles)[:, None]
    along = (vectors @ axis)[:, None] * axis[None, :]
    return vectors * cos + np.cross(axis[None, :], vectors) * sin + along * (1.0 - cos)


def align_sleeves_to_arms(
    points: np.ndarray,
    normals: np.ndarray,
    joint_positions: np.ndarray,
    chains: list[dict[str, int]],
    torso_profile: tuple[np.ndarray, np.ndarray] | None = None,
    silhouette_margin: float = 0.06,
    search_radius: float = 0.26,
    sleeve_radius: float = 0.095,
    facing_min: float = 0.15,
    cuff_band: float = 0.04,
    shoulder_fade: float = 0.14,
    min_angle_deg: float = 1.5,
) -> tuple[np.ndarray, dict]:
    """A-포즈 상의의 헐렁한 소매를 어깨 둘레로 돌려 몸의 팔 방향에 맞춘다.

    생성된 전신 그림의 팔은 몸의 A-포즈 팔과 각도가 달라(내려뜨린 정도가 다르다) 소매 끝이 팔에서 5~15 cm 벗어난다. 그 상태로 팔을 T-포즈로
    올리면 소매 아랫부분이 몸통·밑단 웨이트를 받아 날개처럼 늘어진다. 먼저 소매를 어깨를 중심으로 팔 방향으로 돌려 놓으면, 이후의 충돌 해소와 표면 웨이트
    전달이 보통의 몸에 붙는 소매처럼 동작한다.

    1. 소매 끝(커프): 몸통 실루엣(`torso_profile`, +`silhouette_margin`) 밖이고 몸의 팔 축(어깨→손목) 둘레 `search_radius` 안에서 팔 방향으로 가장
       멀리 뻗은 정점들(`cuff_band` 안)의 중심. 이 중심이 소매 자체의 축(어깨→커프 중심)을 정한다.
    2. 소매 정점: 자체 축에서 `sleeve_radius` 안이고 법선이 축에서 바깥쪽을 향하는 정점. 소매 옆에 붙은 몸통 옆면은 법선이 축 쪽을 향해 빠진다.
       어깨에서 `shoulder_fade` 안쪽으로 갈수록 소매 비중이 0으로 줄어 몸통에 이어진다.
    3. 소매 비중만큼의 각도로, 자체 축을 팔 축으로 옮기는 회전을 어깨 둘레로 적용한다.
    소매 끝이 팔꿈치보다 안쪽이거나 이미 거의 정렬된(`min_angle_deg` 미만) 쪽은 건드리지 않는다.
    `chains` 각 항목은 {"arm", "forearm", "hand"} joint 번호, `joint_positions`는 A-포즈 월드 위치다. (이동한 점, 보고)를 돌려준다.
    """
    out = points.copy()
    report: dict = {"sides": []}
    for chain in chains:
        shoulder = joint_positions[chain["arm"]]
        elbow = joint_positions[chain["forearm"]]
        wrist = joint_positions[chain["hand"]]
        l_up = float(np.linalg.norm(elbow - shoulder))
        base_axis = (wrist - shoulder) / max(float(np.linalg.norm(wrist - shoulder)), 1e-9)
        offset = points - shoulder
        axial = offset @ base_axis
        lateral = np.linalg.norm(offset - np.outer(axial, base_axis), axis=1)
        eligible = (lateral <= search_radius) & (axial > 0.0)
        if torso_profile is not None:
            edges_y, half_width = torso_profile
            bin_index = np.clip(np.searchsorted(edges_y, points[:, 1]) - 1, 0, len(half_width) - 1)
            side = 1.0 if wrist[0] >= 0.0 else -1.0
            eligible &= side * points[:, 0] > half_width[bin_index] + silhouette_margin
        candidates = np.flatnonzero(eligible)
        if len(candidates) == 0:
            report["sides"].append({"cuff": None})
            continue
        a_max = float(axial[candidates].max())
        if a_max < l_up:
            report["sides"].append({"cuff": None, "reason": "소매가 팔꿈치 안쪽에서 끝남", "cuffAxialM": round(a_max, 3)})
            continue
        cuff = candidates[axial[candidates] >= a_max - cuff_band]
        own = points[cuff].mean(axis=0) - shoulder
        # 소매 끝 고리는 몸의 팔 축과 기울어져 있어 한쪽 가장자리가 먼저 뽑힌다 → 소매 자체 축을 기준으로 고리를 다시 뽑아 중심을 바로잡는다.
        for _ in range(2):
            refined_axis = own / max(float(np.linalg.norm(own)), 1e-9)
            refined_axial = offset[candidates] @ refined_axis
            ring = candidates[refined_axial >= refined_axial.max() - cuff_band]
            own = points[ring].mean(axis=0) - shoulder
        own_length = float(np.linalg.norm(own))
        own_axis = own / max(own_length, 1e-9)
        angle = float(np.arccos(np.clip(own_axis @ base_axis, -1.0, 1.0)))
        if np.degrees(angle) < min_angle_deg:
            report["sides"].append({"cuff": int(len(cuff)), "angleDeg": round(float(np.degrees(angle)), 2), "reason": "이미 팔 방향과 정렬됨"})
            continue
        rotation_axis = np.cross(own_axis, base_axis)
        rotation_axis /= max(float(np.linalg.norm(rotation_axis)), 1e-9)
        own_axial = offset @ own_axis
        radial_vector = offset - np.outer(own_axial, own_axis)
        own_lateral = np.linalg.norm(radial_vector, axis=1)
        facing = np.einsum("ij,ij->i", normals, radial_vector / np.maximum(own_lateral, 1e-9)[:, None])
        tube = _smoothstep(sleeve_radius + 0.02, sleeve_radius - 0.02, own_lateral) * _smoothstep(facing_min - 0.15, facing_min + 0.15, facing)
        membership = tube * _smoothstep(0.0, shoulder_fade, own_axial) * (own_axial < own_length + 0.15)
        out = shoulder + _rotate_about_axis(out - shoulder, rotation_axis, membership * angle)
        report["sides"].append(
            {"cuff": int(len(cuff)), "angleDeg": round(float(np.degrees(angle)), 2), "cuffAxialM": round(a_max, 3), "sleeveVertices": int((membership > 0.5).sum()), "weightedVertices": int((membership > 0.05).sum())}
        )
    return out, report


def stretched_faces(before: np.ndarray, after: np.ndarray, triangles: np.ndarray, ratio: float = 4.0, min_length: float = 0.10) -> np.ndarray:
    """포즈를 바꾼 뒤 변이 `ratio`배 이상 늘어나 `min_length`(m) 넘게 길어진 삼각형 마스크.

    생성된 의상은 소매 끝이 밑단에 닿아 한 덩어리로 이어진 경우가 있다(소매 끝에서 밑단까지 옷감 거리가 5 cm). 팔을 올리면 그 이음 삼각형이
    몇십 cm짜리 띠로 늘어난다. 정상적인 늘어남(겨드랑이 변이 2~3배)은 걸리지 않게 길이 하한을 함께 둔다.
    """
    triangles = np.asarray(triangles, dtype=np.int64)
    torn = np.zeros(len(triangles), dtype=bool)
    for a, b in ((0, 1), (1, 2), (2, 0)):
        old = np.linalg.norm(before[triangles[:, a]] - before[triangles[:, b]], axis=1)
        new = np.linalg.norm(after[triangles[:, a]] - after[triangles[:, b]], axis=1)
        torn |= (new >= min_length) & (new >= ratio * np.maximum(old, 1e-4))
    return torn


def raise_bangs(
    points: np.ndarray,
    bang_target_y: float,
    face_z: float,
    center_half_width: float = 0.07,
    blend: float = 0.04,
) -> tuple[np.ndarray, dict]:
    """앞머리 아랫선(얼굴 앞 정중앙 헤어 정점 중 가장 낮은 높이)이 `bang_target_y`(눈썹 위)보다 낮으면, 정수리에서 아래로 잰 길이를 줄여 올린다.

    전신 그림 속 인물은 머리 비율이 베이스와 달라 머리 폭·정수리를 맞춰도 앞머리가 눈 높이까지 내려와 눈을 가린다. `face_z` 앞쪽(귀 앞)의 정점만
    정수리 기준으로 길이를 `k`배로 줄이고(`blend` 폭으로 부드럽게 이어 붙임), 뒷머리·옆머리 길이는 그대로 둔다.
    앞머리가 없거나(정중앙 앞쪽에 정점이 없음) 이미 목표보다 높으면 건드리지 않는다. (이동한 점, 보고)를 돌려준다.
    """
    top = float(points[:, 1].max())
    front = (points[:, 2] > face_z) & (np.abs(points[:, 0]) < center_half_width)
    if not front.any():
        return points, {"raised": False, "reason": "얼굴 앞 정중앙에 헤어 정점이 없음"}
    bottom = float(points[front, 1].min())
    if bottom >= bang_target_y:
        return points, {"raised": False, "bangBottomY": round(bottom, 4), "reason": "이미 목표보다 높음"}
    k = (top - bang_target_y) / max(top - bottom, 1e-6)
    weight = _smoothstep(face_z - blend, face_z + blend, points[:, 2])
    out = points.copy()
    out[:, 1] = top - (top - points[:, 1]) * (1.0 - weight * (1.0 - k))
    return out, {"raised": True, "bangBottomY": round(bottom, 4), "targetY": bang_target_y, "lengthScale": round(k, 3)}


def spike_faces(triangles: np.ndarray, rounds: int = 3) -> np.ndarray:
    """한 변으로만 이웃과 이어진(나머지 두 변이 열린 가장자리인) 삼각형 마스크 — 떼어 낸 자리의 가는 가시. `rounds`번 되풀이해 깎는다."""
    triangles = np.asarray(triangles, dtype=np.int64)
    alive = np.ones(len(triangles), dtype=bool)
    for _ in range(rounds):
        current = triangles[alive]
        if len(current) == 0:
            break
        pairs = np.sort(np.concatenate([current[:, [0, 1]], current[:, [1, 2]], current[:, [2, 0]]]), axis=1)
        unique, inverse, counts = np.unique(pairs, axis=0, return_inverse=True, return_counts=True)
        shared = (counts[inverse.reshape(-1)] >= 2).reshape(3, len(current)).sum(axis=0)
        drop_local = shared <= 1
        if not drop_local.any():
            break
        alive[np.flatnonzero(alive)[drop_local]] = False
    return ~alive


def small_island_faces(triangles: np.ndarray, vertex_count: int, min_faces: int = 120, min_fraction: float = 0.03) -> np.ndarray:
    """꼭짓점으로 이어진 덩어리 중 삼각형이 `max(min_faces, 전체의 min_fraction)`개 미만인 덩어리의 삼각형 마스크(떼어 낸 뒤 남는 파편)."""
    triangles = np.asarray(triangles, dtype=np.int64)
    parent = np.arange(vertex_count)

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return int(x)

    for a, b, c in triangles.tolist():
        for u, v in ((a, b), (b, c)):
            ru, rv = find(u), find(v)
            if ru != rv:
                parent[rv] = ru
    roots = np.array([find(int(v)) for v in triangles[:, 0]]) if len(triangles) else np.zeros(0, dtype=np.int64)
    labels, counts = np.unique(roots, return_counts=True)
    threshold = max(min_faces, int(min_fraction * len(triangles)))
    small = labels[counts < threshold]
    return np.isin(roots, small)


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
