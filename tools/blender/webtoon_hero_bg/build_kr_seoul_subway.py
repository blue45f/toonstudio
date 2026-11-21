"""Hero Webtoon 3D Background v2 #2: Seoul Metro Line 2 Train Interior & PSD Platform.

Asset slug: ``kr_seoul_subway_train_platform``
Real-world dimensions: ``16.00 x 6.50 x 3.40 m``
Zones:
  - Seoul Metro Line 2 commuter train car interior (Y in [+0.24, +3.16]):
      * Longitudinal stainless steel bench seats on both sides — regular teal-blue
        seats + distinct amber-yellow Priority Seats (노약자석) at both car ends
      * Curved tubular-steel & glass windscreens at every bench end
      * Vertical stanchion poles, overhead horizontal grab rails, luggage racks,
        and 26 sculpted hanging hand-strap rings (손잡이 고리 다수)
      * 3 double sliding door bays per side (center bay slid open cleanly onto platform)
      * Upper Seoul Metro Line 2 Route Maps (paper_label graphic), Priority Seat /
        Car 2114 plaques (enamel_gloss graphic), ad frames, and door LED displays
  - Station Platform (Y in [-3.25, +0.16]):
      * Platform Screen Doors (PSD) with Line 2 green fascia, open center doors,
        clear viewing bays & horizontal safety decals
      * Yellow tactile Braille paving blocks (노란 점자 블록) + green queue lines
      * Station structural columns with green Line 2 wrap, modern wood-steel benches,
        recycling bins, suspended Seongsu Station (211 성수) illuminated signs,
        next-train LED arrival board, and Exit 3 green illuminated sign
  - Zero-blind-spot 8-node cutaway: hiding BG_Wall_North / BG_Wall_South / BG_Ceiling
    opens both train interior dialogue cuts and platform waiting cuts cleanly!

Headless execution (Blender 5.3):
  /Users/hjunkim/.local/bin/blender --background --factory-startup \
    --python-exit-code 42 --python tools/blender/webtoon_hero_bg/build_kr_seoul_subway.py
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

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tools.blender.webtoon_hero_bg.arch_primitives import (  # noqa: E402
    MeshGroup,
    WallOpening,
    _make_beveled_box_local,
    _transform_points,
    add_beveled_box,
    add_pipe_frame,
    add_wall_with_openings,
)
from tools.blender.webtoon_hero_bg.cutaway_assembly import (  # noqa: E402
    DEFAULT_COPYRIGHT,
    AssembledHeroScene,
    HeroSceneGroups,
    _remove_hierarchy,
    assemble_desktop_cutaway,
    assemble_mobile_cutaway,
    build_lighting_presets,
    export_cutaway_glb,
)
from tools.blender.webtoon_hero_bg.multiview_preview import (  # noqa: E402
    PreviewCameraView,
    render_freestyle_svg,
    render_six_view_contact_sheet,
)
from tools.blender.webtoon_hero_bg.qa_bg_gate import (  # noqa: E402
    audit_blender_scene,
    inspect_glb,
)

# ---------------------------------------------------------------------------
# Spatial Constants & Seoul Metro Line 2 Authentic Palette (metres, Z=0 base)
# ---------------------------------------------------------------------------

SLUG = "kr_seoul_subway_train_platform"
TITLE_KO = "서울 지하철 2호선 전동차 객실 & 스크린도어 승강장"
DEFAULT_OUT_DIR = REPO_ROOT / "apps/web/public/assets/3d/environments/hero-v2" / SLUG
DEFAULT_PREVIEW_DIR = REPO_ROOT / "loop-stack/v2-previews/bg"

SCENE_W = 16.000
SCENE_D = 6.500
SCENE_H = 3.400
HALF_W = SCENE_W * 0.5   # 8.000
HALF_D = SCENE_D * 0.5   # 3.250

PLAT_FLOOR_Z = 0.220
TRAIN_FLOOR_Z = 0.240
TRAIN_ROOF_Z = 2.660     # 2.42m generous interior train height
STATION_CEIL_Z = 3.220
WALL_T = 0.140

# Y coordinates
PLAT_Y_MIN = -HALF_D           # -3.250
PLAT_Y_MAX = 0.150             # Platform edge (3.40m wide platform)
PSD_Y = 0.050                  # Platform Screen Door centerline
TRAIN_S_Y = 0.300              # Train South sidewall centerline
TRAIN_N_Y = 3.120              # Train North sidewall centerline
TRAIN_MID_Y = 0.5 * (TRAIN_S_Y + TRAIN_N_Y)  # 1.710 (car inner width = 2.68m)
DOOR_XS: Tuple[float, ...] = (-4.60, 0.00, 4.60)

# Authentic Seoul Metro Line 2 palette
COL_LINE2_GREEN = "00A84D"
COL_LINE2_DARK = "1E6E46"
COL_STAINLESS = "CFD5DC"
COL_STEEL_DARK = "4D5660"
COL_CAR_INTERIOR = "EEF1F4"
COL_CAR_LINER = "E4E8EC"
COL_CAR_FLOOR = "C8CFD6"
COL_CAR_AISLE = "AEB6BF"
COL_PLAT_GRANITE = "D9DDE2"
COL_PLAT_WALL = "ECEFF2"
COL_TACTILE_YELLOW = "F2C228"
COL_SEAT_REGULAR = "3E6B8C"     # Seoul Metro regular seat blue-teal
COL_SEAT_PRIORITY = "E8AE30"    # Seoul Metro priority seat warm amber-yellow
COL_STRAP_WHITE = "F2F4F7"
COL_STRAP_GRIP = "363E48"
COL_BENCH_WOOD = "C89E6C"
COL_CEIL_WHITE = "F2F4F7"
COL_CEIL_DARK = "C4CCD4"
COL_FROST_STRIPE = "D8E8EE"


# ---------------------------------------------------------------------------
# Quantization-Safe Watertight Helpers
# ---------------------------------------------------------------------------


def _safe_bevel(size: Tuple[float, float, float], bevel: float) -> float:
    min_dim = min(size)
    if bevel <= 0.0 or min_dim < 0.014:
        return 0.0
    eff = min(bevel, min_dim * 0.25)
    return eff if eff >= 0.0022 else 0.0


def _box(
    g: MeshGroup,
    center: Tuple[float, float, float],
    size: Tuple[float, float, float],
    color: str,
    tile: str,
    *,
    bevel: float = 0.0035,
    rot_z: float = 0.0,
    uv_fit: Optional[bool] = None,
) -> None:
    add_beveled_box(
        g,
        center,
        size,
        color=color,
        tile=tile,
        bevel=_safe_bevel(size, bevel),
        rot_z=rot_z,
        uv_fit=uv_fit,
    )


def _cyl_z(
    g: MeshGroup,
    cx: float,
    cy: float,
    z0: float,
    z1: float,
    r0: float,
    r1: Optional[float],
    color: str,
    tile: str,
    sides: int = 10,
) -> None:
    ra = max(0.003, float(r0))
    rb = max(0.003, float(r1 if r1 is not None else r0))
    if z1 - z0 < 1e-4:
        return
    rings = [
        [(cx + r * math.cos(math.tau * i / sides), cy + r * math.sin(math.tau * i / sides), z) for i in range(sides)]
        for (r, z) in ((ra, z0), (rb, z1))
    ]
    g.rings(rings, color=color, tile=tile)


# ---------------------------------------------------------------------------
# 1. Floor: Trackbed, Train Floor, Platform Granite, Tactile Blocks, PSD & Columns
# ---------------------------------------------------------------------------


def _build_floor_and_psd(g: MeshGroup) -> None:
    # Continuous concrete trackbed foundation strictly grounded at Z = 0.000
    _box(g, (0.0, 0.0, 0.046), (SCENE_W, SCENE_D, 0.092), "787F87", "concrete", bevel=0.004)
    # Two steel train rails running full 16m under car
    for ry in (1.02, 2.40):
        _box(g, (0.0, ry, 0.118), (SCENE_W - 0.12, 0.075, 0.056), COL_STEEL_DARK, "sash_metal", bevel=0.003)

    # --- Station Platform Slab (Y in [-3.25, +0.15], top at PLAT_FLOOR_Z = 0.220) ---
    plat_d = PLAT_Y_MAX - PLAT_Y_MIN
    plat_cy = 0.5 * (PLAT_Y_MIN + PLAT_Y_MAX)
    _box(g, (0.0, plat_cy, 0.095 + (PLAT_FLOOR_Z - 0.095) * 0.5), (SCENE_W - 0.02, plat_d - 0.01, PLAT_FLOOR_Z - 0.095), COL_PLAT_GRANITE, "tile_ceramic", bevel=0.004)

    # Platform Edge Safety Coping Strip (dark granite + yellow warning edge)
    _box(g, (0.0, PLAT_Y_MAX - 0.09, PLAT_FLOOR_Z + 0.004), (SCENE_W - 0.08, 0.16, 0.008), "6A727B", "stone_plinth", bevel=0.0)

    # Iconic Seoul Metro Yellow Tactile Braille Blocks (노란 점자 블록, Y = -0.42, full 16m)
    for bi in range(44):
        bx = -7.64 + bi * 0.356
        _box(g, (bx, -0.42, PLAT_FLOOR_Z + 0.005), (0.336, 0.32, 0.010), COL_TACTILE_YELLOW, "tile_ceramic", bevel=0.0)
        # Raised tactile guide ribs on each block (4 parallel bars)
        for ry_off in (-0.095, -0.032, 0.032, 0.095):
            _box(g, (bx, -0.42 + ry_off, PLAT_FLOOR_Z + 0.013), (0.30, 0.020, 0.006), "F6CE3C", "trim_paint", bevel=0.0)

    # Line 2 Green Boarding Queue Lines on Platform Floor in front of all 3 PSD doors
    for dx in DOOR_XS:
        for sx in (-0.98, 0.98):
            _box(g, (dx + sx, -0.96, PLAT_FLOOR_Z + 0.004), (0.14, 0.62, 0.008), COL_LINE2_GREEN, "trim_paint", bevel=0.0)
        # Subtle boarding zone center arrow bar
        _box(g, (dx, -0.82, PLAT_FLOOR_Z + 0.004), (1.10, 0.075, 0.008), "E8EEF2", "trim_paint", bevel=0.0)

    # --- Train Car Floor Slab (Y in [+0.24, +3.18], top at TRAIN_FLOOR_Z = 0.240) ---
    car_d = (TRAIN_N_Y + 0.06) - (TRAIN_S_Y - 0.06)
    _box(g, (0.0, TRAIN_MID_Y, 0.165), (SCENE_W - 0.06, car_d, 0.150), COL_CAR_FLOOR, "tile_ceramic", bevel=0.004)
    # Center aisle contrast strip inside train car
    _box(g, (0.0, TRAIN_MID_Y, TRAIN_FLOOR_Z + 0.004), (SCENE_W - 0.30, 0.96, 0.008), COL_CAR_AISLE, "concrete", bevel=0.0)
    # Anti-slip yellow safety threshold plates at all 6 train doorways
    for dx in DOOR_XS:
        for sy in (TRAIN_S_Y + 0.14, TRAIN_N_Y - 0.14):
            _box(g, (dx, sy, TRAIN_FLOOR_Z + 0.005), (1.36, 0.18, 0.010), COL_TACTILE_YELLOW, "trim_paint", bevel=0.0)

    # --- Platform Screen Doors (PSD) at Y = PSD_Y (in BG_Floor -> always recognizable in cutaway!) ---
    psd_h = 2.38
    psd_top_z = PLAT_FLOOR_Z + psd_h   # 2.60m
    # Continuous top header fascia box with iconic Seoul Metro Line 2 Green band
    _box(g, (0.0, PSD_Y, psd_top_z - 0.16), (SCENE_W - 0.12, 0.16, 0.32), "ECEFF3", "trim_paint", bevel=0.004)
    _box(g, (0.0, PSD_Y - 0.084, psd_top_z - 0.19), (SCENE_W - 0.16, 0.012, 0.085), COL_LINE2_GREEN, "trim_paint", bevel=0.0)
    _box(g, (0.0, PSD_Y + 0.084, psd_top_z - 0.19), (SCENE_W - 0.16, 0.012, 0.085), COL_LINE2_GREEN, "trim_paint", bevel=0.0)

    # PSD Vertical Brushed-Steel Mullions & Fixed Glass Framing (clear bays left OPEN AIR for sightlines!)
    post_xs = (-7.88, -5.36, -3.84, -2.30, -0.76, 0.76, 2.30, 3.84, 5.36, 7.88)
    post_h = psd_h - 0.33
    post_zc = PLAT_FLOOR_Z + post_h * 0.5 + 0.003
    for px in post_xs:
        _box(g, (px, PSD_Y, post_zc), (0.085, 0.11, post_h), COL_STAINLESS, "sash_metal", bevel=0.003)

    # Low stainless kick-plate & horizontal green/yellow safety stripe across fixed PSD bays (never across open center door!)
    fixed_spans = ((-7.82, -5.42), (-3.78, -2.36), (-2.24, -0.82), (0.82, 2.24), (2.36, 3.78), (5.42, 7.82))
    for x0, x1 in fixed_spans:
        xc = 0.5 * (x0 + x1)
        sw = x1 - x0 - 0.02
        _box(g, (xc, PSD_Y, PLAT_FLOOR_Z + 0.075), (sw, 0.085, 0.14), COL_STAINLESS, "sash_metal", bevel=0.003)
        _box(g, (xc, PSD_Y, PLAT_FLOOR_Z + 1.15), (sw, 0.018, 0.055), COL_LINE2_GREEN, "trim_paint", bevel=0.0)
        _box(g, (xc, PSD_Y, PLAT_FLOOR_Z + 1.24), (sw, 0.014, 0.032), COL_FROST_STRIPE, "glass_tinted", bevel=0.0)

    # PSD Sliding Door Leaves: Left (-4.60) & Right (+4.60) closed; Center (0.00) SLID OPEN cleanly!
    for dx in DOOR_XS:
        if abs(dx) < 0.1:
            # Open center PSD doors: visible slim stiles tucked into side pockets
            for side in (-1.0, 1.0):
                _box(g, (dx + side * 0.69, PSD_Y - 0.035, PLAT_FLOOR_Z + 1.03), (0.075, 0.036, 2.02), COL_STAINLESS, "sash_metal", bevel=0.003)
        else:
            # Closed double PSD door frames (clear viewing middle, slim mullions + safety decal stripe)
            for side in (-1.0, 1.0):
                lx = dx + side * 0.35
                _box(g, (lx - 0.31, PSD_Y - 0.028, PLAT_FLOOR_Z + 1.03), (0.052, 0.038, 2.02), COL_STAINLESS, "sash_metal", bevel=0.003)
                _box(g, (lx + 0.31, PSD_Y - 0.028, PLAT_FLOOR_Z + 1.03), (0.052, 0.038, 2.02), COL_STAINLESS, "sash_metal", bevel=0.003)
                _box(g, (lx, PSD_Y - 0.028, PLAT_FLOOR_Z + 0.075), (0.58, 0.038, 0.14), COL_STAINLESS, "sash_metal", bevel=0.003)
                _box(g, (lx, PSD_Y - 0.028, PLAT_FLOOR_Z + 2.00), (0.58, 0.038, 0.07), COL_STAINLESS, "sash_metal", bevel=0.003)
                _box(g, (lx, PSD_Y - 0.028, PLAT_FLOOR_Z + 1.15), (0.56, 0.016, 0.065), COL_TACTILE_YELLOW, "trim_paint", bevel=0.0)

    # --- 2 Station Structural Columns on Platform (X = -6.10 and +6.10, Y = -2.30 -> wide open center!) ---
    col_h = STATION_CEIL_Z - PLAT_FLOOR_Z - 0.006
    for cx in (-6.10, 6.10):
        _box(g, (cx, -2.30, PLAT_FLOOR_Z + col_h * 0.5 + 0.003), (0.50, 0.50, col_h), "DCE1E6", "concrete", bevel=0.008)
        _box(g, (cx, -2.30, PLAT_FLOOR_Z + 0.11), (0.54, 0.54, 0.20), "7A838C", "stone_plinth", bevel=0.005)
        # Signature Line 2 green directional collar wrap around column at eye height
        _box(g, (cx, -2.30, PLAT_FLOOR_Z + 1.85), (0.525, 0.525, 0.24), COL_LINE2_GREEN, "trim_paint", bevel=0.003)


# ---------------------------------------------------------------------------
# 2. Train Sidewalls (North & South), End Gangway Bulkheads (East & West), Station Back Wall
# ---------------------------------------------------------------------------


def _build_train_sidewall(
    g: MeshGroup,
    wall_y: float,
    *,
    is_north: bool,
    open_center_door: bool,
) -> None:
    """Build one complete 15.8m Seoul Metro commuter car sidewall with 3 door bays & 4 wide windows."""
    # Wall openings: 3 double sliding doorways (1.36m wide, H=1.96m) + 4 wide panoramic train windows
    # Note: for North wall (rot_z=0), local X == world X; for South wall (rot_z=pi), local X == -world X
    sign = 1.0 if is_north else -1.0
    rot_z = 0.0 if is_north else math.pi
    openings: List[WallOpening] = []
    for dx in DOOR_XS:
        openings.append(WallOpening(offset_x=sign * dx, width=1.36, height=1.96, sill_z=0.0, kind="door"))
    # 4 wide panoramic train car windows between/outside doors
    win_specs = (
        (-6.50, 1.60),
        (-2.30, 2.35),
        (2.30, 2.35),
        (6.50, 1.60),
    )
    for wx, ww in win_specs:
        openings.append(WallOpening(offset_x=sign * wx, width=ww, height=1.02, sill_z=0.84, kind="window"))

    car_wall_h = TRAIN_ROOF_Z - (TRAIN_FLOOR_Z - 0.004) + 0.004
    add_wall_with_openings(
        g,
        center=(0.0, wall_y, TRAIN_FLOOR_Z - 0.004),
        length=SCENE_W - 0.12,
        thickness=0.11,
        height=car_wall_h,
        openings=openings,
        rot_z=rot_z,
        color=COL_CAR_INTERIOR,
        tile="trim_paint",
        baseboard_height=0.075,
        baseboard_depth=0.014,
        baseboard_color=COL_STAINLESS,
        baseboard_tile="sash_metal",
        crown_height=0.12,
        crown_depth=0.045,
        crown_color=COL_CAR_LINER,
        crown_tile="trim_paint",
        interior_side=-1,
    )

    # Exterior Line 2 Green Livery Band running along outer car body (below windows & header)
    ext_y = wall_y + (0.062 if is_north else -0.062)
    for wx, ww in win_specs:
        _box(g, (wx, ext_y, TRAIN_FLOOR_Z + 0.66), (ww + 0.65, 0.012, 0.14), COL_LINE2_GREEN, "trim_paint", bevel=0.0)
        # Window black rubber gasket frame + horizontal transom bar (clear glass OPEN AIR!)
        _box(g, (wx, wall_y, TRAIN_FLOOR_Z + 0.855), (ww + 0.02, 0.128, 0.036), COL_STEEL_DARK, "sash_metal", bevel=0.003)
        _box(g, (wx, wall_y, TRAIN_FLOOR_Z + 1.845), (ww + 0.02, 0.128, 0.036), COL_STEEL_DARK, "sash_metal", bevel=0.003)
        _box(g, (wx, wall_y, TRAIN_FLOOR_Z + 1.56), (ww - 0.04, 0.045, 0.026), COL_STAINLESS, "sash_metal", bevel=0.002)

    # Sliding Train Door Leaves (stainless steel stiles, open window viewport, yellow caution stripe)
    for dx in DOOR_XS:
        if open_center_door and abs(dx) < 0.1:
            # Slid open cleanly into pockets
            for side in (-1.0, 1.0):
                _box(g, (dx + side * 0.68, wall_y, TRAIN_FLOOR_Z + 0.98), (0.065, 0.09, 1.92), COL_STAINLESS, "sash_metal", bevel=0.003)
            continue
        for side in (-1.0, 1.0):
            lx = dx + side * 0.335
            # Lower solid stainless door panel + left/right stiles + top header (upper glass viewport OPEN!)
            _box(g, (lx, wall_y, TRAIN_FLOOR_Z + 0.44), (0.63, 0.056, 0.86), COL_STAINLESS, "sash_metal", bevel=0.003)
            _box(g, (lx - 0.28, wall_y, TRAIN_FLOOR_Z + 1.38), (0.075, 0.056, 1.04), COL_STAINLESS, "sash_metal", bevel=0.003)
            _box(g, (lx + 0.28, wall_y, TRAIN_FLOOR_Z + 1.38), (0.075, 0.056, 1.04), COL_STAINLESS, "sash_metal", bevel=0.003)
            _box(g, (lx, wall_y, TRAIN_FLOOR_Z + 1.88), (0.50, 0.056, 0.11), COL_STAINLESS, "sash_metal", bevel=0.003)
            # Yellow safety edge strip at center meeting rubber seal
            _box(g, (dx + side * 0.020, wall_y, TRAIN_FLOOR_Z + 0.96), (0.028, 0.064, 1.88), COL_TACTILE_YELLOW, "trim_paint", bevel=0.0)


def _build_wall_north(g: MeshGroup) -> None:
    """Train Car North Sidewall (hides cleanly for North-to-South train interior cuts)."""
    _build_train_sidewall(g, TRAIN_N_Y, is_north=True, open_center_door=False)


def _build_wall_south(g: MeshGroup) -> None:
    """Station South Back Wall + Train South Sidewall (hides cleanly for full dollhouse cutaway!)."""
    # 1. Station Back Wall along Y = -HALF_D + WALL_T*0.5 (porcelain panel tiles + Line 2 green stripe)
    st_wall_h = (STATION_CEIL_Z + 0.004) - (PLAT_FLOOR_Z - 0.004)
    add_wall_with_openings(
        g,
        center=(0.0, PLAT_Y_MIN + WALL_T * 0.5, PLAT_FLOOR_Z - 0.004),
        length=SCENE_W,
        thickness=WALL_T,
        height=st_wall_h,
        openings=(
            # Recessed stair/exit portal archway on West end
            WallOpening(offset_x=6.10, width=2.20, height=2.45, sill_z=0.0, kind="door"),
        ),
        rot_z=math.pi,
        color=COL_PLAT_WALL,
        tile="tile_ceramic",
        baseboard_height=0.14,
        baseboard_depth=0.020,
        baseboard_color="7C8590",
        baseboard_tile="stone_plinth",
        crown_height=0.08,
        crown_depth=0.025,
        crown_color="DCE1E6",
        interior_side=-1,
    )
    # Iconic Line 2 Green horizontal wall stripe along station back wall
    _box(g, (1.10, PLAT_Y_MIN + WALL_T + 0.012, PLAT_FLOOR_Z + 1.56), (13.40, 0.016, 0.14), COL_LINE2_GREEN, "trim_paint", bevel=0.0)
    # 3 Illuminated Backlit Station Ad Lightboxes recessed/mounted on South back wall
    for ax in (-2.60, 0.40, 3.40):
        _box(g, (ax, PLAT_Y_MIN + WALL_T + 0.036, PLAT_FLOOR_Z + 1.52), (1.92, 0.056, 1.12), COL_STEEL_DARK, "sash_metal", bevel=0.004)
        _box(g, (ax, PLAT_Y_MIN + WALL_T + 0.068, PLAT_FLOOR_Z + 1.52), (1.78, 0.012, 0.98), "F2F5F8", "plaster", bevel=0.0)
        _box(g, (ax, PLAT_Y_MIN + WALL_T + 0.078, PLAT_FLOOR_Z + 1.56), (1.56, 0.008, 0.46), ("3E78A8", "248F58", "D87E3E")[int((ax + 3) // 3) % 3], "trim_paint", bevel=0.0)

    # 2. Train Car South Sidewall (with Center Door SLID OPEN so passengers board seamlessly!)
    _build_train_sidewall(g, TRAIN_S_Y, is_north=False, open_center_door=True)


def _build_train_end_bulkhead(g: MeshGroup, x_pos: float, is_east: bool) -> None:
    """Train car inter-car gangway bulkhead (통로문) at X = ±7.90."""
    rot_z = -math.pi * 0.5 if is_east else math.pi * 0.5
    car_h = TRAIN_ROOF_Z - (TRAIN_FLOOR_Z - 0.004) + 0.004
    add_wall_with_openings(
        g,
        center=(x_pos, TRAIN_MID_Y, TRAIN_FLOOR_Z - 0.004),
        length=(TRAIN_N_Y - TRAIN_S_Y) - 0.12,
        thickness=0.14,
        height=car_h,
        openings=(
            WallOpening(offset_x=0.0, width=0.92, height=1.94, sill_z=0.0, kind="door"),
        ),
        rot_z=rot_z,
        color=COL_CAR_LINER,
        tile="trim_paint",
        baseboard_height=0.07,
        baseboard_depth=0.014,
        baseboard_color=COL_STAINLESS,
        crown_height=0.08,
        crown_depth=0.02,
        crown_color="DCE2E8",
        interior_side=-1,
    )
    # Inter-car stainless gangway door frame & push bar
    in_x = x_pos + (-0.075 if is_east else 0.075)
    for dy in (-0.44, 0.44):
        _box(g, (x_pos, TRAIN_MID_Y + dy, TRAIN_FLOOR_Z + 0.97), (0.16, 0.055, 1.94), COL_STAINLESS, "sash_metal", bevel=0.003)
    _box(g, (x_pos, TRAIN_MID_Y, TRAIN_FLOOR_Z + 1.92), (0.16, 0.96, 0.065), COL_STAINLESS, "sash_metal", bevel=0.003)
    # Recessed lower gangway door panel (upper window open for depth!)
    _box(g, (x_pos, TRAIN_MID_Y, TRAIN_FLOOR_Z + 0.44), (0.048, 0.82, 0.84), COL_STAINLESS, "sash_metal", bevel=0.003)
    _box(g, (in_x, TRAIN_MID_Y, TRAIN_FLOOR_Z + 0.92), (0.024, 0.62, 0.032), COL_STEEL_DARK, "hardware_brass", bevel=0.003)


def _build_wall_west(g: MeshGroup) -> None:
    _build_train_end_bulkhead(g, -HALF_W + 0.11, is_east=False)


def _build_wall_east(g: MeshGroup) -> None:
    _build_train_end_bulkhead(g, HALF_W - 0.11, is_east=True)


# ---------------------------------------------------------------------------
# 3. Ceiling: Train Roof + LED Coves, Station Canopy, Seongsu 211 Sign, LED Arrival & Exit 3
# ---------------------------------------------------------------------------


def _build_ceiling(g: MeshGroup) -> None:
    # 1. Train Car Arched Roof & Continuous Twin Interior LED Lighting Coves (Z = 2.66..2.86)
    car_w = TRAIN_N_Y - TRAIN_S_Y + 0.16
    _box(g, (0.0, TRAIN_MID_Y, TRAIN_ROOF_Z + 0.08), (SCENE_W - 0.08, car_w, 0.14), "D8DEE4", "ceiling_metal", bevel=0.006)
    # Curved inner ceiling side coves + twin bright white continuous LED strips inside car
    for side in (-1.0, 1.0):
        ly = TRAIN_MID_Y + side * 0.66
        _box(g, (0.0, ly, TRAIN_ROOF_Z - 0.018), (SCENE_W - 0.60, 0.24, 0.024), "FFFFFF", "emissive_cool", bevel=0.0)
    # Center longitudinal HVAC diffuser channel inside train ceiling
    _box(g, (0.0, TRAIN_MID_Y, TRAIN_ROOF_Z - 0.022), (SCENE_W - 0.80, 0.42, 0.030), "DCE2E8", "ceiling_metal", bevel=0.003)
    for hx in (-5.6, -2.8, 0.0, 2.8, 5.6):
        _box(g, (hx, TRAIN_MID_Y, TRAIN_ROOF_Z - 0.042), (0.85, 0.24, 0.012), "B4BCC4", "ceiling_metal", bevel=0.0)

    # Train Interior Door-Header LED Destination Displays (emissive_amber -> "이번 열차: 성수행 2분 전")
    for dx in DOOR_XS:
        _box(g, (dx, TRAIN_N_Y - 0.075, TRAIN_FLOOR_Z + 2.16), (1.16, 0.032, 0.20), "222830", "ceiling_metal", bevel=0.003)
        _box(g, (dx, TRAIN_N_Y - 0.095, TRAIN_FLOOR_Z + 2.16), (1.10, 0.008, 0.16), "FFFFFF", "emissive_amber", bevel=0.0, uv_fit=True)

    # 2. Station Platform Ceiling Canopy & Linear LED Rows (Y in [-3.25, +0.20], Z = 3.22..3.40)
    plat_d = (PLAT_Y_MAX + 0.08) - PLAT_Y_MIN
    plat_cy = 0.5 * (PLAT_Y_MIN + PLAT_Y_MAX + 0.08)
    _box(g, (0.0, plat_cy, STATION_CEIL_Z + 0.09), (SCENE_W, plat_d, 0.18), COL_CEIL_WHITE, "ceiling_plaster", bevel=0.004)
    # Architectural ceiling baffle beams running crosswise
    for bx in (-6.4, -3.2, 0.0, 3.2, 6.4):
        _box(g, (bx, plat_cy, STATION_CEIL_Z - 0.032), (0.14, plat_d - 0.24, 0.064), COL_CEIL_DARK, "ceiling_beam", bevel=0.003)
    # 2 continuous platform linear LED rows (bright clean station daylight)
    for ly in (-2.25, -0.78):
        _box(g, (0.0, ly, STATION_CEIL_Z - 0.026), (SCENE_W - 0.70, 0.22, 0.024), "FFFFFF", "emissive_cool", bevel=0.0)

    # 3. Suspended Illuminated Seoul Metro Line 2 Station Signboards (2호선 성수역 211, tile="emissive_neon")
    # Mildly tempered tint "CFD8E0" prevents EEVEE AgX blowout so dark Korean text & green band read razor-sharp!
    for sx in (-3.55, 3.55):
        sy, sz = -1.48, STATION_CEIL_Z - 0.52
        for rx in (-0.65, 0.65):
            g.rail((sx + rx, sy, STATION_CEIL_Z - 0.01), (sx + rx, sy, sz + 0.26), 0.014, COL_STAINLESS, sides=8, tile="ceiling_metal")
        _box(g, (sx, sy, sz), (1.86, 0.11, 0.54), "2C343C", "ceiling_metal", bevel=0.004)
        # Double-sided crisp Korean Seongsu 211 station sign faces (facing ±Y onto platform & train)
        _box(g, (sx, sy - 0.060, sz), (1.78, 0.008, 0.48), "CFD8E0", "emissive_neon", bevel=0.0, uv_fit=True)
        _box(g, (sx, sy + 0.060, sz), (1.78, 0.008, 0.48), "CFD8E0", "emissive_neon", bevel=0.0, uv_fit=True)

    # 4. Central Suspended Next-Train LED Arrival Display (행선지 LED 전광판, tile="emissive_amber")
    # Oriented perpendicular to track (facing ±X along the platform walkway — 100% authentic Seoul Metro!)
    ax, ay, az = 0.0, -1.52, STATION_CEIL_Z - 0.52
    for ry in (-0.54, 0.54):
        g.rail((ax, ay + ry, STATION_CEIL_Z - 0.01), (ax, ay + ry, az + 0.22), 0.014, COL_STAINLESS, sides=8, tile="ceiling_metal")
    _box(g, (ax, ay, az), (0.13, 1.56, 0.46), "1F252C", "ceiling_metal", bevel=0.004)
    _box(g, (ax - 0.070, ay, az), (0.008, 1.48, 0.40), "FFFFFF", "emissive_amber", bevel=0.0, uv_fit=True)
    _box(g, (ax + 0.070, ay, az), (0.008, 1.48, 0.40), "FFFFFF", "emissive_amber", bevel=0.0, uv_fit=True)

    # 5. Suspended Green Exit 3 Signboard ("3번 출구 / EXIT 3", tile="emissive_exit_green", facing ±X along platform)
    ex_x, ex_y, ex_z = -5.40, -1.52, STATION_CEIL_Z - 0.52
    for ry in (-0.34, 0.34):
        g.rail((ex_x, ex_y + ry, STATION_CEIL_Z - 0.01), (ex_x, ex_y + ry, ex_z + 0.18), 0.012, COL_STAINLESS, sides=8, tile="ceiling_metal")
    _box(g, (ex_x, ex_y, ex_z), (0.09, 0.96, 0.36), "283038", "ceiling_metal", bevel=0.004)
    _box(g, (ex_x - 0.050, ex_y, ex_z), (0.008, 0.90, 0.31), "E6F2EC", "emissive_exit_green", bevel=0.0, uv_fit=True)
    _box(g, (ex_x + 0.050, ex_y, ex_z), (0.008, 0.90, 0.31), "E6F2EC", "emissive_exit_green", bevel=0.0, uv_fit=True)


# ---------------------------------------------------------------------------
# 4. Hero Furniture: Train Benches (Regular + Priority), Curved Windscreens, Platform Benches
# ---------------------------------------------------------------------------


def _add_train_bench(
    g: MeshGroup,
    cx: float,
    wall_y: float,
    *,
    length: float,
    seats: int,
    facing_south: bool,
    is_priority: bool,
) -> None:
    """Longitudinal Seoul Metro stainless-base bench with contoured individual seat cushions."""
    d_sign = -1.0 if facing_south else 1.0
    seat_y = wall_y + d_sign * 0.31
    back_y = wall_y + d_sign * 0.10
    z0 = TRAIN_FLOOR_Z

    # Under-seat stainless heater plinth box (recessed toe-kick)
    _box(g, (cx, wall_y + d_sign * 0.25, z0 + 0.18), (length - 0.06, 0.36, 0.35), COL_STAINLESS, "metal_leg_steel", bevel=0.004)
    # Brushed stainless cantilevered seat pan
    _box(g, (cx, seat_y, z0 + 0.38), (length, 0.46, 0.048), COL_STAINLESS, "metal_leg_steel", bevel=0.005)
    # Individual contoured upholstered cushions (regular blue-teal vs priority amber-yellow!)
    cush_col = COL_SEAT_PRIORITY if is_priority else COL_SEAT_REGULAR
    pad_w = (length - 0.08) / float(seats)
    for si in range(seats):
        px = (cx - (length - 0.08) * 0.5) + (si + 0.5) * pad_w
        _box(g, (px, seat_y + d_sign * 0.015, z0 + 0.422), (pad_w - 0.016, 0.40, 0.042), cush_col, "fabric_velvet", bevel=0.008)
        _box(g, (px, back_y + d_sign * 0.025, z0 + 0.65), (pad_w - 0.016, 0.056, 0.38), cush_col, "fabric_velvet", bevel=0.008)
    # Stainless upper backrest rail cap
    _box(g, (cx, back_y, z0 + 0.855), (length, 0.068, 0.036), COL_STAINLESS, "metal_leg_steel", bevel=0.004)

    # Curved tubular-steel & glass end windscreens (곡선 유리 칸막이) at both ends of bench
    for side in (-1.0, 1.0):
        ex = cx + side * (length * 0.5 + 0.035)
        y_wall_pt = wall_y + d_sign * 0.07
        y_front_pt = wall_y + d_sign * 0.55
        # Curved tubular steel frame sweeping from floor up to stanchion bar
        add_pipe_frame(
            g,
            waypoints=(
                (ex, y_wall_pt, z0 + 0.02),
                (ex, y_front_pt, z0 + 0.02),
                (ex, y_front_pt, z0 + 1.18),
                (ex, wall_y + d_sign * 0.46, z0 + 1.46),
                (ex, y_wall_pt, z0 + 1.50),
            ),
            radius=0.018,
            sides=10,
            bend_radius=0.14,
            flange_ends=True,
            color=COL_STAINLESS,
            tile="metal_leg_steel",
        )
        # Sleek curved windscreen lower frost divider accent strip (leaves upper view open!)
        _box(g, (ex, wall_y + d_sign * 0.30, z0 + 0.68), (0.014, 0.44, 0.42), "D6E6EE", "laminate_matte", bevel=0.003)


def _add_platform_bench(g: MeshGroup, cx: float, cy: float) -> None:
    """Modern Seoul Metro station platform slatted wood & steel bench."""
    z0 = PLAT_FLOOR_Z
    # 3 steel pedestal legs
    for ox in (-0.82, 0.0, 0.82):
        _box(g, (cx + ox, cy, z0 + 0.20), (0.065, 0.46, 0.40), COL_STEEL_DARK, "metal_leg_dark", bevel=0.004)
    # 5 warm timber seat slats
    for sy in (-0.18, -0.09, 0.0, 0.09, 0.18):
        _box(g, (cx, cy + sy, z0 + 0.42), (2.10, 0.072, 0.034), COL_BENCH_WOOD, "wood_oak", bevel=0.004)
    # 2 low brushed-steel dividers / armrests
    for ox in (-1.01, 0.0, 1.01):
        _box(g, (cx + ox, cy, z0 + 0.52), (0.036, 0.44, 0.16), COL_STAINLESS, "metal_leg_steel", bevel=0.004)


def _build_furniture_hero(g: MeshGroup) -> None:
    # 1. Both Sides Longitudinal Train Bench Seats (Regular 6-seaters in center bays + Priority 3-seaters at both ends!)
    for wall_y, facing_south in ((TRAIN_N_Y, True), (TRAIN_S_Y, False)):
        # Center-West & Center-East regular benches (X = -2.30 and +2.30, length 2.95m, 6 seats each)
        _add_train_bench(g, -2.30, wall_y, length=2.92, seats=6, facing_south=facing_south, is_priority=False)
        _add_train_bench(g, 2.30, wall_y, length=2.92, seats=6, facing_south=facing_south, is_priority=False)
        # West-End & East-End Priority Seats (노약자석, X = -6.58 and +6.58, length 1.72m, 3 seats each)
        _add_train_bench(g, -6.58, wall_y, length=1.72, seats=3, facing_south=facing_south, is_priority=True)
        _add_train_bench(g, 6.58, wall_y, length=1.72, seats=3, facing_south=facing_south, is_priority=True)

    # 2. Platform Waiting Benches (facing train / North at Y = -2.55)
    _add_platform_bench(g, -2.85, -2.55)
    _add_platform_bench(g, 2.85, -2.55)


# ---------------------------------------------------------------------------
# 5. Props & Clutter: Stanchion Poles, Overhead Grab Rails, 26 Hand Straps, Route Maps & Priority Plaques
# ---------------------------------------------------------------------------


def _add_hand_strap(g: MeshGroup, x: float, y: float, rail_z: float) -> None:
    """Watertight sculpted Seoul Metro hanging hand-strap ring (손잡이 고리) with high-contrast grip."""
    # Rail clamp collar
    _box(g, (x, y, rail_z), (0.036, 0.038, 0.044), COL_STRAP_GRIP, "plastic_matte", bevel=0.003)
    # Flexible vertical strap band descending 17cm + Seoul Metro Line 2 green sleeve collar
    _box(g, (x, y, rail_z - 0.105), (0.028, 0.014, 0.165), "343B44", "rubber_dark", bevel=0.0)
    _box(g, (x, y, rail_z - 0.135), (0.034, 0.020, 0.042), COL_LINE2_GREEN, "plastic_matte", bevel=0.003)
    # Sculpted triangular/D-ring grip loop with dark slate bottom grip pad so every strap pops clearly!
    top_z = rail_z - 0.195
    bot_z = rail_z - 0.315
    _box(g, (x, y, top_z), (0.046, 0.024, 0.024), "CBD4DC", "plastic_matte", bevel=0.003)
    _box(g, (x, y, bot_z), (0.132, 0.026, 0.026), COL_STRAP_GRIP, "plastic_matte", bevel=0.004)
    g.rail((x - 0.016, y, top_z - 0.006), (x - 0.058, y, bot_z + 0.006), 0.011, "CFD7DF", sides=8, tile="plastic_matte")
    g.rail((x + 0.016, y, top_z - 0.006), (x + 0.058, y, bot_z + 0.006), 0.011, "CFD7DF", sides=8, tile="plastic_matte")


def _build_props_clutter(g: MeshGroup) -> None:
    z0 = TRAIN_FLOOR_Z
    rail_z = z0 + 1.88  # 2.12m overhead longitudinal grab rail height

    # 1. Twin Overhead Longitudinal Stainless Grab Rails + Cross-Struts + Vertical Stanchion Poles
    rail_ys = (TRAIN_S_Y + 0.72, TRAIN_N_Y - 0.72)  # Y = 1.02 and Y = 2.40
    for ry in rail_ys:
        g.rail((-7.60, ry, rail_z), (7.60, ry, rail_z), 0.017, COL_STAINLESS, sides=10, tile="steel_brushed")
        # Ceiling support drops along rail
        for sx in (-6.60, -3.75, -0.85, 0.85, 3.75, 6.60):
            g.rail((sx, ry, rail_z + 0.016), (sx, ry, TRAIN_ROOF_Z - 0.015), 0.014, COL_STAINLESS, sides=8, tile="steel_brushed")

    # Cross-arch overhead grab bars spanning between the two longitudinal rails in door vestibules
    for dx in (-4.60, 0.00, 4.60):
        g.rail((dx, rail_ys[0] + 0.018, rail_z + 0.04), (dx, rail_ys[1] - 0.018, rail_z + 0.04), 0.016, COL_STAINLESS, sides=10, tile="steel_brushed")

    # Vertical Floor-to-Ceiling Stanchion Poles at center of each main 6-seater bay (4 poles)
    for px in (-2.30, 2.30):
        for py in (TRAIN_S_Y + 0.62, TRAIN_N_Y - 0.62):
            _cyl_z(g, px, py, z0, TRAIN_ROOF_Z - 0.02, 0.020, 0.020, COL_STAINLESS, "steel_brushed", sides=10)
            _cyl_z(g, px, py, z0, z0 + 0.036, 0.042, 0.036, COL_STEEL_DARK, "iron_dark", sides=10)

    # 2. 26 Hanging Hand-Strap Rings (손잡이 고리 다수) distributed along both rails!
    strap_xs = (-7.10, -6.10, -4.95, -4.25, -3.20, -2.55, -1.90, -1.25, -0.35, 0.35, 1.25, 1.90, 2.55, 3.20, 4.25, 4.95, 6.10, 7.10)
    for idx, sx in enumerate(strap_xs):
        # Put on both sides in main bays & alternating in end bays -> 28 crisp straps total!
        _add_hand_strap(g, sx, rail_ys[0], rail_z)
        if idx % 3 != 1:
            _add_hand_strap(g, sx, rail_ys[1], rail_z)

    # 3. Overhead Stainless Wire Luggage Racks above the 4 main bench bays
    for rx in (-2.30, 2.30):
        for wall_y, d_sign in ((TRAIN_N_Y, -1.0), (TRAIN_S_Y, 1.0)):
            rack_y = wall_y + d_sign * 0.24
            rack_z = z0 + 1.82
            for bar_off in (-0.12, -0.04, 0.04, 0.12):
                g.rail((rx - 1.42, rack_y + bar_off, rack_z), (rx + 1.42, rack_y + bar_off, rack_z), 0.008, COL_STAINLESS, sides=6, tile="steel_brushed")
            for bx in (rx - 1.38, rx, rx + 1.38):
                _box(g, (bx, rack_y, rack_z - 0.02), (0.026, 0.34, 0.028), COL_STAINLESS, "aluminum_satin", bevel=0.002)

    # 4. Seoul Metro Line 2 Route Map Panels (#156 _paint_subway_route_map on tile="paper_label", color="FFFFFF")
    # ALWAYS VISIBLE (in BG_Props_Clutter) — inside train above doors/windows AND on PSD header facing platform!
    # Inside train North upper cove (facing South -Y into train & platform)
    for mx in (-2.30, 2.30):
        _box(g, (mx, TRAIN_N_Y - 0.072, z0 + 2.02), (1.42, 0.026, 0.34), COL_STEEL_DARK, "aluminum_satin", bevel=0.003)
        _box(g, (mx, TRAIN_N_Y - 0.090, z0 + 2.02), (1.36, 0.008, 0.29), "FFFFFF", "paper_label", bevel=0.0, uv_fit=True)
    # On Platform PSD upper fascia facing South (-Y onto platform) -> crisp Line 2 route map & safety notice!
    for mx in (-3.05, 3.05):
        _box(g, (mx, PSD_Y - 0.095, PLAT_FLOOR_Z + 2.18), (1.32, 0.022, 0.34), COL_STEEL_DARK, "aluminum_satin", bevel=0.003)
        _box(g, (mx, PSD_Y - 0.112, PLAT_FLOOR_Z + 2.18), (1.26, 0.008, 0.29), "FFFFFF", "paper_label", bevel=0.0, uv_fit=True)

    # 5. Priority Seat & Car 2114 Plaques (#156 tile="enamel_gloss", color="FFFFFF", uv_fit=True!)
    for px in (-6.58, 6.58):
        _box(g, (px, TRAIN_N_Y - 0.072, z0 + 1.98), (0.92, 0.022, 0.28), COL_LINE2_GREEN, "aluminum_satin", bevel=0.003)
        _box(g, (px, TRAIN_N_Y - 0.088, z0 + 1.98), (0.86, 0.008, 0.23), "FFFFFF", "enamel_gloss", bevel=0.0, uv_fit=True)
    # Car number plate above West & East gangway doors
    _box(g, (HALF_W - 0.20, TRAIN_MID_Y, z0 + 2.08), (0.022, 0.68, 0.22), COL_STEEL_DARK, "aluminum_satin", bevel=0.003)
    _box(g, (HALF_W - 0.218, TRAIN_MID_Y, z0 + 2.08), (0.008, 0.62, 0.18), "FFFFFF", "enamel_gloss", bevel=0.0, uv_fit=True)

    # 6. Platform Utility Props: Twin Stainless Recycling Bins + Emergency Safety Box + PSD Intercoms
    # Recycling bin pair beside West column (-6.10, -2.30)
    for bi, (bx, top_col) in enumerate(((-5.55, "2D74B8"), (-5.15, "3C9A5E"))):
        _box(g, (bx, -2.42, PLAT_FLOOR_Z + 0.42), (0.34, 0.36, 0.84), COL_STAINLESS, "steel_brushed", bevel=0.005)
        _box(g, (bx, -2.42, PLAT_FLOOR_Z + 0.855), (0.35, 0.37, 0.045), top_col, "plastic_matte", bevel=0.003)
    # Red emergency fire cabinet & safety phone on East column (+6.10, -2.30)
    _box(g, (6.10, -2.01, PLAT_FLOOR_Z + 0.92), (0.36, 0.08, 0.56), "C43630", "enamel_gloss", bevel=0.004)
    # PSD emergency intercom call boxes mounted on posts
    for ix in (-0.76, 0.76):
        _box(g, (ix, PSD_Y - 0.072, PLAT_FLOOR_Z + 1.32), (0.14, 0.042, 0.22), "D8DEE4", "aluminum_satin", bevel=0.003)
        _box(g, (ix, PSD_Y - 0.098, PLAT_FLOOR_Z + 1.35), (0.055, 0.012, 0.055), "CC342E", "plastic_matte", bevel=0.002)


# ---------------------------------------------------------------------------
# Camera Presets & 6-View Contact Sheet Framing
# ---------------------------------------------------------------------------


def build_subway_cameras() -> Dict[str, Any]:
    return {
        "train_aisle_28mm": {
            "label": "28mm 전동차 객실 내부 통로",
            "lensMm": 28,
            "position": [-6.20, 1.52, -1.72],
            "target": [5.50, 1.42, -1.72],
        },
        "platform_waiting_35mm": {
            "label": "35mm 승강장 스크린도어 대기",
            "lensMm": 35,
            "position": [-3.60, 1.56, 1.85],
            "target": [1.40, 1.52, -0.40],
        },
        "boarding_door_50mm": {
            "label": "50mm 출입문 탑승 대면",
            "lensMm": 50,
            "position": [0.15, 1.48, 1.65],
            "target": [0.00, 1.38, -2.40],
        },
    }


def build_subway_review_views() -> List[PreviewCameraView]:
    return [
        PreviewCameraView(
            key="front",
            label="1 FRONT CUTAWAY",
            location=(0.0, -10.40, 2.05),
            target=(0.0, 0.45, 1.52),
            lens_mm=24.0,
            hide_nodes=("BG_Wall_South", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="side",
            label="2 TRAIN AISLE",
            location=(-6.85, TRAIN_MID_Y, 1.56),
            target=(6.40, TRAIN_MID_Y, 1.44),
            lens_mm=24.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="back",
            label="3 NORTH CUTAWAY",
            location=(0.0, 10.20, 1.98),
            target=(0.0, 0.85, 1.48),
            lens_mm=24.0,
            hide_nodes=("BG_Wall_North",),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(-9.20, -9.80, 6.60),
            target=(0.35, 0.25, 1.10),
            lens_mm=32.0,
            hide_nodes=("BG_Wall_South", "BG_Wall_West", "BG_Ceiling", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 PLATFORM 35MM",
            location=(-4.60, -1.72, 1.62),
            target=(2.80, -0.35, 1.72),
            lens_mm=26.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(0.0, -6.80, 12.60),
            target=(0.0, 0.15, 0.72),
            lens_mm=30.0,
            hide_nodes=("BG_Ceiling", "BG_Wall_South", "BG_Cutaway_Front"),
        ),
    ]


def build_scene_groups() -> HeroSceneGroups:
    groups = HeroSceneGroups()
    _build_floor_and_psd(groups.floor)
    _build_wall_north(groups.wall_north)
    _build_wall_south(groups.wall_south)
    _build_wall_west(groups.wall_west)
    _build_wall_east(groups.wall_east)
    _build_ceiling(groups.ceiling)
    _build_furniture_hero(groups.furniture_hero)
    _build_props_clutter(groups.props_clutter)
    groups.ground_to_zero()
    return groups


def run_build(
    *,
    out_dir: Path,
    preview_dir: Path,
    desktop_primary_size: int = 2048,
    desktop_secondary_size: int = 1024,
    mobile_opaque_size: int = 1024,
    mobile_glass_size: int = 512,
    skip_previews: bool = False,
) -> Dict[str, Any]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    out_dir = Path(out_dir)
    preview_dir = Path(preview_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)

    groups = build_scene_groups()
    views = build_subway_review_views()

    mobile_scene: AssembledHeroScene = assemble_mobile_cutaway(
        SLUG,
        groups,
        opaque_size=mobile_opaque_size,
        glass_size=mobile_glass_size,
        auto_ground=False,
        scene_slug=SLUG,
    )
    mobile_gate1 = audit_blender_scene(mobile_scene.root, profile="mobile")
    if not mobile_gate1["passed"]:
        raise RuntimeError(f"Mobile Gate 1 failed: {json.dumps(mobile_gate1['errors'], ensure_ascii=False)}")

    mobile_glb = out_dir / "mobile.glb"
    mobile_export = export_cutaway_glb(mobile_scene, mobile_glb, optimize_meshopt=True, copyright_text=DEFAULT_COPYRIGHT)
    _remove_hierarchy(mobile_scene)

    desktop_scene: AssembledHeroScene = assemble_desktop_cutaway(
        SLUG,
        groups,
        primary_size=desktop_primary_size,
        secondary_size=desktop_secondary_size,
        auto_ground=False,
        scene_slug=SLUG,
    )
    desktop_gate1 = audit_blender_scene(desktop_scene.root, profile="desktop")
    if not desktop_gate1["passed"]:
        raise RuntimeError(f"Desktop Gate 1 failed: {json.dumps(desktop_gate1['errors'], ensure_ascii=False)}")

    desktop_glb = out_dir / "desktop.glb"
    desktop_export = export_cutaway_glb(desktop_scene, desktop_glb, optimize_meshopt=True, copyright_text=DEFAULT_COPYRIGHT)

    desktop_gate2 = inspect_glb(desktop_glb, profile="desktop", require_meshopt=True, run_validate=True)
    mobile_gate2 = inspect_glb(mobile_glb, profile="mobile", require_meshopt=True, run_validate=True)
    if not desktop_gate2["passed"]:
        raise RuntimeError(f"Desktop Gate 2 failed: {json.dumps(desktop_gate2['errors'], ensure_ascii=False)}")
    if not mobile_gate2["passed"]:
        raise RuntimeError(f"Mobile Gate 2 failed: {json.dumps(mobile_gate2['errors'], ensure_ascii=False)}")

    assert desktop_export["byteSize"] <= 12 * 1024 * 1024, f"Desktop GLB > 12MB: {desktop_export['byteSize']}"
    assert mobile_export["byteSize"] <= 4 * 1024 * 1024, f"Mobile GLB > 4MB: {mobile_export['byteSize']}"
    assert desktop_gate2["summary"]["triangles"] <= 250_000, f"Desktop tris > 250k: {desktop_gate2['summary']['triangles']}"
    assert mobile_gate2["summary"]["triangles"] <= 80_000, f"Mobile tris > 80k: {mobile_gate2['summary']['triangles']}"

    sheet_report: Dict[str, Any] = {}
    svg_report: Dict[str, Any] = {}
    if not skip_previews:
        sheet_path = out_dir / "contact_sheet.png"
        sheet_report = render_six_view_contact_sheet(
            sheet_path,
            root_obj=desktop_scene.root,
            views=views,
            tile_resolution=512,
            interior_cutaway=True,
            lighting_preset="day_5600k",
        )
        shutil.copy2(sheet_path, preview_dir / f"{SLUG}_contact_sheet.png")

        svg_path = out_dir / "freestyle.svg"
        svg_report = render_freestyle_svg(
            svg_path,
            root_obj=desktop_scene.root,
            view=views[3],
            resolution=512,
            interior_cutaway=True,
        )

    manifest: Dict[str, Any] = {
        "assetId": SLUG,
        "titleKo": TITLE_KO,
        "dimensionsM": [SCENE_W, SCENE_D, SCENE_H],
        "cutawayContract": "room-v1",
        "fileName": desktop_export["fileName"],
        "byteSize": desktop_export["byteSize"],
        "sha256": desktop_export["sha256"],
        "bounds": desktop_export["bounds"],
        "nodes": desktop_export["nodeNames"],
        "mobile": {
            "fileName": mobile_export["fileName"],
            "byteSize": mobile_export["byteSize"],
            "sha256": mobile_export["sha256"],
            "nodes": mobile_export["nodeNames"],
        },
        "cameras": build_subway_cameras(),
        "lightingPresets": build_lighting_presets(),
    }
    if svg_report:
        manifest["freestyleSvg"] = {
            "path": "freestyle.svg",
            "byteSize": svg_report["byteSize"],
            "pathCount": svg_report["pathCount"],
            "strokeWidths": svg_report["strokeWidths"],
            "lineSets": svg_report["lineSets"],
        }
    if sheet_report:
        manifest["contactSheet"] = {
            "path": "contact_sheet.png",
            "byteSize": sheet_report["byteSize"],
            "dimensions": sheet_report["sheetDimensions"],
        }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    qa_report: Dict[str, Any] = {
        "slug": SLUG,
        "manifestPath": str(manifest_path),
        "desktop": {
            "export": desktop_export,
            "gate1": desktop_gate1["summary"],
            "gate2": desktop_gate2["summary"],
            "gltfValidatePassed": bool(desktop_gate2["gltf_validate"]["passed"]),
        },
        "mobile": {
            "export": mobile_export,
            "gate1": mobile_gate1["summary"],
            "gate2": mobile_gate2["summary"],
            "gltfValidatePassed": bool(mobile_gate2["gltf_validate"]["passed"]),
        },
        "freestyleSvg": svg_report,
        "contactSheet": sheet_report,
    }
    (preview_dir / f"{SLUG}_qa.json").write_text(json.dumps(qa_report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(qa_report, indent=2, ensure_ascii=False))
    return qa_report


def main(argv: Optional[Sequence[str]] = None) -> int:
    raw = list(argv) if argv is not None else (sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    parser = argparse.ArgumentParser(description=f"Build {SLUG} Hero BG3D v2")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--preview-dir", type=Path, default=DEFAULT_PREVIEW_DIR)
    parser.add_argument("--desktop-primary-size", type=int, default=2048)
    parser.add_argument("--desktop-secondary-size", type=int, default=1024)
    parser.add_argument("--mobile-opaque-size", type=int, default=1024)
    parser.add_argument("--mobile-glass-size", type=int, default=512)
    parser.add_argument("--skip-previews", action="store_true")
    args = parser.parse_args(raw)
    run_build(
        out_dir=args.out,
        preview_dir=args.preview_dir,
        desktop_primary_size=args.desktop_primary_size,
        desktop_secondary_size=args.desktop_secondary_size,
        mobile_opaque_size=args.mobile_opaque_size,
        mobile_glass_size=args.mobile_glass_size,
        skip_previews=args.skip_previews,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
