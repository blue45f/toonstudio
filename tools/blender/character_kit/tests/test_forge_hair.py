"""절차 헤어·헤어 부속(`forge_hair`) 시험 — 순수 함수는 합성 입력으로, 실제 베이스 시험은 베이스 npz가 있을 때만 돈다.

실행: <venv>/bin/python -I tools/blender/character_kit/tests/test_forge_hair.py   (저장소 루트에서)
실제 베이스 시험은 `~/.cache/toonstudio-kit/out4/base_model_<base>.npz`가 있어야 하고(없으면 건너뜀), 환경변수 `FORGE_HAIR_BASE_DIR`로 위치를 바꿀 수 있다.
"""

from __future__ import annotations

import io
import json
import os
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from character_kit import forge_hair as fh  # noqa: E402

BASE_DIR = Path(os.environ.get("FORGE_HAIR_BASE_DIR", str(Path.home() / ".cache/toonstudio-kit/out4")))


def edge_counts(triangles: np.ndarray) -> dict[tuple[int, int], int]:
    counts: dict[tuple[int, int], int] = {}
    for a, b, c in np.asarray(triangles).tolist():
        for u, v in ((a, b), (b, c), (c, a)):
            key = (min(u, v), max(u, v))
            counts[key] = counts.get(key, 0) + 1
    return counts


def signed_volume(positions: np.ndarray, triangles: np.ndarray) -> float:
    a, b, c = (positions[triangles[:, k]] for k in range(3))
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


def parse_glb(data: bytes) -> tuple[dict, bytes]:
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2 and length == len(data)
    offset, document, binary = 12, None, b""
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + chunk_length]
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8"))
        elif chunk_type == 0x004E4942:
            binary = chunk
        offset += 8 + chunk_length
    assert document is not None
    return document, binary


class PrngTests(unittest.TestCase):
    """TS `apps/character-lab/src/shared/prng.ts`(mulberry32·fnv1a32)와 같은 수열이어야 두 언어가 같은 변주를 만든다."""

    def test_mulberry32_matches_typescript(self) -> None:
        prng = fh.Prng(12345)
        expected = [0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203]
        for value in expected:
            self.assertAlmostEqual(prng.next(), value, places=15)

    def test_fnv1a32_matches_typescript(self) -> None:
        self.assertEqual(fh.fnv1a32("forge-hair/soft-bob/female"), 523503851)

    def test_style_seed_is_stable_and_distinct(self) -> None:
        seeds = {fh.style_seed(style, base) for style in fh.HAIR_STYLE_IDS for base in ("female", "male")}
        self.assertEqual(len(seeds), 14)
        self.assertEqual(fh.style_seed("hime-cut", "male"), fh.style_seed("hime-cut", "male"))


class TextureTests(unittest.TestCase):
    def test_hair_texture_is_bright_gray_ramp(self) -> None:
        data, stats = fh.hair_texture()
        image = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"), dtype=np.float64) / 255.0
        self.assertEqual(image.shape[:2], (fh.TEXTURE_SIZE, fh.TEXTURE_SIZE))
        self.assertGreaterEqual(stats["meanLuminance"], 0.75)  # 검증기 V13 하한
        self.assertLess(np.abs(image[..., 0] - image[..., 2]).max(), 0.05)  # 회색(색은 레시피 tint가 나른다)
        rows = image[..., 0].mean(axis=1)
        self.assertLess(rows[5], rows[-5])  # 뿌리(위)가 끝(아래)보다 어둡다

    def test_accessory_texture_is_bright(self) -> None:
        _, stats = fh.accessory_texture()
        self.assertGreaterEqual(stats["meanLuminance"], 0.80)


class QuantizationTests(unittest.TestCase):
    def test_byte_normals_round_trip_within_tolerance(self) -> None:
        rng = np.random.default_rng(3)
        normals = fh.unit(rng.normal(size=(500, 3)))
        q = fh.quantize_normals(normals)
        self.assertEqual(q.dtype, np.int8)
        decoded = np.maximum(q.astype(np.float64) / 127.0, -1.0)
        lengths = np.linalg.norm(decoded, axis=1)
        self.assertLess(np.abs(lengths - 1.0).max(), 0.01)
        self.assertGreater(np.einsum("ij,ij->i", fh.unit(decoded), normals).min(), 0.999)

    def test_weights_quantize_to_exact_unit_sum(self) -> None:
        rng = np.random.default_rng(5)
        weights = 0.1 + 0.9 * rng.random((300, 4))
        weights[:, 2:] *= rng.random((300, 2)) > 0.5
        q = fh.quantize_weights(weights)
        self.assertEqual(q.dtype, np.uint16)
        self.assertTrue((q.astype(np.int64).sum(axis=1) == 65535).all())  # 복원 합이 정확히 1(계약 허용 오차 1e-3)
        reference = weights / weights.sum(axis=1, keepdims=True)
        self.assertLess(float(np.abs(q / 65535.0 - reference).max()), 5e-5)
        self.assertTrue(((q == 0) == (weights == 0)).all())


