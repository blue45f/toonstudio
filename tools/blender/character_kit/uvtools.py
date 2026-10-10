"""UV 전개(bpy)와 UV 점검(numpy)·페인트 래스터 도구.

- `unwrap_quads`: Blender `smart_project`로 쿼드 메시를 UV 전개한다(UDIM 원본 UV를 버리고 0..1 단일 타일로 새로 편다).
- `overlap_ratio`: 검증기 V12와 같은 규칙(1024² 래스터, 픽셀 중심이 삼각형 안쪽 1e-6)으로 겹침 픽셀 비율을 잰다.
- `paint_triangles`: 정점 값(색 등)을 UV 공간 이미지로 구워 텍스처를 만든다(중복 제거 없는 단순 래스터).
"""

from __future__ import annotations

import math

import numpy as np


def unwrap_quads(
    positions: np.ndarray,
    quads: np.ndarray,
    *,
    angle_limit_deg: float = 66.0,
    island_margin: float = 0.0,
) -> np.ndarray:
    """쿼드 메시를 smart_project로 전개하고 루프별 UV (M,4,2) float32를 돌려준다(패킹 전, 크기·위치는 임의)."""
    import bpy

    mesh = bpy.data.meshes.new("kit_unwrap")
    mesh.from_pydata(positions.astype(np.float32).tolist(), [], quads.tolist())
    mesh.update()
    obj = bpy.data.objects.new("kit_unwrap", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(
            angle_limit=math.radians(angle_limit_deg),
            island_margin=island_margin,
            area_weight=0.0,
            correct_aspect=True,
            scale_to_bounds=False,
        )
        bpy.ops.object.mode_set(mode="OBJECT")
        layer = mesh.uv_layers.active
        data = np.empty(len(mesh.loops) * 2, dtype=np.float32)
        layer.data.foreach_get("uv", data)
        return data.reshape(-1, 4, 2)
    finally:
        if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(mesh)


def split_by_uv(positions_index: np.ndarray, uv_per_corner: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """코너(정점 번호, UV)가 다르면 정점을 나눈다. 반환: (원래 정점 번호 (N,), UV (N,2), 코너→새 정점 번호 (C,))."""
    flat_index = positions_index.reshape(-1)
    flat_uv = uv_per_corner.reshape(-1, 2)
    key = np.concatenate([flat_index[:, None].astype(np.float64), np.round(flat_uv.astype(np.float64) * 1e6)], axis=1)
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return flat_index[first], flat_uv[first].astype(np.float32), inverse.reshape(-1)


def overlap_ratio(uvs: np.ndarray, triangles: np.ndarray, size: int = 1024) -> tuple[float, int, int]:
    """검증기 `verifyUvOverlap`과 같은 규칙으로 (겹침 비율, 덮인 픽셀 수, 겹친 픽셀 수)를 돌려준다."""
    counts = np.zeros((size, size), dtype=np.uint8)
    epsilon = 1e-6
    scaled = uvs.astype(np.float64) * size
    for tri in triangles:
        a, b, c = scaled[tri[0]], scaled[tri[1]], scaled[tri[2]]
        area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if not np.isfinite(area) or abs(area) < 1e-9:
            continue
        min_x = max(0, math.floor(min(a[0], b[0], c[0])))
        max_x = min(size - 1, math.ceil(max(a[0], b[0], c[0])))
        min_y = max(0, math.floor(min(a[1], b[1], c[1])))
        max_y = min(size - 1, math.ceil(max(a[1], b[1], c[1])))
        if min_x > max_x or min_y > max_y:
            continue
        xs = np.arange(min_x, max_x + 1) + 0.5
        ys = np.arange(min_y, max_y + 1) + 0.5
        px, py = np.meshgrid(xs, ys)
        inverse = 1.0 / area
        w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) * inverse
        w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) * inverse
        w2 = 1.0 - w0 - w1
        inside = (w0 > epsilon) & (w1 > epsilon) & (w2 > epsilon)
        view = counts[min_y : max_y + 1, min_x : max_x + 1]
        view[inside] = np.minimum(view[inside] + 1, 2)
    covered = int((counts >= 1).sum())
    overlapped = int((counts >= 2).sum())
    return (overlapped / covered if covered else 0.0), covered, overlapped


