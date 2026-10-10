"""의상 리타깃 코어(`garment_fit`, `garment_texture`, `retarget_garment`의 순수 부분) 단위 시험 — 합성 구체 몸, 외부 에셋 없음.

실행: <venv>/bin/python -I tools/blender/character_kit/tests/test_garment_fit.py   (저장소 루트에서)
"""

import io
import os
import sys
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from character_kit import garment_fit as gf  # noqa: E402
from character_kit.garment_texture import TextureStyle, luminance, rasterize_uv_mask, relative_color_texture  # noqa: E402
from character_kit.retarget_garment import fade_small, merge_skin_joints  # noqa: E402
from character_kit.surface import Surface  # noqa: E402


def uv_sphere(radius: float = 1.0, rings: int = 24, segments: int = 32):
    """바깥쪽이 반시계(CCW)인 UV 구체와 삼각형."""
    vertices = [(0.0, radius, 0.0)]
    for ring in range(1, rings):
        theta = np.pi * ring / rings
        for seg in range(segments):
            phi = 2 * np.pi * seg / segments
            vertices.append((radius * np.sin(theta) * np.cos(phi), radius * np.cos(theta), radius * np.sin(theta) * np.sin(phi)))
    vertices.append((0.0, -radius, 0.0))
    positions = np.array(vertices)
    triangles = []
    for seg in range(segments):
        triangles.append((0, 1 + (seg + 1) % segments, 1 + seg))
    for ring in range(rings - 2):
        base = 1 + ring * segments
        for seg in range(segments):
            a, b = base + seg, base + (seg + 1) % segments
            c, d = a + segments, b + segments
            triangles.append((a, b, c))
            triangles.append((b, d, c))
    last = len(positions) - 1
    base = 1 + (rings - 2) * segments
    for seg in range(segments):
        triangles.append((last, base + seg, base + (seg + 1) % segments))
    return positions, np.array(triangles, dtype=np.int64)


class WeldTests(unittest.TestCase):
    def test_duplicates_merge_to_one_representative(self):
        positions = np.array([[0, 0, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 0, 0]], dtype=float)
        index, canon = gf.weld_vertices(positions)
        self.assertEqual(len(canon), 3)
        self.assertEqual(index[0], index[2])
        self.assertEqual(index[1], index[4])
        self.assertNotEqual(index[0], index[1])

    def test_boundary_mask_marks_open_edges_only(self):
        positions, triangles = uv_sphere()
        self.assertFalse(gf.boundary_vertex_mask(len(positions), triangles).any())
        open_mask = gf.boundary_vertex_mask(len(positions), triangles[10:])
        self.assertTrue(open_mask.any())


class BindingTests(unittest.TestCase):
    def setUp(self):
        self.body, self.tris = uv_sphere(1.0)
        self.assertGreater(gf.mesh_signed_volume(self.body, self.tris), 0)
        self.surface = Surface(self.body, self.tris)
        rng = np.random.default_rng(7)
        direction = rng.normal(size=(200, 3))
        direction /= np.linalg.norm(direction, axis=1, keepdims=True)
        self.points = direction * rng.uniform(0.9, 1.3, size=(200, 1))

    def test_bind_then_evaluate_on_same_body_reproduces_points(self):
        binding = gf.bind(self.points, self.surface)
        again = gf.evaluate(binding, self.body, self.tris)
        self.assertLess(float(np.abs(again - self.points).max()), 1e-9)

    def test_evaluate_follows_a_uniformly_scaled_body(self):
        binding = gf.bind(self.points, self.surface)
        scaled = gf.evaluate(binding, self.body * 1.5, self.tris)
        # 표면 위 성분은 1.5배, 법선 방향 거리는 그대로 — 반지름 변화가 거의 +0.5·r_surface 이다.
        radius_before = np.linalg.norm(self.points, axis=1)
        radius_after = np.linalg.norm(scaled, axis=1)
        offset = radius_before - 1.0
        self.assertLess(float(np.abs(radius_after - (1.5 + offset)).max()), 0.03)

    def test_evaluate_follows_a_translated_body(self):
        binding = gf.bind(self.points, self.surface)
        moved = gf.evaluate(binding, self.body + np.array([0.0, 0.5, 0.0]), self.tris)
        self.assertLess(float(np.abs(moved - (self.points + np.array([0.0, 0.5, 0.0]))).max()), 1e-9)


class ConformTests(unittest.TestCase):
    def setUp(self):
        self.body, self.tris = uv_sphere(1.0)
        self.surface = Surface(self.body, self.tris)
        # 구체 모양 의상(반지름 1.0~1.4)과 이웃 간선
        self.shell, self.shell_tris = uv_sphere(1.2)
        self.edges = gf.undirected_edges(self.shell_tris)

    def test_penetrating_points_are_pushed_out_and_far_points_pulled_in(self):
        inside = self.shell * (0.9 / 1.2)  # 몸 안쪽
        out = gf.conform(inside, self.edges, None, self.surface, d_min=0.01, d_max=0.05)
        distance, _, _ = gf.signed_distance(out, self.surface)
        self.assertGreaterEqual(float(distance.min()), 0.01 - 2e-3)
        far = self.shell * (1.6 / 1.2)
        out = gf.conform(far, self.edges, None, self.surface, d_min=0.01, d_max=0.05)
        distance, _, _ = gf.signed_distance(out, self.surface)
        self.assertLess(float(distance.max()), 0.05 + 2e-2)

    def test_protected_vertices_are_not_pulled_in(self):
        far = self.shell * (1.6 / 1.2)
        protected = np.ones(len(far), dtype=bool)
        out = gf.conform(far, self.edges, protected, self.surface, d_min=0.01, d_max=0.05)
        distance, _, _ = gf.signed_distance(out, self.surface)
        self.assertGreater(float(distance.min()), 0.5)

    def test_fit_similarity_recovers_scale_and_translation(self):
        shifted = self.shell * 0.5 + np.array([0.0, 0.3, 0.0])
        scale, translation, _ = gf.fit_similarity(
            shifted, self.surface, [1.5, 2.0, 2.5], anchor_source=shifted.max(axis=0), anchor_target=self.shell.max(axis=0) + np.array([0, 0, 0]), sample=300, cap=0.5
        )
        fitted = scale * shifted + translation
        radius = np.linalg.norm(fitted, axis=1)
        self.assertLess(abs(float(radius.mean()) - 1.0), 0.35)


class SkinTests(unittest.TestCase):
    def test_transferred_skin_sums_to_one_with_at_most_four_influences(self):
        body, tris = uv_sphere(1.0)
        surface = Surface(body, tris)
        joints = np.zeros((len(body), 4), dtype=np.int64)
        weights = np.zeros((len(body), 4))
        joints[:, 0] = (body[:, 1] > 0).astype(int)
        joints[:, 1] = 2
        weights[:, 0] = 0.7
        weights[:, 1] = 0.3
        pts = np.array([[0.0, 1.05, 0.0], [0.0, -1.05, 0.0], [1.05, 0.0, 0.0]])
        binding = gf.bind(pts, surface)
        out_joints, out_weights = gf.transfer_skin(binding, tris, joints, weights)
        self.assertEqual(out_joints.shape, (3, 4))
        np.testing.assert_allclose(out_weights.sum(axis=1), 1.0, atol=1e-9)
        self.assertTrue(((out_weights > 0).sum(axis=1) <= 4).all())

    def test_merge_joints_folds_weights_into_target(self):
        names = ["a", "jaw", "head"]
        joints = np.array([[1, 2, 0, 0], [1, 0, 0, 0]])
        weights = np.array([[0.5, 0.5, 0.0, 0.0], [1.0, 0.0, 0.0, 0.0]])
        merged_joints, merged_weights = merge_skin_joints(joints, weights, names, {"jaw": "head"})
        self.assertEqual(int(merged_joints[0, 0]), 2)
        self.assertAlmostEqual(float(merged_weights[0, 0]), 1.0)
        self.assertEqual(int(merged_joints[1, 0]), 2)

    def test_fade_small_zeroes_tiny_deltas_and_keeps_large_ones(self):
        delta = np.array([[1e-6, 0, 0], [1e-2, 0, 0]])
        faded = fade_small(delta)
        self.assertEqual(float(faded[0, 0]), 0.0)
        self.assertAlmostEqual(float(faded[1, 0]), 1e-2, places=9)


class TextureTests(unittest.TestCase):
    def _image(self, color, size=256) -> bytes:
        rng = np.random.default_rng(3)
        noise = rng.integers(-20, 20, size=(size, size, 1))
        array = np.clip(np.array(color)[None, None, :] + noise, 0, 255).astype(np.uint8)
        buffer = io.BytesIO()
        Image.fromarray(array, mode="RGB").save(buffer, format="PNG")
        return buffer.getvalue()

    def test_rasterize_uv_mask_covers_triangle_interior(self):
        triangle = np.array([[[0.1, 0.1], [0.9, 0.1], [0.1, 0.9]]])
        mask = rasterize_uv_mask(triangle, 64)
        self.assertTrue(mask[10, 10])
        self.assertFalse(mask[60, 60])
        self.assertGreater(float(mask.mean()), 0.25)

    def test_relative_color_texture_is_bright_gray_jpeg_of_requested_size(self):
        uv = np.array([[[0.05, 0.05], [0.95, 0.05], [0.05, 0.95]], [[0.95, 0.05], [0.95, 0.95], [0.05, 0.95]]])
        data, stats = relative_color_texture(self._image((20, 30, 120)), uv, TextureStyle(size=256, strength=0.3))
        image = Image.open(io.BytesIO(data))
        self.assertEqual(image.format, "JPEG")
        self.assertEqual(image.size, (256, 256))
        array = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
        self.assertGreaterEqual(float(luminance(array).mean()), 0.75)
        self.assertLess(float(np.abs(array[..., 0] - array[..., 2]).max()), 0.02)  # 색이 없다(회색)
        self.assertGreaterEqual(stats["minLuminance"], 0.69)

    def test_hair_style_can_be_darker_but_not_below_its_floor(self):
        uv = np.array([[[0.05, 0.05], [0.95, 0.05], [0.05, 0.95]], [[0.95, 0.05], [0.95, 0.95], [0.05, 0.95]]])
        data, stats = relative_color_texture(self._image((60, 40, 30)), uv, TextureStyle(size=256, strength=0.45))
        self.assertGreaterEqual(stats["minLuminance"], 0.54)
        self.assertGreaterEqual(stats["meanLuminance"], 0.75)
        self.assertGreater(len(data), 100)


if __name__ == "__main__":
    unittest.main()
