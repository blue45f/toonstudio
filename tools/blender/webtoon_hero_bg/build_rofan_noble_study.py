"""ToonStudio Hero BG v2 #4: Romance Fantasy Northern Duke Study & Tea Parlor.

Builds ``rofan_noble_study_parlor`` (11.5 x 9.0 x 4.4 m) in Blender 5.3 headless
using the shared ``webtoon_hero_bg`` v2 core:
  - Grand triple-bay floor-to-ceiling arched mahogany bookshelves (90+ varied
    antique books, gilded moldings, brass rolling rail & movable wooden library ladder)
  - Central 3-tier gilded crystal chandelier (``add_tiered_crystal_chandelier``)
    beneath a deep coffered walnut & cream plaster ceiling
  - Carved veined marble fireplace on the West wall (firewood logs, glowing embers,
    mantle clock, flanking candelabras, ornate gilded Imperial Crest portrait)
  - Northern Duke executive partner's desk (carved pedestals, green leather blotter,
    feather quill & inkwell, wax-sealed letters, open Ducal Archive ledger,
    brass candelabrum, antique brass terrestrial globe, tufted leather high-back chair)
  - Tea-time parlor reception zone (woven bordered rug, sculpted crimson velvet sofa,
    2 tufted velvet armchairs, carved marble tea table, gilded teapot, 4 teacup sets,
    2-tier dessert tray with pastries)
  - Towering arched mullion windows with pleated velvet draped curtains & tiebacks
    (``add_pleated_curtain``), celestial star-chart wall mural, and grand potted
    botanical urns (``add_curved_foliage_plant``).

Outputs under ``apps/web/public/assets/3d/environments/hero-v2/rofan_noble_study_parlor/``:
  - ``desktop.glb`` (8-node cutaway, meshopt, <= 8 DC, <= 4 mat, <= 250k tris, <= 12 MiB)
  - ``mobile.glb``  (4-node cutaway, meshopt, <= 4 DC, <= 2 mat, <= 80k tris, <= 4 MiB)
  - ``manifest.json`` (bounds, SHA-256, cameras, 3-time-of-day lightingPresets, freestyleSvg)
  - ``freestyle.svg`` (3-tier webtoon line art <= 2.5 MiB)
  - ``contact_sheet.png`` (6-view 512x512 BLENDER_EEVEE contact sheet + preview copy)

Run headless with Blender 5.3:
  /Users/hjunkim/.local/bin/blender --background --factory-startup \\
      --python-exit-code 42 --python tools/blender/webtoon_hero_bg/build_rofan_noble_study.py --
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import bpy
from mathutils import Vector

_THIS_FILE = Path(__file__).resolve()
_BLENDER_TOOLS_DIR = _THIS_FILE.parents[1]
_REPO_ROOT = _THIS_FILE.parents[3]
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from webtoon_hero_bg.arch_primitives import (  # noqa: E402
    DEFAULT_BEVEL_M,
    MeshGroup,
    WallOpening,
    add_beveled_box,
    add_column_fluted,
    add_curved_foliage_plant,
    add_door_frame,
    add_pipe_frame,
    add_pleated_curtain,
    add_tiered_crystal_chandelier,
    add_wall_with_openings,
    add_window_sash,
)
from webtoon_hero_bg.cutaway_assembly import (  # noqa: E402
    DEFAULT_COPYRIGHT,
    HeroSceneGroups,
    _remove_hierarchy,
    assemble_desktop_cutaway,
    assemble_mobile_cutaway,
    build_lighting_presets,
    export_cutaway_glb,
)
from webtoon_hero_bg.multiview_preview import (  # noqa: E402
    FREESTYLE_SVG_ADDON,
    PreviewCameraView,
    render_freestyle_svg,
    render_six_view_contact_sheet,
)
from webtoon_hero_bg.qa_bg_gate import (  # noqa: E402
    audit_blender_scene,
    inspect_glb,
)

TAU = math.tau
SLUG = "rofan_noble_study_parlor"
DEFAULT_OUT_DIR = _REPO_ROOT / "apps/web/public/assets/3d/environments/hero-v2" / SLUG
DEFAULT_PREVIEW_COPY_DIR = _REPO_ROOT / "loop-stack/v2-previews/bg"

Vec3 = Tuple[float, float, float]

# ---------------------------------------------------------------------------
# Master Architectural Dimensions (11.50 m x 9.00 m x 4.40 m)
# ---------------------------------------------------------------------------
ROOM_W = 11.50
ROOM_D = 9.00
WALL_T = 0.24

X_WEST_OUT = -5.75
X_EAST_OUT = 5.75
Y_SOUTH_OUT = -4.50
Y_NORTH_OUT = 4.50

# Inset E/W and N/S slightly so exterior casings fit inside 11.5 x 9.0 and zero welded corner seams
X_WEST_MID = X_WEST_OUT + WALL_T * 0.5 + 0.03  # -5.60
X_EAST_MID = X_EAST_OUT - WALL_T * 0.5 - 0.03  # +5.60
Y_SOUTH_MID = Y_SOUTH_OUT + WALL_T * 0.5 + 0.03  # -4.35
Y_NORTH_MID = Y_NORTH_OUT - WALL_T * 0.5 - 0.03  # +4.35

X_WEST_IN = X_WEST_MID + WALL_T * 0.5  # -5.48
X_EAST_IN = X_EAST_MID - WALL_T * 0.5  # +5.48
Y_SOUTH_IN = Y_SOUTH_MID + WALL_T * 0.5  # -4.23
Y_NORTH_IN = Y_NORTH_MID - WALL_T * 0.5  # +4.23

SLAB_H = 0.10
FLOOR_Z = 0.12
WALL_H = 4.14
CEIL_Z = FLOOR_Z + WALL_H  # 4.26
ROOF_TOP = 4.40

# ---------------------------------------------------------------------------
# Northern Duke Study Palette (Warm Cream Plaster, Deep Mahogany, Gold, Crimson)
# ---------------------------------------------------------------------------
COL_PLASTER = "EDE5D6"
COL_PLASTER_DEEP = "DDD2BE"
COL_WAINSCOT = "5B3A29"
COL_MAHOGANY = "4B2D1F"
COL_MAHOGANY_DARK = "361E14"
COL_WALNUT = "63412D"
COL_OAK_FLOOR = "8A603E"
COL_OAK_LIGHT = "A67A52"
COL_MARBLE = "F2EDE3"
COL_MARBLE_WARM = "E3D9C8"
COL_MARBLE_DARK = "4A4644"
COL_GOLD = "D4AF5A"
COL_GOLD_DEEP = "A88438"
COL_CRIMSON = "7D1D28"
COL_CRIMSON_LIGHT = "9A2835"
COL_CRIMSON_DARK = "56121A"
COL_EMERALD = "24493C"
COL_LEATHER = "5C2B22"
COL_LEATHER_GREEN = "23473A"
COL_CREAM = "F6F1E6"
COL_GLASS = "C6DFEC"
COL_BRASS_DARK = "7A6032"
COL_IRON = "2E3136"
COL_FLAME = "FFD67A"
COL_EMBER = "FF7C2E"
COL_PORCELAIN = "F4F0E8"

BOOK_COLORS = (
    "7A232B",
    "243E5C",
    "274B3B",
    "8B5A2B",
    "5A3248",
    "3A4754",
    "A37438",
    "662B26",
    "335446",
    "4D392C",
    "C4A46B",
    "2B3348",
)


# ---------------------------------------------------------------------------
# Local Coordinate & Manifold Sub-Assembly Helpers
# ---------------------------------------------------------------------------


def _rot_xy(lx: float, ly: float, yaw: float) -> Tuple[float, float]:
    c, s = math.cos(yaw), math.sin(yaw)
    return (lx * c - ly * s, lx * s + ly * c)


def _wpt(origin: Vec3, yaw: float, lx: float, ly: float, lz: float) -> Vec3:
    rx, ry = _rot_xy(lx, ly, yaw)
    return (origin[0] + rx, origin[1] + ry, origin[2] + lz)


def _lbox(
    group: MeshGroup,
    origin: Vec3,
    yaw: float,
    lx: float,
    ly: float,
    lz: float,
    sx: float,
    sy: float,
    sz: float,
    color: str,
    *,
    tile: str,
    bevel: float = DEFAULT_BEVEL_M,
    uv_fit: Optional[bool] = None,
) -> None:
    add_beveled_box(
        group,
        _wpt(origin, yaw, lx, ly, lz),
        (sx, sy, sz),
        color=color,
        tile=tile,
        bevel=bevel,
        rot_z=yaw,
        uv_fit=uv_fit,
    )


def _lathe(
    group: MeshGroup,
    cx: float,
    cy: float,
    profile_rz: Sequence[Tuple[float, float]],
    *,
    sides: int = 12,
    color: str = "FFFFFF",
    tile: str = "wood_walnut",
) -> None:
    rings = [
        [(cx + r * math.cos(TAU * i / sides), cy + r * math.sin(TAU * i / sides), z) for i in range(sides)]
        for (r, z) in profile_rz
    ]
    group.rings(rings, color=color, tile=tile)


def _add_cushion(
    group: MeshGroup,
    origin: Vec3,
    yaw: float,
    lx: float,
    ly: float,
    lz: float,
    sx: float,
    sy: float,
    sz: float,
    color: str,
    *,
    tile: str = "fabric_velvet",
) -> None:
    """Watertight soft crowned cushion lofted with rounded corners."""
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    rad = min(0.055, hx * 0.32, hy * 0.32)
    ring2d: List[Tuple[float, float]] = []
    corners = (
        (hx - rad, hy - rad, 0.0),
        (-(hx - rad), hy - rad, math.pi * 0.5),
        (-(hx - rad), -(hy - rad), math.pi),
        (hx - rad, -(hy - rad), math.pi * 1.5),
    )
    for ccx, ccy, sa in corners:
        for i in range(4):
            a = sa + (math.pi * 0.5) * (i / 3.0)
            ring2d.append((ccx + rad * math.cos(a), ccy + rad * math.sin(a)))

    slices = (
        (-hz, 0.84),
        (-hz * 0.65, 0.985),
        (0.0, 1.00),
        (hz * 0.65, 0.985),
        (hz, 0.82),
    )
    rings = [
        [_wpt(origin, yaw, lx + px * sc, ly + py * sc, lz + dz) for (px, py) in ring2d]
        for (dz, sc) in slices
    ]
    group.rings(rings, color=color, tile=tile)


def _add_wall_sconce(
    wall_grp: MeshGroup,
    ceil_emissive: MeshGroup,
    origin: Vec3,
    rot_z: float,
) -> None:
    """Gilded twin-arm aristocratic wall sconce facing local -Y (wall at +Y)."""
    # Backplate & boss on wall
    _lbox(wall_grp, origin, rot_z, 0.0, -0.016, 0.0, 0.11, 0.026, 0.28, COL_GOLD, tile="hardware_brass", bevel=0.004)
    _lbox(wall_grp, origin, rot_z, 0.0, -0.036, -0.02, 0.055, 0.024, 0.065, COL_GOLD_DEEP, tile="hardware_brass", bevel=0.003)
    for sx in (-0.095, 0.095):
        pts = [
            _wpt(origin, rot_z, sx * 0.22, -0.042, -0.02),
            _wpt(origin, rot_z, sx * 0.72, -0.14, -0.05),
            _wpt(origin, rot_z, sx, -0.15, 0.05),
        ]
        add_pipe_frame(wall_grp, pts, radius=0.008, sides=6, bend_subdiv=2, bend_radius=0.025, flange_ends=False, color=COL_GOLD, tile="hardware_brass")
        bx, by, bz = _wpt(origin, rot_z, sx, -0.15, 0.056)
        _lathe(wall_grp, bx, by, ((0.014, bz - 0.006), (0.038, bz + 0.008), (0.022, bz + 0.014)), sides=8, color=COL_GOLD, tile="hardware_brass")
        _lathe(wall_grp, bx, by, ((0.012, bz + 0.018), (0.012, bz + 0.112), (0.008, bz + 0.116)), sides=8, color=COL_CREAM, tile="trim_paint")
        _lathe(
            ceil_emissive,
            bx,
            by,
            ((0.004, bz + 0.122), (0.015, bz + 0.144), (0.010, bz + 0.170), (0.003, bz + 0.188)),
            sides=6,
            color=COL_FLAME,
            tile="emissive_amber",
        )


# ---------------------------------------------------------------------------
# Section 1: BG_Floor (Grounded Structural Slab, Parquet & Hearth)
# ---------------------------------------------------------------------------


def build_floor(floor: MeshGroup) -> None:
    """Build grounded floor slab, inlaid parquet border strips, and marble hearth apron."""
    # Main sub-slab resting cleanly at Z=0.000 (slightly wider than walls -> zero welded edge seams)
    add_beveled_box(
        floor,
        (0.0, 0.0, SLAB_H * 0.5),
        (ROOM_W, ROOM_D, SLAB_H),
        color="5E5146",
        tile="stone_plinth",
        bevel=0.004,
    )
    # Main polished oak/walnut parquet field (top at FLOOR_Z = 0.120)
    add_beveled_box(
        floor,
        (0.0, 0.0, SLAB_H + 0.010),
        (ROOM_W - 0.12, ROOM_D - 0.12, 0.020),
        color=COL_OAK_FLOOR,
        tile="floor_wood",
        bevel=0.002,
    )
    # Recessed decorative lighter parquet inlay rectangle framing the study & parlor
    inlay_z = FLOOR_Z + 0.0025
    add_beveled_box(floor, (0.0, 3.35, inlay_z), (9.40, 0.14, 0.005), color=COL_OAK_LIGHT, tile="floor_wood", bevel=0.001)
    add_beveled_box(floor, (0.0, -3.35, inlay_z), (9.40, 0.14, 0.005), color=COL_OAK_LIGHT, tile="floor_wood", bevel=0.001)
    add_beveled_box(floor, (-4.62, 0.0, inlay_z), (0.14, 6.52, 0.005), color=COL_OAK_LIGHT, tile="floor_wood", bevel=0.001)
    add_beveled_box(floor, (4.62, 0.0, inlay_z), (0.14, 6.52, 0.005), color=COL_OAK_LIGHT, tile="floor_wood", bevel=0.001)

    # Raised marble fireplace hearth slab against West wall center (Y in [-1.55, +0.95])
    add_beveled_box(
        floor,
        (X_WEST_IN + 0.44, -0.35, FLOOR_Z + 0.022),
        (0.86, 2.38, 0.044),
        color=COL_MARBLE,
        tile="marble",
        bevel=0.005,
    )
    add_beveled_box(
        floor,
        (X_WEST_IN + 0.41, -0.35, FLOOR_Z + 0.048),
        (0.76, 2.16, 0.010),
        color=COL_MARBLE_DARK,
        tile="marble",
        bevel=0.002,
    )

    # Grand bordered parlor woven rug in Tea Zone (SW-center)
    add_beveled_box(
        floor,
        (-1.45, -1.25, FLOOR_Z + 0.005),
        (4.10, 3.35, 0.010),
        color=COL_CRIMSON_DARK,
        tile="carpet",
        bevel=0.0025,
    )
    add_beveled_box(
        floor,
        (-1.45, -1.25, FLOOR_Z + 0.0085),
        (3.72, 2.96, 0.007),
        color=COL_GOLD_DEEP,
        tile="carpet",
        bevel=0.0015,
    )
    add_beveled_box(
        floor,
        (-1.45, -1.25, FLOOR_Z + 0.0115),
        (3.48, 2.72, 0.006),
        color=COL_CRIMSON,
        tile="carpet",
        bevel=0.0015,
    )

    # Executive desk runner rug (North-East / Center-North study zone)
    add_beveled_box(
        floor,
        (1.65, 1.55, FLOOR_Z + 0.005),
        (3.20, 2.30, 0.010),
        color=COL_EMERALD,
        tile="carpet",
        bevel=0.0025,
    )
    add_beveled_box(
        floor,
        (1.65, 1.55, FLOOR_Z + 0.0085),
        (2.86, 1.96, 0.007),
        color=COL_GOLD_DEEP,
        tile="carpet",
        bevel=0.0015,
    )


# ---------------------------------------------------------------------------
# Section 2: Walls, Arched Windows, Boiserie Wainscoting & Celestial Mural
# ---------------------------------------------------------------------------


def _add_wainscot_panels(
    wall: MeshGroup,
    origin: Vec3,
    rot_z: float,
    x_spans: Sequence[Tuple[float, float]],
    *,
    y_face: float = -WALL_T * 0.5,
) -> None:
    """Add rich 3D aristocratic wood wainscoting + chair rail + gold picture molding."""
    for x0, x1 in x_spans:
        span = x1 - x0
        if span < 0.25:
            continue
        mx = 0.5 * (x0 + x1)
        # Lower mahogany dado panel backing
        _lbox(wall, origin, rot_z, mx, y_face - 0.014, 0.56, span - 0.02, 0.024, 0.88, COL_WAINSCOT, tile="wood_panel", bevel=0.003)
        # Chair rail cap at Z = 1.02
        _lbox(wall, origin, rot_z, mx, y_face - 0.028, 1.02, span, 0.046, 0.068, COL_MAHOGANY, tile="wood_panel", bevel=0.004)
        # Upper plaster picture frame molding
        _lbox(wall, origin, rot_z, mx, y_face - 0.014, 3.74, span - 0.08, 0.022, 0.044, COL_GOLD, tile="hardware_brass", bevel=0.003)
        # Recessed raised wainscot sub-panels
        n_sub = max(1, int(round(span / 0.82)))
        pw = (span - 0.14) / n_sub
        for k in range(n_sub):
            px = x0 + 0.07 + (k + 0.5) * pw
            _lbox(wall, origin, rot_z, px, y_face - 0.028, 0.56, max(0.16, pw - 0.12), 0.014, 0.62, COL_WALNUT, tile="wood_panel", bevel=0.003)


def _add_arched_window_trim(
    wall: MeshGroup,
    origin: Vec3,
    rot_z: float,
    offset_x: float,
    width: float,
    sill_z: float,
    height: float,
    arch_rise: float,
    *,
    y_face: float = -WALL_T * 0.5,
) -> None:
    """Add classical architrave jambs, gilded imposts, and arched window mullions."""
    # Add outer rectangular mullion sash inside the lower rectangular region
    sash_h = height - arch_rise * 0.35
    add_window_sash(
        wall,
        _wpt(origin, rot_z, offset_x, 0.0, sill_z),
        width=width,
        height=sash_h,
        wall_thickness=WALL_T,
        rot_z=rot_z,
        panes_x=2,
        panes_z=3,
        sliding=False,
        sill_overhang=0.055,
        frame_color=COL_MAHOGANY,
        frame_tile="wood_panel",
        sill_color=COL_MARBLE,
        sill_tile="marble",
        handle_color=COL_GOLD,
        handle_tile="hardware_brass",
        include_glass=True,
        glass_color=COL_GLASS,
        glass_tile="glass_tinted",
    )
    # Upper arched glass fanlight backing & radial muntins
    fan_z = sill_z + sash_h
    add_beveled_box(
        wall,
        _wpt(origin, rot_z, offset_x, 0.0, fan_z + arch_rise * 0.25),
        (width - 0.12, 0.010, max(0.18, arch_rise * 0.65)),
        color=COL_GLASS,
        tile="glass_tinted",
        bevel=0.001,
        rot_z=rot_z,
    )
    # Proud vertical architrave casings + gilded keystone
    for sx in (-1, 1):
        jx = offset_x + sx * (width * 0.5 + 0.055)
        _lbox(wall, origin, rot_z, jx, y_face - 0.022, sill_z + height * 0.45, 0.095, 0.038, height * 0.92, COL_PLASTER_DEEP, tile="trim_paint", bevel=0.004)
        _lbox(wall, origin, rot_z, jx, y_face - 0.032, sill_z + height - arch_rise, 0.135, 0.052, 0.068, COL_GOLD, tile="hardware_brass", bevel=0.004)
    _lbox(wall, origin, rot_z, offset_x, y_face - 0.034, sill_z + height + 0.04, 0.16, 0.056, 0.18, COL_GOLD, tile="hardware_brass", bevel=0.005)


def build_walls(groups: HeroSceneGroups) -> None:
    """Build North (Library Wall + Celestial Map), West (Fireplace + Arched Windows), East, South."""
    wall_len_ns = ROOM_W - 0.08  # 11.42 m
    wall_len_ew = ROOM_D - WALL_T * 2.0 - 0.08  # 8.44 m (clean non-overlapping corners)

    # 1. NORTH WALL (BG_Wall_North): Solid grand study back wall + celestial star-chart mural
    north_origin = (0.0, Y_NORTH_MID, FLOOR_Z)
    add_wall_with_openings(
        groups.wall_north,
        north_origin,
        length=wall_len_ns,
        thickness=WALL_T,
        height=WALL_H,
        openings=(),
        rot_z=0.0,
        color=COL_PLASTER,
        tile="plaster",
        baseboard_height=0.14,
        baseboard_depth=0.026,
        baseboard_color=COL_MAHOGANY,
        baseboard_tile="wood_panel",
        crown_height=0.18,
        crown_depth=0.065,
        crown_color=COL_GOLD,
        crown_tile="hardware_brass",
        interior_side=-1,
    )
    _add_wainscot_panels(groups.wall_north, north_origin, 0.0, ((2.55, 5.25),))

    # Framed Celestial Observatory Star Map (uses scene graphic tile `chalkboard`, color="FFFFFF"!)
    map_cx = 3.92
    map_cz = 2.48
    map_w, map_h = 1.92, 1.38
    _lbox(groups.wall_north, north_origin, 0.0, map_cx, -WALL_T * 0.5 - 0.024, map_cz, map_w + 0.16, 0.044, map_h + 0.16, COL_GOLD, tile="hardware_brass", bevel=0.006)
    _lbox(groups.wall_north, north_origin, 0.0, map_cx, -WALL_T * 0.5 - 0.038, map_cz, map_w + 0.06, 0.022, map_h + 0.06, COL_MAHOGANY, tile="wood_panel", bevel=0.004)
    _lbox(groups.wall_north, north_origin, 0.0, map_cx, -WALL_T * 0.5 - 0.052, map_cz, map_w, 0.014, map_h, "FFFFFF", tile="chalkboard", bevel=0.002, uv_fit=True)
    # Flanking brass wall sconces on North wall
    _add_wall_sconce(groups.wall_north, groups.ceiling, _wpt(north_origin, 0.0, 2.66, -WALL_T * 0.5, 2.48), 0.0)
    _add_wall_sconce(groups.wall_north, groups.ceiling, _wpt(north_origin, 0.0, 5.14, -WALL_T * 0.5, 2.48), 0.0)

    # 2. WEST WALL (BG_Wall_West): Central Marble Fireplace + 2 Towering Arched Windows
    west_origin = (X_WEST_MID, 0.0, FLOOR_Z)
    west_rot = math.pi * 0.5  # Local +X -> World +Y, Local -Y -> World +X (interior!)
    west_openings = (
        WallOpening(offset_x=-2.78, width=1.64, height=2.92, sill_z=0.58, kind="window", arch_rise=0.58, arch_segments=12),
        WallOpening(offset_x=2.36, width=1.64, height=2.92, sill_z=0.58, kind="window", arch_rise=0.58, arch_segments=12),
    )
    add_wall_with_openings(
        groups.wall_west,
        west_origin,
        length=wall_len_ew,
        thickness=WALL_T,
        height=WALL_H,
        openings=west_openings,
        rot_z=west_rot,
        color=COL_PLASTER,
        tile="plaster",
        baseboard_height=0.14,
        baseboard_depth=0.026,
        baseboard_color=COL_MAHOGANY,
        baseboard_tile="wood_panel",
        crown_height=0.18,
        crown_depth=0.065,
        crown_color=COL_GOLD,
        crown_tile="hardware_brass",
        interior_side=-1,
    )
    for op in west_openings:
        _add_arched_window_trim(groups.wall_west, west_origin, west_rot, op.offset_x, op.width, op.sill_z, op.height, op.arch_rise)
    _add_wainscot_panels(groups.wall_west, west_origin, west_rot, ((-4.12, -3.72), (-1.82, -1.28), (0.64, 1.42), (3.30, 4.12)))

    # Marble Fireplace Chimney Breast & Carved Surround centered at Y = -0.35 on West Wall
    _build_marble_fireplace(groups.wall_west, groups.props_clutter, groups.ceiling, y_center=-0.35)
    _add_wall_sconce(groups.wall_west, groups.ceiling, _wpt(west_origin, west_rot, -1.55, -WALL_T * 0.5, 2.38), west_rot)
    _add_wall_sconce(groups.wall_west, groups.ceiling, _wpt(west_origin, west_rot, 0.92, -WALL_T * 0.5, 2.38), west_rot)

    # 3. EAST WALL (BG_Wall_East): Grand Double Palace Study Doors + Tall Arched Window
    east_origin = (X_EAST_MID, 0.0, FLOOR_Z)
    east_rot = -math.pi * 0.5  # Local +X -> World -Y, Local -Y -> World -X (interior!)
    east_openings = (
        WallOpening(offset_x=-1.60, width=1.68, height=2.68, sill_z=0.0, kind="door", arch_rise=0.0),
        WallOpening(offset_x=1.85, width=1.68, height=2.92, sill_z=0.58, kind="window", arch_rise=0.58, arch_segments=12),
    )
    add_wall_with_openings(
        groups.wall_east,
        east_origin,
        length=wall_len_ew,
        thickness=WALL_T,
        height=WALL_H,
        openings=east_openings,
        rot_z=east_rot,
        color=COL_PLASTER,
        tile="plaster",
        baseboard_height=0.14,
        baseboard_depth=0.026,
        baseboard_color=COL_MAHOGANY,
        baseboard_tile="wood_panel",
        crown_height=0.18,
        crown_depth=0.065,
        crown_color=COL_GOLD,
        crown_tile="hardware_brass",
        interior_side=-1,
    )
    # Double walnut palace doors at offset_x = -1.60 (world Y = +1.60)
    add_door_frame(
        groups.wall_east,
        _wpt(east_origin, east_rot, -1.60, 0.0, 0.0),
        width=1.68,
        height=2.68,
        wall_thickness=WALL_T,
        rot_z=east_rot,
        open_deg=0.0,
        frame_color=COL_MAHOGANY_DARK,
        frame_tile="wood_panel",
        leaf_color=COL_MAHOGANY,
        leaf_tile="door_wood",
        handle_color=COL_GOLD,
        handle_tile="hardware_brass",
        panel_rows=2,
    )
    # Gilded door pediment above entrance
    _lbox(groups.wall_east, east_origin, east_rot, -1.60, -WALL_T * 0.5 - 0.055, 2.86, 1.98, 0.095, 0.16, COL_GOLD, tile="hardware_brass", bevel=0.005)
    _add_arched_window_trim(groups.wall_east, east_origin, east_rot, 1.85, 1.68, 0.58, 2.92, 0.58)
    _add_wainscot_panels(groups.wall_east, east_origin, east_rot, ((-4.12, -2.56), (-0.64, 0.90), (2.82, 4.12)))

    # 4. SOUTH WALL (BG_Wall_South): Twin Arched Windows + Wainscot (hides cleanly in Front & 3/4 cutaway)
    south_origin = (0.0, Y_SOUTH_MID, FLOOR_Z)
    south_rot = math.pi  # Local +X -> World -X, Local -Y -> World +Y (interior!)
    south_openings = (
        WallOpening(offset_x=-2.75, width=1.70, height=2.92, sill_z=0.58, kind="window", arch_rise=0.58, arch_segments=12),
        WallOpening(offset_x=2.75, width=1.70, height=2.92, sill_z=0.58, kind="window", arch_rise=0.58, arch_segments=12),
    )
    add_wall_with_openings(
        groups.wall_south,
        south_origin,
        length=wall_len_ns,
        thickness=WALL_T,
        height=WALL_H,
        openings=south_openings,
        rot_z=south_rot,
        color=COL_PLASTER,
        tile="plaster",
        baseboard_height=0.14,
        baseboard_depth=0.026,
        baseboard_color=COL_MAHOGANY,
        baseboard_tile="wood_panel",
        crown_height=0.18,
        crown_depth=0.065,
        crown_color=COL_GOLD,
        crown_tile="hardware_brass",
        interior_side=-1,
    )
    for op in south_openings:
        _add_arched_window_trim(groups.wall_south, south_origin, south_rot, op.offset_x, op.width, op.sill_z, op.height, op.arch_rise)
    _add_wainscot_panels(groups.wall_south, south_origin, south_rot, ((-5.52, -3.72), (-1.78, 1.78), (3.72, 5.52)))


def _build_marble_fireplace(
    wall_west: MeshGroup,
    props: MeshGroup,
    ceil_emissive: MeshGroup,
    *,
    y_center: float,
) -> None:
    """Grand carved marble fireplace with firewood logs, glowing embers, mantle clock & Imperial Crest."""
    x_wall = X_WEST_IN
    z0 = FLOOR_Z + 0.052

    # Chimney breast projection rising to ceiling
    add_beveled_box(wall_west, (x_wall + 0.22, y_center, FLOOR_Z + WALL_H * 0.5), (0.44, 2.26, WALL_H - 0.04), color=COL_PLASTER, tile="plaster", bevel=0.005)
    # Dark cast-iron firebox surround & recessed backing
    add_beveled_box(wall_west, (x_wall + 0.45, y_center, z0 + 0.56), (0.04, 1.18, 1.12), color=COL_IRON, tile="sash_metal", bevel=0.003)
    # Carved marble jamb pilasters & corbels flanking firebox
    for sy in (-0.82, 0.82):
        add_beveled_box(wall_west, (x_wall + 0.46, y_center + sy, z0 + 0.66), (0.36, 0.34, 1.32), color=COL_MARBLE, tile="marble", bevel=0.006)
        add_beveled_box(wall_west, (x_wall + 0.50, y_center + sy, z0 + 0.12), (0.42, 0.40, 0.22), color=COL_MARBLE_WARM, tile="marble", bevel=0.005)
        add_beveled_box(wall_west, (x_wall + 0.52, y_center + sy, z0 + 1.18), (0.42, 0.36, 0.24), color=COL_GOLD, tile="hardware_brass", bevel=0.005)
    # Carved marble lintel frieze + overhanging stepped mantelpiece shelf
    mantel_z = z0 + 1.48
    add_beveled_box(wall_west, (x_wall + 0.48, y_center, z0 + 1.28), (0.36, 2.02, 0.26), color=COL_MARBLE, tile="marble", bevel=0.006)
    add_beveled_box(wall_west, (x_wall + 0.66, y_center, z0 + 1.28), (0.04, 0.48, 0.16), color=COL_GOLD, tile="hardware_brass", bevel=0.004)
    add_beveled_box(wall_west, (x_wall + 0.50, y_center, mantel_z - 0.05), (0.50, 2.28, 0.10), color=COL_MARBLE_WARM, tile="marble", bevel=0.006)

    # Cast-iron fire grate, stacked oak firewood logs & glowing amber fire embers
    grate_x = x_wall + 0.58
    add_beveled_box(props, (grate_x, y_center, z0 + 0.075), (0.28, 0.82, 0.028), color=COL_IRON, tile="iron_dark", bevel=0.003)
    for dy in (-0.34, -0.17, 0.0, 0.17, 0.34):
        props.rail((grate_x - 0.10, y_center + dy, z0 + 0.098), (grate_x + 0.14, y_center + dy, z0 + 0.155), 0.011, COL_IRON, sides=6, tile="iron_dark")
    # Stacked firewood logs
    for log_dy, log_dz, yaw in ((-0.16, 0.17, 0.18), (0.14, 0.17, -0.15), (0.0, 0.26, 0.06), (-0.08, 0.31, -0.22)):
        a = _wpt((grate_x, y_center + log_dy, z0 + log_dz), yaw, 0.0, -0.24, 0.0)
        b = _wpt((grate_x, y_center + log_dy, z0 + log_dz), yaw, 0.0, 0.24, 0.0)
        props.rail(a, b, 0.050, "4C3323", sides=8, tile="wood_prop")
    # Glowing fire embers & warm hearth tongues (BG_Ceiling MAT_GLASS_EMISSIVE)
    for ex, ey, ez, er in (
        (grate_x + 0.03, y_center - 0.12, z0 + 0.19, 0.085),
        (grate_x + 0.02, y_center + 0.02, z0 + 0.29, 0.105),
        (grate_x + 0.04, y_center + 0.14, z0 + 0.21, 0.075),
    ):
        _lathe(
            ceil_emissive,
            ex,
            ey,
            ((er * 0.45, ez), (er, ez + 0.08), (er * 0.62, ez + 0.20), (0.012, ez + 0.30)),
            sides=7,
            color=COL_EMBER,
            tile="emissive_amber",
        )

    # Brass fireplace tools stand on hearth South side
    tool_x, tool_y = x_wall + 0.66, y_center - 0.94
    _lathe(props, tool_x, tool_y, ((0.11, z0), (0.09, z0 + 0.03), (0.016, z0 + 0.06), (0.014, z0 + 0.68), (0.032, z0 + 0.72)), sides=10, color=COL_GOLD, tile="brass_polished")

    # Antique Brass Mantle Clock centered on mantelpiece
    clock_x = x_wall + 0.56
    add_beveled_box(props, (clock_x, y_center, mantel_z + 0.05), (0.18, 0.44, 0.10), color=COL_MAHOGANY, tile="wood_prop", bevel=0.005)
    add_beveled_box(props, (clock_x, y_center, mantel_z + 0.22), (0.15, 0.32, 0.26), color=COL_GOLD, tile="brass_polished", bevel=0.006)
    props.rail((clock_x + 0.078, y_center, mantel_z + 0.23), (clock_x + 0.094, y_center, mantel_z + 0.23), 0.105, COL_CREAM, sides=16, tile="ceramic_gloss")
    # Clock hands (staggered 5mm in X so zero coincident edges)
    add_beveled_box(props, (clock_x + 0.101, y_center, mantel_z + 0.265), (0.004, 0.010, 0.072), color=COL_IRON, tile="iron_dark", bevel=0.001)
    add_beveled_box(props, (clock_x + 0.107, y_center + 0.032, mantel_z + 0.23), (0.004, 0.064, 0.010), color=COL_IRON, tile="iron_dark", bevel=0.001)

    # Flanking gilded candlesticks on mantelpiece
    for sy in (-0.72, 0.72):
        cy_c = y_center + sy
        _lathe(props, clock_x, cy_c, ((0.068, mantel_z), (0.048, mantel_z + 0.04), (0.018, mantel_z + 0.18), (0.048, mantel_z + 0.22)), sides=10, color=COL_GOLD, tile="brass_polished")
        _lathe(props, clock_x, cy_c, ((0.015, mantel_z + 0.224), (0.015, mantel_z + 0.36)), sides=8, color=COL_CREAM, tile="ceramic_gloss")
        _lathe(ceil_emissive, clock_x, cy_c, ((0.004, mantel_z + 0.366), (0.015, mantel_z + 0.390), (0.003, mantel_z + 0.434)), sides=6, color=COL_FLAME, tile="emissive_amber")

    # Grand Ornate Gold-Framed Ducal Crest Portrait above Fireplace (`paper_label` = _paint_imperial_crest, color="FFFFFF"!)
    port_z = mantel_z + 1.18
    port_w, port_h = 1.24, 1.56
    add_beveled_box(props, (x_wall + 0.47, y_center, port_z), (0.065, port_w + 0.20, port_h + 0.20), color=COL_GOLD, tile="brass_polished", bevel=0.008)
    add_beveled_box(props, (x_wall + 0.495, y_center, port_z), (0.032, port_w + 0.08, port_h + 0.08), color=COL_GOLD_DEEP, tile="brass_polished", bevel=0.004)
    add_beveled_box(props, (x_wall + 0.515, y_center, port_z), (0.018, port_w, port_h), color="FFFFFF", tile="paper_label", bevel=0.002, uv_fit=True)


# ---------------------------------------------------------------------------
# Section 3: BG_Ceiling (Coffered Walnut/Plaster Ceiling & Tiered Chandelier)
# ---------------------------------------------------------------------------


def build_ceiling(ceiling: MeshGroup) -> None:
    """Build deep coffered study ceiling and central 3-tier crystal chandelier."""
    # Upper roof slab (top at ROOF_TOP = 4.40)
    add_beveled_box(
        ceiling,
        (0.0, 0.0, CEIL_Z + 0.07),
        (ROOM_W - 0.04, ROOM_D - 0.04, 0.14),
        color=COL_PLASTER,
        tile="ceiling_plaster",
        bevel=0.004,
    )
    # Deep walnut & gold coffered grid beams (3x2 bays)
    beam_h = 0.22
    beam_z = CEIL_Z - beam_h * 0.5 + 0.004
    for bx in (-5.30, -1.78, 1.78, 5.30):
        add_beveled_box(ceiling, (bx, 0.0, beam_z), (0.28, ROOM_D - 0.42, beam_h), color=COL_MAHOGANY, tile="ceiling_wood", bevel=0.005)
        add_beveled_box(ceiling, (bx, 0.0, CEIL_Z - beam_h - 0.014), (0.20, ROOM_D - 0.52, 0.028), color=COL_GOLD, tile="ceiling_brass", bevel=0.003)
    for by in (-4.06, -1.35, 1.35, 4.06):
        add_beveled_box(ceiling, (0.0, by, beam_z), (ROOM_W - 0.46, 0.28, beam_h), color=COL_MAHOGANY, tile="ceiling_wood", bevel=0.005)
        add_beveled_box(ceiling, (0.0, by, CEIL_Z - beam_h - 0.014), (ROOM_W - 0.56, 0.20, 0.028), color=COL_GOLD, tile="ceiling_brass", bevel=0.003)

    # Central 3-tier gilded crystal chandelier (Hero Centerpiece!)
    add_tiered_crystal_chandelier(
        ceiling,
        (0.0, 0.0, CEIL_Z - 0.004),
        tiers=3,
        radius=1.02,
        drop_height=1.24,
        chain_length=0.36,
        arms_per_tier=(12, 8, 6),
        metal_color=COL_GOLD,
        metal_tile="ceiling_brass",
        crystal_color="ECF7FF",
        crystal_tile="glass_clear",
        candle_color=COL_CREAM,
        candle_tile="ceiling_plaster",
        flame_color=COL_FLAME,
        flame_tile="emissive_amber",
    )


# ---------------------------------------------------------------------------
# Section 4: Hero Furniture (Floor-to-Ceiling Arched Bookcases, Duke Desk, Parlor)
# ---------------------------------------------------------------------------


def _build_grand_bookcase_wall(furn: MeshGroup, props: MeshGroup) -> None:
    """Build triple-bay floor-to-ceiling arched mahogany bookcase (96+ antique books + rolling ladder)."""
    y_back = Y_NORTH_IN - 0.02
    depth = 0.44
    y_mid = y_back - depth * 0.5
    z0 = FLOOR_Z
    total_h = 3.88
    bay_centers = (-3.65, -1.45, 0.75)
    bay_w = 2.08
    total_w = 6.62
    cx_all = -1.45

    # Grounded plinth & continuous back panel
    add_beveled_box(furn, (cx_all, y_mid, z0 + 0.09), (total_w, depth + 0.06, 0.18), color=COL_MAHOGANY_DARK, tile="wood_walnut", bevel=0.005)
    add_beveled_box(furn, (cx_all, y_back - 0.018, z0 + total_h * 0.5), (total_w - 0.06, 0.032, total_h - 0.04), color=COL_MAHOGANY_DARK, tile="wood_walnut", bevel=0.003)

    # Lower closed credenza cabinet doors (Z = 0.18..0.88)
    add_beveled_box(furn, (cx_all, y_mid - 0.02, z0 + 0.52), (total_w - 0.08, depth + 0.04, 0.68), color=COL_MAHOGANY, tile="wood_walnut", bevel=0.004)
    add_beveled_box(furn, (cx_all, y_mid - 0.04, z0 + 0.88), (total_w + 0.06, depth + 0.10, 0.055), color=COL_WALNUT, tile="wood_walnut", bevel=0.005)

    # 4 Classical fluted vertical pilaster dividers between the 3 arched bays
    div_xs = (-4.72, -2.55, -0.35, 1.82)
    for dx in div_xs:
        add_beveled_box(furn, (dx, y_mid, z0 + total_h * 0.5), (0.14, depth + 0.04, total_h), color=COL_MAHOGANY, tile="wood_walnut", bevel=0.005)
        add_beveled_box(furn, (dx, y_back - depth - 0.032, z0 + 2.25), (0.10, 0.04, 2.75), color=COL_WALNUT, tile="wood_walnut", bevel=0.004)
        add_beveled_box(furn, (dx, y_back - depth - 0.046, z0 + 3.55), (0.15, 0.065, 0.11), color=COL_GOLD, tile="metal_brass_trim", bevel=0.004)
        add_beveled_box(furn, (dx, y_back - depth - 0.046, z0 + 0.94), (0.15, 0.065, 0.08), color=COL_GOLD, tile="metal_brass_trim", bevel=0.004)

    # Stepped gilded crown cornice at top
    add_beveled_box(furn, (cx_all, y_mid - 0.05, z0 + total_h - 0.12), (total_w + 0.14, depth + 0.14, 0.18), color=COL_MAHOGANY, tile="wood_walnut", bevel=0.006)
    add_beveled_box(furn, (cx_all, y_back - depth - 0.115, z0 + total_h - 0.05), (total_w + 0.18, 0.038, 0.055), color=COL_GOLD, tile="metal_brass_trim", bevel=0.003)

    # 6 shelves per bay + arched top valence + 96+ antique hardcovers
    shelf_zs = (1.30, 1.72, 2.14, 2.56, 2.98, 3.40)
    book_idx = 0
    for bi, bx in enumerate(bay_centers):
        # Credenza cabinet doors with brass knobs
        for door_s in (-0.48, 0.48):
            add_beveled_box(furn, (bx + door_s, y_back - depth - 0.052, z0 + 0.52), (0.86, 0.024, 0.56), color=COL_WALNUT, tile="wood_walnut", bevel=0.004)
            add_beveled_box(props, (bx + door_s * 0.45, y_back - depth - 0.078, z0 + 0.54), (0.026, 0.028, 0.026), color=COL_GOLD, tile="brass_polished", bevel=0.004)

        # Arched timber valence header at top of each bookcase bay
        for sx_a in (-0.72, 0.72):
            add_beveled_box(furn, (bx + sx_a, y_back - depth - 0.014, z0 + 3.60), (0.52, 0.042, 0.24), color=COL_MAHOGANY, tile="wood_walnut", bevel=0.004)
        add_beveled_box(furn, (bx, y_back - depth - 0.018, z0 + 3.68), (1.12, 0.046, 0.14), color=COL_GOLD_DEEP, tile="metal_brass_trim", bevel=0.004)

        # Shelves + antique leather-bound books (5-7 books per shelf x 18 shelves = ~108 books!)
        for si, sz in enumerate(shelf_zs):
            add_beveled_box(furn, (bx, y_mid - 0.01, z0 + sz), (bay_w - 0.16, depth - 0.04, 0.032), color=COL_WALNUT, tile="wood_walnut", bevel=0.003)
            # Fill each shelf with a curated block of upright books + occasional horizontal stack
            shelf_top = z0 + sz + 0.018
            cursor = bx - 0.88
            end_x = bx + 0.88
            while cursor + 0.16 < end_x:
                if (book_idx + si) % 7 == 0 and cursor + 0.30 < end_x:
                    # Horizontal stack of 3 antique folios
                    for k in range(3):
                        col = BOOK_COLORS[(book_idx + k) % len(BOOK_COLORS)]
                        bh = 0.042
                        add_beveled_box(
                            furn,
                            (cursor + 0.13, y_mid - 0.04, shelf_top + bh * 0.5 + k * (bh + 0.003)),
                            (0.24 - k * 0.016, 0.22 - k * 0.010, bh),
                            color=col,
                            tile="leather",
                            bevel=0.0025,
                        )
                    cursor += 0.30
                    book_idx += 3
                else:
                    # Upright hardcover volume with varied height & thickness
                    bt = 0.044 + (book_idx % 4) * 0.010
                    bh = 0.23 + ((book_idx * 5 + si) % 5) * 0.026
                    bd = 0.19 + (book_idx % 3) * 0.022
                    col = BOOK_COLORS[book_idx % len(BOOK_COLORS)]
                    add_beveled_box(
                        furn,
                        (cursor + bt * 0.5, y_mid - 0.04, shelf_top + bh * 0.5),
                        (bt - 0.004, bd, bh),
                        color=col,
                        tile="leather",
                        bevel=0.0025,
                    )
                    # Gold spine band on every 3rd book
                    if book_idx % 3 == 0:
                        add_beveled_box(
                            furn,
                            (cursor + bt * 0.5, y_mid - 0.04 - bd * 0.5 - 0.004, shelf_top + bh * 0.72),
                            (bt - 0.012, 0.006, 0.016),
                            color=COL_GOLD,
                            tile="metal_brass_trim",
                            bevel=0.001,
                        )
                    cursor += bt + 0.008 + (0.04 if book_idx % 6 == 5 else 0.0)
                    book_idx += 1

    # Continuous Brass Rolling Rail across entire bookcase at Z = 3.06
    rail_y = y_back - depth - 0.09
    rail_z = z0 + 3.06
    props.rail((div_xs[0] - 0.05, rail_y, rail_z), (div_xs[-1] + 0.05, rail_y, rail_z), 0.016, COL_GOLD, sides=10, tile="brass_polished")
    for dx in div_xs:
        props.rail((dx, y_back - depth - 0.01, rail_z), (dx, rail_y, rail_z), 0.012, COL_GOLD_DEEP, sides=8, tile="brass_polished")

    # Movable Wooden Rolling Library Ladder leaned cleanly against bay 2 (X = -2.05)
    lad_x = -2.05
    lad_w = 0.44
    y_bot = rail_y - 0.62
    y_top = rail_y - 0.01
    z_bot = z0 + 0.02
    z_top = rail_z + 0.06
    for sx in (-lad_w * 0.5, lad_w * 0.5):
        # Diagonal side rails
        furn.timber((lad_x + sx, y_bot, z_bot), (lad_x + sx, y_top, z_top), 0.036, 0.068, color=COL_WALNUT, tile="wood_walnut", bevel=0.004)
        # Brass rolling top hook & grounded bottom rubber foot
        props.rail((lad_x + sx, y_top, z_top), (lad_x + sx, rail_y + 0.02, rail_z + 0.02), 0.013, COL_GOLD, sides=8, tile="brass_polished")
        add_beveled_box(props, (lad_x + sx, y_bot, z0 + 0.016), (0.048, 0.068, 0.032), color=COL_IRON, tile="rubber_dark", bevel=0.003)
    # 9 flat beveled ladder treads
    for step_i in range(9):
        t = (step_i + 0.8) / 9.8
        sy_s = y_bot + (y_top - y_bot) * t
        sz_s = z_bot + (z_top - z_bot) * t
        add_beveled_box(furn, (lad_x, sy_s, sz_s), (lad_w - 0.04, 0.095, 0.024), color=COL_OAK_LIGHT, tile="wood_oak", bevel=0.003)


def _build_duke_executive_desk(furn: MeshGroup, props: MeshGroup, ceil_emissive: MeshGroup) -> None:
    """Build Northern Duke executive partner's desk, leather high-back chair, globe, quill & wax letters."""
    origin = (1.65, 1.55, FLOOR_Z)
    yaw = 0.0  # Desk faces South (-Y); Duke sits on North side (+Y) looking South into room!
    w, d, h = 2.04, 0.96, 0.78

    # Twin paneled mahogany pedestals with recessed drawer fronts & brass bail handles
    for sx in (-0.72, 0.72):
        _lbox(furn, origin, yaw, sx, 0.0, 0.05, 0.54, d - 0.08, 0.10, COL_MAHOGANY_DARK, tile="wood_walnut", bevel=0.004)
        _lbox(furn, origin, yaw, sx, 0.0, 0.41, 0.50, d - 0.12, 0.62, COL_MAHOGANY, tile="wood_walnut", bevel=0.005)
        for rz in (0.20, 0.41, 0.62):
            for side_y in (-1, 1):
                _lbox(furn, origin, yaw, sx, side_y * (d * 0.5 - 0.05), rz, 0.42, 0.022, 0.16, COL_WALNUT, tile="wood_walnut", bevel=0.003)
                _lbox(props, origin, yaw, sx, side_y * (d * 0.5 - 0.032), rz, 0.095, 0.022, 0.022, COL_GOLD, tile="brass_polished", bevel=0.003)

    # Central kneehole modesty panel & center pencil drawer
    _lbox(furn, origin, yaw, 0.0, -d * 0.42, 0.42, 0.94, 0.038, 0.64, COL_MAHOGANY, tile="wood_walnut", bevel=0.004)
    _lbox(furn, origin, yaw, 0.0, 0.0, 0.67, 0.92, d - 0.14, 0.11, COL_WALNUT, tile="wood_walnut", bevel=0.004)
    # Molded desk top slab + emerald leather embossed writing blotter
    _lbox(furn, origin, yaw, 0.0, 0.0, h - 0.03, w, d, 0.060, COL_MAHOGANY_DARK, tile="wood_walnut", bevel=0.006)
    _lbox(furn, origin, yaw, 0.0, 0.02, h + 0.006, 1.38, 0.68, 0.012, COL_LEATHER_GREEN, tile="leather", bevel=0.002)

    z_top = FLOOR_Z + h + 0.012
    # Open Ducal Archive Folio Ledger (`paper_book`, color="FFFFFF", uv_fit=True!)
    add_beveled_box(furn, (1.58, 1.56, z_top + 0.012), (0.44, 0.32, 0.022), color="FFFFFF", tile="paper_book", bevel=0.002, rot_z=0.08, uv_fit=True)
    # Wax-sealed parchment letters + red crimson wax seal
    add_beveled_box(props, (2.06, 1.48, z_top + 0.007), (0.22, 0.15, 0.010), color=COL_CREAM, tile="ceramic_gloss", bevel=0.001, rot_z=-0.22)
    props.rail((2.06, 1.48, z_top + 0.012), (2.06, 1.48, z_top + 0.022), 0.022, COL_CRIMSON_LIGHT, sides=10, tile="enamel_gloss")
    # Crystal Inkwell + Feather Quill Pen
    iq_x, iq_y = 1.92, 1.72
    add_beveled_box(props, (iq_x, iq_y, z_top + 0.028), (0.056, 0.056, 0.052), color=COL_GLASS, tile="glass_prop", bevel=0.004)
    props.rail((iq_x, iq_y, z_top + 0.054), (iq_x, iq_y, z_top + 0.072), 0.018, COL_GOLD, sides=8, tile="brass_polished")
    props.rail((iq_x, iq_y, z_top + 0.058), (iq_x + 0.075, iq_y + 0.045, z_top + 0.255), 0.005, COL_CREAM, sides=6, tile="ceramic_gloss")
    add_beveled_box(props, (iq_x + 0.062, iq_y + 0.036, z_top + 0.215), (0.045, 0.010, 0.135), color="FBF8F0", tile="fabric_prop", bevel=0.002, rot_z=0.55)

    # Brass 3-branch Desk Candelabrum on West corner of desk (staggered offsets -> 0 welded edges)
    cd_x, cd_y = 0.88, 1.32
    _lathe(props, cd_x, cd_y, ((0.085, z_top), (0.062, z_top + 0.04), (0.020, z_top + 0.26), (0.048, z_top + 0.30)), sides=10, color=COL_GOLD, tile="brass_polished")
    for dx_c in (-0.115, 0.0, 0.115):
        if abs(dx_c) > 0.01:
            sx_dir = 1.0 if dx_c > 0 else -1.0
            add_pipe_frame(props, [(cd_x + sx_dir * 0.024, cd_y, z_top + 0.22), (cd_x + dx_c * 0.65, cd_y, z_top + 0.185), (cd_x + dx_c, cd_y, z_top + 0.28)], radius=0.007, sides=6, flange_ends=False, color=COL_GOLD, tile="brass_polished")
        _lathe(props, cd_x + dx_c, cd_y, ((0.014, z_top + 0.306), (0.014, z_top + 0.425)), sides=8, color=COL_CREAM, tile="ceramic_gloss")
        _lathe(ceil_emissive, cd_x + dx_c, cd_y, ((0.004, z_top + 0.432), (0.014, z_top + 0.456), (0.003, z_top + 0.496)), sides=6, color=COL_FLAME, tile="emissive_amber")

    # Stacked reference books on East corner of desk
    for k, col in enumerate(("7A232B", "243E5C", "274B3B")):
        add_beveled_box(furn, (2.34, 1.36, z_top + 0.022 + k * 0.046), (0.28 - k * 0.02, 0.20 - k * 0.01, 0.042), color=col, tile="leather", bevel=0.003, rot_z=0.14 * (k - 1))

    # Antique Brass & Walnut Terrestrial Globe on freestanding turned floor stand beside desk!
    gx, gy = 3.16, 1.65
    _lathe(furn, gx, gy, ((0.22, FLOOR_Z), (0.18, FLOOR_Z + 0.06), (0.055, FLOOR_Z + 0.16), (0.042, FLOOR_Z + 0.62), (0.09, FLOOR_Z + 0.68)), sides=12, color=COL_MAHOGANY, tile="wood_walnut")
    # Equatorial wood horizon ring
    eq_z = FLOOR_Z + 0.96
    eq_r = 0.26
    eq_rings = []
    for i in range(18):
        a = TAU * i / 18.0
        ca, sa = math.cos(a), math.sin(a)
        eq_rings.append([
            (gx + (eq_r - 0.024) * ca, gy + (eq_r - 0.024) * sa, eq_z - 0.016),
            (gx + (eq_r + 0.024) * ca, gy + (eq_r + 0.024) * sa, eq_z - 0.016),
            (gx + (eq_r + 0.024) * ca, gy + (eq_r + 0.024) * sa, eq_z + 0.016),
            (gx + (eq_r - 0.024) * ca, gy + (eq_r - 0.024) * sa, eq_z + 0.016),
        ])
    furn.rings(eq_rings, color=COL_WALNUT, tile="wood_walnut", closed_loop=True)
    # 4 curved cradle struts + brass meridian ring + spherical antique parchment globe
    for i in range(4):
        a = TAU * i / 4.0 + 0.35
        add_pipe_frame(props, [(gx + 0.06 * math.cos(a), gy + 0.06 * math.sin(a), FLOOR_Z + 0.66), (gx + eq_r * math.cos(a), gy + eq_r * math.sin(a), eq_z - 0.01)], radius=0.012, sides=6, flange_ends=False, color=COL_GOLD, tile="brass_polished")
    # Faceted antique parchment sphere
    sphere_r = 0.21
    s_prof = []
    for k in range(9):
        ang = -math.pi * 0.46 + math.pi * 0.92 * (k / 8.0)
        s_prof.append((max(0.018, sphere_r * math.cos(ang)), eq_z + sphere_r * math.sin(ang)))
    _lathe(furn, gx, gy, s_prof, sides=16, color="DFC99B", tile="ceramic_matte")

    # Duke's High-Back Tufted Leather Executive Wing Chair behind desk (facing South)
    ch_o = (1.65, 2.38, FLOOR_Z)
    # 4 turned mahogany legs + caster glides
    for sx in (-0.28, 0.28):
        for sy in (-0.26, 0.26):
            _lathe(furn, ch_o[0] + sx, ch_o[1] + sy, ((0.026, FLOOR_Z), (0.032, FLOOR_Z + 0.24), (0.028, FLOOR_Z + 0.42)), sides=8, color=COL_MAHOGANY_DARK, tile="wood_walnut")
    _lbox(furn, ch_o, 0.0, 0.0, 0.0, 0.44, 0.68, 0.64, 0.12, COL_MAHOGANY, tile="wood_walnut", bevel=0.006)
    _add_cushion(furn, ch_o, 0.0, 0.0, -0.02, 0.54, 0.60, 0.56, 0.12, COL_LEATHER, tile="leather")
    # Tall sculpted tufted wingback + side wings + padded rolled arms
    _lbox(furn, ch_o, 0.0, 0.0, 0.28, 0.98, 0.68, 0.13, 0.92, COL_MAHOGANY_DARK, tile="wood_walnut", bevel=0.010)
    _add_cushion(furn, ch_o, 0.0, 0.0, 0.22, 0.96, 0.58, 0.10, 0.80, COL_LEATHER, tile="leather")
    _lbox(furn, ch_o, 0.0, 0.0, 0.27, 1.46, 0.54, 0.09, 0.08, COL_GOLD, tile="metal_brass_trim", bevel=0.006)
    for sx in (-0.32, 0.32):
        _lbox(furn, ch_o, 0.0, sx, 0.14, 1.10, 0.075, 0.24, 0.48, COL_LEATHER, tile="leather", bevel=0.010)
        _lbox(furn, ch_o, 0.0, sx, -0.02, 0.70, 0.095, 0.56, 0.085, COL_LEATHER, tile="leather", bevel=0.012)
        furn.rail((ch_o[0] + sx, ch_o[1] - 0.24, FLOOR_Z + 0.48), (ch_o[0] + sx, ch_o[1] - 0.24, FLOOR_Z + 0.67), 0.024, COL_MAHOGANY, sides=8, tile="wood_walnut")

    # 2 Guest Study Chairs in front of desk (facing North toward Duke)
    for gx_c, gyaw in ((1.10, math.pi - 0.18), (2.22, math.pi + 0.18)):
        _build_parlor_chair(furn, (gx_c, 0.42, FLOOR_Z), yaw=gyaw, width=0.58, fabric_color=COL_EMERALD)


