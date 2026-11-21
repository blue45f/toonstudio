"""ToonStudio Hero BG v2 #6: Korean 24-Hour Convenience Store (Interior & Storefront).

Builds ``kr_convenience_store_night`` (11.0 x 8.0 x 3.2 m) in Blender 5.3 headless
using the shared ``webtoon_hero_bg`` v2 core:
  - Exterior Storefront & Sidewalk (South, Y in [-4.0, -1.65]):
    * Full-height storefront glazing with slim charcoal aluminum mullions & automatic
      sliding entrance door
    * Illuminated Korean 24H convenience store brand fascia signboard (``emissive_neon``,
      ``color="FFFFFF"`` -> "24시 편의점 · TOON24") with emerald/amber/cobalt brand bands
      + glowing projecting side sign (``emissive_amber``, "1+1 · 도시락커피 · 1,500원")
    * 2 outdoor plastic parasol table & chair sets (2 tables, 4 chairs, 2 striped parasols)
      + tall sidewalk streetlamp + waste bin
  - Interior Store (10.6 x 5.5 m):
    * L-shaped checkout counter (2 POS dual-screen monitors, barcode scanners, card readers,
      hot beverage warmer cabinet ``온장고``, steamed fishcake/bun showcase ``어묵/호빵 케이스``,
      impulse candy racks, back-wall display + glowing ``emissive_rose`` hot-snack header)
    * 4-door glass walk-in beverage refrigerator wall (North wall) packed with 3D rows of
      colorful drink bottles & aluminum cans + ``paper_label`` beverage showcase graphics
      + illuminated green ``emissive_exit_green`` ("비상구 / EXIT") sign
    * 3 central double-sided gondola merchandising aisles stocked with 3D ramen packs,
      snack boxes, and an East-wall open chilled kimbap/dosirak showcase
    * Panoramic front window eating bar (4 tall bar stools, 2 commercial microwave ovens,
      hot-water dispenser ``온수기``, cup ramen bowls & chopsticks holder)
    * Commercial T-bar acoustic grid ceiling with crisp cool-white LED strip fixtures.

Outputs under ``apps/web/public/assets/3d/environments/hero-v2/kr_convenience_store_night/``:
  - ``desktop.glb``, ``mobile.glb``, ``manifest.json``, ``freestyle.svg``, ``contact_sheet.png``
  - Preview copy: ``loop-stack/v2-previews/bg/kr_convenience_store_night_contact_sheet.png``
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
    add_door_frame,
    add_pipe_frame,
    add_wall_with_openings,
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
SLUG = "kr_convenience_store_night"
DEFAULT_OUT_DIR = _REPO_ROOT / "apps/web/public/assets/3d/environments/hero-v2" / SLUG
DEFAULT_PREVIEW_COPY_DIR = _REPO_ROOT / "loop-stack/v2-previews/bg"

Vec3 = Tuple[float, float, float]

# ---------------------------------------------------------------------------
# Master Spatial Dimensions (11.00 m x 8.00 m x 3.20 m)
# ---------------------------------------------------------------------------
FOOT_W = 11.00
FOOT_D = 8.00
X_MIN = -5.50
X_MAX = 5.50
Y_MIN = -4.00
Y_MAX = 4.00

WALL_T = 0.18
X_WEST_MID = -5.36
X_EAST_MID = 5.36
X_WEST_IN = X_WEST_MID + WALL_T * 0.5  # -5.27
X_EAST_IN = X_EAST_MID - WALL_T * 0.5  # +5.27

Y_NORTH_MID = 3.86
Y_NORTH_IN = Y_NORTH_MID - WALL_T * 0.5  # +3.77
Y_FRONT_GLASS = -1.62  # Full-height storefront glazing line (sidewalk in [-4.00, -1.62])

SIDEWALK_Z = 0.08
FLOOR_Z = 0.12
STORE_H = 2.94
CEIL_Z = FLOOR_Z + STORE_H  # 3.06
ROOF_TOP = 3.20

# ---------------------------------------------------------------------------
# Korean 24H Convenience Store Palette (Crisp White, Emerald, Amber, Cobalt)
# ---------------------------------------------------------------------------
COL_EMERALD = "009E60"
COL_AMBER = "F59E0B"
COL_COBALT = "1B3E78"
COL_TILE_FLOOR = "F8F7F2"
COL_SIDEWALK = "C2C4C8"
COL_ASPHALT = "3A3E46"
COL_WALL_WHITE = "FFFFFF"
COL_WALL_PANEL = "E8ECF0"
COL_MULLION = "2E343C"
COL_GONDOLA = "FFFFFF"
COL_GONDOLA_TRIM = "36404C"
COL_WOOD_COUNTER = "C9A478"
COL_PLASTIC_WHITE = "F5F7FA"
COL_STEEL = "C6CDD4"
COL_DARK_METAL = "2D333B"
COL_GLASS = "C8E4F0"

PACK_COLORS = (
    "D9382E",
    "E68A1E",
    "F2C430",
    "248C4E",
    "2266B4",
    "C43E6C",
    "7C4EA6",
    "E85D2A",
    "3496A6",
    "F0EFEA",
)


# ---------------------------------------------------------------------------
# Local Helpers
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
    sides: int = 10,
    color: str = "FFFFFF",
    tile: str = "plastic_matte",
) -> None:
    rings = [
        [(cx + r * math.cos(TAU * i / sides), cy + r * math.sin(TAU * i / sides), z) for i in range(sides)]
        for (r, z) in profile_rz
    ]
    group.rings(rings, color=color, tile=tile)


# ---------------------------------------------------------------------------
# Section 1: BG_Floor (Asphalt Edge, Sidewalk Pavement, Store Ceramic Floor)
# ---------------------------------------------------------------------------


def build_floor(floor: MeshGroup) -> None:
    # Base grounded foundation slab (Z = 0.0..0.06)
    add_beveled_box(floor, (0.0, 0.0, 0.03), (FOOT_W, FOOT_D, 0.06), color=COL_ASPHALT, tile="asphalt", bevel=0.003)
    # Outdoor tiled sidewalk apron (Y in [-3.72, -1.60])
    add_beveled_box(floor, (0.0, -2.66, 0.070), (FOOT_W - 0.06, 2.12, 0.020), color=COL_SIDEWALK, tile="tile_ceramic", bevel=0.003)
    # Granite street curb along Y = -3.76
    add_beveled_box(floor, (0.0, -3.78, 0.068), (FOOT_W - 0.04, 0.16, 0.055), color="9C9E9A", tile="stone_plinth", bevel=0.005)
    # Raised interior store bright commercial ceramic floor (Y in [-1.62, +3.92])
    add_beveled_box(floor, (0.0, 1.15, 0.090), (FOOT_W - 0.10, 5.56, 0.060), color=COL_TILE_FLOOR, tile="tile_ceramic", bevel=0.003)
    # Dark grey entrance doormat inside automatic sliding door
    add_beveled_box(floor, (0.0, -1.24, FLOOR_Z + 0.005), (1.72, 0.72, 0.010), color="3C424A", tile="carpet", bevel=0.002)
    # Yellow floor tactile guidance strip at storefront threshold
    add_beveled_box(floor, (0.0, -1.78, SIDEWALK_Z + 0.005), (1.78, 0.28, 0.010), color="E2B828", tile="tile_ceramic", bevel=0.002)


# ---------------------------------------------------------------------------
# Section 2: Walls, Panoramic Front Glazing & Illuminated Korean Fascia Signage
# ---------------------------------------------------------------------------


def build_walls_and_storefront(groups: HeroSceneGroups) -> None:
    """Build North, West, East interior store walls & South full-glass storefront + illuminated signage."""
    store_len_x = 10.88
    store_len_y = 5.44  # Y in [-1.58, +3.86]
    store_cy = 1.14

    # 1. NORTH WALL (BG_Wall_North): Back Stockroom Door + Walk-in Cooler Back Wall
    n_origin = (0.0, Y_NORTH_MID, FLOOR_Z)
    n_openings = (
        WallOpening(offset_x=-3.55, width=0.92, height=2.08, sill_z=0.0, kind="door"),
    )
    add_wall_with_openings(
        groups.wall_north,
        n_origin,
        length=store_len_x,
        thickness=WALL_T,
        height=STORE_H,
        openings=n_openings,
        rot_z=0.0,
        color=COL_WALL_WHITE,
        tile="plaster",
        baseboard_height=0.09,
        baseboard_depth=0.016,
        baseboard_color=COL_DARK_METAL,
        baseboard_tile="sash_metal",
        crown_height=0.05,
        crown_depth=0.018,
        crown_color=COL_WALL_PANEL,
        crown_tile="trim_paint",
        interior_side=-1,
    )
    add_door_frame(
        groups.wall_north,
        (-3.55, Y_NORTH_MID, FLOOR_Z),
        width=0.92,
        height=2.08,
        wall_thickness=WALL_T,
        rot_z=0.0,
        frame_color=COL_DARK_METAL,
        frame_tile="sash_metal",
        leaf_color="C8CED4",
        leaf_tile="trim_paint",
        handle_color=COL_STEEL,
        handle_tile="sash_metal",
        panel_rows=1,
    )
    # Green Illuminated Emergency Exit Sign (`emissive_exit_green`, color="FFFFFF"!) above stockroom door
    add_beveled_box(groups.wall_north, (-3.55, Y_NORTH_IN - 0.032, FLOOR_Z + 2.34), (0.46, 0.045, 0.18), color=COL_DARK_METAL, tile="sash_metal", bevel=0.003)
    add_beveled_box(groups.ceiling, (-3.55, Y_NORTH_IN - 0.060, FLOOR_Z + 2.34), (0.42, 0.012, 0.145), color="FFFFFF", tile="emissive_exit_green", bevel=0.002, uv_fit=True)

    # 2. WEST WALL (BG_Wall_West): Checkout Back Wall + Illuminated Hot Snack Menu Header
    w_origin = (X_WEST_MID, store_cy, FLOOR_Z)
    w_rot = math.pi * 0.5
    add_wall_with_openings(
        groups.wall_west,
        w_origin,
        length=store_len_y,
        thickness=WALL_T,
        height=STORE_H,
        openings=(),
        rot_z=w_rot,
        color=COL_WALL_WHITE,
        tile="plaster",
        baseboard_height=0.09,
        baseboard_depth=0.016,
        baseboard_color=COL_DARK_METAL,
        baseboard_tile="sash_metal",
        crown_height=0.05,
        crown_depth=0.018,
        crown_color=COL_WALL_PANEL,
        crown_tile="trim_paint",
        interior_side=-1,
    )
    # Illuminated Hot Snack & Coffee Header Board (`emissive_rose`, color="FFFFFF"!) above checkout counter
    add_beveled_box(groups.wall_west, (X_WEST_IN + 0.04, 1.55, FLOOR_Z + 2.32), (0.06, 2.28, 0.56), color=COL_DARK_METAL, tile="sash_metal", bevel=0.004)
    add_beveled_box(groups.ceiling, (X_WEST_IN + 0.076, 1.55, FLOOR_Z + 2.32), (0.014, 2.18, 0.48), color="FFFFFF", tile="emissive_rose", bevel=0.002, uv_fit=True)

    # 3. EAST WALL (BG_Wall_East): Solid Retail Back Wall (supports chilled kimbap/dosirak showcase)
    e_origin = (X_EAST_MID, store_cy, FLOOR_Z)
    e_rot = -math.pi * 0.5
    add_wall_with_openings(
        groups.wall_east,
        e_origin,
        length=store_len_y,
        thickness=WALL_T,
        height=STORE_H,
        openings=(),
        rot_z=e_rot,
        color=COL_WALL_WHITE,
        tile="plaster",
        baseboard_height=0.09,
        baseboard_depth=0.016,
        baseboard_color=COL_DARK_METAL,
        baseboard_tile="sash_metal",
        crown_height=0.05,
        crown_depth=0.018,
        crown_color=COL_WALL_PANEL,
        crown_tile="trim_paint",
        interior_side=-1,
    )

    # 4. SOUTH STOREFRONT GLAZING & ICONIC 24H ILLUMINATED SIGNBOARD (BG_Wall_South + BG_Ceiling)
    # Low anodized aluminum kick plinth flanking the automatic sliding entrance door (X in [-0.90, +0.90])
    for sx_p, pw_p in ((-3.18, 4.46), (3.18, 4.46)):
        add_beveled_box(groups.wall_south, (sx_p, Y_FRONT_GLASS, FLOOR_Z + 0.07), (pw_p, 0.14, 0.14), color=COL_MULLION, tile="sash_metal", bevel=0.004)
    # Slim vertical storefront mullions framing panoramic clear glass bays
    mullion_xs = (-5.32, -3.55, -1.80, -0.92, 0.92, 1.80, 3.55, 5.32)
    for mx in mullion_xs:
        add_beveled_box(groups.wall_south, (mx, Y_FRONT_GLASS, FLOOR_Z + 1.18), (0.075, 0.11, 2.36), color=COL_MULLION, tile="sash_metal", bevel=0.003)
    # Horizontal transom beam at Z = 2.36 + automatic door sensor housing
    add_beveled_box(groups.wall_south, (0.0, Y_FRONT_GLASS, FLOOR_Z + 2.36), (10.76, 0.12, 0.085), color=COL_MULLION, tile="sash_metal", bevel=0.003)
    add_beveled_box(groups.wall_south, (0.0, Y_FRONT_GLASS - 0.08, FLOOR_Z + 2.26), (0.36, 0.06, 0.065), color="1C2026", tile="sash_metal", bevel=0.003)

    # Semi-open automatic glass sliding door leaves (framing clear walk-in sightline into store!)
    for side_d in (-1, 1):
        dx = side_d * 0.78
        add_beveled_box(groups.wall_south, (dx, Y_FRONT_GLASS - 0.03, FLOOR_Z + 1.12), (0.045, 0.04, 2.20), color=COL_MULLION, tile="sash_metal", bevel=0.002)
        add_beveled_box(groups.wall_south, (dx + side_d * 0.38, Y_FRONT_GLASS - 0.03, FLOOR_Z + 0.06), (0.76, 0.04, 0.12), color=COL_MULLION, tile="sash_metal", bevel=0.002)
        add_beveled_box(groups.wall_south, (dx + side_d * 0.38, Y_FRONT_GLASS - 0.03, FLOOR_Z + 2.22), (0.76, 0.04, 0.08), color=COL_MULLION, tile="sash_metal", bevel=0.002)
        # Safety decal stripe across storefront windows (keep upper/middle glass crystal clear!)
        add_beveled_box(groups.wall_south, (side_d * 3.16, Y_FRONT_GLASS - 0.01, FLOOR_Z + 1.04), (4.24, 0.012, 0.045), color=COL_EMERALD, tile="trim_paint", bevel=0.001)

    # Storefront Illuminated Fascia Box Canopy (Z = 2.42..3.18, projecting 0.42 m over sidewalk!)
    fas_y = Y_FRONT_GLASS - 0.24
    fas_z = 2.80
    fas_h = 0.74
    # Structural canopy housing in BG_Wall_South (with iconic emerald/amber/cobalt side wings!)
    add_beveled_box(groups.wall_south, (0.0, fas_y + 0.04, fas_z), (10.88, 0.44, fas_h), color="262D36", tile="sash_metal", bevel=0.005)
    # Left & Right tri-color architectural brand stripe wings flanking the central hero glowing sign
    for wing_x in (-3.62, 3.62):
        add_beveled_box(groups.wall_south, (wing_x, fas_y - 0.185, fas_z + 0.26), (3.44, 0.024, 0.16), color=COL_EMERALD, tile="trim_paint", bevel=0.003)
        add_beveled_box(groups.wall_south, (wing_x, fas_y - 0.185, fas_z + 0.12), (3.44, 0.024, 0.09), color=COL_AMBER, tile="trim_paint", bevel=0.003)
        add_beveled_box(groups.wall_south, (wing_x, fas_y - 0.185, fas_z - 0.06), (3.44, 0.024, 0.22), color="F6F8FA", tile="trim_paint", bevel=0.003)
        add_beveled_box(groups.wall_south, (wing_x, fas_y - 0.185, fas_z - 0.27), (3.44, 0.024, 0.16), color=COL_COBALT, tile="trim_paint", bevel=0.003)

    # Central Hero Illuminated Korean Convenience Store Signboard (`emissive_neon`, color="FFFFFF"!)
    add_beveled_box(groups.ceiling, (0.0, fas_y - 0.20, fas_z), (3.24, 0.024, 0.72), color="FFFFFF", tile="emissive_neon", bevel=0.003, uv_fit=True)
    # Glowing emerald/amber lightbars extending across left & right canopy wings (emissive_cool/warm)
    for wing_x in (-3.55, 3.55):
        add_beveled_box(groups.ceiling, (wing_x, fas_y - 0.205, fas_z + 0.25), (3.12, 0.014, 0.08), color="28D88A", tile="emissive_cool", bevel=0.002)
        add_beveled_box(groups.ceiling, (wing_x, fas_y - 0.205, fas_z + 0.12), (3.12, 0.014, 0.055), color="FFB830", tile="emissive_warm", bevel=0.002)
    # Under-canopy recessed sidewalk downlights
    for dx_l in (-3.6, -1.6, 0.0, 1.6, 3.6):
        add_beveled_box(groups.ceiling, (dx_l, fas_y - 0.04, fas_z - fas_h * 0.5 - 0.012), (0.36, 0.14, 0.016), color="FFFFFF", tile="emissive_cool", bevel=0.002)

    # Projecting Vertical Illuminated Convenience Sign (`돌출간판`, `emissive_amber`, color="FFFFFF"!) on East Corner
    ps_x, ps_y, ps_z = 5.26, Y_FRONT_GLASS - 0.56, 2.38
    add_beveled_box(groups.wall_south, (ps_x, ps_y + 0.34, ps_z), (0.06, 0.42, 0.10), color=COL_DARK_METAL, tile="sash_metal", bevel=0.003)
    add_beveled_box(groups.wall_south, (ps_x, ps_y, ps_z), (0.14, 0.62, 1.12), color=COL_DARK_METAL, tile="sash_metal", bevel=0.005)
    # Illuminated sign faces cleanly mounted inside the projecting frame
    add_beveled_box(groups.ceiling, (ps_x + 0.078, ps_y, ps_z), (0.012, 0.56, 1.04), color="FFFFFF", tile="emissive_amber", bevel=0.002, uv_fit=True)
    add_beveled_box(groups.ceiling, (ps_x - 0.078, ps_y, ps_z), (0.012, 0.56, 1.04), color="FFFFFF", tile="emissive_amber", bevel=0.002, uv_fit=True)


# ---------------------------------------------------------------------------
# Section 3: BG_Ceiling (Commercial Acoustic Grid Ceiling & Bright LED Strips)
# ---------------------------------------------------------------------------


def build_ceiling(ceiling: MeshGroup) -> None:
    # Main commercial store roof slab (Y in [-1.66, +3.96], top at ROOF_TOP = 3.20)
    add_beveled_box(ceiling, (0.0, 1.15, CEIL_Z + 0.07), (10.92, 5.62, 0.14), color="EAECE8", tile="ceiling_plaster", bevel=0.004)
    # Commercial T-bar ceiling grid ribs
    for gx in (-3.6, -1.8, 0.0, 1.8, 3.6):
        add_beveled_box(ceiling, (gx, 1.15, CEIL_Z - 0.012), (0.045, 5.36, 0.022), color="CBD0D6", tile="ceiling_metal", bevel=0.002)
    for gy in (-0.4, 1.2, 2.8):
        add_beveled_box(ceiling, (0.0, gy, CEIL_Z - 0.012), (10.48, 0.045, 0.022), color="CBD0D6", tile="ceiling_metal", bevel=0.002)

    # Bright Cool-White Convenience Store LED Light Bars (3 rows x 4 fixtures -> unmistakable 24H glow!)
    for ly in (-0.75, 0.95, 2.65):
        for lx in (-3.55, -1.15, 1.25, 3.65):
            add_beveled_box(ceiling, (lx, ly, CEIL_Z - 0.028), (1.36, 0.24, 0.024), color="D2D8DE", tile="ceiling_metal", bevel=0.003)
            add_beveled_box(ceiling, (lx, ly, CEIL_Z - 0.044), (1.28, 0.18, 0.014), color="FFFFFF", tile="emissive_cool", bevel=0.002)

    # Ceiling 4-way cassette air conditioner unit in center
    add_beveled_box(ceiling, (0.20, 0.85, CEIL_Z - 0.032), (0.96, 0.96, 0.055), color="ECEEEB", tile="ceiling_plaster", bevel=0.005)
    add_beveled_box(ceiling, (0.20, 0.85, CEIL_Z - 0.062), (0.52, 0.52, 0.014), color="C8CED4", tile="ceiling_metal", bevel=0.002)


# ---------------------------------------------------------------------------
# Section 4: Store Interior (Checkout Counter, Walk-in Cooler, 3 Gondolas, Window Bar)
# ---------------------------------------------------------------------------


def _build_checkout_counter(furn: MeshGroup, props: MeshGroup, ceil_emissive: MeshGroup) -> None:
    """Build L-shaped checkout counter with 2 POS terminals, barcode scanners, warmer & fishcake case."""
    # West zone: X in [-5.18, -2.55], Y in [+0.20, +3.30]
    # Counter line runs along X = -2.85 (customer faces West, clerk stands at X = -3.85)
    cx = -2.85
    cy_mid = 1.68
    clen = 2.86
    ch = 0.92
    # Main L-counter body + dark kickplate + wood/laminate top
    add_beveled_box(furn, (cx, cy_mid, FLOOR_Z + ch * 0.5 - 0.02), (0.68, clen, ch - 0.04), color=COL_GONDOLA, tile="laminate_matte", bevel=0.005)
    add_beveled_box(furn, (cx + 0.345, cy_mid, FLOOR_Z + 0.06), (0.022, clen - 0.06, 0.12), color=COL_DARK_METAL, tile="metal_leg_dark", bevel=0.002)
    add_beveled_box(furn, (cx, cy_mid, FLOOR_Z + ch - 0.020), (0.74, clen + 0.04, 0.040), color=COL_WOOD_COUNTER, tile="wood_oak", bevel=0.005)
    # South return wing closing the L-counter
    add_beveled_box(furn, (-3.96, 0.42, FLOOR_Z + ch * 0.5 - 0.02), (1.58, 0.62, ch - 0.04), color=COL_GONDOLA, tile="laminate_matte", bevel=0.005)
    add_beveled_box(furn, (-3.96, 0.42, FLOOR_Z + ch - 0.020), (1.62, 0.68, 0.040), color=COL_WOOD_COUNTER, tile="wood_oak", bevel=0.005)
    # Front impulse candy & gum display shelves on customer side of counter
    for sz in (0.34, 0.58):
        add_beveled_box(furn, (cx + 0.42, cy_mid, FLOOR_Z + sz), (0.18, 2.20, 0.024), color=COL_GONDOLA_TRIM, tile="metal_leg_dark", bevel=0.002)
        for bi in range(8):
            add_beveled_box(props, (cx + 0.43, cy_mid - 0.96 + bi * 0.27, FLOOR_Z + sz + 0.068), (0.12, 0.20, 0.105), color=PACK_COLORS[bi % len(PACK_COLORS)], tile="plastic_matte", bevel=0.003)

    z_ctr = FLOOR_Z + ch
    # 2 Dual-Screen POS Checkout Terminals + Cash Drawers + Card Readers + Barcode Scanners
    for py_pos in (1.18, 2.26):
        add_beveled_box(props, (cx - 0.04, py_pos, z_ctr + 0.05), (0.42, 0.42, 0.095), color="242830", tile="plastic_matte", bevel=0.004)
        add_beveled_box(props, (cx - 0.04, py_pos, z_ctr + 0.16), (0.06, 0.06, 0.14), color="242830", tile="iron_dark", bevel=0.003)
        # Clerk monitor + customer mini screen
        add_beveled_box(props, (cx - 0.08, py_pos, z_ctr + 0.32), (0.04, 0.36, 0.25), color="1E242C", tile="plastic_matte", bevel=0.004)
        add_beveled_box(ceil_emissive, (cx - 0.104, py_pos, z_ctr + 0.32), (0.008, 0.32, 0.21), color="98D6F8", tile="emissive_cool", bevel=0.001)
        add_beveled_box(props, (cx + 0.06, py_pos + 0.06, z_ctr + 0.26), (0.03, 0.20, 0.15), color="1E242C", tile="plastic_matte", bevel=0.003)
        add_beveled_box(ceil_emissive, (cx + 0.078, py_pos + 0.06, z_ctr + 0.26), (0.008, 0.17, 0.12), color="E2F4FF", tile="emissive_cool", bevel=0.001)
        # Card terminal & handheld barcode scanner cradle
        add_beveled_box(props, (cx + 0.22, py_pos - 0.14, z_ctr + 0.045), (0.14, 0.09, 0.08), color="323842", tile="plastic_matte", bevel=0.004)
        props.rail((cx + 0.18, py_pos + 0.24, z_ctr + 0.01), (cx + 0.14, py_pos + 0.24, z_ctr + 0.15), 0.016, "2A3038", sides=8, tile="plastic_matte")

    # Steamed Bun / Fishcake Warmer Showcase (`어묵/호빵 케이스`) on South return counter
    sc_x, sc_y = -3.45, 0.42
    add_beveled_box(props, (sc_x, sc_y, z_ctr + 0.06), (0.48, 0.48, 0.12), color=COL_AMBER, tile="enamel_gloss", bevel=0.005)
    add_beveled_box(ceil_emissive, (sc_x, sc_y, z_ctr + 0.36), (0.44, 0.44, 0.46), color="FFE8B6", tile="glass_warm", bevel=0.004)
    add_beveled_box(props, (sc_x, sc_y, z_ctr + 0.61), (0.48, 0.48, 0.055), color=COL_AMBER, tile="enamel_gloss", bevel=0.005)
    # 3 stacked steamed buns / trays inside showcase
    for bz in (0.18, 0.34, 0.48):
        add_beveled_box(props, (sc_x, sc_y, z_ctr + bz), (0.36, 0.36, 0.014), color=COL_STEEL, tile="steel_brushed", bevel=0.002)

    # Hot Beverage Warmer Cabinet (`온장고`) next to fishcake showcase
    hw_x, hw_y = -4.22, 0.42
    add_beveled_box(props, (hw_x, hw_y, z_ctr + 0.28), (0.46, 0.42, 0.56), color="D23E32", tile="enamel_gloss", bevel=0.005)
    add_beveled_box(ceil_emissive, (hw_x, hw_y - 0.214, z_ctr + 0.28), (0.38, 0.012, 0.42), color="FFE4A8", tile="glass_warm", bevel=0.002)

    # Back-Wall Tobacco/Coffee Cabinet against West Wall (X = -5.06)
    add_beveled_box(furn, (X_WEST_IN + 0.22, 1.55, FLOOR_Z + 1.02), (0.40, 2.45, 2.02), color=COL_GONDOLA_TRIM, tile="laminate_matte", bevel=0.005)
    for row_z in (0.98, 1.24, 1.50, 1.76):
        add_beveled_box(furn, (X_WEST_IN + 0.38, 1.55, FLOOR_Z + row_z), (0.12, 2.28, 0.022), color=COL_GONDOLA, tile="laminate_matte", bevel=0.002)
        for ci in range(9):
            add_beveled_box(props, (X_WEST_IN + 0.39, 0.54 + ci * 0.25, FLOOR_Z + row_z + 0.08), (0.08, 0.16, 0.13), color=PACK_COLORS[(ci + int(row_z * 5)) % len(PACK_COLORS)], tile="plastic_matte", bevel=0.002)


def _build_walkin_beverage_cooler(furn: MeshGroup, props: MeshGroup, ceil_emissive: MeshGroup) -> None:
    """Build 4-bay glass-door walk-in beverage refrigerator wall packed with 3D bottles & cans."""
    # North wall X in [-1.55, +4.45] (6.00 m wide = 4 doors x 1.48 m), depth 0.68 m against Y_NORTH_IN = 3.77
    y_back = Y_NORTH_IN - 0.02
    y_front = y_back - 0.64
    y_mid = 0.5 * (y_back + y_front)
    cool_cx = 1.45
    cool_w = 5.96
    cool_h = 2.28

    # Outer insulated cooler frame + illuminated top canopy header
    add_beveled_box(furn, (cool_cx, y_back - 0.03, FLOOR_Z + cool_h * 0.5), (cool_w, 0.05, cool_h), color="2C343E", tile="metal_leg_dark", bevel=0.004)
    add_beveled_box(furn, (cool_cx, y_mid, FLOOR_Z + 0.14), (cool_w, 0.64, 0.28), color=COL_DARK_METAL, tile="metal_leg_dark", bevel=0.004)
    add_beveled_box(furn, (cool_cx, y_mid, FLOOR_Z + cool_h - 0.11), (cool_w + 0.04, 0.68, 0.22), color=COL_COBALT, tile="laminate_matte", bevel=0.005)
    # Internal vertical cooler LED strip lighting (glowing bright cool white inside!)
    for ix in (-1.40, 0.02, 1.45, 2.88, 4.30):
        add_beveled_box(ceil_emissive, (ix, y_front + 0.05, FLOOR_Z + 1.18), (0.035, 0.025, 1.72), color="FFFFFF", tile="emissive_cool", bevel=0.002)

    # 4 Glass Cooler Doors + Mullion Frames + Vertical Chrome Handles + Back Graphic + 3D Drink Rows!
    door_w = 1.44
    for di in range(4):
        dx = -0.78 + di * 1.48
        # Metallic perimeter door frame (left, right, top, bottom mullions)
        add_beveled_box(props, (dx - door_w * 0.48, y_front, FLOOR_Z + 1.18), (0.055, 0.055, 1.84), color=COL_DARK_METAL, tile="aluminum_satin", bevel=0.003)
        add_beveled_box(props, (dx + door_w * 0.48, y_front, FLOOR_Z + 1.18), (0.055, 0.055, 1.84), color=COL_DARK_METAL, tile="aluminum_satin", bevel=0.003)
        add_beveled_box(props, (dx, y_front, FLOOR_Z + 0.29), (door_w, 0.055, 0.055), color=COL_DARK_METAL, tile="aluminum_satin", bevel=0.003)
        add_beveled_box(props, (dx, y_front, FLOOR_Z + 2.08), (door_w, 0.055, 0.055), color=COL_DARK_METAL, tile="aluminum_satin", bevel=0.003)
        # Vertical stainless pull handle on right stile
        props.rail((dx + door_w * 0.42, y_front - 0.055, FLOOR_Z + 0.88), (dx + door_w * 0.42, y_front - 0.055, FLOOR_Z + 1.48), 0.014, COL_STEEL, sides=8, tile="steel_brushed")
        props.rail((dx + door_w * 0.42, y_front - 0.01, FLOOR_Z + 0.92), (dx + door_w * 0.42, y_front - 0.055, FLOOR_Z + 0.92), 0.011, COL_STEEL, sides=6, tile="steel_brushed")
        props.rail((dx + door_w * 0.42, y_front - 0.01, FLOOR_Z + 1.44), (dx + door_w * 0.42, y_front - 0.055, FLOOR_Z + 1.44), 0.011, COL_STEEL, sides=6, tile="steel_brushed")

        # Colorful beverage cooler graphic backing (`paper_label` = _paint_vending_front, color="FFFFFF"!)
        add_beveled_box(props, (dx, y_back - 0.08, FLOOR_Z + 1.18), (door_w - 0.10, 0.016, 1.72), color="FFFFFF", tile="paper_label", bevel=0.002, uv_fit=True)

        # 4 Wire Shelves stocked with real 3D beverage bottles & aluminum cans!
        for si, sz in enumerate((0.46, 0.86, 1.26, 1.66)):
            add_beveled_box(furn, (dx, y_mid, FLOOR_Z + sz), (door_w - 0.12, 0.48, 0.020), color="E2E6EA", tile="metal_leg_steel", bevel=0.002)
            # 6 colorful bottles/cans per shelf x 4 shelves x 4 bays = 96 crisp 3D beverage units!
            for bi in range(6):
                bx = dx - 0.52 + bi * 0.205
                bcol = PACK_COLORS[(di * 3 + si * 2 + bi) % len(PACK_COLORS)]
                if si < 2:
                    # PET drink bottle silhouette
                    _lathe(
                        props,
                        bx,
                        y_front + 0.22,
                        ((0.036, FLOOR_Z + sz + 0.012), (0.038, FLOOR_Z + sz + 0.16), (0.018, FLOOR_Z + sz + 0.22), (0.019, FLOOR_Z + sz + 0.245)),
                        sides=8,
                        color=bcol,
                        tile="plastic_matte",
                    )
                else:
                    # Tall beverage can silhouette
                    _lathe(
                        props,
                        bx,
                        y_front + 0.22,
                        ((0.033, FLOOR_Z + sz + 0.012), (0.035, FLOOR_Z + sz + 0.024), (0.035, FLOOR_Z + sz + 0.165), (0.031, FLOOR_Z + sz + 0.178)),
                        sides=8,
                        color=bcol,
                        tile="enamel_gloss",
                    )


def _build_gondola_aisles_and_kimbap_case(furn: MeshGroup, props: MeshGroup, ceil_emissive: MeshGroup) -> None:
    """Build 3 central double-sided gondola merchandising aisles + East-wall kimbap/dosirak open cooler."""
    gondola_xs = (-0.65, 1.35, 3.35)
    g_cy = 0.85
    g_len = 2.65
    g_h = 1.48

    for gi, gx in enumerate(gondola_xs):
        # Central spine backplate + heavy bottom base deck + top header rail
        add_beveled_box(furn, (gx, g_cy, FLOOR_Z + 0.09), (0.82, g_len, 0.18), color=COL_GONDOLA_TRIM, tile="metal_leg_dark", bevel=0.004)
        add_beveled_box(furn, (gx, g_cy, FLOOR_Z + g_h * 0.5 + 0.06), (0.05, g_len - 0.04, g_h - 0.12), color=COL_GONDOLA, tile="laminate_matte", bevel=0.003)
        add_beveled_box(furn, (gx, g_cy, FLOOR_Z + g_h + 0.03), (0.12, g_len + 0.02, 0.055), color=COL_EMERALD if gi != 1 else COL_AMBER, tile="wood_painted", bevel=0.003)
        # End-cap display shelf at South front facing entrance
        add_beveled_box(furn, (gx, g_cy - g_len * 0.5 - 0.18, FLOOR_Z + 0.09), (0.76, 0.34, 0.18), color=COL_GONDOLA_TRIM, tile="metal_leg_dark", bevel=0.004)

        # 4 shelving levels on both East & West faces stocked with realistic ramen cups, snack boxes & chip tubes!
        for si, sz in enumerate((0.22, 0.54, 0.88, 1.22)):
            for side in (-1, 1):
                sx = gx + side * 0.22
                add_beveled_box(furn, (sx, g_cy, FLOOR_Z + sz), (0.36, g_len - 0.08, 0.024), color=COL_GONDOLA, tile="laminate_matte", bevel=0.002)
                # Price strip along shelf edge
                add_beveled_box(furn, (gx + side * 0.405, g_cy, FLOOR_Z + sz - 0.005), (0.012, g_len - 0.10, 0.032), color=COL_AMBER if si % 2 == 0 else COL_EMERALD, tile="wood_painted", bevel=0.001)
                shelf_top = FLOOR_Z + sz + 0.014
                # Realistic physical-scale merchandise clusters (10-18 cm units, NOT giant uniform cubes!)
                for bi in range(8):
                    by = g_cy - 1.08 + bi * 0.305
                    col = PACK_COLORS[(gi * 5 + si * 3 + bi + (0 if side < 0 else 4)) % len(PACK_COLORS)]
                    kind = (gi + si + bi) % 3
                    if kind == 0:
                        # Stacked Cup Ramen bowls (2 tapered cups per slot with crisp white lid rim!)
                        for r_off in (-0.06, 0.06):
                            cx_r = sx + side * r_off
                            _lathe(
                                props,
                                cx_r,
                                by,
                                ((0.044, shelf_top), (0.062, shelf_top + 0.105), (0.066, shelf_top + 0.114)),
                                sides=8,
                                color=col,
                                tile="enamel_gloss",
                            )
                            _lathe(
                                props,
                                cx_r,
                                by,
                                ((0.064, shelf_top + 0.116), (0.062, shelf_top + 0.124)),
                                sides=8,
                                color="F6F4EE",
                                tile="plastic_matte",
                            )
                    elif kind == 1:
                        # Slim upright snack / ramen / cookie boxes (twin facing packs + crisp white label stripe!)
                        bh = 0.175 + (bi % 2) * 0.035
                        bd = 0.115
                        for d_off in (-0.065, 0.065):
                            add_beveled_box(
                                props,
                                (sx + side * 0.03, by + d_off, shelf_top + bh * 0.5),
                                (0.14, bd, bh),
                                color=col,
                                tile="plastic_matte",
                                bevel=0.004,
                            )
                            # Contrasting product band on aisle-facing front
                            add_beveled_box(
                                props,
                                (sx + side * 0.104, by + d_off, shelf_top + bh * 0.56),
                                (0.008, bd * 0.84, bh * 0.34),
                                color="FAF8F2",
                                tile="enamel_gloss",
                                bevel=0.001,
                            )
                    else:
                        # Tall snack chip canister tubes (Pringles / bottled tea style, 2 per slot!)
                        for d_off in (-0.06, 0.06):
                            _lathe(
                                props,
                                sx + side * 0.02,
                                by + d_off,
                                ((0.038, shelf_top), (0.039, shelf_top + 0.21), (0.041, shelf_top + 0.224)),
                                sides=8,
                                color=col,
                                tile="enamel_gloss",
                            )

    # East-Wall Open Refrigerated Showcase (`삼각김밥 · 도시락 · 샌드위치` Open Chiller)
    ox = X_EAST_IN - 0.38
    oy_mid = 1.15
    ow = 3.20
    add_beveled_box(furn, (ox, oy_mid, FLOOR_Z + 0.96), (0.72, ow, 1.92), color=COL_GONDOLA_TRIM, tile="metal_leg_dark", bevel=0.005)
    add_beveled_box(furn, (ox - 0.06, oy_mid, FLOOR_Z + 0.22), (0.64, ow - 0.08, 0.44), color=COL_EMERALD, tile="wood_painted", bevel=0.004)
    # Overhead chilled LED strip inside open chiller
    add_beveled_box(ceil_emissive, (ox - 0.28, oy_mid, FLOOR_Z + 1.82), (0.04, ow - 0.20, 0.03), color="FFFFFF", tile="emissive_cool", bevel=0.002)
    # 4 tiered shelves with triangle kimbap (삼각김밥) & dosirak lunchbox packs!
    for si, sz in enumerate((0.54, 0.88, 1.22, 1.54)):
        add_beveled_box(furn, (ox - 0.06, oy_mid, FLOOR_Z + sz), (0.56, ow - 0.14, 0.024), color=COL_GONDOLA, tile="laminate_matte", bevel=0.002)
        for ki in range(8):
            ky = oy_mid - 1.32 + ki * 0.37
            if si >= 2:
                # Triangular kimbap wedge silhouettes (black nori + colorful wrapper bands)
                add_beveled_box(props, (ox - 0.14, ky, FLOOR_Z + sz + 0.065), (0.14, 0.16, 0.10), color="202428", tile="plastic_matte", bevel=0.006)
                add_beveled_box(props, (ox - 0.215, ky, FLOOR_Z + sz + 0.065), (0.012, 0.11, 0.055), color=PACK_COLORS[ki % len(PACK_COLORS)], tile="enamel_gloss", bevel=0.001)
            else:
                # Dosirak bento lunchboxes
                add_beveled_box(props, (ox - 0.10, ky, FLOOR_Z + sz + 0.042), (0.24, 0.28, 0.062), color="2A2D32" if ki % 2 == 0 else "D95C3A", tile="plastic_matte", bevel=0.005)


def _build_window_eating_bar_and_ramen_station(furn: MeshGroup, props: MeshGroup, ceil_emissive: MeshGroup) -> None:
    """Build front panoramic window eating counter (4 high bar stools), 2 microwaves & hot water dispenser."""
    # Window eating bar along East front panoramic glass: X in [+1.25, +4.95], Y = -1.24
    bar_x = 3.10
    bar_y = Y_FRONT_GLASS + 0.34  # -1.28
    bar_w = 3.65
    bar_h = 1.02
    add_beveled_box(furn, (bar_x, bar_y, FLOOR_Z + bar_h - 0.025), (bar_w, 0.46, 0.048), color=COL_WOOD_COUNTER, tile="wood_oak", bevel=0.005)
    for lx in (1.42, 3.10, 4.78):
        add_beveled_box(furn, (lx, bar_y, FLOOR_Z + bar_h * 0.5 - 0.02), (0.06, 0.40, bar_h - 0.04), color=COL_DARK_METAL, tile="metal_leg_dark", bevel=0.003)

    # 4 High Bar Stools tucked cleanly along the eating bar!
    for sx in (1.76, 2.66, 3.56, 4.46):
        sy = bar_y + 0.44
        for dx_l in (-0.15, 0.15):
            for dy_l in (-0.15, 0.15):
                props.rail((sx + dx_l, sy + dy_l, FLOOR_Z), (sx + dx_l * 0.85, sy + dy_l * 0.85, FLOOR_Z + 0.72), 0.014, COL_DARK_METAL, sides=6, tile="iron_dark")
        # Footrest ring & round wood seat + low backrest
        add_beveled_box(props, (sx, sy, FLOOR_Z + 0.24), (0.30, 0.30, 0.020), color=COL_STEEL, tile="steel_brushed", bevel=0.002)
        _lathe(furn, sx, sy, ((0.18, FLOOR_Z + 0.72), (0.185, FLOOR_Z + 0.765)), sides=12, color=COL_WOOD_COUNTER, tile="wood_oak")

    # Cup Ramen Bowls & Chopsticks Holder on Window Eating Bar!
    tz = FLOOR_Z + bar_h
    for rx, rcol in ((2.12, "D9382E"), (3.92, "E68A1E")):
        _lathe(props, rx, bar_y, ((0.052, tz), (0.072, tz + 0.115), (0.075, tz + 0.122)), sides=10, color=rcol, tile="enamel_gloss")
        props.rail((rx + 0.08, bar_y - 0.04, tz + 0.008), (rx + 0.14, bar_y + 0.12, tz + 0.008), 0.004, "DFC69E", sides=5, tile="wood_prop")
    add_beveled_box(props, (3.08, bar_y - 0.08, tz + 0.085), (0.14, 0.12, 0.16), color=COL_DARK_METAL, tile="plastic_matte", bevel=0.004)

    # Self-Service Heating Station (West front window: X in [-4.95, -1.35], Y = -1.24):
    # Base cabinet + 2 Commercial Microwaves + Stainless Hot-Water Dispenser (`온수기`) + Trash Bin!
    st_x = -3.15
    st_y = Y_FRONT_GLASS + 0.38
    st_h = 0.88
    add_beveled_box(furn, (st_x, st_y, FLOOR_Z + st_h * 0.5 - 0.02), (2.45, 0.62, st_h - 0.04), color=COL_GONDOLA, tile="laminate_matte", bevel=0.005)
    add_beveled_box(furn, (st_x, st_y, FLOOR_Z + st_h - 0.020), (2.50, 0.66, 0.040), color=COL_WOOD_COUNTER, tile="wood_oak", bevel=0.005)
    sz_t = FLOOR_Z + st_h
    # 2 Commercial Microwave Ovens
    for mx in (-3.92, -3.14):
        add_beveled_box(props, (mx, st_y, sz_t + 0.17), (0.56, 0.44, 0.34), color="E8ECEF", tile="enamel_gloss", bevel=0.006)
        add_beveled_box(props, (mx - 0.05, st_y + 0.224, sz_t + 0.17), (0.36, 0.014, 0.24), color="22272E", tile="glass_prop", bevel=0.002)
        add_beveled_box(ceil_emissive, (mx + 0.20, st_y + 0.224, sz_t + 0.24), (0.09, 0.008, 0.045), color="58E08C", tile="emissive_cool", bevel=0.001)
    # Stainless Commercial Hot-Water Dispenser (`온수기`) for Cup Ramen
    wx = -2.28
    add_beveled_box(props, (wx, st_y, sz_t + 0.28), (0.36, 0.38, 0.56), color=COL_STEEL, tile="steel_brushed", bevel=0.006)
    add_beveled_box(props, (wx, st_y + 0.195, sz_t + 0.20), (0.28, 0.02, 0.26), color="262B32", tile="iron_dark", bevel=0.003)
    props.rail((wx, st_y + 0.19, sz_t + 0.34), (wx, st_y + 0.25, sz_t + 0.28), 0.012, COL_STEEL, sides=6, tile="steel_brushed")
    # Integrated recycling & food waste bin next to heating station
    add_beveled_box(props, (-1.52, st_y, FLOOR_Z + 0.42), (0.58, 0.52, 0.84), color="D8DEE4", tile="plastic_matte", bevel=0.006)


# ---------------------------------------------------------------------------
# Section 5: Exterior Sidewalk Props (2 Parasol Table Sets, Streetlamp, Bin)
# ---------------------------------------------------------------------------


def _build_outdoor_parasol_set(furn: MeshGroup, props: MeshGroup, cx: float, cy: float) -> None:
    """Build iconic Korean convenience store outdoor plastic table, 2 chairs & striped sun parasol."""
    z0 = SIDEWALK_Z
    # White molded square/round outdoor table
    add_beveled_box(furn, (cx, cy, z0 + 0.72), (0.86, 0.86, 0.042), color=COL_PLASTIC_WHITE, tile="laminate_matte", bevel=0.008)
    for sx in (-0.34, 0.34):
        for sy in (-0.34, 0.34):
            props.rail((cx + sx, cy + sy, z0), (cx + sx * 0.92, cy + sy * 0.92, z0 + 0.70), 0.020, COL_PLASTIC_WHITE, sides=8, tile="plastic_matte")
    # 2 White Molded Plastic Outdoor Chairs flanking table (East & West)
    for side in (-1, 1):
        ch_x = cx + side * 0.76
        add_beveled_box(furn, (ch_x, cy, z0 + 0.44), (0.44, 0.44, 0.040), color=COL_PLASTIC_WHITE, tile="laminate_matte", bevel=0.008)
        add_beveled_box(furn, (ch_x + side * 0.19, cy, z0 + 0.68), (0.042, 0.44, 0.44), color=COL_PLASTIC_WHITE, tile="laminate_matte", bevel=0.008)
        for dx_c in (-0.17, 0.17):
            for dy_c in (-0.17, 0.17):
                props.rail((ch_x + dx_c, cy + dy_c, z0), (ch_x + dx_c * 0.90, cy + dy_c * 0.90, z0 + 0.42), 0.015, COL_PLASTIC_WHITE, sides=6, tile="plastic_matte")

    # Tall Parasol Pole & Octagonal Striped Sun Canopy (Green/White Korean CVS Parasol!)
    _lathe(props, cx, cy, ((0.18, z0), (0.16, z0 + 0.08), (0.028, z0 + 0.12)), sides=10, color="545A62", tile="stone_prop")
    props.rail((cx, cy, z0 + 0.10), (cx, cy, z0 + 2.38), 0.020, COL_STEEL, sides=8, tile="steel_brushed")
    # Faceted waterproof canopy umbrella dome (8-sided closed watertight shell)
    umb_r = 1.04
    umb_z_edge = z0 + 2.02
    umb_z_peak = z0 + 2.40
    umb_prof = (
        (umb_r, umb_z_edge - 0.06),
        (umb_r, umb_z_edge),
        (umb_r * 0.56, umb_z_edge + 0.22),
        (0.055, umb_z_peak),
        (0.025, umb_z_peak + 0.04),
    )
    _lathe(furn, cx, cy, umb_prof, sides=8, color=COL_EMERALD, tile="fabric_canvas")
    # Decorative amber trim band around umbrella rim
    _lathe(furn, cx, cy, ((umb_r + 0.006, umb_z_edge - 0.065), (umb_r + 0.006, umb_z_edge - 0.01)), sides=8, color=COL_AMBER, tile="fabric_canvas")


def build_exterior_sidewalk(furn: MeshGroup, props: MeshGroup, ceil_emissive: MeshGroup) -> None:
    """Build 2 outdoor parasol table sets, Korean streetlamp & sidewalk trash bin."""
    # Place 2 parasol sets cleanly left & right of entrance on the wide sidewalk (Y = -2.85)
    _build_outdoor_parasol_set(furn, props, -3.15, -2.82)
    _build_outdoor_parasol_set(furn, props, 3.15, -2.82)

    # Tall Sidewalk Streetlamp on South-West corner (X = -5.05, Y = -3.45)
    sl_x, sl_y = -5.05, -3.42
    _lathe(props, sl_x, sl_y, ((0.14, SIDEWALK_Z), (0.12, SIDEWALK_Z + 0.42), (0.065, SIDEWALK_Z + 0.48), (0.048, SIDEWALK_Z + 3.06)), sides=10, color="363D46", tile="iron_dark")
    # Curved cobra lamp arm + glowing warm LED lamp head
    add_pipe_frame(props, [(sl_x, sl_y, SIDEWALK_Z + 2.94), (sl_x + 0.35, sl_y + 0.10, SIDEWALK_Z + 3.08), (sl_x + 0.88, sl_y + 0.22, SIDEWALK_Z + 3.04)], radius=0.026, sides=8, color="363D46", tile="iron_dark")
    add_beveled_box(props, (sl_x + 0.94, sl_y + 0.24, SIDEWALK_Z + 3.04), (0.36, 0.20, 0.075), color="464E58", tile="aluminum_satin", bevel=0.006)
    add_beveled_box(ceil_emissive, (sl_x + 0.94, sl_y + 0.24, SIDEWALK_Z + 2.996), (0.28, 0.14, 0.018), color="FFF0C8", tile="emissive_warm", bevel=0.002)

    # Sidewalk Cigarette & Trash Bin near East storefront pier
    add_beveled_box(props, (5.05, -2.02, SIDEWALK_Z + 0.38), (0.38, 0.38, 0.76), color="48505A", tile="galvanized_zinc", bevel=0.006)


# ---------------------------------------------------------------------------
# Scene Assembly, 6-View Cameras, Manifest & 5-Gate QA Entrypoint
# ---------------------------------------------------------------------------


def build_scene_groups() -> HeroSceneGroups:
    groups = HeroSceneGroups()
    build_floor(groups.floor)
    build_walls_and_storefront(groups)
    build_ceiling(groups.ceiling)
    _build_checkout_counter(groups.furniture_hero, groups.props_clutter, groups.ceiling)
    _build_walkin_beverage_cooler(groups.furniture_hero, groups.props_clutter, groups.ceiling)
    _build_gondola_aisles_and_kimbap_case(groups.furniture_hero, groups.props_clutter, groups.ceiling)
    _build_window_eating_bar_and_ramen_station(groups.furniture_hero, groups.props_clutter, groups.ceiling)
    build_exterior_sidewalk(groups.furniture_hero, groups.props_clutter, groups.ceiling)
    groups.ground_to_zero()
    return groups


def build_six_views() -> List[PreviewCameraView]:
    return [
        PreviewCameraView(
            key="front",
            label="1 STOREFRONT 24H",
            location=(0.0, -8.80, 1.92),
            target=(0.0, -0.50, 1.65),
            lens_mm=28.0,
            hide_nodes=(),  # Keep storefront signage, glass & parasols fully visible!
        ),
        PreviewCameraView(
            key="side",
            label="2 EATING BAR 28MM",
            location=(-0.05, -0.82, 1.48),
            target=(3.85, -1.18, 1.05),
            lens_mm=26.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="back",
            label="3 CHECKOUT COUNTER",
            location=(-0.75, -0.85, 1.58),
            target=(-3.85, 1.60, 1.28),
            lens_mm=26.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO NIGHT",
            location=(7.40, -7.20, 3.65),
            target=(-0.15, -0.10, 1.45),
            lens_mm=30.0,
            hide_nodes=(),  # Exterior hero shot showing illuminated Korean fascia sign + parasols + glowing interior!
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 AISLE 28MM",
            location=(0.35, -0.95, 1.54),
            target=(0.65, 3.45, 1.42),
            lens_mm=26.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(0.40, -7.20, 11.40),
            target=(0.0, 0.40, 0.70),
            lens_mm=30.0,
            hide_nodes=("BG_Ceiling",),  # Reveals full interior layout: counter, 3 gondolas, cooler, eating bar & parasols!
        ),
    ]


def build_manifest_cameras() -> Dict[str, Any]:
    def _to_gltf(p: Sequence[float]) -> List[float]:
        return [round(float(p[0]), 3), round(float(p[2]), 3), round(-float(p[1]), 3)]

    return {
        "nightStorefront28mm": {
            "label": "28mm 야간 편의점 전면 간판 & 파라솔",
            "position": _to_gltf((3.20, -6.80, 1.72)),
            "target": _to_gltf((-0.20, -0.80, 1.75)),
            "lensMm": 28,
        },
        "checkoutDialogue35mm": {
            "label": "35mm 계산대 카운터 대화 컷",
            "position": _to_gltf((-0.85, -0.35, 1.54)),
            "target": _to_gltf((-3.40, 1.65, 1.38)),
            "lensMm": 35,
        },
        "windowRamenBar50mm": {
            "label": "50mm 창가 컵라면 시식 바 컷",
            "position": _to_gltf((1.15, -0.45, 1.42)),
            "target": _to_gltf((3.55, -1.35, 1.16)),
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
    parser.add_argument("--lighting-preset", type=str, default="night_moon_8500k")
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
            interior_cutaway=False,
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
            interior_cutaway=False,
        )

    # 4. Write manifest.json
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
