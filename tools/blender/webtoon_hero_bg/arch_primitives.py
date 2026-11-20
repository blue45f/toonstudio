"""Closed-surface manifold hard-surface architectural primitives for ToonStudio BG3D.

Extends the proven ``MeshGroup`` watertight geometry pattern from
``generate_riverside_park_pavilion.py`` and ``generate_botanical_glasshouse.py``
with:

- Exact per-part 3D edge bevels (3-8 mm, safely clamped locally to prevent
  zero-area faces or global clamp collapse)
- Blender 5.3 angle smooth shading (``shade_smooth_by_angle``) +
  ``WEIGHTED_NORMAL(keep_sharp=True)`` (never ``Mesh.use_auto_smooth``)
- Minimum 12-25 mm real 3D architectural relief (window/door casings, sills,
  moldings, wainscoting, fluted columns, stair nosing, paneled doors)
- Zero Z-fighting (>= 4 mm standoff clearances, >= 6 mm glass thickness,
  exact lattice-cut walls with zero coplanar overlap or boolean T-junctions)
- Deterministic [0, 1] atlas tile UV projection with >= 0.015 gutter margin
- Strict bmesh 0-defect invariant checks (0 non-manifold, 0 loose verts,
  0 wire edges, 0 zero-area faces/triangles)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence, Tuple

import bmesh
import bpy
from mathutils import Matrix, Vector

from .surface_atlas import (
    ATLAS_UV_MARGIN,
    MAT_ARCH_TRIM,
    get_tile_uv_rect,
)

TAU = math.tau
DEFAULT_BEVEL_M = 0.004  # 4 mm hard-surface bevel (spec range: 3-8 mm)
MIN_GLASS_THICKNESS_M = 0.006  # >= 6 mm per Z-fighting invariant
MIN_STANDOFF_M = 0.004  # >= 3-5 mm clearance for posters/frames/rugs
SHADE_ANGLE_RAD = 0.523599  # 30 degrees (Blender 5.3 shade_smooth_by_angle)

# Semantic graphic tiles that automatically map full upright [0,1]x[0,1] UVs onto signs/boards
AUTO_FIT_GRAPHIC_TILES = frozenset(
    {
        "chalkboard",
        "paper_label",
        "emissive_neon",
        "emissive_exit_green",
        "emissive_amber",
        "emissive_rose",
    }
)

Vec3 = Tuple[float, float, float]


def linear_rgba(hex_color: str) -> Tuple[float, float, float, float]:
    """Convert a 6-digit hex color string (with or without ``#``) to linear RGBA."""
    clean = hex_color.lstrip("#").strip()
    if len(clean) != 6:
        raise ValueError(f"Expected 6-digit hex color, got {hex_color!r}")
    rgb = [int(clean[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    lin = tuple(
        c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
        for c in rgb
    )
    return (lin[0], lin[1], lin[2], 1.0)


@dataclass(frozen=True)
class WallOpening:
    """Rectangular or arched architectural opening specification along a wall."""

    offset_x: float  # Distance along wall length from wall center (metres)
    width: float  # Clear opening width (metres)
    height: float  # Clear opening height (metres)
    sill_z: float = 0.0  # Bottom of opening above wall base Z (0.0 for doors)
    kind: str = "window"  # "window" | "door" | "arch"
    arch_rise: float = 0.0  # > 0 adds watertight arched head above rectangular span
    arch_segments: int = 12


class MeshGroup:
    """Watertight closed-surface manifold collector with per-face atlas tiles & tint.

    Each part pushed into ``MeshGroup`` carries its own semantic ``tile`` name
    and ``color`` hex tint. When ``build()`` runs (or when merged into mobile
    bundles by ``cutaway_assembly.py``), every face's cubic-projected UV is
    deterministically mapped inside the target material's 4x4 atlas cell with
    margin >= 0.015, strictly inside [0, 1].
    """

    def __init__(
        self,
        name: str,
        material: Optional[bpy.types.Material] = None,
        *,
        atlas_name: str = MAT_ARCH_TRIM,
        default_tile: str = "plaster",
        tile_scale_m: float = 1.6,
    ) -> None:
        self.name = name
        self.material = material
        self.atlas_name = atlas_name
        self.default_tile = default_tile
        self.tile_scale_m = max(0.25, float(tile_scale_m))
        self.vertices: List[Tuple[float, float, float]] = []
        self.faces: List[Tuple[int, ...]] = []
        self.colors: List[Tuple[float, float, float, float]] = []
        self.face_tiles: List[str] = []
        self.face_uv_fits: List[Optional[bool]] = []

    def is_empty(self) -> bool:
        return len(self.faces) == 0

    def solid(
        self,
        points: Sequence[Sequence[float]],
        faces: Sequence[Sequence[int]],
        color: str = "FFFFFF",
        *,
        tile: Optional[str] = None,
        uv_fit: Optional[bool] = None,
    ) -> None:
        """Append a closed manifold solid defined by vertices and polygon index tuples."""
        if not points or not faces:
            return
        start = len(self.vertices)
        rgba = linear_rgba(color)
        resolved_tile = tile or self.default_tile
        self.vertices.extend((float(p[0]), float(p[1]), float(p[2])) for p in points)
        self.colors.extend([rgba] * len(points))
        for face in faces:
            self.faces.append(tuple(start + int(i) for i in face))
            self.face_tiles.append(resolved_tile)
            self.face_uv_fits.append(uv_fit)

    def box(
        self,
        center: Vec3,
        size: Vec3,
        color: str = "FFFFFF",
        *,
        tile: Optional[str] = None,
        bevel: float = DEFAULT_BEVEL_M,
        rot_z: float = 0.0,
        uv_fit: Optional[bool] = None,
    ) -> None:
        """Append a closed manifold box, beveled by default (3-8 mm hard-surface spec)."""
        add_beveled_box(
            self,
            center=center,
            size=size,
            color=color,
            tile=tile,
            bevel=bevel,
            rot_z=rot_z,
            uv_fit=uv_fit,
        )

    def rings(
        self,
        rings: Sequence[Sequence[Sequence[float]]],
        color: str = "FFFFFF",
        *,
        tile: Optional[str] = None,
        closed_loop: bool = False,
    ) -> None:
        """Loft a sequence of equal-length 3D rings into a watertight closed manifold solid."""
        if len(rings) < 2:
            raise ValueError("rings() requires at least 2 cross-section rings")
        count = len(rings[0])
        if count < 3:
            raise ValueError("Each ring must have at least 3 points")
        pts: List[Tuple[float, float, float]] = []
        for ring in rings:
            if len(ring) != count:
                raise ValueError("All rings must share the same vertex count")
            pts.extend((float(p[0]), float(p[1]), float(p[2])) for p in ring)

        faces: List[Tuple[int, ...]] = []
        n_rings = len(rings)
        if not closed_loop:
            faces.append(tuple(range(count - 1, -1, -1)))
            for row in range(n_rings - 1):
                base = row * count
                nxt = (row + 1) * count
                for i in range(count):
                    j = (i + 1) % count
                    faces.append((base + i, base + j, nxt + j, nxt + i))
            last = (n_rings - 1) * count
            faces.append(tuple(range(last, last + count)))
        else:
            for row in range(n_rings):
                base = row * count
                nxt = ((row + 1) % n_rings) * count
                for i in range(count):
                    j = (i + 1) % count
                    faces.append((base + i, base + j, nxt + j, nxt + i))

        self.solid(pts, faces, color=color, tile=tile)

    def rail(
        self,
        start: Vec3,
        end: Vec3,
        radius: float,
        color: str = "FFFFFF",
        sides: int = 10,
        *,
        tile: Optional[str] = None,
        bevel_ends: bool = True,
    ) -> None:
        """Append a closed cylindrical strut between ``start`` and ``end``."""
        a = Vector(start)
        b = Vector(end)
        vec = b - a
        length = vec.length
        if length < 1e-5 or radius < 1e-5:
            return
        axis = vec / length
        ref = Vector((0.0, 0.0, 1.0)) if abs(axis.z) < 0.9 else Vector((0.0, 1.0, 0.0))
        normal = axis.cross(ref).normalized()
        binormal = axis.cross(normal).normalized()

        def _ring_at(origin: Vector, r: float) -> List[Vector]:
            return [
                origin + r * (math.cos(TAU * i / sides) * normal + math.sin(TAU * i / sides) * binormal)
                for i in range(sides)
            ]

        chamfer = min(radius * 0.25, length * 0.15, 0.003) if bevel_ends else 0.0
        if chamfer >= 0.0005 and length > chamfer * 3.0:
            r_in = max(radius * 0.72, radius - chamfer)
            ring_list = [
                _ring_at(a, r_in),
                _ring_at(a + axis * chamfer, radius),
                _ring_at(b - axis * chamfer, radius),
                _ring_at(b, r_in),
            ]
        else:
            ring_list = [_ring_at(a, radius), _ring_at(b, radius)]
        self.rings(ring_list, color=color, tile=tile)

    def timber(
        self,
        start: Vec3,
        end: Vec3,
        width: float,
        depth: float,
        color: str = "FFFFFF",
        *,
        tile: Optional[str] = None,
        bevel: float = DEFAULT_BEVEL_M,
    ) -> None:
        """Append a rectangular beveled beam spanning ``start`` to ``end``."""
        a = Vector(start)
        b = Vector(end)
        vec = b - a
        length = vec.length
        if length < 1e-5:
            return
        axis = vec / length
        ref = Vector((0.0, 0.0, 1.0)) if abs(axis.z) < 0.9 else Vector((0.0, 1.0, 0.0))
        u_dir = axis.cross(ref).normalized()
        v_dir = axis.cross(u_dir).normalized()
        center = (a + b) * 0.5

        pts, faces = _make_beveled_box_local((length, width, depth), bevel=bevel)
        world_pts = [
            center + axis * p[0] + u_dir * p[1] + v_dir * p[2]
            for p in pts
        ]
        self.solid(world_pts, faces, color=color, tile=tile)

    def add(self, other: "MeshGroup") -> None:
        """Merge another ``MeshGroup`` into this one, preserving tiles and vertex colors."""
        if other.is_empty():
            return
        base = len(self.vertices)
        self.vertices.extend(other.vertices)
        self.colors.extend(other.colors)
        self.faces.extend(tuple(base + i for i in face) for face in other.faces)
        self.face_tiles.extend(other.face_tiles)
        if len(other.face_uv_fits) == len(other.faces):
            self.face_uv_fits.extend(other.face_uv_fits)
        else:
            self.face_uv_fits.extend([None] * len(other.faces))

    def clone_translated(self, offset: Vec3) -> "MeshGroup":
        """Return a shallow-copied ``MeshGroup`` shifted by ``offset``."""
        ox, oy, oz = offset
        dup = MeshGroup(
            self.name,
            self.material,
            atlas_name=self.atlas_name,
            default_tile=self.default_tile,
            tile_scale_m=self.tile_scale_m,
        )
        dup.vertices = [(x + ox, y + oy, z + oz) for (x, y, z) in self.vertices]
        dup.faces = list(self.faces)
        dup.colors = list(self.colors)
        dup.face_tiles = list(self.face_tiles)
        dup.face_uv_fits = list(self.face_uv_fits)
        return dup

    def build(
        self,
        *,
        material: Optional[bpy.types.Material] = None,
        atlas_name: Optional[str] = None,
        collection: Optional[bpy.types.Collection] = None,
        apply_weighted_normal: bool = True,
        shade_angle: float = SHADE_ANGLE_RAD,
        validate_manifold: bool = True,
        uv_margin: float = ATLAS_UV_MARGIN,
    ) -> bpy.types.Object:
        """Materialize a verified Blender 5.3 mesh object with Weighted Normals & [0,1] UVs."""
        mat = material or self.material
        resolved_atlas = atlas_name or (mat.name if mat is not None else self.atlas_name)

        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.vertices, [], self.faces)

        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.faces.ensure_lookup_table()

        # Preserve semantic tile assignment & uv_fit flag per face across n-gon triangulation
        unique_tiles: List[str] = []
        tile_to_id: dict[str, int] = {}
        tile_layer = bm.faces.layers.int.new("ts_tile")
        uvfit_layer = bm.faces.layers.int.new("ts_uvfit")
        for f_idx, face in enumerate(bm.faces):
            t_name = self.face_tiles[f_idx] if f_idx < len(self.face_tiles) else self.default_tile
            tid = tile_to_id.get(t_name)
            if tid is None:
                tid = len(unique_tiles)
                tile_to_id[t_name] = tid
                unique_tiles.append(t_name)
            face[tile_layer] = tid
            fit_flag = self.face_uv_fits[f_idx] if f_idx < len(self.face_uv_fits) else None
            # 0 = auto, 1 = explicit True, -1 = explicit False
            face[uvfit_layer] = 1 if fit_flag is True else (-1 if fit_flag is False else 0)

        # Triangulate ONLY n-gons (> 4 verts) so Mikktspace tangent computation
        # succeeds cleanly on every mesh (0 MESH_PRIMITIVE_GENERATED_TANGENT_SPACE warnings)
        ngons = [f for f in bm.faces if len(f.verts) > 4]
        if ngons:
            bmesh.ops.triangulate(bm, faces=ngons, quad_method="BEAUTY", ngon_method="BEAUTY")

        bm.normal_update()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

        if validate_manifold and len(bm.faces) > 0:
            bad_edges = sum(1 for e in bm.edges if not e.is_manifold)
            loose_verts = sum(1 for v in bm.verts if len(v.link_edges) == 0)
            wire_edges = sum(1 for e in bm.edges if len(e.link_faces) == 0)
            zero_faces = sum(1 for f in bm.faces if f.calc_area() < 1e-10)
            if bad_edges or loose_verts or wire_edges or zero_faces:
                bm.free()
                raise ValueError(
                    f"{self.name}: bmesh defect detected "
                    f"(non_manifold={bad_edges}, loose_verts={loose_verts}, "
                    f"wire_edges={wire_edges}, zero_area={zero_faces})"
                )

        bm.faces.ensure_lookup_table()
        post_face_tiles = [unique_tiles[f[tile_layer]] for f in bm.faces]
        post_face_uvfits = [int(f[uvfit_layer]) for f in bm.faces]
        bm.faces.layers.int.remove(tile_layer)
        bm.faces.layers.int.remove(uvfit_layer)
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()

        # Assign deterministic [0, 1] atlas tile UVs with safe gutter margin >= 0.015
        uv_layer = mesh.uv_layers.new(name="UVMap")
        tile_cache = {}
        tile_scale = self.tile_scale_m
        for poly_idx, poly in enumerate(mesh.polygons):
            tile_name = post_face_tiles[poly_idx] if poly_idx < len(post_face_tiles) else self.default_tile
            fit_mode = post_face_uvfits[poly_idx] if poly_idx < len(post_face_uvfits) else 0
            rect = tile_cache.get(tile_name)
            if rect is None:
                rect = get_tile_uv_rect(resolved_atlas, tile_name, margin=uv_margin)
                tile_cache[tile_name] = rect

            use_fit = (fit_mode == 1) or (fit_mode == 0 and tile_name in AUTO_FIT_GRAPHIC_TILES)
            n = poly.normal
            if use_fit:
                # Upright, un-mirrored viewer-facing projection onto the full [0, 1] tile
                if abs(n.z) < 0.85:
                    # Viewer looks along -n; viewer's right = (-n) x (+Z) = (-ny, nx, 0)
                    right = Vector((-n.y, n.x, 0.0))
                    if right.length < 1e-6:
                        right = Vector((1.0, 0.0, 0.0))
                    else:
                        right.normalize()
                    up_dir = n.cross(right)
                    if up_dir.length < 1e-6:
                        up_dir = Vector((0.0, 0.0, 1.0))
                    else:
                        up_dir.normalize()
                else:
                    right = Vector((1.0, 0.0, 0.0))
                    up_dir = Vector((0.0, 1.0 if n.z >= 0.0 else -1.0, 0.0))

                coords = [
                    (
                        mesh.vertices[mesh.loops[li].vertex_index].co.dot(right),
                        mesh.vertices[mesh.loops[li].vertex_index].co.dot(up_dir),
                    )
                    for li in poly.loop_indices
                ]
                us = [c[0] for c in coords]
                vs = [c[1] for c in coords]
                min_u, max_u = min(us), max(us)
                min_v, max_v = min(vs), max(vs)
                span_u = max(max_u - min_u, 1e-5)
                span_v = max(max_v - min_v, 1e-5)
                for li, (cu, cv) in zip(poly.loop_indices, coords):
                    lu = min(1.0, max(0.0, (cu - min_u) / span_u))
                    lv = min(1.0, max(0.0, (cv - min_v) / span_v))
                    uv_layer.data[li].uv = (
                        rect.u_min + lu * rect.u_span,
                        rect.v_min + lv * rect.v_span,
                    )
            else:
                axis = max(range(3), key=lambda k: abs(n[k]))
                u_ax, v_ax = ((1, 2), (0, 2), (0, 1))[axis]

                coords = [
                    (
                        mesh.vertices[mesh.loops[li].vertex_index].co[u_ax],
                        mesh.vertices[mesh.loops[li].vertex_index].co[v_ax],
                    )
                    for li in poly.loop_indices
                ]
                us = [c[0] for c in coords]
                vs = [c[1] for c in coords]
                min_u, max_u = min(us), max(us)
                min_v, max_v = min(vs), max(vs)
                span_u = max(max_u - min_u, 1e-5)
                span_v = max(max_v - min_v, 1e-5)
                denom = max(span_u, span_v, tile_scale)
                # Keep small details proportional to physical scale while clamping large spans into [0, 1]
                for li, (cu, cv) in zip(poly.loop_indices, coords):
                    lu = min(1.0, max(0.0, (cu - min_u) / denom))
                    lv = min(1.0, max(0.0, (cv - min_v) / denom))
                    uv_layer.data[li].uv = (
                        rect.u_min + lu * rect.u_span,
                        rect.v_min + lv * rect.v_span,
                    )

        # Vertex color attribute "Tint" (BYTE_COLOR POINT matches glTF COLOR_0)
        if len(mesh.vertices) > 0:
            colors = mesh.color_attributes.new(name="Tint", type="BYTE_COLOR", domain="POINT")
            flat_colors = [channel for rgba in self.colors for channel in rgba]
            colors.data.foreach_set("color", flat_colors)

        if mat is not None:
            mesh.materials.append(mat)

        obj = bpy.data.objects.new(self.name, mesh)
        target_col = collection or bpy.context.scene.collection
        target_col.objects.link(obj)

        # Blender 5.3 smooth shading by angle + Weighted Normal (keep_sharp=True)
        if len(mesh.polygons) > 0:
            _apply_blender53_hard_surface_normals(
                obj,
                shade_angle=shade_angle,
                apply_weighted_normal=apply_weighted_normal,
            )

            mesh.calc_loop_triangles()
            deg_tris = sum(1 for tri in mesh.loop_triangles if tri.area < 1e-11)
            if validate_manifold and deg_tris > 0:
                raise ValueError(f"{self.name}: {deg_tris} zero-area loop triangles after normal pass")

        return obj


def _apply_blender53_hard_surface_normals(
    obj: bpy.types.Object,
    *,
    shade_angle: float = SHADE_ANGLE_RAD,
    apply_weighted_normal: bool = True,
) -> None:
    """Apply Blender 5.3 ``shade_smooth_by_angle`` + ``WEIGHTED_NORMAL(keep_sharp=True)``."""
    view_layer = bpy.context.view_layer
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    view_layer.objects.active = obj

    if "shade_smooth_by_angle" in dir(bpy.ops.object):
        bpy.ops.object.shade_smooth_by_angle(angle=shade_angle, keep_sharp_edges=True)
    else:
        for poly in obj.data.polygons:
            poly.use_smooth = True
        obj.data.set_sharp_from_angle(angle=shade_angle)

    if apply_weighted_normal:
        mod = obj.modifiers.new(name="TS_WeightedNormal", type="WEIGHTED_NORMAL")
        mod.mode = "FACE_AREA"
        mod.weight = 50
        mod.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod.name)


# ---------------------------------------------------------------------------
# Analytical Watertight Beveled Box Geometry (Zero T-Junctions, 24v / 26f)
# ---------------------------------------------------------------------------


def _make_beveled_box_local(
    size: Vec3,
    bevel: float = DEFAULT_BEVEL_M,
) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, ...]]]:
    """Generate a centered watertight beveled box in local space.

    When ``bevel > 0``, generates 24 vertices and 26 faces (6 flat main quads,
    12 45-degree edge bevel quads, 8 corner bevel triangles). Bevel width is
    clamped locally to ``min(sx, sy, sz) * 0.28`` so thin panels (e.g. 6 mm
    glass panes) get clean micro-chamfers without ever producing degenerate faces.
    """
    sx, sy, sz = float(size[0]), float(size[1]), float(size[2])
    if sx <= 1e-6 or sy <= 1e-6 or sz <= 1e-6:
        raise ValueError(f"Box size dimensions must be positive, got {size}")
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    b = min(float(bevel), min(sx, sy, sz) * 0.28)
    if b < 0.0004:
        pts = [
            (ix * hx, iy * hy, iz * hz)
            for iz in (-1, 1)
            for iy in (-1, 1)
            for ix in (-1, 1)
        ]
        faces = [
            (0, 2, 3, 1),
            (4, 5, 7, 6),
            (0, 1, 5, 4),
            (2, 6, 7, 3),
            (0, 4, 6, 2),
            (1, 3, 7, 5),
        ]
        return pts, faces

    ix, iy, iz = hx - b, hy - b, hz - b
    # 6 inset main face quads (4 vertices each -> 24 vertices)
    # 0..3:   -Z face (z = -hz)
    # 4..7:   +Z face (z = +hz)
    # 8..11:  -Y face (y = -hy)
    # 12..15: +Y face (y = +hy)
    # 16..19: -X face (x = -hx)
    # 20..23: +X face (x = +hx)
    pts = [
        # -Z: (-,-), (+,-), (+,+), (-,+)
        (-ix, -iy, -hz),
        (ix, -iy, -hz),
        (ix, iy, -hz),
        (-ix, iy, -hz),
        # +Z: (-,-), (+,-), (+,+), (-,+)
        (-ix, -iy, hz),
        (ix, -iy, hz),
        (ix, iy, hz),
        (-ix, iy, hz),
        # -Y: (-,-), (+,-), (+,+), (-,+) in (x, z)
        (-ix, -hy, -iz),
        (ix, -hy, -iz),
        (ix, -hy, iz),
        (-ix, -hy, iz),
        # +Y: (-,-), (+,-), (+,+), (-,+) in (x, z)
        (-ix, hy, -iz),
        (ix, hy, -iz),
        (ix, hy, iz),
        (-ix, hy, iz),
        # -X: (-,-), (+,-), (+,+), (-,+) in (y, z)
        (-hx, -iy, -iz),
        (-hx, iy, -iz),
        (-hx, iy, iz),
        (-hx, -iy, iz),
        # +X: (-,-), (+,-), (+,+), (-,+) in (y, z)
        (hx, -iy, -iz),
        (hx, iy, -iz),
        (hx, iy, iz),
        (hx, -iy, iz),
    ]

    faces = [
        # 6 main faces (outward CCW)
        (0, 3, 2, 1),      # -Z
        (4, 5, 6, 7),      # +Z
        (8, 9, 10, 11),    # -Y
        (12, 15, 14, 13),  # +Y
        (16, 19, 18, 17),  # -X
        (20, 21, 22, 23),  # +X
        # 12 edge bevel strips
        (0, 1, 9, 8),      # -Z / -Y
        (2, 3, 12, 13),    # -Z / +Y
        (3, 0, 16, 17),    # -Z / -X
        (1, 2, 21, 20),    # -Z / +X
        (4, 11, 10, 5),    # +Z / -Y
        (6, 14, 15, 7),    # +Z / +Y
        (7, 18, 19, 4),    # +Z / -X
        (5, 23, 22, 6),    # +Z / +X
        (8, 11, 19, 16),   # -Y / -X
        (9, 20, 23, 10),   # -Y / +X
        (12, 17, 18, 15),  # +Y / -X
        (13, 14, 22, 21),  # +Y / +X
        # 8 corner triangles
        (0, 8, 16),        # (-X, -Y, -Z)
        (1, 20, 9),        # (+X, -Y, -Z)
        (2, 13, 21),       # (+X, +Y, -Z)
        (3, 17, 12),       # (-X, +Y, -Z)
        (4, 19, 11),       # (-X, -Y, +Z)
        (5, 10, 23),       # (+X, -Y, +Z)
        (6, 22, 14),       # (+X, +Y, +Z)
        (7, 15, 18),       # (-X, +Y, +Z)
    ]
    return pts, faces