def _build_parlor_chair(
    furn: MeshGroup,
    origin: Vec3,
    *,
    yaw: float = 0.0,
    width: float = 0.78,
    fabric_color: str = COL_CRIMSON,
) -> None:
    """Build a Baroque carved walnut & gold velvet parlor armchair facing local -Y."""
    d = 0.74
    sh = 0.46
    for sx in (-1, 1):
        for sy in (-1, 1):
            wx, wy, _ = _wpt(origin, yaw, sx * (width * 0.42), sy * (d * 0.38), 0.0)
            _lathe(furn, wx, wy, ((0.024, origin[2]), (0.032, origin[2] + 0.18), (0.028, origin[2] + sh - 0.06)), sides=8, color=COL_GOLD_DEEP, tile="metal_brass_trim")
    _lbox(furn, origin, yaw, 0.0, 0.0, sh - 0.05, width, d, 0.095, COL_MAHOGANY, tile="wood_walnut", bevel=0.006)
    _lbox(furn, origin, yaw, 0.0, 0.0, sh - 0.092, width - 0.04, d - 0.04, 0.024, COL_GOLD, tile="metal_brass_trim", bevel=0.003)
    _add_cushion(furn, origin, yaw, 0.0, -0.02, sh + 0.045, width - 0.12, d - 0.14, 0.13, fabric_color, tile="fabric_velvet")
    # Carved mahogany backrest frame + upholstered front/rear velvet panels + gilded top crest
    _lbox(furn, origin, yaw, 0.0, d * 0.40, sh + 0.34, width - 0.06, 0.095, 0.58, COL_MAHOGANY, tile="wood_walnut", bevel=0.010)
    _lbox(furn, origin, yaw, 0.0, d * 0.40, sh + 0.64, width * 0.62, 0.085, 0.065, COL_GOLD, tile="metal_brass_trim", bevel=0.008)
    _lbox(furn, origin, yaw, 0.0, d * 0.445, sh + 0.34, width - 0.18, 0.024, 0.44, fabric_color, tile="fabric_velvet", bevel=0.006)
    _add_cushion(furn, origin, yaw, 0.0, d * 0.34, sh + 0.35, width - 0.18, 0.10, 0.48, fabric_color, tile="fabric_velvet")
    # Sculpted arms
    for sx in (-1, 1):
        _lbox(furn, origin, yaw, sx * (width * 0.45), 0.02, sh + 0.24, 0.09, d - 0.14, 0.08, fabric_color, tile="fabric_velvet", bevel=0.012)
        p0 = _wpt(origin, yaw, sx * (width * 0.45), -d * 0.30, sh)
        p1 = _wpt(origin, yaw, sx * (width * 0.45), -d * 0.30, sh + 0.22)
        furn.rail(p0, p1, 0.024, COL_MAHOGANY, sides=8, tile="wood_walnut")