class HairlineTests(unittest.TestCase):
    def test_table_hairline_region_matches_limit(self) -> None:
        region = fh.table_hairline([(0.0, 50.0), (90.0, 100.0), (180.0, 130.0)])
        self.assertTrue(hasattr(region, "limit"))
        self.assertAlmostEqual(float(region.limit(np.array([0.0]))[0]), 50.0)
        self.assertAlmostEqual(float(region.limit(np.array([270.0]))[0]), 100.0)  # 대칭(−90°)
        inside = region(fh.sph(np.array([0.0, 0.0, 180.0]), np.array([45.0, 55.0, 125.0])))
        self.assertEqual(inside.tolist(), [True, False, True])


class WidthProfileTests(unittest.TestCase):
    def test_point_tip_tapers_to_zero_and_blunt_keeps_width(self) -> None:
        pts = np.stack([np.zeros(50), np.linspace(0.0, -0.2, 50), np.zeros(50)], axis=1)
        point = fh.Lock(points=pts, width=0.04, thickness=0.008, group="t", taper_len=0.03)
        blunt = fh.Lock(points=pts, width=0.04, thickness=0.008, group="t", tip="blunt")
        s = np.array([0.0, 0.1, 0.2])
        w_point, _ = fh.width_profile(point, s, 0.2)
        w_blunt, _ = fh.width_profile(blunt, s, 0.2)
        self.assertAlmostEqual(float(w_point[-1]), 0.0, places=6)
        self.assertGreater(float(w_blunt[-1]), 0.75)
        self.assertAlmostEqual(float(w_point[1]), 1.0, places=6)


def _hanging_locks(lengths: list[float], xs: list[float], tip: str = "point") -> list[fh.Lock]:
    """머리 앞(z 0.1)에서 아래로 늘어진 평행 가닥들(합성 띠 그룹)."""
    locks = []
    for x, length in zip(xs, lengths, strict=True):
        ys = np.linspace(0.5, 0.5 - length, 80)
        pts = np.stack([np.full_like(ys, x), ys, np.full_like(ys, 0.10)], axis=1)
        locks.append(fh.Lock(points=pts, width=0.040, thickness=0.008, group="t", tip=tip, split_len=0.02, taper_len=0.02, strip="t"))
    return locks


