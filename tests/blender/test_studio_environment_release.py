"""Studio 환경 배포 스크립트(refine_studio_environments_v6.py)의 순수 Python 계약.

Blender 없이 실행한다. bpy·mathutils 를 임시 스텁으로 바꿔 스크립트를 불러와 배포 manifest
병합 동작을 검증하고, Blender 5.0 에서 제거된 컴포지터 API 가 다시 들어오지 않는지 소스를 점검한다.
실제 Blender 5.2 렌더는 Studio environment pack validation 워크플로가 검증한다.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
from types import ModuleType
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "blender" / "refine_studio_environments_v6.py"
REBUILT_SCENE = "korean_convenience_store_night"
REBUILT_DIGEST = "sha256:" + "ab" * 32


def load_release_script() -> ModuleType:
    """bpy 없이 스크립트를 불러온다. 스텁은 불러오는 동안에만 sys.modules 에 둔다."""
    stubs = {"bpy": types.ModuleType("bpy"), "mathutils": types.ModuleType("mathutils")}
    setattr(stubs["mathutils"], "Matrix", object)
    setattr(stubs["mathutils"], "Vector", object)
    previous = {name: sys.modules.get(name) for name in stubs}
    sys.modules.update(stubs)
    try:
        spec = importlib.util.spec_from_file_location("refine_studio_environments_v6_under_test", SCRIPT)
        if spec is None or spec.loader is None:
            raise RuntimeError("cannot load " + str(SCRIPT))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for name, original in previous.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original


def released_record(name: str, index: int) -> dict:
    """1000x750, 24샘플로 배포된 기존 레코드(장면마다 값이 달라 보존 여부를 구분할 수 있다)."""
    return {
        "fileName": name + ".glb",
        "byteSize": 1000 + index,
        "sha256": "sha256:" + format(index + 1, "064x"),
        "url": "/assets/3d/environments/refined-v6/" + name + ".glb",
        "thumbnailUrl": "/assets/3d/environments/refined-v6/thumbnails/" + name + ".png",
        "bounds": [1.0, 2.0, 3.0],
        "sources": ["https://polyhaven.com/a/released_" + str(index)],
        "sourceByteSize": index + 1,
        "metrics": {"bytes": 1000 + index},
        "replacedGroups": 0,
        "refinedSurfaces": 1,
        "reviewLevel": "single-view-blender-preview",
        "allAnglesArtisticallyApproved": False,
        "studioRuntimeVerified": False,
        "renderPasses": {"engine": "CYCLES", "resolution": [1000, 750], "samples": 24},
    }


def rebuilt_report(name: str) -> dict:
    """CI 의 단일 장면 재빌드(320px, 4샘플)가 남기는 장면 리포트."""
    return {
        "sourceModels": [],
        "surfaces": [{"sourceUrl": "https://polyhaven.com/a/marble_01"}],
        "metrics": {"bytes": 4242},
        "sha256": REBUILT_DIGEST,
        "url": "/assets/3d/environments/refined-v6/" + name + ".glb",
        "thumbnailUrl": "/assets/3d/environments/refined-v6/thumbnails/" + name + ".png",
        "bounds": [4.0, 5.0, 6.0],
        "replacements": [],
        "renderPasses": {"engine": "CYCLES", "resolution": [320, 240], "samples": 4},
    }


class DeliveryManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_release_script()
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        base = Path(self.workspace.name)
        self.output = base / "refined-v6"
        self.artifacts = base / "artifacts"
        source = base / "source"
        for directory in (self.output, self.artifacts, source):
            directory.mkdir()
        self.module.OUTPUT = self.output
        self.module.ARTIFACTS = self.artifacts
        self.module.SOURCE = source
        for index, name in enumerate(self.module.CAMERAS):
            (source / (name + ".glb")).write_bytes(b"x" * (index + 1))
        self.released = {
            name + ".glb": released_record(name, index) for index, name in enumerate(self.module.CAMERAS)
        }

    def write_released_manifest(self) -> None:
        manifest = {"schema": "toonstudio.environment-refinement.v6", "records": list(self.released.values())}
        (self.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    def write_report(self, name: str) -> None:
        (self.artifacts / (name + ".json")).write_text(json.dumps(rebuilt_report(name)))

    def test_partial_rebuild_refreshes_only_the_rebuilt_record(self) -> None:
        self.write_released_manifest()
        self.write_report(REBUILT_SCENE)

        self.module.write_delivery_manifest()

        written = json.loads((self.output / "manifest.json").read_text())
        self.assertEqual(written["schema"], "toonstudio.environment-refinement.v6")
        self.assertEqual(
            [record["fileName"] for record in written["records"]],
            [name + ".glb" for name in self.module.CAMERAS],
        )
        by_file = {record["fileName"]: record for record in written["records"]}
        rebuilt = by_file[REBUILT_SCENE + ".glb"]
        self.assertEqual(rebuilt["sha256"], REBUILT_DIGEST)
        self.assertEqual(rebuilt["byteSize"], 4242)
        self.assertEqual(rebuilt["renderPasses"]["resolution"], [320, 240])
        self.assertEqual(rebuilt["sourceByteSize"], list(self.module.CAMERAS).index(REBUILT_SCENE) + 1)
        for file_name, record in by_file.items():
            if file_name != REBUILT_SCENE + ".glb":
                self.assertEqual(record, self.released[file_name], file_name + " must be preserved")
        licenses = (self.output / "LICENSES.md").read_text()
        self.assertIn("https://polyhaven.com/a/marble_01", licenses)
        self.assertIn("https://polyhaven.com/a/released_0", licenses)

    def test_full_rebuild_without_released_manifest_writes_every_record(self) -> None:
        for name in self.module.CAMERAS:
            self.write_report(name)

        self.module.write_delivery_manifest()

        written = json.loads((self.output / "manifest.json").read_text())
        self.assertEqual(len(written["records"]), len(self.module.CAMERAS))
        self.assertTrue(all(record["sha256"] == REBUILT_DIGEST for record in written["records"]))

    def test_incomplete_pack_without_released_manifest_is_not_written(self) -> None:
        self.write_report(REBUILT_SCENE)

        self.module.write_delivery_manifest()

        self.assertFalse((self.output / "manifest.json").exists())
        self.assertFalse((self.output / "LICENSES.md").exists())

    def test_corrupt_released_manifest_keeps_nothing_and_is_not_overwritten(self) -> None:
        (self.output / "manifest.json").write_text("{not json")
        self.write_report(REBUILT_SCENE)

        self.module.write_delivery_manifest()

        self.assertEqual((self.output / "manifest.json").read_text(), "{not json")


class PassCompositorContractTests(unittest.TestCase):
    """Blender 5.0 에서 바뀐 컴포지터 API 사용을 소스 수준에서 고정한다."""

    def setUp(self) -> None:
        self.source = SCRIPT.read_text()

    def test_uses_the_blender_5_compositor_node_group_api(self) -> None:
        for token in (
            "compositing_node_group",
            "file_output_items",
            "ShaderNodeMapRange",
            '"Ambient Occlusion"',
            "media_type",
            '"####"',
        ):
            self.assertIn(token, self.source)

    def test_does_not_use_compositor_api_removed_in_blender_5(self) -> None:
        for pattern in (
            r"scene\.node_tree",
            r"\bfile_slots\b",
            r"CompositorNodeMapRange",
            r"\.base_path\b",
            r'outputs\["AO"\]',
            r"scene\.use_nodes",
        ):
            self.assertNotRegex(self.source, pattern)

    def test_depth_and_normal_are_written_without_display_transform(self) -> None:
        self.assertIn('RAW_DATA_PASSES = ("depth", "normal")', self.source)
        self.assertIn("save_as_render = False", self.source)
        self.assertIn('linear_colorspace_settings.name = "Non-Color"', self.source)


if __name__ == "__main__":
    unittest.main()
