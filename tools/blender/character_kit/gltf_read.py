"""최소 GLB 읽기 (numpy만, bpy 불필요).

Hyper3D(Rodin) 원본과 Blender가 내보낸 정리본처럼 **정적 단일 메시 GLB**에서 위치·법선·UV·인덱스와 임베드된 기본색
이미지를 꺼낸다. 좌표는 glTF 그대로(Y 위, +Z 앞)이고 UV도 glTF 규약(원점 좌상단)이다. 스킨·morph·sparse accessor는
읽지 않는다(키트 파츠를 만드는 쪽은 `glbwriter`가 쓴다).
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass

import numpy as np

_COMPONENT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


@dataclass
class StaticMesh:
    positions: np.ndarray  # (N,3) float64
    normals: np.ndarray | None  # (N,3) float64
    uvs: np.ndarray  # (N,2) float64, glTF 규약
    triangles: np.ndarray  # (M,3) int64
    image: bytes | None  # 기본색 텍스처 원본 바이트(PNG/JPEG)
    image_mime: str | None
    material_name: str | None


def read_glb(path: str) -> tuple[dict, bytes]:
    with open(path, "rb") as handle:
        data = handle.read()
    magic, version, _ = struct.unpack("<4sII", data[:12])
    if magic != b"glTF" or version != 2:
        raise ValueError(f"GLB 2.0이 아닙니다: {path}")
    offset = 12
    document: dict | None = None
    binary = b""
    while offset < len(data):
        size, kind = struct.unpack("<I4s", data[offset : offset + 8])
        chunk = data[offset + 8 : offset + 8 + size]
        if kind == b"JSON":
            document = json.loads(chunk)
        elif kind.startswith(b"BIN"):
            binary = chunk
        offset += 8 + size
    if document is None:
        raise ValueError(f"JSON 청크가 없습니다: {path}")
    return document, binary


def accessor_array(document: dict, binary: bytes, index: int) -> np.ndarray:
    accessor = document["accessors"][index]
    if "sparse" in accessor:
        raise NotImplementedError("sparse accessor는 읽지 않습니다")
    view = document["bufferViews"][accessor["bufferView"]]
    dtype = np.dtype(_COMPONENT[accessor["componentType"]])
    width = _WIDTH[accessor["type"]]
    count = accessor["count"]
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride") or dtype.itemsize * width
    rows = np.ndarray(shape=(count,), dtype=np.dtype([("v", dtype, (width,))]), buffer=binary, offset=start, strides=(stride,))["v"]
    return np.array(rows, dtype=dtype)


def image_bytes(document: dict, binary: bytes, texture_index: int) -> tuple[bytes, str]:
    texture = document["textures"][texture_index]
    image = document["images"][texture["source"]]
    view = document["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return binary[start : start + view["byteLength"]], image.get("mimeType", "image/png")


def read_static_mesh(path: str) -> StaticMesh:
    """첫 메시의 첫 프리미티브를 읽는다. 프리미티브가 여럿이면 오류(Rodin 원본은 1개)."""
    document, binary = read_glb(path)
    meshes = document["meshes"]
    if len(meshes) != 1 or len(meshes[0]["primitives"]) != 1:
        raise ValueError(f"메시 1개·프리미티브 1개 GLB만 읽습니다: {path}")
    primitive = meshes[0]["primitives"][0]
    attributes = primitive["attributes"]
    positions = accessor_array(document, binary, attributes["POSITION"]).astype(np.float64)
    normals = accessor_array(document, binary, attributes["NORMAL"]).astype(np.float64) if "NORMAL" in attributes else None
    uvs = accessor_array(document, binary, attributes["TEXCOORD_0"]).astype(np.float64)
    indices = accessor_array(document, binary, primitive["indices"]).reshape(-1).astype(np.int64)
    image = None
    mime = None
    material_name = None
    if "material" in primitive:
        material = document["materials"][primitive["material"]]
        material_name = material.get("name")
        texture = material.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if texture is not None:
            image, mime = image_bytes(document, binary, texture["index"])
    return StaticMesh(positions, normals, uvs, indices.reshape(-1, 3), image, mime, material_name)
