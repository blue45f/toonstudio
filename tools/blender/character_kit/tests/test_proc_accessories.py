"""절차 생성 소품(`proc_accessories`)의 순수 기하 단위 시험 — 합성 랜드마크, 외부 에셋·bpy 없음.

실행: <venv>/bin/python -I tools/blender/character_kit/tests/test_proc_accessories.py   (저장소 루트에서)
"""

import os
import sys
import unittest
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from character_kit import proc_accessories as pa  # noqa: E402


def signed_volume(positions: np.ndarray, triangles: np.ndarray) -> float:
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


def edge_counts(triangles: np.ndarray) -> dict:
    counts: dict = {}
    for a, b, c in triangles.tolist():
        for u, v in ((a, b), (b, c), (c, a)):
            key = (min(u, v), max(u, v))
            counts[key] = counts.get(key, 0) + 1
    return counts


def fake_landmarks() -> SimpleNamespace:
    """눈 중심 (±0.032, 1.53, 0.07), 각막 앞 z 0.082, 귀 윗·아랫점 — 베이스와 비슷한 크기의 합성값."""
    eyes = {side: {"center": np.array([sign * 0.032, 1.53, 0.07]), "front_z": 0.082} for side, sign in (("L", 1.0), ("R", -1.0))}
    ear = {
        side: {"top": np.array([sign * 0.078, 1.54, -0.005]), "bottom": np.array([sign * 0.076, 1.49, -0.004]), "outer_x": sign * 0.082, "mean_z": -0.005}
        for side, sign in (("L", 1.0), ("R", -1.0))
    }
    return SimpleNamespace(eyes=eyes, ear=ear)


class ShapeHelpersTest(unittest.TestCase):
    def test_open_tube_is_watertight_with_end_caps(self) -> None:
        path = np.stack([np.linspace(0.0, 0.1, 10), np.zeros(10), np.zeros(10)], axis=1)
        positions, triangles = pa.tube(path, 0.002, segments=6)
        self.assertEqual(len(positions), 10 * 6 + 2)  # 고리 10개 + 양 끝 마개 중심 2개
        self.assertTrue(all(count == 2 for count in edge_counts(triangles).values()))

    def test_closed_tube_is_watertight(self) -> None:
        loop = pa.superellipse(np.zeros(3), 0.03, 0.02, count=32)
        positions, triangles = pa.tube(loop, 0.0013, segments=8, closed=True)
        self.assertEqual(len(positions), 32 * 8)
        self.assertTrue(all(count == 2 for count in edge_counts(triangles).values()))

    def test_sphere_vertices_lie_on_radius_and_mesh_is_watertight(self) -> None:
        center = np.array([0.1, 0.2, 0.3])
        positions, triangles = pa.sphere(center, 0.004)
        self.assertTrue(np.allclose(np.linalg.norm(positions - center, axis=1), 0.004))
        self.assertTrue(all(count == 2 for count in edge_counts(triangles).values()))

    def test_superellipse_extents(self) -> None:
        loop = pa.superellipse(np.array([1.0, 2.0, 3.0]), 0.03, 0.02, count=64)
        self.assertAlmostEqual(float(loop[:, 0].max() - loop[:, 0].min()), 0.06, places=6)
        self.assertAlmostEqual(float(loop[:, 1].max() - loop[:, 1].min()), 0.04, places=6)
        self.assertTrue(np.allclose(loop[:, 2], 3.0))

    def test_merge_offsets_indices(self) -> None:
        a = (np.zeros((3, 3)), np.array([[0, 1, 2]]))
        b = (np.ones((3, 3)), np.array([[0, 1, 2]]))
        positions, triangles = pa.merge([a, b])
        self.assertEqual(len(positions), 6)
        self.assertEqual(triangles.tolist(), [[0, 1, 2], [3, 4, 5]])


class OrientOutwardTest(unittest.TestCase):
    def test_flips_inside_out_component_only(self) -> None:
        good = pa.sphere(np.array([0.0, 0.0, 0.0]), 0.01)
        inverted_positions, inverted_triangles = pa.sphere(np.array([1.0, 0.0, 0.0]), 0.01)
        merged = pa.merge([good, (inverted_positions, inverted_triangles[:, [0, 2, 1]])])
        self.assertLess(signed_volume(merged[0][len(good[0]) :], merged[1][len(good[1]) :] - len(good[0])), 0.0)  # 두 번째 조각은 안쪽을 보고 있다
        positions, triangles = pa.orient_outward(merged)
        first = triangles[: len(good[1])]
        second = triangles[len(good[1]) :]
        self.assertGreater(signed_volume(positions, first), 0.0)
        self.assertGreater(signed_volume(positions, second), 0.0)
        np.testing.assert_array_equal(first, good[1])  # 이미 바깥을 보던 조각은 그대로다

    def test_tube_pieces_all_face_outward(self) -> None:
        loop = pa.superellipse(np.zeros(3), 0.03, 0.02, count=32)
        positions, triangles = pa.orient_outward(pa.tube(loop, 0.0013, segments=8, closed=True))
        self.assertGreater(signed_volume(positions, triangles), 0.0)


class BuilderTest(unittest.TestCase):
    def test_glasses_span_both_eyes_in_front_of_the_cornea(self) -> None:
        lm = fake_landmarks()
        positions, triangles = pa.build_glasses(lm)
        self.assertTrue(np.isfinite(positions).all())
        self.assertEqual(int(triangles.max()) + 1, len(positions))
        # 렌즈 테는 각막 앞 11 mm 평면(z 0.093)에 있고, 코 브리지는 그보다 최대 3 mm 앞으로 휜다. 다리는 귀 쪽(뒤)으로 뻗는다
        self.assertGreaterEqual(float(positions[:, 2].max()), 0.082 + 0.011 + 0.0013 - 1e-6)
        self.assertLessEqual(float(positions[:, 2].max()), 0.082 + 0.011 + 0.0013 + 0.0035)
        self.assertLess(float(positions[:, 2].min()), 0.0)
        # 두 눈을 모두 덮는다: 눈 중심 x ±0.032에서 렌즈 반폭 26.5 mm + 굵기
        self.assertGreater(float(positions[:, 0].max()), 0.032 + 0.0265)
        self.assertLess(float(positions[:, 0].min()), -0.032 - 0.0265)
        # 좌우 대칭
        np.testing.assert_allclose(positions[:, 0].max(), -positions[:, 0].min(), atol=0.003)

    def test_earrings_hang_below_each_ear_lobe_symmetrically(self) -> None:
        lm = fake_landmarks()
        positions, triangles = pa.build_earrings(lm)
        self.assertEqual(int(triangles.max()) + 1, len(positions))
        left = positions[positions[:, 0] > 0]
        right = positions[positions[:, 0] < 0]
        self.assertEqual(len(left), len(right))
        # 스터드는 귓볼 높이에서 시작하고 방울은 그보다 아래에 매달린다
        self.assertAlmostEqual(float(left[:, 1].max()), 1.49 + 0.0006 + 0.0028, places=3)
        self.assertLess(float(left[:, 1].min()), 1.49 - 0.015)
        np.testing.assert_allclose(sorted(left[:, 1]), sorted(right[:, 1]), atol=1e-9)

    def test_builders_registered_without_choker(self) -> None:
        self.assertEqual(sorted(pa.BUILDERS), ["earrings", "glasses"])  # 초커는 목 구조상 보류(모듈 docstring)


if __name__ == "__main__":
    unittest.main()
