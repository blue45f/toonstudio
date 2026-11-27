"""
Blender 5.3 Procedural Generator for:
1) 4 Korean Webtoon Head Accessories (`data/character-studio-assets/props/webtoon-head-props-v1/`):
   - `wire-glasses.glb` (`TS_HeadProp_wire-glasses`): Slim gold-titanium round glasses with bridge, nose pads & temples.
   - `rofan-tiara.glb` (`TS_HeadProp_rofan-tiara`): Romance-fantasy royal filigree tiara with sapphire center jewel & pearls.
   - `tactical-headset.glb` (`TS_HeadProp_tactical-headset`): Cyberpunk/Apocalypse glowing cyan tactical visor & boom-mic headset.
   - `pearl-earrings-pin.glb` (`TS_HeadProp_pearl-earrings-pin`): Paired pearl drop earrings + gilded cross hairpins.

2) 5 Korean Webtoon Stage Stand Props (`data/character-studio-assets/props/webtoon-stage-props-v1/`):
   - `cafe-bistro-table.glb` (`TS_StageProp_cafe-bistro-table`): Warm walnut round cafe bistro table + ceramic espresso cup & saucer.
   - `academy-desk.glb` (`TS_StageProp_academy-desk`): Korean high-school/academy classroom wood-and-steel desk + open notebook.
   - `murim-sword-aura.glb` (`TS_StageProp_murim-sword-aura`): Octagonal stone martial plinth + 6 floating azure-jade spirit blades.
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
    _write_png_rgba,
    make_textured_pbr_material,
)

REPO_ROOT = SCRIPT_DIR.parent.parent
HEAD_PROP_ROOT = REPO_ROOT / "data/character-studio-assets/props/webtoon-head-props-v1"
STAGE_PROP_ROOT = REPO_ROOT / "data/character-studio-assets/props/webtoon-stage-props-v1"


def _export_glb(mesh_name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material, glb_path: Path, smooth: bool = True) -> dict[str, Any]:
    for f in bm.faces:
        f.smooth = smooth
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


def _bake_zone_palette_tex(path: str, zones: list[tuple[float, tuple[float, float, float], tuple[float, float, float]]], size: int = 256) -> str:
    rows: list[bytes] = []
    for py in range(size):
        v = 1.0 - (py + 0.5) / size
        row = bytearray(size * 4)
        c_lo, c_hi = zones[-1][1], zones[-1][2]
        prev_top = 0.0
        local_t = 0.5
        for z_top, zlo, zhi in zones:
            if v <= z_top:
                c_lo, c_hi = zlo, zhi
                local_t = (v - prev_top) / max(1e-4, z_top - prev_top)
                break
            prev_top = z_top
        for px in range(size):
            u = (px + 0.5) / size
            sheen = 0.65 * local_t + 0.35 * (0.5 + 0.5 * math.sin(u * math.pi * 4.0))
            col = _lerp3(c_lo, c_hi, _clamp01(sheen))
            idx = px * 4
            row[idx] = int(_clamp01(col[0]) * 255)
            row[idx + 1] = int(_clamp01(col[1]) * 255)
            row[idx + 2] = int(_clamp01(col[2]) * 255)
            row[idx + 3] = 255
        rows.append(bytes(row))
    _write_png_rgba(path, size, size, rows)
    return path


def _add_ring_torus(bm: bmesh.types.BMesh, center: Vector, major_r: float, minor_r: float, maj_seg: int, min_seg: int, rot_euler: Euler, v_uv: float) -> None:
    uv_l = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    rot_m = rot_euler.to_matrix().to_4x4()
    rings = []
    for i in range(maj_seg):
        theta = (i / maj_seg) * math.pi * 2.0
        ct, st = math.cos(theta), math.sin(theta)
        ring = []
        for j in range(min_seg):
            phi = (j / min_seg) * math.pi * 2.0
            r = major_r + minor_r * math.cos(phi)
            local = Vector((r * ct, minor_r * math.sin(phi), r * st))
            ring.append(bm.verts.new(center + (rot_m @ local)))
        rings.append(ring)
    for i in range(maj_seg):
        inext = (i + 1) % maj_seg
        for j in range(min_seg):
            jnext = (j + 1) % min_seg
            f = bm.faces.new((rings[i][j], rings[inext][j], rings[inext][jnext], rings[i][jnext]))
            for lp in f.loops:
                lp[uv_l].uv = ((i / maj_seg), v_uv)


def _add_box_uv(bm: bmesh.types.BMesh, size_xyz: tuple[float, float, float], center: Vector, rot_euler: Euler | None, v_uv: float) -> None:
    uv_l = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    g = bmesh.ops.create_cube(bm, size=1.0)
    verts = g["verts"]
    bmesh.ops.scale(bm, vec=size_xyz, verts=verts)
    if rot_euler is not None:
        bmesh.ops.rotate(bm, cent=(0.0, 0.0, 0.0), matrix=rot_euler.to_matrix(), verts=verts)
    bmesh.ops.translate(bm, vec=center, verts=verts)
    vert_set = set(verts)
    for f in bm.faces:
        if all(v in vert_set for v in f.verts):
            for k, lp in enumerate(f.loops):
                lp[uv_l].uv = (0.2 + 0.6 * (k % 2), v_uv)


def _add_cyl_uv(bm: bmesh.types.BMesh, r1: float, r2: float, depth: float, segs: int, center: Vector, rot_euler: Euler | None, v_uv: float) -> None:
    uv_l = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    g = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=segs, radius1=r1, radius2=r2, depth=depth)
    verts = g["verts"]
    if rot_euler is not None:
        bmesh.ops.rotate(bm, cent=(0.0, 0.0, 0.0), matrix=rot_euler.to_matrix(), verts=verts)
    bmesh.ops.translate(bm, vec=center, verts=verts)
    vert_set = set(verts)
    for f in bm.faces:
        if all(v in vert_set for v in f.verts):
            for lp in f.loops:
                lp[uv_l].uv = (0.5, v_uv)


def build_all_head_and_stage_props(scratch_dir: Path) -> dict[str, Any]:
    HEAD_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    STAGE_PROP_ROOT.mkdir(parents=True, exist_ok=True)
    scratch_dir.mkdir(parents=True, exist_ok=True)

    prev_objs = list(bpy.data.objects)
    prev_sel = [o for o in prev_objs if o.select_get()]
    prev_act = bpy.context.view_layer.objects.active

    win = bpy.context.window or bpy.data.window_managers[0].windows[0]
    area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), win.screen.areas[0])
    region = next((r for r in area.regions if r.type == "WINDOW"), area.regions[0])

    head_entries: list[dict[str, Any]] = []
    stage_entries: list[dict[str, Any]] = []

    with bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region):
        # 1. wire-glasses
        gl_tex = _bake_zone_palette_tex(
            str(scratch_dir / "wire_glasses.png"),
            [
                (0.5, _hex_to_rgb01("#C8A464"), _hex_to_rgb01("#F6DFAA")),
                (1.0, _hex_to_rgb01("#232938"), _hex_to_rgb01("#3B4559")),
            ],
        )
        gl_mat = make_textured_pbr_material("mat_head_wire_glasses", gl_tex, roughness=0.22, metallic=0.82)
        bm_gl = bmesh.new()
        for sx in (-1.0, 1.0):
            _add_ring_torus(bm_gl, Vector((sx * 0.041, -0.124, 0.068)), 0.025, 0.0024, 24, 8, Euler((0.0, 0.0, 0.0)), 0.25)
            _add_box_uv(bm_gl, (0.0028, 0.118, 0.0032), Vector((sx * 0.069, -0.065, 0.070)), Euler((0.0, 0.0, sx * -0.05)), 0.25)
            _add_box_uv(bm_gl, (0.003, 0.026, 0.016), Vector((sx * 0.074, -0.002, 0.062)), Euler((0.35, 0.0, 0.0)), 0.78)
        _add_box_uv(bm_gl, (0.032, 0.0032, 0.0032), Vector((0.0, -0.126, 0.073)), None, 0.25)
        st = _export_glb("TS_HeadProp_wire-glasses", bm_gl, gl_mat, HEAD_PROP_ROOT / "wire-glasses.glb")
        head_entries.append({"id": "wire-glasses", "labelKo": "메탈 라운드 안경", "meshName": "TS_HeadProp_wire-glasses", "path": "wire-glasses.glb", **st})

        # 2. rofan-tiara
        ti_tex = _bake_zone_palette_tex(
            str(scratch_dir / "rofan_tiara.png"),
            [
                (0.45, _hex_to_rgb01("#D5A648"), _hex_to_rgb01("#FFF0B8")),
                (0.75, _hex_to_rgb01("#1D4ED8"), _hex_to_rgb01("#7DD3FC")),
                (1.0, _hex_to_rgb01("#F5F3FF"), _hex_to_rgb01("#FFFFFF")),
            ],
        )
        ti_mat = make_textured_pbr_material("mat_head_rofan_tiara", ti_tex, roughness=0.20, metallic=0.78, emission_hex="#60A5FA", emission_strength=0.10)
        bm_ti = bmesh.new()
        arc_segs = 20
        for i in range(arc_segs):
            tm = -0.85 + (1.7 * (i + 0.5) / arc_segs)
            rx, ry = 0.088, 0.095
            cx = rx * math.sin(tm)
            cy = -0.015 - ry * math.cos(tm)
            _add_box_uv(bm_ti, (0.015, 0.005, 0.008), Vector((cx, cy, 0.206)), Euler((0.0, 0.0, -tm)), 0.22)
        for sx, h_sp, ang in [(0.0, 0.044, 0.0), (-1.0, 0.028, 0.34), (1.0, 0.028, -0.34), (-1.0, 0.018, 0.66), (1.0, 0.018, -0.66)]:
            px = 0.088 * math.sin(ang) if sx != 0.0 else 0.0
            py = -0.015 - 0.095 * math.cos(ang)
            _add_cyl_uv(bm_ti, 0.007, 0.0015, h_sp, 8, Vector((px, py, 0.210 + h_sp * 0.5)), None, 0.22)
        _add_cyl_uv(bm_ti, 0.011, 0.011, 0.006, 8, Vector((0.0, -0.113, 0.224)), Euler((math.pi * 0.5, 0.0, 0.0)), 0.60)
        for sx in (-1.0, 1.0):
            _add_cyl_uv(bm_ti, 0.006, 0.006, 0.006, 10, Vector((sx * 0.031, -0.106, 0.218)), Euler((math.pi * 0.5, 0.0, 0.0)), 0.88)
        st = _export_glb("TS_HeadProp_rofan-tiara", bm_ti, ti_mat, HEAD_PROP_ROOT / "rofan-tiara.glb")
        head_entries.append({"id": "rofan-tiara", "labelKo": "로판 황실 사파이어 티아라", "meshName": "TS_HeadProp_rofan-tiara", "path": "rofan-tiara.glb", **st})

        # 3. tactical-headset
        hs_tex = _bake_zone_palette_tex(
            str(scratch_dir / "tactical_headset.png"),
            [
                (0.55, _hex_to_rgb01("#181E29"), _hex_to_rgb01("#323D52")),
                (1.0, _hex_to_rgb01("#0EA5E9"), _hex_to_rgb01("#A5F3FC")),
            ],
        )
        hs_mat = make_textured_pbr_material("mat_head_tactical_headset", hs_tex, roughness=0.28, metallic=0.48, emission_hex="#38BDF8", emission_strength=0.22)
        bm_hs = bmesh.new()
        for i in range(16):
            ang = -1.35 + (2.7 * (i + 0.5) / 16)
            px = 0.106 * math.sin(ang)
            pz = 0.055 + 0.168 * math.cos(ang)
            _add_box_uv(bm_hs, (0.014, 0.022, 0.007), Vector((px, -0.005, pz)), Euler((0.0, ang, 0.0)), 0.25)
        for sx in (-1.0, 1.0):
            _add_cyl_uv(bm_hs, 0.030, 0.026, 0.018, 16, Vector((sx * 0.104, -0.006, 0.048)), Euler((0.0, math.pi * 0.5, 0.0)), 0.25)
            _add_cyl_uv(bm_hs, 0.016, 0.016, 0.021, 12, Vector((sx * 0.106, -0.006, 0.048)), Euler((0.0, math.pi * 0.5, 0.0)), 0.82)
        for i in range(10):
            ang = -0.62 + (1.24 * (i + 0.5) / 10)
            px = 0.104 * math.sin(ang)
            py = -0.024 - 0.108 * math.cos(ang)
            _add_box_uv(bm_hs, (0.025, 0.004, 0.028), Vector((px, py, 0.068)), Euler((0.0, 0.0, -ang)), 0.82)
        _add_box_uv(bm_hs, (0.004, 0.095, 0.004), Vector((-0.088, -0.055, 0.012)), Euler((0.36, 0.0, -0.32)), 0.25)
        _add_box_uv(bm_hs, (0.009, 0.014, 0.009), Vector((-0.058, -0.102, -0.006)), None, 0.82)
        st = _export_glb("TS_HeadProp_tactical-headset", bm_hs, hs_mat, HEAD_PROP_ROOT / "tactical-headset.glb")
        head_entries.append({"id": "tactical-headset", "labelKo": "전술 홀로그램 헤드셋", "meshName": "TS_HeadProp_tactical-headset", "path": "tactical-headset.glb", **st})

        # 4. pearl-earrings-pin
        pe_tex = _bake_zone_palette_tex(
            str(scratch_dir / "pearl_earrings_pin.png"),
            [
                (0.5, _hex_to_rgb01("#DFB15B"), _hex_to_rgb01("#FFF2C2")),
                (1.0, _hex_to_rgb01("#F3EFEA"), _hex_to_rgb01("#FFFFFF")),
            ],
        )
        pe_mat = make_textured_pbr_material("mat_head_pearl_earrings_pin", pe_tex, roughness=0.18, metallic=0.62)
        bm_pe = bmesh.new()
        uv_pe = bm_pe.loops.layers.uv.new("UVMap")
        for sx in (-1.0, 1.0):
            _add_cyl_uv(bm_pe, 0.0045, 0.0045, 0.004, 10, Vector((sx * 0.098, -0.012, 0.022)), Euler((0.0, math.pi * 0.5, 0.0)), 0.25)
            _add_cyl_uv(bm_pe, 0.0014, 0.0014, 0.024, 8, Vector((sx * 0.099, -0.012, 0.006)), None, 0.25)
            sp = bmesh.ops.create_uvsphere(bm_pe, u_segments=12, v_segments=10, radius=0.0085)
            bmesh.ops.scale(bm_pe, vec=(0.88, 0.88, 1.22), verts=sp["verts"])
            bmesh.ops.translate(bm_pe, vec=(sx * 0.099, -0.012, -0.012), verts=sp["verts"])
            sp_set = set(sp["verts"])
            for f in bm_pe.faces:
                if all(v in sp_set for v in f.verts):
                    for lp in f.loops:
                        lp[uv_pe].uv = (0.5, 0.82)
        _add_box_uv(bm_pe, (0.036, 0.004, 0.0045), Vector((0.076, -0.078, 0.118)), Euler((0.2, 0.35, -0.55)), 0.25)
        _add_box_uv(bm_pe, (0.036, 0.004, 0.0045), Vector((0.078, -0.075, 0.112)), Euler((-0.15, -0.25, -0.52)), 0.25)
        st = _export_glb("TS_HeadProp_pearl-earrings-pin", bm_pe, pe_mat, HEAD_PROP_ROOT / "pearl-earrings-pin.glb")
        head_entries.append({"id": "pearl-earrings-pin", "labelKo": "진주 드롭 귀걸이·골드 헤어핀", "meshName": "TS_HeadProp_pearl-earrings-pin", "path": "pearl-earrings-pin.glb", **st})

        # STAGE PROP 1: cafe-bistro-table
        cf_tex = _bake_zone_palette_tex(
            str(scratch_dir / "cafe_bistro_table.png"),
            [
                (0.42, _hex_to_rgb01("#5C3A24"), _hex_to_rgb01("#8B5A38")),
                (0.75, _hex_to_rgb01("#1D1B20"), _hex_to_rgb01("#35323B")),
                (1.0, _hex_to_rgb01("#F7F3EB"), _hex_to_rgb01("#FFFFFF")),
            ],
        )
        cf_mat = make_textured_pbr_material("mat_stage_cafe_table", cf_tex, roughness=0.46, metallic=0.14)
        bm_cf = bmesh.new()
        tx, ty = 0.42, -0.34
        _add_cyl_uv(bm_cf, 0.21, 0.19, 0.024, 24, Vector((tx, ty, 0.012)), None, 0.58)
        _add_cyl_uv(bm_cf, 0.032, 0.028, 0.70, 16, Vector((tx, ty, 0.37)), None, 0.58)
        _add_cyl_uv(bm_cf, 0.31, 0.32, 0.032, 28, Vector((tx, ty, 0.736)), None, 0.22)
        _add_cyl_uv(bm_cf, 0.065, 0.078, 0.012, 18, Vector((tx - 0.06, ty + 0.04, 0.758)), None, 0.88)
        _add_cyl_uv(bm_cf, 0.034, 0.044, 0.056, 18, Vector((tx - 0.06, ty + 0.04, 0.790)), None, 0.88)
        st = _export_glb("TS_StageProp_cafe-bistro-table", bm_cf, cf_mat, STAGE_PROP_ROOT / "cafe-bistro-table.glb")
        stage_entries.append({"id": "cafe-bistro-table", "labelKo": "오후 카페 비스트로 테이블", "meshName": "TS_StageProp_cafe-bistro-table", "path": "cafe-bistro-table.glb", **st})

        # STAGE PROP 2: academy-desk
        dk_tex = _bake_zone_palette_tex(
            str(scratch_dir / "academy_desk.png"),
            [
                (0.45, _hex_to_rgb01("#B8895A"), _hex_to_rgb01("#DFB382")),
                (0.75, _hex_to_rgb01("#363D4A"), _hex_to_rgb01("#556070")),
                (1.0, _hex_to_rgb01("#F7F5EE"), _hex_to_rgb01("#FFFFFF")),
            ],
        )
        dk_mat = make_textured_pbr_material("mat_stage_academy_desk", dk_tex, roughness=0.52, metallic=0.12)
        bm_dk = bmesh.new()
        dy = -0.44
        _add_box_uv(bm_dk, (0.66, 0.44, 0.026), Vector((0.0, dy, 0.73)), None, 0.22)
        _add_box_uv(bm_dk, (0.56, 0.36, 0.014), Vector((0.0, dy, 0.61)), None, 0.58)
        for lx in (-0.28, 0.28):
            for ly in (dy - 0.17, dy + 0.17):
                _add_cyl_uv(bm_dk, 0.014, 0.014, 0.72, 10, Vector((lx, ly, 0.36)), None, 0.58)
        _add_box_uv(bm_dk, (0.28, 0.20, 0.010), Vector((-0.05, dy + 0.02, 0.748)), Euler((0.0, 0.0, 0.12)), 0.88)
        st = _export_glb("TS_StageProp_academy-desk", bm_dk, dk_mat, STAGE_PROP_ROOT / "academy-desk.glb")
        stage_entries.append({"id": "academy-desk", "labelKo": "학원물 교실 책상·노트", "meshName": "TS_StageProp_academy-desk", "path": "academy-desk.glb", **st})

        # STAGE PROP 3: murim-sword-aura
        au_tex = _bake_zone_palette_tex(
            str(scratch_dir / "murim_sword_aura.png"),
            [
                (0.45, _hex_to_rgb01("#232936"), _hex_to_rgb01("#434E66")),
                (1.0, _hex_to_rgb01("#2DD4BF"), _hex_to_rgb01("#E0F2FE")),
            ],
        )
        au_mat = make_textured_pbr_material("mat_stage_murim_aura", au_tex, roughness=0.24, metallic=0.35, emission_hex="#38BDF8", emission_strength=0.30)
        bm_au = bmesh.new()
        _add_cyl_uv(bm_au, 0.68, 0.64, 0.034, 8, Vector((0.0, 0.0, 0.017)), None, 0.22)
        _add_ring_torus(bm_au, Vector((0.0, 0.0, 0.036)), 0.58, 0.009, 24, 6, Euler((math.pi * 0.5, 0.0, 0.0)), 0.82)
        for idx in range(6):
            ang = -1.15 + (2.30 * idx / 5.0)
            bx = 0.62 * math.sin(ang)
            by = 0.26 + 0.22 * math.cos(ang)
            bz = 0.78 + 0.36 * math.sin(idx * 0.9 + 0.4)
            tilt = Euler((0.18, ang * 0.55, 0.0))
            _add_cyl_uv(bm_au, 0.024, 0.002, 0.52, 4, Vector((bx, by, bz)), tilt, 0.85)
            _add_box_uv(bm_au, (0.085, 0.014, 0.016), Vector((bx, by, bz - 0.18)), tilt, 0.22)
        st = _export_glb("TS_StageProp_murim-sword-aura", bm_au, au_mat, STAGE_PROP_ROOT / "murim-sword-aura.glb", smooth=False)
        stage_entries.append({"id": "murim-sword-aura", "labelKo": "무협 청운 검기 진법", "meshName": "TS_StageProp_murim-sword-aura", "path": "murim-sword-aura.glb", **st})

        # STAGE PROP 4: rofan-throne-dais (로판 황실 대관식 대리석 단상 · 골드 필라)
        rf_tex = _bake_zone_palette_tex(
            str(scratch_dir / "rofan_throne_dais.png"),
            [
                (0.42, _hex_to_rgb01("#EAE4D8"), _hex_to_rgb01("#FAF7F0")),
                (0.74, _hex_to_rgb01("#C89B3C"), _hex_to_rgb01("#FCE7A2")),
                (1.0, _hex_to_rgb01("#6E1423"), _hex_to_rgb01("#9E1F34")),
            ],
        )
        rf_mat = make_textured_pbr_material("mat_stage_rofan_dais", rf_tex, roughness=0.28, metallic=0.36)
        bm_rf = bmesh.new()
        _add_cyl_uv(bm_rf, 0.72, 0.68, 0.028, 28, Vector((0.0, 0.0, 0.014)), None, 0.22)
        _add_ring_torus(bm_rf, Vector((0.0, 0.0, 0.030)), 0.66, 0.011, 28, 8, Euler((math.pi * 0.5, 0.0, 0.0)), 0.58)
        _add_box_uv(bm_rf, (0.34, 1.24, 0.006), Vector((0.0, 0.0, 0.031)), None, 0.88)
        for sx in (-0.48, 0.48):
            _add_cyl_uv(bm_rf, 0.072, 0.064, 0.08, 16, Vector((sx, 0.42, 0.068)), None, 0.58)
            _add_cyl_uv(bm_rf, 0.048, 0.044, 1.48, 16, Vector((sx, 0.42, 0.84)), None, 0.22)
            _add_cyl_uv(bm_rf, 0.066, 0.076, 0.08, 16, Vector((sx, 0.42, 1.62)), None, 0.58)
        st = _export_glb("TS_StageProp_rofan-throne-dais", bm_rf, rf_mat, STAGE_PROP_ROOT / "rofan-throne-dais.glb")
        stage_entries.append({"id": "rofan-throne-dais", "labelKo": "로판 황실 대관식 대리석 단상", "meshName": "TS_StageProp_rofan-throne-dais", "path": "rofan-throne-dais.glb", **st})

        # STAGE PROP 5: noir-interrogation-lamp (느와르 취조실 스틸 책상 · 펜던트 조명)
        nr_tex = _bake_zone_palette_tex(
            str(scratch_dir / "noir_interrogation_lamp.png"),
            [
                (0.45, _hex_to_rgb01("#262B34"), _hex_to_rgb01("#454E5E")),
                (0.75, _hex_to_rgb01("#9A7B4F"), _hex_to_rgb01("#D5B47F")),
                (1.0, _hex_to_rgb01("#F59E0B"), _hex_to_rgb01("#FEF3C7")),
            ],
        )
        nr_mat = make_textured_pbr_material("mat_stage_noir_lamp", nr_tex, roughness=0.34, metallic=0.58, emission_hex="#FBBF24", emission_strength=0.24)
        bm_nr = bmesh.new()
        nx, ny = -0.40, -0.30
        _add_box_uv(bm_nr, (0.58, 0.40, 0.024), Vector((nx, ny, 0.73)), None, 0.22)
        for lx in (nx - 0.25, nx + 0.25):
            for ly in (ny - 0.16, ny + 0.16):
                _add_box_uv(bm_nr, (0.026, 0.026, 0.72), Vector((lx, ly, 0.36)), None, 0.22)
        _add_box_uv(bm_nr, (0.22, 0.16, 0.012), Vector((nx + 0.05, ny + 0.02, 0.748)), Euler((0.0, 0.0, 0.22)), 0.60)
        _add_cyl_uv(bm_nr, 0.006, 0.006, 0.38, 10, Vector((-0.14, -0.18, 2.06)), None, 0.22)
        _add_cyl_uv(bm_nr, 0.17, 0.036, 0.12, 18, Vector((-0.14, -0.18, 1.84)), None, 0.22)
        _add_cyl_uv(bm_nr, 0.038, 0.024, 0.048, 14, Vector((-0.14, -0.18, 1.77)), None, 0.90)
        st = _export_glb("TS_StageProp_noir-interrogation-lamp", bm_nr, nr_mat, STAGE_PROP_ROOT / "noir-interrogation-lamp.glb")
        stage_entries.append({"id": "noir-interrogation-lamp", "labelKo": "느와르 취조실 스틸 책상·펜던트 조명", "meshName": "TS_StageProp_noir-interrogation-lamp", "path": "noir-interrogation-lamp.glb", **st})

    bpy.ops.object.select_all(action="DESELECT")
    for o in prev_sel:
        if o.name in bpy.data.objects:
            o.select_set(True)
    if prev_act and prev_act.name in bpy.data.objects:
        bpy.context.view_layer.objects.active = prev_act

    head_manifest = {
        "schema": "toonstudio.character-lab.head-props/1",
        "license": "CC0-1.0",
        "generatedAt": "2026-11-18",
        "generator": f"Blender {bpy.app.version_string} ToonStudio Head Accessories Pipeline",
        "props": head_entries,
    }
    stage_manifest = {
        "schema": "toonstudio.character-lab.stage-props/1",
        "license": "CC0-1.0",
        "generatedAt": "2026-11-18",
        "generator": f"Blender {bpy.app.version_string} ToonStudio Stage Stand Pipeline",
        "props": stage_entries,
    }
    (HEAD_PROP_ROOT / "index.json").write_text(json.dumps(head_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (STAGE_PROP_ROOT / "index.json").write_text(json.dumps(stage_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"head": head_entries, "stage": stage_entries}
