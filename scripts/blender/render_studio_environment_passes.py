"""Render ONLY the Cycles pass sets for the released refined-v6 environments.

The v6 pack shipped with manifest records that have no renderPasses entry:
the delivery run used --skip-passes, so the GLBs and thumbnails were released
without their beauty/depth/normal/AO sets and pack-contracts CI fails.

This script regenerates exactly those pass sets from the SHIPPED GLBs. It
never re-exports or overwrites a GLB (byteSize/sha256 in the manifest stay
valid). Scene setup (review camera per scene, lights, world, Cycles tuning)
and the compositor pass graph are copied verbatim from
refine_studio_environments_v6.py so the produced sets match what the
original pipeline would have emitted for the same scene: engine CYCLES,
samples 24, resolution 1000x750, beauty 8-bit, depth 16-bit, normal 16-bit,
AO 8-bit, depth remapped over the review camera clip range, normal remapped
from [-1, 1] to [0, 1].

Usage:
  blender -b --factory-startup -noaudio --python render_studio_environment_passes.py -- \
    --glb-dir apps/web/public/assets/3d/environments/refined-v6 \
    --out-dir  apps/web/public/assets/3d/environments/refined-v6 \
    [--scenes name1,name2]

Writes passes/<scene>/<kind>0001.png under --out-dir and a
render-passes-report.json (scene name -> renderPasses manifest entry) that
the caller merges into manifest.json.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

CAMERAS = {
    "compact_apartment_interior": ([8.8, 6.8, 9.6], [0, 1.25, 0], 44),
    "stylized_cafe_interior": ([11.4, 8.1, 12.8], [0, 1.35, 0.4], 44),
    "urban_neon_alley": ([0, 5.7, 19], [0, 2.55, -1], 44),
    "classroom_art_studio": ([12.8, 9.4, 14.2], [0, 1.45, 0], 44),
    "fantasy_ruin_courtyard": ([14.7, 11.2, 16.5], [0, 2, 0], 44),
    "scifi_command_corridor": ([0, 4.9, 20.5], [0, 2, -2.8], 44),
    "hospital_emergency_nurse_station": ([14.2, 9.4, 14.5], [0, 1.35, -1], 46),
    "korean_school_rooftop": ([18, 12, 18.5], [0, 1.15, -0.2], 46),
    "hanok_market_courtyard": ([18.5, 11.8, 19], [0, 1.45, -0.7], 46),
    "korean_convenience_store_night": ([8.8, 8.4, 17.8], [0, 1.35, 0.15], 43),
    "seoul_subway_platform": ([-2.3, 2.25, 9.25], [0.2, 1.75, -3], 38),
    "fantasy_alchemist_workshop_library": ([15.2, 10.6, 17], [0, 2.05, -0.25], 46),
}

RENDER_PASSES = ("beauty", "depth", "normal", "ao")
PASS_COLOR_DEPTH = {"beauty": "8", "depth": "16", "normal": "16", "ao": "8"}


def y_up(value):
    return Vector((value[0], -value[2], value[1]))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    for obj in imported:
        matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = matrix
    meshes = [obj for obj in imported if obj.type == "MESH"]
    for obj in list(imported):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    return meshes


def review_setup(name, resolution, samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.06
    scene.cycles.max_bounces = 5
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2
    scene.render.resolution_x = resolution
    scene.render.resolution_y = round(resolution * 0.75)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0
    world = bpy.data.worlds.new("ReviewNeutralWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.62, 0.72, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
    scene.world = world
    position, target, fov = CAMERAS[name]
    bpy.ops.object.camera_add(location=y_up(position))
    camera = bpy.context.object
    camera.name = "ReviewCamera"
    camera.rotation_euler = (y_up(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "PERSP"
    camera.data.lens_unit = "FOV"
    camera.data.angle = math.radians(fov)
    camera.data.clip_end = 150
    scene.camera = camera
    for label, location, power, size, color in [
        ("Key", (-6, -5, 11), 1800, 8, (1.0, 0.87, 0.74)),
        ("Fill", (7, -2, 8), 1300, 7, (0.76, 0.86, 1.0)),
        ("Top", (0, 6, 10), 1800, 7, (1.0, 0.96, 0.88)),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = "Review" + label
        light.data.energy = power
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (y_up(target) - light.location).to_track_quat("-Z", "Y").to_euler()
    if name in {"seoul_subway_platform", "scifi_command_corridor"}:
        # A shared inspection light inside closed ceilings reveals both source
        # and revised materials. It is never exported with the model.
        bpy.ops.object.light_add(type="AREA", location=(0, -2, 3.6))
        light = bpy.context.object
        light.name = "ReviewInteriorFill"
        light.data.energy = 850
        light.data.size = 6


def configure_render_passes():
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    view_layer.use_pass_z = True
    view_layer.use_pass_normal = True
    view_layer.use_pass_ambient_occlusion = True
    scene.use_nodes = True
    tree = scene.node_tree
    tree.nodes.clear()
    render_layers = tree.nodes.new("CompositorNodeRLayers")
    output = tree.nodes.new("CompositorNodeOutputFile")
    output.format.file_format = "PNG"
    output.format.color_mode = "RGB"
    output.file_slots[0].path = RENDER_PASSES[0]
    for kind in RENDER_PASSES[1:]:
        output.file_slots.new(kind)
    for index, kind in enumerate(RENDER_PASSES):
        slot = output.file_slots[index]
        slot.use_node_format = False
        slot.format.file_format = "PNG"
        slot.format.color_mode = "RGB"
        slot.format.color_depth = PASS_COLOR_DEPTH[kind]
    links = tree.links
    links.new(render_layers.outputs["Image"], output.inputs[0])
    camera = scene.camera
    depth_range = tree.nodes.new("CompositorNodeMapRange")
    depth_range.inputs["From Min"].default_value = camera.data.clip_start
    depth_range.inputs["From Max"].default_value = camera.data.clip_end
    depth_range.inputs["To Min"].default_value = 0.0
    depth_range.inputs["To Max"].default_value = 1.0
    links.new(render_layers.outputs["Depth"], depth_range.inputs["Value"])
    links.new(depth_range.outputs["Value"], output.inputs[1])
    normal_range = tree.nodes.new("CompositorNodeMapRange")
    normal_range.inputs["From Min"].default_value = -1.0
    normal_range.inputs["From Max"].default_value = 1.0
    normal_range.inputs["To Min"].default_value = 0.0
    normal_range.inputs["To Max"].default_value = 1.0
    links.new(render_layers.outputs["Normal"], normal_range.inputs["Value"])
    links.new(normal_range.outputs["Value"], output.inputs[2])
    links.new(render_layers.outputs["AO"], output.inputs[3])
    return output


def render_pass_set(name, out_dir):
    scene = bpy.context.scene
    if scene.camera is None:
        raise ValueError("Review camera is required")
    passes_dir = out_dir / "passes" / name
    passes_dir.mkdir(parents=True, exist_ok=True)
    output = configure_render_passes()
    output.base_path = str(passes_dir)
    # The main still is a scratch copy of beauty; the compositor file output
    # is the deliverable.
    scene.render.filepath = str(passes_dir / "_beauty-still.png")
    bpy.ops.render.render(write_still=True)
    scene.use_nodes = False
    frame = str(scene.frame_current).zfill(4)
    files = {}
    for kind in RENDER_PASSES:
        relative = "passes/" + name + "/" + kind + frame + ".png"
        if not (out_dir / relative).is_file():
            raise ValueError("Render pass was not written: " + relative)
        files[kind] = relative
    for scratch in (passes_dir / "_beauty-still.png",
                    passes_dir / ("_beauty-still" + frame + ".png")):
        if scratch.is_file():
            scratch.unlink()
    return {"engine": "CYCLES", "directory": "passes/" + name, "files": files,
        "colorDepth": dict(PASS_COLOR_DEPTH),
        "depthRange": [scene.camera.data.clip_start, scene.camera.data.clip_end],
        "normalRange": [-1.0, 1.0],
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "samples": scene.cycles.samples}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb-dir", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--scenes", default="all")
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--resolution", type=int, default=1000)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

    glb_dir = Path(args.glb_dir).resolve()
    out_dir = Path(args.out_dir).resolve()
    names = list(CAMERAS) if args.scenes == "all" else args.scenes.split(",")
    report_path = out_dir / "render-passes-report.json"
    report = {}
    if report_path.is_file():
        report = json.loads(report_path.read_text())
    for name in names:
        if name not in CAMERAS:
            raise ValueError("Unknown source environment: " + name)
        glb_path = glb_dir / (name + ".glb")
        if not glb_path.is_file():
            raise ValueError("Shipped GLB missing: " + str(glb_path))
        reset_scene()
        meshes = import_glb(glb_path)
        if not meshes:
            raise ValueError("No meshes imported from " + str(glb_path))
        review_setup(name, args.resolution, args.samples)
        report[name] = render_pass_set(name, out_dir)
        report_path.write_text(json.dumps(report, indent=2) + "\n")
        print("PASSES_RENDERED " + name + " " + json.dumps(report[name]), flush=True)
    print("ALL_PASSES_DONE " + ",".join(names), flush=True)


if __name__ == "__main__":
    main()
