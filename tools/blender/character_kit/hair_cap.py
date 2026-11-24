"""원본 헤어 각 LOD의 열린 두피 테두리를 기존 정점으로 막는다."""
from collections import Counter, defaultdict

import numpy as np


def orient_faces(triangles, points, normals):
    """원본에 뒤집혀 있는 면은 연결된 이웃과 방향을 맞추고, 저작 법선이 가리키는 쪽을 겉으로 둔다."""
    incidence = defaultdict(list)
    for i, face in enumerate(triangles.tolist()):
        for a, b in zip(face, face[1:] + face[:1]):
            incidence[min(a, b), max(a, b)].append((i, a < b))
    neighbors = defaultdict(list)
    for adjacent in incidence.values():
        if len(adjacent) == 2:
            (a, ab), (b, ba) = adjacent
            neighbors[a].append((b, ab == ba))
            neighbors[b].append((a, ab == ba))
        elif len(adjacent) != 1:
            raise ValueError("세 면 이상이 공유하는 변이 있습니다.")
    result = triangles.copy()
    visited = {}
    for start in range(len(result)):
        if start in visited:
            continue
        component, pending = [], [(start, False)]
        while pending:
            i, flip = pending.pop()
            if i in visited:
                if visited[i] != flip:
                    raise ValueError("면의 방향을 일관되게 정할 수 없습니다.")
                continue
            visited[i] = flip
            component.append(i)
            if flip:
                result[i] = result[i, ::-1]
            pending.extend((j, flip ^ change) for j, change in neighbors[i])
        faces = result[component]
        a, b, c = points[faces].transpose(1, 0, 2)
        if (np.cross(b - a, c - a) * normals[faces].mean(1)).sum() < 0:
            result[component] = faces[:, ::-1]
    return result


def closed_scalp_indices(triangles, points):
    edges = [(int(a), int(b)) for face in triangles for a, b in zip(face, np.roll(face, -1))]
    counts = Counter(tuple(sorted(edge)) for edge in edges)
    # 기존 면과 반대 방향으로 돌아야 인접 면의 법선이 일관된다.
    following = {b: a for a, b in edges if counts[tuple(sorted((a, b)))] == 1}
    ring = [min(following)]
    while following[ring[-1]] != ring[0]:
        ring.append(following[ring[-1]])
        if len(ring) > len(following):
            raise ValueError("두피의 열린 변이 단일 고리를 이루지 않습니다.")
    if len(ring) != len(following):
        raise ValueError("두피에서 여러 테두리가 발견됐습니다.")

    # 비평면인 두피 테두리는 투영하면 일부 변이 포개진다. 테두리를 순서대로
    # 나누며 실제 3차원 삼각형 넓이의 합이 가장 작은 뚜껑을 찾는다.
    xyz = points[ring]
    size = len(ring)
    cost = np.zeros((size, size))
    split = np.zeros((size, size), dtype=int)
    for span in range(2, size):
        for i in range(size - span):
            j = i + span
            interior = np.arange(i + 1, j)
            area = np.linalg.norm(np.cross(xyz[interior] - xyz[i], xyz[j] - xyz[i]), axis=1)
            candidates = np.where(area > 1e-12, cost[i, interior] + cost[interior, j] + area, np.inf)
            best = candidates.argmin()
            cost[i, j], split[i, j] = candidates[best], interior[best]
    if not np.isfinite(cost[0, -1]):
        raise ValueError("두피 테두리에 유효한 삼각형을 만들 수 없습니다.")
    fill, pending = [], [(0, size - 1)]
    while pending:
        i, j = pending.pop()
        if j > i + 1:
            k = split[i, j]
            fill.append([ring[i], ring[k], ring[j]])
            pending.extend(((i, k), (k, j)))
    return np.vstack([triangles, fill]).astype(triangles.dtype)


def replace_views(doc, blob, replacements):
    """늘어난 인덱스 뷰를 포함해 모든 뷰를 4바이트 경계에 다시 배치한다."""
    result = bytearray()
    for index, view in enumerate(doc["bufferViews"]):
        start = view.get("byteOffset", 0)
        data = replacements.get(index)
        if data is None:
            data = blob[start:start + view["byteLength"]]
        result.extend(bytes(-len(result) % 4))
        view.update(byteOffset=len(result), byteLength=len(data))
        result.extend(data)
    result.extend(bytes(-len(result) % 4))
    return result
