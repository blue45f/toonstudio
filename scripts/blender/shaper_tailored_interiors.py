"""주름치마의 허리·자락과 로퍼의 갑피·밑창을 원래 재단선에 맞춰 잇는다."""

from collections import defaultdict

import bmesh
from mathutils import Vector

from shaper_mesh_seams import release_panel_contacts


def _rings(mesh):
    # UV와 코너 노멀 때문에 나뉜 정점은 실제 공간의 같은 봉제점으로 취급한다.
    edges = defaultdict(list)
    points = [tuple(vertex.co) for vertex in mesh.vertices]
    for face in mesh.polygons:
        indices = list(face.vertices)
        for a, b in zip(indices, indices[1:] + indices[:1]):
            edges[tuple(sorted((points[a], points[b])))].append((a, b))
    step = {}
    for uses in edges.values():
        if len(uses) == 1:
            a, b = uses[0]
            key = points[a]
            if key in step:
                raise ValueError("옷감 재단선이 분기합니다. 봉제 전에 패널 연결을 확인하세요.")
            step[key] = (a, points[b])
    rings = []
    while step:
        first = next(iter(step))
        point = first
        ring = []
        while point in step:
            index, point = step.pop(point)
            ring.append(index)
        if point != first:
            raise ValueError("재단선이 끊어져 봉제할 수 없습니다.")
        rings.append(ring)
    return rings


def _center(points):
    return sum(points, Vector()) / len(points)


class _Pattern:
    def __init__(self, obj):
        self.obj = obj
        self.points = [v.co.copy() for v in obj.data.vertices]
        self.weights = []
        self.triangles = []

    def point(self, co, source):
        self.weights.append(source)
        self.points.append(co)
        return len(self.points) - 1

    def ring_center(self, ring):
        return _center([self.points[i] for i in ring])

    def inset(self, ring, scale, width, height):
        center = self.ring_center(ring)
        result = []
        for i in ring:
            co = self.points[i]
            radius = Vector((co.x - center.x, co.y - center.y))
            offset = radius.normalized() * min(width, radius.length * .35)
            result.append(self.point(Vector((center.x + radius.x * scale - offset.x,
                                             center.y + radius.y * scale - offset.y,
                                             co.z + height)), i))
        return result

    def stitch(self, a, b):
        """서로 다른 매수를 가진 두 링을 짧은 대각선으로 봉제한다. a와 b는 같은 주향이다."""
        start = min(range(len(b)), key=lambda j: (self.points[b[j]] - self.points[a[0]]).length_squared)
        b = b[start:] + b[:start]
        i = j = 0
        while i < len(a) or j < len(b):
            left, right = a[i % len(a)], b[j % len(b)]
            next_a, next_b = a[(i + 1) % len(a)], b[(j + 1) % len(b)]
            step_a = j == len(b) or (i < len(a) and
                (self.points[next_a] - self.points[right]).length_squared <=
                (self.points[left] - self.points[next_b]).length_squared)
            if step_a:
                self.triangles.append((next_a, left, right))
                i += 1
            else:
                self.triangles.append((left, right, next_b))
                j += 1

    def build(self):
        obj = self.obj
        mesh = obj.data
        count = len(mesh.vertices)
        old_weights = [[(g.group, g.weight) for g in v.groups] for v in mesh.vertices]
        old_normals = [n.vector.copy() for n in mesh.corner_normals]
        bm = bmesh.new()
        try:
            bm.from_mesh(mesh)
            bm.verts.ensure_lookup_table()
            vertices = list(bm.verts) + [bm.verts.new(co) for co in self.points[count:]]
            uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
            for indices in self.triangles:
                face = bm.faces.new([vertices[i] for i in indices])
                face.smooth = True
                for loop in face.loops:
                    co = loop.vert.co
                    loop[uv_layer].uv = (.5 + co.x, .5 + co.z)
            bm.to_mesh(mesh)
        finally:
            bm.free()
        mesh.update()
        for i, source in enumerate(self.weights, count):
            # 안쪽으로 한 번 더 꺾은 시접도 바깥 재단선과 같은 관절을 따른다.
            weights = old_weights[source]
            old_weights.append(weights)
            for group, weight in weights:
                obj.vertex_groups[group].add([i], weight, "REPLACE")
        mesh.normals_split_custom_set(old_normals + [Vector()] * (len(mesh.loops) - len(old_normals)))


