"""`base_assembly`의 작은 단위 시험 (표준 라이브러리 unittest, 합성 입력만 쓴다).

실행: python -I tools/blender/character_kit/tests/test_base_assembly.py   (bpy가 있는 파이썬; 따라가기 시험이 mathutils를 쓴다)
HBM 데이터가 필요한 통합 시험은 `test_base_build.py`다.
"""

from __future__ import annotations

import json
import struct
import sys
import unittest
from pathlib import Path

import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from character_kit import base_assembly as ba
from character_kit import glbwriter, hbm

try:  # follow_deviation은 mathutils(KDTree)를 쓴다
    import bpy  # noqa: F401

    HAS_BPY = True
except ImportError:  # pragma: no cover
    HAS_BPY = False


def grid_quads(nx: int, ny: int) -> np.ndarray:
    quads = []
    for y in range(ny):
        for x in range(nx):
            a = y * (nx + 1) + x
            quads.append([a, a + 1, a + nx + 2, a + nx + 1])
    return np.array(quads, dtype=np.int64)


class SmallMathTest(unittest.TestCase):
    def test_smoothstep_is_monotonic_and_clamped(self) -> None:
        x = np.linspace(-1.0, 2.0, 61)
        y = ba.smoothstep01(0.0, 1.0, x)
        self.assertEqual(float(y[0]), 0.0)
        self.assertEqual(float(y[-1]), 1.0)
        self.assertTrue(np.all(np.diff(y) >= -1e-12))

    def test_fade_small_zeroes_the_tail_and_keeps_large_deltas(self) -> None:
        delta = np.array([[0.0, 0.0, ba.FADE_LO * 0.5], [0.0, ba.FADE_HI * 2.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.5 * (ba.FADE_LO + ba.FADE_HI)]])
        out = ba.fade_small(delta)
        np.testing.assert_array_equal(out[0], 0.0)  # 하한 아래는 정확히 0(sparse accessor가 먹힌다)
        np.testing.assert_array_equal(out[1], delta[1])  # 상한 위는 그대로
        self.assertTrue(0.0 < np.linalg.norm(out[3]) < np.linalg.norm(delta[3]))  # 사이는 부드럽게 줄어든다

    def test_dense_weights_and_top4_round_trip(self) -> None:
        indices = np.array([[0, 2, 5, 7], [1, 0, 0, 0]], dtype=np.uint8)
        values = np.array([[0.4, 0.3, 0.2, 0.1], [1.0, 0.0, 0.0, 0.0]], dtype=np.float32)
        dense = ba.dense_weights(indices, values, 10)
        self.assertEqual(dense.shape, (2, 10))
        np.testing.assert_allclose(dense.sum(axis=1), 1.0, atol=1e-6)
        new_indices, new_values = ba.top4(dense)
        np.testing.assert_allclose(np.sort(new_values[0])[::-1], [0.4, 0.3, 0.2, 0.1], atol=1e-6)
        self.assertEqual(set(new_indices[0].tolist()), {0, 2, 5, 7})

    def test_dijkstra_distances_and_nearest_source(self) -> None:
        # 사슬 0-1-2-3-4, 간선 길이 1·2·3·4
        edge_a = np.array([0, 1, 2, 3])
        edge_b = np.array([1, 2, 3, 4])
        lengths = np.array([1.0, 2.0, 3.0, 4.0])
        dist = ba.dijkstra(5, edge_a, edge_b, lengths, np.array([0]))
        np.testing.assert_allclose(dist, [0, 1, 3, 6, 10])
        dist, nearest = ba.dijkstra_nearest(5, edge_a, edge_b, lengths, np.array([0, 4]))
        np.testing.assert_allclose(dist, [0, 1, 3, 4, 0])
        self.assertEqual(nearest.tolist(), [0, 0, 0, 4, 4])
        unreachable = ba.dijkstra(6, edge_a, edge_b, lengths, np.array([0]))  # 정점 5는 간선이 없다
        self.assertTrue(np.isinf(unreachable[5]))

    def test_opened_faces_removes_a_thin_protrusion_but_keeps_the_bulk(self) -> None:
        nx = ny = 8
        quads = grid_quads(nx, ny)
        adjacency = ba.face_corner_adjacency(quads)
        face = lambda x, y: y * nx + x  # noqa: E731
        bulk = {face(x, y) for x in range(1, 6) for y in range(1, 6)}
        protrusion = {face(6, 3), face(7, 3)}  # 너비 1면짜리 돌기(탭)
        members = np.array(sorted(bulk | protrusion))
        opened = set(ba.opened_faces(members, adjacency, radius=1).tolist())
        self.assertTrue(protrusion.isdisjoint(opened))
        self.assertTrue(face(3, 3) in opened and face(2, 2) in opened)
        self.assertTrue(opened <= (bulk | protrusion))  # 원래 집합 밖으로 번지지 않는다
        # 너무 작아서 열기로 사라지는 집합은 원래대로 돌려준다
        tiny = np.array([face(0, 0), face(1, 0)])
        np.testing.assert_array_equal(ba.opened_faces(tiny, adjacency, radius=1), tiny)

    def test_smooth_shell_grid_reduces_noise_and_keeps_the_seam_closed(self) -> None:
        rows, columns = 6, 96
        angles = np.linspace(0.0, 2.0 * np.pi, columns, endpoint=False)
        base = np.stack([np.cos(angles), np.zeros(columns), np.sin(angles)], axis=1)
        grid = np.concatenate([base[:, None, :] + np.array([0.0, row * 0.1, 0.0]) for row in range(rows)], axis=1).transpose(1, 0, 2)
        grid = np.concatenate([grid, grid[:, :1]], axis=1)  # 마지막 열 = 첫 열 복제
        rng = np.random.default_rng(1)
        noisy = grid + rng.normal(scale=0.01, size=grid.shape)
        noisy[:, columns] = noisy[:, 0]
        out = ba.smooth_shell_grid(noisy.reshape(-1, 3), rows, columns).reshape(rows, columns + 1, 3)
        np.testing.assert_allclose(out[:, columns], out[:, 0], atol=1e-12)

        def roughness(points: np.ndarray) -> float:  # 열 방향 2차 차분
            return float(np.abs(points[:, :-2] - 2.0 * points[:, 1:-1] + points[:, 2:]).mean())

        self.assertLess(roughness(out), 0.5 * roughness(noisy))


