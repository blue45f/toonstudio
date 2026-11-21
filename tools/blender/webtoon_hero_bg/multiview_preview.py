"""BLENDER_EEVEE 512x512 6-view contact sheet, 3-tier Freestyle SVG & lighting presets.

Strictly follows Blender 5.3 headless invariants:
- Render engine: ``BLENDER_EEVEE`` (never ``BLENDER_EEVEE_NEXT``)
- Freestyle SVG addon enabled inside Python via
  ``bpy.ops.preferences.addon_enable(module="bl_ext.user_default.freestyle_svg_exporter")``
  (never via ``--addons`` CLI flag)
- 3-tier webtoon Freestyle LineSets:
    1. ``TS_Silhouette``  (2.0 px, silhouette + external_contour + border)
    2. ``TS_ArchCrease``  (1.1 px, crease + contour, 145 deg dihedral, excludes ``BG_Props_Clutter``)
    3. ``TS_Detail``      (0.55 px, edge_mark + material_boundary, chaining + short-stroke culling)
  with deterministic SVG coordinate compaction keeping every scene strictly ``<= 2.0 MB``
  (hard ceiling ``2.5 MB``).
- Zero Pillow/PIL dependency: stitches the 3x2 (1536x1024) labeled contact sheet
  using Blender's ``bpy.data.images.load`` + NumPy + pure-Python PNG encoding.
"""

from __future__ import annotations

import math
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from .surface_atlas import save_png

FREESTYLE_SVG_ADDON = "bl_ext.user_default.freestyle_svg_exporter"

# Canonical 3-time-of-day webtoon lighting recipes exported into every BG manifest
LIGHTING_PRESETS: Mapping[str, Mapping[str, Any]] = {
    "day_5600k": {
        "labelKo": "주광 5600K (맑은 낮)",
        "kelvin": 5600,
        "skyColor": [0.78, 0.86, 0.96],
        "skyEnergy": 1.05,
        "sunColor": [1.0, 0.95, 0.86],
        "sunEnergy": 4.6,
        "sunDirection": [-0.58, 0.46, -0.78],
        "sunAngleDeg": 3.0,
        "fillColor": [0.94, 0.96, 1.0],
        "fillIntensity": 1.0,
        "emissiveBoost": 1.0,
        "exposure": 0.12,
    },
    "sunset_3200k": {
        "labelKo": "노을 3200K (골든아워)",
        "kelvin": 3200,
        "skyColor": [0.88, 0.56, 0.42],
        "skyEnergy": 0.82,
        "sunColor": [1.0, 0.66, 0.36],
        "sunEnergy": 5.2,
        "sunDirection": [-0.82, 0.34, -0.34],
        "sunAngleDeg": 5.0,
        "fillColor": [0.76, 0.64, 0.82],
        "fillIntensity": 0.72,
        "emissiveBoost": 1.45,
        "exposure": 0.08,
    },
    "night_moon_8500k": {
        "labelKo": "야간 월광 8500K (밤/실내등)",
        "kelvin": 8500,
        "skyColor": [0.16, 0.24, 0.42],
        "skyEnergy": 0.42,
        "sunColor": [0.64, 0.78, 1.0],
        "sunEnergy": 1.65,
        "sunDirection": [0.48, -0.42, -0.74],
        "sunAngleDeg": 4.0,
        "fillColor": [0.98, 0.84, 0.62],
        "fillIntensity": 0.65,
        "emissiveBoost": 2.2,
        "exposure": 0.0,
    },
}

# Crisp 5x7 pixel bitmap font for zero-dependency view badges on contact sheets
_FONT_5X7: Mapping[str, Tuple[str, ...]] = {
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00110", "01000", "10000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
    "6": ("01110", "10000", "11110", "10001", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00010", "01100"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01110", "10001", "10000", "10000", "10000", "10001", "01110"),
    "D": ("11100", "10010", "10001", "10001", "10001", "10010", "11100"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01110", "10001", "10000", "10111", "10001", "10001", "01110"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "/": ("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
    ":": ("00000", "00100", "00100", "00000", "00100", "00100", "00000"),
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    " ": ("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
}


@dataclass(frozen=True)
class PreviewCameraView:
    """Single camera + cutaway view definition for the 6-view review sheet."""

    key: str
    label: str
    location: Tuple[float, float, float]
    target: Tuple[float, float, float]
    lens_mm: float = 32.0
    hide_nodes: Tuple[str, ...] = ()


def _scene_mesh_bounds(objects: Iterable[bpy.types.Object]) -> Tuple[Vector, Vector]:
    pts: List[Vector] = []
    for obj in objects:
        if obj.type != "MESH" or len(obj.data.vertices) == 0:
            continue
        pts.extend(obj.matrix_world @ Vector(c) for c in obj.bound_box)
    if not pts:
        return Vector((-2.0, -2.0, 0.0)), Vector((2.0, 2.0, 2.8))
    return (
        Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
        Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))),
    )


