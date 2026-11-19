"""공개된 구판/수정본의 기하·재질·이미지·장면 배치를 직접 비교한다."""

import json
import struct
import unittest

from refine_studio_environment_expansion_v2 import ENVIRONMENTS, digest, read_glb


def view_bytes(view, bin_chunk):
    start = view.get("byteOffset", 0)
    return bin_chunk[start:start + view["byteLength"]]


def faces(document, binary, accessor):
    obj = document["accessors"][accessor]
    words = {5121: "B", 5123: "H", 5125: "I"}[obj["componentType"]]
    raw = view_bytes(document["bufferViews"][obj["bufferView"]], binary)
    return struct.Struct("<3" + words).iter_unpack(raw)


class ExpansionRevisionTest(unittest.TestCase):
    def test_only_triangles_with_two_exactly_coincident_points_are_removed(self):
        source = ENVIRONMENTS / "expansion-v1"
        current = ENVIRONMENTS / "expansion-v2"
        rows = json.loads((current / "manifest.json").read_text())["assets"]
        total_removed = 0
        for row in rows:
            with self.subTest(model=row["fileName"]):
                original = (source / row["fileName"]).read_bytes()
                revised = (current / row["fileName"]).read_bytes()
                self.assertEqual(digest(original), row["sourceSha256"])
                self.assertEqual(digest(revised), row["sha256"])
                old, old_bin = read_glb(original)
                new, new_bin = read_glb(revised)
                for key, value in old.items():
                    if key not in {"buffers", "bufferViews", "accessors"}:
                        self.assertEqual(value, new[key], key)
                self.assertEqual(old.keys(), new.keys())
                self.assertEqual(len(old["accessors"]), len(new["accessors"]))
                self.assertEqual(len(old["bufferViews"]), len(new["bufferViews"]))
                index_views = set()
                index_accessors = set()
                removed = 0
                for mesh in old["meshes"]:
                    for primitive in mesh["primitives"]:
                        ai = primitive["indices"]
                        index_accessors.add(ai)
                        index_views.add(old["accessors"][ai]["bufferView"])
                        pos = old["accessors"][primitive["attributes"]["POSITION"]]
                        view = old["bufferViews"][pos["bufferView"]]
                        raw = view_bytes(view, old_bin)
                        vertices = [struct.unpack_from("<3f", raw, pos.get("byteOffset", 0) + n * view.get("byteStride", 12))
                                    for n in range(pos["count"])]
                        expected = []
                        for face in faces(old, old_bin, ai):
                            if len({vertices[k] for k in face}) == 3:
                                expected.append(face)
                            else:
                                removed += 1
                        self.assertEqual(expected, list(faces(new, new_bin, ai)))
                self.assertEqual(removed, row["removedTriangles"])
                total_removed += removed
                for ai, original_accessor in enumerate(old["accessors"]):
                    revised_accessor = new["accessors"][ai]
                    if ai in index_accessors:
                        self.assertEqual({**revised_accessor, "count": original_accessor["count"]}, original_accessor)
                    else:
                        self.assertEqual(original_accessor, revised_accessor)
                for vi, old_view in enumerate(old["bufferViews"]):
                    new_view = new["bufferViews"][vi]
                    if vi not in index_views:
                        self.assertEqual(view_bytes(old_view, old_bin), view_bytes(new_view, new_bin))
                        self.assertEqual({**new_view, "byteOffset": old_view.get("byteOffset", 0)},
                                         {**old_view, "byteOffset": old_view.get("byteOffset", 0)})
        self.assertEqual(total_removed, 1360)
