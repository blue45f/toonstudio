"""BLENDER_EEVEE 512x512 6-view contact sheet & Freestyle SVG line art generator.

Strictly follows Blender 5.3 headless invariants:
- Render engine: ``BLENDER_EEVEE`` (never ``BLENDER_EEVEE_NEXT``)
- Freestyle SVG addon enabled inside Python via
  ``bpy.ops.preferences.addon_enable(module="bl_ext.user_default.freestyle_svg_exporter")``
  (never via ``--addons`` CLI flag)
- Zero Pillow/PIL dependency: stitches the 3x2 (1536x1024) labeled contact sheet
  using Blender's ``bpy.data.images.load`` + NumPy + pure-Python PNG encoding
- Supports shadow-preserving cutaway visibility when rendering Front, Side,
  Back, 3/4, Interior Shot, and Top Cutaway views.
"""

from __future__ import annotations

import math
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import bpy
import numpy as np
from mathutils import Vector

from .surface_atlas import save_png

FREESTYLE_SVG_ADDON = "bl_ext.user_default.freestyle_svg_exporter"

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


def _setup_preview_rig(scene: bpy.types.Scene, center: Vector, span: float) -> Tuple[bpy.types.Collection, bpy.types.Object]:
    """Create temporary studio daylight & bounce rig in a dedicated collection."""
    col_name = "TS_PreviewRig"
    existing = bpy.data.collections.get(col_name)
    if existing is not None:
        for o in list(existing.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        col = existing
    else:
        col = bpy.data.collections.new(col_name)
        scene.collection.children.link(col)

    # Daylight sky world
    world = bpy.data.worlds.new("TS_PreviewWorld")
    world.use_nodes = True
    bg = next((n for n in world.node_tree.nodes if n.type == "BACKGROUND"), None)
    if bg is not None:
        bg.inputs[0].default_value = (0.64, 0.74, 0.84, 1.0)
        bg.inputs[1].default_value = 0.85
    scene.world = world

    # Warm sun key light casting clean architectural shadows
    sun_data = bpy.data.lights.new("TS_KeySun", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = math.radians(4.5)
    sun_data.color = (1.0, 0.93, 0.84)
    sun_obj = bpy.data.objects.new(sun_data.name, sun_data)
    col.objects.link(sun_obj)
    sun_obj.rotation_euler = Vector((-0.62, 0.48, -0.82)).to_track_quat("-Z", "Y").to_euler()

    # Soft interior bounce fill area light so shaded walls keep webtoon readability
    fill_data = bpy.data.lights.new("TS_InteriorFill", "AREA")
    fill_data.energy = max(60.0, span * span * 4.5)
    fill_data.shape = "RECTANGLE"
    fill_data.size = max(1.8, span * 0.45)
    fill_data.size_y = max(1.8, span * 0.45)
    fill_data.color = (0.94, 0.96, 1.0)
    fill_obj = bpy.data.objects.new(fill_data.name, fill_data)
    col.objects.link(fill_obj)
    fill_obj.location = (center.x, center.y, center.z + 0.6)
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


def _configure_eevee(scene: bpy.types.Scene, resolution: int = 512) -> None:
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
) -> Dict[str, Any]:
    """Render 6 BLENDER_EEVEE 512x512 views and stitch a labeled 1536x1024 contact sheet."""
    scene = bpy.context.scene
    prev_engine = scene.render.engine
    prev_cam = scene.camera
    prev_world = scene.world
    prev_freestyle = scene.render.use_freestyle

    objs = list(root_obj.children_recursive) if root_obj is not None else list(scene.objects)
    bmin, bmax = _scene_mesh_bounds(objs)
    center = (bmin + bmax) * 0.5
    span = max(bmax.x - bmin.x, bmax.y - bmin.y, 2.0)

    resolved_views = list(views) if views is not None else compute_default_six_views(root_obj, interior_cutaway=interior_cutaway)
    if len(resolved_views) != 6:
        raise ValueError(f"Contact sheet requires exactly 6 views, got {len(resolved_views)}")

    rig_col, cam_obj = _setup_preview_rig(scene, center, span)
    rendered_files: Dict[str, str] = {}
    tiles: List[Tuple[str, np.ndarray]] = []

    try:
        scene.render.use_freestyle = False
        _configure_eevee(scene, resolution=tile_resolution)

        with tempfile.TemporaryDirectory(prefix="ts_6view_") as tmp:
            work_dir = Path(save_individual_dir) if save_individual_dir is not None else Path(tmp)
            work_dir.mkdir(parents=True, exist_ok=True)

            for view in resolved_views:
                saved = _apply_cutaway_visibility(view.hide_nodes)
                try:
                    _aim_camera(cam_obj, view)
                    img_path = work_dir / f"{view.key}.png"
                    scene.render.filepath = str(img_path)
                    bpy.ops.render.render(write_still=True)
                    tiles.append((view.label, _load_png_rgb_uint8(img_path)))
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

    return {
        "engine": "BLENDER_EEVEE",
        "contactSheet": str(sheet),
        "sheetDimensions": [tile_resolution * 3, tile_resolution * 2],
        "tileResolution": tile_resolution,
        "byteSize": sheet.stat().st_size,
        "views": [v.key for v in resolved_views],
        "individualRenders": rendered_files,
    }


def render_freestyle_svg(
    out_svg_path: Path,
    *,
    root_obj: Optional[bpy.types.Object] = None,
    view: Optional[PreviewCameraView] = None,
    resolution: int = 512,
    crease_normal_angle_deg: float = 32.0,
    line_thickness: float = 1.4,
    interior_cutaway: bool = True,
) -> Dict[str, Any]:
    """Generate clean architectural webtoon line art SVG via Blender 5.3 Freestyle SVG exporter.

    Enables ``bl_ext.user_default.freestyle_svg_exporter`` inside Python (never ``--addons``)
    and verifies the emitted SVG contains ``<path`` strokes > 0.
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
    try:
        _configure_eevee(scene, resolution=resolution)
        scene.render.use_freestyle = True
        scene.svg_export.use_svg_export = True
        scene.svg_export.mode = "FRAME"
        if hasattr(scene.svg_export, "object_fill"):
            scene.svg_export.object_fill = False

        vl = scene.view_layers[0]
        vl.use_freestyle = True
        fs = vl.freestyle_settings
        # Blender Freestyle crease_angle is dihedral face angle (180 - normal_bend_angle)
        dihedral_deg = max(90.0, min(175.0, 180.0 - float(crease_normal_angle_deg)))
        fs.crease_angle = math.radians(dihedral_deg)

        while len(fs.linesets) > 0:
            fs.linesets.remove(fs.linesets[0])
        ls = fs.linesets.new("TS_WebtoonLines")
        if ls.linestyle is None:
            ls.linestyle = bpy.data.linestyles.new("TS_WebtoonInk")
        ls.linestyle.thickness = float(line_thickness)
        ls.linestyle.color = (0.08, 0.08, 0.10)
        ls.select_silhouette = True
        ls.select_border = True
        ls.select_crease = True
        ls.select_contour = True
        ls.select_external_contour = True
        ls.select_material_boundary = True
        ls.select_edge_mark = True

        saved_vis = _apply_cutaway_visibility(view.hide_nodes)
        _aim_camera(cam_obj, view)
        scene.frame_set(1)

        with tempfile.TemporaryDirectory(prefix="ts_fsvg_") as tmp:
            tmp_dir = Path(tmp)
            scene.render.filepath = str(tmp_dir / "lineart_")
            bpy.ops.render.render(write_still=True)
            svgs = sorted(tmp_dir.glob("*.svg"))
            if not svgs:
                raise RuntimeError("Freestyle SVG exporter did not emit an .svg file")
            shutil.copy2(svgs[0], out_svg_path)
    finally:
        _restore_visibility(saved_vis)
        _cleanup_preview_rig(rig_col)
        scene.render.engine = prev_engine
        scene.camera = prev_cam
        scene.world = prev_world
        scene.render.use_freestyle = prev_freestyle
        if hasattr(scene, "svg_export"):
            scene.svg_export.use_svg_export = prev_svg

    svg_text = out_svg_path.read_text(encoding="utf-8")
    path_count = svg_text.count("<path")
    if path_count <= 0:
        raise ValueError(f"Generated Freestyle SVG has 0 <path strokes: {out_svg_path}")

    return {
        "svgPath": str(out_svg_path),
        "view": view.key,
        "resolution": resolution,
        "byteSize": out_svg_path.stat().st_size,
        "pathCount": path_count,
    }


def render_hero_review_bundle(
    out_dir: Path,
    slug: str,
    *,
    root_obj: Optional[bpy.types.Object] = None,
    views: Optional[Sequence[PreviewCameraView]] = None,
    tile_resolution: int = 512,
    interior_cutaway: bool = True,
) -> Dict[str, Any]:
    """Render both the 6-view BLENDER_EEVEE contact sheet and Freestyle SVG line art."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet_report = render_six_view_contact_sheet(
        out_dir / f"{slug}-contact-sheet.png",
        root_obj=root_obj,
        views=views,
        tile_resolution=tile_resolution,
        interior_cutaway=interior_cutaway,
    )
    svg_report = render_freestyle_svg(
        out_dir / f"{slug}-lineart.svg",
        root_obj=root_obj,
        view=(views[3] if views and len(views) > 3 else None),
        resolution=tile_resolution,
        interior_cutaway=interior_cutaway,
    )
    return {
        "contactSheet": sheet_report,
        "freestyleSvg": svg_report,
    }
