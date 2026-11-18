"""ToonStudio Expanded Genre Set (Academy Rooftop · Noir Venetian Detective · Hunter Guild Gate) Pack V30 — Blender 5.3.0 생성기 & 기존 씬 SHA-256 격리 검증기.

기존 5대 장르(로판·판타지·현대·무협·SF)와 100% 동일한 공통 건축 기준선(2.76m 기단 · 2.40m 포털 · 1.10m 난간 · 0.74m 책상 · 0.18m 단차)을 공유하는
신규 3대 웹툰 인기 장르(학원물 · 느와르 스릴러 · 헌터 게이트) 수밀 CC0-1.0 배경·듀오 세트 3종을 생성한다:
1) `webtoon-genre-academy-rooftop-corridor-v30.glb` — 학원물 옥상 안전펜스·교실 책상(0.74m)·고백 듀오 베이 (5400K)
2) `webtoon-genre-noir-venetian-detective-v30.glb` — 느와르 베네치안 블라인드 슬릿·탐정 책상(0.74m)·심문 OTS 베이 (4100K)
3) `webtoon-genre-hunter-guild-gate-lobby-v30.glb` — 헌터 길드 육각 마나 게이트(2.40m)·각성 구슬 단말기·돌파 베이 (8200K)
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

from generate_aftermath_damage_v26 import _add_oriented_beveled_box  # noqa: E402
from generate_artisan_atelier_v15 import compute_scene_bounds, ground_scene_meshes  # noqa: E402
from generate_atmospheric_bokeh_dof_v22 import add_atmospheric_bokeh_layer  # noqa: E402
from generate_duo_eyeline_ots_v29 import add_duo_eyeline_and_ots_axis_pass  # noqa: E402
from generate_episode_handoff_v18 import compute_scene_isolation_digest  # noqa: E402
from generate_lumiere_atelier_v16 import make_lumiere_mat, srgb  # noqa: E402
from generate_lumiere_salon_v17 import (  # noqa: E402
    audit_evaluated_mesh_defects,
    clear_only_scene,
    sha256_file,
)
from generate_slit_godray_sequence_v21 import build_slit_godray_sequence_bay  # noqa: E402
from generate_vrm_pose_mannequin_v28 import _add_watertight_capsule_limb  # noqa: E402
from modeler_kit_v13_primitives import (  # noqa: E402
    add_beveled_box,
    add_lathe_solid,
    create_mesh_object,
)

ROOT = SCRIPT_DIR.parents[1]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-genre-expansion-v30"
THUMB_DIR = OUTPUT_DIR / "thumbnails"
TARGET_LIVE_SCENE = "ToonStudio_Genre_Expansion_V30"


def snapshot_preserved_scenes() -> dict[str, dict[str, object]]:
    return {
        s.name: compute_scene_isolation_digest(s)
        for s in bpy.data.scenes
        if s.name not in (TARGET_LIVE_SCENE, "GenreExpansionV30_Export")
    }


def add_expanded_genre_signature_architecture(
    scene: bpy.types.Scene,
    genre_mode: str,
    beat_tag: str,
    primary_srgb: tuple[float, float, float],
    accent_srgb: tuple[float, float, float],
) -> dict[str, object]:
    """학원물·느와르·헌터 길드 장르 고유 건축 소품을 공통 건축 기준선(2.40m / 1.10m / 0.74m / 0.18m)에 맞춰 수밀 메시로 추가한다."""
    mat_pri = make_lumiere_mat(
        f"V30_{beat_tag}_GenrePrimary",
        primary_srgb,
        roughness=0.32,
        metallic=0.22 if genre_mode != "hunter_gate" else 0.76,
        coat_weight=0.50,
    )
    mat_acc = make_lumiere_mat(
        f"V30_{beat_tag}_GenreAccent",
        accent_srgb,
        roughness=0.14,
        metallic=0.35,
        coat_weight=0.85,
        emission_srgb=accent_srgb,
        emission_strength=0.62 if genre_mode == "hunter_gate" else 0.24,
    )

    bm_pri = bmesh.new()
    bm_acc = bmesh.new()

    if genre_mode == "academy_rooftop":
        # 1.10m safety wire-frame style vertical stanchions + 0.74m school desk & textbook stack + blossom petals
        for side in (-1.0, 1.0):
            base_x = side * 0.94
            for k in range(5):
                px = base_x + (k - 2) * 0.14
                _add_oriented_beveled_box(bm_pri, (0.018, 0.018, 0.90), (px, -0.58, 0.63), (0.0, 0.0, 0.0), 0.003)
            _add_oriented_beveled_box(bm_pri, (0.68, 0.032, 0.032), (base_x, -0.58, 1.10), (0.0, 0.0, 0.0), 0.004)
        # School desk at z=0.74m
        _add_oriented_beveled_box(bm_pri, (0.68, 0.44, 0.030), (0.0, -0.18, 0.725), (0.0, 0.0, 0.0), 0.004)
        for sx in (-0.28, 0.28):
            for sy in (-0.36, 0.0):
                _add_oriented_beveled_box(bm_pri, (0.032, 0.032, 0.53), (sx, sy, 0.445), (0.0, 0.0, 0.0), 0.003)
        # Stacked notebooks & milk carton on 0.74m desk
        _add_oriented_beveled_box(bm_acc, (0.22, 0.16, 0.028), (-0.12, -0.18, 0.754), (0.0, 0.0, 0.14), 0.003)
        _add_oriented_beveled_box(bm_acc, (0.07, 0.07, 0.11), (0.16, -0.16, 0.795), (0.0, 0.0, -0.08), 0.004)
        recommended_ink_px = 1.50
    elif genre_mode == "noir_detective":
        # 10 Venetian blind horizontal louvers across upper window + 0.74m heavy detective desk + banker's lamp + case files
        for idx in range(10):
            lz = 1.18 + idx * 0.115
            _add_oriented_beveled_box(bm_pri, (1.84, 0.052, 0.012), (0.0, 0.80, lz), (0.42, 0.0, 0.0), 0.002)
        _add_oriented_beveled_box(bm_pri, (1.06, 0.54, 0.044), (0.0, -0.18, 0.718), (0.0, 0.0, 0.0), 0.005)
        _add_oriented_beveled_box(bm_pri, (0.28, 0.48, 0.52), (-0.36, -0.18, 0.44), (0.0, 0.0, 0.0), 0.005)
        _add_oriented_beveled_box(bm_pri, (0.28, 0.48, 0.52), (0.36, -0.18, 0.44), (0.0, 0.0, 0.0), 0.005)
        # Classic banker's desk lamp + stacked case folders on z=0.74m
        add_lathe_solid(
            bm_acc,
            [(0.005, 0.74), (0.068, 0.748), (0.020, 0.86), (0.095, 0.94), (0.006, 0.96)],
            segments=12,
            center_xyz=(-0.28, -0.22, 0.0),
        )
        for f_i in range(3):
            _add_oriented_beveled_box(
                bm_acc,
                (0.24, 0.18, 0.018),
                (0.20 + 0.02 * f_i, -0.16, 0.749 + f_i * 0.020),
                (0.0, 0.0, 0.18 * (f_i - 1)),
                0.002,
            )
        recommended_ink_px = 2.60
    else:
        # Hunter Guild Gate Lobby: 6-segment hexagonal mana resonance ring inside 2.40m portal + z=0.74m awakening crystal pedestal
        ring_center = (0.0, 0.74, 1.34)
        ring_r = 0.88
        for k in range(6):
            a0 = (k / 6.0) * math.tau
            a1 = ((k + 1) / 6.0) * math.tau
            p0 = (ring_center[0] + math.cos(a0) * ring_r, ring_center[1], ring_center[2] + math.sin(a0) * ring_r)
            p1 = (ring_center[0] + math.cos(a1) * ring_r, ring_center[1], ring_center[2] + math.sin(a1) * ring_r)
            _add_watertight_capsule_limb(bm_acc, p0, p1, 0.044, 0.044, segs=8)
        # Awakening rank-measurement terminal at z=0.74m + floating mana crystal orb
        add_lathe_solid(
            bm_pri,
            [(0.01, 0.18), (0.24, 0.19), (0.16, 0.48), (0.22, 0.74), (0.01, 0.742)],
            segments=10,
            center_xyz=(0.0, -0.18, 0.0),
        )
        add_lathe_solid(
            bm_acc,
            [(0.006, 0.78), (0.11, 0.88), (0.11, 0.98), (0.006, 1.08)],
            segments=10,
            center_xyz=(0.0, -0.18, 0.0),
        )
        recommended_ink_px = 2.40

    bmesh.ops.recalc_face_normals(bm_pri, faces=bm_pri.faces)
    bmesh.ops.recalc_face_normals(bm_acc, faces=bm_acc.faces)

    pri_obj = create_mesh_object(scene, f"GenreV30_{beat_tag}_DatumSet", bm_pri, mat_pri, smooth=True, weighted_normals=True)
    acc_obj = create_mesh_object(scene, f"GenreV30_{beat_tag}_HeroProp", bm_acc, mat_acc, smooth=True, weighted_normals=True)
    pri_obj["genre_mode"] = genre_mode
    acc_obj["recommended_ink_px"] = recommended_ink_px
    pri_obj["psd_layer_tag"] = f"BG_Mid_GenreSet_{genre_mode}"
    acc_obj["psd_layer_tag"] = f"PROP_Mid_HeroSignature_{genre_mode}"

    return {
        "genreMode": genre_mode,
        "recommendedInkPx": recommended_ink_px,
    }


ASSET_SPECS_V30 = [
    (
        "webtoon-genre-academy-rooftop-corridor-v30",
        "학원물 옥상 안전난간·교실 책상(0.74m) 고백 베이 (V30)",
        "Genre 1 (Academy 5400K · 1.50px) School Rooftop & Desk Confession Bay V30",
        "1.10m 옥상 안전펜스·0.74m 교실 책상·24cm 키 차이 청춘 시선 교차 베이",
        "Academy 1.10m rooftop fence, 0.74m school desk & 24cm-gap duo bay",
        0.35,
        "academy_rooftop",
        "rofan_gaze_24cm",
        "petals",
        5400,
        "V30Genre1_Academy",
        (1.0, 0.94, 0.86),
        (1.0, 0.88, 0.92),
        (1.0, 0.94, 0.90),
        (0.74, 0.78, 0.84),
        (0.98, 0.82, 0.88),
        (0.94, 0.95, 0.98),
        (0.98, 0.93, 0.95),
        (0.96, 0.78, 0.42),
    ),
    (
        "webtoon-genre-noir-venetian-detective-v30",
        "느와르 베네치안 블라인드·탐정 책상 심문 OTS 베이 (V30)",
        "Genre 2 (Noir 4100K · 2.60px) Venetian Blind Detective Interrogation Bay V30",
        "10단 베네치안 블라인드 슬릿 그림자·0.74m 탐정 책상·오버더숄더(OTS) 심문 베이",
        "Noir Venetian blind louvers, 0.74m detective desk & OTS interrogation duo",
        0.25,
        "noir_detective",
        "ots_table_dialogue",
        "dust",
        4100,
        "V30Genre2_Noir",
        (1.0, 0.82, 0.56),
        (0.96, 0.84, 0.66),
        (0.92, 0.80, 0.62),
        (0.28, 0.24, 0.22),
        (0.36, 0.74, 0.52),
        (0.84, 0.86, 0.90),
        (0.90, 0.90, 0.92),
        (0.96, 0.74, 0.36),
    ),
    (
        "webtoon-genre-hunter-guild-gate-lobby-v30",
        "헌터 길드 육각 각성 게이트(2.40m)·측정석 로비 베이 (V30)",
        "Genre 3 (Hunter Gate 8200K · 2.40px) Awakened Guild Mana Portal Bay V30",
        "2.40m 육각 마나 공명 게이트·0.74m 각성 측정 구슬·S급 대치 액션 듀오 베이",
        "Hunter guild hexagonal mana gate, 0.74m awakening orb & standoff duo",
        1.0,
        "hunter_gate",
        "action_standoff",
        "embers",
        8200,
        "V30Genre3_Hunter",
        (0.56, 0.88, 1.0),
        (0.42, 0.92, 1.0),
        (0.54, 0.92, 1.0),
        (0.22, 0.26, 0.34),
        (0.38, 0.92, 1.0),
        (0.86, 0.94, 1.0),
        (0.92, 0.96, 1.0),
        (0.44, 0.94, 1.0),
    ),
]


def render_v30_thumbnail(
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

    world = bpy.data.worlds.new("ThumbWorldV30")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        if kelvin <= 4400:
            bg.inputs[0].default_value = (*srgb(0.08, 0.07, 0.08), 1.0)
        elif kelvin >= 7500:
            bg.inputs[0].default_value = (*srgb(0.05, 0.08, 0.12), 1.0)
        else:
            bg.inputs[0].default_value = (*srgb(0.08, 0.10, 0.12), 1.0)
        bg.inputs[1].default_value = 0.92
    scene.world = world

    cam_data = bpy.data.cameras.new("ThumbCamV30")
    cam_data.lens = 54.0
    if hasattr(cam_data, "dof"):
        cam_data.dof.use_dof = True
        cam_data.dof.aperture_fstop = f_stop
    cam_obj = bpy.data.objects.new("ThumbCamV30", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.24
    cam_obj.location = center + Vector((dist * 0.25, -dist * 1.05, dist * 0.22))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    if hasattr(cam_data, "dof"):
        cam_data.dof.focus_distance = (center - cam_obj.location).length
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("V30GenreKey", 990.0, key_col, (0.0, radius * 2.2, radius * 2.0)),
        ("V30GenreFill", 410.0, (0.90, 0.92, 0.98), (-radius * 1.8, -radius * 1.8, radius * 1.5)),
        ("V30GenreRim", 680.0, key_col, (radius * 1.8, -radius * 1.5, radius * 2.0)),
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


def run_v30_pipeline() -> dict[str, object]:
    before_digests = snapshot_preserved_scenes()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith(("V21_V30", "V22_V30", "V29_V30", "V30_")) and mat.users == 0:
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("GenreExpansionV30_Export") or bpy.data.scenes.new("GenreExpansionV30_Export")
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
        genre_mode,
        duo_mode,
        mote_style,
        kelvin,
        tag,
        beam_c,
        mote_c,
        bokeh_c,
        pri_c,
        acc_c,
        lead_a_c,
        lead_b_c,
        axis_c,
    ) in ASSET_SPECS_V30:
        clear_only_scene(export_scene)
        build_slit_godray_sequence_bay(export_scene, open_r, tag, beam_c)
        dof_meta = add_atmospheric_bokeh_layer(export_scene, open_r, mote_style, tag, mote_c, bokeh_c)
        genre_meta = add_expanded_genre_signature_architecture(export_scene, genre_mode, tag, pri_c, acc_c)
        duo_meta = add_duo_eyeline_and_ots_axis_pass(export_scene, duo_mode, tag, lead_a_c, lead_b_c, axis_c)
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
        render_v30_thumbnail(export_scene, mesh_objs, thumb_path, key_col=beam_c, f_stop=dof_meta["fStop"], kelvin=kelvin)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["genre_mode"] = genre_mode
        root["recommended_ink_px"] = genre_meta["recommendedInkPx"]
        root["height_gap_cm"] = duo_meta["heightGapCm"]
        root["shared_datum_compatible"] = True
        root["asset_generator"] = "scripts/blender/generate_genre_expansion_v30.py"
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
                "genreMode": genre_mode,
                "recommendedInkPx": genre_meta["recommendedInkPx"],
                "heightGapCm": duo_meta["heightGapCm"],
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

    # Stage isolated V30 8-Genre Expansion (Academy · Noir · Hunter Gate) Showcase Scene
    v30_scene = bpy.data.scenes.get(TARGET_LIVE_SCENE) or bpy.data.scenes.new(TARGET_LIVE_SCENE)
    v30_scene.unit_settings.system = "METRIC"
    v30_scene.unit_settings.scale_length = 1.0
    v30_scene.render.engine = "BLENDER_EEVEE"
    if hasattr(v30_scene.eevee, "use_raytracing"):
        v30_scene.eevee.use_raytracing = True
    if win is not None:
        win.scene = v30_scene

    clear_only_scene(v30_scene)
    mat_stage = make_lumiere_mat("V30_StageDarkroom", (0.08, 0.09, 0.11), roughness=0.25, coat_weight=0.60)
    mat_rail = make_lumiere_mat("V30_StageBrassDatum", (0.88, 0.72, 0.38), roughness=0.18, metallic=1.0)

    bm_stage = bmesh.new()
    add_beveled_box(bm_stage, (11.2, 4.6, 0.10), (0.0, 0.0, -0.05), 0.012, segments=2)
    create_mesh_object(v30_scene, "GenreExpV30_Gallery_Floor", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_rail = bmesh.new()
    add_beveled_box(bm_rail, (10.6, 0.032, 0.02), (0.0, -0.96, 0.005), 0.004, segments=2)
    create_mesh_object(v30_scene, "GenreExpV30_SharedDatum_Rail", bm_rail, mat_rail, smooth=True, weighted_normals=True)

    live_zones = [
        ("V30Zone1_Academy_Rooftop", ASSET_SPECS_V30[0], "LiveV30_1", (-3.42, 0.14, 0.0), 0.10),
        ("V30Zone2_Noir_Detective", ASSET_SPECS_V30[1], "LiveV30_2", (0.0, 0.22, 0.0), 0.0),
        ("V30Zone3_Hunter_GuildGate", ASSET_SPECS_V30[2], "LiveV30_3", (3.42, 0.14, 0.0), -0.10),
    ]
    for grp_name, spec, tag, loc, rot_z in live_zones:
        (
            _slug,
            _lko,
            _len,
            _dko,
            _den,
            open_r,
            genre_mode,
            duo_mode,
            mote_s,
            _kelvin,
            _stag,
            beam_c,
            mote_c,
            bokeh_c,
            pri_c,
            acc_c,
            lead_a_c,
            lead_b_c,
            axis_c,
        ) = spec
        before = set(v30_scene.objects)
        build_slit_godray_sequence_bay(v30_scene, open_r, tag, beam_c)
        add_atmospheric_bokeh_layer(v30_scene, open_r, mote_s, tag, mote_c, bokeh_c)
        add_expanded_genre_signature_architecture(v30_scene, genre_mode, tag, pri_c, acc_c)
        add_duo_eyeline_and_ots_axis_pass(v30_scene, duo_mode, tag, lead_a_c, lead_b_c, axis_c)
        created = [o for o in v30_scene.objects if o not in before and o.type == "MESH"]
        min_z = min((o.matrix_world @ Vector(c)).z for o in created for c in o.bound_box)
        grp = bpy.data.objects.new(grp_name, None)
        v30_scene.collection.objects.link(grp)
        for o in created:
            if o.parent is None:
                o.location.z -= min_z
                o.parent = grp
        grp.location = loc
        grp.rotation_euler = (0.0, 0.0, rot_z)

    target = Vector((0.0, 0.08, 1.38))
    for lname, energy, color, lpos in (
        ("GenreExp_Academy_5400K", 2100.0, (1.0, 0.94, 0.86), (-3.6, 4.2, 4.3)),
        ("GenreExp_Noir_4100K", 2050.0, (1.0, 0.82, 0.56), (0.0, 4.4, 4.2)),
        ("GenreExp_Hunter_8200K", 2380.0, (0.56, 0.88, 1.0), (3.6, 4.2, 4.3)),
        ("GenreExp_DarkroomFill_5400K", 1420.0, (0.92, 0.94, 0.98), (0.0, -5.0, 3.8)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.color = color
        ldata.size = 3.6
        lobj = bpy.data.objects.new(lname, ldata)
        v30_scene.collection.objects.link(lobj)
        lobj.location = Vector(lpos)
        lobj.rotation_euler = (target - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()

    v_world = bpy.data.worlds.get("GenreExpWorldV30") or bpy.data.worlds.new("GenreExpWorldV30")
    v_world.use_nodes = True
    bg = v_world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.06, 0.07, 0.09), 1.0)
        bg.inputs[1].default_value = 0.88
    v30_scene.world = v_world

    cdata = bpy.data.cameras.new("GenreExpStageCam46mm")
    cdata.lens = 46.0
    if hasattr(cdata, "dof"):
        cdata.dof.use_dof = True
        cdata.dof.aperture_fstop = 2.6
        cdata.dof.focus_distance = 10.45
    cam = bpy.data.objects.new("GenreExpStageCam46mm", cdata)
    v30_scene.collection.objects.link(cam)
    v30_scene.camera = cam
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
        "schema": "toonstudio.blender-genre-expansion.v30",
        "createdAt": "2026-11-18",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {blender_ver} (scripts/blender/generate_genre_expansion_v30.py · Academy, Noir & Hunter Gate Shared-Datum SHA-256 verified)",
        "tool": f"Blender {blender_ver}",
        "blenderVersion": blender_ver,
        "units": "meter",
        "upAxis": "Y",
        "expandedGenreSpec": {
            "totalSupportedWebtoonGenres": 8,
            "newGenres": ["academy_rooftop", "noir_detective", "hunter_gate"],
            "recommendedInkWidthsPx": [1.5, 2.6, 2.4],
            "sharedDatumHeightsM": [2.4, 1.1, 0.74, 0.18],
        },
        "externalSources": [],
        "sceneIsolationAudit": isolation_audit,
        "files": [
            {
                "file": m["file"],
                "genreMode": m["genreMode"],
                "recommendedInkPx": m["recommendedInkPx"],
                "heightGapCm": m["heightGapCm"],
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
        f"- `{m['file']}` — {m['labelKo']} ({m['triangles']} tris, 선굵기 {m['recommendedInkPx']}px, SHA-256 `{m['sha256']}`)"
        for m in sorted(manifest, key=lambda r: str(r["file"]))
    )
    (OUTPUT_DIR / "LICENSES.md").write_text(
        "# ToonStudio Blender 5.3 Expanded Genre Set (Academy · Noir · Hunter Gate) Kit V30 — 라이선스 및 규격 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_genre_expansion_v30.py`, Blender {blender_ver})\n"
        "- 8대 장르 통합 기준선: 기존 5대 장르(로판·판타지·현대·무협·SF)에 학원물(`1.50px`)·느와르(`2.60px`)·헌터 게이트(`2.40px`)를 동일 건축 치수(`2.40m / 1.10m / 0.74m / 0.18m`)로 확장\n"
        "- 검증: 매니폴드 결함 0건 · 보존 씬 SHA-256 무손실 격리 검증 완료\n\n"
        "## 포함 파일 목록 (총 3종)\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return {"exported": manifest, "sceneIsolationAudit": isolation_audit}


if __name__ == "__main__":
    print(json.dumps(run_v30_pipeline(), indent=2, ensure_ascii=False))
