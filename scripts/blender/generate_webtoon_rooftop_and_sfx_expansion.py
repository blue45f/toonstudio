"""
Blender 5.3 Procedural Generator for Wave 9 Webtoon Head Accessories & 3D SFX Stamps (CC0-1.0):
1) 2 New Head Props appended into `apps/character-lab/public/assets/props/webtoon-head-props-v1/` (4 -> 6):
   - `studio-headphones.glb` (`TS_HeadProp_studio-headphones`): Youth/Rooftop wireless neck-worn studio headphones.
   - `silver-monocle.glb` (`TS_HeadProp_silver-monocle`): Rofan/Noir sterling-silver monocle with draped bead chain.
2) 2 New 3D SFX Stamps appended into `apps/character-lab/public/assets/props/webtoon-sfx-stamps-v1/` (4 -> 6):
   - `sfx-ssaa.glb` (`TS_SfxStamp_ssaa` — 싸아): Chilling rooftop wind-stream & ice-mist shards.
   - `sfx-beonjjeok.glb` (`TS_SfxStamp_beonjjeok` — 번쩍): Awakening twin lightning & cross-flare relief.

Preserves all existing 20 GLB files and SHA-256 entries in `index.json` untouched (reaching 24 total 3D assets: 6 stage + 6 head + 6 hand + 6 sfx).
"""
from __future__ import annotations

from contextlib import nullcontext
import json
import math
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
HEAD_PROP_ROOT = REPO_ROOT / "apps/character-lab/public/assets/props/webtoon-head-props-v1"
SFX_PROP_ROOT = REPO_ROOT / "apps/character-lab/public/assets/props/webtoon-sfx-stamps-v1"