class EnsureMinDeltaTest(unittest.TestCase):
    def test_zero_param_delta_gets_a_signed_floor_on_one_vertex_and_is_reported(self) -> None:
        points = np.array([[0.03, 1.5, 0.1], [-0.05, 1.5, 0.1], [0.01, 1.5, 0.1]])
        applied: list[str] = []
        plus = ba.ensure_min_delta(np.zeros((3, 3)), "param:faceShape:+", points, applied, "TS_Iris_L")
        minus = ba.ensure_min_delta(np.zeros((3, 3)), "param:faceShape:-", points, applied, "TS_Iris_L")
        self.assertEqual(int((np.linalg.norm(plus, axis=1) > 0).sum()), 1)  # 한 정점에만(sparse가 유지된다)
        self.assertAlmostEqual(float(plus[1, 0]), -ba.MIN_PARAM_DELTA_M)  # 정중선에서 가장 먼 정점, 바깥쪽 방향
        np.testing.assert_allclose(minus, -plus)  # +와 −가 같지 않게(V9 "± 같음" 오류 방지)
        self.assertGreaterEqual(float(np.linalg.norm(plus, axis=1).max()), 1.0e-5)  # V9 하한(1e-5 m)을 넘는다
        self.assertEqual(applied, ["TS_Iris_L:param:faceShape:+", "TS_Iris_L:param:faceShape:-"])

    def test_nonzero_and_non_param_deltas_are_untouched(self) -> None:
        points = np.zeros((2, 3))
        applied: list[str] = []
        real = np.full((2, 3), 0.002)
        np.testing.assert_array_equal(ba.ensure_min_delta(real, "param:waist:+", points, applied, "x"), real)
        np.testing.assert_array_equal(ba.ensure_min_delta(np.zeros((2, 3)), "facs:jawOpen", points, applied, "x"), np.zeros((2, 3)))
        self.assertEqual(applied, [])