def tailor_pleated_skirt(obj):
    pattern = _Pattern(obj)
    rings = sorted(_rings(obj.data), key=lambda r: pattern.ring_center(r).z)
    if len(rings) != 4:
        raise ValueError("주름치마의 밑단, 허리 시접과 허리띠 양쪽 재단선을 확인하세요.")
    hem, waist, band_bottom, band_top = rings
    pattern.stitch(waist, band_bottom[::-1])
    # 안감도 겉감의 깊은 주름과 국소 허벅지 가중치를 그대로 따라야 옆으로 무릎을 들 때 뚫리지 않는다.
    panels, coords, joins = _panels(obj.data)
    seam = {coords[v] for v in waist + band_bottom}
    lining = {}
    for panel in panels:
        lining.update(_line_panel(pattern, panel, coords, joins, .00035, unhemmed=seam))
    pattern.stitch([lining[coords[v]] for v in band_bottom[::-1]],
                   [lining[coords[v]] for v in waist])
    pattern.build()
    release_panel_contacts(obj)


def tailor_loafers(obj):
    pattern = _Pattern(obj)
    outlines = _rings(obj.data)
    for side in (-1, 1):
        rings = sorted((r for r in outlines if pattern.ring_center(r).x * side > 0),
                       key=lambda r: pattern.ring_center(r).z)
        if len(rings) != 3:
            raise ValueError("로퍼 한 짝의 갑피, 밑창과 발등 입구를 확인하세요.")
        upper, sole, opening = rings
        pattern.stitch(upper, sole[::-1])
        collar = pattern.inset(opening, 1, .0014, -.001)
        pattern.stitch(opening, collar)
        # 발등을 막지 않고 안쪽 가죽을 발바닥 높이까지 내려 인솔에 접합한다.
        center = pattern.ring_center(opening)
        floor = []
        for i in opening:
            co = pattern.points[i]
            floor.append(pattern.point(Vector((center.x + (co.x - center.x) * .84,
                                               center.y + (co.y - center.y) * .91,
                                               pattern.ring_center(sole).z + .004)), i))
        pattern.stitch(collar, floor)
        hub = pattern.point(pattern.ring_center(floor), opening[0])
        for i, a in enumerate(floor):
            pattern.triangles.append((floor[(i + 1) % len(floor)], a, hub))
    pattern.build()


def _panels(mesh, correct_winding=False):
    coords = [tuple(v.co) for v in mesh.vertices]
    joins = defaultdict(list)
    for poly in mesh.polygons:
        ids = list(poly.vertices)
        for a, b in zip(ids, ids[1:] + ids[:1]):
            edge = tuple(sorted((coords[a], coords[b])))
            joins[edge].append((poly.index, coords[a] == edge[0]))
    neighbors = defaultdict(list)
    for sides in joins.values():
        if len(sides) == 2:
            (i, forward), (j, other_forward) = sides
            neighbors[i].append((j, forward == other_forward))
            neighbors[j].append((i, forward == other_forward))
    panels = []
    seen = set()
    normals = [[(v, mesh.corner_normals[j].vector.copy())
                for v, j in zip(poly.vertices, poly.loop_indices)] for poly in mesh.polygons] if correct_winding else []
    for poly in mesh.polygons:
        if poly.index in seen:
            continue
        reverse = {poly.index: False}
        stack = [poly.index]
        while stack:
            i = stack.pop()
            for j, same_way in neighbors[i]:
                value = reverse[i] ^ same_way
                if j in reverse:
                    if reverse[j] != value:
                        raise ValueError("재킷의 앞뒷면을 연속해서 정할 수 없는 패널이 있습니다.")
                else:
                    reverse[j] = value
                    stack.append(j)
        seen.update(reverse)
        minority = sum(reverse.values()) > len(reverse) / 2
        for i, flip in reverse.items():
            if correct_winding and flip != minority:
                mesh.polygons[i].flip()
        panels.append(list(reverse))
    corner_normals = [Vector()] * len(mesh.loops)
    for poly, corners in zip(mesh.polygons, normals):
        by_vert = dict(corners)
        for v, j in zip(poly.vertices, poly.loop_indices):
            corner_normals[j] = by_vert[v]
    if correct_winding:
        mesh.normals_split_custom_set(corner_normals)
    return panels, coords, joins


