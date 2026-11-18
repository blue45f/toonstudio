"""제작 시에만 실제 몸 메시를 기준으로 주름치마의 접히는 부분에 여유를 준다."""

import math
from collections import defaultdict
from typing import NamedTuple

import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree


def set_step_pose(armature, side, hip_angle, knee_angle):
    for suffix, degrees in (("UpLeg", hip_angle), ("Leg", knee_angle)):
        bone = armature.pose.bones["mixamorig:" + side + suffix]
        basis = bone.matrix.to_quaternion()
        turn = Quaternion((1.0, 0.0, 0.0), math.radians(degrees))
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = bone.rotation_quaternion @ (basis.inverted() @ turn @ basis)
        bpy.context.view_layer.update()


def rig_space_surface(obj, armature):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    transform = armature.matrix_world.inverted() @ evaluated.matrix_world
    mesh = evaluated.data
    mesh.calc_loop_triangles()
    faces = [tuple(face.vertices) for face in mesh.loop_triangles]
    points = [transform @ v.co for v in mesh.vertices]
    return BVHTree.FromPolygons(points, faces, all_triangles=True)


class _Pose(NamedTuple):
    body: BVHTree
    transforms: list
    inverse_rotations: list


def _sample_poses(skirt, body, armature):
    weights = [[(skirt.vertex_groups[g.group].name, g.weight) for g in v.groups if g.weight > 0] for v in skirt.data.vertices]
    zero = Matrix(((0.0,) * 4,) * 4)
    saved = [(b, b.rotation_mode, b.matrix_basis.copy()) for b in armature.pose.bones
             if b.name in {f"mixamorig:{s}{n}" for s in ("Left", "Right") for n in ("UpLeg", "Leg")}]

    def restore():
        for bone, mode, basis in saved:
            bone.rotation_mode = mode
            bone.matrix_basis = basis
        bpy.context.view_layer.update()

    result = []
    try:
        for hip, knee in ((-85, 115), (-79, 110), (-75, 110), (-60, 90), (-45, 65), (25, 25), (0, 0)):
            for side in (("Left", "Right") if hip else ("Left",)):
                restore()
                set_step_pose(armature, side, hip, knee)
                skin = {b.name: b.matrix @ b.bone.matrix_local.inverted() for b in armature.pose.bones}
                transforms = [sum((skin[n] * w for n, w in influences), zero) for influences in weights]
                result.append(_Pose(rig_space_surface(body, armature), transforms,
                                    [m.to_3x3().inverted_safe() for m in transforms]))
    finally:
        restore()
    return result


def _contact_offsets(points, faces, pose, offsets):
    posed = [matrix @ point for matrix, point in zip(pose.transforms, points, strict=True)]
    cloth = BVHTree.FromPolygons(posed, faces, all_triangles=True)
    touched = sorted({cloth_face for _, cloth_face in pose.body.overlap(cloth)})

    def push(index, direction):
        correction = pose.inverse_rotations[index] @ direction
        if correction.length_squared > offsets[index].length_squared:
            offsets[index] = correction

    for face in touched:
        indices = faces[face]
        corners = [posed[index] for index in indices]
        for k in range(3):
            j = (k + 1) % 3
            edge = corners[j] - corners[k]
            if edge.length < 1e-7:
                continue
            hit, normal, _, _ = pose.body.ray_cast(corners[k], edge.normalized(), edge.length)
            if hit is not None:
                for index in (indices[k], indices[j]):
                    push(index, normal * 0.008)
        # 모서리만 보아 놓치는 교차를 면 중심·변 중점·정점에서 함께 샘플링한다.
        for sample in ((0, 1, 2), (0, 1), (1, 2), (0, 2), (0,), (1,), (2,)):
            point = sum((corners[k] for k in sample), Vector()) / len(sample)
            near, normal, _, distance = pose.body.find_nearest(point)
            if near is not None and (point - near).dot(normal) <= 0.0015:
                for k in sample:
                    push(indices[k], normal * (0.006 + distance))


def bake_pleated_skirt_clearance(skirt, body, armature):
    mesh = skirt.data
    mesh.calc_loop_triangles()
    faces = [tuple(face.vertices) for face in mesh.loop_triangles]
    to_rig = armature.matrix_world.inverted() @ skirt.matrix_world
    from_rig = to_rig.inverted()
    basis = [to_rig @ vertex.co for vertex in mesh.vertices]
    points = [p.copy() for p in basis]
    neighbours = [set() for _ in points]
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbours[a].add(b)
        neighbours[b].add(a)
    seams = defaultdict(list)
    for i, point in enumerate(basis):
        seams[tuple(round(v, 5) for v in point)].append(i)
    split_vertices = [indices for indices in seams.values() if len(indices) > 1]
    poses = _sample_poses(skirt, body, armature)

    for _ in range(64):
        offsets = [Vector() for _ in points]
        for pose in poses:
            _contact_offsets(points, faces, pose, offsets)
        if all(d.length_squared < 1e-10 for d in offsets):
            break
        for i, adjacent in enumerate(neighbours):
            delta = offsets[i] * 0.55
            if adjacent:
                delta += sum((offsets[j] for j in adjacent), Vector()) * (0.45 / len(adjacent))
            if delta.length > 0.008:
                delta = delta.normalized() * 0.008
            if adjacent:
                mean = sum((points[j] - basis[j] for j in adjacent), Vector()) / len(adjacent)
                delta += (mean - (points[i] - basis[i])) * 0.04
            points[i] += delta
        # 내보낼 때 UV 경계로 분리된 정점도 같은 양만큼 움직여 솔기가 벌어지지 않는다.
        for indices in split_vertices:
            mean = sum((points[i] - basis[i] for i in indices), Vector()) / len(indices)
            for i in indices:
                points[i] = basis[i] + mean
    for vertex, point in zip(mesh.vertices, points, strict=True):
        vertex.co = from_rig @ point
    mesh.update()
    bpy.context.view_layer.update()
