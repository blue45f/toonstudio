"""Build Hero Webtoon 3D Backgrounds: kr_school_rooftop_hero & kr_seoul_alley_street_hero.

Generates both Korean urban outdoor hero background sets in a single deterministic
Blender 5.3 headless execution using the shared ``webtoon_hero_bg`` core modules:

1. ``kr_school_rooftop_hero`` (14.0 x 11.0 x 4.5 m)
   - Green urethane waterproof deck with expansion joints, perimeter drainage gutters & grates
   - 4-side concrete parapet with cove curb, coping stones & full diamond chain-link fence
   - Northwest stairhouse (concrete shell, recessed steel fire door w/ panic bar & wired glass,
     cantilevered rain canopy, EXIT box, bulkhead lamp, barred sliding window, louvers, PA horn)
   - Northeast elevated STS304 water tank on X-braced steel truss tower with catwalk grating,
     guardrails, riser pipes + gate valve, and 5-hoop caged safety ladder
   - East 2-tier AC outdoor condenser bank with fan shrouds, 3-blade hubs, wire grilles & piping
   - Wooden slatted benches, detailed Korean beverage vending machine, recycling bin & hydrant

2. ``kr_seoul_alley_street_hero`` (8.0 x 16.0 x 7.5 m)
   - Crowned asphalt roadway with road markings, granite curbs, storm grates & cast-iron manholes
   - West & East 2~3-story varied Seoul multi-family / commercial facades (6 distinct plots:
     red-brick cafe w/ striped awning, tiled villa w/ corrugated shutter, stucco building w/
     exterior steel staircase, corner mini-mart w/ vending machine, timber-slat snack bar w/
     pitched tiled eave, 1990s red-brick Seoul villa)
   - Concrete utility poles with step bolts, crossarms, insulators, finned pole transformer &
     overhead catenary power/telecom cables
   - Wall-mounted cobra streetlamps, 6 glowing projecting shop signs, facade AC units, yellow
     Korean city-gas risers & meter boxes, bollards, traffic cones, recycling rack, A-frame menu,
     potted sidewalk foliage, and corner convex traffic mirror

Usage:
  /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
    --python tools/blender/webtoon_hero_bg/build_kr_rooftop_and_alley.py
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import bpy
from mathutils import Vector

# Mandatory Blender 5.3 internal addon enable (never via --addons CLI flag)
try:
    bpy.ops.preferences.addon_enable(module="bl_ext.user_default.freestyle_svg_exporter")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOLS_BLENDER_DIR = REPO_ROOT / "tools" / "blender"
if str(TOOLS_BLENDER_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_BLENDER_DIR))

from webtoon_hero_bg.arch_primitives import (  # noqa: E402
    DEFAULT_BEVEL_M,
    MIN_GLASS_THICKNESS_M,
    MeshGroup,
    WallOpening,
    add_balustrade,
    add_beveled_box,
    add_curved_foliage_plant,
    add_door_frame,
    add_pipe_frame,
    add_staircase,
    add_wall_with_openings,
    add_window_sash,
)
from webtoon_hero_bg.cutaway_assembly import (  # noqa: E402
    AssembledHeroScene,
    HeroSceneGroups,
    _remove_hierarchy,
    assemble_desktop_cutaway,
    assemble_mobile_cutaway,
    build_lighting_presets,
    export_cutaway_glb,
    update_manifest_metadata,
)
from webtoon_hero_bg.multiview_preview import (  # noqa: E402
    FREESTYLE_SVG_ADDON,
    PreviewCameraView,
    render_hero_review_bundle,
)
from webtoon_hero_bg.qa_bg_gate import (  # noqa: E402
    audit_blender_scene,
    inspect_glb,
)

TAU = math.tau
DEFAULT_OUT_DIR = REPO_ROOT / "apps" / "web" / "public" / "assets" / "3d" / "environments" / "hero-v1"
DEFAULT_PREVIEW_DIR = REPO_ROOT / "loop-stack" / "v2-previews" / "bg"

Vec3 = Tuple[float, float, float]


# ---------------------------------------------------------------------------
# Shared Geometric & Architectural Sub-Assembly Helpers (0-Defect Manifold)
# ---------------------------------------------------------------------------


def _rot_local(lx: float, ly: float, lz: float, origin: Vec3, rot_z: float = 0.0) -> Vec3:
    ox, oy, oz = origin
    if abs(rot_z) < 1e-8:
        return (ox + lx, oy + ly, oz + lz)
    c, s = math.cos(rot_z), math.sin(rot_z)
    return (ox + lx * c - ly * s, oy + lx * s + ly * c, oz + lz)


def _lbox(
    group: MeshGroup,
    origin: Vec3,
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
    bevel: float = DEFAULT_BEVEL_M,
    uv_fit: Optional[bool] = None,
) -> None:
    """Place a beveled box at local offset ``(lx, ly, lz)`` rotated by ``rot_z`` around ``origin``."""
    world_center = _rot_local(lx, ly, lz, origin, rot_z)
    add_beveled_box(
        group,
        world_center,
        (sx, sy, sz),
        color=color,
        tile=tile,
        bevel=bevel,
        rot_z=rot_z,
        uv_fit=uv_fit,
    )


def _lrail(
    group: MeshGroup,
    origin: Vec3,
    rot_z: float,
    a: Vec3,
    b: Vec3,
    radius: float,
    color: str,
    *,
    tile: str,
    sides: int = 8,
    bevel_ends: bool = True,
) -> None:
    wa = _rot_local(a[0], a[1], a[2], origin, rot_z)
    wb = _rot_local(b[0], b[1], b[2], origin, rot_z)
    group.rail(wa, wb, radius=radius, color=color, sides=sides, tile=tile, bevel_ends=bevel_ends)


def _add_tapered_cylinder(
    group: MeshGroup,
    base_center: Vec3,
    height: float,
    r_bottom: float,
    r_top: float,
    *,
    sides: int = 16,
    color: str = "C2C4C0",
    tile: str = "concrete",
    chamfer: float = 0.004,
) -> None:
    """Watertight vertical cylinder or frustum along +Z with optional end chamfers."""
    cx, cy, z0 = base_center
    z1 = z0 + height
    c = min(chamfer, height * 0.12, r_bottom * 0.18, r_top * 0.18)

    def _ring(r: float, z: float) -> List[Vec3]:
        return [(cx + r * math.cos(TAU * i / sides), cy + r * math.sin(TAU * i / sides), z) for i in range(sides)]

    if c >= 0.001 and height > c * 3.0:
        rings = [
            _ring(max(0.002, r_bottom - c), z0),
            _ring(r_bottom, z0 + c),
            _ring(r_top, z1 - c),
            _ring(max(0.002, r_top - c), z1),
        ]
    else:
        rings = [_ring(r_bottom, z0), _ring(r_top, z1)]
    group.rings(rings, color=color, tile=tile)


def _add_catenary_wire(
    group: MeshGroup,
    start: Vec3,
    end: Vec3,
    *,
    sag: float = 0.32,
    radius: float = 0.010,
    segments: int = 10,
    sides: int = 6,
    color: str = "24262A",
    tile: str = "ceiling_metal",
) -> None:
    """Watertight parabolic catenary overhead cable swept with parallel-transport rings."""
    a = Vector(start)
    b = Vector(end)
    pts: List[Vector] = []
    for i in range(segments + 1):
        t = i / float(segments)
        p = a.lerp(b, t)
        p.z -= 4.0 * sag * t * (1.0 - t)
        pts.append(p)

    rings: List[List[Vector]] = []
    axis: Optional[Vector] = None
    m = len(pts)
    for i, pt in enumerate(pts):
        before = pts[max(0, i - 1)]
        after = pts[min(m - 1, i + 1)]
        tang = after - before
        tang = tang.normalized() if tang.length > 1e-6 else Vector((1.0, 0.0, 0.0))
        if axis is None:
            ref = Vector((0.0, 0.0, 1.0)) if abs(tang.z) < 0.85 else Vector((0.0, 1.0, 0.0))
            axis = tang.cross(ref).normalized()
        else:
            proj = axis - tang * tang.dot(axis)
            axis = proj.normalized() if proj.length > 1e-5 else Vector((0.0, 0.0, 1.0))
        side = tang.cross(axis).normalized()
        rings.append(
            [
                pt + radius * (math.cos(TAU * j / sides) * axis + math.sin(TAU * j / sides) * side)
                for j in range(sides)
            ]
        )
    group.rings(rings, color=color, tile=tile)


def _add_ac_outdoor_unit(
    props: MeshGroup,
    origin: Vec3,
    rot_z: float,
    *,
    width: float = 0.86,
    depth: float = 0.34,
    height: float = 0.68,
    wall_brackets: bool = False,
    body_color: str = "E2DFD7",
    dark_color: str = "343940",
    grille_color: str = "525962",
) -> None:
    """Detailed Korean HVAC outdoor condenser unit facing local ``-Y``."""
    # Grounded rubber anti-vibration pads or steel wall L-brackets
    if wall_brackets:
        for sx in (-width * 0.34, width * 0.34):
            _lbox(props, origin, rot_z, sx, depth * 0.5 - 0.018, -0.06, 0.044, 0.032, 0.34, "687078", tile="galvanized_zinc", bevel=0.003)
            _lbox(props, origin, rot_z, sx, 0.0, -0.022, 0.046, depth + 0.04, 0.036, "687078", tile="galvanized_zinc", bevel=0.003)
            _lrail(props, origin, rot_z, (sx, depth * 0.44, -0.20), (sx, -depth * 0.36, -0.03), 0.014, "5B636B", tile="galvanized_zinc", sides=6)
    else:
        for sx in (-width * 0.34, width * 0.34):
            _lbox(props, origin, rot_z, sx, 0.0, 0.018, 0.070, depth + 0.04, 0.036, "36383C", tile="rubber_dark", bevel=0.004)

    z0 = 0.0 if wall_brackets else 0.034
    # Main powder-coated sheet-metal body + overhanging beveled top lid
    _lbox(props, origin, rot_z, 0.0, 0.0, z0 + height * 0.48, width, depth, height * 0.94, body_color, tile="enamel_gloss", bevel=0.006)
    _lbox(props, origin, rot_z, 0.0, 0.0, z0 + height - 0.022, width + 0.018, depth + 0.018, 0.042, "D6D3CA", tile="enamel_gloss", bevel=0.005)

    # Circular fan shroud cavity + central motor hub + 3 angled fan blades + wire grille
    fan_x = -width * 0.15
    fan_z = z0 + height * 0.50
    fan_r = min(height * 0.35, width * 0.27)
    y_front = -depth * 0.5

    # Dark recessed backing disc protruding 5 mm proud of body (no coplanar overlap)
    _lrail(props, origin, rot_z, (fan_x, y_front + 0.004, fan_z), (fan_x, y_front - 0.008, fan_z), fan_r, dark_color, tile="iron_dark", sides=16, bevel_ends=False)
    # Continuous watertight outer fan shroud torus collar (zero abutting segment edges)
    shroud_rings: List[List[Vec3]] = []
    seg_n = 16
    tube_n = 6
    tube_r = 0.011
    for i in range(seg_n):
        a = TAU * i / seg_n
        ca, sa = math.cos(a), math.sin(a)
        ring: List[Vec3] = []
        for j in range(tube_n):
            b = TAU * j / tube_n
            r_eff = fan_r + tube_r * math.cos(b)
            lx = fan_x + r_eff * ca
            ly = (y_front - 0.016) + tube_r * math.sin(b)
            lz = fan_z + r_eff * sa
            ring.append(_rot_local(lx, ly, lz, origin, rot_z))
        shroud_rings.append(ring)
    props.rings(shroud_rings, color="C9C6BD", tile="aluminum_satin", closed_loop=True)

    # Central fan motor hub + 3 fan blades (staggered slightly in Y so zero welded overlap)
    _lrail(props, origin, rot_z, (fan_x, y_front - 0.004, fan_z), (fan_x, y_front - 0.021, fan_z), fan_r * 0.24, "262A30", tile="plastic_matte", sides=10, bevel_ends=False)
    for k in range(3):
        ang = TAU * k / 3.0 + 0.35
        start_x = fan_x + fan_r * 0.16 * math.cos(ang)
        start_z = fan_z + fan_r * 0.16 * math.sin(ang)
        tip_x = fan_x + fan_r * 0.82 * math.cos(ang)
        tip_z = fan_z + fan_r * 0.82 * math.sin(ang)
        _lrail(props, origin, rot_z, (start_x, y_front - 0.012 - k * 0.0008, start_z), (tip_x, y_front - 0.015 - k * 0.0008, tip_z), 0.024, "3D434C", tile="plastic_matte", sides=6, bevel_ends=False)

    # Protective horizontal + vertical cross grille bars
    for frac in (-0.65, -0.32, 0.0, 0.32, 0.65):
        dz = frac * fan_r
        half_chord = math.sqrt(max(0.001, fan_r * fan_r - dz * dz)) * 0.94
        _lrail(
            props,
            origin,
            rot_z,
            (fan_x - half_chord, y_front - 0.024, fan_z + dz),
            (fan_x + half_chord, y_front - 0.024, fan_z + dz),
            0.0045,
            grille_color,
            tile="steel_brushed",
            sides=6,
            bevel_ends=False,
        )
    for fx_off in (-fan_r * 0.45, 0.0, fan_r * 0.45):
        half_v = math.sqrt(max(0.001, fan_r * fan_r - fx_off * fx_off)) * 0.94
        _lrail(
            props,
            origin,
            rot_z,
            (fan_x + fx_off, y_front - 0.028, fan_z - half_v),
            (fan_x + fx_off, y_front - 0.028, fan_z + half_v),
            0.004,
            grille_color,
            tile="steel_brushed",
            sides=6,
            bevel_ends=False,
        )

    # Right-side service panel + nameplate + side intake louvers + refrigerant valve box
    panel_x = width * 0.30
    _lbox(props, origin, rot_z, panel_x, y_front - 0.006, z0 + height * 0.72, width * 0.24, 0.014, 0.075, "5B6A7A", tile="enamel_gloss", bevel=0.002)
    for i in range(5):
        lz = z0 + 0.14 + i * 0.055
        _lbox(props, origin, rot_z, panel_x, y_front - 0.007, lz, width * 0.22, 0.012, 0.016, "A8AAA4", tile="aluminum_satin", bevel=0.002)
    # Side valve cover + dual insulated refrigerant stubs
    _lbox(props, origin, rot_z, width * 0.5 + 0.026, 0.02, z0 + 0.18, 0.056, 0.14, 0.22, "CFCBC2", tile="enamel_gloss", bevel=0.004)
    for vz in (z0 + 0.14, z0 + 0.21):
        _lrail(props, origin, rot_z, (width * 0.5 + 0.04, 0.02, vz), (width * 0.5 + 0.11, 0.14, vz), 0.014, "D8D2C2", tile="plastic_matte", sides=6)


def _add_vending_machine(
    furniture: MeshGroup,
    props: MeshGroup,
    ceiling_emissive: MeshGroup,
    origin: Vec3,
    rot_z: float,
    *,
    width: float = 1.04,
    depth: float = 0.70,
    height: float = 1.86,
    body_color: str = "C8463E",
    trim_color: str = "EFECE6",
) -> None:
    """Detailed Korean beverage vending machine facing local ``-Y`` (grounded at origin[2])."""
    w, d, h = width, depth, height
    # 4 heavy leveling feet resting cleanly on origin[2]
    foot_y = max(0.14, d * 0.35)
    for sx in (-w * 0.40, w * 0.40):
        for sy in (-foot_y, foot_y):
            _lbox(props, origin, rot_z, sx, sy, 0.024, 0.075, 0.075, 0.048, "34383D", tile="iron_dark", bevel=0.004)

    # Rear main cabinet + side cheek frames leaving a real recessed upper showcase & lower chute
    _lbox(furniture, origin, rot_z, 0.0, 0.05, 0.046 + (h - 0.046) * 0.5, w, d - 0.10, h - 0.046, body_color, tile="wood_painted", bevel=0.007)
    # Front left/right side cheeks
    for sx in (-w * 0.5 + 0.045, w * 0.5 - 0.045):
        _lbox(furniture, origin, rot_z, sx, -d * 0.5 + 0.058, 0.046 + (h - 0.046) * 0.5, 0.088, 0.112, h - 0.052, trim_color, tile="laminate_matte", bevel=0.005)
    # Top header canopy & mid divider fascia & bottom plinth fascia
    _lbox(furniture, origin, rot_z, 0.0, -d * 0.5 + 0.058, h - 0.075, w - 0.16, 0.114, 0.145, body_color, tile="wood_painted", bevel=0.005)
    _lbox(furniture, origin, rot_z, 0.0, -d * 0.5 + 0.056, 0.72, w - 0.16, 0.110, 0.30, trim_color, tile="laminate_matte", bevel=0.005)
    _lbox(furniture, origin, rot_z, 0.0, -d * 0.5 + 0.054, 0.14, w - 0.16, 0.106, 0.18, "3D4148", tile="metal_leg_dark", bevel=0.004)

    # Glowing upper Korean beverage drink showcase panel with crisp drink graphic & prices ("시원한 음료 · 24H")
    _lbox(ceiling_emissive, origin, rot_z, 0.0, -d * 0.5 + 0.112, 1.32, w - 0.21, 0.014, 0.78, "FFFFFF", tile="emissive_neon", bevel=0.002, uv_fit=True)
    # Top header backlit logo strip
    _lbox(ceiling_emissive, origin, rot_z, 0.0, -d * 0.5 - 0.004, h - 0.075, w - 0.24, 0.012, 0.085, "FFF2D6", tile="emissive_warm", bevel=0.002)

    # 3 beverage display shelves + 18 colorful miniature cans/bottles inside recessed showcase
    can_colors = ("D9483B", "3679B8", "3B9A63", "E6A835", "E8E4DA", "54457A")
    for row_i, sz in enumerate((1.03, 1.28, 1.53)):
        _lbox(props, origin, rot_z, 0.0, -d * 0.5 + 0.068, sz - 0.012, w - 0.20, 0.085, 0.018, "D4D7DC", tile="aluminum_satin", bevel=0.002)
        for col_i in range(6):
            cx = -0.34 + col_i * 0.136
            c_col = can_colors[(row_i * 3 + col_i) % len(can_colors)]
            ch = 0.135 if (row_i + col_i) % 2 == 0 else 0.165
            cr = 0.028 if ch < 0.15 else 0.025
            base_pt = _rot_local(cx, -d * 0.5 + 0.068, sz, origin, rot_z)
            _add_tapered_cylinder(props, base_pt, ch, cr, cr * 0.92, sides=8, color=c_col, tile="enamel_gloss", chamfer=0.003)
            # Tactile selection button beneath each slot on the shelf front rail
            _lbox(props, origin, rot_z, cx, -d * 0.5 + 0.020, sz - 0.014, 0.048, 0.014, 0.016, "E6E9EE", tile="plastic_matte", bevel=0.002)

    # Mid control console: bill acceptor, coin slot, digital display, return lever
    _lbox(props, origin, rot_z, 0.24, -d * 0.5 - 0.008, 0.74, 0.22, 0.024, 0.22, "2D3138", tile="plastic_matte", bevel=0.003)
    _lbox(ceiling_emissive, origin, rot_z, 0.24, -d * 0.5 - 0.022, 0.80, 0.09, 0.008, 0.032, "FF7A5A", tile="emissive_amber", bevel=0.001)
    _lbox(props, origin, rot_z, -0.18, -d * 0.5 - 0.005, 0.73, 0.40, 0.018, 0.16, "DCE0E6", tile="aluminum_satin", bevel=0.003)

    # Lower recessed pickup chute + transparent/metal push flap
    _lbox(props, origin, rot_z, 0.0, -d * 0.5 + 0.052, 0.38, w - 0.24, 0.075, 0.26, "22262C", tile="iron_dark", bevel=0.004)
    _lbox(props, origin, rot_z, 0.0, -d * 0.5 + 0.010, 0.41, w - 0.28, 0.018, 0.18, "7C8692", tile="steel_brushed", bevel=0.003)


def _add_rooftop_bench(
    furniture: MeshGroup,
    props: MeshGroup,
    origin: Vec3,
    rot_z: float,
    *,
    length: float = 1.90,
) -> None:
    """High-craft Korean park/school wooden slatted bench with steel legs & backrest."""
    leg_xs = (-length * 0.40, 0.0, length * 0.40)
    for lx in leg_xs:
        # Bolted steel base footplate grounded at origin[2]
        _lbox(props, origin, rot_z, lx, 0.0, 0.010, 0.085, 0.46, 0.020, "3A4248", tile="iron_dark", bevel=0.003)
        # Front & back vertical legs + horizontal seat bearer
        _lbox(props, origin, rot_z, lx, -0.18, 0.215, 0.048, 0.052, 0.39, "3E484E", tile="iron_dark", bevel=0.004)
        _lbox(props, origin, rot_z, lx, 0.18, 0.215, 0.048, 0.052, 0.39, "3E484E", tile="iron_dark", bevel=0.004)
        _lbox(props, origin, rot_z, lx, 0.0, 0.415, 0.056, 0.48, 0.042, "3E484E", tile="iron_dark", bevel=0.004)
        # Slanted backrest steel spine strut
        _lrail(props, origin, rot_z, (lx, 0.19, 0.40), (lx, 0.30, 0.85), 0.024, "3E484E", tile="iron_dark", sides=8)

    # Outer armrests
    for sx in (-1, 1):
        lx = sx * (length * 0.40)
        _lrail(props, origin, rot_z, (lx, -0.19, 0.42), (lx, -0.19, 0.61), 0.018, "444E55", tile="iron_dark", sides=8)
        _lrail(props, origin, rot_z, (lx, -0.19, 0.61), (lx, 0.24, 0.61), 0.018, "444E55", tile="iron_dark", sides=8)

    # 5 beveled cedar/oak seat slats
    slat_colors = ("BC8E5C", "C69764", "B68856", "C29360", "BA8B5A")
    for i, col in enumerate(slat_colors):
        ly = -0.20 + i * 0.100
        _lbox(furniture, origin, rot_z, 0.0, ly, 0.456, length, 0.084, 0.036, col, tile="wood_oak", bevel=0.005)

    # 3 angled backrest slats
    for j, (ly, lz, col) in enumerate(((0.225, 0.59, "C29360"), (0.256, 0.70, "B88958"), (0.288, 0.81, "C69764"))):
        _lbox(furniture, origin, rot_z, 0.0, ly, lz, length, 0.036, 0.086, col, tile="wood_oak", bevel=0.005)


def _add_potted_plant(
    furniture: MeshGroup,
    origin: Vec3,
    *,
    pot_radius: float = 0.20,
    pot_height: float = 0.34,
    foliage_height: float = 0.72,
    pot_color: str = "B56F4D",
    leaf_colors: Sequence[str] = ("3E7A4E", "4F8E5C", "2F6840"),
) -> None:
    """Turned ceramic/terracotta planter with architectural fanned leaves (watertight)."""
    cx, cy, z0 = origin
    sides = 16
    prof = [
        (0.72, 0.0),
        (0.76, 0.06),
        (0.95, 0.78),
        (1.02, 0.82),
        (1.02, 1.00),
        (0.88, 1.00),
        (0.84, 0.82),
    ]
    furniture.rings(
        [
            [(cx + r * pot_radius * math.cos(TAU * i / sides), cy + r * pot_radius * math.sin(TAU * i / sides), z0 + h * pot_height) for i in range(sides)]
            for (r, h) in prof
        ],
        color=pot_color,
        tile="ceramic_matte",
    )
    # Dark soil plug
    _add_tapered_cylinder(furniture, (cx, cy, z0 + pot_height * 0.76), pot_height * 0.10, pot_radius * 0.82, pot_radius * 0.82, sides=12, color="4B3C30", tile="leather", chamfer=0.003)

    # 9 sculpted broad leaves fanning organically from radially separated roots (0 quantized collapse)
    soil_z = z0 + pot_height * 0.85
    for idx in range(9):
        ang = idx * 2.39996
        along = Vector((math.cos(ang), math.sin(ang), 0.0))
        side = Vector((-along.y, along.x, 0.0))
        spread = pot_radius * (1.25 + 0.45 * (idx % 3) / 2.0)
        rise = foliage_height * (0.58 + 0.35 * ((idx * 3) % 4) / 3.0)
        root_pt = Vector((cx, cy, soil_z)) + along * 0.028
        stem_end = root_pt + along * (spread * 0.24) + Vector((0.0, 0.0, rise * 0.44))
        furniture.rail(tuple(root_pt), tuple(stem_end), radius=0.011, color="4A6E44", sides=6, tile="foliage", bevel_ends=False)
        blade_base = stem_end + along * 0.014
        rings: List[List[Vector]] = []
        for t in (0.0, 0.35, 0.72, 1.0):
            broad = 0.068 * (0.28 + 0.86 * (math.sin(math.pi * t) ** 0.75))
            pt = blade_base + along * (spread * 0.82 * t) + Vector((0.0, 0.0, rise * 0.46 * t + 0.06 * math.sin(math.pi * t)))
            ridge = max(0.007, broad * 0.24)
            lower = max(0.005, ridge * 0.65)
            rings.append([pt - side * broad, pt + Vector((0, 0, ridge)), pt + side * broad, pt - Vector((0, 0, lower))])
        furniture.rings(rings, color=leaf_colors[idx % len(leaf_colors)], tile="foliage")


def _add_recycling_station(
    props: MeshGroup,
    origin: Vec3,
    rot_z: float,
    *,
    bins: int = 3,
) -> None:
    """Korean multi-bin steel recycling station with color-coded lids & labels."""
    bin_w = 0.38
    gap = 0.04
    total_w = bins * bin_w + (bins - 1) * gap + 0.08
    d = 0.42
    # Welded steel frame base & rear rail
    _lbox(props, origin, rot_z, 0.0, 0.0, 0.022, total_w, d, 0.040, "495058", tile="iron_dark", bevel=0.004)
    _lbox(props, origin, rot_z, 0.0, d * 0.5 - 0.018, 0.46, total_w - 0.02, 0.028, 0.86, "5B636B", tile="steel_brushed", bevel=0.003)

    lid_colors = ("3A76B5", "3E8E5A", "D48B32", "B84A42")
    for i in range(bins):
        bx = -((bins - 1) * 0.5) * (bin_w + gap) + i * (bin_w + gap)
        # Bin body
        _lbox(props, origin, rot_z, bx, -0.01, 0.36, bin_w - 0.02, d - 0.08, 0.64, "D8DCE0", tile="plastic_matte", bevel=0.005)
        # Color-coded pitched top hood with recessed throw-in slot
        lcol = lid_colors[i % len(lid_colors)]
        _lbox(props, origin, rot_z, bx, -0.01, 0.74, bin_w, d - 0.06, 0.14, lcol, tile="enamel_gloss", bevel=0.005)
        _lbox(props, origin, rot_z, bx, -d * 0.5 + 0.026, 0.74, bin_w * 0.62, 0.022, 0.072, "252A30", tile="rubber_dark", bevel=0.002)
        # Front sorting label placard
        _lbox(props, origin, rot_z, bx, -d * 0.5 + 0.026, 0.48, bin_w * 0.58, 0.010, 0.14, lcol, tile="paper_label", bevel=0.002)


def _add_traffic_cone(props: MeshGroup, center: Vec3) -> None:
    """Korean red/orange weighted traffic safety cone with white reflective collar."""
    cx, cy, z0 = center
    add_beveled_box(props, (cx, cy, z0 + 0.022), (0.34, 0.34, 0.044), color="2A2D32", tile="rubber_dark", bevel=0.005)
    # Single continuous cone body + slightly proud reflective white band (zero coincident rings)
    _add_tapered_cylinder(props, (cx, cy, z0 + 0.040), 0.60, 0.126, 0.030, sides=12, color="E04B28", tile="plastic_matte", chamfer=0.002)
    _add_tapered_cylinder(props, (cx, cy, z0 + 0.285), 0.135, 0.094, 0.072, sides=12, color="F4F4F0", tile="enamel_gloss", chamfer=0.002)


def _add_bollard(props: MeshGroup, center: Vec3, *, height: float = 0.82) -> None:
    """Korean dark-steel pedestrian bollard with dual high-vis reflective bands."""
    cx, cy, z0 = center
    _add_tapered_cylinder(props, (cx, cy, z0), 0.028, 0.088, 0.084, sides=12, color="363B42", tile="iron_dark", chamfer=0.003)
    _add_tapered_cylinder(props, (cx, cy, z0 + 0.026), height - 0.06, 0.062, 0.060, sides=12, color="3D434B", tile="iron_dark", chamfer=0.003)
    # Two reflective yellow-white bands (slightly proud to avoid coplanar overlap)
    for bz in (z0 + height * 0.64, z0 + height * 0.78):
        _add_tapered_cylinder(props, (cx, cy, bz), 0.055, 0.065, 0.065, sides=12, color="EED24A", tile="enamel_gloss", chamfer=0.002)
    # Domed brushed steel cap
    _add_tapered_cylinder(props, (cx, cy, z0 + height - 0.036), 0.038, 0.061, 0.034, sides=12, color="A8B0B8", tile="steel_brushed", chamfer=0.003)


# ---------------------------------------------------------------------------
# SCENE 1: kr_school_rooftop_hero (14.0 x 11.0 x 4.5 m)
# ---------------------------------------------------------------------------


def _add_rooftop_parapet_and_fence(
    wall_group: MeshGroup,
    origin: Vec3,
    length: float,
    rot_z: float,
    *,
    deck_z: float = 0.20,
    parapet_h: float = 1.02,
    fence_h: float = 2.00,
    wall_thick: float = 0.26,
    post_spacing: float = 2.15,
    wire_pitch: float = 0.30,
    skip_fence_x_range: Optional[Tuple[float, float]] = None,
) -> None:
    """Build one side of the rooftop concrete parapet + coping + diamond chain-link fence.

    Local coordinates before ``rot_z``:
    - X: ``[-length/2, +length/2]``
    - Y: ``-Y`` is inward (courtyard side), ``+Y`` is outward (building drop-off)
    - Z: rests on ``deck_z`` (cant strip & concrete wall) up to ``deck_z + parapet_h + fence_h``.
    """
    half_l = length * 0.5
    parapet_top = deck_z + parapet_h

    # Main concrete parapet wall (slightly recessed 4 mm from ends to prevent corner weld overlaps)
    eff_l = length - 0.008
    _lbox(wall_group, origin, rot_z, 0.0, 0.0, deck_z + parapet_h * 0.5, eff_l, wall_thick, parapet_h, "B9B5AC", tile="concrete", bevel=0.006)

    # Interior green urethane waterproof cove cant strip along base of parapet
    _lbox(wall_group, origin, rot_z, 0.0, -wall_thick * 0.5 - 0.022, deck_z + 0.075, eff_l - 0.06, 0.052, 0.15, "4A8564", tile="trim_paint", bevel=0.008)

    # Concrete control-joint vertical pilaster ribs on inside face every ~2.4 m
    n_ribs = max(2, int(round(length / 2.4)))
    for i in range(1, n_ribs):
        rx = -half_l + (length * i / n_ribs)
        _lbox(wall_group, origin, rot_z, rx, -wall_thick * 0.5 - 0.012, deck_z + 0.16 + (parapet_h - 0.22) * 0.5, 0.09, 0.028, parapet_h - 0.22, "AEAAA0", tile="concrete", bevel=0.004)

    # Segmented beveled concrete/aluminum coping cap with 30 mm drip overhang
    n_caps = max(3, int(round(length / 2.0)))
    cap_step = (length - 0.02) / n_caps
    for i in range(n_caps):
        cx = -half_l + 0.01 + (i + 0.5) * cap_step
        _lbox(wall_group, origin, rot_z, cx, 0.0, parapet_top + 0.032, cap_step - 0.012, wall_thick + 0.064, 0.068, "C9C5BC", tile="stone_plinth", bevel=0.006)

    # Chain-link fence spans (optionally skipping behind stairhouse)
    coping_top = parapet_top + 0.064
    spans: List[Tuple[float, float]] = []
    if skip_fence_x_range is None:
        spans.append((-half_l + 0.14, half_l - 0.14))
    else:
        sx0, sx1 = skip_fence_x_range
        if sx0 - (-half_l + 0.14) > 0.35:
            spans.append((-half_l + 0.14, sx0))
        if (half_l - 0.14) - sx1 > 0.35:
            spans.append((sx1, half_l - 0.14))

    for x0, x1 in spans:
        span_len = x1 - x0
        if span_len < 0.30:
            continue
        n_bays = max(1, int(round(span_len / post_spacing)))
        rail_bot_z = coping_top + 0.08
        rail_mid_z = coping_top + fence_h * 0.50
        rail_top_z = coping_top + fence_h - 0.04

        # Vertical galvanized steel posts + bolted baseplates + angled inward security arms
        for bi in range(n_bays + 1):
            px = x0 + span_len * (bi / float(n_bays))
            _lbox(wall_group, origin, rot_z, px, 0.0, coping_top + 0.009, 0.14, 0.14, 0.018, "6D757D", tile="sash_metal", bevel=0.003)
            _lrail(wall_group, origin, rot_z, (px, 0.0, coping_top + 0.014), (px, 0.0, coping_top + fence_h), 0.026, "858E96", tile="sash_metal", sides=8)
            # 30-degree inward-cantilevered top security arm (classic Korean school rooftop fence!)
            arm_tip = (px, -0.18, coping_top + fence_h + 0.24)
            _lrail(wall_group, origin, rot_z, (px, 0.0, coping_top + fence_h - 0.02), arm_tip, 0.018, "7C858D", tile="sash_metal", sides=6)

        # Horizontal fence rails (bottom, middle, top) + 2 upper security tension wires
        for rz, rad in ((rail_bot_z, 0.016), (rail_mid_z, 0.016), (rail_top_z, 0.021)):
            _lrail(wall_group, origin, rot_z, (x0, 0.0, rz), (x1, 0.0, rz), rad, "8B949C", tile="sash_metal", sides=8)
        for frac in (0.55, 0.96):
            sy = -0.18 * frac
            sz = coping_top + fence_h + 0.24 * frac
            _lrail(wall_group, origin, rot_z, (x0, sy, sz), (x1, sy, sz), 0.006, "6E7780", tile="sash_metal", sides=4, bevel_ends=False)

        # Diagonal structural corner brace struts at end bays
        if n_bays >= 2:
            bay_w = span_len / n_bays
            _lrail(wall_group, origin, rot_z, (x0 + 0.02, 0.0, rail_bot_z + 0.04), (x0 + bay_w - 0.02, 0.0, rail_mid_z - 0.02), 0.014, "79828A", tile="sash_metal", sides=6)
            _lrail(wall_group, origin, rot_z, (x1 - 0.02, 0.0, rail_bot_z + 0.04), (x1 - bay_w + 0.02, 0.0, rail_mid_z - 0.02), 0.014, "79828A", tile="sash_metal", sides=6)

        # Crisp 3D offset ±45° diamond chain-link wire mesh (4-sided closed struts, zero Z-fighting)
        mesh_h = rail_top_z - rail_bot_z
        # Forward-leaning (+45°) wires offset at y = -0.007; backward-leaning (-45°) at y = +0.007
        for sign, y_off in ((1.0, -0.007), (-1.0, 0.007)):
            # Line equation: x(z) = x_start + sign * (z - rail_bot_z)
            # Sweep x_start across [x0 - mesh_h, x1 + mesh_h]
            start_min = x0 - mesh_h if sign > 0 else x0
            start_max = x1 if sign > 0 else x1 + mesh_h
            steps = int((start_max - start_min) / wire_pitch) + 1
            for k in range(steps):
                xs_base = start_min + k * wire_pitch
                # Clip diagonal segment to [x0, x1] x [rail_bot_z, rail_top_z]
                t0 = 0.0
                t1 = mesh_h
                # x(t) = xs_base + sign * t must lie in [x0, x1]
                if sign > 0:
                    t0 = max(t0, x0 - xs_base)
                    t1 = min(t1, x1 - xs_base)
                else:
                    t0 = max(t0, xs_base - x1)
                    t1 = min(t1, xs_base - x0)
                if t1 - t0 < 0.08:
                    continue
                p0 = (xs_base + sign * t0, y_off, rail_bot_z + t0)
                p1 = (xs_base + sign * t1, y_off, rail_bot_z + t1)
                _lrail(wall_group, origin, rot_z, p0, p1, 0.0052, "96A0A8", tile="sash_metal", sides=4, bevel_ends=False)


def _add_rooftop_stairhouse(
    wall_north: MeshGroup,
    ceiling_emissive: MeshGroup,
    props: MeshGroup,
    *,
    deck_z: float = 0.20,
) -> None:
    """Korean school rooftop stairhouse (계단실) with steel fire door, rain canopy, window & vents."""
    # Footprint: X in [-6.45, -2.35] (W=4.10), Y in [+1.65, +5.05] (D=3.40), roof slab at Z=3.40
    cx = -4.40
    cy = 3.35
    w = 4.10
    d = 3.40
    h = 3.22
    t = 0.22
    z0 = deck_z

    # Raised concrete plinth skirt around stairhouse base
    add_beveled_box(wall_north, (cx, cy, z0 + 0.07), (w + 0.08, d + 0.08, 0.14), color="9F9C94", tile="concrete", bevel=0.006)

    # South wall (facing open courtyard -Y) with recessed steel fire door opening
    add_wall_with_openings(
        wall_north,
        center=(cx, cy - d * 0.5 + t * 0.5, z0 + 0.135),
        length=w - 0.008,
        thickness=t,
        height=h - 0.135,
        openings=[WallOpening(offset_x=0.55, width=1.08, height=2.14, sill_z=0.0, kind="door")],
        rot_z=0.0,
        color="DDD6C7",
        tile="plaster",
        baseboard_height=0.0,
        crown_height=0.0,
    )
    # East wall (facing water tank +X) with clerestory sliding window opening
    add_wall_with_openings(
        wall_north,
        center=(cx + w * 0.5 - t * 0.5, cy, z0 + 0.135),
        length=d - t * 2.0 - 0.012,
        thickness=t,
        height=h - 0.135,
        openings=[WallOpening(offset_x=0.0, width=1.42, height=1.08, sill_z=1.18, kind="window")],
        rot_z=math.pi * 0.5,
        color="DDD6C7",
        tile="plaster",
        baseboard_height=0.0,
        crown_height=0.0,
    )
    # West & North solid exterior walls
    add_wall_with_openings(
        wall_north,
        center=(cx - w * 0.5 + t * 0.5, cy, z0 + 0.135),
        length=d - t * 2.0 - 0.012,
        thickness=t,
        height=h - 0.135,
        rot_z=-math.pi * 0.5,
        color="D5CEC0",
        tile="plaster",
        baseboard_height=0.0,
        crown_height=0.0,
    )
    add_wall_with_openings(
        wall_north,
        center=(cx, cy + d * 0.5 - t * 0.5, z0 + 0.135),
        length=w - 0.008,
        thickness=t,
        height=h - 0.135,
        rot_z=math.pi,
        color="D5CEC0",
        tile="plaster",
        baseboard_height=0.0,
        crown_height=0.0,
    )

    # Terracotta brick wainscot decorative band around lower exterior of stairhouse
    add_beveled_box(wall_north, (cx - 0.85, cy - d * 0.5 - 0.012, z0 + 0.62), (2.22, 0.028, 0.94), color="A6634B", tile="brick", bevel=0.004)
    add_beveled_box(wall_north, (cx + 1.62, cy - d * 0.5 - 0.012, z0 + 0.62), (0.82, 0.028, 0.94), color="A6634B", tile="brick", bevel=0.004)
    add_beveled_box(wall_north, (cx + w * 0.5 + 0.012, cy, z0 + 0.62), (0.028, d - 0.04, 0.94), color="A6634B", tile="brick", bevel=0.004)

    # Concrete stairhouse roof slab + raised perimeter parapet & overhanging eave coping
    roof_z = z0 + h
    add_beveled_box(wall_north, (cx, cy, roof_z + 0.07), (w + 0.14, d + 0.14, 0.14), color="C5C0B6", tile="concrete", bevel=0.006)
    # 4 low roof parapet curbs atop stairhouse (Z = 3.56..3.80)
    for sy in (-1, 1):
        add_beveled_box(wall_north, (cx, cy + sy * (d * 0.5 - 0.05), roof_z + 0.25), (w + 0.10, 0.18, 0.24), color="B8B3A9", tile="concrete", bevel=0.005)
    for sx in (-1, 1):
        add_beveled_box(wall_north, (cx + sx * (w * 0.5 - 0.05), cy, roof_z + 0.25), (0.18, d - 0.28, 0.24), color="B8B3A9", tile="concrete", bevel=0.005)
    # Stairhouse interior stairwell dark backing block behind door/window so no void shows
    add_beveled_box(wall_north, (cx, cy + 0.10, z0 + 1.65), (w - 0.56, d - 0.64, 2.90), color="585E64", tile="concrete", bevel=0.004)

    # Concrete entry landing step outside South fire door
    door_x = cx + 0.55
    door_y = cy - d * 0.5 + t * 0.5
    add_beveled_box(wall_north, (door_x, cy - d * 0.5 - 0.34, z0 + 0.068), (1.38, 0.66, 0.136), color="ABA79E", tile="stone_plinth", bevel=0.005)

    # Heavy Korean Steel Fire Door (방화문) + panic bar + closer + wired vision glass slit
    add_door_frame(
        wall_north,
        center=(door_x, door_y, z0 + 0.135),
        width=1.08,
        height=2.14,
        wall_thickness=t,
        rot_z=0.0,
        open_deg=0.0,
        hinge_left=True,
        frame_color="4D5660",
        frame_tile="sash_metal",
        leaf_color="5A6975",
        leaf_tile="sash_metal",
        handle_color="C8CDD2",
        handle_tile="hardware_brass",
        panel_rows=2,
    )
    # Wired glass narrow vision window + steel bezel on fire door leaf
    add_beveled_box(wall_north, (door_x + 0.16, door_y - 0.026, z0 + 1.56), (0.20, 0.016, 0.66), color="3F4850", tile="sash_metal", bevel=0.003)
    add_beveled_box(ceiling_emissive, (door_x + 0.16, door_y - 0.032, z0 + 1.56), (0.14, 0.010, 0.58), color="DCEEF6", tile="glass_frosted", bevel=0.0015)
    # Stainless steel kickplate & overhead hydraulic door closer arm + push bar
    add_beveled_box(props, (door_x, door_y - 0.028, z0 + 0.30), (0.90, 0.008, 0.24), color="AEB6BE", tile="steel_brushed", bevel=0.002)
    add_beveled_box(props, (door_x - 0.14, door_y - 0.044, z0 + 2.12), (0.24, 0.046, 0.056), color="8D959E", tile="aluminum_satin", bevel=0.003)
    props.rail((door_x - 0.06, door_y - 0.048, z0 + 2.12), (door_x + 0.12, door_y - 0.088, z0 + 2.22), 0.009, "6B737C", sides=6, tile="steel_brushed")
    # Horizontal stainless push bar across door middle
    add_beveled_box(props, (door_x, door_y - 0.056, z0 + 1.08), (0.76, 0.026, 0.048), color="C5CCD4", tile="steel_brushed", bevel=0.004)

    # Cantilevered concrete rain canopy (처마) over fire door + diagonal steel tie-rods
    canopy_y = cy - d * 0.5 - 0.42
    add_beveled_box(wall_north, (door_x, canopy_y, z0 + 2.52), (1.76, 0.86, 0.12), color="CFC9BE", tile="concrete", bevel=0.006)
    add_beveled_box(wall_north, (door_x, canopy_y - 0.40, z0 + 2.56), (1.80, 0.06, 0.16), color="BEB8AC", tile="stone_plinth", bevel=0.005)
    for sx in (-0.72, 0.72):
        props.rail((door_x + sx, cy - d * 0.5 - 0.02, z0 + 3.02), (door_x + sx, canopy_y - 0.26, z0 + 2.58), 0.015, "5B646E", sides=8, tile="iron_dark")

    # Illuminated green Korean EXIT sign box ("비상구 EXIT") + warm caged bulkhead porch light under canopy
    add_beveled_box(props, (door_x, cy - d * 0.5 - 0.048, z0 + 2.38), (0.44, 0.070, 0.16), color="E2E4E6", tile="enamel_gloss", bevel=0.003)
    add_beveled_box(ceiling_emissive, (door_x, cy - d * 0.5 - 0.088, z0 + 2.38), (0.38, 0.012, 0.115), color="FFFFFF", tile="emissive_exit_green", bevel=0.002, uv_fit=True)
    # Framed Korean Rooftop Safety Warning Sign ("위험 · 주의 · 옥상 출입 주의") beside fire door
    add_beveled_box(wall_north, (door_x - 0.96, cy - d * 0.5 - 0.014, z0 + 1.56), (0.50, 0.018, 0.36), color="383E46", tile="sash_metal", bevel=0.003)
    add_beveled_box(wall_north, (door_x - 0.96, cy - d * 0.5 - 0.026, z0 + 1.56), (0.45, 0.008, 0.31), color="FFFFFF", tile="chalkboard", bevel=0.001, uv_fit=True)
    # Bulkhead ceiling lamp under canopy
    add_beveled_box(props, (door_x, canopy_y, z0 + 2.44), (0.28, 0.14, 0.036), color="4A5058", tile="iron_dark", bevel=0.003)
    add_beveled_box(ceiling_emissive, (door_x, canopy_y, z0 + 2.41), (0.22, 0.10, 0.032), color="FFF0CE", tile="emissive_warm", bevel=0.004)

    # East clerestory 2-pane sliding window + steel security bars
    win_center = (cx + w * 0.5 - t * 0.5, cy, z0 + 1.315)
    add_window_sash(
        wall_north,
        center=win_center,
        width=1.42,
        height=1.08,
        wall_thickness=t,
        rot_z=math.pi * 0.5,
        panes_x=2,
        panes_z=1,
        sliding=True,
        frame_color="68717A",
        frame_tile="sash_metal",
        sill_color="BEB8AC",
        sill_tile="stone_plinth",
        include_glass=True,
        glass_group=ceiling_emissive,
        glass_color="CBE4EE",
        glass_tile="glass_clear",
    )
    # Vertical steel security guard bars outside East window
    bar_x = cx + w * 0.5 + 0.055
    for bi in range(7):
        by = cy - 0.62 + bi * (1.24 / 6.0)
        props.rail((bar_x, by, z0 + 1.35), (bar_x, by, z0 + 2.36), 0.009, "59626C", sides=6, tile="steel_brushed")
    for bz in (z0 + 1.56, z0 + 2.14):
        props.rail((bar_x, cy - 0.68, bz), (bar_x, cy + 0.68, bz), 0.011, "59626C", sides=6, tile="steel_brushed")

    # Louvered mechanical exhaust vent + electrical panel box + rooftop turbine vent + school PA horn
    # Electrical breaker cabinet on South-West face of stairhouse
    bx, by_face = cx - 1.25, cy - d * 0.5
    add_beveled_box(props, (bx, by_face - 0.09, z0 + 1.48), (0.58, 0.18, 0.72), color="C5C8CC", tile="enamel_gloss", bevel=0.005)
    add_beveled_box(props, (bx, by_face - 0.185, z0 + 1.48), (0.50, 0.014, 0.64), color="D2D5D9", tile="enamel_gloss", bevel=0.003)
    add_beveled_box(props, (bx + 0.18, by_face - 0.20, z0 + 1.48), (0.036, 0.022, 0.095), color="3C424A", tile="iron_dark", bevel=0.002)
    # Galvanized steel conduits running up from breaker cabinet to stairhouse roof
    for dx in (-0.16, -0.06, 0.06):
        add_pipe_frame(
            props,
            [(bx + dx, by_face - 0.06, z0 + 1.84), (bx + dx, by_face - 0.06, roof_z - 0.12), (bx + dx, by_face + 0.06, roof_z - 0.12)],
            radius=0.014,
            sides=8,
            color="8D959E",
            tile="galvanized_zinc",
            flange_ends=False,
        )

    # Rooftop ventilation exhaust duct + galvanized turbine ventilator on stairhouse roof
    duct_z = roof_z + 0.26
    add_beveled_box(props, (cx - 0.80, cy - 0.20, duct_z), (0.76, 0.76, 0.34), color="A6AEB6", tile="galvanized_zinc", bevel=0.005)
    _add_tapered_cylinder(props, (cx - 0.80, cy - 0.20, duct_z + 0.16), 0.26, 0.26, 0.24, sides=14, color="B8C0C8", tile="aluminum_satin", chamfer=0.004)
    # Ribbed spinning turbine dome (10 continuous curved vane ribs)
    turb_z = duct_z + 0.42
    for i in range(10):
        ang = TAU * i / 10.0
        p0 = (cx - 0.80 + 0.24 * math.cos(ang), cy - 0.20 + 0.24 * math.sin(ang), turb_z)
        p1 = (cx - 0.80 + 0.30 * math.cos(ang + 0.25), cy - 0.20 + 0.30 * math.sin(ang + 0.25), turb_z + 0.16)
        p2 = (cx - 0.80 + 0.14 * math.cos(ang + 0.45), cy - 0.20 + 0.14 * math.sin(ang + 0.45), turb_z + 0.32)
        add_pipe_frame(props, [p0, p1, p2], radius=0.013, sides=6, bend_radius=0.05, color="CFD6DC", tile="aluminum_satin", flange_ends=False)
    _add_tapered_cylinder(props, (cx - 0.80, cy - 0.20, turb_z + 0.30), 0.045, 0.16, 0.08, sides=12, color="B0B8C0", tile="aluminum_satin", chamfer=0.003)

    # Classic Korean School PA Loudspeaker Horn on corner steel pole (max Z ~ 4.44 m)
    pa_x, pa_y = cx + w * 0.5 - 0.22, cy - d * 0.5 + 0.22
    props.rail((pa_x, pa_y, roof_z + 0.12), (pa_x, pa_y, 4.42), 0.024, "68717A", sides=8, tile="galvanized_zinc")
    # Twin megaphone speaker horns facing courtyard
    for ang_deg, hz in ((-35.0, 4.24), (20.0, 4.04)):
        ang = math.radians(ang_deg)
        dx, dy = math.sin(ang), -math.cos(ang)
        rings = []
        for dist, rad in ((0.0, 0.036), (0.08, 0.052), (0.20, 0.095), (0.30, 0.145), (0.32, 0.135)):
            c_pt = Vector((pa_x + dx * dist, pa_y + dy * dist, hz - dist * 0.18))
            perp = Vector((-dy, dx, 0.0))
            up = Vector((0.0, 0.0, 1.0))
            rings.append([tuple(c_pt + rad * (math.cos(TAU * j / 12) * perp + math.sin(TAU * j / 12) * up)) for j in range(12)])
        props.rings(rings, color="DDE0E2", tile="enamel_gloss")


def _add_water_tank_tower(
    props: MeshGroup,
    wall_east: MeshGroup,
    *,
    center_xy: Tuple[float, float] = (4.10, 3.15),
    deck_z: float = 0.20,
) -> None:
    """Elevated Korean stainless steel water tank + X-braced steel truss + 5-hoop safety ladder."""
    cx, cy = center_xy
    tw, td = 2.60, 2.30
    plinth_h = 0.24
    truss_z0 = deck_z + plinth_h
    plat_z = deck_z + 2.02  # Z = 2.22 m catwalk platform

    # 4 stepped concrete foundation plinths grounded cleanly on deck_z (in props for standalone integrity)
    col_offsets = [(-tw * 0.5 + 0.12, -td * 0.5 + 0.12), (tw * 0.5 - 0.12, -td * 0.5 + 0.12), (tw * 0.5 - 0.12, td * 0.5 - 0.12), (-tw * 0.5 + 0.12, td * 0.5 - 0.12)]
    for ox, oy in col_offsets:
        px, py = cx + ox, cy + oy
        add_beveled_box(props, (px, py, deck_z + plinth_h * 0.5), (0.42, 0.42, plinth_h), color="A8A49B", tile="stone_prop", bevel=0.006)
        add_beveled_box(props, (px, py, truss_z0 + 0.012), (0.26, 0.26, 0.024), color="4D565E", tile="iron_dark", bevel=0.003)
        # Main vertical steel H-column (Z = truss_z0 .. plat_z)
        add_beveled_box(props, (px, py, (truss_z0 + plat_z) * 0.5), (0.11, 0.11, plat_z - truss_z0), color="586570", tile="iron_dark", bevel=0.004)

    # Mid-level horizontal tie beams + top perimeter I-beams + diagonal X-bracing on all 4 bays
    mid_z = (truss_z0 + plat_z) * 0.5
    for idx in range(4):
        ax, ay = cx + col_offsets[idx][0], cy + col_offsets[idx][1]
        bx, by = cx + col_offsets[(idx + 1) % 4][0], cy + col_offsets[(idx + 1) % 4][1]
        props.timber((ax, ay, mid_z), (bx, by, mid_z), 0.068, 0.078, color="5F6D78", tile="iron_dark", bevel=0.003)
        props.timber((ax, ay, plat_z - 0.05), (bx, by, plat_z - 0.05), 0.088, 0.110, color="525F6A", tile="iron_dark", bevel=0.004)
        # Diagonal X-brace rods (offset 12 mm apart so they don't share coincident edges)
        props.rail((ax, ay, truss_z0 + 0.08), (bx, by, mid_z - 0.04), 0.016, "6D7A84", sides=6, tile="galvanized_zinc")
        props.rail((bx, by, truss_z0 + 0.08), (ax, ay, mid_z - 0.04), 0.016, "6D7A84", sides=6, tile="galvanized_zinc")
        props.rail((ax, ay, mid_z + 0.04), (bx, by, plat_z - 0.09), 0.016, "6D7A84", sides=6, tile="galvanized_zinc")
        props.rail((bx, by, mid_z + 0.04), (ax, ay, plat_z - 0.09), 0.016, "6D7A84", sides=6, tile="galvanized_zinc")

    # Cross floor joists + slatted galvanized steel service catwalk deck (Z = plat_z)
    for j in range(5):
        jy = cy - td * 0.42 + j * (td * 0.84 / 4.0)
        props.timber((cx - tw * 0.5, jy, plat_z - 0.04), (cx + tw * 0.5, jy, plat_z - 0.04), 0.060, 0.085, color="525F6A", tile="iron_dark", bevel=0.003)
    cat_w, cat_d = tw + 0.34, td + 0.34
    for s in range(14):
        sy = cy - cat_d * 0.48 + s * (cat_d * 0.96 / 13.0)
        add_beveled_box(props, (cx, sy, plat_z + 0.016), (cat_w, 0.095, 0.024), color="8F99A2", tile="galvanized_zinc", bevel=0.003)

    # Catwalk safety guardrails (inset East/West runs by 0.09 m so corner newel posts never overlap)
    r_x0, r_x1 = cx - cat_w * 0.48, cx + cat_w * 0.48
    r_y0, r_y1 = cy - cat_d * 0.48, cy + cat_d * 0.48
    corner_pad = 0.095
    rail_segs = [
        ((r_x0, r_y0 + corner_pad, plat_z + 0.02), (r_x0, r_y1 - corner_pad, plat_z + 0.02)),
        ((r_x0, r_y1, plat_z + 0.02), (r_x1, r_y1, plat_z + 0.02)),
        ((r_x1, r_y1 - corner_pad, plat_z + 0.02), (r_x1, r_y0 + corner_pad, plat_z + 0.02)),
        ((r_x1, r_y0, plat_z + 0.02), (cx + 0.34, r_y0, plat_z + 0.02)),
        ((cx - 0.34, r_y0, plat_z + 0.02), (r_x0, r_y0, plat_z + 0.02)),
    ]
    for p_start, p_end in rail_segs:
        add_balustrade(
            props,
            p_start,
            p_end,
            height=0.92,
            baluster_spacing=0.45,
            style="steel",
            color="7D8790",
            tile="galvanized_zinc",
            rail_color="C8A83E",
            rail_tile="enamel_gloss",
        )

    # Ribbed Cylindrical STS304 Stainless Steel Water Tank (Z = 2.25..4.42 m, breather to 4.49 m)
    tank_z0 = plat_z + 0.03
    tank_r = 0.94
    tank_cyl_h = 1.84
    tank_sides = 24
    # Concrete/steel cradle ring
    _add_tapered_cylinder(props, (cx, cy, tank_z0), 0.08, tank_r + 0.04, tank_r + 0.02, sides=tank_sides, color="636D76", tile="iron_dark", chamfer=0.004)
    # Main cylindrical body
    _add_tapered_cylinder(props, (cx, cy, tank_z0 + 0.075), tank_cyl_h, tank_r, tank_r, sides=tank_sides, color="CED5DC", tile="steel_brushed", chamfer=0.005)
    # 5 horizontal stiffening rib bands wrapping the stainless tank
    for rib_i in range(5):
        rz = tank_z0 + 0.24 + rib_i * 0.38
        _add_tapered_cylinder(props, (cx, cy, rz), 0.042, tank_r + 0.026, tank_r + 0.026, sides=tank_sides, color="BAC3CC", tile="aluminum_satin", chamfer=0.004)
    # Conical domed roof (Z = 4.14..4.42)
    dome_z0 = tank_z0 + 0.075 + tank_cyl_h - 0.005
    _add_tapered_cylinder(props, (cx, cy, dome_z0), 0.27, tank_r + 0.03, 0.14, sides=tank_sides, color="D6DDE4", tile="steel_brushed", chamfer=0.004)
    # Central gooseneck breather vent pipe reaching Z = 4.49 m (<= 4.50 m spec!)
    add_pipe_frame(
        props,
        [(cx, cy, dome_z0 + 0.22), (cx, cy, 4.47), (cx + 0.16, cy, 4.47), (cx + 0.16, cy, 4.32)],
        radius=0.022,
        sides=8,
        bend_radius=0.042,
        color="9AA4AE",
        tile="steel_brushed",
        flange_ends=False,
    )
    # Top inspection hatch drum + hinged cover on South-West slope of tank roof
    _add_tapered_cylinder(props, (cx - 0.36, cy - 0.32, dome_z0 + 0.06), 0.22, 0.18, 0.18, sides=12, color="B6BFC8", tile="steel_brushed", chamfer=0.004)
    _add_tapered_cylinder(props, (cx - 0.36, cy - 0.32, dome_z0 + 0.27), 0.035, 0.205, 0.205, sides=12, color="DCE2E8", tile="aluminum_satin", chamfer=0.004)

    # Insulated water supply & overflow riser pipes descending from tank to deck + red gate valve wheel
    pipe_x = cx - 0.62
    pipe_y = cy - 0.92
    add_pipe_frame(
        props,
        [(cx - 0.56, cy - 0.56, tank_z0 + 0.05), (pipe_x, pipe_y, plat_z - 0.16), (pipe_x, pipe_y, deck_z + 0.02)],
        radius=0.044,
        sides=10,
        color="B5B9BC",
        tile="aluminum_satin",
    )
    add_pipe_frame(
        props,
        [(cx - 0.38, cy - 0.64, tank_z0 + 0.05), (pipe_x + 0.18, pipe_y, plat_z - 0.24), (pipe_x + 0.18, pipe_y, deck_z + 0.02)],
        radius=0.032,
        sides=10,
        color="7D8892",
        tile="galvanized_zinc",
    )
    # Red cast-iron gate valve handwheel at waist height Z = 1.25 m (single closed torus + offset spokes)
    add_beveled_box(props, (pipe_x, pipe_y - 0.045, deck_z + 1.05), (0.11, 0.09, 0.11), color="4D555E", tile="iron_dark", bevel=0.004)
    props.rail((pipe_x, pipe_y - 0.08, deck_z + 1.05), (pipe_x, pipe_y - 0.15, deck_z + 1.05), 0.014, "3A4046", sides=8, tile="iron_dark")
    vy = pipe_y - 0.155
    vz = deck_z + 1.05
    vr = 0.095
    wheel_rings: List[List[Vec3]] = []
    for i in range(14):
        a = TAU * i / 14.0
        ca, sa = math.cos(a), math.sin(a)
        wheel_rings.append(
            [
                (
                    pipe_x + (vr + 0.011 * math.cos(TAU * j / 6.0)) * ca,
                    vy + 0.011 * math.sin(TAU * j / 6.0),
                    vz + (vr + 0.011 * math.cos(TAU * j / 6.0)) * sa,
                )
                for j in range(6)
            ]
        )
    props.rings(wheel_rings, color="C83832", tile="enamel_gloss", closed_loop=True)
    props.rail((pipe_x - vr + 0.01, vy - 0.002, vz), (pipe_x + vr - 0.01, vy - 0.002, vz), 0.008, "C83832", sides=6, tile="enamel_gloss")
    props.rail((pipe_x, vy + 0.002, vz - vr + 0.01), (pipe_x, vy + 0.002, vz + vr - 0.01), 0.008, "C83832", sides=6, tile="enamel_gloss")

    # Vertical Caged Safety-Hoop Ladder on South face (deck Z=0.20 -> Z=4.18 m!)
    lad_y = r_y0 - 0.06
    lad_w = 0.44
    lad_top_z = 4.18
    for sx in (-lad_w * 0.5, lad_w * 0.5):
        props.rail((cx + sx, lad_y, deck_z), (cx + sx, lad_y, lad_top_z), 0.020, "C9A538", sides=8, tile="enamel_gloss")
        # Standoff mounting brackets to catwalk & tank side
        for bz in (plat_z, 3.15, 3.95):
            props.rail((cx + sx, lad_y + 0.015, bz), (cx + sx, lad_y + 0.28, bz), 0.014, "68727B", sides=6, tile="iron_dark")
    # 14 horizontal anti-slip rungs every 0.28 m
    for ri in range(14):
        rz = deck_z + 0.28 + ri * 0.28
        if rz <= lad_top_z - 0.12:
            props.rail((cx - lad_w * 0.5, lad_y, rz), (cx + lad_w * 0.5, lad_y, rz), 0.012, "D6B242", sides=6, tile="enamel_gloss")
    # 5 continuous semicircular steel safety cage hoops from Z = 2.30 to 4.10 m (single continuous tube each!)
    hoop_r = 0.36
    hoop_cy = lad_y - 0.26
    hoop_zs = (2.30, 2.75, 3.20, 3.65, 4.10)
    hoop_segs = 10
    for hz in hoop_zs:
        hoop_pts: List[Vec3] = [(cx - lad_w * 0.5, lad_y, hz)]
        for si in range(hoop_segs + 1):
            ang = math.pi + math.pi * (si / float(hoop_segs))
            hoop_pts.append((cx + hoop_r * math.cos(ang), hoop_cy + hoop_r * math.sin(ang), hz))
        hoop_pts.append((cx + lad_w * 0.5, lad_y, hz))
        add_pipe_frame(props, hoop_pts, radius=0.011, sides=6, bend_radius=0.04, color="C9A538", tile="enamel_gloss", flange_ends=False)
    # 3 vertical safety cage tie straps linking all 5 hoops (offset 12 mm radially outward)
    for ang_deg in (215.0, 270.0, 325.0):
        ang = math.radians(ang_deg)
        sx = cx + (hoop_r + 0.014) * math.cos(ang)
        sy = hoop_cy + (hoop_r + 0.014) * math.sin(ang)
        props.rail((sx, sy, hoop_zs[0]), (sx, sy, hoop_zs[-1]), 0.009, "B5922E", sides=6, tile="enamel_gloss")


def build_kr_school_rooftop_hero() -> Tuple[HeroSceneGroups, List[PreviewCameraView], Dict[str, Any]]:
    """Construct the complete 14.0 x 11.0 x 4.5 m Korean School Rooftop Hero scene."""
    groups = HeroSceneGroups()
    w, d = 14.0, 11.0
    deck_z = 0.20

    # --- 1. BG_Floor: Concrete roof deck slab + green urethane waterproof membrane + gutters & drains ---
    # Structural concrete roof slab (Z = 0.00..0.176)
    add_beveled_box(groups.floor, (0.0, 0.0, 0.088), (w, d, 0.176), color="ABA8A0", tile="concrete", bevel=0.006)
    # Recessed perimeter rainwater drainage channel framing the waterproof urethane field
    # Segmented urethane waterproof deck tiles (4 x 3 grid with crisp 10 mm expansion joint seams)
    field_w, field_d = w - 0.92, d - 0.92
    nx_p, ny_p = 4, 3
    pw = field_w / nx_p
    pd = field_d / ny_p
    urethane_palette = ("4F8C6A", "4B8765", "53906E", "4D8967")
    for ix in range(nx_p):
        for iy in range(ny_p):
            px = -field_w * 0.5 + (ix + 0.5) * pw
            py = -field_d * 0.5 + (iy + 0.5) * pd
            col = urethane_palette[(ix + iy * 2) % len(urethane_palette)]
            add_beveled_box(groups.floor, (px, py, 0.188), (pw - 0.014, pd - 0.014, 0.024), color=col, tile="concrete", bevel=0.004)

    # Safety yellow walkway border stripe framing the water-tank & AC mechanical zone
    add_beveled_box(groups.floor, (4.35, 0.35, 0.203), (0.09, 8.80, 0.006), color="D8B23E", tile="trim_paint", bevel=0.0015)
    add_beveled_box(groups.floor, (1.65, 3.05, 0.203), (0.09, 3.40, 0.006), color="D8B23E", tile="trim_paint", bevel=0.0015)
    add_beveled_box(groups.floor, (3.00, 1.38, 0.203), (2.72, 0.09, 0.006), color="D8B23E", tile="trim_paint", bevel=0.0015)

    # 4 corner cast-iron rainwater drainage grates recessed cleanly along perimeter gutter
    for gx, gy in ((-6.52, -5.02), (6.52, -5.02), (6.52, 5.02), (-6.52, 5.02)):
        add_beveled_box(groups.floor, (gx, gy, 0.182), (0.28, 0.28, 0.018), color="4A5056", tile="sash_metal", bevel=0.003)
        for bi in range(4):
            add_beveled_box(groups.floor, (gx - 0.09 + bi * 0.06, gy, 0.193), (0.018, 0.22, 0.008), color="69727A", tile="sash_metal", bevel=0.002)

    # --- 2. 4-Side Perimeter Parapets + Chain-Link Fences (Exact 14.0 x 11.0 m outer coping bounds) ---
    # Parapet wall thick=0.26, coping overhang=0.032 -> inset wall center by 0.162 from outer edge
    _add_rooftop_parapet_and_fence(groups.wall_north, (0.0, d * 0.5 - 0.162, 0.0), w - 0.08, rot_z=0.0, deck_z=deck_z)
    _add_rooftop_parapet_and_fence(groups.wall_south, (0.0, -d * 0.5 + 0.162, 0.0), w - 0.08, rot_z=math.pi, deck_z=deck_z)
    _add_rooftop_parapet_and_fence(groups.wall_east, (w * 0.5 - 0.162, 0.0, 0.0), d - 0.64, rot_z=-math.pi * 0.5, deck_z=deck_z)
    _add_rooftop_parapet_and_fence(groups.wall_west, (-w * 0.5 + 0.162, 0.0, 0.0), d - 0.64, rot_z=math.pi * 0.5, deck_z=deck_z)

    # --- 3. Northwest Stairhouse (BG_Wall_North + BG_Ceiling + BG_Props_Clutter) ---
    _add_rooftop_stairhouse(groups.wall_north, groups.ceiling, groups.props_clutter, deck_z=deck_z)

    # --- 4. Northeast Water Tank + Steel Truss + 5-Hoop Safety Ladder (BG_Props_Clutter) ---
    _add_water_tank_tower(groups.props_clutter, groups.wall_east, center_xy=(4.15, 3.15), deck_z=deck_z)

    # --- 5. East 2-Tier AC Outdoor Condenser Bank (4 units + steel rack + refrigerant cable tray) ---
    rack_x, rack_y = 6.02, -1.25
    rack_len = 2.65
    rack_d = 0.54
    # Steel 2-tier mounting rack grounded on deck_z
    for sy in (-rack_len * 0.48, 0.0, rack_len * 0.48):
        for sx in (-rack_d * 0.44, rack_d * 0.44):
            add_beveled_box(groups.props_clutter, (rack_x + sx, rack_y + sy, deck_z + 0.012), (0.10, 0.10, 0.024), color="3D444C", tile="iron_dark", bevel=0.003)
            add_beveled_box(groups.props_clutter, (rack_x + sx, rack_y + sy, deck_z + 0.88), (0.052, 0.052, 1.72), color="69747E", tile="galvanized_zinc", bevel=0.004)
        for tz in (deck_z + 0.16, deck_z + 1.04):
            add_beveled_box(groups.props_clutter, (rack_x, rack_y + sy, tz), (rack_d, 0.056, 0.056), color="5D6872", tile="galvanized_zinc", bevel=0.003)
    for tz in (deck_z + 0.16, deck_z + 1.04):
        for sx in (-rack_d * 0.44, rack_d * 0.44):
            add_beveled_box(groups.props_clutter, (rack_x + sx, rack_y, tz + 0.044), (0.048, rack_len, 0.048), color="727D87", tile="galvanized_zinc", bevel=0.003)
    # 4 detailed HVAC units (2 bottom tier + 2 top tier, facing West -X -> rot_z = -pi/2)
    for tz in (deck_z + 0.23, deck_z + 1.11):
        for sy in (-0.64, 0.64):
            _add_ac_outdoor_unit(groups.props_clutter, (rack_x, rack_y + sy, tz), rot_z=-math.pi * 0.5)
    # Overhead insulated refrigerant bundle descending cleanly into a bolted deck sleeve flange (zero floating!)
    add_pipe_frame(
        groups.props_clutter,
        [
            (rack_x + 0.18, rack_y - 0.85, deck_z + 1.55),
            (rack_x + 0.18, rack_y + 1.75, deck_z + 1.55),
            (rack_x + 0.36, rack_y + 1.75, deck_z + 0.02),
        ],
        radius=0.036,
        sides=8,
        color="D4CEBE",
        tile="plastic_matte",
    )
    add_beveled_box(groups.props_clutter, (rack_x + 0.36, rack_y + 1.75, deck_z + 0.025), (0.18, 0.18, 0.050), color="58626B", tile="iron_dark", bevel=0.004)

    # --- 6. Rooftop Wooden Benches (×2), Vending Machine, Planters, Recycling Bins & Fire Hydrant ---
    # Bench 1: South-West facing North-East courtyard
    _add_rooftop_bench(groups.furniture_hero, groups.props_clutter, (-3.90, -3.55, deck_z), rot_z=math.pi)
    # Bench 2: South-Center facing North courtyard
    _add_rooftop_bench(groups.furniture_hero, groups.props_clutter, (0.95, -3.70, deck_z), rot_z=math.pi)

    # Detailed Korean Beverage Vending Machine beside stairhouse East-South wall facing South (-Y)
    _add_vending_machine(groups.furniture_hero, groups.props_clutter, groups.ceiling, (-1.62, 3.65, deck_z), rot_z=0.0)

    # Recycling station next to vending machine
    _add_recycling_station(groups.props_clutter, (-0.25, 3.85, deck_z), rot_z=0.0, bins=3)

    # Red Rooftop Fire Standpipe / Hydrant Valve Riser near West side of stairhouse
    hx, hy = -5.75, 1.35
    add_pipe_frame(groups.props_clutter, [(hx, hy, deck_z), (hx, hy, deck_z + 0.92)], radius=0.048, sides=10, color="C23630", tile="enamel_gloss")
    _add_tapered_cylinder(groups.props_clutter, (hx, hy, deck_z + 0.90), 0.08, 0.068, 0.056, sides=10, color="C23630", tile="enamel_gloss")
    for ang in (-0.5, 0.5):
        groups.props_clutter.rail((hx, hy, deck_z + 0.68), (hx + 0.14 * math.sin(ang), hy - 0.14 * math.cos(ang), deck_z + 0.62), 0.030, "C9A44C", sides=8, tile="brass_polished")

    # 2 Wooden Planter Boxes with curved 3D foliage shrubs (monstera & palm, zero flat cards!)
    for idx_p, (px, py, sp) in enumerate(((-5.85, -3.55, "palm"), (-1.85, 1.35, "monstera"))):
        add_beveled_box(groups.furniture_hero, (px, py, deck_z + 0.22), (0.64, 0.64, 0.44), color="8D6746", tile="wood_walnut", bevel=0.006)
        add_beveled_box(groups.furniture_hero, (px, py, deck_z + 0.44), (0.70, 0.70, 0.048), color="A67C56", tile="wood_oak", bevel=0.005)
        add_curved_foliage_plant(
            groups.furniture_hero,
            (px, py, deck_z + 0.22),
            species=sp,
            height=1.08,
            pot_radius=0.22,
            pot_height=0.24,
            leaf_count=11,
            seed=71 + idx_p * 19,
            pot_color="B56F4D",
            pot_tile="ceramic_matte",
            soil_color="4B3C30",
            soil_tile="leather",
            leaf_color="3E7A4E",
            leaf_tile="foliage",
        )

    # Rooftop lived-in storytelling props: beverage cans & school backpack resting on SW bench
    _add_tapered_cylinder(groups.props_clutter, (-3.45, -3.52, deck_z + 0.474), 0.125, 0.032, 0.030, sides=10, color="D64438", tile="enamel_gloss", chamfer=0.002)
    _add_tapered_cylinder(groups.props_clutter, (-3.33, -3.58, deck_z + 0.474), 0.125, 0.032, 0.030, sides=10, color="3474B4", tile="enamel_gloss", chamfer=0.002)
    add_beveled_box(groups.furniture_hero, (-4.32, -3.52, deck_z + 0.66), (0.30, 0.18, 0.36), color="2D3E54", tile="fabric_canvas", bevel=0.022, rot_z=0.14)
    add_beveled_box(groups.furniture_hero, (-4.30, -3.41, deck_z + 0.58), (0.24, 0.06, 0.16), color="233246", tile="fabric_canvas", bevel=0.012, rot_z=0.14)

    # Corner Security Floodlight clamped directly onto the East fence corner post (zero floating!)
    post_x, post_y, fl_z = w * 0.5 - 0.162, -4.92, 3.16
    groups.props_clutter.rail((post_x, post_y, fl_z), (post_x - 0.18, post_y + 0.12, fl_z), 0.016, "4C545C", sides=6, tile="iron_dark")
    add_beveled_box(groups.props_clutter, (post_x - 0.22, post_y + 0.14, fl_z), (0.20, 0.15, 0.14), color="3C434B", tile="iron_dark", bevel=0.004, rot_z=0.55)
    add_beveled_box(groups.ceiling, (post_x - 0.28, post_y + 0.19, fl_z - 0.02), (0.16, 0.018, 0.10), color="FFF2D2", tile="emissive_warm", bevel=0.002, rot_z=0.55)

    # --- Tailored 6-View Review Cameras ---
    views = [
        PreviewCameraView(
            key="front",
            label="1 FRONT CUTAWAY",
            location=(0.2, -11.4, 3.8),
            target=(0.0, 0.6, 1.8),
            lens_mm=30.0,
            hide_nodes=("BG_Wall_South",),
        ),
        PreviewCameraView(
            key="side",
            label="2 SIDE CUTAWAY",
            location=(12.2, -0.8, 3.6),
            target=(-0.8, 0.6, 1.9),
            lens_mm=30.0,
            hide_nodes=("BG_Wall_East",),
        ),
        PreviewCameraView(
            key="back",
            label="3 BACK VIEW",
            location=(-0.5, 11.4, 5.2),
            target=(0.0, -0.4, 1.5),
            lens_mm=28.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(9.6, -9.4, 5.8),
            target=(-0.4, 0.6, 1.7),
            lens_mm=32.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 ROOFTOP 32MM",
            location=(3.4, -3.5, 1.55),
            target=(-2.6, 2.2, 1.72),
            lens_mm=32.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP OVERVIEW",
            location=(1.6, -9.8, 12.6),
            target=(0.0, 0.1, 1.2),
            lens_mm=30.0,
            hide_nodes=(),
        ),
    ]

    cameras_meta = {
        "wide24mm": {"position": [9.6, 5.8, 9.4], "target": [-0.4, 1.7, -0.6], "lensMm": 24},
        "dialogue35mm": {"position": [3.4, 1.55, 3.5], "target": [-2.6, 1.72, -2.2], "lensMm": 35},
        "fencePortrait85mm": {"position": [-1.8, 1.52, 2.2], "target": [-5.2, 1.65, 3.8], "lensMm": 85},
    }
    return groups, views, cameras_meta


# ---------------------------------------------------------------------------
# SCENE 2: kr_seoul_alley_street_hero (8.0 x 16.0 x 7.5 m)
# ---------------------------------------------------------------------------


def _add_corrugated_shutter(
    wall: MeshGroup,
    props: MeshGroup,
    origin: Vec3,
    rot_z: float,
    *,
    width: float = 2.60,
    height: float = 2.35,
    open_ratio: float = 0.28,
) -> None:
    """Korean commercial rolled steel shutter with hood box, side guide rails & ribbed slats."""
    # Top rolled-shutter hood housing box
    _lbox(props, origin, rot_z, 0.0, -0.10, height + 0.13, width + 0.14, 0.24, 0.26, "8A929A", tile="galvanized_zinc", bevel=0.005)
    # Left & right C-channel vertical guide tracks
    for sx in (-width * 0.5 - 0.025, width * 0.5 + 0.025):
        _lbox(props, origin, rot_z, sx, -0.025, height * 0.5, 0.056, 0.068, height, "6E767E", tile="iron_dark", bevel=0.003)

    # Dark interior shop backing behind shutter opening
    _lbox(wall, origin, rot_z, 0.0, 0.08, height * 0.5, width - 0.04, 0.08, height - 0.04, "2D3138", tile="concrete", bevel=0.003)

    # Horizontal corrugated interlocking slats down to open_ratio * height
    z_bot = height * open_ratio
    slat_pitch = 0.095
    n_slats = max(4, int((height - z_bot) / slat_pitch))
    actual_pitch = (height - z_bot) / n_slats
    for i in range(n_slats):
        sz = z_bot + (i + 0.5) * actual_pitch
        col = "B4BCC4" if i % 2 == 0 else "A8B0B8"
        _lbox(props, origin, rot_z, 0.0, -0.024, sz, width - 0.02, 0.024, actual_pitch - 0.012, col, tile="galvanized_zinc", bevel=0.003)
    # Heavy bottom lock rail bar + center chrome lock cylinder & pull handles
    _lbox(props, origin, rot_z, 0.0, -0.030, z_bot - 0.02, width - 0.01, 0.042, 0.048, "636B74", tile="iron_dark", bevel=0.004)
    for hx in (-0.42, 0.42):
        _lbox(props, origin, rot_z, hx, -0.056, z_bot + 0.04, 0.14, 0.024, 0.022, "3C424A", tile="iron_dark", bevel=0.003)


def _add_striped_awning(
    furniture: MeshGroup,
    props: MeshGroup,
    origin: Vec3,
    rot_z: float,
    *,
    width: float = 3.20,
    projection: float = 0.92,
    drop: float = 0.42,
    color_a: str = "2E5847",
    color_b: str = "F0E9DC",
) -> None:
    """Sloped storefront striped canvas awning with scalloped valance & steel arms.

    ``origin`` is the wall-mount top-center ``(x, y, z)``; projects toward local ``-Y``.
    """
    # Wall mounting steel roller bar
    _lrail(props, origin, rot_z, (-width * 0.5, -0.03, 0.0), (width * 0.5, -0.03, 0.0), 0.028, "4B525A", tile="iron_dark", sides=8)
    # Diagonal steel support arms at both ends
    for sx in (-width * 0.46, width * 0.46):
        _lrail(props, origin, rot_z, (sx, -0.02, -drop - 0.18), (sx, -projection + 0.06, -drop + 0.02), 0.016, "464D55", tile="iron_dark", sides=6)
        _lbox(props, origin, rot_z, sx, -0.018, -drop - 0.18, 0.065, 0.028, 0.12, "3E444C", tile="iron_dark", bevel=0.003)

    # Alternating striped sloped canvas ribs (watertight closed prisms along slope)
    n_stripes = max(6, int(round(width / 0.28)))
    sw = width / n_stripes
    thick = 0.028
    for i in range(n_stripes):
        x0 = -width * 0.5 + i * sw + 0.003
        x1 = x0 + sw - 0.006
        col = color_a if i % 2 == 0 else color_b
        # Sloped canopy rib from (y=0, z=0) to (y=-projection, z=-drop)
        prof_l = [
            _rot_local(x0, -0.02, 0.02, origin, rot_z),
            _rot_local(x0, -projection, -drop + 0.02, origin, rot_z),
            _rot_local(x0, -projection, -drop - thick, origin, rot_z),
            _rot_local(x0, -0.02, -thick, origin, rot_z),
        ]
        prof_r = [
            _rot_local(x1, -0.02, 0.02, origin, rot_z),
            _rot_local(x1, -projection, -drop + 0.02, origin, rot_z),
            _rot_local(x1, -projection, -drop - thick, origin, rot_z),
            _rot_local(x1, -0.02, -thick, origin, rot_z),
        ]
        furniture.rings([prof_l, prof_r], color=col, tile="fabric_canvas")
        # Hanging front valance flap
        _lbox(furniture, origin, rot_z, 0.5 * (x0 + x1), -projection + 0.014, -drop - 0.11, sw - 0.008, 0.022, 0.19, col, tile="fabric_canvas", bevel=0.003)


def _add_projecting_sign(
    props: MeshGroup,
    ceiling_emissive: MeshGroup,
    origin: Vec3,
    rot_z: float,
    *,
    width: float = 0.64,
    height: float = 1.48,
    thickness: float = 0.16,
    frame_color: str = "3B4148",
    emissive_tile: str = "emissive_amber",
    glow_color: str = "FFD280",
) -> None:
    """Korean projecting alley signboard projecting toward local ``-Y`` from building facade."""
    proj_y = -(width * 0.5 + 0.14)
    # Twin bolted steel wall mounting brackets
    for bz in (-height * 0.34, height * 0.34):
        _lbox(props, origin, rot_z, 0.0, -0.016, bz, 0.14, 0.028, 0.14, "4A515A", tile="iron_dark", bevel=0.003)
        _lrail(props, origin, rot_z, (0.0, -0.02, bz), (0.0, proj_y + width * 0.45, bz), 0.018, "565E68", tile="iron_dark", sides=6)

    # Outer beveled aluminum sign cabinet frame (top, bottom, back, front rims)
    rim = 0.042
    _lbox(props, origin, rot_z, 0.0, proj_y, height * 0.5 - rim * 0.5, thickness, width, rim, frame_color, tile="aluminum_satin", bevel=0.004)
    _lbox(props, origin, rot_z, 0.0, proj_y, -height * 0.5 + rim * 0.5, thickness, width, rim, frame_color, tile="aluminum_satin", bevel=0.004)
    _lbox(props, origin, rot_z, 0.0, proj_y + width * 0.5 - rim * 0.5, 0.0, thickness, rim, height - rim * 1.9, frame_color, tile="aluminum_satin", bevel=0.004)
    _lbox(props, origin, rot_z, 0.0, proj_y - width * 0.5 + rim * 0.5, 0.0, thickness, rim, height - rim * 1.9, frame_color, tile="aluminum_satin", bevel=0.004)

    # Crisp Korean vertical signboard faces on both sides (+X and -X facing down/up the alley!)
    _lbox(
        ceiling_emissive,
        origin,
        rot_z,
        0.0,
        proj_y,
        0.0,
        thickness - 0.022,
        width - rim * 2.04,
        height - rim * 2.04,
        glow_color,
        tile=emissive_tile,
        bevel=0.003,
        uv_fit=True,
    )


def _add_streetlamp(
    props: MeshGroup,
    ceiling_emissive: MeshGroup,
    origin: Vec3,
    rot_z: float,
    *,
    reach: float = 1.15,
) -> None:
    """Wall/pole-mounted Korean alley goose-neck cobra-head streetlamp projecting along ``-Y``."""
    _lbox(props, origin, rot_z, 0.0, -0.018, 0.0, 0.14, 0.032, 0.22, "4B525A", tile="iron_dark", bevel=0.003)
    arm_pts = [
        _rot_local(0.0, -0.02, 0.0, origin, rot_z),
        _rot_local(0.0, -reach * 0.45, 0.22, origin, rot_z),
        _rot_local(0.0, -reach * 0.88, 0.34, origin, rot_z),
        _rot_local(0.0, -reach, 0.32, origin, rot_z),
    ]
    add_pipe_frame(props, arm_pts, radius=0.024, sides=8, bend_radius=0.14, color="6A737C", tile="galvanized_zinc", flange_ends=False)
    # Ribbed cobra lamp housing & warm glowing lens
    _lbox(props, origin, rot_z, 0.0, -reach - 0.14, 0.33, 0.24, 0.42, 0.095, "7A838C", tile="aluminum_satin", bevel=0.008)
    _lbox(ceiling_emissive, origin, rot_z, 0.0, -reach - 0.15, 0.275, 0.18, 0.30, 0.036, "FFE8B6", tile="emissive_warm", bevel=0.006)


def _add_utility_pole(
    props: MeshGroup,
    center_xy: Tuple[float, float],
    *,
    height: float = 7.35,
    rot_z: float = 0.0,
    with_transformer: bool = True,
) -> Dict[str, List[Vec3]]:
    """Korean concrete utility pole (전신주) with step bolts, crossarms, insulators & transformer."""
    cx, cy = center_xy
    # Tapered concrete shaft grounded at Z = 0.000
    _add_tapered_cylinder(props, (cx, cy, 0.0), height, 0.155, 0.102, sides=12, color="B7B5AE", tile="stone_prop", chamfer=0.005)
    # Yellow/black reflective lower warning wrap band (Z = 0.90..1.75 m, classic Korean utility pole!)
    for bi in range(4):
        bz = 0.92 + bi * 0.20
        col = "DFB432" if bi % 2 == 0 else "282B30"
        _add_tapered_cylinder(props, (cx, cy, bz), 0.185, 0.154 - bi * 0.002, 0.152 - bi * 0.002, sides=12, color=col, tile="enamel_gloss", chamfer=0.002)

    # Alternating steel climbing step bolts (Z = 2.40..6.30 m)
    for idx in range(11):
        sz = 2.45 + idx * 0.36
        side = 1.0 if idx % 2 == 0 else -1.0
        _lrail(props, (cx, cy, 0.0), rot_z, (side * 0.11, 0.0, sz), (side * 0.25, 0.0, sz), 0.009, "6B737C", tile="galvanized_zinc", sides=6)

    # Telecom fiber splice box + mounting collar bands at Z = 4.25 m
    _lbox(props, (cx, cy, 0.0), rot_z, 0.0, 0.17, 4.25, 0.22, 0.16, 0.42, "3C4148", tile="plastic_matte", bevel=0.005)
    for cz in (4.10, 4.40, 5.25, 5.75):
        _add_tapered_cylinder(props, (cx, cy, cz), 0.036, 0.132, 0.132, sides=12, color="6A737B", tile="steel_brushed", chamfer=0.002)

    # Cylindrical pole-mounted step-down transformer (주상변압기) at Z = 5.15..5.92 m
    if with_transformer:
        tx_loc = _rot_local(0.0, -0.38, 5.16, (cx, cy, 0.0), rot_z)
        _add_tapered_cylinder(props, tx_loc, 0.72, 0.23, 0.23, sides=14, color="879199", tile="enamel_gloss", chamfer=0.005)
        # Top bolted lid + 3 porcelain high-voltage insulator bushings
        _add_tapered_cylinder(props, (tx_loc[0], tx_loc[1], tx_loc[2] + 0.71), 0.04, 0.245, 0.245, sides=14, color="6E7880", tile="iron_dark", chamfer=0.004)
        for bx in (-0.10, 0.0, 0.10):
            b_pt = _rot_local(bx, -0.38, 5.90, (cx, cy, 0.0), rot_z)
            _add_tapered_cylinder(props, b_pt, 0.18, 0.026, 0.018, sides=8, color="8C5A46", tile="ceramic_gloss", chamfer=0.002)
        # Side cooling radiator fins
        for side in (-1, 1):
            for fy in (-0.44, -0.38, -0.32):
                _lbox(props, (cx, cy, 0.0), rot_z, side * 0.245, fy, 5.52, 0.055, 0.018, 0.50, "768088", tile="iron_dark", bevel=0.002)
        # Mounting yoke bars connecting transformer to pole
        for bz in (5.28, 5.76):
            _lbox(props, (cx, cy, 0.0), rot_z, 0.0, -0.17, bz, 0.12, 0.24, 0.042, "5A636B", tile="iron_dark", bevel=0.003)

    # Twin galvanized steel crossarms (완금) at Z = 6.48 m and Z = 7.06 m with V-braces & insulators
    anchors: Dict[str, List[Vec3]] = {"lower": [], "upper": []}
    for key, az, span in (("lower", 6.48, 1.48), ("upper", 7.06, 1.62)):
        _lbox(props, (cx, cy, 0.0), rot_z, 0.0, -0.11, az, span, 0.085, 0.095, "7A848E", tile="galvanized_zinc", bevel=0.004)
        for sx in (-1, 1):
            _lrail(props, (cx, cy, 0.0), rot_z, (sx * 0.028, -0.09, az - 0.44), (sx * span * 0.36, -0.11, az - 0.03), 0.012, "6E7780", tile="galvanized_zinc", sides=6)
        for frac in (-0.42, -0.16, 0.16, 0.42):
            ix = frac * span
            ins_pt = _rot_local(ix, -0.11, az + 0.046, (cx, cy, 0.0), rot_z)
            _add_tapered_cylinder(props, ins_pt, 0.11, 0.032, 0.024, sides=8, color="8D5842", tile="ceramic_gloss", chamfer=0.002)
            anchors[key].append((ins_pt[0], ins_pt[1], ins_pt[2] + 0.10))
    return anchors


def _add_gas_pipe_and_meter(
    props: MeshGroup,
    wall_face_x: float,
    y_pos: float,
    *,
    facing_sign: float,  # +1 if on West wall facing +X; -1 if on East wall facing -X
    z_floor: float = 0.14,
    z_top: float = 5.80,
) -> None:
    """Authentic Korean yellow exterior city-gas riser pipe + steel meter box."""
    px = wall_face_x + facing_sign * 0.055
    # Vertical main yellow gas riser
    add_pipe_frame(
        props,
        [(px, y_pos, z_floor), (px, y_pos, z_top), (wall_face_x - facing_sign * 0.02, y_pos, z_top)],
        radius=0.022,
        sides=8,
        color="D9A62A",
        tile="enamel_gloss",
        flange_ends=False,
    )
    # Horizontal branch entering 2F
    add_pipe_frame(
        props,
        [(px, y_pos, 3.35), (px, y_pos + 0.55, 3.35), (wall_face_x - facing_sign * 0.02, y_pos + 0.55, 3.35)],
        radius=0.016,
        sides=6,
        color="D9A62A",
        tile="enamel_gloss",
        flange_ends=False,
    )
    # Wall saddle clamps every 1.4 m
    for cz in (1.1, 2.5, 3.9, 5.2):
        add_beveled_box(props, (wall_face_x + facing_sign * 0.036, y_pos, cz), (0.064, 0.068, 0.032), color="6C747C", tile="galvanized_zinc", bevel=0.002)
    # Steel gas meter cabinet at Z = 1.45 m
    mx = wall_face_x + facing_sign * 0.105
    add_beveled_box(props, (mx, y_pos + 0.24, 1.48), (0.19, 0.34, 0.44), color="C9CDD2", tile="enamel_gloss", bevel=0.005)
    add_beveled_box(props, (mx + facing_sign * 0.095, y_pos + 0.24, 1.54), (0.014, 0.16, 0.10), color="3C424A", tile="glass_prop", bevel=0.002)


def _add_exterior_steel_stairs(
    props: MeshGroup,
    wall_west: MeshGroup,
    *,
    wall_x: float = -2.60,
    y_start: float = 2.95,
    z_base: float = 0.14,
    z_landing: float = 2.94,
) -> None:
    """Signature Korean 2F external steel alley staircase with cantilevered landing & handrails."""
    stair_w = 0.88
    stair_cx = wall_x + stair_w * 0.5 + 0.04
    steps = 14
    riser_h = (z_landing - z_base) / steps
    tread_d = 0.23
    run = steps * tread_d

    # Twin sloped structural steel channel stringers + anti-slip perforated steel treads
    add_staircase(
        props,
        origin=(stair_cx, y_start, z_base),
        width=stair_w,
        steps=steps,
        riser_height=riser_h,
        tread_depth=tread_d,
        nosing_overhang=0.020,
        rot_z=0.0,
        solid_under=False,
        add_stringers=True,
        tread_color="5C656E",
        tread_tile="steel_brushed",
        riser_color="474F57",
        riser_tile="iron_dark",
        stringer_color="414A52",
        stringer_tile="iron_dark",
    )

    # 2F Cantilevered Steel Landing Platform (Y = y_start + run .. y_start + run + 1.42)
    land_len = 1.38
    land_cy = y_start + run + land_len * 0.5
    add_beveled_box(props, (stair_cx, land_cy, z_landing - 0.04), (stair_w + 0.12, land_len, 0.085), color="4D565E", tile="steel_brushed", bevel=0.004)
    # Diagonal steel knee-brace support brackets anchoring landing back into West facade
    for by in (y_start + run + 0.16, y_start + run + land_len - 0.16):
        props.timber((wall_x + 0.02, by, z_landing - 0.86), (wall_x + stair_w + 0.02, by, z_landing - 0.08), 0.065, 0.075, color="3F4850", tile="iron_dark", bevel=0.003)
        # Vertical support steel post on outer front corner of landing down to sidewalk
        if by > y_start + run + 0.5:
            add_beveled_box(props, (wall_x + stair_w + 0.05, by, (z_base + z_landing) * 0.5), (0.078, 0.078, z_landing - z_base), color="444E56", tile="iron_dark", bevel=0.004)

    # Tubular steel handrail ascending stairs + wrapping landing (inset 95 mm at corners so newels never duplicate)
    outer_x = stair_cx + stair_w * 0.5 + 0.02
    add_balustrade(
        props,
        (outer_x, y_start + 0.08, z_base + riser_h),
        (outer_x, y_start + run - 0.095, z_landing - riser_h * 0.35),
        height=0.94,
        baluster_spacing=0.22,
        style="steel",
        color="505A64",
        tile="iron_dark",
        rail_color="384048",
        rail_tile="iron_dark",
    )
    add_balustrade(
        props,
        (outer_x, y_start + run, z_landing),
        (outer_x, y_start + run + land_len - 0.04, z_landing),
        height=0.96,
        baluster_spacing=0.20,
        style="steel",
        color="505A64",
        tile="iron_dark",
        rail_color="384048",
        rail_tile="iron_dark",
    )
    add_balustrade(
        props,
        (outer_x - 0.095, y_start + run + land_len - 0.04, z_landing),
        (wall_x + 0.06, y_start + run + land_len - 0.04, z_landing),
        height=0.96,
        baluster_spacing=0.20,
        style="steel",
        color="505A64",
        tile="iron_dark",
        rail_color="384048",
        rail_tile="iron_dark",
    )

    # 2F Painted Steel Apartment Entry Door opening onto the landing
    add_door_frame(
        wall_west,
        center=(wall_x - 0.12, land_cy + 0.05, z_landing),
        width=0.92,
        height=2.04,
        wall_thickness=0.22,
        rot_z=math.pi * 0.5,
        frame_color="4D565E",
        frame_tile="sash_metal",
        leaf_color="48635E",
        leaf_tile="sash_metal",
        handle_color="C8CDD2",
        handle_tile="hardware_brass",
    )


def _add_building_block_facade(
    wall: MeshGroup,
    ceiling_emissive: MeshGroup,
    *,
    x_front: float,
    x_back: float,
    y0: float,
    y1: float,
    z0: float,
    height: float,
    facing_sign: float,  # +1 for West row (faces +X), -1 for East row (faces -X)
    wall_color: str,
    wall_tile: str,
    trim_color: str,
    window_specs: Sequence[Tuple[float, float, float, float, bool]],  # (y_off, w, h, sill_z, warm_lit)
    floor_bands: Sequence[float] = (),
    parapet_h: float = 0.34,
    pitched_eave_z: Optional[float] = None,
) -> None:
    """Build one watertight multi-story Korean urban facade bay with real window openings & trims."""
    cy = 0.5 * (y0 + y1)
    length = (y1 - y0) - 0.012
    front_t = 0.24
    rot_z = math.pi * 0.5 if facing_sign > 0 else -math.pi * 0.5
    front_center_x = x_front - facing_sign * (front_t * 0.5)

    # Convert (y_off, w, h, sill_z, warm_lit) to WallOpening offsets along local X
    # For rot_z = +pi/2: local +X maps to +Y. For rot_z = -pi/2: local +X maps to -Y.
    openings: List[WallOpening] = []
    for y_off, ww, wh, sill_z, _lit in window_specs:
        lx = y_off if facing_sign > 0 else -y_off
        openings.append(WallOpening(offset_x=lx, width=ww, height=wh, sill_z=sill_z, kind="window"))

    # Front architectural facade wall with true lattice-cut window openings
    add_wall_with_openings(
        wall,
        center=(front_center_x, cy, z0),
        length=length,
        thickness=front_t,
        height=height,
        openings=openings,
        rot_z=rot_z,
        color=wall_color,
        tile=wall_tile,
        baseboard_height=0.0,
        crown_height=0.0,
    )

    # Rear structural volume behind front facade wall (depth = abs(x_front - x_back) - front_t)
    rear_depth = max(0.35, abs(x_front - x_back) - front_t - 0.012)
    rear_cx = (x_front - facing_sign * (front_t + 0.008 + rear_depth * 0.5))
    add_beveled_box(
        wall,
        (rear_cx, cy, z0 + height * 0.5),
        (rear_depth, length - 0.016, height - 0.010),
        color="5A5854",
        tile="concrete",
        bevel=0.005,
    )

    # Horizontal concrete floor-line stringcourse ledges (20-35 mm real 3D step!)
    for bz in floor_bands:
        add_beveled_box(
            wall,
            (x_front + facing_sign * 0.024, cy, z0 + bz),
            (0.056, length + 0.02, 0.14),
            color=trim_color,
            tile="stone_plinth",
            bevel=0.005,
        )

    # Rooftop stepped parapet cornice & overhanging stone coping (back face flush within x_back)
    roof_z = z0 + height
    block_depth = abs(x_front - x_back)
    add_beveled_box(
        wall,
        (x_front + facing_sign * 0.032, cy, roof_z - 0.04),
        (0.08, length + 0.04, 0.12),
        color=trim_color,
        tile="stone_plinth",
        bevel=0.005,
    )
    add_beveled_box(
        wall,
        (0.5 * (x_front + x_back), cy, roof_z + parapet_h * 0.5),
        (block_depth - 0.02, length - 0.008, parapet_h),
        color=wall_color,
        tile=wall_tile,
        bevel=0.006,
    )
    add_beveled_box(
        wall,
        (0.5 * (x_front + x_back) + facing_sign * 0.015, cy, roof_z + parapet_h + 0.035),
        (block_depth + 0.02, length + 0.02, 0.068),
        color=trim_color,
        tile="stone_plinth",
        bevel=0.006,
    )

    # Optional pitched Korean tiled eave canopy (처마 지붕) breaking the mid-story roofline
    if pitched_eave_z is not None:
        e_z = z0 + pitched_eave_z
        prof_0 = [
            (x_front - facing_sign * 0.02, y0 + 0.04, e_z + 0.34),
            (x_front + facing_sign * 0.42, y0 + 0.04, e_z + 0.04),
            (x_front + facing_sign * 0.42, y0 + 0.04, e_z - 0.03),
            (x_front - facing_sign * 0.02, y0 + 0.04, e_z + 0.24),
        ]
        prof_1 = [(p[0], y1 - 0.04, p[2]) for p in prof_0]
        wall.rings([prof_0, prof_1], color="5A616A", tile="stone_plinth")

    # Install 3D sliding window sashes + glazing into the wall's OWN group (zero floating glass on wall cutaway!)
    for y_off, ww, wh, sill_z, warm_lit in window_specs:
        add_window_sash(
            wall,
            center=(front_center_x, cy + y_off, z0 + sill_z),
            width=ww,
            height=wh,
            wall_thickness=front_t,
            rot_z=rot_z,
            panes_x=2,
            panes_z=1,
            sliding=True,
            frame_color="5A626A",
            frame_tile="sash_metal",
            sill_color=trim_color,
            sill_tile="stone_plinth",
            include_glass=True,
            glass_group=wall,
            glass_color="F5DEAE" if warm_lit else "B8D4E2",
            glass_tile="glass_tinted",
        )
        # Exterior aluminum rain hood awning over upper windows (sill_z > 2.0)
        if sill_z > 2.0:
            add_beveled_box(
                wall,
                (x_front + facing_sign * 0.14, cy + y_off, z0 + sill_z + wh + 0.05),
                (0.28, ww + 0.14, 0.038),
                color="6E7780",
                tile="sash_metal",
                bevel=0.004,
            )


def build_kr_seoul_alley_street_hero() -> Tuple[HeroSceneGroups, List[PreviewCameraView], Dict[str, Any]]:
    """Construct the complete 8.0 x 16.0 x 7.5 m Korean Seoul Alley Street Hero scene."""
    groups = HeroSceneGroups()
    w, d = 8.0, 16.0
    road_z = 0.06
    walk_z = 0.14

    # --- 1. BG_Floor: Asphalt roadway, road lines, granite curbs, tiled sidewalks, grates & manholes ---
    # Base full footprint foundation pad (Z = 0.00..0.060)
    add_beveled_box(groups.floor, (0.0, 0.0, road_z * 0.5), (w, d, road_z), color="40434A", tile="asphalt", bevel=0.004)
    # Subtle asphalt utility trench patch slabs (+5 mm proud) for lived-in Seoul street texture
    for px, py, sx, sy in ((-0.55, -4.2, 1.35, 2.20), (0.62, 1.8, 1.15, 2.80), (-0.30, 5.4, 1.60, 1.40)):
        add_beveled_box(groups.floor, (px, py, road_z + 0.003), (sx, sy, 0.006), color="35383F", tile="asphalt", bevel=0.0015)

    # White pedestrian side-lane stripes & yellow edge lines (+4 mm relief)
    for sx in (-1.92, 1.92):
        add_beveled_box(groups.floor, (sx, 0.0, road_z + 0.003), (0.11, d - 0.60, 0.006), color="DCD8CE", tile="trim_paint", bevel=0.0015)
    # Pedestrian dashed crossing bars near South entrance
    for i in range(4):
        cx_bar = -1.20 + i * 0.80
        add_beveled_box(groups.floor, (cx_bar, -6.85, road_z + 0.003), (0.42, 0.95, 0.006), color="E2DED4", tile="trim_paint", bevel=0.0015)

    # Segmented granite curbs (연석) & sidewalk paved aprons on both sides (X = ±2.10..±4.00)
    for side in (-1, 1):
        # Continuous sidewalk sub-base under buildings & apron
        add_beveled_box(groups.floor, (side * 3.07, 0.0, walk_z * 0.5 + 0.03), (1.84, d - 0.02, walk_z - 0.06), color="9C9991", tile="concrete", bevel=0.004)
        # 16 beveled granite curbstones along X = ±2.14
        for ci in range(16):
            cy_c = -7.50 + ci * 1.00
            add_beveled_box(groups.floor, (side * 2.14, cy_c, 0.102), (0.14, 0.985, 0.084), color="B6B2A8", tile="stone_plinth", bevel=0.005)
        # Paved sidewalk tiles between curb & building facades (X = ±2.40)
        for ti in range(16):
            ty_c = -7.50 + ti * 1.00
            t_col = "C6C1B8" if ti % 2 == 0 else "BEB9B0"
            add_beveled_box(groups.floor, (side * 2.41, ty_c, 0.142), (0.38, 0.982, 0.012), color=t_col, tile="tile_ceramic", bevel=0.002)
        # 3 cast-iron slotted rainwater storm grates along each gutter
        for gy in (-5.2, 0.2, 5.2):
            gx = side * 1.98
            add_beveled_box(groups.floor, (gx, gy, road_z + 0.005), (0.24, 0.56, 0.010), color="3F454C", tile="sash_metal", bevel=0.002)
            for si in range(7):
                add_beveled_box(groups.floor, (gx, gy - 0.22 + si * 0.073, road_z + 0.011), (0.19, 0.022, 0.006), color="626B74", tile="sash_metal", bevel=0.0015)

    # 2 Detailed Cast-Iron Seoul Manhole Covers (맨홀) along roadway centerline
    for mx, my in ((-0.15, -3.10), (0.35, 3.15)):
        _add_tapered_cylinder(groups.floor, (mx, my, road_z), 0.012, 0.42, 0.41, sides=20, color="4B5158", tile="sash_metal", chamfer=0.002)
        _add_tapered_cylinder(groups.floor, (mx, my, road_z + 0.011), 0.007, 0.35, 0.35, sides=20, color="3A4046", tile="sash_metal", chamfer=0.0015)
        _add_tapered_cylinder(groups.floor, (mx, my, road_z + 0.017), 0.005, 0.16, 0.16, sides=16, color="545B63", tile="sash_metal", chamfer=0.0015)

    # --- 2. BG_Wall_West: 3 Varied 2~3F Seoul Facades (X: -4.00 .. -2.60) ---
    # Plot W1 (Y: -7.8..-2.6): 2F Vintage Red-Brick Corner Cafe & Residence (H = 6.30 m)
    _add_building_block_facade(
        groups.wall_west,
        groups.ceiling,
        x_front=-2.60,
        x_back=-4.00,
        y0=-7.80,
        y1=-2.60,
        z0=walk_z,
        height=6.00,
        facing_sign=1.0,
        wall_color="9B4F40",
        wall_tile="brick",
        trim_color="D5CEC2",
        window_specs=[
            (-0.65, 2.15, 1.85, 0.72, True),   # 1F wide cafe display window
            (-1.10, 1.38, 1.28, 3.65, True),   # 2F left apartment window
            (1.10, 1.38, 1.28, 3.65, False),   # 2F right apartment window
        ],
        floor_bands=(2.95,),
        parapet_h=0.34,
    )
    # 1F Cafe recessed glass entry door + concrete step + striped canvas awning (attached to wall_west for clean cutaway!)
    add_door_frame(groups.wall_west, (-2.72, -3.45, walk_z), width=0.96, height=2.22, wall_thickness=0.24, rot_z=math.pi * 0.5, frame_color="4A3B31", frame_tile="door_wood", leaf_color="5A473A", leaf_tile="door_wood")
    add_beveled_box(groups.wall_west, (-2.42, -3.45, walk_z + 0.045), (0.34, 1.18, 0.090), color="B2ACA2", tile="stone_plinth", bevel=0.005)
    _add_striped_awning(groups.wall_west, groups.wall_west, (-2.58, -5.85, walk_z + 2.74), rot_z=math.pi * 0.5, width=2.80, projection=0.88, drop=0.40, color_a="2B5746", color_b="F2ECE0")
    # Cafe horizontal Korean fascia signboard ("성수 로스터리 · 24시 마트")
    add_beveled_box(groups.wall_west, (-2.50, -5.20, walk_z + 3.16), (0.18, 4.65, 0.56), color="343A40", tile="sash_metal", bevel=0.005)
    add_beveled_box(groups.wall_west, (-2.40, -5.20, walk_z + 3.16), (0.018, 4.46, 0.44), color="FFFFFF", tile="floor_wood", bevel=0.002, uv_fit=True)

    # Plot W2 (Y: -2.5..+2.6): 3F Classic Seoul Multi-Family Villa with Rolled Shop Shutter (H = 7.45 m)
    _add_building_block_facade(
        groups.wall_west,
        groups.ceiling,
        x_front=-2.60,
        x_back=-4.00,
        y0=-2.50,
        y1=2.60,
        z0=walk_z,
        height=6.90,
        facing_sign=1.0,
        wall_color="CBC3B6",
        wall_tile="tile_ceramic",
        trim_color="B2ABA0",
        window_specs=[
            (-1.15, 1.48, 1.18, 3.25, False),  # 2F left
            (1.15, 1.48, 1.18, 3.25, True),    # 2F right
            (-1.15, 1.48, 1.18, 5.45, True),   # 3F left
            (1.15, 1.48, 1.18, 5.45, False),   # 3F right
        ],
        floor_bands=(2.85, 5.05),
        parapet_h=0.35,
    )
    # 1F Corrugated rolled shop shutter (inside wall_west so cutaway hides it cleanly!)
    _add_corrugated_shutter(groups.wall_west, groups.wall_west, (-2.56, -0.35, walk_z), rot_z=math.pi * 0.5, width=2.75, height=2.36, open_ratio=0.22)
    add_door_frame(groups.wall_west, (-2.72, 1.75, walk_z), width=0.92, height=2.12, wall_thickness=0.24, rot_z=math.pi * 0.5, frame_color="4D565E", frame_tile="sash_metal", leaf_color="5C6872", leaf_tile="sash_metal")
    # 2F & 3F exterior steel balcony safety guardrails across windows (inside wall_west!)
    for wz in (walk_z + 3.28, walk_z + 5.48):
        for wy in (-1.10, 1.20):
            add_balustrade(groups.wall_west, (-2.44, wy - 0.72, wz), (-2.44, wy + 0.72, wz), height=0.56, baluster_spacing=0.18, style="steel", color="7B848E", tile="sash_metal")

    # Plot W3 (Y: +2.7..+7.8): 2.5F Cream Stucco Building + Signature Exterior Steel Staircase (H = 6.90 m)
    _add_building_block_facade(
        groups.wall_west,
        groups.ceiling,
        x_front=-2.60,
        x_back=-4.00,
        y0=2.70,
        y1=7.80,
        z0=walk_z,
        height=6.36,
        facing_sign=1.0,
        wall_color="DFD7C8",
        wall_tile="plaster",
        trim_color="B8B0A2",
        window_specs=[
            (-1.10, 1.44, 1.24, 3.45, True),   # 2F window left of stairs
            (-0.95, 1.56, 1.14, 5.10, False),  # 3F window
            (1.15, 1.40, 1.14, 5.10, True),    # 3F right window
        ],
        floor_bands=(2.90, 4.92),
        parapet_h=0.34,
    )
    # 1F Recessed dark granite plinth + shop door + Exterior Steel Staircase climbing to 2F (inside wall_west for clean cutaway!)
    add_beveled_box(groups.wall_west, (-2.57, 5.25, walk_z + 0.52), (0.06, 4.95, 1.04), color="7D7B76", tile="stone_plinth", bevel=0.004)
    _add_exterior_steel_stairs(groups.wall_west, groups.wall_west, wall_x=-2.60, y_start=2.92, z_base=walk_z, z_landing=2.94)

    # --- 3. BG_Wall_East: 3 Varied 2~3F Seoul Facades (X: +2.60 .. +4.00) ---
    # Plot E1 (Y: -7.8..-2.5): 3F Mixed Concrete & Dark-Brick Corner Mini-Mart (H = 7.46 m)
    _add_building_block_facade(
        groups.wall_east,
        groups.ceiling,
        x_front=2.60,
        x_back=4.00,
        y0=-7.80,
        y1=-2.50,
        z0=walk_z,
        height=6.92,
        facing_sign=-1.0,
        wall_color="B6B2A8",
        wall_tile="concrete",
        trim_color="8E8B84",
        window_specs=[
            (-0.65, 2.35, 1.92, 0.56, True),   # 1F bright mini-mart showcase
            (-1.20, 1.46, 1.24, 3.30, False),  # 2F
            (1.15, 1.46, 1.24, 3.30, True),    # 2F
            (-1.20, 1.46, 1.24, 5.45, True),   # 3F
            (1.15, 1.46, 1.24, 5.45, False),   # 3F
        ],
        floor_bands=(2.95, 5.10),
        parapet_h=0.34,
    )
    # Corner Mini-Mart horizontal Korean fascia signboard & pitched blue-white awning
    add_beveled_box(groups.wall_east, (2.50, -5.15, walk_z + 3.12), (0.18, 4.90, 0.62), color="2A446E", tile="trim_paint", bevel=0.005)
    add_beveled_box(groups.wall_east, (2.40, -5.15, walk_z + 3.12), (0.018, 4.68, 0.46), color="FFFFFF", tile="floor_wood", bevel=0.002, uv_fit=True)
    _add_striped_awning(groups.wall_east, groups.wall_east, (2.58, -5.15, walk_z + 2.68), rot_z=-math.pi * 0.5, width=3.20, projection=0.82, drop=0.36, color_a="2E5E8C", color_b="F2F4F8")
    # Slim-depth sidewalk vending machine (depth=0.48 m -> sits flush at X=2.09..2.57, zero wall clip!)
    _add_vending_machine(groups.furniture_hero, groups.props_clutter, groups.ceiling, (2.33, -3.15, walk_z), rot_z=-math.pi * 0.5, depth=0.48, body_color="38649A", trim_color="ECEFF2")

    # Plot E2 (Y: -2.4..+2.7): 2F Warm Timber-Slat Alley Diner / Snack Bar w/ Pitched Tiled Eave (H = 6.20 m)
    _add_building_block_facade(
        groups.wall_east,
        groups.ceiling,
        x_front=2.60,
        x_back=4.00,
        y0=-2.40,
        y1=2.70,
        z0=walk_z,
        height=5.72,
        facing_sign=-1.0,
        wall_color="E5DDD0",
        wall_tile="plaster",
        trim_color="8E6A4A",
        window_specs=[
            (-0.70, 1.95, 1.48, 0.96, True),   # 1F diner counter window
            (-1.05, 1.36, 1.24, 3.65, True),   # 2F apartment left
            (1.15, 1.36, 1.24, 3.65, False),   # 2F apartment right
        ],
        floor_bands=(2.95,),
        parapet_h=0.30,
        pitched_eave_z=2.84,
    )
    # 1F Vertical warm cedar timber-slat cladding + lattice wooden sliding door + glowing red lantern!
    for si in range(18):
        sy = -2.25 + si * 0.275
        if -1.65 < sy < 0.28:
            continue
        add_beveled_box(groups.wall_east, (2.56, sy, walk_z + 1.42), (0.048, 0.14, 2.74), color="8B603D" if si % 2 == 0 else "7D5434", tile="wood_panel", bevel=0.004)
    add_door_frame(groups.wall_east, (2.72, 1.25, walk_z), width=1.02, height=2.16, wall_thickness=0.24, rot_z=-math.pi * 0.5, frame_color="6B492D", frame_tile="door_wood", leaf_color="8F6340", leaf_tile="door_wood")
    # Glowing traditional hanging lantern outside snack bar (attached to wall_east so cutaway hides cleanly)
    groups.wall_east.rail((2.58, 0.45, walk_z + 2.48), (2.28, 0.45, walk_z + 2.48), 0.014, "3A3E44", sides=6, tile="sash_metal")
    _add_tapered_cylinder(groups.wall_east, (2.28, 0.45, walk_z + 2.12), 0.32, 0.11, 0.11, sides=12, color="FF9E68", tile="trim_paint", chamfer=0.025)
    _add_tapered_cylinder(groups.wall_east, (2.28, 0.45, walk_z + 2.43), 0.035, 0.08, 0.08, sides=10, color="2C2E32", tile="sash_metal")
    _add_tapered_cylinder(groups.wall_east, (2.28, 0.45, walk_z + 2.09), 0.035, 0.08, 0.08, sides=10, color="2C2E32", tile="sash_metal")

    # Plot E3 (Y: +2.8..+7.8): 3F 1990s Seoul Red-Brick Multi-Family Villa (H = 7.36 m)
    _add_building_block_facade(
        groups.wall_east,
        groups.ceiling,
        x_front=2.60,
        x_back=4.00,
        y0=2.80,
        y1=7.80,
        z0=walk_z,
        height=6.88,
        facing_sign=-1.0,
        wall_color="8E483A",
        wall_tile="brick",
        trim_color="D8D2C6",
        window_specs=[
            (-1.10, 1.42, 1.20, 3.25, True),
            (1.10, 1.42, 1.20, 3.25, False),
            (-1.10, 1.42, 1.20, 5.38, False),
            (1.10, 1.42, 1.20, 5.38, True),
        ],
        floor_bands=(2.85, 5.00),
        parapet_h=0.34,
    )
    # 1F Recessed brick villa entry arch & concrete steps
    add_door_frame(groups.wall_east, (2.72, 5.30, walk_z + 0.16), width=1.18, height=2.24, wall_thickness=0.24, rot_z=-math.pi * 0.5, frame_color="68717A", frame_tile="sash_metal", leaf_color="56616B", leaf_tile="sash_metal")
    add_beveled_box(groups.wall_east, (2.42, 5.30, walk_z + 0.08), (0.36, 1.48, 0.16), color="B2ACA2", tile="stone_plinth", bevel=0.005)

    # --- 4. BG_Wall_North & BG_Wall_South: Alley End Corner Wall & South Entrance Threshold ---
    # North end (Y = +7.78): low Korean red-brick garden corner wall + coping + pedestrian steel gate
    # Leaving center roadway visual opening framed cleanly so alley feels authentic & deep
    add_beveled_box(groups.wall_north, (-1.45, 7.82, walk_z + 1.05), (2.25, 0.28, 2.10), color="9A5646", tile="brick", bevel=0.006)
    add_beveled_box(groups.wall_north, (-1.45, 7.82, walk_z + 2.14), (2.34, 0.36, 0.085), color="CFCAC0", tile="stone_plinth", bevel=0.005)
    add_beveled_box(groups.wall_north, (1.58, 7.82, walk_z + 0.72), (1.98, 0.28, 1.44), color="A6A29A", tile="concrete", bevel=0.006)
    add_beveled_box(groups.wall_north, (1.58, 7.82, walk_z + 1.48), (2.06, 0.36, 0.085), color="CFCAC0", tile="stone_plinth", bevel=0.005)
    # Decorative steel fence atop right North wall
    add_balustrade(groups.wall_north, (0.64, 7.82, walk_z + 1.52), (2.52, 7.82, walk_z + 1.52), height=0.72, baluster_spacing=0.16, style="steel", color="4E565E", tile="sash_metal")

    # South entry (Y = -7.82): low stone entrance curb markers & speed-bump threshold (keeps camera vista 100% open!)
    add_beveled_box(groups.wall_south, (0.0, -7.72, road_z + 0.022), (3.65, 0.42, 0.044), color="C8A232", tile="trim_paint", bevel=0.008)
    for sx in (-2.42, 2.42):
        add_beveled_box(groups.wall_south, (sx, -7.80, walk_z + 0.32), (0.36, 0.32, 0.64), color="A8A49B", tile="stone_plinth", bevel=0.006)
        add_beveled_box(groups.wall_south, (sx, -7.80, walk_z + 0.67), (0.42, 0.38, 0.068), color="C6C2B8", tile="stone_plinth", bevel=0.005)

    # --- 5. Utility Poles (×2) + Transformer + Overhead Catenary Wires (BG_Props_Clutter & BG_Ceiling) ---
    pole_w = _add_utility_pole(groups.props_clutter, (-2.26, -2.15), height=7.38, rot_z=0.0, with_transformer=True)
    pole_e = _add_utility_pole(groups.props_clutter, (2.26, 4.95), height=7.38, rot_z=math.pi, with_transformer=False)

    # Diagonal & longitudinal overhead power/telecom catenary cables spanning the entire alley sky
    for idx in range(4):
        _add_catenary_wire(groups.ceiling, pole_w["upper"][idx], pole_e["upper"][3 - idx], sag=0.34 + idx * 0.03, radius=0.011)
        _add_catenary_wire(groups.ceiling, pole_w["lower"][idx], pole_e["lower"][3 - idx], sag=0.40 + idx * 0.02, radius=0.009)
    # Extensions to South & North facade edge anchors so cables run continuously across the block
    for i, x_off in enumerate((-0.45, 0.45)):
        _add_catenary_wire(groups.ceiling, (-2.60 + x_off * 0.2, -7.75, 6.85 + i * 0.25), pole_w["upper"][i * 2], sag=0.22, radius=0.010)
        _add_catenary_wire(groups.ceiling, pole_e["upper"][i * 2], (2.55 - x_off * 0.2, 7.75, 6.95 + i * 0.20), sag=0.18, radius=0.010)
    # Telecom drop wires branching from utility pole splice boxes to opposite building weatherheads
    _add_catenary_wire(groups.ceiling, (-2.26, -1.98, 4.35), (2.58, -1.35, 4.10), sag=0.28, radius=0.008)
    _add_catenary_wire(groups.ceiling, (2.26, 4.78, 4.35), (-2.58, 4.15, 4.15), sag=0.26, radius=0.008)

    # --- 6. Projecting Korean Vertical Shop Signs (×6) & Alley Streetlamps (×3) ---
    # Wall-mounted projecting signs stay inside their parent wall group so West/East cutaways leave 0 floating fixtures!
    # West row projecting Korean signs ("성수커피", "24H 편의점", "김밥라면")
    _add_projecting_sign(groups.wall_west, groups.wall_west, (-2.58, -6.35, 4.05), rot_z=math.pi * 0.5, width=0.66, height=1.55, emissive_tile="chalkboard", glow_color="FFFFFF")
    _add_projecting_sign(groups.wall_west, groups.wall_west, (-2.58, -0.35, 4.45), rot_z=math.pi * 0.5, width=0.60, height=1.35, emissive_tile="carpet", glow_color="FFFFFF")
    _add_projecting_sign(groups.wall_west, groups.wall_west, (-2.58, 3.25, 4.75), rot_z=math.pi * 0.5, width=0.58, height=1.25, emissive_tile="marble", glow_color="FFFFFF")
    # East row projecting Korean signs ("24H 편의점", "분식 김밥라면", "성수커피")
    _add_projecting_sign(groups.wall_east, groups.wall_east, (2.58, -6.45, 4.35), rot_z=-math.pi * 0.5, width=0.68, height=1.62, emissive_tile="carpet", glow_color="FFFFFF")
    _add_projecting_sign(groups.wall_east, groups.wall_east, (2.58, -1.45, 3.85), rot_z=-math.pi * 0.5, width=0.64, height=1.38, emissive_tile="marble", glow_color="FFFFFF")
    _add_projecting_sign(groups.wall_east, groups.wall_east, (2.58, 3.45, 4.45), rot_z=-math.pi * 0.5, width=0.62, height=1.42, emissive_tile="chalkboard", glow_color="FFFFFF")

    # 3 Cobra-Head Alley Streetlamps (2 pole-mounted stay in props_clutter/ceiling; 1 East wall-mounted belongs to wall_east)
    _add_streetlamp(groups.props_clutter, groups.ceiling, (-2.12, -2.15, 4.75), rot_z=math.pi * 0.5, reach=1.18)
    _add_streetlamp(groups.wall_east, groups.wall_east, (2.58, -5.65, 4.85), rot_z=-math.pi * 0.5, reach=1.05)
    _add_streetlamp(groups.props_clutter, groups.ceiling, (2.12, 4.95, 4.75), rot_z=-math.pi * 0.5, reach=1.18)

    # --- 7. Facade AC Outdoor Units (×6), Yellow City Gas Risers + Meter Boxes & PVC Downspouts ---
    # Grounded sidewalk AC units stay in props_clutter; elevated wall-bracketed units & wall pipes belong to wall_west/wall_east!
    # West wall AC units (facing +X -> rot_z = +pi/2)
    _add_ac_outdoor_unit(groups.props_clutter, (-2.38, -2.35, walk_z), rot_z=math.pi * 0.5, wall_brackets=False)
    _add_ac_outdoor_unit(groups.wall_west, (-2.38, -0.05, 3.32), rot_z=math.pi * 0.5, wall_brackets=True)
    _add_ac_outdoor_unit(groups.wall_west, (-2.38, 2.52, 5.42), rot_z=math.pi * 0.5, wall_brackets=True)
    # East wall AC units (facing -X -> rot_z = -pi/2)
    _add_ac_outdoor_unit(groups.props_clutter, (2.38, -2.25, walk_z), rot_z=-math.pi * 0.5, wall_brackets=False)
    _add_ac_outdoor_unit(groups.wall_east, (2.38, 0.15, 3.45), rot_z=-math.pi * 0.5, wall_brackets=True)
    _add_ac_outdoor_unit(groups.wall_east, (2.38, 6.75, 3.35), rot_z=-math.pi * 0.5, wall_brackets=True)

    # Yellow Korean City-Gas Riser Pipes & Meter Boxes on both building rows
    _add_gas_pipe_and_meter(groups.wall_west, -2.60, -2.55, facing_sign=1.0, z_floor=walk_z, z_top=6.20)
    _add_gas_pipe_and_meter(groups.wall_west, -2.60, 2.65, facing_sign=1.0, z_floor=walk_z, z_top=6.00)
    _add_gas_pipe_and_meter(groups.wall_east, 2.60, 2.75, facing_sign=-1.0, z_floor=walk_z, z_top=6.30)

    # Grey PVC Rainwater Downspouts along building seams
    for rx, ry, rsign in ((-2.56, -7.55, 1.0), (-2.56, 7.55, 1.0), (2.56, -2.45, -1.0), (2.56, 7.55, -1.0)):
        target_wall = groups.wall_west if rx < 0.0 else groups.wall_east
        add_pipe_frame(
            target_wall,
            [(rx, ry, 6.10), (rx, ry, walk_z + 0.24), (rx + rsign * 0.22, ry, walk_z + 0.08)],
            radius=0.040,
            sides=8,
            color="8A929A",
            tile="sash_metal",
            flange_ends=False,
        )

    # --- 8. Sidewalk Street Furniture & Authentic Seoul Alley Clutter ---
    # Cafe wooden bench & A-frame menu board on West sidewalk outside Plot W1
    _add_rooftop_bench(groups.furniture_hero, groups.props_clutter, (-2.34, -6.55, walk_z), rot_z=math.pi * 0.5, length=1.35)
    # A-frame sidewalk cafe menu board with crisp Korean menu artwork
    mx, my = -2.30, -4.35
    add_beveled_box(groups.furniture_hero, (mx, my - 0.14, walk_z + 0.44), (0.48, 0.036, 0.86), color="5A4432", tile="wood_walnut", bevel=0.004)
    add_beveled_box(groups.furniture_hero, (mx, my + 0.14, walk_z + 0.44), (0.48, 0.036, 0.86), color="5A4432", tile="wood_walnut", bevel=0.004)
    add_beveled_box(groups.furniture_hero, (mx, my - 0.164, walk_z + 0.46), (0.40, 0.012, 0.66), color="FFFFFF", tile="paper_book", bevel=0.002, uv_fit=True)
    add_beveled_box(groups.furniture_hero, (mx, my + 0.164, walk_z + 0.46), (0.40, 0.012, 0.66), color="FFFFFF", tile="paper_book", bevel=0.002, uv_fit=True)

    # 3 Curved-Foliage Potted Sidewalk Planters softening shop entrances (zero flat leaf cards!)
    add_curved_foliage_plant(groups.furniture_hero, (-2.38, -2.92, walk_z), species="monstera", height=1.02, pot_radius=0.18, pot_height=0.32, leaf_count=10, seed=11, pot_color="B56F4D", pot_tile="ceramic_matte", soil_color="4B3C30", soil_tile="leather", leaf_color="3E7A4E", leaf_tile="foliage")
    add_curved_foliage_plant(groups.furniture_hero, (2.38, -1.68, walk_z), species="ficus", height=0.98, pot_radius=0.18, pot_height=0.30, leaf_count=10, seed=22, pot_color="7D8B7E", pot_tile="ceramic_matte", soil_color="4B3C30", soil_tile="leather", leaf_color="457F52", leaf_tile="foliage")
    add_curved_foliage_plant(groups.furniture_hero, (2.38, 1.98, walk_z), species="palm", height=1.08, pot_radius=0.19, pot_height=0.34, leaf_count=10, seed=33, pot_color="B87654", pot_tile="ceramic_matte", soil_color="4B3C30", soil_tile="leather", leaf_color="367044", leaf_tile="foliage")

    # Parked Seoul Commuter Bicycle leaning neatly beside East villa wall (Y = +4.18, X = +2.32)
    bx_c, by_c, bz_c = 2.30, 4.18, walk_z
    wheel_r = 0.31
    for wy_off in (-0.52, 0.52):
        # Rubber tire closed torus (14x6)
        w_rings: List[List[Vec3]] = []
        for mi in range(14):
            a = TAU * mi / 14.0
            ca, sa = math.cos(a), math.sin(a)
            w_rings.append([
                (
                    bx_c + 0.022 * math.sin(TAU * mj / 6.0),
                    by_c + wy_off + (wheel_r + 0.022 * math.cos(TAU * mj / 6.0)) * ca,
                    bz_c + wheel_r + 0.022 + (wheel_r + 0.022 * math.cos(TAU * mj / 6.0)) * sa,
                )
                for mj in range(6)
            ])
        groups.props_clutter.rings(w_rings, color="262A30", tile="rubber_dark", closed_loop=True)
        # Hub + 4 radial steel spokes
        groups.props_clutter.rail((bx_c - 0.03, by_c + wy_off, bz_c + wheel_r + 0.022), (bx_c + 0.03, by_c + wy_off, bz_c + wheel_r + 0.022), 0.020, "A8B2BC", sides=8, tile="steel_brushed")
        for sp_i in range(4):
            ang = math.pi * sp_i / 4.0
            r_sp = wheel_r - 0.026
            groups.props_clutter.rail(
                (bx_c, by_c + wy_off - r_sp * math.cos(ang), bz_c + wheel_r + 0.022 - r_sp * math.sin(ang)),
                (bx_c, by_c + wy_off + r_sp * math.cos(ang), bz_c + wheel_r + 0.022 + r_sp * math.sin(ang)),
                0.0045,
                "C2C9D0",
                sides=4,
                tile="steel_brushed",
                bevel_ends=False,
            )
    # Diamond steel frame, fork, handlebars & saddle
    hz = bz_c + wheel_r + 0.022
    groups.props_clutter.rail((bx_c, by_c - 0.52, hz), (bx_c, by_c - 0.04, hz), 0.015, "325E7A", sides=6, tile="enamel_gloss")
    groups.props_clutter.rail((bx_c, by_c - 0.04, hz), (bx_c, by_c - 0.14, hz + 0.44), 0.016, "325E7A", sides=6, tile="enamel_gloss")
    groups.props_clutter.rail((bx_c, by_c - 0.52, hz), (bx_c, by_c - 0.14, hz + 0.40), 0.014, "325E7A", sides=6, tile="enamel_gloss")
    groups.props_clutter.rail((bx_c, by_c - 0.04, hz), (bx_c, by_c + 0.38, hz + 0.42), 0.016, "325E7A", sides=6, tile="enamel_gloss")
    groups.props_clutter.rail((bx_c, by_c - 0.14, hz + 0.40), (bx_c, by_c + 0.38, hz + 0.46), 0.015, "325E7A", sides=6, tile="enamel_gloss")
    groups.props_clutter.rail((bx_c, by_c + 0.52, hz), (bx_c, by_c + 0.36, hz + 0.56), 0.015, "A8B2BC", sides=6, tile="steel_brushed")
    groups.props_clutter.rail((bx_c - 0.22, by_c + 0.34, hz + 0.58), (bx_c + 0.22, by_c + 0.34, hz + 0.58), 0.012, "3C424A", sides=6, tile="iron_dark")
    add_beveled_box(groups.props_clutter, (bx_c, by_c - 0.16, hz + 0.50), (0.14, 0.24, 0.052), color="3C322A", tile="rubber_dark", bevel=0.012)
    # Front wire basket on bicycle
    add_beveled_box(groups.props_clutter, (bx_c, by_c + 0.48, hz + 0.46), (0.26, 0.20, 0.18), color="58626C", tile="iron_dark", bevel=0.006)

    # Stacked plastic delivery crates next to snack bar
    for ci, cz in enumerate((walk_z + 0.15, walk_z + 0.45)):
        add_beveled_box(groups.props_clutter, (2.34, -0.58, cz), (0.38, 0.52, 0.28), color="3C6FA8" if ci == 0 else "D48B32", tile="plastic_matte", bevel=0.006)

    # Neighborhood Recycling Station tucked neatly on East sidewalk at Y = +3.10
    _add_recycling_station(groups.props_clutter, (2.34, 3.25, walk_z), rot_z=-math.pi * 0.5, bins=3)

    # 5 Street Bollards & 3 Red/Orange No-Parking Traffic Cones
    for bx, by in ((-2.18, -7.20), (-2.18, -4.85), (2.18, -7.20), (2.18, -4.65), (2.18, 6.20)):
        _add_bollard(groups.props_clutter, (bx, by, walk_z))
    for cx_p, cy_p in ((-2.16, 1.05), (2.16, -0.95), (-2.16, 6.65)):
        _add_traffic_cone(groups.props_clutter, (cx_p, cy_p, walk_z))

    # Convex Orange-Hooded Korean Road Safety Mirror (도로 반사경) at North-East alley corner
    mir_x, mir_y = 2.26, 7.15
    _add_tapered_cylinder(groups.props_clutter, (mir_x, mir_y, walk_z), 2.96, 0.042, 0.038, sides=10, color="E2C038", tile="enamel_gloss", chamfer=0.003)
    for bi in range(4):
        _add_tapered_cylinder(groups.props_clutter, (mir_x, mir_y, walk_z + 0.40 + bi * 0.46), 0.22, 0.045, 0.045, sides=10, color="282C32", tile="enamel_gloss", chamfer=0.002)
    # Orange hooded mirror housing facing South-West into the alley
    groups.props_clutter.rail((mir_x, mir_y, walk_z + 2.84), (mir_x - 0.16, mir_y - 0.18, walk_z + 2.84), 0.022, "525A62", sides=6, tile="iron_dark")
    groups.props_clutter.rail((mir_x - 0.12, mir_y - 0.14, walk_z + 2.84), (mir_x - 0.24, mir_y - 0.26, walk_z + 2.80), 0.34, "E06628", sides=16, tile="enamel_gloss")
    groups.ceiling.rail((mir_x - 0.23, mir_y - 0.25, walk_z + 2.80), (mir_x - 0.26, mir_y - 0.28, walk_z + 2.79), 0.29, "DCE8EE", sides=16, tile="mirror_chrome", bevel_ends=False)

    # --- Tailored 6-View Review Cameras ---
    views = [
        PreviewCameraView(
            key="front",
            label="1 ALLEY 24MM",
            location=(0.15, -7.4, 1.72),
            target=(-0.10, 4.2, 2.55),
            lens_mm=24.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="side",
            label="2 WEST FACADE",
            location=(11.5, 0.0, 3.8),
            target=(-3.1, 0.0, 3.2),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_East",),
        ),
        PreviewCameraView(
            key="back",
            label="3 EAST FACADE",
            location=(-11.5, 0.0, 3.8),
            target=(3.1, 0.0, 3.2),
            lens_mm=28.0,
            hide_nodes=("BG_Wall_West",),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(2.2, -12.6, 5.0),
            target=(-0.3, 1.4, 2.8),
            lens_mm=28.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 STREET 35MM",
            location=(-1.15, -2.8, 1.56),
            target=(1.05, 4.8, 2.45),
            lens_mm=34.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP OVERVIEW",
            location=(2.4, -12.2, 16.2),
            target=(0.0, 0.0, 2.2),
            lens_mm=30.0,
            hide_nodes=(),
        ),
    ]

    cameras_meta = {
        "alleyPerspective24mm": {"position": [0.15, 1.72, 7.4], "target": [-0.10, 2.55, -4.2], "lensMm": 24},
        "streetlampDialogue35mm": {"position": [-1.15, 1.56, 2.8], "target": [1.05, 2.45, -4.8], "lensMm": 35},
        "lowAngle20mm": {"position": [0.45, 0.85, 6.2], "target": [-0.40, 3.80, -3.5], "lensMm": 20},
    }
    return groups, views, cameras_meta


# ---------------------------------------------------------------------------
# End-to-End Scene Builder, Export, QA Gate & Preview Pipeline
# ---------------------------------------------------------------------------


def _reset_blender_clean() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module=FREESTYLE_SVG_ADDON)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def build_and_verify_scene(
    slug: str,
    builder: Callable[[], Tuple[HeroSceneGroups, List[PreviewCameraView], Dict[str, Any]]],
    *,
    out_dir: Path,
    preview_dir: Path,
    desktop_primary_size: int = 1024,
    desktop_secondary_size: int = 512,
    mobile_opaque_size: int = 1024,
    mobile_glass_size: int = 512,
    skip_preview: bool = False,
) -> Dict[str, Any]:
    """Build Desktop + Mobile GLBs, run strict Gate 1/2 QA checks, and render 6-view + SVG previews."""
    _reset_blender_clean()
    out_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)

    groups, views, cameras_meta = builder()
    groups.ground_to_zero()

    # 1. Mobile 4-node hero build, Gate 1 Blender audit, meshopt GLB export, Gate 2 GLB inspection
    mobile_scene: AssembledHeroScene = assemble_mobile_cutaway(
        slug,
        groups,
        opaque_size=mobile_opaque_size,
        glass_size=mobile_glass_size,
        auto_ground=False,
    )
    mobile_bmesh_qa = audit_blender_scene(mobile_scene.root, profile="mobile")
    if not mobile_bmesh_qa["passed"]:
        raise RuntimeError(f"[{slug}] Mobile Blender QA failed: {json.dumps(mobile_bmesh_qa['errors'], ensure_ascii=False)}")

    mobile_glb_path = out_dir / f"{slug}-mobile.glb"
    mobile_export = export_cutaway_glb(mobile_scene, mobile_glb_path, optimize_meshopt=True)
    mobile_glb_qa = inspect_glb(mobile_glb_path, profile="mobile", require_meshopt=True, run_validate=True)
    if not mobile_glb_qa["passed"]:
        raise RuntimeError(f"[{slug}] Mobile GLB QA failed: {json.dumps(mobile_glb_qa['errors'], ensure_ascii=False)}")
    _remove_hierarchy(mobile_scene)

    # 2. Desktop 8-node hero build, Gate 1 Blender audit, meshopt GLB export, Gate 2 GLB inspection
    desktop_scene: AssembledHeroScene = assemble_desktop_cutaway(
        slug,
        groups,
        primary_size=desktop_primary_size,
        secondary_size=desktop_secondary_size,
        auto_ground=False,
    )
    desktop_bmesh_qa = audit_blender_scene(desktop_scene.root, profile="desktop")
    if not desktop_bmesh_qa["passed"]:
        raise RuntimeError(f"[{slug}] Desktop Blender QA failed: {json.dumps(desktop_bmesh_qa['errors'], ensure_ascii=False)}")

    desktop_glb_path = out_dir / f"{slug}.glb"
    desktop_export = export_cutaway_glb(desktop_scene, desktop_glb_path, optimize_meshopt=True)
    desktop_glb_qa = inspect_glb(desktop_glb_path, profile="desktop", require_meshopt=True, run_validate=True)
    if not desktop_glb_qa["passed"]:
        raise RuntimeError(f"[{slug}] Desktop GLB QA failed: {json.dumps(desktop_glb_qa['errors'], ensure_ascii=False)}")

    # 3. Per-slug manifest JSON (avoids clobbering shared hero-v1/manifest.json across parallel workers)
    manifest = {
        "assetId": slug,
        "cutawayContract": "room-v1",
        "fileName": desktop_export["fileName"],
        "byteSize": desktop_export["byteSize"],
        "sha256": desktop_export["sha256"],
        "bounds": desktop_export["bounds"],
        "nodes": desktop_export["nodeNames"],
        "triangles": desktop_glb_qa["summary"]["triangles"],
        "drawCalls": desktop_glb_qa["summary"]["draw_calls"],
        "materials": desktop_glb_qa["summary"]["materials"],
        "mobile": {
            "fileName": mobile_export["fileName"],
            "byteSize": mobile_export["byteSize"],
            "sha256": mobile_export["sha256"],
            "nodes": mobile_export["nodeNames"],
            "triangles": mobile_glb_qa["summary"]["triangles"],
            "drawCalls": mobile_glb_qa["summary"]["draw_calls"],
            "materials": mobile_glb_qa["summary"]["materials"],
        },
        "cameras": cameras_meta,
    }
    manifest_path = out_dir / f"{slug}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # 4. 6-view 512x512 BLENDER_EEVEE contact sheet PNG + 3-tier Freestyle SVG + thumbnail
    preview_report: Optional[Dict[str, Any]] = None
    if not skip_preview:
        lineart_dst = out_dir / "lineart" / f"{slug}-lineart.svg"
        thumb_dst = out_dir / "thumbnails" / f"{slug}.png"
        thumb_idx = 4 if "rooftop" in slug else 0
        preview_report = render_hero_review_bundle(
            preview_dir,
            slug,
            root_obj=desktop_scene.root,
            views=views,
            tile_resolution=512,
            interior_cutaway=False,
            thumbnail_path=thumb_dst,
            thumbnail_view_index=thumb_idx,
            lineart_copy_path=lineart_dst,
        )
        svg_meta = dict(preview_report["freestyleSvg"])
        svg_meta["path"] = f"lineart/{slug}-lineart.svg"
        update_manifest_metadata(
            manifest_path,
            freestyle_svg=svg_meta,
            lighting_presets=build_lighting_presets(),
        )
    else:
        update_manifest_metadata(manifest_path, lighting_presets=build_lighting_presets())

    return {
        "slug": slug,
        "desktop": {
            "export": desktop_export,
            "bmeshQa": desktop_bmesh_qa["summary"],
            "glbQa": desktop_glb_qa["summary"],
            "gltfValidatePassed": desktop_glb_qa["gltf_validate"]["passed"] if desktop_glb_qa["gltf_validate"] else None,
        },
        "mobile": {
            "export": mobile_export,
            "bmeshQa": mobile_bmesh_qa["summary"],
            "glbQa": mobile_glb_qa["summary"],
            "gltfValidatePassed": mobile_glb_qa["gltf_validate"]["passed"] if mobile_glb_qa["gltf_validate"] else None,
        },
        "manifestPath": str(manifest_path),
        "preview": preview_report,
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    raw_argv = list(argv) if argv is not None else (
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    )

    parser = argparse.ArgumentParser(description="Build ToonStudio Hero BG3D: Rooftop & Seoul Alley")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--preview-dir", type=Path, default=DEFAULT_PREVIEW_DIR)
    parser.add_argument("--scenes", default="rooftop,alley", help="Comma-separated: rooftop,alley")
    parser.add_argument("--desktop-primary-size", type=int, default=2048)
    parser.add_argument("--desktop-secondary-size", type=int, default=1024)
    parser.add_argument("--mobile-opaque-size", type=int, default=1024)
    parser.add_argument("--mobile-glass-size", type=int, default=512)
    parser.add_argument("--skip-preview", action="store_true")
    parser.add_argument("--report-out", type=Path, default=DEFAULT_PREVIEW_DIR / "kr_rooftop_and_alley-report.json")
    args = parser.parse_args(raw_argv)

    requested = {s.strip().lower() for s in args.scenes.split(",") if s.strip()}
    scene_registry: List[Tuple[str, str, Callable[[], Tuple[HeroSceneGroups, List[PreviewCameraView], Dict[str, Any]]]]] = [
        ("rooftop", "kr_school_rooftop_hero", build_kr_school_rooftop_hero),
        ("alley", "kr_seoul_alley_street_hero", build_kr_seoul_alley_street_hero),
    ]

    reports: Dict[str, Any] = {}
    for key, slug, fn in scene_registry:
        if key not in requested and slug not in requested:
            continue
        print(f"[build_kr_rooftop_and_alley] Building {slug} ...", flush=True)
        rep = build_and_verify_scene(
            slug,
            fn,
            out_dir=args.out_dir,
            preview_dir=args.preview_dir,
            desktop_primary_size=args.desktop_primary_size,
            desktop_secondary_size=args.desktop_secondary_size,
            mobile_opaque_size=args.mobile_opaque_size,
            mobile_glass_size=args.mobile_glass_size,
            skip_preview=args.skip_preview,
        )
        reports[slug] = rep
        d_sum = rep["desktop"]["glbQa"]
        m_sum = rep["mobile"]["glbQa"]
        print(
            f"[build_kr_rooftop_and_alley] PASS {slug}: "
            f"desktop={d_sum['triangles']} tris, {d_sum['draw_calls']} DC, {d_sum['materials']} mat, {d_sum['byte_size']/1048576:.2f} MiB | "
            f"mobile={m_sum['triangles']} tris, {m_sum['draw_calls']} DC, {m_sum['materials']} mat, {m_sum['byte_size']/1048576:.2f} MiB",
            flush=True,
        )

    if args.report_out:
        args.report_out.parent.mkdir(parents=True, exist_ok=True)
        args.report_out.write_text(json.dumps(reports, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(reports, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
