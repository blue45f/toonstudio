"""Procedural PBR+Toon atlas generator and Blender 5.3 material library.

Generates deterministic, CC0-original 4x4 tiled PBR+Toon texture atlases
using pure NumPy and zlib PNG encoding (zero external dependencies like PIL),
with optional scene-specific Korean typography and webtoon signage synthesis
powered natively by Blender vector fonts (Font curve -> evaluated mesh ->
2x supersampled NumPy triangle rasterization).

Desktop Hero (4 materials, <= 8 draw calls target):
  - ``01_Arch_Trim_Atlas``      (default 2048x2048, Albedo + Normal + ORM)
  - ``02_Wood_Fabric_Atlas``    (default 2048x2048, Albedo + Normal + ORM)
  - ``03_Metal_Hardware_Atlas`` (default 1024x1024, Albedo + Normal + ORM)
  - ``04_Glass_Emissive``       (default 1024x1024, Albedo + Normal + ORM + Emissive)

Mobile Hero (2 materials, <= 4 draw calls target):
  - ``01_Opaque_Master_1024``   (1024x1024, Albedo + Normal + ORM)
  - ``02_Glass_Accent_512``     (512x512,   Albedo + Normal + ORM + Emissive)

Every tile enforces a safe UV gutter margin >= 0.015 inside [0, 1] with
clamped border pixel bleeding to prevent mipmap seams across atlas cells.
All generated images are packed into Blender memory before temporary files
are released.
"""

from __future__ import annotations

import math
import os
import struct
import tempfile
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, FrozenSet, List, Mapping, Optional, Sequence, Tuple

import bpy
import numpy as np

# ---------------------------------------------------------------------------
# Atlas grid & UV margin contract
# ---------------------------------------------------------------------------

ATLAS_GRID_COLS = 4
ATLAS_GRID_ROWS = 4
ATLAS_UV_MARGIN = 0.016  # Strictly >= 0.015 per ToonStudio BG3D spec

MAT_ARCH_TRIM = "01_Arch_Trim_Atlas"
MAT_WOOD_FABRIC = "02_Wood_Fabric_Atlas"
MAT_METAL_HARDWARE = "03_Metal_Hardware_Atlas"
MAT_GLASS_EMISSIVE = "04_Glass_Emissive"

DESKTOP_MATERIAL_NAMES: Tuple[str, ...] = (
    MAT_ARCH_TRIM,
    MAT_WOOD_FABRIC,
    MAT_METAL_HARDWARE,
    MAT_GLASS_EMISSIVE,
)

MAT_MOBILE_OPAQUE = "01_Opaque_Master_1024"
MAT_MOBILE_GLASS = "02_Glass_Accent_512"

MOBILE_MATERIAL_NAMES: Tuple[str, ...] = (
    MAT_MOBILE_OPAQUE,
    MAT_MOBILE_GLASS,
)

# Tiles that support scene-specific graphic synthesis (signage, chalkboards, menus, posters)
SCENE_GRAPHIC_TILE_SLOTS: FrozenSet[str] = frozenset(
    {
        "chalkboard",
        "paper_label",
        "paper_book",
        "enamel_gloss",
        "emissive_neon",
        "emissive_exit_green",
        "emissive_amber",
        "emissive_rose",
    }
)

SUPPORTED_SCENE_SLUGS: Tuple[str, ...] = (
    # Hero BG v1 (6 scenes)
    "kr_modern_apartment_living",
    "kr_atelier_cafe_interior",
    "kr_highschool_classroom_corridor",
    "kr_school_rooftop_hero",
    "kr_seoul_alley_street_hero",
    "rofan_imperial_palace_hall_balcony",
    # Hero BG v2 (6 scenes)
    "kr_modern_office_suite",
    "kr_seoul_subway_train_platform",
    "kr_hospital_ward_corridor",
    "rofan_noble_study_parlor",
    "kr_rooftop_studio_oneroom",
    "kr_convenience_store_night",
)


@dataclass(frozen=True)
class AtlasTileRect:
    """Normalized [0, 1] UV rectangle for a single tile cell with safe margin."""

    tile_name: str
    col: int
    row: int
    u_min: float
    v_min: float
    u_max: float
    v_max: float

    @property
    def u_span(self) -> float:
        return self.u_max - self.u_min

    @property
    def v_span(self) -> float:
        return self.v_max - self.v_min


# 16 semantic tile definitions per atlas (row 0 = UV bottom, row 3 = UV top)
ATLAS_TILE_LAYOUTS: Mapping[str, Tuple[str, ...]] = {
    MAT_ARCH_TRIM: (
        "plaster",
        "concrete",
        "floor_wood",
        "tile_ceramic",
        "marble",
        "trim_paint",
        "brick",
        "stone_plinth",
        "wood_panel",
        "sash_metal",
        "door_wood",
        "hardware_brass",
        "glass_tinted",
        "carpet",
        "chalkboard",
        "asphalt",
    ),
    MAT_WOOD_FABRIC: (
        "wood_oak",
        "wood_walnut",
        "wood_birch",
        "wood_painted",
        "fabric_linen",
        "fabric_velvet",
        "fabric_canvas",
        "leather",
        "carpet_plush",
        "paper_book",
        "foliage",
        "ceramic_matte",
        "metal_leg_dark",
        "metal_leg_steel",
        "metal_brass_trim",
        "laminate_matte",
    ),
    MAT_METAL_HARDWARE: (
        "steel_brushed",
        "iron_dark",
        "aluminum_satin",
        "brass_polished",
        "copper_patina",
        "galvanized_zinc",
        "enamel_gloss",
        "plastic_matte",
        "rubber_dark",
        "ceramic_gloss",
        "wood_prop",
        "paper_label",
        "fabric_prop",
        "foliage_prop",
        "stone_prop",
        "glass_prop",
    ),
    MAT_GLASS_EMISSIVE: (
        "ceiling_plaster",
        "ceiling_beam",
        "ceiling_metal",
        "glass_clear",
        "glass_frosted",
        "glass_warm",
        "emissive_warm",
        "emissive_cool",
        "emissive_neon",
        "emissive_exit_green",
        "emissive_amber",
        "emissive_rose",
        "ceiling_wood",
        "ceiling_concrete",
        "ceiling_brass",
        "mirror_chrome",
    ),
    MAT_MOBILE_OPAQUE: (
        "plaster",
        "concrete",
        "floor_wood",
        "tile_ceramic",
        "marble",
        "trim_paint",
        "brick",
        "wood_oak",
        "wood_walnut",
        "fabric_linen",
        "fabric_velvet",
        "iron_dark",
        "steel_brushed",
        "brass_polished",
        "foliage",
        "glass_tinted",
    ),
    MAT_MOBILE_GLASS: (
        "ceiling_plaster",
        "ceiling_beam",
        "ceiling_metal",
        "glass_clear",
        "glass_frosted",
        "glass_warm",
        "emissive_warm",
        "emissive_cool",
        "emissive_neon",
        "emissive_exit_green",
        "emissive_amber",
        "emissive_rose",
        "ceiling_wood",
        "ceiling_concrete",
        "ceiling_brass",
        "mirror_chrome",
    ),
}

# Canonical semantic fallback map so any tile name resolves cleanly on any atlas.
_TILE_FALLBACK_ALIASES: Mapping[str, Tuple[str, ...]] = {
    "plaster": ("plaster", "ceiling_plaster", "trim_paint", "paper_label", "wood_painted"),
    "concrete": ("concrete", "ceiling_concrete", "stone_plinth", "stone_prop", "laminate_matte"),
    "floor_wood": ("floor_wood", "wood_oak", "wood_panel", "wood_prop", "ceiling_wood"),
    "tile_ceramic": ("tile_ceramic", "ceramic_gloss", "ceramic_matte", "marble", "plaster"),
    "marble": ("marble", "tile_ceramic", "stone_plinth", "stone_prop", "plaster"),
    "trim_paint": ("trim_paint", "wood_painted", "plastic_matte", "ceiling_beam", "plaster"),
    "brick": ("brick", "stone_plinth", "stone_prop", "ceramic_matte", "concrete"),
    "stone_plinth": ("stone_plinth", "stone_prop", "concrete", "marble", "laminate_matte"),
    "wood_panel": ("wood_panel", "wood_oak", "floor_wood", "wood_prop", "ceiling_wood"),
    "sash_metal": ("sash_metal", "iron_dark", "metal_leg_dark", "aluminum_satin", "ceiling_metal"),
    "door_wood": ("door_wood", "wood_oak", "wood_walnut", "wood_prop", "ceiling_wood"),
    "hardware_brass": ("hardware_brass", "brass_polished", "metal_brass_trim", "ceiling_brass"),
    "glass_tinted": ("glass_tinted", "glass_clear", "glass_prop", "mirror_chrome"),
    "carpet": ("carpet", "carpet_plush", "fabric_velvet", "fabric_linen", "fabric_prop"),
    "chalkboard": ("chalkboard", "laminate_matte", "plastic_matte", "iron_dark", "concrete"),
    "asphalt": ("asphalt", "concrete", "rubber_dark", "stone_prop"),
    "wood_oak": ("wood_oak", "floor_wood", "door_wood", "wood_prop", "ceiling_wood"),
    "wood_walnut": ("wood_walnut", "door_wood", "wood_panel", "wood_prop", "ceiling_wood"),
    "wood_birch": ("wood_birch", "floor_wood", "wood_oak", "wood_prop", "ceiling_wood"),
    "wood_painted": ("wood_painted", "trim_paint", "enamel_gloss", "ceiling_beam", "plaster"),
    "fabric_linen": ("fabric_linen", "fabric_prop", "carpet", "plaster"),
    "fabric_velvet": ("fabric_velvet", "carpet_plush", "carpet", "fabric_prop", "fabric_linen"),
    "fabric_canvas": ("fabric_canvas", "fabric_linen", "fabric_prop", "carpet"),
    "leather": ("leather", "fabric_velvet", "rubber_dark", "wood_walnut"),
    "carpet_plush": ("carpet_plush", "carpet", "fabric_velvet", "fabric_linen"),
    "paper_book": ("paper_book", "paper_label", "trim_paint", "plaster"),
    "foliage": ("foliage", "foliage_prop", "fabric_linen", "carpet"),
    "ceramic_matte": ("ceramic_matte", "ceramic_gloss", "tile_ceramic", "plaster"),
    "metal_leg_dark": ("metal_leg_dark", "iron_dark", "sash_metal", "ceiling_metal"),
    "metal_leg_steel": ("metal_leg_steel", "steel_brushed", "aluminum_satin", "sash_metal", "ceiling_metal"),
    "metal_brass_trim": ("metal_brass_trim", "brass_polished", "hardware_brass", "ceiling_brass"),
    "laminate_matte": ("laminate_matte", "plastic_matte", "trim_paint", "plaster"),
    "steel_brushed": ("steel_brushed", "metal_leg_steel", "sash_metal", "ceiling_metal"),
    "iron_dark": ("iron_dark", "metal_leg_dark", "sash_metal", "ceiling_metal"),
    "aluminum_satin": ("aluminum_satin", "steel_brushed", "metal_leg_steel", "sash_metal", "ceiling_metal"),
    "brass_polished": ("brass_polished", "metal_brass_trim", "hardware_brass", "ceiling_brass"),
    "copper_patina": ("copper_patina", "brass_polished", "hardware_brass", "metal_brass_trim"),
    "galvanized_zinc": ("galvanized_zinc", "steel_brushed", "sash_metal", "ceiling_metal"),
    "enamel_gloss": ("enamel_gloss", "trim_paint", "wood_painted", "ceramic_gloss"),
    "plastic_matte": ("plastic_matte", "laminate_matte", "trim_paint", "plaster"),
    "rubber_dark": ("rubber_dark", "iron_dark", "asphalt", "chalkboard"),
    "ceramic_gloss": ("ceramic_gloss", "tile_ceramic", "ceramic_matte", "marble"),
    "wood_prop": ("wood_prop", "wood_oak", "floor_wood", "ceiling_wood"),
    "paper_label": ("paper_label", "paper_book", "trim_paint", "plaster"),
    "fabric_prop": ("fabric_prop", "fabric_linen", "carpet", "plaster"),
    "foliage_prop": ("foliage_prop", "foliage", "fabric_linen"),
    "stone_prop": ("stone_prop", "stone_plinth", "concrete", "marble"),
    "glass_prop": ("glass_prop", "glass_clear", "glass_tinted", "mirror_chrome"),
    "ceiling_plaster": ("ceiling_plaster", "plaster", "trim_paint"),
    "ceiling_beam": ("ceiling_beam", "trim_paint", "wood_painted", "wood_oak"),
    "ceiling_metal": ("ceiling_metal", "iron_dark", "sash_metal", "steel_brushed"),
    "glass_clear": ("glass_clear", "glass_tinted", "glass_prop", "mirror_chrome"),
    "glass_frosted": ("glass_frosted", "glass_tinted", "glass_clear", "tile_ceramic"),
    "glass_warm": ("glass_warm", "glass_tinted", "emissive_warm", "brass_polished"),
    "emissive_warm": ("emissive_warm", "glass_warm", "trim_paint", "plaster"),
    "emissive_cool": ("emissive_cool", "glass_clear", "trim_paint", "plaster"),
    "emissive_neon": ("emissive_neon", "emissive_warm", "enamel_gloss", "trim_paint"),
    "emissive_exit_green": ("emissive_exit_green", "emissive_cool", "enamel_gloss", "trim_paint"),
    "emissive_amber": ("emissive_amber", "emissive_warm", "brass_polished", "trim_paint"),
    "emissive_rose": ("emissive_rose", "emissive_neon", "enamel_gloss", "trim_paint"),
    "ceiling_wood": ("ceiling_wood", "wood_oak", "floor_wood", "wood_panel"),
    "ceiling_concrete": ("ceiling_concrete", "concrete", "stone_plinth"),
    "ceiling_brass": ("ceiling_brass", "brass_polished", "hardware_brass", "metal_brass_trim"),
    "mirror_chrome": ("mirror_chrome", "steel_brushed", "glass_tinted", "glass_clear"),
}


def resolve_tile_index(atlas_name: str, tile_name: str) -> Tuple[int, str]:
    """Resolve a semantic tile name to an index ``0..15`` inside ``atlas_name``."""
    layout = ATLAS_TILE_LAYOUTS.get(atlas_name)
    if layout is None:
        raise KeyError(f"Unknown atlas name: {atlas_name!r}")
    if tile_name in layout:
        return layout.index(tile_name), tile_name
    for candidate in _TILE_FALLBACK_ALIASES.get(tile_name, ()):
        if candidate in layout:
            return layout.index(candidate), candidate
    return 0, layout[0]


