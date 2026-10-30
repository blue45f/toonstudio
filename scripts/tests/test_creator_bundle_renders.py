"""번들 렌더의 권리·경로·원본 고정과 공개 전 검증을 시험한다."""

import argparse
import copy
import importlib.util
import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image, ImageDraw

SCRIPT = Path(__file__).resolve().parents[1] / "render-creator-bundle-assets.py"
SPEC = importlib.util.spec_from_file_location("creator_bundle_renders", SCRIPT)
renders = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renders)
BLENDER_SPEC = importlib.util.spec_from_file_location("bundle_blender", renders.BLENDER_SCRIPT)
blender = importlib.util.module_from_spec(BLENDER_SPEC)
with patch.dict(sys.modules, {"bpy": SimpleNamespace(), "mathutils": SimpleNamespace(Vector=object)}):
    BLENDER_SPEC.loader.exec_module(blender)


def glb(document=None):
    value = document or {"asset": {"version": "2.0"}}
    encoded = json.dumps(value).encode()
    encoded += b" " * (-len(encoded) % 4)
    return b"glTF" + struct.pack("<II", 2, 20 + len(encoded)) + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded


def png(path, size=(1536, 1536), mode="RGBA", clipped=False, empty=False):
    image = Image.new(mode, size, (0, 0, 0, 0) if mode == "RGBA" else (0, 0, 0))
    if not empty:
        ImageDraw.Draw(image).rectangle((0 if clipped else 300, 300, min(1200, size[0] - 1), min(1200, size[1] - 1)), fill=(90, 140, 70, 255) if mode == "RGBA" else (90, 140, 70))
    image.save(path, "PNG")


class BundleRenderTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.library = self.root / "library"
        self.source = self.library / "01-city/cartoon-city-massive-pack/models/prop.glb"
        self.source.parent.mkdir(parents=True)
        self.source.write_bytes(glb())
        self.asset = {
            "id": "test-city-prop", "name": "도시 소품", "packId": "cbv1-001-cartoon-city-massive-pack",
            "catalogId": "cbv1-001-cartoon-city-massive-pack", "source": self.source.relative_to(self.library).as_posix(),
            "sourceUrl": "https://rg-poly.itch.io/cartoon-city-massive-pack1", "selectionTerm": "city prop",
            "sourceModelSha256": renders.digest(self.source.read_bytes()), "visualReviewed": False,
        }
        self.selection = self.root / "selection.json"
        self.output = self.root / "public/pack"
        self.output.mkdir(parents=True)
        self.original = json.dumps({"schema": "toonstudio.asset-delivery.v1", "pack": {"id": "bundle-renders-v1", "inServiceOnly": True, "downloadable": False}, "assets": []})
        (self.output / "manifest.json").write_text(self.original)
        self.png_root = self.root / "png"
        self.png_root.mkdir()
        self.ledger_path = self.root / "ledger.json"
        ledger = json.loads(renders.DEFAULT_LEDGER.read_text())
        city = next(entry for entry in ledger["packs"] if entry["id"] == self.asset["packId"])
        city.update(serve="allow", grant={"status": "public-domain", "licenseName": "CC0-1.0", "commercialUse": True, "attributionRequired": False})
        city.pop("holdReason", None)
        city.pop("holdLabel", None)
        city["evidence"] = [
            {"kind": "itch-page-capture", "url": self.asset["sourceUrl"], "retrievedAt": "2026-10-28", "verifiedAt": "2026-10-28", "ref": "test-fixtures/city-license-capture.html"},
            {"kind": "purchase-receipt", "verifiedAt": "2026-10-28", "ref": "test-fixtures/city-receipt.pdf"},
        ]
        self.ledger_path.write_text(json.dumps(ledger))
        self.write_selection()

    def tearDown(self):
        self.temporary.cleanup()

    def write_selection(self, assets=None):
        self.selection.write_text(json.dumps({"assets": assets or [self.asset]}))

    def args(self, **changes):
        values = dict(library_root=self.library, selection=self.selection, output_root=self.output,
                      work_dir=self.root / "work", pack_rights=self.ledger_path, blender="fake-blender",
                      node="node", reuse_renders=self.png_root, dry_run=False, publish=False)
        values.update(changes)
        return argparse.Namespace(**values)

    def prepare_png(self, assets=None):
        assets = assets or [self.asset]
        for asset in assets:
            png(self.png_root / (asset["id"] + ".png"))
        (self.png_root / "render-proof.json").write_text(json.dumps(renders.make_render_proof(assets, self.png_root)))

    def planned(self):
        assets = renders.load_selection(self.selection)
        return renders.plan_assets(assets, self.library, renders.load_rights(assets, self.ledger_path))

    def unchanged(self):
        self.assertEqual((self.output / "manifest.json").read_text(), self.original)
        self.assertEqual(list(self.output.iterdir()), [self.output / "manifest.json"])

    def test_dry_run_checks_real_node_rights_without_creating_work_or_public_files(self):
        result = renders.run(self.args(dry_run=True))
        self.assertEqual(result["selected"], 1)
        self.assertFalse(result["published"])
        self.assertFalse((self.root / "work").exists())
        self.unchanged()

    def test_hold_pack_is_rejected_by_shared_node_gate(self):
        ledger = json.loads(self.ledger_path.read_text())
        entry = next(item for item in ledger["packs"] if item["id"] == self.asset["packId"])
        entry.update(serve="hold", holdReason="owner-hold", holdLabel="준비 중이며 공개 시점은 정해지지 않았다.")
        entry.pop("grant")
        self.ledger_path.write_text(json.dumps(ledger))
        with self.assertRaisesRegex(renders.RenderError, "hold"):
            renders.run(self.args(dry_run=True))
        self.unchanged()

    def test_input_shape_and_public_source_url_are_checked(self):
        for field, value in (("source", "../outside.glb"), ("source", "01-city/../file.glb"),
                             ("sourceModelSha256", "not-a-hash"), ("sourceUrl", "https://rg-poly.itch.io/item/download/private"),
                             ("visualReviewed", "true"), ("id", "UPPERCASE")):
            with self.subTest(field=field, value=value):
                self.write_selection([{**self.asset, field: value}])
                with self.assertRaises(renders.RenderError):
                    renders.load_selection(self.selection)
        self.write_selection([self.asset, self.asset])
        with self.assertRaisesRegex(renders.RenderError, "중복"):
            renders.load_selection(self.selection)

    def test_symlink_cannot_move_source_outside_its_pack(self):
        outside = self.root / "outside.glb"
        outside.write_bytes(self.source.read_bytes())
        self.source.unlink()
        self.source.symlink_to(outside)
        with self.assertRaisesRegex(renders.RenderError, "팩 밖"):
            renders.run(self.args(dry_run=True))

    def test_source_checksum_change_is_rejected(self):
        self.source.write_bytes(glb({"asset": {"version": "2.0", "generator": "changed"}}))
        with self.assertRaisesRegex(renders.RenderError, "SHA-256"):
            renders.run(self.args(dry_run=True))

    def test_source_url_must_match_this_pack_license_capture(self):
        self.asset["sourceUrl"] = "https://rg-poly.itch.io/farmland"
        self.write_selection()
        with self.assertRaisesRegex(renders.RenderError, "출처 URL"):
            renders.run(self.args(dry_run=True))

    def test_glb_header_chunk_and_external_uri_are_checked(self):
        bad = [b"not-a-glb", glb()[:-1], glb({"asset": {"version": "1.0"}}), glb({"asset": []}),
               glb({"asset": {"version": "2.0"}, "buffers": [{"uri": "https://example.invalid/mesh.bin"}]}),
               glb({"asset": {"version": "2.0"}, "images": [{"uri": "../texture.png"}]})]
        for value in bad:
            with self.subTest(value=value[:12]), self.assertRaises((renders.RenderError, ValueError)):
                renders.validate_glb(value)
        renders.validate_glb(glb({"asset": {"version": "2.0"}, "images": [{"uri": "data:image/png;base64,AA=="}]}))

    def test_rgba_resolution_transparency_and_silhouette_are_checked(self):
        target = self.root / "invalid.png"
        for options in ({"mode": "RGB"}, {"size": (512, 512)}, {"empty": True}, {"clipped": True}):
            with self.subTest(options=options):
                png(target, **options)
                with self.assertRaises(renders.RenderError):
                    renders.verify_image(target)

    def test_reuse_requires_proof_and_checks_png_hash(self):
        png(self.png_root / (self.asset["id"] + ".png"))
        with self.assertRaises(FileNotFoundError):
            renders.run(self.args())
        self.prepare_png()
        with (self.png_root / (self.asset["id"] + ".png")).open("ab") as stream:
            stream.write(b"changed")
        with self.assertRaisesRegex(renders.RenderError, "PNG 해시"):
            renders.run(self.args())
        self.unchanged()

    def test_local_default_is_pending_review_and_never_copies_source_glb(self):
        self.prepare_png()
        result = renders.run(self.args())
        manifest = json.loads((Path(result["localPack"]) / "manifest.json").read_text())
        self.assertFalse(manifest["assets"][0]["visualReviewed"])
        self.assertFalse(manifest["assets"][0]["studioRuntimeVerified"])
        self.assertEqual(manifest["assets"][0]["curationStatus"], "pending-visual-review")
        self.assertEqual(list(Path(result["localPack"]).rglob("*.glb")), [])
        self.unchanged()

    def test_publish_requires_explicit_visual_review(self):
        self.prepare_png()
        with self.assertRaisesRegex(renders.RenderError, "visualReviewed=true"):
            renders.run(self.args(publish=True))
        self.unchanged()

    def test_publish_includes_only_reviewed_items_after_integrity_gate(self):
        self.asset["visualReviewed"] = True
        unreviewed = {**self.asset, "id": "unreviewed-prop", "visualReviewed": False}
        self.write_selection([self.asset, unreviewed])
        self.prepare_png([self.asset])
        result = renders.run(self.args(publish=True))
        self.assertTrue(result["published"])
        manifest = json.loads((self.output / "manifest.json").read_text())
        self.assertEqual([item["id"] for item in manifest["assets"]], [self.asset["id"]])
        self.assertTrue(manifest["assets"][0]["visualReviewed"])
        self.assertFalse(manifest["assets"][0]["studioRuntimeVerified"])
        self.assertEqual(list(self.output.rglob("*.glb")), [])

    def test_partial_blender_failure_preserves_original_public_pack(self):
        original_run = subprocess.run
        def fail_render(command, **kwargs):
            if command[0] != "fake-blender":
                return original_run(command, **kwargs)
            self.assertIn("--python-exit-code", command)
            target = Path(command[-1]) / (self.asset["id"] + ".png")
            png(target)
            return SimpleNamespace(returncode=42)
        with patch.object(renders.subprocess, "run", side_effect=fail_render):
            with self.assertRaisesRegex(renders.RenderError, "Blender 렌더가 실패"):
                renders.run(self.args(reuse_renders=None))
        self.unchanged()

    def test_texture_binding_is_confined_pinned_and_in_reuse_proof(self):
        texture = self.source.parent / "atlas.png"
        Image.new("RGB", (16, 16), "red").save(texture)
        binding = {"materialName": "Atlas", "source": texture.relative_to(self.library).as_posix(), "sha256": renders.digest(texture.read_bytes())}
        self.asset["textureBindings"] = [binding]
        self.write_selection()
        self.prepare_png([{key: value for key, value in self.asset.items() if key != "textureBindings"}])
        with self.assertRaisesRegex(renders.RenderError, "텍스처 바인딩"):
            renders.run(self.args())
        self.prepare_png()
        result = renders.run(self.args())
        manifest = json.loads((Path(result["localPack"]) / "manifest.json").read_text())
        self.assertEqual(manifest["assets"][0]["sourceTextureSha256s"], [binding["sha256"]])
        texture.write_bytes(b"changed")
        with self.assertRaisesRegex(renders.RenderError, "텍스처 SHA-256"):
            renders.run(self.args(dry_run=True))

    def test_orphan_public_file_is_rejected_before_publish(self):
        self.asset["visualReviewed"] = True
        self.write_selection()
        self.prepare_png()
        (self.output / "orphan.webp").write_bytes(b"unreviewed")
        with self.assertRaisesRegex(renders.RenderError, "권리·파일 검증"):
            renders.run(self.args(publish=True))
        self.assertEqual((self.output / "manifest.json").read_text(), self.original)
        self.assertEqual((self.output / "orphan.webp").read_bytes(), b"unreviewed")

    def test_texture_png_mime_and_symlink_escape_are_rejected(self):
        texture = self.source.parent / "atlas.png"
        texture.write_bytes(b"not-a-png")
        self.asset["textureBindings"] = [{"materialName": "Atlas", "source": texture.relative_to(self.library).as_posix(), "sha256": renders.digest(texture.read_bytes())}]
        self.write_selection()
        with self.assertRaisesRegex(renders.RenderError, "MIME"):
            renders.run(self.args(dry_run=True))
        outside = self.root / "outside.png"
        Image.new("RGB", (16, 16), "red").save(outside)
        texture.unlink()
        texture.symlink_to(outside)
        self.asset["textureBindings"][0]["sha256"] = renders.digest(outside.read_bytes())
        self.write_selection()
        with self.assertRaisesRegex(renders.RenderError, "팩 밖"):
            renders.run(self.args(dry_run=True))

    def test_png_replaced_after_proof_check_is_rejected_before_publish(self):
        self.asset["visualReviewed"] = True
        self.write_selection()
        self.prepare_png()
        original_verify = renders.verify_render_proof
        def replace_after_check(assets, directory):
            result = original_verify(assets, directory)
            image_path = directory / (self.asset["id"] + ".png")
            with Image.open(image_path) as original:
                image = original.copy()
            image.putpixel((600, 600), (255, 0, 0, 255))
            image.save(image_path)
            return result
        with patch.object(renders, "verify_render_proof", side_effect=replace_after_check):
            with self.assertRaisesRegex(renders.RenderError, "PNG 해시"):
                renders.run(self.args(publish=True))
        self.unchanged()

    def test_interrupt_during_output_swap_restores_previous_pack(self):
        replacement = self.root / "replacement"
        replacement.mkdir()
        (replacement / "manifest.json").write_text("replacement")
        original_rename = renders.rename_no_replace
        def interrupt_ready(path, target):
            if path.name == "ready":
                raise KeyboardInterrupt()
            return original_rename(path, target)
        with patch.object(renders, "rename_no_replace", side_effect=interrupt_ready):
            with self.assertRaises(KeyboardInterrupt):
                renders.publish_pack(replacement, self.output)
        self.unchanged()

    def test_camera_and_rig_options_are_strict_and_defaults_are_unchanged(self):
        invalid = [None, [], [1, 2], [1, 2, 3, 4], [True, 1, 1], [1, False, 1], ["1", 1, 1],
                   [float("nan"), 1, 1], [1, float("inf"), 1], [11, 1, 1], [-10.01, 1, 1], [10 ** 1000, 1, 1], [0, 0, 0]]
        for value in invalid:
            with self.subTest(direction=value):
                self.write_selection([{**self.asset, "cameraDirection": value}])
                with self.assertRaisesRegex(renders.RenderError, "cameraDirection"):
                    renders.load_selection(self.selection)
                with self.assertRaisesRegex(ValueError, "cameraDirection"):
                    blender.camera_direction({"cameraDirection": value})
        for value in [None, False, "Icosphere", {"skip": "all"}]:
            self.write_selection([{**self.asset, "rigPolicy": value}])
            with self.assertRaisesRegex(renders.RenderError, "rigPolicy"):
                renders.load_selection(self.selection)
        self.assertEqual(renders.camera_direction(self.asset), [1.6, -2.4, 1.7])
        self.assertEqual(blender.camera_direction({}), [1.6, -2.4, 1.7])
        self.assertEqual(renders.camera_direction({"cameraDirection": [-10, 0, 10]}), [-10, 0, 10])
        self.assertIsNone(renders.render_input_fingerprint(self.asset))
        self.prepare_png()
        entry = json.loads((self.png_root / "render-proof.json").read_text())["assets"][0]
        self.assertEqual(set(entry), {"id", "sourceModelSha256", "textureBindings", "pngSha256"})

    def test_new_camera_rejects_legacy_proof_and_every_stale_fingerprint(self):
        self.prepare_png()
        self.asset["cameraDirection"] = [0, -1, 0.05]
        self.write_selection()
        with self.assertRaisesRegex(renders.RenderError, "지문"):
            renders.run(self.args())
        planned = self.planned()
        self.prepare_png(planned)
        proof_path = self.png_root / "render-proof.json"
        good = json.loads(proof_path.read_text())
        for key, value in [("sourceModelSha256", "a" * 64), ("renderModelSha256", "b" * 64),
                           ("cameraDirection", [1, -2, 0.08]), ("rigPolicy", renders.RIG_POLICY),
                           ("rendererSha256", "c" * 64), ("sourcePreparation", {"normalizerSha256": "d" * 64})]:
            with self.subTest(field=key):
                stale = copy.deepcopy(good)
                stale["assets"][0]["renderInputFingerprint"][key] = value
                proof_path.write_text(json.dumps(stale))
                with self.assertRaisesRegex(renders.RenderError, "지문"):
                    renders.run(self.args())
                self.unchanged()
        proof_path.write_text(json.dumps(good))
        result = renders.run(self.args())
        slot = json.loads((Path(result["localPack"]) / "manifest.json").read_text())["assets"][0]
        self.assertEqual(slot["sourceOriginalModelSha256"], self.asset["sourceModelSha256"])
        self.assertEqual(slot["renderInputFingerprint"]["cameraDirection"], [0, -1, 0.05])

    def test_preparation_keeps_raw_and_render_hashes_distinct_without_dry_run_writes(self):
        prepared_data = glb({"asset": {"version": "2.0", "generator": "prepared"}})
        prepared_sha = renders.digest(prepared_data)
        preparation = {"data": prepared_data, "sha256": prepared_sha,
                       "fingerprint": {"kind": "embed-pack-images-v1", "normalizerSha256": "e" * 64}, "checks": []}
        self.asset["sourcePreparation"] = {"kind": "embed-pack-images-v1"}
        self.asset["cameraDirection"] = [0, -1, 0.05]
        self.write_selection()
        # 입력 helper 자체의 형식·파일 검사는 전용 회귀가 맡고, 이 시험은 driver 연결을 검사한다.
        with patch.object(renders, "validate_preparation"), patch.object(renders, "prepare_render_input", return_value=preparation):
            renders.run(self.args(dry_run=True))
            self.assertFalse((self.root / "work").exists())
            planned = self.planned()
            self.prepare_png(planned)
            proof = json.loads((self.png_root / "render-proof.json").read_text())["assets"][0]
            self.assertEqual(proof["sourceModelSha256"], prepared_sha)
            self.assertEqual(proof["renderInputFingerprint"]["sourceModelSha256"], self.asset["sourceModelSha256"])
            with patch.object(renders, "revalidate_preparation") as revalidate:
                result = renders.run(self.args())
                revalidate.assert_called_once_with(preparation, self.library)
            slot = json.loads((Path(result["localPack"]) / "manifest.json").read_text())["assets"][0]
            self.assertEqual(slot["sourceModelSha256"], prepared_sha)
            self.assertEqual(slot["sourceOriginalModelSha256"], self.asset["sourceModelSha256"])
            self.assertEqual(self.source.read_bytes(), glb())
            self.assertNotIn(str(self.root), json.dumps(slot))
            self.unchanged()
            changed = copy.deepcopy(preparation)
            changed["fingerprint"]["normalizerSha256"] = "f" * 64
            with patch.object(renders, "prepare_render_input", return_value=changed):
                with self.assertRaisesRegex(renders.RenderError, "지문"):
                    renders.run(self.args())

    def test_prepared_glb_still_rejects_external_uri(self):
        preparation = {"data": glb({"asset": {"version": "2.0"}, "images": [{"uri": "../bad.png"}]}),
                       "sha256": "a" * 64, "fingerprint": {}, "checks": []}
        with patch.object(renders, "prepare_render_input", return_value=preparation):
            with self.assertRaisesRegex(renders.RenderError, "외부 URI"):
                renders.run(self.args(dry_run=True))
        self.assertFalse((self.root / "work").exists())
        self.unchanged()

    def test_real_preparation_is_pure_and_rechecks_approved_png_after_proof(self):
        import normalize_studio_asset_glb as normalizer
        texture = self.source.parent / "atlas.png"
        Image.new("RGBA", (16, 16), (20, 90, 150, 255)).save(texture)
        texture_bytes = texture.read_bytes()
        original = normalizer.write_glb({"asset": {"version": "2.0"}, "buffers": [{"byteLength": 4}],
                                         "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": 4}],
                                         "images": [{"uri": "atlas.png"}]}, b"mesh")
        self.source.write_bytes(original)
        prepared, _ = normalizer.normalize_bytes(original, lambda uri: texture_bytes)
        self.asset.update(sourceModelSha256=renders.digest(original), sourcePreparation={
            "kind": "embed-pack-images-v1", "expectedSha256": renders.digest(prepared), "images": [{
                "uri": "atlas.png", "source": texture.relative_to(self.library).as_posix(),
                "sha256": renders.digest(texture_bytes), "bytes": len(texture_bytes)}]})
        self.write_selection()
        renders.run(self.args(dry_run=True))
        self.assertFalse((self.root / "work").exists())
        planned = self.planned()
        self.assertEqual(planned[0]["renderPreparation"]["data"], prepared)
        self.prepare_png(planned)
        result = renders.run(self.args())
        slot = json.loads((Path(result["localPack"]) / "manifest.json").read_text())["assets"][0]
        self.assertEqual(slot["sourceModelSha256"], renders.digest(prepared))
        self.assertEqual(slot["sourceOriginalModelSha256"], renders.digest(original))
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(texture.read_bytes(), texture_bytes)
        verify = renders.verify_render_proof
        def replace_texture(assets, directory):
            verified = verify(assets, directory)
            texture.write_bytes(texture_bytes + b"changed")
            return verified
        with patch.object(renders, "verify_render_proof", side_effect=replace_texture):
            with self.assertRaisesRegex(ValueError, "바이트 수|SHA-256"):
                renders.run(self.args())
        self.unchanged()

    def test_renderer_change_after_proof_rejects_stale_image_before_publish(self):
        self.asset.update(cameraDirection=[0, -1, 0.05], visualReviewed=True)
        self.write_selection()
        renderer = self.root / "renderer.py"
        renderer.write_bytes(renders.BLENDER_SCRIPT.read_bytes())
        with patch.object(renders, "BLENDER_SCRIPT", renderer):
            self.prepare_png(self.planned())
            verify = renders.verify_render_proof
            def replace_renderer(assets, directory):
                verified = verify(assets, directory)
                renderer.write_bytes(renderer.read_bytes() + b"\n# changed\n")
                return verified
            with patch.object(renders, "verify_render_proof", side_effect=replace_renderer):
                with self.assertRaisesRegex(renders.RenderError, "검증 이후.*지문"):
                    renders.run(self.args(publish=True))
        self.unchanged()

    def test_rig_reuse_requires_actual_helper_check_record(self):
        self.asset["rigPolicy"] = renders.RIG_POLICY
        self.write_selection()
        self.prepare_png(self.planned())
        path = self.png_root / "render-proof.json"
        proof = json.loads(path.read_text())
        with self.assertRaisesRegex(renders.RenderError, "리그 검증 기록"):
            renders.run(self.args())
        proof["assets"][0]["rigChecks"] = {"bodyMeshes": 1, "bones": 21, "vertexGroups": 21, "excludedCustomShapes": ["Icosphere"]}
        path.write_text(json.dumps(proof))
        renders.run(self.args())
        proof["assets"][0]["rigChecks"]["bodyMeshes"] = True
        path.write_text(json.dumps(proof))
        with self.assertRaisesRegex(renders.RenderError, "리그 검증 기록"):
            renders.run(self.args())

    def test_new_helper_proof_is_required_and_is_not_overwritten_by_host(self):
        self.asset["cameraDirection"] = [0, -1, 0.05]
        self.write_selection()
        original_run = subprocess.run
        original_verify = renders.verify_render_proof
        observed = []
        helper_bytes = []
        def fake_render(command, **kwargs):
            if command[0] != "fake-blender":
                return original_run(command, **kwargs)
            jobs = json.loads(Path(command[-2]).read_text())
            directory = Path(command[-1])
            self.assertEqual(jobs[0]["cameraDirection"], self.asset["cameraDirection"])
            self.assertEqual(blender.verify_job_input(jobs[0]), jobs[0]["renderInputFingerprint"])
            png(directory / (self.asset["id"] + ".png"))
            proof = renders.make_render_proof(self.planned(), directory)
            proof["assets"][0]["helperObserved"] = "preserved"
            helper_bytes.append(json.dumps(proof).encode())
            (directory / "render-proof.json").write_bytes(helper_bytes[-1])
            return SimpleNamespace(returncode=0)
        def verify(assets, directory):
            observed.append(json.loads((directory / "render-proof.json").read_text())["assets"][0]["helperObserved"])
            return original_verify(assets, directory)
        with patch.object(renders.subprocess, "run", side_effect=fake_render), patch.object(renders, "verify_render_proof", side_effect=verify):
            renders.run(self.args(reuse_renders=None))
        self.assertEqual(observed, ["preserved"])
        saved_proof = json.loads((self.root / "work/render-proof.json").read_text())
        self.assertEqual(saved_proof["assets"][0]["helperObserved"], "preserved")
        self.assertEqual((self.root / "work/render-proof.json").read_bytes(), helper_bytes[0])
        def render_without_proof(command, **kwargs):
            if command[0] != "fake-blender":
                return original_run(command, **kwargs)
            png(Path(command[-1]) / (self.asset["id"] + ".png"))
            return SimpleNamespace(returncode=0)
        with patch.object(renders.subprocess, "run", side_effect=render_without_proof):
            with self.assertRaises(FileNotFoundError):
                renders.run(self.args(reuse_renders=None))
        self.unchanged()

    def test_prepared_job_writes_verified_temporary_input_and_helper_checks_actual_hashes(self):
        prepared = glb({"asset": {"version": "2.0", "generator": "prepared"}})
        plan = {**self.planned()[0], "cameraDirection": [0, -1, 0.05],
                "renderPreparation": {"data": prepared, "sha256": renders.digest(prepared), "fingerprint": None, "checks": []}}
        temporary = self.root / "job"
        temporary.mkdir()
        job = renders.render_jobs([plan], temporary)[0]
        self.assertEqual(Path(job["source"]).read_bytes(), prepared)
        self.assertTrue(Path(job["source"]).is_relative_to(temporary / "prepared"))
        self.assertEqual(job["sourceOriginal"], str(self.source.resolve()))
        blender.verify_job_input(job)
        with patch.object(blender, "RENDERER_SHA256", "d" * 64):
            with self.assertRaisesRegex(ValueError, "실제 해시"):
                blender.verify_job_input(job)
        for key, value in [("renderModelSha256", "a" * 64), ("sourceModelSha256", "b" * 64),
                           ("rendererSha256", "c" * 64), ("cameraDirection", [1, 0, 0]), ("rigPolicy", renders.RIG_POLICY)]:
            changed = copy.deepcopy(job)
            changed["renderInputFingerprint"][key] = value
            with self.subTest(field=key), self.assertRaises(ValueError):
                blender.verify_job_input(changed)
        Path(job["source"]).write_bytes(b"replaced")
        with self.assertRaisesRegex(ValueError, "실제 해시"):
            blender.verify_job_input(job)
        self.assertEqual(self.source.read_bytes(), glb())

    def test_append_only_blocks_ready_and_draft_collisions_before_writes_or_render(self):
        for status in ["visual-reviewed", "draft-waiting"]:
            self.original = json.dumps({"assets": [{"id": self.asset["id"], "curationStatus": status}]})
            (self.output / "manifest.json").write_text(self.original)
            for dry_run in [False, True]:
                with self.subTest(status=status, dry_run=dry_run), self.assertRaisesRegex(renders.RenderError, "append-only"):
                    renders.run(self.args(append_only=True, dry_run=dry_run, reuse_renders=None))
                self.assertFalse((self.root / "work").exists())
                self.unchanged()

    def test_append_only_rechecks_copied_stage_before_encoding(self):
        self.prepare_png()
        original_copy = renders.copy_existing_pack
        changed = json.dumps({"assets": [{"id": self.asset["id"], "curationStatus": "visual-reviewed"}]})
        def concurrent_change(source, destination):
            (source / "manifest.json").write_text(changed)
            original_copy(source, destination)
        with patch.object(renders, "copy_existing_pack", side_effect=concurrent_change), patch.object(renders, "encode_asset") as encode:
            with self.assertRaisesRegex(renders.RenderError, "stage 복사 도중 변경"):
                renders.run(self.args(append_only=True))
            encode.assert_not_called()
        self.assertEqual((self.output / "manifest.json").read_text(), changed)

    def test_append_only_new_id_preserves_existing_slot_and_all_image_bytes(self):
        self.asset["visualReviewed"] = True
        self.write_selection()
        self.prepare_png()
        renders.run(self.args(publish=True))
        before = json.loads((self.output / "manifest.json").read_text())
        files = {p.relative_to(self.output): p.read_bytes() for p in self.output.rglob("*.webp")}
        self.asset.update(id="new-reference", cameraDirection=[0, -1, 0.05])
        self.write_selection()
        self.prepare_png(self.planned())
        renders.run(self.args(publish=True, append_only=True))
        after = json.loads((self.output / "manifest.json").read_text())
        self.assertEqual(after["assets"][:-1], before["assets"])
        self.assertEqual(after["assets"][-1]["id"], "new-reference")
        for path, data in files.items():
            self.assertEqual((self.output / path).read_bytes(), data)

    def test_default_still_replaces_existing_complete_id(self):
        self.asset["visualReviewed"] = True
        self.write_selection()
        self.prepare_png()
        renders.run(self.args(publish=True))
        self.asset["name"] = "새 이름"
        self.write_selection()
        renders.run(self.args(publish=True))
        after = json.loads((self.output / "manifest.json").read_text())
        self.assertEqual(len(after["assets"]), 1)
        self.assertEqual(after["assets"][0]["name"], "새 이름")

    def test_append_only_concurrent_publisher_after_stage_copy_is_preserved(self):
        self.asset["visualReviewed"] = True
        self.write_selection()
        self.prepare_png()
        renders.run(self.args(publish=True))
        concurrent = self.root / "concurrent"
        renders.copy_existing_pack(self.output, concurrent)
        manifest = json.loads((concurrent / "manifest.json").read_text())
        slot = {**manifest["assets"][0], "id": "concurrent-prop",
                "path": "assets/concurrent-prop/prop.webp", "previewPath": "assets/concurrent-prop/thumbnail.webp"}
        renders.shutil.copytree(concurrent / "assets" / self.asset["id"], concurrent / "assets/concurrent-prop")
        manifest["assets"].append(slot)
        (concurrent / "manifest.json").write_text(json.dumps(manifest))
        expected = {p.relative_to(concurrent): p.read_bytes() for p in concurrent.rglob("*") if p.is_file()}
        self.asset["id"] = "new-reference"
        self.write_selection()
        self.prepare_png()
        encode = renders.encode_asset
        def publish_concurrently(*args, **kwargs):
            result = encode(*args, **kwargs)
            renders.publish_pack(concurrent, self.output)
            return result
        with patch.object(renders, "encode_asset", side_effect=publish_concurrently):
            with self.assertRaisesRegex(renders.RenderError, "게시.*변경"):
                renders.run(self.args(publish=True, append_only=True))
        actual = {p.relative_to(self.output): p.read_bytes() for p in self.output.rglob("*") if p.is_file()}
        self.assertEqual(actual, expected)


