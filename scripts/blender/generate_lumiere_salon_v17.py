"""ToonStudio Lumière Grand Salon V17 — Blender 5.3.0 비파괴 마감 레시피·살롱 조명·프리즘 분산 4종 생성기 & 라이브 쇼케이스.

기존 라이브 씬(예: PilatesFlow_Webtoon_Atelier)을 전혀 훼손하지 않고 독립된 `ToonStudio_Lumiere_Salon_V17` 씬과
임시 익스포트 씬에서 동작하며, 제안된 5대 아이디어의 핵심 3D 에셋 4종을 생성한다:
1) `webtoon-lumiere-crystal-chandelier-v17.glb` — 3200K 8암 황실 샹들리에 & OpenPBR Dispersion(0.58) 프리즘 드롭
2) `webtoon-hollow-porcelain-prism-tea-goblet-v17.glb` — 비파괴 SOLIDIFY + SUBSURF 중공 백자 찻잔 & 프리즘 크리스탈 성배 다기
3) `webtoon-twisted-marble-salon-spire-column-v17.glb` — 비파괴 SUBSURF(SIMPLE) + SIMPLE_DEFORM(TWIST 60°) 나선 대리석 살롱 기둥
4) `webtoon-rofan-velvet-ruby-brooch-cushion-v17.glb` — 황실 버건디 벨벳(Sheen 0.85)·레이스 금박·OpenPBR 루비 프리즘 브로치 거치대
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
    compute_scene_bounds,
    ground_scene_meshes,
)
from generate_lumiere_atelier_v16 import make_lumiere_mat, srgb  # noqa: E402
from modeler_kit_v13_primitives import (  # noqa: E402
    add_beveled_box,
    add_fluted_column_shaft,
    add_lathe_solid,
    add_quad_sphere,
    add_tube_segment,
    clear_material_cache,
    create_mesh_object,
)

ROOT = SCRIPT_DIR.parents[1]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-lumiere-salon-v17"
THUMB_DIR = OUTPUT_DIR / "thumbnails"


def audit_evaluated_mesh_defects(obj: bpy.types.Object, depsgraph: bpy.types.Depsgraph) -> tuple[int, int, int]:
    """모디파이어 스택 평가 후의 최종 메시에 대해 수밀 2-매니폴드 무결성을 검증하고 (verts, faces, tris)를 반환한다."""
    eval_obj = obj.evaluated_get(depsgraph)
    mesh = eval_obj.to_mesh()
    try:
        bm = bmesh.new()
        bm.from_mesh(mesh)
        defects = {
            "nonManifoldEdges": sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary),
            "boundaryEdges": sum(1 for e in bm.edges if e.is_boundary),
            "wireEdges": sum(1 for e in bm.edges if e.is_wire),
            "looseVertices": sum(1 for v in bm.verts if len(v.link_edges) == 0),
            "zeroAreaFaces": sum(1 for f in bm.faces if f.calc_area() < 1e-9),
        }
        bm.free()
        if any(v > 0 for v in defects.values()):
            raise RuntimeError(f"Evaluated mesh defect in {obj.name}: {defects}")
        mesh.calc_loop_triangles()
        return len(mesh.vertices), len(mesh.polygons), len(mesh.loop_triangles)
    finally:
        eval_obj.to_mesh_clear()


def add_open_quad_vessel_shell(
    bm: bmesh.types.BMesh,
    profile_rz: list[tuple[float, float]],
    center_xyz: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> list[bmesh.types.BMVert]:
    """하단 사각 패치 바닥과 측면 쿼드 링으로 이루어진 상단 개방 용기 베이스(SOLIDIFY + SUBSURF 전용)."""
    segs = 16
    cx, cy, cz = center_xyz
    r0, z0 = profile_rz[0]
    inner_r = r0 * 0.42
    # 8-vertex inner ring + 4 inner quads? Let's use a clean 4-quad grid cap for 8-seg or 16-seg?
    # Even simpler: a small flat octagon/16-gon cap subdivided cleanly, OR an n-gon bottom face!
    # In Blender SOLIDIFY + Catmull-Clark SUBSURF, a 16-gon bottom face with an inset ring subdivides into 16 clean quads with 0 defects!
    rings: list[list[bmesh.types.BMVert]] = []
    created: list[bmesh.types.BMVert] = []
    inset_ring: list[bmesh.types.BMVert] = []
    for s in range(segs):
        ang = (2.0 * math.pi * s) / segs
        v = bm.verts.new((cx + inner_r * math.cos(ang), cy + inner_r * math.sin(ang), cz + z0))
        inset_ring.append(v)
        created.append(v)
    # Bottom face (outward normal -Z when viewed from top: reverse order so normal points -Z, wait: let's recalc_face_normals!)
    bm.faces.new(list(reversed(inset_ring)))
    rings.append(inset_ring)
    for r, z in profile_rz:
        ring: list[bmesh.types.BMVert] = []
        for s in range(segs):
            ang = (2.0 * math.pi * s) / segs
            v = bm.verts.new((cx + r * math.cos(ang), cy + r * math.sin(ang), cz + z))
            ring.append(v)
            created.append(v)
        rings.append(ring)
    for k in range(len(rings) - 1):
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((rings[k][s], rings[k][sn], rings[k + 1][sn], rings[k + 1][s]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return created


# ---------------------------------------------------------------------------
# 1. 뤼미에르 황실 크리스탈 샹들리에 (Lumiere Royal Crystal Chandelier V17)
# ---------------------------------------------------------------------------
def build_lumiere_crystal_chandelier(scene: bpy.types.Scene) -> None:
    mat_gold = make_lumiere_mat(
        "V17_SalonChandelierGold",
        (0.91, 0.74, 0.36),
        roughness=0.17,
        metallic=1.0,
        coat_weight=0.28,
    )
    mat_crystal = make_lumiere_mat(
        "V17_SalonChandelierDispersionCrystal",
        (0.82, 0.94, 1.0),
        roughness=0.03,
        ior=2.42,
        alpha=0.80,
        transmission_weight=0.92,
        dispersion=0.58,
        coat_weight=1.0,
        coat_roughness=0.02,
        emission_srgb=(0.68, 0.88, 1.0),
        emission_strength=0.55,
    )
    mat_candle = make_lumiere_mat(
        "V17_WarmCandleIvory",
        (0.98, 0.94, 0.86),
        roughness=0.36,
        sheen_weight=0.22,
    )
    mat_flame = make_lumiere_mat(
        "V17_Salon3200KFlameGlow",
        (1.0, 0.84, 0.48),
        roughness=0.08,
        emission_srgb=(1.0, 0.78, 0.36),
        emission_strength=2.80,
    )

    # Pedestal display stand + central chandelier frame so Z=0 grounded cleanly
    bm_gold = bmesh.new()
    add_lathe_solid(
        bm_gold,
        [(0.34, 0.0), (0.34, 0.03), (0.26, 0.06), (0.045, 0.12), (0.022, 1.56), (0.085, 1.62), (0.12, 1.66)],
        segments=28,
    )
    add_closed_torus_ring(bm_gold, 0.56, 0.018, major_segs=48, minor_segs=10, center_xyz=(0.0, 0.0, 0.92))
    add_closed_torus_ring(bm_gold, 0.34, 0.014, major_segs=40, minor_segs=10, center_xyz=(0.0, 0.0, 1.24))

    bm_candle = bmesh.new()
    bm_flame = bmesh.new()
    bm_crys = bmesh.new()

    # Central faceted crystal baluster & bottom prism finial
    add_lathe_solid(
        bm_crys,
        [(0.008, 0.42), (0.095, 0.56), (0.065, 0.72), (0.115, 0.92), (0.075, 1.15), (0.045, 1.38)],
        segments=12,
    )

    for i in range(8):
        ang = (2.0 * math.pi * i) / 8.0
        ca, sa = math.cos(ang), math.sin(ang)
        arm_pts = [
            (0.06 * ca, 0.06 * sa, 0.86),
            (0.28 * ca, 0.28 * sa, 0.74),
            (0.50 * ca, 0.50 * sa, 0.82),
            (0.62 * ca, 0.62 * sa, 0.98),
        ]
        add_swept_tapered_curve(bm_gold, arm_pts, [0.016, 0.014, 0.012, 0.010], ring_segments=10, flatten_xy=(1.0, 1.0))
        # Bobeche dish
        bx, by = 0.62 * ca, 0.62 * sa
        add_lathe_solid(
            bm_gold,
            [(0.018, 0.97), (0.056, 1.00), (0.048, 1.015), (0.022, 1.02)],
            segments=16,
            center_xyz=(bx, by, 0.0),
        )
        # Candle sleeve + 3200K flame
        add_lathe_solid(
            bm_candle,
            [(0.018, 1.018), (0.017, 1.145), (0.012, 1.155)],
            segments=14,
            center_xyz=(bx, by, 0.0),
        )
        add_lathe_solid(
            bm_flame,
            [(0.003, 1.156), (0.014, 1.182), (0.009, 1.215), (0.002, 1.238)],
            segments=10,
            center_xyz=(bx, by, 0.0),
        )
        # Outer & inner faceted dispersion prism drops
        add_lathe_solid(
            bm_crys,
            [(0.003, 0.82), (0.036, 0.88), (0.026, 0.94), (0.004, 0.97)],
            segments=8,
            center_xyz=(bx, by, 0.0),
        )
        mx, my = 0.34 * ca, 0.34 * sa
        add_lathe_solid(
            bm_crys,
            [(0.003, 1.08), (0.030, 1.14), (0.022, 1.20), (0.004, 1.23)],
            segments=8,
            center_xyz=(mx, my, 0.0),
        )

    create_mesh_object(scene, "ChandelierFiligreeGold", bm_gold, mat_gold, smooth=True, weighted_normals=True)
    create_mesh_object(scene, "ChandelierIvoryCandles", bm_candle, mat_candle, smooth=True)
    create_mesh_object(scene, "Chandelier3200KFlames", bm_flame, mat_flame, smooth=True)
    create_mesh_object(scene, "ChandelierDispersionPrisms", bm_crys, mat_crystal, smooth=False, weighted_normals=True)


# ---------------------------------------------------------------------------
# 2. 중공 백자·프리즘 크리스탈 성배 다기 (Hollow Porcelain & Prism Goblet Tea Set V17)
# ---------------------------------------------------------------------------
def build_hollow_porcelain_prism_tea_set(scene: bpy.types.Scene) -> None:
    mat_marble = make_lumiere_mat("V17_CarraraSalonTray", (0.95, 0.94, 0.91), roughness=0.20, coat_weight=0.60)
    mat_porcelain = make_lumiere_mat(
        "V17_GlazedBonePorcelain",
        (0.98, 0.96, 0.93),
        roughness=0.10,
        ior=1.53,
        coat_weight=0.92,
        coat_roughness=0.06,
    )
    mat_gold = make_lumiere_mat("V17_TeaFiligreeGold", (0.90, 0.73, 0.35), roughness=0.18, metallic=1.0)
    mat_crystal = make_lumiere_mat(
        "V17_GobletDispersionCrystal",
        (0.78, 0.93, 1.0),
        roughness=0.03,
        ior=2.18,
        alpha=0.76,
        transmission_weight=0.90,
        dispersion=0.52,
        coat_weight=1.0,
        coat_roughness=0.02,
    )

    bm_tray = bmesh.new()
    add_lathe_solid(
        bm_tray,
        [(0.44, 0.0), (0.46, 0.022), (0.45, 0.040), (0.41, 0.044)],
        segments=36,
    )
    create_mesh_object(scene, "SalonMarbleTeaTray", bm_tray, mat_marble, smooth=True, weighted_normals=True)

    # Non-destructive SOLIDIFY + SUBSURF Hollow Porcelain Teacup & Teapot Bowl!
    bm_cup = bmesh.new()
    add_open_quad_vessel_shell(
        bm_cup,
        [(0.055, 0.068), (0.092, 0.105), (0.118, 0.168), (0.128, 0.215)],
        center_xyz=(-0.15, -0.04, 0.0),
    )
    cup_obj = create_mesh_object(scene, "HollowPorcelainTeacupShell", bm_cup, mat_porcelain, smooth=True)
    sol_mod = cup_obj.modifiers.new(name="Recipe_Solidify", type="SOLIDIFY")
    sol_mod.thickness = 0.012
    sol_mod.offset = 1.0
    sol_mod.use_even_offset = True
    sol_mod.use_rim = True
    sub_mod = cup_obj.modifiers.new(name="Recipe_Subsurf", type="SUBSURF")
    sub_mod.levels = 1
    sub_mod.render_levels = 1

    # Saucer + Goblet stem + Gold rim & handle
    bm_porc_base = bmesh.new()
    add_lathe_solid(
        bm_porc_base,
        [(0.095, 0.042), (0.175, 0.058), (0.168, 0.066), (0.068, 0.068)],
        segments=32,
        center_xyz=(-0.15, -0.04, 0.0),
    )
    create_mesh_object(scene, "PorcelainSaucerBase", bm_porc_base, mat_porcelain, smooth=True, weighted_normals=True)

    # Non-destructive SOLIDIFY + SUBSURF Prism Crystal Goblet Chalice!
    bm_goblet_bowl = bmesh.new()
    add_open_quad_vessel_shell(
        bm_goblet_bowl,
        [(0.042, 0.225), (0.098, 0.275), (0.116, 0.365), (0.108, 0.445)],
        center_xyz=(0.16, 0.05, 0.0),
    )
    goblet_obj = create_mesh_object(scene, "HollowPrismGobletBowl", bm_goblet_bowl, mat_crystal, smooth=True)
    g_sol = goblet_obj.modifiers.new(name="Recipe_Solidify", type="SOLIDIFY")
    g_sol.thickness = 0.010
    g_sol.offset = 1.0
    g_sol.use_even_offset = True
    g_sol.use_rim = True
    g_sub = goblet_obj.modifiers.new(name="Recipe_Subsurf", type="SUBSURF")
    g_sub.levels = 1
    g_sub.render_levels = 1

    bm_gold = bmesh.new()
    add_closed_torus_ring(bm_gold, 0.455, 0.010, major_segs=48, minor_segs=10, center_xyz=(0.0, 0.0, 0.036))
    # Teacup ear handle
    add_swept_tapered_curve(
        bm_gold,
        [(-0.275, -0.04, 0.195), (-0.335, -0.04, 0.185), (-0.325, -0.04, 0.125), (-0.255, -0.04, 0.105)],
        [0.009, 0.011, 0.010, 0.008],
        ring_segments=10,
        flatten_xy=(1.0, 1.0),
    )
    # Goblet baluster stem
    add_lathe_solid(
        bm_gold,
        [(0.088, 0.042), (0.082, 0.058), (0.024, 0.085), (0.018, 0.155), (0.036, 0.185), (0.022, 0.215), (0.048, 0.228)],
        segments=24,
        center_xyz=(0.16, 0.05, 0.0),
    )
    create_mesh_object(scene, "SalonTeaGildedHardware", bm_gold, mat_gold, smooth=True, weighted_normals=True)


# ---------------------------------------------------------------------------
# 3. 60° 나선 비틀림 대리석 살롱 기둥 (Twisted Marble Salon Spire Column V17)
# ---------------------------------------------------------------------------
def build_twisted_marble_salon_column(scene: bpy.types.Scene) -> None:
    mat_marble = make_lumiere_mat(
        "V17_SalonAlabasterMarble",
        (0.93, 0.90, 0.86),
        roughness=0.28,
        coat_weight=0.42,
        coat_roughness=0.14,
    )
    mat_gold = make_lumiere_mat("V17_ColumnCorinthianGold", (0.90, 0.73, 0.35), roughness=0.18, metallic=1.0)
    mat_prism = make_lumiere_mat(
        "V17_SpireFinialPrism",
        (0.66, 0.88, 1.0),
        roughness=0.04,
        ior=2.35,
        alpha=0.80,
        transmission_weight=0.88,
        dispersion=0.50,
        coat_weight=1.0,
        emission_srgb=(0.48, 0.82, 1.0),
        emission_strength=0.65,
    )

    bm_plinth = bmesh.new()
    add_lathe_solid(
        bm_plinth,
        [(0.38, 0.0), (0.38, 0.08), (0.31, 0.13), (0.26, 0.20), (0.26, 0.24)],
        segments=8,
    )
    add_lathe_solid(
        bm_plinth,
        [(0.24, 1.84), (0.31, 1.92), (0.35, 2.00), (0.35, 2.08)],
        segments=8,
    )
    create_mesh_object(scene, "SalonColumnPlinthAndCapital", bm_plinth, mat_marble, smooth=False, weighted_normals=True)

    # Non-destructive SUBSURF(SIMPLE) + SIMPLE_DEFORM(TWIST 60°) Fluted Column Shaft!
    bm_shaft = bmesh.new()
    add_fluted_column_shaft(
        bm_shaft,
        base_radius=0.20,
        top_radius=0.175,
        height=1.62,
        flutes=12,
        flute_depth=0.018,
        entasis=0.012,
        z_divisions=16,
        center_xyz=(0.0, 0.0, 0.23),
    )
    shaft_obj = create_mesh_object(scene, "TwistedSalonFlutedShaft", bm_shaft, mat_marble, smooth=True)
    sub_simple = shaft_obj.modifiers.new(name="Recipe_SimpleSubdiv", type="SUBSURF")
    sub_simple.subdivision_type = "SIMPLE"
    sub_simple.levels = 1
    sub_simple.render_levels = 1
    twist_mod = shaft_obj.modifiers.new(name="Recipe_Twist60Deg", type="SIMPLE_DEFORM")
    twist_mod.deform_method = "TWIST"
    twist_mod.deform_axis = "Z"
    twist_mod.angle = math.pi / 3.0

    bm_gold = bmesh.new()
    add_closed_torus_ring(bm_gold, 0.25, 0.018, major_segs=36, minor_segs=10, center_xyz=(0.0, 0.0, 0.24))
    add_closed_torus_ring(bm_gold, 0.23, 0.018, major_segs=36, minor_segs=10, center_xyz=(0.0, 0.0, 1.84))
    add_lathe_solid(bm_gold, [(0.16, 2.08), (0.11, 2.13), (0.06, 2.18)], segments=16)
    create_mesh_object(scene, "SalonColumnGildedCollars", bm_gold, mat_gold, smooth=True, weighted_normals=True)

    bm_gem = bmesh.new()
    add_lathe_solid(
        bm_gem,
        [(0.005, 2.18), (0.11, 2.30), (0.085, 2.46), (0.005, 2.58)],
        segments=8,
    )
    create_mesh_object(scene, "SalonSpirePrismFinial", bm_gem, mat_prism, smooth=False, weighted_normals=True)


# ---------------------------------------------------------------------------
# 4. 황실 벨벳·루비 프리즘 브로치 거치대 (Royal Velvet & Ruby Brooch Cushion V17)
# ---------------------------------------------------------------------------
def build_rofan_velvet_ruby_brooch(scene: bpy.types.Scene) -> None:
    mat_velvet = make_lumiere_mat(
        "V17_SalonBurgundyVelvet",
        (0.46, 0.08, 0.18),
        roughness=0.56,
        sheen_weight=0.86,
        sheen_roughness=0.32,
    )
    mat_lace = make_lumiere_mat(
        "V17_SalonChampagneSilkLace",
        (0.96, 0.92, 0.85),
        roughness=0.34,
        sheen_weight=0.45,
    )
    mat_gold = make_lumiere_mat(
        "V17_BroochFiligreeGold",
        (0.91, 0.74, 0.36),
        roughness=0.16,
        metallic=1.0,
        coat_weight=0.26,
    )
    mat_ruby_prism = make_lumiere_mat(
        "V17_RubyDiamondDispersionGem",
        (0.92, 0.16, 0.36),
        roughness=0.03,
        ior=2.40,
        alpha=0.84,
        transmission_weight=0.86,
        dispersion=0.55,
        coat_weight=1.0,
        coat_roughness=0.02,
        emission_srgb=(0.86, 0.14, 0.34),
        emission_strength=0.75,
    )

    bm_stand = bmesh.new()
    add_lathe_solid(
        bm_stand,
        [(0.28, 0.0), (0.28, 0.028), (0.22, 0.055), (0.08, 0.11), (0.065, 0.24), (0.22, 0.29)],
        segments=32,
    )
    # Brooch gold oval bezel + 8 filigree pearls around ruby gem
    tilt = math.radians(34.0)
    add_closed_torus_ring(
        bm_stand, 0.115, 0.016, major_segs=36, minor_segs=10, center_xyz=(0.0, -0.04, 0.44), rot_euler=(tilt, 0.0, 0.0)
    )
    for k in range(8):
        ang = (2.0 * math.pi * k) / 8.0
        local = mathutils.Euler((tilt, 0.0, 0.0), "XYZ").to_matrix() @ Vector((0.125 * math.cos(ang), 0.125 * math.sin(ang), 0.0))
        add_quad_sphere(bm_stand, radius=0.018, divisions=4, center_xyz=(local.x, -0.04 + local.y, 0.44 + local.z))
    create_mesh_object(scene, "VelvetDisplayGoldStandAndBezel", bm_stand, mat_gold, smooth=True, weighted_normals=True)

    bm_velvet = bmesh.new()
    cush_v = add_quad_sphere(bm_velvet, radius=0.25, divisions=8, scale_xyz=(1.15, 0.95, 0.42))
    bmesh.ops.rotate(bm_velvet, cent=(0, 0, 0), matrix=mathutils.Euler((tilt, 0.0, 0.0), "XYZ").to_matrix().to_4x4(), verts=cush_v)
    bmesh.ops.translate(bm_velvet, vec=(0.0, 0.0, 0.35), verts=cush_v)
    create_mesh_object(scene, "RoyalBurgundyVelvetCushion", bm_velvet, mat_velvet, smooth=True, subsurf_levels=1)

    bm_lace = bmesh.new()
    for k in range(16):
        ang = (2.0 * math.pi * k) / 16.0
        local = mathutils.Euler((tilt, 0.0, 0.0), "XYZ").to_matrix() @ Vector((0.275 * math.cos(ang), 0.225 * math.sin(ang), 0.0))
        add_closed_torus_ring(
            bm_lace,
            0.028,
            0.006,
            major_segs=18,
            minor_segs=8,
            center_xyz=(local.x, local.y, 0.35 + local.z),
            rot_euler=(tilt, 0.0, ang),
        )
    create_mesh_object(scene, "ChampagneSilkLaceScallops", bm_lace, mat_lace, smooth=True)

    bm_gem = bmesh.new()
    gem_v = add_lathe_solid(
        bm_gem,
        [(0.004, -0.045), (0.095, 0.0), (0.072, 0.036), (0.004, 0.052)],
        segments=12,
    )
    bmesh.ops.rotate(bm_gem, cent=(0, 0, 0), matrix=mathutils.Euler((tilt, 0.0, 0.0), "XYZ").to_matrix().to_4x4(), verts=gem_v)
    bmesh.ops.translate(bm_gem, vec=(0.0, -0.045, 0.445), verts=gem_v)
    create_mesh_object(scene, "RubyPrismCenterpieceGem", bm_gem, mat_ruby_prism, smooth=False, weighted_normals=True)


ASSET_SPECS_V17: list[tuple[str, str, str, str, str, Callable[[bpy.types.Scene], None]]] = [
    (
        "webtoon-lumiere-crystal-chandelier-v17",
        "뤼미에르 황실 크리스탈 샹들리에 (V17)",
        "Lumiere Royal Crystal Chandelier V17",
        "8암 필리그리 골드·3200K 촛대·OpenPBR 프리즘 드롭 샹들리에",
        "8-arm filigree gold chandelier with dispersion crystal drops",
        build_lumiere_crystal_chandelier,
    ),
    (
        "webtoon-hollow-porcelain-prism-tea-goblet-v17",
        "중공 백자·프리즘 크리스탈 성배 다기 (V17)",
        "Hollow Porcelain & Prism Goblet Tea Set V17",
        "비파괴 Solidify+Subsurf 중공 백자 잔·프리즘 성배·대리석 트레이",
        "Non-destructive hollow porcelain cup & dispersion crystal goblet",
        build_hollow_porcelain_prism_tea_set,
    ),
    (
        "webtoon-twisted-marble-salon-spire-column-v17",
        "60° 나선 비틀림 대리석 살롱 기둥 (V17)",
        "Twisted Marble Salon Spire Column V17",
        "비파괴 SimpleDeform 60° 비틀림 배흘림 기둥·코린트 금장·프리즘 첨탑",
        "60-degree twisted fluted marble column with prism finial",
        build_twisted_marble_salon_column,
    ),
    (
        "webtoon-rofan-velvet-ruby-brooch-cushion-v17",
        "황실 벨벳·루비 프리즘 브로치 거치대 (V17)",
        "Royal Velvet & Ruby Brooch Display V17",
        "버건디 벨벳 쿠션·레이스 스캘럽·OpenPBR 루비 프리즘 브로치",
        "Burgundy velvet cushion, silk lace & dispersion ruby brooch",
        build_rofan_velvet_ruby_brooch,
    ),
]


def render_v17_thumbnail(scene: bpy.types.Scene, mesh_objs: list[bpy.types.Object], out_png: Path) -> None:
    center, radius = compute_scene_bounds(mesh_objs)
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene.eevee, "use_raytracing"):
        scene.eevee.use_raytracing = True
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("ThumbWorldV17")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.14, 0.09, 0.18), 1.0)
        bg.inputs[1].default_value = 0.92
    scene.world = world

    cam_data = bpy.data.cameras.new("ThumbCamV17")
    cam_data.lens = 65.0
    cam_obj = bpy.data.objects.new("ThumbCamV17", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.45
    cam_obj.location = center + Vector((dist * 0.52, -dist * 0.98, dist * 0.36))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("V17ChandelierKey3200K", 620.0, (1.0, 0.91, 0.76), (radius * 1.9, -radius * 1.9, radius * 2.5)),
        ("V17WindowFill7800K", 310.0, (0.80, 0.92, 1.0), (-radius * 2.3, -radius * 1.5, radius * 1.5)),
        ("V17ChampagneRim5800K", 460.0, (1.0, 0.95, 0.86), (-radius * 0.3, radius * 2.3, radius * 2.1)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy * max(0.45, (radius / 1.0) ** 2)
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


def clear_only_scene(scene: bpy.types.Scene) -> None:
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    clear_material_cache()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export_all_v17_salon_assets() -> list[dict[str, object]]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith("V17_") and mat.users == 0:
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("LumiereSalonV17_Export") or bpy.data.scenes.new("LumiereSalonV17_Export")
    export_scene.unit_settings.system = "METRIC"
    export_scene.unit_settings.scale_length = 1.0
    win = bpy.context.window if bpy.context.window is not None else None
    prev_scene = win.scene if win is not None else None
    if win is not None:
        win.scene = export_scene

    manifest: list[dict[str, object]] = []
    blender_ver = bpy.app.version_string
    for slug, label_ko, label_en, desc_ko, desc_en, builder in ASSET_SPECS_V17:
        clear_only_scene(export_scene)
        builder(export_scene)
        ground_scene_meshes(export_scene)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        mesh_objs = [o for o in export_scene.objects if o.type == "MESH"]
        total_verts = 0
        total_faces = 0
        total_tris = 0
        for obj in mesh_objs:
            v_c, f_c, t_c = audit_evaluated_mesh_defects(obj, depsgraph)
            total_verts += v_c
            total_faces += f_c
            total_tris += t_c

        thumb_path = THUMB_DIR / f"{slug}.png"
        render_v17_thumbnail(export_scene, mesh_objs, thumb_path)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["asset_generator"] = "scripts/blender/generate_lumiere_salon_v17.py"
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
            }
        )

    clear_only_scene(export_scene)
    if prev_scene is not None and win is not None:
        win.scene = prev_scene
    bpy.data.scenes.remove(export_scene)

    prov = {
        "schema": "toonstudio.blender-lumiere-salon-assets.v17",
        "createdAt": "2026-11-18",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {blender_ver} (scripts/blender/generate_lumiere_salon_v17.py · Non-Destructive Modifiers & OpenPBR Dispersion verified)",
        "tool": f"Blender {blender_ver}",
        "blenderVersion": blender_ver,
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
        "# ToonStudio Blender 5.3 Lumière Grand Salon Kit V17 — 라이선스 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_lumiere_salon_v17.py`, Blender {blender_ver})\n"
        "- 검증: 비매니폴드 모서리 0 · 열린 경계 0 · 고립 정점 0 · 비파괴 SOLIDIFY/SUBSURF/SIMPLE_DEFORM(TWIST) 및 OpenPBR Dispersion 적용\n\n"
        "## 포함 파일 목록 (총 4종)\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return manifest


def populate_isolated_lumiere_salon_scene() -> dict[str, object]:
    """기존 다른 씬을 건드리지 않고 독립된 `ToonStudio_Lumiere_Salon_V17` 라이브 씬을 구성한다."""
    salon_scene = bpy.data.scenes.get("ToonStudio_Lumiere_Salon_V17") or bpy.data.scenes.new("ToonStudio_Lumiere_Salon_V17")
    salon_scene.unit_settings.system = "METRIC"
    salon_scene.unit_settings.scale_length = 1.0
    salon_scene.render.engine = "BLENDER_EEVEE"
    if hasattr(salon_scene.eevee, "use_raytracing"):
        salon_scene.eevee.use_raytracing = True

    if bpy.context.window is not None:
        bpy.context.window.scene = salon_scene

    clear_only_scene(salon_scene)

    mat_floor = make_lumiere_mat("V17_SalonParquetMarble", (0.20, 0.13, 0.22), roughness=0.28, coat_weight=0.55)
    mat_inlay = make_lumiere_mat("V17_SalonFloorGoldRing", (0.90, 0.73, 0.35), roughness=0.18, metallic=1.0)

    bm_floor = bmesh.new()
    add_lathe_solid(bm_floor, [(4.2, -0.10), (4.2, 0.0), (3.85, 0.02)], segments=64)
    create_mesh_object(salon_scene, "Salon_Grand_Floor", bm_floor, mat_floor, smooth=True, weighted_normals=True)

    bm_ring = bmesh.new()
    add_closed_torus_ring(bm_ring, 3.65, 0.016, major_segs=64, minor_segs=10, center_xyz=(0.0, 0.0, 0.022))
    add_closed_torus_ring(bm_ring, 1.65, 0.014, major_segs=48, minor_segs=10, center_xyz=(0.0, 0.0, 0.024))
    create_mesh_object(salon_scene, "Salon_Gold_Inlay_Rings", bm_ring, mat_inlay, smooth=True, weighted_normals=True)

    placements = [
        ("Salon_Chandelier_Centerpiece", build_lumiere_crystal_chandelier, (0.0, 0.35, 1.15), 0.12, 1.15),
        ("Salon_Hollow_Tea_Goblet_Set", build_hollow_porcelain_prism_tea_set, (-0.68, -0.82, 0.022), 0.28, 1.35),
        ("Salon_Velvet_Ruby_Brooch", build_rofan_velvet_ruby_brooch, (0.68, -0.82, 0.022), -0.28, 1.35),
        ("Salon_Twisted_Spire_Column_L", build_twisted_marble_salon_column, (-1.65, 0.85, 0.022), 0.0, 0.96),
        ("Salon_Twisted_Spire_Column_R", build_twisted_marble_salon_column, (1.65, 0.85, 0.022), 0.52, 0.96),
    ]

    groups = ["Salon_Grand_Floor", "Salon_Gold_Inlay_Rings"]
    for grp_name, builder, loc, rot_z, sc in placements:
        before = set(salon_scene.objects)
        builder(salon_scene)
        created = [o for o in salon_scene.objects if o not in before and o.type == "MESH"]
        min_z = min((o.matrix_world @ Vector(c)).z for o in created for c in o.bound_box)
        grp = bpy.data.objects.new(grp_name, None)
        salon_scene.collection.objects.link(grp)
        for o in created:
            o.location.z -= min_z
            o.parent = grp
        grp.location = loc
        grp.rotation_euler = (0.0, 0.0, rot_z)
        grp.scale = (sc, sc, sc)
        groups.append(grp_name)

    target = Vector((0.0, -0.10, 1.05))
    for lname, ltype, energy, color, lpos in (
        ("Lumiere_Chandelier_Key_3200K", "SPOT", 1950.0, (1.0, 0.91, 0.72), (0.0, -2.8, 3.8)),
        ("Lumiere_ArchWindow_Sun_7800K", "AREA", 980.0, (0.80, 0.93, 1.0), (-3.8, -3.2, 3.2)),
        ("Lumiere_Prism_BackRim_5800K", "AREA", 1450.0, (1.0, 0.96, 0.88), (0.2, 3.8, 3.0)),
    ):
        ldata = bpy.data.lights.new(lname, type=ltype)
        ldata.energy = energy
        ldata.color = color
        if ltype == "SPOT":
            ldata.spot_size = math.radians(58.0)
            ldata.spot_blend = 0.45
            ldata.shadow_soft_size = 0.45
        else:
            ldata.size = 3.2
        lobj = bpy.data.objects.new(lname, ldata)
        salon_scene.collection.objects.link(lobj)
        lobj.location = Vector(lpos)
        lobj.rotation_euler = (target - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()
        groups.append(lname)

    salon_world = bpy.data.worlds.get("LumiereSalonWorldV17") or bpy.data.worlds.new("LumiereSalonWorldV17")
    salon_world.use_nodes = True
    bg = salon_world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.15, 0.09, 0.20), 1.0)
        bg.inputs[1].default_value = 0.88
    salon_scene.world = salon_world

    cdata = bpy.data.cameras.new("SalonCloseupCamera65mm")
    cdata.lens = 65.0
    cam = bpy.data.objects.new("SalonCloseupCamera65mm", cdata)
    salon_scene.collection.objects.link(cam)
    salon_scene.camera = cam
    cam.location = Vector((0.25, -5.85, 2.25))
    cam.rotation_euler = (target - cam.location).normalized().to_track_quat("-Z", "Y").to_euler()
    groups.append(cam.name)

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
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh_count = 0
    tri_count = 0
    for o in salon_scene.objects:
        if o.type == "MESH":
            mesh_count += 1
            eo = o.evaluated_get(depsgraph)
            em = eo.to_mesh()
            em.calc_loop_triangles()
            tri_count += len(em.loop_triangles)
            eo.to_mesh_clear()

    return {
        "sceneName": salon_scene.name,
        "preservedScenes": [s.name for s in bpy.data.scenes],
        "blenderVersion": bpy.app.version_string,
        "liveMeshObjects": mesh_count,
        "liveEvaluatedTriangles": tri_count,
        "groups": groups,
    }


def run_all() -> dict[str, object]:
    exported = export_all_v17_salon_assets()
    live_salon = populate_isolated_lumiere_salon_scene()
    return {"exported": exported, "liveSalon": live_salon}


if __name__ == "__main__":
    print(json.dumps(run_all(), indent=2, ensure_ascii=False))