def get_tile_uv_rect(
    atlas_name: str,
    tile_name: str,
    margin: float = ATLAS_UV_MARGIN,
) -> AtlasTileRect:
    """Return the padded [0, 1] UV rectangle for ``tile_name`` inside ``atlas_name``."""
    if margin < 0.015:
        raise ValueError(f"Atlas UV margin must be >= 0.015, got {margin}")
    idx, resolved_name = resolve_tile_index(atlas_name, tile_name)
    col = idx % ATLAS_GRID_COLS
    row = idx // ATLAS_GRID_COLS
    cell_w = 1.0 / ATLAS_GRID_COLS
    cell_h = 1.0 / ATLAS_GRID_ROWS
    u_min = col * cell_w + margin
    u_max = (col + 1) * cell_w - margin
    v_min = row * cell_h + margin
    v_max = (row + 1) * cell_h - margin
    return AtlasTileRect(
        tile_name=resolved_name,
        col=col,
        row=row,
        u_min=u_min,
        v_min=v_min,
        u_max=u_max,
        v_max=v_max,
    )


# ---------------------------------------------------------------------------
# Pure-Python PNG encoder (RGB & RGBA, zero PIL dependency)
# ---------------------------------------------------------------------------


def save_png(path: Path, image: np.ndarray) -> None:
    """Write a float [0, 1] or uint8 HxWx3 / HxWx4 array as an 8-bit PNG."""
    if image.dtype == np.uint8:
        pixels = image
    else:
        pixels = np.rint(np.clip(image, 0.0, 1.0) * 255.0).astype(np.uint8)
    if pixels.ndim != 3 or pixels.shape[2] not in (3, 4):
        raise ValueError(f"Expected HxWx3 or HxWx4 image, got {pixels.shape}")
    height, width, channels = pixels.shape
    color_type = 2 if channels == 3 else 6

    def _chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw_rows = b"".join(b"\x00" + row.tobytes() for row in pixels)
    ihdr = struct.pack(">2I5B", width, height, 8, color_type, 0, 0, 0)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(raw_rows, level=6))
        + _chunk(b"IEND", b"")
    )
    path.write_bytes(png_bytes)


# ---------------------------------------------------------------------------
# Pure-NumPy + Blender VectorFont Korean/Latin Graphic Tile Rasterizer
# (Zero PIL dependency, deterministic CC0 artwork)
# ---------------------------------------------------------------------------

_FONT_CANDIDATES: Mapping[str, Tuple[str, ...]] = {
    "gothic": (
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ),
    "myungjo": (
        "/System/Library/Fonts/Supplemental/AppleMyungjo.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ),
    "sans": (
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ),
}

_FONT_CACHE: Dict[str, Optional[bpy.types.VectorFont]] = {}


def _get_blender_font(style: str = "gothic") -> Optional[bpy.types.VectorFont]:
    """Load and cache a system Korean/Latin font into ``bpy.data.fonts`` safely."""
    cached = _FONT_CACHE.get(style)
    if cached is not None:
        try:
            _ = cached.name
            if cached.name in bpy.data.fonts:
                return cached
        except ReferenceError:
            pass
    for path in _FONT_CANDIDATES.get(style, _FONT_CANDIDATES["gothic"]):
        if os.path.isfile(path):
            try:
                fnt = bpy.data.fonts.load(path, check_existing=True)
                _FONT_CACHE[style] = fnt
                return fnt
            except Exception:
                continue
    return None


def _rgb(hex_color: str) -> np.ndarray:
    """Convert 6-digit sRGB hex string to float32 RGB array in [0, 1]."""
    clean = hex_color.lstrip("#").strip()
    return np.array(
        [int(clean[0:2], 16) / 255.0, int(clean[2:4], 16) / 255.0, int(clean[4:6], 16) / 255.0],
        dtype=np.float32,
    )


def _fill_rect(
    img: np.ndarray,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    color: Sequence[float] | str,
    alpha: float = 1.0,
) -> None:
    """Fill normalized [0,1]x[0,1] rectangle (y=0 top, y=1 bottom) on HxWx3 array."""
    h, w = img.shape[:2]
    px0 = max(0, min(w, int(round(min(x0, x1) * w))))
    px1 = max(0, min(w, int(round(max(x0, x1) * w))))
    py0 = max(0, min(h, int(round(min(y0, y1) * h))))
    py1 = max(0, min(h, int(round(max(y0, y1) * h))))
    if px1 <= px0 or py1 <= py0:
        return
    col = _rgb(color) if isinstance(color, str) else np.asarray(color, dtype=np.float32)
    if alpha >= 0.999:
        img[py0:py1, px0:px1] = col
    else:
        img[py0:py1, px0:px1] = img[py0:py1, px0:px1] * (1.0 - alpha) + col * alpha


def _draw_border(
    img: np.ndarray,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    thickness: float,
    color: Sequence[float] | str,
    alpha: float = 1.0,
) -> None:
    """Draw a rectangular outline border in normalized coordinates."""
    _fill_rect(img, x0, y0, x1, y0 + thickness, color, alpha=alpha)
    _fill_rect(img, x0, y1 - thickness, x1, y1, color, alpha=alpha)
    _fill_rect(img, x0, y0, x0 + thickness, y1, color, alpha=alpha)
    _fill_rect(img, x1 - thickness, y0, x1, y1, color, alpha=alpha)


def _draw_circle(
    img: np.ndarray,
    cx: float,
    cy: float,
    radius: float,
    color: Sequence[float] | str,
    *,
    alpha: float = 1.0,
    ring_thickness: float = 0.0,
) -> None:
    """Draw an anti-aliased filled circle or ring in normalized [0,1] coordinates."""
    h, w = img.shape[:2]
    pad = radius + 2.0 / max(w, h)
    px0 = max(0, int(math.floor((cx - pad) * w)))
    px1 = min(w, int(math.ceil((cx + pad) * w)))
    py0 = max(0, int(math.floor((cy - pad) * h)))
    py1 = min(h, int(math.ceil((cy + pad) * h)))
    if px1 <= px0 or py1 <= py0:
        return
    yy, xx = np.mgrid[py0:py1, px0:px1]
    dx = (xx + 0.5) / float(w) - cx
    dy = (yy + 0.5) / float(h) - cy
    dist = np.hypot(dx, dy)
    aa = 1.2 / float(min(w, h))
    outer = np.clip((radius + aa - dist) / (2.0 * aa), 0.0, 1.0)
    if ring_thickness > 0.0:
        inner_r = max(0.0, radius - ring_thickness)
        inner = np.clip((dist - (inner_r - aa)) / (2.0 * aa), 0.0, 1.0)
        mask = outer * inner * alpha
    else:
        mask = outer * alpha
    col = _rgb(color) if isinstance(color, str) else np.asarray(color, dtype=np.float32)
    region = img[py0:py1, px0:px1]
    img[py0:py1, px0:px1] = region * (1.0 - mask[..., None]) + col * mask[..., None]


def _draw_line(
    img: np.ndarray,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    thickness: float,
    color: Sequence[float] | str,
    alpha: float = 1.0,
) -> None:
    """Draw an anti-aliased line segment in normalized [0,1] coordinates."""
    h, w = img.shape[:2]
    half_t = max(thickness * 0.5, 0.75 / float(min(w, h)))
    pad = half_t + 2.0 / float(min(w, h))
    px0 = max(0, int(math.floor((min(x0, x1) - pad) * w)))
    px1 = min(w, int(math.ceil((max(x0, x1) + pad) * w)))
    py0 = max(0, int(math.floor((min(y0, y1) - pad) * h)))
    py1 = min(h, int(math.ceil((max(y0, y1) + pad) * h)))
    if px1 <= px0 or py1 <= py0:
        return
    yy, xx = np.mgrid[py0:py1, px0:px1]
    px = (xx + 0.5) / float(w)
    py = (yy + 0.5) / float(h)
    vx, vy = x1 - x0, y1 - y0
    seg_len2 = vx * vx + vy * vy
    if seg_len2 < 1e-10:
        return
    t = np.clip(((px - x0) * vx + (py - y0) * vy) / seg_len2, 0.0, 1.0)
    dist = np.hypot(px - (x0 + t * vx), py - (y0 + t * vy))
    aa = 1.2 / float(min(w, h))
    mask = np.clip((half_t + aa - dist) / (2.0 * aa), 0.0, 1.0) * alpha
    col = _rgb(color) if isinstance(color, str) else np.asarray(color, dtype=np.float32)
    region = img[py0:py1, px0:px1]
    img[py0:py1, px0:px1] = region * (1.0 - mask[..., None]) + col * mask[..., None]


def _extract_font_triangles(
    text: str,
    *,
    font_style: str = "gothic",
    align_x: str = "CENTER",
    space_line: float = 1.18,
    space_character: float = 1.0,
    resolution_u: int = 4,
) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """Convert Korean/Latin text into 2D triangle coordinates via Blender FONT curve."""
    if not text or not text.strip():
        return None
    scene = getattr(bpy.context, "scene", None)
    if scene is None:
        return None
    curve = bpy.data.curves.new(name="_TS_TmpFontCurve", type="FONT")
    obj = None
    try:
        fnt = _get_blender_font(font_style)
        if fnt is not None:
            curve.font = fnt
        curve.body = text
        curve.resolution_u = max(2, int(resolution_u))
        curve.align_x = align_x
        curve.align_y = "CENTER"
        curve.space_line = float(space_line)
        curve.space_character = float(space_character)
        curve.fill_mode = "FRONT"

        obj = bpy.data.objects.new("_TS_TmpFontObj", curve)
        scene.collection.objects.link(obj)
        deps = bpy.context.evaluated_depsgraph_get()
        eval_obj = obj.evaluated_get(deps)
        mesh = eval_obj.to_mesh()
        try:
            mesh.calc_loop_triangles()
            n_verts = len(mesh.vertices)
            n_tris = len(mesh.loop_triangles)
            if n_verts == 0 or n_tris == 0:
                return None
            co_flat = np.empty(n_verts * 3, dtype=np.float32)
            mesh.vertices.foreach_get("co", co_flat)
            verts_xy = co_flat.reshape((n_verts, 3))[:, :2].copy()
            tri_flat = np.empty(n_tris * 3, dtype=np.int32)
            mesh.loop_triangles.foreach_get("vertices", tri_flat)
            tris = tri_flat.reshape((n_tris, 3)).copy()
            return verts_xy, tris
        finally:
            eval_obj.to_mesh_clear()
    except Exception:
        return None
    finally:
        if obj is not None and obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
        if curve.name in bpy.data.curves:
            bpy.data.curves.remove(curve)


def _rasterize_triangles_mask(
    verts_px: np.ndarray,
    tris: np.ndarray,
    width_px: int,
    height_px: int,
    *,
    bold_dilate: int = 0,
) -> np.ndarray:
    """Fast vectorized bounding-box barycentric 2D triangle rasterizer with 2x SSAA."""
    ss = 2
    sw = max(2, width_px * ss)
    sh = max(2, height_px * ss)
    buf = np.zeros((sh, sw), dtype=np.bool_)

    v = verts_px * float(ss)
    p0 = v[tris[:, 0]]
    p1 = v[tris[:, 1]]
    p2 = v[tris[:, 2]]

    x0s = p0[:, 0]
    y0s = p0[:, 1]
    x1s = p1[:, 0]
    y1s = p1[:, 1]
    x2s = p2[:, 0]
    y2s = p2[:, 1]

    min_xs = np.maximum(0, np.floor(np.minimum(np.minimum(x0s, x1s), x2s)).astype(np.int32))
    max_xs = np.minimum(sw - 1, np.ceil(np.maximum(np.maximum(x0s, x1s), x2s)).astype(np.int32))
    min_ys = np.maximum(0, np.floor(np.minimum(np.minimum(y0s, y1s), y2s)).astype(np.int32))
    max_ys = np.minimum(sh - 1, np.ceil(np.maximum(np.maximum(y0s, y1s), y2s)).astype(np.int32))

    # Signed area * 2 (skip degenerate triangles)
    areas = (x1s - x0s) * (y2s - y0s) - (y1s - y0s) * (x2s - x0s)

    for idx in range(len(tris)):
        area = areas[idx]
        if abs(area) < 1e-6:
            continue
        bx0, bx1 = int(min_xs[idx]), int(max_xs[idx])
        by0, by1 = int(min_ys[idx]), int(max_ys[idx])
        if bx1 < bx0 or by1 < by0:
            continue
        ax, ay = float(x0s[idx]), float(y0s[idx])
        bx, by = float(x1s[idx]), float(y1s[idx])
        cx, cy = float(x2s[idx]), float(y2s[idx])

        gx = np.arange(bx0, bx1 + 1, dtype=np.float32) + 0.5
        gy = np.arange(by0, by1 + 1, dtype=np.float32) + 0.5
        e0 = (gx[None, :] - ax) * (by - ay) - (gy[:, None] - ay) * (bx - ax)
        e1 = (gx[None, :] - bx) * (cy - by) - (gy[:, None] - by) * (cx - bx)
        e2 = (gx[None, :] - cx) * (ay - cy) - (gy[:, None] - cy) * (ax - cx)
        if area > 0.0:
            inside = (e0 <= 0.0) & (e1 <= 0.0) & (e2 <= 0.0)
        else:
            inside = (e0 >= 0.0) & (e1 >= 0.0) & (e2 >= 0.0)
        buf[by0 : by1 + 1, bx0 : bx1 + 1] |= inside

    if bold_dilate > 0:
        for _ in range(bold_dilate):
            padded = np.pad(buf, 1, mode="constant", constant_values=False)
            buf = (
                padded[1:-1, 1:-1]
                | padded[:-2, 1:-1]
                | padded[2:, 1:-1]
                | padded[1:-1, :-2]
                | padded[1:-1, 2:]
            )

    # 2x2 box filter downsampling for crisp anti-aliased edges
    mask = buf.reshape((height_px, ss, width_px, ss)).mean(axis=(1, 3)).astype(np.float32)
    return mask


def _draw_text_box(
    img: np.ndarray,
    text: str,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    color: Sequence[float] | str,
    *,
    emissive: Optional[np.ndarray] = None,
    emissive_scale: float = 0.0,
    font_style: str = "gothic",
    align_x: str = "CENTER",
    align_y: str = "CENTER",
    bold: bool = False,
    bold_dilate: Optional[int] = None,
    alpha: float = 1.0,
    space_line: float = 1.18,
    space_character: float = 1.0,
    aspect_bias: float = 1.0,
    outline_color: Optional[Sequence[float] | str] = None,
) -> None:
    """Render crisp anti-aliased Korean/Latin text inside normalized box [x0..x1, y0..y1]."""
    h, w = img.shape[:2]
    px0 = max(0, min(w, int(round(x0 * w))))
    px1 = max(0, min(w, int(round(x1 * w))))
    py0 = max(0, min(h, int(round(y0 * h))))
    py1 = max(0, min(h, int(round(y1 * h))))
    bw = px1 - px0
    bh = py1 - py0
    if bw < 6 or bh < 6:
        return

    extracted = _extract_font_triangles(
        text,
        font_style=font_style,
        align_x=align_x,
        space_line=space_line,
        space_character=space_character,
    )
    if extracted is None:
        return
    verts_xy, tris = extracted
    vx_min = float(verts_xy[:, 0].min())
    vx_max = float(verts_xy[:, 0].max())
    vy_min = float(verts_xy[:, 1].min())
    vy_max = float(verts_xy[:, 1].max())
    span_x = max(vx_max - vx_min, 1e-4)
    span_y = max(vy_max - vy_min, 1e-4)

    # Fit uniformly into target box (optionally compensating for non-square target wall/sign)
    ab = max(0.12, float(aspect_bias))
    sx = bw / (span_x * ab)
    sy = bh / span_y
    scale = min(sx, sy) * 0.94
    draw_w = span_x * scale * ab
    draw_h = span_y * scale

    if align_x == "LEFT":
        off_x = 1.0
    elif align_x == "RIGHT":
        off_x = max(0.0, bw - draw_w - 1.0)
    else:
        off_x = 0.5 * (bw - draw_w)

    if align_y == "TOP":
        off_y = 1.0
    elif align_y == "BOTTOM":
        off_y = max(0.0, bh - draw_h - 1.0)
    else:
        off_y = 0.5 * (bh - draw_h)

    verts_px = np.empty_like(verts_xy)
    verts_px[:, 0] = (verts_xy[:, 0] - vx_min) * scale * ab + off_x
    # Flip Y so font top (+Y) maps to image top (small py)
    verts_px[:, 1] = (vy_max - verts_xy[:, 1]) * scale + off_y

    dil = int(bold_dilate) if bold_dilate is not None else (1 if bold else 0)
    if outline_color is not None:
        out_mask = _rasterize_triangles_mask(verts_px, tris, bw, bh, bold_dilate=dil + 1)
        ocol = _rgb(outline_color) if isinstance(outline_color, str) else np.asarray(outline_color, dtype=np.float32)
        om = out_mask * alpha
        img[py0:py1, px0:px1] = img[py0:py1, px0:px1] * (1.0 - om[..., None]) + ocol * om[..., None]
        if emissive is not None and emissive_scale > 0.0:
            emissive[py0:py1, px0:px1] = (
                emissive[py0:py1, px0:px1] * (1.0 - om[..., None]) + ocol * emissive_scale * om[..., None]
            )

    mask = _rasterize_triangles_mask(verts_px, tris, bw, bh, bold_dilate=dil)
    col = _rgb(color) if isinstance(color, str) else np.asarray(color, dtype=np.float32)
    m = mask * alpha
    img[py0:py1, px0:px1] = img[py0:py1, px0:px1] * (1.0 - m[..., None]) + col * m[..., None]
    if emissive is not None and emissive_scale > 0.0:
        emissive[py0:py1, px0:px1] = (
            emissive[py0:py1, px0:px1] * (1.0 - m[..., None]) + col * emissive_scale * m[..., None]
        )


# ---------------------------------------------------------------------------
# Reusable Scene Graphic Tile Compositors (12 Hero Scenes + Custom Hook)
# ---------------------------------------------------------------------------

TileArrays = Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]
TilePainter = Callable[[np.ndarray, np.ndarray, np.ndarray, np.ndarray], TileArrays]

