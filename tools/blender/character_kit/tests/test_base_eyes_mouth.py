"""`eyes_mouth`의 단위 시험 — 홍채 덮개·캐치라이트 지오메트리와 눈 깜빡임 눈꺼풀 모델 (합성 입력만 쓴다).

실행: python -I tools/blender/character_kit/tests/test_base_eyes_mouth.py   (bpy가 있는 파이썬; Surface가 mathutils를 쓴다)
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

try:
    import bpy  # noqa: F401

    HAS_BPY = True
except ImportError:  # pragma: no cover
    HAS_BPY = False

if HAS_BPY:
    from character_kit import eyes_mouth as em
    from character_kit.surface import Surface

EYE_RADIUS = 0.0117
EYE_CENTER = np.array([0.0329, 1.5325, 0.1212])


def uv_sphere(radius: float, center: np.ndarray, rings: int = 24, segments: int = 48) -> tuple[np.ndarray, np.ndarray]:
    """+Z가 극인 UV 구(바깥쪽 법선, 반시계)."""
    positions = [center + np.array([0.0, 0.0, radius])]
    for ring in range(1, rings):
        theta = np.pi * ring / rings
        for segment in range(segments):
            phi = 2.0 * np.pi * segment / segments
            positions.append(center + radius * np.array([np.sin(theta) * np.cos(phi), np.sin(theta) * np.sin(phi), np.cos(theta)]))
    positions.append(center - np.array([0.0, 0.0, radius]))
    triangles = []
    for segment in range(segments):
        triangles.append([0, 1 + segment, 1 + (segment + 1) % segments])
    for ring in range(rings - 2):
        for segment in range(segments):
            a = 1 + ring * segments + segment
            b = 1 + ring * segments + (segment + 1) % segments
            c = a + segments
            d = b + segments
            triangles.append([a, c, b])
            triangles.append([b, c, d])
    last = len(positions) - 1
    for segment in range(segments):
        triangles.append([last, 1 + (rings - 2) * segments + (segment + 1) % segments, 1 + (rings - 2) * segments + segment])
    return np.array(positions), np.array(triangles, dtype=np.int64)


def make_eye(side: str = "L") -> "em.EyeGeometry":
    sign = 1.0 if side == "L" else -1.0
    center = EYE_CENTER * np.array([sign, 1.0, 1.0])
    positions, triangles = uv_sphere(EYE_RADIUS, center)
    return em.EyeGeometry(side=side, positions=positions, triangles=triangles, center=center, radius=EYE_RADIUS, joint=7, surface=Surface(positions, triangles))


@unittest.skipUnless(HAS_BPY, "mathutils가 필요합니다")
class IrisGeometryTest(unittest.TestCase):
    def test_iris_cap_hugs_the_cornea_and_is_skinned_to_the_eye_joint(self) -> None:
        eye = make_eye("L")
        prim = em.iris_cap(eye, rings=5, segments=24)
        self.assertEqual(len(prim.positions), 1 + 5 * 24)
        self.assertEqual(len(prim.triangles), 24 + 4 * 24 * 2)
        distance = np.linalg.norm(prim.positions - eye.center, axis=1)
        self.assertTrue(np.all(distance > EYE_RADIUS * 0.985 + 0.0003 * 0.9))
        self.assertTrue(np.all(distance < EYE_RADIUS * 1.0 + 0.0003 + 0.0006))
        self.assertAlmostEqual(float(prim.positions[0, 2] - eye.center[2]), EYE_RADIUS + 0.0003, delta=1e-4)  # 중심 정점 = 앞쪽 극
        a, b, c = (prim.positions[prim.triangles[:, k]] for k in range(3))
        outward = np.einsum("ij,ij->i", np.cross(b - a, c - a), (a + b + c) / 3.0 - eye.center)
        self.assertTrue(np.all(outward > 0.0))  # 바깥에서 볼 때 앞면
        self.assertTrue(np.all(prim.joints[:, 0] == eye.joint))
        np.testing.assert_allclose(prim.weights[:, 0], 1.0)
        self.assertTrue(0.0 <= float(prim.uv.min()) and float(prim.uv.max()) <= 1.0)
        planar = np.linalg.norm(prim.positions[:, :2] - eye.center[:2], axis=1).max()
        self.assertAlmostEqual(float(planar), 0.0060, delta=0.0004)  # 반지름 6 mm 홍채

    def test_highlight_disc_sits_upper_left_on_the_iris(self) -> None:
        eye = make_eye("R")
        prim = em.highlight_disc(eye)
        self.assertEqual(len(prim.positions), 17)
        centroid = prim.positions[0]
        self.assertLess(float(centroid[0] - eye.center[0]), 0.0)  # 관찰자 기준 왼쪽
        self.assertGreater(float(centroid[1] - eye.center[1]), 0.0)  # 위쪽
        self.assertLess(float(np.linalg.norm(prim.positions[:, :2] - eye.center[:2], axis=1).max()), 0.0060)  # 홍채 안
        self.assertTrue(np.all(prim.joints[:, 0] == eye.joint))
        np.testing.assert_allclose(prim.uv, 0.5)  # 단색 텍스처라 UV는 한 점이다


def almond_loop(side: str, margin_radius: float = 0.0103) -> tuple[np.ndarray, np.ndarray]:
    """눈 중심을 둘러싼 구면 위의 아몬드 모양 눈꺼풀 가장자리 루프(두 눈초리는 구의 옆 적도)와 눈 중심."""
    sign = 1.0 if side == "L" else -1.0
    center = EYE_CENTER * np.array([sign, 1.0, 1.0])
    lon = np.radians(np.linspace(-85.0, 85.0, 21))
    shape = np.cos(lon * 90.0 / 85.0)  # 눈초리에서 0
    points = []
    for latitude in (np.radians(45.0) * shape, -np.radians(40.0) * shape):
        arc = np.stack([np.sin(lon) * np.cos(latitude), np.sin(latitude), np.cos(lon) * np.cos(latitude)], axis=1)
        points.append(center + margin_radius * arc * np.array([sign, 1.0, 1.0]))
    return np.concatenate(points), center


@unittest.skipUnless(HAS_BPY, "mathutils가 필요합니다")
class BlinkModelTest(unittest.TestCase):
    def setUp(self) -> None:
        points, center = almond_loop("L")
        self.model = em.lid_model_from_loop(points, center, "L")
        self.center = center

    def test_canthal_axis_runs_between_the_two_corners(self) -> None:
        self.assertAlmostEqual(self.model.length, 2.0 * 0.0103 * np.sin(np.radians(85.0)), delta=2e-4)
        self.assertGreater(float(self.model.up[1]), 0.99)  # 위쪽 기저
        self.assertGreater(float(self.model.forward[2]), 0.99)

    def test_closing_brings_the_two_margins_together(self) -> None:
        upper, lower = self.model.upper_line, self.model.lower_line
        closed_upper = upper + em.blink_delta(self.model, upper)
        closed_lower = lower + em.blink_delta(self.model, lower)
        gap = np.sqrt(((closed_upper[:, None, :] - closed_lower[None, :, :]) ** 2).sum(axis=2)).min(axis=1)
        open_gap = np.sqrt(((upper[:, None, :] - lower[None, :, :]) ** 2).sum(axis=2)).min(axis=1)
        along = em._axis_coordinates(self.model.inner, self.model.axis, self.model.forward, self.model.up, upper)[0] / self.model.length  # noqa: SLF001
        center_part = (along > 0.30) & (along < 0.70)
        self.assertGreater(int(center_part.sum()), 10)
        self.assertLess(float(gap[center_part].max()), 0.0005)  # 눈초리 사이 가운데 40 %는 0.5 mm 미만으로 맞닿는다
        self.assertLess(float(gap.mean()), 0.25 * float(open_gap.mean()))  # 눈초리 쪽은 창 가중 때문에 덜 닫혀도 전체로는 크게 줄어든다
        self.assertGreater(float(open_gap.max()), 0.012)  # 열린 눈은 1 cm 넘게 벌어져 있다

    def test_upper_lid_moves_down_and_lower_lid_moves_up_in_the_middle(self) -> None:
        middle = len(self.model.upper_line) // 2
        down = em.blink_delta(self.model, self.model.upper_line[middle : middle + 1])[0]
        up = em.blink_delta(self.model, self.model.lower_line[middle : middle + 1])[0]
        self.assertLess(float(down[1]), -0.004)
        self.assertGreater(float(up[1]), 0.0005)
        self.assertGreater(abs(float(down[1])), abs(float(up[1])))  # 윗눈꺼풀이 대부분을 내려온다

    def test_far_points_other_eye_and_outside_the_corners_do_not_move(self) -> None:
        eye = self.center
        far = np.array([eye + [0.0, 0.070, 0.02], eye + [0.0, -0.050, 0.02], eye + [0.0, 0.0, -0.05]])
        np.testing.assert_array_equal(em.blink_delta(self.model, far), 0.0)
        other_eye = np.array([[-0.0329, 1.5325 + 0.009, 0.130], [0.0, 1.54, 0.14]])  # 반대쪽 눈 윗눈꺼풀·정중선
        np.testing.assert_array_equal(em.blink_delta(self.model, other_eye), 0.0)
        beyond_outer = np.array([eye + [0.030, 0.004, 0.0]])  # 바깥 눈초리 밖 3 cm
        np.testing.assert_array_equal(em.blink_delta(self.model, beyond_outer), 0.0)

    def test_brow_height_skin_drops_a_little_but_the_margin_edge_gets_no_brow_term(self) -> None:
        middle = len(self.model.upper_line) // 2
        margin = self.model.upper_line[middle]
        brow_point = margin + np.array([0.0, 0.018, 0.0])  # 가장자리에서 18 mm 위(눈썹 높이)
        drop = float(em.blink_delta(self.model, brow_point[None])[0, 1])
        self.assertTrue(-em.BLINK_BROW_DROP * 1.05 < drop < -0.0003, drop)

    def test_delta_is_a_pure_function_of_position(self) -> None:
        rng = np.random.default_rng(2)
        points = self.center + rng.uniform(-0.02, 0.02, size=(50, 3))
        once = em.blink_delta(self.model, points)
        shuffled = rng.permutation(len(points))
        np.testing.assert_allclose(em.blink_delta(self.model, points[shuffled]), once[shuffled], atol=1e-12)  # 순서·이음매 중복에 영향받지 않는다
        np.testing.assert_allclose(em.blink_delta(self.model, np.concatenate([points, points]))[len(points) :], once, atol=1e-12)

    def test_lid_skin_does_not_sink_into_the_eyeball(self) -> None:
        # 눈꺼풀 가장자리 위쪽 피부(구면보다 1.5 mm 바깥) 점들이 닫히며 눈 중심에 더 가까워지지 않는다
        points, center = almond_loop("L", margin_radius=0.0103 + 0.0015)
        before = np.linalg.norm(points - center, axis=1)
        after = np.linalg.norm(points + em.blink_delta(self.model, points) - center, axis=1)
        self.assertGreater(float(after.min()), 0.0103)  # 눈꺼풀 가장자리 반지름(10.3 mm) 안으로 파고들지 않는다
        self.assertGreater(float(after.min()), 0.85 * float(before.min()))

    def test_wide_raises_the_upper_lid_and_lowers_the_lower_lid_less(self) -> None:
        middle = len(self.model.upper_line) // 2
        up = em.wide_delta(self.model, self.model.upper_line[middle : middle + 1])[0]
        down = em.wide_delta(self.model, self.model.lower_line[middle : middle + 1])[0]
        self.assertGreater(float(up[1]), 0.0015)  # 윗눈꺼풀 가장자리가 위로 걷힌다
        self.assertLess(float(down[1]), 0.0)
        self.assertLess(abs(float(down[1])), 0.5 * abs(float(up[1])))
        far = self.center + np.array([[0.0, 0.07, 0.02], [0.0, -0.05, 0.02]])
        np.testing.assert_array_equal(em.wide_delta(self.model, far), 0.0)

    def test_squint_is_a_fraction_of_the_blink_closing(self) -> None:
        line = self.model.upper_line
        blink = em.blink_delta(self.model, line)
        squint = em.squint_delta(self.model, line)
        strong = np.abs(blink[:, 1]) > 0.002
        self.assertGreater(int(strong.sum()), 10)
        ratio = squint[strong, 1] / blink[strong, 1]
        self.assertTrue(np.all((ratio > 0.2) & (ratio < 0.4)), ratio)  # 닫힘의 30 %
        lower = self.model.lower_line
        self.assertGreater(float(em.squint_delta(self.model, lower)[:, 1].max()), 0.0003)  # 아랫눈꺼풀이 올라온다

    def test_eye_protection_keeps_the_eye_opening_and_everything_below_still(self) -> None:
        right_points, right_center = almond_loop("R")
        models = {"L": self.model, "R": em.lid_model_from_loop(right_points, right_center, "R")}
        middle = len(self.model.upper_line) // 2
        margin = self.model.upper_line[middle]
        probes = np.array(
            [
                margin,  # 윗눈꺼풀 가장자리
                self.center + [0.0, -0.020, 0.02],  # 눈 아래(뺨)
                self.center + [0.0, -0.002, 0.02],  # 눈 중심 높이
                margin + [0.0, 0.030, 0.0],  # 눈썹 높이
                self.center + [0.0, 0.050, 0.02],  # 이마
            ]
        )
        weight = em.eye_protection_weight(models, probes)
        self.assertEqual(float(weight[0]), 0.0)
        self.assertEqual(float(weight[1]), 0.0)
        self.assertLess(float(weight[2]), 0.01)
        self.assertGreater(float(weight[3]), 0.99)
        self.assertGreater(float(weight[4]), 0.99)
        self.assertTrue(np.all((weight >= 0.0) & (weight <= 1.0)))

    def test_right_eye_mirrors_the_left_eye(self) -> None:
        points, center = almond_loop("R")
        right = em.lid_model_from_loop(points, center, "R")
        left_delta = em.blink_delta(self.model, self.model.upper_line)
        right_delta = em.blink_delta(right, right.upper_line)
        np.testing.assert_allclose(right_delta[:, 1], left_delta[:, 1], atol=3e-4)  # 위아래 이동은 같다
        self.assertGreater(float(np.abs(right.upper_line[:, 0]).min()), 0.0)
        self.assertLess(float(right.upper_line[:, 0].max()), 0.0)  # 오른눈은 x < 0


if __name__ == "__main__":
    unittest.main()
