"""Hero Webtoon 3D Background v2 #1: Korean Modern Office Suite.

Asset slug: ``kr_modern_office_suite``
Real-world dimensions: ``12.00 x 8.50 x 3.20 m``
Zones:
  - North panoramic curtain wall with anodized mullions, top Venetian blinds,
    convector sill bench, and layered Seoul skyline backdrop outside
  - East glass-partitioned meeting room ("14F · 회의실 A") with walnut conference
    table, 6 ergonomic chairs, whiteboard (Korean sprint roadmap graphic),
    corner Monstera plant, and glowing analytics display
  - Center open-office 6-seat workstation island (2x3) with acoustic dividers,
    dual-arm monitors, keyboards, mice, 6 swivel chairs, document trays & mugs
  - North-West executive / team-lead corner with oak louver divider, L-shaped
    walnut desk, leather executive chair, visitor chairs, bookcase & trophies,
    and Ficus planter
  - South-East pantry bar with terrazzo counter, commercial espresso machine,
    stand water purifier (정수기), tall fridge, and lounge sofa with Palm plant
  - Ceiling with 6 recessed linear LED light bars, 2 four-way ceiling cassette
    air conditioners, and hanging green emergency exit sign

Headless execution (Blender 5.3):
  /Users/hjunkim/.local/bin/blender --background --factory-startup \
    --python-exit-code 42 --python tools/blender/webtoon_hero_bg/build_kr_modern_office.py
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
    add_door_frame,
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
# Spatial Constants & Curated Modern Korean Office Palette (metres, Z=0 base)
# ---------------------------------------------------------------------------

SLUG = "kr_modern_office_suite"
TITLE_KO = "현대 오피스 스위트 (대표실 · 오픈 오피스 · 유리 회의실)"
DEFAULT_OUT_DIR = REPO_ROOT / "apps/web/public/assets/3d/environments/hero-v2" / SLUG
DEFAULT_PREVIEW_DIR = REPO_ROOT / "loop-stack/v2-previews/bg"

ROOM_W = 12.000
ROOM_D = 8.500
ROOM_H = 3.200
HALF_W = ROOM_W * 0.5   # 6.000
HALF_D = ROOM_D * 0.5   # 4.250

FLOOR_Z = 0.100
CEIL_Z = 3.040
WALL_T = 0.180
WALL_BASE_Z = FLOOR_Z - 0.004
WALL_H = (CEIL_Z + 0.004) - WALL_BASE_Z

INNER_X_MIN = -HALF_W + WALL_T   # -5.820
INNER_X_MAX = HALF_W - WALL_T    # +5.820
INNER_Y_MIN = -HALF_D + WALL_T   # -4.070
INNER_Y_MAX = HALF_D - WALL_T    # +4.070

# Architectural palette (bright, crisp webtoon daylight office — zero dark caves)
COL_WALL_LIGHT = "F2F3F5"
COL_WALL_ACCENT = "E5E9EF"
COL_CONCRETE_TRIM = "D8DCE2"
COL_FLOOR_OAK = "D3B48C"
COL_FLOOR_CARPET_A = "BCC4CE"
COL_FLOOR_CARPET_B = "AEB7C2"
COL_FLOOR_PANTRY = "E4E2DC"
COL_MULLION = "39404A"
COL_ALU_SATIN = "C8CFD6"
COL_BLIND_WHITE = "ECEFF2"
COL_WALNUT = "76553C"
COL_OAK = "CBA474"
COL_BIRCH = "E4CEAC"
COL_DESK_WHITE = "F2F4F7"
COL_PARTITION_BLUE = "6B839B"
COL_CHAIR_DARK = "363C44"
COL_CHAIR_MESH = "4E5966"
COL_LEATHER_EXEC = "4B3A32"
COL_SOFA_BEIGE = "D6CFC3"
COL_PANTRY_SAGE = "6D857B"
COL_COUNTER_TOP = "EFECE6"
COL_STEEL = "CDD3D9"
COL_BRASS = "CFAF64"
COL_SCREEN_DARK = "1C2430"
COL_GLASS_FROST = "D9E6EE"
COL_CEIL_WHITE = "F5F6F8"
COL_CEIL_GRID = "DCE0E5"


# ---------------------------------------------------------------------------
# Quantization-Safe Watertight Helpers (0 welded / 0 degenerate triangles)
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
    sides: int = 12,
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


def _lathe_z(
    g: MeshGroup,
    cx: float,
    cy: float,
    profile_rz: Sequence[Tuple[float, float]],
    color: str,
    tile: str,
    sides: int = 12,
) -> None:
    rings = [
        [(cx + max(0.0025, r) * math.cos(math.tau * i / sides), cy + max(0.0025, r) * math.sin(math.tau * i / sides), z) for i in range(sides)]
        for (r, z) in profile_rz
    ]
    g.rings(rings, color=color, tile=tile)


# ---------------------------------------------------------------------------
# 1. Floor, Carpet Zones, Glass Meeting Room Partition & Executive Louvers
# ---------------------------------------------------------------------------


def _build_floor_and_partitions(g: MeshGroup) -> None:
    # Base structural slab grounded strictly at Z = 0.000
    _box(g, (0.0, 0.0, FLOOR_Z * 0.5 - 0.006), (ROOM_W, ROOM_D, FLOOR_Z - 0.012), "B8BDC4", "concrete", bevel=0.004)

    # 3 distinct architectural flooring finishes sitting flush on Z = FLOOR_Z (inset 4mm from each other -> 0 welded edges)
    finish_h = 0.014
    finish_zc = FLOOR_Z - finish_h * 0.5
    # Executive + Open Office warm oak wood flooring (West + Center-North)
    _box(g, (-1.85, 0.0, finish_zc), (8.18, ROOM_D - 0.06, finish_h), COL_FLOOR_OAK, "floor_wood", bevel=0.0)
    # Glass Meeting Room cool acoustic carpet tile zone (East-North: X in [2.30, 5.95], Y in [-0.28, 4.20])
    _box(g, (4.12, 1.96, finish_zc + 0.001), (3.58, 4.42, finish_h), COL_FLOOR_CARPET_A, "carpet", bevel=0.0)
    # Pantry & South-East circulation terrazzo tile zone (X in [2.30, 5.95], Y in [-4.20, -0.34])
    _box(g, (4.12, -2.26, finish_zc), (3.58, 3.80, finish_h), COL_FLOOR_PANTRY, "tile_ceramic", bevel=0.0)

    # Woven accent rug under Executive visitor chairs & Lounge sofa (4mm proud -> zero Z-fighting)
    _box(g, (-4.05, 1.65, FLOOR_Z + 0.005), (2.45, 1.95, 0.010), "B8B0A4", "carpet", bevel=0.003)
    _box(g, (-0.30, -2.92, FLOOR_Z + 0.005), (2.50, 1.55, 0.010), COL_FLOOR_CARPET_B, "carpet", bevel=0.003)

    # --- Glass-Partitioned Meeting Room ("14F · 회의실 A") Frame (in BG_Floor -> always crisp!) ---
    # West glass partition along X = 2.32, Y in [-0.28, 4.04]
    part_h = CEIL_Z - FLOOR_Z - 0.006
    part_zc = FLOOR_Z + part_h * 0.5 + 0.003
    # Bottom & top anodized aluminum tracks along West glass line
    _box(g, (2.32, 1.88, FLOOR_Z + 0.028), (0.064, 4.30, 0.056), COL_MULLION, "sash_metal", bevel=0.003)
    _box(g, (2.32, 1.88, CEIL_Z - 0.032), (0.064, 4.30, 0.056), COL_MULLION, "sash_metal", bevel=0.003)
    # Vertical slim mullions along X = 2.32 (leaving glazing OPEN AIR so sightlines remain 100% clear!)
    for my in (-0.25, 0.82, 1.88, 2.95, 4.01):
        _box(g, (2.32, my, part_zc), (0.052, 0.048, part_h - 0.116), COL_MULLION, "sash_metal", bevel=0.003)
    # Horizontal frosted privacy decal stripe (3 thin parallel bars at Z=1.18..1.38m -> iconic Korean office glass!)
    for bay_y in (0.285, 1.350, 2.415, 3.480):
        for fz in (FLOOR_Z + 1.08, FLOOR_Z + 1.18, FLOOR_Z + 1.28):
            _box(g, (2.32, bay_y, fz), (0.014, 0.99, 0.045), COL_GLASS_FROST, "glass_tinted", bevel=0.0)
    # Upper transom bar along X = 2.32
    _box(g, (2.32, 1.88, FLOOR_Z + 2.26), (0.048, 4.22, 0.038), COL_MULLION, "sash_metal", bevel=0.003)

    # South glass front of Meeting Room along Y = -0.28, X in [2.36, 5.80]
    # Open entry doorway at X in [2.56, 3.52], glazed bays at X in [3.52, 5.80]
    _box(g, (4.66, -0.28, FLOOR_Z + 0.028), (2.26, 0.064, 0.056), COL_MULLION, "sash_metal", bevel=0.003)
    _box(g, (4.08, -0.28, CEIL_Z - 0.032), (3.44, 0.064, 0.056), COL_MULLION, "sash_metal", bevel=0.003)
    _box(g, (4.08, -0.28, FLOOR_Z + 2.26), (3.40, 0.054, 0.044), COL_MULLION, "sash_metal", bevel=0.003)
    for mx in (2.54, 3.54, 4.67, 5.77):
        _box(g, (mx, -0.28, part_zc), (0.052, 0.054, part_h - 0.116), COL_MULLION, "sash_metal", bevel=0.003)
    for bay_x in (4.105, 5.220):
        for fz in (FLOOR_Z + 1.08, FLOOR_Z + 1.18, FLOOR_Z + 1.28):
            _box(g, (bay_x, -0.28, fz), (1.05, 0.014, 0.045), COL_GLASS_FROST, "glass_tinted", bevel=0.0)

    # Half-open glass meeting room door leaf pivoted at (2.57, -0.28) swung +38 deg into room
    door_orig = (2.57, -0.28, FLOOR_Z + 0.012)
    door_yaw = math.radians(38.0)
    dh = 2.18
    dw = 0.92
    _lbox(g, door_orig, door_yaw, 0.022, 0.0, dh * 0.5, 0.044, 0.040, dh, COL_MULLION, "sash_metal")
    _lbox(g, door_orig, door_yaw, dw - 0.022, 0.0, dh * 0.5, 0.044, 0.040, dh, COL_MULLION, "sash_metal")
    _lbox(g, door_orig, door_yaw, dw * 0.5, 0.0, 0.035, dw - 0.092, 0.040, 0.070, COL_MULLION, "sash_metal")
    _lbox(g, door_orig, door_yaw, dw * 0.5, 0.0, dh - 0.028, dw - 0.092, 0.040, 0.056, COL_MULLION, "sash_metal")
    _lbox(g, door_orig, door_yaw, dw * 0.5, 0.0, 1.14, dw - 0.096, 0.014, 0.11, COL_GLASS_FROST, "glass_tinted", bevel=0.0)
    # Brushed steel vertical pull handle on both sides of glass door
    for sy in (-0.042, 0.042):
        _lbox(g, door_orig, door_yaw, dw - 0.09, sy, 1.04, 0.022, 0.022, 0.42, COL_ALU_SATIN, "hardware_brass")

    # --- Executive Corner Wooden Slatted Louver Screen (X = -2.42, Y in [1.35, 4.02]) ---
    _box(g, (-2.42, 2.68, FLOOR_Z + 0.030), (0.085, 2.66, 0.060), COL_WALNUT, "wood_panel", bevel=0.004)
    _box(g, (-2.42, 2.68, FLOOR_Z + 2.18), (0.085, 2.66, 0.060), COL_WALNUT, "wood_panel", bevel=0.004)
    for i in range(13):
        ly = 1.42 + i * 0.210
        _box(g, (-2.42, ly, FLOOR_Z + 1.105), (0.072, 0.036, 2.08), COL_OAK, "wood_panel", bevel=0.003)


# ---------------------------------------------------------------------------
# 2. Perimeter Walls (North Curtain Wall + Skyline, East Whiteboard, West, South)
# ---------------------------------------------------------------------------


def _build_wall_north(g: MeshGroup) -> None:
    """Panoramic full-height curtain wall + top Venetian blinds + Seoul skyline backdrop."""
    # Low solid perimeter spandrel wall & convector sill bench (Z = FLOOR_Z..0.52m)
    _box(g, (0.0, HALF_D - WALL_T * 0.5, FLOOR_Z + 0.20), (ROOM_W - 0.01, WALL_T, 0.42), COL_WALL_LIGHT, "plaster")
    # Crisp marble/laminate window sill ledge along entire North curtain wall
    _box(g, (0.0, INNER_Y_MAX - 0.06, FLOOR_Z + 0.43), (ROOM_W - 0.38, 0.24, 0.038), COL_CONCRETE_TRIM, "marble")
    # Slim recessed convector grille strip on sill
    for cx in (-4.4, -1.8, 0.8, 3.8):
        _box(g, (cx, INNER_Y_MAX - 0.05, FLOOR_Z + 0.454), (1.45, 0.085, 0.012), COL_MULLION, "sash_metal", bevel=0.0)

    # Top curtain-wall head soffit beam
    _box(g, (0.0, HALF_D - WALL_T * 0.5, CEIL_Z - 0.065), (ROOM_W - 0.01, WALL_T, 0.14), COL_MULLION, "sash_metal")

    # 7 heavy architectural aluminum vertical curtain-wall mullions (6 wide panoramic bays)
    mullion_xs = (-5.88, -3.92, -1.96, 0.0, 1.96, 3.92, 5.88)
    mull_h = (CEIL_Z - 0.135) - (FLOOR_Z + 0.448)
    mull_zc = (FLOOR_Z + 0.448) + mull_h * 0.5
    for mx in mullion_xs:
        _box(g, (mx, HALF_D - WALL_T * 0.5, mull_zc), (0.095, WALL_T + 0.016, mull_h), COL_MULLION, "sash_metal", bevel=0.004)

    # Horizontal upper transom rail across all 6 bays at Z = 2.48m
    _box(g, (0.0, HALF_D - WALL_T * 0.5, 2.48), (ROOM_W - 0.24, 0.12, 0.052), COL_MULLION, "sash_metal")

    # Half-raised crisp horizontal Venetian blinds in upper zone (Z = 2.54..2.88m) — zero sightline blockage!
    for bi in range(6):
        bx = 0.5 * (mullion_xs[bi] + mullion_xs[bi + 1])
        bw = (mullion_xs[bi + 1] - mullion_xs[bi]) - 0.14
        # Top blind headrail cassette
        _box(g, (bx, INNER_Y_MAX + 0.03, CEIL_Z - 0.16), (bw, 0.048, 0.042), COL_ALU_SATIN, "sash_metal", bevel=0.003)
        # 6 crisp louvered horizontal blind slats stacked cleanly at top of window
        for si in range(6):
            sz = (CEIL_Z - 0.215) - si * 0.052
            _box(g, (bx, INNER_Y_MAX + 0.03, sz), (bw - 0.02, 0.032, 0.010), COL_BLIND_WHITE, "trim_paint", bevel=0.0)

    # Stylized Seoul High-Rise Skyline Silhouette Backdrop outside North curtain wall (Y = +4.34..+4.46)
    # Layered Gangnam/Yeouido glass towers in airy atmospheric blue-gray with gaps for daylight sky!
    skyline_towers = [
        # (cx, width, height, y_off, color)
        (-4.95, 1.15, 2.55, 4.38, "9CB1C6"),
        (-3.55, 0.88, 1.95, 4.44, "B2C4D6"),
        (-2.35, 1.10, 2.75, 4.38, "8FA7BF"),
        (-0.85, 0.92, 2.25, 4.44, "A8BDD0"),
        (0.55, 1.25, 2.85, 4.38, "8CA4BC"),
        (2.15, 0.95, 2.10, 4.44, "AEC1D4"),
        (3.55, 1.18, 2.68, 4.38, "96ACC2"),
        (5.05, 1.05, 2.35, 4.44, "A5BACE"),
    ]
    for tx, tw, th, ty, tcol in skyline_towers:
        _box(g, (tx, ty, FLOOR_Z + th * 0.5), (tw, 0.055, th), tcol, "concrete", bevel=0.003)
        # Crisp facade window bands on each distant tower (4mm proud toward -Y)
        n_floors = max(3, int(th / 0.34))
        for fl in range(1, n_floors):
            fz = FLOOR_Z + fl * 0.30
            if fz < FLOOR_Z + th - 0.14:
                _box(g, (tx, ty - 0.034, fz), (tw - 0.14, 0.012, 0.11), "D6E6F2", "glass_tinted", bevel=0.0)
    # Iconic slender rooftop spire on tallest central tower (Namsan/Lotte Seoul vibe)
    _cyl_z(g, 0.55, 4.38, FLOOR_Z + 2.84, FLOOR_Z + 3.08, 0.032, 0.012, "B8C8D8", "sash_metal", sides=8)


def _build_wall_east(g: MeshGroup) -> None:
    """East solid wall housing the Meeting Room Whiteboard (#156 graphic) & Pantry backsplash."""
    # Wall spans strictly inside North/South inner faces (zero corner welded edges)
    add_wall_with_openings(
        g,
        center=(HALF_W - WALL_T * 0.5, 0.0, WALL_BASE_Z),
        length=ROOM_D - WALL_T * 2.0 - 0.006,
        thickness=WALL_T,
        height=WALL_H,
        openings=(),
        rot_z=-math.pi * 0.5,
        color=COL_WALL_LIGHT,
        tile="plaster",
        baseboard_height=0.085,
        baseboard_depth=0.016,
        baseboard_color="D8DCE2",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color="E8EBEF",
        interior_side=-1,
    )

    # Meeting Room Hero Whiteboard (#156 _paint_office_whiteboard on tile="chalkboard", color="FFFFFF")
    wb_y = 1.88
    wb_z = FLOOR_Z + 1.48
    wb_w = 2.35
    wb_h = 1.18
    # Aluminum perimeter frame
    _box(g, (INNER_X_MAX - 0.022, wb_y, wb_z), (0.032, wb_w + 0.06, wb_h + 0.06), COL_ALU_SATIN, "sash_metal", bevel=0.004)
    # Whiteboard graphic face (facing -X, bevel=0.0, color="FFFFFF", tile="chalkboard", uv_fit=True!)
    _box(g, (INNER_X_MAX - 0.044, wb_y, wb_z), (0.012, wb_w, wb_h), "FFFFFF", "chalkboard", bevel=0.0, uv_fit=True)
    # Marker tray below whiteboard + 3 colored whiteboard markers + eraser
    _box(g, (INNER_X_MAX - 0.062, wb_y, wb_z - wb_h * 0.5 - 0.038), (0.072, wb_w * 0.72, 0.022), COL_ALU_SATIN, "sash_metal", bevel=0.003)
    for mi, mcol in enumerate(("2452A4", "C4342D", "222830")):
        _box(g, (INNER_X_MAX - 0.068, wb_y - 0.45 + mi * 0.16, wb_z - wb_h * 0.5 - 0.018), (0.018, 0.125, 0.018), mcol, "trim_paint", bevel=0.002)
    _box(g, (INNER_X_MAX - 0.068, wb_y + 0.35, wb_z - wb_h * 0.5 - 0.012), (0.042, 0.135, 0.030), "3B4652", "trim_paint", bevel=0.003)

    # Pantry Zone East Wall Ceramic Subway-Tile Backsplash (Y in [-3.95, -1.25], Z = 0.90..1.72m)
    _box(g, (INNER_X_MAX - 0.012, -2.60, FLOOR_Z + 1.24), (0.018, 2.65, 0.86), "EFF2F0", "tile_ceramic", bevel=0.003)

    # Meeting Room Dark TV Backing Plate (above whiteboard/south corner of meeting room at Y = 0.20? No, keep whiteboard hero centered and place TV on North-East? Or keep whiteboard huge & clean!)
    # Let's place a sleek framed presentation display on the East wall South of the glass partition (corridor info board at Y = -0.95)
    _box(g, (INNER_X_MAX - 0.024, -0.95, FLOOR_Z + 1.56), (0.036, 0.98, 0.62), COL_CHAIR_DARK, "sash_metal", bevel=0.004)
    _box(g, (INNER_X_MAX - 0.046, -0.95, FLOOR_Z + 1.56), (0.010, 0.90, 0.54), COL_SCREEN_DARK, "glass_tinted", bevel=0.0)


def _build_wall_west(g: MeshGroup) -> None:
    """West executive & lounge accent wall with subtle oak architectural paneling."""
    add_wall_with_openings(
        g,
        center=(-HALF_W + WALL_T * 0.5, 0.0, WALL_BASE_Z),
        length=ROOM_D - WALL_T * 2.0 - 0.006,
        thickness=WALL_T,
        height=WALL_H,
        openings=(),
        rot_z=math.pi * 0.5,
        color=COL_WALL_LIGHT,
        tile="plaster",
        baseboard_height=0.085,
        baseboard_depth=0.016,
        baseboard_color="D8DCE2",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color="E8EBEF",
        interior_side=-1,
    )
    # Warm vertical oak architectural wall paneling behind Executive corner (Y in [0.50, 3.92])
    for i in range(11):
        py = 0.68 + i * 0.305
        _box(g, (INNER_X_MIN + 0.018, py, FLOOR_Z + 1.48), (0.024, 0.275, 2.74), COL_OAK, "wood_panel", bevel=0.003)
    # Subtle executive wall art triptych frames along South-West lounge wall (Y in [-3.40, -1.00])
    for fy in (-2.95, -2.20, -1.45):
        _box(g, (INNER_X_MIN + 0.020, fy, FLOOR_Z + 1.54), (0.028, 0.56, 0.72), COL_WALNUT, "door_wood", bevel=0.004)
        _box(g, (INNER_X_MIN + 0.038, fy, FLOOR_Z + 1.54), (0.010, 0.48, 0.64), "ECE7DC", "plaster", bevel=0.0)
        _box(g, (INNER_X_MIN + 0.046, fy, FLOOR_Z + 1.58), (0.008, 0.26, 0.26), "4D6D8A" if fy < -2.0 else "C68456", "trim_paint", bevel=0.0)


def _build_wall_south(g: MeshGroup) -> None:
    """South entry wall with double glass/wood office entrance doors & reception branding backdrop."""
    add_wall_with_openings(
        g,
        center=(0.0, -HALF_D + WALL_T * 0.5, WALL_BASE_Z),
        length=ROOM_W,
        thickness=WALL_T,
        height=WALL_H,
        openings=(
            WallOpening(offset_x=3.80, width=1.64, height=2.24, sill_z=0.0, kind="door"),  # local +X -> world -X (-3.80) because rot_z=pi!
        ),
        rot_z=math.pi,
        color=COL_WALL_ACCENT,
        tile="plaster",
        baseboard_height=0.085,
        baseboard_depth=0.016,
        baseboard_color="D8DCE2",
        crown_height=0.055,
        crown_depth=0.018,
        crown_color="E8EBEF",
        interior_side=-1,
    )
    # Double entrance door framing at world X = -3.80, Y = -HALF_D + WALL_T*0.5
    add_door_frame(
        g,
        center=(-4.20, -HALF_D + WALL_T * 0.5, FLOOR_Z),
        width=0.84,
        height=2.22,
        wall_thickness=WALL_T,
        rot_z=math.pi,
        open_deg=18.0,
        hinge_left=True,
        frame_color=COL_MULLION,
        frame_tile="sash_metal",
        leaf_color=COL_WALNUT,
        leaf_tile="door_wood",
        handle_color=COL_ALU_SATIN,
        handle_tile="hardware_brass",
    )
    add_door_frame(
        g,
        center=(-3.38, -HALF_D + WALL_T * 0.5, FLOOR_Z),
        width=0.84,
        height=2.22,
        wall_thickness=WALL_T,
        rot_z=math.pi,
        open_deg=0.0,
        hinge_left=False,
        frame_color=COL_MULLION,
        frame_tile="sash_metal",
        leaf_color=COL_WALNUT,
        leaf_tile="door_wood",
        handle_color=COL_ALU_SATIN,
        handle_tile="hardware_brass",
    )
    # Architectural wooden feature wall slats behind South lounge sofa (X in [-1.85, +1.55])
    for i in range(14):
        sx = -1.70 + i * 0.245
        _box(g, (sx, INNER_Y_MIN + 0.022, FLOOR_Z + 1.44), (0.042, 0.032, 2.68), COL_OAK, "wood_panel", bevel=0.003)


# ---------------------------------------------------------------------------
# 3. Ceiling: Recessed Linear LEDs, 2 System Air Conditioners, Exit & Analytics
# ---------------------------------------------------------------------------


def _build_ceiling(g: MeshGroup) -> None:
    # Main architectural acoustic ceiling slab (Z = 3.04..3.20)
    slab_h = ROOM_H - CEIL_Z
    _box(g, (0.0, 0.0, CEIL_Z + slab_h * 0.5), (ROOM_W, ROOM_D, slab_h), COL_CEIL_WHITE, "ceiling_plaster", bevel=0.004)

    # Exposed subtle acoustic T-bar grid beams (12mm relief below ceiling soffit)
    for gx in (-4.0, -2.0, 0.0, 2.0, 4.0):
        _box(g, (gx, 0.0, CEIL_Z - 0.010), (0.055, ROOM_D - 0.42, 0.020), COL_CEIL_GRID, "ceiling_beam", bevel=0.0025)
    for gy in (-2.0, 0.0, 2.0):
        _box(g, (0.0, gy, CEIL_Z - 0.014), (ROOM_W - 0.42, 0.055, 0.016), COL_CEIL_GRID, "ceiling_beam", bevel=0.0025)

    # 6 Recessed Linear Architectural LED Bar Fixtures (emissive_cool — bright modern office!)
    led_positions = [
        (-4.10, 2.15, 2.40, 0.14),   # Executive suite
        (-0.15, 2.25, 3.60, 0.14),   # Open office North bay
        (-0.15, 0.25, 3.60, 0.14),   # Open office South bay
        (4.15, 1.85, 2.50, 0.14),    # Glass meeting room
        (-0.30, -2.45, 3.20, 0.14),  # South lounge
        (4.10, -2.45, 2.40, 0.14),   # Pantry zone
    ]
    for lx, ly, lw, ld in led_positions:
        _box(g, (lx, ly, CEIL_Z - 0.022), (lw + 0.05, ld + 0.05, 0.024), COL_CEIL_GRID, "ceiling_metal", bevel=0.003)
        _box(g, (lx, ly, CEIL_Z - 0.038), (lw, ld, 0.014), "FFFFFF", "emissive_cool", bevel=0.0)

    # 2 Four-Way Ceiling Cassette System Air Conditioners (시스템 에어컨)
    for ac_x, ac_y in ((-1.10, 1.25), (3.85, -1.65)):
        _box(g, (ac_x, ac_y, CEIL_Z - 0.028), (0.94, 0.94, 0.048), "ECEFF2", "ceiling_plaster", bevel=0.005)
        _box(g, (ac_x, ac_y, CEIL_Z - 0.056), (0.52, 0.52, 0.016), "D8DEE4", "ceiling_metal", bevel=0.0025)
        # 4 directional discharge louvers around perimeter
        for ox, oy, sx, sy in (
            (0.0, 0.36, 0.62, 0.075),
            (0.0, -0.36, 0.62, 0.075),
            (0.36, 0.0, 0.075, 0.62),
            (-0.36, 0.0, 0.075, 0.62),
        ):
            _box(g, (ac_x + ox, ac_y + oy, CEIL_Z - 0.054), (sx, sy, 0.014), "B8C0C8", "ceiling_metal", bevel=0.0)

    # Hanging Illuminated Korean Emergency Exit Sign ("비상구 / EXIT") above South entrance door
    ex_x, ex_y, ex_z = -3.78, -3.55, CEIL_Z - 0.30
    for dx in (-0.16, 0.16):
        g.rail((ex_x + dx, ex_y, CEIL_Z - 0.01), (ex_x + dx, ex_y, ex_z + 0.105), 0.008, COL_ALU_SATIN, sides=8, tile="ceiling_metal")
    _box(g, (ex_x, ex_y, ex_z), (0.48, 0.048, 0.21), "EAEEF0", "ceiling_metal", bevel=0.003)
    _box(g, (ex_x, ex_y + 0.028, ex_z), (0.44, 0.008, 0.175), "FFFFFF", "emissive_exit_green", bevel=0.0, uv_fit=True)
    _box(g, (ex_x, ex_y - 0.028, ex_z), (0.44, 0.008, 0.175), "FFFFFF", "emissive_exit_green", bevel=0.0, uv_fit=True)

    # Glowing Analytics Dashboard TV Screen over East Wall backing plate (visible when ceiling active)
    _box(g, (INNER_X_MAX - 0.054, -0.95, FLOOR_Z + 1.56), (0.008, 0.88, 0.52), "FFFFFF", "emissive_neon", bevel=0.0, uv_fit=True)


# ---------------------------------------------------------------------------
# 4. Hero Furniture: 6 Workstations, Ergonomic Chairs, Meeting Table, Exec Desk, Pantry
# ---------------------------------------------------------------------------


def _add_ergonomic_office_chair(
    g: MeshGroup,
    cx: float,
    cy: float,
    z0: float,
    rot_z: float,
    *,
    fabric_col: str = COL_CHAIR_MESH,
    high_back: bool = False,
) -> None:
    """Ergonomic 5-star swivel office chair facing local +Y (backrest at -Y)."""
    orig = (cx, cy, z0)
    # 5-star caster base + 5 small wheel pods grounded on z0
    _cyl_z(g, cx, cy, z0 + 0.048, z0 + 0.435, 0.024, 0.022, COL_CHAIR_DARK, "metal_leg_dark", sides=10)
    for k in range(5):
        ang = rot_z + math.tau * k / 5.0
        wx = cx + 0.255 * math.cos(ang)
        wy = cy + 0.255 * math.sin(ang)
        g.rail((cx, cy, z0 + 0.068), (wx, wy, z0 + 0.044), 0.014, COL_CHAIR_DARK, sides=8, tile="metal_leg_dark")
        _cyl_z(g, wx, wy, z0, z0 + 0.044, 0.022, 0.022, "262A30", "metal_leg_dark", sides=8)

    # Contoured upholstered seat cushion
    _lbox(g, orig, rot_z, 0.0, 0.015, 0.462, 0.48, 0.46, 0.056, fabric_col, "leather" if high_back else "fabric_linen", bevel=0.012)
    # Armrests (T-shaped brackets + padded tops)
    for sx in (-1.0, 1.0):
        _lbox(g, orig, rot_z, sx * 0.255, -0.02, 0.56, 0.026, 0.036, 0.19, COL_CHAIR_DARK, "metal_leg_dark", bevel=0.003)
        _lbox(g, orig, rot_z, sx * 0.258, 0.01, 0.665, 0.056, 0.25, 0.026, COL_CHAIR_DARK, "leather", bevel=0.005)
    # Spine bar + contoured mesh/leather backrest (+ headrest if executive high_back)
    back_h = 0.56 if high_back else 0.44
    _lbox(g, orig, rot_z, 0.0, -0.215, 0.56, 0.065, 0.032, 0.22, COL_CHAIR_DARK, "metal_leg_dark", bevel=0.004)
    _lbox(g, orig, rot_z, 0.0, -0.232, 0.50 + back_h * 0.5, 0.45, 0.044, back_h, fabric_col, "leather" if high_back else "fabric_linen", bevel=0.010)
    if high_back:
        _lbox(g, orig, rot_z, 0.0, -0.230, 0.50 + back_h + 0.095, 0.28, 0.052, 0.13, fabric_col, "leather", bevel=0.012)


def _add_workstation_desk(
    g: MeshGroup,
    cx: float,
    cy: float,
    z0: float,
    facing_north: bool,
) -> None:
    """Modern Korean office workstation desk (1.28 x 0.72 x 0.74m) + pedestal + acoustic screen."""
    rot_z = 0.0 if facing_north else math.pi
    orig = (cx, cy, z0)
    w, d, h = 1.26, 0.72, 0.74
    # Matte laminate desktop
    _lbox(g, orig, rot_z, 0.0, 0.0, h - 0.015, w, d, 0.030, COL_DESK_WHITE, "laminate_matte", bevel=0.004)
    # Recessed cable grommet slot at rear
    _lbox(g, orig, rot_z, 0.0, d * 0.5 - 0.075, h + 0.004, 0.22, 0.052, 0.008, COL_ALU_SATIN, "metal_leg_steel", bevel=0.0)
    # Powder-coated loop-frame steel legs at both sides
    for sx in (-1.0, 1.0):
        lx = sx * (w * 0.5 - 0.042)
        _lbox(g, orig, rot_z, lx, -d * 0.5 + 0.055, (h - 0.030) * 0.5, 0.044, 0.044, h - 0.030, COL_ALU_SATIN, "metal_leg_steel")
        _lbox(g, orig, rot_z, lx, d * 0.5 - 0.055, (h - 0.030) * 0.5, 0.044, 0.044, h - 0.030, COL_ALU_SATIN, "metal_leg_steel")
        _lbox(g, orig, rot_z, lx, 0.0, 0.024, 0.044, d - 0.15, 0.036, COL_ALU_SATIN, "metal_leg_steel")
    # Mobile 3-drawer under-desk pedestal tucked cleanly on right side
    ped_x = w * 0.5 - 0.28
    _lbox(g, orig, rot_z, ped_x, -0.02, 0.30, 0.39, 0.52, 0.56, "E5E8ED", "laminate_matte", bevel=0.004)
    for di, dz in enumerate((0.12, 0.29, 0.46)):
        _lbox(g, orig, rot_z, ped_x, -0.286, dz, 0.35, 0.014, 0.14, "EEF0F4", "laminate_matte", bevel=0.0025)
        _lbox(g, orig, rot_z, ped_x, -0.298, dz + 0.035, 0.11, 0.012, 0.014, COL_ALU_SATIN, "metal_leg_steel", bevel=0.0)
    # Fabric acoustic partition screen along rear edge (+Y in local frame)
    _lbox(g, orig, rot_z, 0.0, d * 0.5 - 0.018, h + 0.215, w - 0.04, 0.028, 0.41, COL_PARTITION_BLUE, "fabric_linen", bevel=0.005)
    # Side mini privacy wing on outer right edge
    _lbox(g, orig, rot_z, w * 0.5 - 0.016, 0.14, h + 0.145, 0.024, 0.36, 0.27, COL_PARTITION_BLUE, "fabric_linen", bevel=0.004)


def _build_furniture_hero(g: MeshGroup) -> None:
    # 1. Open Office 6-Seat Workstation Island (2 back-to-back rows x 3 seats)
    desk_xs = (-1.45, -0.15, 1.15)
    chair_yaws_south = (math.radians(8.0), math.radians(-6.0), math.radians(11.0))
    chair_yaws_north = (math.radians(-10.0), math.radians(7.0), math.radians(-8.0))
    for i, dx in enumerate(desk_xs):
        # Row A (South row, facing North toward partition at Y = 0.85)
        _add_workstation_desk(g, dx, 0.46, FLOOR_Z, facing_north=True)
        _add_ergonomic_office_chair(g, dx + 0.02, -0.16, FLOOR_Z, rot_z=chair_yaws_south[i])
        # Row B (North row, facing South toward partition at Y = 0.89)
        _add_workstation_desk(g, dx, 1.24, FLOOR_Z, facing_north=False)
        _add_ergonomic_office_chair(g, dx - 0.02, 1.86, FLOOR_Z, rot_z=math.pi + chair_yaws_north[i])

    # 2. Glass Meeting Room Large Walnut Conference Table + 6 Chairs (center at X=4.12, Y=1.88)
    mt_x, mt_y = 4.12, 1.88
    mt_w, mt_d, mt_h = 1.28, 2.48, 0.74
    _box(g, (mt_x, mt_y, FLOOR_Z + mt_h - 0.020), (mt_w, mt_d, 0.040), COL_WALNUT, "wood_walnut", bevel=0.006)
    # Recessed brushed-steel power/HDMI hub in center of conference table
    _box(g, (mt_x, mt_y, FLOOR_Z + mt_h + 0.004), (0.18, 0.44, 0.010), COL_ALU_SATIN, "metal_leg_steel", bevel=0.0)
    # Twin sculpted architectural V-pedestal legs
    for py in (mt_y - 0.72, mt_y + 0.72):
        _box(g, (mt_x, py, FLOOR_Z + 0.35), (0.64, 0.14, 0.68), COL_CHAIR_DARK, "metal_leg_dark", bevel=0.005)
        _box(g, (mt_x, py, FLOOR_Z + 0.020), (0.78, 0.36, 0.040), COL_CHAIR_DARK, "metal_leg_dark", bevel=0.004)
    # 6 meeting chairs (3 West side facing East, 3 East side facing West)
    for ci, cy in enumerate((mt_y - 0.80, mt_y, mt_y + 0.80)):
        _add_ergonomic_office_chair(g, mt_x - 0.82, cy, FLOOR_Z, rot_z=-math.pi * 0.5 + math.radians((ci - 1) * 7.0), fabric_col="596574")
        _add_ergonomic_office_chair(g, mt_x + 0.82, cy, FLOOR_Z, rot_z=math.pi * 0.5 - math.radians((ci - 1) * 6.0), fabric_col="596574")

    # 3. Executive / Team Lead Corner Suite (North-West: X in [-5.65, -2.65], Y in [0.90, 3.85])
    ex_x, ex_y = -4.05, 2.75
    # Main walnut executive desk (1.85 x 0.86 x 0.75m) facing South (-Y)
    _box(g, (ex_x, ex_y, FLOOR_Z + 0.73), (1.85, 0.86, 0.044), COL_WALNUT, "wood_walnut", bevel=0.006)
    _box(g, (ex_x, ex_y - 0.32, FLOOR_Z + 0.39), (1.68, 0.042, 0.58), COL_WALNUT, "wood_walnut", bevel=0.004)  # Modesty panel
    for sx in (-0.84, 0.84):
        _box(g, (ex_x + sx, ex_y, FLOOR_Z + 0.355), (0.068, 0.78, 0.708), COL_CHAIR_DARK, "metal_leg_dark", bevel=0.004)
    # Side return credenza along East side of executive desk (X = -3.12, Y = 3.22)
    _box(g, (-3.14, 3.38, FLOOR_Z + 0.34), (0.50, 1.18, 0.68), COL_WALNUT, "wood_walnut", bevel=0.005)
    # High-back executive leather swivel chair behind desk
    _add_ergonomic_office_chair(g, ex_x, ex_y + 0.66, FLOOR_Z, rot_z=math.pi + math.radians(12.0), fabric_col=COL_LEATHER_EXEC, high_back=True)
    # 2 visitor armchairs facing the executive desk
    for vx, vyaw in ((-4.52, math.radians(-10.0)), (-3.58, math.radians(10.0))):
        _add_ergonomic_office_chair(g, vx, ex_y - 0.88, FLOOR_Z, rot_z=vyaw, fabric_col="6B645C")

    # Tall Executive Bookcase & Trophy Cabinet against West Wall (X = -5.56, Y in [1.10, 3.62])
    bc_x, bc_y = -5.56, 2.36
    _box(g, (bc_x - 0.17, bc_y, FLOOR_Z + 1.10), (0.028, 2.48, 2.20), COL_WALNUT, "wood_walnut", bevel=0.003)
    for sy in (-1.22, -0.40, 0.42, 1.22):
        _box(g, (bc_x, bc_y + sy, FLOOR_Z + 1.10), (0.36, 0.036, 2.20), COL_WALNUT, "wood_walnut", bevel=0.003)
    for sz in (0.04, 0.56, 1.04, 1.52, 2.18):
        _box(g, (bc_x, bc_y, FLOOR_Z + sz), (0.35, 2.42, 0.032), COL_WALNUT, "wood_walnut", bevel=0.003)
    # Lower closed cabinet doors on bottom bay
    for dy in (-0.81, 0.01, 0.82):
        _box(g, (bc_x + 0.185, bc_y + dy, FLOOR_Z + 0.30), (0.022, 0.77, 0.48), COL_OAK, "wood_oak", bevel=0.003)
    # Books & "DESIGN SPEC" folders (paper_book graphic tile) neatly arrayed on upper shelves
    book_cols = ("2B4E78", "B65B46", "486B5A", "E5DEC9", "3D4652", "C99A4E")
    for s_idx, sz in enumerate((FLOOR_Z + 0.58, FLOOR_Z + 1.06, FLOOR_Z + 1.54)):
        cy_cur = bc_y - 1.14
        for b in range(6):
            bt = 0.042 + (b % 3) * 0.012
            bh = 0.25 + ((b + s_idx) % 3) * 0.04
            _box(g, (bc_x + 0.02, cy_cur + bt * 0.5, sz + bh * 0.5), (0.22, bt - 0.004, bh), book_cols[(b + s_idx) % len(book_cols)], "paper_book", bevel=0.002)
            cy_cur += bt + 0.006
        # Featured "DESIGN SPEC" upright showcase folio facing +X into room (color="FFFFFF", uv_fit=True!)
        _box(g, (bc_x + 0.06, bc_y + 0.02 + (s_idx - 1) * 0.16, sz + 0.155), (0.028, 0.24, 0.30), "FFFFFF", "paper_book", bevel=0.0, uv_fit=True)

    # 4. Pantry Bar Cabinetry & Upper Shelf (South-East: X in [2.65, 5.75], Y in [-3.98, -1.65])
    # Main pantry counter running along East wall (X = 5.44, Y in [-3.88, -1.58])
    _box(g, (5.44, -2.72, FLOOR_Z + 0.44), (0.68, 2.28, 0.88), COL_PANTRY_SAGE, "wood_painted", bevel=0.004)
    _box(g, (5.42, -2.72, FLOOR_Z + 0.90), (0.74, 2.34, 0.040), COL_COUNTER_TOP, "laminate_matte", bevel=0.004)
    # Recessed stainless sink basin at Y = -2.02
    _box(g, (5.42, -2.02, FLOOR_Z + 0.922), (0.42, 0.48, 0.012), COL_STEEL, "metal_leg_steel", bevel=0.0)
    # Upper floating oak pantry shelf at Z = 1.66m
    _box(g, (5.58, -2.72, FLOOR_Z + 1.66), (0.34, 2.18, 0.036), COL_OAK, "wood_oak", bevel=0.004)
    # Tall Office Refrigerator (South-East corner at X = 4.65, Y = -3.65)
    _box(g, (4.45, -3.65, FLOOR_Z + 0.96), (0.74, 0.72, 1.92), "D6DCE2", "metal_leg_steel", bevel=0.008)
    _box(g, (4.45, -3.285, FLOOR_Z + 1.38), (0.70, 0.014, 0.96), "E2E7EC", "metal_leg_steel", bevel=0.003)
    _box(g, (4.45, -3.285, FLOOR_Z + 0.48), (0.70, 0.014, 0.78), "DFE5EA", "metal_leg_steel", bevel=0.003)
    # Vertical recessed handles
    _box(g, (4.16, -3.268, FLOOR_Z + 1.18), (0.022, 0.024, 0.34), COL_CHAIR_DARK, "metal_leg_dark", bevel=0.002)
    _box(g, (4.16, -3.268, FLOOR_Z + 0.68), (0.022, 0.024, 0.28), COL_CHAIR_DARK, "metal_leg_dark", bevel=0.002)

    # 5. South-Center Reception Lounge Sofa + Oak Coffee Table (X = -0.30, Y = -3.45)
    sf_x, sf_y = -0.30, -3.48
    _box(g, (sf_x, sf_y, FLOOR_Z + 0.22), (2.16, 0.84, 0.24), COL_SOFA_BEIGE, "fabric_linen", bevel=0.012)
    for lx in (-0.98, 0.98):
        for ly in (-0.34, 0.34):
            _cyl_z(g, sf_x + lx, sf_y + ly, FLOOR_Z, FLOOR_Z + 0.105, 0.024, 0.018, COL_WALNUT, "wood_walnut", sides=8)
    # 3 sofa seat cushions + backrest + wide arms
    for ci, ox in enumerate((-0.64, 0.0, 0.64)):
        _box(g, (sf_x + ox, sf_y + 0.05, FLOOR_Z + 0.40), (0.61, 0.66, 0.13), "E2DCD0", "fabric_linen", bevel=0.016)
        _box(g, (sf_x + ox, sf_y - 0.30, FLOOR_Z + 0.66), (0.61, 0.18, 0.42), COL_SOFA_BEIGE, "fabric_linen", bevel=0.016)
    for sx in (-1.00, 1.00):
        _box(g, (sf_x + sx, sf_y, FLOOR_Z + 0.48), (0.16, 0.82, 0.42), COL_SOFA_BEIGE, "fabric_linen", bevel=0.012)
    # Accent throw pillows
    _box(g, (sf_x - 0.74, sf_y - 0.12, FLOOR_Z + 0.62), (0.36, 0.13, 0.34), COL_PARTITION_BLUE, "fabric_velvet", bevel=0.016, rot_z=0.18)
    _box(g, (sf_x + 0.72, sf_y - 0.12, FLOOR_Z + 0.62), (0.36, 0.13, 0.34), "C9825A", "fabric_velvet", bevel=0.016, rot_z=-0.22)
    # Low oak coffee table in front of sofa
    _box(g, (sf_x, sf_y + 1.06, FLOOR_Z + 0.38), (1.18, 0.62, 0.036), COL_OAK, "wood_oak", bevel=0.005)
    for lx in (-0.48, 0.48):
        for ly in (-0.22, 0.22):
            _cyl_z(g, sf_x + lx, sf_y + 1.06 + ly, FLOOR_Z, FLOOR_Z + 0.364, 0.022, 0.018, COL_CHAIR_DARK, "metal_leg_dark", sides=8)
    # Design Spec magazine lying on coffee table
    _box(g, (sf_x + 0.22, sf_y + 1.04, FLOOR_Z + 0.412), (0.28, 0.21, 0.018), "FFFFFF", "paper_book", bevel=0.0, rot_z=0.14, uv_fit=True)

    # 6. Three Signature Sculpted Curved-Foliage Potted Plants (add_curved_foliage_plant)
    add_curved_foliage_plant(
        g, (5.28, 3.45, FLOOR_Z), species="monstera", height=1.42, pot_radius=0.19, pot_height=0.38, leaf_count=10, seed=11, pot_color="EAE6DF"
    )
    add_curved_foliage_plant(
        g, (-5.26, 3.46, FLOOR_Z), species="ficus", height=1.52, pot_radius=0.20, pot_height=0.40, leaf_count=10, seed=23, pot_color="C77D58"
    )
    add_curved_foliage_plant(
        g, (1.82, -3.52, FLOOR_Z), species="palm", height=1.34, pot_radius=0.18, pot_height=0.36, leaf_count=9, seed=37, pot_color="DFDAD2"
    )


# ---------------------------------------------------------------------------
# 5. Props & Clutter: Dual Monitors, Keyboards, Trays, Mugs, Trophies, Espresso, Water Purifier
# ---------------------------------------------------------------------------


def _add_dual_monitor_set(
    g: MeshGroup,
    cx: float,
    cy: float,
    desk_z: float,
    facing_north: bool,
) -> None:
    """Dual 27-inch monitors on desk clamp arm + keyboard + mouse + doc tray + mug."""
    rot_z = 0.0 if facing_north else math.pi
    orig = (cx, cy, desk_z)
    # Desk clamp pole
    _lbox(g, orig, rot_z, 0.0, 0.24, 0.16, 0.042, 0.042, 0.32, COL_CHAIR_DARK, "iron_dark", bevel=0.003)
    _lbox(g, orig, rot_z, 0.0, 0.20, 0.26, 0.56, 0.026, 0.026, COL_CHAIR_DARK, "iron_dark", bevel=0.003)
    # Left & Right angled monitor bezels + sleek crisp display faces
    for side, yaw_off in ((-1.0, 0.10), (1.0, -0.10)):
        mx = side * 0.285
        m_orig = _transform_points([(mx, 0.15, 0.31)], orig, rot_z=rot_z)[0]
        _lbox(g, m_orig, rot_z + yaw_off, 0.0, 0.0, 0.0, 0.53, 0.024, 0.32, COL_CHAIR_DARK, "plastic_matte", bevel=0.003)
        # Screen face facing user (-Y local)
        _lbox(g, m_orig, rot_z + yaw_off, 0.0, -0.015, 0.0, 0.50, 0.006, 0.29, "2A3B52" if side < 0 else "334B68", "glass_prop", bevel=0.0)
        # Subtle UI card highlight strips on monitor screen so screens never look dead
        _lbox(g, m_orig, rot_z + yaw_off, -0.10, -0.020, 0.04, 0.20, 0.004, 0.12, "DCE8F4", "enamel_gloss", bevel=0.0)
        _lbox(g, m_orig, rot_z + yaw_off, 0.12, -0.020, -0.02, 0.18, 0.004, 0.18, "78A4D4", "enamel_gloss", bevel=0.0)

    # Mechanical keyboard + wrist mat + mouse
    _lbox(g, orig, rot_z, -0.04, -0.11, 0.011, 0.36, 0.13, 0.018, "343A42", "plastic_matte", bevel=0.0025)
    _lbox(g, orig, rot_z, -0.04, -0.11, 0.022, 0.33, 0.10, 0.006, "E2E6EC", "plastic_matte", bevel=0.0)
    _lbox(g, orig, rot_z, 0.24, -0.12, 0.014, 0.062, 0.105, 0.026, "2E343C", "plastic_matte", bevel=0.005)
    # 2-tier Document Tray on left rear of desk + stacked white paper sheets
    _lbox(g, orig, rot_z, -0.45, 0.06, 0.028, 0.25, 0.31, 0.048, "424A54", "iron_dark", bevel=0.003)
    _lbox(g, orig, rot_z, -0.45, 0.06, 0.060, 0.21, 0.27, 0.018, "F4F4F0", "paper_label", bevel=0.0)
    _lbox(g, orig, rot_z, -0.45, 0.06, 0.112, 0.25, 0.31, 0.044, "424A54", "iron_dark", bevel=0.003)
    # Ceramic Coffee Mug on right front of desk
    mug_p = _transform_points([(0.44, -0.16, 0.0)], orig, rot_z=rot_z)[0]
    _cyl_z(g, mug_p[0], mug_p[1], desk_z, desk_z + 0.095, 0.038, 0.040, "F4EFE6", "ceramic_gloss", sides=10)


def _build_props_clutter(g: MeshGroup) -> None:
    desk_top_z = FLOOR_Z + 0.740
    # 1. All 6 Open-Office Workstations: dual monitors, keyboards, mice, doc trays, mugs
    for dx in (-1.45, -0.15, 1.15):
        _add_dual_monitor_set(g, dx, 0.46, desk_top_z, facing_north=True)
        _add_dual_monitor_set(g, dx, 1.24, desk_top_z, facing_north=False)

    # 2. Meeting Room Signage Plaque ("14F · 회의실 A / PRODUCT DESIGN & ENGINEERING") above glass door
    # Placed in BG_Props_Clutter -> tile="paper_label", color="FFFFFF", uv_fit=True -> ALWAYS visible!
    _box(g, (3.04, -0.32, FLOOR_Z + 2.52), (1.18, 0.026, 0.40), COL_MULLION, "aluminum_satin", bevel=0.003)
    _box(g, (3.04, -0.340, FLOOR_Z + 2.52), (1.12, 0.008, 0.34), "FFFFFF", "paper_label", bevel=0.0, uv_fit=True)

    # South-West Office Multifunction Copier / Printer Station & Steel Filing Cabinet (-5.44, -1.90..-0.65)
    _box(g, (-5.44, -1.85, FLOOR_Z + 0.46), (0.58, 0.72, 0.92), "EAEDF0", "enamel_gloss", bevel=0.006)
    _box(g, (-5.44, -1.85, FLOOR_Z + 0.96), (0.60, 0.74, 0.065), "343B44", "plastic_matte", bevel=0.004)  # Scanner lid
    _box(g, (-5.14, -1.85, FLOOR_Z + 0.96), (0.08, 0.22, 0.055), "28303A", "plastic_matte", bevel=0.003)  # Control panel
    _box(g, (-5.12, -1.85, FLOOR_Z + 0.68), (0.14, 0.42, 0.024), "DCE0E6", "plastic_matte", bevel=0.002)  # Output paper tray
    for di, dz in enumerate((0.18, 0.38, 0.58)):
        _box(g, (-5.14, -1.85, FLOOR_Z + dz), (0.016, 0.56, 0.15), "F2F4F7", "enamel_gloss", bevel=0.003)
    # 3-drawer lateral steel filing cabinet beside printer (-5.46, -0.82)
    _box(g, (-5.46, -0.82, FLOOR_Z + 0.52), (0.50, 0.88, 1.04), "CFD6DD", "aluminum_satin", bevel=0.005)
    for dz in (0.20, 0.52, 0.84):
        _box(g, (-5.20, -0.82, FLOOR_Z + dz), (0.016, 0.78, 0.26), "DEE4EA", "aluminum_satin", bevel=0.003)
        _box(g, (-5.185, -0.82, FLOOR_Z + dz + 0.06), (0.014, 0.20, 0.018), COL_MULLION, "iron_dark", bevel=0.002)
    # Stacked paper reams + shredder beside printer
    _box(g, (-5.44, -2.52, FLOOR_Z + 0.28), (0.36, 0.32, 0.56), "3A424B", "plastic_matte", bevel=0.006)

    # Meeting Room Conference Table Props (Z = FLOOR_Z + 0.740)
    mt_z = FLOOR_Z + 0.740
    # 2 open laptops on conference table
    for lx, ly, lyaw in ((3.84, 1.32, 0.12), (4.42, 2.38, math.pi - 0.15)):
        _lbox(g, (lx, ly, mt_z), lyaw, 0.0, 0.0, 0.008, 0.32, 0.22, 0.014, COL_ALU_SATIN, "aluminum_satin", bevel=0.002)
        _lbox(g, (lx, ly, mt_z), lyaw, 0.0, 0.105, 0.115, 0.32, 0.012, 0.21, COL_ALU_SATIN, "aluminum_satin", bevel=0.002)
        _lbox(g, (lx, ly, mt_z), lyaw, 0.0, 0.097, 0.115, 0.29, 0.006, 0.18, "2C4462", "glass_prop", bevel=0.0)
    # Conference speakerphone puck + glass water carafe + 4 coffee mugs
    _cyl_z(g, 4.12, 1.88, mt_z + 0.010, mt_z + 0.044, 0.095, 0.088, COL_CHAIR_DARK, "plastic_matte", sides=14)
    _lathe_z(g, 4.12, 1.56, ((0.042, mt_z), (0.050, mt_z + 0.08), (0.032, mt_z + 0.19), (0.038, mt_z + 0.22)), "D8EDF4", "glass_prop", sides=12)
    for mx, my in ((3.72, 1.82), (4.52, 1.72), (3.76, 2.48), (4.48, 1.18)):
        _cyl_z(g, mx, my, mt_z, mt_z + 0.092, 0.036, 0.038, "F4F0E8", "ceramic_gloss", sides=10)

    # 3. Executive Desk Props (X = -4.05, Y = 2.75, Z = FLOOR_Z + 0.752)
    ez = FLOOR_Z + 0.752
    # Curved Ultrawide Executive Monitor facing North-West -> user sitting at +Y looking -Y
    _box(g, (-4.05, 2.52, ez + 0.012), (0.28, 0.18, 0.020), COL_ALU_SATIN, "aluminum_satin", bevel=0.003)
    _box(g, (-4.05, 2.48, ez + 0.18), (0.045, 0.036, 0.32), COL_ALU_SATIN, "aluminum_satin", bevel=0.003)
    _box(g, (-4.05, 2.54, ez + 0.34), (0.82, 0.028, 0.36), COL_CHAIR_DARK, "plastic_matte", bevel=0.004)
    _box(g, (-4.05, 2.558, ez + 0.34), (0.78, 0.008, 0.32), "263B54", "glass_prop", bevel=0.0)
    # Brass architect desk lamp on executive desk
    _cyl_z(g, -4.72, 2.58, ez, ez + 0.024, 0.082, 0.075, COL_BRASS, "brass_polished", sides=12)
    g.rail((-4.72, 2.58, ez + 0.022), (-4.78, 2.62, ez + 0.36), 0.010, COL_BRASS, sides=8, tile="brass_polished")
    g.rail((-4.78, 2.62, ez + 0.36), (-4.56, 2.72, ez + 0.44), 0.010, COL_BRASS, sides=8, tile="brass_polished")
    _lathe_z(g, -4.52, 2.74, ((0.032, ez + 0.44), (0.085, ez + 0.36), (0.088, ez + 0.34)), COL_CHAIR_DARK, "iron_dark", sides=12)
    # Executive desk nameplate + coffee mug + pen cup
    _box(g, (-3.45, 2.44, ez + 0.035), (0.24, 0.068, 0.068), COL_BRASS, "brass_polished", bevel=0.004)
    _cyl_z(g, -3.42, 2.86, ez, ez + 0.095, 0.038, 0.040, "F2ECE2", "ceramic_gloss", sides=10)
    # 3 Brass/Crystal Award Trophies on Executive Bookcase top shelves (X = -5.54, Y in [2.75..3.45])
    for ti, ty in enumerate((2.82, 3.08, 3.34)):
        tz = FLOOR_Z + 1.54 + (0.0 if ti < 2 else -0.48)
        _box(g, (-5.54, ty, tz + 0.026), (0.095, 0.095, 0.052), "2C2824", "iron_dark", bevel=0.003)
        _lathe_z(
            g, -5.54, ty,
            ((0.026, tz + 0.052), (0.016, tz + 0.11), (0.052, tz + 0.20), (0.058, tz + 0.25)),
            COL_BRASS if ti != 1 else "D8EDF6",
            "brass_polished" if ti != 1 else "glass_prop",
            sides=12,
        )

    # 4. Pantry Appliances: Commercial Espresso Machine + Stand Water Purifier (정수기) + Stacked Mugs
    pz = FLOOR_Z + 0.920
    # Commercial 2-group Espresso Machine on pantry counter (X = 5.40, Y = -3.12)
    _box(g, (5.42, -3.12, pz + 0.22), (0.48, 0.62, 0.44), COL_STEEL, "steel_brushed", bevel=0.006)
    _box(g, (5.16, -3.12, pz + 0.34), (0.08, 0.56, 0.14), "323840", "iron_dark", bevel=0.004)
    _box(g, (5.15, -3.12, pz + 0.030), (0.14, 0.56, 0.052), COL_STEEL, "steel_brushed", bevel=0.003)  # Drip tray
    for gy in (-3.25, -2.99):
        _cyl_z(g, 5.14, gy, pz + 0.19, pz + 0.27, 0.038, 0.042, COL_STEEL, "steel_brushed", sides=10)
        g.rail((5.10, gy, pz + 0.21), (4.96, gy, pz + 0.18), 0.012, "24282E", sides=8, tile="plastic_matte")  # Portafilter handle
    # Stacked ceramic espresso mugs on top cup-warmer deck
    for my in (-3.28, -3.12, -2.96):
        _cyl_z(g, 5.42, my, pz + 0.442, pz + 0.520, 0.034, 0.036, "FAF6EE", "ceramic_gloss", sides=10)
    # Gooseneck pantry sink faucet at Y = -2.02
    g.rail((5.64, -2.02, pz), (5.64, -2.02, pz + 0.26), 0.012, COL_STEEL, sides=8, tile="steel_brushed")
    g.rail((5.64, -2.02, pz + 0.26), (5.48, -2.02, pz + 0.22), 0.011, COL_STEEL, sides=8, tile="steel_brushed")
    # Pantry upper shelf mugs, coffee bean canisters & dish stack
    sh_z = FLOOR_Z + 1.678
    for ci, cy in enumerate((-3.55, -3.28, -3.02)):
        _cyl_z(g, 5.56, cy, sh_z, sh_z + 0.18, 0.055, 0.055, ("C8824E", "4C6C5C", "EAE4DA")[ci], "ceramic_gloss", sides=12)
    for mi, cy in enumerate((-2.52, -2.36, -2.20, -2.04)):
        _cyl_z(g, 5.56, cy, sh_z, sh_z + 0.095, 0.036, 0.038, "F4EFE6", "ceramic_gloss", sides=10)

    # Korean Stand Water Purifier (정수기) beside pantry counter at (X = 5.46, Y = -1.24)
    wp_x, wp_y = 5.46, -1.24
    _box(g, (wp_x, wp_y, FLOOR_Z + 0.66), (0.40, 0.40, 1.32), "F0F3F6", "enamel_gloss", bevel=0.008)
    _box(g, (wp_x - 0.19, wp_y, FLOOR_Z + 0.94), (0.04, 0.30, 0.28), "2A3038", "plastic_matte", bevel=0.003)  # Dispense recess
    _box(g, (wp_x - 0.18, wp_y - 0.06, FLOOR_Z + 1.03), (0.032, 0.028, 0.055), "D63E34", "plastic_matte", bevel=0.002)  # Hot red tap
    _box(g, (wp_x - 0.18, wp_y + 0.06, FLOOR_Z + 1.03), (0.032, 0.028, 0.055), "2E78C8", "plastic_matte", bevel=0.002)  # Cold blue tap
    _box(g, (wp_x - 0.21, wp_y, FLOOR_Z + 0.78), (0.07, 0.30, 0.022), COL_STEEL, "steel_brushed", bevel=0.002)  # Drip grate
    # Paper cup dispenser tube mounted on purifier side
    _cyl_z(g, wp_x - 0.04, wp_y - 0.23, FLOOR_Z + 0.86, FLOOR_Z + 1.24, 0.042, 0.042, "E2E6EA", "plastic_matte", sides=10)


# ---------------------------------------------------------------------------
# Camera Presets & 6-View Contact Sheet Framing
# ---------------------------------------------------------------------------


def build_office_cameras() -> Dict[str, Any]:
    return {
        "open_office_24mm": {
            "label": "24mm 오픈 오피스 전경",
            "lensMm": 24,
            "position": [-2.85, 1.55, 2.85],
            "target": [2.40, 1.32, -1.65],
        },
        "meeting_room_35mm": {
            "label": "35mm 유리 회의실 화이트보드",
            "lensMm": 35,
            "position": [2.75, 1.48, -0.45],
            "target": [5.55, 1.45, -1.88],
        },
        "executive_corner_50mm": {
            "label": "50mm 대표실 코너 대면",
            "lensMm": 50,
            "position": [-2.75, 1.42, -0.85],
            "target": [-4.45, 1.32, -2.85],
        },
    }


def build_office_review_views() -> List[PreviewCameraView]:
    return [
        PreviewCameraView(
            key="front",
            label="1 FRONT CUTAWAY",
            location=(0.15, -10.80, 2.15),
            target=(0.15, 0.55, 1.42),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_South", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="side",
            label="2 MEETING & OFFICE",
            location=(-5.20, -1.60, 1.66),
            target=(4.35, 1.65, 1.38),
            lens_mm=24.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="back",
            label="3 BACK CUTAWAY",
            location=(0.10, 10.60, 2.15),
            target=(0.10, -0.45, 1.38),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_North",),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(-9.40, -9.20, 6.40),
            target=(0.55, 0.55, 1.10),
            lens_mm=34.0,
            hide_nodes=("BG_Wall_South", "BG_Wall_West", "BG_Ceiling", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 INTERIOR 35MM",
            location=(-2.80, -2.55, 1.56),
            target=(2.85, 1.95, 1.42),
            lens_mm=26.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(-0.35, -7.80, 12.20),
            target=(0.10, 0.25, 0.72),
            lens_mm=32.0,
            hide_nodes=("BG_Ceiling", "BG_Wall_South", "BG_Cutaway_Front"),
        ),
    ]


def build_scene_groups() -> HeroSceneGroups:
    groups = HeroSceneGroups()
    _build_floor_and_partitions(groups.floor)
    _build_wall_north(groups.wall_north)
    _build_wall_east(groups.wall_east)
    _build_wall_west(groups.wall_west)
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
    views = build_office_review_views()

    # 1. Mobile 4-node assembly, Gate-1 audit, & meshopt GLB export
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

    # 2. Desktop 8-node assembly, Gate-1 audit, & meshopt GLB export
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

    # 3. Gate-2 GLB contract + gltf-transform validate + v2 strict size/tri budgets
    desktop_gate2 = inspect_glb(desktop_glb, profile="desktop", require_meshopt=True, run_validate=True)
    mobile_gate2 = inspect_glb(mobile_glb, profile="mobile", require_meshopt=True, run_validate=True)
    if not desktop_gate2["passed"]:
        raise RuntimeError(f"Desktop Gate 2 failed: {json.dumps(desktop_gate2['errors'], ensure_ascii=False)}")
    if not mobile_gate2["passed"]:
        raise RuntimeError(f"Mobile Gate 2 failed: {json.dumps(mobile_gate2['errors'], ensure_ascii=False)}")

    # Enforce strict v2 hard ceilings from brief #159
    assert desktop_export["byteSize"] <= 12 * 1024 * 1024, f"Desktop GLB > 12MB: {desktop_export['byteSize']}"
    assert mobile_export["byteSize"] <= 4 * 1024 * 1024, f"Mobile GLB > 4MB: {mobile_export['byteSize']}"
    assert desktop_gate2["summary"]["triangles"] <= 250_000, f"Desktop tris > 250k: {desktop_gate2['summary']['triangles']}"
    assert mobile_gate2["summary"]["triangles"] <= 80_000, f"Mobile tris > 80k: {mobile_gate2['summary']['triangles']}"

    # 4. Contact sheet & 3-tier Freestyle SVG
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

    # 5. Write manifest.json with 3-time-of-day lightingPresets & freestyleSvg
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
        "cameras": build_office_cameras(),
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
