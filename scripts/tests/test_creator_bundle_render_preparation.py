"""팩 내부 PNG 승인과 순수 GLB 준비의 경계·무변경성을 검증한다."""
import copy
import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zlib

from PIL import Image

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS / "lib"))
import creator_bundle_render_preparation as preparation
import normalize_studio_asset_glb as normalizer


def digest(data):
    return hashlib.sha256(data).hexdigest()


def image_bytes(format="PNG"):
    stream = io.BytesIO()
    Image.new("RGB", (2, 2), (40, 80, 120)).save(stream, format)
    return stream.getvalue()


class OptionalPreparationRuntimeTests(unittest.TestCase):
    def test_readonly_consumers_import_without_pillow_or_site_packages(self):
        code = r"""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
assert importlib.util.find_spec("PIL") is None
scripts = Path(sys.argv[1])
sys.path.insert(0, str(scripts / "lib"))
import creator_bundle_render_preparation as preparation
preparation.validate_preparation(None)
raw = b"unprepared input"
plan = preparation.prepare_render_input({}, raw, Path("unused.glb"), Path("unused-library"), Path("unused-pack"))
assert plan == {"data": None, "sha256": hashlib.sha256(raw).hexdigest(), "fingerprint": None, "checks": []}
preparation.revalidate_preparation(plan, Path("unused-library"))
spec = importlib.util.spec_from_file_location("render_readonly", scripts / "render-creator-bundle-assets.py")
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
document = json.dumps({"asset": {"version": "2.0"}}).encode()
document += b" " * (-len(document) % 4)
data = b"glTF" + struct.pack("<II", 2, 20 + len(document)) + struct.pack("<II", len(document), 0x4E4F534A) + document
driver.validate_glb(data)
assert not any(name == "PIL" or name.startswith("PIL.") for name in sys.modules)
print(json.dumps({"pillowLoaded": False, "readonlyConsumerLoaded": True}))
"""
        result = subprocess.run([sys.executable, "-I", "-S", "-B", "-c", code, str(SCRIPTS)],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout), {"pillowLoaded": False, "readonlyConsumerLoaded": True})


class RenderPreparationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.library = self.root / "library"
        self.pack = self.library / "10-characters/cartoon-characters-2"
        self.source = self.pack / "engine/godot/Characters/CH_1/character.glb"
        self.texture = self.pack / "engine/godot/Textures/mafia_atlas.png"
        self.source.parent.mkdir(parents=True)
        self.texture.parent.mkdir(parents=True)
        self.png = image_bytes()
        self.texture.write_bytes(self.png)
        self.binary = b"GEOMETRY"
        self.uri = "../../Textures/mafia_atlas.png"
        self.document = {
            "asset": {"version": "2.0", "generator": "검증 fixture"},
            "buffers": [{"byteLength": len(self.binary), "name": "geometry"}],
            "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": 8, "target": 34962}],
            "images": [{"uri": self.uri, "name": "atlas", "extras": {"credit": "원본 유지"}}],
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "JOINTS_0": 1}, "material": 0}]}],
            "accessors": [{"bufferView": 0, "componentType": 5126, "count": 1, "type": "VEC2"}],
            "nodes": [{"mesh": 0, "skin": 0}], "skins": [{"joints": [1, 2], "skeleton": 1}],
            "materials": [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}],
            "textures": [{"source": 0}], "scenes": [{"nodes": [0]}], "scene": 0,
            "animations": [{"name": "pose", "channels": [], "samplers": []}],
            "extras": {"original": [1, "metadata"]}, "extensionsUsed": ["KHR_materials_unlit"],
        }
        self.raw = normalizer.write_glb(self.document, self.binary)
        self.source.write_bytes(self.raw)
        expected_document = copy.deepcopy(self.document)
        image = expected_document["images"][0]
        del image["uri"]
        image.update(bufferView=1, mimeType="image/png")
        expected_document["bufferViews"].append({"buffer": 0, "byteOffset": 8, "byteLength": len(self.png)})
        expected_document["buffers"][0]["byteLength"] = 8 + len(self.png)
        self.expected = normalizer.write_glb(expected_document, self.binary + self.png)
        self.mapping = {"uri": self.uri, "source": self.texture.relative_to(self.library).as_posix(),
                        "sha256": digest(self.png), "bytes": len(self.png)}
        self.asset = {"source": self.source.relative_to(self.library).as_posix(), "sourceModelSha256": digest(self.raw),
                      "sourcePreparation": {"kind": preparation.KIND, "expectedSha256": digest(self.expected), "images": [self.mapping]}}

    def prepare(self, asset=None, raw=None, source=None, pack=None):
        return preparation.prepare_render_input(asset if asset is not None else self.asset,
                                                self.raw if raw is None else raw, source or self.source,
                                                self.library, pack or self.pack)

    def change_document(self, document):
        self.raw = normalizer.write_glb(document, self.binary)
        self.source.write_bytes(self.raw)
        self.asset["sourceModelSha256"] = digest(self.raw)

    def test_no_preparation_keeps_original_contract_without_file_access(self):
        with patch.object(preparation, "safe_file", side_effect=AssertionError("파일 접근 금지")):
            plan = self.prepare(asset={})
            self.assertEqual(plan, {"data": None, "sha256": digest(self.raw), "fingerprint": None, "checks": []})
            preparation.revalidate_preparation(plan, self.library)

    def test_original_normalizer_still_rejects_pack_parent_uri_without_output(self):
        destination = self.root / "not-created/result.glb"
        with self.assertRaises(ValueError):
            normalizer.normalize(self.source, destination)
        self.assertFalse(destination.parent.exists())

    def test_pure_normalizer_preserves_binary_skin_and_all_other_metadata(self):
        with patch.object(Path, "open", side_effect=AssertionError("순수 함수의 파일 접근 금지")):
            data, embedded = normalizer.normalize_bytes(self.raw, lambda uri: self.png if uri == self.uri else b"")
        self.assertEqual(data, self.expected)
        self.assertEqual(embedded, [{"uri": self.uri, "sha256": digest(self.png), "bytes": len(self.png)}])
        doc, binary = normalizer.read_glb(data)
        self.assertEqual(binary[:len(self.binary)], self.binary)
        for key in self.document.keys() - {"buffers", "bufferViews", "images"}:
            self.assertEqual(doc[key], self.document[key], key)
        self.assertEqual(doc["bufferViews"][:1], self.document["bufferViews"])
        self.assertEqual(doc["images"][0]["extras"], self.document["images"][0]["extras"])

    def test_whitelisted_pack_parent_uri_is_pure_and_has_relative_revalidation_evidence(self):
        before = {path.relative_to(self.root) for path in self.root.rglob("*")}
        plan = self.prepare()
        self.assertEqual(plan["data"], self.expected)
        self.assertEqual(plan["sha256"], digest(self.expected))
        self.assertEqual(plan["fingerprint"]["images"], [self.mapping])
        self.assertEqual(plan["fingerprint"]["originalModelSha256"], digest(self.raw))
        self.assertEqual(plan["fingerprint"]["normalizerSha256"], preparation.sha256_file(Path(normalizer.__file__)))
        self.assertEqual(plan["fingerprint"]["preparationPolicySha256"], preparation.sha256_file(Path(preparation.__file__)))
        self.assertNotIn(str(self.root), json.dumps(plan["fingerprint"]))
        self.assertEqual(plan["checks"], [{"source": self.asset["source"], "sha256": digest(self.raw), "bytes": len(self.raw)},
                                          {key: self.mapping[key] for key in ("source", "sha256", "bytes")}])
        preparation.revalidate_preparation(plan, self.library)
        self.assertEqual(before, {path.relative_to(self.root) for path in self.root.rglob("*")})
        self.assertEqual(self.source.read_bytes(), self.raw)
        self.assertEqual(self.texture.read_bytes(), self.png)

    def test_preparation_and_image_config_fields_are_strict(self):
        base = self.asset["sourcePreparation"]
        bad = [[], {}, {**base, "extra": True}, {**base, "kind": "other"}, {**base, "expectedSha256": "A" * 64},
               {**base, "images": []}, {**base, "images": [self.mapping, self.mapping]}]
        bad += [{**base, "images": [{**self.mapping, **change}]} for change in (
            {"extra": "unused"}, {"sha256": "wrong"}, {"bytes": True}, {"bytes": 0}, {"bytes": 16 * 1024 * 1024 + 1})]
        bad.append({**base, "images": [self.mapping, {**self.mapping, "uri": "../../Textures/other.png"}]})
        for value in bad:
            with self.subTest(value=value), self.assertRaises(ValueError):
                preparation.validate_preparation(value)

    def test_url_data_query_fragment_encoded_and_ambiguous_paths_are_rejected(self):
        for uri in ("https://example.invalid/a.png", "data:image/png;base64,AAAA", "/Textures/a.png", "//host/a.png",
                    "../../Textures/a.png?key=x", "../../Textures/a.png#fragment", "%2e%2e/Textures/a.png",
                    "..\\Textures\\a.png", "../../Textures//a.png", "./a.png"):
            with self.subTest(uri=uri), self.assertRaises(ValueError):
                preparation.validate_preparation({**self.asset["sourcePreparation"], "images": [{**self.mapping, "uri": uri}]})
        for source in ("../outside.png", "10-characters/pack/./a.png", "10-characters/pack/a.png?x", "10-characters/pack/%61.png"):
            with self.subTest(source=source), self.assertRaises(ValueError):
                preparation.validate_preparation({**self.asset["sourcePreparation"], "images": [{**self.mapping, "source": source}]})

    def test_missing_unused_and_duplicate_document_image_mappings_are_rejected(self):
        document = copy.deepcopy(self.document)
        document["images"].append({"uri": "../../Textures/second.png"})
        self.change_document(document)
        with self.assertRaisesRegex(ValueError, "1:1"):
            self.prepare()
        document["images"][1]["uri"] = self.uri
        self.change_document(document)
        with self.assertRaisesRegex(ValueError, "중복"):
            self.prepare()
        document["images"] = []
        self.change_document(document)
        with self.assertRaisesRegex(ValueError, "미사용"):
            self.prepare()

    def test_original_source_hash_and_passed_bytes_and_pack_are_bound(self):
        for asset, raw, source, pack in (
            ({**self.asset, "sourceModelSha256": "0" * 64}, None, None, None),
            (self.asset, self.raw + b"changed", None, None),
            (self.asset, None, self.texture, None),
            (self.asset, None, None, self.pack.parent),
            ({**self.asset, "source": "../outside.glb"}, None, None, None),
        ):
            with self.subTest(asset=asset, source=source, pack=pack), self.assertRaises(ValueError):
                self.prepare(asset=asset, raw=raw, source=source, pack=pack)
        self.source.write_bytes(self.raw[:-1] + bytes([self.raw[-1] ^ 1]))
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            self.prepare()

    def test_actual_png_hash_size_structure_and_expected_glb_sha_are_required(self):
        for change in ({"sha256": "0" * 64}, {"bytes": len(self.png) + 1}):
            asset = copy.deepcopy(self.asset)
            asset["sourcePreparation"]["images"][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.prepare(asset=asset)
        for body in (image_bytes("JPEG"), preparation.PNG_SIGNATURE + b"bad-png"):
            self.texture.write_bytes(body)
            asset = copy.deepcopy(self.asset)
            asset["sourcePreparation"]["images"][0].update(sha256=digest(body), bytes=len(body))
            with self.subTest(body=body[:8]), self.assertRaisesRegex(ValueError, "PNG"):
                self.prepare(asset=asset)
        self.texture.write_bytes(self.png)
        asset = copy.deepcopy(self.asset)
        asset["sourcePreparation"]["expectedSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "expectedSha256"):
            self.prepare(asset=asset)

    def test_crc_valid_png_with_broken_idat_cannot_become_a_prepared_input(self):
        parts, cursor = [self.png[:8]], 8
        while cursor < len(self.png):
            length = struct.unpack_from(">I", self.png, cursor)[0]
            kind = self.png[cursor + 4:cursor + 8]
            body = self.png[cursor + 8:cursor + 8 + length]
            if kind == b"IDAT":
                body = b"not-a-zlib-stream"
            parts.append(struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xffffffff))
            cursor += length + 12
        broken = b"".join(parts)
        with Image.open(io.BytesIO(broken), formats=("PNG",)) as image:
            image.verify()
        with self.assertRaises(OSError), Image.open(io.BytesIO(broken), formats=("PNG",)) as image:
            image.load()
        self.texture.write_bytes(broken)
        asset = copy.deepcopy(self.asset)
        asset["sourcePreparation"]["images"][0].update(sha256=digest(broken), bytes=len(broken))
        # SHA 고정까지 일치시켜, PNG 디코딩 게이트 자체가 실패 원인인지 확인한다.
        prepared, _ = normalizer.normalize_bytes(self.raw, lambda uri: broken)
        asset["sourcePreparation"]["expectedSha256"] = digest(prepared)
        with self.assertRaisesRegex(ValueError, "PNG"):
            self.prepare(asset=asset)

    def test_exact_uri_target_and_same_pack_are_required(self):
        other = self.texture.with_name("other.png")
        other.write_bytes(self.png)
        asset = copy.deepcopy(self.asset)
        asset["sourcePreparation"]["images"][0]["source"] = other.relative_to(self.library).as_posix()
        with self.assertRaisesRegex(ValueError, "URI"):
            self.prepare(asset=asset)
        other = self.library / "10-characters/another-pack/atlas.png"
        other.parent.mkdir()
        other.write_bytes(self.png)
        asset["sourcePreparation"]["images"][0]["source"] = other.relative_to(self.library).as_posix()
        with self.assertRaisesRegex(ValueError, "다른 팩"):
            self.prepare(asset=asset)
        document = copy.deepcopy(self.document)
        document["images"][0]["uri"] = "../../../../../../outside.png"
        self.change_document(document)
        asset = copy.deepcopy(self.asset)
        asset["sourcePreparation"]["images"][0]["uri"] = document["images"][0]["uri"]
        with self.assertRaisesRegex(ValueError, "팩 밖"):
            self.prepare(asset=asset)

    def test_original_and_texture_symlinks_even_within_pack_are_rejected(self):
        for target in (self.source, self.texture):
            body = target.read_bytes()
            saved = target.with_name("real-" + target.name)
            saved.write_bytes(body)
            target.unlink()
            target.symlink_to(saved)
            try:
                with self.subTest(target=target.name), self.assertRaisesRegex(ValueError, "심볼릭 링크"):
                    self.prepare()
            finally:
                target.unlink()
                target.write_bytes(body)

    def test_uri_cannot_pass_a_symlink_even_when_parent_normalization_cancels_it(self):
        (self.source.parent.parent / "alias").symlink_to(self.source.parent, target_is_directory=True)
        document = copy.deepcopy(self.document)
        document["images"][0]["uri"] = "../alias/../../Textures/mafia_atlas.png"
        self.change_document(document)
        self.asset["sourcePreparation"]["images"][0]["uri"] = document["images"][0]["uri"]
        with self.assertRaisesRegex(ValueError, "심볼릭 링크"):
            self.prepare()

    def test_texture_parent_symlink_is_rejected_before_uri_resolution(self):
        directory = self.texture.parent
        renamed = directory.with_name("real-textures")
        directory.rename(renamed)
        directory.symlink_to(renamed, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "심볼릭 링크"):
            self.prepare()

    def test_legacy_normalizer_keeps_jpeg_support_with_its_strict_local_resolver(self):
        jpeg = image_bytes("JPEG")
        (self.source.parent / "local.jpg").write_bytes(jpeg)
        document = copy.deepcopy(self.document)
        document["images"][0]["uri"] = "local.jpg"
        self.change_document(document)
        destination = self.root / "normalized.glb"
        normalizer.normalize(self.source, destination)
        doc, binary = normalizer.read_glb(destination.read_bytes())
        self.assertEqual(doc["images"][0]["mimeType"], "image/jpeg")
        self.assertEqual(binary[:len(self.binary)], self.binary)

    def test_non_image_external_uri_is_not_approved_by_image_whitelist(self):
        document = copy.deepcopy(self.document)
        document["extras"]["uri"] = "../../Textures/mafia_atlas.png"
        self.change_document(document)
        with self.assertRaisesRegex(ValueError, "images 밖"):
            self.prepare()

    def test_post_revalidation_rejects_model_texture_and_symlink_changes(self):
        plan = self.prepare()
        for path, body in ((self.source, self.raw), (self.texture, self.png)):
            path.write_bytes(body[:-1] + bytes([body[-1] ^ 1]))
            with self.subTest(path=path.name), self.assertRaisesRegex(ValueError, "SHA-256"):
                preparation.revalidate_preparation(plan, self.library)
            path.write_bytes(body)
        saved = self.texture.with_name("same.png")
        saved.write_bytes(self.png)
        self.texture.unlink()
        self.texture.symlink_to(saved)
        with self.assertRaisesRegex(ValueError, "심볼릭 링크"):
            preparation.revalidate_preparation(plan, self.library)

    def test_post_revalidation_rejects_changed_prepared_bytes_policy_and_check_list(self):
        plan = self.prepare()
        bad_bytes = {**plan, "data": plan["data"] + b"changed"}
        with self.assertRaisesRegex(ValueError, "준비 바이트"):
            preparation.revalidate_preparation(bad_bytes, self.library)
        for key in ("normalizerSha256", "preparationPolicySha256"):
            altered = {**plan, "fingerprint": {**plan["fingerprint"], key: "0" * 64}}
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "정규화기"):
                preparation.revalidate_preparation(altered, self.library)
        with self.assertRaisesRegex(ValueError, "누락"):
            preparation.revalidate_preparation({**plan, "checks": plan["checks"][:1]}, self.library)

    def test_loaded_code_and_disk_policy_drift_before_or_during_preparation_is_rejected(self):
        normalizer_sha = normalizer.NORMALIZER_SOURCE_SHA256
        policy_sha = preparation.POLICY_SOURCE_SHA256
        for values in (["0" * 64], [normalizer_sha, "0" * 64],
                       [normalizer_sha, policy_sha, "0" * 64],
                       [normalizer_sha, policy_sha, normalizer_sha, "0" * 64]):
            with self.subTest(values=values), patch.object(preparation, "sha256_file", side_effect=values):
                with self.assertRaisesRegex(ValueError, "로드된 코드"):
                    self.prepare()


if __name__ == "__main__":
    unittest.main()
