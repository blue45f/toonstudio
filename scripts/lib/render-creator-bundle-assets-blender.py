"""검증된 GLB를 투명 정사영 PNG로 렌더한다. Blender --python 전용이다."""
import json
import hashlib
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def render_job(job, output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=job["source"])
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise ValueError("렌더할 메시가 없습니다: " + job["id"])
    for binding in job.get("textureBindings", []):
        source = Path(binding["source"])
        if hashlib.sha256(source.read_bytes()).hexdigest() != binding["sha256"]:
            raise ValueError("재질 원본 해시가 다릅니다: " + job["id"])
        material = bpy.data.materials.get(binding["materialName"])
        if material is None:
            raise ValueError("원본 재질이 없습니다: " + binding["materialName"])
        material.use_nodes = True
        shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        texture.image = bpy.data.images.load(str(source), check_existing=True)
        texture.interpolation = "Closest"
        material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (low + high) / 2
    radius = max((p - center).length for p in points)
    if not math.isfinite(radius) or radius <= 0:
        raise ValueError("모델 경계가 올바르지 않습니다: " + job["id"])
    # 정사영의 투영 경계를 직접 재서 긴 가로형 소품도 잘리지 않게 한다.
    bpy.ops.object.camera_add(location=center + Vector((1.6, -2.4, 1.7)).normalized() * radius * 5)
    camera = bpy.context.object
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.clip_end = radius * 20 + 100
    camera.data.clip_start = max(radius / 1000, 0.0001)
    rotation = camera.rotation_euler.to_matrix().transposed()
    projected = [rotation @ (p - center) for p in points]
    camera.data.ortho_scale = max(max(p[i] for p in projected) - min(p[i] for p in projected) for i in (0, 1)) * 1.18
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.color_depth = "8"
    scene.world = bpy.data.worlds.new("번들 렌더 환경")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.7, 0.75, 0.85, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65
    for direction, energy, size in [((3, -4, 6), 500, 4), ((-4, -1, 3), 180, 5), ((1, 4, 5), 280, 3)]:
        bpy.ops.object.light_add(type="AREA", location=center + Vector(direction) * radius)
        light = bpy.context.object
        light.data.energy = energy * radius * radius
        light.data.shape = "DISK"
        light.data.size = size * radius
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = scene.render.resolution_y = 1536
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(output / (job["id"] + ".png"))
    bpy.ops.render.render(write_still=True)
    if not Path(scene.render.filepath).is_file():
        raise RuntimeError("렌더 파일이 생성되지 않았습니다: " + job["id"])
    print("BUNDLE_RENDER " + job["id"], flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    jobs = json.loads(Path(args[0]).read_text())
    output = Path(args[1])
    output.mkdir(parents=True, exist_ok=True)
    for job in jobs:
        render_job(job, output)
    proof = {"schema": "toonstudio.creator-bundle-render-proof.v1", "assets": []}
    for job in jobs:
        proof["assets"].append({
            "id": job["id"],
            "sourceModelSha256": hashlib.sha256(Path(job["source"]).read_bytes()).hexdigest(),
            "textureBindings": sorted(
                [{"materialName": b["materialName"], "sha256": b["sha256"]} for b in job.get("textureBindings", [])],
                key=lambda binding: binding["materialName"],
            ),
            "pngSha256": hashlib.sha256((output / (job["id"] + ".png")).read_bytes()).hexdigest(),
        })
    (output / "render-proof.json").write_text(json.dumps(proof, indent=2))
