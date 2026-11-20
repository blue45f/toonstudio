"""Desktop 8-node & Mobile 4-node Cutaway scene assembly and meshopt GLB export.

Standardizes every ToonStudio Hero BG3D asset onto the exact scene graph
expected by ``studio-bg3d-room-builder.ts`` and
``studio-bg3d-sketchup-webtoon-staging-bridge.ts``:

Desktop Hero (8 fixed nodes, <= 8 draw calls, <= 4 materials):
  BG_Root_<slug>
  ├── BG_Floor           [wall_id: floor]
  ├── BG_Wall_North      [wall_id: north (-Z glTF / +Y Blender)]
  ├── BG_Wall_South      [wall_id: south (+Z glTF / -Y Blender)]
  ├── BG_Wall_West       [wall_id: west  (-X glTF / -X Blender)]
  ├── BG_Wall_East       [wall_id: east  (+X glTF / +X Blender)]
  ├── BG_Ceiling         [wall_id: ceiling]
  ├── BG_Furniture_Hero  [wall_id: none, tags: furniture]
  └── BG_Props_Clutter   [wall_id: none, tags: clutter-props]

Mobile Hero (4 fixed nodes, <= 4 draw calls, <= 2 materials):
  BG_Root_<slug>_mobile
  ├── BG_Shell_Fixed     [BG_Floor + BG_Wall_North + BG_Wall_East]
  ├── BG_Cutaway_Front   [BG_Wall_South + BG_Wall_West]
  ├── BG_Ceiling         [BG_Ceiling]
  └── BG_Furnishings     [BG_Furniture_Hero + BG_Props_Clutter]

Coordinate convention:
  - Blender: +X East, -X West, +Y North, -Y South, +Z Up (floor Z = 0)
  - glTF (export_yup=True): +X East, -X West, -Z North, +Z South, +Y Up (floor Y = 0)
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Sequence, Tuple

import bpy
from mathutils import Vector

from .arch_primitives import MeshGroup
from .surface_atlas import (
    MAT_ARCH_TRIM,
    MAT_GLASS_EMISSIVE,
    MAT_METAL_HARDWARE,
    MAT_MOBILE_GLASS,
    MAT_MOBILE_OPAQUE,
    MAT_WOOD_FABRIC,
    create_desktop_atlas_materials,
    create_mobile_atlas_materials,
)

# ---------------------------------------------------------------------------
# Node contracts & extras metadata
# ---------------------------------------------------------------------------

DESKTOP_NODE_NAMES: Tuple[str, ...] = (
    "BG_Floor",
    "BG_Wall_North",
    "BG_Wall_South",
    "BG_Wall_West",
    "BG_Wall_East",
    "BG_Ceiling",
    "BG_Furniture_Hero",
    "BG_Props_Clutter",
)

MOBILE_NODE_NAMES: Tuple[str, ...] = (
    "BG_Shell_Fixed",
    "BG_Cutaway_Front",
    "BG_Ceiling",
    "BG_Furnishings",
)


@dataclass(frozen=True)
class CutawayNodeSpec:
    name: str
    wall_id: str
    outliner_tags: Tuple[str, ...]
    lt_priority: str
    default_material: str
    default_tile: str
    merged_walls: Tuple[str, ...] = ()


DESKTOP_NODE_SPECS: Mapping[str, CutawayNodeSpec] = {
    "BG_Floor": CutawayNodeSpec(
        name="BG_Floor",
        wall_id="floor",
        outliner_tags=("structure", "floor"),
        lt_priority="primary",
        default_material=MAT_ARCH_TRIM,
        default_tile="floor_wood",
    ),
    "BG_Wall_North": CutawayNodeSpec(
        name="BG_Wall_North",
        wall_id="north",
        outliner_tags=("wall", "cutaway"),
        lt_priority="primary",
        default_material=MAT_ARCH_TRIM,
        default_tile="plaster",
    ),
    "BG_Wall_South": CutawayNodeSpec(
        name="BG_Wall_South",
        wall_id="south",
        outliner_tags=("wall", "cutaway"),
        lt_priority="primary",
        default_material=MAT_ARCH_TRIM,
        default_tile="plaster",
    ),
    "BG_Wall_West": CutawayNodeSpec(
        name="BG_Wall_West",
        wall_id="west",
        outliner_tags=("wall", "cutaway"),
        lt_priority="primary",
        default_material=MAT_ARCH_TRIM,
        default_tile="plaster",
    ),
    "BG_Wall_East": CutawayNodeSpec(
        name="BG_Wall_East",
        wall_id="east",
        outliner_tags=("wall", "cutaway"),
        lt_priority="primary",
        default_material=MAT_ARCH_TRIM,
        default_tile="plaster",
    ),
    "BG_Ceiling": CutawayNodeSpec(
        name="BG_Ceiling",
        wall_id="ceiling",
        outliner_tags=("ceiling", "ceiling-fixture", "cutaway"),
        lt_priority="secondary",
        default_material=MAT_GLASS_EMISSIVE,
        default_tile="ceiling_plaster",
    ),
    "BG_Furniture_Hero": CutawayNodeSpec(
        name="BG_Furniture_Hero",
        wall_id="none",
        outliner_tags=("furniture",),
        lt_priority="primary",
        default_material=MAT_WOOD_FABRIC,
        default_tile="wood_oak",
    ),
    "BG_Props_Clutter": CutawayNodeSpec(
        name="BG_Props_Clutter",
        wall_id="none",
        outliner_tags=("clutter-props",),
        lt_priority="detail",
        default_material=MAT_METAL_HARDWARE,
        default_tile="steel_brushed",
    ),
}

MOBILE_NODE_SPECS: Mapping[str, CutawayNodeSpec] = {
    "BG_Shell_Fixed": CutawayNodeSpec(
        name="BG_Shell_Fixed",
        wall_id="floor",
        outliner_tags=("structure", "wall"),
        lt_priority="primary",
        default_material=MAT_MOBILE_OPAQUE,
        default_tile="plaster",
        merged_walls=("floor", "north", "east"),
    ),
    "BG_Cutaway_Front": CutawayNodeSpec(
        name="BG_Cutaway_Front",
        wall_id="south",
        outliner_tags=("wall", "cutaway"),
        lt_priority="primary",
        default_material=MAT_MOBILE_OPAQUE,
        default_tile="plaster",
        merged_walls=("south", "west"),
    ),
    "BG_Ceiling": CutawayNodeSpec(
        name="BG_Ceiling",
        wall_id="ceiling",
        outliner_tags=("ceiling", "ceiling-fixture", "cutaway"),
        lt_priority="secondary",
        default_material=MAT_MOBILE_GLASS,
        default_tile="ceiling_plaster",
        merged_walls=("ceiling",),
    ),
    "BG_Furnishings": CutawayNodeSpec(
        name="BG_Furnishings",
        wall_id="none",
        outliner_tags=("furniture", "clutter-props"),
        lt_priority="primary",
        default_material=MAT_MOBILE_OPAQUE,
        default_tile="wood_oak",
        merged_walls=(),
    ),
}

MOBILE_MERGE_MAP: Mapping[str, Tuple[str, ...]] = {
    "BG_Shell_Fixed": ("BG_Floor", "BG_Wall_North", "BG_Wall_East"),
    "BG_Cutaway_Front": ("BG_Wall_South", "BG_Wall_West"),
    "BG_Ceiling": ("BG_Ceiling",),
    "BG_Furnishings": ("BG_Furniture_Hero", "BG_Props_Clutter"),
}

DEFAULT_COPYRIGHT = (
    "ToonStudio. CC0 1.0 Universal. Original procedural geometry, UVs and PBR+Toon atlas images."
)

# ---------------------------------------------------------------------------
# HeroSceneGroups: Authoring container for the 8 semantic cutaway buckets
# ---------------------------------------------------------------------------


@dataclass
class HeroSceneGroups:
    """Mutable authoring container holding the 8 Desktop Cutaway MeshGroups."""

    floor: MeshGroup = field(
        default_factory=lambda: MeshGroup("BG_Floor", atlas_name=MAT_ARCH_TRIM, default_tile="floor_wood")
    )
    wall_north: MeshGroup = field(
        default_factory=lambda: MeshGroup("BG_Wall_North", atlas_name=MAT_ARCH_TRIM, default_tile="plaster")
    )
    wall_south: MeshGroup = field(
        default_factory=lambda: MeshGroup("BG_Wall_South", atlas_name=MAT_ARCH_TRIM, default_tile="plaster")
    )
    wall_west: MeshGroup = field(
        default_factory=lambda: MeshGroup("BG_Wall_West", atlas_name=MAT_ARCH_TRIM, default_tile="plaster")
    )
    wall_east: MeshGroup = field(
        default_factory=lambda: MeshGroup("BG_Wall_East", atlas_name=MAT_ARCH_TRIM, default_tile="plaster")
    )
    ceiling: MeshGroup = field(
        default_factory=lambda: MeshGroup("BG_Ceiling", atlas_name=MAT_GLASS_EMISSIVE, default_tile="ceiling_plaster")
    )
    furniture_hero: MeshGroup = field(
        default_factory=lambda: MeshGroup("BG_Furniture_Hero", atlas_name=MAT_WOOD_FABRIC, default_tile="wood_oak")
    )
    props_clutter: MeshGroup = field(
        default_factory=lambda: MeshGroup("BG_Props_Clutter", atlas_name=MAT_METAL_HARDWARE, default_tile="steel_brushed")
    )

    def as_dict(self) -> Dict[str, MeshGroup]:
        return {
            "BG_Floor": self.floor,
            "BG_Wall_North": self.wall_north,
            "BG_Wall_South": self.wall_south,
            "BG_Wall_West": self.wall_west,
            "BG_Wall_East": self.wall_east,
            "BG_Ceiling": self.ceiling,
            "BG_Furniture_Hero": self.furniture_hero,
            "BG_Props_Clutter": self.props_clutter,
        }

    def bounds_z(self) -> Tuple[float, float]:
        zs = [v[2] for g in self.as_dict().values() for v in g.vertices]
        if not zs:
            return (0.0, 0.0)
        return (min(zs), max(zs))

    def ground_to_zero(self) -> float:
        """Shift all vertices along Z so the global minimum Z equals exactly 0.0."""
        min_z, _ = self.bounds_z()
        if abs(min_z) <= 1e-9:
            return 0.0
        for g in self.as_dict().values():
            if g.vertices:
                g.vertices = [(x, y, z - min_z) for (x, y, z) in g.vertices]
        return -min_z


@dataclass
class AssembledHeroScene:
    slug: str
    profile: str  # "desktop" | "mobile"
    root: bpy.types.Object
    nodes: Dict[str, bpy.types.Object]
    materials: Dict[str, bpy.types.Material]
    collection: bpy.types.Collection
    bounds_min: Tuple[float, float, float]
    bounds_max: Tuple[float, float, float]


# ---------------------------------------------------------------------------
# Node extras & scene assembly
# ---------------------------------------------------------------------------


def _apply_node_extras(obj: bpy.types.Object, spec: CutawayNodeSpec) -> None:
    """Attach ToonStudio BG3D cutaway & outliner metadata as glTF ``extras``."""
    obj["toonstudio_wall_id"] = spec.wall_id
    obj["toonstudio_outliner_tags"] = list(spec.outliner_tags)
    obj["toonstudio_lt_priority"] = spec.lt_priority
    if spec.merged_walls:
        obj["toonstudio_merged_walls"] = list(spec.merged_walls)


def _compute_hierarchy_bounds(objects: Sequence[bpy.types.Object]) -> Tuple[Tuple[float, float, float], Tuple[float, float, float]]:
    pts: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH" or len(obj.data.vertices) == 0:
            continue
        pts.extend(obj.matrix_world @ Vector(c) for c in obj.bound_box)
    if not pts:
        return ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0))
    bmin = (min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))
    bmax = (max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))
    return bmin, bmax


def _ensure_collection(name: str) -> bpy.types.Collection:
    existing = bpy.data.collections.get(name)
    if existing is not None:
        return existing
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def _ensure_metric_scene() -> None:
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def _create_empty_node(
    name: str,
    collection: bpy.types.Collection,
    parent: Optional[bpy.types.Object] = None,
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def assemble_desktop_cutaway(
    slug: str,
    groups: HeroSceneGroups,
    *,
    materials: Optional[Mapping[str, bpy.types.Material]] = None,
    primary_size: int = 2048,
    secondary_size: int = 1024,
    auto_ground: bool = True,
    apply_weighted_normal: bool = True,
    collection_name: Optional[str] = None,
) -> AssembledHeroScene:
    """Assemble the 8-node Desktop Hero Cutaway hierarchy under ``BG_Root_<slug>``."""
    _ensure_metric_scene()
    if auto_ground:
        groups.ground_to_zero()

    mat_map = (
        dict(materials)
        if materials is not None
        else create_desktop_atlas_materials(primary_size=primary_size, secondary_size=secondary_size)
    )
    col = _ensure_collection(collection_name or f"HeroDesktop_{slug}")

    root = _create_empty_node(f"BG_Root_{slug}", col)
    root["asset_id"] = slug
    root["units"] = "metres"
    root["ground_plane"] = "glTF-Y=0"
    root["cutaway_contract"] = "room-v1"
    root["profile"] = "desktop-hero"

    group_dict = groups.as_dict()
    built_nodes: Dict[str, bpy.types.Object] = {}
    for node_name in DESKTOP_NODE_NAMES:
        spec = DESKTOP_NODE_SPECS[node_name]
        grp = group_dict[node_name]
        mat = mat_map[spec.default_material]
        if grp.is_empty():
            node_obj = _create_empty_node(node_name, col, parent=root)
        else:
            node_obj = grp.build(
                material=mat,
                atlas_name=spec.default_material,
                collection=col,
                apply_weighted_normal=apply_weighted_normal,
                validate_manifold=True,
            )
            node_obj.name = node_name
            node_obj.location = (0.0, 0.0, 0.0)
            node_obj.rotation_euler = (0.0, 0.0, 0.0)
            node_obj.scale = (1.0, 1.0, 1.0)
            node_obj.parent = root
        _apply_node_extras(node_obj, spec)
        built_nodes[node_name] = node_obj

    bpy.context.view_layer.update()
    bmin, bmax = _compute_hierarchy_bounds(list(built_nodes.values()))
    if abs(bmin[2]) > 1e-4:
        raise ValueError(f"Desktop scene '{slug}' failed floor grounding: min_z={bmin[2]:.6f} (expected 0.0)")

    return AssembledHeroScene(
        slug=slug,
        profile="desktop",
        root=root,
        nodes=built_nodes,
        materials=mat_map,
        collection=col,
        bounds_min=bmin,
        bounds_max=bmax,
    )


def assemble_mobile_cutaway(
    slug: str,
    groups: HeroSceneGroups,
    *,
    materials: Optional[Mapping[str, bpy.types.Material]] = None,
    opaque_size: int = 1024,
    glass_size: int = 512,
    auto_ground: bool = True,
    apply_weighted_normal: bool = True,
    collection_name: Optional[str] = None,
) -> AssembledHeroScene:
    """Merge the 8 Desktop buckets into the 4-node / 2-material Mobile Hero hierarchy."""
    _ensure_metric_scene()
    if auto_ground:
        groups.ground_to_zero()

    mat_map = (
        dict(materials)
        if materials is not None
        else create_mobile_atlas_materials(opaque_size=opaque_size, glass_size=glass_size)
    )
    col = _ensure_collection(collection_name or f"HeroMobile_{slug}")

    root = _create_empty_node(f"BG_Root_{slug}_mobile", col)
    root["asset_id"] = slug
    root["units"] = "metres"
    root["ground_plane"] = "glTF-Y=0"
    root["cutaway_contract"] = "mobile-4node-v1"
    root["profile"] = "mobile-hero"

    src_dict = groups.as_dict()
    built_nodes: Dict[str, bpy.types.Object] = {}
    for mobile_name in MOBILE_NODE_NAMES:
        spec = MOBILE_NODE_SPECS[mobile_name]
        merged = MeshGroup(
            mobile_name,
            material=mat_map[spec.default_material],
            atlas_name=spec.default_material,
            default_tile=spec.default_tile,
        )
        for src_name in MOBILE_MERGE_MAP[mobile_name]:
            merged.add(src_dict[src_name])

        if merged.is_empty():
            node_obj = _create_empty_node(mobile_name, col, parent=root)
        else:
            node_obj = merged.build(
                material=mat_map[spec.default_material],
                atlas_name=spec.default_material,
                collection=col,
                apply_weighted_normal=apply_weighted_normal,
                validate_manifold=True,
            )
            node_obj.name = mobile_name
            node_obj.location = (0.0, 0.0, 0.0)
            node_obj.rotation_euler = (0.0, 0.0, 0.0)
            node_obj.scale = (1.0, 1.0, 1.0)
            node_obj.parent = root
        _apply_node_extras(node_obj, spec)
        built_nodes[mobile_name] = node_obj

    bpy.context.view_layer.update()
    bmin, bmax = _compute_hierarchy_bounds(list(built_nodes.values()))
    if abs(bmin[2]) > 1e-4:
        raise ValueError(f"Mobile scene '{slug}' failed floor grounding: min_z={bmin[2]:.6f} (expected 0.0)")

    return AssembledHeroScene(
        slug=slug,
        profile="mobile",
        root=root,
        nodes=built_nodes,
        materials=mat_map,
        collection=col,
        bounds_min=bmin,
        bounds_max=bmax,
    )


# ---------------------------------------------------------------------------
# GLB Export + gltf-transform meshopt Pipeline (Draco strictly forbidden)
# ---------------------------------------------------------------------------


def find_gltf_transform(explicit_bin: Optional[str] = None) -> str:
    """Locate the ``gltf-transform`` CLI executable."""
    if explicit_bin:
        return explicit_bin
    preferred = Path("/Users/hjunkim/.local/bin/gltf-transform")
    if preferred.is_file():
        return str(preferred)
    found = shutil.which("gltf-transform")
    if found:
        return found
    raise FileNotFoundError(
        "gltf-transform CLI not found (checked /Users/hjunkim/.local/bin/gltf-transform and PATH)"
    )


def optimize_bg3d_glb_meshopt(
    src_glb: Path,
    dst_glb: Path,
    *,
    gltf_transform_bin: Optional[str] = None,
) -> Path:
    """Run the canonical ToonStudio BG3D meshopt optimization preserving all cutaway nodes."""
    cli = find_gltf_transform(gltf_transform_bin)
    dst_glb.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        cli,
        "optimize",
        str(src_glb),
        str(dst_glb),
        "--compress",
        "meshopt",
        "--join",
        "false",
        "--flatten",
        "false",
        "--simplify",
        "false",
        "--palette",
        "false",
        "--prune-solid-textures",
        "false",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"gltf-transform optimize failed (rc={proc.returncode}):\n"
            f"STDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
        )
    return dst_glb


def _select_hierarchy(root: bpy.types.Object) -> list[bpy.types.Object]:
    objs = [root]
    objs.extend(root.children_recursive)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    return objs


def export_cutaway_glb(
    assembled: AssembledHeroScene,
    out_path: Path,
    *,
    optimize_meshopt: bool = True,
    gltf_transform_bin: Optional[str] = None,
    copyright_text: str = DEFAULT_COPYRIGHT,
) -> Dict[str, Any]:
    """Export an ``AssembledHeroScene`` hierarchy to GLB with optional meshopt compression."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    _select_hierarchy(assembled.root)

    with tempfile.TemporaryDirectory(prefix="ts_glb_export_") as tmp:
        raw_path = Path(tmp) / f"{out_path.stem}.raw.glb" if optimize_meshopt else out_path
        bpy.ops.export_scene.gltf(
            filepath=str(raw_path),
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_extras=True,
            export_apply=True,
            export_animations=False,
            export_tangents=True,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
            export_draco_mesh_compression_enable=False,
            export_copyright=copyright_text,
        )
        raw_bytes = raw_path.stat().st_size
        if optimize_meshopt:
            optimize_bg3d_glb_meshopt(raw_path, out_path, gltf_transform_bin=gltf_transform_bin)

    final_bytes = out_path.read_bytes()
    sha256 = "sha256:" + hashlib.sha256(final_bytes).hexdigest()
    bmin, bmax = assembled.bounds_min, assembled.bounds_max
    # glTF Y-up bounds dimensions: [width_X, height_Y (Blender Z), depth_Z (Blender Y)]
    bounds_gltf = [
        round(bmax[0] - bmin[0], 4),
        round(bmax[2] - bmin[2], 4),
        round(bmax[1] - bmin[1], 4),
    ]
    return {
        "fileName": out_path.name,
        "path": str(out_path),
        "profile": assembled.profile,
        "byteSize": len(final_bytes),
        "rawByteSize": raw_bytes,
        "sha256": sha256,
        "bounds": bounds_gltf,
        "nodeNames": list(assembled.nodes.keys()),
        "meshoptOptimized": optimize_meshopt,
    }


