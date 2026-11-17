"""ToonStudio Artisan Atelier V15 — 최상위 품질 웹툰 캐릭터 조형·로판·판타지·스테이지 플래그십 3D 모델 8종 생성기 & 라이브 씬 쇼케이스 (Blender 5.2/5.3).
"""

from __future__ import annotations

import hashlib
import json
import math
import struct
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
        radial_out = Vector((pt.x, pt.y, 0.0))
        radial_out = Vector((0.0, -1.0, 0.0)) if radial_out.length < 1e-4 else radial_out.normalized()
        norm = radial_out - tan * radial_out.dot(tan)
        if norm.length < 1e-4:
            norm = Vector((0.0, -1.0, 0.0)).cross(tan)
        norm.normalize()
        binorm = tan.cross(norm).normalized()

        ring: list[bmesh.types.BMVert] = []
        for s in range(ring_segments):
            ang = (2.0 * math.pi * s) / ring_segments
            ca, sa = math.cos(ang), math.sin(ang)
            crest = keel_ridge * (max(0.0, sa) ** 2.2) if keel_ridge > 0.0 else 0.0
            inner_flatten = 0.55 if sa < 0.0 and keel_ridge > 0.0 else 1.0
            offset = binorm * (ca * r * flatten_xy[0]) + norm * ((sa * flatten_xy[1] * inner_flatten + crest) * r)
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
            vert = bm.verts.new(center_v + (rot_m @ Vector((rr * cu, rr * su, minor_radius * math.sin(v)))))
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
    defects = {
        "nonManifoldEdges": sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary),
        "boundaryEdges": sum(1 for e in bm.edges if e.is_boundary),
        "wireEdges": sum(1 for e in bm.edges if e.is_wire),
        "looseVertices": sum(1 for v in bm.verts if len(v.link_edges) == 0),
        "zeroAreaFaces": sum(1 for f in bm.faces if f.calc_area() < 1e-9),
    }
    bm.free()
    if any(v > 0 for v in defects.values()):
        raise RuntimeError(f"Mesh defect in {obj.name}: {defects}")
    return defects