def _transform_points(
    points: Sequence[Vec3],
    origin: Vec3,
    rot_z: float = 0.0,
    matrix: Optional[Matrix] = None,
) -> List[Tuple[float, float, float]]:
    if matrix is not None:
        return [tuple((matrix @ Vector(p))) for p in points]
    ox, oy, oz = origin
    if abs(rot_z) < 1e-8:
        return [(p[0] + ox, p[1] + oy, p[2] + oz) for p in points]
    c = math.cos(rot_z)
    s = math.sin(rot_z)
    return [(p[0] * c - p[1] * s + ox, p[0] * s + p[1] * c + oy, p[2] + oz) for p in points]


# ---------------------------------------------------------------------------
# Architectural & Furniture Hard-Surface Builders
# ---------------------------------------------------------------------------


def add_beveled_box(
    group: MeshGroup,
    center: Vec3,
    size: Vec3,
    color: str = "FFFFFF",
    *,
    tile: Optional[str] = None,
    bevel: float = DEFAULT_BEVEL_M,
    rot_z: float = 0.0,
    matrix: Optional[Matrix] = None,
    uv_fit: Optional[bool] = None,
) -> None:
    """Add a closed manifold beveled box (default 4 mm bevel) to ``group``."""
    pts, faces = _make_beveled_box_local(size, bevel=bevel)
    world_pts = _transform_points(pts, center, rot_z=rot_z, matrix=matrix)
    group.solid(world_pts, faces, color=color, tile=tile, uv_fit=uv_fit)