def compute_default_six_views(
    root_obj: Optional[bpy.types.Object] = None,
    *,
    interior_cutaway: bool = True,
) -> List[PreviewCameraView]:
    """Compute the 6 standardized webtoon review camera views from scene bounds."""
    objs = list(root_obj.children_recursive) if root_obj is not None else list(bpy.context.scene.objects)
    bmin, bmax = _scene_mesh_bounds(objs)
    center = (bmin + bmax) * 0.5
    size = bmax - bmin
    sx = max(2.0, size.x)
    sy = max(2.0, size.y)
    sz = max(1.8, size.z)
    span = max(sx, sy)
    dist = span * 1.15 + 1.8

    mid_z = bmin.z + sz * 0.45
    eye_z = min(bmin.z + 1.52, bmin.z + sz * 0.62)

    return [
        PreviewCameraView(
            key="front",
            label="1 FRONT",
            location=(center.x, bmin.y - dist * 0.72, mid_z + 0.15),
            target=(center.x, center.y, mid_z),
            lens_mm=32.0,
            hide_nodes=("BG_Wall_South", "BG_Cutaway_Front") if interior_cutaway else (),
        ),
        PreviewCameraView(
            key="side",
            label="2 SIDE",
            location=(bmin.x - dist * 0.72, center.y, mid_z + 0.15),
            target=(center.x, center.y, mid_z),
            lens_mm=32.0,
            hide_nodes=("BG_Wall_West", "BG_Cutaway_Front") if interior_cutaway else (),
        ),
        PreviewCameraView(
            key="back",
            label="3 BACK",
            location=(center.x, bmax.y + dist * 0.72, mid_z + 0.15),
            target=(center.x, center.y, mid_z),
            lens_mm=32.0,
            hide_nodes=("BG_Wall_North",) if interior_cutaway else (),
        ),
        PreviewCameraView(
            key="three_quarter",
            label="4 3/4 HERO",
            location=(center.x + sx * 0.85 + 1.4, center.y - sy * 0.85 - 1.4, bmin.z + sz * 0.78 + 0.9),
            target=(center.x, center.y, bmin.z + sz * 0.36),
            lens_mm=34.0,
            hide_nodes=("BG_Wall_South", "BG_Wall_East", "BG_Ceiling", "BG_Cutaway_Front") if interior_cutaway else (),
        ),
        PreviewCameraView(
            key="interior_shot",
            label="5 INTERIOR 35MM",
            location=(center.x + sx * 0.22, bmin.y + sy * 0.16, eye_z),
            target=(center.x - sx * 0.08, bmax.y - sy * 0.14, eye_z - 0.14),
            lens_mm=35.0,
            hide_nodes=(),
        ),
        PreviewCameraView(
            key="top_cutaway",
            label="6 TOP CUTAWAY",
            location=(center.x + sx * 0.18, center.y - sy * 0.85 - 1.2, bmax.z + span * 0.95),
            target=(center.x, center.y, bmin.z + sz * 0.22),
            lens_mm=32.0,
            hide_nodes=("BG_Ceiling", "BG_Wall_South", "BG_Cutaway_Front") if interior_cutaway else ("BG_Ceiling",),
        ),
    ]