def build_stylized_protagonist_bust(scene: bpy.types.Scene) -> None:
    mat_porcelain = make_artisan_mat("V15_WarmPeachSkin", (0.97, 0.85, 0.79), roughness=0.38, coat_weight=0.10, coat_roughness=0.34)
    mat_lip = make_artisan_mat("V15_CoralRoseLip", (0.90, 0.44, 0.50), roughness=0.26, coat_weight=0.45)
    mat_blush = make_artisan_mat("V15_SoftPeachBlush", (0.96, 0.64, 0.68), roughness=0.48)
    mat_hair = make_artisan_mat("V15_CocoaBurgundyHair", (0.24, 0.13, 0.15), roughness=0.34, metallic=0.04, coat_weight=0.28, coat_roughness=0.22)
    mat_lash = make_artisan_mat("V15_EspressoEyelash", (0.09, 0.06, 0.08), roughness=0.38)
    mat_sclera = make_artisan_mat("V15_EyeScleraPorcelain", (0.99, 0.99, 1.0), roughness=0.12, coat_weight=0.80)
    mat_iris = make_artisan_mat("V15_AmethystRoseIris", (0.56, 0.28, 0.86), roughness=0.08, coat_weight=0.95, emission_color=(0.52, 0.24, 0.78), emission_strength=0.48)
    mat_pupil = make_artisan_mat("V15_DeepVelvetPupil", (0.07, 0.04, 0.12), roughness=0.12)
    mat_cape = make_artisan_mat("V15_AcademyTailoredNavy", (0.11, 0.15, 0.25), roughness=0.50, sheen_weight=0.48)
    mat_ribbon = make_artisan_mat("V15_CrimsonSilkRibbon", (0.82, 0.20, 0.32), roughness=0.36, sheen_weight=0.42)
    mat_shirt = make_artisan_mat("V15_IvorySilkBlouse", (0.95, 0.93, 0.90), roughness=0.40, sheen_weight=0.25)
    mat_brass = make_artisan_mat("V15_GildedAtelierBrass", (0.86, 0.69, 0.34), roughness=0.20, metallic=0.95, coat_weight=0.22)
    mat_gem = make_artisan_mat("V15_StarlightSapphireBrooch", (0.30, 0.82, 0.95), roughness=0.08, coat_weight=0.90, emission_color=(0.22, 0.68, 0.88), emission_strength=0.75)

    bm_skin = bmesh.new()
    head_v = add_quad_sphere(bm_skin, radius=0.188, divisions=12)
    for v in head_v:
        x, y, z = v.co.x, v.co.y, v.co.z
        if z < 0.0:
            t = min(1.0, -z / 0.188)
            v.co.x *= 1.0 - 0.48 * (t ** 0.84)
            if y < 0.0:
                chin = math.exp(-((x / 0.062) ** 2)) * 0.038 * t
                cheek = math.exp(-(((abs(x) - 0.078) / 0.042) ** 2)) * math.exp(-(((z + 0.040) / 0.050) ** 2)) * 0.015
                v.co.y -= chin + cheek
                v.co.z -= 0.018 * (t ** 1.25)
            else:
                v.co.y *= 1.0 - 0.22 * t
        else:
            v.co.z *= 1.05
            v.co.x *= 1.02
        if y < -0.05:
            for sx in (-0.062, 0.062):
                ed = math.hypot((x - sx) / 1.15, (z - 0.004) / 0.85)
                if ed < 0.050:
                    v.co.y += 0.014 * ((1.0 - ed / 0.050) ** 1.8)
            nd = math.hypot(x / 0.32, (z + 0.022) / 1.15)
            if nd < 0.034:
                v.co.y -= 0.024 * ((1.0 - nd / 0.034) ** 2.0)
        v.co.z += 0.675

    for side in (-1.0, 1.0):
        ear_v = add_quad_sphere(bm_skin, radius=0.034, divisions=4, scale_xyz=(0.35, 0.66, 1.28))
        bmesh.ops.rotate(bm_skin, cent=(0.0, 0.0, 0.0), matrix=mathutils.Euler((0.12, 0.0, side * -0.20), "XYZ").to_matrix().to_4x4(), verts=ear_v)
        bmesh.ops.translate(bm_skin, vec=(side * 0.168, 0.008, 0.656), verts=ear_v)

    neck_v = add_lathe_solid(bm_skin, [(0.160, 0.28), (0.118, 0.34), (0.058, 0.42), (0.054, 0.56)], segments=28)
    for v in neck_v:
        if v.co.z < 0.36:
            v.co.x *= 1.26
            v.co.y *= 0.74
    create_mesh_object(scene, "ProtagonistSkinBust", bm_skin, mat_porcelain, smooth=True, subsurf_levels=1)

    bm_lip = bmesh.new()
    add_quad_sphere(bm_lip, radius=0.019, divisions=4, center_xyz=(0.0, -0.175, 0.606), scale_xyz=(1.22, 0.36, 0.30))
    add_quad_sphere(bm_lip, radius=0.016, divisions=4, center_xyz=(0.0, -0.173, 0.598), scale_xyz=(1.05, 0.38, 0.32))
    create_mesh_object(scene, "ProtagonistCoralLips", bm_lip, mat_lip, smooth=True)

    bm_blush = bmesh.new()
    for side in (-1.0, 1.0):
        add_quad_sphere(bm_blush, radius=0.024, divisions=4, center_xyz=(side * 0.088, -0.156, 0.640), scale_xyz=(1.15, 0.22, 0.62))
    create_mesh_object(scene, "ProtagonistCheekBlush", bm_blush, mat_blush, smooth=True)

    bm_sclera, bm_iris, bm_pupil, bm_lash = bmesh.new(), bmesh.new(), bmesh.new(), bmesh.new()
    for side in (-1.0, 1.0):
        ex, ey, ez = side * 0.062, -0.169, 0.678
        add_quad_sphere(bm_sclera, radius=0.031, divisions=5, center_xyz=(ex, ey, ez), scale_xyz=(1.12, 0.48, 0.88))
        add_quad_sphere(bm_iris, radius=0.022, divisions=5, center_xyz=(ex, ey - 0.011, ez + 0.001), scale_xyz=(0.96, 0.36, 1.04))
        add_quad_sphere(bm_pupil, radius=0.010, divisions=4, center_xyz=(ex, ey - 0.016, ez + 0.001), scale_xyz=(0.88, 0.30, 1.02))
        add_quad_sphere(bm_sclera, radius=0.0068, divisions=3, center_xyz=(ex + side * 0.008, ey - 0.020, ez + 0.009))
        add_quad_sphere(bm_sclera, radius=0.0038, divisions=3, center_xyz=(ex - side * 0.007, ey - 0.019, ez - 0.008))
        add_swept_tapered_curve(bm_lash, [(ex - side * 0.028, ey - 0.006, ez + 0.004), (ex, ey - 0.019, ez + 0.019), (ex + side * 0.029, ey - 0.011, ez + 0.014), (ex + side * 0.040, ey - 0.004, ez + 0.020)], [0.0038, 0.0066, 0.0058, 0.0022], ring_segments=8, flatten_xy=(1.35, 0.65))
        add_swept_tapered_curve(bm_lash, [(ex - side * 0.024, ey - 0.008, ez + 0.040), (ex + side * 0.004, ey - 0.015, ez + 0.046), (ex + side * 0.032, ey - 0.006, ez + 0.041)], [0.0034, 0.0040, 0.0018], ring_segments=8, flatten_xy=(1.2, 0.6))

    create_mesh_object(scene, "ProtagonistScleraAndCatchlight", bm_sclera, mat_sclera, smooth=True)
    create_mesh_object(scene, "ProtagonistJewelIris", bm_iris, mat_iris, smooth=True)
    create_mesh_object(scene, "ProtagonistVelvetPupil", bm_pupil, mat_pupil, smooth=True)
    create_mesh_object(scene, "ProtagonistLashesAndBrows", bm_lash, mat_lash, smooth=True)

    bm_hair = bmesh.new()
    cap_v = add_quad_sphere(bm_hair, radius=0.204, divisions=9)
    for v in cap_v:
        if v.co.y < -0.03 and v.co.z < 0.068:
            lift = (0.068 - v.co.z) * max(0.0, (-v.co.y - 0.03) / 0.16)
            v.co.z += lift * 0.96
            v.co.y *= 0.86
        v.co.z = v.co.z * 1.07 + 0.694
        v.co.y += 0.014

    fringe_locks = [
        ([(-0.016, -0.095, 0.875), (-0.032, -0.178, 0.812), (-0.024, -0.192, 0.748), (-0.010, -0.186, 0.708)], [0.024, 0.028, 0.018, 0.0038]),
        ([(0.020, -0.095, 0.875), (0.040, -0.178, 0.812), (0.032, -0.192, 0.748), (0.018, -0.186, 0.708)], [0.024, 0.028, 0.018, 0.0038]),
        ([(-0.062, -0.082, 0.862), (-0.106, -0.158, 0.790), (-0.116, -0.168, 0.720)], [0.030, 0.032, 0.0055]),
        ([(0.062, -0.082, 0.862), (0.106, -0.158, 0.790), (0.116, -0.168, 0.720)], [0.030, 0.032, 0.0055]),
        ([(-0.132, -0.042, 0.825), (-0.184, -0.112, 0.705), (-0.182, -0.126, 0.565), (-0.152, -0.130, 0.445), (-0.128, -0.122, 0.365)], [0.040, 0.042, 0.032, 0.018, 0.0045]),
        ([(0.132, -0.042, 0.825), (0.184, -0.112, 0.705), (0.182, -0.126, 0.565), (0.152, -0.130, 0.445), (0.128, -0.122, 0.365)], [0.040, 0.042, 0.032, 0.018, 0.0045]),
    ]
    for pts, rads in fringe_locks:
        add_swept_tapered_curve(bm_hair, pts, rads, ring_segments=10, flatten_xy=(1.55, 0.30), keel_ridge=0.38)
    add_swept_tapered_curve(bm_hair, [(-0.006, -0.02, 0.885), (0.026, -0.052, 0.952), (-0.010, -0.072, 1.000), (-0.032, -0.065, 0.980)], [0.018, 0.016, 0.010, 0.0032], ring_segments=8, flatten_xy=(1.40, 0.34), keel_ridge=0.32)
    for idx in range(11):
        ang = math.radians(-78.0 + idx * (156.0 / 10.0))
        sx, cy = math.sin(ang), math.cos(ang)
        flare = 0.032 * ((idx % 2) - 0.5)
        add_swept_tapered_curve(bm_hair, [(sx * 0.165, cy * 0.145 + 0.035, 0.815), (sx * 0.215, cy * 0.195 + 0.045, 0.660), (sx * (0.232 + flare), cy * 0.220 + 0.060, 0.495), (sx * (0.210 + flare), cy * 0.235 + 0.078, 0.355)], [0.046, 0.048, 0.034, 0.007], ring_segments=10, flatten_xy=(1.48, 0.35), keel_ridge=0.36)
    create_mesh_object(scene, "ProtagonistSculptedHair", bm_hair, mat_hair, smooth=True, subsurf_levels=1)

    bm_shirt = bmesh.new()
    add_lathe_solid(bm_shirt, [(0.155, 0.28), (0.132, 0.35), (0.088, 0.435), (0.084, 0.465)], segments=28, scale_xyz=(1.12, 0.86, 1.0))
    add_beveled_box(bm_shirt, (0.085, 0.032, 0.13), (0.0, -0.118, 0.345), 0.006, segments=2, rot_euler=(0.24, 0.0, 0.0))
    create_mesh_object(scene, "ProtagonistSilkBlouse", bm_shirt, mat_shirt, smooth=True, weighted_normals=True)

    bm_rib = bmesh.new()
    for side in (-1.0, 1.0):
        add_swept_tapered_curve(bm_rib, [(0.0, -0.135, 0.382), (side * 0.055, -0.142, 0.396), (side * 0.082, -0.132, 0.372)], [0.012, 0.024, 0.008], ring_segments=8, flatten_xy=(1.5, 0.35))
        add_swept_tapered_curve(bm_rib, [(side * 0.010, -0.136, 0.375), (side * 0.036, -0.144, 0.315), (side * 0.048, -0.138, 0.268)], [0.012, 0.016, 0.004], ring_segments=8, flatten_xy=(1.5, 0.32))
    create_mesh_object(scene, "ProtagonistCrimsonRibbon", bm_rib, mat_ribbon, smooth=True)

    bm_cape = bmesh.new()
    cape_v = add_lathe_solid(bm_cape, [(0.285, 0.140), (0.305, 0.195), (0.258, 0.285), (0.175, 0.355), (0.132, 0.415)], segments=36, scale_xyz=(1.26, 0.80, 1.0))
    for v in cape_v:
        if v.co.y < -0.08 and v.co.z > 0.26:
            v.co.y += 0.028 * math.exp(-((v.co.x / 0.065) ** 2)) * ((v.co.z - 0.26) / 0.16)
    for side in (-1.0, 1.0):
        add_beveled_box(bm_cape, (0.036, 0.14, 0.125), (side * 0.098, -0.072, 0.405), 0.006, segments=2, rot_euler=(0.18, side * -0.32, side * 0.24))
    create_mesh_object(scene, "ProtagonistAcademyCape", bm_cape, mat_cape, smooth=True, weighted_normals=True)

    bm_brass = bmesh.new()
    add_lathe_solid(bm_brass, [(0.275, 0.0), (0.275, 0.022), (0.238, 0.042), (0.196, 0.092), (0.232, 0.120), (0.252, 0.142)], segments=44)
    for side in (-1.0, 1.0):
        add_beveled_box(bm_brass, (0.105, 0.085, 0.024), (side * 0.265, -0.01, 0.295), 0.006, segments=2, rot_euler=(0.0, side * 0.35, 0.0))
    add_lathe_solid(bm_brass, [(0.028, -0.008), (0.032, 0.008), (0.022, 0.014)], segments=20, center_xyz=(0.0, -0.142, 0.382), rot_euler=(math.pi * 0.5 - 0.18, 0.0, 0.0))
    create_mesh_object(scene, "ProtagonistPedestalAndTrim", bm_brass, mat_brass, smooth=True, weighted_normals=True)

    bm_gem = bmesh.new()
    add_quad_sphere(bm_gem, radius=0.017, divisions=5, center_xyz=(0.0, -0.152, 0.383), scale_xyz=(0.86, 0.50, 1.18))
    create_mesh_object(scene, "ProtagonistStarlightGem", bm_gem, mat_gem, smooth=True)


