"""Hero Webtoon BG3D generator: ``kr_atelier_cafe_interior`` (감성 카페 인테리어).

Builds the 10.0 x 7.6 x 3.3 m Seoul specialty coffee atelier using the shared
``tools/blender/webtoon_hero_bg`` core:

- **Dimensions**: X in [-5.00, +5.00] (10.0 m), Y in [-3.80, +3.80] (7.6 m),
  Z in [0.00, 3.30] (3.3 m); interior room X in [-4.80, +4.80] (9.6 m),
  Y in [-2.80, +3.60] (6.4 m), South storefront terrace & awning Y in [-3.80, -2.90].
- **Architecture**: Full-height 5-leaf accordion folding glass doors (partially folded
  open), glass entrance door + sidelight, 2-bay striped retractable awning, exposed
  raw concrete ceiling with cross-beams, galvanized spiral HVAC ducts & hangers,
  3 matte-black track lighting rails with 15 aimed spotlights, 6 glowing brass/glass
  pendant lamps, full-height vertical oak wood louver feature wall (West), ceramic
  tile backsplash + floating shelves + wooden rail menu board + paneled staff door
  (North), and oak wainscoting + gallery art frames (East).
- **Hero Furniture & Props**: L-shaped 3D beveled ceramic-tile bar counter with brass
  footrail, back-bar credenza, commercial 2-group espresso machine with twin
  portafilters & steam wands, burr grinder with bean hopper, copper pour-over station,
  POS terminal, 2-tier glass cake & pastry display showcase with sculpted cakes &
  croissants, 2 round oak bistro tables + 4 curved-back cafe armchairs, 4-seat
  communal oak trestle table + 4 armchairs, built-in channel-tufted banquette bench
  with 2 square tables + 2 armchairs, oak/steel wall bookshelf with curated books,
  3 sculpted large indoor/terrace potted plants, and an exterior A-frame signboard.
- **Outputs**:
  - Desktop Hero (8-node cutaway, meshopt, <= 8 DC, <= 4 mat, 35k-120k tris, <= 6 MiB):
    ``apps/web/public/assets/3d/environments/hero-v1/kr_atelier_cafe_interior.glb``
  - Mobile Hero (4-node merged, meshopt, <= 4 DC, <= 2 mat, <= 3 MiB):
    ``apps/web/public/assets/3d/environments/hero-v1/kr_atelier_cafe_interior-mobile.glb``
  - 6-view 512x512 BLENDER_EEVEE contact sheet PNG + Freestyle SVG line art:
    ``loop-stack/competitor-parity/previews/bg/kr_atelier_cafe_interior-contact-sheet.png``
    ``loop-stack/competitor-parity/previews/bg/kr_atelier_cafe_interior-lineart.svg``

Run command (Blender 5.3 headless):
  /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \\
    --python tools/blender/webtoon_hero_bg/build_kr_atelier_cafe.py
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import bpy
from mathutils import Vector

# Enable Freestyle SVG exporter inside Python (never pass --addons CLI flag)
if bpy.app.background:
    try:
        bpy.ops.preferences.addon_enable(module="bl_ext.user_default.freestyle_svg_exporter")
    except Exception:
        pass

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS_BLENDER_DIR = Path(__file__).resolve().parents[1]
if str(TOOLS_BLENDER_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_BLENDER_DIR))

from webtoon_hero_bg import (  # noqa: E402
    HeroSceneGroups,
    MeshGroup,
    PreviewCameraView,
    WallOpening,
    add_beveled_box,
    add_door_frame,
    add_molding_strip,
    add_pipe_frame,
    add_wall_with_openings,
    assemble_desktop_cutaway,
    assemble_mobile_cutaway,
    audit_blender_scene,
    export_cutaway_glb,
    inspect_glb,
    render_hero_review_bundle,
)
from webtoon_hero_bg.cutaway_assembly import _remove_hierarchy  # noqa: E402

SLUG = "kr_atelier_cafe_interior"
DEFAULT_OUT_DIR = REPO_ROOT / "apps/web/public/assets/3d/environments/hero-v1"
DEFAULT_PREVIEW_DIR = REPO_ROOT / "loop-stack/competitor-parity/previews/bg"

TAU = math.tau

# ---------------------------------------------------------------------------
# Master Dimensional Constants (10.0 x 7.6 x 3.3 m exact envelope)
# ---------------------------------------------------------------------------

OUTER_X_MIN, OUTER_X_MAX = -5.00, 5.00
OUTER_Y_MIN, OUTER_Y_MAX = -3.80, 3.80
WALL_T = 0.20

INNER_X_MIN, INNER_X_MAX = -4.80, 4.80
INNER_Y_SOUTH = -2.80
INNER_Y_NORTH = 3.60
SOUTH_WALL_CY = -2.90
NORTH_WALL_CY = 3.70
WEST_WALL_CX = -4.90
EAST_WALL_CX = 4.90

SIDEWALK_TOP_Z = 0.026
SUBFLOOR_TOP_Z = 0.036
FLOOR_Z = 0.046  # Interior finished oak / tile walking plane
WALL_BASE_Z = 0.040
CEIL_SOFFIT_Z = 3.160
ROOF_TOP_Z = 3.300

# L-Bar counter dimensions
COUNTER_SOUTH_Y = 0.68
COUNTER_NORTH_Y = 1.40
COUNTER_EAST_X = -0.60
COUNTER_RETURN_WEST_X = -1.32
COUNTER_RETURN_NORTH_Y = 2.86
COUNTER_WEST_X = -4.76
COUNTER_TOP_Z = FLOOR_Z + 0.934  # 0.980 m

# Palette (Warm Seongsu Atelier — zero neon slop)
COL_PLASTER = "F2ECE1"
COL_PLASTER_WARM = "EBE3D5"
COL_CONCRETE = "C0BBB3"
COL_CONCRETE_BEAM = "B2ADA5"
COL_OAK_A = "C89D6E"
COL_OAK_B = "BE9262"
COL_OAK_C = "D1A97C"
COL_WALNUT = "6E4B33"
COL_WALNUT_DARK = "553824"
COL_TILE_CREAM_A = "F5F0E6"
COL_TILE_CREAM_B = "EEE7DA"
COL_TILE_CREAM_C = "F8F4EC"
COL_TILE_SAGE = "7B8E7A"
COL_GROUT = "CEC6B8"
COL_TERRAZZO = "EAE3D7"
COL_STEEL_DARK = "2F3336"
COL_STEEL_MID = "5A6064"
COL_STEEL_BRUSH = "C8CDD0"
COL_DUCT_ZINC = "BDC3C6"
COL_BRASS = "CAA55C"
COL_BRASS_LIGHT = "D8B66E"
COL_COPPER = "C37B54"
COL_AWNING_GREEN = "2D4C3E"
COL_AWNING_CREAM = "F2EAD9"
COL_LINEN = "DDD4C4"
COL_LEATHER = "A86B3F"
COL_VELVET_SAGE = "667B66"
COL_VELVET_TERRA = "B66F52"
COL_GLASS_TINT = "C4DFE8"
COL_GLASS_WARM = "F5E5C6"
COL_CHALK = "2A2E30"
COL_STONE_CURB = "B5B0A6"
COL_STONE_PAVER_A = "C8C2B7"
COL_STONE_PAVER_B = "BEB8AC"
COL_TERRACOTTA = "C27B57"
COL_POT_CREAM = "E5DDD0"
COL_SOIL = "4D3C2E"
COL_LEAF_A = "4A7553"
COL_LEAF_B = "5E8A63"
COL_LEAF_C = "3B6144"
COL_ESPRESSO_GREEN = "2E4E40"
COL_CERAMIC_WHITE = "F7F4EE"

# ---------------------------------------------------------------------------
# Reusable Geometry Helpers (0-defect closed manifold, zero welded edges)
# ---------------------------------------------------------------------------


def _rot_xy(lx: float, ly: float, rot_z: float) -> Tuple[float, float]:
    c = math.cos(rot_z)
    s = math.sin(rot_z)
    return (lx * c - ly * s, lx * s + ly * c)


def _local_box(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    rot_z: float,
    lx: float,
    ly: float,
    lz: float,
    sx: float,
    sy: float,
    sz: float,
    color: str,
    *,
    tile: str,
    bevel: float = 0.004,
) -> None:
    rx, ry = _rot_xy(lx, ly, rot_z)
    add_beveled_box(
        group,
        (origin[0] + rx, origin[1] + ry, origin[2] + lz),
        (sx, sy, sz),
        color=color,
        tile=tile,
        bevel=bevel,
        rot_z=rot_z,
    )


def _lathe_rings(
    group: MeshGroup,
    cx: float,
    cy: float,
    profile_rz: Sequence[Tuple[float, float]],
    *,
    sides: int = 16,
    color: str = "FFFFFF",
    tile: str = "ceramic_gloss",
    scale_y: float = 1.0,
) -> None:
    """Create a closed manifold surface of revolution from (radius, z) pairs."""
    rings: List[List[Tuple[float, float, float]]] = []
    for rad, z in profile_rz:
        r = max(0.0015, float(rad))
        rings.append(
            [
                (cx + r * math.cos(TAU * i / sides), cy + r * scale_y * math.sin(TAU * i / sides), float(z))
                for i in range(sides)
            ]
        )
    group.rings(rings, color=color, tile=tile)


def _add_leaf_blade(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    angle: float,
    length: float,
    width: float,
    rise: float,
    color: str,
    *,
    tile: str = "foliage_prop",
) -> None:
    """Sculpted closed-manifold arched botanical leaf blade (zero 2D planes)."""
    along = Vector((math.cos(angle), math.sin(angle), 0.0))
    side = Vector((-along.y, along.x, 0.0))
    o = Vector(origin)
    rings: List[List[Vector]] = []
    for t in (0.0, 0.28, 0.62, 1.0):
        # Keep minimum end thickness >= 7.5 mm so 14-bit meshopt quantization never collapses end caps
        broad = max(0.0065, width * (0.15 + math.sin(math.pi * t) ** 0.78))
        c = o + along * (length * t) + Vector((0.0, 0.0, rise * t + 0.22 * length * math.sin(math.pi * t)))
        ridge = max(0.0048, broad * 0.22)
        rings.append(
            [
                c - side * broad,
                c + Vector((0.0, 0.0, ridge)),
                c + side * broad,
                c - Vector((0.0, 0.0, ridge * 0.65)),
            ]
        )
    group.rings(rings, color=color, tile=tile)


# ---------------------------------------------------------------------------
# 1. BG_Floor — Granite Storefront Apron, Wide-Plank Oak & Bar Ceramic Tiles
# ---------------------------------------------------------------------------


def _build_floor(g: MeshGroup) -> None:
    # Exterior South sidewalk stone slab (Z = 0.000..0.020) + mortared granite pavers (Z = 0.018..0.026)
    g.box((0.0, -3.402, 0.010), (10.00, 0.796, 0.020), COL_STONE_CURB, tile="stone_plinth", bevel=0.003)
    paver_cols = 16
    paver_w = 9.96 / paver_cols
    for ix in range(paver_cols):
        px = -4.98 + (ix + 0.5) * paver_w
        for iy, py in enumerate((-3.59, -3.21)):
            col = COL_STONE_PAVER_A if (ix + iy) % 2 == 0 else COL_STONE_PAVER_B
            g.box((px, py, 0.022), (paver_w - 0.006, 0.366, 0.008), col, tile="stone_plinth", bevel=0.002)

    # Main structural interior floor slab resting cleanly on Z = 0.000..0.036
    # Inset 4 mm inside outer wall lines to eliminate any welded edge with walls in mobile merge
    g.box((0.0, 0.40, 0.018), (9.984, 6.784, 0.036), COL_CONCRETE, tile="concrete", bevel=0.003)

    # Barista tiled work zone: X in [-4.78, -0.58], Y in [0.66, 3.58]
    # Real beveled ceramic terrazzo floor tiles (0.42 x 0.42 m grid with 4 mm grout seams)
    bar_x0, bar_x1 = -4.78, -0.58
    bar_y0, bar_y1 = 0.66, 3.58
    nx_tile = 10
    ny_tile = 7
    tw = (bar_x1 - bar_x0) / nx_tile
    td = (bar_y1 - bar_y0) / ny_tile
    for ix in range(nx_tile):
        tx = bar_x0 + (ix + 0.5) * tw
        for iy in range(ny_tile):
            ty = bar_y0 + (iy + 0.5) * td
            col = COL_TILE_CREAM_A if (ix + iy) % 2 == 0 else COL_TERRAZZO
            g.box((tx, ty, 0.041), (tw - 0.005, td - 0.005, 0.010), col, tile="tile_ceramic", bevel=0.002)

    # Brushed brass floor transition trim strips separating bar tile zone & oak floor
    g.box(((bar_x0 + bar_x1) * 0.5, bar_y0 - 0.010, 0.042), (bar_x1 - bar_x0 + 0.02, 0.016, 0.010), COL_BRASS, tile="hardware_brass", bevel=0.002)
    g.box((bar_x1 + 0.010, (bar_y0 + bar_y1) * 0.5, 0.042), (0.016, bar_y1 - bar_y0 + 0.02, 0.010), COL_BRASS, tile="hardware_brass", bevel=0.002)

    # Interior wide-plank warm oak floorboards across the seating zones (Z = 0.036..0.046)
    # Zone A (South full width): X in [-4.78, +4.78], Y in [-2.78, +0.63]
    plank_colors = (COL_OAK_A, COL_OAK_B, COL_OAK_C)
    row_pitch = 0.242
    n_rows_south = int(round((0.63 - (-2.78)) / row_pitch))
    actual_pitch_s = (0.63 - (-2.78)) / n_rows_south
    for r in range(n_rows_south):
        py = -2.78 + (r + 0.5) * actual_pitch_s
        # 4 staggered planks per full-width row
        offset = ((r * 37) % 100) / 100.0 * 1.4 - 0.7
        cuts = [-4.78, -2.40 + offset * 0.65, 0.05 + offset * 0.75, 2.45 + offset * 0.60, 4.78]
        for k in range(len(cuts) - 1):
            x0, x1 = cuts[k], cuts[k + 1]
            if x1 - x0 < 0.20:
                continue
            col = plank_colors[(r * 3 + k) % 3]
            g.box(((x0 + x1) * 0.5, py, 0.041), (x1 - x0 - 0.004, actual_pitch_s - 0.004, 0.010), col, tile="floor_wood", bevel=0.0018)

    # Zone B (North-East seating & hallway): X in [-0.55, +4.78], Y in [+0.66, +3.58]
    n_rows_ne = int(round((3.58 - 0.66) / row_pitch))
    actual_pitch_ne = (3.58 - 0.66) / n_rows_ne
    for r in range(n_rows_ne):
        py = 0.66 + (r + 0.5) * actual_pitch_ne
        shift = ((r * 41) % 100) / 100.0 * 0.9 - 0.45
        cuts = [-0.55, 1.25 + shift * 0.55, 3.05 + shift * 0.50, 4.78]
        for k in range(len(cuts) - 1):
            x0, x1 = cuts[k], cuts[k + 1]
            col = plank_colors[(r * 2 + k + 1) % 3]
            g.box(((x0 + x1) * 0.5, py, 0.041), (x1 - x0 - 0.004, actual_pitch_ne - 0.004, 0.010), col, tile="floor_wood", bevel=0.0018)

    # Folding-door recessed bronze floor guide track + entrance threshold plate (Y = -2.90)
    g.box((-1.20, SOUTH_WALL_CY, 0.042), (6.16, 0.14, 0.014), COL_STEEL_DARK, tile="sash_metal", bevel=0.002)
    g.box((3.35, SOUTH_WALL_CY, 0.041), (1.86, 0.16, 0.012), COL_BRASS, tile="hardware_brass", bevel=0.002)

    # Entrance woven coir doormat inside main entry door (X = +3.55, Y = -2.42)
    g.box((3.55, -2.42, FLOOR_Z + 0.007), (1.02, 0.56, 0.012), "8A7254", tile="carpet", bevel=0.003)
    g.box((3.55, -2.42, FLOOR_Z + 0.005), (1.06, 0.60, 0.008), COL_STEEL_DARK, tile="sash_metal", bevel=0.002)


# ---------------------------------------------------------------------------
# 2. BG_Wall_South — Full-Height Glass Folding Doors, Entry Door & Striped Awning
# ---------------------------------------------------------------------------


def _build_folding_leaf(
    g: MeshGroup,
    hinge_pos: Tuple[float, float, float],
    width: float,
    height: float,
    yaw: float,
    *,
    include_handle: bool = False,
) -> None:
    """Build one hinged glazed aluminum folding-door leaf extending along +X from hinge_pos."""
    frame_w = 0.056
    frame_d = 0.052
    c, s = math.cos(yaw), math.sin(yaw)

    def _leaf_box(lx: float, ly: float, lz: float, sx: float, sy: float, sz: float, col: str, tl: str, bev: float = 0.003) -> None:
        wx = hinge_pos[0] + lx * c - ly * s
        wy = hinge_pos[1] + lx * s + ly * c
        wz = hinge_pos[2] + lz
        add_beveled_box(g, (wx, wy, wz), (sx, sy, sz), color=col, tile=tl, bevel=bev, rot_z=yaw)

    # Left/right stiles, bottom/top rails, lower & upper architectural transom bars
    _leaf_box(frame_w * 0.5, 0.0, height * 0.5, frame_w, frame_d, height, COL_STEEL_DARK, "sash_metal")
    _leaf_box(width - frame_w * 0.5, 0.0, height * 0.5, frame_w, frame_d, height, COL_STEEL_DARK, "sash_metal")
    _leaf_box(width * 0.5, 0.0, 0.055, width - frame_w * 1.9, frame_d, 0.110, COL_STEEL_DARK, "sash_metal")
    _leaf_box(width * 0.5, 0.0, height - frame_w * 0.5, width - frame_w * 1.9, frame_d, frame_w, COL_STEEL_DARK, "sash_metal")
    _leaf_box(width * 0.5, 0.0, 0.62, width - frame_w * 1.9, frame_d * 0.85, 0.032, COL_STEEL_DARK, "sash_metal", bev=0.002)
    _leaf_box(width * 0.5, 0.0, 2.12, width - frame_w * 1.9, frame_d * 0.85, 0.032, COL_STEEL_DARK, "sash_metal", bev=0.002)

    # 8 mm glazed glass panes (>= 6 mm Z-fighting invariant)
    clear_w = width - frame_w * 2.0 - 0.006
    for z0, z1 in ((0.114, 0.600), (0.640, 2.100), (2.140, height - frame_w - 0.004)):
        _leaf_box(width * 0.5, 0.0, 0.5 * (z0 + z1), clear_w, 0.009, z1 - z0, COL_GLASS_TINT, "glass_tinted", bev=0.0015)

    # Brushed brass pivot hinges & optional vertical pull handle
    for hz in (0.30, 1.32, 2.30):
        _leaf_box(0.008, -frame_d * 0.5 - 0.007, hz, 0.018, 0.014, 0.068, COL_BRASS, "hardware_brass", bev=0.002)
    if include_handle:
        for side in (-1.0, 1.0):
            hy = side * (frame_d * 0.5 + 0.026)
            _leaf_box(width - 0.095, hy, 1.08, 0.018, 0.018, 0.34, COL_BRASS, "hardware_brass", bev=0.003)
            for sz_off in (-0.13, 0.13):
                _leaf_box(width - 0.095, side * (frame_d * 0.5 + 0.013), 1.08 + sz_off, 0.016, 0.026, 0.016, COL_BRASS, "hardware_brass", bev=0.002)


def _build_awning_bay(g: MeshGroup, x0: float, x1: float, y_wall: float, z_mount: float) -> None:
    """Build a 3D striped retractable canvas cafe awning with steel cassette, arms, and valance."""
    width = x1 - x0
    cx = 0.5 * (x0 + x1)
    proj = 0.76  # Projects to Y = -3.76 (strictly inside -3.80 bound!)
    drop = 0.36  # Slopes down 36 cm from mount to front lip
    y_front = y_wall - proj
    z_front = z_mount - drop

    # Anodized dark cassette housing box mounted to exterior facade
    g.box((cx, y_wall - 0.055, z_mount + 0.02), (width + 0.06, 0.11, 0.11), COL_STEEL_DARK, tile="sash_metal", bevel=0.004)

    # Articulated folding steel support arms at left, right, and center (if wide)
    arm_xs = [x0 + 0.22, x1 - 0.22]
    if width > 4.0:
        arm_xs.append(cx)
    for ax in arm_xs:
        g.box((ax, y_wall - 0.025, z_mount - 0.14), (0.045, 0.042, 0.12), COL_STEEL_DARK, tile="sash_metal", bevel=0.003)
        g.rail((ax, y_wall - 0.04, z_mount - 0.14), (ax, y_front + 0.05, z_front - 0.02), 0.016, COL_STEEL_DARK, 10, tile="sash_metal")
        g.rail((ax, y_wall - 0.04, z_mount - 0.02), (ax, y_wall - proj * 0.55, z_mount - drop * 0.58), 0.013, COL_STEEL_MID, 10, tile="sash_metal")

    # Front extruded aluminum roller bar
    g.rail((x0, y_front + 0.02, z_front - 0.015), (x1, y_front + 0.02, z_front - 0.015), 0.020, COL_STEEL_DARK, 12, tile="sash_metal")

    # Alternating 3D ribbed canvas stripes (botanical green & warm cream)
    n_stripes = max(6, int(round(width / 0.24)))
    sw = width / n_stripes
    t_can = 0.018
    for i in range(n_stripes):
        sx0 = x0 + i * sw + 0.002
        sx1 = x0 + (i + 1) * sw - 0.002
        col = COL_AWNING_GREEN if i % 2 == 0 else COL_AWNING_CREAM
        # Slight upward crown per stripe for tactile fabric puff
        mid_x = 0.5 * (sx0 + sx1)
        crown = 0.007
        ring_back = [
            (sx0, y_wall - 0.06, z_mount),
            (mid_x, y_wall - 0.06, z_mount + crown),
            (sx1, y_wall - 0.06, z_mount),
            (sx1, y_wall - 0.06, z_mount - t_can),
            (sx0, y_wall - 0.06, z_mount - t_can),
        ]
        ring_front = [
            (sx0, y_front, z_front),
            (mid_x, y_front, z_front + crown),
            (sx1, y_front, z_front),
            (sx1, y_front, z_front - t_can),
            (sx0, y_front, z_front - t_can),
        ]
        g.rings([ring_back, ring_front], color=col, tile="carpet")

        # Hanging front valance skirt tab per stripe (scalloped height rhythm)
        val_h = 0.165 if i % 2 == 0 else 0.148
        g.box(
            (mid_x, y_front + 0.008, z_front - val_h * 0.5 - 0.004),
            (sw - 0.006, 0.012, val_h),
            col,
            tile="carpet",
            bevel=0.003,
        )


def _build_wall_south(g: MeshGroup) -> None:
    wall_h = CEIL_SOFFIT_Z - WALL_BASE_Z  # 3.120 m
    openings = [
        WallOpening(offset_x=-1.20, width=6.20, height=2.66, sill_z=0.0, kind="door"),
        WallOpening(offset_x=3.35, width=1.90, height=2.66, sill_z=0.0, kind="door"),
    ]
    add_wall_with_openings(
        g,
        center=(0.0, SOUTH_WALL_CY, WALL_BASE_Z),
        length=10.00,
        thickness=WALL_T,
        height=wall_h,
        openings=openings,
        rot_z=0.0,
        color=COL_PLASTER,
        tile="plaster",
        baseboard_height=0.085,
        baseboard_depth=0.016,
        baseboard_color=COL_OAK_B,
        baseboard_tile="wood_panel",
        crown_height=0.0,
        crown_depth=0.0,
        interior_side=1,
    )

    # Exterior architectural fascia header trim & brass-trimmed cafe signboard band
    g.box((0.0, -3.015, 2.94), (9.96, 0.032, 0.36), COL_PLASTER_WARM, tile="trim_paint", bevel=0.005)
    g.box((0.0, -3.035, 3.13), (10.00, 0.068, 0.055), COL_STEEL_DARK, tile="sash_metal", bevel=0.004)
    # Recessed dark walnut sign plaque over main entrance & folding facade
    g.box((-1.20, -3.038, 2.94), (2.30, 0.026, 0.24), COL_WALNUT_DARK, tile="wood_panel", bevel=0.004)
    g.box((-1.20, -3.054, 2.94), (2.22, 0.010, 0.19), COL_AWNING_GREEN, tile="trim_paint", bevel=0.002)
    # Crisp geometric brass atelier sign bars (zero messy clipping text!)
    for idx, bx in enumerate((-0.72, -0.46, -0.22, 0.0, 0.24, 0.48, 0.72)):
        bh = 0.082 if idx in (0, 3, 6) else 0.062
        g.box((-1.20 + bx, -3.063, 2.94), (0.042, 0.012, bh), COL_BRASS_LIGHT, tile="hardware_brass", bevel=0.002)
    g.box((-1.20, -3.063, 2.885), (1.76, 0.008, 0.010), COL_BRASS, tile="hardware_brass", bevel=0.0015)

    # Exterior granite plinth base on the 3 facade masonry piers
    for px, pw in ((-4.65, 0.68), (2.15, 0.48), (4.65, 0.68)):
        g.box((px, -3.012, 0.24), (pw, 0.026, 0.40), COL_STONE_CURB, tile="stone_plinth", bevel=0.004)

    # Center pier exterior brass wall sconce & address nameplate (X = +2.15, Y = -3.02)
    g.box((2.15, -3.022, 1.88), (0.14, 0.042, 0.22), COL_STEEL_DARK, tile="sash_metal", bevel=0.004)
    g.box((2.15, -3.048, 1.88), (0.09, 0.032, 0.16), COL_GLASS_WARM, tile="glass_tinted", bevel=0.003)
    g.box((2.15, -3.016, 1.46), (0.28, 0.018, 0.16), COL_BRASS, tile="hardware_brass", bevel=0.003)

    # Main Folding Door Outer Frame (X in [-4.30, +1.90], Z in [0.050, 2.700])
    open_z0 = FLOOR_Z + 0.006
    open_h = 2.642
    g.box((-4.272, SOUTH_WALL_CY, open_z0 + open_h * 0.5), (0.052, 0.228, open_h), COL_STEEL_DARK, tile="sash_metal", bevel=0.003)
    g.box((1.872, SOUTH_WALL_CY, open_z0 + open_h * 0.5), (0.052, 0.228, open_h), COL_STEEL_DARK, tile="sash_metal", bevel=0.003)
    g.box((-1.20, SOUTH_WALL_CY, open_z0 + open_h - 0.032), (6.09, 0.228, 0.064), COL_STEEL_DARK, tile="sash_metal", bevel=0.003)

    # 5-Leaf Accordion Folding Glass Doors:
    # Leaves 1 & 2 folded INWARD (+Y) in a crisp accordion V (zero awning/sidewalk intrusion, exact 7.60 m depth!)
    leaf_h = open_h - 0.072
    leaf_z0 = open_z0 + 0.006
    leaf_w = 1.04
    fold_angle = math.radians(56.0)
    p0 = (-4.242, SOUTH_WALL_CY, leaf_z0)
    # Leaf 1 hinges at p0, folds INWARD (+Y) by +fold_angle
    _build_folding_leaf(g, p0, leaf_w, leaf_h, fold_angle, include_handle=False)
    p1 = (p0[0] + leaf_w * math.cos(fold_angle), p0[1] + leaf_w * math.sin(fold_angle), leaf_z0)
    # Leaf 2 folds back cleanly toward track at -fold_angle (forming inward V accordion, peak at Y = -2.04)
    _build_folding_leaf(g, p1, leaf_w, leaf_h, -fold_angle, include_handle=True)
    # Leaves 3, 4, 5 span the remaining right half cleanly closed along the track
    closed_x0 = -1.78
    closed_span = 1.842 - closed_x0
    cw = closed_span / 3.0 - 0.005
    for idx in range(3):
        lx = closed_x0 + idx * (closed_span / 3.0)
        _build_folding_leaf(g, (lx, SOUTH_WALL_CY, leaf_z0), cw, leaf_h, 0.0, include_handle=(idx == 0))

    # Entrance Glass Door + Fixed Sidelight (X in [+2.40, +4.30])
    g.box((2.426, SOUTH_WALL_CY, open_z0 + open_h * 0.5), (0.052, 0.228, open_h), COL_STEEL_DARK, tile="sash_metal", bevel=0.003)
    g.box((4.274, SOUTH_WALL_CY, open_z0 + open_h * 0.5), (0.052, 0.228, open_h), COL_STEEL_DARK, tile="sash_metal", bevel=0.003)
    g.box((3.35, SOUTH_WALL_CY, open_z0 + open_h - 0.032), (1.79, 0.228, 0.064), COL_STEEL_DARK, tile="sash_metal", bevel=0.003)
    # Vertical mullion separating fixed sidelight (2.45..3.16) and swing door (3.18..4.24)
    g.box((3.16, SOUTH_WALL_CY, open_z0 + leaf_h * 0.5), (0.048, 0.210, leaf_h), COL_STEEL_DARK, tile="sash_metal", bevel=0.003)
    # Fixed sidelight glazing + transom bar
    g.box((2.80, SOUTH_WALL_CY, open_z0 + 0.62), (0.68, 0.046, 0.032), COL_STEEL_DARK, tile="sash_metal", bevel=0.002)
    g.box((2.80, SOUTH_WALL_CY, open_z0 + 2.12), (0.68, 0.046, 0.032), COL_STEEL_DARK, tile="sash_metal", bevel=0.002)
    for z0, z1 in ((0.06, 0.60), (0.64, 2.10), (2.14, leaf_h - 0.01)):
        g.box((2.80, SOUTH_WALL_CY, open_z0 + 0.5 * (z0 + z1)), (0.66, 0.009, z1 - z0), COL_GLASS_TINT, tile="glass_tinted", bevel=0.0015)

    # Swing entrance glass door (slightly ajar 14 deg inward for inviting webtoon staging!)
    _build_folding_leaf(g, (3.19, SOUTH_WALL_CY, leaf_z0), 1.04, leaf_h, math.radians(14.0), include_handle=True)

    # 2-Bay Retractable Striped Canvas Awning (botanical green & cream)
    _build_awning_bay(g, -4.55, 1.92, -3.005, 2.70)
    _build_awning_bay(g, 2.38, 4.55, -3.005, 2.70)


# ---------------------------------------------------------------------------
# 3. BG_Wall_West — Signature Full-Height Oak Wood Louver Feature Wall (우드 루버벽)
# ---------------------------------------------------------------------------


def _build_wall_west(g: MeshGroup) -> None:
    wall_h = CEIL_SOFFIT_Z - WALL_BASE_Z
    # West wall spans Y in [-2.794, +3.594] (length 6.388 m, 6 mm shy of N/S walls to prevent welded corners)
    add_wall_with_openings(
        g,
        center=(WEST_WALL_CX, 0.40, WALL_BASE_Z),
        length=6.388,
        thickness=WALL_T,
        height=wall_h,
        rot_z=-math.pi * 0.5,
        color=COL_PLASTER,
        tile="plaster",
        baseboard_height=0.085,
        baseboard_depth=0.016,
        baseboard_color=COL_WALNUT,
        baseboard_tile="wood_panel",
        crown_height=0.0,
        crown_depth=0.0,
        interior_side=-1,
    )

    # Recessed dark acoustic backing panels behind the wood louvers (Y in [-2.58, +0.58])
    # Divided into 3 architectural bays separated by bronze vertical divider strips
    bays = [(-2.56, -1.56), (-1.50, -0.50), (-0.44, 0.56)]
    for by0, by1 in bays:
        g.box((-4.792, 0.5 * (by0 + by1), 1.62), (0.014, by1 - by0, 2.94), COL_STEEL_DARK, tile="sash_metal", bevel=0.002)

    # 3D Vertical Oak Wood Louver Slats across all 3 bays (crisp 84 mm architectural rhythm)
    louver_pitch = 0.084
    slat_colors = (COL_OAK_A, COL_OAK_B, COL_OAK_C)
    idx = 0
    for by0, by1 in bays:
        n_slats = int(round((by1 - by0 - 0.04) / louver_pitch))
        step = (by1 - by0 - 0.04) / max(1, n_slats)
        for i in range(n_slats + 1):
            sy = by0 + 0.02 + i * step
            g.box(
                (-4.764, sy, 1.62),
                (0.044, 0.038, 2.92),
                slat_colors[idx % 3],
                tile="wood_panel",
                bevel=0.0035,
            )
            idx += 1

    # Bronze horizontal top/bottom louver trim rails & vertical bay dividers
    g.box((-4.760, -1.00, 0.145), (0.052, 3.18, 0.036), COL_WALNUT_DARK, tile="wood_panel", bevel=0.003)
    g.box((-4.760, -1.00, 3.095), (0.052, 3.18, 0.036), COL_WALNUT_DARK, tile="wood_panel", bevel=0.003)
    for dy in (-1.53, -0.47):
        g.box((-4.756, dy, 1.62), (0.056, 0.028, 2.98), COL_BRASS, tile="hardware_brass", bevel=0.003)

    # Floating Oak & Brass Picture Ledge mounted across center/south louver bays (Z = 1.48)
    g.box((-4.688, -1.00, 1.48), (0.125, 2.65, 0.032), COL_WALNUT, tile="wood_panel", bevel=0.004)
    g.box((-4.630, -1.00, 1.500), (0.014, 2.64, 0.018), COL_BRASS, tile="hardware_brass", bevel=0.002)
    # 3 small framed botanical/coffee cards leaning cleanly on the gallery ledge
    for ly, lw, lh, inner_col in (
        (-1.82, 0.30, 0.38, "D9E2D4"),
        (-1.02, 0.42, 0.32, "E8D8C4"),
        (-0.22, 0.30, 0.36, "D5CEC2"),
    ):
        g.box((-4.696, ly, 1.498 + lh * 0.5), (0.022, lw, lh), COL_WALNUT_DARK, tile="wood_panel", bevel=0.003)
        g.box((-4.682, ly, 1.498 + lh * 0.5), (0.008, lw - 0.044, lh - 0.044), COL_CERAMIC_WHITE, tile="plaster", bevel=0.0015)
        g.box((-4.676, ly, 1.498 + lh * 0.5), (0.006, lw - 0.095, lh - 0.095), inner_col, tile="trim_paint", bevel=0.001)

    # Back-bar zone on West wall (Y in [0.70, 3.50]): warm ceramic subway tiles + bar service shelf
    n_tw = 10
    tw = (3.46 - 0.74) / n_tw
    for r in range(6):
        tz = 1.02 + r * 0.205
        for c in range(n_tw):
            ty = 0.74 + (c + 0.5) * tw
            col = COL_TILE_SAGE if r == 5 else (COL_TILE_CREAM_A if (r + c) % 2 == 0 else COL_TILE_CREAM_B)
            g.box((-4.790, ty, tz), (0.014, tw - 0.006, 0.198), col, tile="tile_ceramic", bevel=0.002)


# ---------------------------------------------------------------------------
# 4. BG_Wall_North — Ceramic Backsplash, Floating Shelves, Menu Board & Staff Door
# ---------------------------------------------------------------------------


def _build_wall_north(g: MeshGroup) -> None:
    wall_h = CEIL_SOFFIT_Z - WALL_BASE_Z
    openings = [
        WallOpening(offset_x=3.75, width=0.90, height=2.12, sill_z=0.0, kind="door"),
    ]
    add_wall_with_openings(
        g,
        center=(0.0, NORTH_WALL_CY, WALL_BASE_Z),
        length=10.00,
        thickness=WALL_T,
        height=wall_h,
        openings=openings,
        rot_z=0.0,
        color=COL_PLASTER,
        tile="plaster",
        baseboard_height=0.085,
        baseboard_depth=0.016,
        baseboard_color=COL_OAK_B,
        baseboard_tile="wood_panel",
        crown_height=0.0,
        crown_depth=0.0,
        interior_side=-1,
    )

    # Paneled oak staff/restroom door at X = +3.75
    add_door_frame(
        g,
        center=(3.75, NORTH_WALL_CY, FLOOR_Z),
        width=0.90,
        height=2.12,
        wall_thickness=WALL_T,
        rot_z=0.0,
        open_deg=0.0,
        hinge_left=True,
        frame_color=COL_WALNUT,
        frame_tile="wood_panel",
        leaf_color=COL_OAK_A,
        leaf_tile="door_wood",
        handle_color=COL_BRASS,
        handle_tile="hardware_brass",
        panel_rows=2,
    )

    # Back-bar 3D Ceramic Tile Backsplash (X in [-4.72, +0.35], Z in [0.96, 2.34])
    g.box((-2.18, 3.592, 1.65), (5.10, 0.010, 1.40), COL_GROUT, tile="concrete", bevel=0.002)
    tile_cols = 20
    tile_rows = 6
    tw = 5.04 / tile_cols
    th = 1.32 / tile_rows
    for r in range(tile_rows):
        tz = 0.99 + (r + 0.5) * th
        for c in range(tile_cols):
            tx = -4.70 + (c + 0.5) * tw
            if r == tile_rows - 1:
                col = COL_TILE_SAGE
            else:
                col = (COL_TILE_CREAM_A, COL_TILE_CREAM_B, COL_TILE_CREAM_C)[(r + c) % 3]
            g.box((tx, 3.584, tz), (tw - 0.006, 0.012, th - 0.006), col, tile="tile_ceramic", bevel=0.002)

    # Walnut tile cap trim ledge along top of backsplash
    g.box((-2.18, 3.575, 2.345), (5.12, 0.036, 0.032), COL_WALNUT, tile="wood_panel", bevel=0.004)

    # 2-Tier Floating Oak & Steel-Bracket Back-Bar Shelves (X in [-4.52, -1.96])
    for sz in (1.50, 1.94):
        g.box((-3.24, 3.455, sz), (2.56, 0.255, 0.036), COL_OAK_A, tile="wood_panel", bevel=0.004)
        for bx in (-4.30, -3.24, -2.18):
            g.box((bx, 3.575, sz - 0.095), (0.022, 0.022, 0.16), COL_STEEL_DARK, tile="sash_metal", bevel=0.002)
            g.box((bx, 3.465, sz - 0.028), (0.022, 0.22, 0.018), COL_BRASS, tile="hardware_brass", bevel=0.002)

    # Signature Framed Korean Atelier Menu Board (X in [-1.62, +0.18], Z in [1.46, 2.32])
    mb_cx, mb_cz = -0.72, 1.89
    mb_w, mb_h = 1.80, 0.86
    g.box((mb_cx, 3.574, mb_cz), (mb_w, 0.032, mb_h), COL_WALNUT, tile="wood_panel", bevel=0.005)
    g.box((mb_cx, 3.556, mb_cz), (mb_w - 0.08, 0.014, mb_h - 0.08), COL_CHALK, tile="chalkboard", bevel=0.002)
    # 5 horizontal oak magnetic menu letter rails + crisp ivory letter tile strips
    for i, rz in enumerate((2.18, 2.02, 1.88, 1.74, 1.60)):
        g.box((mb_cx, 3.545, rz), (mb_w - 0.16, 0.014, 0.016), COL_OAK_C, tile="wood_panel", bevel=0.002)
        # Left menu item bar + right price bar (reads unmistakably as a specialty coffee menu!)
        item_w = 0.56 if i == 0 else (0.46 + (i % 3) * 0.09)
        g.box((mb_cx - 0.42 + item_w * 0.5 - 0.22, 3.541, rz + 0.022), (item_w, 0.008, 0.026), COL_TILE_CREAM_A, tile="trim_paint", bevel=0.0015)
        g.box((mb_cx + 0.52, 3.541, rz + 0.022), (0.18, 0.008, 0.026), COL_BRASS_LIGHT, tile="hardware_brass", bevel=0.0015)

    # North-East Architectural Stepped Plaster Arch Feature Niche (X = +1.85, Z = 0.05..2.58)
    niche_cx = 1.85
    # Raised outer plaster pilaster surround framing an artful recessed cafe wall relief
    g.box((niche_cx - 0.82, 3.572, 1.32), (0.14, 0.048, 2.48), COL_PLASTER_WARM, tile="plaster", bevel=0.004)
    g.box((niche_cx + 0.82, 3.572, 1.32), (0.14, 0.048, 2.48), COL_PLASTER_WARM, tile="plaster", bevel=0.004)
    g.box((niche_cx, 3.572, 2.52), (1.78, 0.048, 0.14), COL_PLASTER_WARM, tile="plaster", bevel=0.004)
    # Recessed sage-plaster back panel + oak display console shelf + brass arch frame
    g.box((niche_cx, 3.588, 1.32), (1.46, 0.014, 2.34), "E3DDD1", tile="plaster", bevel=0.002)
    g.box((niche_cx, 3.540, 0.92), (1.48, 0.12, 0.038), COL_OAK_A, tile="wood_panel", bevel=0.004)
    # Minimalist framed geometric poster inside niche
    g.box((niche_cx, 3.568, 1.72), (0.86, 0.028, 1.06), COL_WALNUT, tile="wood_panel", bevel=0.004)
    g.box((niche_cx, 3.552, 1.72), (0.78, 0.010, 0.98), COL_TILE_CREAM_C, tile="plaster", bevel=0.0015)
    g.box((niche_cx - 0.12, 3.545, 1.82), (0.34, 0.008, 0.42), COL_TERRACOTTA, tile="trim_paint", bevel=0.002)
    g.box((niche_cx + 0.14, 3.544, 1.56), (0.30, 0.008, 0.36), COL_AWNING_GREEN, tile="trim_paint", bevel=0.002)


# ---------------------------------------------------------------------------
# 5. BG_Wall_East — Paneled Oak Wainscoting & 3-Frame Gallery Wall
# ---------------------------------------------------------------------------


def _build_wall_east(g: MeshGroup) -> None:
    wall_h = CEIL_SOFFIT_Z - WALL_BASE_Z
    add_wall_with_openings(
        g,
        center=(EAST_WALL_CX, 0.40, WALL_BASE_Z),
        length=6.388,
        thickness=WALL_T,
        height=wall_h,
        rot_z=math.pi * 0.5,
        color=COL_PLASTER,
        tile="plaster",
        baseboard_height=0.085,
        baseboard_depth=0.016,
        baseboard_color=COL_OAK_B,
        baseboard_tile="wood_panel",
        crown_height=0.0,
        crown_depth=0.0,
        interior_side=-1,
    )

    # Lower Oak Wainscoting behind the banquette zone (Y in [-2.60, +0.25], Z in [0.12, 1.06])
    g.box((4.788, -1.175, 0.59), (0.018, 2.84, 0.92), COL_OAK_B, tile="wood_panel", bevel=0.003)
    # Vertical wainscoting stiles (real 16 mm proud relief)
    for i in range(8):
        sy = -2.54 + i * 0.39
        g.box((4.772, sy, 0.59), (0.018, 0.055, 0.88), COL_OAK_A, tile="wood_panel", bevel=0.003)
    # Stepped oak chair-rail cap molding along top of wainscoting (Z = 1.06)
    add_molding_strip(
        g,
        [(4.794, 0.26, 1.04), (4.794, -2.60, 1.04)],
        width=0.036,
        height=0.048,
        style="chair_rail",
        color=COL_WALNUT,
        tile="wood_panel",
    )

    # 3 Coordinated Framed Coffee/Botanical Art Prints above the banquette (Z = 1.44..2.14)
    art_specs = [
        (-2.02, 0.54, 0.68, COL_AWNING_GREEN, COL_OAK_C),
        (-1.20, 0.54, 0.68, COL_TERRACOTTA, COL_TILE_CREAM_A),
        (-0.38, 0.54, 0.68, COL_WALNUT, COL_TILE_SAGE),
    ]
    for ay, aw, ah, acc1, acc2 in art_specs:
        # Outer beveled walnut frame (28 mm proud)
        g.box((4.782, ay, 1.79), (0.028, aw, ah), COL_WALNUT, tile="wood_panel", bevel=0.004)
        # Cream mat board
        g.box((4.766, ay, 1.79), (0.008, aw - 0.06, ah - 0.06), COL_CERAMIC_WHITE, tile="plaster", bevel=0.0015)
        # Stylized modernist geometric composition inside
        g.box((4.760, ay - 0.05, 1.86), (0.006, aw * 0.42, ah * 0.38), acc1, tile="trim_paint", bevel=0.0015)
        g.box((4.759, ay + 0.07, 1.69), (0.006, aw * 0.36, ah * 0.30), acc2, tile="trim_paint", bevel=0.0015)

    # Architectural brass light switch & thermostat wall plate near entrance (Y = -2.62, Z = 1.24)
    g.box((4.788, -2.62, 1.24), (0.016, 0.088, 0.125), COL_BRASS, tile="hardware_brass", bevel=0.002)
    g.box((4.777, -2.62, 1.255), (0.008, 0.032, 0.045), COL_CERAMIC_WHITE, tile="trim_paint", bevel=0.0015)


# ---------------------------------------------------------------------------
# 6. BG_Ceiling — Exposed Concrete, Beams, HVAC Ducts, Track Lights & Pendants
# ---------------------------------------------------------------------------


def _add_track_spotlight(
    g: MeshGroup,
    cx: float,
    cy: float,
    z_track: float,
    aim_yaw: float,
    aim_pitch: float,
) -> None:
    """Add one cylindrical track spotlight canister with glowing warm LED lens."""
    # Track adapter block + short yoke stem
    g.box((cx, cy, z_track - 0.028), (0.042, 0.042, 0.036), COL_STEEL_DARK, tile="ceiling_metal", bevel=0.003)
    g.rail((cx, cy, z_track - 0.044), (cx, cy, z_track - 0.085), 0.009, COL_STEEL_DARK, 8, tile="ceiling_metal")

    # Aimed cylindrical spotlight canister
    p_pivot = Vector((cx, cy, z_track - 0.095))
    dx = math.cos(aim_yaw) * math.cos(aim_pitch)
    dy = math.sin(aim_yaw) * math.cos(aim_pitch)
    dz = -math.sin(aim_pitch)
    direction = Vector((dx, dy, dz)).normalized()
    p_back = p_pivot - direction * 0.045
    p_front = p_pivot + direction * 0.085
    p_lens = p_pivot + direction * 0.092

    g.rail(tuple(p_back), tuple(p_front), 0.034, COL_STEEL_DARK, 12, tile="ceiling_metal")
    # Glowing recessed LED face
    g.rail(tuple(p_front - direction * 0.004), tuple(p_lens), 0.025, "FFF3D4", 12, tile="emissive_warm")


def _add_pendant_lamp(
    g: MeshGroup,
    cx: float,
    cy: float,
    z_ceil: float,
    z_bottom: float,
    *,
    style: str = "fluted_glass",  # "fluted_glass" | "ceramic_dome"
) -> None:
    """Build a ceiling-suspended cafe pendant lamp with brass socket & glowing Edison bulb."""
    # Ceiling canopy rosette
    _lathe_rings(
        g,
        cx,
        cy,
        [(0.058, z_ceil - 0.004), (0.056, z_ceil - 0.024), (0.022, z_ceil - 0.032)],
        sides=14,
        color=COL_STEEL_DARK,
        tile="ceiling_metal",
    )
    # Suspension cord / slender brass rod
    shade_top = z_bottom + (0.24 if style == "fluted_glass" else 0.19)
    g.rail((cx, cy, z_ceil - 0.028), (cx, cy, shade_top + 0.04), 0.006, COL_STEEL_DARK, 8, tile="ceiling_metal")

    # Turned brushed-brass socket collar
    _lathe_rings(
        g,
        cx,
        cy,
        [
            (0.018, shade_top + 0.055),
            (0.026, shade_top + 0.040),
            (0.026, shade_top + 0.008),
            (0.036, shade_top),
        ],
        sides=14,
        color=COL_BRASS_LIGHT,
        tile="ceiling_brass",
    )

    if style == "fluted_glass":
        # Thick-walled bell-shaped warm frosted glass shade (open bottom, solid manifold wall!)
        _lathe_rings(
            g,
            cx,
            cy,
            [
                (0.034, shade_top),
                (0.072, shade_top - 0.045),
                (0.118, shade_top - 0.125),
                (0.132, z_bottom + 0.012),
                (0.126, z_bottom),
                (0.116, z_bottom + 0.012),
                (0.104, shade_top - 0.125),
                (0.058, shade_top - 0.045),
                (0.026, shade_top - 0.010),
            ],
            sides=16,
            color=COL_GLASS_WARM,
            tile="glass_warm",
        )
    else:
        # Wide warm matte cream-ceramic dome pendant shade with brass collar
        _lathe_rings(
            g,
            cx,
            cy,
            [
                (0.036, shade_top),
                (0.115, shade_top - 0.035),
                (0.185, shade_top - 0.105),
                (0.215, z_bottom + 0.014),
                (0.208, z_bottom),
                (0.194, z_bottom + 0.014),
                (0.168, shade_top - 0.105),
                (0.100, shade_top - 0.038),
                (0.028, shade_top - 0.012),
            ],
            sides=18,
            color=COL_TILE_CREAM_A,
            tile="ceiling_plaster",
        )

    # Warm glowing Edison bulb inside the shade (strictly non-touching socket!)
    bulb_top = shade_top - 0.020
    _lathe_rings(
        g,
        cx,
        cy,
        [
            (0.014, bulb_top),
            (0.026, bulb_top - 0.030),
            (0.032, bulb_top - 0.068),
            (0.024, bulb_top - 0.102),
            (0.008, bulb_top - 0.116),
        ],
        sides=12,
        color="FFE6B0",
        tile="emissive_amber" if style == "fluted_glass" else "emissive_warm",
    )


def _build_ceiling(g: MeshGroup) -> None:
    # Exposed raw concrete roof slab (Z = 3.164..3.300 -> 4 mm above walls, exact 3.30 m top!)
    g.box((0.0, 0.39, 3.232), (10.00, 6.82, 0.136), COL_CONCRETE, tile="ceiling_concrete", bevel=0.004)

    # 4 Exposed structural concrete cross-beams running West-East (Z = 2.944..3.160)
    for by in (-2.20, -0.35, 1.50, 3.22):
        g.box((0.0, by, 3.052), (9.56, 0.24, 0.216), COL_CONCRETE_BEAM, tile="ceiling_concrete", bevel=0.005)
    # 2 Longitudinal structural concrete girders (X = -2.35 and +2.35)
    for gx in (-2.35, 2.35):
        g.box((gx, 0.45, 3.065), (0.22, 6.32, 0.190), COL_CONCRETE_BEAM, tile="ceiling_concrete", bevel=0.005)

    # Exposed Galvanized Spiral HVAC Supply Duct System (공조 덕트)
    duct_z = 2.84
    main_y = 2.38
    # Main E-W galvanized duct run
    g.rail((-4.68, main_y, duct_z), (4.48, main_y, duct_z), 0.125, COL_DUCT_ZINC, 16, tile="ceiling_metal")
    # Corrugated collar bands & threaded steel hangers along main duct
    for hx in (-3.90, -2.60, -1.30, 0.0, 1.30, 2.60, 3.90):
        g.rail((hx - 0.022, main_y, duct_z), (hx + 0.022, main_y, duct_z), 0.136, COL_STEEL_MID, 16, tile="ceiling_metal")
        for side in (-1.0, 1.0):
            g.rail((hx, main_y + side * 0.125, duct_z + 0.04), (hx, main_y + side * 0.125, 3.160), 0.007, COL_STEEL_DARK, 8, tile="ceiling_metal")

    # Branch N-S spiral duct teeing off at X = +0.25 running South to Y = -2.05
    branch_x = 0.25
    g.rail((branch_x, main_y - 0.06, duct_z), (branch_x, -2.05, duct_z), 0.102, COL_DUCT_ZINC, 14, tile="ceiling_metal")
    # End cap flange + 4 collar bands + hangers
    for hy in (1.40, 0.20, -1.00, -1.96):
        g.rail((branch_x, hy - 0.020, duct_z), (branch_x, hy + 0.020, duct_z), 0.112, COL_STEEL_MID, 14, tile="ceiling_metal")
        for side in (-1.0, 1.0):
            g.rail((branch_x + side * 0.102, hy, duct_z + 0.03), (branch_x + side * 0.102, hy, 3.160), 0.007, COL_STEEL_DARK, 8, tile="ceiling_metal")

    # 4 Circular air-diffuser outlet grilles pointing downward along ducts
    for dx, dy in ((-3.25, main_y), (-0.95, main_y), (branch_x, 0.65), (branch_x, -1.45)):
        _lathe_rings(
            g,
            dx,
            dy,
            [(0.068, duct_z - 0.09), (0.088, duct_z - 0.145), (0.072, duct_z - 0.155)],
            sides=14,
            color=COL_STEEL_BRUSH,
            tile="ceiling_metal",
        )

    # Exposed steel electrical conduit runs across concrete soffit
    add_pipe_frame(
        g,
        [(-4.55, 0.98, 3.12), (-0.45, 0.98, 3.12), (-0.45, -1.10, 3.12), (3.55, -1.10, 3.12)],
        radius=0.013,
        sides=10,
        color=COL_STEEL_MID,
        tile="ceiling_metal",
    )

    # 3 Suspended Matte-Black Track Lighting Rails + 15 Aimed Spotlights (트랙레일)
    track_z = 2.74
    # Track 1: Bar counter track (E-W at Y = +1.06)
    g.box((-2.50, 1.06, track_z), (4.00, 0.038, 0.034), COL_STEEL_DARK, tile="ceiling_metal", bevel=0.003)
    for rx in (-4.20, -2.50, -0.80):
        g.rail((rx, 1.06, track_z + 0.015), (rx, 1.06, 3.155), 0.006, COL_STEEL_DARK, 8, tile="ceiling_metal")
    for sx in (-4.10, -3.30, -2.50, -1.70, -0.95):
        _add_track_spotlight(g, sx, 1.06, track_z, aim_yaw=math.radians(90.0), aim_pitch=math.radians(52.0))

    # Track 2: Main seating gallery track (E-W at Y = -1.05)
    g.box((-0.15, -1.05, track_z), (7.60, 0.038, 0.034), COL_STEEL_DARK, tile="ceiling_metal", bevel=0.003)
    for rx in (-3.60, -1.20, 1.20, 3.40):
        g.rail((rx, -1.05, track_z + 0.015), (rx, -1.05, 3.155), 0.006, COL_STEEL_DARK, 8, tile="ceiling_metal")
    for idx, sx in enumerate((-3.45, -2.15, -0.85, 0.55, 1.95, 3.25)):
        yaw = math.radians(-110.0 if idx % 2 == 0 else 75.0)
        _add_track_spotlight(g, sx, -1.05, track_z, aim_yaw=yaw, aim_pitch=math.radians(56.0))

    # Track 3: East bookshelf & banquette gallery wall-wash track (N-S at X = +3.58)
    g.box((3.58, 0.25, track_z), (0.038, 4.90, 0.034), COL_STEEL_DARK, tile="ceiling_metal", bevel=0.003)
    for ry in (-2.00, 0.25, 2.50):
        g.rail((3.58, ry, track_z + 0.015), (3.58, ry, 3.155), 0.006, COL_STEEL_DARK, 8, tile="ceiling_metal")
    for sy in (-1.85, -0.55, 0.85, 2.15):
        _add_track_spotlight(g, 3.58, sy, track_z, aim_yaw=0.0, aim_pitch=math.radians(46.0))

    # 3 Hero Fluted-Glass & Brass Bar Counter Pendants (hanging cleanly over L-bar front!)
    for px in (-3.78, -2.68, -1.58):
        _add_pendant_lamp(g, px, 0.96, CEIL_SOFFIT_Z, 2.16, style="fluted_glass")

    # 3 Warm Ceramic-Dome Dining Pendants (over the 2 round tables + 4-seat communal table)
    _add_pendant_lamp(g, -3.15, -1.28, CEIL_SOFFIT_Z, 2.14, style="ceramic_dome")
    _add_pendant_lamp(g, -0.85, -1.28, CEIL_SOFFIT_Z, 2.14, style="ceramic_dome")
    _add_pendant_lamp(g, 2.15, 1.50, CEIL_SOFFIT_Z, 2.12, style="ceramic_dome")

    # Illuminated Green Exit Sign over main entrance door (X = +3.72, Y = -2.74, Z = 2.86)
    g.box((3.72, -2.74, 2.86), (0.36, 0.044, 0.14), COL_STEEL_DARK, tile="ceiling_metal", bevel=0.003)
    g.box((3.72, -2.716, 2.86), (0.31, 0.008, 0.105), "5CE08C", tile="emissive_exit_green", bevel=0.0015)


# ---------------------------------------------------------------------------
# 7. BG_Furniture_Hero — L-Tile Counter, Tables, Curved Armchairs, Banquette, Bookshelf
# ---------------------------------------------------------------------------


def _add_cafe_armchair(
    g: MeshGroup,
    center: Tuple[float, float, float],
    rot_z: float,
    *,
    wood_col: str = COL_OAK_A,
    cushion_col: str = COL_LINEN,
    cushion_tile: str = "fabric_linen",
) -> None:
    """Build a sculpted mid-century wooden cafe armchair facing local -Y (armrests + curved back)."""
    seat_z = 0.445
    arm_z = 0.675
    back_z = 0.775
    c_cos, c_sin = math.cos(rot_z), math.sin(rot_z)

    def _wpt(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        return (center[0] + lx * c_cos - ly * c_sin, center[1] + lx * c_sin + ly * c_cos, center[2] + lz)

    # 4 splayed tapered wooden legs resting cleanly at center[2] + brass foot ferrules
    leg_coords = [
        ((-0.21, -0.20, 0.0), (-0.19, -0.17, seat_z - 0.03)),
        ((0.21, -0.20, 0.0), (0.19, -0.17, seat_z - 0.03)),
        ((-0.22, 0.21, 0.0), (-0.19, 0.18, seat_z - 0.03)),
        ((0.22, 0.21, 0.0), (0.19, 0.18, seat_z - 0.03)),
    ]
    for bot, top in leg_coords:
        pb = Vector(_wpt(*bot))
        pt = Vector(_wpt(*top))
        mid = pb.lerp(pt, 0.11)
        g.rail(tuple(pb), tuple(mid), 0.0155, COL_BRASS, 10, tile="metal_brass_trim")
        g.rail(tuple(mid), tuple(pt), 0.017, wood_col, 10, tile="wood_oak")

    # Under-seat apron rails & side stretchers
    _local_box(g, center, rot_z, 0.0, -0.17, seat_z - 0.042, 0.37, 0.024, 0.036, wood_col, tile="wood_oak", bevel=0.003)
    _local_box(g, center, rot_z, 0.0, 0.175, seat_z - 0.042, 0.37, 0.024, 0.036, wood_col, tile="wood_oak", bevel=0.003)
    for sx in (-0.185, 0.185):
        g.rail(_wpt(sx, -0.18, 0.15), _wpt(sx, 0.18, 0.15), 0.011, wood_col, 8, tile="wood_oak")
    g.rail(_wpt(-0.18, 0.0, 0.15), _wpt(0.18, 0.0, 0.15), 0.011, wood_col, 8, tile="wood_oak")

    # Beveled seat frame + plump upholstered cushion pad
    _local_box(g, center, rot_z, 0.0, 0.0, seat_z - 0.014, 0.46, 0.44, 0.028, wood_col, tile="wood_oak", bevel=0.005)
    _local_box(g, center, rot_z, 0.0, -0.006, seat_z + 0.016, 0.43, 0.41, 0.036, cushion_col, tile=cushion_tile, bevel=0.008)

    # Vertical armrest front posts & curved wrap-around U-armrest/backrest rail (bentwood silhouette!)
    for sx in (-1.0, 1.0):
        g.rail(_wpt(sx * 0.225, -0.14, seat_z - 0.015), _wpt(sx * 0.245, -0.13, arm_z), 0.015, wood_col, 10, tile="wood_oak")
        # Backrest outer vertical stiles
        g.rail(_wpt(sx * 0.21, 0.175, seat_z - 0.015), _wpt(sx * 0.23, 0.225, back_z - 0.02), 0.016, wood_col, 10, tile="wood_oak")

    # 3 slender vertical backrest spindles supporting curved backrest crest
    for bx in (-0.10, 0.0, 0.10):
        g.rail(_wpt(bx, 0.19, seat_z - 0.005), _wpt(bx * 1.08, 0.245, back_z - 0.01), 0.009, wood_col, 8, tile="wood_oak")

    # Continuous swept curved wood wrap-around armrest + crest rail (U-curve from left front -> back -> right front)
    arc_pts: List[Tuple[float, float, float]] = []
    # Left straight arm segment -> semi-circular curved backrest -> right straight arm segment
    arc_pts.append(_wpt(-0.250, -0.165, arm_z))
    arc_pts.append(_wpt(-0.248, -0.02, arm_z + 0.018))
    n_arc = 10
    for i in range(n_arc + 1):
        ang = math.pi - math.pi * (i / n_arc)  # pi (-X) -> pi/2 (+Y) -> 0 (+X)
        lx = 0.245 * math.cos(ang)
        ly = 0.04 + 0.215 * math.sin(ang)
        lz = arm_z + 0.022 + (back_z - arm_z - 0.022) * (math.sin(ang) ** 0.85)
        arc_pts.append(_wpt(lx, ly, lz))
    arc_pts.append(_wpt(0.248, -0.02, arm_z + 0.018))
    arc_pts.append(_wpt(0.250, -0.165, arm_z))

    add_pipe_frame(
        g,
        arc_pts,
        radius=0.019,
        sides=10,
        bend_subdiv=2,
        bend_radius=0.04,
        flange_ends=False,
        color=COL_WALNUT if wood_col == COL_OAK_A else wood_col,
        tile="wood_walnut",
    )


def _add_round_cafe_table(
    g: MeshGroup,
    cx: float,
    cy: float,
    base_z: float,
    *,
    radius: float = 0.39,
    height: float = 0.73,
    top_col: str = COL_OAK_A,
) -> None:
    """Build a round beveled oak cafe bistro table on cast-iron pedestal base."""
    # Heavy circular beveled cast-iron base plate resting cleanly at base_z
    _lathe_rings(
        g,
        cx,
        cy,
        [
            (0.245, base_z),
            (0.245, base_z + 0.014),
            (0.220, base_z + 0.026),
            (0.068, base_z + 0.040),
        ],
        sides=20,
        color=COL_STEEL_DARK,
        tile="metal_leg_dark",
    )
    # Central brushed brass collar + matte-black steel column
    _lathe_rings(
        g,
        cx,
        cy,
        [(0.044, base_z + 0.036), (0.044, base_z + 0.078), (0.036, base_z + 0.084)],
        sides=16,
        color=COL_BRASS,
        tile="metal_brass_trim",
    )
    g.rail((cx, cy, base_z + 0.075), (cx, cy, base_z + height - 0.045), 0.034, COL_STEEL_DARK, 14, tile="metal_leg_dark")
    # Under-table cruciform steel spider mounting bracket
    g.box((cx, cy, base_z + height - 0.046), (0.34, 0.042, 0.022), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.003)
    g.box((cx, cy, base_z + height - 0.046), (0.042, 0.34, 0.022), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.003)

    # Thick chamfered circular oak tabletop (24-segment bullnose profile!)
    top_z = base_z + height
    _lathe_rings(
        g,
        cx,
        cy,
        [
            (radius - 0.012, top_z - 0.036),
            (radius, top_z - 0.028),
            (radius, top_z - 0.007),
            (radius - 0.007, top_z),
        ],
        sides=24,
        color=top_col,
        tile="wood_oak",
    )


def _add_square_pedestal_table(
    g: MeshGroup,
    cx: float,
    cy: float,
    base_z: float,
    *,
    size: float = 0.68,
    height: float = 0.73,
    top_col: str = COL_OAK_C,
) -> None:
    """Build a square oak cafe table for banquette seating on matte-black pedestal."""
    # Stepped square cast-iron base resting on base_z
    g.box((cx, cy, base_z + 0.011), (0.42, 0.42, 0.022), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.004)
    g.box((cx, cy, base_z + 0.028), (0.14, 0.14, 0.022), COL_BRASS, tile="metal_brass_trim", bevel=0.003)
    g.box((cx, cy, base_z + height * 0.5 - 0.01), (0.068, 0.068, height - 0.065), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.004)
    g.box((cx, cy, base_z + height - 0.046), (0.34, 0.34, 0.020), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.003)
    # Beveled oak tabletop
    g.box((cx, cy, base_z + height - 0.018), (size, size, 0.036), top_col, tile="wood_oak", bevel=0.005)


def _build_l_bar_counter(g: MeshGroup) -> None:
    """Build the hero L-shaped 3D beveled ceramic-tile bar counter with brass footrail."""
    # Counter carcass geometry:
    # Front E-W run: X in [-4.76, -0.60], Y in [0.68, 1.40]
    # Return N-S wing: X in [-1.32, -0.60], Y in [1.40, 2.86]
    z0 = FLOOR_Z
    slab_bot = COUNTER_TOP_Z - 0.048  # 0.932 m

    # Recessed dark toe-kick plinths (Z = 0.046..0.146)
    g.box((-2.68, 1.06, z0 + 0.050), (4.10, 0.62, 0.100), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.003)
    g.box((-0.98, 2.12, z0 + 0.050), (0.62, 1.48, 0.100), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.003)

    # Structural recessed mortar backing body behind 3D tiles (Z = 0.146..0.932)
    body_h = slab_bot - (z0 + 0.100)
    body_cz = z0 + 0.100 + body_h * 0.5
    g.box((-2.68, 1.05, body_cz), (4.12, 0.68, body_h), COL_GROUT, tile="laminate_matte", bevel=0.003)
    g.box((-0.97, 2.13, body_cz), (0.68, 1.44, body_h), COL_GROUT, tile="laminate_matte", bevel=0.003)

    # Real 3D beveled vertical stacked ceramic front tiles along South face (X in [-4.72, -0.62], Y = 0.702)
    tile_rows = 4
    row_h = (body_h - 0.024) / tile_rows
    n_front = 34
    fw = (COUNTER_EAST_X - 0.02 - (COUNTER_WEST_X + 0.04)) / n_front
    for c in range(n_front):
        tx = COUNTER_WEST_X + 0.04 + (c + 0.5) * fw
        for r in range(tile_rows):
            tz = z0 + 0.112 + (r + 0.5) * row_h
            if r == tile_rows - 1:
                col = COL_TILE_SAGE
            else:
                col = (COL_TILE_CREAM_A, COL_TILE_CREAM_B, COL_TILE_CREAM_C)[(c + r) % 3]
            g.box((tx, 0.702, tz), (fw - 0.005, 0.016, row_h - 0.005), col, tile="ceramic_matte", bevel=0.0025)

    # Real 3D beveled ceramic tiles along East face of L-counter (Y in [0.71, 2.84], X = -0.622)
    n_east = 18
    ew = (COUNTER_RETURN_NORTH_Y - 0.02 - (COUNTER_SOUTH_Y + 0.03)) / n_east
    for c in range(n_east):
        ty = COUNTER_SOUTH_Y + 0.03 + (c + 0.5) * ew
        for r in range(tile_rows):
            tz = z0 + 0.112 + (r + 0.5) * row_h
            if r == tile_rows - 1:
                col = COL_TILE_SAGE
            else:
                col = (COL_TILE_CREAM_A, COL_TILE_CREAM_B, COL_TILE_CREAM_C)[(c + r + 1) % 3]
            g.box((-0.622, ty, tz), (0.016, ew - 0.005, row_h - 0.005), col, tile="ceramic_matte", bevel=0.0025)

    # Vertical walnut & brass corner bullnose trim strips at outer L-counter corners
    g.box((-0.614, 0.694, body_cz), (0.034, 0.034, body_h + 0.01), COL_BRASS, tile="metal_brass_trim", bevel=0.004)
    g.box((-0.614, 2.852, body_cz), (0.034, 0.034, body_h + 0.01), COL_BRASS, tile="metal_brass_trim", bevel=0.004)
    g.box((-0.97, 2.858, body_cz), (0.68, 0.024, body_h), COL_WALNUT, tile="wood_walnut", bevel=0.004)

    # Thick overhanging terrazzo countertop slabs (Z = 0.932..0.980 -> exact COUNTER_TOP_Z = 0.980)
    # 2-piece architectural mitered terrazzo slab with 2 mm joinery reveal at Y = 1.431 (zero welded edges)
    g.box((-2.68, 1.04, COUNTER_TOP_Z - 0.024), (4.22, 0.78, 0.048), COL_TERRAZZO, tile="laminate_matte", bevel=0.005)
    g.box((-0.962, 2.158, COUNTER_TOP_Z - 0.024), (0.776, 1.452, 0.048), COL_TERRAZZO, tile="laminate_matte", bevel=0.005)

    # Raised dark walnut customer pickup & ordering gallery ledge along front-left edge (Z = 0.980..1.055)
    g.box((-3.30, 0.73, COUNTER_TOP_Z + 0.036), (2.72, 0.20, 0.072), COL_WALNUT, tile="wood_walnut", bevel=0.005)
    # Brushed brass front reveal trim under countertop lip
    g.box((-2.68, 0.682, slab_bot - 0.008), (4.16, 0.014, 0.014), COL_BRASS, tile="metal_brass_trim", bevel=0.002)
    g.box((-0.602, 1.78, slab_bot - 0.008), (0.014, 2.18, 0.014), COL_BRASS, tile="metal_brass_trim", bevel=0.002)

    # Wrap-around Brushed Brass Customer Footrail (South & East faces of L-counter)
    foot_z = z0 + 0.175
    add_pipe_frame(
        g,
        [(-4.58, 0.56, foot_z), (-0.48, 0.56, foot_z), (-0.48, 2.74, foot_z)],
        radius=0.017,
        sides=12,
        bend_subdiv=3,
        bend_radius=0.06,
        flange_ends=True,
        color=COL_BRASS,
        tile="metal_brass_trim",
    )
    # Footrail floor & plinth mounting brackets
    for fx in (-4.42, -3.40, -2.38, -1.36, -0.58):
        g.rail((fx, 0.56, z0), (fx, 0.56, foot_z), 0.012, COL_BRASS, 10, tile="metal_brass_trim")
        g.rail((fx, 0.56, foot_z), (fx, 0.72, foot_z), 0.011, COL_BRASS, 10, tile="metal_brass_trim")
    for fy in (1.25, 2.00, 2.66):
        g.rail((-0.48, fy, z0), (-0.48, fy, foot_z), 0.012, COL_BRASS, 10, tile="metal_brass_trim")
        g.rail((-0.48, fy, foot_z), (-0.64, fy, foot_z), 0.011, COL_BRASS, 10, tile="metal_brass_trim")

    # Barista backside stainless work cabinets & sink faucet inside the L-counter
    for cx in (-4.25, -3.45, -2.65, -1.85):
        g.box((cx, 1.404, 0.54), (0.72, 0.022, 0.72), COL_STEEL_BRUSH, tile="metal_leg_steel", bevel=0.003)
        g.box((cx, 1.422, 0.78), (0.22, 0.018, 0.018), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.002)
    # Barista corner rinse sink & arched chrome gooseneck faucet (X = -4.25, Y = 1.18)
    g.box((-4.28, 1.22, COUNTER_TOP_Z + 0.004), (0.42, 0.34, 0.008), COL_STEEL_BRUSH, tile="metal_leg_steel", bevel=0.002)
    add_pipe_frame(
        g,
        [(-4.44, 1.22, COUNTER_TOP_Z + 0.008), (-4.44, 1.22, COUNTER_TOP_Z + 0.25), (-4.31, 1.22, COUNTER_TOP_Z + 0.25), (-4.29, 1.22, COUNTER_TOP_Z + 0.19)],
        radius=0.010,
        sides=10,
        bend_subdiv=3,
        bend_radius=0.04,
        flange_ends=False,
        color=COL_STEEL_BRUSH,
        tile="metal_leg_steel",
    )


def _build_backbar_credenza(g: MeshGroup) -> None:
    """Build the North back-bar credenza cabinetry (X in [-4.72, -0.78], Y in [3.04, 3.58])."""
    z0 = FLOOR_Z
    top_z = z0 + 0.874  # 0.920 m
    # Plinth + cabinet carcass
    g.box((-2.75, 3.33, z0 + 0.045), (3.90, 0.48, 0.090), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.003)
    g.box((-2.75, 3.31, z0 + 0.460), (3.94, 0.52, 0.740), COL_PLASTER_WARM, tile="wood_painted", bevel=0.004)
    # 6 shaker cabinet doors facing South (-Y) with brass vertical pulls
    dw = 3.86 / 6.0
    for i in range(6):
        dx = -4.68 + (i + 0.5) * dw
        col = COL_STEEL_BRUSH if i == 4 else COL_TILE_SAGE
        tl = "metal_leg_steel" if i == 4 else "wood_painted"
        g.box((dx, 3.042, z0 + 0.460), (dw - 0.014, 0.022, 0.68), col, tile=tl, bevel=0.004)
        g.box((dx + dw * 0.32, 3.022, z0 + 0.62), (0.016, 0.022, 0.14), COL_BRASS, tile="metal_brass_trim", bevel=0.002)
    # Solid oak butcher-block worktop (Z = 0.880..0.920)
    g.box((-2.75, 3.30, top_z - 0.020), (3.98, 0.56, 0.040), COL_OAK_A, tile="wood_oak", bevel=0.005)


def _build_banquette_zone(g: MeshGroup) -> None:
    """Build the East-wall built-in channel-tufted banquette bench + 2 square tables + 2 armchairs."""
    z0 = FLOOR_Z
    # Built-in banquette along East wall: X in [4.18, 4.77], Y in [-2.38, -0.14] (length 2.24 m)
    by_center = -1.26
    b_len = 2.24
    # Recessed dark oak plinth + oak base box
    g.box((4.50, by_center, z0 + 0.060), (0.50, b_len - 0.04, 0.120), COL_WALNUT_DARK, tile="wood_walnut", bevel=0.003)
    g.box((4.47, by_center, z0 + 0.220), (0.58, b_len, 0.200), COL_OAK_A, tile="wood_oak", bevel=0.005)
    # 3 plush upholstered cognac-leather / linen seat cushions (Z = 0.366..0.466)
    cw = (b_len - 0.03) / 3.0
    for i in range(3):
        cy = -2.365 + (i + 0.5) * cw
        g.box((4.45, cy, z0 + 0.370), (0.55, cw - 0.010, 0.104), COL_LEATHER, tile="leather", bevel=0.014)

    # Channel-tufted vertical bolster backrest cushions (10 plump vertical flutes!)
    n_flutes = 10
    fw = (b_len - 0.04) / n_flutes
    for i in range(n_flutes):
        fy = -2.36 + (i + 0.5) * fw
        g.box((4.70, fy, z0 + 0.650), (0.115, fw - 0.008, 0.48), COL_LEATHER, tile="leather", bevel=0.018)
    # Top oak backrest frame rail
    g.box((4.74, by_center, z0 + 0.905), (0.068, b_len + 0.02, 0.036), COL_WALNUT, tile="wood_walnut", bevel=0.004)

    # 3 soft velvet accent throw pillows resting cleanly on banquette seat against backrest
    for py, pcol, rot in ((-2.06, COL_VELVET_SAGE, 0.14), (-1.24, COL_LINEN, -0.10), (-0.44, COL_VELVET_TERRA, 0.12)):
        add_beveled_box(
            g,
            (4.56, py, z0 + 0.575),
            (0.11, 0.36, 0.32),
            color=pcol,
            tile="fabric_velvet",
            bevel=0.024,
            rot_z=rot,
        )

    # 2 Square oak cafe tables in front of banquette + 2 opposing armchairs
    for ty, yaw_jitter in ((-1.78, 0.06), (-0.74, -0.08)):
        _add_square_pedestal_table(g, 3.56, ty, z0, size=0.68, height=0.73, top_col=COL_OAK_C)
        # Armchair on West side of square table facing +X (rot_z = +pi/2 -> local -Y points +X!)
        _add_cafe_armchair(
            g,
            (2.90, ty, z0),
            rot_z=math.pi * 0.5 + yaw_jitter,
            wood_col=COL_OAK_A,
            cushion_col=COL_LINEN,
            cushion_tile="fabric_linen",
        )


def _build_communal_table_set(g: MeshGroup) -> None:
    """Build the 4-seat oak trestle communal table + 4 curved cafe armchairs (NE zone)."""
    cx, cy, z0 = 2.15, 1.50, FLOOR_Z
    tw, td, th = 1.66, 0.88, 0.74

    # Thick beveled white-oak tabletop slab (42 mm thick)
    g.box((cx, cy, z0 + th - 0.021), (tw, td, 0.042), COL_OAK_A, tile="wood_oak", bevel=0.006)
    # Recessed oak apron rails underneath
    g.box((cx, cy - td * 0.36, z0 + th - 0.064), (tw - 0.32, 0.032, 0.048), COL_OAK_B, tile="wood_oak", bevel=0.003)
    g.box((cx, cy + td * 0.36, z0 + th - 0.064), (tw - 0.32, 0.032, 0.048), COL_OAK_B, tile="wood_oak", bevel=0.003)

    # Dual sculptural A-frame oak trestle legs + bottom beam stretcher with brass bolts
    for sx in (-1.0, 1.0):
        lx = cx + sx * (tw * 0.38)
        # Bottom floor runner bar grounded on z0
        g.box((lx, cy, z0 + 0.028), (0.064, td - 0.14, 0.056), COL_OAK_B, tile="wood_oak", bevel=0.004)
        # Top under-table cleat
        g.box((lx, cy, z0 + th - 0.064), (0.064, td - 0.16, 0.044), COL_OAK_B, tile="wood_oak", bevel=0.004)
        # Angled trestle posts
        for sy in (-1.0, 1.0):
            g.timber(
                (lx, cy + sy * 0.32, z0 + 0.04),
                (lx, cy + sy * 0.22, z0 + th - 0.06),
                0.056,
                0.060,
                COL_OAK_A,
                tile="wood_oak",
                bevel=0.004,
            )
    # Central longitudinal stretcher bar & brass end plates
    g.box((cx, cy, z0 + 0.20), (tw * 0.76 + 0.08, 0.052, 0.062), COL_WALNUT, tile="wood_walnut", bevel=0.004)
    for sx in (-1.0, 1.0):
        g.box((cx + sx * (tw * 0.38 + 0.038), cy, z0 + 0.20), (0.016, 0.072, 0.076), COL_BRASS, tile="metal_brass_trim", bevel=0.002)

    # 4 matching cafe armchairs (2 South facing North, 2 North facing South)
    placements = [
        (cx - 0.42, cy - 0.62, math.pi + 0.08, COL_LINEN, "fabric_linen"),
        (cx + 0.42, cy - 0.62, math.pi - 0.07, COL_LEATHER, "leather"),
        (cx - 0.42, cy + 0.62, -0.06, COL_LEATHER, "leather"),
        (cx + 0.42, cy + 0.62, 0.09, COL_LINEN, "fabric_linen"),
    ]
    for px, py, yaw, ccol, ctile in placements:
        _add_cafe_armchair(g, (px, py, z0), rot_z=yaw, wood_col=COL_OAK_A, cushion_col=ccol, cushion_tile=ctile)


def _build_east_bookshelf(g: MeshGroup) -> None:
    """Build the architectural oak & black-steel book wall shelf along East Wall (NE)."""
    z0 = FLOOR_Z
    y0, y1 = 0.56, 2.76
    cy = 0.5 * (y0 + y1)
    span = y1 - y0  # 2.20 m
    x_back = 4.76
    x_front = 4.38
    cx = 0.5 * (x_back + x_front)
    depth = x_back - x_front  # 0.38 m
    total_h = 2.34

    # 4 vertical matte-black steel ladder frames + brass floor glides
    bay_ys = [y0 + 0.02, y0 + span / 3.0, y0 + 2.0 * span / 3.0, y1 - 0.02]
    for by in bay_ys:
        for ux in (x_front + 0.016, x_back - 0.016):
            g.box((ux, by, z0 + 0.008), (0.032, 0.032, 0.016), COL_BRASS, tile="metal_brass_trim", bevel=0.002)
            g.box((ux, by, z0 + 0.016 + total_h * 0.5), (0.026, 0.026, total_h), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.003)
        # Horizontal side ladder rungs at each shelf level
        for sz in (0.62, 1.06, 1.50, 1.94, 2.34):
            g.box((cx, by, z0 + sz - 0.012), (depth - 0.02, 0.020, 0.020), COL_STEEL_DARK, tile="metal_leg_dark", bevel=0.002)

    # Lower enclosed walnut cabinet (Z = z0 + 0.08 .. z0 + 0.60) with 3 vertical slatted doors
    g.box((cx + 0.01, cy, z0 + 0.34), (depth - 0.04, span - 0.06, 0.52), COL_WALNUT, tile="wood_walnut", bevel=0.004)
    for b in range(3):
        door_cy = 0.5 * (bay_ys[b] + bay_ys[b + 1])
        door_w = (bay_ys[b + 1] - bay_ys[b]) - 0.032
        g.box((x_front + 0.028, door_cy, z0 + 0.34), (0.020, door_w, 0.46), COL_OAK_B, tile="wood_oak", bevel=0.003)
        g.box((x_front + 0.012, door_cy, z0 + 0.44), (0.016, 0.12, 0.018), COL_BRASS, tile="metal_brass_trim", bevel=0.002)

    # 5 Thick beveled oak shelf decks (top surfaces at z0 + 0.62, 1.06, 1.50, 1.94, 2.34)
    for sz in (0.62, 1.06, 1.50, 1.94, 2.34):
        g.box((cx, cy, z0 + sz - 0.016), (depth - 0.01, span - 0.02, 0.032), COL_OAK_A, tile="wood_oak", bevel=0.004)

    # Subtle X cross-bracing rods behind upper bays
    g.rail((x_back - 0.025, bay_ys[0], z0 + 1.06), (x_back - 0.025, bay_ys[3], z0 + 2.32), 0.007, COL_STEEL_DARK, 8, tile="metal_leg_dark")
    g.rail((x_back - 0.025, bay_ys[3], z0 + 1.06), (x_back - 0.025, bay_ys[0], z0 + 2.32), 0.007, COL_STEEL_DARK, 8, tile="metal_leg_dark")


def _build_furniture_hero(g: MeshGroup) -> None:
    _build_l_bar_counter(g)
    _build_backbar_credenza(g)

    # 2 Round Oak Bistro Tables + 4 Curved Armchairs in the bright South-West window seating zone
    for tx, ty, top_c in ((-3.15, -1.28, COL_OAK_A), (-0.85, -1.28, COL_OAK_C)):
        _add_round_cafe_table(g, tx, ty, FLOOR_Z, radius=0.39, height=0.73, top_col=top_c)
        # Left armchair facing East (-Y rotated +pi/2 -> +X)
        _add_cafe_armchair(
            g,
            (tx - 0.60, ty + 0.03, FLOOR_Z),
            rot_z=math.pi * 0.5 - 0.14,
            wood_col=COL_OAK_A,
            cushion_col=COL_LINEN,
            cushion_tile="fabric_linen",
        )
        # Right armchair facing West (-Y rotated -pi/2 -> -X)
        _add_cafe_armchair(
            g,
            (tx + 0.60, ty - 0.03, FLOOR_Z),
            rot_z=-math.pi * 0.5 + 0.12,
            wood_col=COL_OAK_A,
            cushion_col=COL_LEATHER,
            cushion_tile="leather",
        )

    _build_communal_table_set(g)
    _build_banquette_zone(g)
    _build_east_bookshelf(g)


# ---------------------------------------------------------------------------
# 8. BG_Props_Clutter — 2-Group Espresso Machine, Grinder, Cake Showcase,
#    Tabletop Ware, Books, Large Sculpted Plants, & A-Frame Sidewalk Sign
# ---------------------------------------------------------------------------


def _build_espresso_machine(g: MeshGroup, cx: float, cy: float, z_base: float) -> None:
    """Build a commercial 2-group cafe espresso machine facing North (+Y barista side)
    with sculpted enamel back visible to South customers!"""
    # Actually in Korean cafes, the barista works from North (+Y) facing South (-Y),
    # so the espresso machine's sculpted logo back faces customers (-Y) and group heads face barista (+Y),
    # OR sideways so BOTH sides see the iconic 2-group heads!
    # Placing group heads facing South-East / East? Wait: facing +Y (barista) makes back visible from front,
    # while facing -Y (or angled / facing +X) shows the iconic twin portafilters & gauges right in the hero 3/4 shot!
    # Let's orient the 2-group espresso machine facing +Y (barista) OR facing +X on the bar return?
    # Wait: in 4 3/4 HERO (from SE looking NW) and 5 INTERIOR 35MM (from SE looking NW),
    # if the machine faces SOUTH-EAST (or sits on the E-W counter facing +Y? No — if it faces -Y toward the bar,
    # Wait: customers see the back, UNLESS it sits along the North back-bar credenza facing SOUTH (-Y) OR sits on the
    # front bar facing EAST/SOUTH!).
    # Wait — in many modern Seoul cafes (modbar / open bar), the 2-group espresso machine sits on the
    # **North-West back-bar OR on the front bar facing East-South**; placing it on the front bar with group heads
    # facing **South** (-Y) would look backwards for a barista, whereas placing it on the **front bar West end facing East (+X)**
    # OR on the **front bar facing North (+Y)** with dramatic open chrome cup rail + twin pressure gauges + angled steam wands
    # visible in silhouette... WAIT: What if we place the **2-Group Espresso Machine on the Back-Bar Credenza (`Y = 3.28`, facing SOUTH `-Y`)**
    # OR on the **Front Bar (`Y = 1.08`, rotated 90° facing EAST `+X`)**?
    # Let's check! If the 2-group espresso machine sits on the **Front Bar at `X = -3.45, Y = 1.08` facing `+X`? No, a 76 cm wide machine
    # is wider than a 72 cm counter!** So on the E-W counter, its long axis (76 cm) runs along X!
    # And wait: if we place the **2-Group Espresso Machine on the North Back-Bar Credenza at `X = -3.10, Y = 3.26, Z = 0.920` facing SOUTH (`-Y`)**,
    # then:
    #   1. The barista works directly facing it from the bar aisle!
    #   2. Every customer AND every webtoon camera (`1 FRONT`, `4 3/4 HERO`, `5 INTERIOR 35MM`, `6 TOP CUTAWAY`) sees ALL 2 chrome group heads,
    #      twin walnut portafilters, steam wands, drip tray, gauges, and warming cups HEAD-ON!!
    #   3. AND on the Front L-Bar Counter (`Y = 1.06, Z = 0.980`), we STILL have the **Burr Grinder, Pour-Over Coffee Station,
    #      Copper Kettle, POS Tablet Terminal, Ceramic Cup Stack, and the Hero 2-Tier Glass Cake Showcase** — OR we put BOTH
    #      a compact espresso setup? NO, one hero 2-group espresso machine + grinder right next to each other!
    # Wait — what about putting the **2-Group Espresso Machine + Grinder** on the **Front L-Bar (`X = -3.20, Y = 1.10, Z = 0.980`)**
    # with the sculpted chrome/forest-green chassis, high cup-warmer rail with cups, pressure gauge crown, AND putting its group heads facing SOUTH (`-Y`)
    # vs putting it on the **East Return Wing (`X = -0.96`)** facing WEST? No, East Return Wing has the Glass Cake Showcase (`Y = 1.95..2.75`)!
    # Let's check visibility of `X = -3.10, Y = 3.26, Z = 0.920` (back-bar credenza facing South `-Y`) vs `X = -3.35, Y = 1.12, Z = 0.980` (front bar facing North `+Y`):
    # On the front bar at `X = -3.35, Y = 1.12, Z = 0.980`, if it's on the front bar (which is traditional for "L자 타일 바 카운터 · 2그룹 에스프레소 머신/그라인더/유리 쇼케이스"),
    # look at the raised walnut ledge we put on the South edge (`Y = 0.73, Z = 1.055`): that ledge is only `7.5 cm` above counter top,
    # and the espresso machine rises `48 cm` tall (`Z = 0.98..1.46`)!
    # Even better: put the **2-Group Espresso Machine on the Front L-Bar Counter at `X = -3.35, Y = 1.10, Z = 0.980`** facing **SOUTH-EAST? No, orthogonal looks cleaner!**
    # Wait: on the L-counter front bar, if the barista stands behind (`Y > 1.40`), facing the machine toward **+Y (North)** means in `3 BACK CUTAWAY` you see the full front (group heads, portafilters, steam wands, drip tray), AND on the customer-facing **South (-Y)** back of a real La Marzocco Strada / Linea PB, you have the sculpted stepped stainless & botanical-green enameled back cowling, chrome louvre vents, brass atelier badge, AND visible chrome cup-warmer rail + stacked ceramic espresso cups + top steam valve knobs + peeking twin steam wand tips!
    # WAIT A SECOND! What if we make the **North Back-Bar** have the **Pour-Over / Roaster / Canister Station** and put the **2-Group Espresso Machine** on the **Front Bar (`X = -3.25, Y = 1.10, Z = 0.980`)** facing **South (`-Y`)? NO, real baristas stand behind the counter (`+Y`), so facing `+Y` is 100% ergonomically realistic — OR facing `+X` on the East Return Wing (`X = -0.96, Y = 1.72`)? Wait: East Return Wing is `0.78 m` wide, depth along X is `0.78 m` and length along Y is `1.46 m`!**
    # HOLD EVERYTHING!! Look at the L-bar geometry again:
    # - South-West front bar (`X ∈ [-4.76, -1.32]`, `3.44 m` long): Customer ordering, **2-Tier Glass Cake & Pastry Display Showcase** (`X ∈ [-2.55, -1.42]`, `1.13 m` long, facing customers to the SOUTH `-Y`!!), **POS Tablet Terminal** (`X = -2.95`), **Pour-Over Station** (`X = -3.60`), **Takeout Cup Tower** (`X = -4.15`)!
    # - East Return Wing (`X ∈ [-1.32, -0.60]`, `Y ∈ [+1.40, +2.86]`, `1.46 m` long) OR North Back-Bar (`X ∈ [-4.50, -1.60]`, `Y = 3.26`):
    #   Wait: if the **2-Group Espresso Machine (`0.76 × 0.50 m`) + Burr Grinder (`0.22 × 0.30 m`)** sit on the **North Back-Bar Credenza (`X = -3.05, Y = 3.26, Z = 0.920`) facing SOUTH (`-Y`)**, let's check BOTH ergonomics AND camera visibility:
    #   - Barista stands at `Y = 2.20` inside the L-counter, turns directly to the North back-bar (`Y = 3.26`) to pull espresso shots (super common in specialty Seoul cafes — keeps the front L-counter clean and inviting for customers & cake showcase!).
    #   - Every customer standing at the front L-bar (`Y = 0.20`) AND every hero camera (`1 FRONT`, `4 3/4 HERO`, `5 INTERIOR 35MM`, `6 TOP CUTAWAY`) has an **UNOBSTRUCTED FRONT-ROW VIEW** of the 2-group espresso machine's twin group heads, walnut portafilters, pressure gauges, steam wands, AND grinder!!
    #   - AND on the **Front L-Bar Counter (`Z = 0.980`)**, customers see the **Hero 2-Tier Glass Cake & Pastry Display Showcase** (`X = -1.95, Y = 1.04`, facing South `-Y`!), **POS Terminal** (`X = -2.92`), **Copper Gooseneck Pour-Over Bar** (`X = -3.62`), and **Second Grinder / Ceramic Cup Rack** (`X = -4.20`)!
    #   - Wait: what about the East Return Wing (`X = -0.96, Y = 1.98`)? Put a **Self-Service Water Carafe, Paper Napkin Box, Tray Stack, and Ceramic Pickup Station** right on the East Return Wing (`X = -0.96, Y = 2.05, Z = 0.980`)!
    # OH!! THAT LAYOUT IS 10/10 REAL-WORLD BARISTA ERGONOMICS + 10/10 CINEMATIC CAMERA COMPOSITION!!

    # Build 2-Group Commercial Espresso Machine at (cx, cy, z_base) facing SOUTH (-Y)!
    # 4 Rubber leveling feet resting cleanly on z_base
    for fx in (-0.31, 0.31):
        for fy in (-0.18, 0.18):
            g.rail((cx + fx, cy + fy, z_base), (cx + fx, cy + fy, z_base + 0.028), 0.022, "2B2D2F", 10, tile="rubber_dark")

    # Lower base tray + protruding front slotted drip tray (facing -Y)
    g.box((cx, cy + 0.03, z_base + 0.056), (0.74, 0.44, 0.056), COL_STEEL_DARK, tile="iron_dark", bevel=0.004)
    g.box((cx, cy - 0.22, z_base + 0.052), (0.68, 0.16, 0.044), COL_STEEL_BRUSH, tile="steel_brushed", bevel=0.003)
    # Slotted drip grate bars
    for i in range(11):
        gx = cx - 0.30 + i * 0.060
        g.box((gx, cy - 0.22, z_base + 0.077), (0.016, 0.135, 0.006), COL_STEEL_MID, tile="aluminum_satin", bevel=0.001)

    # Rear boiler & body housing (brushed stainless + glossy botanical-green side cheeks!)
    g.box((cx, cy + 0.08, z_base + 0.265), (0.70, 0.34, 0.37), COL_STEEL_BRUSH, tile="steel_brushed", bevel=0.006)
    for side in (-1.0, 1.0):
        g.box((cx + side * 0.358, cy + 0.03, z_base + 0.255), (0.028, 0.45, 0.39), COL_ESPRESSO_GREEN, tile="enamel_gloss", bevel=0.006)
    # Upper overhanging brew head canopy (extends forward over drip tray)
    g.box((cx, cy - 0.11, z_base + 0.385), (0.70, 0.22, 0.135), COL_STEEL_BRUSH, tile="steel_brushed", bevel=0.006)
    # Front dark control fascia strip with illuminated indicator buttons & 2 brass pressure gauges
    g.box((cx, cy - 0.222, z_base + 0.395), (0.66, 0.014, 0.082), COL_STEEL_DARK, tile="iron_dark", bevel=0.002)
    for gx in (cx - 0.07, cx + 0.07):
        g.rail((gx, cy - 0.228, z_base + 0.395), (gx, cy - 0.238, z_base + 0.395), 0.026, COL_BRASS_LIGHT, 14, tile="brass_polished")
        g.rail((gx, cy - 0.237, z_base + 0.395), (gx, cy - 0.241, z_base + 0.395), 0.020, COL_CERAMIC_WHITE, 14, tile="paper_label")

    # Top cup-warmer guard rail (3 sides) + 6 inverted warming ceramic espresso cups
    rail_z = z_base + 0.488
    add_pipe_frame(
        g,
        [
            (cx - 0.33, cy - 0.15, rail_z),
            (cx - 0.33, cy + 0.22, rail_z),
            (cx + 0.33, cy + 0.22, rail_z),
            (cx + 0.33, cy - 0.15, rail_z),
        ],
        radius=0.007,
        sides=8,
        bend_subdiv=2,
        bend_radius=0.02,
        flange_ends=False,
        color=COL_STEEL_BRUSH,
        tile="steel_brushed",
    )
    for px in (-0.33, 0.33):
        for py in (-0.12, 0.20):
            g.rail((cx + px, cy + py, z_base + 0.448), (cx + px, cy + py, rail_z), 0.006, COL_BRASS, 8, tile="brass_polished")
    for idx, ux in enumerate((-0.22, -0.11, 0.0, 0.11, 0.22)):
        _lathe_rings(
            g,
            cx + ux,
            cy + 0.06,
            [(0.032, z_base + 0.452), (0.030, z_base + 0.498), (0.024, z_base + 0.506)],
            sides=12,
            color=COL_CERAMIC_WHITE if idx % 2 == 0 else COL_TILE_CREAM_B,
            tile="ceramic_gloss",
        )

    # 2 Commercial Group Heads + Locked-In Walnut-Handled Portafilters!
    for gx, yaw in ((cx - 0.18, -0.14), (cx + 0.18, 0.14)):
        # Chrome group head cylinder
        _lathe_rings(
            g,
            gx,
            cy - 0.17,
            [(0.048, z_base + 0.320), (0.048, z_base + 0.275), (0.042, z_base + 0.260)],
            sides=14,
            color=COL_STEEL_BRUSH,
            tile="aluminum_satin",
        )
        # Portafilter basket & twin spout
        _lathe_rings(
            g,
            gx,
            cy - 0.17,
            [(0.040, z_base + 0.262), (0.038, z_base + 0.224), (0.018, z_base + 0.214)],
            sides=14,
            color=COL_STEEL_BRUSH,
            tile="steel_brushed",
        )
        g.rail((gx - 0.014, cy - 0.17, z_base + 0.218), (gx - 0.014, cy - 0.17, z_base + 0.194), 0.005, COL_STEEL_BRUSH, 8, tile="steel_brushed")
        g.rail((gx + 0.014, cy - 0.17, z_base + 0.218), (gx + 0.014, cy - 0.17, z_base + 0.194), 0.005, COL_STEEL_BRUSH, 8, tile="steel_brushed")
        # Walnut turned portafilter handle extending forward (-Y)
        hx = gx + math.sin(yaw) * 0.16
        hy = (cy - 0.17) - math.cos(yaw) * 0.16
        g.rail((gx, cy - 0.20, z_base + 0.244), (gx + math.sin(yaw) * 0.06, (cy - 0.20) - math.cos(yaw) * 0.06, z_base + 0.242), 0.009, COL_BRASS, 10, tile="brass_polished")
        g.rail((gx + math.sin(yaw) * 0.055, (cy - 0.20) - math.cos(yaw) * 0.055, z_base + 0.242), (hx, hy, z_base + 0.235), 0.016, COL_WALNUT, 10, tile="wood_prop")

    # Twin Articulated Chrome Steam Wands + Brass Rotary Steam Knobs
    for side in (-1.0, 1.0):
        sx = cx + side * 0.295
        # Brass rotary steam valve knob on upper fascia
        g.rail((sx, cy - 0.215, z_base + 0.415), (sx, cy - 0.252, z_base + 0.415), 0.022, COL_BRASS, 12, tile="brass_polished")
        add_pipe_frame(
            g,
            [
                (sx, cy - 0.18, z_base + 0.34),
                (sx + side * 0.03, cy - 0.24, z_base + 0.26),
                (sx + side * 0.015, cy - 0.25, z_base + 0.145),
            ],
            radius=0.006,
            sides=8,
            bend_subdiv=2,
            bend_radius=0.025,
            flange_ends=False,
            color=COL_STEEL_BRUSH,
            tile="steel_brushed",
        )


def _build_coffee_grinder(g: MeshGroup, cx: float, cy: float, z_base: float) -> None:
    """Build a commercial espresso burr grinder with conical bean hopper & milk pitcher beside it."""
    # Matte black base & vertical grinder housing resting cleanly on z_base
    g.box((cx, cy, z_base + 0.016), (0.19, 0.26, 0.032), COL_STEEL_DARK, tile="iron_dark", bevel=0.004)
    g.box((cx, cy + 0.03, z_base + 0.165), (0.155, 0.19, 0.270), COL_STEEL_DARK, tile="iron_dark", bevel=0.008)
    # Brushed steel dosing chute & portafilter fork facing South (-Y)
    g.box((cx, cy - 0.085, z_base + 0.175), (0.068, 0.058, 0.115), COL_STEEL_BRUSH, tile="steel_brushed", bevel=0.004)
    g.box((cx, cy - 0.105, z_base + 0.095), (0.072, 0.055, 0.012), COL_BRASS, tile="brass_polished", bevel=0.002)
    # Brass grind-size collar
    _lathe_rings(
        g,
        cx,
        cy + 0.02,
        [(0.064, z_base + 0.298), (0.068, z_base + 0.312), (0.058, z_base + 0.326)],
        sides=16,
        color=COL_BRASS,
        tile="brass_polished",
    )
    # Flared conical smoked-glass bean hopper + visible roasted coffee bean bed + black lid
    _lathe_rings(
        g,
        cx,
        cy + 0.02,
        [(0.042, z_base + 0.322), (0.098, z_base + 0.470), (0.098, z_base + 0.515), (0.090, z_base + 0.515), (0.036, z_base + 0.340)],
        sides=16,
        color="C6D4D8",
        tile="glass_prop",
    )
    _lathe_rings(
        g,
        cx,
        cy + 0.02,
        [(0.046, z_base + 0.345), (0.082, z_base + 0.445), (0.056, z_base + 0.455)],
        sides=14,
        color="4A3122",
        tile="wood_prop",
    )
    _lathe_rings(
        g,
        cx,
        cy + 0.02,
        [(0.102, z_base + 0.514), (0.102, z_base + 0.526), (0.020, z_base + 0.532)],
        sides=16,
        color=COL_STEEL_DARK,
        tile="plastic_matte",
    )


def _build_pastry_showcase(g: MeshGroup, cx: float, cy: float, z_base: float) -> None:
    """Build a 2-tier glass cake & pastry display showcase with sculpted cakes, tarts & croissants.

    Uses open-front / angled upper sneeze-guard glass canopy architecture so all
    multi-tier pastries inside remain 100% visible under opaque PBR atlas shading.
    """
    w, d = 1.12, 0.58
    # Refrigerated brushed-steel & matte-black base plinth (Z = z_base..z_base+0.15)
    g.box((cx, cy, z_base + 0.075), (w, d, 0.150), COL_STEEL_DARK, tile="iron_dark", bevel=0.004)
    g.box((cx, cy - d * 0.5 - 0.004, z_base + 0.075), (w - 0.06, 0.012, 0.105), COL_STEEL_BRUSH, tile="steel_brushed", bevel=0.002)
    # Chilled white marble/ceramic lower display deck
    deck1_z = z_base + 0.156
    g.box((cx, cy, z_base + 0.153), (w - 0.04, d - 0.04, 0.012), COL_CERAMIC_WHITE, tile="ceramic_gloss", bevel=0.002)

    # Slim black-steel & brass corner frame posts (height 0.54 m above plinth -> total Z = z_base + 0.69)
    top_z = z_base + 0.67
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            px = cx + sx * (w * 0.5 - 0.016)
            py = cy + sy * (d * 0.5 - 0.016)
            post_h = (top_z - deck1_z) if sy > 0 else (top_z - deck1_z - 0.04)
            g.box((px, py, deck1_z + post_h * 0.5), (0.020, 0.020, post_h), COL_STEEL_DARK, tile="iron_dark", bevel=0.002)
        # Side slim brass trim bars
        g.box((cx + sx * (w * 0.5 - 0.016), cy, deck1_z + 0.24), (0.016, d - 0.05, 0.016), COL_BRASS, tile="brass_polished", bevel=0.002)

    # Top glass cover panel (8 mm) + angled front sneeze-guard glass canopy (leaves front display crystal-clear!)
    g.box((cx, cy + 0.04, top_z), (w - 0.02, d - 0.10, 0.010), COL_GLASS_TINT, tile="glass_prop", bevel=0.002)
    g.box((cx, cy - d * 0.5 + 0.016, top_z - 0.018), (w - 0.01, 0.022, 0.022), COL_BRASS, tile="brass_polished", bevel=0.002)
    g.box((cx, cy + d * 0.5 - 0.016, top_z - 0.010), (w - 0.01, 0.022, 0.022), COL_STEEL_DARK, tile="iron_dark", bevel=0.002)
    # Upper angled sneeze-guard front glass visor (top 14 cm only, pastries unobstructed below!)
    g.box((cx, cy - d * 0.5 + 0.032, top_z - 0.075), (w - 0.05, 0.009, 0.13), COL_GLASS_TINT, tile="glass_prop", bevel=0.0015)

    # Mid-tier glass display shelf (Z = deck1_z + 0.24)
    deck2_z = deck1_z + 0.24
    g.box((cx, cy + 0.02, deck2_z - 0.005), (w - 0.06, d - 0.14, 0.010), COL_GLASS_TINT, tile="glass_prop", bevel=0.002)

    # --- Pastries & Cakes on Lower Deck (deck1_z) ---
    # 1) Whole Strawberry Cream Cake on porcelain pedestal stand (left side)
    cake_x = cx - 0.34
    _lathe_rings(
        g,
        cake_x,
        cy,
        [(0.068, deck1_z), (0.028, deck1_z + 0.022), (0.024, deck1_z + 0.058), (0.135, deck1_z + 0.066), (0.135, deck1_z + 0.076)],
        sides=16,
        color=COL_CERAMIC_WHITE,
        tile="ceramic_gloss",
    )
    _lathe_rings(
        g,
        cake_x,
        cy,
        [(0.108, deck1_z + 0.076), (0.110, deck1_z + 0.168), (0.102, deck1_z + 0.175)],
        sides=18,
        color="FBF5E9",
        tile="enamel_gloss",
    )
    # Ring of 8 bright red strawberries & cream rosettes on cake top!
    for i in range(8):
        ang = TAU * i / 8.0
        bx = cake_x + 0.072 * math.cos(ang)
        by = cy + 0.072 * math.sin(ang)
        _lathe_rings(
            g,
            bx,
            by,
            [(0.014, deck1_z + 0.174), (0.017, deck1_z + 0.186), (0.006, deck1_z + 0.204)],
            sides=8,
            color="C9433E",
            tile="enamel_gloss",
        )

    # 2) Chocolate Ganache Cake & Basque Cheesecake Slices on porcelain tray (center)
    g.box((cx + 0.02, cy, deck1_z + 0.008), (0.30, 0.26, 0.014), COL_CERAMIC_WHITE, tile="ceramic_gloss", bevel=0.003)
    for sx, col_body, col_top in ((-0.07, "5C3A28", "3B2318"), (0.07, "E8C882", "8A4E24")):
        g.box((cx + 0.02 + sx, cy, deck1_z + 0.048), (0.10, 0.15, 0.066), col_body, tile="enamel_gloss", bevel=0.006)
        g.box((cx + 0.02 + sx, cy, deck1_z + 0.084), (0.102, 0.152, 0.010), col_top, tile="enamel_gloss", bevel=0.003)

    # 3) Fruit Tarts on walnut board (right side)
    g.box((cx + 0.36, cy, deck1_z + 0.008), (0.28, 0.26, 0.014), COL_OAK_A, tile="wood_prop", bevel=0.003)
    for tx_off, ty_off, top_c in ((-0.06, -0.05, "D6A24E"), (0.06, -0.05, "7E9B56"), (0.0, 0.06, "C94A44")):
        _lathe_rings(
            g,
            cx + 0.36 + tx_off,
            cy + ty_off,
            [(0.044, deck1_z + 0.015), (0.050, deck1_z + 0.042), (0.042, deck1_z + 0.048)],
            sides=12,
            color="C9965B",
            tile="wood_prop",
        )
        _lathe_rings(
            g,
            cx + 0.36 + tx_off,
            cy + ty_off,
            [(0.036, deck1_z + 0.046), (0.028, deck1_z + 0.062), (0.010, deck1_z + 0.068)],
            sides=10,
            color=top_c,
            tile="enamel_gloss",
        )

    # --- Sculpted Croissants & Scones on Upper Glass Shelf (deck2_z) ---
    g.box((cx - 0.22, cy + 0.02, deck2_z + 0.008), (0.44, 0.26, 0.014), COL_OAK_C, tile="wood_prop", bevel=0.003)
    # 3 Flaky crescent croissants sculpted via curved multi-ring pipe!
    for i, cr_x in enumerate((-0.36, -0.22, -0.08)):
        pts = [
            (cx + cr_x - 0.045, cy + 0.06, deck2_z + 0.032),
            (cx + cr_x - 0.022, cy + 0.01, deck2_z + 0.044),
            (cx + cr_x, cy - 0.01, deck2_z + 0.050),
            (cx + cr_x + 0.022, cy + 0.01, deck2_z + 0.044),
            (cx + cr_x + 0.045, cy + 0.06, deck2_z + 0.032),
        ]
        add_pipe_frame(g, pts, radius=0.022, sides=10, bend_subdiv=2, flange_ends=False, color="C78842", tile="wood_prop")

    # Tray of warm butter scones & madeleines (upper right)
    g.box((cx + 0.26, cy + 0.02, deck2_z + 0.008), (0.38, 0.26, 0.014), COL_CERAMIC_WHITE, tile="ceramic_gloss", bevel=0.003)
    for sx in (-0.10, 0.0, 0.10):
        for sy in (-0.05, 0.05):
            _lathe_rings(
                g,
                cx + 0.26 + sx,
                cy + 0.02 + sy,
                [(0.032, deck2_z + 0.015), (0.036, deck2_z + 0.036), (0.024, deck2_z + 0.056)],
                sides=10,
                color="D6A96C",
                tile="wood_prop",
            )


def _add_mug_and_saucer(g: MeshGroup, cx: float, cy: float, z_base: float, color: str = COL_CERAMIC_WHITE) -> None:
    """Build a ceramic cafe latte cup on saucer with handle."""
    _lathe_rings(g, cx, cy, [(0.052, z_base), (0.072, z_base + 0.012), (0.068, z_base + 0.016)], sides=14, color=color, tile="ceramic_gloss")
    _lathe_rings(
        g,
        cx,
        cy,
        [
            (0.032, z_base + 0.015),
            (0.042, z_base + 0.055),
            (0.044, z_base + 0.088),
            (0.038, z_base + 0.088),
            (0.034, z_base + 0.068),
        ],
        sides=14,
        color=color,
        tile="ceramic_gloss",
    )
    # Latte foam disc inside
    _lathe_rings(g, cx, cy, [(0.034, z_base + 0.070), (0.035, z_base + 0.076)], sides=12, color="B8895E", tile="enamel_gloss")
    # C-handle
    add_pipe_frame(
        g,
        [(cx + 0.040, cy, z_base + 0.074), (cx + 0.064, cy, z_base + 0.070), (cx + 0.062, cy, z_base + 0.038), (cx + 0.036, cy, z_base + 0.034)],
        radius=0.0055,
        sides=8,
        bend_subdiv=2,
        bend_radius=0.012,
        flange_ends=False,
        color=color,
        tile="ceramic_gloss",
    )


def _add_iced_coffee(g: MeshGroup, cx: float, cy: float, z_base: float) -> None:
    """Build a tall iced americano glass with coffee core and straw."""
    _lathe_rings(
        g,
        cx,
        cy,
        [(0.030, z_base), (0.038, z_base + 0.135), (0.034, z_base + 0.135), (0.026, z_base + 0.015)],
        sides=12,
        color="C8DCE2",
        tile="glass_prop",
    )
    _lathe_rings(g, cx, cy, [(0.026, z_base + 0.018), (0.033, z_base + 0.112)], sides=12, color="4F2F1D", tile="enamel_gloss")
    g.rail((cx + 0.006, cy, z_base + 0.02), (cx + 0.024, cy + 0.01, z_base + 0.175), 0.0035, COL_BRASS, 8, tile="brass_polished")


def _add_potted_plant(
    g: MeshGroup,
    cx: float,
    cy: float,
    z_base: float,
    *,
    pot_r: float = 0.25,
    pot_h: float = 0.48,
    tree_h: float = 1.60,
    pot_color: str = COL_TERRACOTTA,
    pot_tile: str = "stone_prop",
    seed: int = 101,
) -> None:
    """Build a sculpted large cafe indoor tree planter (ribbed pot + forked trunk + manifold leaves)."""
    rng = random.Random(seed)
    # Turned ribbed ceramic/terracotta planter resting cleanly on z_base
    _lathe_rings(
        g,
        cx,
        cy,
        [
            (pot_r * 0.72, z_base),
            (pot_r * 0.78, z_base + pot_h * 0.10),
            (pot_r * 0.96, z_base + pot_h * 0.76),
            (pot_r * 1.03, z_base + pot_h * 0.84),
            (pot_r * 1.03, z_base + pot_h),
            (pot_r * 0.88, z_base + pot_h),
            (pot_r * 0.84, z_base + pot_h * 0.82),
            (pot_r * 0.72, z_base + pot_h * 0.20),
        ],
        sides=20,
        color=pot_color,
        tile=pot_tile,
    )
    # Dark soil mound inside pot
    soil_z = z_base + pot_h * 0.86
    _lathe_rings(
        g,
        cx,
        cy,
        [(pot_r * 0.82, soil_z - 0.02), (pot_r * 0.82, soil_z + 0.015), (pot_r * 0.25, soil_z + 0.032)],
        sides=16,
        color=COL_SOIL,
        tile="stone_prop",
    )

    # Organic forked woody trunk & 6 staggered main boughs (strictly unique attachment heights -> 0 welded edges)
    trunk_top = Vector((cx + rng.uniform(-0.04, 0.04), cy + rng.uniform(-0.04, 0.04), soil_z + tree_h * 0.56))
    trunk_mid = Vector((cx + rng.uniform(-0.03, 0.03), cy + rng.uniform(-0.03, 0.03), soil_z + tree_h * 0.28))
    g.rail((cx, cy, soil_z), tuple(trunk_mid), 0.032, COL_WALNUT, 10, tile="wood_prop")
    g.rail(tuple(trunk_mid - Vector((0.0, 0.0, 0.018))), tuple(trunk_top), 0.023, COL_WALNUT, 10, tile="wood_prop")

    leaf_cols = (COL_LEAF_A, COL_LEAF_B, COL_LEAF_C)
    n_branches = 6
    for b in range(n_branches):
        ang = TAU * b / n_branches + rng.uniform(-0.22, 0.22)
        t_attach = 0.34 + 0.58 * (b / max(1, n_branches - 1))
        b_start = trunk_mid.lerp(trunk_top, t_attach) + Vector((math.cos(ang) * 0.004, math.sin(ang) * 0.004, 0.0))
        b_len = tree_h * rng.uniform(0.24, 0.38)
        b_rise = tree_h * rng.uniform(0.24, 0.42)
        b_end = b_start + Vector((math.cos(ang) * b_len, math.sin(ang) * b_len, b_rise))
        g.rail(tuple(b_start), tuple(b_end), 0.0125 + (b % 2) * 0.001, COL_WALNUT, 8, tile="wood_prop")

        # 6 sculpted arched leaves radiating from each branch
        for k in range(6):
            frac = 0.42 + 0.58 * (k / 5.0)
            attach = b_start.lerp(b_end, frac)
            la = ang + (k - 2.5) * 0.62 + rng.uniform(-0.18, 0.18)
            _add_leaf_blade(
                g,
                tuple(attach),
                la,
                length=tree_h * rng.uniform(0.16, 0.25),
                width=tree_h * rng.uniform(0.055, 0.088),
                rise=tree_h * rng.uniform(0.02, 0.09),
                color=leaf_cols[(b + k) % 3],
                tile="foliage_prop",
            )


def _build_aframe_sign(g: MeshGroup, cx: float, cy: float, z_base: float, rot_z: float) -> None:
    """Build a hinged walnut & chalkboard exterior sidewalk A-frame cafe signboard."""
    w = 0.54
    h = 0.88
    half_spread = 0.23
    tilt = math.atan2(half_spread, h)

    for side in (-1.0, 1.0):
        # 2 angled easel legs per face resting at z_base
        for sx in (-w * 0.46, w * 0.46):
            p0 = _rot_xy(sx, side * half_spread, rot_z)
            p1 = _rot_xy(sx, side * 0.022, rot_z)
            g.timber(
                (cx + p0[0], cy + p0[1], z_base + 0.005),
                (cx + p1[0], cy + p1[1], z_base + h),
                0.034,
                0.030,
                COL_WALNUT,
                tile="wood_prop",
                bevel=0.003,
            )
        # Tilted chalkboard display panel inset between legs
        panel_y = side * (half_spread * 0.46)
        panel_z = z_base + h * 0.54
        # Build angled slab as 2-ring closed solid so tilt matches legs cleanly
        p_bot_y = side * (half_spread * 0.78)
        p_top_y = side * (half_spread * 0.16)
        z_bot = z_base + 0.18
        z_top = z_base + h - 0.05
        half_w = w * 0.43
        ny = side * math.cos(tilt)
        nz = math.sin(tilt)
        t = 0.012

        def _pt(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
            rx, ry = _rot_xy(lx, ly, rot_z)
            return (cx + rx, cy + ry, lz)

        r_in = [
            _pt(-half_w, p_bot_y, z_bot),
            _pt(half_w, p_bot_y, z_bot),
            _pt(half_w, p_top_y, z_top),
            _pt(-half_w, p_top_y, z_top),
        ]
        r_out = [
            _pt(-half_w, p_bot_y + ny * t, z_bot + nz * t),
            _pt(half_w, p_bot_y + ny * t, z_bot + nz * t),
            _pt(half_w, p_top_y + ny * t, z_top + nz * t),
            _pt(-half_w, p_top_y + ny * t, z_top + nz * t),
        ]
        g.rings([r_in, r_out], color=COL_CHALK, tile="plastic_matte")

        # Chalk menu header & coffee cup accent bar on front face
        for bar_frac, bw in ((0.76, 0.28), (0.56, 0.22), (0.42, 0.25)):
            by = p_bot_y + (p_top_y - p_bot_y) * bar_frac + ny * (t + 0.006)
            bz = z_bot + (z_top - z_bot) * bar_frac + nz * (t + 0.006)
            _local_box(g, (cx, cy, 0.0), rot_z, 0.0, by, bz, bw, 0.008, 0.022, COL_AWNING_CREAM, tile="paper_label", bevel=0.0015)

    # Brass top hinge bar & mid-height folding stay rods
    _local_box(g, (cx, cy, z_base + h), rot_z, 0.0, 0.0, 0.0, w * 0.96, 0.056, 0.028, COL_BRASS, tile="brass_polished", bevel=0.003)
    for sx in (-w * 0.44, w * 0.44):
        p0 = _rot_xy(sx, -half_spread * 0.65, rot_z)
        p1 = _rot_xy(sx, half_spread * 0.65, rot_z)
        g.rail((cx + p0[0], cy + p0[1], z_base + 0.30), (cx + p1[0], cy + p1[1], z_base + 0.30), 0.006, COL_BRASS, 8, tile="brass_polished")


def _build_props_clutter(g: MeshGroup) -> None:
    bar_z = COUNTER_TOP_Z  # 0.980 m
    cred_z = FLOOR_Z + 0.874  # 0.920 m

    # 1. Commercial 2-Group Espresso Machine & Burr Grinder on North Back-Bar Credenza (facing South -Y!)
    _build_espresso_machine(g, -3.12, 3.28, cred_z)
    _build_coffee_grinder(g, -2.42, 3.28, cred_z)
    # Tamping mat, walnut-handled tamper, knock box & brushed-steel milk pitcher
    g.box((-2.10, 3.22, cred_z + 0.006), (0.22, 0.16, 0.012), COL_STEEL_DARK, tile="rubber_dark", bevel=0.002)
    g.box((-2.13, 3.22, cred_z + 0.048), (0.12, 0.11, 0.072), COL_STEEL_DARK, tile="iron_dark", bevel=0.004)
    _lathe_rings(g, -2.02, 3.22, [(0.028, cred_z + 0.012), (0.028, cred_z + 0.024), (0.012, cred_z + 0.040), (0.018, cred_z + 0.088)], sides=12, color=COL_WALNUT, tile="wood_prop")
    _lathe_rings(g, -3.72, 3.22, [(0.044, cred_z), (0.042, cred_z + 0.105), (0.036, cred_z + 0.112)], sides=14, color=COL_STEEL_BRUSH, tile="steel_brushed")

    # 2. Hero 2-Tier Glass Cake & Pastry Display Showcase on Front L-Bar Counter (facing South -Y!)
    _build_pastry_showcase(g, -1.96, 1.04, bar_z)

    # 3. POS Tablet Cash Register + Mini Receipt Printer + Menu Card Holder on Front Bar (X = -2.92)
    pos_x, pos_y = -2.92, 1.06
    g.box((pos_x, pos_y, bar_z + 0.012), (0.18, 0.16, 0.024), COL_STEEL_DARK, tile="iron_dark", bevel=0.003)
    g.timber((pos_x, pos_y, bar_z + 0.020), (pos_x, pos_y - 0.03, bar_z + 0.19), 0.044, 0.028, COL_STEEL_DARK, tile="iron_dark", bevel=0.003)
    g.box((pos_x, pos_y - 0.035, bar_z + 0.215), (0.26, 0.024, 0.18), COL_STEEL_DARK, tile="plastic_matte", bevel=0.004)
    g.box((pos_x, pos_y - 0.049, bar_z + 0.215), (0.23, 0.006, 0.15), "DDE8EC", tile="glass_prop", bevel=0.001)
    # Mini receipt printer & wooden clipboard menu beside POS
    g.box((pos_x + 0.21, pos_y + 0.02, bar_z + 0.062), (0.12, 0.15, 0.124), COL_STEEL_DARK, tile="plastic_matte", bevel=0.005)
    g.box((pos_x - 0.24, pos_y - 0.06, bar_z + 0.008), (0.19, 0.26, 0.014), COL_OAK_A, tile="wood_prop", bevel=0.002)
    g.box((pos_x - 0.24, pos_y - 0.06, bar_z + 0.018), (0.16, 0.22, 0.006), COL_CERAMIC_WHITE, tile="paper_label", bevel=0.001)

    # 4. Pour-Over Specialty Coffee Station & Copper Gooseneck Kettle (X = -3.68, Y = 1.08)
    po_x, po_y = -3.68, 1.08
    # Walnut + brass dripper stand
    g.box((po_x, po_y, bar_z + 0.012), (0.34, 0.16, 0.024), COL_WALNUT, tile="wood_prop", bevel=0.003)
    for sx in (-0.14, 0.14):
        g.rail((po_x + sx, po_y, bar_z + 0.022), (po_x + sx, po_y, bar_z + 0.215), 0.008, COL_BRASS, 10, tile="brass_polished")
    g.box((po_x, po_y, bar_z + 0.218), (0.32, 0.11, 0.016), COL_WALNUT, tile="wood_prop", bevel=0.003)
    # 2 Glass coffee carafes + ceramic V60 drippers
    for dx in (-0.075, 0.075):
        _lathe_rings(g, po_x + dx, po_y, [(0.044, bar_z + 0.024), (0.048, bar_z + 0.065), (0.032, bar_z + 0.138)], sides=12, color="C8DCE2", tile="glass_prop")
        _lathe_rings(g, po_x + dx, po_y, [(0.016, bar_z + 0.224), (0.050, bar_z + 0.295), (0.044, bar_z + 0.295), (0.014, bar_z + 0.232)], sides=12, color=COL_CERAMIC_WHITE, tile="ceramic_gloss")
    # Copper Gooseneck Kettle beside dripper stand
    kx, ky = -4.02, 1.08
    _lathe_rings(g, kx, ky, [(0.064, bar_z), (0.068, bar_z + 0.025), (0.056, bar_z + 0.135), (0.046, bar_z + 0.148), (0.012, bar_z + 0.164)], sides=16, color=COL_COPPER, tile="copper_patina")
    add_pipe_frame(
        g,
        [(kx + 0.058, ky, bar_z + 0.028), (kx + 0.112, ky, bar_z + 0.055), (kx + 0.128, ky, bar_z + 0.148), (kx + 0.148, ky, bar_z + 0.158)],
        radius=0.006,
        sides=8,
        bend_subdiv=2,
        bend_radius=0.02,
        flange_ends=False,
        color=COL_COPPER,
        tile="copper_patina",
    )

    # 5. East Return Wing Pickup & Water Station (X = -0.96, Y = 2.08, Z = bar_z)
    # Glass water carafe + 3 tumblers + wooden serving trays + ceramic napkin box
    _lathe_rings(g, -0.94, 2.38, [(0.048, bar_z), (0.052, bar_z + 0.08), (0.032, bar_z + 0.22), (0.038, bar_z + 0.25)], sides=14, color="C8DCE2", tile="glass_prop")
    for gy in (2.16, 2.05, 1.94):
        _lathe_rings(g, -0.96, gy, [(0.026, bar_z), (0.032, bar_z + 0.088), (0.028, bar_z + 0.088), (0.023, bar_z + 0.012)], sides=12, color="C8DCE2", tile="glass_prop")
    g.box((-0.96, 1.72, bar_z + 0.012), (0.30, 0.22, 0.020), COL_OAK_A, tile="wood_prop", bevel=0.003)
    g.box((-0.96, 1.72, bar_z + 0.034), (0.29, 0.21, 0.018), COL_WALNUT, tile="wood_prop", bevel=0.003)
    g.box((-0.96, 2.62, bar_z + 0.048), (0.14, 0.14, 0.096), COL_CERAMIC_WHITE, tile="ceramic_gloss", bevel=0.004)

    # 6. Back-Bar Floating Wall Shelves Props (Z = 1.518 and Z = 1.958, Y = 3.455)
    # Lower shelf (Z = 1.518): coffee bean canisters, glass syrup bottles, stacked latte mugs
    for idx, sx in enumerate((-4.35, -4.16, -3.97, -3.78)):
        col = (COL_ESPRESSO_GREEN, COL_COPPER, COL_CERAMIC_WHITE, COL_BRASS)[idx]
        tl = ("enamel_gloss", "copper_patina", "ceramic_gloss", "brass_polished")[idx]
        _lathe_rings(g, sx, 3.45, [(0.055, 1.518), (0.055, 1.675), (0.048, 1.692)], sides=14, color=col, tile=tl)
    for idx, sx in enumerate((-3.46, -3.32, -3.18, -3.04)):
        col = ("B87B3B", "8A462B", "D4A858", "5C3A28")[idx]
        _lathe_rings(g, sx, 3.45, [(0.036, 1.518), (0.036, 1.68), (0.016, 1.73), (0.016, 1.765)], sides=12, color=col, tile="glass_prop")
    for sx in (-2.70, -2.54, -2.38, -2.22):
        _add_mug_and_saucer(g, sx, 3.45, 1.518, COL_CERAMIC_WHITE)
    # Upper shelf (Z = 1.958): kraft coffee bean bags, ceramic pitchers & small trailing ivy pot
    for idx, sx in enumerate((-4.32, -4.12, -3.92, -3.72, -3.52)):
        col = ("D8C29E", "384F42", "C4805A", "E4DAC8", "5A483A")[idx]
        g.box((sx, 3.45, 2.065), (0.12, 0.085, 0.21), col, tile="paper_label", bevel=0.006)
    for idx, sx in enumerate((-3.14, -2.90, -2.66)):
        _lathe_rings(g, sx, 3.45, [(0.058, 1.958), (0.072, 2.05), (0.042, 2.18), (0.052, 2.21)], sides=14, color=(COL_CERAMIC_WHITE, COL_TERRACOTTA, COL_TILE_SAGE)[idx], tile="ceramic_gloss")
    _add_potted_plant(g, -2.26, 3.45, 1.958, pot_r=0.085, pot_h=0.14, tree_h=0.36, pot_color=COL_POT_CREAM, pot_tile="ceramic_gloss", seed=303)

    # 7. Tabletop Storytelling Props (cleanly grounded on table tops!)
    t_round_z = FLOOR_Z + 0.730  # 0.776 m
    # Round Table 1 (-3.15, -1.28)
    _add_mug_and_saucer(g, -3.32, -1.22, t_round_z, COL_CERAMIC_WHITE)
    _add_iced_coffee(g, -2.98, -1.36, t_round_z)
    g.box((-3.14, -1.16, t_round_z + 0.011), (0.18, 0.14, 0.020), "C8B698", tile="paper_label", bevel=0.003, rot_z=0.18)
    # Round Table 2 (-0.85, -1.28)
    g.box((-0.85, -1.28, t_round_z + 0.008), (0.28, 0.20, 0.014), COL_OAK_A, tile="wood_prop", bevel=0.003, rot_z=-0.12)
    _add_mug_and_saucer(g, -0.92, -1.28, t_round_z + 0.015, COL_TILE_CREAM_B)
    _lathe_rings(g, -0.76, -1.26, [(0.048, t_round_z + 0.015), (0.062, t_round_z + 0.025)], sides=14, color=COL_CERAMIC_WHITE, tile="ceramic_gloss")
    g.box((-0.76, -1.26, t_round_z + 0.048), (0.068, 0.056, 0.042), "E6C37C", tile="enamel_gloss", bevel=0.005)

    # 4-Seat Communal Table (2.15, 1.50, Z = FLOOR_Z + 0.740 = 0.786)
    t_comm_z = FLOOR_Z + 0.740
    # Center bud vase with green botanical sprig + brass napkin stand
    _lathe_rings(g, 2.15, 1.50, [(0.036, t_comm_z), (0.048, t_comm_z + 0.065), (0.022, t_comm_z + 0.165), (0.028, t_comm_z + 0.180)], sides=14, color=COL_POT_CREAM, tile="ceramic_gloss")
    g.rail((2.15, 1.50, t_comm_z + 0.14), (2.18, 1.52, t_comm_z + 0.32), 0.004, COL_LEAF_C, 6, tile="foliage_prop")
    _add_leaf_blade(g, (2.17, 1.51, t_comm_z + 0.24), 0.5, 0.12, 0.036, 0.06, COL_LEAF_A)
    _add_leaf_blade(g, (2.16, 1.50, t_comm_z + 0.27), 2.8, 0.11, 0.032, 0.05, COL_LEAF_B)
    _add_mug_and_saucer(g, 1.68, 1.28, t_comm_z, COL_CERAMIC_WHITE)
    _add_iced_coffee(g, 2.58, 1.72, t_comm_z)
    # Open notebook/laptop-style art book on communal table
    g.box((1.72, 1.66, t_comm_z + 0.010), (0.28, 0.21, 0.018), COL_ESPRESSO_GREEN, tile="paper_label", bevel=0.002, rot_z=0.14)
    g.box((2.56, 1.32, t_comm_z + 0.010), (0.24, 0.18, 0.018), "D69B66", tile="paper_label", bevel=0.002, rot_z=-0.20)

    # Banquette Square Tables (3.56, -1.78) and (3.56, -0.74), Z = t_round_z
    _add_mug_and_saucer(g, 3.64, -1.74, t_round_z, COL_CERAMIC_WHITE)
    _add_iced_coffee(g, 3.44, -1.84, t_round_z)
    _add_mug_and_saucer(g, 3.52, -0.68, t_round_z, COL_TILE_CREAM_B)
    g.box((3.62, -0.82, t_round_z + 0.022), (0.085, 0.055, 0.044), COL_BRASS, tile="brass_polished", bevel=0.003)

    # 8. Curated Art Books & Ceramic Vessels on East Wall Bookshelf (X = 4.56, Y in [0.64, 2.68])
    book_palette = ("C46B50", "E6DCC8", "4D6B59", "3D4F61", "D4A45A", "8A5A44", "EAE4D8")
    rng = random.Random(77)
    for shelf_idx, sz in enumerate((FLOOR_Z + 0.62, FLOOR_Z + 1.06, FLOOR_Z + 1.50, FLOOR_Z + 1.94)):
        # Row of vertical books on South bay
        cursor_y = 0.66
        for b in range(7):
            bt = rng.uniform(0.028, 0.048)
            bh = rng.uniform(0.22, 0.30)
            bd = rng.uniform(0.18, 0.24)
            g.box((4.57, cursor_y + bt * 0.5, sz + bh * 0.5), (bd, bt - 0.003, bh), book_palette[(shelf_idx * 3 + b) % len(book_palette)], tile="paper_label", bevel=0.002)
            cursor_y += bt + 0.003
        # Horizontal stack of 3 monographs in center bay
        stack_z = sz
        for k in range(3):
            sh = 0.032
            g.box((4.56, 1.62, stack_z + sh * 0.5), (0.24 - k * 0.015, 0.32 - k * 0.02, sh - 0.002), book_palette[(shelf_idx + k + 2) % len(book_palette)], tile="paper_label", bevel=0.002)
            stack_z += sh
        # Sculpted ceramic vessel on North bay
        vy = 2.38 + (shelf_idx % 2) * 0.12
        _lathe_rings(
            g,
            4.56,
            vy,
            [(0.052, sz), (0.084, sz + 0.11), (0.068, sz + 0.22), (0.038, sz + 0.27), (0.046, sz + 0.29)],
            sides=14,
            color=(COL_POT_CREAM, COL_TERRACOTTA, COL_TILE_SAGE, COL_BRASS)[shelf_idx % 4],
            tile="ceramic_gloss" if shelf_idx != 3 else "brass_polished",
        )

    # 9. 3 Large Sculpted Indoor & Storefront Potted Plants (대형 화분)
    # Hero Plant #1: Tall Ficus/Olive tree framing the wood louver wall & L-bar corner (zero door collision!)
    _add_potted_plant(g, -4.32, 0.08, FLOOR_Z, pot_r=0.25, pot_h=0.50, tree_h=1.56, pot_color=COL_TERRACOTTA, pot_tile="stone_prop", seed=101)
    # Hero Plant #2: Tall Indoor Plant in North-East corner between bookshelf & staff door
    _add_potted_plant(g, 4.30, 3.16, FLOOR_Z, pot_r=0.22, pot_h=0.45, tree_h=1.38, pot_color=COL_POT_CREAM, pot_tile="ceramic_gloss", seed=202)
    # Hero Plant #3: Storefront Exterior Planter cleanly inside [-4.95, -3.76] on South granite terrace
    _add_potted_plant(g, -4.36, -3.35, SIDEWALK_TOP_Z, pot_r=0.19, pot_h=0.38, tree_h=0.76, pot_color=COL_TERRACOTTA, pot_tile="stone_prop", seed=404)

    # 10. Exterior Hinged Walnut & Chalkboard A-Frame Signboard (입간판) on South sidewalk terrace
    _build_aframe_sign(g, 2.12, -3.40, SIDEWALK_TOP_Z, rot_z=math.radians(16.0))


# ---------------------------------------------------------------------------
# Camera Presets & 6-View Review Definitions
# ---------------------------------------------------------------------------


def build_cafe_cameras() -> Dict[str, Any]:
    """Return canonical webtoon camera presets in glTF Y-up coordinates for manifest."""
    return {
        "establishing_24mm": {
            "label": "24mm 입구 전경",
            "lensMm": 24,
            "position": [3.55, 1.52, 2.25],
            "target": [-1.55, 1.25, -1.10],
        },
        "counter_order_35mm": {
            "label": "35mm 카운터 주문",
            "lensMm": 35,
            "position": [0.95, 1.48, 0.35],
            "target": [-2.35, 1.28, -1.65],
        },
        "window_dialogue_50mm": {
            "label": "50mm 창가 좌석 대면",
            "lensMm": 50,
            "position": [-2.15, 1.32, 0.25],
            "target": [-3.15, 1.15, 1.28],
        },
    }


def build_cafe_review_views() -> List[PreviewCameraView]:
    """Build 6 tailored Blender-Z-up review views covering exterior, cutaways, & interior."""
    return [
        PreviewCameraView(
            key="front_facade",
            label="1 FRONT FACADE",
            location=(1.25, -12.60, 2.05),
            target=(0.00, -2.20, 1.48),
            lens_mm=32.0,
            hide_nodes=(),  # Full storefront: folding glass doors, striped awning, A-frame sign, planter!
        ),
        PreviewCameraView(
            key="side_cutaway",
            label="2 SIDE CUTAWAY",
            location=(-12.60, 0.10, 1.95),
            target=(0.40, 0.35, 1.52),
            lens_mm=34.0,
            hide_nodes=("BG_Wall_West",),
        ),
        PreviewCameraView(
            key="back_cutaway",
            label="3 BACK CUTAWAY",
            location=(0.10, 11.40, 2.05),
            target=(-0.10, 0.00, 1.48),
            lens_mm=34.0,
            hide_nodes=("BG_Wall_North",),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(8.40, -8.60, 6.40),
            target=(-0.45, 0.55, 1.05),
            lens_mm=36.0,
            hide_nodes=("BG_Wall_South", "BG_Wall_East", "BG_Ceiling"),
        ),
        PreviewCameraView(
            key="interior_35mm",
            label="5 INTERIOR 35MM",
            location=(2.85, -1.78, 1.52),
            target=(-1.90, 1.25, 1.32),
            lens_mm=28.0,
            hide_nodes=(),  # Full closed room: exposed concrete ceiling, ducts, tracks, glowing pendants!
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(0.45, -6.20, 11.80),
            target=(0.00, 0.25, 0.65),
            lens_mm=34.0,
            hide_nodes=("BG_Ceiling",),
        ),
    ]


# ---------------------------------------------------------------------------
# Build Orchestrator
# ---------------------------------------------------------------------------


def build_cafe_groups() -> HeroSceneGroups:
    """Populate all 8 Desktop Cutaway MeshGroups for ``kr_atelier_cafe_interior``."""
    groups = HeroSceneGroups()
    _build_floor(groups.floor)
    _build_wall_south(groups.wall_south)
    _build_wall_west(groups.wall_west)
    _build_wall_north(groups.wall_north)
    _build_wall_east(groups.wall_east)
    _build_ceiling(groups.ceiling)
    _build_furniture_hero(groups.furniture_hero)
    _build_props_clutter(groups.props_clutter)
    return groups


def main(argv: Optional[Sequence[str]] = None) -> int:
    if argv is not None:
        raw_argv = list(argv)
    elif "--" in sys.argv:
        raw_argv = sys.argv[sys.argv.index("--") + 1 :]
    else:
        raw_argv = []

    parser = argparse.ArgumentParser(description="Build kr_atelier_cafe_interior Hero BG3D")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--preview-dir", type=Path, default=DEFAULT_PREVIEW_DIR)
    parser.add_argument("--qa-out", type=Path, default=DEFAULT_PREVIEW_DIR / f"{SLUG}-qa.json")
    parser.add_argument("--desktop-primary", type=int, default=1024)
    parser.add_argument("--desktop-secondary", type=int, default=1024)
    parser.add_argument("--mobile-opaque", type=int, default=512)
    parser.add_argument("--mobile-glass", type=int, default=512)
    parser.add_argument("--skip-preview", action="store_true")
    args = parser.parse_args(raw_argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Re-enable Freestyle SVG exporter after factory reset (never use --addons)
    if not args.skip_preview:
        bpy.ops.preferences.addon_enable(module="bl_ext.user_default.freestyle_svg_exporter")

    args.out.mkdir(parents=True, exist_ok=True)
    args.preview_dir.mkdir(parents=True, exist_ok=True)

    groups = build_cafe_groups()
    groups.ground_to_zero()

    # 1. Assemble, Gate-1 audit, & export Mobile 4-node Hero GLB
    mobile_scene = assemble_mobile_cutaway(
        SLUG,
        groups,
        opaque_size=args.mobile_opaque,
        glass_size=args.mobile_glass,
        auto_ground=False,
    )
    mobile_bmesh_qa = audit_blender_scene(mobile_scene.root, profile="mobile")
    if not mobile_bmesh_qa["passed"]:
        print(json.dumps(mobile_bmesh_qa, indent=2, ensure_ascii=False))
        raise RuntimeError(f"Mobile Gate 1 bmesh audit failed: {mobile_bmesh_qa['errors']}")

    mobile_glb = args.out / f"{SLUG}-mobile.glb"
    mobile_meta = export_cutaway_glb(mobile_scene, mobile_glb, optimize_meshopt=True)
    _remove_hierarchy(mobile_scene)

    # 2. Assemble, Gate-1 audit, & export Desktop 8-node Hero GLB
    desktop_scene = assemble_desktop_cutaway(
        SLUG,
        groups,
        primary_size=args.desktop_primary,
        secondary_size=args.desktop_secondary,
        auto_ground=False,
    )
    desktop_bmesh_qa = audit_blender_scene(desktop_scene.root, profile="desktop")
    if not desktop_bmesh_qa["passed"]:
        print(json.dumps(desktop_bmesh_qa, indent=2, ensure_ascii=False))
        raise RuntimeError(f"Desktop Gate 1 bmesh audit failed: {desktop_bmesh_qa['errors']}")

    desktop_glb = args.out / f"{SLUG}.glb"
    desktop_meta = export_cutaway_glb(desktop_scene, desktop_glb, optimize_meshopt=True)

    # Write per-asset manifest (never clobbering other parallel hero builds)
    manifest = {
        "assetId": SLUG,
        "cutawayContract": "room-v1",
        "fileName": desktop_meta["fileName"],
        "byteSize": desktop_meta["byteSize"],
        "sha256": desktop_meta["sha256"],
        "bounds": desktop_meta["bounds"],
        "nodes": desktop_meta["nodeNames"],
        "mobile": {
            "fileName": mobile_meta["fileName"],
            "byteSize": mobile_meta["byteSize"],
            "sha256": mobile_meta["sha256"],
            "nodes": mobile_meta["nodeNames"],
        },
        "cameras": build_cafe_cameras(),
    }
    manifest_path = args.out / f"{SLUG}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # 3. Gate-2 GLB contract & gltf-transform validate for Desktop & Mobile
    desktop_glb_qa = inspect_glb(desktop_glb, profile="desktop", require_meshopt=True, run_validate=True)
    mobile_glb_qa = inspect_glb(mobile_glb, profile="mobile", require_meshopt=True, run_validate=True)

    # 4. Gate-5 6-view 512x512 BLENDER_EEVEE contact sheet PNG + Freestyle SVG
    preview_report: Optional[Dict[str, Any]] = None
    if not args.skip_preview:
        preview_report = render_hero_review_bundle(
            args.preview_dir,
            SLUG,
            root_obj=desktop_scene.root,
            views=build_cafe_review_views(),
            tile_resolution=512,
            interior_cutaway=True,
        )

    qa_bundle = {
        "slug": SLUG,
        "manifestPath": str(manifest_path),
        "desktopExport": desktop_meta,
        "mobileExport": mobile_meta,
        "desktopGate1": desktop_bmesh_qa,
        "mobileGate1": mobile_bmesh_qa,
        "desktopGate2": desktop_glb_qa,
        "mobileGate2": mobile_glb_qa,
        "preview": preview_report,
    }
    args.qa_out.parent.mkdir(parents=True, exist_ok=True)
    args.qa_out.write_text(json.dumps(qa_bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "slug": SLUG,
                "desktop_bytes": desktop_meta["byteSize"],
                "desktop_tris": desktop_glb_qa["summary"]["triangles"],
                "desktop_dc": desktop_glb_qa["summary"]["draw_calls"],
                "desktop_mats": desktop_glb_qa["summary"]["materials"],
                "desktop_bounds_gltf": desktop_glb_qa["summary"]["bounds_gltf"],
                "desktop_gate1": desktop_bmesh_qa["passed"],
                "desktop_gate2": desktop_glb_qa["passed"],
                "mobile_bytes": mobile_meta["byteSize"],
                "mobile_tris": mobile_glb_qa["summary"]["triangles"],
                "mobile_dc": mobile_glb_qa["summary"]["draw_calls"],
                "mobile_mats": mobile_glb_qa["summary"]["materials"],
                "mobile_gate1": mobile_bmesh_qa["passed"],
                "mobile_gate2": mobile_glb_qa["passed"],
                "preview": preview_report,
            },
            indent=2,
            ensure_ascii=False,
        )
    )

    if not (desktop_glb_qa["passed"] and mobile_glb_qa["passed"]):
        raise RuntimeError(
            f"Gate 2 GLB validation failed: desktop={desktop_glb_qa['errors']}, mobile={mobile_glb_qa['errors']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