def read_accessor(document: dict, binary: bytes, index: int) -> np.ndarray:
    """glTF accessor를 독립적으로 읽는다(정규화 SHORT·sparse·byteStride 포함, 값은 float64로 정규화해 돌려준다)."""
    accessor = document["accessors"][index]
    component = {5126: np.float32, 5122: np.int16, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32}[accessor["componentType"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    count = accessor["count"]
    itemsize = np.dtype(component).itemsize
    out = np.zeros((count, width), dtype=np.float64)
    if "bufferView" in accessor:
        view = document["bufferViews"][accessor["bufferView"]]
        stride = view.get("byteStride", itemsize * width)
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        for row in range(count):
            out[row] = np.frombuffer(binary, dtype=component, count=width, offset=start + row * stride)
    if "sparse" in accessor:
        sparse = accessor["sparse"]
        index_view = document["bufferViews"][sparse["indices"]["bufferView"]]
        value_view = document["bufferViews"][sparse["values"]["bufferView"]]
        index_dtype = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32}[sparse["indices"]["componentType"]]
        indices = np.frombuffer(binary, dtype=index_dtype, count=sparse["count"], offset=index_view.get("byteOffset", 0))
        values = np.frombuffer(binary, dtype=component, count=sparse["count"] * width, offset=value_view.get("byteOffset", 0)).reshape(-1, width)
        out[indices] = values
    if accessor.get("normalized"):
        info = np.iinfo(component)
        out = np.maximum(out / float(info.max), -1.0)
    return out


def split_glb(data: bytes) -> tuple[dict, bytes]:
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2 and length == len(data)
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + json_length].decode("utf-8"))
    bin_offset = 20 + json_length
    bin_length = struct.unpack_from("<I", data, bin_offset)[0]
    return document, data[bin_offset + 8 : bin_offset + 8 + bin_length]


class QuantizedWriterTest(unittest.TestCase):
    def test_morph_targets_round_trip_dense_and_sparse(self) -> None:
        rng = np.random.default_rng(7)
        count = 40
        positions = rng.uniform(-1, 1, size=(count, 3)).astype(np.float32)
        dense = rng.uniform(-0.05, 0.05, size=(count, 3))
        sparse = np.zeros((count, 3))
        sparse[[3, 17, 29]] = rng.uniform(-0.08, 0.08, size=(3, 3))
        zero = np.zeros((count, 3))
        writer = ba.QuantizedGlbWriter()
        writer.add_skeleton(["a", "b"], {"a": None, "b": "a"}, np.array([[0, 0, 0], [0, 1, 0]], dtype=np.float64))
        prim = glbwriter.Primitive(
            positions=positions,
            indices=np.array([[0, 1, 2]], dtype=np.uint32),
            normals=np.tile([0.0, 1.0, 0.0], (count, 1)).astype(np.float32),
            uvs=np.zeros((count, 2), dtype=np.float32),
            joints=np.zeros((count, 4), dtype=np.uint8),
            weights=np.tile([1.0, 0.0, 0.0, 0.0], (count, 1)).astype(np.float32),
            targets=[glbwriter.MorphTarget("dense", dense), glbwriter.MorphTarget("sparse", sparse), glbwriter.MorphTarget("zero", zero)],
        )
        writer.add_mesh_node("TS_Test", [prim])
        document, binary = split_glb(writer.to_bytes())
        self.assertIn("KHR_mesh_quantization", document["extensionsUsed"])
        self.assertIn("KHR_mesh_quantization", document["extensionsRequired"])
        targets = document["meshes"][0]["primitives"][0]["targets"]
        for target, expected in zip(targets, (dense, sparse, zero), strict=True):
            accessor = document["accessors"][target["POSITION"]]
            self.assertEqual(accessor["componentType"], 5122)
            self.assertTrue(accessor["normalized"])
            np.testing.assert_allclose(read_accessor(document, binary, target["POSITION"]), expected, atol=1.0 / ba.QUANT_SCALE)
        self.assertIn("sparse", document["accessors"][targets[1]["POSITION"]])  # 0이 아닌 정점이 적으면 sparse
        self.assertNotIn("sparse", document["accessors"][targets[0]["POSITION"]])
        dense_view = document["bufferViews"][document["accessors"][targets[0]["POSITION"]]["bufferView"]]
        self.assertEqual(dense_view["byteStride"], 8)  # VEC3 SHORT(6바이트)를 4바이트 경계에 맞춘다

    def test_values_beyond_range_are_clamped_not_wrapped(self) -> None:
        writer = ba.QuantizedGlbWriter()
        index = writer.add_morph_accessor(np.array([[2.0, -2.0, 0.5]]))
        document = writer._json  # noqa: SLF001 — 작성기 내부 JSON을 직접 읽는다
        self.assertEqual(document["accessors"][index]["count"], 1)


