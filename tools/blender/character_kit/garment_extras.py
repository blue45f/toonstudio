"""의상·헤어를 베이스에 맞춘 뒤 형상을 직접 다듬는 보정(numpy; 광선 질의는 `surface.Surface`가 bpy의 BVH로 한다).

생성 모델(Hyper3D)이 프롬프트로 주지 못하거나 베이스 비율에 맞추면서 사라지는 형상을 이 저장소가 직접 만든다:

- `trim_hem`: 상의 밑단의 앞·뒤 중앙이 V자로 처져(옆면보다 10 cm 안팎 낮다) 가랑이 사이까지 내려온 것을, 옆면 높이의 수평 밑단으로 자른다.
- `trim_sleeve_ends`: 소매가 손목을 넘어 손등까지 덮은 조각(BANG이 손 쪽까지 소매 천을 남긴 생성물)을 손목 평면에서 자른다.
- `hood_down`: 후디의 내려 둔 후드. 생성 모델은 모든 시도(프록시 참조 이미지 포함)에서 후드 볼륨을 만들지 못했다(칼라로 읽거나 BANG이 머리 파츠에 붙였다).
  목 둘레를 감싼 굵은 접힘(토러스)과 등에 늘어진 주머니(돔)를 상의 셸 위에 얹는다. 높이는 셸 표면을 광선으로 재서 따라가므로 베이스·의상이 달라도 맞는다.
- `extend_tails`: 트윈테일은 두개골 폭에 맞춰 배율을 정하면 꼬리가 머리에 붙은 단발이 된다. 머리 위 묶음 아래의 꼬리를 길이·바깥으로 늘린다.

모두 T-포즈 베이스 좌표(m, Y 위, +Z 앞)를 가정한다.
"""

from __future__ import annotations

import math

import numpy as np