def _build_tea_parlor_zone(furn: MeshGroup, props: MeshGroup) -> None:
    """Build royal velvet parlor sofa, 2 armchairs, carved tea table, teapot & 2-tier dessert tray."""
    # 1. Velvet 3-Seat Parlor Sofa facing West toward the Fireplace!
    sofa_o = (-0.15, -1.25, FLOOR_Z)
    sofa_yaw = -math.pi * 0.5  # Local -Y -> World -X (facing West fireplace!)
    sw, sd, sh = 2.18, 0.86, 0.46
    for sx in (-sw * 0.44, 0.0, sw * 0.44):
        for sy in (-sd * 0.38, sd * 0.38):
            wx, wy, _ = _wpt(sofa_o, sofa_yaw, sx, sy, 0.0)
            _lathe(furn, wx, wy, ((0.026, FLOOR_Z), (0.036, FLOOR_Z + 0.16), (0.030, FLOOR_Z + sh - 0.06)), sides=8, color=COL_MAHOGANY_DARK, tile="wood_walnut")
    _lbox(furn, sofa_o, sofa_yaw, 0.0, 0.0, sh - 0.05, sw, sd, 0.11, COL_MAHOGANY, tile="wood_walnut", bevel=0.007)
    _lbox(furn, sofa_o, sofa_yaw, 0.0, 0.0, sh - 0.095, sw - 0.06, sd - 0.06, 0.026, COL_GOLD, tile="metal_brass_trim", bevel=0.004)
    # 3 plush seat cushions
    for cx_s in (-0.64, 0.0, 0.64):
        _add_cushion(furn, sofa_o, sofa_yaw, cx_s, -0.04, sh + 0.055, 0.61, 0.68, 0.14, COL_CRIMSON, tile="fabric_velvet")
    # Carved mahogany backrest + crimson velvet back upholstery panel + gilded Baroque crest rail
    _lbox(furn, sofa_o, sofa_yaw, 0.0, sd * 0.40, sh + 0.36, sw - 0.08, 0.11, 0.60, COL_MAHOGANY, tile="wood_walnut", bevel=0.012)
    _lbox(furn, sofa_o, sofa_yaw, 0.0, sd * 0.455, sh + 0.36, sw - 0.26, 0.028, 0.46, COL_CRIMSON_DARK, tile="fabric_velvet", bevel=0.008)
    _lbox(furn, sofa_o, sofa_yaw, 0.0, sd * 0.40, sh + 0.68, sw * 0.58, 0.09, 0.075, COL_GOLD, tile="metal_brass_trim", bevel=0.010)
    _add_cushion(furn, sofa_o, sofa_yaw, 0.0, sd * 0.32, sh + 0.36, sw - 0.24, 0.14, 0.50, COL_CRIMSON_LIGHT, tile="fabric_velvet")
    # Rolled arms + gold accent pillows
    for sx in (-1, 1):
        _lbox(furn, sofa_o, sofa_yaw, sx * (sw * 0.45), -0.02, sh + 0.24, 0.16, sd - 0.12, 0.24, COL_CRIMSON, tile="fabric_velvet", bevel=0.028)
        _add_cushion(furn, sofa_o, sofa_yaw, sx * 0.72, 0.14, sh + 0.26, 0.32, 0.14, 0.32, COL_GOLD if sx < 0 else COL_CREAM, tile="fabric_velvet")

    # 2. Two Velvet Armchairs framing the Tea Table (North & South sides)
    _build_parlor_chair(furn, (-2.15, 0.28, FLOOR_Z), yaw=-0.42, width=0.82, fabric_color=COL_CRIMSON)
    _build_parlor_chair(furn, (-2.15, -2.68, FLOOR_Z), yaw=math.pi + 0.42, width=0.82, fabric_color=COL_CRIMSON)

    # 3. Low Carved Marble-Top Tea Table centered at (-1.80, -1.25)
    t_o = (-1.80, -1.25, FLOOR_Z)
    tw, td, th = 1.08, 1.48, 0.50
    for sx in (-tw * 0.40, tw * 0.40):
        for sy in (-td * 0.40, td * 0.40):
            _lathe(furn, t_o[0] + sx, t_o[1] + sy, ((0.026, FLOOR_Z), (0.036, FLOOR_Z + 0.22), (0.030, FLOOR_Z + th - 0.08)), sides=8, color=COL_GOLD, tile="metal_brass_trim")
    _lbox(furn, t_o, 0.0, 0.0, 0.0, th - 0.08, tw - 0.08, td - 0.08, 0.085, COL_WALNUT, tile="wood_walnut", bevel=0.005)
    _lbox(furn, t_o, 0.0, 0.0, 0.0, th - 0.022, tw, td, 0.044, COL_MARBLE, tile="ceramic_matte", bevel=0.006)

    # 4. Tea Service Props on Tea Table: Gilded Teapot, 4 Teacups & Saucers, 2-Tier Dessert Tray!
    tz = FLOOR_Z + th
    # Gilded porcelain teapot
    tp_x, tp_y = -1.72, -1.52
    _lathe(props, tp_x, tp_y, ((0.052, tz), (0.088, tz + 0.065), (0.072, tz + 0.13), (0.044, tz + 0.155), (0.055, tz + 0.175), (0.018, tz + 0.205)), sides=12, color=COL_PORCELAIN, tile="ceramic_gloss")
    add_pipe_frame(props, [(tp_x + 0.075, tp_y, tz + 0.06), (tp_x + 0.145, tp_y, tz + 0.12), (tp_x + 0.155, tp_y, tz + 0.16)], radius=0.010, sides=6, flange_ends=False, color=COL_GOLD, tile="brass_polished")
    add_pipe_frame(props, [(tp_x - 0.075, tp_y, tz + 0.13), (tp_x - 0.135, tp_y, tz + 0.11), (tp_x - 0.075, tp_y, tz + 0.05)], radius=0.008, sides=6, flange_ends=False, color=COL_GOLD, tile="brass_polished")

    # 2-Tier Gilded Dessert Tray Stand with Pastel Macarons & Mini Cakes!
    ds_x, ds_y = -1.84, -0.96
    _lathe(props, ds_x, ds_y, ((0.068, tz), (0.020, tz + 0.04), (0.014, tz + 0.34), (0.032, tz + 0.38)), sides=10, color=COL_GOLD, tile="brass_polished")
    # Lower plate (radius 0.165) & Upper plate (radius 0.120)
    _lathe(props, ds_x, ds_y, ((0.145, tz + 0.075), (0.168, tz + 0.092), (0.162, tz + 0.098)), sides=14, color=COL_PORCELAIN, tile="ceramic_gloss")
    _lathe(props, ds_x, ds_y, ((0.102, tz + 0.225), (0.122, tz + 0.242), (0.116, tz + 0.248)), sides=14, color=COL_PORCELAIN, tile="ceramic_gloss")
    pastry_cols = ("E6A4A8", "F2DF98", "B6D4A8", "D69E76", "F5ECE0")
    for k in range(5):
        a = TAU * k / 5.0
        px = ds_x + 0.10 * math.cos(a)
        py = ds_y + 0.10 * math.sin(a)
        _lathe(props, px, py, ((0.026, tz + 0.098), (0.028, tz + 0.115), (0.024, tz + 0.130)), sides=8, color=pastry_cols[k], tile="enamel_gloss")
    for k in range(3):
        a = TAU * k / 3.0 + 0.4
        px = ds_x + 0.062 * math.cos(a)
        py = ds_y + 0.062 * math.sin(a)
        _lathe(props, px, py, ((0.024, tz + 0.248), (0.025, tz + 0.268), (0.018, tz + 0.285)), sides=8, color=pastry_cols[(k + 2) % 5], tile="enamel_gloss")

    # 4 Porcelain Teacups & Saucers
    for cx_t, cy_t in ((-1.46, -1.16), (-1.46, -1.66), (-2.10, -1.48), (-2.12, -0.82)):
        _lathe(props, cx_t, cy_t, ((0.044, tz), (0.068, tz + 0.012), (0.064, tz + 0.016)), sides=10, color=COL_PORCELAIN, tile="ceramic_gloss")
        _lathe(props, cx_t, cy_t, ((0.026, tz + 0.018), (0.042, tz + 0.072), (0.038, tz + 0.074)), sides=10, color=COL_PORCELAIN, tile="ceramic_gloss")
        props.rail((cx_t, cy_t, tz + 0.064), (cx_t, cy_t, tz + 0.068), 0.036, "9A6634", sides=8, tile="enamel_gloss", bevel_ends=False)

    # Carved Mahogany Sideboard Console & Decorative Urn in South-East Quadrant
    sb_x, sb_y = 3.25, -2.55
    add_beveled_box(furn, (sb_x, sb_y, FLOOR_Z + 0.42), (1.42, 0.48, 0.80), color=COL_MAHOGANY, tile="wood_walnut", bevel=0.005)
    add_beveled_box(furn, (sb_x, sb_y, FLOOR_Z + 0.84), (1.48, 0.54, 0.048), color=COL_MARBLE, tile="ceramic_matte", bevel=0.006)
    for dx_d in (-0.42, 0.0, 0.42):
        add_beveled_box(furn, (sb_x + dx_d, sb_y + 0.244, FLOOR_Z + 0.44), (0.36, 0.018, 0.56), color=COL_WALNUT, tile="wood_walnut", bevel=0.004)
        add_beveled_box(props, (sb_x + dx_d, sb_y + 0.262, FLOOR_Z + 0.48), (0.026, 0.024, 0.026), color=COL_GOLD, tile="brass_polished", bevel=0.004)
    _lathe(props, sb_x - 0.38, sb_y, ((0.08, FLOOR_Z + 0.868), (0.14, FLOOR_Z + 1.04), (0.09, FLOOR_Z + 1.18), (0.11, FLOOR_Z + 1.23)), sides=12, color=COL_PORCELAIN, tile="ceramic_gloss")
    for k, col in enumerate(("7A232B", "243E5C")):
        add_beveled_box(furn, (sb_x + 0.34, sb_y, FLOOR_Z + 0.888 + k * 0.044), (0.28, 0.20, 0.040), color=col, tile="leather", bevel=0.003, rot_z=0.12 * k)


