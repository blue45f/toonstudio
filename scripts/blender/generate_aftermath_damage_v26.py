"""ToonStudio 3-Stage Prop Damage & Aftermath States (Intact → Cracked → Shattered) Pack V26 — Blender 5.3.0 생성기 & 기존 씬 SHA-256 격리 검증기.

전투·감정 격화 직전 정적(Intact 0%)부터 균열·집기 전도(Cracked 50%), 파편 비산·충격흔(Shattered 100%)까지
공통 건축 기준선(2.76m 기단 · 2.40m 상인방 · 1.10m 난간 · 0.74m 테이블 · 0.18m 단차) 위에서 1:1 교체되는 수밀 CC0-1.0 에셋 3종을 생성한다:
1) `webtoon-aftermath-intact-salon-table-v26.glb` — 온전(0%) 정적 살롱 다과 테이블·반사창 베이 (3200K)
2) `webtoon-aftermath-cracked-fissure-bay-v26.glb` — 균열(50%) 스파이더웹 유리 금·전도 의자·파편 14개 베이 (5200K)
3) `webtoon-aftermath-shattered-tempest-ruin-v26.glb` — 파열(100%) 비산 프리즘 파편 28개·전복 테이블·충격 크레이터 베이 (8600K)
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from generate_artisan_atelier_v15 import compute_scene_bounds, ground_scene_meshes  # noqa: E402
from generate_atmospheric_bokeh_dof_v22 import add_atmospheric_bokeh_layer  # noqa: E402
from generate_episode_handoff_v18 import compute_scene_isolation_digest  # noqa: E402
from generate_lumiere_atelier_v16 import make_lumiere_mat, srgb  # noqa: E402
from generate_lumiere_salon_v17 import (  # noqa: E402
    audit_evaluated_mesh_defects,
    clear_only_scene,
    sha256_file,
)
from generate_slit_godray_sequence_v21 import build_slit_godray_sequence_bay  # noqa: E402
from generate_weather_occlusion_v24 import add_datum_occluded_weather_and_ripples  # noqa: E402
from generate_wind_drape_reflection_v25 import add_wind_drape_and_half_mirror_pass  # noqa: E402
from generate_zdepth_sfx_crowd_tod_v23 import add_zdepth_3d_sfx_stamp  # noqa: E402
from modeler_kit_v13_primitives import (  # noqa: E402
    add_beveled_box,
    add_lathe_solid,
    create_mesh_object,
)

ROOT = SCRIPT_DIR.parents[1]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-aftermath-damage-v26"
THUMB_DIR = OUTPUT_DIR / "thumbnails"
TARGET_LIVE_SCENE = "ToonStudio_Aftermath_Damage_V26"


def snapshot_preserved_scenes() -> dict[str, dict[str, object]]:
    return {
        s.name: compute_scene_isolation_digest(s)
        for s in bpy.data.scenes
        if s.name not in (TARGET_LIVE_SCENE, "AftermathV26_Export")
    }


def _add_oriented_beveled_box(
    bm: bmesh.types.BMesh,
    size_xyz: tuple[float, float, float],
    center_xyz: tuple[float, float, float],
    rot_euler_rad: tuple[float, float, float],
    bevel: float = 0.004,
) -> None:
    """독립된 닫힌 2-매니폴드 챔퍼 박스를 원점에서 생성한 뒤 회전·이동시킨다."""
    bm.verts.ensure_lookup_table()
    start_idx = len(bm.verts)
    add_beveled_box(bm, size_xyz, (0.0, 0.0, 0.0), bevel, segments=1)
    bm.verts.ensure_lookup_table()
    new_verts = bm.verts[start_idx:]
    if any(abs(a) > 1e-6 for a in rot_euler_rad):
        bmesh.ops.rotate(
            bm,
            cent=(0.0, 0.0, 0.0),
            matrix=Euler(rot_euler_rad, "XYZ").to_matrix(),
            verts=new_verts,
        )
    bmesh.ops.translate(bm, vec=Vector(center_xyz), verts=new_verts)


def add_prop_aftermath_damage_pass(
    scene: bpy.types.Scene,
    stage_id: str,
    beat_tag: str,
    furniture_srgb: tuple[float, float, float],
    shard_srgb: tuple[float, float, float],
) -> dict[str, int]:
    """0.74m 기준선 살롱 테이블·의자·성배와 3단계 파손(0% / 50% / 100%) 유리·석재 파편 및 충격흔을 생성한다."""
    mat_furn = make_lumiere_mat(
        f"V26_{beat_tag}_SalonFurniture",
        furniture_srgb,
        roughness=0.28,
        metallic=0.22,
        coat_weight=0.45,
    )
    mat_shard = make_lumiere_mat(
        f"V26_{beat_tag}_PrismAftermathShards",
        shard_srgb,
        roughness=0.06,
        metallic=0.12,
        coat_weight=1.0,
        emission_srgb=shard_srgb,
        emission_strength=0.48 if stage_id != "intact" else 0.12,
    )

    bm_furn = bmesh.new()
    if stage_id == "intact":
        # Upright 0.74m datum table + 4 legs + 2 upright chairs + upright chalice
        _add_oriented_beveled_box(bm_furn, (0.86, 0.48, 0.036), (0.0, -0.18, 0.722), (0.0, 0.0, 0.0), 0.005)
        for sx in (-0.36, 0.36):
            for sy in (-0.36, 0.0):
                _add_oriented_beveled_box(bm_furn, (0.042, 0.042, 0.52), (sx, sy, 0.44), (0.0, 0.0, 0.0), 0.004)
        for side in (-1.0, 1.0):
            cx = side * 0.68
            _add_oriented_beveled_box(bm_furn, (0.38, 0.38, 0.034), (cx, -0.18, 0.46), (0.0, 0.0, 0.0), 0.004)
            _add_oriented_beveled_box(bm_furn, (0.04, 0.38, 0.42), (cx + side * 0.17, -0.18, 0.69), (0.0, 0.0, 0.0), 0.004)
        add_lathe_solid(
            bm_furn,
            [(0.006, 0.742), (0.055, 0.748), (0.018, 0.80), (0.064, 0.88), (0.006, 0.89)],
            segments=12,
            center_xyz=(0.0, -0.18, 0.0),
        )
        shard_count = 0
    elif stage_id == "cracked":
        # Slightly shifted table (-4 deg yaw) + left chair upright + right chair tipped (-22 deg) + scattered papers
        _add_oriented_beveled_box(bm_furn, (0.86, 0.48, 0.036), (-0.04, -0.18, 0.722), (0.0, 0.0, 0.07), 0.005)
        for sx in (-0.38, 0.32):
            for sy in (-0.36, 0.0):
                _add_oriented_beveled_box(bm_furn, (0.042, 0.042, 0.52), (sx, sy, 0.44), (0.0, 0.0, 0.07), 0.004)
        _add_oriented_beveled_box(bm_furn, (0.38, 0.38, 0.034), (-0.68, -0.18, 0.46), (0.0, 0.0, -0.08), 0.004)
        _add_oriented_beveled_box(bm_furn, (0.38, 0.38, 0.034), (0.72, -0.16, 0.34), (0.38, -0.28, 0.22), 0.004)
        _add_oriented_beveled_box(bm_furn, (0.04, 0.38, 0.42), (0.88, -0.16, 0.48), (0.38, -0.28, 0.22), 0.004)
        shard_count = 14
    else:
        # Shattered 100%: Overturned table & chairs + impact floor ring segments
        _add_oriented_beveled_box(bm_furn, (0.86, 0.48, 0.036), (-0.28, -0.22, 0.42), (0.92, 0.24, -0.35), 0.005)
        _add_oriented_beveled_box(bm_furn, (0.38, 0.38, 0.034), (-0.82, -0.26, 0.28), (-1.12, 0.32, 0.40), 0.004)
        _add_oriented_beveled_box(bm_furn, (0.38, 0.38, 0.034), (0.80, -0.20, 0.30), (1.08, -0.36, -0.44), 0.004)
        for k in range(8):
            ang = (k / 8.0) * math.tau
            rx = math.cos(ang) * 0.52
            ry = -0.16 + math.sin(ang) * 0.38
            _add_oriented_beveled_box(bm_furn, (0.18, 0.055, 0.026), (rx, ry, 0.195), (0.08, -0.06, ang), 0.003)
        shard_count = 28

    furn_obj = create_mesh_object(
        scene,
        f"Aftermath_{beat_tag}_DatumProps",
        bm_furn,
        mat_furn,
        smooth=True,
        weighted_normals=True,
    )
    furn_obj["aftermath_stage"] = stage_id
    furn_obj["psd_layer_tag"] = f"BG_Mid_AftermathProps_{stage_id}"

    bm_shards = bmesh.new()
    if shard_count == 0:
        # Pristine crystalline centerpiece prism on table
        add_lathe_solid(
            bm_shards,
            [(0.004, 0.892), (0.044, 0.93), (0.026, 0.99), (0.004, 1.02)],
            segments=8,
            center_xyz=(0.0, -0.18, 0.0),
        )
    else:
        for idx in range(shard_count):
            t = idx / max(1, shard_count - 1)
            ang = idx * 2.39996
            if stage_id == "cracked":
                # Spiderweb fracture ribs near glazing + small floor chips
                if idx < 8:
                    sx = (-1.0 if idx % 2 == 0 else 1.0) * (0.86 + 0.12 * (idx % 3))
                    sz = 0.92 + 0.16 * idx
                    _add_oriented_beveled_box(
                        bm_shards,
                        (0.22, 0.014, 0.018),
                        (sx, 0.83, sz),
                        (0.0, 0.42 * (idx - 3.5), 0.12),
                        0.002,
                    )
                else:
                    fx = math.cos(ang) * (0.28 + 0.44 * t)
                    fy = -0.26 + math.sin(ang) * 0.28
                    _add_oriented_beveled_box(
                        bm_shards,
                        (0.09, 0.06, 0.014),
                        (fx, fy, 0.192),
                        (0.04, -0.05, ang),
                        0.002,
                    )
            else:
                # Dynamic outward-bursting glass & mana shards suspended across mid/foreground
                rad = 0.26 + 0.92 * t
                sx = math.cos(ang) * rad
                sy = 0.42 - 0.88 * t + math.sin(ang * 0.5) * 0.14
                sz = 0.28 + 1.56 * ((idx * 7) % 13) / 12.0
                _add_oriented_beveled_box(
                    bm_shards,
                    (0.14 + 0.06 * (idx % 3), 0.018, 0.065 + 0.03 * (idx % 2)),
                    (sx, sy, sz),
                    (ang * 0.37, ang * 0.51, ang),
                    0.002,
                )

    shard_obj = create_mesh_object(
        scene,
        f"Aftermath_{beat_tag}_PrismShards",
        bm_shards,
        mat_shard,
        smooth=True,
        weighted_normals=True,
    )
    shard_obj["debris_shard_count"] = shard_count
    shard_obj["psd_layer_tag"] = f"FX_FG_AftermathShards_{shard_count}"

    return {
        "damagePct": 0 if stage_id == "intact" else (50 if stage_id == "cracked" else 100),
        "debrisShardCount": shard_count,
    }


ASSET_SPECS_V26 = [
    (
        "webtoon-aftermath-intact-salon-table-v26",
        "온전(0%) 정적 살롱 다과 테이블·반사창 베이 (V26)",
        "Stage 1 (0% Intact · 3200K) Calm Salon Table & Half-Mirror Bay V26",
        "사건 직전 정적(파편 0개)·0.74m 살롱 다과상·온전한 프레넬 반사창",
        "Pre-conflict intact 0.74m salon table, upright chairs & pristine half-mirror pane",
        0.15,
        "intact",
        "petals",
        "creak",
        "snow",
        "velvet",
        3200,
        "V26Stage1_Intact",
        (1.0, 0.86, 0.72),
        (1.0, 0.84, 0.86),
        (1.0, 0.90, 0.84),
        (1.0, 0.92, 0.80),
        (0.24, 0.18, 0.22),
        (0.94, 0.96, 1.0),
        (0.90, 0.94, 1.0),
        (0.56, 0.20, 0.28),
        (0.96, 0.88, 0.84),
        (0.42, 0.28, 0.20),
        (0.96, 0.90, 0.82),
    ),
    (
        "webtoon-aftermath-cracked-fissure-bay-v26",
        "균열(50%) 스파이더웹 유리 금·전도 의자 베이 (V26)",
        "Stage 2 (50% Cracked · 5200K) Spiderweb Glass Fissure & Tipped Chair Bay V26",
        "충돌 직후 균열(50%)·유리창 스파이더웹 금·전도된 의자·바닥 파편 14개",
        "Mid-conflict 50% spiderweb glass fissures, tipped salon chair & 14 debris chips",
        0.65,
        "cracked",
        "dust",
        "chime",
        "rain",
        "linen",
        5200,
        "V26Stage2_Cracked",
        (0.84, 0.90, 0.98),
        (0.86, 0.92, 1.0),
        (0.82, 0.90, 0.98),
        (0.92, 0.96, 1.0),
        (0.16, 0.20, 0.28),
        (0.78, 0.90, 1.0),
        (0.72, 0.88, 1.0),
        (0.82, 0.86, 0.92),
        (0.76, 0.88, 0.98),
        (0.36, 0.34, 0.38),
        (0.84, 0.94, 1.0),
    ),
    (
        "webtoon-aftermath-shattered-tempest-ruin-v26",
        "파열(100%) 비산 프리즘 파편 28개·충격 크레이터 베이 (V26)",
        "Stage 3 (100% Shattered · 8600K) Tempest Prism Shards & Ruined Table Bay V26",
        "절정 파열(100%)·공중 비산 프리즘 파편 28개·전복 테이블·바닥 충격 크레이터",
        "Climax 100% 28 suspended prism shards, overturned 0.74m table & impact crater",
        1.0,
        "shattered",
        "embers",
        "boom",
        "storm",
        "silk",
        8600,
        "V26Stage3_Shattered",
        (0.60, 0.88, 1.0),
        (0.44, 0.92, 1.0),
        (0.58, 0.92, 1.0),
        (0.52, 0.95, 1.0),
        (0.10, 0.18, 0.28),
        (0.68, 0.92, 1.0),
        (0.54, 0.90, 1.0),
        (0.28, 0.64, 0.88),
        (0.62, 0.90, 1.0),
        (0.24, 0.28, 0.36),
        (0.56, 0.94, 1.0),
    ),
]


def render_v26_thumbnail(
    scene: bpy.types.Scene,
    mesh_objs: list[bpy.types.Object],
    out_png: Path,
    key_col: tuple[float, float, float],
    f_stop: float,
    kelvin: int,
) -> None:
    center, radius = compute_scene_bounds(mesh_objs)
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene.eevee, "use_raytracing"):
        scene.eevee.use_raytracing = True
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("ThumbWorldV26")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        if kelvin <= 4200:
            bg.inputs[0].default_value = (*srgb(0.09, 0.08, 0.10), 1.0)
        elif kelvin >= 7500:
            bg.inputs[0].default_value = (*srgb(0.05, 0.08, 0.12), 1.0)
        else:
            bg.inputs[0].default_value = (*srgb(0.07, 0.09, 0.11), 1.0)
        bg.inputs[1].default_value = 0.92
    scene.world = world

    cam_data = bpy.data.cameras.new("ThumbCamV26")
    cam_data.lens = 52.0
    if hasattr(cam_data, "dof"):
        cam_data.dof.use_dof = True
        cam_data.dof.aperture_fstop = f_stop
    cam_obj = bpy.data.objects.new("ThumbCamV26", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.26
    cam_obj.location = center + Vector((dist * 0.26, -dist * 1.06, dist * 0.24))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    if hasattr(cam_data, "dof"):
        cam_data.dof.focus_distance = (center - cam_obj.location).length
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("V26AftermathKey", 980.0, key_col, (0.0, radius * 2.2, radius * 2.0)),
        ("V26AftermathFill", 390.0, (0.90, 0.92, 0.98), (-radius * 1.8, -radius * 1.8, radius * 1.5)),
        ("V26ShardRim", 660.0, key_col, (radius * 1.8, -radius * 1.5, radius * 2.0)),
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


def run_v26_pipeline() -> dict[str, object]:
    before_digests = snapshot_preserved_scenes()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith(("V21_V26", "V22_V26", "V23_V26", "V24_V26", "V25_V26", "V26_")) and mat.users == 0:
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("AftermathV26_Export") or bpy.data.scenes.new("AftermathV26_Export")
    export_scene.unit_settings.system = "METRIC"
    export_scene.unit_settings.scale_length = 1.0
    win = bpy.context.window if bpy.context.window is not None else None
    prev_scene = win.scene if win is not None else None
    if win is not None:
        win.scene = export_scene

    manifest: list[dict[str, object]] = []
    blender_ver = bpy.app.version_string
    for (
        slug,
        label_ko,
        label_en,
        desc_ko,
        desc_en,
        open_r,
        stage_id,
        mote_style,
        sfx_mode,
        weather_mode,
        fabric_style,
        kelvin,
        tag,
        beam_c,
        mote_c,
        bokeh_c,
        sfx_fill_c,
        sfx_rim_c,
        precip_c,
        ripple_c,
        drape_c,
        mirror_c,
        furn_c,
        shard_c,
    ) in ASSET_SPECS_V26:
        clear_only_scene(export_scene)
        build_slit_godray_sequence_bay(export_scene, open_r, tag, beam_c)
        dof_meta = add_atmospheric_bokeh_layer(export_scene, open_r, mote_style, tag, mote_c, bokeh_c)
        add_zdepth_3d_sfx_stamp(export_scene, sfx_mode, tag, sfx_fill_c, sfx_rim_c)
        add_datum_occluded_weather_and_ripples(export_scene, open_r, weather_mode, tag, precip_c, ripple_c)
        add_wind_drape_and_half_mirror_pass(export_scene, open_r, fabric_style, tag, drape_c, mirror_c)
        dmg_meta = add_prop_aftermath_damage_pass(export_scene, stage_id, tag, furn_c, shard_c)
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
        render_v26_thumbnail(export_scene, mesh_objs, thumb_path, key_col=beam_c, f_stop=dof_meta["fStop"], kelvin=kelvin)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["aftermath_stage"] = stage_id
        root["damage_pct"] = dmg_meta["damagePct"]
        root["debris_shard_count"] = dmg_meta["debrisShardCount"]
        root["asset_generator"] = "scripts/blender/generate_aftermath_damage_v26.py"
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
                "aftermathStage": stage_id,
                "damagePct": dmg_meta["damagePct"],
                "debrisShardCount": dmg_meta["debrisShardCount"],
                "openRatio": open_r,
                "kelvin": kelvin,
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

    # Stage isolated V26 3-Stage Prop Damage & Aftermath Showcase Scene
    v26_scene = bpy.data.scenes.get(TARGET_LIVE_SCENE) or bpy.data.scenes.new(TARGET_LIVE_SCENE)
    v26_scene.unit_settings.system = "METRIC"
    v26_scene.unit_settings.scale_length = 1.0
    v26_scene.render.engine = "BLENDER_EEVEE"
    if hasattr(v26_scene.eevee, "use_raytracing"):
        v26_scene.eevee.use_raytracing = True
    if win is not None:
        win.scene = v26_scene

    clear_only_scene(v26_scene)
    mat_stage = make_lumiere_mat("V26_StageDarkroom", (0.08, 0.09, 0.11), roughness=0.25, coat_weight=0.60)
    mat_rail = make_lumiere_mat("V26_StageBrassDatum", (0.88, 0.72, 0.38), roughness=0.18, metallic=1.0)

    bm_stage = bmesh.new()
    add_beveled_box(bm_stage, (11.2, 4.6, 0.10), (0.0, 0.0, -0.05), 0.012, segments=2)
    create_mesh_object(v26_scene, "AftermathV26_Gallery_Floor", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_rail = bmesh.new()
    add_beveled_box(bm_rail, (10.6, 0.032, 0.02), (0.0, -0.96, 0.005), 0.004, segments=2)
    create_mesh_object(v26_scene, "AftermathV26_DatumContinuity_Rail", bm_rail, mat_rail, smooth=True, weighted_normals=True)

    live_zones = [
        ("V26Zone1_Intact_0pct", ASSET_SPECS_V26[0], "LiveV26_1", (-3.42, 0.14, 0.0), 0.10),
        ("V26Zone2_Cracked_50pct", ASSET_SPECS_V26[1], "LiveV26_2", (0.0, 0.22, 0.0), 0.0),
        ("V26Zone3_Shattered_100pct", ASSET_SPECS_V26[2], "LiveV26_3", (3.42, 0.14, 0.0), -0.10),
    ]
    for grp_name, spec, tag, loc, rot_z in live_zones:
        (
            _slug,
            _lko,
            _len,
            _dko,
            _den,
            open_r,
            stage_id,
            mote_s,
            sfx_m,
            weather_m,
            fabric_s,
            _kelvin,
            _stag,
            beam_c,
            mote_c,
            bokeh_c,
            sfx_fill_c,
            sfx_rim_c,
            precip_c,
            ripple_c,
            drape_c,
            mirror_c,
            furn_c,
            shard_c,
        ) = spec
        before = set(v26_scene.objects)
        build_slit_godray_sequence_bay(v26_scene, open_r, tag, beam_c)
        add_atmospheric_bokeh_layer(v26_scene, open_r, mote_s, tag, mote_c, bokeh_c)
        add_zdepth_3d_sfx_stamp(v26_scene, sfx_m, tag, sfx_fill_c, sfx_rim_c)
        add_datum_occluded_weather_and_ripples(v26_scene, open_r, weather_m, tag, precip_c, ripple_c)
        add_wind_drape_and_half_mirror_pass(v26_scene, open_r, fabric_s, tag, drape_c, mirror_c)
        add_prop_aftermath_damage_pass(v26_scene, stage_id, tag, furn_c, shard_c)
        created = [o for o in v26_scene.objects if o not in before and o.type == "MESH"]
        min_z = min((o.matrix_world @ Vector(c)).z for o in created for c in o.bound_box)
        grp = bpy.data.objects.new(grp_name, None)
        v26_scene.collection.objects.link(grp)
        for o in created:
            if o.parent is None:
                o.location.z -= min_z
                o.parent = grp
        grp.location = loc
        grp.rotation_euler = (0.0, 0.0, rot_z)

    target = Vector((0.0, 0.08, 1.38))
    for lname, energy, color, lpos in (
        ("Aftermath_Intact_3200K", 2050.0, (1.0, 0.88, 0.74), (-3.6, 4.2, 4.3)),
        ("Aftermath_Cracked_5200K", 2150.0, (0.84, 0.92, 1.0), (0.0, 4.4, 4.2)),
        ("Aftermath_Shattered_8600K", 2320.0, (0.60, 0.90, 1.0), (3.6, 4.2, 4.3)),
        ("Aftermath_DarkroomFill_5400K", 1420.0, (0.92, 0.94, 0.98), (0.0, -5.0, 3.8)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.color = color
        ldata.size = 3.6
        lobj = bpy.data.objects.new(lname, ldata)
        v26_scene.collection.objects.link(lobj)
        lobj.location = Vector(lpos)
        lobj.rotation_euler = (target - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()

    v_world = bpy.data.worlds.get("AftermathWorldV26") or bpy.data.worlds.new("AftermathWorldV26")
    v_world.use_nodes = True
    bg = v_world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.06, 0.07, 0.09), 1.0)
        bg.inputs[1].default_value = 0.88
    v26_scene.world = v_world

    cdata = bpy.data.cameras.new("AftermathStageCam46mm")
    cdata.lens = 46.0
    if hasattr(cdata, "dof"):
        cdata.dof.use_dof = True
        cdata.dof.aperture_fstop = 2.6
        cdata.dof.focus_distance = 10.45
    cam = bpy.data.objects.new("AftermathStageCam46mm", cdata)
    v26_scene.collection.objects.link(cam)
    v26_scene.camera = cam
    cam.location = Vector((0.0, -10.45, 2.38))
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
        "schema": "toonstudio.blender-aftermath-damage.v26",
        "createdAt": "2026-11-18",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {blender_ver} (scripts/blender/generate_aftermath_damage_v26.py · 3-Stage Prop Damage & Aftermath SHA-256 verified)",
        "tool": f"Blender {blender_ver}",
        "blenderVersion": blender_ver,
        "units": "meter",
        "upAxis": "Y",
        "aftermathDamageSpec": {
            "datumTableHeightM": 0.74,
            "stages": ["intact_0pct", "cracked_50pct", "shattered_100pct"],
            "debrisShardCounts": [0, 14, 28],
        },
        "externalSources": [],
        "sceneIsolationAudit": isolation_audit,
        "files": [
            {
                "file": m["file"],
                "aftermathStage": m["aftermathStage"],
                "damagePct": m["damagePct"],
                "debrisShardCount": m["debrisShardCount"],
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
        f"- `{m['file']}` — {m['labelKo']} ({m['triangles']} tris, 파손 {m['damagePct']}%, 파편 {m['debrisShardCount']}개, SHA-256 `{m['sha256']}`)"
        for m in sorted(manifest, key=lambda r: str(r["file"]))
    )
    (OUTPUT_DIR / "LICENSES.md").write_text(
        "# ToonStudio Blender 5.3 3-Stage Prop Damage & Aftermath Kit V26 — 라이선스 및 규격 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_aftermath_damage_v26.py`, Blender {blender_ver})\n"
        "- 파손·흔적 단계: `Intact (0%)` → `Cracked (50%, 파편 14개)` → `Shattered (100%, 파편 28개)` 수밀 교체 파츠\n"
        "- 연동 규격: 대사 주변 배경 선화 자동 감쇠 · 독자 가독성(야간 OLED/색각 이상) · `.toonsubs.vtt` 다국어 자막 큐시트\n"
        "- 검증: 매니폴드 결함 0건 · 보존 씬 SHA-256 무손실 격리 검증 완료\n\n"
        "## 포함 파일 목록 (총 3종)\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return {"exported": manifest, "sceneIsolationAudit": isolation_audit}


if __name__ == "__main__":
    print(json.dumps(run_v26_pipeline(), indent=2, ensure_ascii=False))
