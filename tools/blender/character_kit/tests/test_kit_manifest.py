"""`kit_manifest`(kit.json 작성기)의 단위 시험 (표준 라이브러리 unittest, 합성 GLB만 쓴다).

실행: python -I tools/blender/character_kit/tests/test_kit_manifest.py

- GLB 검사·파츠 찾기·레지스트리 검증·manifest 모양·`hides` 규칙을 작은 합성 키트로 확인한다.
- Hyper3D 파생 파츠의 출처(`provenance.sources`, 요약, NOTICE.md)를 확인한다: 등록된 파츠에만 항목이 생기고, 계약·검증기 V4가 요구하는 값이
  모두 있으며, 값이 모자라면 한글 사유로 멈춘다.
- 계약 덤프가 필요하다: `~/.cache/toonstudio-kit/out/contract.json`이 있으면 그것을, 없으면 저장소 루트에서
  `pnpm exec tsx scripts/blender/dump-kit-contract.mjs`로 만든다. 둘 다 안 되면 그 시험은 건너뛴다.
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
    elif (REPO_ROOT / "node_modules").is_dir() and shutil.which("pnpm"):
        workdir = Path(tempfile.mkdtemp(prefix="kit-contract-"))
        target = workdir / "contract.json"
        result = subprocess.run(["pnpm", "exec", "tsx", "scripts/blender/dump-kit-contract.mjs", "--out", str(target)], cwd=REPO_ROOT, capture_output=True, text=True, timeout=300)
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
        self.assertEqual(by_id["bottom/jeans"]["unavailable"]["female"], km.REQUIRED_REASON_KO)  # 필수 파츠는 필수라는 사유
        self.assertEqual(by_id["hair/short-layered"]["unavailable"]["female"], km.OPTIONAL_REASON_KO)

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
        self.assertEqual(sorted(self.sources.sources), ["bottom/jeans", "hair/soft-bob", "shoes/sneakers", "top/tee"])
        for preset_id, record in self.sources.sources.items():
            entry = km.hyper3d_source_entry(preset_id, record, self.sources.record_doc)
            self.assertEqual(entry["id"], "hyper3d-" + preset_id.replace("/", "-"))

    def test_entries_exist_only_for_registered_parts(self) -> None:
        by_id = self.entries(["top/tee", "irises/round-large"])  # 홍채는 출처 표에 없는 원본 파츠, 청바지는 등록되지 않음
        self.assertIn("hyper3d-top-tee", by_id)
        self.assertNotIn("hyper3d-bottom-jeans", by_id)
        self.assertNotIn("hyper3d-hair-soft-bob", by_id)
        self.assertEqual({"hbm-1.4.1", "toonstudio-original", "hyper3d-top-tee"}, set(by_id))
        self.assertEqual(set(self.entries([])), {"hbm-1.4.1", "toonstudio-original"})  # 파츠가 없으면 항목도 없다
        self.assertEqual(set(self.entries(["hair/soft-bob", "bottom/jeans", "shoes/sneakers", "top/tee"])) - {"hbm-1.4.1", "toonstudio-original"}, {"hyper3d-hair-soft-bob", "hyper3d-bottom-jeans", "hyper3d-shoes-sneakers", "hyper3d-top-tee"})

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
        self.assertNotIn(self.sources.sources["hair/soft-bob"]["generationId"], notice)  # 등록되지 않은 파츠는 적지 않는다
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

    @unittest.skipUnless((REPO_ROOT / "node_modules").is_dir() and shutil.which("node"), "node와 node_modules가 필요합니다")
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
        result = subprocess.run(["pnpm", "exec", "tsx", "scripts/verify-character-kit.mjs", "--root", str(kit), "--base", "female", "--only", "V4"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=300)
        self.assertIn("[통과] V4", result.stdout, result.stdout + result.stderr)
        # 반입 기록 문서 경로를 망가뜨리면 V4가 오류를 낸다(검증기가 실제로 이 항목을 검사하고 있음을 확인)
        for source in manifest["provenance"]["sources"]:
            if source["license"] == "hyper3d-rodin-output":
                source["evidenceDoc"] = "apps/character-lab/docs/does-not-exist.md"
        km.write_manifest(manifest, kit / km.MANIFEST_FILE)
        broken = subprocess.run(["pnpm", "exec", "tsx", "scripts/verify-character-kit.mjs", "--root", str(kit), "--base", "female", "--only", "V4"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=300)
        self.assertIn("[실패] V4", broken.stdout, broken.stdout + broken.stderr)


class ContractConstantParityTest(unittest.TestCase):
    """`contract.json` 덤프에 없어 파이썬에 사본으로 둔 상수가 `character-kit.ts`와 같은지 확인한다."""

    def test_license_vocabulary_and_evidence_prefix_match_the_typescript_contract(self) -> None:
        source = (REPO_ROOT / "apps/character-lab/src/contracts/character-kit.ts").read_text(encoding="utf-8")
        licenses = re.search(r"export const KIT_ALLOWED_LICENSES = \[([^\]]*)\] as const", source)
        prefix = re.search(r'export const KIT_HYPER3D_EVIDENCE_PREFIX = "([^"]+)"', source)
        assert licenses is not None and prefix is not None
        self.assertEqual(re.findall(r'"([^"]+)"', licenses.group(1)), ["CC0-1.0", "original", km.HYPER3D_LICENSE])
        self.assertEqual(prefix.group(1), km.HYPER3D_EVIDENCE_PREFIX)


if __name__ == "__main__":
    unittest.main()
