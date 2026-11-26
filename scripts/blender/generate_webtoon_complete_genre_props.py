"""
Blender 5.3 Procedural Generator for Wave 14-15 Complete 12-Genre Studio Closure Props (CC0-1.0):
Completes 40 Total Webtoon 3D Assets (13 Hand · 8 Head · 13 Stage · 6 SFX) for 100% 1-to-1 coverage of all 12 Flagship Archetypes:

1) 3 New Hand Props appended into `data/character-studio-assets/props/webtoon-hand-props-v1/` (10 -> 13):
   - `tactical-medkit-radio.glb` (`TS_Prop_tactical-medkit-radio`): Apocalypse field transceiver radio with whip antenna, status LED, and survival med-pouch clip.
   - `artisan-drip-kettle.glb` (`TS_Prop_artisan-drip-kettle`): Healing cafe gooseneck copper pour-over drip kettle with walnut handle and lid knob.
   - `sacred-chalice-wand.glb` (`TS_Prop_sacred-chalice-wand`): Sanctuary saintess gilded divine scepter-chalice with radiant sapphire crystal orb and wing fins.

2) 2 New Head Props appended into `data/character-studio-assets/props/webtoon-head-props-v1/` (6 -> 8):
   - `tactical-visor-goggles.glb` (`TS_HeadProp_tactical-visor-goggles`): Apocalypse dust-proof forehead tactical goggles with amber-cyan anti-glare lenses and strap.
   - `saintess-halo-crown.glb` (`TS_HeadProp_saintess-halo-crown`): Floating golden starburst saintess halo & pearl-ivory temple coronet.

3) 3 New Stage Props appended into `data/character-studio-assets/props/webtoon-stage-props-v1/` (10 -> 13):
   - `apocalypse-supply-barricade.glb` (`TS_StageProp_apocalypse-supply-barricade`): Weathered steel hazard barricade, olive supply crate, andamber beacon lamp.
   - `atelier-drip-counter.glb` (`TS_StageProp_atelier-drip-counter`): Warm oak pour-over coffee & art atelier bar counter with glass dripper stand.
   - `sanctuary-altar-pedestal.glb` (`TS_StageProp_sanctuary-altar-pedestal`): White marble sanctuary oracle font pedestal with golden halo ring and crystal basin.
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
from generate_webtoon_idol_sports_props import _add_uv_sphere  # noqa: E402
from shaper_webtoon_head_and_textures import _hex_to_rgb01, make_textured_pbr_material  # noqa: E402

REPO_ROOT = SCRIPT_DIR.parent.parent
HAND_PROP_ROOT = REPO_ROOT / "data/character-studio-assets/props/webtoon-hand-props-v1"
HEAD_PROP_ROOT = REPO_ROOT / "data/character-studio-assets/props/webtoon-head-props-v1"
STAGE_PROP_ROOT = REPO_ROOT / "data/character-studio-assets/props/webtoon-stage-props-v1"


def _inspect_glb(glb_path: Path) -> dict[str, Any]:
    raw = glb_path.read_bytes()
    magic, version, total_len = struct.unpack_from("<III", raw, 0)
    json_len, _ = struct.unpack_from("<II", raw, 12)
    gltf = json.loads(raw[20 : 20 + json_len].decode("utf-8"))
    return {
        "magicHex": f"0x{magic:08X}",
        "version": version,
        "headerTotalBytes": total_len,
        "meshCount": len(gltf.get("meshes", [])),
    }


def build_complete_genre_props(scratch_dir: Path) -> dict[str, Any]:
    HAND_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    HEAD_PROP_ROOT.mkdir(parents=True, exist_ok=True)
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

    hand_out: list[dict[str, Any]] = []
    head_out: list[dict[str, Any]] = []
    stage_out: list[dict[str, Any]] = []

    try:
        with ctx_mgr:
            # ---------------- HAND 11: tactical-medkit-radio ----------------
            tr_tex = _bake_zone_palette_tex(
                str(scratch_dir / "tactical_medkit_radio.png"),
                [
                    (0.42, _hex_to_rgb01("#1F2937"), _hex_to_rgb01("#374151")),
                    (0.70, _hex_to_rgb01("#3F6212"), _hex_to_rgb01("#65A30D")),
                    (0.88, _hex_to_rgb01("#22D3EE"), _hex_to_rgb01("#A5F3FC")),
                    (1.0, _hex_to_rgb01("#DC2626"), _hex_to_rgb01("#FCA5A5")),
                ],
            )
            tr_mat = make_textured_pbr_material(
                "mat_prop_tactical_radio", tr_tex, roughness=0.38, metallic=0.42, emission_hex="#22D3EE", emission_strength=0.18
            )
            bm_tr = bmesh.new()
            _add_box_uv(bm_tr, (0.062, 0.036, 0.132), Vector((0.0, 0.0, 0.025)), None, 0.22)
            _add_box_uv(bm_tr, (0.046, 0.004, 0.034), Vector((0.0, -0.019, 0.052)), None, 0.78)
            _add_box_uv(bm_tr, (0.048, 0.018, 0.046), Vector((0.0, 0.024, -0.006)), None, 0.56)
            _add_box_uv(bm_tr, (0.022, 0.004, 0.008), Vector((0.0, 0.034, -0.006)), None, 0.94)
            _add_box_uv(bm_tr, (0.008, 0.004, 0.022), Vector((0.0, 0.034, -0.006)), None, 0.94)
            _add_cyl_uv(bm_tr, 0.0038, 0.0020, 0.135, 8, Vector((0.020, 0.004, 0.156)), None, 0.22)
            _add_cyl_uv(bm_tr, 0.007, 0.007, 0.016, 10, Vector((-0.014, 0.0, 0.098)), None, 0.56)
            tr_glb = HAND_PROP_ROOT / "tactical-medkit-radio.glb"
            tr_st = _export_glb("TS_Prop_tactical-medkit-radio", bm_tr, tr_mat, tr_glb, smooth=False)
            tr_entry = {
                "id": "tactical-medkit-radio",
                "labelKo": "아포칼립스 전술 무전기·응급키트",
                "meshName": "TS_Prop_tactical-medkit-radio",
                "path": "tactical-medkit-radio.glb",
                **tr_st,
            }
            _upsert_manifest_entry(HAND_PROP_ROOT / "index.json", tr_entry)
            hand_out.append({**tr_entry, **_inspect_glb(tr_glb)})

            # ---------------- HAND 12: artisan-drip-kettle ----------------
            dk_tex = _bake_zone_palette_tex(
                str(scratch_dir / "artisan_drip_kettle.png"),
                [
                    (0.52, _hex_to_rgb01("#9A4A28"), _hex_to_rgb01("#EA9A62")),
                    (0.82, _hex_to_rgb01("#3E2723"), _hex_to_rgb01("#6D4C41")),
                    (1.0, _hex_to_rgb01("#F8FAFC"), _hex_to_rgb01("#FFFFFF")),
                ],
            )
            dk_mat = make_textured_pbr_material("mat_prop_artisan_drip_kettle", dk_tex, roughness=0.24, metallic=0.72)
            bm_dk = bmesh.new()
            body_c = Vector((0.0, -0.055, 0.035))
            _add_cyl_uv(bm_dk, 0.058, 0.044, 0.118, 14, body_c, None, 0.26)
            _add_cyl_uv(bm_dk, 0.045, 0.042, 0.010, 14, body_c + Vector((0.0, 0.0, 0.064)), None, 0.92)
            _add_cyl_uv(bm_dk, 0.010, 0.012, 0.018, 10, body_c + Vector((0.0, 0.0, 0.076)), None, 0.68)
            # Walnut grip handle at palm origin (0,0,0) + gooseneck spout forward (-Y)
            _add_box_uv(bm_dk, (0.014, 0.018, 0.088), Vector((0.0, 0.008, 0.028)), Euler((0.18, 0.0, 0.0)), 0.68)
            _add_box_uv(bm_dk, (0.012, 0.032, 0.012), Vector((0.0, -0.012, 0.068)), None, 0.26)
            _add_box_uv(bm_dk, (0.012, 0.032, 0.012), Vector((0.0, -0.012, -0.010)), None, 0.26)
            _add_cyl_uv(bm_dk, 0.007, 0.0045, 0.125, 8, Vector((0.0, -0.125, 0.048)), Euler((-0.78, 0.0, 0.0)), 0.26)
            dk_glb = HAND_PROP_ROOT / "artisan-drip-kettle.glb"
            dk_st = _export_glb("TS_Prop_artisan-drip-kettle", bm_dk, dk_mat, dk_glb)
            dk_entry = {
                "id": "artisan-drip-kettle",
                "labelKo": "공방 구리 핸드드립 포트",
                "meshName": "TS_Prop_artisan-drip-kettle",
                "path": "artisan-drip-kettle.glb",
                **dk_st,
            }
            _upsert_manifest_entry(HAND_PROP_ROOT / "index.json", dk_entry)
            hand_out.append({**dk_entry, **_inspect_glb(dk_glb)})

            # ---------------- HAND 13: sacred-chalice-wand ----------------
            sw_tex = _bake_zone_palette_tex(
                str(scratch_dir / "sacred_chalice_wand.png"),
                [
                    (0.45, _hex_to_rgb01("#CA9A3B"), _hex_to_rgb01("#FEF08A")),
                    (0.76, _hex_to_rgb01("#F8FAFC"), _hex_to_rgb01("#FFFFFF")),
                    (1.0, _hex_to_rgb01("#38BDF8"), _hex_to_rgb01("#E0F2FE")),
                ],
            )
            sw_mat = make_textured_pbr_material(
                "mat_prop_sacred_chalice_wand", sw_tex, roughness=0.18, metallic=0.68, emission_hex="#7DD3FC", emission_strength=0.25
            )
            bm_sw = bmesh.new()
            _add_cyl_uv(bm_sw, 0.011, 0.013, 0.34, 12, Vector((0.0, 0.0, 0.05)), None, 0.62)
            _add_cyl_uv(bm_sw, 0.018, 0.014, 0.024, 12, Vector((0.0, 0.0, -0.115)), None, 0.22)
            _add_cyl_uv(bm_sw, 0.016, 0.038, 0.058, 14, Vector((0.0, 0.0, 0.235)), None, 0.22)
            _add_uv_sphere(bm_sw, 0.030, 12, 8, Vector((0.0, 0.0, 0.278)), (1.0, 1.0, 1.12), 0.90)
            _add_ring_torus(bm_sw, Vector((0.0, 0.0, 0.278)), 0.048, 0.004, 16, 6, Euler((math.pi * 0.5, 0.0, 0.0)), 0.22)
            for sx in (-1.0, 1.0):
                _add_box_uv(bm_sw, (0.046, 0.006, 0.022), Vector((sx * 0.052, 0.0, 0.268)), Euler((0.0, sx * -0.35, 0.0)), 0.62)
            sw_glb = HAND_PROP_ROOT / "sacred-chalice-wand.glb"
            sw_st = _export_glb("TS_Prop_sacred-chalice-wand", bm_sw, sw_mat, sw_glb)
            sw_entry = {
                "id": "sacred-chalice-wand",
                "labelKo": "성녀 신탁 성배·성광 홀",
                "meshName": "TS_Prop_sacred-chalice-wand",
                "path": "sacred-chalice-wand.glb",
                **sw_st,
            }
            _upsert_manifest_entry(HAND_PROP_ROOT / "index.json", sw_entry)
            hand_out.append({**sw_entry, **_inspect_glb(sw_glb)})

            # ---------------- HEAD 7: tactical-visor-goggles ----------------
            vg_tex = _bake_zone_palette_tex(
                str(scratch_dir / "tactical_visor_goggles.png"),
                [
                    (0.48, _hex_to_rgb01("#1E293B"), _hex_to_rgb01("#475569")),
                    (0.80, _hex_to_rgb01("#D97706"), _hex_to_rgb01("#FDE047")),
                    (1.0, _hex_to_rgb01("#0EA5E9"), _hex_to_rgb01("#BAE6FD")),
                ],
            )
            vg_mat = make_textured_pbr_material(
                "mat_head_tactical_goggles", vg_tex, roughness=0.24, metallic=0.46, emission_hex="#F59E0B", emission_strength=0.16
            )
            bm_vg = bmesh.new()
            # Resting on forehead above brow (z ~ 0.132, y ~ -0.112) + elastic head strap arc
            for sx in (-1.0, 1.0):
                _add_cyl_uv(
                    bm_vg,
                    0.028,
                    0.026,
                    0.018,
                    14,
                    Vector((sx * 0.042, -0.112, 0.134)),
                    Euler((math.pi * 0.44, 0.0, sx * -0.14)),
                    0.24,
                )
                _add_cyl_uv(
                    bm_vg,
                    0.022,
                    0.022,
                    0.020,
                    12,
                    Vector((sx * 0.042, -0.114, 0.134)),
                    Euler((math.pi * 0.44, 0.0, sx * -0.14)),
                    0.66,
                )
            _add_box_uv(bm_vg, (0.028, 0.012, 0.012), Vector((0.0, -0.116, 0.136)), None, 0.24)
            for i in range(14):
                ang = -2.2 + (4.4 * i / 13.0)
                if abs(ang) < 0.58:
                    continue
                px = 0.098 * math.sin(ang)
                py = -0.012 - 0.102 * math.cos(ang)
                _add_box_uv(bm_vg, (0.022, 0.005, 0.014), Vector((px, py, 0.126)), Euler((0.0, 0.0, -ang)), 0.24)
            vg_glb = HEAD_PROP_ROOT / "tactical-visor-goggles.glb"
            vg_st = _export_glb("TS_HeadProp_tactical-visor-goggles", bm_vg, vg_mat, vg_glb)
            vg_entry = {
                "id": "tactical-visor-goggles",
                "labelKo": "생존자 방풍 전술 고글",
                "meshName": "TS_HeadProp_tactical-visor-goggles",
                "path": "tactical-visor-goggles.glb",
                **vg_st,
            }
            _upsert_manifest_entry(HEAD_PROP_ROOT / "index.json", vg_entry)
            head_out.append({**vg_entry, **_inspect_glb(vg_glb)})

            # ---------------- HEAD 8: saintess-halo-crown ----------------
            hc_tex = _bake_zone_palette_tex(
                str(scratch_dir / "saintess_halo_crown.png"),
                [
                    (0.55, _hex_to_rgb01("#D4A743"), _hex_to_rgb01("#FEF9C3")),
                    (0.84, _hex_to_rgb01("#F8FAFC"), _hex_to_rgb01("#FFFFFF")),
                    (1.0, _hex_to_rgb01("#60A5FA"), _hex_to_rgb01("#E0F2FE")),
                ],
            )
            hc_mat = make_textured_pbr_material(
                "mat_head_saintess_halo", hc_tex, roughness=0.16, metallic=0.76, emission_hex="#FEF08A", emission_strength=0.28
            )
            bm_hc = bmesh.new()
            halo_c = Vector((0.0, 0.045, 0.245))
            halo_rot = Euler((0.28, 0.0, 0.0))
            _add_ring_torus(bm_hc, halo_c, 0.135, 0.0055, 24, 6, halo_rot, 0.26)
            _add_ring_torus(bm_hc, halo_c, 0.098, 0.0035, 20, 6, halo_rot, 0.70)
            for k in range(8):
                ang = (k / 8.0) * math.pi * 2.0
                rx = 0.155 * math.cos(ang)
                rz = 0.155 * math.sin(ang)
                _add_cyl_uv(
                    bm_hc,
                    0.006,
                    0.001,
                    0.042,
                    6,
                    halo_c + Vector((rx, rz * 0.26, rz * 0.96)),
                    Euler((0.28, -ang + math.pi * 0.5, 0.0)),
                    0.26,
                )
            # Delicate temple coronet arc
            for i in range(12):
                tm = -0.78 + (1.56 * (i + 0.5) / 12.0)
                _add_box_uv(
                    bm_hc,
                    (0.018, 0.004, 0.006),
                    Vector((0.090 * math.sin(tm), -0.015 - 0.096 * math.cos(tm), 0.198)),
                    Euler((0.0, 0.0, -tm)),
                    0.92,
                )
            hc_glb = HEAD_PROP_ROOT / "saintess-halo-crown.glb"
            hc_st = _export_glb("TS_HeadProp_saintess-halo-crown", bm_hc, hc_mat, hc_glb)
            hc_entry = {
                "id": "saintess-halo-crown",
                "labelKo": "신전 성녀 골드 광배·코로넷",
                "meshName": "TS_HeadProp_saintess-halo-crown",
                "path": "saintess-halo-crown.glb",
                **hc_st,
            }
            _upsert_manifest_entry(HEAD_PROP_ROOT / "index.json", hc_entry)
            head_out.append({**hc_entry, **_inspect_glb(hc_glb)})

            # ---------------- STAGE 11: apocalypse-supply-barricade ----------------
            ab_tex = _bake_zone_palette_tex(
                str(scratch_dir / "apocalypse_supply_barricade.png"),
                [
                    (0.42, _hex_to_rgb01("#334155"), _hex_to_rgb01("#64748B")),
                    (0.72, _hex_to_rgb01("#365314"), _hex_to_rgb01("#4D7C0F")),
                    (1.0, _hex_to_rgb01("#D97706"), _hex_to_rgb01("#FACC15")),
                ],
            )
            ab_mat = make_textured_pbr_material(
                "mat_stage_apocalypse_barricade", ab_tex, roughness=0.48, metallic=0.38, emission_hex="#F59E0B", emission_strength=0.20
            )
            bm_ab = bmesh.new()
            bx, by = -0.42, 0.36
            # Concrete jersey barrier + hazard stripe beam + olive military supply crate + amber beacon
            _add_box_uv(bm_ab, (0.86, 0.28, 0.56), Vector((bx, by + 0.16, 0.28)), Euler((0.0, 0.0, 0.18)), 0.20)
            _add_box_uv(bm_ab, (0.88, 0.06, 0.12), Vector((bx, by + 0.04, 0.66)), Euler((0.0, 0.0, 0.18)), 0.88)
            _add_box_uv(bm_ab, (0.44, 0.34, 0.32), Vector((bx + 0.18, by - 0.16, 0.16)), Euler((0.0, 0.0, -0.12)), 0.56)
            _add_box_uv(bm_ab, (0.46, 0.36, 0.05), Vector((bx + 0.18, by - 0.16, 0.34)), Euler((0.0, 0.0, -0.12)), 0.20)
            _add_cyl_uv(bm_ab, 0.036, 0.030, 0.09, 10, Vector((bx - 0.26, by + 0.08, 0.76)), None, 0.88)
            ab_glb = STAGE_PROP_ROOT / "apocalypse-supply-barricade.glb"
            ab_st = _export_glb("TS_StageProp_apocalypse-supply-barricade", bm_ab, ab_mat, ab_glb, smooth=False)
            ab_entry = {
                "id": "apocalypse-supply-barricade",
                "labelKo": "아포칼립스 방벽·보급 크레이트",
                "meshName": "TS_StageProp_apocalypse-supply-barricade",
                "path": "apocalypse-supply-barricade.glb",
                **ab_st,
            }
            _upsert_manifest_entry(STAGE_PROP_ROOT / "index.json", ab_entry)
            stage_out.append({**ab_entry, **_inspect_glb(ab_glb)})

            # ---------------- STAGE 12: atelier-drip-counter ----------------
            ac_tex = _bake_zone_palette_tex(
                str(scratch_dir / "atelier_drip_counter.png"),
                [
                    (0.46, _hex_to_rgb01("#6D4C3D"), _hex_to_rgb01("#A47551")),
                    (0.76, _hex_to_rgb01("#E2E8F0"), _hex_to_rgb01("#FFFBEB")),
                    (1.0, _hex_to_rgb01("#B45309"), _hex_to_rgb01("#FDE68A")),
                ],
            )
            ac_mat = make_textured_pbr_material("mat_stage_atelier_counter", ac_tex, roughness=0.40, metallic=0.18)
            bm_ac = bmesh.new()
            cx, cy = -0.38, -0.32
            _add_box_uv(bm_ac, (0.64, 0.34, 0.82), Vector((cx, cy, 0.41)), None, 0.62)
            _add_box_uv(bm_ac, (0.70, 0.40, 0.038), Vector((cx, cy, 0.838)), None, 0.22)
            # Brass pour-over dripper stand + ceramic V60 cone + glass server carafe
            _add_box_uv(bm_ac, (0.16, 0.14, 0.014), Vector((cx + 0.12, cy + 0.02, 0.864)), None, 0.88)
            _add_cyl_uv(bm_ac, 0.007, 0.007, 0.19, 8, Vector((cx + 0.12, cy + 0.07, 0.96)), None, 0.88)
            _add_cyl_uv(bm_ac, 0.018, 0.048, 0.065, 12, Vector((cx + 0.12, cy + 0.01, 1.02)), None, 0.62)
            _add_cyl_uv(bm_ac, 0.044, 0.036, 0.082, 12, Vector((cx + 0.12, cy + 0.01, 0.912)), None, 0.88)
            ac_glb = STAGE_PROP_ROOT / "atelier-drip-counter.glb"
            ac_st = _export_glb("TS_StageProp_atelier-drip-counter", bm_ac, ac_mat, ac_glb)
            ac_entry = {
                "id": "atelier-drip-counter",
                "labelKo": "힐링 원목 드립바·공방 카운터",
                "meshName": "TS_StageProp_atelier-drip-counter",
                "path": "atelier-drip-counter.glb",
                **ac_st,
            }
            _upsert_manifest_entry(STAGE_PROP_ROOT / "index.json", ac_entry)
            stage_out.append({**ac_entry, **_inspect_glb(ac_glb)})

            # ---------------- STAGE 13: sanctuary-altar-pedestal ----------------
            sa_tex = _bake_zone_palette_tex(
                str(scratch_dir / "sanctuary_altar_pedestal.png"),
                [
                    (0.50, _hex_to_rgb01("#E2E8F0"), _hex_to_rgb01("#FFFFFF")),
                    (0.80, _hex_to_rgb01("#CA9A3B"), _hex_to_rgb01("#FEF08A")),
                    (1.0, _hex_to_rgb01("#38BDF8"), _hex_to_rgb01("#E0F2FE")),
                ],
            )
            sa_mat = make_textured_pbr_material(
                "mat_stage_sanctuary_altar", sa_tex, roughness=0.22, metallic=0.34, emission_hex="#7DD3FC", emission_strength=0.24
            )
            bm_sa = bmesh.new()
            sx_pos, sy_pos = -0.36, 0.34
            _add_cyl_uv(bm_sa, 0.66, 0.62, 0.024, 24, Vector((0.0, 0.0, 0.012)), None, 0.24)
            _add_ring_torus(bm_sa, Vector((0.0, 0.0, 0.028)), 0.58, 0.010, 24, 6, Euler((math.pi * 0.5, 0.0, 0.0)), 0.66)
            _add_cyl_uv(bm_sa, 0.24, 0.20, 0.08, 16, Vector((sx_pos, sy_pos, 0.06)), None, 0.24)
            _add_cyl_uv(bm_sa, 0.13, 0.12, 0.72, 14, Vector((sx_pos, sy_pos, 0.46)), None, 0.24)
            _add_cyl_uv(bm_sa, 0.20, 0.28, 0.11, 16, Vector((sx_pos, sy_pos, 0.87)), None, 0.66)
            _add_cyl_uv(bm_sa, 0.22, 0.22, 0.024, 16, Vector((sx_pos, sy_pos, 0.935)), None, 0.92)
            _add_ring_torus(bm_sa, Vector((sx_pos, sy_pos, 1.18)), 0.18, 0.008, 20, 6, Euler((0.0, 0.0, 0.0)), 0.66)
            sa_glb = STAGE_PROP_ROOT / "sanctuary-altar-pedestal.glb"
            sa_st = _export_glb("TS_StageProp_sanctuary-altar-pedestal", bm_sa, sa_mat, sa_glb)
            sa_entry = {
                "id": "sanctuary-altar-pedestal",
                "labelKo": "신전 백대리석 성수 제단·성광 링",
                "meshName": "TS_StageProp_sanctuary-altar-pedestal",
                "path": "sanctuary-altar-pedestal.glb",
                **sa_st,
            }
            _upsert_manifest_entry(STAGE_PROP_ROOT / "index.json", sa_entry)
            stage_out.append({**sa_entry, **_inspect_glb(sa_glb)})
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

    return {"hand": hand_out, "head": head_out, "stage": stage_out}


if __name__ == "__main__":
    print(json.dumps(build_complete_genre_props(Path("/tmp/ts_wave14_15_tex")), ensure_ascii=False, indent=2))
