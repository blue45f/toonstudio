"""ToonStudio Lumière Atelier V16 — Blender 5.3.0 플래그십 마스터피스 6종 생성기 & 라이브 갤러리 쇼케이스 구성 스크립트.

모든 에셋은:
1) 미터 단위(1 BU = 1m), 바닥 Z=0(glTF Y=0) 정밀 접지
2) 수밀 2-매니폴드 지오메트리 (비매니폴드 모서리·열린 경계·고립 정점·와이어 모서리·0면적 면 0건 강제 감사)
3) 다단 베벨(2~3세그먼트) + Catmull-Clark 서브디비전 + 가중 법선(WeightedNormal) + 스마트 UV 전개
4) 정확한 sRGB→Scene-Linear 색 변환 및 Blender 5.3.0 Principled BSDF OpenPBR 재질
   (Dispersion 빛 분산, Alpha 블렌드 투명 유리, Coat, Sheen, 이진 Metallic)
을 준수하여 `apps/web/public/studio-assets/blender-lumiere-v16/`에 GLB + 512px 스튜디오 썸네일 + provenance.json + LICENSES.md를 생성한다.
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

from generate_artisan_atelier_v15 import (  # noqa: E402
    add_closed_torus_ring,
    add_swept_tapered_curve,
    audit_mesh_defects,
    compute_scene_bounds,
    ground_scene_meshes,
)
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
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-lumiere-v16"
THUMB_DIR = OUTPUT_DIR / "thumbnails"


def _chan_to_linear(c: float) -> float:
    c = max(0.0, min(1.0, float(c)))
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def srgb(r: float, g: float, b: float) -> tuple[float, float, float]:
    """지각적 sRGB(0..1) 색상을 Blender Scene-Linear RGB로 정확히 변환한다."""
    return (_chan_to_linear(r), _chan_to_linear(g), _chan_to_linear(b))


def make_lumiere_mat(
    name: str,
    srgb_color: tuple[float, float, float],
    roughness: float = 0.40,
    metallic: float = 0.0,
    ior: float = 1.50,
    alpha: float = 1.0,
    transmission_weight: float = 0.0,
    dispersion: float = 0.0,
    coat_weight: float = 0.0,
    coat_roughness: float = 0.10,
    sheen_weight: float = 0.0,
    sheen_roughness: float = 0.48,
    emission_srgb: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    existing = bpy.data.materials.get(name)
    if existing is not None:
        return existing
    lin = srgb(*srgb_color)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*lin, alpha)
    if alpha < 0.999:
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
        elif hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"
    if hasattr(mat, "use_raytrace_refraction") and transmission_weight > 0.0:
        mat.use_raytrace_refraction = True

    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*lin, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        if "IOR" in bsdf.inputs:
            bsdf.inputs["IOR"].default_value = ior
        if "Transmission Weight" in bsdf.inputs and transmission_weight > 0.0:
            bsdf.inputs["Transmission Weight"].default_value = transmission_weight
        if "Dispersion" in bsdf.inputs and dispersion > 0.0:
            bsdf.inputs["Dispersion"].default_value = dispersion
        if "Coat Weight" in bsdf.inputs and coat_weight > 0.0:
            bsdf.inputs["Coat Weight"].default_value = coat_weight
            if "Coat Roughness" in bsdf.inputs:
                bsdf.inputs["Coat Roughness"].default_value = coat_roughness
        if "Sheen Weight" in bsdf.inputs and sheen_weight > 0.0:
            bsdf.inputs["Sheen Weight"].default_value = sheen_weight
            if "Sheen Roughness" in bsdf.inputs:
                bsdf.inputs["Sheen Roughness"].default_value = sheen_roughness
        if emission_srgb is not None and "Emission Color" in bsdf.inputs:
            elin = srgb(*emission_srgb)
            bsdf.inputs["Emission Color"].default_value = (*elin, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


# ---------------------------------------------------------------------------
# 1. 로판 황녀 티아라·웨이브 헤어 조형 흉상 (Aristocrat Tiara Sculpt Bust V16)
# ---------------------------------------------------------------------------
def build_aristocrat_tiara_bust(scene: bpy.types.Scene) -> None:
    mat_skin = make_lumiere_mat(
        "V16_PorcelainBisqueSkin",
        (0.96, 0.86, 0.80),
        roughness=0.34,
        ior=1.46,
        coat_weight=0.18,
        coat_roughness=0.26,
        sheen_weight=0.14,
    )
    mat_lip = make_lumiere_mat(
        "V16_RosePetalLip",
        (0.84, 0.44, 0.48),
        roughness=0.22,
        coat_weight=0.55,
        coat_roughness=0.14,
    )
    mat_hair = make_lumiere_mat(
        "V16_RoyalRosewoodSilkHair",
        (0.28, 0.14, 0.22),
        roughness=0.24,
        ior=1.55,
        coat_weight=0.52,
        coat_roughness=0.15,
        sheen_weight=0.32,
    )
    mat_lash = make_lumiere_mat("V16_VelvetLashInk", (0.10, 0.08, 0.12), roughness=0.30)
    mat_sclera = make_lumiere_mat("V16_LustrousSclera", (0.98, 0.98, 1.0), roughness=0.08, coat_weight=0.90)
    mat_iris = make_lumiere_mat(
        "V16_AmethystRubyIris",
        (0.66, 0.20, 0.58),
        roughness=0.06,
        ior=1.54,
        coat_weight=1.0,
        emission_srgb=(0.62, 0.22, 0.56),
        emission_strength=0.65,
    )
    mat_velvet = make_lumiere_mat(
        "V16_RoyalBurgundyVelvet",
        (0.44, 0.09, 0.18),
        roughness=0.58,
        sheen_weight=0.82,
        sheen_roughness=0.35,
    )
    mat_lace = make_lumiere_mat(
        "V16_ChampagneSilkLace",
        (0.95, 0.91, 0.84),
        roughness=0.36,
        sheen_weight=0.38,
    )
    mat_gold = make_lumiere_mat(
        "V16_ImperialFiligreeGold",
        (0.90, 0.74, 0.36),
        roughness=0.18,
        metallic=1.0,
        coat_weight=0.25,
    )
    mat_diamond = make_lumiere_mat(
        "V16_DispersionDiamondPrism",
        (0.56, 0.86, 1.0),
        roughness=0.04,
        ior=2.42,
        alpha=0.82,
        transmission_weight=0.88,
        dispersion=0.55,
        coat_weight=1.0,
        coat_roughness=0.02,
        emission_srgb=(0.36, 0.78, 1.0),
        emission_strength=0.95,
    )

    bm_skin = bmesh.new()
    head_v = add_quad_sphere(bm_skin, radius=0.194, divisions=12)
    for v in head_v:
        x, y, z = v.co.x, v.co.y, v.co.z
        if z < 0.0:
            t = min(1.0, -z / 0.194)
            v.co.x *= 1.0 - 0.46 * (t**0.86)
            if y < 0.0:
                chin = math.exp(-((x / 0.064) ** 2)) * 0.044 * t
                cheek = (
                    math.exp(-(((abs(x) - 0.080) / 0.044) ** 2))
                    * math.exp(-(((z + 0.042) / 0.052) ** 2))
                    * 0.016
                )
                v.co.y -= chin + cheek
                v.co.z -= 0.034 * (t**1.24)
            else:
                v.co.y *= 1.0 - 0.22 * t
        else:
            v.co.z *= 1.06
            v.co.x *= 1.02

        if y < -0.05:
            for sx in (-0.062, 0.062):
                ed = math.hypot((x - sx) / 1.15, (z - 0.003) / 0.88)
                if ed < 0.052:
                    v.co.y += 0.020 * ((1.0 - ed / 0.052) ** 1.8)
            nd = math.hypot(x / 0.34, (z + 0.024) / 1.25)
            if nd < 0.038:
                v.co.y -= 0.031 * ((1.0 - nd / 0.038) ** 2.0)
            lip = math.hypot(x / 1.12, (z + 0.076) / 0.44)
            if lip < 0.028:
                v.co.y -= 0.012 * ((1.0 - lip / 0.028) ** 2.0)
        v.co.z += 0.695

    for side in (-1.0, 1.0):
        ear_v = add_quad_sphere(bm_skin, radius=0.035, divisions=4, scale_xyz=(0.35, 0.66, 1.30))
        bmesh.ops.rotate(
            bm_skin,
            cent=(0.0, 0.0, 0.0),
            matrix=mathutils.Euler((0.12, 0.0, side * -0.20), "XYZ").to_matrix().to_4x4(),
            verts=ear_v,
        )
        bmesh.ops.translate(bm_skin, vec=(side * 0.172, 0.008, 0.672), verts=ear_v)

    decollete_v = add_lathe_solid(
        bm_skin,
        [(0.235, 0.26), (0.215, 0.31), (0.130, 0.37), (0.062, 0.45), (0.056, 0.57)],
        segments=32,
    )
    for v in decollete_v:
        if v.co.z < 0.39:
            v.co.x *= 1.30
            v.co.y *= 0.70
    create_mesh_object(scene, "AristocratSkinBust", bm_skin, mat_skin, smooth=True, subsurf_levels=1)

    # Delicate gloss lip bow accent
    bm_lip = bmesh.new()
    add_swept_tapered_curve(
        bm_lip,
        [(-0.022, -0.176, 0.618), (-0.007, -0.184, 0.620), (0.0, -0.183, 0.619), (0.007, -0.184, 0.620), (0.022, -0.176, 0.618)],
        [0.0022, 0.0052, 0.0046, 0.0052, 0.0022],
        ring_segments=8,
        flatten_xy=(1.1, 0.72),
    )
    create_mesh_object(scene, "AristocratGlossLip", bm_lip, mat_lip, smooth=True)

    bm_sclera = bmesh.new()
    bm_iris = bmesh.new()
    bm_lash = bmesh.new()
    for side in (-1.0, 1.0):
        ex, ey, ez = side * 0.062, -0.164, 0.696
        add_quad_sphere(bm_sclera, radius=0.030, divisions=5, center_xyz=(ex, ey, ez), scale_xyz=(1.08, 0.58, 0.95))
        add_quad_sphere(bm_iris, radius=0.021, divisions=5, center_xyz=(ex, ey - 0.011, ez - 0.001), scale_xyz=(0.95, 0.42, 1.06))
        add_quad_sphere(bm_sclera, radius=0.0065, divisions=3, center_xyz=(ex + side * 0.007, ey - 0.019, ez + 0.009))
        add_quad_sphere(bm_sclera, radius=0.0038, divisions=3, center_xyz=(ex - side * 0.006, ey - 0.018, ez - 0.007))

        lash_pts = [
            (ex - side * 0.027, ey - 0.006, ez + 0.006),
            (ex, ey - 0.019, ez + 0.021),
            (ex + side * 0.029, ey - 0.010, ez + 0.015),
            (ex + side * 0.039, ey - 0.003, ez + 0.021),
        ]
        add_swept_tapered_curve(bm_lash, lash_pts, [0.0034, 0.0062, 0.0056, 0.0020], ring_segments=8, flatten_xy=(1.35, 0.62))
        brow_pts = [
            (ex - side * 0.024, ey - 0.008, ez + 0.045),
            (ex + side * 0.005, ey - 0.016, ez + 0.054),
            (ex + side * 0.032, ey - 0.006, ez + 0.046),
        ]
        add_swept_tapered_curve(bm_lash, brow_pts, [0.0034, 0.0042, 0.0018], ring_segments=8, flatten_xy=(1.2, 0.6))

    create_mesh_object(scene, "AristocratSclera", bm_sclera, mat_sclera, smooth=True)
    create_mesh_object(scene, "AristocratIris", bm_iris, mat_iris, smooth=True)
    create_mesh_object(scene, "AristocratLashes", bm_lash, mat_lash, smooth=True)

    bm_hair = bmesh.new()
    cap_v = add_quad_sphere(bm_hair, radius=0.208, divisions=9)
    for v in cap_v:
        if v.co.y < -0.04 and v.co.z < 0.058:
            lift = (0.058 - v.co.z) * max(0.0, (-v.co.y - 0.04) / 0.16)
            v.co.z += lift * 0.94
            v.co.y *= 0.88
        v.co.z = v.co.z * 1.08 + 0.712
        v.co.y += 0.015

    wave_locks = [
        ([(-0.010, -0.105, 0.895), (-0.042, -0.184, 0.830), (-0.068, -0.190, 0.755), (-0.058, -0.182, 0.712)], [0.032, 0.036, 0.022, 0.0045]),
        ([(0.014, -0.105, 0.895), (0.046, -0.184, 0.830), (0.072, -0.190, 0.755), (0.060, -0.182, 0.712)], [0.032, 0.036, 0.022, 0.0045]),
        ([(-0.055, -0.092, 0.885), (-0.102, -0.168, 0.812), (-0.118, -0.176, 0.735)], [0.034, 0.035, 0.006]),
        ([(0.058, -0.092, 0.885), (0.104, -0.168, 0.812), (0.120, -0.176, 0.735)], [0.034, 0.035, 0.006]),
    ]
    for pts, rads in wave_locks:
        add_swept_tapered_curve(bm_hair, pts, rads, ring_segments=10, flatten_xy=(1.42, 0.36), keel_ridge=0.44)

    for side in (-1.0, 1.0):
        ringlet_pts = [
            (side * 0.145, -0.040, 0.840),
            (side * 0.205, -0.105, 0.720),
            (side * 0.178, -0.145, 0.590),
            (side * 0.218, -0.120, 0.465),
            (side * 0.185, -0.155, 0.355),
            (side * 0.162, -0.140, 0.285),
        ]
        add_swept_tapered_curve(
            bm_hair,
            ringlet_pts,
            [0.042, 0.046, 0.040, 0.034, 0.022, 0.005],
            ring_segments=10,
            flatten_xy=(1.38, 0.42),
            keel_ridge=0.44,
        )

    for idx in range(13):
        ang = math.radians(-84.0 + idx * (168.0 / 12.0))
        sx, cy = math.sin(ang), math.cos(ang)
        wave = 0.032 * math.sin(idx * 1.4)
        pts = [
            (sx * 0.168, cy * 0.148 + 0.038, 0.835),
            (sx * 0.225, cy * 0.205 + 0.052, 0.680),
            (sx * (0.255 + wave), cy * 0.238 + 0.070, 0.505),
            (sx * (0.235 - wave), cy * 0.255 + 0.088, 0.335),
        ]
        add_swept_tapered_curve(bm_hair, pts, [0.046, 0.050, 0.038, 0.008], ring_segments=10, flatten_xy=(1.46, 0.38), keel_ridge=0.40)

    create_mesh_object(scene, "AristocratWaveHair", bm_hair, mat_hair, smooth=True, subsurf_levels=1)

    bm_gold = bmesh.new()
    bm_gems = bmesh.new()
    tiara_pts = [
        (0.145 * math.sin(math.radians(a)), -0.142 * math.cos(math.radians(a)) - 0.012, 0.888 + 0.018 * math.cos(math.radians(a)))
        for a in (-68, -45, -22, 0, 22, 45, 68)
    ]
    add_swept_tapered_curve(bm_gold, tiara_pts, [0.008, 0.011, 0.013, 0.015, 0.013, 0.011, 0.008], ring_segments=10, flatten_xy=(1.0, 1.0))

    for deg, spire_h, gem_r in ((-52, 0.042, 0.011), (-26, 0.064, 0.014), (0, 0.092, 0.020), (26, 0.064, 0.014), (52, 0.042, 0.011)):
        rad = math.radians(deg)
        bx = 0.142 * math.sin(rad)
        by = -0.140 * math.cos(rad) - 0.014
        bz = 0.892 + 0.016 * math.cos(rad)
        add_lathe_solid(
            bm_gold,
            [(0.012, 0.0), (0.008, spire_h * 0.55), (0.013, spire_h * 0.82), (0.004, spire_h)],
            segments=12,
            center_xyz=(bx, by, bz),
            rot_euler=(0.18, 0.0, -rad),
        )
        add_lathe_solid(
            bm_gems,
            [(0.003, -gem_r * 1.1), (gem_r, 0.0), (gem_r * 0.65, gem_r * 0.65), (0.003, gem_r * 1.15)],
            segments=8,
            center_xyz=(bx * 1.02, by - 0.008, bz + spire_h * 0.58),
            rot_euler=(math.pi * 0.5 - 0.18, 0.0, -rad),
        )

    add_lathe_solid(
        bm_gold,
        [(0.285, 0.0), (0.285, 0.026), (0.242, 0.048), (0.198, 0.105), (0.240, 0.138), (0.262, 0.162)],
        segments=48,
    )
    add_closed_torus_ring(bm_gold, 0.032, 0.006, major_segs=24, minor_segs=10, center_xyz=(0.0, -0.162, 0.305), rot_euler=(math.pi * 0.5 - 0.20, 0.0, 0.0))
    add_quad_sphere(bm_gems, radius=0.024, divisions=5, center_xyz=(0.0, -0.168, 0.305), scale_xyz=(0.82, 0.48, 1.16))

    create_mesh_object(scene, "AristocratTiaraAndPlinth", bm_gold, mat_gold, smooth=True, weighted_normals=True)
    create_mesh_object(scene, "AristocratDispersionGems", bm_gems, mat_diamond, smooth=True)

    bm_velvet = bmesh.new()
    add_lathe_solid(
        bm_velvet,
        [(0.275, 0.160), (0.295, 0.215), (0.250, 0.295), (0.210, 0.330)],
        segments=40,
        scale_xyz=(1.28, 0.76, 1.0),
    )
    create_mesh_object(scene, "AristocratVelvetBodice", bm_velvet, mat_velvet, smooth=True, weighted_normals=True)

    bm_lace = bmesh.new()
    add_closed_torus_ring(
        bm_lace, 0.218, 0.020, major_segs=40, minor_segs=12, center_xyz=(0.0, 0.0, 0.328), rot_euler=(0.08, 0.0, 0.0)
    )
    for b in list(bm_lace.verts):
        b.co.x *= 1.26
        b.co.y *= 0.75
    create_mesh_object(scene, "AristocratSilkTrim", bm_lace, mat_lace, smooth=True)


# ---------------------------------------------------------------------------
# 2. 크리스탈 프리즘 각성 성검 제단 (Crystal Prism Sanctum Altar V16)
# ---------------------------------------------------------------------------
def build_crystal_prism_sanctum(scene: bpy.types.Scene) -> None:
    mat_stone = make_lumiere_mat("V16_SanctumDarkMarble", (0.22, 0.24, 0.30), roughness=0.34, coat_weight=0.35)
    mat_pillars = make_lumiere_mat("V16_SanctumAlabaster", (0.86, 0.84, 0.79), roughness=0.44, coat_weight=0.14)
    mat_gold = make_lumiere_mat("V16_SanctumRunicGold", (0.90, 0.73, 0.34), roughness=0.18, metallic=1.0)
    mat_blade = make_lumiere_mat(
        "V16_StarforgedSilverSteel",
        (0.88, 0.92, 0.98),
        roughness=0.12,
        metallic=1.0,
        coat_weight=0.38,
    )
    mat_crystal = make_lumiere_mat(
        "V16_ArcaneDispersionCrystal",
        (0.32, 0.80, 0.98),
        roughness=0.04,
        ior=2.15,
        alpha=0.76,
        transmission_weight=0.90,
        dispersion=0.48,
        coat_weight=1.0,
        coat_roughness=0.03,
        emission_srgb=(0.24, 0.74, 0.98),
        emission_strength=1.35,
    )

    bm_dais = bmesh.new()
    add_lathe_solid(
        bm_dais,
        [(1.52, 0.0), (1.52, 0.11), (1.30, 0.12), (1.30, 0.24), (1.06, 0.25), (1.06, 0.36)],
        segments=8,
    )
    add_lathe_solid(
        bm_dais,
        [(0.48, 0.36), (0.42, 0.45), (0.34, 0.82), (0.44, 0.92), (0.46, 0.98)],
        segments=8,
    )
    create_mesh_object(scene, "SanctumObsidianDais", bm_dais, mat_stone, smooth=False, weighted_normals=True)

    bm_pillars = bmesh.new()
    for k in range(4):
        ang = math.radians(45.0 + k * 90.0)
        cx, cy = 1.08 * math.cos(ang), 1.08 * math.sin(ang)
        add_beveled_box(bm_pillars, (0.26, 0.26, 0.14), (cx, cy, 0.32), 0.010, segments=2, rot_euler=(0.0, 0.0, ang))
        add_fluted_column_shaft(
            bm_pillars,
            base_radius=0.095,
            top_radius=0.082,
            height=1.68,
            flutes=12,
            flute_depth=0.008,
            entasis=0.010,
            z_divisions=10,
            center_xyz=(cx, cy, 0.39),
        )
        add_lathe_solid(
            bm_pillars,
            [(0.088, 2.07), (0.135, 2.15), (0.150, 2.22)],
            segments=16,
            center_xyz=(cx, cy, 0.0),
        )
    create_mesh_object(scene, "SanctumFlutedPillars", bm_pillars, mat_pillars, smooth=True, weighted_normals=True)

    bm_gold = bmesh.new()
    add_closed_torus_ring(bm_gold, 0.94, 0.018, major_segs=48, minor_segs=10, center_xyz=(0.0, 0.0, 0.365))
    add_closed_torus_ring(bm_gold, 0.56, 0.015, major_segs=40, minor_segs=10, center_xyz=(0.0, 0.0, 0.368))
    add_closed_torus_ring(
        bm_gold, 0.42, 0.014, major_segs=40, minor_segs=10, center_xyz=(0.0, 0.0, 1.68), rot_euler=(0.36, 0.22, 0.0)
    )
    add_closed_torus_ring(
        bm_gold, 0.34, 0.012, major_segs=36, minor_segs=10, center_xyz=(0.0, 0.0, 1.68), rot_euler=(-0.42, 0.28, 0.4)
    )
    add_swept_tapered_curve(
        bm_gold,
        [(-0.28, 0.0, 2.28), (-0.12, 0.0, 2.20), (0.0, 0.0, 2.18), (0.12, 0.0, 2.20), (0.28, 0.0, 2.28)],
        [0.012, 0.026, 0.034, 0.026, 0.012],
        ring_segments=10,
        flatten_xy=(1.2, 0.65),
    )
    add_lathe_solid(
        bm_gold,
        [(0.024, 2.18), (0.020, 2.46), (0.038, 2.52), (0.010, 2.59)],
        segments=16,
    )
    create_mesh_object(scene, "SanctumRunicRingsAndHilt", bm_gold, mat_gold, smooth=True, weighted_normals=True)

    bm_blade = bmesh.new()
    add_lathe_solid(
        bm_blade,
        [(0.004, 1.24), (0.058, 1.48), (0.072, 2.18)],
        segments=4,
        scale_xyz=(1.35, 0.26, 1.0),
    )
    create_mesh_object(scene, "SanctumAwakeningBlade", bm_blade, mat_blade, smooth=False, weighted_normals=True)

    bm_crys = bmesh.new()
    add_quad_sphere(bm_crys, radius=0.115, divisions=6, center_xyz=(0.0, 0.0, 1.10))
    for k in range(4):
        ang = math.radians(45.0 + k * 90.0)
        cx, cy = 1.08 * math.cos(ang), 1.08 * math.sin(ang)
        add_lathe_solid(
            bm_crys,
            [(0.006, 2.25), (0.068, 2.38), (0.052, 2.56), (0.005, 2.70)],
            segments=6,
            center_xyz=(cx, cy, 0.0),
        )
    for idx in range(6):
        ang = math.radians(idx * 60.0 + 15.0)
        dist = 0.66
        cx, cy = dist * math.cos(ang), dist * math.sin(ang)
        h_spire = 0.58 + (idx % 2) * 0.18
        tilt_x = -0.26 * math.sin(ang)
        tilt_y = 0.26 * math.cos(ang)
        add_lathe_solid(
            bm_crys,
            [(0.068, 0.0), (0.082, h_spire * 0.18), (0.064, h_spire * 0.78), (0.005, h_spire)],
            segments=6,
            center_xyz=(cx, cy, 0.34),
            rot_euler=(tilt_x, tilt_y, ang),
        )
    create_mesh_object(scene, "SanctumPrismCrystals", bm_crys, mat_crystal, smooth=False, weighted_normals=True)


# ---------------------------------------------------------------------------
# 3. 대마탑 복층 아치 서가·천구 로툰다 (Grand Spiral Library Rotunda V16)
# ---------------------------------------------------------------------------
def build_grand_spiral_library_rotunda(scene: bpy.types.Scene) -> None:
    mat_walnut = make_lumiere_mat("V16_LibraryDarkWalnut", (0.36, 0.21, 0.13), roughness=0.34, coat_weight=0.40)
    mat_stone = make_lumiere_mat("V16_LibraryWarmMarble", (0.78, 0.74, 0.68), roughness=0.42, coat_weight=0.22)
    mat_brass = make_lumiere_mat("V16_LibraryGalleryBrass", (0.88, 0.71, 0.34), roughness=0.20, metallic=1.0)
    mat_books_ruby = make_lumiere_mat("V16_GrimoireCrimsonLeather", (0.56, 0.13, 0.16), roughness=0.46, sheen_weight=0.32)
    mat_books_navy = make_lumiere_mat("V16_GrimoireSapphireLeather", (0.14, 0.25, 0.48), roughness=0.44, sheen_weight=0.32)
    mat_books_emerald = make_lumiere_mat("V16_GrimoireEmeraldLeather", (0.14, 0.38, 0.26), roughness=0.46, sheen_weight=0.32)
    mat_orb = make_lumiere_mat(
        "V16_LecternAstralOrb",
        (1.0, 0.88, 0.56),
        roughness=0.08,
        ior=1.60,
        alpha=0.88,
        transmission_weight=0.65,
        dispersion=0.25,
        emission_srgb=(1.0, 0.84, 0.46),
        emission_strength=1.55,
    )

    bm_stone = bmesh.new()
    add_lathe_solid(bm_stone, [(1.95, 0.0), (1.95, 0.10), (1.82, 0.12)], segments=40)
    create_mesh_object(scene, "LibraryRotundaFloor", bm_stone, mat_stone, smooth=True, weighted_normals=True)

    bm_wood = bmesh.new()
    bm_brass = bmesh.new()
    bm_books_a = bmesh.new()
    bm_books_b = bmesh.new()
    bm_books_c = bmesh.new()

    add_closed_torus_ring(bm_brass, 1.78, 0.014, major_segs=48, minor_segs=8, center_xyz=(0.0, 0.0, 0.122))

    arc_r = 1.56
    bay_angles = [-76.0, -38.0, 0.0, 38.0, 76.0]
    for deg in bay_angles:
        ang = math.radians(deg)
        cx, cy = arc_r * math.sin(ang), arc_r * math.cos(ang)
        rot_z = -ang
        add_beveled_box(bm_wood, (0.86, 0.34, 3.02), (cx, cy, 1.63), 0.008, segments=2, rot_euler=(0.0, 0.0, rot_z))
        for sz in (0.52, 0.96, 1.40, 1.72, 2.18, 2.62, 3.08):
            ir = arc_r - 0.14
            sx, sy = ir * math.sin(ang), ir * math.cos(ang)
            add_beveled_box(bm_wood, (0.88, 0.38, 0.038), (sx, sy, sz), 0.005, segments=2, rot_euler=(0.0, 0.0, rot_z))

        book_ir = arc_r - 0.20
        tang = Vector((math.cos(ang), -math.sin(ang), 0.0))
        for s_idx, sz in enumerate((0.54, 0.98, 2.20, 2.64)):
            for b_idx in range(7):
                offset_t = -0.30 + b_idx * 0.10
                bh = 0.24 + ((b_idx + s_idx) % 3) * 0.035
                bx = book_ir * math.sin(ang) + tang.x * offset_t
                by = book_ir * math.cos(ang) + tang.y * offset_t
                target_bm = (bm_books_a, bm_books_b, bm_books_c)[(b_idx + s_idx) % 3]
                add_beveled_box(
                    target_bm,
                    (0.072, 0.20, bh),
                    (bx, by, sz + bh * 0.5),
                    0.004,
                    segments=1,
                    rot_euler=(0.0, 0.0, rot_z),
                )

    col_angles = [-92.0, -55.0, -18.0, 18.0, 55.0, 92.0]
    col_r = 1.24
    for deg in col_angles:
        ang = math.radians(deg)
        px, py = col_r * math.sin(ang), col_r * math.cos(ang)
        add_fluted_column_shaft(
            bm_wood,
            base_radius=0.068,
            top_radius=0.058,
            height=3.02,
            flutes=12,
            flute_depth=0.005,
            entasis=0.006,
            z_divisions=8,
            center_xyz=(px, py, 0.12),
        )
        add_closed_torus_ring(bm_brass, 0.074, 0.012, major_segs=20, minor_segs=8, center_xyz=(px, py, 0.14))
        add_closed_torus_ring(bm_brass, 0.068, 0.011, major_segs=20, minor_segs=8, center_xyz=(px, py, 1.68))
        add_closed_torus_ring(bm_brass, 0.066, 0.011, major_segs=20, minor_segs=8, center_xyz=(px, py, 3.12))

    rail_pts = [(1.16 * math.sin(math.radians(a)), 1.16 * math.cos(math.radians(a)), 1.98) for a in range(-92, 93, 16)]
    add_swept_tapered_curve(bm_brass, rail_pts, [0.018] * len(rail_pts), ring_segments=10, flatten_xy=(1.0, 1.0))
    crown_pts = [(1.30 * math.sin(math.radians(a)), 1.30 * math.cos(math.radians(a)), 3.20) for a in range(-92, 93, 16)]
    add_swept_tapered_curve(bm_wood, crown_pts, [0.055] * len(crown_pts), ring_segments=10, flatten_xy=(1.2, 0.9))

    for a in range(-84, 85, 12):
        ra = math.radians(a)
        add_tube_segment(
            bm_brass,
            (1.16 * math.sin(ra), 1.16 * math.cos(ra), 1.68),
            (1.16 * math.sin(ra), 1.16 * math.cos(ra), 1.97),
            0.010,
            0.010,
            segments=8,
        )

    add_lathe_solid(
        bm_wood,
        [(0.24, 0.12), (0.18, 0.20), (0.075, 0.65), (0.068, 0.98), (0.14, 1.05)],
        segments=24,
        center_xyz=(0.0, -0.15, 0.0),
    )
    add_beveled_box(bm_wood, (0.52, 0.36, 0.032), (0.0, -0.15, 1.09), 0.006, segments=2, rot_euler=(0.38, 0.0, 0.0))
    add_beveled_box(bm_books_a, (0.21, 0.28, 0.028), (-0.11, -0.15, 1.12), 0.004, segments=1, rot_euler=(0.38, 0.08, 0.0))
    add_beveled_box(bm_books_b, (0.21, 0.28, 0.028), (0.11, -0.15, 1.12), 0.004, segments=1, rot_euler=(0.38, -0.08, 0.0))

    add_closed_torus_ring(bm_brass, 0.16, 0.010, major_segs=32, minor_segs=8, center_xyz=(0.0, 0.36, 2.35), rot_euler=(0.55, 0.25, 0.0))
    add_closed_torus_ring(bm_brass, 0.13, 0.009, major_segs=28, minor_segs=8, center_xyz=(0.0, 0.36, 2.35), rot_euler=(-0.45, 0.35, 0.4))

    create_mesh_object(scene, "LibraryWalnutRotunda", bm_wood, mat_walnut, smooth=True, weighted_normals=True)
    create_mesh_object(scene, "LibraryBrassBalustrade", bm_brass, mat_brass, smooth=True, weighted_normals=True)
    create_mesh_object(scene, "LibraryCrimsonGrimoires", bm_books_a, mat_books_ruby, smooth=True, weighted_normals=True)
    create_mesh_object(scene, "LibrarySapphireGrimoires", bm_books_b, mat_books_navy, smooth=True, weighted_normals=True)
    create_mesh_object(scene, "LibraryEmeraldGrimoires", bm_books_c, mat_books_emerald, smooth=True, weighted_normals=True)

    bm_orb = bmesh.new()
    add_quad_sphere(bm_orb, radius=0.075, divisions=5, center_xyz=(0.0, 0.36, 2.35))
    create_mesh_object(scene, "LibraryChandelierOrb", bm_orb, mat_orb, smooth=True)


# ---------------------------------------------------------------------------
# 4. 파리지앵 파티세리 유리 쇼케이스·티카트 (Parisian Patisserie Display Cart V16)
# ---------------------------------------------------------------------------
def build_parisian_patisserie_cart(scene: bpy.types.Scene) -> None:
    mat_enamel = make_lumiere_mat("V16_ParisianSageEnamel", (0.20, 0.40, 0.34), roughness=0.26, coat_weight=0.68)
    mat_brass = make_lumiere_mat("V16_PatisserieBrass", (0.89, 0.72, 0.35), roughness=0.18, metallic=1.0)
    mat_marble = make_lumiere_mat("V16_CarraraCountertop", (0.95, 0.94, 0.91), roughness=0.22, coat_weight=0.55)
    mat_glass = make_lumiere_mat(
        "V16_ClocheCrystalGlass",
        (0.84, 0.95, 1.0),
        roughness=0.03,
        ior=1.52,
        alpha=0.22,
        transmission_weight=0.86,
        dispersion=0.18,
        coat_weight=1.0,
    )
    mat_pastry = make_lumiere_mat("V16_GoldenCroissantCrust", (0.76, 0.46, 0.16), roughness=0.44, sheen_weight=0.22)
    mat_berry = make_lumiere_mat("V16_RaspberryMacaronRose", (0.86, 0.24, 0.42), roughness=0.30, coat_weight=0.48)
    mat_awning = make_lumiere_mat("V16_BistroBurgundyAwning", (0.62, 0.14, 0.24), roughness=0.64, sheen_weight=0.58)

    bm_body = bmesh.new()
    add_beveled_box(bm_body, (1.28, 0.68, 0.56), (0.0, 0.0, 0.54), 0.014, segments=3)
    add_beveled_box(bm_body, (1.22, 0.62, 0.04), (0.0, 0.0, 0.19), 0.008, segments=2)
    create_mesh_object(scene, "PatisserieEnamelBody", bm_body, mat_enamel, smooth=True, weighted_normals=True)

    bm_top = bmesh.new()
    add_beveled_box(bm_top, (1.36, 0.74, 0.045), (0.0, 0.0, 0.842), 0.008, segments=3)
    # White awning stripes alternating with burgundy canopy
    for sx in (-0.48, 0.0, 0.48):
        add_beveled_box(bm_top, (0.24, 0.47, 0.048), (sx, -0.20, 1.964), 0.006, segments=2, rot_euler=(0.34, 0.0, 0.0))
        add_beveled_box(bm_top, (0.24, 0.47, 0.048), (sx, 0.20, 1.964), 0.006, segments=2, rot_euler=(-0.34, 0.0, 0.0))
    # Porcelain teapot & 2 teacups
    add_lathe_solid(
        bm_top,
        [(0.055, 0.865), (0.082, 0.92), (0.074, 1.00), (0.042, 1.035), (0.018, 1.06)],
        segments=20,
        center_xyz=(0.42, 0.10, 0.0),
    )
    for cx, cy in ((0.34, -0.14), (0.50, -0.12)):
        add_lathe_solid(bm_top, [(0.055, 0.865), (0.062, 0.878), (0.028, 0.882), (0.042, 0.935)], segments=18, center_xyz=(cx, cy, 0.0))
    create_mesh_object(scene, "PatisserieMarbleAndPorcelain", bm_top, mat_marble, smooth=True, weighted_normals=True)

    bm_brass = bmesh.new()
    # Front/back brass molding trim panels on cart body
    for side_y in (-0.344, 0.344):
        for panel_x in (-0.30, 0.30):
            add_beveled_box(bm_brass, (0.48, 0.012, 0.38), (panel_x, side_y, 0.54), 0.003, segments=1)

    for side_y in (-0.37, 0.37):
        add_closed_torus_ring(
            bm_brass, 0.24, 0.022, major_segs=36, minor_segs=10, center_xyz=(-0.34, side_y, 0.262), rot_euler=(math.pi * 0.5, 0.0, 0.0)
        )
        for sp in range(8):
            sa = (math.pi * sp) / 4.0
            add_tube_segment(
                bm_brass,
                (-0.34, side_y, 0.262),
                (-0.34 + 0.23 * math.cos(sa), side_y, 0.262 + 0.23 * math.sin(sa)),
                0.008,
                0.008,
                segments=8,
            )
        add_closed_torus_ring(
            bm_brass, 0.13, 0.018, major_segs=28, minor_segs=10, center_xyz=(0.44, side_y, 0.148), rot_euler=(math.pi * 0.5, 0.0, 0.0)
        )

    add_tube_segment(bm_brass, (0.68, -0.28, 0.84), (0.82, -0.28, 0.92), 0.015, 0.015, segments=10)
    add_tube_segment(bm_brass, (0.68, 0.28, 0.84), (0.82, 0.28, 0.92), 0.015, 0.015, segments=10)
    add_tube_segment(bm_brass, (0.82, -0.30, 0.92), (0.82, 0.30, 0.92), 0.016, 0.016, segments=12)

    for px in (-0.60, 0.60):
        for py in (-0.30, 0.30):
            add_tube_segment(bm_brass, (px, py, 0.86), (px, py, 1.88), 0.016, 0.014, segments=12)

    # Brass corner mullions around pastry vitrine (-0.36, 0.02)
    for vx in (-0.59, -0.13):
        for vy in (-0.22, 0.26):
            add_tube_segment(bm_brass, (vx, vy, 0.865), (vx, vy, 1.16), 0.007, 0.007, segments=8)
    add_beveled_box(bm_brass, (0.48, 0.50, 0.012), (-0.36, 0.02, 1.162), 0.003, segments=1)

    add_lathe_solid(
        bm_brass,
        [
            (0.06, 0.865),
            (0.014, 0.88),
            (0.15, 0.95),
            (0.014, 0.965),
            (0.12, 1.12),
            (0.012, 1.135),
            (0.09, 1.28),
            (0.022, 1.35),
        ],
        segments=24,
        center_xyz=(0.08, 0.04, 0.0),
    )
    create_mesh_object(scene, "PatisserieBrassHardware", bm_brass, mat_brass, smooth=True, weighted_normals=True)

    bm_pastry = bmesh.new()
    bm_berry = bmesh.new()
    for row_y in (-0.10, 0.04, 0.16):
        for cx in (-0.46, -0.26):
            pts = [
                (cx - 0.055, row_y - 0.02, 0.89),
                (cx - 0.020, row_y + 0.02, 0.92),
                (cx + 0.020, row_y + 0.02, 0.92),
                (cx + 0.055, row_y - 0.02, 0.89),
            ]
            add_swept_tapered_curve(bm_pastry, pts, [0.011, 0.030, 0.030, 0.011], ring_segments=10, flatten_xy=(1.1, 0.85))
    for ang_i in range(5):
        ma = (2.0 * math.pi * ang_i) / 5.0
        mx, my = 0.08 + 0.085 * math.cos(ma), 0.04 + 0.085 * math.sin(ma)
        add_lathe_solid(bm_berry, [(0.024, 0.965), (0.028, 0.980), (0.024, 0.995)], segments=14, center_xyz=(mx, my, 0.0))
        tx, ty = 0.08 + 0.062 * math.cos(ma + 0.4), 0.04 + 0.062 * math.sin(ma + 0.4)
        add_lathe_solid(bm_pastry, [(0.022, 1.135), (0.028, 1.155)], segments=14, center_xyz=(tx, ty, 0.0))
        add_quad_sphere(bm_berry, radius=0.016, divisions=3, center_xyz=(tx, ty, 1.166))

    create_mesh_object(scene, "PatisserieCroissantsAndTarts", bm_pastry, mat_pastry, smooth=True)
    create_mesh_object(scene, "PatisserieBerryMacarons", bm_berry, mat_berry, smooth=True)

    bm_glass = bmesh.new()
    add_beveled_box(bm_glass, (0.45, 0.47, 0.28), (-0.36, 0.02, 1.01), 0.006, segments=2)
    add_lathe_solid(
        bm_glass,
        [(0.105, 1.28), (0.102, 1.36), (0.075, 1.42), (0.018, 1.45)],
        segments=24,
        center_xyz=(0.08, 0.04, 0.0),
    )
    create_mesh_object(scene, "PatisserieCrystalVitrine", bm_glass, mat_glass, smooth=True)

    bm_awning = bmesh.new()
    add_beveled_box(bm_awning, (1.44, 0.46, 0.044), (0.0, -0.20, 1.96), 0.008, segments=2, rot_euler=(0.34, 0.0, 0.0))
    add_beveled_box(bm_awning, (1.44, 0.46, 0.044), (0.0, 0.20, 1.96), 0.008, segments=2, rot_euler=(-0.34, 0.0, 0.0))
    create_mesh_object(scene, "PatisserieBistroCanopy", bm_awning, mat_awning, smooth=True, weighted_normals=True)


# ---------------------------------------------------------------------------
# 5. 천문 크로노미터 태양계 오러리 시계탑 코어 (Celestial Chrono Orrery Clock V16)
# ---------------------------------------------------------------------------
def build_celestial_chrono_orrery(scene: bpy.types.Scene) -> None:
    mat_obsidian = make_lumiere_mat("V16_ObsidianMarbleBase", (0.12, 0.14, 0.20), roughness=0.20, coat_weight=0.78)
    mat_brass = make_lumiere_mat("V16_ChronoPolishedBrass", (0.90, 0.73, 0.35), roughness=0.17, metallic=1.0)
    mat_copper = make_lumiere_mat("V16_ChronoRoseCopper", (0.84, 0.48, 0.32), roughness=0.22, metallic=1.0)
    mat_sun = make_lumiere_mat(
        "V16_HeliosAmberCrystal",
        (1.0, 0.80, 0.30),
        roughness=0.06,
        ior=1.85,
        alpha=0.90,
        transmission_weight=0.70,
        dispersion=0.38,
        coat_weight=1.0,
        emission_srgb=(1.0, 0.76, 0.24),
        emission_strength=1.85,
    )
    mat_planet = make_lumiere_mat(
        "V16_PlanetSapphireGlaze",
        (0.22, 0.58, 0.94),
        roughness=0.12,
        coat_weight=0.92,
        emission_srgb=(0.18, 0.48, 0.88),
        emission_strength=0.45,
    )

    bm_base = bmesh.new()
    add_lathe_solid(
        bm_base,
        [(0.52, 0.0), (0.52, 0.045), (0.46, 0.075), (0.42, 0.125), (0.44, 0.155)],
        segments=8,
    )
    create_mesh_object(scene, "OrreryObsidianPlinth", bm_base, mat_obsidian, smooth=False, weighted_normals=True)

    bm_brass = bmesh.new()
    bm_copper = bmesh.new()
    add_involute_gear(bm_brass, pitch_radius=0.32, teeth=28, thickness=0.034, bore_radius=0.065, center_xyz=(0.0, 0.0, 0.185))
    add_involute_gear(bm_copper, pitch_radius=0.21, teeth=20, thickness=0.030, bore_radius=0.048, center_xyz=(0.0, 0.0, 0.235), phase=0.16)
    add_involute_gear(bm_brass, pitch_radius=0.15, teeth=16, thickness=0.028, bore_radius=0.032, center_xyz=(0.24, 0.12, 0.225), phase=0.22)
    add_involute_gear(bm_copper, pitch_radius=0.13, teeth=14, thickness=0.026, bore_radius=0.028, center_xyz=(-0.22, -0.14, 0.225), phase=0.10)
    add_involute_gear(
        bm_brass,
        pitch_radius=0.16,
        teeth=16,
        thickness=0.026,
        bore_radius=0.032,
        center_xyz=(0.0, -0.26, 0.36),
        rot_euler=(math.pi * 0.5, 0.0, 0.0),
    )

    add_lathe_solid(
        bm_brass,
        [(0.048, 0.15), (0.026, 0.28), (0.018, 0.98), (0.034, 1.04), (0.008, 1.14)],
        segments=24,
    )
    add_closed_torus_ring(bm_brass, 0.44, 0.020, major_segs=48, minor_segs=12, center_xyz=(0.0, 0.0, 0.62), rot_euler=(0.24, 0.0, 0.0))
    add_closed_torus_ring(bm_copper, 0.38, 0.017, major_segs=44, minor_segs=12, center_xyz=(0.0, 0.0, 0.62), rot_euler=(1.08, 0.38, 0.2))
    add_closed_torus_ring(bm_brass, 0.31, 0.015, major_segs=40, minor_segs=10, center_xyz=(0.0, 0.0, 0.62), rot_euler=(-0.78, 0.52, -0.3))

    planet_arms = [
        (0.35, 0.26, 0.46, 0.036, False),
        (-0.28, 0.20, 0.54, 0.048, True),
        (0.18, -0.22, 0.72, 0.028, False),
    ]
    bm_planets = bmesh.new()
    for px, py, pz, pr, has_ring in planet_arms:
        add_tube_segment(bm_brass, (0.0, 0.0, pz - 0.08), (px, py, pz - pr - 0.01), 0.011, 0.009, segments=10)
        add_quad_sphere(bm_planets, radius=pr, divisions=5, center_xyz=(px, py, pz))
        if has_ring:
            add_closed_torus_ring(
                bm_copper, pr * 1.85, 0.007, major_segs=28, minor_segs=8, center_xyz=(px, py, pz), rot_euler=(0.42, -0.28, 0.0)
            )

    create_mesh_object(scene, "OrreryBrassClockwork", bm_brass, mat_brass, smooth=True, weighted_normals=True)
    create_mesh_object(scene, "OrreryCopperGimbals", bm_copper, mat_copper, smooth=True, weighted_normals=True)
    create_mesh_object(scene, "OrreryOrbitingPlanets", bm_planets, mat_planet, smooth=True)

    bm_sun = bmesh.new()
    add_quad_sphere(bm_sun, radius=0.105, divisions=6, center_xyz=(0.0, 0.0, 0.62))
    create_mesh_object(scene, "OrrerySolarCore", bm_sun, mat_sun, smooth=True, subsurf_levels=1)


# ---------------------------------------------------------------------------
# 6. 달빛 한옥 연꽃 석등·배흘림 누각 정자 (Moonlight Hanok Lotus Pavilion V16)
# ---------------------------------------------------------------------------
def build_moonlight_hanok_pavilion(scene: bpy.types.Scene) -> None:
    mat_granite = make_lumiere_mat("V16_GyeongjuGranite", (0.68, 0.67, 0.64), roughness=0.68)
    mat_zelkova = make_lumiere_mat("V16_ZelkovaTimber", (0.48, 0.25, 0.14), roughness=0.38, coat_weight=0.30)
    mat_giwa = make_lumiere_mat("V16_CharcoalGiwaTile", (0.16, 0.18, 0.22), roughness=0.44, coat_weight=0.18)
    mat_hanji = make_lumiere_mat(
        "V16_WarmMoonlightHanji",
        (1.0, 0.88, 0.62),
        roughness=0.28,
        emission_srgb=(1.0, 0.78, 0.36),
        emission_strength=2.60,
    )

    bm_stone = bmesh.new()
    add_beveled_box(bm_stone, (2.56, 2.56, 0.18), (0.0, 0.0, 0.09), 0.012, segments=2)
    add_beveled_box(bm_stone, (2.28, 2.28, 0.16), (0.0, 0.0, 0.26), 0.010, segments=2)
    add_beveled_box(bm_stone, (0.76, 0.34, 0.14), (0.0, -1.28, 0.07), 0.008, segments=2)
    add_beveled_box(bm_stone, (0.72, 0.28, 0.14), (0.0, -1.14, 0.21), 0.008, segments=2)

    for px in (-0.88, 0.88):
        for py in (-0.88, 0.88):
            add_lathe_solid(bm_stone, [(0.16, 0.34), (0.14, 0.44)], segments=8, center_xyz=(px, py, 0.0))

    lx, ly = 0.86, -1.42
    add_lathe_solid(
        bm_stone,
        [(0.22, 0.0), (0.20, 0.10), (0.11, 0.22), (0.085, 0.56), (0.19, 0.66), (0.21, 0.72)],
        segments=8,
        center_xyz=(lx, ly, 0.0),
    )
    add_lathe_solid(
        bm_stone,
        [(0.28, 0.98), (0.22, 1.08), (0.08, 1.18), (0.05, 1.28), (0.012, 1.36)],
        segments=8,
        center_xyz=(lx, ly, 0.0),
    )
    for ca in range(4):
        cang = math.radians(45.0 + ca * 90.0)
        add_tube_segment(
            bm_stone,
            (lx + 0.13 * math.cos(cang), ly + 0.13 * math.sin(cang), 0.72),
            (lx + 0.13 * math.cos(cang), ly + 0.13 * math.sin(cang), 0.99),
            0.022,
            0.022,
            segments=8,
        )
    create_mesh_object(scene, "HanokGraniteAndLantern", bm_stone, mat_granite, smooth=False, weighted_normals=True)

    bm_wood = bmesh.new()
    add_beveled_box(bm_wood, (1.96, 1.96, 0.08), (0.0, 0.0, 0.46), 0.008, segments=2)
    for px in (-0.88, 0.88):
        for py in (-0.88, 0.88):
            add_fluted_column_shaft(
                bm_wood,
                base_radius=0.105,
                top_radius=0.092,
                height=1.78,
                flutes=16,
                flute_depth=0.0,
                entasis=0.016,
                z_divisions=10,
                center_xyz=(px, py, 0.44),
            )
            add_beveled_box(bm_wood, (0.32, 0.32, 0.09), (px, py, 2.26), 0.008, segments=2)
            add_beveled_box(bm_wood, (0.44, 0.22, 0.08), (px, py, 2.34), 0.008, segments=2)
            add_beveled_box(bm_wood, (0.22, 0.44, 0.08), (px, py, 2.34), 0.008, segments=2)

    add_beveled_box(bm_wood, (2.06, 0.14, 0.14), (0.0, -0.88, 2.18), 0.008, segments=2)
    add_beveled_box(bm_wood, (2.06, 0.14, 0.14), (0.0, 0.88, 2.18), 0.008, segments=2)
    add_beveled_box(bm_wood, (0.14, 2.06, 0.14), (-0.88, 0.0, 2.18), 0.008, segments=2)
    add_beveled_box(bm_wood, (0.14, 2.06, 0.14), (0.88, 0.0, 2.18), 0.008, segments=2)

    # Maru balustrade rails & vertical balusters (계자난간)
    add_beveled_box(bm_wood, (1.84, 0.055, 0.055), (0.0, 0.88, 0.84), 0.005, segments=2)
    add_beveled_box(bm_wood, (0.055, 1.84, 0.055), (-0.88, 0.0, 0.84), 0.005, segments=2)
    add_beveled_box(bm_wood, (0.055, 1.84, 0.055), (0.88, 0.0, 0.84), 0.005, segments=2)
    for step_t in (-0.56, -0.28, 0.0, 0.28, 0.56):
        add_beveled_box(bm_wood, (0.04, 0.04, 0.34), (step_t, 0.88, 0.66), 0.004, segments=1)
        add_beveled_box(bm_wood, (0.04, 0.04, 0.34), (-0.88, step_t, 0.66), 0.004, segments=1)
        add_beveled_box(bm_wood, (0.04, 0.04, 0.34), (0.88, step_t, 0.66), 0.004, segments=1)

    # Exposed 서까래 rafters radiating under front/side eaves
    for r_pos in (-0.64, -0.32, 0.0, 0.32, 0.64):
        add_tube_segment(bm_wood, (r_pos, -0.84, 2.36), (r_pos, -1.28, 2.32), 0.032, 0.028, segments=8)
        add_tube_segment(bm_wood, (r_pos, 0.84, 2.36), (r_pos, 1.28, 2.32), 0.032, 0.028, segments=8)
        add_tube_segment(bm_wood, (-0.84, r_pos, 2.36), (-1.28, r_pos, 2.32), 0.032, 0.028, segments=8)
        add_tube_segment(bm_wood, (0.84, r_pos, 2.36), (1.28, r_pos, 2.32), 0.032, 0.028, segments=8)

    add_beveled_box(bm_wood, (0.22, 0.22, 0.30), (-0.88, -0.88, 1.90), 0.008, segments=2)
    create_mesh_object(scene, "HanokZelkovaStructure", bm_wood, mat_zelkova, smooth=True, weighted_normals=True)

    bm_roof = bmesh.new()
    roof_v = add_lathe_solid(
        bm_roof,
        [(1.76, 2.38), (1.38, 2.58), (0.82, 2.86), (0.24, 3.16), (0.04, 3.28)],
        segments=4,
        rot_euler=(0.0, 0.0, math.pi * 0.25),
    )
    for v in roof_v:
        r_xy = math.hypot(v.co.x, v.co.y)
        if r_xy > 0.9:
            corner_factor = (abs(v.co.x) * abs(v.co.y)) / max(0.1, r_xy * r_xy)
            v.co.z += 0.17 * corner_factor * ((r_xy - 0.9) / 0.85)
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            pts = [
                (sx * 0.08, sy * 0.08, 3.24),
                (sx * 0.58, sy * 0.58, 2.88),
                (sx * 1.08, sy * 1.08, 2.58),
                (sx * 1.30, sy * 1.30, 2.54),
            ]
            add_swept_tapered_curve(bm_roof, pts, [0.048, 0.044, 0.040, 0.026], ring_segments=8, flatten_xy=(1.2, 0.9))

    create_mesh_object(scene, "HanokGiwaRoof", bm_roof, mat_giwa, smooth=False, weighted_normals=True)

    bm_light = bmesh.new()
    add_lathe_solid(bm_light, [(0.095, 0.72), (0.095, 0.98)], segments=8, center_xyz=(lx, ly, 0.0))
    add_beveled_box(bm_light, (0.18, 0.18, 0.24), (-0.88, -0.88, 1.90), 0.005, segments=1)
    create_mesh_object(scene, "HanokLanternGlow", bm_light, mat_hanji, smooth=False)


ASSET_SPECS: list[tuple[str, str, str, str, str, Callable[[bpy.types.Scene], None]]] = [
    (
        "webtoon-aristocrat-tiara-bust-v16",
        "로판 황녀 티아라·웨이브 헤어 조형 흉상 (V16)",
        "Aristocrat Tiara & Wave Hair Sculpt Bust V16",
        "프리즘 다이아 티아라·S웨이브 능선 헤어·벨벳 드레스 흉상",
        "Dispersion diamond tiara, S-wave hair & velvet bodice bust",
        build_aristocrat_tiara_bust,
    ),
    (
        "webtoon-crystal-prism-sanctum-altar-v16",
        "크리스탈 프리즘 각성 성검 제단 (V16)",
        "Crystal Prism Awakening Sword Sanctum V16",
        "분산 프리즘 크리스탈·부유 룬 성검·4주 석조 제단",
        "Dispersion crystal spires, levitating runic sword & colonnade",
        build_crystal_prism_sanctum,
    ),
    (
        "webtoon-grand-spiral-library-rotunda-v16",
        "대마탑 복층 아치 서가·천구 로툰다 (V16)",
        "Grand Spiral Library Rotunda Bay V16",
        "곡면 2층 월넛 서가·장서 군락·황동 난간·독서대 회랑",
        "Two-tier curved walnut library, grimoires & brass gallery",
        build_grand_spiral_library_rotunda,
    ),
    (
        "webtoon-parisian-patisserie-display-cart-v16",
        "파리지앵 파티세리 유리 쇼케이스·티카트 (V16)",
        "Parisian Patisserie Display & Tea Cart V16",
        "황동 스포크 휠·유리 쇼케이스·3단 마카롱 티스탠드·어닝 카트",
        "Brass spoked tea cart, glass vitrine & 3-tier pastry stand",
        build_parisian_patisserie_cart,
    ),
    (
        "webtoon-celestial-chrono-orrery-clock-v16",
        "천문 크로노미터 태양계 오러리 시계탑 코어 (V16)",
        "Celestial Chrono Orrery Clockwork Core V16",
        "5단 맞물림 인볼류트 기어·3중 짐벌 천구 링·태양계 오러리",
        "5-gear involute clockwork, gimbaled rings & solar orrery",
        build_celestial_chrono_orrery,
    ),
    (
        "webtoon-moonlight-hanok-lotus-lantern-pavilion-v16",
        "달빛 한옥 연꽃 석등·배흘림 누각 정자 (V16)",
        "Moonlight Hanok Lotus Lantern Pavilion V16",
        "화강암 기단·배흘림 목주·처마 기와지붕·연꽃 석등 정자",
        "Granite terrace, entasis pillars, curved giwa roof & lantern",
        build_moonlight_hanok_pavilion,
    ),
]


def render_v16_thumbnail(scene: bpy.types.Scene, mesh_objs: list[bpy.types.Object], out_png: Path) -> None:
    center, radius = compute_scene_bounds(mesh_objs)
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene.eevee, "use_raytracing"):
        scene.eevee.use_raytracing = True
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("ThumbWorldV16")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.11, 0.13, 0.19), 1.0)
        bg.inputs[1].default_value = 0.95
    scene.world = world

    cam_data = bpy.data.cameras.new("ThumbCamV16")
    cam_data.lens = 58.0
    cam_obj = bpy.data.objects.new("ThumbCamV16", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.38
    cam_obj.location = center + Vector((dist * 0.54, -dist * 0.98, dist * 0.34))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("V16Key", 560.0, (1.0, 0.96, 0.90), (radius * 2.1, -radius * 2.0, radius * 2.4)),
        ("V16Fill", 260.0, (0.74, 0.86, 1.0), (-radius * 2.3, -radius * 1.4, radius * 1.3)),
        ("V16Rim", 390.0, (0.98, 0.80, 0.54), (-radius * 0.4, radius * 2.3, radius * 2.1)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy * max(0.45, (radius / 1.05) ** 2)
        ldata.color = color
        ldata.size = radius * 1.65
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


def clear_scene_objects(scene: bpy.types.Scene) -> None:
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
        for block in list(col):
            if block.users == 0:
                col.remove(block)
    clear_material_cache()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export_all_v16_assets() -> list[dict[str, object]]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith("V16_"):
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("LumiereV16_Export") or bpy.data.scenes.new("LumiereV16_Export")
    export_scene.unit_settings.system = "METRIC"
    export_scene.unit_settings.scale_length = 1.0
    prev_scene = bpy.context.window.scene if bpy.context.window is not None else None
    if bpy.context.window is not None:
        bpy.context.window.scene = export_scene

    manifest: list[dict[str, object]] = []
    blender_ver = bpy.app.version_string
    for slug, label_ko, label_en, desc_ko, desc_en, builder in ASSET_SPECS:
        clear_scene_objects(export_scene)
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
        render_v16_thumbnail(export_scene, mesh_objs, thumb_path)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["asset_generator"] = "scripts/blender/generate_lumiere_atelier_v16.py"
        root["asset_license"] = "CC0-1.0"
        root["blender_version"] = blender_ver
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

    clear_scene_objects(export_scene)
    if prev_scene is not None and bpy.context.window is not None:
        bpy.context.window.scene = prev_scene
    bpy.data.scenes.remove(export_scene)

    prov = {
        "schema": "toonstudio.blender-lumiere-atelier-assets.v16",
        "createdAt": "2026-11-17",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {blender_ver} (scripts/blender/generate_lumiere_atelier_v16.py · OpenPBR Dispersion & manifold 0-defect verified)",
        "tool": f"Blender {blender_ver}",
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
    (OUTPUT_DIR / "provenance.json").write_text(
        json.dumps(prov, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    license_rows = "\n".join(
        f"- `{m['file']}` — {m['labelKo']} ({m['triangles']} tris, SHA-256 `{m['sha256']}`)"
        for m in sorted(manifest, key=lambda r: str(r["file"]))
    )
    (OUTPUT_DIR / "LICENSES.md").write_text(
        "# ToonStudio Blender 5.3 Lumière Atelier Kit V16 — 라이선스 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_lumiere_atelier_v16.py`, Blender {blender_ver})\n"
        "- 검증: 비매니폴드 모서리 0 · 열린 경계 0 · 고립 정점 0 · 0면적 면 0 · OpenPBR Dispersion 물리 재질 적용\n\n"
        "## 포함 파일 목록\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return manifest


def populate_lumiere_live_gallery() -> dict[str, object]:
    """라이브 Blender 5.3.0 `Scene`에 6대 뤼미에르 플래그십 걸작, 스튜디오 3점 조명, 카메라 구도를 구성한다."""
    live_scene = bpy.data.scenes.get("Scene") or bpy.context.scene
    if bpy.context.window is not None:
        bpy.context.window.scene = live_scene

    if hasattr(live_scene.eevee, "use_raytracing"):
        live_scene.eevee.use_raytracing = True

    for obj in list(live_scene.objects):
        if obj.type in ("MESH", "EMPTY", "LIGHT"):
            bpy.data.objects.remove(obj, do_unlink=True)

    mat_stage = make_lumiere_mat(
        "V16_GalleryObsidianStage", (0.14, 0.16, 0.22), roughness=0.38, coat_weight=0.45
    )
    mat_inlay = make_lumiere_mat(
        "V16_GalleryGoldInlay", (0.89, 0.72, 0.35), roughness=0.18, metallic=1.0
    )

    bm_stage = bmesh.new()
    add_lathe_solid(
        bm_stage,
        [(5.6, -0.14), (5.6, 0.0), (5.2, 0.018), (2.4, 0.022), (1.35, 0.14)],
        segments=72,
    )
    create_mesh_object(live_scene, "Lumiere_Gallery_Stage", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_inlay = bmesh.new()
    add_closed_torus_ring(bm_inlay, 5.05, 0.020, major_segs=72, minor_segs=10, center_xyz=(0.0, 0.0, 0.020))
    add_closed_torus_ring(bm_inlay, 2.38, 0.016, major_segs=64, minor_segs=10, center_xyz=(0.0, 0.0, 0.024))
    add_closed_torus_ring(bm_inlay, 1.34, 0.015, major_segs=48, minor_segs=10, center_xyz=(0.0, 0.0, 0.142))
    create_mesh_object(live_scene, "Lumiere_Stage_Gold_Rings", bm_inlay, mat_inlay, smooth=True, weighted_normals=True)

    placements = [
        ("Lumiere_Aristocrat_Tiara_Bust", build_aristocrat_tiara_bust, (0.0, -1.25, 0.142), 0.06, 1.65),
        ("Lumiere_Celestial_Chrono_Orrery", build_celestial_chrono_orrery, (1.52, -1.22, 0.024), -0.36, 1.32),
        ("Lumiere_Parisian_Patisserie_Cart", build_parisian_patisserie_cart, (-1.68, -1.08, 0.024), 0.40, 0.98),
        ("Lumiere_Crystal_Prism_Sanctum", build_crystal_prism_sanctum, (0.0, 1.48, 0.024), 0.0, 0.96),
        ("Lumiere_Grand_Spiral_Library", build_grand_spiral_library_rotunda, (-2.82, 1.24, 0.024), 0.50, 0.84),
        ("Lumiere_Moonlight_Hanok_Pavilion", build_moonlight_hanok_pavilion, (2.82, 1.24, 0.024), -0.50, 0.80),
    ]

    group_names: list[str] = ["Lumiere_Gallery_Stage", "Lumiere_Stage_Gold_Rings"]
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
        group_names.append(group_name)

    # Studio 3-point + warm rim gallery lighting
    target_center = Vector((0.0, 0.15, 1.25))
    for lname, energy, color, lpos, lsize in (
        ("Key_Light", 2400.0, (1.0, 0.96, 0.90), (5.2, -6.2, 6.8), 4.5),
        ("Fill_Light", 1100.0, (0.72, 0.86, 1.0), (-5.8, -4.6, 4.2), 5.0),
        ("Rim_Light", 1800.0, (1.0, 0.82, 0.56), (0.4, 6.5, 5.4), 4.8),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.color = color
        ldata.size = lsize
        lobj = bpy.data.objects.new(lname, ldata)
        live_scene.collection.objects.link(lobj)
        lobj.location = Vector(lpos)
        lobj.rotation_euler = (target_center - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()
        group_names.append(lname)

    if live_scene.world is None:
        live_scene.world = bpy.data.worlds.new("LumiereLiveWorld")
    live_scene.world.use_nodes = True
    bg = live_scene.world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.10, 0.12, 0.18), 1.0)
        bg.inputs[1].default_value = 0.95

    cam = live_scene.camera
    if cam is None:
        cdata = bpy.data.cameras.new("Camera")
        cam = bpy.data.objects.new("Camera", cdata)
        live_scene.collection.objects.link(cam)
        live_scene.camera = cam
    cam.data.lens = 42.0
    cam.location = Vector((0.45, -7.25, 3.65))
    look_at = Vector((0.0, 0.15, 1.20))
    cam.rotation_euler = (look_at - cam.location).normalized().to_track_quat("-Z", "Y").to_euler()
    group_names.append(cam.name)

    if bpy.context.window is not None and bpy.context.screen is not None:
        for area in bpy.context.screen.areas:
            if area.type == "VIEW_3D":
                for space in area.spaces:
                    if space.type == "VIEW_3D":
                        space.shading.type = "RENDERED"
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
    return {
        "blenderVersion": bpy.app.version_string,
        "liveMeshObjects": mesh_count,
        "liveTriangles": tri_count,
        "groups": group_names,
    }


def run_all() -> dict[str, object]:
    exported = export_all_v16_assets()
    live_stats = populate_lumiere_live_gallery()
    return {"exported": exported, "liveScene": live_stats}


if __name__ == "__main__":
    print(json.dumps(run_all(), indent=2, ensure_ascii=False))
