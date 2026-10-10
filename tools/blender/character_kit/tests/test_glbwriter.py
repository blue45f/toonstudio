"""glbwriter 왕복 시험 (표준 라이브러리 unittest).

실행: python -I tools/blender/character_kit/tests/test_glbwriter.py
GLB를 독립적으로 다시 읽어(sparse·byteStride 포함) 쓴 값과 비교한다. 최종 검증은 `verify:character-kit`이 한다.
"""

from __future__ import annotations

import io
import json
import struct
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from character_kit.glbwriter import GlbWriter, MorphTarget, Primitive  # noqa: E402

_COMPONENT_DTYPE = {5126: np.float32, 5121: np.uint8, 5123: np.uint16, 5125: np.uint32}
_TYPE_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def parse_glb(data: bytes) -> tuple[dict, bytes]:
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2 and length == len(data)
    offset = 12
    document = None
    binary = b""
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        body = data[offset + 8 : offset + 8 + chunk_length]
        assert chunk_length % 4 == 0
        if chunk_type == b"JSON":
            document = json.loads(body.decode("utf-8"))
        elif chunk_type == b"BIN\x00":
            binary = body
        offset += 8 + chunk_length
    assert document is not None
    return document, binary


def read_accessor(document: dict, binary: bytes, index: int) -> np.ndarray:
    accessor = document["accessors"][index]
    dtype = np.dtype(_COMPONENT_DTYPE[accessor["componentType"]])
    width = _TYPE_WIDTH[accessor["type"]]
    count = accessor["count"]
    result = np.zeros((count, width), dtype=dtype)
    if "bufferView" in accessor:
        view = document["bufferViews"][accessor["bufferView"]]
        start = view["byteOffset"] + accessor.get("byteOffset", 0)
        stride = view.get("byteStride", width * dtype.itemsize)
        for i in range(count):
            result[i] = np.frombuffer(binary, dtype=dtype, count=width, offset=start + i * stride)
    sparse = accessor.get("sparse")
    if sparse is not None:
        index_view = document["bufferViews"][sparse["indices"]["bufferView"]]
        index_dtype = np.dtype(_COMPONENT_DTYPE[sparse["indices"]["componentType"]])
        indices = np.frombuffer(binary, dtype=index_dtype, count=sparse["count"], offset=index_view["byteOffset"] + sparse["indices"].get("byteOffset", 0))
        value_view = document["bufferViews"][sparse["values"]["bufferView"]]
        values = np.frombuffer(binary, dtype=dtype, count=sparse["count"] * width, offset=value_view["byteOffset"] + sparse["values"].get("byteOffset", 0)).reshape(-1, width)
        result[indices.astype(np.int64)] = values
    return result


def tiny_png() -> bytes:
    from PIL import Image  # noqa: PLC0415

    buffer = io.BytesIO()
    Image.new("RGBA", (4, 4), (200, 100, 50, 255)).save(buffer, format="PNG")
    return buffer.getvalue()


