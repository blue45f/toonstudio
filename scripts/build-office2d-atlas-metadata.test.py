"""실행: python3 scripts/build-office2d-atlas-metadata.test.py (Pillow 필요)."""
import importlib.util
from pathlib import Path
import unittest

from PIL import Image

SPEC = importlib.util.spec_from_file_location("office_atlas_metadata", Path(__file__).with_name("build-office2d-atlas-metadata.py"))
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("메타데이터 생성기 모듈을 찾을 수 없습니다.")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class AtlasComponentsTest(unittest.TestCase):
    def test_row_boundary_does_not_split_the_foot(self):
        alpha = Image.new("L", (12, 12))
        for y in range(2, 8):
            for x in range(2, 5):
                alpha.putpixel((x, y), 253)
        alpha.putpixel((10, 10), 253)
        result = sorted(MODULE.components(alpha), key=lambda item: -item[1])
        self.assertEqual(result[0], ([2, 2, 5, 8], 18))
        self.assertEqual(result[1], ([10, 10, 11, 11], 1))

    def test_diagonal_outline_is_connected_and_low_alpha_noise_is_ignored(self):
        alpha = Image.new("L", (6, 6))
        for point in [(1, 1), (2, 2), (3, 3)]:
            alpha.putpixel(point, 253)
        alpha.putpixel((5, 0), 1)
        self.assertEqual(MODULE.components(alpha), [([1, 1, 4, 4], 3)])

    def test_translucent_bridge_does_not_merge_adjacent_actors(self):
        alpha = Image.new("L", (8, 12))
        for y in [1, 2, 3, 8, 9, 10]:
            for x in range(2, 5):
                alpha.putpixel((x, y), 253)
        for y in range(4, 8):
            alpha.putpixel((3, y), 32)
        result = sorted(MODULE.components(alpha), key=lambda item: item[0][1])
        self.assertEqual(result, [([2, 1, 5, 4], 9), ([2, 8, 5, 11], 9)])


if __name__ == "__main__":
    unittest.main()
