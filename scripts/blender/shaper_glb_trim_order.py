"""Blender가 순서 없이 반환하는 불투명 금속 장식의 삼각형 순서를 고정한다."""

import json
import struct


def stabilize_opaque_trim_indices(path):
    data = bytearray(path.read_bytes())
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    binary = 28 + json_length
    for mesh in document["meshes"]:
        for primitive in mesh["primitives"]:
            material = document["materials"][primitive["material"]]
            if not material["name"].startswith("mat_gold_") or material.get("alphaMode", "OPAQUE") != "OPAQUE":
                continue
            accessor = document["accessors"][primitive["indices"]]
            view = document["bufferViews"][accessor["bufferView"]]
            if primitive.get("mode", 4) != 4 or accessor["type"] != "SCALAR" or "byteStride" in view:
                raise ValueError("금속 장식의 삼각형 인덱스 형식을 확인하세요.")
            item = {5121: "B", 5123: "H", 5125: "I"}[accessor["componentType"]]
            triangle = struct.Struct("<3" + item)
            offset = binary + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
            end = offset + accessor["count"] // 3 * triangle.size
            # 첫 정점을 정규화하되 앞면 방향과 각 원래 정점 번호를 보존한다.
            faces = sorted(min((a, b, c), (b, c, a), (c, a, b))
                           for a, b, c in triangle.iter_unpack(data[offset:end]))
            for i, face in enumerate(faces):
                triangle.pack_into(data, offset + i * triangle.size, *face)
    path.write_bytes(data)