def build_male_lead_hunter_bust(scene: bpy.types.Scene) -> None:
    mat_skin = make_artisan_mat("V15_HunterWarmIvorySkin", (0.95, 0.83, 0.76), roughness=0.40, coat_weight=0.08)
    mat_lip = make_artisan_mat("V15_HunterNaturalLip", (0.78, 0.46, 0.48), roughness=0.34)
    mat_hair = make_artisan_mat("V15_AbyssBlueBlackHair", (0.07, 0.09, 0.16), roughness=0.32, coat_weight=0.32, coat_roughness=0.18)
    mat_sclera = make_artisan_mat("V15_HunterSclera", (0.98, 0.99, 1.0), roughness=0.12, coat_weight=0.80)
    mat_iris = make_artisan_mat("V15_AwakenedCyanIris", (0.16, 0.76, 0.96), roughness=0.08, coat_weight=0.95, emission_color=(0.14, 0.66, 0.92), emission_strength=0.65)
    mat_lash = make_artisan_mat("V15_ObsidianBrowLash", (0.05, 0.06, 0.09), roughness=0.36)
    mat_coat = make_artisan_mat("V15_HunterObsidianCoat", (0.08, 0.09, 0.13), roughness=0.48, sheen_weight=0.35)
    mat_inner = make_artisan_mat("V15_CharcoalTurtleneck", (0.14, 0.16, 0.22), roughness=0.58, sheen_weight=0.28)
    mat_silver = make_artisan_mat("V15_PlatinumRuneTrim", (0.80, 0.84, 0.90), roughness=0.20, metallic=0.96)
    mat_mana = make_artisan_mat("V15_ManaCrystalEarring", (0.32, 0.90, 1.0), roughness=0.06, coat_weight=0.92, emission_color=(0.24, 0.82, 1.0), emission_strength=0.95)

    bm_skin = bmesh.new()
    head_v = add_quad_sphere(bm_skin, radius=0.192, divisions=12)
    for v in head_v:
        x, y, z = v.co.x, v.co.y, v.co.z
        if z < 0.0:
            t = min(1.0, -z / 0.192)
            v.co.x *= 1.0 - 0.42 * (t ** 0.95)
            if y < 0.0:
                v.co.y -= math.exp(-((x / 0.058) ** 2)) * 0.042 * t
                v.co.z -= 0.024 * (t ** 1.2)
            else:
                v.co.y *= 1.0 - 0.20 * t
        else:
            v.co.z *= 1.06
        if y < -0.05:
            for sx in (-0.064, 0.064):
                ed = math.hypot((x - sx) / 1.22, (z - 0.005) / 0.72)
                if ed < 0.048:
                    v.co.y += 0.015 * ((1.0 - ed / 0.048) ** 1.8)
            nd = math.hypot(x / 0.30, (z + 0.020) / 1.35)
            if nd < 0.038:
                v.co.y -= 0.030 * ((1.0 - nd / 0.038) ** 1.9)
        v.co.z += 0.705

    for side in (-1.0, 1.0):
        ear_v = add_quad_sphere(bm_skin, radius=0.036, divisions=4, scale_xyz=(0.34, 0.68, 1.34))
        bmesh.ops.rotate(bm_skin, cent=(0, 0, 0), matrix=mathutils.Euler((0.10, 0.0, side * -0.18), "XYZ").to_matrix().to_4x4(), verts=ear_v)
        bmesh.ops.translate(bm_skin, vec=(side * 0.176, 0.006, 0.686), verts=ear_v)
    neck_v = add_lathe_solid(bm_skin, [(0.185, 0.28), (0.135, 0.35), (0.072, 0.44), (0.068, 0.58)], segments=28)
    for v in neck_v:
        if v.co.z < 0.37:
            v.co.x *= 1.32
            v.co.y *= 0.76
    create_mesh_object(scene, "HunterSkinBust", bm_skin, mat_skin, smooth=True, subsurf_levels=1)

    bm_lip = bmesh.new()
    add_quad_sphere(bm_lip, radius=0.021, divisions=4, center_xyz=(0.0, -0.178, 0.630), scale_xyz=(1.28, 0.32, 0.24))
    create_mesh_object(scene, "HunterLips", bm_lip, mat_lip, smooth=True)

    bm_sc, bm_ir, bm_ls = bmesh.new(), bmesh.new(), bmesh.new()
    for side in (-1.0, 1.0):
        ex, ey, ez = side * 0.064, -0.172, 0.708
        add_quad_sphere(bm_sc, radius=0.030, divisions=5, center_xyz=(ex, ey, ez), scale_xyz=(1.18, 0.44, 0.66))
        add_quad_sphere(bm_ir, radius=0.019, divisions=5, center_xyz=(ex, ey - 0.010, ez), scale_xyz=(0.94, 0.34, 0.88))
        add_quad_sphere(bm_sc, radius=0.0058, divisions=3, center_xyz=(ex + side * 0.007, ey - 0.018, ez + 0.006))
        add_swept_tapered_curve(bm_ls, [(ex - side * 0.028, ey - 0.005, ez + 0.001), (ex, ey - 0.017, ez + 0.013), (ex + side * 0.032, ey - 0.009, ez + 0.012), (ex + side * 0.042, ey - 0.003, ez + 0.017)], [0.0032, 0.0052, 0.0048, 0.0018], ring_segments=8, flatten_xy=(1.35, 0.6))
        add_swept_tapered_curve(bm_ls, [(ex - side * 0.026, ey - 0.009, ez + 0.028), (ex + side * 0.004, ey - 0.016, ez + 0.035), (ex + side * 0.036, ey - 0.006, ez + 0.041)], [0.0042, 0.0048, 0.0022], ring_segments=8, flatten_xy=(1.25, 0.6))
    create_mesh_object(scene, "HunterSclera", bm_sc, mat_sclera, smooth=True)
    create_mesh_object(scene, "HunterCyanIris", bm_ir, mat_iris, smooth=True)
    create_mesh_object(scene, "HunterSwordBrowsLashes", bm_ls, mat_lash, smooth=True)

    bm_hair = bmesh.new()
    cap_v = add_quad_sphere(bm_hair, radius=0.208, divisions=9)
    for v in cap_v:
        if v.co.y < -0.03 and v.co.z < 0.062:
            v.co.z += (0.062 - v.co.z) * max(0.0, (-v.co.y - 0.03) / 0.16) * 0.94
            v.co.y *= 0.87
        v.co.z = v.co.z * 1.06 + 0.722
        v.co.y += 0.012

    comma_locks = [
        ([(-0.010, -0.095, 0.905), (0.028, -0.185, 0.835), (0.042, -0.198, 0.762), (0.018, -0.190, 0.718)], [0.028, 0.034, 0.022, 0.004]),
        ([(-0.048, -0.090, 0.898), (-0.088, -0.174, 0.822), (-0.096, -0.186, 0.748), (-0.078, -0.178, 0.710)], [0.028, 0.032, 0.020, 0.004]),
        ([(0.065, -0.082, 0.890), (0.112, -0.162, 0.812), (0.122, -0.172, 0.738)], [0.030, 0.032, 0.005]),
        ([(-0.128, -0.042, 0.855), (-0.182, -0.105, 0.745), (-0.178, -0.112, 0.642)], [0.036, 0.034, 0.005]),
        ([(0.128, -0.042, 0.855), (0.182, -0.105, 0.745), (0.178, -0.112, 0.642)], [0.036, 0.034, 0.005]),
    ]
    for pts, rads in comma_locks:
        add_swept_tapered_curve(bm_hair, pts, rads, ring_segments=10, flatten_xy=(1.50, 0.32), keel_ridge=0.40)
    for idx in range(9):
        ang = math.radians(-75.0 + idx * (150.0 / 8.0))
        sx, cy = math.sin(ang), math.cos(ang)
        add_swept_tapered_curve(bm_hair, [(sx * 0.168, cy * 0.148 + 0.032, 0.840), (sx * 0.205, cy * 0.185 + 0.040, 0.705), (sx * 0.192, cy * 0.195 + 0.048, 0.575)], [0.042, 0.038, 0.007], ring_segments=10, flatten_xy=(1.45, 0.34), keel_ridge=0.36)
    create_mesh_object(scene, "HunterCommaHair", bm_hair, mat_hair, smooth=True, subsurf_levels=1)

    bm_in = bmesh.new()
    add_lathe_solid(bm_in, [(0.175, 0.27), (0.145, 0.35), (0.088, 0.45), (0.082, 0.515)], segments=28, scale_xyz=(1.18, 0.84, 1.0))
    create_mesh_object(scene, "HunterTurtleneck", bm_in, mat_inner, smooth=True, weighted_normals=True)

    bm_coat = bmesh.new()
    coat_v = add_lathe_solid(bm_coat, [(0.325, 0.140), (0.348, 0.205), (0.295, 0.305), (0.195, 0.385), (0.148, 0.485)], segments=36, scale_xyz=(1.32, 0.78, 1.0))
    for v in coat_v:
        if v.co.y < -0.07 and v.co.z > 0.26:
            v.co.y += 0.036 * math.exp(-((v.co.x / 0.072) ** 2)) * ((v.co.z - 0.26) / 0.22)
    for side in (-1.0, 1.0):
        add_beveled_box(bm_coat, (0.042, 0.15, 0.145), (side * 0.112, -0.078, 0.425), 0.006, segments=2, rot_euler=(0.16, side * -0.34, side * 0.22))
    create_mesh_object(scene, "HunterHighCollarCoat", bm_coat, mat_coat, smooth=True, weighted_normals=True)

    bm_sil = bmesh.new()
    add_lathe_solid(bm_sil, [(0.295, 0.0), (0.295, 0.024), (0.255, 0.046), (0.212, 0.095), (0.252, 0.124), (0.275, 0.142)], segments=44)
    for side in (-1.0, 1.0):
        add_beveled_box(bm_sil, (0.125, 0.092, 0.024), (side * 0.312, -0.01, 0.312), 0.006, segments=2, rot_euler=(0.0, side * 0.28, 0.0))
    add_closed_torus_ring(bm_sil, 0.012, 0.0028, major_segs=18, minor_segs=8, center_xyz=(0.182, -0.008, 0.652), rot_euler=(0.0, math.pi * 0.5, 0.0))
    create_mesh_object(scene, "HunterPlatinumPedestalAndTrim", bm_sil, mat_silver, smooth=True, weighted_normals=True)

    bm_mana = bmesh.new()
    add_lathe_solid(bm_mana, [(0.0015, 0.612), (0.0095, 0.628), (0.0015, 0.642)], segments=8, center_xyz=(0.182, -0.008, 0.0))
    add_quad_sphere(bm_mana, radius=0.018, divisions=5, center_xyz=(0.0, -0.138, 0.382), scale_xyz=(0.75, 0.48, 1.32))
    create_mesh_object(scene, "HunterManaCrystals", bm_mana, mat_mana, smooth=True)


