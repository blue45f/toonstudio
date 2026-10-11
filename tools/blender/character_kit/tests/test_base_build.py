"""여성 베이스 조립 통합 시험 — 실제 HBM 추출 npz로 `build_base`를 한 번 돌려 결과의 계약 준수를 확인한다 (표준 라이브러리 unittest).

실행: python -I tools/blender/character_kit/tests/test_base_build.py   (bpy가 있는 파이썬, 약 40초)

입력이 없으면 건너뛴다(통과가 아니라 skip으로 표시된다):
- HBM 추출 npz: `~/.cache/toonstudio-kit/hbm-npz/hbm_female.npz` (환경변수 `CHARACTER_KIT_HBM_NPZ`로 바꿀 수 있다)
- 계약 덤프 JSON: `~/.cache/toonstudio-kit/out/contract.json`이 있으면 그것을, 없으면 저장소 루트에서
  `pnpm exec tsx scripts/blender/dump-kit-contract.mjs`로 만든다(`CHARACTER_KIT_CONTRACT_JSON`으로 바꿀 수 있다).
검증기(`scripts/verify-character-kit.mjs`)의 V1~V20이 최종 판정이고, 여기서는 그중 베이스가 책임지는 계약을 빠르게 회귀 확인한다.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE))

from character_kit import base_assembly as ba
from character_kit import build_irises
from character_kit import contract as contract_mod
from character_kit import kit_manifest as km

from test_base_assembly import read_accessor, split_glb

CACHE = Path.home() / ".cache" / "toonstudio-kit"
NPZ = Path(os.environ.get("CHARACTER_KIT_HBM_NPZ", CACHE / "hbm-npz" / "hbm_female.npz"))


def find_contract(workdir: Path) -> Path | None:
    explicit = os.environ.get("CHARACTER_KIT_CONTRACT_JSON")
    if explicit and Path(explicit).exists():
        return Path(explicit)
    cached = CACHE / "out" / "contract.json"
    if cached.exists():
        return cached
    if (REPO_ROOT / "node_modules").is_dir() and shutil.which("pnpm"):
        target = workdir / "contract.json"
        result = subprocess.run(["pnpm", "exec", "tsx", "scripts/blender/dump-kit-contract.mjs", "--out", str(target)], cwd=REPO_ROOT, capture_output=True, text=True, timeout=300)
        if result.returncode == 0 and target.exists():
            return target
    return None


class BaseBuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workdir = Path(tempfile.mkdtemp(prefix="base-build-test-"))
        cls.addClassCleanup(shutil.rmtree, cls.workdir, ignore_errors=True)
        if not NPZ.exists():
            raise unittest.SkipTest(f"HBM 추출 npz가 없습니다: {NPZ}")
        contract_path = find_contract(cls.workdir)
        if contract_path is None:
            raise unittest.SkipTest("계약 덤프 JSON을 찾거나 만들지 못했습니다.")
        cls.contract = contract_mod.load(contract_path)
        cls.ctx = ba.load_context(NPZ, contract_path)
        cls.build = ba.build_base(cls.ctx, progress=lambda *_: None)
        cls.meshes = {mesh.name: mesh for mesh in cls.build.meshes}

    def prim(self, name: str, index: int = 0) -> ba.Prim:
        return self.meshes[name].prims[index]

    def test_nine_base_meshes_in_contract_order(self) -> None:
        self.assertEqual([mesh.name for mesh in self.build.meshes], [spec["node"] for spec in self.contract.raw["baseMeshSpecs"]])
        mouth = self.meshes["TS_Mouth"]
        self.assertEqual([prim.material for prim in mouth.prims], ["ts_teeth", "ts_tongue"])

    def test_every_prim_has_the_coverage_morphs_for_its_role(self) -> None:
        for mesh in self.build.meshes:
            for role, prim in zip(mesh.roles, mesh.prims, strict=True):
                missing = [name for name in self.contract.coverage(role) if name not in prim.morphs]
                self.assertEqual(missing, [], f"{mesh.name}/{role}")
                for name, delta in prim.morphs.items():
                    self.assertEqual(delta.shape, (len(prim.positions), 3), f"{mesh.name}:{name}")
                    self.assertEqual(delta.dtype, np.float32)
                    self.assertTrue(np.isfinite(delta).all(), f"{mesh.name}:{name}")

    def test_neck_seam_deltas_are_identical_on_both_sides(self) -> None:
        body, head = self.prim("TS_Body"), self.prim("TS_Head")
        result = ba.seam_mismatch(body.positions, body.morphs, head.positions, head.morphs, tolerance=1e-6)
        self.assertGreater(result["pairs"], 100)
        self.assertGreaterEqual(len(result["shared"]), 8)
        self.assertLessEqual(result["maxDelta"], 1e-9, result["worst"])

    def test_body_regions_are_contiguous_and_cover_every_triangle(self) -> None:
        regions = sorted(self.build.body_regions, key=lambda item: item["indexStart"])
        # TS_Body의 인덱스 범위로 나뉘는 것은 `head`를 뺀 15개다(`head` 영역은 TS_Head에만 있다, 명세 3.4)
        self.assertEqual({region["id"] for region in regions}, set(self.contract.region_ids) - {"head"})
        self.assertEqual({region["id"] for region in regions}, set(self.contract.hideable_region_ids))
        cursor = 0
        for region in regions:
            self.assertEqual(region["indexStart"], cursor, region["id"])
            self.assertEqual(region["indexCount"] % 3, 0)
            cursor += region["indexCount"]
        self.assertEqual(cursor, len(self.prim("TS_Body").triangles) * 3)
        head_region = self.contract.region_ids.index("head")
        self.assertTrue(np.all(self.prim("TS_Head").region == head_region))  # 머리 정점의 `_REGION`은 모두 head

    def test_triangle_budgets(self) -> None:
        budget = self.contract.budget["triangles"]
        count = {mesh.name: sum(len(prim.triangles) for prim in mesh.prims) for mesh in self.build.meshes}
        self.assertLessEqual(count["TS_Body"] + count["TS_Head"], budget["bodyAndHead"])
        self.assertLessEqual(count["TS_Underwear"], budget["underwear"])
        face_parts = sum(count[name] for name in count if name not in ("TS_Body", "TS_Head", "TS_Underwear"))
        iris_nodes, _ = build_irises.build_iris_nodes(self.ctx)
        face_parts += sum(len(prim.triangles) for node in iris_nodes for prim in node.prims)
        self.assertLessEqual(face_parts, budget["faceParts"])

    def test_jaw_open_moves_the_lower_lip_far_more_than_the_upper_lip(self) -> None:
        head = self.prim("TS_Head")
        centre = (np.abs(head.positions[:, 0]) < 0.002) & (head.positions[:, 2] > 0.14)
        upper = centre & (head.positions[:, 1] > ba.JAW_OCCLUSAL_Y + 0.002) & (head.positions[:, 1] < ba.JAW_OCCLUSAL_Y + 0.010)
        lower = centre & (head.positions[:, 1] < ba.JAW_OCCLUSAL_Y - 0.002) & (head.positions[:, 1] > ba.JAW_OCCLUSAL_Y - 0.012)
        self.assertGreater(int(upper.sum()), 2)
        self.assertGreater(int(lower.sum()), 2)
        delta = head.morphs["facs:jawOpen"]
        self.assertGreater(float(-delta[lower, 1].mean()), 0.020)  # 아랫입술은 2 cm 넘게 내려간다
        self.assertLess(float(np.abs(delta[upper, 1]).max()), 0.004)  # 윗입술은 거의 그대로다

    def test_mouth_interior_follows_the_jaw_smoothly(self) -> None:
        # 입꼬리 안쪽 주름에서 열릴 때 늘어나는 비율이 지느러미를 만들 만큼 커지지 않는다(이어받기 전 107배 → 10배 안쪽)
        head = self.prim("TS_Head")
        positions, delta = head.positions, head.morphs["facs:jawOpen"].astype(np.float64)
        weld = head.origin
        corners = (np.abs(positions[:, 0]) < 0.026) & (positions[:, 1] > 1.43) & (positions[:, 1] < 1.51) & (positions[:, 2] > 0.04)
        edges = np.concatenate([self.build_edges(head.triangles, weld)])
        a, b = edges[:, 0], edges[:, 1]
        selected = corners[a] & corners[b]
        rest = np.linalg.norm(positions[a] - positions[b], axis=1)
        opened = np.linalg.norm((positions[a] + delta[a]) - (positions[b] + delta[b]), axis=1)
        ratio = opened[selected] / np.maximum(rest[selected], 1e-6)
        self.assertLess(float(ratio.max()), 12.0)

    @staticmethod
    def build_edges(triangles: np.ndarray, origin: np.ndarray) -> np.ndarray:
        welded = origin[triangles]
        pairs = np.concatenate([welded[:, [0, 1]], welded[:, [1, 2]], welded[:, [2, 0]]])
        original = np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
        keep = pairs[:, 0] != pairs[:, 1]
        unique = np.unique(np.sort(pairs[keep], axis=1), axis=0, return_index=True)[1]
        return original[keep][unique]

    def test_blink_closes_only_its_own_eye_and_leaves_the_midline_alone(self) -> None:
        head = self.prim("TS_Head")
        x = head.positions[:, 0]
        left = np.linalg.norm(head.morphs["facs:eyeBlinkLeft"], axis=1)
        right = np.linalg.norm(head.morphs["facs:eyeBlinkRight"], axis=1)
        self.assertGreater(float(left.max()), 0.005)
        self.assertGreater(float(right.max()), 0.005)
        self.assertEqual(float(left[x < 0.012].max()), 0.0)  # 왼눈(+x) 깜빡임은 안쪽 눈초리(x ≈ 0.019) 너머로 번지지 않는다
        self.assertEqual(float(right[x > -0.012].max()), 0.0)
        self.assertEqual(float(left[np.abs(x) < 0.012].max()), 0.0)  # 정중선 세로 주름이 없다

    def test_floor_deltas_are_only_tiny_param_morphs(self) -> None:
        applied = self.build.report["floorsApplied"]
        self.assertTrue(all(":param:" in item for item in applied), applied)
        for mesh in self.build.meshes:
            for prim in mesh.prims:
                for name, delta in prim.morphs.items():
                    if any(item.endswith(f":{name}") and item.startswith(mesh.name) for item in applied):
                        self.assertLess(float(np.linalg.norm(delta, axis=1).max()), 0.05)

    def test_skin_textures_are_relative_colours(self) -> None:
        luminance = self.build.report["skinTextureLuminance"]
        self.assertGreaterEqual(luminance["body"], 0.75)
        self.assertGreaterEqual(luminance["head"], 0.75)

    def test_written_glb_matches_the_contract_and_reads_back(self) -> None:
        path = self.workdir / "female.glb"
        size = ba.write_base_glb(self.build, self.build.materials, self.ctx, path)
        self.assertLessEqual(size, self.contract.budget["baseGlbMaxBytes"])
        data = path.read_bytes()
        info = km.inspect_glb(data, "female.glb")
        self.assertEqual(info.joints, self.contract.joints)
        self.assertEqual([mesh.node for mesh in info.meshes], [mesh.name for mesh in self.build.meshes])
        self.assertIn("KHR_mesh_quantization", info.extensions_used)
        document, binary = split_glb(data)
        head_mesh = next(mesh for mesh in document["meshes"] if mesh["name"] == "TS_Head")
        names = head_mesh["extras"]["targetNames"]
        target = head_mesh["primitives"][0]["targets"][names.index("facs:mouthSmile")]
        stored = read_accessor(document, binary, target["POSITION"])
        np.testing.assert_allclose(stored, self.prim("TS_Head").morphs["facs:mouthSmile"], atol=1.0 / ba.QUANT_SCALE)
        # 베이스 몸·머리에는 `_REGION`(UNSIGNED_BYTE, 4바이트 간격)이 있다
        body_prim = next(mesh for mesh in document["meshes"] if mesh["name"] == "TS_Body")["primitives"][0]
        region = document["accessors"][body_prim["attributes"]["_REGION"]]
        self.assertEqual(region["componentType"], 5121)
        self.assertEqual(document["bufferViews"][region["bufferView"]]["byteStride"], 4)

    def test_retarget_npz_round_trip(self) -> None:
        path = self.workdir / "base_model_female.npz"
        ba.export_base_model(self.build, path)
        model = ba.load_base_model(path)
        body = model.mesh("body_")
        np.testing.assert_array_equal(body["tpose_positions"], self.prim("TS_Body").positions)
        np.testing.assert_array_equal(body["triangles"], self.prim("TS_Body").triangles)
        self.assertEqual(model.joint_names, self.contract.joints)
        self.assertEqual(model.region_ids, self.contract.region_ids)
        self.assertEqual({region["id"] for region in model.body_regions}, {region["id"] for region in self.build.body_regions})
        self.assertEqual(sorted(str(name) for name in model.arrays["extra_mesh_names"]), sorted(mesh.name for mesh in self.build.meshes if mesh.name not in ("TS_Body", "TS_Head")))
        self.assertEqual(model.arrays["body_morph_delta"].shape, (len(model.arrays["body_morph_names"]), len(self.prim("TS_Body").positions), 3))
        self.assertIn("joint_offsets_json", model.arrays)
        self.assertTrue(set(model.joint_offsets) <= set(self.contract.required_joint_offset_morphs) | set(self.contract.morph_names))

    def test_iris_part_is_small_and_declares_cleanly(self) -> None:
        nodes, applied = build_irises.build_iris_nodes(self.ctx)
        self.assertEqual([node.name for node in nodes], ["TS_Iris_L", "TS_Iris_R", "TS_Highlight_L", "TS_Highlight_R"])
        for node in nodes:
            role = node.roles[0]
            prim = node.prims[0]
            self.assertEqual(sorted(prim.morphs), sorted(self.contract.coverage(role)), node.name)
            self.assertTrue(np.all(prim.joints[:, 0] == self.ctx.joint_index["TS_Eye." + node.name[-1]]))
        path = self.workdir / "round-large.glb"
        size = ba.write_base_glb(nodes, build_irises.iris_materials(), self.ctx, path)
        self.assertLess(size, 110 * 1024)  # 명세 4.7: 홍채는 ≤ 0.1 MiB 안팎
        info = km.inspect_glb(path.read_bytes(), "round-large.glb")
        materials: dict = {}
        declarations = km.part_mesh_declarations(info, km.PartEntry("irises/round-large", "female", "parts/female/irises/round-large.glb"), self.contract, materials)
        self.assertEqual(sorted(item["role"] for item in declarations), ["eye-highlight", "eye-highlight", "iris", "iris"])
        self.assertEqual(materials["ts_iris"]["tint"], {"mode": "recolor", "colorKey": "iris"})
        self.assertEqual(materials["ts_highlight"]["tint"]["mode"], "fixed")
        self.assertTrue(all(item.split(":")[1] == "param" for item in applied))


if __name__ == "__main__":
    unittest.main()
