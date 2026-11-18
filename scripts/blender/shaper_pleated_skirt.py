"""주름치마의 허리와 앞뒤 자락을 서로 다른 비율로 허벅지에 연결한다."""


def _smoothstep(value):
    t = max(0.0, min(1.0, value))
    return t * t * (3.0 - 2.0 * t)


def fit_pleated_skirt(skirt, armature):
    """양쪽 다리를 독립적으로 들어도 허리선과 중앙 주름이 이어지게 한다."""
    bones = armature.data.bones
    left_hip = bones["mixamorig:LeftUpLeg"].head_local
    right_hip = bones["mixamorig:RightUpLeg"].head_local
    hip = (left_hip + right_hip) * 0.5
    thigh_height = hip.z - bones["mixamorig:LeftLeg"].head_local.z
    if thigh_height <= 0:
        raise ValueError("허벅지 관절과 무릎의 높이를 확인하세요.")
    to_rig = armature.matrix_world.inverted() @ skirt.matrix_world
    from_rig = to_rig.inverted()
    old_spine = skirt.vertex_groups.get("mixamorig:Spine1")
    spine_index = old_spine.index if old_spine else -1
    waistband_weights = [
        next((group.weight for group in vertex.groups if group.group == spine_index), 0.0)
        for vertex in skirt.data.vertices
    ]
    skirt.vertex_groups.clear()
    pelvis, left, right, spine = [
        skirt.vertex_groups.new(name="mixamorig:" + name)
        for name in ("Hips", "LeftUpLeg", "RightUpLeg", "Spine1")
    ]
    for vertex, spine_weight in zip(skirt.data.vertices, waistband_weights, strict=True):
        point = to_rig @ vertex.co
        x, y, z = (point - hip) / thigh_height
        front = _smoothstep((0.19 - y) / 0.41)
        below_waist = _smoothstep((0.405 - z) / 0.435)
        leg = _smoothstep((0.25 - z) / 0.74) * (0.55 + 0.45 * front)
        left_share = _smoothstep(0.5 + x / 0.51)
        upper_spine = (1.0 - leg) * spine_weight
        for group, weight in (
            (pelvis, 1.0 - leg - upper_spine),
            (spine, upper_spine),
            (left, leg * left_share),
            (right, leg * (1.0 - left_share)),
        ):
            if weight > 0:
                group.add([vertex.index], weight, "REPLACE")
        # 허리의 고정점을 유지하고 앞자락과 양옆에 무릎이 움직일 여유를 둔다.
        point.x += (point.x - hip.x) * 0.04375 * below_waist
        point.y -= thigh_height * 0.051 * front * below_waist
        vertex.co = from_rig @ point
    skirt.data.update()
