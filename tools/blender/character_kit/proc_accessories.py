"""절차 생성 소품(안경·귀걸이·초커) 원본 GLB를 베이스 좌표(T-포즈, m)로 만든다 (bpy venv 파이썬, numpy만 쓴다). license: original.

Hyper3D 생성물로는 가는 테·귀걸이가 안 나와(마네킹 조각이 붙거나 두꺼운 덩어리가 된다) 이 저장소가 직접 만든다. 지오메트리는 베이스의 눈·귀·목 위치에서 계산하므로
같은 코드가 두 베이스(미소녀·미소년)에 맞고, 결과 GLB는 일반 의상 원본과 같은 입력 형식이다: 한 메시, UV, 흰 텍스처 한 장. 이후 `retarget_garment`가 `align="none"`(변환 없음)으로
머리 표면에 결합해 스킨·morph를 붙이고 파츠 GLB로 쓴다.

사용::

    <venv>/bin/python -I tools/blender/character_kit/proc_accessories.py -- \\
        --base-model ~/.cache/toonstudio-kit/out4/base_model_female.npz --name glasses|earrings|choker --out <원본.glb>

설계(모두 m)
- `glasses`: 눈마다 둥근 사각 테(가로 53 × 세로 43 mm, 굵기 1.3 mm)를 각막 앞 11 mm에, 콧날 위 브리지, 귀 윗부분에 걸치는 다리(2차 베지어).
- `earrings`: 귓볼 아래에 스터드 구슬 + 짧은 사슬 + 작은 구슬(드롭형).
- `choker`: 턱 바닥에서 6 cm 위 목 둘레를 따르는 폭 9 mm 띠와 앞쪽 작은 원판 장식. 띠 반지름은 목 축에서 사방으로 쏜 수평 광선의 첫 표면 거리(+0.6~3 mm)다.

초커는 목 기둥이 있어야 얹을 수 있다. 사실 비례의 HBM 베이스는 턱이 목 앞을 덮고 목이 어깨 판과 바로 이어져 목을 감싼 수평 둘레가 없었다(y 1.335~1.365 m 단면은 어깨 판의 윗면). 그래서
`webtoon_style`의 `neck_lift`로 머리·목 위쪽을 2.6~2.8 cm 들어 올려 자유로운 목 기둥(y 1.40~1.44 m, 반지름 4.5~6.8 cm)을 만들었고, 이 소품은 그 기둥에 맞춘다.
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path
from typing import Any

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

Mesh = tuple[np.ndarray, np.ndarray]  # (positions (N,3), triangles (M,3))


def merge(meshes: list[Mesh]) -> Mesh:
    offset = 0
    positions, triangles = [], []
    for p, t in meshes:
        positions.append(p)
        triangles.append(t + offset)
        offset += len(p)
    return np.concatenate(positions), np.concatenate(triangles)


def tube(path: np.ndarray, radius: float | np.ndarray, segments: int = 8, closed: bool = False) -> Mesh:
    """경로를 따르는 관(평행 이동 프레임). 열린 경로의 양 끝은 삼각형으로 막는다."""
    path = np.asarray(path, dtype=np.float64)
    count = len(path)
    tangent = np.gradient(path, axis=0)
    if closed:
        tangent = np.roll(path, -1, axis=0) - np.roll(path, 1, axis=0)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-12)
    helper = np.array([0.0, 1.0, 0.0]) if abs(tangent[0] @ np.array([0.0, 1.0, 0.0])) < 0.9 else np.array([1.0, 0.0, 0.0])
    normal = np.cross(tangent[0], helper)
    normal /= np.linalg.norm(normal)
    radii = np.full(count, radius, dtype=np.float64) if np.ndim(radius) == 0 else np.asarray(radius, dtype=np.float64)
    rings = []
    for i in range(count):
        if i > 0:  # 평행 이동: 이전 법선을 새 접선에 수직으로 투영
            normal = normal - (normal @ tangent[i]) * tangent[i]
            normal /= max(np.linalg.norm(normal), 1e-12)
        binormal = np.cross(tangent[i], normal)
        angles = np.linspace(0.0, 2.0 * np.pi, segments, endpoint=False)
        rings.append(path[i] + radii[i] * (np.outer(np.cos(angles), normal) + np.outer(np.sin(angles), binormal)))
    positions = np.concatenate(rings)
    triangles = []
    span = count if closed else count - 1
    for i in range(span):
        j = (i + 1) % count
        for k in range(segments):
            a, b = i * segments + k, i * segments + (k + 1) % segments
            c, d = j * segments + k, j * segments + (k + 1) % segments
            triangles += [[a, b, d], [a, d, c]]
    if not closed:
        for ring_index, flip in ((0, True), (count - 1, False)):
            center = len(positions)
            positions = np.vstack([positions, path[ring_index]])
            for k in range(segments):
                a, b = ring_index * segments + k, ring_index * segments + (k + 1) % segments
                triangles.append([center, b, a] if flip else [center, a, b])
    return positions, np.array(triangles, dtype=np.int64)


def sphere(center: np.ndarray, radius: float, rings: int = 8, segments: int = 12) -> Mesh:
    positions = [center + np.array([0.0, radius, 0.0])]
    for r in range(1, rings):
        theta = np.pi * r / rings
        for s in range(segments):
            phi = 2.0 * np.pi * s / segments
            positions.append(center + radius * np.array([np.sin(theta) * np.cos(phi), np.cos(theta), np.sin(theta) * np.sin(phi)]))
    positions.append(center - np.array([0.0, radius, 0.0]))
    triangles = [[0, 1 + (s + 1) % segments, 1 + s] for s in range(segments)]
    for r in range(rings - 2):
        base = 1 + r * segments
        for s in range(segments):
            a, b = base + s, base + (s + 1) % segments
            c, d = a + segments, b + segments
            triangles += [[a, b, c], [b, d, c]]
    last = len(positions) - 1
    base = 1 + (rings - 2) * segments
    triangles += [[last, base + s, base + (s + 1) % segments] for s in range(segments)]
    return np.array(positions), np.array(triangles, dtype=np.int64)


def superellipse(center: np.ndarray, rx: float, ry: float, power: float = 2.8, count: int = 48) -> np.ndarray:
    """둥근 사각형 윤곽(렌즈 테). xy 평면, 닫힌 경로."""
    angles = np.linspace(0.0, 2.0 * np.pi, count, endpoint=False)
    c, s = np.cos(angles), np.sin(angles)
    x = rx * np.sign(c) * np.abs(c) ** (2.0 / power)
    y = ry * np.sign(s) * np.abs(s) ** (2.0 / power)
    return center + np.stack([x, y, np.zeros(count)], axis=1)


def bezier(p0: np.ndarray, p1: np.ndarray, p2: np.ndarray, count: int = 16) -> np.ndarray:
    t = np.linspace(0.0, 1.0, count)[:, None]
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t**2 * p2


class Landmarks:
    """베이스 npz에서 읽은 눈·귀 위치(T-포즈, m)와 목 둘레를 재는 몸+머리 표면."""

    def __init__(self, base: Any) -> None:
        head = base.mesh("head_")["tpose_positions"].astype(np.float64)
        self.eyes: dict[str, dict[str, Any]] = {}
        for side in ("L", "R"):
            points = base.arrays[f"mesh/TS_Eye_{side}/0/tpose_positions"].astype(np.float64)
            self.eyes[side] = {"center": points.mean(axis=0), "front_z": float(points[:, 2].max())}
        ear = head[np.abs(head[:, 0]) > 0.070]
        self.ear: dict[str, dict[str, Any]] = {}
        for side, sign in (("L", 1.0), ("R", -1.0)):
            e = ear[np.sign(ear[:, 0]) == sign]
            self.ear[side] = {"top": e[np.argmax(e[:, 1])], "bottom": e[np.argmin(e[:, 1])], "outer_x": float(np.abs(e[:, 0]).max()) * sign, "mean_z": float(e[:, 2].mean())}
        self.chin_y = float(head[:, 1].min())
        self._base = base
        self._surface = None

    def surface(self):
        """몸+머리 T-포즈 표면(UV 이음매로 갈라진 정점을 합쳐 광선이 틈으로 새지 않게 한다). 처음 부를 때 만든다."""
        if self._surface is None:
            from character_kit.garment_fit import weld_vertices
            from character_kit.retarget_garment import build_body_surface
            from character_kit.surface import Surface

            bs = build_body_surface(self._base, [])
            canon_index, canon_positions = weld_vertices(bs.tpose)
            self._surface = Surface(canon_positions, canon_index[bs.triangles])
        return self._surface

    def neck_ring(self, y0: float, count: int = 48) -> tuple[np.ndarray, float]:
        """높이 y0의 목 둘레 반지름(축에서 사방으로 쏜 수평 광선의 첫 표면 거리)과 목 축 z. 정면(+z)이 각도 0이다.
        축은 앞·뒤 광선 거리의 중점으로 여섯 번 고친다. 광선이 빗나가는 높이(턱·어깨 판에 걸친 곳)면 ValueError."""
        surface = self.surface()

        def cast(center: float, angles: np.ndarray) -> np.ndarray:
            origins = np.tile(np.array([0.0, y0, center]), (len(angles), 1))
            directions = np.stack([np.sin(angles), np.zeros(len(angles)), np.cos(angles)], axis=1)
            hits, triangle = surface.ray(origins, directions, 0.2)
            return np.where(triangle >= 0, np.linalg.norm(hits - origins, axis=1), np.nan)

        cz = 0.005
        for _ in range(6):
            front, back = cast(cz, np.array([0.0, np.pi]))
            if np.isnan(front) or np.isnan(back):
                raise ValueError(f"y={y0:.3f}에서 목 축을 찾지 못했다")
            cz = 0.5 * ((cz + front) + (cz - back))
        radius = cast(cz, np.linspace(0.0, 2.0 * np.pi, count, endpoint=False))
        if np.isnan(radius).any():
            raise ValueError(f"y={y0:.3f}의 목 둘레에 광선이 빗나간 방향이 있다")
        return radius, cz


def disc(center: np.ndarray, radius: float, thickness: float, segments: int = 20) -> Mesh:
    """+z를 바라보는 얇은 원판(앞면·뒷면·옆면)."""
    angles = np.linspace(0.0, 2.0 * np.pi, segments, endpoint=False)
    ring = np.stack([radius * np.cos(angles), radius * np.sin(angles), np.zeros(segments)], axis=1)
    front = center + ring + np.array([0.0, 0.0, thickness / 2])
    back = center + ring - np.array([0.0, 0.0, thickness / 2])
    positions = np.vstack([front, back, center + np.array([0, 0, thickness / 2]), center - np.array([0, 0, thickness / 2])])
    f_center, b_center = 2 * segments, 2 * segments + 1
    triangles = []
    for k in range(segments):
        n = (k + 1) % segments
        triangles += [[f_center, k, n], [b_center, segments + n, segments + k], [k, segments + k, segments + n], [k, segments + n, n]]
    return positions, np.array(triangles, dtype=np.int64)


def build_glasses(lm: Landmarks) -> Mesh:
    meshes: list[Mesh] = []
    rim_radius, temple_radius = 0.0013, 0.0016
    z = max(lm.eyes["L"]["front_z"], lm.eyes["R"]["front_z"]) + 0.011
    inner_edges, outer_edges = [], []
    for side, sign in (("L", 1.0), ("R", -1.0)):
        eye = lm.eyes[side]["center"]
        center = np.array([eye[0], eye[1] - 0.001, z])
        rim = superellipse(center, 0.0265, 0.0215)
        meshes.append(tube(rim, rim_radius, segments=8, closed=True))
        inner_edges.append(np.array([eye[0] - sign * 0.0265, eye[1] + 0.004, z]))
        outer_edges.append(np.array([eye[0] + sign * 0.0265, eye[1] + 0.006, z]))
        ear = lm.ear[side]
        end = np.array([ear["outer_x"] - sign * 0.002, ear["top"][1] - 0.004, ear["mean_z"]])
        control = np.array([end[0], eye[1] + 0.006, z - 0.05])
        meshes.append(tube(bezier(outer_edges[-1], control, end), temple_radius, segments=6))
    bridge_mid = 0.5 * (inner_edges[0] + inner_edges[1]) + np.array([0.0, 0.003, 0.006])
    meshes.append(tube(bezier(inner_edges[0], bridge_mid, inner_edges[1], 12), rim_radius, segments=6))
    return merge(meshes)


def build_earrings(lm: Landmarks) -> Mesh:
    meshes: list[Mesh] = []
    for side, sign in (("L", 1.0), ("R", -1.0)):
        ear = lm.ear[side]
        lobe = ear["bottom"] + np.array([sign * 0.0015, 0.0006, 0.0])
        meshes.append(sphere(lobe, 0.0028))
        chain = np.stack([lobe + np.array([0.0, -0.0025 - 0.0015 * k, 0.0]) for k in range(8)])
        meshes.append(tube(chain, 0.00065, segments=6))
        meshes.append(sphere(chain[-1] + np.array([0.0, -0.0042, 0.0]), 0.0042))
    return merge(meshes)


CHOKER_ABOVE_CHIN_M = 0.060  # 턱 바닥에서 띠 중심까지(자유로운 목 기둥의 아랫부분)


def build_choker(lm: Landmarks) -> Mesh:
    y0 = lm.chin_y + CHOKER_ABOVE_CHIN_M
    radius, cz = lm.neck_ring(y0)
    count = len(radius)
    angles = np.linspace(0.0, 2.0 * np.pi, count, endpoint=False)
    # 이웃 3점 이동 평균으로 광선 잡음만 누른다(표면보다 안쪽으로 파고들지 않게 평균이 아니라 이웃 최댓값과 평균의 중간을 쓴다)
    padded = np.concatenate([radius[-1:], radius, radius[:1]])
    neighbours = np.maximum.reduce([padded[:-2], padded[1:-1], padded[2:]])
    radius = 0.5 * (radius + neighbours)
    half_height = 0.0045
    inner = radius + 0.0006
    outer = radius + 0.0030
    rings = []
    for y_off, r_arr in ((half_height, inner), (half_height, outer), (-half_height, outer), (-half_height, inner)):
        rings.append(np.stack([r_arr * np.sin(angles), np.full(count, y0 + y_off), cz + r_arr * np.cos(angles)], axis=1))
    positions = np.concatenate(rings)
    triangles = []
    for ring in range(4):
        nxt = (ring + 1) % 4
        for i in range(count):
            j = (i + 1) % count
            a, b = ring * count + i, ring * count + j
            c, d = nxt * count + i, nxt * count + j
            triangles += [[a, b, d], [a, d, c]]
    band = (positions, np.array(triangles, dtype=np.int64))
    pendant = disc(np.array([0.0, y0 - 0.0105, cz + radius[0] + 0.0042]), 0.0058, 0.0016)
    return merge([band, pendant])


BUILDERS = {"glasses": build_glasses, "earrings": build_earrings, "choker": build_choker}


def orient_outward(mesh: Mesh) -> Mesh:
    """연결된 조각마다 부호 있는 부피가 양수가 되도록 삼각형 감김을 맞춘다(안쪽이 바깥을 향한 조각은 뒷면 컬링에서 사라진다)."""
    positions, triangles = mesh
    parent = list(range(len(positions)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b, c in triangles:
        parent[find(int(b))] = find(int(a))
        parent[find(int(c))] = find(int(a))
    root = np.array([find(int(i)) for i in triangles[:, 0]])
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    volume = np.einsum("ij,ij->i", a, np.cross(b, c)) / 6.0
    flipped = triangles.copy()
    for r in np.unique(root):
        members = root == r
        if volume[members].sum() < 0:
            flipped[members] = triangles[members][:, [0, 2, 1]]
    return positions, flipped


def write_source(mesh: Mesh, path: Path, name: str) -> None:
    from PIL import Image

    from character_kit.glbwriter import GlbWriter, Primitive
    from character_kit.surface import vertex_normals

    positions, triangles = orient_outward(mesh)
    normals = vertex_normals(positions, triangles)
    writer = GlbWriter(generator="toonstudio character_kit proc_accessories")
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), (245, 245, 245)).save(buffer, format="JPEG", quality=92)
    texture = writer.add_texture(buffer.getvalue(), "image/jpeg", name=f"{name}_basecolor")
    material = writer.add_material(f"proc_{name}", base_color_texture=texture, base_color_factor=(1.0, 1.0, 1.0, 1.0), double_sided=True, metallic=0.0, roughness=0.6)
    uvs = np.full((len(positions), 2), 0.5, dtype=np.float32)
    writer.add_mesh_node(name, [Primitive(positions=positions.astype(np.float32), indices=triangles.astype(np.uint32), normals=normals.astype(np.float32), uvs=uvs, material=material)], skinned=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    writer.write(str(path))


def main() -> int:
    from character_kit import base_assembly as ba

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--name", choices=sorted(BUILDERS), required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:])
    base = ba.load_base_model(args.base_model)
    mesh = BUILDERS[args.name](Landmarks(base))
    write_source(mesh, Path(args.out), args.name)
    print(f"{args.name}: 정점 {len(mesh[0])}, 삼각형 {len(mesh[1])} → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
