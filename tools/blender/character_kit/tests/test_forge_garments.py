"""원본 의상 생성기(`forge_garments`) 시험 — 순수 함수는 합성 입력으로, 실제 베이스 시험은 베이스 npz가 있을 때만 돈다.

실행: <venv>/bin/python -I tools/blender/character_kit/tests/test_forge_garments.py   (저장소 루트에서, bpy 모듈이 든 파이썬)
실제 베이스 시험은 `~/.cache/toonstudio-kit/out4/base_model_<base>.npz`가 있어야 하고(없으면 건너뜀), 환경변수 `FORGE_GARMENTS_BASE_DIR`로 위치를 바꿀 수 있다.
"""

from __future__ import annotations

import json
import os
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from character_kit import forge_garments as fg  # noqa: E402

BASE_DIR = Path(os.environ.get("FORGE_GARMENTS_BASE_DIR", str(Path.home() / ".cache/toonstudio-kit/out4")))


def edge_counts(triangles: np.ndarray) -> dict[tuple[int, int], int]:
    counts: dict[tuple[int, int], int] = {}
    for a, b, c in np.asarray(triangles).tolist():
        for u, v in ((a, b), (b, c), (c, a)):
            key = (min(u, v), max(u, v))
            counts[key] = counts.get(key, 0) + 1
    return counts


def grid_mesh(nx: int, ny: int, size: float = 1.0) -> fg.Mesh:
    xs, ys = np.meshgrid(np.linspace(0.0, size, nx + 1), np.linspace(0.0, size, ny + 1))
    positions = np.stack([xs.ravel(), ys.ravel(), np.zeros(xs.size)], axis=1)
    tris = []
    for y in range(ny):
        for x in range(nx):
            a = y * (nx + 1) + x
            tris += [[a, a + 1, a + nx + 2], [a, a + nx + 2, a + nx + 1]]
    return fg.Mesh(positions, np.array(tris, dtype=np.int64))


def read_glb_json(path: Path) -> dict:
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20 : 20 + length])


class CutMeshTest(unittest.TestCase):
    def test_level_cut_keeps_positive_side_and_makes_one_clean_edge(self) -> None:
        mesh = grid_mesh(10, 10)
        values = mesh.positions[:, 1] - 0.437  # 수평선 y = 0.437 아래를 잘라 낸다
        cut, on_level = fg.cut_mesh(mesh, values, snap=0.001)
        self.assertTrue(np.all(cut.positions[:, 1] >= 0.437 - 1e-9))
        self.assertTrue(np.allclose(cut.positions[on_level, 1], 0.437, atol=1e-9))
        loops = fg.boundary_loops(cut.triangles)
        self.assertEqual(len(loops), 1)  # 남은 판의 테두리 하나(절단선이 그 일부)
        self.assertTrue(all(count <= 2 for count in edge_counts(cut.triangles).values()))

    def test_split_keeps_both_sides_with_shared_level_vertices(self) -> None:
        mesh = grid_mesh(8, 8)
        values = mesh.positions[:, 0] - 0.31
        cut, on_level = fg.cut_mesh(mesh, values, split=True)
        # 등위선은 가로변 9개와 칸마다 대각선 8개를 가로지른다 → 정점 17개, 모두 x = 0.31 위
        self.assertEqual(int(on_level.sum()), 9 + 8)
        self.assertTrue(np.allclose(cut.positions[on_level, 0], 0.31, atol=1e-9))
        centroids = cut.positions[cut.triangles].mean(axis=1)
        self.assertTrue((centroids[:, 0] < 0.31).any() and (centroids[:, 0] > 0.31).any())
        # 등위선을 가로지르는 삼각형이 없다
        f = cut.positions[:, 0] - 0.31
        tri_f = f[cut.triangles]
        crossing = (tri_f > 1e-9).any(axis=1) & (tri_f < -1e-9).any(axis=1)
        self.assertFalse(crossing.any())


class PleatTest(unittest.TestCase):
    def test_pleat_profile_rises_then_folds(self) -> None:
        s = np.linspace(0.0, 1.0, 101)
        shape = fg.pleat_shape(s)
        self.assertAlmostEqual(float(fg.pleat_shape(np.array([0.0]))[0]), 0.0)
        self.assertAlmostEqual(float(fg.pleat_shape(np.array([fg.PLEAT_PEAK]))[0]), 1.0)
        self.assertAlmostEqual(float(fg.pleat_shape(np.array([1.0]))[0]), 0.0)
        rise = shape[s <= fg.PLEAT_PEAK]
        self.assertTrue(np.all(np.diff(rise) >= -1e-12))
        # 내리막(접힘)이 오르막보다 가파르다 — 칼주름
        self.assertGreater(1.0 / (1.0 - fg.PLEAT_PEAK), 1.0 / fg.PLEAT_PEAK)

    def test_skirt_columns_are_mirror_symmetric(self) -> None:
        for pleats in (6, 8, 10):
            spec = fg.SkirtSpec(name="t", hem_y=0.5, waist_front=1.0, waist_back=1.0, pleats=pleats)
            thetas, phases = fg.skirt_columns(spec)
            self.assertTrue(np.all(np.diff(thetas) > 0))
            self.assertTrue(np.all((thetas >= -np.pi) & (thetas < np.pi)))
            for t, p in zip(thetas, phases):
                if abs(t) < 1e-9 or abs(abs(t) - np.pi) < 1e-9:
                    continue
                j = np.argmin(np.abs(thetas + t))
                self.assertAlmostEqual(float(thetas[j]), -float(t), places=9)
                self.assertAlmostEqual(float(phases[j]), float(p), places=9)


