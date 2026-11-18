"""ToonStudio Architectural Weather Occlusion · Wet-Floor Specular Ripples · Dual-Focal & Localization Slot Pack V24 — Blender 5.3.0 생성기 & 기존 씬 SHA-256 격리 검증기.

공통 건축 기준선(2.40m 처마/상인방 · 1.10m 난간 · 0.74m 테이블 · 0.18m 기단)을 기상 차폐 콜라이더로 삼아
실내 천장·테이블 관통 없이 처마 바깥(y >= +0.96m) 강우·강설 스트릭과 개폐율(15%·65%·100%) 비례 실내 바닥 빗물 파문(Wet-Floor Specular Ripples)을
물리적으로 분리 생성하는 CC0-1.0 수밀 에셋 3종을 구축한다:
1) `webtoon-weather-eaves-rain-ripples-15pct-v24.glb` — 15% 처마 차폐 폭우·문턱 빗물 파문 베이 (5200K)
2) `webtoon-weather-rofan-blossom-snow-65pct-v24.glb` — 65% 로판 설화(雪花) 눈보라·난간 서리 차폐 베이 (3800K)
3) `webtoon-weather-abyss-storm-mist-100pct-v24.glb` — 100% 각성 폭풍 해무·전면 수막 파문 베이 (8600K)
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

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
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-weather-occlusion-motion-v24"
THUMB_DIR = OUTPUT_DIR / "thumbnails"
TARGET_LIVE_SCENE = "ToonStudio_Weather_Motion_ColorScript_V24"


def snapshot_preserved_scenes() -> dict[str, dict[str, object]]:
    return {
        s.name: compute_scene_isolation_digest(s)
        for s in bpy.data.scenes
        if s.name not in (TARGET_LIVE_SCENE, "WeatherOcclusionV24_Export")
    }


def _add_tilted_streak_box(
    bm: bmesh.types.BMesh,
    size_xyz: tuple[float, float, float],
    center_xyz: tuple[float, float, float],
    euler_xyz: tuple[float, float, float],
) -> None:
    temp = bmesh.new()
    add_beveled_box(temp, size_xyz, (0.0, 0.0, 0.0), 0.0025, segments=1)
    rot_mat = Euler(euler_xyz, "XYZ").to_matrix().to_4x4()
    xform = Matrix.Translation(Vector(center_xyz)) @ rot_mat
    bmesh.ops.transform(temp, matrix=xform, verts=temp.verts)
    vmap: dict[int, bmesh.types.BMVert] = {}
    for v in temp.verts:
        vmap[v.index] = bm.verts.new(v.co)
    for f in temp.faces:
        bm.faces.new([vmap[v.index] for v in f.verts])
    temp.free()


def add_datum_occluded_weather_and_ripples(
    scene: bpy.types.Scene,
    open_ratio: float,
    weather_mode: str,
    beat_tag: str,
    precip_srgb: tuple[float, float, float],
    ripple_srgb: tuple[float, float, float],
) -> dict[str, float]:
    """2.40m 상인방·1.10m 난간 차폐 규칙에 맞춰 실외(y >= 0.96m) 기상 입자와 실내 개구부 바닥(z = 0.18m) 스페큘러 파문을 분리 생성한다."""
    clamped = max(0.05, min(1.0, open_ratio))
    slit_half_w = (0.16 + 1.52 * clamped) * 0.5
    indoor_wet_reach_m = round(0.26 + 0.78 * clamped, 2)

    mat_precip = make_lumiere_mat(
        f"V24_{beat_tag}_ExteriorWeather",
        precip_srgb,
        roughness=0.08,
        alpha=0.58,
        coat_weight=1.0,
        emission_srgb=precip_srgb,
        emission_strength=1.85,
    )
    if hasattr(mat_precip, "surface_render_method"):
        mat_precip.surface_render_method = "BLENDED"

    mat_ripple = make_lumiere_mat(
        f"V24_{beat_tag}_WetFloorSpecular",
        ripple_srgb,
        roughness=0.04,
        metallic=0.25,
        alpha=0.52,
        coat_weight=1.0,
        emission_srgb=ripple_srgb,
        emission_strength=1.45,
    )
    if hasattr(mat_ripple, "surface_render_method"):
        mat_ripple.surface_render_method = "BLENDED"

    # 1) 실외 차폐 기상 레이어 (y = 0.98m ~ 1.32m, 실내 y < 0.82m 영역 침범 0건)
    bm_ext = bmesh.new()
    exterior_count = 14
    for idx in range(exterior_count):
        tx = -1.08 + 2.16 * ((idx + 0.5) / exterior_count)
        ty = 1.02 + 0.24 * ((idx * 5) % 3) / 2.0
        tz = 0.42 + 1.82 * (((idx * 7) % 11) / 10.0)
        if weather_mode == "rain":
            _add_tilted_streak_box(
                bm_ext,
                (0.012, 0.012, 0.34),
                (tx, ty, tz),
                (0.08, -0.18, 0.0),
            )
        elif weather_mode == "snow":
            rad = 0.028 + 0.010 * (idx % 3)
            add_lathe_solid(
                bm_ext,
                [(0.005, tz - rad * 0.85), (rad * 1.15, tz), (0.005, tz + rad * 0.85)],
                segments=6,
                center_xyz=(tx, ty, 0.0),
            )
        else:
            # 폭풍 해무 & 사선 비바람 스트릭 복합
            _add_tilted_streak_box(
                bm_ext,
                (0.016, 0.016, 0.38),
                (tx, ty, tz),
                (0.12, -0.26, 0.0),
            )

    ext_obj = create_mesh_object(
        scene,
        f"Weather_{beat_tag}_ExteriorOccluded",
        bm_ext,
        mat_precip,
        smooth=(weather_mode == "snow"),
        weighted_normals=True,
    )
    ext_obj["occlusion_plane_y_m"] = 0.96
    ext_obj["psd_layer_tag"] = f"FX_BG_Weather_Exterior_{weather_mode}"

    # 2) 실내 문턱 개구부 비례 젖은 바닥 스페큘러 파문 / 서리 결정 (z = 0.185m datum deck 상면, |x| <= slit_half_w)
    bm_rip = bmesh.new()
    ripple_count = 4 if clamped <= 0.25 else (7 if clamped <= 0.75 else 10)
    deck_z = 0.184
    for r_idx in range(ripple_count):
        rt = (r_idx + 0.5) / ripple_count
        rx = (-slit_half_w * 0.78) + (slit_half_w * 1.56) * ((r_idx * 3 % ripple_count + 0.5) / ripple_count)
        ry = 0.62 - indoor_wet_reach_m * rt
        outer_r = 0.065 + 0.045 * ((r_idx % 3) / 2.0)
        add_lathe_solid(
            bm_rip,
            [
                (0.006, deck_z),
                (outer_r * 0.72, deck_z + 0.003),
                (outer_r, deck_z + 0.008),
                (outer_r * 0.92, deck_z + 0.012),
                (0.006, deck_z + 0.006),
            ],
            segments=12,
            center_xyz=(rx, ry, 0.0),
        )

    rip_obj = create_mesh_object(
        scene,
        f"Weather_{beat_tag}_IndoorWetRipples",
        bm_rip,
        mat_ripple,
        smooth=True,
        weighted_normals=True,
    )
    rip_obj["indoor_wet_reach_m"] = indoor_wet_reach_m
    rip_obj["psd_layer_tag"] = f"FX_Floor_WetRipples_{weather_mode}"
    return {
        "indoorWetReachM": indoor_wet_reach_m,
        "exteriorStreakCount": float(exterior_count),
        "indoorRippleCount": float(ripple_count),
    }


ASSET_SPECS_V24: list[
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
    ]
] = [
    (
        "webtoon-weather-eaves-rain-ripples-15pct-v24",
        "15% 처마 차폐 폭우·문턱 빗물 파문 베이 (V24)",
        "Beat 1 (15% · 5200K Storm) Eaves-Occluded Rain & Wet Ripples Bay V24",
        "2.40m 상인방 차폐 실외 폭우·0.38m 문턱 빗물 파문·듀얼 포컬(24mm×85mm) 기준 베이",
        "2.40m lintel-occluded rain streaks & 0.38m threshold wet-floor specular ripples",
        0.15,
        "dust",
        "creak",
        "guards_4",
        "rain",
        5200,
        "V24Beat1_Rain",
        (0.84, 0.90, 0.98),
        (0.88, 0.94, 1.0),
        (0.82, 0.90, 0.98),
        (0.92, 0.96, 1.0),
        (0.16, 0.20, 0.28),
        (0.20, 0.24, 0.32),
        (0.78, 0.90, 1.0),
        (0.72, 0.88, 1.0),
    ),
    (
        "webtoon-weather-rofan-blossom-snow-65pct-v24",
        "65% 로판 설화(雪花) 눈보라·난간 서리 차폐 베이 (V24)",
        "Beat 2 (65% · 3800K Winter Salon) Occluded Snowdrift & Frost Sill Bay V24",
        "2.40m 아치 차폐 설화 결정·0.77m 실내 서리 파문·0.74m 연회 착석 군중 6인",
        "2.40m arch-occluded snow crystals, 0.77m frost ripples & 6 banquet silhouettes",
        0.65,
        "petals",
        "chime",
        "banquet_6",
        "snow",
        3800,
        "V24Beat2_Snow",
        (1.0, 0.86, 0.72),
        (1.0, 0.82, 0.86),
        (1.0, 0.90, 0.84),
        (1.0, 0.88, 0.68),
        (0.24, 0.18, 0.22),
        (0.26, 0.22, 0.28),
        (0.94, 0.97, 1.0),
        (0.90, 0.95, 1.0),
    ),
    (
        "webtoon-weather-abyss-storm-mist-100pct-v24",
        "100% 각성 폭풍 해무·전면 수막 파문 베이 (V24)",
        "Beat 3 (100% · 8600K Tempest) Full Storm Surge & Specular Water Floor V24",
        "8600K 폭풍 역광·실외 비바람 차폐·1.04m 전면 수막 파문·방사형 각성 효과음",
        "8600K tempest halo, occluded storm streaks & 1.04m specular water ripple floor",
        1.0,
        "embers",
        "boom",
        "awakening_6",
        "storm",
        8600,
        "V24Beat3_Storm",
        (0.62, 0.88, 1.0),
        (0.44, 0.92, 1.0),
        (0.58, 0.92, 1.0),
        (0.52, 0.95, 1.0),
        (0.10, 0.18, 0.28),
        (0.16, 0.22, 0.34),
        (0.68, 0.92, 1.0),
        (0.54, 0.90, 1.0),
    ),
]


def render_v24_thumbnail(
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

    world = bpy.data.worlds.new("ThumbWorldV24")
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

    cam_data = bpy.data.cameras.new("ThumbCamV24")
    cam_data.lens = 54.0
    if hasattr(cam_data, "dof"):
        cam_data.dof.use_dof = True
        cam_data.dof.aperture_fstop = f_stop
    cam_obj = bpy.data.objects.new("ThumbCamV24", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.26
    cam_obj.location = center + Vector((dist * 0.28, -dist * 1.06, dist * 0.24))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    if hasattr(cam_data, "dof"):
        cam_data.dof.focus_distance = (center - cam_obj.location).length
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("V24WeatherKey", 940.0, key_col, (0.0, radius * 2.2, radius * 2.0)),
        ("V24WetFloorFill", 360.0, (0.88, 0.92, 0.98), (-radius * 1.8, -radius * 1.8, radius * 1.5)),
        ("V24RimSpec", 600.0, key_col, (radius * 1.8, -radius * 1.5, radius * 2.0)),
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


def run_v24_pipeline() -> dict[str, object]:
    before_digests = snapshot_preserved_scenes()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith(("V21_V24", "V22_V24", "V23_V24", "V24_")) and mat.users == 0:
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("WeatherOcclusionV24_Export") or bpy.data.scenes.new("WeatherOcclusionV24_Export")
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
    ) in ASSET_SPECS_V24:
        clear_only_scene(export_scene)
        build_slit_godray_sequence_bay(export_scene, open_r, tag, beam_c)
        dof_meta = add_atmospheric_bokeh_layer(export_scene, open_r, mote_style, tag, mote_c, bokeh_c)
        sfx_meta = add_zdepth_3d_sfx_stamp(export_scene, sfx_mode, tag, sfx_fill_c, sfx_rim_c)
        crowd_meta = add_shared_datum_crowd_silhouettes(export_scene, crowd_preset, tag, crowd_c, beam_c)
        weather_meta = add_datum_occluded_weather_and_ripples(export_scene, open_r, weather_mode, tag, precip_c, ripple_c)
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
        render_v24_thumbnail(export_scene, mesh_objs, thumb_path, key_col=beam_c, f_stop=dof_meta["fStop"], kelvin=kelvin)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["weather_mode"] = weather_mode
        root["indoor_wet_reach_m"] = weather_meta["indoorWetReachM"]
        root["dual_focal_split_mm"] = "24mm_bg_85mm_char"
        root["sfx_locales_supported"] = "KO,EN,JA"
        root["asset_generator"] = "scripts/blender/generate_weather_occlusion_v24.py"
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
                "weatherMode": weather_mode,
                "apertureFStop": dof_meta["fStop"],
                "kelvin": kelvin,
                "indoorWetReachM": weather_meta["indoorWetReachM"],
                "indoorRippleCount": int(weather_meta["indoorRippleCount"]),
                "zDepthSfxPlaneYM": sfx_meta["zDepthPlaneYM"],
                "crowdCount": crowd_meta["crowdCount"],
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

    # Stage isolated V24 Architectural Weather Occlusion · Wet Floor Ripples · Dual-Focal Showcase Scene
    v24_scene = bpy.data.scenes.get(TARGET_LIVE_SCENE) or bpy.data.scenes.new(TARGET_LIVE_SCENE)
    v24_scene.unit_settings.system = "METRIC"
    v24_scene.unit_settings.scale_length = 1.0
    v24_scene.render.engine = "BLENDER_EEVEE"
    if hasattr(v24_scene.eevee, "use_raytracing"):
        v24_scene.eevee.use_raytracing = True
    if win is not None:
        win.scene = v24_scene

    clear_only_scene(v24_scene)
    mat_stage = make_lumiere_mat("V24_StageDarkroom", (0.09, 0.10, 0.12), roughness=0.28, coat_weight=0.55)
    mat_rail = make_lumiere_mat("V24_StageBrassDatum", (0.88, 0.72, 0.38), roughness=0.18, metallic=1.0)

    bm_stage = bmesh.new()
    add_beveled_box(bm_stage, (10.8, 4.4, 0.10), (0.0, 0.0, -0.05), 0.012, segments=2)
    create_mesh_object(v24_scene, "WeatherV24_Gallery_Floor", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_rail = bmesh.new()
    add_beveled_box(bm_rail, (10.2, 0.032, 0.02), (0.0, -0.94, 0.005), 0.004, segments=2)
    create_mesh_object(v24_scene, "WeatherV24_Datum_Rail", bm_rail, mat_rail, smooth=True, weighted_normals=True)

    live_zones = [
        (
            "V24Zone1_RainOcclusion_15pct",
            0.15,
            "dust",
            "creak",
            "guards_4",
            "rain",
            "LiveV24_1",
            (0.84, 0.90, 0.98),
            (0.88, 0.94, 1.0),
            (0.82, 0.90, 0.98),
            (0.92, 0.96, 1.0),
            (0.16, 0.20, 0.28),
            (0.20, 0.24, 0.32),
            (0.78, 0.90, 1.0),
            (0.72, 0.88, 1.0),
            (-3.36, 0.14, 0.0),
            0.10,
        ),
        (
            "V24Zone2_RofanSnowOcclusion_65pct",
            0.65,
            "petals",
            "chime",
            "banquet_6",
            "snow",
            "LiveV24_2",
            (1.0, 0.86, 0.72),
            (1.0, 0.82, 0.86),
            (1.0, 0.90, 0.84),
            (1.0, 0.88, 0.68),
            (0.24, 0.18, 0.22),
            (0.26, 0.22, 0.28),
            (0.94, 0.97, 1.0),
            (0.90, 0.95, 1.0),
            (0.0, 0.22, 0.0),
            0.0,
        ),
        (
            "V24Zone3_StormSurgeRipples_100pct",
            1.00,
            "embers",
            "boom",
            "awakening_6",
            "storm",
            "LiveV24_3",
            (0.62, 0.88, 1.0),
            (0.44, 0.92, 1.0),
            (0.58, 0.92, 1.0),
            (0.52, 0.95, 1.0),
            (0.10, 0.18, 0.28),
            (0.16, 0.22, 0.34),
            (0.68, 0.92, 1.0),
            (0.54, 0.90, 1.0),
            (3.36, 0.14, 0.0),
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
        tag,
        beam_c,
        mote_c,
        bokeh_c,
        sfx_fill_c,
        sfx_rim_c,
        crowd_c,
        precip_c,
        ripple_c,
        loc,
        rot_z,
    ) in live_zones:
        before = set(v24_scene.objects)
        build_slit_godray_sequence_bay(v24_scene, open_r, tag, beam_c)
        add_atmospheric_bokeh_layer(v24_scene, open_r, mote_s, tag, mote_c, bokeh_c)
        add_zdepth_3d_sfx_stamp(v24_scene, sfx_m, tag, sfx_fill_c, sfx_rim_c)
        add_shared_datum_crowd_silhouettes(v24_scene, crowd_p, tag, crowd_c, beam_c)
        add_datum_occluded_weather_and_ripples(v24_scene, open_r, weather_m, tag, precip_c, ripple_c)
        created = [o for o in v24_scene.objects if o not in before and o.type == "MESH"]
        min_z = min((o.matrix_world @ Vector(c)).z for o in created for c in o.bound_box)
        grp = bpy.data.objects.new(grp_name, None)
        v24_scene.collection.objects.link(grp)
        for o in created:
            if o.parent is None:
                o.location.z -= min_z
                o.parent = grp
        grp.location = loc
        grp.rotation_euler = (0.0, 0.0, rot_z)

    target = Vector((0.0, 0.10, 1.38))
    for lname, energy, color, lpos in (
        ("Weather_RainDusk_5200K", 1980.0, (0.84, 0.92, 1.0), (-3.6, 4.2, 4.3)),
        ("Weather_WinterSalon_3800K", 2120.0, (1.0, 0.88, 0.74), (0.0, 4.4, 4.2)),
        ("Weather_TempestSurge_8600K", 2250.0, (0.62, 0.90, 1.0), (3.6, 4.2, 4.3)),
        ("Weather_DarkroomFill_5400K", 1380.0, (0.92, 0.94, 0.98), (0.0, -4.9, 3.8)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.color = color
        ldata.size = 3.6
        lobj = bpy.data.objects.new(lname, ldata)
        v24_scene.collection.objects.link(lobj)
        lobj.location = Vector(lpos)
        lobj.rotation_euler = (target - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()

    v_world = bpy.data.worlds.get("WeatherOcclusionWorldV24") or bpy.data.worlds.new("WeatherOcclusionWorldV24")
    v_world.use_nodes = True
    bg = v_world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.06, 0.07, 0.09), 1.0)
        bg.inputs[1].default_value = 0.88
    v24_scene.world = v_world

    cdata = bpy.data.cameras.new("WeatherDualFocalCam48mm")
    cdata.lens = 48.0
    if hasattr(cdata, "dof"):
        cdata.dof.use_dof = True
        cdata.dof.aperture_fstop = 2.6
        cdata.dof.focus_distance = 10.25
    cam = bpy.data.objects.new("WeatherDualFocalCam48mm", cdata)
    v24_scene.collection.objects.link(cam)
    v24_scene.camera = cam
    cam.location = Vector((0.0, -10.25, 2.38))
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
        "schema": "toonstudio.blender-weather-occlusion-motion.v24",
        "createdAt": "2026-11-18",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {blender_ver} (scripts/blender/generate_weather_occlusion_v24.py · Datum Weather Occlusion, Dual-Focal & Motion SHA-256 verified)",
        "tool": f"Blender {blender_ver}",
        "blenderVersion": blender_ver,
        "units": "meter",
        "upAxis": "Y",
        "weatherOcclusionColliderSpec": {
            "eavesLintelHeightM": 2.4,
            "railingShieldHeightM": 1.1,
            "exteriorWeatherMinYM": 0.96,
            "indoorCeilingLeakCount": 0,
        },
        "supportedLocalizationSlots": ["KO", "EN", "JA"],
        "externalSources": [],
        "sceneIsolationAudit": isolation_audit,
        "files": [
            {
                "file": m["file"],
                "openRatio": m["openRatio"],
                "weatherMode": m["weatherMode"],
                "apertureFStop": m["apertureFStop"],
                "kelvin": m["kelvin"],
                "indoorWetReachM": m["indoorWetReachM"],
                "indoorRippleCount": m["indoorRippleCount"],
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
        f"- `{m['file']}` — {m['labelKo']} ({m['triangles']} tris, {m['weatherMode']}, 실내 파문 {m['indoorWetReachM']}m, SHA-256 `{m['sha256']}`)"
        for m in sorted(manifest, key=lambda r: str(r["file"]))
    )
    (OUTPUT_DIR / "LICENSES.md").write_text(
        "# ToonStudio Blender 5.3 Architectural Weather Occlusion · Wet-Floor Ripples Kit V24 — 라이선스 및 규격 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_weather_occlusion_v24.py`, Blender {blender_ver})\n"
        "- 기상 차폐 기준: `2.40m` 상인방·`1.10m` 난간 콜라이더 기준 실외(`y >= 0.96m`) 강우/설화 분리 및 개폐율 비례 실내 스페큘러 파문(`0.38m ~ 1.04m`)\n"
        "- 확장 호환: 듀얼 포컬(`24mm` 배경 × `85mm` 인물) · `.toonmotion.json` 2.5D 시차 · `KO/EN/JA` 다국어 효과음 슬롯\n"
        "- 검증: 매니폴드 결함 0건 · 보존 씬 SHA-256 무손실 격리 검증 완료\n\n"
        "## 포함 파일 목록 (총 3종)\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return {"exported": manifest, "sceneIsolationAudit": isolation_audit}


if __name__ == "__main__":
    print(json.dumps(run_v24_pipeline(), indent=2, ensure_ascii=False))
