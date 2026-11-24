"""현재·구판 헤어 파일, 파츠 편집 데이터와 세 LOD의 닫힌 표면을 대조한다."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from tools.blender.character_kit.build_swept_hair_edition import ROOT, build
from tools.blender.character_kit.gltf_read import accessor_array, read_glb


def morph_buffers(doc, binary, index):
    accessor = doc["accessors"][index]
    chunks = []
    for source in (accessor, *accessor.get("sparse", {}).values()):
        if isinstance(source, dict) and "bufferView" in source:
            view = doc["bufferViews"][source["bufferView"]]
            start = view.get("byteOffset", 0)
            chunks.append(binary[start:start + view["byteLength"]])
    return accessor, chunks


class SweptHairTest(unittest.TestCase):
    def test_published_hair_preserves_editable_attributes_and_closes_the_cap(self):
        old = json.loads((ROOT / "kit-portrait.json").read_text())
        latest = json.loads((ROOT / "kit-swept.json").read_text())
        self.assertEqual((2, 3), (old["kitVersion"], latest["kitVersion"]))
        self.assertEqual(old["bases"], latest["bases"])
        self.assertEqual(old["provenance"], latest["provenance"])
        self.assertEqual(len(old["parts"]), len(latest["parts"]))
        for source, revised in zip(old["parts"], latest["parts"]):
            if source["id"] != "hair/romance-long":
                self.assertEqual(source, revised)
                continue
            file = revised["variants"]["female"]["file"]
            new_path = ROOT / file["path"]
            self.assertEqual(file["sha256"], hashlib.sha256(new_path.read_bytes()).hexdigest())
            self.assertEqual(file["bytes"], new_path.stat().st_size)
            old_doc, old_bin = read_glb(ROOT / source["variants"]["female"]["file"]["path"])
            new_doc, new_bin = read_glb(new_path)
            self.assertEqual(old_doc["skins"], new_doc["skins"])
            self.assertEqual(old_doc["nodes"], new_doc["nodes"])
            for mesh, updated in zip(old_doc["meshes"], new_doc["meshes"]):
                prim, updated_prim = mesh["primitives"][0], updated["primitives"][0]
                self.assertEqual(mesh["extras"], updated["extras"])
                self.assertEqual(prim["targets"], updated_prim["targets"])
                for target in prim["targets"]:
                    for index in target.values():
                        self.assertEqual(morph_buffers(old_doc, old_bin, index),
                                         morph_buffers(new_doc, new_bin, index))
                for attr, index in prim["attributes"].items():
                    if attr not in ("POSITION", "NORMAL"):
                        np.testing.assert_array_equal(accessor_array(old_doc, old_bin, index),
                                                      accessor_array(new_doc, new_bin, index))
                pos = prim["attributes"]["POSITION"]
                before = accessor_array(old_doc, old_bin, pos)
                after = accessor_array(new_doc, new_bin, pos)
                self.assertGreater(np.max(before[:, 2] - after[:, 2]), .04)
                np.testing.assert_array_equal(before[before[:, 1] > 1.615], after[before[:, 1] > 1.615])
                tri = accessor_array(new_doc, new_bin, updated_prim["indices"]).reshape(-1, 3)
                pairs = np.vstack([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
                _, counts = np.unique(np.sort(pairs, axis=1), axis=0, return_counts=True)
                self.assertTrue(np.all(counts == 2))
                self.assertEqual(len(np.unique(pairs, axis=0)), len(pairs))
                self.assertEqual(len(np.unique(tri)), len(after))

    def test_regenerates_the_distributed_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            build(ROOT, out)
            for target in out.rglob("*"):
                if target.is_file():
                    self.assertEqual(target.read_bytes(), (ROOT / target.relative_to(out)).read_bytes())
