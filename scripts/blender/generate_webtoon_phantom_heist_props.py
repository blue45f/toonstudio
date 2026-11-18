"""
Blender 5.3 Procedural Generator for Wave 10 Phantom Heist & Butler Archetype Props (CC0-1.0):
1) 1 New Hand Prop appended into `apps/character-lab/public/assets/props/webtoon-hand-props-v1/` (6 -> 7):
   - `calling-card-rose.glb` (`TS_Prop_calling-card-rose`): Ivory phantom-thief calling card with crimson wax seal & stem rose.
2) 1 New Stage Prop appended into `apps/character-lab/public/assets/props/webtoon-stage-props-v1/` (6 -> 7):
   - `velvet-display-pedestal.glb` (`TS_StageProp_velvet-display-pedestal`): Museum marble-and-brass velvet jewel pedestal with security laser beams.

Preserves all existing 24 GLB files and SHA-256 entries in `index.json` untouched (reaching 26 total 3D assets).
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
HAND_PROP_ROOT = REPO_ROOT / "apps/character-lab/public/assets/props/webtoon-hand-props-v1"
STAGE_PROP_ROOT = REPO_ROOT / "apps/character-lab/public/assets/props/webtoon-stage-props-v1"


def _inspect_glb_binary_header(glb_path: Path) -> dict[str, Any]:
    raw = glb_path.read_bytes()
    magic, version, total_len = struct.unpack_from("<III", raw, 0)
    json_len, json_type = struct.unpack_from("<II", raw, 12)
    bin_offset = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<II", raw, bin_offset)
    return {
        "magicHex": f"0x{magic:08X}",
        "version": version,
        "headerTotalBytes": total_len,
        "jsonChunkOffset": 12,
        "jsonChunkBytes": json_len,
        "jsonChunkTypeHex": f"0x{json_type:08X}",
        "binChunkOffset": bin_offset,
        "binChunkBytes": bin_len,
        "binChunkTypeHex": f"0x{bin_type:08X}",
    }


def build_phantom_heist_props(scratch_dir: Path) -> dict[str, Any]:
    HAND_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    STAGE_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    scratch_dir.mkdir(parents=True, exist_ok=True)

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

    with ctx_mgr:
        # 1. calling-card-rose (괴도 실링왁스 예고장·장미)
        cc_tex = _bake_zone_palette_tex(
            str(scratch_dir / "calling_card_rose.png"),
            [
                (0.36, _hex_to_rgb01("#FAF6EE"), _hex_to_rgb01("#FFFFFF")),
                (0.62, _hex_to_rgb01("#D4AF37"), _hex_to_rgb01("#FEF08A")),
                (0.84, _hex_to_rgb01("#9F1239"), _hex_to_rgb01("#E11D48")),
                (1.0, _hex_to_rgb01("#166534"), _hex_to_rgb01("#22C55E")),
            ],
        )
        cc_mat = make_textured_pbr_material("mat_prop_calling_card_rose", cc_tex, roughness=0.28, metallic=0.24)
        bm_cc = bmesh.new()
        # Ivory card stock held near fingers (0, 0, 0.045) with gilded trim & crimson wax seal
        _add_box_uv(bm_cc, (0.092, 0.0032, 0.060), Vector((0.012, -0.003, 0.048)), Euler((0.06, -0.14, 0.0)), 0.18)
        _add_box_uv(bm_cc, (0.084, 0.0038, 0.052), Vector((0.012, -0.003, 0.048)), Euler((0.06, -0.14, 0.0)), 0.48)
        _add_box_uv(bm_cc, (0.078, 0.0042, 0.046), Vector((0.012, -0.003, 0.048)), Euler((0.06, -0.14, 0.0)), 0.18)
        _add_cyl_uv(
            bm_cc,
            0.011,
            0.011,
            0.0055,
            14,
            Vector((0.024, -0.006, 0.042)),
            Euler((math.pi * 0.5 + 0.06, 0.0, -0.14)),
            0.74,
        )
        # Sleek emerald stem + dual leaves + layered crimson rosebud
        _add_cyl_uv(bm_cc, 0.0035, 0.0042, 0.195, 10, Vector((-0.006, 0.003, 0.028)), Euler((0.0, 0.12, 0.0)), 0.92)
        _add_box_uv(bm_cc, (0.024, 0.0024, 0.011), Vector((-0.020, 0.004, 0.018)), Euler((0.18, 0.48, -0.22)), 0.92)
        _add_box_uv(bm_cc, (0.022, 0.0024, 0.010), Vector((0.010, 0.004, 0.068)), Euler((-0.16, -0.44, 0.20)), 0.92)
        _add_cyl_uv(bm_cc, 0.010, 0.018, 0.028, 12, Vector((0.006, 0.003, 0.132)), Euler((0.0, 0.12, 0.0)), 0.74)
        _add_cyl_uv(bm_cc, 0.015, 0.007, 0.020, 10, Vector((0.008, 0.003, 0.144)), Euler((0.0, 0.12, 0.35)), 0.74)
        bmesh.ops.recalc_face_normals(bm_cc, faces=bm_cc.faces)
        cc_glb = HAND_PROP_ROOT / "calling-card-rose.glb"
        cc_stats = _export_glb("TS_Prop_calling-card-rose", bm_cc, cc_mat, cc_glb)
        cc_entry = {
            "id": "calling-card-rose",
            "labelKo": "괴도 실링왁스 예고장·장미",
            "meshName": "TS_Prop_calling-card-rose",
            "path": "calling-card-rose.glb",
            **cc_stats,
        }
        _upsert_manifest_entry(HAND_PROP_ROOT / "index.json", cc_entry)

        # 2. velvet-display-pedestal (박물관 벨벳 보석 진열대·레이저)
        vp_tex = _bake_zone_palette_tex(
            str(scratch_dir / "velvet_display_pedestal.png"),
            [
                (0.35, _hex_to_rgb01("#1E2028"), _hex_to_rgb01("#343846")),
                (0.60, _hex_to_rgb01("#C8A048"), _hex_to_rgb01("#FDE68A")),
                (0.82, _hex_to_rgb01("#881337"), _hex_to_rgb01("#E11D48")),
                (1.0, _hex_to_rgb01("#38BDF8"), _hex_to_rgb01("#E0F2FE")),
            ],
        )
        vp_mat = make_textured_pbr_material(
            "mat_stage_velvet_pedestal",
            vp_tex,
            roughness=0.24,
            metallic=0.48,
            emission_hex="#FB7185",
            emission_strength=0.16,
        )
        bm_vp = bmesh.new()
        px, py = -0.40, 0.36  # Left-back of protagonist so right-side duo partner (+X) stays unobstructed
        # Stepped obsidian marble pedestal + brass trim rings
        _add_box_uv(bm_vp, (0.44, 0.44, 0.08), Vector((px, py, 0.04)), None, 0.18)
        _add_box_uv(bm_vp, (0.36, 0.36, 0.05), Vector((px, py, 0.105)), None, 0.48)
        _add_box_uv(bm_vp, (0.28, 0.28, 0.74), Vector((px, py, 0.50)), None, 0.18)
        _add_box_uv(bm_vp, (0.36, 0.36, 0.05), Vector((px, py, 0.895)), None, 0.48)
        # Crimson velvet cushion + faceted star-sapphire gem
        _add_box_uv(bm_vp, (0.22, 0.22, 0.045), Vector((px, py, 0.942)), Euler((0.08, 0.0, 0.0)), 0.72)
        _add_cyl_uv(bm_vp, 0.048, 0.012, 0.056, 6, Vector((px, py, 0.995)), None, 0.92)
        _add_cyl_uv(bm_vp, 0.018, 0.048, 0.032, 6, Vector((px, py, 1.039)), None, 0.92)
        # Brass vitrine corner posts + top frame
        for cx_off in (-0.155, 0.155):
            for cy_off in (-0.155, 0.155):
                _add_box_uv(bm_vp, (0.014, 0.014, 0.34), Vector((px + cx_off, py + cy_off, 1.09)), None, 0.48)
        _add_ring_torus(bm_vp, Vector((px, py, 1.26)), 0.19, 0.008, 4, 6, Euler((0.0, 0.0, math.pi * 0.25)), 0.48)
        # Twin security laser beams crisscrossing behind the pedestal
        _add_cyl_uv(
            bm_vp,
            0.0045,
            0.0045,
            1.36,
            6,
            Vector((0.0, py + 0.12, 0.76)),
            Euler((0.0, math.pi * 0.5 - 0.18, 0.0)),
            0.72,
        )
        _add_cyl_uv(
            bm_vp,
            0.0045,
            0.0045,
            1.36,
            6,
            Vector((0.0, py + 0.14, 1.18)),
            Euler((0.0, math.pi * 0.5 + 0.16, 0.0)),
            0.72,
        )
        bmesh.ops.recalc_face_normals(bm_vp, faces=bm_vp.faces)
        vp_glb = STAGE_PROP_ROOT / "velvet-display-pedestal.glb"
        vp_stats = _export_glb("TS_StageProp_velvet-display-pedestal", bm_vp, vp_mat, vp_glb, smooth=False)
        vp_entry = {
            "id": "velvet-display-pedestal",
            "labelKo": "박물관 벨벳 보석 진열대·레이저",
            "meshName": "TS_StageProp_velvet-display-pedestal",
            "path": "velvet-display-pedestal.glb",
            **vp_stats,
        }
        _upsert_manifest_entry(STAGE_PROP_ROOT / "index.json", vp_entry)

    return {
        "hand": {**cc_entry, "binaryHeader": _inspect_glb_binary_header(cc_glb)},
        "stage": {**vp_entry, "binaryHeader": _inspect_glb_binary_header(vp_glb)},
    }


if __name__ == "__main__":
    out = build_phantom_heist_props(Path("/tmp/ts_wave10_tex"))
    Path("/tmp/ts_wave10_result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