def add_wall_with_openings(
    group: MeshGroup,
    center: Vec3,
    length: float,
    thickness: float,
    height: float,
    *,
    openings: Sequence[WallOpening] = (),
    rot_z: float = 0.0,
    color: str = "F2EEE6",
    tile: str = "plaster",
    baseboard_height: float = 0.085,
    baseboard_depth: float = 0.016,
    baseboard_color: str = "DDD6C9",
    baseboard_tile: str = "trim_paint",
    crown_height: float = 0.065,
    crown_depth: float = 0.020,
    crown_color: str = "EDE8DE",
    crown_tile: str = "trim_paint",
    trim_both_sides: bool = False,
    interior_side: int = -1,
) -> None:
    """Build a watertight manifold wall with exact lattice-cut openings & 3D moldings.

    Wall local coordinates before ``rot_z`` and translation to ``center``:
    - Length along local X: ``[-length/2, +length/2]``
    - Thickness along local Y: ``[-thickness/2, +thickness/2]``
    - Height along local Z: ``[0, height]`` (``center[2]`` is the bottom Z of the wall!)

    ``interior_side`` = ``-1`` puts baseboard/crown on local ``-Y`` face (e.g. North wall
    facing inward toward ``-Y``); ``+1`` puts trim on ``+Y`` face.
    """
    half_l = length * 0.5
    half_t = thickness * 0.5
    cx, cy, base_z = center

    # Clamp openings safely inside wall boundaries with minimum structural pier clearance
    clean_openings: List[Tuple[float, float, float, float, WallOpening]] = []
    for op in openings:
        x0 = max(-half_l + 0.06, op.offset_x - op.width * 0.5)
        x1 = min(half_l - 0.06, op.offset_x + op.width * 0.5)
        z0 = max(0.0, op.sill_z) if op.kind != "door" else 0.0
        z1 = min(height - 0.08, z0 + op.height)
        if x1 - x0 >= 0.10 and z1 - z0 >= 0.10:
            clean_openings.append((x0, x1, z0, z1, op))

    # Build sorted unique lattice stops along X and Z (zero T-junctions!)
    xs = sorted({round(-half_l, 5), round(half_l, 5), *(round(v, 5) for o in clean_openings for v in (o[0], o[1]))})
    zs = sorted({0.0, round(height, 5), *(round(v, 5) for o in clean_openings for v in (o[2], o[3]))})

    nx = len(xs) - 1
    nz = len(zs) - 1

    solid_grid = [[True for _ in range(nz)] for _ in range(nx)]
    for ix in range(nx):
        mx = 0.5 * (xs[ix] + xs[ix + 1])
        for iz in range(nz):
            mz = 0.5 * (zs[iz] + zs[iz + 1])
            for (x0, x1, z0, z1, _op) in clean_openings:
                if x0 < mx < x1 and z0 < mz < z1:
                    solid_grid[ix][iz] = False
                    break

    # Allocate vertex lattice (ix, iy, iz) -> vertex index
    vert_map: dict[Tuple[int, int, int], int] = {}
    local_pts: List[Tuple[float, float, float]] = []

    def _vid(ix: int, iy: int, iz: int) -> int:
        key = (ix, iy, iz)
        idx = vert_map.get(key)
        if idx is None:
            idx = len(local_pts)
            vert_map[key] = idx
            y_val = -half_t if iy == 0 else half_t
            local_pts.append((xs[ix], y_val, zs[iz]))
        return idx

    faces: List[Tuple[int, int, int, int]] = []
    for ix in range(nx):
        for iz in range(nz):
            if not solid_grid[ix][iz]:
                continue
            # -Y face (front)
            faces.append((_vid(ix, 0, iz), _vid(ix + 1, 0, iz), _vid(ix + 1, 0, iz + 1), _vid(ix, 0, iz + 1)))
            # +Y face (back)
            faces.append((_vid(ix, 1, iz), _vid(ix, 1, iz + 1), _vid(ix + 1, 1, iz + 1), _vid(ix + 1, 1, iz)))
            # -X boundary / opening reveal
            if ix == 0 or not solid_grid[ix - 1][iz]:
                faces.append((_vid(ix, 1, iz), _vid(ix, 0, iz), _vid(ix, 0, iz + 1), _vid(ix, 1, iz + 1)))
            # +X boundary / opening reveal
            if ix == nx - 1 or not solid_grid[ix + 1][iz]:
                faces.append((_vid(ix + 1, 0, iz), _vid(ix + 1, 1, iz), _vid(ix + 1, 1, iz + 1), _vid(ix + 1, 0, iz + 1)))
            # -Z bottom / lintel soffit
            if iz == 0 or not solid_grid[ix][iz - 1]:
                faces.append((_vid(ix, 0, iz), _vid(ix, 1, iz), _vid(ix + 1, 1, iz), _vid(ix + 1, 0, iz)))
            # +Z top / window sill ledge
            if iz == nz - 1 or not solid_grid[ix][iz + 1]:
                faces.append((_vid(ix, 0, iz + 1), _vid(ix + 1, 0, iz + 1), _vid(ix + 1, 1, iz + 1), _vid(ix, 1, iz + 1)))

    world_pts = _transform_points(local_pts, (cx, cy, base_z), rot_z=rot_z)
    group.solid(world_pts, faces, color=color, tile=tile)

    # Optional arched head infill spandrels for arched openings (watertight closed wedges)
    for (x0, x1, _z0, z1, op) in clean_openings:
        if op.arch_rise > 0.02:
            _add_arch_spandrel_infill(
                group,
                origin=(cx, cy, base_z),
                rot_z=rot_z,
                x0=x0,
                x1=x1,
                z_top=z1,
                rise=min(op.arch_rise, (x1 - x0) * 0.5, (z1 - op.sill_z) * 0.45),
                thickness=thickness - 0.002,
                segments=max(6, op.arch_segments),
                color=color,
                tile=tile,
            )

    # Add real 3D baseboard (skipping door spans where z0 == 0) & crown molding
    trim_sides = (-1, 1) if trim_both_sides else (interior_side,)
    door_spans = sorted((x0, x1) for (x0, x1, z0, _z1, _op) in clean_openings if z0 <= 0.01)

    def _free_spans(spans: Sequence[Tuple[float, float]]) -> List[Tuple[float, float]]:
        out: List[Tuple[float, float]] = []
        cursor = -half_l
        for s0, s1 in spans:
            if s0 - cursor > 0.02:
                out.append((cursor, s0))
            cursor = max(cursor, s1)
        if half_l - cursor > 0.02:
            out.append((cursor, half_l))
        return out

    base_segments = _free_spans(door_spans)
    for side in trim_sides:
        y_face = side * half_t
        if baseboard_height > 0.005 and baseboard_depth > 0.004:
            for seg0, seg1 in base_segments:
                _add_local_wall_molding(
                    group,
                    origin=(cx, cy, base_z),
                    rot_z=rot_z,
                    x0=seg0,
                    x1=seg1,
                    y_face=y_face,
                    side=side,
                    z_base=0.0,
                    height=baseboard_height,
                    depth=baseboard_depth,
                    style="baseboard",
                    color=baseboard_color,
                    tile=baseboard_tile,
                )
        if crown_height > 0.005 and crown_depth > 0.004:
            _add_local_wall_molding(
                group,
                origin=(cx, cy, base_z),
                rot_z=rot_z,
                x0=-half_l,
                x1=half_l,
                y_face=y_face,
                side=side,
                z_base=height - crown_height,
                height=crown_height,
                depth=crown_depth,
                style="crown",
                color=crown_color,
                tile=crown_tile,
            )


def _add_arch_spandrel_infill(
    group: MeshGroup,
    *,
    origin: Vec3,
    rot_z: float,
    x0: float,
    x1: float,
    z_top: float,
    rise: float,
    thickness: float,
    segments: int,
    color: str,
    tile: str,
) -> None:
    """Fill the upper spandrel of a rectangular opening as ONE continuous watertight arch header."""
    mid_x = 0.5 * (x0 + x1)
    rx = 0.5 * (x1 - x0)
    crown_margin = 0.025  # Minimum solid masonry thickness above arch apex
    eff_rise = max(0.02, min(rise, rx, max(0.02, rise - crown_margin)))
    z_spring = z_top - eff_rise - crown_margin
    half_t = thickness * 0.5
    segs = max(8, int(segments))

    # Single simple polygon: top-left -> top-right -> spring-right -> arch curve (0..pi) -> spring-left
    profile_2d: List[Tuple[float, float]] = [(x0, z_top), (x1, z_top)]
    for i in range(segs + 1):
        a = math.pi * (i / float(segs))
        px = mid_x + rx * math.cos(a)
        pz = z_spring + eff_rise * math.sin(a)
        profile_2d.append((px, pz))

    rings = [
        [(px, -half_t, pz) for (px, pz) in profile_2d],
        [(px, half_t, pz) for (px, pz) in profile_2d],
    ]
    world_rings = [_transform_points(r, origin, rot_z=rot_z) for r in rings]
    group.rings(world_rings, color=color, tile=tile)


def _add_local_wall_molding(
    group: MeshGroup,
    *,
    origin: Vec3,
    rot_z: float,
    x0: float,
    x1: float,
    y_face: float,
    side: int,
    z_base: float,
    height: float,
    depth: float,
    style: str,
    color: str,
    tile: str,
) -> None:
    """Emit a stepped 3D molding strip flush against a wall face (zero Z-fighting)."""
    # Embed 2 mm behind face so seam never leaks light, protrude by full depth (>= 12-25 mm)
    y_in = y_face - side * 0.002
    y_mid = y_face + side * (depth * 0.62)
    y_out = y_face + side * depth
    if style == "crown":
        profile = [
            (y_in, z_base),
            (y_mid, z_base),
            (y_mid, z_base + height * 0.35),
            (y_out, z_base + height * 0.62),
            (y_out, z_base + height),
            (y_in, z_base + height),
        ]
    else:  # baseboard
        profile = [
            (y_in, z_base),
            (y_out, z_base),
            (y_out, z_base + height * 0.72),
            (y_mid, z_base + height * 0.86),
            (y_mid, z_base + height),
            (y_in, z_base + height),
        ]
    ring0 = [(x0, py, pz) for (py, pz) in profile]
    ring1 = [(x1, py, pz) for (py, pz) in profile]
    world_rings = [_transform_points(r, origin, rot_z=rot_z) for r in (ring0, ring1)]
    group.rings(world_rings, color=color, tile=tile)


def add_window_sash(
    group: MeshGroup,
    center: Vec3,
    width: float,
    height: float,
    wall_thickness: float = 0.18,
    *,
    rot_z: float = 0.0,
    panes_x: int = 2,
    panes_z: int = 1,
    sliding: bool = True,
    sill_overhang: float = 0.035,
    frame_color: str = "E8E6E1",
    frame_tile: str = "sash_metal",
    sill_color: str = "DDD4C5",
    sill_tile: str = "trim_paint",
    handle_color: str = "B8BDC2",
    handle_tile: str = "hardware_brass",
    include_glass: bool = True,
    glass_group: Optional[MeshGroup] = None,
    glass_color: str = "C8E4EE",
    glass_tile: str = "glass_tinted",
    glass_thickness: float = 0.008,
) -> None:
    """Build a detailed 3D architectural window (outer frame, sill nose, sashes, mullions, glass).

    ``center`` is the bottom-center of the clear opening ``(x, y, sill_z)``.
    Enforces >= 15 mm casing projection and >= 6 mm glass thickness (zero Z-fighting).
    """
    frame_w = 0.052
    outer_depth = wall_thickness + 0.036  # 18 mm proud on both faces
    sash_w = 0.036
    sash_d = 0.034
    g_thick = max(MIN_GLASS_THICKNESS_M, float(glass_thickness))
    target_glass = glass_group if glass_group is not None else group

    def _box(
        dst: MeshGroup,
        lx: float,
        ly: float,
        lz: float,
        sx: float,
        sy: float,
        sz: float,
        col: str,
        tl: str,
        bev: float = 0.003,
    ) -> None:
        pts, faces = _make_beveled_box_local((sx, sy, sz), bevel=bev)
        pts = [(p[0] + lx, p[1] + ly, p[2] + lz) for p in pts]
        dst.solid(_transform_points(pts, center, rot_z=rot_z), faces, color=col, tile=tl)

    # Outer frame jambs, head, and stepped interior/exterior sill board
    _box(group, -width * 0.5 + frame_w * 0.5, 0.0, height * 0.5, frame_w, outer_depth, height, frame_color, frame_tile)
    _box(group, width * 0.5 - frame_w * 0.5, 0.0, height * 0.5, frame_w, outer_depth, height, frame_color, frame_tile)
    _box(group, 0.0, 0.0, height - frame_w * 0.5, width - frame_w * 1.9, outer_depth, frame_w, frame_color, frame_tile)
    _box(
        group,
        0.0,
        -sill_overhang * 0.25,
        frame_w * 0.45,
        width + 0.06,
        outer_depth + sill_overhang,
        frame_w * 0.9,
        sill_color,
        sill_tile,
        bev=0.004,
    )

    inner_w = max(0.16, width - frame_w * 2.0)
    inner_h = max(0.16, height - frame_w * 1.9)
    inner_z0 = frame_w * 0.9
    px = max(1, int(panes_x))
    pz = max(1, int(panes_z))
    pane_w = inner_w / px

    # Build individual sash leaves (staggered in Y when sliding; 4 mm meeting-stile gap when casement)
    for ix in range(px):
        sx_center = -inner_w * 0.5 + (ix + 0.5) * pane_w
        y_track = (-0.022 if ix % 2 == 0 else 0.022) if (sliding and px > 1) else 0.0
        leaf_w = pane_w + (0.018 if (sliding and px > 1) else (-0.004 if px > 1 else 0.0))
        leaf_h = inner_h - 0.006

        # Sash stiles (left & right) and rails (bottom & top)
        _box(group, sx_center - leaf_w * 0.5 + sash_w * 0.5, y_track, inner_z0 + leaf_h * 0.5, sash_w, sash_d, leaf_h, frame_color, frame_tile)
        _box(group, sx_center + leaf_w * 0.5 - sash_w * 0.5, y_track, inner_z0 + leaf_h * 0.5, sash_w, sash_d, leaf_h, frame_color, frame_tile)
        _box(group, sx_center, y_track, inner_z0 + sash_w * 0.5, leaf_w - sash_w * 1.9, sash_d, sash_w, frame_color, frame_tile)
        _box(group, sx_center, y_track, inner_z0 + leaf_h - sash_w * 0.5, leaf_w - sash_w * 1.9, sash_d, sash_w, frame_color, frame_tile)

        # Horizontal muntins if panes_z > 1
        clear_h = max(0.08, leaf_h - sash_w * 2.0)
        clear_w = max(0.08, leaf_w - sash_w * 2.0)
        for iz in range(1, pz):
            mz = inner_z0 + sash_w + clear_h * (iz / pz)
            _box(group, sx_center, y_track, mz, clear_w, sash_d * 0.65, 0.022, frame_color, frame_tile, bev=0.002)

        # Crescent lock handle on interior sash edge
        if ix == 0 or (ix == px - 1 and px > 1):
            hx = sx_center + (leaf_w * 0.5 - sash_w * 0.55) * (1.0 if ix == 0 else -1.0)
            _box(group, hx, y_track - sash_d * 0.5 - 0.012, inner_z0 + leaf_h * 0.45, 0.018, 0.024, 0.11, handle_color, handle_tile, bev=0.002)

        # Glazing pane (>= 6 mm thick, strictly non-coplanar with muntins/sash)
        if include_glass:
            _box(
                target_glass,
                sx_center,
                y_track,
                inner_z0 + leaf_h * 0.5,
                clear_w + 0.004,
                g_thick,
                clear_h + 0.004,
                glass_color,
                glass_tile,
                bev=0.0012,
            )


