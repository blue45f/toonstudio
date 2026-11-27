"""
Blender 5.3 Procedural Generator for Wave 13 Idol Concert & Varsity Sports Archetype Props (CC0-1.0):
1) 2 New Hand Props appended into `data/character-studio-assets/props/webtoon-hand-props-v1/` (8 -> 10):
   - `idol-prism-lightstick.glb` (`TS_Prop_idol-prism-lightstick`): Idol concert prism cheering stick / wireless mic with faceted aurora dome, star core emblem, silver collar, and pearl-white grip.
   - `varsity-basketball.glb` (`TS_Prop_varsity-basketball`): Varsity championship basketball with textured burnt-orange leather zones and dark seam bands.
2) 2 New Stage Props appended into `data/character-studio-assets/props/webtoon-stage-props-v1/` (8 -> 10):
   - `concert-spotlight-mic-stand.glb` (`TS_StageProp_concert-spotlight-mic-stand`): Encore stage neon halo floor ring, weighted chrome base, angled boom stand, and vintage condenser mic.
   - `court-hoop-stanchion.glb` (`TS_StageProp_court-hoop-stanchion`): Gymnasium court base pad, angled steel stanchion post, tempered backboard with target square, and crimson breakaway rim.

Preserves all existing 28 GLB files and SHA-256 entries in `index.json` untouched (reaching 32 total 3D assets: 10 Hand · 6 Head · 10 Stage · 6 SFX).
"""
from __future__ import annotations

from contextlib import nullcontext
import json
import math
import struct
import sys
from pathlib import Path
from typing import Any

import bmesh
import bpy
from mathutils import Euler, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from generate_webtoon_duo_expansion_props import _upsert_manifest_entry  # noqa: E402
from generate_webtoon_head_and_stage_props import (  # noqa: E402
    _add_box_uv,
    _add_cyl_uv,
    _add_ring_torus,
    _bake_zone_palette_tex,
    _export_glb,
)
from shaper_webtoon_head_and_textures import _hex_to_rgb01, make_textured_pbr_material  # noqa: E402

REPO_ROOT = SCRIPT_DIR.parent.parent
HAND_PROP_ROOT = REPO_ROOT / "data/character-studio-assets/props/webtoon-hand-props-v1"
STAGE_PROP_ROOT = REPO_ROOT / "data/character-studio-assets/props/webtoon-stage-props-v1"


def _add_uv_sphere(
    bm: bmesh.types.BMesh,
    radius: float,
    u_seg: int,
    v_seg: int,
    center: Vector,
    scale_xyz: tuple[float, float, float],
    v_uv: float,
) -> None:
    uv_l = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    sp = bmesh.ops.create_uvsphere(bm, u_segments=u_seg, v_segments=v_seg, radius=radius)
    verts = sp["verts"]
    bmesh.ops.scale(bm, vec=scale_xyz, verts=verts)
    bmesh.ops.translate(bm, vec=center, verts=verts)
    vert_set = set(verts)
    for f in bm.faces:
        if all(v in vert_set for v in f.verts):
            for k, lp in enumerate(f.loops):
                lp[uv_l].uv = (0.2 + 0.6 * (k % 2), v_uv)


def _inspect_glb_binary_header(glb_path: Path) -> dict[str, Any]:
    raw = glb_path.read_bytes()
    magic, version, total_len = struct.unpack_from("<III", raw, 0)
    json_len, json_type = struct.unpack_from("<II", raw, 12)
    bin_offset = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<II", raw, bin_offset)
    gltf = json.loads(raw[20 : 20 + json_len].decode("utf-8"))
    return {
        "magicHex": f"0x{magic:08X}",
        "version": version,
        "headerTotalBytes": total_len,
        "meshCount": len(gltf.get("meshes", [])),
        "binChunkBytes": bin_len,
        "binChunkTypeHex": f"0x{bin_type:08X}",
    }


