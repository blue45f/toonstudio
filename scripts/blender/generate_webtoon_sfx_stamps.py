"""
Blender 5.3 Procedural Generator for 4 Korean Webtoon 3D Onomatopoeia / SFX Relief Stamps
(`apps/character-lab/public/assets/props/webtoon-sfx-stamps-v1/`):
- `sfx-seureung.glb` (`TS_SfxStamp_seureung` — 스릉): Sharp azure-silver crescent blade slash + kinetic glyph bars.
- `sfx-dugeun.glb` (`TS_SfxStamp_dugeun` — 두근): Warm rose-gold twin heartbeat pulse emblem + floating sparkle prisms.
- `sfx-kugugung.glb` (`TS_SfxStamp_kugugung` — 쿠구궁): Heavy obsidian-crimson tectonic shockwave shards + impact bars.
- `sfx-pat.glb` (`TS_SfxStamp_pat` — 팟): Crisp ivory-gold asymmetric flash starburst emblem for sudden gaze/turn beats.

Positioned in character stage space around `(x = +0.38m, y = 1.56m, z = +0.16m)` (Blender `(x = +0.38, y = -0.16, z = 1.56)`)
so they float cleanly in upper-right comic framing without occluding the character's face.
"""
from __future__ import annotations

import hashlib
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

from generate_webtoon_head_and_stage_props import (  # noqa: E402
    _add_box_uv,
    _add_cyl_uv,
    _add_ring_torus,
    _bake_zone_palette_tex,
    _export_glb,
)
from shaper_webtoon_head_and_textures import _hex_to_rgb01, make_textured_pbr_material  # noqa: E402

REPO_ROOT = SCRIPT_DIR.parent.parent
SFX_PROP_ROOT = REPO_ROOT / "apps/character-lab/public/assets/props/webtoon-sfx-stamps-v1"


