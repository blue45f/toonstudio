"""
Blender 5.3 Procedural Generator for 4 High-Craft Korean Webtoon Hand Props (v1.0, CC0-1.0).

Outputs under `data/character-studio-assets/props/webtoon-hand-props-v1/`:
- `smartphone.glb` (`TS_Prop_smartphone`): Bezel-less smartphone with Korean webtoon chat UI screen & dual camera lenses.
- `coffee-cup.glb` (`TS_Prop_coffee-cup`): Cafe takeout cup with embossed kraft sleeve, sipper lid & emblem texture.
- `case-folder.glb` (`TS_Prop_case-folder`): Leatherette dossier/council clipboard folder with document stack & brass clip.
- `aether-blade.glb` (`TS_Prop_aether-blade`): Ornate gilded hilt + faceted glowing azure-jade mana dagger/wand.
- `index.json`: Verified SHA-256, byte sizes, triangle counts, and grip metadata.
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

from shaper_webtoon_head_and_textures import (  # noqa: E402
    _clamp01,
    _hex_to_rgb01,
    _lerp3,
    _smoothstep,
    _write_png_rgba,
    make_textured_pbr_material,
)

REPO_ROOT = SCRIPT_DIR.parent.parent
PROP_ROOT = REPO_ROOT / "data/character-studio-assets/props/webtoon-hand-props-v1"


def _bake_smartphone_texture(path: str, size: int = 256) -> str:
    """Left half (u < 0.5): glowing Korean webtoon chat screen; Right half (u >= 0.5): brushed titanium back."""
    bg_top = _hex_to_rgb01("#1E2638")
    bg_bot = _hex_to_rgb01("#121724")
    bubble_me = _hex_to_rgb01("#F5D06B")
    bubble_peer = _hex_to_rgb01("#F4F6FA")
    metal_hi = _hex_to_rgb01("#4B5568")
    metal_lo = _hex_to_rgb01("#252B38")

    rows: list[bytes] = []
    for py in range(size):
        v = 1.0 - (py + 0.5) / size
        row = bytearray(size * 4)
        for px in range(size):
            u = (px + 0.5) / size
            if u < 0.5:
                su = u * 2.0
                col = _lerp3(bg_bot, bg_top, v)
                # Top status bar
                if v > 0.88:
                    col = _lerp3(col, (0.35, 0.78, 0.98), 0.35)
                # Peer chat bubble 1
                if 0.12 < su < 0.72 and 0.66 < v < 0.79:
                    col = bubble_peer
                # My yellow chat bubble 2
                if 0.28 < su < 0.88 and 0.46 < v < 0.59:
                    col = bubble_me
                # Peer chat bubble 3
                if 0.12 < su < 0.66 and 0.26 < v < 0.38:
                    col = bubble_peer
                # Screen bezel border
                if su < 0.05 or su > 0.95 or v < 0.04 or v > 0.96:
                    col = (0.06, 0.07, 0.09)
            else:
                bu = (u - 0.5) * 2.0
                sheen = 0.5 + 0.5 * math.sin((bu * 1.4 + v) * math.pi * 3.0)
                col = _lerp3(metal_lo, metal_hi, sheen * 0.65)
                # Camera island top-left of back
                if 0.12 < bu < 0.44 and 0.68 < v < 0.90:
                    col = (0.08, 0.09, 0.12)
                    for cy in (0.74, 0.84):
                        d = math.hypot((bu - 0.28) / 0.08, (v - cy) / 0.04)
                        if d < 1.0:
                            col = (0.14, 0.32, 0.56) if d < 0.65 else (0.75, 0.80, 0.88)
            idx = px * 4
            row[idx] = int(_clamp01(col[0]) * 255)
            row[idx + 1] = int(_clamp01(col[1]) * 255)
            row[idx + 2] = int(_clamp01(col[2]) * 255)
            row[idx + 3] = 255
        rows.append(bytes(row))
    _write_png_rgba(path, size, size, rows)
    return path


def _bake_coffee_cup_texture(path: str, size: int = 256) -> str:
    """Vertical V zones: [0..0.72] ivory cup + kraft sleeve [0.28..0.62] + emblem; [0.72..1.0] dark espresso lid."""
    ivory = _hex_to_rgb01("#F6F1E7")
    kraft = _hex_to_rgb01("#C69463")
    kraft_dark = _hex_to_rgb01("#9E6E42")
    lid = _hex_to_rgb01("#201D22")
    emblem = _hex_to_rgb01("#1F4E3D")

    rows: list[bytes] = []
    for py in range(size):
        v = 1.0 - (py + 0.5) / size
        row = bytearray(size * 4)
        for px in range(size):
            u = (px + 0.5) / size
            if v > 0.75:
                col = _lerp3(lid, (0.35, 0.32, 0.36), _smoothstep(0.75, 0.98, v) * 0.35)
            elif 0.28 <= v <= 0.64:
                rib = 0.5 + 0.5 * math.sin(u * math.pi * 72.0)
                col = _lerp3(kraft_dark, kraft, 0.35 + 0.65 * rib)
                # Circular green cafe medallion at u = 0.5, v = 0.46
                d = math.hypot((u - 0.5) / 0.11, (v - 0.46) / 0.11)
                if d < 1.0:
                    col = emblem if d < 0.86 else ivory
            else:
                shade = 0.88 + 0.12 * math.sin(u * math.pi)
                col = (ivory[0] * shade, ivory[1] * shade, ivory[2] * shade)
            idx = px * 4
            row[idx] = int(_clamp01(col[0]) * 255)
            row[idx + 1] = int(_clamp01(col[1]) * 255)
            row[idx + 2] = int(_clamp01(col[2]) * 255)
            row[idx + 3] = 255
        rows.append(bytes(row))
    _write_png_rgba(path, size, size, rows)
    return path


def _bake_folder_texture(path: str, size: int = 256) -> str:
    """u < 0.5: navy-charcoal leatherette cover + gold border; u >= 0.5: crisp document sheet + crimson stamp."""
    leather1 = _hex_to_rgb01("#1E2433")
    leather2 = _hex_to_rgb01("#131722")
    gold = _hex_to_rgb01("#E6C16E")
    paper = _hex_to_rgb01("#FAF7F0")
    stamp = _hex_to_rgb01("#C93044")
    ink_line = _hex_to_rgb01("#687082")

    rows: list[bytes] = []
    for py in range(size):
        v = 1.0 - (py + 0.5) / size
        row = bytearray(size * 4)
        for px in range(size):
            u = (px + 0.5) / size
            if u < 0.5:
                lu = u * 2.0
                grain = 0.5 + 0.5 * math.sin((lu * 44.0 + v * 38.0) * math.pi)
                col = _lerp3(leather2, leather1, 0.4 + 0.6 * grain)
                if 0.07 < lu < 0.93 and 0.06 < v < 0.94 and (abs(lu - 0.08) < 0.015 or abs(lu - 0.92) < 0.015 or abs(v - 0.07) < 0.015 or abs(v - 0.93) < 0.015):
                    col = gold
            else:
                pu = (u - 0.5) * 2.0
                col = paper
                if 0.78 < v < 0.85 and 0.52 < pu < 0.88:
                    col = stamp
                elif 0.16 < pu < 0.84 and 0.18 < v < 0.72 and ((int(v * 26.0) % 2) == 0):
                    col = _lerp3(paper, ink_line, 0.38)
            idx = px * 4
            row[idx] = int(_clamp01(col[0]) * 255)
            row[idx + 1] = int(_clamp01(col[1]) * 255)
            row[idx + 2] = int(_clamp01(col[2]) * 255)
            row[idx + 3] = 255
        rows.append(bytes(row))
    _write_png_rgba(path, size, size, rows)
    return path


def _bake_aether_blade_texture(path: str, size: int = 256) -> str:
    """v < 0.35: gilded hilt & navy grip wrap; v >= 0.35: luminous cyan-emerald crystal blade gradient."""
    grip = _hex_to_rgb01("#1B2438")
    gold = _hex_to_rgb01("#F2CB74")
    blade_core = _hex_to_rgb01("#3CE8D5")
    blade_edge = _hex_to_rgb01("#DDFEFF")

    rows: list[bytes] = []
    for py in range(size):
        v = 1.0 - (py + 0.5) / size
        row = bytearray(size * 4)
        for px in range(size):
            u = (px + 0.5) / size
            if v < 0.26:
                diamond = abs(((u * 8.0) % 1.0) - 0.5) + abs(((v * 16.0) % 1.0) - 0.5)
                col = gold if abs(diamond - 0.5) < 0.08 else grip
            elif v < 0.35:
                col = _lerp3(gold, (1.0, 0.96, 0.84), 0.45 * math.sin(u * math.pi))
            else:
                bt = (v - 0.35) / 0.65
                edge_f = abs(u - 0.5) * 2.0
                col = _lerp3(blade_core, blade_edge, _smoothstep(0.25, 0.92, edge_f) * 0.75 + bt * 0.25)
            idx = px * 4
            row[idx] = int(_clamp01(col[0]) * 255)
            row[idx + 1] = int(_clamp01(col[1]) * 255)
            row[idx + 2] = int(_clamp01(col[2]) * 255)
            row[idx + 3] = 255
        rows.append(bytes(row))
    _write_png_rgba(path, size, size, rows)
    return path


def _assign_box_split_uvs(bm: bmesh.types.BMesh, front_face_pred: Any) -> None:
    uv_l = bm.loops.layers.uv.new("UVMap")
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    min_x, max_x = min(xs), max(xs)
    min_z, max_z = min(zs), max(zs)
    span_x = max(1e-5, max_x - min_x)
    span_z = max(1e-5, max_z - min_z)
    _ = ys
    for f in bm.faces:
        f.smooth = True
        is_front = front_face_pred(f)
        for lp in f.loops:
            nx = (lp.vert.co.x - min_x) / span_x
            nz = (lp.vert.co.z - min_z) / span_z
            u = (0.04 + 0.42 * nx) if is_front else (0.54 + 0.42 * (1.0 - nx))
            v = 0.04 + 0.92 * nz
            lp[uv_l].uv = (u, v)


def _export_single_prop_glb(mesh_name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material, glb_path: Path) -> dict[str, Any]:
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(mesh_name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(mesh_name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        use_selection=True,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=False,
    )

    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(mesh)

    raw = glb_path.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    j_len, _ = struct.unpack_from("<II", raw, 12)
    gltf = json.loads(raw[20 : 20 + j_len].decode("utf-8"))
    acc = gltf["accessors"]
    tris = sum(
        (acc[p["indices"]]["count"] // 3) if "indices" in p else (acc[p["attributes"]["POSITION"]]["count"] // 3)
        for m in gltf.get("meshes", [])
        for p in m.get("primitives", [])
    )
    return {"bytes": len(raw), "sha256": sha, "triangles": tris}


def build_all_webtoon_hand_props(scratch_dir: Path) -> list[dict[str, Any]]:
    PROP_ROOT.mkdir(parents=True, exist_ok=True)
    scratch_dir.mkdir(parents=True, exist_ok=True)

    prev_objs = list(bpy.data.objects)
    prev_sel = [o for o in prev_objs if o.select_get()]
    prev_act = bpy.context.view_layer.objects.active

    win = bpy.context.window or bpy.data.window_managers[0].windows[0]
    area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), win.screen.areas[0])
    region = next((r for r in area.regions if r.type == "WINDOW"), area.regions[0])

    entries: list[dict[str, Any]] = []
    with bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region):
        # 1. Smartphone (`TS_Prop_smartphone`): screen faces -Y (exports to +Z in glTF), upright along +Z (exports to +Y)
        phone_tex = _bake_smartphone_texture(str(scratch_dir / "smartphone.png"))
        phone_mat = make_textured_pbr_material("mat_prop_smartphone", phone_tex, roughness=0.26, metallic=0.25, emission_hex="#68B8FF", emission_strength=0.08)
        bm_ph = bmesh.new()
        bmesh.ops.create_cube(bm_ph, size=1.0)
        bmesh.ops.bevel(bm_ph, geom=[*bm_ph.verts, *bm_ph.edges], offset=0.08, segments=2, affect="EDGES")
        bmesh.ops.scale(bm_ph, vec=(0.074, 0.009, 0.152), verts=bm_ph.verts)
        bmesh.ops.translate(bm_ph, vec=(0.0, 0.0, 0.024), verts=bm_ph.verts)
        bm_ph.normal_update()
        _assign_box_split_uvs(bm_ph, lambda f: f.normal.y < -0.5)
        ph_stats = _export_single_prop_glb("TS_Prop_smartphone", bm_ph, phone_mat, PROP_ROOT / "smartphone.glb")
        entries.append({
            "id": "smartphone",
            "labelKo": "웹툰 메신저 스마트폰",
            "meshName": "TS_Prop_smartphone",
            "path": "smartphone.glb",
            **ph_stats,
        })

        # 2. Takeout Coffee Cup (`TS_Prop_coffee-cup`): grip center at kraft sleeve (z=0), cup tapers down to -0.055 and lid rises to +0.082
        cup_tex = _bake_coffee_cup_texture(str(scratch_dir / "coffee_cup.png"))
        cup_mat = make_textured_pbr_material("mat_prop_coffee_cup", cup_tex, roughness=0.58, metallic=0.0)
        bm_cp = bmesh.new()
        uv_cp = bm_cp.loops.layers.uv.new("UVMap")
        profile = [
            (-0.056, 0.029, 0.02),
            (-0.024, 0.034, 0.27),
            (-0.022, 0.0365, 0.29),
            (0.026, 0.0405, 0.63),
            (0.028, 0.039, 0.65),
            (0.052, 0.043, 0.74),
            (0.055, 0.0455, 0.77),
            (0.068, 0.0445, 0.86),
            (0.076, 0.038, 0.96),
        ]
        n_seg = 28
        rings_c = []
        for pz, pr, pv in profile:
            rings_c.append(([bm_cp.verts.new((pr * math.sin((i / n_seg) * 2.0 * math.pi), -pr * math.cos((i / n_seg) * 2.0 * math.pi), pz)) for i in range(n_seg)], pv))
        for ir in range(len(rings_c) - 1):
            r0, v0 = rings_c[ir]
            r1, v1 = rings_c[ir + 1]
            for i in range(n_seg):
                inext = (i + 1) % n_seg
                f = bm_cp.faces.new((r0[i], r0[inext], r1[inext], r1[i]))
                f.smooth = True
                f.loops[0][uv_cp].uv = (i / n_seg, v0)
                f.loops[1][uv_cp].uv = ((i + 1) / n_seg, v0)
                f.loops[2][uv_cp].uv = ((i + 1) / n_seg, v1)
                f.loops[3][uv_cp].uv = (i / n_seg, v1)
        bot_c = bm_cp.verts.new((0.0, 0.0, -0.056))
        top_c = bm_cp.verts.new((0.0, 0.0, 0.077))
        for i in range(n_seg):
            inext = (i + 1) % n_seg
            fb = bm_cp.faces.new((bot_c, rings_c[0][0][inext], rings_c[0][0][i]))
            ft = bm_cp.faces.new((rings_c[-1][0][i], rings_c[-1][0][inext], top_c))
            for lp in fb.loops:
                lp[uv_cp].uv = (0.5, 0.03)
            for lp in ft.loops:
                lp[uv_cp].uv = (0.5, 0.95)
        cp_stats = _export_single_prop_glb("TS_Prop_coffee-cup", bm_cp, cup_mat, PROP_ROOT / "coffee-cup.glb")
        entries.append({
            "id": "coffee-cup",
            "labelKo": "테이크아웃 로스터리 커피컵",
            "meshName": "TS_Prop_coffee-cup",
            "path": "coffee-cup.glb",
            **cp_stats,
        })

        # 3. Dossier / Council Clipboard Folder (`TS_Prop_case-folder`)
        fol_tex = _bake_folder_texture(str(scratch_dir / "case_folder.png"))
        fol_mat = make_textured_pbr_material("mat_prop_case_folder", fol_tex, roughness=0.52, metallic=0.12)
        bm_fl = bmesh.new()
        board = bmesh.ops.create_cube(bm_fl, size=1.0)
        bmesh.ops.scale(bm_fl, vec=(0.215, 0.014, 0.295), verts=board["verts"])
        bmesh.ops.translate(bm_fl, vec=(0.075, 0.0, 0.035), verts=board["verts"])
        clip = bmesh.ops.create_cube(bm_fl, size=1.0)
        bmesh.ops.scale(bm_fl, vec=(0.085, 0.022, 0.026), verts=clip["verts"])
        bmesh.ops.translate(bm_fl, vec=(0.075, -0.006, 0.175), verts=clip["verts"])
        bm_fl.normal_update()
        _assign_box_split_uvs(bm_fl, lambda f: f.normal.y > 0.3)
        fl_stats = _export_single_prop_glb("TS_Prop_case-folder", bm_fl, fol_mat, PROP_ROOT / "case-folder.glb")
        entries.append({
            "id": "case-folder",
            "labelKo": "수사·학생회 결재 서류철",
            "meshName": "TS_Prop_case-folder",
            "path": "case-folder.glb",
            **fl_stats,
        })

        # 4. Ornate Aether Mana Dagger / Sword (`TS_Prop_aether-blade`): hilt grip centered at (0,0,0), blade extends along +Z (exports to +Y)
        bld_tex = _bake_aether_blade_texture(str(scratch_dir / "aether_blade.png"))
        bld_mat = make_textured_pbr_material("mat_prop_aether_blade", bld_tex, roughness=0.22, metallic=0.45, emission_hex="#4CF5E2", emission_strength=0.24)
        bm_bl = bmesh.new()
        uv_bl = bm_bl.loops.layers.uv.new("UVMap")
        hilt_g = bmesh.ops.create_cone(bm_bl, cap_ends=True, cap_tris=True, segments=14, radius1=0.013, radius2=0.015, depth=0.145)
        pommel = bmesh.ops.create_uvsphere(bm_bl, u_segments=12, v_segments=8, radius=0.019)
        bmesh.ops.translate(bm_bl, vec=(0.0, 0.0, -0.082), verts=pommel["verts"])
        guard = bmesh.ops.create_cube(bm_bl, size=1.0)
        bmesh.ops.scale(bm_bl, vec=(0.115, 0.024, 0.022), verts=guard["verts"])
        bmesh.ops.translate(bm_bl, vec=(0.0, 0.0, 0.082), verts=guard["verts"])
        # Diamond-section tapered mana blade from z = 0.092 to z = 0.445
        b_levels = [
            (0.092, 0.026, 0.008),
            (0.240, 0.022, 0.0065),
            (0.375, 0.014, 0.0045),
            (0.448, 0.0015, 0.001),
        ]
        b_rings = []
        for bz, bwx, bwy in b_levels:
            b_rings.append([
                bm_bl.verts.new((0.0, -bwy, bz)),
                bm_bl.verts.new((bwx, 0.0, bz)),
                bm_bl.verts.new((0.0, bwy, bz)),
                bm_bl.verts.new((-bwx, 0.0, bz)),
            ])
        for ir in range(len(b_rings) - 1):
            for k in range(4):
                kn = (k + 1) % 4
                fb = bm_bl.faces.new((b_rings[ir][k], b_rings[ir][kn], b_rings[ir + 1][kn], b_rings[ir + 1][k]))
                fb.smooth = False
        tip_bl = bm_bl.verts.new((0.0, 0.0, 0.462))
        for k in range(4):
            kn = (k + 1) % 4
            bm_bl.faces.new((b_rings[-1][k], b_rings[-1][kn], tip_bl))
        _ = hilt_g
        for f in bm_bl.faces:
            for lp in f.loops:
                u = 0.5 + 0.42 * _clamp01((lp.vert.co.x + 0.06) / 0.12 - 0.5)
                v = _clamp01((lp.vert.co.z + 0.10) / 0.57)
                lp[uv_bl].uv = (u, v)
        bl_stats = _export_single_prop_glb("TS_Prop_aether-blade", bm_bl, bld_mat, PROP_ROOT / "aether-blade.glb")
        entries.append({
            "id": "aether-blade",
            "labelKo": "청운 에테르 마력 단검",
            "meshName": "TS_Prop_aether-blade",
            "path": "aether-blade.glb",
            **bl_stats,
        })

    bpy.ops.object.select_all(action="DESELECT")
    for o in prev_sel:
        if o.name in bpy.data.objects:
            o.select_set(True)
    if prev_act and prev_act.name in bpy.data.objects:
        bpy.context.view_layer.objects.active = prev_act

    manifest = {
        "schema": "toonstudio.character-lab.hand-props/1",
        "license": "CC0-1.0",
        "generatedAt": "2026-11-18",
        "generator": f"Blender {bpy.app.version_string} ToonStudio Hand Props Pipeline",
        "props": entries,
    }
    (PROP_ROOT / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return entries