def add_door_frame(
    group: MeshGroup,
    center: Vec3,
    width: float = 0.92,
    height: float = 2.10,
    wall_thickness: float = 0.18,
    *,
    rot_z: float = 0.0,
    open_deg: float = 0.0,
    hinge_left: bool = True,
    frame_color: str = "C9B294",
    frame_tile: str = "trim_paint",
    leaf_color: str = "B88B5E",
    leaf_tile: str = "door_wood",
    handle_color: str = "C8A96A",
    handle_tile: str = "hardware_brass",
    panel_rows: int = 2,
) -> None:
    """Build a complete paneled architectural door with 3D casing, threshold, & lever handle.

    ``center`` is the floor-level center of the door opening ``(x, y, z_floor)``.
    """
    jamb_w = 0.048
    casing_w = 0.072
    casing_proj = 0.020  # 20 mm proud casing step on both sides
    frame_depth = wall_thickness + casing_proj * 2.0
    leaf_t = 0.044

    def _box(
        lx: float,
        ly: float,
        lz: float,
        sx: float,
        sy: float,
        sz: float,
        col: str,
        tl: str,
        bev: float = 0.0035,
        extra_rot: float = 0.0,
        pivot: Optional[Vec3] = None,
    ) -> None:
        pts, faces = _make_beveled_box_local((sx, sy, sz), bevel=bev)
        if abs(extra_rot) > 1e-6 and pivot is not None:
            px, py, pz = pivot
            c, s = math.cos(extra_rot), math.sin(extra_rot)
            shifted = []
            for p in pts:
                dx = (p[0] + lx) - px
                dy = (p[1] + ly) - py
                shifted.append((px + dx * c - dy * s, py + dx * s + dy * c, p[2] + lz))
            pts = shifted
        else:
            pts = [(p[0] + lx, p[1] + ly, p[2] + lz) for p in pts]
        group.solid(_transform_points(pts, center, rot_z=rot_z), faces, color=col, tile=tl)

    # Outer jambs & head
    _box(-width * 0.5 + jamb_w * 0.5, 0.0, height * 0.5, jamb_w, wall_thickness + 0.008, height, frame_color, frame_tile)
    _box(width * 0.5 - jamb_w * 0.5, 0.0, height * 0.5, jamb_w, wall_thickness + 0.008, height, frame_color, frame_tile)
    _box(0.0, 0.0, height - jamb_w * 0.5, width - jamb_w * 1.9, wall_thickness + 0.008, jamb_w, frame_color, frame_tile)

    # Raised 3D casings on both wall faces (20 mm step)
    for side in (-1, 1):
        cy = side * (wall_thickness * 0.5 + casing_proj * 0.5)
        _box(-width * 0.5 - casing_w * 0.25, cy, height * 0.5, casing_w, casing_proj, height + casing_w * 0.6, frame_color, frame_tile)
        _box(width * 0.5 + casing_w * 0.25, cy, height * 0.5, casing_w, casing_proj, height + casing_w * 0.6, frame_color, frame_tile)
        _box(0.0, cy, height + casing_w * 0.25, width + casing_w * 1.6, casing_proj, casing_w, frame_color, frame_tile)

    # Low beveled floor threshold strip (14 mm tall)
    _box(0.0, 0.0, 0.007, width - jamb_w * 1.8, wall_thickness + 0.012, 0.014, frame_color, frame_tile, bev=0.0025)

    # Paneled door leaf (actual recessed 16 mm panels + raised stiles/rails)
    leaf_w = max(0.35, width - jamb_w * 2.0 - 0.006)
    leaf_h = max(1.20, height - jamb_w - 0.018)
    z0 = 0.016
    hinge_x = -leaf_w * 0.5 if hinge_left else leaf_w * 0.5
    swing_rad = math.radians(open_deg) * (1.0 if hinge_left else -1.0)
    pivot = (hinge_x, 0.0, z0)

    # Core recessed slab (thinner than stiles so panels have real 16 mm 3D recess!)
    core_t = leaf_t - 0.016
    _box(0.0, 0.0, z0 + leaf_h * 0.5, leaf_w - 0.010, core_t, leaf_h - 0.010, leaf_color, leaf_tile, bev=0.002, extra_rot=swing_rad, pivot=pivot)

    # Full-thickness outer stiles & horizontal rails
    stile_w = 0.105
    _box(-leaf_w * 0.5 + stile_w * 0.5, 0.0, z0 + leaf_h * 0.5, stile_w, leaf_t, leaf_h, leaf_color, leaf_tile, extra_rot=swing_rad, pivot=pivot)
    _box(leaf_w * 0.5 - stile_w * 0.5, 0.0, z0 + leaf_h * 0.5, stile_w, leaf_t, leaf_h, leaf_color, leaf_tile, extra_rot=swing_rad, pivot=pivot)

    rail_positions = [z0 + 0.085, z0 + leaf_h - 0.065]
    if panel_rows >= 2:
        rail_positions.append(z0 + leaf_h * 0.44)
    for rz in rail_positions:
        _box(0.0, 0.0, rz, leaf_w - stile_w * 1.9, leaf_t, 0.11, leaf_color, leaf_tile, extra_rot=swing_rad, pivot=pivot)

    # Lever handle & escutcheon roses on both sides of the door leaf
    handle_x = (leaf_w * 0.5 - 0.065) if hinge_left else (-leaf_w * 0.5 + 0.065)
    handle_z = z0 + 1.00
    lever_dir = -1.0 if hinge_left else 1.0
    for side in (-1, 1):
        rose_y = side * (leaf_t * 0.5 + 0.007)
        _box(handle_x, rose_y, handle_z, 0.048, 0.014, 0.048, handle_color, handle_tile, bev=0.003, extra_rot=swing_rad, pivot=pivot)
        stem_y = side * (leaf_t * 0.5 + 0.032)
        _box(handle_x, stem_y, handle_z, 0.018, 0.042, 0.018, handle_color, handle_tile, bev=0.003, extra_rot=swing_rad, pivot=pivot)
        grip_y = side * (leaf_t * 0.5 + 0.056)
        _box(handle_x + lever_dir * 0.052, grip_y, handle_z, 0.115, 0.018, 0.022, handle_color, handle_tile, bev=0.004, extra_rot=swing_rad, pivot=pivot)


def add_molding_strip(
    group: MeshGroup,
    path: Sequence[Vec3],
    *,
    width: float = 0.022,
    height: float = 0.085,
    style: str = "baseboard",
    closed: bool = False,
    color: str = "EAE4D8",
    tile: str = "trim_paint",
) -> None:
    """Sweep a multi-step 3D architectural molding profile along a 3D polyline.

    ``style`` supports ``"baseboard"``, ``"crown"``, ``"chair_rail"``, and ``"casing"``.
    Every step maintains >= 12 mm total depth so LT linework captures crisp trim lines.
    """
    pts = [Vector(p) for p in path]
    if len(pts) < 2:
        return
    d = max(0.012, float(width))
    h = max(0.018, float(height))

    if style == "crown":
        profile = [
            (0.0, 0.0),
            (d * 0.55, 0.0),
            (d * 0.55, h * 0.32),
            (d, h * 0.68),
            (d, h),
            (0.0, h),
        ]
    elif style == "chair_rail":
        profile = [
            (0.0, 0.0),
            (d * 0.72, h * 0.12),
            (d, h * 0.42),
            (d, h * 0.65),
            (d * 0.65, h * 0.88),
            (0.0, h),
        ]
    elif style == "casing":
        profile = [
            (0.0, 0.0),
            (d, 0.0),
            (d, h * 0.78),
            (d * 0.68, h * 0.85),
            (d * 0.68, h),
            (0.0, h),
        ]
    else:  # baseboard
        profile = [
            (0.0, 0.0),
            (d, 0.0),
            (d, h * 0.70),
            (d * 0.62, h * 0.84),
            (d * 0.62, h),
            (0.0, h),
        ]

    up = Vector((0.0, 0.0, 1.0))
    rings: List[List[Vector]] = []
    n = len(pts)
    for i, p in enumerate(pts):
        if closed:
            prev_p = pts[(i - 1) % n]
            next_p = pts[(i + 1) % n]
            t1 = (p - prev_p).normalized()
            t2 = (next_p - p).normalized()
            tangent = (t1 + t2)
            tangent = tangent.normalized() if tangent.length > 1e-5 else t2
        elif i == 0:
            tangent = (pts[1] - pts[0]).normalized()
        elif i == n - 1:
            tangent = (pts[-1] - pts[-2]).normalized()
        else:
            t1 = (p - pts[i - 1]).normalized()
            t2 = (pts[i + 1] - p).normalized()
            tangent = (t1 + t2)
            tangent = tangent.normalized() if tangent.length > 1e-5 else t2

        side_vec = tangent.cross(up)
        if side_vec.length < 1e-5:
            side_vec = Vector((1.0, 0.0, 0.0))
        else:
            side_vec.normalize()
        # Miter scale at corners so width stays consistent without collapsing
        if 0 < i < n - 1 or closed:
            seg_dir = (pts[(i + 1) % n] - p).normalized()
            seg_side = seg_dir.cross(up)
            if seg_side.length > 1e-5:
                seg_side.normalize()
                cos_half = max(0.5, abs(side_vec.dot(seg_side)))
                side_vec = side_vec * (1.0 / cos_half)

        rings.append([p + side_vec * px + up * pz for (px, pz) in profile])

    group.rings(rings, color=color, tile=tile, closed_loop=closed)


def add_column_fluted(
    group: MeshGroup,
    base_center: Vec3,
    *,
    radius: float = 0.24,
    height: float = 3.60,
    flutes: int = 16,
    flute_depth: float = 0.015,
    color: str = "EFEAE0",
    tile: str = "marble",
    accent_color: str = "D4B26A",
    accent_tile: str = "hardware_brass",
) -> None:
    """Build a classical fluted architectural column (plinth + torus base + fluted shaft + capital)."""
    cx, cy, z0 = base_center
    r = max(0.06, float(radius))
    h = max(0.80, float(height))
    f_depth = min(max(0.012, float(flute_depth)), r * 0.14)

    plinth_h = min(0.24, h * 0.08)
    base_molding_h = min(0.18, h * 0.06)
    cap_h = min(0.28, h * 0.09)
    shaft_z0 = z0 + plinth_h + base_molding_h
    shaft_z1 = z0 + h - cap_h

    # Square beveled plinth resting cleanly on z0
    plinth_w = r * 2.55
    add_beveled_box(
        group,
        (cx, cy, z0 + plinth_h * 0.5),
        (plinth_w, plinth_w, plinth_h),
        color=color,
        tile=tile,
        bevel=0.006,
    )

    # Attic base molding (torus - scotia - torus)
    base_steps = [
        (r * 1.24, z0 + plinth_h),
        (r * 1.28, z0 + plinth_h + base_molding_h * 0.25),
        (r * 1.12, z0 + plinth_h + base_molding_h * 0.55),
        (r * 1.18, z0 + plinth_h + base_molding_h * 0.80),
        (r * 1.04, shaft_z0),
    ]
    sides_smooth = max(24, flutes * 2)
    group.rings(
        [
            [(cx + rad * math.cos(TAU * i / sides_smooth), cy + rad * math.sin(TAU * i / sides_smooth), z) for i in range(sides_smooth)]
            for (rad, z) in base_steps
        ],
        color=color,
        tile=tile,
    )

    # Fluted shaft with real concave 3D channels (entasis taper to 0.90*r at top)
    n_flutes = max(8, int(flutes))
    pts_per_flute = 4
    ring_count = n_flutes * pts_per_flute
    shaft_rings: List[List[Vec3]] = []
    z_samples = [
        (shaft_z0, 1.00, 0.0),
        (shaft_z0 + 0.04, 0.995, 1.0),
        (shaft_z0 + (shaft_z1 - shaft_z0) * 0.35, 0.985, 1.0),
        (shaft_z0 + (shaft_z1 - shaft_z0) * 0.70, 0.945, 1.0),
        (shaft_z1 - 0.04, 0.905, 1.0),
        (shaft_z1, 0.90, 0.0),
    ]
    for z_val, taper, depth_factor in z_samples:
        ring: List[Vec3] = []
        for idx in range(ring_count):
            angle = TAU * idx / ring_count
            phase = (idx % pts_per_flute) / float(pts_per_flute)
            # Ridge at phase=0, concave flute trough at phase=0.5
            groove = math.sin(math.pi * phase) ** 1.3
            rad = r * taper - f_depth * depth_factor * groove
            ring.append((cx + rad * math.cos(angle), cy + rad * math.sin(angle), z_val))
        shaft_rings.append(ring)
    group.rings(shaft_rings, color=color, tile=tile)

    # Astragal accent collar + flaring echinus capital
    collar_z = shaft_z1
    group.rings(
        [
            [(cx + rad * math.cos(TAU * i / sides_smooth), cy + rad * math.sin(TAU * i / sides_smooth), z) for i in range(sides_smooth)]
            for (rad, z) in (
                (r * 0.92, collar_z),
                (r * 0.99, collar_z + 0.025),
                (r * 0.93, collar_z + 0.050),
            )
        ],
        color=accent_color,
        tile=accent_tile,
    )

    echinus_z0 = collar_z + 0.045
    abacus_h = min(0.08, cap_h * 0.32)
    echinus_z1 = z0 + h - abacus_h
    group.rings(
        [
            [(cx + rad * math.cos(TAU * i / sides_smooth), cy + rad * math.sin(TAU * i / sides_smooth), z) for i in range(sides_smooth)]
            for (rad, z) in (
                (r * 0.92, echinus_z0),
                (r * 1.04, echinus_z0 + (echinus_z1 - echinus_z0) * 0.45),
                (r * 1.24, echinus_z1),
            )
        ],
        color=color,
        tile=tile,
    )

    # Square beveled abacus slab at top
    abacus_w = r * 2.55
    add_beveled_box(
        group,
        (cx, cy, z0 + h - abacus_h * 0.5),
        (abacus_w, abacus_w, abacus_h),
        color=color,
        tile=tile,
        bevel=0.006,
    )


