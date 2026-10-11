"""축소 전 이음매 정점 합치기(`decimate_garment.weld_seam_vertices`) 시험 — bpy 필요(메시를 코드로 만든다).

실행: <venv>/bin/python -I tools/blender/character_kit/tests/test_decimate_weld.py   (저장소 루트에서)
"""

import os
import sys
import unittest

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from character_kit.decimate_garment import weld_seam_vertices  # noqa: E402

CUBE_CORNERS = [(x, y, z) for x in (-1.0, 1.0) for y in (-1.0, 1.0) for z in (-1.0, 1.0)]
CUBE_FACES = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]


def split_cube():
    """면마다 정점을 따로 가진 큐브(UV 섬이 면마다 나뉜 의상 원본처럼 이음매가 전부 열려 있다). 면마다 다른 UV를 준다."""
    verts, faces = [], []
    for face in CUBE_FACES:
        base = len(verts)
        verts += [CUBE_CORNERS[i] for i in face]
        faces.append((base, base + 1, base + 2, base + 3))
    mesh = bpy.data.meshes.new("split_cube")
    mesh.from_pydata(verts, [], faces)
    uv = mesh.uv_layers.new(name="UVMap")
    for f, poly in enumerate(mesh.polygons):
        for k, loop in enumerate(poly.loop_indices):
            uv.data[loop].uv = (f / 6.0 + 0.01 * k, 0.5)
    obj = bpy.data.objects.new("split_cube", mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def boundary_edge_count(obj) -> int:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    count = sum(1 for e in bm.edges if e.is_boundary)
    bm.free()
    return count


class WeldSeamVerticesTest(unittest.TestCase):
    def test_merges_split_vertices_and_closes_the_mesh(self) -> None:
        obj = split_cube()
        self.assertEqual(len(obj.data.vertices), 24)
        self.assertEqual(boundary_edge_count(obj), 24)  # 합치기 전에는 모든 변이 열려 있다
        merged = weld_seam_vertices(obj)
        self.assertEqual(merged, 16)
        self.assertEqual(len(obj.data.vertices), 8)
        self.assertEqual(boundary_edge_count(obj), 0)

    def test_keeps_per_corner_uvs_so_uv_islands_survive(self) -> None:
        obj = split_cube()
        before = sorted(tuple(round(c, 5) for c in obj.data.uv_layers.active.data[i].uv) for i in range(len(obj.data.loops)))
        weld_seam_vertices(obj)
        after = sorted(tuple(round(c, 5) for c in obj.data.uv_layers.active.data[i].uv) for i in range(len(obj.data.loops)))
        self.assertEqual(before, after)

    def test_leaves_distant_vertices_alone(self) -> None:
        mesh = bpy.data.meshes.new("two_triangles")
        mesh.from_pydata([(0, 0, 0), (1, 0, 0), (0, 1, 0), (0.001, 0, 0), (1, 0, 0.001), (0, 1, 0.001)], [], [(0, 1, 2), (3, 4, 5)])
        obj = bpy.data.objects.new("two_triangles", mesh)
        bpy.context.collection.objects.link(obj)
        self.assertEqual(weld_seam_vertices(obj), 0)  # 1 mm 떨어진 정점은 같은 자리가 아니다(허용 오차 0.01 mm)
        self.assertEqual(len(obj.data.vertices), 6)


if __name__ == "__main__":
    unittest.main()