class StripGroupTests(unittest.TestCase):
    """띠 그룹: 이웃끼리 경계를 공유하고(구멍 없음), 풀린 끝에서 조각이 꼬이지 않고(나비넥타이), 닫힌 메시여야 한다."""

    def setUp(self) -> None:
        self.frame = SimpleNamespace(center=np.array([0.0, 0.3, 0.0]))
        self.spec = {"closed": False, "edge": 0.6, "bulge": 0.2, "diverge": 99.0, "columns": (6, 4, 2), "spacing": 1.0}

    def test_pieces_are_closed_meshes(self) -> None:
        pieces = fh.sweep_strip_group(self.frame, _hanging_locks([0.20, 0.21, 0.19], [-0.03, 0.0, 0.03]), self.spec, 0)
        for piece in pieces:
            self.assertTrue(all(count == 2 for count in edge_counts(piece.triangles).values()))
            self.assertGreater(signed_volume(piece.positions, piece.triangles), 0.0)

    def test_neighbours_share_boundary_until_split(self) -> None:
        locks = _hanging_locks([0.20, 0.215], [-0.02, 0.02])
        left, right = fh.sweep_strip_group(self.frame, locks, self.spec, 0)
        cols = 6
        for piece, column in ((left, cols - 1), (right, 0)):
            n = (len(piece.positions) - 2) // (2 * cols)
            piece.edge = piece.positions[: n * 2 * cols].reshape(n, 2 * cols, 3)[:, column]
        # 위쪽(끝 6 cm 전까지)은 두 조각의 마주 보는 가장자리가 겹침 폭(1 mm) 안에서 만난다
        upper_left = left.edge[left.edge[:, 1] > 0.5 - 0.14]
        upper_right = right.edge[right.edge[:, 1] > 0.5 - 0.14]
        self.assertLess(float(np.abs(upper_left[:, 0] - (-upper_right[:, 0])).max()), 0.003)
        self.assertLess(float(upper_left[:, 0].max() - upper_right[:, 0].min()), 2.5 * fh.STRIP_OVERLAP_M + 1e-6)

    def test_free_tips_do_not_cross_sides(self) -> None:
        """나비넥타이 꼬임 회귀 시험: 고리 순서가 어느 쪽이든(왼→오, 오→왼) 조각의 윗면 가로 순서가 모든 고리에서 같은 방향이고
        경계를 공유하는 위쪽 고리도 가닥 폭의 절반 이상을 유지한다. 이웃의 좌우를 고리 순서로 정하던 옛 코드는 한쪽 순서에서
        이웃 쪽 경계와 자유 가장자리가 같은 쪽으로 몰려 폭이 0으로 접히고, 풀린 끝에서 가로 순서가 뒤집혔다."""
        cols = 6
        for xs in ([-0.02, 0.02], [0.02, -0.02]):
            locks = _hanging_locks([0.20, 0.215], xs)
            for piece, lock in zip(fh.sweep_strip_group(self.frame, locks, self.spec, 0), locks, strict=True):
                n = (len(piece.positions) - 2) // (2 * cols)
                top = piece.positions[: n * 2 * cols].reshape(n, 2 * cols, 3)[:, :cols]
                spread = top[:, -1, 0] - top[:, 0, 0]
                body = spread[: max(1, n - 3)]  # 끝 몇 고리는 한 점으로 가늘어진다
                self.assertTrue((np.sign(body) == np.sign(body[0])).all(), (xs, np.round(spread, 4)))
                self.assertGreater(float(np.abs(body[: n // 2]).min()), 0.5 * lock.width, (xs, np.round(spread, 4)))

    def test_blunt_pair_stays_attached_to_the_end(self) -> None:
        locks = _hanging_locks([0.20, 0.20], [-0.02, 0.02], tip="blunt")
        left, right = fh.sweep_strip_group(self.frame, locks, self.spec, 0)
        bottom_left = left.positions[left.positions[:, 1] < 0.5 - 0.195]
        bottom_right = right.positions[right.positions[:, 1] < 0.5 - 0.195]
        # 일자 끝: 아래 끝선에서 두 조각 사이 틈이 없다(왼쪽 조각 오른쪽 끝 ≥ 오른쪽 조각 왼쪽 끝 − 겹침)
        self.assertGreaterEqual(float(bottom_left[:, 0].max()), float(bottom_right[:, 0].min()) - 1e-4)


class PrimitiveTests(unittest.TestCase):
    def test_flat_strip_tube_ellipsoid_are_closed_and_outward(self) -> None:
        t = np.linspace(0.0, 1.0, 20)
        path = np.stack([t * 0.1, np.sin(t * 3.0) * 0.02, np.zeros_like(t)], axis=1)
        width_dir = np.tile([0.0, 0.0, 1.0], (20, 1))
        normal_dir = np.tile([0.0, 1.0, 0.0], (20, 1))
        meshes = [
            fh.flat_strip(path, width_dir, normal_dir, np.full(20, 0.02), 0.002, notch=0.005),
            fh.tube(path, np.full(20, 0.003), sides=8),
            fh.ellipsoid(np.zeros(3), (np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0])), (0.01, 0.02, 0.005)),
        ]
        loop = np.stack([np.cos(np.linspace(0, 2 * np.pi, 31)[:-1]) * 0.05, np.zeros(30), np.sin(np.linspace(0, 2 * np.pi, 31)[:-1]) * 0.05], axis=1)
        meshes.append(fh.flat_strip(loop, np.tile([0.0, 1.0, 0.0], (30, 1)), fh.unit(loop), np.full(30, 0.01), 0.002, closed_path=True))
        for positions, triangles, uvs, flow in meshes:
            self.assertTrue(all(count == 2 for count in edge_counts(triangles).values()))
            self.assertGreater(signed_volume(positions, triangles), 0.0)
            self.assertEqual(len(uvs), len(positions))
            self.assertTrue(np.isfinite(positions).all() and np.isfinite(uvs).all())


@unittest.skipUnless((BASE_DIR / "base_model_female.npz").exists(), "실제 베이스 npz가 없다")
class RealBaseTests(unittest.TestCase):
    """실제 여성 베이스: 예산·관통·눈 가림·LOD 단조·GLB 구조·부속 12종."""

    @classmethod
    def setUpClass(cls) -> None:
        from character_kit.base_assembly import load_base_model

        cls.base = load_base_model(BASE_DIR / "base_model_female.npz")
        cls.frame = fh.build_head_frame(cls.base, "female")
        cls.texture, _ = fh.hair_texture()

    def test_styles_meet_budget_and_do_not_penetrate_or_cover_eyes(self) -> None:
        for style in ("soft-bob", "hime-cut", "twin-tail"):
            build = fh.build_style(self.frame, style)
            lods = [fh.assemble_lod(self.frame, build, level) for level in range(len(fh.LOD_SPACING_M))]
            triangles = [len(lod.triangles) for lod in lods]
            self.assertLessEqual(triangles[0], 20_000, style)
            self.assertTrue(all(b < a for a, b in zip(triangles, triangles[1:])), (style, triangles))
            qa = fh.qa_metrics(self.frame, lods[0].positions, lods[0].triangles, lods[0].groups, lods[0].group_names)
            self.assertEqual(qa["verticesInside"], 0, style)
            self.assertEqual(max(qa["eyeCoverage"]), 0.0, style)
            sums = lods[0].weights.sum(axis=1)
            self.assertLess(float(np.abs(sums - 1.0).max()), 1e-6)
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / f"{style}.glb"
                size = fh.write_hair_glb(path, style, self.base, lods, self.texture)
                self.assertLessEqual(size, 1_572_864, style)
                document, _ = parse_glb(path.read_bytes())
            self.assertIn("KHR_mesh_quantization", document.get("extensionsRequired", []))
            self.assertEqual([m["name"] for m in document["materials"]], [f"ts_hair_{style}"])
            names = [node["name"] for node in document["nodes"] if "mesh" in node]
            self.assertEqual(names, [fh.node_name(style, level) for level in range(3)])
            prim = document["meshes"][0]["primitives"][0]
            color = document["accessors"][prim["attributes"]["COLOR_0"]]
            normal = document["accessors"][prim["attributes"]["NORMAL"]]
            self.assertEqual((color["type"], color["componentType"], color.get("normalized")), ("VEC3", 5121, True))  # VEC4면 Babylon이 알파 블렌드로 그린다
            self.assertEqual((normal["componentType"], normal.get("normalized")), (5120, True))
            weights = document["accessors"][prim["attributes"]["WEIGHTS_0"]]
            self.assertEqual((weights["componentType"], weights.get("normalized")), (5123, True))
            self.assertEqual(document["meshes"][0]["extras"]["targetNames"], list(fh.HAIR_MORPHS))

    def test_shape_variant_keeps_topology(self) -> None:
        build = fh.build_style(self.frame, "soft-bob")
        variants = {"shape:length:+": fh.build_style(self.frame, "soft-bob", {"length": 1.0})}
        lod = fh.assemble_lod(self.frame, build, 1, variants)
        delta = lod.shapes["shape:length:+"]
        self.assertEqual(delta.shape, lod.positions.shape)
        self.assertGreater(float(np.linalg.norm(delta, axis=1).max()), 0.005)

    def test_accessories_build_within_budget(self) -> None:
        anchors = fh.accessory_anchors(self.frame)
        acc_texture, _ = fh.accessory_texture()
        from character_kit import garment_fit as gf

        for accessory in fh.HAIR_ACCESSORY_IDS:
            mesh = fh.build_accessory(self.frame, accessory, anchors)
            self.assertLessEqual(len(mesh["triangles"]), fh.ACCESSORY_TRIANGLES, accessory)
            self.assertEqual(sorted(mesh["deltas"]), sorted(fh.ACCESSORY_MORPHS))
            d, _, _ = gf.signed_distance(mesh["positions"], self.frame.collision, self.frame.collision_field)
            self.assertGreaterEqual(float(d.min()), 0.0, accessory)
            fit = np.linalg.norm(mesh["deltas"]["shape:fit:+"], axis=1)
            self.assertGreater(float(fit.max()), 0.002, accessory)
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / f"{accessory}.glb"
                fh.write_accessory_glb(path, accessory, self.base, mesh, self.texture, acc_texture)
                document, _ = parse_glb(path.read_bytes())
            self.assertEqual([node["name"] for node in document["nodes"] if "mesh" in node], [fh.accessory_node_name(accessory)])
            zones = {material["name"] for material in document["materials"]}
            if accessory.startswith("ahoge"):
                self.assertEqual(zones, {f"ts_hairacc_hair_{accessory}"})
            else:
                self.assertIn(f"ts_hairacc_{accessory}", zones)


if __name__ == "__main__":
    unittest.main(verbosity=2)
