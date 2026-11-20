"""Automated Gate 1 & Gate 2 QA verification for ToonStudio Hero BG3D assets.

Performs both:
1. Blender-side ``bmesh`` + scene inspection (``audit_blender_scene``):
   - ``true_nonmanifold == 0``, ``non_manifold == 0``, ``loose_verts == 0``,
     ``wire_edges == 0``, ``zero_area == 0``
   - ``min_z == 0.0 ± 1e-4`` (floor grounding)
   - ``scale == (1, 1, 1)`` and ``rotation == (0, 0, 0)``
   - Metric units (``METRIC``, ``scale_length == 1.0``)
   - UV coordinates strictly inside ``[0, 1]`` with gutter margin ``>= 0.015``
   - Desktop 8-node / Mobile 4-node naming & ``extras`` verification
2. Standalone GLB binary + ``gltf-transform validate`` inspection (``inspect_glb``):
   - Parses GLB JSON/BIN chunks directly (works with or without Blender)
   - Verifies 8-node (desktop) or 4-node (mobile) node names + required ``extras``
     (``toonstudio_wall_id``, ``toonstudio_outliner_tags``, ``toonstudio_lt_priority``)
   - Computes world-transformed glTF AABB ``min_y == 0.0`` (accounting for
     ``KHR_mesh_quantization`` node scale/translation)
   - Verifies ``KHR_draco_mesh_compression`` ABSENT and ``EXT_meshopt_compression`` PRESENT
   - Checks draw calls, materials, triangles, texture dimensions, and file size
     against ``desktop-hero`` / ``mobile-hero`` limits
   - Runs ``gltf-transform validate`` and asserts 0 errors and 0
     ``MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`` warnings.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import struct
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

try:
    import bmesh  # type: ignore
    import bpy  # type: ignore
    from mathutils import Vector  # type: ignore

    HAS_BPY = True
except ImportError:
    HAS_BPY = False

DESKTOP_REQUIRED_NODES: Tuple[str, ...] = (
    "BG_Floor",
    "BG_Wall_North",
    "BG_Wall_South",
    "BG_Wall_West",
    "BG_Wall_East",
    "BG_Ceiling",
    "BG_Furniture_Hero",
    "BG_Props_Clutter",
)

MOBILE_REQUIRED_NODES: Tuple[str, ...] = (
    "BG_Shell_Fixed",
    "BG_Cutaway_Front",
    "BG_Ceiling",
    "BG_Furnishings",
)

REQUIRED_EXTRA_KEYS: Tuple[str, ...] = (
    "toonstudio_wall_id",
    "toonstudio_outliner_tags",
    "toonstudio_lt_priority",
)

PROFILE_BUDGETS: Mapping[str, Mapping[str, int]] = {
    "desktop": {
        "max_draw_calls": 8,
        "max_materials": 4,
        "max_triangles": 500_000,
        "max_texture_dim": 4096,
        "max_bytes": 20 * 1024 * 1024,
    },
    "mobile": {
        "max_draw_calls": 4,
        "max_materials": 2,
        "max_triangles": 150_000,
        "max_texture_dim": 2048,
        "max_bytes": 6 * 1024 * 1024,
    },
}


# ---------------------------------------------------------------------------
# Part A: Blender bmesh + Scene Gate
# ---------------------------------------------------------------------------


def inspect_mesh_object(obj: Any, *, uv_margin: float = 0.015) -> Dict[str, Any]:
    """Run strict bmesh 0-defect, transform, and UV [0, 1] margin checks on one mesh object."""
    if not HAS_BPY:
        raise RuntimeError("inspect_mesh_object() requires Blender Python (bpy/bmesh)")

    mesh = obj.data
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bm.normal_update()
        true_nonmanifold = sum(1 for e in bm.edges if len(e.link_faces) > 2)
        non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
        loose_verts = sum(1 for v in bm.verts if len(v.link_edges) == 0)
        wire_edges = sum(1 for e in bm.edges if len(e.link_faces) == 0)
        zero_area_faces = sum(1 for f in bm.faces if f.calc_area() < 1e-10)
        vert_count = len(bm.verts)
        face_count = len(bm.faces)
    finally:
        bm.free()

    mesh.calc_loop_triangles()
    zero_area_tris = sum(1 for tri in mesh.loop_triangles if tri.area < 1e-11)
    tri_count = len(mesh.loop_triangles)

    # Position-welded non-manifold edge check (mirrors glbforge topo/non-manifold)
    mw = obj.matrix_world
    q_pts = [tuple(round(float(c), 4) for c in (mw @ v.co)) for v in mesh.vertices]
    welded_edge_counts: Dict[Tuple[Tuple[float, ...], Tuple[float, ...]], int] = {}
    for tri in mesh.loop_triangles:
        p0, p1, p2 = q_pts[tri.vertices[0]], q_pts[tri.vertices[1]], q_pts[tri.vertices[2]]
        for ea, eb in ((p0, p1), (p1, p2), (p2, p0)):
            if ea == eb:
                continue
            ek = (ea, eb) if ea < eb else (eb, ea)
            welded_edge_counts[ek] = welded_edge_counts.get(ek, 0) + 1
    welded_nonmanifold = sum(1 for c in welded_edge_counts.values() if c > 2)

    uv_ok = True
    uv_out_of_range = 0
    uv_margin_violations = 0
    if len(mesh.uv_layers) == 0 and face_count > 0:
        uv_ok = False
    elif len(mesh.uv_layers) > 0:
        uv_data = mesh.uv_layers.active.data
        cell = 0.25
        eps = 1e-5
        for loop_uv in uv_data:
            u, v = float(loop_uv.uv[0]), float(loop_uv.uv[1])
            if u < -eps or u > 1.0 + eps or v < -eps or v > 1.0 + eps:
                uv_out_of_range += 1
            # Check distance to nearest 4x4 atlas cell border >= uv_margin
            du = min(u % cell, cell - (u % cell))
            dv = min(v % cell, cell - (v % cell))
            if u < uv_margin - eps or (1.0 - u) < uv_margin - eps or v < uv_margin - eps or (1.0 - v) < uv_margin - eps:
                uv_margin_violations += 1
            elif du < uv_margin - eps or dv < uv_margin - eps:
                uv_margin_violations += 1

    scale = tuple(round(float(s), 6) for s in obj.scale)
    rot = tuple(round(float(r), 6) for r in obj.rotation_euler)
    scale_ok = all(abs(s - 1.0) <= 1e-5 for s in scale)
    rot_ok = all(abs(r) <= 1e-5 for r in rot)

    world_corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box] if vert_count > 0 else []
    min_z = min((p.z for p in world_corners), default=0.0)
    max_z = max((p.z for p in world_corners), default=0.0)

    mat_names = [m.name for m in mesh.materials if m is not None]
    draw_calls = max(1, len(mat_names)) if face_count > 0 else 0

    return {
        "name": obj.name,
        "verts": vert_count,
        "faces": face_count,
        "triangles": tri_count,
        "true_nonmanifold": true_nonmanifold,
        "non_manifold": non_manifold,
        "welded_nonmanifold": welded_nonmanifold,
        "loose_verts": loose_verts,
        "wire_edges": wire_edges,
        "zero_area": zero_area_faces + zero_area_tris,
        "zero_area_faces": zero_area_faces,
        "zero_area_tris": zero_area_tris,
        "scale": scale,
        "scale_ok": scale_ok,
        "rotation": rot,
        "rotation_ok": rot_ok,
        "min_z": round(min_z, 6),
        "max_z": round(max_z, 6),
        "uv_present": uv_ok,
        "uv_out_of_range": uv_out_of_range,
        "uv_margin_violations": uv_margin_violations,
        "materials": mat_names,
        "draw_calls": draw_calls,
    }


def audit_blender_scene(
    root_obj: Optional[Any] = None,
    *,
    profile: str = "desktop",
    uv_margin: float = 0.015,
) -> Dict[str, Any]:
    """Audit an assembled Blender scene hierarchy against ToonStudio BG3D Gate 1 invariants."""
    if not HAS_BPY:
        raise RuntimeError("audit_blender_scene() requires Blender Python (bpy/bmesh)")

    scene = bpy.context.scene
    bpy.context.view_layer.update()

    errors: List[str] = []
    warnings: List[str] = []

    if scene.unit_settings.system != "METRIC" or abs(scene.unit_settings.scale_length - 1.0) > 1e-6:
        errors.append(
            f"Scene units must be METRIC 1.0, got {scene.unit_settings.system} ({scene.unit_settings.scale_length})"
        )

    objects = list(root_obj.children_recursive) if root_obj is not None else list(scene.objects)
    by_name = {o.name: o for o in objects}

    required_nodes = DESKTOP_REQUIRED_NODES if profile == "desktop" else MOBILE_REQUIRED_NODES
    missing_nodes = [n for n in required_nodes if n not in by_name]
    if missing_nodes:
        errors.append(f"Missing required {profile} nodes: {missing_nodes}")

    extras_errors: List[str] = []
    for n in required_nodes:
        obj = by_name.get(n)
        if obj is None:
            continue
        for key in REQUIRED_EXTRA_KEYS:
            if key not in obj.keys():
                extras_errors.append(f"{n}: missing custom property '{key}'")
    errors.extend(extras_errors)

    mesh_reports: List[Dict[str, Any]] = []
    total_true_nonmanifold = 0
    total_non_manifold = 0
    total_loose_verts = 0
    total_wire_edges = 0
    total_zero_area = 0
    total_triangles = 0
    total_draw_calls = 0
    unique_materials: set[str] = set()
    min_zs: List[float] = []

    for obj in objects:
        if obj.type != "MESH":
            if not all(abs(float(s) - 1.0) <= 1e-5 for s in obj.scale):
                errors.append(f"{obj.name}: non-unit scale {tuple(obj.scale)}")
            continue
        rep = inspect_mesh_object(obj, uv_margin=uv_margin)
        mesh_reports.append(rep)
        total_true_nonmanifold += rep["true_nonmanifold"]
        total_non_manifold += rep["non_manifold"]
        total_loose_verts += rep["loose_verts"]
        total_wire_edges += rep["wire_edges"]
        total_zero_area += rep["zero_area"]
        total_triangles += rep["triangles"]
        total_draw_calls += rep["draw_calls"]
        unique_materials.update(rep["materials"])
        if rep["verts"] > 0:
            min_zs.append(rep["min_z"])

        if rep["true_nonmanifold"] > 0:
            errors.append(f"{obj.name}: true_nonmanifold={rep['true_nonmanifold']}")
        if rep["non_manifold"] > 0:
            errors.append(f"{obj.name}: non_manifold={rep['non_manifold']}")
        if rep["welded_nonmanifold"] > 0:
            errors.append(f"{obj.name}: welded_nonmanifold={rep['welded_nonmanifold']} (coincident sub-part edges)")
        if rep["loose_verts"] > 0:
            errors.append(f"{obj.name}: loose_verts={rep['loose_verts']}")
        if rep["wire_edges"] > 0:
            errors.append(f"{obj.name}: wire_edges={rep['wire_edges']}")
        if rep["zero_area"] > 0:
            errors.append(f"{obj.name}: zero_area={rep['zero_area']}")
        if not rep["scale_ok"]:
            errors.append(f"{obj.name}: scale != (1,1,1): {rep['scale']}")
        if not rep["rotation_ok"]:
            errors.append(f"{obj.name}: rotation != (0,0,0): {rep['rotation']}")
        if not rep["uv_present"]:
            errors.append(f"{obj.name}: missing UVMap")
        if rep["uv_out_of_range"] > 0:
            errors.append(f"{obj.name}: {rep['uv_out_of_range']} UV loops outside [0, 1]")
        if rep["uv_margin_violations"] > 0:
            errors.append(f"{obj.name}: {rep['uv_margin_violations']} UV loops violate margin >= {uv_margin}")

    global_min_z = min(min_zs) if min_zs else 0.0
    if abs(global_min_z) > 1e-4:
        errors.append(f"Global floor grounding violated: min_z={global_min_z:.6f} (expected 0.0 ± 1e-4)")

    budget = PROFILE_BUDGETS[profile]
    if total_draw_calls > budget["max_draw_calls"]:
        errors.append(f"Draw calls {total_draw_calls} exceed {profile} budget {budget['max_draw_calls']}")
    if len(unique_materials) > budget["max_materials"]:
        errors.append(f"Materials {len(unique_materials)} exceed {profile} budget {budget['max_materials']}")
    if total_triangles > budget["max_triangles"]:
        errors.append(f"Triangles {total_triangles} exceed {profile} budget {budget['max_triangles']}")

    return {
        "gate": "blender_bmesh_scene",
        "profile": profile,
        "passed": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "summary": {
            "true_nonmanifold": total_true_nonmanifold,
            "non_manifold": total_non_manifold,
            "loose_verts": total_loose_verts,
            "wire_edges": total_wire_edges,
            "zero_area": total_zero_area,
            "min_z": round(global_min_z, 6),
            "triangles": total_triangles,
            "draw_calls": total_draw_calls,
            "materials": len(unique_materials),
            "material_names": sorted(unique_materials),
            "node_count": len(objects),
        },
        "meshes": mesh_reports,
    }


# ---------------------------------------------------------------------------
# Part B: Pure-Python GLB Binary Parser + gltf-transform validate Gate
# ---------------------------------------------------------------------------


def _parse_glb_chunks(glb_path: Path) -> Tuple[Dict[str, Any], bytes]:
    raw = glb_path.read_bytes()
    if len(raw) < 20:
        raise ValueError(f"GLB file too small ({len(raw)} bytes): {glb_path}")
    magic, version, total_len = struct.unpack("<3I", raw[:12])
    if magic != 0x46546C67 or version != 2:
        raise ValueError(f"Invalid GLB header (magic={hex(magic)}, version={version})")
    offset = 12
    gltf_doc: Optional[Dict[str, Any]] = None
    bin_chunk = b""
    while offset + 8 <= len(raw):
        chunk_len, chunk_type = struct.unpack("<2I", raw[offset : offset + 8])
        chunk_data = raw[offset + 8 : offset + 8 + chunk_len]
        offset += 8 + chunk_len
        if chunk_type == 0x4E4F534A:  # JSON
            gltf_doc = json.loads(chunk_data.decode("utf-8"))
        elif chunk_type == 0x004E4942:  # BIN
            bin_chunk = chunk_data
    if gltf_doc is None:
        raise ValueError(f"GLB missing JSON chunk: {glb_path}")
    return gltf_doc, bin_chunk


def _mat4_identity() -> List[List[float]]:
    return [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _mat4_mul(a: List[List[float]], b: List[List[float]]) -> List[List[float]]:
    return [
        [sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)]
        for r in range(4)
    ]


def _node_local_matrix(node: Mapping[str, Any]) -> List[List[float]]:
    if "matrix" in node:
        m = node["matrix"]
        # glTF matrices are column-major
        return [[float(m[c * 4 + r]) for c in range(4)] for r in range(4)]
    tx, ty, tz = [float(v) for v in node.get("translation", (0.0, 0.0, 0.0))]
    qx, qy, qz, qw = [float(v) for v in node.get("rotation", (0.0, 0.0, 0.0, 1.0))]
    sx, sy, sz = [float(v) for v in node.get("scale", (1.0, 1.0, 1.0))]

    xx, yy, zz = qx * qx, qy * qy, qz * qz
    xy, xz, yz = qx * qy, qx * qz, qy * qz
    wx, wy, wz = qw * qx, qw * qy, qw * qz

    return [
        [(1.0 - 2.0 * (yy + zz)) * sx, (2.0 * (xy - wz)) * sy, (2.0 * (xz + wy)) * sz, tx],
        [(2.0 * (xy + wz)) * sx, (1.0 - 2.0 * (xx + zz)) * sy, (2.0 * (yz - wx)) * sz, ty],
        [(2.0 * (xz - wy)) * sx, (2.0 * (yz + wx)) * sy, (1.0 - 2.0 * (xx + yy)) * sz, tz],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _transform_point(m: List[List[float]], p: Sequence[float]) -> Tuple[float, float, float]:
    x, y, z = float(p[0]), float(p[1]), float(p[2])
    return (
        m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
        m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
        m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3],
    )


def _decode_image_dimensions(gltf: Mapping[str, Any], bin_chunk: bytes) -> List[Dict[str, Any]]:
    images = gltf.get("images", [])
    buffer_views = gltf.get("bufferViews", [])
    out: List[Dict[str, Any]] = []
    for idx, img in enumerate(images):
        bv_idx = img.get("bufferView")
        mime = img.get("mimeType", "")
        width, height = 0, 0
        byte_len = 0
        if bv_idx is not None and bv_idx < len(buffer_views):
            bv = buffer_views[bv_idx]
            start = int(bv.get("byteOffset", 0))
            byte_len = int(bv.get("byteLength", 0))
            blob = bin_chunk[start : start + byte_len]
            if blob[:8] == b"\x89PNG\r\n\x1a\n" and len(blob) >= 24:
                width, height = struct.unpack(">2I", blob[16:24])
            elif blob[:2] == b"\xff\xd8":
                # Minimal JPEG SOF parser
                pos = 2
                while pos + 9 < len(blob):
                    if blob[pos] != 0xFF:
                        break
                    marker = blob[pos + 1]
                    seg_len = struct.unpack(">H", blob[pos + 2 : pos + 4])[0]
                    if marker in (0xC0, 0xC1, 0xC2):
                        height, width = struct.unpack(">2H", blob[pos + 5 : pos + 9])
                        break
                    pos += 2 + seg_len
        out.append(
            {
                "index": idx,
                "name": img.get("name", f"image_{idx}"),
                "mimeType": mime,
                "width": width,
                "height": height,
                "byteLength": byte_len,
            }
        )
    return out


def run_gltf_transform_validate(
    glb_path: Path,
    *,
    gltf_transform_bin: Optional[str] = None,
) -> Dict[str, Any]:
    """Run ``gltf-transform validate`` and extract error/warning counts."""
    preferred = Path("/Users/hjunkim/.local/bin/gltf-transform")
    cli = gltf_transform_bin or (str(preferred) if preferred.is_file() else shutil.which("gltf-transform"))
    if not cli:
        return {
            "executed": False,
            "passed": False,
            "errors": ["gltf-transform CLI not found"],
            "warnings": [],
            "raw_output": "",
        }
    proc = subprocess.run([cli, "validate", str(glb_path)], capture_output=True, text=True)
    combined = (proc.stdout or "") + "\n" + (proc.stderr or "")
    has_no_errors = "No errors found." in combined
    has_no_warnings = "No warnings found." in combined
    has_tangent_warning = "MESH_PRIMITIVE_GENERATED_TANGENT_SPACE" in combined

    err_list: List[str] = []
    warn_list: List[str] = []
    if proc.returncode != 0 or not has_no_errors:
        err_list.append(f"gltf-transform validate reported errors (rc={proc.returncode})")
    if has_tangent_warning:
        warn_list.append("MESH_PRIMITIVE_GENERATED_TANGENT_SPACE warning detected")
    elif not has_no_warnings:
        warn_list.append("gltf-transform validate reported warnings (see raw_output)")

    return {
        "executed": True,
        "returncode": proc.returncode,
        "passed": len(err_list) == 0 and not has_tangent_warning,
        "errors": err_list,
        "warnings": warn_list,
        "has_tangent_space_warning": has_tangent_warning,
        "raw_output": combined.strip(),
    }


def inspect_glb(
    glb_path: Path,
    *,
    profile: str = "desktop",
    require_meshopt: bool = True,
    run_validate: bool = True,
    gltf_transform_bin: Optional[str] = None,
) -> Dict[str, Any]:
    """Validate an exported BG3D GLB file against all ToonStudio Gate 2 contracts."""
    glb_path = Path(glb_path)
    gltf, bin_chunk = _parse_glb_chunks(glb_path)
    byte_size = glb_path.stat().st_size

    errors: List[str] = []
    warnings: List[str] = []

    extensions_used = list(gltf.get("extensionsUsed", []))
    extensions_req = list(gltf.get("extensionsRequired", []))

    if "KHR_draco_mesh_compression" in extensions_used or "KHR_draco_mesh_compression" in extensions_req:
        errors.append("Forbidden extension KHR_draco_mesh_compression found in BG3D GLB")
    if require_meshopt and "EXT_meshopt_compression" not in extensions_used:
        errors.append("Expected EXT_meshopt_compression in optimized BG3D GLB")

    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    accessors = gltf.get("accessors", [])
    materials = gltf.get("materials", [])

    nodes_by_name = {n.get("name"): (i, n) for i, n in enumerate(nodes) if n.get("name")}
    required_nodes = DESKTOP_REQUIRED_NODES if profile == "desktop" else MOBILE_REQUIRED_NODES
    missing = [name for name in required_nodes if name not in nodes_by_name]
    if missing:
        errors.append(f"GLB missing required {profile} cutaway nodes: {missing}")

    for name in required_nodes:
        entry = nodes_by_name.get(name)
        if entry is None:
            continue
        _, node = entry
        extras = node.get("extras") or {}
        for key in REQUIRED_EXTRA_KEYS:
            if key not in extras:
                errors.append(f"GLB node '{name}' missing extras.{key}")

    # Traverse scene graph to compute draw calls, triangles, and world-transformed AABB
    scene_idx = int(gltf.get("scene", 0))
    scenes = gltf.get("scenes", [])
    root_indices = scenes[scene_idx].get("nodes", []) if scene_idx < len(scenes) else []

    draw_calls = 0
    total_triangles = 0
    world_ys: List[float] = []
    world_xs: List[float] = []
    world_zs: List[float] = []

    def _visit(node_idx: int, parent_mat: List[List[float]]) -> None:
        nonlocal draw_calls, total_triangles
        node = nodes[node_idx]
        world_mat = _mat4_mul(parent_mat, _node_local_matrix(node))
        mesh_idx = node.get("mesh")
        if mesh_idx is not None and mesh_idx < len(meshes):
            mesh = meshes[mesh_idx]
            for prim in mesh.get("primitives", []):
                draw_calls += 1
                mode = int(prim.get("mode", 4))
                idx_acc = prim.get("indices")
                pos_acc = prim.get("attributes", {}).get("POSITION")
                if idx_acc is not None and idx_acc < len(accessors) and mode == 4:
                    total_triangles += int(accessors[idx_acc].get("count", 0)) // 3
                elif pos_acc is not None and pos_acc < len(accessors) and mode == 4:
                    total_triangles += int(accessors[pos_acc].get("count", 0)) // 3

                if pos_acc is not None and pos_acc < len(accessors):
                    acc = accessors[pos_acc]
                    amin = acc.get("min")
                    amax = acc.get("max")
                    if amin and amax and len(amin) == 3 and len(amax) == 3:
                        # Account for normalized KHR_mesh_quantization component types
                        norm_scale = 1.0
                        if acc.get("normalized", False):
                            ctype = int(acc.get("componentType", 5126))
                            norm_scale = {
                                5120: 1.0 / 127.0,
                                5121: 1.0 / 255.0,
                                5122: 1.0 / 32767.0,
                                5123: 1.0 / 65535.0,
                            }.get(ctype, 1.0)
                        for cx in (amin[0] * norm_scale, amax[0] * norm_scale):
                            for cy in (amin[1] * norm_scale, amax[1] * norm_scale):
                                for cz in (amin[2] * norm_scale, amax[2] * norm_scale):
                                    wx, wy, wz = _transform_point(world_mat, (cx, cy, cz))
                                    world_xs.append(wx)
                                    world_ys.append(wy)
                                    world_zs.append(wz)

        for child_idx in node.get("children", []):
            _visit(int(child_idx), world_mat)

    for ridx in root_indices:
        _visit(int(ridx), _mat4_identity())

    min_y = min(world_ys) if world_ys else 0.0
    max_y = max(world_ys) if world_ys else 0.0
    if abs(min_y) > 2e-3:
        errors.append(f"GLB world grounding violated: min_y={min_y:.6f} (expected 0.0 ± 0.002)")

    image_stats = _decode_image_dimensions(gltf, bin_chunk)
    max_tex_dim = max((max(im["width"], im["height"]) for im in image_stats), default=0)

    budget = PROFILE_BUDGETS[profile]
    if draw_calls > budget["max_draw_calls"]:
        errors.append(f"GLB draw_calls={draw_calls} exceeds {profile} limit {budget['max_draw_calls']}")
    if len(materials) > budget["max_materials"]:
        errors.append(f"GLB materials={len(materials)} exceeds {profile} limit {budget['max_materials']}")
    if total_triangles > budget["max_triangles"]:
        errors.append(f"GLB triangles={total_triangles} exceeds {profile} limit {budget['max_triangles']}")
    if max_tex_dim > budget["max_texture_dim"]:
        errors.append(f"GLB max texture dim {max_tex_dim} exceeds {profile} limit {budget['max_texture_dim']}")
    if byte_size > budget["max_bytes"]:
        errors.append(f"GLB byteSize={byte_size} exceeds {profile} limit {budget['max_bytes']}")

    val_report: Optional[Dict[str, Any]] = None
    if run_validate:
        val_report = run_gltf_transform_validate(glb_path, gltf_transform_bin=gltf_transform_bin)
        if not val_report["passed"]:
            errors.extend(val_report["errors"])
            if val_report.get("has_tangent_space_warning"):
                errors.append("gltf-transform validate reported MESH_PRIMITIVE_GENERATED_TANGENT_SPACE")
        elif val_report["warnings"]:
            warnings.extend(val_report["warnings"])

    bounds_gltf = (
        [
            round(max(world_xs) - min(world_xs), 4),
            round(max_y - min_y, 4),
            round(max(world_zs) - min(world_zs), 4),
        ]
        if world_xs
        else [0.0, 0.0, 0.0]
    )

    return {
        "gate": "glb_contract_and_validate",
        "path": str(glb_path),
        "profile": profile,
        "passed": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "summary": {
            "byte_size": byte_size,
            "draw_calls": draw_calls,
            "materials": len(materials),
            "material_names": [m.get("name", "") for m in materials],
            "triangles": total_triangles,
            "min_y_gltf": round(min_y, 6),
            "max_y_gltf": round(max_y, 6),
            "bounds_gltf": bounds_gltf,
            "extensions_used": extensions_used,
            "max_texture_dim": max_tex_dim,
            "image_count": len(image_stats),
            "node_names": [n.get("name", "") for n in nodes],
        },
        "images": image_stats,
        "gltf_validate": val_report,
    }


def _main_cli(argv: Optional[Sequence[str]] = None) -> int:
    raw_argv = list(argv) if argv is not None else sys.argv[1:]
    if "--" in raw_argv:
        raw_argv = raw_argv[raw_argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio Hero BG3D QA Gate validator")
    parser.add_argument("--glb", type=Path, required=True, help="Path to GLB file to validate")
    parser.add_argument("--profile", choices=("desktop", "mobile"), default="desktop")
    parser.add_argument("--no-meshopt", action="store_true", help="Do not require EXT_meshopt_compression")
    parser.add_argument("--skip-validate", action="store_true", help="Skip gltf-transform validate")
    parser.add_argument("--out", type=Path, help="Optional JSON report output path")
    args = parser.parse_args(raw_argv)

    report = inspect_glb(
        args.glb,
        profile=args.profile,
        require_meshopt=not args.no_meshopt,
        run_validate=not args.skip_validate,
    )
    rendered = json.dumps(report, indent=2, ensure_ascii=False)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(_main_cli())
