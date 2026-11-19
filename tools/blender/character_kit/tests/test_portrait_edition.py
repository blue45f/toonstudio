"""두 키트 판의 이력, 재생성, 표정·스킨 및 얼굴 그림자 좌표를 실 배포물로 대조한다."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from character_kit.build_portrait_edition import ROOT, build
from character_kit.gltf_read import accessor_array, read_glb


class PortraitEditionTest(unittest.TestCase):
    def test_regenerated_edition_matches_manifest_and_committed_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            rebuilt = Path(tmp)
            build(ROOT, rebuilt)
            for generated in rebuilt.rglob("*"):
                if generated.is_file():
                    self.assertEqual(generated.read_bytes(), (ROOT / generated.relative_to(rebuilt)).read_bytes())
        old = json.loads((ROOT / "kit.json").read_text())
        new = json.loads((ROOT / "kit-portrait.json").read_text())
        self.assertEqual((old["kitVersion"], new["kitVersion"]), (1, 2))
        self.assertEqual(old["bases"]["male"], new["bases"]["male"])
        self.assertEqual(old["provenance"], new["provenance"])
        for variant in [new["bases"]["female"], next(p["variants"]["female"] for p in new["parts"] if p["id"] == "irises/soft-gradient")]:
            content = (ROOT / variant["file"]["path"]).read_bytes()
            self.assertEqual(len(content), variant["file"]["bytes"])
            self.assertEqual(hashlib.sha256(content).hexdigest(), variant["file"]["sha256"])

    def test_winking_brow_follows_forehead_without_stretching_its_stroke(self):
        doc, binary = read_glb(ROOT / "bases/female-portrait.glb")
        for side in ("L", "R"):
            mesh = next(m for m in doc["meshes"] if m["name"] == "TS_Brow_" + side)
            prim = mesh["primitives"][0]
            uv = accessor_array(doc, binary, prim["attributes"]["TEXCOORD_0"])
            points = accessor_array(doc, binary, prim["attributes"]["POSITION"])
            blink = "facs:eyeBlink" + ("Left" if side == "L" else "Right")
            pos = prim["targets"][mesh["extras"]["targetNames"].index(blink)]["POSITION"]
            moved = points + accessor_array(doc, binary, pos)
            lower, upper = uv[:, 1] == 0, uv[:, 1] == 1
            np.testing.assert_allclose((moved[upper] - moved[lower])[:, :2],
                                       (points[upper] - points[lower])[:, :2], atol=1e-6)

    def test_actual_sculpt_keeps_uv0_skeleton_weights_targets_and_floor(self):
        old, original = read_glb(ROOT / "bases/female.glb")
        new, changed = read_glb(ROOT / "bases/female-portrait.glb")
        self.assertEqual(old["skins"], new["skins"])
        self.assertEqual(old["materials"], new["materials"])
        self.assertEqual(old["images"], new["images"])
        for old_mesh, new_mesh in zip(old["meshes"], new["meshes"]):
            self.assertEqual(old_mesh.get("extras"), new_mesh.get("extras"))
            for source, revised in zip(old_mesh["primitives"], new_mesh["primitives"]):
                if old_mesh["name"] in ("TS_Lashes", "TS_Brow_L", "TS_Brow_R"):
                    self.assertEqual(len(source["targets"]), len(revised["targets"]))
                    self.assertNotEqual(source["targets"], revised["targets"])
                else:
                    self.assertEqual(source.get("targets"), revised.get("targets"))
                for attr in ("TEXCOORD_0", "WEIGHTS_0", "JOINTS_0"):
                    np.testing.assert_array_equal(accessor_array(old, original, source["attributes"][attr]), accessor_array(new, changed, revised["attributes"][attr]))
                np.testing.assert_array_equal(accessor_array(old, original, source["indices"]), accessor_array(new, changed, revised["indices"]))
                for target in source.get("targets", []):
                    for index in target.values():
                        accessor = old["accessors"][index]
                        views = ([accessor["bufferView"]] if "bufferView" in accessor else [])
                        if "sparse" in accessor:
                            views += [accessor["sparse"][k]["bufferView"] for k in ("indices", "values")]
                        for vid in views:
                            view = old["bufferViews"][vid]
                            start = view.get("byteOffset", 0)
                            end = start + view["byteLength"]
                            self.assertEqual(original[start:end], changed[start:end])
        new_node = next(n for n in new["nodes"] if n["name"] == "TS_Head")
        self.assertEqual(new_node["extras"]["toonstudioFaceShadowUv"], 1)
        mesh = new["meshes"][new_node["mesh"]]["primitives"][0]
        attrs = mesh["attributes"]
        pos = accessor_array(new, changed, attrs["POSITION"])
        base = accessor_array(old, original, attrs["POSITION"])
        displacement_mm = np.linalg.norm(pos - base, axis=1) * 1000
        self.assertGreater(np.sum(displacement_mm > 2), 1000)
        self.assertLess(displacement_mm.max(), 12)
        shadow = accessor_array(new, changed, attrs["TEXCOORD_1"])
        np.testing.assert_allclose(shadow, (pos[:, :2] - pos[:, :2].min(0)) / np.ptp(pos[:, :2], axis=0), atol=1e-5)
        body = next(m for m in new["meshes"] if m["name"] == "TS_Body")["primitives"][0]
        body_pos = accessor_array(new, changed, body["attributes"]["POSITION"])
        self.assertAlmostEqual(body_pos[:, 1].min(), 0, places=5)


if __name__ == "__main__":
    unittest.main()
