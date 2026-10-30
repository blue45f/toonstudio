"""원본 카메라·해상도로 흰 표면과 검정 Freestyle 선화를 렌더한다."""
from __future__ import annotations

import pathlib
import sys

import bpy


def output_path() -> pathlib.Path:
    try:
        separator = sys.argv.index("--")
        arguments = sys.argv[separator + 1:]
        if len(arguments) != 1:
            raise ValueError("출력 경로가 하나여야 합니다.")
        output = pathlib.Path(arguments[0]).resolve(strict=False)
    except (ValueError, IndexError) as error:
        raise RuntimeError("PNG 출력 경로를 하나 지정하세요.") from error
    if output.suffix.lower() != ".png":
        raise RuntimeError("출력 파일은 .png여야 합니다.")
    return output


def select_render_engine(scene) -> None:
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            return
        except TypeError:
            continue
    raise RuntimeError("Freestyle을 지원하는 Eevee 엔진이 필요합니다.")


def white_emission_material():
    material = bpy.data.materials.new("ToonBridgeLineArtWhite")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    emission.inputs["Strength"].default_value = 1.0
    material.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def configure_white_world(scene) -> None:
    scene.world = bpy.data.worlds.new("ToonBridgeLineArtWorld")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background is None:
        background = scene.world.node_tree.nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    background.inputs["Strength"].default_value = 1.0


def configure_freestyle(scene) -> None:
    scene.render.use_freestyle = True
    for view_layer in scene.view_layers:
        settings = view_layer.freestyle_settings
        view_layer.use_freestyle = True
        settings.mode = "EDITOR"
        for line_set in list(settings.linesets):
            settings.linesets.remove(line_set)
        settings.linesets.new("ToonBridgeLineArt")
        for line_set in settings.linesets:
            line_set.show_render = True
            line_set.select_by_visibility = True
            line_set.visibility = "VISIBLE"
            line_set.select_by_edge_types = True
            line_set.select_silhouette = True
            line_set.select_border = True
            line_set.select_crease = True
            line_set.linestyle.color = (0.0, 0.0, 0.0)
            line_set.linestyle.thickness = 1.5


def main() -> None:
    output = output_path()
    scene = bpy.context.scene
    if scene.camera is None:
        raise RuntimeError("Blender 장면에 렌더 카메라를 지정한 뒤 다시 가져오세요.")
    select_render_engine(scene)
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(output)
    scene.render.use_compositing = False
    scene.render.use_sequencer = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    configure_white_world(scene)

    material = white_emission_material()
    for obj in scene.objects:
        materials = getattr(getattr(obj, "data", None), "materials", None)
        if materials is not None:
            materials.clear()
            materials.append(material)

    configure_freestyle(scene)
    output.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.render.render(write_still=True)
    if result != {"FINISHED"} or not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("Blender가 요청한 선화 이미지를 생성하지 못했습니다.")


if __name__ == "__main__":
    main()
