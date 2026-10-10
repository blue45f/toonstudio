"""스킨 웨이트 계산과 이중 쿼터니언 스키닝(DQS).

웨이트는 HBM 해부학 분할(face set)로 정점마다 "소유 본"을 정하고, 소유 본이 바뀌는 경계 양쪽 몇 링 안에서만
이웃 평균(조화 보간)으로 부드럽게 섞어 만든다. 손가락은 뼈대 폴리라인 위의 위치로 정한다. 최종 웨이트는 정점당 상위 4개로
줄여 합이 1이 되게 한다(계약: 영향 ≤ 4, 합 1 ± 1e-3).
"""

from __future__ import annotations

import numpy as np

from . import hbm
from .rig import MIXAMO, Rig

MAX_INFLUENCES = 4

# 본 종류별 경계 띠 폭(링 수). (자기쪽, 상대쪽). 같은 종류끼리는 대칭.
_CATEGORY = {
    "Hips": "spine", "Spine": "spine", "Spine1": "spine", "Spine2": "spine",
    "Neck": "neck", "Head": "head", "Shoulder": "shoulder", "Arm": "arm", "ForeArm": "forearm", "Hand": "hand",
    "UpLeg": "upleg", "Leg": "leg", "Foot": "foot", "ToeBase": "toe", "TS_Jaw": "jaw",
}
_BAND: dict[tuple[str, str], tuple[int, int]] = {
    ("spine", "spine"): (5, 5),
    ("spine", "neck"): (4, 4),
    ("neck", "head"): (4, 4),
    ("neck", "shoulder"): (3, 3),
    ("spine", "shoulder"): (4, 4),
    ("shoulder", "arm"): (4, 4),
    ("spine", "arm"): (2, 6),  # 몸통은 거의 안 끌려오고 팔 쪽이 넓게 섞인다
    ("arm", "forearm"): (3, 3),
    ("forearm", "hand"): (2, 2),
    ("spine", "upleg"): (3, 5),
    ("upleg", "leg"): (3, 3),
    ("leg", "foot"): (3, 3),
    ("foot", "toe"): (2, 2),
    ("head", "jaw"): (3, 3),
    ("jaw", "neck"): (4, 4),
}


def _category(name: str) -> str:
    base = name.removeprefix(MIXAMO)
    for prefix in ("Left", "Right"):
        base = base.removeprefix(prefix)
    return _CATEGORY.get(base, "other")


def band_width(owner_name: str, other_name: str) -> int:
    """owner쪽 정점이 other와의 경계에서 몇 링까지 섞이는가."""
    a, b = _category(owner_name), _category(other_name)
    if (a, b) in _BAND:
        return _BAND[(a, b)][0]
    if (b, a) in _BAND:
        return _BAND[(b, a)][1]
    return 3


def vertex_adjacency(faces: np.ndarray, vertex_count: int) -> tuple[np.ndarray, np.ndarray]:
    """쿼드 면에서 CSR 이웃 목록 (ptr, idx)을 만든다."""
    k = faces.shape[1]
    src = np.concatenate([faces[:, i] for i in range(k)] + [faces[:, (i + 1) % k] for i in range(k)])
    dst = np.concatenate([faces[:, (i + 1) % k] for i in range(k)] + [faces[:, i] for i in range(k)])
    key = np.unique(src.astype(np.int64) * vertex_count + dst)
    src, dst = key // vertex_count, key % vertex_count
    ptr = np.zeros(vertex_count + 1, dtype=np.int64)
    np.add.at(ptr, src + 1, 1)
    return np.cumsum(ptr), dst.astype(np.int64)