def add_staircase(
    group: MeshGroup,
    origin: Vec3,
    *,
    width: float = 1.25,
    steps: int = 12,
    riser_height: float = 0.175,
    tread_depth: float = 0.28,
    nosing_overhang: float = 0.024,
    rot_z: float = 0.0,
    solid_under: bool = True,
    add_stringers: bool = True,
    tread_color: str = "C69D70",
    tread_tile: str = "floor_wood",
    riser_color: str = "EBE5DA",
    riser_tile: str = "plaster",
    stringer_color: str = "6E5844",
    stringer_tile: str = "trim_paint",
) -> None:
    """Build a watertight staircase ascending along local ``+Y`` from ``origin``.

    Every tread features a real 20-25 mm beveled nosing step for clean architectural
    silhouette & LT linework.
    """
    n = max(2, int(steps))
    w = max(0.50, float(width))
    rh = max(0.10, float(riser_height))
    td = max(0.18, float(tread_depth))
    nose = max(0.015, float(nosing_overhang))
    tread_t = 0.036

    def _box(lx: float, ly: float, lz: float, sx: float, sy: float, sz: float, col: str, tl: str, bev: float = 0.004) -> None:
        pts, faces = _make_beveled_box_local((sx, sy, sz), bevel=bev)
        pts = [(p[0] + lx, p[1] + ly, p[2] + lz) for p in pts]
        group.solid(_transform_points(pts, origin, rot_z=rot_z), faces, color=col, tile=tl)

    if solid_under:
        # Single continuous stepped monolith underneath all treads (zero abutting seam edges)
        mono_profile: List[Tuple[float, float]] = [(0.0, 0.0), (n * td, 0.0)]
        for i in range(n - 1, -1, -1):
            step_z = max(0.02, (i + 1) * rh - tread_t)
            mono_profile.append(((i + 1) * td, step_z))
            mono_profile.append((i * td, step_z))
        half_w = w * 0.5 - 0.002  # 2 mm clearance from outer stringer inner faces (zero welded edges)
        ring_l = [(-half_w, py, pz) for (py, pz) in mono_profile]
        ring_r = [(half_w, py, pz) for (py, pz) in mono_profile]
        world_rings = [_transform_points(r, origin, rot_z=rot_z) for r in (ring_l, ring_r)]
        group.rings(world_rings, color=riser_color, tile=riser_tile)

    for i in range(n):
        step_top = (i + 1) * rh
        y_front = i * td
        if not solid_under:
            # Open-riser timber block underneath each step
            _box(0.0, y_front + 0.018, step_top - rh * 0.5, w - 0.08, 0.036, rh, riser_color, riser_tile, bev=0.003)

        # Overhanging beveled tread slab
        _box(
            0.0,
            y_front + td * 0.5 - nose * 0.5,
            step_top - tread_t * 0.5,
            w + 0.016,
            td + nose,
            tread_t,
            tread_color,
            tread_tile,
            bev=0.005,
        )

    if add_stringers:
        stringer_w = 0.055
        total_run = n * td
        total_rise = n * rh
        for side in (-1, 1):
            sx = side * (w * 0.5 + stringer_w * 0.5)
            # Stepped/sloped solid stringer prism resting cleanly on z=0
            prof = [
                (0.0, 0.0),
                (total_run, 0.0),
                (total_run, total_rise + 0.04),
                (total_run - td * 0.4, total_rise + 0.04),
                (0.0, rh + 0.04),
            ]
            ring_l = [(sx - stringer_w * 0.5, py, pz) for (py, pz) in prof]
            ring_r = [(sx + stringer_w * 0.5, py, pz) for (py, pz) in prof]
            world_rings = [_transform_points(r, origin, rot_z=rot_z) for r in (ring_l, ring_r)]
            group.rings(world_rings, color=stringer_color, tile=stringer_tile)


def add_balustrade(
    group: MeshGroup,
    start: Vec3,
    end: Vec3,
    *,
    height: float = 0.96,
    baluster_spacing: float = 0.16,
    style: str = "classical",  # "classical" | "modern" | "steel"
    color: str = "EAE4DA",
    tile: str = "marble",
    rail_color: Optional[str] = None,
    rail_tile: Optional[str] = None,
) -> None:
    """Build a watertight balustrade/railing spanning ``start`` to ``end`` (supports sloped stairs)."""
    a = Vector(start)
    b = Vector(end)
    span_vec = b - a
    horiz_len = math.hypot(span_vec.x, span_vec.y)
    if horiz_len < 0.10:
        return
    h = max(0.45, float(height))
    r_col = rail_color or color
    r_tile = rail_tile or tile

    # Bottom shoe rail & profiled top handrail
    shoe_h = 0.075 if style == "classical" else 0.040
    shoe_w = 0.11 if style == "classical" else 0.050
    hand_h = 0.068 if style == "classical" else 0.048
    hand_w = 0.13 if style == "classical" else 0.062

    group.timber(a + Vector((0, 0, shoe_h * 0.5)), b + Vector((0, 0, shoe_h * 0.5)), shoe_w, shoe_h, color=r_col, tile=r_tile, bevel=0.005)
    group.timber(a + Vector((0, 0, h - hand_h * 0.5)), b + Vector((0, 0, h - hand_h * 0.5)), hand_w, hand_h, color=r_col, tile=r_tile, bevel=0.006)

    # Newel posts with beveled plinth & finial cap at both ends
    newel_w = 0.135 if style == "classical" else 0.072
    for end_pt in (a, b):
        add_beveled_box(
            group,
            (end_pt.x, end_pt.y, end_pt.z + (h + 0.04) * 0.5),
            (newel_w, newel_w, h + 0.04),
            color=color,
            tile=tile,
            bevel=0.005,
        )
        add_beveled_box(
            group,
            (end_pt.x, end_pt.y, end_pt.z + h + 0.06),
            (newel_w + 0.028, newel_w + 0.028, 0.042),
            color=r_col,
            tile=r_tile,
            bevel=0.005,
        )

    # Evenly spaced interior balusters
    usable = max(0.0, horiz_len - newel_w * 1.4)
    count = max(1, int(round(usable / max(0.08, baluster_spacing))))
    z_bot = shoe_h - 0.005
    z_top = h - hand_h + 0.005
    bal_h = max(0.15, z_top - z_bot)

    for i in range(1, count + 1):
        t = i / (count + 1)
        p = a.lerp(b, t)
        if style == "classical":
            # Turned classical stone baluster profile
            r0 = 0.036
            prof = [
                (r0 * 1.15, p.z + z_bot),
                (r0 * 0.72, p.z + z_bot + bal_h * 0.14),
                (r0 * 1.28, p.z + z_bot + bal_h * 0.36),
                (r0 * 0.88, p.z + z_bot + bal_h * 0.62),
                (r0 * 0.62, p.z + z_bot + bal_h * 0.82),
                (r0 * 1.12, p.z + z_top),
            ]
            sides = 12
            group.rings(
                [
                    [(p.x + rad * math.cos(TAU * j / sides), p.y + rad * math.sin(TAU * j / sides), zv) for j in range(sides)]
                    for (rad, zv) in prof
                ],
                color=color,
                tile=tile,
            )
        elif style == "steel":
            group.rail(
                (p.x, p.y, p.z + z_bot),
                (p.x, p.y, p.z + z_top),
                radius=0.012,
                color=color,
                sides=10,
                tile=tile,
            )
        else:
            add_beveled_box(
                group,
                (p.x, p.y, p.z + z_bot + bal_h * 0.5),
                (0.032, 0.032, bal_h),
                color=color,
                tile=tile,
                bevel=0.004,
            )


def add_table(
    group: MeshGroup,
    center: Vec3,
    *,
    width: float = 1.40,
    depth: float = 0.80,
    height: float = 0.74,
    rot_z: float = 0.0,
    top_thickness: float = 0.036,
    leg_size: float = 0.048,
    top_color: str = "C99E6E",
    top_tile: str = "wood_oak",
    frame_color: str = "4A4642",
    frame_tile: str = "metal_leg_dark",
) -> None:
    """Build a beveled table/desk with recessed apron frame, 4 legs, and grounded foot glides."""
    apron_h = 0.055
    apron_inset = 0.055
    glide_h = 0.010
    leg_h = max(0.15, height - top_thickness - glide_h)

    def _box(lx: float, ly: float, lz: float, sx: float, sy: float, sz: float, col: str, tl: str, bev: float = 0.004) -> None:
        pts, faces = _make_beveled_box_local((sx, sy, sz), bevel=bev)
        pts = [(p[0] + lx, p[1] + ly, p[2] + lz) for p in pts]
        group.solid(_transform_points(pts, center, rot_z=rot_z), faces, color=col, tile=tl)

    # Beveled tabletop
    _box(0.0, 0.0, height - top_thickness * 0.5, width, depth, top_thickness, top_color, top_tile, bev=0.005)

    # Recessed structural apron rails
    apron_z = height - top_thickness - apron_h * 0.5
    inner_w = max(0.12, width - apron_inset * 2.0 - leg_size)
    inner_d = max(0.12, depth - apron_inset * 2.0 - leg_size)
    for sy in (-1, 1):
        _box(0.0, sy * (depth * 0.5 - apron_inset - leg_size * 0.5), apron_z, inner_w, 0.024, apron_h, frame_color, frame_tile, bev=0.003)
    for sx in (-1, 1):
        _box(sx * (width * 0.5 - apron_inset - leg_size * 0.5), 0.0, apron_z, 0.024, inner_d, apron_h, frame_color, frame_tile, bev=0.003)

    # 4 legs + grounded rubber/brass foot glides resting cleanly at z = center[2]
    for sx in (-1, 1):
        for sy in (-1, 1):
            lx = sx * (width * 0.5 - apron_inset - leg_size * 0.5)
            ly = sy * (depth * 0.5 - apron_inset - leg_size * 0.5)
            _box(lx, ly, glide_h * 0.5, leg_size + 0.004, leg_size + 0.004, glide_h, "3A3A3A", frame_tile, bev=0.002)
            _box(lx, ly, glide_h + leg_h * 0.5, leg_size, leg_size, leg_h, frame_color, frame_tile, bev=0.004)