class WeightsTest(unittest.TestCase):
    def test_top_from_dense_keeps_four_normalized_influences(self) -> None:
        rng = np.random.default_rng(7)
        dense = rng.random((50, 68)) ** 6
        joints, weights = fg.top_from_dense(dense)
        self.assertEqual(joints.shape, (50, 4))
        self.assertTrue(np.allclose(weights.sum(axis=1), 1.0))
        self.assertTrue(np.all(joints[weights == 0.0] == 0))  # 가중치 0 슬롯은 joint 0(검증기 V8)

    def test_quantized_weights_sum_exactly(self) -> None:
        rng = np.random.default_rng(3)
        w = rng.random((200, 4))
        w[:, 3] = 0.0
        w /= w.sum(axis=1, keepdims=True)
        q = fg.quantize_weights(w)
        self.assertEqual(q.dtype, np.uint16)
        self.assertTrue(np.all(q.astype(np.int64).sum(axis=1) == 65535))
        self.assertLess(float(np.abs(q / 65535.0 - w).max()), 4.0 / 65535.0)
        self.assertTrue(np.all(q[:, 3] == 0))


class SlabTest(unittest.TestCase):
    def test_solidified_grid_is_closed_and_faces_outward(self) -> None:
        xs, ys = np.meshgrid(np.linspace(0.0, 0.1, 7), np.linspace(0.0, 0.05, 5))
        grid = np.stack([xs, ys, 0.01 * np.sin(xs * 20.0)], axis=2)  # (R, C, 3), 살짝 휜 판
        for flip in (False, True):
            mesh = fg.solidify_grid(grid, 0.002, flip=flip, attrs={"leaf": np.ones(grid.shape[:2])})
            self.assertEqual(len(mesh.attrs["uvw"]), mesh.count)
            self.assertEqual(len(mesh.attrs["leaf"]), mesh.count)
            # 같은 위치 정점을 합치면 모든 변을 두 삼각형이 공유한다(닫힌 판)
            index, _ = fg.gf.weld_vertices(mesh.positions, 1e-9)
            counts = edge_counts(index[mesh.triangles])
            self.assertTrue(all(c == 2 for c in counts.values()), "판이 닫혀 있지 않다")
            # 바깥면(앞 R·C 정점)의 면 법선이 지정한 쪽(flip이면 −z 쪽)을 본다
            want = -1.0 if flip else 1.0
            n = fg.grid_normals(grid)[..., 2].mean() * (-1.0 if flip else 1.0)
            self.assertGreater(n * want, 0.0)
            outer = mesh.triangles[: 2 * (grid.shape[0] - 1) * (grid.shape[1] - 1)]
            a, b, c = (mesh.positions[outer[:, k]] for k in range(3))
            self.assertGreater(float(np.cross(b - a, c - a)[:, 2].sum()) * want, 0.0)

    def test_ribbon_bow_has_dovetail_tails(self) -> None:
        bow = fg.ribbon_bow(np.array([0.0, 1.3, 0.1]), np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0]))
        for part in ("knot", "wings", "tails"):
            self.assertGreater(len(bow[part].triangles), 0)
        tails = bow["tails"]
        lowest = tails.positions[:, 1].min()
        self.assertLess(lowest, 1.3 - 0.04)  # 꼬리가 아래로 늘어진다

    def test_push_outside_lifts_points_above_plane(self) -> None:
        from character_kit.surface import Surface

        plane = grid_mesh(4, 4, 1.0)
        normals = np.tile(np.array([0.0, 0.0, 1.0]), (plane.count, 1))
        pts = np.array([[0.5, 0.5, -0.01], [0.3, 0.3, 0.05]])
        out = fg.push_outside(pts, Surface(plane.positions, plane.triangles), normals, 0.002)
        self.assertAlmostEqual(float(out[0, 2]), 0.002, places=6)
        self.assertAlmostEqual(float(out[1, 2]), 0.05, places=9)


