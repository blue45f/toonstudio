"""ToonStudio Hero BG v2 #5: Korean Modern Rooftop Studio Oneroom & Terrace.

Builds ``kr_rooftop_studio_oneroom`` (9.5 x 7.5 x 2.8 m) in Blender 5.3 headless
using the shared ``webtoon_hero_bg`` v2 core:
  - Oneroom Interior (West half, 5.2 x 6.8 m):
    * Solid oak single bed (mattress, draped duvet, pillows, knit throw, bedside
      nightstand & warm fabric lamp)
    * Webtoon artist / student work desk (glowing monitor with ``emissive_neon``
      Korean canvas UI, open laptop, articulated desk lamp, pen tablet, wall
      bookshelves, storyboard sketchbook ``paper_book``, indie poster ``paper_label``,
      swivel chair)
    * Compact Korean mini kitchen (stainless sink & faucet, 1-burner induction
      cooktop with pot, dish drying rack with plates, upper wall cabinets,
      mint mini refrigerator, microwave oven, electric kettle)
    * Entryway shoe cabinet (``현관 신발장``) with tiled drop zone & sneakers +
      open steel clothes hanger rack with hanging garments & storage bins
    * Pleated linen curtains (``add_pleated_curtain``) + potted Monstera
      (``add_curved_foliage_plant``)
  - Rooftop Terrace (East half outside glass sliding door, 4.1 x 7.3 m):
    * Iconic Korean green urethane waterproof deck + grey concrete coping border
      & perimeter concrete parapet with safety steel top rail
    * Folding steel laundry drying rack with draped colorful laundry towels/shirts
    * Outdoor folding camping table + 2 canvas camping chairs with mugs
    * Overhead warm emissive string lights (catenary festoon wire + glowing bulbs)
    * Wall-side AC outdoor condenser unit with fan grille + terracotta potted plants.

Outputs under ``apps/web/public/assets/3d/environments/hero-v2/kr_rooftop_studio_oneroom/``:
  - ``desktop.glb``, ``mobile.glb``, ``manifest.json``, ``freestyle.svg``, ``contact_sheet.png``
  - Preview copy: ``loop-stack/v2-previews/bg/kr_rooftop_studio_oneroom_contact_sheet.png``
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
    add_curved_foliage_plant,
    add_door_frame,
    add_pipe_frame,
    add_pleated_curtain,
    add_table,
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
SLUG = "kr_rooftop_studio_oneroom"
DEFAULT_OUT_DIR = _REPO_ROOT / "apps/web/public/assets/3d/environments/hero-v2" / SLUG
DEFAULT_PREVIEW_COPY_DIR = _REPO_ROOT / "loop-stack/v2-previews/bg"

Vec3 = Tuple[float, float, float]

# ---------------------------------------------------------------------------
# Master Spatial Dimensions (9.50 m x 7.50 m x 2.80 m)
# ---------------------------------------------------------------------------
FOOT_W = 9.50
FOOT_D = 7.50
X_MIN = -4.75
X_MAX = 4.75
Y_MIN = -3.75
Y_MAX = 3.75

# Split: Interior studio on West (X in [-4.65, +0.55], Y in [-3.40, +3.55])
#        Rooftop terrace on East (X in [+0.55, +4.70], Y in [-3.70, +3.70])
WALL_T = 0.16
X_WEST_MID = -4.57
X_WEST_IN = X_WEST_MID + WALL_T * 0.5  # -4.49
X_DIV_MID = 0.52  # Sliding glass terrace wall separating room & rooftop deck
X_DIV_IN = X_DIV_MID - WALL_T * 0.5  # +0.44
X_DIV_OUT = X_DIV_MID + WALL_T * 0.5  # +0.60

Y_NORTH_MID = 3.47
Y_NORTH_IN = Y_NORTH_MID - WALL_T * 0.5  # +3.39
Y_SOUTH_MID = -3.32
Y_SOUTH_IN = Y_SOUTH_MID + WALL_T * 0.5  # -3.24

TERRACE_Z = 0.08
FLOOR_Z = 0.14  # Interior studio floor 60 mm step above waterproof rooftop deck
WALL_H = 2.54
CEIL_Z = FLOOR_Z + WALL_H  # 2.68
ROOF_TOP = 2.80
PARAPET_H = 1.04

# ---------------------------------------------------------------------------
# Cozy Korean Rooftop Oneroom Palette (Warm Birch, Sage, Cream, Urethane Green)
# ---------------------------------------------------------------------------
COL_WALL_WARM = "F5F1E9"
COL_EXT_STUCCO = "DCD8CF"
COL_CONCRETE = "A8AAA6"
COL_URETHANE_GREEN = "4D7F62"
COL_URETHANE_TRIM = "7A8482"
COL_OAK = "CFA77B"
COL_BIRCH = "E2C69E"
COL_WALNUT = "7A563C"
COL_WHITE_CAB = "F2EFE9"
COL_MINT_FRIDGE = "BBD3C8"
COL_DUVET_CREAM = "F4EFE4"
COL_THROW_TERRA = "C97A5B"
COL_PILLOW_BLUE = "6B849E"
COL_CURTAIN_LINEN = "EDE6D8"
COL_STEEL = "C6CCD2"
COL_DARK_METAL = "383D44"
COL_SASH_WHITE = "EAE8E2"
COL_GLASS = "C6E0EE"
COL_BULB_WARM = "FFE39E"
COL_CAMP_CANVAS = "C6B392"
COL_CAMP_OLIVE = "586E56"


# ---------------------------------------------------------------------------
# Local Coordinate & Manifold Helpers
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
    tile: str = "wood_oak",
) -> None:
    rings = [
        [(cx + r * math.cos(TAU * i / sides), cy + r * math.sin(TAU * i / sides), z) for i in range(sides)]
        for (r, z) in profile_rz
    ]
    group.rings(rings, color=color, tile=tile)


def _add_soft_pillow(
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
    tile: str = "fabric_linen",
) -> None:
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    slices = ((-hx, 0.28, 0.84), (-hx * 0.65, 0.90, 0.96), (0.0, 1.0, 1.0), (hx * 0.65, 0.90, 0.96), (hx, 0.28, 0.84))
    n_u = 12
    rings = []
    for dx, sy_f, sz_f in slices:
        ring = []
        for i in range(n_u):
            a = TAU * i / n_u
            ca, sa = math.cos(a), math.sin(a)
            py = hy * sy_f * math.copysign(abs(ca) ** 0.72, ca)
            pz = hz * sz_f * math.copysign(abs(sa) ** 0.68, sa)
            ring.append(_wpt(origin, yaw, lx + dx, ly + py, lz + pz))
        rings.append(ring)
    group.rings(rings, color=color, tile=tile)


# ---------------------------------------------------------------------------
# Section 1: BG_Floor (Waterproof Rooftop Deck + Raised Oneroom Oak Floor)
# ---------------------------------------------------------------------------


def build_floor(floor: MeshGroup) -> None:
    # Base rooftop concrete structural deck resting at Z = 0.000
    add_beveled_box(
        floor,
        (0.0, 0.0, TERRACE_Z * 0.5),
        (FOOT_W, FOOT_D, TERRACE_Z),
        color=COL_CONCRETE,
        tile="concrete",
        bevel=0.004,
    )
    # Iconic Korean Green Urethane Waterproof Terrace Coating on East half + perimeter margin
    add_beveled_box(
        floor,
        (2.64, 0.0, TERRACE_Z + 0.006),
        (3.96, FOOT_D - 0.34, 0.012),
        color=COL_URETHANE_GREEN,
        tile="concrete",
        bevel=0.002,
    )
    # Grey concrete drainage gutter strips along East & South terrace edges
    add_beveled_box(floor, (4.42, 0.0, TERRACE_Z + 0.008), (0.20, FOOT_D - 0.42, 0.010), color=COL_URETHANE_TRIM, tile="stone_plinth", bevel=0.002)
    add_beveled_box(floor, (2.64, -3.48, TERRACE_Z + 0.008), (3.76, 0.20, 0.010), color=COL_URETHANE_TRIM, tile="stone_plinth", bevel=0.002)

    # Raised warm oak studio interior sub-floor (X in [-4.68, +0.62], Y in [-3.42, +3.58])
    room_w = 5.30
    room_d = 7.00
    room_cx = -2.03
    room_cy = 0.08
    add_beveled_box(
        floor,
        (room_cx, room_cy, TERRACE_Z + (FLOOR_Z - TERRACE_Z) * 0.5),
        (room_w, room_d, FLOOR_Z - TERRACE_Z),
        color=COL_OAK,
        tile="floor_wood",
        bevel=0.003,
    )
    # Recessed ceramic tile entryway drop zone (현관 디딤돌) in SW corner
    add_beveled_box(
        floor,
        (-3.90, -2.62, FLOOR_Z + 0.005),
        (1.12, 1.18, 0.010),
        color="C8C4BC",
        tile="tile_ceramic",
        bevel=0.002,
    )
    # Soft woven round/rectangular cream bedside rug
    add_beveled_box(
        floor,
        (-2.35, 1.35, FLOOR_Z + 0.004),
        (2.15, 1.65, 0.008),
        color="E8DFD0",
        tile="carpet",
        bevel=0.002,
    )
    # Wooden terrace stepping sill outside glass sliding door
    add_beveled_box(
        floor,
        (X_DIV_OUT + 0.24, 0.10, TERRACE_Z + 0.032),
        (0.42, 2.38, 0.064),
        color=COL_WALNUT,
        tile="wood_panel",
        bevel=0.005,
    )


# ---------------------------------------------------------------------------
# Section 2: Walls, Glass Sliding Terrace Door & Rooftop Parapets
# ---------------------------------------------------------------------------


def build_walls(groups: HeroSceneGroups) -> None:
    """Build studio shell, wide sliding glass terrace door, and rooftop perimeter parapet."""
    # Note on cutaway strategy:
    # - BG_Wall_North holds the studio North wall + the interior glass sliding-door divider
    #   between studio and terrace + North terrace parapet, so 3/4 Hero (which hides South & East)
    #   keeps the entire room back + glass sliding door + curtains solidly anchored!
    # - BG_Wall_West holds the studio West wall (bedside & kitchen back wall).
    # - BG_Wall_South holds the studio South entrance wall + South terrace parapet.
    # - BG_Wall_East holds the East rooftop parapet + safety steel rail (low 1.04m parapet).

    # 1. STUDIO NORTH WALL (BG_Wall_North): Window above work desk!
    n_cx = -2.025
    n_len = 5.26
    n_origin = (n_cx, Y_NORTH_MID, FLOOR_Z)
    n_openings = (
        WallOpening(offset_x=0.95, width=1.65, height=1.22, sill_z=0.96, kind="window"),
    )
    add_wall_with_openings(
        groups.wall_north,
        n_origin,
        length=n_len,
        thickness=WALL_T,
        height=WALL_H,
        openings=n_openings,
        rot_z=0.0,
        color=COL_WALL_WARM,
        tile="plaster",
        baseboard_height=0.075,
        baseboard_depth=0.015,
        baseboard_color=COL_SASH_WHITE,
        baseboard_tile="trim_paint",
        crown_height=0.045,
        crown_depth=0.016,
        crown_color=COL_SASH_WHITE,
        crown_tile="trim_paint",
        interior_side=-1,
    )
    add_window_sash(
        groups.wall_north,
        (n_cx + 0.95, Y_NORTH_MID, FLOOR_Z + 0.96),
        width=1.65,
        height=1.22,
        wall_thickness=WALL_T,
        rot_z=0.0,
        panes_x=2,
        panes_z=1,
        sliding=True,
        frame_color=COL_SASH_WHITE,
        frame_tile="sash_metal",
        glass_color=COL_GLASS,
        glass_tile="glass_tinted",
    )

    # 2. STUDIO EAST GLASS SLIDING TERRACE WALL (placed in BG_Wall_North so it stays visible in 3/4 Hero!)
    div_cy = 0.08
    div_len = 6.62
    div_origin = (X_DIV_MID, div_cy, FLOOR_Z)
    div_rot = -math.pi * 0.5  # Local +X -> World -Y, Local -Y -> World -X (interior)
    div_openings = (
        WallOpening(offset_x=-0.02, width=2.40, height=2.14, sill_z=0.0, kind="door"),
    )
    add_wall_with_openings(
        groups.wall_north,
        div_origin,
        length=div_len,
        thickness=WALL_T,
        height=WALL_H,
        openings=div_openings,
        rot_z=div_rot,
        color=COL_WALL_WARM,
        tile="plaster",
        baseboard_height=0.075,
        baseboard_depth=0.015,
        baseboard_color=COL_SASH_WHITE,
        baseboard_tile="trim_paint",
        crown_height=0.045,
        crown_depth=0.016,
        crown_color=COL_SASH_WHITE,
        crown_tile="trim_paint",
        interior_side=-1,
    )
    # Full-height 2-panel glass sliding terrace door (South leaf slid OPEN for clear walk-out view!)
    # Fixed North glass pane + open South glass doorway revealing terrace string lights & plants
    add_window_sash(
        groups.wall_north,
        (X_DIV_MID, div_cy + 0.62, FLOOR_Z + 0.02),
        width=1.18,
        height=2.10,
        wall_thickness=WALL_T,
        rot_z=div_rot,
        panes_x=1,
        panes_z=1,
        sliding=False,
        sill_overhang=0.025,
        frame_color=COL_DARK_METAL,
        frame_tile="sash_metal",
        sill_color=COL_DARK_METAL,
        sill_tile="sash_metal",
        handle_color=COL_STEEL,
        handle_tile="sash_metal",
        include_glass=True,
        glass_group=groups.ceiling,
        glass_color=COL_GLASS,
        glass_tile="glass_clear",
    )
    # Open South terrace doorway perimeter jamb/track framing (unobstructed glass-free opening!)
    add_beveled_box(groups.wall_north, (X_DIV_MID, div_cy - 1.18, FLOOR_Z + 1.07), (WALL_T + 0.032, 0.055, 2.12), color=COL_DARK_METAL, tile="sash_metal", bevel=0.003)
    add_beveled_box(groups.wall_north, (X_DIV_MID, div_cy - 0.58, FLOOR_Z + 2.11), (WALL_T + 0.032, 1.24, 0.055), color=COL_DARK_METAL, tile="sash_metal", bevel=0.003)
    add_beveled_box(groups.wall_north, (X_DIV_MID, div_cy - 0.58, FLOOR_Z + 0.025), (WALL_T + 0.044, 1.24, 0.042), color=COL_DARK_METAL, tile="sash_metal", bevel=0.003)

    # 3. STUDIO WEST WALL (BG_Wall_West): Solid interior wall for Bed & Mini Kitchen
    w_origin = (X_WEST_MID, div_cy, FLOOR_Z)
    w_rot = math.pi * 0.5  # Local -Y -> World +X (interior)
    add_wall_with_openings(
        groups.wall_west,
        w_origin,
        length=div_len,
        thickness=WALL_T,
        height=WALL_H,
        openings=(),
        rot_z=w_rot,
        color=COL_WALL_WARM,
        tile="plaster",
        baseboard_height=0.075,
        baseboard_depth=0.015,
        baseboard_color=COL_SASH_WHITE,
        baseboard_tile="trim_paint",
        crown_height=0.045,
        crown_depth=0.016,
        crown_color=COL_SASH_WHITE,
        crown_tile="trim_paint",
        interior_side=-1,
    )
    # Ceramic subway-tile backsplash behind mini kitchen on West wall (Y in [-2.05, +0.25])
    add_beveled_box(
        groups.wall_west,
        (X_WEST_IN + 0.010, -0.90, FLOOR_Z + 1.18),
        (0.016, 2.26, 0.72),
        color="F6F6F2",
        tile="tile_ceramic",
        bevel=0.002,
    )

    # 4. STUDIO SOUTH WALL (BG_Wall_South): Entryway Front Door + Small Window
    s_origin = (n_cx, Y_SOUTH_MID, FLOOR_Z)
    s_rot = math.pi  # Local +X -> World -X, Local -Y -> World +Y (interior)
    s_openings = (
        WallOpening(offset_x=1.85, width=0.92, height=2.08, sill_z=0.0, kind="door"),  # SW entrance door at X = -3.875
        WallOpening(offset_x=-1.10, width=1.24, height=1.18, sill_z=0.96, kind="window"),
    )
    add_wall_with_openings(
        groups.wall_south,
        s_origin,
        length=n_len,
        thickness=WALL_T,
        height=WALL_H,
        openings=s_openings,
        rot_z=s_rot,
        color=COL_WALL_WARM,
        tile="plaster",
        baseboard_height=0.075,
        baseboard_depth=0.015,
        baseboard_color=COL_SASH_WHITE,
        baseboard_tile="trim_paint",
        crown_height=0.045,
        crown_depth=0.016,
        crown_color=COL_SASH_WHITE,
        crown_tile="trim_paint",
        interior_side=-1,
    )
    add_door_frame(
        groups.wall_south,
        (n_cx - 1.85, Y_SOUTH_MID, FLOOR_Z),
        width=0.92,
        height=2.08,
        wall_thickness=WALL_T,
        rot_z=s_rot,
        frame_color=COL_DARK_METAL,
        frame_tile="sash_metal",
        leaf_color="4B5868",
        leaf_tile="trim_paint",
        handle_color=COL_STEEL,
        handle_tile="sash_metal",
        panel_rows=1,
    )
    add_window_sash(
        groups.wall_south,
        (n_cx + 1.10, Y_SOUTH_MID, FLOOR_Z + 0.96),
        width=1.24,
        height=1.18,
        wall_thickness=WALL_T,
        rot_z=s_rot,
        panes_x=2,
        panes_z=1,
        frame_color=COL_SASH_WHITE,
        frame_tile="sash_metal",
        glass_color=COL_GLASS,
        glass_tile="glass_tinted",
    )

    # 5. ROOFTOP TERRACE CONCRETE PARAPET + STEEL GUARDRAIL (North, East, South edges)
    p_z = TERRACE_Z + PARAPET_H * 0.5
    # North terrace parapet (BG_Wall_North)
    add_beveled_box(groups.wall_north, (2.68, 3.60, p_z), (3.94, 0.22, PARAPET_H), color=COL_EXT_STUCCO, tile="concrete", bevel=0.005)
    add_beveled_box(groups.wall_north, (2.68, 3.60, TERRACE_Z + PARAPET_H + 0.025), (3.98, 0.26, 0.050), color=COL_CONCRETE, tile="stone_plinth", bevel=0.004)
    # North steel top safety bar
    groups.wall_north.rail((0.76, 3.60, TERRACE_Z + PARAPET_H + 0.26), (4.60, 3.60, TERRACE_Z + PARAPET_H + 0.26), 0.018, COL_DARK_METAL, sides=8, tile="sash_metal")
    for px in (0.85, 2.10, 3.35, 4.55):
        groups.wall_north.rail((px, 3.60, TERRACE_Z + PARAPET_H + 0.045), (px, 3.60, TERRACE_Z + PARAPET_H + 0.26), 0.015, COL_DARK_METAL, sides=8, tile="sash_metal")

    # East terrace parapet (BG_Wall_East)
    add_beveled_box(groups.wall_east, (4.62, 0.0, p_z), (0.22, FOOT_D - 0.50, PARAPET_H), color=COL_EXT_STUCCO, tile="concrete", bevel=0.005)
    add_beveled_box(groups.wall_east, (4.62, 0.0, TERRACE_Z + PARAPET_H + 0.025), (0.26, FOOT_D - 0.46, 0.050), color=COL_CONCRETE, tile="stone_plinth", bevel=0.004)
    groups.wall_east.rail((4.62, -3.48, TERRACE_Z + PARAPET_H + 0.26), (4.62, 3.48, TERRACE_Z + PARAPET_H + 0.26), 0.018, COL_DARK_METAL, sides=8, tile="sash_metal")
    for py in (-3.25, -1.65, 0.0, 1.65, 3.25):
        groups.wall_east.rail((4.62, py, TERRACE_Z + PARAPET_H + 0.045), (4.62, py, TERRACE_Z + PARAPET_H + 0.26), 0.015, COL_DARK_METAL, sides=8, tile="sash_metal")

    # South terrace parapet (BG_Wall_South)
    add_beveled_box(groups.wall_south, (2.68, -3.60, p_z), (3.94, 0.22, PARAPET_H), color=COL_EXT_STUCCO, tile="concrete", bevel=0.005)
    add_beveled_box(groups.wall_south, (2.68, -3.60, TERRACE_Z + PARAPET_H + 0.025), (3.98, 0.26, 0.050), color=COL_CONCRETE, tile="stone_plinth", bevel=0.004)
    groups.wall_south.rail((0.76, -3.60, TERRACE_Z + PARAPET_H + 0.26), (4.60, -3.60, TERRACE_Z + PARAPET_H + 0.26), 0.018, COL_DARK_METAL, sides=8, tile="sash_metal")
    for px in (0.85, 2.10, 3.35, 4.55):
        groups.wall_south.rail((px, -3.60, TERRACE_Z + PARAPET_H + 0.045), (px, -3.60, TERRACE_Z + PARAPET_H + 0.26), 0.015, COL_DARK_METAL, sides=8, tile="sash_metal")


# ---------------------------------------------------------------------------
# Section 3: BG_Ceiling (Oneroom Roof Slab, LED Flush Lamp & Rooftop String Lights)
# ---------------------------------------------------------------------------


def _add_string_lights_span(
    ceiling: MeshGroup,
    start: Vec3,
    end: Vec3,
    *,
    sag: float = 0.24,
    bulbs: int = 8,
) -> None:
    """Build a festive rooftop catenary string-light wire with glowing warm filament bulbs."""
    a, b = Vector(start), Vector(end)
    segs = max(10, bulbs * 2)
    pts: List[Vec3] = []
    for i in range(segs + 1):
        t = i / float(segs)
        p = a.lerp(b, t)
        p.z -= 4.0 * sag * t * (1.0 - t)
        pts.append((float(p.x), float(p.y), float(p.z)))
    # Single continuous swept cord (0 welded end-cap edges!)
    add_pipe_frame(
        ceiling,
        pts,
        radius=0.005,
        sides=6,
        bend_subdiv=1,
        bend_radius=0.008,
        flange_ends=False,
        color=COL_DARK_METAL,
        tile="ceiling_metal",
    )
    # Hanging warm glowing Edison bulbs (4 mm gap below cord -> 0 welded edges)
    for bi in range(1, bulbs + 1):
        t = bi / float(bulbs + 1)
        p = a.lerp(b, t)
        p.z -= 4.0 * sag * t * (1.0 - t)
        ceiling.rail((p.x, p.y, p.z - 0.009), (p.x, p.y, p.z - 0.038), 0.008, COL_DARK_METAL, sides=6, tile="ceiling_metal", bevel_ends=False)
        _lathe(
            ceiling,
            p.x,
            p.y,
            ((0.010, p.z - 0.043), (0.026, p.z - 0.070), (0.022, p.z - 0.097), (0.006, p.z - 0.110)),
            sides=7,
            color=COL_BULB_WARM,
            tile="emissive_warm",
        )


def build_ceiling_and_string_lights(ceiling: MeshGroup, props: MeshGroup) -> None:
    """Build oneroom roof slab + flush LED lighting + rooftop terrace string lights."""
    # Oneroom roof slab (top at ROOF_TOP = 2.80)
    add_beveled_box(
        ceiling,
        (-2.03, 0.08, CEIL_Z + 0.06),
        (5.38, 7.06, 0.12),
        color=COL_WALL_WARM,
        tile="ceiling_plaster",
        bevel=0.004,
    )
    # Exterior slight overhanging eave drip molding on East terrace face
    add_beveled_box(
        ceiling,
        (0.76, 0.08, CEIL_Z + 0.03),
        (0.32, 7.12, 0.08),
        color=COL_DARK_METAL,
        tile="ceiling_metal",
        bevel=0.004,
    )
    # Slim modern Korean flush ceiling LED fixtures (2 zones: Living/Bed + Kitchen)
    for lx, ly, lw, ld in ((-2.05, 1.35, 0.92, 0.56), (-2.15, -1.55, 0.72, 0.42)):
        add_beveled_box(ceiling, (lx, ly, CEIL_Z - 0.016), (lw + 0.05, ld + 0.05, 0.026), color="DCDAD4", tile="ceiling_metal", bevel=0.003)
        add_beveled_box(ceiling, (lx, ly, CEIL_Z - 0.034), (lw, ld, 0.014), color="FFFFFF", tile="emissive_warm", bevel=0.002)

    # Rooftop String Light Steel Support Poles (on East parapet corners)
    pole_top_z = TERRACE_Z + 2.48
    for py in (-3.35, 0.15, 3.35):
        props.rail((4.48, py, TERRACE_Z + PARAPET_H), (4.48, py, pole_top_z), 0.020, COL_DARK_METAL, sides=8, tile="iron_dark")

    # 4 Warm Glowing Festoon String Light Spans across the Rooftop Terrace (staggered endpoints -> 0 welded edges!)
    _add_string_lights_span(ceiling, (0.78, 3.20, CEIL_Z - 0.03), (4.44, 3.34, pole_top_z - 0.03), sag=0.22, bulbs=7)
    _add_string_lights_span(ceiling, (0.78, 0.15, CEIL_Z - 0.05), (4.44, 0.15, pole_top_z - 0.05), sag=0.28, bulbs=7)
    _add_string_lights_span(ceiling, (0.78, -3.10, CEIL_Z - 0.07), (4.44, -3.34, pole_top_z - 0.07), sag=0.24, bulbs=7)
    _add_string_lights_span(ceiling, (4.46, -3.30, pole_top_z - 0.10), (4.46, 3.30, pole_top_z - 0.10), sag=0.34, bulbs=9)


# ---------------------------------------------------------------------------
# Section 4: Interior Studio Furnishings (Bed, Work Desk, Mini Kitchen, Closet)
# ---------------------------------------------------------------------------


def _build_single_bed_and_lamp(furn: MeshGroup, props: MeshGroup, ceil_emissive: MeshGroup) -> None:
    """Build solid oak single bed with plush duvet, pillows, knit throw, nightstand & lamp."""
    # Placed in North-West corner, headboard against West wall (X = -4.40, Y = +2.15)
    o = (-3.32, 2.25, FLOOR_Z)
    bw, bd = 2.08, 1.18  # Length along X, width along Y
    # 4 tapered oak legs + perimeter bed frame rails + slatted headboard against West wall
    for sx in (-bw * 0.45, bw * 0.45):
        for sy in (-bd * 0.44, bd * 0.44):
            _lathe(furn, o[0] + sx, o[1] + sy, ((0.022, FLOOR_Z), (0.032, FLOOR_Z + 0.22)), sides=8, color=COL_OAK, tile="wood_oak")
    add_beveled_box(furn, (o[0], o[1], FLOOR_Z + 0.27), (bw, bd, 0.14), color=COL_OAK, tile="wood_oak", bevel=0.005)
    # Slatted oak headboard against West wall
    hb_x = o[0] - bw * 0.5 + 0.04
    add_beveled_box(furn, (hb_x, o[1], FLOOR_Z + 0.56), (0.065, bd + 0.04, 0.88), color=COL_OAK, tile="wood_oak", bevel=0.005)
    for dy in (-0.42, -0.21, 0.0, 0.21, 0.42):
        add_beveled_box(furn, (hb_x + 0.036, o[1] + dy, FLOOR_Z + 0.68), (0.018, 0.16, 0.52), color=COL_BIRCH, tile="wood_birch", bevel=0.003)

    # Thick mattress + folded cozy cream duvet + terracotta throw blanket + 2 plump pillows
    add_beveled_box(furn, (o[0] + 0.03, o[1], FLOOR_Z + 0.44), (bw - 0.10, bd - 0.08, 0.22), color="F2EFE8", tile="fabric_linen", bevel=0.022)
    add_beveled_box(furn, (o[0] + 0.34, o[1], FLOOR_Z + 0.48), (1.36, bd - 0.02, 0.24), color=COL_DUVET_CREAM, tile="fabric_linen", bevel=0.035)
    add_beveled_box(furn, (o[0] + 0.78, o[1], FLOOR_Z + 0.51), (0.48, bd + 0.02, 0.24), color=COL_THROW_TERRA, tile="fabric_velvet", bevel=0.026)
    _add_soft_pillow(furn, o, 0.0, -0.72, 0.24, 0.62, 0.38, 0.52, 0.14, "FAF6EE", tile="fabric_linen")
    _add_soft_pillow(furn, o, 0.0, -0.68, -0.24, 0.62, 0.36, 0.48, 0.13, COL_PILLOW_BLUE, tile="fabric_linen")

    # Bedside Oak Nightstand + Warm Table Stand Lamp (South of bed at Y = +1.28)
    ns_x, ns_y = -4.16, 1.28
    add_beveled_box(furn, (ns_x, ns_y, FLOOR_Z + 0.26), (0.44, 0.44, 0.48), color=COL_OAK, tile="wood_oak", bevel=0.005)
    add_beveled_box(furn, (ns_x + 0.215, ns_y, FLOOR_Z + 0.36), (0.018, 0.38, 0.16), color=COL_BIRCH, tile="wood_birch", bevel=0.003)
    add_beveled_box(props, (ns_x + 0.232, ns_y, FLOOR_Z + 0.36), (0.018, 0.08, 0.016), color=COL_DARK_METAL, tile="iron_dark", bevel=0.002)
    # Nightstand warm stand lamp
    lz = FLOOR_Z + 0.505
    _lathe(props, ns_x, ns_y - 0.04, ((0.068, lz), (0.048, lz + 0.04), (0.014, lz + 0.22)), sides=10, color=COL_OAK, tile="wood_prop")
    _lathe(ceil_emissive, ns_x, ns_y - 0.04, ((0.115, lz + 0.20), (0.092, lz + 0.38)), sides=12, color="FFF0CE", tile="emissive_warm")
    # Small alarm clock & smartphone on nightstand
    add_beveled_box(props, (ns_x + 0.08, ns_y + 0.12, lz + 0.045), (0.042, 0.105, 0.082), color=COL_DARK_METAL, tile="plastic_matte", bevel=0.004)


def _build_work_desk_zone(furn: MeshGroup, props: MeshGroup, ceil_emissive: MeshGroup) -> None:
    """Build webtoon artist work desk with glowing monitor UI, laptop, pen tablet, lamp, shelves & chair."""
    # Placed against North wall window (X = -0.95, Y = +2.98)
    dx, dy = -0.98, 2.94
    dw, dd, dh = 1.66, 0.74, 0.74
    add_table(
        furn,
        (dx, dy, FLOOR_Z),
        width=dw,
        depth=dd,
        height=dh,
        rot_z=0.0,
        top_color=COL_BIRCH,
        top_tile="wood_birch",
        frame_color=COL_DARK_METAL,
        frame_tile="metal_leg_dark",
    )
    # Under-desk 3-drawer rolling pedestal
    add_beveled_box(furn, (dx + 0.54, dy + 0.02, FLOOR_Z + 0.32), (0.42, 0.52, 0.58), color=COL_WHITE_CAB, tile="laminate_matte", bevel=0.004)
    for dz_d in (0.14, 0.32, 0.50):
        add_beveled_box(furn, (dx + 0.54, dy - 0.245, FLOOR_Z + dz_d), (0.38, 0.016, 0.14), color=COL_BIRCH, tile="wood_birch", bevel=0.003)

    z_top = FLOOR_Z + dh
    # 1. Desktop Wide Monitor with glowing ToonStudio Canvas UI (`emissive_neon`, color="FFFFFF"!)
    mx, my = dx - 0.22, dy + 0.16
    add_beveled_box(props, (mx, my, z_top + 0.012), (0.24, 0.18, 0.016), color=COL_DARK_METAL, tile="aluminum_satin", bevel=0.003)
    add_beveled_box(props, (mx, my + 0.03, z_top + 0.14), (0.048, 0.036, 0.24), color=COL_DARK_METAL, tile="aluminum_satin", bevel=0.003)
    add_beveled_box(props, (mx, my - 0.01, z_top + 0.34), (0.64, 0.028, 0.38), color="262B32", tile="plastic_matte", bevel=0.004)
    # Glowing screen face facing -Y into room
    add_beveled_box(ceil_emissive, (mx, my - 0.026, z_top + 0.34), (0.60, 0.008, 0.34), color="FFFFFF", tile="emissive_neon", bevel=0.001, uv_fit=True)

    # 2. Open Laptop on right side of desk
    lx, ly = dx + 0.42, dy + 0.02
    add_beveled_box(props, (lx, ly, z_top + 0.010), (0.34, 0.23, 0.014), color=COL_STEEL, tile="aluminum_satin", bevel=0.003, rot_z=-0.24)
    add_beveled_box(props, (lx + 0.03, ly + 0.11, z_top + 0.125), (0.34, 0.014, 0.22), color=COL_STEEL, tile="aluminum_satin", bevel=0.003, rot_z=-0.24)
    add_beveled_box(ceil_emissive, (lx + 0.022, ly + 0.098, z_top + 0.125), (0.31, 0.006, 0.19), color="FFFFFF", tile="emissive_neon", bevel=0.001, rot_z=-0.24, uv_fit=True)

    # 3. Mechanical Keyboard + Drawing Pen Tablet + Coffee Mug + Storyboard Sketchbook (`paper_book`!)
    add_beveled_box(props, (mx, dy - 0.14, z_top + 0.012), (0.36, 0.13, 0.018), color="323840", tile="plastic_matte", bevel=0.003)
    add_beveled_box(furn, (dx - 0.62, dy - 0.08, z_top + 0.012), (0.28, 0.21, 0.020), color="FFFFFF", tile="paper_book", bevel=0.002, rot_z=0.12, uv_fit=True)
    _lathe(props, dx + 0.10, dy - 0.18, ((0.038, z_top), (0.042, z_top + 0.095), (0.036, z_top + 0.098)), sides=10, color="E6C296", tile="ceramic_gloss")

    # 4. Articulated Architect Desk Lamp on left edge of desk
    lmx, lmy = dx - 0.72, dy + 0.18
    _lathe(props, lmx, lmy, ((0.08, z_top), (0.07, z_top + 0.024)), sides=10, color=COL_DARK_METAL, tile="iron_dark")
    add_pipe_frame(props, [(lmx, lmy, z_top + 0.02), (lmx - 0.06, lmy + 0.04, z_top + 0.30), (lmx + 0.14, lmy - 0.04, z_top + 0.48)], radius=0.010, sides=6, flange_ends=False, color=COL_DARK_METAL, tile="iron_dark")
    _lathe(props, lmx + 0.14, lmy - 0.04, ((0.032, z_top + 0.48), (0.085, z_top + 0.39)), sides=10, color="E29D54", tile="enamel_gloss")
    _lathe(ceil_emissive, lmx + 0.14, lmy - 0.04, ((0.036, z_top + 0.39), (0.014, z_top + 0.36)), sides=8, color=COL_BULB_WARM, tile="emissive_warm")

    # 5. Wall Bookshelf + Framed Indie Poster (`paper_label`, color="FFFFFF"!) on North wall left of window
    bx_s, by_s = -2.72, Y_NORTH_IN - 0.13
    for sz_b in (1.42, 1.84):
        add_beveled_box(furn, (bx_s, by_s, FLOOR_Z + sz_b), (1.10, 0.24, 0.028), color=COL_OAK, tile="wood_oak", bevel=0.003)
        # Row of manga/art books on wall shelf
        bk_cols = ("D65A48", "3B6CA8", "4C8C62", "E2B448", "7A5692", "F2EDE4", "3A424C")
        for bi in range(8):
            bh = 0.21 + (bi % 3) * 0.035
            add_beveled_box(furn, (bx_s - 0.44 + bi * 0.068, by_s + 0.02, FLOOR_Z + sz_b + 0.016 + bh * 0.5), (0.050, 0.17, bh), color=bk_cols[(bi + int(sz_b * 3)) % len(bk_cols)], tile="paper_book", bevel=0.002)
    # Framed Wall Poster ("2026 · 11월 / SEOUL INDIE LIVE · 옥탑방 작업실") cleanly visible at eye level
    add_beveled_box(props, (-2.68, Y_NORTH_IN - 0.018, FLOOR_Z + 1.06), (0.64, 0.028, 0.78), color=COL_DARK_METAL, tile="iron_dark", bevel=0.003)
    add_beveled_box(props, (-2.68, Y_NORTH_IN - 0.034, FLOOR_Z + 1.06), (0.56, 0.012, 0.70), color="FFFFFF", tile="paper_label", bevel=0.001, uv_fit=True)

    # 6. Ergonomic Swivel Task Chair at Desk
    cx, cy = dx - 0.08, dy - 0.66
    _lathe(props, cx, cy, ((0.036, FLOOR_Z + 0.06), (0.028, FLOOR_Z + 0.42)), sides=8, color=COL_DARK_METAL, tile="iron_dark")
    for i in range(5):
        a = TAU * i / 5.0
        props.rail((cx, cy, FLOOR_Z + 0.07), (cx + 0.28 * math.cos(a), cy + 0.28 * math.sin(a), FLOOR_Z + 0.045), 0.016, COL_DARK_METAL, sides=6, tile="iron_dark")
        _lathe(props, cx + 0.28 * math.cos(a), cy + 0.28 * math.sin(a), ((0.022, FLOOR_Z), (0.022, FLOOR_Z + 0.042)), sides=8, color="24262A", tile="rubber_dark")
    add_beveled_box(furn, (cx, cy, FLOOR_Z + 0.45), (0.48, 0.46, 0.075), color="586674", tile="fabric_linen", bevel=0.014, rot_z=0.22)
    add_beveled_box(furn, (cx - 0.04, cy - 0.21, FLOOR_Z + 0.76), (0.46, 0.065, 0.48), color="586674", tile="fabric_linen", bevel=0.014, rot_z=0.22)


def _build_mini_kitchen_and_entry(furn: MeshGroup, props: MeshGroup) -> None:
    """Build compact Korean oneroom mini kitchen, fridge, microwave, shoe cabinet & clothes rack."""
    # 1. Compact Mini Kitchen along West Wall (Y in [-2.05, +0.25], X against X_WEST_IN = -4.49)
    kx = X_WEST_IN + 0.34  # -4.15, depth = 0.64
    ky_mid = -0.90
    kw = 2.24
    kh = 0.85
    # Base sink & cooktop cabinet
    add_beveled_box(furn, (kx, ky_mid, FLOOR_Z + kh * 0.5 - 0.015), (0.62, kw, kh - 0.03), color=COL_WHITE_CAB, tile="laminate_matte", bevel=0.004)
    # 4 cabinet door seams + recessed kick toe
    for dy_c in (-0.82, -0.28, 0.28, 0.82):
        add_beveled_box(furn, (kx + 0.314, ky_mid + dy_c, FLOOR_Z + 0.42), (0.016, 0.50, 0.68), color="EBE7DF", tile="wood_painted", bevel=0.003)
        add_beveled_box(props, (kx + 0.330, ky_mid + dy_c - 0.16, FLOOR_Z + 0.62), (0.016, 0.016, 0.11), color=COL_STEEL, tile="steel_brushed", bevel=0.002)
    # Quartz countertop slab
    add_beveled_box(furn, (kx + 0.01, ky_mid, FLOOR_Z + kh - 0.016), (0.66, kw + 0.02, 0.032), color="F6F4EE", tile="ceramic_matte", bevel=0.004)

    z_ctr = FLOOR_Z + kh
    # Stainless steel sink bowl & gooseneck faucet (North half, Y = -0.25)
    add_beveled_box(props, (kx + 0.02, -0.26, z_ctr + 0.006), (0.46, 0.64, 0.012), color=COL_STEEL, tile="steel_brushed", bevel=0.002)
    add_beveled_box(props, (kx + 0.02, -0.26, z_ctr + 0.011), (0.38, 0.54, 0.006), color="98A0A8", tile="steel_brushed", bevel=0.001)
    add_pipe_frame(props, [(kx - 0.22, -0.26, z_ctr), (kx - 0.22, -0.26, z_ctr + 0.30), (kx - 0.06, -0.26, z_ctr + 0.32), (kx - 0.04, -0.26, z_ctr + 0.24)], radius=0.012, sides=8, color=COL_STEEL, tile="steel_brushed")

    # Dish drying rack with standing ceramic plates next to sink (Y = +0.08)
    add_beveled_box(props, (kx + 0.02, 0.06, z_ctr + 0.012), (0.36, 0.28, 0.014), color="E2E6EA", tile="plastic_matte", bevel=0.003)
    for k in range(5):
        _lathe(props, kx - 0.08 + k * 0.045, 0.06, ((0.095, z_ctr + 0.02), (0.098, z_ctr + 0.036)), sides=10, color="FAF8F4", tile="ceramic_gloss")

    # 1-Burner Black Ceramic Induction Cooktop + Stainless Cooking Pot (South half, Y = -1.28)
    add_beveled_box(props, (kx + 0.02, -1.26, z_ctr + 0.008), (0.38, 0.38, 0.014), color="24282E", tile="glass_prop", bevel=0.002)
    _lathe(props, kx + 0.02, -1.26, ((0.105, z_ctr + 0.018), (0.112, z_ctr + 0.135), (0.118, z_ctr + 0.145)), sides=12, color=COL_STEEL, tile="steel_brushed")
    # Electric Kettle (Y = -1.76)
    _lathe(props, kx - 0.04, -1.74, ((0.075, z_ctr + 0.006), (0.082, z_ctr + 0.025), (0.072, z_ctr + 0.20), (0.064, z_ctr + 0.225)), sides=10, color="EFECE6", tile="ceramic_gloss")

    # Upper Kitchen Wall Cabinets (Z = 1.54..2.22)
    add_beveled_box(furn, (X_WEST_IN + 0.18, ky_mid, FLOOR_Z + 1.88), (0.34, kw, 0.68), color=COL_WHITE_CAB, tile="laminate_matte", bevel=0.004)
    for dy_c in (-0.82, -0.28, 0.28, 0.82):
        add_beveled_box(furn, (X_WEST_IN + 0.355, ky_mid + dy_c, FLOOR_Z + 1.88), (0.016, 0.50, 0.64), color="EBE7DF", tile="wood_painted", bevel=0.003)

    # 2. Compact Mint Mini Refrigerator + Microwave Oven on top (North of kitchen at Y = +0.58)
    fx, fy = X_WEST_IN + 0.33, 0.62
    add_beveled_box(furn, (fx, fy, FLOOR_Z + 0.62), (0.60, 0.58, 1.22), color=COL_MINT_FRIDGE, tile="wood_painted", bevel=0.010)
    add_beveled_box(furn, (fx + 0.305, fy, FLOOR_Z + 0.96), (0.024, 0.54, 0.44), color="C8DFD4", tile="wood_painted", bevel=0.008)
    add_beveled_box(furn, (fx + 0.305, fy, FLOOR_Z + 0.38), (0.024, 0.54, 0.66), color="C8DFD4", tile="wood_painted", bevel=0.008)
    add_beveled_box(props, (fx + 0.326, fy - 0.20, FLOOR_Z + 0.66), (0.018, 0.020, 0.18), color=COL_STEEL, tile="steel_brushed", bevel=0.003)
    # Microwave oven sitting cleanly on top of mini fridge
    mz = FLOOR_Z + 1.24
    add_beveled_box(props, (fx, fy, mz + 0.145), (0.38, 0.48, 0.28), color="F2F2EE", tile="enamel_gloss", bevel=0.006)
    add_beveled_box(props, (fx + 0.194, fy - 0.05, mz + 0.145), (0.012, 0.32, 0.20), color="262B32", tile="glass_prop", bevel=0.002)

    # 3. Entryway Shoe Cabinet (현관 신발장) flanking SW entry door + pair of sneakers
    sh_x, sh_y = -2.84, -2.56
    add_beveled_box(furn, (sh_x, sh_y, FLOOR_Z + 0.54), (0.36, 1.16, 1.04), color=COL_WHITE_CAB, tile="laminate_matte", bevel=0.005)
    add_beveled_box(furn, (sh_x, sh_y, FLOOR_Z + 1.075), (0.38, 1.20, 0.030), color=COL_OAK, tile="wood_oak", bevel=0.004)
    # Sneakers neatly placed on tiled entry mat
    for dy_s in (-0.09, 0.09):
        add_beveled_box(props, (-3.56, -2.42 + dy_s, FLOOR_Z + 0.048), (0.26, 0.095, 0.085), color="EAE8E4", tile="fabric_prop", bevel=0.014)

    # 4. Open Steel Clothes Hanger Rack (옷 행거) tucked cleanly along South-East interior corner (unobstructed front sightline!)
    hx, hy = 0.08, -2.32
    add_pipe_frame(props, [(hx, hy - 0.55, FLOOR_Z), (hx, hy - 0.55, FLOOR_Z + 1.66), (hx, hy + 0.55, FLOOR_Z + 1.66), (hx, hy + 0.55, FLOOR_Z)], radius=0.015, sides=8, color=COL_DARK_METAL, tile="iron_dark")
    for sy_f in (-0.55, 0.55):
        props.rail((hx - 0.24, hy + sy_f, FLOOR_Z + 0.016), (hx + 0.24, hy + sy_f, FLOOR_Z + 0.016), 0.016, COL_DARK_METAL, sides=8, tile="iron_dark")
    # Hanging colorful garments on clothes bar
    garment_cols = ("425874", "D6C6B0", "7E5442", "5A7260", "E6DFD2", "363C44")
    for gi, gcol in enumerate(garment_cols):
        gy = hy - 0.40 + gi * 0.16
        props.rail((hx, gy, FLOOR_Z + 1.65), (hx, gy, FLOOR_Z + 1.54), 0.005, COL_STEEL, sides=5, tile="steel_brushed", bevel_ends=False)
        add_beveled_box(furn, (hx, gy, FLOOR_Z + 1.18), (0.42, 0.085, 0.72), color=gcol, tile="fabric_linen", bevel=0.012)
    # 2 woven storage boxes underneath clothes rack
    for by_o in (-0.28, 0.28):
        add_beveled_box(furn, (hx, hy + by_o, FLOOR_Z + 0.16), (0.36, 0.42, 0.28), color="D8CAB4", tile="fabric_canvas", bevel=0.006)

    # 5. Pleated Linen Curtains flanking the Glass Sliding Terrace Door + Interior Monstera Plant!
    add_pleated_curtain(
        furn,
        (X_DIV_IN - 0.10, 1.56, FLOOR_Z + 0.02),
        width=0.68,
        height=2.36,
        depth=0.085,
        pleats=5,
        rot_z=-math.pi * 0.5,
        tieback_height=0.42,
        tieback_pull=0.18,
        tieback_side=-1,
        include_rod=True,
        rod_overhang=0.10,
        include_rings=True,
        color=COL_CURTAIN_LINEN,
        tile="fabric_linen",
        rod_color=COL_DARK_METAL,
        rod_tile="metal_leg_dark",
        tieback_color=COL_OAK,
        tieback_tile="wood_oak",
    )
    add_pleated_curtain(
        furn,
        (X_DIV_IN - 0.10, -1.38, FLOOR_Z + 0.02),
        width=0.68,
        height=2.36,
        depth=0.085,
        pleats=5,
        rot_z=-math.pi * 0.5,
        tieback_height=0.42,
        tieback_pull=0.18,
        tieback_side=1,
        include_rod=True,
        rod_overhang=0.10,
        include_rings=True,
        color=COL_CURTAIN_LINEN,
        tile="fabric_linen",
        rod_color=COL_DARK_METAL,
        rod_tile="metal_leg_dark",
        tieback_color=COL_OAK,
        tieback_tile="wood_oak",
    )
    # Lush Monstera plant inside room beside the glass sliding terrace door
    add_curved_foliage_plant(
        furn,
        (-0.08, 2.28, FLOOR_Z),
        species="monstera",
        height=1.22,
        pot_radius=0.18,
        pot_height=0.34,
        leaf_count=10,
        rot_z=0.65,
        seed=24,
        pot_color="D28862",
        pot_tile="ceramic_matte",
        soil_tile="wood_walnut",
        leaf_color="3A6A3E",
    )


# ---------------------------------------------------------------------------
# Section 5: Rooftop Terrace Props (Laundry Rack, Camping Table/Chairs, AC, Plants)
# ---------------------------------------------------------------------------


def _build_camping_chair(furn: MeshGroup, props: MeshGroup, origin: Vec3, yaw: float, fabric_col: str) -> None:
    """Foldable outdoor camping chair facing local -Y."""
    # Crossed aluminum X-legs
    for sx in (-0.25, 0.25):
        props.rail(_wpt(origin, yaw, sx, -0.22, 0.01), _wpt(origin, yaw, sx, 0.22, 0.42), 0.012, COL_DARK_METAL, sides=6, tile="aluminum_satin")
        props.rail(_wpt(origin, yaw, sx, 0.22, 0.01), _wpt(origin, yaw, sx, -0.22, 0.42), 0.012, COL_DARK_METAL, sides=6, tile="aluminum_satin")
        props.rail(_wpt(origin, yaw, sx, 0.22, 0.42), _wpt(origin, yaw, sx, 0.28, 0.84), 0.012, COL_DARK_METAL, sides=6, tile="aluminum_satin")
        # Wood armrests
        _lbox(furn, origin, yaw, sx, 0.02, 0.60, 0.048, 0.46, 0.024, COL_OAK, tile="wood_oak", bevel=0.003)
    # Canvas seat & backrest
    _lbox(furn, origin, yaw, 0.0, 0.0, 0.43, 0.50, 0.44, 0.032, fabric_col, tile="fabric_canvas", bevel=0.006)
    _lbox(furn, origin, yaw, 0.0, 0.25, 0.66, 0.50, 0.036, 0.40, fabric_col, tile="fabric_canvas", bevel=0.006)


def _build_ac_outdoor_unit(props: MeshGroup, origin: Vec3, yaw: float) -> None:
    """Korean rooftop AC outdoor condenser unit with fan shroud, hub & grille."""
    w, d, h = 0.84, 0.34, 0.66
    for sx in (-0.28, 0.28):
        _lbox(props, origin, yaw, sx, 0.0, 0.02, 0.07, d + 0.04, 0.04, "34383E", tile="rubber_dark", bevel=0.003)
    _lbox(props, origin, yaw, 0.0, 0.0, 0.04 + h * 0.48, w, d, h * 0.94, "E4E0D8", tile="enamel_gloss", bevel=0.006)
    _lbox(props, origin, yaw, 0.0, 0.0, 0.04 + h - 0.02, w + 0.02, d + 0.02, 0.04, "D4D0C8", tile="enamel_gloss", bevel=0.004)
    # Fan shroud + protective grille bars facing local -Y
    fx, fz, fr = -0.14, 0.04 + h * 0.50, 0.21
    yf = -d * 0.5
    props.rail(_wpt(origin, yaw, fx, yf + 0.004, fz), _wpt(origin, yaw, fx, yf - 0.010, fz), fr, "323840", sides=14, tile="iron_dark", bevel_ends=False)
    props.rail(_wpt(origin, yaw, fx, yf - 0.008, fz), _wpt(origin, yaw, fx, yf - 0.022, fz), 0.052, "22262C", sides=10, tile="plastic_matte", bevel_ends=False)
    for frac in (-0.6, -0.2, 0.2, 0.6):
        dz = frac * fr
        hc = math.sqrt(max(0.001, fr * fr - dz * dz)) * 0.92
        props.rail(_wpt(origin, yaw, fx - hc, yf - 0.024, fz + dz), _wpt(origin, yaw, fx + hc, yf - 0.024, fz + dz), 0.0045, "586068", sides=5, tile="steel_brushed", bevel_ends=False)


def build_terrace_props(furn: MeshGroup, props: MeshGroup) -> None:
    """Build rooftop laundry drying rack, camping table & 2 chairs, AC unit & outdoor plants."""
    tz = TERRACE_Z + 0.012

    # 1. Folding Steel Laundry Drying Rack (빨래 건조대) in North Terrace (X = 2.65, Y = +2.10)
    lx, ly = 2.65, 2.15
    # Folding X-frame steel legs & central upper wings
    for sy in (-0.42, 0.42):
        props.rail((lx - 0.54, ly + sy, tz + 0.01), (lx + 0.54, ly + sy, tz + 1.02), 0.011, COL_STEEL, sides=6, tile="steel_brushed")
        props.rail((lx + 0.54, ly + sy, tz + 0.01), (lx - 0.54, ly + sy, tz + 1.02), 0.011, COL_STEEL, sides=6, tile="steel_brushed")
    # Horizontal drying rods
    for rx in (-0.68, -0.44, -0.20, 0.04, 0.28, 0.52, 0.72):
        rz = tz + 1.04 + (0.12 if abs(rx) > 0.55 else 0.0)
        props.rail((lx + rx, ly - 0.44, rz), (lx + rx, ly + 0.44, rz), 0.007, COL_STEEL, sides=5, tile="steel_brushed")
    # Draped colorful laundry towels & t-shirts hanging over drying rods
    laundry_items = (
        (-0.44, -0.14, 0.34, 0.48, "F4F2EC"),
        (-0.20, 0.16, 0.32, 0.44, "8AA4C2"),
        (0.04, -0.10, 0.38, 0.56, "E6C88C"),
        (0.28, 0.12, 0.34, 0.46, "D68A7A"),
        (0.52, -0.06, 0.30, 0.40, "8EB094"),
    )
    for ox, oy, lw, lh, col in laundry_items:
        add_beveled_box(furn, (lx + ox, ly + oy, tz + 1.04 - lh * 0.46), (0.042, lw, lh), color=col, tile="fabric_linen", bevel=0.008)

    # 2. Outdoor Folding Camping Table & 2 Canvas Camping Chairs in South-East Terrace
    ct_x, ct_y = 2.75, -1.15
    # Slatted roll-top wood camping table (width 1.10, depth 0.68, height 0.62)
    add_beveled_box(furn, (ct_x, ct_y, tz + 0.60), (0.72, 1.12, 0.028), color=COL_OAK, tile="wood_oak", bevel=0.004)
    for sx in (-0.28, 0.28):
        props.rail((ct_x + sx, ct_y - 0.42, tz), (ct_x + sx, ct_y + 0.42, tz + 0.58), 0.013, COL_DARK_METAL, sides=6, tile="aluminum_satin")
        props.rail((ct_x + sx, ct_y + 0.42, tz), (ct_x + sx, ct_y - 0.42, tz + 0.58), 0.013, COL_DARK_METAL, sides=6, tile="aluminum_satin")
    # Enamel camping mugs & lantern on camping table
    for my_m, col_m in ((-0.26, "E6D8C0"), (0.24, "5A7A68")):
        _lathe(props, ct_x + 0.08, ct_y + my_m, ((0.038, tz + 0.616), (0.040, tz + 0.70)), sides=10, color=col_m, tile="enamel_gloss")
    _lathe(props, ct_x - 0.06, ct_y, ((0.055, tz + 0.616), (0.062, tz + 0.66), (0.045, tz + 0.80), (0.064, tz + 0.83)), sides=10, color=COL_DARK_METAL, tile="enamel_gloss")

    # 2 Camping chairs facing the table
    _build_camping_chair(furn, props, (ct_x - 0.82, ct_y - 0.12, tz), yaw=-math.pi * 0.5 + 0.16, fabric_col=COL_CAMP_CANVAS)
    _build_camping_chair(furn, props, (ct_x + 0.82, ct_y + 0.10, tz), yaw=math.pi * 0.5 - 0.14, fabric_col=COL_CAMP_OLIVE)

    # 3. Rooftop AC Outdoor Condenser Unit against exterior East studio wall (South corner)
    _build_ac_outdoor_unit(props, (X_DIV_OUT + 0.24, -2.55, tz), yaw=math.pi * 0.5)

    # 4. Potted Rooftop Terrace Plants (set safely inside parapet -> zero foliage clipping!)
    add_curved_foliage_plant(
        furn,
        (3.68, 2.66, tz),
        species="ficus",
        height=1.28,
        pot_radius=0.19,
        pot_height=0.36,
        leaf_count=9,
        rot_z=1.2,
        seed=41,
        pot_color="C4744E",
        pot_tile="ceramic_matte",
        soil_tile="wood_walnut",
        leaf_color="447446",
    )
    add_curved_foliage_plant(
        furn,
        (3.62, -2.52, tz),
        species="palm",
        height=1.18,
        pot_radius=0.17,
        pot_height=0.34,
        leaf_count=9,
        rot_z=2.8,
        seed=73,
        pot_color="8C948A",
        pot_tile="ceramic_matte",
        soil_tile="wood_walnut",
        leaf_color="3E6E42",
    )
    add_curved_foliage_plant(
        furn,
        (1.18, 2.86, tz),
        species="monstera",
        height=0.92,
        pot_radius=0.15,
        pot_height=0.28,
        leaf_count=8,
        rot_z=0.3,
        seed=89,
        pot_color="D6906A",
        pot_tile="ceramic_matte",
        soil_tile="wood_walnut",
        leaf_color="4A7C4A",
    )


# ---------------------------------------------------------------------------
# Scene Assembly, 6-View Cameras, Manifest & 5-Gate QA Entrypoint
# ---------------------------------------------------------------------------


def build_scene_groups() -> HeroSceneGroups:
    groups = HeroSceneGroups()
    build_floor(groups.floor)
    build_walls(groups)
    build_ceiling_and_string_lights(groups.ceiling, groups.props_clutter)
    _build_single_bed_and_lamp(groups.furniture_hero, groups.props_clutter, groups.ceiling)
    _build_work_desk_zone(groups.furniture_hero, groups.props_clutter, groups.ceiling)
    _build_mini_kitchen_and_entry(groups.furniture_hero, groups.props_clutter)
    build_terrace_props(groups.furniture_hero, groups.props_clutter)
    groups.ground_to_zero()
    return groups


def build_six_views() -> List[PreviewCameraView]:
    return [
        PreviewCameraView(
            key="front",
            label="1 FRONT ROOM",
            location=(-0.35, -8.20, 1.88),
            target=(-0.45, 0.85, 1.25),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_South", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="side",
            label="2 KITCHEN & BED",
            location=(-0.55, -1.35, 1.54),
            target=(-4.15, 0.35, 1.15),
            lens_mm=26.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="back",
            label="3 TERRACE HERO",
            location=(7.60, -4.40, 2.65),
            target=(-0.40, 0.45, 1.15),
            lens_mm=28.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(4.20, -7.80, 6.20),
            target=(-0.35, 0.20, 0.95),
            lens_mm=30.0,
            hide_nodes=("BG_Wall_South", "BG_Ceiling", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 INTERIOR 28MM",
            location=(-3.45, -1.85, 1.48),
            target=(0.35, 1.65, 1.25),
            lens_mm=26.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(0.60, -6.20, 10.60),
            target=(0.0, 0.0, 0.60),
            lens_mm=30.0,
            hide_nodes=("BG_Ceiling", "BG_Wall_South", "BG_Cutaway_Front"),
        ),
    ]


def build_manifest_cameras() -> Dict[str, Any]:
    def _to_gltf(p: Sequence[float]) -> List[float]:
        return [round(float(p[0]), 3), round(float(p[2]), 3), round(-float(p[1]), 3)]

    return {
        "oneroomWide28mm": {
            "label": "28mm 옥탑 원룸 실내 광각",
            "position": _to_gltf((-3.45, -1.85, 1.48)),
            "target": _to_gltf((0.35, 1.95, 1.28)),
            "lensMm": 28,
        },
        "terraceStringLight35mm": {
            "label": "35mm 옥탑 테라스 스트링 전구 컷",
            "position": _to_gltf((4.05, -2.85, 1.54)),
            "target": _to_gltf((1.10, 1.40, 1.35)),
            "lensMm": 35,
        },
        "deskDeadline50mm": {
            "label": "50mm 작업 책상 마감 클로즈업",
            "position": _to_gltf((-1.85, 1.15, 1.36)),
            "target": _to_gltf((-0.95, 2.95, 1.12)),
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
    parser.add_argument("--lighting-preset", type=str, default="sunset_3200k")
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
