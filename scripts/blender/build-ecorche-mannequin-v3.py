#!/usr/bin/env python3
"""
ToonStudio 3D 데생 인형 v4 — Blender 5.2 에코르셰(Écorché) 스키닝 마스터 생성기 (Skinned v4.0).

클립스튜디오 기본 3D 데생 인형의 원통형 실루엣과 정적 리깅 한계를 해결하기 위해:
1. 연속 베벨 캡 다면 로프팅(Pinch-Free Multi-Section Organic Loft)
2. 판상형 에코르셰 근육 면(대흉근·삼각근·이두근/삼두근·완요골근·복직근·외복사근·견갑골·광배근·목빗근·
   대둔근·대퇴직근·내측광근 VMO·비복근·비대칭 내/외과 복숭아뼈) 및 루미스 면 분할 두상
3. 51본 휴머노이드 아머처 + 실제 본 세그먼트 거리 기반 연속 버텍스 웨이트 스키닝(`ARMATURE` 모디파이어 + glTF `skins`)
을 결합한 마스터 에셋을 생성하고 GLB(`apps/web/public/models/mannequin/toonstudio_ecorche_mannequin_v3.glb`)로 내보낸다.

안전 격리: 다른 활성 세션 씬을 절대 건드리지 않도록 전용 씬(`ToonStudio_Ecorche_Scene`) 내부에서만 동작한다.
라이선스: ToonStudio 자체 제작 원본 절차적 에셋 (CC0 / First-Party Original).
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable, Sequence

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

SCENE_NAME = "ToonStudio_Ecorche_Scene"


def prepare_isolated_scene() -> bpy.types.Scene:
    if bpy.context.active_object and bpy.context.active_object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    existing = bpy.data.scenes.get(SCENE_NAME)
    if existing is not None:
        for obj in list(existing.objects):
            if obj.users <= 1:
                bpy.data.objects.remove(obj, do_unlink=True)
            else:
                existing.collection.objects.unlink(obj)
        for col in list(existing.collection.children):
            for obj in list(col.objects):
                if obj.users <= 1:
                    bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.collections.remove(col)
        scene = existing
    else:
        scene = bpy.data.scenes.new(SCENE_NAME)
    bpy.context.window.scene = scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def make_pbr_material(
    name: str,
    hex_color: str,
    roughness: float = 0.46,
    metallic: float = 0.0,
    coat: float = 0.1,
    emission_hex: str | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    h = hex_color.lstrip("#")
    rgb = tuple((int(h[i : i + 2], 16) / 255.0) ** 2.2 for i in (0, 2, 4))
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = coat
        if emission_hex and "Emission Color" in bsdf.inputs:
            eh = emission_hex.lstrip("#")
            ergb = tuple((int(eh[i : i + 2], 16) / 255.0) ** 2.2 for i in (0, 2, 4))
            bsdf.inputs["Emission Color"].default_value = (*ergb, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def bake_world_and_subsurf(
    obj: bpy.types.Object,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    subsurf_levels: int = 1,
) -> bpy.types.Object:
    """월드 변환을 메쉬 정점에 굽고 부드러운 쿼드 세분화를 적용해 아머처 스키닝 준비를 마친다."""
    collection.objects.link(obj)
    obj.data.materials.append(material)
    if subsurf_levels > 0:
        mod = obj.modifiers.new(name="Subsurf", type="SUBSURF")
        mod.levels = subsurf_levels
        mod.render_levels = subsurf_levels
        depsgraph = bpy.context.evaluated_depsgraph_get()
        eval_obj = obj.evaluated_get(depsgraph)
        baked_mesh = bpy.data.meshes.new_from_object(eval_obj)
        old_mesh = obj.data
        obj.modifiers.remove(mod)
        obj.data = baked_mesh
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)
    mat_world = obj.matrix_world.copy()
    if mat_world != Matrix.Identity(4):
        obj.data.transform(mat_world)
        obj.matrix_world = Matrix.Identity(4)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def create_lofted_tube(
    name: str,
    sections: Sequence[tuple[Vector, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    ring_verts: int = 24,
    subsurf_levels: int = 1,
    power: float = 0.90,
) -> bpy.types.Object:
    """방사형 주름(Pinching) 없는 다단 베벨 캡 쿼드 로프트 메시를 생성한다."""
    s0_c, s0_rx, s0_ry, s0_tw = sections[0]
    s1_c = sections[1][0]
    sn_c, sn_rx, sn_ry, sn_tw = sections[-1]
    sp_c = sections[-2][0]
    d_start = (s0_c - s1_c).normalized()
    d_end = (sn_c - sp_c).normalized()
    cap_in = min(s0_rx, s0_ry) * 0.20
    cap_out = min(sn_rx, sn_ry) * 0.20

    padded: list[tuple[Vector, float, float, float]] = [
        (s0_c + d_start * cap_in, s0_rx * 0.24, s0_ry * 0.24, s0_tw),
        (s0_c + d_start * (cap_in * 0.44), s0_rx * 0.72, s0_ry * 0.72, s0_tw),
        *sections,
        (sn_c + d_end * (cap_out * 0.44), sn_rx * 0.72, sn_ry * 0.72, sn_tw),
        (sn_c + d_end * cap_out, sn_rx * 0.24, sn_ry * 0.24, sn_tw),
    ]

    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings: list[list[bmesh.types.BMVert]] = []
    n = len(padded)
    for idx, (center, rx, ry, twist) in enumerate(padded):
        p0 = padded[max(0, idx - 1)][0]
        p1 = padded[min(n - 1, idx + 1)][0]
        tangent = (p1 - p0).normalized() if (p1 - p0).length > 1e-6 else Vector((0.0, 0.0, 1.0))
        up_ref = Vector((0.0, -1.0, 0.0)) if abs(tangent.y) < 0.92 else Vector((1.0, 0.0, 0.0))
        ax = up_ref.cross(tangent).normalized()
        ay = tangent.cross(ax).normalized()
        ct, st = math.cos(twist), math.sin(twist)
        bx, by = ax * ct + ay * st, -ax * st + ay * ct
        ring: list[bmesh.types.BMVert] = []
        for k in range(ring_verts):
            th = (2.0 * math.pi * k) / ring_verts
            c, s = math.cos(th), math.sin(th)
            sc, ss = math.copysign(abs(c) ** power, c), math.copysign(abs(s) ** power, s)
            ring.append(bm.verts.new(center + bx * (rx * sc) + by * (ry * ss)))
        rings.append(ring)
    for r in range(len(rings) - 1):
        for k in range(ring_verts):
            kn = (k + 1) % ring_verts
            bm.faces.new((rings[r][k], rings[r][kn], rings[r + 1][kn], rings[r + 1][k]))
    c_start = bm.verts.new(padded[0][0])
    c_end = bm.verts.new(padded[-1][0])
    for k in range(ring_verts):
        kn = (k + 1) % ring_verts
        bm.faces.new((rings[0][kn], rings[0][k], c_start))
        bm.faces.new((rings[-1][k], rings[-1][kn], c_end))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    return bake_world_and_subsurf(bpy.data.objects.new(name, mesh), collection, material, subsurf_levels)


def create_sculpted_ellipsoid(
    name: str,
    location: Iterable[float],
    radii: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    rotation_deg: tuple[float, float, float] = (0.0, 0.0, 0.0),
    flatten_sides_x: float = 0.0,
    flatten_front_y: float = 0.0,
    taper_z: float = 0.0,
    u_seg: int = 24,
    v_seg: int = 16,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_seg, v_segments=v_seg, radius=1.0)
    rx, ry, rz = radii
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        if flatten_sides_x > 0.0 and abs(x) > (1.0 - flatten_sides_x):
            lim = 1.0 - flatten_sides_x
            x = math.copysign(lim + (abs(x) - lim) * 0.22, x)
        if flatten_front_y > 0.0 and abs(y) > (1.0 - flatten_front_y):
            lim = 1.0 - flatten_front_y
            y = math.copysign(lim + (abs(y) - lim) * 0.26, y)
        if abs(taper_z) > 1e-5:
            f = max(0.30, 1.0 + taper_z * z)
            x, y = x * f, y * f
        v.co = Vector((x * rx, y * ry, z * rz))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(tuple(location))
    obj.rotation_euler = Euler(tuple(math.radians(a) for a in rotation_deg), "XYZ")
    bpy.context.view_layer.update()
    obj.matrix_world = Matrix.Translation(obj.location) @ obj.rotation_euler.to_matrix().to_4x4()
    return bake_world_and_subsurf(obj, collection, material, 1)


def create_contour_torus_mesh(
    name: str,
    center: Vector,
    rx: float,
    ry: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    tilt_deg: tuple[float, float, float] = (0.0, 0.0, 0.0),
    tube_r: float = 0.0018,
    major_seg: int = 36,
    minor_seg: int = 8,
) -> bpy.types.Object:
    """커브 대신 정식 쿼드 토러스 메쉬로 등고선을 생성해 glTF 스키닝(`JOINTS_0`/`WEIGHTS_0`)을 완벽 지원한다."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings: list[list[bmesh.types.BMVert]] = []
    rot_m = Euler(tuple(math.radians(a) for a in tilt_deg), "XYZ").to_matrix()
    for i in range(major_seg):
        u = (2.0 * math.pi * i) / major_seg
        cu, su = math.cos(u), math.sin(u)
        c_pt = Vector((rx * cu, ry * su, 0.0))
        rad_dir = Vector((cu / max(rx, 1e-5), su / max(ry, 1e-5), 0.0)).normalized()
        ring: list[bmesh.types.BMVert] = []
        for j in range(minor_seg):
            v = (2.0 * math.pi * j) / minor_seg
            local_pt = c_pt + rad_dir * (tube_r * math.cos(v)) + Vector((0.0, 0.0, tube_r * math.sin(v)))
            ring.append(bm.verts.new(center + (rot_m @ local_pt)))
        rings.append(ring)
    for i in range(major_seg):
        inext = (i + 1) % major_seg
        for j in range(minor_seg):
            jnext = (j + 1) % minor_seg
            bm.faces.new((rings[i][j], rings[inext][j], rings[inext][jnext], rings[i][jnext]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    return bake_world_and_subsurf(bpy.data.objects.new(name, mesh), collection, material, 0)


def point_segment_dist_sq(pt: Vector, a: Vector, b: Vector) -> float:
    ab = b - a
    len_sq = ab.length_squared
    if len_sq < 1e-10:
        return (pt - a).length_squared
    t = max(0.0, min(1.0, (pt - a).dot(ab) / len_sq))
    proj = a + ab * t
    return (pt - proj).length_squared


def bind_skinned_part(
    obj: bpy.types.Object,
    arm_obj: bpy.types.Object,
    candidate_bones: Sequence[str],
    sharpness: float = 14.0,
) -> None:
    """지정된 해부학 후보 본들과의 세그먼트 거리에 따라 연속 가우시안 스키닝 웨이트를 부여한다."""
    obj.parent = arm_obj
    obj.matrix_parent_inverse = arm_obj.matrix_world.inverted()
    bones = arm_obj.data.bones
    bone_segs = [(bname, bones[bname].head_local.copy(), bones[bname].tail_local.copy()) for bname in candidate_bones if bname in bones]
    if not bone_segs:
        return
    vgroups = {bname: obj.vertex_groups.new(name=bname) for bname, _, _ in bone_segs}

    if len(bone_segs) == 1:
        only_name = bone_segs[0][0]
        vgroups[only_name].add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    else:
        for v in obj.data.vertices:
            co = v.co
            raw_weights: list[tuple[str, float]] = []
            for bname, h, t in bone_segs:
                d = math.sqrt(point_segment_dist_sq(co, h, t))
                w = math.exp(-((d * sharpness) ** 2)) + 1e-6
                raw_weights.append((bname, w))
            raw_weights.sort(key=lambda item: item[1], reverse=True)
            top = raw_weights[:4]
            total = sum(w for _, w in top) or 1.0
            for bname, w in top:
                nw = w / total
                if nw > 1e-4:
                    vgroups[bname].add([v.index], nw, "REPLACE")

    mod = obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm_obj
    mod.use_vertex_groups = True


def build_ecorche_mannequin_v3(
    export_glb_path: Path | None = None,
    render_preview_path: Path | None = None,
) -> dict[str, object]:
    scene = prepare_isolated_scene()
    m_col = bpy.data.collections.new("Ecorche_Figure_v4")
    s_col = bpy.data.collections.new("Ecorche_Stage_v4")
    scene.collection.children.link(m_col)
    scene.collection.children.link(s_col)

    mat_body = make_pbr_material("TS_EcorcheClay", "#E2CBBA", roughness=0.44, coat=0.10)
    mat_muscle = make_pbr_material("TS_EcorcheMuscle", "#CF9C80", roughness=0.47, coat=0.06)
    mat_joint = make_pbr_material("TS_EcorcheJoint", "#8B6045", roughness=0.35, metallic=0.12, coat=0.16)
    mat_landmark = make_pbr_material("TS_EcorcheLandmark", "#F6F0E6", roughness=0.34, coat=0.15)
    mat_contour = make_pbr_material("TS_EcorcheContour", "#0EA5E9", roughness=0.25, emission_hex="#38BDF8", emission_strength=0.35)
    mat_socket = make_pbr_material("TS_EcorcheSocket", "#B39884", roughness=0.52, coat=0.04)
    mat_stage = make_pbr_material("TS_EcorcheStage", "#222026", roughness=0.52, metallic=0.18)

    height_m = 1.76
    z_pelvis, z_waist, z_chest, z_clavicle = 0.93, 1.10, 1.30, 1.445
    z_neck_base, z_head_base = 1.455, 1.535
    z_shoulder, x_shoulder, z_elbow, z_wrist = 1.435, 0.198, 1.135, 0.870
    x_hip, z_hip, z_knee, z_ankle = 0.088, 0.90, 0.495, 0.088

    # 1. 51본 휴머노이드 아머처 먼저 생성
    arm_data = bpy.data.armatures.new("ToonStudio_Mannequin_Rig_v3")
    arm_obj = bpy.data.objects.new("ToonStudio_Mannequin_Rig_v3", arm_data)
    m_col.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def add_bone(bname: str, h: tuple[float, float, float], t: tuple[float, float, float], p: str | None = None) -> None:
        b = eb.new(bname)
        b.head, b.tail = Vector(h), Vector(t)
        if p and p in eb:
            b.parent = eb[p]

    add_bone("pelvis", (0.0, 0.0, z_pelvis), (0.0, 0.0, z_waist))
    add_bone("spine", (0.0, 0.0, z_waist), (0.0, 0.0, z_chest - 0.04), "pelvis")
    add_bone("chest", (0.0, 0.0, z_chest - 0.04), (0.0, 0.0, z_clavicle), "spine")
    add_bone("neck", (0.0, 0.0, z_clavicle), (0.0, 0.0, z_head_base), "chest")
    add_bone("head", (0.0, 0.0, z_head_base), (0.0, 0.0, height_m), "neck")
    for sx, sp in ((1.0, "left"), (-1.0, "right")):
        xs, xe, xw = sx * x_shoulder, sx * (x_shoulder + 0.022), sx * (x_shoulder + 0.038)
        xh, xk, xa = sx * x_hip, sx * 0.082, sx * 0.078
        add_bone(f"{sp}Shoulder", (sx * 0.025, -0.05, z_clavicle), (xs, 0.0, z_shoulder), "chest")
        add_bone(f"{sp}UpperArm", (xs, 0.0, z_shoulder), (xe, 0.0, z_elbow), f"{sp}Shoulder")
        add_bone(f"{sp}LowerArm", (xe, 0.0, z_elbow), (xw, -0.004, z_wrist), f"{sp}UpperArm")
        add_bone(f"{sp}Hand", (xw, -0.004, z_wrist), (xw + sx * 0.004, -0.008, z_wrist - 0.084), f"{sp}LowerArm")
        for fn, y_o, fl in (("Thumb", -0.031, 0.056), ("Index", -0.024, 0.074), ("Middle", -0.008, 0.082), ("Ring", 0.008, 0.076), ("Little", 0.024, 0.062)):
            pn, bz, st = f"{sp}Hand", z_wrist - (0.034 if fn == "Thumb" else 0.084), fl / 3.0
            for sg in range(1, 4):
                bn = f"{sp}{fn}{sg}"
                add_bone(bn, (xw + sx * 0.004, -0.008 + y_o, bz - st * (sg - 1)), (xw + sx * 0.004, -0.008 + y_o, bz - st * sg), pn)
                pn = bn
        add_bone(f"{sp}UpperLeg", (xh, 0.0, z_hip), (xk, 0.0, z_knee), "pelvis")
        add_bone(f"{sp}LowerLeg", (xk, 0.0, z_knee), (xa, 0.0, z_ankle), f"{sp}UpperLeg")
        add_bone(f"{sp}Foot", (xa, 0.0, z_ankle), (xa, -0.10, 0.022), f"{sp}LowerLeg")
        add_bone(f"{sp}Toe", (xa, -0.10, 0.022), (xa, -0.165, 0.012), f"{sp}Foot")
    bpy.ops.object.mode_set(mode="OBJECT")

    skinned_records: list[tuple[bpy.types.Object, Sequence[str], float]] = []

    def add_skinned(obj: bpy.types.Object, bones_list: Sequence[str], sharp: float = 14.0) -> None:
        skinned_records.append((obj, bones_list, sharp))

    # 2. 골반 장골능 ~ 잘록한 허리 ~ 역삼각형 흉곽 V-테이퍼 연속 로프트 (척추 체인 연속 스키닝)
    add_skinned(
        create_lofted_tube("Torso_Anatomical_Body", [
            (Vector((0.0, 0.008, z_pelvis - 0.080)), 0.098, 0.082, 0.0),
            (Vector((0.0, 0.002, z_pelvis - 0.015)), 0.136, 0.098, 0.0),
            (Vector((0.0, -0.002, z_pelvis + 0.050)), 0.140, 0.096, 0.0),
            (Vector((0.0, -0.004, z_waist - 0.015)), 0.114, 0.085, 0.0),
            (Vector((0.0, -0.006, z_waist + 0.055)), 0.122, 0.090, 0.0),
            (Vector((0.0, -0.008, z_chest - 0.055)), 0.150, 0.106, 0.0),
            (Vector((0.0, -0.004, z_chest + 0.045)), 0.168, 0.114, 0.0),
            (Vector((0.0, 0.006, z_clavicle - 0.010)), 0.152, 0.098, 0.0),
            (Vector((0.0, 0.010, z_clavicle + 0.026)), 0.074, 0.066, 0.0),
        ], m_col, mat_body, ring_verts=28, subsurf_levels=2, power=0.86),
        ("pelvis", "spine", "chest"),
        sharp=8.5,
    )

    add_skinned(create_sculpted_ellipsoid("Landmark_Sternum", (0.0, -0.110, z_chest + 0.024), (0.010, 0.008, 0.080), m_col, mat_landmark, (-6.0, 0.0, 0.0)), ("chest",))
    add_skinned(create_sculpted_ellipsoid("Landmark_Sacrum", (0.0, 0.092, z_pelvis + 0.028), (0.036, 0.012, 0.046), m_col, mat_landmark, taper_z=0.35), ("pelvis",))
    add_skinned(create_lofted_tube("Neck_Column", [
        (Vector((0.0, 0.008, z_neck_base - 0.018)), 0.052, 0.050, 0.0),
        (Vector((0.0, 0.0, z_neck_base + 0.040)), 0.046, 0.045, 0.0),
        (Vector((0.0, -0.005, z_head_base + 0.022)), 0.044, 0.043, 0.0),
    ], m_col, mat_body, ring_verts=20), ("chest", "neck", "head"), sharp=16.0)

    # 3. 아틀리에 루미스(Loomis) 면 분할 두상
    add_skinned(create_sculpted_ellipsoid("Head_CranialSphere", (0.0, 0.008, z_head_base + 0.128), (0.078, 0.096, 0.096), m_col, mat_body, flatten_sides_x=0.22, u_seg=32, v_seg=22), ("head",))
    add_skinned(create_lofted_tube("Head_JawMask", [
        (Vector((0.0, -0.068, z_head_base + 0.006)), 0.022, 0.024, 0.0),
        (Vector((0.0, -0.046, z_head_base + 0.038)), 0.048, 0.048, 0.0),
        (Vector((0.0, -0.028, z_head_base + 0.078)), 0.066, 0.062, 0.0),
        (Vector((0.0, -0.018, z_head_base + 0.118)), 0.071, 0.068, 0.0),
    ], m_col, mat_body, ring_verts=24, subsurf_levels=2, power=0.80), ("head",))
    add_skinned(create_sculpted_ellipsoid("Head_BrowRidge", (0.0, -0.084, z_head_base + 0.122), (0.054, 0.014, 0.010), m_col, mat_landmark, flatten_front_y=0.38), ("head",))
    add_skinned(create_sculpted_ellipsoid("Head_NoseWedge", (0.0, -0.093, z_head_base + 0.094), (0.010, 0.016, 0.023), m_col, mat_landmark, (15.0, 0.0, 0.0), taper_z=-0.34), ("head",))
    add_skinned(create_contour_torus_mesh("Guide_HeadMedian", Vector((0.0, 0.004, z_head_base + 0.116)), 0.098, 0.104, m_col, mat_contour, (0.0, 90.0, 0.0)), ("head",))
    add_skinned(create_contour_torus_mesh("Guide_HeadBrowLine", Vector((0.0, 0.002, z_head_base + 0.122)), 0.077, 0.098, m_col, mat_contour), ("head",))

    for sx, tag, sp in ((-1.0, "R", "right"), (1.0, "L", "left")):
        add_skinned(create_sculpted_ellipsoid(f"Head_OrbitalPlane_{tag}", (sx * 0.028, -0.079, z_head_base + 0.108), (0.017, 0.008, 0.011), m_col, mat_socket, (8.0, 0.0, sx * -5.0), flatten_front_y=0.4), ("head",))
        add_skinned(create_sculpted_ellipsoid(f"Head_Zygomatic_{tag}", (sx * 0.049, -0.062, z_head_base + 0.092), (0.018, 0.010, 0.013), m_col, mat_body, (0.0, sx * 16.0, sx * -10.0), flatten_front_y=0.42), ("head",))
        add_skinned(create_sculpted_ellipsoid(f"Head_Ear_{tag}", (sx * 0.075, 0.006, z_head_base + 0.098), (0.008, 0.017, 0.024), m_col, mat_landmark, (8.0, 0.0, sx * -6.0)), ("head",))
        add_skinned(create_sculpted_ellipsoid(f"PectoralisPlate_{tag}", (sx * 0.070, -0.098, z_chest + 0.044), (0.074, 0.022, 0.054), m_col, mat_muscle, (8.0, sx * 14.0, sx * -8.0), flatten_front_y=0.38), ("chest", f"{sp}Shoulder"), sharp=11.0)
        add_skinned(create_sculpted_ellipsoid(f"Landmark_CostalArch_{tag}", (sx * 0.060, -0.100, z_chest - 0.056), (0.048, 0.009, 0.012), m_col, mat_landmark, (0.0, sx * -26.0, sx * 12.0)), ("chest", "spine"))
        add_skinned(create_sculpted_ellipsoid(f"ExternalOblique_{tag}", (sx * 0.108, -0.010, z_waist - 0.014), (0.020, 0.052, 0.054), m_col, mat_muscle, (0.0, sx * -6.0, 0.0)), ("spine", "pelvis"), sharp=10.0)
        add_skinned(create_sculpted_ellipsoid(f"GluteusMaximus_{tag}", (sx * 0.068, 0.068, z_pelvis - 0.018), (0.070, 0.050, 0.084), m_col, mat_muscle, (10.0, sx * -8.0, sx * 5.0)), ("pelvis", f"{sp}UpperLeg"), sharp=11.0)
        add_skinned(create_sculpted_ellipsoid(f"Landmark_ASIS_{tag}", (sx * 0.116, -0.080, z_pelvis + 0.040), (0.013, 0.011, 0.014), m_col, mat_landmark), ("pelvis",))
        add_skinned(create_sculpted_ellipsoid(f"Scapula_{tag}", (sx * 0.080, 0.092, z_chest + 0.042), (0.054, 0.016, 0.072), m_col, mat_landmark, (-8.0, sx * -10.0, sx * 8.0)), ("chest", f"{sp}Shoulder"), sharp=12.0)
        add_skinned(create_sculpted_ellipsoid(f"LatissimusDorsi_{tag}", (sx * 0.136, 0.032, z_chest - 0.016), (0.030, 0.054, 0.092), m_col, mat_muscle, (0.0, sx * 14.0, 0.0)), ("chest", "spine"), sharp=10.0)
        add_skinned(create_lofted_tube(f"Clavicle_{tag}", [
            (Vector((sx * 0.018, -0.084, z_clavicle - 0.012)), 0.010, 0.009, 0.0),
            (Vector((sx * 0.094, -0.064, z_clavicle)), 0.009, 0.008, 0.0),
            (Vector((sx * 0.180, -0.012, z_clavicle + 0.010)), 0.011, 0.009, 0.0),
        ], m_col, mat_landmark, ring_verts=12), (f"{sp}Shoulder", "chest"), sharp=16.0)
        add_skinned(create_lofted_tube(f"TrapeziusSlope_{tag}", [
            (Vector((sx * 0.040, 0.016, z_neck_base + 0.026)), 0.022, 0.020, 0.0),
            (Vector((sx * 0.112, 0.014, z_clavicle + 0.012)), 0.028, 0.025, 0.0),
            (Vector((sx * 0.174, 0.006, z_clavicle + 0.004)), 0.020, 0.018, 0.0),
        ], m_col, mat_muscle, ring_verts=14), ("neck", f"{sp}Shoulder", "chest"), sharp=14.0)
        add_skinned(create_lofted_tube(f"SCM_Muscle_{tag}", [
            (Vector((sx * 0.015, -0.052, z_clavicle - 0.008)), 0.008, 0.008, 0.0),
            (Vector((sx * 0.040, 0.008, z_head_base + 0.016)), 0.009, 0.008, 0.0),
        ], m_col, mat_muscle, ring_verts=10), ("chest", "neck", "head"), sharp=18.0)

        for t_i, z_off in enumerate((0.070, 0.014, -0.042)):
            add_skinned(create_sculpted_ellipsoid(f"RectusAbdominis_{tag}_{t_i}", (sx * 0.028, -0.085, z_waist + z_off), (0.026, 0.009, 0.024), m_col, mat_muscle, flatten_front_y=0.40), ("spine", "chest", "pelvis"), sharp=12.0)

        xs, xe, xw = sx * x_shoulder, sx * (x_shoulder + 0.022), sx * (x_shoulder + 0.038)
        add_skinned(create_sculpted_ellipsoid(f"Joint_Shoulder_{tag}", (xs, 0.0, z_shoulder), (0.038, 0.038, 0.038), m_col, mat_joint), (f"{sp}Shoulder", f"{sp}UpperArm"))
        add_skinned(create_sculpted_ellipsoid(f"DeltoidCap_{tag}", (xs + sx * 0.010, 0.0, z_shoulder - 0.044), (0.045, 0.047, 0.074), m_col, mat_muscle, (0.0, sx * -7.0, 0.0), taper_z=0.34), (f"{sp}UpperArm", f"{sp}Shoulder"), sharp=14.0)
        add_skinned(create_lofted_tube(f"UpperArm_Loft_{tag}", [
            (Vector((xs, 0.0, z_shoulder - 0.015)), 0.041, 0.043, 0.0),
            (Vector(((xs + xe) * 0.5, -0.004, (z_shoulder + z_elbow) * 0.5 + 0.015)), 0.040, 0.045, 0.0),
            (Vector((xe, 0.0, z_elbow + 0.018)), 0.033, 0.035, 0.0),
        ], m_col, mat_body, ring_verts=20), (f"{sp}UpperArm", f"{sp}LowerArm"), sharp=14.0)
        add_skinned(create_sculpted_ellipsoid(f"BicepsBrachii_{tag}", ((xs + xe) * 0.5, -0.026, (z_shoulder + z_elbow) * 0.5 + 0.006), (0.026, 0.024, 0.072), m_col, mat_muscle), (f"{sp}UpperArm",))
        add_skinned(create_sculpted_ellipsoid(f"TricepsHead_{tag}", ((xs + xe) * 0.5 + sx * 0.006, 0.024, (z_shoulder + z_elbow) * 0.5 + 0.022), (0.028, 0.022, 0.068), m_col, mat_muscle), (f"{sp}UpperArm",))
        add_skinned(create_sculpted_ellipsoid(f"Joint_Elbow_{tag}", (xe, 0.0, z_elbow), (0.032, 0.032, 0.032), m_col, mat_joint), (f"{sp}LowerArm", f"{sp}UpperArm"))
        add_skinned(create_sculpted_ellipsoid(f"Landmark_Olecranon_{tag}", (xe, 0.031, z_elbow - 0.004), (0.012, 0.011, 0.014), m_col, mat_landmark), (f"{sp}LowerArm",))
        add_skinned(create_lofted_tube(f"Forearm_Loft_{tag}", [
            (Vector((xe, 0.0, z_elbow - 0.012)), 0.035, 0.033, 0.0),
            (Vector((xe + sx * 0.005, -0.004, z_elbow - 0.075)), 0.039, 0.036, sx * 0.18),
            (Vector((xw, -0.004, z_wrist + 0.014)), 0.025, 0.018, sx * 0.42),
        ], m_col, mat_body, ring_verts=20), (f"{sp}LowerArm", f"{sp}Hand"), sharp=15.0)
        add_skinned(create_sculpted_ellipsoid(f"Brachioradialis_{tag}", (xe + sx * 0.014, -0.014, z_elbow - 0.068), (0.019, 0.021, 0.066), m_col, mat_muscle, (0.0, sx * -5.0, 0.0), taper_z=0.32), (f"{sp}LowerArm",))
        add_skinned(create_sculpted_ellipsoid(f"Landmark_UlnarStyloid_{tag}", (xw + sx * 0.018, 0.008, z_wrist + 0.006), (0.008, 0.008, 0.009), m_col, mat_landmark), (f"{sp}LowerArm",))
        add_skinned(create_sculpted_ellipsoid(f"Joint_Wrist_{tag}", (xw, -0.004, z_wrist), (0.022, 0.017, 0.019), m_col, mat_joint), (f"{sp}Hand", f"{sp}LowerArm"))
        add_skinned(create_sculpted_ellipsoid(f"Hand_Palm_{tag}", (xw + sx * 0.004, -0.008, z_wrist - 0.044), (0.014, 0.035, 0.043), m_col, mat_body, taper_z=-0.15), (f"{sp}Hand",))
        add_skinned(create_sculpted_ellipsoid(f"Hand_Thenar_{tag}", (xw - sx * 0.005, -0.022, z_wrist - 0.030), (0.011, 0.015, 0.021), m_col, mat_muscle), (f"{sp}Hand", f"{sp}Thumb1"))
        add_skinned(create_contour_torus_mesh(f"Guide_UpperArm_{tag}", Vector(((xs + xe) * 0.5, -0.002, (z_shoulder + z_elbow) * 0.5)), 0.043, 0.047, m_col, mat_contour), (f"{sp}UpperArm",))
        add_skinned(create_contour_torus_mesh(f"Guide_Forearm_{tag}", Vector(((xe + xw) * 0.5, -0.004, (z_elbow + z_wrist) * 0.5 + 0.02)), 0.037, 0.033, m_col, mat_contour), (f"{sp}LowerArm",))

        for fname, y_off, flen, frad in (("Index", -0.024, 0.074, 0.0068), ("Middle", -0.008, 0.082, 0.0072), ("Ring", 0.008, 0.076, 0.0066), ("Little", 0.024, 0.062, 0.0058)):
            cur = Vector((xw + sx * 0.004, -0.008 + y_off, z_wrist - 0.084))
            cum = 0.0
            for s_i, (slen, c_ang) in enumerate(zip((flen * 0.44, flen * 0.32, flen * 0.24), (0.14, 0.20, 0.12))):
                cum += c_ang
                nxt = cur + Vector((-sx * math.sin(cum) * slen, 0.0, -math.cos(cum) * slen))
                r0, r1 = frad * (1.0 - 0.16 * s_i), frad * (1.0 - 0.16 * (s_i + 1))
                f_obj = create_lofted_tube(f"Finger_{fname}_{s_i + 1}_{tag}", [(cur, r0, r0 * 0.92, 0.0), (nxt, r1, r1 * 0.9, 0.0)], m_col, mat_body, ring_verts=12, subsurf_levels=0)
                add_skinned(f_obj, (f"{sp}{fname}{s_i + 1}",))
                cur = nxt
        t_cur = Vector((xw - sx * 0.004, -0.031, z_wrist - 0.034))
        for s_i, (dx, dy, dz, tr) in enumerate(((-0.007, -0.017, -0.023, 0.0084), (-0.005, -0.013, -0.019, 0.0072), (-0.004, -0.010, -0.015, 0.0062))):
            t_nxt = t_cur + Vector((sx * dx, dy, dz))
            t_obj = create_lofted_tube(f"Finger_Thumb_{s_i + 1}_{tag}", [(t_cur, tr, tr * 0.92, 0.0), (t_nxt, tr * 0.86, tr * 0.82, 0.0)], m_col, mat_body, ring_verts=12, subsurf_levels=0)
            add_skinned(t_obj, (f"{sp}Thumb{s_i + 1}",))
            t_cur = t_nxt

        xh, xk, xa = sx * x_hip, sx * 0.082, sx * 0.078
        add_skinned(create_sculpted_ellipsoid(f"Joint_Hip_{tag}", (xh, 0.0, z_hip), (0.052, 0.052, 0.052), m_col, mat_joint), (f"{sp}UpperLeg", "pelvis"))
        add_skinned(create_lofted_tube(f"Thigh_Loft_{tag}", [
            (Vector((xh, 0.004, z_hip - 0.01)), 0.076, 0.080, 0.0),
            (Vector(((xh + xk) * 0.5 + sx * 0.004, -0.006, z_hip - 0.16)), 0.074, 0.078, 0.0),
            (Vector((xk, -0.004, z_knee + 0.095)), 0.060, 0.064, 0.0),
            (Vector((xk, 0.0, z_knee + 0.022)), 0.049, 0.051, 0.0),
        ], m_col, mat_body, ring_verts=24), (f"{sp}UpperLeg", f"{sp}LowerLeg"), sharp=12.0)
        add_skinned(create_sculpted_ellipsoid(f"RectusFemoris_{tag}", ((xh + xk) * 0.5, -0.048, (z_hip + z_knee) * 0.5 + 0.025), (0.032, 0.028, 0.125), m_col, mat_muscle, flatten_front_y=0.25), (f"{sp}UpperLeg",))
        add_skinned(create_sculpted_ellipsoid(f"VastusMedialisVMO_{tag}", (xk - sx * 0.025, -0.035, z_knee + 0.080), (0.025, 0.024, 0.050), m_col, mat_muscle, (-6.0, sx * 10.0, 0.0)), (f"{sp}UpperLeg",))
        add_skinned(create_sculpted_ellipsoid(f"Joint_Knee_{tag}", (xk, 0.0, z_knee), (0.044, 0.044, 0.044), m_col, mat_joint), (f"{sp}LowerLeg", f"{sp}UpperLeg"))
        add_skinned(create_sculpted_ellipsoid(f"Landmark_Patella_{tag}", (xk, -0.048, z_knee + 0.006), (0.020, 0.010, 0.024), m_col, mat_landmark, taper_z=0.25), (f"{sp}LowerLeg", f"{sp}UpperLeg"))
        add_skinned(create_lofted_tube(f"Calf_Loft_{tag}", [
            (Vector((xk, 0.004, z_knee - 0.022)), 0.046, 0.048, 0.0),
            (Vector((xk + sx * 0.003, 0.014, z_knee - 0.125)), 0.053, 0.059, 0.0),
            (Vector((xa, 0.006, z_ankle + 0.135)), 0.038, 0.042, 0.0),
            (Vector((xa, 0.004, z_ankle + 0.022)), 0.029, 0.032, 0.0),
        ], m_col, mat_body, ring_verts=22), (f"{sp}LowerLeg", f"{sp}Foot"), sharp=13.0)
        add_skinned(create_sculpted_ellipsoid(f"Gastrocnemius_{tag}", (xk + sx * 0.004, 0.040, z_knee - 0.125), (0.042, 0.026, 0.086), m_col, mat_muscle, taper_z=0.28), (f"{sp}LowerLeg",))
        add_skinned(create_sculpted_ellipsoid(f"Landmark_MedialMalleolus_{tag}", (xa - sx * 0.030, -0.005, z_ankle + 0.012), (0.010, 0.011, 0.012), m_col, mat_landmark), (f"{sp}LowerLeg",))
        add_skinned(create_sculpted_ellipsoid(f"Landmark_LateralMalleolus_{tag}", (xa + sx * 0.031, 0.007, z_ankle - 0.006), (0.010, 0.011, 0.012), m_col, mat_landmark), (f"{sp}LowerLeg",))
        add_skinned(create_sculpted_ellipsoid(f"Joint_Ankle_{tag}", (xa, 0.0, z_ankle), (0.029, 0.029, 0.029), m_col, mat_joint), (f"{sp}Foot", f"{sp}LowerLeg"))
        add_skinned(create_lofted_tube(f"Foot_Arch_{tag}", [
            (Vector((xa, 0.044, 0.032)), 0.030, 0.030, 0.0),
            (Vector((xa, -0.015, 0.038)), 0.036, 0.034, 0.0),
            (Vector((xa + sx * 0.004, -0.094, 0.021)), 0.042, 0.019, 0.0),
            (Vector((xa + sx * 0.004, -0.154, 0.012)), 0.036, 0.011, 0.0),
        ], m_col, mat_body, ring_verts=18), (f"{sp}Foot", f"{sp}Toe"), sharp=18.0)
        add_skinned(create_contour_torus_mesh(f"Guide_Thigh_{tag}", Vector(((xh + xk) * 0.5, -0.004, (z_hip + z_knee) * 0.5 + 0.02)), 0.076, 0.080, m_col, mat_contour), (f"{sp}UpperLeg",))
        add_skinned(create_contour_torus_mesh(f"Guide_Calf_{tag}", Vector((xk + sx * 0.003, 0.014, z_knee - 0.13)), 0.055, 0.061, m_col, mat_contour), (f"{sp}LowerLeg",))

    for obj, bones_list, sharp in skinned_records:
        bind_skinned_part(obj, arm_obj, bones_list, sharpness=sharp)

    exported_bytes = 0
    if export_glb_path is not None:
        export_glb_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.object.select_all(action="DESELECT")
        arm_obj.select_set(True)
        for obj, _, _ in skinned_records:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = arm_obj
        bpy.ops.export_scene.gltf(
            filepath=str(export_glb_path),
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_skins=True,
            export_yup=True,
        )
        exported_bytes = export_glb_path.stat().st_size

    create_lofted_tube("Turntable_Base", [(Vector((0.0, 0.0, -0.038)), 0.48, 0.48, 0.0), (Vector((0.0, 0.0, 0.0)), 0.46, 0.46, 0.0)], s_col, mat_stage, ring_verts=48, subsurf_levels=0)
    for lname, loc, energy, col_rgb in (
        ("Ecorche_Key", (-1.8, -2.3, 2.5), 295.0, (1.0, 0.96, 0.91)),
        ("Ecorche_Fill", (2.2, -2.0, 1.6), 110.0, (0.86, 0.93, 1.0)),
        ("Ecorche_Rim", (0.2, 1.9, 2.3), 195.0, (1.0, 0.98, 0.95)),
    ):
        ld = bpy.data.lights.new(lname, type="AREA")
        ld.energy, ld.size, ld.color = energy, 1.7, col_rgb
        lo = bpy.data.objects.new(lname, ld)
        lo.location = Vector(loc)
        lo.rotation_euler = (Vector((0.0, 0.0, 0.92)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        s_col.objects.link(lo)

    cam_d = bpy.data.cameras.new("Ecorche_Cam")
    cam_d.lens = 52
    cam_o = bpy.data.objects.new("Ecorche_Cam", cam_d)
    cam_o.location = Vector((0.92, -3.10, 0.96))
    cam_o.rotation_euler = (Vector((0.0, 0.0, 0.90)) - cam_o.location).to_track_quat("-Z", "Y").to_euler()
    s_col.objects.link(cam_o)
    scene.camera = cam_o

    if render_preview_path is not None:
        engines = [e.identifier for e in scene.render.bl_rna.properties["engine"].enum_items]
        scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else ("BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "CYCLES")
        scene.render.film_transparent = False
        if scene.world is None:
            scene.world = bpy.data.worlds.new("Ecorche_World")
        scene.world.use_nodes = True
        bg = scene.world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.10, 0.105, 0.125, 1.0)
            bg.inputs[1].default_value = 0.85
        scene.render.resolution_x = 960
        scene.render.resolution_y = 1280
        scene.render.filepath = str(render_preview_path)
        bpy.ops.render.render(scene=SCENE_NAME, write_still=True)

    return {
        "scene": SCENE_NAME,
        "skinned_objects": len(skinned_records),
        "bones": len(arm_data.bones),
        "exported_bytes": exported_bytes,
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    print(build_ecorche_mannequin_v3(root / "apps/web/public/models/mannequin/toonstudio_ecorche_mannequin_v3.glb"))
