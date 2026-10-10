"""캐릭터 키트 Blender 도구 공용 함수 (헤드리스 전용).

`blender --background --python <스크립트> -- <인자…>` 로 실행되는 스크립트들이 공유한다.
이미지는 항상 `Non-Color`로 읽고 써서 Blender의 색 관리 변환이 끼지 않게 한다(바이트/255 그대로).
"""

import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector


def cli_args():
    """`--` 뒤의 인자 목록."""
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def flag_value(args, name, default=None, cast=str):
    """`--name 값` 형태 옵션을 읽는다. 없으면 default."""
    if name in args:
        return cast(args[args.index(name) + 1])
    return default


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    """GLB를 가져와 새로 생긴 오브젝트 목록을 돌려준다."""
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=path)
    return [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before]


def mesh_objects(objects=None):
    pool = objects if objects is not None else bpy.context.scene.objects
    return [obj for obj in pool if obj.type == "MESH"]


def base_color_image(obj):
    """첫 재질의 Principled BSDF Base Color에 연결된 이미지를 Non-Color로 돌려준다."""
    for slot in obj.material_slots:
        node_tree = slot.material.node_tree if slot.material else None
        if not node_tree:
            continue
        for node in node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED" and node.inputs["Base Color"].links:
                source = node.inputs["Base Color"].links[0].from_node
                if source.type == "TEX_IMAGE" and source.image:
                    source.image.colorspace_settings.name = "Non-Color"
                    return source.image
    raise RuntimeError("Base Color 이미지를 찾지 못했다: " + obj.name)


def image_rgb(image):
    """이미지를 (높이, 너비, 3) float32 배열로 읽는다. 행 0이 이미지 아래쪽(Blender 규약)이다."""
    width, height = image.size
    flat = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(flat)
    return flat.reshape(height, width, 4)[:, :, :3]


def rgb_to_hsv(rgb):
    """(n,3) 0..1 RGB → (n,3) 색상(도 0..360)·채도·명도."""
    rgb = np.asarray(rgb, dtype=np.float64)
    maxc = rgb.max(axis=1)
    minc = rgb.min(axis=1)
    delta = maxc - minc
    hue = np.zeros_like(maxc)
    nonzero = delta > 1e-9
    red, green, blue = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    mask = nonzero & (maxc == red)
    hue[mask] = ((green - blue)[mask] / delta[mask]) % 6
    mask = nonzero & (maxc == green)
    hue[mask] = (blue - red)[mask] / delta[mask] + 2
    mask = nonzero & (maxc == blue)
    hue[mask] = (red - green)[mask] / delta[mask] + 4
    saturation = np.where(maxc > 1e-9, delta / np.where(maxc > 1e-9, maxc, 1), 0)
    return np.stack([hue * 60.0, saturation, maxc], axis=1)


def face_table(obj, rgb_array):
    """면마다 (텍스처 평균 RGB, 정규화 높이, 중심 좌표)를 계산한다.

    rgb_array는 `image_rgb` 결과다. 높이는 Blender +Z(glTF +Y 위)를 0..1로 정규화한다.
    """
    mesh = obj.data
    loop_count = len(mesh.loops)
    face_count = len(mesh.polygons)
    uv = np.empty(loop_count * 2, dtype=np.float32)
    mesh.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(loop_count, 2)
    loop_vertex = np.empty(loop_count, dtype=np.int32)
    mesh.loops.foreach_get("vertex_index", loop_vertex)
    starts = np.empty(face_count, dtype=np.int32)
    totals = np.empty(face_count, dtype=np.int32)
    mesh.polygons.foreach_get("loop_start", starts)
    mesh.polygons.foreach_get("loop_total", totals)
    coords = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", coords)
    coords = coords.reshape(-1, 3)

    height, width = rgb_array.shape[:2]
    columns = np.clip((uv[:, 0] * (width - 1)).astype(np.int64), 0, width - 1)
    rows = np.clip((uv[:, 1] * (height - 1)).astype(np.int64), 0, height - 1)
    loop_rgb = rgb_array[rows, columns].astype(np.float64)
    face_rgb = np.add.reduceat(loop_rgb, starts, axis=0) / totals[:, None]
    loop_position = coords[loop_vertex].astype(np.float64)
    centroid = np.add.reduceat(loop_position, starts, axis=0) / totals[:, None]
    z_min, z_max = coords[:, 2].min(), coords[:, 2].max()
    z_norm = (centroid[:, 2] - z_min) / max(z_max - z_min, 1e-9)
    return face_rgb, z_norm, centroid


