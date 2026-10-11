"""의상·헤어·소품 프리셋 표(`garment_presets`)의 구조 시험 — 외부 에셋·bpy 없음.

실행: <venv>/bin/python -I tools/blender/character_kit/tests/test_garment_presets.py   (저장소 루트에서)
"""

import copy
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from character_kit.garment_presets import HELD_PRESETS_KO, PRESETS, effective_spec  # noqa: E402

HOOD_KEYS = {"ring": {"major", "minor", "center_z", "scan_top", "scan_floor", "fallback_y", "max_center_y"}, "back": {"top_y", "bottom_y", "widths", "height"}}


class PresetTableTest(unittest.TestCase):
    def test_every_preset_declares_one_node_per_lod(self) -> None:
        for preset_id, spec in PRESETS.items():
            self.assertEqual(len(spec["nodes"]), len(spec["decimate"]), preset_id)
            self.assertEqual(spec["decimate"], sorted(spec["decimate"], reverse=True), f"{preset_id}: LOD는 삼각형이 줄어드는 순서")
            self.assertEqual(preset_id, f"{spec['slot']}/{spec['name']}")

    def test_nothing_is_held_back_any_more(self) -> None:
        self.assertEqual(HELD_PRESETS_KO, {})  # 후디·초커까지 모두 제공한다
        for preset_id in ("top/hoodie", "accessory/choker"):
            self.assertIn(preset_id, PRESETS)

    def test_effective_spec_applies_male_overrides_without_mutating_the_table(self) -> None:
        before = copy.deepcopy(PRESETS)
        male = effective_spec("top/hoodie", "male")
        female = effective_spec("top/hoodie", "female")
        self.assertEqual(male["source"]["raw"], "hoodie-m-v3-bang")
        self.assertEqual(female["source"]["raw"], "hoodie-f-v3-bang")
        self.assertEqual(PRESETS, before)
        wolf = effective_spec("hair/wolf-layered", "male")
        self.assertEqual((wolf["align"], wolf["source"]["clean"]), ("hair", "hair-dark"))  # 남성 울프는 BANG 없이 색으로 분리한 헤어
        self.assertEqual(effective_spec("hair/wolf-layered", "female")["align"], "head_ref")

    def test_base_overrides_only_touch_known_fields_and_the_male_base(self) -> None:
        for preset_id, spec in PRESETS.items():
            for base, override in spec.get("base_overrides", {}).items():
                self.assertEqual(base, "male", preset_id)
                self.assertTrue(set(override) <= {"source", "align", "sleeve_cut", "lods", "fit_region", "anchor", "bang_target_y"}, f"{preset_id}: {set(override)}")

    def test_shape_fixes_are_declared_where_the_generations_need_them(self) -> None:
        for preset_id in ("top/hoodie", "top/shirt", "top/blazer"):
            self.assertEqual(PRESETS[preset_id]["hem_cut"], {"percentile": 55}, preset_id)  # 앞·뒤 중앙이 V자로 처진 밑단
        for preset_id in ("bottom/jeans", "bottom/slacks", "bottom/shorts"):
            self.assertIn("waist_rim", PRESETS[preset_id], preset_id)  # 허리띠 윗선이 상의를 뚫는 띠를 막는다
        for preset_id in ("bottom/pleated-skirt", "bottom/long-skirt"):
            self.assertNotIn("waist_rim", PRESETS[preset_id], preset_id)  # 치마의 허리선은 몸에 붙이지 않는다
        self.assertEqual(effective_spec("top/sailor", "male")["sleeve_cut"], {"margin": 0.0})
        self.assertNotIn("sleeve_cut", effective_spec("top/sailor", "female"))
        self.assertGreater(PRESETS["hair/twin-tail"]["tails"]["stretch"], 1.0)

    def test_tops_stand_off_enough_to_clear_the_waistband_of_pants(self) -> None:
        for preset_id, spec in PRESETS.items():
            if spec["role"] == "top":
                standoff = spec["hem_standoff"]
                self.assertGreaterEqual(standoff["d_min"], 0.040, preset_id)  # 바지 허리띠 윗선(몸에서 ≤ 30 mm) 바깥
                self.assertGreaterEqual(standoff["above"], 0.10, preset_id)  # 허리띠 윗선(허리 + 5.6 cm)보다 위에서 이미 떠 있어야 한다

    def test_hood_spec_has_what_hood_down_reads(self) -> None:
        hood = PRESETS["top/hoodie"]["extras"]["hood"]
        for part, keys in HOOD_KEYS.items():
            self.assertTrue(keys <= set(hood[part]), (part, keys - set(hood[part])))
        self.assertLessEqual(hood["ring"]["max_center_y"] + hood["ring"]["minor"] * hood["ring"]["squash"], 1.43)  # 접힘 윗면이 턱 아래(≈ 1.445 m)에 머문다
        levels = [level for level, _ in hood["back"]["widths"]]
        self.assertEqual(levels, sorted(levels, reverse=True))  # 위 → 아래
        self.assertEqual(hood["back"]["top_y"], levels[0])
        self.assertEqual(hood["back"]["bottom_y"], levels[-1])
        triangles = PRESETS["top/hoodie"]["decimate"][0] + 44 * 12 * 2 + 23 * 17 * 2
        self.assertLessEqual(triangles, 10_000)  # 후드를 얹은 총 삼각형이 파츠 용량(1.5 MiB) 안


if __name__ == "__main__":
    unittest.main()
