"""리그·스킨·UV·체형 필드·표면 질의의 작은 단위 시험 (표준 라이브러리 unittest).

실행: python -I tools/blender/character_kit/tests/test_geometry.py   (bpy 패키지가 있는 파이썬; Surface 시험이 mathutils를 쓴다)
실제 HBM 메시가 없어도 돌도록 전부 합성 입력만 쓴다.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from character_kit import fields_body, skin, uvtools
from character_kit.rig import Rig, rotation_between


def grid_quads(nx: int, ny: int) -> tuple[np.ndarray, np.ndarray]:
    """(nx+1)×(ny+1) 정점의 평면 쿼드 격자(z=0)."""
    xs, ys = np.meshgrid(np.arange(nx + 1, dtype=np.float64), np.arange(ny + 1, dtype=np.float64))
    positions = np.stack([xs.ravel(), ys.ravel(), np.zeros(xs.size)], axis=1)
    quads = []
    for y in range(ny):
        for x in range(nx):
            a = y * (nx + 1) + x
            quads.append([a, a + 1, a + nx + 2, a + nx + 1])
    return positions, np.array(quads, dtype=np.int64)


class RigMathTest(unittest.TestCase):
    def test_rotation_between_maps_vector_and_is_proper(self) -> None:
        rng = np.random.default_rng(3)
        for _ in range(20):
            a, b = rng.normal(size=3), rng.normal(size=3)
            r = rotation_between(a, b)
            np.testing.assert_allclose(r @ (a / np.linalg.norm(a)), b / np.linalg.norm(b), atol=1e-9)
            self.assertAlmostEqual(float(np.linalg.det(r)), 1.0, places=9)

    def test_rotation_between_opposite_vectors(self) -> None:
        r = rotation_between(np.array([0.0, -1.0, 0.0]), np.array([0.0, 1.0, 0.0]))
        np.testing.assert_allclose(r @ np.array([0.0, -1.0, 0.0]), [0.0, 1.0, 0.0], atol=1e-9)


class SkinTest(unittest.TestCase):
    def test_harmonic_weights_blend_only_near_boundary(self) -> None:
        positions, quads = grid_quads(20, 4)
        count = len(positions)
        ptr, idx = skin.vertex_adjacency(quads, count)
        owner = (positions[:, 0] >= 10).astype(np.int64)  # 왼쪽 반 = 본 0, 오른쪽 반 = 본 1
        names = ["mixamorig:Spine", "mixamorig:Spine1"]
        core = skin.band_cores(owner, ptr, idx, names)
        weights = skin.harmonic_weights(owner, core, ptr, idx, bone_count=2)
        np.testing.assert_allclose(weights.sum(axis=1), 1.0, atol=1e-5)
        far_left, far_right = positions[:, 0] <= 3, positions[:, 0] >= 17
        self.assertTrue(np.all(weights[far_left, 0] > 0.999))
        self.assertTrue(np.all(weights[far_right, 1] > 0.999))
        near = np.abs(positions[:, 0] - 10) <= 1
        self.assertTrue(np.any((weights[near, 0] > 0.05) & (weights[near, 0] < 0.95)))
        # x에 대해 단조(경계에서 매끄럽게 한쪽으로 증가)
        row = weights[positions[:, 1] == 2][:, 1]
        self.assertTrue(np.all(np.diff(row) >= -1e-4))

    def test_top_influences_normalizes_and_limits_to_four(self) -> None:
        weights = np.array([[0.3, 0.25, 0.2, 0.15, 0.1], [1.0, 0, 0, 0, 0], [0, 0, 0, 0, 0.001]], dtype=np.float32)
        indices, values = skin.top_influences(weights)
        self.assertEqual(indices.shape, (3, 4))
        np.testing.assert_allclose(values.sum(axis=1), 1.0, atol=1e-6)
        self.assertEqual(int(indices[0, 0]), 0)
        self.assertTrue(np.all(indices[values == 0] == 0))  # 가중치 0인 슬롯의 인덱스는 0(계약 V8)

    def test_dual_quaternion_skin_matches_rigid_transforms(self) -> None:
        pivot = np.array([1.0, 2.0, 0.0])
        angle = np.pi / 2
        rotation = np.tile(np.eye(3), (2, 1, 1))
        rotation[1] = [[np.cos(angle), -np.sin(angle), 0.0], [np.sin(angle), np.cos(angle), 0.0], [0.0, 0.0, 1.0]]
        translation = np.zeros((2, 3))
        translation[1] = pivot - rotation[1] @ pivot  # 피벗 기준 회전
        points = np.array([[2.0, 2.0, 0.0], [0.0, 0.0, 1.0]])
        indices = np.array([[1, 0, 0, 0], [0, 0, 0, 0]], dtype=np.uint8)
        weights = np.array([[1.0, 0, 0, 0], [1.0, 0, 0, 0]], dtype=np.float32)
        out = skin.dual_quaternion_skin(points, indices, weights, rotation, translation)
        np.testing.assert_allclose(out[0], [1.0, 3.0, 0.0], atol=1e-9)  # (1,0) 만큼 떨어진 점이 +y로 돈다
        np.testing.assert_allclose(out[1], points[1], atol=1e-9)


class UvToolsTest(unittest.TestCase):
    def test_pack_places_islands_inside_unit_square_without_overlap(self) -> None:
        # 서로 떨어진 쿼드 섬 6개(크기가 다름)
        uv = []
        quads = []
        rng = np.random.default_rng(5)
        for i in range(6):
            w, h = rng.uniform(0.5, 3.0), rng.uniform(0.5, 3.0)
            base = len(uv)
            uv += [[0.0, 0.0], [w, 0.0], [w, h], [0.0, h]]
            quads.append([base, base + 1, base + 2, base + 3])
        uv = np.array(uv, dtype=np.float32)
        quads = np.array(quads, dtype=np.int64)
        packed = uvtools.pack_uv_islands(uv, quads, margin=0.01)
        self.assertGreaterEqual(float(packed.min()), 0.0)
        self.assertLessEqual(float(packed.max()), 1.0)
        triangles = np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]], axis=0)
        ratio, covered, _ = uvtools.overlap_ratio(packed, triangles, 256)
        self.assertEqual(ratio, 0.0)
        self.assertGreater(covered, 0)

    def test_overlap_ratio_detects_overlap(self) -> None:
        uv = np.array([[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]], dtype=np.float32)
        triangles = np.array([[0, 1, 2], [0, 1, 2]], dtype=np.int64)
        ratio, covered, overlapped = uvtools.overlap_ratio(uv, triangles, 128)
        self.assertEqual(covered, overlapped)
        self.assertEqual(ratio, 1.0)

    def test_split_by_uv_duplicates_vertices_with_different_uv(self) -> None:
        quads = np.array([[0, 1, 2, 3], [1, 4, 5, 2]], dtype=np.int64)
        uv = np.zeros((2, 4, 2), dtype=np.float32)
        uv[0] = [[0, 0], [1, 0], [1, 1], [0, 1]]
        uv[1] = [[2, 0], [3, 0], [3, 1], [2, 1]]  # 공유 정점 1,2가 다른 UV를 가진다
        origin, uv_vertices, inverse = uvtools.split_by_uv(quads, uv)
        self.assertEqual(len(origin), 8)
        self.assertEqual(uv_vertices.shape, (8, 2))
        self.assertEqual(inverse.shape, (8,))


class BodyFieldsTest(unittest.TestCase):
    @staticmethod
    def landmarks() -> fields_body.BodyLandmarks:
        return fields_body.BodyLandmarks(
            hip_y=0.84,
            arm_x=0.134,
            arm_y=1.36,
            chest_y=1.18,
            waist_y=1.05,
            hip_center_y=0.86,
            neck_base_y=1.335,
            head_pivot=np.array([0.0, 1.405, 0.0]),
            foot_z=0.03,
            chest_z=0.02,
            waist_z=0.01,
            pelvis_z=0.0,
        )

    def test_height_scales_whole_body_by_eight_percent(self) -> None:
        fields = fields_body.BodyFields(self.landmarks())
        top = fields.field("height", np.array([[0.0, 1.64, 0.03]]))
        self.assertAlmostEqual(float(top[0, 1]), 0.08 * 1.64, places=6)
        feet = fields.field("height", np.array([[0.1, 0.0, 0.03]]))
        self.assertAlmostEqual(float(feet[0, 1]), 0.0, places=9)

    def test_leg_length_lifts_upper_body_and_stretches_legs(self) -> None:
        fields = fields_body.BodyFields(self.landmarks())
        delta = fields.field("legLength", np.array([[0.0, 1.5, 0.0], [0.1, 0.42, 0.0], [0.1, 0.0, 0.0]]))
        self.assertAlmostEqual(float(delta[0, 1]), 0.10 * 0.84, delta=2e-3)  # 머리는 다리 늘어난 만큼 올라간다
        self.assertAlmostEqual(float(delta[1, 1]), 0.10 * 0.42, delta=2e-3)  # 다리 중간은 비례해 늘어난다
        self.assertAlmostEqual(float(delta[2, 1]), 0.0, delta=1e-3)

    def test_fields_are_left_right_symmetric_in_x(self) -> None:
        fields = fields_body.BodyFields(self.landmarks())
        left = np.array([[0.2, 1.3, 0.05]])
        right = np.array([[-0.2, 1.3, 0.05]])
        for key in ("shoulderWidth", "armLength", "chestDepth", "waist", "hip"):
            a, b = fields.field(key, left), fields.field(key, right)
            self.assertAlmostEqual(float(a[0, 0]), -float(b[0, 0]), places=9, msg=key)
            self.assertAlmostEqual(float(a[0, 1]), float(b[0, 1]), places=9, msg=key)
            self.assertAlmostEqual(float(a[0, 2]), float(b[0, 2]), places=9, msg=key)

    def test_joint_offsets_are_local_to_parent(self) -> None:
        lm = self.landmarks()
        names = ["root", "child"]
        t_pose = np.array([[0.0, 0.9, 0.0], [0.0, 0.5, 0.0]])
        rig = Rig(names=names, parents={"root": None, "child": "root"}, a_pose=t_pose.copy(), t_pose=t_pose, rotation=np.tile(np.eye(3), (2, 1, 1)))
        fields = fields_body.BodyFields(lm)
        plus = fields_body.joint_offsets(fields, rig, "legLength", +1.0)
        minus = fields_body.joint_offsets(fields, rig, "legLength", -1.0)
        world_root = fields.field("legLength", t_pose)[0]
        world_child = fields.field("legLength", t_pose)[1]
        np.testing.assert_allclose(plus["root"], world_root, atol=1e-9)
        np.testing.assert_allclose(plus["child"], world_child - world_root, atol=1e-9)
        np.testing.assert_allclose(minus["child"], -(world_child - world_root), atol=1e-9)


class SurfaceTest(unittest.TestCase):
    def test_closest_point_and_interpolation(self) -> None:
        from character_kit.surface import Surface

        positions = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], dtype=np.float64)
        triangles = np.array([[0, 1, 2], [0, 2, 3]], dtype=np.int64)
        surface = Surface(positions, triangles)
        hits = surface.closest(np.array([[0.25, 0.5, 0.3], [5.0, 5.0, 5.0]]))
        self.assertAlmostEqual(float(hits.distance[0]), 0.3, places=6)
        np.testing.assert_allclose(hits.bary.sum(axis=1), 1.0, atol=1e-9)
        values = positions[:, :1] * 10.0  # 정점 값 = x*10
        interpolated = hits.interpolate(triangles, values)
        self.assertAlmostEqual(float(interpolated[0, 0]), 2.5, places=6)
        # 먼 점도 표면의 가장 가까운 점으로 보간된다
        self.assertGreaterEqual(int(hits.triangle[1]), 0)


if __name__ == "__main__":
    unittest.main()
