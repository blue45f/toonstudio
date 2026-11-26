"""
Blender 5.3 Procedural Generator for Wave 8 Webtoon Duo & Stage Expansion Props (CC0-1.0):
1) 2 New Hand Props appended into `data/character-studio-assets/props/webtoon-hand-props-v1/`:
   - `imperial-scroll.glb` (`TS_Prop_imperial-scroll`): Royal crimson-ivory decree scroll with gilded end-caps & wax seal.
   - `jade-folding-fan.glb` (`TS_Prop_jade-folding-fan`): Celadon-jade & gold-ribbed martial folding fan.
2) 1 New Stage Prop appended into `data/character-studio-assets/props/webtoon-stage-props-v1/`:
   - `rooftop-safety-railing.glb` (`TS_StageProp_rooftop-safety-railing`): Campus/Thriller rooftop steel parapet railing & wood bench.

Preserves all existing GLB files and SHA-256 entries in `index.json` untouched.
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

from generate_webtoon_head_and_stage_props import (  # noqa: E402
    _add_box_uv,
    _add_cyl_uv,
    _bake_zone_palette_tex,
    _export_glb,
)
from shaper_webtoon_head_and_textures import _hex_to_rgb01, make_textured_pbr_material  # noqa: E402

REPO_ROOT = SCRIPT_DIR.parent.parent
HAND_PROP_ROOT = REPO_ROOT / "data/character-studio-assets/props/webtoon-hand-props-v1"
STAGE_PROP_ROOT = REPO_ROOT / "data/character-studio-assets/props/webtoon-stage-props-v1"


def _upsert_manifest_entry(index_path: Path, entry: dict[str, Any]) -> None:
    manifest = json.loads(index_path.read_text(encoding="utf-8"))
    props: list[dict[str, Any]] = list(manifest.get("props", []))
    replaced = False
    for idx, existing in enumerate(props):
        if existing.get("id") == entry["id"]:
            props[idx] = entry
            replaced = True
            break
    if not replaced:
        props.append(entry)
    manifest["props"] = props
    index_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_duo_expansion_props(scratch_dir: Path) -> dict[str, Any]:
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
        # 1. imperial-scroll (황실 칙령·계약 두루마리)
        sc_tex = _bake_zone_palette_tex(
            str(scratch_dir / "imperial_scroll.png"),
            [
                (0.45, _hex_to_rgb01("#F6EFE0"), _hex_to_rgb01("#FFFDF7")),
                (0.76, _hex_to_rgb01("#C89B3C"), _hex_to_rgb01("#FCE7A2")),
                (1.0, _hex_to_rgb01("#881337"), _hex_to_rgb01("#BE123C")),
            ],
        )
        sc_mat = make_textured_pbr_material("mat_prop_imperial_scroll", sc_tex, roughness=0.34, metallic=0.28)
        bm_sc = bmesh.new()
        # Main parchment cylinder along Z (glTF Y), centered at palm grip (0,0,0)
        _add_cyl_uv(bm_sc, 0.022, 0.022, 0.27, 20, Vector((0.0, 0.0, 0.02)), None, 0.22)
        # Crimson silk ribbon band + wax seal emblem
        _add_cyl_uv(bm_sc, 0.024, 0.024, 0.036, 20, Vector((0.0, 0.0, 0.02)), None, 0.88)
        _add_cyl_uv(bm_sc, 0.015, 0.015, 0.008, 14, Vector((0.0, -0.023, 0.02)), Euler((math.pi * 0.5, 0.0, 0.0)), 0.62)
        # Gilded end-caps & finials
        for sz in (-0.122, 0.162):
            _add_cyl_uv(bm_sc, 0.026, 0.026, 0.018, 18, Vector((0.0, 0.0, sz)), None, 0.62)
            _add_cyl_uv(bm_sc, 0.011, 0.006, 0.028, 12, Vector((0.0, 0.0, sz + (0.020 if sz > 0 else -0.020))), None, 0.62)
        sc_stats = _export_glb("TS_Prop_imperial-scroll", bm_sc, sc_mat, HAND_PROP_ROOT / "imperial-scroll.glb")
        sc_entry = {
            "id": "imperial-scroll",
            "labelKo": "황실 칙령·계약 두루마리",
            "meshName": "TS_Prop_imperial-scroll",
            "path": "imperial-scroll.glb",
            **sc_stats,
        }
        _upsert_manifest_entry(HAND_PROP_ROOT / "index.json", sc_entry)

        # 2. jade-folding-fan (청옥 접선 부채)
        fn_tex = _bake_zone_palette_tex(
            str(scratch_dir / "jade_folding_fan.png"),
            [
                (0.38, _hex_to_rgb01("#1E293B"), _hex_to_rgb01("#334155")),
                (0.72, _hex_to_rgb01("#C8A048"), _hex_to_rgb01("#FDE68A")),
                (1.0, _hex_to_rgb01("#2DD4BF"), _hex_to_rgb01("#CCFBF1")),
            ],
        )
        fn_mat = make_textured_pbr_material(
            "mat_prop_jade_fan", fn_tex, roughness=0.26, metallic=0.32, emission_hex="#5EEAD4", emission_strength=0.14
        )
        bm_fn = bmesh.new()
        # Pivot rivet & handle base at (0, 0, -0.02)
        _add_cyl_uv(bm_fn, 0.010, 0.012, 0.055, 12, Vector((0.0, 0.0, -0.025)), None, 0.56)
        # 9 pleated ribs fanning across X-Z plane (-52 deg .. +52 deg)
        rib_count = 9
        for i in range(rib_count):
            ang = -0.90 + (1.80 * i / (rib_count - 1))
            mid_r = 0.125
            px = mid_r * math.sin(ang)
            pz = 0.01 + mid_r * math.cos(ang)
            _add_box_uv(bm_fn, (0.006, 0.005, 0.22), Vector((px, (i % 2) * 0.002 - 0.001, pz)), Euler((0.0, ang, 0.0)), 0.22 if i in (0, rib_count - 1) else 0.56)
            if i < rib_count - 1:
                ang_mid = ang + (0.90 / (rib_count - 1))
                leaf_r = 0.165
                lx = leaf_r * math.sin(ang_mid)
                lz = 0.01 + leaf_r * math.cos(ang_mid)
                _add_box_uv(
                    bm_fn,
                    (0.036, 0.0035, 0.125),
                    Vector((lx, 0.0, lz)),
                    Euler((0.08 * (1 if i % 2 == 0 else -1), ang_mid, 0.0)),
                    0.88,
                )
        fn_stats = _export_glb("TS_Prop_jade-folding-fan", bm_fn, fn_mat, HAND_PROP_ROOT / "jade-folding-fan.glb", smooth=False)
        fn_entry = {
            "id": "jade-folding-fan",
            "labelKo": "청옥 접선 부채",
            "meshName": "TS_Prop_jade-folding-fan",
            "path": "jade-folding-fan.glb",
            **fn_stats,
        }
        _upsert_manifest_entry(HAND_PROP_ROOT / "index.json", fn_entry)

        # 3. rooftop-safety-railing (옥상 황혼 안전 난간·벤치)
        rt_tex = _bake_zone_palette_tex(
            str(scratch_dir / "rooftop_safety_railing.png"),
            [
                (0.42, _hex_to_rgb01("#374151"), _hex_to_rgb01("#6B7280")),
                (0.75, _hex_to_rgb01("#1F2937"), _hex_to_rgb01("#4B5563")),
                (1.0, _hex_to_rgb01("#9A6B44"), _hex_to_rgb01("#D29D6B")),
            ],
        )
        rt_mat = make_textured_pbr_material("mat_stage_rooftop_railing", rt_tex, roughness=0.44, metallic=0.46)
        bm_rt = bmesh.new()
        ry = 0.48  # Behind characters (+Y in Blender -> -Z in glTF)
        # Concrete curb
        _add_box_uv(bm_rt, (1.56, 0.18, 0.14), Vector((0.0, ry, 0.07)), None, 0.22)
        # Top & mid steel safety rails
        _add_cyl_uv(bm_rt, 0.018, 0.018, 1.54, 12, Vector((0.0, ry, 1.06)), Euler((0.0, math.pi * 0.5, 0.0)), 0.58)
        _add_cyl_uv(bm_rt, 0.013, 0.013, 1.54, 10, Vector((0.0, ry, 0.62)), Euler((0.0, math.pi * 0.5, 0.0)), 0.58)
        # Vertical stanchion posts
        for px in (-0.72, -0.24, 0.24, 0.72):
            _add_cyl_uv(bm_rt, 0.016, 0.016, 0.94, 10, Vector((px, ry, 0.59)), None, 0.58)
        # Warm wood rooftop bench on left-back side
        bx, by = -0.44, 0.24
        _add_box_uv(bm_rt, (0.56, 0.24, 0.026), Vector((bx, by, 0.44)), None, 0.88)
        for lx in (bx - 0.22, bx + 0.22):
            _add_box_uv(bm_rt, (0.028, 0.20, 0.42), Vector((lx, by, 0.21)), None, 0.58)
        rt_stats = _export_glb(
            "TS_StageProp_rooftop-safety-railing", bm_rt, rt_mat, STAGE_PROP_ROOT / "rooftop-safety-railing.glb"
        )
        rt_entry = {
            "id": "rooftop-safety-railing",
            "labelKo": "옥상 황혼 안전 난간·벤치",
            "meshName": "TS_StageProp_rooftop-safety-railing",
            "path": "rooftop-safety-railing.glb",
            **rt_stats,
        }
        _upsert_manifest_entry(STAGE_PROP_ROOT / "index.json", rt_entry)

    return {"hand": [sc_entry, fn_entry], "stage": [rt_entry]}


if __name__ == "__main__":
    out = build_duo_expansion_props(Path("/tmp/ts_duo_exp_tex"))
    Path("/tmp/ts_duo_exp_result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
