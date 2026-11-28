"""실제 BG3D 템플릿 도형을 펼쳐 배치 카드에 쓸 WebP 이미지를 렌더링한다.

blender -b -t 2 --python-exit-code 1 -P scripts/blender/render_scene_template_previews.py -- --out apps/web/public/assets/studio/scene-template-previews
"""
import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
# 좌표·부품·지오메트리는 편집기가 배치할 때와 같은 소스에서 가져온다.
EXPORT = """
import { BG_SCENE_TEMPLATES, instantiateSceneTemplate } from "./apps/web/src/domains/creator/studio-background-3d-scene-templates";
import { PRIMITIVE_DEFS, makeGeometry } from "./apps/web/src/domains/creator/studio-background-3d-primitives";
const geometries = Object.fromEntries(Object.keys(PRIMITIVE_DEFS).map(kind => {
  const geometry = makeGeometry(kind);
  return [kind, { positions: Array.from(geometry.attributes.position.array), indices: Array.from(geometry.index.array) }];
}));
const scenes = BG_SCENE_TEMPLATES.map(template => ({
  id: template.id, primitives: instantiateSceneTemplate(template, 0),
}));
process.stdout.write(JSON.stringify({ geometries, scenes }));
"""


def build_mesh(kind, geometry):
    positions = geometry["positions"]
    indices = geometry["indices"]
    mesh = bpy.data.meshes.new(kind)
    mesh.from_pydata(
        [positions[i:i + 3] for i in range(0, len(positions), 3)],
        [],
        [indices[i:i + 3] for i in range(0, len(indices), 3)],
    )
    mesh.update()
    return mesh


def render_card(scene, camera, meshes, template, output_dir):
    basis = Matrix.Rotation(math.pi / 2, 4, "X")
    objects = []
    for part in template["primitives"]:
        obj = bpy.data.objects.new(part["kind"], meshes[part["kind"]])
        scene.collection.objects.link(obj)
        objects.append(obj)
        # Three의 XYZ intrinsic 회전을 Blender의 extrinsic 순서에 맞춘다.
        obj.matrix_world = (
            basis @ Matrix.Translation(Vector(part["position"]))
            @ Euler(part["rotation"], "ZYX").to_matrix().to_4x4()
            @ Matrix.Diagonal(Vector([*part["scale"], 1]))
        )
        obj.color = (*[v / 255 for v in bytes.fromhex(part["color"][1:])], 1)
    bpy.context.view_layer.update()
    orientation = camera.rotation_euler.to_matrix()
    view = orientation.transposed()
    corners = [view @ (obj.matrix_world @ Vector(vertex)) for obj in objects for vertex in obj.bound_box]
    lower = Vector([min(p[i] for p in corners) for i in range(3)])
    upper = Vector([max(p[i] for p in corners) for i in range(3)])
    camera.location = orientation @ ((lower + upper) / 2 + Vector((0, 0, 100)))
    camera.data.ortho_scale = 1.08 * max(upper.x - lower.x, (upper.y - lower.y) * 1.5)
    scene.render.filepath = str(output_dir / (template["id"] + ".webp"))
    bpy.ops.render.render(write_still=True)
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)


def main():
    parser = argparse.ArgumentParser(description="웹툰 배경 템플릿 미리보기 렌더")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    output_dir = (ROOT / args.out).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    result = subprocess.run([str(ROOT / "node_modules/.bin/tsx"), "-e", EXPORT],
                            cwd=ROOT, check=True, stdout=subprocess.PIPE)
    data = json.loads(result.stdout)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.studio_light = "paint.sl"
    shading.color_type = "OBJECT"
    shading.background_type = "WORLD"
    shading.show_shadows = False
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.curvature_ridge_factor = 0.85
    shading.curvature_valley_factor = 0.9
    shading.show_specular_highlight = False
    shading.show_object_outline = False
    scene.world = bpy.data.worlds.new("Paper")
    scene.world.color = (0.73, 0.76, 0.77)
    scene.display.render_aa = "16"
    scene.render.resolution_x, scene.render.resolution_y = 480, 320
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 85
    scene.view_settings.view_transform = "Standard"
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.clip_end = 1000
    camera.rotation_euler = Vector((-.46, 1, -.87)).to_track_quat("-Z", "Y").to_euler()
    meshes = {kind: build_mesh(kind, geometry) for kind, geometry in data["geometries"].items()}
    for template in data["scenes"]:
        render_card(scene, camera, meshes, template, output_dir)


if __name__ == "__main__":
    main()