class BlenderRigPolicyTests(unittest.TestCase):
    def fixture(self):
        shape = SimpleNamespace(name="표시형상", type="MESH", vertex_groups=[], modifiers=[], hide_render=False)
        rig = SimpleNamespace(name="Rig", type="ARMATURE", data=SimpleNamespace(bones=[object() for _ in range(21)]),
                              pose=SimpleNamespace(bones=[SimpleNamespace(custom_shape=shape) for _ in range(21)]))
        body = SimpleNamespace(name="Body", type="MESH", vertex_groups=[object() for _ in range(21)],
                               modifiers=[SimpleNamespace(type="ARMATURE", object=rig)], hide_render=False)
        return rig, body, shape

    def test_only_actual_custom_shape_references_are_excluded_without_mutating_objects(self):
        rig, body, shape = self.fixture()
        meshes, excluded = blender.select_render_meshes([rig, body, shape], renders.RIG_POLICY)
        self.assertIs(meshes[0], body)
        self.assertEqual(len(meshes), 1)
        self.assertEqual(len(excluded), 1)
        self.assertIs(excluded[0], shape)
        self.assertFalse(shape.hide_render)
        self.assertFalse(body.hide_render)
        default_meshes, default_excluded = blender.select_render_meshes([rig, body, shape])
        self.assertEqual(len(default_meshes), 2)
        self.assertEqual(default_excluded, [])
        with self.assertRaisesRegex(ValueError, "rigPolicy"):
            blender.select_render_meshes([rig, body, shape], "skip-Icosphere")

    def test_unreferenced_icosphere_and_same_named_distinct_mesh_are_not_hidden(self):
        rig, body, shape = self.fixture()
        extra = SimpleNamespace(name="Icosphere", type="MESH", vertex_groups=[], modifiers=[], hide_render=False)
        for name in ["Icosphere", shape.name]:
            extra.name = name
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "본체"):
                blender.select_render_meshes([rig, body, shape, extra], renders.RIG_POLICY)
            self.assertFalse(extra.hide_render)

    def test_unsafe_shapes_wrong_counts_and_wrong_armature_connections_fail_closed(self):
        for scenario in ["body-is-shape", "weighted-shape", "armature-shape", "nonmesh-shape", "no-rig", "extra-rig",
                         "bones20", "pose20", "groups20", "no-modifier", "wrong-rig", "two-modifiers", "no-body"]:
            rig, body, shape = self.fixture()
            objects = [rig, body, shape]
            if scenario == "body-is-shape":
                rig.pose.bones[0].custom_shape = body
            elif scenario == "weighted-shape":
                shape.vertex_groups = [object()]
            elif scenario == "armature-shape":
                shape.modifiers = [SimpleNamespace(type="ARMATURE", object=rig)]
            elif scenario == "nonmesh-shape":
                shape.type = "EMPTY"
            elif scenario == "no-rig":
                objects.remove(rig)
            elif scenario == "extra-rig":
                objects.append(SimpleNamespace(type="ARMATURE"))
            elif scenario == "bones20":
                rig.data.bones.pop()
            elif scenario == "pose20":
                rig.pose.bones.pop()
            elif scenario == "groups20":
                body.vertex_groups.pop()
            elif scenario == "no-modifier":
                body.modifiers = []
            elif scenario == "wrong-rig":
                body.modifiers[0].object = SimpleNamespace(name=rig.name)
            elif scenario == "two-modifiers":
                body.modifiers.append(SimpleNamespace(type="ARMATURE", object=rig))
            elif scenario == "no-body":
                objects.remove(body)
            with self.subTest(scenario=scenario), self.assertRaises(ValueError):
                blender.select_render_meshes(objects, renders.RIG_POLICY)
            self.assertFalse(shape.hide_render)
            self.assertFalse(body.hide_render)