def build_celestial_ink_astrolabe(scene: bpy.types.Scene) -> None:
    mat_walnut = make_artisan_mat("V15_AgedWalnutBase", (0.28, 0.17, 0.10), roughness=0.38, coat_weight=0.25)
    mat_brass = make_artisan_mat("V15_InstrumentBrass", (0.84, 0.67, 0.31), roughness=0.20, metallic=0.94)
    mat_copper = make_artisan_mat("V15_BurnishedCopper", (0.78, 0.43, 0.28), roughness=0.26, metallic=0.90)
    mat_ink = make_artisan_mat("V15_LuminousSapphireInk", (0.18, 0.56, 0.88), roughness=0.08, metallic=0.10, coat_weight=0.90, emission_color=(0.14, 0.48, 0.82), emission_strength=0.85)

    bm_wood = bmesh.new()
    add_lathe_solid(bm_wood, [(0.46, 0.0), (0.46, 0.032), (0.42, 0.055), (0.38, 0.082), (0.40, 0.105)], segments=44)
    create_mesh_object(scene, "AstrolabeWalnutPlinth", bm_wood, mat_walnut, smooth=True, weighted_normals=True)

    bm_brass = bmesh.new()
    add_closed_torus_ring(bm_brass, 0.39, 0.018, major_segs=44, minor_segs=12, center_xyz=(0.0, 0.0, 0.105))
    add_involute_gear(bm_brass, pitch_radius=0.26, teeth=24, thickness=0.032, bore_radius=0.055, center_xyz=(0.0, 0.0, 0.125))
    for k in range(4):
        ang = math.radians(45.0 + k * 90.0)
        add_lathe_solid(bm_brass, [(0.028, 0.10), (0.018, 0.16), (0.022, 0.28), (0.016, 0.40), (0.028, 0.46)], segments=16, center_xyz=(0.34 * math.cos(ang), 0.34 * math.sin(ang), 0.0))
    add_closed_torus_ring(bm_brass, 0.35, 0.020, major_segs=44, minor_segs=12, center_xyz=(0.0, 0.0, 0.47))
    add_closed_torus_ring(bm_brass, 0.31, 0.018, major_segs=44, minor_segs=12, center_xyz=(0.0, 0.0, 0.47), rot_euler=(math.pi * 0.5, 0.0, 0.35))
    add_lathe_solid(bm_brass, [(0.042, 0.10), (0.022, 0.18), (0.016, 0.78), (0.032, 0.82), (0.008, 0.90)], segments=20)
    add_swept_tapered_curve(bm_brass, [(-0.24, -0.32, 0.135), (0.02, -0.30, 0.165), (0.22, -0.28, 0.195), (0.28, -0.27, 0.205)], [0.016, 0.014, 0.010, 0.003], ring_segments=12, flatten_xy=(1.0, 1.0))
    create_mesh_object(scene, "AstrolabeBrassMechanism", bm_brass, mat_brass, smooth=True, weighted_normals=True)

    bm_copper = bmesh.new()
    add_closed_torus_ring(bm_copper, 0.24, 0.015, major_segs=40, minor_segs=12, center_xyz=(0.0, 0.0, 0.47), rot_euler=(0.98, 0.42, 0.0))
    add_closed_torus_ring(bm_copper, 0.175, 0.013, major_segs=36, minor_segs=10, center_xyz=(0.0, 0.0, 0.47), rot_euler=(-0.72, 0.55, 0.25))
    add_involute_gear(bm_copper, pitch_radius=0.125, teeth=16, thickness=0.026, bore_radius=0.028, center_xyz=(0.19, 0.0, 0.155), phase=0.2)
    create_mesh_object(scene, "AstrolabeCopperRings", bm_copper, mat_copper, smooth=True, weighted_normals=True)

    bm_core = bmesh.new()
    add_quad_sphere(bm_core, radius=0.088, divisions=7, center_xyz=(0.0, 0.0, 0.47))
    create_mesh_object(scene, "AstrolabeSapphireCore", bm_core, mat_ink, smooth=True, subsurf_levels=1)


def build_royal_conservatory_gazebo(scene: bpy.types.Scene) -> None:
    mat_marble = make_artisan_mat("V15_CreamLimestone", (0.88, 0.85, 0.79), roughness=0.46)
    mat_bronze = make_artisan_mat("V15_ConservatoryBronze", (0.16, 0.19, 0.22), roughness=0.30, metallic=0.84)
    mat_gold = make_artisan_mat("V15_RoyalFinialGold", (0.85, 0.68, 0.32), roughness=0.22, metallic=0.92)
    mat_glass = make_artisan_mat("V15_ConservatorySkyGlass", (0.46, 0.68, 0.86), roughness=0.12, metallic=0.08, coat_weight=0.80, emission_color=(0.24, 0.42, 0.62), emission_strength=0.35)

    bm_stone = bmesh.new()
    add_lathe_solid(bm_stone, [(1.48, 0.0), (1.48, 0.09), (1.36, 0.10), (1.36, 0.19), (1.26, 0.20)], segments=32)
    for idx in range(8):
        ang = (2.0 * math.pi * idx) / 8.0
        cx, cy = 1.08 * math.cos(ang), 1.08 * math.sin(ang)
        add_beveled_box(bm_stone, (0.24, 0.24, 0.12), (cx, cy, 0.26), 0.010, segments=2, rot_euler=(0.0, 0.0, ang))
        add_fluted_column_shaft(bm_stone, base_radius=0.082, top_radius=0.072, height=1.62, flutes=12, flute_depth=0.006, entasis=0.008, z_divisions=10, center_xyz=(cx, cy, 0.32))
        add_lathe_solid(bm_stone, [(0.076, 1.94), (0.112, 2.00), (0.126, 2.05)], segments=18, center_xyz=(cx, cy, 0.0))
        add_beveled_box(bm_stone, (0.26, 0.26, 0.08), (cx, cy, 2.09), 0.008, segments=2, rot_euler=(0.0, 0.0, ang))
    add_closed_torus_ring(bm_stone, 1.08, 0.085, major_segs=48, minor_segs=12, center_xyz=(0.0, 0.0, 2.18))
    create_mesh_object(scene, "ConservatoryStoneColonnade", bm_stone, mat_marble, smooth=True, weighted_normals=True)

    bm_bronze = bmesh.new()
    add_closed_torus_ring(bm_bronze, 1.06, 0.036, major_segs=48, minor_segs=10, center_xyz=(0.0, 0.0, 2.28))
    add_closed_torus_ring(bm_bronze, 0.78, 0.026, major_segs=40, minor_segs=10, center_xyz=(0.0, 0.0, 2.74))
    add_closed_torus_ring(bm_bronze, 0.34, 0.024, major_segs=32, minor_segs=10, center_xyz=(0.0, 0.0, 3.12))
    for idx in range(16):
        ang = (2.0 * math.pi * idx) / 16.0
        ca, sa = math.cos(ang), math.sin(ang)
        add_swept_tapered_curve(bm_bronze, [(1.06 * ca, 1.06 * sa, 2.28), (0.95 * ca, 0.95 * sa, 2.56), (0.74 * ca, 0.74 * sa, 2.82), (0.42 * ca, 0.42 * sa, 3.08), (0.16 * ca, 0.16 * sa, 3.22)], [0.026, 0.024, 0.021, 0.018, 0.014], ring_segments=8, flatten_xy=(1.0, 1.0))
    create_mesh_object(scene, "ConservatoryBronzeRibs", bm_bronze, mat_bronze, smooth=True, weighted_normals=True)

    bm_glass = bmesh.new()
    add_lathe_solid(bm_glass, [(1.02, 2.29), (0.91, 2.55), (0.71, 2.80), (0.40, 3.05), (0.14, 3.20)], segments=32)
    create_mesh_object(scene, "ConservatoryDomeGlass", bm_glass, mat_glass, smooth=True)

    bm_gold = bmesh.new()
    add_lathe_solid(bm_gold, [(0.18, 3.20), (0.14, 3.28), (0.06, 3.38), (0.09, 3.46), (0.012, 3.68)], segments=24)
    create_mesh_object(scene, "ConservatoryGoldFinial", bm_gold, mat_gold, smooth=True, weighted_normals=True)


