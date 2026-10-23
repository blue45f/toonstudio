"""포지 파츠 통합 도구(`forge_install`) 시험 — 임시 폴더만 쓴다(저장소의 실제 키트는 읽기만 한다).

- 키트 v2 계약 사본 표(앵커 14·슬롯 역할·역할 채널·노드 접두·형태 이름 규칙)가 TS 원본과 같은지 글자로 대조한다.
- 산출물 찾기(프로필 폴더 별칭, 바깥 폴더 레지스트리), 레지스트리 합치기, 재질 → (역할, 채널), 노드 이름 규칙, 형태 이름, 충돌 대상 경고.
- `--apply` 백업·교체·되돌리기 왕복(가짜 키트).
- 실제 포지 산출물(`~/.cache/toonstudio-kit/out5/shoes`)과 tsx가 있으면: 확장 프로필 검사 통과, 채널을 망가뜨리면 거부,
  계약 TS 원본 스키마(`kitManifestV2Schema`) 검사가 어휘 안 파츠는 통과하고 망가뜨린 재질에서는 실패하는지(검사가 실제로 실패할 수 있는지).

실행: python3 -I tools/blender/character_kit/tests/test_forge_install.py   (저장소 루트에서, 표준 라이브러리만)
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from character_kit import forge_install as fi  # noqa: E402

REPO = fi.REPO_ROOT
CONTRACTS = REPO / "apps" / "character-lab" / "src" / "contracts"
TSX = REPO / "node_modules" / ".bin" / "tsx"
FORGE_OUT = Path(os.environ.get("FORGE_INSTALL_SOURCE", str(Path.home() / ".cache/toonstudio-kit/out5/shoes")))


def ts_string_list(source: str, name: str) -> list[str]:
    """`export const NAME = [ "a", "b", ... ]` 의 문자열 목록."""
    match = re.search(rf"export const {name}\b[^=]*=\s*\[(.*?)\]", source, re.S)
    assert match, name
    return re.findall(r'"([^"]+)"', match.group(1))


def ts_record_of_lists(source: str, name: str) -> dict[str, list[str]]:
    """`export const NAME ... = { key: ["a", ...], "k-2": [...], }` 의 표."""
    match = re.search(rf"export const {name}\b[^=]*=\s*\{{(.*?)\n\}};", source, re.S)
    assert match, name
    out: dict[str, list[str]] = {}
    for key, body in re.findall(r'^\s*"?([a-z][a-z-]*)"?:\s*\[([^\]]*)\]', match.group(1), re.M):
        out[key] = re.findall(r'"([^"]+)"', body)
    return out


class ContractMirrorTest(unittest.TestCase):
    """사본 표가 TS 원본과 다르면 계약이 바뀐 것이다 — forge_install 표를 맞춘다."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.customization = (CONTRACTS / "customization.ts").read_text(encoding="utf-8")
        cls.mesh_data = (CONTRACTS / "mesh-data.ts").read_text(encoding="utf-8")
        cls.kit_v2 = (CONTRACTS / "character-kit-v2.ts").read_text(encoding="utf-8")
        cls.morph_names = (CONTRACTS / "morph-names.ts").read_text(encoding="utf-8")

    def test_anchors(self) -> None:
        self.assertEqual(tuple(ts_string_list(self.customization, "ACCESSORY_ANCHORS")), fi.ACCESSORY_ANCHORS)

    def test_role_channels(self) -> None:
        table = ts_record_of_lists(self.mesh_data, "PART_ROLE_CHANNELS")
        self.assertEqual({k: tuple(v) for k, v in table.items()}, fi.V2_ROLE_CHANNELS)

    def test_slot_roles(self) -> None:
        table = ts_record_of_lists(self.kit_v2, "KIT_V2_PART_SLOT_ROLES")
        self.assertEqual({k: tuple(v) for k, v in table.items()}, fi.V2_SLOT_ROLES)

    def test_node_prefix_and_suffix(self) -> None:
        match = re.search(r"const NODE_PREFIX = \{(.*?)\}", self.kit_v2, re.S)
        assert match
        prefixes = dict(re.findall(r'"?([a-z][a-z-]*)"?:\s*"([A-Za-z_]+)"', match.group(1)))
        for key, value in fi.V2_NODE_PREFIX.items():
            self.assertEqual(prefixes[key], value, key)
        suffix = re.search(r"const NODE_SUFFIX = /(.*?)/u;", self.kit_v2)
        assert suffix
        self.assertEqual(suffix.group(1), fi.V2_NODE_SUFFIX.pattern)

    def test_shape_name_rules(self) -> None:
        pattern = re.search(r"export const SHAPE_NAME_PATTERN = /(.*?)/u;", self.morph_names)
        length = re.search(r"export const SHAPE_NAME_MAX_LENGTH = (\d+);", self.morph_names)
        assert pattern and length
        self.assertEqual(pattern.group(1), fi.SHAPE_NAME_PATTERN.pattern)
        self.assertEqual(int(length.group(1)), fi.SHAPE_NAME_MAX_LENGTH)
        self.assertIn(f"maxShapesPerVariant: {fi.MAX_SHAPES_PER_VARIANT}", self.kit_v2)


