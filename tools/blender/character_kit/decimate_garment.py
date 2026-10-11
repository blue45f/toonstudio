"""정리된 의상 GLB를 목표 삼각형 수로 줄인다 (bpy).

사용:
    <venv>/bin/python -I decimate_garment.py <입력.glb> <출력.glb> --target-tris 6500

파츠 GLB는 1.5 MiB 한도이고 morph 18개가 정점마다 따라붙으므로, 의상은 Rodin 원본(수만 삼각형)보다 훨씬 적은 정점이어야 한다.
Blender 가져오기는 UV 이음매마다 정점을 쪼개 둔다. 그대로 줄이면 이음매 양쪽이 서로 다른 정점을 합쳐 위치가 어긋나, 닫혀 있던 의상에
가늘고 긴 틈(슬릿)이 수십 개 생긴다(상의 하나가 열린 가장자리 루프 0개 → 60~100개로 늘었다). 그래서 줄이기 전에 같은 위치의 정점을
합친다. UV는 면 코너(loop)마다 따로 저장되므로 합쳐도 UV 섬 경계는 유지되고, 내보낼 때 글TF 쓰기가 이음매에서 정점을 다시 쪼갠다.
"""

import os
import sys

import bpy
import bmesh  # noqa: E402 — bpy를 먼저 불러와야 bmesh 경로가 잡힌다

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from character_kit.kit_common import cli_args, export_glb, flag_value, import_glb, mesh_objects, reset_scene  # noqa: E402


WELD_DISTANCE = 1.0e-5  # 원본 좌표(전신 약 1 단위) 기준 0.01 mm 수준: 같은 자리 정점만 합친다


def triangle_count(obj):
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def weld_seam_vertices(obj, distance=WELD_DISTANCE):
    """UV 이음매로 쪼개진 정점을 위치로 합쳐 닫힌 메시로 만든다. 합쳐진 정점 수를 돌려준다."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=distance)
    merged = before - len(bm.verts)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return merged


def main():
    args = cli_args()
    if len(args) < 2:
        raise SystemExit("사용법: -- <입력.glb> <출력.glb> --target-tris N")
    source, destination = args[0], args[1]
    target = flag_value(args, "--target-tris", 6500, int)

    reset_scene()
    import_glb(source)
    meshes = mesh_objects()
    if len(meshes) != 1:
        raise SystemExit(f"메시 1개여야 한다: {[m.name for m in meshes]}")
    obj = meshes[0]
    before = triangle_count(obj)
    welded = 0
    if before > target:
        welded = weld_seam_vertices(obj)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new("decimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = target / before
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    after = triangle_count(obj)
    export_glb(destination)
    print(f"DECIMATE_REPORT before={before} after={after} target={target} welded={welded}")


if __name__ == "__main__":
    sys.exit(main())