def add_chair(
    group: MeshGroup,
    center: Vec3,
    *,
    seat_width: float = 0.44,
    seat_depth: float = 0.44,
    seat_height: float = 0.45,
    back_height: float = 0.84,
    rot_z: float = 0.0,
    seat_color: str = "C99E6E",
    seat_tile: str = "wood_oak",
    frame_color: str = "46423E",
    frame_tile: str = "metal_leg_dark",
    cushion_color: Optional[str] = "D8CFC0",
    cushion_tile: str = "fabric_linen",
) -> None:
    """Build a beveled ergonomic chair facing local ``-Y`` (backrest at ``+Y``)."""
    leg_w = 0.030
    seat_t = 0.028
    cush_t = 0.032 if cushion_color else 0.0
    seat_slab_z = seat_height - cush_t - seat_t * 0.5
    leg_h = max(0.15, seat_height - cush_t - seat_t)

    def _box(lx: float, ly: float, lz: float, sx: float, sy: float, sz: float, col: str, tl: str, bev: float = 0.004) -> None:
        pts, faces = _make_beveled_box_local((sx, sy, sz), bevel=bev)
        pts = [(p[0] + lx, p[1] + ly, p[2] + lz) for p in pts]
        group.solid(_transform_points(pts, center, rot_z=rot_z), faces, color=col, tile=tl)

    # 4 legs grounded on center[2]
    inset_x = seat_width * 0.5 - leg_w * 0.75
    inset_y = seat_depth * 0.5 - leg_w * 0.75
    for sx in (-1, 1):
        # Front legs stop under seat
        _box(sx * inset_x, -inset_y, leg_h * 0.5, leg_w, leg_w, leg_h, frame_color, frame_tile, bev=0.003)
        # Rear legs continue cleanly up into backrest stiles
        _box(sx * inset_x, inset_y, back_height * 0.5, leg_w, leg_w, back_height, frame_color, frame_tile, bev=0.003)
        # Side stretcher bars
        _box(sx * inset_x, 0.0, leg_h * 0.34, leg_w * 0.72, inset_y * 2.0 - leg_w * 0.5, 0.022, frame_color, frame_tile, bev=0.0025)

    # Front/back cross stretchers
    _box(0.0, -inset_y, leg_h * 0.34, inset_x * 2.0 - leg_w * 0.5, 0.022, 0.022, frame_color, frame_tile, bev=0.0025)
    _box(0.0, inset_y, leg_h * 0.34, inset_x * 2.0 - leg_w * 0.5, 0.022, 0.022, frame_color, frame_tile, bev=0.0025)

    # Beveled seat slab + optional upholstered cushion pad
    _box(0.0, 0.0, seat_slab_z, seat_width, seat_depth, seat_t, seat_color, seat_tile, bev=0.005)
    if cushion_color:
        _box(0.0, -0.008, seat_height - cush_t * 0.5, seat_width - 0.024, seat_depth - 0.036, cush_t, cushion_color, cushion_tile, bev=0.007)

    # Dual horizontal contoured backrest slats
    back_span = inset_x * 2.0 + leg_w * 0.2
    for frac, slat_h in ((0.68, 0.085), (0.91, 0.110)):
        bz = seat_height + (back_height - seat_height) * (frac - 0.35) / 0.65
        _box(0.0, inset_y - 0.004, bz, back_span, 0.024, slat_h, seat_color, seat_tile, bev=0.005)


def add_chair_table(
    group: MeshGroup,
    center: Vec3,
    *,
    table_width: float = 1.40,
    table_depth: float = 0.80,
    table_height: float = 0.74,
    chairs: int = 2,
    chair_pullout: float = 0.24,
    rot_z: float = 0.0,
    top_color: str = "C99E6E",
    top_tile: str = "wood_oak",
    frame_color: str = "4A4642",
    frame_tile: str = "metal_leg_dark",
    cushion_color: Optional[str] = "DDD4C6",
    cushion_tile: str = "fabric_linen",
) -> None:
    """Build a coordinated table + chairs set (1, 2, or 4 chairs) with realistic clearances."""
    add_table(
        group,
        center,
        width=table_width,
        depth=table_depth,
        height=table_height,
        rot_z=rot_z,
        top_color=top_color,
        top_tile=top_tile,
        frame_color=frame_color,
        frame_tile=frame_tile,
    )

    c_cos = math.cos(rot_z)
    c_sin = math.sin(rot_z)

    def _world_xy(lx: float, ly: float) -> Vec3:
        return (
            center[0] + lx * c_cos - ly * c_sin,
            center[1] + lx * c_sin + ly * c_cos,
            center[2],
        )

    y_off = table_depth * 0.5 + chair_pullout
    placements: List[Tuple[float, float, float]] = []
    if chairs == 1:
        placements.append((0.0, -y_off, math.pi))
    elif chairs == 2:
        placements.append((0.0, -y_off, math.pi))
        placements.append((0.0, y_off, 0.0))
    else:
        xs = (-table_width * 0.26, table_width * 0.26)
        for lx in xs:
            placements.append((lx, -y_off, math.pi))
            placements.append((lx, y_off, 0.0))

    for lx, ly, local_yaw in placements[: max(0, int(chairs))]:
        add_chair(
            group,
            _world_xy(lx, ly),
            rot_z=rot_z + local_yaw,
            seat_color=top_color,
            seat_tile=top_tile,
            frame_color=frame_color,
            frame_tile=frame_tile,
            cushion_color=cushion_color,
            cushion_tile=cushion_tile,
        )


def add_pipe_frame(
    group: MeshGroup,
    waypoints: Sequence[Vec3],
    *,
    radius: float = 0.022,
    sides: int = 12,
    closed: bool = False,
    bend_subdiv: int = 3,
    bend_radius: float = 0.055,
    flange_ends: bool = True,
    color: str = "6E767C",
    tile: str = "iron_dark",
    flange_color: Optional[str] = None,
    flange_tile: Optional[str] = None,
) -> None:
    """Build a smooth watertight elbowed pipe/conduit/frame with optional end mounting flanges."""
    raw = [Vector(p) for p in waypoints]
    if len(raw) < 2:
        return

    # Fillet interior corners so pipe bends read cleanly without pinching
    filleted: List[Vector] = []
    n = len(raw)
    for i, p in enumerate(raw):
        if not closed and (i == 0 or i == n - 1):
            filleted.append(p)
            continue
        prev_p = raw[(i - 1) % n]
        next_p = raw[(i + 1) % n]
        v_in = p - prev_p
        v_out = next_p - p
        l_in, l_out = v_in.length, v_out.length
        if l_in < 1e-4 or l_out < 1e-4:
            continue
        d_in = v_in / l_in
        d_out = v_out / l_out
        if d_in.dot(d_out) > 0.995:
            filleted.append(p)
            continue
        cut = min(bend_radius, l_in * 0.35, l_out * 0.35)
        p_a = p - d_in * cut
        p_b = p + d_out * cut
        steps = max(2, int(bend_subdiv))
        for k in range(steps + 1):
            t = k / float(steps)
            # Quadratic Bezier elbow curve
            q = (1.0 - t) ** 2 * p_a + 2.0 * (1.0 - t) * t * p + (t**2) * p_b
            if not filleted or (q - filleted[-1]).length > 1e-4:
                filleted.append(q)

    if len(filleted) < 2:
        return

    # Parallel-transport Frenet frame to eliminate twisting along arbitrary 3D paths
    rings: List[List[Vector]] = []
    axis: Optional[Vector] = None
    m = len(filleted)
    for i, pt in enumerate(filleted):
        before = filleted[(i - 1) % m] if closed or i > 0 else filleted[0]
        after = filleted[(i + 1) % m] if closed or i + 1 < m else filleted[-1]
        tangent = after - before
        if tangent.length < 1e-6:
            tangent = Vector((0.0, 0.0, 1.0))
        else:
            tangent.normalize()
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
        side = tangent.cross(axis).normalized()
        rings.append(
            [
                pt + radius * (math.cos(TAU * j / sides) * axis + math.sin(TAU * j / sides) * side)
                for j in range(sides)
            ]
        )

    group.rings(rings, color=color, tile=tile, closed_loop=closed)

    # End mounting flanges
    if flange_ends and not closed:
        f_col = flange_color or color
        f_tile = flange_tile or tile
        for end_idx, neighbor_idx in ((0, 1), (-1, -2)):
            p0 = filleted[end_idx]
            d = (filleted[neighbor_idx] - p0)
            if d.length > 1e-5:
                d.normalize()
                group.rail(
                    tuple(p0),
                    tuple(p0 + d * max(0.014, radius * 0.7)),
                    radius=radius * 1.85,
                    color=f_col,
                    sides=max(10, sides),
                    tile=f_tile,
                )


def add_ceiling_coffer(
    group: MeshGroup,
    center: Vec3,
    width: float,
    depth: float,
    *,
    slab_thickness: float = 0.14,
    coffer_drop: float = 0.16,
    border_width: float = 0.55,
    color: str = "F4F0E8",
    tile: str = "ceiling_plaster",
    beam_color: str = "E8E2D6",
    beam_tile: str = "ceiling_beam",
    include_light_panel: bool = True,
    light_tile: str = "emissive_warm",
) -> None:
    """Build a Korean apartment / architectural coffered ceiling (우물천장) with recessed glow panel.

    ``center`` is ``(cx, cy, ceiling_soffit_z)`` — slab extends upward from ``ceiling_soffit_z``
    while the perimeter coffer drops downward by ``coffer_drop`` (>= 120 mm step).
    """
    cx, cy, z_top = center
    # Upper main ceiling slab
    add_beveled_box(
        group,
        (cx, cy, z_top + slab_thickness * 0.5),
        (width, depth, slab_thickness),
        color=color,
        tile=tile,
        bevel=0.004,
    )
    # 4 perimeter dropped bulkhead beams forming the central recess
    # Slight 3 mm inset from outer slab and 2 mm vertical embed prevent coincident weld edges
    bw = min(border_width, width * 0.25, depth * 0.25)
    drop_z = z_top - coffer_drop * 0.5 + 0.002
    beam_h = coffer_drop + 0.004
    eff_w = max(0.30, width - 0.006)
    eff_d = max(0.30, depth - 0.006)
    add_beveled_box(group, (cx, cy - eff_d * 0.5 + bw * 0.5, drop_z), (eff_w, bw, beam_h), color=beam_color, tile=beam_tile, bevel=0.004)
    add_beveled_box(group, (cx, cy + eff_d * 0.5 - bw * 0.5, drop_z), (eff_w, bw, beam_h), color=beam_color, tile=beam_tile, bevel=0.004)
    inner_d = max(0.20, eff_d - bw * 2.0 - 0.004)
    add_beveled_box(group, (cx - eff_w * 0.5 + bw * 0.5, cy, drop_z), (bw, inner_d, beam_h), color=beam_color, tile=beam_tile, bevel=0.004)
    add_beveled_box(group, (cx + eff_w * 0.5 - bw * 0.5, cy, drop_z), (bw, inner_d, beam_h), color=beam_color, tile=beam_tile, bevel=0.004)

    if include_light_panel:
        # Flush framed LED ceiling fixture suspended 18 mm below the coffer soffit
        lw = min(1.20, max(0.40, width - bw * 2.6))
        ld = min(0.65, max(0.30, depth - bw * 2.6))
        add_beveled_box(group, (cx, cy, z_top - 0.016), (lw + 0.06, ld + 0.06, 0.024), color="D8D6D0", tile="ceiling_metal", bevel=0.003)
        add_beveled_box(group, (cx, cy, z_top - 0.032), (lw, ld, 0.016), color="FFFFFF", tile=light_tile, bevel=0.003)


# ---------------------------------------------------------------------------
# Organic Architectural Helpers (Watertight 0-Defect Manifold Geometry)
# ---------------------------------------------------------------------------


def _shift_hex_luminance(hex_color: str, factor: float) -> str:
    """Scale an sRGB hex color's luminance gently for natural organic foliage variation."""
    clean = hex_color.lstrip("#").strip()
    r = max(0, min(255, int(round(int(clean[0:2], 16) * factor))))
    g = max(0, min(255, int(round(int(clean[2:4], 16) * factor))))
    b = max(0, min(255, int(round(int(clean[4:6], 16) * factor))))
    return f"{r:02X}{g:02X}{b:02X}"


