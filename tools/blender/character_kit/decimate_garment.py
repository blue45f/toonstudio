"""정리된 의상 GLB를 목표 삼각형 수로 줄인다 (bpy).

사용:
    <venv>/bin/python -I decimate_garment.py <입력.glb> <출력.glb> --target-tris 6500

파츠 GLB는 1.5 MiB 한도이고 morph 18개가 정점마다 따라붙으므로, 의상은 Rodin 원본(수만 삼각형)보다 훨씬 적은 정점이어야 한다.
Blender 가져오기가 UV 이음매마다 정점을 쪼개 두어 이음매가 "열린 가장자리"로 보호되므로 UV 섬 경계는 대체로 유지된다.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from character_kit.kit_common import cli_args, export_glb, flag_value, import_glb, mesh_objects, reset_scene  # noqa: E402


def triangle_count(obj):
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


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
    if before > target:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new("decimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = target / before
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    after = triangle_count(obj)
    export_glb(destination)
    print(f"DECIMATE_REPORT before={before} after={after} target={target}")


if __name__ == "__main__":
    sys.exit(main())