_CUSTOM_SCENE_PAINTERS: Dict[Tuple[str, str], TilePainter] = {}


def register_scene_tile_painter(scene_slug: str, tile_name: str, painter: TilePainter) -> None:
    """Register or override a custom tile painter for ``(scene_slug, tile_name)``.

    The painter receives ``(albedo, relief, orm, emissive)`` arrays of shape
    ``(cell_px, cell_px, ...)`` and returns the updated 4-tuple.
    """
    _CUSTOM_SCENE_PAINTERS[(scene_slug, tile_name)] = painter


def _make_orm(h: int, w: int, rough_val: float, metal_val: float = 0.0, ao_val: float = 1.0) -> np.ndarray:
    orm = np.empty((h, w, 3), dtype=np.float32)
    orm[:, :, 0] = ao_val
    orm[:, :, 1] = rough_val
    orm[:, :, 2] = metal_val
    return orm


def _paint_exit_sign(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
    *,
    label_ko: str = "비상구",
    label_en: str = "EXIT",
) -> TileArrays:
    """Standard Korean green illuminated emergency exit sign with running-person icon."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    em = np.zeros((h, w, 3), dtype=np.float32)
    bg = _rgb("128A48")
    img[:, :] = bg
    em[:, :] = bg * 0.92
    _draw_border(img, 0.03, 0.05, 0.97, 0.95, 0.025, "F4FFF6")
    _draw_border(em, 0.03, 0.05, 0.97, 0.95, 0.025, "E8FFF0")

    # White door & running person pictogram on left
    _fill_rect(img, 0.09, 0.14, 0.41, 0.86, "F4FFF6")
    _fill_rect(em, 0.09, 0.14, 0.41, 0.86, "F0FFF4")
    _draw_circle(img, 0.27, 0.28, 0.048, "128A48")
    _draw_circle(em, 0.27, 0.28, 0.048, "128A48")
    for a, b in (
        ((0.26, 0.34), (0.23, 0.56)),
        ((0.25, 0.40), (0.16, 0.47)),
        ((0.25, 0.40), (0.35, 0.44)),
        ((0.23, 0.56), (0.15, 0.76)),
        ((0.23, 0.56), (0.33, 0.74)),
    ):
        _draw_line(img, a[0], a[1], b[0], b[1], 0.038, "128A48")
        _draw_line(em, a[0], a[1], b[0], b[1], 0.038, "128A48")

    # Korean + English labels on right
    _draw_text_box(img, label_ko, 0.44, 0.16, 0.93, 0.54, "FFFFFF", emissive=em, emissive_scale=1.0, bold=True)
    _draw_text_box(img, label_en, 0.46, 0.56, 0.91, 0.84, "E4FFEC", emissive=em, emissive_scale=0.95, bold=True)
    return img, np.zeros_like(relief), _make_orm(h, w, 0.24), em


def _paint_vending_front(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
    *,
    header: str = "시원한 음료 · 24H",
    accent_hex: str = "D63A32",
) -> TileArrays:
    """Detailed Korean beverage vending machine showcase with glowing shelves & drink cans."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    em = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb("F2F5F8")
    em[:, :] = _rgb("D8E4EE") * 0.72

    # Header banner
    _fill_rect(img, 0.0, 0.0, 1.0, 0.16, accent_hex)
    _fill_rect(em, 0.0, 0.0, 1.0, 0.16, accent_hex)
    _draw_text_box(img, header, 0.06, 0.02, 0.94, 0.14, "FFFFFF", emissive=em, emissive_scale=0.95, bold=True)

    # 3 Illuminated drink shelves with colorful cans/bottles + red/blue price button strip
    can_palettes = [
        ("D9382E", "1E64B4", "2D9A54", "F0A822", "E66C24", "4BA6D4"),
        ("288C4A", "E64646", "F2C230", "2C5AA0", "D45A88", "3AA696"),
        ("3B6AA8", "E89228", "56A844", "C83E4D", "6E5AA8", "28869C"),
    ]
    prices = ("1,200", "1,500", "1,000")
    for row_i in range(3):
        y_top = 0.20 + row_i * 0.255
        y_can_bot = y_top + 0.155
        # Soft backlit shelf cavity
        _fill_rect(img, 0.04, y_top, 0.96, y_can_bot + 0.065, "EBF1F6")
        _fill_rect(em, 0.04, y_top, 0.96, y_can_bot + 0.065, "C8D6E2", alpha=0.65)
        for col_i, c_hex in enumerate(can_palettes[row_i]):
            cx0 = 0.07 + col_i * 0.145
            cx1 = cx0 + 0.105
            cy0 = y_top + (0.025 if col_i % 2 == 0 else 0.012)
            # Aluminum rim top + painted body + crisp white label stripe
            _fill_rect(img, cx0 + 0.008, cy0, cx1 - 0.008, cy0 + 0.016, "D4DCE2")
            _fill_rect(img, cx0, cy0 + 0.016, cx1, y_can_bot, c_hex)
            _fill_rect(em, cx0, cy0 + 0.016, cx1, y_can_bot, c_hex, alpha=0.55)
            _fill_rect(img, cx0 + 0.006, cy0 + 0.055, cx1 - 0.006, cy0 + 0.095, "FAF8F4")
            # Selection button bar underneath each can
            btn_col = "259652" if (row_i + col_i) % 3 != 0 else "D9483B"
            _fill_rect(img, cx0 + 0.01, y_can_bot + 0.022, cx1 - 0.01, y_can_bot + 0.050, btn_col)
            _fill_rect(em, cx0 + 0.01, y_can_bot + 0.022, cx1 - 0.01, y_can_bot + 0.050, btn_col, alpha=0.9)
        # Metallic shelf divider rail + price tag
        _fill_rect(img, 0.04, y_can_bot, 0.96, y_can_bot + 0.018, "343C44")
        _fill_rect(em, 0.04, y_can_bot, 0.96, y_can_bot + 0.018, "1A1E22")
        _draw_text_box(
            img,
            f"₩{prices[row_i]}  ·  판매중",
            0.06,
            y_can_bot + 0.052,
            0.94,
            y_can_bot + 0.076,
            "26303A",
            bold=False,
        )

    _draw_border(img, 0.015, 0.015, 0.985, 0.985, 0.018, "2C343C")
    return img, np.zeros_like(relief), _make_orm(h, w, 0.16), em


def _paint_vertical_sign(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
    *,
    bg_hex: str,
    border_hex: str,
    text_hex: str,
    header_hex: str,
    header_text: str,
    vertical_chars: str,
    footer_text: str = "",
    font_style: str = "gothic",
    emissive_boost: float = 0.85,
    aspect_bias: float = 2.4,
) -> TileArrays:
    """Paint a crisp Korean projecting street signboard (돌출간판)."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    em = np.zeros((h, w, 3), dtype=np.float32)
    bg = _rgb(bg_hex)
    img[:, :] = bg
    em[:, :] = bg * emissive_boost

    # Outer metal-framed border
    _draw_border(img, 0.03, 0.03, 0.97, 0.97, 0.028, border_hex)
    _draw_border(em, 0.03, 0.03, 0.97, 0.97, 0.028, border_hex, alpha=0.55)

    # Top accent header band
    _fill_rect(img, 0.06, 0.06, 0.94, 0.21, header_hex)
    _fill_rect(em, 0.06, 0.06, 0.94, 0.21, header_hex, alpha=emissive_boost)
    _draw_text_box(
        img,
        header_text,
        0.08,
        0.072,
        0.92,
        0.198,
        "FFFFFF",
        emissive=em,
        emissive_scale=0.95,
        font_style=font_style,
        bold=True,
        bold_dilate=2,
        aspect_bias=min(aspect_bias, 1.8),
    )

    # Vertical stacked Korean characters (aspect-compensated for tall narrow projecting signs)
    body_text = "\n".join(list(vertical_chars))
    y_bot = 0.83 if footer_text else 0.92
    _draw_text_box(
        img,
        body_text,
        0.08,
        0.235,
        0.92,
        y_bot,
        text_hex,
        emissive=em,
        emissive_scale=emissive_boost * 0.75,
        font_style=font_style,
        bold=True,
        bold_dilate=2,
        space_line=1.06,
        aspect_bias=aspect_bias,
    )

    if footer_text:
        _fill_rect(img, 0.10, 0.84, 0.90, 0.855, border_hex)
        _draw_text_box(
            img,
            footer_text,
            0.08,
            0.865,
            0.92,
            0.948,
            text_hex,
            emissive=em,
            emissive_scale=emissive_boost * 0.6,
            bold=True,
            bold_dilate=2,
            aspect_bias=min(aspect_bias, 1.8),
        )

    return img, np.zeros_like(relief), _make_orm(h, w, 0.22), em


def _paint_horizontal_fascia(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
    *,
    bg_hex: str,
    stripe_top_hex: str,
    stripe_bot_hex: str,
    title_ko: str,
    subtitle: str,
    title_hex: str = "FFFFFF",
    sub_hex: str = "F4E6C8",
    font_style: str = "gothic",
    is_emissive: bool = True,
    aspect_bias: float = 1.0,
    bold_dilate: int = 2,
) -> TileArrays:
    """Paint a crisp horizontal Korean storefront signboard (전면 간판)."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    em = np.zeros((h, w, 3), dtype=np.float32)
    bg = _rgb(bg_hex)
    img[:, :] = bg
    if is_emissive:
        em[:, :] = bg * 0.85

    _fill_rect(img, 0.0, 0.0, 1.0, 0.12, stripe_top_hex)
    _fill_rect(img, 0.0, 0.88, 1.0, 1.0, stripe_bot_hex)
    if is_emissive:
        _fill_rect(em, 0.0, 0.0, 1.0, 0.12, stripe_top_hex, alpha=0.92)
        _fill_rect(em, 0.0, 0.88, 1.0, 1.0, stripe_bot_hex, alpha=0.92)

    _draw_border(img, 0.025, 0.15, 0.975, 0.85, 0.015, sub_hex, alpha=0.65)
    _draw_text_box(
        img,
        title_ko,
        0.05,
        0.18,
        0.95,
        0.64,
        title_hex,
        emissive=em if is_emissive else None,
        emissive_scale=1.0 if is_emissive else 0.0,
        font_style=font_style,
        bold=True,
        bold_dilate=bold_dilate,
        aspect_bias=aspect_bias,
    )
    _draw_text_box(
        img,
        subtitle,
        0.07,
        0.65,
        0.93,
        0.84,
        sub_hex,
        emissive=em if is_emissive else None,
        emissive_scale=0.88 if is_emissive else 0.0,
        font_style="sans",
        bold=False,
        bold_dilate=max(1, bold_dilate - 1),
        aspect_bias=aspect_bias,
    )
    return img, np.zeros_like(relief), _make_orm(h, w, 0.24), em