def build_artisan_drafting_easel(scene: bpy.types.Scene) -> None:
    mat_oak = make_artisan_mat("V15_DraftingWarmOak", (0.54, 0.36, 0.21), roughness=0.42, coat_weight=0.20)
    mat_frame = make_artisan_mat("V15_AnodizedGraphite", (0.14, 0.15, 0.18), roughness=0.34, metallic=0.82)
    mat_brass = make_artisan_mat("V15_LampArticulatedBrass", (0.83, 0.66, 0.31), roughness=0.22, metallic=0.92)
    mat_screen = make_artisan_mat("V15_CanvasPenDisplay", (0.92, 0.94, 0.97), roughness=0.16, coat_weight=0.65, emission_color=(0.76, 0.84, 0.96), emission_strength=0.45)
    mat_ink_panel = make_artisan_mat("V15_ComicPanelAccent", (0.24, 0.42, 0.68), roughness=0.22, emission_color=(0.18, 0.36, 0.62), emission_strength=0.35)
    mat_bulb = make_artisan_mat("V15_WarmTungstenBulb", (1.0, 0.90, 0.68), roughness=0.14, emission_color=(1.0, 0.84, 0.52), emission_strength=1.6)

    bm_metal = bmesh.new()
    for sx in (-0.64, 0.64):
        add_beveled_box(bm_metal, (0.065, 0.72, 0.045), (sx, 0.0, 0.0225), 0.006, segments=2)
        add_tube_segment(bm_metal, (sx, -0.26, 0.045), (sx, -0.10, 0.74), 0.026, 0.022, segments=12)
        add_tube_segment(bm_metal, (sx, 0.26, 0.045), (sx, 0.12, 0.74), 0.026, 0.022, segments=12)
    add_tube_segment(bm_metal, (-0.64, 0.06, 0.24), (0.64, 0.06, 0.24), 0.020, 0.020, segments=12)
    add_beveled_box(bm_metal, (1.42, 0.48, 0.036), (0.0, 0.02, 0.755), 0.005, segments=2)
    tilt = math.radians(24.0)
    add_beveled_box(bm_metal, (0.78, 0.49, 0.028), (-0.12, -0.02, 0.92), 0.006, segments=2, rot_euler=(tilt, 0.0, 0.0))
    add_lathe_solid(bm_metal, [(0.058, 0.816), (0.056, 0.832), (0.038, 0.836), (0.036, 0.850)], segments=24, center_xyz=(-0.62, -0.16, 0.0))
    add_tube_segment(bm_metal, (-0.12, 0.12, 0.77), (-0.12, 0.04, 0.96), 0.018, 0.015, segments=10)
    create_mesh_object(scene, "DraftingAnodizedFrame", bm_metal, mat_frame, smooth=True, weighted_normals=True)

    bm_oak = bmesh.new()
    add_beveled_box(bm_oak, (1.62, 0.82, 0.042), (0.0, 0.0, 0.795), 0.008, segments=3)
    add_beveled_box(bm_oak, (0.82, 0.035, 0.024), (-0.12, -0.24, 0.828), 0.005, segments=2)
    add_lathe_solid(bm_oak, [(0.056, 0.816), (0.060, 0.86), (0.052, 0.95), (0.056, 0.965)], segments=24, center_xyz=(0.54, -0.14, 0.0))
    create_mesh_object(scene, "DraftingOakDesktop", bm_oak, mat_oak, smooth=True, weighted_normals=True)

    bm_screen = bmesh.new()
    add_beveled_box(bm_screen, (0.69, 0.41, 0.010), (-0.12, -0.026, 0.934), 0.002, segments=1, rot_euler=(tilt, 0.0, 0.0))
    create_mesh_object(scene, "DraftingCanvasSurface", bm_screen, mat_screen, smooth=True)

    bm_panels = bmesh.new()
    add_beveled_box(bm_panels, (0.28, 0.15, 0.006), (-0.25, -0.068, 0.968), 0.0015, segments=1, rot_euler=(tilt, 0.0, 0.0))
    add_beveled_box(bm_panels, (0.28, 0.15, 0.006), (0.05, -0.068, 0.968), 0.0015, segments=1, rot_euler=(tilt, 0.0, 0.0))
    add_beveled_box(bm_panels, (0.58, 0.14, 0.006), (-0.10, 0.072, 0.905), 0.0015, segments=1, rot_euler=(tilt, 0.0, 0.0))
    create_mesh_object(scene, "DraftingWebtoonPanels", bm_panels, mat_ink_panel, smooth=True)

    bm_brass = bmesh.new()
    lx, ly = 0.58, 0.22
    add_lathe_solid(bm_brass, [(0.088, 0.816), (0.082, 0.842), (0.036, 0.865)], segments=24, center_xyz=(lx, ly, 0.0))
    p0, p1, p2 = (lx, ly, 0.86), (lx + 0.06, ly + 0.06, 1.24), (lx - 0.24, ly - 0.14, 1.44)
    add_tube_segment(bm_brass, p0, p1, 0.014, 0.013, segments=12)
    add_quad_sphere(bm_brass, radius=0.024, divisions=4, center_xyz=p1)
    add_tube_segment(bm_brass, p1, p2, 0.013, 0.011, segments=12)
    add_quad_sphere(bm_brass, radius=0.022, divisions=4, center_xyz=p2)
    add_lathe_solid(bm_brass, [(0.115, -0.08), (0.085, -0.02), (0.036, 0.05), (0.022, 0.08)], segments=24, center_xyz=(p2[0] - 0.05, p2[1] - 0.04, p2[2] - 0.05), rot_euler=(0.45, -0.35, 0.0))
    for dx, dy, rx, ry in ((-0.018, 0.0, 0.14, -0.10), (0.016, -0.012, -0.10, 0.16), (0.0, 0.018, 0.18, 0.08)):
        add_swept_tapered_curve(bm_brass, [(0.54 + dx, -0.14 + dy, 0.90), (0.54 + dx + ry * 0.16, -0.14 + dy + rx * 0.16, 1.09)], [0.007, 0.0025], ring_segments=8, flatten_xy=(1.0, 1.0))
    create_mesh_object(scene, "DraftingBrassLampAndStylus", bm_brass, mat_brass, smooth=True, weighted_normals=True)

    bm_bulb = bmesh.new()
    add_quad_sphere(bm_bulb, radius=0.042, divisions=5, center_xyz=(p2[0] - 0.07, p2[1] - 0.06, p2[2] - 0.09))
    create_mesh_object(scene, "DraftingWarmBulb", bm_bulb, mat_bulb, smooth=True)