@unittest.skipUnless(HAS_BPY, "mathutils가 필요합니다")
class FollowAndSeamTest(unittest.TestCase):
    def test_follow_deviation_uses_the_nearest_reference_vertex(self) -> None:
        reference = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]])
        reference_targets = {"param:waist:+": np.array([[0.0, 0.01, 0.0], [0.0, 0.03, 0.0]])}
        subject = np.array([[0.01, 0.0, 0.0], [0.99, 0.0, 0.0], [5.0, 5.0, 5.0]])  # 마지막은 반경(6 cm) 밖
        subject_targets = {"param:waist:+": np.array([[0.0, 0.012, 0.0], [0.0, 0.03, 0.0], [0.0, 9.0, 0.0]])}
        result = ba.follow_deviation(subject, subject_targets, reference, reference_targets)
        self.assertEqual(result["matched"], 2)
        self.assertEqual(result["unmatched"], 1)
        self.assertAlmostEqual(result["perTarget"]["param:waist:+"]["statistic"], 0.002, places=6)
        self.assertEqual(result["worst"]["name"], "param:waist:+")

    def test_seam_mismatch_pairs_coincident_vertices(self) -> None:
        first = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]])
        second = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, 0.0], [9.0, 9.0, 9.0]])
        first_targets = {"a": np.array([[0.0, 0.1, 0.0], [0.0, 0.2, 0.0]]), "only_first": np.zeros((2, 3))}
        second_targets = {"a": np.array([[0.0, 0.2, 0.0], [0.0, 0.1, 0.0], [0.0, 0.0, 0.0]])}
        result = ba.seam_mismatch(first, first_targets, second, second_targets)
        self.assertEqual(result["pairs"], 2)
        self.assertEqual(result["shared"], ["a"])
        self.assertAlmostEqual(result["maxDelta"], 0.0)
        second_targets["a"][0, 1] = 0.25  # 이음매 한 쌍을 어긋나게
        self.assertAlmostEqual(ba.seam_mismatch(first, first_targets, second, second_targets)["maxDelta"], 0.05, places=6)


class VertexRegionTriangleTest(unittest.TestCase):
    def test_every_triangle_of_a_region_range_keeps_one_vertex_of_that_region(self) -> None:
        # 한 쿼드(영역 1)의 모서리 하나만 영역 1이면 대각선이 그 모서리를 안 지나는 삼각형이 영역 정점을 못 갖는다 → 삼각형 단위로 고친다
        quads = np.array([[0, 1, 2, 3], [1, 4, 5, 2], [4, 6, 7, 5]])
        face_region = np.array([1, 0, 0])
        positions = np.array([[0, 0, 0], [1, 0, 0], [1.2, 1, 0], [0, 1.4, 0], [2, 0, 0], [2, 1, 0], [3, 0, 0], [3, 1, 0]], dtype=np.float64)
        result = ba.vertex_regions(quads, face_region, len(positions), 2, positions=positions)
        triangles = ba.quads_to_triangles(positions, quads)
        triangle_region = np.repeat(face_region, 2)
        self.assertTrue((result[triangles] == triangle_region[:, None]).any(axis=1).all())


if __name__ == "__main__":
    unittest.main()
