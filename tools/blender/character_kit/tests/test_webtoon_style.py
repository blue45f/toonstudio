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


if __name__ == "__main__":
    unittest.main()
