"""Phase 0 PoC: high-quality Cycles plates for `korean_convenience_store_night`.

 근거: bg3d 조사 보고서 §6. 제품 코드·서버 인프라·MCP는 범위 밖이며, 이 스크립트와
 산출 이미지(플레이트 패스 + 매니페스트)까지가 PoC의 산출물이다.

 현재(baseline)와의 차이 — 생성 스크립트 generate_environment_pack_v5.py 실측:
   - 임베드 텍스처 상한 128px -> 이 스크립트에서 1024px 절차 PBR 맵으로 재생성
   - 썸네일 EEVEE 640x400, 월드 단색 -> Cycles 256샘플 + OIDN, AgX, HDRI 월드
   - 패스 없음 -> 각도별 beauty/depth/normal/AO 패스 (멀티레이어 EXR + beauty PNG)
   - 프리뷰용 임시 조명 -> 매장에 실제로 있는 광원(형광등·냉장고·간판·거리 유출광) 리그

 입력은 재저작이 아니라 출하된 GLB 그 자체다. Phase 1에서 검증할 가설이
 "같은 에셋이라도 플레이트 방식으로 뽑으면 품질이 오르는가"이기 때문이다.

 사용법 (Blender 5.2 고정, 캐릭터 파이프라인 CI와 동일 버전):
   blender -b --python scripts/blender/render_convenience_store_night_plate_poc.py -- \
     --glb apps/web/public/assets/3d/environments/korean_convenience_store_night.glb \
     --hdri apps/web/public/assets/3d/hdri/cobblestone_street_night_1k.hdr \
     --output-dir build/bg3d-plate-poc

 --hdri를 생략하면 절차 야간 월드로 폴백하고 매니페스트에
 hdri.mode="procedural-fallback"으로 기록한다. 이 경우 TS 판정기
 (studio-bg3d-plate-poc.ts)의 hdri-real 검사가 실패하므로, 폴백 렌더는
 파이프라인 스모크일 뿐 PoC 판정 대상이 아니다 (fail-closed).

 산출물:
   <output-dir>/<angle-id>/beauty.png     Cycles beauty (AgX)
   <output-dir>/<angle-id>/passes.exr     Combined/Z/Normal/AO 멀티레이어
   <output-dir>/poc-manifest.json         TS 계약(studio-bg3d-plate-poc.ts)과 동일 스키마
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

try:
    import bpy
    from mathutils import Vector
except ImportError:  # Blender 밖에서는 상수·인자 파싱만 검증할 수 있다.
    bpy = None
    Vector = None


GENERATOR = "scripts/blender/render_convenience_store_night_plate_poc.py"
ASSET_ID = "korean_convenience_store_night"
BASELINE_TEXTURE_DIMENSION = 128
POC_TEXTURE_DIMENSION = 1024
SAMPLES = 256
RESOLUTION_X = 2560
RESOLUTION_Y = 1600
HDRI_POLYHAVEN_ID = "cobblestone_street_night"
# v5 썸네일 월드의 야간 단색. HDRI가 없을 때의 폴백이자 baseline 기록값이다.
NIGHT_WORLD_COLOR = (0.008, 0.012, 0.032, 1.0)

# 각도 ID·카메라·렌즈는 TS 정본(STUDIO_BG3D_PLATE_POC_SPEC.angles)과 동일해야 한다.
ANGLES = (
    {
        "id": "exterior-front",
        "location": (8.8, -17.8, 8.4),
        "target": (0.0, -0.15, 1.35),
        "lens": 43,
    },
    {
        "id": "interior-aisle",
        "location": (-3.4, -2.6, 1.7),
        "target": (1.2, 1.6, 1.0),
        "lens": 46,
    },
)

# v5 재질 이름 -> Principled 승격값. 맵 승격은 타일 재질만 해당하고(유일한
# textured_material), 나머지는 스칼라 PBR(금속도·거칠기·투과) 승격으로 기록한다.
MATERIAL_UPGRADES = {
    "ConvenienceStore_Glass": {"roughness": 0.05, "transmission": 0.6},
    "ConvenienceStore_CharcoalFrame": {"metallic": 0.85, "roughness": 0.35},
    "ConvenienceStore_ShelfMetal": {"metallic": 0.9, "roughness": 0.3},
    "ConvenienceStore_TileDetail": {"roughness": 0.3},
}


def parse_arguments():
    script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", required=True, help="출하된 편의점 GLB 경로")
    parser.add_argument("--hdri", default=None, help="Poly Haven 야간 HDRI(.hdr) 경로")
    parser.add_argument("--output-dir", default="build/bg3d-plate-poc")
    parser.add_argument("--samples", type=int, default=SAMPLES)
    parser.add_argument("--only", choices=[a["id"] for a in ANGLES], action="append")
    return parser.parse_args(script_args)


def _set_principled(mat, socket_names, value):
    """Blender 버전별 소켓 이름 차이를 흡수하며 값을 넣는다. 성공 여부를 돌려준다."""
    if not mat or not mat.use_nodes:
        return False
    shader = mat.node_tree.nodes.get("Principled BSDF")
    if shader is None:
        return False
    for name in socket_names:
        if name in shader.inputs:
            shader.inputs[name].default_value = value
            return True
    return False


def _tile_pattern_color(x, y, dimension):
    """v5 _pattern_color('tile')의 일반화: dimension 해상도에서 같은 타일 문양을 만든다."""
    cell = max(2, dimension // 8)
    grout = x % cell in (0, 1) or y % cell in (0, 1)
    checker = ((x // cell) + (y // cell)) % 2
    blend = 0.22 if grout else 0.07 * checker
    base = (0.62, 0.66, 0.68)
    accent = (0.18, 0.24, 0.27)
    return tuple(base[i] * (1.0 - blend) + accent[i] * blend for i in range(3)), grout


def regenerate_tile_maps():
    """타일 재질의 128px 임베드 맵을 1024px 컬러/노멀/거칠기 맵으로 교체한다."""
    upgraded = []
    for mat in bpy.data.materials:
        if "TileDetail" not in mat.name or not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        shader = nodes.get("Principled BSDF")
        if shader is None:
            continue
        dimension = POC_TEXTURE_DIMENSION
        color_image = bpy.data.images.new(
            f"{mat.name}_PoCColor{dimension}", width=dimension, height=dimension, alpha=False
        )
        roughness_image = bpy.data.images.new(
            f"{mat.name}_PoCRoughness{dimension}",
            width=dimension,
            height=dimension,
            alpha=False,
        )
        color_pixels = []
        roughness_pixels = []
        for y in range(dimension):
            for x in range(dimension):
                rgb, grout = _tile_pattern_color(x, y, dimension)
                color_pixels.extend((*rgb, 1.0))
                # 줄눈은 거칠게, 타일면은 매끈하게: 젖은 입구 쪽 반사 차이를 만드는 핵심 맵.
                roughness = 0.85 if grout else 0.28
                roughness_pixels.extend((roughness, roughness, roughness, 1.0))
        color_image.pixels.foreach_set(color_pixels)
        color_image.pack()
        roughness_image.pixels.foreach_set(roughness_pixels)
        roughness_image.colorspace_settings.name = "Non-Color"
        roughness_image.pack()

        color_node = nodes.new("ShaderNodeTexImage")
        color_node.name = "PoC_TileColor1024"
        color_node.image = color_image
        links.new(color_node.outputs["Color"], shader.inputs["Base Color"])
        roughness_node = nodes.new("ShaderNodeTexImage")
        roughness_node.name = "PoC_TileRoughness1024"
        roughness_node.image = roughness_image
        links.new(roughness_node.outputs["Color"], shader.inputs["Roughness"])
        mat["poc_texture_dimension"] = dimension
        mat["poc_texture_source"] = "procedural-1k-poc (Phase 1: CC0 PBR set)"
        upgraded.append(mat.name)
    return upgraded


def upgrade_materials():
    upgraded = []
    for name, values in MATERIAL_UPGRADES.items():
        mat = bpy.data.materials.get(name)
        if mat is None:
            continue
        touched = False
        if "metallic" in values:
            touched |= _set_principled(mat, ["Metallic"], values["metallic"])
        if "roughness" in values:
            touched |= _set_principled(mat, ["Roughness"], values["roughness"])
        if "transmission" in values:
            touched |= _set_principled(
                mat, ["Transmission Weight", "Transmission"], values["transmission"]
            )
        if touched:
            mat["poc_pbr_upgraded"] = True
            upgraded.append(name)
    return upgraded


def setup_world(hdri_path):
    scene = bpy.context.scene
    scene.world.use_nodes = True
    nodes = scene.world.node_tree.nodes
    links = scene.world.node_tree.links
    background = nodes.get("Background")
    if hdri_path and Path(hdri_path).is_file():
        env = nodes.new("ShaderNodeTexEnvironment")
        env.name = "PoC_HDRI_cobblestone_street_night"
        env.image = bpy.data.images.load(str(Path(hdri_path).resolve()))
        mapping = nodes.new("ShaderNodeMapping")
        texcoord = nodes.new("ShaderNodeTexCoord")
        links.new(texcoord.outputs["Generated"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], env.inputs["Vector"])
        links.new(env.outputs["Color"], background.inputs["Color"])
        # 실내 야경이라 환경광은 반사·유출광 위주로 약하게 건다. 주광은 실광원 리그.
        background.inputs["Strength"].default_value = 0.55
        return {"mode": "file", "polyHavenId": HDRI_POLYHAVEN_ID}
    background.inputs["Color"].default_value = NIGHT_WORLD_COLOR
    background.inputs["Strength"].default_value = 1.0
    return {"mode": "procedural-fallback", "polyHavenId": None}


def _look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_practical_lights():
    """v5 지오메트리의 발광체 위치에 실제 광원을 놓는다 (형광등·냉장고·간판·거리광)."""
    created = []

    def add_light(name, light_type, location, energy, color, size=None, size_y=None):
        bpy.ops.object.light_add(type=light_type, location=location)
        light = bpy.context.active_object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        if size is not None and hasattr(light.data, "size"):
            light.data.size = size
        if size_y is not None and hasattr(light.data, "size_y"):
            light.data.size_y = size_y
        created.append(name)
        return light

    # 천장 형광등 4개: CeilingLight_1..4 상자 (x=-3.6,-1.2,1.2,3.6, y=0, z=3.48) 바로 아래.
    for index, x in enumerate((-3.6, -1.2, 1.2, 3.6), 1):
        add_light(
            f"PoC_CeilingFluorescent_{index}",
            "AREA",
            (x, 0.0, 3.42),
            260.0,
            (0.92, 0.97, 1.0),
            size=1.55,
            size_y=0.24,
        )
    # 냉장고 뱅크 5대: Fridge_*_Light (x=-3.72+i*1.86, y=3.12, z=2.52) 발광 스트립.
    for index in range(5):
        x = -3.72 + index * 1.86
        add_light(
            f"PoC_FridgeStrip_{index + 1}",
            "AREA",
            (x, 3.05, 2.45),
            60.0,
            (0.85, 0.95, 1.0),
            size=1.48,
            size_y=0.07,
        )
    # 브랜드 간판 네온: Store_BrandSign (0,-3.98,3.40) — 매장 안쪽으로 시안 유출광.
    sign = add_light("PoC_BrandSignNeon", "AREA", (0.0, -3.80, 3.40), 300.0, (0.02, 0.72, 0.82), size=6.8, size_y=0.72)
    _look_at(sign, (0.0, 0.0, 1.4))
    # 거리 유출광: 전면 유리 너머 가로등 — 젖은 노면·유리 반사의 방향을 만든다.
    street = add_light("PoC_StreetSpill", "AREA", (0.0, -6.5, 2.2), 500.0, (0.35, 0.55, 1.0), size=7.0)
    _look_at(street, (0.0, -3.9, 1.2))
    return created


def setup_cycles(scene, samples):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    except (TypeError, ValueError):
        pass
    try:
        scene.view_settings.view_transform = "AgX"
    except (TypeError, ValueError):
        pass
    for look in ("Medium High Contrast", "AgX - Medium High Contrast"):
        try:
            scene.view_settings.look = look
            break
        except (TypeError, ValueError):
            continue
    scene.render.resolution_x = RESOLUTION_X
    scene.render.resolution_y = RESOLUTION_Y
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    view_layer = bpy.context.view_layer
    view_layer.use_pass_z = True
    view_layer.use_pass_normal = True
    if hasattr(view_layer, "use_pass_ambient_occlusion"):
        view_layer.use_pass_ambient_occlusion = True
    if hasattr(view_layer, "use_pass_combined"):
        view_layer.use_pass_combined = True


def setup_compositor_beauty(scene, beauty_path):
    """멀티레이어 EXR(메인 출력)과 별도로 beauty PNG를 컴포지터로 함께 뽑는다."""
    scene.use_nodes = True
    tree = scene.node_tree
    tree.nodes.clear()
    render_layers = tree.nodes.new("CompositorNodeRLayers")
    output = tree.nodes.new("CompositorNodeOutputFile")
    output.base_path = str(beauty_path.parent)
    output.file_slots[0].path = beauty_path.stem
    output.format.file_format = "PNG"
    output.format.color_mode = "RGBA"
    output.format.color_depth = "8"
    tree.links.new(render_layers.outputs["Image"], output.inputs["Image"])


def render_angle(scene, angle, output_dir):
    angle_dir = output_dir / angle["id"]
    angle_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.camera_add(location=angle["location"])
    camera = bpy.context.active_object
    camera.name = f"PoC_Camera_{angle['id']}"
    camera.data.lens = angle["lens"]
    camera.data.sensor_width = 36
    _look_at(camera, angle["target"])
    scene.camera = camera

    beauty_path = angle_dir / "beauty.png"
    try:
        setup_compositor_beauty(scene, beauty_path)
    except Exception as error:  # 컴포지터 실패 시에도 EXR은 남기되 매니페스트에 남긴다.
        print(f"PoC compositor fallback for {angle['id']}: {error}")
        scene.use_nodes = False
    scene.render.image_settings.file_format = "OPEN_EXR_MULTILAYER"
    scene.render.filepath = str(angle_dir / "passes")

    started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    elapsed = time.perf_counter() - started

    # File Output 노드는 프레임 번호를 붙인다(beauty0001.png). 정본 이름으로 되돌린다.
    if not beauty_path.is_file():
        for candidate in sorted(angle_dir.glob("beauty*.png")):
            candidate.rename(beauty_path)
            break
    if not beauty_path.is_file():
        # 컴포지터 경로가 실패한 경우에만 beauty 전용으로 한 번 더 렌더한다.
        # 실패한 실행에서 시간 예산을 넘기면 매니페스트가 그대로 드러나 판정이 실패한다.
        scene.use_nodes = False
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"
        scene.render.filepath = str(angle_dir / "beauty")
        fallback_started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        elapsed += time.perf_counter() - fallback_started

    passes = []
    if (angle_dir / "passes.exr").is_file() or any(angle_dir.glob("passes*.exr")):
        passes = ["depth", "normal", "ao"]
    if beauty_path.is_file():
        passes.insert(0, "beauty")
    return {
        "id": angle["id"],
        "widthPx": RESOLUTION_X,
        "heightPx": RESOLUTION_Y,
        "renderSeconds": round(elapsed, 3),
        "passes": passes,
    }


def main():
    if bpy is None:
        raise RuntimeError("This script must run inside Blender (bpy unavailable).")
    args = parse_arguments()
    glb_path = Path(args.glb).resolve()
    if not glb_path.is_file():
        raise FileNotFoundError(f"GLB not found: {glb_path}")
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    tile_upgraded = regenerate_tile_maps()
    materials_upgraded = upgrade_materials()
    hdri_info = setup_world(args.hdri)
    lights = add_practical_lights()
    setup_cycles(scene, args.samples)

    selected = [a for a in ANGLES if not args.only or a["id"] in args.only]
    angle_results = [render_angle(scene, angle, output_dir) for angle in selected]

    manifest = {
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "generator": GENERATOR,
        "blenderVersion": bpy.app.version_string,
        "baselineTextureDimensionPx": BASELINE_TEXTURE_DIMENSION,
        "textureDimensionPx": POC_TEXTURE_DIMENSION,
        "samples": args.samples,
        "hdri": hdri_info,
        "tileMaterialsUpgraded": tile_upgraded,
        "materialsUpgraded": materials_upgraded,
        "practicalLights": lights,
        "angles": angle_results,
    }
    manifest_path = output_dir / "poc-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"PoC manifest: {manifest_path}")


if __name__ == "__main__":
    main()
