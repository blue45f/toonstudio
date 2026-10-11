"""Hyper3D T-포즈 의상 생성용 참조 이미지(프록시)를 만든다 (bpy venv python으로 실행).

Rodin은 글 프롬프트의 "T-pose"를 따르지 않고 팔을 내린 A-포즈 인물을 만든다. A-포즈 의상을 T-포즈로 되돌리면(겨드랑이 늘어남·찢김) 품질이 무너지므로,
베이스 몸 위에 얇은 프록시 의상(몸 표면을 법선으로 부풀린 셸)을 입힌 **T-포즈 정면 렌더**를 참조 이미지로 주고 글 프롬프트로 의상 디테일을 더한다.
이미지가 포즈와 비례(= 베이스)를 정하므로 BANG으로 분리한 의상 파츠가 곧바로 베이스 T-포즈 몸에 맞고 변환이 필요 없다.

사용(저장소 루트)::

    <venv>/bin/python -I tools/blender/character_kit/proxy_reference.py -- \\
        --base-model ~/.cache/toonstudio-kit/out2/base_model_female.npz --kind shirt --out /tmp/proxy_shirt.png [--size 1024] [--flat]

`--kind`: shirt(흰 셔츠 + 뾰족한 칼라와 앞단) | blazer(네이비 + 노치 라펠·가슴 주머니·플랩 주머니 + 흰 셔츠 칼라) | hoodie(회색 + 두툼하게 내려 둔 후드 + 캥거루 주머니) | sailor(흰 짧은 상의 + 네이비 앞 V 칼라·뒤 사각 칼라·소매단).
깃·라펠·후드는 색 영역이 아니라 몸 표면을 법선으로 더 부풀린 **입체 패치**라서 Rodin이 형태로 읽는다. `--views front,back,side`면 `<out 이름>_<뷰>.png`를 방향별로 만든다(후드 주머니·뒤 칼라는 뒷면에서만 보인다).
모든 종류에 어두운 회색 바지 프록시를 함께 입힌다(속옷 차림 인물이 나오는 것을 막고, BANG이 바지도 분리하게 한다).
배경은 흰색, 카메라는 직교 정면이다. 참조 이미지는 베이스 메시를 렌더한 것뿐이며 외부 이미지·모델을 쓰지 않는다.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from character_kit.garment_fit import vertex_normals, weld_vertices  # noqa: E402

SKIN = (0.93, 0.76, 0.66)
DARK = (0.18, 0.19, 0.22)
WHITE = (0.96, 0.96, 0.96)
NAVY = (0.10, 0.14, 0.30)
GRAY = (0.70, 0.71, 0.75)

# 종류별: (상의 몸 영역 y 하한(밑단), 소매 포함 여부, 몸 여유 m, 소매 여유 m)
KINDS = {
    "shirt": {"hem": 0.80, "body": WHITE, "ease": 0.026, "sleeve_ease": 0.028},
    "blazer": {"hem": 0.80, "body": NAVY, "ease": 0.030, "sleeve_ease": 0.026},
    "hoodie": {"hem": 0.78, "body": GRAY, "ease": 0.040, "sleeve_ease": 0.036},
    "sailor": {"hem": 0.93, "body": WHITE, "ease": 0.022, "sleeve_ease": 0.024},
}


def load_arrays(path: str) -> dict:
    data = np.load(path, allow_pickle=True)
    names = [str(n) for n in data["region_ids"]]
    positions = data["body_tpose_positions"].astype(np.float64)
    triangles = data["body_triangles"].astype(np.int64)
    region = data["body_region"].astype(np.int64)
    # UV 이음매로 쪼개진 정점을 합쳐야 법선이 이음매 양쪽에서 같아져 부풀린 셸에 틈이 생기지 않는다.
    canon_index, canon_positions = weld_vertices(positions)
    canon_region = np.zeros(len(canon_positions), dtype=np.int64)
    canon_region[canon_index] = region
    return {
        "names": names,
        "region": canon_region,
        "positions": canon_positions,
        "triangles": canon_index[triangles],
        "head_positions": data["head_tpose_positions"].astype(np.float64),
        "head_triangles": data["head_triangles"].astype(np.int64),
        "extra": {key.split("/")[1] + "/" + key.split("/")[2]: (data[key].astype(np.float64), data[key.replace("tpose_positions", "triangles")].astype(np.int64)) for key in data.files if key.startswith("mesh/") and key.endswith("tpose_positions") and "Underwear" not in key},
    }


def smooth_offsets(positions: np.ndarray, triangles: np.ndarray, iterations: int = 6) -> np.ndarray:
    """부풀린 셸을 가볍게 평활화한다(영역 경계의 법선 불연속을 지운다)."""
    count = len(positions)
    edges = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    edges = np.concatenate([edges, edges[:, ::-1]])
    degree = np.bincount(edges[:, 0], minlength=count).astype(np.float64)
    out = positions.copy()
    for _ in range(iterations):
        accum = np.zeros_like(out)
        np.add.at(accum, edges[:, 0], out[edges[:, 1]])
        mean = accum / np.maximum(degree, 1.0)[:, None]
        out = np.where(degree[:, None] > 0, 0.5 * out + 0.5 * mean, out)
    return out


def shell(arrays: dict, regions: list[str], y_range: tuple[float, float], ease_by_region: dict[str, float], default_ease: float, neck_top: float | None = None) -> tuple[np.ndarray, np.ndarray]:
    """몸 메시에서 영역·높이로 고른 부분을 법선 방향으로 `ease`만큼 부풀린 셸 (정점, 삼각형). `neck_top`은 목 영역에만 거는 높이 상한(목둘레선)이다."""
    ids = [arrays["names"].index(name) for name in regions]
    positions, triangles = arrays["positions"], arrays["triangles"]
    normals = vertex_normals(positions, triangles)
    keep = np.isin(arrays["region"], ids) & (positions[:, 1] >= y_range[0]) & (positions[:, 1] <= y_range[1])
    if neck_top is not None:
        keep &= ~((arrays["region"] == arrays["names"].index("neck")) & (positions[:, 1] > neck_top))
    face_keep = keep[triangles].all(axis=1)
    used = np.unique(triangles[face_keep])
    remap = np.full(len(positions), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    ease = np.full(len(positions), default_ease)
    for name, value in ease_by_region.items():
        ease[arrays["region"] == arrays["names"].index(name)] = value
    moved = positions + normals * ease[:, None]
    new_triangles = remap[triangles[face_keep]]
    new_positions = smooth_offsets(moved[used], new_triangles, 10)
    return new_positions, new_triangles


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((np.asarray(x, dtype=np.float64) - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def polygon_distance(points: np.ndarray, polygon: list[tuple[float, float]]) -> np.ndarray:
    """(x, y) 점들에서 다각형 변까지의 최단 거리(m)."""
    best = np.full(len(points), np.inf)
    count = len(polygon)
    for i in range(count):
        a = np.array(polygon[i])
        b = np.array(polygon[(i + 1) % count])
        ab = b - a
        t = np.clip(((points - a) @ ab) / max(float(ab @ ab), 1e-12), 0.0, 1.0)
        best = np.minimum(best, np.linalg.norm(points - (a + t[:, None] * ab), axis=1))
    return best


def point_in_polygon(points: np.ndarray, polygon: list[tuple[float, float]]) -> np.ndarray:
    """(x, y) 점들이 다각형 안에 있는지(짝수-홀수 규칙)."""
    x, y = points[:, 0], points[:, 1]
    inside = np.zeros(len(points), dtype=bool)
    count = len(polygon)
    for i in range(count):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % count]
        crosses = (y1 > y) != (y2 > y)
        with np.errstate(divide="ignore", invalid="ignore"):
            x_at = (x2 - x1) * (y - y1) / (y2 - y1) + x1
        inside ^= crosses & (x < x_at)
    return inside


class Body:
    """프록시가 얹힐 몸 표면: BVH와 정점 법선."""

    def __init__(self, arrays: dict) -> None:
        from character_kit.surface import Surface, barycentric

        self.surface = Surface(arrays["positions"], arrays["triangles"])
        self.normals = vertex_normals(arrays["positions"], arrays["triangles"])
        self._barycentric = barycentric

    def hit(self, xy: np.ndarray, side: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """(x, y)에서 앞(side=+1, +z에서 -z로) 또는 뒤(side=-1)로 쏜 광선의 몸 표면점·보간 법선·성공 마스크."""
        origins = np.column_stack([xy, np.full(len(xy), side * 0.6)])
        directions = np.tile(np.array([0.0, 0.0, -side]), (len(xy), 1))
        points, triangle = self.surface.ray(origins, directions, 1.2)
        found = triangle >= 0
        normals = np.zeros_like(points)
        if found.any():
            corners = self.surface.triangles[triangle[found]]
            a, b, c = (self.surface.positions[corners[:, k]] for k in range(3))
            bary = np.clip(self._barycentric(points[found], a, b, c), 0.0, 1.0)
            bary /= np.maximum(bary.sum(axis=1, keepdims=True), 1e-12)
            normals[found] = np.einsum("mc,mck->mk", bary, self.normals[corners])
            normals[found] /= np.maximum(np.linalg.norm(normals[found], axis=1, keepdims=True), 1e-12)
        return points, normals, found


def drape(body: Body, polygon: list[tuple[float, float]], side: float, base: float, height: float, bevel: float = 0.004, dome: float = 0.0, grid: float = 0.0045) -> tuple[np.ndarray, np.ndarray]:
    """앞·뒤에서 본 다각형 안을 촘촘히 삼각분할(제약 델로네)해 몸 표면에 입힌다 (정점, 삼각형).

    정점마다 몸 표면에서 `base`(= 상의 셸 여유) + `height`만큼 법선으로 띄운다. 높이는 가장자리에서 `bevel`(m) 안에 0에서 올라가 가장자리가 깔끔하다.
    `dome`이 0이 아니면 그 거리(m)까지 천천히 솟는 둥근 단면(후드 주머니처럼 두툼한 덩어리)이다. 몸 표면 정점이 아니라 다각형 변 위에 정점을 두므로 가장자리가 들쭉날쭉하지 않다.
    """
    from mathutils import geometry

    poly = np.array(polygon, dtype=np.float64)
    boundary: list[np.ndarray] = []
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        steps = max(1, int(math.ceil(np.linalg.norm(b - a) / 0.0025)))
        boundary += [a + (b - a) * k / steps for k in range(steps)]
    boundary_points = np.array(boundary)
    xs = np.arange(poly[:, 0].min(), poly[:, 0].max() + grid, grid)
    ys = np.arange(poly[:, 1].min(), poly[:, 1].max() + grid, grid)
    mesh_grid = np.array([(x, y) for y in ys for x in xs])
    inside = point_in_polygon(mesh_grid, polygon) & (polygon_distance(mesh_grid, polygon) > 0.0016)
    points_2d = np.concatenate([boundary_points, mesh_grid[inside]])
    count = len(boundary_points)
    edges = [(i, (i + 1) % count) for i in range(count)]
    out_vertices, _, out_faces, *_ = geometry.delaunay_2d_cdt([tuple(v) for v in points_2d.tolist()], edges, [], 1, 1e-7)
    xy = np.array([(v[0], v[1]) for v in out_vertices], dtype=np.float64)
    triangles = np.array(out_faces, dtype=np.int64).reshape(-1, 3)
    points, normals, found = body.hit(xy, side)
    distance = polygon_distance(xy, polygon)
    if dome > 0.0:
        profile = np.sqrt(smoothstep(0.0, dome, distance))
    else:
        profile = smoothstep(0.0, bevel, distance)
    positions = points + normals * (base + height * profile)[:, None]
    keep = found[triangles].all(axis=1)
    triangles = triangles[keep]
    if side < 0:
        triangles = triangles[:, ::-1]  # 뒤에서 본 면은 바깥(-z)을 향해야 한다
    used = np.unique(triangles)
    remap = np.full(len(positions), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    return positions[used], remap[triangles]


def neck_band(y0: float, y1: float, radius_x: float, radius_z: float, thickness: float, center_z: float = 0.004, rows: int = 5, segments: int = 56) -> tuple[np.ndarray, np.ndarray]:
    """목을 감싼 열린 원통 띠(칼라 스탠드)."""
    positions = []
    for row in range(rows):
        y = y0 + (y1 - y0) * row / (rows - 1)
        flare = 1.0 + 0.10 * (row / (rows - 1)) ** 2
        for k in range(segments):
            phi = 2.0 * math.pi * k / segments
            positions.append([(radius_x + thickness) * flare * math.sin(phi), y, center_z + (radius_z + thickness) * flare * math.cos(phi)])
    triangles = []
    for row in range(rows - 1):
        for k in range(segments):
            a, b = row * segments + k, row * segments + (k + 1) % segments
            c, d = (row + 1) * segments + k, (row + 1) * segments + (k + 1) % segments
            triangles += [[a, d, b], [a, c, d]]
    return np.array(positions), np.array(triangles, dtype=np.int64)


def tilted_torus(front_y: float, back_y: float, major: float, minor: float, squash: float = 0.8, center_z: float = 0.004, u_count: int = 56, v_count: int = 18) -> tuple[np.ndarray, np.ndarray]:
    """목을 감싼 굵은 접힘(내려 둔 후드의 앞가장자리). 앞은 `front_y`로 낮고 뒤는 `back_y`로 높게 기울어진다."""
    positions = []
    for i in range(u_count):
        phi = 2.0 * math.pi * i / u_count  # 0 = 앞(+z), pi = 뒤
        tilt = 0.5 * (1.0 - math.cos(phi))  # 앞 0 → 뒤 1
        center_y = front_y + (back_y - front_y) * tilt
        for j in range(v_count):
            theta = 2.0 * math.pi * j / v_count
            radius = major + minor * math.cos(theta)
            positions.append([radius * math.sin(phi), center_y + squash * minor * math.sin(theta), center_z + radius * math.cos(phi) * 0.92])
    triangles = []
    for i in range(u_count):
        for j in range(v_count):
            a = i * v_count + j
            b = i * v_count + (j + 1) % v_count
            c = ((i + 1) % u_count) * v_count + j
            d = ((i + 1) % u_count) * v_count + (j + 1) % v_count
            triangles += [[a, d, b], [a, c, d]]
    return np.array(positions), np.array(triangles, dtype=np.int64)


def mirrored(polygon: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [(-x, y) for x, y in reversed(polygon)]


def feature_meshes(body: Body, kind: str, shell_ease: float) -> list[tuple[str, np.ndarray, np.ndarray, tuple]]:
    """종류별 입체 특징 (이름, 정점, 삼각형, 색). 모두 상의 셸(`shell_ease`) 바깥으로 솟은 얇은 패치다."""
    out: list[tuple[str, np.ndarray, np.ndarray, tuple]] = []

    def add(name, mesh, color):
        if len(mesh[1]):
            out.append((name, mesh[0], mesh[1], color))

    def pair(name, polygon, side, height, color, **kwargs):
        for sign in (1.0, -1.0):
            poly = polygon if sign > 0 else mirrored(polygon)
            add(name, drape(body, poly, side, shell_ease, height, **kwargs), color)

    if kind == "shirt":
        light = (0.90, 0.91, 0.94)
        add("collar_stand", neck_band(1.340, 1.382, 0.052, 0.056, 0.010), light)
        pair("collar_wing", [(0.030, 1.356), (0.098, 1.352), (0.090, 1.318), (0.042, 1.262), (0.022, 1.300)], 1.0, 0.014, light)
        add("placket", drape(body, [(-0.015, 1.262), (0.015, 1.262), (0.015, 0.900), (-0.015, 0.900)], 1.0, shell_ease, 0.008), (0.84, 0.85, 0.88))
    elif kind == "blazer":
        navy_light = (0.17, 0.22, 0.44)
        add("shirt_v", drape(body, [(-0.044, 1.352), (0.044, 1.352), (0.0, 1.100)], 1.0, shell_ease, 0.003), (0.95, 0.95, 0.96))
        pair("lapel", [(0.038, 1.352), (0.096, 1.356), (0.088, 1.304), (0.124, 1.254), (0.099, 1.208), (0.014, 1.102), (0.030, 1.205), (0.034, 1.292)], 1.0, 0.018, navy_light)
        pair("shirt_collar", [(0.024, 1.352), (0.052, 1.354), (0.046, 1.322), (0.022, 1.298)], 1.0, 0.010, (0.97, 0.97, 0.98))
        add("collar_back", neck_band(1.342, 1.386, 0.052, 0.056, 0.012), navy_light)
        add("chest_pocket", drape(body, [(0.086, 1.202), (0.142, 1.206), (0.144, 1.170), (0.088, 1.166)], 1.0, shell_ease, 0.010), (0.14, 0.18, 0.36))
        pair("flap_pocket", [(0.076, 1.024), (0.152, 1.030), (0.154, 0.986), (0.078, 0.982)], 1.0, 0.012, (0.14, 0.18, 0.36))
        pair("button", [(0.0 + 0.012 + 0.007 * math.cos(a), 1.060 + 0.007 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 12, endpoint=False)], 1.0, 0.006, (0.22, 0.27, 0.50))
    elif kind == "sailor":
        navy = (0.10, 0.14, 0.30)
        pair("front_collar", [(0.032, 1.354), (0.160, 1.338), (0.178, 1.302), (0.054, 1.168), (0.010, 1.214)], 1.0, 0.016, navy)
        add("back_collar", drape(body, [(-0.174, 1.350), (0.174, 1.350), (0.190, 1.250), (0.182, 1.146), (-0.182, 1.146), (-0.190, 1.250)], -1.0, shell_ease, 0.016), navy)
        add("scarf_knot", drape(body, [(-0.022, 1.236), (0.022, 1.236), (0.028, 1.204), (-0.028, 1.204)], 1.0, shell_ease, 0.022), (0.62, 0.10, 0.12))
        add("scarf_tails", drape(body, [(-0.018, 1.204), (0.018, 1.204), (0.026, 1.130), (-0.026, 1.130)], 1.0, shell_ease, 0.012), (0.62, 0.10, 0.12))
    elif kind == "hoodie":
        gray_dark = (0.50, 0.51, 0.55)
        add("hood_roll", tilted_torus(front_y=1.336, back_y=1.372, major=0.092, minor=0.036), gray_dark)
        add("hood_back", drape(body, [(-0.090, 1.360), (0.090, 1.360), (0.165, 1.300), (0.160, 1.196), (0.104, 1.136), (-0.104, 1.136), (-0.160, 1.196), (-0.165, 1.300)], -1.0, shell_ease, 0.062, dome=0.060), gray_dark)
        add("kangaroo_pocket", drape(body, [(-0.108, 1.092), (0.108, 1.092), (0.116, 0.936), (-0.116, 0.936)], 1.0, shell_ease, 0.014), (0.64, 0.65, 0.69))
        pair("drawstring", [(0.026, 1.296), (0.034, 1.296), (0.040, 1.170), (0.032, 1.170)], 1.0, 0.012, (0.92, 0.92, 0.94))
    return out


def split_by_color(positions: np.ndarray, triangles: np.ndarray, color_of) -> list[tuple[tuple, np.ndarray]]:
    """삼각형 무게중심으로 색을 정해 같은 색끼리 묶는다."""
    centers = positions[triangles].mean(axis=1)
    colors = [color_of(c) for c in centers]
    groups: dict[tuple, list[int]] = {}
    for index, color in enumerate(colors):
        groups.setdefault(color, []).append(index)
    return [(color, triangles[np.array(indices)]) for color, indices in groups.items()]


def top_color(kind: str, base: tuple):
    """상의 셸의 기본색. 깃·라펠·칼라·후드는 색 영역이 아니라 `feature_meshes`의 입체 패치다."""
    return lambda c: base


def sleeve_cuffs(kind: str, color_of):
    if kind != "sailor":
        return color_of

    def with_cuffs(c):
        if abs(c[0]) > 0.58:  # 소매 끝 7 cm 정도
            return NAVY
        return color_of(c)

    return with_cuffs


def build_scene(arrays: dict, kind: str, size: int, outputs: dict[str, str], flat: bool) -> None:
    import bpy
    from mathutils import Vector

    spec = KINDS[kind]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    def add_mesh(name: str, positions: np.ndarray, triangles: np.ndarray, color: tuple) -> None:
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(positions.tolist(), [], triangles.tolist())
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(obj)
        material = bpy.data.materials.new(name)
        material.diffuse_color = (*color, 1.0)
        obj.data.materials.append(material)
        for polygon in mesh.polygons:
            polygon.use_smooth = True

    add_mesh("body", arrays["positions"], arrays["triangles"], SKIN)
    add_mesh("head", arrays["head_positions"], arrays["head_triangles"], SKIN)
    for key, (positions, triangles) in arrays["extra"].items():
        name = key.split("/")[0]
        color = (0.98, 0.98, 0.98) if "Eye" in name else (0.12, 0.10, 0.10)
        add_mesh(name + "_" + key.split("/")[1], positions, triangles, color)

    top_positions, top_triangles = shell(
        arrays,
        ["torso", "pelvis", "neck", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        (spec["hem"], 9.0),
        {"upperArm.L": spec["sleeve_ease"], "upperArm.R": spec["sleeve_ease"], "forearm.L": spec["sleeve_ease"], "forearm.R": spec["sleeve_ease"]},
        spec["ease"],
        neck_top=1.345,
    )
    color_of = sleeve_cuffs(kind, top_color(kind, spec["body"]))
    for index, (color, tris) in enumerate(split_by_color(top_positions, top_triangles, color_of)):
        add_mesh(f"top_{index}", top_positions, tris, color)
    for name, positions, triangles, color in feature_meshes(Body(arrays), kind, spec["ease"]):
        add_mesh(name, positions, triangles, color)

    bottom_positions, bottom_triangles = shell(
        arrays,
        ["pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R"],
        (0.095, 0.93),
        {"calf.L": 0.020, "calf.R": 0.020, "thigh.L": 0.022, "thigh.R": 0.022},
        0.022,
    )
    add_mesh("bottom", bottom_positions, bottom_triangles, DARK)

    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = False
    shading = scene.display.shading
    shading.light = "FLAT" if flat else "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_backface_culling = False
    shading.show_cavity = not flat  # 깃·라펠이 몸통 위에 솟은 경계를 어둡게 눌러 형태로 읽히게 한다
    shading.cavity_type = "BOTH"
    shading.cavity_ridge_factor = 0.9
    shading.cavity_valley_factor = 1.2
    shading.show_object_outline = False
    shading.show_specular_highlight = False
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (1.0, 1.0, 1.0)
    scene.view_settings.view_transform = "Standard"
    camera_data = bpy.data.cameras.new("c")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 1.95
    camera = bpy.data.objects.new("c", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    # 모델 +Z 가 앞(= glTF +Z)이고 y가 위다. 카메라 기본 시선은 -Z: 앞(+Z에서 봄)은 회전 없음, 뒤는 Y축 180°, 옆(+X에서 봄)은 Y축 +90°.
    views = {
        "front": (Vector((0.0, 0.84, 5.0)), (0.0, 0.0, 0.0)),
        "back": (Vector((0.0, 0.84, -5.0)), (0.0, math.pi, 0.0)),
        "side": (Vector((5.0, 0.84, 0.0)), (0.0, math.pi / 2.0, 0.0)),
    }
    for view, output in outputs.items():
        camera.location, camera.rotation_euler = views[view]
        scene.render.filepath = output
        bpy.ops.render.render(write_still=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--kind", choices=sorted(KINDS), required=True)
    parser.add_argument("--out", required=True, help="출력 PNG. --views를 주면 <이름>_<뷰>.png로 방향별로 만든다")
    parser.add_argument("--views", default="front", help="쉼표로 구분한 뷰 목록: front,back,side (기본 front)")
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--flat", action="store_true", help="입체 음영 없이 평평하게 칠한다")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:])
    views = [view for view in args.views.split(",") if view]
    stem, extension = os.path.splitext(args.out)
    outputs = {view: (args.out if views == ["front"] else f"{stem}_{view}{extension or '.png'}") for view in views}
    arrays = load_arrays(args.base_model)
    build_scene(arrays, args.kind, args.size, outputs, args.flat)
    for view, path in outputs.items():
        print(f"참조 이미지({view}): {path}")


if __name__ == "__main__":
    main()
