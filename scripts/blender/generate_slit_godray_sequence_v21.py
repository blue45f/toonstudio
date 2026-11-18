"""ToonStudio Slit God-Ray & Floor Shadow Drift 3-Beat Sequence Pack V21 — Blender 5.3.0 생성기 & 6개 기존 씬 SHA-256 격리 검증기.

개폐율(0~100%)에 1:1 연동되는 가변 슬릿 고드레이(Volumetric God-Ray Slit), 바닥 그림자 드리프트 마스크,
그리고 클라이맥스 3연속 세로 스크롤 시퀀스(15% 틈새 긴장 -> 65% 개방 돌파 -> 100% 전면 역광) CC0-1.0 수밀 에셋 3종을 생성한다:
1) `webtoon-slit-godray-threshold-15pct-v21.glb` — 도입 15% 칼날 슬릿 역광·장거리 그림자 베이
2) `webtoon-slit-godray-breakthrough-65pct-v21.glb` — 전개 65% 확산 프리즘 고드레이·중거리 그림자 베이
3) `webtoon-slit-godray-climax-100pct-v21.glb` — 클라이맥스 100% 전면 할로 역광·림 실루엣 베이
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
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
from generate_episode_handoff_v18 import compute_scene_isolation_digest  # noqa: E402
from generate_lumiere_atelier_v16 import make_lumiere_mat, srgb  # noqa: E402
from generate_lumiere_salon_v17 import (  # noqa: E402
    audit_evaluated_mesh_defects,
    clear_only_scene,
    sha256_file,
)
from modeler_kit_v13_primitives import (  # noqa: E402
    add_beveled_box,
    add_fluted_column_shaft,
    add_lathe_solid,
    create_mesh_object,
)

ROOT = SCRIPT_DIR.parents[1]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-slit-godray-v21"
THUMB_DIR = OUTPUT_DIR / "thumbnails"
TARGET_LIVE_SCENE = "ToonStudio_SlitGodRay_Sequence_V21"


def snapshot_preserved_scenes() -> dict[str, dict[str, object]]:
    return {
        s.name: compute_scene_isolation_digest(s)
        for s in bpy.data.scenes
        if s.name not in (TARGET_LIVE_SCENE, "SlitGodRayV21_Export")
    }


def build_slit_godray_sequence_bay(
    scene: bpy.types.Scene,
    open_ratio: float,
    beat_tag: str,
    beam_tint_srgb: tuple[float, float, float],
) -> dict[str, float]:
    """공통 건축 기준선(2.76m/2.40m/1.10m/0.74m/0.18m) 위에 개폐율 연동 가변 슬릿 광선 웨지·바닥 그림자 드리프트를 생성한다."""
    clamped = max(0.05, min(1.0, open_ratio))
    slit_width_m = round(0.16 + 1.52 * clamped, 3)
    leaf_dx = round(0.42 + 0.56 * clamped, 3)
    shadow_reach_m = round(1.32 - 0.58 * clamped, 3)
    beam_spread_deg = round(6.5 + 39.5 * clamped, 2)

    mat_stone = make_lumiere_mat(f"V21_{beat_tag}_SanctumSlate", (0.18, 0.19, 0.23), roughness=0.32, coat_weight=0.38)
    mat_alabaster = make_lumiere_mat(f"V21_{beat_tag}_PortalAlabaster", (0.88, 0.86, 0.82), roughness=0.26, coat_weight=0.46)
    mat_bronze = make_lumiere_mat(f"V21_{beat_tag}_GildedBronze", (0.86, 0.70, 0.36), roughness=0.19, metallic=1.0, coat_weight=0.30)
    mat_shadow = make_lumiere_mat(f"V21_{beat_tag}_UmbraShadowMask", (0.07, 0.08, 0.11), roughness=0.52, coat_weight=0.12)
    mat_godray = make_lumiere_mat(
        f"V21_{beat_tag}_VolumetricGodRay",
        beam_tint_srgb,
        roughness=0.06,
        ior=1.45,
        alpha=0.16 + 0.05 * clamped,
        transmission_weight=0.0,
        coat_weight=0.65,
        emission_srgb=beam_tint_srgb,
        emission_strength=1.45 + 0.55 * clamped,
    )
    if hasattr(mat_godray, "surface_render_method"):
        mat_godray.surface_render_method = "BLENDED"

    # 1. Stepped datum deck (2.76m × 1.64m, 0.18m riser)
    bm_deck = bmesh.new()
    add_beveled_box(bm_deck, (2.76, 1.64, 0.09), (0.0, 0.0, 0.045), 0.010, segments=2)
    add_beveled_box(bm_deck, (2.58, 1.12, 0.09), (0.0, 0.22, 0.135), 0.010, segments=2)
    create_mesh_object(scene, f"{beat_tag}_DatumDeck", bm_deck, mat_stone, smooth=False, weighted_normals=True)

    # 2. Portal columns & header (2.40m clear portal height above 0.18m deck -> lintel bottom at z = 2.58m)
    bm_portal = bmesh.new()
    for sx in (-1.12, 1.12):
        add_beveled_box(bm_portal, (0.34, 0.32, 0.22), (sx, 0.56, 0.29), 0.010, segments=2)
        add_fluted_column_shaft(
            bm_portal,
            base_radius=0.135,
            top_radius=0.118,
            height=1.96,
            flutes=12,
            flute_depth=0.009,
            entasis=0.008,
            z_divisions=10,
            center_xyz=(sx, 0.56, 0.40),
        )
        add_lathe_solid(
            bm_portal,
            [(0.122, 2.36), (0.172, 2.48), (0.188, 2.58)],
            segments=18,
            center_xyz=(sx, 0.56, 0.0),
        )
    add_beveled_box(bm_portal, (2.68, 0.38, 0.20), (0.0, 0.56, 2.68), 0.012, segments=2)
    create_mesh_object(scene, f"{beat_tag}_PortalColonnade", bm_portal, mat_alabaster, smooth=True, weighted_normals=True)

    # 3. Articulated tall sanctuary doors + 1.10m railing + 0.74m console + IK snap rings
    bm_bronze = bmesh.new()
    for side in (-1.0, 1.0):
        door_cx = side * (slit_width_m * 0.5 + 0.38)
        add_beveled_box(bm_bronze, (0.76, 0.075, 2.36), (door_cx, 0.50, 1.36), 0.008, segments=2)
        # 1.10m front safety balustrade flanks
        add_beveled_box(bm_bronze, (0.76, 0.06, 0.05), (side * 0.94, -0.70, 1.075), 0.007, segments=2)
        for offset in (-0.32, 0.32):
            add_beveled_box(bm_bronze, (0.05, 0.05, 1.01), (side * 0.94 + offset, -0.70, 0.595), 0.006, segments=2)
    # 0.74m compact lectern/console at side so center slit light corridor stays dramatic
    add_beveled_box(bm_bronze, (0.64, 0.42, 0.05), (0.78, 0.06, 0.895), 0.007, segments=2)
    add_beveled_box(bm_bronze, (0.14, 0.28, 0.69), (0.78, 0.06, 0.525), 0.008, segments=2)
    # 4 IK snap locator rings (foot 0.18m, wrist 0.92m, elbow 1.10m, door latch 1.32m)
    latch_x = -(slit_width_m * 0.5 + 0.08)
    add_closed_torus_ring(bm_bronze, 0.042, 0.008, major_segs=20, minor_segs=8, center_xyz=(0.0, -0.24, 0.188))
    add_closed_torus_ring(bm_bronze, 0.036, 0.007, major_segs=20, minor_segs=8, center_xyz=(0.78, 0.06, 0.928))
    add_closed_torus_ring(bm_bronze, 0.038, 0.007, major_segs=20, minor_segs=8, center_xyz=(-0.94, -0.70, 1.108))
    add_closed_torus_ring(
        bm_bronze,
        0.040,
        0.008,
        major_segs=20,
        minor_segs=8,
        center_xyz=(latch_x, 0.44, 1.32),
        rot_euler=(math.pi * 0.5, 0.0, 0.0),
    )
    create_mesh_object(scene, f"Articulated_{beat_tag}_DoorsAndIkRig", bm_bronze, mat_bronze, smooth=True, weighted_normals=True)

    # 4. Coupled Floor Shadow Drift Masks flanking the illuminated slit corridor
    bm_shadow = bmesh.new()
    corridor_half = slit_width_m * 0.52
    flank_w = max(0.18, 1.24 - corridor_half)
    for side in (-1.0, 1.0):
        cx = side * (corridor_half + flank_w * 0.5)
        add_beveled_box(
            bm_shadow,
            (flank_w, shadow_reach_m, 0.018),
            (cx, 0.48 - shadow_reach_m * 0.5, 0.189),
            0.004,
            segments=2,
        )
    create_mesh_object(scene, f"ShadowDrift_{beat_tag}_UmbraMask", bm_shadow, mat_shadow, smooth=False, weighted_normals=True)

    # 5. Volumetric God-Ray Slit Light-Shaft Frustum (exact untwisted 6-quad trapezoidal light curtain)
    bm_ray = bmesh.new()
    top_hw = max(0.08, slit_width_m * 0.46)
    bot_hw = max(0.16, slit_width_m * 0.68)
    verts_ray = [
        bm_ray.verts.new((-bot_hw, -0.56, 0.20)),
        bm_ray.verts.new((bot_hw, -0.56, 0.20)),
        bm_ray.verts.new((bot_hw, -0.32, 0.20)),
        bm_ray.verts.new((-bot_hw, -0.32, 0.20)),
        bm_ray.verts.new((-top_hw, 0.44, 2.38)),
        bm_ray.verts.new((top_hw, 0.44, 2.38)),
        bm_ray.verts.new((top_hw, 0.52, 2.38)),
        bm_ray.verts.new((-top_hw, 0.52, 2.38)),
    ]
    for quad in (
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ):
        bm_ray.faces.new([verts_ray[i] for i in quad])
    bmesh.ops.recalc_face_normals(bm_ray, faces=list(bm_ray.faces))
    bmesh.ops.bevel(
        bm_ray,
        geom=list(bm_ray.edges),
        offset=0.012,
        segments=2,
        profile=0.5,
        affect="EDGES",
    )
    ray_obj = create_mesh_object(scene, f"Volumetric_{beat_tag}_GodRaySlit", bm_ray, mat_godray, smooth=True, weighted_normals=True)
    ray_obj["slit_width_m"] = slit_width_m
    ray_obj["beam_spread_deg"] = beam_spread_deg
    ray_obj["shadow_reach_m"] = shadow_reach_m
    return {
        "openRatio": clamped,
        "slitWidthM": slit_width_m,
        "leafDxM": leaf_dx,
        "shadowReachM": shadow_reach_m,
        "beamSpreadDeg": beam_spread_deg,
    }


ASSET_SPECS_V21: list[tuple[str, str, str, str, str, float, str, tuple[float, float, float]]] = [
    (
        "webtoon-slit-godray-threshold-15pct-v21",
        "도입 15% 칼날 슬릿 고드레이·장거리 그림자 베이 (V21)",
        "Beat 1 (15%) Razor Slit God-Ray & Long Shadow Bay V21",
        "개폐 15%·0.39m 칼날 역광 슬릿·1.23m 장거리 그림자·1.32m 핸들 IK",
        "15% slit opening, razor god-ray across 1.54m eye-line & long umbra",
        0.15,
        "Beat1_15Pct",
        (1.0, 0.88, 0.62),
    ),
    (
        "webtoon-slit-godray-breakthrough-65pct-v21",
        "전개 65% 확산 프리즘 고드레이·중거리 그림자 베이 (V21)",
        "Beat 2 (65%) Breakthrough Prism God-Ray Bay V21",
        "개폐 65%·1.15m 확산 프리즘 광선·0.94m 중거리 그림자·속도선 동기화",
        "65% breakthrough opening, fanned prism god-ray & mid shadow drift",
        0.65,
        "Beat2_65Pct",
        (0.96, 0.92, 0.78),
    ),
    (
        "webtoon-slit-godray-climax-100pct-v21",
        "클라이맥스 100% 전면 할로 역광·실루엣 베이 (V21)",
        "Beat 3 (100%) Climax Halo Flood & Silhouette Bay V21",
        "개폐 100%·1.68m 전면 할로 역광·0.74m 림 그림자·2.4m 전신 실루엣",
        "100% full opening, wide volumetric halo flood & hero silhouette frame",
        1.0,
        "Beat3_100Pct",
        (0.76, 0.94, 1.0),
    ),
]


def render_v21_thumbnail(scene: bpy.types.Scene, mesh_objs: list[bpy.types.Object], out_png: Path, key_col: tuple[float, float, float]) -> None:
    center, radius = compute_scene_bounds(mesh_objs)
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene.eevee, "use_raytracing"):
        scene.eevee.use_raytracing = True
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("ThumbWorldV21")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.09, 0.09, 0.11), 1.0)
        bg.inputs[1].default_value = 0.90
    scene.world = world

    cam_data = bpy.data.cameras.new("ThumbCamV21")
    cam_data.lens = 50.0
    cam_obj = bpy.data.objects.new("ThumbCamV21", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.28
    cam_obj.location = center + Vector((dist * 0.36, -dist * 1.05, dist * 0.25))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("V21BackSlitKey", 860.0, key_col, (0.0, radius * 2.2, radius * 2.1)),
        ("V21FrontFill", 320.0, (0.86, 0.90, 0.96), (-radius * 1.9, -radius * 1.8, radius * 1.5)),
        ("V21AccentRim", 540.0, key_col, (radius * 1.8, -radius * 1.6, radius * 2.0)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy * max(0.5, (radius / 1.1) ** 2)
        ldata.color = color
        ldata.size = radius * 1.5
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


def run_v21_pipeline() -> dict[str, object]:
    before_digests = snapshot_preserved_scenes()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith("V21_") and mat.users == 0:
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("SlitGodRayV21_Export") or bpy.data.scenes.new("SlitGodRayV21_Export")
    export_scene.unit_settings.system = "METRIC"
    export_scene.unit_settings.scale_length = 1.0
    win = bpy.context.window if bpy.context.window is not None else None
    prev_scene = win.scene if win is not None else None
    if win is not None:
        win.scene = export_scene

    manifest: list[dict[str, object]] = []
    blender_ver = bpy.app.version_string
    for slug, label_ko, label_en, desc_ko, desc_en, open_ratio, beat_tag, tint in ASSET_SPECS_V21:
        clear_only_scene(export_scene)
        kinematics = build_slit_godray_sequence_bay(export_scene, open_ratio, beat_tag, tint)
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
        render_v21_thumbnail(export_scene, mesh_objs, thumb_path, key_col=tint)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["sequence_open_ratio"] = open_ratio
        root["slit_width_m"] = kinematics["slitWidthM"]
        root["shadow_reach_m"] = kinematics["shadowReachM"]
        root["asset_generator"] = "scripts/blender/generate_slit_godray_sequence_v21.py"
        root["asset_license"] = "CC0-1.0"
        root["blender_version"] = blender_ver
        root["units"] = "metres"
        export_scene.collection.objects.link(root)
        for obj in mesh_objs:
            if obj.parent is None:
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
                "openRatio": open_ratio,
                "slitWidthM": kinematics["slitWidthM"],
                "shadowReachM": kinematics["shadowReachM"],
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

    # Stage isolated 3-Beat Slit God-Ray Sequence Live Scene (15% -> 65% -> 100%)
    seq_scene = bpy.data.scenes.get(TARGET_LIVE_SCENE) or bpy.data.scenes.new(TARGET_LIVE_SCENE)
    seq_scene.unit_settings.system = "METRIC"
    seq_scene.unit_settings.scale_length = 1.0
    seq_scene.render.engine = "BLENDER_EEVEE"
    if hasattr(seq_scene.eevee, "use_raytracing"):
        seq_scene.eevee.use_raytracing = True
    if win is not None:
        win.scene = seq_scene

    clear_only_scene(seq_scene)
    mat_stage = make_lumiere_mat("V21_StageDarkroom", (0.10, 0.10, 0.12), roughness=0.35, coat_weight=0.44)
    mat_rail = make_lumiere_mat("V21_StageSequenceBrass", (0.88, 0.72, 0.38), roughness=0.18, metallic=1.0)

    bm_stage = bmesh.new()
    add_beveled_box(bm_stage, (10.6, 4.2, 0.10), (0.0, 0.0, -0.05), 0.012, segments=2)
    create_mesh_object(seq_scene, "SlitSequence_Gallery_Floor", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_rail = bmesh.new()
    add_beveled_box(bm_rail, (10.0, 0.032, 0.02), (0.0, -0.92, 0.005), 0.004, segments=2)
    create_mesh_object(seq_scene, "SlitSequence_Timeline_Rail", bm_rail, mat_rail, smooth=True, weighted_normals=True)

    for grp_name, open_r, tag, tint, loc, rot_z in (
        ("SequenceBeat1_15Pct_Slit", 0.15, "LiveBeat1", (1.0, 0.88, 0.62), (-3.32, 0.14, 0.0), 0.10),
        ("SequenceBeat2_65Pct_Breakthrough", 0.65, "LiveBeat2", (0.96, 0.92, 0.78), (0.0, 0.22, 0.0), 0.0),
        ("SequenceBeat3_100Pct_Climax", 1.00, "LiveBeat3", (0.76, 0.94, 1.0), (3.32, 0.14, 0.0), -0.10),
    ):
        before = set(seq_scene.objects)
        build_slit_godray_sequence_bay(seq_scene, open_r, tag, tint)
        created = [o for o in seq_scene.objects if o not in before and o.type == "MESH"]
        min_z = min((o.matrix_world @ Vector(c)).z for o in created for c in o.bound_box)
        grp = bpy.data.objects.new(grp_name, None)
        seq_scene.collection.objects.link(grp)
        for o in created:
            if o.parent is None:
                o.location.z -= min_z
                o.parent = grp
        grp.location = loc
        grp.rotation_euler = (0.0, 0.0, rot_z)

    target = Vector((0.0, 0.12, 1.38))
    for lname, energy, color, lpos in (
        ("Beat1_AmberSlitBack_3200K", 1900.0, (1.0, 0.88, 0.64), (-3.6, 4.2, 4.2)),
        ("Beat2_ChampagneSlitBack_4800K", 2050.0, (1.0, 0.95, 0.84), (0.0, 4.4, 4.4)),
        ("Beat3_CyanHaloBack_8600K", 2150.0, (0.72, 0.94, 1.0), (3.6, 4.2, 4.2)),
        ("Sequence_DarkroomFrontFill_5400K", 1320.0, (0.92, 0.94, 0.98), (0.0, -4.8, 3.8)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.color = color
        ldata.size = 3.6
        lobj = bpy.data.objects.new(lname, ldata)
        seq_scene.collection.objects.link(lobj)
        lobj.location = Vector(lpos)
        lobj.rotation_euler = (target - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()

    s_world = bpy.data.worlds.get("SlitSequenceWorldV21") or bpy.data.worlds.new("SlitSequenceWorldV21")
    s_world.use_nodes = True
    bg = s_world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.07, 0.07, 0.09), 1.0)
        bg.inputs[1].default_value = 0.86
    seq_scene.world = s_world

    cdata = bpy.data.cameras.new("SlitSequenceCam42mm")
    cdata.lens = 42.0
    cam = bpy.data.objects.new("SlitSequenceCam42mm", cdata)
    seq_scene.collection.objects.link(cam)
    seq_scene.camera = cam
    cam.location = Vector((0.0, -10.05, 2.40))
    cam.rotation_euler = (target - cam.location).normalized().to_track_quat("-Z", "Y").to_euler()

    if win is not None and bpy.context.screen is not None:
        for area in bpy.context.screen.areas:
            if area.type == "VIEW_3D":
                for space in area.spaces:
                    if space.type == "VIEW_3D":
                        space.shading.type = "RENDERED"
                        space.overlay.show_overlays = False
                        if space.region_3d is not None:
                            space.region_3d.view_perspective = "CAMERA"

    bpy.context.view_layer.update()

    after_digests = snapshot_preserved_scenes()
    verified_preserved: list[dict[str, object]] = []
    zero_mutation = True
    for s_name, before_info in before_digests.items():
        after_info = after_digests.get(s_name)
        unchanged = after_info is not None and after_info["sha256"] == before_info["sha256"]
        if not unchanged:
            zero_mutation = False
        verified_preserved.append(
            {
                "sceneName": s_name,
                "objectCount": before_info["objectCount"],
                "sha256Before": before_info["sha256"],
                "sha256After": after_info["sha256"] if after_info else None,
                "unchanged": unchanged,
            }
        )
    if not zero_mutation:
        raise RuntimeError(f"Scene isolation guard failed: {verified_preserved}")

    isolation_audit = {
        "activeIsolatedScene": TARGET_LIVE_SCENE,
        "zeroCrossSceneMutation": zero_mutation,
        "preservedScenes": verified_preserved,
    }

    prov = {
        "schema": "toonstudio.blender-slit-godray-sequence.v21",
        "createdAt": "2026-11-18",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {blender_ver} (scripts/blender/generate_slit_godray_sequence_v21.py · Slit God-Ray & Shadow Drift SHA-256 verified)",
        "tool": f"Blender {blender_ver}",
        "blenderVersion": blender_ver,
        "units": "meter",
        "upAxis": "Y",
        "sequenceBeats": [15, 65, 100],
        "externalSources": [],
        "sceneIsolationAudit": isolation_audit,
        "files": [
            {
                "file": m["file"],
                "openRatio": m["openRatio"],
                "slitWidthM": m["slitWidthM"],
                "shadowReachM": m["shadowReachM"],
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
        "# ToonStudio Blender 5.3 Slit God-Ray & Shadow Drift Sequence Kit V21 — 라이선스 및 시퀀스 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_slit_godray_sequence_v21.py`, Blender {blender_ver})\n"
        "- 시퀀스 구성: `15%`(칼날 슬릿 역광) · `65%`(확산 프리즘 돌파) · `100%`(전면 할로 실루엣)\n"
        "- 검증: 매니폴드 결함 0건 · 보존 씬 6종 SHA-256 무손실 격리 검증 완료\n\n"
        "## 포함 파일 목록 (총 3종)\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return {"exported": manifest, "sceneIsolationAudit": isolation_audit}


if __name__ == "__main__":
    print(json.dumps(run_v21_pipeline(), indent=2, ensure_ascii=False))
