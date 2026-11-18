"""Blender 5.3에서 UV·웨이트·코너 노멀과 열린 천 경계를 감면 전에 검증한다."""

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shaper_mesh_seams import remove_decimation_wires, weld_kit_seams


def make_mesh(*, weight_change=False, same_winding=False, duplicate_face=False):
    coords = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 0, 0), (0, 0, 0),
              (0, 1, 0) if duplicate_face else (0, -1, 0.35)]
    mesh = bpy.data.meshes.new("시험 메시")
    mesh.from_pydata(coords, [], [(0, 1, 2), (4, 3, 5) if same_winding else (3, 4, 5)])
    obj = bpy.data.objects.new("시험 옷감", mesh)
    bpy.context.scene.collection.objects.link(obj)
    group = obj.vertex_groups.new(name="Hips")
    group.add(list(range(6)), 1, "REPLACE")
    if weight_change:
        group.add([3], 0.25, "REPLACE")
    uv = mesh.uv_layers.new()
    for i, corner in enumerate(uv.data):
        corner.uv = (i * 0.1, 0.5)
    for face in mesh.polygons:
        face.use_smooth = True
    mesh.normals_split_custom_set([(0, 0, 1)] * 3 + [(0, 0.6, 0.8)] * 3)
    mesh.update()
    return obj


def corner_data(obj):
    mesh = obj.data
    return {
        (tuple(mesh.vertices[corner.vertex_index].co), tuple(mesh.uv_layers.active.data[corner.index].uv)): (
            tuple((g.group, g.weight) for g in mesh.vertices[corner.vertex_index].groups),
            mesh.corner_normals[corner.index].vector.copy(),
        )
        for corner in mesh.loops
    }


def verify():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cloth = make_mesh()
    before = corner_data(cloth)
    assert weld_kit_seams(cloth) == 2
    assert len(cloth.data.vertices) == 4 and len(cloth.data.polygons) == 2
    assert len(cloth.data.edges) == 5
    after = corner_data(cloth)
    assert before.keys() == after.keys()
    for key, (weights, normal) in before.items():
        assert weights == after[key][0]
        assert (normal - after[key][1]).length < 2 * math.sin(math.radians(0.01) / 2)
    assert weld_kit_seams(cloth) == 0
    for options in ({"weight_change": True}, {"same_winding": True}, {"duplicate_face": True}):
        source = make_mesh(**options)
        assert weld_kit_seams(source) == 0
        assert len(source.data.vertices) == 6
    morph = make_mesh()
    morph.shape_key_add(name="Basis")
    morph.shape_key_add(name="눈 깜빡임")
    assert weld_kit_seams(morph) == 0 and len(morph.data.vertices) == 6

    mesh = bpy.data.meshes.new("감면 후 남은 선")
    mesh.from_pydata([(0, 0, 0), (1, 0, 0), (0, 1, 0), (8, 8, 8), (9, 9, 9)], [(1, 3)], [(0, 1, 2)])
    mesh.update()
    remove_decimation_wires(mesh)
    assert len(mesh.vertices) == 3 and len(mesh.edges) == 3 and len(mesh.polygons) == 1
    print("인접 변, UV, 웨이트, 노멀, 열린 경계, 표정 키, 떠 있는 선 검증 통과")


if __name__ == "__main__":
    verify()