def build_rofan_imperial_tea_table(scene: bpy.types.Scene) -> None:
    mat_porcelain = make_artisan_mat("V15_BoneChinaPorcelain", (0.97, 0.95, 0.91), roughness=0.14, coat_weight=0.88, coat_roughness=0.08)
    mat_gold = make_artisan_mat("V15_ImperialFiligreeGold", (0.88, 0.71, 0.34), roughness=0.18, metallic=0.96, coat_weight=0.20)
    mat_velvet = make_artisan_mat("V15_CrimsonTableVelvet", (0.58, 0.11, 0.20), roughness=0.72, sheen_weight=0.68)
    mat_rose_tea = make_artisan_mat("V15_RubyRoseTea", (0.76, 0.18, 0.26), roughness=0.08, coat_weight=0.92, emission_color=(0.45, 0.08, 0.14), emission_strength=0.25)

    bm_porc = bmesh.new()
    add_lathe_solid(bm_porc, [(0.34, 0.0), (0.34, 0.032), (0.26, 0.065), (0.11, 0.14), (0.085, 0.42), (0.12, 0.64), (0.56, 0.72), (0.58, 0.755), (0.55, 0.775)], segments=40)
    add_lathe_solid(bm_porc, [(0.055, 0.775), (0.092, 0.825), (0.098, 0.875), (0.068, 0.925), (0.048, 0.945), (0.016, 0.975)], segments=28, center_xyz=(-0.16, -0.06, 0.0))
    for cx, cy in ((-0.08, 0.20), (0.20, 0.14)):
        add_lathe_solid(bm_porc, [(0.038, 0.775), (0.078, 0.788), (0.072, 0.794), (0.028, 0.796), (0.048, 0.835), (0.052, 0.855)], segments=24, center_xyz=(cx, cy, 0.0))
    for pz, pr in ((0.835, 0.145), (0.965, 0.115), (1.085, 0.086)):
        add_lathe_solid(bm_porc, [(pr * 0.45, pz - 0.010), (pr, pz), (pr * 0.94, pz + 0.010)], segments=28, center_xyz=(0.14, -0.14, 0.0))
    create_mesh_object(scene, "ImperialBoneChinaTableAndSet", bm_porc, mat_porcelain, smooth=True, weighted_normals=True)

    bm_vel = bmesh.new()
    add_lathe_solid(bm_vel, [(0.42, 0.776), (0.585, 0.768), (0.595, 0.685), (0.575, 0.675)], segments=40)
    for mx, my, mz in ((0.10, -0.18, 0.852), (0.19, -0.12, 0.852), (0.14, -0.09, 0.980)):
        add_quad_sphere(bm_vel, radius=0.022, divisions=4, center_xyz=(mx, my, mz), scale_xyz=(1.0, 1.0, 0.68))
    create_mesh_object(scene, "ImperialCrimsonVelvetAndPastries", bm_vel, mat_velvet, smooth=True)

    bm_gold = bmesh.new()
    for k in range(4):
        ang = math.radians(45.0 + k * 90.0)
        ca, sa = math.cos(ang), math.sin(ang)
        add_swept_tapered_curve(bm_gold, [(0.11 * ca, 0.11 * sa, 0.42), (0.28 * ca, 0.28 * sa, 0.28), (0.36 * ca, 0.36 * sa, 0.08), (0.39 * ca, 0.39 * sa, 0.02)], [0.024, 0.022, 0.018, 0.014], ring_segments=10, flatten_xy=(1.0, 1.0))
    add_closed_torus_ring(bm_gold, 0.585, 0.012, major_segs=48, minor_segs=10, center_xyz=(0.0, 0.0, 0.762))
    add_swept_tapered_curve(bm_gold, [(-0.08, -0.06, 0.835), (-0.03, -0.06, 0.885), (-0.01, -0.06, 0.925)], [0.018, 0.012, 0.007], ring_segments=10, flatten_xy=(1.0, 1.0))
    add_closed_torus_ring(bm_gold, 0.046, 0.007, major_segs=20, minor_segs=8, center_xyz=(-0.25, -0.06, 0.875), rot_euler=(math.pi * 0.5, 0.0, 0.0))
    add_lathe_solid(bm_gold, [(0.026, 0.775), (0.011, 0.82), (0.009, 1.15), (0.018, 1.17)], segments=16, center_xyz=(0.14, -0.14, 0.0))
    add_closed_torus_ring(bm_gold, 0.032, 0.006, major_segs=20, minor_segs=8, center_xyz=(0.14, -0.14, 1.20), rot_euler=(math.pi * 0.5, 0.0, 0.0))
    create_mesh_object(scene, "ImperialFiligreeGoldFrame", bm_gold, mat_gold, smooth=True, weighted_normals=True)

    bm_tea = bmesh.new()
    for cx, cy in ((-0.08, 0.20), (0.20, 0.14)):
        add_quad_sphere(bm_tea, radius=0.044, divisions=4, center_xyz=(cx, cy, 0.842), scale_xyz=(1.0, 1.0, 0.16))
    create_mesh_object(scene, "ImperialRubyTeaSurface", bm_tea, mat_rose_tea, smooth=True)


def build_arcane_grimoire_pedestal(scene: bpy.types.Scene) -> None:
    mat_obsidian = make_artisan_mat("V15_SanctumObsidianStone", (0.11, 0.12, 0.17), roughness=0.44, coat_weight=0.18)
    mat_gold = make_artisan_mat("V15_ArcaneSanctumGold", (0.86, 0.69, 0.33), roughness=0.20, metallic=0.94)
    mat_leather = make_artisan_mat("V15_GrimoireRoyalLeather", (0.28, 0.10, 0.22), roughness=0.52, sheen_weight=0.35)
    mat_pages = make_artisan_mat("V15_GildedParchmentPages", (0.94, 0.90, 0.80), roughness=0.56)
    mat_rune = make_artisan_mat("V15_ArcaneAetherRune", (0.32, 0.84, 1.0), roughness=0.08, coat_weight=0.92, emission_color=(0.24, 0.72, 1.0), emission_strength=1.15)

    bm_stone = bmesh.new()
    add_lathe_solid(bm_stone, [(0.54, 0.0), (0.54, 0.055), (0.46, 0.085), (0.42, 0.14)], segments=8)
    add_fluted_column_shaft(bm_stone, base_radius=0.18, top_radius=0.155, height=0.68, flutes=12, flute_depth=0.009, entasis=0.008, z_divisions=8, center_xyz=(0.0, 0.0, 0.14))
    add_lathe_solid(bm_stone, [(0.16, 0.82), (0.26, 0.89), (0.30, 0.94)], segments=16)
    create_mesh_object(scene, "GrimoireObsidianPedestal", bm_stone, mat_obsidian, smooth=True, weighted_normals=True)

    tilt_g = math.radians(26.0)
    bm_cov = bmesh.new()
    add_beveled_box(bm_cov, (0.075, 0.34, 0.036), (0.0, 0.0, 0.995), 0.006, segments=2, rot_euler=(tilt_g, 0.0, 0.0))
    for side in (-1.0, 1.0):
        add_beveled_box(bm_cov, (0.24, 0.34, 0.022), (side * 0.135, 0.008, 1.022), 0.005, segments=2, rot_euler=(tilt_g, side * -0.26, 0.0))
    create_mesh_object(scene, "GrimoireLeatherBinding", bm_cov, mat_leather, smooth=True, weighted_normals=True)

    bm_pg = bmesh.new()
    for side in (-1.0, 1.0):
        add_beveled_box(bm_pg, (0.215, 0.31, 0.038), (side * 0.122, 0.002, 1.045), 0.006, segments=2, rot_euler=(tilt_g, side * -0.22, 0.0))
    create_mesh_object(scene, "GrimoireParchmentPages", bm_pg, mat_pages, smooth=True, weighted_normals=True)

    bm_gold = bmesh.new()
    add_closed_torus_ring(bm_gold, 0.48, 0.012, major_segs=48, minor_segs=10, center_xyz=(0.0, 0.0, 0.062))
    add_closed_torus_ring(bm_gold, 0.28, 0.011, major_segs=36, minor_segs=10, center_xyz=(0.0, 0.0, 0.925))
    for side in (-1.0, 1.0):
        add_beveled_box(bm_gold, (0.042, 0.042, 0.028), (side * 0.235, -0.135, 1.105), 0.004, segments=2, rot_euler=(tilt_g, side * -0.26, 0.0))
    create_mesh_object(scene, "GrimoireGoldClaspsAndRings", bm_gold, mat_gold, smooth=True, weighted_normals=True)

    bm_rune = bmesh.new()
    add_closed_torus_ring(bm_rune, 0.32, 0.0085, major_segs=48, minor_segs=8, center_xyz=(0.0, -0.02, 1.24), rot_euler=(0.35, 0.18, 0.0))
    add_closed_torus_ring(bm_rune, 0.22, 0.0075, major_segs=40, minor_segs=8, center_xyz=(0.0, -0.02, 1.24), rot_euler=(-0.28, -0.24, 0.0))
    add_lathe_solid(bm_rune, [(0.002, 1.15), (0.048, 1.24), (0.002, 1.35)], segments=6, center_xyz=(0.0, -0.02, 0.0))
    for k in range(6):
        ang = (2.0 * math.pi * k) / 6.0
        add_quad_sphere(bm_rune, radius=0.016, divisions=3, center_xyz=(0.32 * math.cos(ang), -0.02 + 0.32 * math.sin(ang), 1.24))
    create_mesh_object(scene, "GrimoireFloatingMagicCircle", bm_rune, mat_rune, smooth=True)


