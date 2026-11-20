"""Hero Webtoon 3D Background #3: Korean High School Classroom & Corridor.

Asset slug: ``kr_highschool_classroom_corridor``
Real-world dimensions: ``9.60 × 9.20 × 3.00 m`` (Classroom ``7.00 m`` + Corridor ``2.20 m``)

Architectural & Prop Specification:
  - 8-node Desktop Cutaway hierarchy (``desktop-hero`` 100/100, <= 8 DC, <= 4 mat,
    35k-120k tris, <= 6 MiB, meshopt compressed)
  - 4-node Mobile Cutaway merge (``mobile-hero`` 100/100, <= 4 DC, <= 2 mat, <= 3 MiB)
  - Authentic Korean left-hand daylight classroom layout:
      * East (+X): Front teaching wall — curved green chalkboard, chalk tray,
        side cork boards, wall-mounted corner TV on swivel arm, crisp white analog
        wall clock, class motto frame, intercom speaker, raised wooden podium & lectern
      * North (+Y): 4-bay double-sliding aluminum window wall (이중 미서기 샷시),
        insect screen frames, exterior safety railing, deep sills, wall radiators,
        structural pilasters, pleated pier curtains
      * West (-X): Rear classroom wall — 30-cubby student lockers (10×3, select doors
        ajar), tall louvered cleaning supply cabinet, large 3-section rear bulletin
        board with staggered pinned notices, coat hooks, recycling bins
      * Partition (Y = -2.40 m, in BG_Floor so always legible in cutaway): Front & rear
        sliding classroom doors on upper/lower tracks (slid partially open), 2 wide
        middle corridor windows, 4 tilted upper transom windows (상부 고창), class
        number placard, plus corridor-facing 30-cubby shoe racks & stainless drinking
        fountain tucked neatly below the middle corridor windows
      * South (-Y): Corridor outer wall — 4 corridor windows with safety rails,
        recessed fire hydrant cabinet, fire extinguisher
      * Ceiling (+Z): Acoustic ceiling beams & grid, 8 classroom + 3 corridor LED
        panel lights (emissive), 2 four-way ceiling cassette system air conditioners,
        hanging corridor emergency exit sign (green emissive), ceiling projector
      * 25 sets (5×5) of Korean tubular-steel student desks & molded-plywood chairs
        with under-desk book baskets, side bag hooks, hanging school backpacks,
        textbooks, notebooks, pencil cases, and tumblers

Headless execution (Blender 5.3):
  /Users/hjunkim/.local/bin/blender --background --factory-startup \
    --python-exit-code 42 --python tools/blender/webtoon_hero_bg/build_kr_highschool_classroom.py
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import bpy

# Ensure repository root is importable when executed directly via Blender --python
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tools.blender.webtoon_hero_bg.arch_primitives import (  # noqa: E402
    MeshGroup,
    WallOpening,
    _make_beveled_box_local,
    _transform_points,
    add_beveled_box,
    add_curved_foliage_plant,
    add_pipe_frame,
    add_pleated_curtain,
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
    update_manifest_metadata,
)
from tools.blender.webtoon_hero_bg.multiview_preview import (  # noqa: E402
    PreviewCameraView,
    render_hero_review_bundle,
)
from tools.blender.webtoon_hero_bg.qa_bg_gate import (  # noqa: E402
    audit_blender_scene,
    inspect_glb,
)

# ---------------------------------------------------------------------------
# Spatial Envelope & Architectural Constants (metres, Z=0 floor grounding)
# ---------------------------------------------------------------------------

SLUG = "kr_highschool_classroom_corridor"
DEFAULT_OUT_DIR = REPO_ROOT / "apps/web/public/assets/3d/environments/hero-v1"
DEFAULT_PREVIEW_DIR = REPO_ROOT / "loop-stack/v2-previews/bg"

ROOM_LEN_X = 9.600       # X in [-4.800, +4.800]
TOTAL_DEPTH_Y = 9.200    # Y in [-4.600, +4.600] (Classroom 7.00m + Corridor 2.20m)
TOTAL_HEIGHT_Z = 3.000   # Z in [0.000, +3.000]

HALF_X = ROOM_LEN_X * 0.5        # 4.800
HALF_Y = TOTAL_DEPTH_Y * 0.5     # 4.600

WALL_T = 0.180                   # Exterior/end wall thickness
PART_T = 0.160                   # Classroom-corridor partition thickness
PART_Y = -2.400                  # Corridor: [-4.60, -2.40] (2.2m), Classroom: [-2.40, +4.60] (7.0m)

FLOOR_Z = 0.100                  # Finished interior floor surface height
CEIL_Z = 2.880                   # Ceiling soffit height (clear height = 2.78m)
WALL_BASE_Z = 0.096              # 4mm embed into floor finish (prevents welded edge & light leak)
WALL_H = CEIL_Z - WALL_BASE_Z + 0.004  # 2.788 m -> top at 2.884 (4mm embed in ceiling slab)

INNER_X_MIN = -HALF_X + WALL_T + 0.002   # -4.618
INNER_X_MAX = HALF_X - WALL_T - 0.002    # +4.618
CLASS_Y_MIN = PART_Y + PART_T * 0.5      # -2.320
CLASS_Y_MAX = HALF_Y - WALL_T            # +4.420
CORR_Y_MIN = -HALF_Y + WALL_T            # -4.420
CORR_Y_MAX = PART_Y - PART_T * 0.5       # -2.480
CLASS_CENTER_Y = 0.5 * (CLASS_Y_MIN + CLASS_Y_MAX)  # +1.050
CORR_CENTER_Y = 0.5 * (CORR_Y_MIN + CORR_Y_MAX)     # -3.450

BAY_CENTERS_X: Tuple[float, ...] = (-3.375, -1.125, 1.125, 3.375)

# Desk grid: 5 rows (front-to-back) × 5 columns (corridor-to-window) = 25 sets
DESK_ROWS_X: Tuple[float, ...] = (2.22, 1.04, -0.14, -1.32, -2.50)
DESK_COLS_Y: Tuple[float, ...] = (-1.30, -0.12, 1.06, 2.24, 3.42)
DESK_TOP_Z = FLOOR_Z + 0.730     # 0.830 m

# Curated Korean High School Daylight Palette (warm, readable in cel shading)
COL_WALL_CREAM = "F0ECE0"
COL_WALL_LOWER = "E2DEC8"
COL_WALL_CORR = "E8E5DB"
COL_TRIM_WHITE = "EAE6DA"
COL_TRIM_OAK = "C69D6B"
COL_FLOOR_WOOD_A = "CE9F6A"
COL_FLOOR_WOOD_B = "C59661"
COL_FLOOR_CORR = "D9D7CF"
COL_FLOOR_BORDER = "B8B5AB"
COL_SASH_ALU = "D4D7DA"
COL_SASH_DARK = "5D646B"
COL_GLASS_SKY = "CAE3EE"
COL_CHALKBOARD = "24493A"
COL_CHALK_FRAME = "BCC2C6"
COL_DESK_TOP = "DFC092"
COL_DESK_FRAME = "8C959D"
COL_CHAIR_WOOD = "D5AE78"
COL_LOCKER_BODY = "D6D1C4"
COL_LOCKER_DOOR_A = "DDD6C5"
COL_LOCKER_DOOR_B = "D2CCB9"
COL_CLEAN_CAB = "C8C4B8"
COL_CURTAIN = "E8E2D2"
COL_BULLETIN_BG = "728F7A"
COL_PODIUM_WOOD = "B78652"
COL_TV_BEZEL = "2A2F36"
COL_TV_SCREEN = "1E242D"
COL_STEEL = "C4CACF"
COL_IRON = "444B52"
COL_BRASS = "C8A763"
COL_RED_FIRE = "B83832"
COL_CEIL_WHITE = "F2EFE8"
COL_CEIL_BEAM = "E5E1D6"


# ---------------------------------------------------------------------------
# Quantization-Safe Local Helper Primitives (Zero Welded / Zero Degenerate Tris)
# ---------------------------------------------------------------------------
# Note: KHR_mesh_quantization on a 9.6m merged mobile mesh has ~0.58mm grid spacing.
# Keeping every bevel either 0.0 (for thin <14mm trim) or >= 0.0025m guarantees
# 0 degenerate triangles after quantization across both desktop & mobile GLBs.


def _safe_bevel(size: Tuple[float, float, float], bevel: float) -> float:
    """Return a quantization-safe bevel width (0.0 if thin part would sub-millimeter chamfer)."""
    min_dim = min(size)
    if bevel <= 0.0 or min_dim < 0.012:
        return 0.0
    eff = min(bevel, min_dim * 0.28)
    return eff if eff >= 0.0022 else 0.0


def _box(
    group: MeshGroup,
    center: Tuple[float, float, float],
    size: Tuple[float, float, float],
    color: str,
    tile: str,
    bevel: float = 0.0035,
    rot_z: float = 0.0,
) -> None:
    add_beveled_box(
        group,
        center,
        size,
        color=color,
        tile=tile,
        bevel=_safe_bevel(size, bevel),
        rot_z=rot_z,
    )


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
    tile: str,
    bevel: float = 0.0035,
) -> None:
    eff_bev = _safe_bevel((sx, sy, sz), bevel)
    pts, faces = _make_beveled_box_local((sx, sy, sz), bevel=eff_bev)
    shifted = [(p[0] + lx, p[1] + ly, p[2] + lz) for p in pts]
    group.solid(_transform_points(shifted, origin, rot_z=rot_z), faces, color=color, tile=tile)


def _add_cylinder_z(
    group: MeshGroup,
    center_xy: Tuple[float, float],
    z0: float,
    z1: float,
    radius: float,
    color: str,
    tile: str,
    sides: int = 16,
    bevel: float = 0.003,
) -> None:
    cx, cy = center_xy
    h = z1 - z0
    if h <= 1e-4 or radius <= 1e-4:
        return
    c = min(bevel, radius * 0.25, h * 0.22)
    if c >= 0.0022 and h > c * 3.0:
        profile = [
            (radius - c, z0),
            (radius, z0 + c),
            (radius, z1 - c),
            (radius - c, z1),
        ]
    else:
        profile = [(radius, z0), (radius, z1)]
    rings = [
        [
            (cx + r * math.cos(math.tau * i / sides), cy + r * math.sin(math.tau * i / sides), z)
            for i in range(sides)
        ]
        for (r, z) in profile
    ]
    group.rings(rings, color=color, tile=tile)


def _add_double_sliding_window(
    group: MeshGroup,
    center: Tuple[float, float, float],
    width: float,
    height: float,
    wall_thickness: float,
    *,
    rot_z: float = 0.0,
    include_screen: bool = True,
    include_upper_transom_glass: bool = True,
    include_ext_railing: bool = False,
    sill_overhang_in: float = 0.055,
    open_shift: float = 0.14,
    frame_color: str = COL_SASH_ALU,
    sill_color: str = COL_TRIM_OAK,
) -> None:
    """Build a Korean school double-sliding aluminum window (이중 미서기 샷시) with crisp 3D depth.

    Local coordinates before ``rot_z``:
      - X: window width [-width/2, +width/2]
      - -Y: interior side (classroom/corridor inside)
      - +Y: exterior side (outside building)
      - Z: [0, height] from sill base ``center[2]``
    """
    frame_w = 0.048
    # Keep exterior face flush with wall exterior (+wall_thickness/2) so building envelope stays exact 9.60×9.20m
    frame_d = wall_thickness + 0.014
    frame_y = -0.007  # Protrudes 14mm into interior, flush at exterior
    sash_w = 0.032
    sash_d = 0.026

    # Outer jambs & head
    _local_box(group, center, rot_z, -width * 0.5 + frame_w * 0.5, frame_y, height * 0.5, frame_w, frame_d, height, frame_color, "sash_metal")
    _local_box(group, center, rot_z, width * 0.5 - frame_w * 0.5, frame_y, height * 0.5, frame_w, frame_d, height, frame_color, "sash_metal")
    _local_box(group, center, rot_z, 0.0, frame_y, height - frame_w * 0.5, width - frame_w * 1.92, frame_d, frame_w, frame_color, "sash_metal")

    # Deep beveled interior window sill board (flush on exterior, overhanging cleanly inside)
    sill_h = 0.044
    sill_d = wall_thickness + sill_overhang_in
    _local_box(
        group,
        center,
        rot_z,
        0.0,
        -sill_overhang_in * 0.5,
        sill_h * 0.5,
        width + 0.085,
        sill_d,
        sill_h,
        sill_color,
        "trim_paint",
        bevel=0.004,
    )

    # Dual aluminum sliding guide track ribs on sill
    inner_w = width - frame_w * 2.0
    for track_y in (-0.042, -0.004, 0.032):
        _local_box(group, center, rot_z, 0.0, track_y, sill_h + 0.008, inner_w - 0.006, 0.012, 0.014, COL_SASH_DARK, "sash_metal", bevel=0.0)

    inner_h = height - frame_w - sill_h - 0.014
    z0 = sill_h + 0.010
    transom_bar_z = z0 + inner_h * 0.76

    # Horizontal transom mullion bar across the bay
    _local_box(group, center, rot_z, 0.0, -0.014, transom_bar_z, inner_w - 0.006, 0.044, 0.036, frame_color, "sash_metal")

    # Upper fixed transom panes (2 panes with subtle sky-tinted glazing)
    top_h = (z0 + inner_h) - (transom_bar_z + 0.018)
    if top_h > 0.12:
        top_zc = transom_bar_z + 0.018 + top_h * 0.5
        _local_box(group, center, rot_z, 0.0, -0.014, top_zc, 0.030, 0.034, top_h - 0.004, frame_color, "sash_metal")
        if include_upper_transom_glass:
            pane_w = inner_w * 0.5 - 0.026
            for sx in (-1, 1):
                _local_box(
                    group,
                    center,
                    rot_z,
                    sx * (inner_w * 0.25 + 0.005),
                    -0.012,
                    top_zc,
                    pane_w,
                    0.008,
                    top_h - 0.016,
                    COL_GLASS_SKY,
                    "glass_tinted",
                    bevel=0.0,
                )

    # Lower double-sliding sashes (left & right staggered tracks, slightly ajar for daylight)
    low_h = max(0.25, (transom_bar_z - 0.018) - z0)
    low_zc = z0 + low_h * 0.5
    leaf_w = inner_w * 0.5 + 0.018

    left_x = -inner_w * 0.25 + open_shift * 0.5
    right_x = inner_w * 0.25 - open_shift * 0.15
    for idx, (lx_c, ly_t) in enumerate(((left_x, -0.042), (right_x, -0.004))):
        _local_box(group, center, rot_z, lx_c - leaf_w * 0.5 + sash_w * 0.5, ly_t, low_zc, sash_w, sash_d, low_h - 0.004, frame_color, "sash_metal")
        _local_box(group, center, rot_z, lx_c + leaf_w * 0.5 - sash_w * 0.5, ly_t, low_zc, sash_w, sash_d, low_h - 0.004, frame_color, "sash_metal")
        _local_box(group, center, rot_z, lx_c, ly_t, z0 + sash_w * 0.5, leaf_w - sash_w * 1.92, sash_d, sash_w, frame_color, "sash_metal")
        _local_box(group, center, rot_z, lx_c, ly_t, z0 + low_h - sash_w * 0.5 - 0.002, leaf_w - sash_w * 1.92, sash_d, sash_w, frame_color, "sash_metal")
        # Crescent sash lock & pull handle on interior edge
        hx = lx_c + (leaf_w * 0.5 - sash_w * 0.55) * (1.0 if idx == 0 else -1.0)
        _local_box(group, center, rot_z, hx, ly_t - sash_d * 0.5 - 0.011, low_zc, 0.016, 0.022, 0.115, COL_SASH_DARK, "hardware_brass", bevel=0.0025)

    # Outer track insect screen frame (방충망) on right half
    if include_screen:
        sc_w = inner_w * 0.5
        sc_x = inner_w * 0.25 - 0.004
        sc_y = 0.032
        sw = 0.022
        _local_box(group, center, rot_z, sc_x - sc_w * 0.5 + sw * 0.5, sc_y, low_zc, sw, 0.018, low_h - 0.006, COL_SASH_DARK, "sash_metal", bevel=0.0025)
        _local_box(group, center, rot_z, sc_x + sc_w * 0.5 - sw * 0.5, sc_y, low_zc, sw, 0.018, low_h - 0.006, COL_SASH_DARK, "sash_metal", bevel=0.0025)
        _local_box(group, center, rot_z, sc_x, sc_y, z0 + sw * 0.5, sc_w - sw * 1.9, 0.018, sw, COL_SASH_DARK, "sash_metal", bevel=0.0025)
        _local_box(group, center, rot_z, sc_x, sc_y, z0 + low_h - sw * 0.5 - 0.003, sc_w - sw * 1.9, 0.018, sw, COL_SASH_DARK, "sash_metal", bevel=0.0025)
        _local_box(group, center, rot_z, sc_x, sc_y, low_zc, sc_w - sw * 1.95, 0.014, 0.014, COL_SASH_DARK, "sash_metal", bevel=0.0)

    # Exterior safety railing recessed neatly inside exterior window reveal (exact 9.20m footprint!)
    if include_ext_railing:
        rail_y = wall_thickness * 0.5 - 0.016
        rail_w = inner_w + 0.012
        for rz in (0.14, 0.44):
            _local_box(group, center, rot_z, 0.0, rail_y, rz, rail_w, 0.020, 0.020, COL_SASH_ALU, "sash_metal", bevel=0.0025)
        n_pickets = 7
        for i in range(n_pickets):
            px = -inner_w * 0.44 + (inner_w * 0.88) * (i / (n_pickets - 1))
            _local_box(group, center, rot_z, px, rail_y, 0.29, 0.014, 0.014, 0.282, COL_SASH_ALU, "sash_metal", bevel=0.0)


def _add_tilted_transom(
    group: MeshGroup,
    center: Tuple[float, float, float],
    width: float,
    height: float,
    wall_thickness: float,
    *,
    rot_z: float = 0.0,
    tilt_deg: float = 16.0,
    frame_color: str = COL_TRIM_OAK,
    sash_color: str = COL_SASH_ALU,
) -> None:
    """Build a Korean classroom upper transom window (상부 고창) tilted open into the corridor."""
    fw = 0.036
    fd = wall_thickness + 0.024
    _local_box(group, center, rot_z, -width * 0.5 + fw * 0.5, 0.0, height * 0.5, fw, fd, height, frame_color, "trim_paint")
    _local_box(group, center, rot_z, width * 0.5 - fw * 0.5, 0.0, height * 0.5, fw, fd, height, frame_color, "trim_paint")
    _local_box(group, center, rot_z, 0.0, 0.0, fw * 0.5, width - fw * 1.92, fd, fw, frame_color, "trim_paint")
    _local_box(group, center, rot_z, 0.0, 0.0, height - fw * 0.5, width - fw * 1.92, fd, fw, frame_color, "trim_paint")

    in_w = width - fw * 2.0 - 0.010
    in_h = height - fw * 2.0 - 0.010
    sw = 0.026
    sd = 0.024
    ang = math.radians(tilt_deg)
    ca, sa = math.cos(ang), math.sin(ang)

    def _tilted_box(lx: float, ly_s: float, lz_s: float, sx: float, sy: float, sz: float, col: str, tl: str) -> None:
        pts, faces = _make_beveled_box_local((sx, sy, sz), bevel=_safe_bevel((sx, sy, sz), 0.0025))
        rotated = []
        for p in pts:
            py = p[1] + ly_s
            pz = p[2] + lz_s
            ry = py * ca - pz * sa
            rz = py * sa + pz * ca + fw + 0.004
            rotated.append((p[0] + lx, ry, rz))
        group.solid(_transform_points(rotated, center, rot_z=rot_z), faces, color=col, tile=tl)

    _tilted_box(-in_w * 0.5 + sw * 0.5, 0.0, in_h * 0.5, sw, sd, in_h, sash_color, "sash_metal")
    _tilted_box(in_w * 0.5 - sw * 0.5, 0.0, in_h * 0.5, sw, sd, in_h, sash_color, "sash_metal")
    _tilted_box(0.0, 0.0, sw * 0.5, in_w - sw * 1.92, sd, sw, sash_color, "sash_metal")
    _tilted_box(0.0, 0.0, in_h - sw * 0.5, in_w - sw * 1.92, sd, sw, sash_color, "sash_metal")
    if width > 1.4:
        _tilted_box(0.0, 0.0, in_h * 0.5, 0.022, sd * 0.9, in_h - sw * 1.92, sash_color, "sash_metal")
    # Thin sky-tinted glass pane inside upper transom
    _tilted_box(0.0, 0.0, in_h * 0.5, in_w - sw * 2.04, 0.008, in_h - sw * 2.04, COL_GLASS_SKY, "glass_tinted")


def _add_corridor_sliding_door(
    group: MeshGroup,
    center: Tuple[float, float, float],
    width: float,
    height: float,
    wall_thickness: float,
    *,
    slide_offset_x: float = 0.0,
    track_dir: float = -1.0,
) -> None:
    """Build a Korean classroom wooden/glass sliding door (교실 미서기 문) on corridor-side track."""
    jamb_w = 0.044
    casing_w = 0.062
    casing_p = 0.018

    _local_box(group, center, 0.0, -width * 0.5 + jamb_w * 0.5, 0.0, height * 0.5, jamb_w, wall_thickness + 0.008, height, COL_TRIM_OAK, "door_wood")
    _local_box(group, center, 0.0, width * 0.5 - jamb_w * 0.5, 0.0, height * 0.5, jamb_w, wall_thickness + 0.008, height, COL_TRIM_OAK, "door_wood")
    _local_box(group, center, 0.0, 0.0, 0.0, height - jamb_w * 0.5, width - jamb_w * 1.92, wall_thickness + 0.008, jamb_w, COL_TRIM_OAK, "door_wood")

    for side in (-1, 1):
        cy = side * (wall_thickness * 0.5 + casing_p * 0.5)
        _local_box(group, center, 0.0, -width * 0.5 - casing_w * 0.25, cy, height * 0.5, casing_w, casing_p, height + 0.03, COL_TRIM_OAK, "door_wood")
        _local_box(group, center, 0.0, width * 0.5 + casing_w * 0.25, cy, height * 0.5, casing_w, casing_p, height + 0.03, COL_TRIM_OAK, "door_wood")
        _local_box(group, center, 0.0, 0.0, cy, height + casing_w * 0.30, width + casing_w * 1.5, casing_p, casing_w, COL_TRIM_OAK, "door_wood")

    track_len = width + 0.78
    track_cx = track_dir * 0.37
    track_y = -(wall_thickness * 0.5 + 0.044)
    _local_box(group, center, 0.0, 0.0, 0.0, 0.007, width - jamb_w * 1.8, wall_thickness + 0.016, 0.014, COL_SASH_ALU, "sash_metal", bevel=0.0)
    _local_box(group, center, 0.0, track_cx, track_y, 0.007, track_len, 0.028, 0.014, COL_SASH_ALU, "sash_metal", bevel=0.0)
    _local_box(group, center, 0.0, track_cx, track_y, height + 0.035, track_len, 0.062, 0.056, COL_SASH_ALU, "sash_metal", bevel=0.003)

    leaf_w = width + 0.04
    leaf_h = height - 0.016
    leaf_t = 0.044
    lx = slide_offset_x
    ly = track_y
    z0 = 0.014

    stile_w = 0.095
    mid_rail_z = z0 + 0.90
    _local_box(group, center, 0.0, lx - leaf_w * 0.5 + stile_w * 0.5, ly, z0 + leaf_h * 0.5, stile_w, leaf_t, leaf_h, COL_PODIUM_WOOD, "door_wood")
    _local_box(group, center, 0.0, lx + leaf_w * 0.5 - stile_w * 0.5, ly, z0 + leaf_h * 0.5, stile_w, leaf_t, leaf_h, COL_PODIUM_WOOD, "door_wood")
    inner_lw = leaf_w - stile_w * 1.92
    _local_box(group, center, 0.0, lx, ly, z0 + 0.065, inner_lw, leaf_t, 0.130, COL_PODIUM_WOOD, "door_wood")
    _local_box(group, center, 0.0, lx, ly, mid_rail_z, inner_lw, leaf_t, 0.095, COL_PODIUM_WOOD, "door_wood")
    _local_box(group, center, 0.0, lx, ly, z0 + leaf_h - 0.055, inner_lw, leaf_t, 0.110, COL_PODIUM_WOOD, "door_wood")

    low_panel_h = (mid_rail_z - 0.045) - (z0 + 0.125)
    _local_box(group, center, 0.0, lx, ly, z0 + 0.125 + low_panel_h * 0.5, inner_lw + 0.006, leaf_t - 0.018, low_panel_h + 0.006, COL_TRIM_OAK, "wood_panel", bevel=0.0025)

    win_z0 = mid_rail_z + 0.045
    win_z1 = z0 + leaf_h - 0.105
    win_h = win_z1 - win_z0
    _local_box(group, center, 0.0, lx, ly, win_z0 + win_h * 0.5, 0.024, 0.022, win_h + 0.004, COL_TRIM_OAK, "door_wood", bevel=0.0025)

    handle_side_x = lx + (-leaf_w * 0.5 + stile_w * 0.52) * track_dir
    for side in (-1, 1):
        _local_box(group, center, 0.0, handle_side_x, ly + side * (leaf_t * 0.5 + 0.008), z0 + 1.02, 0.028, 0.016, 0.18, COL_SASH_ALU, "hardware_brass", bevel=0.0025)


def _add_pleated_curtain(
    group: MeshGroup,
    center_x: float,
    wall_face_y: float,
    z_bottom: float,
    z_top: float,
    width: float,
    *,
    folds: int = 3,
    depth: float = 0.062,
    color: str = COL_CURTAIN,
    tile: str = "carpet",
) -> None:
    """Build a watertight multi-pleat draped curtain hanging in front of a window pier."""
    samples_x = folds * 4 + 1
    z_steps = (
        (z_bottom, 1.05, 0.006),
        (z_bottom + (z_top - z_bottom) * 0.35, 1.00, 0.002),
        (z_bottom + (z_top - z_bottom) * 0.72, 0.94, 0.000),
        (z_top, 0.88, -0.004),
    )
    thickness = 0.014
    rings: List[List[Tuple[float, float, float]]] = []
    for zv, w_scale, y_sway in z_steps:
        front_pts: List[Tuple[float, float, float]] = []
        back_pts: List[Tuple[float, float, float]] = []
        for i in range(samples_x):
            t = i / float(samples_x - 1)
            px = center_x + (t - 0.5) * width * w_scale
            wave = math.sin(t * folds * math.tau)
            py_mid = wall_face_y - 0.085 + y_sway + wave * (depth * 0.42)
            front_pts.append((px, py_mid - thickness * 0.5, zv))
            back_pts.append((px, py_mid + thickness * 0.5, zv))
        rings.append(front_pts + list(reversed(back_pts)))
    group.rings(rings, color=color, tile=tile)


# ---------------------------------------------------------------------------
# Node Builders (8 Semantic Cutaway Buckets)
# ---------------------------------------------------------------------------


def build_floor_and_partition(floor: MeshGroup) -> None:
    """Build grounded floor slab, classroom wood parquet, corridor terrazzo, and partition wall."""
    # 1. Structural base slab resting strictly on Z = 0.000 (inset 6mm from outer walls)
    _box(floor, (0.0, 0.0, 0.044), (ROOM_LEN_X - 0.012, TOTAL_DEPTH_Y - 0.012, 0.088), "C0BBB0", "concrete", bevel=0.004)

    # 2. Classroom warm oak plank floor bands (Z = 0.086..0.100 -> finished FLOOR_Z = 0.100)
    n_bands = 10
    class_w = CLASS_Y_MAX - CLASS_Y_MIN - 0.004
    band_d = class_w / n_bands
    for i in range(n_bands):
        by = CLASS_Y_MIN + 0.002 + (i + 0.5) * band_d
        col = COL_FLOOR_WOOD_A if i % 2 == 0 else COL_FLOOR_WOOD_B
        _box(floor, (0.0, by, 0.093), (INNER_X_MAX - INNER_X_MIN - 0.004, band_d - 0.004, 0.014), col, "floor_wood", bevel=0.0025)

    # 3. Corridor ceramic/terrazzo floor panels (Z = 0.086..0.100) + perimeter trim strips
    corr_w = CORR_Y_MAX - CORR_Y_MIN - 0.004
    n_corr_x = 6
    tile_seg_x = (INNER_X_MAX - INNER_X_MIN - 0.004) / n_corr_x
    for i in range(n_corr_x):
        cx = INNER_X_MIN + 0.002 + (i + 0.5) * tile_seg_x
        _box(floor, (cx, CORR_CENTER_Y, 0.093), (tile_seg_x - 0.005, corr_w - 0.24, 0.014), COL_FLOOR_CORR if i % 2 == 0 else "D3D0C7", "tile_ceramic", bevel=0.0025)
    for sy in (CORR_Y_MIN + 0.06, CORR_Y_MAX - 0.06):
        _box(floor, (0.0, sy, 0.093), (INNER_X_MAX - INNER_X_MIN - 0.006, 0.112, 0.014), COL_FLOOR_BORDER, "stone_plinth", bevel=0.0025)

    # 4. Classroom-Corridor Partition Wall (at Y = PART_Y = -2.400)
    part_len = INNER_X_MAX - INNER_X_MIN - 0.004
    part_openings = [
        WallOpening(offset_x=-3.65, width=1.05, height=2.02, sill_z=0.0, kind="door"),
        WallOpening(offset_x=-3.65, width=1.05, height=0.46, sill_z=2.12, kind="window"),
        WallOpening(offset_x=-1.25, width=2.15, height=1.12, sill_z=0.90, kind="window"),
        WallOpening(offset_x=-1.25, width=2.15, height=0.46, sill_z=2.12, kind="window"),
        WallOpening(offset_x=1.25, width=2.15, height=1.12, sill_z=0.90, kind="window"),
        WallOpening(offset_x=1.25, width=2.15, height=0.46, sill_z=2.12, kind="window"),
        WallOpening(offset_x=3.65, width=1.05, height=2.02, sill_z=0.0, kind="door"),
        WallOpening(offset_x=3.65, width=1.05, height=0.46, sill_z=2.12, kind="window"),
    ]
    add_wall_with_openings(
        floor,
        center=(0.0, PART_Y, WALL_BASE_Z),
        length=part_len,
        thickness=PART_T,
        height=WALL_H,
        openings=part_openings,
        rot_z=0.0,
        color=COL_WALL_CREAM,
        tile="plaster",
        baseboard_height=0.090,
        baseboard_depth=0.016,
        baseboard_color=COL_TRIM_OAK,
        baseboard_tile="wood_panel",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color=COL_TRIM_WHITE,
        crown_tile="trim_paint",
        trim_both_sides=True,
    )

    # Lower wood wainscot dado panels on both faces of partition wall
    for wx0, wx1 in ((-3.08, -2.35), (-2.30, 2.30), (2.35, 3.08)):
        seg_w = wx1 - wx0
        seg_cx = 0.5 * (wx0 + wx1)
        for side in (-1, 1):
            _box(floor, (seg_cx, PART_Y + side * (PART_T * 0.5 + 0.010), FLOOR_Z + 0.87), (seg_w, 0.022, 0.036), COL_TRIM_OAK, "wood_panel", bevel=0.003)
            _box(floor, (seg_cx, PART_Y + side * (PART_T * 0.5 + 0.005), FLOOR_Z + 0.475), (seg_w - 0.02, 0.010, 0.74), COL_WALL_LOWER, "wood_panel", bevel=0.0)

    # Front & Rear Korean classroom sliding doors (slid partially open)
    _add_corridor_sliding_door(floor, center=(-3.65, PART_Y, FLOOR_Z), width=1.05, height=2.016, wall_thickness=PART_T, slide_offset_x=0.38, track_dir=1.0)
    _add_corridor_sliding_door(floor, center=(3.65, PART_Y, FLOOR_Z), width=1.05, height=2.016, wall_thickness=PART_T, slide_offset_x=-0.52, track_dir=-1.0)

    # 2 wide middle corridor double-sliding windows (open sightlines into classroom!)
    for wx in (-1.25, 1.25):
        _add_double_sliding_window(
            floor,
            center=(wx, PART_Y, WALL_BASE_Z + 0.90),
            width=2.15,
            height=1.12,
            wall_thickness=PART_T,
            rot_z=0.0,
            include_screen=False,
            include_upper_transom_glass=False,
            include_ext_railing=False,
            sill_overhang_in=0.042,
            open_shift=0.22,
            frame_color=COL_SASH_ALU,
            sill_color=COL_TRIM_OAK,
        )

    # 4 tilted upper transom windows (상부 고창)
    for tx, tw in ((-3.65, 1.05), (-1.25, 2.15), (1.25, 2.15), (3.65, 1.05)):
        _add_tilted_transom(floor, center=(tx, PART_Y, WALL_BASE_Z + 2.12), width=tw, height=0.46, wall_thickness=PART_T, rot_z=0.0, tilt_deg=16.0)

    # Protruding corridor class nameplate bracket (반 팻말) beside front door
    _box(floor, (2.96, PART_Y - PART_T * 0.5 - 0.012, FLOOR_Z + 2.18), (0.045, 0.026, 0.14), COL_SASH_DARK, "sash_metal", bevel=0.0025)
    _box(floor, (2.96, PART_Y - PART_T * 0.5 - 0.145, FLOOR_Z + 2.18), (0.022, 0.25, 0.125), "2C4A6E", "trim_paint", bevel=0.003)
    _box(floor, (2.96, PART_Y - PART_T * 0.5 - 0.145, FLOOR_Z + 2.18), (0.028, 0.19, 0.072), "F2EFE6", "trim_paint", bevel=0.0025)


def build_wall_north(wall_n: MeshGroup) -> None:
    """Build North exterior 4-bay window wall (창가 4연창 이중 미서기 샷시·방충망·난간·라디에이터·커튼)."""
    win_openings = [
        WallOpening(offset_x=bx, width=1.90, height=1.62, sill_z=0.88, kind="window")
        for bx in BAY_CENTERS_X
    ]
    add_wall_with_openings(
        wall_n,
        center=(0.0, HALF_Y - WALL_T * 0.5, WALL_BASE_Z),
        length=ROOM_LEN_X,
        thickness=WALL_T,
        height=WALL_H,
        openings=win_openings,
        rot_z=0.0,
        color=COL_WALL_CREAM,
        tile="plaster",
        baseboard_height=0.095,
        baseboard_depth=0.018,
        baseboard_color=COL_TRIM_OAK,
        baseboard_tile="wood_panel",
        crown_height=0.060,
        crown_depth=0.020,
        crown_color=COL_TRIM_WHITE,
        crown_tile="trim_paint",
        interior_side=-1,
    )

    # Interior concrete structural pilasters between bays
    for px in (-2.25, 0.0, 2.25):
        _box(wall_n, (px, CLASS_Y_MAX - 0.032, WALL_BASE_Z + WALL_H * 0.5), (0.28, 0.068, WALL_H - 0.006), COL_WALL_CREAM, "plaster", bevel=0.005)

    # 4-bay double-sliding aluminum windows with insect screens & exterior safety railings
    for idx, bx in enumerate(BAY_CENTERS_X):
        _add_double_sliding_window(
            wall_n,
            center=(bx, HALF_Y - WALL_T * 0.5, WALL_BASE_Z + 0.88),
            width=1.90,
            height=1.62,
            wall_thickness=WALL_T,
            rot_z=0.0,
            include_screen=True,
            include_upper_transom_glass=True,
            include_ext_railing=True,
            sill_overhang_in=0.065,
            open_shift=0.18 if idx in (1, 2) else 0.08,
        )

        # Wall-mounted finned heating radiator / convector box below each window bay
        rad_y = CLASS_Y_MAX - 0.052
        rad_z = FLOOR_Z + 0.44
        _box(wall_n, (bx, rad_y, rad_z), (1.16, 0.088, 0.46), "E2DFD6", "sash_metal", bevel=0.005)
        for k in range(5):
            rz_bar = rad_z - 0.14 + k * 0.07
            _box(wall_n, (bx, rad_y - 0.046, rz_bar), (1.06, 0.012, 0.018), "C5C3BC", "sash_metal", bevel=0.0)
        for sx in (-0.48, 0.48):
            wall_n.rail((bx + sx, rad_y, FLOOR_Z + 0.002), (bx + sx, rad_y, rad_z - 0.22), radius=0.014, color=COL_SASH_DARK, sides=8, tile="sash_metal", bevel_ends=False)

    # Continuous curtain box pelmet & rail along North window wall top
    _box(wall_n, (0.0, CLASS_Y_MAX - 0.085, CEIL_Z - 0.075), (INNER_X_MAX - INNER_X_MIN - 0.02, 0.14, 0.13), COL_TRIM_WHITE, "trim_paint", bevel=0.004)
    wall_n.rail(
        (INNER_X_MIN + 0.08, CLASS_Y_MAX - 0.085, CEIL_Z - 0.148),
        (INNER_X_MAX - 0.08, CLASS_Y_MAX - 0.085, CEIL_Z - 0.148),
        radius=0.011,
        color=COL_SASH_DARK,
        sides=8,
        tile="sash_metal",
        bevel_ends=False,
    )

    # 5 gathered sinusoidal pleated curtain drapes with tiebacks flanking the 4 window bays at the piers
    curt_z0 = FLOOR_Z + 0.78
    curt_h = (CEIL_Z - 0.165) - curt_z0
    for idx, (px, w_curt) in enumerate(((-4.42, 0.38), (-2.25, 0.42), (0.0, 0.42), (2.25, 0.42), (4.42, 0.38))):
        add_pleated_curtain(
            wall_n,
            (px, CLASS_Y_MAX - 0.092, curt_z0),
            width=w_curt,
            height=curt_h,
            depth=0.072,
            pleats=4,
            thickness=0.011,
            tieback_height=0.36,
            tieback_pull=0.14 if idx in (0, 4) else 0.0,
            tieback_side=(-1 if idx == 0 else 1),
            include_rod=False,
            color=COL_CURTAIN,
            tile="carpet",
            tieback_color=COL_TRIM_OAK,
            tieback_tile="wood_panel",
        )


def build_wall_south(wall_s: MeshGroup) -> None:
    """Build South corridor exterior wall (복도 외벽 + 4연 복도창 + 안전난간 + 옥내소화전함)."""
    win_openings = [
        WallOpening(offset_x=-bx, width=1.82, height=1.52, sill_z=0.94, kind="window")
        for bx in BAY_CENTERS_X
    ]
    add_wall_with_openings(
        wall_s,
        center=(0.0, -HALF_Y + WALL_T * 0.5, WALL_BASE_Z),
        length=ROOM_LEN_X,
        thickness=WALL_T,
        height=WALL_H,
        openings=win_openings,
        rot_z=math.pi,
        color=COL_WALL_CORR,
        tile="plaster",
        baseboard_height=0.095,
        baseboard_depth=0.016,
        baseboard_color="B2AEA4",
        baseboard_tile="stone_plinth",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color=COL_TRIM_WHITE,
        crown_tile="trim_paint",
        interior_side=-1,
    )

    for bx in BAY_CENTERS_X:
        _add_double_sliding_window(
            wall_s,
            center=(bx, -HALF_Y + WALL_T * 0.5, WALL_BASE_Z + 0.94),
            width=1.82,
            height=1.52,
            wall_thickness=WALL_T,
            rot_z=math.pi,
            include_screen=False,
            include_upper_transom_glass=True,
            include_ext_railing=False,
            sill_overhang_in=0.045,
            open_shift=0.10,
            sill_color="D2CEC4",
        )
        rail_y = CORR_Y_MIN + 0.055
        wall_s.rail((bx - 0.96, rail_y, FLOOR_Z + 1.18), (bx + 0.96, rail_y, FLOOR_Z + 1.18), radius=0.016, color=COL_SASH_ALU, sides=10, tile="sash_metal", bevel_ends=False)
        for sx in (-0.94, 0.94):
            wall_s.rail((bx + sx, CORR_Y_MIN - 0.002, FLOOR_Z + 1.18), (bx + sx, rail_y, FLOOR_Z + 1.18), radius=0.014, color=COL_SASH_DARK, sides=8, tile="sash_metal", bevel_ends=False)

    _box(wall_s, (0.0, CORR_Y_MIN + 0.012, FLOOR_Z + 0.90), (INNER_X_MAX - INNER_X_MIN - 0.02, 0.024, 0.036), "C8C4B9", "trim_paint", bevel=0.003)

    # Recessed Fire Hydrant Cabinet (옥내소화전함) on center pier (X = 0.0)
    hx = 0.0
    hy = CORR_Y_MIN + 0.022
    _box(wall_s, (hx, hy, FLOOR_Z + 1.18), (0.64, 0.048, 1.06), COL_SASH_ALU, "sash_metal", bevel=0.004)
    _box(wall_s, (hx, hy + 0.026, FLOOR_Z + 1.50), (0.56, 0.014, 0.28), "DCDBD6", "sash_metal", bevel=0.0025)
    _box(wall_s, (hx, hy + 0.026, FLOOR_Z + 1.01), (0.56, 0.014, 0.62), "D2D4D6", "sash_metal", bevel=0.0025)
    _box(wall_s, (hx - 0.14, hy + 0.042, FLOOR_Z + 1.52), (0.072, 0.032, 0.072), COL_RED_FIRE, "trim_paint", bevel=0.005)
    _box(wall_s, (hx + 0.14, hy + 0.040, FLOOR_Z + 1.52), (0.084, 0.026, 0.084), "C94A40", "trim_paint", bevel=0.004)
    _box(wall_s, (hx + 0.22, hy + 0.042, FLOOR_Z + 1.02), (0.024, 0.026, 0.11), COL_SASH_DARK, "hardware_brass", bevel=0.0025)


def build_wall_east(wall_e: MeshGroup) -> None:
    """Build East front teaching wall (곡면 칠판·분필받이·측면 게시판·벽걸이 TV·아날로그 시계·급훈 액자·스피커)."""
    east_len = TOTAL_DEPTH_Y - WALL_T * 2.0 + 0.008  # 8.848 m
    corr_portal = [
        WallOpening(offset_x=CORR_CENTER_Y, width=1.56, height=2.42, sill_z=0.0, kind="door"),
    ]
    add_wall_with_openings(
        wall_e,
        center=(HALF_X - WALL_T * 0.5 - 0.002, 0.0, WALL_BASE_Z),
        length=east_len,
        thickness=WALL_T,
        height=WALL_H,
        openings=corr_portal,
        rot_z=math.pi * 0.5,
        color=COL_WALL_CREAM,
        tile="plaster",
        baseboard_height=0.095,
        baseboard_depth=0.018,
        baseboard_color=COL_TRIM_OAK,
        baseboard_tile="wood_panel",
        crown_height=0.060,
        crown_depth=0.020,
        crown_color=COL_TRIM_WHITE,
        crown_tile="trim_paint",
        interior_side=1,
    )

    # Corridor continuation portal casing trim
    for sy in (CORR_CENTER_Y - 0.78, CORR_CENTER_Y + 0.78):
        _box(wall_e, (INNER_X_MAX - 0.010, sy, FLOOR_Z + 1.21), (0.044, 0.065, 2.42), COL_TRIM_WHITE, "trim_paint", bevel=0.003)
    _box(wall_e, (INNER_X_MAX - 0.010, CORR_CENTER_Y, FLOOR_Z + 2.43), (0.044, 1.69, 0.065), COL_TRIM_WHITE, "trim_paint", bevel=0.003)

    # --- 1. Green Korean Classroom Chalkboard (칠판 + 판서 그래픽) centered at Y = 0.85 ---
    cb_cy = 0.85
    cb_w = 3.84
    cb_h = 1.22
    cb_z0 = FLOOR_Z + 0.96   # 1.060
    cb_z1 = cb_z0 + cb_h     # 2.280
    cb_face_x = INNER_X_MAX - 0.044

    # Single crisp beveled chalkboard slab with full-fit 512x512 Korean math/Korean chalk notes!
    wall_e.box(
        (cb_face_x + 0.012, cb_cy, 0.5 * (cb_z0 + cb_z1)),
        (0.024, cb_w, cb_h),
        "FFFFFF",
        tile="chalkboard",
        bevel=0.003,
        uv_fit=True,
    )

    frame_h = 0.036
    frame_d = 0.042
    _box(wall_e, (cb_face_x + 0.014, cb_cy, cb_z1 + frame_h * 0.5 - 0.002), (frame_d, cb_w + 0.064, frame_h), COL_CHALK_FRAME, "sash_metal", bevel=0.003)
    _box(wall_e, (cb_face_x + 0.014, cb_cy, cb_z0 - frame_h * 0.5 + 0.002), (frame_d, cb_w + 0.064, frame_h), COL_CHALK_FRAME, "sash_metal", bevel=0.003)
    for sy in (-1.0, 1.0):
        ey = cb_cy + sy * (cb_w * 0.5 + 0.016)
        _box(wall_e, (cb_face_x + 0.014, ey, 0.5 * (cb_z0 + cb_z1)), (frame_d, 0.036, cb_h + frame_h * 2.0), COL_CHALK_FRAME, "sash_metal", bevel=0.003)

    # Deep extruded aluminum chalk tray (분필받이) + wooden eraser & colored chalk sticks
    tray_z = cb_z0 - frame_h - 0.006
    _box(wall_e, (cb_face_x - 0.042, cb_cy, tray_z + 0.006), (0.095, cb_w - 0.02, 0.012), COL_CHALK_FRAME, "sash_metal", bevel=0.002)
    _box(wall_e, (cb_face_x - 0.084, cb_cy, tray_z + 0.018), (0.012, cb_w - 0.02, 0.024), COL_CHALK_FRAME, "sash_metal", bevel=0.002)
    # Chalkboard eraser & chalk pieces resting cleanly inside the tray
    _box(wall_e, (cb_face_x - 0.046, cb_cy - 0.55, tray_z + 0.028), (0.046, 0.145, 0.030), "8A5E3B", "door_wood", bevel=0.003)
    for cy_off, c_col in ((0.30, "F6F4EC"), (0.44, "F6D48A"), (0.56, "9FD8F2")):
        wall_e.rail((cb_face_x - 0.044, cb_cy + cy_off, tray_z + 0.018), (cb_face_x - 0.044, cb_cy + cy_off + 0.072, tray_z + 0.018), radius=0.006, color=c_col, sides=6, tile="trim_paint")

    # --- 2. Flanking Side Cork/Timetable Notice Board beside Chalkboard ("2학년 3반 주간 시간표") ---
    for board_y, bw in ((-1.64, 0.90),):
        bz = 0.5 * (cb_z0 + cb_z1)
        bh = 1.08
        _box(wall_e, (INNER_X_MAX - 0.014, board_y, bz), (0.028, bw, bh), COL_TRIM_OAK, "door_wood", bevel=0.003)
        _box(wall_e, (INNER_X_MAX - 0.026, board_y, bz), (0.012, bw - 0.07, bh - 0.07), COL_BULLETIN_BG, "carpet", bevel=0.0)
        # Crisp full-fit weekly Korean timetable + notice sheet
        wall_e.box((INNER_X_MAX - 0.036, board_y, bz + 0.02), (0.008, bw - 0.16, bh - 0.20), "FFFFFF", tile="brick", bevel=0.001, uv_fit=True)

    # --- 3. Class Motto Frame (급훈 액자: "급훈 · 성실 · 창의 · 협동") centered above Chalkboard ---
    motto_z = cb_z1 + 0.26
    _box(wall_e, (INNER_X_MAX - 0.018, cb_cy, motto_z), (0.036, 1.04, 0.36), "6C4B32", "door_wood", bevel=0.004)
    wall_e.box((INNER_X_MAX - 0.038, cb_cy, motto_z), (0.012, 0.94, 0.27), "FFFFFF", tile="marble", bevel=0.0015, uv_fit=True)

    # --- 4. Analog Wall Clock (아날로그 시계) — crisp white dial proud of bezel + 12 ticks + 10:10 hands ---
    clk_y = cb_cy + 1.32
    clk_z = motto_z
    clk_r = 0.175
    clk_sides = 24
    # Outer dark metallic cylinder body (x: 0.0 -> -0.042)
    body_rings = [
        [
            (INNER_X_MAX + x_off, clk_y + rad * math.cos(math.tau * i / clk_sides), clk_z + rad * math.sin(math.tau * i / clk_sides))
            for i in range(clk_sides)
        ]
        for x_off, rad in ((0.0, clk_r), (-0.038, clk_r), (-0.042, clk_r * 0.96))
    ]
    wall_e.rings(body_rings, color="343B42", tile="sash_metal")
    # Crisp white clock face disc strictly IN FRONT OF dark body (-0.040 -> -0.049) so never occluded!
    dial_rings = [
        [
            (INNER_X_MAX + x_off, clk_y + (clk_r * 0.86) * math.cos(math.tau * i / clk_sides), clk_z + (clk_r * 0.86) * math.sin(math.tau * i / clk_sides))
            for i in range(clk_sides)
        ]
        for x_off in (-0.040, -0.049)
    ]
    wall_e.rings(dial_rings, color="FCFAF4", tile="trim_paint")
    # 12 embossed hour tick marks + center hub + 10:10 clock hands strictly proud of white face (-0.053)
    for h_i in range(12):
        ang = math.tau * h_i / 12.0
        tick_h = 0.026 if h_i % 3 == 0 else 0.016
        tick_w = 0.012 if h_i % 3 == 0 else 0.008
        tick_r = clk_r * 0.70
        ty = clk_y + tick_r * math.cos(ang)
        tz = clk_z + tick_r * math.sin(ang)
        _box(wall_e, (INNER_X_MAX - 0.052, ty, tz), (0.008, tick_w, tick_h), "22262B", "sash_metal", bevel=0.0)
    wall_e.rail((INNER_X_MAX - 0.048, clk_y, clk_z), (INNER_X_MAX - 0.060, clk_y, clk_z), radius=0.011, color=COL_RED_FIRE, sides=10, tile="sash_metal", bevel_ends=False)
    wall_e.timber((INNER_X_MAX - 0.054, clk_y, clk_z), (INNER_X_MAX - 0.054, clk_y - 0.072, clk_z + 0.044), 0.012, 0.008, color="1E2126", tile="sash_metal", bevel=0.0)
    wall_e.timber((INNER_X_MAX - 0.057, clk_y, clk_z), (INNER_X_MAX - 0.057, clk_y + 0.095, clk_z + 0.058), 0.009, 0.008, color="1E2126", tile="sash_metal", bevel=0.0)

    # --- 5. Classroom Wall Intercom Speaker (방송 스피커) ---
    spk_y = cb_cy - 1.32
    spk_z = motto_z
    _box(wall_e, (INNER_X_MAX - 0.055, spk_y, spk_z), (0.11, 0.28, 0.22), "DEDBD0", "trim_paint", bevel=0.005)
    for k in range(5):
        _box(wall_e, (INNER_X_MAX - 0.112, spk_y, spk_z - 0.064 + k * 0.032), (0.010, 0.22, 0.014), "7D8084", "sash_metal", bevel=0.0)

    # --- 6. Corner Wall-Mounted Classroom TV (벽걸이 TV) cleanly separated from chalkboard ---
    tv_origin = (INNER_X_MAX - 0.42, 3.68, FLOOR_Z + 1.88)
    tv_yaw = math.radians(-30.0)
    _box(wall_e, (INNER_X_MAX - 0.014, 3.88, tv_origin[2]), (0.028, 0.26, 0.28), COL_SASH_DARK, "sash_metal", bevel=0.003)
    wall_e.timber((INNER_X_MAX - 0.02, 3.88, tv_origin[2] + 0.06), (tv_origin[0] + 0.04, tv_origin[1] + 0.04, tv_origin[2] + 0.06), 0.036, 0.036, color=COL_SASH_DARK, tile="sash_metal", bevel=0.003)
    wall_e.timber((INNER_X_MAX - 0.02, 3.88, tv_origin[2] - 0.06), (tv_origin[0] + 0.04, tv_origin[1] + 0.04, tv_origin[2] - 0.06), 0.036, 0.036, color=COL_SASH_DARK, tile="sash_metal", bevel=0.003)
    _local_box(wall_e, tv_origin, tv_yaw, 0.018, 0.0, 0.0, 0.052, 1.24, 0.74, COL_TV_BEZEL, "sash_metal", bevel=0.005)
    # Classroom TV display showing Korean school schedule graphic ("2학년 3반 학사안내 · 기말고사 D-14")
    pts_tv, faces_tv = _make_beveled_box_local((0.012, 1.17, 0.66), bevel=0.0)
    pts_tv = [(p[0] - 0.012, p[1], p[2] + 0.008) for p in pts_tv]
    wall_e.solid(_transform_points(pts_tv, tv_origin, rot_z=tv_yaw), faces_tv, color="FFFFFF", tile="asphalt", uv_fit=True)
    _local_box(wall_e, tv_origin, tv_yaw, -0.014, 0.0, -0.345, 0.016, 1.18, 0.026, "3D434B", "sash_metal", bevel=0.0025)


def build_wall_west(wall_w: MeshGroup) -> None:
    """Build West rear wall (뒤쪽 대형 게시판·포스터·옷걸이 레일·거울·복도 연결 아치)."""
    west_len = TOTAL_DEPTH_Y - WALL_T * 2.0 + 0.008  # 8.848 m
    corr_portal = [
        WallOpening(offset_x=-CORR_CENTER_Y, width=1.56, height=2.42, sill_z=0.0, kind="door"),
    ]
    add_wall_with_openings(
        wall_w,
        center=(-HALF_X + WALL_T * 0.5 + 0.002, 0.0, WALL_BASE_Z),
        length=west_len,
        thickness=WALL_T,
        height=WALL_H,
        openings=corr_portal,
        rot_z=-math.pi * 0.5,
        color=COL_WALL_CREAM,
        tile="plaster",
        baseboard_height=0.095,
        baseboard_depth=0.018,
        baseboard_color=COL_TRIM_OAK,
        baseboard_tile="wood_panel",
        crown_height=0.060,
        crown_depth=0.020,
        crown_color=COL_TRIM_WHITE,
        crown_tile="trim_paint",
        interior_side=1,
    )

    for sy in (CORR_CENTER_Y - 0.78, CORR_CENTER_Y + 0.78):
        _box(wall_w, (INNER_X_MIN + 0.010, sy, FLOOR_Z + 1.21), (0.044, 0.065, 2.42), COL_TRIM_WHITE, "trim_paint", bevel=0.003)
    _box(wall_w, (INNER_X_MIN + 0.010, CORR_CENTER_Y, FLOOR_Z + 2.43), (0.044, 1.69, 0.065), COL_TRIM_WHITE, "trim_paint", bevel=0.003)

    # Large 3-Section Rear Bulletin Board (뒤쪽 게시판) above 30-cubby lockers
    bb_cy = 1.15
    bb_w = 3.80
    bb_h = 1.06
    bb_z = 2.01
    _box(wall_w, (INNER_X_MIN + 0.016, bb_cy, bb_z), (0.032, bb_w, bb_h), COL_TRIM_OAK, "door_wood", bevel=0.004)
    _box(wall_w, (INNER_X_MIN + 0.028, bb_cy, bb_z), (0.012, bb_w - 0.09, bb_h - 0.09), COL_BULLETIN_BG, "carpet", bevel=0.0)
    for dy in (-bb_w / 6.0, bb_w / 6.0):
        _box(wall_w, (INNER_X_MIN + 0.034, bb_cy + dy, bb_z), (0.014, 0.028, bb_h - 0.08), COL_TRIM_OAK, "door_wood", bevel=0.0025)

    # 11 staggered 3D pinned notices/posters
    notices = [
        (-1.54, 0.16, 0.36, 0.48, "FAF6EC"),
        (-1.12, 0.22, 0.30, 0.36, "F7EBC8"),
        (-1.08, -0.22, 0.34, 0.34, "E5F0F5"),
        (-0.36, 0.14, 0.42, 0.50, "FAF7F0"),
        (0.18, 0.20, 0.36, 0.40, "F6DFD6"),
        (0.16, -0.22, 0.40, 0.32, "EFF4E4"),
        (0.84, 0.18, 0.32, 0.44, "FAF6EC"),
        (1.24, 0.22, 0.34, 0.36, "E6EEF6"),
        (1.60, 0.16, 0.28, 0.42, "F8ECC9"),
        (0.92, -0.24, 0.38, 0.30, "F5F3EC"),
        (1.44, -0.22, 0.44, 0.32, "EBF2E4"),
    ]
    for idx, (dy, dz, nw, nh, col) in enumerate(notices):
        if idx in (0, 3, 6):
            wall_w.box((INNER_X_MIN + 0.038, bb_cy + dy, bb_z + dz), (0.008, nw, nh), "FFFFFF", tile="brick", bevel=0.0, uv_fit=True)
        else:
            _box(wall_w, (INNER_X_MIN + 0.038, bb_cy + dy, bb_z + dz), (0.008, nw, nh), col, "plaster", bevel=0.0)
            _box(wall_w, (INNER_X_MIN + 0.044, bb_cy + dy, bb_z + dz + nh * 0.36), (0.006, nw * 0.72, 0.024), "4F6B88", "trim_paint", bevel=0.0)

    # Rear wall wooden coat hook rail + wall mirror beside rear door
    _box(wall_w, (INNER_X_MIN + 0.014, 3.70, FLOOR_Z + 1.56), (0.026, 0.92, 0.085), COL_TRIM_OAK, "door_wood", bevel=0.003)
    for k in range(5):
        hy = 3.34 + k * 0.18
        wall_w.rail((INNER_X_MIN + 0.025, hy, FLOOR_Z + 1.56), (INNER_X_MIN + 0.068, hy, FLOOR_Z + 1.58), radius=0.008, color=COL_SASH_DARK, sides=8, tile="hardware_brass", bevel_ends=False)

    _box(wall_w, (INNER_X_MIN + 0.016, -2.02, FLOOR_Z + 1.52), (0.026, 0.42, 0.58), COL_TRIM_OAK, "door_wood", bevel=0.003)
    _box(wall_w, (INNER_X_MIN + 0.029, -2.02, FLOOR_Z + 1.52), (0.010, 0.35, 0.51), "D6E4EA", "glass_tinted", bevel=0.0)


def build_ceiling(ceiling: MeshGroup) -> None:
    """Build ceiling slab, concrete beams, acoustic grid, LED panel lights, 4-way system AC, & exit sign."""
    _box(ceiling, (0.0, 0.0, 2.940), (ROOM_LEN_X, TOTAL_DEPTH_Y, 0.120), COL_CEIL_WHITE, "ceiling_plaster", bevel=0.004)

    for bx in (-2.25, 0.0, 2.25):
        _box(ceiling, (bx, 0.0, CEIL_Z - 0.066), (0.24, TOTAL_DEPTH_Y - WALL_T * 2.0 - 0.016, 0.140), COL_CEIL_BEAM, "ceiling_beam", bevel=0.005)
    _box(ceiling, (0.0, PART_Y, CEIL_Z - 0.048), (ROOM_LEN_X - WALL_T * 2.0 - 0.016, 0.24, 0.104), COL_CEIL_BEAM, "ceiling_beam", bevel=0.005)

    for gy in (-1.20, -0.08, 1.05, 2.18, 3.30):
        _box(ceiling, (0.0, gy, CEIL_Z - 0.007), (INNER_X_MAX - INNER_X_MIN - 0.04, 0.032, 0.018), "DDDAD0", "ceiling_metal", bevel=0.0025)

    # 8 Classroom LED Panel Lights (LED 패널등 — emissive_cool!)
    for lx in (-3.375, -1.125, 1.125, 3.375):
        for ly in (-0.45, 2.55):
            _box(ceiling, (lx, ly, CEIL_Z - 0.018), (1.24, 0.34, 0.036), "E2E4E6", "ceiling_metal", bevel=0.003)
            _box(ceiling, (lx, ly, CEIL_Z - 0.038), (1.16, 0.26, 0.014), "FFFFFF", "emissive_cool", bevel=0.0025)

    # 3 Corridor LED Panel Lights
    for lx in (-3.20, 0.0, 3.20):
        _box(ceiling, (lx, CORR_CENTER_Y, CEIL_Z - 0.018), (1.18, 0.26, 0.034), "E2E4E6", "ceiling_metal", bevel=0.003)
        _box(ceiling, (lx, CORR_CENTER_Y, CEIL_Z - 0.036), (1.10, 0.19, 0.014), "FFFFFF", "emissive_cool", bevel=0.0025)

    # 2 Four-Way Ceiling Cassette System Air Conditioners (천장 시스템 에어컨)
    for ac_x in (-1.125, 1.125):
        ac_y = CLASS_CENTER_Y
        _box(ceiling, (ac_x, ac_y, CEIL_Z - 0.026), (0.90, 0.90, 0.056), "F4F3EE", "ceiling_plaster", bevel=0.005)
        for sx in (-1, 1):
            _box(ceiling, (ac_x + sx * 0.34, ac_y, CEIL_Z - 0.056), (0.068, 0.56, 0.014), "C4C7CA", "ceiling_metal", bevel=0.0025)
        for sy in (-1, 1):
            _box(ceiling, (ac_x, ac_y + sy * 0.34, CEIL_Z - 0.056), (0.56, 0.068, 0.014), "C4C7CA", "ceiling_metal", bevel=0.0025)
        _box(ceiling, (ac_x, ac_y, CEIL_Z - 0.055), (0.46, 0.46, 0.010), "E2E4E7", "ceiling_metal", bevel=0.0)
        for k in range(-2, 3):
            _box(ceiling, (ac_x + k * 0.082, ac_y, CEIL_Z - 0.062), (0.018, 0.40, 0.008), "BDC1C6", "ceiling_metal", bevel=0.0)

    # Corridor Hanging Emergency Exit Sign (비상구등 — glowing green emissive faces!)
    ex_x = 3.15
    ex_y = CORR_CENTER_Y
    ex_z = CEIL_Z - 0.32
    _box(ceiling, (ex_x, ex_y, CEIL_Z - 0.014), (0.06, 0.32, 0.024), "D8DADC", "ceiling_metal", bevel=0.0025)
    for dy in (-0.12, 0.12):
        ceiling.rail((ex_x, ex_y + dy, ex_z + 0.10), (ex_x, ex_y + dy, CEIL_Z - 0.016), radius=0.008, color="B8BDC2", sides=8, tile="ceiling_metal", bevel_ends=False)
    _box(ceiling, (ex_x, ex_y, ex_z), (0.062, 0.42, 0.21), "E6E8EA", "ceiling_metal", bevel=0.004)
    for sx in (-1, 1):
        _box(ceiling, (ex_x + sx * 0.033, ex_y, ex_z), (0.010, 0.36, 0.155), "FFFFFF", "emissive_exit_green", bevel=0.0)

    # Ceiling-mounted Classroom Beam Projector aimed at Front Chalkboard
    pj_x = 2.35
    pj_y = CLASS_CENTER_Y
    pj_z = CEIL_Z - 0.30
    _box(ceiling, (pj_x, pj_y, CEIL_Z - 0.014), (0.14, 0.14, 0.024), "D0D3D6", "ceiling_metal", bevel=0.0025)
    ceiling.rail((pj_x, pj_y, pj_z + 0.055), (pj_x, pj_y, CEIL_Z - 0.016), radius=0.018, color="8D949B", sides=10, tile="ceiling_metal", bevel_ends=False)
    _box(ceiling, (pj_x, pj_y, pj_z), (0.30, 0.34, 0.105), "E9E8E4", "ceiling_plaster", bevel=0.005)
    ceiling.rail((pj_x + 0.145, pj_y + 0.06, pj_z), (pj_x + 0.182, pj_y + 0.06, pj_z), radius=0.032, color="343A40", sides=14, tile="ceiling_metal", bevel_ends=False)


def _add_student_desk(
    group: MeshGroup,
    cx: float,
    cy: float,
    z_floor: float,
    *,
    rot_z: float = 0.0,
) -> None:
    """Build 1 Korean high school student desk (강철 파이프 프레임 + 베벨 상판 + 책꽂이 + 가방고리)."""
    w = 0.650
    d = 0.450
    h = 0.730
    top_t = 0.024
    origin = (cx, cy, z_floor)

    _local_box(group, origin, rot_z, 0.0, 0.0, h - top_t * 0.5, d, w, top_t, COL_DESK_TOP, "wood_birch", bevel=0.0045)
    _local_box(group, origin, rot_z, d * 0.5 - 0.028, 0.0, h + 0.004, 0.014, w - 0.08, 0.008, COL_TRIM_OAK, "wood_oak", bevel=0.0)

    bx_w = w - 0.12
    bx_d = d - 0.08
    tray_z = h - top_t - 0.115
    _local_box(group, origin, rot_z, 0.01, 0.0, tray_z, bx_d, bx_w, 0.014, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0025)
    for sy in (-1, 1):
        _local_box(group, origin, rot_z, 0.01, sy * (bx_w * 0.5 - 0.008), tray_z + 0.056, bx_d - 0.006, 0.014, 0.102, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0025)
    _local_box(group, origin, rot_z, 0.01 + bx_d * 0.5 - 0.008, 0.0, tray_z + 0.056, 0.014, bx_w - 0.024, 0.102, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0025)

    leg_y = w * 0.5 - 0.048
    for sy in (-1, 1):
        ly = sy * leg_y
        _local_box(group, origin, rot_z, 0.0, ly, 0.018, d - 0.05, 0.024, 0.024, COL_DESK_FRAME, "metal_leg_steel", bevel=0.003)
        for sx in (-1, 1):
            _local_box(group, origin, rot_z, sx * (d * 0.5 - 0.036), ly, 0.007, 0.042, 0.028, 0.014, "3A3D42", "metal_leg_dark", bevel=0.0025)
        _local_box(group, origin, rot_z, 0.02, ly, (h - top_t) * 0.5, 0.032, 0.026, h - top_t - 0.028, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0035)
        _local_box(group, origin, rot_z, 0.0, ly, h - top_t - 0.012, d - 0.07, 0.024, 0.022, COL_DESK_FRAME, "metal_leg_steel", bevel=0.003)

    _local_box(group, origin, rot_z, 0.02, 0.0, 0.24, 0.022, leg_y * 2.0 - 0.032, 0.022, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0025)

    hook_y = -w * 0.5 + 0.018
    _local_box(group, origin, rot_z, 0.02, hook_y - 0.016, h - 0.085, 0.020, 0.032, 0.014, COL_IRON, "metal_leg_dark", bevel=0.0025)
    _local_box(group, origin, rot_z, 0.02, hook_y - 0.030, h - 0.066, 0.016, 0.014, 0.042, COL_IRON, "metal_leg_dark", bevel=0.0025)


def _add_student_chair(
    group: MeshGroup,
    cx: float,
    cy: float,
    z_floor: float,
    *,
    rot_z: float = 0.0,
) -> None:
    """Build 1 Korean high school molded-plywood & tubular-steel student chair facing ``+X``."""
    sw = 0.390
    sd = 0.380
    sh = 0.440
    bh = 0.800
    origin = (cx, cy, z_floor)

    leg_y = sw * 0.5 - 0.024
    leg_xf = sd * 0.5 - 0.032
    leg_xb = -sd * 0.5 + 0.028

    for sy in (-1, 1):
        ly = sy * leg_y
        _local_box(group, origin, rot_z, leg_xf, ly, 0.007, 0.024, 0.024, 0.014, "3A3D42", "metal_leg_dark", bevel=0.0025)
        _local_box(group, origin, rot_z, leg_xf, ly, (sh - 0.018) * 0.5 + 0.008, 0.020, 0.020, sh - 0.028, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0025)
        _local_box(group, origin, rot_z, leg_xb, ly, 0.007, 0.024, 0.024, 0.014, "3A3D42", "metal_leg_dark", bevel=0.0025)
        _local_box(group, origin, rot_z, leg_xb, ly, (bh - 0.05) * 0.5 + 0.008, 0.020, 0.020, bh - 0.060, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0025)
        _local_box(group, origin, rot_z, 0.0, ly, sh - 0.022, sd - 0.072, 0.018, 0.018, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0025)
        _local_box(group, origin, rot_z, 0.0, ly, 0.165, sd - 0.072, 0.016, 0.016, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0025)

    _local_box(group, origin, rot_z, 0.0, 0.0, sh - 0.024, 0.018, leg_y * 2.0 - 0.024, 0.018, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0025)
    _local_box(group, origin, rot_z, 0.012, 0.0, sh - 0.009, sd, sw, 0.018, COL_CHAIR_WOOD, "wood_birch", bevel=0.004)

    bz0 = bh - 0.185
    bz1 = bh
    segs = 4
    back_rings: List[List[Tuple[float, float, float]]] = []
    for i in range(segs + 1):
        t = -1.0 + 2.0 * (i / segs)
        ly = t * (sw * 0.5)
        lx_back = leg_xb - 0.014 + 0.022 * (t * t)
        lx_front = lx_back + 0.016
        back_rings.append([(lx_back, ly, bz0), (lx_front, ly, bz0), (lx_front, ly, bz1), (lx_back, ly, bz1)])
    world_rings = [_transform_points(r, origin, rot_z=rot_z) for r in back_rings]
    group.rings(world_rings, color=COL_CHAIR_WOOD, tile="wood_birch")


def build_furniture_hero(furn: MeshGroup) -> None:
    """Build 25 student desk+chair sets, podium/lectern, 30-cubby lockers, cleaning cabinet, & corridor-facing shoe racks."""
    # --- 1. 25 Sets (5×5) Student Desks & Chairs ---
    for r_idx, rx in enumerate(DESK_ROWS_X):
        for c_idx, cy in enumerate(DESK_COLS_Y):
            _add_student_desk(furn, rx, cy, FLOOR_Z, rot_z=0.0)
            seed = r_idx * 7 + c_idx * 13
            pull = 0.345 + ((seed % 5) - 2) * 0.012
            yaw = math.radians(((seed % 7) - 3) * 1.4)
            shift_y = (((seed * 3) % 5) - 2) * 0.008
            _add_student_chair(furn, rx - pull, cy + shift_y, FLOOR_Z, rot_z=yaw)

    # --- 2. Teacher's Raised Podium Platform (단상) & Lectern (교탁) ---
    plat_h = 0.140
    plat_x0 = 3.36
    plat_x1 = INNER_X_MAX - 0.025
    plat_d = plat_x1 - plat_x0
    plat_cx = 0.5 * (plat_x0 + plat_x1)
    plat_w = 3.74
    plat_cy = 0.85
    _box(furn, (plat_cx + 0.015, plat_cy, FLOOR_Z + 0.020), (plat_d - 0.03, plat_w - 0.04, 0.040), "6E5840", "wood_walnut", bevel=0.003)
    _box(furn, (plat_cx, plat_cy, FLOOR_Z + 0.040 + (plat_h - 0.040) * 0.5), (plat_d, plat_w, plat_h - 0.040), COL_PODIUM_WOOD, "wood_oak", bevel=0.005)
    _box(furn, (plat_x0 + 0.012, plat_cy, FLOOR_Z + plat_h + 0.004), (0.032, plat_w - 0.02, 0.008), COL_BRASS, "metal_brass_trim", bevel=0.0)

    lec_z = FLOOR_Z + plat_h
    lec_x = 3.74
    lec_y = 0.85
    lec_d = 0.54
    lec_w = 0.72
    lec_h = 1.02
    _box(furn, (lec_x, lec_y, lec_z + 0.032), (lec_d - 0.04, lec_w - 0.04, 0.064), "5D4532", "wood_walnut", bevel=0.003)
    for sy in (-1, 1):
        _box(furn, (lec_x, lec_y + sy * (lec_w * 0.5 - 0.018), lec_z + 0.064 + (lec_h - 0.11) * 0.5), (lec_d - 0.02, 0.032, lec_h - 0.11), COL_PODIUM_WOOD, "wood_oak", bevel=0.004)
    _box(furn, (lec_x - lec_d * 0.5 + 0.024, lec_y, lec_z + 0.064 + (lec_h - 0.11) * 0.5), (0.028, lec_w - 0.068, lec_h - 0.11), "A67647", "wood_oak", bevel=0.003)
    for k in range(-2, 3):
        _box(furn, (lec_x - lec_d * 0.5 + 0.006, lec_y + k * 0.11, lec_z + 0.54), (0.012, 0.026, 0.76), "8B6039", "wood_walnut", bevel=0.0)
    _box(furn, (lec_x + 0.015, lec_y, lec_z + 0.52), (lec_d - 0.08, lec_w - 0.072, 0.024), COL_DESK_TOP, "wood_birch", bevel=0.0025)
    _box(furn, (lec_x, lec_y, lec_z + lec_h - 0.020), (lec_d + 0.05, lec_w + 0.05, 0.036), COL_DESK_TOP, "wood_oak", bevel=0.005)
    _box(furn, (lec_x - lec_d * 0.5 - 0.012, lec_y, lec_z + lec_h + 0.024), (0.022, lec_w + 0.04, 0.052), COL_PODIUM_WOOD, "wood_oak", bevel=0.003)

    # --- 3. 30-Cubby Student Lockers (30칸 사물함: 10 cols × 3 rows) against West Wall ---
    cols, rows = 10, 3
    cell_w = 0.376
    cell_h = 0.376
    lk_d = 0.380
    lk_w = cols * cell_w + 0.040
    lk_plinth_h = 0.088
    lk_body_h = rows * cell_h + 0.036
    lk_cy = 1.150
    lk_x0 = INNER_X_MIN + 0.010
    lk_cx = lk_x0 + lk_d * 0.5

    _box(furn, (lk_cx - 0.012, lk_cy, FLOOR_Z + lk_plinth_h * 0.5), (lk_d - 0.03, lk_w - 0.02, lk_plinth_h), "5D5A54", "metal_leg_dark", bevel=0.003)
    _box(furn, (lk_x0 + 0.010, lk_cy, FLOOR_Z + lk_plinth_h + lk_body_h * 0.5), (0.020, lk_w - 0.008, lk_body_h - 0.008), COL_LOCKER_BODY, "wood_painted", bevel=0.0025)
    _box(furn, (lk_cx + 0.006, lk_cy, FLOOR_Z + lk_plinth_h + lk_body_h + 0.014), (lk_d + 0.024, lk_w + 0.020, 0.028), COL_DESK_TOP, "wood_oak", bevel=0.004)

    for ci in range(cols + 1):
        dy = -lk_w * 0.5 + 0.020 + ci * cell_w
        _box(furn, (lk_cx + 0.004, lk_cy + dy, FLOOR_Z + lk_plinth_h + lk_body_h * 0.5), (lk_d - 0.030, 0.018, lk_body_h - 0.006), COL_LOCKER_BODY, "wood_painted", bevel=0.0025)
    for ri in range(rows + 1):
        dz = FLOOR_Z + lk_plinth_h + 0.018 + ri * cell_h
        _box(furn, (lk_cx + 0.004, lk_cy, dz), (lk_d - 0.034, lk_w - 0.026, 0.016), COL_LOCKER_BODY, "wood_painted", bevel=0.0025)

    ajar_map = {(2, 1): 14.0, (6, 2): 18.0, (8, 0): 11.0}
    door_x_face = lk_x0 + lk_d - 0.010
    for ci in range(cols):
        for ri in range(rows):
            cy_cell = lk_cy - lk_w * 0.5 + 0.020 + (ci + 0.5) * cell_w
            cz_cell = FLOOR_Z + lk_plinth_h + 0.018 + (ri + 0.5) * cell_h
            dw = cell_w - 0.026
            dh = cell_h - 0.024
            dt = 0.018
            open_deg = ajar_map.get((ci, ri), 0.0)
            door_col = COL_LOCKER_DOOR_A if (ci + ri) % 2 == 0 else COL_LOCKER_DOOR_B
            hinge_origin = (door_x_face, cy_cell - dw * 0.5, cz_cell)
            yaw = math.radians(-open_deg)
            _local_box(furn, hinge_origin, yaw, 0.0, dw * 0.5, 0.0, dt, dw, dh, door_col, "laminate_matte", bevel=0.003)
            _local_box(furn, hinge_origin, yaw, dt * 0.5 + 0.007, dw - 0.044, -0.02, 0.014, 0.020, 0.072, COL_DESK_FRAME, "metal_leg_steel", bevel=0.0025)
            _local_box(furn, hinge_origin, yaw, dt * 0.5 + 0.005, dw * 0.5, dh * 0.30, 0.008, 0.064, 0.028, "4A5B6B", "laminate_matte", bevel=0.0)

    # --- 4. Tall Cleaning Supply Cabinet (청소도구함) next to Lockers on West Wall ---
    cc_cy = -1.28
    cc_w = 0.88
    cc_d = 0.44
    cc_h = 1.88
    cc_x0 = INNER_X_MIN + 0.010
    cc_cx = cc_x0 + cc_d * 0.5

    _box(furn, (cc_cx - 0.01, cc_cy, FLOOR_Z + 0.042), (cc_d - 0.03, cc_w - 0.02, 0.084), "5D5A54", "metal_leg_dark", bevel=0.003)
    _box(furn, (cc_x0 + 0.012, cc_cy, FLOOR_Z + 0.084 + (cc_h - 0.11) * 0.5), (0.022, cc_w - 0.01, cc_h - 0.11), COL_CLEAN_CAB, "wood_painted", bevel=0.0025)
    for sy in (-1, 1):
        _box(furn, (cc_cx + 0.004, cc_cy + sy * (cc_w * 0.5 - 0.016), FLOOR_Z + 0.084 + (cc_h - 0.11) * 0.5), (cc_d - 0.024, 0.028, cc_h - 0.11), COL_CLEAN_CAB, "wood_painted", bevel=0.003)
    _box(furn, (cc_cx + 0.004, cc_cy, FLOOR_Z + cc_h - 0.014), (cc_d + 0.016, cc_w + 0.016, 0.028), COL_DESK_TOP, "wood_oak", bevel=0.004)
    _box(furn, (cc_cx + 0.004, cc_cy, FLOOR_Z + 1.48), (cc_d - 0.06, cc_w - 0.064, 0.020), COL_CLEAN_CAB, "wood_painted", bevel=0.0025)

    cd_w = (cc_w - 0.068) * 0.5
    cd_h = cc_h - 0.125
    cd_z = FLOOR_Z + 0.088 + cd_h * 0.5
    cd_x = cc_x0 + cc_d - 0.010
    for side, ajar_deg in ((-1, 0.0), (1, 12.0)):
        hinge_y = cc_cy + side * (cc_w * 0.5 - 0.032)
        hinge = (cd_x, hinge_y, cd_z)
        yaw = math.radians(side * ajar_deg)
        dir_y = -side
        _local_box(furn, hinge, yaw, 0.0, dir_y * (cd_w * 0.5), 0.0, 0.020, cd_w - 0.006, cd_h, "D8D3C5", "wood_painted", bevel=0.003)
        _local_box(furn, hinge, yaw, 0.020, dir_y * (cd_w - 0.048), -0.02, 0.020, 0.018, 0.14, COL_IRON, "metal_leg_dark", bevel=0.0025)
        for v_base in (-cd_h * 0.38, cd_h * 0.34):
            for k in range(3):
                _local_box(furn, hinge, yaw, 0.014, dir_y * (cd_w * 0.5), v_base + k * 0.030, 0.008, cd_w * 0.68, 0.014, "B2ADA0", "metal_leg_steel", bevel=0.0)

    # --- 5. Corridor Shoe Racks (복도 신발장 × 2, 30 cubbies total) facing -Y toward Corridor & Cutaway Camera ---
    # Tucked cleanly below middle corridor windows on Partition Wall (X in [-2.28, -0.60] & [+0.60, +2.28])
    # Leaves clear sliding door pocket on [-3.12, -2.32] & [+2.32, +3.12], and center drinking fountain bay [-0.52, +0.52]!
    sr_w = 1.68
    sr_d = 0.32
    sr_h = 0.82
    sr_y_back = CORR_Y_MAX - 0.010   # -2.490 (10mm clear of corridor partition dado)
    sr_cy = sr_y_back - sr_d * 0.5   # -2.650 (open cubbies face -Y toward corridor walkway!)
    sr_cols = 5
    sr_rows = 3
    for sr_cx in (-1.44, 1.44):
        _box(furn, (sr_cx, sr_cy + 0.010, FLOOR_Z + 0.034), (sr_w - 0.02, sr_d - 0.024, 0.068), "5D5A54", "metal_leg_dark", bevel=0.003)
        _box(furn, (sr_cx, sr_y_back - 0.010, FLOOR_Z + 0.068 + (sr_h - 0.094) * 0.5), (sr_w - 0.008, 0.018, sr_h - 0.094), COL_DESK_TOP, "wood_birch", bevel=0.0025)
        _box(furn, (sr_cx, sr_cy - 0.006, FLOOR_Z + sr_h - 0.014), (sr_w + 0.024, sr_d + 0.022, 0.028), COL_PODIUM_WOOD, "wood_oak", bevel=0.004)
        col_step = (sr_w - 0.036) / sr_cols
        for ci in range(sr_cols + 1):
            dx = -sr_w * 0.5 + 0.018 + ci * col_step
            _box(furn, (sr_cx + dx, sr_cy - 0.004, FLOOR_Z + 0.068 + (sr_h - 0.096) * 0.5), (0.018, sr_d - 0.026, sr_h - 0.096), COL_DESK_TOP, "wood_birch", bevel=0.0025)
        row_step = (sr_h - 0.098) / sr_rows
        for ri in range(sr_rows):
            rz = FLOOR_Z + 0.075 + ri * row_step
            _box(furn, (sr_cx, sr_cy - 0.004, rz), (sr_w - 0.030, sr_d - 0.030, 0.016), COL_DESK_TOP, "wood_birch", bevel=0.0025)


def _add_drinking_fountain_facing_south(props: MeshGroup, cx: float, wall_y: float, z_floor: float) -> None:
    """Build a stainless-steel corridor drinking fountain (음수대) mounted on Partition Wall facing -Y (corridor)."""
    w = 0.96
    d = 0.40
    trough_z = z_floor + 0.70
    trough_h = 0.14
    cy = wall_y - d * 0.5 - 0.008

    # 1. Grounded stainless pedestal cabinet legs & recessed service panel
    for sx in (-1, 1):
        _box(props, (cx + sx * (w * 0.41), cy + 0.02, z_floor + 0.35), (0.062, d - 0.08, 0.70), COL_STEEL, "steel_brushed", bevel=0.004)
    _box(props, (cx, wall_y - 0.10, z_floor + 0.37), (w - 0.20, 0.14, 0.60), "B8BFC4", "aluminum_satin", bevel=0.004)

    # 2. Hollow sloped stainless-steel drinking trough basin (real open bowl facing corridor!)
    _box(props, (cx, cy, trough_z + 0.012), (w, d, 0.024), COL_STEEL, "steel_brushed", bevel=0.003)
    _box(props, (cx, cy - d * 0.5 + 0.016, trough_z + trough_h * 0.5), (w, 0.032, trough_h), COL_STEEL, "steel_brushed", bevel=0.004)
    _box(props, (cx, cy + d * 0.5 - 0.018, trough_z + trough_h * 0.5), (w, 0.036, trough_h), COL_STEEL, "steel_brushed", bevel=0.004)
    for sx in (-1, 1):
        _box(props, (cx + sx * (w * 0.5 - 0.016), cy, trough_z + trough_h * 0.5), (0.032, d - 0.066, trough_h), COL_STEEL, "steel_brushed", bevel=0.004)

    # 3. Stainless backsplash panel rising cleanly below corridor window sill
    _box(props, (cx, wall_y - 0.020, trough_z + trough_h + 0.065), (w + 0.02, 0.024, 0.14), "CFD5D9", "steel_brushed", bevel=0.003)

    # 4. Two curved chrome bubbler/drinking spouts + brass push levers + basin drain grates
    for sx in (-0.25, 0.25):
        fx = cx + sx
        fy = wall_y - 0.048
        add_pipe_frame(
            props,
            [
                (fx, fy, trough_z + trough_h + 0.05),
                (fx, fy - 0.10, trough_z + trough_h + 0.08),
                (fx, fy - 0.14, trough_z + trough_h + 0.02),
            ],
            radius=0.012,
            sides=10,
            bend_subdiv=3,
            bend_radius=0.032,
            flange_ends=True,
            color="DDE2E6",
            tile="steel_brushed",
        )
        _box(props, (fx + 0.052, fy - 0.022, trough_z + trough_h + 0.05), (0.052, 0.022, 0.018), COL_BRASS, "brass_polished", bevel=0.0025)
        _add_cylinder_z(props, (fx, cy - 0.02), trough_z + 0.022, trough_z + 0.030, 0.032, COL_IRON, "iron_dark", sides=14, bevel=0.0)

    # 5. Exposed stainless drain pipe & trap under basin
    add_pipe_frame(
        props,
        [
            (cx, cy, trough_z + 0.004),
            (cx, cy, z_floor + 0.22),
            (cx, wall_y - 0.16, z_floor + 0.22),
        ],
        radius=0.020,
        sides=10,
        bend_subdiv=3,
        bend_radius=0.04,
        flange_ends=True,
        color="9BA3AA",
        tile="galvanized_zinc",
    )


def _add_school_backpack(props: MeshGroup, hook_x: float, hook_y: float, top_z: float) -> None:
    """Build a structured Korean high school backpack hanging neatly off a desk side bag hook."""
    by = hook_y - 0.076
    bh = 0.36
    bw = 0.27
    bd = 0.12
    zc = top_z - bh * 0.5 - 0.035
    _box(props, (hook_x, hook_y - 0.018, top_z - 0.022), (0.042, 0.024, 0.055), "2D323A", "fabric_prop", bevel=0.003)
    _box(props, (hook_x, by, zc), (bw, bd, bh), "2F3B4C", "fabric_prop", bevel=0.016)
    _box(props, (hook_x, by - bd * 0.5 - 0.018, zc - 0.055), (bw - 0.04, 0.042, 0.18), "3C4B60", "fabric_prop", bevel=0.010)
    _box(props, (hook_x, by - bd * 0.5 - 0.041, zc + 0.015), (bw - 0.07, 0.008, 0.012), COL_STEEL, "steel_brushed", bevel=0.0)


def build_props_clutter(props: MeshGroup) -> None:
    """Build drinking fountain, desk props, backpacks, podium props, recycling bins, slippers, & fire extinguisher."""
    # --- 1. Corridor Stainless-Steel Drinking Fountain (음수대) centered on Partition Wall facing Corridor ---
    _add_drinking_fountain_facing_south(props, cx=0.0, wall_y=CORR_Y_MAX, z_floor=FLOOR_Z)

    # --- 2. Curated Student Desk Clutter (12 desks including protagonist window-side seat) ---
    book_colors = ("3D5A80", "C86D51", "5A7D5E", "D4A44C", "7C5B7A", "EAE4D6")
    desk_props_layout = [
        (0, 1, True, False, True),
        (0, 3, True, True, False),
        (1, 0, False, True, True),
        (1, 2, True, False, True),
        (1, 4, True, True, True),
        (2, 1, True, True, False),
        (2, 3, False, True, True),
        (2, 4, True, False, True),
        (3, 0, True, False, False),
        (3, 2, True, True, True),
        (3, 4, True, True, True),   # Protagonist window-side 2nd-from-back seat!
        (4, 3, True, False, True),
    ]
    for idx, (ri, ci, has_books, has_notebook, has_case) in enumerate(desk_props_layout):
        dx = DESK_ROWS_X[ri]
        dy = DESK_COLS_Y[ci]
        if has_books:
            n_books = 2 + (idx % 2)
            bz = DESK_TOP_Z
            for bi in range(n_books):
                bt = 0.022
                yaw = math.radians(((idx + bi) % 3 - 1) * 5.0)
                _box(props, (dx + 0.095, dy + 0.165, bz + bt * 0.5), (0.185, 0.245, bt), book_colors[(idx + bi) % len(book_colors)], "paper_label", bevel=0.0025, rot_z=yaw)
                bz += bt + 0.001
        if has_notebook:
            _box(props, (dx - 0.035, dy - 0.035, DESK_TOP_Z + 0.006), (0.21, 0.145, 0.012), "F6F3EA", "paper_label", bevel=0.0)
            _box(props, (dx - 0.035, dy + 0.115, DESK_TOP_Z + 0.006), (0.21, 0.145, 0.012), "F2EFE5", "paper_label", bevel=0.0)
            _box(props, (dx - 0.035, dy + 0.040, DESK_TOP_Z + 0.005), (0.21, 0.010, 0.010), "3F4854", "plastic_matte", bevel=0.0)
        if has_case:
            _box(props, (dx + 0.115, dy - 0.165, DESK_TOP_Z + 0.018), (0.068, 0.185, 0.036), "4E6E8E" if idx % 2 == 0 else "C87E62", "plastic_matte", bevel=0.005, rot_z=math.radians(8.0 if idx % 2 == 0 else -6.0))
            if idx % 3 == 0:
                _add_cylinder_z(props, (dx + 0.14, dy - 0.255), DESK_TOP_Z, DESK_TOP_Z + 0.185, 0.033, "D4DCE2" if idx % 2 == 0 else "5B8A72", "enamel_gloss", sides=14, bevel=0.003)

    # 6 hanging school backpacks on select desks' right-side bag hooks
    for ri, ci in ((0, 4), (1, 1), (2, 4), (3, 2), (3, 4), (4, 1)):
        _add_school_backpack(props, hook_x=DESK_ROWS_X[ri] + 0.02, hook_y=DESK_COLS_Y[ci] - 0.340, top_z=DESK_TOP_Z - 0.085)

    # --- 3. Teacher's Lectern & Chalkboard Tray Props ---
    lec_top_z = FLOOR_Z + 0.140 + 1.020
    lec_x = 3.74
    lec_y = 0.85
    _box(props, (lec_x + 0.02, lec_y - 0.10, lec_top_z + 0.014), (0.24, 0.32, 0.026), "2C4259", "paper_label", bevel=0.003)
    _box(props, (lec_x - 0.04, lec_y + 0.18, lec_top_z + 0.012), (0.20, 0.26, 0.022), "9C4A3C", "paper_label", bevel=0.003, rot_z=0.08)
    _add_cylinder_z(props, (lec_x + 0.14, lec_y + 0.22), lec_top_z, lec_top_z + 0.095, 0.038, "EAE6DA", "ceramic_gloss", sides=14, bevel=0.003)
    props.rail((lec_x - 0.14, lec_y - 0.26, lec_top_z + 0.009), (lec_x - 0.14, lec_y + 0.26, lec_top_z + 0.009), radius=0.008, color=COL_TRIM_OAK, sides=8, tile="wood_prop", bevel_ends=False)

    tray_z = FLOOR_Z + 0.96 - 0.036 - 0.006 + 0.014
    tray_x = INNER_X_MAX - 0.072
    _box(props, (tray_x, 0.85 - 0.28, tray_z + 0.022), (0.056, 0.155, 0.044), "465260", "plastic_matte", bevel=0.004)
    _box(props, (tray_x, 0.85 + 0.34, tray_z + 0.036), (0.056, 0.095, 0.072), "DFD8C4", "paper_label", bevel=0.003)
    for k, c_col in enumerate(("F7F5F0", "F2D272", "7EB4D8")):
        props.rail((tray_x - 0.008, 0.85 + 0.02 + k * 0.06, tray_z + 0.008), (tray_x - 0.008, 0.85 + 0.065 + k * 0.06, tray_z + 0.008), radius=0.007, color=c_col, sides=8, tile="stone_prop", bevel_ends=False)

    # --- 4. Classroom Rear Recycling Bins (분리수거함 × 2) & Cleaning Tools ---
    for by, bcol in ((3.48, "4C7294"), (3.96, "5E856A")):
        bx = INNER_X_MIN + 0.26
        _box(props, (bx, by, FLOOR_Z + 0.016), (0.34, 0.38, 0.032), "687078", "plastic_matte", bevel=0.003)
        for sx in (-1, 1):
            _box(props, (bx + sx * 0.158, by, FLOOR_Z + 0.28), (0.022, 0.38, 0.50), "D8D9D6", "plastic_matte", bevel=0.003)
        for sy in (-1, 1):
            _box(props, (bx, by + sy * 0.178, FLOOR_Z + 0.28), (0.296, 0.022, 0.50), "D8D9D6", "plastic_matte", bevel=0.003)
        _box(props, (bx, by, FLOOR_Z + 0.545), (0.36, 0.40, 0.036), bcol, "plastic_matte", bevel=0.004)

    tool_x = INNER_X_MIN + 0.22
    props.rail((tool_x, -1.84, FLOOR_Z + 0.09), (tool_x - 0.09, -1.84, FLOOR_Z + 1.38), radius=0.012, color=COL_TRIM_OAK, sides=8, tile="wood_prop", bevel_ends=False)
    _box(props, (tool_x + 0.01, -1.84, FLOOR_Z + 0.055), (0.055, 0.24, 0.11), "6C5846", "fabric_prop", bevel=0.004)
    props.rail((tool_x + 0.04, -2.02, FLOOR_Z + 0.08), (tool_x - 0.08, -2.02, FLOOR_Z + 1.42), radius=0.012, color=COL_STEEL, sides=8, tile="steel_brushed", bevel_ends=False)
    _box(props, (tool_x + 0.04, -2.02, FLOOR_Z + 0.045), (0.075, 0.26, 0.085), "E2DED2", "fabric_prop", bevel=0.005)
    _add_cylinder_z(props, (tool_x + 0.16, -2.00), FLOOR_Z, FLOOR_Z + 0.24, 0.125, "5B82A4", "plastic_matte", sides=16, bevel=0.004)

    # --- 5. Corridor Indoor Slippers (실내화) tucked visibly inside Corridor-Facing Shoe Rack Cubbies ---
    sr_w = 1.68
    sr_h = 0.82
    sr_y_mid = CORR_Y_MAX - 0.010 - 0.175
    slipper_slots = [
        (-1.44, 0, 0, "F2F0EA"),
        (-1.44, 1, 1, "E6EBF0"),
        (-1.44, 2, 0, "F2F0EA"),
        (-1.44, 3, 2, "EDE8DF"),
        (-1.44, 4, 1, "F2F0EA"),
        (1.44, 0, 1, "F2F0EA"),
        (1.44, 1, 0, "EDE8DF"),
        (1.44, 2, 2, "F2F0EA"),
        (1.44, 3, 1, "E6EBF0"),
        (1.44, 4, 0, "F2F0EA"),
    ]
    col_step = (sr_w - 0.036) / 5.0
    row_step = (sr_h - 0.098) / 3.0
    for sr_cx, ci, ri, scol in slipper_slots:
        sx = sr_cx - sr_w * 0.5 + 0.018 + (ci + 0.5) * col_step
        sz = FLOOR_Z + 0.083 + ri * row_step
        for dx_pair in (-0.056, 0.056):
            _box(props, (sx + dx_pair, sr_y_mid, sz + 0.014), (0.078, 0.21, 0.026), scol, "rubber_dark", bevel=0.005)
            _box(props, (sx + dx_pair, sr_y_mid + 0.025, sz + 0.036), (0.070, 0.105, 0.030), scol, "fabric_prop", bevel=0.005)

    # --- 6. Corridor Fire Extinguisher (소화기) beside Partition/Corridor Pier ---
    fx, fy = -2.62, CORR_Y_MAX - 0.16
    _box(props, (fx, fy, FLOOR_Z + 0.016), (0.22, 0.22, 0.032), COL_RED_FIRE, "plastic_matte", bevel=0.004)
    _add_cylinder_z(props, (fx, fy), FLOOR_Z + 0.032, FLOOR_Z + 0.44, 0.072, COL_RED_FIRE, "enamel_gloss", sides=16, bevel=0.012)
    _add_cylinder_z(props, (fx, fy), FLOOR_Z + 0.44, FLOOR_Z + 0.50, 0.022, COL_IRON, "iron_dark", sides=10, bevel=0.0025)
    _box(props, (fx + 0.045, fy, FLOOR_Z + 0.51), (0.11, 0.020, 0.024), COL_IRON, "iron_dark", bevel=0.003)
    add_pipe_frame(
        props,
        [(fx - 0.022, fy, FLOOR_Z + 0.47), (fx - 0.095, fy, FLOOR_Z + 0.44), (fx - 0.095, fy, FLOOR_Z + 0.14)],
        radius=0.010,
        sides=8,
        bend_subdiv=2,
        bend_radius=0.03,
        flange_ends=False,
        color="2A2D32",
        tile="rubber_dark",
    )

    # --- 7. Wall Light Switch Plates on Classroom Partition Doorway Piers ---
    for sx in (-2.88, 2.88):
        _box(props, (sx, CLASS_Y_MIN + 0.010, FLOOR_Z + 1.24), (0.085, 0.016, 0.13), "F2EFE8", "plastic_matte", bevel=0.0025)
        _box(props, (sx, CLASS_Y_MIN + 0.021, FLOOR_Z + 1.24), (0.044, 0.008, 0.072), "E2DFD6", "plastic_matte", bevel=0.0)


# ---------------------------------------------------------------------------
# Custom 6-View Webtoon Review Cameras (tailored to Classroom + Corridor)
# ---------------------------------------------------------------------------


def build_classroom_six_views() -> List[PreviewCameraView]:
    """Return 6 tailored webtoon review views showcasing both Classroom & Corridor."""
    return [
        PreviewCameraView(
            key="front",
            label="1 CORRIDOR-FRONT",
            location=(0.0, -10.8, 2.10),
            target=(0.0, -1.0, 1.25),
            lens_mm=32.0,
            hide_nodes=("BG_Wall_South", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="side",
            label="2 REAR-TO-BOARD",
            location=(-3.88, 1.05, 1.72),
            target=(4.55, 0.92, 1.38),
            lens_mm=24.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="back",
            label="3 BOARD-TO-LOCKER",
            location=(3.95, 1.05, 1.72),
            target=(-4.55, 1.05, 1.32),
            lens_mm=24.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(-8.4, -8.5, 5.35),
            target=(0.25, 0.05, 1.08),
            lens_mm=34.0,
            hide_nodes=("BG_Wall_South", "BG_Wall_West", "BG_Ceiling", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 WINDOW SEAT 35MM",
            location=(-2.35, 3.15, 1.34),
            target=(4.15, 0.92, 1.38),
            lens_mm=32.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(-0.6, -7.6, 11.4),
            target=(0.0, 0.0, 0.72),
            lens_mm=32.0,
            hide_nodes=("BG_Ceiling", "BG_Wall_South", "BG_Cutaway_Front"),
        ),
    ]


def build_scene_groups() -> HeroSceneGroups:
    """Populate all 8 semantic cutaway buckets for the Korean high school classroom & corridor."""
    groups = HeroSceneGroups()
    build_floor_and_partition(groups.floor)
    build_wall_north(groups.wall_north)
    build_wall_south(groups.wall_south)
    build_wall_west(groups.wall_west)
    build_wall_east(groups.wall_east)
    build_ceiling(groups.ceiling)
    build_furniture_hero(groups.furniture_hero)
    build_props_clutter(groups.props_clutter)
    # Potted classroom plant beside sunny front window corner (curved 3D foliage, zero flat cards!)
    add_curved_foliage_plant(
        groups.props_clutter,
        (3.92, 3.88, FLOOR_Z),
        species="monstera",
        height=1.08,
        pot_radius=0.15,
        pot_height=0.28,
        leaf_count=9,
        seed=55,
        pot_color="C7815A",
        pot_tile="ceramic_gloss",
        stem_tile="foliage_prop",
        leaf_color="3F6E43",
        leaf_tile="foliage_prop",
    )
    groups.ground_to_zero()
    return groups


def _to_gltf_camera_dict(view: PreviewCameraView) -> Dict[str, object]:
    p = view.location
    t = view.target
    return {
        "position": [round(p[0], 4), round(p[2], 4), round(-p[1], 4)],
        "target": [round(t[0], 4), round(t[2], 4), round(-t[1], 4)],
        "lensMm": view.lens_mm,
        "hideNodes": list(view.hide_nodes),
    }


def run_build(
    *,
    out_dir: Path,
    preview_dir: Path,
    desktop_primary_size: int = 1024,
    desktop_secondary_size: int = 1024,
    mobile_opaque_size: int = 1024,
    mobile_glass_size: int = 512,
    skip_previews: bool = False,
    report_out: Optional[Path] = None,
) -> Dict[str, object]:
    """Build, QA-audit, export (desktop + mobile meshopt GLB), and render 6-view + Freestyle SVG."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    out_dir = Path(out_dir)
    preview_dir = Path(preview_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)

    groups = build_scene_groups()
    views = build_classroom_six_views()

    # 1. Assemble, Gate-1 audit, and export Mobile 4-node GLB first
    mobile_scene: AssembledHeroScene = assemble_mobile_cutaway(
        SLUG,
        groups,
        opaque_size=mobile_opaque_size,
        glass_size=mobile_glass_size,
        auto_ground=False,
    )
    mobile_gate1 = audit_blender_scene(mobile_scene.root, profile="mobile")
    if not mobile_gate1["passed"]:
        raise RuntimeError(f"Mobile Gate 1 failed: {json.dumps(mobile_gate1['errors'], ensure_ascii=False)}")

    mobile_glb_path = out_dir / f"{SLUG}-mobile.glb"
    mobile_export = export_cutaway_glb(
        mobile_scene,
        mobile_glb_path,
        optimize_meshopt=True,
        copyright_text=DEFAULT_COPYRIGHT,
    )
    _remove_hierarchy(mobile_scene)

    # 2. Assemble, Gate-1 audit, and export Desktop 8-node GLB
    desktop_scene: AssembledHeroScene = assemble_desktop_cutaway(
        SLUG,
        groups,
        primary_size=desktop_primary_size,
        secondary_size=desktop_secondary_size,
        auto_ground=False,
    )
    desktop_gate1 = audit_blender_scene(desktop_scene.root, profile="desktop")
    if not desktop_gate1["passed"]:
        raise RuntimeError(f"Desktop Gate 1 failed: {json.dumps(desktop_gate1['errors'], ensure_ascii=False)}")

    desktop_glb_path = out_dir / f"{SLUG}.glb"
    desktop_export = export_cutaway_glb(
        desktop_scene,
        desktop_glb_path,
        optimize_meshopt=True,
        copyright_text=DEFAULT_COPYRIGHT,
    )

    # 3. Gate-2 GLB contract + gltf-transform validate on both exported GLBs
    desktop_gate2 = inspect_glb(desktop_glb_path, profile="desktop", require_meshopt=True, run_validate=True)
    mobile_gate2 = inspect_glb(mobile_glb_path, profile="mobile", require_meshopt=True, run_validate=True)

    if not desktop_gate2["passed"]:
        raise RuntimeError(f"Desktop Gate 2 failed: {json.dumps(desktop_gate2['errors'], ensure_ascii=False)}")
    if not mobile_gate2["passed"]:
        raise RuntimeError(f"Mobile Gate 2 failed: {json.dumps(mobile_gate2['errors'], ensure_ascii=False)}")

    # 4. Write per-slug manifest JSON
    cameras_gltf = {v.key: _to_gltf_camera_dict(v) for v in views}
    manifest = {
        "assetId": SLUG,
        "titleKo": "한국 고등학교 교실 & 복도",
        "dimensionsM": [ROOM_LEN_X, TOTAL_DEPTH_Y, TOTAL_HEIGHT_Z],
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
        "cameras": cameras_gltf,
    }
    manifest_path = out_dir / f"{SLUG}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # 5. Gate-5 6-view 512x512 BLENDER_EEVEE contact sheet + 3-tier Freestyle SVG + thumbnail
    previews: Dict[str, object] = {}
    if not skip_previews:
        lineart_dst = out_dir / "lineart" / f"{SLUG}-lineart.svg"
        thumb_dst = out_dir / "thumbnails" / f"{SLUG}.png"
        previews = render_hero_review_bundle(
            preview_dir,
            SLUG,
            root_obj=desktop_scene.root,
            views=views,
            tile_resolution=512,
            interior_cutaway=True,
            thumbnail_path=thumb_dst,
            thumbnail_view_index=4,
            lineart_copy_path=lineart_dst,
        )
        svg_meta = dict(previews["freestyleSvg"])  # type: ignore[arg-type]
        svg_meta["path"] = f"lineart/{SLUG}-lineart.svg"
        update_manifest_metadata(
            manifest_path,
            freestyle_svg=svg_meta,
            lighting_presets=build_lighting_presets(),
        )
    else:
        update_manifest_metadata(manifest_path, lighting_presets=build_lighting_presets())

    report: Dict[str, object] = {
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
        "previews": previews,
    }

    if report_out is not None:
        report_out.parent.mkdir(parents=True, exist_ok=True)
        report_out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2, ensure_ascii=False))
    return report


def main(argv: Optional[Sequence[str]] = None) -> int:
    if argv is not None:
        raw = list(argv)
    else:
        raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build Korean High School Classroom & Corridor Hero BG3D")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--preview-dir", type=Path, default=DEFAULT_PREVIEW_DIR)
    parser.add_argument("--desktop-primary-size", type=int, default=2048)
    parser.add_argument("--desktop-secondary-size", type=int, default=1024)
    parser.add_argument("--mobile-opaque-size", type=int, default=1024)
    parser.add_argument("--mobile-glass-size", type=int, default=512)
    parser.add_argument("--skip-previews", action="store_true")
    parser.add_argument("--report-out", type=Path, default=DEFAULT_PREVIEW_DIR / f"{SLUG}-qa-report.json")
    args = parser.parse_args(raw)

    run_build(
        out_dir=args.out,
        preview_dir=args.preview_dir,
        desktop_primary_size=args.desktop_primary_size,
        desktop_secondary_size=args.desktop_secondary_size,
        mobile_opaque_size=args.mobile_opaque_size,
        mobile_glass_size=args.mobile_glass_size,
        skip_previews=args.skip_previews,
        report_out=args.report_out,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