def _gather_neighbors(vertices: np.ndarray, ptr: np.ndarray, idx: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    starts = ptr[vertices]
    counts = ptr[vertices + 1] - starts
    total = int(counts.sum())
    src = np.repeat(vertices, counts)
    offsets = np.arange(total) - np.repeat(np.cumsum(counts) - counts, counts)
    dst = idx[np.repeat(starts, counts) + offsets]
    return src, dst


def band_cores(owner: np.ndarray, ptr: np.ndarray, idx: np.ndarray, names: list[str]) -> np.ndarray:
    """경계에서 충분히 먼 정점(= 소유 본 100 %로 고정할 정점)의 불리언 마스크."""
    count = len(owner)
    all_vertices = np.arange(count)
    src, dst = _gather_neighbors(all_vertices, ptr, idx)
    differs = owner[src] != owner[dst]
    dist = np.full(count, np.iinfo(np.int32).max, dtype=np.int64)
    other = np.full(count, -1, dtype=np.int64)
    boundary_src, boundary_dst = src[differs], dst[differs]
    dist[boundary_src] = 0
    other[boundary_src] = owner[boundary_dst]
    frontier = np.unique(boundary_src)
    step = 0
    while frontier.size:
        step += 1
        s, d = _gather_neighbors(frontier, ptr, idx)
        keep = (owner[s] == owner[d]) & (dist[d] > step)
        s, d = s[keep], d[keep]
        if d.size == 0:
            break
        unique_d, first = np.unique(d, return_index=True)
        dist[unique_d] = step
        other[unique_d] = other[s[first]]
        frontier = unique_d
    limit = np.full(count, np.iinfo(np.int32).max, dtype=np.int64)
    has_other = other >= 0
    for a in np.unique(owner[has_other]):
        for b in np.unique(other[has_other & (owner == a)]):
            sel = has_other & (owner == a) & (other == b)
            limit[sel] = band_width(names[a], names[b])
    return dist >= limit


def harmonic_weights(owner: np.ndarray, core: np.ndarray, ptr: np.ndarray, idx: np.ndarray, bone_count: int, iterations: int = 240) -> np.ndarray:
    """코어 정점은 소유 본 one-hot으로 고정하고 나머지는 이웃 평균을 반복해 조화 보간한 (V,B) float32."""
    count = len(owner)
    used = np.unique(owner)
    column = np.full(bone_count, -1, dtype=np.int64)
    column[used] = np.arange(len(used))
    weights = np.zeros((count, len(used)), dtype=np.float32)
    weights[np.arange(count), column[owner]] = 1.0
    free = np.flatnonzero(~core)
    if free.size:
        _, dst = _gather_neighbors(free, ptr, idx)
        counts = (ptr[free + 1] - ptr[free]).astype(np.float32)
        segment = np.cumsum(counts.astype(np.int64)) - counts.astype(np.int64)
        inverse = (1.0 / np.maximum(counts, 1.0))[:, None]
        # 코어와 먼 자유 정점의 초기값은 이웃 평균이 빠르게 수렴하도록 균등 분포로 시작한다.
        weights[free] = 1.0 / len(used)
        for _ in range(iterations):
            gathered = weights[dst]
            weights[free] = np.add.reduceat(gathered, segment, axis=0) * inverse
    full = np.zeros((count, bone_count), dtype=np.float32)
    full[:, used] = weights
    return full


def top_influences(weights: np.ndarray, limit: int = MAX_INFLUENCES, cutoff: float = 0.005) -> tuple[np.ndarray, np.ndarray]:
    """(V,B) 웨이트 → 정점당 상위 `limit`개 (인덱스 uint8 (V,limit), 값 float32 (V,limit)), 합 1로 정규화."""
    order = np.argsort(-weights, axis=1)[:, :limit]
    values = np.take_along_axis(weights, order, axis=1)
    values = np.where(values < cutoff, 0.0, values)
    total = values.sum(axis=1, keepdims=True)
    # 모두 잘려 나가는 정점(합 0)은 1순위 본에 100 %
    zero = total[:, 0] <= 0.0
    values[zero, 0] = 1.0
    total = values.sum(axis=1, keepdims=True)
    values = (values / total).astype(np.float32)
    order = np.where(values > 0.0, order, 0)
    return order.astype(np.uint8), values


# ---- 소유 본 ---------------------------------------------------------------------------


def assign_owners(body: hbm.Body, rig: Rig, head_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """면 소유 본 (F,)과 정점 소유 본 (V,)을 돌려준다. 손가락 면은 Hand가 소유한다(손가락 웨이트는 따로 덮어씀)."""
    J = {name: i for i, name in enumerate(rig.names)}
    fc = body.face_center
    fs = body.face_set
    side = np.where(fc[:, 0] >= 0.0, 1, -1)
    label = np.where(side > 0, "Left", "Right")
    A = rig.a_pose
    owner = np.full(len(fs), -1, dtype=np.int64)

    def put(mask: np.ndarray, name: str) -> None:
        owner[mask & (owner < 0)] = J[name]

    def put_sided(mask: np.ndarray, suffix: str) -> None:
        for s, lab in ((1, "Left"), (-1, "Right")):
            owner[mask & (side == s) & (owner < 0)] = J[f"{MIXAMO}{lab}{suffix}"]

    head_y = A[J[MIXAMO + "Head"], 1]
    # 머리/목: 턱 아래 앞쪽과 뒤통수 아래를 잇는 기울어진 평면으로 목과 머리를 가른다.
    plane_y = head_y - 0.045 - 0.4375 * (fc[:, 2] - 0.13)
    neck_side = fc[:, 1] < plane_y
    put(head_mask & neck_side, MIXAMO + "Neck")
    lip_seam_y = head_y + 0.0095  # 입술 틈 높이(Head joint 기준 오프셋; HBM 여성 1.4645)
    in_jaw = (fs == hbm.JAW_SET) | ((fs == hbm.LIP_SET) & (fc[:, 1] < lip_seam_y))
    put(head_mask & in_jaw, "TS_Jaw")
    put(head_mask, MIXAMO + "Head")

    spine_names = [MIXAMO + n for n in ("Hips", "Spine", "Spine1", "Spine2")]
    spine_y = np.array([A[J[n], 1] for n in spine_names])
    cuts = (spine_y[:-1] + spine_y[1:]) / 2.0
    torso = np.isin(fs, [hbm.CHEST_SET, hbm.ABDOMEN_SET, hbm.PELVIS_SET]) & ~head_mask
    neck_base = A[J[MIXAMO + "Neck"], 1] - 0.03
    in_neck = torso & (fc[:, 1] > neck_base) & (np.abs(fc[:, 0]) < 0.07)
    put(in_neck, MIXAMO + "Neck")
    shoulder_top = A[J[MIXAMO + "Spine2"], 1] + 0.055
    in_shoulder = torso & (fs == hbm.CHEST_SET) & (np.abs(fc[:, 0]) >= 0.07) & (fc[:, 1] > shoulder_top)
    put_sided(in_shoulder, "Shoulder")
    band = np.digitize(fc[:, 1], cuts)
    for i, name in enumerate(spine_names):
        put(torso & (band == i), name)

    put_sided(np.isin(fs, list(hbm.UPPER_ARM_SETS)), "Arm")
    put_sided(np.isin(fs, list(hbm.FOREARM_SETS)), "ForeArm")
    put_sided(np.isin(fs, list(hbm.HAND_PALM_SETS)) | np.isin(fs, list(hbm.FINGER_SETS)), "Hand")
    put_sided(np.isin(fs, list(hbm.THIGH_SETS)), "UpLeg")
    put_sided(np.isin(fs, list(hbm.CALF_SETS)), "Leg")
    put_sided(np.isin(fs, list(hbm.FOOT_SETS)) | np.isin(fs, list(hbm.FOREFOOT_SETS)), "Foot")
    put_sided(np.isin(fs, list(hbm.TOE_SETS)), "ToeBase")
    if (owner < 0).any():
        raise RuntimeError(f"소유 본이 없는 면이 {(owner < 0).sum()}개 있습니다.")
    _ = label

    vertex_owner = np.zeros(len(body.positions), dtype=np.int64)
    votes = np.zeros((len(body.positions), len(rig.names)), dtype=np.int32)
    for k in range(4):
        np.add.at(votes, (body.faces[:, k], owner), 1)
    vertex_owner = votes.argmax(axis=1)
    return owner, vertex_owner


# ---- 손가락 ----------------------------------------------------------------------------


def finger_vertex_groups(body: hbm.Body, left_sets: dict[str, tuple[int, ...]], right_sets: dict[str, tuple[int, ...]]) -> dict[tuple[str, str], np.ndarray]:
    """(좌우 라벨, 손가락 이름) → 그 손가락 면에 속한 정점 번호."""
    groups: dict[tuple[str, str], np.ndarray] = {}
    for label, table in (("Left", left_sets), ("Right", right_sets)):
        for finger, sets in table.items():
            mask = np.isin(body.face_set, list(sets))
            groups[(label, finger)] = np.unique(body.faces[mask].ravel())
    return groups


def _smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def finger_weights(points: np.ndarray, chain: np.ndarray, bone_indices: list[int], hand_index: int, bone_count: int, blend: float = 0.12) -> np.ndarray:
    """손가락 정점 (n,3)의 웨이트 (n,B). `chain` (4,3) = MCP, PIP, DIP, 끝. 본 = [Hand, F1, F2, F3]."""
    segment = chain[1:] - chain[:-1]
    seg_len = np.linalg.norm(segment, axis=1)
    total = seg_len.sum()
    # 폴리라인 위 매개변수(길이 비율)
    param = np.zeros(len(points))
    best = np.full(len(points), np.inf)
    cumulative = np.concatenate([[0.0], np.cumsum(seg_len)])
    for i in range(3):
        direction = segment[i] / seg_len[i]
        t = np.clip(((points - chain[i]) @ direction) / seg_len[i], 0.0, 1.0)
        nearest = chain[i] + np.outer(t * seg_len[i], direction)
        distance = np.linalg.norm(points - nearest, axis=1)
        better = distance < best
        best[better] = distance[better]
        param[better] = (cumulative[i] + t[better] * seg_len[i]) / total
    # 뿌리 쪽 바깥(MCP 뒤)은 음수로 확장해 Hand 쪽으로 보낸다.
    root_direction = segment[0] / seg_len[0]
    behind = ((points - chain[0]) @ root_direction) / total
    param = np.where(behind < 0.0, behind, param)
    edges = cumulative[1:3] / total  # PIP, DIP 경계
    weights = np.zeros((len(points), bone_count), dtype=np.float32)
    w_f1_up = _smoothstep(0.0 - blend, 0.0 + blend, param)  # Hand → F1
    w_f2_up = _smoothstep(edges[0] - blend, edges[0] + blend, param)  # F1 → F2
    w_f3_up = _smoothstep(edges[1] - blend, edges[1] + blend, param)  # F2 → F3
    weights[:, hand_index] = 1.0 - w_f1_up
    weights[:, bone_indices[0]] = w_f1_up * (1.0 - w_f2_up)
    weights[:, bone_indices[1]] = w_f1_up * w_f2_up * (1.0 - w_f3_up)
    weights[:, bone_indices[2]] = w_f1_up * w_f2_up * w_f3_up
    return weights


def compute_weights(
    body: hbm.Body,
    rig: Rig,
    head_mask: np.ndarray,
    finger_groups: dict[tuple[str, str], np.ndarray],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """몸 전체 스킨 웨이트. (influence 인덱스 (V,4) uint8, 값 (V,4) float32, 정점 소유 본 (V,))를 돌려준다."""
    count = len(body.positions)
    bone_count = len(rig.names)
    ptr, idx = vertex_adjacency(body.faces, count)
    _, owner = assign_owners(body, rig, head_mask)
    core = band_cores(owner, ptr, idx, rig.names)
    weights = harmonic_weights(owner, core, ptr, idx, bone_count)
    J = {name: i for i, name in enumerate(rig.names)}
    for (label, finger), vertices in finger_groups.items():
        chain = np.stack([rig.a_pose[J[f"{MIXAMO}{label}Hand{finger}{k}"]] for k in range(1, 5)])
        bones = [J[f"{MIXAMO}{label}Hand{finger}{k}"] for k in range(1, 4)]
        weights[vertices] = finger_weights(body.positions[vertices], chain, bones, J[f"{MIXAMO}{label}Hand"], bone_count)
    indices, values = top_influences(weights)
    return indices, values, owner


# ---- 이중 쿼터니언 스키닝 ---------------------------------------------------------------


def _matrix_to_quaternion(R: np.ndarray) -> np.ndarray:
    """(n,3,3) → (n,4) 단위 쿼터니언 (w,x,y,z)."""
    n = R.shape[0]
    q = np.zeros((n, 4))
    for i in range(n):
        m = R[i]
        trace = m[0, 0] + m[1, 1] + m[2, 2]
        if trace > 0.0:
            s = 0.5 / np.sqrt(trace + 1.0)
            q[i] = [0.25 / s, (m[2, 1] - m[1, 2]) * s, (m[0, 2] - m[2, 0]) * s, (m[1, 0] - m[0, 1]) * s]
        elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
            s = 2.0 * np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2])
            q[i] = [(m[2, 1] - m[1, 2]) / s, 0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s]
        elif m[1, 1] > m[2, 2]:
            s = 2.0 * np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2])
            q[i] = [(m[0, 2] - m[2, 0]) / s, (m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s]
        else:
            s = 2.0 * np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1])
            q[i] = [(m[1, 0] - m[0, 1]) / s, (m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s]
        q[i] /= np.linalg.norm(q[i])
    return q


def _quat_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    aw, ax, ay, az = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    bw, bx, by, bz = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack(
        [
            aw * bw - ax * bx - ay * by - az * bz,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
        ],
        axis=-1,
    )


def _quat_rotate(q: np.ndarray, v: np.ndarray) -> np.ndarray:
    """단위 쿼터니언 (n,4)로 벡터 (n,3) 회전."""
    qv = q[:, 1:]
    uv = np.cross(qv, v)
    uuv = np.cross(qv, uv)
    return v + 2.0 * (q[:, :1] * uv + uuv)


def dual_quaternion_skin(points: np.ndarray, indices: np.ndarray, weights: np.ndarray, rotation: np.ndarray, translation: np.ndarray) -> np.ndarray:
    """본마다 x' = R x + t 변환을 DQS로 섞어 점을 변환한다. `indices`/`weights`는 (V,K)."""
    quat = _matrix_to_quaternion(rotation)  # (B,4)
    trans_q = np.concatenate([np.zeros((len(translation), 1)), translation], axis=1)
    dual = 0.5 * _quat_mul(trans_q, quat)  # (B,4)
    q_i = quat[indices]  # (V,K,4)
    d_i = dual[indices]
    reference = q_i[:, :1, :]
    sign = np.where((q_i * reference).sum(axis=2, keepdims=True) < 0.0, -1.0, 1.0)
    w = weights[..., None].astype(np.float64)
    real = (q_i * sign * w).sum(axis=1)
    dual_sum = (d_i * sign * w).sum(axis=1)
    norm = np.linalg.norm(real, axis=1, keepdims=True)
    real /= norm
    dual_sum /= norm
    conj = real * np.array([1.0, -1.0, -1.0, -1.0])
    t = 2.0 * _quat_mul(dual_sum, conj)[:, 1:]
    return _quat_rotate(real, points) + t


def linear_blend_skin(points: np.ndarray, indices: np.ndarray, weights: np.ndarray, rotation: np.ndarray, translation: np.ndarray) -> np.ndarray:
    """비교·진단용 선형 블렌드 스키닝."""
    out = np.zeros_like(points, dtype=np.float64)
    for k in range(indices.shape[1]):
        r = rotation[indices[:, k]]
        t = translation[indices[:, k]]
        out += weights[:, k : k + 1] * (np.einsum("nij,nj->ni", r, points) + t)
    return out


def convert_to_t_pose(
    positions: np.ndarray,
    indices: np.ndarray,
    weights: np.ndarray,
    rig: Rig,
    ptr: np.ndarray,
    idx: np.ndarray,
    shoulder_radius: float = 0.17,
    arap_iterations: int = 24,
) -> np.ndarray:
    """A-포즈 점을 T-포즈로 옮긴다. DQS로 옮긴 뒤 어깨 전이 영역만 ARAP로 다시 푼다."""
    from .arap import arap_deform

    moved = dual_quaternion_skin(positions, indices, weights, rig.rotation, rig.translation)
    mixed = weights.max(axis=1) < 0.999
    free_mask = np.zeros(len(positions), dtype=bool)
    for label in ("Left", "Right"):
        pivot = rig.a_pose[rig.index(f"{MIXAMO}{label}Arm")]
        free_mask |= mixed & (np.linalg.norm(positions - pivot, axis=1) < shoulder_radius)
    free = np.flatnonzero(free_mask)
    if free.size == 0:
        return moved
    return arap_deform(positions, moved, free, ptr, idx, iterations=arap_iterations)


def taubin_smooth(positions: np.ndarray, free: np.ndarray, ptr: np.ndarray, idx: np.ndarray, iterations: int = 20, lam: float = 0.5, mu: float = -0.53) -> np.ndarray:
    """`free` 정점만 Taubin(수축 없는) 라플라시안 평활화한다. 나머지는 고정."""
    out = positions.copy()
    counts = np.diff(ptr)
    src = np.repeat(np.arange(len(positions)), counts)
    free_mask = np.zeros(len(positions), dtype=bool)
    free_mask[free] = True
    for step in range(iterations * 2):
        factor = lam if step % 2 == 0 else mu
        sums = np.zeros_like(out)
        np.add.at(sums, src, out[idx])
        average = sums / counts[:, None]
        out[free_mask] += factor * (average[free_mask] - out[free_mask])
    return out
