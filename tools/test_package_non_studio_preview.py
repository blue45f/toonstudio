"""편집기 엔진을 제외해도 공개 QA 입력과 250 MB 경계가 유지되는지 확인한다."""
import importlib.util
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("preview", Path(__file__).with_name("package-non-studio-preview.py"))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class NonStudioPreviewTest(unittest.TestCase):
    def test_public_inputs_remain_and_only_named_studio_engines_are_omitted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "dist"
            keep = ["index.html", "assets/index-123.js", "assets/public-market-123.js", "assets/public-123.css", "brand/logo.svg", "fonts/public.woff2", "i18n/ko/common.json", "locales/en.json", "data/catalog/01.json", "catalog/index.json"]
            omit = ["assets/opencv-v4pJBd9I.js", "assets/studio-bg3d-physics.worker-CRWwYVPQ.js", "assets/editor-media/large.png", "i18n/studio/ko.json"]
            for name in keep + omit:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("fixture")
            output = Path(directory) / "preview.tar.gz"
            report = preview.package_preview(root, output)
            self.assertEqual(report["files"], len(keep))
            with tarfile.open(output) as archive:
                self.assertEqual(set(archive.getnames()), {f"dist/{name}" for name in keep})
            self.assertTrue(all((root / name).read_text() == "fixture" for name in keep + omit))

    def test_oversize_public_input_still_fails_before_writing_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "dist"
            root.mkdir()
            with (root / "index.html").open("wb") as source:
                source.truncate(preview.MAX_PREVIEW_BYTES + 1)
            output = Path(directory) / "preview.tar.gz"
            with self.assertRaisesRegex(SystemExit, "250 MB"):
                preview.package_preview(root, output)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
