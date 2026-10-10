"""캐릭터 키트 Blender 도구 공용 함수 (헤드리스 전용).

`blender --background --python <스크립트> -- <인자…>` 로 실행되는 스크립트들이 공유한다.
이미지는 항상 `Non-Color`로 읽고 써서 Blender의 색 관리 변환이 끼지 않게 한다(바이트/255 그대로).
"""

import json
import math
import os
import sys

import bpy  # pip `bpy` 패키지는 bpy를 먼저 가져와야 bmesh·mathutils를 쓸 수 있다(Blender 내장 파이썬은 순서와 무관)
import bmesh
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


def canonical_triangles(obj, tolerance=1e-5):
    """모든 면이 삼각형인 메시의 면별 대표 정점 번호 (F,3). 위치가 같은 정점(UV 이음매로 쪼개진 것)은 같은 번호다."""
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
    if not (totals == 3).all():
        raise RuntimeError("삼각형이 아닌 면이 있다")
    return canonical[loop_vertex[starts[:, None] + np.arange(3)]]


def grow_region(seed_mask, candidate_mask, face_vertices):
    """씨앗 면에서 시작해 정점을 공유하는 후보 면으로만 퍼지는 영역 성장. 씨앗은 후보에 포함돼야 한다."""
    face_vertices = np.asarray(face_vertices)
    vertex_count = int(face_vertices.max()) + 1
    vertex_faces = [[] for _ in range(vertex_count)]
    for face, ids in enumerate(face_vertices.tolist()):
        for vertex in ids:
            vertex_faces[vertex].append(face)
    allowed = np.asarray(candidate_mask, dtype=bool) | np.asarray(seed_mask, dtype=bool)
    grown = np.zeros(len(face_vertices), dtype=bool)
    stack = [int(face) for face in np.flatnonzero(seed_mask)]
    for face in stack:
        grown[face] = True
    while stack:
        face = stack.pop()
        for vertex in face_vertices[face]:
            for neighbor in vertex_faces[vertex]:
                if allowed[neighbor] and not grown[neighbor]:
                    grown[neighbor] = True
                    stack.append(neighbor)
    return grown


def face_components(mask, face_vertices):
    """mask가 True인 면들의 연결 성분 번호(정점 공유 기준, 그 밖은 -1)와 성분별 면 수 (labels, sizes)."""
    face_vertices = np.asarray(face_vertices)
    mask = np.asarray(mask, dtype=bool)
    vertex_faces = [[] for _ in range(int(face_vertices.max()) + 1)]
    for face in np.flatnonzero(mask).tolist():
        for vertex in face_vertices[face]:
            vertex_faces[vertex].append(face)
    labels = np.full(len(face_vertices), -1, dtype=np.int64)
    sizes = []
    for start in np.flatnonzero(mask).tolist():
        if labels[start] >= 0:
            continue
        label = len(sizes)
        labels[start] = label
        stack = [start]
        count = 0
        while stack:
            face = stack.pop()
            count += 1
            for vertex in face_vertices[face]:
                for neighbor in vertex_faces[vertex]:
                    if labels[neighbor] < 0:
                        labels[neighbor] = label
                        stack.append(neighbor)
        sizes.append(count)
    return labels, np.array(sizes)


def delete_faces_and_keep_largest_island(obj, delete_mask, keep=1):
    """delete_mask가 True인 면을 지우고, 남은 면 중 가장 큰 연결 덩어리(위치 기준 용접) `keep`개만 남긴다.

    (남은 면 수, 지운 면 수, 버린 덩어리 수)를 돌려준다. 신발 한 켤레처럼 덩어리가 여럿이어야 하면 keep을 늘린다.
    """
    delete_mask = np.asarray(delete_mask, dtype=bool)
    labels = welded_face_components(obj, ~delete_mask)
    kept_labels = labels[labels >= 0]
    if kept_labels.size == 0:
        raise RuntimeError("지운 뒤 남는 면이 없다")
    values, counts = np.unique(kept_labels, return_counts=True)
    largest = values[np.argsort(-counts)[:keep]]
    final_delete = delete_mask | ~np.isin(labels, largest)

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
    return len(obj.data.polygons), int(final_delete.sum()), int(len(values) - len(largest))


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


def fill_small_holes(obj, max_diagonal=0.35, max_sides=4000, weld_tolerance=1e-5):
    """위치가 같은 정점을 합친 뒤, 크기가 max_diagonal 이하인 작은 구멍만 메운다. (메운 구멍 수, 새 면 수)를 돌려준다.

    먼저 모든 구멍을 메우고, 새로 생긴 면 조각(새 면끼리 변을 공유하는 덩어리) 중 경계 상자 대각선이 max_diagonal보다 큰 것을
    다시 지워 큰 개구부(얼굴·목·밑단·소매 끝)를 되돌린다. 변 개수가 아니라 크기로 고르는 이유는 가는 틈이 들쭉날쭉해 변이 수백 개여도
    실제 크기는 작기 때문이다. 새 면은 새 정점을 만들지 않으므로 각 정점의 UV는 이미 있는 인접 면의 UV를 그대로 쓴다
    (구멍 안쪽은 이웃 색으로 채워진 평평한 조각이 된다).
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld_tolerance)
    bm.edges.ensure_lookup_table()
    old_faces = {face.index for face in bm.faces}
    boundary = [edge for edge in bm.edges if edge.is_boundary]
    before = len(bm.faces)
    result = bmesh.ops.holes_fill(bm, edges=boundary, sides=max_sides)
    new_faces = [face for face in result["faces"] if face.is_valid]

    # 새 면 조각(새 면끼리 변을 공유하는 덩어리)별 크기를 재고, 큰 조각은 다시 지운다.
    new_set = set(new_faces)
    seen = set()
    patches = []
    for seed in new_faces:
        if seed in seen:
            continue
        stack = [seed]
        seen.add(seed)
        patch = []
        while stack:
            face = stack.pop()
            patch.append(face)
            for edge in face.edges:
                for neighbor in edge.link_faces:
                    if neighbor in new_set and neighbor not in seen:
                        seen.add(neighbor)
                        stack.append(neighbor)
        patches.append(patch)
    keep_faces = []
    drop_faces = []
    for patch in patches:
        coords = [v.co for face in patch for v in face.verts]
        low = [min(c[axis] for c in coords) for axis in range(3)]
        high = [max(c[axis] for c in coords) for axis in range(3)]
        diagonal = sum((high[axis] - low[axis]) ** 2 for axis in range(3)) ** 0.5
        (keep_faces if diagonal <= max_diagonal else drop_faces).extend(patch)
    if drop_faces:
        bmesh.ops.delete(bm, geom=drop_faces, context="FACES_ONLY")
    kept_patches = sum(1 for patch in patches if patch[0] in keep_faces or (patch[0].is_valid and patch[0] not in drop_faces))
    new_faces = [face for face in keep_faces if face.is_valid]
    uv_layer = bm.loops.layers.uv.active
    if uv_layer is not None:
        vertex_uv = {}
        for face in bm.faces:
            if face.index in old_faces and face.is_valid:
                for loop in face.loops:
                    vertex_uv.setdefault(loop.vert.index, loop[uv_layer].uv.copy())
        for face in new_faces:
            for loop in face.loops:
                known = vertex_uv.get(loop.vert.index)
                if known is not None:
                    loop[uv_layer].uv = known
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return kept_patches, len(obj.data.polygons) - before + 0


def write_report(path, payload):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
