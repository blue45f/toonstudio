"""실제 Blender에서 카메라·프레임·형상·선화와 실패 경로를 검증한다.

저장소 루트에서 Blender --background --factory-startup --disable-autoexec
--python-exit-code 42 --python tools/toonbridge/test/blender-adapters.integration.py로 실행한다.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import runpy
import shutil
import struct
import subprocess
import sys
from tempfile import TemporaryDirectory

import bpy

ADAPTERS = Path(__file__).resolve().parents[1] / "adapters"


def run_adapter(name: str, output: Path) -> None:
    original = sys.argv
    try:
        sys.argv = [str(ADAPTERS / name), "--", str(output)]
        runpy.run_path(str(ADAPTERS / name), run_name="__main__")
    finally:
        sys.argv = original


def glb_json(path: Path) -> dict:
    data = path.read_bytes()
    assert data[:4] == b"glTF" and struct.unpack_from("<I", data, 4)[0] == 2
    assert struct.unpack_from("<I", data, 8)[0] == len(data)
    length, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == 0x4E4F534A
    return json.loads(data[20:20 + length])


def expect_error(name: str, output: Path, message: str) -> None:
    try:
        run_adapter(name, output)
    except RuntimeError as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError("실패해야 할 Blender 작업이 성공했습니다.")


def compositor_fixture(scene, outside: Path) -> None:
    """원본 compositor의 색상 보정과 별도 파일 출력을 실제로 연결한다."""
    scene.use_nodes = True
    modern_compositor = hasattr(scene, "compositing_node_group")
    if modern_compositor:
        tree = bpy.data.node_groups.new("ToonBridgeSourceCompositor", "CompositorNodeTree")
        scene.compositing_node_group = tree
        tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        target = tree.nodes.new("NodeGroupOutput")
    else:
        tree = scene.node_tree
        tree.nodes.clear()
        target = tree.nodes.new("CompositorNodeComposite")
    # 상수 색상 대신 실제 이미지로 출력 경로를 실행하고 주 이미지의 색상 보정도 검증한다.
    rendered = tree.nodes.new("CompositorNodeRLayers")
    correction = tree.nodes.new("CompositorNodeInvert")
    factor = correction.inputs.get("Factor") or correction.inputs.get("Fac")
    assert factor is not None, "색상 보정의 강도 입력이 없습니다."
    factor.default_value = 1.0
    invert_color = correction.inputs.get("Invert Color")
    if invert_color is not None:
        invert_color.default_value = True
    else:
        correction.invert_rgb = True
    invert_alpha = correction.inputs.get("Invert Alpha")
    if invert_alpha is not None:
        invert_alpha.default_value = False
    else:
        correction.invert_alpha = False
    tree.links.new(rendered.outputs["Image"], correction.inputs["Color"])
    tree.links.new(correction.outputs["Color"], target.inputs["Image"])
    extra = tree.nodes.new("CompositorNodeOutputFile")
    if modern_compositor:
        extra.directory = str(outside)
        extra.file_name = "source-compositor"
        # Blender 5의 빈 확장 소켓에 연결하는 대신 실제 파일 출력 항목을 만든다.
        extra.file_output_items.clear()
        extra.file_output_items.new("RGBA", "Image")
        assert len(extra.file_output_items) == 1
        file_input = extra.inputs["Image"]
    else:
        extra.base_path = str(outside)
        extra.file_slots[0].path = "source-compositor"
        file_input = extra.inputs[0]
    tree.links.new(correction.outputs["Color"], file_input)
    scene.render.use_compositing = True


def image_pixels(path: Path) -> list[float]:
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        return list(image.pixels)
    finally:
        bpy.data.images.remove(image)


def main() -> None:
    with TemporaryDirectory(prefix="toonbridge-blender-integration-") as temporary:
        directory = Path(temporary)
        bpy.ops.wm.read_factory_settings(use_empty=False)
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 1
        scene.render.resolution_x = 96
        scene.render.resolution_y = 80
        scene.render.resolution_percentage = 100
        scene.frame_set(7)
        camera = scene.camera
        cube = bpy.data.objects["Cube"]
        modifier = cube.modifiers.new("Subdivision", "SUBSURF")
        modifier.levels = 1
        modifier.render_levels = 1
        outside = directory / "source-compositor-output"
        outside.mkdir()
        compositor_fixture(scene, outside)
        source = directory / "fixture.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(source))
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()

        baseline = directory / "baseline.png"
        scene.render.filepath = str(baseline)
        scene.render.image_settings.file_format = "PNG"
        bpy.ops.render.render(write_still=True)
        assert any(path.is_file() for path in outside.rglob("*")), "원본의 별도 출력 fixture가 실행되지 않았습니다."
        baseline_pixels = image_pixels(baseline)
        shutil.rmtree(outside)
        outside.mkdir()

        render = directory / "render.png"
        run_adapter("blender-render-scene.py", render)
        assert scene.frame_current == 7 and scene.camera is camera
        assert (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) == (96, 80, 100)
        assert struct.unpack_from(">II", render.read_bytes(), 16) == (96, 80)
        assert image_pixels(render) == baseline_pixels, "원본 compositor의 주 이미지가 변경됐습니다."
        assert not any(path.is_file() for path in outside.rglob("*")), "원본 compositor가 별도 파일을 썼습니다."

        glb = directory / "scene.glb"
        run_adapter("blender-export-glb.py", glb)
        document = glb_json(glb)
        triangles = sum(
            document["accessors"][primitive["indices"]]["count"] // 3
            for mesh in document["meshes"] for primitive in mesh["primitives"]
        )
        assert triangles > 12, "Subdivision 모디파이어가 GLB에서 누락되었습니다."

        line_art = directory / "line-art.png"
        run_adapter("blender-line-art.py", line_art)
        assert scene.frame_current == 7 and scene.camera is camera
        assert struct.unpack_from(">II", line_art.read_bytes(), 16) == (96, 80)
        image = bpy.data.images.load(str(line_art), check_existing=False)
        pixels = list(image.pixels)
        dark_pixels = sum(1 for i in range(0, len(pixels), 4) if max(pixels[i:i + 3]) < 0.5)
        white_pixels = sum(1 for i in range(0, len(pixels), 4) if min(pixels[i:i + 3]) > 0.95)
        bpy.data.images.remove(image)
        assert dark_pixels > 0 and white_pixels > 0, "검정 선과 흰 배경을 확인할 수 없습니다."

        bpy.ops.wm.open_mainfile(filepath=str(source))
        scene = bpy.context.scene
        scene.render.use_freestyle = True
        scene.view_layers[0].use_freestyle = True
        scene.view_layers[0].freestyle_settings.mode = "SCRIPT"
        expect_error("blender-render-scene.py", directory / "script-mode.png", "스크립트")
        scene.view_layers[0].freestyle_settings.mode = "EDITOR"
        scene.camera = None
        expect_error("blender-render-scene.py", directory / "no-camera.png", "카메라")
        expect_error("blender-line-art.py", directory / "no-camera-line.png", "카메라")
        no_camera_source = directory / "no-camera.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(no_camera_source))
        failed_output = directory / "failed-cli.png"
        failed = subprocess.run([
            bpy.app.binary_path, "--background", "--factory-startup", "--disable-autoexec",
            "--python-exit-code", "42", str(no_camera_source), "--python",
            str(ADAPTERS / "blender-render-scene.py"), "--", str(failed_output),
        ], capture_output=True, text=True, check=False)
        assert failed.returncode == 42, failed.stdout + failed.stderr
        assert not failed_output.exists(), "실패한 CLI가 결과 파일을 생성했습니다."
        cube = bpy.data.objects["Cube"]
        cube.shape_key_add(name="Basis")
        smile = cube.shape_key_add(name="Smile")
        smile.data[0].co.z += 0.2
        expect_error("blender-export-glb.py", directory / "conflict.glb", "Shape Key")
        cube.modifiers.clear()
        morph_glb = directory / "morph.glb"
        run_adapter("blender-export-glb.py", morph_glb)
        assert any(
            primitive.get("targets")
            for mesh in glb_json(morph_glb)["meshes"] for primitive in mesh["primitives"]
        ), "Shape Key가 GLB에서 누락되었습니다."
        assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
        print("RESULT " + json.dumps({
            "version": bpy.app.version_string,
            "frame": 7,
            "size": [96, 80],
            "evaluatedTriangles": triangles,
            "lineArtDarkPixels": dark_pixels,
            "lineArtWhitePixels": white_pixels,
            "shapeKeysPreserved": True,
            "missingCameraRejected": True,
            "shapeModifierConflictRejected": True,
            "scriptModeRejected": True,
            "compositorMainImagePreserved": True,
            "compositorExtraOutputBlocked": True,
            "pythonFailureExitCode": failed.returncode,
            "sourceUnchanged": True,
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
