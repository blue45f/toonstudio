"""원본 신발·소품 포지(`forge_shoes`·`forge_build_shoes`·`proc_accessories` forge 절) 시험.

순수 함수(평면 볼록 다각형·고리 고르기·초타원체·의상 간격 표·가방 틀·가장자리 고리·형태 이름)는 합성 입력으로 돈다.
실제 베이스 시험은 `~/.cache/toonstudio-kit/out4/base_model_<base>.npz`가 있을 때만 돈다(없으면 건너뜀, 위치는 `FORGE_SHOES_BASE_DIR`):
소품 정의마다 형태 키 변형의 위상이 기본과 같은지, 삼각형 예산·몸 관통 0·무릎 양말 갇힘(발 숨김) — `FORGE_SHOES_FULL=1`이면 신발 4종과 소품 전부, 아니면 대표 몇 개.

실행: <venv>/bin/python -I tools/blender/character_kit/tests/test_forge_shoes.py   (저장소 루트에서, bpy 모듈이 든 파이썬)
"""

from __future__ import annotations

import math
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import bpy  # noqa: E402,F401 — mathutils·bmesh 등록(공용 도구가 import 시점에 쓴다)

from character_kit import forge_build_shoes as fb  # noqa: E402
from character_kit import forge_shoes as fs  # noqa: E402
from character_kit import proc_accessories as pa  # noqa: E402

BASE_DIR = Path(os.environ.get("FORGE_SHOES_BASE_DIR", str(Path.home() / ".cache/toonstudio-kit/out4")))
FULL = os.environ.get("FORGE_SHOES_FULL") == "1"
ACCESSORY_BUDGET = 6000
SHOE_BUDGET = 8000


def edge_use(triangles: np.ndarray) -> dict[tuple[int, int], int]:
    counts: dict[tuple[int, int], int] = {}
    for a, b, c in np.asarray(triangles).tolist():
        for u, v in ((a, b), (b, c), (c, a)):
            key = (min(u, v), max(u, v))
            counts[key] = counts.get(key, 0) + 1
    return counts


def signed_volume(positions: np.ndarray, triangles: np.ndarray) -> float:
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


class PlanarHullTest(unittest.TestCase):
    def test_hull_is_ccw_and_contains_points(self) -> None:
        rng = np.random.default_rng(7)
        points = rng.normal(size=(400, 2)) * np.array([0.12, 0.05])
        hull = pa._hull_2d(points)  # noqa: SLF001
        self.assertGreaterEqual(len(hull), 3)
        area = 0.5 * float(np.sum(hull[:, 0] * np.roll(hull[:, 1], -1) - np.roll(hull[:, 0], -1) * hull[:, 1]))
        self.assertGreater(area, 0.0, "반시계여야 한다")
        for i in range(len(hull)):
            a, b = hull[i], hull[(i + 1) % len(hull)]
            e = b - a
            distance = (e[0] * (points[:, 1] - a[1]) - e[1] * (points[:, 0] - a[0])) / np.linalg.norm(e)
            # 껍질은 0.1 µm로 반올림한 점으로 만든다(중복 제거) — 그만큼의 오차는 허용
            self.assertTrue(np.all(distance >= -1e-7), "모든 점이 각 변의 왼쪽(안)에 있어야 한다")

    def test_ring_samples_start_behind_and_equal_spacing(self) -> None:
        theta = np.linspace(0.0, 2.0 * math.pi, 90, endpoint=False)
        ellipse = np.stack([0.10 * np.cos(theta), 0.04 * np.sin(theta)], axis=1)
        poly = pa._hull_2d(ellipse)  # noqa: SLF001
        ring = pa._ring_samples(poly, np.array([0.0, -1.0]), 36)  # noqa: SLF001
        self.assertEqual(ring.shape, (36, 2))
        self.assertAlmostEqual(float(ring[0, 0]), 0.0, delta=0.004)
        self.assertLess(float(ring[0, 1]), -0.035, "첫 점은 뒤쪽(−y) 광선이 둘레와 만나는 곳")
        steps = np.linalg.norm(np.diff(np.vstack([ring, ring[:1]]), axis=0), axis=1)
        self.assertLess(float(steps.max() / steps.min()), 1.25, "같은 호 길이로 골라야 한다")


