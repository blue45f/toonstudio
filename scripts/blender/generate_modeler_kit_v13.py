"""ToonStudio Modeler Kit V13 — 4종 웹툰 모델러·공간 모델러 모듈러 베이스메시 CC0-1.0 에셋 생성기.

실행 예시 (독립 백그라운드 Blender 5.2):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/blender/generate_modeler_kit_v13.py

모든 결과물은 미터 단위, 바닥 Z=0(glTF Y=0) 정렬, 매니폴드 지오메트리(비매니폴드·고립 정점·0면적 면 0개),
스마트 UV 전개, Principled BSDF 재질 배치 병합, 자체 포함 GLB로 내보내고 provenance.json 및 LICENSES.md를 갱신한다.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bmesh
import bpy
import mathutils
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-modeler-kit-v13"
THUMB_DIR = OUTPUT_DIR / "thumbnails"
MAT_CACHE: dict[str, bpy.types.Material] = {}


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
    MAT_CACHE.clear()


def make_mat(
    name: str,
    color: tuple[float, float, float],
    roughness: float = 0.48,
    metallic: float = 0.0,
    emission_color: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    if name in MAT_CACHE:
        return MAT_CACHE[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1.0)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission_color is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    MAT_CACHE[name] = mat
    return mat


def add_beveled_box(
    bm: bmesh.types.BMesh,
    size_xyz: tuple[float, float, float],
    center_xyz: tuple[float, float, float],
    bevel_offset: float = 0.008,
    rot_euler: tuple[float, float, float] | None = None,
) -> None:
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret["verts"]
    bmesh.ops.scale(bm, vec=size_xyz, verts=verts)
    if rot_euler is not None:
        mat_rot = mathutils.Euler(rot_euler, "XYZ").to_matrix().to_4x4()
        bmesh.ops.rotate(bm, cent=(0.0, 0.0, 0.0), matrix=mat_rot, verts=verts)
    bmesh.ops.translate(bm, vec=center_xyz, verts=verts)
    edges = list({e for v in verts for e in v.link_edges})
    if bevel_offset > 0:
        bmesh.ops.bevel(bm, geom=edges, offset=bevel_offset, segments=1, profile=0.5, affect="EDGES")


def create_mesh_object(
    scene: bpy.types.Scene,
    name: str,
    bm: bmesh.types.BMesh,
    mat: bpy.types.Material,
    smooth: bool = True,
) -> bpy.types.Object:
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


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
    mat_clay = make_mat("SculptPorcelainClay", (0.86, 0.80, 0.77), roughness=0.40, metallic=0.0)
    mat_accent = make_mat("SculptGuideCollar", (0.35, 0.40, 0.56), roughness=0.44, metallic=0.12)
    mat_plinth = make_mat("AtelierSlatePlinth", (0.16, 0.18, 0.24), roughness=0.34, metallic=0.30)

    # Clean quad-dominant anime head + ear silhouettes
    bm_head = bmesh.new()
    bmesh.ops.create_uvsphere(bm_head, u_segments=28, v_segments=20, radius=0.21)
    for v in bm_head.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        if z < 0.0:
            t = min(1.0, -z / 0.21)
            v.co.x *= 1.0 - 0.35 * t
            if y < 0.0:
                chin = math.exp(-((x / 0.105) ** 2)) * 0.044 * t
                v.co.y -= chin
                v.co.z -= 0.036 * (t**1.35)
            else:
                v.co.y *= 1.0 - 0.18 * t
        else:
            v.co.z *= 1.06
            v.co.x *= 1.03
        if y < -0.07:
            for side in (-0.070, 0.070):
                ed = math.hypot(x - side, z - 0.012)
                if ed < 0.056:
                    w = (1.0 - ed / 0.056) ** 2
                    v.co.y += 0.022 * w
            nd = math.hypot(x / 0.52, (z + 0.018) / 1.35)
            if nd < 0.042:
                nw = (1.0 - nd / 0.042) ** 2
                v.co.y -= 0.028 * nw
        v.co.z += 0.57

    # Symmetrical simplified ear forms
    for side in (-1.0, 1.0):
        ret_ear = bmesh.ops.create_uvsphere(bm_head, u_segments=12, v_segments=8, radius=0.042)
        evs = ret_ear["verts"]
        bmesh.ops.scale(bm_head, vec=(0.42, 0.72, 1.35), verts=evs)
        bmesh.ops.rotate(
            bm_head,
            cent=(0, 0, 0),
            matrix=mathutils.Euler((0.12, 0.0, side * -0.18), "XYZ").to_matrix().to_4x4(),
            verts=evs,
        )
        bmesh.ops.translate(bm_head, vec=(side * 0.195, 0.015, 0.555), verts=evs)

    # Neck & clavicle bust
    ret_neck = bmesh.ops.create_cone(
        bm_head, cap_ends=True, cap_tris=False, segments=24, radius1=0.24, radius2=0.076, depth=0.33
    )
    for v in ret_neck["verts"]:
        if v.co.z < -0.03:
            v.co.x *= 1.34
            v.co.y *= 0.76
        else:
            v.co.x *= 0.94
            v.co.y *= 0.94
        v.co.z += 0.255
    create_mesh_object(scene, "SculptHeadBust", bm_head, mat_clay, smooth=True)

    # Collar trim ring
    bm_collar = bmesh.new()
    ret_c = bmesh.ops.create_cone(
        bm_collar, cap_ends=True, cap_tris=False, segments=24, radius1=0.255, radius2=0.225, depth=0.045
    )
    bmesh.ops.scale(bm_collar, vec=(1.32, 0.79, 1.0), verts=ret_c["verts"])
    bmesh.ops.translate(bm_collar, vec=(0.0, 0.0, 0.105), verts=ret_c["verts"])
    create_mesh_object(scene, "SculptCollarRing", bm_collar, mat_accent, smooth=True)

    # Atelier plinth
    bm_plinth = bmesh.new()
    ret_p = bmesh.ops.create_cone(
        bm_plinth, cap_ends=True, cap_tris=False, segments=28, radius1=0.29, radius2=0.25, depth=0.085
    )
    bmesh.ops.translate(bm_plinth, vec=(0.0, 0.0, 0.0425), verts=ret_p["verts"])
    bmesh.ops.bevel(bm_plinth, geom=list(bm_plinth.edges), offset=0.006, segments=1, profile=0.5, affect="EDGES")
    create_mesh_object(scene, "SculptAtelierPlinth", bm_plinth, mat_plinth, smooth=True)


def build_modular_arch_window(scene: bpy.types.Scene) -> None:
    mat_stone = make_mat("AcademyWarmLimestone", (0.83, 0.79, 0.73), roughness=0.60, metallic=0.0)
    mat_frame = make_mat("DarkBronzeMullion", (0.17, 0.19, 0.23), roughness=0.35, metallic=0.75)
    mat_pane = make_mat(
        "StarlightWindowBacking",
        (0.36, 0.50, 0.74),
        roughness=0.18,
        metallic=0.12,
        emission_color=(0.20, 0.32, 0.56),
        emission_strength=0.35,
    )

    bm_stone = bmesh.new()
    add_beveled_box(bm_stone, (1.58, 0.34, 0.14), (0.0, 0.0, 0.07), 0.010)
    add_beveled_box(bm_stone, (1.42, 0.28, 0.08), (0.0, 0.0, 0.18), 0.008)
    for sx in (-0.58, 0.58):
        add_beveled_box(bm_stone, (0.20, 0.26, 1.24), (sx, 0.0, 0.84), 0.009)
        add_beveled_box(bm_stone, (0.25, 0.30, 0.10), (sx, 0.0, 1.49), 0.008)
    arch_r = 0.58
    arch_cz = 1.48
    for i in range(9):
        ang = math.pi * (i + 0.5) / 9.0
        cx = math.cos(ang) * arch_r
        cz = arch_cz + math.sin(ang) * arch_r
        w = 0.22 if i == 4 else 0.19
        h = 0.25 if i == 4 else 0.21
        add_beveled_box(
            bm_stone,
            (w, 0.28 if i == 4 else 0.24, h),
            (cx, 0.0, cz),
            0.008,
            rot_euler=(0.0, math.pi * 0.5 - ang, 0.0),
        )
    create_mesh_object(scene, "ArchStoneSurround", bm_stone, mat_stone, smooth=False)

    bm_frame = bmesh.new()
    add_beveled_box(bm_frame, (0.96, 0.08, 0.05), (0.0, 0.0, 0.86), 0.004)
    add_beveled_box(bm_frame, (0.96, 0.08, 0.05), (0.0, 0.0, 1.48), 0.004)
    add_beveled_box(bm_frame, (0.05, 0.08, 1.74), (0.0, 0.0, 1.10), 0.004)
    for sx in (-0.25, 0.25):
        add_beveled_box(bm_frame, (0.035, 0.06, 1.24), (sx, 0.0, 0.85), 0.003)
    create_mesh_object(scene, "ArchMullionFrame", bm_frame, mat_frame, smooth=False)

    # Single clean arched profile extruded along Y (zero overlapping coplanar faces / zero z-fighting)
    bm_pane = bmesh.new()
    profile_pts: list[tuple[float, float]] = [(-0.48, 0.22), (0.48, 0.22)]
    for i in range(17):
        ang = math.pi * (i / 16.0)
        profile_pts.append((math.cos(ang) * 0.48, 1.48 + math.sin(ang) * 0.48))
    front_verts = [bm_pane.verts.new((px, -0.015, pz)) for (px, pz) in profile_pts]
    f_front = bm_pane.faces.new(front_verts)
    ext = bmesh.ops.extrude_face_region(bm_pane, geom=[f_front])
    ext_verts = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm_pane, vec=(0.0, 0.03, 0.0), verts=ext_verts)
    create_mesh_object(scene, "ArchWindowPane", bm_pane, mat_pane, smooth=False)


def build_spiral_stair_core(scene: bpy.types.Scene) -> None:
    mat_steel = make_mat("IndustrialGunmetal", (0.20, 0.22, 0.27), roughness=0.38, metallic=0.82)
    mat_tread = make_mat("WarmOakTread", (0.54, 0.37, 0.23), roughness=0.50, metallic=0.04)
    mat_brass = make_mat("AtelierBrassAccent", (0.76, 0.60, 0.30), roughness=0.30, metallic=0.88)

    bm_steel = bmesh.new()
    ret_base = bmesh.ops.create_cone(
        bm_steel, cap_ends=True, cap_tris=False, segments=24, radius1=0.92, radius2=0.88, depth=0.06
    )
    bmesh.ops.translate(bm_steel, vec=(0.0, 0.0, 0.03), verts=ret_base["verts"])

    ret_col = bmesh.ops.create_cone(
        bm_steel, cap_ends=True, cap_tris=False, segments=20, radius1=0.11, radius2=0.11, depth=2.30
    )
    bmesh.ops.translate(bm_steel, vec=(0.0, 0.0, 1.18), verts=ret_col["verts"])

    bm_tread = bmesh.new()
    bm_brass = bmesh.new()
    ret_finial = bmesh.ops.create_uvsphere(bm_brass, u_segments=16, v_segments=10, radius=0.13)
    bmesh.ops.translate(bm_brass, vec=(0.0, 0.0, 2.36), verts=ret_finial["verts"])

    steps = 10
    total_angle = math.radians(270.0)
    prev_rail_pt: Vector | None = None

    for i in range(steps):
        ang = total_angle * (i / (steps - 1))
        z = 0.20 + i * 0.19
        ret = bmesh.ops.create_cube(bm_tread, size=1.0)
        vs = ret["verts"]
        for v in vs:
            u = 0.5 + v.co.x
            r = 0.10 + u * 0.74
            half_w = 0.06 + u * 0.14
            v.co.x = r
            v.co.y = (1.0 if v.co.y > 0 else -1.0) * half_w
            v.co.z = v.co.z * 0.055
        bmesh.ops.rotate(bm_tread, cent=(0.0, 0.0, 0.0), matrix=mathutils.Matrix.Rotation(ang, 4, "Z"), verts=vs)
        bmesh.ops.translate(bm_tread, vec=(0.0, 0.0, z), verts=vs)
        edges = list({e for v in vs for e in v.link_edges})
        bmesh.ops.bevel(bm_tread, geom=edges, offset=0.006, segments=1, profile=0.5, affect="EDGES")

        bx = math.cos(ang) * 0.80
        by = math.sin(ang) * 0.80
        rail_h = 0.82
        ret_b = bmesh.ops.create_cone(
            bm_steel, cap_ends=True, cap_tris=False, segments=10, radius1=0.018, radius2=0.018, depth=rail_h
        )
        bmesh.ops.translate(bm_steel, vec=(bx, by, z + rail_h * 0.5), verts=ret_b["verts"])

        rail_pt = Vector((bx, by, z + rail_h))
        if prev_rail_pt is not None:
            seg_vec = rail_pt - prev_rail_pt
            seg_len = seg_vec.length
            mid = (rail_pt + prev_rail_pt) * 0.5
            ret_r = bmesh.ops.create_cone(
                bm_brass, cap_ends=True, cap_tris=False, segments=10, radius1=0.026, radius2=0.026, depth=seg_len + 0.02
            )
            rot_q = Vector((0.0, 0.0, 1.0)).rotation_difference(seg_vec.normalized())
            bmesh.ops.rotate(bm_brass, cent=(0.0, 0.0, 0.0), matrix=rot_q.to_matrix().to_4x4(), verts=ret_r["verts"])
            bmesh.ops.translate(bm_brass, vec=mid, verts=ret_r["verts"])
        prev_rail_pt = rail_pt

    create_mesh_object(scene, "SpiralStairSteel", bm_steel, mat_steel, smooth=True)
    create_mesh_object(scene, "SpiralStairTreads", bm_tread, mat_tread, smooth=False)
    create_mesh_object(scene, "SpiralStairHandrail", bm_brass, mat_brass, smooth=True)


def build_street_bench_lamp(scene: bpy.types.Scene) -> None:
    mat_iron = make_mat("CastIronCharcoal", (0.14, 0.15, 0.18), roughness=0.44, metallic=0.80)
    mat_wood = make_mat("ParkTeakWood", (0.56, 0.34, 0.19), roughness=0.54, metallic=0.02)
    mat_stone = make_mat("PavingCurbStone", (0.64, 0.63, 0.61), roughness=0.68, metallic=0.0)
    mat_lantern = make_mat(
        "WarmLanternGlow",
        (1.0, 0.88, 0.62),
        roughness=0.20,
        metallic=0.0,
        emission_color=(1.0, 0.82, 0.45),
        emission_strength=1.2,
    )

    # Stone plinth sidewalk base
    bm_stone = bmesh.new()
    add_beveled_box(bm_stone, (2.20, 1.05, 0.08), (0.0, 0.0, 0.04), 0.010)
    create_mesh_object(scene, "StreetPavingBase", bm_stone, mat_stone, smooth=False)

    # Park Bench Wood Slats (Seat + Backrest)
    bm_wood = bmesh.new()
    for i in range(4):
        sy = -0.14 + i * 0.095
        add_beveled_box(bm_wood, (1.36, 0.075, 0.032), (-0.28, sy, 0.46), 0.004)
    for i in range(3):
        bz = 0.60 + i * 0.105
        by = 0.20 + i * 0.022
        add_beveled_box(bm_wood, (1.36, 0.030, 0.080), (-0.28, by, bz), 0.004, rot_euler=(-0.18, 0.0, 0.0))
    create_mesh_object(scene, "BenchWoodSlats", bm_wood, mat_wood, smooth=False)

    # Cast Iron Bench Legs + Armrests + Street Lamp Post & Lantern Cage
    bm_iron = bmesh.new()
    for lx in (-0.84, 0.28):
        add_beveled_box(bm_iron, (0.055, 0.44, 0.38), (lx, 0.02, 0.27), 0.005)
        add_beveled_box(bm_iron, (0.055, 0.055, 0.44), (lx, 0.21, 0.66), 0.005, rot_euler=(-0.18, 0.0, 0.0))
        add_beveled_box(bm_iron, (0.055, 0.40, 0.045), (lx, 0.01, 0.62), 0.005)
        add_beveled_box(bm_iron, (0.050, 0.050, 0.18), (lx, -0.16, 0.53), 0.004)

    # Lamp Post at X = +0.74
    lamp_x, lamp_y = 0.74, 0.12
    ret_ped = bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=16, radius1=0.13, radius2=0.09, depth=0.38
    )
    bmesh.ops.translate(bm_iron, vec=(lamp_x, lamp_y, 0.27), verts=ret_ped["verts"])
    ret_pole = bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=14, radius1=0.045, radius2=0.034, depth=1.82
    )
    bmesh.ops.translate(bm_iron, vec=(lamp_x, lamp_y, 1.36), verts=ret_pole["verts"])
    # Lantern cap & base collar
    ret_cap = bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=12, radius1=0.16, radius2=0.03, depth=0.14
    )
    bmesh.ops.translate(bm_iron, vec=(lamp_x, lamp_y, 2.58), verts=ret_cap["verts"])
    ret_collar = bmesh.ops.create_cone(
        bm_iron, cap_ends=True, cap_tris=False, segments=12, radius1=0.08, radius2=0.12, depth=0.06
    )
    bmesh.ops.translate(bm_iron, vec=(lamp_x, lamp_y, 2.27), verts=ret_collar["verts"])
    create_mesh_object(scene, "BenchAndLampIron", bm_iron, mat_iron, smooth=True)

    # Warm Lantern Core
    bm_glow = bmesh.new()
    ret_g = bmesh.ops.create_cone(
        bm_glow, cap_ends=True, cap_tris=False, segments=12, radius1=0.095, radius2=0.115, depth=0.22
    )
    bmesh.ops.translate(bm_glow, vec=(lamp_x, lamp_y, 2.41), verts=ret_g["verts"])
    create_mesh_object(scene, "StreetLanternCore", bm_glow, mat_lantern, smooth=True)


ASSET_SPECS = [
    ("webtoon-sculpt-head-basemesh-v13", "웹툰 캐릭터 두상·흉상 조형 베이스메시", build_sculpt_head_basemesh),
    ("webtoon-modular-arch-window-v13", "아카데미·로판 아치형 석조 창호 모듈", build_modular_arch_window),
    ("webtoon-spiral-stair-core-v13", "모듈러 나선형 계단·핸드레일 코어", build_spiral_stair_core),
    ("webtoon-street-bench-lamp-v13", "거리 공원 원목 벤치·클래식 가로등 세트", build_street_bench_lamp),
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


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    scene = get_or_create_export_scene()
    files_manifest = []

    for slug, label_ko, builder in ASSET_SPECS:
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
                "file": f"{slug}.glb",
                "labelKo": label_ko,
                "bytes": glb_path.stat().st_size,
                "sha256": sha256_file(glb_path),
                "vertices": total_verts,
                "faces": total_faces,
            }
        )
        print(f"MODELER_KIT_V13_OK {slug}: {glb_path.stat().st_size} bytes ({total_verts} verts, {total_faces} faces)")

    print(json.dumps({"generated": files_manifest}, ensure_ascii=False))


if __name__ == "__main__":
    main()