class DiscoveryTest(unittest.TestCase):
    def test_profile_folder_alias_and_ancestor_registry(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "final"
            (source / "v2" / "parts" / "female" / "hair").mkdir(parents=True)
            (source / "parts-registry.json").write_text(json.dumps({"hair/soft-bob": {"female": {"hides": [], "license": "original", "layer": "outer"}}}), encoding="utf-8")
            (source / "v2" / "parts-registry.json").write_text(json.dumps({"hair/soft-bob": {"female": {"layer": "inner"}}}), encoding="utf-8")
            root = fi.scan_root(source, "ext")
            self.assertEqual(root, source / "v2", "ext 프로필은 v2/ 폴더도 받는다")
            files = fi.registry_files(source, root)
            self.assertEqual(files, [source / "parts-registry.json", source / "v2" / "parts-registry.json"])
            merged = fi.load_registries(files)
            self.assertEqual(merged["hair/soft-bob"]["female"]["license"], "original", "바깥 레지스트리 값을 읽는다")
            self.assertEqual(merged["hair/soft-bob"]["female"]["layer"], "inner", "프로필 폴더 안의 값이 나중에 덮는다")

    def test_part_paths_and_ignored_previews(self) -> None:
        self.assertEqual(fi.part_key_from_path(Path("x/ext/parts/male/accessory/cap.glb")), ("accessory/cap", "male"))
        self.assertIsNone(fi.part_key_from_path(Path("x/variants/female/accessory/cap__crown_plus.glb")), "형태 키 미리보기(이름에 __)는 파츠가 아니다")
        self.assertIsNone(fi.part_key_from_path(Path("x/final/accessories/female/bead-tie.glb")))

    def test_conflict_message_lists_paths(self) -> None:
        a = fi.FoundPart("hair/soft-bob", "female", "/a/iter1/soft-bob.glb", "/a", "1" * 64, 1)
        b = fi.FoundPart("hair/soft-bob", "female", "/a/iter2/soft-bob.glb", "/a", "2" * 64, 1)
        with self.assertRaises(SystemExit) as raised:
            fi.resolve_conflicts([a, b], "error")
        self.assertIn("/a/iter1/soft-bob.glb", str(raised.exception))
        self.assertIn("--source", str(raised.exception))
        self.assertEqual(fi.resolve_conflicts([a, b], "last"), [b])


class RulesTest(unittest.TestCase):
    def test_material_slots_new_and_legacy(self) -> None:
        new = {"materials": {"ts_shoes_x_sole": {"role": "shoes", "channel": "shoes-sole"}}}
        legacy = {"materials": {"shoes-sole": "ts_shoes_x_sole", "shoes": "ts_shoes_x"}}
        self.assertEqual(fi.material_slots(new, "shoes"), {"ts_shoes_x_sole": ("shoes", "shoes-sole")})
        self.assertEqual(fi.material_slots(legacy, "shoes"), {"ts_shoes_x_sole": ("shoes", "shoes-sole"), "ts_shoes_x": ("shoes", "shoes")})
        self.assertEqual(fi.channel_role("hair-accessory-accent", "accessory"), "hair-accessory")
        self.assertIsNone(fi.channel_role("top-trim", "shoes"))

    def test_node_names(self) -> None:
        self.assertIsNone(fi.v2_node_issue("accessory", "cap", "TS_Accessory_cap", ["accessory"]))
        self.assertIsNone(fi.v2_node_issue("accessory", "cap", "TS_Accessory_cap_Accent", ["accessory"]))
        self.assertIsNone(fi.v2_node_issue("accessory", "ribbon", "TS_HairAccessory_ribbon", ["hair-accessory"]))
        self.assertIsNotNone(fi.v2_node_issue("accessory", "ribbon", "TS_Accessory_ribbon", ["hair-accessory"]), "헤어 부속 역할이면 접두가 TS_HairAccessory")
        self.assertIsNotNone(fi.v2_node_issue("shoes", "boots", "TS_Shoes_boots_sole", ["shoes"]), "채널 접미는 대문자로 시작")
        self.assertIsNone(fi.v2_node_issue("hair", "soft-bob", "anything", ["hair"]), "헤어는 v1 규칙(LOD 이름)으로 따로 본다")

    def test_shape_names(self) -> None:
        for good in ("fit", "hat-clear", "crownHeight", "a" * 24):
            self.assertTrue(fi.is_shape_name(good), good)
        for bad in ("Fit", "1st", "hat_clear", "a" * 25, "hat--clear"):
            self.assertFalse(fi.is_shape_name(bad), bad)
        meta = {"shapes": [{"name": "fit", "labelKo": "두께"}, "size"]}
        self.assertEqual(fi.declared_shapes(meta, set()), ["fit", "size"])
        self.assertEqual(fi.declared_shapes({}, {"shape:fit:+", "shape:fit:-", "shape:cuff:+"}), ["cuff", "fit"])

    def test_conflict_targets_include_stacking(self) -> None:
        part = fi.FoundPart("accessory/waist-bag", "female", "/x.glb", "/s", "0" * 64, 1, {"conflicts": ["shoes/sandals"], "stacking": [{"with": ["outer/hoodie"], "shapes": {}}]})
        warnings = fi.check_conflict_targets([part], {"shoes/sandals"})
        self.assertEqual(len(warnings), 1)
        self.assertIn("outer/hoodie", warnings[0])

    def test_v2_material(self) -> None:
        self.assertEqual(fi.v2_material("accessory", "accessory-accent", False), {"role": "accessory", "channel": "accessory-accent", "tint": {"mode": "recolor"}, "doubleSided": False})
        self.assertEqual(fi.v2_material("teeth", "teeth", False)["tint"]["mode"], "fixed")


class ApplyRestoreTest(unittest.TestCase):
    def test_apply_backs_up_and_restore_round_trips(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target, work = root / "kit", root / "work" / "kit"
            (target / "parts").mkdir(parents=True)
            (target / "kit.json").write_text('{"v": 1}', encoding="utf-8")
            (target / "parts" / "old.glb").write_bytes(b"old")
            (work / "parts").mkdir(parents=True)
            (work / "kit.json").write_text('{"v": 2}', encoding="utf-8")
            (work / "parts" / "new.glb").write_bytes(b"new")
            before = fi.tree_digest(target)
            result = fi.apply_to_target(work, target, root / "backups")
            self.assertEqual(sorted(result["changed"]), ["kit.json", "parts/new.glb"])
            self.assertEqual(result["removed"], ["parts/old.glb"])
            self.assertEqual(fi.tree_digest(target), fi.tree_digest(work))
            self.assertIn("--restore", result["restore"])
            fi.restore(Path(result["backup"]), target)
            self.assertEqual(fi.tree_digest(target), before, "백업으로 되돌리면 처음과 같다")


@unittest.skipUnless((FORGE_OUT / "ext" / "parts-registry.json").is_file() and TSX.is_file(), "포지 산출물(out5/shoes)이나 tsx가 없다")
class RealOutputTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.contract = fi.dump_contract(REPO, TSX, Path(cls.tmp.name) / "contract.json")

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def found(self, profile: str, only: list[str]) -> list[fi.FoundPart]:
        found, conflicts, missing = fi.discover([FORGE_OUT], profile, only)
        self.assertEqual((conflicts, missing), ([], []))
        return found

    def test_ext_parts_pass_v2_rules_and_broken_channel_is_rejected(self) -> None:
        parts = self.found("ext", ["shoes/sneakers", "accessory/ribbon", "accessory/backpack"])
        self.assertEqual(len(parts), 6)
        for part in parts:
            verdict = fi.inspect_part(part, self.contract, "ext")
            self.assertTrue(verdict.accepted, f"{part.preset_id}@{part.base}: {verdict.problems}")
        broken = parts[0]
        broken.meta = json.loads(json.dumps(broken.meta))
        first = next(iter(broken.meta["materials"]))
        broken.meta["materials"][first]["channel"] = "top-trim"
        verdict = fi.inspect_part(broken, self.contract, "ext")
        self.assertFalse(verdict.accepted)
        self.assertTrue(any("채널 top-trim" in p for p in verdict.problems), verdict.problems)

    def test_v1_rejects_shape_keys(self) -> None:
        ext_part = self.found("ext", ["accessory/cap"])[0]
        verdict = fi.inspect_part(ext_part, self.contract, "v1")
        self.assertFalse(verdict.accepted)
        self.assertTrue(any("형태 키" in p or "재질이" in p for p in verdict.problems))

    def test_v2_schema_check_passes_and_can_fail(self) -> None:
        old_kit = json.loads((fi.DEFAULT_KIT / "kit.json").read_text(encoding="utf-8"))
        parts = [p for p in self.found("ext", ["shoes/sneakers", "accessory/ribbon"])]
        work = Path(self.tmp.name)
        kit_copy = work / "kit"
        (kit_copy / "parts").mkdir(parents=True, exist_ok=True)
        manifest = {"parts": [], "materials": {}}
        verdicts = []
        for part in parts:
            info = fi.km.inspect_glb(Path(part.path).read_bytes(), part.path)
            block = next((b for b in manifest["parts"] if b["id"] == part.preset_id), None)
            if block is None:
                block = {"id": part.preset_id, "slot": part.slot, "variants": {}, "unavailable": {}}
                manifest["parts"].append(block)
            data = Path(part.path).read_bytes()
            block["variants"][part.base] = {"file": {"path": part.kit_relative, "bytes": len(data), "sha256": fi.hashlib.sha256(data).hexdigest()}, "meshes": fi.ext_declarations(info, part, manifest["materials"]), "hides": list(part.meta.get("hides", []))}
            verdicts.append(fi.inspect_part(part, self.contract, "ext"))
        preview = fi.v2_parts_preview(manifest, parts, verdicts, self.contract)
        vocabulary = self.contract.raw["presetVocabulary"]
        good = fi.run_v2_check(REPO, TSX, work, fi.v2_check_manifest(old_kit, preview, False, vocabulary), "good")
        self.assertTrue(good.get("ok"), good.get("issues"))
        bad_preview = json.loads(json.dumps(preview))
        name = next(n for n, m in bad_preview["materials"].items() if m.get("channel") == "shoes-sole")
        bad_preview["materials"][name]["channel"] = "accessory-accent"
        bad = fi.run_v2_check(REPO, TSX, work, fi.v2_check_manifest(old_kit, bad_preview, False, vocabulary), "bad")
        self.assertFalse(bad.get("ok"))
        self.assertTrue(any(name in issue["message"] for issue in bad["issues"]), bad["issues"][:3])


if __name__ == "__main__":
    unittest.main(verbosity=2)