class SuperquadricTest(unittest.TestCase):
    def test_closed_manifold_inside_unit_box(self) -> None:
        positions, triangles = pa.superquadric_mesh(10, 24, 0.4, 0.35)
        self.assertTrue(all(n == 2 for n in edge_use(triangles).values()), "닫힌 다양체(모서리마다 삼각형 둘)")
        self.assertLessEqual(float(np.abs(positions).max()), 1.0 + 1e-9)
        oriented = fs.orient_closed_components(positions, triangles)
        self.assertGreater(signed_volume(positions, oriented), 0.0)

    def test_small_exponent_is_boxier(self) -> None:
        soft, tri = pa.superquadric_mesh(12, 32, 1.0, 1.0)
        boxy, _ = pa.superquadric_mesh(12, 32, 0.3, 0.3)
        self.assertGreater(signed_volume(boxy, fs.orient_closed_components(boxy, tri)), signed_volume(soft, fs.orient_closed_components(soft, tri)))


class GarmentStandoffTest(unittest.TestCase):
    def test_height_profile_interpolates_and_picks_base(self) -> None:
        female = SimpleNamespace(base_id="female")
        male = SimpleNamespace(base_id="male")
        y = np.array([0.94, 0.97, 1.02])
        f = pa.garment_standoff(female, "waist", "top", y)
        self.assertAlmostEqual(float(f[0]), 0.0423, places=6)
        self.assertAlmostEqual(float(f[1]), 0.0244, places=6)
        self.assertTrue(np.all(np.diff(f) <= 0.0), "허리 위로 갈수록 상의가 덜 퍼진다")
        self.assertTrue(np.all(pa.garment_standoff(male, "waist", "top", y) >= f), "남성 상의가 더 떠 있다(실측)")

    def test_constant_area_layers_and_unknown_base(self) -> None:
        unknown = SimpleNamespace()
        self.assertEqual(pa.garment_standoff(unknown, "back", "skin"), pa.SKIN_STANDOFF_M)
        both = max(entry["top"] for entry in pa.GARMENT_STANDOFF_M["strap"].values())
        self.assertAlmostEqual(pa.garment_standoff(unknown, "strap", "top"), both)
        for area in pa.GARMENT_STANDOFF_M.values():
            for layers in area.values():
                self.assertIn("top", layers)
                self.assertIn("outer", layers)


class BagFrameTest(unittest.TestCase):
    def test_place_bends_ends_toward_body(self) -> None:
        frame = pa.BagFrame(np.zeros(3), np.array([1.0, 0.0, 0.0]), np.array([0.0, 1.0, 0.0]), np.array([0.0, 0.0, -1.0]), 0.5)
        centre, end = frame.place(np.array([[0.0, 0.0, 0.0], [0.2, 0.0, 0.0]]))
        self.assertAlmostEqual(float(centre[2]), 0.0)
        self.assertAlmostEqual(float(end[2]), 0.2**2 / (2 * 0.5), places=9, msg="끝은 몸 쪽(−n)으로 x²/2R 휜다")


class BoundaryLoopTest(unittest.TestCase):
    def test_open_tube_loop(self) -> None:
        rows, cols = 4, 12
        tris = fs.grid_triangles(rows, cols, wrap=True)
        loop = pa.boundary_loop(tris)
        self.assertEqual(len(loop), cols, "열린 관의 한쪽 끝 고리")
        self.assertTrue(set(loop.tolist()) <= set(range(cols)) or set(loop.tolist()) <= set(range((rows - 1) * cols, rows * cols)))


