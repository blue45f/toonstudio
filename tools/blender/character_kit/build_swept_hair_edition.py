"""3판 인물 키트. 기존 롱 헤어의 옆 가닥을 귀 쪽으로 넘겨 옆얼굴을 드러낸다."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from .build_portrait_edition import ROOT, encode_glb, normalize, smooth, store_attribute
from .gltf_read import accessor_array, read_glb
from .hair_cap import closed_scalp_indices, orient_faces, replace_views


def sweep_temple(points):
    """미터 단위 레스트 공간에서 정수리·뒤통수·어깨 쪽 끝은 고정한다."""
    x, y, z = points.T
    temple = smooth(.018, .052, np.abs(x)) * smooth(-.025, .105, z)
    temple *= smooth(1.32, 1.465, y) * (1 - smooth(1.55, 1.615, y))
    result = points.copy()
    result[:, 0] += .016 * np.sign(x) * temple
    result[:, 2] -= .058 * temple
    return result


def build(root, output):
    manifest = json.loads((root / "kit-portrait.json").read_text())
    variant = next(p for p in manifest["parts"] if p["id"] == "hair/romance-long")["variants"]["female"]
    original_path = root / variant["file"]["path"]
    if hashlib.sha256(original_path.read_bytes()).hexdigest() != variant["file"]["sha256"]:
        raise ValueError("헤어 원본이 2판 원장에 등록된 파일과 다릅니다.")
    doc, original = read_glb(original_path)
    blob = bytearray(original)
    replacements = {}
    for mesh in doc["meshes"]:
        prim = mesh["primitives"][0]
        attrs = prim["attributes"]
        points = accessor_array(doc, original, attrs["POSITION"]).astype(float)
        normals = accessor_array(doc, original, attrs["NORMAL"]).astype(float)
        # 같은 변형의 역전치로 기존 분할 법선을 옮겨 가닥 이음새와 반사선을 유지한다.
        step = 1e-5
        jacobian = np.stack([(sweep_temple(points + axis) - sweep_temple(points - axis)) / (2 * step)
                             for axis in np.eye(3) * step], axis=2)
        moved_normals = normalize(np.linalg.solve(jacobian.transpose(0, 2, 1), normals[..., None])[..., 0])
        moved = sweep_temple(points)
        store_attribute(doc, blob, attrs["POSITION"], moved)
        index = doc["accessors"][prim["indices"]]
        triangles = accessor_array(doc, original, prim["indices"]).reshape(-1, 3)
        closed = closed_scalp_indices(orient_faces(triangles, moved, moved_normals), moved)
        replacements[index["bufferView"]] = closed.tobytes()
        index["count"] = closed.size
        normal_attr = doc["accessors"][attrs["NORMAL"]]
        view = doc["bufferViews"][normal_attr["bufferView"]]
        if normal_attr["componentType"] != 5120 or not normal_attr.get("normalized") or view["byteStride"] != 4:
            raise ValueError("원본 헤어의 4바이트 정렬 법선 형식이 바뀌었습니다.")
        packed = np.ndarray((len(normals), 3), dtype=np.int8, buffer=blob,
                            offset=view["byteOffset"] + normal_attr.get("byteOffset", 0), strides=(4, 1))
        packed[:] = np.rint(moved_normals * 127)
    glb = encode_glb(doc, replace_views(doc, blob, replacements))
    new_path = original_path.relative_to(root).with_name("romance-long-swept.glb")
    (output / new_path).parent.mkdir(parents=True, exist_ok=True)
    (output / new_path).write_bytes(glb)
    variant["file"] = {"path": new_path.as_posix(), "bytes": len(glb), "sha256": hashlib.sha256(glb).hexdigest()}
    manifest.update(kitVersion=3, generatedAt="2026-11-23")
    manifest["generator"]["command"].append("build_swept_hair_edition.py")
    (output / "kit-swept.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT)
    build(ROOT, parser.parse_args().output)