def paint_triangles(
    uvs: np.ndarray,
    triangles: np.ndarray,
    corner_values: np.ndarray,
    size: int,
    background: np.ndarray,
) -> np.ndarray:
    """삼각형 내부를 코너 값(C,3)의 무게중심 보간으로 칠한 (size,size,channels) float32 이미지.

    `corner_values`는 삼각형 코너 순서(`triangles.reshape(-1)`)와 같은 (T*3, channels) 배열이다.
    """
    channels = corner_values.shape[1]
    image = np.empty((size, size, channels), dtype=np.float32)
    image[:] = np.asarray(background, dtype=np.float32)
    scaled = uvs.astype(np.float64) * size
    values = corner_values.reshape(len(triangles), 3, channels)
    for t, tri in enumerate(triangles):
        a, b, c = scaled[tri[0]], scaled[tri[1]], scaled[tri[2]]
        area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if abs(area) < 1e-12:
            continue
        min_x = max(0, math.floor(min(a[0], b[0], c[0])) - 1)
        max_x = min(size - 1, math.ceil(max(a[0], b[0], c[0])) + 1)
        min_y = max(0, math.floor(min(a[1], b[1], c[1])) - 1)
        max_y = min(size - 1, math.ceil(max(a[1], b[1], c[1])) + 1)
        xs = np.arange(min_x, max_x + 1) + 0.5
        ys = np.arange(min_y, max_y + 1) + 0.5
        px, py = np.meshgrid(xs, ys)
        inverse = 1.0 / area
        w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) * inverse
        w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) * inverse
        w2 = 1.0 - w0 - w1
        # 경계 한 픽셀 확장(섬 가장자리 번짐 방지)
        slack = -0.02
        inside = (w0 >= slack) & (w1 >= slack) & (w2 >= slack)
        if not inside.any():
            continue
        color = w0[..., None] * values[t, 0] + w1[..., None] * values[t, 1] + w2[..., None] * values[t, 2]
        view = image[min_y : max_y + 1, min_x : max_x + 1]
        view[inside] = color[inside]
    return image


# ---- 섬 패킹 ---------------------------------------------------------------------------
# bpy 5.x의 `uv.pack_islands`는 백그라운드 모드에서 레이아웃을 키우지 못하고 가는 띠로 남긴다(2026-10-10 확인).
# 그래서 smart_project로 섬만 만들고 패킹은 직접 한다: 섬별 최소 면적 회전 + 선반(shelf) 패킹 + 이분 탐색 스케일.


