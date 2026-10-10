"""`base_textures`의 단위 시험 (표준 라이브러리 unittest, 합성 입력만 쓴다).

실행: python -I tools/blender/character_kit/tests/test_base_textures.py
"""

from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from character_kit import base_textures as bt


class EncodingTest(unittest.TestCase):
    def test_jpeg_is_baseline_rgb_and_decodes_to_the_same_size(self) -> None:
        image = np.random.default_rng(1).random((32, 48, 3)).astype(np.float32)
        data = bt.encode_jpeg(image, quality=92, subsampling=0)
        self.assertEqual(data[:2], b"\xff\xd8")
        decoded = Image.open(io.BytesIO(data))
        self.assertEqual(decoded.size, (48, 32))
        self.assertEqual(decoded.mode, "RGB")
        self.assertNotIn("progressive", decoded.info)  # 베이스라인 JPEG(로더 호환)

    def test_png_keeps_the_alpha_channel(self) -> None:
        rgba = np.zeros((8, 8, 4), dtype=np.float32)
        rgba[..., :3] = 0.5
        rgba[:4, :, 3] = 1.0
        decoded = Image.open(io.BytesIO(bt.encode_png_rgba(rgba)))
        self.assertEqual(decoded.mode, "RGBA")
        alpha = np.asarray(decoded)[..., 3]
        self.assertEqual(int(alpha[0, 0]), 255)
        self.assertEqual(int(alpha[-1, 0]), 0)

    def test_luminance_of_white_and_black(self) -> None:
        self.assertAlmostEqual(bt.luminance(np.ones((4, 4, 3), dtype=np.float32)), 1.0, places=5)
        self.assertAlmostEqual(bt.luminance(np.zeros((4, 4, 3), dtype=np.float32)), 0.0, places=5)


class UvPaintingTest(unittest.TestCase):
    def test_corner_colors_are_interpolated_inside_a_triangle(self) -> None:
        uv = np.array([[0.05, 0.05], [0.95, 0.05], [0.05, 0.95]], dtype=np.float32)
        triangles = np.array([[0, 1, 2]], dtype=np.int64)
        corners = np.array([[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]], dtype=np.float32)
        image = bt.paint_uv_corners(uv, triangles, corners, 64, padding=0, blur_sigma=0.0)
        near_first = image[6, 6]  # 모서리 0 근처
        middle = image[16, 16]
        self.assertGreater(float(near_first[0]), 0.8)
        self.assertTrue(0.15 < float(middle[0]) < 0.6 and 0.15 < float(middle[1]) < 0.6)
        np.testing.assert_allclose(middle.sum(), 1.0, atol=0.05)  # 무게중심 좌표는 합이 1

    def test_flat_face_colors_equal_the_same_color_at_all_corners(self) -> None:
        uv = np.array([[0.1, 0.1], [0.9, 0.1], [0.1, 0.9]], dtype=np.float32)
        triangles = np.array([[0, 1, 2]], dtype=np.int64)
        flat = bt.paint_uv_faces(uv, triangles, np.array([[0.2, 0.4, 0.6]], dtype=np.float32), 32)
        corner = bt.paint_uv_corners(uv, triangles, np.tile(np.array([[[0.2, 0.4, 0.6]]], dtype=np.float32), (1, 3, 1)), 32)
        np.testing.assert_allclose(flat, corner, atol=1e-6)

    def test_background_fills_outside_the_islands(self) -> None:
        uv = np.array([[0.1, 0.1], [0.3, 0.1], [0.1, 0.3]], dtype=np.float32)
        triangles = np.array([[0, 1, 2]], dtype=np.int64)
        image = bt.paint_uv_faces(uv, triangles, np.array([[0.0, 0.0, 0.0]], dtype=np.float32), 64, background=(1.0, 1.0, 1.0), padding=2, blur_sigma=0.0)
        np.testing.assert_allclose(image[60, 60], 1.0)
        self.assertLess(float(image[10, 10].mean()), 0.1)


class ProceduralTextureTest(unittest.TestCase):
    def test_iris_texture_is_bright_enough_for_a_multiplicative_tint(self) -> None:
        for size in (128, 256):
            image = bt.iris_texture(size)
            self.assertEqual(image.shape, (size, size, 3))
            self.assertGreaterEqual(bt.luminance(image), 0.55)  # 계약: iris recolor 평균 휘도 ≥ 0.55
            self.assertTrue(0.0 <= float(image.min()) and float(image.max()) <= 1.0)

    def test_highlight_texture_is_white_for_a_fixed_material(self) -> None:
        image = bt.highlight_texture(16)
        self.assertGreater(bt.luminance(image), 0.95)

    def test_lash_and_brow_textures_have_real_cutout_alpha(self) -> None:
        for image in (bt.lash_texture(256, 64), bt.brow_texture(256, 32)):
            self.assertEqual(image.shape[2], 4)
            alpha = image[..., 3]
            self.assertLess(float(alpha.min()), 0.05)  # 투명한 틈이 있다
            self.assertGreater(float(alpha.max()), 0.95)  # 불투명한 가닥이 있다
            coverage = float((alpha > 0.5).mean())
            self.assertTrue(0.05 < coverage < 0.95)

    def test_underwear_teeth_tongue_textures_are_small_valid_images(self) -> None:
        for image in (bt.underwear_texture(64), bt.teeth_texture(64), bt.tongue_texture(64), bt.eyeball_texture(64)):
            self.assertEqual(image.shape, (64, 64, 3))
            self.assertTrue(np.isfinite(image).all())
            self.assertTrue(0.0 <= float(image.min()) and float(image.max()) <= 1.0)


class IrisVariantTest(unittest.TestCase):
    def test_every_variant_stays_bright_enough_for_the_tint_rule_and_differs_in_shape(self) -> None:
        images = {name: bt.iris_texture(128, variant=name) for name in ("realistic", "anime", "cat", "soft")}
        for name, image in images.items():
            self.assertGreaterEqual(bt.luminance(image), 0.55, name)  # 계약: 곱셈 틴트에 안전한 평균 휘도
        center = {name: float(image[64, 64].mean()) for name, image in images.items()}
        self.assertLess(center["anime"], 0.1)  # 큰 동공은 중심이 어둡다
        self.assertLess(center["cat"], 0.1)
        dark = {name: float((image.mean(axis=2) < 0.1).mean()) for name, image in images.items()}
        self.assertLess(dark["soft"], dark["anime"])  # 부드러운 변형의 동공은 더 작다
        self.assertLess(dark["cat"], dark["anime"])  # 슬릿 동공은 둥근 큰 동공보다 어두운 면적이 작다
        slit = images["cat"][64]
        self.assertLess(float(slit[64].mean()), 0.2)  # 슬릿 중심
        self.assertGreater(float(slit[64 + 24].mean()), 0.3)  # 슬릿 옆은 홍채
        top = float(images["anime"][20:30, 54:74].mean())
        bottom = float(images["anime"][98:108, 54:74].mean())
        self.assertGreater(bottom, top)  # 위가 어둡고 아래가 밝다(윗눈꺼풀 그림자)


if __name__ == "__main__":
    unittest.main()
