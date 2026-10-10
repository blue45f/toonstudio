"""눈·입 안·속눈썹·눈썹의 절차 생성 지오메트리 (bpy + numpy). `base_assembly`가 조립한다.

모든 좌표는 glTF(Y 위, +Z 앞, 캐릭터 왼쪽 +X, m)이고 T-포즈 레스트다(머리는 A→T 변환에서 움직이지 않는다).

- 눈: HBM의 눈(공막+각막 546 정점 구)을 그대로 쓰되(`TS_Eye_L/R`, 역할 `eyeball`), 홍채·동공은 `irises` 파츠의 일이므로 여기서는
  홍채 덮개(각막 위 0.3 mm에 얹는 얕은 돔)와 캐치라이트의 지오메트리 함수(`iris_cap`, `highlight_disc`)만 제공한다.
  HBM 홍채 원반은 각막 안쪽에 있어 불투명 공막에 가려지므로 쓰지 않는다.
- 입 안: HBM 머리는 닫힌 입술 뒤에 구강 주머니가 이미 있다(`base_assembly.classify_interior`). 여기서는 그 안에 들어갈 치아 두 줄(+잇몸)과 혀를
  만든다(`TS_Mouth`, 프리미티브 0 = 치아+잇몸 `ts_teeth`, 1 = 혀 `ts_tongue`). 윗니는 입선 위, 아랫니는 입선 아래에 두어야 한다 —
  얼굴 필드의 `jawOpen`은 입선(`p.y < MOUTH_Y`) 아래의 치아만 턱 회전을 따르게 하기 때문이다. 치아 위치는 머리 메시의 입 안벽에 광선을
  쏘아 입술 안쪽 면에서 1.2 mm 뒤로 맞춘다.
- 속눈썹: 윗눈꺼풀 가장자리(눈 구멍 둘레 루프의 위쪽 호)를 따라가는 띠(알파 컷아웃 텍스처). 눈썹: 머리 표면에 광선을 쏘아 맞춘 곡선 띠.
- 눈 깜빡임(`facs:eyeBlinkLeft/Right`): TS 필드는 눈 높이의 넓은 구(반경 0.22)를 한쪽 x 부호로 잘라 움직여서 HBM 머리에서는 정중선에 세로 주름이
  생기고 눈꺼풀이 안구를 뚫는다. 그래서 HBM 눈꺼풀 가장자리 루프에서 만든 눈꺼풀 모델로 다시 계산한다(`lid_model`·`blink_delta`) —
  윗눈꺼풀과 그 위 피부는 두 눈초리를 잇는 축 둘레로 아래로, 아랫눈꺼풀은 위로 회전하고 가장자리의 두께 차는 반지름 방향으로 맞춰 닫힌 가장자리가
  한 곡선에서 만난다. 눈초리 밖과 가장자리에서 15 mm 밖은 움직이지 않는다. 의미(좌/우 비대칭, 닫힘)는 `face-fields.ts`와 같다.
- 크게 뜨기(`facs:eyeWide`)·가늘게 뜨기(`facs:eyeSquint`)도 같은 눈꺼풀 모델로 다시 짰고(윗눈꺼풀을 위로 걷기 / 깜빡임 닫힘의 30 %), 눈썹 3종
  (`browInnerUp`·`browOuterUp`·`browDown`)은 TS 필드에 눈 보호 가중치(`eye_protection_weight`: 눈꺼풀 가장자리 둘레와 눈 아래는 거의 안 움직임)를 곱한다 —
  TS 필드는 눈구멍 전체를 안구에서 떼어 올려 빈 눈구멍을 만들었다.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import base_assembly as ba
from . import hbm
from .surface import Surface, vertex_normals


@dataclass
class EyeGeometry:
    """한쪽 눈의 기하: 구 맞춤 중심·반지름, 메시, 눈 joint 번호."""

    side: str  # "L" | "R"
    positions: np.ndarray
    triangles: np.ndarray
    center: np.ndarray
    radius: float
    joint: int
    surface: Surface


def fit_sphere(points: np.ndarray) -> tuple[np.ndarray, float]:
    design = np.c_[2.0 * points, np.ones(len(points))]
    target = (points**2).sum(axis=1)
    solution = np.linalg.lstsq(design, target, rcond=None)[0]
    center = solution[:3]
    return center, float(np.sqrt(solution[3] + (center**2).sum()))


def eye_geometry(ctx: ba.Context, side: str) -> EyeGeometry:
    positions, triangles = ctx.body.eyes[side]
    center, radius = fit_sphere(positions)
    return EyeGeometry(
        side=side,
        positions=positions.copy(),
        triangles=triangles.copy(),
        center=center,
        radius=radius,
        joint=ctx.joint_index[f"TS_Eye.{side}"],
        surface=Surface(positions, triangles),
    )


def eye_uv(eye: EyeGeometry, points: np.ndarray, extent: float | None = None) -> np.ndarray:
    """눈 정면 정사영 UV. 오른눈은 u를 뒤집어 두 눈이 같은 텍스처(코 쪽 = 작은 u)를 쓴다."""
    extent = extent or eye.radius * 1.02
    sign = 1.0 if eye.side == "L" else -1.0
    u = 0.5 + sign * (points[:, 0] - eye.center[0]) / (2.0 * extent)
    v = 0.5 - (points[:, 1] - eye.center[1]) / (2.0 * extent)  # glTF는 v가 아래로 증가: 세계 위쪽 = 이미지 위쪽
    return np.stack([u, v], axis=1).astype(np.float32)


def eye_joint_arrays(count: int, joint: int) -> tuple[np.ndarray, np.ndarray]:
    joints = np.zeros((count, 4), dtype=np.uint8)
    joints[:, 0] = joint
    weights = np.zeros((count, 4), dtype=np.float32)
    weights[:, 0] = 1.0
    return joints, weights


def eyeball_prim(eye: EyeGeometry, material: str = "ts_eye") -> ba.Prim:
    normals = vertex_normals(eye.positions, eye.triangles)
    joints, weights = eye_joint_arrays(len(eye.positions), eye.joint)
    return ba.Prim(material=material, positions=eye.positions, triangles=eye.triangles, normals=normals, uv=eye_uv(eye, eye.positions), joints=joints, weights=weights)


def ray_radius(eye: EyeGeometry, directions: np.ndarray) -> np.ndarray:
    """눈 중심에서 방향으로 쏜 광선이 눈 메시와 만나는 거리(m). 못 만나면 구 반지름."""
    origins = np.tile(eye.center, (len(directions), 1))
    far = origins + directions * (eye.radius * 3.0)
    hits, triangle = eye.surface.ray(far, -directions, max_distance=eye.radius * 3.0)  # 바깥에서 중심 쪽으로 쏴서 가장 바깥 면을 잡는다
    radius = np.linalg.norm(hits - eye.center, axis=1)
    return np.where(triangle >= 0, radius, eye.radius)


def iris_cap(eye: EyeGeometry, radius_m: float = 0.0060, clearance: float = 0.0003, rings: int = 8, segments: int = 32) -> ba.Prim:
    """눈 정면(+Z)을 중심으로 각막 위 `clearance`에 얹는 홍채 덮개. 반지름 `radius_m`의 평면 원이 눈 구면에 투영되는 크기다."""
    limb = float(np.arcsin(min(radius_m / eye.radius, 0.95)))
    thetas = np.linspace(0.0, limb, rings + 1)[1:]
    phis = np.linspace(0.0, 2.0 * np.pi, segments, endpoint=False)
    directions = [np.array([0.0, 0.0, 1.0])]
    for theta in thetas:
        for phi in phis:
            directions.append(np.array([np.sin(theta) * np.cos(phi), np.sin(theta) * np.sin(phi), np.cos(theta)]))
    directions_arr = np.array(directions)
    radius = ray_radius(eye, directions_arr) + clearance
    positions = eye.center + directions_arr * radius[:, None]
    triangles: list[list[int]] = []
    for j in range(segments):  # 중심 부채꼴
        triangles.append([0, 1 + j, 1 + (j + 1) % segments])
    for i in range(rings - 1):
        base = 1 + i * segments
        nxt = base + segments
        for j in range(segments):
            a, b = base + j, base + (j + 1) % segments
            c, d = nxt + (j + 1) % segments, nxt + j
            triangles.append([a, d, c])
            triangles.append([a, c, b])
    triangles_arr = np.array(triangles, dtype=np.int64)
    # 바깥에서 볼 때 반시계가 되도록 검사하고 아니면 뒤집는다
    a, b, c = (positions[triangles_arr[:, k]] for k in range(3))
    outward = np.einsum("ij,ij->i", np.cross(b - a, c - a), (a + b + c) / 3.0 - eye.center)
    if (outward < 0).mean() > 0.5:
        triangles_arr = triangles_arr[:, [0, 2, 1]]
    normals = directions_arr.copy()
    planar = positions[:, :2] - eye.center[:2]
    planar_max = float(np.linalg.norm(planar, axis=1).max())
    sign = 1.0  # 홍채 텍스처는 좌우 대칭
    uv = np.stack([0.5 + sign * planar[:, 0] / planar_max * 0.48, 0.5 - planar[:, 1] / planar_max * 0.48], axis=1).astype(np.float32)
    joints, weights = eye_joint_arrays(len(positions), eye.joint)
    return ba.Prim(material="ts_iris", positions=positions, triangles=triangles_arr, normals=normals, uv=uv, joints=joints, weights=weights)


def highlight_disc(eye: EyeGeometry, iris_radius_m: float = 0.0060, radius_m: float = 0.0012, offset: tuple[float, float] = (-0.30, 0.34), lift: float = 0.00045, segments: int = 16) -> ba.Prim:
    """홍채 위 캐치라이트(작은 원판). `offset`은 홍채 반지름 대비 (x, y) 위치(관찰자 기준 좌상단 = (-, +))."""
    cx = eye.center[0] + offset[0] * iris_radius_m
    cy = eye.center[1] + offset[1] * iris_radius_m
    angles = np.linspace(0.0, 2.0 * np.pi, segments, endpoint=False)
    planar = np.vstack([[cx, cy], np.stack([cx + radius_m * np.cos(angles), cy + radius_m * np.sin(angles)], axis=1)])
    dz = np.sqrt(np.maximum((eye.radius * 1.2) ** 2 - (planar[:, 0] - eye.center[0]) ** 2 - (planar[:, 1] - eye.center[1]) ** 2, 1e-12))
    directions = np.stack([planar[:, 0] - eye.center[0], planar[:, 1] - eye.center[1], dz], axis=1)
    directions /= np.linalg.norm(directions, axis=1, keepdims=True)
    radius = ray_radius(eye, directions) + lift
    positions = eye.center + directions * radius[:, None]
    triangles = np.array([[0, 1 + k, 1 + (k + 1) % segments] for k in range(segments)], dtype=np.int64)
    a, b, c = (positions[triangles[:, j]] for j in range(3))
    if (np.einsum("ij,ij->i", np.cross(b - a, c - a), (a + b + c) / 3.0 - eye.center) < 0).mean() > 0.5:
        triangles = triangles[:, [0, 2, 1]]
    uv = np.full((len(positions), 2), 0.5, dtype=np.float32)
    joints, weights = eye_joint_arrays(len(positions), eye.joint)
    return ba.Prim(material="ts_highlight", positions=positions, triangles=triangles, normals=directions, uv=uv, joints=joints, weights=weights)


# ---------------------------------------------------------------- 머리 표면에 붙는 것들


@dataclass
class HeadAttach:
    """TS_Head 표면(삼각형)과 정점 번호 변환. 속눈썹·눈썹·입 안 정렬에 쓴다."""

    surface: Surface
    head: ba.SplitMesh
    welded_of_surface_vertex: np.ndarray

    @classmethod
    def make(cls, head: ba.SplitMesh) -> HeadAttach:
        return cls(surface=Surface(head.positions, head.triangles), head=head, welded_of_surface_vertex=head.origin)


def project_to_head(attach: HeadAttach, points: np.ndarray, normal_offset: float = 0.0, direction: np.ndarray | None = None, origin_z: float = 0.30) -> tuple[np.ndarray, np.ndarray]:
    """점들을 머리 표면에 광선(기본 -Z 방향, 앞에서 뒤로)으로 투영한다. (표면점 + 법선 오프셋, 법선)을 돌려준다."""
    direction = np.array([0.0, 0.0, -1.0]) if direction is None else direction
    origins = np.array(points, dtype=np.float64)
    origins[:, 2] = origin_z
    hits, triangle = attach.surface.ray(origins, np.tile(direction, (len(points), 1)), max_distance=1.0)
    if (triangle < 0).any():
        raise RuntimeError(f"머리 표면 투영 실패 정점 {(triangle < 0).sum()}개")
    normals = attach.surface.face_normals[triangle]
    return hits + normals * normal_offset, normals


def eyelid_margin(ctx: ba.Context, head: ba.SplitMesh, side: str) -> dict[str, np.ndarray]:
    """눈 구멍 둘레(눈꺼풀 가장자리) 루프에서 윗눈꺼풀 호를 안쪽 눈초리 → 바깥 눈초리 순서로 돌려준다.

    눈 구멍 안쪽 면(HBM 분할 2 = 왼눈, 3 = 오른눈)과 바깥 머리 피부 면이 공유하는 정점이 그 루프다."""
    lining = 2 if side == "L" else 3
    quads = ctx.quads
    face_set = ctx.body.face_set
    head_faces = np.flatnonzero(ctx.head_mask)
    inside = face_set[head_faces] == lining
    vertices_in = np.unique(quads[head_faces[inside]].ravel())
    vertices_out = np.unique(quads[head_faces[~inside]].ravel())
    loop = np.intersect1d(vertices_in, vertices_out)
    points = ctx.t_pos[loop]
    eye_center = ctx.body.eyes[side][0].mean(axis=0)
    inner_x = points[:, 0].min() if side == "L" else points[:, 0].max()
    outer_x = points[:, 0].max() if side == "L" else points[:, 0].min()
    corner_y = min(points[np.argmin(np.abs(points[:, 0] - inner_x)), 1], points[np.argmin(np.abs(points[:, 0] - outer_x)), 1])
    upper = points[:, 1] >= corner_y - 0.0003
    loop, points = loop[upper], points[upper]
    order = np.argsort(np.abs(points[:, 0]))
    return {"vertices": loop[order], "points": points[order], "eye_center": eye_center, "normals": ctx.normals[loop[order]]}


def smooth_polyline(points: np.ndarray, iterations: int = 3) -> np.ndarray:
    out = points.copy()
    for _ in range(iterations):
        out[1:-1] = 0.25 * out[:-2] + 0.5 * out[1:-1] + 0.25 * out[2:]
    return out


def resample_polyline(points: np.ndarray, count: int) -> tuple[np.ndarray, np.ndarray]:
    """호 길이 기준 균등 재표본. (점들, 0..1 매개변수)를 돌려준다."""
    segment = np.linalg.norm(np.diff(points, axis=0), axis=1)
    cumulative = np.concatenate([[0.0], np.cumsum(segment)])
    parameter = np.linspace(0.0, cumulative[-1], count)
    resampled = np.stack([np.interp(parameter, cumulative, points[:, k]) for k in range(3)], axis=1)
    return resampled, parameter / cumulative[-1]


def ribbon_normals(positions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    return vertex_normals(positions, triangles)


def grid_triangles(rows: int, columns: int, flip: bool = False) -> np.ndarray:
    """(rows × columns) 정점 격자(행 우선)의 삼각형. 행이 아래→위, 열이 왼→오른쪽일 때 앞면이 +법선이 되도록 반시계."""
    tris: list[list[int]] = []
    for r in range(rows - 1):
        for c in range(columns - 1):
            a = r * columns + c
            b = a + 1
            d = a + columns
            e = d + 1
            if flip:
                tris.append([a, d, b])
                tris.append([b, d, e])
            else:
                tris.append([a, b, d])
                tris.append([b, e, d])
    return np.array(tris, dtype=np.int64)


def orient_outward(positions: np.ndarray, triangles: np.ndarray, reference_directions: np.ndarray) -> np.ndarray:
    """삼각형 법선이 참조 방향(정점별, 표면 바깥)과 같은 쪽이 되게 감김을 정한다."""
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    normal = np.cross(b - a, c - a)
    reference = reference_directions[triangles].mean(axis=1)
    if (np.einsum("ij,ij->i", normal, reference) < 0).mean() > 0.5:
        return triangles[:, [0, 2, 1]]
    return triangles


def lash_ribbons(ctx: ba.Context, head: ba.SplitMesh, attach: HeadAttach, samples: int = 26, rows: int = 4) -> tuple[ba.Prim, dict[str, np.ndarray]]:
    """양쪽 눈의 윗속눈썹 띠 하나(`TS_Lashes`). 띠는 눈꺼풀 가장자리 바깥 피부에서 앞·위로 뻗는다. 두 눈을 한 프리미티브로 합친다.

    눈 구멍 둘레 루프(`eyelid_margin`)는 눈꺼풀 두께의 안쪽 가장자리라 앞으로 4 mm 물러나 있다. 그 위치에서 띠를 뻗으면 눈꺼풀 피부 속에 묻히므로
    루프 점을 앞에서 뒤로 쏜 광선으로 바깥 눈꺼풀 피부 위에 올려놓고 시작한다. 반환 두 번째 값은 정점별 머리 표면 기준점이다."""
    all_positions: list[np.ndarray] = []
    all_uv: list[np.ndarray] = []
    all_tris: list[np.ndarray] = []
    all_base: list[np.ndarray] = []
    offset = 0
    up = np.array([0.0, 1.0, 0.0])
    forward = np.array([0.0, 0.0, 1.0])
    for side in ("L", "R"):
        margin = eyelid_margin(ctx, head, side)
        line, parameter = resample_polyline(smooth_polyline(margin["points"], 4), samples)
        roots, _ = project_to_head(attach, line + np.array([0.0, 0.0006, 0.0]), normal_offset=0.0001)
        tangent = np.gradient(roots, axis=0)
        tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-12)
        up_perp = up - (tangent @ up)[:, None] * tangent
        fwd_perp = forward - (tangent @ forward)[:, None] * tangent
        away = np.array([1.0 if side == "L" else -1.0, 0.0, 0.0])
        flick = np.clip((parameter - 0.55) / 0.45, 0.0, 1.0)[:, None]
        direction = 0.50 * fwd_perp + 0.86 * up_perp + 0.30 * flick * away
        direction /= np.linalg.norm(direction, axis=1, keepdims=True)
        length = np.interp(parameter, [0.0, 0.45, 0.8, 1.0], [0.0030, 0.0052, 0.0070, 0.0082])
        grid = np.zeros((rows, samples, 3))
        uv = np.zeros((rows, samples, 2))
        for r in range(rows):
            t = r / (rows - 1)
            grid[r] = roots + direction * (length * t)[:, None] + up[None, :] * (0.30 * length * t * t)[:, None]
            # 아이라인 띠는 두 눈 모두 u가 안쪽→바깥으로 커져야 날개가 바깥 눈꼬리에 생긴다(가닥 텍스처는 좌우 거울상으로 쓴다).
            uv[r, :, 0] = parameter if (side == "L" or getattr(ctx, "lash_style", "strands") == "liner") else 1.0 - parameter
            uv[r, :, 1] = t
        positions = grid.reshape(-1, 3)
        triangles = grid_triangles(rows, samples, flip=False)
        triangles = orient_outward(positions, triangles, np.tile(forward, (len(positions), 1)))
        all_positions.append(positions)
        all_uv.append(uv.reshape(-1, 2))
        all_tris.append(triangles + offset)
        all_base.append(np.tile(roots, (rows, 1, 1)).reshape(-1, 3))
        offset += len(positions)
    positions = np.concatenate(all_positions)
    triangles = np.concatenate(all_tris)
    joints, weights = ba.interpolate_skin(ctx, attach.surface, attach.welded_of_surface_vertex, positions)
    prim = ba.Prim(
        material="ts_lashes",
        positions=positions,
        triangles=triangles,
        normals=ribbon_normals(positions, triangles),
        uv=np.concatenate(all_uv).astype(np.float32),
        joints=joints,
        weights=weights,
    )
    return prim, {"base": np.concatenate(all_base)}


def brow_curve(side: str) -> dict[str, np.ndarray]:
    """눈썹 중심선 곡선(왼눈 기준)과 폭. 안쪽 끝이 굵고 바깥쪽 끝이 가늘다."""
    s = np.linspace(0.0, 1.0, 22)
    x = np.interp(s, [0.0, 0.5, 1.0], [0.0105, 0.0385, 0.0625])
    y = np.interp(s, [0.0, 0.5, 1.0], [1.5545, 1.5625, 1.5570]) + 0.0015 * np.sin(np.pi * s)
    half = np.interp(s, [0.0, 0.2, 0.55, 1.0], [0.0042, 0.0046, 0.0040, 0.0016])
    sign = 1.0 if side == "L" else -1.0
    return {"s": s, "x": sign * x, "y": y, "half": half}


def brow_prim(ctx: ba.Context, head: ba.SplitMesh, attach: HeadAttach, side: str, rows: int = 3, normal_offset: float = 0.0004) -> ba.Prim:
    curve = brow_curve(side)
    samples = len(curve["s"])
    top = np.stack([curve["x"], curve["y"] + curve["half"], np.zeros(samples)], axis=1)
    mid = np.stack([curve["x"], curve["y"], np.zeros(samples)], axis=1)
    bottom = np.stack([curve["x"], curve["y"] - curve["half"], np.zeros(samples)], axis=1)
    rows_points = [bottom, mid, top][:rows] if rows == 3 else [bottom, top]
    grid = []
    normals = []
    for row in rows_points:
        projected, face_normal = project_to_head(attach, row, normal_offset=normal_offset)
        grid.append(projected)
        normals.append(face_normal)
    positions = np.concatenate(grid)
    reference = np.concatenate(normals)
    rows_n = len(rows_points)
    triangles = grid_triangles(rows_n, samples, flip=(side == "R"))
    triangles = orient_outward(positions, triangles, reference)
    uv = np.zeros((rows_n, samples, 2))
    for r in range(rows_n):
        uv[r, :, 0] = curve["s"] if side == "L" else 1.0 - curve["s"]
        uv[r, :, 1] = r / (rows_n - 1)
    joints, weights = ba.interpolate_skin(ctx, attach.surface, attach.welded_of_surface_vertex, positions)
    return ba.Prim(
        material="ts_brow",
        positions=positions,
        triangles=triangles,
        normals=vertex_normals(positions, triangles),
        uv=uv.reshape(-1, 2).astype(np.float32),
        joints=joints,
        weights=weights,
    )


# ---------------------------------------------------------------- 입 안: 치아·잇몸·혀


def rounded_box(center: np.ndarray, axes: np.ndarray, half: np.ndarray, subdivisions: int = 3, exponent: float = 4.0) -> tuple[np.ndarray, np.ndarray]:
    """초타원체로 둥글린 상자. `axes`의 열은 (폭, 높이, 깊이) 단위 축, `half`는 반 크기. 바깥을 향한 반시계 삼각형을 돌려준다."""
    n = subdivisions
    grid = np.linspace(-1.0, 1.0, n + 1)
    positions: list[np.ndarray] = []
    triangles: list[list[int]] = []
    for axis in range(3):
        for sign in (-1.0, 1.0):
            u_axis, v_axis = [k for k in range(3) if k != axis]
            base = len(positions)
            for iv in range(n + 1):
                for iu in range(n + 1):
                    q = np.zeros(3)
                    q[axis] = sign
                    q[u_axis] = grid[iu]
                    q[v_axis] = grid[iv]
                    positions.append(q)
            for iv in range(n):
                for iu in range(n):
                    a = base + iv * (n + 1) + iu
                    b = a + 1
                    c = a + n + 1
                    d = c + 1
                    quad = [a, b, d, c]
                    # 면 법선이 +sign·축 방향이 되게 감김 정함
                    pa, pb, pd = positions[a], positions[b], positions[d]
                    normal = np.cross(pb - pa, pd - pa)
                    if normal[axis] * sign < 0:
                        quad = quad[::-1]
                    triangles.append([quad[0], quad[1], quad[2]])
                    triangles.append([quad[0], quad[2], quad[3]])
    cube = np.array(positions)
    norm_n = (np.abs(cube) ** exponent).sum(axis=1) ** (1.0 / exponent)
    shape = cube / norm_n[:, None]
    world = center + (shape * half) @ axes.T
    return world, np.array(triangles, dtype=np.int64)


def arch_basis(a: float, b: float, z_front: float, phi: np.ndarray, y: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """치열 곡선(앞쪽 반타원)의 점·접선·바깥(앞) 법선. phi=0이 정중선(앞니), 부호가 좌우(+ = 캐릭터 왼쪽 +x)."""
    points = np.stack([a * np.sin(phi), np.full_like(phi, y), z_front - b * (1.0 - np.cos(phi))], axis=1)
    tangent = np.stack([a * np.cos(phi), np.zeros_like(phi), b * np.sin(phi)], axis=1)
    tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
    normal = np.stack([np.sin(phi) / a, np.zeros_like(phi), np.cos(phi) / b], axis=1)
    normal /= np.linalg.norm(normal, axis=1, keepdims=True)
    return points, tangent, normal


def arc_to_phi(a: float, b: float, lengths: np.ndarray) -> np.ndarray:
    """정중선에서 호 길이 s(≥0) → 각 phi."""
    grid = np.linspace(0.0, 1.7, 2000)
    ds = np.sqrt((a * np.cos(grid)) ** 2 + (b * np.sin(grid)) ** 2)
    cumulative = np.concatenate([[0.0], np.cumsum(0.5 * (ds[1:] + ds[:-1]) * np.diff(grid))])
    return np.interp(lengths, cumulative, grid)


UPPER_TEETH = [("central", 0.0086, 0.0105), ("lateral", 0.0066, 0.0090), ("canine", 0.0076, 0.0108), ("premolar1", 0.0070, 0.0086), ("premolar2", 0.0066, 0.0084)]
LOWER_TEETH = [("central", 0.0054, 0.0086), ("lateral", 0.0060, 0.0090), ("canine", 0.0068, 0.0102), ("premolar1", 0.0070, 0.0084), ("premolar2", 0.0072, 0.0082)]


def wall_distance(surface: Surface, origin: np.ndarray, direction: np.ndarray, max_distance: float = 0.06) -> float:
    hits, triangle = surface.ray(origin[None, :], direction[None, :], max_distance=max_distance)
    if triangle[0] < 0:
        raise RuntimeError("입 안벽 광선이 머리에 닿지 않았습니다.")
    return float(np.linalg.norm(hits[0] - origin))


def build_arch(
    attach: HeadAttach,
    teeth: list[tuple[str, float, float]],
    *,
    upper: bool,
    occlusal_y: float,
    a: float,
    b: float,
    z_front: float,
    depth: float = 0.0062,
    margin: float = 0.0012,
    joint_upper: int,
    joint_lower: int,
) -> tuple[list[np.ndarray], list[np.ndarray], list[np.ndarray], list[np.ndarray]]:
    """치열 한 줄(위 또는 아래)의 (정점, 삼각형, UV, 정점 높이 비율) 목록. 이를 합쳐 한 프리미티브로 쓴다."""
    out_positions: list[np.ndarray] = []
    out_tris: list[np.ndarray] = []
    out_uv: list[np.ndarray] = []
    out_height: list[np.ndarray] = []
    for sign in (-1.0, 1.0):
        cumulative = 0.0
        for index, (_, width, height) in enumerate(teeth):
            s_center = cumulative + width / 2.0
            cumulative += width
            phi = sign * arc_to_phi(a, b, np.array([s_center]))
            y_center = occlusal_y + height / 2.0 if upper else occlusal_y - height / 2.0
            points, tangent, normal = arch_basis(a, b, z_front, phi, y_center)
            point, tan, nor = points[0], tangent[0], normal[0]
            # 입술 안쪽 면까지의 거리를 재서 앞면을 margin만큼 안쪽에 둔다
            origin = point - nor * 0.03
            distance = wall_distance(attach.surface, origin, nor)
            front = origin + nor * (distance - margin)
            center = front - nor * (depth / 2.0)
            center[1] = y_center
            axes = np.stack([tan, np.array([0.0, 1.0, 0.0]), nor], axis=1)
            half = np.array([width * 0.5 * 0.97, height * 0.5, depth * 0.5])
            positions, triangles = rounded_box(center, axes, half, subdivisions=3)
            ratio = (positions[:, 1] - (y_center - height / 2.0)) / height  # 0 = 아래, 1 = 위
            out_positions.append(positions)
            out_tris.append(triangles)
            uv = np.stack([0.05 + 0.40 * np.clip(0.5 + 0.0 * ratio, 0, 1), 0.1 + 0.8 * np.clip(ratio if upper else 1.0 - ratio, 0.0, 1.0)], axis=1)
            out_uv.append(uv)
            out_height.append(ratio)
    return out_positions, out_tris, out_uv, out_height


def gum_ribbon(attach: HeadAttach, *, upper: bool, occlusal_y: float, tooth_height: float, a: float, b: float, z_front: float, half_arc: float, margin: float = 0.0012, samples: int = 36) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """치아 위(아래)로 이어지는 잇몸 띠: 치열 곡선을 따라가는 단면 5점의 곡면. 입 안벽까지 거리를 재서 같은 깊이에 둔다."""
    s_values = np.linspace(-half_arc, half_arc, samples)
    phi = np.sign(s_values) * arc_to_phi(a, b, np.abs(s_values))
    profile = np.array([(-0.0006, -0.0025), (0.0001, 0.0010), (0.0002, 0.0040), (-0.0016, 0.0070), (-0.0046, 0.0085)])  # (앞 방향 오프셋, 치관 끝에서의 높이)
    rows: list[np.ndarray] = []
    crown = occlusal_y + tooth_height if upper else occlusal_y - tooth_height
    sign_y = 1.0 if upper else -1.0
    base_points, tangent, normal = arch_basis(a, b, z_front, phi, crown)
    distances = np.array([wall_distance(attach.surface, base_points[i] - normal[i] * 0.03 + np.array([0, sign_y * 0.004, 0]), normal[i]) for i in range(samples)])
    for offset, rise in profile:
        pts = base_points - normal * 0.03 + normal * (distances - margin)[:, None] + normal * offset
        pts[:, 1] = crown + sign_y * rise
        rows.append(pts)
    positions = np.concatenate(rows)
    triangles = grid_triangles(len(profile), samples, flip=not upper)
    # 앞을 향하게
    reference = np.tile(np.array([0.0, 0.0, 1.0]), (len(positions), 1))
    triangles = orient_outward(positions, triangles, reference)
    v = np.repeat(np.linspace(0.0, 1.0, len(profile)), samples)
    uv = np.stack([0.55 + 0.40 * np.tile(np.linspace(0.0, 1.0, samples), len(profile)) * 0.0 + 0.2, 0.1 + 0.8 * (v if upper else 1.0 - v)], axis=1)
    return positions, triangles, uv


def teeth_prim(ctx: ba.Context, attach: HeadAttach, occlusal_y: float = 1.4650) -> ba.Prim:
    """치아(위 5×2, 아래 5×2)와 잇몸 띠 두 줄. 윗줄은 Head, 아랫줄은 TS_Jaw에 100% 스킨한다."""
    head_joint = ctx.joint_index["mixamorig:Head"]
    jaw_joint = ctx.joint_index["TS_Jaw"]
    parts: list[tuple[np.ndarray, np.ndarray, np.ndarray, int]] = []
    upper_y = occlusal_y + 0.0020  # 입선(1.4653) 위
    lower_y = occlusal_y - 0.0020  # 입선 아래
    p, t, u, _ = build_arch(attach, UPPER_TEETH, upper=True, occlusal_y=upper_y, a=0.0275, b=0.0285, z_front=0.1452, joint_upper=head_joint, joint_lower=jaw_joint)
    for positions, tris, uv in zip(p, t, u, strict=True):
        parts.append((positions, tris, uv, head_joint))
    p, t, u, _ = build_arch(attach, LOWER_TEETH, upper=False, occlusal_y=lower_y, a=0.0245, b=0.0265, z_front=0.1448, joint_upper=head_joint, joint_lower=jaw_joint)
    for positions, tris, uv in zip(p, t, u, strict=True):
        parts.append((positions, tris, uv, jaw_joint))
    gum_up = gum_ribbon(attach, upper=True, occlusal_y=upper_y, tooth_height=0.0100, a=0.0275, b=0.0285, z_front=0.1452, half_arc=0.0385)
    gum_low = gum_ribbon(attach, upper=False, occlusal_y=lower_y, tooth_height=0.0086, a=0.0245, b=0.0265, z_front=0.1448, half_arc=0.0345)
    parts.append((gum_up[0], gum_up[1], gum_up[2], head_joint))
    parts.append((gum_low[0], gum_low[1], gum_low[2], jaw_joint))
    positions: list[np.ndarray] = []
    triangles: list[np.ndarray] = []
    uvs: list[np.ndarray] = []
    joint_ids: list[np.ndarray] = []
    offset = 0
    for pos, tri, uv, joint in parts:
        positions.append(pos)
        triangles.append(tri + offset)
        uvs.append(uv)
        joint_ids.append(np.full(len(pos), joint))
        offset += len(pos)
    pos_all = np.concatenate(positions)
    tri_all = np.concatenate(triangles)
    joints = np.zeros((len(pos_all), 4), dtype=np.uint8)
    joints[:, 0] = np.concatenate(joint_ids)
    weights = np.zeros((len(pos_all), 4), dtype=np.float32)
    weights[:, 0] = 1.0
    return ba.Prim(material="ts_teeth", positions=pos_all, triangles=tri_all, normals=vertex_normals(pos_all, tri_all), uv=np.concatenate(uvs).astype(np.float32), joints=joints, weights=weights)


def floor_height(attach: HeadAttach, x: float, z: float, y_from: float = 1.462) -> float:
    """구강 바닥(아래로 쏜 광선이 처음 닿는 안쪽 면)의 높이."""
    hits, triangle = attach.surface.ray(np.array([[x, y_from, z]]), np.array([[0.0, -1.0, 0.0]]), max_distance=0.1)
    if triangle[0] < 0:
        raise RuntimeError("구강 바닥을 찾지 못했습니다.")
    return float(hits[0, 1])


def tongue_prim(ctx: ba.Context, attach: HeadAttach, rings: int = 14, segments: int = 24) -> ba.Prim:
    """혀: 구강 바닥에 얹은 납작한 타원체. 바닥보다 2 mm 가라앉혀 놓아 바닥면 아래 반은 가려진다. TS_Jaw 100%."""
    jaw_joint = ctx.joint_index["TS_Jaw"]
    z_back, z_tip = 0.083, 0.1335
    center_z = (z_back + z_tip) / 2.0
    floor_y = floor_height(attach, 0.0, center_z)
    a_x, a_y, a_z = 0.0165, 0.0105, (z_tip - z_back) / 2.0
    top_target = 1.4585  # 혀 윗면이 입선(1.4653)보다 약 7 mm 아래
    center = np.array([0.0, top_target - a_y, center_z])
    del floor_y  # 바닥 높이는 광선으로 확인만 한다(혀 아랫반은 바닥면 아래에 묻혀 가려진다)
    thetas = np.linspace(0.0, np.pi, rings + 1)
    phis = np.linspace(0.0, 2.0 * np.pi, segments, endpoint=False)
    positions = [center + np.array([0.0, a_y, 0.0])]
    for theta in thetas[1:-1]:
        for phi in phis:
            positions.append(center + np.array([a_x * np.sin(theta) * np.cos(phi), a_y * np.cos(theta), a_z * np.sin(theta) * np.sin(phi)]))
    positions.append(center - np.array([0.0, a_y, 0.0]))
    positions_arr = np.array(positions)
    tris: list[list[int]] = []
    last = len(positions_arr) - 1
    for j in range(segments):
        tris.append([0, 1 + j, 1 + (j + 1) % segments])
    for i in range(rings - 2):
        base = 1 + i * segments
        nxt = base + segments
        for j in range(segments):
            a, b = base + j, base + (j + 1) % segments
            c, d = nxt + (j + 1) % segments, nxt + j
            tris.append([a, d, c])
            tris.append([a, c, b])
    base = 1 + (rings - 2) * segments
    for j in range(segments):
        tris.append([last, base + (j + 1) % segments, base + j])
    triangles = np.array(tris, dtype=np.int64)
    a_, b_, c_ = (positions_arr[triangles[:, k]] for k in range(3))
    outward = np.einsum("ij,ij->i", np.cross(b_ - a_, c_ - a_), (a_ + b_ + c_) / 3.0 - center)
    if (outward < 0).mean() > 0.5:
        triangles = triangles[:, [0, 2, 1]]
    u = np.clip(0.5 + (positions_arr[:, 0] - center[0]) / (2.0 * a_x * 1.02), 0.0, 1.0)
    v = np.clip((positions_arr[:, 2] - z_back) / (z_tip - z_back), 0.0, 1.0)
    joints = np.zeros((len(positions_arr), 4), dtype=np.uint8)
    joints[:, 0] = jaw_joint
    weights = np.zeros((len(positions_arr), 4), dtype=np.float32)
    weights[:, 0] = 1.0
    return ba.Prim(material="ts_tongue", positions=positions_arr, triangles=triangles, normals=vertex_normals(positions_arr, triangles), uv=np.stack([u, v], axis=1).astype(np.float32), joints=joints, weights=weights)


# ---------------------------------------------------------------- 눈 깜빡임(HBM 눈꺼풀 모델)

#: 닫힘선 위치: 열림 각도 중 아랫눈꺼풀이 올라오는 비율(윗눈꺼풀이 나머지를 내려온다)
BLINK_LOWER_SHARE = 0.15
#: 눈꺼풀 가장자리에서 멀어질수록 회전 비중이 부드럽게 줄어 바깥 거리(m)에서 0이 된다(윗눈꺼풀 15 mm 밖의 눈썹 뼈는 움직이지 않는다). 평평한 구간을 두면 피부가 한 장의 판으로 내려와 가장자리가 직사각형 커튼이 된다
BLINK_UPPER_REACH = (0.0, 0.015)
BLINK_LOWER_REACH = (0.0, 0.009)
#: 깜빡일 때 눈썹이 따라 내려오는 양(m)과 그 범위(윗눈꺼풀 가장자리로부터의 거리 m: 4 mm에서 켜져 12~22 mm 사이가 최대, 40 mm에서 0)
BLINK_BROW_DROP = 0.0020
BLINK_BROW_RISE = (0.004, 0.012)
BLINK_BROW_FALL = (0.022, 0.040)
BLINK_SAMPLES = 64
#: 움직임이 켜지는 눈초리 축 구간: 눈초리에서 전체 길이의 이 비율 안에서 부드럽게 0 → 1이 된다(눈초리 밖 피부는 움직이지 않고 윤곽이 둥글어진다)
BLINK_CORNER_WINDOW = (-0.05, 0.28)
#: 열림 각도 곡선을 편 격자 간격(m)과 가우시안 σ(m) — 눈초리 근처는 축에 가까워 각도가 불안정해 반지름 가중으로 편다
BLINK_GRID_STEP = 0.0005
BLINK_GRID_SIGMA = 0.002


@dataclass
class LidModel:
    """한쪽 눈꺼풀 모델. 눈꺼풀은 두 눈초리를 잇는 축(`axis`) 둘레로 회전한다.

    축 좌표 t(눈초리 안 → 밖, m)마다 윗·아랫 가장자리의 (각도 β, 축까지 반지름 ρ)를 격자로 편 곡선을 가진다. β는 축에 수직인 평면에서
    `forward`(앞) 방향에서 `up`(위) 쪽으로 잰 각이다. 눈 중심을 축으로 쓰면 눈초리가 안구의 옆(적도)에 있어 각이 불안정하고 눈초리 밖에서
    움직임이 절벽처럼 끊겼다."""

    side: str
    inner: np.ndarray
    axis: np.ndarray
    forward: np.ndarray
    up: np.ndarray
    length: float
    grid_t: np.ndarray
    upper_beta: np.ndarray
    upper_rho: np.ndarray
    lower_beta: np.ndarray
    lower_rho: np.ndarray
    upper_line: np.ndarray  # (K,3)
    lower_line: np.ndarray  # (K,3)


def _axis_coordinates(model_inner: np.ndarray, axis: np.ndarray, forward: np.ndarray, up: np.ndarray, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """점들의 축 좌표 (t, β, ρ)."""
    relative = points - model_inner
    t = relative @ axis
    radial = relative - t[:, None] * axis
    x1 = radial @ forward
    x2 = radial @ up
    return t, np.arctan2(x2, x1), np.hypot(x1, x2)


def _smoothed_curve(t: np.ndarray, beta: np.ndarray, rho: np.ndarray, grid: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """호 점들(t 순)의 β·ρ를 격자로 옮기고 반지름 가중 가우시안으로 편다."""
    order = np.argsort(t)
    t, beta, rho = t[order], beta[order], rho[order]
    beta_grid = np.interp(grid, t, beta)
    rho_grid = np.interp(grid, t, rho)
    weight = rho_grid + 1.0e-4
    radius = int(np.ceil(3.0 * BLINK_GRID_SIGMA / BLINK_GRID_STEP))
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) * BLINK_GRID_STEP / BLINK_GRID_SIGMA) ** 2)

    def smooth(values: np.ndarray, weights: np.ndarray) -> np.ndarray:
        padded_v = np.pad(values * weights, radius, mode="edge")
        padded_w = np.pad(weights, radius, mode="edge")
        numerator = np.convolve(padded_v, kernel, mode="valid")
        denominator = np.convolve(padded_w, kernel, mode="valid")
        return numerator / np.maximum(denominator, 1e-12)

    return smooth(beta_grid, weight), smooth(rho_grid, np.ones_like(rho_grid))


def lid_model(ctx: ba.Context, side: str) -> LidModel:
    """눈 구멍 안쪽 면과 바깥 피부가 공유하는 정점(눈꺼풀 가장자리 루프)에서 두 눈초리와 위·아래 호를 찾아 모델을 만든다."""
    lining = 2 if side == "L" else 3
    quads = ctx.quads
    face_set = ctx.body.face_set
    head_faces = np.flatnonzero(ctx.head_mask)
    inside = face_set[head_faces] == lining
    loop = np.intersect1d(np.unique(quads[head_faces[inside]].ravel()), np.unique(quads[head_faces[~inside]].ravel()))
    return lid_model_from_loop(ctx.t_pos[loop], ctx.body.eyes[side][0].mean(axis=0), side)


def lid_model_from_loop(points: np.ndarray, eye_center: np.ndarray, side: str) -> LidModel:
    """눈꺼풀 가장자리 루프 점들 (N,3)과 눈 중심으로 모델을 만든다(`lid_model`의 순수 함수 부분: HBM 데이터 없이 시험할 수 있다)."""
    sign = 1.0 if side == "L" else -1.0
    u = sign * (points[:, 0] - eye_center[0])
    inner_point, outer_point = points[int(np.argmin(u))], points[int(np.argmax(u))]
    axis = outer_point - inner_point
    length = float(np.linalg.norm(axis))
    axis = axis / length
    forward = np.array([0.0, 0.0, 1.0])
    forward = forward - (forward @ axis) * axis
    forward /= np.linalg.norm(forward)
    up = np.cross(forward, axis)
    up /= np.linalg.norm(up)
    if up[1] < 0:
        up = -up
    t, beta, rho = _axis_coordinates(inner_point, axis, forward, up, points)
    # 두 눈초리를 잇는 선보다 위(β > 0) = 윗호, 아래(β < 0) = 아랫호. 눈초리에 가까운 점(ρ < 0.6 mm)은 양쪽에 넣어 호가 눈초리에서 만나게 한다.
    upper = (beta > 0.0) | (rho < 0.0006)
    lower = (beta < 0.0) | (rho < 0.0006)
    grid = np.arange(0.0, length + 1e-9, BLINK_GRID_STEP)
    upper_beta, upper_rho = _smoothed_curve(t[upper], beta[upper], rho[upper], grid)
    lower_beta, lower_rho = _smoothed_curve(t[lower], beta[lower], rho[lower], grid)
    upper_line, _ = resample_polyline(smooth_polyline(points[upper][np.argsort(t[upper])], 2), BLINK_SAMPLES)
    lower_line, _ = resample_polyline(smooth_polyline(points[lower][np.argsort(t[lower])], 2), BLINK_SAMPLES)
    return LidModel(side, inner_point, axis, forward, up, length, grid, upper_beta, upper_rho, lower_beta, lower_rho, upper_line, lower_line)


def _distance_to_line(points: np.ndarray, line: np.ndarray, chunk: int = 4096) -> np.ndarray:
    """각 점에서 폴리라인 표본점까지의 최소 거리(m). 표본이 촘촘해(64) 선분 투영은 생략한다."""
    out = np.empty(len(points))
    for start in range(0, len(points), chunk):
        block = points[start : start + chunk]
        out[start : start + chunk] = np.sqrt(((block[:, None, :] - line[None, :, :]) ** 2).sum(axis=2).min(axis=1))
    return out


@dataclass
class LidState:
    """점들의 눈꺼풀 좌표: 축 좌표 (β, ρ), 두 가장자리 곡선 값, 창·열림·닫힘선과 두 눈꺼풀 무리의 가중치. 눈 morph들이 공유한다."""

    beta: np.ndarray
    rho: np.ndarray
    upper_beta: np.ndarray
    lower_beta: np.ndarray
    upper_rho: np.ndarray
    lower_rho: np.ndarray
    window: np.ndarray
    opening: np.ndarray  # 창을 곱한 열림각(rad)
    gap: np.ndarray  # 창 없는 열림각(rad)
    above: np.ndarray  # 1 = 닫힘선 위(윗눈꺼풀 쪽)
    d_upper: np.ndarray
    d_lower: np.ndarray
    w_upper: np.ndarray
    w_lower: np.ndarray


def lid_state(model: LidModel, points: np.ndarray) -> LidState:
    t, beta, rho = _axis_coordinates(model.inner, model.axis, model.forward, model.up, points)
    tc = np.clip(t, 0.0, model.length)
    upper_beta = np.interp(tc, model.grid_t, model.upper_beta)
    lower_beta = np.interp(tc, model.grid_t, model.lower_beta)
    upper_rho = np.interp(tc, model.grid_t, model.upper_rho)
    lower_rho = np.interp(tc, model.grid_t, model.lower_rho)
    along = t / model.length
    window = ba.smoothstep01(BLINK_CORNER_WINDOW[0], BLINK_CORNER_WINDOW[1], along) * ba.smoothstep01(BLINK_CORNER_WINDOW[0], BLINK_CORNER_WINDOW[1], 1.0 - along)
    gap = np.maximum(upper_beta - lower_beta, 0.0)
    closing = lower_beta + BLINK_LOWER_SHARE * gap
    above = ba.smoothstep01(closing - 0.05, closing + 0.05, beta)
    d_upper = _distance_to_line(points, model.upper_line)
    d_lower = _distance_to_line(points, model.lower_line)
    w_upper = above * (1.0 - ba.smoothstep01(*BLINK_UPPER_REACH, d_upper)) * window
    w_lower = (1.0 - above) * (1.0 - ba.smoothstep01(*BLINK_LOWER_REACH, d_lower)) * window
    return LidState(beta, rho, upper_beta, lower_beta, upper_rho, lower_rho, window, gap * window, gap, above, d_upper, d_lower, w_upper, w_lower)


def _rotate_about_axis(model: LidModel, state: LidState, turn: np.ndarray, new_rho: np.ndarray) -> np.ndarray:
    """눈초리 축 둘레로 각 `turn`만큼 돌리고 축 반지름을 `new_rho`로 바꾼 위치 변화."""
    radial_old = state.rho[:, None] * (np.cos(state.beta)[:, None] * model.forward + np.sin(state.beta)[:, None] * model.up)
    new_beta = state.beta + turn
    radial_new = new_rho[:, None] * (np.cos(new_beta)[:, None] * model.forward + np.sin(new_beta)[:, None] * model.up)
    return radial_new - radial_old


def _brow_height_weight(state: LidState) -> np.ndarray:
    """눈썹 높이(윗눈꺼풀 가장자리에서 12~22 mm 위)에서 최대, 가장자리에서는 0인 가중치(닫힘선 위쪽만)."""
    return state.above * ba.smoothstep01(*BLINK_BROW_RISE, state.d_upper) * (1.0 - ba.smoothstep01(*BLINK_BROW_FALL, state.d_upper))


def _closing_delta(model: LidModel, state: LidState, amount: float) -> np.ndarray:
    """닫힘의 `amount`(0~1) 만큼: 윗눈꺼풀은 아래로 `(1 - BLINK_LOWER_SHARE) × 열림각`, 아랫눈꺼풀은 위로 `BLINK_LOWER_SHARE × 열림각`, 두께 차는 반지름 방향으로."""
    turn = amount * (-(1.0 - BLINK_LOWER_SHARE) * state.gap * state.w_upper + BLINK_LOWER_SHARE * state.gap * state.w_lower)
    middle_rho = 0.5 * (state.upper_rho + state.lower_rho)
    new_rho = state.rho + amount * ((middle_rho - state.upper_rho) * state.w_upper + (middle_rho - state.lower_rho) * state.w_lower)
    return _rotate_about_axis(model, state, turn, new_rho)


def blink_delta(model: LidModel, points: np.ndarray) -> np.ndarray:
    """`facs:eyeBlink*` 한쪽 눈의 위치 델타 (N,3), 위치만의 함수라 이음매 정점과 속눈썹이 같은 값을 얻는다.

    윗눈꺼풀 가장자리 둘레(가장자리에서 `BLINK_UPPER_REACH[1]`까지 부드럽게 줄어든다)의 피부와 눈꺼풀 안쪽 면은 두 눈초리를 잇는 축 둘레로
    `(1 - BLINK_LOWER_SHARE) × 열림각`만큼 아래로, 아랫눈꺼풀은 `BLINK_LOWER_SHARE × 열림각`만큼 위로 회전한다. 두 가장자리의 축 반지름 차
    (눈꺼풀 두께)는 반지름 방향으로 맞춰 닫힌 가장자리가 한 곡선에서 만난다. 눈초리 밖(`BLINK_CORNER_WINDOW`)은 움직이지 않는다.
    눈썹 높이(가장자리에서 12~22 mm 위)에는 눈썹이 내려오는 `BLINK_BROW_DROP`만큼의 이동을 더한다(가장자리 자체에는 더하지 않는다)."""
    state = lid_state(model, points)
    delta = _closing_delta(model, state, 1.0)
    delta[:, 1] -= BLINK_BROW_DROP * _brow_height_weight(state) * np.clip(state.opening / 0.2, 0.0, 1.0)
    return delta


#: `facs:eyeWide`: 윗눈꺼풀이 위로 걷히는 각(rad, 눈초리 축 기준 약 18° = 가장자리가 2 mm 안팎 오른다)과 아랫눈꺼풀이 내려가는 각, 눈썹이 오르는 양(m)
WIDE_UPPER_TURN = 0.32
WIDE_LOWER_TURN = 0.05
WIDE_BROW_LIFT = 0.0015
#: `facs:eyeSquint`: 깜빡임 닫힘의 이 비율(윗눈꺼풀은 덜 내려오고 아랫눈꺼풀이 올라와 눈을 가늘게 뜬다)과 눈썹이 따라 내리는 비율
SQUINT_CLOSE_SHARE = 0.30


def wide_delta(model: LidModel, points: np.ndarray) -> np.ndarray:
    """`facs:eyeWide` 한쪽 눈: 윗눈꺼풀 무리를 `WIDE_UPPER_TURN`만큼 위로, 아랫눈꺼풀 무리를 `WIDE_LOWER_TURN`만큼 아래로 돌려 눈을 크게 뜬다.

    TS 필드는 눈 높이의 넓은 구를 통째로 올려 눈구멍이 안구에서 멀어지고 눈꺼풀 안쪽 면이 보이는 빈 눈구멍이 됐다."""
    state = lid_state(model, points)
    turn = WIDE_UPPER_TURN * state.w_upper * np.clip(state.gap / 0.2, 0.0, 1.0) - WIDE_LOWER_TURN * state.w_lower * np.clip(state.gap / 0.2, 0.0, 1.0)
    delta = _rotate_about_axis(model, state, turn, state.rho)
    delta[:, 1] += WIDE_BROW_LIFT * _brow_height_weight(state) * np.clip(state.opening / 0.2, 0.0, 1.0)
    return delta


def squint_delta(model: LidModel, points: np.ndarray) -> np.ndarray:
    """`facs:eyeSquint` 한쪽 눈: 깜빡임 닫힘의 `SQUINT_CLOSE_SHARE`(윗눈꺼풀은 조금 내려오고 아랫눈꺼풀이 올라온다)."""
    state = lid_state(model, points)
    delta = _closing_delta(model, state, SQUINT_CLOSE_SHARE)
    delta[:, 1] -= SQUINT_CLOSE_SHARE * BLINK_BROW_DROP * _brow_height_weight(state) * np.clip(state.opening / 0.2, 0.0, 1.0)
    return delta


#: 눈썹 morph(`browInnerUp`·`browOuterUp`·`browDown`)의 눈 보호: 윗눈꺼풀 가장자리에서 이 거리(m) 안은 줄이고 바깥은 그대로, 눈 중심 높이 아래는 움직이지 않는다
BROW_MARGIN_PROTECT = (0.004, 0.016)
BROW_BELOW_EYE_RANGE = (-0.002, 0.010)


def eye_protection_weight(models: dict[str, LidModel], points: np.ndarray) -> np.ndarray:
    """눈썹 계열 TS 필드에 곱하는 가중치(0~1): 눈꺼풀 가장자리(양쪽 눈)에서 멀수록, 눈 중심보다 높을수록 1.

    TS 눈썹 필드는 반경 0.22~0.3의 넓은 구라 눈구멍 전체와 아랫눈꺼풀·뺨까지 눈썹과 함께 올려 눈구멍이 안구에서 멀어졌다. 눈썹 높이는 그대로 두고
    눈꺼풀 가장자리 둘레와 눈 아래는 거의 움직이지 않게 한다(윗눈꺼풀의 올림·내림은 `eyeWide`·`eyeBlink`가 맡는다)."""
    d_upper = np.minimum.reduce([_distance_to_line(points, model.upper_line) for model in models.values()])
    center_y = float(np.mean([model.inner[1] for model in models.values()]))
    below = ba.smoothstep01(center_y + BROW_BELOW_EYE_RANGE[0], center_y + BROW_BELOW_EYE_RANGE[1], points[:, 1])
    return ba.smoothstep01(*BROW_MARGIN_PROTECT, d_upper) * below
