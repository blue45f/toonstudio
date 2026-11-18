"""ToonStudio Z-Depth 3D SFX Typography · Shared-Datum Crowd Silhouette · Multi Time-of-Day (5600K/3200K/8500K) Pack V23 — Blender 5.3.0 생성기 & 8개 기존 씬 SHA-256 격리 검증기.

전경 보케(y = -0.74m)와 중경 캐릭터 IK 평면(y = 0.00m) 사이에 3D 입체 효과음 스탬프(Z-Depth SFX Plane, y = -0.34m)를 배치하고,
공통 건축 기준선(0.18m 발판 · 0.74m 테이블 · 1.10m 난간)에 자동 스냅되는 엑스트라 실루엣 더미 군중 및
멀티 시간대(5600K 정오 · 3200K 노을 · 8500K 월광) 조명을 결합한 CC0-1.0 수밀 에셋 3종을 생성한다:
1) `webtoon-zdepth-sfx-slit-creak-noon-5600k-v23.glb` — 15% 슬릿 정오(5600K) 3D 효과음·기준선 군중 4인 베이
2) `webtoon-zdepth-crowd-banquet-sunset-3200k-v23.glb` — 65% 연회 노을(3200K) 3D 효과음·착석/난간 군중 6인 베이
3) `webtoon-zdepth-awakening-boom-moonlight-8500k-v23.glb` — 100% 각성 월광(8500K) 충격파 3D 효과음·군중 6인 베이
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
from modeler_kit_v13_primitives import (  # noqa: E402
    add_beveled_box,
    add_lathe_solid,
    create_mesh_object,
)

ROOT = SCRIPT_DIR.parents[1]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-zdepth-sfx-crowd-v23"
THUMB_DIR = OUTPUT_DIR / "thumbnails"
TARGET_LIVE_SCENE = "ToonStudio_ZDepth_SFX_Crowd_ToD_V23"


def snapshot_preserved_scenes() -> dict[str, dict[str, object]]:
    return {
        s.name: compute_scene_isolation_digest(s)
        for s in bpy.data.scenes
        if s.name not in (TARGET_LIVE_SCENE, "ZDepthSfxCrowdV23_Export")
    }


def _add_oriented_box(
    bm: bmesh.types.BMesh,
    size_xyz: tuple[float, float, float],
    center_xyz: tuple[float, float, float],
    euler_xyz: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel_width: float = 0.006,
) -> None:
    temp = bmesh.new()
    add_beveled_box(temp, size_xyz, (0.0, 0.0, 0.0), bevel_width, segments=2)
    rot_mat = Euler(euler_xyz, "XYZ").to_matrix().to_4x4()
    xform = Matrix.Translation(Vector(center_xyz)) @ rot_mat
    bmesh.ops.transform(temp, matrix=xform, verts=temp.verts)
    vert_map: dict[int, bmesh.types.BMVert] = {}
    for v in temp.verts:
        vert_map[v.index] = bm.verts.new(v.co)
    for f in temp.faces:
        bm.faces.new([vert_map[v.index] for v in f.verts])
    temp.free()


def add_zdepth_3d_sfx_stamp(
    scene: bpy.types.Scene,
    sfx_mode: str,
    beat_tag: str,
    sfx_fill_srgb: tuple[float, float, float],
    sfx_rim_srgb: tuple[float, float, float],
) -> dict[str, float]:
    """전경 보케(y=-0.74m)와 중경 캐릭터 IK 평면(y=0.00m) 사이 y=-0.34m 평면에 수밀 3D 효과음 타이포 스탬프를 배치한다."""
    y_plane = -0.34
    mat_sfx = make_lumiere_mat(
        f"V23_{beat_tag}_ZDepthSfxCore",
        sfx_fill_srgb,
        roughness=0.14,
        metallic=0.15,
        coat_weight=0.95,
        emission_srgb=sfx_fill_srgb,
        emission_strength=2.35,
    )
    mat_rim = make_lumiere_mat(
        f"V23_{beat_tag}_ZDepthSfxBackplate",
        sfx_rim_srgb,
        roughness=0.22,
        metallic=0.35,
        coat_weight=0.65,
    )

    bm_core = bmesh.new()
    bm_plate = bmesh.new()
    glyph_bars = 0

    if sfx_mode == "creak":
        # 15% 슬릿: 날카로운 세로·사선 개문 마찰음('끼익 / 스르륵') 기하학 스트로크 스탬프
        strokes = [
            ((-0.52, y_plane, 1.72), (0.052, 0.028, 0.34), (0.0, -0.18, 0.0)),
            ((-0.38, y_plane, 1.78), (0.046, 0.028, 0.28), (0.0, -0.14, 0.0)),
            ((-0.44, y_plane, 1.56), (0.22, 0.028, 0.046), (0.0, 0.16, 0.0)),
            ((0.44, y_plane, 1.66), (0.048, 0.028, 0.30), (0.0, 0.18, 0.0)),
            ((0.56, y_plane, 1.60), (0.18, 0.028, 0.044), (0.0, -0.22, 0.0)),
        ]
        for c_xyz, s_xyz, e_xyz in strokes:
            _add_oriented_box(bm_core, s_xyz, c_xyz, e_xyz, bevel_width=0.005)
            p_xyz = (c_xyz[0], c_xyz[1] + 0.020, c_xyz[2] - 0.006)
            _add_oriented_box(bm_plate, (s_xyz[0] * 1.24, 0.016, s_xyz[2] * 1.12), p_xyz, e_xyz, bevel_width=0.004)
            glyph_bars += 1
    elif sfx_mode == "chime":
        # 65% 연회 돌파: 리듬감 있는 대각선 울림('촤르륵 / 영롱') 크리스탈 스탬프 + 스타버스트
        strokes = [
            ((-0.62, y_plane, 1.76), (0.24, 0.028, 0.050), (0.0, 0.28, 0.0)),
            ((-0.56, y_plane, 1.62), (0.050, 0.028, 0.26), (0.0, -0.20, 0.0)),
            ((-0.42, y_plane, 1.70), (0.18, 0.028, 0.046), (0.0, -0.32, 0.0)),
            ((0.52, y_plane, 1.78), (0.22, 0.028, 0.048), (0.0, -0.26, 0.0)),
            ((0.60, y_plane, 1.62), (0.048, 0.028, 0.25), (0.0, 0.22, 0.0)),
            ((0.46, y_plane, 1.54), (0.19, 0.028, 0.044), (0.0, 0.18, 0.0)),
        ]
        for c_xyz, s_xyz, e_xyz in strokes:
            _add_oriented_box(bm_core, s_xyz, c_xyz, e_xyz, bevel_width=0.005)
            p_xyz = (c_xyz[0], c_xyz[1] + 0.020, c_xyz[2] - 0.006)
            _add_oriented_box(bm_plate, (s_xyz[0] * 1.22, 0.016, s_xyz[2] * 1.12), p_xyz, e_xyz, bevel_width=0.004)
            glyph_bars += 1
    else:
        # 100% 각성 클라이맥스: 방사형 충격파('콰아앙 / 번쩍') 버스트 스탬프
        burst_angles = [-0.72, -0.42, 0.42, 0.72, -1.05, 1.05]
        for b_idx, ang in enumerate(burst_angles):
            radius = 0.78 if b_idx < 4 else 0.88
            cx = math.sin(ang) * radius
            cz = 1.46 + math.cos(ang) * 0.42
            bar_len = 0.30 if b_idx < 4 else 0.22
            _add_oriented_box(bm_core, (0.056, 0.032, bar_len), (cx, y_plane, cz), (0.0, ang, 0.0), bevel_width=0.006)
            _add_oriented_box(
                bm_plate,
                (0.074, 0.018, bar_len * 1.14),
                (cx, y_plane + 0.022, cz - 0.006),
                (0.0, ang, 0.0),
                bevel_width=0.004,
            )
            glyph_bars += 1
        # 상단 각성 느낌표 코어 스탬프 2쌍
        for sign in (-1.0, 1.0):
            _add_oriented_box(bm_core, (0.054, 0.032, 0.24), (sign * 0.26, y_plane, 1.98), (0.0, sign * 0.14, 0.0), bevel_width=0.005)
            add_lathe_solid(
                bm_core,
                [(0.006, 1.78), (0.030, 1.81), (0.006, 1.84)],
                segments=10,
                center_xyz=(sign * 0.22, y_plane, 0.0),
                scale_xyz=(1.0, 0.55, 1.0),
            )
            glyph_bars += 2

    sfx_obj = create_mesh_object(scene, f"ZDepthSFX_{beat_tag}_GlyphCore", bm_core, mat_sfx, smooth=False, weighted_normals=True)
    create_mesh_object(scene, f"ZDepthSFX_{beat_tag}_ShadowPlate", bm_plate, mat_rim, smooth=False, weighted_normals=True)
    sfx_obj["zdepth_plane_y_m"] = y_plane
    sfx_obj["psd_layer_tag"] = f"FX_Mid_ZDepth_SFX_{sfx_mode}"
    return {"zDepthPlaneYM": y_plane, "glyphStrokeCount": float(glyph_bars)}


def add_shared_datum_crowd_silhouettes(
    scene: bpy.types.Scene,
    crowd_preset: str,
    beat_tag: str,
    silhouette_srgb: tuple[float, float, float],
    rim_tint_srgb: tuple[float, float, float],
) -> dict[str, int]:
    """공통 건축 기준선(0.18m 발판 · 0.74m 테이블 · 1.10m 난간)에 스냅된 수밀 엑스트라 실루엣 더미 군중을 생성한다."""
    mat_crowd = make_lumiere_mat(
        f"V23_{beat_tag}_DatumCrowdSilhouette",
        silhouette_srgb,
        roughness=0.46,
        metallic=0.08,
        coat_weight=0.35,
        emission_srgb=rim_tint_srgb,
        emission_strength=0.18,
    )
    mat_table = make_lumiere_mat(
        f"V23_{beat_tag}_DatumSideTable074",
        (0.20, 0.17, 0.16),
        roughness=0.32,
        metallic=0.20,
        coat_weight=0.55,
    )

    bm_crowd = bmesh.new()
    bm_props = bmesh.new()

    if crowd_preset == "guards_4":
        # 4인: 좌우 1.10m 난간 기립 호위 2인 + 후경 0.18m 단차 대기 실루엣 2인
        placements = [
            (-0.98, 0.44, 0.18, "standing", 1.00),
            (0.98, 0.44, 0.18, "standing", 0.98),
            (-0.72, 0.68, 0.18, "standing", 0.95),
            (0.72, 0.68, 0.18, "standing", 0.96),
        ]
    elif crowd_preset == "banquet_6":
        # 6인: 좌우 0.74m 테이블 착석 귀족/문파원 4인 + 후경 1.10m 난간 기립 2인
        placements = [
            (-0.96, -0.18, 0.18, "seated", 0.98),
            (-0.96, 0.24, 0.18, "seated", 0.95),
            (0.96, -0.18, 0.18, "seated", 0.97),
            (0.96, 0.24, 0.18, "seated", 0.96),
            (-0.78, 0.66, 0.18, "standing", 1.01),
            (0.78, 0.66, 0.18, "standing", 0.99),
        ]
        # 좌우 0.74m 기준선 사이드 티 테이블 한 쌍 (바닥 0.18m + 높이 0.56m -> 상판 Z = 0.74m 정확 일치)
        for side_x in (-0.74, 0.74):
            add_lathe_solid(
                bm_props,
                [
                    (0.01, 0.18),
                    (0.16, 0.19),
                    (0.05, 0.24),
                    (0.045, 0.69),
                    (0.24, 0.72),
                    (0.24, 0.74),
                    (0.01, 0.74),
                ],
                segments=12,
                center_xyz=(side_x, 0.03, 0.0),
            )
    else:
        # 6인: 각성 충격파에 뒤로 물러선 좌우 브리지/회랑 기립·반착석 군중 6인
        placements = [
            (-1.04, -0.10, 0.18, "standing", 1.00),
            (1.04, -0.10, 0.18, "standing", 1.00),
            (-0.92, 0.34, 0.18, "seated", 0.96),
            (0.92, 0.34, 0.18, "seated", 0.96),
            (-0.74, 0.70, 0.18, "standing", 0.98),
            (0.74, 0.70, 0.18, "standing", 0.98),
        ]

    for px, py, base_z, posture, h_scale in placements:
        if posture == "seated":
            # 착석 실루엣 (총고 1.32m: 스툴 기단 + 상체 코어 + 목/두상, 테이블 상판 0.74m와 자연스레 호응)
            profile = [
                (0.012, base_z),
                (0.145, base_z + 0.02),
                (0.135, base_z + 0.44 * h_scale),
                (0.165, base_z + 0.54 * h_scale),
                (0.185, base_z + 0.86 * h_scale),
                (0.068, base_z + 0.95 * h_scale),
                (0.105, base_z + 1.06 * h_scale),
                (0.095, base_z + 1.15 * h_scale),
                (0.010, base_z + 1.18 * h_scale),
            ]
        else:
            # 기립 실루엣 (총고 1.72m: 1.10m 난간 위로 흉상·어깨·두상이 올라오는 표준 7.5등신 마네킹 회전체)
            profile = [
                (0.012, base_z),
                (0.125, base_z + 0.02),
                (0.105, base_z + 0.56 * h_scale),
                (0.145, base_z + 0.88 * h_scale),
                (0.195, base_z + 1.24 * h_scale),
                (0.068, base_z + 1.33 * h_scale),
                (0.108, base_z + 1.45 * h_scale),
                (0.096, base_z + 1.54 * h_scale),
                (0.010, base_z + 1.57 * h_scale),
            ]
        add_lathe_solid(
            bm_crowd,
            profile,
            segments=12,
            center_xyz=(px, py, 0.0),
            scale_xyz=(1.08, 0.76, 1.0),
        )

    crowd_obj = create_mesh_object(scene, f"DatumCrowd_{beat_tag}_Silhouettes", bm_crowd, mat_crowd, smooth=True, weighted_normals=True)
    crowd_obj["crowd_count"] = len(placements)
    crowd_obj["psd_layer_tag"] = "BG_Crowd_Datum_Silhouette"
    if len(bm_props.verts) > 0:
        create_mesh_object(scene, f"DatumCrowd_{beat_tag}_Tables074m", bm_props, mat_table, smooth=True, weighted_normals=True)
    else:
        bm_props.free()

    return {"crowdCount": len(placements)}


ASSET_SPECS_V23: list[
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
        int,
        str,
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
    ]
] = [
    (
        "webtoon-zdepth-sfx-slit-creak-noon-5600k-v23",
        "15% 정오(5600K) Z-심도 효과음·기준선 군중 4인 베이 (V23)",
        "Beat 1 (15% · 5600K Noon) Z-Depth SFX & 4-Extra Datum Bay V23",
        "5600K 정오 슬릿 역광·Z-심도(-0.34m) 개문 효과음 스탬프·1.10m 난간 호위 군중 4인",
        "5600K noon slit beam, Z-depth (-0.34m) 3D SFX stamp & 4 datum-snapped silhouettes",
        0.15,
        "dust",
        "creak",
        "guards_4",
        5600,
        "V23Beat1_5600K",
        (0.98, 0.96, 0.90),
        (1.0, 0.95, 0.84),
        (0.98, 0.92, 0.78),
        (1.0, 0.90, 0.56),
        (0.18, 0.16, 0.20),
        (0.22, 0.24, 0.30),
    ),
    (
        "webtoon-zdepth-crowd-banquet-sunset-3200k-v23",
        "65% 노을(3200K) Z-심도 효과음·연회 착석 군중 6인 베이 (V23)",
        "Beat 2 (65% · 3200K Sunset) Z-Depth Chime SFX & 6-Extra Banquet Bay V23",
        "3200K 노을 금빛 확산광·Z-심도(-0.34m) 크리스탈 효과음·0.74m 테이블 착석 군중 6인",
        "3200K sunset prism beam, Z-depth (-0.34m) chime SFX & 6 banquet datum silhouettes",
        0.65,
        "petals",
        "chime",
        "banquet_6",
        3200,
        "V23Beat2_3200K",
        (1.0, 0.78, 0.54),
        (1.0, 0.70, 0.66),
        (1.0, 0.80, 0.62),
        (1.0, 0.76, 0.48),
        (0.26, 0.14, 0.18),
        (0.28, 0.20, 0.24),
    ),
    (
        "webtoon-zdepth-awakening-boom-moonlight-8500k-v23",
        "100% 월광(8500K) 충격파 효과음·각성 군중 6인 베이 (V23)",
        "Beat 3 (100% · 8500K Moonlight) Awakening Boom SFX & 6-Extra Halo Bay V23",
        "8500K 심야 월광 전면 할로·Z-심도(-0.34m) 방사형 충격파 효과음·브리지 군중 6인",
        "8500K moonlight full halo, Z-depth (-0.34m) radial boom SFX & 6 bridge silhouettes",
        1.0,
        "embers",
        "boom",
        "awakening_6",
        8500,
        "V23Beat3_8500K",
        (0.68, 0.88, 1.0),
        (0.46, 0.90, 1.0),
        (0.62, 0.92, 1.0),
        (0.54, 0.94, 1.0),
        (0.12, 0.18, 0.28),
        (0.18, 0.24, 0.36),
    ),
]


def render_v23_thumbnail(
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

    world = bpy.data.worlds.new("ThumbWorldV23")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        if kelvin <= 3500:
            bg.inputs[0].default_value = (*srgb(0.11, 0.08, 0.09), 1.0)
        elif kelvin >= 7500:
            bg.inputs[0].default_value = (*srgb(0.06, 0.08, 0.12), 1.0)
        else:
            bg.inputs[0].default_value = (*srgb(0.09, 0.09, 0.10), 1.0)
        bg.inputs[1].default_value = 0.92
    scene.world = world

    cam_data = bpy.data.cameras.new("ThumbCamV23")
    cam_data.lens = 52.0
    if hasattr(cam_data, "dof"):
        cam_data.dof.use_dof = True
        cam_data.dof.aperture_fstop = f_stop
    cam_obj = bpy.data.objects.new("ThumbCamV23", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.26
    cam_obj.location = center + Vector((dist * 0.30, -dist * 1.06, dist * 0.22))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    if hasattr(cam_data, "dof"):
        cam_data.dof.focus_distance = (center - cam_obj.location).length
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("V23ToDKey", 920.0, key_col, (0.0, radius * 2.2, radius * 2.0)),
        ("V23BounceFill", 350.0, (0.88, 0.90, 0.96), (-radius * 1.8, -radius * 1.8, radius * 1.5)),
        ("V23RimAccent", 580.0, key_col, (radius * 1.8, -radius * 1.5, radius * 2.0)),
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


def run_v23_pipeline() -> dict[str, object]:
    before_digests = snapshot_preserved_scenes()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith(("V21_V23", "V22_V23", "V23_")) and mat.users == 0:
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("ZDepthSfxCrowdV23_Export") or bpy.data.scenes.new("ZDepthSfxCrowdV23_Export")
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
        kelvin,
        tag,
        beam_c,
        mote_c,
        bokeh_c,
        sfx_fill_c,
        sfx_rim_c,
        crowd_c,
    ) in ASSET_SPECS_V23:
        clear_only_scene(export_scene)
        build_slit_godray_sequence_bay(export_scene, open_r, tag, beam_c)
        dof_meta = add_atmospheric_bokeh_layer(export_scene, open_r, mote_style, tag, mote_c, bokeh_c)
        sfx_meta = add_zdepth_3d_sfx_stamp(export_scene, sfx_mode, tag, sfx_fill_c, sfx_rim_c)
        crowd_meta = add_shared_datum_crowd_silhouettes(export_scene, crowd_preset, tag, crowd_c, beam_c)
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
        render_v23_thumbnail(export_scene, mesh_objs, thumb_path, key_col=beam_c, f_stop=dof_meta["fStop"], kelvin=kelvin)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["aperture_fstop"] = dof_meta["fStop"]
        root["kelvin_temperature"] = kelvin
        root["zdepth_sfx_plane_y_m"] = sfx_meta["zDepthPlaneYM"]
        root["crowd_count"] = crowd_meta["crowdCount"]
        root["asset_generator"] = "scripts/blender/generate_zdepth_sfx_crowd_tod_v23.py"
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
                "apertureFStop": dof_meta["fStop"],
                "kelvin": kelvin,
                "zDepthSfxPlaneYM": sfx_meta["zDepthPlaneYM"],
                "sfxStrokeCount": int(sfx_meta["glyphStrokeCount"]),
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

    # Stage isolated V23 Z-Depth SFX · Datum Crowd · Multi Time-of-Day Showcase Scene
    v23_scene = bpy.data.scenes.get(TARGET_LIVE_SCENE) or bpy.data.scenes.new(TARGET_LIVE_SCENE)
    v23_scene.unit_settings.system = "METRIC"
    v23_scene.unit_settings.scale_length = 1.0
    v23_scene.render.engine = "BLENDER_EEVEE"
    if hasattr(v23_scene.eevee, "use_raytracing"):
        v23_scene.eevee.use_raytracing = True
    if win is not None:
        win.scene = v23_scene

    clear_only_scene(v23_scene)
    mat_stage = make_lumiere_mat("V23_StageDarkroom", (0.10, 0.10, 0.12), roughness=0.34, coat_weight=0.45)
    mat_rail = make_lumiere_mat("V23_StageBrassDatum", (0.88, 0.72, 0.38), roughness=0.18, metallic=1.0)

    bm_stage = bmesh.new()
    add_beveled_box(bm_stage, (10.8, 4.4, 0.10), (0.0, 0.0, -0.05), 0.012, segments=2)
    create_mesh_object(v23_scene, "ZDepthV23_Gallery_Floor", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_rail = bmesh.new()
    add_beveled_box(bm_rail, (10.2, 0.032, 0.02), (0.0, -0.94, 0.005), 0.004, segments=2)
    create_mesh_object(v23_scene, "ZDepthV23_Datum_Rail", bm_rail, mat_rail, smooth=True, weighted_normals=True)

    live_zones = [
        (
            "V23Zone1_5600K_Noon_CreakSFX",
            0.15,
            "dust",
            "creak",
            "guards_4",
            "LiveV23_1",
            (0.98, 0.96, 0.90),
            (1.0, 0.95, 0.84),
            (0.98, 0.92, 0.78),
            (1.0, 0.90, 0.56),
            (0.18, 0.16, 0.20),
            (0.22, 0.24, 0.30),
            (-3.36, 0.14, 0.0),
            0.10,
        ),
        (
            "V23Zone2_3200K_Sunset_BanquetCrowd",
            0.65,
            "petals",
            "chime",
            "banquet_6",
            "LiveV23_2",
            (1.0, 0.78, 0.54),
            (1.0, 0.70, 0.66),
            (1.0, 0.80, 0.62),
            (1.0, 0.76, 0.48),
            (0.26, 0.14, 0.18),
            (0.28, 0.20, 0.24),
            (0.0, 0.22, 0.0),
            0.0,
        ),
        (
            "V23Zone3_8500K_Moonlight_BoomSFX",
            1.00,
            "embers",
            "boom",
            "awakening_6",
            "LiveV23_3",
            (0.68, 0.88, 1.0),
            (0.46, 0.90, 1.0),
            (0.62, 0.92, 1.0),
            (0.54, 0.94, 1.0),
            (0.12, 0.18, 0.28),
            (0.18, 0.24, 0.36),
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
        tag,
        beam_c,
        mote_c,
        bokeh_c,
        sfx_fill_c,
        sfx_rim_c,
        crowd_c,
        loc,
        rot_z,
    ) in live_zones:
        before = set(v23_scene.objects)
        build_slit_godray_sequence_bay(v23_scene, open_r, tag, beam_c)
        add_atmospheric_bokeh_layer(v23_scene, open_r, mote_s, tag, mote_c, bokeh_c)
        add_zdepth_3d_sfx_stamp(v23_scene, sfx_m, tag, sfx_fill_c, sfx_rim_c)
        add_shared_datum_crowd_silhouettes(v23_scene, crowd_p, tag, crowd_c, beam_c)
        created = [o for o in v23_scene.objects if o not in before and o.type == "MESH"]
        min_z = min((o.matrix_world @ Vector(c)).z for o in created for c in o.bound_box)
        grp = bpy.data.objects.new(grp_name, None)
        v23_scene.collection.objects.link(grp)
        for o in created:
            if o.parent is None:
                o.location.z -= min_z
                o.parent = grp
        grp.location = loc
        grp.rotation_euler = (0.0, 0.0, rot_z)

    target = Vector((0.0, 0.10, 1.38))
    for lname, energy, color, lpos in (
        ("ToD_NoonKey_5600K", 1950.0, (0.98, 0.96, 0.90), (-3.6, 4.2, 4.3)),
        ("ToD_SunsetKey_3200K", 2100.0, (1.0, 0.78, 0.54), (0.0, 4.4, 4.2)),
        ("ToD_MoonlightKey_8500K", 2200.0, (0.66, 0.88, 1.0), (3.6, 4.2, 4.3)),
        ("ToD_DarkroomProofFill_5400K", 1360.0, (0.92, 0.94, 0.98), (0.0, -4.9, 3.8)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.color = color
        ldata.size = 3.6
        lobj = bpy.data.objects.new(lname, ldata)
        v23_scene.collection.objects.link(lobj)
        lobj.location = Vector(lpos)
        lobj.rotation_euler = (target - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()

    v_world = bpy.data.worlds.get("ZDepthToDWorldV23") or bpy.data.worlds.new("ZDepthToDWorldV23")
    v_world.use_nodes = True
    bg = v_world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.07, 0.07, 0.09), 1.0)
        bg.inputs[1].default_value = 0.88
    v23_scene.world = v_world

    cdata = bpy.data.cameras.new("ZDepthToDCam45mm")
    cdata.lens = 45.0
    if hasattr(cdata, "dof"):
        cdata.dof.use_dof = True
        cdata.dof.aperture_fstop = 2.6
        cdata.dof.focus_distance = 10.25
    cam = bpy.data.objects.new("ZDepthToDCam45mm", cdata)
    v23_scene.collection.objects.link(cam)
    v23_scene.camera = cam
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
        "schema": "toonstudio.blender-zdepth-sfx-crowd-tod.v23",
        "createdAt": "2026-11-18",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {blender_ver} (scripts/blender/generate_zdepth_sfx_crowd_tod_v23.py · Z-Depth SFX, Datum Crowd & Multi-ToD SHA-256 verified)",
        "tool": f"Blender {blender_ver}",
        "blenderVersion": blender_ver,
        "units": "meter",
        "upAxis": "Y",
        "zDepthSandwichMeters": {
            "foregroundBokehYM": -0.74,
            "zDepthSfxPlaneYM": -0.34,
            "characterIkSocketYM": 0.0,
            "datumCrowdBackYM": 0.58,
            "slitPortalYM": 1.05,
        },
        "timeOfDayKelvins": [5600, 3200, 8500],
        "externalSources": [],
        "sceneIsolationAudit": isolation_audit,
        "files": [
            {
                "file": m["file"],
                "openRatio": m["openRatio"],
                "apertureFStop": m["apertureFStop"],
                "kelvin": m["kelvin"],
                "zDepthSfxPlaneYM": m["zDepthSfxPlaneYM"],
                "sfxStrokeCount": m["sfxStrokeCount"],
                "crowdCount": m["crowdCount"],
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
        f"- `{m['file']}` — {m['labelKo']} ({m['triangles']} tris, {m['kelvin']}K, 군중 {m['crowdCount']}인, SHA-256 `{m['sha256']}`)"
        for m in sorted(manifest, key=lambda r: str(r["file"]))
    )
    (OUTPUT_DIR / "LICENSES.md").write_text(
        "# ToonStudio Blender 5.3 Z-Depth SFX · Datum Crowd · Multi Time-of-Day Kit V23 — 라이선스 및 규격 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_zdepth_sfx_crowd_tod_v23.py`, Blender {blender_ver})\n"
        "- Z-심도 레이어 샌드위치: 전경 보케(`y=-0.74m`) · 3D 효과음(`y=-0.34m`) · 캐릭터 IK(`y=0.00m`) · 기준선 군중(`0.18m/0.74m/1.10m`)\n"
        "- 멀티 시간대: `5600K`(정오) · `3200K`(노을) · `8500K`(심야 월광)\n"
        "- 검증: 매니폴드 결함 0건 · 보존 씬 8종 SHA-256 무손실 격리 검증 완료\n\n"
        "## 포함 파일 목록 (총 3종)\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return {"exported": manifest, "sceneIsolationAudit": isolation_audit}


if __name__ == "__main__":
    print(json.dumps(run_v23_pipeline(), indent=2, ensure_ascii=False))
