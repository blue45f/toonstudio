"""기본 키트의 얼굴 조형 2판. 원본 GLB, 기존 레시피, 파츠별 웨이트·UV0은 그대로 둔다.

저장소 루트에서 python3 -m tools.blender.character_kit.build_portrait_edition 실행.
눈의 실제 개구부와 눈썹 위치에 맞춰 선 메시를 다시 붙이고, 광대·코·턱의 측면 윤곽을 다듬는다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct

import numpy as np

from .gltf_read import accessor_array, read_glb
from .portrait_attachments import bind_line_targets, front_depth

ROOT = Path(__file__).resolve().parents[3] / "data/character-studio-assets/characters/toonstudio-kit-v1"


def smooth(a, b, values):
    t = np.clip((values - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(x, y, cx, cy, sx, sy):
    return np.exp(-((x - cx) / sx) ** 2 - ((y - cy) / sy) ** 2)


def face_shape(points):
    result = points.copy()
    x, y, z = points.T
    side = np.abs(x)
    front = smooth(.068, .111, z)
    chin = gauss(x, y, 0, 1.446, .034, .029) * front
    jaw = gauss(side, y, .034, 1.472, .026, .027) * smooth(.025, .092, z)
    cheek = gauss(side, y, .042, 1.501, .025, .022) * front
    bridge = gauss(x, y, 0, 1.525, .008, .017) * front
    tip = gauss(x, y, 0, 1.510, .011, .009) * front
    mouth = smooth(.111, .128, z) * gauss(x, y, 0, 1.483, .034, .010)
    corners = gauss(side, y, .024, 1.483, .012, .008) * front
    # 입술의 너비와 양 끝의 높이를 함께 조정해 정면에서 입매가 두 번 꺾여 보이지 않게 한다.
    result[:, 0] -= .19 * x * mouth
    result[:, 1] += .0024 * corners - .0021 * mouth
    # 턱끝의 아래·앞 돌출을 줄이고, 턱각에서 앞볼로 이어지는 측면에 살을 보탠다.
    result[:, 0] += np.sign(x) * (.0038 * jaw + .0012 * cheek) * smooth(0, .018, side)
    result[:, 1] += .0085 * chin - .0015 * jaw
    result[:, 2] += .0024 * cheek + .0022 * bridge - .0065 * tip - .0054 * chin
    return result


def line_shape(name, points, uv, head, triangles):
    result = points.copy()
    if name == "TS_Lashes":
        # 원래 4열짜리 리본의 끝은 안검에서 13~17 mm 떨어져 있다. 눈꼬리만 가늘게 연장한다.
        for side in (1, -1):
            mask = np.sign(points[:, 0]) == side
            u, row = uv[mask].T
            extent = (u - u.min()) / (u.max() - u.min())
            x = side * (.0138 + .0305 * extent)
            lid = 1.532 + .0105 * np.maximum(np.sin(np.pi * extent), 0) ** .82 + .0019 * extent
            wing = smooth(.74, 1, extent)
            result[mask, 0] = x + side * row * (.0003 + .0038 * wing)
            result[mask, 1] = lid + row * (.0012 + .0014 * np.sin(np.pi * extent) + .0027 * wing)
            depth = front_depth(head, triangles, result[mask, :2])
            # 안검 구멍으로 광선이 빠지는 부분은 원래 속눈썹 뿌리의 연속 깊이를 따른다.
            root = points[mask][row == row.min(), 2]
            root_u = u[row == row.min()]
            order = np.argsort(root_u)
            result[mask, 2] = np.maximum(depth, np.interp(u, root_u[order], root[order]) - .0006) + .00055 + .00035 * row
    else:
        side = np.sign(points[:, 0].mean())
        # 눈썹 앞머리·산·꼬리. 피부의 깊이를 다시 구해 머리 회전 때도 종잇장처럼 뜨지 않게 한다.
        u = (np.abs(points[:, 0]) - np.abs(points[:, 0]).min()) / np.ptp(np.abs(points[:, 0]))
        row = uv[:, 1] - .5
        result[:, 0] = side * (.012 + .037 * u)
        result[:, 1] = 1.552 + .0065 * np.sin(np.pi * u) + .0012 * u + row * (.0038 - .0022 * u)
        result[:, 2] = front_depth(head, triangles, result[:, :2]) + .00065
    return result


def normals(points, triangles):
    _, weld = np.unique(np.round(points, 7), axis=0, return_inverse=True)
    weld = weld.reshape(-1)
    a, b, c = points[triangles].transpose(1, 0, 2)
    face = np.cross(b - a, c - a)
    sums = np.zeros((int(weld.max()) + 1, 3))
    for corner in triangles.T:
        np.add.at(sums, weld[corner], face)
    return normalize(sums[weld])


def normalize(a):
    return a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-12)


def store_attribute(doc, blob, index, values):
    attr = doc["accessors"][index]
    view = doc["bufferViews"][attr["bufferView"]]
    assert attr["componentType"] == 5126 and "byteStride" not in view
    start = view.get("byteOffset", 0) + attr.get("byteOffset", 0)
    data = values.astype("<f4").tobytes()
    assert len(data) == view["byteLength"]
    blob[start:start + len(data)] = data
    if "min" in attr:
        attr.update(min=values.astype("<f4").min(0).tolist(), max=values.astype("<f4").max(0).tolist())


def encode_glb(doc, blob):
    doc["buffers"][0]["byteLength"] = len(blob)
    encoded = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    total = 28 + len(encoded) + len(blob)
    glb = struct.pack("<4sIII4s", b"glTF", 2, total, len(encoded), b"JSON")
    return glb + encoded + struct.pack("<I4s", len(blob), b"BIN\0") + blob


def portrait_iris(root, output, variant, eyes):
    """눈꺼풀의 가로 개구보다 작은 홍채를 만들고, 눈알 표면에 다시 투영해 흰자와 반사광을 보존한다."""
    source = root / variant["file"]["path"]
    if hashlib.sha256(source.read_bytes()).hexdigest() != variant["file"]["sha256"]:
        raise ValueError("1판 홍채 해시가 원장과 일치하지 않습니다")
    doc, original = read_glb(source)
    blob = bytearray(original)
    for mesh in doc["meshes"]:
        name = mesh["name"]
        prim = mesh["primitives"][0]
        attr = prim["attributes"]
        side = name[-1]
        globe, tri = eyes[side]
        center = .5 * (globe.min(0) + globe.max(0))
        points = accessor_array(doc, original, attr["POSITION"]).astype(float)
        revised = points.copy()
        revised[:, :2] = center[:2] + (points[:, :2] - center[:2]) * np.array([.60, .56])
        highlight = name.startswith("TS_Highlight_")
        revised[:, 2] = front_depth(globe, tri, revised[:, :2]) + (.00084 if highlight else .00040)
        shape = accessor_array(doc, original, prim["indices"]).reshape(-1, 3)
        new_n = normals(revised, shape)
        old = accessor_array(doc, original, attr["NORMAL"])
        store_attribute(doc, blob, attr["POSITION"], revised)
        store_attribute(doc, blob, attr["NORMAL"], new_n * np.where((old * new_n).sum(1)[:, None] < 0, -1, 1))
    glb = encode_glb(doc, blob)
    path = "parts/female/irises/portrait-gradient.glb"
    (output / path).parent.mkdir(parents=True, exist_ok=True)
    (output / path).write_bytes(glb)
    variant["file"] = {"path": path, "bytes": len(glb), "sha256": hashlib.sha256(glb).hexdigest()}


def build(root, output):
    source = root / "bases/female.glb"
    manifest = json.loads((root / "kit.json").read_text())
    if hashlib.sha256(source.read_bytes()).hexdigest() != manifest["bases"]["female"]["file"]["sha256"]:
        raise ValueError("1판 원장과 베이스 해시가 일치하지 않습니다")
    doc, original = read_glb(source)
    blob = bytearray(original)
    meshes = {m["name"]: m["primitives"][0] for m in doc["meshes"]}
    head_mesh = next(m for m in doc["meshes"] if m["name"] == "TS_Head")
    head = meshes["TS_Head"]
    head_targets = dict(zip(head_mesh["extras"]["targetNames"], head["targets"]))
    head_tri = accessor_array(doc, original, head["indices"]).reshape(-1, 3)
    new_head = face_shape(accessor_array(doc, original, head["attributes"]["POSITION"]).astype(float))
    for name in ("TS_Head", "TS_Mouth", "TS_Lashes", "TS_Brow_L", "TS_Brow_R"):
        prim = meshes[name]
        attrs = prim["attributes"]
        points = accessor_array(doc, original, attrs["POSITION"]).astype(float)
        tri = accessor_array(doc, original, prim["indices"]).reshape(-1, 3)
        old_normals = accessor_array(doc, original, attrs["NORMAL"]).astype(float)
        if name in {"TS_Head", "TS_Mouth"}:
            updated = face_shape(points)
            # 원래 매끈하게 다듬은 코·눈꺼풀 법선과 이음매는 보존하고 조형으로 변한 기울기만 더한다.
            new_normals = normalize(old_normals + normals(updated, tri) - normals(points, tri))
        else:
            uv = accessor_array(doc, original, attrs["TEXCOORD_0"])
            updated = line_shape(name, points, uv, new_head, head_tri)
            mesh = next(m for m in doc["meshes"] if m["name"] == name)
            bind_line_targets(doc, blob, original, new_head, head_tri, head_targets, mesh, updated)
            new_normals = normals(updated, tri)
            new_normals *= np.where((old_normals * new_normals).sum(1)[:, None] < 0, -1, 1)
        store_attribute(doc, blob, attrs["POSITION"], updated)
        store_attribute(doc, blob, attrs["NORMAL"], new_normals)
    coords = new_head[:, :2]
    face_uv = ((coords - coords.min(0)) / np.ptp(coords, axis=0)).astype("<f4")
    doc["bufferViews"].append({"buffer": 0, "byteOffset": len(blob), "byteLength": face_uv.nbytes, "target": 34962})
    blob.extend(face_uv.tobytes())
    doc["accessors"].append({"bufferView": len(doc["bufferViews"])-1, "componentType": 5126, "count": len(face_uv), "type": "VEC2", "min": [0, 0], "max": [1, 1]})
    head["attributes"]["TEXCOORD_1"] = len(doc["accessors"])-1
    next(n for n in doc["nodes"] if n["name"] == "TS_Head").setdefault("extras", {})["toonstudioFaceShadowUv"] = 1
    glb = encode_glb(doc, blob)
    (output / "bases").mkdir(parents=True, exist_ok=True)
    (output / "bases/female-portrait.glb").write_bytes(glb)
    manifest.update(kitVersion=2, displayName="ToonStudio 인물 키트", generatedAt="2026-11-19")
    manifest["generator"]["command"].append("build_portrait_edition.py")
    manifest["bases"]["female"]["file"] = {"path": "bases/female-portrait.glb", "bytes": len(glb), "sha256": hashlib.sha256(glb).hexdigest()}
    eyes = {}
    for side in ("L", "R"):
        eye = meshes["TS_Eye_" + side]
        eyes[side] = (accessor_array(doc, original, eye["attributes"]["POSITION"]), accessor_array(doc, original, eye["indices"]).reshape(-1, 3))
    iris = next(part for part in manifest["parts"] if part["id"] == "irises/soft-gradient")
    portrait_iris(root, output, iris["variants"]["female"], eyes)
    (output / "kit-portrait.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT)
    build(ROOT, parser.parse_args().output)
