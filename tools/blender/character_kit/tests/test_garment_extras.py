"""의상 형상 보정(`garment_extras`)의 순수 기하 단위 시험 — 합성 셸, 외부 에셋·bpy 없음.

실행: <venv>/bin/python -I tools/blender/character_kit/tests/test_garment_extras.py   (저장소 루트에서)
"""

import math
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from character_kit import garment_extras as ex  # noqa: E402


class FlatShell:
    """아래로 쏜 광선은 y = `top` 평면, 앞으로 쏜 광선은 z = `back_z` 평면에 닿는 합성 표면(`Surface.ray`와 같은 호출 규약)."""

    def __init__(self, top: float = 1.38, back_z: float = -0.10) -> None:
        self.top, self.back_z = top, back_z

    def ray(self, origins, directions, max_distance=1.0e3):
        origins = np.asarray(origins, dtype=np.float64)
        directions = np.asarray(directions, dtype=np.float64)
        hits = origins.copy()
        triangle = np.full(len(origins), -1, dtype=np.int64)
        for i, (o, d) in enumerate(zip(origins, directions, strict=True)):
            if d[1] < -0.5 and o[1] > self.top:
                hits[i, 1], triangle[i] = self.top, 0
            elif d[2] > 0.5 and o[2] < self.back_z:
                hits[i, 2], triangle[i] = self.back_z, 0
        return hits, triangle


