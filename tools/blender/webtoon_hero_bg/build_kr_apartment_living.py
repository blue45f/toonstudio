"""Hero Webtoon 3D Background #1: Korean Modern Apartment Living Room (kr_modern_apartment_living).

Builds a production-grade 8.4 x 6.2 x 2.7 m Korean modern apartment LDK
(Living + Dining + U-shaped Kitchen + Veranda Balcony + Entryway Middle Door)
using Blender 5.3 headless Python and the shared ``webtoon_hero_bg`` core:

- Desktop Hero (8 cutaway nodes, <= 8 draw calls, <= 4 materials, 35k-120k tris, <= 6 MiB)
- Mobile Hero  (4 merged nodes, <= 4 draw calls, <= 2 materials, <= 3 MiB)
- 6-view 512x512 BLENDER_EEVEE contact sheet PNG + Freestyle SVG line art

Execution command:
  /Users/hjunkim/.local/bin/blender --background --factory-startup \
    --python-exit-code 42 \
    --python tools/blender/webtoon_hero_bg/build_kr_apartment_living.py
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import bpy
from mathutils import Vector

# Ensure `tools/blender` is importable even under Blender --factory-startup
_THIS_FILE = Path(__file__).resolve()
_BLENDER_TOOLS_DIR = _THIS_FILE.parents[1]
_REPO_ROOT = _THIS_FILE.parents[3]
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from webtoon_hero_bg import (  # noqa: E402
    HeroSceneGroups,
    MeshGroup,
    PreviewCameraView,
    WallOpening,
    add_balustrade,
    add_beveled_box,
    add_ceiling_coffer,
    add_door_frame,
    add_molding_strip,
    add_pipe_frame,
    add_wall_with_openings,
    add_window_sash,
    assemble_desktop_cutaway,
    assemble_mobile_cutaway,
    audit_blender_scene,
    export_cutaway_glb,
    inspect_glb,
    render_hero_review_bundle,
)
from webtoon_hero_bg.cutaway_assembly import (  # noqa: E402
    DEFAULT_COPYRIGHT,
    _remove_hierarchy,
)

# ---------------------------------------------------------------------------
# Asset Identity & Spatial Constants (8.4 x 6.2 x 2.7 m Korean Apartment LDK)
# ---------------------------------------------------------------------------

SLUG = "kr_modern_apartment_living"
DEFAULT_OUT_DIR = _REPO_ROOT / "apps/web/public/assets/3d/environments/hero-v1"
DEFAULT_PREVIEW_DIR = _REPO_ROOT / "loop-stack/competitor-parity/previews/bg"

TAU = math.tau

# Global footprint: X in [-4.20, +4.20] (8.40 m), Y in [-3.10, +3.10] (6.20 m)
ROOM_W = 8.40
ROOM_D = 6.20
SLAB_THICK = 0.036
PLANK_THICK = 0.008
FLOOR_Z = SLAB_THICK + PLANK_THICK  # 0.044 m finished interior floor level
WALL_H = 2.700  # Clear interior ceiling height = 2.70 m
CEIL_Z = FLOOR_Z + WALL_H  # 2.744 m

# Wall centerline coordinates (zero coincident corner edges when merged for mobile)
NORTH_WALL_Y = 1.960   # thickness 0.180 -> interior face Y = +1.870, exterior +2.050
SOUTH_WALL_Y = -3.000  # thickness 0.180 -> interior face Y = -2.910, exterior -3.090
WEST_WALL_X = -4.088   # thickness 0.172 -> interior face X = -4.002, exterior -4.174
EAST_WALL_X = 4.088    # thickness 0.172 -> interior face X = +4.002, exterior +4.174

WALL_T_NS = 0.180
WALL_T_EW = 0.172

# Cohesive Korean Modern Warm-Minimalist Palette (sRGB hex, multiplied with neutral atlas)
PAL = {
    "wall_warm": "F4F0E8",
    "wall_accent": "ECE6DA",
    "molding": "EAE4D9",
    "slab_concrete": "9C988F",
    "balcony_curb": "CEC9BF",
    "oak_light": "D7B88E",
    "oak_mid": "CCA97B",
    "oak_warm": "C29A69",
    "walnut": "856144",
    "walnut_dark": "694A33",
    "sash_white": "ECEAE4",
    "sash_charcoal": "3F454C",
    "sash_bronze": "564F49",
    "glass_sky": "C2DCE8",
    "glass_frosted": "DCE5EA",
    "glass_tv": "1A2028",
    "brass": "C7A86D",
    "steel": "C8CDD2",
    "steel_dark": "545A62",
    "iron_matte": "34383E",
    "sofa_cream": "E5DED1",
    "sofa_piping": "B3A38C",
    "pillow_sage": "7B8F7B",
    "pillow_terra": "C47D5E",
    "pillow_ivory": "F2ECE2",
    "throw_knit": "B09476",
    "rug_main": "DED6C6",
    "rug_border": "C2B59D",
    "cabinet_cashmere": "E7E1D6",
    "cabinet_lower": "CCC1B0",
    "cabinet_taupe": "C8BCAE",
    "quartz_top": "F4F1EC",
    "fridge_upper": "EAE5DC",
    "fridge_lower": "B8C0B4",
    "ceramic_white": "F5F3EE",
    "ceramic_slate": "C2BDB4",
    "ceramic_terra": "BA7C5D",
    "foliage_deep": "426B4E",
    "foliage_mid": "588660",
    "foliage_bright": "6D9B6C",
    "soil": "4E4034",
    "curtain_outer": "D9CEBC",
    "curtain_sheer": "F3EFE7",
    "marble_art": "F4F1EB",
}


# ---------------------------------------------------------------------------
# Sculptural & Mechanical Reusable Helpers (Zero Plain Boxes!)
# ---------------------------------------------------------------------------


def _rot_xy(lx: float, ly: float, yaw: float) -> Tuple[float, float]:
    c = math.cos(yaw)
    s = math.sin(yaw)
    return (lx * c - ly * s, lx * s + ly * c)


def _rounded_rect_ring_2d(hx: float, hy: float, r: float, segs_per_corner: int = 4) -> List[Tuple[float, float]]:
    """Return CCW 2D rounded rectangle contour points centered at (0, 0)."""
    rad = min(max(0.002, r), hx * 0.85, hy * 0.85)
    pts: List[Tuple[float, float]] = []
    corners = (
        (hx - rad, hy - rad, 0.0),
        (-(hx - rad), hy - rad, math.pi * 0.5),
        (-(hx - rad), -(hy - rad), math.pi),
        (hx - rad, -(hy - rad), math.pi * 1.5),
    )
    for cx, cy, start_a in corners:
        for i in range(segs_per_corner + 1):
            a = start_a + (math.pi * 0.5) * (i / float(segs_per_corner))
            pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts


def _add_cushion_loft(
    group: MeshGroup,
    center: Tuple[float, float, float],
    size: Tuple[float, float, float],
    *,
    corner_r: float = 0.055,
    crown: float = 0.022,
    rot_z: float = 0.0,
    tilt_y: float = 0.0,
    color: str = "E4DDD0",
    tile: str = "fabric_linen",
    piping_color: str | None = None,
    piping_radius: float = 0.0075,
) -> None:
    """Build a crowned rounded upholstery cushion lofted via rings + optional 3D piping."""
    cx, cy, cz = center
    sx, sy, sz = size
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    base_2d = _rounded_rect_ring_2d(hx, hy, corner_r, segs_per_corner=4)

    # 5 vertical loft slices creating a soft crowned sofa cushion silhouette
    z_profile = (
        (-hz, 0.82, 0.0),
        (-hz + sz * 0.16, 0.985, 0.0),
        (0.0, 1.00, 0.0),
        (hz - sz * 0.16, 0.985, 0.0),
        (hz, 0.82, crown),
    )
    cy_t, sy_t = math.cos(tilt_y), math.sin(tilt_y)
    cz_r, sz_r = math.cos(rot_z), math.sin(rot_z)

    def _xform(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        # Pitch around local Y first (for reclined back cushions), then yaw around Z
        tx = lx * cy_t + lz * sy_t
        ty = ly
        tz = -lx * sy_t + lz * cy_t
        wx = tx * cz_r - ty * sz_r + cx
        wy = tx * sz_r + ty * cz_r + cy
        wz = tz + cz
        return (wx, wy, wz)

    rings: List[List[Tuple[float, float, float]]] = []
    for lz_base, scale_xy, dome in z_profile:
        ring: List[Tuple[float, float, float]] = []
        for px, py in base_2d:
            lx = px * scale_xy
            ly = py * scale_xy
            # Gentle pillow dome lift near top cap
            lz = lz_base + dome * (0.45 if scale_xy < 0.9 else 0.0)
            ring.append(_xform(lx, ly, lz))
        rings.append(ring)

    group.rings(rings, color=color, tile=tile)

    if piping_color:
        # Swept 3D cord piping around upper & lower cushion seam lines
        for z_seam in (hz - sz * 0.15, -hz + sz * 0.15):
            pipe_pts = [_xform(px * 0.992, py * 0.992, z_seam) for (px, py) in base_2d]
            add_pipe_frame(
                group,
                pipe_pts,
                radius=piping_radius,
                sides=8,
                closed=True,
                bend_subdiv=2,
                bend_radius=0.015,
                flange_ends=False,
                color=piping_color,
                tile=tile,
            )


def _add_throw_pillow(
    group: MeshGroup,
    center: Tuple[float, float, float],
    width: float,
    height: float,
    thickness: float,
    *,
    rot_z: float = 0.0,
    tilt_y: float = 0.28,
    color: str = "7F917F",
    tile: str = "fabric_velvet",
) -> None:
    """Build a puffed leaning throw pillow lofted via smooth oval-square rings."""
    cx, cy, cz = center
    hy, hz, hx = width * 0.5, height * 0.5, thickness * 0.5
    cy_t, sy_t = math.cos(tilt_y), math.sin(tilt_y)
    cz_r, sz_r = math.cos(rot_z), math.sin(rot_z)

    def _xform(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        tx = lx * cy_t + lz * sy_t
        ty = ly
        tz = -lx * sy_t + lz * cy_t
        return (tx * cz_r - ty * sz_r + cx, tx * sz_r + ty * cz_r + cy, tz + cz)

    # Loft along local Y (pillow width) so ends pinch naturally like sewn pillow seams
    n_u = 16
    slices = (
        (-hy, 0.22, 0.86),
        (-hy * 0.82, 0.72, 0.95),
        (-hy * 0.42, 0.96, 1.00),
        (0.0, 1.00, 1.00),
        (hy * 0.42, 0.96, 1.00),
        (hy * 0.82, 0.72, 0.95),
        (hy, 0.22, 0.86),
    )
    rings: List[List[Tuple[float, float, float]]] = []
    for ly, sx_f, sz_f in slices:
        ring: List[Tuple[float, float, float]] = []
        for i in range(n_u):
            a = TAU * i / n_u
            ca, sa = math.cos(a), math.sin(a)
            # Superellipse cross section for plump pillow body with pinched edge seam
            lx = hx * sx_f * math.copysign(abs(ca) ** 0.72, ca)
            lz = hz * sz_f * math.copysign(abs(sa) ** 0.62, sa)
            ring.append(_xform(lx, ly, lz))
        rings.append(ring)
    group.rings(rings, color=color, tile=tile)


def _add_turned_cylinder(
    group: MeshGroup,
    cx: float,
    cy: float,
    profile: Sequence[Tuple[float, float]],
    *,
    sides: int = 16,
    color: str = "FFFFFF",
    tile: str = "wood_oak",
) -> None:
    """Loft a radially symmetric solid around vertical axis (cx, cy) from (radius, z) pairs."""
    rings = [
        [(cx + r * math.cos(TAU * i / sides), cy + r * math.sin(TAU * i / sides), z) for i in range(sides)]
        for (r, z) in profile
    ]
    group.rings(rings, color=color, tile=tile)


def _add_pleated_curtain(
    group: MeshGroup,
    x0: float,
    x1: float,
    y_center: float,
    z_bot: float,
    z_top: float,
    *,
    folds: int = 7,
    amplitude: float = 0.048,
    thickness: float = 0.010,
    flare_bottom: float = 1.25,
    color: str = "EAE3D6",
    tile: str = "carpet",
) -> None:
    """Build a watertight pleated drapery curtain panel lofted over sinusoidal fold waves."""
    samples_x = max(14, folds * 4)
    z_levels = 7
    rings: List[List[Tuple[float, float, float]]] = []
    half_t = thickness * 0.5

    for iz in range(z_levels):
        tz = iz / float(z_levels - 1)
        z_val = z_bot + (z_top - z_bot) * tz
        # Gently wider/deeper wave pleats near bottom hem (natural gravity drape)
        amp = amplitude * (flare_bottom - (flare_bottom - 0.75) * tz)
        # Subtle lateral draw pinch near upper hooks
        x_margin = (x1 - x0) * 0.03 * (1.0 - tz)

        front_pts: List[Tuple[float, float, float]] = []
        back_pts: List[Tuple[float, float, float]] = []
        for ix in range(samples_x + 1):
            u = ix / float(samples_x)
            px = (x0 - x_margin) + ((x1 - x0) + 2.0 * x_margin) * u
            phase = u * folds * TAU
            wave = math.sin(phase) * amp + math.sin(phase * 2.0 + 0.6) * (amp * 0.14)
            # Soft vertical billow curve
            sway = math.sin(math.pi * tz) * 0.012
            py = y_center + wave - sway
            front_pts.append((px, py - half_t, z_val))
            back_pts.append((px, py + half_t, z_val))
        # Closed ribbon cross-section perimeter (front left->right, back right->left)
        ring = front_pts + list(reversed(back_pts))
        rings.append(ring)

    group.rings(rings, color=color, tile=tile)


def _add_leaf_blade(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    azimuth: float,
    length: float,
    width: float,
    rise: float,
    *,
    color: str = "466F52",
    tile: str = "foliage_prop",
) -> None:
    """Build a gracefully arched 3D botanical leaf blade with central midrib ridge."""
    along = Vector((math.cos(azimuth), math.sin(azimuth), 0.0))
    side = Vector((-along.y, along.x, 0.0))
    o = Vector(origin)
    rings: List[List[Vector]] = []
    for t in (0.0, 0.22, 0.48, 0.74, 0.94, 1.0):
        broad = width * (0.06 + math.sin(math.pi * min(0.99, t)) ** 0.72)
        if t == 1.0:
            broad = max(0.004, width * 0.08)
        c = o + along * (length * t) + Vector((0.0, 0.0, rise * t + 0.22 * length * math.sin(math.pi * t) - 0.14 * length * (t**2)))
        ridge = max(0.0025, broad * 0.14)
        rings.append(
            [
                c - side * broad,
                c + Vector((0.0, 0.0, ridge)),
                c + side * broad,
                c - Vector((0.0, 0.0, ridge * 0.42)),
            ]
        )
    group.rings(rings, color=color, tile=tile)


def _add_potted_plant(
    group: MeshGroup,
    cx: float,
    cy: float,
    z_base: float,
    *,
    pot_radius: float = 0.19,
    pot_height: float = 0.34,
    stand_height: float = 0.12,
    foliage_height: float = 0.95,
    leaf_count: int = 15,
    pot_color: str = "EAE5DC",
    pot_tile: str = "ceramic_gloss",
    stand_color: str = "856144",
    stand_tile: str = "wood_prop",
) -> None:
    """Build a ribbed designer ceramic planter on a 3-legged stand with sculpted foliage."""
    pot_z0 = z_base + stand_height
    if stand_height > 0.01:
        # 3-legged crossed timber plant stand
        for i in range(3):
            a = TAU * i / 3.0 + 0.35
            r_leg = pot_radius * 0.96
            lx = cx + r_leg * math.cos(a)
            ly = cy + r_leg * math.sin(a)
            group.rail((lx, ly, z_base), (lx, ly, pot_z0 + pot_height * 0.36), 0.012, stand_color, 10, tile=stand_tile)
            group.rail((cx, cy, pot_z0 - 0.012), (lx, ly, pot_z0 - 0.012), 0.010, stand_color, 8, tile=stand_tile)

    # Turned tapered ceramic pot with upper lip rim
    pot_prof = (
        (pot_radius * 0.72, pot_z0),
        (pot_radius * 0.80, pot_z0 + pot_height * 0.10),
        (pot_radius * 0.98, pot_z0 + pot_height * 0.82),
        (pot_radius * 1.03, pot_z0 + pot_height * 0.92),
        (pot_radius * 1.00, pot_z0 + pot_height),
        (pot_radius * 0.88, pot_z0 + pot_height),
        (pot_radius * 0.85, pot_z0 + pot_height * 0.84),
    )
    _add_turned_cylinder(group, cx, cy, pot_prof, sides=20, color=pot_color, tile=pot_tile)
    # Soil mound disk inside planter
    soil_z = pot_z0 + pot_height * 0.86
    _add_turned_cylinder(
        group,
        cx,
        cy,
        ((pot_radius * 0.84, soil_z - 0.015), (pot_radius * 0.84, soil_z), (pot_radius * 0.65, soil_z + 0.016)),
        sides=16,
        color=PAL["soil"],
        tile="stone_prop",
    )

    # Multi-stem sculptural houseplant leaves (golden-angle phyllotaxis with distinct root offsets)
    leaf_colors = (PAL["foliage_deep"], PAL["foliage_mid"], PAL["foliage_bright"])
    for i in range(leaf_count):
        ang = i * 2.39996 + 0.25
        frac = (i + 1) / float(leaf_count)
        r_root = 0.018 + pot_radius * 0.28 * frac
        root_x = cx + r_root * math.cos(ang + 0.4)
        root_y = cy + r_root * math.sin(ang + 0.4)
        root_z = soil_z - 0.006 + 0.004 * (i % 3)
        spread = pot_radius * (0.38 + 0.65 * (1.0 - frac * 0.35))
        stem_top_z = soil_z + foliage_height * (0.28 + 0.62 * frac)
        mid_x = cx + spread * 0.42 * math.cos(ang)
        mid_y = cy + spread * 0.42 * math.sin(ang)
        top_x = cx + spread * 0.85 * math.cos(ang)
        top_y = cy + spread * 0.85 * math.sin(ang)
        add_pipe_frame(
            group,
            [(root_x, root_y, root_z), (mid_x, mid_y, soil_z + (stem_top_z - soil_z) * 0.55), (top_x, top_y, stem_top_z)],
            radius=0.0065,
            sides=6,
            bend_subdiv=2,
            bend_radius=0.04,
            flange_ends=False,
            color="4F6D48",
            tile="foliage_prop",
        )
        _add_leaf_blade(
            group,
            (top_x, top_y, stem_top_z),
            azimuth=ang,
            length=0.22 + 0.14 * (1.0 - 0.4 * frac),
            width=0.075 + 0.032 * (1.0 - 0.35 * frac),
            rise=0.06 + 0.04 * frac,
            color=leaf_colors[i % len(leaf_colors)],
            tile="foliage_prop",
        )


# ---------------------------------------------------------------------------
# 1. Floor Assembly (BG_Floor — Structural Slab + Oak Planks + Balcony Tile + Rug)
# ---------------------------------------------------------------------------


def build_floor(floor: MeshGroup) -> None:
    # Structural concrete sub-slab resting cleanly at Z = 0.000
    floor.box((0.0, 0.0, SLAB_THICK * 0.5), (ROOM_W, ROOM_D, SLAB_THICK), PAL["slab_concrete"], tile="concrete", bevel=0.004)

    # Interior wide-plank Korean oak flooring (강마루) with 3 mm V-groove shadow seams
    # Covers X in [-3.99, +3.99], Y in [-2.90, +1.86], Z in [SLAB_THICK, FLOOR_Z]
    plank_w_y = 0.165
    plank_len_x = 1.14
    gap = 0.003
    oak_tones = (PAL["oak_light"], "D3B48A", "DBC098", PAL["oak_mid"], "D6B991")
    y_min, y_max = -2.90, 1.86
    x_min, x_max = -3.99, 3.99

    row = 0
    y_cur = y_min
    while y_cur < y_max - 0.02:
        py1 = min(y_max, y_cur + plank_w_y - gap)
        py_len = py1 - y_cur
        if py_len < 0.02:
            break
        py_mid = 0.5 * (y_cur + py1)
        stagger = ((row * 37) % 100) / 100.0 * plank_len_x
        x_cur = x_min - stagger
        col = 0
        while x_cur < x_max - 0.02:
            px0 = max(x_min, x_cur)
            px1 = min(x_max, x_cur + plank_len_x - gap)
            px_len = px1 - px0
            if px_len >= 0.06:
                tone = oak_tones[(row * 5 + col * 3) % len(oak_tones)]
                floor.box(
                    (0.5 * (px0 + px1), py_mid, SLAB_THICK + PLANK_THICK * 0.5),
                    (px_len, py_len, PLANK_THICK),
                    tone,
                    tile="floor_wood",
                    bevel=0.0018,
                )
            x_cur += plank_len_x
            col += 1
        y_cur += plank_w_y
        row += 1

    # Veranda balcony matte ceramic tiles (베란다 타일) outside North wall (Y in [2.06, 3.04])
    tile_step = 0.42
    tile_gap = 0.004
    tile_tones = ("CFCAC0", "C8C3B9", "D3CEC5")
    bx0, bx1 = -4.12, 4.12
    by0, by1 = 2.06, 3.03
    ty = by0
    r_idx = 0
    while ty < by1 - 0.03:
        ty_end = min(by1, ty + tile_step - tile_gap)
        tx = bx0
        c_idx = 0
        while tx < bx1 - 0.03:
            tx_end = min(bx1, tx + tile_step - tile_gap)
            if (tx_end - tx) > 0.04 and (ty_end - ty) > 0.04:
                floor.box(
                    (0.5 * (tx + tx_end), 0.5 * (ty + ty_end), SLAB_THICK + 0.0035),
                    (tx_end - tx, ty_end - ty, 0.007),
                    tile_tones[(r_idx + c_idx * 2) % len(tile_tones)],
                    tile="tile_ceramic",
                    bevel=0.0015,
                )
            tx += tile_step
            c_idx += 1
        ty += tile_step
        r_idx += 1

    # Balcony recessed floor drain cover at East veranda corner
    floor.box((3.68, 2.74, SLAB_THICK + 0.0085), (0.14, 0.14, 0.005), PAL["steel"], tile="sash_metal", bevel=0.001)

    # Exterior Balcony Concrete Curb & Steel Balustrade Railing (anchored to BG_Floor so always visible in back/top cutaway!)
    bal_y = 3.01
    curb_h = 0.115
    floor.box((0.0, bal_y, SLAB_THICK + curb_h * 0.5 + 0.004), (8.24, 0.12, curb_h), PAL["balcony_curb"], tile="concrete", bevel=0.005)
    floor.box((-4.08, 2.54, SLAB_THICK + curb_h * 0.5 + 0.004), (0.12, 0.86, curb_h), PAL["balcony_curb"], tile="concrete", bevel=0.005)
    floor.box((4.08, 2.54, SLAB_THICK + curb_h * 0.5 + 0.004), (0.12, 0.86, curb_h), PAL["balcony_curb"], tile="concrete", bevel=0.005)

    rail_z0 = SLAB_THICK + curb_h + 0.002
    add_balustrade(
        floor,
        (-4.06, bal_y, rail_z0),
        (4.06, bal_y, rail_z0),
        height=0.98,
        baluster_spacing=0.15,
        style="steel",
        color=PAL["sash_charcoal"],
        tile="sash_metal",
        rail_color=PAL["sash_charcoal"],
        rail_tile="sash_metal",
    )
    add_balustrade(floor, (-4.08, 2.12, rail_z0), (-4.08, 2.94, rail_z0), height=0.98, baluster_spacing=0.16, style="steel", color=PAL["sash_charcoal"], tile="sash_metal")
    add_balustrade(floor, (4.08, 2.12, rail_z0), (4.08, 2.94, rail_z0), height=0.98, baluster_spacing=0.16, style="steel", color=PAL["sash_charcoal"], tile="sash_metal")

    # Balcony outdoor trough planters visible right through the open veranda door bay
    for px in (-2.05, -0.75):
        floor.box((px, 2.76, SLAB_THICK + 0.18), (0.64, 0.24, 0.34), PAL["ceramic_slate"], tile="stone_plinth", bevel=0.006)
        floor.box((px, 2.76, SLAB_THICK + 0.36), (0.68, 0.28, 0.032), PAL["balcony_curb"], tile="stone_plinth", bevel=0.004)
        floor.box((px, 2.76, SLAB_THICK + 0.34), (0.56, 0.18, 0.028), PAL["soil"], tile="concrete", bevel=0.003)

    # Entryway foyer stone threshold apron in front of South middle door (현관 디딤판)
    floor.box((1.80, -2.69, FLOOR_Z + 0.003), (1.72, 0.40, 0.006), "E6E1D8", tile="marble", bevel=0.0015)
    # Brushed brass floor transition strip framing the entryway stone
    floor.box((1.80, -2.482, FLOOR_Z + 0.0035), (1.74, 0.014, 0.007), PAL["brass"], tile="hardware_brass", bevel=0.0015)

    # Textured woven living room area rug (거실 러그) under sofa & coffee table
    rug_cx, rug_cy = -2.02, -0.45
    rug_w, rug_d, rug_h = 2.65, 2.38, 0.011
    floor.box((rug_cx, rug_cy, FLOOR_Z + rug_h * 0.5), (rug_w, rug_d, rug_h), PAL["rug_main"], tile="carpet", bevel=0.003)
    # Raised inner border weave frame (2 mm proud, non-coplanar)
    bw = 0.065
    z_bord = FLOOR_Z + rug_h + 0.0012
    floor.box((rug_cx, rug_cy - rug_d * 0.5 + 0.12, z_bord), (rug_w - 0.18, bw, 0.0024), PAL["rug_border"], tile="carpet", bevel=0.0006)
    floor.box((rug_cx, rug_cy + rug_d * 0.5 - 0.12, z_bord), (rug_w - 0.18, bw, 0.0024), PAL["rug_border"], tile="carpet", bevel=0.0006)
    floor.box((rug_cx - rug_w * 0.5 + 0.12, rug_cy, z_bord), (bw, rug_d - 0.34, 0.0024), PAL["rug_border"], tile="carpet", bevel=0.0006)
    floor.box((rug_cx + rug_w * 0.5 - 0.12, rug_cy, z_bord), (bw, rug_d - 0.34, 0.0024), PAL["rug_border"], tile="carpet", bevel=0.0006)


# ---------------------------------------------------------------------------
# 2. North Wall (BG_Wall_North — Veranda Double Sliding Sash + Curtains + Balcony)
# ---------------------------------------------------------------------------


def build_wall_north(wall_n: MeshGroup) -> None:
    openings = (
        # Large living room veranda balcony double sliding sash (4.40 x 2.26 m)
        WallOpening(offset_x=-1.45, width=4.40, height=2.26, sill_z=0.08, kind="window"),
        # Kitchen veranda ventilation window above sink (1.50 x 1.16 m)
        WallOpening(offset_x=2.55, width=1.50, height=1.16, sill_z=1.14, kind="window"),
    )
    add_wall_with_openings(
        wall_n,
        center=(0.0, NORTH_WALL_Y, FLOOR_Z),
        length=8.360,
        thickness=WALL_T_NS,
        height=WALL_H,
        openings=openings,
        rot_z=0.0,
        color=PAL["wall_warm"],
        tile="plaster",
        baseboard_height=0.082,
        baseboard_depth=0.016,
        baseboard_color=PAL["molding"],
        crown_height=0.062,
        crown_depth=0.020,
        crown_color=PAL["molding"],
        interior_side=-1,
    )

    # --- Custom Korean Apartment 4-Leaf Double-Track Sliding Veranda Sash (베란다 이중 미서기 샷시) ---
    vw_cx = -1.45
    vw_w = 4.40
    vw_h = 2.26
    vw_z0 = FLOOR_Z + 0.08
    frame_w = 0.056
    frame_d = WALL_T_NS + 0.044  # 224 mm deep twin-track veranda frame

    # Outer main aluminum perimeter frame + stepped granite veranda threshold sill
    wall_n.box((vw_cx - vw_w * 0.5 + frame_w * 0.5, NORTH_WALL_Y, vw_z0 + vw_h * 0.5), (frame_w, frame_d, vw_h), PAL["sash_white"], tile="sash_metal", bevel=0.003)
    wall_n.box((vw_cx + vw_w * 0.5 - frame_w * 0.5, NORTH_WALL_Y, vw_z0 + vw_h * 0.5), (frame_w, frame_d, vw_h), PAL["sash_white"], tile="sash_metal", bevel=0.003)
    wall_n.box((vw_cx, NORTH_WALL_Y, vw_z0 + vw_h - frame_w * 0.5), (vw_w - frame_w * 1.9, frame_d, frame_w), PAL["sash_white"], tile="sash_metal", bevel=0.003)
    # Stone threshold board & dual aluminum sliding bottom rails (4 distinct guide ribs)
    wall_n.box((vw_cx, NORTH_WALL_Y - 0.008, vw_z0 - 0.014), (vw_w + 0.08, frame_d + 0.05, 0.036), PAL["marble_art"], tile="marble", bevel=0.004)
    wall_n.box((vw_cx, NORTH_WALL_Y, vw_z0 + 0.020), (vw_w - frame_w * 1.85, frame_d - 0.008, 0.034), PAL["sash_white"], tile="sash_metal", bevel=0.002)
    for ry in (-0.068, -0.024, 0.024, 0.068):
        wall_n.box((vw_cx, NORTH_WALL_Y + ry, vw_z0 + 0.043), (vw_w - frame_w * 2.0, 0.009, 0.014), PAL["steel"], tile="sash_metal", bevel=0.0015)

    # 4 staggered sliding sashes across inner & outer tracks (double-glazed Korean apartment balcony door)
    inner_w = vw_w - frame_w * 2.0
    inner_h = vw_h - frame_w - 0.044
    sash_z0 = vw_z0 + 0.044
    sash_w_profile = 0.046
    sash_d = 0.036
    pane_w = inner_w / 4.0

    # Slide center-right sash cleanly open by 0.68 m so the sunlit veranda balcony & steel railing peek straight through!
    sash_specs = [
        (0, -0.068, 0.0, PAL["sash_white"]),
        (1, -0.024, 0.0, PAL["sash_white"]),
        (2, 0.024, 0.68, PAL["sash_charcoal"]),  # Slid open toward right leaf, revealing open balcony passage
        (3, 0.068, 0.0, PAL["sash_charcoal"]),
    ]
    for ix, dy_track, dx_slide, fcol in sash_specs:
        scx = vw_cx - inner_w * 0.5 + (ix + 0.5) * pane_w + dx_slide
        # Clamp inside frame so cracked sash never clips right jamb
        leaf_w = pane_w + 0.026
        scx = min(vw_cx + inner_w * 0.5 - leaf_w * 0.5 - 0.004, max(vw_cx - inner_w * 0.5 + leaf_w * 0.5 + 0.004, scx))
        sy = NORTH_WALL_Y + dy_track
        lh = inner_h - 0.006

        # Left/Right stiles & Bottom/Top rails
        wall_n.box((scx - leaf_w * 0.5 + sash_w_profile * 0.5, sy, sash_z0 + lh * 0.5), (sash_w_profile, sash_d, lh), fcol, tile="sash_metal", bevel=0.003)
        wall_n.box((scx + leaf_w * 0.5 - sash_w_profile * 0.5, sy, sash_z0 + lh * 0.5), (sash_w_profile, sash_d, lh), fcol, tile="sash_metal", bevel=0.003)
        wall_n.box((scx, sy, sash_z0 + sash_w_profile * 0.5), (leaf_w - sash_w_profile * 1.9, sash_d, sash_w_profile), fcol, tile="sash_metal", bevel=0.003)
        wall_n.box((scx, sy, sash_z0 + lh - sash_w_profile * 0.5), (leaf_w - sash_w_profile * 1.9, sash_d, sash_w_profile), fcol, tile="sash_metal", bevel=0.003)

        # Mid-height safety transom mullion (classic Korean balcony sash bar at z ≈ 0.88 m)
        clear_w = leaf_w - sash_w_profile * 2.0
        clear_h = lh - sash_w_profile * 2.0
        wall_n.box((scx, sy, sash_z0 + 0.82), (clear_w + 0.006, sash_d * 0.72, 0.028), fcol, tile="sash_metal", bevel=0.002)

        # Ergonomic Korean apartment sliding balcony handle bar on inner leaves
        if ix in (1, 2):
            hx = scx + (leaf_w * 0.5 - sash_w_profile * 0.55) * (-1.0 if ix == 2 else 1.0)
            hy = sy - sash_d * 0.5 - 0.016
            wall_n.box((hx, hy + 0.012, sash_z0 + 1.02), (0.024, 0.010, 0.18), PAL["steel"], tile="hardware_brass", bevel=0.002)
            wall_n.box((hx, hy - 0.010, sash_z0 + 1.02), (0.016, 0.016, 0.14), PAL["steel"], tile="hardware_brass", bevel=0.0025)
            wall_n.box((hx, hy, sash_z0 + 1.08), (0.014, 0.024, 0.014), PAL["steel"], tile="hardware_brass", bevel=0.002)
            wall_n.box((hx, hy, sash_z0 + 0.96), (0.014, 0.024, 0.014), PAL["steel"], tile="hardware_brass", bevel=0.002)

        # 8 mm thick tinted glass glazing pane (strictly >= 6 mm, zero Z-fighting)
        wall_n.box((scx, sy, sash_z0 + lh * 0.5), (clear_w + 0.004, 0.008, clear_h + 0.004), PAL["glass_sky"], tile="glass_tinted", bevel=0.0012)

    # --- Kitchen Veranda Window Sash (above U-kitchen sink) ---
    add_window_sash(
        wall_n,
        center=(2.55, NORTH_WALL_Y, FLOOR_Z + 1.14),
        width=1.50,
        height=1.16,
        wall_thickness=WALL_T_NS,
        rot_z=0.0,
        panes_x=2,
        panes_z=1,
        sliding=True,
        frame_color=PAL["sash_white"],
        sill_color=PAL["marble_art"],
        handle_color=PAL["steel"],
        glass_color=PAL["glass_sky"],
    )

    # --- Recessed Curtain Box Valance + Twin Curtain Rods + Pleated Drapes (커튼) ---
    cb_x0, cb_x1 = -3.86, 0.96
    cb_y = NORTH_WALL_Y - WALL_T_NS * 0.5 - 0.12
    # Ceiling curtain valance fascia
    wall_n.box((0.5 * (cb_x0 + cb_x1), cb_y - 0.06, CEIL_Z - 0.065), (cb_x1 - cb_x0, 0.026, 0.125), PAL["molding"], tile="trim_paint", bevel=0.003)
    # Brushed twin curtain tracks + end finials
    for ry_off, rad in ((-0.020, 0.009), (0.036, 0.007)):
        wall_n.rail((cb_x0 + 0.04, cb_y + ry_off, CEIL_Z - 0.095), (cb_x1 - 0.04, cb_y + ry_off, CEIL_Z - 0.095), rad, PAL["brass"], 10, tile="hardware_brass")

    # Left & right gathered outer linen drapes framed tightly to window edges (leaving 3.2 m panoramic sash clear!)
    _add_pleated_curtain(wall_n, -3.86, -3.28, cb_y - 0.018, FLOOR_Z + 0.012, CEIL_Z - 0.105, folds=6, amplitude=0.044, color=PAL["curtain_outer"], tile="carpet")
    _add_pleated_curtain(wall_n, 0.36, 0.94, cb_y - 0.018, FLOOR_Z + 0.012, CEIL_Z - 0.105, folds=6, amplitude=0.044, color=PAL["curtain_outer"], tile="carpet")
    # Delicate inner sheer voile curtains framing the veranda jambs
    _add_pleated_curtain(wall_n, -3.30, -2.98, cb_y + 0.038, FLOOR_Z + 0.018, CEIL_Z - 0.105, folds=4, amplitude=0.026, thickness=0.008, color=PAL["curtain_sheer"], tile="carpet")
    _add_pleated_curtain(wall_n, 0.08, 0.38, cb_y + 0.038, FLOOR_Z + 0.018, CEIL_Z - 0.105, folds=4, amplitude=0.026, thickness=0.008, color=PAL["curtain_sheer"], tile="carpet")

    # Interior pier switch & outlet between veranda sash and kitchen (X = +1.26)
    _add_wall_switch_plate(wall_n, (1.26, NORTH_WALL_Y - WALL_T_NS * 0.5, FLOOR_Z + 1.18), normal_dir=(0, -1), buttons=2)
    _add_wall_outlet(wall_n, (1.26, NORTH_WALL_Y - WALL_T_NS * 0.5, FLOOR_Z + 0.34), normal_dir=(0, -1))


# ---------------------------------------------------------------------------
# 3. South Wall (BG_Wall_South — Entryway 3-Panel Middle Door + Hallway Door + Wallpad)
# ---------------------------------------------------------------------------


def _add_wall_switch_plate(
    group: MeshGroup,
    face_pos: Tuple[float, float, float],
    *,
    normal_dir: Tuple[int, int] = (0, 1),
    buttons: int = 2,
) -> None:
    """Build a realistic 3D Korean recessed light switch plate with individual rocker keys."""
    fx, fy, fz = face_pos
    nx, ny = normal_dir
    plate_d = 0.012
    px = fx + nx * (plate_d * 0.5)
    py = fy + ny * (plate_d * 0.5)
    if ny != 0:
        group.box((px, py, fz), (0.078, plate_d, 0.120), "F4F2EC", tile="trim_paint", bevel=0.0025)
        bw = 0.044 / max(1, buttons)
        for i in range(buttons):
            bx = px + (i - (buttons - 1) * 0.5) * (bw + 0.004)
            group.box((bx, py + ny * 0.007, fz), (bw, 0.008, 0.056), "EAE7E0", tile="trim_paint", bevel=0.0018)
    else:
        group.box((px, py, fz), (plate_d, 0.078, 0.120), "F4F2EC", tile="trim_paint", bevel=0.0025)
        bw = 0.044 / max(1, buttons)
        for i in range(buttons):
            by = py + (i - (buttons - 1) * 0.5) * (bw + 0.004)
            group.box((px + nx * 0.007, by, fz), (0.008, bw, 0.056), "EAE7E0", tile="trim_paint", bevel=0.0018)


def _add_wall_outlet(
    group: MeshGroup,
    face_pos: Tuple[float, float, float],
    *,
    normal_dir: Tuple[int, int] = (0, 1),
) -> None:
    """Build a realistic 3D Korean twin grounded wall power outlet (2구 콘센트)."""
    fx, fy, fz = face_pos
    nx, ny = normal_dir
    plate_d = 0.012
    px = fx + nx * (plate_d * 0.5)
    py = fy + ny * (plate_d * 0.5)
    if ny != 0:
        group.box((px, py, fz), (0.118, plate_d, 0.074), "F4F2EC", tile="trim_paint", bevel=0.002)
        for dx in (-0.028, 0.028):
            group.box((px + dx, py + ny * 0.004, fz), (0.036, 0.008, 0.036), "DCD9D2", tile="trim_paint", bevel=0.0015)
    else:
        group.box((px, py, fz), (plate_d, 0.118, 0.074), "F4F2EC", tile="trim_paint", bevel=0.002)
        for dy in (-0.028, 0.028):
            group.box((px + nx * 0.004, py + dy, fz), (0.008, 0.036, 0.036), "DCD9D2", tile="trim_paint", bevel=0.0015)


def build_wall_south(wall_s: MeshGroup) -> None:
    openings = (
        # Korean 3-panel slim aluminum entryway middle door (현관 중문: 1.50 x 2.24 m)
        WallOpening(offset_x=1.80, width=1.50, height=2.24, sill_z=0.0, kind="door"),
        # Bedroom / hallway paneled interior door (0.90 x 2.12 m)
        WallOpening(offset_x=-2.60, width=0.90, height=2.12, sill_z=0.0, kind="door"),
    )
    add_wall_with_openings(
        wall_s,
        center=(0.0, SOUTH_WALL_Y, FLOOR_Z),
        length=8.360,
        thickness=WALL_T_NS,
        height=WALL_H,
        openings=openings,
        rot_z=0.0,
        color=PAL["wall_warm"],
        tile="plaster",
        baseboard_height=0.082,
        baseboard_depth=0.016,
        baseboard_color=PAL["molding"],
        crown_height=0.062,
        crown_depth=0.020,
        crown_color=PAL["molding"],
        interior_side=1,
    )

    # --- Korean 3-Panel Slim Sliding Entryway Middle Door (현관 3연동 초슬림 중문) ---
    md_cx = 1.80
    md_w = 1.50
    md_h = 2.24
    jamb_w = 0.044
    frame_d = WALL_T_NS + 0.036
    # Outer anodized bronze-charcoal slim frame & floor guide rail
    wall_s.box((md_cx - md_w * 0.5 + jamb_w * 0.5, SOUTH_WALL_Y, FLOOR_Z + md_h * 0.5), (jamb_w, frame_d, md_h), PAL["sash_bronze"], tile="sash_metal", bevel=0.003)
    wall_s.box((md_cx + md_w * 0.5 - jamb_w * 0.5, SOUTH_WALL_Y, FLOOR_Z + md_h * 0.5), (jamb_w, frame_d, md_h), PAL["sash_bronze"], tile="sash_metal", bevel=0.003)
    wall_s.box((md_cx, SOUTH_WALL_Y, FLOOR_Z + md_h - jamb_w * 0.5), (md_w - jamb_w * 1.9, frame_d, jamb_w), PAL["sash_bronze"], tile="sash_metal", bevel=0.003)
    wall_s.box((md_cx, SOUTH_WALL_Y, FLOOR_Z + 0.007), (md_w - jamb_w * 1.8, frame_d - 0.02, 0.014), PAL["steel_dark"], tile="sash_metal", bevel=0.002)

    # 3 interlocking staggered slim aluminum + fluted moru-glass sliding door leaves
    clear_w = md_w - jamb_w * 2.0
    leaf_w = clear_w / 3.0 + 0.022
    leaf_h = md_h - jamb_w - 0.020
    lz0 = FLOOR_Z + 0.016
    stile = 0.028
    leaf_d = 0.026
    kick_h = 0.68

    leaf_configs = [
        (0, -0.038, 0.0),    # Fixed/left leaf
        (1, 0.0, 0.11),      # Middle sliding leaf slightly slid right
        (2, 0.038, 0.22),    # Right active leaf cracked open for depth
    ]
    for idx, dy, dx in leaf_configs:
        lx = md_cx - clear_w * 0.5 + (idx + 0.5) * (clear_w / 3.0) + dx
        lx = min(md_cx + clear_w * 0.5 - leaf_w * 0.5 - 0.003, max(md_cx - clear_w * 0.5 + leaf_w * 0.5 + 0.003, lx))
        ly = SOUTH_WALL_Y + dy
        # Slim vertical stiles + top, middle, and bottom rails
        wall_s.box((lx - leaf_w * 0.5 + stile * 0.5, ly, lz0 + leaf_h * 0.5), (stile, leaf_d, leaf_h), PAL["sash_bronze"], tile="sash_metal", bevel=0.0025)
        wall_s.box((lx + leaf_w * 0.5 - stile * 0.5, ly, lz0 + leaf_h * 0.5), (stile, leaf_d, leaf_h), PAL["sash_bronze"], tile="sash_metal", bevel=0.0025)
        wall_s.box((lx, ly, lz0 + stile * 0.5), (leaf_w - stile * 1.9, leaf_d, stile), PAL["sash_bronze"], tile="sash_metal", bevel=0.0025)
        wall_s.box((lx, ly, lz0 + kick_h), (leaf_w - stile * 1.9, leaf_d, 0.028), PAL["sash_bronze"], tile="sash_metal", bevel=0.0025)
        wall_s.box((lx, ly, lz0 + leaf_h - stile * 0.5), (leaf_w - stile * 1.9, leaf_d, stile), PAL["sash_bronze"], tile="sash_metal", bevel=0.0025)

        inner_lw = leaf_w - stile * 2.0
        # Lower solid matte kick panel (recessed 8 mm behind stiles)
        wall_s.box((lx, ly, lz0 + stile + (kick_h - stile - 0.014) * 0.5), (inner_lw + 0.004, 0.014, kick_h - stile - 0.014), PAL["cabinet_taupe"], tile="trim_paint", bevel=0.002)

        # Upper fluted/moru glass panel + slim architectural grid muntins
        glass_z0 = lz0 + kick_h + 0.014
        glass_h = leaf_h - kick_h - stile - 0.014
        wall_s.box((lx, ly, glass_z0 + glass_h * 0.5), (inner_lw + 0.004, 0.008, glass_h + 0.004), PAL["glass_frosted"], tile="glass_tinted", bevel=0.0012)
        for mz in (0.33, 0.67):
            wall_s.box((lx, ly, glass_z0 + glass_h * mz), (inner_lw + 0.004, 0.016, 0.014), PAL["sash_bronze"], tile="sash_metal", bevel=0.0015)

        # Vertical champagne-gold pull bar handle on active leaves
        if idx in (0, 2):
            hx = lx + (leaf_w * 0.5 - 0.048) * (1.0 if idx == 0 else -1.0)
            for side in (-1, 1):
                hy = ly + side * (leaf_d * 0.5 + 0.018)
                wall_s.rail((hx, hy, lz0 + 0.90), (hx, hy, lz0 + 1.24), 0.008, PAL["brass"], 8, tile="hardware_brass")
                wall_s.rail((hx, ly + side * leaf_d * 0.5, lz0 + 0.94), (hx, hy, lz0 + 0.94), 0.006, PAL["brass"], 6, tile="hardware_brass")
                wall_s.rail((hx, ly + side * leaf_d * 0.5, lz0 + 1.20), (hx, hy, lz0 + 1.20), 0.006, PAL["brass"], 6, tile="hardware_brass")

    # --- Hallway / Bedroom Paneled Interior Door (South-West) ---
    add_door_frame(
        wall_s,
        center=(-2.60, SOUTH_WALL_Y, FLOOR_Z),
        width=0.90,
        height=2.12,
        wall_thickness=WALL_T_NS,
        rot_z=0.0,
        open_deg=6.0,
        hinge_left=True,
        frame_color=PAL["molding"],
        frame_tile="trim_paint",
        leaf_color="DFD7CA",
        leaf_tile="door_wood",
        handle_color=PAL["brass"],
        handle_tile="hardware_brass",
        panel_rows=2,
    )

    # --- Built-In Entryway Shoe / Coat Tall Storage Cabinet (현관 신발장, far South-East) ---
    sc_x0, sc_x1 = 2.86, 3.96
    sc_w = sc_x1 - sc_x0
    sc_cx = 0.5 * (sc_x0 + sc_x1)
    sc_d = 0.36
    sc_y = SOUTH_WALL_Y + WALL_T_NS * 0.5 + sc_d * 0.5 + 0.004
    # Recessed dark toe-kick plinth + lower cabinet + open oak display niche + upper cabinet
    wall_s.box((sc_cx, sc_y - 0.02, FLOOR_Z + 0.05), (sc_w - 0.01, sc_d - 0.04, 0.10), PAL["iron_matte"], tile="trim_paint", bevel=0.002)
    # Lower storage doors (2 doors with 4 mm center gap)
    door_w = sc_w * 0.5 - 0.004
    wall_s.box((sc_cx, sc_y - 0.012, FLOOR_Z + 0.52), (sc_w - 0.008, sc_d - 0.024, 0.84), PAL["cabinet_cashmere"], tile="trim_paint", bevel=0.003)
    for sx in (-1, 1):
        wall_s.box((sc_cx + sx * (door_w * 0.5 + 0.002), sc_y + sc_d * 0.5 - 0.010, FLOOR_Z + 0.52), (door_w, 0.020, 0.834), PAL["cabinet_cashmere"], tile="trim_paint", bevel=0.003)
    # Open oak key-drop niche (Z = FLOOR_Z + 0.94 .. 1.38)
    wall_s.box((sc_cx, sc_y - 0.008, FLOOR_Z + 0.954), (sc_w, sc_d - 0.008, 0.028), PAL["oak_mid"], tile="wood_panel", bevel=0.003)
    wall_s.box((sc_cx, sc_y - sc_d * 0.5 + 0.014, FLOOR_Z + 1.16), (sc_w - 0.01, 0.024, 0.40), PAL["oak_light"], tile="wood_panel", bevel=0.002)
    for sx in (-1, 1):
        wall_s.box((sc_cx + sx * (sc_w * 0.5 - 0.014), sc_y - 0.004, FLOOR_Z + 1.16), (0.026, sc_d - 0.012, 0.40), PAL["oak_mid"], tile="wood_panel", bevel=0.002)
    # Upper tall cabinet (Z = FLOOR_Z + 1.38 .. 2.52)
    wall_s.box((sc_cx, sc_y - 0.012, FLOOR_Z + 1.95), (sc_w - 0.008, sc_d - 0.024, 1.14), PAL["cabinet_cashmere"], tile="trim_paint", bevel=0.003)
    for sx in (-1, 1):
        wall_s.box((sc_cx + sx * (door_w * 0.5 + 0.002), sc_y + sc_d * 0.5 - 0.010, FLOOR_Z + 1.95), (door_w, 0.020, 1.132), PAL["cabinet_cashmere"], tile="trim_paint", bevel=0.003)

    # --- Korean Apartment Smart Wallpad Intercom (월패드) & Switches/Outlets ---
    wp_y = SOUTH_WALL_Y + WALL_T_NS * 0.5
    # Wallpad right next to entryway middle door (X = +0.62, Z = 1.44)
    wall_s.box((0.62, wp_y + 0.012, FLOOR_Z + 1.44), (0.285, 0.022, 0.195), PAL["steel"], tile="sash_metal", bevel=0.004)
    wall_s.box((0.62, wp_y + 0.024, FLOOR_Z + 1.45), (0.252, 0.008, 0.152), PAL["glass_tv"], tile="glass_tinted", bevel=0.002)
    # Tactile home-automation buttons below screen
    for i in range(4):
        wall_s.box((0.53 + i * 0.06, wp_y + 0.025, FLOOR_Z + 1.36), (0.036, 0.006, 0.012), PAL["sash_white"], tile="trim_paint", bevel=0.001)

    # Thermostat & light switches + wall outlets on South wall
    _add_wall_switch_plate(wall_s, (0.62, wp_y, FLOOR_Z + 1.16), normal_dir=(0, 1), buttons=3)
    _add_wall_switch_plate(wall_s, (-1.92, wp_y, FLOOR_Z + 1.18), normal_dir=(0, 1), buttons=2)
    _add_wall_outlet(wall_s, (0.62, wp_y, FLOOR_Z + 0.34), normal_dir=(0, 1))
    _add_wall_outlet(wall_s, (-1.40, wp_y, FLOOR_Z + 0.34), normal_dir=(0, 1))

    # --- Minimalist Framed Botanical/Geometric Art Diptych on South Wall ---
    for ax, accent_col in ((-1.02, "C8A988"), (-0.28, "8E9B8C")):
        az = FLOOR_Z + 1.56
        fw, fh, fd = 0.54, 0.72, 0.028
        fy = wp_y + 0.005 + fd * 0.5  # 5 mm standoff (zero Z-fighting!)
        # 4 mitered oak picture frame rails
        bar = 0.026
        wall_s.box((ax - fw * 0.5 + bar * 0.5, fy, az), (bar, fd, fh), PAL["oak_warm"], tile="wood_panel", bevel=0.003)
        wall_s.box((ax + fw * 0.5 - bar * 0.5, fy, az), (bar, fd, fh), PAL["oak_warm"], tile="wood_panel", bevel=0.003)
        wall_s.box((ax, fy, az + fh * 0.5 - bar * 0.5), (fw - bar * 1.9, fd, bar), PAL["oak_warm"], tile="wood_panel", bevel=0.003)
        wall_s.box((ax, fy, az - fh * 0.5 + bar * 0.5), (fw - bar * 1.9, fd, bar), PAL["oak_warm"], tile="wood_panel", bevel=0.003)
        # Recessed ivory mat board + subtle 3D graphic relief composition
        wall_s.box((ax, fy - 0.004, az), (fw - bar * 2.0, 0.010, fh - bar * 2.0), "F6F2EA", tile="plaster", bevel=0.001)
        wall_s.box((ax, fy + 0.003, az + 0.05), (fw * 0.52, 0.006, fh * 0.48), accent_col, tile="plaster", bevel=0.0015)
        wall_s.box((ax + 0.04, fy + 0.007, az - 0.09), (fw * 0.36, 0.005, fh * 0.24), "555D57", tile="plaster", bevel=0.001)


# ---------------------------------------------------------------------------
# 4. West Wall (BG_Wall_West — Hero TV Art Wall, Wood Louvers, 65" OLED TV)
# ---------------------------------------------------------------------------


def build_wall_west(wall_w: MeshGroup) -> None:
    # Spans between North & South walls cleanly with zero coincident corner edges
    add_wall_with_openings(
        wall_w,
        center=(WEST_WALL_X, -0.520, FLOOR_Z),
        length=4.784,
        thickness=WALL_T_EW,
        height=WALL_H,
        openings=(),
        rot_z=math.pi * 0.5,
        color=PAL["wall_warm"],
        tile="plaster",
        baseboard_height=0.082,
        baseboard_depth=0.016,
        baseboard_color=PAL["molding"],
        crown_height=0.062,
        crown_depth=0.020,
        crown_color=PAL["molding"],
        interior_side=-1,
    )

    face_x = WEST_WALL_X + WALL_T_EW * 0.5  # -4.002 m

    # --- Large-Format Architectural Stone TV Art Wall (TV 아트월) ---
    # 3 wide × 3 tall honed limestone slabs with crisp 5 mm architectural reveal joints (clean, calm tone!)
    art_y0, art_y1 = -1.88, 1.02
    art_z0, art_z1 = FLOOR_Z + 0.086, CEIL_Z - 0.165
    panel_d = 0.024
    cols_y = 3
    rows_z = 3
    gap = 0.005
    cw = (art_y1 - art_y0 - gap * (cols_y - 1)) / cols_y
    rh = (art_z1 - art_z0 - gap * (rows_z - 1)) / rows_z
    stone_tones = ("F0ECE4", "ECE7DE", "F2EEE7", "EAE5DB")
    for ic in range(cols_y):
        py = art_y0 + ic * (cw + gap) + cw * 0.5
        for ir in range(rows_z):
            pz = art_z0 + ir * (rh + gap) + rh * 0.5
            wall_w.box(
                (face_x + panel_d * 0.5 + 0.002, py, pz),
                (panel_d, cw, rh),
                stone_tones[(ic + ir * 2) % len(stone_tones)],
                tile="plaster",
                bevel=0.003,
            )

    # --- Flanking Vertical Oak Tambour Wood Louver Slats (템바보드 우드 루버) ---
    for seg_y0, seg_y1 in ((-2.76, -1.94), (1.08, 1.78)):
        seg_w = seg_y1 - seg_y0
        # Dark acoustic felt backing panel
        wall_w.box((face_x + 0.008, 0.5 * (seg_y0 + seg_y1), 0.5 * (art_z0 + art_z1)), (0.012, seg_w, art_z1 - art_z0), "3D3A37", tile="carpet", bevel=0.002)
        slat_pitch = 0.044
        n_slats = int(seg_w / slat_pitch)
        for i in range(n_slats):
            sy = seg_y0 + 0.022 + i * slat_pitch
            if sy < seg_y1 - 0.014:
                wall_w.box(
                    (face_x + 0.024, sy, 0.5 * (art_z0 + art_z1)),
                    (0.022, 0.024, art_z1 - art_z0 - 0.008),
                    PAL["oak_warm"] if i % 2 == 0 else PAL["oak_mid"],
                    tile="wood_panel",
                    bevel=0.003,
                )

    # --- Wall-Mounted 65" Ultra-Slim OLED TV (벽걸이 TV) ---
    tv_cy = -0.43
    tv_cz = FLOOR_Z + 1.24
    tv_w = 1.46
    tv_h = 0.84
    tv_x = face_x + panel_d + 0.036  # Proud of stone panel with VESA wall mount bracket behind
    # Rear steel wall mount bracket & chassis hump
    wall_w.box((face_x + panel_d + 0.016, tv_cy, tv_cz - 0.04), (0.028, 0.52, 0.34), PAL["iron_matte"], tile="sash_metal", bevel=0.003)
    wall_w.box((tv_x - 0.012, tv_cy, tv_cz - 0.08), (0.022, tv_w - 0.14, tv_h * 0.48), "2A2D32", tile="sash_metal", bevel=0.004)
    # Ultra-slim anodized bezel frame + recessed obsidian display screen
    bezel = 0.016
    wall_w.box((tv_x, tv_cy, tv_cz), (0.018, tv_w, tv_h), "23262B", tile="sash_metal", bevel=0.003)
    wall_w.box((tv_x + 0.009, tv_cy, tv_cz + 0.003), (0.007, tv_w - bezel * 2.0, tv_h - bezel * 2.2), PAL["glass_tv"], tile="glass_tinted", bevel=0.0012)
    # Subtle brushed aluminum bottom status bar
    wall_w.box((tv_x + 0.011, tv_cy, tv_cz - tv_h * 0.5 + 0.009), (0.006, 0.16, 0.010), PAL["steel"], tile="hardware_brass", bevel=0.001)

    # --- Floating Display Ledge Shelf on North-West Lounge Side ---
    wall_w.box((face_x + 0.11, 1.42, FLOOR_Z + 1.62), (0.18, 0.68, 0.032), PAL["walnut"], tile="wood_panel", bevel=0.004)
    wall_w.box((face_x + 0.11, 1.42, FLOOR_Z + 1.24), (0.18, 0.68, 0.032), PAL["walnut"], tile="wood_panel", bevel=0.004)

    # Power outlet behind lowboard & hallway light switch near South-West corner
    _add_wall_outlet(wall_w, (face_x + panel_d + 0.002, -0.43, FLOOR_Z + 0.52), normal_dir=(1, 0))
    _add_wall_switch_plate(wall_w, (face_x, -2.56, FLOOR_Z + 1.18), normal_dir=(1, 0), buttons=2)


# ---------------------------------------------------------------------------
# 5. East Wall (BG_Wall_East — Kitchen Backsplash Tiles, Upper Cabinets, Range Hood)
# ---------------------------------------------------------------------------


def build_wall_east(wall_e: MeshGroup) -> None:
    add_wall_with_openings(
        wall_e,
        center=(EAST_WALL_X, -0.520, FLOOR_Z),
        length=4.784,
        thickness=WALL_T_EW,
        height=WALL_H,
        openings=(),
        rot_z=-math.pi * 0.5,
        color=PAL["wall_warm"],
        tile="plaster",
        baseboard_height=0.082,
        baseboard_depth=0.016,
        baseboard_color=PAL["molding"],
        crown_height=0.062,
        crown_depth=0.020,
        crown_color=PAL["molding"],
        interior_side=-1,
    )

    face_x = EAST_WALL_X - WALL_T_EW * 0.5  # +4.002 m

    # --- 3D Beveled Ceramic Kitchen Backsplash Tile Grid (주방 타일 백스플래시) ---
    bs_y0, bs_y1 = -1.36, 1.84
    bs_z0, bs_z1 = FLOOR_Z + 0.87, FLOOR_Z + 1.54
    tw_y, th_z, t_gap = 0.24, 0.11, 0.003
    tile_cols = ("F5F2EC", "EFECE5", "F2EFE9")
    ry = 0
    tz = bs_z0
    while tz < bs_z1 - 0.02:
        tz1 = min(bs_z1, tz + th_z - t_gap)
        stagger = (tw_y * 0.5) if (ry % 2 == 1) else 0.0
        ty = bs_y0 - stagger
        cx_i = 0
        while ty < bs_y1 - 0.02:
            ty0 = max(bs_y0, ty)
            ty1 = min(bs_y1, ty + tw_y - t_gap)
            if (ty1 - ty0) > 0.03 and (tz1 - tz) > 0.02:
                wall_e.box(
                    (face_x - 0.007, 0.5 * (ty0 + ty1), 0.5 * (tz + tz1)),
                    (0.010, ty1 - ty0, tz1 - tz),
                    tile_cols[(ry + cx_i) % len(tile_cols)],
                    tile="tile_ceramic",
                    bevel=0.0018,
                )
            ty += tw_y
            cx_i += 1
        tz += th_z
        ry += 1

    # --- Kitchen Upper Wall Cabinets (주방 상부장, Z = FLOOR_Z + 1.54 .. 2.54) ---
    uc_z0 = FLOOR_Z + 1.54
    uc_z1 = CEIL_Z - 0.162  # Meets ceiling drop bulkhead cleanly
    uc_h = uc_z1 - uc_z0
    uc_d = 0.36
    uc_cx = face_x - uc_d * 0.5 - 0.003
    # Two cabinet banks flanking the chimney range hood centered at Y = +0.12
    for bank_y0, bank_y1, n_doors in ((-1.36, -0.34, 2), (0.58, 1.84, 3)):
        bw = bank_y1 - bank_y0
        bcy = 0.5 * (bank_y0 + bank_y1)
        # Main cabinet box carcass
        wall_e.box((uc_cx + 0.011, bcy, uc_z0 + uc_h * 0.5), (uc_d - 0.022, bw, uc_h), PAL["cabinet_cashmere"], tile="trim_paint", bevel=0.003)
        # Recessed under-cabinet lighting channel strip
        wall_e.box((uc_cx + 0.04, bcy, uc_z0 + 0.004), (0.04, bw - 0.06, 0.010), PAL["sash_white"], tile="sash_metal", bevel=0.0015)
        # Individual beveled frameless doors with 4 mm vertical reveal gaps
        dw = (bw - 0.004 * (n_doors - 1)) / n_doors
        for i in range(n_doors):
            dy = bank_y0 + i * (dw + 0.004) + dw * 0.5
            wall_e.box((face_x - uc_d + 0.010, dy, uc_z0 + uc_h * 0.5), (0.020, dw, uc_h - 0.004), PAL["cabinet_cashmere"], tile="trim_paint", bevel=0.003)
            # Subtle champagne-brass edge pull tab near lower inner corner
            wall_e.box((face_x - uc_d - 0.006, dy, uc_z0 + 0.022), (0.014, 0.095, 0.008), PAL["brass"], tile="hardware_brass", bevel=0.0015)

    # --- Sculpted Stainless Chimney Range Hood (침니 후드) over Induction at Y = +0.12 ---
    hood_y = 0.12
    hood_w = 0.84
    hood_d = 0.46
    hood_z0 = FLOOR_Z + 1.56
    # Capture canopy box + chamfered trapezoid pyramid shroud + vertical exhaust chimney
    wall_e.box((face_x - hood_d * 0.5 - 0.003, hood_y, hood_z0 + 0.036), (hood_d, hood_w, 0.072), PAL["steel"], tile="sash_metal", bevel=0.004)
    # Tapered trapezoid transition shroud lofted via rings()
    shroud_r0 = [
        (face_x - hood_d, hood_y - hood_w * 0.48, hood_z0 + 0.070),
        (face_x - 0.004, hood_y - hood_w * 0.48, hood_z0 + 0.070),
        (face_x - 0.004, hood_y + hood_w * 0.48, hood_z0 + 0.070),
        (face_x - hood_d, hood_y + hood_w * 0.48, hood_z0 + 0.070),
    ]
    shroud_r1 = [
        (face_x - 0.28, hood_y - 0.16, hood_z0 + 0.24),
        (face_x - 0.004, hood_y - 0.16, hood_z0 + 0.24),
        (face_x - 0.004, hood_y + 0.16, hood_z0 + 0.24),
        (face_x - 0.28, hood_y + 0.16, hood_z0 + 0.24),
    ]
    wall_e.rings([shroud_r0, shroud_r1], color=PAL["steel"], tile="sash_metal")
    # Vertical chimney duct rising cleanly into the ceiling soffit
    chim_h = (CEIL_Z - 0.156) - (hood_z0 + 0.236)
    wall_e.box((face_x - 0.142, hood_y, hood_z0 + 0.236 + chim_h * 0.5), (0.272, 0.312, chim_h), PAL["steel"], tile="sash_metal", bevel=0.004)
    # Dark front control bezel + 4 tactile hood speed buttons
    wall_e.box((face_x - hood_d - 0.004, hood_y, hood_z0 + 0.036), (0.008, 0.24, 0.028), PAL["iron_matte"], tile="sash_metal", bevel=0.002)
    # Recessed dual baffle grease filter trays underneath canopy
    for dy in (-0.19, 0.19):
        wall_e.box((face_x - hood_d * 0.5, hood_y + dy, hood_z0 - 0.004), (hood_d - 0.08, 0.34, 0.010), PAL["steel_dark"], tile="sash_metal", bevel=0.002)

    # Kitchen stainless magnetic utensil rail + twin kitchen appliance outlets
    wall_e.rail((face_x - 0.028, -1.16, FLOOR_Z + 1.24), (face_x - 0.028, -0.44, FLOOR_Z + 1.24), 0.008, PAL["steel"], 10, tile="sash_metal")
    for hy in (-1.12, -0.48):
        wall_e.rail((face_x - 0.006, hy, FLOOR_Z + 1.24), (face_x - 0.028, hy, FLOOR_Z + 1.24), 0.010, PAL["steel"], 8, tile="sash_metal")
    _add_wall_outlet(wall_e, (face_x - 0.012, 0.96, FLOOR_Z + 1.08), normal_dir=(-1, 0))
    _add_wall_outlet(wall_e, (face_x - 0.012, -0.86, FLOOR_Z + 1.08), normal_dir=(-1, 0))


# ---------------------------------------------------------------------------
# 6. Ceiling Assembly (BG_Ceiling — Coffered Ceiling + Cove LEDs + AC + Pendants)
# ---------------------------------------------------------------------------


def build_ceiling(ceiling: MeshGroup) -> None:
    # Full-room coffered ceiling slab (우물천장) covering living + dining + kitchen
    # Main upper slab covers X in [-4.16, +4.16], Y in [-3.06, +2.02], soffit at CEIL_Z
    slab_t = 0.080
    drop_h = 0.160
    drop_z_bot = CEIL_Z - drop_h  # 2.584 m

    # Living room coffer tray centered over living zone (X in [-3.48, +0.42], Y in [-2.18, +1.18])
    # Built as upper ceiling slab + perimeter dropped soffit bulkheads forming the crisp tray!
    add_ceiling_coffer(
        ceiling,
        center=(-1.53, -0.50, CEIL_Z),
        width=5.24,
        depth=5.02,
        slab_thickness=slab_t,
        coffer_drop=drop_h,
        border_width=0.62,
        color=PAL["wall_warm"],
        tile="ceiling_plaster",
        beam_color=PAL["molding"],
        beam_tile="ceiling_beam",
        include_light_panel=False,
    )

    # East Kitchen/Dining/Entry ceiling slab + flush dropped soffit (X in [+1.094, +4.16])
    east_w = 3.066
    east_cx = 1.094 + east_w * 0.5
    ceiling.box((east_cx, -0.50, CEIL_Z + slab_t * 0.5), (east_w, 5.02, slab_t), PAL["wall_warm"], tile="ceiling_plaster", bevel=0.004)
    ceiling.box((east_cx, -0.50, CEIL_Z - drop_h * 0.5 + 0.002), (east_w - 0.006, 5.00, drop_h + 0.004), PAL["molding"], tile="ceiling_beam", bevel=0.004)

    # Indirect Cove Lighting Lip + Continuous Warm Glow LED Strip inside Living Coffer (우물천장 간접등)
    tray_x0, tray_x1 = -3.52, 0.46
    tray_y0, tray_y1 = -2.38, 1.38
    cove_path = [
        (tray_x0 + 0.02, tray_y0 + 0.02, drop_z_bot + 0.02),
        (tray_x1 - 0.02, tray_y0 + 0.02, drop_z_bot + 0.02),
        (tray_x1 - 0.02, tray_y1 - 0.02, drop_z_bot + 0.02),
        (tray_x0 + 0.02, tray_y1 - 0.02, drop_z_bot + 0.02),
    ]
    add_molding_strip(ceiling, cove_path, width=0.055, height=0.036, style="casing", closed=True, color=PAL["molding"], tile="ceiling_beam")
    # Recessed warm emissive LED cove bars along all 4 sides of the coffer tray
    led_z = drop_z_bot + 0.068
    ceiling.box((-1.53, tray_y0 + 0.024, led_z), (tray_x1 - tray_x0 - 0.10, 0.018, 0.014), "FFF4DC", tile="emissive_warm", bevel=0.002)
    ceiling.box((-1.53, tray_y1 - 0.024, led_z), (tray_x1 - tray_x0 - 0.10, 0.018, 0.014), "FFF4DC", tile="emissive_warm", bevel=0.002)
    ceiling.box((tray_x0 + 0.024, -0.50, led_z), (0.018, tray_y1 - tray_y0 - 0.10, 0.014), "FFF4DC", tile="emissive_warm", bevel=0.002)
    ceiling.box((tray_x1 - 0.024, -0.50, led_z), (0.018, tray_y1 - tray_y0 - 0.10, 0.014), "FFF4DC", tile="emissive_warm", bevel=0.002)

    # Twin Slim Modern Edge-Lit Main Ceiling LED Panels inside Coffer (거실 면조명 2조)
    for lx in (-2.28, -0.78):
        ceiling.box((lx, -0.45, CEIL_Z - 0.014), (0.58, 1.32, 0.022), "DFDDD8", tile="ceiling_metal", bevel=0.003)
        ceiling.box((lx, -0.45, CEIL_Z - 0.029), (0.52, 1.26, 0.014), "FFFBF2", tile="emissive_warm", bevel=0.002)

    # System Ceiling Air Conditioner near Veranda Window (천장형 시스템 에어컨)
    ac_cx, ac_cy = -1.55, 1.56
    ceiling.box((ac_cx, ac_cy, drop_z_bot - 0.012), (1.18, 0.42, 0.024), "F5F4F0", tile="ceiling_plaster", bevel=0.004)
    # Intake grille louvers + directional front blow vane
    for i in range(6):
        ceiling.box((ac_cx - 0.42 + i * 0.168, ac_cy + 0.05, drop_z_bot - 0.025), (0.14, 0.16, 0.006), "DCDAD4", tile="ceiling_metal", bevel=0.001)
    ceiling.box((ac_cx, ac_cy - 0.12, drop_z_bot - 0.026), (0.96, 0.055, 0.008), "E8E6E0", tile="ceiling_metal", bevel=0.0015)

    # Recessed Circular Architectural Downlights (매입 다운라이트 — TV wall wash + kitchen + entry)
    downlight_pts = (
        (-3.58, -1.35), (-3.58, -0.43), (-3.58, 0.50),  # TV art wall grazing spotlights
        (2.70, 0.95), (2.70, 0.12), (2.70, -0.68),      # U-kitchen work triangle downlights
        (1.80, -2.25),                                   # Entryway foyer downlight
    )
    for dx, dy in downlight_pts:
        _add_turned_cylinder(
            ceiling,
            dx,
            dy,
            ((0.056, drop_z_bot + 0.002), (0.056, drop_z_bot - 0.008), (0.044, drop_z_bot - 0.012)),
            sides=16,
            color="E6E4DE",
            tile="ceiling_metal",
        )
        _add_turned_cylinder(
            ceiling,
            dx,
            dy,
            ((0.040, drop_z_bot - 0.005), (0.040, drop_z_bot - 0.014)),
            sides=14,
            color="FFF5DC",
            tile="emissive_warm",
        )

    # Two Sculptural Designer Pendant Lamps over Dining Table (식탁 펜던트 조명 2구)
    for py in (-0.82, -0.08):
        px = 0.56
        # Ceiling rose canopy + slender suspension cord
        _add_turned_cylinder(ceiling, px, py, ((0.062, drop_z_bot + 0.002), (0.056, drop_z_bot - 0.026)), sides=16, color=PAL["brass"], tile="ceiling_brass")
        ceiling.rail((px, py, 1.88), (px, py, drop_z_bot - 0.022), 0.0045, PAL["iron_matte"], 8, tile="ceiling_metal")
        # Turned conical brass-accented lamp shade (Z = 1.62 .. 1.88)
        shade_prof = (
            (0.028, 1.89),
            (0.042, 1.84),
            (0.115, 1.72),
            (0.165, 1.63),
            (0.156, 1.62),
            (0.105, 1.71),
        )
        _add_turned_cylinder(ceiling, px, py, shade_prof, sides=20, color="E5D8C3", tile="ceiling_brass")
        # Glowing frosted opal glass bulb inside pendant shade
        bulb_prof = (
            (0.018, 1.74),
            (0.048, 1.70),
            (0.052, 1.66),
            (0.036, 1.625),
            (0.012, 1.615),
        )
        _add_turned_cylinder(ceiling, px, py, bulb_prof, sides=14, color="FFF4D8", tile="emissive_warm")


# ---------------------------------------------------------------------------
# 7. Hero Furniture (BG_Furniture_Hero — Sofa, TV Console, Coffee Table,
#    U-Shaped Kitchen Cabinets/Counter/Oven/Fridge, Dining Table + 4 Chairs)
# ---------------------------------------------------------------------------


def _build_piping_sofa(furn: MeshGroup) -> None:
    """Build a detailed Korean modern 3.5-seater L-chaise sofa with 3D piping & throw pillows."""
    # Sofa facing -X (West TV wall): X in [-1.84, -0.92], Y in [-1.62, +0.94]
    back_x = -0.92
    seat_depth = 0.90
    sofa_len = 2.56
    sofa_cy = -0.34
    base_z0 = FLOOR_Z + 0.125
    base_h = 0.135
    seat_h = 0.165
    seat_z_mid = base_z0 + base_h + seat_h * 0.5  # top at FLOOR_Z + 0.425

    # Tapered walnut legs with brass ferrule tips grounded cleanly on rug/floor
    leg_positions = [
        (-1.74, -1.52), (-1.02, -1.52),
        (-1.74, -0.34), (-1.02, -0.34),
        (-1.74, 0.84), (-1.02, 0.84),
        (-2.22, 0.24), (-2.22, 0.84),  # Front chaise extension legs
    ]
    for lx, ly in leg_positions:
        _add_turned_cylinder(
            furn,
            lx,
            ly,
            ((0.015, FLOOR_Z + 0.010), (0.017, FLOOR_Z + 0.042)),
            sides=12,
            color=PAL["brass"],
            tile="metal_brass_trim",
        )
        _add_turned_cylinder(
            furn,
            lx,
            ly,
            ((0.017, FLOOR_Z + 0.040), (0.025, base_z0 + 0.008)),
            sides=12,
            color=PAL["walnut_dark"],
            tile="wood_walnut",
        )

    # Upholstered main plinth base + chaise ottoman base extension (North end Y in [+0.14, +0.94])
    furn.box((-1.38, sofa_cy, base_z0 + base_h * 0.5), (seat_depth, sofa_len, base_h), PAL["sofa_cream"], tile="fabric_linen", bevel=0.010)
    furn.box((-2.06, 0.54, base_z0 + base_h * 0.5), (0.48, 0.80, base_h), PAL["sofa_cream"], tile="fabric_linen", bevel=0.010)

    # Sculpted backrest shell frame + signature 3D exterior cord piping around back perimeter
    back_z_mid = base_z0 + base_h + 0.27
    furn.box((back_x - 0.095, sofa_cy, back_z_mid), (0.19, sofa_len - 0.02, 0.54), PAL["sofa_cream"], tile="fabric_linen", bevel=0.018)
    add_pipe_frame(
        furn,
        [
            (back_x - 0.002, sofa_cy - sofa_len * 0.5 + 0.022, base_z0 + base_h + 0.02),
            (back_x - 0.002, sofa_cy + sofa_len * 0.5 - 0.022, base_z0 + base_h + 0.02),
            (back_x - 0.002, sofa_cy + sofa_len * 0.5 - 0.022, base_z0 + base_h + 0.525),
            (back_x - 0.002, sofa_cy - sofa_len * 0.5 + 0.022, base_z0 + base_h + 0.525),
        ],
        radius=0.0085,
        sides=8,
        closed=True,
        bend_subdiv=2,
        bend_radius=0.025,
        flange_ends=False,
        color=PAL["sofa_piping"],
        tile="fabric_linen",
    )

    # Two plush wide armrests (South & North ends) with exterior piping cords
    arm_w = 0.17
    for ay in (-1.62 + arm_w * 0.5, 0.94 - arm_w * 0.5):
        _add_cushion_loft(
            furn,
            center=(-1.38, ay, base_z0 + base_h + 0.195),
            size=(seat_depth - 0.02, arm_w, 0.39),
            corner_r=0.042,
            crown=0.012,
            color=PAL["sofa_cream"],
            tile="fabric_linen",
            piping_color=PAL["sofa_piping"],
            piping_radius=0.007,
        )

    # 2 Standard Seat Cushions (South & Center) + 1 Deep L-Chaise Cushion (North) with 3D cord piping!
    inner_len = sofa_len - arm_w * 2.0 - 0.02
    c_len = inner_len / 3.0 - 0.010
    for idx, cy_c in enumerate((-1.08, -0.34)):
        _add_cushion_loft(
            furn,
            center=(-1.46, cy_c, seat_z_mid),
            size=(0.74, c_len, seat_h),
            corner_r=0.055,
            crown=0.022,
            color=PAL["sofa_cream"],
            tile="fabric_linen",
            piping_color=PAL["sofa_piping"],
            piping_radius=0.0075,
        )
    # Extended North Chaise Lounge Cushion (extending West to X = -2.28, completely clear of coffee table!)
    _add_cushion_loft(
        furn,
        center=(-1.69, 0.42, seat_z_mid),
        size=(1.18, c_len + 0.06, seat_h),
        corner_r=0.058,
        crown=0.024,
        color=PAL["sofa_cream"],
        tile="fabric_linen",
        piping_color=PAL["sofa_piping"],
        piping_radius=0.0075,
    )

    # 3 Reclined Plush Backrest Cushions with 3D piping
    for cy_b in (-1.08, -0.34, 0.41):
        _add_cushion_loft(
            furn,
            center=(-1.14, cy_b, seat_z_mid + 0.28),
            size=(0.18, c_len - 0.01, 0.43),
            corner_r=0.050,
            crown=0.018,
            tilt_y=-0.16,
            color=PAL["sofa_cream"],
            tile="fabric_linen",
            piping_color=PAL["sofa_piping"],
            piping_radius=0.007,
        )

    # 3 Sculpted Accent Throw Pillows leaning naturally against backrest & armrests
    _add_throw_pillow(furn, (-1.30, -1.26, seat_z_mid + 0.24), 0.42, 0.40, 0.14, rot_z=0.38, tilt_y=-0.24, color=PAL["pillow_terra"], tile="fabric_velvet")
    _add_throw_pillow(furn, (-1.28, -0.62, seat_z_mid + 0.23), 0.40, 0.38, 0.13, rot_z=-0.18, tilt_y=-0.26, color=PAL["pillow_ivory"], tile="fabric_linen")
    _add_throw_pillow(furn, (-1.29, 0.56, seat_z_mid + 0.24), 0.44, 0.40, 0.14, rot_z=-0.34, tilt_y=-0.24, color=PAL["pillow_sage"], tile="fabric_velvet")

    # Folded textured knit throw blanket draped smoothly over South armrest
    drape_rings = []
    for i in range(9):
        u = i / 8.0
        # Path goes from outer South side -> up over armrest top -> down onto seat
        ang = math.pi * u
        dy = -1.62 + 0.085 - 0.125 * math.cos(ang)
        dz = base_z0 + base_h + 0.16 + 0.245 * math.sin(ang)
        if u > 0.72:
            dz = max(seat_z_mid + 0.095, dz)
        t_bl = 0.016
        drape_rings.append(
            [
                (-1.66, dy - t_bl * 0.5, dz),
                (-1.26, dy - t_bl * 0.5, dz),
                (-1.26, dy + t_bl * 0.5, dz + 0.014),
                (-1.66, dy + t_bl * 0.5, dz + 0.014),
            ]
        )
    furn.rings(drape_rings, color=PAL["throw_knit"], tile="fabric_canvas")


def _build_tv_console(furn: MeshGroup) -> None:
    """Build a fluted-front modern walnut TV console lowboard against the West TV wall."""
    cx = -3.76
    cy = -0.43
    w_x = 0.42
    len_y = 2.36
    leg_h = 0.135
    body_h = 0.305
    z_body0 = FLOOR_Z + leg_h

    # Matte-dark steel sled legs with floor glides
    for ly in (-1.42, -0.43, 0.56):
        for lx in (-0.15, 0.15):
            furn.rail((cx + lx, ly, FLOOR_Z), (cx + lx, ly, z_body0 + 0.008), 0.012, PAL["iron_matte"], 10, tile="metal_leg_dark")
        furn.box((cx, ly, FLOOR_Z + 0.032), (0.31, 0.022, 0.018), PAL["iron_matte"], tile="metal_leg_dark", bevel=0.0025)

    # Outer walnut cabinet surround (top, bottom, ends, center dividers)
    panel_t = 0.026
    furn.box((cx, cy, z_body0 + panel_t * 0.5), (w_x, len_y, panel_t), PAL["walnut"], tile="wood_walnut", bevel=0.004)
    furn.box((cx, cy, z_body0 + body_h - panel_t * 0.5), (w_x + 0.012, len_y + 0.012, panel_t), PAL["walnut"], tile="wood_walnut", bevel=0.0045)
    # Back panel & end gables
    furn.box((cx - w_x * 0.5 + 0.012, cy, z_body0 + body_h * 0.5), (0.020, len_y - 0.02, body_h - panel_t * 1.8), PAL["walnut_dark"], tile="wood_walnut", bevel=0.002)
    for ey in (-len_y * 0.5 + panel_t * 0.5, len_y * 0.5 - panel_t * 0.5, -0.38, 0.38):
        furn.box((cx, cy + ey, z_body0 + body_h * 0.5), (w_x - 0.01, panel_t, body_h - panel_t * 1.8), PAL["walnut"], tile="wood_walnut", bevel=0.003)

    # Center open media shelf
    furn.box((cx, cy, z_body0 + body_h * 0.48), (w_x - 0.04, 0.72, 0.020), PAL["walnut_dark"], tile="wood_walnut", bevel=0.003)

    # Left & right fluted tambour drawer fronts (real 3D vertical reed ribs + brass edge pulls!)
    for bay_cy in (-0.77, 0.77):
        dw = 0.73
        dh = body_h - panel_t * 2.0 - 0.010
        fx = cx + w_x * 0.5 - 0.010
        furn.box((fx - 0.008, cy + bay_cy, z_body0 + body_h * 0.5), (0.018, dw, dh), PAL["walnut"], tile="wood_walnut", bevel=0.0025)
        n_ribs = 15
        for ir in range(n_ribs):
            ry = (cy + bay_cy) - dw * 0.46 + (dw * 0.92) * (ir / float(n_ribs - 1))
            furn.box((fx + 0.005, ry, z_body0 + body_h * 0.5), (0.012, 0.022, dh - 0.006), PAL["oak_warm"], tile="wood_oak", bevel=0.0025)
        # Brushed brass top edge pull
        furn.box((fx + 0.012, cy + bay_cy, z_body0 + body_h - panel_t - 0.016), (0.014, 0.14, 0.010), PAL["brass"], tile="metal_brass_trim", bevel=0.0015)


def _build_coffee_table(furn: MeshGroup) -> None:
    """Build a stadium-oval oak coffee table on twin fluted cylindrical pedestals."""
    cx, cy = -2.68, -0.62
    rx, ry = 0.30, 0.58  # 0.60 x 1.16 m oval tabletop
    z_floor = FLOOR_Z + 0.011  # Rests cleanly on top of living area rug!
    top_z1 = z_floor + 0.36
    top_t = 0.036

    # Smooth beveled stadium-oval tabletop lofted via 3-ring chamfered profile
    oval_2d = _rounded_rect_ring_2d(rx, ry, r=0.26, segs_per_corner=6)
    top_rings = [
        [(cx + px * 0.96, cy + py * 0.96, top_z1 - top_t) for (px, py) in oval_2d],
        [(cx + px, cy + py, top_z1 - top_t * 0.72) for (px, py) in oval_2d],
        [(cx + px, cy + py, top_z1 - top_t * 0.18) for (px, py) in oval_2d],
        [(cx + px * 0.97, cy + py * 0.97, top_z1) for (px, py) in oval_2d],
    ]
    furn.rings(top_rings, color=PAL["oak_light"], tile="wood_oak")

    # Twin fluted cylindrical oak pedestals + dark steel weighted foot rings
    for py in (-0.30, 0.30):
        # Steel foot ring grounded on rug
        _add_turned_cylinder(furn, cx, cy + py, ((0.145, z_floor), (0.145, z_floor + 0.018), (0.132, z_floor + 0.022)), sides=20, color=PAL["iron_matte"], tile="metal_leg_dark")
        # Fluted vertical pillar (14 flutes)
        n_fl = 14
        ring_n = n_fl * 2
        ped_rings = []
        for zv, rad_f in ((z_floor + 0.020, 0.98), (z_floor + 0.035, 1.0), (top_z1 - top_t - 0.012, 1.0), (top_z1 - top_t + 0.004, 0.96)):
            ring = []
            for k in range(ring_n):
                a = TAU * k / ring_n
                r_cur = (0.118 if k % 2 == 0 else 0.106) * rad_f
                ring.append((cx + r_cur * math.cos(a), cy + py + r_cur * math.sin(a), zv))
            ped_rings.append(ring)
        furn.rings(ped_rings, color=PAL["oak_mid"], tile="wood_oak")


def _build_u_shaped_kitchen(furn: MeshGroup) -> None:
    """Build the full Korean ㄷ자 (U-shaped) kitchen: lower cabinets, waterfall quartz top, built-in oven, stools, Bespoke fridge."""
    kick_h = 0.100
    cab_h = 0.730
    top_t = 0.044
    z_cab0 = FLOOR_Z + kick_h
    z_top0 = z_cab0 + cab_h  # FLOOR_Z + 0.830
    z_top1 = z_top0 + top_t  # FLOOR_Z + 0.874 m counter surface!

    # Counter footprint:
    # - North leg (sink under window): X in [+2.02, +3.99], Y in [+1.25, +1.86]
    # - East leg (induction + oven):   X in [+3.37, +3.99], Y in [-1.25, +1.246]
    # - South leg (peninsula bar):     X in [+2.02, +3.366], Y in [-1.25, -0.64]

    # 1) Recessed dark toe-kick plinths under all 3 U-legs
    furn.box((3.01, 1.58, FLOOR_Z + kick_h * 0.5), (1.94, 0.54, kick_h), PAL["iron_matte"], tile="metal_leg_dark", bevel=0.002)
    furn.box((3.70, 0.00, FLOOR_Z + kick_h * 0.5), (0.54, 2.46, kick_h), PAL["iron_matte"], tile="metal_leg_dark", bevel=0.002)
    furn.box((2.70, -0.94, FLOOR_Z + kick_h * 0.5), (1.32, 0.50, kick_h), PAL["iron_matte"], tile="metal_leg_dark", bevel=0.002)

    # 2) North Leg Base Carcass + 3 Framed Drawer/Door Fronts (warm sand-taupe lower cabinetry for rich value separation!)
    furn.box((3.005, 1.57, z_cab0 + cab_h * 0.5), (1.96, 0.57, cab_h), PAL["cabinet_lower"], tile="wood_painted", bevel=0.003)
    for i, dx in enumerate((2.34, 2.94, 3.54)):
        # Doors face South (-Y) toward inner kitchen
        furn.box((dx, 1.268, z_cab0 + cab_h * 0.5), (0.585, 0.022, cab_h - 0.008), PAL["cabinet_lower"], tile="wood_painted", bevel=0.003)
        # J-channel recessed brass-accented handle bar
        furn.box((dx, 1.254, z_top0 - 0.036), (0.18, 0.012, 0.012), PAL["brass"], tile="metal_brass_trim", bevel=0.0015)

    # 3) East Leg Base Carcass + Built-In Oven (under induction at Y = +0.12) + Drawer Stacks
    furn.box((3.69, 0.00, z_cab0 + cab_h * 0.5), (0.57, 2.48, cab_h), PAL["cabinet_lower"], tile="wood_painted", bevel=0.003)
    # South-East & North-East drawer banks (3 stacked beveled drawers each)
    for bank_y in (-0.92, -0.44, 0.80):
        for iz, (dz0, dh) in enumerate(((0.008, 0.25), (0.264, 0.24), (0.510, 0.21))):
            furn.box((3.392, bank_y, z_cab0 + dz0 + dh * 0.5), (0.022, 0.455, dh), PAL["cabinet_lower"], tile="wood_painted", bevel=0.003)
            furn.box((3.376, bank_y, z_cab0 + dz0 + dh - 0.026), (0.012, 0.16, 0.010), PAL["brass"], tile="metal_brass_trim", bevel=0.0015)

    # Built-in Stainless & Obsidian Glass Kitchen Oven at Y = +0.12 (directly under induction!)
    ov_y = 0.12
    furn.box((3.390, ov_y, z_cab0 + cab_h * 0.5), (0.028, 0.60, 0.60), "2C2F35", tile="metal_leg_dark", bevel=0.004)
    # Oven upper control strip + 2 brushed rotary dial knobs
    furn.box((3.372, ov_y, z_cab0 + 0.60), (0.014, 0.58, 0.095), PAL["steel"], tile="metal_leg_steel", bevel=0.002)
    for dy in (-0.19, 0.19):
        furn.rail((3.368, ov_y + dy, z_cab0 + 0.60), (3.346, ov_y + dy, z_cab0 + 0.60), 0.018, PAL["steel_dark"], 12, tile="metal_leg_steel")
    # Recessed black oven window + tubular stainless pull handle
    furn.box((3.374, ov_y, z_cab0 + 0.30), (0.012, 0.48, 0.36), "1B1E23", tile="laminate_matte", bevel=0.002)
    furn.rail((3.336, ov_y - 0.22, z_cab0 + 0.50), (3.336, ov_y + 0.22, z_cab0 + 0.50), 0.010, PAL["steel"], 10, tile="metal_leg_steel")
    for dy in (-0.20, 0.20):
        furn.rail((3.374, ov_y + dy, z_cab0 + 0.50), (3.336, ov_y + dy, z_cab0 + 0.50), 0.008, PAL["steel"], 8, tile="metal_leg_steel")

    # 4) South Peninsula Bar Carcass + Fluted Oak Dining-Side Panel + Waterfall Quartz End
    furn.box((2.71, -0.91, z_cab0 + cab_h * 0.5), (1.30, 0.52, cab_h), PAL["cabinet_cashmere"], tile="wood_painted", bevel=0.003)
    # Inner kitchen-facing peninsula doors
    for dx in (2.34, 2.94):
        furn.box((dx, -0.638, z_cab0 + cab_h * 0.5), (0.58, 0.022, cab_h - 0.008), PAL["cabinet_cashmere"], tile="wood_painted", bevel=0.003)
    # Dining-facing (South) fluted oak architectural slats under counter overhang
    for i in range(28):
        sx = 2.09 + i * 0.045
        if sx < 3.33:
            furn.box((sx, -1.175, z_cab0 + cab_h * 0.5), (0.024, 0.022, cab_h - 0.010), PAL["oak_warm"] if i % 2 == 0 else PAL["oak_mid"], tile="wood_oak", bevel=0.003)

    # 5) Engineered Quartz Countertops (인조대리석 상판) with REAL Sink Basin Cutout at X in [2.36, 3.06], Y in [1.34, 1.78]!
    # 4 watertight surrounding slabs around the sink cutout (ZERO clipping into sunken sink!)
    furn.box((2.19, 1.555, z_top0 + top_t * 0.5), (0.34, 0.62, top_t), PAL["quartz_top"], tile="ceramic_matte", bevel=0.004)  # Left of sink
    furn.box((3.525, 1.555, z_top0 + top_t * 0.5), (0.93, 0.62, top_t), PAL["quartz_top"], tile="ceramic_matte", bevel=0.004)  # Right of sink
    furn.box((2.71, 1.292, z_top0 + top_t * 0.5), (0.706, 0.094, top_t), PAL["quartz_top"], tile="ceramic_matte", bevel=0.003)  # Front lip of sink
    furn.box((2.71, 1.822, z_top0 + top_t * 0.5), (0.706, 0.086, top_t), PAL["quartz_top"], tile="ceramic_matte", bevel=0.003)  # Rear faucet deck
    # East countertop leg
    furn.box((3.68, -0.005, z_top0 + top_t * 0.5), (0.62, 2.49, top_t), PAL["quartz_top"], tile="ceramic_matte", bevel=0.004)
    # South peninsula countertop (extended 14 cm South for casual breakfast bar overhang!)
    furn.box((2.69, -0.97, z_top0 + top_t * 0.5), (1.34, 0.68, top_t), PAL["quartz_top"], tile="ceramic_matte", bevel=0.0045)
    # Waterfall quartz end leg descending cleanly to floor at X = 2.02
    furn.box((2.042, -0.97, FLOOR_Z + (z_top0 - FLOOR_Z) * 0.5), (0.044, 0.674, z_top0 - FLOOR_Z), PAL["quartz_top"], tile="ceramic_matte", bevel=0.004)

    # 6) Two Sleek Counter Bar Stools tucked cleanly along the South peninsula overhang (clear of fridge swing!)
    for bx in (2.30, 2.84):
        by = -1.36
        stool_h = 0.62
        # 4 splayed dark steel legs + circular footrest ring
        for dx, dy in ((-0.14, -0.14), (0.14, -0.14), (-0.14, 0.14), (0.14, 0.14)):
            furn.rail((bx + dx * 1.18, by + dy * 1.18, FLOOR_Z), (bx + dx * 0.85, by + dy * 0.85, FLOOR_Z + stool_h - 0.03), 0.011, PAL["iron_matte"], 8, tile="metal_leg_dark")
        # Footrest horizontal bars
        furn.rail((bx - 0.15, by - 0.15, FLOOR_Z + 0.22), (bx + 0.15, by - 0.15, FLOOR_Z + 0.22), 0.008, PAL["brass"], 8, tile="metal_brass_trim")
        furn.rail((bx - 0.15, by + 0.15, FLOOR_Z + 0.22), (bx + 0.15, by + 0.15, FLOOR_Z + 0.22), 0.008, PAL["brass"], 8, tile="metal_brass_trim")
        # Contoured round oak & linen padded seat
        _add_turned_cylinder(furn, bx, by, ((0.165, FLOOR_Z + stool_h - 0.045), (0.178, FLOOR_Z + stool_h - 0.018), (0.172, FLOOR_Z + stool_h)), sides=18, color=PAL["oak_mid"], tile="wood_oak")
        _add_turned_cylinder(furn, bx, by, ((0.158, FLOOR_Z + stool_h - 0.002), (0.162, FLOOR_Z + stool_h + 0.022), (0.142, FLOOR_Z + stool_h + 0.036)), sides=18, color=PAL["sofa_cream"], tile="fabric_linen")

    # 7) Korean 4-Door Bespoke Double-Door Refrigerator & Tall Housing (양문형 냉장고 + 냉장고장)
    # Positioned at South-East kitchen bay: X in [+3.24, +3.99], Y in [-2.36, -1.40]
    fr_cx, fr_cy = 3.62, -1.88
    fr_d, fr_w = 0.72, 0.90
    fr_h = 1.88
    # Custom tall refrigerator surround cabinet & upper bridge cupboard (Z = 1.94 .. 2.54)
    sur_z_top = CEIL_Z - 0.162
    furn.box((fr_cx, -1.39, FLOOR_Z + (sur_z_top - FLOOR_Z) * 0.5), (fr_d + 0.04, 0.036, sur_z_top - FLOOR_Z), PAL["cabinet_cashmere"], tile="wood_painted", bevel=0.003)
    furn.box((fr_cx, -2.37, FLOOR_Z + (sur_z_top - FLOOR_Z) * 0.5), (fr_d + 0.04, 0.036, sur_z_top - FLOOR_Z), PAL["cabinet_cashmere"], tile="wood_painted", bevel=0.003)
    bridge_z0 = FLOOR_Z + fr_h + 0.03
    bridge_h = sur_z_top - bridge_z0
    furn.box((fr_cx, fr_cy, bridge_z0 + bridge_h * 0.5), (fr_d, fr_w + 0.02, bridge_h), PAL["cabinet_cashmere"], tile="wood_painted", bevel=0.003)
    for dy in (-0.228, 0.228):
        furn.box((fr_cx - fr_d * 0.5 - 0.010, fr_cy + dy, bridge_z0 + bridge_h * 0.5), (0.020, 0.448, bridge_h - 0.006), PAL["cabinet_cashmere"], tile="wood_painted", bevel=0.003)

    # Refrigerator main dark insulated chassis (facing West -X)
    furn.box((fr_cx + 0.03, fr_cy, FLOOR_Z + fr_h * 0.5 + 0.012), (fr_d - 0.07, fr_w - 0.016, fr_h - 0.024), PAL["iron_matte"], tile="metal_leg_dark", bevel=0.004)
    # 4 leveled rubber feet
    for dx in (-0.28, 0.28):
        for dy in (-0.38, 0.38):
            furn.box((fr_cx + dx, fr_cy + dy, FLOOR_Z + 0.012), (0.045, 0.045, 0.024), "282B30", tile="metal_leg_dark", bevel=0.002)

    # 4-door Bespoke flat glass/matte panels with crisp 14 mm horizontal/vertical handle reveal gaps
    door_x = fr_cx - fr_d * 0.5 + 0.022
    # Upper French refrigerator doors (Z = 0.88 .. 1.88, warm satin ivory)
    for dy in (-0.224, 0.224):
        furn.box((door_x, fr_cy + dy, FLOOR_Z + 1.38), (0.046, 0.436, 0.99), PAL["fridge_upper"], tile="laminate_matte", bevel=0.004)
    # Lower freezer doors (Z = 0.03 .. 0.85, muted sage-greige Bespoke lower panels)
    for dy in (-0.224, 0.224):
        furn.box((door_x, fr_cy + dy, FLOOR_Z + 0.44), (0.046, 0.436, 0.82), PAL["fridge_lower"], tile="laminate_matte", bevel=0.004)
    # Recessed ice/water dispenser bezel on left (South) upper door
    furn.box((door_x - 0.022, fr_cy - 0.24, FLOOR_Z + 1.24), (0.012, 0.16, 0.29), PAL["steel_dark"], tile="metal_leg_dark", bevel=0.003)
    furn.box((door_x - 0.027, fr_cy - 0.24, FLOOR_Z + 1.12), (0.014, 0.14, 0.018), PAL["steel"], tile="metal_leg_steel", bevel=0.002)


def _build_dining_set(furn: MeshGroup) -> None:
    """Build a sculpted solid-oak dining table with trestle A-legs and 4 upholstered dining chairs."""
    tcx, tcy = 0.56, -0.45
    tw_x, td_y, th = 0.84, 1.54, 0.74
    top_t = 0.038

    # Rounded-corner beveled oak dining tabletop
    top_2d = _rounded_rect_ring_2d(tw_x * 0.5, td_y * 0.5, r=0.065, segs_per_corner=4)
    z1 = FLOOR_Z + th
    top_rings = [
        [(tcx + px * 0.97, tcy + py * 0.97, z1 - top_t) for (px, py) in top_2d],
        [(tcx + px, tcy + py, z1 - top_t * 0.35) for (px, py) in top_2d],
        [(tcx + px * 0.985, tcy + py * 0.985, z1) for (px, py) in top_2d],
    ]
    furn.rings(top_rings, color=PAL["oak_light"], tile="wood_oak")

    # Architectural splayed A-frame timber trestle legs + center mortised stretcher beam
    for sy in (-0.54, 0.54):
        for sx in (-1, 1):
            furn.timber(
                (tcx + sx * 0.32, tcy + sy, FLOOR_Z),
                (tcx + sx * 0.18, tcy + sy * 0.92, z1 - top_t + 0.004),
                0.048,
                0.056,
                PAL["oak_warm"],
                tile="wood_oak",
                bevel=0.004,
            )
        # Cross tie beam between A-legs
        furn.box((tcx, tcy + sy, FLOOR_Z + 0.22), (0.54, 0.042, 0.042), PAL["oak_warm"], tile="wood_oak", bevel=0.004)
    # Central longitudinal stretcher bar
    furn.box((tcx, tcy, FLOOR_Z + 0.22), (0.048, 1.06, 0.044), PAL["oak_warm"], tile="wood_oak", bevel=0.004)

    # 4 Sculpted Mid-Century Dining Chairs with subtle lived-in yaw variation
    chair_specs = [
        (tcx - 0.56, tcy - 0.36, -math.pi * 0.5 + 0.07),   # West-South chair facing table (+X)
        (tcx - 0.57, tcy + 0.36, -math.pi * 0.5 - 0.09),   # West-North chair facing table (+X)
        (tcx + 0.56, tcy - 0.36, math.pi * 0.5 - 0.06),    # East-South chair facing table (-X)
        (tcx + 0.57, tcy + 0.36, math.pi * 0.5 + 0.08),    # East-North chair facing table (-X)
    ]
    for ch_x, ch_y, yaw in chair_specs:
        _add_dining_chair(furn, (ch_x, ch_y, FLOOR_Z), rot_z=yaw)


def _add_dining_chair(furn: MeshGroup, origin: Tuple[float, float, float], *, rot_z: float = 0.0) -> None:
    """Build a sculpted wooden dining chair facing local -Y (backrest at +Y) with curved back rail."""
    ox, oy, oz = origin

    def _w(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        rx, ry = _rot_xy(lx, ly, rot_z)
        return (ox + rx, oy + ry, oz + lz)

    seat_z = 0.45
    back_z = 0.82

    # 4 splayed tapered round oak legs
    for sx in (-1, 1):
        # Front tapered legs
        furn.rail(_w(sx * 0.20, -0.19, 0.0), _w(sx * 0.17, -0.16, seat_z - 0.02), 0.016, PAL["oak_warm"], 10, tile="wood_oak")
        # Rear continuous angled backrest stiles
        furn.rail(_w(sx * 0.20, 0.21, 0.0), _w(sx * 0.17, 0.17, seat_z), 0.017, PAL["oak_warm"], 10, tile="wood_oak")
        furn.rail(_w(sx * 0.17, 0.17, seat_z - 0.01), _w(sx * 0.19, 0.22, back_z), 0.015, PAL["oak_warm"], 10, tile="wood_oak")
        # Side stretcher bars
        furn.rail(_w(sx * 0.19, -0.18, 0.18), _w(sx * 0.19, 0.19, 0.18), 0.010, PAL["oak_warm"], 8, tile="wood_oak")

    # Under-seat H-stretcher
    furn.rail(_w(-0.18, 0.0, 0.18), _w(0.18, 0.0, 0.18), 0.010, PAL["oak_warm"], 8, tile="wood_oak")

    # Rounded oak seat pan + upholstered linen cushion pad
    _add_cushion_loft(
        furn,
        center=(ox, oy, oz + seat_z - 0.016),
        size=(0.43, 0.42, 0.028),
        corner_r=0.055,
        crown=0.004,
        rot_z=rot_z,
        color=PAL["oak_mid"],
        tile="wood_oak",
    )
    _add_cushion_loft(
        furn,
        center=(ox, oy, oz + seat_z + 0.015),
        size=(0.39, 0.37, 0.036),
        corner_r=0.052,
        crown=0.012,
        rot_z=rot_z,
        color=PAL["sofa_cream"],
        tile="fabric_linen",
    )

    # Curved wrap-around sculptural wooden backrest rail (lofted arc!)
    back_rings: List[List[Tuple[float, float, float]]] = []
    for i in range(11):
        t = -1.0 + 2.0 * (i / 10.0)
        lx = t * 0.215
        ly = 0.225 - 0.065 * (t**2)
        lz_mid = back_z - 0.055
        half_h = 0.052 - 0.010 * (t**2)
        half_t = 0.013
        back_rings.append(
            [
                _w(lx, ly - half_t, lz_mid - half_h),
                _w(lx, ly + half_t, lz_mid - half_h),
                _w(lx, ly + half_t, lz_mid + half_h),
                _w(lx, ly - half_t, lz_mid + half_h),
            ]
        )
    furn.rings(back_rings, color=PAL["oak_mid"], tile="wood_oak")


def build_furniture_hero(furn: MeshGroup) -> None:
    _build_piping_sofa(furn)
    _build_tv_console(furn)
    _build_coffee_table(furn)
    _build_u_shaped_kitchen(furn)
    _build_dining_set(furn)


# ---------------------------------------------------------------------------
# 8. Clutter & Appliance Props (BG_Props_Clutter — Sink/Faucet, Induction,
#    Standing Arc Floor Lamp, Plants, Books, Tableware, Kitchen Appliances)
# ---------------------------------------------------------------------------


def _build_kitchen_sink_and_faucet(props: MeshGroup) -> None:
    """Build deep stainless undermount sink bowl & gooseneck pull-down kitchen faucet."""
    sx, sy = 2.71, 1.56
    z_top = FLOOR_Z + 0.874  # Matches quartz countertop surface
    bw, bd, depth = 0.68, 0.42, 0.20
    wall_t = 0.014

    # Outer beveled rim flange resting cleanly on quartz countertop edge (no coincident corner seams)
    props.box((sx - bw * 0.5 - 0.012, sy, z_top + 0.004), (0.028, bd + 0.048, 0.008), PAL["steel"], tile="steel_brushed", bevel=0.002)
    props.box((sx + bw * 0.5 + 0.012, sy, z_top + 0.004), (0.028, bd + 0.048, 0.008), PAL["steel"], tile="steel_brushed", bevel=0.002)
    props.box((sx, sy - bd * 0.5 - 0.012, z_top + 0.0038), (bw + 0.004, 0.026, 0.0072), PAL["steel"], tile="steel_brushed", bevel=0.0018)
    props.box((sx, sy + bd * 0.5 + 0.012, z_top + 0.0038), (bw + 0.004, 0.026, 0.0072), PAL["steel"], tile="steel_brushed", bevel=0.0018)

    # 4 vertical sunken basin walls + bottom basin floor + central stainless drain strainer
    props.box((sx - bw * 0.5 + wall_t * 0.5, sy, z_top - depth * 0.5), (wall_t, bd, depth), PAL["steel"], tile="steel_brushed", bevel=0.002)
    props.box((sx + bw * 0.5 - wall_t * 0.5, sy, z_top - depth * 0.5), (wall_t, bd, depth), PAL["steel"], tile="steel_brushed", bevel=0.002)
    props.box((sx, sy - bd * 0.5 + wall_t * 0.5, z_top - depth * 0.5), (bw - wall_t * 1.9, wall_t, depth), PAL["steel"], tile="steel_brushed", bevel=0.002)
    props.box((sx, sy + bd * 0.5 - wall_t * 0.5, z_top - depth * 0.5), (bw - wall_t * 1.9, wall_t, depth), PAL["steel"], tile="steel_brushed", bevel=0.002)
    props.box((sx, sy, z_top - depth + wall_t * 0.5), (bw - wall_t * 1.8, bd - wall_t * 1.8, wall_t), "B8BEC4", tile="steel_brushed", bevel=0.002)
    _add_turned_cylinder(props, sx, sy, ((0.056, z_top - depth + wall_t), (0.052, z_top - depth + wall_t + 0.008)), sides=16, color=PAL["steel_dark"], tile="steel_brushed")

    # High-Arc Gooseneck Kitchen Faucet (수전) on rear quartz deck (Y = 1.81)
    fx, fy = sx, 1.81
    _add_turned_cylinder(props, fx, fy, ((0.028, z_top), (0.026, z_top + 0.024), (0.020, z_top + 0.12)), sides=16, color=PAL["steel"], tile="steel_brushed")
    # Single-lever side mixer handle
    props.rail((fx + 0.018, fy, z_top + 0.085), (fx + 0.065, fy, z_top + 0.085), 0.009, PAL["steel"], 10, tile="steel_brushed")
    props.rail((fx + 0.062, fy, z_top + 0.085), (fx + 0.062, fy - 0.068, z_top + 0.115), 0.007, PAL["steel"], 10, tile="steel_brushed")
    # Graceful curved gooseneck spout reaching forward over basin center
    add_pipe_frame(
        props,
        [
            (fx, fy, z_top + 0.115),
            (fx, fy, z_top + 0.37),
            (fx, fy - 0.10, z_top + 0.42),
            (fx, fy - 0.21, z_top + 0.37),
            (fx, fy - 0.22, z_top + 0.26),
        ],
        radius=0.012,
        sides=12,
        bend_subdiv=4,
        bend_radius=0.065,
        flange_ends=False,
        color=PAL["steel"],
        tile="steel_brushed",
    )
    # Pull-down spray nozzle head
    _add_turned_cylinder(props, fx, fy - 0.22, ((0.015, z_top + 0.265), (0.022, z_top + 0.215), (0.019, z_top + 0.205)), sides=14, color=PAL["steel_dark"], tile="steel_brushed")

    # Ceramic dish-soap pump bottle beside faucet
    _add_turned_cylinder(props, sx + 0.44, 1.78, ((0.036, z_top), (0.042, z_top + 0.02), (0.040, z_top + 0.13), (0.016, z_top + 0.155)), sides=14, color=PAL["ceramic_white"], tile="ceramic_gloss")
    props.rail((sx + 0.44, 1.78, z_top + 0.155), (sx + 0.44, 1.78, z_top + 0.185), 0.006, PAL["brass"], 8, tile="brass_polished")
    props.rail((sx + 0.44, 1.78, z_top + 0.182), (sx + 0.44, 1.74, z_top + 0.178), 0.005, PAL["brass"], 8, tile="brass_polished")


def _build_induction_and_cookware(props: MeshGroup) -> None:
    """Build 3-burner ceramic induction cooktop + cast-iron Dutch oven & kettle."""
    ix, iy = 3.66, 0.12
    z_top = FLOOR_Z + 0.874

    # Brushed steel bevel bezel + obsidian ceramic glass induction plate (0.50 x 0.72 m)
    props.box((ix, iy, z_top + 0.004), (0.50, 0.72, 0.008), PAL["steel"], tile="steel_brushed", bevel=0.002)
    props.box((ix, iy, z_top + 0.009), (0.476, 0.696, 0.006), "1B1F25", tile="rubber_dark", bevel=0.0015)

    # 3 subtle raised metallic burner zone indicator rings + touch control strip
    for bx, by, br in ((ix - 0.07, iy - 0.17, 0.105), (ix + 0.08, iy - 0.14, 0.078), (ix - 0.01, iy + 0.16, 0.115)):
        ring_pts = [(bx + br * math.cos(TAU * k / 20), by + br * math.sin(TAU * k / 20), z_top + 0.013) for k in range(20)]
        add_pipe_frame(props, ring_pts, radius=0.0022, sides=6, closed=True, bend_subdiv=1, bend_radius=0.004, flange_ends=False, color="6A727C", tile="aluminum_satin")
    props.box((ix - 0.19, iy, z_top + 0.013), (0.030, 0.24, 0.003), "404750", tile="aluminum_satin", bevel=0.0008)

    # Enameled cast-iron Dutch oven pot sitting on rear burner (ix - 0.01, iy + 0.16)
    px, py = ix - 0.01, iy + 0.16
    pz = z_top + 0.013
    _add_turned_cylinder(
        props,
        px,
        py,
        ((0.105, pz), (0.118, pz + 0.016), (0.122, pz + 0.115), (0.128, pz + 0.124), (0.118, pz + 0.130)),
        sides=20,
        color=PAL["ceramic_terra"],
        tile="enamel_gloss",
    )
    # Domed lid + brushed brass lid knob + twin side loop handles
    _add_turned_cylinder(
        props,
        px,
        py,
        ((0.124, pz + 0.126), (0.112, pz + 0.148), (0.052, pz + 0.160), (0.016, pz + 0.162)),
        sides=20,
        color=PAL["ceramic_terra"],
        tile="enamel_gloss",
    )
    _add_turned_cylinder(props, px, py, ((0.014, pz + 0.160), (0.022, pz + 0.180), (0.018, pz + 0.186)), sides=12, color=PAL["brass"], tile="brass_polished")
    for sy in (-1, 1):
        add_pipe_frame(
            props,
            [(px - 0.03, py + sy * 0.122, pz + 0.10), (px - 0.025, py + sy * 0.155, pz + 0.105), (px + 0.025, py + sy * 0.155, pz + 0.105), (px + 0.03, py + sy * 0.122, pz + 0.10)],
            radius=0.007,
            sides=8,
            bend_subdiv=2,
            bend_radius=0.012,
            flange_ends=False,
            color=PAL["ceramic_terra"],
            tile="enamel_gloss",
        )

    # Kitchen Appliances & Prep Props on East & South Peninsula Counters
    # 1) Designer Pour-Over Electric Kettle on South-East counter (3.62, -0.82)
    kx, ky = 3.64, -0.82
    _add_turned_cylinder(props, kx, ky, ((0.088, z_top), (0.092, z_top + 0.022)), sides=18, color=PAL["iron_matte"], tile="plastic_matte")
    _add_turned_cylinder(props, kx, ky, ((0.082, z_top + 0.022), (0.076, z_top + 0.155), (0.068, z_top + 0.185), (0.056, z_top + 0.194)), sides=18, color="EFECE5", tile="enamel_gloss")
    _add_turned_cylinder(props, kx, ky, ((0.018, z_top + 0.192), (0.022, z_top + 0.212)), sides=12, color=PAL["walnut"], tile="wood_prop")
    # Gooseneck kettle spout & curved handle
    add_pipe_frame(props, [(kx - 0.072, ky, z_top + 0.05), (kx - 0.135, ky, z_top + 0.08), (kx - 0.158, ky, z_top + 0.175), (kx - 0.175, ky, z_top + 0.190)], radius=0.006, sides=8, bend_subdiv=3, bend_radius=0.025, flange_ends=False, color=PAL["steel"], tile="steel_brushed")
    add_pipe_frame(props, [(kx + 0.074, ky, z_top + 0.165), (kx + 0.122, ky, z_top + 0.155), (kx + 0.118, ky, z_top + 0.060), (kx + 0.078, ky, z_top + 0.052)], radius=0.008, sides=8, bend_subdiv=2, bend_radius=0.020, flange_ends=False, color=PAL["iron_matte"], tile="plastic_matte")

    # 2) Compact Espresso Machine on South Peninsula Counter (2.42, -0.94)
    ex, ey = 2.42, -0.94
    props.box((ex, ey, z_top + 0.024), (0.24, 0.28, 0.048), PAL["steel"], tile="steel_brushed", bevel=0.004)  # Drip tray base
    props.box((ex, ey - 0.055, z_top + 0.19), (0.23, 0.17, 0.30), "D5CFC4", tile="enamel_gloss", bevel=0.006)  # Main body
    props.box((ex, ey + 0.055, z_top + 0.295), (0.23, 0.10, 0.085), PAL["steel"], tile="steel_brushed", bevel=0.004)  # Brew head
    _add_turned_cylinder(props, ex, ey + 0.055, ((0.036, z_top + 0.225), (0.036, z_top + 0.255)), sides=14, color=PAL["steel_dark"], tile="steel_brushed")
    props.rail((ex, ey + 0.085, z_top + 0.235), (ex, ey + 0.195, z_top + 0.220), 0.011, PAL["walnut"], 10, tile="wood_prop")  # Portafilter handle
    # Espresso cup sitting on drip tray
    _add_turned_cylinder(props, ex, ey + 0.055, ((0.024, z_top + 0.048), (0.032, z_top + 0.105), (0.028, z_top + 0.105)), sides=14, color=PAL["ceramic_white"], tile="ceramic_gloss")

    # 3) Wooden Cutting Board + Ceramic Utensil Crock on North-East Corner (3.64, 1.02)
    props.box((3.72, 1.02, z_top + 0.012), (0.28, 0.38, 0.024), PAL["oak_warm"], tile="wood_prop", bevel=0.004)
    _add_turned_cylinder(props, 3.82, 0.68, ((0.052, z_top), (0.058, z_top + 0.155), (0.050, z_top + 0.155)), sides=16, color=PAL["ceramic_white"], tile="ceramic_gloss")
    for dx, dy, top_x, top_y in ((-0.01, -0.01, -0.04, -0.03), (0.015, 0.01, 0.04, 0.04), (0.0, 0.015, -0.01, 0.05)):
        props.rail((3.82 + dx, 0.68 + dy, z_top + 0.08), (3.82 + top_x, 0.68 + top_y, z_top + 0.29), 0.007, PAL["oak_mid"], 8, tile="wood_prop")


def _build_standing_floor_lamp(props: MeshGroup) -> None:
    """Build a sculptural arched brushed-brass standing floor lamp framing the South-West sofa reading corner."""
    lx, ly = -1.62, -1.96
    # Heavy cylindrical travertine/marble plinth base grounded cleanly on FLOOR_Z
    _add_turned_cylinder(
        props,
        lx,
        ly,
        ((0.155, FLOOR_Z), (0.155, FLOOR_Z + 0.052), (0.145, FLOOR_Z + 0.062), (0.032, FLOOR_Z + 0.072)),
        sides=20,
        color="E5E0D6",
        tile="stone_prop",
    )
    # Brushed brass arched stem curving gracefully toward the living room sofa armrest
    add_pipe_frame(
        props,
        [
            (lx, ly, FLOOR_Z + 0.062),
            (lx, ly, FLOOR_Z + 1.56),
            (lx + 0.06, ly + 0.16, FLOOR_Z + 1.82),
            (lx + 0.18, ly + 0.34, FLOOR_Z + 1.86),
            (lx + 0.24, ly + 0.42, FLOOR_Z + 1.78),
        ],
        radius=0.011,
        sides=12,
        bend_subdiv=4,
        bend_radius=0.14,
        flange_ends=False,
        color=PAL["brass"],
        tile="brass_polished",
    )
    # Pleated linen bell drum shade hanging at tip of brass arc
    sx, sy = lx + 0.24, ly + 0.42
    sz_top = FLOOR_Z + 1.78
    _add_turned_cylinder(props, sx, sy, ((0.024, sz_top + 0.01), (0.024, sz_top - 0.025)), sides=12, color=PAL["brass"], tile="brass_polished")
    shade_rings = []
    n_pleats = 24
    for zv, r_base in ((sz_top - 0.02, 0.125), (sz_top - 0.14, 0.175), (sz_top - 0.25, 0.220)):
        ring = []
        for k in range(n_pleats * 2):
            a = TAU * k / (n_pleats * 2)
            r_cur = r_base + (0.008 if k % 2 == 0 else -0.006)
            ring.append((sx + r_cur * math.cos(a), sy + r_cur * math.sin(a), zv))
        shade_rings.append(ring)
    # Close inner hollow with top collar & bottom lip (watertight thick drum)
    shade_rings.append([(sx + 0.205 * math.cos(TAU * k / (n_pleats * 2)), sy + 0.205 * math.sin(TAU * k / (n_pleats * 2)), sz_top - 0.25) for k in range(n_pleats * 2)])
    shade_rings.append([(sx + 0.112 * math.cos(TAU * k / (n_pleats * 2)), sy + 0.112 * math.sin(TAU * k / (n_pleats * 2)), sz_top - 0.02) for k in range(n_pleats * 2)])
    props.rings(shade_rings, color="F4EEE2", tile="fabric_prop")


def _build_living_and_dining_props(props: MeshGroup) -> None:
    """Build curated webtoon lived-in props: plants, soundbar, books, tableware, vases."""
    # 1) Hero Indoor Potted Fiddle-Leaf / Monstera Plant in Sunlit North-West Corner
    _add_potted_plant(
        props,
        cx=-3.42,
        cy=1.34,
        z_base=FLOOR_Z,
        pot_radius=0.20,
        pot_height=0.36,
        stand_height=0.14,
        foliage_height=1.08,
        leaf_count=16,
        pot_color="EBE6DC",
    )

    # 2) Secondary Ceramic Planter near South-West Lounge Corner (beside TV wall)
    _add_potted_plant(
        props,
        cx=-3.52,
        cy=-2.18,
        z_base=FLOOR_Z,
        pot_radius=0.14,
        pot_height=0.26,
        stand_height=0.0,
        foliage_height=0.62,
        leaf_count=11,
        pot_color=PAL["ceramic_terra"],
    )

    # 3) Slim Soundbar + Art Books + Ceramic Vase on TV Console Top (Z = FLOOR_Z + 0.440)
    z_tv_top = FLOOR_Z + 0.440
    # Matte charcoal soundbar centered below TV
    props.box((-3.68, -0.43, z_tv_top + 0.032), (0.095, 0.92, 0.064), "282C32", tile="iron_dark", bevel=0.006)
    # Horizontal stacked art books + sculptural vase on North end of TV console
    props.box((-3.74, 0.44, z_tv_top + 0.015), (0.22, 0.30, 0.030), "D8CFC0", tile="paper_label", bevel=0.002)
    props.box((-3.74, 0.43, z_tv_top + 0.042), (0.19, 0.26, 0.024), "8A9689", tile="paper_label", bevel=0.002)
    _add_turned_cylinder(
        props,
        -3.74,
        -1.26,
        ((0.056, z_tv_top), (0.088, z_tv_top + 0.085), (0.072, z_tv_top + 0.175), (0.038, z_tv_top + 0.235), (0.044, z_tv_top + 0.260)),
        sides=18,
        color="EFEAE0",
        tile="ceramic_gloss",
    )

    # 4) Coffee Table Vignette (Z = FLOOR_Z + 0.011 + 0.36 = FLOOR_Z + 0.371)
    z_ct = FLOOR_Z + 0.371
    # Walnut serving tray + ceramic mug & saucer + stacked hardcover books + bud vase
    props.box((-2.68, -0.34, z_ct + 0.010), (0.28, 0.36, 0.016), PAL["walnut"], tile="wood_prop", bevel=0.003)
    # Ceramic mug + handle on tray
    mx, my = -2.64, -0.26
    _add_turned_cylinder(props, mx, my, ((0.036, z_ct + 0.018), (0.040, z_ct + 0.102), (0.034, z_ct + 0.102)), sides=16, color=PAL["ceramic_white"], tile="ceramic_gloss")
    add_pipe_frame(props, [(mx + 0.038, my, z_ct + 0.084), (mx + 0.062, my, z_ct + 0.078), (mx + 0.062, my, z_ct + 0.040), (mx + 0.038, my, z_ct + 0.034)], radius=0.0055, sides=6, bend_subdiv=2, bend_radius=0.010, flange_ends=False, color=PAL["ceramic_white"], tile="ceramic_gloss")
    # Small brass candle jar beside mug
    _add_turned_cylinder(props, -2.73, -0.42, ((0.038, z_ct + 0.018), (0.038, z_ct + 0.095)), sides=16, color=PAL["brass"], tile="brass_polished")
    # Stacked coffee-table art books + sleek TV remote on South half of coffee table
    props.box((-2.68, -0.84, z_ct + 0.014), (0.22, 0.28, 0.028), "E8E0D2", tile="paper_label", bevel=0.002, rot_z=0.08)
    props.box((-2.68, -0.84, z_ct + 0.040), (0.18, 0.24, 0.024), PAL["ceramic_terra"], tile="paper_label", bevel=0.002, rot_z=-0.06)
    props.box((-2.50, -0.64, z_ct + 0.009), (0.044, 0.175, 0.016), "2B2F36", tile="plastic_matte", bevel=0.003, rot_z=0.22)

    # 5) Dining Table Centerpiece & Tableware (Z = FLOOR_Z + 0.740)
    z_dt = FLOOR_Z + 0.740
    tcx, tcy = 0.56, -0.45
    # Woven linen table runner along center of dining table
    props.box((tcx, tcy, z_dt + 0.0025), (0.30, 1.38, 0.005), "E2DACB", tile="fabric_prop", bevel=0.001)
    # Sculpted ceramic fruit bowl + 3 organic fruits at table center
    _add_turned_cylinder(
        props,
        tcx,
        tcy,
        ((0.068, z_dt + 0.005), (0.115, z_dt + 0.035), (0.145, z_dt + 0.082), (0.138, z_dt + 0.085), (0.105, z_dt + 0.042)),
        sides=20,
        color="EFEAE0",
        tile="ceramic_gloss",
    )
    for fx, fy, fz, col in ((0.03, 0.02, 0.055, "DF9C4E"), (-0.04, 0.01, 0.052, "C86C4A"), (0.00, -0.04, 0.060, "8EA25D")):
        _add_turned_cylinder(
            props,
            tcx + fx,
            tcy + fy,
            ((0.014, z_dt + fz - 0.022), (0.034, z_dt + fz - 0.006), (0.036, z_dt + fz + 0.008), (0.024, z_dt + fz + 0.024), (0.008, z_dt + fz + 0.030)),
            sides=12,
            color=col,
            tile="ceramic_gloss",
        )
    # Glass water carafe + 2 tumblers + 2 ceramic dinner plates
    _add_turned_cylinder(props, tcx - 0.04, tcy + 0.34, ((0.048, z_dt + 0.005), (0.056, z_dt + 0.065), (0.034, z_dt + 0.165), (0.042, z_dt + 0.210)), sides=16, color="D6E9F0", tile="glass_prop")
    for gx, gy in ((tcx + 0.12, tcy + 0.28), (tcx - 0.16, tcy - 0.32)):
        _add_turned_cylinder(props, gx, gy, ((0.028, z_dt + 0.005), (0.034, z_dt + 0.095), (0.030, z_dt + 0.095)), sides=14, color="DCECF2", tile="glass_prop")
    for px, py in ((tcx - 0.22, tcy + 0.36), (tcx + 0.22, tcy - 0.36)):
        _add_turned_cylinder(props, px, py, ((0.095, z_dt + 0.005), (0.125, z_dt + 0.018), (0.118, z_dt + 0.021)), sides=20, color=PAL["ceramic_white"], tile="ceramic_gloss")


def build_props_clutter(props: MeshGroup) -> None:
    _build_kitchen_sink_and_faucet(props)
    _build_induction_and_cookware(props)
    _build_standing_floor_lamp(props)
    _build_living_and_dining_props(props)


# ---------------------------------------------------------------------------
# Custom 6-View Webtoon Review Cameras & Canonical Manifest Presets
# ---------------------------------------------------------------------------


def build_review_views() -> List[PreviewCameraView]:
    """Six tailored camera views exposing every wall, fixture, and cutaway plane cleanly."""
    return [
        PreviewCameraView(
            key="front",
            label="1 FRONT CUTAWAY",
            location=(0.0, -7.8, 1.55),
            target=(0.0, 0.35, 1.25),
            lens_mm=30.0,
            hide_nodes=("BG_Wall_South", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="side_kitchen",
            label="2 SIDE KITCHEN",
            location=(-7.2, -0.35, 1.55),
            target=(2.2, -0.20, 1.22),
            lens_mm=30.0,
            hide_nodes=("BG_Wall_West", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="back_entry",
            label="3 BACK ENTRY",
            location=(0.15, 6.8, 1.55),
            target=(0.10, -1.60, 1.25),
            lens_mm=30.0,
            hide_nodes=("BG_Wall_North",),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(-5.8, -5.6, 4.35),
            target=(0.35, 0.10, 0.95),
            lens_mm=32.0,
            # Matches Mobile BG_Cutaway_Front (South + West) + Ceiling cutaway!
            hide_nodes=("BG_Wall_South", "BG_Wall_West", "BG_Ceiling", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="interior_35mm",
            label="5 INTERIOR 35MM",
            location=(1.58, -2.18, 1.48),
            target=(-2.10, 0.35, 1.18),
            lens_mm=30.0,
            # Zero walls hidden: verifies full 4-wall + coffered ceiling interior staging
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(0.35, -5.8, 9.6),
            target=(0.0, 0.25, 0.35),
            lens_mm=30.0,
            hide_nodes=("BG_Ceiling", "BG_Wall_South", "BG_Cutaway_Front"),
        ),
    ]


def build_manifest_cameras() -> Dict[str, Any]:
    """Canonical webtoon shot presets converted to glTF Y-up coordinates (x, z, -y)."""

    def _gltf(p: Tuple[float, float, float]) -> List[float]:
        return [round(p[0], 3), round(p[2], 3), round(-p[1], 3)]

    return {
        "wide28mm": {
            "label": "28mm 실내 광각",
            "position": _gltf((1.65, -2.35, 1.52)),
            "target": _gltf((-2.15, 0.45, 1.22)),
            "lensMm": 28,
        },
        "dialogue35mm": {
            "label": "35mm 대화 투샷",
            "position": _gltf((-2.65, -2.20, 1.44)),
            "target": _gltf((-0.85, 0.15, 1.16)),
            "lensMm": 35,
        },
        "window50mm": {
            "label": "50mm 창가 역광 클로즈업",
            "position": _gltf((-0.90, -1.65, 1.46)),
            "target": _gltf((-1.65, 1.95, 1.32)),
            "lensMm": 50,
        },
    }


# ---------------------------------------------------------------------------
# Main End-to-End Headless Build, Export, Gate 1+2 QA, & Preview Pipeline
# ---------------------------------------------------------------------------


def build_scene_groups() -> HeroSceneGroups:
    groups = HeroSceneGroups()
    build_floor(groups.floor)
    build_wall_north(groups.wall_north)
    build_wall_south(groups.wall_south)
    build_wall_west(groups.wall_west)
    build_wall_east(groups.wall_east)
    build_ceiling(groups.ceiling)
    build_furniture_hero(groups.furniture_hero)
    build_props_clutter(groups.props_clutter)
    groups.ground_to_zero()
    return groups


def main(argv: Sequence[str] | None = None) -> int:
    raw_argv = list(argv) if argv is not None else (sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    parser = argparse.ArgumentParser(description="Build ToonStudio Hero BG3D: kr_modern_apartment_living")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--preview-dir", type=Path, default=DEFAULT_PREVIEW_DIR)
    parser.add_argument("--desktop-primary-size", type=int, default=1024)
    parser.add_argument("--desktop-secondary-size", type=int, default=1024)
    parser.add_argument("--mobile-opaque-size", type=int, default=1024)
    parser.add_argument("--mobile-glass-size", type=int, default=512)
    parser.add_argument("--skip-previews", action="store_true")
    args = parser.parse_args(raw_argv)

    if not bpy.app.background:
        raise RuntimeError("Run this builder inside Blender headless (--background --factory-startup --python-exit-code 42).")

    bpy.ops.wm.read_factory_settings(use_empty=True)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    args.preview_dir.mkdir(parents=True, exist_ok=True)

    groups = build_scene_groups()

    # 1. Assemble, QA-audit, and export Mobile 4-node Hero GLB
    mobile_scene = assemble_mobile_cutaway(
        SLUG,
        groups,
        opaque_size=args.mobile_opaque_size,
        glass_size=args.mobile_glass_size,
        auto_ground=False,
    )
    mobile_blender_qa = audit_blender_scene(mobile_scene.root, profile="mobile")
    if not mobile_blender_qa["passed"]:
        raise RuntimeError(f"Mobile Blender QA failed:\n{json.dumps(mobile_blender_qa['errors'], indent=2)}")

    mobile_glb_path = args.out_dir / f"{SLUG}-mobile.glb"
    mobile_export = export_cutaway_glb(
        mobile_scene,
        mobile_glb_path,
        optimize_meshopt=True,
        copyright_text=DEFAULT_COPYRIGHT,
    )
    _remove_hierarchy(mobile_scene)

    # 2. Assemble, QA-audit, and export Desktop 8-node Hero GLB
    desktop_scene = assemble_desktop_cutaway(
        SLUG,
        groups,
        primary_size=args.desktop_primary_size,
        secondary_size=args.desktop_secondary_size,
        auto_ground=False,
    )
    desktop_blender_qa = audit_blender_scene(desktop_scene.root, profile="desktop")
    if not desktop_blender_qa["passed"]:
        raise RuntimeError(f"Desktop Blender QA failed:\n{json.dumps(desktop_blender_qa['errors'], indent=2)}")

    desktop_glb_path = args.out_dir / f"{SLUG}.glb"
    desktop_export = export_cutaway_glb(
        desktop_scene,
        desktop_glb_path,
        optimize_meshopt=True,
        copyright_text=DEFAULT_COPYRIGHT,
    )

    # 3. Write per-asset manifest JSON (avoid overwriting shared directory manifest when multiple heroes coexist)
    manifest = {
        "assetId": SLUG,
        "cutawayContract": "room-v1",
        "fileName": desktop_export["fileName"],
        "byteSize": desktop_export["byteSize"],
        "sha256": desktop_export["sha256"],
        "bounds": desktop_export["bounds"],
        "nodes": desktop_export["nodeNames"],
        "cameras": build_manifest_cameras(),
        "mobile": {
            "fileName": mobile_export["fileName"],
            "byteSize": mobile_export["byteSize"],
            "sha256": mobile_export["sha256"],
            "nodes": mobile_export["nodeNames"],
        },
    }
    manifest_path = args.out_dir / f"{SLUG}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # 4. Run standalone Gate 2 GLB + gltf-transform validate checks on BOTH outputs
    desktop_glb_qa = inspect_glb(desktop_glb_path, profile="desktop", require_meshopt=True, run_validate=True)
    mobile_glb_qa = inspect_glb(mobile_glb_path, profile="mobile", require_meshopt=True, run_validate=True)

    # Enforce strict prompt file size & triangle targets
    d_tris = desktop_glb_qa["summary"]["triangles"]
    d_bytes = desktop_glb_qa["summary"]["byte_size"]
    m_bytes = mobile_glb_qa["summary"]["byte_size"]
    if not (35_000 <= d_tris <= 120_000):
        raise RuntimeError(f"Desktop triangle count {d_tris} outside target range [35,000, 120,000]")
    if d_bytes > 6 * 1024 * 1024:
        raise RuntimeError(f"Desktop GLB size {d_bytes} bytes exceeds 6 MiB limit")
    if m_bytes > 3 * 1024 * 1024:
        raise RuntimeError(f"Mobile GLB size {m_bytes} bytes exceeds 3 MiB limit")
    if not desktop_glb_qa["passed"]:
        raise RuntimeError(f"Desktop GLB Gate 2 failed:\n{json.dumps(desktop_glb_qa['errors'], indent=2)}")
    if not mobile_glb_qa["passed"]:
        raise RuntimeError(f"Mobile GLB Gate 2 failed:\n{json.dumps(mobile_glb_qa['errors'], indent=2)}")

    # 5. Render 6-view BLENDER_EEVEE contact sheet PNG + Freestyle SVG line art
    preview_report: Dict[str, Any] | None = None
    if not args.skip_previews:
        preview_report = render_hero_review_bundle(
            args.preview_dir,
            SLUG,
            root_obj=desktop_scene.root,
            views=build_review_views(),
            tile_resolution=512,
            interior_cutaway=True,
        )

    qa_bundle = {
        "slug": SLUG,
        "manifestPath": str(manifest_path),
        "desktopBlenderQa": desktop_blender_qa,
        "mobileBlenderQa": mobile_blender_qa,
        "desktopGlbQa": desktop_glb_qa,
        "mobileGlbQa": mobile_glb_qa,
        "preview": preview_report,
    }
    qa_report_path = args.preview_dir / f"{SLUG}-qa-report.json"
    qa_report_path.write_text(json.dumps(qa_bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "slug": SLUG,
                "desktop": {
                    "path": str(desktop_glb_path),
                    "bytes": d_bytes,
                    "mib": round(d_bytes / (1024 * 1024), 3),
                    "triangles": d_tris,
                    "drawCalls": desktop_glb_qa["summary"]["draw_calls"],
                    "materials": desktop_glb_qa["summary"]["materials"],
                    "boundsGltf": desktop_glb_qa["summary"]["bounds_gltf"],
                    "qaPassed": desktop_glb_qa["passed"],
                },
                "mobile": {
                    "path": str(mobile_glb_path),
                    "bytes": m_bytes,
                    "mib": round(m_bytes / (1024 * 1024), 3),
                    "triangles": mobile_glb_qa["summary"]["triangles"],
                    "drawCalls": mobile_glb_qa["summary"]["draw_calls"],
                    "materials": mobile_glb_qa["summary"]["materials"],
                    "boundsGltf": mobile_glb_qa["summary"]["bounds_gltf"],
                    "qaPassed": mobile_glb_qa["passed"],
                },
                "preview": preview_report,
                "qaReport": str(qa_report_path),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