def build_kpop_stage_crown_mic(scene: bpy.types.Scene) -> None:
    mat_stage = make_artisan_mat("V15_ObsidianMirrorStage", (0.08, 0.07, 0.13), roughness=0.16, coat_weight=0.85, coat_roughness=0.08)
    mat_chrome = make_artisan_mat("V15_RoseGoldChrome", (0.90, 0.68, 0.72), roughness=0.16, metallic=0.96, coat_weight=0.25)
    mat_mesh = make_artisan_mat("V15_PlatinumMicMesh", (0.84, 0.86, 0.92), roughness=0.24, metallic=0.95)
    mat_neon_pink = make_artisan_mat("V15_StarlightMagentaNeon", (0.98, 0.34, 0.76), roughness=0.08, coat_weight=0.90, emission_color=(0.96, 0.26, 0.70), emission_strength=1.10)
    mat_neon_cyan = make_artisan_mat("V15_HoloCyanStar", (0.28, 0.92, 1.0), roughness=0.08, coat_weight=0.90, emission_color=(0.20, 0.84, 1.0), emission_strength=1.10)

    bm_st = bmesh.new()
    add_lathe_solid(bm_st, [(0.48, 0.0), (0.48, 0.042), (0.42, 0.068), (0.36, 0.095)], segments=48)
    create_mesh_object(scene, "StageStarlightPodium", bm_st, mat_stage, smooth=True, weighted_normals=True)

    bm_ch = bmesh.new()
    add_lathe_solid(bm_ch, [(0.16, 0.095), (0.14, 0.125), (0.032, 0.165), (0.018, 0.88), (0.026, 0.92), (0.015, 1.38), (0.024, 1.44)], segments=28)
    for side in (-1.0, 1.0):
        add_swept_tapered_curve(bm_ch, [(0.0, 0.0, 1.38), (side * 0.065, -0.01, 1.42), (side * 0.115, -0.015, 1.48), (side * 0.085, -0.01, 1.53)], [0.012, 0.018, 0.014, 0.004], ring_segments=8, flatten_xy=(1.4, 0.45))
    add_closed_torus_ring(bm_ch, 0.052, 0.007, major_segs=28, minor_segs=8, center_xyz=(0.0, 0.0, 1.48), rot_euler=(math.pi * 0.5, 0.0, 0.0))
    create_mesh_object(scene, "StageRoseGoldMicStand", bm_ch, mat_chrome, smooth=True, weighted_normals=True)

    bm_cap = bmesh.new()
    add_quad_sphere(bm_cap, radius=0.036, divisions=6, center_xyz=(0.0, -0.018, 1.485), scale_xyz=(0.92, 1.18, 1.12))
    create_mesh_object(scene, "StageVocalCapsuleMesh", bm_cap, mat_mesh, smooth=True)

    bm_pink = bmesh.new()
    add_closed_torus_ring(bm_pink, 0.44, 0.011, major_segs=48, minor_segs=10, center_xyz=(0.0, 0.0, 0.048))
    for side in (-1.0, 1.0):
        add_swept_tapered_curve(bm_pink, [(side * 0.020, 0.01, 1.35), (side * 0.075, 0.02, 1.24), (side * 0.095, 0.03, 1.08), (side * 0.068, 0.04, 0.94)], [0.010, 0.018, 0.014, 0.0035], ring_segments=8, flatten_xy=(1.6, 0.30))
    create_mesh_object(scene, "StageNeonMagentaRibbons", bm_pink, mat_neon_pink, smooth=True)

    bm_cy = bmesh.new()
    add_closed_torus_ring(bm_cy, 0.37, 0.009, major_segs=44, minor_segs=10, center_xyz=(0.0, 0.0, 0.096))
    add_lathe_solid(bm_cy, [(0.002, 1.545), (0.022, 1.575), (0.002, 1.615)], segments=6)
    create_mesh_object(scene, "StageHoloCyanCrownGem", bm_cy, mat_neon_cyan, smooth=True)


ASSET_SPECS: list[tuple[str, str, str, str, str, Callable[[bpy.types.Scene], None]]] = [
    ("webtoon-stylized-protagonist-bust-v15", "웹툰 여주인공 하이-서브서프 조형 흉상 (V15)", "Stylized Protagonist Sculpt Bust V15", "커튼뱅 능선 헤어·자수정 보석안·코랄 립·아카데미 리본 케이프 흉상", "Parted keeled hair, amethyst jewel eyes & academy ribbon bust", build_stylized_protagonist_bust),
    ("webtoon-male-lead-hunter-bust-v15", "웹툰 8등신 판타지 남주인공 헌터 흉상 (V15)", "Male Lead Hunter Sculpt Bust V15", "쉼표 레이어드 헤어·각성 시안 보석안·하이칼라 트렌치·마나 이어링 흉상", "Comma layered hair, awakened cyan iris & hunter coat bust", build_male_lead_hunter_bust),
    ("webtoon-celestial-ink-astrolabe-turntable-v15", "천구 잉크 아스트롤라베·기어 턴테이블 (V15)", "Celestial Ink Astrolabe Turntable V15", "월넛 좌대·인볼류트 황동 기어·경사 천구 링·사파이어 잉크 코어", "Walnut plinth, involute brass gears & sapphire ink core", build_celestial_ink_astrolabe),
    ("webtoon-royal-conservatory-dome-gazebo-v15", "로판 왕실 온실 돔·열주 파빌리온 (V15)", "Royal Conservatory Dome Gazebo V15", "8주 배흘림 석조 열주·16리브 브론즈 유리 돔·골드 피니얼 정자", "8 fluted columns, 16-rib bronze glass cupola & finial", build_royal_conservatory_gazebo),
    ("webtoon-artisan-drafting-easel-lamp-v15", "작가용 틸트 드래프팅 이젤·황동 램프 (V15)", "Artisan Drafting Easel & Brass Lamp V15", "원목 드래프팅 데스크·3컷 액정 캔버스·단축 다이얼·관절 황동 램프", "Oak drafting desk, 3-panel pen display & articulated brass lamp", build_artisan_drafting_easel),
    ("webtoon-rofan-imperial-tea-carriage-table-v15", "로판 황실 티파티 테이블·3단 트레이 세트 (V15)", "Rofan Imperial Tea Table & Tiered Tray V15", "본차이나 티포트·벨벳 테이블러너·필리그리 골드 3단 디저트 트레이", "Bone-china tea set, crimson velvet runner & 3-tier gold stand", build_rofan_imperial_tea_table),
    ("webtoon-arcane-grimoire-magic-circle-pedestal-v15", "판타지 마탑 고대 마도서·부유 마법진 제단 (V15)", "Arcane Grimoire & Magic Circle Pedestal V15", "흑요석 열주 제단·가죽 양장 오픈 마도서·이중 부유 룬 마법진", "Obsidian fluted lectern, open leather grimoire & floating rune rings", build_arcane_grimoire_pedestal),
    ("webtoon-kpop-stage-crown-mic-stand-v15", "K-Pop 아이돌 크라운 스탠드 마이크·포디움 (V15)", "K-Pop Stage Crown Mic Stand & Podium V15", "로즈골드 크라운 윙 스탠드 마이크·네온 리본·미러 스타 포디움", "Rose-gold winged crown mic stand, neon ribbons & mirror podium", build_kpop_stage_crown_mic),
]


def ground_scene_meshes(scene: bpy.types.Scene) -> None:
    mesh_objs = [o for o in scene.objects if o.type == "MESH"]
    min_z = min((obj.matrix_world @ Vector(c)).z for obj in mesh_objs for c in obj.bound_box)
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
    return (mins + maxs) * 0.5, max(0.25, (maxs - mins).length * 0.5)


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
        bg.inputs[0].default_value = (0.075, 0.082, 0.112, 1.0)
        bg.inputs[1].default_value = 0.92
    scene.world = world

    cam_data = bpy.data.cameras.new("ThumbCam")
    cam_data.lens = 58.0
    cam_obj = bpy.data.objects.new("ThumbCam", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.38
    cam_obj.location = center + Vector((dist * 0.44, -dist * 1.02, dist * 0.28))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("ThumbKey", 460.0, (1.0, 0.97, 0.93), (radius * 1.6, -radius * 2.2, radius * 2.1)),
        ("ThumbFill", 280.0, (0.82, 0.90, 1.0), (-radius * 2.1, -radius * 1.8, radius * 1.4)),
        ("ThumbRim", 320.0, (0.96, 0.82, 0.62), (-radius * 0.4, radius * 2.3, radius * 2.0)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy * max(0.4, (radius / 1.1) ** 2)
        ldata.color = color
        ldata.size = radius * 1.8
        if hasattr(ldata, "use_shadow"):
            ldata.use_shadow = False
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


def export_v15_subset(start_idx: int = 0, end_idx: int = 8) -> list[dict[str, object]]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith("V15_") and mat.users == 0:
            bpy.data.materials.remove(mat)

    win = bpy.context.window or bpy.data.window_managers[0].windows[0]
    area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), win.screen.areas[0])
    region = next((r for r in area.regions if r.type == "WINDOW"), area.regions[0])

    export_scene = bpy.data.scenes.get("ArtisanV15_Export") or bpy.data.scenes.new("ArtisanV15_Export")
    export_scene.unit_settings.system = "METRIC"
    export_scene.unit_settings.scale_length = 1.0
    prev_scene = win.scene
    win.scene = export_scene

    manifest_subset: list[dict[str, object]] = []
    with bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region, scene=export_scene):
        for slug, label_ko, label_en, desc_ko, desc_en, builder in ASSET_SPECS[start_idx:end_idx]:
            clear_scene(export_scene)
            for mat in list(bpy.data.materials):
                if mat.name.startswith("V15_") and mat.users == 0:
                    bpy.data.materials.remove(mat)
            builder(export_scene)
            ground_scene_meshes(export_scene)
            mesh_objs = [o for o in export_scene.objects if o.type == "MESH"]
            for obj in mesh_objs:
                audit_mesh_defects(obj)

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
            manifest_subset.append({"slug": slug, "bytes": glb_path.stat().st_size})

    clear_scene(export_scene)
    win.scene = prev_scene
    bpy.data.scenes.remove(export_scene)
    return manifest_subset


