"""번들 렌더의 권리·경로·원본 고정과 공개 전 검증을 시험한다."""

import argparse
import importlib.util
import json
import struct
import subprocess
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
        original_rename = Path.rename
        def interrupt_ready(path, target):
            if path.name == "ready":
                raise KeyboardInterrupt()
            return original_rename(path, target)
        with patch.object(Path, "rename", new=interrupt_ready):
            with self.assertRaises(KeyboardInterrupt):
                renders.publish_pack(replacement, self.output)
        self.unchanged()


if __name__ == "__main__":
    unittest.main()
