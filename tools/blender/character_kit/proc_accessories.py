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
- `choker`: 목 밑동(머리 메시 맨 아래)에서 7 cm 위 목 둘레를 따르는 폭 9 mm 띠와 앞쪽 작은 원판 장식. 띠 반지름은 목 축에서 사방으로 쏜 수평 광선의 첫 표면 거리(+0.6~3 mm)다.

초커는 목 기둥이 있어야 얹을 수 있다. 사실 비례의 HBM 베이스는 턱이 목 앞을 덮고 목이 어깨 판과 바로 이어져 목을 감싼 수평 둘레가 없었다(y 1.335~1.365 m 단면은 어깨 판의 윗면). 그래서
`webtoon_style`의 `neck_lift`로 머리·목 위쪽을 2.6~2.8 cm 들어 올려 자유로운 목 기둥(y 1.40~1.44 m, 반지름 4.5~6.8 cm)을 만들었고, 이 소품은 그 기둥에 맞춘다.
"""

from __future__ import annotations

import argparse
import io
import math
import sys
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Callable

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
        self.eye_y = float(0.5 * (self.eyes["L"]["center"][1] + self.eyes["R"]["center"][1]))
        self._base = base
        self._surface = None
        self._head_shell: HeadShell | None = None

    @property
    def base(self) -> Any:
        return self._base

    def head_shell(self) -> "HeadShell":
        """두개골 둘레 반지름 장(forge 모자·리본·헤드폰). 처음 부를 때 만든다."""
        if self._head_shell is None:
            self._head_shell = HeadShell(self._base, self.eye_y)
        return self._head_shell

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


CHOKER_ABOVE_CHIN_M = 0.070  # 머리 메시 맨 아래(목 밑동)에서 띠 중심까지: 목 기둥의 윗부분(턱 밑 약 2.5 cm). 후디 후드 접힘 윗면(≈ 1.41 m) 위에 놓인다


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


# ============================================================================ forge 소품 (2026-10-23)
#
# 사용자 지시: "의상 변경 등 모든 기능이 어설프다, 디테일하게 고도화하라", "만든 캐릭터들은 의상이나 헤어 등등 최대한 커스텀 가능하도록 … 다양하게".
# Hyper3D 파생 소품(리본·캡·헤드폰)이 키트에서 빠져(2026-10-14/15) 이 저장소가 원본으로 다시 만든다(license: original, 외부 에셋·생성 AI 없음).
# 같은 틀로 앵커별 소품을 넓혀 동시에 여러 개 착용하는 확장 제안(재질 역할 `accessory`·`accessory-accent`, 형상 키 `shape:<이름>:±`)을 낸다.
#
# - 지오메트리는 베이스의 눈·귀·목·손목·허리·다리 정점에서 계산한다(같은 코드가 두 베이스에 맞는다).
# - 결합(스킨·morph)·상대색 텍스처·GLB 쓰기·계측은 `forge_shoes`의 도구를 같이 쓰고, 진입은 `forge_build_shoes.py build --only accessory/<이름>`이다.
# - 위의 `build_glasses`·`build_earrings`·`build_choker`와 이 파일 CLI의 산출물은 바꾸지 않는다(확장판은 같은 함수를 불러 역할만 나눈다).
# - 머리에 쓰는 소품(모자·리본·헤드폰)은 맨머리가 아니라 머리카락 부피만큼 띄운 껍질 위에 만든다. 2026-10-23 forge 헤어 7종(여성, iter12)을 재 보니
#   정수리 위 머리카락 두께가 17~23 mm, 옆 9~25 mm였다(`HAIR_*` 상수). 맨머리·짧은 머리는 형상 키 `shape:fit:-`로 줄인다.

ACC_BODY = "accessory"
ACC_ACCENT = "accessory-accent"
ACC_ROLES = (ACC_BODY, ACC_ACCENT)
HEAD_JOINT = "mixamorig:Head"
#: 계약 `KIT_MORPH_COVERAGE`가 소품(accessory 역할)에 요구하는 morph 8개
ACC_REQUIRED_MORPHS = ("param:height:+", "param:height:-", "param:legLength:+", "param:legLength:-", "param:neckLength:+", "param:neckLength:-", "param:headSize:+", "param:headSize:-")
#: 소품을 이 값(m)보다 적게 움직이는 morph는 넣지 않는다(필수 8개는 예외 — 0이면 `ensure_min_delta` 바닥만 들어간다)
ACC_MORPH_KEEP_M = 0.0003
#: forge 헤어(여성 7종, 2026-10-23 iter12) 실측: 두피 위 머리카락 바깥 껍질까지의 높이(LOD0 정점 전부, 고도 10° × 방위 30° 칸의 최댓값)에
#: 여유 1.5~2 mm를 더한 표(m). 행 = 머리 중심 기준 고도(도), 열 = 앞·옆·뒤. 포니테일·트윈테일 꼬리(60~200 mm)와 울프컷 옆(25~35 mm)은 넣지 않았다
#: — 그 헤어는 모자와 충돌 규칙(`conflicts`) 또는 형상 키(`shape:fit:+`)로 다룬다.
HAIR_ENVELOPE_ELEV_DEG = (-40.0, -10.0, 10.0, 30.0, 50.0, 70.0, 90.0)
HAIR_ENVELOPE_M = (
    (0.014, 0.026, 0.024),
    (0.014, 0.0265, 0.0245),
    (0.0225, 0.0275, 0.0245),
    (0.0225, 0.0265, 0.0235),
    (0.021, 0.022, 0.022),
    (0.0175, 0.0175, 0.0175),
    (0.0175, 0.0175, 0.0175),
)
HAIR_CROWN_M = 0.0175
#: 소품 아틀라스의 단색 칸(24 px) 시작점 — 각 소품 레이아웃은 이 아래쪽 띠(y ≥ 896)를 쓰지 않는다
ACC_PATCH_ORIGIN = (0, 896)
ACC_PATCH_CELL = 24


def acc_patch(index: int) -> Any:
    from character_kit import forge_shoes as fs

    per_row = 1024 // ACC_PATCH_CELL
    row, col = divmod(index, per_row)
    return fs.Rect(ACC_PATCH_ORIGIN[0] + col * ACC_PATCH_CELL, ACC_PATCH_ORIGIN[1] + row * ACC_PATCH_CELL, ACC_PATCH_CELL, ACC_PATCH_CELL)


def acc_patch_uv(index: int, count: int) -> np.ndarray:
    return np.tile(acc_patch(index).uv(0.5, 0.5), (count, 1))


def sphere_dir(elev: Any, azim: Any) -> np.ndarray:
    """고도(rad, 위 +)·방위(rad, 0 = 정면 +z, +π/2 = 캐릭터 왼쪽 +x) → 단위 방향(…, 3)."""
    e, a = np.broadcast_arrays(np.asarray(elev, dtype=np.float64), np.asarray(azim, dtype=np.float64))
    return np.stack([np.cos(e) * np.sin(a), np.sin(e), np.cos(e) * np.cos(a)], axis=-1)


def smooth01(lo: float, hi: float, x: Any) -> np.ndarray:
    t = np.clip((np.asarray(x, dtype=np.float64) - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _fill_nan_periodic(table: np.ndarray) -> np.ndarray:
    """(고도, 방위) 표의 빈 칸(광선이 눈구멍·목 아래로 빠진 방향)을 이웃 평균으로 메운다(방위는 고리)."""
    out = table.copy()
    for _ in range(400):
        holes = np.isnan(out)
        if not holes.any():
            break
        neighbours = []
        for de, da in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.roll(out, da, axis=1)
            if de:
                shifted = np.roll(shifted, de, axis=0)
                shifted[0 if de > 0 else -1] = np.nan
            neighbours.append(shifted)
        values = np.stack(neighbours)
        valid = ~np.isnan(values)
        count = valid.sum(axis=0)
        mean = np.where(count > 0, np.where(valid, values, 0.0).sum(axis=0) / np.maximum(count, 1), np.nan)
        out[holes] = mean[holes]
    return out


def _smooth_periodic(table: np.ndarray, iterations: int, alpha: float = 0.5) -> np.ndarray:
    """고도축 끝은 복사 경계, 방위축은 고리인 라플라시안 평활."""
    out = table.copy()
    for _ in range(iterations):
        up = np.vstack([out[1:], out[-1:]])
        down = np.vstack([out[:1], out[:-1]])
        out = out + alpha * ((up + down + np.roll(out, 1, axis=1) + np.roll(out, -1, axis=1)) / 4.0 - out)
    return out


class HeadShell:
    """머리 중심(눈 위 두피 정점에 맞춘 구의 중심)에서 방향마다 쏜 광선이 머리 표면(T-포즈)에 닿는 거리 r(고도, 방위) 표.

    모자·리본·헤드폰은 이 표(평활)에 머리카락 여유를 더한 껍질 위에 만든다. 머리 메시는 눈구멍·목 아래가 열려 있어 그 방향은 이웃 값으로 메운다."""

    STEP_DEG = 2.0
    ELEV_MIN_DEG = -60.0
    AZIM_COUNT = 180

    def __init__(self, base: Any, eye_y: float) -> None:
        from character_kit.surface import Surface

        head = base.mesh("head_")
        positions = head["tpose_positions"].astype(np.float64)
        triangles = head["triangles"].astype(np.int64)
        cranium = positions[(positions[:, 1] > eye_y + 0.012) & (np.abs(positions[:, 0]) < 0.075)]
        lhs = np.hstack([2.0 * cranium, np.ones((len(cranium), 1))])
        sol, *_ = np.linalg.lstsq(lhs, (cranium**2).sum(axis=1), rcond=None)
        center = sol[:3].copy()
        self.sphere_radius = float(np.sqrt(sol[3] + center @ center))
        center[0] = 0.0  # 좌우 대칭
        self.center = center
        self.eye_y = eye_y
        self.surface = Surface(positions, triangles)
        self.elev = np.radians(np.arange(self.ELEV_MIN_DEG, 90.0 + 1e-9, self.STEP_DEG))
        self.azim = np.linspace(0.0, 2.0 * np.pi, self.AZIM_COUNT, endpoint=False)
        dirs = sphere_dir(self.elev[:, None], self.azim[None, :]).reshape(-1, 3)
        hits, tri = self.surface.ray(np.tile(center, (len(dirs), 1)), dirs, 0.3)
        r = np.where(tri >= 0, np.linalg.norm(hits - center, axis=1), np.nan).reshape(len(self.elev), len(self.azim))
        r[-1, :] = np.nanmean(r[-1, :])  # 고도 90°는 한 점
        self.table = _fill_nan_periodic(r)
        self.smooth_table = _smooth_periodic(self.table, 24)

    def radius(self, elev: Any, azim: Any, table: np.ndarray | None = None) -> np.ndarray:
        """쌍선형 보간 r(고도, 방위)(m). 기본은 평활한 표다."""
        t = self.smooth_table if table is None else table
        e = np.clip((np.asarray(elev, dtype=np.float64) - self.elev[0]) / math.radians(self.STEP_DEG), 0.0, len(self.elev) - 1.000001)
        a = np.mod(np.asarray(azim, dtype=np.float64), 2.0 * np.pi) / (2.0 * np.pi) * self.AZIM_COUNT
        e, a = np.broadcast_arrays(e, a)
        i0 = np.floor(e).astype(int)
        fe = e - i0
        i1 = np.minimum(i0 + 1, len(self.elev) - 1)
        j0 = np.floor(a).astype(int) % self.AZIM_COUNT
        fa = a - np.floor(a)
        j1 = (j0 + 1) % self.AZIM_COUNT
        return (1 - fe) * ((1 - fa) * t[i0, j0] + fa * t[i0, j1]) + fe * ((1 - fa) * t[i1, j0] + fa * t[i1, j1])

    def point(self, elev: Any, azim: Any, offset: Any = 0.0) -> np.ndarray:
        return self.center + sphere_dir(elev, azim) * (self.radius(elev, azim) + np.asarray(offset, dtype=np.float64))[..., None]

    def direction_of(self, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """점 → (고도, 방위, 중심 거리)."""
        d = np.asarray(points, dtype=np.float64) - self.center
        dist = np.linalg.norm(d, axis=-1)
        elev = np.arcsin(np.clip(d[..., 1] / np.maximum(dist, 1e-12), -1.0, 1.0))
        azim = np.mod(np.arctan2(d[..., 0], d[..., 2]), 2.0 * np.pi)
        return elev, azim, dist

    def grid(self) -> tuple[np.ndarray, np.ndarray]:
        """표와 같은 꼴(고도 × 방위)의 고도·방위 격자(rad)."""
        return np.meshgrid(self.elev, self.azim, indexing="ij")

    def envelope(self, required: np.ndarray, iterations: int = 60) -> np.ndarray:
        """`required`(고도 × 방위 반지름 표) 위로만 올라가는 매끈한 껍질: 평활과 `max(·, required)`를 번갈아 한다(머리카락에 밀려 부푼 막).

        두피 표 자체를 평활하면 볼록한 정수리가 깎여 여유가 줄어든다(2026-10-23 첫 캡 렌더에서 머리카락이 뚫고 나왔다). 이 껍질은 어디서도 `required`보다 안쪽이 아니다."""
        rho = required.copy()
        for _ in range(iterations):
            rho = np.maximum(_smooth_periodic(rho, 1, 0.5), required)
        return rho


def hair_allowance(elev: Any, azim: Any, scale: float = 1.0) -> np.ndarray:
    """머리카락 부피 여유(m): `HAIR_ENVELOPE_M` 표를 고도로 보간하고 앞·옆·뒤를 방위(cos² 가중)로 섞는다. `scale`은 전체 배율."""
    a = np.asarray(azim, dtype=np.float64)
    e = np.degrees(np.asarray(elev, dtype=np.float64))
    table = np.asarray(HAIR_ENVELOPE_M)
    rows = np.asarray(HAIR_ENVELOPE_ELEV_DEG)
    front, side, back = (np.interp(e, rows, table[:, k]) for k in range(3))
    cos = np.cos(a)
    wf, wb, ws = np.maximum(cos, 0.0) ** 2, np.maximum(-cos, 0.0) ** 2, np.sin(a) ** 2
    return scale * (wf * front + ws * side + wb * back) / (wf + ws + wb)


# ---------------------------------------------------------------- 소품 정의·조각


@dataclass
class AccPart:
    """소품 조각 하나: 재질 역할, 결합 방식, 조각(`forge_shoes.Piece`).

    `bind`: `rigid:<joint>`(그 joint 100 % + morph마다 `support` 정점 델타에 맞춘 아핀 — 단단한 물체), `nearest`(최근접 몸 정점 스킨 + 표면 델타 —
    손가락·발처럼 굽는 곳을 감싸는 천), `surface`(법선 호환 스킨 + 표면 델타). `support`: `cranium`(눈 위 머리), `head`(머리 전체), `local`(조각 둘레),
    `region:<영역,…>`(rigid 지지 정점 또는 nearest·surface 후보 영역)."""

    role: str
    bind: str
    piece: Any
    support: str = "cranium"
    group: str = ""  # 같은 결합·지지라도 따로 맞출 묶음(좌우 귀걸이처럼 거울 대칭으로 움직이는 것)


@dataclass
class AccessoryBuild:
    parts: list[AccPart]
    info: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AccessoryDefinition:
    name: str
    build: Callable[["Landmarks", Any], AccessoryBuild]
    params: Any
    shape_variants: Callable[[Any], dict[str, Any]]
    bake: Callable[[Any, AccessoryBuild], None]
    anchors: tuple[str, ...]
    layer: str
    changes_ko: str
    shapes_ko: dict[str, str] = field(default_factory=dict)
    conflicts: tuple[str, ...] = ()
    stacking: tuple[dict[str, Any], ...] = ()
    vocabulary: bool = False  # 계약 프리셋 어휘 안
    make_v1: bool = True  # v1 파츠도 만든다(기존 키트에 v1이 이미 있는 안경·귀걸이·초커는 확장판만 낸다)
    morph_groups: tuple[str, ...] = ("body", "head")  # 후보 morph: body(체형 18) · head(얼굴 param) · facs
    regions: tuple[str, ...] = ("head",)  # 간격·관통을 잴 몸 영역
    hide_regions: tuple[str, ...] = ()  # 덮으면 숨길 후보 영역(덮인 비율 98.5 % 이상일 때 hides)
    mesh_role: str = "accessory"  # 키트 v2 메시 역할: accessory | hair-accessory(머리끈·핀 — 노드 TS_HairAccessory_<이름>, 채널 hair-accessory·hair-accessory-accent)


ACCESSORY_DEFINITIONS: dict[str, AccessoryDefinition] = {}


def register_accessory(definition: AccessoryDefinition) -> None:
    ACCESSORY_DEFINITIONS[definition.name] = definition


def _orient_by(positions: np.ndarray, triangles: np.ndarray, vertex_dirs: np.ndarray) -> np.ndarray:
    """일관되게 감긴 격자·띠 삼각형 전체를 한 번에 뒤집을지 정한다: 면 법선과 꼭짓점 방향(`vertex_dirs`) 합의 내적을 면적 가중 다수결.

    삼각형마다 따로 고치면 방향 추정이 틀린 곳(굽은 챙 뿌리 쪽 옆면 등)에서 이웃과 감김이 어긋난다(2026-10-23 챙 옆면에서 실제로 났다)."""
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    face = np.cross(b - a, c - a)
    want = vertex_dirs[triangles].sum(axis=1)
    return triangles if float(np.einsum("ij,ij->i", face, want).sum()) >= 0.0 else triangles[:, [0, 2, 1]]


def dome_piece(name: str, rings: np.ndarray, pole: np.ndarray, rect: Any, inside: np.ndarray, u_columns: np.ndarray | None = None) -> Any:
    """(R, N, 3) 고리 격자(행 0 = 가장자리)와 꼭대기 점으로 닫힌 돔 면. UV u = 열/N 또는 `u_columns`(0 ≤ u < 1, 이음매 열은 1), v = 행/R(꼭대기 = 1,
    열마다 꼭대기 복제점). 법선은 이음매 없이(고리·꼭대기를 이어) 계산해 복제점에 같은 값을 준다. `inside`는 돔 안쪽 점(감김을 바깥으로 맞춘다)."""
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    rows, n, _ = rings.shape
    cols_u = np.arange(n + 1) / n if u_columns is None else np.append(np.asarray(u_columns, dtype=np.float64), 1.0)
    welded = np.vstack([rings.reshape(-1, 3), pole[None, :]])
    pole_index = rows * n
    last = (rows - 1) * n
    raw = np.array(fs.grid_triangles(rows, n, wrap=True).tolist() + [[last + i, last + (i + 1) % n, pole_index] for i in range(n)], dtype=np.int64)
    oriented = fs.orient_to(welded, raw, lambda c: c - inside)
    flipped = not np.array_equal(oriented[0], raw[0])
    normals = vertex_normals(welded, oriented)
    ring_normals = normals[: rows * n].reshape(rows, n, 3)
    positions = np.vstack([np.concatenate([rings, rings[:, :1]], axis=1).reshape(-1, 3), np.tile(pole, (n, 1))])
    normal_all = np.vstack([np.concatenate([ring_normals, ring_normals[:, :1]], axis=1).reshape(-1, 3), np.tile(normals[pole_index], (n, 1))])
    u = np.concatenate([np.tile(cols_u, rows), 0.5 * (cols_u[:-1] + cols_u[1:])])
    v = np.concatenate([np.repeat(np.arange(rows) / rows, n + 1), np.ones(n)])
    s_last = (rows - 1) * (n + 1)
    p0 = rows * (n + 1)
    seam = np.array(fs.grid_triangles(rows, n + 1, wrap=False).tolist() + [[s_last + i, s_last + i + 1, p0 + i] for i in range(n)], dtype=np.int64)
    if flipped:
        seam = seam[:, [0, 2, 1]]
    return fs.Piece(name=name, positions=positions, triangles=seam, uvs=rect.uv(u, v), normals=normal_all)


def slab_pieces(name: str, mid: np.ndarray, normals: np.ndarray, thickness: Any, top_rect: Any, bottom_rect: Any, edge_rect: Any, edge_length: float = 0.40) -> dict[str, Any]:
    """두께 있는 판(챙·띠·버클): 가운데 면 격자 (S, M, 3)와 그 위쪽 법선 (S, M, 3)으로 윗면(+t/2)·아랫면(−t/2)·둘레 옆면 세 조각을 만든다.

    윗면·아랫면 UV는 (열/(M−1), 행/(S−1)), 옆면은 둘레 호 길이/`edge_length`와 두께 방향 0~1. 반환 {"top", "bottom", "sides"}."""
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    s_count, m_count, _ = mid.shape
    th = np.broadcast_to(np.asarray(thickness, dtype=np.float64), (s_count, m_count))
    n = fs.unit(normals.reshape(-1, 3)).reshape(s_count, m_count, 3)
    top = (mid + n * (th / 2.0)[..., None]).reshape(-1, 3)
    bottom = (mid - n * (th / 2.0)[..., None]).reshape(-1, 3)
    tris = fs.grid_triangles(s_count, m_count, wrap=False)
    flat_n = n.reshape(-1, 3)
    top_tris = _orient_by(top, tris, flat_n)
    bottom_tris = _orient_by(bottom, tris, -flat_n)
    u = np.tile(np.linspace(0.0, 1.0, m_count), s_count)
    v = np.repeat(np.linspace(0.0, 1.0, s_count), m_count)
    out = {
        "top": fs.Piece(name=f"{name}-top", positions=top, triangles=top_tris, uvs=top_rect.uv(u, v), normals=vertex_normals(top, top_tris)),
        "bottom": fs.Piece(name=f"{name}-bottom", positions=bottom, triangles=bottom_tris, uvs=bottom_rect.uv(u, v), normals=vertex_normals(bottom, bottom_tris)),
    }
    # 둘레(행 0 → 열 끝 → 행 끝 거꾸로 → 열 0 거꾸로)
    ring = [(0, c) for c in range(m_count)] + [(r, m_count - 1) for r in range(1, s_count)] + [(s_count - 1, c) for c in range(m_count - 2, -1, -1)] + [(r, 0) for r in range(s_count - 2, 0, -1)]
    idx = np.array([r * m_count + c for r, c in ring])
    centroid = mid.reshape(-1, 3).mean(axis=0)
    loop_top, loop_bottom = top[idx], bottom[idx]
    seg = np.linalg.norm(np.diff(np.vstack([loop_top, loop_top[:1]]), axis=0), axis=1)
    along = np.concatenate([[0.0], np.cumsum(seg)])
    k = len(idx)
    positions = np.vstack([np.vstack([loop_top, loop_top[:1]]), np.vstack([loop_bottom, loop_bottom[:1]])])
    side_tris = []
    for i in range(k):
        a, b, c, d = i, i + 1, (k + 1) + i, (k + 1) + i + 1
        side_tris += [[a, c, d], [a, d, b]]
    side_tris = np.array(side_tris, dtype=np.int64)
    flat_mid = mid.reshape(-1, 3)[idx]
    outward = fs.unit(flat_mid - centroid)
    outward = fs.unit(outward - np.einsum("ij,ij->i", outward, flat_n[idx])[:, None] * flat_n[idx])
    out_dirs = np.vstack([np.vstack([outward, outward[:1]]), np.vstack([outward, outward[:1]])])
    side_tris = _orient_by(positions, side_tris, out_dirs)
    uvs = edge_rect.uv(np.concatenate([along, along]) / edge_length, np.concatenate([np.zeros(k + 1), np.ones(k + 1)]))
    out["sides"] = fs.Piece(name=f"{name}-sides", positions=positions, triangles=side_tris, uvs=uvs, normals=vertex_normals(positions, side_tris))
    return out


def torus_piece(name: str, grid: np.ndarray, rect: Any, wrap_rows: bool, wrap_cols: bool, u_scale: float = 1.0, outward: Callable[[np.ndarray], np.ndarray] | None = None) -> Any:
    """(R, K, 3) 격자 면(행 = 경로, 열 = 단면 둘레). 닫힌 방향마다 이음매 줄을 복제해 UV가 끊기지 않게 하고(u = 행 비율 × `u_scale`, v = 열 비율),
    법선은 이음매 없이 계산해 복제점에 같은 값을 준다. 두 방향 모두 닫히면 닫힌 조각이므로 부피가 양수가 되게 감김을 맞춘다."""
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    rows, cols, _ = grid.shape
    welded = grid.reshape(-1, 3)
    tris = []
    for r in range(rows if wrap_rows else rows - 1):
        r2 = (r + 1) % rows
        for c in range(cols if wrap_cols else cols - 1):
            c2 = (c + 1) % cols
            a, b, d, e = r * cols + c, r * cols + c2, r2 * cols + c, r2 * cols + c2
            tris += [[a, b, e], [a, e, d]]
    raw = np.array(tris, dtype=np.int64)
    if wrap_rows and wrap_cols:
        oriented = fs.orient_closed_components(welded, raw)
    elif outward is not None:
        oriented = fs.orient_to(welded, raw, outward)
    else:
        oriented = raw
    flipped = not np.array_equal(oriented[0], raw[0])
    normals = vertex_normals(welded, oriented).reshape(rows, cols, 3)
    rr, cc = rows + (1 if wrap_rows else 0), cols + (1 if wrap_cols else 0)
    ri = np.arange(rr) % rows
    ci = np.arange(cc) % cols
    positions = grid[ri][:, ci].reshape(-1, 3)
    normal_all = normals[ri][:, ci].reshape(-1, 3)
    u = np.repeat(np.arange(rr) / (rows if wrap_rows else rows - 1), cc) * u_scale
    v = np.tile(np.arange(cc) / (cols if wrap_cols else cols - 1), rr)
    seam = []
    for r in range(rr - 1):
        for c in range(cc - 1):
            a, b, d, e = r * cc + c, r * cc + c + 1, (r + 1) * cc + c, (r + 1) * cc + c + 1
            seam += [[a, b, e], [a, e, d]]
    seam = np.array(seam, dtype=np.int64)
    if flipped:
        seam = seam[:, [0, 2, 1]]
    return fs.Piece(name=name, positions=positions, triangles=seam, uvs=rect.uv(u, v), normals=normal_all)


def lens_profile(width: float, thickness: float, puff: float, samples: int = 7) -> np.ndarray:
    """리본 단면(닫힌 다각형, 2·samples 점): (x = 바깥 법선 쪽, y = 폭 쪽). 가운데가 `puff`만큼 부푼 얇은 렌즈(가장자리 두께 = thickness)."""
    s = np.linspace(-1.0, 1.0, samples)
    bulge = puff * (1.0 - s**2)
    top = np.stack([bulge + thickness / 2.0, s * width / 2.0], axis=1)
    bottom = np.stack([bulge[::-1] - thickness / 2.0, s[::-1] * width / 2.0], axis=1)
    return np.vstack([top, bottom])


def ellipsoid_piece(name: str, center: np.ndarray, axes: np.ndarray, uv: np.ndarray, rings: int = 8, segments: int = 16) -> Any:
    """타원체(단추·구슬): `axes`의 세 행이 반지름을 곱한 축 벡터. UV는 단색 칸 하나."""
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    unit_positions, triangles = sphere(np.zeros(3), 1.0, rings=rings, segments=segments)
    positions = center + unit_positions @ np.asarray(axes, dtype=np.float64)
    triangles = fs.orient_closed_components(positions, triangles)
    return fs.Piece(name=name, positions=positions, triangles=triangles, uvs=np.tile(uv, (len(positions), 1)), normals=vertex_normals(positions, triangles))


# ---------------------------------------------------------------- 야구 모자(accessory/cap)


@dataclass(frozen=True)
class CapParams:
    """야구 모자: 6판 크라운(뒤 개구부 아치) + 챙 + 단추 + 뒤 조절 띠·버클. 길이 m, 각도 도. 형상 키는 이 값을 바꾼 빌드의 정점 차다(위상 같음)."""

    band_front: float = 0.046  # 띠 앞 높이(눈 높이 위)
    band_back: float = -0.004  # 띠 뒤 높이(눈 높이 기준)
    hair_scale: float = 1.0  # 머리카락 여유 표 배율
    fit: float = 0.0  # 여유 가감(shape:fit) — 두피 위 최소 3 mm는 지킨다
    crown_lift: float = 0.0  # 정수리 덧높이(shape:crown)
    arch_height: float = 0.030  # 뒤 개구부 아치 높이(띠 위)
    arch_half_deg: float = 24.0
    brim_length: float = 0.060
    brim_span_deg: float = 76.0
    brim_forward: float = 0.82  # 챙 방향: 0 = 머리 중심에서 바깥(방사), 1 = 정면
    brim_pitch_deg: float = 10.0
    brim_curve: float = 5.0  # 옆 처짐 곡률(1/m)
    brim_thickness: float = 0.0032
    rows: int = 15


CAP_CROWN = (0, 0, 1024, 512)
CAP_BRIM_TOP = (0, 512, 512, 256)
CAP_BRIM_BOTTOM = (512, 512, 512, 256)
CAP_EDGE = (0, 768, 1024, 48)
CAP_SLAB_EDGE = (0, 816, 512, 32)
CAP_STRAP = (512, 816, 512, 64)
CAP_BRIM_STITCH_MM = (3.6, 7.0, 10.4, 13.8, 17.2)


def _rect(spec: tuple[int, int, int, int]) -> Any:
    from character_kit import forge_shoes as fs

    return fs.Rect(*spec)


def _band_elevation(shell: HeadShell, rho: Callable[[np.ndarray, np.ndarray], np.ndarray], azim: np.ndarray, plane: Callable[[np.ndarray], np.ndarray]) -> np.ndarray:
    """방위마다 껍질 ρ(고도, 방위)의 점이 띠 평면 y = plane(z) 위에 오는 고도(rad)를 이분법으로 찾는다."""
    lo = np.full(len(azim), math.radians(-55.0))
    hi = np.full(len(azim), math.radians(70.0))
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        p = shell.center + sphere_dir(mid, azim) * rho(mid, azim)[:, None]
        above = p[:, 1] > plane(p[:, 2])
        hi = np.where(above, mid, hi)
        lo = np.where(above, lo, mid)
    return 0.5 * (lo + hi)


def _wrap(angle: Any) -> np.ndarray:
    """각도를 (−π, π]로."""
    return np.mod(np.asarray(angle, dtype=np.float64) + np.pi, 2.0 * np.pi) - np.pi


def cap_columns(arch_half: float) -> np.ndarray:
    """크라운 열의 방위(rad, 뒤 π에서 시작해 증가). 고르게 5.625°(64열) + 뒤 개구부 아치 둘레(±(반폭 + 6°))는 2°로 촘촘히."""
    coarse = np.mod(math.pi + 2.0 * math.pi * np.arange(64) / 64.0, 2.0 * math.pi)
    reach = arch_half + math.radians(6.0)
    fine = np.mod(math.pi + np.arange(-reach, reach + 1e-9, math.radians(2.0)), 2.0 * math.pi)
    rel = np.unique(np.round(np.mod(np.concatenate([coarse, fine]) - math.pi, 2.0 * math.pi), 9))
    keep = [rel[0]]
    for value in rel[1:]:
        if value - keep[-1] > math.radians(0.9):
            keep.append(value)
    return np.mod(np.asarray(keep) + math.pi, 2.0 * math.pi)


def build_cap(lm: Landmarks, p: CapParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    shell = lm.head_shell()
    c = shell.center
    up = np.array([0.0, 1.0, 0.0])
    elev_grid, azim_grid = shell.grid()
    allowance = np.maximum(hair_allowance(elev_grid, azim_grid, p.hair_scale) + p.fit, 0.003)
    lift = p.crown_lift * smooth01(math.radians(35.0), math.radians(90.0), elev_grid)
    table = shell.envelope(shell.table + allowance + lift)

    def rho(elev: np.ndarray, azim: np.ndarray) -> np.ndarray:
        return shell.radius(elev, azim, table)

    # 띠 평면: 앞(φ=0)은 눈 높이 + band_front, 뒤(φ=π)는 눈 높이 + band_back. 두 점의 z는 그 높이의 껍질 점에서 잰다
    def find_z(azim: float, y_target: float) -> float:
        el = _band_elevation(shell, rho, np.array([azim]), lambda z: np.full_like(z, y_target))[0]
        return float((c + sphere_dir(el, azim) * rho(np.array(el), np.array(azim)))[2])

    y_front, y_back = lm.eye_y + p.band_front, lm.eye_y + p.band_back
    z_front, z_back = find_z(0.0, y_front), find_z(math.pi, y_back)
    slope = (y_front - y_back) / (z_front - z_back)

    def plane(z: np.ndarray) -> np.ndarray:
        return y_back + slope * (np.asarray(z) - z_back)

    arch_half = math.radians(p.arch_half_deg)
    azim = cap_columns(arch_half)
    n = len(azim)
    band = _band_elevation(shell, rho, azim, plane)
    # 뒤 개구부: 띠에서 아치 높이만큼 크라운 아래 가장자리를 올린다(포니테일·머리카락이 지나는 실제 구멍, 아래는 조절 띠가 막는다)
    rel = np.abs(_wrap(azim - math.pi))
    arch = p.arch_height * np.clip(1.0 - (rel / arch_half) ** 2, 0.0, 1.0) ** 0.55
    low = band + arch / rho(band, azim)
    rows = p.rows
    t = np.arange(rows) / rows
    elev_rings = low[None, :] + (math.pi / 2.0 - low[None, :]) * t[:, None]
    az_rings = np.broadcast_to(azim[None, :], elev_rings.shape)
    rings = c + sphere_dir(elev_rings, az_rings) * rho(elev_rings, az_rings)[..., None]
    pole = c + up * float(rho(np.array(math.pi / 2.0), np.array(0.0)))
    u_cols = np.mod(azim - math.pi, 2.0 * math.pi) / (2.0 * math.pi)
    crown = dome_piece("crown", rings, pole, _rect(CAP_CROWN), c, u_columns=u_cols)
    ring_len = np.linalg.norm(np.diff(np.concatenate([rings, rings[:, :1]], axis=1), axis=1), axis=2).sum(axis=1)
    meridian = float(np.linalg.norm(np.diff(np.vstack([rings[:, n // 2], pole[None]]), axis=0), axis=1).sum())

    # 가장자리 말림(관): 크라운 아래 가장자리(아치 포함)를 바깥으로 0.8 mm 밀고 타원 단면
    edge_line = rings[0]
    radial = fs.unit(np.stack([edge_line[:, 0] - c[0], np.zeros(n), edge_line[:, 2] - c[2]], axis=1))
    edge_path = edge_line + radial * 0.0008 - up * 0.0004
    edge_length = float(np.linalg.norm(np.diff(np.vstack([edge_path, edge_path[:1]]), axis=0), axis=1).sum())
    edge = fs.tube_piece("band-edge", edge_path, radial, fs.ellipse_profile(0.0016, 0.0016, 0.0023, 8), True, _rect(CAP_EDGE), band_length=edge_length + 1e-6)

    # 챙: 띠 앞쪽(±span) 뿌리에서 거의 정면(방사 18 %)을 향해 아래로 숙여 뻗는다. 옆으로 갈수록 짧아지고(반타원) 조금 처진다
    m = 33
    span = math.radians(p.brim_span_deg)
    phi = np.linspace(-span, span, m)
    phi_wrapped = np.mod(phi, 2.0 * math.pi)
    band_phi = _band_elevation(shell, rho, phi_wrapped, plane)
    root = c + sphere_dir(band_phi, phi_wrapped) * (rho(band_phi, phi_wrapped) - 0.0016)[:, None] - up * 0.0006
    radial_dir = np.stack([np.sin(phi), np.zeros(m), np.cos(phi)], axis=1)
    forward = np.tile(np.array([0.0, 0.0, 1.0]), (m, 1))
    horizontal = fs.unit((1.0 - p.brim_forward) * radial_dir + p.brim_forward * forward)
    pitch = math.radians(p.brim_pitch_deg)
    direction = horizontal * math.cos(pitch) - up[None, :] * math.sin(pitch)
    length = p.brim_length * np.clip(1.0 - (phi / span) ** 2, 0.0, 1.0) ** 0.62 + 0.007
    s_count = 9
    s = np.linspace(0.0, 1.0, s_count)
    mid = root[None, :, :] + (s[:, None] * length[None, :])[..., None] * direction[None, :, :]
    mid[..., 1] += -0.5 * p.brim_curve * (mid[..., 0] ** 2 - root[None, :, 0] ** 2)
    tri = fs.grid_triangles(s_count, m, wrap=False)
    brim_n = vertex_normals(mid.reshape(-1, 3), tri)
    if float(brim_n[:, 1].sum()) < 0.0:
        brim_n = -brim_n
    brim_n = brim_n.reshape(s_count, m, 3)
    thickness = p.brim_thickness * (1.0 - 0.18 * s)[:, None] * np.ones((1, m))
    brim = slab_pieces("brim", mid, brim_n, thickness, _rect(CAP_BRIM_TOP), _rect(CAP_BRIM_BOTTOM), _rect(CAP_SLAB_EDGE))

    # 꼭대기 단추
    button = ellipsoid_piece("button", pole + up * 0.0010, np.diag([0.0062, 0.0030, 0.0062]), acc_patch(0).uv(0.5, 0.5))

    # 뒤 조절 띠(스냅백): 개구부 바닥을 가로지른다(아치 반폭 + 2°), 띠 위 2~15 mm, 크라운 바깥 1.2~2.8 mm
    k_cols = 15
    strap_reach = arch_half + math.radians(2.0)
    strap_phi = np.mod(math.pi + np.linspace(-strap_reach, strap_reach, k_cols), 2.0 * math.pi)
    strap_band = _band_elevation(shell, rho, strap_phi, plane)
    heights = np.linspace(0.002, 0.015, 4)
    strap_mid = np.zeros((len(heights), k_cols, 3))
    strap_n = np.zeros((len(heights), k_cols, 3))
    r_band = rho(strap_band, strap_phi)
    for i, h in enumerate(heights):
        el = strap_band + h / r_band
        strap_mid[i] = c + sphere_dir(el, strap_phi) * (rho(el, strap_phi) + 0.0020)[:, None]
        strap_n[i] = sphere_dir(el, strap_phi)
    strap = slab_pieces("strap", strap_mid, strap_n, 0.0016, _rect(CAP_STRAP), _rect(CAP_STRAP), _rect(CAP_SLAB_EDGE))
    # 버클: 띠 가운데(φ=π) 13 × 11 mm 판
    centre_band = float(_band_elevation(shell, rho, np.array([math.pi]), plane)[0])
    r_centre = float(rho(np.array(centre_band), np.array(math.pi)))
    b_el = centre_band + 0.0085 / r_centre
    b_dir = sphere_dir(b_el, math.pi)
    b_side = np.array([1.0, 0.0, 0.0])
    b_up = fs.unit(np.cross(b_dir, b_side))
    if b_up[1] < 0:
        b_up = -b_up
    b_center = c + b_dir * (float(rho(np.array(b_el), np.array(math.pi))) + 0.0038)
    gx, gy = np.meshgrid(np.linspace(-0.0065, 0.0065, 3), np.linspace(-0.0055, 0.0055, 3))
    buckle_mid = b_center + gx[..., None] * b_side + gy[..., None] * b_up
    buckle = slab_pieces("buckle", buckle_mid, np.broadcast_to(b_dir, buckle_mid.shape), 0.0022, acc_patch(1), acc_patch(1), acc_patch(1), edge_length=1.0)

    head = f"rigid:{HEAD_JOINT}"
    parts = [
        AccPart(ACC_BODY, head, crown),
        AccPart(ACC_BODY, head, edge),
        AccPart(ACC_BODY, head, brim["top"]),
        AccPart(ACC_BODY, head, brim["sides"]),
        AccPart(ACC_ACCENT, head, brim["bottom"]),
        AccPart(ACC_ACCENT, head, button),
        AccPart(ACC_ACCENT, head, strap["top"]),
        AccPart(ACC_ACCENT, head, strap["bottom"]),
        AccPart(ACC_ACCENT, head, strap["sides"]),
        AccPart(ACC_ACCENT, head, buckle["top"]),
        AccPart(ACC_ACCENT, head, buckle["bottom"]),
        AccPart(ACC_ACCENT, head, buckle["sides"]),
    ]
    info = {
        "ringLength": ring_len.tolist(),
        "meridian": meridian,
        "brimLength": length.tolist(),
        "brimEdgeLength": float(np.linalg.norm(np.diff(mid[-1], axis=0), axis=1).sum()),
        "bandY": {"front": y_front, "back": y_back},
        "center": c.tolist(),
        "rhoTable": table,
        "bandPlane": (y_back, slope, z_back),
        "opening": (arch_half, p.arch_height),
    }
    return AccessoryBuild(parts=parts, info=info)


def hair_poke_report(lm: Landmarks, build: AccessoryBuild, hair_points: dict[str, np.ndarray], margin: float = 0.0005) -> dict[str, Any]:
    """모자(크라운 껍질 `rhoTable`)가 덮는 영역(띠 평면 위, 뒤 개구부 제외)에서 머리카락 정점이 껍질 밖으로 나온 개수와 최대 초과(mm)를 헤어별로 잰다."""
    shell = lm.head_shell()
    table = build.info["rhoTable"]
    y_back, slope, z_back = build.info["bandPlane"]
    arch_half, arch_height = build.info.get("opening", (0.0, 0.0))
    out: dict[str, Any] = {}
    for name, points in hair_points.items():
        elev, azim, dist = shell.direction_of(points)
        covered = points[:, 1] > y_back + slope * (points[:, 2] - z_back) + 0.002
        rel = np.abs(_wrap(azim - math.pi))
        in_opening = (rel < arch_half) & (points[:, 1] < y_back + slope * (points[:, 2] - z_back) + arch_height * np.clip(1.0 - (rel / max(arch_half, 1e-9)) ** 2, 0.0, 1.0) ** 0.55)
        covered &= ~in_opening
        excess = dist - shell.radius(elev, azim, table) + margin
        poke = covered & (excess > 0.0)
        out[name] = {"covered": int(covered.sum()), "poke": int(poke.sum()), "maxMm": round(float(excess[poke].max()) * 1000, 1) if poke.any() else 0.0}
    return out


def cap_shape_variants(p: CapParams) -> dict[str, CapParams]:
    return {
        "shape:crown:+": replace(p, crown_lift=p.crown_lift + 0.012),
        "shape:crown:-": replace(p, crown_lift=p.crown_lift - 0.006),
        "shape:brim:+": replace(p, brim_length=p.brim_length + 0.020, brim_pitch_deg=p.brim_pitch_deg - 2.0),
        "shape:brim:-": replace(p, brim_length=p.brim_length - 0.022, brim_curve=p.brim_curve + 4.0),
        "shape:fit:+": replace(p, fit=p.fit + 0.010),
        "shape:fit:-": replace(p, fit=p.fit - 0.016),
    }


def bake_cap(atlas: Any, build: AccessoryBuild) -> None:
    """야구 모자 상대색: 크라운 6판 솔기(골 + 양쪽 박음질)·통풍 구멍(아일릿)·땀받이 박음질, 챙 위 박음질 5줄, 챙 아래는 어둡게, 조절 띠 가장자리 박음질."""
    from character_kit import forge_shoes as fs

    info = build.info
    ring_len = np.asarray(info["ringLength"])
    meridian = float(info["meridian"])
    rows = len(ring_len)

    def crown(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        circ_mm = np.maximum(np.interp(fv, np.arange(rows) / rows, ring_len) * 1000.0, 1.0)
        v_mm = fv * meridian * 1000.0
        lum = np.full(fu.shape, 0.93)
        # 판 솔기(u = k/6, u 0 = 뒤 가운데): 골(어둡게) + 양쪽 1.8 mm 박음질 점선
        du = np.abs(((fu * 6.0 + 0.5) % 1.0) - 0.5) / 6.0 * circ_mm
        lum = np.where(du < 0.45, 0.58, lum)
        stitch = (np.abs(du - 1.8) < 0.33) & fs.dashes(v_mm, 2.6, 0.6) & (fv < 0.93)
        lum = np.where(stitch, 0.70, lum)
        # 통풍 구멍: 판 가운데, 아래 가장자리에서 크라운 길이 62 %
        for k in range(6):
            dx = (((fu - (k + 0.5) / 6.0) + 0.5) % 1.0 - 0.5) * circ_mm
            dy = (fv - 0.62) * meridian * 1000.0
            d = np.hypot(dx, dy)
            lum = np.where((d > 1.15) & (d < 2.2), 0.56, lum)
            lum = np.where(d <= 1.15, 0.76, lum)
        # 땀받이 박음질: 아래 가장자리에서 5 mm 위 한 줄
        sweat = (np.abs(v_mm - 5.0) < 0.32) & fs.dashes(fu * circ_mm, 2.6, 0.6)
        return np.where(sweat, 0.70, lum)

    atlas.bake(_rect(CAP_CROWN), crown)
    brim_len = np.asarray(info["brimLength"])
    edge_len_mm = float(info["brimEdgeLength"]) * 1000.0

    def brim(base: float, line: float) -> Callable[[np.ndarray, np.ndarray], np.ndarray]:
        def fn(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
            length_mm = np.interp(fu, np.linspace(0.0, 1.0, len(brim_len)), brim_len) * 1000.0
            d_edge = (1.0 - fv) * length_mm
            lum = np.full(fu.shape, base)
            along = fu * edge_len_mm
            for d in CAP_BRIM_STITCH_MM:
                lum = np.where((np.abs(d_edge - d) < 0.3) & fs.dashes(along, 2.6, 0.6) & (length_mm > d + 2.0), line, lum)
            return lum

        return fn

    atlas.bake(_rect(CAP_BRIM_TOP), brim(0.94, 0.68))
    atlas.bake(_rect(CAP_BRIM_BOTTOM), brim(0.80, 0.64))
    atlas.bake(_rect(CAP_EDGE), lambda fu, fv: np.full(fu.shape, 0.90))
    atlas.bake(_rect(CAP_SLAB_EDGE), lambda fu, fv: np.full(fu.shape, 0.86))

    def strap(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        lum = np.full(fu.shape, 0.84)
        edge = (np.abs(fv - 0.12) < 0.04) | (np.abs(fv - 0.88) < 0.04)
        return np.where(edge & fs.dashes(fu * 80.0, 2.6, 0.6), 0.68, lum)

    atlas.bake(_rect(CAP_STRAP), strap)
    for index, value in ((0, 0.94), (1, 0.98)):
        r = acc_patch(index)
        atlas.image[r.y : r.y + r.h, r.x : r.x + r.w] = value


register_accessory(
    AccessoryDefinition(
        name="cap",
        build=build_cap,
        params=CapParams(),
        shape_variants=cap_shape_variants,
        bake=bake_cap,
        anchors=("head-top",),
        layer="hat",
        vocabulary=True,
        shapes_ko={"crown": "크라운 높이", "brim": "챙 길이", "fit": "머리카락 여유(− 짧은 머리·맨머리, + 풍성한 머리)"},
        conflicts=("hair/twin-tail", "hair/action-pony"),
        stacking=(
            {"with": ["hair/wolf-layered"], "shapes": {"shape:fit:+": 1.0}, "noteKo": "울프컷의 옆·뒤 부피(25~35 mm)를 덮도록 모자를 키운다."},
            {"with": ["accessory/ribbon"], "targetShapes": {"shape:height:-": 1.0}, "noteKo": "모자를 쓰면 리본을 뒤 띠 아래로 내린다(리본의 형상 키)."},
            {"with": ["accessory/headphones"], "targetShapes": {"shape:hat-clear:+": 1.0}, "noteKo": "헤드폰 밴드를 모자 위로 띄운다(헤드폰의 형상 키)."},
        ),
        changes_ko=(
            "베이스 머리 중심에서 쏜 광선으로 잰 두피 반지름에 forge 헤어 7종 실측 부피(정수리 17.5 mm·이마 22 mm·옆 26 mm·뒤 23 mm)를 더하고 그 위로만 매끈하게 부풀린 "
            "껍질에 6판 크라운(앞이 높고 뒤가 낮은 띠 평면, 뒤 개구부 아치)·말린 가장자리·반타원 챙(정면으로 10° 숙임)·꼭대기 단추·뒤 조절 띠와 버클을 절차 생성하고, "
            "판 솔기 박음질·통풍 구멍·땀받이·챙 박음질 5줄·어두운 챙 아래를 상대색 텍스처로 구움. 머리 joint에 단단히 붙고 morph는 두개골 정점 델타에 맞춘 닮음 변환. "
            "외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 머리 리본(accessory/ribbon)


@dataclass(frozen=True)
class RibbonParams:
    """뒤통수 머리카락 위에 얹는 큰 리본: 날개 고리 둘(앞층이 부푼 렌즈 단면, 매듭 쪽은 모이고 끝은 넓다)·감싼 매듭·제비꼬리 끈 둘. 길이 m."""

    elev_deg: float = 8.0  # 매듭 자리: 머리 중심 기준 고도(뒤 φ = π)
    wing: float = 0.047  # 매듭 중심에서 날개 끝까지
    wing_width: float = 0.031
    knot_width: float = 0.012
    depth: float = 0.0064  # 날개 고리의 앞뒤 층 간격의 반
    puff: float = 0.0046
    tilt_deg: float = 9.0
    tail_length: float = 0.066
    tail_spread_deg: float = 17.0
    tail_width_top: float = 0.013
    tail_width_end: float = 0.020
    notch: float = 0.008  # 제비꼬리 홈 깊이
    thickness: float = 0.0011
    size: float = 1.0
    lift: float = 0.0  # 머리카락 껍질 위 높이 가감(shape:fit) — 두피 위 4 mm 아래로는 내려가지 않는다


RIB_WING = (0, 0, 1024, 384)
RIB_TAIL = (0, 384, 512, 256)
RIB_TAIL_BACK = (512, 384, 512, 256)
RIB_EDGE = (0, 640, 512, 32)
RIB_KNOT = (0, 672, 1024, 160)


def hair_shell_table(shell: HeadShell, scale: float = 1.0, extra: float = 0.0) -> np.ndarray:
    """머리카락 바깥 껍질(두피 + 실측 여유, 위로만 평활) 반지름 표 — 리본·헤드폰처럼 머리카락 위에 얹는 소품의 바닥."""
    elev_grid, azim_grid = shell.grid()
    return shell.envelope(shell.table + np.maximum(hair_allowance(elev_grid, azim_grid, scale) + extra, 0.003))


def build_ribbon(lm: Landmarks, p: RibbonParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs

    shell = lm.head_shell()
    c = shell.center
    up = np.array([0.0, 1.0, 0.0])
    table = hair_shell_table(shell)

    def rho(elev: Any, azim: Any) -> np.ndarray:
        return shell.radius(elev, azim, table)

    e_a = math.radians(p.elev_deg)
    n_dir = sphere_dir(e_a, math.pi)
    r_skin = float(shell.radius(np.array(e_a), np.array(math.pi), shell.table))
    r_a = max(float(rho(np.array(e_a), np.array(math.pi))) + p.lift, r_skin + 0.004)
    lift = r_a - float(rho(np.array(e_a), np.array(math.pi)))
    origin = c + n_dir * (r_a + 0.0015)
    y_dir = fs.unit(up - (up @ n_dir) * n_dir)
    x_dir = np.cross(n_dir, y_dir)
    s = p.size

    def world(x: np.ndarray, y: np.ndarray, d: np.ndarray) -> np.ndarray:
        return origin + x[..., None] * x_dir + y[..., None] * y_dir + d[..., None] * n_dir

    xk, wing, depth = 0.0045 * s, p.wing * s, p.depth * s
    tilt = math.tan(math.radians(p.tilt_deg))
    parts: list[AccPart] = []
    head = f"rigid:{HEAD_JOINT}"
    t = np.linspace(0.0, 2.0 * math.pi, 44, endpoint=False)
    for sigma, label in ((1.0, "L"), (-1.0, "R")):
        x = sigma * (xk + (wing - xk) * np.sin(t / 2.0) ** 2)
        d = depth * (1.0 + np.sin(t)) + 0.0004 - 0.5 * x**2 / (2.0 * r_a)  # 날개를 머리 곡면 쪽으로 반쯤 굽힌다
        y = tilt * (np.abs(x) - xk)
        path = world(x, y, d)
        tangent = fs.unit(np.roll(path, -1, axis=0) - np.roll(path, 1, axis=0))
        m_dir = fs.unit(np.cross(tangent, np.tile(y_dir, (len(t), 1))))
        if float(np.einsum("ij,ij->i", m_dir, path - path.mean(axis=0)).sum()) < 0.0:
            m_dir = -m_dir
        width = (p.knot_width + (p.wing_width - p.knot_width) * np.sin(t / 2.0) ** 1.6) * s
        puff = p.puff * s * np.maximum(np.sin(t), 0.0)
        grid = np.stack([path[i] + lens_profile(width[i], p.thickness, puff[i])[:, :1] * m_dir[i] + lens_profile(width[i], p.thickness, puff[i])[:, 1:] * y_dir for i in range(len(t))])
        parts.append(AccPart(ACC_BODY, head, torus_piece(f"wing-{label}", grid, _rect(RIB_WING), True, True)))
    # 매듭: 모인 날개 끝을 감싸는 짧은 띠(고리)
    tau = np.linspace(0.0, 2.0 * math.pi, 20, endpoint=False)
    kx = (xk + 0.0021) * np.cos(tau)
    kd = depth + 0.0004 + (0.0032 * s + p.thickness) * np.sin(tau)
    k_path = world(kx, np.zeros_like(tau), kd)
    k_tan = fs.unit(np.roll(k_path, -1, axis=0) - np.roll(k_path, 1, axis=0))
    k_m = fs.unit(np.cross(k_tan, np.tile(y_dir, (len(tau), 1))))
    if float(np.einsum("ij,ij->i", k_m, k_path - k_path.mean(axis=0)).sum()) < 0.0:
        k_m = -k_m
    k_prof = lens_profile(0.0135 * s, p.thickness * 1.3, 0.0009 * s)
    k_grid = np.stack([k_path[i] + k_prof[:, :1] * k_m[i] + k_prof[:, 1:] * y_dir for i in range(len(tau))])
    parts.append(AccPart(ACC_ACCENT, head, torus_piece("knot", k_grid, _rect(RIB_KNOT), True, True)))
    # 꼬리: 매듭 아래에서 양쪽으로 벌어지며 머리카락 껍질을 따라 내려간다. 끝은 제비꼬리 홈
    rows, cols = 15, 7
    across_s = np.linspace(-1.0, 1.0, cols)
    spread = math.radians(p.tail_spread_deg)
    for sigma, label in ((1.0, "L"), (-1.0, "R")):
        u_max = 1.0 - (p.notch / max(p.tail_length, 1e-6)) * (1.0 - np.abs(across_s))
        u = np.linspace(0.0, 1.0, rows)[:, None] * u_max[None, :]
        along = p.tail_length * u
        wave = 0.0018 * np.sin(u * math.pi) * sigma
        cx = sigma * (0.0025 * s + math.sin(spread) * along) + wave
        cy = -0.0045 * s - math.cos(spread) * along
        half = 0.5 * (p.tail_width_top + (p.tail_width_end - p.tail_width_top) * u) * s
        px = cx + across_s[None, :] * half * math.cos(spread)
        py = cy + across_s[None, :] * half * math.sin(spread) * sigma
        flat = origin + px[..., None] * x_dir + py[..., None] * y_dir
        el, az, _ = shell.direction_of(flat)
        tail_lift = 0.0013 + depth * 0.9 * (1.0 - smooth01(0.0, 0.35, u))
        floor = shell.radius(el, az, shell.table) + 0.004
        mid = c + sphere_dir(el, az) * np.maximum(rho(el, az) + lift + tail_lift, floor + tail_lift)[..., None]
        normals = sphere_dir(el, az)
        tail = slab_pieces(f"tail-{label}", mid, normals, p.thickness, _rect(RIB_TAIL), _rect(RIB_TAIL_BACK), _rect(RIB_EDGE))
        parts += [AccPart(ACC_BODY, head, tail["top"]), AccPart(ACC_BODY, head, tail["bottom"]), AccPart(ACC_BODY, head, tail["sides"])]
    info = {"anchor": origin.tolist(), "elevDeg": p.elev_deg, "wingSpanM": 2.0 * wing}
    return AccessoryBuild(parts=parts, info=info)


def ribbon_shape_variants(p: RibbonParams) -> dict[str, RibbonParams]:
    return {
        "shape:size:+": replace(p, size=p.size * 1.28),
        "shape:size:-": replace(p, size=p.size * 0.78),
        "shape:tails:+": replace(p, tail_length=p.tail_length + 0.036),
        "shape:tails:-": replace(p, tail_length=p.tail_length - 0.032),
        "shape:height:+": replace(p, elev_deg=p.elev_deg + 37.0),
        # 모자 뒤 띠(눈 높이 − 4 mm) 아래 목덜미: 날개를 덜 들고 꼬리를 줄여 목에 닿지 않게 한다
        "shape:height:-": replace(p, elev_deg=p.elev_deg - 41.0, tilt_deg=3.0, tail_length=p.tail_length * 0.45),
        "shape:fit:+": replace(p, lift=p.lift + 0.008),
        "shape:fit:-": replace(p, lift=p.lift - 0.021),
    }


def bake_ribbon(atlas: Any, build: AccessoryBuild) -> None:
    """리본 상대색: 날개·꼬리 가장자리 가는 줄(그로그랭 테두리), 매듭 주름 두 줄."""

    def wing(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        # v: 단면 둘레(윗면 0~0.5 = 폭 −1→1, 아랫면 0.5~1). 폭 끝(|s| > 0.8)에 줄
        s = np.where(fv < 0.5, fv / 0.5, (1.0 - fv) / 0.5) * 2.0 - 1.0
        return np.where(np.abs(s) > 0.80, 0.76, 0.93)

    def tail(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        return np.where(np.abs(fu - 0.5) > 0.40, 0.76, 0.93)

    def knot(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        s = np.where(fv < 0.5, fv / 0.5, (1.0 - fv) / 0.5) * 2.0 - 1.0
        fold = (np.abs(s - 0.33) < 0.05) | (np.abs(s + 0.33) < 0.05)
        return np.where(fold, 0.78, 0.90)

    atlas.bake(_rect(RIB_WING), wing)
    atlas.bake(_rect(RIB_TAIL), tail)
    atlas.bake(_rect(RIB_TAIL_BACK), lambda fu, fv: np.where(np.abs(fu - 0.5) > 0.40, 0.72, 0.86))
    atlas.bake(_rect(RIB_EDGE), lambda fu, fv: np.full(fu.shape, 0.82))
    atlas.bake(_rect(RIB_KNOT), knot)


register_accessory(
    AccessoryDefinition(
        name="ribbon",
        build=build_ribbon,
        params=RibbonParams(),
        shape_variants=ribbon_shape_variants,
        bake=bake_ribbon,
        anchors=("hair",),
        layer="hair-accessory",
        mesh_role="hair-accessory",
        vocabulary=True,
        shapes_ko={"size": "리본 크기", "tails": "꼬리 길이", "height": "위치(− 목덜미, + 정수리 쪽·포니테일 묶음)", "fit": "머리카락 위 높이(− 짧은 머리·맨머리, + 풍성한 머리)"},
        conflicts=("hair/action-pony",),
        stacking=(
            {"with": ["accessory/cap"], "shapes": {"shape:height:-": 1.0}, "noteKo": "모자 뒤 띠 아래(목덜미)로 내린다."},
            {"with": ["hair/wolf-layered"], "shapes": {"shape:fit:+": 1.0}, "noteKo": "울프컷 뒤 부피 위로 띄운다."},
        ),
        changes_ko=(
            "베이스 두피 반지름에 forge 헤어 실측 부피를 더한 머리카락 껍질의 뒤통수(머리 중심 고도 8°)에, 매듭 쪽으로 모이고 끝이 넓어지는 렌즈 단면 날개 고리 둘(앞층이 "
            "부풀고 위로 9° 든다)·감싼 매듭·껍질을 따라 벌어지며 내려가는 제비꼬리 끈 둘을 절차 생성하고 그로그랭 테두리 줄·매듭 주름을 상대색 텍스처로 구움. "
            "머리 joint에 단단히 붙는다. 외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 헤드폰(accessory/headphones)


@dataclass(frozen=True)
class HeadphoneParams:
    """오버이어 헤드폰: 머리카락 껍질 위로 넘어가는 밴드(아래 패드)·슬라이더·요크·컵(가죽 쿠션 링·천 덮개·바깥 판). 길이 m."""

    band_tilt_deg: float = 6.0  # 밴드 면을 뒤로 눕힌 각
    band_width: float = 0.026
    band_thickness: float = 0.0082
    band_gap: float = 0.004  # 머리카락 껍질 위 패드까지 여유
    ear_gap: float = 0.018  # 귀 바깥면에서 쿠션 안쪽 면까지(머리카락이 귀를 덮는 몫 포함)
    fit: float = 0.0  # 쿠션·밴드 여유 가감(shape:fit)
    hat_clear: float = 0.0  # 모자 위로 밴드를 더 띄움(shape:hat-clear)
    cup_radius: float = 0.035
    cup_depth: float = 0.017
    cushion_thickness: float = 0.012
    size: float = 1.0  # 컵 배율(shape:cup)


HP_BAND = (0, 0, 1024, 128)
HP_PAD = (0, 128, 1024, 96)
HP_CUSHION = (0, 224, 512, 128)
HP_CUP = (512, 224, 512, 256)
HP_PLATE = (0, 352, 256, 128)
HP_YOKE = (256, 352, 256, 64)
HP_SLIDER = (256, 416, 256, 64)


def revolve_piece(name: str, profile: np.ndarray, center: np.ndarray, axis: np.ndarray, rect: Any, segments: int = 36, closed_profile: bool = False, outward: Callable[[np.ndarray], np.ndarray] | None = None) -> Any:
    """축 둘레 회전체: `profile` (P, 2) = (축 방향 거리, 반지름). 반지름 0인 끝점은 축 위 한 점으로 모은다(부채꼴). UV u = 둘레, v = 단면 비율."""
    from character_kit import forge_shoes as fs

    axis = fs.unit(np.asarray(axis, dtype=np.float64))
    helper = np.array([0.0, 1.0, 0.0]) if abs(axis[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    e1 = fs.unit(np.cross(axis, helper))
    e2 = np.cross(axis, e1)
    ang = np.linspace(0.0, 2.0 * math.pi, segments, endpoint=False)
    ring_dir = np.cos(ang)[:, None] * e1 + np.sin(ang)[:, None] * e2
    grid = center + profile[:, 0, None, None] * axis + profile[:, 1, None, None] * ring_dir[None, :, :]
    # 반지름 0 끝은 아주 작은 원으로 둔다(퇴화 삼각형 대신 면적이 작은 삼각형) — 법선·UV가 안정적이다
    small = profile[:, 1] < 1e-6
    if small.any():
        grid[small] = center + profile[small, 0, None, None] * axis + 2e-5 * ring_dir[None, :, :]
    middle = center + axis * float(np.mean(profile[:, 0]))
    piece = torus_piece(name, grid, rect, wrap_rows=closed_profile, wrap_cols=True, outward=outward or (lambda pts: pts - middle))
    # torus_piece는 행 = 단면, 열 = 둘레로 쓴다: u(행 비율)·v(열 비율)를 바꿔 u = 둘레가 되게 한다
    uv = piece.uvs.copy()
    rows = len(profile) + (1 if closed_profile else 0)
    cols = segments + 1
    fu = np.tile(np.arange(cols) / (cols - 1), rows)
    fv = np.repeat(np.arange(rows) / max(rows - 1, 1), cols)
    piece.uvs = rect.uv(fu, fv) if uv.shape[0] == rows * cols else uv
    return piece


def build_headphones(lm: Landmarks, p: HeadphoneParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs

    shell = lm.head_shell()
    c = shell.center
    up = np.array([0.0, 1.0, 0.0])
    table = hair_shell_table(shell)
    head = f"rigid:{HEAD_JOINT}"
    parts: list[AccPart] = []
    sz = p.size
    radius, depth, cushion = p.cup_radius * sz, p.cup_depth * sz, p.cushion_thickness * sz
    ear = {side: lm.ear[side] for side in ("L", "R")}
    cups = {}
    for side, sigma in (("L", 1.0), ("R", -1.0)):
        e = ear[side]
        ear_y = 0.5 * (e["top"][1] + e["bottom"][1])
        inner_x = abs(e["outer_x"]) + max(p.ear_gap + p.fit, 0.004)
        cups[side] = {"sigma": sigma, "y": ear_y + 0.002, "z": e["mean_z"] + 0.003, "inner": inner_x}
    for side, cup in cups.items():
        sigma = cup["sigma"]
        axis = np.array([sigma, 0.0, 0.0])
        base_c = np.array([sigma * cup["inner"], cup["y"], cup["z"]])
        # 쿠션: 단면 타원(지름 방향 반폭·축 방향 반두께)인 고리
        r_major = 0.5 * (radius + 0.55 * radius)
        half_r = 0.5 * (radius - 0.55 * radius)
        prof_ang = np.linspace(0.0, 2.0 * math.pi, 10, endpoint=False)
        cushion_profile = np.stack([cushion / 2.0 + (cushion / 2.0) * np.cos(prof_ang), r_major + half_r * np.sin(prof_ang)], axis=1)
        parts.append(AccPart(ACC_ACCENT, head, revolve_piece(f"cushion-{side}", cushion_profile, base_c, axis, _rect(HP_CUSHION), 28, closed_profile=True)))
        # 천 덮개(쿠션 안 원판, 살짝 들어감)
        cloth = np.array([[cushion * 0.70, 0.0], [cushion * 0.70, 0.56 * radius]])
        parts.append(AccPart(ACC_ACCENT, head, revolve_piece(f"cloth-{side}", cloth, base_c, axis, acc_patch(2), 24, outward=lambda pts, a=axis: np.tile(-a, (len(pts), 1)))))
        # 컵 껍질: 쿠션 뒤에서 시작해 둥근 테를 돌아 바깥 면(살짝 볼록)으로 닫힌다
        x0 = cushion * 0.85
        rim = 0.0055 * sz
        k = np.linspace(0.0, math.pi / 2.0, 4)
        side_x = np.linspace(x0, x0 + depth - rim, 3)
        prof = [[x0, 0.0], [x0, radius * 0.55], [x0, radius - rim * 0.4]] + [[x, radius] for x in side_x[1:]]
        prof += [[x0 + depth - rim + rim * math.sin(a), radius - rim + rim * math.cos(a)] for a in k[1:]]
        prof += [[x0 + depth + 0.0012 * (1 - (r / radius) ** 2), r] for r in np.linspace(radius - rim * 1.05, 0.0, 5)]
        cup_profile = np.array(prof)
        parts.append(AccPart(ACC_BODY, head, revolve_piece(f"cup-{side}", cup_profile, base_c, axis, _rect(HP_CUP), 28, outward=lambda pts, m=base_c + axis * (x0 + depth / 2.0): pts - m)))
        # 바깥 판(포인트): 컵 바깥 면 가운데 원판(1 mm 돋움)
        plate_x = x0 + depth + 0.0012
        plate = np.array([[plate_x - 0.0004, 0.0], [plate_x + 0.0009, 0.0], [plate_x + 0.0009, 0.62 * radius], [plate_x - 0.0004, 0.64 * radius]])
        parts.append(AccPart(ACC_ACCENT, head, revolve_piece(f"plate-{side}", plate, base_c, axis, _rect(HP_PLATE), 28, closed_profile=True)))
        cup["center"] = base_c
        cup["mid_x"] = sigma * (cup["inner"] + x0 + depth * 0.5)
        cup["top"] = cup["y"] + radius
    # 요크: 컵 위를 앞뒤로 감싸는 U자 팔(컵 가운데 면, 반지름 = 컵 + 4 mm)
    for side, cup in cups.items():
        sigma = cup["sigma"]
        arm_r = radius + 0.0045 * sz
        ang = np.linspace(math.radians(25.0), math.radians(155.0), 13)
        path = np.stack([np.full(len(ang), cup["mid_x"]), cup["y"] + arm_r * np.sin(ang), cup["z"] + arm_r * np.cos(ang)], axis=1)
        normals = np.stack([np.zeros(len(ang)), np.sin(ang), np.cos(ang)], axis=1)
        yoke = fs.tube_piece(f"yoke-{side}", path, normals, fs.rect_profile(0.0055 * sz, 0.0036, -0.0018, 2), False, _rect(HP_YOKE), band_length=0.2)
        parts.append(AccPart(ACC_ACCENT, head, yoke))
        cup["yoke_top"] = np.array([cup["mid_x"], cup["y"] + arm_r + 0.0018, cup["z"]])
    # 밴드: 뒤로 기운 면 안의 초타원(옆은 수직, 위는 둥글다). 머리카락 껍질 위로 패드 + 여유가 남을 때까지 높이·폭을 키운다
    tilt = math.radians(p.band_tilt_deg)
    u_b = np.array([0.0, math.cos(tilt), -math.sin(tilt)])
    n_b = np.array([0.0, math.sin(tilt), math.cos(tilt)])  # 밴드 폭 방향(앞뒤)
    left_end = cups["L"]["yoke_top"]
    plane_origin = np.array([0.0, left_end[1], left_end[2]])
    a_half = abs(left_end[0])
    clearance = p.band_gap + p.fit * 0.5 + p.hat_clear + p.band_thickness / 2.0

    def band_points(height: float, n_exp: float, count: int = 45) -> np.ndarray:
        th = np.linspace(0.0, math.pi, count)
        cx = np.cos(th)
        sy = np.sin(th)
        x = a_half * np.sign(cx) * np.abs(cx) ** (2.0 / n_exp)
        h = height * np.abs(sy) ** (2.0 / n_exp)
        return plane_origin + x[:, None] * np.array([1.0, 0.0, 0.0]) + h[:, None] * u_b

    def margin(points: np.ndarray) -> np.ndarray:
        el, az, dist = shell.direction_of(points)
        return dist - shell.radius(el, az, table) - clearance

    height, n_exp = 0.08, 2.6
    for _ in range(80):
        m_now = margin(band_points(height, n_exp)[5:-5])
        if m_now.min() >= 0.0:
            break
        height += max(-float(m_now.min()), 0.0005)
    band_path = band_points(height, n_exp)
    band_normals = fs.unit(band_path - (plane_origin + u_b * (height * 0.45)))
    band_normals = fs.unit(band_normals - np.einsum("ij,j->i", band_normals, n_b)[:, None] * n_b)
    band = fs.tube_piece("band", band_path, band_normals, fs.rect_profile(p.band_width, p.band_thickness, -p.band_thickness / 2.0, 3), False, _rect(HP_BAND), band_length=float(np.linalg.norm(np.diff(band_path, axis=0), axis=1).sum()) + 1e-6, y_hint=n_b)
    parts.append(AccPart(ACC_BODY, head, band))
    # 패드: 밴드 아래(머리 쪽) 위 구간, 폭 21 mm · 두께 5.5 mm
    sel = slice(10, 35)
    pad_path = band_path[sel] - band_normals[sel] * (p.band_thickness / 2.0 + 0.0034)
    pad = fs.tube_piece("pad", pad_path, band_normals[sel], fs.ellipse_profile(0.0037, 0.0037, 0.0108, 12), False, _rect(HP_PAD), band_length=float(np.linalg.norm(np.diff(pad_path, axis=0), axis=1).sum()) + 1e-6, y_hint=n_b)
    parts.append(AccPart(ACC_ACCENT, head, pad))
    # 슬라이더: 밴드 끝과 요크 꼭대기 사이 막대(밴드보다 가늘다)
    for side, idx in (("L", 0), ("R", -1)):
        cup = cups[side]
        start = band_path[idx]
        end = cup["yoke_top"]
        path = np.stack([start + (end - start) * f for f in np.linspace(0.0, 1.0, 6)])
        path[:, 1] += np.linspace(0.006, 0.0, 6)
        normals = np.tile(np.array([cup["sigma"], 0.0, 0.0]), (6, 1))
        slider = fs.tube_piece(f"slider-{side}", path, normals, fs.rect_profile(0.0115 * sz, 0.0042, -0.0021, 2), False, _rect(HP_SLIDER), band_length=0.05, y_hint=np.array([0.0, 0.0, 1.0]))
        parts.append(AccPart(ACC_BODY, head, slider))
    info = {"bandHeightM": round(height, 4), "cupInnerX": round(cups["L"]["inner"], 4), "bandLength": float(np.linalg.norm(np.diff(band_path, axis=0), axis=1).sum())}
    return AccessoryBuild(parts=parts, info=info)


def headphone_shape_variants(p: HeadphoneParams) -> dict[str, HeadphoneParams]:
    return {
        "shape:fit:+": replace(p, fit=p.fit + 0.026),
        "shape:fit:-": replace(p, fit=p.fit - 0.014),
        "shape:hat-clear:+": replace(p, hat_clear=p.hat_clear + 0.009),
        "shape:hat-clear:-": replace(p, hat_clear=p.hat_clear - 0.003),
        "shape:cup:+": replace(p, size=p.size * 1.16),
        "shape:cup:-": replace(p, size=p.size * 0.86),
    }


def bake_headphones(atlas: Any, build: AccessoryBuild) -> None:
    """헤드폰 상대색: 밴드 가운데 홈·가장자리 박음질, 패드 누빔, 쿠션 주름, 컵 테 이음선, 바깥 판 고리."""
    from character_kit import forge_shoes as fs

    length_mm = float(build.info["bandLength"]) * 1000.0

    def band(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        lum = np.full(fu.shape, 0.90)
        groove = np.abs(((fv * 4.0) % 1.0) - 0.5) < 0.03  # 둘레 4면 가운데 선(윗면 가운데 포함)
        lum = np.where(groove, 0.70, lum)
        edge = (np.abs(((fv * 4.0) % 1.0) - 0.15) < 0.03) & fs.dashes(fu * length_mm, 2.6, 0.6)
        return np.where(edge, 0.74, lum)

    def pad(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        quilt = (np.abs(((fu * length_mm / 9.0) % 1.0) - 0.5) > 0.46)
        return np.where(quilt, 0.70, 0.86)

    def cushion(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        pleat = np.abs(((fu * 36.0) % 1.0) - 0.5) > 0.44
        return np.where(pleat, 0.74, 0.86)

    def cup(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        seam = np.abs(fv - 0.48) < 0.012
        return np.where(seam, 0.72, 0.92)

    def plate(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        ring = np.abs(fv - 0.55) < 0.05
        return np.where(ring, 0.76, 0.95)

    atlas.bake(_rect(HP_BAND), band)
    atlas.bake(_rect(HP_PAD), pad)
    atlas.bake(_rect(HP_CUSHION), cushion)
    atlas.bake(_rect(HP_CUP), cup)
    atlas.bake(_rect(HP_PLATE), plate)
    atlas.bake(_rect(HP_YOKE), lambda fu, fv: np.full(fu.shape, 0.92))
    atlas.bake(_rect(HP_SLIDER), lambda fu, fv: np.where(np.abs(((fu * 12.0) % 1.0) - 0.5) > 0.45, 0.80, 0.93))
    r = acc_patch(2)
    atlas.image[r.y : r.y + r.h, r.x : r.x + r.w] = 0.60


register_accessory(
    AccessoryDefinition(
        name="headphones",
        build=build_headphones,
        params=HeadphoneParams(),
        shape_variants=headphone_shape_variants,
        bake=bake_headphones,
        anchors=("head-top", "ear-l", "ear-r"),
        layer="headwear-over",
        vocabulary=True,
        shapes_ko={"fit": "머리카락 여유(− 맨머리·짧은 머리, + 귀를 덮는 머리)", "hat-clear": "밴드 높이(+ 모자 위)", "cup": "컵 크기"},
        conflicts=("hair/twin-tail",),
        stacking=(
            {"with": ["accessory/cap"], "shapes": {"shape:hat-clear:+": 1.0}, "noteKo": "밴드를 모자 크라운 위로 띄운다."},
            {"with": ["hair/soft-bob", "hair/romance-long", "hair/hime-cut", "hair/wolf-layered"], "shapes": {"shape:fit:+": 1.0}, "noteKo": "귀를 덮는 머리카락 위로 컵·밴드를 띄운다(기본은 짧은 머리·맨머리 기준)."},
        ),
        changes_ko=(
            "베이스 귀 위치(바깥면·위아래 끝)와 머리 중심에서 잰 두피에 forge 헤어 실측 부피를 더한 껍질 위로, 뒤로 6° 기운 면 안의 초타원 밴드(패드가 머리카락 위 4 mm에 "
            "오도록 높이를 키움)·누빔 패드·슬라이더·U자 요크·컵(가죽 쿠션 고리·천 덮개·둥근 테 껍질·바깥 판)을 절차 생성하고 박음질·누빔·쿠션 주름·테 이음선을 상대색 "
            "텍스처로 구움. 머리 joint에 단단히 붙는다. 외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 기존 3종 확장(안경·귀걸이·초커): v1 빌더와 같은 식, 기본값에서 같은 지오메트리


def head_signed_distance(lm: Landmarks, points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """머리 메시(T-포즈) 부호 거리(바깥 +)와 최근접 삼각형 법선."""
    surface = lm.head_shell().surface
    hits = surface.closest(np.asarray(points, dtype=np.float64))
    normal = hits.normal
    return np.einsum("ij,ij->i", points - hits.point, normal), normal


def body_signed_distance(lm: Landmarks, points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """몸+머리(T-포즈, 용접) 부호 거리(바깥 +)와 최근접점의 매끈한 법선(정점 법선 보간)."""
    from character_kit.surface import vertex_normals

    surface = lm.surface()
    if getattr(lm, "_surface_normals", None) is None:
        lm._surface_normals = vertex_normals(surface.positions, surface.triangles)
    hits = surface.closest(np.asarray(points, dtype=np.float64))
    corners = surface.triangles[hits.triangle]
    normal = np.einsum("mc,mck->mk", hits.bary, lm._surface_normals[corners])
    normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-12)
    return np.einsum("ij,ij->i", points - hits.point, normal), normal


def push_out_points(lm: Landmarks, points: np.ndarray, clearance: float, iterations: int = 4) -> np.ndarray:
    """몸+머리 표면 안쪽이나 `clearance`보다 가까운 점을 표면 법선 방향으로 밀어낸다(격자·고리 정점용)."""
    out = np.asarray(points, dtype=np.float64).reshape(-1, 3).copy()
    for _ in range(iterations):
        d, normal = body_signed_distance(lm, out)
        push = np.maximum(clearance - d, 0.0)
        if not (push > 1e-7).any():
            break
        out += normal * push[:, None]
    return out.reshape(np.shape(points))


def report_metric_distance(lm: Landmarks, points: np.ndarray) -> np.ndarray:
    """빌드 보고서·시험이 쓰는 간격 척도(`garment_fit.signed_distance`)의 부호 거리."""
    from character_kit import forge_shoes as fs
    from character_kit import garment_fit as gf

    ctx = getattr(lm, "_report_ctx", None)
    if ctx is None:
        ctx = fs.body_context(lm.base, "body", names=[])
        lm._report_ctx = ctx
    return gf.signed_distance(np.asarray(points, dtype=np.float64), ctx.surface, ctx.body_normals)[0]


def push_out_report_metric(lm: Landmarks, points: np.ndarray, clearance: float, iterations: int = 3, directions: np.ndarray | None = None) -> np.ndarray:
    """빌드 보고서·시험이 쓰는 간격 척도(`garment_fit.signed_distance`, 용접하지 않은 몸 + 평활 법선)로도 `clearance` 밖이 되게 민다.
    이음매·주름에서 용접한 몸 척도(`body_signed_distance`)와 부호가 갈리는 정점이 드물게 있다. `directions`(정점별 단위 벡터)를 주면 그 방향으로 민다 —
    척도 법선이 옆을 향하는 이음매에서 옆으로 밀면 형태 키 변형마다 민 방향이 달라 중간 가중치에서 손가락을 지났다(2026-10-23)."""
    from character_kit import forge_shoes as fs
    from character_kit import garment_fit as gf

    ctx = getattr(lm, "_report_ctx", None)
    if ctx is None:
        ctx = fs.body_context(lm.base, "body", names=[])
        lm._report_ctx = ctx
    out = np.asarray(points, dtype=np.float64).copy()
    for _ in range(iterations):
        d, _, normal = gf.signed_distance(out, ctx.surface, ctx.body_normals)
        push = np.maximum(clearance - d, 0.0)
        if not (push > 1e-7).any():
            break
        if directions is None:
            out += normal * push[:, None]
        else:
            facing = np.maximum(np.einsum("ij,ij->i", directions, normal), 0.3)
            out += directions * (push / facing)[:, None]
    return out


def push_out_curve(lm: Landmarks, points: np.ndarray, clearance: float, iterations: int = 4) -> np.ndarray:
    """곡선 중심선 점을 머리 표면 밖 `clearance`(m)까지 법선 방향으로 밀어낸다. 민 양을 곡선을 따라 평활해 꺾임을 막는다."""
    out = np.asarray(points, dtype=np.float64).copy()
    for _ in range(iterations):
        d, normal = head_signed_distance(lm, out)
        push = np.maximum(clearance - d, 0.0)
        if not (push > 1e-7).any():
            break
        # 민 양(크기)을 이웃으로 번지게 한 뒤(줄이지는 않는다) 점마다 자기 법선 방향으로 민다
        for _ in range(2):
            padded = np.concatenate([push[:1], push, push[-1:]])
            push = np.maximum(push, np.convolve(padded, np.array([0.3, 0.4, 0.3]), mode="valid"))
        out += normal * push[:, None]
    return out


def tube_part(name: str, mesh: Mesh, uv: np.ndarray) -> Any:
    """`tube`·`sphere`·`disc`가 만든 (위치, 삼각형)을 조각으로: 연결 조각마다 감김을 바깥으로 맞추고 UV는 단색 칸 하나."""
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    positions, triangles = mesh
    triangles = fs.orient_closed_components(positions, triangles)
    return fs.Piece(name=name, positions=positions, triangles=triangles, uvs=np.tile(uv, (len(positions), 1)), normals=vertex_normals(positions, triangles))


@dataclass(frozen=True)
class GlassesParams:
    """`build_glasses`와 같은 틀(둥근 사각 테·굵기 1.3 mm·콧날 위 브리지·귀 위 다리). 2026-10-23 수정: v1의 53 × 43 mm 렌즈는 눈 간격 57 mm인 웹툰 얼굴에서
    코 쪽 테가 콧날 옆(x 2~6 mm)에 걸려 −1.1~−2.3 mm 들어갔다 → 47 × 39 mm(같은 비율), 렌즈 중심 1 mm 바깥, 각막 앞 12 mm. `size`·`power`가 형상 키다."""

    rim_rx: float = 0.0235
    rim_ry: float = 0.0195
    center_out: float = 0.001
    front_gap: float = 0.012
    power: float = 2.8
    rim_radius: float = 0.0013
    temple_radius: float = 0.0016
    size: float = 1.0
    nose_pads: bool = True


def forge_glasses(lm: Landmarks, p: GlassesParams) -> AccessoryBuild:
    rx, ry = p.rim_rx * p.size, p.rim_ry * p.size
    z = max(lm.eyes["L"]["front_z"], lm.eyes["R"]["front_z"]) + p.front_gap

    def lens_center(side: str, sign: float, depth: float) -> np.ndarray:
        eye = lm.eyes[side]["center"]
        return np.array([eye[0] + sign * p.center_out, eye[1] - 0.001, depth])
    # 앞 프레임(테·브리지)이 콧날 옆 피부에서 테 굵기 + 0.6 mm 떨어질 때까지 앞으로 민다(v1은 코 옆에서 −1.1~−2.3 mm 들어갔다)
    # 콧날 옆면은 비스듬해서 앞으로 Δz 밀어도 간격이 Δz·n_z만 는다 — 만족할 때까지 되풀이한다
    target = p.rim_radius + 0.0006
    for _ in range(12):
        probe = [superellipse(lens_center(s, g, z), rx, ry, power=p.power) for s, g in (("L", 1.0), ("R", -1.0))]
        d_min = float(head_signed_distance(lm, np.vstack(probe))[0].min())
        if d_min >= target:
            break
        z += max(target - d_min, 0.0002)
    bind, support = "rigid:affine:" + HEAD_JOINT, "info:supportPoints:0.015"
    parts: list[AccPart] = []
    inner_edges, outer_edges, contacts = [], [], []
    for side, sign in (("L", 1.0), ("R", -1.0)):
        eye = lm.eyes[side]["center"]
        center = lens_center(side, sign, z)
        rim = superellipse(center, rx, ry, power=p.power)
        contacts.append(rim)
        parts.append(AccPart(ACC_BODY, bind, tube_part(f"rim-{side}", tube(rim, p.rim_radius, segments=8, closed=True), acc_patch(3).uv(0.5, 0.5)), support))
        inner_edges.append(np.array([center[0] - sign * rx, eye[1] + 0.004, z]))
        outer_edges.append(np.array([center[0] + sign * rx, eye[1] + 0.006, z]))
        ear = lm.ear[side]
        end = np.array([ear["outer_x"] - sign * 0.002, ear["top"][1] - 0.004, ear["mean_z"]])
        control = np.array([end[0], eye[1] + 0.006, z - 0.05])
        temple = push_out_curve(lm, bezier(outer_edges[-1], control, end), p.temple_radius + 0.0004)
        contacts.append(temple[-4:])
        parts.append(AccPart(ACC_ACCENT, bind, tube_part(f"temple-{side}", tube(temple, p.temple_radius, segments=6), acc_patch(4).uv(0.5, 0.5)), support))
        if p.nose_pads:
            # 코 받침: 안쪽 테 아래(코 옆) 작은 타원 판
            pad_center = push_out_curve(lm, np.array([[center[0] - sign * rx * 0.80, eye[1] - ry * 0.55, z - 0.004]] * 3), 0.0014)[1]
            parts.append(AccPart(ACC_ACCENT, bind, ellipsoid_piece(f"pad-{side}", pad_center, np.diag([0.0011, 0.0034, 0.0022]), acc_patch(5).uv(0.5, 0.5), rings=6, segments=10), support))
    bridge_mid = 0.5 * (inner_edges[0] + inner_edges[1]) + np.array([0.0, 0.003, 0.006])
    parts.append(AccPart(ACC_BODY, bind, tube_part("bridge", tube(bezier(inner_edges[0], bridge_mid, inner_edges[1], 12), p.rim_radius, segments=6), acc_patch(3).uv(0.5, 0.5)), support))
    return AccessoryBuild(parts=parts, info={"lensWidthM": 2 * rx, "lensHeightM": 2 * ry, "frameZ": z, "supportPoints": np.vstack(contacts)})


def bake_patches(values: dict[int, float]) -> Callable[[Any, AccessoryBuild], None]:
    def bake(atlas: Any, build: AccessoryBuild) -> None:
        for index, value in values.items():
            r = acc_patch(index)
            atlas.image[r.y : r.y + r.h, r.x : r.x + r.w] = value

    return bake


register_accessory(
    AccessoryDefinition(
        name="glasses",
        build=forge_glasses,
        params=GlassesParams(),
        shape_variants=lambda p: {
            "shape:size:+": replace(p, size=p.size * 1.12),
            "shape:size:-": replace(p, size=p.size * 0.88),
            "shape:round:+": replace(p, power=2.0),
            "shape:round:-": replace(p, power=4.2),
        },
        bake=bake_patches({3: 0.90, 4: 0.88, 5: 0.98}),
        anchors=("face",),
        layer="eyewear",
        vocabulary=True,
        make_v1=True,
        shapes_ko={"size": "렌즈 크기", "round": "테 모양(+ 동그랗게, − 각지게)"},
        changes_ko=(
            "기존 v1 안경(build_glasses)의 틀 — 눈마다 둥근 사각 테·콧날 위 브리지·귀 윗부분에 걸치는 다리 — 을 따르되 v1 테가 콧날 옆으로 −1.1~−2.3 mm 들어가던 것을 "
            "렌즈 47 × 39 mm·각막 앞 12 mm(남는 겹침은 앞으로 조금씩 밀어 0.6 mm 띄움)·다리 중심선 밀어내기로 고쳤고, 코 받침을 더해 테·브리지(accessory)와 "
            "다리·코 받침(accessory-accent)으로 역할을 나눔. 렌즈 크기·테 모양 형상 키. 테·귀 위 접촉점 둘레 정점에 맞춘 아핀으로 눈 간격·코 높이를 따라간다. "
            "외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


@dataclass(frozen=True)
class EarringParams:
    """`build_earrings`와 같은 식(귓볼 스터드 구슬 + 사슬 8마디 + 드롭 구슬)."""

    stud: float = 0.0028
    link_step: float = 0.0015
    links: int = 8
    drop: float = 0.0042


def forge_earrings(lm: Landmarks, p: EarringParams) -> AccessoryBuild:
    parts: list[AccPart] = []
    lobes: dict[str, np.ndarray] = {}
    bind = f"rigid:{HEAD_JOINT}"
    for side, sign in (("L", 1.0), ("R", -1.0)):
        ear = lm.ear[side]
        lobe = ear["bottom"] + np.array([sign * 0.0015, 0.0006, 0.0])
        chain = np.stack([lobe + np.array([0.0, -0.0025 - p.link_step * k, 0.0]) for k in range(p.links)])
        support = f"info:lobe-{side}:0.010"
        lobes[f"lobe-{side}"] = lobe[None, :]
        parts.append(AccPart(ACC_ACCENT, bind, tube_part(f"stud-{side}", sphere(lobe, p.stud), acc_patch(6).uv(0.5, 0.5)), support, side))
        parts.append(AccPart(ACC_BODY, bind, tube_part(f"chain-{side}", tube(chain, 0.00065, segments=6), acc_patch(7).uv(0.5, 0.5)), support, side))
        parts.append(AccPart(ACC_BODY, bind, tube_part(f"drop-{side}", sphere(chain[-1] + np.array([0.0, -p.drop, 0.0]), p.drop), acc_patch(7).uv(0.5, 0.5)), support, side))
    return AccessoryBuild(parts=parts, info={"lengthM": 0.0025 + p.link_step * (p.links - 1) + 2 * p.drop, **lobes})


register_accessory(
    AccessoryDefinition(
        name="earrings",
        build=forge_earrings,
        params=EarringParams(),
        shape_variants=lambda p: {
            "shape:length:+": replace(p, link_step=p.link_step * 1.7),
            "shape:length:-": replace(p, link_step=p.link_step * 0.45),
            "shape:size:+": replace(p, drop=p.drop * 1.35, stud=p.stud * 1.15),
            "shape:size:-": replace(p, drop=p.drop * 0.7, stud=p.stud * 0.85),
        },
        bake=bake_patches({6: 0.97, 7: 0.92}),
        anchors=("ear-l", "ear-r"),
        layer="ear",
        vocabulary=True,
        make_v1=False,
        shapes_ko={"length": "늘어뜨림 길이", "size": "구슬 크기"},
        changes_ko=(
            "기존 v1 귀걸이(build_earrings)와 같은 식(귓볼 스터드 + 사슬 + 드롭 구슬)을 스터드(accessory-accent)와 사슬·드롭(accessory)으로 나누고 길이·크기 형상 키를 더함. "
            "좌우를 따로 귓볼 둘레 정점에 맞춘 닮음 변환으로 귀 크기·각도를 따라간다. 외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


@dataclass(frozen=True)
class ChokerParams:
    """`build_choker`와 같은 식(목 밑동에서 7 cm 위 목 둘레, 폭 9 mm 띠 + 앞 원판). 고리(bail)를 더했다."""

    above: float = CHOKER_ABOVE_CHIN_M
    half_height: float = 0.0045
    pendant: float = 0.0058


NECK_OUTER_PROBE_M = 0.008


def neck_ring_outer(lm: Landmarks, y0: float, cz: float, inner: np.ndarray) -> np.ndarray:
    """높이 y0의 목 둘레 반지름을 안쪽 면(`inner`, 축에서 잰 것) 바깥 8 mm에서 축으로 쏜 광선의 첫 표면으로 잰다(가장 바깥 면).

    몸·머리 메시가 목 이음매에서 몇 mm 겹쳐 축에서 쏜 광선(`Landmarks.neck_ring`)은 안쪽 면(머리 목)만 잰다 — 그대로 두르면 바깥 몸 목 면 안에
    띠가 묻힌다(v1 초커 −2.4 mm). 시작점을 멀리(15 cm) 두면 옆에서 승모근·어깨를 맞혀 띠가 어깨까지 부푼다(2026-10-23 실측 +95 mm)."""
    surface = lm.surface()
    count = len(inner)
    angles = np.linspace(0.0, 2.0 * np.pi, count, endpoint=False)
    directions = np.stack([np.sin(angles), np.zeros(count), np.cos(angles)], axis=1)
    reach = inner + NECK_OUTER_PROBE_M
    origins = np.array([0.0, y0, cz]) + directions * reach[:, None]
    hits, triangle = surface.ray(origins, -directions, NECK_OUTER_PROBE_M + 0.003)
    return np.where(triangle >= 0, reach - np.linalg.norm(hits - origins, axis=1), inner)


def forge_choker(lm: Landmarks, p: ChokerParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs

    y0 = lm.chin_y + p.above
    radius, cz = lm.neck_ring(y0)
    # 띠 위·가운데·아래 높이에서 바깥 면을 재어 방향마다 최댓값(v1은 가운데 높이에서 안쪽 면만 재서 띠가 목 안으로 −2.4 mm 들어갔다)
    for dy in (-p.half_height, 0.0, p.half_height):
        try:
            inner_dy, _ = lm.neck_ring(y0 + dy)
        except ValueError:
            inner_dy = radius
        radius = np.maximum(radius, neck_ring_outer(lm, y0 + dy, cz, inner_dy))
    count = len(radius)
    angles = np.linspace(0.0, 2.0 * np.pi, count, endpoint=False)
    padded = np.concatenate([radius[-1:], radius, radius[:1]])
    neighbours = np.maximum.reduce([padded[:-2], padded[1:-1], padded[2:]])
    radius = 0.5 * (radius + neighbours)
    inner = radius + 0.0006
    outer = radius + 0.0030
    rings = []
    for y_off, r_arr in ((p.half_height, inner), (p.half_height, outer), (-p.half_height, outer), (-p.half_height, inner)):
        rings.append(np.stack([r_arr * np.sin(angles), np.full(count, y0 + y_off), cz + r_arr * np.cos(angles)], axis=1))
    grid = np.stack(rings, axis=1)  # (둘레, 단면 4, 3)
    band = torus_piece("band", grid, fs.Rect(0, 0, 1024, 64), True, True)
    pendant_center = np.array([0.0, y0 - p.half_height - 0.006 - p.pendant + 0.0058, cz + radius[0] + 0.0042])
    pendant = tube_part("pendant", disc(pendant_center, p.pendant, 0.0016), acc_patch(8).uv(0.5, 0.5))
    bail_center = np.array([0.0, (y0 - p.half_height + pendant_center[1] + p.pendant) / 2.0, cz + radius[0] + 0.0036])
    ang = np.linspace(0.0, 2.0 * math.pi, 12, endpoint=False)
    bail_path = bail_center + np.stack([np.zeros(12), 0.0017 * np.sin(ang), 0.0017 * np.cos(ang)], axis=1)
    bail = tube_part("bail", tube(bail_path, 0.00055, segments=6, closed=True), acc_patch(8).uv(0.5, 0.5))
    support = "region:neck,head"
    parts = [AccPart(ACC_BODY, "nearest", band, support), AccPart(ACC_ACCENT, "nearest", pendant, support), AccPart(ACC_ACCENT, "nearest", bail, support)]
    return AccessoryBuild(parts=parts, info={"neckY": y0})


def bake_choker(atlas: Any, build: AccessoryBuild) -> None:
    atlas.bake(_rect((0, 0, 1024, 64)), lambda fu, fv: np.where((np.abs(fv - 0.125) < 0.05) | (np.abs(fv - 0.625) < 0.05), 0.80, 0.93))
    bake_patches({8: 0.97})(atlas, build)


register_accessory(
    AccessoryDefinition(
        name="choker",
        build=forge_choker,
        params=ChokerParams(),
        shape_variants=lambda p: {
            "shape:width:+": replace(p, half_height=p.half_height * 1.6),
            "shape:width:-": replace(p, half_height=p.half_height * 0.6),
            "shape:pendant:+": replace(p, pendant=p.pendant * 1.4),
            "shape:pendant:-": replace(p, pendant=p.pendant * 0.6),
        },
        bake=bake_choker,
        anchors=("neck",),
        layer="neck-inner",
        vocabulary=True,
        make_v1=True,
        conflicts=("top/sailor",),
        shapes_ko={"width": "띠 폭", "pendant": "장식 크기"},
        changes_ko=(
            "기존 v1 초커(build_choker)와 같은 식(목 밑동 7 cm 위 목 둘레를 따르는 폭 9 mm 띠 + 앞 원판)에 원판 고리를 더하고 띠(accessory)·원판·고리(accessory-accent)로 "
            "나눔. 띠 폭·장식 크기 형상 키. 목·머리 정점 최근접 스킨과 표면 델타로 목을 따라간다. 외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 마스크(accessory/mask)


@dataclass(frozen=True)
class MaskParams:
    """주름 마스크: 콧등~턱 아래·볼~볼을 덮는 막(코끝·턱 위로 걸쳐 입술을 따르지 않는다)·가로 주름 셋·귀 고리 끈. 길이 m, 각도 도."""

    top_below_eye: float = 0.021  # 위 가장자리(가운데): 눈 높이 아래
    bottom_below_chin: float = 0.005  # 아래 가장자리(가운데): 턱 끝 아래
    tuck: float = 0.012  # 턱 아래 줄을 목 쪽으로 당기는 최대량
    side_deg: float = 60.0  # 옆 가장자리 각(머리 축 기준)
    gap: float = 0.0025  # 얼굴 위 여유
    thickness: float = 0.0012
    pleat: float = 0.0013  # 주름 단 높이
    cord: float = 0.0009


MASK_OUTER = (0, 0, 512, 512)
MASK_INNER = (512, 0, 512, 512)
MASK_EDGE = (0, 512, 1024, 32)
MASK_CORD = (0, 544, 1024, 32)
MASK_AXIS_Z = 0.035


def face_radius_grid(lm: Landmarks, theta: np.ndarray, heights: np.ndarray) -> np.ndarray:
    """세로축(x 0, z `MASK_AXIS_Z`)에서 각 θ(0 = 정면, + = 캐릭터 왼쪽)·높이 y로, 바깥 25 cm에서 축으로 쏜 광선의 첫 표면까지 반지름(가장 바깥 면)."""
    surface = lm.head_shell().surface
    th, hy = np.meshgrid(theta, heights, indexing="ij")
    directions = np.stack([np.sin(th), np.zeros_like(th), np.cos(th)], axis=-1).reshape(-1, 3)
    axis_points = np.stack([np.zeros(th.size), hy.reshape(-1), np.full(th.size, MASK_AXIS_Z)], axis=1)
    origins = axis_points + directions * 0.25
    hits, triangle = surface.ray(origins, -directions, 0.25)
    radius = np.where(triangle >= 0, 0.25 - np.linalg.norm(hits - origins, axis=1), np.nan).reshape(th.shape)
    return _fill_nan_periodic(radius) if np.isnan(radius).any() else radius


def chin_point(lm: Landmarks) -> np.ndarray:
    """턱 끝: 얼굴 앞쪽(|x| < 1 cm, z > 7 cm) 머리 정점 가운데 가장 낮은 점."""
    head = lm.base.mesh("head_")["tpose_positions"].astype(np.float64)
    front = head[(np.abs(head[:, 0]) < 0.010) & (head[:, 2] > 0.070) & (head[:, 1] < lm.eye_y - 0.04)]
    return front[np.argmin(front[:, 1])]


def build_mask(lm: Landmarks, p: MaskParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    chin = chin_point(lm)
    cols, rows = 33, 17
    side = math.radians(p.side_deg)
    theta = np.linspace(-side, side, cols)
    tn = theta / side
    y_top = lm.eye_y - p.top_below_eye - 0.010 * tn**2
    y_bot = chin[1] - p.bottom_below_chin + 0.034 * tn**2
    v = np.linspace(0.0, 1.0, rows)
    heights = y_top[:, None] + (y_bot - y_top)[:, None] * v[None, :]  # (cols, rows)
    # 높이마다 반지름을 재야 하므로 열마다 따로 질의한다(열 높이가 다르다)
    radius = np.zeros((cols, rows))
    for c in range(cols):
        radius[c] = face_radius_grid(lm, theta[c : c + 1], heights[c])[0]
    required = radius + p.gap
    rho = required.copy()
    for _ in range(80):  # 코끝·턱 위로 걸치는 막: 평활하되 얼굴 + 여유 안으로는 안 들어간다
        padded = np.pad(rho, 1, mode="edge")
        smooth = (padded[:-2, 1:-1] + padded[2:, 1:-1] + padded[1:-1, :-2] + padded[1:-1, 2:]) / 4.0
        rho = np.maximum(rho + 0.6 * (smooth - rho), required)
    # 턱 아래 줄은 목 쪽으로 감아 넣는다(커튼처럼 내려가지 않게)
    under = smooth01(chin[1] + 0.004, chin[1] - 0.010, heights)
    rho = np.maximum(required, rho - p.tuck * under)
    # 가로 주름 셋: 단(아래로 갈수록 0.0 → pleat)이 접혀 생긴 턱
    for centre in (0.36, 0.52, 0.68):
        phase = np.clip((v - (centre - 0.07)) / 0.07, 0.0, 1.0)
        rho += p.pleat * (phase * (v < centre))[None, :] * (1.0 - 0.6 * np.abs(tn))[:, None]
    th = np.broadcast_to(theta[:, None], (cols, rows))
    points = np.stack([rho * np.sin(th), heights, MASK_AXIS_Z + rho * np.cos(th)], axis=-1)  # (cols, rows, 3)
    mid = np.transpose(points, (1, 0, 2))  # (rows, cols, 3): 행 = 위→아래
    tri = fs.grid_triangles(rows, cols, wrap=False)
    normals = vertex_normals(mid.reshape(-1, 3), tri)
    outward = mid.reshape(-1, 3) - np.array([0.0, 0.0, MASK_AXIS_Z]) * np.array([0, 0, 1])
    outward[:, 1] = 0.0
    if float(np.einsum("ij,ij->i", normals, outward).sum()) < 0.0:
        normals = -normals
    sheet = slab_pieces("mask", mid, normals.reshape(rows, cols, 3), p.thickness, _rect(MASK_OUTER), _rect(MASK_INNER), _rect(MASK_EDGE), edge_length=0.5)
    parts = [AccPart(ACC_BODY, "nearest", sheet["top"], "region:head,neck"), AccPart(ACC_BODY, "nearest", sheet["bottom"], "region:head,neck"), AccPart(ACC_BODY, "nearest", sheet["sides"], "region:head,neck")]
    # 귀 고리 끈: 위·아래 모서리에서 귀 뿌리 뒤로 돌아간다
    for side_name, sign, col in (("L", 1.0, cols - 1), ("R", -1.0, 0)):
        ear = lm.ear[side_name]
        top_corner, bottom_corner = mid[0, col], mid[-1, col]
        ear_top = np.array([ear["outer_x"] - sign * 0.004, ear["top"][1] + 0.002, ear["mean_z"] - 0.006])
        ear_back = np.array([ear["outer_x"] - sign * 0.007, 0.5 * (ear["top"][1] + ear["bottom"][1]), ear["mean_z"] - 0.016])
        ear_low = np.array([ear["outer_x"] - sign * 0.006, ear["bottom"][1] + 0.002, ear["mean_z"] - 0.010])
        # 귀 둘레 호(귀 위 → 귀 뒤 → 귀 아래)는 마스크 모서리와 무관하게 먼저 만들고 밀어 둔다 — 한 줄로 만들어 함께 평활·밀어내면 크기 형태 키에서
        # 모서리가 움직일 때 귀 위 점이 귀 윗날 위·앞으로 10 mm 오가 가중치 0.5에서 현이 귓바퀴를 지났다(2026-10-23, 12정점 −1.6 mm).
        # 모서리 → 귀 호 양 끝은 따로 만들고 평활은 그 안에서만 한다
        def segment(points: np.ndarray, count: int) -> np.ndarray:
            t_c = np.linspace(0.0, 1.0, len(points))
            t_s = np.linspace(0.0, 1.0, count)
            return np.stack([np.interp(t_s, t_c, points[:, k]) for k in range(3)], axis=1)

        def relax(curve: np.ndarray) -> np.ndarray:
            """양 끝을 두고 안쪽 점만 이웃 평균 쪽으로(세 번)."""
            out = curve.copy()
            for _ in range(3):
                out[1:-1] = 0.25 * out[:-2] + 0.5 * out[1:-1] + 0.25 * out[2:]
            return out

        # 귀 윗날 앞 위(귀 위 4 mm·앞 1 cm)를 호의 시작점으로 둔다: 모서리에서 귀 위로 바로 가면 끈이 귓바퀴 앞 윗날을 스쳐 밀어내기가 점 하나를
        # 6 mm 들어 올렸다 내렸다 했다
        ear_front = np.array([ear["outer_x"] - sign * 0.004, ear["top"][1] + 0.004, ear["mean_z"] + 0.010])
        ear_arc = push_out_curve(lm, relax(segment(np.vstack([ear_front, ear_top, ear_back, ear_low]), 17)), p.cord + 0.0012)
        front = segment(np.vstack([top_corner, 0.5 * (top_corner + ear_arc[0]) + np.array([0.0, 0.004, 0.0]), ear_arc[0]]), 12)
        back = segment(np.vstack([ear_arc[-1], 0.5 * (ear_arc[-1] + bottom_corner), bottom_corner]), 13)
        front = push_out_curve(lm, relax(front), p.cord + 0.0012)
        back = push_out_curve(lm, relax(back), p.cord + 0.0012)
        path = np.vstack([front[:-1], ear_arc, back[1:]])
        cord = fs.tube_piece(f"loop-{side_name}", path, np.tile(np.array([sign, 0.0, 0.0]), (len(path), 1)), fs.ellipse_profile(p.cord, p.cord, p.cord, 6), False, _rect(MASK_CORD), band_length=0.2)
        parts.append(AccPart(ACC_ACCENT, "nearest", cord, "region:head,neck"))
    return AccessoryBuild(parts=parts, info={"chinY": float(chin[1]), "pleatRows": [0.36, 0.52, 0.68]})


def bake_mask(atlas: Any, build: AccessoryBuild) -> None:
    from character_kit import forge_shoes as fs

    def outer(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        lum = np.full(fu.shape, 0.95)
        for centre in (0.36, 0.52, 0.68):
            lum = np.where(np.abs(fv - centre) < 0.006, 0.70, lum)  # 주름 접힌 선
        hem = (fv < 0.035) | (fv > 0.965) | (fu < 0.025) | (fu > 0.975)
        lum = np.where(hem, 0.88, lum)
        stitch = ((np.abs(fv - 0.045) < 0.004) | (np.abs(fv - 0.955) < 0.004)) & fs.dashes(fu * 160.0, 2.6, 0.6)
        return np.where(stitch, 0.72, lum)

    atlas.bake(_rect(MASK_OUTER), outer)
    atlas.bake(_rect(MASK_INNER), lambda fu, fv: np.full(fu.shape, 0.90))
    atlas.bake(_rect(MASK_EDGE), lambda fu, fv: np.full(fu.shape, 0.86))
    atlas.bake(_rect(MASK_CORD), lambda fu, fv: np.full(fu.shape, 0.94))


register_accessory(
    AccessoryDefinition(
        name="mask",
        build=build_mask,
        params=MaskParams(),
        shape_variants=lambda p: {
            "shape:size:+": replace(p, top_below_eye=p.top_below_eye - 0.004, bottom_below_chin=p.bottom_below_chin + 0.006, side_deg=p.side_deg + 6.0),
            # 작게: 아래 가장자리가 턱 끝 둥근 곳을 따라 움직여 가중치 0.5에서 현이 턱 안으로 1.6 mm 들어갔다 → 아래 변화를 줄이고 여유를 1.5 mm 더한다
            "shape:size:-": replace(p, top_below_eye=p.top_below_eye + 0.005, bottom_below_chin=p.bottom_below_chin - 0.002, side_deg=p.side_deg - 7.0, gap=p.gap + 0.0015),
            "shape:fit:+": replace(p, gap=p.gap + 0.003),
            "shape:fit:-": replace(p, gap=p.gap - 0.0007),
        },
        bake=bake_mask,
        anchors=("face",),
        layer="face-lower",
        morph_groups=("body", "head", "facs"),
        shapes_ko={"size": "덮는 크기", "fit": "얼굴과의 여유"},
        changes_ko=(
            "베이스 얼굴을 세로축 둘레 광선(바깥에서 안으로, 가장 바깥 면)으로 재어 코끝·턱 위로 걸치는 막(얼굴 + 2.5 mm 위로만 평활)을 만들고 가로 주름 셋·가장자리 두께·"
            "귀 뿌리 뒤로 도는 고리 끈을 절차 생성, 주름 선·가장자리 박음질을 상대색 텍스처로 구움. 얼굴 정점 최근접 스킨과 표면 델타(표정 포함)로 턱을 따라간다. "
            "외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 넥타이(accessory/necktie)


@dataclass(frozen=True)
class NecktieParams:
    """교복 넥타이: 칼라 앞 매듭(사다리꼴)·가슴 가운데로 내려가며 넓어지는 날(끝 뾰족). 기본은 셔츠 위(몸 껍질 + 21 mm, forge 상의 실측 12~21 mm). 길이 m."""

    knot_below_neck: float = 0.000  # 매듭 윗면: 목 영역 아래 끝 기준 높이
    length: float = 0.335  # 매듭 아래에서 날 끝까지
    width_top: float = 0.030
    width_end: float = 0.064
    tip: float = 0.026
    offset: float = 0.021  # 몸 앞면(위로만 평활한 껍질)에서 날 아랫면까지(셔츠 두께)
    thickness: float = 0.0016
    knot_height: float = 0.026
    knot_top: float = 0.034
    knot_bottom: float = 0.025
    knot_depth: float = 0.012


TIE_FRONT = (0, 0, 512, 768)
TIE_BACK = (512, 0, 256, 768)
TIE_EDGE = (768, 0, 256, 32)
TIE_KNOT = (768, 64, 256, 256)


def body_front_depth(lm: Landmarks, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """몸(T-포즈) 앞면 z: (x, y) 격자마다 앞 40 cm에서 −z로 쏜 광선의 첫 표면(가장 앞)."""
    surface = lm.surface()
    gx, gy = np.meshgrid(xs, ys, indexing="ij")
    origins = np.stack([gx.reshape(-1), gy.reshape(-1), np.full(gx.size, 0.40)], axis=1)
    hits, triangle = surface.ray(origins, np.tile(np.array([0.0, 0.0, -1.0]), (gx.size, 1)), 0.6)
    z = np.where(triangle >= 0, hits[:, 2], np.nan).reshape(gx.shape)
    return _fill_nan_periodic(z) if np.isnan(z).any() else z


def build_necktie(lm: Landmarks, p: NecktieParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs

    bs_region = lm.base.mesh("body_")
    neck_index = lm.base.region_ids.index("neck")
    body_pos = bs_region["tpose_positions"].astype(np.float64)
    neck_low = float(body_pos[bs_region["region"] == neck_index, 1].min())
    y_knot_top = neck_low + 0.040 + p.knot_below_neck
    y_knot_bottom = y_knot_top - p.knot_height
    rows = 26
    s = np.linspace(0.0, 1.0, rows)
    ys = y_knot_bottom + 0.004 - p.length * s
    cols = 7
    half = 0.5 * (p.width_top + (p.width_end - p.width_top) * smooth01(0.0, 0.9, s))
    across = np.linspace(-1.0, 1.0, cols)
    # 날 아래 몸 앞면: 줄마다 날 폭 안의 가장 앞(가슴 둔덕 위에 평평하게 놓인다), 그다음 아래로는 위로만 평활(배 쪽으로 너무 파고들지 않게)
    sample_x = np.linspace(-0.035, 0.035, 9)
    depth = body_front_depth(lm, sample_x, ys)  # (9, rows)
    row_front = np.array([float(np.max(depth[np.abs(sample_x) <= half[r] + 0.004, r])) for r in range(rows)])
    front = row_front.copy()
    for _ in range(40):
        padded = np.concatenate([front[:1], front, front[-1:]])
        front = np.maximum(front + 0.5 * (0.5 * (padded[:-2] + padded[2:]) - front), row_front)
    z_mid = front + p.offset + p.thickness / 2.0
    # 끝 뾰족: 마지막 tip 구간에서 가장자리 줄이 가운데보다 먼저 끝난다
    tip_s = 1.0 - p.tip / p.length
    grid = np.zeros((rows, cols, 3))
    for r in range(rows):
        for c in range(cols):
            a = across[c]
            s_end = 1.0 - (p.tip / p.length) * abs(a)
            sr = min(s[r], s_end) if s[r] > tip_s else s[r]
            y = y_knot_bottom + 0.004 - p.length * sr
            hw = 0.5 * (p.width_top + (p.width_end - p.width_top) * smooth01(0.0, 0.9, sr))
            grid[r, c] = [a * hw, y, np.interp(y, ys[::-1], z_mid[::-1])]
    normals = np.tile(np.array([0.0, 0.0, 1.0]), (rows, cols, 1))
    blade = slab_pieces("blade", grid, normals, p.thickness, _rect(TIE_FRONT), _rect(TIE_BACK), _rect(TIE_EDGE), edge_length=0.8)
    # 매듭: 위가 넓은 사다리꼴 기둥(앞면이 살짝 볼록), 칼라 가운데
    knot_y = np.linspace(y_knot_bottom, y_knot_top, 4)
    k_front = float(np.max(body_front_depth(lm, np.linspace(-0.016, 0.016, 5), knot_y)))
    knot_rows, knot_cols = 5, 5
    ky = np.linspace(y_knot_top, y_knot_bottom, knot_rows)
    kgrid = np.zeros((knot_rows, knot_cols, 3))
    for r, y in enumerate(ky):
        f = (y_knot_top - y) / p.knot_height
        hw = 0.5 * (p.knot_top + (p.knot_bottom - p.knot_top) * f)
        for c, a in enumerate(np.linspace(-1.0, 1.0, knot_cols)):
            kgrid[r, c] = [a * hw, y, k_front + p.offset + p.knot_depth / 2.0 + 0.002 * (1.0 - a * a)]
    knot = slab_pieces("knot", kgrid, np.tile(np.array([0.0, 0.0, 1.0]), (knot_rows, knot_cols, 1)), p.knot_depth, _rect(TIE_KNOT), _rect(TIE_KNOT), _rect(TIE_EDGE), edge_length=0.3)
    support = "region:torso,neck"
    parts = [AccPart(ACC_BODY, "nearest", blade[k], support) for k in ("top", "bottom", "sides")]
    parts += [AccPart(ACC_ACCENT, "nearest", knot[k], support) for k in ("top", "bottom", "sides")]
    return AccessoryBuild(parts=parts, info={"knotTopY": y_knot_top, "tipY": float(ys[-1]), "lengthM": p.length})


def bake_necktie(atlas: Any, build: AccessoryBuild) -> None:
    """넥타이 상대색: 사선 줄무늬(교복 타이), 가장자리 박음질, 매듭 주름."""
    from character_kit import forge_shoes as fs

    length_mm = float(build.info["lengthM"]) * 1000.0

    def front(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        along = fv * length_mm
        stripe = ((along + fu * 40.0) % 22.0) < 5.0
        lum = np.where(stripe, 0.78, 0.93)
        edge = ((fu < 0.06) | (fu > 0.94)) & fs.dashes(along, 2.6, 0.6)
        return np.where(edge, 0.72, lum)

    atlas.bake(_rect(TIE_FRONT), front)
    atlas.bake(_rect(TIE_BACK), lambda fu, fv: np.full(fu.shape, 0.88))
    atlas.bake(_rect(TIE_EDGE), lambda fu, fv: np.full(fu.shape, 0.86))
    atlas.bake(_rect(TIE_KNOT), lambda fu, fv: np.where((np.abs(fu - 0.3) < 0.03) | (np.abs(fu - 0.7) < 0.03), 0.80, 0.92))


register_accessory(
    AccessoryDefinition(
        name="necktie",
        build=build_necktie,
        params=NecktieParams(),
        shape_variants=lambda p: {
            "shape:length:+": replace(p, length=p.length + 0.06),
            "shape:length:-": replace(p, length=p.length - 0.07),
            "shape:width:+": replace(p, width_end=p.width_end * 1.25, width_top=p.width_top * 1.12),
            "shape:width:-": replace(p, width_end=p.width_end * 0.72, width_top=p.width_top * 0.85),
            "shape:fit:+": replace(p, offset=p.offset + 0.012),
            "shape:fit:-": replace(p, offset=p.offset - 0.017),
        },
        bake=bake_necktie,
        anchors=("neck",),
        layer="over-top",
        conflicts=("top/sailor", "accessory/scarf"),
        shapes_ko={"length": "길이", "width": "날 폭", "fit": "몸과의 간격(− 맨몸, + 블레이저·니트 위)"},
        changes_ko=(
            "베이스 목 아래 끝(칼라 자리)에 사다리꼴 매듭을, 그 아래로 몸 앞면(날 폭 안 가장 앞 점, 위로만 평활 — 가슴 둔덕 위에 평평하게 놓임)에서 셔츠 두께 21 mm "
            "(forge 상의 실측) 떨어진 날을 절차 생성(아래로 넓어지고 끝은 뾰족). 사선 줄무늬·가장자리 박음질·매듭 주름을 상대색 텍스처로 구움. 몸통·목 정점 최근접 "
            "스킨과 표면 델타. 외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 목도리(accessory/scarf)


@dataclass(frozen=True)
class ScarfParams:
    """니트 목도리: 목 밑동을 한 바퀴 감은 두툼한 고리 + 왼쪽 앞으로 늘어진 두 끝(앞이 길다) + 끝 술. 길이 m."""

    wrap_above_neck: float = 0.085  # 고리 중심: 목 영역 아래 끝 위(목 기둥과 승모근이 만나는 높이)
    wrap_height: float = 0.044
    wrap_thickness: float = 0.017
    allowance: float = 0.006  # 셔츠 칼라 등 옷 두께
    tail_x: float = 0.034
    tail_width: float = 0.056
    tail_length: float = 0.25
    tail_thickness: float = 0.0065
    volume: float = 1.0


SCARF_WRAP = (0, 0, 1024, 256)
SCARF_TAIL = (0, 256, 512, 512)
SCARF_TAIL_BACK = (512, 256, 256, 512)
SCARF_EDGE = (768, 256, 256, 32)
SCARF_FRINGE = (768, 320, 256, 64)


def build_scarf(lm: Landmarks, p: ScarfParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs

    body = lm.base.mesh("body_")
    neck_index = lm.base.region_ids.index("neck")
    pos = body["tpose_positions"].astype(np.float64)
    neck_low = float(pos[body["region"] == neck_index, 1].min())
    y_w = neck_low + p.wrap_above_neck
    h = p.wrap_height * p.volume
    th = p.wrap_thickness * p.volume
    count = 48
    cz = None
    for dy in (0.0, 0.02, 0.04, 0.06):  # 목 밑동은 승모근 사이로 광선이 빠지는 높이가 있어 축 z는 조금 위에서 잰다
        try:
            _, cz = lm.neck_ring(y_w + dy)
            break
        except ValueError:
            continue
    if cz is None:
        raise ValueError(f"목도리: y={y_w:.3f} 근처에서 목 축을 찾지 못했다")
    surface = lm.surface()
    angles = np.linspace(0.0, 2.0 * np.pi, count, endpoint=False)
    directions = np.stack([np.sin(angles), np.zeros(count), np.cos(angles)], axis=1)

    # 고리 안쪽 면이 목·승모근 단면을 따른다(깔때기): 방향·높이마다 축에서 쏜 광선의 몸 반지름(어깨·팔은 빼려고 10 cm까지만) + 옷 두께.
    # 단면 하나로 감으면 옆에서 승모근이 고리 높이 안에서 50 → 130 mm로 뛰어 관통하거나(−21 mm), 들어 올리면 턱까지 올라갔다(2026-10-23 실측·렌더)
    samples = 9
    span = np.linspace(-h / 2.0, h / 2.0, samples)
    front_drop = -0.010 * np.maximum(np.cos(angles), 0.0) ** 2
    reach = 0.100
    body_r = np.zeros((count, samples))
    for j, dy in enumerate(span):
        centres = np.stack([np.zeros(count), y_w + dy + front_drop, np.full(count, cz)], axis=1)
        hits, tri = surface.ray(centres, directions, reach)
        inner = np.where(tri >= 0, np.linalg.norm(hits - centres, axis=1), reach)
        origins = centres + directions * (inner + NECK_OUTER_PROBE_M)[:, None]
        hits2, tri2 = surface.ray(origins, -directions, NECK_OUTER_PROBE_M + 0.003)
        outer = np.where(tri2 >= 0, inner + NECK_OUTER_PROBE_M - np.linalg.norm(hits2 - origins, axis=1), inner)  # 이음매 겹침
        body_r[:, j] = np.maximum(inner, outer)
    for j in range(samples - 2, -1, -1):  # 아래로 갈수록 좁아지지 않게(위 → 아래 누적 최댓값)
        body_r[:, j] = np.maximum(body_r[:, j], body_r[:, j + 1])
    for _ in range(6):  # 방위로 평활하되 몸 안으로는 안 들어간다
        smooth = (np.roll(body_r, 1, axis=0) + np.roll(body_r, -1, axis=0) + 2.0 * body_r) / 4.0
        body_r = np.maximum(smooth, body_r)
    inner_r = body_r + p.allowance
    s_profile = np.linspace(-1.0, 1.0, samples)
    thick = th * (0.55 + 0.45 * (1.0 - s_profile**2))
    up = np.array([0.0, 1.0, 0.0])
    loop = []
    for k in range(count):
        heights = y_w + span + front_drop[k]
        inside = [np.array([0.0, heights[j], cz]) + directions[k] * inner_r[k, j] for j in range(samples)]
        outside = [np.array([0.0, heights[j], cz]) + directions[k] * (inner_r[k, j] + thick[j]) for j in range(samples - 1, -1, -1)]
        # 위·아래 모서리를 둥글게: 바깥 끝점을 높이 방향으로 살짝 접는다
        outside[0] = outside[0] - up * th * 0.12
        outside[-1] = outside[-1] + up * th * 0.12
        loop.append(np.vstack(inside + outside))
    grid = np.stack(loop)  # (방위, 단면 2·samples, 3)
    grid = push_out_points(lm, grid, p.allowance * 0.5)  # 승모근 능선이 고리 아래 바깥 테에 닿는 곳(옆·뒤)을 마저 밀어낸다
    path = np.stack([np.array([0.0, y_w + front_drop[k], cz]) + directions[k] * (inner_r[k, samples // 2] + thick[samples // 2] / 2.0) for k in range(count)])
    wrap = torus_piece("wrap", grid, _rect(SCARF_WRAP), True, True)
    support = "region:neck,torso"
    parts = [AccPart(ACC_BODY, "nearest", wrap, support)]
    # 끝 둘: 고리 앞 왼쪽에서 나와 가슴 위로(날 폭 안 가장 앞, 위로만 평활) 늘어진다. 앞 끝이 길고 바깥으로 조금 벌어진다
    rows, cols = 22, 6
    front_ring = float(np.max(path[:, 2]))
    for k, (length_scale, x_shift, lift) in enumerate(((1.0, 0.0, th * 0.55 + p.tail_thickness), (0.84, -0.012, th * 0.35))):
        length = p.tail_length * length_scale
        s = np.linspace(0.0, 1.0, rows)
        ys = y_w - h * 0.30 - length * s
        xs = p.tail_x + x_shift + 0.010 * s
        half = 0.5 * p.tail_width * (1.0 + 0.06 * s)
        sample_x = np.linspace(-0.045, 0.045, 13) + p.tail_x
        depth = body_front_depth(lm, sample_x, ys)
        row_front = np.array([float(np.max(depth[np.abs(sample_x - xs[r]) <= half[r] + 0.004, r])) for r in range(rows)])
        front = row_front.copy()
        for _ in range(40):
            padded1 = np.concatenate([front[:1], front, front[-1:]])
            front = np.maximum(front + 0.5 * (0.5 * (padded1[:-2] + padded1[2:]) - front), row_front)
        z0 = front + p.allowance + lift + p.tail_thickness / 2.0
        z0 = np.maximum(z0, front_ring + lift * 0.3 - 0.02 * s)  # 위쪽은 고리 앞면에서 시작
        grid_t = np.zeros((rows, cols, 3))
        for r in range(rows):
            for c, a in enumerate(np.linspace(-1.0, 1.0, cols)):
                grid_t[r, c] = [xs[r] + a * half[r], ys[r], z0[r] + 0.002 * (1.0 - a * a)]
        grid_t = push_out_points(lm, grid_t, p.allowance * 0.5 + p.tail_thickness / 2.0)
        tail = slab_pieces(f"tail-{k}", grid_t, np.tile(np.array([0.0, 0.0, 1.0]), (rows, cols, 1)), p.tail_thickness, _rect(SCARF_TAIL), _rect(SCARF_TAIL_BACK), _rect(SCARF_EDGE), edge_length=0.6)
        parts += [AccPart(ACC_BODY, "nearest", tail[key], support) for key in ("top", "bottom", "sides")]
        # 술: 끝 가장자리에 7가닥
        for j, a in enumerate(np.linspace(-0.85, 0.85, 7)):
            start = np.array([xs[-1] + a * half[-1], ys[-1] + 0.002, z0[-1]])
            tassel_path = np.stack([start + np.array([0.0, -0.026 * f, 0.0015 * f]) for f in np.linspace(0.0, 1.0, 4)])
            tassel_path = push_out_points(lm, tassel_path, 0.0019 + 0.0012)
            tassel = fs.tube_piece(f"tassel-{k}-{j}", tassel_path, np.tile(np.array([0.0, 0.0, 1.0]), (4, 1)), fs.ellipse_profile(0.0019, 0.0019, 0.0019, 6), False, _rect(SCARF_FRINGE), band_length=0.05)
            parts.append(AccPart(ACC_ACCENT, "nearest", tassel, support))
    return AccessoryBuild(parts=parts, info={"wrapY": y_w, "tailLength": p.tail_length})


def bake_scarf(atlas: Any, build: AccessoryBuild) -> None:
    """목도리 상대색: 골지(세로 골), 끝 쪽 줄무늬 두 줄, 술."""

    def wrap(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        rib = np.abs(((fu * 96.0) % 1.0) - 0.5) > 0.38
        return np.where(rib, 0.80, 0.93)

    def tail(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        rib = np.abs(((fu * 12.0) % 1.0) - 0.5) > 0.38
        lum = np.where(rib, 0.80, 0.93)
        stripe = (np.abs(fv - 0.80) < 0.025) | (np.abs(fv - 0.88) < 0.025)
        return np.where(stripe, 0.70, lum)

    atlas.bake(_rect(SCARF_WRAP), wrap)
    atlas.bake(_rect(SCARF_TAIL), tail)
    atlas.bake(_rect(SCARF_TAIL_BACK), lambda fu, fv: np.full(fu.shape, 0.86))
    atlas.bake(_rect(SCARF_EDGE), lambda fu, fv: np.full(fu.shape, 0.84))
    atlas.bake(_rect(SCARF_FRINGE), lambda fu, fv: np.full(fu.shape, 0.90))


register_accessory(
    AccessoryDefinition(
        name="scarf",
        build=build_scarf,
        params=ScarfParams(),
        shape_variants=lambda p: {
            "shape:volume:+": replace(p, volume=p.volume * 1.28),
            "shape:volume:-": replace(p, volume=p.volume * 0.78),
            "shape:length:+": replace(p, tail_length=p.tail_length + 0.08),
            "shape:length:-": replace(p, tail_length=p.tail_length - 0.08),
        },
        bake=bake_scarf,
        anchors=("neck",),
        layer="over-top",
        conflicts=("accessory/necktie",),
        shapes_ko={"volume": "감은 두께", "length": "늘어진 끝 길이"},
        changes_ko=(
            "베이스 목 밑동 둘레를 높이 다섯 곳에서(안쪽·바깥 면 모두) 재어 그 위로 두툼한 렌즈 단면 고리를 감고, 왼쪽 앞으로 가슴 위(위로만 평활한 몸 앞면 + 옷 두께)를 "
            "따라 늘어진 두 끝(앞이 길다)과 끝 술 7가닥을 절차 생성, 골지·끝 줄무늬를 상대색 텍스처로 구움. 목·몸통 정점 최근접 스킨과 표면 델타. "
            "외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 손목시계(accessory/watch)


@dataclass(frozen=True)
class WatchParams:
    """왼손목 시계: 손목 단면을 따르는 띠·손등 쪽 둥근 케이스(베젤·문자판·용두·러그). 길이 m."""

    above_hand: float = 0.026  # 손 joint에서 팔꿈치 쪽으로
    band_width: float = 0.018
    band_thickness: float = 0.0024
    band_gap: float = 0.0008
    case_radius: float = 0.0155
    case_height: float = 0.0068
    size: float = 1.0
    side: str = "L"


WATCH_BAND = (0, 0, 1024, 128)
WATCH_CASE = (0, 128, 512, 128)
WATCH_DIAL = (512, 128, 256, 256)
WATCH_BEZEL = (0, 256, 512, 64)


def limb_frame(lm: Landmarks, region: str, x_at: float, axis: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """팔다리 단면 중심(그 높이 ±3 mm 영역 정점의 평균)과 축 방향."""
    body = lm.base.mesh("body_")
    pos = body["tpose_positions"].astype(np.float64)
    mask = body["region"] == lm.base.region_ids.index(region)
    along = pos @ axis
    sel = mask & (np.abs(along - x_at) < 0.003)
    return pos[sel].mean(axis=0), axis


def build_watch(lm: Landmarks, p: WatchParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs

    joints = dict(zip(lm.base.joint_names, lm.base.arrays["joint_tpose"].astype(np.float64)))
    sign = 1.0 if p.side == "L" else -1.0
    prefix = "Left" if p.side == "L" else "Right"
    hand = joints[f"mixamorig:{prefix}Hand"]
    fore = joints[f"mixamorig:{prefix}ForeArm"]
    axis = fs.unit(hand - fore)
    x_w = float(hand @ axis) - p.above_hand
    centre, _ = limb_frame(lm, f"forearm.{p.side}", x_w, axis)
    up = fs.unit(np.array([0.0, 1.0, 0.0]) - (np.array([0.0, 1.0, 0.0]) @ axis) * axis)  # 손등(T-포즈 손바닥 아래) 쪽
    side_dir = np.cross(axis, up)
    count = 40
    ang = np.linspace(0.0, 2.0 * np.pi, count, endpoint=False)
    dirs = np.cos(ang)[:, None] * up + np.sin(ang)[:, None] * side_dir
    surface = lm.surface()
    width = p.band_width * p.size ** 0.3
    radius = np.zeros(count)
    for dx in (-width / 2.0, 0.0, width / 2.0):
        c = centre + axis * dx
        origins = c + dirs * 0.06
        hits, tri = surface.ray(origins, -dirs, 0.06)
        r = np.where(tri >= 0, 0.06 - np.linalg.norm(hits - origins, axis=1), np.nan)  # 바깥에서 안으로(가장 바깥 면)
        radius = np.maximum(radius, np.where(np.isnan(r), np.nanmax(r), r))
    padded = np.concatenate([radius[-1:], radius, radius[:1]])
    radius = np.maximum.reduce([padded[:-2], padded[1:-1], padded[2:]])
    inner = radius + p.band_gap
    # 띠: (둘레, 단면 4점) 닫힌 고리 — 단면은 둥근 직사각형(폭 × 두께)
    prof = np.array([[0.0, -width / 2.0], [p.band_thickness, -width / 2.0 * 0.96], [p.band_thickness, width / 2.0 * 0.96], [0.0, width / 2.0]])
    grid = np.stack([np.stack([centre + dirs[k] * (inner[k] + pt[0]) + axis * pt[1] for pt in prof]) for k in range(count)])
    band = torus_piece("band", grid, _rect(WATCH_BAND), True, True)
    # 케이스: 손등 위 띠 바깥면에서 시작하는 둥근 원통(회전체), 베젤 고리, 문자판(살짝 들어감)
    top_r = float(inner[0]) + p.band_thickness
    cr, ch = p.case_radius * p.size, p.case_height * p.size
    base_c = centre + up * (top_r - 0.0008)
    case_prof = np.array([[0.0, 0.0], [0.0, cr * 0.98], [ch * 0.35, cr], [ch * 0.8, cr * 0.99], [ch * 0.86, cr * 0.93], [ch * 0.86, 0.0]])
    parts: list[AccPart] = []
    bind = f"rigid:mixamorig:{prefix}ForeArm"
    support = f"local:0.035"
    parts.append(AccPart(ACC_BODY, bind, band, support))
    parts.append(AccPart(ACC_ACCENT, bind, revolve_piece("case", case_prof, base_c, up, _rect(WATCH_CASE), 28, outward=lambda pts, m=base_c + up * ch * 0.4: pts - m), support))
    bezel_prof = np.array([[ch * 0.84, cr * 0.78], [ch * 0.84, cr * 0.97], [ch * 1.02, cr * 0.95], [ch * 1.02, cr * 0.80]])
    parts.append(AccPart(ACC_ACCENT, bind, revolve_piece("bezel", bezel_prof, base_c, up, _rect(WATCH_BEZEL), 28, closed_profile=True), support))
    dial_prof = np.array([[ch * 0.90, 0.0], [ch * 0.90, cr * 0.80]])
    parts.append(AccPart(ACC_ACCENT, bind, revolve_piece("dial", dial_prof, base_c, up, _rect(WATCH_DIAL), 28, outward=lambda pts, u=up: np.tile(u, (len(pts), 1))), support))
    # 러그(케이스와 띠를 잇는 네 다리)와 용두(손 쪽)
    for s_ax in (-1.0, 1.0):
        for s_side in (-1.0, 1.0):
            # 띠가 손목을 감는 방향(side_dir) 양쪽 케이스 끝에서 띠 폭(axis) 양 끝으로 나온다
            lug_c = base_c + side_dir * s_side * (cr * 0.94) + axis * s_ax * width * 0.36 + up * ch * 0.22
            parts.append(AccPart(ACC_ACCENT, bind, ellipsoid_piece(f"lug-{int(s_ax)}{int(s_side)}", lug_c, np.diag([0.0018, 0.0016, 0.0030]) @ np.vstack([axis, up, side_dir]), acc_patch(9).uv(0.5, 0.5), rings=4, segments=8), support))
    crown_c = base_c + axis * (cr + 0.0016) + up * ch * 0.45
    parts.append(AccPart(ACC_ACCENT, bind, ellipsoid_piece("crown", crown_c, np.diag([0.0018, 0.0016, 0.0016]) @ np.vstack([axis, up, side_dir]), acc_patch(9).uv(0.5, 0.5), rings=4, segments=8), support))
    return AccessoryBuild(parts=parts, info={"wristX": x_w, "bandLength": float(np.linalg.norm(np.diff(np.vstack([grid[:, 0], grid[:1, 0]]), axis=0), axis=1).sum())})


def bake_watch(atlas: Any, build: AccessoryBuild) -> None:
    """시계 상대색: 띠 구멍·박음질, 케이스 테, 문자판 시표(12개, 3·6·9·12는 굵게)와 바늘, 베젤 눈금."""
    from character_kit import forge_shoes as fs

    length_mm = float(build.info["bandLength"]) * 1000.0

    def band(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        lum = np.full(fu.shape, 0.86)
        along = fu * length_mm
        edge = ((np.abs(fv - 0.30) < 0.03) | (np.abs(fv - 0.45) < 0.03)) & fs.dashes(along, 2.2, 0.6)
        lum = np.where(edge, 0.70, lum)
        holes = (np.abs(fv - 0.375) < 0.05) & (np.abs(((along / 6.0) % 1.0) - 0.5) < 0.12) & (fu > 0.55) & (fu < 0.80)
        return np.where(holes, 0.45, lum)

    def dial(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        # fu: 둘레(시계 방향 각), fv: 중심(0) → 가장자리(1)
        lum = np.full(fu.shape, 0.97)
        tick = np.abs(((fu * 12.0) % 1.0) - 0.5) > 0.47
        major = np.abs(((fu * 4.0) % 1.0) - 0.5) > 0.485
        lum = np.where(tick & (fv > 0.78), 0.40, lum)
        lum = np.where(major & (fv > 0.62), 0.30, lum)
        hand_h = (np.abs(fu - 0.12) < 0.012) & (fv < 0.52)
        hand_m = (np.abs(fu - 0.62) < 0.008) & (fv < 0.78)
        return np.where(hand_h | hand_m | (fv < 0.07), 0.25, lum)

    atlas.bake(_rect(WATCH_BAND), band)
    atlas.bake(_rect(WATCH_CASE), lambda fu, fv: np.where(np.abs(fv - 0.5) < 0.04, 0.80, 0.95))
    atlas.bake(_rect(WATCH_DIAL), dial)
    atlas.bake(_rect(WATCH_BEZEL), lambda fu, fv: np.where(np.abs(((fu * 60.0) % 1.0) - 0.5) > 0.44, 0.70, 0.92))
    bake_patches({9: 0.95})(atlas, build)


register_accessory(
    AccessoryDefinition(
        name="watch",
        build=build_watch,
        params=WatchParams(),
        shape_variants=lambda p: {
            "shape:size:+": replace(p, size=p.size * 1.25),
            "shape:size:-": replace(p, size=p.size * 0.80),
            "shape:band:+": replace(p, band_width=p.band_width * 1.35, band_thickness=p.band_thickness * 1.2),
            "shape:band:-": replace(p, band_width=p.band_width * 0.72),
        },
        bake=bake_watch,
        anchors=("wrist-l",),
        layer="wrist",
        morph_groups=("body",),
        regions=("forearm.L", "hand.L"),
        shapes_ko={"size": "케이스 크기", "band": "띠 폭"},
        changes_ko=(
            "베이스 왼팔(손 joint에서 팔꿈치 쪽 26 mm) 단면을 띠 폭 세 곳에서 바깥 광선으로 재어 0.8 mm 띄운 띠, 손등 쪽 둥근 케이스·베젤·문자판·러그 넷·용두를 절차 생성하고 "
            "띠 구멍·박음질·시표·바늘·베젤 눈금을 상대색 텍스처로 구움. 아래팔 joint에 단단히 붙고(손을 굽혀도 팔에 남는다) morph는 손목 둘레 정점에 맞춘 닮음 변환. "
            "외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 피부 껍질(장갑·양말): 몸 메시를 잘라 줄이고 띄운다

_SKIN_SHELL_CACHE: dict[tuple[Any, ...], tuple[np.ndarray, np.ndarray, np.ndarray]] = {}


def skin_shell_base(lm: Landmarks, regions: tuple[str, ...], plane_point: np.ndarray, plane_normal: np.ndarray, target_triangles: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """몸 메시(T-포즈)에서 `regions` 삼각형을 떼어 평면(법선 쪽을 남김)으로 자르고, 자른 가장자리를 고정한 채 `target_triangles`로 줄인다.

    반환: 위치, 삼각형, 가장자리 고리(순서대로 정점 번호). 형상 키 변형이 같은 위상을 쓰도록 결과를 캐시한다(줄이기는 결정적이지만 비싸다)."""
    key = (id(lm.base), regions, tuple(np.round(plane_point, 6)), tuple(np.round(plane_normal, 6)), target_triangles)
    if key in _SKIN_SHELL_CACHE:
        return _SKIN_SHELL_CACHE[key]
    import bmesh
    import bpy

    body = lm.base.mesh("body_")
    pos = body["tpose_positions"].astype(np.float64)
    tri = body["triangles"].astype(np.int64)
    wanted = np.isin(body["region"], [lm.base.region_ids.index(r) for r in regions])
    keep = wanted[tri].all(axis=1)
    sub = tri[keep]
    used = np.unique(sub)
    remap = -np.ones(len(pos), dtype=np.int64)
    remap[used] = np.arange(len(used))
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in pos[used].tolist()]
    for a, b, c in remap[sub].tolist():
        try:
            bm.faces.new((verts[a], verts[b], verts[c]))
        except ValueError:
            pass
    # 몸 메시는 UV 이음매에서 정점이 갈라져 있다 — 합치지 않으면 '가장 큰 연결 조각'이 UV 섬 하나(손등 등)만 남긴다(2026-10-23 손가락이 통째로 빠졌다)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bm.verts.ensure_lookup_table()
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=tuple(plane_point), plane_no=tuple(plane_normal), clear_inner=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # 가장 큰 연결 조각만 남긴다
    bm.verts.ensure_lookup_table()
    seen: set[int] = set()
    best: list[Any] = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        if len(comp) > len(best):
            best = comp
    best_ids = {v.index for v in best}
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in best_ids], context="VERTS")
    mesh = bpy.data.meshes.new("skin_shell")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("skin_shell", mesh)
    bpy.context.scene.collection.objects.link(obj)
    # 자른 가장자리 정점은 줄이기에서 빼서(가중치 0) 고리가 평면 위에 그대로 남게 한다
    group = obj.vertex_groups.new(name="interior")
    edge_count: dict[tuple[int, int], int] = {}
    for poly in mesh.polygons:
        vs = list(poly.vertices)
        for i in range(len(vs)):
            e = tuple(sorted((vs[i], vs[(i + 1) % len(vs)])))
            edge_count[e] = edge_count.get(e, 0) + 1
    boundary = {v for e, n in edge_count.items() if n == 1 for v in e}
    group.add([v.index for v in mesh.vertices if v.index not in boundary], 1.0, "REPLACE")
    modifier = obj.modifiers.new("decimate", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = min(1.0, target_triangles / max(len(mesh.polygons), 1))
    modifier.vertex_group = "interior"
    modifier.use_collapse_triangulate = True
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    out = evaluated.to_mesh()
    positions = np.array([v.co[:] for v in out.vertices], dtype=np.float64)
    triangles = np.array([list(p.vertices) for p in out.polygons], dtype=np.int64)
    evaluated.to_mesh_clear()
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(mesh)
    result = (positions, triangles, boundary_loop(triangles))
    _SKIN_SHELL_CACHE[key] = result
    return result


def boundary_loop(triangles: np.ndarray) -> np.ndarray:
    """열린 메시의 가장자리 고리 하나(이웃을 따라 순서대로 정점 번호). 가장자리가 없으면 빈 배열."""
    edge_count: dict[tuple[int, int], int] = {}
    for a, b, c in np.asarray(triangles).tolist():
        for e in ((a, b), (b, c), (c, a)):
            k = (min(e), max(e))
            edge_count[k] = edge_count.get(k, 0) + 1
    adjacency: dict[int, list[int]] = {}
    for (a, b), n in edge_count.items():
        if n == 1:
            adjacency.setdefault(a, []).append(b)
            adjacency.setdefault(b, []).append(a)
    loop: list[int] = []
    if adjacency:
        start = next(iter(adjacency))
        prev, cur = -1, start
        while True:
            loop.append(cur)
            nxt = [v for v in adjacency[cur] if v != prev]
            if not nxt or nxt[0] == start:
                break
            prev, cur = cur, nxt[0]
            if len(loop) > len(adjacency):
                break
    return np.array(loop, dtype=np.int64)


def offset_shell(lm: Landmarks, positions: np.ndarray, triangles: np.ndarray, offset: float, iterations: int = 4) -> tuple[np.ndarray, np.ndarray]:
    """줄인 피부 정점을 원래 몸 표면에서 정확히 `offset`(바깥)이 되게 옮긴 위치와 그 법선.

    줄이기는 볼록한 곳(손가락 끝·마디·복사뼈)을 깎아 안쪽으로 들어가므로 법선 방향으로 같은 양만 띄우면 껍질이 피부 안에 남는다(2026-10-23 장갑 176정점 −2.9 mm).
    부호 거리로 정점마다 목표까지 밀거나 당긴다(오목한 곳에서 너무 뜨지도 않게)."""
    from character_kit.surface import vertex_normals

    out = np.asarray(positions, dtype=np.float64).copy()
    out += vertex_normals(out, triangles) * offset
    for _ in range(iterations):
        d, normal = body_signed_distance(lm, out)
        out += normal * (offset - d)[:, None]
    return out, vertex_normals(out, triangles)


# ---------------------------------------------------------------- 장갑(accessory/gloves)


GLOVE_BASE_THICKNESS = 0.0012  # 기본 껍질을 몸에서 띄우는 거리(형태 키 fit은 이 껍질의 법선으로 더하고 뺀다)


@dataclass(frozen=True)
class GloveParams:
    """양손 장갑: 손 피부(+손목 위 3.2 cm)를 띄운 껍질 + 말린 소매 끝. 길이 m."""

    cuff_above_wrist: float = 0.032
    thickness: float = 0.0012
    cuff_radius: float = 0.0024
    target_triangles: int = 2250


def build_gloves(lm: Landmarks, p: GloveParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    joints = dict(zip(lm.base.joint_names, lm.base.arrays["joint_tpose"].astype(np.float64)))
    parts: list[AccPart] = []
    for side, prefix in (("L", "Left"), ("R", "Right")):
        hand = joints[f"mixamorig:{prefix}Hand"]
        fore = joints[f"mixamorig:{prefix}ForeArm"]
        axis = fs.unit(hand - fore)
        plane_point = hand - axis * p.cuff_above_wrist
        positions, triangles, loop = skin_shell_base(lm, (f"hand.{side}", f"forearm.{side}"), plane_point, axis, p.target_triangles)
        shell, normals = offset_shell(lm, positions, triangles, GLOVE_BASE_THICKNESS)  # 몸 메시 감김(바깥)을 자르기·줄이기가 그대로 지킨다
        # 손끝 UV 이음매 정점 하나를 빌드 보고서의 간격 척도(용접하지 않은 몸 + 평활 법선)는 −0.4 mm로, 용접한 몸 척도는 +1.2 mm로 쟀다(2026-10-23 시험)
        # — 두 척도 모두에서 밖이 되게 민다
        shell = push_out_points(lm, shell, 0.5 * GLOVE_BASE_THICKNESS)
        shell = push_out_report_metric(lm, shell, 0.4 * GLOVE_BASE_THICKNESS, directions=vertex_normals(shell, triangles))
        # 두께(shape:fit)는 기본 껍질 법선으로만 옮긴다: 두께마다 부호 거리 투영을 다시 하면 손끝 정점이 옆으로 2.8 mm 미끄러져 가중치 0.5에서 손가락 안을 지났다.
        # 손가락 사이 주름에서는 법선이 옆 손가락을 향해 두꺼워질수록 가까워진다(남 −0.9 mm) — 그런 정점은 움직이지 않는다(천이 주름에 몰린다)
        delta = p.thickness - GLOVE_BASE_THICKNESS
        if abs(delta) > 1e-9:
            base_n = vertex_normals(shell, triangles)
            moved = shell + base_n * delta
            d0 = report_metric_distance(lm, shell)
            d1 = report_metric_distance(lm, moved)
            keep = (d1 < d0 + 0.5 * delta) if delta > 0 else (d1 < 0.4 * GLOVE_BASE_THICKNESS)
            shell = np.where(keep[:, None], shell, moved)
        normals = vertex_normals(shell, triangles)
        piece = fs.Piece(name=f"glove-{side}", positions=shell, triangles=triangles, uvs=acc_patch_uv(10, len(shell)), normals=normals)
        support = f"region:hand.{side},forearm.{side}"
        parts.append(AccPart(ACC_BODY, "nearest", piece, support))
        if len(loop) > 8:
            ring = shell[loop]
            centre = ring.mean(axis=0)
            radial = fs.unit(ring - centre - np.einsum("ij,j->i", ring - centre, axis)[:, None] * axis)
            path = ring + radial * (p.cuff_radius + 0.0003)
            step = max(1, len(path) // 32)
            path = path[::step]
            radial = radial[::step]
            cuff = fs.tube_piece(f"cuff-{side}", path, radial, fs.ellipse_profile(p.cuff_radius, p.cuff_radius, p.cuff_radius * 1.6, 8), True, None, uv=acc_patch(11).uv(0.5, 0.5))
            parts.append(AccPart(ACC_ACCENT, "nearest", cuff, support))
    return AccessoryBuild(parts=parts, info={"cuffAboveWristM": p.cuff_above_wrist})


register_accessory(
    AccessoryDefinition(
        name="gloves",
        build=build_gloves,
        params=GloveParams(),
        shape_variants=lambda p: {
            "shape:fit:+": replace(p, thickness=p.thickness + 0.0012),
            "shape:fit:-": replace(p, thickness=p.thickness - 0.0004),
            "shape:cuff:+": replace(p, cuff_radius=p.cuff_radius * 1.7),
            "shape:cuff:-": replace(p, cuff_radius=p.cuff_radius * 0.6),
        },
        bake=bake_patches({10: 0.92, 11: 0.86}),
        anchors=("hand-l", "hand-r"),
        layer="hand",
        morph_groups=("body",),
        regions=("hand.L", "hand.R", "forearm.L", "forearm.R"),
        hide_regions=("hand.L", "hand.R"),
        conflicts=("accessory/watch",),
        shapes_ko={"fit": "두께", "cuff": "소매 끝 두께"},
        changes_ko=(
            "베이스 손 피부(UV 이음매 정점을 합친 뒤 손목 위 3.2 cm에서 평면으로 자름)를 가장자리를 고정한 채 손당 약 2,250 삼각형으로 줄이고, 원래 피부에서 정확히 "
            "1.2 mm(부호 거리로 정점마다 맞춤) 떨어진 껍질과 말린 소매 끝을 절차 생성. "
            "손·아래팔 정점 최근접 스킨과 표면 델타로 손가락 관절을 따라간다(손을 숨긴다). 외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 무릎 양말(accessory/knee-socks)


@dataclass(frozen=True)
class SockParams:
    """무릎 아래까지 오는 양말: 높이 고리마다 평면 볼록 다각형으로 발·종아리를 감싼 관 + 평평한 발바닥 + 윗단 골지 띠. 길이 m.

    길이(발목 양말·무릎 위)는 형상 키로 주지 않는다: 몸에 붙은 천을 위아래로 미는 선형 보간은 종아리 볼록한 곳을 가로질러
    중간 값에서 피부 안으로 들어간다(2026-10-23 계측·렌더). 길이가 다른 양말은 따로 만든 부품이 맞다."""

    top_y: float = 0.40  # 윗단 높이: 무릎 관절(0.451) 5 cm 아래
    thickness: float = 0.0010  # 양말 면의 피부 위 거리(shape:fit)
    band: float = 0.022  # 골지 띠 높이(shape:cuff)
    band_thickness: float = 0.0012


SOCK_LAST_CLEARANCE = 0.0010  # 양말 골: 피부 정점을 법선으로 띄우는 거리
SOCK_PLANTAR_CLEARANCE = 0.0004  # 발바닥(법선 아래향)은 덜 띄운다 — 바닥에서 뜨지 않게, 신발 깔창 아래로 덜 나가게
SOCK_COLUMNS = 36  # 고리마다 둘레 점 수(뒤꿈치 쪽에서 시작해 같은 호 길이)
SOCK_FOOT_ROW = 0.005  # 발 높이(~0.09 m) 고리 간격: 발가락 윗면·발등 경사를 따라간다
SOCK_LEG_ROW = 0.030  # 다리 고리 최대 간격 — 발목에서 1.35배씩 늘려 간다(5 mm → 3 cm로 바로 뛰면 발목 앞에 가로 줄이 보였다)
SOCK_SOLE_BEVEL = (0.0020, 0.0006)  # 바닥 테 두 고리(바닥, 1.5 mm 위)를 안으로 들이는 양: 발끝·옆 아래 모서리를 둥글린다(발은 숨는다)
SOCK_SLAB_SPREAD = 0.75  # 고리마다 위아래 (간격 × 이 값) 안의 점으로 평면 볼록 다각형을 만든다(고리 사이 굴곡을 덮는다)
SOCK_CAP_RINGS = 3
SOCK_FOOT_TOP_Y = 0.088  # 발 영역(0~0.087 m) 위 = 종아리: 피부가 그려지는 곳이라 거리를 지킨다(발은 hides로 숨는다)
_SOCK_CACHE: dict[tuple[Any, ...], tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = {}


def _hull_2d(points: np.ndarray) -> np.ndarray:
    """평면 점들의 볼록 다각형(앤드루 단조 사슬, 반시계)."""
    pts = np.unique(np.round(np.asarray(points, dtype=np.float64), 7), axis=0)
    if len(pts) < 3:
        return pts

    def turn(o: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
        return float((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]))

    lower: list[np.ndarray] = []
    for q in pts:
        while len(lower) >= 2 and turn(lower[-2], lower[-1], q) <= 0.0:
            lower.pop()
        lower.append(q)
    upper: list[np.ndarray] = []
    for q in pts[::-1]:
        while len(upper) >= 2 and turn(upper[-2], upper[-1], q) <= 0.0:
            upper.pop()
        upper.append(q)
    return np.array(lower[:-1] + upper[:-1])


def _ring_samples(poly: np.ndarray, back: np.ndarray, count: int) -> np.ndarray:
    """볼록 다각형 둘레를, 중심에서 `back` 방향 광선이 둘레와 만나는 점부터 같은 호 길이로 `count`점(반시계) 고른다 — 고리마다 열이 같은 쪽에서 시작한다."""
    from character_kit import forge_shoes as fs

    centre = poly.mean(axis=0)
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        e = b - a
        m = np.array([[back[0], -e[0]], [back[1], -e[1]]])
        if abs(np.linalg.det(m)) < 1e-14:
            continue
        t_ray, s_edge = np.linalg.solve(m, a - centre)
        if t_ray > 0.0 and -1e-9 <= s_edge <= 1.0 + 1e-9:
            start = a + min(max(s_edge, 0.0), 1.0) * e
            path = np.vstack([start[None], np.roll(poly, -(i + 1), axis=0)])
            return fs.resample_polyline(path, count, closed=True)
    raise ValueError("양말 고리: 뒤쪽 광선이 다각형과 만나지 않았다")


def sock_loft(lm: Landmarks, side: str, top_y: float) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """양말 면: 높이 고리마다 (피부를 띄운 점의) 평면 볼록 다각형을 뒤꿈치 쪽부터 같은 호 길이로 고르고 이어 붙인 관 + 평평한 발바닥 덮개.

    고리 하나가 그 높이 띠의 볼록 다각형이라 발가락 사이 골은 건너고(양말은 발가락을 하나하나 감싸지 않는다), 높이 방향 굴곡(발등·발목 앞·종아리)은
    고리 간격(발 5 mm, 다리 3 cm)으로 따라간다. 이전 시도: 피부를 띄운 뒤 평활로 골을 건너게 하면 촘촘한 메시가 골 안으로 감겨 발가락 위가 찢어졌고
    (2026-10-23 렌더 여섯 번), 높이 띠 볼록 껍질 여럿을 복셀 리메시로 합치면 종아리에서 겹친 껍질 면이 안쪽 면으로 남아 조각이 튀어나왔다(−45 mm).
    반환: 고리 격자 (R, K, 3), 위치, 삼각형, 윗단 고리 정점 번호. 형상 키 변형이 같은 위상을 쓰도록 캐시한다."""
    key = (id(lm.base), side, round(top_y, 6))
    if key in _SOCK_CACHE:
        return _SOCK_CACHE[key]
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    body = lm.base.mesh("body_")
    pos = body["tpose_positions"].astype(np.float64)
    nrm = fs.unit(body["normals"].astype(np.float64))
    mask = np.isin(body["region"], [lm.base.region_ids.index(f"{r}.{side}") for r in ("foot", "calf", "thigh")])
    pts, nr = pos[mask], nrm[mask]
    keep = pts[:, 1] <= top_y + 0.04
    pts, nr = pts[keep], nr[keep]
    dilated = pts + nr * np.where(nr[:, 1] < -0.6, SOCK_PLANTAR_CLEARANCE, SOCK_LAST_CLEARANCE)[:, None]
    frame = fs.measure_foot(lm.base, side)
    back = -np.array([frame.forward[0], frame.forward[2]])
    y_min = float(dilated[:, 1].min())
    heights = [y_min, y_min + 0.0015]
    y, step = y_min + SOCK_FOOT_ROW, SOCK_FOOT_ROW
    while y < top_y - 0.5 * step:
        heights.append(y)
        if y >= 0.085:
            step = min(step * 1.35, SOCK_LEG_ROW)
        y += step
    rows = np.array(heights + [top_y])
    if rows[-1] - rows[-2] < 0.4 * step:  # 마지막 간격이 너무 짧으면 앞 고리를 뺀다
        rows = np.delete(rows, -2)
    spacing = np.maximum(np.diff(np.concatenate([[rows[0]], rows])), np.diff(np.concatenate([rows, [rows[-1]]])))
    spacing[:2] = SOCK_FOOT_ROW
    count = SOCK_COLUMNS
    grid = np.empty((len(rows), count, 3))
    for r, y in enumerate(rows):
        # 맨 아래 고리(발바닥 테)는 위로 두 배 넓게 모은다 — 닿는 면 윤곽만 쓰면 다음 고리까지 벽이 바깥으로 기울어 발가락 끝 아래·발 옆 아랫면이
        # 그 비탈을 뚫었다(2026-10-23 렌더)
        sole = r < 2
        lo = y_min if sole else y - SOCK_SLAB_SPREAD * spacing[r]
        hi = y_min + 2.0 * SOCK_SLAB_SPREAD * SOCK_FOOT_ROW if sole else y + SOCK_SLAB_SPREAD * spacing[r]
        sel = dilated[(dilated[:, 1] >= lo) & (dilated[:, 1] <= hi)]
        poly = _hull_2d(sel[:, [0, 2]])
        if sole:
            centre2 = poly.mean(axis=0)
            inset = SOCK_SOLE_BEVEL[r]
            poly = poly - inset * (poly - centre2) / np.maximum(np.linalg.norm(poly - centre2, axis=1, keepdims=True), 1e-9)
        ring = _ring_samples(poly, back, count)
        grid[r] = np.stack([ring[:, 0], np.full(count, y), ring[:, 1]], axis=1)
    # 둘레·높이 방향 가벼운 평활(수평 성분만 — 고리는 제 높이 평면에 남는다)
    for _ in range(3):
        around = 0.5 * (np.roll(grid, 1, axis=1) + np.roll(grid, -1, axis=1))
        grid[:, :, [0, 2]] += 0.35 * (around - grid)[:, :, [0, 2]]
        along = 0.5 * (grid[:-2] + grid[2:])
        grid[1:-1, :, [0, 2]] += 0.25 * (along - grid[1:-1])[:, :, [0, 2]]
    side_tris = fs.grid_triangles(len(rows), count, wrap=True)
    # 발바닥 덮개: 맨 아래 고리를 바깥 고리로 쓰는 동심 고리 + 부채꼴(바닥 평면)
    outer = grid[0]
    centre = outer.mean(axis=0)
    inner = [centre + (1.0 - k / SOCK_CAP_RINGS) * (outer - centre) for k in range(1, SOCK_CAP_RINGS)]
    positions = np.vstack([grid.reshape(-1, 3), *inner, centre[None]])
    cap_index = [np.arange(count)] + [len(rows) * count + (k - 1) * count + np.arange(count) for k in range(1, SOCK_CAP_RINGS)]
    centre_index = len(positions) - 1
    cap_tris = []
    for a_ring, b_ring in zip(cap_index[:-1], cap_index[1:]):
        for i in range(count):
            j = (i + 1) % count
            cap_tris += [[a_ring[i], a_ring[j], b_ring[j]], [a_ring[i], b_ring[j], b_ring[i]]]
    for i in range(count):
        cap_tris.append([cap_index[-1][i], cap_index[-1][(i + 1) % count], centre_index])
    cap_tris = np.array(cap_tris, dtype=np.int64)
    # 감김: 옆면은 고리 중심에서 바깥, 덮개는 아래
    a, b, c = (positions[side_tris[:, k]] for k in range(3))
    row_centre = grid.mean(axis=1)[np.minimum(side_tris[:, 0] // count, len(rows) - 1)]
    outward = a - row_centre
    outward[:, 1] = 0.0
    if np.einsum("ij,ij->i", np.cross(b - a, c - a), outward).sum() < 0:
        side_tris = side_tris[:, [0, 2, 1]]
    a, b, c = (positions[cap_tris[:, k]] for k in range(3))
    if np.cross(b - a, c - a)[:, 1].sum() > 0:
        cap_tris = cap_tris[:, [0, 2, 1]]
    triangles = np.vstack([side_tris, cap_tris])
    # 평활로 볼록한 곳이 조금 들어간다 — 골 여유의 80%까지 매끈한 관 법선으로 민다(윗단·바닥 고리는 높이를 지킨다)
    flat_rows = np.zeros(len(positions), dtype=bool)
    flat_rows[: count] = True
    flat_rows[(len(rows) - 1) * count : len(rows) * count] = True
    flat_rows[len(rows) * count :] = True
    for _ in range(6):
        normals = vertex_normals(positions, triangles)
        d, _ = body_signed_distance(lm, positions)
        push = np.maximum(0.8 * SOCK_LAST_CLEARANCE - d, 0.0)
        # 삼각형 안쪽(정점 사이)도 잰다: 무게중심이 여유의 절반보다 가까우면 세 정점을 모자란 만큼 민다
        dc, _ = body_signed_distance(lm, positions[triangles].mean(axis=1))
        deficit = np.maximum(0.5 * SOCK_LAST_CLEARANCE - dc, 0.0)
        for k in range(3):
            np.maximum.at(push, triangles[:, k], deficit)
        push = np.minimum(push, 0.004)  # 한 번에 4 mm 넘게 밀지 않는다(최근접 피부 판정이 틀린 점이 튀지 않게)
        if not (push > 1e-7).any():
            break
        move = normals * push[:, None]
        move[flat_rows, 1] = 0.0
        positions = positions + move
    top_loop = (len(rows) - 1) * count + np.arange(count)
    result = (positions[: len(rows) * count].reshape(len(rows), count, 3), positions, triangles, top_loop)
    _SOCK_CACHE[key] = result
    return result


def _sock_clearance(lm: Landmarks, positions: np.ndarray, triangles: np.ndarray, minimum: float, iterations: int = 4) -> np.ndarray:
    """종아리(발 영역 위) 정점과 삼각형 무게중심이 피부에서 `minimum` 넘게 떨어지도록 양말 법선(매끈한 골에서 온 것)으로 민다.

    피부 법선으로 밀면 발가락 골 위 점이 옆 발가락 옆면 법선으로 옆으로 밀려 찢어졌다(2026-10-23) — 발은 숨기므로 재지 않는다."""
    from character_kit.surface import vertex_normals

    out = positions.copy()
    calf = out[:, 1] > SOCK_FOOT_TOP_Y
    for _ in range(iterations):
        normals = vertex_normals(out, triangles)
        d, _ = body_signed_distance(lm, out)
        push = np.where(calf, np.maximum(minimum - d, 0.0), 0.0)
        centroid = out[triangles].mean(axis=1)
        dc, _ = body_signed_distance(lm, centroid)
        deficit = np.where(centroid[:, 1] > SOCK_FOOT_TOP_Y, np.maximum(0.6 * minimum - dc, 0.0), 0.0)
        tri_push = np.zeros(len(out))
        for k in range(3):
            np.maximum.at(tri_push, triangles[:, k], deficit)
        push = np.maximum(push, tri_push)
        if not (push > 1e-7).any():
            break
        out += normals * push[:, None]
    return out


def build_socks(lm: Landmarks, p: SockParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    parts: list[AccPart] = []
    info: dict[str, Any] = {"topY": p.top_y}
    for side in ("L", "R"):
        grid, positions, triangles, top_loop = sock_loft(lm, side, p.top_y)
        shell = positions + vertex_normals(positions, triangles) * (p.thickness - SOCK_LAST_CLEARANCE)
        shell = _sock_clearance(lm, shell, triangles, 0.75 * p.thickness)
        normals = vertex_normals(shell, triangles)
        support = f"region:foot.{side},calf.{side},thigh.{side}"
        parts.append(AccPart(ACC_BODY, "nearest", fs.Piece(name=f"sock-{side}", positions=shell, triangles=triangles, uvs=acc_patch_uv(12, len(shell)), normals=normals), support))
        # 윗단 골지 띠: 윗단 고리와, 열마다 band 아래 높이를 고리 사이 보간한 점(양말 면 위) 사이를 둥근 단면으로 감싼다
        rows, count = grid.shape[0], grid.shape[1]
        shell_grid = shell[: rows * count].reshape(rows, count, 3)
        ring = shell_grid[-1]
        target = p.top_y - p.band
        lower = np.empty_like(ring)
        for j in range(count):
            column = shell_grid[:, j]
            lower[j] = [np.interp(target, column[:, 1], column[:, k]) for k in range(3)]
        up = np.array([0.0, 1.0, 0.0])

        def radial_of(points: np.ndarray) -> np.ndarray:
            r = points - points.mean(axis=0)
            r[:, 1] = 0.0
            return fs.unit(r)

        top_n, low_n = radial_of(ring), radial_of(lower)
        gap, bt = 0.0003, p.band_thickness
        prof = [
            ring + top_n * -0.0002 + up * 0.0005,  # 안쪽 윗날: 양말 가장자리를 덮는다
            ring + top_n * (0.55 * bt) + up * 0.0011,
            ring + top_n * bt + up * 0.0002,
            lower + low_n * (bt + gap),
            lower + low_n * (0.45 * bt + gap) - up * 0.0005,
            lower + low_n * gap,
        ]
        grid_band = np.stack(prof, axis=1)  # (고리, 단면, 3)
        parts.append(AccPart(ACC_ACCENT, "nearest", torus_piece(f"band-{side}", grid_band, _rect((0, 0, 1024, 64)), True, True), support))
        info[f"rows{side}"] = int(rows)
    return AccessoryBuild(parts=parts, info=info)


def bake_socks(atlas: Any, build: AccessoryBuild) -> None:
    atlas.bake(_rect((0, 0, 1024, 64)), lambda fu, fv: np.where(np.abs(((fu * 120.0) % 1.0) - 0.5) > 0.36, 0.80, 0.93))
    bake_patches({12: 0.93})(atlas, build)


register_accessory(
    AccessoryDefinition(
        name="knee-socks",
        build=build_socks,
        params=SockParams(),
        shape_variants=lambda p: {
            "shape:fit:+": replace(p, thickness=p.thickness + 0.0012),
            "shape:fit:-": replace(p, thickness=p.thickness - 0.0004),
            "shape:cuff:+": replace(p, band=0.034, band_thickness=0.0016),
            "shape:cuff:-": replace(p, band=0.012, band_thickness=0.0009),
        },
        bake=bake_socks,
        anchors=("foot-l", "foot-r"),
        layer="legwear",
        morph_groups=("body",),
        regions=("foot.L", "foot.R", "calf.L", "calf.R"),
        hide_regions=("foot.L", "foot.R"),
        conflicts=("shoes/sandals",),
        shapes_ko={"fit": "두께", "cuff": "윗단 띠 높이"},
        changes_ko=(
            "베이스 발·종아리 피부 정점을 1 mm(발바닥 0.4 mm) 띄우고 높이 고리(발 5 mm·다리 3 cm 간격)마다 평면 볼록 다각형을 뒤꿈치 쪽부터 36점으로 골라 "
            "이은 관(발가락 사이는 건너고 발등·발목·종아리 굴곡은 따른다) + 평평한 발바닥 + 무릎 관절 5 cm 아래 둥근 윗단 골지 띠를 절차 생성. "
            "발·종아리 정점 최근접 스킨과 표면 델타(발은 숨긴다). 외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 의상 위에 메는 소품(허리 가방·백팩) 공용

GARMENT_STANDOFF_M: dict[str, dict[str, dict[str, Any]]] = {
    # 부위 → 베이스 → 층 → 몸 표면에서 그 층 의상 겉면까지의 최댓값(m). forge 의상(out5/garments/layered, 2026-10-23 21:40)을 몸 법선 광선으로 잰 값
    # (scratchpad acc/garment_standoff.py). 허리는 높이별 표 [(y, m)]: 둘레 16방위 최댓값, 0.94는 밑단(상의가 밖으로 말린다) — 상의 위 주머니 아래쪽이
    # 허리 값만 쓰면 티셔츠 밑단에 1.9~3.8 mm 묻혔다(2026-10-23 계측). bottom = 하의 허리(맨몸 + 하의, shape:fit:−).
    # 등 = x 0~0.12·y 1.04~1.34(어깨뼈·엉덩이 위 — 허리 오목은 가방이 건넌다), 멜빵 = 어깨 위·가슴 앞(x 0.07~0.11, y 1.18~1.40), 옆 = 겨드랑이 아래 y 1.08~1.10.
    "waist": {
        "female": {
            "bottom": [(0.94, 0.0368), (0.97, 0.0125), (0.99, 0.0081), (1.01, 0.0076), (1.06, 0.0076)],
            "top": [(0.94, 0.0423), (0.97, 0.0244), (0.99, 0.0232), (1.01, 0.0203), (1.03, 0.0193), (1.06, 0.0193)],
            "outer": [(0.94, 0.0489), (0.97, 0.0349), (0.99, 0.0350), (1.01, 0.0342), (1.03, 0.0377), (1.06, 0.0377)],
        },
        "male": {
            "bottom": [(0.94, 0.0439), (0.97, 0.0299), (0.99, 0.0276), (1.01, 0.0188), (1.03, 0.0122), (1.06, 0.0122)],
            "top": [(0.94, 0.0513), (0.97, 0.0417), (0.99, 0.0361), (1.01, 0.0305), (1.03, 0.0260), (1.06, 0.0260)],
            "outer": [(0.94, 0.0547), (0.97, 0.0495), (0.99, 0.0453), (1.01, 0.0395), (1.03, 0.0366), (1.06, 0.0366)],
        },
    },
    "back": {"female": {"top": 0.0200, "outer": 0.0275}, "male": {"top": 0.0215, "outer": 0.0300}},
    "strap": {"female": {"top": 0.0205, "outer": 0.0320}, "male": {"top": 0.0221, "outer": 0.0320}},
    "side": {"female": {"top": 0.0190, "outer": 0.0420}, "male": {"top": 0.0240, "outer": 0.0420}},
}
SKIN_STANDOFF_M = 0.002  # 맨몸(속옷) 위


def garment_standoff(lm: Landmarks, area: str, over: str, y: Any = None) -> Any:
    """소품이 얹힐 층(`over`: skin | bottom | top | outer)의 겉면까지 거리(m). 높이별 표는 `y`(스칼라·배열)에서 보간한다.
    베이스를 모르면 두 베이스의 최댓값."""
    if over == "skin":
        return SKIN_STANDOFF_M if y is None else np.full(np.shape(y), SKIN_STANDOFF_M)
    table = GARMENT_STANDOFF_M[area]
    base_id = getattr(lm, "base_id", None)
    entries = [table[base_id][over]] if base_id in table else [entry[over] for entry in table.values()]

    def value(entry: Any) -> Any:
        if isinstance(entry, list):
            ys, ms = zip(*entry)
            yq = np.max(ys) if y is None else y
            return np.interp(yq, ys, ms)
        return entry if y is None else np.full(np.shape(y), entry)

    values = [value(entry) for entry in entries]
    return values[0] if len(values) == 1 else np.maximum.reduce(values)


def _sq_cos(t: np.ndarray, e: float) -> np.ndarray:
    c = np.cos(t)
    return np.sign(c) * np.abs(c) ** e


def _sq_sin(t: np.ndarray, e: float) -> np.ndarray:
    s = np.sin(t)
    return np.sign(s) * np.abs(s) ** e


def superquadric_mesh(rows: int, cols: int, e_lat: float, e_lon: float) -> tuple[np.ndarray, np.ndarray]:
    """단위 초타원체(−1~1 상자 안 둥근 상자): 행 = 위도(아래 극 → 위 극), 열 = 경도(+x에서 +z 쪽으로). 지수가 작을수록 모서리가 각진다."""
    eta = -0.5 * math.pi + math.pi * np.arange(1, rows) / rows
    omega = 2.0 * math.pi * np.arange(cols) / cols
    e_grid, o_grid = np.meshgrid(eta, omega, indexing="ij")
    ring = np.stack([_sq_cos(e_grid, e_lat) * _sq_cos(o_grid, e_lon), _sq_sin(e_grid, e_lat), _sq_cos(e_grid, e_lat) * _sq_sin(o_grid, e_lon)], axis=-1).reshape(-1, 3)
    positions = np.vstack([[0.0, -1.0, 0.0], ring, [0.0, 1.0, 0.0]])
    n = cols
    tris = [[0, 1 + (j + 1) % n, 1 + j] for j in range(n)]
    for r in range(rows - 2):
        for j in range(n):
            a, b = 1 + r * n + j, 1 + r * n + (j + 1) % n
            c, d = a + n, b + n
            tris += [[a, b, d], [a, d, c]]
    top, last = len(positions) - 1, 1 + (rows - 2) * n
    tris += [[last + j, last + (j + 1) % n, top] for j in range(n)]
    return positions, np.array(tris, dtype=np.int64)


def solid_piece(name: str, positions: np.ndarray, triangles: np.ndarray, uv: np.ndarray) -> Any:
    """닫힌 조각(감김 바깥, 단색 칸 하나)."""
    return tube_part(name, (positions, triangles), uv)


@dataclass
class BagFrame:
    """가방 몸통 자리: 원점(뒤판 가운데), 가로 t·위 up·바깥 n(서로 수직), 가로 굽힘 반지름(뒤판이 몸 둘레를 따라 휜다)."""

    origin: np.ndarray
    t: np.ndarray
    up: np.ndarray
    n: np.ndarray
    bend_radius: float

    def place(self, local: np.ndarray) -> np.ndarray:
        """가방 좌표(x 가로, y 위, z 바깥 — 뒤판 z = 0) → 월드. 가로 끝일수록 몸 쪽으로 x²/2R만큼 휜다."""
        local = np.asarray(local, dtype=np.float64).reshape(-1, 3)
        sag = local[:, 0] ** 2 / (2.0 * self.bend_radius)
        return self.origin + local[:, 0:1] * self.t + local[:, 1:2] * self.up + (local[:, 2:3] - sag[:, None]) * self.n


def rest_bag(lm: Landmarks, frame: BagFrame, local: np.ndarray, back_mask: np.ndarray, clearance: Callable[[np.ndarray], np.ndarray], pivot_y: float, tilts_deg: np.ndarray, bends: tuple[float, ...] = ()) -> tuple[BagFrame, dict[str, float]]:
    """단단한 가방을 몸(+ 의상 층)에 기대 놓는다: 기울기(가로축 둘레, `pivot_y` 높이 기준)·가로 굽힘 반지름(`bends`, 없으면 틀의 값)마다 뒤판 점이 몸에서
    `clearance` 넘게 떨어지도록 바깥으로 민 양을 구하고, 뒤판이 몸에 가장 붙는(평균 간격 최소) 조합을 고른다. 한 점씩 밀면 가방이 찌그러진다 —
    매달린 가방은 가장 튀어나온 곳에 기댄다. 등은 어깨뼈 높이에서 평평하고 허리에서 옆으로 휘어, 굽힘 하나로 고정하면 백팩이 5 cm 떴다(2026-10-23)."""
    best: tuple[float, BagFrame, float, float] | None = None
    back = local[back_mask]
    for bend in bends or (frame.bend_radius,):
        frame = BagFrame(frame.origin, frame.t, frame.up, frame.n, bend)
        for tilt in tilts_deg:
            a = math.radians(float(tilt))
            up = frame.up * math.cos(a) + frame.n * math.sin(a)
            n = frame.n * math.cos(a) - frame.up * math.sin(a)
            pivot = frame.origin + frame.up * pivot_y
            origin = pivot - up * pivot_y
            trial = BagFrame(origin, frame.t, up, n, frame.bend_radius)
            world = trial.place(back)
            d, normal = body_signed_distance(lm, world)
            facing = np.maximum(np.einsum("ij,j->i", normal, n), 0.3)
            shift = float(np.max(np.maximum(clearance(world) - d, 0.0) / facing))
            placed = BagFrame(origin + n * shift, frame.t, up, n, frame.bend_radius)
            placed_back = placed.place(back)
            d2, _ = body_signed_distance(lm, placed_back)
            score = float(np.mean(np.minimum(d2 - clearance(placed_back), 0.08)))  # 층 겉면 위 평균 틈
            if best is None or score < best[0]:
                best = (score, placed, float(tilt), shift)
    assert best is not None
    return best[1], {"tiltDeg": best[2], "shiftM": round(best[3], 4), "meanBackGapM": round(best[0], 4), "bendM": best[1].bend_radius}


def closed_path_at(path: np.ndarray, normals: np.ndarray, s: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """닫힌 꺾은선의 호 길이 `s`(둘레로 감김) 위치와 단위 법선."""
    from character_kit import forge_shoes as fs

    closed = np.vstack([path, path[:1]])
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    total = cum[-1]
    s = np.mod(np.asarray(s, dtype=np.float64), total)
    nclosed = np.vstack([normals, normals[:1]])
    pos = np.stack([np.interp(s, cum, closed[:, k]) for k in range(3)], axis=-1)
    nrm = fs.unit(np.stack([np.interp(s, cum, nclosed[:, k]) for k in range(3)], axis=-1))
    return pos, nrm


def zipper_parts(lm: Landmarks, name: str, path: np.ndarray, outward: np.ndarray, pull_at_end: bool, radius: float = 0.0016) -> list[Any]:
    """지퍼: 이빨 줄(가는 관) + 끝의 손잡이(작은 둥근 판, 아래로 늘어짐)."""
    from character_kit import forge_shoes as fs

    tape = fs.tube_piece(f"{name}-teeth", path, outward, fs.ellipse_profile(radius, radius, radius * 1.5, 6), False, None, uv=acc_patch(14).uv(0.5, 0.5))
    end = path[-1] if pull_at_end else path[0]
    along = fs.unit(path[-1] - path[-2]) if pull_at_end else fs.unit(path[0] - path[1])
    out = fs.unit(outward[-1] if pull_at_end else outward[0])
    # 손잡이는 겉면을 따라 아래로 늘어진다(중력을 접평면에 투영). 면이 위·아래를 보면 지퍼 진행 방향으로.
    # 축은 오른손 좌표(가로 = 늘어짐 × 바깥)로 고정한다 — 부호를 수직 성분으로 고르면 지퍼 끝이 수직일 때 변형마다 뒤집혀 형상 키 위상이 깨졌다
    gravity = np.array([0.0, -1.0, 0.0])
    down = gravity - np.dot(gravity, out) * out
    down = fs.unit(down) if np.linalg.norm(down) > 0.3 else along
    across = np.cross(down, out)
    sq, tri = superquadric_mesh(6, 12, 0.5, 0.5)
    half = np.array([0.0045, 0.0105, 0.0016])  # 가로·세로(아래로)·두께
    local = sq * half
    world = end + out * (half[2] + radius) + across * local[:, 0:1] + down * (local[:, 1:2] + half[1] + 0.002) + out * local[:, 2:3]
    pull = solid_piece(f"{name}-pull", world, tri, acc_patch(14).uv(0.5, 0.5))
    return [tape, pull]


# ---------------------------------------------------------------- 허리 가방(accessory/waist-bag)


@dataclass(frozen=True)
class WaistBagParams:
    """허리 가방: 허리를 한 바퀴 도는 웨빙 띠 + 왼쪽 옆 사이드 릴리스 버클 + 앞의 바나나 모양 주머니(지퍼 둘·앞주머니 패치). 길이 m.

    기본은 상의 위(forge 상의 허리 실측: 여 20.5 mm·남 30.5 mm), shape:fit:−는 맨몸·하의 허리띠 위, +는 아우터 위."""

    over: str = "top"  # bottom(하의 허리·맨몸) | top | outer
    belt_y: float = 1.02
    belt_width: float = 0.030
    belt_thickness: float = 0.0025
    width: float = 0.205  # 주머니 가로(띠를 따라)
    height: float = 0.105
    depth: float = 0.058
    drop: float = 0.016  # 주머니 가운데가 띠 가운데보다 아래로
    curve: float = 0.016  # 바나나 곡선: 양 끝이 가운데보다 내려간 양
    azimuth_deg: float = 8.0  # 주머니 가운데 방위(0 = 정면, + = 캐릭터 왼쪽)
    buckle_azimuth_deg: float = -112.0  # 버클(캐릭터 오른쪽 옆구리 뒤)
    size: float = 1.0


WAIST_BELT_RECT = (0, 0, 1024, 64)
WAIST_BAG_SAMPLES = 72
POUCH_E_LAT, POUCH_E_LON = 0.42, 0.36  # 둥근 상자 지수(0.32·0.26은 각진 상자처럼 보였다)


def waist_belt_path(lm: Landmarks, y: float, width: float, standoff: float) -> tuple[np.ndarray, np.ndarray]:
    """허리 띠 안쪽 경로: 띠 높이 안 몸통·골반 정점을 수평 법선으로 `standoff` 띄운 점의 평면 볼록 다각형을 같은 호 길이로(뒤 가운데부터)."""
    from character_kit import forge_shoes as fs

    body = lm.base.mesh("body_")
    pos = body["tpose_positions"].astype(np.float64)
    nrm = body["normals"].astype(np.float64)
    # 띠 폭보다 위아래 8 mm 더 모은다 — 띠 모서리 둥근 면이 바로 위아래 볼록한 곳에 0.3 mm 묻혔다(2026-10-23 맨몸 fit:−)
    mask = np.isin(body["region"], [lm.base.region_ids.index(r) for r in ("torso", "pelvis")]) & (np.abs(pos[:, 1] - y) <= 0.5 * width + 0.008)
    flat = nrm[mask].copy()
    flat[:, 1] = 0.0
    lifted = pos[mask] + fs.unit(flat) * standoff
    ring = _ring_samples(_hull_2d(lifted[:, [0, 2]]), np.array([0.0, -1.0]), WAIST_BAG_SAMPLES)
    for _ in range(4):
        ring = ring + 0.3 * (0.5 * (np.roll(ring, 1, axis=0) + np.roll(ring, -1, axis=0)) - ring)
    path = np.stack([ring[:, 0], np.full(len(ring), y), ring[:, 1]], axis=1)
    centre = path.mean(axis=0)
    out = path - centre
    out[:, 1] = 0.0
    tangent = np.roll(path, -1, axis=0) - np.roll(path, 1, axis=0)
    normal = fs.unit(np.cross(tangent, np.array([0.0, 1.0, 0.0])))
    normal = np.where((np.einsum("ij,ij->i", normal, out) < 0)[:, None], -normal, normal)
    return path, normal


def build_waist_bag(lm: Landmarks, p: WaistBagParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs

    # 띠: 위·아래 가장자리 높이의 층 겉면 거리로 원뿔처럼 기울인다(상의가 아래로 퍼져 수직 띠의 아래 가장자리가 옆구리에서 1.2~2.4 mm 묻혔다) + 1.2 mm
    s_bottom, s_top = (float(v) for v in garment_standoff(lm, "waist", p.over, np.array([p.belt_y - 0.5 * p.belt_width, p.belt_y + 0.5 * p.belt_width])))
    s_bottom += 0.0016  # 방위 16칸 사이(옆·뒤 옆)에서 상의가 더 퍼진 곳: 아래 가장자리가 남 셔츠에 2.8 mm 묻혔다(2026-10-23)
    standoff = 0.5 * (s_bottom + s_top) + 0.0012
    path, normal = waist_belt_path(lm, p.belt_y, p.belt_width, standoff)
    up = np.array([0.0, 1.0, 0.0])
    parts: list[AccPart] = []
    support = "region:torso,pelvis"
    belt_profile = fs.rect_profile(p.belt_width, p.belt_thickness, 0.0, round_count=2)
    belt_profile[:, 0] += (s_bottom - s_top) * (0.5 - (belt_profile[:, 1] + 0.5 * p.belt_width) / p.belt_width)
    belt_length = float(np.linalg.norm(np.diff(np.vstack([path, path[:1]]), axis=0), axis=1).sum())
    # 아틀라스는 반복할 수 없어 띠 한 바퀴를 칸 하나(1024 px)에 편다(u 0~1) — 짧은 band_length는 u가 1에서 잘려 무늬가 12 cm 뒤로 사라진다
    belt = fs.tube_piece("belt", path, normal, belt_profile, True, _rect(WAIST_BELT_RECT), band_length=belt_length, y_hint=up)
    parts.append(AccPart(ACC_BODY, "nearest", belt, support))
    outer = path + normal * p.belt_thickness
    seg = np.linalg.norm(np.diff(np.vstack([outer, outer[:1]]), axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg)])

    def arc_at_azimuth(azimuth_deg: float) -> float:
        centre = outer.mean(axis=0)
        az = np.degrees(np.arctan2(outer[:, 0] - centre[0], outer[:, 2] - centre[2]))
        diff = (az - azimuth_deg + 180.0) % 360.0 - 180.0
        return float(cum[int(np.argmin(np.abs(diff)))])

    # 버클: 띠 바깥면에 붙은 둥근 판 둘(암·수) + 가운데 이음 홈 띠
    s_buckle = arc_at_azimuth(p.buckle_azimuth_deg)
    b_pos, b_n = closed_path_at(outer, normal, np.array([s_buckle]))
    b_t = fs.unit(np.cross(up, b_n[0]))
    sq, tri = superquadric_mesh(8, 16, 0.35, 0.3)
    for k, (offset, length) in enumerate(((-0.0125, 0.026), (0.0145, 0.030))):
        half = np.array([0.5 * length, 0.5 * (p.belt_width + 0.006), 0.0036])
        local = sq * half
        world = b_pos[0] + b_t * (local[:, 0:1] + offset) + up * local[:, 1:2] + b_n[0] * (local[:, 2:3] + half[2] + 0.0003)
        parts.append(AccPart(ACC_ACCENT, "nearest", solid_piece(f"buckle-{k}", world, tri, acc_patch(14).uv(0.5, 0.5)), support))
    # 길이 조절 고리(트라이글라이드): 버클 수 쪽 6 cm 옆, 띠보다 조금 넓은 얇은 테
    g_pos, g_n = closed_path_at(outer, normal, np.array([s_buckle + 0.062]))
    g_t = fs.unit(np.cross(up, g_n[0]))
    half = np.array([0.0045, 0.5 * (p.belt_width + 0.005), 0.0022])
    local_g = sq * half
    world = g_pos[0] + g_t * local_g[:, 0:1] + up * local_g[:, 1:2] + g_n[0] * (local_g[:, 2:3] + half[2] + 0.0002)
    parts.append(AccPart(ACC_ACCENT, "nearest", solid_piece("glide", world, tri, acc_patch(14).uv(0.5, 0.5)), support))
    # 주머니: 띠 바깥면 정면 점에서 가로·위·바깥 틀 → 초타원체(앞면 볼록) → 몸·의상에 기대 놓기
    size = p.size
    w, h, d = p.width * size, p.height * size, p.depth * size
    s0 = arc_at_azimuth(p.azimuth_deg)
    o_pos, o_n = closed_path_at(outer, normal, np.array([s0]))
    t_dir = fs.unit(np.cross(up, o_n[0]))
    frame = BagFrame(o_pos[0] + o_n[0] * 0.001, t_dir, up, o_n[0], 0.30)
    sq, tri = superquadric_mesh(14, 32, POUCH_E_LAT, POUCH_E_LON)
    local = sq * np.array([0.5 * w, 0.5 * h, 0.5 * d])
    front = sq[:, 2] > 0.0
    local[:, 2] += 0.5 * d + np.where(front, 0.10 * d * (1.0 - sq[:, 0] ** 2) * (1.0 - sq[:, 1] ** 2), 0.0)  # 뒤판 z = 0, 앞면 볼록
    local[:, 1] += -p.drop - p.curve * (2.0 * local[:, 0] / w) ** 2
    frame, rest = rest_bag(lm, frame, local, sq[:, 2] < -0.2, lambda pts: garment_standoff(lm, "waist", p.over, pts[:, 1]) + 0.0015, 0.0, np.arange(-16.0, 6.1, 2.0))
    pouch = frame.place(local)
    parts.append(AccPart(ACC_BODY, "rigid:affine:mixamorig:Spine", solid_piece("pouch", pouch, tri, acc_patch(13).uv(0.5, 0.5)), "info:pouchBack:0.05"))

    def on_front(xs: np.ndarray, ys: np.ndarray, lift: float) -> tuple[np.ndarray, np.ndarray]:
        """주머니 겉면(초타원체 식) 위 점과 바깥 법선(유한 차분) + lift."""
        e_lat, e_lon = POUCH_E_LAT, POUCH_E_LON
        a, b, c = 0.5 * w, 0.5 * h, 0.5 * d

        def surface(xq: np.ndarray, yq: np.ndarray) -> np.ndarray:
            yy = np.clip(np.abs(yq / b), 0.0, 0.999)
            ring = (1.0 - yy ** (2.0 / e_lat)) ** (e_lat / e_lon)
            xx = np.clip(np.abs(xq / a), 0.0, 0.999) ** (2.0 / e_lon)
            zz = c * np.maximum(ring - xx, 1e-6) ** (e_lon / 2.0)
            zz = zz + c + 0.10 * d * (1.0 - (xq / a) ** 2) * (1.0 - (yq / b) ** 2)
            yb = yq - p.drop - p.curve * (2.0 * xq / w) ** 2
            return frame.place(np.stack([xq, yb, zz], axis=1))

        pts = surface(xs, ys)
        du = surface(xs + 1e-4, ys) - surface(xs - 1e-4, ys)
        dv = surface(xs, ys + 1e-4) - surface(xs, ys - 1e-4)
        nn = fs.unit(np.cross(du, dv))
        nn = np.where((np.einsum("ij,j->i", nn, frame.n) < 0)[:, None], -nn, nn)
        return pts + nn * lift, nn

    xs = np.linspace(-0.43 * w, 0.43 * w, 34)
    zpath, zn = on_front(xs, np.full_like(xs, 0.30 * h), 0.0012)
    for piece in zipper_parts(lm, "zip-main", zpath, zn, pull_at_end=True):
        parts.append(AccPart(ACC_ACCENT, "rigid:affine:mixamorig:Spine", piece, "info:pouchBack:0.05"))
    xs2 = np.linspace(-0.30 * w, 0.30 * w, 24)
    ppath, pn = on_front(xs2, np.full_like(xs2, -0.08 * h), 0.0012)
    for piece in zipper_parts(lm, "zip-pocket", ppath, pn, pull_at_end=False):
        parts.append(AccPart(ACC_ACCENT, "rigid:affine:mixamorig:Spine", piece, "info:pouchBack:0.05"))
    # 앞주머니 상표 패치(둥근 판): 아래 지퍼 아래 가운데
    centre_pt, centre_n = on_front(np.array([0.0]), np.array([-0.28 * h]), 0.0)
    sqp, trp = superquadric_mesh(6, 16, 0.4, 0.4)
    half = np.array([0.020 * size, 0.009 * size, 0.0011])
    tdir = fs.unit(frame.t - np.dot(frame.t, centre_n[0]) * centre_n[0])
    udir = np.cross(centre_n[0], tdir)
    patch_world = centre_pt[0] + tdir * (sqp[:, 0:1] * half[0]) + udir * (sqp[:, 1:2] * half[1]) + centre_n[0] * (sqp[:, 2:3] * half[2] + 0.0006)
    parts.append(AccPart(ACC_ACCENT, "rigid:affine:mixamorig:Spine", solid_piece("patch", patch_world, trp, acc_patch(14).uv(0.5, 0.5)), "info:pouchBack:0.05"))
    back_points = pouch[sq[:, 2] < -0.2]
    return AccessoryBuild(parts=parts, info={"pouchBack": back_points, "standoffM": standoff, **rest})


def bake_waist_bag(atlas: Any, build: AccessoryBuild) -> None:
    from character_kit import forge_shoes as fs

    def webbing(fu: np.ndarray, fv: np.ndarray) -> np.ndarray:
        weave = 0.90 + 0.03 * np.sin(fu * 2.0 * math.pi * 90.0) * np.sin(fv * 2.0 * math.pi * 6.0)
        edge = (fv < 0.10) | (fv > 0.90)
        stitch = ((np.abs(fv - 0.16) < 0.03) | (np.abs(fv - 0.84) < 0.03)) & fs.dashes(fu * 120.0, 1.0, 0.55)
        return np.where(stitch, 0.80, np.where(edge, 0.86, weave))

    atlas.bake(_rect(WAIST_BELT_RECT), webbing)
    bake_patches({13: 0.92, 14: 0.86})(atlas, build)


register_accessory(
    AccessoryDefinition(
        name="waist-bag",
        build=build_waist_bag,
        params=WaistBagParams(),
        shape_variants=lambda p: {
            "shape:fit:+": replace(p, over="outer"),
            "shape:fit:-": replace(p, over="bottom"),
            "shape:size:+": replace(p, size=1.22),
            "shape:size:-": replace(p, size=0.80),
        },
        bake=bake_waist_bag,
        anchors=("waist",),
        layer="over-top",
        morph_groups=("body",),
        regions=("torso", "pelvis"),
        conflicts=(),
        # 아우터(forge 의상 제안 id outer/*, 상의 슬롯으로 입은 블레이저·후디 포함) 위에서는 fit:+ — 계측: 기본은 아우터 287~508정점 묻힘, fit:+는 0~2
        stacking=({"with": ["outer/blazer", "outer/cardigan", "outer/hoodie", "outer/vest", "top/blazer", "top/hoodie"], "shapes": {"shape:fit:+": 1.0}},),
        shapes_ko={"fit": "몸과의 간격(− 하의 허리 위, + 아우터 위)", "size": "주머니 크기"},
        changes_ko=(
            "베이스 허리(y 1.02) 몸통·골반 정점을 forge 상의 겉면 실측 거리(여 20.5·남 30.5 mm)만큼 띄운 평면 볼록 다각형을 도는 웨빙 띠 + 옆구리 사이드 릴리스 "
            "버클 + 앞의 바나나 모양 초타원체 주머니(앞면 볼록, 몸·의상에 기울기를 골라 기대 놓음)·지퍼 둘·손잡이·상표 패치를 절차 생성. 띠·버클은 몸통 정점 "
            "최근접 스킨, 주머니는 Spine 강체(뒤판 둘레 5 cm 정점 아핀 맞춤). 외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


# ---------------------------------------------------------------- 백팩(accessory/backpack)


@dataclass(frozen=True)
class BackpackParams:
    """백팩: 등에 기댄 둥근 상자 몸통(아래판 강조색·앞주머니·지퍼 둘·손잡이) + 어깨를 넘어 가슴 앞으로 내려오는 패드 멜빵 둘 + 겨드랑이 아래를 돌아
    몸통 아래 모서리로 가는 웨빙·조절 고리. 길이 m. 기본은 상의 위(forge 상의 등 20~21.5 mm·멜빵 20.5~22 mm 실측), fit −/+ = 맨몸/아우터 위."""

    over: str = "top"
    width: float = 0.260
    height: float = 0.335
    depth: float = 0.115
    top_y: float = 1.335  # 몸통 윗면 높이(어깨뼈 위)
    strap_x: float = 0.080  # 어깨 위 멜빵 가운데: 0.088·폭 46 mm는 바깥 가장자리가 어깨 솔기(셔츠 53 mm 부풂, x 0.11)에 걸렸다
    strap_width: float = 0.042
    strap_thickness: float = 0.008
    webbing_width: float = 0.025
    size: float = 1.0


BACKPACK_E_LAT, BACKPACK_E_LON = 0.40, 0.34
BACKPACK_BOTTOM_ROWS = 4  # 아래 극에서 이 행까지 아래판(강조색)


def body_point(lm: Landmarks, origin: np.ndarray, direction: np.ndarray) -> np.ndarray:
    """몸+머리 표면을 바깥에서 쏴 처음 맞는 점(T-포즈). 못 맞히면 오류 — 멜빵 길잡이 점이 몸 밖에 있으면 경로가 틀린다."""
    hit, tri = lm.surface().ray(np.asarray(origin, dtype=np.float64)[None], np.asarray(direction, dtype=np.float64)[None], 2.0)
    if tri[0] < 0:
        raise ValueError(f"몸 표면을 찾지 못했다: {origin} → {direction}")
    return hit[0]


def strap_curve(lm: Landmarks, guides: list[np.ndarray], clearance: float, samples: int) -> tuple[np.ndarray, np.ndarray]:
    """길잡이 점(몸 위 + 간격)을 지나는 캐트멀-롬 곡선을 고르게 다시 뽑고, 몸에서 `clearance` 밖으로 밀고 평활(두 번) — 멜빵은 팽팽해 오목한 곳을 건넌다.
    반환: 경로, 단면 x축(최근접 몸 법선)."""
    from character_kit import forge_shoes as fs

    pts = np.asarray(guides, dtype=np.float64)
    ext = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
    dense = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for u in np.linspace(0.0, 1.0, 16, endpoint=False):
            u2, u3 = u * u, u * u * u
            dense.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3))
    dense.append(pts[-1])
    path = fs.resample_polyline(np.array(dense), samples)
    for _ in range(2):
        path = push_out_points(lm, path, clearance)
        inner = path[1:-1] + 0.35 * (0.5 * (path[:-2] + path[2:]) - path[1:-1])
        path = np.vstack([path[:1], inner, path[-1:]])
    path = push_out_points(lm, path, clearance)
    _, normals = body_signed_distance(lm, path)
    for _ in range(3):
        normals[1:-1] = fs.unit(normals[1:-1] + 0.5 * (normals[:-2] + normals[2:]))
    return path, normals


def strap_piece(lm: Landmarks, name: str, path: np.ndarray, normals: np.ndarray, profile: np.ndarray, clearance: float, uv: np.ndarray, taper: np.ndarray | None = None) -> Any:
    """멜빵 관 조각: 단면(x = 몸 바깥, y = 폭)을 경로로 쓸고, `taper`로 폭·두께를 줄인 뒤, 단면 고리마다 몸에서 `clearance`보다 가까운 점이 있으면
    고리 전체를 법선으로 민다(띠는 뻣뻣해 가운데가 뜬다 — 볼록한 어깨 위에서 납작한 띠 가장자리가 3~5 mm 묻혔다)."""
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    piece = fs.tube_piece(name, path, normals, profile, False, None, uv=uv)
    k, rows = len(profile), len(path)
    ring_index = np.arange(rows * k) // k
    positions = piece.positions.copy()
    unit_n = fs.unit(normals)
    if taper is not None:
        centre = path[ring_index] + unit_n[ring_index] * (0.5 * float(profile[:, 0].max()))
        positions[: rows * k] = centre + (positions[: rows * k] - centre) * taper[ring_index][:, None]
    for _ in range(3):
        d, _ = body_signed_distance(lm, positions[: rows * k])
        deficit = np.zeros(rows)
        np.maximum.at(deficit, ring_index, np.maximum(clearance - d, 0.0))
        if not (deficit > 1e-7).any():
            break
        positions[: rows * k] += unit_n[ring_index] * deficit[ring_index][:, None]
        positions[rows * k] += unit_n[0] * deficit[0]  # 양 끝 덮개 가운데 점
        positions[rows * k + 1] += unit_n[-1] * deficit[-1]
    return fs.Piece(name=name, positions=positions, triangles=piece.triangles, uvs=piece.uvs, normals=vertex_normals(positions, piece.triangles))


def surface_curve_on_box(frame: BagFrame, half: np.ndarray, e_lat: float, e_lon: float, z_fraction: float, angles: np.ndarray, lift: float, puff: float) -> tuple[np.ndarray, np.ndarray]:
    """둥근 상자(초타원체) 겉면 위, 깊이 z_fraction(뒤판 0 → 겉면 1)의 단면 둘레를 x-y 평면 각도로 따라가는 곡선(+ lift)과 바깥 법선."""
    from character_kit import forge_shoes as fs

    a, b, c = half

    def implicit(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
        return (np.abs(x / a) ** (2 / e_lon) + np.abs(z / c) ** (2 / e_lon)) ** (e_lon / e_lat) + np.abs(y / b) ** (2 / e_lat)

    z0 = (2.0 * z_fraction - 1.0) * c
    lo, hi = np.zeros(len(angles)), np.full(len(angles), 1.5)
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        inside = implicit(mid * a * np.cos(angles), mid * b * np.sin(angles), np.full(len(angles), z0)) < 1.0
        lo, hi = np.where(inside, mid, lo), np.where(inside, hi, mid)
    x, y = lo * a * np.cos(angles), lo * b * np.sin(angles)

    def world(xq: np.ndarray, yq: np.ndarray, zq: np.ndarray) -> np.ndarray:
        bulge = puff * np.clip(1.0 - (xq / a) ** 2, 0.0, 1.0) * np.clip(1.0 - (yq / b) ** 2, 0.0, 1.0) * np.clip((zq / c), 0.0, 1.0)
        return frame.place(np.stack([xq, yq, zq + c + bulge], axis=1))

    pts = world(x, y, np.full(len(angles), z0))
    # 법선: 음함수 기울기(가방 좌표) → 월드(굽힘은 무시할 만큼 작다)
    eps = 1e-5
    gx = (implicit(x + eps, y, z0) - implicit(x - eps, y, z0)) / (2 * eps)
    gy = (implicit(x, y + eps, z0) - implicit(x, y - eps, z0)) / (2 * eps)
    gz = (implicit(x, y, np.full(len(angles), z0 + eps)) - implicit(x, y, np.full(len(angles), z0 - eps))) / (2 * eps)
    nl = fs.unit(np.stack([gx, gy, gz], axis=1))
    nw = fs.unit(nl[:, 0:1] * frame.t + nl[:, 1:2] * frame.up + nl[:, 2:3] * frame.n)
    return pts + nw * lift, nw


def build_backpack(lm: Landmarks, p: BackpackParams) -> AccessoryBuild:
    from character_kit import forge_shoes as fs
    from character_kit.surface import vertex_normals

    up = np.array([0.0, 1.0, 0.0])
    s_back = garment_standoff(lm, "back", p.over)
    s_strap = garment_standoff(lm, "strap", p.over)
    s_side = garment_standoff(lm, "side", p.over)
    w, h, d = p.width * p.size, p.height * p.size, p.depth * p.size
    centre_y = p.top_y - 0.5 * h
    back_pt = body_point(lm, np.array([0.0, centre_y, -0.6]), np.array([0.0, 0.0, 1.0]))
    n_dir = np.array([0.0, 0.0, -1.0])
    t_dir = np.cross(up, n_dir)
    frame = BagFrame(back_pt + n_dir * s_back, t_dir, up, n_dir, 0.36)
    sq, tri = superquadric_mesh(16, 36, BACKPACK_E_LAT, BACKPACK_E_LON)
    half = np.array([0.5 * w, 0.5 * h, 0.5 * d])
    local = sq * half
    puff = 0.10 * d
    local[:, 2] += 0.5 * d + puff * np.clip(1.0 - sq[:, 0] ** 2, 0, 1) * np.clip(1.0 - sq[:, 1] ** 2, 0, 1) * np.clip(sq[:, 2], 0, 1)
    frame, rest = rest_bag(lm, frame, local, sq[:, 2] < -0.2, lambda pts: np.full(len(pts), s_back + 0.0015), 0.5 * h, np.arange(-20.0, 20.1, 2.0), bends=(0.30, 0.45, 0.70, 1.20))
    bag = frame.place(local)
    bag_tri = fs.orient_closed_components(bag, tri)
    bag_normals = vertex_normals(bag, bag_tri)
    # 아래판(강조색): 아래 극 쪽 몇 행. 법선은 전체 몸통에서 계산해 나눈 조각에 그대로 준다(이음매 음영 끊김 방지)
    cols = 36
    bottom_vertex = np.zeros(len(bag), dtype=bool)
    bottom_vertex[0] = True
    bottom_vertex[1 : 1 + BACKPACK_BOTTOM_ROWS * cols] = True
    tri_bottom = bottom_vertex[bag_tri].all(axis=1)
    support_bag = "info:bagBack:0.06"
    bind_bag = "rigid:affine:mixamorig:Spine1"
    parts: list[AccPart] = []
    for label, mask, role, patch in (("bag", ~tri_bottom, ACC_BODY, 15), ("bag-bottom", tri_bottom, ACC_ACCENT, 16)):
        sub = bag_tri[mask]
        used = np.unique(sub)
        remap = -np.ones(len(bag), dtype=np.int64)
        remap[used] = np.arange(len(used))
        piece = fs.Piece(name=label, positions=bag[used], triangles=remap[sub], uvs=acc_patch_uv(patch, len(used)), normals=bag_normals[used])
        parts.append(AccPart(role, bind_bag, piece, support_bag))
    tx = 1.0 if frame.t[0] >= 0.0 else -1.0  # 가방 가로축이 월드 +x와 같은 쪽이면 1(멜빵 좌우를 가방 좌표로 옮길 때)
    # 몸통 지퍼: 겉면 쪽 깊이 62 %에서 옆 아래(−15°)부터 위를 넘어 반대 옆 아래까지(뒤집힌 U)
    angles = np.radians(np.linspace(-15.0, 195.0, 46))
    zpath, zn = surface_curve_on_box(frame, half, BACKPACK_E_LAT, BACKPACK_E_LON, 0.62, angles, 0.0012, puff)
    for piece in zipper_parts(lm, "zip-main", zpath, zn, pull_at_end=True):
        parts.append(AccPart(ACC_ACCENT, bind_bag, piece, support_bag))
    # 앞주머니: 겉면 아래쪽에 반쯤 박힌 작은 둥근 상자(몸통색) + 윗변 지퍼
    pw, ph, pd = 0.72 * w, 0.40 * h, 0.40 * d
    sqp, trp = superquadric_mesh(10, 28, 0.38, 0.34)
    lp = sqp * np.array([0.5 * pw, 0.5 * ph, 0.5 * pd])
    lp[:, 1] += -0.5 * h + 0.5 * ph + 0.08 * h
    lp[:, 2] += d + puff * 0.6 - 0.15 * pd
    pocket = frame.place(lp)
    parts.append(AccPart(ACC_BODY, bind_bag, solid_piece("pocket", pocket, trp, acc_patch(15).uv(0.5, 0.5)), support_bag))
    # 주머니 좌표 = 몸통 좌표를 주머니 뒤판 가운데로 옮긴 것(굽힘 반지름 같게 — 다르면 지퍼가 주머니 끝에서 8 mm 뜬다)
    pocket_frame = BagFrame(frame.place(np.array([[0.0, float(lp[:, 1].mean()), d + puff * 0.6 - 0.15 * pd - 0.5 * pd]]))[0], frame.t, frame.up, frame.n, frame.bend_radius)
    pang = np.radians(np.linspace(25.0, 155.0, 26))
    ppath, pn = surface_curve_on_box(pocket_frame, np.array([0.5 * pw, 0.5 * ph, 0.5 * pd]), 0.38, 0.34, 0.80, pang, 0.0012, 0.0)
    for piece in zipper_parts(lm, "zip-pocket", ppath, pn, pull_at_end=False):
        parts.append(AccPart(ACC_ACCENT, bind_bag, piece, support_bag))
    # 손잡이: 윗면 가운데 짧은 고리
    top_mid = frame.place(np.array([[0.0, 0.5 * h, 0.35 * d]]))[0]
    handle_path = np.array([top_mid + frame.t * x + frame.up * (0.022 * math.sin(math.pi * (x + 0.035) / 0.07)) for x in np.linspace(-0.035, 0.035, 14)])
    # 두께 방향 = 아치의 바깥(접선에 수직, 가로·위 평면 안), 폭 방향 = 가방 깊이(n) — 폭 방향 힌트가 접선과 나란하면 부호가 변형마다 뒤집힌다
    tangent = np.gradient(handle_path, axis=0)
    handle_n = fs.unit(np.cross(frame.n, tangent))
    handle_n = np.where((np.einsum("ij,j->i", handle_n, frame.up) < 0)[:, None], -handle_n, handle_n)
    handle = fs.tube_piece("handle", handle_path, handle_n, fs.rect_profile(0.022, 0.003, -0.0015, round_count=1), False, None, uv=acc_patch(16).uv(0.5, 0.5), y_hint=frame.n)
    parts.append(AccPart(ACC_ACCENT, bind_bag, handle, support_bag))
    # 멜빵: 좌우 대칭, 몸 위 길잡이 점(+ 간격)
    support_strap = "region:torso,neck"
    for sign in (1.0, -1.0):
        sx = sign * p.strap_x * p.size ** 0.3
        attach_top = frame.place(np.array([[sign * tx * 0.24 * w, 0.5 * h - 0.025, 0.02 * d]]))[0]
        shoulder = body_point(lm, np.array([sx, 1.70, 0.0]), -up)
        back_upper = body_point(lm, np.array([sign * 0.080, 1.355, -0.6]), np.array([0.0, 0.0, 1.0]))
        front_upper = body_point(lm, np.array([sign * 0.088, 1.325, 0.6]), np.array([0.0, 0.0, -1.0]))
        # 패드 끝은 겨드랑이 앞 주름(남 상의 x 0.11·y 1.22에서 28 mm) 위에서 멈춘다
        front_lower = body_point(lm, np.array([sign * 0.097, 1.245, 0.6]), np.array([0.0, 0.0, -1.0]))
        _, n_sh = body_signed_distance(lm, shoulder[None])
        _, n_bu = body_signed_distance(lm, back_upper[None])
        _, n_fu = body_signed_distance(lm, front_upper[None])
        _, n_fl = body_signed_distance(lm, front_lower[None])
        guides = [attach_top, back_upper + n_bu[0] * s_strap, shoulder + n_sh[0] * s_strap, front_upper + n_fu[0] * s_strap, front_lower + n_fl[0] * s_strap]
        path, normals = strap_curve(lm, guides, s_strap, 30)
        taper = np.interp(fs.polyline_fractions(path), [0.0, 0.12, 0.85, 1.0], [0.62, 1.0, 1.0, 0.70])
        prof = fs.rect_profile(p.strap_width, p.strap_thickness, 0.0, round_count=2)
        strap = strap_piece(lm, f"strap-{'l' if sign > 0 else 'r'}", path, normals, prof, s_strap, acc_patch(15).uv(0.5, 0.5), taper)
        parts.append(AccPart(ACC_BODY, "nearest", strap, support_strap))
        # 웨빙: 패드 끝에서 옆구리(겨드랑이 아래)를 돌아 몸통 아래 모서리로
        # 패드 끝에서 앞으로 곧게 내려간 뒤(앞 아래 길잡이) 옆구리 낮은 곳(y 1.07)을 돈다 — 옆으로 바로 가면 겨드랑이 아래 상의 부풂(남 y 1.14~1.22, 36~57 mm)에 묻혔다
        front_low = body_point(lm, np.array([sign * 0.104, 1.115, 0.6]), np.array([0.0, 0.0, -1.0]))
        side = body_point(lm, np.array([sign * 0.6, 1.07, 0.02]), np.array([-sign, 0.0, 0.0]))
        _, n_fw = body_signed_distance(lm, front_low[None])
        _, n_sd = body_signed_distance(lm, side[None])
        # 웨빙 끝은 몸통 아래 옆면(깊이 중간)에 단다 — 뒤판 모서리에 달면 끝이 셔츠(남 등 아래 24~40 mm 떠 있다) 안으로 들어갔다
        attach_low = frame.place(np.array([[sign * tx * 0.47 * w, -0.5 * h + 0.035, 0.40 * d]]))[0]
        # 옆구리에서 몸통 아래 모서리까지는 팽팽하게 곧장 간다 — 허리 뒤 길잡이 점을 두면 웨빙이 허리 오목으로 내려가 그 위를 건너는 남성 셔츠(35~46 mm)에 묻혔다
        # 가슴 아래는 몸이 들어가도 웨빙은 패드 끝 앞면 깊이에서 곧게 떨어진다(상의도 가슴 끝에서 곧게 내려온다 — 몸을 따라 들어가면 여성 티셔츠에 9.7 mm 묻혔다)
        front_low_pt = front_low + n_fw[0] * (s_strap + 0.001)
        front_low_pt[2] = max(front_low_pt[2], float(path[-1][2]))
        web_guides = [path[-1] - normals[-1] * 0.001, front_low_pt, side + n_sd[0] * (s_side + 0.002), attach_low]
        web_path, web_n = strap_curve(lm, web_guides, min(s_side, s_back), 26)
        web = strap_piece(lm, f"webbing-{'l' if sign > 0 else 'r'}", web_path, web_n, fs.rect_profile(p.webbing_width, 0.0018, 0.0, round_count=1), min(s_side, s_back), acc_patch(16).uv(0.5, 0.5))
        parts.append(AccPart(ACC_ACCENT, "nearest", web, support_strap))
        # 조절 고리: 패드 끝
        end, end_n = path[-1], normals[-1]
        along = fs.unit(path[-1] - path[-2])
        across = fs.unit(np.cross(along, end_n))  # 오른손 좌표(가로 × 길이 = 바깥)
        sqg, trg = superquadric_mesh(6, 16, 0.4, 0.3)
        g = sqg * np.array([0.5 * (p.webbing_width + 0.008), 0.007, 0.0028])
        gw = end + across * g[:, 0:1] + along * (g[:, 1:2] + 0.004) + end_n * (g[:, 2:3] + 0.5 * p.strap_thickness)
        parts.append(AccPart(ACC_ACCENT, "nearest", solid_piece(f"slider-{'l' if sign > 0 else 'r'}", gw, trg, acc_patch(16).uv(0.5, 0.5)), support_strap))
    back_points = bag[sq[:, 2] < -0.2]
    return AccessoryBuild(parts=parts, info={"bagBack": back_points, "standoffBackM": s_back, "standoffStrapM": s_strap, **rest})


def bake_backpack(atlas: Any, build: AccessoryBuild) -> None:
    bake_patches({14: 0.86, 15: 0.92, 16: 0.80})(atlas, build)


register_accessory(
    AccessoryDefinition(
        name="backpack",
        build=build_backpack,
        params=BackpackParams(),
        shape_variants=lambda p: {
            "shape:fit:+": replace(p, over="outer"),
            "shape:fit:-": replace(p, over="skin"),
            "shape:size:+": replace(p, size=1.15),
            "shape:size:-": replace(p, size=0.85),
        },
        bake=bake_backpack,
        anchors=("back",),
        layer="over-top",
        morph_groups=("body",),
        regions=("torso", "neck"),
        # 후드는 등 위쪽에서 몸통·멜빵과 겹친다(fit:+에서도 236~259정점 묻힘)
        conflicts=("top/hoodie", "outer/hoodie"),
        # 블레이저·카디건·조끼 위는 fit:+ — 계측: 조끼 0~2, 블레이저·카디건은 어깨 패드·깃 옆 멜빵 바깥 가장자리 5~14정점(남은 결함)
        stacking=({"with": ["outer/blazer", "outer/cardigan", "outer/vest", "top/blazer"], "shapes": {"shape:fit:+": 1.0}},),
        shapes_ko={"fit": "몸과의 간격(− 맨몸, + 아우터 위)", "size": "가방 크기"},
        changes_ko=(
            "베이스 등(어깨뼈 위 ~ 허리)에 forge 상의 등 실측 거리(여 20·남 21.5 mm)만큼 띄워 기울기를 골라 기댄 둥근 상자 몸통(겉면 볼록·아래판·앞주머니·"
            "뒤집힌 U 지퍼·주머니 지퍼·손잡이)과, 몸 위 길잡이 점을 지나 어깨를 넘어 가슴 앞으로 내려오는 패드 멜빵(끝으로 가늘어짐)·겨드랑이 아래를 돌아 "
            "아래 모서리로 가는 웨빙·조절 고리를 절차 생성. 몸통은 Spine1 강체(뒤판 둘레 6 cm 정점 아핀 맞춤), 멜빵·웨빙은 몸통·목 정점 최근접 스킨. "
            "후드(hoodie)는 등 위쪽 모자가 몸통과 겹쳐 충돌. 외부 에셋·생성 AI 없음(license: original)."
        ),
    )
)


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
