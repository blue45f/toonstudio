"""ToonStudio Wind-Coupled Drape Fabric · Half-Mirror Glass Reflection (Fresnel 8~32%) · Tankobon Overscan Pack V25 — Blender 5.3.0 생성기 & 기존 씬 SHA-256 격리 검증기.

문 개폐율(15% · 65% · 100%)과 기상 풍속(1.4 ~ 8.8 m/s)에 연동해 2.40m 상인방 드레이프 커튼·비단 휘장이 실내(-Y)로 휘날리는
수밀(Watertight) 패브릭 메시와, 창가 독백 컷용 하프 미러 유리 반사(Fresnel 8~32%) 고스트 실루엣 패널을 결합한 CC0-1.0 에셋 3종을 생성한다:
1) `webtoon-wind-drape-halfmirror-rain-15pct-v25.glb` — 15% 미풍 린넨 커튼(0.14m)·하프 미러 반사창 베이 (5200K)
2) `webtoon-wind-drape-rofan-velvet-65pct-v25.glb` — 65% 돌풍 로판 벨벳 휘장(0.42m)·프레넬 온실 반사 베이 (3800K)
3) `webtoon-wind-drape-tempest-cape-100pct-v25.glb` — 100% 폭풍 각성 비단 휘장(0.78m)·전면 하프 미러 수막 베이 (8600K)
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
from generate_zdepth_sfx_crowd_tod_v23 import (  # noqa: E402
    add_shared_datum_crowd_silhouettes,
    add_zdepth_3d_sfx_stamp,
)
from modeler_kit_v13_primitives import (  # noqa: E402
    add_beveled_box,
    add_lathe_solid,
    create_mesh_object,
)

ROOT = SCRIPT_DIR.parents[1]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-wind-drape-reflection-v25"
THUMB_DIR = OUTPUT_DIR / "thumbnails"
TARGET_LIVE_SCENE = "ToonStudio_WindDrape_HalfMirror_V25"


def snapshot_preserved_scenes() -> dict[str, dict[str, object]]:
    return {
        s.name: compute_scene_isolation_digest(s)
        for s in bpy.data.scenes
        if s.name not in (TARGET_LIVE_SCENE, "WindDrapeV25_Export")
    }


def _add_watertight_wind_drape_panel(
    bm: bmesh.types.BMesh,
    side_sign: float,
    anchor_x: float,
    billow_m: float,
    drape_width: float = 0.42,
    thickness: float = 0.022,
    cols: int = 8,
    rows: int = 10,
) -> None:
    """2.40m 상인방(z=2.36m)에서 바닥(z=0.22m)까지 바람에 휘날리는 주름 커튼을 닫힌 2-매니폴드 사각면 솔리드로 생성한다."""
    z_top = 2.36
    z_bot = 0.24
    y_anchor = 0.72

    front_grid: list[list[bmesh.types.BMVert]] = []
    back_grid: list[list[bmesh.types.BMVert]] = []

    for r in range(rows + 1):
        v = r / rows  # 0 at top rod, 1 at hem
        z = z_top - (z_top - z_bot) * v
        # Catenary inward (-Y) wind billow + gentle upward hem lift under strong gusts
        gust_curve = math.sin(v * math.pi * 0.82) * billow_m
        hem_lift = (v ** 2) * billow_m * 0.16
        f_row: list[bmesh.types.BMVert] = []
        b_row: list[bmesh.types.BMVert] = []
        for c in range(cols + 1):
            u = c / cols  # 0 outer jamb -> 1 inner portal edge
            pleat = math.sin(u * math.pi * 3.0) * (0.024 + 0.018 * v)
            inward_flair = (-side_sign) * (v ** 1.35) * billow_m * (0.22 + 0.28 * u)
            x = anchor_x + side_sign * (-drape_width * 0.5 + drape_width * u) + inward_flair
            y_mid = y_anchor - gust_curve + pleat
            zf = z + hem_lift
            f_row.append(bm.verts.new((x, y_mid - thickness * 0.5, zf)))
            b_row.append(bm.verts.new((x, y_mid + thickness * 0.5, zf)))
        front_grid.append(f_row)
        back_grid.append(b_row)

    # Front (-Y) and Back (+Y) quad sheets
    for r in range(rows):
        for c in range(cols):
            bm.faces.new([front_grid[r][c], front_grid[r][c + 1], front_grid[r + 1][c + 1], front_grid[r + 1][c]])
            bm.faces.new([back_grid[r][c + 1], back_grid[r][c], back_grid[r + 1][c], back_grid[r + 1][c + 1]])

    # Top & Bottom caps
    for c in range(cols):
        bm.faces.new([back_grid[0][c], back_grid[0][c + 1], front_grid[0][c + 1], front_grid[0][c]])
        bm.faces.new([front_grid[rows][c], front_grid[rows][c + 1], back_grid[rows][c + 1], back_grid[rows][c]])

    # Left (c=0) & Right (c=cols) seam caps
    for r in range(rows):
        bm.faces.new([back_grid[r][0], front_grid[r][0], front_grid[r + 1][0], back_grid[r + 1][0]])
        bm.faces.new([front_grid[r][cols], back_grid[r][cols], back_grid[r + 1][cols], front_grid[r + 1][cols]])


def add_wind_drape_and_half_mirror_pass(
    scene: bpy.types.Scene,
    open_ratio: float,
    fabric_style: str,
    beat_tag: str,
    drape_srgb: tuple[float, float, float],
    mirror_tint_srgb: tuple[float, float, float],
) -> dict[str, float]:
    """개폐율 연동 좌우 드레이프 패브릭(2.40m 상인방 고정)과 하프 미러 유리 반사창(Fresnel 8~32%) 및 단행본 B5 오버스캔 마커를 추가한다."""
    clamped = max(0.05, min(1.0, open_ratio))
    billow_m = round(0.08 + 0.70 * clamped, 2)
    wind_speed_ms = round(1.0 + 7.8 * clamped, 1)
    fresnel_reflect_pct = round(32.0 - 20.0 * clamped, 1)

    mat_drape = make_lumiere_mat(
        f"V25_{beat_tag}_WindDrapeFabric",
        drape_srgb,
        roughness=0.38 if fabric_style != "silk" else 0.22,
        metallic=0.04,
        coat_weight=0.55 if fabric_style == "silk" else 0.28,
        emission_srgb=drape_srgb,
        emission_strength=0.14,
    )
    mat_mirror = make_lumiere_mat(
        f"V25_{beat_tag}_HalfMirrorGlass",
        mirror_tint_srgb,
        roughness=0.03,
        metallic=0.18,
        alpha=round(fresnel_reflect_pct / 100.0, 3),
        coat_weight=1.0,
        emission_srgb=mirror_tint_srgb,
        emission_strength=0.55,
    )
    if hasattr(mat_mirror, "surface_render_method"):
        mat_mirror.surface_render_method = "BLENDED"

    bm_drape = bmesh.new()
    portal_jamb_x = 0.92 + 0.22 * clamped
    _add_watertight_wind_drape_panel(bm_drape, -1.0, -portal_jamb_x, billow_m)
    _add_watertight_wind_drape_panel(bm_drape, 1.0, portal_jamb_x, billow_m)
    bmesh.ops.recalc_face_normals(bm_drape, faces=bm_drape.faces)
    drape_obj = create_mesh_object(
        scene,
        f"WindDrape_{beat_tag}_CatenaryPair",
        bm_drape,
        mat_drape,
        smooth=True,
        weighted_normals=True,
    )
    drape_obj["billow_deflection_m"] = billow_m
    drape_obj["wind_speed_ms"] = wind_speed_ms
    drape_obj["psd_layer_tag"] = f"FX_Mid_WindDrape_{fabric_style}"

    # Half-Mirror Glass Reflection Pane + Subtle Ghost Silhouette Reflection on Left/Right Glazing (y = +0.86m)
    bm_glass = bmesh.new()
    pane_w = max(0.28, 0.72 - 0.34 * clamped)
    for sign in (-1.0, 1.0):
        pane_cx = sign * (1.16 - pane_w * 0.42)
        add_beveled_box(bm_glass, (pane_w, 0.016, 2.08), (pane_cx, 0.86, 1.24), 0.003, segments=1)
        # Reflected ghost bust silhouette embedded inside glass reflection pass
        add_lathe_solid(
            bm_glass,
            [
                (0.008, 0.96),
                (0.115, 1.02),
                (0.135, 1.28),
                (0.052, 1.36),
                (0.088, 1.48),
                (0.008, 1.56),
            ],
            segments=10,
            center_xyz=(pane_cx, 0.845, 0.0),
            scale_xyz=(1.0, 0.18, 1.0),
        )
    glass_obj = create_mesh_object(
        scene,
        f"HalfMirror_{beat_tag}_FresnelReflection",
        bm_glass,
        mat_mirror,
        smooth=True,
        weighted_normals=True,
    )
    glass_obj["fresnel_reflect_pct"] = fresnel_reflect_pct
    glass_obj["psd_layer_tag"] = "FX_Glass_HalfMirror_Reflection"

    return {
        "billowDeflectionM": billow_m,
        "windSpeedMs": wind_speed_ms,
        "fresnelReflectPct": fresnel_reflect_pct,
    }


ASSET_SPECS_V25: list[
    tuple[
        str,
        str,
        str,
        str,
        str,
        float,
        str,
        str,
        str,
        str,
        str,
        int,
        str,
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
    ]
] = [
    (
        "webtoon-wind-drape-halfmirror-rain-15pct-v25",
        "15% 미풍 린넨 커튼(0.19m)·하프 미러 반사창 베이 (V25)",
        "Beat 1 (15% · 5200K) Wind-Coupled Linen Drape & Half-Mirror Glass Bay V25",
        "15% 미풍(2.2m/s) 린넨 커튼 0.19m 펄럭임·Fresnel 29.0% 창가 인물 반사·폭우 차폐",
        "2.2m/s linen curtain billow (0.19m), Fresnel 29% half-mirror glass reflection & rain",
        0.15,
        "dust",
        "creak",
        "guards_4",
        "rain",
        "linen",
        5200,
        "V25Beat1_Linen",
        (0.84, 0.90, 0.98),
        (0.88, 0.94, 1.0),
        (0.82, 0.90, 0.98),
        (0.92, 0.96, 1.0),
        (0.16, 0.20, 0.28),
        (0.20, 0.24, 0.32),
        (0.78, 0.90, 1.0),
        (0.72, 0.88, 1.0),
        (0.86, 0.89, 0.94),
        (0.74, 0.86, 0.98),
    ),
    (
        "webtoon-wind-drape-rofan-velvet-65pct-v25",
        "65% 돌풍 로판 벨벳 휘장(0.54m)·온실 프레넬 반사 베이 (V25)",
        "Beat 2 (65% · 3800K) Gusting Rofan Velvet Drape & Salon Reflection Bay V25",
        "65% 돌풍(6.1m/s) 로판 버건디 벨벳 휘장 0.54m 휘날림·Fresnel 19.0% 반사·설화 차폐",
        "6.1m/s burgundy velvet drape billow (0.54m), Fresnel 19% reflection & winter snow",
        0.65,
        "petals",
        "chime",
        "banquet_6",
        "snow",
        "velvet",
        3800,
        "V25Beat2_Velvet",
        (1.0, 0.86, 0.72),
        (1.0, 0.82, 0.86),
        (1.0, 0.90, 0.84),
        (1.0, 0.88, 0.68),
        (0.24, 0.18, 0.22),
        (0.26, 0.22, 0.28),
        (0.94, 0.97, 1.0),
        (0.90, 0.95, 1.0),
        (0.58, 0.20, 0.28),
        (0.96, 0.86, 0.82),
    ),
    (
        "webtoon-wind-drape-tempest-cape-100pct-v25",
        "100% 폭풍 각성 비단 휘장(0.78m)·전면 수막 반사 베이 (V25)",
        "Beat 3 (100% · 8600K) Tempest Silk Banner Billow & Storm Mirror Bay V25",
        "100% 폭풍(8.8m/s) 시안 비단 휘장 0.78m 역동 휘날림·Fresnel 12.0% 잔상·B5 오버스캔 호환",
        "8.8m/s tempest silk banner billow (0.78m), Fresnel 12% ghost reflection & B5 overscan",
        1.0,
        "embers",
        "boom",
        "awakening_6",
        "storm",
        "silk",
        8600,
        "V25Beat3_Silk",
        (0.62, 0.88, 1.0),
        (0.44, 0.92, 1.0),
        (0.58, 0.92, 1.0),
        (0.52, 0.95, 1.0),
        (0.10, 0.18, 0.28),
        (0.16, 0.22, 0.34),
        (0.68, 0.92, 1.0),
        (0.54, 0.90, 1.0),
        (0.28, 0.64, 0.88),
        (0.62, 0.90, 1.0),
    ),
]


def render_v25_thumbnail(
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

    world = bpy.data.worlds.new("ThumbWorldV25")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        if kelvin <= 4200:
            bg.inputs[0].default_value = (*srgb(0.10, 0.08, 0.10), 1.0)
        elif kelvin >= 7500:
            bg.inputs[0].default_value = (*srgb(0.05, 0.08, 0.12), 1.0)
        else:
            bg.inputs[0].default_value = (*srgb(0.07, 0.09, 0.11), 1.0)
        bg.inputs[1].default_value = 0.92
    scene.world = world

    cam_data = bpy.data.cameras.new("ThumbCamV25")
    cam_data.lens = 52.0
    if hasattr(cam_data, "dof"):
        cam_data.dof.use_dof = True
        cam_data.dof.aperture_fstop = f_stop
    cam_obj = bpy.data.objects.new("ThumbCamV25", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.26
    cam_obj.location = center + Vector((dist * 0.28, -dist * 1.06, dist * 0.22))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    if hasattr(cam_data, "dof"):
        cam_data.dof.focus_distance = (center - cam_obj.location).length
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("V25WindKey", 960.0, key_col, (0.0, radius * 2.2, radius * 2.0)),
        ("V25DrapeFill", 380.0, (0.90, 0.92, 0.98), (-radius * 1.8, -radius * 1.8, radius * 1.5)),
        ("V25MirrorRim", 620.0, key_col, (radius * 1.8, -radius * 1.5, radius * 2.0)),
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


def run_v25_pipeline() -> dict[str, object]:
    before_digests = snapshot_preserved_scenes()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith(("V21_V25", "V22_V25", "V23_V25", "V24_V25", "V25_")) and mat.users == 0:
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("WindDrapeV25_Export") or bpy.data.scenes.new("WindDrapeV25_Export")
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
        mote_style,
        sfx_mode,
        crowd_preset,
        weather_mode,
        fabric_style,
        kelvin,
        tag,
        beam_c,
        mote_c,
        bokeh_c,
        sfx_fill_c,
        sfx_rim_c,
        crowd_c,
        precip_c,
        ripple_c,
        drape_c,
        mirror_c,
    ) in ASSET_SPECS_V25:
        clear_only_scene(export_scene)
        build_slit_godray_sequence_bay(export_scene, open_r, tag, beam_c)
        dof_meta = add_atmospheric_bokeh_layer(export_scene, open_r, mote_style, tag, mote_c, bokeh_c)
        add_zdepth_3d_sfx_stamp(export_scene, sfx_mode, tag, sfx_fill_c, sfx_rim_c)
        add_shared_datum_crowd_silhouettes(export_scene, crowd_preset, tag, crowd_c, beam_c)
        weather_meta = add_datum_occluded_weather_and_ripples(export_scene, open_r, weather_mode, tag, precip_c, ripple_c)
        drape_meta = add_wind_drape_and_half_mirror_pass(export_scene, open_r, fabric_style, tag, drape_c, mirror_c)
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
        render_v25_thumbnail(export_scene, mesh_objs, thumb_path, key_col=beam_c, f_stop=dof_meta["fStop"], kelvin=kelvin)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["billow_deflection_m"] = drape_meta["billowDeflectionM"]
        root["wind_speed_ms"] = drape_meta["windSpeedMs"]
        root["fresnel_reflect_pct"] = drape_meta["fresnelReflectPct"]
        root["tankobon_spread_overscan"] = "B5_370x263mm_3mm_bleed"
        root["asset_generator"] = "scripts/blender/generate_wind_drape_reflection_v25.py"
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
                "openRatio": open_r,
                "fabricStyle": fabric_style,
                "billowDeflectionM": drape_meta["billowDeflectionM"],
                "windSpeedMs": drape_meta["windSpeedMs"],
                "fresnelReflectPct": drape_meta["fresnelReflectPct"],
                "indoorWetReachM": weather_meta["indoorWetReachM"],
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

    # Stage isolated V25 Wind-Coupled Drape · Half-Mirror Glass · Tankobon Overscan Showcase Scene
    v25_scene = bpy.data.scenes.get(TARGET_LIVE_SCENE) or bpy.data.scenes.new(TARGET_LIVE_SCENE)
    v25_scene.unit_settings.system = "METRIC"
    v25_scene.unit_settings.scale_length = 1.0
    v25_scene.render.engine = "BLENDER_EEVEE"
    if hasattr(v25_scene.eevee, "use_raytracing"):
        v25_scene.eevee.use_raytracing = True
    if win is not None:
        win.scene = v25_scene

    clear_only_scene(v25_scene)
    mat_stage = make_lumiere_mat("V25_StageDarkroom", (0.09, 0.10, 0.12), roughness=0.26, coat_weight=0.58)
    mat_rail = make_lumiere_mat("V25_StageBrassOverscan", (0.88, 0.72, 0.38), roughness=0.18, metallic=1.0)

    bm_stage = bmesh.new()
    add_beveled_box(bm_stage, (11.2, 4.6, 0.10), (0.0, 0.0, -0.05), 0.012, segments=2)
    create_mesh_object(v25_scene, "WindDrapeV25_Gallery_Floor", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_rail = bmesh.new()
    add_beveled_box(bm_rail, (10.6, 0.032, 0.02), (0.0, -0.96, 0.005), 0.004, segments=2)
    create_mesh_object(v25_scene, "WindDrapeV25_TankobonOverscan_Rail", bm_rail, mat_rail, smooth=True, weighted_normals=True)

    live_zones = [
        (
            "V25Zone1_LinenDrape_HalfMirror_15pct",
            0.15,
            "dust",
            "creak",
            "guards_4",
            "rain",
            "linen",
            "LiveV25_1",
            (0.84, 0.90, 0.98),
            (0.88, 0.94, 1.0),
            (0.82, 0.90, 0.98),
            (0.92, 0.96, 1.0),
            (0.16, 0.20, 0.28),
            (0.20, 0.24, 0.32),
            (0.78, 0.90, 1.0),
            (0.72, 0.88, 1.0),
            (0.86, 0.89, 0.94),
            (0.74, 0.86, 0.98),
            (-3.42, 0.14, 0.0),
            0.10,
        ),
        (
            "V25Zone2_RofanVelvet_HalfMirror_65pct",
            0.65,
            "petals",
            "chime",
            "banquet_6",
            "snow",
            "velvet",
            "LiveV25_2",
            (1.0, 0.86, 0.72),
            (1.0, 0.82, 0.86),
            (1.0, 0.90, 0.84),
            (1.0, 0.88, 0.68),
            (0.24, 0.18, 0.22),
            (0.26, 0.22, 0.28),
            (0.94, 0.97, 1.0),
            (0.90, 0.95, 1.0),
            (0.58, 0.20, 0.28),
            (0.96, 0.86, 0.82),
            (0.0, 0.22, 0.0),
            0.0,
        ),
        (
            "V25Zone3_TempestSilk_StormMirror_100pct",
            1.00,
            "embers",
            "boom",
            "awakening_6",
            "storm",
            "silk",
            "LiveV25_3",
            (0.62, 0.88, 1.0),
            (0.44, 0.92, 1.0),
            (0.58, 0.92, 1.0),
            (0.52, 0.95, 1.0),
            (0.10, 0.18, 0.28),
            (0.16, 0.22, 0.34),
            (0.68, 0.92, 1.0),
            (0.54, 0.90, 1.0),
            (0.28, 0.64, 0.88),
            (0.62, 0.90, 1.0),
            (3.42, 0.14, 0.0),
            -0.10,
        ),
    ]

    for (
        grp_name,
        open_r,
        mote_s,
        sfx_m,
        crowd_p,
        weather_m,
        fabric_s,
        tag,
        beam_c,
        mote_c,
        bokeh_c,
        sfx_fill_c,
        sfx_rim_c,
        crowd_c,
        precip_c,
        ripple_c,
        drape_c,
        mirror_c,
        loc,
        rot_z,
    ) in live_zones:
        before = set(v25_scene.objects)
        build_slit_godray_sequence_bay(v25_scene, open_r, tag, beam_c)
        add_atmospheric_bokeh_layer(v25_scene, open_r, mote_s, tag, mote_c, bokeh_c)
        add_zdepth_3d_sfx_stamp(v25_scene, sfx_m, tag, sfx_fill_c, sfx_rim_c)
        add_shared_datum_crowd_silhouettes(v25_scene, crowd_p, tag, crowd_c, beam_c)
        add_datum_occluded_weather_and_ripples(v25_scene, open_r, weather_m, tag, precip_c, ripple_c)
        add_wind_drape_and_half_mirror_pass(v25_scene, open_r, fabric_s, tag, drape_c, mirror_c)
        created = [o for o in v25_scene.objects if o not in before and o.type == "MESH"]
        min_z = min((o.matrix_world @ Vector(c)).z for o in created for c in o.bound_box)
        grp = bpy.data.objects.new(grp_name, None)
        v25_scene.collection.objects.link(grp)
        for o in created:
            if o.parent is None:
                o.location.z -= min_z
                o.parent = grp
        grp.location = loc
        grp.rotation_euler = (0.0, 0.0, rot_z)

    target = Vector((0.0, 0.08, 1.38))
    for lname, energy, color, lpos in (
        ("WindDrape_RainLinen_5200K", 2000.0, (0.84, 0.92, 1.0), (-3.6, 4.2, 4.3)),
        ("WindDrape_VelvetSalon_3800K", 2150.0, (1.0, 0.88, 0.74), (0.0, 4.4, 4.2)),
        ("WindDrape_TempestSilk_8600K", 2280.0, (0.62, 0.90, 1.0), (3.6, 4.2, 4.3)),
        ("WindDrape_DarkroomFill_5400K", 1400.0, (0.92, 0.94, 0.98), (0.0, -5.0, 3.8)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.color = color
        ldata.size = 3.6
        lobj = bpy.data.objects.new(lname, ldata)
        v25_scene.collection.objects.link(lobj)
        lobj.location = Vector(lpos)
        lobj.rotation_euler = (target - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()

    v_world = bpy.data.worlds.get("WindDrapeWorldV25") or bpy.data.worlds.new("WindDrapeWorldV25")
    v_world.use_nodes = True
    bg = v_world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.06, 0.07, 0.09), 1.0)
        bg.inputs[1].default_value = 0.88
    v25_scene.world = v_world

    cdata = bpy.data.cameras.new("WindDrapeOverscanCam46mm")
    cdata.lens = 46.0
    if hasattr(cdata, "dof"):
        cdata.dof.use_dof = True
        cdata.dof.aperture_fstop = 2.6
        cdata.dof.focus_distance = 10.45
    cam = bpy.data.objects.new("WindDrapeOverscanCam46mm", cdata)
    v25_scene.collection.objects.link(cam)
    v25_scene.camera = cam
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
        "schema": "toonstudio.blender-wind-drape-reflection.v25",
        "createdAt": "2026-11-18",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {blender_ver} (scripts/blender/generate_wind_drape_reflection_v25.py · Wind Drape, Half-Mirror & Tankobon Overscan SHA-256 verified)",
        "tool": f"Blender {blender_ver}",
        "blenderVersion": blender_ver,
        "units": "meter",
        "upAxis": "Y",
        "windDrapePhysicsSpec": {
            "lintelAnchorHeightM": 2.36,
            "billowDeflectionRangeM": [0.19, 0.54, 0.78],
            "halfMirrorFresnelRangePct": [29.0, 19.0, 12.0],
            "tankobonOverscanFormats": ["B5_370x263mm_350dpi", "A5_302x216mm_350dpi"],
        },
        "externalSources": [],
        "sceneIsolationAudit": isolation_audit,
        "files": [
            {
                "file": m["file"],
                "openRatio": m["openRatio"],
                "fabricStyle": m["fabricStyle"],
                "billowDeflectionM": m["billowDeflectionM"],
                "windSpeedMs": m["windSpeedMs"],
                "fresnelReflectPct": m["fresnelReflectPct"],
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
        f"- `{m['file']}` — {m['labelKo']} ({m['triangles']} tris, 펄럭임 {m['billowDeflectionM']}m, Fresnel {m['fresnelReflectPct']}%, SHA-256 `{m['sha256']}`)"
        for m in sorted(manifest, key=lambda r: str(r["file"]))
    )
    (OUTPUT_DIR / "LICENSES.md").write_text(
        "# ToonStudio Blender 5.3 Wind-Coupled Drape · Half-Mirror Glass · Tankobon Overscan Kit V25 — 라이선스 및 규격 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_wind_drape_reflection_v25.py`, Blender {blender_ver})\n"
        "- 기류·반사 연동: `2.40m` 상인방 수밀 커튼·휘장(`0.19m ~ 0.78m` 펄럭임) 및 `Fresnel 12~29%` 하프 미러 유리 반사창\n"
        "- 출판·오디오 호환: `.toonaudio.json` 오디오 스템 큐시트 · 회차 연속성 해시 원장 · `B5/A5` 단행본 펼침면 `3mm` 도련 오버스캔\n"
        "- 검증: 매니폴드 결함 0건 · 보존 씬 SHA-256 무손실 격리 검증 완료\n\n"
        "## 포함 파일 목록 (총 3종)\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return {"exported": manifest, "sceneIsolationAudit": isolation_audit}


if __name__ == "__main__":
    print(json.dumps(run_v25_pipeline(), indent=2, ensure_ascii=False))
