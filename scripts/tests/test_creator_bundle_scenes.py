"""완성 배경의 입력·출처 고정·픽셀 무손실 조건을 검증한다."""
import copy
import importlib.util
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

SCRIPT = Path(__file__).resolve().parents[1] / "render-creator-bundle-scenes.py"
SPEC = importlib.util.spec_from_file_location("bundle_scenes", SCRIPT)
SCENES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SCENES)


class BundleSceneTests(unittest.TestCase):
    def setUp(self):
        self.document = json.loads(SCENES.DEFAULT_RECIPES.read_text())
        selected = SCENES.PROPS.load_selection(SCENES.PROPS.DEFAULT_SELECTION)
        self.sources = [{**source, "resolvedSource": "/local/" + source["source"],
                         "resolvedTextureBindings": [], "rightsInfo": {"provider": "RG Poly", "rights": {"ledgerPackId": source["packId"], "status": "public-domain", "serve": "allow"}}}
                        for source in selected]

    def test_unreviewed_or_unknown_source_and_mixed_pack_cannot_form_scene(self):
        for unknown in ["missing-model", "cbv1-014-catedra"]:
            document = copy.deepcopy(self.document)
            document["recipes"][0]["models"][0]["assetId"] = unknown
            with self.assertRaises(SCENES.PROPS.RenderError):
                SCENES.plan_recipes(document, self.sources)
        sources = copy.deepcopy(self.sources)
        sources[0]["visualReviewed"] = False
        with self.assertRaisesRegex(SCENES.PROPS.RenderError, "검수"):
            SCENES.plan_recipes(self.document, sources)

    def test_camera_and_transform_reject_nonfinite_and_degenerate_values(self):
        for field, value in [("extent", float("nan")), ("extent", True), ("rotationZ", float("inf")), ("position", [0, 0, float("nan")])]:
            document = copy.deepcopy(self.document)
            document["recipes"][0]["models"][0][field] = value
            with self.subTest(field=field), self.assertRaises(SCENES.PROPS.RenderError):
                SCENES.plan_recipes(document, self.sources)
        document = copy.deepcopy(self.document)
        document["recipes"][0]["camera"]["location"] = document["recipes"][0]["camera"]["target"]
        with self.assertRaisesRegex(SCENES.PROPS.RenderError, "카메라"):
            SCENES.plan_recipes(document, self.sources)

    def test_render_fingerprint_binds_source_bytes_and_placement(self):
        original = SCENES.plan_recipes(self.document, self.sources)[0]["recipeSha256"]
        changed_sources = copy.deepcopy(self.sources)
        changed_sources[0]["sourceModelSha256"] = "f" * 64
        self.assertNotEqual(SCENES.plan_recipes(self.document, changed_sources)[0]["recipeSha256"], original)
        document = copy.deepcopy(self.document)
        document["recipes"][0]["models"][0]["position"][0] += 1
        self.assertNotEqual(SCENES.plan_recipes(document, self.sources)[0]["recipeSha256"], original)
        document = copy.deepcopy(self.document)
        document["recipes"][0]["visualReviewed"] = True
        self.assertEqual(SCENES.plan_recipes(document, self.sources)[0]["recipeSha256"], original)

    def test_render_fingerprint_binds_actual_renderer_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            renderer = root / "scripts/lib/render-creator-bundle-scenes-blender.py"
            renderer.parent.mkdir(parents=True)
            renderer.write_text("renderer revision one")
            with mock.patch.object(SCENES, "ROOT", root):
                original = SCENES.plan_recipes(self.document, self.sources)[0]["recipeSha256"]
                renderer.write_text("renderer revision two")
                self.assertNotEqual(SCENES.plan_recipes(self.document, self.sources)[0]["recipeSha256"], original)

    def test_reused_scene_proof_rejects_duplicate_missing_unknown_and_malformed_entries(self):
        jobs = SCENES.plan_recipes(self.document, self.sources)
        valid = [{"id": job["id"], "recipeSha256": job["recipeSha256"], "pngSha256": "a" * 64} for job in jobs]
        cases = [valid + [valid[0]], valid[:-1], valid + [{**valid[0], "id": "unknown-scene"}],
                 [None], [{**valid[0], "pngSha256": "bad"}, valid[1]],
                 [{**valid[0], "recipeSha256": "0" * 64}, valid[1]]]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            proof = root / "render-proof.json"
            proof.write_text(json.dumps({"schema": "toonstudio.creator-bundle-scene-proof.v1", "assets": valid}))
            self.assertEqual(set(SCENES.verify_scene_proof(jobs, root)), {job["id"] for job in jobs})
            for entries in cases:
                proof.write_text(json.dumps({"schema": "toonstudio.creator-bundle-scene-proof.v1", "assets": entries}))
                with self.subTest(entries=entries), self.assertRaises(SCENES.PROPS.RenderError):
                    SCENES.verify_scene_proof(jobs, root)

    def test_image_tampering_or_alpha_cannot_be_published_as_complete_background(self):
        job = SCENES.plan_recipes(self.document, self.sources)[0]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            stage = root / "stage"
            stage.mkdir()
            path = root / (job["id"] + ".png")
            Image.new("RGBA", (2048, 1152), (80, 100, 120, 255)).save(path)
            proof = {"recipeSha256": job["recipeSha256"], "pngSha256": SCENES.PROPS.digest(path.read_bytes())}
            Image.new("RGBA", (2048, 1152), (1, 2, 3, 255)).save(path)
            with self.assertRaisesRegex(SCENES.PROPS.RenderError, "해시"):
                SCENES.encode_scene(job, root, proof, stage)
            Image.new("RGBA", (2048, 1152), (80, 100, 120, 0)).save(path)
            proof["pngSha256"] = SCENES.PROPS.digest(path.read_bytes())
            with self.assertRaisesRegex(SCENES.PROPS.RenderError, "불투명"):
                SCENES.encode_scene(job, root, proof, stage)
            self.assertEqual(list(stage.iterdir()), [])

    def test_native_scene_pixels_survive_lossless_encoding_with_source_proof(self):
        job = SCENES.plan_recipes(self.document, self.sources)[0]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            stage = root / "stage"
            stage.mkdir()
            path = root / (job["id"] + ".png")
            original = Image.new("RGBA", (2048, 1152), (80, 100, 120, 255))
            original.save(path)
            proof = {"recipeSha256": job["recipeSha256"], "pngSha256": SCENES.PROPS.digest(path.read_bytes())}
            metadata = SCENES.encode_scene(job, root, proof, stage)
            with Image.open(stage / (job["id"] + ".webp")) as decoded:
                self.assertEqual(decoded.convert("RGBA").tobytes(), original.tobytes())
            self.assertEqual(metadata["sourceRecipeSha256"], job["recipeSha256"])
            self.assertEqual(len(metadata["sourceModels"]), len(job["models"]))
            self.assertEqual(metadata["provenance"]["kind"], "creator-bundle-cc0")
            self.assertEqual(metadata["style"], "stylized-low-poly")
            preview = stage / (job["id"] + "-preview.webp")
            self.assertEqual(metadata["previewBytes"], preview.stat().st_size)
            self.assertEqual(metadata["previewSha256"], SCENES.PROPS.digest(preview.read_bytes()))

    def test_final_ledger_recipe_gate_failure_does_not_replace_existing_pack(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source_path = root / "original.glb"
            source_path.write_bytes(b"fixture source bytes")
            sources = copy.deepcopy(self.sources)
            for source in sources:
                source["resolvedSource"] = str(source_path)
                source["sourceModelSha256"] = SCENES.PROPS.digest(source_path.read_bytes())
            document = copy.deepcopy(self.document)
            document["recipes"] = document["recipes"][:1]
            jobs = SCENES.plan_recipes(document, sources)
            recipes = root / "recipes.json"
            recipes.write_text(json.dumps(document))
            png_root = root / "png"
            png_root.mkdir()
            png = png_root / (jobs[0]["id"] + ".png")
            Image.new("RGBA", (2048, 1152), (80, 100, 120, 255)).save(png)
            (png_root / "render-proof.json").write_text(json.dumps({"schema": "toonstudio.creator-bundle-scene-proof.v1", "assets": [
                {"id": jobs[0]["id"], "recipeSha256": jobs[0]["recipeSha256"], "pngSha256": SCENES.PROPS.digest(png.read_bytes())}]}))
            output = root / "public-pack"
            output.mkdir()
            (output / "previous.webp").write_bytes(b"previous validated output")
            args = SimpleNamespace(selection=SCENES.PROPS.DEFAULT_SELECTION, pack_rights=SCENES.PROPS.DEFAULT_LEDGER,
                                   node="node", library_root=root, recipes=recipes, publish=True, output_root=output,
                                   work_dir=root / "work", reuse_renders=png_root, dry_run=False)
            with mock.patch.object(SCENES.PROPS, "load_selection", return_value=sources), \
                 mock.patch.object(SCENES.PROPS, "load_rights", return_value={}), \
                 mock.patch.object(SCENES.PROPS, "plan_assets", return_value=sources), \
                 mock.patch.object(SCENES, "verify_scene_catalog", side_effect=SCENES.PROPS.RenderError("최종 원장이 바뀌었습니다.")), \
                 mock.patch.object(SCENES.PROPS, "publish_pack") as publish:
                with self.assertRaisesRegex(SCENES.PROPS.RenderError, "최종 원장"):
                    SCENES.run(args)
                publish.assert_not_called()
            self.assertEqual((output / "previous.webp").read_bytes(), b"previous validated output")
            self.assertEqual(list(output.iterdir()), [output / "previous.webp"])
            # 공개 전 검수용 렌더는 허용한다. 검수 전 상태를 공개 게이트로 잘못 막지 않는다.
            document["recipes"][0]["visualReviewed"] = False
            recipes.write_text(json.dumps(document))
            args.publish = False
            with mock.patch.object(SCENES.PROPS, "load_selection", return_value=sources), \
                 mock.patch.object(SCENES.PROPS, "load_rights", return_value={}), \
                 mock.patch.object(SCENES.PROPS, "plan_assets", return_value=sources), \
                 mock.patch.object(SCENES, "verify_scene_catalog") as final_gate:
                self.assertFalse(SCENES.run(args)["published"])
                final_gate.assert_not_called()
            self.assertTrue((args.work_dir / "pack/manifest.json").is_file())
            self.assertEqual(list(output.iterdir()), [output / "previous.webp"])


if __name__ == "__main__":
    unittest.main()
