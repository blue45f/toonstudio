"""
Blender 5.3 Procedural Generator for Wave 11 Legal & Medical Drama Archetype Props (CC0-1.0):
1) 1 New Hand Prop appended into `apps/character-lab/public/assets/props/webtoon-hand-props-v1/` (7 -> 8):
   - `medical-chart-clipboard.glb` (`TS_Prop_medical-chart-clipboard`): Anodized aluminum medical diagnostic chart clipboard with teal clinical header, crimson ECG waveform strip, and chrome top clip.
2) 1 New Stage Prop appended into `apps/character-lab/public/assets/props/webtoon-stage-props-v1/` (7 -> 8):
   - `courtroom-gavel-podium.glb` (`TS_StageProp_courtroom-gavel-podium`): Walnut courtroom lectern with brass scale trim, goose-neck mic, sound block, and sculpted wooden judge's gavel.

Preserves all existing 26 GLB files and SHA-256 entries in `index.json` untouched (reaching 28 total 3D assets).
"""
from __future__ import annotations

from contextlib import nullcontext
import json
import math
import struct
import sys
import tempfile
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


def build_wave11_drama_props(scratch_dir: Path) -> dict[str, Any]:
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
        # 1. medical-chart-clipboard (메디컬 진단 차트·클립보드)
        mc_tex = _bake_zone_palette_tex(
            str(scratch_dir / "medical_chart_clipboard.png"),
            [
                (0.32, _hex_to_rgb01("#475569"), _hex_to_rgb01("#94A3B8")),
                (0.60, _hex_to_rgb01("#F8FAFC"), _hex_to_rgb01("#FFFFFF")),
                (0.82, _hex_to_rgb01("#0D9488"), _hex_to_rgb01("#2DD4BF")),
                (1.0, _hex_to_rgb01("#BE123C"), _hex_to_rgb01("#FB7185")),
            ],
        )
        mc_mat = make_textured_pbr_material("mat_prop_medical_chart_clipboard", mc_tex, roughness=0.30, metallic=0.32)
        bm_mc = bmesh.new()
        board_rot = Euler((0.08, -0.12, 0.0))
        # Aluminum backing board + white clinical chart pages + teal medical header + crimson ECG strip + top clip
        _add_box_uv(bm_mc, (0.195, 0.006, 0.275), Vector((0.016, -0.006, 0.062)), board_rot, 0.16)
        _add_box_uv(bm_mc, (0.176, 0.0045, 0.246), Vector((0.016, -0.010, 0.058)), board_rot, 0.46)
        _add_box_uv(bm_mc, (0.162, 0.0030, 0.028), Vector((0.014, -0.013, 0.152)), board_rot, 0.72)
        _add_box_uv(bm_mc, (0.150, 0.0032, 0.016), Vector((0.016, -0.013, 0.095)), board_rot, 0.92)
        _add_box_uv(bm_mc, (0.146, 0.0026, 0.010), Vector((0.017, -0.012, 0.048)), board_rot, 0.72)
        _add_box_uv(bm_mc, (0.132, 0.0026, 0.010), Vector((0.012, -0.012, 0.012)), board_rot, 0.16)
        # Spring metal top clip + diagnostic stylus pen clipped on the side
        _add_box_uv(bm_mc, (0.084, 0.014, 0.024), Vector((0.012, -0.012, 0.186)), board_rot, 0.16)
        _add_cyl_uv(bm_mc, 0.0045, 0.0045, 0.135, 8, Vector((0.108, -0.010, 0.072)), board_rot, 0.72)
        bmesh.ops.recalc_face_normals(bm_mc, faces=bm_mc.faces)
        mc_glb = HAND_PROP_ROOT / "medical-chart-clipboard.glb"
        mc_stats = _export_glb("TS_Prop_medical-chart-clipboard", bm_mc, mc_mat, mc_glb)
        mc_entry = {
            "id": "medical-chart-clipboard",
            "labelKo": "메디컬 진단 차트·클립보드",
            "meshName": "TS_Prop_medical-chart-clipboard",
            "path": "medical-chart-clipboard.glb",
            **mc_stats,
        }
        _upsert_manifest_entry(HAND_PROP_ROOT / "index.json", mc_entry)

        # 2. courtroom-gavel-podium (법정 의사봉·증인석 연단)
        cg_tex = _bake_zone_palette_tex(
            str(scratch_dir / "courtroom_gavel_podium.png"),
            [
                (0.38, _hex_to_rgb01("#3E2417"), _hex_to_rgb01("#6B3F28")),
                (0.64, _hex_to_rgb01("#C99E42"), _hex_to_rgb01("#FDE68A")),
                (0.84, _hex_to_rgb01("#1E293B"), _hex_to_rgb01("#475569")),
                (1.0, _hex_to_rgb01("#7F1D1D"), _hex_to_rgb01("#DC2626")),
            ],
        )
        cg_mat = make_textured_pbr_material("mat_stage_courtroom_gavel_podium", cg_tex, roughness=0.34, metallic=0.26)
        bm_cg = bmesh.new()
        px, py = -0.40, 0.34  # Left-back so duo partner on +X stays clear
        # Stepped walnut podium base, fluted pillar, brass justice emblem plaque, and slanted lectern top
        _add_box_uv(bm_cg, (0.50, 0.42, 0.07), Vector((px, py, 0.035)), None, 0.18)
        _add_box_uv(bm_cg, (0.42, 0.34, 0.04), Vector((px, py, 0.090)), None, 0.50)
        _add_box_uv(bm_cg, (0.36, 0.28, 0.78), Vector((px, py, 0.500)), None, 0.18)
        _add_ring_torus(bm_cg, Vector((px, py - 0.146, 0.64)), 0.068, 0.010, 8, 6, Euler((math.pi * 0.5, 0.0, 0.0)), 0.50)
        _add_box_uv(bm_cg, (0.52, 0.38, 0.055), Vector((px, py, 0.915)), None, 0.18)
        _add_box_uv(bm_cg, (0.50, 0.18, 0.045), Vector((px, py - 0.08, 0.962)), Euler((0.18, 0.0, 0.0)), 0.90)
        # Sound block (공명판) + sculpted wooden judge's gavel (의사봉 헤드·금속 링·자루)
        _add_cyl_uv(bm_cg, 0.062, 0.056, 0.024, 12, Vector((px - 0.08, py + 0.03, 0.955)), None, 0.18)
        _add_cyl_uv(bm_cg, 0.054, 0.054, 0.008, 12, Vector((px - 0.08, py + 0.03, 0.971)), None, 0.50)
        gavel_rot = Euler((0.0, math.pi * 0.5 - 0.16, 0.38))
        _add_cyl_uv(bm_cg, 0.026, 0.026, 0.096, 10, Vector((px - 0.05, py + 0.03, 1.002)), gavel_rot, 0.18)
        _add_cyl_uv(bm_cg, 0.028, 0.028, 0.018, 10, Vector((px - 0.05, py + 0.03, 1.002)), gavel_rot, 0.50)
        _add_cyl_uv(
            bm_cg,
            0.0085,
            0.011,
            0.21,
            8,
            Vector((px + 0.035, py - 0.02, 0.992)),
            Euler((math.pi * 0.48, 0.14, -0.52)),
            0.18,
        )
        # Goose-neck witness microphone on podium right corner
        _add_cyl_uv(bm_cg, 0.005, 0.005, 0.22, 6, Vector((px + 0.18, py - 0.04, 1.05)), Euler((0.24, 0.0, 0.0)), 0.74)
        _add_cyl_uv(bm_cg, 0.012, 0.010, 0.034, 8, Vector((px + 0.18, py - 0.09, 1.155)), Euler((0.52, 0.0, 0.0)), 0.74)
        bmesh.ops.recalc_face_normals(bm_cg, faces=bm_cg.faces)
        cg_glb = STAGE_PROP_ROOT / "courtroom-gavel-podium.glb"
        cg_stats = _export_glb("TS_StageProp_courtroom-gavel-podium", bm_cg, cg_mat, cg_glb, smooth=False)
        cg_entry = {
            "id": "courtroom-gavel-podium",
            "labelKo": "법정 의사봉·증인석 연단",
            "meshName": "TS_StageProp_courtroom-gavel-podium",
            "path": "courtroom-gavel-podium.glb",
            **cg_stats,
        }
        _upsert_manifest_entry(STAGE_PROP_ROOT / "index.json", cg_entry)

    return {
        "hand": {**mc_entry, "binaryHeader": _inspect_glb_binary_header(mc_glb)},
        "stage": {**cg_entry, "binaryHeader": _inspect_glb_binary_header(cg_glb)},
    }


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="ts_wave11_tex_") as tmp_dir:
        prop_manifest_summary = build_wave11_drama_props(Path(tmp_dir))
    print(json.dumps(prop_manifest_summary, ensure_ascii=False, indent=2))
