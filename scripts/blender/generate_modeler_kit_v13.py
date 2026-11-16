"""ToonStudio Modeler Kit V13 — 8종 플래그십 웹툰 모델러·공간 모델러 고품질 CC0-1.0 에셋 생성기.

실행 예시 (독립 백그라운드 Blender 5.2 LTS):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/generate_modeler_kit_v13.py

모든 결과물은 미터 단위, 바닥 Z=0(glTF Y=0) 정렬, 매니폴드 지오메트리(비매니폴드·고립 정점·0면적 면 0개),
다단 베벨·가중 법선·회전체·섭디비전 마감, 스마트 UV 전개, Principled BSDF 재질 배치 병합을 거쳐 자체 포함 GLB로 내보낸다.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import mathutils
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from modeler_kit_v13_extra_assets import (  # noqa: E402
    build_creator_ergonomic_chair_desk,
    build_fantasy_potion_apothecary_cabinet,
    build_hanok_paljak_pavilion_bay,
    build_ornate_clocktower_gear_core,
)
from modeler_kit_v13_primitives import (  # noqa: E402
    add_beveled_box,
    add_fluted_column_shaft,
    add_lathe_solid,
    add_quad_sphere,
    add_tube_segment,
    clear_material_cache,
    create_mesh_object,
    make_mat,
)

ROOT = SCRIPT_DIR.parents[1]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-modeler-kit-v13"
THUMB_DIR = OUTPUT_DIR / "thumbnails"


def get_or_create_export_scene() -> bpy.types.Scene:
    scene = bpy.data.scenes.get("ModelerKitV13_Export_Scene")
    if scene is None:
        scene = bpy.data.scenes.new("ModelerKitV13_Export_Scene")
        scene.unit_settings.system = "METRIC"
        scene.unit_settings.scale_length = 1.0
    if bpy.context.window is not None:
        bpy.context.window.scene = scene
    return scene


def clear_scene(scene: bpy.types.Scene) -> None:
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)
    clear_material_cache()


def audit_mesh_defects(obj: bpy.types.Object) -> dict[str, int]:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary)
    wire_edges = sum(1 for e in bm.edges if e.is_wire)
    loose_verts = sum(1 for v in bm.verts if len(v.link_edges) == 0)
    zero_faces = sum(1 for f in bm.faces if f.calc_area() < 1e-9)
    bm.free()
    defects = {
        "nonManifoldEdges": non_manifold,
        "wireEdges": wire_edges,
        "looseVertices": loose_verts,
        "zeroAreaFaces": zero_faces,
    }
    if any(v > 0 for v in defects.values()):
        raise RuntimeError(f"Mesh quality defect in {obj.name}: {defects}")
    return defects


def build_sculpt_head_basemesh(scene: bpy.types.Scene) -> None:
    mat_clay = make_mat("SculptPorcelainClay", (0.87, 0.81, 0.78), roughness=0.38, metallic=0.0)
    mat_accent = make_mat("SculptGuideCollar", (0.31, 0.37, 0.54), roughness=0.42, metallic=0.18)
    mat_plinth = make_mat("AtelierSlatePlinth", (0.15, 0.17, 0.23), roughness=0.32, metallic=0.36)
    mat_brass = make_mat("AtelierNameplateBrass", (0.80, 0.63, 0.30), roughness=0.26, metallic=0.90)

    # Quad-sphere cranial cage with Subsurf Lv.1 + anatomical brow, eye sockets, nose, lips, ears & clavicle bust
    bm_head = bmesh.new()
    head_verts = add_quad_sphere(bm_head, radius=0.215, divisions=9)
    for v in head_verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        if z < 0.0:
            t = min(1.0, -z / 0.215)
            v.co.x *= 1.0 - 0.37 * t
            if y < 0.0:
                chin = math.exp(-((x / 0.095) ** 2)) * 0.048 * t
                v.co.y -= chin
                v.co.z -= 0.040 * (t**1.32)
            else:
                v.co.y *= 1.0 - 0.18 * t
        else:
            v.co.z *= 1.07
            v.co.x *= 1.03
        # Brow ridge, orbital sockets, nasal bridge & lip mound on -Y face
        if y < -0.06:
            brow = math.exp(-(((z - 0.046) / 0.024) ** 2)) * math.exp(-((x / 0.13) ** 2))
            v.co.y -= 0.012 * brow
            for side in (-0.068, 0.068):
                ed = math.hypot((x - side) / 1.15, (z - 0.010) / 0.85)
                if ed < 0.052:
                    w = (1.0 - ed / 0.052) ** 2
                    v.co.y += 0.025 * w
            nd = math.hypot(x / 0.48, (z + 0.016) / 1.45)
            if nd < 0.044:
                nw = (1.0 - nd / 0.044) ** 2
                v.co.y -= 0.032 * nw
            lip = math.hypot(x / 1.35, (z + 0.082) / 0.55)
            if lip < 0.036:
                lw = (1.0 - lip / 0.036) ** 2
                v.co.y -= 0.013 * lw
        v.co.z += 0.62

    # Anatomical ear helixes + neck/sternocleidomastoid/clavicle bust
    for side in (-1.0, 1.0):
        ear_v = add_quad_sphere(bm_head, radius=0.044, divisions=4, scale_xyz=(0.40, 0.72, 1.38))
        bmesh.ops.rotate(
            bm_head,
            cent=(0.0, 0.0, 0.0),
            matrix=mathutils.Euler((0.12, 0.0, side * -0.20), "XYZ").to_matrix().to_4x4(),
            verts=ear_v,
        )
        bmesh.ops.translate(bm_head, vec=(side * 0.196, 0.014, 0.602), verts=ear_v)

    bust_v = add_lathe_solid(
        bm_head,
        [(0.235, 0.14), (0.215, 0.22), (0.105, 0.34), (0.078, 0.48)],
        segments=28,
    )
    for v in bust_v:
        if v.co.z < 0.29:
            v.co.x *= 1.36
            v.co.y *= 0.76
            if v.co.y < -0.04:
                clav = math.exp(-(((v.co.z - 0.22) / 0.035) ** 2)) * (1.0 - math.exp(-((v.co.x / 0.06) ** 2)))
                v.co.y -= 0.016 * clav
        else:
            v.co.x *= 0.94
            v.co.y *= 0.96
    create_mesh_object(scene, "SculptHeadBust", bm_head, mat_clay, smooth=True, subsurf_levels=1)

    # Tailored collar & orbital cornea guides
    bm_collar = bmesh.new()
    col_v = add_lathe_solid(
        bm_collar,
        [(0.255, 0.115), (0.262, 0.145), (0.225, 0.175)],
        segments=32,
        scale_xyz=(1.35, 0.79, 1.0),
    )
    _ = col_v
    for side in (-0.068, 0.068):
        add_quad_sphere(bm_collar, radius=0.025, divisions=4, center_xyz=(side, -0.158, 0.630))
    create_mesh_object(scene, "SculptCollarAndGuides", bm_collar, mat_accent, smooth=True)

    # Turned classical atelier pedestal
    bm_plinth = bmesh.new()
    add_lathe_solid(
        bm_plinth,
        [
            (0.285, 0.0),
            (0.285, 0.024),
            (0.248, 0.042),
            (0.212, 0.078),
            (0.242, 0.106),
            (0.258, 0.125),
        ],
        segments=36,
    )
    create_mesh_object(scene, "SculptAtelierPlinth", bm_plinth, mat_plinth, smooth=True, weighted_normals=True)

    bm_plate = bmesh.new()
    add_beveled_box(bm_plate, (0.15, 0.024, 0.042), (0.0, -0.242, 0.058), 0.004, segments=2, rot_euler=(0.24, 0.0, 0.0))
    create_mesh_object(scene, "SculptBrassPlate", bm_plate, mat_brass, smooth=True, weighted_normals=True)


def build_modular_arch_window(scene: bpy.types.Scene) -> None:
    mat_stone = make_mat("AcademyWarmLimestone", (0.84, 0.80, 0.74), roughness=0.58, metallic=0.0)
    mat_frame = make_mat("DarkBronzeMullion", (0.16, 0.18, 0.22), roughness=0.33, metallic=0.78)
    mat_brass = make_mat("CasementBrassLatch", (0.81, 0.64, 0.30), roughness=0.26, metallic=0.90)
    mat_pane = make_mat(
        "StarlightWindowBacking",
        (0.35, 0.52, 0.78),
        roughness=0.16,
        metallic=0.10,
        emission_color=(0.22, 0.36, 0.62),
        emission_strength=0.42,
    )

    # Stepped sill with corbel brackets, fluted side pilasters, capitals & 11 beveled voussoirs + keystone
    bm_stone = bmesh.new()
    add_beveled_box(bm_stone, (1.66, 0.38, 0.12), (0.0, 0.0, 0.06), 0.012, segments=2)
    add_beveled_box(bm_stone, (1.50, 0.32, 0.09), (0.0, -0.02, 0.165), 0.010, segments=2)
    for cx in (-0.54, 0.0, 0.54):
        add_beveled_box(bm_stone, (0.12, 0.10, 0.11), (cx, -0.17, 0.11), 0.008, segments=2)

    for sx in (-0.59, 0.59):
        add_beveled_box(bm_stone, (0.22, 0.28, 1.28), (sx, 0.02, 0.85), 0.010, segments=2)
        add_fluted_column_shaft(
            bm_stone,
            base_radius=0.072,
            top_radius=0.066,
            height=1.18,
            flutes=12,
            flute_depth=0.006,
            entasis=0.005,
            z_divisions=8,
            center_xyz=(sx, -0.13, 0.24),
        )
        add_beveled_box(bm_stone, (0.27, 0.34, 0.10), (sx, -0.01, 1.48), 0.010, segments=2)

    arch_r = 0.59
    arch_cz = 1.50
    for i in range(11):
        ang = math.pi * (i + 0.5) / 11.0
        cx = math.cos(ang) * arch_r
        cz = arch_cz + math.sin(ang) * arch_r
        is_key = i == 5
        add_beveled_box(
            bm_stone,
            (0.20 if is_key else 0.165, 0.34 if is_key else 0.28, 0.27 if is_key else 0.21),
            (cx, -0.01 if is_key else 0.01, cz),
            0.009,
            segments=2,
            rot_euler=(0.0, math.pi * 0.5 - ang, 0.0),
        )
    create_mesh_object(scene, "ArchStoneSurround", bm_stone, mat_stone, smooth=True, weighted_normals=True)

    # Gothic bronze mullions, transom bars & rosette tracery ring
    bm_frame = bmesh.new()
    for hz in (0.58, 0.94, 1.48):
        add_beveled_box(bm_frame, (0.96, 0.075, 0.042), (0.0, 0.0, hz), 0.005, segments=2)
    add_beveled_box(bm_frame, (0.052, 0.085, 1.76), (0.0, 0.0, 1.10), 0.005, segments=2)
    for sx in (-0.25, 0.25):
        add_beveled_box(bm_frame, (0.036, 0.065, 1.26), (sx, 0.0, 0.85), 0.004, segments=2)
    # Rosette tracery wheel in tympanum
    ros_cz = 1.74
    ros_r = 0.17
    for k in range(16):
        a0 = (2.0 * math.pi * k) / 16.0
        a1 = (2.0 * math.pi * (k + 1)) / 16.0
        add_tube_segment(
            bm_frame,
            (ros_r * math.cos(a0), -0.02, ros_cz + ros_r * math.sin(a0)),
            (ros_r * math.cos(a1), -0.02, ros_cz + ros_r * math.sin(a1)),
            0.015,
            0.015,
            segments=10,
        )
    create_mesh_object(scene, "ArchMullionFrame", bm_frame, mat_frame, smooth=True, weighted_normals=True)

    # Casement brass latches
    bm_latch = bmesh.new()
    for lx in (-0.055, 0.055):
        add_lathe_solid(
            bm_latch,
            [(0.016, -0.01), (0.018, 0.015), (0.008, 0.035)],
            segments=12,
            center_xyz=(lx, -0.048, 0.94),
            rot_euler=(math.pi * 0.5, 0.0, 0.0),
        )
        add_tube_segment(bm_latch, (lx, -0.075, 0.94), (lx, -0.075, 0.86), 0.007, 0.005, segments=10)
    create_mesh_object(scene, "ArchCasementLatches", bm_latch, mat_brass, smooth=True, weighted_normals=True)

    # Clean arched glass backing (offset at Y=+0.03 to eliminate coplanar mullion overlap)
    bm_pane = bmesh.new()
    profile_pts: list[tuple[float, float]] = [(-0.48, 0.21), (0.48, 0.21)]
    for i in range(21):
        ang = math.pi * (i / 20.0)
        profile_pts.append((math.cos(ang) * 0.48, 1.50 + math.sin(ang) * 0.48))
    front_verts = [bm_pane.verts.new((px, 0.018, pz)) for (px, pz) in profile_pts]
    f_front = bm_pane.faces.new(front_verts)
    ext = bmesh.ops.extrude_face_region(bm_pane, geom=[f_front])
    ext_verts = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm_pane, vec=(0.0, 0.028, 0.0), verts=ext_verts)
    create_mesh_object(scene, "ArchWindowPane", bm_pane, mat_pane, smooth=False)


def build_spiral_stair_core(scene: bpy.types.Scene) -> None:
    mat_steel = make_mat("IndustrialGunmetal", (0.18, 0.20, 0.25), roughness=0.35, metallic=0.84)
    mat_tread = make_mat("WarmOakTread", (0.56, 0.38, 0.23), roughness=0.46, metallic=0.03)
    mat_brass = make_mat("AtelierBrassAccent", (0.80, 0.63, 0.30), roughness=0.26, metallic=0.90)

    bm_steel = bmesh.new()
    # Base flange + fluted central column
    add_lathe_solid(
        bm_steel,
        [(0.96, 0.0), (0.94, 0.045), (0.88, 0.065), (0.22, 0.072), (0.16, 0.14)],
        segments=32,
    )
    add_fluted_column_shaft(
        bm_steel,
        base_radius=0.125,
        top_radius=0.115,
        height=2.36,
        flutes=16,
        flute_depth=0.008,
        entasis=0.004,
        z_divisions=12,
        center_xyz=(0.0, 0.0, 0.12),
    )

    bm_tread = bmesh.new()
    bm_brass = bmesh.new()
    add_lathe_solid(
        bm_brass,
        [(0.135, 2.48), (0.155, 2.53), (0.095, 2.60), (0.125, 2.68), (0.018, 2.80)],
        segments=24,
    )

    steps = 12
    total_angle = math.radians(300.0)
    rail_points: list[tuple[float, float, float]] = []

    for i in range(steps):
        ang = total_angle * (i / (steps - 1))
        z = 0.20 + i * 0.185
        # Collar ring & steel support arm under each tread
        add_lathe_solid(
            bm_steel,
            [(0.138, z - 0.05), (0.145, z - 0.02), (0.138, z + 0.01)],
            segments=20,
        )
        arm_end = (math.cos(ang) * 0.76, math.sin(ang) * 0.76, z - 0.035)
        add_tube_segment(bm_steel, (math.cos(ang) * 0.13, math.sin(ang) * 0.13, z - 0.035), arm_end, 0.022, 0.018, segments=10)

        # Tapered oak tread with multi-segment chamfer
        ret = bmesh.ops.create_cube(bm_tread, size=1.0)
        vs = list(ret["verts"])
        for v in vs:
            u = 0.5 + v.co.x
            r = 0.13 + u * 0.74
            half_w = 0.058 + u * 0.155
            v.co.x = r
            v.co.y = (1.0 if v.co.y > 0 else -1.0) * half_w
            v.co.z = v.co.z * 0.052
        edges = list({e for v in vs for e in v.link_edges})
        bev = bmesh.ops.bevel(bm_tread, geom=edges, offset=0.008, segments=2, profile=0.5, affect="EDGES")
        vs_all = [g for g in bev["verts"] if isinstance(g, bmesh.types.BMVert)] or vs
        bmesh.ops.rotate(bm_tread, cent=(0.0, 0.0, 0.0), matrix=mathutils.Matrix.Rotation(ang, 4, "Z"), verts=vs_all)
        bmesh.ops.translate(bm_tread, vec=(0.0, 0.0, z), verts=vs_all)

        # Turned baluster with decorative brass mid-knuckle
        bx = math.cos(ang) * 0.82
        by = math.sin(ang) * 0.82
        rail_h = 0.86
        add_lathe_solid(
            bm_steel,
            [(0.024, 0.0), (0.016, 0.08), (0.016, rail_h - 0.06), (0.022, rail_h)],
            segments=12,
            center_xyz=(bx, by, z + 0.026),
        )
        add_lathe_solid(
            bm_brass,
            [(0.018, -0.025), (0.030, 0.0), (0.018, 0.025)],
            segments=12,
            center_xyz=(bx, by, z + rail_h * 0.5),
        )
        rail_points.append((bx, by, z + rail_h + 0.026))

    # Smooth subdivided helical brass handrail across dense interpolated stations
    for idx in range(len(rail_points) - 1):
        p_start = Vector(rail_points[idx])
        p_end = Vector(rail_points[idx + 1])
        add_tube_segment(bm_brass, (p_start.x, p_start.y, p_start.z), (p_end.x, p_end.y, p_end.z), 0.028, 0.028, segments=14)
        add_quad_sphere(bm_brass, radius=0.030, divisions=3, center_xyz=(p_start.x, p_start.y, p_start.z))
    last_pt = rail_points[-1]
    add_quad_sphere(bm_brass, radius=0.034, divisions=4, center_xyz=last_pt)

    create_mesh_object(scene, "SpiralStairSteel", bm_steel, mat_steel, smooth=True, weighted_normals=True)
    create_mesh_object(scene, "SpiralStairTreads", bm_tread, mat_tread, smooth=True, weighted_normals=True)
    create_mesh_object(scene, "SpiralStairHandrail", bm_brass, mat_brass, smooth=True, weighted_normals=True)


def build_street_bench_lamp(scene: bpy.types.Scene) -> None:
    mat_iron = make_mat("CastIronCharcoal", (0.13, 0.14, 0.17), roughness=0.40, metallic=0.82)
    mat_wood = make_mat("ParkTeakWood", (0.58, 0.35, 0.19), roughness=0.48, metallic=0.02)
    mat_stone = make_mat("PavingCurbStone", (0.66, 0.65, 0.62), roughness=0.68, metallic=0.0)
    mat_lantern = make_mat(
        "WarmLanternGlow",
        (1.0, 0.89, 0.64),
        roughness=0.18,
        metallic=0.0,
        emission_color=(1.0, 0.83, 0.46),
        emission_strength=1.35,
    )

    # Sidewalk stone plinth + beveled curb border
    bm_stone = bmesh.new()
    add_beveled_box(bm_stone, (2.32, 1.14, 0.08), (0.0, 0.0, 0.04), 0.010, segments=2)
    add_beveled_box(bm_stone, (2.28, 0.14, 0.05), (0.0, -0.48, 0.105), 0.008, segments=2)
    create_mesh_object(scene, "StreetPavingBase", bm_stone, mat_stone, smooth=True, weighted_normals=True)

    # Ergonomically curved 6-slat teak seat + 4-slat contoured backrest
    bm_wood = bmesh.new()
    seat_curve = ((-0.18, 0.445, 0.10), (-0.11, 0.455, 0.04), (-0.04, 0.458, 0.0), (0.03, 0.454, -0.04), (0.10, 0.448, -0.06), (0.17, 0.444, -0.08))
    for sy, sz, tilt in seat_curve:
        add_beveled_box(bm_wood, (1.42, 0.058, 0.030), (-0.28, sy, sz), 0.005, segments=2, rot_euler=(tilt, 0.0, 0.0))
    for i in range(4):
        bz = 0.56 + i * 0.088
        by = 0.21 + i * 0.020
        add_beveled_box(bm_wood, (1.42, 0.028, 0.068), (-0.28, by, bz), 0.005, segments=2, rot_euler=(-0.20, 0.0, 0.0))
    create_mesh_object(scene, "BenchWoodSlats", bm_wood, mat_wood, smooth=True, weighted_normals=True)

    # Cast-iron bench frames with scroll volutes + fluted Victorian street lamp post & 6-rib lantern cage
    bm_iron = bmesh.new()
    for lx in (-0.88, -0.28, 0.32):
        add_beveled_box(bm_iron, (0.048, 0.44, 0.036), (lx, 0.01, 0.42), 0.005, segments=2)
        add_tube_segment(bm_iron, (lx, -0.17, 0.08), (lx, -0.14, 0.43), 0.024, 0.020, segments=10)
        add_tube_segment(bm_iron, (lx, 0.19, 0.08), (lx, 0.18, 0.43), 0.024, 0.020, segments=10)
        add_beveled_box(bm_iron, (0.046, 0.048, 0.46), (lx, 0.22, 0.67), 0.005, segments=2, rot_euler=(-0.20, 0.0, 0.0))
        if lx != -0.28:
            # Armrest & scroll ring
            add_beveled_box(bm_iron, (0.050, 0.42, 0.038), (lx, 0.01, 0.62), 0.006, segments=2)
            add_tube_segment(bm_iron, (lx, -0.17, 0.43), (lx, -0.17, 0.62), 0.020, 0.018, segments=10)
            for k in range(10):
                a0 = (2.0 * math.pi * k) / 10.0
                a1 = (2.0 * math.pi * (k + 1)) / 10.0
                add_tube_segment(
                    bm_iron,
                    (lx, -0.02 + 0.09 * math.cos(a0), 0.27 + 0.09 * math.sin(a0)),
                    (lx, -0.02 + 0.09 * math.cos(a1), 0.27 + 0.09 * math.sin(a1)),
                    0.011,
                    0.011,
                    segments=8,
                )

    lamp_x, lamp_y = 0.78, 0.14
    add_lathe_solid(
        bm_iron,
        [(0.16, 0.08), (0.15, 0.15), (0.115, 0.24), (0.125, 0.30), (0.085, 0.48)],
        segments=20,
        center_xyz=(lamp_x, lamp_y, 0.0),
    )
    add_fluted_column_shaft(
        bm_iron,
        base_radius=0.052,
        top_radius=0.038,
        height=1.78,
        flutes=12,
        flute_depth=0.005,
        entasis=0.004,
        z_divisions=10,
        center_xyz=(lamp_x, lamp_y, 0.48),
    )
    # Crossbar ladder rest + lantern base collar, 6 corner ribs & pagoda hood
    add_tube_segment(bm_iron, (lamp_x - 0.22, lamp_y, 2.08), (lamp_x + 0.22, lamp_y, 2.08), 0.013, 0.013, segments=10)
    add_lathe_solid(
        bm_iron,
        [(0.065, 2.26), (0.125, 2.32), (0.105, 2.35)],
        segments=12,
        center_xyz=(lamp_x, lamp_y, 0.0),
    )
    for rib in range(6):
        ang = (2.0 * math.pi * rib) / 6.0
        add_tube_segment(
            bm_iron,
            (lamp_x + 0.10 * math.cos(ang), lamp_y + 0.10 * math.sin(ang), 2.34),
            (lamp_x + 0.135 * math.cos(ang), lamp_y + 0.135 * math.sin(ang), 2.60),
            0.009,
            0.008,
            segments=8,
        )
    add_lathe_solid(
        bm_iron,
        [(0.175, 2.59), (0.145, 2.64), (0.055, 2.74), (0.015, 2.84)],
        segments=12,
        center_xyz=(lamp_x, lamp_y, 0.0),
    )
    for dx in (-0.23, 0.23):
        add_quad_sphere(bm_iron, radius=0.022, divisions=3, center_xyz=(lamp_x + dx, lamp_y, 2.08))
    add_quad_sphere(bm_iron, radius=0.026, divisions=3, center_xyz=(lamp_x, lamp_y, 2.85))
    create_mesh_object(scene, "BenchAndLampIron", bm_iron, mat_iron, smooth=True, weighted_normals=True)

    # Faceted warm lantern core
    bm_glow = bmesh.new()
    add_lathe_solid(
        bm_glow,
        [(0.082, 2.35), (0.112, 2.58), (0.075, 2.60)],
        segments=6,
        center_xyz=(lamp_x, lamp_y, 0.0),
    )
    create_mesh_object(scene, "StreetLanternCore", bm_glow, mat_lantern, smooth=False)


ASSET_SPECS = [
    (
        "webtoon-sculpt-head-basemesh-v13",
        "웹툰 캐릭터 두상·흉상 조형 베이스메시",
        "클린 쿼드 서브서프 두상·안와·코·입술·귀·쇄골 흉상·클래식 페데스탈 조형 베이스메시",
        build_sculpt_head_basemesh,
    ),
    (
        "webtoon-modular-arch-window-v13",
        "아카데미·로판 고딕 아치 석조 창호 모듈",
        "다단 코벨 창턱·플루티드 필라스터·11단 부수아르 키스톤·로제트 트레이서리·황동 래치 창호 모듈",
        build_modular_arch_window,
    ),
    (
        "webtoon-spiral-stair-core-v13",
        "모듈러 나선형 계단·연철 난간 코어",
        "16골 주철 중심주·12단 챔퍼 오크 디딤판·선반 가공 동자주·연속 나선 황동 핸드레일 계단 코어",
        build_spiral_stair_core,
    ),
    (
        "webtoon-street-bench-lamp-v13",
        "유럽풍 거리 원목 벤치·클래식 가로등 세트",
        "인체공학 곡면 티크 슬랫 벤치·볼류트 주철 프레임·플루티드 6각 빅토리안 가로등 세트",
        build_street_bench_lamp,
    ),
    (
        "webtoon-ornate-clocktower-gear-core-v13",
        "오르골·시계탑 정밀 기어 아스트롤라베 코어",
        "인볼류트 치형 황동 대차륜·적동 유성 피니언·블루스틸 축·천구 아스트롤라베 링·크리스탈 코어",
        build_ornate_clocktower_gear_core,
    ),
    (
        "webtoon-hanok-paljak-pavilion-bay-v13",
        "전통 한옥 배흘림기둥·처마 정자 모듈",
        "화강암 2단 기단·주춧돌·느티나무 배흘림기둥·공포·서까래·귀솟음 기와 처마·한지 창호 모듈",
        build_hanok_paljak_pavilion_bay,
    ),
    (
        "webtoon-creator-ergonomic-chair-desk-v13",
        "웹툰 작가 모션데스크·인체공학 체어 세트",
        "전동 듀얼컬럼 오크 모션데스크·모니터암·액정 펜타블릿·5발 캐스터 인체공학 메쉬 체어 세트",
        build_creator_ergonomic_chair_desk,
    ),
    (
        "webtoon-fantasy-potion-apothecary-cabinet-v13",
        "판타지 연금술 포션 진열장·약재함",
        "마호가니 아치형 6서랍 약재 진열장·황동 천칭·석조 유발·에메랄드·루비 발광 엘릭서 플라스크 세트",
        build_fantasy_potion_apothecary_cabinet,
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


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def count_scene_triangles(mesh_objs: list[bpy.types.Object]) -> int:
    total = 0
    for obj in mesh_objs:
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    scene = get_or_create_export_scene()
    files_manifest = []

    for slug, label_ko, desc_ko, builder in ASSET_SPECS:
        clear_scene(scene)
        builder(scene)
        ground_scene_meshes(scene)
        mesh_objs = [o for o in scene.objects if o.type == "MESH"]
        total_verts = 0
        total_faces = 0
        for obj in mesh_objs:
            audit_mesh_defects(obj)
            total_verts += len(obj.data.vertices)
            total_faces += len(obj.data.polygons)
        total_tris = count_scene_triangles(mesh_objs)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["asset_generator"] = "scripts/blender/generate_modeler_kit_v13.py"
        root["asset_license"] = "CC0-1.0"
        root["units"] = "metres"
        scene.collection.objects.link(root)
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
        files_manifest.append(
            {
                "slug": slug,
                "file": f"{slug}.glb",
                "labelKo": label_ko,
                "descKo": desc_ko,
                "bytes": glb_path.stat().st_size,
                "sha256": sha256_file(glb_path),
                "vertices": total_verts,
                "faces": total_faces,
                "triangles": total_tris,
                "drawCalls": len(mesh_objs),
            }
        )
        print(
            f"MODELER_KIT_V13_OK {slug}: {glb_path.stat().st_size} bytes "
            f"({total_verts} verts, {total_tris} tris, {len(mesh_objs)} draw calls)"
        )

    prov_path = OUTPUT_DIR / "provenance.json"
    if prov_path.exists():
        prov = json.loads(prov_path.read_text(encoding="utf-8"))
        prov["files"] = [
            {"file": item["file"], "bytes": item["bytes"], "sha256": item["sha256"]}
            for item in sorted(files_manifest, key=lambda r: r["file"])
        ]
        prov_path.write_text(json.dumps(prov, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("MODELER_KIT_V13_ALL_DONE", len(files_manifest))


if __name__ == "__main__":
    main()