def _paint_cafe_chalkboard(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    """Seongsu specialty coffee chalkboard menu (메뉴판)."""
    h, w = albedo.shape[:2]
    img = albedo.copy() * _rgb("242A27")
    _draw_border(img, 0.03, 0.03, 0.97, 0.97, 0.014, "DFD8C6", alpha=0.85)
    _draw_border(img, 0.055, 0.055, 0.945, 0.945, 0.006, "C7A86D", alpha=0.7)

    _draw_text_box(img, "MENU · 성수 아틀리에", 0.08, 0.075, 0.92, 0.20, "F6EFE0", bold=True)
    _fill_rect(img, 0.10, 0.215, 0.90, 0.225, "C7A86D", alpha=0.85)

    left_menu = "아메리카노      4.5\n카페 라떼       5.0\n바닐라 라떼     5.5\n플랫 화이트     5.0\n핸드드립        6.0"
    right_menu = "크루아상        4.2\n휘낭시에        3.5\n치즈케이크      6.5\n티라미수        6.8\n오늘의 원두  에티오피아"
    _draw_text_box(img, left_menu, 0.08, 0.25, 0.49, 0.86, "F2ECE0", align_x="LEFT", space_line=1.42)
    _fill_rect(img, 0.505, 0.26, 0.512, 0.85, "DFD8C6", alpha=0.35)
    _draw_text_box(img, right_menu, 0.53, 0.25, 0.92, 0.86, "EFE4CE", align_x="LEFT", space_line=1.42)
    _draw_text_box(img, "SPECIALTY COFFEE ROASTERY · SINCE 2019", 0.10, 0.88, 0.90, 0.94, "C7A86D")
    return img, relief * 0.5, _make_orm(h, w, 0.82), emissive


def _paint_classroom_chalkboard(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    """Korean high school green chalkboard with crisp Korean/math lesson notes & chalk dust."""
    h, w = albedo.shape[:2]
    yy, xx = np.indices((h, w), dtype=np.float32)
    u = xx / float(w)
    v = yy / float(h)
    dust = 0.04 * np.exp(-(((u - 0.48) / 0.28) ** 2 + ((v - 0.52) / 0.24) ** 2))
    base_green = _rgb("1E4634")
    img = np.clip(base_green[None, None, :] * (0.92 + 0.12 * albedo) + dust[..., None], 0.0, 1.0)

    # Top header line & column separators
    _draw_line(img, 0.04, 0.17, 0.96, 0.17, 0.005, "DCE6DE", alpha=0.55)
    _draw_line(img, 0.34, 0.20, 0.34, 0.90, 0.004, "DCE6DE", alpha=0.45)
    _draw_line(img, 0.72, 0.20, 0.72, 0.90, 0.004, "DCE6DE", alpha=0.45)

    # Header: date + lesson + duty students
    _draw_text_box(img, "11월 20일 (금)   2교시 수학 II", 0.05, 0.05, 0.66, 0.15, "F4F7F2", align_x="LEFT", bold=True)
    _draw_text_box(img, "주번: 김민수 · 이서연", 0.69, 0.06, 0.95, 0.15, "F2DF9B", align_x="RIGHT")

    # Left column: Korean literature notes
    _draw_text_box(
        img,
        "1. 도함수의 활용\n- 접선의 방정식\n- 함수의 극대·극소\n- 평균값 정리",
        0.05,
        0.22,
        0.32,
        0.64,
        "EEF4EE",
        align_x="LEFT",
        space_line=1.35,
    )
    _draw_text_box(img, "※ 수행평가 제출\n    금요일 5교시까지", 0.05, 0.70, 0.32, 0.89, "F6C7B6", align_x="LEFT", space_line=1.3)

    # Center column: formula + chalk parabola axes graph
    _draw_text_box(img, "f'(a) = lim (f(a+h) - f(a)) / h", 0.36, 0.22, 0.70, 0.34, "FAF4D2", bold=True)
    # Axes
    _draw_line(img, 0.40, 0.78, 0.68, 0.78, 0.006, "EAF2EA", alpha=0.85)
    _draw_line(img, 0.52, 0.40, 0.52, 0.84, 0.006, "EAF2EA", alpha=0.85)
    # Parabola curve points
    pts_x = np.linspace(0.41, 0.66, 20)
    pts_y = 0.76 - 2.3 * ((pts_x - 0.53) ** 2) * 4.5 + 0.05 * (pts_x - 0.53)
    pts_y = np.clip(0.44 + 12.5 * ((pts_x - 0.535) ** 2), 0.42, 0.80)
    for i in range(len(pts_x) - 1):
        _draw_line(img, float(pts_x[i]), float(pts_y[i]), float(pts_x[i + 1]), float(pts_y[i + 1]), 0.008, "AEE2F4", alpha=0.92)
    # Tangent line
    _draw_line(img, 0.46, 0.67, 0.67, 0.48, 0.006, "F7D08A", alpha=0.9)
    _draw_circle(img, 0.57, 0.57, 0.012, "F49B8C")
    _draw_text_box(img, "y = f(x)", 0.58, 0.38, 0.70, 0.46, "AEE2F4")

    # Right column: reminders & D-day
    _draw_text_box(
        img,
        "[학급 알림]\n기말고사 D-14\n점심시간 청소\n동아리 16:30",
        0.74,
        0.22,
        0.95,
        0.68,
        "EFF3EC",
        align_x="LEFT",
        space_line=1.35,
    )
    _draw_text_box(img, "급식: 김치찌개\n계란말이 · 귤", 0.74, 0.72, 0.95, 0.89, "CBECC8", align_x="LEFT", space_line=1.3)
    return img, relief * 0.4, _make_orm(h, w, 0.78), emissive


def _paint_classroom_timetable(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    """Korean high school weekly timetable & class notice bulletin sheet."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb("FAF7F0")
    _draw_border(img, 0.03, 0.03, 0.97, 0.97, 0.015, "3B5C4E")
    _fill_rect(img, 0.05, 0.05, 0.95, 0.19, "2F5747")
    _draw_text_box(img, "2학년 3반 주간 시간표 · 학급 안내", 0.08, 0.065, 0.92, 0.175, "FFFFFF", bold=True)

    # Timetable grid
    cols = ("", "월", "화", "수", "목", "금")
    rows_data = (
        ("1", "국어", "수학", "영어", "문학", "수학"),
        ("2", "수학", "영어", "국어", "물리", "영어"),
        ("3", "영어", "화학", "수학", "국어", "한국사"),
        ("4", "한국사", "국어", "체육", "수학", "미술"),
        ("5", "물리", "음악", "지구", "영어", "자율"),
        ("6", "체육", "수학", "영어", "동아리", "청소"),
    )
    gx0, gy0, gx1, gy1 = 0.06, 0.22, 0.94, 0.78
    cw = (gx1 - gx0) / 6.0
    rh = (gy1 - gy0) / 7.0
    _fill_rect(img, gx0, gy0, gx1, gy0 + rh, "DCE8E0")
    for ci, cname in enumerate(cols):
        x = gx0 + ci * cw
        _draw_line(img, x, gy0, x, gy1, 0.005, "7A8E84")
        if cname:
            _draw_text_box(img, cname, x + 0.01, gy0 + 0.008, x + cw - 0.01, gy0 + rh - 0.008, "1F3B2F", bold=True)
    _draw_line(img, gx1, gy0, gx1, gy1, 0.005, "7A8E84")
    for ri, rvals in enumerate(rows_data):
        ry = gy0 + (ri + 1) * rh
        _draw_line(img, gx0, ry, gx1, ry, 0.004, "8FA198")
        if ri % 2 == 1:
            _fill_rect(img, gx0 + 0.002, ry + 0.002, gx1 - 0.002, ry + rh - 0.002, "F2F5F1")
        for ci, cell_txt in enumerate(rvals):
            cx = gx0 + ci * cw
            _draw_text_box(
                img,
                cell_txt,
                cx + 0.008,
                ry + 0.008,
                cx + cw - 0.008,
                ry + rh - 0.008,
                "2A3430",
                bold=(ci == 0),
            )
    _draw_line(img, gx0, gy1, gx1, gy1, 0.005, "7A8E84")

    # Bottom notice block
    _fill_rect(img, 0.06, 0.81, 0.94, 0.94, "F2E8D5")
    _draw_text_box(img, "가정통신문: 11월 학력평가 안내 · 실내화 착용 필수", 0.08, 0.83, 0.92, 0.92, "4A3B28", bold=True)
    return img, np.zeros_like(relief), _make_orm(h, w, 0.82), emissive


def _paint_class_motto(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    """Traditional Korean classroom motto calligraphy placard (급훈)."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb("F7F2E4")
    _draw_border(img, 0.03, 0.06, 0.97, 0.94, 0.022, "7C5B3A")
    _draw_border(img, 0.065, 0.11, 0.935, 0.89, 0.009, "B89968")
    _draw_text_box(
        img,
        "급  훈",
        0.26,
        0.12,
        0.74,
        0.35,
        "7C3F22",
        font_style="myungjo",
        bold=True,
        bold_dilate=2,
        aspect_bias=0.38,
    )
    _draw_text_box(
        img,
        "성실 · 창의 · 협동",
        0.08,
        0.37,
        0.85,
        0.86,
        "14161A",
        font_style="myungjo",
        bold=True,
        bold_dilate=2,
        aspect_bias=0.34,
    )
    # Red traditional seal stamp
    _fill_rect(img, 0.86, 0.64, 0.92, 0.84, "B8362B")
    return img, relief * 0.25, _make_orm(h, w, 0.85), emissive


def _paint_poster_atelier(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
    *,
    title: str,
    subtitle: str,
    bg_hex: str = "F4EEE2",
    accent_a: str = "2D5A47",
    accent_b: str = "C86D4A",
    accent_c: str = "D8B468",
) -> TileArrays:
    """Mid-century Bauhaus / Korean studio gallery poster artwork."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb(bg_hex)
    _draw_border(img, 0.04, 0.04, 0.96, 0.96, 0.016, "2C2A26")
    # Stylized geometric sun + botanical arches
    _fill_rect(img, 0.10, 0.10, 0.90, 0.66, "EAE2D2")
    _draw_circle(img, 0.56, 0.34, 0.17, accent_c)
    _draw_circle(img, 0.38, 0.44, 0.15, accent_b)
    _fill_rect(img, 0.16, 0.46, 0.84, 0.62, accent_a)
    _draw_line(img, 0.22, 0.20, 0.78, 0.56, 0.014, "242220", alpha=0.75)
    _draw_text_box(img, title, 0.10, 0.69, 0.90, 0.82, "242220", bold=True)
    _draw_text_box(img, subtitle, 0.12, 0.83, 0.88, 0.92, "6E6254")
    return img, np.zeros_like(relief), _make_orm(h, w, 0.72), emissive


def _paint_rooftop_warning(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    """Korean rooftop safety warning sign (옥상 출입 주의)."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb("FAF8F2")
    _fill_rect(img, 0.0, 0.0, 1.0, 0.28, "CC2E28")
    _fill_rect(img, 0.0, 0.84, 1.0, 1.0, "E8B422")
    _draw_border(img, 0.02, 0.02, 0.98, 0.98, 0.02, "24262A")
    _draw_text_box(img, "위 험 · 주 의", 0.08, 0.04, 0.92, 0.24, "FFFFFF", bold=True)
    _draw_text_box(img, "옥상 출입 주의\n난간 기대기 금지", 0.08, 0.32, 0.92, 0.78, "1E2226", bold=True, space_line=1.28)
    _draw_text_box(img, "관계자 외 출입금지 · 안전제일", 0.08, 0.86, 0.92, 0.97, "1E2226", bold=True)
    return img, np.zeros_like(relief), _make_orm(h, w, 0.36), emissive


def _paint_imperial_crest(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    """Ornate Romance Fantasy imperial gold-on-crimson damask heraldry tapestry."""
    h, w = albedo.shape[:2]
    yy, xx = np.indices((h, w), dtype=np.float32)
    u = xx / float(w)
    v = yy / float(h)
    damask = 0.5 + 0.5 * np.sin(math.tau * u * 8.0) * np.sin(math.tau * v * 8.0)
    crimson = _rgb("6B1624")
    img = np.clip(crimson[None, None, :] * (0.86 + 0.24 * damask[..., None]), 0.0, 1.0)
    _draw_border(img, 0.04, 0.04, 0.96, 0.96, 0.030, "D8B25E")
    _draw_border(img, 0.09, 0.09, 0.91, 0.91, 0.012, "F0D488")
    # Imperial sun rays & concentric medallion crest
    for k in range(16):
        ang = math.tau * k / 16.0
        r1 = 0.32 if k % 2 == 0 else 0.25
        _draw_line(img, 0.5, 0.48, 0.5 + r1 * math.cos(ang), 0.48 + r1 * math.sin(ang), 0.014, "E5C16A")
    _draw_circle(img, 0.5, 0.48, 0.16, "D8B25E")
    _draw_circle(img, 0.5, 0.48, 0.125, "7A1A28")
    _draw_circle(img, 0.5, 0.48, 0.07, "F2D98D")
    _draw_text_box(img, "IMPERIUM", 0.18, 0.80, 0.82, 0.90, "F2D98D", font_style="myungjo", bold=True)
    rel = np.clip(relief * 0.4 + 0.35 * damask, 0.0, 1.0)
    return img, rel, _make_orm(h, w, 0.55, metal_val=0.25), emissive


def _paint_office_whiteboard(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    """Korean modern tech office whiteboard with sprint roadmap & sticky notes."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb("F7F9FB")
    _draw_border(img, 0.02, 0.02, 0.98, 0.98, 0.015, "C4CCD4")
    _draw_text_box(img, "2026 Q4 스프린트 로드맵 · 디자인 리뷰", 0.05, 0.05, 0.95, 0.16, "1E2B3A", align_x="LEFT", bold=True)
    _draw_line(img, 0.04, 0.18, 0.96, 0.18, 0.005, "2E6BC6")

    # 3 Kanban columns
    cols = (("TODO", "E8F0FA", "2C5AA0"), ("DOING", "FFF4D9", "C9821E"), ("DONE", "E4F5EC", "268652"))
    for i, (cname, bg, hd) in enumerate(cols):
        cx0 = 0.05 + i * 0.31
        cx1 = cx0 + 0.28
        _fill_rect(img, cx0, 0.22, cx1, 0.72, bg)
        _fill_rect(img, cx0, 0.22, cx1, 0.30, hd)
        _draw_text_box(img, cname, cx0 + 0.02, 0.23, cx1 - 0.02, 0.29, "FFFFFF", bold=True)
        # Sticky notes
        for r in range(2):
            sy0 = 0.34 + r * 0.17
            note_col = ("FFE97F", "FFD0D0", "C8F2DA")[(i + r) % 3]
            _fill_rect(img, cx0 + 0.03, sy0, cx1 - 0.03, sy0 + 0.13, note_col)
            _draw_line(img, cx0 + 0.05, sy0 + 0.04, cx1 - 0.06, sy0 + 0.04, 0.008, "56606A")
            _draw_line(img, cx0 + 0.05, sy0 + 0.08, cx1 - 0.10, sy0 + 0.08, 0.008, "7C8690")

    # Bottom KPI mini chart
    _draw_text_box(img, "월간 지표 목표 달성률 94%", 0.05, 0.77, 0.56, 0.92, "223040", align_x="LEFT", bold=True)
    for bi, bh in enumerate((0.06, 0.09, 0.12, 0.15, 0.18)):
        bx0 = 0.62 + bi * 0.065
        _fill_rect(img, bx0, 0.94 - bh, bx0 + 0.042, 0.94, "2E6BC6" if bi < 4 else "24A062")
    return img, np.zeros_like(relief), _make_orm(h, w, 0.22), emissive


def _paint_subway_station_sign(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    """Authentic Seoul Metro Line 2 station sign (2호선 성수역)."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    em = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb("FAFBFD")
    em[:, :] = _rgb("E8EEF2") * 0.78

    # Seoul Metro Line 2 green horizontal band
    line_green = "00A84D"
    _fill_rect(img, 0.0, 0.42, 1.0, 0.58, line_green)
    _fill_rect(em, 0.0, 0.42, 1.0, 0.58, line_green, alpha=0.95)
    # Station number pill
    _fill_rect(img, 0.38, 0.36, 0.62, 0.64, line_green)
    _fill_rect(em, 0.38, 0.36, 0.62, 0.64, line_green, alpha=0.95)
    _draw_border(img, 0.38, 0.36, 0.62, 0.64, 0.018, "FFFFFF")
    _draw_text_box(img, "211", 0.40, 0.39, 0.60, 0.61, "FFFFFF", emissive=em, emissive_scale=1.0, bold=True)

    # Main station name
    _draw_text_box(img, "성 수", 0.16, 0.08, 0.84, 0.34, "161A1E", bold=True)
    _draw_text_box(img, "Seongsu · 聖水", 0.22, 0.67, 0.78, 0.82, "2D343C", bold=True)
    # Prev / next stations
    _draw_text_box(img, "◀ 건대입구", 0.04, 0.44, 0.35, 0.56, "FFFFFF", emissive=em, emissive_scale=0.9, align_x="LEFT", bold=True)
    _draw_text_box(img, "뚝섬 ▶", 0.65, 0.44, 0.96, 0.56, "FFFFFF", emissive=em, emissive_scale=0.9, align_x="RIGHT", bold=True)
    _draw_border(img, 0.015, 0.015, 0.985, 0.985, 0.016, "283038")
    return img, np.zeros_like(relief), _make_orm(h, w, 0.20), em


def _paint_subway_route_map(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    """Seoul Metro Line 2 linear route map & screen-door safety notice."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb("F8FAFC")
    _fill_rect(img, 0.0, 0.0, 1.0, 0.20, "00A84D")
    _draw_text_box(img, "서울 지하철 2호선 노선안내 · 승차위치 4-2", 0.05, 0.03, 0.95, 0.17, "FFFFFF", bold=True)

    # Linear station bar with dots
    _fill_rect(img, 0.06, 0.46, 0.94, 0.51, "00A84D")
    stations = ("시청", "을지로", "왕십리", "성수", "건대", "잠실", "강남")
    for idx, st in enumerate(stations):
        sx = 0.09 + idx * (0.82 / (len(stations) - 1))
        is_here = st == "성수"
        _draw_circle(img, sx, 0.485, 0.030 if is_here else 0.019, "D83228" if is_here else "FFFFFF")
        _draw_circle(img, sx, 0.485, 0.030 if is_here else 0.019, "00A84D", ring_thickness=0.008)
        _draw_text_box(img, st, sx - 0.065, 0.55, sx + 0.065, 0.68, "1A2228", bold=is_here)

    _fill_rect(img, 0.05, 0.74, 0.95, 0.93, "FFF3CD")
    _draw_text_box(img, "안전문(스크린도어)에 기대지 마세요", 0.08, 0.77, 0.92, 0.90, "5A3D0A", bold=True)
    return img, np.zeros_like(relief), _make_orm(h, w, 0.30), emissive


def _paint_hospital_sign(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
    *,
    is_emissive: bool = True,
    header: str = "내과 병동 · 간호사실",
    body: str = "301 ~ 312호   |   검사실 ▶",
) -> TileArrays:
    """Clean Korean hospital corridor wayfinding signboard."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    em = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb("F4F9FA")
    if is_emissive:
        em[:, :] = _rgb("E0F0F2") * 0.78

    _fill_rect(img, 0.0, 0.0, 1.0, 0.38, "197E88")
    if is_emissive:
        _fill_rect(em, 0.0, 0.0, 1.0, 0.38, "197E88", alpha=0.92)
    # Medical cross badge
    _fill_rect(img, 0.06, 0.09, 0.16, 0.29, "FFFFFF")
    _fill_rect(img, 0.095, 0.11, 0.125, 0.27, "197E88")
    _fill_rect(img, 0.075, 0.175, 0.145, 0.205, "197E88")
    _draw_text_box(
        img,
        header,
        0.19,
        0.07,
        0.95,
        0.32,
        "FFFFFF",
        emissive=em if is_emissive else None,
        emissive_scale=0.95 if is_emissive else 0.0,
        align_x="LEFT",
        bold=True,
    )
    _draw_text_box(
        img,
        body,
        0.06,
        0.46,
        0.94,
        0.86,
        "1B3338",
        emissive=em if is_emissive else None,
        emissive_scale=0.35 if is_emissive else 0.0,
        bold=True,
    )
    _draw_border(img, 0.015, 0.015, 0.985, 0.985, 0.015, "197E88")
    return img, np.zeros_like(relief), _make_orm(h, w, 0.25), em


def _paint_monitor_ui(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
    *,
    title: str = "TOONSTUDIO · WORKSPACE",
    accent: str = "3B82F6",
    dark_bg: str = "18202C",
) -> TileArrays:
    """Crisp desktop monitor / TV screen UI graphic (non-slop architectural dark UI)."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    em = np.zeros((h, w, 3), dtype=np.float32)
    bg = _rgb(dark_bg)
    img[:, :] = bg
    em[:, :] = bg * 0.95
    # Top toolbar
    _fill_rect(img, 0.0, 0.0, 1.0, 0.12, "243042")
    _fill_rect(em, 0.0, 0.0, 1.0, 0.12, "243042", alpha=0.95)
    _draw_text_box(img, title, 0.05, 0.02, 0.90, 0.10, "EAF0F6", emissive=em, emissive_scale=0.9, align_x="LEFT", bold=True)
    # Left sidebar + center viewport + right panel
    _fill_rect(img, 0.03, 0.16, 0.22, 0.94, "202B3A")
    _fill_rect(img, 0.25, 0.16, 0.76, 0.94, "28364A")
    _fill_rect(img, 0.79, 0.16, 0.97, 0.94, "202B3A")
    _fill_rect(em, 0.25, 0.16, 0.76, 0.94, "2D3E55", alpha=0.85)
    # Clean chart / artwork inside center pane
    _fill_rect(img, 0.30, 0.24, 0.71, 0.56, accent)
    _fill_rect(em, 0.30, 0.24, 0.71, 0.56, accent, alpha=0.75)
    _draw_circle(img, 0.50, 0.40, 0.10, "F8E4B0")
    _draw_circle(em, 0.50, 0.40, 0.10, "F8E4B0", alpha=0.85)
    for row in range(4):
        ry = 0.62 + row * 0.07
        _fill_rect(img, 0.30, ry, 0.68 - row * 0.06, ry + 0.035, "A8BED4")
        _fill_rect(em, 0.30, ry, 0.68 - row * 0.06, ry + 0.035, "A8BED4", alpha=0.7)
    return img, np.zeros_like(relief), _make_orm(h, w, 0.14), em


def _paint_convenience_fascia(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    """Korean 24-hour convenience store illuminated brand fascia (24시 편의점)."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    em = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb("FAFBFD")
    em[:, :] = _rgb("F2F7FA") * 0.92
    # Iconic 3-band convenience store stripes (emerald, warm amber, deep cobalt)
    _fill_rect(img, 0.0, 0.0, 1.0, 0.18, "009E60")
    _fill_rect(img, 0.0, 0.18, 1.0, 0.27, "F59E0B")
    _fill_rect(img, 0.0, 0.80, 1.0, 1.0, "1B3E78")
    _fill_rect(em, 0.0, 0.0, 1.0, 0.18, "00A866", alpha=0.95)
    _fill_rect(em, 0.0, 0.18, 1.0, 0.27, "FFA818", alpha=0.95)
    _fill_rect(em, 0.0, 0.80, 1.0, 1.0, "1E4B94", alpha=0.92)
    _draw_text_box(img, "24시 편의점 · TOON24", 0.06, 0.31, 0.94, 0.76, "14305C", emissive=em, emissive_scale=0.65, bold=True)
    _draw_text_box(img, "OPEN 24 HOURS · 도시락 · 원두커피 · ATM", 0.08, 0.83, 0.92, 0.97, "FFFFFF", emissive=em, emissive_scale=0.95, bold=True)
    return img, np.zeros_like(relief), _make_orm(h, w, 0.18), em


def _paint_book_collage(
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
    *,
    title: str,
    subtitle: str,
    cover_hex: str = "EAE2D2",
    band_hex: str = "345A4C",
    font_style: str = "gothic",
) -> TileArrays:
    """Editorial book cover / magazine / notebook graphic tile."""
    h, w = albedo.shape[:2]
    img = np.zeros((h, w, 3), dtype=np.float32)
    img[:, :] = _rgb(cover_hex)
    _fill_rect(img, 0.0, 0.0, 1.0, 0.28, band_hex)
    _draw_border(img, 0.04, 0.04, 0.96, 0.96, 0.015, "2B2824", alpha=0.65)
    _draw_text_box(img, title, 0.08, 0.05, 0.92, 0.24, "FFFFFF", font_style=font_style, bold=True)
    _draw_text_box(img, subtitle, 0.08, 0.36, 0.92, 0.72, "2A2622", font_style=font_style, bold=True, space_line=1.28)
    _fill_rect(img, 0.12, 0.78, 0.88, 0.80, band_hex)
    _draw_text_box(img, "SEOUL EDITION", 0.14, 0.83, 0.86, 0.92, "5C544B")
    return img, relief * 0.35, _make_orm(h, w, 0.78), emissive


# Declarative built-in 12-scene tile theme registry (v1 6 scenes + v2 6 scenes)
def _build_builtin_scene_themes() -> Dict[str, Dict[str, TilePainter]]:
    return {
        # -------------------- Hero BG v1 (6 scenes) --------------------
        "kr_modern_apartment_living": {
            "paper_label": lambda a, r, o, e: _paint_poster_atelier(
                a, r, o, e, title="SEOUL ATELIER", subtitle="2026 · BOTANICAL ARCHIVE", bg_hex="F5F0E6", accent_a="4D6B57", accent_b="C77756", accent_c="DFBE7A"
            ),
            "chalkboard": lambda a, r, o, e: _paint_poster_atelier(
                a, r, o, e, title="SEOUL ATELIER", subtitle="2026 · BOTANICAL ARCHIVE", bg_hex="F5F0E6", accent_a="4D6B57", accent_b="C77756", accent_c="DFBE7A"
            ),
            "paper_book": lambda a, r, o, e: _paint_book_collage(
                a, r, o, e, title="월간 건축", subtitle="서울의 빛과 공간\nAUTUMN ISSUE", cover_hex="F2ECE0", band_hex="4E5F54"
            ),
            "emissive_neon": lambda a, r, o, e: _paint_monitor_ui(
                a, r, o, e, title="SEOUL LIVE · 19:20 · 22°C", accent="4A7C9E", dark_bg="1A222D"
            ),
            "asphalt": lambda a, r, o, e: _paint_monitor_ui(
                a, r, o, e, title="SEOUL LIVE · 19:20 · 22°C", accent="4A7C9E", dark_bg="1A222D"
            ),
            "emissive_amber": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="262C34", stripe_top_hex="D4A656", stripe_bot_hex="3A424E", title_ko="거실 22°C · 외출모드", subtitle="HOME IoT WALLPAD"
            ),
            "brick": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="262C34", stripe_top_hex="D4A656", stripe_bot_hex="3A424E", title_ko="거실 22°C · 외출모드", subtitle="HOME IoT WALLPAD", is_emissive=False
            ),
        },
        "kr_atelier_cafe_interior": {
            "chalkboard": _paint_cafe_chalkboard,
            "paper_label": lambda a, r, o, e: _paint_poster_atelier(
                a, r, o, e, title="ATELIER COFFEE", subtitle="성수동 로스터리 · HAND DRIP", bg_hex="F4EDE0", accent_a="224838", accent_b="C6764C", accent_c="D9B774"
            ),
            "marble": lambda a, r, o, e: _paint_poster_atelier(
                a, r, o, e, title="ATELIER COFFEE", subtitle="성수동 로스터리 · HAND DRIP", bg_hex="F4EDE0", accent_a="224838", accent_b="C6764C", accent_c="D9B774"
            ),
            "paper_book": lambda a, r, o, e: _paint_book_collage(
                a, r, o, e, title="오늘의 원두", subtitle="에티오피아 예가체프\n아메리카노 4.5\n크루아상 4.2", cover_hex="252C29", band_hex="224838"
            ),
            "asphalt": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="1F3F31", stripe_top_hex="D2AE6D", stripe_bot_hex="D2AE6D", title_ko="성수 아틀리에 커피", subtitle="SEONGSU ATELIER ROASTERY · SINCE 2019", title_hex="FAF3E0", sub_hex="DFC48C", is_emissive=False, aspect_bias=0.22, bold_dilate=2
            ),
            "emissive_amber": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="1F3F31", stripe_top_hex="D2AE6D", stripe_bot_hex="D2AE6D", title_ko="성수 아틀리에 커피", subtitle="SEONGSU ATELIER ROASTERY · SINCE 2019", title_hex="FAF3E0", sub_hex="DFC48C", aspect_bias=0.22, bold_dilate=2
            ),
            "emissive_neon": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="222726", stripe_top_hex="E6B86A", stripe_bot_hex="2F5B48", title_ko="OPEN · 핸드드립", subtitle="SPECIALTY ESPRESSO BAR", title_hex="FFE7B8", sub_hex="DCECE2"
            ),
            "emissive_exit_green": _paint_exit_sign,
        },
        "kr_highschool_classroom_corridor": {
            "chalkboard": _paint_classroom_chalkboard,
            "paper_label": _paint_classroom_timetable,
            "brick": _paint_classroom_timetable,
            "paper_book": _paint_class_motto,
            "marble": _paint_class_motto,
            "emissive_exit_green": _paint_exit_sign,
            "emissive_neon": lambda a, r, o, e: _paint_monitor_ui(
                a, r, o, e, title="2학년 3반 학사안내 · 기말고사 D-14", accent="2E7454", dark_bg="1A2624"
            ),
            "asphalt": lambda a, r, o, e: _paint_monitor_ui(
                a, r, o, e, title="2학년 3반 학사안내 · 기말고사 D-14", accent="2E7454", dark_bg="1A2624"
            ),
        },
        "kr_school_rooftop_hero": {
            "emissive_neon": lambda a, r, o, e: _paint_vending_front(a, r, o, e, header="시원한 음료 · 24H", accent_hex="CC322C"),
            "paper_label": _paint_rooftop_warning,
            "chalkboard": _paint_rooftop_warning,
            "emissive_exit_green": _paint_exit_sign,
            "paper_book": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="F4F2EC", stripe_top_hex="2A72B8", stripe_bot_hex="389258", title_ko="분리수거함", subtitle="플라스틱 · 캔/유리 · 일반", title_hex="1E262E", sub_hex="FFFFFF", is_emissive=False
            ),
        },
        "kr_seoul_alley_street_hero": {
            "emissive_neon": lambda a, r, o, e: _paint_vending_front(a, r, o, e, header="24시 음료 자판기", accent_hex="2264A8"),
            "chalkboard": lambda a, r, o, e: _paint_vertical_sign(
                a, r, o, e, bg_hex="F6F0E4", border_hex="214D3B", text_hex="1B3B2E", header_hex="214D3B", header_text="CAFE", vertical_chars="성수커피", footer_text="1F"
            ),
            "carpet": lambda a, r, o, e: _paint_vertical_sign(
                a, r, o, e, bg_hex="FFF6E2", border_hex="D97218", text_hex="2B2118", header_hex="E07418", header_text="24H", vertical_chars="편의점", footer_text="MART"
            ),
            "marble": lambda a, r, o, e: _paint_vertical_sign(
                a, r, o, e, bg_hex="FFF1EE", border_hex="C4363C", text_hex="5A181C", header_hex="C8383E", header_text="분식", vertical_chars="김밥라면", footer_text="떡볶이"
            ),
            "floor_wood": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="214436", stripe_top_hex="D8B468", stripe_bot_hex="D8B468", title_ko="성수 로스터리 · 24시 마트", subtitle="SEONGSU ROASTERY & CORNER MART", title_hex="FAF3E0", sub_hex="E6CE96", is_emissive=False, aspect_bias=0.20, bold_dilate=2
            ),
            "emissive_amber": lambda a, r, o, e: _paint_vertical_sign(
                a, r, o, e, bg_hex="FFF6E2", border_hex="D97218", text_hex="2B2118", header_hex="E07418", header_text="24H", vertical_chars="편의점", footer_text="MART"
            ),
            "emissive_rose": lambda a, r, o, e: _paint_vertical_sign(
                a, r, o, e, bg_hex="FFF1EE", border_hex="C4363C", text_hex="5A181C", header_hex="C8383E", header_text="분식", vertical_chars="김밥라면", footer_text="떡볶이"
            ),
            "emissive_exit_green": lambda a, r, o, e: _paint_vertical_sign(
                a, r, o, e, bg_hex="EDFBF2", border_hex="188A4B", text_hex="125C34", header_hex="188A4B", header_text="OPEN", vertical_chars="서울약국", footer_text="24시"
            ),
            "paper_label": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="F5EFE2", stripe_top_hex="8F3E32", stripe_bot_hex="3A444C", title_ko="을지로 공방 · 동네 서점", subtitle="EULJIRO BOOK & COFFEE · 10:00~22:00", title_hex="24201E", sub_hex="F2E6D0", is_emissive=False
            ),
            "paper_book": lambda a, r, o, e: _paint_book_collage(
                a, r, o, e, title="오늘의 메뉴", subtitle="아메리카노 3.5\n김밥 · 떡볶이 4.5\n24시 영업", cover_hex="262B30", band_hex="B84638"
            ),
        },
        "rofan_imperial_palace_hall_balcony": {
            "paper_label": _paint_imperial_crest,
            "chalkboard": _paint_imperial_crest,
            "paper_book": _paint_imperial_crest,
        },
        # -------------------- Hero BG v2 (6 new scenes) --------------------
        "kr_modern_office_suite": {
            "chalkboard": _paint_office_whiteboard,
            "paper_label": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="F4F6F9", stripe_top_hex="254E8A", stripe_bot_hex="CBD5E1", title_ko="14F · 회의실 A", subtitle="PRODUCT DESIGN & ENGINEERING", title_hex="182230", sub_hex="243448", is_emissive=False
            ),
            "emissive_neon": lambda a, r, o, e: _paint_monitor_ui(
                a, r, o, e, title="TOONSTUDIO · Q4 ANALYTICS DASHBOARD", accent="2E6BC6", dark_bg="161F2C"
            ),
            "emissive_exit_green": _paint_exit_sign,
            "paper_book": lambda a, r, o, e: _paint_book_collage(
                a, r, o, e, title="DESIGN SPEC", subtitle="2026 프로젝트 기획서\nREV 4.2", cover_hex="F2F5F8", band_hex="254E8A"
            ),
        },
        "kr_seoul_subway_train_platform": {
            "emissive_neon": _paint_subway_station_sign,
            "emissive_amber": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="161A1E", stripe_top_hex="00A84D", stripe_bot_hex="2C343C", title_ko="이번 열차: 성수행  2분 전", subtitle="다음 열차: 잠실 · 강남행  6분 전", title_hex="FFB830", sub_hex="98E4B0"
            ),
            "paper_label": _paint_subway_route_map,
            "emissive_exit_green": lambda a, r, o, e: _paint_exit_sign(a, r, o, e, label_ko="3번 출구", label_en="EXIT 3"),
            "enamel_gloss": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="F2F5F8", stripe_top_hex="00A84D", stripe_bot_hex="00A84D", title_ko="노약자석 · 2114", subtitle="PRIORITY SEAT · SEOUL METRO", title_hex="1C242C", sub_hex="FFFFFF", is_emissive=False
            ),
        },
        "kr_hospital_ward_corridor": {
            "emissive_neon": lambda a, r, o, e: _paint_hospital_sign(a, r, o, e, is_emissive=True, header="내과 병동 · 간호사실", body="301 ~ 312호   |   검사실 ▶"),
            "paper_label": lambda a, r, o, e: _paint_hospital_sign(a, r, o, e, is_emissive=False, header="302호 병실 · 정숙", body="면회시간 12:00 ~ 14:00 · 손위생 필수"),
            "emissive_amber": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="1B5E68", stripe_top_hex="F2C94C", stripe_bot_hex="1B5E68", title_ko="간호사실", subtitle="NURSE STATION · 3F WARD", title_hex="FFFFFF", sub_hex="FFE8A0"
            ),
            "emissive_exit_green": _paint_exit_sign,
            "chalkboard": lambda a, r, o, e: _paint_hospital_sign(a, r, o, e, is_emissive=False, header="병동 회진 일정", body="오전 09:00 회진  ·  오후 16:00 처치"),
        },
        "rofan_noble_study_parlor": {
            "paper_label": _paint_imperial_crest,
            "paper_book": lambda a, r, o, e: _paint_book_collage(
                a, r, o, e, title="DUCAL ARCHIVE", subtitle="공작가 영지 지도\n고서 · 연대기", cover_hex="EFE5CE", band_hex="5A2E24", font_style="myungjo"
            ),
            "chalkboard": lambda a, r, o, e: _paint_poster_atelier(
                a, r, o, e, title="CELESTIAL MAP", subtitle="천체 성좌도 · IMPERIAL OBSERVATORY", bg_hex="222834", accent_a="2C3A4E", accent_b="8C6A3A", accent_c="E4C478"
            ),
        },
        "kr_rooftop_studio_oneroom": {
            "paper_label": lambda a, r, o, e: _paint_poster_atelier(
                a, r, o, e, title="2026 · 11월", subtitle="SEOUL INDIE LIVE · 옥탑방 작업실", bg_hex="FAF3E8", accent_a="3B5E78", accent_b="D86A54", accent_c="F0C468"
            ),
            "emissive_neon": lambda a, r, o, e: _paint_monitor_ui(
                a, r, o, e, title="TOONSTUDIO CANVAS · EP.12 마감", accent="D47258", dark_bg="1D1E26"
            ),
            "paper_book": lambda a, r, o, e: _paint_book_collage(
                a, r, o, e, title="웹툰 콘티북", subtitle="12화 연출 노트\nSTORYBOARD", cover_hex="F6EFE2", band_hex="C45C46"
            ),
        },
        "kr_convenience_store_night": {
            "emissive_neon": _paint_convenience_fascia,
            "emissive_amber": lambda a, r, o, e: _paint_vertical_sign(
                a, r, o, e, bg_hex="FFF8E8", border_hex="E07A12", text_hex="1E2634", header_hex="E07A12", header_text="1+1", vertical_chars="도시락커피", footer_text="1,500원"
            ),
            "emissive_rose": lambda a, r, o, e: _paint_horizontal_fascia(
                a, r, o, e, bg_hex="9E2236", stripe_top_hex="FFD166", stripe_bot_hex="FFD166", title_ko="24H 즉석라면 · 어묵", subtitle="HOT SNACK & COFFEE BAR", title_hex="FFF6E8", sub_hex="FFE39E"
            ),
            "paper_label": lambda a, r, o, e: _paint_vending_front(a, r, o, e, header="음료 · 유제품 · 스낵", accent_hex="009E60"),
            "emissive_exit_green": _paint_exit_sign,
        },
    }