def write_v15_provenance_from_disk() -> list[dict[str, object]]:
    manifest: list[dict[str, object]] = []
    for slug, label_ko, label_en, desc_ko, desc_en, _ in ASSET_SPECS:
        glb_path = OUTPUT_DIR / f"{slug}.glb"
        thumb_path = THUMB_DIR / f"{slug}.png"
        if not glb_path.exists() or not thumb_path.exists():
            continue
        raw = glb_path.read_bytes()
        j_len, _ = struct.unpack_from("<II", raw, 12)
        gltf = json.loads(raw[20 : 20 + j_len].decode("utf-8"))
        accs = gltf.get("accessors", [])
        verts = sum(accs[p["attributes"]["POSITION"]]["count"] for m in gltf.get("meshes", []) for p in m.get("primitives", []))
        tris = sum((accs[p["indices"]]["count"] // 3) if "indices" in p else (accs[p["attributes"]["POSITION"]]["count"] // 3) for m in gltf.get("meshes", []) for p in m.get("primitives", []))
        manifest.append({
            "slug": slug,
            "file": f"{slug}.glb",
            "thumbnail": f"thumbnails/{slug}.png",
            "labelKo": label_ko,
            "labelEn": label_en,
            "descKo": desc_ko,
            "descEn": desc_en,
            "bytes": len(raw),
            "sha256": sha256_file(glb_path),
            "thumbBytes": thumb_path.stat().st_size,
            "thumbSha256": sha256_file(thumb_path),
            "vertices": verts,
            "triangles": tris,
        })

    prov = {
        "schema": "toonstudio.blender-artisan-atelier-assets.v15",
        "createdAt": "2026-11-17",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {bpy.app.version_string} (scripts/blender/generate_artisan_atelier_v15.py · 8-asset manifold 0-defect verified)",
        "tool": f"Blender {bpy.app.version_string}",
        "units": "meter",
        "upAxis": "Y",
        "externalSources": [],
        "files": [{"file": m["file"], "bytes": m["bytes"], "sha256": m["sha256"], "triangles": m["triangles"], "vertices": m["vertices"]} for m in sorted(manifest, key=lambda r: str(r["file"]))],
        "thumbnails": [{"file": m["thumbnail"], "bytes": m["thumbBytes"], "sha256": m["thumbSha256"]} for m in sorted(manifest, key=lambda r: str(r["thumbnail"]))],
    }
    (OUTPUT_DIR / "provenance.json").write_text(json.dumps(prov, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    license_rows = "\n".join(f"- `{m['file']}` — {m['labelKo']} ({m['triangles']} tris, SHA-256 `{m['sha256']}`)" for m in sorted(manifest, key=lambda r: str(r["file"])))
    (OUTPUT_DIR / "LICENSES.md").write_text(
        "# ToonStudio Blender Artisan Atelier Kit V15 — 라이선스 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_artisan_atelier_v15.py`, Blender {bpy.app.version_string})\n"
        "- 검증: 비매니폴드 모서리 0 · 열린 경계 0 · 고립 정점 0 · 0면적 면 0\n\n"
        "## 포함 파일 목록 (총 8종)\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return manifest


def populate_live_showcase_scene() -> dict[str, object]:
    win = bpy.context.window or bpy.data.window_managers[0].windows[0]
    live_scene = bpy.data.scenes.get("Scene") or win.scene
    win.scene = live_scene

    for col in list(live_scene.collection.children):
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(col)
    for obj in list(live_scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    mat_stage = make_artisan_mat("V15_WarmInkCyclorama", (0.095, 0.092, 0.112), roughness=0.56, metallic=0.04)
    mat_rim = make_artisan_mat("V15_StageBrassInlay", (0.84, 0.67, 0.33), roughness=0.22, metallic=0.92)

    bm_stage = bmesh.new()
    add_lathe_solid(bm_stage, [(5.2, -0.09), (5.2, 0.0), (4.85, 0.016)], segments=72)
    create_mesh_object(live_scene, "AtelierShowcaseStage", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_inlay = bmesh.new()
    add_closed_torus_ring(bm_inlay, 4.72, 0.018, major_segs=72, minor_segs=10, center_xyz=(0.0, 0.0, 0.017))
    create_mesh_object(live_scene, "AtelierStageBrassInlay", bm_inlay, mat_rim, smooth=True, weighted_normals=True)

    placements = [
        ("Artisan_Protagonist_Bust", build_stylized_protagonist_bust, (-0.52, -1.65, 0.016), 0.16, 1.55),
        ("Artisan_Male_Lead_Hunter_Bust", build_male_lead_hunter_bust, (0.52, -1.65, 0.016), -0.16, 1.52),
        ("Artisan_Rofan_Tea_Table", build_rofan_imperial_tea_table, (-1.65, -0.62, 0.016), 0.28, 1.12),
        ("Artisan_Arcane_Grimoire", build_arcane_grimoire_pedestal, (1.62, -0.65, 0.016), -0.28, 1.08),
        ("Artisan_Kpop_Crown_Mic", build_kpop_stage_crown_mic, (0.0, -0.58, 0.016), 0.0, 1.05),
        ("Artisan_Drafting_Easel", build_artisan_drafting_easel, (-1.95, 0.95, 0.016), 0.34, 1.02),
        ("Artisan_Celestial_Astrolabe", build_celestial_ink_astrolabe, (1.95, 0.85, 0.016), -0.32, 1.25),
        ("Artisan_Royal_Conservatory", build_royal_conservatory_gazebo, (0.0, 1.55, 0.016), 0.0, 0.78),
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

    for lname, loc, energy, size, col in (
        ("Atelier_KeyLight", (-2.6, -4.4, 3.6), 950.0, 3.2, (1.0, 0.96, 0.92)),
        ("Atelier_FillLight", (3.1, -3.8, 2.5), 520.0, 3.6, (0.82, 0.90, 1.0)),
        ("Atelier_RimLight", (0.0, 3.8, 3.4), 680.0, 2.8, (0.98, 0.84, 0.66)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.size = size
        ldata.color = col
        lobj = bpy.data.objects.new(lname, ldata)
        live_scene.collection.objects.link(lobj)
        lobj.location = Vector(loc)
        lobj.rotation_euler = (Vector((0.0, -0.4, 1.15)) - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()

    if live_scene.world is None:
        live_scene.world = bpy.data.worlds.new("AtelierLiveWorld")
    live_scene.world.use_nodes = True
    bg = live_scene.world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (0.068, 0.072, 0.096, 1.0)
        bg.inputs[1].default_value = 0.85

    cdata = bpy.data.cameras.new("StudioShowcaseCamera")
    cdata.lens = 38.0
    cam = bpy.data.objects.new("StudioShowcaseCamera", cdata)
    live_scene.collection.objects.link(cam)
    live_scene.camera = cam
    cam.location = Vector((0.0, -5.65, 2.48))
    cam.rotation_euler = (Vector((0.0, -0.35, 1.05)) - cam.location).normalized().to_track_quat("-Z", "Y").to_euler()

    for area in win.screen.areas:
        if area.type == "VIEW_3D":
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.shading.type = "MATERIAL"
                    space.overlay.show_floor = False
                    space.overlay.show_ortho_grid = False
                    if space.region_3d is not None:
                        space.region_3d.view_perspective = "CAMERA"

    bpy.context.view_layer.update()
    return {"liveMeshObjects": sum(1 for o in live_scene.objects if o.type == "MESH")}
