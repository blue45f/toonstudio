"""Procedural PBR+Toon atlas generator and Blender 5.3 material library.

Generates deterministic, CC0-original 4x4 tiled PBR+Toon texture atlases
using pure NumPy and zlib PNG encoding (zero external dependencies like PIL):

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
import struct
import tempfile
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Mapping, Sequence, Tuple

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
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Synthesize (albedo_rgb, relief_h, orm_rgb, emissive_rgb) for one tile.

    Albedo uses high-value neutral/clean base colors designed to multiply cleanly
    with per-vertex ``Tint`` (COLOR_0) so each scene controls its genre palette.
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

    albedo = _quantize_toon_albedo(albedo, levels=20.0, blend=0.20)
    orm = np.stack((ao, rough, metal), axis=-1)
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

        t_albedo, t_relief, t_orm, t_emissive = _synthesize_tile(tile_name, cell_px, seed_offset=idx)
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
) -> bpy.types.Material:
    """Bake procedural PBR+Toon maps and wire a Blender 5.3 Principled BSDF material."""
    existing = bpy.data.materials.get(atlas_name)
    if existing is not None:
        return existing

    maps = _bake_atlas_arrays(atlas_name, resolution=resolution, has_emissive=has_emissive)

    mat = bpy.data.materials.new(name=atlas_name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    principled = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    principled.inputs["Alpha"].default_value = alpha_value
    if alpha_mode == "BLEND" and hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"

    def _wire_maps(work_dir: Path) -> None:
        albedo_path = work_dir / f"{atlas_name}_albedo.png"
        normal_path = work_dir / f"{atlas_name}_normal.png"
        orm_path = work_dir / f"{atlas_name}_orm.png"

        save_png(albedo_path, maps["albedo"])
        save_png(normal_path, maps["normal"])
        save_png(orm_path, maps["orm"])

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
) -> Dict[str, bpy.types.Material]:
    """Create the 4 canonical Desktop Hero PBR+Toon atlas materials.

    Returns dict keyed by ``MAT_ARCH_TRIM``, ``MAT_WOOD_FABRIC``,
    ``MAT_METAL_HARDWARE``, and ``MAT_GLASS_EMISSIVE``.
    """
    return {
        MAT_ARCH_TRIM: build_atlas_material(
            MAT_ARCH_TRIM,
            resolution=primary_size,
            has_emissive=False,
            texture_dir=texture_dir,
        ),
        MAT_WOOD_FABRIC: build_atlas_material(
            MAT_WOOD_FABRIC,
            resolution=primary_size,
            has_emissive=False,
            texture_dir=texture_dir,
        ),
        MAT_METAL_HARDWARE: build_atlas_material(
            MAT_METAL_HARDWARE,
            resolution=secondary_size,
            has_emissive=False,
            texture_dir=texture_dir,
        ),
        MAT_GLASS_EMISSIVE: build_atlas_material(
            MAT_GLASS_EMISSIVE,
            resolution=secondary_size,
            has_emissive=True,
            emissive_strength=1.8,
            alpha_mode="OPAQUE",
            texture_dir=texture_dir,
        ),
    }


def create_mobile_atlas_materials(
    *,
    opaque_size: int = 1024,
    glass_size: int = 512,
    texture_dir: Path | None = None,
) -> Dict[str, bpy.types.Material]:
    """Create the 2 canonical Mobile Hero PBR+Toon atlas materials.

    Returns dict keyed by ``MAT_MOBILE_OPAQUE`` and ``MAT_MOBILE_GLASS``.
    """
    return {
        MAT_MOBILE_OPAQUE: build_atlas_material(
            MAT_MOBILE_OPAQUE,
            resolution=opaque_size,
            has_emissive=False,
            texture_dir=texture_dir,
        ),
        MAT_MOBILE_GLASS: build_atlas_material(
            MAT_MOBILE_GLASS,
            resolution=glass_size,
            has_emissive=True,
            emissive_strength=1.8,
            alpha_mode="OPAQUE",
            texture_dir=texture_dir,
        ),
    }


def list_atlas_tiles(atlas_name: str) -> Sequence[str]:
    """Return ordered list of all 16 tile names registered for ``atlas_name``."""
    return ATLAS_TILE_LAYOUTS[atlas_name]