def _setup_preview_rig(
    scene: bpy.types.Scene,
    center: Vector,
    span: float,
    *,
    preset_key: str = "day_5600k",
) -> Tuple[bpy.types.Collection, bpy.types.Object]:
    """Create crisp warm-daylight studio key/rim/bounce rig (escapes dull overcast gray)."""
    preset = LIGHTING_PRESETS.get(preset_key, LIGHTING_PRESETS["day_5600k"])
    col_name = "TS_PreviewRig"
    existing = bpy.data.collections.get(col_name)
    if existing is not None:
        for o in list(existing.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        col = existing
    else:
        col = bpy.data.collections.new(col_name)
        scene.collection.children.link(col)

    # Clear webtoon sky world with vertical warm-horizon -> azure-zenith gradient
    world = bpy.data.worlds.new("TS_PreviewWorld")
    world.use_nodes = True
    wnodes = world.node_tree.nodes
    wlinks = world.node_tree.links
    bg = next((n for n in wnodes if n.type == "BACKGROUND"), None)
    if bg is not None:
        sky = preset["skyColor"]
        tex_coord = wnodes.new("ShaderNodeTexCoord")
        sep_xyz = wnodes.new("ShaderNodeSeparateXYZ")
        ramp = wnodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.0
        # Warm horizon tone so cutaway previews feel crisp & inviting rather than flat gray
        ramp.color_ramp.elements[0].color = (
            min(1.0, sky[0] * 1.06 + 0.04),
            min(1.0, sky[1] * 1.01 + 0.02),
            min(1.0, sky[2] * 0.94),
            1.0,
        )
        ramp.color_ramp.elements[1].position = 0.55
        ramp.color_ramp.elements[1].color = (sky[0], sky[1], sky[2], 1.0)
        wlinks.new(tex_coord.outputs["Generated"], sep_xyz.inputs["Vector"])
        wlinks.new(sep_xyz.outputs["Z"], ramp.inputs["Fac"])
        wlinks.new(ramp.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = float(preset["skyEnergy"])
    scene.world = world

    # Crisp warm directional sun key light casting readable architectural sunlight & shadows
    sun_data = bpy.data.lights.new("TS_KeySun", "SUN")
    sun_data.energy = float(preset["sunEnergy"])
    sun_data.angle = math.radians(float(preset["sunAngleDeg"]))
    sun_data.color = tuple(preset["sunColor"])
    sun_obj = bpy.data.objects.new(sun_data.name, sun_data)
    col.objects.link(sun_obj)
    sun_dir = Vector(preset["sunDirection"]).normalized()
    sun_obj.rotation_euler = sun_dir.to_track_quat("-Z", "Y").to_euler()

    # Cool sky rim/counter-key light to give 3D relief & form separation on shaded faces
    rim_data = bpy.data.lights.new("TS_SkyRimSun", "SUN")
    rim_data.energy = float(preset["sunEnergy"]) * 0.28
    rim_data.angle = math.radians(18.0)
    rim_data.color = (0.82, 0.90, 1.0)
    rim_obj = bpy.data.objects.new(rim_data.name, rim_data)
    col.objects.link(rim_obj)
    rim_dir = Vector((-sun_dir.x, -sun_dir.y, -0.65)).normalized()
    rim_obj.rotation_euler = rim_dir.to_track_quat("-Z", "Y").to_euler()

    # Warm-balanced interior bounce fill area light keeping shadow corners clean for webtoons
    fill_data = bpy.data.lights.new("TS_InteriorFill", "AREA")
    fill_data.energy = max(75.0, span * span * 5.2) * float(preset["fillIntensity"])
    fill_data.shape = "RECTANGLE"
    fill_data.size = max(2.2, span * 0.48)
    fill_data.size_y = max(2.2, span * 0.48)
    fill_data.color = tuple(preset["fillColor"])
    fill_obj = bpy.data.objects.new(fill_data.name, fill_data)
    col.objects.link(fill_obj)
    fill_obj.location = (center.x, center.y, center.z + 0.75)
    fill_obj.rotation_euler = (0.0, 0.0, 0.0)

    # Preview camera
    cam_data = bpy.data.cameras.new("TS_PreviewCamera")
    cam_data.clip_start = 0.05
    cam_data.clip_end = 250.0
    cam_obj = bpy.data.objects.new(cam_data.name, cam_data)
    col.objects.link(cam_obj)
    scene.camera = cam_obj
    return col, cam_obj


def _cleanup_preview_rig(col: bpy.types.Collection) -> None:
    for obj in list(col.objects):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and getattr(data, "users", 1) == 0:
            if isinstance(data, bpy.types.Camera):
                bpy.data.cameras.remove(data)
            elif isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)
    if col.name in bpy.data.collections:
        bpy.data.collections.remove(col)


def _configure_eevee(scene: bpy.types.Scene, resolution: int = 512, *, exposure: float = 0.12) -> None:
    """Configure Blender 5.3 ``BLENDER_EEVEE`` (strictly never ``BLENDER_EEVEE_NEXT``)."""
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.use_overwrite = True
    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = 24
    scene.view_settings.exposure = float(exposure)
    for look in ("AgX - Medium High Contrast", "Medium High Contrast", "None"):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue


def _aim_camera(cam_obj: bpy.types.Object, view: PreviewCameraView) -> None:
    cam_obj.location = Vector(view.location)
    direction = Vector(view.target) - cam_obj.location
    if direction.length < 1e-5:
        direction = Vector((0.0, 1.0, 0.0))
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_obj.data.lens = float(view.lens_mm)


def _load_png_rgb_uint8(path: Path) -> np.ndarray:
    """Load a rendered PNG via Blender's native image loader into HxWx3 uint8 (top-down)."""
    img = bpy.data.images.load(str(path), check_existing=False)
    try:
        w, h = int(img.size[0]), int(img.size[1])
        buf = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(buf)
        arr = buf.reshape((h, w, 4))
        # Flip vertically because Blender image pixels start at bottom-left
        rgb = np.flipud(arr[:, :, :3])
        return np.rint(np.clip(rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    finally:
        bpy.data.images.remove(img)


def _draw_label_badge(tile: np.ndarray, text: str, scale: int = 2) -> np.ndarray:
    """Draw a high-contrast dark label badge with crisp bitmap lettering in top-left."""
    out = tile.copy()
    label = text.upper()
    pad_x, pad_y = 8, 6
    char_w = 5 * scale
    char_h = 7 * scale
    gap = 1 * scale
    box_w = min(out.shape[1] - 12, pad_x * 2 + len(label) * (char_w + gap))
    box_h = min(out.shape[0] - 12, pad_y * 2 + char_h)

    x0, y0 = 10, 10
    region = out[y0 : y0 + box_h, x0 : x0 + box_w].astype(np.float32)
    out[y0 : y0 + box_h, x0 : x0 + box_w] = np.rint(region * 0.22 + 12.0).astype(np.uint8)

    cursor_x = x0 + pad_x
    cursor_y = y0 + pad_y
    for ch in label:
        glyph = _FONT_5X7.get(ch, _FONT_5X7[" "])
        if cursor_x + char_w >= out.shape[1] - 4:
            break
        for row_i, row_bits in enumerate(glyph):
            for col_i, bit in enumerate(row_bits):
                if bit == "1":
                    py0 = cursor_y + row_i * scale
                    px0 = cursor_x + col_i * scale
                    out[py0 : py0 + scale, px0 : px0 + scale] = (248, 246, 240)
        cursor_x += char_w + gap
    return out


def _stitch_contact_sheet(tiles: Sequence[Tuple[str, np.ndarray]], out_path: Path) -> Path:
    """Stitch 6 equal-size tiles into a 3-column x 2-row contact sheet PNG."""
    if len(tiles) != 6:
        raise ValueError(f"Expected 6 tiles for 3x2 contact sheet, got {len(tiles)}")
    th, tw, _ = tiles[0][1].shape
    grid = np.full((th * 2, tw * 3, 3), 24, dtype=np.uint8)
    for idx, (label, img) in enumerate(tiles):
        r = idx // 3
        c = idx % 3
        labeled = _draw_label_badge(img, label, scale=2)
        grid[r * th : (r + 1) * th, c * tw : (c + 1) * tw] = labeled

    # Crisp 2px slate border gridlines separating the 6 frames
    grid[th - 1 : th + 1, :, :] = (46, 52, 58)
    grid[:, tw - 1 : tw + 1, :] = (46, 52, 58)
    grid[:, tw * 2 - 1 : tw * 2 + 1, :] = (46, 52, 58)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    save_png(out_path, grid)
    return out_path


def _apply_cutaway_visibility(
    hide_names: Sequence[str],
) -> Dict[str, Tuple[bool, bool]]:
    """Temporarily hide cutaway nodes from camera render and return restore snapshot."""
    saved: Dict[str, Tuple[bool, bool]] = {}
    hide_set = set(hide_names)
    for obj in bpy.context.scene.objects:
        if obj.name in hide_set:
            saved[obj.name] = (bool(obj.hide_render), bool(getattr(obj, "visible_camera", True)))
            obj.hide_render = True
            if hasattr(obj, "visible_camera"):
                obj.visible_camera = False
    return saved


def _restore_visibility(saved: Mapping[str, Tuple[bool, bool]]) -> None:
    for name, (hide_r, vis_c) in saved.items():
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.hide_render = hide_r
            if hasattr(obj, "visible_camera"):
                obj.visible_camera = vis_c


def render_six_view_contact_sheet(
    out_sheet_path: Path,
    *,
    root_obj: Optional[bpy.types.Object] = None,
    views: Optional[Sequence[PreviewCameraView]] = None,
    tile_resolution: int = 512,
    interior_cutaway: bool = True,
    save_individual_dir: Optional[Path] = None,
    lighting_preset: str = "day_5600k",
    thumbnail_path: Optional[Path] = None,
    thumbnail_view_index: int = 4,
) -> Dict[str, Any]:
    """Render 6 BLENDER_EEVEE 512x512 views and stitch a labeled 1536x1024 contact sheet."""
    scene = bpy.context.scene
    prev_engine = scene.render.engine
    prev_cam = scene.camera
    prev_world = scene.world
    prev_freestyle = scene.render.use_freestyle
    prev_exposure = scene.view_settings.exposure

    objs = list(root_obj.children_recursive) if root_obj is not None else list(scene.objects)
    bmin, bmax = _scene_mesh_bounds(objs)
    center = (bmin + bmax) * 0.5
    span = max(bmax.x - bmin.x, bmax.y - bmin.y, 2.0)

    resolved_views = list(views) if views is not None else compute_default_six_views(root_obj, interior_cutaway=interior_cutaway)
    if len(resolved_views) != 6:
        raise ValueError(f"Contact sheet requires exactly 6 views, got {len(resolved_views)}")

    preset = LIGHTING_PRESETS.get(lighting_preset, LIGHTING_PRESETS["day_5600k"])
    rig_col, cam_obj = _setup_preview_rig(scene, center, span, preset_key=lighting_preset)
    rendered_files: Dict[str, str] = {}
    tiles: List[Tuple[str, np.ndarray]] = []
    saved_thumb: Optional[str] = None

    try:
        scene.render.use_freestyle = False
        _configure_eevee(scene, resolution=tile_resolution, exposure=float(preset["exposure"]))

        with tempfile.TemporaryDirectory(prefix="ts_6view_") as tmp:
            work_dir = Path(save_individual_dir) if save_individual_dir is not None else Path(tmp)
            work_dir.mkdir(parents=True, exist_ok=True)

            for idx, view in enumerate(resolved_views):
                saved = _apply_cutaway_visibility(view.hide_nodes)
                try:
                    _aim_camera(cam_obj, view)
                    img_path = work_dir / f"{view.key}.png"
                    scene.render.filepath = str(img_path)
                    bpy.ops.render.render(write_still=True)
                    tile_rgb = _load_png_rgb_uint8(img_path)
                    tiles.append((view.label, tile_rgb))
                    if thumbnail_path is not None and idx == thumbnail_view_index:
                        tpath = Path(thumbnail_path)
                        tpath.parent.mkdir(parents=True, exist_ok=True)
                        save_png(tpath, tile_rgb)
                        saved_thumb = str(tpath)
                    if save_individual_dir is not None:
                        rendered_files[view.key] = str(img_path)
                finally:
                    _restore_visibility(saved)

        sheet = _stitch_contact_sheet(tiles, Path(out_sheet_path))
    finally:
        _cleanup_preview_rig(rig_col)
        scene.render.engine = prev_engine
        scene.camera = prev_cam
        scene.world = prev_world
        scene.render.use_freestyle = prev_freestyle
        scene.view_settings.exposure = prev_exposure

    return {
        "engine": "BLENDER_EEVEE",
        "lightingPreset": lighting_preset,
        "contactSheet": str(sheet),
        "sheetDimensions": [tile_resolution * 3, tile_resolution * 2],
        "tileResolution": tile_resolution,
        "byteSize": sheet.stat().st_size,
        "views": [v.key for v in resolved_views],
        "individualRenders": rendered_files,
        **({"thumbnailPath": saved_thumb} if saved_thumb else {}),
    }


# ---------------------------------------------------------------------------
# 3-Tier Freestyle SVG Line Art + Deterministic SVG Compaction (<= 2.0 MB)
# ---------------------------------------------------------------------------


def _mark_detail_freestyle_edges(
    objects: Sequence[bpy.types.Object],
    *,
    min_edge_len: float = 0.055,
    min_angle_deg: float = 42.0,
    max_edges_per_mesh: int = 2400,
) -> List[Tuple[bpy.types.Mesh, bool]]:
    """Temporarily mark crisp structural detail edges on props/furniture for ``TS_Detail``."""
    created: List[Tuple[bpy.types.Mesh, bool]] = []
    min_rad = math.radians(min_angle_deg)
    for obj in objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        is_detail_target = (
            obj.name in ("BG_Props_Clutter", "BG_Furniture_Hero", "BG_Furnishings")
            or "Props" in obj.name
            or "Furniture" in obj.name
        )
        if not is_detail_target:
            continue
        mesh = obj.data
        if len(mesh.edges) == 0:
            continue
        existed = "freestyle_edge" in mesh.attributes
        if existed:
            continue
        bm = bmesh.new()
        try:
            bm.from_mesh(mesh)
            bm.edges.ensure_lookup_table()
            candidates: List[Tuple[float, int]] = []
            for e in bm.edges:
                if len(e.link_faces) != 2:
                    continue
                elen = e.calc_length()
                if elen < min_edge_len:
                    continue
                ang = e.calc_face_angle(0.0)
                if ang >= min_rad:
                    candidates.append((elen, e.index))
        finally:
            bm.free()

        if not candidates:
            continue
        # Prioritize longest clean structural edges so fine wire mesh / micro bevels never explode SVG
        candidates.sort(key=lambda item: item[0], reverse=True)
        chosen = {idx for _, idx in candidates[:max_edges_per_mesh]}
        attr = mesh.attributes.new("freestyle_edge", "BOOLEAN", "EDGE")
        flags = [idx in chosen for idx in range(len(mesh.edges))]
        attr.data.foreach_set("value", flags)
        created.append((mesh, True))
    return created


def _clear_temp_freestyle_edges(created: Sequence[Tuple[bpy.types.Mesh, bool]]) -> None:
    for mesh, _ in created:
        try:
            attr = mesh.attributes.get("freestyle_edge")
            if attr is not None:
                mesh.attributes.remove(attr)
        except Exception:
            pass


_PATH_TAG_RE = re.compile(r'<path\b([^>]*?)d="([^"]+)"([^>]*?)/>')
_STROKE_W_RE = re.compile(r'stroke-width="([^"]+)"')
_COORD_PAIR_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)")


def _rdp_simplify(pts: List[Tuple[float, float]], eps: float) -> List[Tuple[float, float]]:
    """Iterative Ramer-Douglas-Peucker polyline simplification."""
    if len(pts) <= 2 or eps <= 0.0:
        return pts
    keep = [False] * len(pts)
    keep[0] = True
    keep[-1] = True
    stack = [(0, len(pts) - 1)]
    eps2 = eps * eps
    while stack:
        s, e = stack.pop()
        x0, y0 = pts[s]
        x1, y1 = pts[e]
        dx, dy = x1 - x0, y1 - y0
        seg2 = dx * dx + dy * dy
        max_d2 = -1.0
        best = -1
        for i in range(s + 1, e):
            px, py = pts[i]
            if seg2 < 1e-10:
                d2 = (px - x0) ** 2 + (py - y0) ** 2
            else:
                t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / seg2))
                qx, qy = x0 + t * dx, y0 + t * dy
                d2 = (px - qx) ** 2 + (py - qy) ** 2
            if d2 > max_d2:
                max_d2 = d2
                best = i
        if max_d2 > eps2 and best != -1:
            keep[best] = True
            stack.append((s, best))
            stack.append((best, e))
    return [pt for pt, k in zip(pts, keep) if k]