class ShapeNameTest(unittest.TestCase):
    def test_all_variant_keys_follow_contract_names(self) -> None:
        pattern = __import__("re").compile(r"^shape:(?P<name>[a-z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*):[+-]$")
        for definition in pa.ACCESSORY_DEFINITIONS.values():
            keys = definition.shape_variants(definition.params).keys()
            names = set()
            for key in keys:
                match = pattern.match(key)
                self.assertIsNotNone(match, f"{definition.name}: {key}")
                names.add(match.group("name"))  # type: ignore[union-attr]
                self.assertLessEqual(len(match.group("name")), 24)  # type: ignore[union-attr]
            self.assertLessEqual(len(names), 8, f"{definition.name}: 변형당 형태 8개 이하")
            for name in names:
                self.assertIn(name, definition.shapes_ko, f"{definition.name}: 형태 {name}의 한글 라벨")
        for definition in fs.SHOE_DEFINITIONS.values():
            keys = definition.shape_variants(definition.params).keys()
            self.assertEqual({k.split(":")[1] for k in keys}, {"height", "sole", "toe"}, definition.name)

    def test_definitions_use_contract_anchors_and_roles(self) -> None:
        anchors = {"head-top", "hair", "face", "ear-l", "ear-r", "neck", "wrist-l", "wrist-r", "waist", "back", "hand-l", "hand-r", "foot-l", "foot-r"}
        self.assertGreaterEqual(len(pa.ACCESSORY_DEFINITIONS), 14)
        for definition in pa.ACCESSORY_DEFINITIONS.values():
            self.assertTrue(set(definition.anchors) <= anchors, definition.name)
            self.assertIn(definition.mesh_role, ("accessory", "hair-accessory"))
        self.assertEqual(pa.ACCESSORY_DEFINITIONS["ribbon"].mesh_role, "hair-accessory")
        self.assertEqual(fs.SHOE_ROLES, ("shoes", "shoes-sole", "shoes-lace"))


@unittest.skipUnless((BASE_DIR / "base_model_female.npz").is_file(), "베이스 npz가 없다")
class RealBaseAccessoryTest(unittest.TestCase):
    names = list(pa.ACCESSORY_DEFINITIONS) if FULL else ["cap", "knee-socks", "waist-bag", "backpack"]

    @classmethod
    def setUpClass(cls) -> None:
        from character_kit.base_assembly import load_base_model

        cls.base = load_base_model(BASE_DIR / "base_model_female.npz")
        cls.lm = pa.Landmarks(cls.base)
        cls.lm.base_id = "female"
        cls.ctx = fs.body_context(cls.base, "body")

    def test_variants_keep_topology_budget_and_clearance(self) -> None:
        for name in self.names:
            with self.subTest(accessory=name):
                definition = pa.ACCESSORY_DEFINITIONS[name]
                asm = fb.assemble_accessory(definition.build(self.lm, definition.params))
                self.assertLessEqual(len(asm.triangles), ACCESSORY_BUDGET)
                deltas = fb.accessory_shape_deltas(definition, self.lm, asm)  # 위상이 다르면 ValueError
                self.assertEqual(set(deltas), set(definition.shape_variants(definition.params)))
                inside = int((fb.signed_clearance(self.ctx, asm.positions) < 0.0).sum())
                allowed = 30 if name == "earrings" else 0  # 귓볼을 뚫는 스터드는 일부가 귓볼 안이다(의도)
                self.assertLessEqual(inside, allowed, f"{name}: 몸 관통 정점")

    def test_knee_socks_enclose_feet(self) -> None:
        definition = pa.ACCESSORY_DEFINITIONS["knee-socks"]
        asm = fb.assemble_accessory(definition.build(self.lm, definition.params))
        enclosed = fb.shoe_coverage(asm.positions, asm.triangles, self.base)
        for region in ("foot.L", "foot.R"):
            self.assertGreaterEqual(enclosed[region], 0.985, region)


@unittest.skipUnless(FULL and (BASE_DIR / "base_model_female.npz").is_file(), "FORGE_SHOES_FULL=1과 베이스 npz가 필요하다")
class RealBaseShoeTest(unittest.TestCase):
    def test_shoes_budget_floor_and_clearance(self) -> None:
        from character_kit.base_assembly import load_base_model

        base = load_base_model(BASE_DIR / "base_model_female.npz")
        ctx = fs.body_context(base, "body")
        for name, definition in fs.SHOE_DEFINITIONS.items():
            with self.subTest(shoe=name):
                pair = fs.build_pair(definition, base, ctx, definition.params)
                self.assertLessEqual(len(pair.triangles), SHOE_BUDGET)
                piece = fs.Piece(name=name, positions=pair.positions, triangles=pair.triangles, uvs=pair.uvs, normals=pair.normals)
                self.assertEqual(fs.penetration_report(ctx, piece, ("foot.L", "foot.R", "calf.L", "calf.R"))["inside"], 0)
                ground = min(b.ground_v for b in pair.builds.values())
                self.assertLess(ground, 0.0, "밑창이 바닥(발바닥) 아래로 내려가 groundOffsetM이 음수")


if __name__ == "__main__":
    unittest.main(verbosity=2)
