"""Hero Webtoon 3D Background v2 #3: Korean General Hospital Ward & Nurse Corridor.

Asset slug: ``kr_hospital_ward_corridor``
Real-world dimensions: ``12.00 x 8.50 x 3.10 m``
Zones:
  - 2-Bed Hospital Ward ("302호 병실", North-West & North-Center, X in [-5.82, +1.95], Y in [-0.60, +4.07]):
      * Two electric hospital beds (head/footboards, articulated deck, folding side
        rails, casters, crisp mattress, folded hospital blanket & pillow)
      * Medical headwall panels (O2/vacuum outlets, nurse call, reading lights)
      * Sculpted pleated privacy curtains (add_pleated_curtain) with tiebacks
      * IV drip stands with hanging saline bags, rolling vital-signs patient monitor
        (ECG waveform display), bedside nightstands with overbed trays, water pitcher & cups
      * Guardian sofa by sunlit North window with half-lowered Venetian blinds & Monstera plant
  - Corridor & L-Shaped Nurse Station (South corridor Y in [-4.07, -0.76] + East station):
      * L-shaped bi-level Nurse Station desk with 3 task chairs, dual monitors,
        color-coded patient chart binders, supply cabinetry, and Rounding Schedule board
      * Continuous ergonomic wall handrails & bumper guards on corridor walls
      * Korean wayfinding signage: Ward 302 plaque (paper_label), Rounding Schedule
        (chalkboard), illuminated Nurse Station sign (emissive_amber), suspended
        Corridor Department Sign (emissive_neon), and green Emergency Exit sign
      * Folding hospital wheelchair, mobile medical rounding cart, corridor waiting bench,
        and potted Ficus plant

Headless execution (Blender 5.3):
  /Users/hjunkim/.local/bin/blender --background --factory-startup \
    --python-exit-code 42 --python tools/blender/webtoon_hero_bg/build_kr_hospital_ward.py
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
    add_curved_foliage_plant,
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
# Spatial Constants & Soothing Clinical Korean Hospital Palette (Z=0 base)
# ---------------------------------------------------------------------------

SLUG = "kr_hospital_ward_corridor"
TITLE_KO = "종합병원 2인실 병실 · 복도 & 간호 스테이션"
DEFAULT_OUT_DIR = REPO_ROOT / "apps/web/public/assets/3d/environments/hero-v2" / SLUG
DEFAULT_PREVIEW_DIR = REPO_ROOT / "loop-stack/v2-previews/bg"

ROOM_W = 12.000
ROOM_D = 8.500
ROOM_H = 3.100
HALF_W = ROOM_W * 0.5   # 6.000
HALF_D = ROOM_D * 0.5   # 4.250

FLOOR_Z = 0.100
CEIL_Z = 2.940
WALL_T = 0.180
WALL_BASE_Z = FLOOR_Z - 0.004
WALL_H = (CEIL_Z + 0.004) - WALL_BASE_Z

INNER_X_MIN = -HALF_W + WALL_T   # -5.820
INNER_X_MAX = HALF_W - WALL_T    # +5.820
INNER_Y_MIN = -HALF_D + WALL_T   # -4.070
INNER_Y_MAX = HALF_D - WALL_T    # +4.070

PART_Y = -0.680        # Corridor (Y < -0.76) vs Ward (Y > -0.60)
WARD_EAST_X = 1.880    # Divider between Ward (X < 1.80) and Nurse Station (X > 1.96)

# Calm Korean university hospital daylight palette (clean, comforting, webtoon-readable)
COL_WALL_CLINIC = "F2F5F6"
COL_WALL_LOWER = "E1E9EB"
COL_TEAL_ACCENT = "1E7D86"
COL_TEAL_SOFT = "8DB4B8"
COL_FLOOR_WARD = "E6E3DC"
COL_FLOOR_CORR = "E0E5E8"
COL_FLOOR_LANE = "A5C3C6"
COL_BIRCH_WOOD = "D9BD96"
COL_OAK_WARM = "C69F72"
COL_STEEL = "CCD3D9"
COL_DARK_METAL = "3D454E"
COL_BED_FRAME = "E6ECEF"
COL_SHEET_WHITE = "F7F9FA"
COL_BLANKET_MINT = "B2D2D8"
COL_BLANKET_SKY = "B8CEE0"
COL_CURTAIN_MINT = "DFECE8"
COL_SOFA_SAGE = "BACAC4"
COL_COUNTER_TOP = "F4F6F7"
COL_BLIND_WHITE = "F0F3F5"
COL_CEIL_WHITE = "F5F7F8"
COL_CEIL_GRID = "DCE3E6"


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


def _lbox(
    g: MeshGroup,
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
    *,
    bevel: float = 0.0035,
    uv_fit: Optional[bool] = None,
) -> None:
    pts, faces = _make_beveled_box_local((sx, sy, sz), bevel=_safe_bevel((sx, sy, sz), bevel))
    pts = [(p[0] + lx, p[1] + ly, p[2] + lz) for p in pts]
    g.solid(_transform_points(pts, origin, rot_z=rot_z), faces, color=color, tile=tile, uv_fit=uv_fit)


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


def _add_wheel_ring(
    g: MeshGroup,
    cx: float,
    cy: float,
    cz: float,
    radius: float,
    tube_r: float,
    color: str,
    tile: str,
    *,
    axis_y: bool = True,
    maj_segs: int = 16,
    min_segs: int = 6,
) -> None:
    """Watertight torus wheel rim oriented perpendicular to Y (or X)."""
    rings: List[List[Tuple[float, float, float]]] = []
    for i in range(maj_segs):
        a = math.tau * i / maj_segs
        ca, sa = math.cos(a), math.sin(a)
        ring: List[Tuple[float, float, float]] = []
        for j in range(min_segs):
            b = math.tau * j / min_segs
            r_off = tube_r * math.cos(b)
            ax_off = tube_r * math.sin(b)
            if axis_y:
                ring.append((cx + (radius + r_off) * ca, cy + ax_off, cz + (radius + r_off) * sa))
            else:
                ring.append((cx + ax_off, cy + (radius + r_off) * ca, cz + (radius + r_off) * sa))
        rings.append(ring)
    g.rings(rings, color=color, tile=tile, closed_loop=True)


# ---------------------------------------------------------------------------
# 1. Floor, Ward-Corridor Partition, Nurse Station Back Wall, Handrails & Rounding Board
# ---------------------------------------------------------------------------


def _build_floor_and_partitions(g: MeshGroup) -> None:
    # Foundation slab strictly grounded at Z = 0.000
    _box(g, (0.0, 0.0, FLOOR_Z * 0.5 - 0.006), (ROOM_W, ROOM_D, FLOOR_Z - 0.012), "B8C0C4", "concrete", bevel=0.004)

    # Distinct seamless hospital vinyl finishes (Ward warm ivory vs Corridor cool pearl + guiding lane)
    fh = 0.014
    fzc = FLOOR_Z - fh * 0.5
    # Ward & Nurse station zone (Y in [-0.66, +4.20])
    _box(g, (0.0, 1.77, fzc), (ROOM_W - 0.06, 4.84, fh), COL_FLOOR_WARD, "tile_ceramic", bevel=0.0)
    # Corridor zone (Y in [-4.20, -0.70])
    _box(g, (0.0, -2.45, fzc), (ROOM_W - 0.06, 3.46, fh), COL_FLOOR_CORR, "tile_ceramic", bevel=0.0)
    # Soothing teal corridor wayfinding center lane stripe
    _box(g, (0.0, -2.42, FLOOR_Z + 0.003), (ROOM_W - 0.50, 0.42, 0.006), COL_FLOOR_LANE, "trim_paint", bevel=0.0)
    # Nurse station raised subtle slate floor mat behind L-desk
    _box(g, (4.05, 0.45, FLOOR_Z + 0.004), (3.10, 2.25, 0.008), "D2DBDE", "tile_ceramic", bevel=0.0)

    # --- Ward-Corridor Partition Wall (Y = PART_Y = -0.68, X in [-5.81, +1.84]) ---
    # Contains: wide observation window (open glass) + wide hospital sliding door (slid halfway open!)
    pw_len = 1.84 - (-5.81)   # 7.65m
    pw_cx = 0.5 * (-5.81 + 1.84)  # -1.985
    add_wall_with_openings(
        g,
        center=(pw_cx, PART_Y, WALL_BASE_Z),
        length=pw_len,
        thickness=0.16,
        height=WALL_H,
        openings=(
            # Corridor observation window at world X = -2.80 (local -0.815)
            WallOpening(offset_x=-0.815, width=2.25, height=1.08, sill_z=1.02, kind="window"),
            # Wide hospital sliding ward door at world X = +0.52 (local +2.505)
            WallOpening(offset_x=2.505, width=1.28, height=2.18, sill_z=0.0, kind="door"),
        ),
        rot_z=0.0,
        color=COL_WALL_CLINIC,
        tile="plaster",
        baseboard_height=0.095,
        baseboard_depth=0.016,
        baseboard_color="C8D2D6",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color="E6ECEE",
        trim_both_sides=True,
        interior_side=-1,
    )
    # Observation window aluminum frame + half-raised blinds (clear middle OPEN AIR!)
    win_x = -2.80
    _box(g, (win_x, PART_Y, FLOOR_Z + 1.04), (2.32, 0.21, 0.042), COL_BIRCH_WOOD, "trim_paint", bevel=0.004)
    _box(g, (win_x, PART_Y, FLOOR_Z + 2.08), (2.30, 0.19, 0.038), COL_STEEL, "sash_metal", bevel=0.003)
    for mx in (win_x - 1.11, win_x, win_x + 1.11):
        _box(g, (mx, PART_Y, FLOOR_Z + 1.56), (0.044, 0.18, 1.00), COL_STEEL, "sash_metal", bevel=0.003)
    for si in range(3):
        _box(g, (win_x, PART_Y + 0.02, FLOOR_Z + 2.02 - si * 0.055), (2.16, 0.024, 0.010), COL_BLIND_WHITE, "trim_paint", bevel=0.0)

    # Hospital Sliding Ward Door (X = +0.52, slid 0.56m left into open position!)
    dx = 0.52
    _box(g, (dx - 0.64, PART_Y, FLOOR_Z + 1.09), (0.046, 0.19, 2.18), COL_BIRCH_WOOD, "door_wood", bevel=0.003)
    _box(g, (dx + 0.64, PART_Y, FLOOR_Z + 1.09), (0.046, 0.19, 2.18), COL_BIRCH_WOOD, "door_wood", bevel=0.003)
    _box(g, (dx, PART_Y, FLOOR_Z + 2.18), (1.36, 0.20, 0.055), COL_BIRCH_WOOD, "door_wood", bevel=0.003)
    # Upper sliding rail cover box on corridor side
    _box(g, (dx - 0.35, PART_Y - 0.115, FLOOR_Z + 2.24), (2.25, 0.072, 0.085), COL_STEEL, "sash_metal", bevel=0.003)
    # Partially slid-open birch wood door leaf with narrow vision slit & brushed vertical pull handle
    leaf_x = dx - 0.58
    _box(g, (leaf_x, PART_Y - 0.11, FLOOR_Z + 1.08), (1.26, 0.046, 2.14), COL_BIRCH_WOOD, "door_wood", bevel=0.004)
    _box(g, (leaf_x + 0.42, PART_Y - 0.11, FLOOR_Z + 1.42), (0.18, 0.052, 0.96), COL_STEEL, "sash_metal", bevel=0.003)
    _box(g, (leaf_x + 0.54, PART_Y - 0.155, FLOOR_Z + 1.02), (0.024, 0.036, 0.36), COL_STEEL, "hardware_brass", bevel=0.003)

    # --- Corridor-Side Continuous Ergonomic Wall Handrail & Bumper Guard on Partition Wall ---
    for seg_x0, seg_x1 in ((-5.72, -0.22), (1.22, 1.78)):
        scx = 0.5 * (seg_x0 + seg_x1)
        slen = seg_x1 - seg_x0
        _box(g, (scx, PART_Y - 0.098, FLOOR_Z + 0.90), (slen, 0.036, 0.088), COL_BIRCH_WOOD, "wood_panel", bevel=0.008)
        _box(g, (scx, PART_Y - 0.092, FLOOR_Z + 0.26), (slen, 0.022, 0.12), "CDD7DA", "trim_paint", bevel=0.003)

    # --- Divider Wall between Ward & Nurse Station (X = WARD_EAST_X = 1.88, Y in [-0.58, +4.04]) ---
    div_len = 4.04 - (-0.58)
    div_cy = 0.5 * (-0.58 + 4.04)
    add_wall_with_openings(
        g,
        center=(WARD_EAST_X, div_cy, WALL_BASE_Z),
        length=div_len,
        thickness=0.16,
        height=WALL_H,
        openings=(),
        rot_z=-math.pi * 0.5,
        color=COL_WALL_CLINIC,
        tile="plaster",
        baseboard_height=0.095,
        baseboard_depth=0.016,
        baseboard_color="C8D2D6",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color="E6ECEE",
        trim_both_sides=True,
        interior_side=-1,
    )
    # Bed #2 Headwall Medical Gas Console mounted on West face of divider wall (X = 1.78, Y = 2.05)
    _box(g, (WARD_EAST_X - 0.105, 2.05, FLOOR_Z + 1.38), (0.048, 1.56, 0.24), "E2EAEB", "sash_metal", bevel=0.004)
    _box(g, (WARD_EAST_X - 0.132, 2.05, FLOOR_Z + 1.38), (0.010, 1.48, 0.055), COL_TEAL_ACCENT, "trim_paint", bevel=0.0)

    # --- Nurse Station Back Wall Partition (Y = +1.95, X in [1.98, 5.80]) ---
    # Houses the crisp "병동 회진 일정" Rounding Schedule Board (tile="chalkboard", color="FFFFFF"!)
    ns_len = 5.80 - 1.98
    ns_cx = 0.5 * (1.98 + 5.80)
    _box(g, (ns_cx, 1.98, WALL_BASE_Z + WALL_H * 0.5), (ns_len, 0.14, WALL_H), COL_WALL_CLINIC, "plaster", bevel=0.003)
    # Teal hospital accent header stripe on Nurse Station back wall
    _box(g, (ns_cx, 1.90, FLOOR_Z + 2.18), (ns_len - 0.12, 0.016, 0.14), COL_TEAL_ACCENT, "trim_paint", bevel=0.0)
    # Ward Rounding Schedule Graphic Board (#156 tile="chalkboard", color="FFFFFF", facing -Y into corridor!)
    _box(g, (3.88, 1.89, FLOOR_Z + 1.50), (1.76, 0.032, 0.88), COL_STEEL, "sash_metal", bevel=0.004)
    _box(g, (3.88, 1.868, FLOOR_Z + 1.50), (1.68, 0.010, 0.80), "FFFFFF", "chalkboard", bevel=0.0, uv_fit=True)


# ---------------------------------------------------------------------------
# 2. Perimeter Walls (North Windows + Blinds, West Bed #1 Headwall, East, South Corridor Wall)
# ---------------------------------------------------------------------------


def _build_wall_north(g: MeshGroup) -> None:
    """Sunlit Hospital Ward Panoramic North Window Wall with Half-Lowered Venetian Blinds."""
    add_wall_with_openings(
        g,
        center=(0.0, HALF_D - WALL_T * 0.5, WALL_BASE_Z),
        length=ROOM_W,
        thickness=WALL_T,
        height=WALL_H,
        openings=(
            WallOpening(offset_x=-3.95, width=2.25, height=1.62, sill_z=0.78, kind="window"),
            WallOpening(offset_x=-1.15, width=2.25, height=1.62, sill_z=0.78, kind="window"),
            WallOpening(offset_x=3.85, width=2.20, height=1.62, sill_z=0.78, kind="window"),
        ),
        rot_z=0.0,
        color=COL_WALL_CLINIC,
        tile="plaster",
        baseboard_height=0.095,
        baseboard_depth=0.016,
        baseboard_color="C8D2D6",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color="E6ECEE",
        interior_side=-1,
    )
    # Aluminum window frames, deep sills, center mullions & crisp half-raised Venetian blinds
    for wx, ww in ((-3.95, 2.25), (-1.15, 2.25), (3.85, 2.20)):
        wy = HALF_D - WALL_T * 0.5
        _box(g, (wx, wy - 0.025, FLOOR_Z + 0.80), (ww + 0.10, WALL_T + 0.07, 0.048), "EAE7E0", "marble", bevel=0.004)
        _box(g, (wx, wy, FLOOR_Z + 2.38), (ww + 0.04, WALL_T + 0.02, 0.048), COL_STEEL, "sash_metal", bevel=0.003)
        for mx in (wx - ww * 0.5 + 0.028, wx, wx + ww * 0.5 - 0.028):
            _box(g, (mx, wy, FLOOR_Z + 1.59), (0.048, WALL_T + 0.01, 1.54), COL_STEEL, "sash_metal", bevel=0.003)
        # Upper blind headrail + 6 white Venetian blind slats (clear lower window lets bright daylight flood ward!)
        _box(g, (wx, INNER_Y_MAX + 0.025, FLOOR_Z + 2.32), (ww - 0.08, 0.042, 0.036), COL_STEEL, "sash_metal", bevel=0.002)
        for si in range(6):
            _box(g, (wx, INNER_Y_MAX + 0.025, FLOOR_Z + 2.26 - si * 0.050), (ww - 0.10, 0.028, 0.010), COL_BLIND_WHITE, "trim_paint", bevel=0.0)


def _build_wall_west(g: MeshGroup) -> None:
    """West Ward Headwall (Bed #1 medical gas console + Corridor West End Fire Door)."""
    add_wall_with_openings(
        g,
        center=(-HALF_W + WALL_T * 0.5, 0.0, WALL_BASE_Z),
        length=ROOM_D - WALL_T * 2.0 - 0.006,
        thickness=WALL_T,
        height=WALL_H,
        openings=(
            # Corridor West end double fire exit portal (local X = -2.42 -> world Y = -2.42)
            WallOpening(offset_x=-2.42, width=1.68, height=2.20, sill_z=0.0, kind="door"),
        ),
        rot_z=math.pi * 0.5,
        color=COL_WALL_CLINIC,
        tile="plaster",
        baseboard_height=0.095,
        baseboard_depth=0.016,
        baseboard_color="C8D2D6",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color="E6ECEE",
        interior_side=-1,
    )
    # Hero Bed #1 Headwall Medical Gas / Call / Reading-Light Console (X = -5.78, Y = 2.05)
    _box(g, (INNER_X_MIN + 0.032, 2.05, FLOOR_Z + 1.38), (0.048, 1.62, 0.24), "E2EAEB", "sash_metal", bevel=0.004)
    _box(g, (INNER_X_MIN + 0.058, 2.05, FLOOR_Z + 1.38), (0.010, 1.54, 0.055), COL_TEAL_ACCENT, "trim_paint", bevel=0.0)
    # Medical gas color-coded O2/Air/Vac outlet ports
    for oy, ocol in ((1.72, "2FA866"), (1.84, "E6B422"), (1.96, "3C7EC4")):
        _box(g, (INNER_X_MIN + 0.062, oy, FLOOR_Z + 1.38), (0.016, 0.042, 0.042), ocol, "trim_paint", bevel=0.002)

    # Corridor West Double Steel Fire Doors (framed, slightly ajar look or closed clean hospital doors)
    for dy in (-2.84, -2.00):
        _box(g, (-HALF_W + WALL_T * 0.5, dy, FLOOR_Z + 1.10), (0.058, 0.80, 2.16), "D8E2E4", "door_wood", bevel=0.004)
        _box(g, (-HALF_W + WALL_T * 0.5 + 0.036, dy, FLOOR_Z + 1.00), (0.024, 0.62, 0.055), COL_STEEL, "hardware_brass", bevel=0.003)  # Push bar


def _build_wall_east(g: MeshGroup) -> None:
    """East Wall behind Nurse Station & Corridor Continuation."""
    add_wall_with_openings(
        g,
        center=(HALF_W - WALL_T * 0.5, 0.0, WALL_BASE_Z),
        length=ROOM_D - WALL_T * 2.0 - 0.006,
        thickness=WALL_T,
        height=WALL_H,
        openings=(),
        rot_z=-math.pi * 0.5,
        color=COL_WALL_CLINIC,
        tile="plaster",
        baseboard_height=0.095,
        baseboard_depth=0.016,
        baseboard_color="C8D2D6",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color="E6ECEE",
        interior_side=-1,
    )
    # Corridor East wall handrail & lower bumper guard (Y in [-3.95, -0.78])
    _box(g, (INNER_X_MAX - 0.036, -2.36, FLOOR_Z + 0.90), (0.036, 3.05, 0.088), COL_BIRCH_WOOD, "wood_panel", bevel=0.008)
    _box(g, (INNER_X_MAX - 0.024, -2.36, FLOOR_Z + 0.26), (0.022, 3.05, 0.12), "CDD7DA", "trim_paint", bevel=0.003)
    # Recessed corridor fire hydrant / extinguisher station on East wall
    _box(g, (INNER_X_MAX - 0.032, -1.65, FLOOR_Z + 1.48), (0.048, 0.56, 0.78), "D8DEE2", "sash_metal", bevel=0.004)
    _box(g, (INNER_X_MAX - 0.060, -1.65, FLOOR_Z + 1.66), (0.012, 0.36, 0.16), "C83832", "trim_paint", bevel=0.0)


def _build_wall_south(g: MeshGroup) -> None:
    """South Corridor Outer Wall with continuous hospital handrail, bumper guard & windows."""
    add_wall_with_openings(
        g,
        center=(0.0, -HALF_D + WALL_T * 0.5, WALL_BASE_Z),
        length=ROOM_W,
        thickness=WALL_T,
        height=WALL_H,
        openings=(
            WallOpening(offset_x=-3.20, width=2.20, height=1.35, sill_z=1.05, kind="window"),
            WallOpening(offset_x=2.80, width=2.20, height=1.35, sill_z=1.05, kind="window"),
        ),
        rot_z=math.pi,
        color=COL_WALL_LOWER,
        tile="plaster",
        baseboard_height=0.095,
        baseboard_depth=0.016,
        baseboard_color="C8D2D6",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color="E6ECEE",
        interior_side=-1,
    )
    # Continuous ergonomic handrail & wall bumper rail along full South corridor wall
    _box(g, (0.0, INNER_Y_MIN + 0.036, FLOOR_Z + 0.90), (ROOM_W - 0.44, 0.036, 0.088), COL_BIRCH_WOOD, "wood_panel", bevel=0.008)
    _box(g, (0.0, INNER_Y_MIN + 0.024, FLOOR_Z + 0.26), (ROOM_W - 0.44, 0.022, 0.12), "CDD7DA", "trim_paint", bevel=0.003)
    # Corridor window sills & frames (world X = +3.20 and -2.80 due to rot_z=pi)
    for wx in (-2.80, 3.20):
        wy = -HALF_D + WALL_T * 0.5
        _box(g, (wx, wy + 0.022, FLOOR_Z + 1.07), (2.26, WALL_T + 0.06, 0.044), "EAE7E0", "marble", bevel=0.004)
        _box(g, (wx, wy, FLOOR_Z + 2.38), (2.24, WALL_T + 0.02, 0.044), COL_STEEL, "sash_metal", bevel=0.003)
        for mx in (wx - 1.08, wx, wx + 1.08):
            _box(g, (mx, wy, FLOOR_Z + 1.72), (0.044, WALL_T + 0.01, 1.28), COL_STEEL, "sash_metal", bevel=0.003)


# ---------------------------------------------------------------------------
# 3. Ceiling: Acoustic LED Troffers, Nurse Station Sign, Corridor Wayfinding & Exit Sign
# ---------------------------------------------------------------------------


def _build_ceiling(g: MeshGroup) -> None:
    slab_h = ROOM_H - CEIL_Z
    _box(g, (0.0, 0.0, CEIL_Z + slab_h * 0.5), (ROOM_W, ROOM_D, slab_h), COL_CEIL_WHITE, "ceiling_plaster", bevel=0.004)

    # Clean clinical modular ceiling grid ribs
    for gx in (-4.0, -2.0, 0.0, 2.0, 4.0):
        _box(g, (gx, 0.0, CEIL_Z - 0.009), (0.048, ROOM_D - 0.40, 0.018), COL_CEIL_GRID, "ceiling_beam", bevel=0.0025)
    for gy in (-2.4, -0.7, 1.8):
        _box(g, (0.0, gy, CEIL_Z - 0.012), (ROOM_W - 0.40, 0.048, 0.015), COL_CEIL_GRID, "ceiling_beam", bevel=0.0025)

    # 8 Recessed Clean Clinical LED Troffer Light Panels (emissive_cool -> zero dark caves!)
    troffers = [
        (-4.20, 2.10, 1.25, 0.58),   # Over Bed #1
        (-0.20, 2.10, 1.25, 0.58),   # Over Bed #2
        (-2.20, 0.40, 1.25, 0.58),   # Ward center
        (3.85, 0.25, 1.55, 0.55),    # Over Nurse Station
        (-4.20, -2.42, 1.35, 0.45),  # Corridor West
        (-1.40, -2.42, 1.35, 0.45),  # Corridor Center-West
        (1.40, -2.42, 1.35, 0.45),   # Corridor Center-East
        (4.20, -2.42, 1.35, 0.45),   # Corridor East
    ]
    for lx, ly, lw, ld in troffers:
        _box(g, (lx, ly, CEIL_Z - 0.018), (lw + 0.05, ld + 0.05, 0.022), COL_CEIL_GRID, "ceiling_metal", bevel=0.003)
        _box(g, (lx, ly, CEIL_Z - 0.032), (lw, ld, 0.012), "FFFFFF", "emissive_cool", bevel=0.0)

    # Suspended Nurse Station Illuminated Fascia Sign ("간호사실 / NURSE STATION · 3F WARD", tile="emissive_amber")
    ns_x, ns_y, ns_z = 3.88, -0.72, CEIL_Z - 0.36
    for rx in (-0.56, 0.56):
        g.rail((ns_x + rx, ns_y, CEIL_Z - 0.01), (ns_x + rx, ns_y, ns_z + 0.16), 0.012, COL_STEEL, sides=8, tile="ceiling_metal")
    _box(g, (ns_x, ns_y, ns_z), (1.62, 0.10, 0.36), "1B5E68", "ceiling_metal", bevel=0.004)
    _box(g, (ns_x, ns_y - 0.055, ns_z), (1.54, 0.008, 0.31), "FFFFFF", "emissive_amber", bevel=0.0, uv_fit=True)
    _box(g, (ns_x, ns_y + 0.055, ns_z), (1.54, 0.008, 0.31), "FFFFFF", "emissive_amber", bevel=0.0, uv_fit=True)

    # Suspended Corridor Wayfinding Sign ("내과 병동 · 간호사실 / 301 ~ 312호 | 검사실 ▶", tile="emissive_neon")
    # Oriented perpendicular to corridor (facing ±X down the hallway — authentic Korean hospital wayfinding!)
    cw_x, cw_y, cw_z = -0.85, -2.42, CEIL_Z - 0.36
    for ry in (-0.50, 0.50):
        g.rail((cw_x, cw_y + ry, CEIL_Z - 0.01), (cw_x, cw_y + ry, cw_z + 0.16), 0.012, COL_STEEL, sides=8, tile="ceiling_metal")
    _box(g, (cw_x, cw_y, cw_z), (0.09, 1.48, 0.38), "1E6A72", "ceiling_metal", bevel=0.004)
    _box(g, (cw_x - 0.050, cw_y, cw_z), (0.008, 1.40, 0.32), "D6E4E6", "emissive_neon", bevel=0.0, uv_fit=True)
    _box(g, (cw_x + 0.050, cw_y, cw_z), (0.008, 1.40, 0.32), "D6E4E6", "emissive_neon", bevel=0.0, uv_fit=True)

    # Suspended Green Emergency Exit Sign ("비상구 / EXIT", tile="emissive_exit_green", facing ±X down hallway)
    ex_x, ex_y, ex_z = -5.15, -2.42, CEIL_Z - 0.32
    for ry in (-0.18, 0.18):
        g.rail((ex_x, ex_y + ry, CEIL_Z - 0.01), (ex_x, ex_y + ry, ex_z + 0.12), 0.009, COL_STEEL, sides=8, tile="ceiling_metal")
    _box(g, (ex_x, ex_y, ex_z), (0.064, 0.56, 0.24), "EAEEF0", "ceiling_metal", bevel=0.003)
    _box(g, (ex_x - 0.036, ex_y, ex_z), (0.008, 0.50, 0.195), "E8F5EE", "emissive_exit_green", bevel=0.0, uv_fit=True)
    _box(g, (ex_x + 0.036, ex_y, ex_z), (0.008, 0.50, 0.195), "E8F5EE", "emissive_exit_green", bevel=0.0, uv_fit=True)


# ---------------------------------------------------------------------------
# 4. Hero Furniture: 2 Electric Hospital Beds, Pleated Privacy Curtains, Guardian Sofa,
#    Bedside Nightstands, L-Shaped Nurse Station Desk & Chairs, Corridor Bench, Plants
# ---------------------------------------------------------------------------


def _add_hospital_bed(
    g: MeshGroup,
    cx: float,
    cy: float,
    z0: float,
    *,
    head_at_west: bool,
    blanket_color: str,
) -> None:
    """Detailed electric Korean hospital bed (2.12 x 1.00m) with side rails, mattress, blanket & pillow."""
    rot_z = 0.0 if head_at_west else math.pi  # Local -X = head end, local +X = foot end
    orig = (cx, cy, z0)
    bl, bw = 2.12, 1.00

    # Wheeled steel undercarriage chassis + 4 locking medical casters grounded on z0
    _lbox(g, orig, rot_z, 0.0, 0.0, 0.20, bl - 0.36, bw - 0.26, 0.085, COL_BED_FRAME, "metal_leg_steel", bevel=0.005)
    for sx in (-0.78, 0.78):
        for sy in (-0.36, 0.36):
            _lbox(g, orig, rot_z, sx, sy, 0.16, 0.055, 0.055, 0.24, COL_BED_FRAME, "metal_leg_steel", bevel=0.003)
            # Caster wheel cylinder
            wpt = _transform_points([(sx, sy, 0.0)], orig, rot_z=rot_z)[0]
            _cyl_z(g, wpt[0], wpt[1], z0, z0 + 0.068, 0.044, 0.044, COL_DARK_METAL, "metal_leg_dark", sides=10)
    # Articulated steel mattress deck frame (Z = 0.44m)
    _lbox(g, orig, rot_z, 0.0, 0.0, 0.45, bl - 0.08, bw - 0.04, 0.075, COL_BED_FRAME, "metal_leg_steel", bevel=0.005)
    # Birch-wood framed Headboard (at -X) & Footboard (at +X) with smooth hospital grip cutouts
    _lbox(g, orig, rot_z, -bl * 0.5 + 0.028, 0.0, 0.72, 0.052, bw, 0.68, COL_BIRCH_WOOD, "wood_birch", bevel=0.008)
    _lbox(g, orig, rot_z, bl * 0.5 - 0.028, 0.0, 0.64, 0.048, bw, 0.52, COL_BIRCH_WOOD, "wood_birch", bevel=0.008)
    # Folding Brushed-Steel Safety Side Rails (사이드레일) on both sides
    for side in (-1.0, 1.0):
        ry = side * (bw * 0.5 + 0.018)
        # Upper and lower horizontal rail bars + 3 vertical balusters (upper torso half of bed)
        _lbox(g, orig, rot_z, -0.26, ry, 0.78, 1.12, 0.026, 0.032, COL_STEEL, "metal_leg_steel", bevel=0.005)
        _lbox(g, orig, rot_z, -0.26, ry, 0.56, 1.12, 0.024, 0.026, COL_STEEL, "metal_leg_steel", bevel=0.004)
        for bx in (-0.74, -0.26, 0.22):
            _lbox(g, orig, rot_z, bx, ry, 0.67, 0.026, 0.024, 0.22, COL_STEEL, "metal_leg_steel", bevel=0.003)

    # Contoured Mattress + Crisp White Fitted Sheet
    _lbox(g, orig, rot_z, 0.0, 0.0, 0.565, bl - 0.14, bw - 0.08, 0.155, COL_SHEET_WHITE, "fabric_linen", bevel=0.018)
    # Folded Hospital Duvet Blanket covering lower 68% of bed (slightly wider/proud -> clean silhouette!)
    _lbox(g, orig, rot_z, 0.26, 0.0, 0.638, 1.38, bw - 0.05, 0.068, blanket_color, "fabric_linen", bevel=0.016)
    # Turned-down white top sheet cuff strip at blanket upper edge
    _lbox(g, orig, rot_z, -0.36, 0.0, 0.662, 0.18, bw - 0.07, 0.042, COL_SHEET_WHITE, "fabric_linen", bevel=0.010)
    # Plush Hospital Pillow resting neatly at head end
    _lbox(g, orig, rot_z, -0.74, 0.0, 0.705, 0.36, 0.58, 0.125, "FFFFFF", "fabric_linen", bevel=0.024)


def _add_nurse_chair(g: MeshGroup, cx: float, cy: float, z0: float, rot_z: float) -> None:
    """Compact clinical swivel task chair for Nurse Station."""
    orig = (cx, cy, z0)
    _cyl_z(g, cx, cy, z0 + 0.045, z0 + 0.44, 0.022, 0.020, COL_DARK_METAL, "metal_leg_dark", sides=8)
    for k in range(5):
        ang = rot_z + math.tau * k / 5.0
        wx = cx + 0.23 * math.cos(ang)
        wy = cy + 0.23 * math.sin(ang)
        g.rail((cx, cy, z0 + 0.062), (wx, wy, z0 + 0.042), 0.013, COL_DARK_METAL, sides=8, tile="metal_leg_dark")
        _cyl_z(g, wx, wy, z0, z0 + 0.042, 0.020, 0.020, "282E34", "metal_leg_dark", sides=8)
    _lbox(g, orig, rot_z, 0.0, 0.01, 0.465, 0.44, 0.42, 0.052, "3C727A", "fabric_linen", bevel=0.010)
    _lbox(g, orig, rot_z, 0.0, -0.205, 0.68, 0.41, 0.040, 0.38, "3C727A", "fabric_linen", bevel=0.010)


def _build_furniture_hero(g: MeshGroup) -> None:
    # 1. Two Hero Electric Hospital Beds facing each other across sunlit center aisle!
    # Bed #1 (West window-side hero bed: X in [-5.66, -3.54], Y = 2.05, head at West wall)
    _add_hospital_bed(g, -4.60, 2.05, FLOOR_Z, head_at_west=True, blanket_color=COL_BLANKET_MINT)
    # Bed #2 (East ward bed: X in [-0.36, +1.76], Y = 2.05, head at Ward-East divider wall)
    _add_hospital_bed(g, 0.70, 2.05, FLOOR_Z, head_at_west=False, blanket_color=COL_BLANKET_SKY)

    # 2. Bedside Nightstand Cabinets (협탁) + Overbed Rolling Meal Table
    for nx, ny in ((-5.46, 0.96), (1.50, 0.96)):
        _box(g, (nx, ny, FLOOR_Z + 0.38), (0.48, 0.46, 0.76), COL_BIRCH_WOOD, "wood_birch", bevel=0.005)
        _box(g, (nx, ny, FLOOR_Z + 0.775), (0.51, 0.49, 0.028), COL_COUNTER_TOP, "laminate_matte", bevel=0.004)
        # Front drawer pulls facing into room
        fx = nx + (0.246 if nx < 0 else -0.246)
        for dz in (0.62, 0.32):
            _box(g, (fx, ny, FLOOR_Z + dz), (0.014, 0.38, 0.16 if dz > 0.5 else 0.36), "ECEAE4", "laminate_matte", bevel=0.003)
    # Overbed adjustable dining table swung neatly beside Bed #1 foot
    _box(g, (-3.95, 1.08, FLOOR_Z + 0.022), (0.44, 0.64, 0.036), COL_STEEL, "metal_leg_steel", bevel=0.003)
    _cyl_z(g, -3.95, 0.80, FLOOR_Z + 0.035, FLOOR_Z + 0.86, 0.024, 0.022, COL_STEEL, "metal_leg_steel", sides=10)
    _box(g, (-3.95, 1.12, FLOOR_Z + 0.875), (0.44, 0.76, 0.028), COL_BIRCH_WOOD, "wood_birch", bevel=0.004)

    # 3. Sculpted Pleated Privacy Curtains (add_pleated_curtain) framing both hospital beds!
    # Drawn softly back with tiebacks so beds stay 100% legible in all webtoon shots!
    add_pleated_curtain(
        g,
        center=(-3.12, 2.75, FLOOR_Z + 0.24),
        width=1.22,
        height=2.24,
        depth=0.095,
        pleats=6,
        rot_z=math.pi * 0.5,
        tieback_height=0.45,
        tieback_pull=0.22,
        tieback_side=1,
        include_rod=True,
        include_rings=True,
        color=COL_CURTAIN_MINT,
        tile="fabric_linen",
        rod_color=COL_STEEL,
        rod_tile="metal_leg_steel",
        tieback_color=COL_TEAL_SOFT,
        tieback_tile="fabric_linen",
    )
    add_pleated_curtain(
        g,
        center=(-0.78, 2.75, FLOOR_Z + 0.24),
        width=1.22,
        height=2.24,
        depth=0.095,
        pleats=6,
        rot_z=math.pi * 0.5,
        tieback_height=0.45,
        tieback_pull=0.22,
        tieback_side=1,
        include_rod=True,
        include_rings=True,
        color=COL_CURTAIN_MINT,
        tile="fabric_linen",
        rod_color=COL_STEEL,
        rod_tile="metal_leg_steel",
        tieback_color=COL_TEAL_SOFT,
        tieback_tile="fabric_linen",
    )

    # 4. Guardian / Visitor Sofa (보호자 소파) under sunlit North window (X = -1.95, Y = 3.55)
    gs_x, gs_y = -1.95, 3.56
    _box(g, (gs_x, gs_y, FLOOR_Z + 0.20), (1.76, 0.76, 0.22), COL_SOFA_SAGE, "fabric_linen", bevel=0.012)
    for lx in (-0.78, 0.78):
        for ly in (-0.28, 0.28):
            _cyl_z(g, gs_x + lx, gs_y + ly, FLOOR_Z, FLOOR_Z + 0.095, 0.022, 0.018, COL_OAK_WARM, "wood_oak", sides=8)
    _box(g, (gs_x, gs_y - 0.04, FLOOR_Z + 0.37), (1.52, 0.62, 0.13), "C8D6D0", "fabric_linen", bevel=0.016)
    _box(g, (gs_x, gs_y + 0.26, FLOOR_Z + 0.62), (1.56, 0.16, 0.38), COL_SOFA_SAGE, "fabric_linen", bevel=0.016)
    for sx in (-0.82, 0.82):
        _box(g, (gs_x + sx, gs_y, FLOOR_Z + 0.44), (0.14, 0.74, 0.38), COL_SOFA_SAGE, "fabric_linen", bevel=0.012)
    # Built-in patient wardrobe closet in South-West ward corner (-5.42, -0.05)
    _box(g, (-5.42, -0.05, FLOOR_Z + 0.96), (0.58, 0.92, 1.92), COL_BIRCH_WOOD, "wood_birch", bevel=0.005)
    for dy in (-0.22, 0.22):
        _box(g, (-5.125, -0.05 + dy, FLOOR_Z + 0.96), (0.016, 0.42, 1.84), "E5D2B2", "wood_birch", bevel=0.003)

    # 5. L-Shaped Nurse Station Desk (L자 간호 데스크, X in [2.10, 5.55], Y in [-0.72, +1.50])
    # Main front leg running East-West along Y = -0.52 (facing South into Corridor!)
    _box(g, (3.85, -0.52, FLOOR_Z + 0.50), (3.42, 0.68, 1.00), COL_BIRCH_WOOD, "wood_birch", bevel=0.005)
    _box(g, (3.85, -0.66, FLOOR_Z + 1.03), (3.48, 0.36, 0.048), COL_COUNTER_TOP, "laminate_matte", bevel=0.005)  # Raised patient counter
    _box(g, (3.85, -0.32, FLOOR_Z + 0.75), (3.36, 0.62, 0.040), COL_COUNTER_TOP, "laminate_matte", bevel=0.004)  # Nurse inner worktop
    # Teal clinical accent front band along nurse desk apron
    _box(g, (3.85, -0.868, FLOOR_Z + 0.68), (3.36, 0.014, 0.14), COL_TEAL_ACCENT, "wood_painted", bevel=0.0)
    # Return wing running North-South along X = 2.28 (Y in [-0.15, +1.25]) forming classic L-shape!
    _box(g, (2.28, 0.55, FLOOR_Z + 0.50), (0.58, 1.38, 1.00), COL_BIRCH_WOOD, "wood_birch", bevel=0.005)
    _box(g, (2.28, 0.55, FLOOR_Z + 1.03), (0.62, 1.44, 0.048), COL_COUNTER_TOP, "laminate_matte", bevel=0.005)
    # 3 Nurse Swivel Chairs tucked behind the L-desk
    _add_nurse_chair(g, 3.15, 0.32, FLOOR_Z, rot_z=math.pi + 0.12)
    _add_nurse_chair(g, 4.15, 0.32, FLOOR_Z, rot_z=math.pi - 0.10)
    _add_nurse_chair(g, 5.05, 0.32, FLOOR_Z, rot_z=math.pi + 0.08)

    # Nurse Station Rear Medicine Storage Credenza against Y = 1.85 back wall (under Rounding Schedule)
    _box(g, (3.88, 1.62, FLOOR_Z + 0.44), (3.35, 0.50, 0.88), "EAEFEF", "laminate_matte", bevel=0.004)
    _box(g, (3.88, 1.62, FLOOR_Z + 0.90), (3.40, 0.54, 0.036), COL_COUNTER_TOP, "laminate_matte", bevel=0.004)

    # 6. Corridor 3-Seat Visitor Waiting Bench along South Corridor Wall (X = -0.80, Y = -3.62)
    bx, by = -0.80, -3.62
    _box(g, (bx, by, FLOOR_Z + 0.22), (1.88, 0.065, 0.055), COL_DARK_METAL, "metal_leg_dark", bevel=0.003)
    for lx in (-0.82, 0.82):
        _box(g, (bx + lx, by, FLOOR_Z + 0.20), (0.055, 0.46, 0.40), COL_STEEL, "metal_leg_steel", bevel=0.004)
    for si in (-1, 0, 1):
        sx = bx + si * 0.58
        _box(g, (sx, by + 0.04, FLOOR_Z + 0.44), (0.50, 0.46, 0.068), COL_SOFA_SAGE, "fabric_linen", bevel=0.012)
        _box(g, (sx, by - 0.18, FLOOR_Z + 0.68), (0.50, 0.068, 0.38), COL_SOFA_SAGE, "fabric_linen", bevel=0.012)

    # 7. Two Lush Sculpted Indoor Plants (add_curved_foliage_plant) — Ward window & Corridor corner
    add_curved_foliage_plant(
        g, (-3.18, 3.55, FLOOR_Z), species="monstera", height=1.22, pot_radius=0.17, pot_height=0.34, leaf_count=9, seed=19, pot_color="EAE6DF"
    )
    add_curved_foliage_plant(
        g, (5.26, -3.52, FLOOR_Z), species="ficus", height=1.38, pot_radius=0.19, pot_height=0.38, leaf_count=10, seed=41, pot_color="D5DDD9"
    )


# ---------------------------------------------------------------------------
# 5. Props & Clutter: IV Stands, ECG Patient Monitor, Wheelchair, Rounding Cart,
#    Ward 302 Plaque, Nurse Monitors & Charts, Water Pitcher/Cup
# ---------------------------------------------------------------------------


def _add_iv_drip_stand(g: MeshGroup, cx: float, cy: float, z0: float) -> None:
    """Rolling stainless IV drip stand (IV 링거 스탠드) with hanging saline bag & drip chamber."""
    # Central hub + 5-star rolling base (legs start radially outside hub -> 0 welded edges)
    _cyl_z(g, cx, cy, z0 + 0.045, z0 + 0.082, 0.032, 0.028, COL_STEEL, "steel_brushed", sides=10)
    for k in range(5):
        ang = math.tau * k / 5.0
        sx = cx + 0.028 * math.cos(ang)
        sy = cy + 0.028 * math.sin(ang)
        ex = cx + 0.24 * math.cos(ang)
        ey = cy + 0.24 * math.sin(ang)
        g.rail((sx, sy, z0 + 0.064), (ex, ey, z0 + 0.044), 0.012, COL_STEEL, sides=8, tile="steel_brushed")
        _cyl_z(g, ex, ey, z0, z0 + 0.042, 0.018, 0.018, COL_DARK_METAL, "rubber_dark", sides=8)
    # Telescoping vertical stainless pole (height 1.88m)
    _cyl_z(g, cx, cy, z0 + 0.080, z0 + 1.15, 0.016, 0.015, COL_STEEL, "steel_brushed", sides=10)
    _cyl_z(g, cx, cy, z0 + 1.152, z0 + 1.88, 0.011, 0.011, COL_STEEL, "steel_brushed", sides=10)
    # Top dual hook crossbar + translucent-tint saline IV bag + drip chamber
    g.rail((cx - 0.13, cy, z0 + 1.86), (cx + 0.13, cy, z0 + 1.86), 0.008, COL_STEEL, sides=8, tile="steel_brushed")
    _box(g, (cx + 0.09, cy, z0 + 1.66), (0.095, 0.048, 0.21), "D6EDF6", "glass_prop", bevel=0.010)
    _box(g, (cx + 0.09, cy, z0 + 1.62), (0.082, 0.054, 0.075), "F2F6F8", "paper_label", bevel=0.0)
    _cyl_z(g, cx + 0.09, cy, z0 + 1.46, z0 + 1.55, 0.012, 0.012, "DCEEF4", "glass_prop", sides=8)


def _add_patient_ecg_monitor(g: MeshGroup, cx: float, cy: float, z0: float, rot_z: float) -> None:
    """Rolling ICU/Ward vital-signs patient monitor with vivid ECG waveform screen."""
    orig = (cx, cy, z0)
    # Central hub + rolling 4-leg stand (legs start radially outside hub -> 0 welded edges)
    _cyl_z(g, cx, cy, z0 + 0.045, z0 + 0.086, 0.036, 0.032, COL_STEEL, "steel_brushed", sides=10)
    for k in range(4):
        ang = rot_z + math.pi * 0.25 + math.tau * k / 4.0
        sx = cx + 0.032 * math.cos(ang)
        sy = cy + 0.032 * math.sin(ang)
        ex = cx + 0.25 * math.cos(ang)
        ey = cy + 0.25 * math.sin(ang)
        g.rail((sx, sy, z0 + 0.064), (ex, ey, z0 + 0.044), 0.014, COL_STEEL, sides=8, tile="steel_brushed")
        _cyl_z(g, ex, ey, z0, z0 + 0.042, 0.022, 0.022, COL_DARK_METAL, "rubber_dark", sides=8)
    _cyl_z(g, cx, cy, z0 + 0.084, z0 + 1.18, 0.022, 0.020, COL_STEEL, "steel_brushed", sides=10)
    # Basket tray midway on stand
    _lbox(g, orig, rot_z, 0.0, 0.0, 0.78, 0.26, 0.20, 0.10, "DCE2E6", "aluminum_satin", bevel=0.004)
    # Monitor enclosure + crisp dark clinical screen + glowing green/cyan/amber ECG waveform bars!
    _lbox(g, orig, rot_z, 0.0, 0.0, 1.32, 0.36, 0.14, 0.28, "EBF0F2", "enamel_gloss", bevel=0.008)
    _lbox(g, orig, rot_z, 0.0, -0.073, 1.325, 0.31, 0.008, 0.22, "141D26", "glass_prop", bevel=0.0)
    # Vital ECG green trace segments + SpO2 cyan bar + BP amber readout blocks (proud 4mm!)
    ecg_pts = ((-0.13, 1.38), (-0.07, 1.38), (-0.04, 1.42), (-0.02, 1.34), (0.01, 1.38), (0.07, 1.38), (0.10, 1.41), (0.13, 1.38))
    for i in range(len(ecg_pts) - 1):
        p0 = _transform_points([(ecg_pts[i][0], -0.079 - (i % 2) * 0.0012, ecg_pts[i][1])], orig, rot_z=rot_z)[0]
        p1 = _transform_points([(ecg_pts[i + 1][0], -0.079 - (i % 2) * 0.0012, ecg_pts[i + 1][1])], orig, rot_z=rot_z)[0]
        g.rail(p0, p1, 0.0055, "32E67A", sides=6, tile="enamel_gloss")
    _lbox(g, orig, rot_z, -0.04, -0.079, 1.29, 0.19, 0.006, 0.012, "38C8E8", "enamel_gloss", bevel=0.0)
    _lbox(g, orig, rot_z, -0.04, -0.079, 1.25, 0.17, 0.006, 0.012, "F2B830", "enamel_gloss", bevel=0.0)
    _lbox(g, orig, rot_z, 0.10, -0.079, 1.28, 0.065, 0.006, 0.055, "32E67A", "enamel_gloss", bevel=0.0)


def _add_wheelchair(g: MeshGroup, cx: float, cy: float, z0: float) -> None:
    """Detailed hospital folding wheelchair parked along corridor facing East (+X)."""
    # Two large rear spoked wheels (R=0.30m) grounded on z0 (center Z = z0 + 0.312)
    wz = z0 + 0.312
    for sy in (-0.31, 0.31):
        _add_wheel_ring(g, cx - 0.14, cy + sy, wz, radius=0.295, tube_r=0.017, color="262B30", tile="rubber_dark", axis_y=True, maj_segs=16, min_segs=6)
        _add_wheel_ring(g, cx - 0.14, cy + sy + (0.022 if sy > 0 else -0.022), wz, radius=0.255, tube_r=0.008, color=COL_STEEL, tile="steel_brushed", axis_y=True, maj_segs=14, min_segs=6)
        # Central axle hub + 6 spokes starting radially outside hub (0 welded edges!)
        g.rail((cx - 0.14, cy + sy - 0.024, wz), (cx - 0.14, cy + sy + 0.024, wz), 0.028, COL_DARK_METAL, sides=10, tile="iron_dark")
        for k in range(6):
            ang = math.tau * k / 6.0
            ca, sa = math.cos(ang), math.sin(ang)
            g.rail(
                (cx - 0.14 + 0.028 * ca, cy + sy, wz + 0.028 * sa),
                (cx - 0.14 + 0.280 * ca, cy + sy, wz + 0.280 * sa),
                0.006,
                COL_STEEL,
                sides=6,
                tile="steel_brushed",
            )
        # Front smaller caster wheels (R=0.085m)
        _add_wheel_ring(g, cx + 0.32, cy + sy * 0.86, z0 + 0.095, radius=0.082, tube_r=0.013, color="262B30", tile="rubber_dark", axis_y=True, maj_segs=12, min_segs=6)
        # Tubular side frame + armrest + push handle
        g.rail((cx - 0.14, cy + sy * 0.86, z0 + 0.20), (cx + 0.32, cy + sy * 0.86, z0 + 0.20), 0.014, COL_STEEL, sides=8, tile="steel_brushed")
        g.rail((cx + 0.32, cy + sy * 0.86, z0 + 0.12), (cx + 0.32, cy + sy * 0.86, z0 + 0.50), 0.014, COL_STEEL, sides=8, tile="steel_brushed")
        g.rail((cx - 0.18, cy + sy * 0.86, z0 + 0.20), (cx - 0.22, cy + sy * 0.86, z0 + 0.94), 0.014, COL_STEEL, sides=8, tile="steel_brushed")
        g.rail((cx - 0.24, cy + sy * 0.86, z0 + 0.94), (cx - 0.35, cy + sy * 0.86, z0 + 0.94), 0.016, "282E34", sides=8, tile="rubber_dark")  # Push grip
        _box(g, (cx + 0.06, cy + sy * 0.86, z0 + 0.70), (0.44, 0.048, 0.032), "2E3640", "plastic_matte", bevel=0.005)  # Padded armrest
        # Footrest plate
        _box(g, (cx + 0.42, cy + sy * 0.42, z0 + 0.16), (0.14, 0.16, 0.018), COL_DARK_METAL, "iron_dark", bevel=0.003)

    # Navy sling seat & backrest canvas
    _box(g, (cx + 0.06, cy, z0 + 0.49), (0.46, 0.48, 0.036), "2B4664", "fabric_prop", bevel=0.006)
    _box(g, (cx - 0.19, cy, z0 + 0.72), (0.036, 0.48, 0.42), "2B4664", "fabric_prop", bevel=0.006)


def _add_medical_rounding_cart(g: MeshGroup, cx: float, cy: float, z0: float) -> None:
    """Mobile stainless & mint-white hospital rounding / medication cart (회진 카트)."""
    # 4 caster wheels grounded on z0
    for sx in (-0.30, 0.30):
        for sy in (-0.20, 0.20):
            _cyl_z(g, cx + sx, cy + sy, z0, z0 + 0.082, 0.038, 0.038, COL_DARK_METAL, "rubber_dark", sides=10)
    # Main medical cart cabinet body
    _box(g, (cx, cy, z0 + 0.50), (0.74, 0.50, 0.82), "ECF1F2", "enamel_gloss", bevel=0.008)
    _box(g, (cx, cy, z0 + 0.93), (0.78, 0.54, 0.036), "FFFFFF", "plastic_matte", bevel=0.005)  # Raised lip tray top
    # 4 color-coded medical drawers on corridor-facing front (-Y)
    drawer_cols = ("489AA2", "68B4BA", "D8E6E8", "D8E6E8")
    for di, dcol in enumerate(drawer_cols):
        dz = z0 + 0.78 - di * 0.18
        _box(g, (cx, cy - 0.256, dz), (0.64, 0.018, 0.145), dcol, "enamel_gloss", bevel=0.003)
        _box(g, (cx, cy - 0.272, dz + 0.02), (0.18, 0.016, 0.018), COL_STEEL, "steel_brushed", bevel=0.002)
    # Side stainless push handle bar
    g.rail((cx - 0.42, cy - 0.20, z0 + 0.92), (cx - 0.42, cy + 0.20, z0 + 0.92), 0.014, COL_STEEL, sides=8, tile="steel_brushed")
    for sy in (-0.20, 0.20):
        g.rail((cx - 0.37, cy + sy, z0 + 0.92), (cx - 0.42, cy + sy, z0 + 0.92), 0.012, COL_STEEL, sides=8, tile="steel_brushed")
    # Props on top of rounding cart: stainless kidney tray, chart clipboard, red sharps box, medicine bottles
    tz = z0 + 0.948
    _box(g, (cx - 0.14, cy, tz + 0.016), (0.24, 0.16, 0.028), COL_STEEL, "steel_brushed", bevel=0.004)
    _box(g, (cx + 0.18, cy + 0.10, tz + 0.085), (0.16, 0.14, 0.16), "D64238", "plastic_matte", bevel=0.004)  # Sharps container
    for bi, bx in enumerate((cx + 0.12, cx + 0.20, cx + 0.28)):
        _cyl_z(g, bx, cy - 0.10, tz, tz + 0.095, 0.022, 0.022, ("E8EEF2", "5AB2B8", "F0D472")[bi], "glass_prop", sides=8)


def _build_props_clutter(g: MeshGroup) -> None:
    # 1. Ward 302 Doorway Korean Signage Plaque (#156 tile="paper_label", color="FFFFFF" -> ALWAYS visible!)
    # "302호 병실 · 정숙 / 면회시간 12:00 ~ 14:00 · 손위생 필수"
    _box(g, (1.42, PART_Y - 0.095, FLOOR_Z + 1.54), (0.58, 0.024, 0.34), COL_TEAL_ACCENT, "aluminum_satin", bevel=0.003)
    _box(g, (1.42, PART_Y - 0.112, FLOOR_Z + 1.54), (0.54, 0.008, 0.30), "FFFFFF", "paper_label", bevel=0.0, uv_fit=True)
    # Wall-mounted hand sanitizer dispenser below sign
    _box(g, (1.42, PART_Y - 0.125, FLOOR_Z + 1.14), (0.12, 0.085, 0.22), "F0F4F5", "plastic_matte", bevel=0.005)
    # Second room notice plaque inside the ward near Bed #1
    _box(g, (-4.70, PART_Y + 0.095, FLOOR_Z + 1.52), (0.64, 0.022, 0.36), COL_TEAL_ACCENT, "aluminum_satin", bevel=0.003)
    _box(g, (-4.70, PART_Y + 0.110, FLOOR_Z + 1.52), (0.60, 0.008, 0.32), "FFFFFF", "paper_label", bevel=0.0, uv_fit=True)

    # 2. IV Drip Stands (IV 링거 스탠드/수액백) beside BOTH beds!
    _add_iv_drip_stand(g, -4.95, 2.95, FLOOR_Z)
    _add_iv_drip_stand(g, 1.05, 2.95, FLOOR_Z)

    # 3. Rolling Vital-Signs Patient Monitor (환자 모니터 / 심전도 화면) beside Hero Bed #1
    _add_patient_ecg_monitor(g, -4.65, 1.16, FLOOR_Z, rot_z=math.radians(52.0))
    # Crisp Hospital Analog Wall Clock mounted on Nurse Station back wall beside Rounding Schedule
    clk_x, clk_y, clk_z = 5.18, 1.88, FLOOR_Z + 1.62
    _add_wheel_ring(g, clk_x, clk_y, clk_z, radius=0.165, tube_r=0.018, color=COL_DARK_METAL, tile="aluminum_satin", axis_y=True, maj_segs=16, min_segs=6)
    _box(g, (clk_x, clk_y + 0.006, clk_z), (0.24, 0.016, 0.24), "F7F9FA", "enamel_gloss", bevel=0.002)
    g.rail((clk_x, clk_y - 0.010, clk_z), (clk_x, clk_y - 0.010, clk_z + 0.105), 0.005, COL_DARK_METAL, sides=6, tile="iron_dark")
    g.rail((clk_x + 0.008, clk_y - 0.014, clk_z), (clk_x + 0.082, clk_y - 0.014, clk_z + 0.038), 0.004, "C83832", sides=6, tile="iron_dark")

    # 4. Nightstand Props: Water Pitcher & Clear Cup (물병), Tissue Box, Medicine Cup
    nz = FLOOR_Z + 0.789
    # Bed #1 nightstand (-5.46, 0.96)
    _cyl_z(g, -5.42, 0.88, nz, nz + 0.21, 0.048, 0.036, "D6EDF4", "glass_prop", sides=10)  # Water pitcher
    _cyl_z(g, -5.36, 1.04, nz, nz + 0.095, 0.030, 0.034, "E4F2F6", "glass_prop", sides=10)  # Clear cup
    _box(g, (-5.56, 1.06, nz + 0.042), (0.13, 0.22, 0.082), "F2EFE8", "plastic_matte", bevel=0.004)  # Tissue box
    # Bed #2 nightstand (1.50, 0.96)
    _cyl_z(g, 1.46, 0.88, nz, nz + 0.20, 0.046, 0.035, "D6EDF4", "glass_prop", sides=10)
    _cyl_z(g, 1.44, 1.05, nz, nz + 0.092, 0.030, 0.034, "E4F2F6", "glass_prop", sides=10)

    # 5. Nurse Station Desk Props: 2 Monitors, Keyboards, Desktop Phone, Stacked Patient Chart Binders!
    ndz = FLOOR_Z + 0.770
    for mx in (3.12, 4.18):
        # Nurse workstation monitor facing North (+Y toward seated nurse)
        _box(g, (mx, -0.34, ndz + 0.012), (0.20, 0.14, 0.018), COL_DARK_METAL, "plastic_matte", bevel=0.002)
        _box(g, (mx, -0.36, ndz + 0.15), (0.036, 0.030, 0.26), COL_DARK_METAL, "iron_dark", bevel=0.002)
        _box(g, (mx, -0.33, ndz + 0.29), (0.50, 0.026, 0.30), COL_DARK_METAL, "plastic_matte", bevel=0.003)
        _box(g, (mx, -0.314, ndz + 0.29), (0.47, 0.006, 0.27), "244658", "glass_prop", bevel=0.0)
        # Keyboard + mouse
        _box(g, (mx, -0.14, ndz + 0.010), (0.34, 0.12, 0.016), "343C44", "plastic_matte", bevel=0.002)
    # Vertical Patient Chart Binder Rack on Nurse Station return wing (X = 2.28, Y = 0.65, Z = FLOOR_Z + 1.054)
    cz = FLOOR_Z + 1.054
    chart_cols = ("2876A8", "248E8C", "D46C5A", "3A6294", "489A72", "E2A83C")
    for ci, ccol in enumerate(chart_cols):
        _box(g, (2.28, 0.38 + ci * 0.056, cz + 0.155), (0.24, 0.042, 0.31), ccol, "plastic_matte", bevel=0.003)
    # Nurse desk telephone & sanitizer bottle on raised patient counter (Z = FLOOR_Z + 1.054)
    _box(g, (5.12, -0.62, cz + 0.042), (0.20, 0.18, 0.075), "2E363E", "plastic_matte", bevel=0.004)
    _cyl_z(g, 2.75, -0.64, cz, cz + 0.16, 0.036, 0.034, "E6F2F4", "plastic_matte", sides=10)

    # 6. Folding Hospital Wheelchair & Medical Rounding Cart in Corridor!
    _add_wheelchair(g, -3.55, -1.28, FLOOR_Z)
    _add_medical_rounding_cart(g, 1.38, -1.38, FLOOR_Z)


# ---------------------------------------------------------------------------
# Camera Presets & 6-View Contact Sheet Framing
# ---------------------------------------------------------------------------


def build_hospital_cameras() -> Dict[str, Any]:
    return {
        "ward_dialogue_35mm": {
            "label": "35mm 2인실 병실 대화",
            "lensMm": 35,
            "position": [-1.85, 1.48, -0.15],
            "target": [-4.45, 1.15, -2.05],
        },
        "corridor_nurse_28mm": {
            "label": "28mm 복도 & 간호 스테이션",
            "lensMm": 28,
            "position": [-4.40, 1.54, 2.38],
            "target": [3.85, 1.45, 0.45],
        },
        "nurse_station_50mm": {
            "label": "50mm 간호사실 접수 대면",
            "lensMm": 50,
            "position": [3.75, 1.50, 2.20],
            "target": [3.85, 1.35, -0.60],
        },
    }


def build_hospital_review_views() -> List[PreviewCameraView]:
    return [
        PreviewCameraView(
            key="front",
            label="1 FRONT CORRIDOR",
            location=(0.10, -10.80, 2.05),
            target=(0.10, 0.35, 1.40),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_South", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="side",
            label="2 SIDE WARD",
            location=(-10.60, 1.25, 2.05),
            target=(0.80, 1.25, 1.38),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_West", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="back",
            label="3 BACK CUTAWAY",
            location=(0.0, 10.60, 2.05),
            target=(0.0, -0.35, 1.38),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_North",),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(-9.40, -9.10, 6.25),
            target=(0.35, 0.45, 1.05),
            lens_mm=34.0,
            hide_nodes=("BG_Wall_South", "BG_Wall_West", "BG_Ceiling", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 CORRIDOR 35MM",
            location=(-4.95, -2.65, 1.56),
            target=(3.85, -0.65, 1.54),
            lens_mm=25.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(-0.25, -7.80, 12.10),
            target=(0.10, 0.25, 0.72),
            lens_mm=32.0,
            hide_nodes=("BG_Ceiling", "BG_Wall_South", "BG_Cutaway_Front"),
        ),
    ]


def build_scene_groups() -> HeroSceneGroups:
    groups = HeroSceneGroups()
    _build_floor_and_partitions(groups.floor)
    _build_wall_north(groups.wall_north)
    _build_wall_west(groups.wall_west)
    _build_wall_east(groups.wall_east)
    _build_wall_south(groups.wall_south)
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
    views = build_hospital_review_views()

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
        "dimensionsM": [ROOM_W, ROOM_D, ROOM_H],
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
        "cameras": build_hospital_cameras(),
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
