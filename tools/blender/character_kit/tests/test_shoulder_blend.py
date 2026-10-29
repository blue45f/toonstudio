"""어깨 후보의 실제 HBM 변형 회귀. 공개 키트 승인이나 미학 점수는 판정하지 않는다."""
from __future__ import annotations

import os
from pathlib import Path
import sys
import unittest

import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from character_kit import base_assembly as ba, build_base, hbm, skin

CACHE = Path.home() / ".cache/toonstudio-kit"
SOURCE = Path(os.environ.get("CHARACTER_KIT_HBM_NPZ", CACHE / "hbm-npz/hbm_female.npz"))
CONTRACT = Path(os.environ.get("CHARACTER_KIT_CONTRACT_JSON", CACHE / "out/contract.json"))


class ShoulderProfileTest(unittest.TestCase):
    def test_local_initialization_cannot_inject_an_unconnected_bone_and_unconverged_weights_fail(self) -> None:
        faces = np.array([[0, 1, 4, 3], [1, 2, 5, 4], [6, 7, 10, 9], [7, 8, 11, 10]])
        ptr, idx = skin.vertex_adjacency(faces, 12)
        owner = np.array([0, 0, 1, 0, 1, 1, 2, 2, 3, 2, 3, 3])
        core = np.array([True, False, True, True, False, True] * 2)
        local = skin.harmonic_weights(owner, core, ptr, idx, 4, iterations=3, local_initialization=True)
        np.testing.assert_array_equal(local[:6, 2:], 0)
        np.testing.assert_array_equal(local[6:, :2], 0)
        with self.assertRaisesRegex(RuntimeError, "미수렴"):
            skin.harmonic_weights(owner, core, ptr, idx, 4, iterations=1, local_initialization=True, tolerance=1e-12)

    def test_cli_keeps_the_existing_default_and_requires_an_explicit_candidate_flag(self) -> None:
        self.assertFalse(build_base.parse([]).shoulder_blend)
        self.assertTrue(build_base.parse(["--shoulder-blend"]).shoulder_blend)

    def test_wider_boundary_keeps_distant_bone_cores_and_normalized_influences(self) -> None:
        width, height = 48, 4
        x, y = np.meshgrid(np.arange(width + 1), np.arange(height + 1))
        faces = []
        for row in range(height):
            for col in range(width):
                v = row * (width + 1) + col
                faces.append([v, v + 1, v + width + 2, v + width + 1])
        ptr, idx = skin.vertex_adjacency(np.array(faces), x.size)
        owner = (x.ravel() >= width // 2).astype(np.int64)
        names = ["mixamorig:LeftShoulder", "mixamorig:LeftArm"]
        old = skin.band_cores(owner, ptr, idx, names)
        wide = skin.band_cores(owner, ptr, idx, names, {("shoulder", "arm"): (12, 12)})
        self.assertGreater(np.count_nonzero(old), np.count_nonzero(wide))
        weights = skin.harmonic_weights(owner, wide, ptr, idx, 2)
        packed, values = skin.top_influences(weights)
        np.testing.assert_allclose(values.sum(axis=1), 1, atol=1e-6)
        self.assertTrue(np.all(values >= 0))
        self.assertTrue(np.all(weights[x.ravel() <= 5, 0] == 1))
        self.assertTrue(np.all(weights[x.ravel() >= 43, 1] == 1))
        self.assertEqual(packed.shape[1], 2)


class HbmShoulderCandidateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not SOURCE.is_file() or not CONTRACT.is_file():
            raise unittest.SkipTest("실제 HBM/계약 입력이 없어 형상 회귀를 실행하지 못함")
        cls.legacy = ba.load_context(SOURCE, CONTRACT)
        cls.candidate = ba.load_context(SOURCE, CONTRACT, shoulder_blend=True)
        cls.ptr, cls.idx = skin.vertex_adjacency(cls.legacy.quads, len(cls.legacy.t_pos))

    def test_actual_hbm_shoulder_does_not_keep_the_legacy_extreme_stretch(self) -> None:
        old, new = self.legacy, self.candidate
        np.testing.assert_array_equal(old.quads, new.quads)
        np.testing.assert_array_equal(old.body.positions, new.body.positions)
        np.testing.assert_allclose(new.skin_val.sum(axis=1), 1, atol=1e-6)
        self.assertTrue(np.all(new.skin_val >= 0))
        self.assertEqual(new.skin_val.shape[1], 4)
        source = old.body.positions
        pivots = np.stack([old.rig.a_pose[old.rig.index("mixamorig:" + side + "Arm")] for side in ("Left", "Right")])
        zone = np.linalg.norm(source[:, None] - pivots[None], axis=2).min(axis=1) < 0.17
        edges = np.stack([np.repeat(np.arange(len(source)), np.diff(self.ptr)), self.idx], axis=1)
        edges = edges[(edges[:, 0] < edges[:, 1]) & zone[edges].any(axis=1)]
        lengths = np.linalg.norm(source[edges[:, 0]] - source[edges[:, 1]], axis=1)
        ratios = [np.linalg.norm(ctx.t_pos[edges[:, 0]] - ctx.t_pos[edges[:, 1]], axis=1) / lengths for ctx in (old, new)]
        self.assertLess(float(np.quantile(ratios[1], 0.95)), float(np.quantile(ratios[0], 0.95)))
        self.assertLess(float(ratios[1].max()), float(ratios[0].max()))
        self.assertLess(np.count_nonzero(ratios[1] > 2), np.count_nonzero(ratios[0] > 2) / 2)

    def test_candidate_conversion_preserves_dqs_outside_its_shoulder_radius(self) -> None:
        ctx = self.candidate
        source = ctx.body.positions
        pivots = np.stack([ctx.rig.a_pose[ctx.rig.index("mixamorig:" + side + "Arm")] for side in ("Left", "Right")])
        remote = np.linalg.norm(source[:, None] - pivots[None], axis=2).min(axis=1) >= 0.28
        dqs = skin.dual_quaternion_skin(source, ctx.skin_idx, ctx.skin_val, ctx.rig.rotation, ctx.rig.translation)
        converted = skin.convert_to_t_pose(source, ctx.skin_idx, ctx.skin_val, ctx.rig, self.ptr, self.idx, shoulder_blend=True)
        np.testing.assert_array_equal(converted[remote], dqs[remote])
        np.testing.assert_array_equal(ctx.skin_idx[remote], self.legacy.skin_idx[remote])
        np.testing.assert_array_equal(ctx.skin_val[remote], self.legacy.skin_val[remote])
        np.testing.assert_array_equal(ctx.t_pos[remote], self.legacy.t_pos[remote])
        self.assertGreater(np.count_nonzero(remote), len(source) / 2)
        np.testing.assert_array_equal(ctx.rig.t_pose, self.legacy.rig.t_pose)


if __name__ == "__main__":
    unittest.main()
