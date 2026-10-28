"""검증된 번들 모델을 바닥·건축·카메라가 있는 완성 장면으로 렌더한다."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def material(name, color):
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    result.use_nodes = True
    result.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = color
    result.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.85
    return result


def block(name, location, scale, surface):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(surface)


def add_model(model):
    raw = Path(model["source"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != model["sourceModelSha256"]:
        raise ValueError("장면 원본 해시가 다릅니다: " + model["assetId"])
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=model["source"])
    imported = set(bpy.context.scene.objects) - before
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise ValueError("장면에 넣을 메시가 없습니다.")
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    if high.z - low.z <= 0:
        raise ValueError("장면 모델 높이가 없습니다.")
    pivot = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    root = bpy.data.objects.new(model["assetId"], None)
    bpy.context.collection.objects.link(root)
    for obj in imported:
        if obj.parent not in imported:
            obj.parent = root
    root.matrix_world = (Matrix.Translation(Vector(model["position"]))
                         @ Matrix.Rotation(math.radians(model["rotationZ"]), 4, "Z")
                         @ Matrix.Scale(model["extent"] / max(high[i] - low[i] for i in range(3)), 4)
                         @ Matrix.Translation(-pivot))


def render(job, output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.world = bpy.data.worlds.new("장면 환경")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = job["skyColor"]
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
    floor = material("바닥", job["groundColor"])
    block("넓은 바닥", (0, 0, -0.16), (200, 200, 0.3), floor)
    if job["architecture"] == "garden-path":
        path = material("산책길", (0.61, 0.53, 0.40, 1))
        curb = material("산책길 경계", (0.78, 0.75, 0.65, 1))
        block("산책길", (0, 0, 0.005), (4.3, 200, 0.025), path)
        for x in [-2.25, 2.25]:
            block("낮은 경계석", (x, 0, 0.07), (0.17, 200, 0.14), curb)
    else:
        stones = [material("석벽" + str(i), (0.25 + i * 0.018, 0.23 + i * 0.018, 0.22 + i * 0.018, 1)) for i in range(4)]
        for row in range(7):
            for col in range(13):
                x = -6 + col + (0.5 if row % 2 else 0)
                block("서재 뒤 벽", (x, 5.2, row * 0.7 + 0.35), (0.97, 0.5, 0.67), stones[(row + col) % 4])
            for col in range(11):
                block("서재 옆 벽", (-6.4, -5 + col, row * 0.7 + 0.35), (0.5, 0.97, 0.67), stones[(row + col) % 4])
        tiles = material("바닥 줄눈", (0.32, 0.29, 0.25, 1))
        for i in range(-6, 7):
            block("타일 가로선", (i, 0, 0.005), (0.018, 15, 0.025), tiles)
            block("타일 세로선", (0, i, 0.005), (15, 0.018, 0.025), tiles)
    for model in job["models"]:
        add_model(model)
    target = Vector(job["camera"]["target"])
    bpy.ops.object.camera_add(location=job["camera"]["location"])
    camera = bpy.context.object
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = job["camera"]["lens"]
    camera.data.clip_end = 500
    scene.camera = camera
    for location, energy, size in [((2, -6, 12), 1100, 7), ((-6, -2, 6), 400, 6), ((4, 4, 9), 700, 5)]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.size = size
        light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x, scene.render.resolution_y = 2048, 1152
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.filepath = str(output / (job["id"] + ".png"))
    bpy.ops.render.render(write_still=True)
    path = Path(scene.render.filepath)
    if not path.is_file():
        raise RuntimeError("완성 장면 이미지가 없습니다.")
    return {"id": job["id"], "recipeSha256": job["recipeSha256"],
            "pngSha256": hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    jobs = json.loads(Path(args[0]).read_text())
    output = Path(args[1])
    output.mkdir(parents=True, exist_ok=True)
    proofs = [render(job, output) for job in jobs]
    (output / "render-proof.json").write_text(json.dumps({"schema": "toonstudio.creator-bundle-scene-proof.v1", "assets": proofs}, indent=2))