def add_pleated_curtain(
    group: MeshGroup,
    center: Vec3,
    width: float,
    height: float,
    *,
    depth: float = 0.095,
    pleats: int = 6,
    thickness: float = 0.012,
    rot_z: float = 0.0,
    tieback_height: Optional[float] = None,
    tieback_pull: float = 0.24,
    tieback_side: int = 1,
    include_rod: bool = True,
    rod_overhang: float = 0.14,
    rod_radius: float = 0.014,
    include_rings: bool = True,
    color: str = "F0EAE0",
    tile: str = "fabric_linen",
    rod_color: str = "4A4540",
    rod_tile: str = "metal_leg_dark",
    tieback_color: str = "C9A86A",
    tieback_tile: str = "metal_brass_trim",
    rod_group: Optional[MeshGroup] = None,
) -> None:
    """Build a watertight sinusoidal multi-pleat curtain with optional tieback, rod & rings.

    ``center`` is the bottom-center ``(x, y, z_bottom)`` of the drapery panel.
    ``tieback_height`` accepts a height fraction ``(0.15..0.85)`` or absolute metres
    above ``z_bottom``; when set, gathers the drapery smoothly into a pinched waist
    wrapped by a sculpted 3D tieback band with clean non-welding clearance.
    """
    w = max(0.20, float(width))
    h = max(0.45, float(height))
    d = max(0.030, float(depth))
    n_pleats = max(2, int(pleats))
    nu = max(12, n_pleats * 4)
    nz = 10

    tz: Optional[float] = None
    if tieback_height is not None:
        raw_tz = float(tieback_height)
        tz = (raw_tz * h) if raw_tz <= 1.0 else raw_tz
        tz = max(h * 0.18, min(h * 0.82, tz))

    def _slice_centerline(z_local: float) -> Tuple[List[Tuple[float, float]], float]:
        zf = z_local / h
        base_amp = (d * 0.5) * (0.72 + 0.36 * (1.0 - zf))
        x_scale = 1.0
        x_shift = 0.0
        amp_scale = 1.0
        if tz is not None:
            sigma = max(0.18, h * 0.21)
            pinch = math.exp(-(((z_local - tz) / sigma) ** 2))
            x_scale = 1.0 - 0.58 * pinch
            x_shift = float(tieback_side) * float(tieback_pull) * w * pinch
            amp_scale = 1.0 - 0.44 * pinch
        amp = max(0.012, base_amp * amp_scale)
        pts2d: List[Tuple[float, float]] = []
        for k in range(nu + 1):
            s = k / float(nu)
            lx = (s - 0.5) * w * x_scale + x_shift
            ly = amp * math.sin(s * n_pleats * TAU)
            pts2d.append((lx, ly))
        eff_w = w * x_scale
        return pts2d, eff_w

    drape_rings: List[List[Vec3]] = []
    for iz in range(nz + 1):
        z_val = (iz / float(nz)) * h
        pts2d, eff_w = _slice_centerline(z_val)
        # Keep thickness strictly bounded below wave curvature radius so walls never cross
        half_t = max(0.0022, min(float(thickness) * 0.5, eff_w / max(18.0, n_pleats * 12.0), 0.008))
        front: List[Vec3] = []
        back: List[Vec3] = []
        m = len(pts2d)
        for k, (px, py) in enumerate(pts2d):
            if k == 0:
                tx, ty = pts2d[1][0] - px, pts2d[1][1] - py
            elif k == m - 1:
                tx, ty = px - pts2d[m - 2][0], py - pts2d[m - 2][1]
            else:
                tx, ty = pts2d[k + 1][0] - pts2d[k - 1][0], pts2d[k + 1][1] - pts2d[k - 1][1]
            tlen = math.hypot(tx, ty)
            if tlen < 1e-6:
                nx, ny = 0.0, 1.0
            else:
                nx, ny = -ty / tlen, tx / tlen
            front.append((px + nx * half_t, py + ny * half_t, z_val))
            back.append((px - nx * half_t, py - ny * half_t, z_val))
        ring_local = front + list(reversed(back))
        drape_rings.append(_transform_points(ring_local, center, rot_z=rot_z))

    group.rings(drape_rings, color=color, tile=tile)

    # Sculpted 3D tieback band around pinched waist (with >= 8 mm radial clearance -> 0 welded edges)
    if tz is not None:
        pts_tz, _ = _slice_centerline(tz)
        xs = [p[0] for p in pts_tz]
        ys = [p[1] for p in pts_tz]
        cx_tb = 0.5 * (min(xs) + max(xs))
        cy_tb = 0.5 * (min(ys) + max(ys))
        rx_tb = max(0.032, 0.5 * (max(xs) - min(xs)) + 0.016)
        ry_tb = max(0.028, 0.5 * (max(ys) - min(ys)) + 0.016)
        band_sides = 18
        band_steps = (
            (tz - 0.024, 0.98),
            (tz - 0.010, 1.06),
            (tz + 0.010, 1.06),
            (tz + 0.024, 0.98),
        )
        tb_rings: List[List[Vec3]] = []
        for bz, sc in band_steps:
            ring_l = [
                (
                    cx_tb + rx_tb * sc * math.cos(TAU * j / band_sides),
                    cy_tb + ry_tb * sc * math.sin(TAU * j / band_sides),
                    bz,
                )
                for j in range(band_sides)
            ]
            tb_rings.append(_transform_points(ring_l, center, rot_z=rot_z))
        group.rings(tb_rings, color=tieback_color, tile=tieback_tile)

    # Curtain rod, turned finials, wall brackets, and hanging torus rings
    if include_rod:
        r_grp = rod_group if rod_group is not None else group
        rr = max(0.008, float(rod_radius))
        z_rod = h + rr + 0.024  # Clean 24 mm vertical gap above drapery top
        x_end = w * 0.5 + max(0.04, float(rod_overhang))
        p_left = _transform_points([(-x_end, 0.0, z_rod)], center, rot_z=rot_z)[0]
        p_right = _transform_points([(x_end, 0.0, z_rod)], center, rot_z=rot_z)[0]
        r_grp.rail(p_left, p_right, radius=rr, color=rod_color, sides=12, tile=rod_tile)

        # Turned spherical finial caps separated by 3 mm outside rod ends
        for side in (-1.0, 1.0):
            fx0 = side * (x_end + 0.003)
            fin_profile = (
                (0.000, rr * 0.65),
                (0.010, rr * 1.45),
                (0.024, rr * 1.65),
                (0.036, rr * 1.25),
                (0.044, rr * 0.50),
            )
            fin_rings: List[List[Vec3]] = []
            for dx, rad in fin_profile:
                lx = fx0 + side * dx
                ring_l = [
                    (lx, rad * math.cos(TAU * j / 10), z_rod + rad * math.sin(TAU * j / 10))
                    for j in range(10)
                ]
                fin_rings.append(_transform_points(ring_l, center, rot_z=rot_z))
            r_grp.rings(fin_rings, color=tieback_color, tile=tieback_tile)

            # Wall mounting bracket arms behind rod
            bx = side * (w * 0.5 + max(0.02, float(rod_overhang) * 0.45))
            b_pts, b_faces = _make_beveled_box_local((0.022, 0.075, 0.022), bevel=0.003)
            b_pts = [(p[0] + bx, p[1] + 0.046, p[2] + z_rod) for p in b_pts]
            r_grp.solid(_transform_points(b_pts, center, rot_z=rot_z), b_faces, color=rod_color, tile=rod_tile)

        if include_rings:
            n_rings = max(4, min(n_pleats + 2, 10))
            r_maj = rr + 0.010  # >= 6 mm air gap around rod
            r_min = 0.004
            maj_segs = 12
            min_segs = 6
            for ri in range(n_rings):
                frac = ri / float(max(1, n_rings - 1))
                rx_pos = (frac - 0.5) * (w * 0.94)
                torus_rings: List[List[Vec3]] = []
                for mj in range(maj_segs):
                    ang = TAU * mj / maj_segs
                    cy_c = r_maj * math.cos(ang)
                    cz_c = z_rod - 0.004 + r_maj * math.sin(ang)
                    t_ring: List[Vec3] = []
                    for mn in range(min_segs):
                        phi = TAU * mn / min_segs
                        rad_off = r_min * math.cos(phi)
                        lx = rx_pos + r_min * math.sin(phi)
                        ly = (r_maj + rad_off) * math.cos(ang)
                        lz = z_rod - 0.004 + (r_maj + rad_off) * math.sin(ang)
                        t_ring.append((lx, ly, lz))
                    torus_rings.append(_transform_points(t_ring, center, rot_z=rot_z))
                r_grp.rings(torus_rings, color=tieback_color, tile=tieback_tile, closed_loop=True)


