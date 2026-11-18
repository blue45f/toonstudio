"""
Blender 5.2/5.3 Procedural Korean Webtoon Head, Jewel Eye Rig & Delight Texture Baker (v2.2).

Upgrades (v2.2):
- Non-degenerate 2D UV parameterization on 3D ears, crown pole, and hair caps (eliminates WebGL2 PBR
  cotangent NaN black-and-white noise speckles).
- Smooth cylindrical Korean manhwa neck-to-chin transition + strictly bounded `jawOpen` shape key
  (eliminates pinched conical neck seam and downward chin-to-neck spike).
- Eye-clearing parted bangs geometry (`murim-whisker`, `curtain-protagonist`, `rofan-noble`, etc.)
  for crisp iris readability even in 320x512 small webtoon cuts.
- Bespoke luster texture baker (`bake_luster_surface_texture`) for shoes, gold filigree, and gems so
  authored PBR colors are preserved across viewport, PNG capture, and GLB round-trips.
"""
from __future__ import annotations

import math
import os
import struct
import zlib
from typing import Any

import bmesh
import bpy
from mathutils import Vector


def _clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)


def _smoothstep(e0: float, e1: float, x: float) -> float:
    if abs(e1 - e0) < 1e-9:
        return 1.0 if x >= e1 else 0.0
    t = _clamp01((x - e0) / (e1 - e0))
    return t * t * (3.0 - 2.0 * t)


def _lerp3(a: tuple[float, float, float], b: tuple[float, float, float], t: float) -> tuple[float, float, float]:
    t = _clamp01(t)
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def _hex_to_rgb01(h: str) -> tuple[float, float, float]:
    s = h.lstrip("#")
    return (int(s[0:2], 16) / 255.0, int(s[2:4], 16) / 255.0, int(s[4:6], 16) / 255.0)