SCENE_TILE_GRAPHIC_THEMES: Dict[str, Dict[str, TilePainter]] = _build_builtin_scene_themes()


def get_scene_graphic_tiles(scene_slug: Optional[str]) -> FrozenSet[str]:
    """Return the set of tile names that have scene-specific graphics for ``scene_slug``."""
    if not scene_slug:
        return frozenset()
    tiles = set(SCENE_TILE_GRAPHIC_THEMES.get(scene_slug, {}).keys())
    for slug, tname in _CUSTOM_SCENE_PAINTERS:
        if slug == scene_slug:
            tiles.add(tname)
    return frozenset(tiles)


def _apply_scene_tile_graphic(
    scene_slug: Optional[str],
    tile_name: str,
    albedo: np.ndarray,
    relief: np.ndarray,
    orm: np.ndarray,
    emissive: np.ndarray,
) -> TileArrays:
    if not scene_slug:
        return albedo, relief, orm, emissive
    painter = _CUSTOM_SCENE_PAINTERS.get((scene_slug, tile_name))
    if painter is None:
        painter = SCENE_TILE_GRAPHIC_THEMES.get(scene_slug, {}).get(tile_name)
    if painter is None:
        return albedo, relief, orm, emissive
    return painter(albedo, relief, orm, emissive)