def cylinder_shell(radius: float = 0.14, bottom: float = 0.70, top: float = 1.20, rings: int = 26, segments: int = 36, v_tip: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """닫힌 원통(밑면 마개 포함). `v_tip`(m)만큼 앞·뒤 중앙(각도 0, π) 정점의 맨 아래 고리를 더 내려 V자 밑단을 흉내 낸다."""
    ys = np.linspace(bottom, top, rings)
    angles = np.linspace(0.0, 2.0 * math.pi, segments, endpoint=False)
    positions = []
    for r, y in enumerate(ys):
        for a in angles:
            drop = v_tip * max(0.0, math.cos(2.0 * a)) ** 4 * (1.0 if r == 0 else 0.0)
            positions.append([radius * math.sin(a), y - drop, radius * math.cos(a)])
    triangles = []
    for r in range(rings - 1):
        for s in range(segments):
            a, b = r * segments + s, r * segments + (s + 1) % segments
            c, d = (r + 1) * segments + s, (r + 1) * segments + (s + 1) % segments
            triangles += [[a, b, d], [a, d, c]]
    return np.array(positions), np.array(triangles, dtype=np.int64)


class TrimHemTest(unittest.TestCase):
    def test_cuts_the_v_shaped_tips_at_the_side_height(self) -> None:
        positions, triangles = cylinder_shell(v_tip=0.12)
        self.assertLess(float(positions[:, 1].min()), 0.70 - 0.10)  # 앞뒤 끝이 12 cm 처져 있다
        keep, out, report = ex.trim_hem(positions, triangles, percentile=55.0)
        self.assertTrue(report["trimmed"])
        kept_vertices = np.unique(triangles[keep])
        # 자른 뒤에는 보존된 정점 모두가 옆면 높이(0.70) 이상 — V자 끝이 사라지고 밑단이 수평이다
        self.assertGreaterEqual(float(out[kept_vertices, 1].min()), 0.70 - 1e-6)
        self.assertLessEqual(float(out[kept_vertices, 1].min()), 0.70 + 0.05)
        self.assertGreater(int((~keep).sum()), 0)
        self.assertLess(int((~keep).sum()), len(triangles) // 4)  # 몸통 대부분은 그대로

    def test_flat_hem_is_left_nearly_untouched(self) -> None:
        positions, triangles = cylinder_shell(v_tip=0.0)
        keep, _, _ = ex.trim_hem(positions, triangles, percentile=55.0)
        self.assertGreater(int(keep.sum()), int(0.97 * len(triangles)))

    def test_ignores_sleeves_and_returns_untouched_for_tiny_meshes(self) -> None:
        positions = np.random.default_rng(0).uniform(0.5, 1.0, (30, 3))
        triangles = np.array([[0, 1, 2], [3, 4, 5]])
        keep, out, report = ex.trim_hem(positions, triangles)
        self.assertTrue(keep.all())
        np.testing.assert_array_equal(out, positions)
        self.assertFalse(report["trimmed"])


class TrimSleeveEndsTest(unittest.TestCase):
    def tube_along_x(self, x0: float, x1: float, sign: float = 1.0):
        """x축 방향 소매 원통(반지름 4 cm). 몸통 쪽 x0에서 끝 x1까지."""
        xs = np.linspace(x0, x1, 21) * sign
        angles = np.linspace(0.0, 2.0 * math.pi, 12, endpoint=False)
        positions = np.array([[x, 1.35 + 0.04 * math.sin(a), 0.04 * math.cos(a)] for x in xs for a in angles])
        triangles = []
        for r in range(20):
            for s_ in range(12):
                a, b = r * 12 + s_, r * 12 + (s_ + 1) % 12
                c, d = (r + 1) * 12 + s_, (r + 1) * 12 + (s_ + 1) % 12
                triangles += [[a, b, d], [a, d, c]]
        return positions, np.array(triangles, dtype=np.int64)

    def test_cuts_the_fabric_beyond_the_wrist_plane_on_both_sides(self) -> None:
        right, tri_r = self.tube_along_x(0.25, 0.80, +1.0)
        left, tri_l = self.tube_along_x(0.25, 0.80, -1.0)
        positions = np.concatenate([right, left])
        triangles = np.concatenate([tri_r, tri_l + len(right)])
        ends = [(np.array([0.62, 1.35, 0.0]), np.array([1.0, 0.0, 0.0])), (np.array([-0.62, 1.35, 0.0]), np.array([-1.0, 0.0, 0.0]))]
        keep, out, report = ex.trim_sleeve_ends(positions, triangles, ends)
        self.assertTrue(report["trimmed"])
        kept_vertices = np.unique(triangles[keep])
        self.assertLessEqual(float(np.abs(out[kept_vertices, 0]).max()), 0.62 + 1e-9)  # 두 팔 모두 손목 평면 안쪽
        self.assertGreater(float(np.abs(out[kept_vertices, 0]).max()), 0.60)  # 손목 앞까지는 그대로 남는다
        # 몸통 쪽(x < 0.25) 정점은 건드리지 않는다
        near_body = kept_vertices[np.abs(positions[kept_vertices, 0]) < 0.30]
        np.testing.assert_allclose(out[near_body], positions[near_body])

    def test_a_sleeve_ending_before_the_wrist_is_untouched(self) -> None:
        positions, triangles = self.tube_along_x(0.25, 0.55, +1.0)
        keep, out, report = ex.trim_sleeve_ends(positions, triangles, [(np.array([0.62, 1.35, 0.0]), np.array([1.0, 0.0, 0.0]))])
        self.assertTrue(keep.all())
        self.assertFalse(report["trimmed"])
        np.testing.assert_allclose(out, positions)


class HoodTest(unittest.TestCase):
    RING = {"major": 0.104, "minor": 0.036, "squash": 0.85, "center_z": 0.004, "scan_top": 1.60, "scan_floor": 1.15, "fallback_y": 1.38, "smooth": 2, "raise": 0.45, "lining_cos": 0.15}
    BACK = {"top_y": 1.41, "bottom_y": 1.19, "widths": [(1.41, 0.090), (1.34, 0.155), (1.26, 0.155), (1.19, 0.100)], "height": 0.070, "base": 0.005, "shape": 0.6, "grid": (24, 18)}

    def test_ring_is_a_closed_outward_torus_following_the_shell_height(self) -> None:
        positions, triangles, lining = ex.hood_ring(FlatShell(top=1.38), self.RING)
        self.assertEqual(len(positions), 44 * 12)
        self.assertEqual(len(lining), len(positions))
        # 닫힌 면: 모든 변이 정확히 두 삼각형에 속한다. 바깥 법선: 부호 있는 부피가 양수
        edges = np.sort(np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]]), axis=1)
        _, counts = np.unique(edges, axis=0, return_counts=True)
        self.assertTrue((counts == 2).all())
        a, b, c = (positions[triangles[:, k]] for k in range(3))
        self.assertGreater(float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0), 0.0)
        # 중심선은 셸 높이(1.38) 위로 `raise * minor * squash`만큼 올라 있다
        expected = 1.38 + 0.45 * 0.036 * 0.85
        self.assertAlmostEqual(float(positions[:, 1].mean()), expected, places=3)
        self.assertTrue(0 < int(lining.sum()) < len(lining))  # 안쪽 면만 안감

    def test_ring_height_is_capped_below_the_chin(self) -> None:
        capped = dict(self.RING, max_center_y=1.38)
        high_shell = FlatShell(top=1.46)  # 어깨 곡면이 높아 중심선이 턱 높이까지 솟는 경우
        free, _, _ = ex.hood_ring(high_shell, self.RING)
        positions, _, _ = ex.hood_ring(high_shell, capped)
        top_of_tube = 1.38 + 0.036 * 0.85  # 중심선 상한 + 단면 반높이
        self.assertGreater(float(free[:, 1].max()), top_of_tube + 0.02)
        self.assertLessEqual(float(positions[:, 1].max()), top_of_tube + 1e-9)

    def test_ring_falls_back_when_the_rays_miss(self) -> None:
        class Miss:
            def ray(self, origins, directions, max_distance=1.0e3):
                return np.zeros_like(origins), np.full(len(origins), -1, dtype=np.int64)

        positions, _, _ = ex.hood_ring(Miss(), self.RING)
        self.assertTrue(np.isfinite(positions).all())
        self.assertAlmostEqual(float(positions[:, 1].mean()), 1.38 + 0.45 * 0.036 * 0.85, places=3)

    def test_back_pouch_domes_behind_the_shell_with_flush_edges(self) -> None:
        positions, triangles, lining = ex.hood_back(FlatShell(back_z=-0.10), self.BACK)
        self.assertEqual(len(positions), 24 * 18)
        self.assertFalse(lining.any())
        self.assertEqual(int(triangles.max()) + 1, len(positions))
        # 가장자리는 셸에서 base(5 mm)만 떨어지고 가운데는 base + height(7 cm)까지 솟는다
        z = positions[:, 2].reshape(18, 24)
        np.testing.assert_allclose(z[0], -0.10 - 0.005, atol=1e-9)
        np.testing.assert_allclose(z[:, 0], -0.10 - 0.005, atol=1e-9)
        self.assertLess(float(z.min()), -0.10 - 0.06)
        # 바깥 법선은 뒤(-z)를 향한다
        a, b, c = (positions[triangles[:, k]] for k in range(3))
        self.assertLess(float(np.cross(b - a, c - a)[:, 2].mean()), 0.0)

    def test_hood_down_merges_both_parts(self) -> None:
        positions, triangles, lining = ex.hood_down(FlatShell(), {"ring": self.RING, "back": self.BACK})
        self.assertEqual(len(positions), 44 * 12 + 24 * 18)
        self.assertEqual(len(lining), len(positions))
        self.assertEqual(int(triangles.max()) + 1, len(positions))
        self.assertGreater(int(triangles.min()), -1)


