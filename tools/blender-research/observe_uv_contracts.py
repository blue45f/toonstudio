"""새 factory-startup background 프로세스 전용 UV 관측.

Blender 프로세스나 기존 .blend에 연결하지 않는다. 출력의 expectedFromSource는 정적
원문 해석이고 native 관측과 구분한다. 실행은 공유 자원 사용이 가능한 때에만 한다.
"""

import json
import argparse
import math
from pathlib import Path
import struct
import tempfile
import sys

import bmesh
import bpy


UVS = [(0, 0), (4, 0), (1, 1), (0, 0), (1, 1), (0, 2)]


def rounded(values):
    return [[round(float(value), 7) for value in item] for item in values]


def create_mesh(uvs):
    mesh = bpy.data.meshes.new("UVContractProbe")
    mesh.from_pydata([(0, 0, 0), (2, 0, 0), (2, 1, 0), (0, 1, 0)], [],
                     [(0, 1, 2), (0, 2, 3)])
    layer = mesh.uv_layers.new(name="UVMap")
    for corner, uv in zip(layer.uv, uvs, strict=True):
        corner.vector = uv
    obj = bpy.data.objects.new("UVContractProbe", mesh)
    bpy.context.collection.objects.link(obj)
    for selected in bpy.context.selected_objects:
        selected.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj


def native_uv_transform(kind):
    obj = create_mesh(UVS)
    window = bpy.context.window
    if window is None:
        raise RuntimeError("새 background 프로세스에 UV operator context가 없습니다.")
    area = window.screen.areas[0]
    area.type = "IMAGE_EDITOR"
    area.ui_type = "UV"
    space = area.spaces.active
    space.pivot_point = "MEDIAN_POINT"
    space.uv_editor.lock_bounds = False
    space.uv_editor.use_live_unwrap = False
    space.uv_editor.pixel_round_mode = "DISABLED"
    region = next(region for region in area.regions if region.type == "WINDOW")
    settings = bpy.context.scene.tool_settings
    settings.use_uv_select_sync = False
    settings.uv_select_mode = "VERTEX"
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(obj.data)
    for face in bm.faces:
        face.select = True
        face.uv_select = True
        for loop in face.loops:
            loop.uv_select_vert = True
            loop.uv_select_edge = True
    bmesh.update_edit_mesh(obj.data)
    with bpy.context.temp_override(window=window, area=area, region=region):
        if kind == "rotate_pi":
            status = bpy.ops.transform.rotate(value=math.pi, orient_axis="Z",
                                              use_proportional_edit=False)
        else:
            status = bpy.ops.transform.resize(value=(0, 0, 1),
                                              use_proportional_edit=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    result = {"operatorStatus": sorted(status),
              "uvs": rounded(corner.vector for corner in obj.data.uv_layers.active.uv)}
    bpy.data.objects.remove(obj, do_unlink=True)
    return result


def native_gltf_uvs():
    source = [(0.1, 0.2), (0.9, 0.2), (-0.25, 1.5)] * 2
    obj = create_mesh(source)
    with tempfile.TemporaryDirectory(prefix="toonstudio-uv-probe-") as directory:
        path = Path(directory) / "asymmetric.glb"
        status = bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB",
                                           use_selection=True, export_texcoords=True,
                                           export_normals=False, export_materials="NONE")
        raw = path.read_bytes()
    _, version, length = struct.unpack_from("<4sII", raw)
    if version != 2 or length != len(raw):
        raise RuntimeError("GLB 헤더가 예상 형식과 다릅니다.")
    json_length, _ = struct.unpack_from("<II", raw, 12)
    document = json.loads(raw[20:20 + json_length])
    binary_offset = 20 + json_length + 8
    samples = []
    for mesh in document["meshes"]:
        for primitive in mesh["primitives"]:
            accessor = document["accessors"][primitive["attributes"]["TEXCOORD_0"]]
            if accessor["componentType"] != 5126 or accessor["type"] != "VEC2":
                raise RuntimeError("관측 초안은 float32 VEC2 UV만 해석합니다.")
            view = document["bufferViews"][accessor["bufferView"]]
            offset = binary_offset + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
            stride = view.get("byteStride", 8)
            samples.extend(struct.unpack_from("<ff", raw, offset + index * stride)
                           for index in range(accessor["count"]))
    bpy.data.objects.remove(obj, do_unlink=True)
    return {"operatorStatus": sorted(status), "texcoord0": rounded(samples)}


def main():
    if not bpy.app.background or bpy.data.filepath:
        raise RuntimeError("새 --background --factory-startup 프로세스에서만 실행하세요.")
    result = {
        "probeRevision": 1,
        "version": bpy.app.version_string,
        "buildHash": bpy.app.build_hash.decode("ascii"),
        "inputUVs": UVS,
        "expectedFromSource": {"median": [1, 2 / 3],
                               "rotatePiFirstUV": [2, 4 / 3],
                               "scaleZeroEveryUV": [1, 2 / 3],
                               "gltfAsymmetricSamples": [[0.1, 0.8], [-0.25, -0.5]]},
        "observed": {},
    }
    result["observed"]["rotatePi"] = native_uv_transform("rotate_pi")
    result["observed"]["scaleZero"] = native_uv_transform("scale_zero")
    result["observed"]["gltf"] = native_gltf_uvs()
    for observed in result["observed"].values():
        if observed["operatorStatus"] != ["FINISHED"]:
            raise RuntimeError("UV 관측 연산이 완료되지 않았습니다.")
    center = result["expectedFromSource"]["median"]
    expected_rotation = [(2 * center[0] - u, 2 * center[1] - v) for u, v in UVS]
    for actual, expected in zip(result["observed"]["rotatePi"]["uvs"], expected_rotation, strict=True):
        if any(abs(a - b) > 1e-6 for a, b in zip(actual, expected, strict=True)):
            raise RuntimeError("UV 회전이 선택 코너 평균 pivot 계약과 다릅니다.")
    if any(any(abs(a - b) > 1e-6 for a, b in zip(uv, center, strict=True))
           for uv in result["observed"]["scaleZero"]["uvs"]):
        raise RuntimeError("UV 0배율이 선택 코너 평균으로 모이지 않았습니다.")
    if not all(sample in result["observed"]["gltf"]["texcoord0"]
               for sample in result["expectedFromSource"]["gltfAsymmetricSamples"]):
        raise RuntimeError("GLB의 비대칭 UV 또는 V 방향 계약을 확인하지 못했습니다.")
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if args.output:
        args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print("TOONSTUDIO_UV_CONTRACT=" + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
