"""작화 원판의 원래 앞면과 표정 델타를 유지한 채 착색 렌즈·잉크 띠의 뒤쪽 모서리를 둥글게 마감한다."""
import bmesh
from mathutils import Vector


def _fit_face_inlay(obj, depth):
    mesh = obj.data
    keys_data = [[point.co.copy() for point in key.data] for key in mesh.shape_keys.key_blocks]
    old_normals = {(f.index, v): mesh.corner_normals[j].vector.copy()
                   for f in mesh.polygons for v, j in zip(f.vertices, f.loop_indices)}
    turned = set()
    extra = []
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        orig = list(bm.verts)
        for v in orig:
            v.co = keys_data[0][v.index]
        bm.normal_update()
        faces = list(bm.faces)
        uv = bm.loops.layers.uv.active
        deform = bm.verts.layers.deform.active
        # 각 가닥이나 반사광의 작은 독립 면마다 테두리가 자기 중심을 향해 말리게 한다.
        backward = {}
        remaining = set(range(len(orig)))
        while remaining:
            first = min(remaining)
            remaining.remove(first)
            start = orig[first]
            stack, part = [start], [start]
            while stack:
                for edge in stack.pop().link_edges:
                    for v in edge.verts:
                        if v.index in remaining:
                            remaining.remove(v.index)
                            stack.append(v)
                            part.append(v)
            part.sort(key=lambda v: v.index)
            patch = sorted({f for v in part for f in v.link_faces}, key=lambda f: f.index)
            # 카메라를 등지고 있던 잉크 띠는 감김과 코너 노멀을 함께 뒤집어 기존 명암을 보존한다.
            if sum(f.normal.y * f.calc_area() for f in patch) > 0:
                for f in patch:
                    turned.add(f.index)
                    f.normal_flip()
            center = sum((v.co for v in part), Vector()) / len(part)
            for v in part:
                offset = Vector(((center.x - v.co.x) * .007, depth, (center.z - v.co.z) * .007))
                inside = bm.verts.new(v.co + offset)
                if deform is not None:
                    for group, weight in v[deform].items():
                        inside[deform][group] = weight
                backward[v] = inside
                extra.append((v.index, offset))
        rims = [(loop.vert, loop.link_loop_next.vert, loop[uv].uv.copy(), loop.link_loop_next[uv].uv.copy())
                for face in faces for loop in face.loops if loop.edge.is_boundary]
        for face in faces:
            original = list(reversed(list(face.loops)))
            rear = bm.faces.new([backward[loop.vert] for loop in original])
            rear.material_index = face.material_index
            rear.smooth = True
            for loop, source in zip(rear.loops, original, strict=True):
                loop[uv].uv = source[uv].uv.copy()
        for a, b, u, v in rims:
            side = bm.faces.new((b, a, backward[a], backward[b]))
            for loop, sample in zip(side.loops, (v, u, u, v), strict=True):
                loop[uv].uv = sample
        bm.to_mesh(mesh)
    finally:
        bm.free()
    mesh.update()
    # 비례 조형 후에는 원본 mesh.vertices와 최종 Basis 좌표가 다를 수 있다.
    # 앞면은 원래 각 표정의 좌표를 정확히 복원하고, 뒷면에는 같은 델타를 옮긴다.
    for key, coords in zip(mesh.shape_keys.key_blocks, keys_data, strict=True):
        for i, co in enumerate(coords):
            key.data[i].co = co
        for i, (source, offset) in enumerate(extra, len(coords)):
            key.data[i].co = coords[source] + offset
    normals = [Vector()] * len(mesh.loops)
    for f in mesh.polygons:
        for v, j in zip(f.vertices, f.loop_indices):
            if (f.index, v) in old_normals:
                n = old_normals[f.index, v]
                normals[j] = -n if f.index in turned else n
    mesh.normals_split_custom_set(normals)


def fit_face_inlays(parts):
    # 흰자는 깊게, 홍채와 반사광은 서로의 층을 가리지 않는 두께로 안쪽을 접는다.
    for tag, depth in {'eye': .00036, 'iris': .00016, 'highlight': .000085, 'lash': .00012,
                      'brow_L': .00014, 'brow_R': .00014}.items():
        _fit_face_inlay(parts[tag], depth)