def add_curved_foliage_plant(
    group: MeshGroup,
    base_center: Vec3,
    *,
    species: str = "monstera",
    height: float = 1.25,
    pot_radius: float = 0.17,
    pot_height: float = 0.34,
    leaf_count: int = 11,
    rot_z: float = 0.0,
    seed: int = 42,
    pot_color: str = "C97A53",
    pot_tile: str = "ceramic_matte",
    soil_color: str = "46362A",
    soil_tile: str = "stone_prop",
    stem_color: str = "4B6B3E",
    stem_tile: str = "foliage",
    leaf_color: str = "3D6A39",
    leaf_tile: str = "foliage",
    pot_group: Optional[MeshGroup] = None,
) -> None:
    """Build a watertight potted plant with curved 3D beveled leaves (zero flat cards).

    ``species`` supports ``"monstera"``, ``"ficus"``, and ``"palm"``.
    ``base_center`` is the floor contact center ``(x, y, z_floor)`` of the planter pot.
    """
    p_grp = pot_group if pot_group is not None else group
    h = max(0.40, float(height))
    pr = max(0.08, float(pot_radius))
    ph = max(0.14, min(h * 0.45, float(pot_height)))
    n_leaves = max(5, int(leaf_count))

    # 1. Turned ceramic planter pot resting cleanly on z = base_center[2]
    pot_sides = 16
    pot_prof = (
        (pr * 0.72, 0.000),
        (pr * 0.76, ph * 0.08),
        (pr * 0.90, ph * 0.48),
        (pr * 1.00, ph * 0.88),
        (pr * 1.05, ph * 0.93),
        (pr * 1.04, ph),
        (pr * 0.92, ph),
    )
    pot_rings = [
        _transform_points(
            [(rad * math.cos(TAU * i / pot_sides), rad * math.sin(TAU * i / pot_sides), zv) for i in range(pot_sides)],
            base_center,
            rot_z=rot_z,
        )
        for (rad, zv) in pot_prof
    ]
    p_grp.rings(pot_rings, color=pot_color, tile=pot_tile)

    # 2. Separate organic soil mound inset 10 mm inside pot wall (zero welded edges)
    soil_r = pr * 0.86
    soil_z = ph - 0.032
    soil_prof = (
        (soil_r * 0.96, soil_z - 0.025),
        (soil_r, soil_z),
        (soil_r * 0.62, soil_z + 0.020),
        (soil_r * 0.16, soil_z + 0.030),
    )
    soil_rings = [
        _transform_points(
            [(rad * math.cos(TAU * i / 12), rad * math.sin(TAU * i / 12), zv) for i in range(12)],
            base_center,
            rot_z=rot_z,
        )
        for (rad, zv) in soil_prof
    ]
    p_grp.rings(soil_rings, color=soil_color, tile=soil_tile)

    def _add_curved_leaf(
        origin_local: Vec3,
        azim: float,
        length: float,
        max_w: float,
        rise: float,
        droop: float,
        roll: float,
        col_hex: str,
        width_curve: Sequence[float],
    ) -> None:
        """Emit one watertight V-cupped 3D beveled leaf lofted along a parabolic arch."""
        ox, oy, oz = origin_local
        dx = math.cos(azim)
        dy = math.sin(azim)
        sx = -dy
        sy = dx
        cos_r, sin_r = math.cos(roll), math.sin(roll)
        ts = (0.0, 0.18, 0.42, 0.68, 0.88, 1.0)
        leaf_rings: List[List[Vec3]] = []
        for idx, t in enumerate(ts):
            along = t * length
            # Smooth upward arch then graceful botanical tip droop
            z_off = rise * math.sin(math.pi * t * 0.82) - droop * (t**2.2)
            dz_dt = (rise * 0.82 * math.pi * math.cos(math.pi * t * 0.82) - droop * 2.2 * (t**1.2)) / max(length, 0.05)
            # Local tangent-perpendicular up vector in the leaf vertical plane
            t_len = math.hypot(1.0, dz_dt)
            up_r = -dz_dt / t_len
            up_z = 1.0 / t_len

            hw = max(0.0055, 0.5 * max_w * width_curve[idx])
            cup = hw * 0.18
            thick_mid = max(0.0032, min(0.007, max_w * 0.035))
            thick_edge = max(0.0020, thick_mid * 0.55)

            # 6-point closed cupped beveled leaf cross-section (local lateral u, normal v)
            sec_uv = (
                (-hw, cup),
                (0.0, thick_mid * 0.55),
                (hw, cup),
                (hw * 0.90, cup - thick_edge),
                (0.0, -thick_mid * 0.55),
                (-hw * 0.90, cup - thick_edge),
            )
            ring_local: List[Vec3] = []
            for lu, lv in sec_uv:
                ru = lu * cos_r - lv * sin_r
                rv = lu * sin_r + lv * cos_r
                px = ox + dx * (along + rv * up_r) + sx * ru
                py = oy + dy * (along + rv * up_r) + sy * ru
                pz = oz + z_off + rv * up_z
                ring_local.append((px, py, pz))
            leaf_rings.append(_transform_points(ring_local, base_center, rot_z=rot_z))
        group.rings(leaf_rings, color=col_hex, tile=leaf_tile)

    def _add_curved_stem(p0: Vec3, p1: Vec3, p2: Vec3, r_base: float, r_tip: float, col_hex: str) -> None:
        """Emit a smooth tapered quadratic-Bezier watertight stem."""
        v0, v1, v2 = Vector(p0), Vector(p1), Vector(p2)
        steps = 5
        sides = 7
        stem_rings: List[List[Vec3]] = []
        for i in range(steps + 1):
            t = i / float(steps)
            pos = ((1.0 - t) ** 2) * v0 + 2.0 * (1.0 - t) * t * v1 + (t**2) * v2
            tang = (2.0 * (1.0 - t) * (v1 - v0) + 2.0 * t * (v2 - v1))
            tang = tang.normalized() if tang.length > 1e-5 else Vector((0.0, 0.0, 1.0))
            ref = Vector((0.0, 0.0, 1.0)) if abs(tang.z) < 0.85 else Vector((1.0, 0.0, 0.0))
            n1 = tang.cross(ref).normalized()
            n2 = tang.cross(n1).normalized()
            rad = max(0.004, r_base * (1.0 - t) + r_tip * t)
            r_local = [tuple(pos + rad * (math.cos(TAU * j / sides) * n1 + math.sin(TAU * j / sides) * n2)) for j in range(sides)]
            stem_rings.append(_transform_points(r_local, base_center, rot_z=rot_z))
        group.rings(stem_rings, color=col_hex, tile=stem_tile)

    canopy_h = max(0.24, h - ph)
    golden = 2.39996323

    if species == "ficus":
        # Branching woody trunk + curved ficus leaf rosettes
        trunk_h = canopy_h * 0.56
        _add_curved_stem(
            (0.0, 0.0, soil_z + 0.015),
            (0.025, -0.020, soil_z + trunk_h * 0.55),
            (-0.015, 0.018, soil_z + trunk_h),
            r_base=max(0.014, pr * 0.13),
            r_tip=max(0.008, pr * 0.07),
            col_hex="6B523B",
        )
        n_branches = max(4, min(6, n_leaves // 2))
        per_branch = max(2, int(round(n_leaves / float(n_branches))))
        w_curve = (0.14, 0.62, 1.00, 0.88, 0.44, 0.10)
        for bi in range(n_branches):
            b_az = seed * 0.37 + bi * golden
            b_frac = 0.58 + 0.42 * (bi / float(max(1, n_branches - 1)))
            bz0 = soil_z + trunk_h * b_frac
            b_reach = pr * (0.85 + 0.45 * (1.0 - b_frac * 0.3))
            b_end = (
                b_reach * math.cos(b_az),
                b_reach * math.sin(b_az),
                soil_z + trunk_h + canopy_h * (0.20 + 0.24 * (bi % 3) / 2.0),
            )
            b_mid = (b_end[0] * 0.45, b_end[1] * 0.45, 0.5 * (bz0 + b_end[2]) + 0.04)
            _add_curved_stem((0.0, 0.0, bz0), b_mid, b_end, r_base=0.009, r_tip=0.005, col_hex="634D38")
            for li in range(per_branch):
                laz = b_az + (li - 0.5 * (per_branch - 1)) * 0.95
                l_len = max(0.14, canopy_h * (0.28 + 0.05 * ((bi + li) % 3)))
                l_w = l_len * 0.56
                col = _shift_hex_luminance(leaf_color, 0.88 + 0.22 * ((bi + li) % 3) / 2.0)
                _add_curved_leaf(
                    (b_end[0] + 0.012 * math.cos(laz), b_end[1] + 0.012 * math.sin(laz), b_end[2]),
                    laz,
                    length=l_len,
                    max_w=l_w,
                    rise=l_len * 0.22,
                    droop=l_len * 0.26,
                    roll=0.14 * ((li % 2) * 2 - 1),
                    col_hex=col,
                    width_curve=w_curve,
                )

    elif species == "palm":
        # Arching fountain palm fronds radiating from central crown
        w_curve = (0.18, 0.78, 1.00, 0.76, 0.40, 0.09)
        for i in range(n_leaves):
            tier = i / float(max(1, n_leaves - 1))
            az = seed * 0.53 + i * golden
            s_len = canopy_h * (0.38 + 0.34 * tier)
            spread = pr * (0.45 + 0.65 * (1.0 - tier * 0.5))
            p0 = (0.018 * math.cos(az), 0.018 * math.sin(az), soil_z + 0.018)
            p1 = (spread * 0.45 * math.cos(az), spread * 0.45 * math.sin(az), soil_z + s_len * 0.68)
            p2 = (spread * math.cos(az), spread * math.sin(az), soil_z + s_len)
            _add_curved_stem(p0, p1, p2, r_base=0.008, r_tip=0.0045, col_hex=stem_color)
            frond_len = canopy_h * (0.58 + 0.24 * (1.0 - tier * 0.4))
            frond_w = max(0.06, frond_len * 0.22)
            col = _shift_hex_luminance(leaf_color, 0.86 + 0.26 * tier)
            _add_curved_leaf(
                (p2[0] + 0.008 * math.cos(az), p2[1] + 0.008 * math.sin(az), p2[2] + 0.006),
                az,
                length=frond_len,
                max_w=frond_w,
                rise=frond_len * 0.26,
                droop=frond_len * 0.52,
                roll=0.12 * ((i % 2) * 2 - 1),
                col_hex=col,
                width_curve=w_curve,
            )

    else:
        # Broad sculpted Monstera deliciosa / philodendron cluster
        w_curve = (0.16, 0.76, 1.00, 0.88, 0.50, 0.11)
        for i in range(n_leaves):
            tier = i / float(max(1, n_leaves - 1))
            az = seed * 0.41 + i * golden
            stem_h = canopy_h * (0.34 + 0.46 * tier)
            stem_r = pr * (0.95 - 0.32 * tier)
            p0 = (0.020 * math.cos(az), 0.020 * math.sin(az), soil_z + 0.018)
            p1 = (stem_r * 0.42 * math.cos(az), stem_r * 0.42 * math.sin(az), soil_z + stem_h * 0.70)
            p2 = (stem_r * math.cos(az), stem_r * math.sin(az), soil_z + stem_h)
            _add_curved_stem(p0, p1, p2, r_base=0.009, r_tip=0.005, col_hex=stem_color)

            l_len = max(0.16, canopy_h * (0.36 + 0.14 * (1.0 - abs(tier - 0.5))))
            l_w = l_len * 0.74
            col = _shift_hex_luminance(leaf_color, 0.84 + 0.28 * tier)
            _add_curved_leaf(
                (p2[0] + 0.008 * math.cos(az), p2[1] + 0.008 * math.sin(az), p2[2] + 0.005),
                az,
                length=l_len,
                max_w=l_w,
                rise=l_len * 0.22,
                droop=l_len * 0.34,
                roll=0.16 * ((i % 2) * 2 - 1),
                col_hex=col,
                width_curve=w_curve,
            )


def add_tiered_crystal_chandelier(
    group: MeshGroup,
    mount_center: Vec3,
    *,
    tiers: int = 3,
    radius: float = 0.95,
    drop_height: float = 1.45,
    chain_length: float = 0.48,
    arms_per_tier: Sequence[int] = (12, 8, 6),
    rot_z: float = 0.0,
    metal_color: str = "D8B464",
    metal_tile: str = "ceiling_brass",
    crystal_color: str = "E8F5FC",
    crystal_tile: str = "glass_clear",
    candle_color: str = "FAF4E4",
    candle_tile: str = "ceiling_plaster",
    flame_color: str = "FFE096",
    flame_tile: str = "emissive_amber",
    emissive_group: Optional[MeshGroup] = None,
) -> None:
    """Build a watertight multi-tier gilded crystal chandelier hanging from ``mount_center``.

    Shared hero ceiling centerpiece for Romance Fantasy palaces, grand halls, and noble studies.
    Hangs downward from ``mount_center = (cx, cy, z_ceiling)`` to
    ``z_ceiling - chain_length - drop_height`` with sculpted central baluster, scrollwork arms,
    drip bobeches, candles, emissive flame teardrops, and faceted crystal prisms.
    """
    cx, cy, z_ceil = mount_center
    e_grp = emissive_group if emissive_group is not None else group
    n_tiers = max(1, min(4, int(tiers)))
    rad = max(0.28, float(radius))
    drop = max(0.55, float(drop_height))
    chain = max(0.14, float(chain_length))

    z_body_top = z_ceil - chain
    z_body_bot = z_body_top - drop

    def _lathe(profile_rz: Sequence[Tuple[float, float]], col: str, tl: str, sides: int = 12, dst: MeshGroup = group, ox: float = 0.0, oy: float = 0.0) -> None:
        rings = [
            _transform_points(
                [(ox + r * math.cos(TAU * i / sides), oy + r * math.sin(TAU * i / sides), zv) for i in range(sides)],
                (cx, cy, 0.0),
                rot_z=rot_z,
            )
            for (r, zv) in profile_rz
        ]
        dst.rings(rings, color=col, tile=tl)

    # 1. Sculpted ceiling rosette medallion + suspension stem/chain collar
    med_r = min(0.32, rad * 0.34)
    _lathe(
        (
            (med_r, z_ceil - 0.004),
            (med_r * 0.94, z_ceil - 0.032),
            (med_r * 0.62, z_ceil - 0.068),
            (med_r * 0.34, z_ceil - 0.095),
            (0.032, z_ceil - 0.115),
        ),
        metal_color,
        metal_tile,
        sides=16,
    )
    group.rail(
        (cx, cy, z_ceil - 0.118),
        (cx, cy, z_body_top + 0.008),
        radius=0.018,
        color=metal_color,
        sides=10,
        tile=metal_tile,
    )

    # 2. Turned central gilded & crystal baluster spine + grand bottom crystal finial
    spine_r = max(0.042, rad * 0.075)
    _lathe(
        (
            (spine_r * 0.45, z_body_top),
            (spine_r * 1.15, z_body_top - drop * 0.12),
            (spine_r * 0.62, z_body_top - drop * 0.25),
            (spine_r * 1.45, z_body_top - drop * 0.45),
            (spine_r * 0.72, z_body_top - drop * 0.62),
            (spine_r * 1.65, z_body_top - drop * 0.78),
            (spine_r * 0.95, z_body_bot + drop * 0.10),
            (spine_r * 0.42, z_body_bot + drop * 0.04),
        ),
        metal_color,
        metal_tile,
        sides=14,
    )
    # Grand faceted bottom crystal finial drop (separated by 6 mm below spine base)
    fin_z0 = z_body_bot + drop * 0.032
    fin_r = max(0.040, rad * 0.075)
    _lathe(
        (
            (0.008, fin_z0),
            (fin_r, fin_z0 - drop * 0.075),
            (fin_r * 0.62, fin_z0 - drop * 0.145),
            (0.006, fin_z0 - drop * 0.185),
        ),
        crystal_color,
        crystal_tile,
        sides=8,
    )

    # 3. Concentric tiers: ornate hoop + scrollwork arms + bobeches + candles + flames + prisms
    default_arms = list(arms_per_tier) if arms_per_tier else [12, 8, 6]
    while len(default_arms) < n_tiers:
        default_arms.append(max(4, default_arms[-1] - 2))

    for ti in range(n_tiers):
        frac = ti / float(max(1, n_tiers - 1)) if n_tiers > 1 else 0.0
        tier_r = rad * (1.0 - 0.52 * frac)
        tier_z = z_body_bot + drop * (0.26 + 0.54 * frac)
        n_arms = max(4, int(default_arms[ti]))
        phase_off = (math.pi / n_arms) if (ti % 2 == 1) else 0.0

        # Molded circular brass tier hoop (closed loop torus)
        hoop_segs = max(18, n_arms * 2)
        hoop_h = max(0.016, rad * 0.026)
        hoop_t = max(0.012, rad * 0.018)
        hoop_prof = (
            (-hoop_t * 0.5, -hoop_h * 0.5),
            (hoop_t * 0.5, -hoop_h * 0.5),
            (hoop_t * 0.65, 0.0),
            (hoop_t * 0.5, hoop_h * 0.5),
            (-hoop_t * 0.5, hoop_h * 0.5),
            (-hoop_t * 0.65, 0.0),
        )
        hoop_rings: List[List[Vec3]] = []
        for si in range(hoop_segs):
            ang = TAU * si / hoop_segs
            ca, sa = math.cos(ang), math.sin(ang)
            r_local = [((tier_r + dr) * ca, (tier_r + dr) * sa, tier_z + dz) for (dr, dz) in hoop_prof]
            hoop_rings.append(_transform_points(r_local, (cx, cy, 0.0), rot_z=rot_z))
        group.rings(hoop_rings, color=metal_color, tile=metal_tile, closed_loop=True)

        # Arms, drip-pan bobeches, candles, glowing flames, and hanging crystal prisms
        for ai in range(n_arms):
            ang = phase_off + TAU * ai / n_arms
            ca, sa = math.cos(ang), math.sin(ang)
            r_in = spine_r * 1.18
            r_out = tier_r + max(0.045, rad * 0.065)
            # S-curved scrollwork arm dipping gracefully below hoop and curving up to bobeche
            arm_pts = [
                (r_in * ca, r_in * sa, tier_z + 0.025),
                ((r_in + (r_out - r_in) * 0.42) * ca, (r_in + (r_out - r_in) * 0.42) * sa, tier_z - drop * 0.10),
                ((r_in + (r_out - r_in) * 0.80) * ca, (r_in + (r_out - r_in) * 0.80) * sa, tier_z - drop * 0.045),
                (r_out * ca, r_out * sa, tier_z + 0.045),
            ]
            w_pts = _transform_points(arm_pts, (cx, cy, 0.0), rot_z=rot_z)
            add_pipe_frame(
                group,
                w_pts,
                radius=max(0.007, rad * 0.011),
                sides=6,
                bend_subdiv=2,
                bend_radius=0.04,
                flange_ends=False,
                color=metal_color,
                tile=metal_tile,
            )

            bx, by = r_out * ca, r_out * sa
            bz = tier_z + 0.052
            # Turned bobeche saucer cup
            _lathe(
                (
                    (0.012, bz - 0.008),
                    (0.040, bz + 0.006),
                    (0.046, bz + 0.018),
                    (0.024, bz + 0.022),
                ),
                metal_color,
                metal_tile,
                sides=8,
                ox=bx,
                oy=by,
            )
            # Wax candle sleeve (4 mm clearance above cup floor)
            candle_h = max(0.085, drop * 0.085)
            _lathe(
                (
                    (0.013, bz + 0.026),
                    (0.013, bz + 0.026 + candle_h),
                    (0.009, bz + 0.030 + candle_h),
                ),
                candle_color,
                candle_tile,
                sides=8,
                ox=bx,
                oy=by,
            )
            # Glowing teardrop candle flame (5 mm clearance above candle tip)
            fz0 = bz + 0.035 + candle_h
            _lathe(
                (
                    (0.004, fz0),
                    (0.016, fz0 + 0.022),
                    (0.011, fz0 + 0.048),
                    (0.003, fz0 + 0.068),
                ),
                flame_color,
                flame_tile,
                sides=6,
                dst=e_grp,
                ox=bx,
                oy=by,
            )
            # Faceted crystal teardrop prism hanging below each bobeche
            pz_top = bz - 0.018
            prism_len = max(0.085, drop * (0.095 - 0.015 * frac))
            _lathe(
                (
                    (0.004, pz_top),
                    (0.018, pz_top - prism_len * 0.55),
                    (0.013, pz_top - prism_len * 0.85),
                    (0.004, pz_top - prism_len),
                ),
                crystal_color,
                crystal_tile,
                sides=6,
                ox=bx,
                oy=by,
            )

            # Secondary crystal prism festooned along the hoop mid-bay between arms
            mid_ang = ang + math.pi / n_arms
            mx, my = tier_r * math.cos(mid_ang), tier_r * math.sin(mid_ang)
            mpz = tier_z - hoop_h * 0.5 - 0.010
            m_len = max(0.070, prism_len * 0.82)
            _lathe(
                (
                    (0.004, mpz),
                    (0.015, mpz - m_len * 0.55),
                    (0.004, mpz - m_len),
                ),
                crystal_color,
                crystal_tile,
                sides=6,
                ox=mx,
                oy=my,
            )