# ---------------------------------------------------------------------------
# Vectorized procedural PBR+Toon surface tile synthesis
# ---------------------------------------------------------------------------


def _periodic_noise(u: np.ndarray, v: np.ndarray, nx: int, ny: int, seed: int) -> np.ndarray:
    """Tileable 2D value noise with smoothstep interpolation."""
    grid = np.random.default_rng(seed).random((ny, nx), dtype=np.float32)
    x = u * nx
    y = v * ny
    i = np.floor(x).astype(np.int32)
    j = np.floor(y).astype(np.int32)
    a = (x - i).astype(np.float32)
    b = (y - j).astype(np.float32)
    a = a * a * (3.0 - 2.0 * a)
    b = b * b * (3.0 - 2.0 * b)
    i0 = i % nx
    i1 = (i + 1) % nx
    j0 = j % ny
    j1 = (j + 1) % ny
    top = grid[j0, i0] * (1.0 - a) + grid[j0, i1] * a
    bot = grid[j1, i0] * (1.0 - a) + grid[j1, i1] * a
    return top * (1.0 - b) + bot * b


def _quantize_toon_albedo(rgb: np.ndarray, levels: float = 16.0, blend: float = 0.25) -> np.ndarray:
    """Subtle stylized webtoon value smoothing so PBR surfaces stay clean in cel shading."""
    stepped = np.round(rgb * levels) / levels
    return np.clip(rgb * (1.0 - blend) + stepped * blend, 0.0, 1.0)