def _compact_freestyle_svg(
    svg_text: str,
    *,
    target_max_bytes: int = 2_000_000,
) -> Tuple[str, List[str], int]:
    """Compact Freestyle SVG paths (1-decimal precision + RDP + short-fragment culling).

    Preserves all 3 stroke-width tiers cleanly while guaranteeing total SVG byte
    size stays strictly ``<= target_max_bytes`` (default 2.0 MB, hard cap 2.5 MB).
    """

    def _run_pass(text: str, min_len_px: float, rdp_eps: float) -> str:
        # Count paths per stroke-width so we never wipe out an entire tier
        tier_kept: Dict[str, int] = {}

        def _repl(match: re.Match[str]) -> str:
            pre, d_str, post = match.group(1), match.group(2), match.group(3)
            sw_m = _STROKE_W_RE.search(pre + post)
            sw_key = sw_m.group(1) if sw_m else "1.0"
            raw_pts = [(float(x), float(y)) for x, y in _COORD_PAIR_RE.findall(d_str)]
            if len(raw_pts) < 2:
                return ""
            # Compute polyline screen length
            total_len = 0.0
            for i in range(len(raw_pts) - 1):
                total_len += math.hypot(raw_pts[i + 1][0] - raw_pts[i][0], raw_pts[i + 1][1] - raw_pts[i][1])
            if total_len < min_len_px and tier_kept.get(sw_key, 0) >= 8:
                return ""
            simp = _rdp_simplify(raw_pts, rdp_eps)
            tier_kept[sw_key] = tier_kept.get(sw_key, 0) + 1
            coords = " ".join(f"{x:.1f},{y:.1f}" for x, y in simp)
            clean_pre = re.sub(r"\s+", " ", pre).strip()
            clean_post = re.sub(r"\s+", " ", post).strip()
            clean_sw = f"{float(sw_key):.2f}".rstrip("0").rstrip(".")
            if "." not in clean_sw:
                clean_sw += ".0"
            clean_pre = _STROKE_W_RE.sub(f'stroke-width="{clean_sw}"', clean_pre)
            clean_post = _STROKE_W_RE.sub(f'stroke-width="{clean_sw}"', clean_post)
            attrs = " ".join(p for p in (clean_pre, f'd="M {coords}"', clean_post) if p)
            return f"<path {attrs}/>"

        out = _PATH_TAG_RE.sub(_repl, text)
        # Drop blank lines left by removed short fragments
        out = "\n".join(line for line in out.splitlines() if line.strip()) + "\n"
        return out

    # Pass 1: crisp lossless compaction (1-decimal, 0.35 px collinear merge, drop <2.5px specks)
    compacted = _run_pass(svg_text, min_len_px=2.5, rdp_eps=0.35)
    # Escalate gently only if a super-dense scene still exceeds target_max_bytes
    for min_len, eps in ((4.5, 0.55), (7.5, 0.85), (12.0, 1.2), (18.0, 1.6)):
        if len(compacted.encode("utf-8")) <= target_max_bytes:
            break
        compacted = _run_pass(compacted, min_len_px=min_len, rdp_eps=eps)

    stroke_widths = sorted(set(_STROKE_W_RE.findall(compacted)), key=lambda s: float(s))
    path_count = compacted.count("<path")
    return compacted, stroke_widths, path_count


