"""GLB 정사영 미리보기 렌더러 (Blender 헤드리스).

사용:
    blender --background --python render_preview.py -- <입력.glb[,입력2.glb…]> <출력접두사> [--res 768] [--views front,side,back,three]

GLB를 가져와 모든 메시의 월드 경계 상자를 구하고 정사영 카메라로 정면·측면·배면·3/4 뷰를 PNG로 낸다.
Workbench 엔진(텍스처 색)만 쓰므로 GPU 없이 빠르게 돈다. glTF +Y(위)·+Z(앞)는 Blender로 들어오며
+Z(위)·-Y(앞)가 되므로 정면 카메라는 -Y 쪽에 둔다. 결과 경계 상자(미터)는 표준 출력에 JSON 한 줄로 낸다.
"""

import json
import math
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(argv) < 2:
        raise SystemExit("사용법: -- <입력.glb> <출력접두사> [--res 768] [--views front,side,back,three]")
    options = {"res": 768, "views": ["front", "side", "back", "three"]}
    rest = argv[2:]
    for index, token in enumerate(rest):
        if token == "--res":
            options["res"] = int(rest[index + 1])
        if token == "--views":
            options["views"] = rest[index + 1].split(",")
    return argv[0], argv[1], options


def world_bounds(objects):
    low = Vector((math.inf,) * 3)
    high = Vector((-math.inf,) * 3)
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            low = Vector(min(a, b) for a, b in zip(low, world))
            high = Vector(max(a, b) for a, b in zip(high, world))
    return low, high


def main():
    source, prefix, options = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for path in source.split(","):
        bpy.ops.import_scene.gltf(filepath=path)
    # glTF 가져오기가 본 표시용으로 만드는 "Icosphere"류 도우미 오브젝트와 헤어 LOD1·LOD2(LOD0과 겹쳐 보인다)는 렌더에서 뺀다.
    meshes = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith("Icosphere") or "_LOD1" in obj.name or "_LOD2" in obj.name:
            obj.hide_render = True
            obj.hide_viewport = True
            continue
        meshes.append(obj)
    if not meshes:
        raise SystemExit("메시가 없다: " + source)
    low, high = world_bounds(meshes)
    center = (low + high) / 2
    extent = high - low
    scale = max(extent) * 1.15

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = options["res"]
    scene.render.resolution_y = options["res"]
    scene.render.film_transparent = False
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.show_backface_culling = False
    scene.world = bpy.data.worlds.new("preview")
    scene.world.color = (0.82, 0.84, 0.88)

    camera_data = bpy.data.cameras.new("preview")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = scale
    camera = bpy.data.objects.new("preview", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    distance = max(extent) * 3

    # 뷰 이름 → (카메라 위치 방향, 오일러 회전 도). 정면 = -Y 쪽에서 +Y를 본다.
    views = {
        "front": (Vector((0, -1, 0)), (90, 0, 0)),
        "back": (Vector((0, 1, 0)), (90, 0, 180)),
        "side": (Vector((1, 0, 0)), (90, 0, 90)),
        "three": (Vector((0.7, -0.7, 0.25)).normalized(), (80, 0, 45)),
    }
    for name in options["views"]:
        direction, rotation = views[name]
        camera.location = center + direction * distance
        camera.rotation_euler = tuple(math.radians(deg) for deg in rotation)
        scene.render.filepath = f"{prefix}_{name}.png"
        bpy.ops.render.render(write_still=True)

    print(
        "PREVIEW_BOUNDS "
        + json.dumps(
            {
                "min": [round(v, 4) for v in low],
                "max": [round(v, 4) for v in high],
                "extent": [round(v, 4) for v in extent],
                "meshes": [obj.name for obj in meshes],
                "triangles": sum(max(0, len(poly.vertices) - 2) for obj in meshes for poly in obj.data.polygons),
            }
        )
    )


main()