def _remove_hierarchy(assembled: AssembledHeroScene) -> None:
    """Cleanly delete temporary Blender objects/collection (e.g. after exporting mobile copy)."""
    col = assembled.collection
    for obj in [assembled.root, *list(assembled.nodes.values())]:
        if obj.name in bpy.data.objects:
            mesh_data = obj.data if obj.type == "MESH" else None
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh_data is not None and mesh_data.users == 0:
                bpy.data.meshes.remove(mesh_data)
    if col.name in bpy.data.collections and len(col.objects) == 0:
        bpy.data.collections.remove(col)


def export_hero_desktop_and_mobile(
    slug: str,
    groups: HeroSceneGroups,
    out_dir: Path,
    *,
    desktop_primary_size: int = 2048,
    desktop_secondary_size: int = 1024,
    mobile_opaque_size: int = 1024,
    mobile_glass_size: int = 512,
    optimize_meshopt: bool = True,
    keep_desktop_in_scene: bool = True,
    cameras: Optional[Mapping[str, Any]] = None,
    copyright_text: str = DEFAULT_COPYRIGHT,
) -> Tuple[AssembledHeroScene, Dict[str, Any]]:
    """Build and export both Desktop 8-node and Mobile 4-node GLBs plus ``manifest.json``.

    Leaves the Desktop 8-node cutaway scene active in Blender when
    ``keep_desktop_in_scene=True`` so ``multiview_preview.py`` can immediately
    render the 6-view contact sheet and Freestyle SVG line art.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    groups.ground_to_zero()

    # 1. Build & export Mobile 4-node bundle first, then remove its objects so Desktop scene stays clean
    mobile_scene = assemble_mobile_cutaway(
        slug,
        groups,
        opaque_size=mobile_opaque_size,
        glass_size=mobile_glass_size,
        auto_ground=False,
    )
    mobile_meta = export_cutaway_glb(
        mobile_scene,
        out_dir / f"{slug}-mobile.glb",
        optimize_meshopt=optimize_meshopt,
        copyright_text=copyright_text,
    )
    _remove_hierarchy(mobile_scene)

    # 2. Build & export Desktop 8-node hero bundle
    desktop_scene = assemble_desktop_cutaway(
        slug,
        groups,
        primary_size=desktop_primary_size,
        secondary_size=desktop_secondary_size,
        auto_ground=False,
    )
    desktop_meta = export_cutaway_glb(
        desktop_scene,
        out_dir / f"{slug}.glb",
        optimize_meshopt=optimize_meshopt,
        copyright_text=copyright_text,
    )

    manifest: Dict[str, Any] = {
        "assetId": slug,
        "cutawayContract": "room-v1",
        "fileName": desktop_meta["fileName"],
        "byteSize": desktop_meta["byteSize"],
        "sha256": desktop_meta["sha256"],
        "bounds": desktop_meta["bounds"],
        "nodes": desktop_meta["nodeNames"],
        "mobile": {
            "fileName": mobile_meta["fileName"],
            "byteSize": mobile_meta["byteSize"],
            "sha256": mobile_meta["sha256"],
            "nodes": mobile_meta["nodeNames"],
        },
    }
    if cameras:
        manifest["cameras"] = dict(cameras)

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if not keep_desktop_in_scene:
        _remove_hierarchy(desktop_scene)

    return desktop_scene, {
        "desktop": desktop_meta,
        "mobile": mobile_meta,
        "manifestPath": str(manifest_path),
    }
