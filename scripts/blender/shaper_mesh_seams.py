"""glTF의 UV·노멀 분리로 복제된 변을 감면 전에 이어 준다."""

from collections import defaultdict

import bmesh
from mathutils import Vector
from mathutils.kdtree import KDTree


def weld_kit_seams(obj):
    """서로 반대쪽에 있는 단일 경계 쌍만 연결하고 코너별 속성을 복원한다."""
    mesh = obj.data
    if mesh.shape_keys or not mesh.polygons:
        return 0

    coordinates = [tuple(v.co) for v in mesh.vertices]
    weights = [tuple(sorted((g.group, g.weight) for g in v.groups if g.weight > 0))
               for v in mesh.vertices]
    parent = list(range(len(coordinates)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        boundary = defaultdict(list)
        for edge in bm.edges:
            if edge.is_boundary:
                loop = edge.link_loops[0]
                a, b = loop.vert.index, loop.link_loop_next.vert.index
                boundary[tuple(sorted((coordinates[a], coordinates[b])))].append(loop)
        for pair in boundary.values():
            if len(pair) != 2:
                continue
            first, second = pair
            a, b = first.vert.index, first.link_loop_next.vert.index
            c, d = second.link_loop_next.vert.index, second.vert.index
            if coordinates[a] != coordinates[c] or coordinates[b] != coordinates[d]:
                continue
            if weights[a] != weights[c] or weights[b] != weights[d]:
                continue
            first_points = {coordinates[v.index] for v in first.face.verts}
            if first_points == {coordinates[v.index] for v in second.face.verts}:
                continue
            for u, v in ((a, c), (b, d)):
                u, v = root(u), root(v)
                parent[max(u, v)] = min(u, v)

        bm.verts.ensure_lookup_table()
        target = {v: bm.verts[root(v.index)] for v in bm.verts if root(v.index) != v.index}
        if not target:
            return 0
        # 각 루프의 원형 노멀을 보관한다. 좌표가 같은 단단한 모서리도 노멀이 다를 수 있다.
        normals = [tuple(n.vector) for n in mesh.corner_normals]
        ids = bm.loops.layers.int.new("shaper_source_corner")
        attr_name = ids.name
        for face in bm.faces:
            source = {mesh.loops[i].vertex_index: i for i in mesh.polygons[face.index].loop_indices}
            for loop in face.loops:
                loop[ids] = source[loop.vert.index]
        bmesh.ops.weld_verts(bm, targetmap=target)
        # 겹치는 면을 잃는 자산은 원본 그대로 감면한다.
        if sum(len(f.loops) for f in bm.faces) != len(normals):
            return 0
        bm.to_mesh(mesh)
        attr = mesh.attributes[attr_name]
        loop_normals = [normals[element.value] for element in attr.data]
        mesh.attributes.remove(attr)
        mesh.normals_split_custom_set(loop_normals)
        mesh.update()
        return len(target)
    finally:
        bm.free()


def remove_decimation_wires(mesh):
    """감면 후 면에 속하지 않는 변과 점만 제거한다."""
    used_vertices = {loop.vertex_index for loop in mesh.loops}
    if len(used_vertices) == len(mesh.vertices) and not any(edge.is_loose for edge in mesh.edges):
        return
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        # 면과 코너 순서가 동일하므로 기존 분리 노멀을 그대로 다시 지정할 수 있다.
        normals = [tuple(n.vector) for n in mesh.corner_normals]
        for edge in list(bm.edges):
            if edge.is_wire:
                bm.edges.remove(edge)
        for vertex in list(bm.verts):
            if not vertex.link_edges:
                bm.verts.remove(vertex)
        bm.to_mesh(mesh)
        mesh.normals_split_custom_set(normals)
        mesh.update()
    finally:
        bm.free()


def release_panel_contacts(obj):
    """한 점만 닿은 원단 사이에 0.06mm 시접을 주어 서로 다른 면이 한 정점에 묶이지 않게 한다."""
    mesh = obj.data
    normals = [corner.vector.copy() for corner in mesh.corner_normals]
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        verts = list(bm.verts)
        tree = KDTree(len(verts))
        for v in verts:
            tree.insert(v.co, v.index)
        tree.balance()
        # GLB로 내보내며 갈라지는 UV와 노멀도 공간에서 같은 지점이면 하나의 봉제점이다.
        keys = [min(i for _, i, _ in tree.find_range(v.co, .000012)) for v in verts]
        corners = defaultdict(list)
        for f in bm.faces:
            for loop in f.loops:
                corners[keys[loop.vert.index]].append((f, loop.vert, (
                    tuple(loop.link_loop_prev.vert.co), tuple(loop.link_loop_next.vert.co))))
        contacts = 0
        for entries in corners.values():
            attached = defaultdict(list)
            for f, v, (left, right) in entries:
                attached[left].append(f)
                attached[right].append(f)
            neighbors = defaultdict(set)
            for linked in attached.values():
                for f in linked:
                    neighbors[f].update(linked)
            groups = []
            todo = set(neighbors)
            while todo:
                first = min(todo, key=lambda f: f.index)
                todo.remove(first)
                panel, stack = {first}, [first]
                while stack:
                    for neighbor in neighbors[stack.pop()] & todo:
                        todo.remove(neighbor)
                        panel.add(neighbor)
                        stack.append(neighbor)
                groups.append(panel)
            if len(groups) == 1:
                continue
            contacts += 1
            groups.sort(key=lambda g: (-len(g), min(f.index for f in g)))
            shifts = {f: Vector() for f in groups[0]}
            for group in groups[1:]:
                center = sum((f.calc_center_median() for f in sorted(group, key=lambda f: f.index)), Vector()) / len(group)
                origin = next(v.co for f, v, _ in entries if f in group)
                shift = (center - origin).normalized() * .00006
                shifts.update((f, shift) for f in group)
            for v in sorted({v for _, v, _ in entries}, key=lambda v: v.index):
                offsets = {tuple(shifts[f]) for f in v.link_faces}
                if len(offsets) == 1:
                    v.co += Vector(next(iter(offsets)))
                else:
                    # 같은 Blender 정점을 공유한 단추·칼라 끝은 코너의 UV/스킨을 지닌 정점으로 분리한다.
                    for separated in bmesh.utils.vert_separate(v, list(v.link_edges)):
                        move = {tuple(shifts[f]) for f in separated.link_faces}
                        if len(move) != 1:
                            raise ValueError("접힌 원단의 모서리를 면별로 분리할 수 없습니다.")
                        separated.co += Vector(next(iter(move)))
        bm.to_mesh(mesh)
    finally:
        bm.free()
    mesh.update()
    mesh.normals_split_custom_set(normals)
    return contacts