class LicensedRenderTests(unittest.TestCase):
    """공유 Node 판정 뒤의 출력 계약만 순수 Python으로 확인한다."""

    def setUp(self):
        guard = patch.object(renders.subprocess, "run", side_effect=AssertionError("표적 회귀에서 Node·Blender를 실행할 수 없습니다."))
        guard.start()
        self.addCleanup(guard.stop)

    def asset(self, small_props=False):
        pack_id = "cbv1-077-small-props-pack" if small_props else "cbv1-012-cemetery-statues"
        provider = "RG Poly" if small_props else "EmaceArt"
        url = ("https://rg-poly.itch.io/medieval-props-small-pack-low-poly" if small_props
               else "https://emaceart.itch.io/cemetery-statues")
        source = ("02-medieval-fantasy/free-medieval-props-small-pack-low-poly/models/mixed/gLTF/Props/Bag_1_A.glb"
                  if small_props else "05-horror-gothic/cemetery-statues/models/glb/EA_Bld_Column_01a.glb")
        rights = {"ledgerPackId": pack_id, "serve": "allow", "status": "licensed",
                  "licenseName": "구매 번들 ToonStudio 상업적 프로젝트 사용 (소유자 확인)",
                  "commercialUse": True, "attributionRequired": False}
        grant = {key: rights[key] for key in ("status", "licenseName", "commercialUse", "attributionRequired")}
        grant.update(inServiceOnly=True, downloadable=False, redistributionAllowed=False)
        return {"id": "licensed-small-props" if small_props else "licensed-cemetery", "name": "구매 소품",
                "packId": pack_id, "catalogId": pack_id, "source": source,
                "sourceUrl": url, "selectionTerm": "구매 소품", "sourceModelSha256": "a" * 64,
                "visualReviewed": False, "rightsInfo": {"rights": rights, "grant": grant,
                "provider": provider, "libraryPacks": [source.split("/")[1]], "checkedOn": "2026-10-30"}}

    def test_public_creator_pages_accept_both_approved_pack_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "selection.json"
            assets = [self.asset(), self.asset(True)]
            path.write_text(json.dumps({"assets": assets}))
            self.assertEqual(renders.load_selection(path), assets)

    def test_creator_source_rejects_private_credentials_other_hosts_and_queries(self):
        urls = ["http://emaceart.itch.io/cemetery-statues", "https://itch.io/cemetery-statues",
                "https://emaceart.itch.io.evil.test/cemetery-statues", "https://u:p@emaceart.itch.io/cemetery-statues",
                "https://emaceart.itch.io:8443/cemetery-statues", "https://emaceart.itch.io/cemetery-statues?download=1",
                "https://emaceart.itch.io/cemetery-statues#private", "https://emaceart.itch.io/download",
                "https://emaceart.itch.io/private", "https://emaceart.itch.io/dashboard",
                "https://emaceart.itch.io/api", "https://emaceart.itch.io/item/download/private"]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "selection.json"
            for url in urls:
                with self.subTest(url=url):
                    path.write_text(json.dumps({"assets": [{**self.asset(), "sourceUrl": url}]}))
                    with self.assertRaises(renders.RenderError):
                        renders.load_selection(path)

    def test_licensed_metadata_has_distinct_stable_pack_ids_and_preserves_source_date(self):
        licenses = [renders.render_license_metadata(self.asset(value)) for value in (False, True)]
        self.assertNotEqual(licenses[0]["id"], licenses[1]["id"])
        for small_props, license in zip((False, True), licenses, strict=True):
            asset = self.asset(small_props)
            self.assertEqual(license["id"], "cb-ledger-" + renders.digest(asset["packId"].encode("utf-8")))
            self.assertEqual(len(license["id"]), 74)
            self.assertEqual(license, renders.render_license_metadata(asset))
            self.assertIsNone(license["url"])
            self.assertFalse(license["redistributionAllowed"])
            self.assertTrue(license["commercialUse"])
            self.assertTrue(license["inServiceOnly"])
            self.assertEqual(license["checkedOn"], "2026-10-30")
            self.assertEqual(license["provider"], asset["rightsInfo"]["provider"])
            self.assertEqual(license["sourceUrl"], asset["sourceUrl"])

    def test_licensed_grant_and_projection_must_match_without_broadening_use(self):
        invalid = [("rights", "serve", "hold"), ("rights", "ledgerPackId", "cbv1-008-cute-park-pack"),
                   ("rights", "commercialUse", False), ("rights", "attributionRequired", True),
                   ("grant", "status", "public-domain"), ("grant", "licenseName", "different"),
                   ("grant", "commercialUse", False), ("grant", "attributionRequired", True),
                   ("grant", "inServiceOnly", False), ("grant", "downloadable", True),
                   ("grant", "redistributionAllowed", True), ("grant", "inServiceOnly", 1)]
        for section, key, value in invalid:
            with self.subTest(section=section, key=key, value=value):
                asset = self.asset()
                asset["rightsInfo"][section][key] = value
                with self.assertRaises(renders.RenderError):
                    renders.render_license_metadata(asset)

    def test_licensed_cannot_claim_cc0_and_missing_grant_is_rejected(self):
        for name in ("CC0-1.0", "cc0-1.0", "Cc0-1.0"):
            asset = self.asset()
            asset["rightsInfo"]["rights"]["licenseName"] = name
            asset["rightsInfo"]["grant"]["licenseName"] = name
            with self.subTest(name=name), self.assertRaises(renders.RenderError):
                renders.render_license_metadata(asset)
        asset = self.asset()
        del asset["rightsInfo"]["grant"]
        with self.assertRaises(renders.RenderError):
            renders.render_license_metadata(asset)

    def test_cc0_keeps_official_id_deed_and_redistribution(self):
        asset = self.asset()
        rights = asset["rightsInfo"]["rights"]
        rights.update(status="public-domain", licenseName="CC0-1.0")
        asset["rightsInfo"]["grant"] = {key: rights[key] for key in ("status", "licenseName", "commercialUse", "attributionRequired")}
        asset["rightsInfo"]["checkedOn"] = "2026-10-28"
        license = renders.render_license_metadata(asset)
        self.assertEqual(license["id"], "CC0-1.0")
        self.assertEqual(license["url"], renders.CC0_DEED)
        self.assertTrue(license["redistributionAllowed"])
        self.assertEqual(license["checkedOn"], "2026-10-28")

    def test_capture_date_must_be_a_real_iso_date(self):
        for value in (None, "2026-02-30", "20261030", "2026-10-30T00:00:00Z"):
            asset = self.asset()
            asset["rightsInfo"]["checkedOn"] = value
            with self.subTest(value=value), self.assertRaisesRegex(renders.RenderError, "verifiedAt"):
                renders.render_license_metadata(asset)

    def test_mocked_shared_gate_result_is_checked_before_render_planning(self):
        asset = self.asset()
        approved = {asset["id"]: asset["rightsInfo"]}
        response = SimpleNamespace(returncode=0, stdout=json.dumps(approved), stderr="")
        with patch.object(renders.subprocess, "run", return_value=response) as gate:
            self.assertEqual(renders.load_rights([asset], Path("unused-fixture-ledger.json")), approved)
            self.assertEqual(gate.call_count, 1)
        approved[asset["id"]]["grant"]["redistributionAllowed"] = True
        response.stdout = json.dumps(approved)
        with patch.object(renders.subprocess, "run", return_value=response):
            with self.assertRaises(renders.RenderError):
                renders.load_rights([asset], Path("unused-fixture-ledger.json"))

    def test_licensed_webp_output_preserves_ledger_label_and_does_not_claim_cc0(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            png_root = root / "png"
            png_root.mkdir()
            for small_props in (False, True):
                asset = self.asset(small_props)
                path = png_root / (asset["id"] + ".png")
                png(path)
                row = renders.encode_asset(asset, png_root, root / "pack", False, renders.digest(path.read_bytes()))
                self.assertEqual(row["license"], renders.render_license_metadata(asset))
                self.assertEqual(row["rights"], asset["rightsInfo"]["rights"])
                self.assertEqual(row["rights"]["licenseName"], "구매 번들 ToonStudio 상업적 프로젝트 사용 (소유자 확인)")
                self.assertFalse(row["visualReviewed"])
                self.assertFalse(row["studioRuntimeVerified"])
                self.assertEqual(row["curationStatus"], "pending-visual-review")
                self.assertEqual(row["sourceModelSha256"], asset["sourceModelSha256"])

    def test_declared_cc0_is_preserved_and_approved_licensed_declarations_are_added(self):
        cc0 = {"id": "CC0-1.0", "provider": "RG Poly", "sourceHost": "RG-POLY.ITCH.IO",
               "deedUrl": renders.CC0_DEED, "note": "기존 선언 보존"}
        pack = {"licenses": [cc0]}
        before = json.dumps(pack, sort_keys=True)
        replacements = [{"license": renders.render_license_metadata(self.asset(value))} for value in (False, True)]
        declarations = renders.merge_render_license_declarations(pack, replacements)
        self.assertEqual(json.dumps(pack, sort_keys=True), before)
        self.assertEqual(declarations[0], cc0)
        self.assertEqual(len(declarations), 3)
        for declaration, asset in zip(declarations[1:], replacements, strict=True):
            license = asset["license"]
            self.assertEqual(declaration, {"id": license["id"], "provider": license["provider"],
                             "sourceHost": "emaceart.itch.io" if license["provider"] == "EmaceArt" else "rg-poly.itch.io",
                             "deedUrl": None})
        self.assertEqual(renders.merge_render_license_declarations({"licenses": declarations}, replacements), declarations)

    def test_missing_license_declarations_keeps_the_existing_implicit_path(self):
        pack = {"id": "bundle-renders-v1", "inServiceOnly": True, "downloadable": False}
        before = dict(pack)
        replacements = [{"license": renders.render_license_metadata(self.asset())}]
        self.assertIsNone(renders.merge_render_license_declarations(pack, replacements))
        self.assertEqual(pack, before)
        self.assertNotIn("licenses", pack)

    def test_declaration_conflicts_and_duplicate_ids_leave_the_original_pack_unchanged(self):
        cemetery = renders.render_license_metadata(self.asset())
        existing = {"id": cemetery["id"], "provider": cemetery["provider"],
                    "sourceHost": "emaceart.itch.io", "deedUrl": None}
        replacements = [{"license": renders.render_license_metadata(self.asset(True))}, {"license": cemetery}]
        for field, value in (("provider", "다른 제작사"), ("sourceHost", "other.itch.io"),
                             ("deedUrl", "https://example.test/license")):
            pack = {"licenses": [{**existing, field: value}]}
            before = json.dumps(pack, sort_keys=True)
            with self.subTest(field=field), self.assertRaisesRegex(renders.RenderError, "선언이 다릅니다"):
                renders.merge_render_license_declarations(pack, replacements)
            self.assertEqual(json.dumps(pack, sort_keys=True), before)
        pack = {"licenses": [existing, dict(existing)]}
        before = json.dumps(pack, sort_keys=True)
        with self.assertRaisesRegex(renders.RenderError, "중복"):
            renders.merge_render_license_declarations(pack, replacements)
        self.assertEqual(json.dumps(pack, sort_keys=True), before)


if __name__ == "__main__":
    unittest.main()
