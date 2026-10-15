"""Studio 환경 배포 스크립트(refine_studio_environments_v6.py)의 순수 Python 계약.

Blender 없이 실행한다. Blender 5.0 에서 제거된 컴포지터 API 가 다시 들어오지 않는지
소스를 점검한다. 실제 Blender 5.2 렌더는 Studio environment pack validation 워크플로가 검증한다.
"""

from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "blender" / "refine_studio_environments_v6.py"


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
