"""원본 장면의 현재 프레임·카메라·해상도로 PNG를 렌더한다."""
from __future__ import annotations

import pathlib
import sys

import bpy


def main() -> None:
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
    scene = bpy.context.scene
    if scene.camera is None:
        raise RuntimeError("Blender 장면에 렌더 카메라를 지정한 뒤 다시 가져오세요.")
    if scene.render.use_freestyle and any(
        layer.use_freestyle and layer.freestyle_settings.mode == "SCRIPT"
        for layer in scene.view_layers
    ):
        raise RuntimeError("Freestyle Python 스크립트는 실행할 수 없습니다. 선 집합 모드로 저장하세요.")
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output)
    # 원본 compositor는 유지하되 입력 파일의 별도 저장 경로로 쓰지 않는다.
    for node_group in bpy.data.node_groups:
        for node in node_group.nodes:
            if node.bl_idname == "CompositorNodeOutputFile":
                node.mute = True
    scene_node_tree = getattr(scene, "node_tree", None)
    if scene_node_tree is not None:
        for node in scene_node_tree.nodes:
            if node.bl_idname == "CompositorNodeOutputFile":
                node.mute = True
    output.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.render.render(write_still=True)
    if result != {"FINISHED"} or not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("Blender가 요청한 PNG를 생성하지 못했습니다.")


if __name__ == "__main__":
    main()
