"""실제 tar 내용·원본 보존·250 MB 실패 경계를 검사한다."""
import importlib.util
from pathlib import Path
import tarfile
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("non_studio_preview", Path(__file__).with_name("package-non-studio-preview.py"))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewPackageTests(unittest.TestCase):
    def test_archive_keeps_public_dependencies_and_does_not_change_production_dist(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "dist"
            kept = ["index.html", "offline-draw/bootstrap.js", "assets/public-AbCd1234.js", "assets/opencv-public-demo-AbCd1234.js",
                    "assets/main-AbCd1234.css", "fonts/public.woff2", "brand/public.webp", "data/catalog/01.json",
                    "i18n/ko/common.json", "locales/en.json", "catalog/index.json", "assets/studio-bg3d-physics.worker-public-demo-AbCd1234.js",
                    "assets/studio-offline-branch.worker-public-demo-AbCd1234.js",
                    "assets/studio-bg3d-babylon-runtime-public-demo-AbCd1234.js",
                    "assets/spark.module-public-demo-AbCd1234.js", "assets/phaser.esm-public-demo-AbCd1234.js",
                    "assets/StudioScene3dSplatReferencePanel-AbCd1234.js", "assets/StudioVirtualSpacePhaserCanvas-AbCd1234.js",
                    "assets/StudioPptProDrawingPanel-AbCd1234.js", "assets/OtherStudioPanel-AbCd1234.js"]
            omitted = ["offline-draw/cache.js", "assets/opencv-AbCd1234.js", "assets/web-ifc-api-AbCd1234.js",
                       "assets/spark.module-DIN76ddv.js", "assets/phaser.esm-BxCDEWDb.js",
                       "assets/studio-bg3d-physics.worker-AbCd1234.js", "assets/studio-offline-branch.worker-AbCd1234.js",
                       "assets/studio-bg3d-babylon-runtime-AbCd1234.js",
                       "assets/3d/unused.png", "i18n/studio/unused.json"]
            # 2026-11-23 production 빌드에서 확인한 고급 PPT 두 탭의 실제 출력 이름이다.
            advanced_outputs = [
                "AutoQaCollabHubPanel-DIAF5OdY.js", "Csp3dUpgradeHubPanel-CvEWnHKv.js",
                "AutoQaPixelScannerPanel-DCe1JDKz.js", "AutoQaLayoutSpecPanel-BzIUUQlF.js",
                "AutoQaContinuityPanel-BFaroA6H.js", "CollabSignoffHubPanel-B17MYUZT.js",
                "PuppetWarpStudioPanel-BxvQnoXb.js", "Model3dSurfacePaintPanel-DhORoAVA.js",
                "Model3dHandCustomizerPanel-C3cgKpBS.js", "CspWatermarkVelocityPanel-Cm9tp8Ki.js",
            ]
            omitted.extend("assets/" + name for name in advanced_outputs)
            for name in advanced_outputs:
                stem = name.split("-", 1)[0]
                kept.extend([
                    f"assets/{stem}-public-demo-AbCd1234.js", f"assets/{stem}.js",
                    f"assets/{stem}-AbCd123.js", f"assets/{stem}-AbCd12345.js",
                ])
            before = {}
            for name in kept + omitted:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                before[name] = (name + "\n").encode()
                path.write_bytes(before[name])
            output = Path(temp) / "preview.tar.gz"
            result = preview.package_preview(root, output)
            with tarfile.open(output) as archive:
                self.assertEqual(set(archive.getnames()), {"dist/" + name for name in kept})
                self.assertEqual(sum(member.size for member in archive.getmembers()), result["uncompressedBytes"])
                for name in kept:
                    self.assertEqual(archive.extractfile("dist/" + name).read(), before[name])
            for name in kept + omitted:
                self.assertEqual((root / name).read_bytes(), before[name])

    def test_over_budget_fails_before_overwriting_an_existing_archive(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "dist"
            root.mkdir()
            with (root / "oversized.js").open("wb") as file:
                file.truncate(250_000_001)
            output = Path(temp) / "preview.tar.gz"
            output.write_bytes(b"previous verified archive")
            with self.assertRaisesRegex(SystemExit, "exceeds 250 MB"):
                preview.package_preview(root, output)
            self.assertEqual(output.read_bytes(), b"previous verified archive")


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