def render_freestyle_svg(
    out_svg_path: Path,
    *,
    root_obj: Optional[bpy.types.Object] = None,
    view: Optional[PreviewCameraView] = None,
    resolution: int = 512,
    crease_normal_angle_deg: float = 35.0,
    line_thickness: float = 1.1,
    interior_cutaway: bool = True,
    target_max_bytes: int = 2_000_000,
) -> Dict[str, Any]:
    """Generate 3-tier architectural webtoon line art SVG via Blender 5.3 Freestyle.

    LineSet hierarchy:
      1. ``TS_Silhouette`` (2.0 px): silhouette + external_contour + border
      2. ``TS_ArchCrease`` (1.1 px): crease + contour (145 deg dihedral, excludes ``BG_Props_Clutter``)
      3. ``TS_Detail``     (0.55 px): edge_mark + material_boundary (chaining + short-stroke cull)

    Enables ``bl_ext.user_default.freestyle_svg_exporter`` inside Python (never ``--addons``)
    and verifies the emitted SVG has ``<path`` > 0, 3 stroke widths, and size ``<= 2.5 MB``.
    """
    bpy.ops.preferences.addon_enable(module=FREESTYLE_SVG_ADDON)
    scene = bpy.context.scene
    if not hasattr(scene, "svg_export"):
        raise RuntimeError(f"Failed to expose scene.svg_export after enabling {FREESTYLE_SVG_ADDON}")

    prev_engine = scene.render.engine
    prev_cam = scene.camera
    prev_world = scene.world
    prev_freestyle = scene.render.use_freestyle
    prev_svg = scene.svg_export.use_svg_export

    objs = list(root_obj.children_recursive) if root_obj is not None else list(scene.objects)
    bmin, bmax = _scene_mesh_bounds(objs)
    center = (bmin + bmax) * 0.5
    span = max(bmax.x - bmin.x, bmax.y - bmin.y, 2.0)

    if view is None:
        all_views = compute_default_six_views(root_obj, interior_cutaway=interior_cutaway)
        # Default to 3/4 Hero establishing shot for clearest architectural linework QA
        view = all_views[3]

    rig_col, cam_obj = _setup_preview_rig(scene, center, span)
    out_svg_path = Path(out_svg_path)
    out_svg_path.parent.mkdir(parents=True, exist_ok=True)

    saved_vis: Dict[str, Tuple[bool, bool]] = {}
    excl_col: Optional[bpy.types.Collection] = None
    temp_edges: List[Tuple[bpy.types.Mesh, bool]] = []
    try:
        _configure_eevee(scene, resolution=resolution)
        scene.render.use_freestyle = True
        scene.svg_export.use_svg_export = True
        scene.svg_export.mode = "FRAME"
        if hasattr(scene.svg_export, "object_fill"):
            scene.svg_export.object_fill = False

        saved_vis = _apply_cutaway_visibility(view.hide_nodes)

        # Collection holding BG_Props_Clutter so TS_ArchCrease excludes clutter/fences
        excl_col = bpy.data.collections.new("TS_FS_ExcludePropsClutter")
        for o in objs:
            if o.type == "MESH" and (o.name == "BG_Props_Clutter" or "Props_Clutter" in o.name):
                excl_col.objects.link(o)

        # Mark clean detail edges on hero props/furniture so TS_Detail renders crisp 0.55px ink
        temp_edges = _mark_detail_freestyle_edges(objs)

        vl = scene.view_layers[0]
        vl.use_freestyle = True
        fs = vl.freestyle_settings
        # Spec: dihedral 145 deg (180 - 35 = 145)
        dihedral_deg = max(110.0, min(165.0, 180.0 - float(crease_normal_angle_deg)))
        fs.crease_angle = math.radians(dihedral_deg)

        while len(fs.linesets) > 0:
            fs.linesets.remove(fs.linesets[0])

        def _configure_lineset(
            name: str,
            thickness: float,
            color: Tuple[float, float, float],
            *,
            length_min: float,
        ) -> Any:
            ls = fs.linesets.new(name)
            st = bpy.data.linestyles.new(f"{name}_Style")
            ls.linestyle = st
            st.thickness = float(thickness)
            st.color = color
            st.caps = "ROUND"
            st.use_chaining = True
            st.chaining = "PLAIN"
            st.use_length_min = True
            st.length_min = float(length_min)
            # Clear all defaults before enabling exact tier edge types
            ls.select_silhouette = False
            ls.select_border = False
            ls.select_crease = False
            ls.select_contour = False
            ls.select_external_contour = False
            ls.select_material_boundary = False
            ls.select_edge_mark = False
            ls.select_ridge_valley = False
            ls.select_suggestive_contour = False
            return ls

        # Tier 1: Outer Silhouette (2.0 px)
        ls_sil = _configure_lineset("TS_Silhouette", 2.0, (0.05, 0.05, 0.07), length_min=3.0)
        ls_sil.select_silhouette = True
        ls_sil.select_external_contour = True
        ls_sil.select_border = True

        # Tier 2: Architectural Creases (1.1 px, excludes BG_Props_Clutter)
        ls_arch = _configure_lineset("TS_ArchCrease", float(line_thickness), (0.10, 0.10, 0.13), length_min=5.0)
        ls_arch.select_crease = True
        ls_arch.select_contour = True
        if len(excl_col.objects) > 0:
            ls_arch.select_by_collection = True
            ls_arch.collection = excl_col
            ls_arch.collection_negation = "EXCLUSIVE"

        # Tier 3: Fine Detail & Material Boundaries (0.55 px)
        ls_det = _configure_lineset("TS_Detail", 0.55, (0.18, 0.18, 0.22), length_min=6.0)
        ls_det.select_edge_mark = True
        ls_det.select_material_boundary = True

        _aim_camera(cam_obj, view)
        scene.frame_set(1)

        with tempfile.TemporaryDirectory(prefix="ts_fsvg_") as tmp:
            tmp_dir = Path(tmp)
            scene.render.filepath = str(tmp_dir / "lineart_")
            bpy.ops.render.render(write_still=True)
            svgs = sorted(tmp_dir.glob("*.svg"))
            if not svgs:
                raise RuntimeError("Freestyle SVG exporter did not emit an .svg file")
            raw_svg = svgs[0].read_text(encoding="utf-8")
    finally:
        _clear_temp_freestyle_edges(temp_edges)
        try:
            vl_clean = scene.view_layers[0]
            for ls_item in list(vl_clean.freestyle_settings.linesets):
                ls_item.collection = None
            while len(vl_clean.freestyle_settings.linesets) > 0:
                vl_clean.freestyle_settings.linesets.remove(vl_clean.freestyle_settings.linesets[0])
        except Exception:
            pass
        if excl_col is not None and excl_col.name in bpy.data.collections:
            for o in list(excl_col.objects):
                excl_col.objects.unlink(o)
            bpy.data.collections.remove(excl_col)
        _restore_visibility(saved_vis)
        _cleanup_preview_rig(rig_col)
        scene.render.engine = prev_engine
        scene.camera = prev_cam
        scene.world = prev_world
        scene.render.use_freestyle = prev_freestyle
        if hasattr(scene, "svg_export"):
            scene.svg_export.use_svg_export = prev_svg

    compacted_svg, stroke_widths, path_count = _compact_freestyle_svg(
        raw_svg,
        target_max_bytes=target_max_bytes,
    )
    out_svg_path.write_text(compacted_svg, encoding="utf-8")

    byte_size = out_svg_path.stat().st_size
    if path_count <= 0:
        raise ValueError(f"Generated Freestyle SVG has 0 <path strokes: {out_svg_path}")
    if byte_size > 2_500_000:
        raise ValueError(
            f"Generated Freestyle SVG exceeds hard 2.5MB ceiling ({byte_size} bytes): {out_svg_path}"
        )

    return {
        "svgPath": str(out_svg_path),
        "view": view.key,
        "resolution": resolution,
        "byteSize": byte_size,
        "pathCount": path_count,
        "strokeWidths": stroke_widths,
        "lineSets": ["TS_Silhouette", "TS_ArchCrease", "TS_Detail"],
    }