def build_rooftop_and_sfx_expansion(scratch_dir: Path) -> dict[str, Any]:
    HEAD_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    SFX_PROP_ROOT.mkdir(parents=True, exist_ok=True)
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

    cx, cy, cz = 0.38, -0.14, 1.86

    with ctx_mgr:
        # 1. studio-headphones (청춘 무선 네크 헤드폰 - 목/쇄골 라인에 걸친 어반 헤드폰)
        hp_tex = _bake_zone_palette_tex(
            str(scratch_dir / "studio_headphones.png"),
            [
                (0.45, _hex_to_rgb01("#1F232B"), _hex_to_rgb01("#373E4C")),
                (0.76, _hex_to_rgb01("#D4A359"), _hex_to_rgb01("#F6D89E")),
                (1.0, _hex_to_rgb01("#EFE9DE"), _hex_to_rgb01("#FFFFFF")),
            ],
        )
        hp_mat = make_textured_pbr_material("mat_head_studio_headphones", hp_tex, roughness=0.28, metallic=0.45)
        bm_hp = bmesh.new()
        # Curved back-of-neck band resting around z = -0.048m
        for i in range(14):
            ang = -1.25 + (2.50 * (i + 0.5) / 14.0)
            px = 0.088 * math.sin(ang)
            py = 0.015 + 0.074 * math.cos(ang)
            _add_box_uv(bm_hp, (0.015, 0.012, 0.008), Vector((px, py, -0.046)), Euler((0.18, 0.0, -ang)), 0.22)
        # Dual swiveled earcups + warm gold accent rings + ivory cushions resting near collar
        for sx in (-1.0, 1.0):
            ex, ey, ez = sx * 0.076, -0.048, -0.056
            _add_cyl_uv(bm_hp, 0.032, 0.028, 0.018, 18, Vector((ex, ey, ez)), Euler((0.42, sx * 0.32, 0.0)), 0.22)
            _add_ring_torus(bm_hp, Vector((ex, ey - 0.004, ez + 0.004)), 0.029, 0.0032, 18, 6, Euler((0.42, sx * 0.32, 0.0)), 0.62)
            _add_cyl_uv(bm_hp, 0.030, 0.030, 0.012, 18, Vector((ex, ey - 0.008, ez + 0.009)), Euler((0.42, sx * 0.32, 0.0)), 0.88)
        hp_stats = _export_glb("TS_HeadProp_studio-headphones", bm_hp, hp_mat, HEAD_PROP_ROOT / "studio-headphones.glb")
        hp_entry = {
            "id": "studio-headphones",
            "labelKo": "청춘 무선 네크 헤드폰",
            "meshName": "TS_HeadProp_studio-headphones",
            "path": "studio-headphones.glb",
            **hp_stats,
        }
        _upsert_manifest_entry(HEAD_PROP_ROOT / "index.json", hp_entry)

        # 2. silver-monocle (괴도·집사 실버 체인 모노클)
        mc_tex = _bake_zone_palette_tex(
            str(scratch_dir / "silver_monocle.png"),
            [
                (0.55, _hex_to_rgb01("#CBD5E1"), _hex_to_rgb01("#F8FAFC")),
                (1.0, _hex_to_rgb01("#38BDF8"), _hex_to_rgb01("#E0F2FE")),
            ],
        )
        mc_mat = make_textured_pbr_material("mat_head_silver_monocle", mc_tex, roughness=0.16, metallic=0.88)
        bm_mc = bmesh.new()
        # Right-eye rim (-X in Blender -> +X / character's right eye in glTF)
        mx, my, mz = -0.041, -0.124, 0.068
        _add_ring_torus(bm_mc, Vector((mx, my, mz)), 0.026, 0.0026, 24, 8, Euler((0.0, 0.0, 0.0)), 0.25)
        _add_box_uv(bm_mc, (0.012, 0.0035, 0.004), Vector((-0.013, -0.125, 0.071)), Euler((0.0, 0.16, 0.0)), 0.25)
        _add_box_uv(bm_mc, (0.005, 0.004, 0.010), Vector((mx - 0.027, my, mz)), None, 0.82)
        # Draped catenary bead chain from outer monocle lug (-0.068, -0.122, 0.064) to right ear (-0.098, -0.014, 0.018)
        chain_links = 12
        for idx in range(chain_links):
            t = idx / (chain_links - 1)
            lx = -0.068 * (1.0 - t) + (-0.098) * t
            ly = -0.122 * (1.0 - t) + (-0.014) * t
            sag = math.sin(t * math.pi) * 0.036
            lz = (0.064 * (1.0 - t) + 0.018 * t) - sag
            _add_cyl_uv(bm_mc, 0.0026, 0.0026, 0.007, 8, Vector((lx, ly, lz)), Euler((0.6, 0.0, 0.25)), 0.28)
        mc_stats = _export_glb("TS_HeadProp_silver-monocle", bm_mc, mc_mat, HEAD_PROP_ROOT / "silver-monocle.glb")
        mc_entry = {
            "id": "silver-monocle",
            "labelKo": "괴도·집사 실버 체인 모노클",
            "meshName": "TS_HeadProp_silver-monocle",
            "path": "silver-monocle.glb",
            **mc_stats,
        }
        _upsert_manifest_entry(HEAD_PROP_ROOT / "index.json", mc_entry)

        # 3. sfx-ssaa (싸아 - 정적·서늘한 옥상 밤바람 효과음)
        ss_tex = _bake_zone_palette_tex(
            str(scratch_dir / "sfx_ssaa.png"),
            [
                (0.48, _hex_to_rgb01("#1E293B"), _hex_to_rgb01("#334155")),
                (1.0, _hex_to_rgb01("#93C5FD"), _hex_to_rgb01("#F8FAFC")),
            ],
        )
        ss_mat = make_textured_pbr_material(
            "mat_sfx_ssaa", ss_tex, roughness=0.22, metallic=0.40, emission_hex="#BAE6FD", emission_strength=0.24
        )
        bm_ss = bmesh.new()
        for row_i, (oz, w_len) in enumerate([(0.052, 0.24), (0.006, 0.28), (-0.038, 0.20)]):
            for seg_i in range(6):
                u = (seg_i / 5.0) - 0.5
                sx_p = cx + u * w_len
                sz_p = cz + oz + math.sin(u * math.pi * 1.6 + row_i) * 0.014
                taper = 1.0 - abs(u) * 1.15
                _add_box_uv(
                    bm_ss,
                    (0.046, 0.009, 0.012 * max(0.35, taper)),
                    Vector((sx_p, cy - row_i * 0.004, sz_p)),
                    Euler((0.0, 0.10 * math.cos(u * 3.0), 0.0)),
                    0.84 if row_i != 1 else 0.26,
                )
        for dx, dz in [(-0.11, 0.08), (0.12, -0.06), (0.04, 0.09)]:
            _add_cyl_uv(bm_ss, 0.011, 0.002, 0.028, 4, Vector((cx + dx, cy - 0.01, cz + dz)), Euler((0.0, 0.45, 0.0)), 0.90)
        ss_stats = _export_glb("TS_SfxStamp_ssaa", bm_ss, ss_mat, SFX_PROP_ROOT / "sfx-ssaa.glb", smooth=False)
        ss_entry = {
            "id": "ssaa",
            "labelKo": "싸아 (정적·서늘한 밤바람 효과음)",
            "meshName": "TS_SfxStamp_ssaa",
            "path": "sfx-ssaa.glb",
            **ss_stats,
        }
        _upsert_manifest_entry(SFX_PROP_ROOT / "index.json", ss_entry)

        # 4. sfx-beonjjeok (번쩍 - 각성·진실 각인 번개 섬광 효과음)
        bj_tex = _bake_zone_palette_tex(
            str(scratch_dir / "sfx_beonjjeok.png"),
            [
                (0.46, _hex_to_rgb01("#2E1065"), _hex_to_rgb01("#5B21B6")),
                (1.0, _hex_to_rgb01("#FACC15"), _hex_to_rgb01("#FEFCE8")),
            ],
        )
        bj_mat = make_textured_pbr_material(
            "mat_sfx_beonjjeok", bj_tex, roughness=0.20, metallic=0.48, emission_hex="#FDE047", emission_strength=0.32
        )
        bm_bj = bmesh.new()
        # Zig-zag twin lightning bolts
        bolt_segs = [
            (-0.055, 0.075, 0.085, -0.52),
            (-0.022, 0.015, 0.078, 0.48),
            (-0.050, -0.048, 0.092, -0.56),
            (0.058, 0.068, 0.076, -0.46),
            (0.082, 0.012, 0.068, 0.50),
            (0.054, -0.044, 0.082, -0.52),
        ]
        for bx, bz, blen, bang in bolt_segs:
            _add_box_uv(bm_bj, (blen, 0.014, 0.018), Vector((cx + bx, cy - 0.008, cz + bz)), Euler((0.0, bang, 0.0)), 0.86)
        # Central 4-point cross-flare
        _add_cyl_uv(bm_bj, 0.018, 0.002, 0.16, 4, Vector((cx + 0.004, cy - 0.016, cz + 0.012)), None, 0.24)
        _add_cyl_uv(bm_bj, 0.018, 0.002, 0.16, 4, Vector((cx + 0.004, cy - 0.016, cz + 0.012)), Euler((0.0, math.pi * 0.5, 0.0)), 0.24)
        bj_stats = _export_glb("TS_SfxStamp_beonjjeok", bm_bj, bj_mat, SFX_PROP_ROOT / "sfx-beonjjeok.glb", smooth=False)
        bj_entry = {
            "id": "beonjjeok",
            "labelKo": "번쩍 (각성·진실 섬광 효과음)",
            "meshName": "TS_SfxStamp_beonjjeok",
            "path": "sfx-beonjjeok.glb",
            **bj_stats,
        }
        _upsert_manifest_entry(SFX_PROP_ROOT / "index.json", bj_entry)

    return {"head": [hp_entry, mc_entry], "sfx": [ss_entry, bj_entry]}


if __name__ == "__main__":
    out = build_rooftop_and_sfx_expansion(Path("/tmp/ts_wave9_tex"))
    Path("/tmp/ts_wave9_result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
