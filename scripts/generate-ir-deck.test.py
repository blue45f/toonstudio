"""정적 IR에서 정본 문안·순서·링크·최신성 검사가 유지되는지 확인한다."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("ir_deck", Path(__file__).with_name("generate-ir-deck.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class IrDeckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as directory:
            cls.data = MODULE.source_data(Path(directory))
        cls.deck = MODULE.Deck(cls.data).build()

    def test_same_scene_order_and_latest_speaker_notes(self):
        self.assertEqual(len(self.deck.slides), len(self.data["scenes"]))
        self.assertEqual(len(self.deck.slides), 24)
        for i, slide in enumerate(self.deck.slides):
            self.assertIn(self.data["scenes"][i]["title"], slide.notes_slide.notes_text_frame.text)
            self.assertIn(self.data["narration"][i]["text"], slide.notes_slide.notes_text_frame.text)
        MODULE.verify_layout(self.deck)

    def test_tour_links_use_actual_chapter_offsets(self):
        links = {
            shape.click_action.hyperlink.address
            for shape in self.deck.slides[17].shapes if shape.has_text_frame
            if shape.click_action.hyperlink.address
        }
        self.assertEqual(links, {MODULE.ORIGIN + c["href"] for c in self.data["tour"]["chapters"]})
        self.assertEqual(len(links), 10)

    def test_pricing_and_gtm_changes_reach_the_export(self):
        updated = copy.deepcopy(self.data)
        updated["businessModel"][1]["body"] = "검증용 가격 정책 변경"
        updated["gtm"][0]["body"] = "검증용 고객 계획 변경"
        deck = MODULE.Deck(updated).build()
        price = "\n".join(s.text for s in deck.slides[20].shapes if s.has_text_frame)
        gtm = "\n".join(s.text for s in deck.slides[21].shapes if s.has_text_frame)
        self.assertIn("검증용 가격 정책 변경", price)
        self.assertIn("검증용 고객 계획 변경", gtm)

    def test_stale_source_is_rejected_before_deliverable_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output / MODULE.MANIFEST_NAME).write_text(json.dumps({
                "sources": [{"path": "scripts/generate-ir-deck.py", "sha256": "outdated"}],
            }))
            with self.assertRaisesRegex(ValueError, "재생성"):
                MODULE.check_output(output, self.data)

    def test_output_is_editable_and_unsupported_counts_are_absent(self):
        frames = [s for slide in self.deck.slides for s in slide.shapes if s.has_text_frame and s.text]
        self.assertGreater(len(frames), 250)
        text = "\n".join(s.text for s in frames)
        for stale in ["226종", "14,665", "14,928", "42개", "10월 22일 대면"]:
            self.assertNotIn(stale, text)
        self.assertIn("미확정", text)
        self.assertIn("개념", text)


if __name__ == "__main__":
    unittest.main()