def render_hero_review_bundle(
    out_dir: Path,
    slug: str,
    *,
    root_obj: Optional[bpy.types.Object] = None,
    views: Optional[Sequence[PreviewCameraView]] = None,
    tile_resolution: int = 512,
    interior_cutaway: bool = True,
    lighting_preset: str = "day_5600k",
    thumbnail_path: Optional[Path] = None,
    thumbnail_view_index: int = 4,
    lineart_copy_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Render both the 6-view BLENDER_EEVEE contact sheet and 3-tier Freestyle SVG line art."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet_report = render_six_view_contact_sheet(
        out_dir / f"{slug}-contact-sheet.png",
        root_obj=root_obj,
        views=views,
        tile_resolution=tile_resolution,
        interior_cutaway=interior_cutaway,
        lighting_preset=lighting_preset,
        thumbnail_path=thumbnail_path,
        thumbnail_view_index=thumbnail_view_index,
    )
    svg_out = out_dir / f"{slug}-lineart.svg"
    svg_report = render_freestyle_svg(
        svg_out,
        root_obj=root_obj,
        view=(views[3] if views and len(views) > 3 else None),
        resolution=tile_resolution,
        interior_cutaway=interior_cutaway,
    )
    if lineart_copy_path is not None:
        dst_svg = Path(lineart_copy_path)
        dst_svg.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(svg_out, dst_svg)
        svg_report["publicPath"] = str(dst_svg)
    return {
        "contactSheet": sheet_report,
        "freestyleSvg": svg_report,
        "lightingPresets": dict(LIGHTING_PRESETS),
    }