def build_idol_sports_props(scratch_dir: Path) -> dict[str, Any]:
    HAND_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    STAGE_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    scratch_dir.mkdir(parents=True, exist_ok=True)

    prev_objs = list(bpy.data.objects)
    prev_sel = [o for o in prev_objs if o.select_get()]
    prev_act = bpy.context.view_layer.objects.active
    prev_mats = set(bpy.data.materials.keys())
    prev_imgs = set(bpy.data.images.keys())

    win = bpy.context.window or (
        bpy.data.window_managers[0].windows[0]
        if bpy.data.window_managers and bpy.data.window_managers[0].windows
        else None
    )
    if win is not None:
        area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), win.screen.areas[0])
        region = next((r for r in area.regions if r.type == "WINDOW"), area.regions[0])
        ctx_mgr = bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region)
    else:
        ctx_mgr = nullcontext()

    try:
        with ctx_mgr:
            # 1. Hand Prop #9: idol-prism-lightstick (아이돌 프리즘 응원봉·마이크)
            ls_tex = _bake_zone_palette_tex(
                str(scratch_dir / "idol_prism_lightstick.png"),
                [
                    (0.32, _hex_to_rgb01("#F1F5F9"), _hex_to_rgb01("#FFFFFF")),
                    (0.58, _hex_to_rgb01("#C084FC"), _hex_to_rgb01("#F472B6")),
                    (0.82, _hex_to_rgb01("#38BDF8"), _hex_to_rgb01("#E0F2FE")),
                    (1.0, _hex_to_rgb01("#FACC15"), _hex_to_rgb01("#FEF9C3")),
                ],
            )
            ls_mat = make_textured_pbr_material(
                "mat_prop_idol_prism_lightstick",
                ls_tex,
                roughness=0.18,
                metallic=0.35,
                emission_hex="#F472B6",
                emission_strength=0.28,
            )
            bm_ls = bmesh.new()
            _add_cyl_uv(bm_ls, 0.015, 0.017, 0.145, 12, Vector((0.0, 0.0, 0.015)), None, 0.16)
            _add_cyl_uv(bm_ls, 0.021, 0.018, 0.018, 12, Vector((0.0, 0.0, 0.095)), None, 0.90)
            _add_uv_sphere(bm_ls, 0.044, 12, 8, Vector((0.0, 0.0, 0.142)), (1.0, 1.0, 1.04), 0.70)
            _add_box_uv(bm_ls, (0.036, 0.012, 0.036), Vector((0.0, 0.0, 0.142)), Euler((0.0, math.pi * 0.25, 0.0)), 0.46)
            _add_ring_torus(bm_ls, Vector((0.0, 0.0, 0.142)), 0.048, 0.004, 14, 6, Euler((0.32, 0.0, 0.0)), 0.90)
            _add_ring_torus(bm_ls, Vector((0.0, 0.0, -0.062)), 0.012, 0.0025, 10, 6, Euler((math.pi * 0.5, 0.0, 0.0)), 0.46)
            bmesh.ops.recalc_face_normals(bm_ls, faces=bm_ls.faces)
            ls_glb = HAND_PROP_ROOT / "idol-prism-lightstick.glb"
            ls_stats = _export_glb("TS_Prop_idol-prism-lightstick", bm_ls, ls_mat, ls_glb)
            ls_entry = {
                "id": "idol-prism-lightstick",
                "labelKo": "아이돌 프리즘 응원봉·마이크",
                "meshName": "TS_Prop_idol-prism-lightstick",
                "path": "idol-prism-lightstick.glb",
                **ls_stats,
            }
            _upsert_manifest_entry(HAND_PROP_ROOT / "index.json", ls_entry)

            # 2. Hand Prop #10: varsity-basketball (체전 에이스 농구공)
            bb_tex = _bake_zone_palette_tex(
                str(scratch_dir / "varsity_basketball.png"),
                [
                    (0.58, _hex_to_rgb01("#C2410C"), _hex_to_rgb01("#F97316")),
                    (0.84, _hex_to_rgb01("#18181B"), _hex_to_rgb01("#27272A")),
                    (1.0, _hex_to_rgb01("#FDE047"), _hex_to_rgb01("#FEF08A")),
                ],
            )
            bb_mat = make_textured_pbr_material("mat_prop_varsity_basketball", bb_tex, roughness=0.58, metallic=0.06)
            bm_bb = bmesh.new()
            ball_c = Vector((0.025, -0.055, 0.045))
            _add_uv_sphere(bm_bb, 0.112, 14, 10, ball_c, (1.0, 1.0, 1.0), 0.30)
            _add_ring_torus(bm_bb, ball_c, 0.1124, 0.0031, 16, 6, Euler((0.0, 0.0, 0.09)), 0.72)
            _add_ring_torus(bm_bb, ball_c, 0.1131, 0.0030, 16, 6, Euler((math.pi * 0.5, 0.11, 0.0)), 0.72)
            _add_ring_torus(bm_bb, ball_c, 0.1138, 0.0029, 16, 6, Euler((0.13, math.pi * 0.5, 0.0)), 0.72)
            bmesh.ops.recalc_face_normals(bm_bb, faces=bm_bb.faces)
            bb_glb = HAND_PROP_ROOT / "varsity-basketball.glb"
            bb_stats = _export_glb("TS_Prop_varsity-basketball", bm_bb, bb_mat, bb_glb)
            bb_entry = {
                "id": "varsity-basketball",
                "labelKo": "체전 에이스 농구공",
                "meshName": "TS_Prop_varsity-basketball",
                "path": "varsity-basketball.glb",
                **bb_stats,
            }
            _upsert_manifest_entry(HAND_PROP_ROOT / "index.json", bb_entry)

            # 3. Stage Prop #9: concert-spotlight-mic-stand (아이돌 콘서트 스탠드마이크·네온 링)
            cm_tex = _bake_zone_palette_tex(
                str(scratch_dir / "concert_spotlight_mic_stand.png"),
                [
                    (0.36, _hex_to_rgb01("#0F172A"), _hex_to_rgb01("#334155")),
                    (0.64, _hex_to_rgb01("#CBD5E1"), _hex_to_rgb01("#F8FAFC")),
                    (0.84, _hex_to_rgb01("#EC4899"), _hex_to_rgb01("#F472B6")),
                    (1.0, _hex_to_rgb01("#38BDF8"), _hex_to_rgb01("#A5F3FC")),
                ],
            )
            cm_mat = make_textured_pbr_material(
                "mat_stage_concert_mic_stand",
                cm_tex,
                roughness=0.22,
                metallic=0.68,
                emission_hex="#EC4899",
                emission_strength=0.26,
            )
            bm_cm = bmesh.new()
            mx, my = -0.26, -0.32
            _add_ring_torus(bm_cm, Vector((0.0, 0.0, 0.016)), 0.64, 0.014, 24, 6, Euler((math.pi * 0.5, 0.0, 0.0)), 0.74)
            _add_ring_torus(bm_cm, Vector((0.0, 0.0, 0.022)), 0.52, 0.008, 20, 6, Euler((math.pi * 0.5, 0.0, 0.0)), 0.92)
            _add_cyl_uv(bm_cm, 0.145, 0.132, 0.026, 16, Vector((mx, my, 0.013)), None, 0.18)
            _add_cyl_uv(bm_cm, 0.013, 0.011, 1.24, 10, Vector((mx, my, 0.64)), None, 0.50)
            _add_cyl_uv(bm_cm, 0.009, 0.008, 0.34, 8, Vector((mx + 0.08, my + 0.06, 1.31)), Euler((-0.42, 0.46, 0.0)), 0.50)
            _add_cyl_uv(bm_cm, 0.024, 0.020, 0.068, 12, Vector((mx + 0.15, my + 0.12, 1.40)), Euler((0.35, -0.25, 0.0)), 0.74)
            bmesh.ops.recalc_face_normals(bm_cm, faces=bm_cm.faces)
            cm_glb = STAGE_PROP_ROOT / "concert-spotlight-mic-stand.glb"
            cm_stats = _export_glb("TS_StageProp_concert-spotlight-mic-stand", bm_cm, cm_mat, cm_glb)
            cm_entry = {
                "id": "concert-spotlight-mic-stand",
                "labelKo": "아이돌 콘서트 스탠드마이크·네온 링",
                "meshName": "TS_StageProp_concert-spotlight-mic-stand",
                "path": "concert-spotlight-mic-stand.glb",
                **cm_stats,
            }
            _upsert_manifest_entry(STAGE_PROP_ROOT / "index.json", cm_entry)

            # 4. Stage Prop #10: court-hoop-stanchion (학원 체육관 농구 골대·백보드)
            ch_tex = _bake_zone_palette_tex(
                str(scratch_dir / "court_hoop_stanchion.png"),
                [
                    (0.36, _hex_to_rgb01("#1E293B"), _hex_to_rgb01("#475569")),
                    (0.64, _hex_to_rgb01("#F1F5F9"), _hex_to_rgb01("#FFFFFF")),
                    (0.84, _hex_to_rgb01("#DC2626"), _hex_to_rgb01("#F87171")),
                    (1.0, _hex_to_rgb01("#D97706"), _hex_to_rgb01("#FBBF24")),
                ],
            )
            ch_mat = make_textured_pbr_material("mat_stage_court_hoop_stanchion", ch_tex, roughness=0.32, metallic=0.28)
            bm_ch = bmesh.new()
            hx, hy = -0.44, 0.62
            _add_box_uv(bm_ch, (0.44, 0.54, 0.14), Vector((hx, hy + 0.18, 0.07)), None, 0.18)
            _add_box_uv(bm_ch, (0.09, 0.09, 2.02), Vector((hx, hy + 0.08, 1.12)), None, 0.18)
            _add_box_uv(bm_ch, (0.08, 0.34, 0.08), Vector((hx, hy - 0.10, 2.06)), Euler((0.18, 0.0, 0.0)), 0.18)
            _add_box_uv(bm_ch, (0.86, 0.032, 0.56), Vector((hx, hy - 0.28, 2.12)), None, 0.50)
            _add_box_uv(bm_ch, (0.30, 0.038, 0.22), Vector((hx, hy - 0.282, 2.02)), None, 0.74)
            _add_ring_torus(bm_ch, Vector((hx, hy - 0.46, 1.92)), 0.155, 0.011, 16, 6, Euler((math.pi * 0.5, 0.0, 0.0)), 0.74)
            _add_cyl_uv(bm_ch, 0.145, 0.105, 0.20, 12, Vector((hx, hy - 0.46, 1.81)), None, 0.50)
            _add_box_uv(bm_ch, (1.18, 0.04, 0.004), Vector((0.0, 0.12, 0.002)), None, 0.92)
            bmesh.ops.recalc_face_normals(bm_ch, faces=bm_ch.faces)
            ch_glb = STAGE_PROP_ROOT / "court-hoop-stanchion.glb"
            ch_stats = _export_glb("TS_StageProp_court-hoop-stanchion", bm_ch, ch_mat, ch_glb, smooth=False)
            ch_entry = {
                "id": "court-hoop-stanchion",
                "labelKo": "학원 체육관 농구 골대·백보드",
                "meshName": "TS_StageProp_court-hoop-stanchion",
                "path": "court-hoop-stanchion.glb",
                **ch_stats,
            }
            _upsert_manifest_entry(STAGE_PROP_ROOT / "index.json", ch_entry)
    finally:
        bpy.ops.object.select_all(action="DESELECT")
        for o in prev_sel:
            if o.name in bpy.data.objects:
                o.select_set(True)
        if prev_act and prev_act.name in bpy.data.objects:
            bpy.context.view_layer.objects.active = prev_act
        for m_name in list(bpy.data.materials.keys()):
            if m_name not in prev_mats:
                mat_obj = bpy.data.materials.get(m_name)
                if mat_obj is not None:
                    bpy.data.materials.remove(mat_obj, do_unlink=True)
        for img_name in list(bpy.data.images.keys()):
            if img_name not in prev_imgs:
                img_obj = bpy.data.images.get(img_name)
                if img_obj is not None:
                    bpy.data.images.remove(img_obj, do_unlink=True)

    return {
        "hand": [
            {**ls_entry, "binaryHeader": _inspect_glb_binary_header(ls_glb)},
            {**bb_entry, "binaryHeader": _inspect_glb_binary_header(bb_glb)},
        ],
        "stage": [
            {**cm_entry, "binaryHeader": _inspect_glb_binary_header(cm_glb)},
            {**ch_entry, "binaryHeader": _inspect_glb_binary_header(ch_glb)},
        ],
    }


if __name__ == "__main__":
    out = build_idol_sports_props(Path("/tmp/ts_wave13_tex"))
    print(json.dumps(out, ensure_ascii=False, indent=2))
