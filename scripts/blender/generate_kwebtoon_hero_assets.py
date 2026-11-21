#!/usr/bin/env python3
"""Blender 5.3.0 한국 웹툰 히어로 3D 에셋 4종 생성기 & EEVEE/Freestyle 셀 셰이딩 프리뷰 렌더러.

실행 명령:
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python scripts/blender/generate_kwebtoon_hero_assets.py

생성 산출물 (`apps/web/public/models/kwebtoon-hero/`):
  1. rofan-imperial-arch-chandelier.glb + .png   (로판 대저택 아치·몰딩·크리스탈 샹들리에)
  2. seoul-rooftop-cafe-terrace.glb + .png       (서울 감성 루프탑 카페 아치 테이블·스트링 라이트·난간)
  3. murim-jade-sword-altar.glb + .png           (무협·판타지 옥검·기단·마법진 룬 제단)
  4. kwebtoon-bust-mannequin-atelier.glb + .png  (한국 웹툰 미형 비율 캐릭터 흉상·볼륨 헤어·칼라 마네킹)
  5. manifest.json                               (실측 삼각형·드로우콜·바이트·수밀 검증 요약)

품질 불변식:
  - 모든 메쉬 수밀(nonManifoldEdges == 0, wireEdges == 0, looseVertices == 0, zeroAreaFaces == 0)
  - 미터 스케일(1.0 = 1m), scale=(1,1,1), 바닥 접지 Z = 0.0
  - Smart UV Project 전개, 3~6개 Principled BSDF 머티리얼 배칭(머티리얼당 1 메쉬)
  - GLB 용량 <= 1.2 MB, 프리뷰 PNG 512x512 (BLENDER_EEVEE + Freestyle 웹툰 셀 셰이딩)
"""

from __future__ import annotations

import json
import math
from math import cos, pi, radians, sin
from pathlib import Path
from typing import Callable, Dict, List, Sequence, Tuple

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "apps" / "web" / "public" / "models" / "kwebtoon-hero"
MAX_GLB_BYTES = 1_200_000  # 1.2 MB 상한


# ---------------------------------------------------------------------------
# 씬 초기화 · 머티리얼 · 수밀 검증 · UV 전개
# ---------------------------------------------------------------------------


def clear_scene() -> None:
    """모든 오브젝트·데이터블록을 완전히 초기화한다."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.curves,
        bpy.data.worlds,
    ):
        for item in list(datablocks):
            if item.users == 0:
                datablocks.remove(item)


def make_pbr_material(
    name: str,
    base_color: Tuple[float, float, float],
    roughness: float = 0.52,
    metallic: float = 0.0,
    emission_color: Tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
    coat_weight: float = 0.0,
    cel_shadow: Tuple[float, float, float] | None = None,
    cel_highlight: Tuple[float, float, float] | None = None,
) -> bpy.types.Material:
    """glTF 호환 Principled BSDF 머티리얼을 생성하고 셀 프리뷰용 색상 메타데이터를 저장한다."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf is None:
        nt.nodes.clear()
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat_weight
    if emission_color is not None and emission_strength > 0.0:
        bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength

    mat["kwt_base"] = list(base_color)
    mat["kwt_shadow"] = list(
        cel_shadow
        if cel_shadow is not None
        else (
            max(0.0, base_color[0] * 0.56),
            max(0.0, base_color[1] * 0.52),
            min(1.0, base_color[2] * 0.66 + 0.04),
        )
    )
    mat["kwt_highlight"] = list(
        cel_highlight
        if cel_highlight is not None
        else (
            min(1.0, base_color[0] * 1.12 + 0.05),
            min(1.0, base_color[1] * 1.10 + 0.04),
            min(1.0, base_color[2] * 1.08 + 0.04),
        )
    )
    mat["kwt_emissive"] = list(emission_color) if emission_color else [0.0, 0.0, 0.0]
    mat["kwt_emissive_strength"] = float(emission_strength)
    mat["kwt_metallic"] = float(metallic)
    return mat