def _line_panel(pattern, shell, coords, joins, thickness, unhemmed=()):
    mesh = pattern.obj.data
    # 한 재단점에 두 천 조각이 닿을 수 있다. 변으로 이어진 면끼리만 한 안쪽 정점을 공유한다.
    fans = defaultdict(dict)
    for i in shell:
        face = mesh.polygons[i]
        for a in face.vertices:
            fans[coords[a]][i] = a
    inner_by_face = {}
    primary = {}
    for key, uses in fans.items():
        todo = set(uses)
        count = 0
        while todo:
            first = todo.pop()
            group = [first]
            stack = [first]
            while stack:
                f = mesh.polygons[stack.pop()]
                verts = list(f.vertices)
                index = verts.index(uses[f.index])
                for b in (verts[index - 1], verts[(index + 1) % len(verts)]):
                    for neighbor, _ in joins[tuple(sorted((key, coords[b])))]:
                        if neighbor in todo:
                            todo.remove(neighbor)
                            stack.append(neighbor)
                            group.append(neighbor)
            normal = sum((mesh.polygons[f].normal * mesh.polygons[f].area for f in group), Vector()).normalized()
            origin = pattern.points[uses[first]]
            bias = Vector()
            if todo or count:
                # 접힌 라펠에서 한 점을 만난 시접은 각 천 안쪽으로 0.05mm 물려 따로 봉합한다.
                bias = (_center([mesh.polygons[f].center for f in group]) - origin).normalized() * .00005
            inner = pattern.point(origin - normal * thickness + bias, uses[first])
            primary[key] = inner
            inner_by_face.update(((f, key), inner) for f in group)
            count += 1
    for i in shell:
        vertices = list(mesh.polygons[i].vertices)
        anchors = [inner_by_face[i, coords[v]] for v in vertices]
        for j in range(1, len(anchors) - 1):
            pattern.triangles.append((anchors[0], anchors[j + 1], anchors[j]))
        for a, b in zip(vertices, vertices[1:] + vertices[:1]):
            edge = tuple(sorted((coords[a], coords[b])))
            if len(joins[edge]) != 1 or (coords[a] in unhemmed and coords[b] in unhemmed):
                continue
            ia, ib = inner_by_face[i, coords[a]], inner_by_face[i, coords[b]]
            pattern.triangles.extend(((b, a, ia), (b, ia, ib)))
    return primary


def tailor_blazer(obj):
    """몸판·소매에는 안감을 대고, 따로 재단된 칼라와 포켓은 각각 자기 앞면에서 접는다."""
    pattern = _Pattern(obj)
    panels, coords, joins = _panels(obj.data, correct_winding=True)
    body = max(panels, key=len)
    open_faces = {uses[0][0] for uses in joins.values() if len(uses) == 1}
    for panel in panels:
        if not open_faces.isdisjoint(panel):
            _line_panel(pattern, panel, coords, joins, .0011 if panel is body else .00055)
    pattern.build()
    release_panel_contacts(obj)


def finish_neck_socket(obj):
    """별도 헤드가 회전할 때 목의 잘린 단면이 노출되지 않도록 목 안쪽에 얕은 접합면을 둔다."""
    pattern = _Pattern(obj)
    rings = _rings(obj.data)
    if len(rings) != 1:
        raise ValueError("헤드와 연결되는 목 단면이 하나여야 합니다.")
    edge = rings[0]
    rim = pattern.inset(edge, .92, 0, -.0015)
    pattern.stitch(edge, rim)
    base = pattern.inset(rim, .65, 0, -.003)
    pattern.stitch(rim, base)
    center = pattern.point(pattern.ring_center(base), edge[0])
    for a, b in zip(base, base[1:] + base[:1]):
        pattern.triangles.append((b, a, center))
    pattern.build()


def fit_hair_roots(obj):
    """두피에 닿는 바탕 캡에 안쪽 면을 만들고 잘린 가닥 끝을 안으로 모은다."""
    pattern = _Pattern(obj)
    rings = _rings(obj.data)
    scalp = max(rings, key=lambda r: max(pattern.points[i].x for i in r) -
                min(pattern.points[i].x for i in r))
    panels, coords, joins = _panels(obj.data)
    scalp_vertex = coords[scalp[0]]
    cap = next(panel for panel in panels if any(
        scalp_vertex in [coords[v] for v in obj.data.polygons[f].vertices] for f in panel))
    _line_panel(pattern, cap, coords, joins, .001)
    for ring in rings:
        if ring is scalp:
            continue
        center = pattern.ring_center(ring)
        axial = sum(((pattern.points[a] - center).cross(pattern.points[b] - center)
                     for a, b in zip(ring, ring[1:] + ring[:1])), Vector()).normalized()
        end = [pattern.point(center.lerp(pattern.points[i], .68) + axial * .0006, i) for i in ring]
        pattern.stitch(ring, end)
        tip = pattern.point(center + axial * .0008, ring[0])
        for a, b in zip(end, end[1:] + end[:1]):
            pattern.triangles.append((b, a, tip))
    pattern.build()