class ExtendTailsTest(unittest.TestCase):
    SPEC = {"tie_below_top": 0.071, "stretch": 1.7, "spread": 0.04, "x_min": 0.02}

    def test_stretches_and_spreads_only_below_the_tie(self) -> None:
        head_top = 1.6465
        tie = head_top - 0.071
        points = np.array(
            [
                [0.090, 1.64, 0.0],  # 묶음 위: 그대로
                [0.090, tie, 0.0],  # 묶음 높이: 그대로
                [0.090, 1.47, 0.0],  # 꼬리 끝: 아래로 늘고 바깥으로 벌어진다
                [-0.090, 1.47, 0.0],  # 반대쪽은 대칭
                [0.010, 1.47, 0.0],  # 중심 가닥(|x| ≤ x_min)은 바깥으로 벌어지지 않는다
            ]
        )
        out = ex.extend_tails(points, head_top, self.SPEC)
        np.testing.assert_allclose(out[:2], points[:2])
        drop = tie - 1.47
        self.assertAlmostEqual(float(out[2, 1]), 1.47 - drop * 0.7, places=6)
        self.assertAlmostEqual(float(out[2, 0]), 0.090 + 0.04, places=6)
        np.testing.assert_allclose(out[3, 0], -out[2, 0])
        self.assertAlmostEqual(float(out[4, 0]), 0.010, places=9)
        self.assertLess(float(out[4, 1]), 1.47)


if __name__ == "__main__":
    unittest.main()
