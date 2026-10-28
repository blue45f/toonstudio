"""새 Blender background 프로세스에서 Array·Solidify의 작은 메시 계약을 관측한다.

저장된 .blend 파일을 읽거나 저장하지 않으며 사용자 Blender 프로세스에 연결하지 않는다.
실행 예시는 docs/studio/blender-native-modifier-contracts.md를 참고한다.
"""

import argparse
import json
from pathlib import Path
import sys

import bpy


QUAD_VERTICES = [(0, 0, 0), (2, 0, 0), (2, 1, 0), (0, 1, 0)]
QUAD_FACES = [(0, 1, 2, 3)]


def vector(value):
    """회귀 비교용 출력만 소수점 여섯 자리로 반올림한다."""
    return [round(float(component), 6) for component in value]


def create_object(name, vertices=QUAD_VERTICES, faces=QUAD_FACES, scale=(1, 1, 1)):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for selected in bpy.context.selected_objects:
        selected.select_set(False)
    obj.scale = scale
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.context.view_layer.update()
    return obj


def add_array(obj, relative=True, constant=True, relative_offset=(1, 2, 0),
              constant_offset=(0.5, -0.25, 3), count=3):
    modifier = obj.modifiers.new("Array", "ARRAY")
    modifier.fit_type = "FIXED_COUNT"
    modifier.count = count
    modifier.use_relative_offset = relative
    modifier.relative_offset_displace = relative_offset
    modifier.use_constant_offset = constant
    modifier.constant_offset_displace = constant_offset
    modifier.use_object_offset = False
    modifier.use_merge_vertices = False
    return modifier


def add_solidify(obj, thickness=0.2, offset=0, rim=True):
    modifier = obj.modifiers.new("Solidify", "SOLIDIFY")
    modifier.solidify_mode = "EXTRUDE"
    modifier.thickness = thickness
    modifier.offset = offset
    modifier.use_even_offset = False
    modifier.use_quality_normals = False
    modifier.use_rim = rim
    modifier.thickness_clamp = 0
    return modifier