def welded_face_components(obj, face_mask, tolerance=1e-5):
    """face_mask가 True인 면들의 연결 성분 번호를 돌려준다(그 밖의 면은 -1).

    glTF 가져오기는 UV 이음매마다 정점을 쪼개 놓아서 Blender 토폴로지로는 한 셸이 여러 덩어리로 보인다.
    그래서 정점 위치를 tolerance(m)로 양자화해 같은 위치를 한 정점으로 보고 정점 공유 기준으로 묶는다.
    """
    mesh = obj.data
    coords = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", coords)
    quantized = np.round(coords.reshape(-1, 3) / tolerance).astype(np.int64)
    _, canonical = np.unique(quantized, axis=0, return_inverse=True)
    canonical = canonical.reshape(-1)
    loop_vertex = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get("vertex_index", loop_vertex)
    starts = np.empty(len(mesh.polygons), dtype=np.int32)
    totals = np.empty(len(mesh.polygons), dtype=np.int32)
    mesh.polygons.foreach_get("loop_start", starts)
    mesh.polygons.foreach_get("loop_total", totals)

    parent = list(range(int(canonical.max()) + 1))

    def find(node):
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    labels = np.full(len(mesh.polygons), -1, dtype=np.int64)
    for index in np.flatnonzero(face_mask):
        ids = canonical[loop_vertex[starts[index] : starts[index] + totals[index]]]
        root = find(int(ids[0]))
        for other in ids[1:]:
            other_root = find(int(other))
            if other_root != root:
                parent[other_root] = root
    for index in np.flatnonzero(face_mask):
        labels[index] = find(int(canonical[loop_vertex[starts[index]]]))
    return labels


def delete_faces_and_keep_largest_island(obj, delete_mask):
    """delete_mask가 True인 면을 지우고, 남은 면 중 가장 큰 연결 덩어리(위치 기준 용접)만 남긴다.

    (남은 면 수, 지운 면 수, 버린 덩어리 수)를 돌려준다.
    """
    delete_mask = np.asarray(delete_mask, dtype=bool)
    labels = welded_face_components(obj, ~delete_mask)
    kept_labels = labels[labels >= 0]
    if kept_labels.size == 0:
        raise RuntimeError("지운 뒤 남는 면이 없다")
    values, counts = np.unique(kept_labels, return_counts=True)
    largest = values[np.argmax(counts)]
    final_delete = delete_mask | (labels != largest)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    doomed = [face for face in bm.faces if final_delete[face.index]]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    for vert in [v for v in bm.verts if not v.link_faces]:
        bm.verts.remove(vert)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return len(obj.data.polygons), int(final_delete.sum()), int(len(values) - 1)


def export_glb(path, **overrides):
    options = {
        "filepath": path,
        "export_format": "GLB",
        "export_apply": False,
        "export_texcoords": True,
        "export_normals": True,
        "export_materials": "EXPORT",
        "export_image_format": "AUTO",
        "use_selection": False,
    }
    options.update(overrides)
    bpy.ops.export_scene.gltf(**options)


def world_bounds(objects):
    low = [math.inf] * 3
    high = [-math.inf] * 3
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], world[axis])
                high[axis] = max(high[axis], world[axis])
    return low, high


def write_report(path, payload):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