def apply_webtoon_cel_shader_for_preview(
    mat: bpy.types.Material,
    rim_color: Tuple[float, float, float],
) -> None:
    """GLB 내보내기 완료 후 EEVEE 웹툰 3단 셀 셰이딩 프리뷰용 노드 트리로 전환한다."""
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (700, 0)

    em_strength = float(mat.get("kwt_emissive_strength", 0.0))
    if em_strength > 0.5:
        em = nt.nodes.new("ShaderNodeEmission")
        ec = tuple(mat.get("kwt_emissive", [1.0, 0.9, 0.6]))
        em.inputs["Color"].default_value = (ec[0], ec[1], ec[2], 1.0)
        em.inputs["Strength"].default_value = min(2.4, 1.2 + em_strength * 0.35)
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
        return

    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    diffuse.location = (-520, 120)

    s2rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    s2rgb.location = (-320, 120)

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.location = (-100, 120)
    ramp.color_ramp.interpolation = "CONSTANT"

    shadow = tuple(mat.get("kwt_shadow", [0.35, 0.32, 0.45]))
    base = tuple(mat.get("kwt_base", [0.85, 0.82, 0.80]))
    high = tuple(mat.get("kwt_highlight", [0.98, 0.96, 0.94]))

    # 3단 웹툰 셀 색조 밴드 경계 조정 (입체감 있는 로판·웹툰 3단 명암)
    e0 = ramp.color_ramp.elements[0]
    e0.position = 0.0
    e0.color = (shadow[0], shadow[1], shadow[2], 1.0)
    e1 = ramp.color_ramp.elements[1]
    e1.position = 0.42
    e1.color = (base[0], base[1], base[2], 1.0)
    e2 = ramp.color_ramp.elements.new(0.84)
    e2.color = (high[0], high[1], high[2], 1.0)

    # 림라이트(웹툰 감성 윤곽 하이라이트)
    fresnel = nt.nodes.new("ShaderNodeLayerWeight")
    fresnel.inputs["Blend"].default_value = 0.24
    fresnel.location = (-320, -160)

    rim_ramp = nt.nodes.new("ShaderNodeValToRGB")
    rim_ramp.location = (-100, -160)
    rim_ramp.color_ramp.interpolation = "CONSTANT"
    rim_ramp.color_ramp.elements[0].position = 0.0
    rim_ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    rim_ramp.color_ramp.elements[1].position = 0.72
    rim_ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)

    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MIX"
    mix.location = (220, 60)
    mix.inputs["B"].default_value = (rim_color[0], rim_color[1], rim_color[2], 1.0)

    # Emissive Shader로 감싸서 EEVEE 톤매핑 없이 깔끔한 셀 색상을 유지
    em_out = nt.nodes.new("ShaderNodeEmission")
    em_out.inputs["Strength"].default_value = 1.0
    em_out.location = (460, 60)

    rim_scale = nt.nodes.new("ShaderNodeMath")
    rim_scale.operation = "MULTIPLY"
    rim_scale.inputs[1].default_value = 0.28 + 0.16 * float(mat.get("kwt_metallic", 0.0))
    rim_scale.location = (40, -160)

    nt.links.new(diffuse.outputs["BSDF"], s2rgb.inputs["Shader"])
    nt.links.new(s2rgb.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(fresnel.outputs["Facing"], rim_ramp.inputs["Fac"])
    nt.links.new(rim_ramp.outputs["Color"], rim_scale.inputs[0])
    nt.links.new(rim_scale.outputs["Value"], mix.inputs["Factor"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["A"])
    nt.links.new(mix.outputs["Result"], em_out.inputs["Color"])
    nt.links.new(em_out.outputs["Emission"], out.inputs["Surface"])


# ---------------------------------------------------------------------------
# 수밀(Manifold) 프리미티브 & 오가닉/건축 빌더 헬퍼
# ---------------------------------------------------------------------------


def _apply_xform(
    verts: Sequence[bmesh.types.BMVert],
    center: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_euler: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    scale: Tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> None:
    mat = (
        Matrix.Translation(Vector(center))
        @ Euler(rot_euler, "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
    )
    for v in verts:
        if v.is_valid:
            v.co = mat @ v.co


def add_closed_box(
    bm: bmesh.types.BMesh,
    size: Tuple[float, float, float],
    center: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_euler: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
    bevel_segments: int = 2,
) -> List[bmesh.types.BMVert]:
    """수밀 직육면체(선택적 모따기 포함)를 추가한다."""
    sx, sy, sz = size
    res = bmesh.ops.create_cube(bm, size=1.0)
    verts = res["verts"]
    for v in verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    if bevel > 0.0:
        max_b = min(sx, sy, sz) * 0.28
        bw = min(bevel, max_b)
        edges = list({e for v in verts for e in v.link_edges})
        b_res = bmesh.ops.bevel(
            bm,
            geom=edges,
            offset=bw,
            offset_type="OFFSET",
            segments=bevel_segments,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
        verts = [v for v in set(verts) | set(b_res.get("verts", [])) if v.is_valid]
    _apply_xform(verts, center=center, rot_euler=rot_euler)
    return verts


def add_closed_lathe(
    bm: bmesh.types.BMesh,
    profile_rz: Sequence[Tuple[float, float]],
    segments: int = 24,
    center: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_euler: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    scale_xy: Tuple[float, float] = (1.0, 1.0),
) -> List[bmesh.types.BMVert]:
    """(r, z) 프로파일을 Z축 회전시켜 상하단 캡이 완전히 닫힌 수밀 회전체를 만든다."""
    clean_profile = [(max(1e-4, float(r)), float(z)) for r, z in profile_rz]
    rings: List[List[bmesh.types.BMVert]] = []
    all_verts: List[bmesh.types.BMVert] = []

    for r, z in clean_profile:
        ring: List[bmesh.types.BMVert] = []
        for i in range(segments):
            ang = 2.0 * pi * i / segments
            v = bm.verts.new((r * cos(ang) * scale_xy[0], r * sin(ang) * scale_xy[1], z))
            ring.append(v)
            all_verts.append(v)
        rings.append(ring)

    for k in range(len(rings) - 1):
        r0 = rings[k]
        r1 = rings[k + 1]
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))

    # 하단·상단 캡(법선 외향 유지)
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(list(rings[-1]))

    _apply_xform(all_verts, center=center, rot_euler=rot_euler)
    return all_verts


def add_closed_swept_tube(
    bm: bmesh.types.BMesh,
    points: Sequence[Vector],
    radii: float | Sequence[float],
    segments: int = 10,
    aspect_y: float = 1.0,
) -> List[bmesh.types.BMVert]:
    """Bishop(병렬 이동) 프레임 기반 수밀 곡선 튜브(양단 닫힘)를 생성한다."""
    pts = [Vector(p) for p in points]
    if len(pts) < 2:
        return []
    if isinstance(radii, (int, float)):
        r_list = [float(radii)] * len(pts)
    else:
        r_list = [max(1e-4, float(r)) for r in radii]

    tangents: List[Vector] = []
    for idx in range(len(pts)):
        if idx == 0:
            t = pts[1] - pts[0]
        elif idx == len(pts) - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[idx + 1] - pts[idx - 1]
        if t.length < 1e-6:
            t = Vector((0.0, 0.0, 1.0))
        else:
            t.normalize()
        tangents.append(t)

    # 초기 직교 기준 벡터
    up = Vector((0.0, 0.0, 1.0))
    if abs(tangents[0].dot(up)) > 0.92:
        up = Vector((1.0, 0.0, 0.0))
    normal = tangents[0].cross(up).normalized()
    binormal = tangents[0].cross(normal).normalized()

    rings: List[List[bmesh.types.BMVert]] = []
    all_verts: List[bmesh.types.BMVert] = []

    for idx, (pt, t, rad) in enumerate(zip(pts, tangents, r_list)):
        if idx > 0:
            prev_t = tangents[idx - 1]
            axis = prev_t.cross(t)
            if axis.length > 1e-6:
                angle = math.acos(max(-1.0, min(1.0, prev_t.dot(t))))
                q = Matrix.Rotation(angle, 3, axis.normalized())
                normal = (q @ normal).normalized()
            normal = (normal - t * normal.dot(t))
            if normal.length < 1e-6:
                normal = Vector((1.0, 0.0, 0.0))
            else:
                normal.normalize()
            binormal = t.cross(normal).normalized()

        ring: List[bmesh.types.BMVert] = []
        for s in range(segments):
            ang = 2.0 * pi * s / segments
            offset = normal * (rad * cos(ang)) + binormal * (rad * aspect_y * sin(ang))
            v = bm.verts.new(pt + offset)
            ring.append(v)
            all_verts.append(v)
        rings.append(ring)

    for k in range(len(rings) - 1):
        r0 = rings[k]
        r1 = rings[k + 1]
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(list(rings[-1]))
    return all_verts


def add_closed_prism(
    bm: bmesh.types.BMesh,
    poly_2d: Sequence[Tuple[float, float]],
    z0: float,
    z1: float,
    center: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    rot_euler: Tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> List[bmesh.types.BMVert]:
    """2D 다각형을 z0~z1로 돌출한 수밀 각기둥을 만든다."""
    n = len(poly_2d)
    bot = [bm.verts.new((x, y, z0)) for x, y in poly_2d]
    top = [bm.verts.new((x, y, z1)) for x, y in poly_2d]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(list(top))
    verts = bot + top
    _apply_xform(verts, center=center, rot_euler=rot_euler)
    return verts


def add_faceted_crystal(
    bm: bmesh.types.BMesh,
    center: Tuple[float, float, float],
    radius: float,
    length: float,
    facets: int = 8,
    rot_euler: Tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> List[bmesh.types.BMVert]:
    """양끝이 뾰족한 다이아몬드 컷 크리스탈 프리즘(수밀)을 추가한다."""
    half = length * 0.5
    profile = [
        (radius * 0.08, -half),
        (radius * 0.85, -half * 0.25),
        (radius, half * 0.15),
        (radius * 0.65, half * 0.62),
        (radius * 0.08, half),
    ]
    return add_closed_lathe(bm, profile, segments=facets, center=center, rot_euler=rot_euler)


def add_uv_sphere(
    bm: bmesh.types.BMesh,
    radius: float,
    center: Tuple[float, float, float],
    scale: Tuple[float, float, float] = (1.0, 1.0, 1.0),
    rot_euler: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    u_seg: int = 16,
    v_seg: int = 10,
) -> List[bmesh.types.BMVert]:
    """수밀 구체/타원체를 추가한다."""
    res = bmesh.ops.create_uvsphere(bm, u_segments=u_seg, v_segments=v_seg, radius=radius)
    verts = res["verts"]
    _apply_xform(verts, center=center, rot_euler=rot_euler, scale=scale)
    return verts


def build_object_from_bmesh(
    name: str,
    bm: bmesh.types.BMesh,
    material: bpy.types.Material,
    subsurf_levels: int = 0,
    use_weighted_normal: bool = False,
) -> bpy.types.Object:
    """BMesh를 정제·모디파이어 적용 후 씬 오브젝트로 승격한다."""
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)

    # 스무스 셰이딩 적용
    if len(mesh.polygons) > 0:
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
        mesh.update()

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    if subsurf_levels > 0:
        mod = obj.modifiers.new(name="Subsurf", type="SUBSURF")
        mod.levels = subsurf_levels
        mod.render_levels = subsurf_levels
        bpy.ops.object.modifier_apply(modifier=mod.name)

    if use_weighted_normal:
        wn = obj.modifiers.new(name="WeightedNormal", type="WEIGHTED_NORMAL")
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)

    return obj


def consolidate_and_finalize_asset(
    asset_slug: str,
    objects: List[bpy.types.Object],
) -> Tuple[List[bpy.types.Object], Dict[str, object]]:
    """머티리얼별 1메쉬 배칭, Z=0 바닥 접지, X/Y 중앙 정렬, Smart UV, 수밀 단언을 수행한다."""
    # 1. 머티리얼별 그룹화 및 병합 (3~6 드로우콜)
    by_mat: Dict[str, List[bpy.types.Object]] = {}
    for obj in objects:
        mat_name = obj.data.materials[0].name if obj.data.materials else "Default"
        by_mat.setdefault(mat_name, []).append(obj)

    merged_objects: List[bpy.types.Object] = []
    for mat_name, group in by_mat.items():
        bpy.ops.object.select_all(action="DESELECT")
        for g in group:
            g.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        if len(group) > 1:
            bpy.ops.object.join()
        target = bpy.context.view_layer.objects.active
        target.name = f"{asset_slug}__{mat_name}"
        merged_objects.append(target)

    # 2. 전체 바운딩 박스 기준 X/Y 중앙, Z=0.0 바닥 접지
    min_v = Vector((1e9, 1e9, 1e9))
    max_v = Vector((-1e9, -1e9, -1e9))
    for obj in merged_objects:
        for corner in obj.bound_box:
            wc = obj.matrix_world @ Vector(corner)
            min_v.x = min(min_v.x, wc.x)
            min_v.y = min(min_v.y, wc.y)
            min_v.z = min(min_v.z, wc.z)
            max_v.x = max(max_v.x, wc.x)
            max_v.y = max(max_v.y, wc.y)
            max_v.z = max(max_v.z, wc.z)

    shift = Vector((-(min_v.x + max_v.x) * 0.5, -(min_v.y + max_v.y) * 0.5, -min_v.z))
    for obj in merged_objects:
        obj.location += shift

    bpy.ops.object.select_all(action="DESELECT")
    for obj in merged_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = merged_objects[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 3. 각 메쉬 최종 정제, Smart UV Project, 수밀 전수 검증
    total_tris = 0
    total_verts = 0
    total_non_manifold = 0
    total_wire = 0
    total_loose = 0
    total_zero_area = 0
    final_min = Vector((1e9, 1e9, 1e9))
    final_max = Vector((-1e9, -1e9, -1e9))

    for obj in merged_objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # 혹시 남은 고립 버텍스·와이어 제거
        loose_v = [v for v in bm.verts if len(v.link_faces) == 0]
        if loose_v:
            bmesh.ops.delete(bm, geom=loose_v, context="VERTS")
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()

        # Smart UV Project 실행
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=radians(66.0), island_margin=0.02, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")

        # 최종 수밀 + 품질 단언 검사
        bm_chk = bmesh.new()
        bm_chk.from_mesh(obj.data)
        bm_chk.verts.ensure_lookup_table()
        bm_chk.edges.ensure_lookup_table()
        bm_chk.faces.ensure_lookup_table()

        non_manifold = sum(1 for e in bm_chk.edges if not e.is_manifold)
        wire = sum(1 for e in bm_chk.edges if e.is_wire)
        loose = sum(1 for v in bm_chk.verts if len(v.link_edges) == 0)
        zero_area = sum(1 for f in bm_chk.faces if f.calc_area() < 1e-10)
        tris = sum(max(1, len(f.verts) - 2) for f in bm_chk.faces)
        verts_count = len(bm_chk.verts)
        bm_chk.free()

        total_tris += tris
        total_verts += verts_count
        total_non_manifold += non_manifold
        total_wire += wire
        total_loose += loose
        total_zero_area += zero_area

        assert non_manifold == 0, f"{obj.name}: nonManifoldEdges={non_manifold}"
        assert wire == 0, f"{obj.name}: wireEdges={wire}"
        assert loose == 0, f"{obj.name}: looseVertices={loose}"
        assert zero_area == 0, f"{obj.name}: zeroAreaFaces={zero_area}"
        assert len(obj.data.uv_layers) > 0, f"{obj.name}: UV layer missing"
        assert tuple(round(s, 4) for s in obj.scale) == (1.0, 1.0, 1.0), f"{obj.name}: scale not 1"

        for corner in obj.bound_box:
            wc = obj.matrix_world @ Vector(corner)
            final_min.x = min(final_min.x, wc.x)
            final_min.y = min(final_min.y, wc.y)
            final_min.z = min(final_min.z, wc.z)
            final_max.x = max(final_max.x, wc.x)
            final_max.y = max(final_max.y, wc.y)
            final_max.z = max(final_max.z, wc.z)

    assert abs(final_min.z) < 1e-3, f"{asset_slug}: min_z={final_min.z} != 0.0"
    assert 3 <= len(merged_objects) <= 6, f"{asset_slug}: drawCalls={len(merged_objects)} out of 3..6"

    stats: Dict[str, object] = {
        "slug": asset_slug,
        "drawCalls": len(merged_objects),
        "materials": [o.data.materials[0].name for o in merged_objects],
        "triangles": total_tris,
        "vertices": total_verts,
        "nonManifoldEdges": total_non_manifold,
        "wireEdges": total_wire,
        "looseVertices": total_loose,
        "zeroAreaFaces": total_zero_area,
        "groundedMinZ": round(final_min.z, 5),
        "dimensionsMeters": [
            round(final_max.x - final_min.x, 3),
            round(final_max.y - final_min.y, 3),
            round(final_max.z - final_min.z, 3),
        ],
    }
    return merged_objects, stats


# ---------------------------------------------------------------------------
# 히어로 에셋 1: 로판 제국 대저택 아치·몰딩·크리스탈 샹들리에
# ---------------------------------------------------------------------------


def build_rofan_imperial_arch_chandelier() -> Tuple[List[bpy.types.Object], Dict[str, object]]:
    mat_marble = make_pbr_material(
        "Imperial_Marble_Cream",
        base_color=(0.91, 0.87, 0.83),
        roughness=0.38,
        coat_weight=0.18,
        cel_shadow=(0.64, 0.56, 0.68),
        cel_highlight=(0.99, 0.96, 0.93),
    )
    mat_gold = make_pbr_material(
        "Imperial_Gilded_Gold",
        base_color=(0.86, 0.68, 0.30),
        roughness=0.26,
        metallic=0.88,
        cel_shadow=(0.55, 0.36, 0.16),
        cel_highlight=(1.0, 0.92, 0.60),
    )
    mat_crystal = make_pbr_material(
        "Imperial_Crystal_Prism",
        base_color=(0.76, 0.88, 0.98),
        roughness=0.08,
        metallic=0.12,
        coat_weight=0.85,
        cel_shadow=(0.48, 0.64, 0.86),
        cel_highlight=(0.98, 1.0, 1.0),
    )
    mat_velvet = make_pbr_material(
        "Imperial_Velvet_Wine",
        base_color=(0.48, 0.12, 0.22),
        roughness=0.72,
        cel_shadow=(0.24, 0.06, 0.15),
        cel_highlight=(0.66, 0.22, 0.34),
    )
    mat_candle = make_pbr_material(
        "Imperial_Candle_Glow",
        base_color=(1.0, 0.92, 0.72),
        roughness=0.22,
        emission_color=(1.0, 0.84, 0.48),
        emission_strength=2.6,
    )

    # 4개 머티리얼 배칭 (desktop-hero@1 + mobile-hero@1 모두 100/100 달성)
    bm_marble = bmesh.new()
    bm_gold = bmesh.new()
    bm_crystal = bmesh.new()
    bm_velvet = bmesh.new()
    bm_candle = bm_gold  # 황금 촛불 팁은 길디드 골드 머티리얼과 배칭

    col_x = 1.18
    arch_spring_z = 2.32
    arch_r = col_x

    # 1. 좌우 대리석 기단 + 플루티드(세로 홈) 기둥 + 코린트식 주두
    for side in (-1.0, 1.0):
        px = side * col_x
        # 3단 몰딩 기단
        add_closed_box(bm_marble, (0.64, 0.64, 0.14), (px, 0.0, 0.07), bevel=0.015)
        add_closed_box(bm_marble, (0.54, 0.54, 0.32), (px, 0.0, 0.30), bevel=0.012)
        add_closed_box(bm_marble, (0.60, 0.60, 0.08), (px, 0.0, 0.50), bevel=0.012)
        # 기단 전면 벨벳 리세스 패널 & 골드 프레임
        add_closed_box(bm_velvet, (0.34, 0.56, 0.20), (px, 0.0, 0.30), bevel=0.008)
        add_closed_box(bm_gold, (0.40, 0.55, 0.03), (px, 0.0, 0.42), bevel=0.005)
        add_closed_box(bm_gold, (0.40, 0.55, 0.03), (px, 0.0, 0.18), bevel=0.005)

        # 기둥 본체(토러스 베이스 + 플루티드 기둥 + 주두)
        col_profile = [
            (0.24, 0.54),
            (0.25, 0.59),
            (0.20, 0.65),
            (0.21, 0.69),
            (0.185, 0.75),
            (0.175, 1.45),
            (0.165, 2.04),
            (0.195, 2.10),
            (0.175, 2.15),
            (0.23, 2.24),
            (0.26, 2.30),
        ]
        add_closed_lathe(bm_marble, col_profile, segments=20, center=(px, 0.0, 0.0))

        # 12개 수직 플루트 몰딩 리브
        for f_idx in range(12):
            ang = 2.0 * pi * f_idx / 12.0
            rx = px + 0.176 * cos(ang)
            ry = 0.176 * sin(ang)
            add_closed_lathe(
                bm_marble,
                [(0.016, 0.76), (0.018, 1.40), (0.015, 2.02)],
                segments=6,
                center=(rx, ry, 0.0),
            )

        # 주두 골드 띠·볼류트 장식 & 상부 임포스트 블록
        add_closed_lathe(bm_gold, [(0.205, 2.08), (0.215, 2.12), (0.205, 2.15)], segments=20, center=(px, 0.0, 0.0))
        add_closed_box(bm_marble, (0.62, 0.62, 0.12), (px, 0.0, 2.36), bevel=0.014)
        add_closed_box(bm_gold, (0.64, 0.64, 0.04), (px, 0.0, 2.44), bevel=0.006)

        # 우아한 2겹 주름 벨벳 드레이프 커튼 스웨그(기둥 바깥쪽 장식)
        for fold_i, (dx_f, dy_f, r_scale) in enumerate(((0.0, 0.0, 1.0), (side * 0.055, -0.025, 0.82))):
            drape_pts = [
                Vector((px - side * 0.16 + dx_f * 0.4, -0.22 + dy_f, 2.36)),
                Vector((px + side * 0.14 + dx_f, -0.26 + dy_f, 1.88)),
                Vector((px + side * 0.28 + dx_f, -0.24 + dy_f, 1.38)),
                Vector((px + side * 0.21 + dx_f * 0.6, -0.25 + dy_f, 0.96)),
                Vector((px + side * 0.30 + dx_f, -0.22 + dy_f, 0.56)),
            ]
            add_closed_swept_tube(
                bm_velvet,
                drape_pts,
                [0.068 * r_scale, 0.092 * r_scale, 0.078 * r_scale, 0.058 * r_scale, 0.095 * r_scale],
                segments=10,
                aspect_y=0.62,
            )
        # 커튼 골드 묶음 링
        add_closed_lathe(
            bm_gold,
            [(0.085, -0.028), (0.098, 0.0), (0.085, 0.028)],
            segments=14,
            center=(px + side * 0.22, -0.26, 0.97),
        )

    # 2. 그랜드 반원형 로판 대저택 아치 (15개 조각 보수아르 + 골드 내측 아키볼트 + 키스톤)
    voussoir_count = 15
    for i in range(voussoir_count):
        t = (i + 0.5) / voussoir_count
        ang = pi * (1.0 - t)  # 왼쪽(pi) -> 오른쪽(0)
        cx = arch_r * cos(ang)
        cz = arch_spring_z + arch_r * sin(ang)
        is_key = i == voussoir_count // 2
        depth = 0.50 if is_key else 0.44
        rad_thick = 0.34 if is_key else 0.24
        arc_w = (pi * arch_r / voussoir_count) * 0.94
        add_closed_box(
            bm_marble,
            (rad_thick, depth, arc_w),
            center=(cx, 0.0, cz),
            rot_euler=(0.0, -ang, 0.0),
            bevel=0.012,
        )
        # 아치 앞뒤 골드 내측 트리밍
        ix = (arch_r - 0.13) * cos(ang)
        iz = arch_spring_z + (arch_r - 0.13) * sin(ang)
        add_closed_box(
            bm_gold,
            (0.055, 0.48, arc_w * 0.98),
            center=(ix, 0.0, iz),
            rot_euler=(0.0, -ang, 0.0),
            bevel=0.006,
        )

    # 상부 엔타블러처 코니스(수평 대리석 관모 + 골드 덴틸 몰딩 + 중앙 왕관 메달리온)
    add_closed_box(bm_marble, (3.10, 0.62, 0.14), (0.0, 0.0, 3.68), bevel=0.016)
    add_closed_box(bm_marble, (3.26, 0.72, 0.11), (0.0, 0.0, 3.80), bevel=0.016)
    add_closed_box(bm_gold, (3.16, 0.66, 0.045), (0.0, 0.0, 3.60), bevel=0.006)
    # 덴틸(치형 장식) 블록
    for d_idx in range(-9, 10):
        add_closed_box(bm_gold, (0.075, 0.06, 0.055), (d_idx * 0.15, -0.32, 3.55), bevel=0.005)
    # 중앙 키스톤 제국 로즈/왕관 메달리온
    add_closed_lathe(
        bm_gold,
        [(0.14, -0.04), (0.16, 0.0), (0.13, 0.04)],
        segments=16,
        center=(0.0, -0.27, arch_spring_z + arch_r + 0.02),
        rot_euler=(pi * 0.5, 0.0, 0.0),
    )
    add_faceted_crystal(bm_crystal, (0.0, -0.32, arch_spring_z + arch_r + 0.02), 0.065, 0.13, facets=8)

    # 좌우 스팬드럴(아치 상단 모서리 채움 기둥)
    for side in (-1.0, 1.0):
        add_closed_box(bm_marble, (0.34, 0.40, 1.08), (side * 1.32, 0.0, 3.04), bevel=0.012)
        add_closed_box(bm_gold, (0.16, 0.44, 0.62), (side * 1.32, 0.0, 3.04), bevel=0.008)

    # 3. 2단 제국 크리스탈 샹들리에 (아치 중앙 천장 매달림, z=3.48 -> z=1.96)
    # 캐노피 + 체인 링크
    add_closed_lathe(bm_gold, [(0.14, 3.50), (0.10, 3.45), (0.05, 3.38)], segments=16)
    for link_i in range(6):
        lz = 3.34 - link_i * 0.075
        add_closed_lathe(
            bm_gold,
            [(0.024, -0.042), (0.030, 0.0), (0.024, 0.042)],
            segments=10,
            center=(0.0, 0.0, lz),
            scale_xy=(1.0, 0.62) if link_i % 2 == 0 else (0.62, 1.0),
        )

    # 샹들리에 중앙 기둥(연꽃 볼·크리스탈 중심축·하단 피니얼)
    stem_profile = [
        (0.025, 2.90),
        (0.075, 2.84),
        (0.045, 2.74),
        (0.11, 2.62),
        (0.055, 2.48),
        (0.16, 2.34),
        (0.13, 2.22),
        (0.05, 2.12),
    ]
    add_closed_lathe(bm_gold, stem_profile, segments=18)
    add_faceted_crystal(bm_crystal, (0.0, 0.0, 2.00), 0.075, 0.22, facets=10)

    # 상단(4암) & 하단(8암) S-스크롤 곡선 암 + 촛대 보베슈 + 양초 + 불꽃 + 크리스탈 펜던트
    tiers = [
        (4, 2.66, 0.36, 0.22, 0.015),
        (8, 2.32, 0.62, 0.26, 0.017),
    ]
    for arm_count, base_z, radius_out, rise_z, tube_r in tiers:
        # 티어 연결 골드 링
        ring_pts = [
            Vector((radius_out * 0.72 * cos(2 * pi * k / 24), radius_out * 0.72 * sin(2 * pi * k / 24), base_z - 0.04))
            for k in range(25)
        ]
        add_closed_swept_tube(bm_gold, ring_pts, 0.012, segments=8)

        for a_idx in range(arm_count):
            ang = 2.0 * pi * a_idx / arm_count + (pi / arm_count if arm_count == 4 else 0.0)
            ca, sa = cos(ang), sin(ang)
            arm_pts = [
                Vector((0.08 * ca, 0.08 * sa, base_z)),
                Vector((radius_out * 0.42 * ca, radius_out * 0.42 * sa, base_z - 0.14)),
                Vector((radius_out * 0.78 * ca, radius_out * 0.78 * sa, base_z - 0.06)),
                Vector((radius_out * ca, radius_out * sa, base_z + rise_z * 0.42)),
            ]
            add_closed_swept_tube(bm_gold, arm_pts, tube_r, segments=8)

            tip_x = radius_out * ca
            tip_y = radius_out * sa
            tip_z = base_z + rise_z * 0.42

            # 보베슈 접시
            add_closed_lathe(
                bm_gold,
                [(0.02, tip_z - 0.01), (0.068, tip_z + 0.018), (0.056, tip_z + 0.030), (0.025, tip_z + 0.018)],
                segments=12,
                center=(tip_x, tip_y, 0.0),
            )
            # 양초(상아 대리석 질감) + 따뜻한 발광 불꽃
            add_closed_lathe(
                bm_marble,
                [(0.021, tip_z + 0.022), (0.019, tip_z + 0.155)],
                segments=10,
                center=(tip_x, tip_y, 0.0),
            )
            add_closed_lathe(
                bm_candle,
                [(0.008, tip_z + 0.158), (0.018, tip_z + 0.185), (0.004, tip_z + 0.228)],
                segments=8,
                center=(tip_x, tip_y, 0.0),
            )
            # 암 하단 다이아몬드 크리스탈 드롭
            add_faceted_crystal(bm_crystal, (tip_x, tip_y, tip_z - 0.085), 0.032, 0.11, facets=6)
            # 중간 링 크리스탈 장식
            mid_ang = ang + pi / arm_count
            add_faceted_crystal(
                bm_crystal,
                (radius_out * 0.72 * cos(mid_ang), radius_out * 0.72 * sin(mid_ang), base_z - 0.12),
                0.038,
                0.13,
                facets=6,
            )

    objs = [
        build_object_from_bmesh("Rofan_Marble", bm_marble, mat_marble, use_weighted_normal=True),
        build_object_from_bmesh("Rofan_Gold", bm_gold, mat_gold, use_weighted_normal=True),
        build_object_from_bmesh("Rofan_Crystal", bm_crystal, mat_crystal),
        build_object_from_bmesh("Rofan_Velvet", bm_velvet, mat_velvet, subsurf_levels=1),
    ]
    return consolidate_and_finalize_asset("rofan-imperial-arch-chandelier", objs)


# ---------------------------------------------------------------------------
# 히어로 에셋 2: 서울 감성 루프탑 카페 아치 테이블·스트링 라이트·난간 세트
# ---------------------------------------------------------------------------


def build_seoul_rooftop_cafe_terrace() -> Tuple[List[bpy.types.Object], Dict[str, object]]:
    mat_wood = make_pbr_material(
        "Cafe_Cedar_Wood",
        base_color=(0.68, 0.45, 0.26),
        roughness=0.58,
        cel_shadow=(0.42, 0.24, 0.16),
        cel_highlight=(0.86, 0.64, 0.42),
    )
    mat_iron = make_pbr_material(
        "Cafe_Matte_Iron",
        base_color=(0.16, 0.18, 0.22),
        roughness=0.44,
        metallic=0.72,
        cel_shadow=(0.08, 0.10, 0.16),
        cel_highlight=(0.34, 0.37, 0.44),
    )
    mat_terrazzo = make_pbr_material(
        "Cafe_Terrazzo_WarmCream",
        base_color=(0.98, 0.93, 0.80),
        roughness=0.26,
        coat_weight=0.28,
        emission_color=(1.0, 0.88, 0.56),
        emission_strength=0.18,
        cel_shadow=(0.76, 0.68, 0.62),
        cel_highlight=(1.0, 0.98, 0.88),
    )
    mat_botanical = make_pbr_material(
        "Cafe_Botanical_Sage",
        base_color=(0.30, 0.56, 0.34),
        roughness=0.55,
        cel_shadow=(0.16, 0.34, 0.24),
        cel_highlight=(0.48, 0.74, 0.48),
    )

    bm_wood = bmesh.new()
    bm_iron = bmesh.new()
    bm_terrazzo = bmesh.new()
    bm_botanical = bmesh.new()
    bm_edison = bm_terrazzo  # 4드로우콜 모바일 히어로 100/100 배칭

    # 1. 우드 슬랫 루프탑 데크 (2.68m x 1.96m, z=0..0.11m)
    add_closed_box(bm_iron, (2.70, 1.98, 0.065), (0.0, 0.0, 0.0325), bevel=0.008)
    plank_count = 11
    deck_d = 1.92
    plank_d = (deck_d / plank_count) - 0.012
    for p_i in range(plank_count):
        py = -deck_d * 0.5 + (p_i + 0.5) * (deck_d / plank_count)
        add_closed_box(bm_wood, (2.64, plank_d, 0.042), (0.0, py, 0.086), bevel=0.006)

    deck_z = 0.107

    # 2. L자형 서울 감성 블랙 철제 난간 (후면 y=0.92 + 좌측 x=-1.28)
    rail_h = 0.98
    post_coords = [(-1.28, 0.92), (-0.42, 0.92), (0.44, 0.92), (1.28, 0.92), (-1.28, 0.0), (-1.28, -0.90)]
    for px, py in post_coords:
        add_closed_box(bm_iron, (0.055, 0.055, rail_h), (px, py, deck_z + rail_h * 0.5), bevel=0.005)
        add_closed_box(bm_iron, (0.075, 0.075, 0.025), (px, py, deck_z + rail_h + 0.012), bevel=0.004)

    # 수평 핸드레일 + 원목 바 테이블 선반
    add_closed_box(bm_iron, (2.62, 0.055, 0.045), (0.0, 0.92, deck_z + rail_h), bevel=0.006)
    add_closed_box(bm_iron, (2.60, 0.036, 0.032), (0.0, 0.92, deck_z + 0.12), bevel=0.004)
    add_closed_box(bm_wood, (2.58, 0.19, 0.034), (0.0, 0.86, deck_z + rail_h + 0.036), bevel=0.006)

    add_closed_box(bm_iron, (0.055, 1.88, 0.045), (-1.28, 0.01, deck_z + rail_h), bevel=0.006)
    add_closed_box(bm_iron, (0.036, 1.84, 0.032), (-1.28, 0.01, deck_z + 0.12), bevel=0.004)

    # 수직 발러스터 살대
    for b_i in range(18):
        bx = -1.16 + b_i * (2.32 / 17.0)
        add_closed_box(bm_iron, (0.018, 0.018, rail_h - 0.12), (bx, 0.92, deck_z + 0.12 + (rail_h - 0.12) * 0.5))
    for b_i in range(12):
        by = -0.80 + b_i * (1.60 / 11.0)
        add_closed_box(bm_iron, (0.018, 0.018, rail_h - 0.12), (-1.28, by, deck_z + 0.12 + (rail_h - 0.12) * 0.5))

    # 3. 오버헤드 아치 철제 퍼걸러 프레임 & 스트링 라이트(에디슨 전구 11개)
    for ay in (-0.72, 0.72):
        arch_pts: List[Vector] = []
        arch_pts.append(Vector((-1.24, ay, deck_z)))
        arch_pts.append(Vector((-1.24, ay, deck_z + 1.82)))
        for k in range(13):
            ang = pi * (1.0 - k / 12.0)
            arch_pts.append(Vector((1.24 * cos(ang), ay, deck_z + 1.82 + 0.56 * sin(ang))))
        arch_pts.append(Vector((1.24, ay, deck_z + 1.82)))
        arch_pts.append(Vector((1.24, ay, deck_z)))
        add_closed_swept_tube(bm_iron, arch_pts, 0.024, segments=10)

    # 두 아치 연결 횡대
    for ang_deg in (35.0, 90.0, 145.0):
        ang = radians(ang_deg)
        tx = 1.24 * cos(ang)
        tz = deck_z + 1.82 + 0.56 * sin(ang)
        add_closed_box(bm_iron, (0.03, 1.48, 0.03), (tx, 0.0, tz), bevel=0.004)

    # 대각선 2가닥 페스툰 스트링 라이트 케이블 + 11개 따뜻한 에디슨 전구
    cables = [
        (Vector((-1.18, -0.72, deck_z + 2.02)), Vector((1.18, 0.72, deck_z + 2.02)), 6),
        (Vector((-1.18, 0.72, deck_z + 2.02)), Vector((1.18, -0.72, deck_z + 2.02)), 5),
    ]
    for p_start, p_end, bulb_count in cables:
        c_pts: List[Vector] = []
        for s in range(19):
            t = s / 18.0
            sag = -0.34 * 4.0 * t * (1.0 - t)
            c_pts.append(p_start.lerp(p_end, t) + Vector((0.0, 0.0, sag)))
        add_closed_swept_tube(bm_iron, c_pts, 0.007, segments=6)

        for b_i in range(bulb_count):
            t = (b_i + 1) / (bulb_count + 1)
            sag = -0.34 * 4.0 * t * (1.0 - t)
            anchor = p_start.lerp(p_end, t) + Vector((0.0, 0.0, sag))
            # 전구 소켓 + 코드 + 티어드롭 유리 전구
            add_closed_lathe(
                bm_iron,
                [(0.011, 0.0), (0.016, -0.045), (0.018, -0.07)],
                segments=10,
                center=(anchor.x, anchor.y, anchor.z),
            )
            add_closed_lathe(
                bm_edison,
                [(0.014, -0.07), (0.032, -0.105), (0.034, -0.135), (0.022, -0.16), (0.006, -0.172)],
                segments=10,
                center=(anchor.x, anchor.y, anchor.z),
            )

    # 4. 원형 서울 감성 비스트로 테라조 카페 테이블 (중앙)
    tx, ty = 0.04, -0.08
    table_h = 0.74
    ped_profile = [
        (0.24, deck_z),
        (0.22, deck_z + 0.04),
        (0.08, deck_z + 0.09),
        (0.042, deck_z + 0.14),
        (0.038, deck_z + 0.60),
        (0.09, deck_z + 0.68),
        (0.16, deck_z + table_h - 0.03),
    ]
    add_closed_lathe(bm_iron, ped_profile, segments=16, center=(tx, ty, 0.0))
    # 3발 아치형 주물 다리
    for leg_i in range(3):
        ang = 2.0 * pi * leg_i / 3.0 + radians(30.0)
        ca, sa = cos(ang), sin(ang)
        leg_pts = [
            Vector((tx + 0.06 * ca, ty + 0.06 * sa, deck_z + 0.15)),
            Vector((tx + 0.22 * ca, ty + 0.22 * sa, deck_z + 0.10)),
            Vector((tx + 0.34 * ca, ty + 0.34 * sa, deck_z + 0.02)),
        ]
        add_closed_swept_tube(bm_iron, leg_pts, 0.018, segments=8)
    # 베벨 원형 테라조 상판 + 골드/우드 엣지 림
    add_closed_lathe(
        bm_terrazzo,
        [(0.43, deck_z + table_h - 0.032), (0.445, deck_z + table_h - 0.016), (0.435, deck_z + table_h)],
        segments=28,
        center=(tx, ty, 0.0),
    )

    # 테이블 위 라떼 컵 2잔 + 소서 + 미니 다육이 화분
    top_z = deck_z + table_h
    for cup_dx, cup_dy in ((-0.16, -0.08), (0.17, 0.06)):
        cx, cy = tx + cup_dx, ty + cup_dy
        add_closed_lathe(bm_terrazzo, [(0.055, top_z), (0.072, top_z + 0.014), (0.068, top_z + 0.018)], segments=14, center=(cx, cy, 0.0))
        add_closed_lathe(
            bm_terrazzo,
            [(0.032, top_z + 0.016), (0.044, top_z + 0.095), (0.041, top_z + 0.098)],
            segments=14,
            center=(cx, cy, 0.0),
        )
        # 컵 손잡이
        h_pts = [
            Vector((cx + 0.038, cy, top_z + 0.080)),
            Vector((cx + 0.064, cy, top_z + 0.065)),
            Vector((cx + 0.060, cy, top_z + 0.042)),
            Vector((cx + 0.034, cy, top_z + 0.036)),
        ]
        add_closed_swept_tube(bm_terrazzo, h_pts, 0.006, segments=6)

    # 중앙 미니 우드 화분 + 다육이 로제트
    add_closed_lathe(bm_wood, [(0.048, top_z), (0.062, top_z + 0.075), (0.056, top_z + 0.080)], segments=14, center=(tx, ty + 0.09, 0.0))
    for lf in range(8):
        ang = 2.0 * pi * lf / 8.0
        add_uv_sphere(
            bm_botanical,
            0.032,
            center=(tx + 0.026 * cos(ang), ty + 0.09 + 0.026 * sin(ang), top_z + 0.092),
            scale=(1.35, 0.65, 0.55),
            rot_euler=(0.35 * sin(ang), -0.35 * cos(ang), ang),
            u_seg=10,
            v_seg=6,
        )

    # 5. 벤토우드·철제 카페 아치 의자 2개 (테이블 양옆 배치)
    for chair_x, chair_y, yaw_deg in ((-0.70, -0.14, -14.0), (0.78, -0.10, 162.0)):
        yaw = radians(yaw_deg)
        rot_m = Matrix.Rotation(yaw, 3, "Z")
        origin = Vector((chair_x, chair_y, deck_z))
        seat_z = 0.45

        # 원목 좌판
        add_closed_lathe(
            bm_wood,
            [(0.20, seat_z - 0.022), (0.215, seat_z - 0.008), (0.205, seat_z + 0.008)],
            segments=20,
            center=(chair_x, chair_y, deck_z),
        )
        # 4개 테이퍼 철제 다리
        for lx, ly in ((-0.15, -0.15), (0.15, -0.15), (0.15, 0.15), (-0.15, 0.15)):
            p0 = origin + rot_m @ Vector((lx * 1.18, ly * 1.18, 0.0))
            p1 = origin + rot_m @ Vector((lx * 0.88, ly * 0.88, seat_z - 0.015))
            add_closed_swept_tube(bm_iron, [p0, p1], 0.012, segments=8)
        # 다리 링 보강재
        ring_c = [
            origin + rot_m @ Vector((0.17 * cos(2 * pi * k / 16), 0.17 * sin(2 * pi * k / 16), 0.17))
            for k in range(17)
        ]
        add_closed_swept_tube(bm_iron, ring_c, 0.008, segments=6)

        # 시그니처 아치형 등받이 후프
        hoop_pts: List[Vector] = []
        hoop_pts.append(origin + rot_m @ Vector((-0.17, -0.12, seat_z)))
        for k in range(11):
            ang = pi * (1.0 - k / 10.0)
            hoop_pts.append(
                origin
                + rot_m
                @ Vector((0.18 * cos(ang), -0.19 - 0.04 * sin(ang), seat_z + 0.16 + 0.25 * sin(ang)))
            )
        hoop_pts.append(origin + rot_m @ Vector((0.17, -0.12, seat_z)))
        add_closed_swept_tube(bm_iron, hoop_pts, 0.013, segments=8)

        # 곡면 원목 등받이 판
        back_pts = [
            origin + rot_m @ Vector((0.16 * cos(radians(150 - k * 20)), -0.21 - 0.02 * sin(radians(150 - k * 20)), seat_z + 0.30))
            for k in range(7)
        ]
        add_closed_swept_tube(bm_wood, back_pts, 0.026, segments=8, aspect_y=0.48)

    # 6. 코너 대형 루프탑 올리브/피커스 플랜터 박스 (좌측 뒤)
    add_closed_box(bm_wood, (0.44, 0.44, 0.44), (-0.96, 0.54, deck_z + 0.22), bevel=0.012)
    add_closed_box(bm_iron, (0.47, 0.47, 0.04), (-0.96, 0.54, deck_z + 0.43), bevel=0.006)
    # 줄기 + 풍성한 보태니컬 잎 덩어리
    add_closed_swept_tube(
        bm_wood,
        [
            Vector((-0.96, 0.54, deck_z + 0.40)),
            Vector((-0.94, 0.52, deck_z + 0.78)),
            Vector((-0.98, 0.55, deck_z + 1.12)),
        ],
        [0.032, 0.022, 0.014],
        segments=8,
    )
    canopy_offsets = [
        (0.0, 0.0, 1.18, 0.22),
        (-0.14, 0.08, 1.04, 0.17),
        (0.15, -0.06, 1.06, 0.18),
        (0.05, 0.14, 0.96, 0.16),
        (-0.10, -0.12, 0.94, 0.15),
    ]
    for dx, dy, dz, rad in canopy_offsets:
        add_uv_sphere(
            bm_botanical,
            rad,
            center=(-0.96 + dx, 0.54 + dy, deck_z + dz),
            scale=(1.05, 0.95, 0.88),
            u_seg=12,
            v_seg=8,
        )

    # 우측 앞 카페 원목 A형 입간판
    add_closed_box(bm_wood, (0.44, 0.035, 0.66), (0.96, 0.48, deck_z + 0.32), rot_euler=(radians(12.0), 0.0, radians(-24.0)), bevel=0.006)
    add_closed_box(bm_wood, (0.44, 0.035, 0.66), (1.03, 0.61, deck_z + 0.32), rot_euler=(radians(-12.0), 0.0, radians(-24.0)), bevel=0.006)
    add_closed_box(bm_iron, (0.36, 0.040, 0.46), (0.96, 0.47, deck_z + 0.35), rot_euler=(radians(12.0), 0.0, radians(-24.0)), bevel=0.004)

    objs = [
        build_object_from_bmesh("Cafe_Wood", bm_wood, mat_wood, use_weighted_normal=True),
        build_object_from_bmesh("Cafe_Iron", bm_iron, mat_iron, use_weighted_normal=True),
        build_object_from_bmesh("Cafe_Terrazzo", bm_terrazzo, mat_terrazzo, use_weighted_normal=True),
        build_object_from_bmesh("Cafe_Botanical", bm_botanical, mat_botanical, subsurf_levels=1),
    ]
    return consolidate_and_finalize_asset("seoul-rooftop-cafe-terrace", objs)


# ---------------------------------------------------------------------------
# 히어로 에셋 3: 무협·판타지 옥검·기단·마법진 룬 제단
# ---------------------------------------------------------------------------


def build_murim_jade_sword_altar() -> Tuple[List[bpy.types.Object], Dict[str, object]]:
    mat_stone = make_pbr_material(
        "Altar_Basalt_Stone",
        base_color=(0.30, 0.34, 0.40),
        roughness=0.74,
        cel_shadow=(0.15, 0.18, 0.28),
        cel_highlight=(0.48, 0.54, 0.62),
    )
    mat_jade = make_pbr_material(
        "Murim_Celadon_JadeArcane",
        base_color=(0.30, 0.84, 0.80),
        roughness=0.14,
        metallic=0.12,
        coat_weight=0.80,
        emission_color=(0.24, 0.88, 0.94),
        emission_strength=0.42,
        cel_shadow=(0.14, 0.48, 0.56),
        cel_highlight=(0.76, 0.99, 0.98),
    )
    mat_bronze = make_pbr_material(
        "Altar_Antique_Bronze",
        base_color=(0.72, 0.54, 0.28),
        roughness=0.34,
        metallic=0.84,
        cel_shadow=(0.40, 0.28, 0.14),
        cel_highlight=(0.95, 0.82, 0.52),
    )
    mat_silk = make_pbr_material(
        "Murim_Crimson_Silk",
        base_color=(0.68, 0.12, 0.18),
        roughness=0.58,
        cel_shadow=(0.36, 0.06, 0.12),
        cel_highlight=(0.88, 0.26, 0.30),
    )

    bm_stone = bmesh.new()
    bm_jade = bmesh.new()
    bm_bronze = bmesh.new()
    bm_rune = bm_jade  # 영기 옥석·마법진 4드로우콜 배칭
    bm_silk = bmesh.new()

    def octagon(r: float) -> List[Tuple[float, float]]:
        return [(r * cos(2.0 * pi * k / 8.0 + pi / 8.0), r * sin(2.0 * pi * k / 8.0 + pi / 8.0)) for k in range(8)]

    # 1. 3단 팔각 현무암 기단 + 전면 제단 계단
    add_closed_prism(bm_stone, octagon(1.08), 0.00, 0.15)
    add_closed_prism(bm_stone, octagon(0.86), 0.15, 0.30)
    add_closed_prism(bm_stone, octagon(0.66), 0.30, 0.42)
    # 단별 청동 테두리 띠
    add_closed_prism(bm_bronze, octagon(0.885), 0.135, 0.165)
    add_closed_prism(bm_bronze, octagon(0.685), 0.285, 0.315)
    # 전면 계단 3단 (y < 0 방향)
    add_closed_box(bm_stone, (0.58, 0.34, 0.13), (0.0, -0.96, 0.065), bevel=0.012)
    add_closed_box(bm_stone, (0.50, 0.28, 0.25), (0.0, -0.78, 0.125), bevel=0.012)
    add_closed_box(bm_stone, (0.44, 0.22, 0.36), (0.0, -0.62, 0.18), bevel=0.012)

    # 2. 대각선 4개 팔각 석등/비석 기둥 + 연꽃 주두 + 발광 영석 코어
    for k in range(4):
        ang = radians(45.0 + k * 90.0)
        px = 0.88 * cos(ang)
        py = 0.88 * sin(ang)
        pillar_prof = [
            (0.115, 0.15),
            (0.105, 0.22),
            (0.082, 0.26),
            (0.074, 0.78),
            (0.110, 0.84),
            (0.125, 0.88),
            (0.095, 0.94),
            (0.035, 1.00),
        ]
        add_closed_lathe(bm_stone, pillar_prof, segments=8, center=(px, py, 0.0))
        # 청동 칼라 링 + 영석 코어
        add_closed_lathe(bm_bronze, [(0.088, 0.72), (0.096, 0.76), (0.088, 0.80)], segments=8, center=(px, py, 0.0))
        add_faceted_crystal(bm_rune, (px, py, 1.10), 0.048, 0.16, facets=6)

    # 3. 동심원 마법진 룬 링 + 8방위 팔괘(八卦) 발광 인레이 + 부유 옥석 편
    altar_top = 0.42
    for ring_r, tube_r in ((0.56, 0.014), (0.41, 0.011), (0.27, 0.009)):
        r_pts = [
            Vector((ring_r * cos(2.0 * pi * s / 32.0), ring_r * sin(2.0 * pi * s / 32.0), altar_top + 0.012))
            for s in range(33)
        ]
        add_closed_swept_tube(bm_rune, r_pts, tube_r, segments=8)

    for k in range(8):
        ang = 2.0 * pi * k / 8.0
        ca, sa = cos(ang), sin(ang)
        # 방사형 룬 바 & 팔괘 3획
        add_closed_box(
            bm_rune,
            (0.14, 0.022, 0.016),
            center=(0.485 * ca, 0.485 * sa, altar_top + 0.010),
            rot_euler=(0.0, 0.0, ang),
            bevel=0.003,
        )
        add_closed_box(
            bm_bronze,
            (0.09, 0.065, 0.018),
            center=(0.34 * ca, 0.34 * sa, altar_top + 0.010),
            rot_euler=(0.0, 0.0, ang),
            bevel=0.003,
        )

    # 검 주위를 맴도는 4개의 부유 옥수정 파편
    for k in range(4):
        ang = radians(20.0 + k * 90.0)
        fx = 0.46 * cos(ang)
        fy = 0.46 * sin(ang)
        fz = 0.96 + (k % 2) * 0.24
        add_faceted_crystal(
            bm_jade,
            (fx, fy, fz),
            radius=0.048,
            length=0.22,
            facets=6,
            rot_euler=(radians(18.0) * sin(ang), -radians(18.0) * cos(ang), ang),
        )

    # 4. 중앙 검좌대 + 영웅 무협 청옥보검(青玉寶劍, 살짝 기울인 드라마틱 배치)
    add_closed_lathe(
        bm_stone,
        [(0.22, altar_top), (0.19, altar_top + 0.08), (0.14, altar_top + 0.16), (0.11, altar_top + 0.20)],
        segments=8,
    )
    add_closed_lathe(
        bm_bronze,
        [(0.14, altar_top + 0.18), (0.16, altar_top + 0.21), (0.12, altar_top + 0.23)],
        segments=8,
    )

    sword_pivot = Vector((0.0, 0.0, altar_top + 0.16))
    sword_tilt = Euler((radians(4.5), radians(-6.5), radians(14.0)), "XYZ").to_matrix().to_4x4()
    sword_xf = Matrix.Translation(sword_pivot) @ sword_tilt

    def xform_sword(verts: List[bmesh.types.BMVert]) -> None:
        for v in verts:
            v.co = sword_xf @ v.co

    # 다이아몬드 단면 청옥 검신 (z=0.0 -> z=0.92, 칼날 끝이 좌대에 꽂힌 영웅 구도: 칼끝 아래, 손잡이 위!)
    # (판타지·무협 제단에 꽂힌 명검 구도: 검끝이 제단 중앙에 꽂히고 손잡이와 코등이가 위로 솟아오름!)
    blade_rings: List[List[bmesh.types.BMVert]] = []
    blade_verts: List[bmesh.types.BMVert] = []
    blade_sections = [
        (0.00, 0.014, 0.007),
        (0.14, 0.034, 0.013),
        (0.42, 0.042, 0.016),
        (0.72, 0.048, 0.018),
        (0.92, 0.052, 0.020),
    ]
    for bz, bw, bt in blade_sections:
        ring = [
            bm_jade.verts.new((bw, 0.0, bz)),
            bm_jade.verts.new((0.0, bt, bz)),
            bm_jade.verts.new((-bw, 0.0, bz)),
            bm_jade.verts.new((0.0, -bt, bz)),
        ]
        blade_rings.append(ring)
        blade_verts.extend(ring)
    for k in range(len(blade_rings) - 1):
        r0, r1 = blade_rings[k], blade_rings[k + 1]
        for i in range(4):
            j = (i + 1) % 4
            bm_jade.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm_jade.faces.new(list(reversed(blade_rings[0])))
    bm_jade.faces.new(list(blade_rings[-1]))
    xform_sword(blade_verts)

    # 검신 중앙 발광 영맥(혈조 라인)
    vein_v = add_closed_box(bm_rune, (0.012, 0.038, 0.68), (0.0, 0.0, 0.50), bevel=0.003)
    xform_sword(vein_v)

    # 청동 날개형 코등이(호수) + 중앙 옥 보석
    guard_core = add_closed_box(bm_bronze, (0.14, 0.064, 0.055), (0.0, 0.0, 0.94), bevel=0.010)
    xform_sword(guard_core)
    for side in (-1.0, 1.0):
        wing_pts = [
            Vector((side * 0.05, 0.0, 0.94)),
            Vector((side * 0.14, 0.0, 0.91)),
            Vector((side * 0.22, 0.0, 0.97)),
            Vector((side * 0.19, 0.0, 1.02)),
        ]
        wv = add_closed_swept_tube(bm_bronze, wing_pts, [0.024, 0.020, 0.016, 0.009], segments=8)
        xform_sword(wv)
    gem_v = add_faceted_crystal(bm_rune, (0.0, -0.036, 0.94), 0.022, 0.048, facets=6, rot_euler=(pi * 0.5, 0.0, 0.0))
    xform_sword(gem_v)
    gem_v2 = add_faceted_crystal(bm_rune, (0.0, 0.036, 0.94), 0.022, 0.048, facets=6, rot_euler=(pi * 0.5, 0.0, 0.0))
    xform_sword(gem_v2)

    # 진홍 비단 감긴 검병(손잡이) + 청동 연꽃 검두(포멜)
    grip_v = add_closed_lathe(
        bm_silk,
        [(0.024, 0.965), (0.021, 1.06), (0.022, 1.15), (0.025, 1.24)],
        segments=14,
        scale_xy=(1.15, 0.85),
    )
    xform_sword(grip_v)
    for ring_z in (0.98, 1.05, 1.12, 1.19):
        rv = add_closed_lathe(bm_bronze, [(0.026, ring_z - 0.006), (0.028, ring_z), (0.026, ring_z + 0.006)], segments=12, scale_xy=(1.15, 0.85))
        xform_sword(rv)

    pommel_v = add_closed_lathe(
        bm_bronze,
        [(0.026, 1.24), (0.046, 1.275), (0.042, 1.315), (0.022, 1.345), (0.008, 1.365)],
        segments=14,
    )
    xform_sword(pommel_v)

    # 바람에 나부끼는 붉은 비단 검수(술 장식)
    tassel_pts = [
        sword_xf @ Vector((0.0, 0.0, 1.33)),
        sword_xf @ Vector((0.09, -0.04, 1.27)),
        sword_xf @ Vector((0.18, -0.07, 1.14)),
        sword_xf @ Vector((0.25, -0.05, 0.96)),
    ]
    add_closed_swept_tube(bm_silk, tassel_pts, [0.009, 0.011, 0.013, 0.024], segments=8)
    add_closed_lathe(bm_bronze, [(0.016, -0.016), (0.020, 0.0), (0.014, 0.016)], segments=10, center=tuple(tassel_pts[-2]))

    objs = [
        build_object_from_bmesh("Altar_Stone", bm_stone, mat_stone, use_weighted_normal=True),
        build_object_from_bmesh("Altar_Jade", bm_jade, mat_jade, use_weighted_normal=True),
        build_object_from_bmesh("Altar_Bronze", bm_bronze, mat_bronze, use_weighted_normal=True),
        build_object_from_bmesh("Altar_Silk", bm_silk, mat_silk, subsurf_levels=1),
    ]
    return consolidate_and_finalize_asset("murim-jade-sword-altar", objs)


# ---------------------------------------------------------------------------
# 히어로 에셋 4: 한국 웹툰 미형 비율 캐릭터 흉상·볼륨 헤어·칼라 마네킹 베이스
# ---------------------------------------------------------------------------


def build_kwebtoon_bust_mannequin_atelier() -> Tuple[List[bpy.types.Object], Dict[str, object]]:
    mat_skin = make_pbr_material(
        "Webtoon_Porcelain_Skin",
        base_color=(0.98, 0.86, 0.80),
        roughness=0.52,
        cel_shadow=(0.86, 0.62, 0.60),
        cel_highlight=(1.0, 0.94, 0.90),
    )
    mat_hair = make_pbr_material(
        "Webtoon_SilverLavender_Hair",
        base_color=(0.76, 0.74, 0.88),
        roughness=0.36,
        coat_weight=0.30,
        cel_shadow=(0.46, 0.42, 0.64),
        cel_highlight=(0.96, 0.94, 1.0),
    )
    mat_blazer = make_pbr_material(
        "Atelier_Blazer_Navy",
        base_color=(0.17, 0.21, 0.34),
        roughness=0.62,
        cel_shadow=(0.08, 0.11, 0.22),
        cel_highlight=(0.30, 0.36, 0.54),
    )
    mat_gold = make_pbr_material(
        "Atelier_Champagne_IvoryGold",
        base_color=(0.93, 0.85, 0.66),
        roughness=0.30,
        metallic=0.38,
        cel_shadow=(0.66, 0.54, 0.44),
        cel_highlight=(1.0, 0.97, 0.84),
    )

    bm_skin = bmesh.new()
    bm_hair = bmesh.new()
    bm_blazer = bmesh.new()
    bm_gold = bmesh.new()
    bm_ivory = bm_gold  # 샴페인 아이보리·골드 칼라·브로치·스탠드 4드로우콜 배칭

    # 1. 아틀리에 턴드 원목·브라스 마네킹 스탠드 (z=0.0..0.24m)
    stand_prof = [
        (0.155, 0.00),
        (0.150, 0.025),
        (0.125, 0.042),
        (0.085, 0.065),
        (0.042, 0.095),
        (0.032, 0.165),
        (0.048, 0.205),
        (0.038, 0.245),
    ]
    add_closed_lathe(bm_ivory, stand_prof, segments=24)
    add_closed_lathe(bm_gold, [(0.056, 0.082), (0.062, 0.096), (0.052, 0.110)], segments=20)
    add_closed_lathe(bm_gold, [(0.050, 0.195), (0.056, 0.210), (0.048, 0.224)], segments=20)

    # 2. Quad-Dominant 한국 웹툰 흉상(어깨·가슴·가느다란 목·미형 V라인 두상) — SUBSURF 적용!
    # 2a. 테일러드 흉상 바디(블레이저 외곽 실루엣)
    torso_rings: List[List[bmesh.types.BMVert]] = []
    torso_levels = [
        # (z, rx, ry_front, ry_back)
        (0.23, 0.125, 0.090, 0.088),
        (0.28, 0.155, 0.108, 0.100),
        (0.35, 0.188, 0.124, 0.106),
        (0.42, 0.228, 0.118, 0.104),
        (0.465, 0.210, 0.102, 0.096),
        (0.495, 0.132, 0.082, 0.082),
        (0.515, 0.072, 0.064, 0.064),
    ]
    segs = 20
    for tz, rx, ry_f, ry_b in torso_levels:
        ring: List[bmesh.types.BMVert] = []
        for s in range(segs):
            ang = 2.0 * pi * s / segs
            ca, sa = cos(ang), sin(ang)
            ry = ry_f if sa < 0.0 else ry_b
            # 어깨선 미세 둥글림
            shoulder_dip = -0.015 * (ca * ca) if tz > 0.43 else 0.0
            ring.append(bm_blazer.verts.new((rx * ca, ry * sa, tz + shoulder_dip)))
        torso_rings.append(ring)
    for k in range(len(torso_rings) - 1):
        r0, r1 = torso_rings[k], torso_rings[k + 1]
        for i in range(segs):
            j = (i + 1) % segs
            bm_blazer.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm_blazer.faces.new(list(reversed(torso_rings[0])))
    bm_blazer.faces.new(list(torso_rings[-1]))

    # 블레이저 양쪽 접힌 라펠(깃) + 우아한 리본 브로치
    for side in (-1.0, 1.0):
        lapel_pts = [
            Vector((side * 0.068, -0.056, 0.515)),
            Vector((side * 0.096, -0.098, 0.460)),
            Vector((side * 0.074, -0.122, 0.392)),
            Vector((side * 0.018, -0.124, 0.335)),
        ]
        add_closed_swept_tube(bm_blazer, lapel_pts, [0.016, 0.024, 0.022, 0.015], segments=8, aspect_y=0.45)

    # 하이칼라 아이보리 셔츠 깃 (목 하단 감쌈)
    collar_prof = [
        (0.068, 0.485),
        (0.076, 0.518),
        (0.074, 0.556),
        (0.060, 0.560),
    ]
    add_closed_lathe(bm_ivory, collar_prof, segments=20, scale_xy=(1.04, 0.96))
    # 전면 V존 셔츠 인서트
    add_uv_sphere(bm_ivory, 0.072, center=(0.0, -0.088, 0.42), scale=(0.90, 0.55, 1.25), u_seg=12, v_seg=8)
    # 샴페인 골드 제국 리본 브로치 (깔끔한 윙 보우 + 중앙 크리스탈 카보숑)
    add_faceted_crystal(bm_gold, (0.0, -0.118, 0.462), 0.024, 0.048, facets=8, rot_euler=(pi * 0.5, 0.0, 0.0))
    for side in (-1.0, 1.0):
        # 좌우 리본 날개
        add_closed_box(
            bm_gold,
            (0.052, 0.016, 0.028),
            center=(side * 0.036, -0.116, 0.464),
            rot_euler=(0.0, side * radians(-10.0), side * radians(14.0)),
            bevel=0.005,
        )
        # 아래로 떨어지는 리본 꼬리
        add_closed_box(
            bm_gold,
            (0.018, 0.012, 0.056),
            center=(side * 0.020, -0.120, 0.422),
            rot_euler=(radians(-8.0), side * radians(14.0), 0.0),
            bevel=0.003,
        )

    # 2b. 가느다란 목 & 한국 웹툰 V라인 미형 두상 (단일 통합 Quad 스컬프팅 케이지 -> SUBSURF 2!)
    # 코·턱선·광대·입술 윤곽을 별도 분리 구가 아닌 단일 연속 두상 메쉬 버텍스로 일체 조각해
    # Freestyle 외곽선에 스티커 같은 이질적 원형 선이 생기지 않는 클래식 아틀리에 조형을 구현한다.
    neck_prof = [
        (0.062, 0.495),
        (0.050, 0.538),
        (0.046, 0.588),
        (0.050, 0.628),
    ]
    add_closed_lathe(bm_skin, neck_prof, segments=20, center=(0.0, 0.008, 0.0), scale_xy=(0.98, 1.02))

    head_rings: List[List[bmesh.types.BMVert]] = []
    head_sections = [
        # (z, rx, y_front, y_back, chin_v, nose_ridge, lip_ridge)
        (0.598, 0.018, -0.078, 0.002, 0.34, 0.000, 0.000),   # 섬세한 V라인 턱 끝
        (0.618, 0.046, -0.091, 0.030, 0.24, 0.000, 0.002),   # 하악선
        (0.636, 0.064, -0.099, 0.056, 0.16, 0.000, 0.007),   # 아랫입술 은은한 입체
        (0.650, 0.074, -0.102, 0.072, 0.10, 0.001, 0.008),   # 윗입술·인중
        (0.672, 0.084, -0.104, 0.090, 0.05, 0.013, 0.000),   # 코끝(일체 조각 돌출)
        (0.696, 0.090, -0.105, 0.104, 0.02, 0.010, 0.000),   # 콧대·광대
        (0.724, 0.092, -0.104, 0.112, 0.00, 0.005, 0.000),   # 미간·눈썹뼈
        (0.758, 0.088, -0.096, 0.114, 0.00, 0.001, 0.000),   # 이마
        (0.794, 0.070, -0.070, 0.098, 0.00, 0.000, 0.000),   # 두정 전후
        (0.822, 0.034, -0.030, 0.056, 0.00, 0.000, 0.000),   # 정수리
    ]
    h_segs = 28
    for hz, rx, yf, yb, v_sharp, nose_r, lip_r in head_sections:
        ring: List[bmesh.types.BMVert] = []
        yc = 0.5 * (yf + yb)
        ry = 0.5 * (yb - yf)
        for s in range(h_segs):
            ang = 2.0 * pi * s / h_segs
            ca, sa = cos(ang), sin(ang)
            front_fac = max(0.0, -sa)
            # 정면 중심선(ca ~= 0, sa < 0) 기준 섬세한 콧날·입술 일체 스컬프팅
            center_focus = math.exp(-((ca / 0.16) ** 2)) * (front_fac ** 2)
            mouth_focus = math.exp(-((ca / 0.28) ** 2)) * (front_fac ** 2)
            vx = rx * ca * (1.0 - v_sharp * 0.24 * (1.0 - front_fac))
            vy = yc + ry * sa - v_sharp * 0.010 * (front_fac ** 2) - nose_r * center_focus - lip_r * mouth_focus
            # 눈窩(안와) 아주 부드러운 음각
            if 0.692 < hz < 0.722 and 0.22 < abs(ca) < 0.62 and sa < -0.58:
                vy += 0.0035
            ring.append(bm_skin.verts.new((vx, vy, hz)))
        head_rings.append(ring)

    for k in range(len(head_rings) - 1):
        r0, r1 = head_rings[k], head_rings[k + 1]
        for i in range(h_segs):
            j = (i + 1) % h_segs
            bm_skin.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm_skin.faces.new(list(reversed(head_rings[0])))
    bm_skin.faces.new(list(head_rings[-1]))

    # 3. 한국 웹툰 볼륨 레이어드 헤어 (풍성한 크라운 + 자연스러운 6:4 커튼 뱅 + 웨이브 사이드/백 락)
    # 3a. 풍성한 헤어 크라운 볼륨
    add_uv_sphere(
        bm_hair,
        0.114,
        center=(0.0, 0.022, 0.750),
        scale=(1.04, 1.12, 1.00),
        u_seg=20,
        v_seg=14,
    )

    # 3b. 6:4 가르마 커튼 뱅(이마 위에서 양옆으로 유려하게 흐르는 웨이브 리본)
    bang_strands = [
        ([Vector((-0.018, -0.056, 0.842)), Vector((-0.056, -0.104, 0.794)), Vector((-0.094, -0.098, 0.728)), Vector((-0.106, -0.072, 0.654))], [0.026, 0.030, 0.024, 0.009]),
        ([Vector((-0.008, -0.068, 0.842)), Vector((-0.032, -0.112, 0.792)), Vector((-0.054, -0.112, 0.742)), Vector((-0.066, -0.102, 0.706))], [0.022, 0.024, 0.018, 0.007]),
        ([Vector((0.012, -0.066, 0.842)), Vector((0.044, -0.110, 0.792)), Vector((0.072, -0.106, 0.736)), Vector((0.088, -0.092, 0.684))], [0.024, 0.026, 0.020, 0.008]),
        ([Vector((0.028, -0.052, 0.836)), Vector((0.078, -0.094, 0.782)), Vector((0.106, -0.078, 0.708)), Vector((0.112, -0.052, 0.630))], [0.026, 0.030, 0.024, 0.010]),
        ([Vector((0.002, -0.074, 0.838)), Vector((0.006, -0.114, 0.788)), Vector((0.018, -0.112, 0.744))], [0.017, 0.016, 0.007]),
    ]
    for pts, rads in bang_strands:
        add_closed_swept_tube(bm_hair, pts, rads, segments=10, aspect_y=0.52)

    # 3c. V라인 뺨을 타고 흐르는 우아한 S-웨이브 롱 사이드 락
    for side in (-1.0, 1.0):
        face_lock = [
            Vector((side * 0.076, -0.016, 0.810)),
            Vector((side * 0.114, -0.036, 0.728)),
            Vector((side * 0.106, -0.052, 0.635)),
            Vector((side * 0.122, -0.072, 0.545)),
            Vector((side * 0.142, -0.082, 0.452)),
        ]
        add_closed_swept_tube(bm_hair, face_lock, [0.032, 0.036, 0.030, 0.026, 0.011], segments=10, aspect_y=0.62)

        outer_lock = [
            Vector((side * 0.086, 0.036, 0.800)),
            Vector((side * 0.136, 0.034, 0.704)),
            Vector((side * 0.148, 0.014, 0.600)),
            Vector((side * 0.174, -0.014, 0.500)),
            Vector((side * 0.194, -0.024, 0.415)),
        ]
        add_closed_swept_tube(bm_hair, outer_lock, [0.038, 0.044, 0.042, 0.034, 0.015], segments=10, aspect_y=0.72)

    # 3d. 풍성한 뒷머리 레이어드 웨이브(5가닥)
    for b_idx in range(-2, 3):
        bx = b_idx * 0.052
        back_wave = [
            Vector((bx * 0.75, 0.068, 0.790)),
            Vector((bx * 1.15, 0.134, 0.700)),
            Vector((bx * 1.35, 0.140, 0.590)),
            Vector((bx * 1.48, 0.124, 0.484)),
            Vector((bx * 1.52, 0.108, 0.392)),
        ]
        add_closed_swept_tube(bm_hair, back_wave, [0.042, 0.048, 0.046, 0.038, 0.016], segments=10, aspect_y=0.74)

    objs = [
        build_object_from_bmesh("Bust_Skin", bm_skin, mat_skin, subsurf_levels=2),
        build_object_from_bmesh("Bust_Hair", bm_hair, mat_hair, subsurf_levels=1),
        build_object_from_bmesh("Bust_Blazer", bm_blazer, mat_blazer, subsurf_levels=1),
        build_object_from_bmesh("Bust_IvoryGold", bm_gold, mat_gold, use_weighted_normal=True),
    ]
    return consolidate_and_finalize_asset("kwebtoon-bust-mannequin-atelier", objs)


# ---------------------------------------------------------------------------
# GLB 내보내기 + EEVEE/Freestyle 512x512 웹툰 셀 셰이딩 프리뷰 렌더
# ---------------------------------------------------------------------------


def export_clean_glb(objects: List[bpy.types.Object], out_path: Path) -> int:
    """PBR 머티리얼과 수밀 지오메트리를 그대로 glTF Binary(.glb)로 내보낸다."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    byte_size = out_path.stat().st_size
    assert byte_size <= MAX_GLB_BYTES, f"{out_path.name}: {byte_size} bytes > {MAX_GLB_BYTES}"
    return byte_size


def render_webtoon_cel_preview(
    objects: List[bpy.types.Object],
    png_path: Path,
    backdrop_rgb: Tuple[float, float, float],
    rim_rgb: Tuple[float, float, float],
    ink_rgb: Tuple[float, float, float],
    cam_azimuth_deg: float = -34.0,
    cam_elev_deg: float = 16.0,
    cam_dist_scale: float = 2.05,
) -> None:
    """BLENDER_EEVEE + Freestyle 웹툰 셀 셰이딩 512x512 프리뷰를 렌더링한다."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(png_path)
    scene.render.film_transparent = False

    # 표준 sRGB(웹툰 원색 유지)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0

    # 모든 에셋 머티리얼을 3단 셀 셰이더로 변환(GLB는 이미 저장 완료!)
    for obj in objects:
        for mat in obj.data.materials:
            if mat is not None:
                apply_webtoon_cel_shader_for_preview(mat, rim_color=rim_rgb)

    # 장르별 파스텔 배경 월드 설정
    world = bpy.data.worlds.new("KWebtoonPreviewWorld")
    scene.world = world
    world.use_nodes = True
    wnt = world.node_tree
    bg = wnt.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (*backdrop_rgb, 1.0)
        bg.inputs["Strength"].default_value = 0.92

    # 전체 바운딩 박스 계산
    b_min = Vector((1e9, 1e9, 1e9))
    b_max = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            wc = obj.matrix_world @ Vector(corner)
            b_min.x = min(b_min.x, wc.x)
            b_min.y = min(b_min.y, wc.y)
            b_min.z = min(b_min.z, wc.z)
            b_max.x = max(b_max.x, wc.x)
            b_max.y = max(b_max.y, wc.y)
            b_max.z = max(b_max.z, wc.z)

    center = (b_min + b_max) * 0.5
    extent = b_max - b_min
    radius = max(0.25, extent.length * 0.5)

    # 은은한 스튜디오 바닥 원반(Freestyle 제외용 별도 컬렉션이 아닌 옅은 파스텔 그림자 받침)
    bm_floor = bmesh.new()
    add_closed_lathe(
        bm_floor,
        [(radius * 1.45, -0.025), (radius * 1.45, -0.002)],
        segments=32,
        center=(center.x, center.y, 0.0),
    )
    floor_mat = bpy.data.materials.new("Preview_Floor_Shadow")
    floor_mat.use_nodes = True
    fnt = floor_mat.node_tree
    fnt.nodes.clear()
    fem = fnt.nodes.new("ShaderNodeEmission")
    fem.inputs["Color"].default_value = (
        max(0.0, backdrop_rgb[0] * 0.88),
        max(0.0, backdrop_rgb[1] * 0.86),
        max(0.0, backdrop_rgb[2] * 0.92),
        1.0,
    )
    fem.inputs["Strength"].default_value = 1.0
    fout = fnt.nodes.new("ShaderNodeOutputMaterial")
    fnt.links.new(fem.outputs["Emission"], fout.inputs["Surface"])
    floor_obj = build_object_from_bmesh("Preview_Floor", bm_floor, floor_mat)

    # 3점 웹툰 셀 조명(사선 주광으로 3단 셀 명암 경계를 뚜렷하게 표현)
    key_data = bpy.data.lights.new("KeySun", type="SUN")
    key_data.energy = 2.6
    key_data.color = (1.0, 0.96, 0.90)
    key_obj = bpy.data.objects.new("KeySun", key_data)
    scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = (radians(52.0), radians(16.0), radians(-56.0))

    fill_data = bpy.data.lights.new("FillSun", type="SUN")
    fill_data.energy = 0.42
    fill_data.color = (0.82, 0.88, 1.0)
    fill_obj = bpy.data.objects.new("FillSun", fill_data)
    scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (radians(55.0), radians(-20.0), radians(132.0))

    # 카메라 자동 프레이밍 (50mm 히어로 화각)
    cam_data = bpy.data.cameras.new("HeroCam")
    cam_data.lens = 50.0
    cam_data.clip_start = 0.02
    cam_data.clip_end = 100.0
    cam_obj = bpy.data.objects.new("HeroCam", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    az = radians(cam_azimuth_deg)
    el = radians(cam_elev_deg)
    dist = radius * cam_dist_scale
    cam_pos = Vector((
        center.x + dist * cos(el) * sin(az),
        center.y - dist * cos(el) * cos(az),
        center.z + dist * sin(el) + extent.z * 0.02,
    ))
    cam_obj.location = cam_pos
    cam_obj.rotation_euler = (center - cam_pos).to_track_quat("-Z", "Y").to_euler()

    # Freestyle 한국 웹툰 잉크 외곽선 (실루엣 1.7px + 주름/크리스 0.85px)
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = "ABSOLUTE"
    scene.render.line_thickness = 1.65

    vl = bpy.context.view_layer
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = radians(138.0)

    # 에셋 전용 컬렉션으로 바닥 원반은 Freestyle 선화에서 제외
    hero_col = bpy.data.collections.new("HeroInkGroup")
    scene.collection.children.link(hero_col)
    for obj in objects:
        hero_col.objects.link(obj)
    # floor_obj는 HeroInkGroup에 넣지 않음
    _ = floor_obj

    for ls in list(fs.linesets):
        fs.linesets.remove(ls)

    ls_sil = fs.linesets.new("Webtoon_Silhouette")
    ls_sil.select_silhouette = True
    ls_sil.select_border = True
    ls_sil.select_contour = True
    ls_sil.select_crease = False
    ls_sil.select_by_collection = True
    ls_sil.collection = hero_col
    ls_sil.collection_negation = "INCLUSIVE"
    ls_sil.linestyle.color = ink_rgb
    ls_sil.linestyle.thickness = 1.75

    ls_crease = fs.linesets.new("Webtoon_Crease")
    ls_crease.select_silhouette = False
    ls_crease.select_border = False
    ls_crease.select_contour = False
    ls_crease.select_crease = True
    ls_crease.select_material_boundary = True
    ls_crease.select_by_collection = True
    ls_crease.collection = hero_col
    ls_crease.collection_negation = "INCLUSIVE"
    ls_crease.linestyle.color = (
        min(1.0, ink_rgb[0] + 0.08),
        min(1.0, ink_rgb[1] + 0.07),
        min(1.0, ink_rgb[2] + 0.10),
    )
    ls_crease.linestyle.thickness = 0.85

    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------------------
# 메인 오케스트레이션
# ---------------------------------------------------------------------------


HERO_SPECS: List[Dict[str, object]] = [
    {
        "slug": "rofan-imperial-arch-chandelier",
        "titleKo": "로판 제국 대저택 아치·크리스탈 샹들리에",
        "genre": "rofan-pastel",
        "builder": build_rofan_imperial_arch_chandelier,
        "backdrop": (0.94, 0.90, 0.96),
        "rim": (1.0, 0.92, 0.78),
        "ink": (0.18, 0.12, 0.22),
        "azimuth": -24.0,
        "elev": 11.0,
        "dist": 2.46,
    },
    {
        "slug": "seoul-rooftop-cafe-terrace",
        "titleKo": "서울 감성 루프탑 카페 아치 테이블·스트링 라이트",
        "genre": "daily-warm-sun",
        "builder": build_seoul_rooftop_cafe_terrace,
        "backdrop": (0.96, 0.89, 0.83),
        "rim": (1.0, 0.88, 0.66),
        "ink": (0.17, 0.13, 0.15),
        "azimuth": -36.0,
        "elev": 20.0,
        "dist": 2.38,
    },
    {
        "slug": "murim-jade-sword-altar",
        "titleKo": "무협·판타지 청옥보검·마법진 룬 제단",
        "genre": "hunter-neon",
        "builder": build_murim_jade_sword_altar,
        "backdrop": (0.12, 0.16, 0.24),
        "rim": (0.36, 0.92, 1.0),
        "ink": (0.06, 0.09, 0.16),
        "azimuth": -32.0,
        "elev": 22.0,
        "dist": 2.32,
    },
    {
        "slug": "kwebtoon-bust-mannequin-atelier",
        "titleKo": "한국 웹툰 미형 캐릭터 흉상·볼륨 헤어 마네킹",
        "genre": "rofan-pastel",
        "builder": build_kwebtoon_bust_mannequin_atelier,
        "backdrop": (0.95, 0.93, 0.96),
        "rim": (1.0, 0.94, 0.86),
        "ink": (0.19, 0.14, 0.24),
        "azimuth": -22.0,
        "elev": 9.0,
        "dist": 2.52,
    },
]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_assets: List[Dict[str, object]] = []

    for spec in HERO_SPECS:
        slug = str(spec["slug"])
        clear_scene()
        builder: Callable[[], Tuple[List[bpy.types.Object], Dict[str, object]]] = spec["builder"]  # type: ignore[assignment]
        objects, stats = builder()

        glb_path = OUT_DIR / f"{slug}.glb"
        png_path = OUT_DIR / f"{slug}.png"

        glb_bytes = export_clean_glb(objects, glb_path)
        render_webtoon_cel_preview(
            objects=objects,
            png_path=png_path,
            backdrop_rgb=spec["backdrop"],  # type: ignore[arg-type]
            rim_rgb=spec["rim"],  # type: ignore[arg-type]
            ink_rgb=spec["ink"],  # type: ignore[arg-type]
            cam_azimuth_deg=float(spec["azimuth"]),
            cam_elev_deg=float(spec["elev"]),
            cam_dist_scale=float(spec["dist"]),
        )
        png_bytes = png_path.stat().st_size

        entry = {
            **stats,
            "titleKo": spec["titleKo"],
            "genrePreset": spec["genre"],
            "glbPath": f"/models/kwebtoon-hero/{slug}.glb",
            "previewPath": f"/models/kwebtoon-hero/{slug}.png",
            "glbBytes": glb_bytes,
            "previewBytes": png_bytes,
            "blenderVersion": bpy.app.version_string,
        }
        manifest_assets.append(entry)
        print(
            f"[OK] {slug}: tris={stats['triangles']}, drawCalls={stats['drawCalls']}, "
            f"glb={glb_bytes / 1024:.1f} KB, png={png_bytes / 1024:.1f} KB, "
            f"watertight=(nm={stats['nonManifoldEdges']}, wire={stats['wireEdges']}, loose={stats['looseVertices']}, za={stats['zeroAreaFaces']})"
        )

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "generator": "scripts/blender/generate_kwebtoon_hero_assets.py",
                "blenderVersion": bpy.app.version_string,
                "assets": manifest_assets,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"[DONE] Wrote manifest: {manifest_path}")


if __name__ == "__main__":
    main()