def capture(name, obj, inputs):
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        local = [vector(vertex.co) for vertex in mesh.vertices]
        return {
            "name": name,
            "input": inputs,
            "objectScale": vector(obj.scale),
            "localVertices": local,
            "worldVertices": [vector(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices],
            "faces": [list(face.vertices) for face in mesh.polygons],
            "faceNormals": [vector(face.normal) for face in mesh.polygons],
            "triangles": [list(triangle.vertices) for triangle in mesh.loop_triangles],
            "triangleFaceIndices": [triangle.polygon_index for triangle in mesh.loop_triangles],
            "counts": {"vertices": len(local), "edges": len(mesh.edges), "faces": len(mesh.polygons)},
            "localBounds": [
                [min(vertex[axis] for vertex in local) for axis in range(3)],
                [max(vertex[axis] for vertex in local) for axis in range(3)],
            ],
        }
    finally:
        evaluated.to_mesh_clear()
        bpy.data.objects.remove(obj, do_unlink=True)


def observe():
    cases = []
    array_input = {"vertices": QUAD_VERTICES, "faces": QUAD_FACES,
                   "relativeOffset": [1, 2, 0], "constantOffset": [0.5, -0.25, 3], "count": 3}
    for relative, constant in [(True, True), (True, False), (False, True), (False, False)]:
        obj = create_object("array")
        add_array(obj, relative, constant)
        cases.append(capture(f"array_flags_{int(relative)}{int(constant)}", obj,
                             {**array_input, "relative": relative, "constant": constant}))

    for apply_scale in [False, True]:
        obj = create_object("array_scaled", scale=(3, 4, 5))
        if apply_scale:
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        add_array(obj)
        cases.append(capture("array_applied_scale" if apply_scale else "array_unapplied_scale", obj,
                             {**array_input, "scale": [3, 4, 5], "applyScale": apply_scale}))

    mirror_vertices = [(1, 0, 0), (2, 0, 0), (2, 1, 0), (1, 1, 0)]
    obj = create_object("mirror_then_array", vertices=mirror_vertices)
    mirror = obj.modifiers.new("Mirror", "MIRROR")
    mirror.use_axis = (True, False, False)
    mirror.use_mirror_merge = False
    add_array(obj, relative_offset=(1, 0, 0), constant_offset=(0.5, 0, 0), count=2)
    cases.append(capture("mirror_then_array", obj,
                         {"vertices": mirror_vertices, "faces": QUAD_FACES, "mirrorAxis": "X",
                          "relativeOffset": [1, 0, 0], "constantOffset": [0.5, 0, 0], "count": 2}))

    for solidify_first in [True, False]:
        obj = create_object("solidify_array")
        if solidify_first:
            add_solidify(obj, thickness=2, offset=0)
        add_array(obj, relative_offset=(0, 0, 1), constant_offset=(0, 0, 0.5), count=2)
        if not solidify_first:
            add_solidify(obj, thickness=2, offset=0)
        cases.append(capture("solidify_then_array" if solidify_first else "array_then_solidify", obj,
                             {"vertices": QUAD_VERTICES, "faces": QUAD_FACES, "thickness": 2,
                              "solidifyOffset": 0, "relativeOffset": [0, 0, 1],
                              "constantOffset": [0, 0, 0.5], "count": 2}))

    solidify_cases = [
        (0.2, -1, (1, 1, 1), False, True),
        (0.2, 0, (1, 1, 1), False, True),
        (0.2, 1, (1, 1, 1), False, True),
        (0.2, 0.25, (1, 1, 1), False, True),
        (-0.2, 0.25, (1, 1, 1), False, True),
        (0.2, 0, (2, 3, 4), False, True),
        (0.2, 0.25, (1, 1, 1), True, True),
        (0.2, 0, (1, 1, 1), False, False),
        (0, 0, (1, 1, 1), False, True),
    ]
    for thickness, offset, scale, reverse, rim in solidify_cases:
        faces = [tuple(reversed(QUAD_FACES[0]))] if reverse else QUAD_FACES
        obj = create_object("solidify", faces=faces, scale=scale)
        add_solidify(obj, thickness, offset, rim)
        name = f"solidify_t{thickness}_o{offset}_s{scale}_reverse{reverse}_rim{rim}"
        cases.append(capture(name, obj,
                             {"vertices": QUAD_VERTICES, "faces": faces, "thickness": thickness,
                              "offset": offset, "evenThickness": False, "qualityNormals": False,
                              "rim": rim, "scale": scale}))

    obj = create_object("defaults")
    array = obj.modifiers.new("default_array", "ARRAY")
    solidify = obj.modifiers.new("default_solidify", "SOLIDIFY")
    defaults = {
        "array": {key: vector(getattr(array, key)) if key.endswith("displace") else getattr(array, key)
                  for key in ["count", "use_relative_offset", "use_constant_offset", "relative_offset_displace",
                              "constant_offset_displace", "use_object_offset", "use_merge_vertices"]},
        "solidify": {key: getattr(solidify, key)
                     for key in ["solidify_mode", "thickness", "offset", "use_even_offset",
                                 "use_quality_normals", "use_rim", "thickness_clamp"]},
    }
    bpy.data.objects.remove(obj, do_unlink=True)
    return {"blenderVersion": bpy.app.version_string, "buildHash": bpy.app.build_hash.decode(),
            "defaults": defaults, "cases": cases}


def main():
    if not bpy.app.background or "--factory-startup" not in sys.argv or "--disable-autoexec" not in sys.argv:
        raise RuntimeError("새 --background --factory-startup --disable-autoexec 프로세스에서만 실행하세요.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="전체 관측 JSON의 출력 경로. 생략하면 stdout에 출력한다.")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    result = observe()
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(serialized, encoding="utf-8")
        print(f"Blender {result['blenderVersion']} / {result['buildHash']}: {len(result['cases'])}개 관측 완료")
    else:
        print(serialized)


if __name__ == "__main__":
    main()
