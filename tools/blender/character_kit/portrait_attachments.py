"""인물 2판의 이마·눈꺼풀 위에 다시 붙인 선 메시로 원래 얼굴 표정을 전달한다."""
import numpy as np

from .gltf_read import accessor_array


def projected_attachment(points, triangles, xy):
    """얼굴 정면을 지나는 삼각형 번호와 그 안에서의 좌표를 구한다."""
    a, b, c = points[triangles].transpose(1, 0, 2)
    u, v = b - a, c - a
    determinant = u[:, 0] * v[:, 1] - v[:, 0] * u[:, 1]
    valid = np.abs(determinant) > 1e-12
    attached, weights = [], []
    for x, y in xy:
        dx, dy = x - a[:, 0], y - a[:, 1]
        s = np.divide(dx * v[:, 1] - dy * v[:, 0], determinant, where=valid)
        t = np.divide(u[:, 0] * dy - u[:, 1] * dx, determinant, where=valid)
        inside = np.flatnonzero(valid & (s >= 0) & (t >= 0) & (s + t <= 1))
        if not len(inside):
            raise ValueError("선 메시가 얼굴의 투영면 밖에 있습니다")
        depths = a[inside, 2] + s[inside] * u[inside, 2] + t[inside] * v[inside, 2]
        i = inside[np.argmax(depths)]
        attached.append(triangles[i])
        weights.append([1 - s[i] - t[i], s[i], t[i]])
    return np.asarray(attached), np.asarray(weights)


def front_depth(points, triangles, xy):
    vertices, weights = projected_attachment(points, triangles, xy)
    return (points[vertices, 2] * weights).sum(axis=1)


def position_deltas(doc, binary, index):
    """기존 키트의 SHORT 정규화 및 sparse POSITION을 glTF 단위로 복원한다."""
    accessor = doc["accessors"][index]
    if accessor["componentType"] != 5122 or not accessor.get("normalized"):
        raise ValueError("지원하지 않는 원본 키트 표정 인코딩")
    count = accessor["count"]
    if "bufferView" in accessor:
        dense = accessor_array(doc, binary, index)
    else:
        dense = np.zeros((count, 3), dtype="<i2")
    if "sparse" in accessor:
        sparse = accessor["sparse"]
        ids, vals = sparse["indices"], sparse["values"]
        length = sparse["count"]
        offset = lambda spec: doc["bufferViews"][spec["bufferView"]].get("byteOffset", 0) + spec.get("byteOffset", 0)
        indices = np.frombuffer(binary, {5121: "u1", 5123: "<u2", 5125: "<u4"}[ids["componentType"]], count=length, offset=offset(ids))
        dense[indices] = np.frombuffer(binary, "<i2", count=length * 3, offset=offset(vals)).reshape(-1, 3)
    return np.maximum(dense.astype(float) / 32767, -1)


def bind_line_targets(doc, blob, original, surface, triangles, head_targets, mesh, updated):
    """실제 접점의 머리 모프를 선형 보간한다. 눈꺼풀이 닫혀도 눈썹·아이라인이 피부 안으로 들어가지 않는다."""
    points, weights = projected_attachment(surface, triangles, updated[:, :2])
    projected_z = (surface[points, 2] * weights).sum(axis=1)
    for i in np.flatnonzero(projected_z < updated[:, 2] - .004):
        # 눈 구멍으로 빠진 광선은 뒤통수 대신 해당 안검의 세 가까운 점에 붙인다.
        dist2 = ((surface - updated[i]) ** 2).sum(axis=1)
        near = np.argpartition(dist2, 2)[:3]
        distances = 1 / np.maximum(dist2[near], 1e-12)
        points[i], weights[i] = near, distances / distances.sum()
    primitive = mesh["primitives"][0]
    brow = mesh["name"] in ("TS_Brow_L", "TS_Brow_R")
    if brow:
        uv = accessor_array(doc, original, primitive["attributes"]["TEXCOORD_0"])
        centers = np.flatnonzero(np.isclose(uv[:, 1], .5))
        center_for_vertex = centers[np.abs(uv[:, 0, None] - uv[centers, 0]).argmin(1)]
    for name, target in zip(mesh["extras"]["targetNames"], primitive["targets"]):
        head = position_deltas(doc, original, head_targets[name]["POSITION"])
        delta = (head[points] * weights[:, :, None]).sum(axis=1).astype("<f4")
        if brow and head.any():
            # 눈썹은 중심선을 따라 움직인다. 피부를 따라 안쪽·바깥쪽 선을 각각 당기면 윙크가 눈썹을 두껍게 펴 버린다.
            delta[:, :2] = delta[center_for_vertex, :2]
            depth = front_depth(surface + head, triangles, updated[:, :2] + delta[:, :2])
            delta[:, 2] = depth + .00065 - updated[:, 2]
        if np.allclose(delta, position_deltas(doc, original, target["POSITION"]), rtol=0, atol=1e-7):
            continue
        accessor = {"componentType": 5126, "type": "VEC3", "count": len(delta),
                    "min": delta.min(0).tolist(), "max": delta.max(0).tolist()}
        if delta.any():
            doc["bufferViews"].append({"buffer": 0, "byteOffset": len(blob), "byteLength": delta.nbytes})
            blob.extend(delta.tobytes())
            accessor["bufferView"] = len(doc["bufferViews"]) - 1
        doc["accessors"].append(accessor)
        target["POSITION"] = len(doc["accessors"]) - 1
