"""`kit_manifest`(kit.json 작성기)의 단위 시험 (표준 라이브러리 unittest, 합성 GLB만 쓴다).

실행: python -I tools/blender/character_kit/tests/test_kit_manifest.py

- GLB 검사·파츠 찾기·레지스트리 검증·manifest 모양·`hides` 규칙을 작은 합성 키트로 확인한다.
- Hyper3D 파생 파츠의 출처(`provenance.sources`, 요약, NOTICE.md)를 확인한다: 등록된 파츠에만 항목이 생기고, 계약·검증기 V4가 요구하는 값이
  모두 있으며, 값이 모자라면 한글 사유로 멈춘다.
- 계약 덤프가 필요하다: `CHARACTER_KIT_CONTRACT_JSON` → `~/.cache/toonstudio-kit/out/contract.json` → 저장소 루트에서
  `node_modules/.bin/tsx scripts/blender/dump-kit-contract.mjs` 순으로 구한다(pnpm은 링크된 작업 폴더에서 재설치를 시도하므로 쓰지 않는다).
  셋 다 안 되면 그 시험은 건너뛴다.
- 손 기록 보존(`PreservedRecords`): 이전 kit.json의 미제공 사유·hides·summaryKo와 NOTICE의 제외 역사 절이 새 파일로 옮겨지는지 본다.
- `deriveKitCapabilities`(TS)는 합성 키트의 모양이 그 규칙의 입력으로 부적합해 시험에서는 대체하고, node/tsx가 있으면 실제 키트 형태의
  최소 manifest로 한 번 호출해 본다.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE.parents[1]))

from character_kit import contract as contract_mod
from character_kit import glbwriter
from character_kit import kit_manifest as km

CACHE = Path.home() / ".cache" / "toonstudio-kit"
TSX = REPO_ROOT / "node_modules" / ".bin" / "tsx"
_CONTRACT_CACHE: dict[str, contract_mod.Contract | None] = {}


def load_contract() -> contract_mod.Contract | None:
    """계약 덤프를 읽는다(환경변수 → 캐시 → 저장소에서 새로 덤프). 못 구하면 None."""
    if "value" in _CONTRACT_CACHE:
        return _CONTRACT_CACHE["value"]
    path: Path | None = None
    explicit = os.environ.get("CHARACTER_KIT_CONTRACT_JSON")
    if explicit and Path(explicit).exists():
        path = Path(explicit)
    elif (CACHE / "out" / "contract.json").exists():
        path = CACHE / "out" / "contract.json"
    elif TSX.exists():
        workdir = Path(tempfile.mkdtemp(prefix="kit-contract-"))
        target = workdir / "contract.json"
        result = subprocess.run([str(TSX), "scripts/blender/dump-kit-contract.mjs", "--out", str(target)], cwd=REPO_ROOT, capture_output=True, text=True, timeout=300)
        path = target if result.returncode == 0 and target.exists() else None
    _CONTRACT_CACHE["value"] = None if path is None else contract_mod.load(path)
    return _CONTRACT_CACHE["value"]


BASE_MESHES: dict[str, list[tuple[str, list[str]]]] = {
    "TS_Body": [("ts_skin_body", ["param:waist:+"])],
    "TS_Head": [("ts_skin_head", ["param:waist:+", "facs:jawOpen"])],
    "TS_Eye_L": [("ts_eye", ["param:eyeSize:+"])],
    "TS_Eye_R": [("ts_eye", ["param:eyeSize:+"])],
    "TS_Mouth": [("ts_teeth", ["param:height:+"]), ("ts_tongue", ["param:height:+"])],
    "TS_Lashes": [("ts_lashes", ["param:eyeSize:+"])],
    "TS_Brow_L": [("ts_brow", ["facs:browDown"])],
    "TS_Brow_R": [("ts_brow", ["facs:browDown"])],
    "TS_Underwear": [("ts_underwear", ["param:waist:+"])],
}


def synthetic_glb(contract: contract_mod.Contract, meshes: dict[str, list[tuple[str, list[str]]]], joints: list[str] | None = None) -> bytes:
    """계약 스켈레톤(68 joint)에 스킨된 한 삼각형짜리 메시들의 GLB. `meshes`: 노드 이름 → [(재질, morph 이름들)] 프리미티브 목록."""
    writer = glbwriter.GlbWriter()
    names = joints or contract.joints
    parents = {name: contract.parents.get(name) for name in names}
    writer.add_skeleton(names, parents, np.zeros((len(names), 3)))
    material_index: dict[str, int] = {}
    for node, primitives in meshes.items():
        built = []
        for material, morphs in primitives:
            if material not in material_index:
                material_index[material] = writer.add_material(material)
            built.append(
                glbwriter.Primitive(
                    positions=np.array([[0, 0, 0], [0.1, 0, 0], [0, 0.1, 0]], dtype=np.float32),
                    indices=np.array([[0, 1, 2]], dtype=np.uint32),
                    normals=np.tile([0.0, 0.0, 1.0], (3, 1)).astype(np.float32),
                    uvs=np.array([[0, 0], [1, 0], [0, 1]], dtype=np.float32),
                    joints=np.zeros((3, 4), dtype=np.uint8),
                    weights=np.tile([1.0, 0.0, 0.0, 0.0], (3, 1)).astype(np.float32),
                    material=material_index[material],
                    targets=[glbwriter.MorphTarget(name, np.full((3, 3), 0.001, dtype=np.float32)) for name in morphs],
                )
            )
        writer.add_mesh_node(node, built, skinned=True)
    return writer.to_bytes()


class InspectGlbTest(unittest.TestCase):
    def test_reads_joints_meshes_materials_and_morphs(self) -> None:
        contract = load_contract()
        if contract is None:
            self.skipTest("계약 덤프를 구하지 못했습니다.")
        info = km.inspect_glb(synthetic_glb(contract, BASE_MESHES), "base.glb")
        self.assertEqual(info.joints, contract.joints)
        self.assertEqual(info.joint_parents[contract.joints[0]], "Armature")  # 뿌리 joint의 부모는 Armature
        mouth = info.mesh("TS_Mouth")
        assert mouth is not None
        self.assertEqual([prim.material for prim in mouth.prims], ["ts_teeth", "ts_tongue"])
        self.assertEqual(mouth.triangles, 2)
        self.assertTrue(mouth.skinned)
        head = info.mesh("TS_Head")
        assert head is not None
        self.assertEqual(head.morphs, ["param:waist:+", "facs:jawOpen"])
        self.assertEqual(info.transformed_mesh_nodes, [])
        self.assertIn("ts_ eye".replace(" ", ""), info.materials)

    def test_rejects_non_glb_data(self) -> None:
        with self.assertRaises(km.ManifestError):
            km.inspect_glb(b"not a glb at all, just text bytes here", "x")
        with self.assertRaises(km.ManifestError):
            km.parse_glb(b"glTF" + b"\x02\x00\x00\x00" + b"\x99\x00\x00\x00" + b"\x00" * 20)  # 헤더 길이와 실제 크기가 다르다


class DiscoverPartsTest(unittest.TestCase):
    def test_finds_parts_by_layout_and_applies_the_hides_table(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            kit = Path(tmp)
            for relative in ("parts/female/top/tee.glb", "parts/female/hair/soft-bob.glb", "parts/male/top/tee.glb", "parts/female/notes.txt"):
                path = kit / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"x")
            hides = {"top/tee": {"female": {"hides": ["neck", "torso"]}}}
            entries = km.discover_parts(kit, ["female"], hides)
            by_id = {entry.preset_id: entry for entry in entries}
            self.assertEqual(sorted(by_id), ["hair/soft-bob", "top/tee"])  # 남성 폴더와 .glb가 아닌 파일은 무시한다
            self.assertEqual(by_id["top/tee"].hides, ("neck", "torso"))
            self.assertEqual(by_id["hair/soft-bob"].hides, ())
            self.assertEqual(by_id["top/tee"].path, "parts/female/top/tee.glb")
            self.assertEqual((by_id["top/tee"].slot, by_id["top/tee"].name), ("top", "tee"))


class ManifestBuildTest(unittest.TestCase):
    """합성 키트(베이스 + 상의·홍채·헤어)로 레지스트리와 manifest 모양을 확인한다."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = load_contract()
        if cls.contract is None:
            raise unittest.SkipTest("계약 덤프를 구하지 못했습니다.")
        cls.workdir = Path(tempfile.mkdtemp(prefix="kit-manifest-test-"))
        cls.addClassCleanup(shutil.rmtree, cls.workdir, ignore_errors=True)

    def make_kit(self, name: str, parts: dict[str, dict[str, list[tuple[str, list[str]]]]], joints: list[str] | None = None) -> Path:
        kit = self.workdir / name
        (kit / "bases").mkdir(parents=True)
        (kit / "bases" / "female.glb").write_bytes(synthetic_glb(self.contract, BASE_MESHES))
        for preset_id, meshes in parts.items():
            slot, preset = preset_id.split("/")
            path = kit / "parts" / "female" / slot / f"{preset}.glb"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(synthetic_glb(self.contract, meshes, joints))
        return kit

    def build(self, kit: Path, hides: dict | None = None, hyper3d: km.Hyper3dSources | None = None) -> dict:
        meta = {"heightM": 1.64, "bodyRegions": [{"id": "torso", "mesh": "TS_Body", "indexStart": 0, "indexCount": 3}], "jointOffsets": {}}
        parts = km.discover_parts(kit, ["female"], hides or {})
        with mock.patch.object(km, "derive_capabilities", return_value={"female": {"stub": True}}):
            return km.build_manifest(
                kit_dir=kit,
                contract=self.contract,
                base_id="female",
                base_path="bases/female.glb",
                base_meta=meta,
                parts=parts,
                repo_root=REPO_ROOT,
                generator_command=["test"],
                blender_version="test",
                hyper3d_sources=hyper3d,
            )

    TOP = {"TS_Top_tee": [("ts_top", ["param:waist:+"])]}
    IRIS = {
        "TS_Iris_L": [("ts_iris", ["param:eyeSize:+"])],
        "TS_Iris_R": [("ts_iris", ["param:eyeSize:+"])],
        "TS_Highlight_L": [("ts_highlight", ["param:eyeSize:+"])],
        "TS_Highlight_R": [("ts_highlight", ["param:eyeSize:+"])],
    }
    HAIR = {f"TS_AuthoredHair_soft-bob_LOD{lod}": [("ts_hair", ["param:headSize:+"])] for lod in range(3)}

    def test_manifest_declares_every_vocabulary_preset_and_registered_parts(self) -> None:
        kit = self.make_kit("full", {"top/tee": self.TOP, "irises/round-large": self.IRIS, "hair/soft-bob": self.HAIR})
        manifest = self.build(kit, hides={"top/tee": {"female": {"hides": ["neck"]}}})
        vocabulary = self.contract.raw["presetVocabulary"]
        expected = sum(len(vocabulary[slot]) for slot in self.contract.raw["partSlots"])
        self.assertEqual(len(manifest["parts"]), expected)
        self.assertEqual(expected, 32)
        by_id = {part["id"]: part for part in manifest["parts"]}
        tee = by_id["top/tee"]["variants"]["female"]
        self.assertEqual(tee["hides"], ["neck"])
        self.assertEqual([mesh["role"] for mesh in tee["meshes"]], ["top"])
        self.assertEqual(tee["file"]["path"], "parts/female/top/tee.glb")
        self.assertRegex(tee["file"]["sha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(tee["file"]["bytes"], (kit / "parts/female/top/tee.glb").stat().st_size)
        hair = by_id["hair/soft-bob"]["variants"]["female"]
        self.assertEqual([mesh["lod"] for mesh in hair["meshes"]], [0, 1, 2])
        iris = by_id["irises/round-large"]["variants"]["female"]
        self.assertEqual(sorted(mesh["role"] for mesh in iris["meshes"]), ["eye-highlight", "eye-highlight", "iris", "iris"])
        for preset_id, part in by_id.items():  # 등록되지 않은 프리셋은 한글 사유로 선언한다
            if not part["variants"]:
                reason = part["unavailable"]["female"]
                self.assertRegex(reason, r"[가-힣]", preset_id)
        # 미등록 프리셋의 기본 사유: 계약 필수 파츠면 필수라는 사유, 아니면 선택 사유(2026-10-14 이후 필수는 irises/round-large뿐이라 계약에서 읽는다)
        required = set(self.contract.required_presets)
        for preset_id, part in by_id.items():
            if not part["variants"]:
                self.assertEqual(part["unavailable"]["female"], km.REQUIRED_REASON_KO if preset_id in required else km.OPTIONAL_REASON_KO, preset_id)
        self.assertEqual(by_id["hair/short-layered"]["unavailable"]["female"], km.OPTIONAL_REASON_KO)
        widened = contract_mod.Contract({**self.contract.raw, "requiredPresets": [*self.contract.required_presets, "bottom/jeans"]})
        self.assertEqual(km.default_unavailable_reason("bottom/jeans", widened), km.REQUIRED_REASON_KO)  # 필수 파츠는 필수라는 사유
        self.assertEqual(km.default_unavailable_reason("bottom/jeans", self.contract), km.REQUIRED_REASON_KO if "bottom/jeans" in required else km.OPTIONAL_REASON_KO)

    def test_two_bases_get_variants_per_base_and_korean_reasons_for_the_missing_one(self) -> None:
        kit = self.make_kit("two-bases", {"top/tee": self.TOP, "irises/round-large": self.IRIS})
        (kit / "bases" / "male.glb").write_bytes(synthetic_glb(self.contract, BASE_MESHES))
        male_tee = kit / "parts" / "male" / "top" / "tee.glb"
        male_tee.parent.mkdir(parents=True, exist_ok=True)
        male_tee.write_bytes(synthetic_glb(self.contract, self.TOP))
        meta = {"heightM": 1.64, "bodyRegions": [{"id": "torso", "mesh": "TS_Body", "indexStart": 0, "indexCount": 3}], "jointOffsets": {}}
        parts = km.discover_parts(kit, ["female", "male"], {})
        with mock.patch.object(km, "derive_capabilities", return_value={"female": {"stub": True}, "male": {"stub": True}}):
            manifest = km.build_manifest(
                kit_dir=kit,
                contract=self.contract,
                base_id="female",
                base_path="bases/female.glb",
                base_meta=meta,
                parts=parts,
                repo_root=REPO_ROOT,
                generator_command=["test"],
                blender_version="test",
                extra_bases=[{"base_id": "male", "base_path": "bases/male.glb", "base_meta": meta}],
            )
        self.assertEqual(sorted(manifest["bases"]), ["female", "male"])
        by_id = {part["id"]: part for part in manifest["parts"]}
        self.assertEqual(sorted(by_id["top/tee"]["variants"]), ["female", "male"])
        self.assertEqual(by_id["top/tee"]["variants"]["male"]["file"]["path"], "parts/male/top/tee.glb")
        self.assertEqual(sorted(by_id["irises/round-large"]["variants"]), ["female"])
        self.assertRegex(by_id["irises/round-large"]["unavailable"]["male"], r"[가-힣]")
        for preset_id, part in by_id.items():  # 어느 베이스에도 없는 프리셋은 두 베이스 모두 한글 사유가 있다
            if not part["variants"]:
                self.assertEqual(sorted(part["unavailable"]), ["female", "male"], preset_id)

    def test_materials_follow_the_role_tint_rules_and_are_registered_once(self) -> None:
        kit = self.make_kit("materials", {"top/tee": self.TOP, "irises/round-large": self.IRIS})
        materials = self.build(kit)["materials"]
        self.assertEqual(materials["ts_skin_body"]["tint"], {"mode": "recolor", "colorKey": "skin"})
        self.assertEqual(materials["ts_iris"]["tint"], {"mode": "recolor", "colorKey": "iris"})
        self.assertEqual(materials["ts_top"]["tint"], {"mode": "recolor", "colorKey": "top"})
        for fixed in ("ts_eye", "ts_teeth", "ts_tongue", "ts_underwear", "ts_highlight"):
            self.assertEqual(materials[fixed]["tint"], {"mode": "fixed", "hex": km.FIXED_TINT_HEX}, fixed)

    def test_registry_errors_are_reported_in_korean(self) -> None:
        wrong_joint_order = list(self.contract.joints)
        wrong_joint_order[3], wrong_joint_order[4] = wrong_joint_order[4], wrong_joint_order[3]
        cases = {
            "joint 순서": (self.make_kit("bad-joints", {"top/tee": self.TOP}, joints=wrong_joint_order), None, "joint"),
            "어휘에 없는 파츠": (self.make_kit("bad-id", {"top/nonexistent": {"TS_Top_nonexistent": [("ts_top", [])]}}), None, "어휘"),
            "메시 이름": (self.make_kit("bad-node", {"top/tee": {"TS_Top_other": [("ts_top", [])]}}), None, "TS_Top_tee"),
            "헤어 숨김": (self.make_kit("bad-hair-hides", {"hair/soft-bob": self.HAIR}), {"hair/soft-bob": {"female": {"hides": ["neck"]}}}, "숨길 수 없습니다"),
            "숨길 수 없는 영역": (self.make_kit("bad-region", {"top/tee": self.TOP}), {"top/tee": {"female": {"hides": ["head"]}}}, "숨길 수 없는 영역"),
            "필수 역할": (self.make_kit("bad-iris", {"irises/round-large": {"TS_Iris_L": [("ts_iris", [])], "TS_Iris_R": [("ts_iris", [])]}}), None, "eye-highlight"),
        }
        for label, (kit, hides, fragment) in cases.items():
            with self.subTest(label):
                with self.assertRaises(km.ManifestError) as caught:
                    self.build(kit, hides)
                self.assertIn(fragment, str(caught.exception))
                self.assertRegex(str(caught.exception), r"[가-힣]")

    def test_capabilities_come_from_the_typescript_rule_function(self) -> None:
        kit = self.make_kit("caps", {"top/tee": self.TOP})
        manifest = self.build(kit)
        self.assertEqual(manifest["slotCapabilities"], {"female": {"stub": True}})  # derive_capabilities의 결과를 그대로 싣는다

    @unittest.skipUnless((REPO_ROOT / "node_modules").is_dir() and shutil.which("node"), "node와 node_modules가 필요합니다")
    def test_real_derive_capabilities_reports_available_and_partial_slots(self) -> None:
        kit = self.make_kit("real-caps", {"top/tee": self.TOP, "irises/round-large": self.IRIS})
        meta = {"heightM": 1.64, "bodyRegions": [], "jointOffsets": {}}
        manifest = km.build_manifest(
            kit_dir=kit, contract=self.contract, base_id="female", base_path="bases/female.glb", base_meta=meta, parts=km.discover_parts(kit, ["female"], {}), repo_root=REPO_ROOT, generator_command=["test"], blender_version="test"
        )
        capabilities = manifest["slotCapabilities"]["female"]
        self.assertEqual(capabilities["top"]["status"], "partial")  # 5종 중 1종만 제공
        self.assertIn("unavailablePresets", capabilities["top"])
        self.assertIn("reasonKo", capabilities["top"])
        self.assertEqual(capabilities["irises"]["status"], "partial")  # 홍채 5종 중 1종
        self.assertEqual(len(capabilities["irises"]["unavailablePresets"]), 4)
        self.assertEqual(set(capabilities), set(self.contract.raw["partSlots"]) | {"face-shape", "eyes", "nose", "mouth", "ears", "body", "expression", "pose", "hand-pose"})  # 15슬롯 전부 선언


class Hyper3dProvenanceTest(unittest.TestCase):
    """리드 요청: Hyper3D 파생 파츠의 출처를 kit.json provenance와 NOTICE.md에 정직하게 남긴다."""

    UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    SHA = re.compile(r"^[0-9a-f]{64}$")

    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = load_contract()
        if cls.contract is None:
            raise unittest.SkipTest("계약 덤프를 구하지 못했습니다.")
        cls.sources = km.load_hyper3d_sources(km.HYPER3D_SOURCES_FILE, REPO_ROOT)

    def entries(self, registered: list[str]) -> dict[str, dict]:
        block = km.provenance_block(self.contract, self.sources, registered)
        return {source["id"]: source for source in block["sources"]}

    def test_real_sources_file_loads_and_every_entry_is_valid(self) -> None:
        self.assertEqual(self.sources.record_doc, "apps/character-lab/docs/hyper3d-terms-record.md")
        self.assertTrue((REPO_ROOT / self.sources.record_doc).is_file())
        # 파일럿 Hyper3D 파생 3종(의상·신발)은 기록으로 남아 있고, 그 밖의 항목은 프리셋 표(garment_presets.PRESETS)에 있는 프리셋이어야 한다.
        self.assertLessEqual({"bottom/jeans", "shoes/sneakers", "top/tee"}, set(self.sources.sources))
        # 2026-10-23: 헤어 슬롯은 forge_hair 원본으로 다시 채웠다. hair/* 키가 표에 남으면 원본 헤어가 Hyper3D 파생으로 잘못 적힌다.
        self.assertEqual([key for key in self.sources.sources if key.startswith("hair/")], [])
        from character_kit.garment_presets import PRESETS

        self.assertLessEqual({key.partition("@")[0] for key in self.sources.sources}, set(PRESETS))
        for preset_id, record in self.sources.sources.items():
            entry = km.hyper3d_source_entry(preset_id, record, self.sources.record_doc)
            base_key, _, base_id = preset_id.partition("@")
            self.assertEqual(entry["id"], "hyper3d-" + base_key.replace("/", "-") + (f"-{base_id}" if base_id else ""))

    def test_entries_exist_only_for_registered_parts(self) -> None:
        by_id = self.entries(["top/tee", "irises/round-large"])  # 홍채는 출처 표에 없는 원본 파츠, 청바지는 등록되지 않음
        self.assertIn("hyper3d-top-tee", by_id)
        self.assertNotIn("hyper3d-bottom-jeans", by_id)
        self.assertNotIn("hyper3d-hair-soft-bob", by_id)
        self.assertEqual({"hbm-1.4.1", "toonstudio-original", "hyper3d-top-tee"}, set(by_id))
        self.assertEqual(set(self.entries([])), {"hbm-1.4.1", "toonstudio-original"})  # 파츠가 없으면 항목도 없다
        registered = {"hyper3d-accessory-ribbon", "hyper3d-bottom-jeans", "hyper3d-shoes-sneakers", "hyper3d-top-tee"}
        derived = set(self.entries(["accessory/ribbon", "bottom/jeans", "shoes/sneakers", "top/tee"])) - {"hbm-1.4.1", "toonstudio-original"}
        self.assertLessEqual(registered, derived)
        # 원본 헤어(forge_hair)를 등록해도 Hyper3D 항목은 생기지 않는다(출처 표에 hair/* 키가 없다)
        self.assertEqual(set(self.entries(["hair/soft-bob", "hair/twin-tail"])), {"hbm-1.4.1", "toonstudio-original"})
        # 남성 전용 생성물(`슬롯/이름@male`)이 있는 프리셋은 기본 파츠가 등록돼 있을 때만 `-male` 항목이 따라온다. 그 밖의 항목은 없다.
        self.assertTrue(all(extra.endswith("-male") and extra.removesuffix("-male") in registered for extra in derived - registered), derived - registered)

    def test_base_specific_sources_follow_their_base_part(self) -> None:
        record = dict(self.sources.sources["top/tee"])
        male = dict(record, generationId="11111111-2222-4333-8444-555555555555")
        table = km.Hyper3dSources(record_doc=self.sources.record_doc, sources={"hair/short-layered": record, "hair/short-layered@male": male})
        ids = lambda registered: {s["id"]: s for s in km.provenance_block(self.contract, table, registered)["sources"]}  # noqa: E731
        both = ids(["hair/short-layered"])
        self.assertIn("hyper3d-hair-short-layered", both)
        self.assertIn("hyper3d-hair-short-layered-male", both)
        self.assertEqual(both["hyper3d-hair-short-layered-male"]["generationId"], male["generationId"])
        self.assertEqual(both["hyper3d-hair-short-layered-male"]["name"], "Hyper3D(Rodin Gen-2.5) 생성물 hair/short-layered@male")
        self.assertNotIn("hyper3d-hair-short-layered-male", ids([]))  # 기본 파츠가 등록돼 있지 않으면 베이스 항목도 없다
        with self.assertRaises(km.ManifestError):
            km.hyper3d_source_entry("hair/short-layered@", record, self.sources.record_doc)

    def test_entry_fields_follow_the_lead_specification(self) -> None:
        entry = self.entries(["top/tee"])["hyper3d-top-tee"]
        record = self.sources.sources["top/tee"]
        self.assertEqual(entry["name"], "Hyper3D(Rodin Gen-2.5) 생성물 top/tee")
        self.assertEqual(entry["version"], record["tier"])
        self.assertEqual(entry["url"], record["displayUrl"])
        self.assertEqual(entry["zipSha256"], record["rawSha256"])
        self.assertEqual(entry["license"], "hyper3d-rodin-output")
        self.assertIs(entry["derivative"], True)
        self.assertEqual(entry["changesKo"], record["changesKo"])
        self.assertEqual(entry["generationId"], record["generationId"])
        self.assertEqual(entry["evidenceDoc"], self.sources.record_doc)
        self.assertEqual(set(entry), {"id", "name", "version", "url", "zipSha256", "license", "derivative", "changesKo", "generationId", "evidenceDoc"})

    def test_entries_satisfy_the_contract_and_verifier_v4_rules(self) -> None:
        # character-kit.ts의 manifestIssues·kitSourceSchema와 scripts/verify-character-kit.mjs V4를 파이썬으로 옮긴 검사
        by_id = self.entries(["hair/soft-bob", "bottom/jeans", "shoes/sneakers", "top/tee"])
        for source in by_id.values():
            self.assertIn(source["license"], ("CC0-1.0", "original", "hyper3d-rodin-output"))
            self.assertRegex(source["changesKo"], r"[가-힣]", source["id"])
            if source["license"] != "original":
                self.assertTrue(source["url"].startswith("https://"), source["id"])
                self.assertRegex(source["zipSha256"], self.SHA, source["id"])
            if source["license"] == "hyper3d-rodin-output":
                self.assertIs(source["derivative"], True)
                self.assertRegex(source["generationId"], self.UUID)
                evidence = source["evidenceDoc"]
                self.assertTrue(evidence.startswith("apps/character-lab/docs/") and ".." not in evidence)
                self.assertTrue((REPO_ROOT / evidence).is_file())
            else:
                self.assertNotIn("generationId", source)  # 다른 출처에는 쓸 수 없다
                self.assertNotIn("evidenceDoc", source)
        self.assertEqual(len(by_id), len({source["id"] for source in by_id.values()}))

    def test_missing_or_malformed_fields_stop_with_a_korean_reason(self) -> None:
        good = dict(self.sources.sources["top/tee"])
        broken = {
            "generationId": ("not-a-uuid", "generationId"),
            "displayUrl": ("http://insecure.example/x", "displayUrl"),
            "rawSha256": ("abc123", "rawSha256"),
            "changesKo": ("only english text", "changesKo"),
            "tier": ("", "tier"),
        }
        for key, (value, fragment) in broken.items():
            with self.subTest(key):
                record = dict(good)
                record[key] = value
                with self.assertRaises(km.ManifestError) as caught:
                    km.hyper3d_source_entry("top/tee", record, self.sources.record_doc)
                self.assertIn("top/tee", str(caught.exception))
                self.assertIn(fragment, str(caught.exception))
                self.assertRegex(str(caught.exception), r"[가-힣]")
        record = dict(good)
        del record["generationId"]
        with self.assertRaises(km.ManifestError):
            km.hyper3d_source_entry("top/tee", record, self.sources.record_doc)
        with self.assertRaises(km.ManifestError):
            km.hyper3d_source_entry("teetee", good, self.sources.record_doc)  # 슬롯/이름 형식이 아닌 키

    def test_loader_rejects_a_bad_file_schema_or_record_doc(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "apps/character-lab/docs").mkdir(parents=True)
            (root / "apps/character-lab/docs/hyper3d-terms-record.md").write_text("기록", encoding="utf-8")

            def write(document: dict) -> Path:
                path = root / "sources.json"
                path.write_text(json.dumps(document), encoding="utf-8")
                return path

            valid = {"schema": km.HYPER3D_SOURCES_SCHEMA, "recordDoc": "apps/character-lab/docs/hyper3d-terms-record.md", "sources": {}}
            self.assertEqual(km.load_hyper3d_sources(write(valid), root).sources, {})
            for label, mutation in {
                "다른 schema": {"schema": "other/1"},
                "docs 밖 경로": {"recordDoc": "README.md"},
                "상위 경로": {"recordDoc": "apps/character-lab/docs/../secret.md"},
                "없는 문서": {"recordDoc": "apps/character-lab/docs/missing.md"},
                "sources 없음": {"sources": []},
            }.items():
                with self.subTest(label):
                    with self.assertRaises(km.ManifestError):
                        km.load_hyper3d_sources(write({**valid, **mutation}), root)
            with self.assertRaises(km.ManifestError):
                km.load_hyper3d_sources(root / "missing.json", root)

    def test_summary_and_notice_state_the_limits_honestly(self) -> None:
        registered = ["top/tee", "bottom/jeans"]
        block = km.provenance_block(self.contract, self.sources, registered)
        summary = block["summaryKo"]
        for fragment in ("Hyper3D", "top/tee", "bottom/jeans", "법적 허용을 뜻하지 않", self.sources.record_doc, "generationId", "원본 GLB는 저장소에 없"):
            self.assertIn(fragment, summary)
        manifest = {
            "generatedAt": "2026-10-11",
            "generator": {"tool": "tools/blender/character_kit", "blender": "test"},
            "provenance": block,
            "parts": [{"id": preset_id, "variants": {"female": {}}} for preset_id in registered],
        }
        notice = km.notice_text(self.contract, manifest)
        for fragment in (
            "원천 3",
            "법적 허용을 뜻하지 않는다",
            self.sources.record_doc,
            "원본 GLB는 저장소에 없다",
            self.sources.sources["top/tee"]["generationId"],
            self.sources.sources["bottom/jeans"]["rawSha256"],
            "결과 페이지가 계속 열리는지는 확인하지 않았다",
        ):
            self.assertIn(fragment, notice)
        self.assertNotIn(self.sources.sources["shoes/sneakers"]["generationId"], notice)  # 등록되지 않은 파츠는 적지 않는다
        # HBM License 텍스트 불일치 고지는 그대로 유지한다
        for fragment in ("Rain Rig", "Creative Commons", "추정", "확인하지 못했다", "811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515"):
            self.assertIn(fragment, notice)

    def test_without_hyper3d_parts_the_notice_says_none_are_included(self) -> None:
        block = km.provenance_block(self.contract, self.sources, ["irises/round-large"])
        self.assertNotIn("Hyper3D", block["summaryKo"])
        manifest = {"generatedAt": "2026-10-11", "generator": {"tool": "t", "blender": "b"}, "provenance": block, "parts": [{"id": "irises/round-large", "variants": {"female": {}}}]}
        notice = km.notice_text(self.contract, manifest)
        self.assertNotIn("원천 3", notice)
        self.assertIn("Hyper3D(Rodin) 생성물, 상용 제품 에셋", notice)
        self.assertIn("그 출처의 파츠가 없다", notice)

    def test_build_manifest_adds_hyper3d_sources_for_registered_parts_only(self) -> None:
        helper = ManifestBuildTest("test_manifest_declares_every_vocabulary_preset_and_registered_parts")
        helper.contract = self.contract
        workdir = Path(tempfile.mkdtemp(prefix="kit-hyper3d-test-"))
        self.addCleanup(shutil.rmtree, workdir, ignore_errors=True)
        helper.workdir = workdir
        kit = helper.make_kit("hyper3d", {"top/tee": helper.TOP, "irises/round-large": helper.IRIS})
        manifest = helper.build(kit, hyper3d=self.sources)
        ids = [source["id"] for source in manifest["provenance"]["sources"]]
        self.assertEqual(ids, ["hbm-1.4.1", "toonstudio-original", "hyper3d-top-tee"])
        self.assertIn("top/tee", manifest["provenance"]["summaryKo"])
        self.assertNotIn("bottom/jeans", manifest["provenance"]["summaryKo"])

    @unittest.skipUnless(TSX.exists() and shutil.which("node"), "node와 node_modules/.bin/tsx가 필요합니다")
    def test_verifier_v4_accepts_the_generated_provenance(self) -> None:
        helper = ManifestBuildTest("test_manifest_declares_every_vocabulary_preset_and_registered_parts")
        helper.contract = self.contract
        workdir = Path(tempfile.mkdtemp(prefix="kit-v4-test-"))
        self.addCleanup(shutil.rmtree, workdir, ignore_errors=True)
        helper.workdir = workdir
        kit = helper.make_kit("v4", {"top/tee": helper.TOP})
        # V4는 kit.json이 계약 스키마로 해석될 때만 돈다 — 능력 선언은 대체하지 않고 실제 TS 규칙 함수로 만든다
        manifest = km.build_manifest(
            kit_dir=kit,
            contract=self.contract,
            base_id="female",
            base_path="bases/female.glb",
            base_meta={"heightM": 1.64, "bodyRegions": [], "jointOffsets": {}},
            parts=km.discover_parts(kit, ["female"], {}),
            repo_root=REPO_ROOT,
            generator_command=["test"],
            blender_version="test",
            hyper3d_sources=self.sources,
        )
        km.write_manifest(manifest, kit / km.MANIFEST_FILE)
        (kit / km.KIT_NOTICE_FILE).write_text(km.notice_text(self.contract, manifest), encoding="utf-8")
        result = subprocess.run([str(TSX), "scripts/verify-character-kit.mjs", "--root", str(kit), "--base", "female", "--only", "V4"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=300)
        self.assertIn("[통과] V4", result.stdout, result.stdout + result.stderr)
        # 반입 기록 문서 경로를 망가뜨리면 V4가 오류를 낸다(검증기가 실제로 이 항목을 검사하고 있음을 확인)
        for source in manifest["provenance"]["sources"]:
            if source["license"] == "hyper3d-rodin-output":
                source["evidenceDoc"] = "apps/character-lab/docs/does-not-exist.md"
        km.write_manifest(manifest, kit / km.MANIFEST_FILE)
        broken = subprocess.run([str(TSX), "scripts/verify-character-kit.mjs", "--root", str(kit), "--base", "female", "--only", "V4"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=300)
        self.assertIn("[실패] V4", broken.stdout, broken.stdout + broken.stderr)


class PreservedRecordsTest(unittest.TestCase):
    """재생성해도 손으로 남긴 기록(제외 경위·미제공 사유·hides)이 사라지지 않고, 원본 파츠 설명은 키트 내용에서 다시 만들어진다(2026-10-23)."""

    OLD_SUMMARY = "Blender … 원본 디자인, Hyper3D 파생 파츠 33종은 2026-10-14 이 키트에서 제외했습니다. 제외 기록은 apps/character-lab/docs/hyper3d-terms-record.md §9에 남겼습니다."
    OLD_NOTICE = (
        "# 고지\n\n## 원천 1 — HBM\n\n- 옛 문장\n\n"
        "## 원천 3 — Hyper3D(Rodin Gen-2.5) 생성물의 파생 파츠 (license: hyper3d-rodin-output) — 2026-10-14 키트에서 제외\n\n"
        "- **2026-10-14 제외 실행**: 33종 제외.\n\n### hair/short-layered (`hyper3d-hair-short-layered`)\n\n- 생성 id: `f63e1379-d77f-4351-9a6d-74ff796ff91a`\n\n"
        "## 쓰지 않은 것\n\n- 옛 문장\n\n## 들어 있는 파일\n\n- 베이스: `bases/female.glb` (남성 베이스는 이번 빌드에서 만들지 않았다.)\n"
        "- 제외한 Hyper3D 파생 변형 48개의 GLB 파일은 저장소에 없다. 아직 없는 프리셋은 `kit.json`의 `parts[].unavailable`에 한글 사유가 있다. (옛 안내)\n\n## 재현\n\n옛 명령\n"
    )

    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = load_contract()
        if cls.contract is None:
            raise unittest.SkipTest("계약 덤프를 구하지 못했습니다.")

    def build(self, kit: Path, preserved: km.PreservedRecords | None, hides: dict | None = None, hyper3d: km.Hyper3dSources | None = None, licenses: dict | None = None) -> dict:
        meta = {"heightM": 1.64, "bodyRegions": [{"id": "torso", "mesh": "TS_Body", "indexStart": 0, "indexCount": 3}], "jointOffsets": {}}
        with mock.patch.object(km, "derive_capabilities", return_value={"female": {"stub": True}}):
            return km.build_manifest(
                kit_dir=kit, contract=self.contract, base_id="female", base_path="bases/female.glb", base_meta=meta,
                parts=km.discover_parts(kit, ["female"], km.merge_hides_table(preserved, hides)), repo_root=REPO_ROOT,
                generator_command=["test"], blender_version="test", hyper3d_sources=hyper3d, preserved=preserved, registry_licenses=licenses,
            )

    def kit(self, name: str, parts: dict) -> Path:
        helper = ManifestBuildTest("test_manifest_declares_every_vocabulary_preset_and_registered_parts")
        helper.contract = self.contract
        helper.workdir = Path(tempfile.mkdtemp(prefix=f"kit-preserve-{name}-"))
        self.addCleanup(shutil.rmtree, helper.workdir, ignore_errors=True)
        return helper.make_kit(name, parts)

    def test_old_reasons_hides_and_summary_survive_and_the_original_note_is_added_once(self) -> None:
        old = {
            "provenance": {"summaryKo": self.OLD_SUMMARY},
            "parts": [
                {"id": "top/shirt", "variants": {}, "unavailable": {"female": "Hyper3D(Rodin) 파생 파츠입니다. 2026-10-14 키트에서 제외했습니다."}},
                {"id": "top/tee", "variants": {"female": {"hides": ["torso"]}}, "unavailable": {}},
            ],
        }
        preserved = km.PreservedRecords.from_kit(old, self.OLD_NOTICE)
        kit = self.kit("keep", {"top/tee": ManifestBuildTest.TOP, "hair/soft-bob": ManifestBuildTest.HAIR, "irises/round-large": ManifestBuildTest.IRIS})
        manifest = self.build(kit, preserved)
        by_id = {part["id"]: part for part in manifest["parts"]}
        self.assertEqual(by_id["top/shirt"]["unavailable"]["female"], old["parts"][0]["unavailable"]["female"])  # 손 사유가 기본 문장보다 먼저
        self.assertEqual(by_id["hair/short-layered"]["unavailable"]["female"], km.OPTIONAL_REASON_KO)  # 기록이 없으면 기본 문장
        self.assertEqual(by_id["top/tee"]["variants"]["female"]["hides"], ["torso"])  # 레지스트리가 없으면 이전 hides
        self.assertEqual(self.build(kit, preserved, hides={"top/tee": {"female": {"hides": ["neck"]}}})["parts"][[p["id"] for p in manifest["parts"]].index("top/tee")]["variants"]["female"]["hides"], ["neck"])
        summary = manifest["provenance"]["summaryKo"]
        self.assertTrue(summary.startswith(self.OLD_SUMMARY), summary)
        # 포지 도구 파츠만 기록한다(헤어 = forge_hair, 원본 상의 = forge_garments). 홍채(build_irises)는 첫 문장의 '원본 디자인'에 이미 들어 있다.
        self.assertIn("원본 파츠 기록: 헤어 1종(hair/soft-bob)은 tools/blender/character_kit/forge_hair가, 상의 1종(top/tee)은 tools/blender/character_kit/forge_garments가 이 저장소에서 절차 생성한 원본(license original)이며 Hyper3D 생성물이 아닙니다.", summary)
        self.assertNotIn("irises/round-large", summary)
        # 새 요약을 다시 보존 원본으로 써도 원본 파츠 기록은 한 번만 들어간다(멱등)
        again = self.build(kit, km.PreservedRecords.from_kit({**old, "provenance": manifest["provenance"]}, self.OLD_NOTICE))
        self.assertEqual(again["provenance"]["summaryKo"], summary)
        self.assertEqual(again["provenance"]["summaryKo"].count(kp_marker()), 1)

    def test_original_source_lists_registered_original_parts_by_tool(self) -> None:
        kit = self.kit("original", {"hair/soft-bob": ManifestBuildTest.HAIR, "irises/round-large": ManifestBuildTest.IRIS})
        original = next(source for source in self.build(kit, None)["provenance"]["sources"] if source["id"] == "toonstudio-original")
        self.assertEqual(original["name"], "ToonStudio 원본 디자인(속옷·구강 내부·속눈썹·눈썹·홍채 1종·헤어 1종·텍스처)")
        self.assertIn("build_irises — 홍채 1종(irises/round-large)", original["changesKo"])
        self.assertIn("forge_hair — 헤어 1종(hair/soft-bob)", original["changesKo"])
        self.assertEqual((original["license"], original["derivative"]), ("original", False))

    def test_notice_keeps_the_exclusion_history_and_recounts_the_files(self) -> None:
        preserved = km.PreservedRecords.from_kit({"provenance": {"summaryKo": self.OLD_SUMMARY}, "parts": []}, self.OLD_NOTICE)
        kit = self.kit("notice", {"hair/soft-bob": ManifestBuildTest.HAIR, "irises/round-large": ManifestBuildTest.IRIS})
        manifest = self.build(kit, preserved)
        notice = km.notice_text(self.contract, manifest, preserved)
        self.assertIn("— 2026-10-14 키트에서 제외", notice)  # 역사 절 머리줄과
        self.assertIn("f63e1379-d77f-4351-9a6d-74ff796ff91a", notice)  # 그 안의 하위 절이 그대로
        self.assertIn("- 제외한 Hyper3D 파생 변형 48개의 GLB 파일은 저장소에 없다.", notice)
        self.assertNotIn("(옛 안내)", notice)  # 공통 안내 문장은 생성기가 다시 쓴다
        self.assertNotIn("남성 베이스는 이번 빌드에서 만들지 않았다", notice)  # 고정 문장 결함(2026-10-22 지적)이 사라졌다
        self.assertIn("- 베이스: `bases/female.glb`", notice)
        self.assertIn("- 파츠(현재 제공 2종, 변형 파일 2개): hair/soft-bob, irises/round-large", notice)
        self.assertIn("`forge_hair`: 헤어 1종(hair/soft-bob)", notice)
        self.assertIn("위 원천 3 기록의 경위로 제외해 현재 키트에는 없다", notice)
        self.assertEqual(notice.count("## 원천 3"), 1)
        self.assertLess(notice.index("## 원천 3"), notice.index("## 쓰지 않은 것"))

    def test_registry_original_conflicting_with_a_hyper3d_key_stops(self) -> None:
        table = km.Hyper3dSources(record_doc="apps/character-lab/docs/hyper3d-terms-record.md", sources={"top/tee": km.load_hyper3d_sources(km.HYPER3D_SOURCES_FILE, REPO_ROOT).sources["top/tee"]})
        kit = self.kit("conflict", {"top/tee": ManifestBuildTest.TOP})
        with self.assertRaises(km.ManifestError) as caught:
            self.build(kit, None, hyper3d=table, licenses={"top/tee": "original"})
        self.assertIn("출처가 충돌합니다: top/tee", str(caught.exception))
        # 레지스트리가 license를 밝히지 않으면 지금처럼 출처 표를 따른다(Hyper3D 항목이 생긴다)
        ids = [source["id"] for source in self.build(kit, None, hyper3d=table)["provenance"]["sources"]]
        self.assertIn("hyper3d-top-tee", ids)


def kp_marker() -> str:
    from character_kit import kit_provenance

    return kit_provenance.ORIGINAL_SUMMARY_MARKER


class ContractConstantParityTest(unittest.TestCase):
    """`contract.json` 덤프에 없어 파이썬에 사본으로 둔 상수가 TS 계약과 같은지 확인한다.

    2026-10-23 CORE-1이 두 상수를 `character-kit.ts`에서 `kit-provenance.ts`로 옮겼다(character-kit.ts는 다시 내보내기만 한다). 정의가 있는 파일을 읽는다.
    """

    def test_license_vocabulary_and_evidence_prefix_match_the_typescript_contract(self) -> None:
        contracts = REPO_ROOT / "apps/character-lab/src/contracts"
        source = "\n".join((contracts / name).read_text(encoding="utf-8") for name in ("kit-provenance.ts", "character-kit.ts") if (contracts / name).is_file())
        licenses = re.search(r"export const KIT_ALLOWED_LICENSES = \[([^\]]*)\] as const", source)
        prefix = re.search(r'export const KIT_HYPER3D_EVIDENCE_PREFIX = "([^"]+)"', source)
        assert licenses is not None and prefix is not None, "KIT_ALLOWED_LICENSES·KIT_HYPER3D_EVIDENCE_PREFIX 정의를 찾지 못했습니다(계약 파일이 또 옮겨졌는지 확인)"
        self.assertEqual(re.findall(r'"([^"]+)"', licenses.group(1)), ["CC0-1.0", "original", km.HYPER3D_LICENSE])
        self.assertEqual(prefix.group(1), km.HYPER3D_EVIDENCE_PREFIX)


if __name__ == "__main__":
    unittest.main()