def _convex_hull(points: np.ndarray) -> np.ndarray:
    pts = np.unique(np.round(points.astype(np.float64), 9), axis=0)
    if len(pts) <= 2:
        return pts
    pts = pts[np.lexsort((pts[:, 1], pts[:, 0]))]

    def cross(o: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[np.ndarray] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[np.ndarray] = []
    for p in pts[::-1]:
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return np.array(lower[:-1] + upper[:-1])


def island_labels(quads_uv_index: np.ndarray, vertex_count: int) -> np.ndarray:
    """분할된 UV 정점 번호로 이어진 면들의 섬 번호 (F,)."""
    parent = np.arange(vertex_count)

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for quad in quads_uv_index.tolist():
        root = find(quad[0])
        for v in quad[1:]:
            rv = find(v)
            if rv != root:
                parent[rv] = root
    face_root = np.array([find(q[0]) for q in quads_uv_index.tolist()])
    _, labels = np.unique(face_root, return_inverse=True)
    return labels


def pack_uv_islands(
    uv_vertices: np.ndarray,
    quads_uv_index: np.ndarray,
    margin: float = 0.004,
    allow_rotation: bool = True,
) -> np.ndarray:
    """분할된 UV 정점 (N,2)을 섬 단위로 회전·스케일·배치해 0..1 안에 담은 새 UV (N,2)를 돌려준다.

    모든 섬에 같은 스케일을 쓴다(텍셀 밀도 균일). 최대 스케일을 이분 탐색으로 찾는다.
    """
    labels = island_labels(quads_uv_index, len(uv_vertices))
    count = int(labels.max()) + 1
    vertex_island = np.zeros(len(uv_vertices), dtype=np.int64)
    vertex_island[quads_uv_index.reshape(-1)] = np.repeat(labels, quads_uv_index.shape[1])

    rotated: list[np.ndarray] = []
    sizes = np.zeros((count, 2))
    for island in range(count):
        members = np.flatnonzero(vertex_island == island)
        pts = uv_vertices[members].astype(np.float64)
        best_pts, best_area = pts, np.inf
        angles = [0.0]
        if allow_rotation:
            hull = _convex_hull(pts)
            if len(hull) >= 3:
                edges = np.roll(hull, -1, axis=0) - hull
                angles = list(np.arctan2(edges[:, 1], edges[:, 0]))
            angles.append(0.0)
        for angle in angles:
            c, s = np.cos(-angle), np.sin(-angle)
            r = pts @ np.array([[c, -s], [s, c]]).T
            extent = r.max(axis=0) - r.min(axis=0)
            area = extent[0] * extent[1]
            if area < best_area - 1e-15:
                best_area, best_pts = area, r
        best_pts = best_pts - best_pts.min(axis=0)
        if best_pts[:, 1].max() > best_pts[:, 0].max():  # 가로가 길게 눕힌다
            best_pts = best_pts[:, ::-1] * np.array([1.0, -1.0])
            best_pts = best_pts - best_pts.min(axis=0)
        rotated.append(best_pts)
        sizes[island] = best_pts.max(axis=0)

    order = np.argsort(-sizes[:, 1])

    def layout(scale: float) -> tuple[bool, np.ndarray]:
        offsets = np.zeros((count, 2))
        x = y = margin
        shelf_height = 0.0
        for island in order:
            w = sizes[island, 0] * scale
            h = sizes[island, 1] * scale
            if w + 2 * margin > 1.0:
                return False, offsets
            if x + w + margin > 1.0:
                x = margin
                y += shelf_height + margin
                shelf_height = 0.0
            if y + h + margin > 1.0:
                return False, offsets
            offsets[island] = (x, y)
            x += w + margin
            shelf_height = max(shelf_height, h)
        return True, offsets

    low, high = 0.0, 1.0 / max(float(sizes.max()), 1e-9)
    best_offsets = np.zeros((count, 2))
    for _ in range(40):
        mid = (low + high) / 2.0
        ok, offsets = layout(mid)
        if ok:
            low, best_offsets = mid, offsets
        else:
            high = mid
    scale = low
    result = np.zeros_like(uv_vertices, dtype=np.float64)
    for island in range(count):
        members = np.flatnonzero(vertex_island == island)
        result[members] = rotated[island] * scale + best_offsets[island]
    return result.astype(np.float32)


def unwrap_and_pack(
    positions: np.ndarray,
    quads: np.ndarray,
    margin: float = 0.004,
    angles: tuple[float, ...] = (66.0, 55.0, 45.0, 35.0, 25.0),
    max_overlap: float = 0.0002,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """전개 + 정점 분할 + 패킹. 겹침 비율이 `max_overlap` 이하가 될 때까지 각도 한계를 줄여 가며 다시 편다.

    반환: (원래 정점 번호 (N,), UV (N,2), 새 쿼드 정점 번호 (M,4)).
    """
    last = None
    for angle in angles:
        raw = unwrap_quads(positions, quads, angle_limit_deg=angle)
        origin, uv, inverse = split_by_uv(quads, raw)
        new_quads = inverse.reshape(-1, 4)
        packed = pack_uv_islands(uv, new_quads, margin=margin)
        tris = np.concatenate([new_quads[:, [0, 1, 2]], new_quads[:, [0, 2, 3]]], axis=0)
        ratio, _, _ = overlap_ratio(packed, tris, 1024)
        last = (origin, packed, new_quads)
        if ratio <= max_overlap:
            return last
    assert last is not None
    return last
