"""부분 영역 ARAP(as-rigid-as-possible) 변형.

A→T 포즈 변환에서 스키닝만으로는 어깨 전이 영역이 울퉁불퉁해진다. 스키닝 결과를 초기값으로 두고, 전이 영역의 정점만
국소 회전을 최대한 강체로 유지하도록 다시 풀어 어깨를 부드럽게 한다. 영역 밖 정점은 스키닝 결과로 고정한다.
균일 가중 라플라시안과 조밀 역행렬(영역 정점 수천 개)을 쓴다 — scipy 없이 numpy만 쓰기 위한 선택이다.
"""

from __future__ import annotations

import numpy as np


def arap_deform(
    rest: np.ndarray,
    initial: np.ndarray,
    free: np.ndarray,
    ptr: np.ndarray,
    idx: np.ndarray,
    iterations: int = 24,
) -> np.ndarray:
    """`free` 정점(번호 배열)만 풀고 나머지는 `initial`에 고정한 ARAP 결과 (V,3)."""
    count = len(rest)
    is_free = np.zeros(count, dtype=bool)
    is_free[free] = True
    # 영향받는 정점 = 자유 정점 + 그 이웃(고정 정점의 회전도 필요)
    src_all = np.repeat(np.arange(count), np.diff(ptr))
    touches_free = np.zeros(count, dtype=bool)
    touches_free[src_all[is_free[idx]]] = True
    active = np.flatnonzero(is_free | touches_free)

    # 활성 정점의 방향 간선(i 활성, j 이웃)
    mask = np.isin(src_all, active)
    e_src, e_dst = src_all[mask], idx[mask]
    order = np.argsort(e_src, kind="stable")
    e_src, e_dst = e_src[order], e_dst[order]
    unique_src, starts = np.unique(e_src, return_index=True)
    local_of = np.full(count, -1, dtype=np.int64)
    local_of[unique_src] = np.arange(len(unique_src))

    free_list = np.flatnonzero(is_free)
    free_local = np.full(count, -1, dtype=np.int64)
    free_local[free_list] = np.arange(len(free_list))
    nf = len(free_list)

    # 라플라시안 L_ff (조밀), 고정 이웃은 우변으로
    degree = np.diff(ptr).astype(np.float64)
    L = np.zeros((nf, nf))
    L[np.arange(nf), np.arange(nf)] = degree[free_list]
    f_src = np.flatnonzero(is_free[e_src])
    for s, d in zip(e_src[f_src].tolist(), e_dst[f_src].tolist(), strict=True):
        if is_free[d]:
            L[free_local[s], free_local[d]] -= 1.0
    inverse = np.linalg.inv(L)

    current = initial.copy()
    dp = rest[e_src] - rest[e_dst]  # (E,3) 고정된 레스트 간선
    for _ in range(iterations):
        dq = current[e_src] - current[e_dst]
        covariance = np.einsum("ei,ej->eij", dp, dq)
        sums = np.add.reduceat(covariance, starts, axis=0)  # (A,3,3)
        u, _, vt = np.linalg.svd(sums)
        rotation = np.einsum("aji,akj->aik", vt, u)  # V U^T
        det = np.linalg.det(rotation)
        flip = det < 0
        if flip.any():
            u2 = u.copy()
            u2[flip, :, 2] *= -1.0
            rotation = np.einsum("aji,akj->aik", vt, u2)
        rot_s = rotation[local_of[e_src]]
        rot_d = rotation[local_of[e_dst]]
        # 이웃이 활성 집합 밖(회전 미정의)이면 자기 회전을 쓴다
        valid_d = local_of[e_dst] >= 0
        rot_d = np.where(valid_d[:, None, None], rot_d, rot_s)
        rhs_edges = 0.5 * np.einsum("eij,ej->ei", rot_s + rot_d, dp)
        rhs_all = np.add.reduceat(rhs_edges, starts, axis=0)  # (A,3)
        rhs = rhs_all[local_of[free_list]].copy()
        # 고정 이웃 기여를 우변으로 옮긴다
        fixed_edge = ~is_free[e_dst] & is_free[e_src]
        if fixed_edge.any():
            np.add.at(rhs, free_local[e_src[fixed_edge]], current[e_dst[fixed_edge]])
        current[free_list] = inverse @ rhs
    return current