def _build_curtains_and_plants(furn: MeshGroup) -> None:
    """Add pleated velvet draped curtains with tiebacks on West arched windows + grand foliage planters."""
    # West wall arched windows (always visible in Front & 3/4 Hero cutaway!):
    # Each arched window has twin pleated crimson velvet panels with golden tiebacks!
    west_win_ys = (-2.78, 2.36)
    for wy in west_win_ys:
        # Left (South) panel & Right (North) panel hanging from Z=3.72 down to floor Z=0.14
        add_pleated_curtain(
            furn,
            (X_WEST_IN + 0.11, wy - 0.62, FLOOR_Z + 0.02),
            width=0.72,
            height=3.54,
            depth=0.10,
            pleats=5,
            rot_z=math.pi * 0.5,
            tieback_height=0.38,
            tieback_pull=0.22,
            tieback_side=-1,
            include_rod=True,
            rod_overhang=0.12,
            include_rings=True,
            color=COL_CRIMSON,
            tile="fabric_velvet",
            rod_color=COL_GOLD,
            rod_tile="metal_brass_trim",
            tieback_color=COL_GOLD,
            tieback_tile="metal_brass_trim",
        )
        add_pleated_curtain(
            furn,
            (X_WEST_IN + 0.11, wy + 0.62, FLOOR_Z + 0.02),
            width=0.72,
            height=3.54,
            depth=0.10,
            pleats=5,
            rot_z=math.pi * 0.5,
            tieback_height=0.38,
            tieback_pull=0.22,
            tieback_side=1,
            include_rod=True,
            rod_overhang=0.12,
            include_rings=True,
            color=COL_CRIMSON,
            tile="fabric_velvet",
            rod_color=COL_GOLD,
            rod_tile="metal_brass_trim",
            tieback_color=COL_GOLD,
            tieback_tile="metal_brass_trim",
        )

    # Grand classical fluted pilasters framing the study corners
    for cx_col, cy_col in ((-5.16, 3.88), (5.16, 3.88)):
        add_column_fluted(
            furn,
            (cx_col, cy_col, FLOOR_Z),
            radius=0.17,
            height=WALL_H - 0.18,
            flutes=10,
            flute_depth=0.012,
            color=COL_MARBLE,
            tile="ceramic_matte",
            accent_color=COL_GOLD,
            accent_tile="metal_brass_trim",
        )

    # Large Potted Botanical Plants (add_curved_foliage_plant)
    add_curved_foliage_plant(
        furn,
        (-4.72, 3.42, FLOOR_Z),
        species="palm",
        height=1.72,
        pot_radius=0.22,
        pot_height=0.44,
        leaf_count=10,
        rot_z=0.4,
        seed=17,
        pot_color=COL_PORCELAIN,
        pot_tile="ceramic_matte",
        soil_tile="wood_walnut",
        leaf_color="38613E",
    )
    add_curved_foliage_plant(
        furn,
        (4.65, 3.55, FLOOR_Z),
        species="ficus",
        height=1.62,
        pot_radius=0.20,
        pot_height=0.42,
        leaf_count=10,
        rot_z=2.1,
        seed=31,
        pot_color="8C583E",
        pot_tile="ceramic_matte",
        soil_tile="wood_walnut",
        leaf_color="3E6A42",
    )
    add_curved_foliage_plant(
        furn,
        (-4.58, -3.52, FLOOR_Z),
        species="monstera",
        height=1.28,
        pot_radius=0.19,
        pot_height=0.38,
        leaf_count=9,
        rot_z=0.9,
        seed=53,
        pot_color=COL_PORCELAIN,
        pot_tile="ceramic_matte",
        soil_tile="wood_walnut",
        leaf_color="365F3A",
    )


