"""ToonStudio Sub-Genre Hero Props Pack V31 (Academy Locker Bank · Noir Evidence Pinboard · Hunter Rank Kiosk) — Blender 5.3.0 생성기 & 씬 SHA-256 격리 검증기.

V30 8대 장르 배경 베이 내부에 무오차(0.00m)로 스냅되는 세부 장르 서사 핵심 소품(Hero Props) 수밀 CC0-1.0 에셋 3종을 생성한다:
1) `webtoon-prop-academy-locker-shoebox-bank-v31.glb` — 학원물 복도 사물함·신발장 뱅크 & 고백 편지 슬릿(1.32m 도어 핸들 · 0.74m 복도 콘솔, 5400K)
2) `webtoon-prop-noir-evidence-pinboard-cabinet-v31.glb` — 느와르 용의자 레드스트링 수사 핀보드(1.54m 시선 중심) & 0.74m 철제 증거 캐비닛 (4100K)
3) `webtoon-prop-hunter-awakening-rank-kiosk-v31.glb` — 헌터 길드 S급 각성 측정 홀로그램 비석(2.40m 상단 · 0.74m 손바닥 스캔 단말기 · 1.10m 가드, 8200K)
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
from generate_episode_handoff_v18 import compute_scene_isolation_digest  # noqa: E402
from generate_lumiere_atelier_v16 import make_lumiere_mat, srgb  # noqa: E402
from generate_lumiere_salon_v17 import (  # noqa: E402
    audit_evaluated_mesh_defects,
    clear_only_scene,
    sha256_file,
)
from generate_vrm_pose_mannequin_v28 import _add_watertight_capsule_limb  # noqa: E402
from modeler_kit_v13_primitives import (  # noqa: E402
    add_beveled_box,
    add_lathe_solid,
    create_mesh_object,
)

ROOT = SCRIPT_DIR.parents[1]
OUTPUT_DIR = ROOT / "apps/web/public/studio-assets/blender-genre-hero-props-v31"
THUMB_DIR = OUTPUT_DIR / "thumbnails"
TARGET_LIVE_SCENE = "ToonStudio_Genre_HeroProps_V31"


def snapshot_preserved_scenes() -> dict[str, dict[str, object]]:
    return {
        s.name: compute_scene_isolation_digest(s)
        for s in bpy.data.scenes
        if s.name not in (TARGET_LIVE_SCENE, "GenreHeroPropsV31_Export")
    }


def build_subgenre_hero_prop_assembly(
    scene: bpy.types.Scene,
    prop_mode: str,
    tag: str,
    body_srgb: tuple[float, float, float],
    trim_srgb: tuple[float, float, float],
    accent_srgb: tuple[float, float, float],
) -> dict[str, object]:
    """공통 건축 기준선(2.40m / 1.54m / 1.32m / 1.10m / 0.74m / 0.18m)에 맞춘 세부 장르 히어로 소품을 수밀 메시로 생성한다."""
    mat_deck = make_lumiere_mat(f"V31_{tag}_DatumBase", (0.20, 0.22, 0.26), roughness=0.38, coat_weight=0.35)
    mat_body = make_lumiere_mat(
        f"V31_{tag}_PropBody",
        body_srgb,
        roughness=0.28,
        metallic=0.58 if prop_mode != "academy_locker_bank" else 0.42,
        coat_weight=0.55,
    )
    mat_trim = make_lumiere_mat(
        f"V31_{tag}_PropTrim",
        trim_srgb,
        roughness=0.22,
        metallic=0.72,
        coat_weight=0.65,
    )
    mat_acc = make_lumiere_mat(
        f"V31_{tag}_PropStoryAccent",
        accent_srgb,
        roughness=0.14,
        metallic=0.25,
        coat_weight=0.88,
        emission_srgb=accent_srgb,
        emission_strength=0.75 if prop_mode == "hunter_rank_kiosk" else 0.28,
    )

    bm_deck = bmesh.new()
    bm_body = bmesh.new()
    bm_trim = bmesh.new()
    bm_acc = bmesh.new()

    # Shared 2.76m x 1.48m x 0.18m datum plinth so cameras & characters snap identically
    _add_oriented_beveled_box(bm_deck, (2.76, 1.48, 0.18), (0.0, 0.0, 0.09), (0.0, 0.0, 0.0), 0.008)

    if prop_mode == "academy_locker_bank":
        # 6-column x 2-tier high-school locker bank (back y=+0.34), handles at z=1.32m & z=0.78m
        _add_oriented_beveled_box(bm_body, (2.16, 0.42, 1.78), (0.0, 0.34, 1.07), (0.0, 0.0, 0.0), 0.006)
        for col in range(6):
            cx = -0.875 + col * 0.35
            for tier_idx, cz in enumerate((0.68, 1.46)):
                is_hero_open = col == 2 and tier_idx == 1
                if is_hero_open:
                    # Ajar locker door (34 deg open around left hinge) + pink confession letter & textbook inside
                    _add_oriented_beveled_box(
                        bm_trim,
                        (0.32, 0.022, 0.70),
                        (cx - 0.06, 0.04, cz),
                        (0.0, 0.0, -0.58),
                        0.003,
                    )
                    _add_oriented_beveled_box(
                        bm_acc,
                        (0.16, 0.11, 0.016),
                        (cx + 0.02, 0.20, 1.16),
                        (0.18, 0.0, 0.22),
                        0.002,
                    )
                    _add_oriented_beveled_box(
                        bm_acc,
                        (0.06, 0.18, 0.22),
                        (cx - 0.08, 0.24, 1.25),
                        (0.0, 0.08, 0.0),
                        0.003,
                    )
                else:
                    _add_oriented_beveled_box(bm_trim, (0.32, 0.022, 0.70), (cx, 0.12, cz), (0.0, 0.0, 0.0), 0.003)
                    # Latch handle at z=1.32m (upper) / z=0.74m (lower)
                    latch_z = 1.32 if tier_idx == 1 else 0.74
                    _add_oriented_beveled_box(bm_acc, (0.020, 0.028, 0.085), (cx + 0.11, 0.098, latch_z), (0.0, 0.0, 0.0), 0.003)
        # Front hallway shoe-changing bench (z=0.46m) + side 0.74m homeroom console table
        _add_oriented_beveled_box(bm_body, (1.36, 0.34, 0.036), (-0.24, -0.32, 0.442), (0.0, 0.0, 0.0), 0.004)
        for bx in (-0.80, 0.32):
            _add_oriented_beveled_box(bm_trim, (0.04, 0.28, 0.26), (bx, -0.32, 0.31), (0.0, 0.0, 0.0), 0.003)
        _add_oriented_beveled_box(bm_body, (0.58, 0.38, 0.56), (0.88, -0.26, 0.46), (0.0, 0.0, 0.0), 0.005)
        datum_anchor_m = 1.32
        recommended_ink_px = 1.50

    elif prop_mode == "noir_evidence_board":
        # Framed cork investigation pinboard centered at z=1.54m eye-line + twin 0.74m steel filing cabinets
        _add_oriented_beveled_box(bm_trim, (1.84, 0.06, 1.06), (0.0, 0.38, 1.54), (0.0, 0.0, 0.0), 0.006)
        _add_oriented_beveled_box(bm_body, (1.72, 0.03, 0.94), (0.0, 0.345, 1.54), (0.0, 0.0, 0.0), 0.003)
        pin_nodes = [
            (-0.58, 0.318, 1.78),
            (-0.18, 0.318, 1.62),
            (0.24, 0.318, 1.80),
            (0.58, 0.318, 1.56),
            (-0.42, 0.318, 1.32),
            (0.06, 0.318, 1.28),
            (0.46, 0.318, 1.26),
        ]
        for idx, (px, py, pz) in enumerate(pin_nodes):
            tilt = (idx % 3 - 1) * 0.07
            _add_oriented_beveled_box(bm_trim, (0.20, 0.012, 0.24), (px, py + 0.008, pz - 0.04), (0.0, tilt, 0.0), 0.002)
            add_lathe_solid(
                bm_acc,
                [(0.002, 0.0), (0.016, 0.004), (0.016, 0.018), (0.002, 0.024)],
                segments=8,
                center_xyz=(px, py - 0.006, pz + 0.05),
            )
        # 6 watertight 3D red-string links connecting suspect clues
        for i_a, i_b in ((0, 1), (1, 2), (2, 3), (0, 4), (1, 5), (3, 6)):
            p0 = pin_nodes[i_a]
            p1 = pin_nodes[i_b]
            _add_watertight_capsule_limb(
                bm_acc,
                (p0[0], p0[1] - 0.004, p0[2] + 0.055),
                (p1[0], p1[1] - 0.004, p1[2] + 0.055),
                0.0055,
                0.0055,
                segs=6,
            )
        # Twin 0.74m steel evidence cabinets + desk evidence box + brass magnifier
        for sx in (-0.64, 0.64):
            _add_oriented_beveled_box(bm_body, (0.56, 0.48, 0.56), (sx, -0.16, 0.46), (0.0, 0.0, 0.0), 0.006)
            for dz in (0.34, 0.60):
                _add_oriented_beveled_box(bm_trim, (0.48, 0.024, 0.20), (sx, -0.408, dz), (0.0, 0.0, 0.0), 0.003)
        _add_oriented_beveled_box(bm_trim, (0.68, 0.42, 0.036), (0.0, -0.16, 0.722), (0.0, 0.0, 0.0), 0.004)
        _add_oriented_beveled_box(bm_acc, (0.28, 0.20, 0.12), (-0.06, -0.16, 0.80), (0.0, 0.0, 0.12), 0.004)
        datum_anchor_m = 1.54
        recommended_ink_px = 2.60

    else:
        # Hunter Guild S-Rank Awakening Kiosk: 2.40m hexagonal mana obelisk + 0.74m palm-scan terminal + 3 floating rank rings
        add_lathe_solid(
            bm_body,
            [(0.02, 0.18), (0.54, 0.19), (0.46, 0.34), (0.34, 0.56), (0.28, 2.24), (0.16, 2.40), (0.01, 2.402)],
            segments=6,
            center_xyz=(0.0, 0.24, 0.0),
        )
        # 3 concentric hexagonal mana rank rings at z=1.10m, 1.54m, 1.98m
        for ring_z, ring_r in ((1.10, 0.58), (1.54, 0.48), (1.98, 0.38)):
            for k in range(6):
                a0 = (k / 6.0) * math.tau
                a1 = ((k + 1) / 6.0) * math.tau
                p0 = (math.cos(a0) * ring_r, 0.24 + math.sin(a0) * ring_r, ring_z)
                p1 = (math.cos(a1) * ring_r, 0.24 + math.sin(a1) * ring_r, ring_z)
                _add_watertight_capsule_limb(bm_acc, p0, p1, 0.022, 0.022, segs=8)
        # Foreground z=0.74m palm-scan terminal + z=1.10m safety guard rails
        add_lathe_solid(
            bm_trim,
            [(0.01, 0.18), (0.26, 0.19), (0.16, 0.48), (0.24, 0.74), (0.01, 0.742)],
            segments=8,
            center_xyz=(0.0, -0.34, 0.0),
        )
        add_lathe_solid(
            bm_acc,
            [(0.005, 0.76), (0.10, 0.85), (0.10, 0.94), (0.005, 1.02)],
            segments=10,
            center_xyz=(0.0, -0.34, 0.0),
        )
        for side in (-1.0, 1.0):
            gx = side * 0.86
            _add_oriented_beveled_box(bm_trim, (0.04, 0.04, 0.92), (gx, -0.24, 0.64), (0.0, 0.0, 0.0), 0.004)
            _add_oriented_beveled_box(bm_trim, (0.44, 0.036, 0.036), (gx - side * 0.18, -0.24, 1.10), (0.0, 0.0, 0.0), 0.004)
        datum_anchor_m = 0.74
        recommended_ink_px = 2.40

    for bm in (bm_deck, bm_body, bm_trim, bm_acc):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    deck_obj = create_mesh_object(scene, f"PropV31_{tag}_DatumDeck", bm_deck, mat_deck, smooth=True, weighted_normals=True)
    body_obj = create_mesh_object(scene, f"PropV31_{tag}_MainChassis", bm_body, mat_body, smooth=True, weighted_normals=True)
    trim_obj = create_mesh_object(scene, f"PropV31_{tag}_HardwareTrim", bm_trim, mat_trim, smooth=True, weighted_normals=True)
    acc_obj = create_mesh_object(scene, f"PropV31_{tag}_NarrativeClue", bm_acc, mat_acc, smooth=True, weighted_normals=True)
    deck_obj["psd_layer_tag"] = f"BG_DatumPlinth_{prop_mode}"
    body_obj["psd_layer_tag"] = f"PROP_Body_{prop_mode}"
    trim_obj["psd_layer_tag"] = f"PROP_Trim_{prop_mode}"
    acc_obj["psd_layer_tag"] = f"PROP_StoryClue_{prop_mode}"

    return {
        "propMode": prop_mode,
        "datumAnchorM": datum_anchor_m,
        "recommendedInkPx": recommended_ink_px,
    }


ASSET_SPECS_V31 = [
    (
        "webtoon-prop-academy-locker-shoebox-bank-v31",
        "학원물 복도 사물함·신발장 뱅크 & 고백 편지 슬릿 (V31)",
        "Prop 1 (Academy 5400K) Hallway Locker Bank & Confession Letter V31",
        "1.32m 사물함 도어 핸들·34° 반개방 고백 편지·0.74m 복도 콘솔 수밀 세트",
        "Academy 12-bay hallway locker bank, confession letter & 0.74m console",
        "academy_locker_bank",
        5400,
        2.4,
        "V31Prop1_AcademyLocker",
        (1.0, 0.94, 0.88),
        (0.76, 0.82, 0.88),
        (0.58, 0.64, 0.72),
        (0.98, 0.76, 0.84),
    ),
    (
        "webtoon-prop-noir-evidence-pinboard-cabinet-v31",
        "느와르 레드스트링 수사 핀보드(1.54m)·증거 캐비닛 (V31)",
        "Prop 2 (Noir 4100K) Red-String Detective Evidence Pinboard & Cabinets V31",
        "1.54m 시선 중심 용의자 폴라로이드·레드스트링 6링크·0.74m 철제 캐비닛",
        "Noir detective cork pinboard with 3D red strings & 0.74m steel cabinets",
        "noir_evidence_board",
        4100,
        2.2,
        "V31Prop2_NoirBoard",
        (1.0, 0.82, 0.58),
        (0.36, 0.28, 0.22),
        (0.58, 0.54, 0.48),
        (0.88, 0.22, 0.24),
    ),
    (
        "webtoon-prop-hunter-awakening-rank-kiosk-v31",
        "헌터 길드 S급 각성 측정 비석(2.40m)·스캔 단말기 (V31)",
        "Prop 3 (Hunter 8200K) S-Rank Mana Awakening Obelisk & Palm Kiosk V31",
        "2.40m 육각 마나 오벨리스크·3단 공명 링·0.74m 손바닥 각성 측정 단말기",
        "Hunter guild 2.40m mana obelisk, 3 resonance rings & 0.74m palm scanner",
        "hunter_rank_kiosk",
        8200,
        2.8,
        "V31Prop3_HunterKiosk",
        (0.56, 0.88, 1.0),
        (0.20, 0.25, 0.34),
        (0.68, 0.78, 0.88),
        (0.38, 0.94, 1.0),
    ),
]


def render_v31_thumbnail(
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

    world = bpy.data.worlds.new("ThumbWorldV31")
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

    cam_data = bpy.data.cameras.new("ThumbCamV31")
    cam_data.lens = 52.0
    if hasattr(cam_data, "dof"):
        cam_data.dof.use_dof = True
        cam_data.dof.aperture_fstop = f_stop
    cam_obj = bpy.data.objects.new("ThumbCamV31", cam_data)
    scene.collection.objects.link(cam_obj)
    dist = radius * 2.28
    cam_obj.location = center + Vector((dist * 0.28, -dist * 1.08, dist * 0.24))
    cam_obj.rotation_euler = (center - cam_obj.location).normalized().to_track_quat("-Z", "Y").to_euler()
    if hasattr(cam_data, "dof"):
        cam_data.dof.focus_distance = (center - cam_obj.location).length
    scene.camera = cam_obj

    lights: list[bpy.types.Object] = []
    for lname, energy, color, offset in (
        ("V31PropKey", 960.0, key_col, (0.0, -radius * 2.0, radius * 2.1)),
        ("V31PropFill", 420.0, (0.90, 0.92, 0.98), (-radius * 1.9, -radius * 1.7, radius * 1.4)),
        ("V31PropRim", 640.0, key_col, (radius * 1.8, radius * 1.6, radius * 2.0)),
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


def run_v31_pipeline() -> dict[str, object]:
    before_digests = snapshot_preserved_scenes()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith("V31_") and mat.users == 0:
            bpy.data.materials.remove(mat)

    export_scene = bpy.data.scenes.get("GenreHeroPropsV31_Export") or bpy.data.scenes.new("GenreHeroPropsV31_Export")
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
        prop_mode,
        kelvin,
        f_stop,
        tag,
        key_c,
        body_c,
        trim_c,
        acc_c,
    ) in ASSET_SPECS_V31:
        clear_only_scene(export_scene)
        prop_meta = build_subgenre_hero_prop_assembly(export_scene, prop_mode, tag, body_c, trim_c, acc_c)
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
        render_v31_thumbnail(export_scene, mesh_objs, thumb_path, key_col=key_c, f_stop=f_stop, kelvin=kelvin)

        root = bpy.data.objects.new(f"TS_{slug}", None)
        root["asset_id"] = slug
        root["asset_label_ko"] = label_ko
        root["prop_mode"] = prop_mode
        root["datum_anchor_m"] = prop_meta["datumAnchorM"]
        root["recommended_ink_px"] = prop_meta["recommendedInkPx"]
        root["shared_datum_compatible"] = True
        root["asset_generator"] = "scripts/blender/generate_genre_hero_props_v31.py"
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
                "propMode": prop_mode,
                "datumAnchorM": prop_meta["datumAnchorM"],
                "recommendedInkPx": prop_meta["recommendedInkPx"],
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

    # Stage isolated V31 Sub-Genre Hero Props Showcase Scene
    v31_scene = bpy.data.scenes.get(TARGET_LIVE_SCENE) or bpy.data.scenes.new(TARGET_LIVE_SCENE)
    v31_scene.unit_settings.system = "METRIC"
    v31_scene.unit_settings.scale_length = 1.0
    v31_scene.render.engine = "BLENDER_EEVEE"
    if hasattr(v31_scene.eevee, "use_raytracing"):
        v31_scene.eevee.use_raytracing = True
    if win is not None:
        win.scene = v31_scene

    clear_only_scene(v31_scene)
    mat_stage = make_lumiere_mat("V31_StageDarkroom", (0.08, 0.09, 0.11), roughness=0.25, coat_weight=0.60)
    mat_rail = make_lumiere_mat("V31_StageBrassDatum", (0.88, 0.72, 0.38), roughness=0.18, metallic=1.0)

    bm_stage = bmesh.new()
    add_beveled_box(bm_stage, (11.2, 4.4, 0.10), (0.0, 0.0, -0.05), 0.012, segments=2)
    create_mesh_object(v31_scene, "HeroPropsV31_Gallery_Floor", bm_stage, mat_stage, smooth=True, weighted_normals=True)

    bm_rail = bmesh.new()
    add_beveled_box(bm_rail, (10.6, 0.032, 0.02), (0.0, -0.92, 0.005), 0.004, segments=2)
    create_mesh_object(v31_scene, "HeroPropsV31_SharedDatum_Rail", bm_rail, mat_rail, smooth=True, weighted_normals=True)

    live_zones = [
        ("V31Zone1_Academy_LockerBank", ASSET_SPECS_V31[0], "LiveV31_1", (-3.36, 0.12, 0.0), 0.10),
        ("V31Zone2_Noir_EvidencePinboard", ASSET_SPECS_V31[1], "LiveV31_2", (0.0, 0.18, 0.0), 0.0),
        ("V31Zone3_Hunter_RankKiosk", ASSET_SPECS_V31[2], "LiveV31_3", (3.36, 0.12, 0.0), -0.10),
    ]
    for grp_name, spec, tag, loc, rot_z in live_zones:
        (
            _slug,
            _lko,
            _len,
            _dko,
            _den,
            prop_mode,
            _kelvin,
            _fstop,
            _stag,
            _key_c,
            body_c,
            trim_c,
            acc_c,
        ) = spec
        before = set(v31_scene.objects)
        build_subgenre_hero_prop_assembly(v31_scene, prop_mode, tag, body_c, trim_c, acc_c)
        created = [o for o in v31_scene.objects if o not in before and o.type == "MESH"]
        min_z = min((o.matrix_world @ Vector(c)).z for o in created for c in o.bound_box)
        grp = bpy.data.objects.new(grp_name, None)
        v31_scene.collection.objects.link(grp)
        for o in created:
            if o.parent is None:
                o.location.z -= min_z
                o.parent = grp
        grp.location = loc
        grp.rotation_euler = (0.0, 0.0, rot_z)

    target = Vector((0.0, 0.08, 1.24))
    for lname, energy, color, lpos in (
        ("HeroProps_Academy_5400K", 1980.0, (1.0, 0.94, 0.88), (-3.5, -4.2, 4.1)),
        ("HeroProps_Noir_4100K", 1920.0, (1.0, 0.82, 0.58), (0.0, -4.4, 4.0)),
        ("HeroProps_Hunter_8200K", 2240.0, (0.56, 0.88, 1.0), (3.5, -4.2, 4.1)),
        ("HeroProps_BackRim_5400K", 1480.0, (0.92, 0.94, 0.98), (0.0, 4.6, 3.8)),
    ):
        ldata = bpy.data.lights.new(lname, type="AREA")
        ldata.energy = energy
        ldata.color = color
        ldata.size = 3.5
        lobj = bpy.data.objects.new(lname, ldata)
        v31_scene.collection.objects.link(lobj)
        lobj.location = Vector(lpos)
        lobj.rotation_euler = (target - lobj.location).normalized().to_track_quat("-Z", "Y").to_euler()

    v_world = bpy.data.worlds.get("HeroPropsWorldV31") or bpy.data.worlds.new("HeroPropsWorldV31")
    v_world.use_nodes = True
    bg = v_world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (*srgb(0.06, 0.07, 0.09), 1.0)
        bg.inputs[1].default_value = 0.90
    v31_scene.world = v_world

    cdata = bpy.data.cameras.new("HeroPropsStageCam48mm")
    cdata.lens = 48.0
    if hasattr(cdata, "dof"):
        cdata.dof.use_dof = True
        cdata.dof.aperture_fstop = 2.6
        cdata.dof.focus_distance = 10.1
    cam = bpy.data.objects.new("HeroPropsStageCam48mm", cdata)
    v31_scene.collection.objects.link(cam)
    v31_scene.camera = cam
    cam.location = Vector((0.0, -10.1, 2.22))
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
        "schema": "toonstudio.blender-genre-hero-props.v31",
        "createdAt": "2026-11-18",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": f"Blender {blender_ver} (scripts/blender/generate_genre_hero_props_v31.py · Sub-Genre Narrative Hero Props Shared-Datum SHA-256 verified)",
        "tool": f"Blender {blender_ver}",
        "blenderVersion": blender_ver,
        "units": "meter",
        "upAxis": "Y",
        "heroPropsSpec": {
            "propModes": ["academy_locker_bank", "noir_evidence_board", "hunter_rank_kiosk"],
            "datumAnchorsM": [1.32, 1.54, 0.74],
            "sharedFootprintM": [2.76, 1.48, 0.18],
        },
        "externalSources": [],
        "sceneIsolationAudit": isolation_audit,
        "files": [
            {
                "file": m["file"],
                "propMode": m["propMode"],
                "datumAnchorM": m["datumAnchorM"],
                "recommendedInkPx": m["recommendedInkPx"],
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
        f"- `{m['file']}` — {m['labelKo']} ({m['triangles']} tris, 기준선 Z={m['datumAnchorM']}m, SHA-256 `{m['sha256']}`)"
        for m in sorted(manifest, key=lambda r: str(r["file"]))
    )
    (OUTPUT_DIR / "LICENSES.md").write_text(
        "# ToonStudio Blender 5.3 Sub-Genre Narrative Hero Props Kit V31 — 라이선스 및 규격 고지\n\n"
        "- 라이선스: **CC0-1.0** (Public Domain Dedication)\n"
        f"- 제작: ToonStudio (`scripts/blender/generate_genre_hero_props_v31.py`, Blender {blender_ver})\n"
        "- 서사 핵심 소품 기준선: 학원물 사물함(`1.32m` 핸들)·느와르 수사 핀보드(`1.54m` 시선)·헌터 각성 측정 단말기(`0.74m` 스캔)\n"
        "- 검증: 매니폴드 결함 0건 · 보존 씬 SHA-256 무손실 격리 검증 완료\n\n"
        "## 포함 파일 목록 (총 3종)\n\n"
        f"{license_rows}\n",
        encoding="utf-8",
    )
    return {"exported": manifest, "sceneIsolationAudit": isolation_audit}


if __name__ == "__main__":
    print(json.dumps(run_v31_pipeline(), indent=2, ensure_ascii=False))
