"""내보낸 주인공 GLB의 재단선·접지와 양쪽 눈 표정의 독립성을 Blender에서 검증한다."""

import argparse
from collections import defaultdict
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils.kdtree import KDTree


def mesh_topology(mesh):
    # 스킨 역바인드와 11.5mm 리그 이동을 Blender가 다시 적용하면서 UV 시임의 float 끝자리가 달라진다.
    # 원래 좌표를 수정하지 않고 1µm 안에서만 동일한 정점을 찾아 연결을 검사한다.
    tree = KDTree(len(mesh.vertices))
    for v in mesh.vertices:
        tree.insert(v.co, v.index)
    tree.balance()
    positions = [min(hit[1] for hit in tree.find_range(v.co, .000001)) for v in mesh.vertices]
    mesh.calc_loop_triangles()
    edges = defaultdict(list)
    degenerate = 0
    links = defaultdict(list)
    for face in mesh.loop_triangles:
        a, b, c = face.vertices
        degenerate += face.area <= 1e-14
        va, vb, vc = (positions[i] for i in (a, b, c))
        for v, left, right in ((va, vb, vc), (vb, vc, va), (vc, va, vb)):
            links[v].append((left, right))
        for left, right in ((a, b), (b, c), (c, a)):
            points = (positions[left], positions[right])
            edge = tuple(sorted(points))
            edges[edge].append(edge[0] == points[0])
    pinched = 0
    for corners in links.values():
        ring = defaultdict(set)
        for left, right in corners:
            ring[left].add(right)
            ring[right].add(left)
        stack = [next(iter(ring))]
        seen = set(stack)
        while stack:
            for neighbor in ring[stack.pop()] - seen:
                seen.add(neighbor)
                stack.append(neighbor)
        pinched += len(seen) != len(ring)
    return {
        "pinchedVertices": pinched,
        "triangles": len(mesh.loop_triangles),
        "boundary": sum(len(faces) == 1 for faces in edges.values()),
        "overfull": sum(len(faces) > 2 for faces in edges.values()),
        "winding": sum(len(faces) == 2 and faces[0] == faces[1] for faces in edges.values()),
        "degenerate": degenerate,
        "looseEdges": sum(edge.is_loose for edge in mesh.edges),
        "unreferencedVertices": len(mesh.vertices) - len({v for face in mesh.polygons for v in face.vertices}),
    }


def check_winks(objects):
    result = {}
    for role in ("Eye", "Iris", "Lash", "Highlight"):
        obj = objects[f"TS_Shaper_{role}"]
        keys = obj.data.shape_keys.key_blocks
        for side, sign in (("Left", 1), ("Right", -1)):
            name = f"eyeBlink{side}_{role}"
            motion = [((b.co - a.co).length, a.co.x * sign > 0)
                      for a, b in zip(keys[0].data, keys[name].data, strict=True)]
            ipsilateral = max(d for d, same in motion if same)
            contralateral = max(d for d, same in motion if not same)
            if ipsilateral < .005 or contralateral > 1e-6 or keys[name].value != 0:
                raise ValueError(f"{name} 단독 윙크의 좌우 변위 또는 기본값 오류: {ipsilateral:.8f}, {contralateral:.8f}, {keys[name].value}")
            result[name] = {"activeMetres": ipsilateral, "otherSideMetres": contralateral}
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", type=Path, default=Path(__file__).resolve().parents[2] /
                        "apps/character-lab/public/assets/characters/shaper-atelier-protagonist/shaper-atelier-protagonist.glb")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.asset.resolve()), merge_vertices=False)
    # Blender가 뼈 표시용으로 별도 생성하는 Icosphere는 납품 GLB의 메시가 아니다.
    data = args.asset.read_bytes()
    json_size = struct.unpack_from("<I", data, 12)[0]
    nodes = json.loads(data[20:20 + json_size])["nodes"]
    objects = {node["name"]: bpy.context.scene.objects[node["name"]] for node in nodes if "mesh" in node}
    topology = {name: mesh_topology(obj.data) for name, obj in objects.items()}
    for name, metrics in topology.items():
        if metrics["boundary"] > 0:
            raise ValueError(f"{name}의 재단선 또는 눈 외곽이 열렸습니다: {metrics}")
        if any(metrics[k] for k in ("overfull", "winding", "degenerate", "looseEdges", "unreferencedVertices", "pinchedVertices")):
            raise ValueError(f"{name}의 면 연결을 확인하세요: {metrics}")
    sole = objects["TS_Shoes_loafers"].evaluated_get(bpy.context.evaluated_depsgraph_get())
    floor = min((sole.matrix_world @ vertex.co).z for vertex in sole.data.vertices)
    if abs(floor) > .00001:
        raise ValueError(f"밑창 접지점이 바닥과 맞지 않습니다: {floor:.7f}m")
    report = {"blender": bpy.app.version_string, "floorMetres": floor, "meshes": topology,
              "boundaryEdges": sum(v["boundary"] for v in topology.values()), "winks": check_winks(objects)}
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"재단과 접지 확인: {len(topology)}개 메시, 열린 경계 {report['boundaryEdges']}개 변, "
          f"바닥 {floor:.7f}m, 좌우 윙크 {len(report['winks'])}개")


if __name__ == "__main__":
    main()