def _synthesize_tile(
    tile_name: str,
    cell_size: int,
    seed_offset: int = 0,
    scene_slug: Optional[str] = None,
) -> TileArrays:
    """Synthesize (albedo_rgb, relief_h, orm_rgb, emissive_rgb) for one tile.

    Albedo uses high-value neutral/clean base colors designed to multiply cleanly
    with per-vertex ``Tint`` (COLOR_0) so each scene controls its genre palette.
    When ``scene_slug`` registers a graphic compositor for ``tile_name``, crisp
    Korean signage/menu/chalkboard/poster artwork is composited cleanly onto the cell.
    ORM packs ``R = Ambient Occlusion, G = Roughness, B = Metallic``.
    """
    yy, xx = np.indices((cell_size, cell_size), dtype=np.float32)
    u = xx / float(cell_size)
    # Flip v so row 0 in UV space maps cleanly onto image bottom
    v = 1.0 - yy / float(cell_size)

    h = abs(hash(tile_name)) % 10000 + seed_offset * 97
    n_coarse = _periodic_noise(u, v, 4, 4, h + 11)
    n_med = _periodic_noise(u, v, 14, 14, h + 29)
    n_fine = _periodic_noise(u, v, 48, 48, h + 53)

    ones = np.ones((cell_size, cell_size), dtype=np.float32)
    zeros = np.zeros((cell_size, cell_size), dtype=np.float32)

    albedo = np.ones((cell_size, cell_size, 3), dtype=np.float32) * 0.94
    relief = np.zeros((cell_size, cell_size), dtype=np.float32)
    ao = np.ones((cell_size, cell_size), dtype=np.float32)
    rough = np.full((cell_size, cell_size), 0.78, dtype=np.float32)
    metal = zeros.copy()
    emissive = np.zeros((cell_size, cell_size, 3), dtype=np.float32)

    if tile_name in ("plaster", "ceiling_plaster", "paper_book", "paper_label"):
        grain = (n_coarse - 0.5) * 0.04 + (n_med - 0.5) * 0.03 + (n_fine - 0.5) * 0.02
        base = 0.96 if "paper" in tile_name else 0.94
        albedo = np.clip(base + grain[..., None], 0.80, 1.0) * np.array([1.0, 0.995, 0.985], dtype=np.float32)
        relief = 0.14 * n_med + 0.08 * n_fine
        rough = np.clip(0.84 + 0.07 * n_med, 0.72, 0.96)
        ao = np.clip(1.0 - 0.05 * (1.0 - n_med), 0.88, 1.0)

    elif tile_name in ("concrete", "ceiling_concrete", "stone_plinth", "stone_prop", "asphalt"):
        speck = _periodic_noise(u, v, 72, 72, h + 71)
        mottle = (n_coarse - 0.5) * 0.10 + (n_med - 0.5) * 0.07 + (speck - 0.5) * 0.05
        seam_v = (np.abs(v - 0.5) < 0.008).astype(np.float32)
        seam_u = (np.abs(u - 0.5) < 0.008).astype(np.float32)
        seam = np.maximum(seam_v, seam_u) if "concrete" in tile_name else zeros
        val = 0.84 if tile_name != "asphalt" else 0.72
        albedo = np.clip(val + mottle[..., None] - 0.10 * seam[..., None], 0.45, 0.98) * np.array(
            [0.98, 0.98, 0.97], dtype=np.float32
        )
        relief = 0.24 * n_med + 0.18 * speck - 0.45 * seam
        rough = np.clip(0.85 + 0.09 * n_fine, 0.72, 0.98)
        ao = np.clip(1.0 - 0.22 * seam - 0.06 * (1.0 - n_coarse), 0.70, 1.0)

    elif tile_name in (
        "floor_wood",
        "wood_panel",
        "door_wood",
        "wood_oak",
        "wood_walnut",
        "wood_birch",
        "wood_prop",
        "ceiling_wood",
    ):
        # Stylized directional timber grain with crisp plank joints for webtoon interiors
        warp = (n_coarse - 0.5) * 0.04 + (n_med - 0.5) * 0.015
        ring = 0.5 + 0.5 * np.cos(math.tau * ((v + warp) * 18.0 + 0.35 * n_coarse))
        fiber = _periodic_noise(u, v, 8, 64, h + 101)
        plank_count = 4 if tile_name in ("floor_wood", "wood_panel", "ceiling_wood") else 2
        plank_pos = (v * plank_count) % 1.0
        joint = ((plank_pos < 0.025) | (plank_pos > 0.975)).astype(np.float32)
        plank_id = np.floor(v * plank_count)
        plank_var = 0.04 * np.sin(plank_id * 2.7 + 0.5)
        tone = 0.92 + plank_var + (fiber - 0.5) * 0.09 - 0.07 * (ring**3) - 0.16 * joint
        if tile_name == "wood_walnut":
            tint = np.array([0.86, 0.80, 0.74], dtype=np.float32)
        elif tile_name == "wood_birch":
            tint = np.array([1.0, 0.98, 0.94], dtype=np.float32)
        else:
            tint = np.array([0.98, 0.94, 0.88], dtype=np.float32)
        albedo = np.clip(tone[..., None] * tint, 0.45, 1.0)
        relief = 0.16 * fiber - 0.08 * (ring**2) - 0.55 * joint
        rough = np.clip(0.46 + 0.12 * fiber + 0.24 * joint, 0.30, 0.88)
        ao = np.clip(1.0 - 0.28 * joint, 0.68, 1.0)

    elif tile_name in ("tile_ceramic", "ceramic_gloss", "ceramic_matte"):
        grid_n = 4 if tile_name == "tile_ceramic" else 1
        if grid_n > 1:
            gx = (u * grid_n) % 1.0
            gy = (v * grid_n) % 1.0
            grout = ((gx < 0.045) | (gx > 0.955) | (gy < 0.045) | (gy > 0.955)).astype(np.float32)
        else:
            grout = zeros
        sub = 0.96 + (n_coarse - 0.5) * 0.04 - 0.16 * grout
        albedo = np.clip(sub[..., None], 0.65, 1.0) * np.array([0.99, 0.99, 0.98], dtype=np.float32)
        relief = 0.05 * n_med - 0.55 * grout
        base_r = 0.58 if tile_name == "ceramic_matte" else 0.22
        rough = np.clip(base_r + 0.58 * grout + 0.04 * n_fine, 0.14, 0.92)
        ao = np.clip(1.0 - 0.26 * grout, 0.70, 1.0)

    elif tile_name == "marble":
        vein_field = np.sin(math.tau * (u * 2.2 + v * 1.4 + 0.45 * n_coarse + 0.18 * n_med))
        vein = np.exp(-((vein_field / 0.14) ** 2)).astype(np.float32)
        albedo = np.clip((0.97 - 0.16 * vein + (n_coarse - 0.5) * 0.04)[..., None], 0.70, 1.0) * np.array(
            [0.99, 0.985, 0.98], dtype=np.float32
        )
        relief = 0.04 * n_med - 0.05 * vein
        rough = np.clip(0.18 + 0.08 * vein + 0.03 * n_fine, 0.12, 0.42)
        ao = np.clip(1.0 - 0.06 * vein, 0.90, 1.0)

    elif tile_name == "brick":
        rows = 6
        cols = 3
        row_idx = np.floor(v * rows)
        u_shift = (u * cols + 0.5 * (row_idx % 2)) % 1.0
        v_cell = (v * rows) % 1.0
        mortar = ((u_shift < 0.06) | (u_shift > 0.94) | (v_cell < 0.11) | (v_cell > 0.89)).astype(np.float32)
        brick_var = 0.06 * np.sin(row_idx * 1.9 + np.floor(u * cols + 0.5 * (row_idx % 2)) * 3.1)
        face_val = 0.90 + brick_var + (n_med - 0.5) * 0.08
        mortar_val = 0.74 + (n_fine - 0.5) * 0.04
        val = face_val * (1.0 - mortar) + mortar_val * mortar
        albedo = np.clip(val[..., None], 0.55, 1.0) * np.array([1.0, 0.97, 0.95], dtype=np.float32)
        relief = (0.20 * n_med + 0.10 * n_fine) * (1.0 - mortar) - 0.65 * mortar
        rough = np.clip(0.80 + 0.12 * mortar + 0.06 * n_fine, 0.68, 0.96)
        ao = np.clip(1.0 - 0.30 * mortar, 0.66, 1.0)

    elif tile_name in ("trim_paint", "wood_painted", "ceiling_beam", "laminate_matte", "plastic_matte", "enamel_gloss", "chalkboard"):
        micro = (n_coarse - 0.5) * 0.03 + (n_fine - 0.5) * 0.015
        albedo = np.clip(0.96 + micro[..., None], 0.84, 1.0) * ones[..., None]
        relief = 0.05 * n_fine
        if tile_name == "enamel_gloss":
            rough = np.clip(0.22 + 0.04 * n_med, 0.16, 0.34)
        elif tile_name == "chalkboard":
            rough = np.clip(0.76 + 0.08 * n_coarse, 0.66, 0.88)
        elif tile_name in ("trim_paint", "wood_painted", "ceiling_beam"):
            rough = np.clip(0.38 + 0.06 * n_med, 0.28, 0.52)
        else:
            rough = np.clip(0.48 + 0.06 * n_med, 0.36, 0.62)

    elif tile_name in ("fabric_linen", "fabric_velvet", "fabric_canvas", "fabric_prop", "carpet", "carpet_plush"):
        freq = 36.0 if "carpet" in tile_name else 52.0
        warp = 0.5 + 0.5 * np.sin(math.tau * u * freq)
        weft = 0.5 + 0.5 * np.sin(math.tau * v * freq)
        weave = 0.5 * (warp + weft)
        tone = 0.93 + (n_coarse - 0.5) * 0.05 + (weave - 0.5) * 0.07
        albedo = np.clip(tone[..., None], 0.72, 1.0) * ones[..., None]
        relief = 0.22 * weave + 0.10 * n_med
        rough = np.clip((0.91 if "carpet" in tile_name else 0.86) + 0.05 * weave, 0.76, 0.98)
        ao = np.clip(1.0 - 0.10 * (1.0 - weave), 0.84, 1.0)

    elif tile_name in ("leather", "rubber_dark"):
        pebble = _periodic_noise(u, v, 42, 42, h + 131)
        albedo = np.clip((0.92 + (pebble - 0.5) * 0.06)[..., None], 0.75, 1.0) * ones[..., None]
        relief = 0.18 * pebble
        rough = np.clip((0.86 if tile_name == "rubber_dark" else 0.44) + 0.08 * pebble, 0.32, 0.94)

    elif tile_name in ("foliage", "foliage_prop"):
        rib = 0.5 + 0.5 * np.cos(math.tau * (u * 10.0 + 0.3 * n_coarse))
        albedo = np.clip((0.92 + (n_med - 0.5) * 0.08 + (rib - 0.5) * 0.05)[..., None], 0.74, 1.0) * ones[..., None]
        relief = 0.16 * rib + 0.10 * n_med
        rough = np.clip(0.54 + 0.08 * n_med, 0.40, 0.70)

    elif tile_name in (
        "sash_metal",
        "hardware_brass",
        "metal_leg_dark",
        "metal_leg_steel",
        "metal_brass_trim",
        "steel_brushed",
        "iron_dark",
        "aluminum_satin",
        "brass_polished",
        "copper_patina",
        "galvanized_zinc",
        "ceiling_metal",
        "ceiling_brass",
        "mirror_chrome",
    ):
        brush = _periodic_noise(u, v, 6, 96, h + 167)
        albedo = np.clip((0.94 + (brush - 0.5) * 0.06 + (n_coarse - 0.5) * 0.04)[..., None], 0.76, 1.0) * ones[..., None]
        relief = 0.10 * brush + 0.04 * n_med
        if tile_name == "mirror_chrome":
            rough = np.full((cell_size, cell_size), 0.06, dtype=np.float32)
            metal = np.full((cell_size, cell_size), 0.98, dtype=np.float32)
        elif "brass" in tile_name or "copper" in tile_name:
            rough = np.clip(0.24 + 0.07 * brush, 0.16, 0.40)
            metal = np.full((cell_size, cell_size), 0.94, dtype=np.float32)
        elif "steel" in tile_name or "aluminum" in tile_name:
            rough = np.clip(0.26 + 0.08 * brush, 0.18, 0.42)
            metal = np.full((cell_size, cell_size), 0.92, dtype=np.float32)
        elif tile_name == "galvanized_zinc":
            spangle = _periodic_noise(u, v, 24, 24, h + 193)
            albedo = np.clip((0.88 + (spangle - 0.5) * 0.14)[..., None], 0.68, 0.98) * ones[..., None]
            rough = np.clip(0.42 + 0.12 * spangle, 0.28, 0.64)
            metal = np.full((cell_size, cell_size), 0.80, dtype=np.float32)
        else:
            rough = np.clip(0.36 + 0.08 * brush, 0.24, 0.52)
            metal = np.full((cell_size, cell_size), 0.85, dtype=np.float32)

    elif tile_name in ("glass_tinted", "glass_clear", "glass_frosted", "glass_warm", "glass_prop"):
        # Clean diagonal architectural sky-reflection band for opaque/semi-gloss glazing
        sheen = np.exp(-((((u + v * 0.65) - 0.85) / 0.22) ** 2)).astype(np.float32)
        if tile_name == "glass_warm":
            base_col = np.array([0.96, 0.88, 0.72], dtype=np.float32)
            emissive = np.broadcast_to(np.array([0.28, 0.22, 0.13], dtype=np.float32), albedo.shape).copy()
        else:
            base_col = np.array([0.80, 0.90, 0.95], dtype=np.float32)
        albedo = np.clip(base_col + 0.14 * sheen[..., None], 0.0, 1.0)
        relief = 0.02 * n_fine if tile_name == "glass_frosted" else zeros
        rough = np.full((cell_size, cell_size), 0.34 if tile_name == "glass_frosted" else 0.08, dtype=np.float32)
        metal = np.full((cell_size, cell_size), 0.12, dtype=np.float32)

    elif tile_name.startswith("emissive_"):
        palette = {
            "emissive_warm": np.array([1.0, 0.91, 0.74], dtype=np.float32),
            "emissive_cool": np.array([0.93, 0.97, 1.0], dtype=np.float32),
            "emissive_neon": np.array([1.0, 0.84, 0.55], dtype=np.float32),
            "emissive_exit_green": np.array([0.32, 0.92, 0.54], dtype=np.float32),
            "emissive_amber": np.array([1.0, 0.72, 0.34], dtype=np.float32),
            "emissive_rose": np.array([1.0, 0.52, 0.64], dtype=np.float32),
        }
        col = palette.get(tile_name, np.array([1.0, 0.94, 0.82], dtype=np.float32))
        vignette = 0.94 + 0.06 * (1.0 - np.clip(np.hypot(u - 0.5, v - 0.5) * 1.4, 0.0, 1.0))
        albedo = np.clip(col * vignette[..., None], 0.0, 1.0)
        emissive = np.clip(col * vignette[..., None], 0.0, 1.0)
        rough = np.full((cell_size, cell_size), 0.20, dtype=np.float32)
        metal = zeros.copy()

    orm = np.stack((ao, rough, metal), axis=-1)

    # Composite scene-specific Korean signage / chalkboard / menu / poster artwork if registered
    has_custom = tile_name in get_scene_graphic_tiles(scene_slug)
    if has_custom:
        albedo, relief, orm, emissive = _apply_scene_tile_graphic(
            scene_slug, tile_name, albedo, relief, orm, emissive
        )
        albedo = np.clip(albedo, 0.0, 1.0)
        emissive = np.clip(emissive, 0.0, 1.0)
    else:
        albedo = _quantize_toon_albedo(albedo, levels=20.0, blend=0.20)

    return albedo, relief, orm, emissive


