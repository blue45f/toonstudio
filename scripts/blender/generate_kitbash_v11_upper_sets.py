"""독립 Blender에서 V11 상부 배경 GLB를 생성한다. --asset으로 선택한 파일만 내보낸다."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import sys
import bpy
from mathutils import Vector


OUTPUT_DIR = (
    Path(__file__).resolve().parents[2]
    / "apps/web/public/studio-assets/kitbash-v11"
)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_material(
    name: str, rgba: tuple[float, float, float, float], roughness: float, metallic: float
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


def add_beveled_box(
    name: str,
    size: tuple[float, float, float],
    loc: tuple[float, float, float],
    mat: bpy.types.Material,
    bevel_width: float = 0.008,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new(name="Bevel", type="BEVEL")
    bevel.width = bevel_width
    bevel.segments = 2
    obj.data.materials.append(mat)
    return obj


def add_cylinder(
    name: str,
    radius: float,
    depth: float,
    loc: tuple[float, float, float],
    rot_euler: tuple[float, float, float],
    mat: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24, radius=radius, depth=depth, location=loc, rotation=rot_euler
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def export_glb(filename: str) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filepath = OUTPUT_DIR / filename
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        export_apply=True,
        export_yup=True,
    )


def build_ceiling_hvac_cassette_duct() -> None:
    reset_scene()
    m_panel = make_pbr_material("HvacPanel", (0.85, 0.88, 0.91, 1.0), 0.42, 0.12)
    m_steel = make_pbr_material("SpiralGalv", (0.58, 0.63, 0.68, 1.0), 0.28, 0.78)
    m_dark = make_pbr_material("VentDark", (0.18, 0.21, 0.25, 1.0), 0.6, 0.3)
    add_beveled_box("CassetteBody", (0.95, 0.95, 0.08), (0.0, 0.0, -0.04), m_panel)
    add_beveled_box("IntakeCore", (0.56, 0.56, 0.025), (0.0, 0.0, -0.085), m_dark)
    add_cylinder("SpiralDuct", 0.16, 1.85, (0.92, -0.32, -0.28), (0.0, math.pi / 2, 0.0), m_steel)
    export_glb("ceiling-hvac-cassette-duct.glb")


def build_ceiling_track_spotlight_rig() -> None:
    reset_scene()
    m_black = make_pbr_material("TrackMatte", (0.14, 0.16, 0.2, 1.0), 0.36, 0.65)
    m_lens = make_pbr_material("WarmLens", (0.98, 0.94, 0.76, 1.0), 0.2, 0.1)
    add_beveled_box("TrackRail", (2.1, 0.07, 0.045), (0.0, 0.0, -0.022), m_black)
    for idx, x_pos in enumerate((-0.68, 0.0, 0.68)):
        add_cylinder(f"SpotCan_{idx}", 0.055, 0.2, (x_pos, 0.0, -0.15), (0.28, 0.0, 0.0), m_black)
        add_cylinder(f"SpotLens_{idx}", 0.048, 0.015, (x_pos, -0.03, -0.24), (0.28, 0.0, 0.0), m_lens)
    export_glb("ceiling-track-spotlight-rig.glb")


def build_window_venetian_blind_pelmet() -> None:
    reset_scene()
    m_frame = make_pbr_material("PelmetFrame", (0.32, 0.36, 0.42, 1.0), 0.48, 0.25)
    m_slat = make_pbr_material("BlindSlat", (0.9, 0.91, 0.93, 1.0), 0.55, 0.08)
    add_beveled_box("PelmetBox", (2.44, 0.18, 0.14), (0.0, 0.0, -0.07), m_frame)
    # 창 상부 원점에서 하단 레일까지 실제 1.5 m를 채운다.
    slat_count = 24
    for i in range(slat_count):
        z_pos = -0.19 - i * (1.44 - 0.19) / (slat_count - 1)
        add_beveled_box(f"Slat_{i}", (2.32, 0.035, 0.012), (0.0, 0.02, z_pos), m_slat, 0.002)
    for side in (-1, 1):
        add_beveled_box(f"BlindLadderTape_{side}", (0.012, 0.008, 1.32), (side * 0.72, 0.045, -0.8), m_frame, 0.001)
    add_beveled_box("BlindBottomRail", (2.32, 0.055, 0.03), (0.0, 0.02, -1.485), m_frame, 0.004)
    export_glb("window-venetian-blind-pelmet.glb")


def build_alley_projecting_sign_wires() -> None:
    reset_scene()
    m_rust = make_pbr_material("BracketIron", (0.24, 0.25, 0.28, 1.0), 0.68, 0.55)
    m_sign = make_pbr_material("SignAcrylic", (0.96, 0.88, 0.58, 1.0), 0.32, 0.1)
    add_beveled_box("WallBracket", (0.12, 0.45, 0.92), (0.0, -0.35, -0.5), m_rust)
    add_beveled_box("SignCabinet", (0.22, 0.68, 1.05), (0.0, 0.18, -0.54), m_sign)
    add_cylinder("FeederWire", 0.018, 1.65, (0.85, -0.28, -0.35), (0.1, 1.42, 0.0), m_rust)
    export_glb("alley-projecting-sign-wires.glb")


def build_classroom_ceiling_speaker_projector() -> None:
    reset_scene()
    m_white = make_pbr_material("ProjectorWhite", (0.88, 0.9, 0.92, 1.0), 0.4, 0.18)
    m_mount = make_pbr_material("PipeSteel", (0.35, 0.39, 0.45, 1.0), 0.42, 0.62)
    add_beveled_box("LouverLamp", (1.28, 0.32, 0.07), (0.0, 0.0, -0.035), m_white)
    add_cylinder("ProjectorMast", 0.028, 0.34, (0.0, 0.62, -0.17), (0.0, 0.0, 0.0), m_mount)
    add_beveled_box("ProjectorBody", (0.36, 0.28, 0.12), (0.0, 0.62, -0.4), m_white)
    # 천장 고정 브래킷·하우징·전면 그릴·원형 드라이버가 있는 방송 스피커.
    m_grille = make_pbr_material("SpeakerGraphite", (0.08, 0.10, 0.13, 1.0), 0.6, 0.18)
    add_beveled_box("BroadcastSpeakerMount", (0.08, 0.06, 0.035), (-0.5, 0.48, -0.0175), m_mount, 0.003)
    add_beveled_box("BroadcastSpeakerCabinet", (0.30, 0.22, 0.18), (-0.5, 0.48, -0.1), m_white, 0.012)
    add_beveled_box("BroadcastSpeakerGrille", (0.25, 0.016, 0.13), (-0.5, 0.362, -0.1), m_grille, 0.004)
    add_cylinder("BroadcastSpeakerDriver", 0.047, 0.012, (-0.5, 0.348, -0.1), (math.pi / 2, 0.0, 0.0), m_mount)
    export_glb("classroom-ceiling-speaker-projector.glb")


def build_hanok_rafter_choma_lantern() -> None:
    reset_scene()
    m_wood = make_pbr_material("HanokPine", (0.38, 0.25, 0.16, 1.0), 0.72, 0.04)
    m_hanji = make_pbr_material("HanjiGlow", (0.96, 0.89, 0.72, 1.0), 0.65, 0.02)
    add_beveled_box("DoriBeam", (2.2, 0.2, 0.18), (0.0, -0.25, -0.09), m_wood)
    for idx, x_pos in enumerate((-0.65, 0.0, 0.65)):
        add_cylinder(f"Rafter_{idx}", 0.065, 0.95, (x_pos, 0.12, -0.24), (1.32, 0.0, 0.0), m_wood)
    add_beveled_box("ChomaLantern", (0.24, 0.24, 0.36), (0.0, 0.42, -0.46), m_hanji)
    export_glb("hanok-rafter-choma-lantern.glb")


BUILDERS = {
    "ceiling-hvac-cassette-duct": build_ceiling_hvac_cassette_duct,
    "ceiling-track-spotlight-rig": build_ceiling_track_spotlight_rig,
    "window-venetian-blind-pelmet": build_window_venetian_blind_pelmet,
    "alley-projecting-sign-wires": build_alley_projecting_sign_wires,
    "classroom-ceiling-speaker-projector": build_classroom_ceiling_speaker_projector,
    "hanok-rafter-choma-lantern": build_hanok_rafter_choma_lantern,
}


def render_thumbnail(slug: str) -> None:
    """하부 시점의 자체 재질 렌더를 남긴다. GLB 내보내기 뒤라 카메라·조명은 원본에 섞이지 않는다."""
    scene = bpy.context.scene
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    points = [obj.matrix_world @ vertex.co for obj in meshes for vertex in obj.data.vertices]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    center = (minimum + maximum) / 2
    span = max(maximum - minimum)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    scene.render.resolution_x = 384
    scene.render.resolution_y = 288
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("ThumbnailWorld")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.18, 0.20, 0.24, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65
    for name, direction, strength in [("ThumbnailKey", (-3, -4, -3), 140), ("ThumbnailFill", (4, 2, 3), 100)]:
        light = bpy.data.lights.new(name, "AREA")
        light.energy = strength * span * span
        light.shape = "DISK"
        light.size = span * 3
        obj = bpy.data.objects.new(name, light)
        scene.collection.objects.link(obj)
        obj.location = center + Vector(direction).normalized() * span * 2
        obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()
    camera_data = bpy.data.cameras.new("ThumbnailCamera")
    camera = bpy.data.objects.new("ThumbnailCamera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = center + Vector((2.8, -4, -2)).normalized() * span * 3
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = span * 1.35
    scene.camera = camera
    directory = OUTPUT_DIR / "thumbnails"
    directory.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(directory / f"{slug}.png")
    bpy.ops.render.render(write_still=True)


def write_provenance() -> None:
    paths = sorted(OUTPUT_DIR.glob("*.glb"))
    provenance = {
        "schema": "toonstudio.procedural-upper-assets.v1",
        "createdAt": "2026-11-13",
        "creator": "ToonStudio",
        "license": "CC0-1.0",
        "generator": "scripts/blender/generate_kitbash_v11_upper_sets.py",
        "tool": f"Blender {bpy.app.version_string}",
        "units": "meter",
        "upAxis": "Y",
        "externalSources": [],
        "files": [{"file": path.name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in paths],
        "thumbnails": [{"file": f"thumbnails/{path.name}", "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted((OUTPUT_DIR / "thumbnails").glob("*.png"))],
    }
    (OUTPUT_DIR / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_all(assets: list[str] | None = None, thumbnails: bool = False) -> None:
    for slug in dict.fromkeys(assets or BUILDERS):
        BUILDERS[slug]()
        if thumbnails:
            render_thumbnail(slug)
    write_provenance()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="V11 상부 배경 GLB를 선택 생성합니다.")
    parser.add_argument("--asset", action="append", choices=tuple(BUILDERS), help="생성할 에셋 ID. 여러 번 지정할 수 있습니다.")
    parser.add_argument("--render-thumbnails", action="store_true", help="선택한 에셋의 자체 재질 미리보기도 생성합니다.")
    arguments = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    build_all(arguments.asset, arguments.render_thumbnails)
