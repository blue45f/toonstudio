"""ToonStudio Modeler Kit V13 — 고품질 매니폴드 프로시저럴 지오메트리 프리미티브 & 재질 유틸리티."""

from __future__ import annotations

import math
from typing import Sequence

import bmesh
import bpy
import mathutils
from mathutils import Vector

MAT_CACHE: dict[str, bpy.types.Material] = {}


def clear_material_cache() -> None:
    MAT_CACHE.clear()


def make_mat(
    name: str,
    color: tuple[float, float, float],
    roughness: float = 0.45,
    metallic: float = 0.0,
    emission_color: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    if name in MAT_CACHE:
        return MAT_CACHE[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1.0)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission_color is not None and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    MAT_CACHE[name] = mat
    return mat


def _transform_verts(
    bm: bmesh.types.BMesh,
    verts: Sequence[bmesh.types.BMVert],
    center_xyz: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_euler: tuple[float, float, float] | None = None,
    scale_xyz: tuple[float, float, float] | None = None,
) -> None:
    if scale_xyz is not None and scale_xyz != (1.0, 1.0, 1.0):
        bmesh.ops.scale(bm, vec=scale_xyz, verts=list(verts))
    if rot_euler is not None:
        mat_rot = mathutils.Euler(rot_euler, "XYZ").to_matrix().to_4x4()
        bmesh.ops.rotate(bm, cent=(0.0, 0.0, 0.0), matrix=mat_rot, verts=list(verts))
    if center_xyz != (0.0, 0.0, 0.0):
        bmesh.ops.translate(bm, vec=center_xyz, verts=list(verts))


def add_beveled_box(
    bm: bmesh.types.BMesh,
    size_xyz: tuple[float, float, float],
    center_xyz: tuple[float, float, float],
    bevel_offset: float = 0.008,
    segments: int = 2,
    rot_euler: tuple[float, float, float] | None = None,
) -> list[bmesh.types.BMVert]:
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = list(ret["verts"])
    bmesh.ops.scale(bm, vec=size_xyz, verts=verts)
    safe_bevel = min(bevel_offset, min(size_xyz) * 0.26)
    if safe_bevel > 1e-4:
        edges = list({e for v in verts for e in v.link_edges})
        bev = bmesh.ops.bevel(
            bm,
            geom=edges,
            offset=safe_bevel,
            segments=max(1, segments),
            profile=0.5,
            affect="EDGES",
        )
        verts = [g for g in bev["verts"] if isinstance(g, bmesh.types.BMVert)] or verts
    _transform_verts(bm, verts, center_xyz=center_xyz, rot_euler=rot_euler)
    return verts


def add_lathe_solid(
    bm: bmesh.types.BMesh,
    profile_rz: Sequence[tuple[float, float]],
    segments: int = 24,
    center_xyz: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_euler: tuple[float, float, float] | None = None,
    scale_xyz: tuple[float, float, float] | None = None,
) -> list[bmesh.types.BMVert]:
    """회전체 프로파일 [(r, z), ...] (아래->위 순서, r > 0)로부터 완전 닫힌 2-매니폴드 회전체 생성."""
    if len(profile_rz) < 2:
        raise ValueError("profile_rz must contain at least 2 (r, z) stations")
    cleaned: list[tuple[float, float]] = []
    for r, z in profile_rz:
        cr = max(0.003, float(r))
        cz = float(z)
        if cleaned and math.hypot(cr - cleaned[-1][0], cz - cleaned[-1][1]) < 1e-4:
            continue
        cleaned.append((cr, cz))
    if len(cleaned) < 2:
        raise ValueError("profile_rz stations collapsed")

    created_verts: list[bmesh.types.BMVert] = []
    v_bot = bm.verts.new((0.0, 0.0, cleaned[0][1]))
    v_top = bm.verts.new((0.0, 0.0, cleaned[-1][1]))
    created_verts.extend((v_bot, v_top))

    rings: list[list[bmesh.types.BMVert]] = []
    for r, z in cleaned:
        ring: list[bmesh.types.BMVert] = []
        for s in range(segments):
            ang = (2.0 * math.pi * s) / segments
            v = bm.verts.new((r * math.cos(ang), r * math.sin(ang), z))
            ring.append(v)
            created_verts.append(v)
        rings.append(ring)

    # Bottom cap (-Z outward)
    first_ring = rings[0]
    for s in range(segments):
        sn = (s + 1) % segments
        bm.faces.new((v_bot, first_ring[sn], first_ring[s]))

    # Side quad strips
    for k in range(len(rings) - 1):
        r_low = rings[k]
        r_high = rings[k + 1]
        for s in range(segments):
            sn = (s + 1) % segments
            bm.faces.new((r_low[s], r_low[sn], r_high[sn], r_high[s]))

    # Top cap (+Z outward)
    last_ring = rings[-1]
    for s in range(segments):
        sn = (s + 1) % segments
        bm.faces.new((v_top, last_ring[s], last_ring[sn]))

    _transform_verts(bm, created_verts, center_xyz=center_xyz, rot_euler=rot_euler, scale_xyz=scale_xyz)
    return created_verts


def add_fluted_column_shaft(
    bm: bmesh.types.BMesh,
    base_radius: float,
    top_radius: float,
    height: float,
    flutes: int = 16,
    flute_depth: float = 0.009,
    entasis: float = 0.012,
    z_divisions: int = 10,
    center_xyz: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> list[bmesh.types.BMVert]:
    """배흘림(entasis) 및 세로 골(fluting)을 지원하는 닫힌 2-매니폴드 기둥 몸통."""
    ang_segs = max(16, flutes * 2)
    created: list[bmesh.types.BMVert] = []
    v_bot = bm.verts.new((0.0, 0.0, 0.0))
    v_top = bm.verts.new((0.0, 0.0, height))
    created.extend((v_bot, v_top))

    rings: list[list[bmesh.types.BMVert]] = []
    for iz in range(z_divisions + 1):
        t = iz / z_divisions
        z = height * t
        # 배흘림: 1/3~1/2 지점에서 완만하게 부풀어 오르는 전통·고전 기둥 곡선
        belly = math.sin(math.pi * (t**0.82)) * entasis
        base_r = base_radius * (1.0 - t) + top_radius * t + belly
        flute_env = math.sin(math.pi * min(1.0, max(0.0, (t - 0.06) / 0.88))) if 0.06 < t < 0.94 else 0.0
        ring: list[bmesh.types.BMVert] = []
        for s in range(ang_segs):
            ang = (2.0 * math.pi * s) / ang_segs
            groove = max(0.0, math.cos(flutes * ang)) * flute_depth * flute_env
            r = max(0.01, base_r - groove)
            v = bm.verts.new((r * math.cos(ang), r * math.sin(ang), z))
            ring.append(v)
            created.append(v)
        rings.append(ring)

    for s in range(ang_segs):
        sn = (s + 1) % ang_segs
        bm.faces.new((v_bot, rings[0][sn], rings[0][s]))
    for k in range(z_divisions):
        for s in range(ang_segs):
            sn = (s + 1) % ang_segs
            bm.faces.new((rings[k][s], rings[k][sn], rings[k + 1][sn], rings[k + 1][s]))
    for s in range(ang_segs):
        sn = (s + 1) % ang_segs
        bm.faces.new((v_top, rings[-1][s], rings[-1][sn]))

    _transform_verts(bm, created, center_xyz=center_xyz)
    return created


def add_involute_gear(
    bm: bmesh.types.BMesh,
    pitch_radius: float,
    teeth: int,
    thickness: float,
    bore_radius: float = 0.05,
    center_xyz: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_euler: tuple[float, float, float] | None = None,
    phase: float = 0.0,
) -> list[bmesh.types.BMVert]:
    """내경 보어와 인볼류트 근사 치형을 갖춘 완전 수밀(Watertight) 사각면 기어 솔리드."""
    module = (2.0 * pitch_radius) / max(6, teeth)
    r_ded = max(bore_radius + 0.025, pitch_radius - 1.15 * module)
    r_add = pitch_radius + 0.95 * module
    r_in = max(0.012, min(bore_radius, r_ded - 0.02))
    half_t = thickness * 0.5

    n_loop = teeth * 4
    outer_xy: list[tuple[float, float]] = []
    inner_xy: list[tuple[float, float]] = []
    step_pitch = (2.0 * math.pi) / teeth

    for t_idx in range(teeth):
        base_ang = phase + t_idx * step_pitch
        # 4 stations per tooth: root-start, flank-rise, tip-top, tip-end
        stations = (
            (base_ang + step_pitch * 0.00, r_ded),
            (base_ang + step_pitch * 0.22, r_ded),
            (base_ang + step_pitch * 0.34, r_add),
            (base_ang + step_pitch * 0.66, r_add),
        )
        for ang, rad in stations:
            outer_xy.append((rad * math.cos(ang), rad * math.sin(ang)))
            inner_xy.append((r_in * math.cos(ang), r_in * math.sin(ang)))

    created: list[bmesh.types.BMVert] = []
    out_bot = [bm.verts.new((x, y, -half_t)) for (x, y) in outer_xy]
    out_top = [bm.verts.new((x, y, half_t)) for (x, y) in outer_xy]
    in_bot = [bm.verts.new((x, y, -half_t)) for (x, y) in inner_xy]
    in_top = [bm.verts.new((x, y, half_t)) for (x, y) in inner_xy]
    created.extend(out_bot + out_top + in_bot + in_top)

    for i in range(n_loop):
        inext = (i + 1) % n_loop
        # Top annulus (+Z)
        bm.faces.new((in_top[i], out_top[i], out_top[inext], in_top[inext]))
        # Bottom annulus (-Z)
        bm.faces.new((in_bot[inext], out_bot[inext], out_bot[i], in_bot[i]))
        # Outer tooth wall (+R)
        bm.faces.new((out_bot[i], out_bot[inext], out_top[inext], out_top[i]))
        # Inner bore wall (-R)
        bm.faces.new((in_bot[inext], in_bot[i], in_top[i], in_top[inext]))

    _transform_verts(bm, created, center_xyz=center_xyz, rot_euler=rot_euler)
    return created


def add_quad_sphere(
    bm: bmesh.types.BMesh,
    radius: float = 0.22,
    divisions: int = 8,
    center_xyz: tuple[float, float, float] = (0.0, 0.0, 0.0),
    scale_xyz: tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> list[bmesh.types.BMVert]:
    """극점 핀칭 없는 6패치 균일 사각 구체(Quad-sphere)."""
    vert_map: dict[tuple[int, int, int], bmesh.types.BMVert] = {}
    patches = (
        ((-divisions, -divisions, divisions), (2, 0, 0), (0, 2, 0)),
        ((divisions, -divisions, -divisions), (-2, 0, 0), (0, 2, 0)),
        ((divisions, -divisions, divisions), (0, 0, -2), (0, 2, 0)),
        ((-divisions, -divisions, -divisions), (0, 0, 2), (0, 2, 0)),
        ((-divisions, divisions, divisions), (2, 0, 0), (0, 0, -2)),
        ((-divisions, -divisions, -divisions), (2, 0, 0), (0, 0, 2)),
    )

    def get_v(gx: int, gy: int, gz: int) -> bmesh.types.BMVert:
        key = (gx, gy, gz)
        if key in vert_map:
            return vert_map[key]
        nx, ny, nz = gx / divisions, gy / divisions, gz / divisions
        sx = nx * math.sqrt(max(0.0, 1.0 - ny * ny * 0.5 - nz * nz * 0.5 + (ny * ny * nz * nz) / 3.0))
        sy = ny * math.sqrt(max(0.0, 1.0 - nz * nz * 0.5 - nx * nx * 0.5 + (nz * nz * nx * nx) / 3.0))
        sz = nz * math.sqrt(max(0.0, 1.0 - nx * nx * 0.5 - ny * ny * 0.5 + (nx * nx * ny * ny) / 3.0))
        ln = math.sqrt(sx * sx + sy * sy + sz * sz) or 1.0
        v = bm.verts.new(((sx / ln) * radius, (sy / ln) * radius, (sz / ln) * radius))
        vert_map[key] = v
        return v

    for orig, ua, va in patches:
        for iv in range(divisions):
            for iu in range(divisions):
                c00 = get_v(orig[0] + ua[0] * iu + va[0] * iv, orig[1] + ua[1] * iu + va[1] * iv, orig[2] + ua[2] * iu + va[2] * iv)
                c10 = get_v(orig[0] + ua[0] * (iu + 1) + va[0] * iv, orig[1] + ua[1] * (iu + 1) + va[1] * iv, orig[2] + ua[2] * (iu + 1) + va[2] * iv)
                c11 = get_v(orig[0] + ua[0] * (iu + 1) + va[0] * (iv + 1), orig[1] + ua[1] * (iu + 1) + va[1] * (iv + 1), orig[2] + ua[2] * (iu + 1) + va[2] * (iv + 1))
                c01 = get_v(orig[0] + ua[0] * iu + va[0] * (iv + 1), orig[1] + ua[1] * iu + va[1] * (iv + 1), orig[2] + ua[2] * iu + va[2] * (iv + 1))
                bm.faces.new((c00, c10, c11, c01))

    verts = list(vert_map.values())
    _transform_verts(bm, verts, center_xyz=center_xyz, scale_xyz=scale_xyz)
    return verts


def add_tube_segment(
    bm: bmesh.types.BMesh,
    p0: tuple[float, float, float],
    p1: tuple[float, float, float],
    r0: float,
    r1: float | None = None,
    segments: int = 12,
) -> list[bmesh.types.BMVert]:
    """두 3D 좌표 사이를 잇는 닫힌 원통·테이퍼 봉."""
    v0 = Vector(p0)
    v1 = Vector(p1)
    delta = v1 - v0
    length = delta.length
    if length < 1e-4:
        return []
    rad1 = r0 if r1 is None else r1
    verts = add_lathe_solid(
        bm,
        [(r0, -length * 0.5), (rad1, length * 0.5)],
        segments=segments,
    )
    rot_q = Vector((0.0, 0.0, 1.0)).rotation_difference(delta.normalized())
    bmesh.ops.rotate(bm, cent=(0.0, 0.0, 0.0), matrix=rot_q.to_matrix().to_4x4(), verts=verts)
    mid = (v0 + v1) * 0.5
    bmesh.ops.translate(bm, vec=(mid.x, mid.y, mid.z), verts=verts)
    return verts


def create_mesh_object(
    scene: bpy.types.Scene,
    name: str,
    bm: bmesh.types.BMesh,
    mat: bpy.types.Material,
    smooth: bool = True,
    subsurf_levels: int = 0,
    weighted_normals: bool = False,
) -> bpy.types.Object:
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth

    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    if subsurf_levels > 0:
        mod_sub = obj.modifiers.new(name="Subsurf", type="SUBSURF")
        mod_sub.levels = subsurf_levels
        mod_sub.render_levels = subsurf_levels
        bpy.ops.object.modifier_apply(modifier=mod_sub.name)

    if weighted_normals and smooth:
        mod_wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
        mod_wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=mod_wn.name)

    for poly in obj.data.polygons:
        poly.use_smooth = smooth

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj
