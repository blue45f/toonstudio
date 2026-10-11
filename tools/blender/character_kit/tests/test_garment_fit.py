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
from character_kit.garment_texture import TextureStyle, luminance, rasterize_uv_mask, relative_color_texture, strand_texture  # noqa: E402
from character_kit.gltf_read import StaticMesh  # noqa: E402
from character_kit.retarget_garment import drop_stray_components, fade_small, merge_skin_joints, transferred_normals  # noqa: E402
from character_kit.surface import Surface, vertex_normals  # noqa: E402


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


    def test_fit_similarity_limits_keep_scale_and_anchor_inside_bounds(self):
        # 제한이 없으면 최적해가 구간 밖(몸 크기로 커지는 스케일)이지만, 제한을 주면 허용 구간 안에 머문다.
        small = self.shell * 0.5
        anchor = small.max(axis=0)
        free_scale, _, _ = gf.fit_similarity(small, self.surface, [1.0], anchor_source=anchor, anchor_target=anchor, sample=300, cap=0.5)
        self.assertGreater(free_scale, 1.3)
        scale, translation, _ = gf.fit_similarity(
            small, self.surface, [0.97, 1.0, 1.03], anchor_source=anchor, anchor_target=anchor, sample=300, cap=0.5, scale_limit=(0.97, 1.03), shift_limit=0.05
        )
        self.assertGreaterEqual(scale, 0.97 - 1e-9)
        self.assertLessEqual(scale, 1.03 + 1e-9)
        self.assertLessEqual(float(np.linalg.norm(scale * anchor + translation - anchor)), 0.05 + 1e-9)


def angled_tube(direction: np.ndarray, length: float = 0.6, start: float = 0.02, radius: float = 0.05, rings: int = 30, segments: int = 12):
    """원점(어깨)에서 `direction`으로 뻗은 소매 모양 원통의 점과 바깥 방향 법선."""
    direction = direction / np.linalg.norm(direction)
    helper = np.array([0.0, 0.0, 1.0])
    u = np.cross(direction, helper)
    u /= np.linalg.norm(u)
    v = np.cross(direction, u)
    points, normals = [], []
    for ring in range(rings + 1):
        center = direction * (start + (length - start) * ring / rings)
        for seg in range(segments):
            phi = 2 * np.pi * seg / segments
            radial = np.cos(phi) * u + np.sin(phi) * v
            points.append(center + radius * radial)
            normals.append(radial)
    return np.array(points), np.array(normals)


class StretchedFaceTests(unittest.TestCase):
    def test_bridge_triangle_that_stretches_is_torn_but_normal_deformation_is_kept(self):
        before = np.array([[0.0, 0.0, 0.0], [0.03, 0.0, 0.0], [0.0, 0.03, 0.0], [0.05, 0.0, 0.0], [0.06, 0.05, 0.0]])
        after = before.copy()
        after[3] = [0.6, 0.0, 0.0]  # 이음 꼭짓점이 팔과 함께 60 cm 멀어졌다
        after[1] = [0.045, 0.0, 0.0]  # 정상적인 늘어남(1.5배)
        triangles = np.array([[0, 1, 2], [1, 3, 4], [0, 1, 4]])
        torn = gf.stretched_faces(before, after, triangles)
        np.testing.assert_array_equal(torn, [False, True, False])

    def test_short_edges_below_the_length_floor_are_never_torn(self):
        before = np.array([[0.0, 0.0, 0.0], [0.005, 0.0, 0.0], [0.0, 0.005, 0.0]])
        after = before * 6.0  # 6배지만 3 cm뿐이다
        self.assertFalse(gf.stretched_faces(before, after, np.array([[0, 1, 2]])).any())


class RaiseBangsTests(unittest.TestCase):
    def setUp(self):
        # 정수리 1.64, 앞머리 아랫선 1.50(눈 높이), 뒷머리 아랫선 1.00
        self.points = np.array(
            [
                [0.0, 1.64, 0.05],  # 정수리
                [0.0, 1.50, 0.16],  # 앞머리 아랫선(정중앙 앞)
                [0.0, 1.57, 0.16],  # 앞머리 중간
                [0.0, 1.00, -0.08],  # 뒷머리 끝
                [0.09, 1.30, 0.00],  # 옆머리(귀 옆)
            ]
        )

    def test_front_bangs_are_raised_to_the_target_and_the_back_hair_keeps_its_length(self):
        out, report = gf.raise_bangs(self.points, 1.575, face_z=0.08)
        self.assertTrue(report["raised"])
        self.assertAlmostEqual(float(out[1, 1]), 1.575, places=3)  # 앞머리 아랫선이 목표에 닿는다
        self.assertAlmostEqual(float(out[0, 1]), 1.64, places=6)  # 정수리는 그대로
        self.assertAlmostEqual(float(out[3, 1]), 1.00, places=6)  # 뒷머리 길이는 그대로
        self.assertAlmostEqual(float(out[4, 1]), 1.30, places=6)  # 귀 뒤쪽 옆머리도 그대로(face_z 앞이 아니다)
        np.testing.assert_allclose(out[:, [0, 2]], self.points[:, [0, 2]])  # 높이만 바뀐다

    def test_bangs_already_above_the_target_or_missing_are_left_alone(self):
        out, report = gf.raise_bangs(self.points, 1.40, face_z=0.08)
        self.assertFalse(report["raised"])
        np.testing.assert_array_equal(out, self.points)
        no_front = self.points[[0, 3, 4]]
        out, report = gf.raise_bangs(no_front, 1.575, face_z=0.08)
        self.assertFalse(report["raised"])
        np.testing.assert_array_equal(out, no_front)


class SpikeTests(unittest.TestCase):
    def test_strip_attached_by_single_edges_is_removed_and_the_surface_is_kept(self):
        positions, tris = uv_sphere(1.0, rings=10, segments=12)
        sphere = tris[12:]  # 극 부채꼴을 떼어 열린 가장자리를 만든다(가장자리 삼각형도 이웃이 둘 이상이다)
        # 열린 고리의 정점 둘에서 바깥으로 뻗는 삼각형 두 개짜리 띠(가시)
        new1, new2 = len(positions), len(positions) + 1
        boundary_pair = [1, 2]  # 극 부채꼴을 뗀 열린 고리의 이웃한 두 정점
        strip = np.array([[boundary_pair[0], boundary_pair[1], new1], [boundary_pair[1], new2, new1]])
        flagged = gf.spike_faces(np.concatenate([sphere, strip]), rounds=3)
        self.assertTrue(flagged[-2:].all())
        self.assertFalse(flagged[:-2].any())

    def test_closed_surface_has_no_spikes(self):
        _, tris = uv_sphere(1.0, rings=8, segments=10)
        self.assertFalse(gf.spike_faces(tris).any())


class SmallIslandTests(unittest.TestCase):
    def test_small_disconnected_pieces_are_flagged_and_the_main_body_is_kept(self):
        positions, tris = uv_sphere(1.0, rings=12, segments=16)
        shard = np.array([[len(positions), len(positions) + 1, len(positions) + 2]])  # 떨어진 삼각형 하나
        all_tris = np.concatenate([tris, shard])
        flagged = gf.small_island_faces(all_tris, len(positions) + 3, min_faces=20)
        self.assertTrue(flagged[-1])
        self.assertFalse(flagged[:-1].any())


class SleeveAlignTests(unittest.TestCase):
    def setUp(self):
        # 몸의 팔은 수직에서 25° 벌어져 있고, 그림 속 소매는 10°만 벌어져 있다.
        self.base_axis = np.array([np.sin(np.radians(25)), -np.cos(np.radians(25)), 0.0])
        self.own_axis = np.array([np.sin(np.radians(10)), -np.cos(np.radians(10)), 0.0])
        self.joint_positions = np.array([[0.0, 0.0, 0.0], 0.3 * self.base_axis, 0.6 * self.base_axis])
        self.chains = [{"arm": 0, "forearm": 1, "hand": 2}]

    def test_sleeve_is_rotated_onto_the_arm_axis_around_the_shoulder(self):
        points, normals = angled_tube(self.own_axis)
        moved, membership, report = gf.align_sleeves_to_arms(points, normals, self.joint_positions, self.chains)
        self.assertIsNotNone(report["sides"][0]["cuff"])
        self.assertAlmostEqual(report["sides"][0]["angleDeg"], 15.0, delta=0.5)
        far = np.flatnonzero(np.linalg.norm(points, axis=1) > 0.55)
        center = moved[far].mean(axis=0)
        cos = float(center @ self.base_axis / np.linalg.norm(center))
        self.assertGreater(cos, np.cos(np.radians(1.5)))  # 소매 끝이 팔 축 위로 왔다
        near = np.flatnonzero(np.linalg.norm(points, axis=1) < 0.06)
        np.testing.assert_allclose(moved[near], points[near], atol=0.03)  # 어깨 쪽은 거의 그대로
        np.testing.assert_allclose(np.linalg.norm(moved, axis=1), np.linalg.norm(points, axis=1), atol=1e-9)  # 어깨 중심 회전이라 거리가 보존된다

    def test_wall_facing_the_sleeve_does_not_move(self):
        # 소매 옆에 붙은 몸통 옆면: 소매 축 쪽(+x)을 향하는 법선. 거리상으로는 소매 반경 안이어도 움직이지 않아야 한다.
        points, normals = angled_tube(self.own_axis)
        ys = np.linspace(-0.55, -0.15, 12)
        wall = np.array([[0.0, y, z] for y in ys for z in np.linspace(-0.05, 0.05, 5)])
        wall_normals = np.tile(np.array([[1.0, 0.0, 0.0]]), (len(wall), 1))
        all_points = np.concatenate([points, wall])
        all_normals = np.concatenate([normals, wall_normals])
        moved, membership, _ = gf.align_sleeves_to_arms(all_points, all_normals, self.joint_positions, self.chains)
        np.testing.assert_allclose(moved[len(points) :], wall, atol=1e-6)

    def test_short_sleeve_and_already_aligned_sleeve_are_left_alone(self):
        short, short_normals = angled_tube(self.own_axis, length=0.2)
        moved, membership, report = gf.align_sleeves_to_arms(short, short_normals, self.joint_positions, self.chains)
        self.assertIsNone(report["sides"][0]["cuff"])
        np.testing.assert_array_equal(moved, short)
        aligned, aligned_normals = angled_tube(self.base_axis)
        moved, membership, report = gf.align_sleeves_to_arms(aligned, aligned_normals, self.joint_positions, self.chains)
        self.assertIn("정렬", report["sides"][0]["reason"])
        np.testing.assert_array_equal(moved, aligned)


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


class HairFitHelpersTest(unittest.TestCase):
    def _hair_points(self) -> np.ndarray:
        rng = np.random.default_rng(3)
        crown = np.stack([rng.uniform(-0.08, 0.08, 400), rng.uniform(1.59, 1.64, 400), rng.uniform(0.0, 0.1, 400)], axis=1)
        fringe = np.stack([rng.uniform(-0.04, 0.04, 80), rng.uniform(1.50, 1.58, 80), rng.uniform(0.09, 0.12, 80)], axis=1)
        side_lock = np.stack([rng.uniform(0.085, 0.10, 60), rng.uniform(1.40, 1.55, 60), rng.uniform(0.08, 0.11, 60)], axis=1)
        chest_lock = np.stack([rng.uniform(-0.03, 0.03, 60), rng.uniform(1.30, 1.38, 60), rng.uniform(0.09, 0.12, 60)], axis=1)
        return np.concatenate([crown, fringe, side_lock, chest_lock])

    def test_raise_bangs_ignores_long_strands_below_the_face_window_and_keeps_side_locks_longer(self) -> None:
        points = self._hair_points()
        lifted, report = gf.raise_bangs(points, 1.574, face_z=0.05, center_half_width=0.05)
        self.assertTrue(report["raised"])
        # 가슴 앞으로 흘러내린 가닥(1.30~1.38)은 앞머리 후보가 아니므로 앞머리 길이 비율이 80 %로 줄지 않는다
        self.assertGreater(report["lengthScale"], 0.3)
        fringe = slice(400, 480)
        side = slice(480, 540)
        self.assertGreaterEqual(float(lifted[fringe, 1].min()), 1.57 - 1e-6)  # 앞머리 아랫선이 목표 높이까지 올라간다
        side_drop = float(np.mean(points[side, 1] - lifted[side, 1]))
        fringe_rise = float(np.mean(lifted[fringe, 1] - points[fringe, 1]))
        self.assertLess(abs(side_drop), fringe_rise)  # 옆머리는 앞머리보다 덜 줄어든다(측면 감쇠)

    def test_raise_bangs_leaves_hair_alone_when_the_fringe_is_already_high(self) -> None:
        points = self._hair_points()
        points[400:480, 1] += 0.1
        lifted, report = gf.raise_bangs(points, 1.574, face_z=0.05)
        self.assertFalse(report["raised"])
        self.assertTrue(np.array_equal(lifted, points))

    def test_strand_texture_is_a_bright_gray_jpeg_with_vertical_streaks(self) -> None:
        uv = np.array([[[0.02, 0.02], [0.98, 0.02], [0.02, 0.98]], [[0.98, 0.02], [0.98, 0.98], [0.02, 0.98]]])
        data, stats = strand_texture(uv, TextureStyle(size=256, strength=0.45, gamma=0.65))
        image = Image.open(io.BytesIO(data))
        self.assertEqual(image.format, "JPEG")
        self.assertEqual(image.size, (256, 256))
        array = np.asarray(image.convert("L"), dtype=np.float32) / 255.0
        self.assertGreaterEqual(float(array.mean()), 0.75)
        self.assertEqual(stats["procedural"], "strands")
        # 세로 줄무늬: 열 방향 분산이 행 방향 분산보다 크다
        self.assertGreater(float(array.mean(axis=0).std()), float(array.mean(axis=1).std()))


class ArapDetachedComponentTest(unittest.TestCase):
    def test_free_component_without_fixed_neighbors_does_not_make_the_system_singular(self) -> None:
        from character_kit.arap import arap_deform

        # 삼각형 두 덩어리: 0-1-2는 자유이고 모두 고정과 이어지지 않는다, 3-4-5는 고정이다
        rest = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [5, 0, 0], [6, 0, 0], [5, 1, 0]], dtype=np.float64)
        triangles = np.array([[0, 1, 2], [3, 4, 5]])
        edges = {(a, b) for tri in triangles for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0]))}
        neighbors: list[list[int]] = [[] for _ in range(6)]
        for a, b in edges:
            neighbors[a].append(b)
            neighbors[b].append(a)
        ptr = np.concatenate([[0], np.cumsum([len(n) for n in neighbors])]).astype(np.int64)
        idx = np.array([j for n in neighbors for j in n], dtype=np.int64)
        initial = rest + np.array([0.0, 0.2, 0.0])
        out = arap_deform(rest, initial, np.array([0, 1, 2]), ptr, idx, iterations=4)
        self.assertTrue(np.allclose(out, initial))  # 풀 수 없는 덩어리는 초기값(스키닝 결과)을 그대로 쓴다


class StrayComponentTest(unittest.TestCase):
    def mesh_with_stray(self):
        """UV 이음매로 갈라진 정점을 가진 구체(큰 성분) + 떨어진 삼각형 1개(파편)."""
        positions, triangles = uv_sphere(radius=0.1, rings=8, segments=10)
        positions = np.asarray(positions)
        triangles = np.asarray(triangles)
        # 이음매 흉내: 첫 삼각형 하나의 정점을 복제해 같은 위치의 별도 정점으로 만든다
        seam = positions[triangles[0]]
        positions = np.vstack([positions, seam])
        triangles = triangles.copy()
        triangles[0] = [len(positions) - 3, len(positions) - 2, len(positions) - 1]
        stray = np.array([[0.7, 0.2, 0.0], [0.72, 0.2, 0.0], [0.7, 0.22, 0.0]])
        triangles = np.vstack([triangles, [len(positions), len(positions) + 1, len(positions) + 2]])
        positions = np.vstack([positions, stray])
        uvs = np.linspace(0.0, 1.0, len(positions) * 2).reshape(-1, 2)
        return StaticMesh(positions=positions, normals=vertex_normals(positions, triangles), uvs=uvs, triangles=triangles, image=None, image_mime=None, material_name=None), len(triangles)

    def test_drops_small_floating_piece_and_reindexes(self) -> None:
        mesh, count = self.mesh_with_stray()
        cleaned, report = drop_stray_components(mesh, 30)
        self.assertEqual(report, {"droppedComponents": 1, "droppedTriangles": 1})
        self.assertEqual(len(cleaned.triangles), count - 1)
        self.assertLess(cleaned.positions[:, 0].max(), 0.2)
        self.assertEqual(cleaned.uvs.shape, (len(cleaned.positions), 2))
        self.assertEqual(cleaned.normals.shape, cleaned.positions.shape)
        self.assertEqual(int(cleaned.triangles.max()) + 1, len(cleaned.positions))  # 쓰이지 않는 정점이 남지 않는다

    def test_seam_split_vertices_do_not_make_the_sphere_stray(self) -> None:
        mesh, _ = self.mesh_with_stray()
        cleaned, _ = drop_stray_components(mesh, 30)
        # 이음매 복제 정점이 있어도 구체(수십 개 삼각형)는 한 성분으로 남는다
        self.assertGreater(len(cleaned.triangles), 100)

    def test_largest_component_is_kept_even_below_threshold(self) -> None:
        mesh, _ = self.mesh_with_stray()
        cleaned, report = drop_stray_components(mesh, 100000)
        self.assertEqual(report["droppedComponents"], 1)  # 파편만 지워지고
        self.assertGreater(len(cleaned.triangles), 100)  # 가장 큰 성분(구체)은 남는다

    def test_untouched_when_nothing_is_small(self) -> None:
        positions, triangles = uv_sphere(radius=0.1, rings=8, segments=10)
        mesh = StaticMesh(positions=np.asarray(positions), normals=None, uvs=np.zeros((len(positions), 2)), triangles=np.asarray(triangles), image=None, image_mime=None, material_name=None)
        cleaned, report = drop_stray_components(mesh, 30)
        self.assertIs(cleaned, mesh)
        self.assertEqual(report, {"droppedComponents": 0, "droppedTriangles": 0})


class TransferredNormalsTest(unittest.TestCase):
    def setUp(self) -> None:
        positions, triangles = uv_sphere(radius=1.0, rings=24, segments=32)
        self.surface = Surface(np.asarray(positions), np.asarray(triangles))
        self.field = vertex_normals(self.surface.positions, self.surface.triangles)
        rng = np.random.default_rng(1)
        radial = rng.normal(size=(40, 3))
        radial /= np.linalg.norm(radial, axis=1, keepdims=True)
        self.radial = radial
        self.rest = radial * 1.1  # 표면 위 10 cm(단위 구 기준)에 뜬 조각: 삼각형이 뒤죽박죽이라 기하 법선이 제각각이다
        index = np.arange(40)
        self.triangles = np.stack([index, (index + 1) % 40, (index + 5) % 40], axis=1)

    def test_full_amount_follows_the_surface_normal(self) -> None:
        out = transferred_normals(self.rest, self.triangles, self.surface, self.field, 1.0)
        self.assertTrue(np.all(np.einsum("ij,ij->i", out, self.radial) > 0.97))
        np.testing.assert_allclose(np.linalg.norm(out, axis=1), 1.0, atol=1e-9)

    def test_zero_amount_keeps_geometric_normals_up_to_orientation(self) -> None:
        geometric = vertex_normals(self.rest, self.triangles)
        out = transferred_normals(self.rest, self.triangles, self.surface, self.field, 0.0)
        np.testing.assert_allclose(np.abs(np.einsum("ij,ij->i", out, geometric)), 1.0, atol=1e-9)
        # 방향은 표면 법선과 같은 쪽으로 뒤집힌다(거의 수직인 법선은 표면 법선 보간 오차 안에서 부호가 갈릴 수 있어 여유를 둔다)
        self.assertTrue(np.all(np.einsum("ij,ij->i", out, self.radial) > -0.05))

    def test_points_beyond_max_distance_keep_geometric_normals(self) -> None:
        far = self.rest.copy()
        far[0] = self.radial[0] * 5.0
        geometric = vertex_normals(far, self.triangles)
        out = transferred_normals(far, self.triangles, self.surface, self.field, 1.0, max_distance=0.5)
        np.testing.assert_allclose(out[0], geometric[0], atol=1e-12)


class FoldedVertexNormalTest(unittest.TestCase):
    def test_cancelled_normals_fall_back_to_largest_face(self) -> None:
        # 맞붙어 접힌 두 겹: 같은 정점 0을 공유하고 서로 반대를 보는 삼각형 쌍 → 면적 가중 합이 0
        positions = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [2.0, 0.0, 0.0], [0.0, 2.0, 0.0]])
        triangles = np.array([[0, 1, 2], [0, 4, 3]])  # 두 번째는 뒤집힌 방향, 면적 4배
        normals = vertex_normals(positions, triangles)
        self.assertTrue(np.allclose(np.linalg.norm(normals, axis=1), 1.0))
        np.testing.assert_allclose(normals[0], [0.0, 0.0, -1.0])  # 큰 면(두 번째)의 법선

    def test_regular_vertices_unchanged(self) -> None:
        positions, triangles = uv_sphere(radius=1.0, rings=6, segments=8)
        normals = vertex_normals(np.asarray(positions), np.asarray(triangles))
        self.assertTrue(np.allclose(np.linalg.norm(normals, axis=1), 1.0))
        self.assertTrue(np.all(np.einsum("ij,ij->i", normals, np.asarray(positions)) > 0.9))


if __name__ == "__main__":
    unittest.main()
