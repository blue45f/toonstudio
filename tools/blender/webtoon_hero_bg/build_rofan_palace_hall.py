"""ToonStudio Hero BG3D #5: Romance Fantasy Imperial Palace Hall & Balcony.

Builds ``rofan_imperial_palace_hall_balcony`` (14.0 x 18.0 x 8.5 m) using the
ToonStudio Blender 5.3 common BG3D core:
  - Fluted Corinthian colonnade with sculpted gilded acanthus & volute capitals
  - Ribbed barrel-arch vaulted ceiling with diagonal groin ribs & gold bosses
  - Checkered veined marble ballroom floor & royal crimson carpet with gold trim
  - Grand 6-step marble staircase ascending to the raised Imperial Throne Dais
  - Carved walnut & gold Imperial Throne with tufted crimson velvet & canopy
  - Open double French arched doors stepping onto a grounded exterior stone
    balustrade balcony with turned classical balusters & carved stone benches
  - 3 multi-tier gilded crystal chandeliers with glowing emissive candle flames
  - Towering arched mullion windows with radial fanlights & floor-length
    pleated velvet draped curtains
  - Deep 3D wainscoting boiserie moldings, arched wall niches, dentil cornices,
    20 gilded wall candle sconces, 4 standing 5-branch floor candelabra,
    6 marble sculpture pedestals with classical urns & foliage, and console sets.

Outputs:
  - Desktop Hero GLB (8-node cutaway, meshopt, <=8 DC, <=4 mat, 35k-120k tris, <=6 MiB)
  - Mobile Hero GLB  (4-node merged,  meshopt, <=4 DC, <=2 mat, <=3 MiB)
  - 6-view 512x512 BLENDER_EEVEE contact sheet PNG + Freestyle SVG line art
  - Automated Gate 1 (bmesh) + Gate 2 (GLB contract & gltf-transform validate) JSON

Run headless with Blender 5.3:
  /Users/hjunkim/.local/bin/blender --background --factory-startup \\
      --python-exit-code 42 --python tools/blender/webtoon_hero_bg/build_rofan_palace_hall.py --
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

# Ensure repo root is on sys.path when invoked via Blender --python
_THIS_FILE = Path(__file__).resolve()
_REPO_ROOT = _THIS_FILE.parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from tools.blender.webtoon_hero_bg import (  # noqa: E402
    HeroSceneGroups,
    MeshGroup,
    PreviewCameraView,
    WallOpening,
    add_beveled_box,
    add_column_fluted,
    add_pipe_frame,
    add_wall_with_openings,
    audit_blender_scene,
    export_hero_desktop_and_mobile,
    inspect_glb,
    render_hero_review_bundle,
)

TAU = math.tau
SLUG = "rofan_imperial_palace_hall_balcony"

DEFAULT_OUT_DIR = _REPO_ROOT / "apps/web/public/assets/3d/environments/hero-v1"
DEFAULT_PREVIEW_DIR = _REPO_ROOT / "loop-stack/competitor-parity/previews/bg"

# ---------------------------------------------------------------------------
# Architectural Master Dimensions (Exact 14.00 m x 18.00 m x 8.50 m envelope)
# ---------------------------------------------------------------------------
# X: [-7.00, +7.00] = 14.00 m (outer masonry inset 0.055 m on E/N/S so exterior
#    architrave casings & sills stay cleanly inside the 14.0 x 18.0 m footprint)
#    Balcony exterior terrace : X = [-7.00, -4.40] (2.60 m deep), Y = [-7.00, +3.00]
#    Main Ballroom Hall       : X = [-4.40, +6.94] (11.34 m wide), Y = [-8.94, +8.94]
#    Hall interior clear X    : [-4.02, +6.56] (10.58 m), hall centerline X_HALL = +1.27
# Z: [0.00, +8.50] = 8.50 m
#    Foundation slab          : Z = [0.00, 0.14]
#    Main marble floor top    : Z_FLOOR = 0.16
#    Throne dais top          : Z_DAIS  = 1.06 (6 steps x 0.15 m rise)
#    Column entablature soffit: Z_ENTAB = 5.65
#    Wall top / vault spring  : Z_WALL_TOP = 6.25
#    Outer roof vault apex    : Z_ROOF_TOP = 8.50

WALL_T = 0.38
X_BALC_OUT = -7.00
X_HALL_W_OUT = -4.40
X_HALL_W_IN = X_HALL_W_OUT + WALL_T  # -4.02
X_HALL_E_OUT = 6.94
X_HALL_E_IN = X_HALL_E_OUT - WALL_T  # +6.56
X_HALL = 0.5 * (X_HALL_W_IN + X_HALL_E_IN)  # +1.27

Y_SOUTH_OUT = -8.91
Y_SOUTH_IN = Y_SOUTH_OUT + WALL_T  # -8.53
Y_NORTH_OUT = 8.91
Y_NORTH_IN = Y_NORTH_OUT - WALL_T  # +8.53

Z_SLAB_TOP = 0.14
Z_FLOOR = 0.16
Z_BALC_FLOOR = 0.168
Z_DAIS = 1.06
Z_ENTAB = 5.65
Z_WALL_TOP = 6.25
Z_VAULT_INNER_APEX = 8.26
Z_ROOF_TOP = 8.50

# Rhythmic 3.20 m structural bays
COL_YS = (-6.80, -3.60, -0.40, 2.80, 6.00)
X_COL_L = X_HALL - 3.62  # -2.35
X_COL_R = X_HALL + 3.62  # +4.89

BALC_Y0 = -7.00
BALC_Y1 = 3.00

STAIR_Y0 = 2.85
STAIR_Y1 = 4.75  # 6 steps x 0.3167 m
DAIS_Y0 = STAIR_Y1
DAIS_Y1 = Y_NORTH_IN - 0.01

# ---------------------------------------------------------------------------
# Romance Fantasy Imperial Palette (Warm Cream Marble, Antique Gold, Crimson)
# ---------------------------------------------------------------------------
COL_PLASTER = "F3EDE2"
COL_PLASTER_SHADOW = "DFD5C5"
COL_MARBLE_LIGHT = "F5F0E7"
COL_MARBLE_WARM = "E8DFD0"
COL_MARBLE_DARK = "3B404A"
COL_STONE_BASE = "CFC5B4"
COL_TRIM = "EDE5D6"
COL_GOLD = "D2A84B"
COL_GOLD_DEEP = "AE8434"
COL_CRIMSON = "861C27"
COL_CRIMSON_DARK = "5D121A"
COL_CRIMSON_BRIGHT = "9E2431"
COL_WALNUT = "4E3323"
COL_WALNUT_LIGHT = "6A4833"
COL_GLASS_SKY = "BDD8E8"
COL_GLASS_CRYSTAL = "EBF4FA"
COL_CANDLE_WAX = "FAF4E6"
COL_FLAME_WARM = "FFD67A"
COL_FOLIAGE = "3E6846"
COL_FOLIAGE_LIGHT = "568459"
COL_PORCELAIN = "ECE8DF"


# ---------------------------------------------------------------------------
# Low-Level Closed Manifold Helpers (Zero Welded Non-Manifold Edges)
# ---------------------------------------------------------------------------


def _rot_xy(x: float, y: float, rot_z: float) -> Tuple[float, float]:
    c, s = math.cos(rot_z), math.sin(rot_z)
    return (x * c - y * s, x * s + y * c)


def _add_bent_strut(
    group: MeshGroup,
    waypoints: Sequence[Tuple[float, float, float]],
    *,
    radius: float,
    sides: int = 6,
    color: str = COL_GOLD,
    tile: str = "hardware_brass",
) -> None:
    """Loft a single continuous watertight bent strut along ``waypoints`` (zero shared elbow vertices)."""
    pts = [Vector(p) for p in waypoints]
    if len(pts) < 2:
        return
    rings: List[List[Tuple[float, float, float]]] = []
    axis: Vector | None = None
    n = len(pts)
    for i, pt in enumerate(pts):
        if i == 0:
            tangent = (pts[1] - pts[0]).normalized()
        elif i == n - 1:
            tangent = (pts[-1] - pts[-2]).normalized()
        else:
            t1 = (pts[i] - pts[i - 1]).normalized()
            t2 = (pts[i + 1] - pts[i]).normalized()
            tangent = t1 + t2
            tangent = tangent.normalized() if tangent.length > 1e-5 else t2
        if axis is None:
            ref = Vector((0.0, 0.0, 1.0)) if abs(tangent.z) < 0.85 else Vector((0.0, 1.0, 0.0))
            axis = tangent.cross(ref).normalized()
        else:
            proj = axis - tangent * tangent.dot(axis)
            if proj.length < 1e-5:
                ref = Vector((0.0, 0.0, 1.0)) if abs(tangent.z) < 0.85 else Vector((0.0, 1.0, 0.0))
                axis = tangent.cross(ref).normalized()
            else:
                axis = proj.normalized()
        side_v = tangent.cross(axis).normalized()
        rings.append(
            [
                tuple(pt + radius * (math.cos(TAU * j / sides) * axis + math.sin(TAU * j / sides) * side_v))
                for j in range(sides)
            ]
        )
    group.rings(rings, color=color, tile=tile)


def _add_arch_surround(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    *,
    rot_z: float,
    width: float,
    spring_z: float,
    arch_rise: float,
    face_y: float,
    side: int,
    molding_w: float = 0.14,
    molding_d: float = 0.052,
    segments: int = 10,
    color: str = COL_TRIM,
    tile: str = "trim_paint",
    keystone_color: str = COL_GOLD,
    keystone_tile: str = "hardware_brass",
) -> None:
    """Build a proud 3D molded classical architrave surround + keystone around an arched opening."""
    ox, oy, oz = origin
    rx = width * 0.5
    ry_rise = max(0.08, arch_rise)
    y_in = face_y - side * 0.004
    y_mid = face_y + side * (molding_d * 0.56)
    y_out = face_y + side * molding_d

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (ox + wx, oy + wy, oz + lz)

    # Vertical jamb casings up to spring line + gilded impost blocks
    jamb_h = max(0.20, spring_z)
    for sx in (-1, 1):
        jx = sx * (rx + molding_w * 0.5 + 0.006)
        add_beveled_box(
            group,
            _to_world(jx, face_y + side * (molding_d * 0.48), jamb_h * 0.5),
            (molding_w, molding_d, jamb_h),
            color=color,
            tile=tile,
            bevel=0.004,
            rot_z=rot_z,
        )
        add_beveled_box(
            group,
            _to_world(jx, face_y + side * (molding_d * 0.62), spring_z + 0.03),
            (molding_w + 0.045, molding_d + 0.022, 0.072),
            color=keystone_color,
            tile=keystone_tile,
            bevel=0.004,
            rot_z=rot_z,
        )

    # Swept stepped archivolts
    r_in_x, r_in_z = rx + 0.005, ry_rise + 0.005
    r_mid_x, r_mid_z = rx + molding_w * 0.52, ry_rise + molding_w * 0.52
    r_out_x, r_out_z = rx + molding_w + 0.012, ry_rise + molding_w + 0.012

    rings = []
    for i in range(segments + 1):
        a = math.pi * (i / float(segments))
        ca, sa = math.cos(a), math.sin(a)
        prof_local = [
            (r_in_x * ca, y_in, spring_z + r_in_z * sa),
            (r_in_x * ca, y_mid, spring_z + r_in_z * sa),
            (r_mid_x * ca, y_mid, spring_z + r_mid_z * sa),
            (r_mid_x * ca, y_out, spring_z + r_mid_z * sa),
            (r_out_x * ca, y_out, spring_z + r_out_z * sa),
            (r_out_x * ca, y_in, spring_z + r_out_z * sa),
        ]
        rings.append([_to_world(lx, ly, lz) for (lx, ly, lz) in prof_local])
    group.rings(rings, color=color, tile=tile)

    # Sculpted trapezoidal gilded keystone at apex
    kw_bot = molding_w * 0.68
    kw_top = molding_w * 1.12
    kz0 = spring_z + ry_rise - 0.025
    kz1 = spring_z + ry_rise + molding_w + 0.052
    ky0 = face_y - side * 0.003
    ky1 = face_y + side * (molding_d + 0.022)
    group.rings(
        [
            [
                _to_world(-kw_bot * 0.5, ky0, kz0),
                _to_world(kw_bot * 0.5, ky0, kz0),
                _to_world(kw_bot * 0.5, ky1, kz0),
                _to_world(-kw_bot * 0.5, ky1, kz0),
            ],
            [
                _to_world(-kw_top * 0.5, ky0, kz1),
                _to_world(kw_top * 0.5, ky0, kz1),
                _to_world(kw_top * 0.5, ky1 + side * 0.010, kz1),
                _to_world(-kw_top * 0.5, ky1 + side * 0.010, kz1),
            ],
        ],
        color=keystone_color,
        tile=keystone_tile,
    )


def _add_arch_ring_bar(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    *,
    rot_z: float,
    rx: float,
    rz: float,
    spring_z: float,
    half_w: float,
    half_d: float,
    segments: int,
    color: str,
    tile: str,
) -> None:
    """Loft a clean 4-sided rectangular arch muntin bar (compact tris, crisp LT silhouette)."""
    ox, oy, oz = origin

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (ox + wx, oy + wy, oz + lz)

    rings = []
    for i in range(segments + 1):
        a = math.pi * (i / float(segments))
        ca, sa = math.cos(a), math.sin(a)
        rings.append(
            [
                _to_world((rx - half_w) * ca, -half_d, spring_z + (rz - half_w) * sa),
                _to_world((rx + half_w) * ca, -half_d, spring_z + (rz + half_w) * sa),
                _to_world((rx + half_w) * ca, half_d, spring_z + (rz + half_w) * sa),
                _to_world((rx - half_w) * ca, half_d, spring_z + (rz - half_w) * sa),
            ]
        )
    group.rings(rings, color=color, tile=tile)


def _add_arched_mullion_window(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    *,
    rot_z: float,
    width: float,
    height: float,
    arch_rise: float,
    wall_thickness: float,
    interior_side: int = -1,
    cols: int = 3,
    rows: int = 4,
    frame_color: str = COL_TRIM,
    accent_color: str = COL_GOLD,
    glass_color: str = COL_GLASS_SKY,
) -> None:
    """Build a palace arched mullion window with radial fanlight tracery, deep sill, & 8mm glazing."""
    ox, oy, oz = origin
    rx = width * 0.5
    spring_z = max(0.40, height - arch_rise - 0.025)
    frame_w = 0.062
    frame_d = wall_thickness + 0.024

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (ox + wx, oy + wy, oz + lz)

    def _box(lx: float, ly: float, lz: float, sx: float, sy: float, sz: float, col: str, tl: str, bev: float = 0.004) -> None:
        add_beveled_box(group, _to_world(lx, ly, lz), (sx, sy, sz), color=col, tile=tl, bevel=bev, rot_z=rot_z)

    # Outer frame jambs up to spring line + stepped stone sill (projects inward, compact outward)
    _box(-rx + frame_w * 0.5, 0.0, spring_z * 0.5, frame_w, frame_d, spring_z, frame_color, "trim_paint")
    _box(rx - frame_w * 0.5, 0.0, spring_z * 0.5, frame_w, frame_d, spring_z, frame_color, "trim_paint")
    _box(0.0, interior_side * 0.055, 0.042, width + 0.22, wall_thickness + 0.14, 0.084, COL_MARBLE_WARM, "marble", bev=0.005)
    # Transom bar at arch spring line + gilded bead
    _box(0.0, 0.0, spring_z, width - frame_w * 1.85, frame_d * 0.86, 0.072, frame_color, "trim_paint", bev=0.004)
    _box(0.0, interior_side * (frame_d * 0.44), spring_z, width - frame_w * 1.75, 0.022, 0.032, accent_color, "hardware_brass", bev=0.0)

    # Rectangular lower mullion grid (crisp non-beveled bars keep tris lean & LT edges razor-sharp)
    inner_w = max(0.30, width - frame_w * 2.0)
    inner_z0 = 0.088
    inner_z1 = spring_z - 0.038
    inner_h = max(0.25, inner_z1 - inner_z0)

    for c in range(1, cols):
        mx = -inner_w * 0.5 + inner_w * (c / float(cols))
        _box(mx, 0.0, inner_z0 + inner_h * 0.5, 0.036, 0.056, inner_h - 0.006, frame_color, "trim_paint", bev=0.0)
    for r in range(1, rows):
        mz = inner_z0 + inner_h * (r / float(rows))
        _box(0.0, 0.0, mz, inner_w - 0.006, 0.046, 0.028, frame_color, "trim_paint", bev=0.0)

    # Radial fanlight spoke tracery & inner concentric gilded arch ring
    fan_r_x = rx - frame_w * 0.9
    fan_r_z = max(0.10, arch_rise - frame_w * 0.7)
    hub_z = spring_z + 0.038
    for k in range(1, 6):
        a = math.pi * (k / 6.0)
        p0 = _to_world(0.16 * math.cos(a), 0.0, hub_z + 0.16 * math.sin(a))
        p1 = _to_world(fan_r_x * math.cos(a), 0.0, spring_z + fan_r_z * math.sin(a))
        group.rail(p0, p1, radius=0.015, color=accent_color, sides=6, tile="hardware_brass", bevel_ends=False)

    _add_arch_ring_bar(
        group,
        origin,
        rot_z=rot_z,
        rx=fan_r_x * 0.54,
        rz=fan_r_z * 0.54,
        spring_z=spring_z,
        half_w=0.016,
        half_d=0.018,
        segments=10,
        color=accent_color,
        tile="hardware_brass",
    )
    _add_arch_ring_bar(
        group,
        origin,
        rot_z=rot_z,
        rx=fan_r_x * 0.98,
        rz=fan_r_z * 0.98,
        spring_z=spring_z,
        half_w=0.024,
        half_d=0.026,
        segments=10,
        color=frame_color,
        tile="trim_paint",
    )

    # Watertight 8 mm glazing: rectangular lower pane + arched upper lunette pane
    _box(0.0, 0.0, inner_z0 + inner_h * 0.5, inner_w - 0.014, 0.008, inner_h - 0.014, glass_color, "glass_tinted", bev=0.0)
    segs_g = 10
    lun_pts_2d = [
        (fan_r_x * 0.96 * math.cos(math.pi * i / segs_g), spring_z + 0.036 + fan_r_z * 0.94 * math.sin(math.pi * i / segs_g))
        for i in range(segs_g + 1)
    ]
    group.rings(
        [
            [_to_world(px, -0.004, pz) for (px, pz) in lun_pts_2d],
            [_to_world(px, 0.004, pz) for (px, pz) in lun_pts_2d],
        ],
        color=glass_color,
        tile="glass_tinted",
    )

    # Interior & exterior 3D architrave surrounds
    _add_arch_surround(
        group,
        origin,
        rot_z=rot_z,
        width=width,
        spring_z=spring_z,
        arch_rise=arch_rise,
        face_y=interior_side * (wall_thickness * 0.5),
        side=interior_side,
        molding_w=0.145,
        molding_d=0.052,
        segments=10,
    )
    _add_arch_surround(
        group,
        origin,
        rot_z=rot_z,
        width=width,
        spring_z=spring_z,
        arch_rise=arch_rise,
        face_y=-interior_side * (wall_thickness * 0.5),
        side=-interior_side,
        molding_w=0.125,
        molding_d=0.034,
        segments=10,
        keystone_color=COL_MARBLE_WARM,
        keystone_tile="marble",
    )


def _add_french_arched_doors(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    *,
    rot_z: float,
    width: float,
    height: float,
    arch_rise: float,
    wall_thickness: float,
    interior_side: int = -1,
    open_deg: float = 0.0,
    solid_walnut: bool = False,
) -> None:
    """Build grand double French arched balcony doors (or solid walnut palace entry doors)."""
    ox, oy, oz = origin
    rx = width * 0.5
    spring_z = max(2.20, height - arch_rise - 0.025)
    jamb_w = 0.070
    frame_d = wall_thickness + 0.028

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (ox + wx, oy + wy, oz + lz)

    def _box(lx: float, ly: float, lz: float, sx: float, sy: float, sz: float, col: str, tl: str, bev: float = 0.004) -> None:
        add_beveled_box(group, _to_world(lx, ly, lz), (sx, sy, sz), color=col, tile=tl, bevel=bev, rot_z=rot_z)

    # Outer jambs, beveled marble threshold, & arched transom bar
    _box(-rx + jamb_w * 0.5, 0.0, spring_z * 0.5, jamb_w, frame_d, spring_z, COL_TRIM, "trim_paint")
    _box(rx - jamb_w * 0.5, 0.0, spring_z * 0.5, jamb_w, frame_d, spring_z, COL_TRIM, "trim_paint")
    _box(0.0, 0.0, 0.011, width - jamb_w * 1.85, wall_thickness + 0.06, 0.022, COL_MARBLE_WARM, "marble", bev=0.004)
    _box(0.0, 0.0, spring_z, width - jamb_w * 1.85, frame_d * 0.88, 0.085, COL_TRIM, "trim_paint", bev=0.004)

    # Radial gilded fanlight above transom
    fan_r_x = rx - jamb_w * 0.85
    fan_r_z = max(0.15, arch_rise - jamb_w * 0.65)
    hub_z = spring_z + 0.045
    for k in range(1, 6):
        a = math.pi * (k / 6.0)
        p0 = _to_world(0.16 * math.cos(a), 0.0, hub_z + 0.16 * math.sin(a))
        p1 = _to_world(fan_r_x * math.cos(a), 0.0, spring_z + fan_r_z * math.sin(a))
        group.rail(p0, p1, radius=0.016, color=COL_GOLD, sides=6, tile="hardware_brass", bevel_ends=False)
    _add_arch_ring_bar(
        group,
        origin,
        rot_z=rot_z,
        rx=fan_r_x * 0.55,
        rz=fan_r_z * 0.55,
        spring_z=spring_z,
        half_w=0.017,
        half_d=0.019,
        segments=10,
        color=COL_GOLD,
        tile="hardware_brass",
    )
    _add_arch_ring_bar(
        group,
        origin,
        rot_z=rot_z,
        rx=fan_r_x * 0.98,
        rz=fan_r_z * 0.98,
        spring_z=spring_z,
        half_w=0.024,
        half_d=0.026,
        segments=10,
        color=COL_TRIM,
        tile="trim_paint",
    )

    segs_g = 10
    lun_pts = [
        (fan_r_x * 0.96 * math.cos(math.pi * i / segs_g), spring_z + 0.044 + fan_r_z * 0.93 * math.sin(math.pi * i / segs_g))
        for i in range(segs_g + 1)
    ]
    group.rings(
        [
            [_to_world(px, -0.004, pz) for (px, pz) in lun_pts],
            [_to_world(px, 0.004, pz) for (px, pz) in lun_pts],
        ],
        color=COL_GLASS_SKY,
        tile="glass_tinted",
    )

    # Double hinged door leaves (swinging into interior_side by open_deg)
    clear_w = max(0.80, width - jamb_w * 2.0 - 0.016)
    leaf_w = clear_w * 0.5 - 0.004
    leaf_h = spring_z - 0.072
    leaf_t = 0.056
    z0 = 0.024

    for side_lr in (-1, 1):
        hinge_x = side_lr * (clear_w * 0.5)
        swing = math.radians(open_deg) * (-side_lr) * (-interior_side)
        leaf_rot = rot_z + swing

        def _leaf_world(ux: float, uy: float, uz: float) -> Tuple[float, float, float]:
            dx = -side_lr * ux
            c, s = math.cos(swing), math.sin(swing)
            lx = hinge_x + dx * c - uy * s
            ly = dx * s + uy * c
            return _to_world(lx, ly, z0 + uz)

        def _lbox(ux: float, uy: float, uz: float, sx: float, sy: float, sz: float, col: str, tl: str, bev: float = 0.0035) -> None:
            add_beveled_box(group, _leaf_world(ux, uy, uz), (sx, sy, sz), color=col, tile=tl, bevel=bev, rot_z=leaf_rot)

        stile_w = 0.105
        col_leaf = COL_WALNUT if solid_walnut else COL_TRIM
        tl_leaf = "door_wood" if solid_walnut else "trim_paint"

        # Outer & meeting stiles + kick & top rails
        _lbox(stile_w * 0.5, 0.0, leaf_h * 0.5, stile_w, leaf_t, leaf_h, col_leaf, tl_leaf)
        _lbox(leaf_w - stile_w * 0.5, 0.0, leaf_h * 0.5, stile_w, leaf_t, leaf_h, col_leaf, tl_leaf)
        kick_h = 0.56 if not solid_walnut else 0.18
        _lbox(leaf_w * 0.5, 0.0, kick_h * 0.5, leaf_w - stile_w * 1.9, leaf_t, kick_h, col_leaf, tl_leaf)
        _lbox(leaf_w * 0.5, 0.0, leaf_h - 0.06, leaf_w - stile_w * 1.9, leaf_t, 0.11, col_leaf, tl_leaf)

        if solid_walnut:
            _lbox(leaf_w * 0.5, 0.0, leaf_h * 0.5, leaf_w - 0.014, leaf_t - 0.018, leaf_h - 0.014, COL_WALNUT_LIGHT, "door_wood", bev=0.0)
            for p_z0, p_z1 in ((0.22, 1.05), (1.22, 2.25), (2.42, leaf_h - 0.16)):
                pz = 0.5 * (p_z0 + p_z1)
                ph = p_z1 - p_z0
                pw = leaf_w - stile_w * 2.2
                _lbox(leaf_w * 0.5, 0.0, p_z0 - 0.055, leaf_w - stile_w * 1.9, leaf_t, 0.095, col_leaf, tl_leaf, bev=0.003)
                for s_face in (-1, 1):
                    py = s_face * (leaf_t * 0.5 - 0.002)
                    _lbox(leaf_w * 0.5, py, p_z0 + 0.016, pw, 0.020, 0.030, COL_GOLD, "hardware_brass", bev=0.0)
                    _lbox(leaf_w * 0.5, py, p_z1 - 0.016, pw, 0.020, 0.030, COL_GOLD, "hardware_brass", bev=0.0)
                    _lbox(stile_w + 0.022, py, pz, 0.030, 0.020, ph - 0.06, COL_GOLD, "hardware_brass", bev=0.0)
                    _lbox(leaf_w - stile_w - 0.022, py, pz, 0.030, 0.020, ph - 0.06, COL_GOLD, "hardware_brass", bev=0.0)
        else:
            for s_face in (-1, 1):
                _lbox(leaf_w * 0.5, s_face * (leaf_t * 0.5 + 0.004), kick_h * 0.5, leaf_w - stile_w * 2.4, 0.018, kick_h - 0.14, COL_GOLD, "hardware_brass", bev=0.0)
            gz0 = kick_h + 0.005
            gz1 = leaf_h - 0.115
            gh = gz1 - gz0
            gw = leaf_w - stile_w * 2.0
            _lbox(leaf_w * 0.5, 0.0, gz0 + gh * 0.5, 0.026, 0.040, gh - 0.006, COL_TRIM, "trim_paint", bev=0.0)
            for k in range(1, 4):
                _lbox(leaf_w * 0.5, 0.0, gz0 + gh * (k / 4.0), gw - 0.006, 0.036, 0.024, COL_TRIM, "trim_paint", bev=0.0)
            _lbox(leaf_w * 0.5, 0.0, gz0 + gh * 0.5, gw - 0.008, 0.008, gh - 0.008, COL_GLASS_SKY, "glass_tinted", bev=0.0)

        # Ornate gilded brass pull handles on both faces
        hx = leaf_w - 0.062
        for s_face in (-1, 1):
            _lbox(hx, s_face * (leaf_t * 0.5 + 0.010), 1.12, 0.044, 0.018, 0.24, COL_GOLD, "hardware_brass", bev=0.0)
            _lbox(hx, s_face * (leaf_t * 0.5 + 0.044), 1.12, 0.024, 0.022, 0.18, COL_GOLD_DEEP, "hardware_brass", bev=0.003)
            _lbox(hx, s_face * (leaf_t * 0.5 + 0.028), 1.20, 0.022, 0.032, 0.022, COL_GOLD, "hardware_brass", bev=0.0)
            _lbox(hx, s_face * (leaf_t * 0.5 + 0.028), 1.04, 0.022, 0.032, 0.022, COL_GOLD, "hardware_brass", bev=0.0)

    # Interior & exterior 3D architrave surrounds
    _add_arch_surround(
        group,
        origin,
        rot_z=rot_z,
        width=width,
        spring_z=spring_z,
        arch_rise=arch_rise,
        face_y=interior_side * (wall_thickness * 0.5),
        side=interior_side,
        molding_w=0.155,
        molding_d=0.056,
        segments=10,
    )
    _add_arch_surround(
        group,
        origin,
        rot_z=rot_z,
        width=width,
        spring_z=spring_z,
        arch_rise=arch_rise,
        face_y=-interior_side * (wall_thickness * 0.5),
        side=-interior_side,
        molding_w=0.135,
        molding_d=0.034,
        segments=10,
        keystone_color=COL_MARBLE_WARM,
        keystone_tile="marble",
    )


def _add_draped_curtain_pair(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    *,
    rot_z: float,
    opening_width: float,
    top_z: float,
    bottom_z: float,
    face_y: float,
    side: int,
    fabric_color: str = COL_CRIMSON,
    fabric_tile: str = "carpet",
    accent_color: str = COL_GOLD,
    accent_tile: str = "hardware_brass",
) -> None:
    """Build lush Romance Fantasy floor-length pleated draped curtains + pelmet & gold tiebacks.

    Sized cleanly inside the 3.20 m structural bay so adjacent pelmets never meet or collide with pilasters.
    """
    ox, oy, oz = origin

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (ox + wx, oy + wy, oz + lz)

    # Keep total pelmet cap width <= opening_width + 0.72 (< 2.95 m inside 3.20 m bay!)
    rod_w = opening_width + 0.56
    rod_y = face_y + side * 0.145
    add_beveled_box(
        group,
        _to_world(0.0, face_y + side * 0.135, top_z + 0.08),
        (rod_w + 0.08, 0.24, 0.17),
        color=accent_color,
        tile=accent_tile,
        bevel=0.007,
        rot_z=rot_z,
    )
    add_beveled_box(
        group,
        _to_world(0.0, face_y + side * 0.145, top_z + 0.192),
        (rod_w + 0.16, 0.28, 0.052),
        color=COL_TRIM,
        tile="trim_paint",
        bevel=0.005,
        rot_z=rot_z,
    )
    group.rail(
        _to_world(-rod_w * 0.5 - 0.04, rod_y, top_z - 0.02),
        _to_world(rod_w * 0.5 + 0.04, rod_y, top_z - 0.02),
        radius=0.020,
        color=accent_color,
        sides=8,
        tile=accent_tile,
        bevel_ends=False,
    )

    # Central swagged crimson valance under pelmet
    swags = 8
    val_rings = []
    for i in range(swags + 1):
        t = i / float(swags)
        lx = -opening_width * 0.46 + opening_width * 0.92 * t
        sag = 0.26 * math.sin(math.pi * t)
        val_rings.append(
            [
                _to_world(lx, face_y + side * 0.15, top_z - 0.01),
                _to_world(lx, face_y + side * 0.22, top_z - 0.01),
                _to_world(lx, face_y + side * 0.20, top_z - 0.17 - sag),
                _to_world(lx, face_y + side * 0.14, top_z - 0.15 - sag),
            ]
        )
    group.rings(val_rings, color=fabric_color, tile=fabric_tile)

    # Left & Right floor-length sculpted pleated velvet curtain panels (cinched at tieback)
    total_h = max(1.20, top_z - bottom_z)
    z_tie = bottom_z + total_h * 0.34
    n_z = 6
    n_pleats = 4

    for sx in (-1, 1):
        outer_x = sx * (opening_width * 0.5 + 0.30)
        rings = []
        for iz in range(n_z + 1):
            t = iz / float(n_z)
            lz = bottom_z + 0.006 + (total_h - 0.02) * t
            dist_tie = abs(lz - z_tie) / (total_h * 0.34)
            cinch = math.exp(-(dist_tie ** 2) * 2.2)
            panel_w = 0.48 - 0.26 * cinch + 0.07 * (1.0 - t)
            x_outer = outer_x
            x_inner = outer_x - sx * panel_w
            y_base = face_y + side * (0.105 + 0.025 * (1.0 - cinch))
            amp = 0.042 * (1.0 - 0.38 * cinch)
            thick = 0.024

            front_pts: List[Tuple[float, float, float]] = []
            back_pts: List[Tuple[float, float, float]] = []
            steps_u = n_pleats * 2
            for iu in range(steps_u + 1):
                u = iu / float(steps_u)
                lx = x_outer + (x_inner - x_outer) * u
                wave = amp * math.sin(math.pi * n_pleats * u)
                fy = y_base + side * (thick + max(0.0, wave) + 0.015 * math.sin(math.pi * u))
                by = y_base + side * (max(0.0, wave) * 0.35)
                front_pts.append(_to_world(lx, fy, lz))
                back_pts.append(_to_world(lx, by, lz))
            rings.append(front_pts + list(reversed(back_pts)))

        group.rings(rings, color=fabric_color, tile=fabric_tile)

        # Gilded braided tieback sash & hanging tassel
        tie_x = outer_x - sx * 0.12
        add_beveled_box(
            group,
            _to_world(tie_x, face_y + side * 0.135, z_tie),
            (0.26, 0.115, 0.052),
            color=accent_color,
            tile=accent_tile,
            bevel=0.007,
            rot_z=rot_z,
        )
        group.rail(
            _to_world(outer_x - sx * 0.22, face_y + side * 0.185, z_tie - 0.02),
            _to_world(outer_x - sx * 0.22, face_y + side * 0.185, z_tie - 0.20),
            radius=0.022,
            color=accent_color,
            sides=6,
            tile=accent_tile,
            bevel_ends=False,
        )


def _add_wall_sconce(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    *,
    rot_z: float,
    side: int = -1,
) -> None:
    """Build an ornate Baroque twin-branch gilded wall candle sconce (촛대 스콘스)."""
    ox, oy, oz = origin

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (ox + wx, oy + wy, oz + lz)

    add_beveled_box(
        group,
        _to_world(0.0, side * 0.016, 0.0),
        (0.15, 0.036, 0.38),
        color=COL_GOLD,
        tile="hardware_brass",
        bevel=0.006,
        rot_z=rot_z,
    )
    add_beveled_box(
        group,
        _to_world(0.0, side * 0.032, 0.0),
        (0.095, 0.022, 0.25),
        color=COL_GOLD_DEEP,
        tile="hardware_brass",
        bevel=0.0,
        rot_z=rot_z,
    )
    group.rail(
        _to_world(0.0, side * 0.028, -0.185),
        _to_world(0.0, side * 0.028, -0.255),
        radius=0.016,
        color=COL_GOLD,
        sides=6,
        tile="hardware_brass",
        bevel_ends=False,
    )

    # Twin curved S-scroll candle arms (single continuous lofted struts -> 0 welded edges!)
    for sx in (-1, 1):
        p0 = _to_world(sx * 0.026, side * 0.032, -0.04)
        p1 = _to_world(sx * 0.12, side * 0.16, -0.08)
        p2 = _to_world(sx * 0.17, side * 0.21, 0.06)
        _add_bent_strut(group, (p0, p1, p2), radius=0.012, sides=6, color=COL_GOLD, tile="hardware_brass")

        cx_l, cy_l, cz_l = sx * 0.17, side * 0.21, 0.06
        group.rings(
            [
                [_to_world(cx_l + rad * math.cos(TAU * j / 6), cy_l + rad * math.sin(TAU * j / 6), cz_l + dz) for j in range(6)]
                for (rad, dz) in ((0.022, -0.008), (0.048, 0.012), (0.024, 0.018))
            ],
            color=COL_GOLD,
            tile="hardware_brass",
        )
        group.rail(
            _to_world(cx_l, cy_l, cz_l + 0.014),
            _to_world(cx_l, cy_l, cz_l + 0.21),
            radius=0.016,
            color=COL_CANDLE_WAX,
            sides=6,
            tile="plaster",
            bevel_ends=False,
        )
        group.rings(
            [
                [_to_world(cx_l + rad * math.cos(TAU * j / 6), cy_l + rad * math.sin(TAU * j / 6), cz_l + 0.208 + dz) for j in range(6)]
                for (rad, dz) in ((0.005, 0.0), (0.015, 0.026), (0.004, 0.072))
            ],
            color=COL_FLAME_WARM,
            tile="trim_paint",
        )


def _add_wainscoting_section(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    *,
    rot_z: float,
    x0: float,
    x1: float,
    face_y: float,
    side: int,
    z_base: float,
    height: float = 1.12,
    panels: int = 2,
) -> None:
    """Build real 3D recessed Baroque wainscoting boiserie panels + dado chair rail."""
    span = x1 - x0
    if span < 0.28:
        return
    ox, oy, oz = origin

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (ox + wx, oy + wy, oz + lz)

    def _box(lx: float, ly: float, lz: float, sx: float, sy: float, sz: float, col: str, tl: str, bev: float = 0.004) -> None:
        add_beveled_box(group, _to_world(lx, ly, lz), (sx, sy, sz), color=col, tile=tl, bevel=bev, rot_z=rot_z)

    mid_x = 0.5 * (x0 + x1)
    _box(mid_x, face_y + side * 0.020, z_base + 0.085, span - 0.006, 0.044, 0.17, COL_MARBLE_WARM, "marble", bev=0.004)
    _box(mid_x, face_y + side * 0.028, z_base + height - 0.032, span - 0.004, 0.062, 0.068, COL_TRIM, "trim_paint", bev=0.004)
    _box(mid_x, face_y + side * 0.032, z_base + height - 0.078, span - 0.008, 0.040, 0.024, COL_GOLD, "hardware_brass", bev=0.0)

    n_p = max(1, int(panels))
    margin_x = 0.10
    gap = 0.11
    avail = span - margin_x * 2.0 - gap * (n_p - 1)
    if avail < 0.16:
        return
    pw = avail / n_p
    pz0 = z_base + 0.24
    pz1 = z_base + height - 0.14
    ph = pz1 - pz0
    p_mid_z = 0.5 * (pz0 + pz1)
    # Outer white raised boiserie frame & inner gilded fillet (verticals inset 6 mm in depth & 4 mm in height
    # so 14-bit Mobile meshopt quantization over 14-18 m span never welds abutting frame corners!)
    for i in range(n_p):
        px = x0 + margin_x + pw * 0.5 + i * (pw + gap)
        frame_t = 0.042
        _box(px, face_y + side * 0.018, pz0 + frame_t * 0.5, pw, 0.036, frame_t, COL_TRIM, "trim_paint", bev=0.0)
        _box(px, face_y + side * 0.018, pz1 - frame_t * 0.5, pw, 0.036, frame_t, COL_TRIM, "trim_paint", bev=0.0)
        _box(px - pw * 0.5 + frame_t * 0.5, face_y + side * 0.015, p_mid_z, frame_t - 0.004, 0.030, ph - frame_t * 2.0 - 0.008, COL_TRIM, "trim_paint", bev=0.0)
        _box(px + pw * 0.5 - frame_t * 0.5, face_y + side * 0.015, p_mid_z, frame_t - 0.004, 0.030, ph - frame_t * 2.0 - 0.008, COL_TRIM, "trim_paint", bev=0.0)
        if pw > 0.26 and ph > 0.26:
            gw, gh = pw - 0.11, ph - 0.11
            _box(px, face_y + side * 0.014, pz0 + 0.062, gw, 0.024, 0.018, COL_GOLD, "hardware_brass", bev=0.0)
            _box(px, face_y + side * 0.014, pz1 - 0.062, gw, 0.024, 0.018, COL_GOLD, "hardware_brass", bev=0.0)
            _box(px - gw * 0.5 + 0.009, face_y + side * 0.011, p_mid_z, 0.014, 0.018, gh - 0.046, COL_GOLD, "hardware_brass", bev=0.0)
            _box(px + gw * 0.5 - 0.009, face_y + side * 0.011, p_mid_z, 0.014, 0.018, gh - 0.046, COL_GOLD, "hardware_brass", bev=0.0)


def _add_arched_wall_niche(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    *,
    rot_z: float,
    face_y: float,
    side: int,
    width: float = 1.25,
    height: float = 2.65,
) -> None:
    """Build a proud Baroque framed arched wall niche with gilded shell fan & stone corbel shelf."""
    ox, oy, oz = origin

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (ox + wx, oy + wy, oz + lz)

    spring_z = height - width * 0.5
    add_beveled_box(
        group,
        _to_world(0.0, face_y + side * 0.008, spring_z * 0.5),
        (width - 0.04, 0.018, spring_z - 0.02),
        color=COL_PLASTER_SHADOW,
        tile="plaster",
        bevel=0.0,
        rot_z=rot_z,
    )
    # Central gilded shell hub + radially separated fan rays (start at r=0.10 -> 0 welded edges!)
    add_beveled_box(
        group,
        _to_world(0.0, face_y + side * 0.022, spring_z + 0.05),
        (0.18, 0.032, 0.10),
        color=COL_GOLD,
        tile="hardware_brass",
        bevel=0.005,
        rot_z=rot_z,
    )
    for k in range(1, 6):
        a = math.pi * (k / 6.0)
        ca, sa = math.cos(a), math.sin(a)
        r_fan = width * 0.44
        group.rail(
            _to_world(0.11 * ca, face_y + side * 0.020, spring_z + 0.05 + 0.11 * sa),
            _to_world(r_fan * ca, face_y + side * 0.022, spring_z + 0.03 + r_fan * sa),
            radius=0.014,
            color=COL_GOLD,
            sides=6,
            tile="hardware_brass",
            bevel_ends=False,
        )

    _add_arch_surround(
        group,
        origin,
        rot_z=rot_z,
        width=width,
        spring_z=spring_z,
        arch_rise=width * 0.48,
        face_y=face_y,
        side=side,
        molding_w=0.125,
        molding_d=0.064,
        segments=10,
    )
    add_beveled_box(
        group,
        _to_world(0.0, face_y + side * 0.11, -0.03),
        (width + 0.24, 0.24, 0.075),
        color=COL_MARBLE_WARM,
        tile="marble",
        bevel=0.005,
        rot_z=rot_z,
    )
    add_beveled_box(
        group,
        _to_world(0.0, face_y + side * 0.075, -0.105),
        (width * 0.72, 0.16, 0.085),
        color=COL_TRIM,
        tile="trim_paint",
        bevel=0.004,
        rot_z=rot_z,
    )


def _add_entablature_cornice(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    *,
    rot_z: float,
    length: float,
    face_y: float,
    side: int,
    z_bottom: float = Z_ENTAB,
) -> None:
    """Build a classical 3-tier Baroque entablature (architrave + gilded dentil frieze + cornice)."""
    ox, oy, oz = origin

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (ox + wx, oy + wy, oz + lz)

    def _box(lx: float, ly: float, lz: float, sx: float, sy: float, sz: float, col: str, tl: str, bev: float = 0.005) -> None:
        add_beveled_box(group, _to_world(lx, ly, lz), (sx, sy, sz), color=col, tile=tl, bevel=bev, rot_z=rot_z)

    l_eff = length - 0.012
    _box(0.0, face_y + side * 0.055, z_bottom + 0.08, l_eff, 0.12, 0.16, COL_TRIM, "trim_paint")
    _box(0.0, face_y + side * 0.080, z_bottom + 0.175, l_eff - 0.008, 0.15, 0.035, COL_GOLD, "hardware_brass", bev=0.0)
    _box(0.0, face_y + side * 0.045, z_bottom + 0.30, l_eff - 0.014, 0.095, 0.22, COL_PLASTER_SHADOW, "plaster", bev=0.0)
    _box(0.0, face_y + side * 0.135, z_bottom + 0.46, l_eff, 0.28, 0.11, COL_MARBLE_WARM, "marble", bev=0.005)
    _box(0.0, face_y + side * 0.165, z_bottom + 0.555, l_eff + 0.008, 0.34, 0.085, COL_TRIM, "trim_paint", bev=0.005)

    # Bold gilded dentil brackets readable even from 24 mm establishing shots
    dentil_step = 0.56
    n_dent = max(2, int((l_eff - 0.30) / dentil_step))
    for i in range(n_dent):
        dx = -0.5 * (n_dent - 1) * dentil_step + i * dentil_step
        _box(dx, face_y + side * 0.115, z_bottom + 0.38, 0.11, 0.11, 0.072, COL_GOLD, "hardware_brass", bev=0.0)


def _add_engaged_pilaster(
    group: MeshGroup,
    origin: Tuple[float, float, float],
    *,
    rot_z: float,
    lx: float,
    face_y: float,
    side: int,
    z_base: float,
    z_top: float,
) -> None:
    """Build an engaged fluted wall pilaster with marble plinth & gilded Corinthian capital."""
    ox, oy, oz = origin

    def _to_world(x: float, y: float, z: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(x, y, rot_z)
        return (ox + wx, oy + wy, oz + z)

    plinth_h = 0.48
    cap_h = 0.36
    shaft_z0 = z_base + plinth_h
    shaft_z1 = z_top - cap_h
    shaft_h = max(0.30, shaft_z1 - shaft_z0)

    add_beveled_box(group, _to_world(lx, face_y + side * 0.075, z_base + plinth_h * 0.5), (0.48, 0.16, plinth_h), color=COL_MARBLE_WARM, tile="marble", bevel=0.005, rot_z=rot_z)
    add_beveled_box(group, _to_world(lx, face_y + side * 0.055, shaft_z0 + shaft_h * 0.5), (0.38, 0.12, shaft_h), color=COL_MARBLE_LIGHT, tile="marble", bevel=0.004, rot_z=rot_z)
    for rx_off in (-0.11, 0.0, 0.11):
        add_beveled_box(group, _to_world(lx + rx_off, face_y + side * 0.118, shaft_z0 + shaft_h * 0.5), (0.040, 0.022, shaft_h - 0.12), color=COL_TRIM, tile="trim_paint", bevel=0.0, rot_z=rot_z)
    add_beveled_box(group, _to_world(lx, face_y + side * 0.080, shaft_z1 + cap_h * 0.38), (0.44, 0.17, cap_h * 0.68), color=COL_GOLD, tile="hardware_brass", bevel=0.005, rot_z=rot_z)
    add_beveled_box(group, _to_world(lx, face_y + side * 0.105, z_top - cap_h * 0.16), (0.54, 0.22, cap_h * 0.32), color=COL_MARBLE_WARM, tile="marble", bevel=0.005, rot_z=rot_z)


def _add_balustrade_span(
    group: MeshGroup,
    start: Tuple[float, float, float],
    end: Tuple[float, float, float],
    *,
    height: float = 1.02,
    spacing: float = 0.28,
    include_start_pier: bool = True,
    include_end_pier: bool = True,
    stone_color: str = COL_MARBLE_LIGHT,
    stone_tile: str = "marble",
    trim_color: str = COL_MARBLE_WARM,
) -> None:
    """Build a corner-safe classical stone balustrade with turned vase balusters (zero duplicate piers)."""
    a = Vector(start)
    b = Vector(end)
    span_vec = b - a
    horiz = math.hypot(span_vec.x, span_vec.y)
    if horiz < 0.25:
        return
    pier_w = 0.24
    shoe_h = 0.11
    shoe_w = 0.17
    rail_h = 0.095
    rail_w = 0.21

    for flag, pt in ((include_start_pier, a), (include_end_pier, b)):
        if not flag:
            continue
        add_beveled_box(group, (pt.x, pt.y, pt.z + 0.08), (pier_w + 0.04, pier_w + 0.04, 0.16), color=trim_color, tile=stone_tile, bevel=0.004)
        add_beveled_box(group, (pt.x, pt.y, pt.z + 0.155 + (height - 0.22) * 0.5), (pier_w, pier_w, height - 0.21), color=stone_color, tile=stone_tile, bevel=0.005)
        add_beveled_box(group, (pt.x, pt.y, pt.z + height - 0.025), (pier_w + 0.06, pier_w + 0.06, 0.095), color=trim_color, tile=stone_tile, bevel=0.005)
        add_beveled_box(group, (pt.x, pt.y, pt.z + height + 0.040), (pier_w - 0.04, pier_w - 0.04, 0.042), color=COL_GOLD, tile="hardware_brass", bevel=0.004)

    dir_h = Vector((span_vec.x, span_vec.y, 0.0)).normalized()
    p_s = a + dir_h * (pier_w * 0.40)
    p_e = b - dir_h * (pier_w * 0.40)
    group.timber(
        tuple(p_s + Vector((0, 0, shoe_h * 0.5 + 0.002))),
        tuple(p_e + Vector((0, 0, shoe_h * 0.5 + 0.002))),
        shoe_w,
        shoe_h,
        color=trim_color,
        tile=stone_tile,
        bevel=0.004,
    )
    group.timber(
        tuple(p_s + Vector((0, 0, height - rail_h * 0.5 - 0.004))),
        tuple(p_e + Vector((0, 0, height - rail_h * 0.5 - 0.004))),
        rail_w,
        rail_h,
        color=trim_color,
        tile=stone_tile,
        bevel=0.006,
    )

    usable = max(0.0, horiz - pier_w * 1.15)
    count = max(1, int(round(usable / max(0.15, spacing))))
    z_bot = shoe_h - 0.006
    z_top = height - rail_h + 0.004
    bh = max(0.20, z_top - z_bot)
    sides = 8

    for i in range(1, count + 1):
        t = i / float(count + 1)
        p = a.lerp(b, t)
        r0 = 0.046
        prof = [
            (r0 * 1.16, p.z + z_bot),
            (r0 * 0.72, p.z + z_bot + bh * 0.16),
            (r0 * 1.32, p.z + z_bot + bh * 0.38),
            (r0 * 0.64, p.z + z_bot + bh * 0.76),
            (r0 * 1.14, p.z + z_top),
        ]
        group.rings(
            [
                [(p.x + rad * math.cos(TAU * j / sides), p.y + rad * math.sin(TAU * j / sides), zv) for j in range(sides)]
                for (rad, zv) in prof
            ],
            color=stone_color,
            tile=stone_tile,
        )


# ---------------------------------------------------------------------------
# Section 1: BG_Floor (Checkered Marble, Red Carpet, Grand Stair/Dais, Balcony)
# ---------------------------------------------------------------------------


def build_floor_and_balcony(floor: MeshGroup) -> None:
    """Build grounded hall slab, checkered marble floor, red carpet, grand stair/dais, & stone balcony."""
    # 1. Grounded foundation slab under entire main hall (Z = 0.000 .. 0.140)
    hall_w = X_HALL_E_OUT - X_HALL_W_OUT  # 11.34 m
    hall_d = Y_NORTH_OUT - Y_SOUTH_OUT  # 17.88 m
    add_beveled_box(
        floor,
        (X_HALL, 0.0, Z_SLAB_TOP * 0.5),
        (hall_w, hall_d, Z_SLAB_TOP),
        color=COL_STONE_BASE,
        tile="stone_plinth",
        bevel=0.005,
    )

    # 2. Checkered veined marble floor across main ballroom (grand 1.04 m palace marble slabs)
    tile_sz = 1.04
    gap = 0.006
    nx = 10
    ny = 11
    x_start = X_HALL - (nx * tile_sz) * 0.5
    y_start = -8.52
    for ix in range(nx):
        tx = x_start + (ix + 0.5) * tile_sz
        for iy in range(ny):
            ty = y_start + (iy + 0.5) * tile_sz
            if ty > STAIR_Y0 + 0.35:
                continue
            is_dark = (ix + iy) % 2 == 1
            if ix in (0, nx - 1) or iy == 0:
                col_t = COL_MARBLE_WARM if (ix + iy) % 2 == 0 else COL_MARBLE_LIGHT
            else:
                col_t = COL_MARBLE_DARK if is_dark else COL_MARBLE_LIGHT
            add_beveled_box(
                floor,
                (tx, ty, Z_SLAB_TOP + 0.009),
                (tile_sz - gap, tile_sz - gap, 0.022),
                color=col_t,
                tile="marble",
                bevel=0.0,
            )

    # Gold marble inlay border bands running along left & right colonnade lines
    for sx in (-1, 1):
        bx = X_HALL + sx * 3.10
        add_beveled_box(
            floor,
            (bx, -2.85, Z_FLOOR + 0.003),
            (0.085, 11.15, 0.008),
            color=COL_GOLD,
            tile="hardware_brass",
            bevel=0.0,
        )

    # 3. Grand Ceremonial 6-Step Marble Staircase & Raised Imperial Throne Dais
    n_steps = 6
    step_rise = (Z_DAIS - Z_FLOOR) / n_steps  # 0.15 m
    step_run = (STAIR_Y1 - STAIR_Y0) / n_steps  # 0.3167 m
    stair_w = 5.10

    mono_prof: List[Tuple[float, float]] = [(STAIR_Y0, Z_SLAB_TOP - 0.002), (STAIR_Y1 + 0.04, Z_SLAB_TOP - 0.002)]
    for i in range(n_steps - 1, -1, -1):
        sz = Z_FLOOR + (i + 1) * step_rise - 0.036
        mono_prof.append((STAIR_Y0 + (i + 1) * step_run + 0.02, sz))
        mono_prof.append((STAIR_Y0 + i * step_run, sz))
    hw_mono = stair_w * 0.5 - 0.004
    floor.rings(
        [
            [(X_HALL - hw_mono, py, pz) for (py, pz) in mono_prof],
            [(X_HALL + hw_mono, py, pz) for (py, pz) in mono_prof],
        ],
        color=COL_MARBLE_WARM,
        tile="marble",
    )

    carpet_w = 2.45
    for i in range(n_steps):
        y_front = STAIR_Y0 + i * step_run
        top_z = Z_FLOOR + (i + 1) * step_rise
        add_beveled_box(
            floor,
            (X_HALL, y_front + step_run * 0.5 - 0.014, top_z - 0.019),
            (stair_w + 0.04, step_run + 0.032, 0.038),
            color=COL_MARBLE_LIGHT,
            tile="marble",
            bevel=0.005,
        )
        add_beveled_box(
            floor,
            (X_HALL, y_front - 0.020, top_z - step_rise * 0.5 - 0.006),
            (carpet_w, 0.014, step_rise - 0.008),
            color=COL_CRIMSON,
            tile="carpet",
            bevel=0.0,
        )
        add_beveled_box(
            floor,
            (X_HALL, y_front + step_run * 0.5 - 0.010, top_z + 0.005),
            (carpet_w, step_run + 0.020, 0.014),
            color=COL_CRIMSON,
            tile="carpet",
            bevel=0.0,
        )
        for sx in (-1, 1):
            add_beveled_box(
                floor,
                (X_HALL + sx * (carpet_w * 0.5 - 0.065), y_front + step_run * 0.5 - 0.010, top_z + 0.007),
                (0.085, step_run + 0.016, 0.014),
                color=COL_GOLD,
                tile="hardware_brass",
                bevel=0.0,
            )
        floor.rail(
            (X_HALL - carpet_w * 0.5 - 0.06, y_front - 0.004, top_z - step_rise + 0.014),
            (X_HALL + carpet_w * 0.5 + 0.06, y_front - 0.004, top_z - step_rise + 0.014),
            radius=0.011,
            color=COL_GOLD,
            sides=6,
            tile="hardware_brass",
            bevel_ends=False,
        )

    # Flanking marble stair cheek walls & sloped classical balustrades
    for sx in (-1, 1):
        cx = X_HALL + sx * (stair_w * 0.5 + 0.16)
        cheek_prof = [
            (STAIR_Y0 - 0.12, Z_FLOOR - 0.002),
            (STAIR_Y1 + 0.12, Z_FLOOR - 0.002),
            (STAIR_Y1 + 0.12, Z_DAIS + 0.08),
            (STAIR_Y0 - 0.12, Z_FLOOR + step_rise + 0.08),
        ]
        floor.rings(
            [
                [(cx - 0.13, py, pz) for (py, pz) in cheek_prof],
                [(cx + 0.13, py, pz) for (py, pz) in cheek_prof],
            ],
            color=COL_MARBLE_WARM,
            tile="marble",
        )
        _add_balustrade_span(
            floor,
            (cx, STAIR_Y0 - 0.04, Z_FLOOR + step_rise + 0.06),
            (cx, STAIR_Y1 + 0.04, Z_DAIS + 0.04),
            height=0.88,
            spacing=0.30,
            include_start_pier=True,
            include_end_pier=True,
        )

    # Raised Imperial Throne Dais Platform (Z = 0.136 .. 1.060)
    dais_w = (X_HALL_E_IN - X_HALL_W_IN) - 0.02
    dais_d = DAIS_Y1 - DAIS_Y0
    dais_cy = 0.5 * (DAIS_Y0 + DAIS_Y1)
    add_beveled_box(
        floor,
        (X_HALL, dais_cy, Z_SLAB_TOP + (Z_DAIS - Z_SLAB_TOP - 0.022) * 0.5),
        (dais_w, dais_d, Z_DAIS - Z_SLAB_TOP - 0.022),
        color=COL_MARBLE_WARM,
        tile="marble",
        bevel=0.005,
    )
    for sx in (-1, 1):
        wing_x0 = (X_HALL_W_IN + 0.02) if sx < 0 else (X_HALL + stair_w * 0.5 + 0.30)
        wing_x1 = (X_HALL - stair_w * 0.5 - 0.30) if sx < 0 else (X_HALL_E_IN - 0.02)
        ww = wing_x1 - wing_x0
        wx = 0.5 * (wing_x0 + wing_x1)
        add_beveled_box(floor, (wx, DAIS_Y0 - 0.03, Z_DAIS - 0.032), (ww, 0.12, 0.068), color=COL_MARBLE_LIGHT, tile="marble", bevel=0.005)
        add_beveled_box(floor, (wx, DAIS_Y0 - 0.02, Z_FLOOR + 0.055), (ww, 0.09, 0.115), color=COL_STONE_BASE, tile="stone_plinth", bevel=0.004)
        add_beveled_box(floor, (wx, DAIS_Y0 - 0.015, 0.5 * (Z_FLOOR + Z_DAIS)), (ww - 0.36, 0.026, 0.44), color=COL_GOLD, tile="hardware_brass", bevel=0.0)
        add_beveled_box(floor, (wx, DAIS_Y0 - 0.022, 0.5 * (Z_FLOOR + Z_DAIS)), (ww - 0.46, 0.022, 0.34), color=COL_MARBLE_LIGHT, tile="marble", bevel=0.0)
        _add_balustrade_span(
            floor,
            (wing_x0 + 0.12, DAIS_Y0 + 0.14, Z_DAIS),
            (wing_x1 - 0.12, DAIS_Y0 + 0.14, Z_DAIS),
            height=0.88,
            spacing=0.30,
            include_start_pier=True,
            include_end_pier=False,
        )

    # Checkered marble tiles atop Dais platform
    dais_nx = 10
    dais_ny = 3
    d_tile = 1.04
    dx0 = X_HALL - (dais_nx * d_tile) * 0.5
    for ix in range(dais_nx):
        for iy in range(dais_ny):
            tx = dx0 + (ix + 0.5) * d_tile
            ty = DAIS_Y0 + 0.24 + (iy + 0.5) * d_tile
            if ty + d_tile * 0.5 > DAIS_Y1:
                continue
            col_t = COL_MARBLE_DARK if (ix + iy) % 2 == 1 else COL_MARBLE_LIGHT
            add_beveled_box(floor, (tx, ty, Z_DAIS - 0.010), (d_tile - 0.006, d_tile - 0.006, 0.022), color=col_t, tile="marble", bevel=0.0)

    # 4. Royal Red Carpet Runner (Main Hall + Dais Landing) with Gold Bullion Borders
    run_y0, run_y1 = -8.30, STAIR_Y0 - 0.02
    run_l = run_y1 - run_y0
    run_cy = 0.5 * (run_y0 + run_y1)
    add_beveled_box(floor, (X_HALL, run_cy, Z_FLOOR + 0.007), (carpet_w, run_l, 0.015), color=COL_CRIMSON, tile="carpet", bevel=0.003)
    for sx in (-1, 1):
        add_beveled_box(floor, (X_HALL + sx * (carpet_w * 0.5 - 0.075), run_cy, Z_FLOOR + 0.010), (0.095, run_l - 0.04, 0.013), color=COL_GOLD, tile="hardware_brass", bevel=0.0)
    add_beveled_box(floor, (X_HALL, run_y0 + 0.06, Z_FLOOR + 0.010), (carpet_w - 0.04, 0.095, 0.013), color=COL_GOLD, tile="hardware_brass", bevel=0.0)

    drun_l = 7.80 - STAIR_Y1
    drun_cy = 0.5 * (STAIR_Y1 + 7.80)
    add_beveled_box(floor, (X_HALL, drun_cy, Z_DAIS + 0.007), (carpet_w, drun_l, 0.015), color=COL_CRIMSON, tile="carpet", bevel=0.003)
    for sx in (-1, 1):
        add_beveled_box(floor, (X_HALL + sx * (carpet_w * 0.5 - 0.075), drun_cy, Z_DAIS + 0.010), (0.095, drun_l - 0.04, 0.013), color=COL_GOLD, tile="hardware_brass", bevel=0.0)

    # 5. Exterior Moonlit Imperial Balcony Terrace & Classical Stone Balustrade
    balc_w = (X_HALL_W_OUT - 0.004) - X_BALC_OUT  # 2.596 m
    balc_d = BALC_Y1 - BALC_Y0  # 10.00 m
    balc_cx = X_BALC_OUT + balc_w * 0.5
    balc_cy = 0.5 * (BALC_Y0 + BALC_Y1)
    add_beveled_box(
        floor,
        (balc_cx, balc_cy, 0.074),
        (balc_w, balc_d, 0.148),
        color=COL_STONE_BASE,
        tile="stone_plinth",
        bevel=0.006,
    )
    # Beveled outdoor stone terrace flagstones
    for ix in range(2):
        fx = X_BALC_OUT + 0.18 + (ix + 0.5) * 1.12
        for iy in range(10):
            fy = BALC_Y0 + 0.16 + (iy + 0.5) * 0.968
            col_f = COL_MARBLE_WARM if (ix + iy) % 2 == 0 else COL_MARBLE_LIGHT
            add_beveled_box(floor, (fx, fy, 0.157), (1.112, 0.960, 0.022), color=col_f, tile="marble", bevel=0.0)

    # Grand Stone Balustrade wrapping West, South, & North balcony edges (zero duplicate corner piers!)
    bx_rail = X_BALC_OUT + 0.18  # -6.82
    by_s = BALC_Y0 + 0.18  # -6.82
    by_n = BALC_Y1 - 0.18  # +2.82
    bx_wall = X_HALL_W_OUT - 0.14  # -4.54

    west_stops = (by_s, -3.60, -0.40, by_n)
    for idx in range(len(west_stops) - 1):
        _add_balustrade_span(
            floor,
            (bx_rail, west_stops[idx], Z_BALC_FLOOR),
            (bx_rail, west_stops[idx + 1], Z_BALC_FLOOR),
            height=1.04,
            spacing=0.29,
            include_start_pier=(idx == 0),
            include_end_pier=True,
        )
    _add_balustrade_span(
        floor,
        (bx_rail, by_s, Z_BALC_FLOOR),
        (bx_wall, by_s, Z_BALC_FLOOR),
        height=1.04,
        spacing=0.29,
        include_start_pier=False,
        include_end_pier=True,
    )
    _add_balustrade_span(
        floor,
        (bx_rail, by_n, Z_BALC_FLOOR),
        (bx_wall, by_n, Z_BALC_FLOOR),
        height=1.04,
        spacing=0.29,
        include_start_pier=False,
        include_end_pier=True,
    )


# ---------------------------------------------------------------------------
# Section 2: 4 Cutaway Walls (North, South, West Balcony Doors, East Windows)
# ---------------------------------------------------------------------------


def _add_vault_tympanum_wall(
    group: MeshGroup,
    *,
    y_center: float,
    interior_side: int,
    thickness: float = WALL_T - 0.008,
) -> None:
    """Build watertight semicircular gable tympanum + interior gilded imperial rose-arch relief."""
    rx = (X_HALL_E_OUT - X_HALL_W_OUT) * 0.5 - 0.006
    rz = Z_ROOF_TOP - Z_WALL_TOP - 0.01
    segs = 16
    pts_2d: List[Tuple[float, float]] = []
    for i in range(segs + 1):
        a = math.pi * (i / float(segs))
        pts_2d.append((X_HALL + rx * math.cos(a), Z_WALL_TOP - 0.004 + rz * math.sin(a)))
    ht = thickness * 0.5
    group.rings(
        [
            [(px, y_center - ht, pz) for (px, pz) in pts_2d],
            [(px, y_center + ht, pz) for (px, pz) in pts_2d],
        ],
        color=COL_PLASTER,
        tile="plaster",
    )

    # Interior gilded rose-arch framing ring & imperial sunburst medallion (enriches Front, Back & 3/4 views!)
    y_face = y_center + interior_side * (ht + 0.014)
    _add_arch_ring_bar(
        group,
        (X_HALL, y_face, 0.0),
        rot_z=0.0,
        rx=rx - 0.65,
        rz=rz - 0.42,
        spring_z=Z_WALL_TOP + 0.06,
        half_w=0.055,
        half_d=0.022,
        segments=14,
        color=COL_GOLD,
        tile="hardware_brass",
    )
    # Central imperial sunburst medallion
    med_z = Z_WALL_TOP + 0.96
    med_y0 = y_center + interior_side * (ht - 0.004)
    med_y1 = y_center + interior_side * (ht + 0.042)
    group.rings(
        [
            [(X_HALL + r * math.cos(TAU * j / 12), my, med_z + r * math.sin(TAU * j / 12)) for j in range(12)]
            for (r, my) in ((0.44, med_y0), (0.42, med_y1), (0.28, med_y1 + interior_side * 0.018))
        ],
        color=COL_GOLD,
        tile="hardware_brass",
    )
    for k in range(8):
        a = TAU * k / 8.0
        ca, sa = math.cos(a), math.sin(a)
        group.rail(
            (X_HALL + 0.46 * ca, y_face, med_z + 0.46 * sa),
            (X_HALL + 0.82 * ca, y_face, med_z + 0.82 * sa),
            radius=0.022,
            color=COL_GOLD_DEEP,
            sides=6,
            tile="hardware_brass",
            bevel_ends=False,
        )


def _add_palace_wall_with_arches(
    wall: MeshGroup,
    center: Tuple[float, float, float],
    *,
    length: float,
    thickness: float,
    height: float,
    openings: Sequence[WallOpening],
    rot_z: float,
    interior_side: int,
) -> None:
    """Build a lattice wall + quantization-safe recessed arched spandrels (6 mm face step)."""
    rect_openings = tuple(
        WallOpening(
            offset_x=op.offset_x,
            width=op.width,
            height=op.height,
            sill_z=op.sill_z,
            kind=op.kind,
            arch_rise=0.0,
            arch_segments=op.arch_segments,
        )
        for op in openings
    )
    add_wall_with_openings(
        wall,
        center,
        length=length,
        thickness=thickness,
        height=height,
        openings=rect_openings,
        rot_z=rot_z,
        color=COL_PLASTER,
        tile="plaster",
        baseboard_height=0.0,
        crown_height=0.0,
        interior_side=interior_side,
    )
    ox, oy, oz = center
    half_t = thickness * 0.5 - 0.008  # 8 mm inset per face -> strictly immune to 1.1 mm mobile quantization

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (ox + wx, oy + wy, oz + lz)

    for op in openings:
        if op.arch_rise <= 0.02:
            continue
        x0 = op.offset_x - op.width * 0.5 + 0.006
        x1 = op.offset_x + op.width * 0.5 - 0.006
        z0 = 0.0 if op.kind == "door" else max(0.0, op.sill_z)
        z_top = min(height - 0.08, z0 + op.height) - 0.006
        rx = 0.5 * (x1 - x0)
        mid_x = 0.5 * (x0 + x1)
        crown_margin = 0.025
        eff_rise = max(0.02, min(op.arch_rise, rx, (z_top - z0) * 0.45) - crown_margin)
        z_spring = z_top - eff_rise - crown_margin
        segs = max(8, int(op.arch_segments))
        prof_2d: List[Tuple[float, float]] = [(x0, z_top), (x1, z_top)]
        for i in range(segs + 1):
            a = math.pi * (i / float(segs))
            prof_2d.append((mid_x + rx * math.cos(a), z_spring + eff_rise * math.sin(a)))
        wall.rings(
            [
                [_to_world(px, -half_t, pz) for (px, pz) in prof_2d],
                [_to_world(px, half_t, pz) for (px, pz) in prof_2d],
            ],
            color=COL_PLASTER,
            tile="plaster",
        )


def build_wall_north(wall: MeshGroup) -> None:
    """Build North Imperial Sanctuary Wall (3 arched mullion windows, drapery, wainscoting, sconces)."""
    length = X_HALL_E_OUT - X_HALL_W_OUT
    h = Z_WALL_TOP - (Z_FLOOR - 0.004)
    cy = Y_NORTH_OUT - WALL_T * 0.5
    z0 = Z_FLOOR - 0.004

    openings = (
        WallOpening(offset_x=-3.50, width=1.58, height=3.15, sill_z=1.95, kind="window", arch_rise=0.72, arch_segments=10),
        WallOpening(offset_x=0.0, width=2.36, height=3.55, sill_z=1.85, kind="window", arch_rise=1.02, arch_segments=10),
        WallOpening(offset_x=3.50, width=1.58, height=3.15, sill_z=1.95, kind="window", arch_rise=0.72, arch_segments=10),
    )
    _add_palace_wall_with_arches(
        wall,
        (X_HALL, cy, z0),
        length=length,
        thickness=WALL_T,
        height=h,
        openings=openings,
        rot_z=0.0,
        interior_side=-1,
    )

    for op, cols in zip(openings, (2, 3, 2)):
        _add_arched_mullion_window(
            wall,
            (X_HALL + op.offset_x, cy, z0 + op.sill_z),
            rot_z=0.0,
            width=op.width,
            height=op.height,
            arch_rise=op.arch_rise,
            wall_thickness=WALL_T,
            interior_side=-1,
            cols=cols,
            rows=3,
        )

    _add_draped_curtain_pair(
        wall,
        (X_HALL, cy, 0.0),
        rot_z=0.0,
        opening_width=2.48,
        top_z=Z_ENTAB - 0.18,
        bottom_z=Z_DAIS + 0.005,
        face_y=-WALL_T * 0.5,
        side=-1,
    )

    for sx0, sx1, npan in ((-5.15, -2.55, 2), (-2.15, 2.15, 4), (2.55, 5.15, 2)):
        _add_wainscoting_section(
            wall,
            (X_HALL, cy, 0.0),
            rot_z=0.0,
            x0=sx0,
            x1=sx1,
            face_y=-WALL_T * 0.5,
            side=-1,
            z_base=Z_DAIS,
            height=0.96,
            panels=npan,
        )

    for px in (-4.80, -2.35, 2.35, 4.80):
        _add_engaged_pilaster(wall, (X_HALL, cy, 0.0), rot_z=0.0, lx=px, face_y=-WALL_T * 0.5, side=-1, z_base=Z_DAIS, z_top=Z_ENTAB)
        _add_wall_sconce(wall, (X_HALL + px, cy - WALL_T * 0.5 - 0.12, Z_DAIS + 2.15), rot_z=0.0, side=-1)
    _add_entablature_cornice(wall, (X_HALL, cy, 0.0), rot_z=0.0, length=length - 0.72, face_y=-WALL_T * 0.5, side=-1)

    _add_vault_tympanum_wall(wall, y_center=cy, interior_side=-1)


def build_wall_south(wall: MeshGroup) -> None:
    """Build South Ceremonial Entrance Wall (Grand double walnut doors, arched niches, sconces)."""
    length = X_HALL_E_OUT - X_HALL_W_OUT
    h = Z_WALL_TOP - (Z_FLOOR - 0.004)
    cy = Y_SOUTH_OUT + WALL_T * 0.5
    z0 = Z_FLOOR - 0.004

    door_op = WallOpening(offset_x=0.0, width=2.66, height=4.45, sill_z=0.0, kind="door", arch_rise=1.08, arch_segments=10)
    _add_palace_wall_with_arches(
        wall,
        (X_HALL, cy, z0),
        length=length,
        thickness=WALL_T,
        height=h,
        openings=(door_op,),
        rot_z=0.0,
        interior_side=1,
    )

    _add_french_arched_doors(
        wall,
        (X_HALL, cy, Z_FLOOR),
        rot_z=0.0,
        width=door_op.width,
        height=door_op.height,
        arch_rise=door_op.arch_rise,
        wall_thickness=WALL_T,
        interior_side=1,
        open_deg=14.0,
        solid_walnut=True,
    )

    for sx in (-3.45, 3.45):
        _add_arched_wall_niche(
            wall,
            (X_HALL + sx, cy, Z_FLOOR + 1.48),
            rot_z=0.0,
            face_y=WALL_T * 0.5,
            side=1,
            width=1.30,
            height=2.82,
        )
    _add_wainscoting_section(wall, (X_HALL, cy, 0.0), rot_z=0.0, x0=-5.15, x1=-1.75, face_y=WALL_T * 0.5, side=1, z_base=Z_FLOOR, height=1.18, panels=3)
    _add_wainscoting_section(wall, (X_HALL, cy, 0.0), rot_z=0.0, x0=1.75, x1=5.15, face_y=WALL_T * 0.5, side=1, z_base=Z_FLOOR, height=1.18, panels=3)

    for px in (-4.80, -2.05, 2.05, 4.80):
        _add_engaged_pilaster(wall, (X_HALL, cy, 0.0), rot_z=0.0, lx=px, face_y=WALL_T * 0.5, side=1, z_base=Z_FLOOR, z_top=Z_ENTAB)
        _add_wall_sconce(wall, (X_HALL + px, cy + WALL_T * 0.5 + 0.12, Z_FLOOR + 2.45), rot_z=0.0, side=1)
    _add_entablature_cornice(wall, (X_HALL, cy, 0.0), rot_z=0.0, length=length - 0.72, face_y=WALL_T * 0.5, side=1)

    _add_vault_tympanum_wall(wall, y_center=cy, interior_side=1)


def build_wall_west(wall: MeshGroup) -> None:
    """Build West Balcony Wall (3 French arched doors with center open, draped curtains, wainscoting, sconces)."""
    w_thick = WALL_T - 0.004
    cx = X_HALL_W_IN - w_thick * 0.5
    length = (Y_NORTH_IN - Y_SOUTH_IN) + 0.020
    z0 = Z_FLOOR - 0.002
    h = Z_WALL_TOP - z0
    rot_z = math.pi * 0.5

    openings = (
        WallOpening(offset_x=-5.20, width=1.88, height=4.45, sill_z=0.0, kind="door", arch_rise=0.86, arch_segments=10),
        WallOpening(offset_x=-2.00, width=2.08, height=4.58, sill_z=0.0, kind="door", arch_rise=0.94, arch_segments=10),
        WallOpening(offset_x=1.20, width=1.88, height=4.45, sill_z=0.0, kind="door", arch_rise=0.86, arch_segments=10),
        WallOpening(offset_x=6.95, width=1.72, height=3.15, sill_z=1.95, kind="window", arch_rise=0.76, arch_segments=10),
    )
    _add_palace_wall_with_arches(
        wall,
        (cx, 0.0, z0),
        length=length,
        thickness=w_thick,
        height=h,
        openings=openings,
        rot_z=rot_z,
        interior_side=-1,
    )

    for op, deg in zip(openings[:3], (10.0, 42.0, 10.0)):
        _add_french_arched_doors(
            wall,
            (cx, op.offset_x, Z_FLOOR),
            rot_z=rot_z,
            width=op.width,
            height=op.height,
            arch_rise=op.arch_rise,
            wall_thickness=w_thick,
            interior_side=-1,
            open_deg=deg,
            solid_walnut=False,
        )
        _add_draped_curtain_pair(
            wall,
            (cx, op.offset_x, 0.0),
            rot_z=rot_z,
            opening_width=op.width + 0.06,
            top_z=Z_ENTAB - 0.18,
            bottom_z=Z_FLOOR + 0.005,
            face_y=-w_thick * 0.5,
            side=-1,
        )

    op_throne = openings[3]
    _add_arched_mullion_window(
        wall,
        (cx, op_throne.offset_x, z0 + op_throne.sill_z),
        rot_z=rot_z,
        width=op_throne.width,
        height=op_throne.height,
        arch_rise=op_throne.arch_rise,
        wall_thickness=w_thick,
        interior_side=-1,
        cols=2,
        rows=3,
    )

    _add_arched_wall_niche(
        wall,
        (cx, 4.40, Z_DAIS + 1.05),
        rot_z=rot_z,
        face_y=-w_thick * 0.5,
        side=-1,
        width=1.32,
        height=2.76,
    )
    _add_wainscoting_section(wall, (cx, 0.0, 0.0), rot_z=rot_z, x0=-8.44, x1=-6.50, face_y=-w_thick * 0.5, side=-1, z_base=Z_FLOOR, height=1.18, panels=2)
    _add_wainscoting_section(wall, (cx, 0.0, 0.0), rot_z=rot_z, x0=2.55, x1=4.75, face_y=-w_thick * 0.5, side=-1, z_base=Z_FLOOR, height=1.18, panels=2)
    _add_wainscoting_section(wall, (cx, 0.0, 0.0), rot_z=rot_z, x0=4.80, x1=8.44, face_y=-w_thick * 0.5, side=-1, z_base=Z_DAIS, height=0.96, panels=3)

    for py in COL_YS:
        zb = Z_DAIS if py > DAIS_Y0 else Z_FLOOR
        _add_engaged_pilaster(wall, (cx, 0.0, 0.0), rot_z=rot_z, lx=py, face_y=-w_thick * 0.5, side=-1, z_base=zb, z_top=Z_ENTAB)
        _add_wall_sconce(wall, (cx + w_thick * 0.5 + 0.12, py, zb + 2.40 if zb == Z_FLOOR else zb + 2.05), rot_z=rot_z, side=-1)

    for py in (-6.80, -3.60, -0.40, 2.80):
        _add_engaged_pilaster(wall, (cx, 0.0, 0.0), rot_z=rot_z, lx=py, face_y=w_thick * 0.5, side=1, z_base=Z_BALC_FLOOR, z_top=Z_ENTAB)
    _add_entablature_cornice(wall, (cx, 0.0, 0.0), rot_z=rot_z, length=length - 0.10, face_y=-w_thick * 0.5, side=-1)


def build_wall_east(wall: MeshGroup) -> None:
    """Build East Grand Window Wall (4 towering arched mullion windows, draped curtains, wainscoting, sconces)."""
    w_thick = WALL_T - 0.004
    cx = X_HALL_E_IN + w_thick * 0.5
    length = (Y_NORTH_IN - Y_SOUTH_IN) + 0.020
    z0 = Z_FLOOR - 0.002
    h = Z_WALL_TOP - z0
    rot_z = math.pi * 0.5

    openings = (
        WallOpening(offset_x=-5.20, width=1.90, height=4.00, sill_z=1.08, kind="window", arch_rise=0.88, arch_segments=10),
        WallOpening(offset_x=-2.00, width=2.00, height=4.10, sill_z=1.08, kind="window", arch_rise=0.92, arch_segments=10),
        WallOpening(offset_x=1.20, width=1.90, height=4.00, sill_z=1.08, kind="window", arch_rise=0.88, arch_segments=10),
        WallOpening(offset_x=6.95, width=1.72, height=3.15, sill_z=1.95, kind="window", arch_rise=0.76, arch_segments=10),
    )
    _add_palace_wall_with_arches(
        wall,
        (cx, 0.0, z0),
        length=length,
        thickness=w_thick,
        height=h,
        openings=openings,
        rot_z=rot_z,
        interior_side=1,
    )

    for idx, op in enumerate(openings):
        _add_arched_mullion_window(
            wall,
            (cx, op.offset_x, z0 + op.sill_z),
            rot_z=rot_z,
            width=op.width,
            height=op.height,
            arch_rise=op.arch_rise,
            wall_thickness=w_thick,
            interior_side=1,
            cols=3 if idx < 3 else 2,
            rows=4 if idx < 3 else 3,
        )
        if idx < 3:
            _add_draped_curtain_pair(
                wall,
                (cx, op.offset_x, 0.0),
                rot_z=rot_z,
                opening_width=op.width + 0.06,
                top_z=Z_ENTAB - 0.18,
                bottom_z=Z_FLOOR + 0.005,
                face_y=w_thick * 0.5,
                side=1,
            )

    _add_arched_wall_niche(
        wall,
        (cx, 4.40, Z_DAIS + 1.05),
        rot_z=rot_z,
        face_y=w_thick * 0.5,
        side=1,
        width=1.32,
        height=2.76,
    )
    for sx0, sx1, npan in ((-8.44, -6.95, 1), (-6.58, -3.78, 2), (-3.40, -0.58, 2), (-0.20, 2.62, 2), (2.98, 4.75, 1)):
        _add_wainscoting_section(wall, (cx, 0.0, 0.0), rot_z=rot_z, x0=sx0, x1=sx1, face_y=w_thick * 0.5, side=1, z_base=Z_FLOOR, height=1.10, panels=npan)
    _add_wainscoting_section(wall, (cx, 0.0, 0.0), rot_z=rot_z, x0=4.80, x1=8.44, face_y=w_thick * 0.5, side=1, z_base=Z_DAIS, height=0.96, panels=3)

    for py in COL_YS:
        zb = Z_DAIS if py > DAIS_Y0 else Z_FLOOR
        _add_engaged_pilaster(wall, (cx, 0.0, 0.0), rot_z=rot_z, lx=py, face_y=w_thick * 0.5, side=1, z_base=zb, z_top=Z_ENTAB)
        _add_wall_sconce(wall, (cx - w_thick * 0.5 - 0.12, py, zb + 2.40 if zb == Z_FLOOR else zb + 2.05), rot_z=rot_z, side=1)

    _add_entablature_cornice(wall, (cx, 0.0, 0.0), rot_z=rot_z, length=length - 0.10, face_y=w_thick * 0.5, side=1)


# ---------------------------------------------------------------------------
# Section 3: BG_Ceiling (Ribbed Arch Vault + 3 Multi-Tier Crystal Chandeliers)
# ---------------------------------------------------------------------------


def _add_crystal_chandelier(
    ceiling: MeshGroup,
    *,
    cx: float,
    cy: float,
    z_mount: float = Z_VAULT_INNER_APEX,
) -> None:
    """Build a grand 3-tier gilded Baroque crystal chandelier with glowing emissive candle flames."""
    # Sculpted gilded ceiling medallion rosette
    ceiling.rings(
        [
            [(cx + r * math.cos(TAU * j / 12), cy + r * math.sin(TAU * j / 12), z_mount + dz) for j in range(12)]
            for (r, dz) in ((0.44, 0.02), (0.46, -0.05), (0.30, -0.10), (0.09, -0.17))
        ],
        color=COL_GOLD,
        tile="ceiling_brass",
    )

    # Suspension rod with gilded decorative chain links
    z_crown = 5.95
    ceiling.rail((cx, cy, z_mount - 0.14), (cx, cy, z_crown), radius=0.028, color=COL_GOLD, sides=8, tile="ceiling_brass", bevel_ends=False)
    for k in range(4):
        zk = z_crown + 0.42 + k * 0.46
        if zk < z_mount - 0.25:
            add_beveled_box(ceiling, (cx, cy, zk), (0.085, 0.085, 0.095), color=COL_GOLD_DEEP, tile="ceiling_brass", bevel=0.008)

    # Turned gilded baluster central stem + faceted crystal finial orb
    stem_prof = [
        (0.06, 5.95),
        (0.14, 5.80),
        (0.08, 5.56),
        (0.18, 5.32),
        (0.10, 5.06),
        (0.24, 4.82),
        (0.10, 4.52),
    ]
    ceiling.rings(
        [[(cx + r * math.cos(TAU * j / 10), cy + r * math.sin(TAU * j / 10), zv) for j in range(10)] for (r, zv) in stem_prof],
        color=COL_GOLD,
        tile="ceiling_brass",
    )
    ceiling.rings(
        [
            [(cx + r * math.cos(TAU * j / 8), cy + r * math.sin(TAU * j / 8), zv) for j in range(8)]
            for (r, zv) in ((0.06, 4.52), (0.14, 4.40), (0.10, 4.28), (0.02, 4.18))
        ],
        color=COL_GLASS_CRYSTAL,
        tile="glass_clear",
    )

    # 3 Concentric Tiered Gilded Rings + S-Curved Arms + 14 Glowing Candles + Crystal Drops
    tiers = (
        (0.44, 5.62, 6, False),
        (0.82, 5.14, 6, True),
        (1.12, 4.68, 8, True),
    )
    for t_rad, t_z, n_arms, has_candles in tiers:
        ring_segs = 16
        tube_r = 0.034 if t_rad > 0.7 else 0.026
        hoop_rings = []
        for i in range(ring_segs):
            a = TAU * i / ring_segs
            ca, sa = math.cos(a), math.sin(a)
            p_c = Vector((cx + t_rad * ca, cy + t_rad * sa, t_z))
            radial = Vector((ca, sa, 0.0))
            up = Vector((0.0, 0.0, 1.0))
            hoop_rings.append(
                [
                    tuple(p_c + tube_r * (math.cos(TAU * k / 4) * radial + math.sin(TAU * k / 4) * up))
                    for k in range(4)
                ]
            )
        ceiling.rings(hoop_rings, color=COL_GOLD, tile="ceiling_brass", closed_loop=True)

        for i in range(n_arms):
            a = TAU * i / n_arms
            ca, sa = math.cos(a), math.sin(a)
            # Single continuous lofted S-scroll brass arm from central stem to tier ring (0 welded edges!)
            p_stem = (cx + 0.08 * ca, cy + 0.08 * sa, t_z + 0.20)
            p_dip = (cx + t_rad * 0.56 * ca, cy + t_rad * 0.56 * sa, t_z - 0.14)
            p_rim = (cx + t_rad * ca, cy + t_rad * sa, t_z + 0.01)
            _add_bent_strut(ceiling, (p_stem, p_dip, p_rim), radius=0.016, sides=6, color=COL_GOLD, tile="ceiling_brass")

            px, py = cx + t_rad * ca, cy + t_rad * sa
            # Faceted crystal prism droplet below each arm
            ceiling.rings(
                [
                    [(px + r * math.cos(TAU * j / 5), py + r * math.sin(TAU * j / 5), zv) for j in range(5)]
                    for (r, zv) in ((0.010, t_z - 0.03), (0.038, t_z - 0.12), (0.008, t_z - 0.24))
                ],
                color=COL_GLASS_CRYSTAL,
                tile="glass_clear",
            )

            # Crystal garland swag between arms on outer lower tier (single continuous strut!)
            if t_rad > 0.95:
                a_next = TAU * ((i + 1) % n_arms) / n_arms
                a_mid = 0.5 * (a + a_next) if i + 1 < n_arms else a + math.pi / n_arms
                p_start_s = (cx + t_rad * 0.99 * math.cos(a + 0.06), cy + t_rad * 0.99 * math.sin(a + 0.06), t_z - 0.025)
                p_low = (cx + t_rad * 0.96 * math.cos(a_mid), cy + t_rad * 0.96 * math.sin(a_mid), t_z - 0.18)
                p_end_s = (cx + t_rad * 0.99 * math.cos(a_next - 0.06), cy + t_rad * 0.99 * math.sin(a_next - 0.06), t_z - 0.025)
                _add_bent_strut(ceiling, (p_start_s, p_low, p_end_s), radius=0.012, sides=5, color=COL_GLASS_CRYSTAL, tile="glass_clear")

            if has_candles:
                ceiling.rail((px, py, t_z + 0.01), (px, py, t_z + 0.042), radius=0.048, color=COL_GOLD, sides=6, tile="ceiling_brass", bevel_ends=False)
                ceiling.rail((px, py, t_z + 0.038), (px, py, t_z + 0.24), radius=0.019, color=COL_CANDLE_WAX, sides=6, tile="ceiling_plaster", bevel_ends=False)
                ceiling.rings(
                    [
                        [(px + r * math.cos(TAU * j / 5), py + r * math.sin(TAU * j / 5), zv) for j in range(5)]
                        for (r, zv) in ((0.006, t_z + 0.238), (0.022, t_z + 0.275), (0.005, t_z + 0.340))
                    ],
                    color=COL_FLAME_WARM,
                    tile="emissive_amber",
                )

    # Crystal bead strands from crown tier to middle tier
    for i in range(6):
        a = TAU * i / 6.0
        ca, sa = math.cos(a), math.sin(a)
        ceiling.rail(
            (cx + 0.43 * ca, cy + 0.43 * sa, 5.60),
            (cx + 0.80 * ca, cy + 0.80 * sa, 5.14),
            radius=0.011,
            color=COL_GLASS_CRYSTAL,
            sides=5,
            tile="glass_clear",
            bevel_ends=False,
        )


def build_vaulted_ceiling(ceiling: MeshGroup) -> None:
    """Build ribbed barrel-arch vaulted ceiling, colonnade entablature beams, & 3 crystal chandeliers."""
    beam_len = Y_NORTH_IN - Y_SOUTH_IN - 0.04
    for col_x in (X_COL_L, X_COL_R):
        add_beveled_box(ceiling, (col_x, 0.0, Z_ENTAB + 0.14), (0.64, beam_len, 0.28), color=COL_TRIM, tile="ceiling_beam", bevel=0.005)
        add_beveled_box(ceiling, (col_x, 0.0, Z_ENTAB + 0.32), (0.72, beam_len + 0.01, 0.06), color=COL_GOLD, tile="ceiling_brass", bevel=0.0)
        add_beveled_box(ceiling, (col_x, 0.0, Z_ENTAB + 0.48), (0.78, beam_len - 0.02, 0.26), color=COL_MARBLE_WARM, tile="ceiling_plaster", bevel=0.005)

        wall_in = X_HALL_W_IN if col_x < X_HALL else X_HALL_E_IN
        aisle_cx = 0.5 * (col_x + wall_in)
        aisle_w = abs(col_x - wall_in) + 0.12
        add_beveled_box(ceiling, (aisle_cx, 0.0, Z_WALL_TOP - 0.08), (aisle_w, beam_len, 0.18), color=COL_PLASTER, tile="ceiling_plaster", bevel=0.0)

        for cy in COL_YS:
            add_beveled_box(ceiling, (aisle_cx, cy, Z_ENTAB + 0.36), (aisle_w - 0.06, 0.42, 0.32), color=COL_TRIM, tile="ceiling_beam", bevel=0.004)
            add_beveled_box(ceiling, (aisle_cx, cy, Z_ENTAB + 0.19), (aisle_w - 0.12, 0.46, 0.045), color=COL_GOLD, tile="ceiling_brass", bevel=0.0)

    # Watertight Barrel-Arch Vault Shell spanning hall width (Z = 6.25 .. 8.50)
    rx_out = (X_HALL_E_OUT - X_HALL_W_OUT) * 0.5
    rx_in = rx_out - 0.28
    rz_out = Z_ROOF_TOP - Z_WALL_TOP
    rz_in = Z_VAULT_INNER_APEX - Z_WALL_TOP
    segs = 16
    arch_profile: List[Tuple[float, float]] = []
    for i in range(segs + 1):
        a = math.pi * (i / float(segs))
        arch_profile.append((X_HALL + rx_out * math.cos(a), Z_WALL_TOP + rz_out * math.sin(a)))
    for i in range(segs, -1, -1):
        a = math.pi * (i / float(segs))
        arch_profile.append((X_HALL + rx_in * math.cos(a), Z_WALL_TOP + rz_in * math.sin(a)))

    y_stops = (-8.92, -6.80, -3.60, -0.40, 2.80, 6.00, 8.92)
    ceiling.rings([[(px, yv, pz) for (px, pz) in arch_profile] for yv in y_stops], color=COL_PLASTER, tile="ceiling_plaster")

    def _vault_pt(angle: float, y: float, inset: float = 0.0) -> Tuple[float, float, float]:
        return (
            X_HALL + (rx_in - inset) * math.cos(angle),
            y,
            Z_WALL_TOP + (rz_in - inset) * math.sin(angle),
        )

    # Transverse sculpted arch ribs + gilded under-beads
    for ry in (-8.36, *COL_YS, 8.36):
        rib_rings = []
        gold_rings = []
        for i in range(segs + 1):
            a = math.pi * (i / float(segs))
            ca, sa = math.cos(a), math.sin(a)
            rib_rings.append(
                [
                    (X_HALL + (rx_in + 0.01) * ca, ry - 0.17, Z_WALL_TOP + (rz_in + 0.01) * sa),
                    (X_HALL + (rx_in + 0.01) * ca, ry + 0.17, Z_WALL_TOP + (rz_in + 0.01) * sa),
                    (X_HALL + (rx_in - 0.18) * ca, ry + 0.13, Z_WALL_TOP + (rz_in - 0.18) * sa),
                    (X_HALL + (rx_in - 0.18) * ca, ry - 0.13, Z_WALL_TOP + (rz_in - 0.18) * sa),
                ]
            )
            gold_rings.append(
                [
                    (X_HALL + (rx_in - 0.175) * ca, ry - 0.055, Z_WALL_TOP + (rz_in - 0.175) * sa),
                    (X_HALL + (rx_in - 0.175) * ca, ry + 0.055, Z_WALL_TOP + (rz_in - 0.175) * sa),
                    (X_HALL + (rx_in - 0.235) * ca, ry + 0.040, Z_WALL_TOP + (rz_in - 0.235) * sa),
                    (X_HALL + (rx_in - 0.235) * ca, ry - 0.040, Z_WALL_TOP + (rz_in - 0.235) * sa),
                ]
            )
        ceiling.rings(rib_rings, color=COL_TRIM, tile="ceiling_beam")
        ceiling.rings(gold_rings, color=COL_GOLD, tile="ceiling_brass")

    # Longitudinal vault purlins & gilded cornice strips
    for a_deg, rw, rh, col_p, tl_p in (
        (90.0, 0.28, 0.18, COL_TRIM, "ceiling_beam"),
        (90.0, 0.10, 0.23, COL_GOLD, "ceiling_brass"),
        (55.0, 0.18, 0.14, COL_TRIM, "ceiling_beam"),
        (125.0, 0.18, 0.14, COL_TRIM, "ceiling_beam"),
        (28.0, 0.16, 0.13, COL_GOLD, "ceiling_brass"),
        (152.0, 0.16, 0.13, COL_GOLD, "ceiling_brass"),
    ):
        a = math.radians(a_deg)
        px = X_HALL + (rx_in - rh * 0.45) * math.cos(a)
        pz = Z_WALL_TOP + (rz_in - rh * 0.45) * math.sin(a)
        add_beveled_box(ceiling, (px, 0.0, pz), (rw, 16.9, rh), color=col_p, tile=tl_p, bevel=0.0)

    # Diagonal Groin Cross-Ribs inside each main bay
    for y_a, y_b in ((-6.80, -3.60), (-3.60, -0.40), (-0.40, 2.80), (2.80, 6.00)):
        for a0_deg, a1_deg in ((28.0, 152.0), (152.0, 28.0)):
            steps_d = 6
            diag_pts = [
                _vault_pt(math.radians(a0_deg + (a1_deg - a0_deg) * (k / float(steps_d))), y_a + (y_b - y_a) * (k / float(steps_d)), inset=0.07)
                for k in range(steps_d + 1)
            ]
            add_pipe_frame(ceiling, diag_pts, radius=0.048, sides=6, bend_subdiv=1, flange_ends=False, color=COL_GOLD, tile="ceiling_brass")

    # 3 Grand Multi-Tier Crystal Chandeliers suspended down the nave centerline
    for cy_ch in (-5.20, -2.00, 1.20):
        _add_crystal_chandelier(ceiling, cx=X_HALL, cy=cy_ch, z_mount=Z_VAULT_INNER_APEX)


# ---------------------------------------------------------------------------
# Section 4: BG_Furniture_Hero (Corinthian Columns, Imperial Throne, Settees)
# ---------------------------------------------------------------------------


def _add_corinthian_capital_ornaments(
    furn: MeshGroup,
    *,
    cx: float,
    cy: float,
    z_top: float,
    radius: float,
) -> None:
    """Enrich a fluted column capital with 3D gilded Corinthian acanthus leaves & 4 corner volutes."""
    cap_h = 0.44
    z_collar = z_top - cap_h
    for tier_idx, (n_leaves, z_off, h_leaf, r_base, r_tip) in enumerate(
        (
            (6, 0.04, 0.19, radius * 0.96, radius * 1.18),
            (6, 0.14, 0.22, radius * 1.00, radius * 1.30),
        )
    ):
        phase = (math.pi / n_leaves) * tier_idx
        for i in range(n_leaves):
            a = TAU * i / n_leaves + phase
            ca, sa = math.cos(a), math.sin(a)
            tx, ty = -sa, ca
            l_rings = []
            for frac, rad_cur, w_leaf, th in (
                (0.0, r_base, 0.062, 0.022),
                (0.55, 0.5 * (r_base + r_tip), 0.080, 0.026),
                (1.0, r_tip, 0.040, 0.016),
            ):
                zb = z_collar + z_off + h_leaf * frac
                p_in = Vector((cx + (rad_cur - th) * ca, cy + (rad_cur - th) * sa, zb))
                p_out = Vector((cx + rad_cur * ca, cy + rad_cur * sa, zb))
                t_vec = Vector((tx, ty, 0.0)) * w_leaf
                l_rings.append([tuple(p_in - t_vec), tuple(p_out - t_vec), tuple(p_out + t_vec), tuple(p_in + t_vec)])
            furn.rings(l_rings, color=COL_GOLD if tier_idx == 1 else COL_GOLD_DEEP, tile="metal_brass_trim")

    for i in range(4):
        a = math.pi * 0.25 + i * (math.pi * 0.5)
        ca, sa = math.cos(a), math.sin(a)
        vx, vy, vz = cx + radius * 1.46 * ca, cy + radius * 1.46 * sa, z_top - 0.13
        tx, ty = -sa, ca
        furn.rail(
            (vx - tx * 0.065, vy - ty * 0.065, vz),
            (vx + tx * 0.065, vy + ty * 0.065, vz),
            radius=0.052,
            color=COL_GOLD,
            sides=8,
            tile="metal_brass_trim",
            bevel_ends=False,
        )


def _add_imperial_throne(furn: MeshGroup, cx: float, cy: float, z_dais: float) -> None:
    """Build the Imperial Palace Royal Throne (옥좌) + gilded canopy pavilion on the Dais."""
    # Stepped carved walnut & gold throne sub-plinth grounded on z_dais
    add_beveled_box(furn, (cx, cy, z_dais + 0.075), (2.20, 1.65, 0.15), color=COL_WALNUT, tile="wood_walnut", bevel=0.008)
    add_beveled_box(furn, (cx, cy, z_dais + 0.165), (2.06, 1.52, 0.032), color=COL_GOLD, tile="metal_brass_trim", bevel=0.004)
    add_beveled_box(furn, (cx, cy - 0.04, z_dais + 0.188), (1.88, 1.38, 0.020), color=COL_CRIMSON, tile="carpet_plush", bevel=0.0)
    z0 = z_dais + 0.196

    seat_w, seat_d, seat_h = 1.06, 0.84, 0.54
    for sx in (-1, 1):
        for sy in (-1, 1):
            lx = cx + sx * (seat_w * 0.44)
            ly = cy + sy * (seat_d * 0.42)
            add_beveled_box(furn, (lx, ly, z0 + 0.04), (0.11, 0.11, 0.08), color=COL_GOLD, tile="metal_brass_trim", bevel=0.006)
            furn.rail((lx, ly, z0 + 0.075), (lx, ly, z0 + seat_h - 0.05), radius=0.042, color=COL_WALNUT, sides=8, tile="wood_walnut", bevel_ends=False)

    add_beveled_box(furn, (cx, cy, z0 + seat_h - 0.07), (seat_w, seat_d, 0.14), color=COL_WALNUT, tile="wood_walnut", bevel=0.007)
    add_beveled_box(furn, (cx, cy - seat_d * 0.5 - 0.004, z0 + seat_h - 0.07), (seat_w - 0.08, 0.025, 0.085), color=COL_GOLD, tile="metal_brass_trim", bevel=0.0)
    add_beveled_box(furn, (cx, cy - 0.02, z0 + seat_h + 0.055), (seat_w - 0.12, seat_d - 0.10, 0.13), color=COL_CRIMSON_BRIGHT, tile="fabric_velvet", bevel=0.020)

    for sx in (-1, 1):
        ax = cx + sx * (seat_w * 0.46)
        add_beveled_box(furn, (ax, cy - seat_d * 0.38, z0 + seat_h + 0.16), (0.085, 0.095, 0.34), color=COL_GOLD, tile="metal_brass_trim", bevel=0.006)
        add_beveled_box(furn, (ax, cy + 0.02, z0 + seat_h + 0.33), (0.115, seat_d * 0.90, 0.072), color=COL_WALNUT, tile="wood_walnut", bevel=0.008)
        add_beveled_box(furn, (ax, cy + 0.02, z0 + seat_h + 0.38), (0.095, seat_d * 0.62, 0.042), color=COL_CRIMSON, tile="fabric_velvet", bevel=0.008)

    # Towering Royal Backrest (detailed BOTH front & back for over-the-shoulder reverse shots!)
    back_y = cy + seat_d * 0.44
    back_h = 1.72
    back_z0 = z0 + seat_h - 0.02
    add_beveled_box(furn, (cx, back_y, back_z0 + back_h * 0.5), (seat_w + 0.06, 0.14, back_h), color=COL_WALNUT, tile="wood_walnut", bevel=0.010)
    add_beveled_box(furn, (cx, back_y - 0.065, back_z0 + back_h * 0.48), (seat_w - 0.18, 0.085, back_h - 0.24), color=COL_CRIMSON, tile="fabric_velvet", bevel=0.016)
    # Ornate gilded back boiserie panel & royal crest emblem on rear face (View 3 Back!)
    add_beveled_box(furn, (cx, back_y + 0.072, back_z0 + back_h * 0.50), (seat_w - 0.18, 0.024, back_h - 0.24), color=COL_GOLD, tile="metal_brass_trim", bevel=0.004)
    add_beveled_box(furn, (cx, back_y + 0.080, back_z0 + back_h * 0.50), (seat_w - 0.28, 0.022, back_h - 0.34), color=COL_CRIMSON_DARK, tile="fabric_velvet", bevel=0.004)
    add_beveled_box(furn, (cx, back_y + 0.092, back_z0 + back_h * 0.56), (0.28, 0.024, 0.36), color=COL_GOLD, tile="metal_brass_trim", bevel=0.006)

    for sx in (-1, 1):
        px = cx + sx * (seat_w * 0.51)
        furn.rail((px, back_y - 0.02, back_z0), (px, back_y - 0.02, back_z0 + back_h + 0.14), radius=0.048, color=COL_GOLD, sides=8, tile="metal_brass_trim", bevel_ends=False)
        furn.rings(
            [
                [(px + r * math.cos(TAU * j / 8), back_y - 0.02 + r * math.sin(TAU * j / 8), back_z0 + back_h + 0.12 + dz) for j in range(8)]
                for (r, dz) in ((0.056, 0.0), (0.072, 0.07), (0.042, 0.16), (0.012, 0.24))
            ],
            color=COL_GOLD,
            tile="metal_brass_trim",
        )

    crest_z = back_z0 + back_h
    crest_pts = [(cx + 0.52 * math.cos(math.pi * i / 10.0), back_y - 0.02, crest_z + 0.34 * math.sin(math.pi * i / 10.0)) for i in range(11)]
    add_pipe_frame(furn, crest_pts, radius=0.042, sides=6, bend_subdiv=1, flange_ends=False, color=COL_GOLD, tile="metal_brass_trim")
    add_beveled_box(furn, (cx, back_y - 0.01, crest_z + 0.14), (0.54, 0.09, 0.28), color=COL_CRIMSON_DARK, tile="fabric_velvet", bevel=0.014)
    add_beveled_box(furn, (cx, back_y - 0.02, crest_z + 0.42), (0.28, 0.12, 0.16), color=COL_GOLD, tile="metal_brass_trim", bevel=0.012)

    # Royal Canopy Posts & Velvet Pelmet (Baldachin)
    post_z1 = z_dais + 3.95
    for sx in (-1, 1):
        px = cx + sx * 1.42
        py = cy + 0.42
        add_beveled_box(furn, (px, py, z_dais + 0.18), (0.22, 0.22, 0.36), color=COL_WALNUT, tile="wood_walnut", bevel=0.005)
        furn.rail((px, py, z_dais + 0.35), (px, py, post_z1), radius=0.052, color=COL_GOLD, sides=8, tile="metal_brass_trim", bevel_ends=False)
        sw_rings = []
        for iz in range(6):
            t = iz / 5.0
            lz = z_dais + 0.02 + (post_z1 - z_dais - 0.24) * t
            cinch = math.exp(-(((t - 0.38) / 0.22) ** 2))
            rad = 0.15 - 0.05 * cinch + 0.03 * (1.0 - t)
            sw_rings.append([(px + sx * 0.06 + rad * math.cos(TAU * j / 8), py - 0.04 + rad * math.sin(TAU * j / 8), lz) for j in range(8)])
        furn.rings(sw_rings, color=COL_CRIMSON, tile="fabric_velvet")

    add_beveled_box(furn, (cx, cy + 0.15, post_z1 + 0.12), (3.16, 1.38, 0.24), color=COL_CRIMSON_DARK, tile="fabric_velvet", bevel=0.010)
    add_beveled_box(furn, (cx, cy + 0.15, post_z1 + 0.28), (3.32, 1.52, 0.11), color=COL_GOLD, tile="metal_brass_trim", bevel=0.007)
    add_beveled_box(furn, (cx, cy + 0.15, post_z1 - 0.02), (3.22, 1.44, 0.065), color=COL_GOLD, tile="metal_brass_trim", bevel=0.005)


def _add_palace_console_table(furn: MeshGroup, cx: float, cy: float, z0: float, *, rot_z: float) -> None:
    """Build a Baroque carved walnut & gilded marble-top palace console table (height 0.88 m)."""
    w, d, h = 1.46, 0.52, 0.88

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (cx + wx, cy + wy, z0 + lz)

    add_beveled_box(furn, _to_world(0.0, 0.0, h - 0.024), (w, d, 0.048), color=COL_MARBLE_LIGHT, tile="ceramic_matte", bevel=0.005, rot_z=rot_z)
    add_beveled_box(furn, _to_world(0.0, 0.0, h - 0.105), (w - 0.08, d - 0.08, 0.115), color=COL_WALNUT, tile="wood_walnut", bevel=0.004, rot_z=rot_z)
    add_beveled_box(furn, _to_world(0.0, 0.0, h - 0.172), (w - 0.10, d - 0.06, 0.026), color=COL_GOLD, tile="metal_brass_trim", bevel=0.0, rot_z=rot_z)

    for sx in (-1, 1):
        for sy in (-1, 1):
            lx = sx * (w * 0.5 - 0.11)
            ly = sy * (d * 0.5 - 0.10)
            furn.rail(_to_world(lx, ly, 0.0), _to_world(lx, ly, h - 0.16), radius=0.032, color=COL_GOLD, sides=8, tile="metal_brass_trim", bevel_ends=False)
            add_beveled_box(furn, _to_world(lx, ly, 0.025), (0.082, 0.082, 0.05), color=COL_WALNUT, tile="wood_walnut", bevel=0.0, rot_z=rot_z)
    add_beveled_box(furn, _to_world(0.0, 0.0, 0.22), (w - 0.22, 0.055, 0.042), color=COL_GOLD_DEEP, tile="metal_brass_trim", bevel=0.0, rot_z=rot_z)
    for sx in (-1, 1):
        add_beveled_box(furn, _to_world(sx * (w * 0.5 - 0.11), 0.0, 0.22), (0.052, d - 0.20, 0.042), color=COL_GOLD_DEEP, tile="metal_brass_trim", bevel=0.0, rot_z=rot_z)


def _add_ballroom_settee(furn: MeshGroup, cx: float, cy: float, z0: float, *, rot_z: float, width: float = 1.56) -> None:
    """Build an upholstered Baroque crimson velvet & gold ballroom settee (facing local -Y)."""
    w, d, sh = width, 0.66, 0.46

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (cx + wx, cy + wy, z0 + lz)

    for sx in (-1, 1):
        for sy in (-1, 1):
            lx = sx * (w * 0.44)
            ly = sy * (d * 0.40)
            furn.rail(_to_world(lx, ly, 0.0), _to_world(lx, ly, sh - 0.08), radius=0.030, color=COL_GOLD, sides=8, tile="metal_brass_trim", bevel_ends=False)
            add_beveled_box(furn, _to_world(lx, ly, 0.022), (0.075, 0.075, 0.044), color=COL_GOLD_DEEP, tile="metal_brass_trim", bevel=0.0, rot_z=rot_z)

    add_beveled_box(furn, _to_world(0.0, 0.0, sh - 0.065), (w, d, 0.095), color=COL_GOLD, tile="metal_brass_trim", bevel=0.006, rot_z=rot_z)
    add_beveled_box(furn, _to_world(0.0, -0.02, sh + 0.035), (w - 0.10, d - 0.10, 0.115), color=COL_CRIMSON, tile="fabric_velvet", bevel=0.020, rot_z=rot_z)
    add_beveled_box(furn, _to_world(0.0, d * 0.41, sh + 0.34), (w - 0.04, 0.11, 0.56), color=COL_GOLD, tile="metal_brass_trim", bevel=0.010, rot_z=rot_z)
    add_beveled_box(furn, _to_world(0.0, d * 0.37, sh + 0.34), (w - 0.18, 0.09, 0.44), color=COL_CRIMSON_BRIGHT, tile="fabric_velvet", bevel=0.015, rot_z=rot_z)
    for sx in (-1, 1):
        add_beveled_box(furn, _to_world(sx * (w * 0.46), 0.0, sh + 0.22), (0.085, d - 0.08, 0.065), color=COL_GOLD, tile="metal_brass_trim", bevel=0.006, rot_z=rot_z)
        furn.rail(_to_world(sx * (w * 0.46), -d * 0.38, sh - 0.02), _to_world(sx * (w * 0.46), -d * 0.38, sh + 0.22), radius=0.024, color=COL_GOLD, sides=6, tile="metal_brass_trim", bevel_ends=False)


def _add_balcony_stone_bench(furn: MeshGroup, cx: float, cy: float, z0: float, *, rot_z: float) -> None:
    """Build a classical carved marble balcony bench with crimson velvet seat pad."""
    w, d, h = 1.40, 0.48, 0.48

    def _to_world(lx: float, ly: float, lz: float) -> Tuple[float, float, float]:
        wx, wy = _rot_xy(lx, ly, rot_z)
        return (cx + wx, cy + wy, z0 + lz)

    for sx in (-1, 1):
        lx = sx * (w * 0.36)
        add_beveled_box(furn, _to_world(lx, 0.0, 0.04), (0.20, d - 0.04, 0.08), color=COL_MARBLE_WARM, tile="ceramic_matte", bevel=0.004, rot_z=rot_z)
        add_beveled_box(furn, _to_world(lx, 0.0, 0.24), (0.14, d - 0.10, 0.33), color=COL_MARBLE_LIGHT, tile="ceramic_matte", bevel=0.005, rot_z=rot_z)
    add_beveled_box(furn, _to_world(0.0, 0.0, h - 0.038), (w, d, 0.076), color=COL_MARBLE_LIGHT, tile="ceramic_matte", bevel=0.006, rot_z=rot_z)
    add_beveled_box(furn, _to_world(0.0, 0.0, h + 0.026), (w - 0.14, d - 0.10, 0.056), color=COL_CRIMSON, tile="fabric_velvet", bevel=0.012, rot_z=rot_z)


def build_furniture_hero(furn: MeshGroup) -> None:
    """Build 10 fluted Corinthian columns, Imperial Throne pavilion, console tables, settees, & balcony benches."""
    # 1. 10 Monumental Fluted Corinthian Columns (12 deep classical flutes + gilded acanthus capitals)
    for cy in COL_YS:
        on_dais = cy > DAIS_Y0
        z_base = Z_DAIS if on_dais else Z_FLOOR
        col_h = Z_ENTAB - z_base
        rad = 0.27 if on_dais else 0.285
        for cx in (X_COL_L, X_COL_R):
            add_column_fluted(
                furn,
                (cx, cy, z_base),
                radius=rad,
                height=col_h,
                flutes=12,
                flute_depth=0.018,
                color=COL_MARBLE_LIGHT,
                tile="ceramic_matte",
                accent_color=COL_GOLD,
                accent_tile="metal_brass_trim",
            )
            _add_corinthian_capital_ornaments(furn, cx=cx, cy=cy, z_top=Z_ENTAB, radius=rad)

    # 2. Imperial Royal Throne & Canopy Pavilion centered on the Dais
    _add_imperial_throne(furn, cx=X_HALL, cy=6.80, z_dais=Z_DAIS)

    # 3. Palace Side Console Tables & Upholstered Velvet Ballroom Settees (zero clipping with Dais or stairs!)
    _add_palace_console_table(furn, X_HALL_E_IN - 0.42, -5.20, Z_FLOOR, rot_z=-math.pi * 0.5)
    _add_palace_console_table(furn, X_HALL_E_IN - 0.42, 1.20, Z_FLOOR, rot_z=-math.pi * 0.5)
    _add_palace_console_table(furn, X_HALL_W_IN + 0.42, -7.60, Z_FLOOR, rot_z=math.pi * 0.5)
    _add_palace_console_table(furn, X_HALL_E_IN - 0.42, -7.60, Z_FLOOR, rot_z=-math.pi * 0.5)

    # Settees cleanly inside East bay (-2.00) and flanking stair wings (Y=3.62 -> [2.95, 4.29], 0.46 m clear of Dais!)
    _add_ballroom_settee(furn, X_HALL_E_IN - 0.56, -2.00, Z_FLOOR, rot_z=-math.pi * 0.5, width=1.56)
    _add_ballroom_settee(furn, X_HALL_E_IN - 0.54, 3.62, Z_FLOOR, rot_z=-math.pi * 0.5, width=1.34)
    _add_ballroom_settee(furn, X_HALL_W_IN + 0.54, 3.62, Z_FLOOR, rot_z=math.pi * 0.5, width=1.34)

    # 4. Classical Stone Benches at the North & South ends of the Moonlit Balcony
    _add_balcony_stone_bench(furn, -5.65, BALC_Y0 + 0.72, Z_BALC_FLOOR, rot_z=math.pi)
    _add_balcony_stone_bench(furn, -5.65, BALC_Y1 - 0.72, Z_BALC_FLOOR, rot_z=0.0)


# ---------------------------------------------------------------------------
# Section 5: BG_Props_Clutter (Pedestal Urns, 5-Branch Candelabra, Banquet Sets)
# ---------------------------------------------------------------------------


def _add_pedestal_with_urn(props: MeshGroup, cx: float, cy: float, z0: float) -> None:
    """Build a classical marble sculpture pedestal topped with a gilded porcelain urn & laurel foliage."""
    add_beveled_box(props, (cx, cy, z0 + 0.06), (0.52, 0.52, 0.12), color=COL_MARBLE_WARM, tile="stone_prop", bevel=0.005)
    add_beveled_box(props, (cx, cy, z0 + 0.16), (0.44, 0.44, 0.08), color=COL_MARBLE_LIGHT, tile="stone_prop", bevel=0.004)
    sides = 10
    props.rings(
        [
            [(cx + r * math.cos(TAU * j / sides), cy + r * math.sin(TAU * j / sides), z0 + zv) for j in range(sides)]
            for (r, zv) in ((0.18, 0.20), (0.165, 0.58), (0.17, 0.96), (0.20, 1.02))
        ],
        color=COL_MARBLE_LIGHT,
        tile="stone_prop",
    )
    add_beveled_box(props, (cx, cy, z0 + 1.07), (0.48, 0.48, 0.095), color=COL_MARBLE_WARM, tile="stone_prop", bevel=0.005)

    uz0 = z0 + 1.115
    urn_prof = [
        (0.11, 0.00),
        (0.14, 0.05),
        (0.07, 0.15),
        (0.20, 0.34),
        (0.14, 0.54),
        (0.17, 0.60),
        (0.12, 0.50),
    ]
    props.rings(
        [[(cx + r * math.cos(TAU * j / 10), cy + r * math.sin(TAU * j / 10), uz0 + zv) for j in range(10)] for (r, zv) in urn_prof],
        color=COL_PORCELAIN,
        tile="ceramic_gloss",
    )
    props.rail((cx, cy, uz0 + 0.56), (cx, cy, uz0 + 0.605), radius=0.178, color=COL_GOLD, sides=10, tile="brass_polished", bevel_ends=False)
    for sx in (-1, 1):
        p0 = (cx + sx * 0.16, cy, uz0 + 0.34)
        p1 = (cx + sx * 0.27, cy, uz0 + 0.45)
        p2 = (cx + sx * 0.16, cy, uz0 + 0.56)
        _add_bent_strut(props, (p0, p1, p2), radius=0.015, sides=6, color=COL_GOLD, tile="brass_polished")

    # Sculpted botanical laurel foliage (radial stem offset 0.045 m -> zero shared center edges!)
    fz = uz0 + 0.54
    for i in range(8):
        a = TAU * i / 8.0 + 0.22
        reach = 0.26 if i % 2 == 0 else 0.19
        rise = 0.30 if i % 2 == 0 else 0.40
        ca, sa = math.cos(a), math.sin(a)
        tx, ty = -sa, ca
        l_rings = []
        for t in (0.0, 0.42, 0.78, 1.0):
            r_cur = 0.045 + reach * t
            broad = 0.056 * (0.20 + math.sin(math.pi * t) ** 0.8)
            pc = Vector((cx + r_cur * ca, cy + r_cur * sa, fz + rise * t + 0.07 * math.sin(math.pi * t)))
            sv = Vector((tx, ty, 0.0)) * broad
            uv = Vector((0.0, 0.0, max(0.008, broad * 0.35)))
            l_rings.append([tuple(pc - sv), tuple(pc + uv), tuple(pc + sv), tuple(pc - uv * 0.5)])
        props.rings(l_rings, color=COL_FOLIAGE if i % 2 == 0 else COL_FOLIAGE_LIGHT, tile="foliage_prop")


def _add_standing_candelabra(props: MeshGroup, cx: float, cy: float, z0: float) -> None:
    """Build a monumental 1.82 m gilded 5-branch palace floor candelabra."""
    props.rings(
        [
            [(cx + r * math.cos(TAU * j / 8), cy + r * math.sin(TAU * j / 8), z0 + zv) for j in range(8)]
            for (r, zv) in ((0.24, 0.00), (0.21, 0.08), (0.12, 0.18), (0.06, 0.32), (0.082, 0.70), (0.045, 1.00), (0.068, 1.24), (0.042, 1.44))
        ],
        color=COL_GOLD,
        tile="brass_polished",
    )

    def _candle_at(px: float, py: float, pz: float, h: float = 0.24) -> None:
        props.rail((px, py, pz), (px, py, pz + 0.028), radius=0.046, color=COL_GOLD, sides=6, tile="brass_polished", bevel_ends=False)
        props.rail((px, py, pz + 0.024), (px, py, pz + h), radius=0.017, color=COL_CANDLE_WAX, sides=6, tile="ceramic_gloss", bevel_ends=False)
        props.rings(
            [
                [(px + r * math.cos(TAU * j / 5), py + r * math.sin(TAU * j / 5), pz + h - 0.002 + dz) for j in range(5)]
                for (r, dz) in ((0.005, 0.0), (0.016, 0.028), (0.004, 0.078))
            ],
            color=COL_FLAME_WARM,
            tile="enamel_gloss",
        )

    _candle_at(cx, cy, z0 + 1.48, h=0.28)
    for i in range(4):
        a = TAU * i / 4.0 + math.pi * 0.25
        ca, sa = math.cos(a), math.sin(a)
        p0 = (cx + 0.035 * ca, cy + 0.035 * sa, z0 + 1.36)
        p1 = (cx + 0.17 * ca, cy + 0.17 * sa, z0 + 1.28)
        p2 = (cx + 0.25 * ca, cy + 0.25 * sa, z0 + 1.46)
        _add_bent_strut(props, (p0, p1, p2), radius=0.012, sides=6, color=COL_GOLD, tile="brass_polished")
        _candle_at(cx + 0.25 * ca, cy + 0.25 * sa, z0 + 1.45, h=0.22)


def _add_banquet_service_set(props: MeshGroup, cx: float, cy: float, z_top: float) -> None:
    """Place a gilded serving tray, banquet pitcher, & crystal goblets cleanly on a console top."""
    add_beveled_box(props, (cx, cy, z_top + 0.012), (0.34, 0.56, 0.022), color=COL_GOLD, tile="brass_polished", bevel=0.003)
    props.rings(
        [
            [(cx + r * math.cos(TAU * j / 8), cy - 0.12 + r * math.sin(TAU * j / 8), z_top + 0.022 + dz) for j in range(8)]
            for (r, dz) in ((0.045, 0.0), (0.068, 0.09), (0.034, 0.19), (0.044, 0.25))
        ],
        color=COL_GOLD_DEEP,
        tile="brass_polished",
    )
    for dy in (0.05, 0.16):
        for dx in (-0.06, 0.06):
            gx, gy = cx + dx, cy + dy
            props.rings(
                [
                    [(gx + r * math.cos(TAU * j / 6), gy + r * math.sin(TAU * j / 6), z_top + 0.022 + dz) for j in range(6)]
                    for (r, dz) in ((0.028, 0.0), (0.010, 0.045), (0.032, 0.095), (0.030, 0.135))
                ],
                color=COL_GLASS_CRYSTAL,
                tile="glass_prop",
            )


def build_props_clutter(props: MeshGroup) -> None:
    """Build 6 sculpture pedestal urns, 4 standing 5-branch floor candelabra, & console banquet sets."""
    _add_pedestal_with_urn(props, X_HALL - 3.30, STAIR_Y0 - 0.55, Z_FLOOR)
    _add_pedestal_with_urn(props, X_HALL + 3.30, STAIR_Y0 - 0.55, Z_FLOOR)
    _add_pedestal_with_urn(props, X_HALL - 2.35, 7.05, Z_DAIS)
    _add_pedestal_with_urn(props, X_HALL + 2.35, 7.05, Z_DAIS)
    _add_pedestal_with_urn(props, -5.65, -4.15, Z_BALC_FLOOR)
    _add_pedestal_with_urn(props, -5.65, 0.15, Z_BALC_FLOOR)

    _add_standing_candelabra(props, X_HALL - 2.15, DAIS_Y0 + 0.55, Z_DAIS)
    _add_standing_candelabra(props, X_HALL + 2.15, DAIS_Y0 + 0.55, Z_DAIS)
    _add_standing_candelabra(props, X_HALL - 2.10, Y_SOUTH_IN + 0.72, Z_FLOOR)
    _add_standing_candelabra(props, X_HALL + 2.10, Y_SOUTH_IN + 0.72, Z_FLOOR)

    _add_banquet_service_set(props, X_HALL_E_IN - 0.42, -5.20, Z_FLOOR + 0.88)
    _add_banquet_service_set(props, X_HALL_E_IN - 0.42, 1.20, Z_FLOOR + 0.88)


# ---------------------------------------------------------------------------
# Camera Presets & Scene Assembly Entry Point
# ---------------------------------------------------------------------------


def build_palace_groups() -> HeroSceneGroups:
    """Construct all 8 semantic cutaway MeshGroups for the Romance Fantasy Imperial Palace."""
    groups = HeroSceneGroups()
    build_floor_and_balcony(groups.floor)
    build_wall_north(groups.wall_north)
    build_wall_south(groups.wall_south)
    build_wall_west(groups.wall_west)
    build_wall_east(groups.wall_east)
    build_vaulted_ceiling(groups.ceiling)
    build_furniture_hero(groups.furniture_hero)
    build_props_clutter(groups.props_clutter)
    groups.ground_to_zero()
    return groups


def build_palace_six_views() -> List[PreviewCameraView]:
    """Return 6 architectural review views highlighting hall, grand staircase, throne, & balcony."""
    return [
        PreviewCameraView(
            key="front",
            label="1 FRONT",
            location=(X_HALL, -15.2, 3.85),
            target=(X_HALL, 2.2, 3.25),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_South", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="side",
            label="2 SIDE BALCONY",
            location=(-17.5, -1.2, 3.85),
            target=(1.0, -0.5, 3.25),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_West", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="back",
            label="3 BACK",
            location=(X_HALL, 15.2, 3.85),
            target=(X_HALL, -2.5, 3.25),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_North",),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(14.8, -14.8, 10.6),
            target=(-0.2, 0.8, 2.55),
            lens_mm=30.0,
            hide_nodes=("BG_Wall_South", "BG_Wall_East", "BG_Ceiling", "BG_Cutaway_Front"),
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 INTERIOR 26MM",
            location=(4.35, -6.25, 1.85),
            target=(0.15, 3.85, 2.85),
            lens_mm=26.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(2.2, -13.5, 18.8),
            target=(0.2, 0.4, 1.4),
            lens_mm=28.0,
            hide_nodes=("BG_Ceiling", "BG_Wall_South", "BG_Cutaway_Front"),
        ),
    ]


def build_palace_manifest_cameras() -> Dict[str, Any]:
    """Return representative Romance Fantasy webtoon camera presets (glTF Y-up coordinates)."""
    def _to_gltf(p: Sequence[float]) -> List[float]:
        return [round(float(p[0]), 3), round(float(p[2]), 3), round(-float(p[1]), 3)]

    return {
        "ballroom_wide_24mm": {
            "position": _to_gltf((X_HALL + 2.4, -7.2, 1.95)),
            "target": _to_gltf((X_HALL, 4.8, 2.75)),
            "fovDegrees": 65,
        },
        "balcony_confession_35mm": {
            "position": _to_gltf((-5.65, -5.2, 1.65)),
            "target": _to_gltf((-5.85, 0.2, 1.55)),
            "fovDegrees": 45,
        },
        "grand_stair_low_50mm": {
            "position": _to_gltf((X_HALL + 0.8, 0.6, 1.25)),
            "target": _to_gltf((X_HALL, 6.8, 2.35)),
            "fovDegrees": 32,
        },
    }


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    raw = list(argv)
    if "--" in raw:
        raw = raw[raw.index("--") + 1 :]
    elif any(tok in raw for tok in ("--background", "-b", "--python", "-P", "--factory-startup")):
        raw = []
    parser = argparse.ArgumentParser(description=f"Build ToonStudio Hero BG3D: {SLUG}")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--preview-dir", type=Path, default=DEFAULT_PREVIEW_DIR)
    parser.add_argument("--desktop-primary-size", type=int, default=1024)
    parser.add_argument("--desktop-secondary-size", type=int, default=1024)
    parser.add_argument("--mobile-opaque-size", type=int, default=1024)
    parser.add_argument("--mobile-glass-size", type=int, default=512)
    parser.add_argument("--tile-resolution", type=int, default=512)
    parser.add_argument("--skip-previews", action="store_true")
    parser.add_argument("--report-out", type=Path, default=None)
    return parser.parse_args(raw)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    groups = build_palace_groups()

    desktop_scene, export_report = export_hero_desktop_and_mobile(
        SLUG,
        groups,
        args.out_dir,
        desktop_primary_size=args.desktop_primary_size,
        desktop_secondary_size=args.desktop_secondary_size,
        mobile_opaque_size=args.mobile_opaque_size,
        mobile_glass_size=args.mobile_glass_size,
        optimize_meshopt=True,
        keep_desktop_in_scene=True,
        cameras=build_palace_manifest_cameras(),
    )

    # Persist slug-scoped manifest alongside shared manifest so parallel hero builds never lose metadata
    shared_manifest = Path(export_report["manifestPath"])
    slug_manifest = args.out_dir / f"{SLUG}.manifest.json"
    if shared_manifest.is_file():
        slug_manifest.write_text(shared_manifest.read_text(encoding="utf-8"), encoding="utf-8")

    # Gate 1: Blender bmesh & scene invariants on Desktop 8-node hierarchy
    gate1_desktop = audit_blender_scene(desktop_scene.root, profile="desktop")

    # Gate 2: Standalone GLB binary contract & gltf-transform validate on BOTH GLBs
    desktop_glb = args.out_dir / f"{SLUG}.glb"
    mobile_glb = args.out_dir / f"{SLUG}-mobile.glb"
    gate2_desktop = inspect_glb(desktop_glb, profile="desktop", require_meshopt=True, run_validate=True)
    gate2_mobile = inspect_glb(mobile_glb, profile="mobile", require_meshopt=True, run_validate=True)

    # Gate 5: 6-view 512x512 BLENDER_EEVEE contact sheet + Freestyle SVG line art
    preview_report: Dict[str, Any] | None = None
    if not args.skip_previews:
        views = build_palace_six_views()
        preview_report = render_hero_review_bundle(
            args.preview_dir,
            SLUG,
            root_obj=desktop_scene.root,
            views=views,
            tile_resolution=args.tile_resolution,
            interior_cutaway=True,
        )

    # Check hard prompt size/tri budgets explicitly
    d_sum = gate2_desktop["summary"]
    m_sum = gate2_mobile["summary"]
    budget_errors: List[str] = []
    if not (35_000 <= d_sum["triangles"] <= 120_000):
        budget_errors.append(f"Desktop triangles {d_sum['triangles']} outside 35k..120k target range")
    if d_sum["byte_size"] > 6 * 1024 * 1024:
        budget_errors.append(f"Desktop GLB size {d_sum['byte_size']} exceeds 6 MiB target")
    if m_sum["byte_size"] > 3 * 1024 * 1024:
        budget_errors.append(f"Mobile GLB size {m_sum['byte_size']} exceeds 3 MiB target")

    passed = bool(
        gate1_desktop["passed"]
        and gate2_desktop["passed"]
        and gate2_mobile["passed"]
        and len(budget_errors) == 0
    )

    full_report = {
        "slug": SLUG,
        "passed": passed,
        "budgetErrors": budget_errors,
        "export": export_report,
        "gate1_desktop": gate1_desktop,
        "gate2_desktop": gate2_desktop,
        "gate2_mobile": gate2_mobile,
        "previews": preview_report,
    }

    report_path = args.report_out or (args.preview_dir / f"{SLUG}-qa-report.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(full_report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "slug": SLUG,
                "passed": passed,
                "budgetErrors": budget_errors,
                "desktop": {
                    "path": str(desktop_glb),
                    "bytes": d_sum["byte_size"],
                    "mib": round(d_sum["byte_size"] / (1024 * 1024), 3),
                    "triangles": d_sum["triangles"],
                    "draw_calls": d_sum["draw_calls"],
                    "materials": d_sum["materials"],
                    "bounds_gltf": d_sum["bounds_gltf"],
                    "min_y_gltf": d_sum["min_y_gltf"],
                    "gate1_passed": gate1_desktop["passed"],
                    "gate2_passed": gate2_desktop["passed"],
                    "gate1_errors": gate1_desktop["errors"],
                    "gate2_errors": gate2_desktop["errors"],
                },
                "mobile": {
                    "path": str(mobile_glb),
                    "bytes": m_sum["byte_size"],
                    "mib": round(m_sum["byte_size"] / (1024 * 1024), 3),
                    "triangles": m_sum["triangles"],
                    "draw_calls": m_sum["draw_calls"],
                    "materials": m_sum["materials"],
                    "bounds_gltf": m_sum["bounds_gltf"],
                    "min_y_gltf": m_sum["min_y_gltf"],
                    "gate2_passed": gate2_mobile["passed"],
                    "gate2_errors": gate2_mobile["errors"],
                },
                "previews": preview_report,
                "reportPath": str(report_path),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
