"""검증된 GLB를 투명 정사영 PNG로 렌더한다. Blender --python 전용이다."""
import json
import hashlib
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


DEFAULT_CAMERA_DIRECTION = [1.6, -2.4, 1.7]
RIG_POLICY = "skinned-reference-21-v1"
RENDERER_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def camera_direction(job):
    value = job.get("cameraDirection", DEFAULT_CAMERA_DIRECTION)
    if (not isinstance(value, list) or len(value) != 3
            or any(type(number) not in (int, float) or abs(number) > 10 or not math.isfinite(number) for number in value)
            or not any(value)):
        raise ValueError("cameraDirection이 올바르지 않습니다.")
    return list(value)


def select_render_meshes(objects, rig_policy=None):
    objects = list(objects)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    if rig_policy is None:
        return meshes, []
    if rig_policy != RIG_POLICY:
        raise ValueError("알 수 없는 rigPolicy입니다.")
    rigs = [obj for obj in objects if obj.type == "ARMATURE"]
    if len(rigs) != 1 or len(rigs[0].data.bones) != 21 or len(rigs[0].pose.bones) != 21:
        raise ValueError("캐릭터의 단일 리그·21개 뼈 계약이 다릅니다.")
    rig = rigs[0]
    shapes = []
    for bone in rig.pose.bones:
        shape = bone.custom_shape
        if shape is None or any(shape is seen for seen in shapes):
            continue
        if shape.type != "MESH" or len(shape.vertex_groups) or any(mod.type == "ARMATURE" for mod in shape.modifiers):
            raise ValueError("본체와 리그 표시용 형상을 구분할 수 없습니다.")
        shapes.append(shape)
    bodies = [mesh for mesh in meshes if not any(mesh is shape for shape in shapes)]
    if len(bodies) != 1 or len(bodies[0].vertex_groups) != 21:
        raise ValueError("캐릭터의 본체 1개·가중치 그룹 21개 계약이 다릅니다.")
    modifiers = [mod for mod in bodies[0].modifiers if mod.type == "ARMATURE"]
    if len(modifiers) != 1 or modifiers[0].object is not rig:
        raise ValueError("캐릭터 본체가 원본 리그 하나에 연결되지 않았습니다.")
    # 참조된 실제 scene 객체만 반환한다. 다른 scene의 표시 객체는 변경하지 않는다.
    return bodies, [shape for shape in shapes if any(shape is obj for obj in objects)]


def verify_job_input(job):
    direction = camera_direction(job)
    if "rigPolicy" in job and job["rigPolicy"] != RIG_POLICY:
        raise ValueError("알 수 없는 rigPolicy입니다.")
    fingerprint = job.get("renderInputFingerprint")
    if fingerprint is None:
        if "cameraDirection" in job or "rigPolicy" in job:
            raise ValueError("신규 렌더 옵션에는 입력 지문이 필요합니다.")
        return None
    if (not isinstance(fingerprint, dict) or fingerprint.get("schema") != "toonstudio.creator-bundle-render-input.v2"
            or fingerprint.get("cameraDirection") != direction or fingerprint.get("rigPolicy") != job.get("rigPolicy")):
        raise ValueError("렌더 옵션이 입력 지문과 다릅니다.")
    camera_direction(fingerprint)
    if (fingerprint.get("renderModelSha256") != hashlib.sha256(Path(job["source"]).read_bytes()).hexdigest()
            or fingerprint.get("sourceModelSha256") != hashlib.sha256(Path(job["sourceOriginal"]).read_bytes()).hexdigest()
            or fingerprint.get("rendererSha256") != RENDERER_SHA256
            or hashlib.sha256(Path(__file__).read_bytes()).hexdigest() != RENDERER_SHA256):
        raise ValueError("렌더 입력·원본·renderer 실제 해시가 지문과 다릅니다.")
    return fingerprint


def render_job(job, output):
    fingerprint = verify_job_input(job)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=job["source"])
    meshes, shapes = select_render_meshes(bpy.context.scene.objects, job.get("rigPolicy"))
    if not meshes:
        raise ValueError("렌더할 메시가 없습니다: " + job["id"])
    for shape in shapes:
        shape.hide_render = True
    if job.get("rigPolicy") == RIG_POLICY:
        bpy.context.view_layer.update()
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
    bpy.ops.object.camera_add(location=center + Vector(camera_direction(job)).normalized() * radius * 5)
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
    if verify_job_input(job) != fingerprint:
        raise ValueError("렌더 중 입력 지문이 바뀌었습니다.")
    print("BUNDLE_RENDER " + job["id"], flush=True)
    entry = {
        "id": job["id"],
        "sourceModelSha256": hashlib.sha256(Path(job["source"]).read_bytes()).hexdigest(),
        "textureBindings": sorted(
            [{"materialName": b["materialName"], "sha256": b["sha256"]} for b in job.get("textureBindings", [])],
            key=lambda binding: binding["materialName"],
        ),
        "pngSha256": hashlib.sha256((output / (job["id"] + ".png")).read_bytes()).hexdigest(),
    }
    if fingerprint is not None:
        entry["renderInputFingerprint"] = fingerprint
        if job.get("rigPolicy") == RIG_POLICY:
            entry["rigChecks"] = {"bodyMeshes": 1, "bones": 21, "vertexGroups": 21,
                                  "excludedCustomShapes": sorted(shape.name for shape in shapes)}
    return entry


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    jobs = json.loads(Path(args[0]).read_text())
    output = Path(args[1])
    output.mkdir(parents=True, exist_ok=True)
    proof = {"schema": "toonstudio.creator-bundle-render-proof.v1", "assets": [render_job(job, output) for job in jobs]}
    (output / "render-proof.json").write_text(json.dumps(proof, indent=2))
