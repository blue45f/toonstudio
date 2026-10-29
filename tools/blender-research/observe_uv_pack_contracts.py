"""새 factory-startup background 프로세스에서 AABB UV pack의 공통 불변식을 관측한다.

원본의 배치 순서·밀도와 웹 휴리스틱의 일치를 주장하지 않는다. 입력 margin과 실제
island 간 간격은 별도 수치로 기록하며 Blender의 다른 margin 방식으로 일반화하지 않는다.
"""

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
import sys

import bmesh
import bpy


RECTANGLES = [(-4.0, 2.0, 2.0, 1.0), (0.0, 0.0, 0.5, 2.0),
              (4.0, -3.0, 1.0, 1.0), (1.0, 4.0, 2.0, 0.25)]
REQUIRED_ENUMS = {"rotate_method": "CARDINAL", "shape_method": "AABB",
                  "margin_method": "FRACTION", "udim_source": "ACTIVE_UDIM"}


def create_input():
    positions = []
    faces = []
    uvs = []
    for index, (u, v, width, height) in enumerate(RECTANGLES):
        start = len(positions)
        x = index * 2.0
        positions.extend([(x, 0, 0), (x + 1, 0, 0), (x + 1, 1, 0), (x, 1, 0)])
        faces.append(tuple(range(start, start + 4)))
        uvs.extend([(u, v), (u + width, v), (u + width, v + height), (u, v + height)])
    mesh = bpy.data.meshes.new("UVPackContractProbe")
    mesh.from_pydata(positions, [], faces)
    layer = mesh.uv_layers.new(name="UVMap")
    for corner, uv in zip(layer.uv, uvs, strict=True):
        corner.vector = uv
    obj = bpy.data.objects.new("UVPackContractProbe", mesh)
    bpy.context.collection.objects.link(obj)
    for selected in bpy.context.selected_objects:
        selected.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj, uvs


def uv_context(obj):
    window = bpy.context.window
    if window is None:
        raise RuntimeError("새 background 프로세스의 UV operator context가 없습니다.")
    area = window.screen.areas[0]
    area.type = "IMAGE_EDITOR"
    area.ui_type = "UV"
    area.spaces.active.cursor_location = (0.5, 0.5)
    area.spaces.active.uv_editor.tile_grid_shape = (1, 1)
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
    return {"window": window, "area": area, "region": region}


def bounds(corners):
    return {"minU": min(uv[0] for uv in corners), "maxU": max(uv[0] for uv in corners),
            "minV": min(uv[1] for uv in corners), "maxV": max(uv[1] for uv in corners)}


def inspect_output(uvs, rotate):
    islands = []
    for index, rectangle in enumerate(RECTANGLES):
        corners = uvs[index * 4:index * 4 + 4]
        box = bounds(corners)
        dx = corners[1][0] - corners[0][0]
        dy = corners[1][1] - corners[0][1]
        scale = math.hypot(dx, dy) / rectangle[2]
        angle = math.atan2(dy, dx)
        expected_angle = round(angle / (math.pi / 2)) * (math.pi / 2) if rotate else 0
        if not scale > 0 or abs(angle - expected_angle) > 1e-5:
            raise RuntimeError("출력의 양수 배율·회전 제약을 확인하지 못했습니다.")
        width = math.hypot(corners[2][0] - corners[1][0], corners[2][1] - corners[1][1])
        if abs(width / rectangle[3] - scale) > 1e-5:
            raise RuntimeError("아일랜드 내부의 두 축 배율이 다릅니다.")
        islands.append({"sourceFaceId": index, "uvs": corners, "bounds": box,
                        "observedScale": scale, "observedAngleRad": angle})
    if max(item["observedScale"] for item in islands) - min(item["observedScale"] for item in islands) > 1e-5:
        raise RuntimeError("전체 아일랜드의 공통 배율을 확인하지 못했습니다.")
    if any(value < -1e-5 or value > 1 + 1e-5 for uv in uvs for value in uv):
        raise RuntimeError("ACTIVE_UDIM의 0..1 타일 범위를 벗어났습니다.")
    pairs = []
    for index, left in enumerate(islands):
        a = left["bounds"]
        for right in islands[index + 1:]:
            b = right["bounds"]
            gap = max(b["minU"] - a["maxU"], a["minU"] - b["maxU"],
                      b["minV"] - a["maxV"], a["minV"] - b["maxV"])
            if gap < -1e-5:
                raise RuntimeError("서로 다른 출력 AABB의 내부가 겹칩니다.")
            pairs.append({"sourceFaceIds": [left["sourceFaceId"], right["sourceFaceId"]],
                          "observedSeparatingAxisGap": gap})
    return {"islands": islands, "pairSeparation": pairs,
            "observedMinimumGap": min(pair["observedSeparatingAxisGap"] for pair in pairs)}


def observe(rotate, margin):
    obj, source_uvs = create_input()
    before = [list(vertex.co) for vertex in obj.data.vertices]
    context = uv_context(obj)
    options = {**REQUIRED_ENUMS, "rotate": rotate, "scale": True, "margin": margin,
               "merge_overlap": False, "pin": False}
    with bpy.context.temp_override(**context):
        status = bpy.ops.uv.pack_islands(**options)
    bpy.ops.object.mode_set(mode="OBJECT")
    if set(status) != {"FINISHED"}:
        raise RuntimeError("UV pack operator가 완료되지 않았습니다.")
    uvs = [[float(value) for value in corner.vector] for corner in obj.data.uv_layers.active.uv]
    if before != [list(vertex.co) for vertex in obj.data.vertices]:
        raise RuntimeError("UV pack이 원본 3D 위치를 바꿨습니다.")
    output = inspect_output(uvs, rotate)
    bpy.data.objects.remove(obj, do_unlink=True)
    return {"options": options, "inputUVs": source_uvs, "operatorStatus": sorted(status),
            "geometryUnchanged": True, **output}


def main():
    if not bpy.app.background or bpy.data.filepath:
        raise RuntimeError("새 --background --factory-startup 프로세스에서만 실행하세요.")
    properties = bpy.ops.uv.pack_islands.get_rna_type().properties
    enums = {key: [item.identifier for item in properties[key].enum_items] for key in REQUIRED_ENUMS}
    if any(value not in enums[key] for key, value in REQUIRED_ENUMS.items()):
        raise RuntimeError("선택한 pack 옵션이 현재 Blender RNA에 없습니다.")
    binary = Path(bpy.app.binary_path)
    digest = hashlib.sha256()
    with binary.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    result = {"probeRevision": 1, "observedAt": datetime.now(timezone.utc).isoformat(),
              "version": bpy.app.version_string, "buildHash": bpy.app.build_hash.decode("ascii"),
              "binarySha256": digest.hexdigest(), "availableEnums": enums,
              "scope": "AABB/CARDINAL/FRACTION/ACTIVE_UDIM의 작은 입력 관측. 웹과 배치·밀도 동일성 보증 없음.",
              "observed": [observe(rotate, margin) for rotate, margin in
                           [(False, 0.02), (True, 0.02), (True, 0.0), (True, 0.1)]]}
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if args.output:
        args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print("TOONSTUDIO_UV_PACK_CONTRACT=" + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
