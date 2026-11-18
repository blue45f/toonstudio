"""ToonStudio Atmospheric Bokeh Motes & Depth-of-Field (f/1.8~f/5.6) Layer Pack V22 — Blender 5.3.0 생성기 & 7개 기존 씬 SHA-256 격리 검증기.

개폐율(15% · 65% · 100%)에 연동해 보케 입자 밀도(스포트라이트 먼지·로판 금박 꽃잎·심연 마나 결정)와
카메라 피사계 심도(f/1.8 -> f/2.8 -> f/5.6) 전경·중경 레이어를 자동 매핑하는 CC0-1.0 수밀 에셋 3종을 생성한다:
1) `webtoon-bokeh-slit-dust-motes-f18-v22.glb` — 15% 슬릿 스포트라이트 금빛 먼지 보케·f/1.8 심도 베이
2) `webtoon-bokeh-rofan-petal-cascade-f28-v22.glb` — 65% 로판 살롱 금박 꽃잎 보케·f/2.8 중경 심도 베이
3) `webtoon-bokeh-mana-ember-halo-f56-v22.glb` — 100% 각성 시안 마나 결정·f/5.6 전경 할로 베이
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
from generate_episode_handoff_v18 import compute_scene_isolation_digest  # noqa: E402
from generate_lumiere_atelier_v16 import make_lumiere_mat, srgb  # noqa: E402
from generate_lumiere_salon_v17 import (  # noqa: E402
    audit_evaluated_mesh_defects,
    clear_only_scene,
    sha256_file,
)
from generate_slit_godray_sequence_v21 import build_slit_godray_sequence_bay  # noqa: E402
from modeler_kit_v13_primitives import add_lathe_solid, create_mesh_object  # noqa: E402

ROOT = SCRIPT_DIR.parents[1]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-atmospheric-bokeh-v22"
THUMB_DIR = OUTPUT_DIR / "thumbnails"
TARGET_LIVE_SCENE = "ToonStudio_Atmospheric_Bokeh_DoF_V22"


def snapshot_preserved_scenes() -> dict[str, dict[str, object]]:
    return {
        s.name: compute_scene_isolation_digest(s)
        for s in bpy.data.scenes
        if s.name not in (TARGET_LIVE_SCENE, "AtmosphericBokehV22_Export")
    }


def add_atmospheric_bokeh_layer(
    scene: bpy.types.Scene,
    open_ratio: float,
    mote_style: str,
    beat_tag: str,
    mote_srgb: tuple[float, float, float],
    bokeh_srgb: tuple[float, float, float],
) -> dict[str, float]:
    """황금각(Golden-Angle) 나선 분포로 중경 스포트라이트 입자와 전경 아웃포커싱 보케 디스크 레이어를 수밀 메시로 배치한다."""
    clamped = max(0.05, min(1.0, open_ratio))
    slit_half = (0.16 + 1.52 * clamped) * 0.44
    f_stop = round(1.8 if clamped <= 0.2 else (2.8 if clamped <= 0.7 else 5.6), 1)

    mat_mote = make_lumiere_mat(
        f"V22_{beat_tag}_MidgroundMotes",
        mote_srgb,
        roughness=0.10,
        coat_weight=0.90,
        emission_srgb=mote_srgb,
        emission_strength=2.15,
    )
    mat_bokeh = make_lumiere_mat(
        f"V22_{beat_tag}_ForegroundBokehDisc",
        bokeh_srgb,
        roughness=0.05,
        alpha=0.34,
        transmission_weight=0.0,
        coat_weight=1.0,
        emission_srgb=bokeh_srgb,
        emission_strength=1.65,
    )
    if hasattr(mat_bokeh, "surface_render_method"):
        mat_bokeh.surface_render_method = "BLENDED"

    golden_angle = 2.39996323
    mote_count = 16
    bm_motes = bmesh.new()
    for idx in range(mote_count):
        t = (idx + 0.5) / mote_count
        theta = idx * golden_angle
        radial = slit_half * math.sqrt(t) * (0.85 if clamped <= 0.2 else 1.15)
        mx = radial * math.cos(theta)
        my = 0.36 - 0.74 * t + 0.10 * math.sin(theta)
        mz = 0.42 + 1.82 * (1.0 - t * 0.82)
        rad = 0.024 + 0.012 * ((idx % 3) / 2.0)

        if mote_style == "petals":
            add_lathe_solid(
                bm_motes,
                [(0.005, mz - rad * 0.8), (rad * 1.35, mz), (0.005, mz + rad * 0.8)],
                segments=10,
                center_xyz=(mx, my, 0.0),
                scale_xyz=(1.35, 0.42, 1.0),
            )
        elif mote_style == "embers":
            add_lathe_solid(
                bm_motes,
                [(0.005, mz - rad * 1.25), (rad * 1.05, mz), (0.005, mz + rad * 1.35)],
                segments=6,
                center_xyz=(mx, my, 0.0),
            )
        else:
            add_lathe_solid(
                bm_motes,
                [(0.005, mz - rad), (rad, mz), (0.005, mz + rad)],
                segments=10,
                center_xyz=(mx, my, 0.0),
            )
    create_mesh_object(scene, f"Atmospheric_{beat_tag}_MidMotes", bm_motes, mat_mote, smooth=(mote_style != "embers"), weighted_normals=True)

    # Foreground Out-of-Focus Bokeh Discs (y = -0.76..-0.62m) scaled by aperture CoC
    bm_bokeh = bmesh.new()
    fg_count = 6
    fg_radius_base = 0.068 if f_stop <= 1.8 else (0.054 if f_stop <= 2.8 else 0.044)
    for b_idx in range(fg_count):
        bt = (b_idx + 0.5) / fg_count
        bx = -0.92 + 1.84 * bt
        by = -0.74 + 0.06 * math.sin(b_idx * 1.9)
        bz = 0.62 + 1.48 * ((b_idx * 37 % 11) / 10.0)
        br = fg_radius_base * (0.85 + 0.30 * (b_idx % 2))
        add_lathe_solid(
            bm_bokeh,
            [(0.006, bz - br), (br, bz), (0.006, bz + br)],
            segments=12,
            center_xyz=(bx, by, 0.0),
            scale_xyz=(1.0, 0.24, 1.0),
        )
    bokeh_obj = create_mesh_object(scene, f"Atmospheric_{beat_tag}_FgBokehLayer", bm_bokeh, mat_bokeh, smooth=True, weighted_normals=True)
    bokeh_obj["aperture_fstop"] = f_stop
    bokeh_obj["mote_count"] = mote_count + fg_count
    return {"fStop": f_stop, "totalParticles": float(mote_count + fg_count)}


ASSET_SPECS_V22: list[
    tuple[
        str,
        str,
        str,
        str,
        str,
        float,
        str,
        str,
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
    ]
] = [
    (
        "webtoon-bokeh-slit-dust-motes-f18-v22",
        "15% 슬릿 스포트라이트 금빛 먼지 보케·f/1.8 베이 (V22)",
        "Beat 1 (15% · f/1.8) Spotlight Dust Motes & Bokeh Bay V22",
        "f/1.8 대구경 보케(CoC 26.4px)·0.39m 슬릿 집광 먼지 입자·장거리 그림자",
        "f/1.8 shallow DoF bokeh discs & concentrated spotlight dust motes",
        0.15,
        "dust",
        "V22Beat1_F18",
        (1.0, 0.88, 0.62),
        (1.0, 0.92, 0.68),
        (1.0, 0.84, 0.52),
    ),
    (
        "webtoon-bokeh-rofan-petal-cascade-f28-v22",
        "65% 로판 살롱 금박 꽃잎 보케·f/2.8 베이 (V22)",
        "Beat 2 (65% · f/2.8) Rofan Gilded Petal Bokeh Bay V22",
        "f/2.8 중경 심도(CoC 17.0px)·로즈골드 꽃잎 보케 기류·확산 프리즘",
        "f/2.8 mid-aperture swirling gilded rose petals & champagne prism",
        0.65,
        "petals",
        "V22Beat2_F28",
        (0.98, 0.90, 0.80),
        (1.0, 0.72, 0.78),
        (1.0, 0.88, 0.76),
    ),
    (
        "webtoon-bokeh-mana-ember-halo-f56-v22",
        "100% 각성 시안 마나 결정·f/5.6 할로 베이 (V22)",
        "Beat 3 (100% · f/5.6) Awakening Mana Ember Halo Bay V22",
        "f/5.6 팬포커스 할로(CoC 8.5px)·상승 시안 마나 결정·2.4m 실루엣",
        "f/5.6 deep-focus mana crystal embers & wide awakening halo",
        1.0,
        "embers",
        "V22Beat3_F56",
        (0.76, 0.94, 1.0),
        (0.42, 0.92, 1.0),
        (0.66, 0.95, 1.0),
    ),
]


def render_v22_thumbnail(
    scene: bpy.types.Scene,
    mesh_objs: list[bpy.types.Object],
    out_png: Path,
    key_col: tuple[float, float, float],
    f_stop: float,
) -> None:
    center, radius = compute_scene_bounds(mesh_objs)
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene.eevee, "use_raytracing"):
        scene.eevee.use_raytracing = True
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("ThumbWorldV22")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.08, 0.08, 0.10), 1.0)
        bg.inputs[1].default_value = 0.90
    scene.world = world

    cam_data = bpy.data.cameras.new("ThumbCamV22")
    cam_data.lens = 55.0
    if hasattr(cam_data, "dof"):
        cam_data.dof.use_dof = True
        cam_data.dof.aperture_fstop = f_stop
    cam_obj = bpy.data.objects.new("ThumbCamV22", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.28
    cam_obj.location = center + Vector((dist * 0.34, -dist * 1.05, dist * 0.24))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    if hasattr(cam_data, "dof"):
        cam_data.dof.focus_distance = (center - cam_obj.location).length
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("V22BackSlitKey", 880.0, key_col, (0.0, radius * 2.2, radius * 2.1)),
        ("V22FrontFill", 320.0, (0.86, 0.90, 0.96), (-radius * 1.9, -radius * 1.8, radius * 1.5)),
        ("V22Rim", 560.0, key_col, (radius * 1.8, -radius * 1.6, radius * 2.0)),
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


def run_v22_pipeline() -> dict[str, object]:
    before_digests = snapshot_preserved_scenes()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith(("V21_V22", "V22_")) and mat.users == 0:
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("AtmosphericBokehV22_Export") or bpy.data.scenes.new("AtmosphericBokehV22_Export")
    export_scene.unit_settings.system = "METRIC"
    export_scene.unit_settings.scale_length = 1.0
    win = bpy.context.window if bpy.context.window is not None else None
    prev_scene = win.scene if win is not None else None
    if win is not None:
        win.scene = export_scene

    manifest: list[dict[str, object]] = []
    blender_ver = bpy.app.version_string
    for slug, label_ko, label_en, desc_ko, desc_en, open_r, style, tag, beam_c, mote_c, bokeh_c in ASSET_SPECS_V22:
        clear_only_scene(export_scene)
        build_slit_godray_sequence_bay(export_scene, open_r, tag, beam_c)
        dof_meta = add_atmospheric_bokeh_layer(export_scene, open_r, style, tag, mote_c, bokeh_c)
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
        render_v22_thumbnail(export_scene, mesh_objs, thumb_path, key_col=beam_c, f_stop=dof_meta["fStop"])

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["aperture_fstop"] = dof_meta["fStop"]
        root["particle_count"] = int(dof_meta["totalParticles"])
        root["asset_generator"] = "scripts/blender/generate_atmospheric_bokeh_dof_v22.py"
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
                "particleCount": int(dof_meta["totalParticles"]),
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

    # Stage isolated V22 Atmospheric Bokeh & DoF Showcase Scene
    dof_scene = bpy.data.scenes.get(TARGET_LIVE_SCENE) or bpy.data.scenes.new(TARGET_LIVE_SCENE)
    dof_scene.unit_settings.system = "METRIC"
    dof_scene.unit_settings.scale_length = 1.0
    dof_scene.render.engine = "BLENDER_EEVEE"
    if hasattr(dof_scene.eevee, "use_raytracing"):
        dof_scene.eevee.use_raytracing = True
    if win is not None:
        win.scene = dof_scene

    clear_only_scene(dof_scene)
    mat_stage = make_lumiere_mat("V22_StageDarkroom", (0.10, 0.10, 0.12), roughness=0.35, coat_weight=0.44)
    mat_rail = make_lumiere_mat("V22_StageBrassLine", (0.88, 0.72, 0.38), roughness=0.18, metallic=1.0)

    from modeler_kit_v13_primitives import add_beveled_box  # noqa: E402

    bm_stage = bmesh.new()
    add_beveled_box(bm_stage, (10.6, 4.2, 0.10), (0.0, 0.0, -0.05), 0.012, segments=2)
    create_mesh_object(dof_scene, "BokehDoF_Gallery_Floor", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_rail = bmesh.new()
    add_beveled_box(bm_rail, (10.0, 0.032, 0.02), (0.0, -0.92, 0.005), 0.004, segments=2)
    create_mesh_object(dof_scene, "BokehDoF_Datum_Rail", bm_rail, mat_rail, smooth=True, weighted_normals=True)

    for grp_name, open_r, style, tag, beam_c, mote_c, bokeh_c, loc, rot_z in (
        ("BokehZone1_F18_DustMotes", 0.15, "dust", "LiveV22_1", (1.0, 0.88, 0.62), (1.0, 0.92, 0.68), (1.0, 0.84, 0.52), (-3.32, 0.14, 0.0), 0.10),
        ("BokehZone2_F28_RofanPetals", 0.65, "petals", "LiveV22_2", (0.98, 0.90, 0.80), (1.0, 0.72, 0.78), (1.0, 0.88, 0.76), (0.0, 0.22, 0.0), 0.0),
        ("BokehZone3_F56_ManaEmbers", 1.00, "embers", "LiveV22_3", (0.76, 0.94, 1.0), (0.42, 0.92, 1.0), (0.66, 0.95, 1.0), (3.32, 0.14, 0.0), -0.10),
    ):
        before = set(dof_scene.objects)
        build_slit_godray_sequence_bay(dof_scene, open_r, tag, beam_c)
        add_atmospheric_bokeh_layer(dof_scene, open_r, style, tag, mote_c, bokeh_c)
        created = [o for o in dof_scene.objects if o not in before and o.type == "MESH"]
        min_z = min((o.matrix_world @ Vector(c)).z for o in created for c in o.bound_box)
        grp = bpy.data.objects.new(grp_name, None)
        dof_scene.collection.objects.link(grp)
        for o in created:
            if o.parent is None:
                o.location.z -= min_z
                o.parent = grp
        grp.location = loc
        grp.rotation_euler = (0.0, 0.0, rot_z)

    target = Vector((0.0, 0.12, 1.38))
    for lname, energy, color, lpos in (
        ("Bokeh_F18_AmberKey_3200K", 1900.0, (1.0, 0.88, 0.64), (-3.6, 4.2, 4.2)),
        ("Bokeh_F28_RoseGoldKey_4400K", 2050.0, (1.0, 0.90, 0.84), (0.0, 4.4, 4.4)),
        ("Bokeh_F56_ManaCyanKey_8600K", 2150.0, (0.72, 0.94, 1.0), (3.6, 4.2, 4.2)),
        ("Bokeh_DarkroomFill_5400K", 1320.0, (0.92, 0.94, 0.98), (0.0, -4.8, 3.8)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.color = color
        ldata.size = 3.6
        lobj = bpy.data.objects.new(lname, ldata)
        dof_scene.collection.objects.link(lobj)
        lobj.location = Vector(lpos)
        lobj.rotation_euler = (target - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()

    d_world = bpy.data.worlds.get("BokehDoFWorldV22") or bpy.data.worlds.new("BokehDoFWorldV22")
    d_world.use_nodes = True
    bg = d_world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.07, 0.07, 0.09), 1.0)
        bg.inputs[1].default_value = 0.86
    dof_scene.world = d_world

    cdata = bpy.data.cameras.new("BokehDoFCam45mm")
    cdata.lens = 45.0
    if hasattr(cdata, "dof"):
        cdata.dof.use_dof = True
        cdata.dof.aperture_fstop = 2.4
        cdata.dof.focus_distance = 10.15
    cam = bpy.data.objects.new("BokehDoFCam45mm", cdata)
    dof_scene.collection.objects.link(cam)
    dof_scene.camera = cam
    cam.location = Vector((0.0, -10.15, 2.38))
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
        "schema": "toonstudio.blender-atmospheric-bokeh-dof.v22",
        "createdAt": "2026-11-18",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {blender_ver} (scripts/blender/generate_atmospheric_bokeh_dof_v22.py · Bokeh Motes & DoF SHA-256 verified)",
        "tool": f"Blender {blender_ver}",
        "blenderVersion": blender_ver,
        "units": "meter",
        "upAxis": "Y",
        "apertureStops": [1.8, 2.8, 5.6],
        "externalSources": [],
        "sceneIsolationAudit": isolation_audit,
        "files": [
            {
                "file": m["file"],
                "openRatio": m["openRatio"],
                "apertureFStop": m["apertureFStop"],
                "particleCount": m["particleCount"],
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
        "# ToonStudio Blender 5.3 Atmospheric Bokeh & DoF Kit V22 — 라이선스 및 심도 규격 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_atmospheric_bokeh_dof_v22.py`, Blender {blender_ver})\n"
        "- 조리개·보케 연동: `f/1.8`(슬릿 집광 먼지) · `f/2.8`(로판 금박 꽃잎) · `f/5.6`(각성 시안 마나 결정)\n"
        "- 검증: 매니폴드 결함 0건 · 보존 씬 7종 SHA-256 무손실 격리 검증 완료\n\n"
        "## 포함 파일 목록 (총 3종)\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return {"exported": manifest, "sceneIsolationAudit": isolation_audit}


if __name__ == "__main__":
    print(json.dumps(run_v22_pipeline(), indent=2, ensure_ascii=False))