# ---------------------------------------------------------------------------
# Scene Assembly, 6-View Cameras, Manifest & 5-Gate QA Entrypoint
# ---------------------------------------------------------------------------


def build_scene_groups() -> HeroSceneGroups:
    groups = HeroSceneGroups()
    build_floor(groups.floor)
    build_walls(groups)
    build_ceiling(groups.ceiling)
    _build_grand_bookcase_wall(groups.furniture_hero, groups.props_clutter)
    _build_duke_executive_desk(groups.furniture_hero, groups.props_clutter, groups.ceiling)
    _build_tea_parlor_zone(groups.furniture_hero, groups.props_clutter)
    _build_curtains_and_plants(groups.furniture_hero)
    groups.ground_to_zero()
    return groups


def build_six_views() -> List[PreviewCameraView]:
    return [
        PreviewCameraView(
            key="front",
            label="1 FRONT STUDY",
            location=(0.15, -9.85, 2.25),
            target=(-0.10, 1.20, 1.95),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_South", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="side",
            label="2 SIDE FIREPLACE",
            location=(9.65, -0.35, 2.15),
            target=(-3.80, -0.35, 1.85),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_East",),
        ),
        PreviewCameraView(
            key="back",
            label="3 PARLOR & DESK",
            location=(4.25, 2.85, 1.92),
            target=(-2.35, -1.35, 1.38),
            lens_mm=26.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(8.85, -7.85, 6.40),
            target=(-0.45, 0.35, 1.45),
            lens_mm=30.0,
            hide_nodes=("BG_Wall_South", "BG_Wall_East", "BG_Ceiling", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 INTERIOR 28MM",
            location=(2.45, -2.95, 1.66),
            target=(-2.15, 1.15, 1.88),
            lens_mm=26.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(0.80, -7.40, 12.20),
            target=(-0.10, 0.10, 0.90),
            lens_mm=30.0,
            hide_nodes=("BG_Ceiling", "BG_Wall_South", "BG_Cutaway_Front"),
        ),
    ]


def build_manifest_cameras() -> Dict[str, Any]:
    def _to_gltf(p: Sequence[float]) -> List[float]:
        return [round(float(p[0]), 3), round(float(p[2]), 3), round(-float(p[1]), 3)]

    return {
        "dukeDeskWide28mm": {
            "label": "28mm 북부대공 서재 광각",
            "position": _to_gltf((2.45, -2.95, 1.66)),
            "target": _to_gltf((-2.15, 1.15, 1.88)),
            "lensMm": 28,
        },
        "teaParlorDialogue35mm": {
            "label": "35mm 티타임 응접 대화 컷",
            "position": _to_gltf((1.85, -2.65, 1.48)),
            "target": _to_gltf((-2.65, -0.95, 1.38)),
            "lensMm": 35,
        },
        "fireplacePortrait50mm": {
            "label": "50mm 벽난로 클로즈업",
            "position": _to_gltf((-0.85, -1.65, 1.56)),
            "target": _to_gltf((-5.10, -0.35, 1.75)),
            "lensMm": 50,
        },
    }


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    raw = list(argv)
    if "--" in raw:
        raw = raw[raw.index("--") + 1 :]
    elif any(tok in raw for tok in ("--background", "-b", "--python", "-P", "--factory-startup")):
        raw = []
    parser = argparse.ArgumentParser(description=f"Build ToonStudio Hero BG v2: {SLUG}")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--preview-copy-dir", type=Path, default=DEFAULT_PREVIEW_COPY_DIR)
    parser.add_argument("--desktop-primary-size", type=int, default=1024)
    parser.add_argument("--desktop-secondary-size", type=int, default=1024)
    parser.add_argument("--mobile-opaque-size", type=int, default=1024)
    parser.add_argument("--mobile-glass-size", type=int, default=512)
    parser.add_argument("--tile-resolution", type=int, default=512)
    parser.add_argument("--lighting-preset", type=str, default="day_5600k")
    parser.add_argument("--skip-previews", action="store_true")
    return parser.parse_args(raw)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module=FREESTYLE_SVG_ADDON)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    args.out_dir.mkdir(parents=True, exist_ok=True)
    groups = build_scene_groups()

    # 1. Mobile 4-node build, Gate 1 audit, meshopt GLB export, Gate 2 inspect
    mobile_scene = assemble_mobile_cutaway(
        SLUG,
        groups,
        opaque_size=args.mobile_opaque_size,
        glass_size=args.mobile_glass_size,
        auto_ground=False,
        scene_slug=SLUG,
    )
    gate1_mobile = audit_blender_scene(mobile_scene.root, profile="mobile")
    mobile_glb = args.out_dir / "mobile.glb"
    mobile_export = export_cutaway_glb(mobile_scene, mobile_glb, optimize_meshopt=True, copyright_text=DEFAULT_COPYRIGHT)
    gate2_mobile = inspect_glb(mobile_glb, profile="mobile", require_meshopt=True, run_validate=True)
    _remove_hierarchy(mobile_scene)

    # 2. Desktop 8-node build, Gate 1 audit, meshopt GLB export, Gate 2 inspect
    desktop_scene = assemble_desktop_cutaway(
        SLUG,
        groups,
        primary_size=args.desktop_primary_size,
        secondary_size=args.desktop_secondary_size,
        auto_ground=False,
        scene_slug=SLUG,
    )
    gate1_desktop = audit_blender_scene(desktop_scene.root, profile="desktop")
    desktop_glb = args.out_dir / "desktop.glb"
    desktop_export = export_cutaway_glb(desktop_scene, desktop_glb, optimize_meshopt=True, copyright_text=DEFAULT_COPYRIGHT)
    gate2_desktop = inspect_glb(desktop_glb, profile="desktop", require_meshopt=True, run_validate=True)

    # 3. Render 6-view BLENDER_EEVEE contact sheet + 3-tier Freestyle SVG
    sheet_report: Optional[Dict[str, Any]] = None
    svg_report: Optional[Dict[str, Any]] = None
    if not args.skip_previews:
        views = build_six_views()
        sheet_path = args.out_dir / "contact_sheet.png"
        sheet_report = render_six_view_contact_sheet(
            sheet_path,
            root_obj=desktop_scene.root,
            views=views,
            tile_resolution=args.tile_resolution,
            interior_cutaway=True,
            lighting_preset=args.lighting_preset,
        )
        args.preview_copy_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(sheet_path, args.preview_copy_dir / f"{SLUG}_contact_sheet.png")

        svg_path = args.out_dir / "freestyle.svg"
        svg_report = render_freestyle_svg(
            svg_path,
            root_obj=desktop_scene.root,
            view=views[3],
            resolution=args.tile_resolution,
            interior_cutaway=True,
        )

    # 4. Write manifest.json with 3-time-of-day lightingPresets & Freestyle SVG metadata
    d_sum = gate2_desktop["summary"]
    m_sum = gate2_mobile["summary"]
    manifest: Dict[str, Any] = {
        "assetId": SLUG,
        "version": "hero-v2",
        "cutawayContract": "room-v1",
        "fileName": "desktop.glb",
        "byteSize": desktop_export["byteSize"],
        "sha256": desktop_export["sha256"],
        "bounds": desktop_export["bounds"],
        "nodes": desktop_export["nodeNames"],
        "triangles": d_sum["triangles"],
        "drawCalls": d_sum["draw_calls"],
        "materials": d_sum["materials"],
        "mobile": {
            "fileName": "mobile.glb",
            "byteSize": mobile_export["byteSize"],
            "sha256": mobile_export["sha256"],
            "nodes": mobile_export["nodeNames"],
            "triangles": m_sum["triangles"],
            "drawCalls": m_sum["draw_calls"],
            "materials": m_sum["materials"],
        },
        "cameras": build_manifest_cameras(),
        "lightingPresets": build_lighting_presets(),
    }
    if svg_report is not None:
        manifest["freestyleSvg"] = {
            "path": "freestyle.svg",
            "byteSize": svg_report["byteSize"],
            "pathCount": svg_report["pathCount"],
            "strokeWidths": svg_report["strokeWidths"],
            "lineSets": svg_report["lineSets"],
        }
    if sheet_report is not None:
        manifest["contactSheet"] = {
            "path": "contact_sheet.png",
            "byteSize": sheet_report["byteSize"],
            "dimensions": sheet_report["sheetDimensions"],
            "lightingPreset": sheet_report["lightingPreset"],
        }
    manifest_path = args.out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # 5. Enforce Hero BG v2 hard budgets
    budget_errors: List[str] = []
    if d_sum["triangles"] > 250_000:
        budget_errors.append(f"Desktop tris {d_sum['triangles']} > 250,000")
    if d_sum["byte_size"] > 12 * 1024 * 1024:
        budget_errors.append(f"Desktop bytes {d_sum['byte_size']} > 12 MiB")
    if m_sum["triangles"] > 80_000:
        budget_errors.append(f"Mobile tris {m_sum['triangles']} > 80,000")
    if m_sum["byte_size"] > 4 * 1024 * 1024:
        budget_errors.append(f"Mobile bytes {m_sum['byte_size']} > 4 MiB")
    if svg_report is not None and svg_report["byteSize"] > 2_500_000:
        budget_errors.append(f"Freestyle SVG {svg_report['byteSize']} > 2.5 MB")

    passed = bool(
        gate1_desktop["passed"]
        and gate1_mobile["passed"]
        and gate2_desktop["passed"]
        and gate2_mobile["passed"]
        and len(budget_errors) == 0
    )

    summary = {
        "slug": SLUG,
        "passed": passed,
        "budgetErrors": budget_errors,
        "gate1_desktop_errors": gate1_desktop["errors"],
        "gate1_mobile_errors": gate1_mobile["errors"],
        "gate2_desktop_errors": gate2_desktop["errors"],
        "gate2_mobile_errors": gate2_mobile["errors"],
        "desktop": {
            "path": str(desktop_glb),
            "bytes": d_sum["byte_size"],
            "sha256": desktop_export["sha256"],
            "triangles": d_sum["triangles"],
            "drawCalls": d_sum["draw_calls"],
            "materials": d_sum["materials"],
            "boundsGltf": d_sum["bounds_gltf"],
            "minYGltf": d_sum["min_y_gltf"],
        },
        "mobile": {
            "path": str(mobile_glb),
            "bytes": m_sum["byte_size"],
            "sha256": mobile_export["sha256"],
            "triangles": m_sum["triangles"],
            "drawCalls": m_sum["draw_calls"],
            "materials": m_sum["materials"],
            "boundsGltf": m_sum["bounds_gltf"],
            "minYGltf": m_sum["min_y_gltf"],
        },
        "freestyleSvg": svg_report,
        "contactSheet": sheet_report,
        "manifestPath": str(manifest_path),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