from character_kit.surface import Surface


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((np.asarray(x, dtype=np.float64) - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# ---------------------------------------------------------------- 밑단


def trim_hem(positions: np.ndarray, triangles: np.ndarray, percentile: float = 55.0, x_limit: float = 0.23, y_limit: float = 1.10, bins: int = 24) -> tuple[np.ndarray, np.ndarray, dict]:
    """몸통 밑단의 높이 분포에서 `percentile` 백분위 높이로 수평하게 자른다.

    생성된 상의는 밑단이 닫힌 껍데기이거나(열린 루프가 없다) 열린 루프가 칼라 조각 등 엉뚱한 곳에 있어, 열린 루프로는 밑단을 찾을 수 없다. 그래서 몸통 정점
    (|x| < `x_limit`, y < `y_limit`)을 몸통 둘레 각도 `bins`개 구간으로 나눠 구간마다 가장 낮은 높이를 재고, 그 분포의 `percentile` 백분위를 자를 높이로 쓴다.
    V자로 처진 앞·뒤 중앙(소수 구간)은 잘려 나가고 옆면 높이로 밑단이 수평이 된다. 높이 아래 삼각형(무게중심 기준)을 지운 뒤 남은 삼각형의
    선 아래 정점을 모두 그 높이로 올려 가시를 없앤다.
    돌려주는 값: (삼각형 보존 마스크, 수정된 정점 위치, 보고).
    """
    used = np.unique(triangles)
    torso = used[(np.abs(positions[used, 0]) < x_limit) & (positions[used, 1] < y_limit)]
    keep = np.ones(len(triangles), dtype=bool)
    report: dict = {"trimmed": False}
    if len(torso) < 100:
        return keep, positions, report
    center_z = float(np.median(positions[torso, 2]))
    angle = np.arctan2(positions[torso, 0], positions[torso, 2] - center_z)
    sector = np.clip(((angle + math.pi) / (2.0 * math.pi) * bins).astype(np.int64), 0, bins - 1)
    lowest = np.full(bins, np.inf)
    np.minimum.at(lowest, sector, positions[torso, 1])
    lowest = lowest[np.isfinite(lowest)]
    cut_y = float(np.percentile(lowest, percentile))
    keep = positions[triangles][:, :, 1].mean(axis=1) >= cut_y
    report.update(trimmed=bool((~keep).any()), cutY=round(cut_y, 4), lowestY=round(float(lowest.min()), 4), removedTriangles=int((~keep).sum()), sectors=int(len(lowest)))
    if keep.all():
        return keep, positions, report
    # 무게중심은 선 위지만 정점 하나가 선 아래로 길게 나온 삼각형(가시)이 밑단을 들쭉날쭉하게 한다 → 선 아래 정점을 모두 선 높이로 올린다.
    out = positions.copy()
    below = np.unique(triangles[keep])
    below = below[out[below, 1] < cut_y]
    out[below, 1] = cut_y
    report["clamped"] = int(len(below))
    return keep, out, report


def trim_sleeve_ends(positions: np.ndarray, triangles: np.ndarray, ends: list[tuple[np.ndarray, np.ndarray]], margin: float = 0.0, body_half_width: float = 0.20) -> tuple[np.ndarray, np.ndarray, dict]:
    """소매 끝을 손목 평면에서 자른다.

    `ends`는 팔마다 (손목 위치, 손목 쪽을 향한 팔 방향 단위벡터)다. 그 평면에서 팔 방향으로 `margin`(m) 넘어선 곳에 무게중심이 있는 삼각형(몸통 폭 `body_half_width` 밖 같은
    쪽 팔의 것만)을 지우고, 남은 삼각형 중 평면을 넘은 정점은 평면 위로 끌어 와 들쭉날쭉한 끝선을 편다.
    돌려주는 값: (삼각형 보존 마스크, 수정된 정점 위치, 보고).
    """
    centroids = positions[triangles].mean(axis=1)
    keep = np.ones(len(triangles), dtype=bool)
    for wrist, axis in ends:
        same_side = centroids[:, 0] * np.sign(axis[0]) > body_half_width
        keep &= ~(same_side & ((centroids - wrist) @ axis > margin))
    out = positions.copy()
    clamped = 0
    used = np.unique(triangles[keep])
    for wrist, axis in ends:
        depth = (out[used] - wrist) @ axis - margin
        far = used[(depth > 0.0) & (out[used, 0] * np.sign(axis[0]) > body_half_width)]
        out[far] -= np.outer((out[far] - wrist) @ axis - margin, axis)
        clamped += int(len(far))
    return keep, out, {"trimmed": bool((~keep).any()), "removedTriangles": int((~keep).sum()), "clamped": clamped}


# ---------------------------------------------------------------- 후디의 내려 둔 후드


def shell_height(shell: Surface, x: np.ndarray, z: np.ndarray, top: float, floor: float) -> np.ndarray:
    """(x, z)에서 위에서 아래로 쏜 광선이 셸에 처음 닿는 y. 안 닿으면 NaN."""
    origins = np.stack([x, np.full(len(x), top), z], axis=1)
    directions = np.tile(np.array([0.0, -1.0, 0.0]), (len(x), 1))
    hits, triangle = shell.ray(origins, directions, top - floor)
    return np.where(triangle >= 0, hits[:, 1], np.nan)


def shell_depth(shell: Surface, x: np.ndarray, y: np.ndarray, behind: float = 0.7) -> np.ndarray:
    """(x, y)에서 뒤(-z)에서 앞으로 쏜 광선이 셸에 처음 닿는 z(등 표면). 안 닿으면 NaN."""
    origins = np.stack([x, y, np.full(len(x), -behind)], axis=1)
    directions = np.tile(np.array([0.0, 0.0, 1.0]), (len(x), 1))
    hits, triangle = shell.ray(origins, directions, 2.0 * behind)
    return np.where(triangle >= 0, hits[:, 2], np.nan)


def fill_nan_circular(values: np.ndarray, default: float) -> np.ndarray:
    """원형 배열의 NaN을 가까운 이웃 값으로 채운다(모두 NaN이면 `default`)."""
    out = values.copy()
    good = np.flatnonzero(~np.isnan(out))
    if len(good) == 0:
        return np.full_like(out, default)
    n = len(out)
    for i in np.flatnonzero(np.isnan(out)):
        offsets = np.minimum((good - i) % n, (i - good) % n)
        out[i] = out[good[np.argmin(offsets)]]
    return out


def smooth_circular(values: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return values
    out = np.zeros_like(values)
    for k in range(-radius, radius + 1):
        out += np.roll(values, k)
    return out / (2 * radius + 1)


def orient_triangles(positions: np.ndarray, triangles: np.ndarray, direction: np.ndarray) -> np.ndarray:
    """삼각형 평균 법선이 `direction` 쪽을 보게 감김 순서를 맞춘다."""
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    normal = np.cross(b - a, c - a).sum(axis=0)
    return triangles if float(normal @ direction) >= 0 else triangles[:, [0, 2, 1]]


def hood_ring(shell: Surface, p: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """목을 감싼 굵은 접힘(토러스). 중심선 높이는 셸 표면을 따라간다. 세 번째 값은 안쪽(목 쪽) 면 정점 마스크(안감)다."""
    u, v = int(p.get("u", 44)), int(p.get("v", 12))
    major, minor, squash = float(p["major"]), float(p["minor"]), float(p.get("squash", 0.85))
    center_z, depth_scale = float(p["center_z"]), float(p.get("depth_scale", 0.92))
    phi = 2.0 * math.pi * np.arange(u) / u  # 0 = 앞(+z), pi = 뒤
    x = major * np.sin(phi)
    z = center_z + major * np.cos(phi) * depth_scale
    hit = shell_height(shell, x, z, float(p["scan_top"]), float(p["scan_floor"]))
    hit = fill_nan_circular(hit, float(p["fallback_y"]))
    hit = smooth_circular(hit, int(p.get("smooth", 2)))
    center_y = hit + float(p.get("raise", 0.15)) * minor * squash
    if "max_center_y" in p:
        # 어깨 곡면을 따라 옆이 턱 높이까지 솟으면 목이 묻혀 보인다(초커도 가려진다) → 접힘의 윗면이 턱 아래에 머물게 중심선 높이를 제한한다.
        center_y = np.minimum(center_y, float(p["max_center_y"]))
    theta = 2.0 * math.pi * np.arange(v) / v
    radius = major + minor * np.cos(theta)  # (v,)
    px = radius[None, :] * np.sin(phi)[:, None]
    pz = center_z + radius[None, :] * np.cos(phi)[:, None] * depth_scale
    py = center_y[:, None] + squash * minor * np.sin(theta)[None, :]
    positions = np.stack([px, py, pz], axis=2).reshape(-1, 3)
    triangles = []
    for i in range(u):
        for j in range(v):
            a = i * v + j
            b = i * v + (j + 1) % v
            c = ((i + 1) % u) * v + j
            d = ((i + 1) % u) * v + (j + 1) % v
            triangles += [[a, d, b], [a, c, d]]
    triangles = np.array(triangles, dtype=np.int64)
    # 닫힌 토러스: 부호 있는 부피가 양수가 되게(바깥 법선)
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    volume = float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)
    if volume < 0:
        triangles = triangles[:, [0, 2, 1]]
    lining = np.tile(np.cos(theta) < float(p.get("lining_cos", 0.15)), u)
    return positions, triangles, lining


def hood_back(shell: Surface, p: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """등에 늘어진 후드 주머니: 셸 등 표면에서 뒤로 솟은 돔 모양 격자 패치."""
    n_s, n_t = int(p.get("grid", (24, 18))[0]), int(p.get("grid", (24, 18))[1])
    levels = np.array([w[0] for w in p["widths"]], dtype=np.float64)  # 위 → 아래(내림차순) 높이
    halves = np.array([w[1] for w in p["widths"]], dtype=np.float64)
    top, bottom = float(p["top_y"]), float(p["bottom_y"])
    s = np.linspace(0.0, 1.0, n_s)
    t = np.linspace(0.0, 1.0, n_t)
    y = top - t * (top - bottom)
    half = np.interp(y, levels[::-1], halves[::-1])  # np.interp는 오름차순 x가 필요하다
    gx = (2.0 * s[None, :] - 1.0) * half[:, None]
    gy = np.repeat(y[:, None], n_s, axis=1)
    depth = shell_depth(shell, gx.reshape(-1), gy.reshape(-1))
    depth = depth.reshape(n_t, n_s)
    # 광선이 빗나간 곳은 같은 행의 이웃으로 메운다
    for row in range(n_t):
        good = np.flatnonzero(~np.isnan(depth[row]))
        if len(good) == 0:
            depth[row] = float(np.nanmedian(depth)) if not np.all(np.isnan(depth)) else float(p.get("fallback_z", -0.1))
        elif len(good) < n_s:
            depth[row] = np.interp(np.arange(n_s), good, depth[row, good])
    bump = (np.sin(np.pi * s)[None, :] * np.sin(np.pi * t)[:, None]) ** float(p.get("shape", 0.6))
    z = depth - (float(p.get("base", 0.004)) + float(p["height"]) * bump)
    positions = np.stack([gx, gy, z], axis=2).reshape(-1, 3)
    triangles = []
    for r in range(n_t - 1):
        for c in range(n_s - 1):
            a = r * n_s + c
            b = a + 1
            d = a + n_s
            e = d + 1
            triangles += [[a, b, e], [a, e, d]]
    triangles = np.array(triangles, dtype=np.int64)
    triangles = orient_triangles(positions, triangles, np.array([0.0, 0.0, -1.0]))
    return positions, triangles, np.zeros(len(positions), dtype=bool)


def hood_down(shell: Surface, spec: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """후드(접힘 + 등 주머니)를 하나의 메시로 돌려준다: (정점, 삼각형, 안감 정점 마스크)."""
    parts = [hood_ring(shell, spec["ring"]), hood_back(shell, spec["back"])]
    positions = np.concatenate([part[0] for part in parts])
    lining = np.concatenate([part[2] for part in parts])
    offset = 0
    triangles = []
    for part in parts:
        triangles.append(part[1] + offset)
        offset += len(part[0])
    return positions, np.concatenate(triangles), lining


# ---------------------------------------------------------------- 트윈테일 꼬리


def extend_tails(positions: np.ndarray, head_top: float, spec: dict) -> np.ndarray:
    """머리 위 묶음 아래(`tie_y` = 정수리 − `tie_below_top`)의 꼬리를 아래로 `stretch`배, 바깥으로 최대 `spread`(m) 늘린다. 정수리 쪽은 그대로다."""
    tie_y = head_top - float(spec["tie_below_top"])
    stretch, spread = float(spec["stretch"]), float(spec["spread"])
    out = positions.copy()
    below = np.maximum(tie_y - positions[:, 1], 0.0)
    ramp = smoothstep(0.0, float(spec.get("ramp", 0.03)), below)
    out[:, 1] = positions[:, 1] - below * (stretch - 1.0) * ramp
    out[:, 0] = positions[:, 0] + np.sign(positions[:, 0]) * spread * smoothstep(0.0, float(spec.get("spread_ramp", 0.06)), below) * (np.abs(positions[:, 0]) > float(spec.get("x_min", 0.02)))
    return out