def _write_png_rgba(path: str, width: int, height: int, rows_rgba_bytes: list[bytes]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = b"".join(b"\x00" + row for row in rows_rgba_bytes)

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def _landmark_v(z: float, z_neck_bot: float, z_chin: float, z_mouth: float, z_nose: float, eye_z: float, z_crown: float) -> float:
    """Piecewise linear UV V mapping so facial paint lands 100% on sculpted landmarks."""
    stops = [
        (z_neck_bot, 0.02),
        (z_chin, 0.250),
        (z_mouth, 0.402),
        (z_nose, 0.505),
        (eye_z, 0.615),
        (z_crown, 0.985),
    ]
    if z <= stops[0][0]:
        return 0.02
    for (z0, v0), (z1, v1) in zip(stops[:-1], stops[1:]):
        if z <= z1:
            t = (z - z0) / max(1e-6, z1 - z0)
            return v0 + (v1 - v0) * t
    return 0.985


def bake_webtoon_skin_texture(
    path: str,
    skin_hex: str,
    blush_hex: str = "#F5989C",
    lip_hex: str = "#E67A86",
    shadow_hex: str = "#DFB4A4",
    size: int = 512,
    blush_strength: float = 0.36,
    lip_strength: float = 0.62,
) -> str:
    skin = _hex_to_rgb01(skin_hex)
    blush = _hex_to_rgb01(blush_hex)
    lip = _hex_to_rgb01(lip_hex)
    shadow = _hex_to_rgb01(shadow_hex)
    line_dark = _lerp3(lip, (0.22, 0.08, 0.12), 0.58)
    nose_shade = _lerp3(shadow, (0.42, 0.24, 0.22), 0.42)

    rows: list[bytes] = []
    for py in range(size):
        v = 1.0 - (py + 0.5) / size
        row = bytearray(size * 4)
        neck_shade = (1.0 - _smoothstep(0.12, 0.26, v)) * 0.18
        crown_warm = _smoothstep(0.72, 0.96, v) * 0.05
        for px in range(size):
            u = (px + 0.5) / size
            col = _lerp3(skin, shadow, neck_shade + crown_warm)

            # Airbrushed Korean webtoon cheek blush below outer eyes (u = 0.5 +- 0.078, v = 0.545)
            for cu in (0.422, 0.578):
                dx = (u - cu) / 0.044
                dy = (v - 0.545) / 0.042
                d2 = dx * dx + dy * dy
                if d2 < 2.0:
                    col = _lerp3(col, blush, math.exp(-d2 * 1.4) * blush_strength)

            # Soft warm ear-helix flush on dedicated ear UV zones (u in [0.10, 0.20] and [0.80, 0.90], v in [0.50, 0.62])
            for ear_u in (0.15, 0.85):
                edx = (u - ear_u) / 0.045
                edy = (v - 0.56) / 0.055
                ed2 = edx * edx + edy * edy
                if ed2 < 1.6:
                    col = _lerp3(col, blush, math.exp(-ed2 * 1.5) * 0.16)

            # Crisp anime nose-side warm shadow wedge + tiny highlight tip at u = 0.5, v = 0.505
            dnx = (u - 0.505) / 0.0085
            dny = (v - 0.508) / 0.026
            if dnx * dnx + dny * dny < 1.8:
                col = _lerp3(col, nose_shade, math.exp(-(dnx * dnx + dny * dny) * 1.9) * 0.46)
            dnb_x = (u - 0.5) / 0.018
            dnb_y = (v - 0.503) / 0.018
            if dnb_x * dnb_x + dnb_y * dnb_y < 1.5:
                col = _lerp3(col, blush, math.exp(-(dnb_x * dnb_x + dnb_y * dnb_y) * 1.8) * 0.22)

            # Delicate double-eyelid crease line above eyes (u = 0.5 +- 0.068, v = 0.650)
            for eu in (0.432, 0.568):
                dex = (u - eu) / 0.038
                arch_v = 0.650 - 0.008 * (dex * dex)
                dey = (v - arch_v) / 0.0045
                if abs(dex) < 1.05 and abs(dey) < 1.6:
                    w_crease = math.exp(-(dey * dey) * 1.6) * (1.0 - abs(dex) ** 2.2) * 0.36
                    col = _lerp3(col, nose_shade, w_crease)

            # Soft gradient Korean webtoon lips + crisp delicate smile lip-part line at v = 0.402
            dlx = (u - 0.5) / 0.032
            smile_curve = 0.0045 * (dlx * dlx)
            dly = (v - (0.402 + smile_curve)) / 0.022
            dl2 = dlx * dlx + dly * dly
            if dl2 < 1.7:
                col = _lerp3(col, lip, math.exp(-dl2 * 1.7) * lip_strength)
            if abs(dlx) < 1.05:
                d_seam = (v - (0.402 + smile_curve)) / 0.0024
                if abs(d_seam) < 1.9:
                    w_seam = math.exp(-(d_seam * d_seam) * 1.85) * (1.0 - abs(dlx) ** 2.0) * 0.78
                    col = _lerp3(col, line_dark, w_seam)
            dgx = (u - 0.506) / 0.0085
            dgy = (v - 0.394) / 0.0050
            if dgx * dgx + dgy * dgy < 1.4:
                col = _lerp3(col, (1.0, 0.96, 0.96), math.exp(-(dgx * dgx + dgy * dgy) * 2.0) * 0.34)

            idx = px * 4
            row[idx] = int(_clamp01(col[0]) * 255)
            row[idx + 1] = int(_clamp01(col[1]) * 255)
            row[idx + 2] = int(_clamp01(col[2]) * 255)
            row[idx + 3] = 255
        rows.append(bytes(row))
    _write_png_rgba(path, size, size, rows)
    return path


def bake_jewel_iris_texture(
    path: str,
    upper_hex: str,
    lower_hex: str,
    pupil_hex: str = "#100B18",
    limbal_hex: str = "#161022",
    size: int = 384,
) -> str:
    upper = _hex_to_rgb01(upper_hex)
    lower = _hex_to_rgb01(lower_hex)
    pupil = _hex_to_rgb01(pupil_hex)
    limbal = _hex_to_rgb01(limbal_hex)
    glow = _lerp3(lower, (1.0, 1.0, 1.0), 0.52)

    rows: list[bytes] = []
    for py in range(size):
        v = 1.0 - (py + 0.5) / size
        dy = (v - 0.5) * 2.0
        row = bytearray(size * 4)
        for px in range(size):
            u = (px + 0.5) / size
            dx = (u - 0.5) * 2.0
            r = math.sqrt(dx * dx + dy * dy)
            ang = math.atan2(dy, dx)

            grad_t = _clamp01(0.52 - dy * 0.62)
            col = _lerp3(upper, lower, grad_t)

            if 0.22 < r < 0.86:
                striation = 0.5 + 0.5 * math.sin(ang * 30.0 + math.sin(ang * 6.0) * 0.5)
                ring_mask = math.sin(_clamp01((r - 0.22) / 0.64) * math.pi)
                col = _lerp3(col, glow, striation * ring_mask * 0.28)

            cres_y = dy + 0.38
            cres_d = math.sqrt((dx * 0.76) ** 2 + (cres_y * 1.60) ** 2)
            if cres_d < 0.56 and r < 0.84:
                col = _lerp3(col, glow, (1.0 - cres_d / 0.56) ** 1.5 * 0.68)

            if dy > 0.06:
                sh_t = _smoothstep(0.06, 0.66, dy) * 0.65
                col = _lerp3(col, limbal, sh_t)

            pr = math.sqrt((dx * 1.15) ** 2 + (dy * 0.90) ** 2)
            if pr < 0.34:
                col = _lerp3(col, pupil, 1.0 - _smoothstep(0.27, 0.34, pr))
            elif pr < 0.43:
                col = _lerp3(col, glow, math.sin(((pr - 0.34) / 0.09) * math.pi) * 0.42)

            if r > 0.78:
                col = _lerp3(col, limbal, _smoothstep(0.78, 0.94, r))

            idx = px * 4
            row[idx] = int(_clamp01(col[0]) * 255)
            row[idx + 1] = int(_clamp01(col[1]) * 255)
            row[idx + 2] = int(_clamp01(col[2]) * 255)
            row[idx + 3] = 255
        rows.append(bytes(row))
    _write_png_rgba(path, size, size, rows)
    return path


def bake_ombre_hair_texture(
    path: str,
    root_hex: str,
    mid_hex: str,
    tip_hex: str,
    halo_hex: str,
    size: int = 384,
) -> str:
    root_c = _hex_to_rgb01(root_hex)
    mid_c = _hex_to_rgb01(mid_hex)
    tip_c = _hex_to_rgb01(tip_hex)
    halo_c = _hex_to_rgb01(halo_hex)
    rows: list[bytes] = []
    for py in range(size):
        v = 1.0 - (py + 0.5) / size
        base = _lerp3(mid_c, root_c, _smoothstep(0.45, 0.95, v)) if v > 0.45 else _lerp3(tip_c, mid_c, _smoothstep(0.04, 0.45, v))
        row = bytearray(size * 4)
        for px in range(size):
            u = (px + 0.5) / size
            strand = 0.5 + 0.35 * math.sin(u * math.pi * 38.0) + 0.15 * math.sin(u * math.pi * 86.0)
            col = _lerp3(base, root_c, (1.0 - strand) * 0.16)
            wave_v = 0.63 + 0.026 * math.sin(u * math.pi * 10.0)
            dv = abs(v - wave_v)
            if dv < 0.052:
                halo_w = ((1.0 - dv / 0.052) ** 2.4) * (0.35 + 0.45 * strand)
                col = _lerp3(col, halo_c, halo_w * 0.22)
            idx = px * 4
            row[idx] = int(_clamp01(col[0]) * 255)
            row[idx + 1] = int(_clamp01(col[1]) * 255)
            row[idx + 2] = int(_clamp01(col[2]) * 255)
            row[idx + 3] = 255
        rows.append(bytes(row))
    _write_png_rgba(path, size, size, rows)
    return path


def bake_couture_fabric_texture(
    path: str,
    primary_hex: str,
    secondary_hex: str,
    accent_hex: str,
    pattern: str = "twill",
    size: int = 384,
) -> str:
    p_c = _hex_to_rgb01(primary_hex)
    s_c = _hex_to_rgb01(secondary_hex)
    a_c = _hex_to_rgb01(accent_hex)
    rows: list[bytes] = []
    for py in range(size):
        v = 1.0 - (py + 0.5) / size
        row = bytearray(size * 4)
        for px in range(size):
            u = (px + 0.5) / size
            col = _lerp3(s_c, p_c, 0.25 + 0.75 * _smoothstep(0.0, 0.85, v))
            weave = 0.5 + 0.5 * math.sin((u + v) * math.pi * 64.0)
            col = _lerp3(col, s_c, weave * 0.06)

            if pattern == "plaid":
                gx, gy = (u * 8.0) % 1.0, (v * 8.0) % 1.0
                if gx < 0.14 or gy < 0.14:
                    col = _lerp3(col, s_c, 0.42)
                if abs(gx - 0.5) < 0.032 or abs(gy - 0.5) < 0.032:
                    col = _lerp3(col, a_c, 0.52)
            elif pattern == "brocade":
                dx = abs(((u * 6.0) % 1.0) - 0.5)
                dy = abs(((v * 6.0) % 1.0) - 0.5)
                if abs((dx + dy) - 0.36) < 0.042:
                    col = _lerp3(col, a_c, 0.42)
                if v < 0.08 or v > 0.93:
                    col = _lerp3(col, a_c, 0.68)
            elif pattern == "cyber":
                diag = 0.5 + 0.5 * math.sin((u * 2.0 - v * 1.5) * math.pi * 4.0)
                col = _lerp3(col, s_c, diag * 0.30)
                if v < 0.08 or abs(u - 0.5) < 0.025:
                    col = _lerp3(col, a_c, 0.72)
            elif pattern == "martial":
                wave = 0.5 + 0.5 * math.sin(u * math.pi * 12.0 + math.sin(v * math.pi * 8.0))
                col = _lerp3(col, s_c, wave * 0.18)
                if v < 0.08:
                    col = _lerp3(col, a_c, 0.62)
            elif pattern == "sanctuary":
                gx = abs(((u * 5.0) % 1.0) - 0.5)
                gy = abs(((v * 5.0) % 1.0) - 0.5)
                if abs(gx + gy - 0.38) < 0.030 or abs(gx - gy) < 0.018:
                    col = _lerp3(col, a_c, 0.36)
                if v < 0.09 or (0.11 < v < 0.135) or v > 0.92:
                    col = _lerp3(col, a_c, 0.78)
            elif pattern == "pinstripe":
                herring = 0.5 + 0.5 * math.sin((u * 46.0 + v * 46.0) * math.pi)
                col = _lerp3(col, s_c, herring * 0.10)
                if abs(((v * 20.0) % 1.0) - 0.5) < 0.024:
                    col = _lerp3(col, a_c, 0.14)
            elif pattern == "academy-crest":
                gx = abs(((u * 6.0) % 1.0) - 0.5)
                gy = abs(((v * 6.0) % 1.0) - 0.5)
                if abs(gx + gy - 0.40) < 0.024:
                    col = _lerp3(col, a_c, 0.28)
                if v < 0.085 or (0.105 < v < 0.125) or abs(u - 0.5) < 0.018:
                    col = _lerp3(col, a_c, 0.76)
            elif pattern == "tactical":
                ripstop_x = abs(((u * 36.0) % 1.0) - 0.5)
                ripstop_y = abs(((v * 36.0) % 1.0) - 0.5)
                if ripstop_x < 0.06 or ripstop_y < 0.06:
                    col = _lerp3(col, s_c, 0.22)
                camo = 0.5 + 0.5 * math.sin(u * math.pi * 5.0 + math.cos(v * math.pi * 4.0) * 1.4)
                if camo > 0.72:
                    col = _lerp3(col, s_c, 0.28)
                if v < 0.065:
                    col = _lerp3(col, a_c, 0.64)
            else:
                if v < 0.06:
                    col = _lerp3(col, a_c, 0.42)

            idx = px * 4
            row[idx] = int(_clamp01(col[0]) * 255)
            row[idx + 1] = int(_clamp01(col[1]) * 255)
            row[idx + 2] = int(_clamp01(col[2]) * 255)
            row[idx + 3] = 255
        rows.append(bytes(row))
    _write_png_rgba(path, size, size, rows)
    return path


def bake_luster_surface_texture(
    path: str,
    primary_hex: str,
    highlight_hex: str | None = None,
    size: int = 128,
) -> str:
    """Bakes a rich subtle luster gradient texture for shoes, gold trim, and gems so authored colors survive untinted."""
    base = _hex_to_rgb01(primary_hex)
    hi = _hex_to_rgb01(highlight_hex) if highlight_hex else _lerp3(base, (1.0, 1.0, 1.0), 0.28)
    deep = _lerp3(base, (0.04, 0.03, 0.06), 0.22)
    rows: list[bytes] = []
    for py in range(size):
        v = 1.0 - (py + 0.5) / size
        row = bytearray(size * 4)
        for px in range(size):
            u = (px + 0.5) / size
            col = _lerp3(deep, base, _smoothstep(0.05, 0.70, v))
            sheen = math.exp(-(((v - 0.68) / 0.16) ** 2)) * (0.45 + 0.55 * math.sin(u * math.pi))
            col = _lerp3(col, hi, sheen * 0.36)
            idx = px * 4
            row[idx] = int(_clamp01(col[0]) * 255)
            row[idx + 1] = int(_clamp01(col[1]) * 255)
            row[idx + 2] = int(_clamp01(col[2]) * 255)
            row[idx + 3] = 255
        rows.append(bytes(row))
    _write_png_rgba(path, size, size, rows)
    return path


def make_textured_pbr_material(
    name: str,
    tex_path: str | None = None,
    base_rgba: tuple[float, float, float, float] = (1.0, 1.0, 1.0, 1.0),
    roughness: float = 0.58,
    metallic: float = 0.0,
    emission_hex: str | None = None,
    emission_strength: float = 0.0,
    backface_culling: bool = False,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.use_backface_culling = backface_culling
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (360, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (40, 0)
    bsdf.inputs["Base Color"].default_value = base_rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.28
    if emission_hex and emission_strength > 0.0 and "Emission Color" in bsdf.inputs:
        er, eg, eb = _hex_to_rgb01(emission_hex)
        bsdf.inputs["Emission Color"].default_value = (er, eg, eb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    if tex_path and os.path.exists(tex_path):
        tex = nodes.new("ShaderNodeTexImage")
        tex.location = (-280, 0)
        tex.image = bpy.data.images.load(tex_path, check_existing=True)
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def _bind_to_armature(obj: bpy.types.Object, arm_obj: bpy.types.Object) -> None:
    obj.parent = arm_obj
    mod = obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm_obj


def _assign_weights(obj: bpy.types.Object, weights_per_vert: list[dict[str, float]]) -> None:
    groups: dict[str, bpy.types.VertexGroup] = {}
    for vid, wmap in enumerate(weights_per_vert):
        total = sum(wmap.values()) or 1.0
        for bname, w in wmap.items():
            if w <= 1e-5:
                continue
            vg = groups.get(bname)
            if vg is None:
                vg = obj.vertex_groups.new(name=bname)
                groups[bname] = vg
            vg.add([vid], w / total, "REPLACE")


def build_sculpted_webtoon_bangs_bmesh(
    gender: str,
    bang_style: str,
    eye_z: float,
    y_cranium: float,
) -> bmesh.types.BMesh:
    """
    Sculpts lush, tapered 3D keeled ribbon front bangs & cheek-framing side tresses
    with guaranteed iris clearance so eyes remain crisp in 320x512 small webtoon cuts.
    """
    bm = bmesh.new()
    uv_l = bm.loops.layers.uv.new("UVMap")
    is_male = gender == "male"

    # Strand specs: (az_deg_start, az_deg_end, width_rad, z_start, z_end, bulge_front, curve_x)
    # Note: Eyes sit around +-22..26 deg at eye_z; center/inner strands stop above brow/upper lash
    # (eye_z + 0.015), while long cheek strands sweep outside +-34 deg!
    if bang_style == "curtain-protagonist":
        strands = [
            (-7.0, -3.0, 0.013, eye_z + 0.094, eye_z + 0.016, 0.010, -0.003),
            (7.0, 3.0, 0.013, eye_z + 0.094, eye_z + 0.016, 0.010, 0.003),
            (-19.0, -29.0, 0.019, eye_z + 0.091, eye_z + 0.012, 0.011, -0.006),
            (19.0, 29.0, 0.019, eye_z + 0.091, eye_z + 0.012, 0.011, 0.006),
            (-36.0, -44.0, 0.023, eye_z + 0.082, eye_z - 0.072, 0.010, -0.004),
            (36.0, 44.0, 0.023, eye_z + 0.082, eye_z - 0.072, 0.010, 0.004),
        ]
    elif bang_style == "hunter-comma":
        strands = [
            (-4.0, 6.0, 0.018, eye_z + 0.095, eye_z + 0.016, 0.012, 0.006),
            (-17.0, -28.0, 0.019, eye_z + 0.093, eye_z + 0.014, 0.011, -0.005),
            (18.0, 29.0, 0.019, eye_z + 0.091, eye_z + 0.014, 0.011, 0.005),
            (-36.0, -41.0, 0.019, eye_z + 0.082, eye_z - 0.038, 0.009, -0.002),
            (36.0, 41.0, 0.019, eye_z + 0.082, eye_z - 0.038, 0.009, 0.002),
        ]
    elif bang_style == "rofan-noble":
        strands = [
            (-15.0, -29.0, 0.021, eye_z + 0.095, eye_z + 0.012, 0.011, -0.007),
            (15.0, 29.0, 0.021, eye_z + 0.095, eye_z + 0.012, 0.011, 0.007),
            (-36.0, -43.0, 0.025, eye_z + 0.086, eye_z - 0.105, 0.010, -0.005),
            (36.0, 43.0, 0.025, eye_z + 0.086, eye_z - 0.105, 0.010, 0.005),
        ]
    elif bang_style == "murim-whisker":
        # Cleanly parted dragon-whisker bangs leaving both irises 100% unobstructed!
        strands = [
            (-15.0, -30.0, 0.017, eye_z + 0.093, eye_z + 0.012, 0.010, -0.006),
            (15.0, 30.0, 0.017, eye_z + 0.093, eye_z + 0.012, 0.010, 0.006),
            (-36.0, -42.0, 0.019, eye_z + 0.084, eye_z - 0.112, 0.009, -0.004),
            (36.0, 42.0, 0.019, eye_z + 0.084, eye_z - 0.112, 0.009, 0.004),
        ]
    elif bang_style == "idol-air":
        strands = [
            (0.0, 0.0, 0.013, eye_z + 0.095, eye_z + 0.018, 0.010, 0.0),
            (-13.0, -17.0, 0.015, eye_z + 0.094, eye_z + 0.016, 0.010, -0.002),
            (13.0, 17.0, 0.015, eye_z + 0.094, eye_z + 0.016, 0.010, 0.002),
            (-34.0, -38.0, 0.022, eye_z + 0.085, eye_z - 0.085, 0.010, -0.003),
            (34.0, 38.0, 0.022, eye_z + 0.085, eye_z - 0.085, 0.010, 0.003),
        ]
    elif bang_style == "saintess-hime":
        strands = [
            (-5.0, -10.0, 0.018, eye_z + 0.104, eye_z + 0.020, 0.011, -0.002),
            (5.0, 10.0, 0.018, eye_z + 0.104, eye_z + 0.020, 0.011, 0.002),
            (-16.0, -24.0, 0.021, eye_z + 0.102, eye_z + 0.018, 0.011, -0.003),
            (16.0, 24.0, 0.021, eye_z + 0.102, eye_z + 0.018, 0.011, 0.003),
            (-29.0, -34.0, 0.020, eye_z + 0.098, eye_z + 0.015, 0.010, -0.002),
            (29.0, 34.0, 0.020, eye_z + 0.098, eye_z + 0.015, 0.010, 0.002),
            (-41.5, -44.5, 0.025, eye_z + 0.090, eye_z - 0.094, 0.011, 0.0),
            (41.5, 44.5, 0.025, eye_z + 0.090, eye_z - 0.094, 0.011, 0.0),
        ]
    elif bang_style == "ceo-parted":
        strands = [
            (-6.0, -18.0, 0.024, eye_z + 0.106, eye_z + 0.022, 0.013, -0.005),
            (-18.0, -31.0, 0.023, eye_z + 0.102, eye_z + 0.019, 0.012, -0.006),
            (5.0, 17.0, 0.025, eye_z + 0.106, eye_z + 0.019, 0.014, 0.006),
            (18.0, 31.0, 0.022, eye_z + 0.100, eye_z + 0.017, 0.012, 0.005),
            (-37.0, -42.0, 0.020, eye_z + 0.088, eye_z - 0.026, 0.009, -0.002),
            (37.0, 42.0, 0.020, eye_z + 0.088, eye_z - 0.026, 0.009, 0.002),
        ]
    elif bang_style == "council-parted":
        strands = [
            (-8.0, -21.0, 0.023, eye_z + 0.105, eye_z + 0.019, 0.012, -0.005),
            (-21.0, -32.0, 0.021, eye_z + 0.100, eye_z + 0.016, 0.011, -0.005),
            (4.0, 15.0, 0.022, eye_z + 0.105, eye_z + 0.020, 0.012, 0.004),
            (16.0, 29.0, 0.021, eye_z + 0.101, eye_z + 0.016, 0.011, 0.005),
            (-38.0, -43.5, 0.023, eye_z + 0.090, eye_z - 0.082, 0.010, -0.003),
            (38.0, 43.5, 0.023, eye_z + 0.090, eye_z - 0.082, 0.010, 0.003),
        ]
    elif bang_style == "sniper-swept":
        strands = [
            (-5.0, -16.0, 0.022, eye_z + 0.105, eye_z + 0.018, 0.013, -0.005),
            (5.0, 18.0, 0.023, eye_z + 0.105, eye_z + 0.017, 0.013, 0.006),
            (-20.0, -32.0, 0.021, eye_z + 0.100, eye_z + 0.015, 0.011, -0.005),
            (20.0, 32.0, 0.021, eye_z + 0.100, eye_z + 0.015, 0.011, 0.005),
            (-38.0, -43.0, 0.020, eye_z + 0.086, eye_z - 0.048, 0.010, -0.003),
            (38.0, 43.0, 0.020, eye_z + 0.086, eye_z - 0.048, 0.010, 0.003),
        ]
    else:  # duke-wolf
        strands = [
            (-5.0, -14.0, 0.018, eye_z + 0.095, eye_z + 0.015, 0.012, -0.005),
            (7.0, 17.0, 0.018, eye_z + 0.095, eye_z + 0.015, 0.012, 0.005),
            (-27.0, -34.0, 0.020, eye_z + 0.090, eye_z - 0.028, 0.011, -0.004),
            (27.0, 34.0, 0.020, eye_z + 0.090, eye_z - 0.028, 0.011, 0.004),
            (-39.0, -44.0, 0.020, eye_z + 0.080, eye_z - 0.085, 0.009, -0.003),
            (39.0, 44.0, 0.020, eye_z + 0.080, eye_z - 0.085, 0.009, 0.003),
        ]

    rx_base = 0.0775 if not is_male else 0.0795
    ry_base = 0.0815

    dome_cap_styles = ("saintess-hime", "ceo-parted", "council-parted", "sniper-swept")
    if bang_style in dome_cap_styles:
        cap_rows = []
        for iv_c in range(6):
            tv_c = iv_c / 5.0
            z_c = eye_z + 0.098 - 0.038 * tv_c
            t_top_c = max(0.0, min(0.96, ((z_c - (eye_z - 0.068)) / 0.179 - 0.38) / 0.62))
            dome_c = math.sqrt(max(0.08, 1.0 - (t_top_c ** 1.95)))
            top_tuck = 0.009 * (1.0 - _smoothstep(0.0, 0.42, tv_c))
            rx_c = (0.0775 if not is_male else 0.0795) * dome_c + 0.004 * math.sin(tv_c * math.pi) - top_tuck * 0.5
            ry_c = 0.0825 * dome_c + 0.006 * math.sin(tv_c * math.pi) - top_tuck
            crow = []
            for iu_c in range(17):
                ang_c = math.radians(-38.0 + (iu_c / 16.0) * 76.0)
                edge_tuck = 0.004 * (abs((iu_c / 8.0) - 1.0) ** 2.0)
                crow.append(bm.verts.new((rx_c * math.sin(ang_c), y_cranium - (ry_c - edge_tuck) * math.cos(ang_c), z_c)))
            cap_rows.append(crow)
        for iv_c in range(5):
            for iu_c in range(16):
                fc = bm.faces.new((cap_rows[iv_c][iu_c], cap_rows[iv_c][iu_c + 1], cap_rows[iv_c + 1][iu_c + 1], cap_rows[iv_c + 1][iu_c]))
                fc.smooth = True
                fc.loops[0][uv_l].uv = (0.1 + 0.8 * (iu_c / 16.0), 0.96 - 0.30 * (iv_c / 5.0))
                fc.loops[1][uv_l].uv = (0.1 + 0.8 * ((iu_c + 1) / 16.0), 0.96 - 0.30 * (iv_c / 5.0))
                fc.loops[2][uv_l].uv = (0.1 + 0.8 * ((iu_c + 1) / 16.0), 0.96 - 0.30 * ((iv_c + 1) / 5.0))
                fc.loops[3][uv_l].uv = (0.1 + 0.8 * (iu_c / 16.0), 0.96 - 0.30 * ((iv_c + 1) / 5.0))

    full_root = bang_style in dome_cap_styles
    n_prof = 8
    for idx_s, (a0, a1, w_half, zs, ze, bulge, cx_off) in enumerate(strands):
        n_seg = 12
        zs_adj = zs - (0.003 if full_root else 0.008)
        rows_s: list[list[bmesh.types.BMVert]] = []
        for iseg in range(n_seg):
            t = iseg / (n_seg - 1)
            ang = math.radians(a0 + (a1 - a0) * (t ** 1.15))
            if full_root:
                taper = (0.76 + 0.24 * math.sin((t / 0.25) * math.pi * 0.5)) if t < 0.25 else (1.0 - ((t - 0.25) / 0.75) ** 1.45)
            else:
                taper = math.sin(min(1.0, t * 1.18) * math.pi * 0.5) if t < 0.25 else (1.0 - ((t - 0.25) / 0.75) ** 1.45)
            taper = max(0.035, taper)
            w = w_half * taper
            thick = 0.0036 * taper

            z = zs_adj + (ze - zs_adj) * (t ** 0.92)
            root_tuck = (1.0 - _smoothstep(0.0, 0.26, t)) * 0.015
            arch_out = bulge * math.sin(t * math.pi * 0.82) - root_tuck
            rad_x = rx_base + arch_out * 0.45
            rad_y = ry_base + arch_out
            if z < eye_z - 0.02:
                tuck = _smoothstep(eye_z - 0.02, eye_z - 0.11, z) * 0.010
                rad_x -= tuck

            cx = rad_x * math.sin(ang) + cx_off * math.sin(t * math.pi)
            cy = y_cranium - rad_y * math.cos(ang)
            tx, ty = math.cos(ang), math.sin(ang)
            nx, ny = math.sin(ang), -math.cos(ang)

            ring_p: list[bmesh.types.BMVert] = []
            for k in range(n_prof):
                phi = (k / n_prof) * 2.0 * math.pi
                across = -math.cos(phi) * w
                out_n = math.sin(phi) * (thick if math.sin(phi) >= 0.0 else thick * 0.42)
                curve_cup = -0.0018 * (math.cos(phi) ** 2) * taper
                ring_p.append(
                    bm.verts.new((
                        cx + tx * across + nx * (out_n + curve_cup),
                        cy + ty * across + ny * (out_n + curve_cup),
                        z,
                    ))
                )
            rows_s.append(ring_p)

        for iseg in range(n_seg - 1):
            r0, r1 = rows_s[iseg], rows_s[iseg + 1]
            v0, v1 = 0.97 - 0.94 * (iseg / (n_seg - 1)), 0.97 - 0.94 * ((iseg + 1) / (n_seg - 1))
            for k in range(n_prof):
                kn = (k + 1) % n_prof
                f = bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))
                f.smooth = True
                u0_uv = (idx_s * 0.13 + (k / n_prof) * 0.12) % 0.92 + 0.02
                u1_uv = u0_uv + 0.12 / n_prof
                f.loops[0][uv_l].uv = (u0_uv, v0)
                f.loops[1][uv_l].uv = (u1_uv, v0)
                f.loops[2][uv_l].uv = (u1_uv, v1)
                f.loops[3][uv_l].uv = (u0_uv, v1)
        f_root = bm.faces.new(list(reversed(rows_s[0])))
        f_tip = bm.faces.new(rows_s[-1])
        for k_lp, lp in enumerate(f_root.loops):
            ang_lp = (k_lp / max(1, len(f_root.loops))) * 2.0 * math.pi
            lp[uv_l].uv = (0.5 + 0.02 * math.cos(ang_lp), 0.96 + 0.02 * math.sin(ang_lp))
        for k_lp, lp in enumerate(f_tip.loops):
            ang_lp = (k_lp / max(1, len(f_tip.loops))) * 2.0 * math.pi
            lp[uv_l].uv = (0.5 + 0.02 * math.cos(ang_lp), 0.04 + 0.02 * math.sin(ang_lp))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_korean_webtoon_head_and_face(
    arm_obj: bpy.types.Object,
    gender: str,
    face_style: str,
    skin_mat: bpy.types.Material,
    sclera_mat: bpy.types.Material,
    iris_mat: bpy.types.Material,
    highlight_mat: bpy.types.Material,
    lash_mat: bpy.types.Material,
    brow_mat: bpy.types.Material,
    neck_ring_fit: tuple[float, float, float] | None = None,
    scale_z: float = 1.0,
    z_offset: float = 0.0,
) -> dict[str, bpy.types.Object]:
    is_male = gender == "male"
    b_neck = arm_obj.data.bones["mixamorig:Neck"].head_local.copy()
    b_head = arm_obj.data.bones["mixamorig:Head"].head_local.copy()
    b_eye_l = arm_obj.data.bones["TS_ShaperEye.L"].head_local.copy()

    eye_z = b_eye_l.z
    eye_x = 0.0322 if not is_male else 0.0326
    y_cranium = b_head.y - 0.0355
    # Start neck cleanly just below mixamorig:Neck so it docks seamlessly into TS_Shaper_Body's neck!
    z_neck_bot = b_neck.z - 0.012 * scale_z + z_offset
    z_chin = eye_z - (0.065 if not is_male else 0.072) * scale_z
    z_nose = eye_z - (0.022 if not is_male else 0.025) * scale_z
    z_mouth = eye_z - (0.041 if not is_male else 0.045) * scale_z
    z_crown = eye_z + (0.111 if not is_male else 0.110) * scale_z

    fit_rx, fit_ry, fit_cy = neck_ring_fit if neck_ring_fit else (
        (0.045 if not is_male else 0.052),
        (0.046 if not is_male else 0.052),
        -0.022,
    )

    nu, nv = 64, 48
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    ring_verts: list[list[bmesh.types.BMVert]] = []
    ring_zs: list[float] = []
    for iv in range(nv):
        tv = iv / (nv - 1)
        z = z_neck_bot + (z_crown - z_neck_bot) * tv
        ring_zs.append(z)

        s = (z - z_chin) / max(1e-5, (z_crown - z_chin))
        # Smooth anatomical neck column: below z_chin (s <= 0), pure cylindrical neck tapering gently upward;
        # above z_chin (s > 0), blends smoothly into the V-line jaw & cranium without pinching X-width!
        neck_up_t = _smoothstep(z_neck_bot, z_chin + 0.010, z)
        neck_rx = fit_rx * (1.0 - 0.10 * neck_up_t)
        neck_ry = fit_ry * (1.0 - 0.08 * neck_up_t)
        neck_cy = fit_cy + (-0.010) * neck_up_t

        max_rx = 0.0748 if not is_male else 0.0768
        if face_style == "sharp":
            max_rx *= 0.985

        chin_tip_w = 0.0220 if not is_male else 0.0260
        if s <= 0.0:
            t_jaw = 0.0
            head_rx = neck_rx
            head_ry_front = 0.068
            head_ry_back = 0.072
        elif s < 0.38:
            t_jaw = s / 0.38
            v_pow = 0.62 if not is_male else 0.70
            if face_style == "cute":
                v_pow = 0.56
            elif face_style == "sharp":
                v_pow = 0.74
            head_rx = chin_tip_w + (max_rx - chin_tip_w) * (t_jaw ** v_pow)
            head_ry_front = 0.070 + 0.007 * math.sin(t_jaw * math.pi * 0.65)
            head_ry_back = 0.074 + 0.016 * _smoothstep(0.0, 1.0, t_jaw)
        else:
            t_top = _clamp01((s - 0.38) / 0.62)
            dome = math.sqrt(max(0.018, 1.0 - (t_top ** 1.95)))
            head_rx = max_rx * dome
            head_ry_front = 0.077 * dome
            head_ry_back = 0.090 * dome

        neck_blend = 1.0 - _smoothstep(-0.04, 0.12, s)
        row_v: list[bmesh.types.BMVert] = []
        for iu in range(nu):
            theta = ((iu / nu) - 0.5) * (2.0 * math.pi)
            sin_t, cos_t = math.sin(theta), math.cos(theta)

            nx = neck_rx * sin_t
            ny = neck_cy - neck_ry * cos_t

            ry = head_ry_front if cos_t >= 0.0 else head_ry_back
            front_flat = 1.0 - 0.082 * (max(0.0, cos_t) ** 2) * _smoothstep(-0.02, 0.25, s) * (1.0 - _smoothstep(0.65, 0.92, s))
            hx = head_rx * sin_t
            hy = y_cranium - (ry * front_flat) * cos_t

            # Front chin projects cleanly forward at s >= 0 while the neck cylinder underneath stays smooth & round
            chin_proj = _smoothstep(0.20, 0.85, cos_t) * _smoothstep(-0.03, 0.04, s)
            local_neck_blend = neck_blend * (1.0 - 0.65 * chin_proj)
            x = hx * (1.0 - local_neck_blend) + nx * local_neck_blend
            y = hy * (1.0 - local_neck_blend) + ny * local_neck_blend

            if cos_t > 0.10 and -0.03 < s < 0.78:
                for sx in (-1.0, 1.0):
                    dcx = (x - sx * (eye_x * 1.12)) / 0.022
                    dcz = (z - (eye_z - 0.018 * scale_z)) / (0.018 * scale_z)
                    dc2 = dcx * dcx + dcz * dcz
                    if dc2 < 2.2:
                        c_push = math.exp(-dc2 * 1.15) * (0.0028 if not is_male else 0.0016)
                        y -= c_push
                        x += sx * c_push * 0.45

                for sx in (-1.0, 1.0):
                    dex = (x - sx * eye_x) / 0.022
                    dez = (z - eye_z) / (0.015 * scale_z)
                    de2 = dex * dex + dez * dez
                    if de2 < 2.1:
                        y += math.exp(-de2 * 1.35) * 0.0044

                dnx = x / (0.0062 if not is_male else 0.0072)
                dnz_tip = (z - z_nose) / (0.0095 * scale_z)
                tip_w = math.exp(-(dnx * dnx * 1.3 + dnz_tip * dnz_tip * 1.4))
                bridge_t = _smoothstep(z_nose, eye_z - 0.003 * scale_z, z) * (1.0 - _smoothstep(eye_z - 0.003 * scale_z, eye_z + 0.012 * scale_z, z))
                bridge_w = math.exp(-(dnx * dnx * 1.9)) * bridge_t
                y -= (0.0102 if not is_male else 0.0124) * tip_w + (0.0032 if not is_male else 0.0048) * bridge_w

                dmx = x / 0.0145
                if abs(dmx) < 1.6:
                    mx_env = math.exp(-(dmx * dmx) * 1.4)
                    cupid = 1.0 - 0.22 * math.exp(-((x / 0.0035) ** 2))
                    duz = (z - (z_mouth + 0.0032 * scale_z)) / (0.0036 * scale_z)
                    dlz = (z - (z_mouth - 0.0036 * scale_z)) / (0.0040 * scale_z)
                    dcz_seam = (z - z_mouth) / (0.0018 * scale_z)
                    y -= (
                        0.0028 * math.exp(-duz * duz) * cupid
                        + 0.0026 * math.exp(-dlz * dlz)
                        - 0.0020 * math.exp(-dcz_seam * dcz_seam)
                    ) * mx_env

                dch_x = x / 0.013
                dch_z = (z - (z_chin + 0.005 * scale_z)) / (0.0085 * scale_z)
                if dch_x * dch_x + dch_z * dch_z < 2.0:
                    y -= math.exp(-(dch_x * dch_x + dch_z * dch_z) * 1.25) * 0.0025

            row_v.append(bm.verts.new((x, y, z)))
        ring_verts.append(row_v)

    for iv in range(nv - 1):
        v_uv0 = _landmark_v(ring_zs[iv], z_neck_bot, z_chin, z_mouth, z_nose, eye_z, z_crown)
        v_uv1 = _landmark_v(ring_zs[iv + 1], z_neck_bot, z_chin, z_mouth, z_nose, eye_z, z_crown)
        for iu in range(nu):
            iu_next = (iu + 1) % nu
            f = bm.faces.new((ring_verts[iv][iu], ring_verts[iv][iu_next], ring_verts[iv + 1][iu_next], ring_verts[iv + 1][iu]))
            f.smooth = True
            f.loops[0][uv_layer].uv = (iu / nu, v_uv0)
            f.loops[1][uv_layer].uv = ((iu + 1) / nu, v_uv0)
            f.loops[2][uv_layer].uv = ((iu + 1) / nu, v_uv1)
            f.loops[3][uv_layer].uv = (iu / nu, v_uv1)

    crown_pole = bm.verts.new((0.0, y_cranium, z_crown + 0.0025 * scale_z))
    top_ring = ring_verts[-1]
    v_top_ring = _landmark_v(ring_zs[-1], z_neck_bot, z_chin, z_mouth, z_nose, eye_z, z_crown)
    for iu in range(nu):
        iu_next = (iu + 1) % nu
        f = bm.faces.new((top_ring[iu], top_ring[iu_next], crown_pole))
        f.smooth = True
        f.loops[0][uv_layer].uv = (iu / nu, v_top_ring)
        f.loops[1][uv_layer].uv = ((iu + 1) / nu, v_top_ring)
        f.loops[2][uv_layer].uv = ((iu + 0.5) / nu, 0.998)

    # Sculpted 3D anime C-ears with clean non-degenerate 2D UV islands!
    ear_z_mid = eye_z - 0.008 * scale_z
    ear_y_mid = y_cranium - 0.004
    ear_x_base = 0.0738 if not is_male else 0.0758
    for sx in (-1.0, 1.0):
        u_ear_center = 0.15 if sx < 0 else 0.85
        ear_rings: list[list[bmesh.types.BMVert]] = []
        n_eu, n_ev = 12, 8
        for iev in range(n_ev):
            tev = iev / (n_ev - 1)
            erow = []
            for ieu in range(n_eu):
                ang = (ieu / n_eu) * 2.0 * math.pi
                r_maj = 0.0185 * scale_z * (1.0 - 0.55 * (tev ** 2.2))
                r_min = 0.0098 * (1.0 - 0.52 * (tev ** 2.2))
                ex = sx * (ear_x_base - 0.004 + 0.0145 * math.sin(tev * math.pi * 0.78))
                ey = ear_y_mid + r_min * math.cos(ang) + 0.0052 * tev
                ez = ear_z_mid + r_maj * math.sin(ang) + 0.002 * tev
                erow.append(bm.verts.new((ex, ey, ez)))
            ear_rings.append(erow)
        for iev in range(n_ev - 1):
            v0_e = 0.51 + 0.09 * (iev / (n_ev - 1))
            v1_e = 0.51 + 0.09 * ((iev + 1) / (n_ev - 1))
            for ieu in range(n_eu):
                inext = (ieu + 1) % n_eu
                u0_e = u_ear_center - 0.04 + 0.08 * (ieu / n_eu)
                u1_e = u_ear_center - 0.04 + 0.08 * ((ieu + 1) / n_eu)
                if sx > 0:
                    f = bm.faces.new((ear_rings[iev][ieu], ear_rings[iev][inext], ear_rings[iev + 1][inext], ear_rings[iev + 1][ieu]))
                    f.loops[0][uv_layer].uv = (u0_e, v0_e)
                    f.loops[1][uv_layer].uv = (u1_e, v0_e)
                    f.loops[2][uv_layer].uv = (u1_e, v1_e)
                    f.loops[3][uv_layer].uv = (u0_e, v1_e)
                else:
                    f = bm.faces.new((ear_rings[iev][inext], ear_rings[iev][ieu], ear_rings[iev + 1][ieu], ear_rings[iev + 1][inext]))
                    f.loops[0][uv_layer].uv = (u1_e, v0_e)
                    f.loops[1][uv_layer].uv = (u0_e, v0_e)
                    f.loops[2][uv_layer].uv = (u0_e, v1_e)
                    f.loops[3][uv_layer].uv = (u1_e, v1_e)
                f.smooth = True
        tip_v = bm.verts.new((sx * (ear_x_base + 0.0105), ear_y_mid + 0.0052, ear_z_mid + 0.002))
        last_r = ear_rings[-1]
        for ieu in range(n_eu):
            inext = (ieu + 1) % n_eu
            u0_e = u_ear_center - 0.04 + 0.08 * (ieu / n_eu)
            u1_e = u_ear_center - 0.04 + 0.08 * ((ieu + 1) / n_eu)
            if sx > 0:
                f = bm.faces.new((last_r[ieu], last_r[inext], tip_v))
                f.loops[0][uv_layer].uv = (u0_e, 0.60)
                f.loops[1][uv_layer].uv = (u1_e, 0.60)
                f.loops[2][uv_layer].uv = (0.5 * (u0_e + u1_e), 0.615)
            else:
                f = bm.faces.new((last_r[inext], last_r[ieu], tip_v))
                f.loops[0][uv_layer].uv = (u1_e, 0.60)
                f.loops[1][uv_layer].uv = (u0_e, 0.60)
                f.loops[2][uv_layer].uv = (0.5 * (u0_e + u1_e), 0.615)
            f.smooth = True

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    head_mesh = bpy.data.meshes.new("TS_Shaper_Head")
    bm.to_mesh(head_mesh)
    bm.free()

    head_obj = bpy.data.objects.new("TS_Shaper_Head", head_mesh)
    bpy.context.collection.objects.link(head_obj)
    head_obj.data.materials.append(skin_mat)
    _bind_to_armature(head_obj, arm_obj)

    h_weights: list[dict[str, float]] = []
    for v in head_obj.data.vertices:
        # Bottom ring blends into Spine2 + Neck so neck rotation never cracks the collar seam!
        w_spine2 = (1.0 - _smoothstep(z_neck_bot, z_neck_bot + 0.012, v.co.z)) * 0.35
        wz_neck = (1.0 - _smoothstep(z_neck_bot + 0.010, z_chin + 0.016, v.co.z)) - w_spine2
        wz_neck = max(0.0, wz_neck)
        jaw_mask = 0.0
        if v.co.y < y_cranium - 0.032 and z_chin + 0.002 < v.co.z < z_mouth + 0.004:
            jaw_mask = (
                _smoothstep(z_chin + 0.002, z_chin + 0.012, v.co.z)
                * (1.0 - _smoothstep(z_mouth - 0.004, z_mouth + 0.004, v.co.z))
                * _smoothstep(y_cranium - 0.032, y_cranium - 0.062, v.co.y)
                * 0.45
            )
        w_head = max(0.0, 1.0 - w_spine2 - wz_neck - jaw_mask)
        h_weights.append({"mixamorig:Spine2": w_spine2, "mixamorig:Neck": wz_neck, "mixamorig:Head": w_head, "TS_ShaperJaw": jaw_mask})
    _assign_weights(head_obj, h_weights)

    head_obj.shape_key_add(name="Basis", from_mix=False)
    base_coords = [v.co.copy() for v in head_obj.data.vertices]

    def add_head_sk(name: str, fn: Any) -> None:
        sk = head_obj.shape_key_add(name=name, from_mix=False)
        for idx, co in enumerate(base_coords):
            dx, dy, dz = fn(co)
            sk.data[idx].co = Vector((co.x + dx, co.y + dy, co.z + dz))

    def eye_inf(co: Vector) -> tuple[float, float]:
        best, side = 0.0, (1.0 if co.x >= 0.0 else -1.0)
        for sx in (-1.0, 1.0):
            d2 = ((co.x - sx * eye_x) / 0.025) ** 2 + ((co.z - eye_z) / 0.020) ** 2 + ((co.y - (y_cranium - 0.072)) / 0.030) ** 2
            w = math.exp(-d2 * 1.2)
            if w > best:
                best, side = w, sx
        return best, side

    def nose_inf(co: Vector) -> float:
        if co.y > y_cranium - 0.040:
            return 0.0
        return math.exp(-(((co.x / 0.015) ** 2 + ((co.z - (z_nose + 0.005)) / 0.016) ** 2) * 1.3))

    def mouth_inf(co: Vector) -> float:
        # Strictly zero below z_chin so mouth/jaw morphs NEVER pull neck vertices!
        if co.y > y_cranium - 0.042 or co.z < z_chin:
            return 0.0
        chin_guard = _smoothstep(z_chin, z_chin + 0.010, co.z)
        return chin_guard * math.exp(-(((co.x / 0.021) ** 2 + ((co.z - z_mouth) / 0.012) ** 2) * 1.45))

    def jaw_inf(co: Vector) -> float:
        if co.z > eye_z - 0.012 or co.z < z_chin - 0.004:
            return 0.0
        return _smoothstep(eye_z - 0.012, z_chin + 0.014, co.z) * _smoothstep(z_chin - 0.004, z_chin + 0.010, co.z)

    def ear_inf(co: Vector) -> float:
        if abs(co.x) < ear_x_base - 0.006:
            return 0.0
        return math.exp(-((((abs(co.x) - ear_x_base) / 0.020) ** 2 + ((co.z - ear_z_mid) / 0.026) ** 2 + ((co.y - ear_y_mid) / 0.020) ** 2) * 1.1))

    add_head_sk("faceEyeSizeBig", lambda c: (lambda w, s: ((c.x - s * eye_x) * 0.14 * w, 0.0, (c.z - eye_z) * 0.18 * w))(*eye_inf(c)))
    add_head_sk("faceEyeSizeSmall", lambda c: (lambda w, s: (-(c.x - s * eye_x) * 0.14 * w, 0.0, -(c.z - eye_z) * 0.18 * w))(*eye_inf(c)))
    add_head_sk("faceEyeSpacingWide", lambda c: (lambda w, s: (s * 0.0045 * w, 0.0, 0.0))(*eye_inf(c)))
    add_head_sk("faceEyeSpacingNarrow", lambda c: (lambda w, s: (-s * 0.0045 * w, 0.0, 0.0))(*eye_inf(c)))
    add_head_sk("faceEyeTiltUp", lambda c: (lambda w, s: (0.0, 0.0, ((abs(c.x) - eye_x) * 0.25) * w))(*eye_inf(c)))
    add_head_sk("faceEyeTiltDown", lambda c: (lambda w, s: (0.0, 0.0, -((abs(c.x) - eye_x) * 0.25) * w))(*eye_inf(c)))
    add_head_sk("faceNoseHeightHigh", lambda c: (0.0, 0.0, 0.0042 * nose_inf(c)))
    add_head_sk("faceNoseHeightLow", lambda c: (0.0, 0.0, -0.0042 * nose_inf(c)))
    add_head_sk("faceNoseWidthWide", lambda c: (c.x * 0.28 * nose_inf(c), 0.0, 0.0))
    add_head_sk("faceNoseWidthNarrow", lambda c: (-c.x * 0.24 * nose_inf(c), 0.0, 0.0))
    add_head_sk("faceNoseDepthHigh", lambda c: (0.0, -0.0046 * nose_inf(c), 0.0))
    add_head_sk("faceNoseDepthLow", lambda c: (0.0, 0.0038 * nose_inf(c), 0.0))
    add_head_sk("faceMouthWidthWide", lambda c: (c.x * 0.26 * mouth_inf(c), 0.0, 0.0))
    add_head_sk("faceMouthWidthNarrow", lambda c: (-c.x * 0.24 * mouth_inf(c), 0.0, 0.0))
    add_head_sk("faceLipFullnessHigh", lambda c: (0.0, -0.0028 * mouth_inf(c), (c.z - z_mouth) * 0.22 * mouth_inf(c)))
    add_head_sk("faceLipFullnessLow", lambda c: (0.0, 0.0020 * mouth_inf(c), -(c.z - z_mouth) * 0.18 * mouth_inf(c)))
    add_head_sk("faceJawWidthWide", lambda c: (c.x * 0.12 * jaw_inf(c), 0.0, 0.0))
    add_head_sk("faceJawWidthNarrow", lambda c: (-c.x * 0.12 * jaw_inf(c), 0.0, 0.0))
    add_head_sk("faceChinLengthLong", lambda c: (0.0, 0.0, -0.0052 * jaw_inf(c) * _smoothstep(0.028, 0.0, abs(c.x))))
    add_head_sk("faceChinLengthShort", lambda c: (0.0, 0.0, 0.0046 * jaw_inf(c) * _smoothstep(0.028, 0.0, abs(c.x))))
    add_head_sk("faceCheekVolumeHigh", lambda c: (c.x * 0.07 * jaw_inf(c), -0.0032 * jaw_inf(c) * max(0.0, -c.y), 0.0))
    add_head_sk("faceCheekVolumeLow", lambda c: (-c.x * 0.06 * jaw_inf(c), 0.0026 * jaw_inf(c) * max(0.0, -c.y), 0.0))
    add_head_sk("faceEarSizeBig", lambda c: ((1.0 if c.x >= 0 else -1.0) * 0.0045 * ear_inf(c), 0.0, (c.z - ear_z_mid) * 0.18 * ear_inf(c)))
    add_head_sk("faceEarSizeSmall", lambda c: (-(1.0 if c.x >= 0 else -1.0) * 0.0040 * ear_inf(c), 0.0, -(c.z - ear_z_mid) * 0.16 * ear_inf(c)))

    add_head_sk("mouthSmile", lambda c: (c.x * 0.16 * mouth_inf(c), 0.0010 * mouth_inf(c), (abs(c.x) / 0.015) * 0.0040 * mouth_inf(c)))
    add_head_sk("mouthFrown", lambda c: (0.0, 0.0, -(abs(c.x) / 0.015) * 0.0036 * mouth_inf(c)))
    add_head_sk("jawOpen", lambda c: (0.0, 0.0018 * mouth_inf(c), -0.0056 * mouth_inf(c) * (1.0 if c.z < z_mouth else 0.12)))
    add_head_sk("mouthPucker", lambda c: (-c.x * 0.30 * mouth_inf(c), -0.0036 * mouth_inf(c), 0.0))
    add_head_sk("mouthFunnel", lambda c: (-c.x * 0.22 * mouth_inf(c), -0.0030 * mouth_inf(c), -0.0032 * mouth_inf(c) * (1.0 if c.z < z_mouth else -0.4)))
    add_head_sk("eyeBlinkLeft", lambda c: (0.0, -0.0025 * eye_inf(c)[0] if c.x > 0 else 0.0, -(c.z - (eye_z - 0.004)) * 0.85 * eye_inf(c)[0] if c.x > 0 and c.z > eye_z - 0.004 else 0.0))
    add_head_sk("eyeBlinkRight", lambda c: (0.0, -0.0025 * eye_inf(c)[0] if c.x < 0 else 0.0, -(c.z - (eye_z - 0.004)) * 0.85 * eye_inf(c)[0] if c.x < 0 and c.z > eye_z - 0.004 else 0.0))
    add_head_sk("eyeWide", lambda c: (0.0, 0.0, (0.0030 if c.z > eye_z else -0.0015) * eye_inf(c)[0]))
    add_head_sk("eyeSquint", lambda c: (0.0, 0.0, (-0.0024 if c.z > eye_z else 0.0022) * eye_inf(c)[0]))
    add_head_sk("browInnerUp", lambda c: (0.0, 0.0, 0.0040 * math.exp(-((c.x / 0.022) ** 2 + ((c.z - (eye_z + 0.016)) / 0.014) ** 2)) if c.y < y_cranium - 0.04 else 0.0))
    add_head_sk("browDown", lambda c: (0.0, 0.0, -0.0038 * math.exp(-((abs(c.x) - eye_x) / 0.022) ** 2 - ((c.z - (eye_z + 0.015)) / 0.014) ** 2) if c.y < y_cranium - 0.04 else 0.0))
    add_head_sk("cheekPuff", lambda c: ((1.0 if c.x >= 0 else -1.0) * 0.0042 * jaw_inf(c), -0.0038 * jaw_inf(c) * max(0.0, -c.y), 0.0))

    eye_skin_verts = [v.co.y for v in head_obj.data.vertices if abs(v.co.x - eye_x) < 0.006 and abs(v.co.z - eye_z) < 0.006 and v.co.y < y_cranium]
    y_eye_surf = min(eye_skin_verts) if eye_skin_verts else (y_cranium - 0.070)

    eye_w = 0.0180 if not is_male else 0.0174
    eye_h = (0.0124 if face_style != "sharp" else 0.0102) if not is_male else 0.0088
    iris_rx = eye_w * 0.70
    iris_rz = eye_h * 0.98
    iris_z_shift = eye_h * 0.07

    created: dict[str, bpy.types.Object] = {"head": head_obj}

    for side_tag, sx, eye_bone in (("L", 1.0, "TS_ShaperEye.L"), ("R", -1.0, "TS_ShaperEye.R")):
        cx = sx * eye_x

        def surface_y(dx_local: float, dz_local: float, offset_front: float) -> float:
            head_curve = 0.0062 * ((abs(cx + dx_local) / eye_x) ** 2 - 1.0)
            cornea = -0.0018 * max(0.0, 1.0 - (dx_local / eye_w) ** 2 - (dz_local / max(0.006, eye_h)) ** 2)
            return y_eye_surf - offset_front + head_curve + cornea

        # 1. Almond Sclera (with non-degenerate radial UVs)
        bm_e = bmesh.new()
        uv_e = bm_e.loops.layers.uv.new("UVMap")
        nr_e, na_e = 5, 24
        ec_v = bm_e.verts.new((cx, surface_y(0.0, 0.0, 0.0024), eye_z))
        erings = []
        for ir in range(1, nr_e + 1):
            fr = ir / nr_e
            erow_v = []
            for ia in range(na_e):
                ang = (ia / na_e) * 2.0 * math.pi
                tilt_z = (0.0022 if face_style == "sharp" else 0.0010) * (math.cos(ang) * sx) * fr
                dx = eye_w * fr * math.cos(ang)
                dz = eye_h * fr * math.sin(ang) + tilt_z
                erow_v.append(bm_e.verts.new((cx + dx, surface_y(dx, dz, 0.0024 * (1.0 - 0.30 * fr * fr)), eye_z + dz)))
            erings.append(erow_v)
        for ia in range(na_e):
            inext = (ia + 1) % na_e
            a0, a1 = (ia / na_e) * 2.0 * math.pi, (inext / na_e) * 2.0 * math.pi
            f = bm_e.faces.new((ec_v, erings[0][inext], erings[0][ia]))
            f.smooth = True
            f.loops[0][uv_e].uv = (0.5, 0.5)
            f.loops[1][uv_e].uv = (0.5 + 0.1 * math.cos(a1), 0.5 + 0.1 * math.sin(a1))
            f.loops[2][uv_e].uv = (0.5 + 0.1 * math.cos(a0), 0.5 + 0.1 * math.sin(a0))
        for ir in range(nr_e - 1):
            fr0, fr1 = (ir + 1) / nr_e, (ir + 2) / nr_e
            for ia in range(na_e):
                inext = (ia + 1) % na_e
                a0, a1 = (ia / na_e) * 2.0 * math.pi, (inext / na_e) * 2.0 * math.pi
                f = bm_e.faces.new((erings[ir][ia], erings[ir][inext], erings[ir + 1][inext], erings[ir + 1][ia]))
                f.smooth = True
                f.loops[0][uv_e].uv = (0.5 + 0.45 * fr0 * math.cos(a0), 0.5 + 0.45 * fr0 * math.sin(a0))
                f.loops[1][uv_e].uv = (0.5 + 0.45 * fr0 * math.cos(a1), 0.5 + 0.45 * fr0 * math.sin(a1))
                f.loops[2][uv_e].uv = (0.5 + 0.45 * fr1 * math.cos(a1), 0.5 + 0.45 * fr1 * math.sin(a1))
                f.loops[3][uv_e].uv = (0.5 + 0.45 * fr1 * math.cos(a0), 0.5 + 0.45 * fr1 * math.sin(a0))
        bmesh.ops.recalc_face_normals(bm_e, faces=bm_e.faces)
        m_eye = bpy.data.meshes.new(f"TS_Shaper_Eye_{side_tag}")
        bm_e.to_mesh(m_eye)
        bm_e.free()
        o_eye = bpy.data.objects.new(f"TS_Shaper_Eye_{side_tag}", m_eye)
        bpy.context.collection.objects.link(o_eye)
        o_eye.data.materials.append(sclera_mat)
        _bind_to_armature(o_eye, arm_obj)
        _assign_weights(o_eye, [{"mixamorig:Head": 1.0} for _ in o_eye.data.vertices])
        created[f"eye_{side_tag}"] = o_eye

        # 2. Jewel Radial Iris
        bm_i = bmesh.new()
        uv_i = bm_i.loops.layers.uv.new("UVMap")
        nr_i, na_i = 4, 24
        ic_v = bm_i.verts.new((cx, surface_y(0.0, iris_z_shift, 0.0035), eye_z + iris_z_shift))
        irings = []
        for ir in range(1, nr_i + 1):
            fr = ir / nr_i
            irow_v = []
            for ia in range(na_i):
                ang = (ia / na_i) * 2.0 * math.pi
                dx = iris_rx * fr * math.cos(ang)
                dz = min(eye_h * 0.96, iris_z_shift + iris_rz * fr * math.sin(ang))
                dz = max(-eye_h * 0.94, dz)
                irow_v.append(bm_i.verts.new((cx + dx, surface_y(dx, dz, 0.0035), eye_z + dz)))
            irings.append(irow_v)
        for ia in range(na_i):
            inext = (ia + 1) % na_i
            a0, a1 = (ia / na_i) * 2.0 * math.pi, (inext / na_i) * 2.0 * math.pi
            f = bm_i.faces.new((ic_v, irings[0][inext], irings[0][ia]))
            f.smooth = True
            f.loops[0][uv_i].uv = (0.5, 0.5)
            f.loops[1][uv_i].uv = (0.5 + (0.5 / nr_i) * math.cos(a1), 0.5 + (0.5 / nr_i) * math.sin(a1))
            f.loops[2][uv_i].uv = (0.5 + (0.5 / nr_i) * math.cos(a0), 0.5 + (0.5 / nr_i) * math.sin(a0))
        for ir in range(nr_i - 1):
            fr0, fr1 = (ir + 1) / nr_i, (ir + 2) / nr_i
            for ia in range(na_i):
                inext = (ia + 1) % na_i
                a0, a1 = (ia / na_i) * 2.0 * math.pi, (inext / na_i) * 2.0 * math.pi
                f = bm_i.faces.new((irings[ir][ia], irings[ir][inext], irings[ir + 1][inext], irings[ir + 1][ia]))
                f.smooth = True
                f.loops[0][uv_i].uv = (0.5 + 0.48 * fr0 * math.cos(a0), 0.5 + 0.48 * fr0 * math.sin(a0))
                f.loops[1][uv_i].uv = (0.5 + 0.48 * fr0 * math.cos(a1), 0.5 + 0.48 * fr0 * math.sin(a1))
                f.loops[2][uv_i].uv = (0.5 + 0.48 * fr1 * math.cos(a1), 0.5 + 0.48 * fr1 * math.sin(a1))
                f.loops[3][uv_i].uv = (0.5 + 0.48 * fr1 * math.cos(a0), 0.5 + 0.48 * fr1 * math.sin(a0))
        bmesh.ops.recalc_face_normals(bm_i, faces=bm_i.faces)
        m_iris = bpy.data.meshes.new(f"TS_Shaper_Iris_{side_tag}")
        bm_i.to_mesh(m_iris)
        bm_i.free()
        o_iris = bpy.data.objects.new(f"TS_Shaper_Iris_{side_tag}", m_iris)
        bpy.context.collection.objects.link(o_iris)
        o_iris.data.materials.append(iris_mat)
        _bind_to_armature(o_iris, arm_obj)
        _assign_weights(o_iris, [{eye_bone: 1.0} for _ in o_iris.data.vertices])
        created[f"iris_{side_tag}"] = o_iris

        # 3. Dual Starlight Catchlights
        bm_h = bmesh.new()
        uv_h = bm_h.loops.layers.uv.new("UVMap")
        for h_dx, h_dz, h_rx, h_rz in (
            (iris_rx * 0.36, iris_rz * 0.26, iris_rx * 0.25, iris_rz * 0.22),
            (-iris_rx * 0.34, -iris_rz * 0.32, iris_rx * 0.13, iris_rz * 0.13),
        ):
            hc = bm_h.verts.new((cx + h_dx, surface_y(h_dx, h_dz, 0.0044), eye_z + h_dz))
            hring = [
                bm_h.verts.new((
                    cx + h_dx + h_rx * math.cos(k * 2.0 * math.pi / 12),
                    surface_y(h_dx + h_rx * math.cos(k * 2.0 * math.pi / 12), h_dz + h_rz * math.sin(k * 2.0 * math.pi / 12), 0.0044),
                    eye_z + h_dz + h_rz * math.sin(k * 2.0 * math.pi / 12),
                ))
                for k in range(12)
            ]
            for k in range(12):
                kn = (k + 1) % 12
                f = bm_h.faces.new((hc, hring[kn], hring[k]))
                f.smooth = True
                f.loops[0][uv_h].uv = (0.5, 0.5)
                f.loops[1][uv_h].uv = (0.5 + 0.4 * math.cos(kn * 2.0 * math.pi / 12), 0.5 + 0.4 * math.sin(kn * 2.0 * math.pi / 12))
                f.loops[2][uv_h].uv = (0.5 + 0.4 * math.cos(k * 2.0 * math.pi / 12), 0.5 + 0.4 * math.sin(k * 2.0 * math.pi / 12))
        bmesh.ops.recalc_face_normals(bm_h, faces=bm_h.faces)
        m_hl = bpy.data.meshes.new(f"TS_Shaper_Highlight_{side_tag}")
        bm_h.to_mesh(m_hl)
        bm_h.free()
        o_hl = bpy.data.objects.new(f"TS_Shaper_Highlight_{side_tag}", m_hl)
        bpy.context.collection.objects.link(o_hl)
        o_hl.data.materials.append(highlight_mat)
        _bind_to_armature(o_hl, arm_obj)
        _assign_weights(o_hl, [{eye_bone: 1.0} for _ in o_hl.data.vertices])
        created[f"highlight_{side_tag}"] = o_hl

        # 4. Lush Top-Hooding Anime Upper Eyelash Wing + Delicate Outer Lower Lash
        bm_l = bmesh.new()
        uv_lsh = bm_l.loops.layers.uv.new("UVMap")
        n_ls = 20
        lash_rows = []
        for il in range(n_ls):
            tl = il / (n_ls - 1)
            ang_l = math.pi * (1.0 - tl)
            dx_in = sx * (-eye_w * 0.98 * math.cos(ang_l))
            wing_extra_x = sx * (0.0046 if not is_male else 0.0034) * (tl ** 2.2)
            wing_extra_z = (0.0026 if face_style == "sharp" else 0.0016) * (tl ** 2.0)
            dz_in = eye_h * 0.84 * math.sin(ang_l) + wing_extra_z
            thick = (0.0036 if not is_male else 0.0028) * (0.40 + 0.85 * math.sin(tl * math.pi * 0.82))
            v_bot = bm_l.verts.new((cx + dx_in + wing_extra_x * 0.6, surface_y(dx_in, dz_in, 0.0048), eye_z + dz_in - thick * 0.35))
            v_top = bm_l.verts.new((cx + dx_in + wing_extra_x * 1.15, surface_y(dx_in, dz_in + thick, 0.0054), eye_z + dz_in + thick * 0.82))
            lash_rows.append((v_bot, v_top))
        for il in range(n_ls - 1):
            b0, t0 = lash_rows[il]
            b1, t1 = lash_rows[il + 1]
            u0_l, u1_l = il / (n_ls - 1), (il + 1) / (n_ls - 1)
            f = bm_l.faces.new((b0, b1, t1, t0) if sx > 0 else (b1, b0, t0, t1))
            f.smooth = True
            f.loops[0][uv_lsh].uv = (u0_l, 0.2)
            f.loops[1][uv_lsh].uv = (u1_l, 0.2)
            f.loops[2][uv_lsh].uv = (u1_l, 0.8)
            f.loops[3][uv_lsh].uv = (u0_l, 0.8)

        low_rows = []
        for il in range(8):
            tl = 0.42 + 0.56 * (il / 7.0)
            ang_l = math.pi * (1.0 - tl)
            dx_in = sx * (-eye_w * 0.95 * math.cos(ang_l))
            dz_in = -eye_h * 0.96 * math.sin(ang_l)
            l_th = 0.0011 * math.sin((il / 7.0) * math.pi)
            vb = bm_l.verts.new((cx + dx_in, surface_y(dx_in, dz_in, 0.0042), eye_z + dz_in - l_th))
            vt = bm_l.verts.new((cx + dx_in, surface_y(dx_in, dz_in, 0.0044), eye_z + dz_in + l_th * 0.4))
            low_rows.append((vb, vt))
        for il in range(7):
            b0, t0 = low_rows[il]
            b1, t1 = low_rows[il + 1]
            u0_l, u1_l = il / 7.0, (il + 1) / 7.0
            f = bm_l.faces.new((b0, b1, t1, t0) if sx > 0 else (b1, b0, t0, t1))
            f.smooth = True
            f.loops[0][uv_lsh].uv = (u0_l, 0.1)
            f.loops[1][uv_lsh].uv = (u1_l, 0.1)
            f.loops[2][uv_lsh].uv = (u1_l, 0.4)
            f.loops[3][uv_lsh].uv = (u0_l, 0.4)

        bmesh.ops.recalc_face_normals(bm_l, faces=bm_l.faces)
        m_lash = bpy.data.meshes.new(f"TS_Shaper_Lash_{side_tag}")
        bm_l.to_mesh(m_lash)
        bm_l.free()
        o_lash = bpy.data.objects.new(f"TS_Shaper_Lash_{side_tag}", m_lash)
        bpy.context.collection.objects.link(o_lash)
        o_lash.data.materials.append(lash_mat)
        _bind_to_armature(o_lash, arm_obj)
        _assign_weights(o_lash, [{"mixamorig:Head": 1.0} for _ in o_lash.data.vertices])
        created[f"lash_{side_tag}"] = o_lash

        # 5. Calm, Confident Korean Webtoon Eyebrow (`TS_Shaper_Brow_L/R`)
        bm_b = bmesh.new()
        uv_brw = bm_b.loops.layers.uv.new("UVMap")
        n_bs = 14
        brow_rows = []
        brow_z_base = eye_z + (0.0162 if not is_male else 0.0132) * scale_z
        for ib in range(n_bs):
            tb = ib / (n_bs - 1)
            bx_local = sx * (-eye_w * 0.78 + (eye_w * 1.92) * tb)
            arch = math.sin(tb * math.pi * 0.75) * (0.0024 if not is_male else 0.0018)
            if face_style == "sharp":
                arch += 0.0022 * tb - 0.0008
            bz_local = brow_z_base + arch
            b_thick = (0.0022 if not is_male else 0.0030) * (1.0 - 0.55 * (tb ** 1.8)) * (0.60 + 0.40 * _smoothstep(0.0, 0.2, tb))
            by_pos = surface_y(bx_local, bz_local - eye_z, 0.0044)
            vb0 = bm_b.verts.new((cx + bx_local, by_pos, bz_local - b_thick * 0.5))
            vb1 = bm_b.verts.new((cx + bx_local, by_pos - 0.0003, bz_local + b_thick * 0.5))
            brow_rows.append((vb0, vb1))
        for ib in range(n_bs - 1):
            b0, t0 = brow_rows[ib]
            b1, t1 = brow_rows[ib + 1]
            u0_b, u1_b = ib / (n_bs - 1), (ib + 1) / (n_bs - 1)
            f = bm_b.faces.new((b0, b1, t1, t0) if sx > 0 else (b1, b0, t0, t1))
            f.smooth = True
            f.loops[0][uv_brw].uv = (u0_b, 0.25)
            f.loops[1][uv_brw].uv = (u1_b, 0.25)
            f.loops[2][uv_brw].uv = (u1_b, 0.75)
            f.loops[3][uv_brw].uv = (u0_b, 0.75)
        bmesh.ops.recalc_face_normals(bm_b, faces=bm_b.faces)
        m_brow = bpy.data.meshes.new(f"TS_Shaper_Brow_{side_tag}")
        bm_b.to_mesh(m_brow)
        bm_b.free()
        o_brow = bpy.data.objects.new(f"TS_Shaper_Brow_{side_tag}", m_brow)
        bpy.context.collection.objects.link(o_brow)
        o_brow.data.materials.append(brow_mat)
        _bind_to_armature(o_brow, arm_obj)
        _assign_weights(o_brow, [{"mixamorig:Head": 1.0} for _ in o_brow.data.vertices])

        o_brow.shape_key_add(name="Basis", from_mix=False)
        b_base = [v.co.copy() for v in o_brow.data.vertices]
        sk_hb = o_brow.shape_key_add(name="HappyBrow", from_mix=False)
        sk_ab = o_brow.shape_key_add(name="AngryBrow", from_mix=False)
        for idx, co in enumerate(b_base):
            outer_t = _clamp01((abs(co.x) - (eye_x - eye_w * 0.8)) / (eye_w * 2.0))
            sk_hb.data[idx].co = Vector((co.x, co.y, co.z + 0.0040 * (0.4 + 0.6 * outer_t)))
            sk_ab.data[idx].co = Vector((co.x - sx * 0.0015 * (1.0 - outer_t), co.y, co.z - 0.0042 * (1.0 - 0.65 * outer_t) + 0.0022 * outer_t))
        created[f"brow_{side_tag}"] = o_brow

    return created
