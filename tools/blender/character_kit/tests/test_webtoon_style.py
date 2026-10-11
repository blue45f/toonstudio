"""`webtoon_style`(웹툰풍 얼굴·몸 스타일)의 순수 부분 단위 시험 — 합성 지표만 쓴다, 외부 에셋 없음.

실행: python -I tools/blender/character_kit/tests/test_webtoon_style.py   (저장소 루트에서, bpy가 있는 파이썬)
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from character_kit import webtoon_style as ws


def synthetic_landmarks() -> ws.Landmarks:
    seam = np.array([[x, 1.34, 0.0] for x in np.linspace(-0.05, 0.05, 5)])  # 목 이음매는 멀리 아래에 둔다(마스크 1)
    return ws.Landmarks(
        eye_l=np.array([0.033, 1.5325, 0.121]),
        eye_r=np.array([-0.033, 1.5325, 0.121]),
        nose_tip=np.array([0.0, 1.4663, 0.155]),
        mouth=np.array([0.0, 1.4561, 0.098]),
        chin=np.array([0.0, 1.4118, 0.091]),
        seam=seam,
        crown_y=1.6394,
    )


class StyleCatalogTest(unittest.TestCase):
    def test_catalog_has_girl_and_boy_with_sane_values(self) -> None:
        for style_id in ("webtoon-girl", "webtoon-boy"):
            style = ws.STYLES[style_id]
            self.assertEqual(style.id, style_id)
            self.assertIn(style.lash_style, ("strands", "liner"))
            self.assertTrue(style.layout is None or (0.0 < style.layout[0] < style.layout[1] < 1.0))
            self.assertTrue(0.8 <= style.head_scale <= 1.0)
            self.assertGreater(style.iris_radius_m, 0.006)
        self.assertEqual(ws.STYLES["webtoon-boy"].source_hbm, "female")

    def test_override_json_replaces_fields_and_unknown_fields_stop(self) -> None:
        style = ws.resolve_style("webtoon-girl", '{"head_scale": 0.85, "layout": [0.5, 0.8]}')
        self.assertEqual(style.head_scale, 0.85)
        self.assertEqual(style.layout, (0.5, 0.8))
        with self.assertRaises(SystemExit):
            ws.resolve_style("webtoon-girl", '{"nope": 1}')

    def test_head_moving_body_keys_are_rejected_before_touching_the_context(self) -> None:
        style = ws.resolve_style("webtoon-girl", '{"neutral_body": [["legLength", 0.3]]}')
        with self.assertRaises(ValueError):
            ws.shape_context_body(None, style)  # type: ignore[arg-type]


class StripAndLayoutTest(unittest.TestCase):
    def test_thin_strip_narrows_the_band_but_keeps_the_arc(self) -> None:
        x = np.linspace(0.0, 0.05, 40)
        arch = 1.55 + 0.004 * np.sin(np.pi * x / 0.05)
        top = np.stack([x, arch + 0.003, np.zeros_like(x)], axis=1)
        bottom = np.stack([x, arch - 0.003, np.zeros_like(x)], axis=1)
        strip = np.concatenate([top, bottom])
        thin = ws.thin_strip(strip, 0.5)
        self.assertAlmostEqual(float((thin[:40, 1] - thin[40:, 1]).mean()), 0.003, places=4)  # 두께가 절반
        self.assertLess(float(np.abs(thin[:40, 1] + thin[40:, 1] - strip[:40, 1] - strip[40:, 1]).max()), 0.001)  # 중심선(아치)은 구간 평균 오차(0.5 mm) 안에서 그대로

    def test_layout_warp_puts_eyes_and_mouth_at_the_requested_fractions_and_keeps_crown_and_chin(self) -> None:
        marks = synthetic_landmarks()
        style = ws.resolve_style("webtoon-girl", '{"layout": [0.54, 0.86]}')
        field = ws.StyleField(marks, style)
        height = marks.crown_y - marks.chin[1]
        eye_y = 0.5 * (marks.eye_l[1] + marks.eye_r[1])
        moved = field._layout(np.array([[0.0, eye_y, 0.1], [0.0, marks.mouth[1], 0.1], [0.0, marks.crown_y, 0.0], [0.0, marks.chin[1], 0.1]]), marks.crown_y)
        self.assertAlmostEqual((marks.crown_y - moved[0, 1]) / height, 0.54, places=6)
        self.assertAlmostEqual((marks.crown_y - moved[1, 1]) / height, 0.86, places=6)
        self.assertAlmostEqual(float(moved[2, 1]), marks.crown_y, places=9)
        self.assertAlmostEqual(float(moved[3, 1]), float(marks.chin[1]), places=9)

    def test_layout_is_a_no_op_when_not_requested(self) -> None:
        marks = synthetic_landmarks()
        field = ws.StyleField(marks, ws.resolve_style("webtoon-girl", '{"layout": null}'))
        points = np.array([[0.0, 1.5, 0.1], [0.02, 1.45, 0.09]])
        self.assertTrue(np.array_equal(field._layout(points, marks.crown_y), points))


def bumpy_sphere(radius: float = 0.1, rings: int = 24, segments: int = 36, bump: float = 0.006, seed: int = 3):
    """무작위 요철(±bump)이 있는 UV 구체: (정점, 삼각형, 방사 방향 단위 벡터)."""
    rng = np.random.default_rng(seed)
    directions = [np.array([0.0, 1.0, 0.0])]
    for ring in range(1, rings):
        theta = np.pi * ring / rings
        for seg in range(segments):
            phi = 2.0 * np.pi * seg / segments
            directions.append(np.array([np.sin(theta) * np.cos(phi), np.cos(theta), np.sin(theta) * np.sin(phi)]))
    directions.append(np.array([0.0, -1.0, 0.0]))
    radial = np.array(directions)
    triangles = [(0, 1 + (seg + 1) % segments, 1 + seg) for seg in range(segments)]
    for ring in range(rings - 2):
        base = 1 + ring * segments
        for seg in range(segments):
            a, b = base + seg, base + (seg + 1) % segments
            c, d = a + segments, b + segments
            triangles += [(a, b, c), (b, d, c)]
    last = len(radial) - 1
    base = 1 + (rings - 2) * segments
    triangles += [(last, base + seg, base + (seg + 1) % segments) for seg in range(segments)]
    positions = radial * (radius + rng.uniform(-bump, bump, len(radial)))[:, None]
    return positions, np.array(triangles, dtype=np.int64), radial


class FaceNormalSoftenTest(unittest.TestCase):
    def setUp(self) -> None:
        self.positions, self.triangles, self.radial = bumpy_sphere()
        self.normals = ws.vertex_normals(self.positions, self.triangles)

    def test_full_strength_turns_bumpy_normals_toward_the_overall_shape(self) -> None:
        before = float(np.einsum("ij,ij->i", self.normals, self.radial).mean())
        out = ws.softened_face_normals(self.positions, self.triangles, self.normals, np.ones(len(self.positions)), 1.0, 60)
        after = float(np.einsum("ij,ij->i", out, self.radial).mean())
        self.assertGreater(after, before)
        self.assertGreater(after, 0.97)
        np.testing.assert_allclose(np.linalg.norm(out, axis=1), 1.0, atol=1e-9)

    def test_zero_strength_vertices_keep_their_normals(self) -> None:
        strength = np.zeros(len(self.positions))
        strength[: len(strength) // 2] = 1.0
        out = ws.softened_face_normals(self.positions, self.triangles, self.normals, strength, 1.0, 60)
        np.testing.assert_allclose(out[strength == 0.0], self.normals[strength == 0.0], atol=1e-12)
        self.assertFalse(np.allclose(out[strength == 1.0], self.normals[strength == 1.0]))

    def test_amount_zero_or_no_iterations_is_identity(self) -> None:
        ones = np.ones(len(self.positions))
        self.assertIs(ws.softened_face_normals(self.positions, self.triangles, self.normals, ones, 0.0, 60), self.normals)
        self.assertIs(ws.softened_face_normals(self.positions, self.triangles, self.normals, ones, 1.0, 0), self.normals)

    def test_amount_blends_between_original_and_smoothed(self) -> None:
        ones = np.ones(len(self.positions))
        half = ws.softened_face_normals(self.positions, self.triangles, self.normals, ones, 0.5, 60)
        full = ws.softened_face_normals(self.positions, self.triangles, self.normals, ones, 1.0, 60)
        expected = 0.5 * self.normals + 0.5 * full
        expected /= np.linalg.norm(expected, axis=1, keepdims=True)
        np.testing.assert_allclose(half, expected, atol=1e-9)

    def test_style_defaults_enable_softening_within_range(self) -> None:
        for style_id in ("webtoon-girl", "webtoon-boy"):
            style = ws.STYLES[style_id]
            self.assertTrue(0.0 < style.face_normal_soften <= 1.0)
            self.assertGreater(style.face_normal_iterations, 0)


class NeckLiftTest(unittest.TestCase):
    def style(self) -> ws.LookStyle:
        return ws.resolve_style("webtoon-girl", '{"neck_lift": 0.03}')

    def points(self, rows) -> np.ndarray:
        return np.array(rows, dtype=np.float64)

    def test_nothing_below_the_range_everything_above_the_head_line(self) -> None:
        style = self.style()
        out = ws.neck_lift_offset(self.points([[0.0, 1.10, 0.0], [0.0, 1.29, 0.0], [0.0, 1.45, 0.0], [0.0, 1.62, 0.05]]), style)
        np.testing.assert_allclose(out[:2], 0.0, atol=1e-12)
        np.testing.assert_allclose(out[2:], 0.03, atol=1e-12)

    def test_shoulders_and_arms_do_not_rise_but_the_neck_column_does(self) -> None:
        style = self.style()
        out = ws.neck_lift_offset(self.points([[0.0, 1.38, 0.0], [0.045, 1.38, 0.0], [0.12, 1.38, 0.0], [0.5, 1.32, 0.0]]), style)
        self.assertAlmostEqual(float(out[0]), 0.03, places=6)  # 목 중심
        self.assertAlmostEqual(float(out[1]), 0.03, places=6)  # 목 기둥 반폭 안쪽
        self.assertAlmostEqual(float(out[2]), 0.0, places=6)  # 어깨 판
        self.assertAlmostEqual(float(out[3]), 0.0, places=6)  # 팔

    def test_ears_and_jaw_angle_rise_with_the_head_regardless_of_x(self) -> None:
        style = self.style()
        out = ws.neck_lift_offset(self.points([[0.09, 1.50, 0.0], [0.075, 1.46, 0.0], [-0.09, 1.50, 0.0]]), style)
        np.testing.assert_allclose(out, 0.03, atol=1e-12)

    def test_symmetric_in_x_and_monotone_in_height(self) -> None:
        style = self.style()
        heights = np.linspace(1.25, 1.45, 41)
        left = ws.neck_lift_offset(np.column_stack([np.full(41, 0.03), heights, np.zeros(41)]), style)
        right = ws.neck_lift_offset(np.column_stack([np.full(41, -0.03), heights, np.zeros(41)]), style)
        np.testing.assert_allclose(left, right, atol=1e-12)
        self.assertTrue(np.all(np.diff(left) >= -1e-12))

    def test_lift_build_moves_meshes_both_poses_and_joints_by_the_same_vector(self) -> None:
        from types import SimpleNamespace

        style = self.style()
        positions = self.points([[0.0, 1.55, 0.0], [0.3, 1.0, 0.0]])
        apose = positions + np.array([[0.0, 0.0, 0.0], [0.0, -0.2, 0.0]])  # 팔은 A-포즈에서 내려간다
        prim = SimpleNamespace(positions=positions.copy(), apose=apose.copy())
        joints_t = self.points([[0.0, 1.55, 0.0], [0.0, 1.0, 0.0]])
        ctx = SimpleNamespace(rig=SimpleNamespace(t_pose=joints_t.copy(), a_pose=joints_t.copy()))
        build = SimpleNamespace(ctx=ctx, meshes=[SimpleNamespace(prims=[prim])])
        ws.lift_build(build, style)
        np.testing.assert_allclose(prim.positions[:, 1] - positions[:, 1], [0.03, 0.0], atol=1e-12)
        np.testing.assert_allclose(prim.apose[:, 1] - apose[:, 1], [0.03, 0.0], atol=1e-12)  # A-포즈도 같은 변위
        np.testing.assert_allclose(ctx.rig.t_pose[:, 1] - joints_t[:, 1], [0.03, 0.0], atol=1e-12)
        np.testing.assert_allclose(ctx.rig.a_pose[:, 1] - joints_t[:, 1], [0.03, 0.0], atol=1e-12)

    def test_style_defaults_lift_the_head(self) -> None:
        for style_id in ("webtoon-girl", "webtoon-boy"):
            self.assertTrue(0.015 <= ws.STYLES[style_id].neck_lift <= 0.04)


class BrowSnapTest(unittest.TestCase):
    def test_brow_vertices_are_resnapped_just_above_the_head_surface(self) -> None:
        from types import SimpleNamespace

        positions, triangles, radial = bumpy_sphere(radius=0.1, rings=32, segments=48, bump=0.0)
        head = SimpleNamespace(positions=positions, triangles=triangles)
        pick = np.flatnonzero((radial[:, 2] > 0.8) & (np.abs(radial[:, 0]) < 0.3))[:6]
        inside = radial[pick] * 0.098  # 피부 속에 묻힌 눈썹 정점
        outside = radial[pick] * 0.108  # 떠 있는 정점
        brows = {}
        for name, points in (("TS_Brow_L", inside), ("TS_Brow_R", outside)):
            brows[name] = SimpleNamespace(positions=points.copy(), apose=points.copy() + 0.5, triangles=np.zeros((0, 3), dtype=np.int64))
        by_name = {"TS_Head": SimpleNamespace(prims=[head]), "TS_Brow_L": SimpleNamespace(prims=[brows["TS_Brow_L"]]), "TS_Brow_R": SimpleNamespace(prims=[brows["TS_Brow_R"]])}
        ws.snap_brows_to_head(by_name)
        for name in ("TS_Brow_L", "TS_Brow_R"):
            radius = np.linalg.norm(brows[name].positions, axis=1)
            np.testing.assert_allclose(radius, 0.1 + ws.BROW_OFFSET_M, atol=4e-4)
        # A-포즈 위치는 같은 이동량을 받는다
        shift = brows["TS_Brow_L"].positions - inside
        np.testing.assert_allclose(brows["TS_Brow_L"].apose, inside + 0.5 + shift, atol=1e-12)


if __name__ == "__main__":
    unittest.main()
