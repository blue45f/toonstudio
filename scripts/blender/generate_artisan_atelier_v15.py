"""ToonStudio Artisan Atelier V15 — 최상위 품질 웹툰 조형·건축·집기 플래그십 3D 모델 생성기 & 라이브 씬 구성을 겸하는 Blender 5.2 스크립트.

모든 에셋은:
1) 미터 단위(1 BU = 1m), 바닥 Z=0(glTF Y=0) 정렬
2) 수밀 2-매니폴드 지오메트리 (비매니폴드 모서리·열린 경계·고립 정점·와이어 모서리·0면적 면 0개 검증)
3) 다단 베벨(2~3세그먼트) + Catmull-Clark 서브디비전 + 가중 법선(WeightedNormal) + 스마트 UV 전개
4) Principled BSDF 물리 기반 재질(Roughness, Metallic, Coat, Sheen, Emission 정밀 보정)
을 준수하여 `apps/web/public/studio-assets/blender-artisan-v15/`에 GLB + 512px 스튜디오 썸네일 + provenance.json으로 출력한다.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Callable

import bmesh
import bpy
import mathutils
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from modeler_kit_v13_primitives import (  # noqa: E402
    add_beveled_box,
    add_fluted_column_shaft,
    add_involute_gear,
    add_lathe_solid,
    add_quad_sphere,
    add_tube_segment,
    clear_material_cache,
    create_mesh_object,
)

ROOT = SCRIPT_DIR.parents[1]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-artisan-v15"
THUMB_DIR = OUTPUT_DIR / "thumbnails"


def make_artisan_mat(
    name: str,
    color: tuple[float, float, float],
    roughness: float = 0.42,
    metallic: float = 0.0,
    coat_weight: float = 0.0,
    coat_roughness: float = 0.12,
    sheen_weight: float = 0.0,
    emission_color: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1.0)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if "Coat Weight" in bsdf.inputs and coat_weight > 0.0:
            bsdf.inputs["Coat Weight"].default_value = coat_weight
            bsdf.inputs["Coat Roughness"].default_value = coat_roughness
        if "Sheen Weight" in bsdf.inputs and sheen_weight > 0.0:
            bsdf.inputs["Sheen Weight"].default_value = sheen_weight
        if emission_color is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def add_swept_tapered_curve(
    bm: bmesh.types.BMesh,
    points: list[tuple[float, float, float]],
    radii: list[float],
    ring_segments: int = 10,
    flatten_xy: tuple[float, float] = (1.0, 0.58),
    keel_ridge: float = 0.0,
) -> list[bmesh.types.BMVert]:
    """3D 곡선 경로를 따라 가늘어지며 양 끝이 매니폴드로 닫힌 조형 헤어/리본/아암 솔리드.
    `keel_ridge > 0`이면 바깥쪽 능선이 살아 있는 웹툰/애니메이션 스타일 판상 헤어 단면을 형성한다.
    """
    if len(points) < 2 or len(points) != len(radii):
        raise ValueError("points and radii must match and have >= 2 stations")
    vecs = [Vector(p) for p in points]
    tangents: list[Vector] = []
    for i in range(len(vecs)):
        if i == 0:
            t = vecs[1] - vecs[0]
        elif i == len(vecs) - 1:
            t = vecs[-1] - vecs[-2]
        else:
            t = vecs[i + 1] - vecs[i - 1]
        tangents.append(t.normalized() if t.length > 1e-6 else Vector((0.0, 0.0, 1.0)))

    created: list[bmesh.types.BMVert] = []
    rings: list[list[bmesh.types.BMVert]] = []

    for pt, tan, rad in zip(vecs, tangents, radii):
        r = max(0.0020, rad)
        # Outward radial direction from head vertical axis so hair blades lie flat against the skull
        radial_out = Vector((pt.x, pt.y, 0.0))
        if radial_out.length < 1e-4:
            radial_out = Vector((0.0, -1.0, 0.0))
        else:
            radial_out.normalize()
        # Orthogonalize outward normal against tangent
        norm = radial_out - tan * radial_out.dot(tan)
        if norm.length < 1e-4:
            norm = Vector((0.0, -1.0, 0.0)).cross(tan)
        norm.normalize()
        binorm = tan.cross(norm).normalized()

        ring: list[bmesh.types.BMVert] = []
        for s in range(ring_segments):
            ang = (2.0 * math.pi * s) / ring_segments
            ca, sa = math.cos(ang), math.sin(ang)
            # Crisp keeled anime strand profile: wide ribbon along binorm, crested outer ridge along +norm
            crest = keel_ridge * (max(0.0, sa) ** 2.2) if keel_ridge > 0.0 else 0.0
            inner_flatten = 0.55 if sa < 0.0 and keel_ridge > 0.0 else 1.0
            offset = (
                binorm * (ca * r * flatten_xy[0])
                + norm * ((sa * flatten_xy[1] * inner_flatten + crest) * r)
            )
            v = bm.verts.new(pt + offset)
            ring.append(v)
            created.append(v)
        rings.append(ring)

    v_start = bm.verts.new(vecs[0] - tangents[0] * max(0.0018, radii[0] * 0.30))
    v_end = bm.verts.new(vecs[-1] + tangents[-1] * max(0.0018, radii[-1] * 0.55))
    created.extend((v_start, v_end))

    for s in range(ring_segments):
        sn = (s + 1) % ring_segments
        bm.faces.new((v_start, rings[0][sn], rings[0][s]))
    for k in range(len(rings) - 1):
        for s in range(ring_segments):
            sn = (s + 1) % ring_segments
            bm.faces.new((rings[k][s], rings[k][sn], rings[k + 1][sn], rings[k + 1][s]))
    for s in range(ring_segments):
        sn = (s + 1) % ring_segments
        bm.faces.new((v_end, rings[-1][s], rings[-1][sn]))
    return created


def add_closed_torus_ring(
    bm: bmesh.types.BMesh,
    major_radius: float,
    minor_radius: float,
    major_segs: int = 36,
    minor_segs: int = 12,
    center_xyz: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> list[bmesh.types.BMVert]:
    """수밀 사각면 토러스 링 (아스트롤라베·돔 테두리·조명 링용)."""
    rings: list[list[bmesh.types.BMVert]] = []
    created: list[bmesh.types.BMVert] = []
    rot_m = mathutils.Euler(rot_euler, "XYZ").to_matrix()
    center_v = Vector(center_xyz)
    for i in range(major_segs):
        u = (2.0 * math.pi * i) / major_segs
        cu, su = math.cos(u), math.sin(u)
        ring: list[bmesh.types.BMVert] = []
        for j in range(minor_segs):
            v = (2.0 * math.pi * j) / minor_segs
            rr = major_radius + minor_radius * math.cos(v)
            local_pt = Vector((rr * cu, rr * su, minor_radius * math.sin(v)))
            world_pt = center_v + (rot_m @ local_pt)
            vert = bm.verts.new(world_pt)
            ring.append(vert)
            created.append(vert)
        rings.append(ring)

    for i in range(major_segs):
        inext = (i + 1) % major_segs
        for j in range(minor_segs):
            jnext = (j + 1) % minor_segs
            bm.faces.new((rings[i][j], rings[inext][j], rings[inext][jnext], rings[i][jnext]))
    return created


def audit_mesh_defects(obj: bpy.types.Object) -> dict[str, int]:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary)
    boundary = sum(1 for e in bm.edges if e.is_boundary)
    wire_edges = sum(1 for e in bm.edges if e.is_wire)
    loose_verts = sum(1 for v in bm.verts if len(v.link_edges) == 0)
    zero_faces = sum(1 for f in bm.faces if f.calc_area() < 1e-9)
    bm.free()
    defects = {
        "nonManifoldEdges": non_manifold,
        "boundaryEdges": boundary,
        "wireEdges": wire_edges,
        "looseVertices": loose_verts,
        "zeroAreaFaces": zero_faces,
    }
    if any(v > 0 for v in defects.values()):
        raise RuntimeError(f"Mesh defect in {obj.name}: {defects}")
    return defects


# ---------------------------------------------------------------------------
# 1. 웹툰 주인공 하이-서브서프 조형 흉상 (Stylized Protagonist Sculpt Bust V15)
# ---------------------------------------------------------------------------
def build_stylized_protagonist_bust(scene: bpy.types.Scene) -> None:
    mat_porcelain = make_artisan_mat(
        "V15_WarmBisqueSkin", (0.95, 0.86, 0.80), roughness=0.36, coat_weight=0.14, coat_roughness=0.30
    )
    mat_hair = make_artisan_mat(
        "V15_MidnightVioletInkHair", (0.14, 0.15, 0.25), roughness=0.28, metallic=0.06, coat_weight=0.38, coat_roughness=0.18
    )
    mat_lash = make_artisan_mat("V15_CharcoalEyelash", (0.07, 0.07, 0.10), roughness=0.35)
    mat_sclera = make_artisan_mat("V15_EyeScleraPorcelain", (0.98, 0.98, 0.99), roughness=0.12, coat_weight=0.80)
    mat_iris = make_artisan_mat(
        "V15_SapphireIris",
        (0.20, 0.54, 0.86),
        roughness=0.08,
        coat_weight=0.95,
        emission_color=(0.14, 0.42, 0.75),
        emission_strength=0.45,
    )
    mat_cape = make_artisan_mat(
        "V15_AcademyTailoredNavy", (0.10, 0.13, 0.20), roughness=0.52, sheen_weight=0.48
    )
    mat_shirt = make_artisan_mat("V15_IvorySilkBlouse", (0.93, 0.91, 0.88), roughness=0.42, sheen_weight=0.25)
    mat_brass = make_artisan_mat(
        "V15_GildedAtelierBrass", (0.84, 0.67, 0.32), roughness=0.20, metallic=0.93, coat_weight=0.22
    )
    mat_gem = make_artisan_mat(
        "V15_CyanStarlightBrooch",
        (0.28, 0.82, 0.92),
        roughness=0.08,
        metallic=0.05,
        coat_weight=0.90,
        emission_color=(0.20, 0.68, 0.84),
        emission_strength=0.75,
    )

    # 1) Sculpted head + graceful neck & upper collarbone bust
    bm_skin = bmesh.new()
    head_v = add_quad_sphere(bm_skin, radius=0.195, divisions=12)
    for v in head_v:
        x, y, z = v.co.x, v.co.y, v.co.z
        if z < 0.0:
            t = min(1.0, -z / 0.195)
            # Clean anime V-line jaw + delicate chin
            v.co.x *= 1.0 - 0.45 * (t**0.88)
            if y < 0.0:
                chin = math.exp(-((x / 0.068) ** 2)) * 0.042 * t
                cheek = math.exp(-(((abs(x) - 0.082) / 0.045) ** 2)) * math.exp(-(((z + 0.045) / 0.055) ** 2)) * 0.014
                v.co.y -= chin + cheek
                v.co.z -= 0.032 * (t**1.25)
            else:
                v.co.y *= 1.0 - 0.22 * t
        else:
            v.co.z *= 1.06
            v.co.x *= 1.02

        if y < -0.05:
            # Subtle eye sockets, crisp anime nose tip, and soft lip mound
            for sx in (-0.062, 0.062):
                ed = math.hypot((x - sx) / 1.15, (z - 0.002) / 0.88)
                if ed < 0.052:
                    v.co.y += 0.019 * ((1.0 - ed / 0.052) ** 1.8)
            nd = math.hypot(x / 0.36, (z + 0.024) / 1.25)
            if nd < 0.038:
                v.co.y -= 0.028 * ((1.0 - nd / 0.038) ** 2.0)
            lip = math.hypot(x / 1.15, (z + 0.076) / 0.45)
            if lip < 0.028:
                v.co.y -= 0.010 * ((1.0 - lip / 0.028) ** 2.0)
        v.co.z += 0.675

    for side in (-1.0, 1.0):
        ear_v = add_quad_sphere(bm_skin, radius=0.036, divisions=4, scale_xyz=(0.36, 0.68, 1.32))
        bmesh.ops.rotate(
            bm_skin,
            cent=(0.0, 0.0, 0.0),
            matrix=mathutils.Euler((0.12, 0.0, side * -0.20), "XYZ").to_matrix().to_4x4(),
            verts=ear_v,
        )
        bmesh.ops.translate(bm_skin, vec=(side * 0.174, 0.008, 0.652), verts=ear_v)

    neck_v = add_lathe_solid(
        bm_skin,
        [(0.165, 0.28), (0.125, 0.34), (0.064, 0.42), (0.058, 0.55)],
        segments=28,
    )
    for v in neck_v:
        if v.co.z < 0.36:
            v.co.x *= 1.28
            v.co.y *= 0.74
    create_mesh_object(scene, "ProtagonistSkinBust", bm_skin, mat_porcelain, smooth=True, subsurf_levels=1)

    # 2) Expressive layered anime eyes (sclera + sapphire iris + catchlight) & sculpted eyelashes/brows
    bm_sclera = bmesh.new()
    bm_iris = bmesh.new()
    bm_lash = bmesh.new()
    for side in (-1.0, 1.0):
        ex = side * 0.062
        ey = -0.164
        ez = 0.676
        add_quad_sphere(bm_sclera, radius=0.030, divisions=5, center_xyz=(ex, ey, ez), scale_xyz=(1.08, 0.58, 0.94))
        add_quad_sphere(bm_iris, radius=0.021, divisions=5, center_xyz=(ex, ey - 0.011, ez - 0.001), scale_xyz=(0.95, 0.42, 1.06))
        # Catchlight pearl on upper-outer iris
        add_quad_sphere(bm_sclera, radius=0.0062, divisions=3, center_xyz=(ex + side * 0.007, ey - 0.019, ez + 0.008))

        # Sculpted upper eyelash wing + delicate eyebrow arc
        lash_pts = [
            (ex - side * 0.026, ey - 0.006, ez + 0.006),
            (ex, ey - 0.018, ez + 0.020),
            (ex + side * 0.028, ey - 0.010, ez + 0.014),
            (ex + side * 0.036, ey - 0.004, ez + 0.018),
        ]
        add_swept_tapered_curve(bm_lash, lash_pts, [0.0035, 0.0058, 0.0052, 0.0022], ring_segments=8, flatten_xy=(1.3, 0.65))

        brow_pts = [
            (ex - side * 0.024, ey - 0.008, ez + 0.044),
            (ex + side * 0.004, ey - 0.015, ez + 0.052),
            (ex + side * 0.030, ey - 0.006, ez + 0.045),
        ]
        add_swept_tapered_curve(bm_lash, brow_pts, [0.0035, 0.0042, 0.0020], ring_segments=8, flatten_xy=(1.2, 0.6))

    create_mesh_object(scene, "ProtagonistScleraAndCatchlight", bm_sclera, mat_sclera, smooth=True)
    create_mesh_object(scene, "ProtagonistSapphireIris", bm_iris, mat_iris, smooth=True)
    create_mesh_object(scene, "ProtagonistLashesAndBrows", bm_lash, mat_lash, smooth=True)

    # 3) Keeled ribbon-blade stylized webtoon hair (crown volume + parted fringe + side hime locks + twin rear cascade)
    bm_hair = bmesh.new()
    cap_v = add_quad_sphere(bm_hair, radius=0.206, divisions=9)
    for v in cap_v:
        # Carve away lower front face opening cleanly so bangs frame the eyes instead of covering them
        if v.co.y < -0.04 and v.co.z < 0.055:
            lift = (0.055 - v.co.z) * max(0.0, (-v.co.y - 0.04) / 0.16)
            v.co.z += lift * 0.92
            v.co.y *= 0.88
        v.co.z = v.co.z * 1.07 + 0.692
        v.co.y += 0.014

    # Swept parted fringe bangs framing the forehead & brows without hiding the eyes
    fringe_locks = [
        # Center-parted asymmetrical main bang locks
        ([(-0.012, -0.10, 0.875), (-0.024, -0.182, 0.805), (-0.015, -0.194, 0.735), (0.004, -0.188, 0.688)], [0.032, 0.036, 0.022, 0.0045]),
        ([(-0.048, -0.09, 0.870), (-0.078, -0.172, 0.795), (-0.088, -0.184, 0.725), (-0.076, -0.178, 0.682)], [0.034, 0.038, 0.024, 0.005]),
        ([(0.032, -0.095, 0.872), (0.058, -0.176, 0.800), (0.068, -0.186, 0.732), (0.055, -0.180, 0.690)], [0.034, 0.038, 0.024, 0.005]),
        ([(0.075, -0.080, 0.860), (0.118, -0.154, 0.785), (0.126, -0.165, 0.715)], [0.034, 0.034, 0.006]),
        ([(-0.085, -0.078, 0.858), (-0.124, -0.150, 0.782), (-0.130, -0.162, 0.712)], [0.034, 0.034, 0.006]),
        # Long cheek-framing side locks (draping gracefully past jawline onto shoulders)
        ([(-0.135, -0.045, 0.825), (-0.186, -0.115, 0.705), (-0.184, -0.128, 0.565), (-0.156, -0.132, 0.445), (-0.132, -0.125, 0.365)], [0.042, 0.044, 0.034, 0.020, 0.005]),
        ([(0.135, -0.045, 0.825), (0.186, -0.115, 0.705), (0.184, -0.128, 0.565), (0.156, -0.132, 0.445), (0.132, -0.125, 0.365)], [0.042, 0.044, 0.034, 0.020, 0.005]),
        # Secondary temple wisps
        ([(-0.162, 0.005, 0.790), (-0.212, -0.045, 0.665), (-0.205, -0.058, 0.525), (-0.182, -0.052, 0.425)], [0.038, 0.038, 0.026, 0.006]),
        ([(0.162, 0.005, 0.790), (0.212, -0.045, 0.665), (0.205, -0.058, 0.525), (0.182, -0.052, 0.425)], [0.038, 0.038, 0.026, 0.006]),
    ]
    for pts, rads in fringe_locks:
        add_swept_tapered_curve(bm_hair, pts, rads, ring_segments=10, flatten_xy=(1.42, 0.36), keel_ridge=0.42)

    # Signature crown ahoge lock
    add_swept_tapered_curve(
        bm_hair,
        [(-0.008, -0.02, 0.885), (0.028, -0.055, 0.955), (-0.012, -0.075, 1.005), (-0.035, -0.068, 0.985)],
        [0.020, 0.018, 0.011, 0.0035],
        ring_segments=8,
        flatten_xy=(1.35, 0.38),
        keel_ridge=0.35,
    )

    # Layered rear hair silhouette (11 overlapping blade locks)
    for idx in range(11):
        ang = math.radians(-78.0 + idx * (156.0 / 10.0))
        sx, cy = math.sin(ang), math.cos(ang)
        flare = 0.035 * ((idx % 2) - 0.5)
        pts = [
            (sx * 0.165, cy * 0.145 + 0.035, 0.815),
            (sx * 0.215, cy * 0.195 + 0.045, 0.660),
            (sx * (0.232 + flare), cy * 0.220 + 0.060, 0.495),
            (sx * (0.210 + flare), cy * 0.235 + 0.078, 0.355),
        ]
        add_swept_tapered_curve(bm_hair, pts, [0.048, 0.050, 0.036, 0.008], ring_segments=10, flatten_xy=(1.45, 0.38), keel_ridge=0.38)

    create_mesh_object(scene, "ProtagonistSculptedHair", bm_hair, mat_hair, smooth=True, subsurf_levels=1)

    # 4) Ivory inner blouse collar + pleated frontjabots
    bm_shirt = bmesh.new()
    add_lathe_solid(
        bm_shirt,
        [(0.155, 0.28), (0.132, 0.35), (0.088, 0.435), (0.084, 0.465)],
        segments=28,
        scale_xyz=(1.12, 0.86, 1.0),
    )
    add_beveled_box(bm_shirt, (0.085, 0.032, 0.13), (0.0, -0.118, 0.345), 0.006, segments=2, rot_euler=(0.24, 0.0, 0.0))
    create_mesh_object(scene, "ProtagonistSilkBlouse", bm_shirt, mat_shirt, smooth=True, weighted_normals=True)

    # 5) Tailored academy shoulder capelet with structured lapels
    bm_cape = bmesh.new()
    cape_v = add_lathe_solid(
        bm_cape,
        [(0.285, 0.140), (0.305, 0.195), (0.258, 0.285), (0.175, 0.355), (0.132, 0.415)],
        segments=36,
        scale_xyz=(1.26, 0.80, 1.0),
    )
    for v in cape_v:
        # Subtle V-opening indent on front chest so ivory blouse & brooch read crisply
        if v.co.y < -0.08 and v.co.z > 0.26:
            indent = math.exp(-((v.co.x / 0.065) ** 2)) * ((v.co.z - 0.26) / 0.16)
            v.co.y += 0.028 * indent
    for side in (-1.0, 1.0):
        add_beveled_box(
            bm_cape,
            (0.036, 0.14, 0.125),
            (side * 0.098, -0.072, 0.405),
            0.006,
            segments=2,
            rot_euler=(0.18, side * -0.32, side * 0.24),
        )
    create_mesh_object(scene, "ProtagonistAcademyCape", bm_cape, mat_cape, smooth=True, weighted_normals=True)

    # 6) Stepped brass atelier plinth + shoulder braid trim + starlight brooch bezel
    bm_brass = bmesh.new()
    add_lathe_solid(
        bm_brass,
        [
            (0.275, 0.0),
            (0.275, 0.022),
            (0.238, 0.042),
            (0.196, 0.092),
            (0.232, 0.120),
            (0.252, 0.142),
        ],
        segments=44,
    )
    for side in (-1.0, 1.0):
        add_beveled_box(
            bm_brass,
            (0.105, 0.085, 0.024),
            (side * 0.265, -0.01, 0.295),
            0.006,
            segments=2,
            rot_euler=(0.0, side * 0.35, 0.0),
        )
    add_lathe_solid(
        bm_brass,
        [(0.034, -0.010), (0.038, 0.008), (0.027, 0.016)],
        segments=20,
        center_xyz=(0.0, -0.138, 0.355),
        rot_euler=(math.pi * 0.5 - 0.22, 0.0, 0.0),
    )
    create_mesh_object(scene, "ProtagonistPedestalAndTrim", bm_brass, mat_brass, smooth=True, weighted_normals=True)

    bm_gem = bmesh.new()
    add_quad_sphere(bm_gem, radius=0.021, divisions=5, center_xyz=(0.0, -0.148, 0.357), scale_xyz=(0.86, 0.50, 1.18))
    create_mesh_object(scene, "ProtagonistStarlightGem", bm_gem, mat_gem, smooth=True)


# ---------------------------------------------------------------------------
# 2. 천구 잉크 아스트롤라베 턴테이블 (Celestial Ink Astrolabe Turntable V15)
# ---------------------------------------------------------------------------
def build_celestial_ink_astrolabe(scene: bpy.types.Scene) -> None:
    mat_walnut = make_artisan_mat("V15_AgedWalnutBase", (0.28, 0.17, 0.10), roughness=0.38, coat_weight=0.25)
    mat_brass = make_artisan_mat("V15_InstrumentBrass", (0.84, 0.67, 0.31), roughness=0.20, metallic=0.94)
    mat_copper = make_artisan_mat("V15_BurnishedCopper", (0.78, 0.43, 0.28), roughness=0.26, metallic=0.90)
    mat_ink = make_artisan_mat(
        "V15_LuminousSapphireInk",
        (0.18, 0.56, 0.88),
        roughness=0.08,
        metallic=0.10,
        coat_weight=0.90,
        emission_color=(0.14, 0.48, 0.82),
        emission_strength=0.85,
    )

    bm_wood = bmesh.new()
    add_lathe_solid(
        bm_wood,
        [(0.46, 0.0), (0.46, 0.032), (0.42, 0.055), (0.38, 0.082), (0.40, 0.105)],
        segments=44,
    )
    create_mesh_object(scene, "AstrolabeWalnutPlinth", bm_wood, mat_walnut, smooth=True, weighted_normals=True)

    bm_brass = bmesh.new()
    add_closed_torus_ring(bm_brass, 0.39, 0.018, major_segs=44, minor_segs=12, center_xyz=(0.0, 0.0, 0.105))
    add_involute_gear(bm_brass, pitch_radius=0.26, teeth=24, thickness=0.032, bore_radius=0.055, center_xyz=(0.0, 0.0, 0.125))

    for k in range(4):
        ang = math.radians(45.0 + k * 90.0)
        px, py = 0.34 * math.cos(ang), 0.34 * math.sin(ang)
        add_lathe_solid(
            bm_brass,
            [(0.028, 0.10), (0.018, 0.16), (0.022, 0.28), (0.016, 0.40), (0.028, 0.46)],
            segments=16,
            center_xyz=(px, py, 0.0),
        )

    add_closed_torus_ring(bm_brass, 0.35, 0.020, major_segs=44, minor_segs=12, center_xyz=(0.0, 0.0, 0.47))
    add_closed_torus_ring(
        bm_brass, 0.31, 0.018, major_segs=44, minor_segs=12, center_xyz=(0.0, 0.0, 0.47), rot_euler=(math.pi * 0.5, 0.0, 0.35)
    )
    add_lathe_solid(
        bm_brass,
        [(0.042, 0.10), (0.022, 0.18), (0.016, 0.78), (0.032, 0.82), (0.008, 0.90)],
        segments=20,
    )
    add_swept_tapered_curve(
        bm_brass,
        [(-0.24, -0.32, 0.135), (0.02, -0.30, 0.165), (0.22, -0.28, 0.195), (0.28, -0.27, 0.205)],
        [0.016, 0.014, 0.010, 0.003],
        ring_segments=12,
        flatten_xy=(1.0, 1.0),
    )
    create_mesh_object(scene, "AstrolabeBrassMechanism", bm_brass, mat_brass, smooth=True, weighted_normals=True)

    bm_copper = bmesh.new()
    add_closed_torus_ring(
        bm_copper, 0.24, 0.015, major_segs=40, minor_segs=12, center_xyz=(0.0, 0.0, 0.47), rot_euler=(0.98, 0.42, 0.0)
    )
    add_closed_torus_ring(
        bm_copper, 0.175, 0.013, major_segs=36, minor_segs=10, center_xyz=(0.0, 0.0, 0.47), rot_euler=(-0.72, 0.55, 0.25)
    )
    add_involute_gear(
        bm_copper, pitch_radius=0.125, teeth=16, thickness=0.026, bore_radius=0.028, center_xyz=(0.19, 0.0, 0.155), phase=0.2
    )
    create_mesh_object(scene, "AstrolabeCopperRings", bm_copper, mat_copper, smooth=True, weighted_normals=True)

    bm_core = bmesh.new()
    add_quad_sphere(bm_core, radius=0.088, divisions=7, center_xyz=(0.0, 0.0, 0.47))
    create_mesh_object(scene, "AstrolabeSapphireCore", bm_core, mat_ink, smooth=True, subsurf_levels=1)


# ---------------------------------------------------------------------------
# 3. 로판 왕실 온실 돔 파빌리온 (Royal Conservatory Dome Gazebo V15)
# ---------------------------------------------------------------------------
def build_royal_conservatory_gazebo(scene: bpy.types.Scene) -> None:
    mat_marble = make_artisan_mat("V15_CreamLimestone", (0.88, 0.85, 0.79), roughness=0.46)
    mat_bronze = make_artisan_mat("V15_ConservatoryBronze", (0.16, 0.19, 0.22), roughness=0.30, metallic=0.84)
    mat_gold = make_artisan_mat("V15_RoyalFinialGold", (0.85, 0.68, 0.32), roughness=0.22, metallic=0.92)
    mat_glass = make_artisan_mat(
        "V15_ConservatorySkyGlass",
        (0.46, 0.68, 0.86),
        roughness=0.12,
        metallic=0.08,
        coat_weight=0.80,
        emission_color=(0.24, 0.42, 0.62),
        emission_strength=0.35,
    )

    bm_stone = bmesh.new()
    add_lathe_solid(
        bm_stone,
        [(1.48, 0.0), (1.48, 0.09), (1.36, 0.10), (1.36, 0.19), (1.26, 0.20)],
        segments=32,
    )
    col_ring_r = 1.08
    for idx in range(8):
        ang = (2.0 * math.pi * idx) / 8.0
        cx, cy = col_ring_r * math.cos(ang), col_ring_r * math.sin(ang)
        add_beveled_box(bm_stone, (0.24, 0.24, 0.12), (cx, cy, 0.26), 0.010, segments=2, rot_euler=(0.0, 0.0, ang))
        add_fluted_column_shaft(
            bm_stone,
            base_radius=0.082,
            top_radius=0.072,
            height=1.62,
            flutes=12,
            flute_depth=0.006,
            entasis=0.008,
            z_divisions=10,
            center_xyz=(cx, cy, 0.32),
        )
        add_lathe_solid(
            bm_stone,
            [(0.076, 1.94), (0.112, 2.00), (0.126, 2.05)],
            segments=18,
            center_xyz=(cx, cy, 0.0),
        )
        add_beveled_box(bm_stone, (0.26, 0.26, 0.08), (cx, cy, 2.09), 0.008, segments=2, rot_euler=(0.0, 0.0, ang))

    add_closed_torus_ring(bm_stone, col_ring_r, 0.085, major_segs=48, minor_segs=12, center_xyz=(0.0, 0.0, 2.18))
    create_mesh_object(scene, "ConservatoryStoneColonnade", bm_stone, mat_marble, smooth=True, weighted_normals=True)

    bm_bronze = bmesh.new()
    add_closed_torus_ring(bm_bronze, 1.06, 0.036, major_segs=48, minor_segs=10, center_xyz=(0.0, 0.0, 2.28))
    add_closed_torus_ring(bm_bronze, 0.78, 0.026, major_segs=40, minor_segs=10, center_xyz=(0.0, 0.0, 2.74))
    add_closed_torus_ring(bm_bronze, 0.34, 0.024, major_segs=32, minor_segs=10, center_xyz=(0.0, 0.0, 3.12))

    for idx in range(16):
        ang = (2.0 * math.pi * idx) / 16.0
        ca, sa = math.cos(ang), math.sin(ang)
        rib_pts = [
            (1.06 * ca, 1.06 * sa, 2.28),
            (0.95 * ca, 0.95 * sa, 2.56),
            (0.74 * ca, 0.74 * sa, 2.82),
            (0.42 * ca, 0.42 * sa, 3.08),
            (0.16 * ca, 0.16 * sa, 3.22),
        ]
        add_swept_tapered_curve(bm_bronze, rib_pts, [0.026, 0.024, 0.021, 0.018, 0.014], ring_segments=8, flatten_xy=(1.0, 1.0))

    create_mesh_object(scene, "ConservatoryBronzeRibs", bm_bronze, mat_bronze, smooth=True, weighted_normals=True)

    bm_glass = bmesh.new()
    add_lathe_solid(
        bm_glass,
        [(1.02, 2.29), (0.91, 2.55), (0.71, 2.80), (0.40, 3.05), (0.14, 3.20)],
        segments=32,
    )
    create_mesh_object(scene, "ConservatoryDomeGlass", bm_glass, mat_glass, smooth=True)

    bm_gold = bmesh.new()
    add_lathe_solid(
        bm_gold,
        [(0.18, 3.20), (0.14, 3.28), (0.06, 3.38), (0.09, 3.46), (0.012, 3.68)],
        segments=24,
    )
    create_mesh_object(scene, "ConservatoryGoldFinial", bm_gold, mat_gold, smooth=True, weighted_normals=True)


# ---------------------------------------------------------------------------
# 4. 작가용 틸트 드래프팅 이젤 & 황동 관절 램프 (Artisan Drafting Easel & Lamp V15)
# ---------------------------------------------------------------------------
def build_artisan_drafting_easel(scene: bpy.types.Scene) -> None:
    mat_oak = make_artisan_mat("V15_DraftingWarmOak", (0.54, 0.36, 0.21), roughness=0.42, coat_weight=0.20)
    mat_frame = make_artisan_mat("V15_AnodizedGraphite", (0.14, 0.15, 0.18), roughness=0.34, metallic=0.82)
    mat_brass = make_artisan_mat("V15_LampArticulatedBrass", (0.83, 0.66, 0.31), roughness=0.22, metallic=0.92)
    mat_screen = make_artisan_mat(
        "V15_CanvasPenDisplay",
        (0.92, 0.94, 0.97),
        roughness=0.16,
        coat_weight=0.65,
        emission_color=(0.76, 0.84, 0.96),
        emission_strength=0.45,
    )
    mat_ink_panel = make_artisan_mat(
        "V15_ComicPanelAccent",
        (0.24, 0.42, 0.68),
        roughness=0.22,
        emission_color=(0.18, 0.36, 0.62),
        emission_strength=0.35,
    )
    mat_bulb = make_artisan_mat(
        "V15_WarmTungstenBulb",
        (1.0, 0.90, 0.68),
        roughness=0.14,
        emission_color=(1.0, 0.84, 0.52),
        emission_strength=1.6,
    )

    bm_metal = bmesh.new()
    for sx in (-0.64, 0.64):
        add_beveled_box(bm_metal, (0.065, 0.72, 0.045), (sx, 0.0, 0.0225), 0.006, segments=2)
        add_tube_segment(bm_metal, (sx, -0.26, 0.045), (sx, -0.10, 0.74), 0.026, 0.022, segments=12)
        add_tube_segment(bm_metal, (sx, 0.26, 0.045), (sx, 0.12, 0.74), 0.026, 0.022, segments=12)
    add_tube_segment(bm_metal, (-0.64, 0.06, 0.24), (0.64, 0.06, 0.24), 0.020, 0.020, segments=12)
    add_beveled_box(bm_metal, (1.42, 0.48, 0.036), (0.0, 0.02, 0.755), 0.005, segments=2)
    tilt = math.radians(24.0)
    add_beveled_box(bm_metal, (0.78, 0.49, 0.028), (-0.12, -0.02, 0.92), 0.006, segments=2, rot_euler=(tilt, 0.0, 0.0))
    # Express shortcut dial puck on left side of desk
    add_lathe_solid(
        bm_metal,
        [(0.058, 0.816), (0.056, 0.832), (0.038, 0.836), (0.036, 0.850)],
        segments=24,
        center_xyz=(-0.62, -0.16, 0.0),
    )
    add_tube_segment(bm_metal, (-0.12, 0.12, 0.77), (-0.12, 0.04, 0.96), 0.018, 0.015, segments=10)
    create_mesh_object(scene, "DraftingAnodizedFrame", bm_metal, mat_frame, smooth=True, weighted_normals=True)

    bm_oak = bmesh.new()
    add_beveled_box(bm_oak, (1.62, 0.82, 0.042), (0.0, 0.0, 0.795), 0.008, segments=3)
    add_beveled_box(bm_oak, (0.82, 0.035, 0.024), (-0.12, -0.24, 0.828), 0.005, segments=2)
    add_lathe_solid(
        bm_oak,
        [(0.056, 0.816), (0.060, 0.86), (0.052, 0.95), (0.056, 0.965)],
        segments=24,
        center_xyz=(0.54, -0.14, 0.0),
    )
    create_mesh_object(scene, "DraftingOakDesktop", bm_oak, mat_oak, smooth=True, weighted_normals=True)

    bm_screen = bmesh.new()
    add_beveled_box(bm_screen, (0.69, 0.41, 0.010), (-0.12, -0.026, 0.934), 0.002, segments=1, rot_euler=(tilt, 0.0, 0.0))
    create_mesh_object(scene, "DraftingCanvasSurface", bm_screen, mat_screen, smooth=True)

    # Stylized 3-panel webtoon layout blocks on the display surface
    bm_panels = bmesh.new()
    panel_rot = (tilt, 0.0, 0.0)
    add_beveled_box(bm_panels, (0.28, 0.15, 0.006), (-0.25, -0.068, 0.968), 0.0015, segments=1, rot_euler=panel_rot)
    add_beveled_box(bm_panels, (0.28, 0.15, 0.006), (0.05, -0.068, 0.968), 0.0015, segments=1, rot_euler=panel_rot)
    add_beveled_box(bm_panels, (0.58, 0.14, 0.006), (-0.10, 0.072, 0.905), 0.0015, segments=1, rot_euler=panel_rot)
    create_mesh_object(scene, "DraftingWebtoonPanels", bm_panels, mat_ink_panel, smooth=True)

    bm_brass = bmesh.new()
    lx, ly = 0.58, 0.22
    add_lathe_solid(
        bm_brass,
        [(0.088, 0.816), (0.082, 0.842), (0.036, 0.865)],
        segments=24,
        center_xyz=(lx, ly, 0.0),
    )
    p0 = (lx, ly, 0.86)
    p1 = (lx + 0.06, ly + 0.06, 1.24)
    p2 = (lx - 0.24, ly - 0.14, 1.44)
    add_tube_segment(bm_brass, p0, p1, 0.014, 0.013, segments=12)
    add_quad_sphere(bm_brass, radius=0.024, divisions=4, center_xyz=p1)
    add_tube_segment(bm_brass, p1, p2, 0.013, 0.011, segments=12)
    add_quad_sphere(bm_brass, radius=0.022, divisions=4, center_xyz=p2)
    add_lathe_solid(
        bm_brass,
        [(0.115, -0.08), (0.085, -0.02), (0.036, 0.05), (0.022, 0.08)],
        segments=24,
        center_xyz=(p2[0] - 0.05, p2[1] - 0.04, p2[2] - 0.05),
        rot_euler=(0.45, -0.35, 0.0),
    )
    for dx, dy, rx, ry in ((-0.018, 0.0, 0.14, -0.10), (0.016, -0.012, -0.10, 0.16), (0.0, 0.018, 0.18, 0.08)):
        add_swept_tapered_curve(
            bm_brass,
            [(0.54 + dx, -0.14 + dy, 0.90), (0.54 + dx + ry * 0.16, -0.14 + dy + rx * 0.16, 1.09)],
            [0.007, 0.0025],
            ring_segments=8,
            flatten_xy=(1.0, 1.0),
        )
    create_mesh_object(scene, "DraftingBrassLampAndStylus", bm_brass, mat_brass, smooth=True, weighted_normals=True)

    bm_bulb = bmesh.new()
    add_quad_sphere(bm_bulb, radius=0.042, divisions=5, center_xyz=(p2[0] - 0.07, p2[1] - 0.06, p2[2] - 0.09))
    create_mesh_object(scene, "DraftingWarmBulb", bm_bulb, mat_bulb, smooth=True)


ASSET_SPECS: list[tuple[str, str, str, str, str, Callable[[bpy.types.Scene], None]]] = [
    (
        "webtoon-stylized-protagonist-bust-v15",
        "웹툰 주인공 하이-서브서프 조형 흉상 (V15)",
        "Stylized Protagonist Sculpt Bust V15",
        "판상 능선 헤어·사파이어 홍채·속눈썹·아카데미 케이프 조형 흉상",
        "Keeled ribbon hair, sapphire eyes & academy capelet bust",
        build_stylized_protagonist_bust,
    ),
    (
        "webtoon-celestial-ink-astrolabe-turntable-v15",
        "천구 잉크 아스트롤라베·기어 턴테이블 (V15)",
        "Celestial Ink Astrolabe Turntable V15",
        "월넛 좌대·인볼류트 황동 기어·경사 천구 링·사파이어 잉크 코어",
        "Walnut plinth, involute brass gears & sapphire ink core",
        build_celestial_ink_astrolabe,
    ),
    (
        "webtoon-royal-conservatory-dome-gazebo-v15",
        "로판 왕실 온실 돔·열주 파빌리온 (V15)",
        "Royal Conservatory Dome Gazebo V15",
        "8주 배흘림 석조 열주·16리브 브론즈 유리 돔·골드 피니얼 정자",
        "8 fluted columns, 16-rib bronze glass cupola & finial",
        build_royal_conservatory_gazebo,
    ),
    (
        "webtoon-artisan-drafting-easel-lamp-v15",
        "작가용 틸트 드래프팅 이젤·황동 램프 (V15)",
        "Artisan Drafting Easel & Brass Lamp V15",
        "원목 드래프팅 데스크·3컷 액정 캔버스·단축 다이얼·관절 황동 램프",
        "Oak drafting desk, 3-panel pen display & articulated brass lamp",
        build_artisan_drafting_easel,
    ),
]


def ground_scene_meshes(scene: bpy.types.Scene) -> None:
    min_z = float("inf")
    mesh_objs = [o for o in scene.objects if o.type == "MESH"]
    for obj in mesh_objs:
        for corner in obj.bound_box:
            world_pt = obj.matrix_world @ Vector(corner)
            min_z = min(min_z, world_pt.z)
    if math.isfinite(min_z) and abs(min_z) > 1e-6:
        for obj in mesh_objs:
            obj.location.z -= min_z
        bpy.context.view_layer.update()


def compute_scene_bounds(mesh_objs: list[bpy.types.Object]) -> tuple[Vector, float]:
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in mesh_objs:
        for corner in obj.bound_box:
            wp = obj.matrix_world @ Vector(corner)
            mins.x, mins.y, mins.z = min(mins.x, wp.x), min(mins.y, wp.y), min(mins.z, wp.z)
            maxs.x, maxs.y, maxs.z = max(maxs.x, wp.x), max(maxs.y, wp.y), max(maxs.z, wp.z)
    center = (mins + maxs) * 0.5
    radius = max(0.25, (maxs - mins).length * 0.5)
    return center, radius


def render_thumbnail(scene: bpy.types.Scene, mesh_objs: list[bpy.types.Object], out_png: Path) -> None:
    center, radius = compute_scene_bounds(mesh_objs)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("ThumbWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (0.055, 0.064, 0.092, 1.0)
        bg.inputs[1].default_value = 0.85
    scene.world = world

    cam_data = bpy.data.cameras.new("ThumbCam")
    cam_data.lens = 56.0
    cam_obj = bpy.data.objects.new("ThumbCam", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.45
    cam_obj.location = center + Vector((dist * 0.56, -dist * 0.98, dist * 0.36))
    direction = (center - cam_obj.location).normalized()
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("ThumbKey", 450.0, (1.0, 0.96, 0.90), (radius * 2.1, -radius * 2.0, radius * 2.4)),
        ("ThumbFill", 210.0, (0.74, 0.86, 1.0), (-radius * 2.3, -radius * 1.4, radius * 1.2)),
        ("ThumbRim", 310.0, (0.96, 0.80, 0.58), (-radius * 0.5, radius * 2.3, radius * 2.0)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy * max(0.4, (radius / 1.1) ** 2)
        ldata.color = color
        ldata.size = radius * 1.6
        lobj = bpy.data.objects.new(lname, ldata)
        scene.collection.objects.link(lobj)
        lobj.location = center + Vector(offset)
        lobj.rotation_euler = (center - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()
        lights.append(lobj)

    scene.render.filepath = str(out_png)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True, scene=scene.name)

    for lobj in lights:
        bpy.data.objects.remove(lobj, do_unlink=True)
    bpy.data.objects.remove(cam_obj, do_unlink=True)
    bpy.data.worlds.remove(world)


def clear_scene(scene: bpy.types.Scene) -> None:
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
        for block in list(col):
            if block.users == 0:
                col.remove(block)
    clear_material_cache()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export_all_v15_assets() -> list[dict[str, object]]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    # Remove cached V15 materials so tweaked colors/roughness regenerate cleanly
    for mat in list(bpy.data.materials):
        if mat.name.startswith("V15_"):
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("ArtisanV15_Export") or bpy.data.scenes.new("ArtisanV15_Export")
    export_scene.unit_settings.system = "METRIC"
    export_scene.unit_settings.scale_length = 1.0
    prev_scene = bpy.context.window.scene if bpy.context.window is not None else None
    if bpy.context.window is not None:
        bpy.context.window.scene = export_scene

    manifest: list[dict[str, object]] = []
    for slug, label_ko, label_en, desc_ko, desc_en, builder in ASSET_SPECS:
        clear_scene(export_scene)
        builder(export_scene)
        ground_scene_meshes(export_scene)
        mesh_objs = [o for o in export_scene.objects if o.type == "MESH"]
        total_verts = 0
        total_faces = 0
        total_tris = 0
        for obj in mesh_objs:
            audit_mesh_defects(obj)
            obj.data.calc_loop_triangles()
            total_verts += len(obj.data.vertices)
            total_faces += len(obj.data.polygons)
            total_tris += len(obj.data.loop_triangles)

        thumb_path = THUMB_DIR / f"{slug}.png"
        render_thumbnail(export_scene, mesh_objs, thumb_path)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["asset_generator"] = "scripts/blender/generate_artisan_atelier_v15.py"
        root["asset_license"] = "CC0-1.0"
        root["units"] = "metres"
        export_scene.collection.objects.link(root)
        for obj in mesh_objs:
            obj.parent = root

        glb_path = OUTPUT_DIR / f"{slug}.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(glb_path),
            export_format="GLB",
            use_active_scene=True,
            export_apply=True,
            export_extras=True,
            export_materials="EXPORT",
            export_cameras=False,
            export_lights=False,
            export_animations=False,
        )
        manifest.append(
            {
                "slug": slug,
                "file": f"{slug}.glb",
                "thumbnail": f"thumbnails/{slug}.png",
                "labelKo": label_ko,
                "labelEn": label_en,
                "descKo": desc_ko,
                "descEn": desc_en,
                "bytes": glb_path.stat().st_size,
                "sha256": sha256_file(glb_path),
                "thumbBytes": thumb_path.stat().st_size,
                "thumbSha256": sha256_file(thumb_path),
                "vertices": total_verts,
                "faces": total_faces,
                "triangles": total_tris,
                "drawCalls": len(mesh_objs),
            }
        )

    clear_scene(export_scene)
    if prev_scene is not None and bpy.context.window is not None:
        bpy.context.window.scene = prev_scene
    bpy.data.scenes.remove(export_scene)

    prov = {
        "schema": "toonstudio.blender-artisan-atelier-assets.v15",
        "createdAt": "2026-11-17",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": "Blender 5.2.0 LTS (scripts/blender/generate_artisan_atelier_v15.py · manifold 0-defect verified)",
        "tool": "Blender 5.2.0 LTS",
        "units": "meter",
        "upAxis": "Y",
        "externalSources": [],
        "files": [
            {
                "file": m["file"],
                "bytes": m["bytes"],
                "sha256": m["sha256"],
                "triangles": m["triangles"],
                "vertices": m["vertices"],
            }
            for m in sorted(manifest, key=lambda r: str(r["file"]))
        ],
        "thumbnails": [
            {
                "file": m["thumbnail"],
                "bytes": m["thumbBytes"],
                "sha256": m["thumbSha256"],
            }
            for m in sorted(manifest, key=lambda r: str(r["thumbnail"]))
        ],
    }
    (OUTPUT_DIR / "provenance.json").write_text(json.dumps(prov, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    license_rows = "\n".join(
        f"- `{m['file']}` — {m['labelKo']} ({m['triangles']} tris, SHA-256 `{m['sha256']}`)"
        for m in sorted(manifest, key=lambda r: str(r["file"]))
    )
    (OUTPUT_DIR / "LICENSES.md").write_text(
        "# ToonStudio Blender Artisan Atelier Kit V15 — 라이선스 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        "- 제작: ToonStudio (`scripts/blender/generate_artisan_atelier_v15.py`, Blender 5.2.0 LTS)\n"
        "- 검증: 비매니폴드 모서리 0 · 열린 경계 0 · 고립 정점 0 · 0면적 면 0\n\n"
        "## 포함 파일 목록\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return manifest


def populate_live_showcase_scene() -> dict[str, object]:
    """라이브 Blender `Scene`에 4대 플래그십 조형물과 Starlight 아틀리에 무대를 한눈에 감상할 수 있도록 배치."""
    live_scene = bpy.data.scenes.get("Scene") or bpy.context.scene
    if bpy.context.window is not None:
        bpy.context.window.scene = live_scene

    for obj in list(live_scene.objects):
        if obj.type in ("MESH", "EMPTY"):
            bpy.data.objects.remove(obj, do_unlink=True)

    mat_stage = make_artisan_mat("V15_StarlightCyclorama", (0.065, 0.075, 0.102), roughness=0.58, metallic=0.06)
    mat_rim = make_artisan_mat("V15_StageBrassInlay", (0.78, 0.61, 0.28), roughness=0.24, metallic=0.90)

    bm_stage = bmesh.new()
    add_lathe_solid(bm_stage, [(4.2, -0.09), (4.2, 0.0), (3.95, 0.014)], segments=72)
    create_mesh_object(live_scene, "AtelierShowcaseStage", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_inlay = bmesh.new()
    add_closed_torus_ring(bm_inlay, 3.85, 0.016, major_segs=72, minor_segs=10, center_xyz=(0.0, 0.0, 0.015))
    create_mesh_object(live_scene, "AtelierStageBrassInlay", bm_inlay, mat_rim, smooth=True, weighted_normals=True)

    placements = [
        ("Artisan_Protagonist_Bust", build_stylized_protagonist_bust, (-0.52, -1.05, 0.014), 0.20, 1.48),
        ("Artisan_Celestial_Astrolabe", build_celestial_ink_astrolabe, (0.76, -0.95, 0.014), -0.30, 1.22),
        ("Artisan_Drafting_Easel", build_artisan_drafting_easel, (-1.45, 0.58, 0.014), 0.34, 1.05),
        ("Artisan_Royal_Conservatory", build_royal_conservatory_gazebo, (1.22, 0.92, 0.014), -0.26, 0.80),
    ]

    for group_name, builder, loc, rot_z, scale_f in placements:
        before = set(live_scene.objects)
        builder(live_scene)
        created = [o for o in live_scene.objects if o not in before and o.type == "MESH"]
        min_z = min((o.matrix_world @ Vector(c)).z for o in created for c in o.bound_box)
        grp = bpy.data.objects.new(group_name, None)
        live_scene.collection.objects.link(grp)
        for o in created:
            o.location.z -= min_z
            o.parent = grp
        grp.location = loc
        grp.rotation_euler = (0.0, 0.0, rot_z)
        grp.scale = (scale_f, scale_f, scale_f)

    # Set calm Starlight dark world & camera framing
    if live_scene.world is None:
        live_scene.world = bpy.data.worlds.new("AtelierLiveWorld")
    live_scene.world.use_nodes = True
    bg = live_scene.world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (0.048, 0.056, 0.080, 1.0)
        bg.inputs[1].default_value = 0.75

    cam = live_scene.camera
    if cam is None:
        cdata = bpy.data.cameras.new("Camera")
        cam = bpy.data.objects.new("Camera", cdata)
        live_scene.collection.objects.link(cam)
        live_scene.camera = cam
    cam.data.lens = 46.0
    cam.location = Vector((3.45, -4.85, 2.55))
    look_target = Vector((0.0, -0.05, 1.05))
    cam.rotation_euler = (look_target - cam.location).normalized().to_track_quat("-Z", "Y").to_euler()

    # Align active 3D Viewport to camera view & Material Preview shading
    if bpy.context.window is not None and bpy.context.screen is not None:
        for area in bpy.context.screen.areas:
            if area.type == "VIEW_3D":
                for space in area.spaces:
                    if space.type == "VIEW_3D":
                        space.shading.type = "MATERIAL"
                        space.overlay.show_floor = False
                        space.overlay.show_ortho_grid = False
                        if space.region_3d is not None:
                            space.region_3d.view_perspective = "CAMERA"

    bpy.context.view_layer.update()
    mesh_count = sum(1 for o in live_scene.objects if o.type == "MESH")
    tri_count = 0
    for o in live_scene.objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tri_count += len(o.data.loop_triangles)
    return {"liveMeshObjects": mesh_count, "liveTriangles": tri_count}


if __name__ == "__main__":
    exported = export_all_v15_assets()
    live_stats = populate_live_showcase_scene()
    print(json.dumps({"exported": exported, "liveScene": live_stats}, indent=2, ensure_ascii=False))
