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
            kept = ["index.html", "assets/public-AbCd1234.js", "assets/opencv-public-demo-AbCd1234.js",
                    "assets/main-AbCd1234.css", "fonts/public.woff2", "brand/public.webp", "data/catalog/01.json",
                    "i18n/ko/common.json", "locales/en.json", "catalog/index.json", "assets/studio-bg3d-physics.worker-public-demo-AbCd1234.js",
                    "assets/studio-offline-branch.worker-public-demo-AbCd1234.js",
                    "assets/studio-bg3d-babylon-runtime-public-demo-AbCd1234.js",
                    "assets/StudioPptProDrawingPanel-AbCd1234.js", "assets/OtherStudioPanel-AbCd1234.js"]
            omitted = ["assets/opencv-AbCd1234.js", "assets/web-ifc-api-AbCd1234.js",
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

    def test_exact_editor_only_outputs_are_omitted_but_public_and_similar_names_are_kept(self):
        # PR #2915의 실제 7개 출력 이름이다. 공개 진입·공유 라이브러리를 이름 접두사로 제거하지 않는다.
        outputs = [
            ("studio-legacy-editor-adapter", "DuAiZQPz"), ("StudioBackground3D", "BSNomNzI"),
            ("StudioBg3dAdvancedWorkbenchHub", "DLXZTVE0"), ("StudioAiSuperSuiteModal", "BH9rMbm-"),
            ("spark.module", "DIN76ddv"), ("studio-svg-export.worker", "BrFzt7r4"),
            ("StudioInspectorAside", "BMWSV9Jq"),
        ]
        kept = ["index.html", "assets/engineering-atlas-content-Dw9uIV7G.js", "assets/phaser.esm-BxCDEWDb.js",
                "assets/three.webgpu-B1J9WKJU.js", "assets/pdf.worker.min-CIqJB0yW.mjs",
                "assets/StudioCharacterShaper-CNxchBWK.js", "assets/useStudioVrmPoserController-BPE66aKi.js",
                "assets/StudioVirtualSpacePage-BqNBT1tY.js", "assets/OpenEcosystemWorkflowHubPanel-B14vJxtl.js",
                "fonts/public.woff2", "i18n/ko/common.json"]
        omitted = []
        for stem, digest in outputs:
            omitted.append(f"assets/{stem}-{digest}.js")
            kept.extend([f"assets/{stem}-public-demo-AbCd1234.js", f"assets/{stem}.js",
                         f"assets/{stem}-AbCd123.js", f"assets/{stem}-AbCd12345.js",
                         f"assets/{stem}-AbCd1234.mjs", f"assets/{stem}-AbCd1234.css"])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "dist"
            before = {}
            for name in kept + omitted:
                source = root / name
                source.parent.mkdir(parents=True, exist_ok=True)
                before[name] = (name + "\n").encode()
                source.write_bytes(before[name])
            output = Path(temp) / "preview.tar.gz"
            result = preview.package_preview(root, output)
            with tarfile.open(output) as archive:
                self.assertEqual(set(archive.getnames()), {"dist/" + name for name in kept})
                self.assertEqual(sum(member.size for member in archive.getmembers()), result["uncompressedBytes"])
                for name in kept:
                    self.assertEqual(archive.extractfile("dist/" + name).read(), before[name])
            for name in kept + omitted:
                self.assertEqual((root / name).read_bytes(), before[name])

    def test_observed_growth_is_removed_before_budget_sum_without_allocating_or_rewriting_dist(self):
        # 표시된 kB에서 얻은 크기는 경로 선택 회귀용이다. 실제 최종 빌드 크기는 별도 측정한다.
        outputs = {
            "studio-legacy-editor-adapter-DuAiZQPz.js": 2_537_220,
            "StudioBackground3D-BSNomNzI.js": 1_789_680,
            "StudioBg3dAdvancedWorkbenchHub-DLXZTVE0.js": 1_478_550,
            "StudioAiSuperSuiteModal-BH9rMbm-.js": 1_208_390,
            "spark.module-DIN76ddv.js": 2_800_770,
            "studio-svg-export.worker-BrFzt7r4.js": 979_350,
            "StudioInspectorAside-BMWSV9Jq.js": 642_930,
        }
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "dist"
            assets = root / "assets"
            assets.mkdir(parents=True)
            public = assets / "public-AbCd1234.js"
            sizes = {public: 255_603_742 - sum(outputs.values())}
            sizes.update({assets / name: size for name, size in outputs.items()})
            for source, size in sizes.items():
                with source.open("wb") as file:
                    file.truncate(size)
            self.assertEqual(sum(sizes.values()), 255_603_742)
            selected = preview.select_preview_files(root)
            self.assertEqual(selected, {public})
            self.assertEqual(sum(path.stat().st_size for path in selected), 244_166_852)
            self.assertLess(sum(path.stat().st_size for path in selected), preview.MAX_PREVIEW_BYTES)
            self.assertEqual({source: source.stat().st_size for source in sizes}, sizes)

    def test_editor_omission_policy_retains_explicit_lazy_entry_boundaries(self):
        # 제외 파일의 실제 소유 경계가 바뀌면 범위를 다시 검토한다. 공개·공유 파일 전체를 순회하지 않는다.
        root = Path(__file__).resolve().parents[1]
        creator = root / "apps/web/src/domains/creator"
        boundaries = {
            "studio-router/routes/StudioEditorRoute.tsx": 'import("../../studio-legacy-editor-adapter")',
            "studio-background-3d-loader.ts": 'import("./bg3d/StudioBackground3D")',
            "bg3d/StudioBg3dSpatialStoryboardLauncher.tsx": 'lazy(() => import("./StudioBg3dAdvancedWorkbenchHub"))',
            "ai/studio-ai-super-suite-loader.ts": 'import("./StudioAiSuperSuiteModal")',
            "scene3d/specialists/splat-reference-runtime.ts": 'import("@sparkjsdev/spark")',
            "bg3d/StudioBg3dProSuitePanelContent.tsx": 'lazy(() => import("../scene3d/specialists/StudioScene3dSplatReferencePanel")',
            "export/studio-svg-export-worker-client.ts": 'new Worker(new URL("./studio-svg-export.worker.ts", import.meta.url)',
            "studio-inspector-aside-loader.ts": 'import("./StudioInspectorAside")',
        }
        for path, fragment in boundaries.items():
            with self.subTest(path=path):
                self.assertIn(fragment, (creator / path).read_text())
        self.assertEqual(preview.MAX_PREVIEW_BYTES, 250_000_000)

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