class GlbWriterTest(unittest.TestCase):
    def build(self) -> tuple[bytes, dict]:
        writer = GlbWriter()
        names = ["root", "child", "leaf"]
        parents = {"root": None, "child": "root", "leaf": "child"}
        world = np.array([[0.0, 1.0, 0.0], [0.0, 1.5, 0.1], [0.2, 1.5, 0.1]], dtype=np.float64)
        writer.add_skeleton(names, parents, world)
        texture = writer.add_texture(tiny_png(), "image/png")
        material = writer.add_material("ts_test", base_color_texture=texture, alpha_mode="MASK", alpha_cutoff=0.5, double_sided=True)
        positions = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0.5, 0.5, 1]], dtype=np.float32)
        dense = np.full((5, 3), 0.01, dtype=np.float32)
        local = np.zeros((5, 3), dtype=np.float32)
        local[1] = (0.0, 0.5, 0.0)
        local[3] = (0.25, 0.0, -0.5)
        primitive = Primitive(
            positions=positions,
            indices=np.array([[0, 1, 2], [0, 2, 3], [0, 3, 4]], dtype=np.uint32),
            normals=np.tile(np.array([[0, 0, 1]], dtype=np.float32), (5, 1)),
            uvs=np.array([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]], dtype=np.float32),
            joints=np.array([[0, 1, 0, 0]] * 5, dtype=np.uint8),
            weights=np.array([[0.75, 0.25, 0, 0]] * 5, dtype=np.float32),
            region=np.array([0, 1, 2, 3, 15], dtype=np.uint8),
            material=material,
            targets=[MorphTarget("param:height:+", dense), MorphTarget("facs:jawOpen", local), MorphTarget("facs:empty", np.zeros((5, 3), dtype=np.float32))],
        )
        writer.add_mesh_node("TS_Test", [primitive])
        return writer.to_bytes(), {"positions": positions, "dense": dense, "local": local}

    def test_structure_and_roundtrip(self) -> None:
        data, expected = self.build()
        document, binary = parse_glb(data)
        self.assertEqual(document["asset"]["version"], "2.0")
        nodes = document["nodes"]
        names = [node["name"] for node in nodes]
        self.assertEqual(names[:4], ["Armature", "root", "child", "leaf"])
        self.assertEqual(nodes[1]["translation"], [0.0, 1.0, 0.0])  # 루트 joint는 Armature(원점) 기준
        self.assertNotIn("rotation", nodes[1])
        self.assertEqual(nodes[2]["translation"], [0.0, 0.5, 0.1])
        self.assertAlmostEqual(nodes[3]["translation"][0], 0.2, places=6)
        self.assertEqual(document["skins"][0]["joints"], [1, 2, 3])
        ibm = read_accessor(document, binary, document["skins"][0]["inverseBindMatrices"])
        self.assertEqual(ibm.shape, (3, 16))
        np.testing.assert_allclose(ibm[1][12:15], [0.0, -1.5, -0.1], atol=1e-6)
        self.assertEqual(document["scenes"][0]["nodes"], [0, 4])
        mesh = document["meshes"][0]
        self.assertEqual(mesh["extras"]["targetNames"], ["param:height:+", "facs:jawOpen", "facs:empty"])
        prim = mesh["primitives"][0]
        np.testing.assert_allclose(read_accessor(document, binary, prim["attributes"]["POSITION"]), expected["positions"])
        np.testing.assert_array_equal(read_accessor(document, binary, prim["attributes"]["_REGION"])[:, 0], [0, 1, 2, 3, 15])
        np.testing.assert_allclose(read_accessor(document, binary, prim["attributes"]["WEIGHTS_0"]).sum(axis=1), 1.0)
        np.testing.assert_array_equal(read_accessor(document, binary, prim["indices"])[:, 0], [0, 1, 2, 0, 2, 3, 0, 3, 4])
        dense_accessor = document["accessors"][prim["targets"][0]["POSITION"]]
        self.assertNotIn("sparse", dense_accessor)
        sparse_accessor = document["accessors"][prim["targets"][1]["POSITION"]]
        self.assertIn("sparse", sparse_accessor)
        self.assertEqual(sparse_accessor["sparse"]["count"], 2)
        empty_accessor = document["accessors"][prim["targets"][2]["POSITION"]]
        self.assertNotIn("bufferView", empty_accessor)
        self.assertNotIn("sparse", empty_accessor)
        np.testing.assert_allclose(read_accessor(document, binary, prim["targets"][0]["POSITION"]), expected["dense"])
        np.testing.assert_allclose(read_accessor(document, binary, prim["targets"][1]["POSITION"]), expected["local"])
        np.testing.assert_allclose(sparse_accessor["max"], [0.25, 0.5, 0.0])
        material = document["materials"][prim["material"]]
        self.assertEqual(material["alphaMode"], "MASK")
        self.assertTrue(material["doubleSided"])
        image = document["images"][0]
        view = document["bufferViews"][image["bufferView"]]
        self.assertEqual(binary[view["byteOffset"] : view["byteOffset"] + 8], b"\x89PNG\r\n\x1a\n")

    def test_region_uses_four_byte_stride(self) -> None:
        data, _ = self.build()
        document, _ = parse_glb(data)
        prim = document["meshes"][0]["primitives"][0]
        accessor = document["accessors"][prim["attributes"]["_REGION"]]
        self.assertEqual(accessor["componentType"], 5121)
        self.assertEqual(document["bufferViews"][accessor["bufferView"]]["byteStride"], 4)

    def test_mismatched_targets_rejected(self) -> None:
        writer = GlbWriter()
        writer.add_skeleton(["root"], {"root": None}, np.zeros((1, 3)))
        base = dict(
            positions=np.zeros((3, 3), dtype=np.float32),
            indices=np.array([[0, 1, 2]], dtype=np.uint32),
            joints=np.zeros((3, 4), dtype=np.uint8),
            weights=np.array([[1, 0, 0, 0]] * 3, dtype=np.float32),
        )
        first = Primitive(**base, targets=[MorphTarget("a", np.zeros((3, 3), dtype=np.float32))])
        second = Primitive(**base, targets=[MorphTarget("b", np.zeros((3, 3), dtype=np.float32))])
        with self.assertRaises(ValueError):
            writer.add_mesh_node("Bad", [first, second])


if __name__ == "__main__":
    unittest.main()