def build_all_sfx_stamps(scratch_dir: Path) -> dict[str, Any]:
    SFX_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    scratch_dir.mkdir(parents=True, exist_ok=True)

    prev_objs = list(bpy.data.objects)
    prev_sel = [o for o in prev_objs if o.select_get()]
    prev_act = bpy.context.view_layer.objects.active

    from contextlib import nullcontext
    win = bpy.context.window or (bpy.data.window_managers[0].windows[0] if bpy.data.window_managers and bpy.data.window_managers[0].windows else None)
    if win is not None:
        area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), win.screen.areas[0])
        region = next((r for r in area.regions if r.type == "WINDOW"), area.regions[0])
        ctx_mgr = bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region)
    else:
        ctx_mgr = nullcontext()

    entries: list[dict[str, Any]] = []
    # Anchor origin is placed at character stage root; geometry sits near (+0.38, -0.14, 1.86) in Blender (glTF: x=+0.38, y=1.86, z=+0.14) above 188cm partner head
    cx, cy, cz = 0.38, -0.14, 1.86

    with ctx_mgr:
        # 1. seureung (스릉 - 검기 발도 아크 슬래시 + 3D 획 릴리프)
        sr_tex = _bake_zone_palette_tex(
            str(scratch_dir / "sfx_seureung.png"),
            [
                (0.48, _hex_to_rgb01("#0F172A"), _hex_to_rgb01("#1E293B")),
                (1.0, _hex_to_rgb01("#38BDF8"), _hex_to_rgb01("#F0F9FF")),
            ],
        )
        sr_mat = make_textured_pbr_material("mat_sfx_seureung", sr_tex, roughness=0.20, metallic=0.55, emission_hex="#7DD3FC", emission_strength=0.28)
        bm_sr = bmesh.new()
        for i in range(12):
            ang = -0.85 + (1.70 * i / 11.0)
            taper = 1.0 - abs((i - 5.5) / 6.2)
            px = cx + 0.16 * math.sin(ang)
            pz = cz + 0.11 * math.cos(ang) - 0.04
            _add_box_uv(bm_sr, (0.036, 0.010, 0.016 * max(0.3, taper)), Vector((px, cy, pz)), Euler((0.0, -ang * 0.85, 0.22)), 0.82)
        # Bold kinetic Hangul-inspired relief strokes above arc
        _add_box_uv(bm_sr, (0.075, 0.012, 0.016), Vector((cx - 0.045, cy - 0.01, cz + 0.055)), Euler((0.0, 0.28, 0.0)), 0.85)
        _add_box_uv(bm_sr, (0.075, 0.012, 0.016), Vector((cx - 0.025, cy - 0.01, cz + 0.035)), Euler((0.0, -0.28, 0.0)), 0.85)
        _add_box_uv(bm_sr, (0.088, 0.014, 0.014), Vector((cx + 0.055, cy - 0.01, cz + 0.048)), Euler((0.0, 0.08, 0.0)), 0.22)
        _add_ring_torus(bm_sr, Vector((cx + 0.055, cy - 0.012, cz + 0.008)), 0.024, 0.006, 16, 6, Euler((0.0, 0.0, 0.0)), 0.85)
        st = _export_glb("TS_SfxStamp_seureung", bm_sr, sr_mat, SFX_PROP_ROOT / "sfx-seureung.glb", smooth=False)
        entries.append({"id": "seureung", "labelKo": "스릉 (발도·검기 효과음)", "meshName": "TS_SfxStamp_seureung", "path": "sfx-seureung.glb", **st})

        # 2. dugeun (두근 - 로맨스 설렘 펄스 링 & 트윈 하트비트 릴리프)
        dg_tex = _bake_zone_palette_tex(
            str(scratch_dir / "sfx_dugeun.png"),
            [
                (0.50, _hex_to_rgb01("#BE185D"), _hex_to_rgb01("#FB7185")),
                (1.0, _hex_to_rgb01("#FDE68A"), _hex_to_rgb01("#FFFBEB")),
            ],
        )
        dg_mat = make_textured_pbr_material("mat_sfx_dugeun", dg_tex, roughness=0.26, metallic=0.24, emission_hex="#FDA4AF", emission_strength=0.22)
        bm_dg = bmesh.new()
        _add_ring_torus(bm_dg, Vector((cx, cy, cz + 0.02)), 0.095, 0.0065, 24, 8, Euler((0.0, 0.0, 0.0)), 0.30)
        _add_ring_torus(bm_dg, Vector((cx + 0.02, cy + 0.01, cz + 0.02)), 0.132, 0.0042, 24, 6, Euler((0.0, 0.0, 0.0)), 0.82)
        # Sculpted heart-crest & 4-point sparkles
        _add_box_uv(bm_dg, (0.048, 0.016, 0.048), Vector((cx - 0.018, cy - 0.008, cz + 0.022)), Euler((0.0, 0.72, 0.0)), 0.28)
        _add_box_uv(bm_dg, (0.048, 0.016, 0.048), Vector((cx + 0.018, cy - 0.008, cz + 0.022)), Euler((0.0, -0.72, 0.0)), 0.28)
        for sx, sz in [(-0.11, 0.09), (0.12, 0.08), (0.09, -0.08)]:
            _add_box_uv(bm_dg, (0.036, 0.008, 0.008), Vector((cx + sx, cy - 0.01, cz + sz)), None, 0.88)
            _add_box_uv(bm_dg, (0.008, 0.008, 0.036), Vector((cx + sx, cy - 0.01, cz + sz)), None, 0.88)
        st = _export_glb("TS_SfxStamp_dugeun", bm_dg, dg_mat, SFX_PROP_ROOT / "sfx-dugeun.glb")
        entries.append({"id": "dugeun", "labelKo": "두근 (로맨스·설렘 효과음)", "meshName": "TS_SfxStamp_dugeun", "path": "sfx-dugeun.glb", **st})

        # 3. kugugung (쿠구궁 - 중압감 충격파 샤드 엠블럼)
        kg_tex = _bake_zone_palette_tex(
            str(scratch_dir / "sfx_kugugung.png"),
            [
                (0.55, _hex_to_rgb01("#18151C"), _hex_to_rgb01("#2E2636")),
                (1.0, _hex_to_rgb01("#DC2626"), _hex_to_rgb01("#FCA5A5")),
            ],
        )
        kg_mat = make_textured_pbr_material("mat_sfx_kugugung", kg_tex, roughness=0.32, metallic=0.42, emission_hex="#EF4444", emission_strength=0.20)
        bm_kg = bmesh.new()
        for idx in range(8):
            ang = (idx / 8.0) * math.pi * 2.0 + 0.2
            rad = 0.095 + (idx % 2) * 0.028
            px = cx + rad * math.cos(ang)
            pz = cz + rad * math.sin(ang) * 0.78
            _add_cyl_uv(bm_kg, 0.018, 0.003, 0.095, 4, Vector((px, cy, pz)), Euler((0.0, ang - math.pi * 0.5, 0.0)), 0.82 if idx % 2 == 0 else 0.25)
        for row_i, off_z in enumerate([0.045, 0.0, -0.045]):
            _add_box_uv(bm_kg, (0.115 - row_i * 0.012, 0.018, 0.022), Vector((cx + (row_i - 1) * 0.014, cy - 0.012, cz + off_z)), Euler((0.0, -0.10, 0.0)), 0.24)
        st = _export_glb("TS_SfxStamp_kugugung", bm_kg, kg_mat, SFX_PROP_ROOT / "sfx-kugugung.glb", smooth=False)
        entries.append({"id": "kugugung", "labelKo": "쿠구궁 (위압·각성 효과음)", "meshName": "TS_SfxStamp_kugugung", "path": "sfx-kugugung.glb", **st})

        # 4. pat (팟 - 시선 집중·반전 섬광 스타버스트)
        pt_tex = _bake_zone_palette_tex(
            str(scratch_dir / "sfx_pat.png"),
            [
                (0.45, _hex_to_rgb01("#1E1B24"), _hex_to_rgb01("#3B3346")),
                (1.0, _hex_to_rgb01("#F59E0B"), _hex_to_rgb01("#FEF9C3")),
            ],
        )
        pt_mat = make_textured_pbr_material("mat_sfx_pat", pt_tex, roughness=0.22, metallic=0.38, emission_hex="#FDE047", emission_strength=0.30)
        bm_pt = bmesh.new()
        for idx in range(10):
            ang = (idx / 10.0) * math.pi * 2.0
            ln = 0.135 if idx % 2 == 0 else 0.075
            px = cx + (ln * 0.52) * math.cos(ang)
            pz = cz + (ln * 0.52) * math.sin(ang)
            _add_cyl_uv(bm_pt, 0.016, 0.002, ln, 4, Vector((px, cy, pz)), Euler((0.0, ang - math.pi * 0.5, 0.0)), 0.86)
        _add_cyl_uv(bm_pt, 0.036, 0.036, 0.016, 12, Vector((cx, cy - 0.008, cz)), Euler((math.pi * 0.5, 0.0, 0.0)), 0.24)
        st = _export_glb("TS_SfxStamp_pat", bm_pt, pt_mat, SFX_PROP_ROOT / "sfx-pat.glb", smooth=False)
        entries.append({"id": "pat", "labelKo": "팟 (섬광·반전 효과음)", "meshName": "TS_SfxStamp_pat", "path": "sfx-pat.glb", **st})

    bpy.ops.object.select_all(action="DESELECT")
    for o in prev_sel:
        if o.name in bpy.data.objects:
            o.select_set(True)
    if prev_act and prev_act.name in bpy.data.objects:
        bpy.context.view_layer.objects.active = prev_act

    manifest = {
        "schema": "toonstudio.character-lab.sfx-stamps/1",
        "license": "CC0-1.0",
        "generatedAt": "2026-11-18",
        "generator": f"Blender {bpy.app.version_string} ToonStudio Onomatopoeia 3D Stamps Pipeline",
        "props": entries,
    }
    (SFX_PROP_ROOT / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return entries


if __name__ == "__main__":
    build_all_sfx_stamps(Path("/tmp/ts_sfx_tex"))
