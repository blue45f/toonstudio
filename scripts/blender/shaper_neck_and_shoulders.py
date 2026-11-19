"""주인공의 아래턱과 가슴을 잇고 상완 위의 소매산을 실제 관절에 맞춘다."""

import math

import bpy
from mathutils import Vector


def _smoothstep(start: float, end: float, value: float) -> float:
    t = max(0.0, min(1.0, (value - start) / (end - start)))
    return t * t * (3 - 2 * t)


def fit_neck_and_shoulders(head: bpy.types.Object, body: bpy.types.Object,
                           jacket: bpy.types.Object, armature: bpy.types.Object) -> None:
    bones = armature.data.bones
    neck = bones["mixamorig:Neck"].head_local
    chin = bones["TS_ShaperEye.L"].head_local.z - .065
    keys = head.data.shape_keys.key_blocks
    basis = [point.co.copy() for point in keys[0].data]
    bottom = min(point.z for point in basis)
    for i, point in enumerate(basis):
        fade = 1 - _smoothstep(chin - .013, chin + .008, point.z)
        if fade == 0:
            continue
        rise = _smoothstep(bottom, bottom + .049, point.z)
        flare = 1 - _smoothstep(bottom + .013, bottom + .079, point.z)
        lateral = abs(point.x) / .062
        above_collar = _smoothstep(bottom + .025, chin, point.z)
        front = _smoothstep(.15, .88, -(point.y - neck.y) / .054)
        # 목빗근은 하악 바깥에서 쇄골 안쪽으로 내려와 가운데 목오목 양옆을 지난다.
        muscle = math.exp(-((lateral - (.33 + .50 * above_collar)) / .13) ** 2)
        under_chin = .007 * _smoothstep(.30, .80, above_collar)
        hollow = .003 * (1 - _smoothstep(.22, .58, lateral))
        offset = Vector((
            -point.x * (.28 + .082 * rise - .50 * flare) * fade,
            -(point.y - neck.y) * (.12 + .09 * rise) * fade + front * fade * (under_chin + hollow - .0038 * muscle),
            -.043 * (1 - rise),
        ))
        # 모든 표정에 같은 기준점 변위를 더해 입·턱의 기존 모프 차분을 보존한다.
        for key in keys:
            key.data[i].co += offset
    head.data.update()

    arm = bones["mixamorig:LeftArm"].head_local
    for obj in (body, jacket):
        for vertex in obj.data.vertices:
            distance = abs(vertex.co.x)
            height = vertex.co.z - arm.z
            if height > 0:
                cap = _smoothstep(arm.x - .033, arm.x + .037, distance) * (1 - _smoothstep(arm.x + .090, arm.x + .36, distance))
                vertex.co.z -= .48 * cap * height * _smoothstep(0, .047, height)
        obj.data.update()