class FieldTest(unittest.TestCase):
    def test_front_back_blend_hits_three_anchors(self) -> None:
        phi = np.array([0.0, np.pi / 2, np.pi])
        values = fg.front_back_blend(phi, 3.0, 2.0, 1.0)
        self.assertTrue(np.allclose(values, [3.0, 2.0, 1.0]))

    def test_armhole_is_rounded_union_of_arm_plane_and_depth(self) -> None:
        joints = {"mixamorig:LeftArm": np.array([0.17, 1.38, 0.0]), "mixamorig:LeftHand": np.array([0.70, 1.38, 0.0]), "mixamorig:RightArm": np.array([-0.17, 1.38, 0.0]), "mixamorig:RightHand": np.array([-0.70, 1.38, 0.0])}
        body = SimpleNamespace(landmarks=SimpleNamespace(armpit_y=1.30), joint=lambda name: joints[name if ":" in name else f"mixamorig:{name}"])
        pts = np.array([[0.20, 1.40, 0.0], [0.15, 1.10, 0.0], [0.12, 1.36, 0.0], [0.20, 1.10, 0.0]])
        f = fg.armhole_field(body, pts)
        self.assertLess(f[0], 0.0)  # 어깨 끝 너머·진동 위 → 잘림
        self.assertGreater(f[1], 0.0)  # 겨드랑이 아래 옆구리 → 남음
        self.assertGreater(f[2], 0.0)  # 어깨 안쪽 → 남음
        self.assertGreater(f[3], 0.0)  # 팔 쪽이어도 진동 밑보다 낮으면 남음(엉덩이가 잘리지 않는다)


@unittest.skipUnless((BASE_DIR / "base_model_female.npz").is_file(), "베이스 npz가 없다")
class RealBaseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.body = fg.BaseBody(BASE_DIR / "base_model_female.npz", "female")
        cls.rig = fg.BodyRig(cls.body, fg.body_morph_names())

    def test_overlap_rule_holds_for_every_bottom_waist(self) -> None:
        body = self.body
        floor = fg.bottoms_waist_floor(body)
        lm = body.landmarks
        for front in (lm.hip_y + 0.105, lm.hip_y + 0.115, lm.waist_y - 0.050):
            self.assertLessEqual(floor, fg.effective_waist(body, front, front + 0.03)[0] + 1e-9)
        hem = fg.shirt_hem(body, lm.hip_y + 0.20, 0.04)  # 일부러 높게 줘도 규약 높이로 내려온다
        self.assertLessEqual(float(hem(np.linspace(-np.pi, np.pi, 33)).max()), floor - fg.TOP_BOTTOM_OVERLAP_M + 1e-9)

    def test_underwear_is_covered_by_waistlines(self) -> None:
        theta = np.linspace(-np.pi, np.pi, 49)
        line = fg.waist_line(self.body, theta, 0.0, 0.0)  # 아무리 낮게 줘도 속옷 윗선 + 1.6 cm
        self.assertTrue(np.all(line >= self.body.underwear_top(theta) + fg.UNDERWEAR_COVER_M - 1e-9))

    def test_tee_builds_within_contract(self) -> None:
        plan = fg.build_tee(fg.BuildContext(self.body, rig=self.rig))
        asm = fg.assemble(self.body, self.rig, plan, texture_size=512)
        self.assertLessEqual(asm.report["triangles"], 25000)
        d, _ = self.body.signed_distance(asm.positions)
        self.assertGreater(float(d.min()), 0.0015)  # 몸 관통 없음(레스트)
        self.assertTrue(all(n.startswith("shape:") and n[-2:] in (":+", ":-") for n in asm.shape_names))
        with tempfile.TemporaryDirectory() as tmp:
            compat = fg.write_variant(asm, self.body, Path(tmp) / "tee.glb", "compat")
            layered = fg.write_variant(asm, self.body, Path(tmp) / "tee_layered.glb", "layered")
            self.assertLessEqual(compat["bytes"], 1572864)
            doc = read_glb_json(Path(tmp) / "tee.glb")
            self.assertEqual([n["name"] for n in doc["nodes"] if "mesh" in n], ["TS_Top_tee"])
            self.assertEqual([m["name"] for m in doc["materials"]], ["ts_top_tee"])
            prim = doc["meshes"][0]["primitives"][0]
            weights = doc["accessors"][prim["attributes"]["WEIGHTS_0"]]
            self.assertEqual((weights["componentType"], weights.get("normalized")), (5123, True))
            self.assertIn("TEXCOORD_1", prim["attributes"])
            self.assertEqual(len(prim["targets"]), 18)  # compat은 체형 morph 18개만
            ldoc = read_glb_json(Path(tmp) / "tee_layered.glb")
            nodes = sorted(n["name"] for n in ldoc["nodes"] if "mesh" in n)
            self.assertEqual(nodes, ["TS_Top_tee", "TS_Top_tee_Trim"])
            names = ldoc["meshes"][0].get("extras", {}).get("targetNames", [])
            self.assertTrue(any(n.startswith("shape:length:") for n in names))
            self.assertEqual({r["role"] for r in layered["meshes"]}, {"top", "top-trim"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