def _relief_to_normal(relief: np.ndarray, strength: float = 0.65) -> np.ndarray:
    """Convert scalar relief heightfield to tangent-space RGB normal map [0, 1]."""
    dx = (np.roll(relief, -1, axis=1) - np.roll(relief, 1, axis=1)) * strength
    dy = (np.roll(relief, -1, axis=0) - np.roll(relief, 1, axis=0)) * strength
    normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
    norm = np.linalg.norm(normal, axis=-1, keepdims=True)
    normal = normal / np.maximum(norm, 1e-6)
    return 0.5 + 0.5 * normal


def _pad_tile_gutter(tile: np.ndarray, margin_px: int) -> np.ndarray:
    """Inset tile content by ``margin_px`` and bleed edge pixels outward into the gutter."""
    if margin_px <= 0:
        return tile
    h, w = tile.shape[:2]
    inner_h = max(4, h - 2 * margin_px)
    inner_w = max(4, w - 2 * margin_px)
    ys = np.linspace(0, h - 1, inner_h).astype(np.int32)
    xs = np.linspace(0, w - 1, inner_w).astype(np.int32)
    core = tile[np.ix_(ys, xs)]
    if tile.ndim == 3:
        out = np.pad(core, ((margin_px, margin_px), (margin_px, margin_px), (0, 0)), mode="edge")
    else:
        out = np.pad(core, ((margin_px, margin_px), (margin_px, margin_px)), mode="edge")
    return out[:h, :w]


def _bake_atlas_arrays(
    atlas_name: str,
    resolution: int,
    has_emissive: bool,
    margin: float = ATLAS_UV_MARGIN,
    scene_slug: Optional[str] = None,
) -> Dict[str, np.ndarray]:
    """Assemble full 4x4 atlas arrays (albedo, normal, orm, optional emissive)."""
    if resolution % ATLAS_GRID_COLS != 0 or resolution % ATLAS_GRID_ROWS != 0:
        raise ValueError(f"Atlas resolution {resolution} must be divisible by 4")
    layout = ATLAS_TILE_LAYOUTS[atlas_name]
    cell_px = resolution // ATLAS_GRID_COLS
    margin_px = max(2, int(round(margin * resolution)))

    albedo_full = np.zeros((resolution, resolution, 3), dtype=np.float32)
    normal_full = np.zeros((resolution, resolution, 3), dtype=np.float32)
    orm_full = np.zeros((resolution, resolution, 3), dtype=np.float32)
    emissive_full = np.zeros((resolution, resolution, 3), dtype=np.float32) if has_emissive else None

    for idx, tile_name in enumerate(layout):
        col = idx % ATLAS_GRID_COLS
        row = idx // ATLAS_GRID_COLS  # UV row 0 = bottom
        # Image row 0 is top, so UV row maps to image y_top = (3 - row) * cell_px
        img_row = (ATLAS_GRID_ROWS - 1) - row
        y0 = img_row * cell_px
        y1 = y0 + cell_px
        x0 = col * cell_px
        x1 = x0 + cell_px

        t_albedo, t_relief, t_orm, t_emissive = _synthesize_tile(
            tile_name,
            cell_px,
            seed_offset=idx,
            scene_slug=scene_slug,
        )
        t_normal = _relief_to_normal(t_relief)

        albedo_full[y0:y1, x0:x1] = _pad_tile_gutter(t_albedo, margin_px)
        normal_full[y0:y1, x0:x1] = _pad_tile_gutter(t_normal, margin_px)
        orm_full[y0:y1, x0:x1] = _pad_tile_gutter(t_orm, margin_px)
        if emissive_full is not None:
            emissive_full[y0:y1, x0:x1] = _pad_tile_gutter(t_emissive, margin_px)

    result: Dict[str, np.ndarray] = {
        "albedo": albedo_full,
        "normal": normal_full,
        "orm": orm_full,
    }
    if emissive_full is not None:
        result["emissive"] = emissive_full
    return result


# ---------------------------------------------------------------------------
# Blender 5.3 Material Construction with Packed Images & glTF AO Output
# ---------------------------------------------------------------------------


def _ensure_gltf_ao_node_group() -> bpy.types.NodeTree:
    """Ensure standard ``glTF Material Output`` node group exists for ORM AO export."""
    group_name = "glTF Material Output"
    existing = bpy.data.node_groups.get(group_name)
    if existing is not None:
        return existing
    group = bpy.data.node_groups.new(group_name, "ShaderNodeTree")
    group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return group


def _load_packed_image(path: Path, name: str, colorspace: str) -> bpy.types.Image:
    """Load a PNG from disk, assign colorspace, and pack it into Blender memory."""
    old = bpy.data.images.get(name)
    if old is not None and old.users == 0:
        bpy.data.images.remove(old)
    img = bpy.data.images.load(str(path), check_existing=False)
    img.name = name
    img.colorspace_settings.name = colorspace
    img.pack()
    return img


def build_atlas_material(
    atlas_name: str,
    *,
    resolution: int = 1024,
    has_emissive: bool = False,
    emissive_strength: float = 1.6,
    alpha_mode: str = "OPAQUE",
    alpha_value: float = 1.0,
    use_vertex_tint: bool = True,
    texture_dir: Path | None = None,
    scene_slug: str | None = None,
    force_rebuild: bool = False,
) -> bpy.types.Material:
    """Bake procedural PBR+Toon maps and wire a Blender 5.3 Principled BSDF material."""
    slug_key = scene_slug or ""
    existing = bpy.data.materials.get(atlas_name)
    if existing is not None and not force_rebuild and existing.get("ts_scene_slug", "") == slug_key:
        return existing

    maps = _bake_atlas_arrays(
        atlas_name,
        resolution=resolution,
        has_emissive=has_emissive,
        scene_slug=scene_slug,
    )

    if existing is not None:
        mat = existing
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        out_node = nodes.new("ShaderNodeOutputMaterial")
        out_node.location = (320, 120)
        principled = nodes.new("ShaderNodeBsdfPrincipled")
        principled.location = (0, 120)
        links.new(principled.outputs["BSDF"], out_node.inputs["Surface"])
    else:
        mat = bpy.data.materials.new(name=atlas_name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        principled = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")

    mat["ts_scene_slug"] = slug_key
    mat.use_backface_culling = False
    principled.inputs["Alpha"].default_value = alpha_value
    if alpha_mode == "BLEND" and hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"

    def _downsample_2x(img_u8: np.ndarray) -> np.ndarray:
        h, w = img_u8.shape[:2]
        if h <= 1024 and w <= 1024:
            return img_u8
        if img_u8.ndim == 3:
            c = img_u8.shape[2]
            return img_u8[: (h // 2) * 2, : (w // 2) * 2].reshape(h // 2, 2, w // 2, 2, c).mean(axis=(1, 3)).astype(np.uint8)
        return img_u8[: (h // 2) * 2, : (w // 2) * 2].reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3)).astype(np.uint8)

    def _wire_maps(work_dir: Path) -> None:
        albedo_path = work_dir / f"{atlas_name}_albedo.png"
        normal_path = work_dir / f"{atlas_name}_normal.png"
        orm_path = work_dir / f"{atlas_name}_orm.png"

        # Albedo는 2048px 한글 간판·칠판·재질 선명도 유지, Normal/ORM은 최대 1024px로 저장해
        # 웹 BG3D admission 게이트(decoded RGBA <= 100 MiB)를 여유 있게 통과한다(76 MiB).
        save_png(albedo_path, maps["albedo"])
        save_png(normal_path, _downsample_2x(maps["normal"]))
        save_png(orm_path, _downsample_2x(maps["orm"]))

        # Base Color (+ optional Vertex Color Tint multiply)
        tex_albedo = nodes.new("ShaderNodeTexImage")
        tex_albedo.location = (-720, 320)
        tex_albedo.image = _load_packed_image(albedo_path, f"{atlas_name}_Albedo", "sRGB")

        if use_vertex_tint:
            vcol = nodes.new("ShaderNodeVertexColor")
            vcol.location = (-720, 560)
            vcol.layer_name = "Tint"
            mix = nodes.new("ShaderNodeMix")
            mix.location = (-360, 380)
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            in_a = next(s for s in mix.inputs if s.name == "A" and s.type == "RGBA")
            in_b = next(s for s in mix.inputs if s.name == "B" and s.type == "RGBA")
            out_r = next(s for s in mix.outputs if s.name == "Result" and s.type == "RGBA")
            links.new(vcol.outputs["Color"], in_a)
            links.new(tex_albedo.outputs["Color"], in_b)
            links.new(out_r, principled.inputs["Base Color"])
        else:
            links.new(tex_albedo.outputs["Color"], principled.inputs["Base Color"])

        # ORM (R=AO, G=Roughness, B=Metallic)
        tex_orm = nodes.new("ShaderNodeTexImage")
        tex_orm.location = (-720, 20)
        tex_orm.image = _load_packed_image(orm_path, f"{atlas_name}_ORM", "Non-Color")

        sep = nodes.new("ShaderNodeSeparateColor")
        sep.location = (-400, 20)
        links.new(tex_orm.outputs["Color"], sep.inputs["Color"])
        links.new(sep.outputs["Green"], principled.inputs["Roughness"])
        links.new(sep.outputs["Blue"], principled.inputs["Metallic"])

        ao_group_node = nodes.new("ShaderNodeGroup")
        ao_group_node.location = (-120, -220)
        ao_group_node.node_tree = _ensure_gltf_ao_node_group()
        links.new(sep.outputs["Red"], ao_group_node.inputs["Occlusion"])

        # Normal Map
        tex_norm = nodes.new("ShaderNodeTexImage")
        tex_norm.location = (-720, -280)
        tex_norm.image = _load_packed_image(normal_path, f"{atlas_name}_Normal", "Non-Color")

        norm_map = nodes.new("ShaderNodeNormalMap")
        norm_map.location = (-360, -280)
        norm_map.inputs["Strength"].default_value = 0.75
        links.new(tex_norm.outputs["Color"], norm_map.inputs["Color"])
        links.new(norm_map.outputs["Normal"], principled.inputs["Normal"])

        # Optional Emissive Map
        if has_emissive and "emissive" in maps:
            emissive_path = work_dir / f"{atlas_name}_emissive.png"
            save_png(emissive_path, maps["emissive"])
            tex_emissive = nodes.new("ShaderNodeTexImage")
            tex_emissive.location = (-720, -580)
            tex_emissive.image = _load_packed_image(emissive_path, f"{atlas_name}_Emissive", "sRGB")
            links.new(tex_emissive.outputs["Color"], principled.inputs["Emission Color"])
            principled.inputs["Emission Strength"].default_value = emissive_strength

    if texture_dir is not None:
        texture_dir.mkdir(parents=True, exist_ok=True)
        _wire_maps(texture_dir)
    else:
        with tempfile.TemporaryDirectory(prefix="ts_atlas_") as tmp:
            _wire_maps(Path(tmp))

    return mat


def create_desktop_atlas_materials(
    *,
    primary_size: int = 2048,
    secondary_size: int = 1024,
    texture_dir: Path | None = None,
    scene_slug: str | None = None,
    force_rebuild: bool = False,
) -> Dict[str, bpy.types.Material]:
    """Create the 4 canonical Desktop Hero PBR+Toon atlas materials.

    Pass ``scene_slug`` (e.g. ``"kr_atelier_cafe_interior"``, ``"kr_seoul_subway_train_platform"``)
    to bake scene-specific Korean signage, chalkboard, menu, and poster tiles into the
    existing 4-material atlas budget (zero extra draw calls).
    """
    return {
        MAT_ARCH_TRIM: build_atlas_material(
            MAT_ARCH_TRIM,
            resolution=primary_size,
            has_emissive=False,
            texture_dir=texture_dir,
            scene_slug=scene_slug,
            force_rebuild=force_rebuild,
        ),
        MAT_WOOD_FABRIC: build_atlas_material(
            MAT_WOOD_FABRIC,
            resolution=primary_size,
            has_emissive=False,
            texture_dir=texture_dir,
            scene_slug=scene_slug,
            force_rebuild=force_rebuild,
        ),
        MAT_METAL_HARDWARE: build_atlas_material(
            MAT_METAL_HARDWARE,
            resolution=secondary_size,
            has_emissive=False,
            texture_dir=texture_dir,
            scene_slug=scene_slug,
            force_rebuild=force_rebuild,
        ),
        MAT_GLASS_EMISSIVE: build_atlas_material(
            MAT_GLASS_EMISSIVE,
            resolution=secondary_size,
            has_emissive=True,
            emissive_strength=1.8,
            alpha_mode="OPAQUE",
            texture_dir=texture_dir,
            scene_slug=scene_slug,
            force_rebuild=force_rebuild,
        ),
    }


def create_mobile_atlas_materials(
    *,
    opaque_size: int = 1024,
    glass_size: int = 512,
    texture_dir: Path | None = None,
    scene_slug: str | None = None,
    force_rebuild: bool = False,
) -> Dict[str, bpy.types.Material]:
    """Create the 2 canonical Mobile Hero PBR+Toon atlas materials.

    Supports ``scene_slug`` so illuminated Korean signage tiles in ``MAT_MOBILE_GLASS``
    match Desktop Hero assets within the strict 2-material Mobile budget.
    """
    return {
        MAT_MOBILE_OPAQUE: build_atlas_material(
            MAT_MOBILE_OPAQUE,
            resolution=opaque_size,
            has_emissive=False,
            texture_dir=texture_dir,
            scene_slug=scene_slug,
            force_rebuild=force_rebuild,
        ),
        MAT_MOBILE_GLASS: build_atlas_material(
            MAT_MOBILE_GLASS,
            resolution=glass_size,
            has_emissive=True,
            emissive_strength=1.8,
            alpha_mode="OPAQUE",
            texture_dir=texture_dir,
            scene_slug=scene_slug,
            force_rebuild=force_rebuild,
        ),
    }


def list_atlas_tiles(atlas_name: str) -> Sequence[str]:
    """Return ordered list of all 16 tile names registered for ``atlas_name``."""
    return ATLAS_TILE_LAYOUTS[atlas_name]
