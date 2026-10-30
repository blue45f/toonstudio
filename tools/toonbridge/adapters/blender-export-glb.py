"""평가된 메시와 Shape Key 보존 조건을 검사해 GLB로 내보낸다."""
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
        raise RuntimeError("GLB 출력 경로를 하나 지정하세요.") from error
    if output.suffix.lower() != ".glb":
        raise RuntimeError("출력 파일은 .glb여야 합니다.")
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("Blender 장면에 내보낼 메시가 없습니다.")
    has_shape_keys = any(obj.data.shape_keys is not None for obj in meshes)
    if has_shape_keys and any(
        modifier.show_viewport and modifier.type != "ARMATURE"
        for obj in meshes for modifier in obj.modifiers
    ):
        raise RuntimeError(
            "Shape Key와 모디파이어를 함께 유지할 수 없습니다. "
            "Blender에서 복사본의 모디파이어를 정리하거나 캐릭터 패키지로 내보내세요."
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_apply=not has_shape_keys,
        export_yup=True,
        export_animations=True,
    )
    if result != {"FINISHED"} or not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("Blender가 요청한 GLB를 생성하지 못했습니다.")


if __name__ == "__main__":
    main()
