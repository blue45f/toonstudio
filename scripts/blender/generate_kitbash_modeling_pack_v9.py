"""ToonStudio Kitbash V9 — 6종 고밀도 3D 배경 오브젝트 & 캐릭터 조형 CC0-1.0 에셋 생성기.

실행 예시 (백그라운드 Blender 5.2):
  blender -b --python scripts/blender/generate_kitbash_modeling_pack_v9.py

라이브 Blender MCP 세션에서도 단일 패스로 즉시 실행 가능하며,
모든 결과물은 미터 단위, 바닥 Z=0(glTF Y=0) 정렬, 베벨·가중 법선(Weighted Normal),
4종 이상의 Principled BSDF 재질, 외부 URI 0개의 자체 포함 GLB로 내보낸다.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
import struct

import bpy
from mathutils import Vector

TAU = math.tau
PI = math.pi


def resolve_repo_root() -> Path:
    try:
        script_file = Path(__file__).resolve()
        candidate = script_file.parents[2]
        if (candidate / "apps/web/public/assets/3d").exists():
            return candidate
    except NameError:
        pass
    return Path("/Users/hjunkim/WebstormProjects/toonstudio")


ROOT = resolve_repo_root()
OUTPUT_DIR = ROOT / "apps/web/public/assets/3d/kitbash-v9"
THUMB_DIR = OUTPUT_DIR / "thumbnails"
MAT_CACHE: dict[str, bpy.types.Material] = {}


def get_or_create_export_scene() -> bpy.types.Scene:
    scene = bpy.data.scenes.get("KitbashV9_Export_Scene")
    if scene is None:
        scene = bpy.data.scenes.new("KitbashV9_Export_Scene")
        scene.unit_settings.system = "METRIC"
        scene.unit_settings.scale_length = 1.0
    if bpy.context.window is not None:
        bpy.context.window.scene = scene
    return scene


def clear_scene() -> None:
    scene = get_or_create_export_scene()
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.lights,
        bpy.data.cameras,
    ):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)
    MAT_CACHE.clear()


def set_active(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def make_mat(
    name: str,
    color: tuple[float, float, float],
    roughness: float = 0.48,
    metallic: float = 0.0,
    emission: float = 0.0,
    alpha: float = 1.0,
) -> bpy.types.Material:
    if name in MAT_CACHE:
        return MAT_CACHE[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, alpha)
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*color, alpha)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Alpha"].default_value = alpha
        if emission > 0.0:
            bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission
    if alpha < 1.0:
        mat.surface_render_method = "DITHERED"
    MAT_CACHE[name] = mat
    return mat


def finish_mesh(
    obj: bpy.types.Object,
    mat: bpy.types.Material,
    bevel_width: float = 0.008,
    bevel_segments: int = 2,
    smooth: bool = True,
) -> bpy.types.Object:
    obj.name = f"GEO_{obj.name}"
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    set_active(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("KitbashBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    if smooth and bevel_width > 0.0:
        wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
        wn.weight = 50
        bpy.ops.object.modifier_apply(modifier=wn.name)
    return obj


def add_box(
    name: str,
    size: tuple[float, float, float],
    loc: tuple[float, float, float],
    mat: bpy.types.Material,
    bevel: float = 0.01,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    safe_bevel = min(bevel, min(size) * 0.28)
    return finish_mesh(obj, mat, bevel_width=safe_bevel, bevel_segments=2, smooth=True)


def add_cyl(
    name: str,
    radius: float,
    depth: float,
    loc: tuple[float, float, float],
    mat: bpy.types.Material,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 28,
    bevel: float = 0.006,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    safe_bevel = min(bevel, radius * 0.22, depth * 0.22)
    return finish_mesh(obj, mat, bevel_width=safe_bevel, bevel_segments=2, smooth=True)


def add_cone(
    name: str,
    r1: float,
    r2: float,
    depth: float,
    loc: tuple[float, float, float],
    mat: bpy.types.Material,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 24,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=r1,
        radius2=r2,
        depth=depth,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, mat, bevel_width=0.004, bevel_segments=2, smooth=True)


def add_sphere(
    name: str,
    scale: tuple[float, float, float],
    loc: tuple[float, float, float],
    mat: bpy.types.Material,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segments: int = 32,
    rings: int = 18,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=1.0,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return finish_mesh(obj, mat, bevel_width=0.0, smooth=True)


def add_pipe_curve(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    mat: bpy.types.Material,
    cyclic: bool = False,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for pt, co in zip(spline.points, points):
        pt.co = (*co, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(f"GEO_{name}", curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    set_active(obj)
    bpy.ops.object.convert(target="MESH")
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def ground_all_meshes() -> tuple[Vector, Vector]:
    bpy.context.view_layer.update()
    mesh_objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    corners = [o.matrix_world @ Vector(c) for o in mesh_objs for c in o.bound_box]
    min_z = min(c.z for c in corners)
    cx = (min(c.x for c in corners) + max(c.x for c in corners)) * 0.5
    cy = (min(c.y for c in corners) + max(c.y for c in corners)) * 0.5
    for o in mesh_objs:
        o.location.x -= cx
        o.location.y -= cy
        o.location.z -= min_z
    bpy.context.view_layer.update()
    corners2 = [o.matrix_world @ Vector(c) for o in mesh_objs for c in o.bound_box]
    low = Vector((min(c.x for c in corners2), min(c.y for c in corners2), min(c.z for c in corners2)))
    high = Vector((max(c.x for c in corners2), max(c.y for c in corners2), max(c.z for c in corners2)))
    return low, high


# 1. 한국형 편의점·상가 쇼윈도 파사드 V9
def build_convenience_storefront_v9() -> None:
    plaster = make_mat("StorePlasterCream", (0.86, 0.84, 0.79), 0.72)
    alu_dark = make_mat("StoreAnodizedFrame", (0.11, 0.13, 0.16), 0.35, 0.75)
    glass = make_mat("StoreShowWindowGlass", (0.58, 0.78, 0.88), 0.12, 0.1, alpha=0.38)
    sign_cyan = make_mat("StoreSignCyanGlow", (0.10, 0.62, 0.88), 0.25, emission=1.6)
    sign_orange = make_mat("StoreSignAccentGlow", (0.95, 0.42, 0.12), 0.28, emission=1.4)
    wood_deck = make_mat("StoreDeckTimber", (0.44, 0.29, 0.16), 0.64)
    steel = make_mat("StoreHvacSteel", (0.62, 0.65, 0.68), 0.38, 0.65)

    # 전면 데크 및 본체 벽체
    add_box("FrontTimberDeck", (3.8, 0.9, 0.10), (0.0, -1.05, 0.05), wood_deck, 0.012)
    add_box("MainStoreBody", (3.6, 1.5, 2.85), (0.0, 0.15, 1.475), plaster, 0.018)
    add_box("RoofParapetCap", (3.76, 1.66, 0.16), (0.0, 0.15, 2.98), alu_dark, 0.015)

    # 3색 발광 간판 & 어닝
    add_box("SignboardBackHousing", (3.56, 0.22, 0.54), (0.0, -0.66, 2.52), alu_dark, 0.014)
    add_box("SignboardCyanBand", (3.44, 0.06, 0.30), (0.0, -0.78, 2.57), sign_cyan, 0.008)
    add_box("SignboardOrangeStripe", (3.44, 0.06, 0.10), (0.0, -0.78, 2.35), sign_orange, 0.006)
    add_box("StripedAwningCanopy", (2.35, 0.62, 0.08), (-0.48, -0.92, 2.12), sign_cyan, 0.01, rot=(0.22, 0.0, 0.0))

    # 통유리 쇼윈도 멀리언 & 자동문 프레임
    add_box("ShowWindowGlassLeft", (1.95, 0.04, 1.65), (-0.65, -0.61, 1.15), glass, 0.004)
    for mx in (-1.62, -0.65, 0.32):
        add_box("WindowMullionPost", (0.06, 0.09, 1.92), (mx, -0.61, 1.06), alu_dark, 0.005)
    add_box("WindowSillBase", (2.05, 0.14, 0.28), (-0.65, -0.62, 0.24), alu_dark, 0.008)
    add_box("AutoSlidingDoorGlass", (1.05, 0.04, 1.95), (1.02, -0.61, 1.08), glass, 0.004)
    add_box("AutoDoorTopHeader", (1.22, 0.12, 0.14), (1.02, -0.62, 2.10), alu_dark, 0.008)

    # 내부 진열 선반 3단 (유리 너머 실루엣 깊이감)
    for z in (0.62, 1.02, 1.42):
        add_box("InteriorGondolaShelf", (1.65, 0.32, 0.04), (-0.65, -0.18, z), plaster, 0.005)

    # 야외 파라솔 테이블 & 측면 실외기
    add_cyl("DeckTablePole", 0.04, 0.72, (-1.15, -1.08, 0.46), alu_dark)
    add_cyl("DeckTableTop", 0.36, 0.04, (-1.15, -1.08, 0.83), plaster)
    add_cone("StoreParasolCanopy", 0.82, 0.04, 0.38, (-1.15, -1.08, 1.92), sign_orange, vertices=16)
    add_cyl("StoreParasolPole", 0.025, 1.10, (-1.15, -1.08, 1.36), alu_dark)
    add_box("SideHvacUnit", (0.28, 0.66, 0.56), (1.94, 0.20, 0.42), steel, 0.01)
    add_cyl("SideHvacFan", 0.18, 0.04, (2.09, 0.20, 0.44), alu_dark, rot=(0.0, PI / 2, 0.0))
    add_pipe_curve("SideHvacConduit", [(1.94, 0.42, 0.70), (1.94, 0.42, 1.85), (1.80, 0.42, 1.95)], 0.024, steel)


# 2. 도심 전신주·변압기·가로등·배전함 클러스터 V9
def build_urban_utility_pole_cluster_v9() -> None:
    concrete = make_mat("PoleSpunConcrete", (0.58, 0.59, 0.57), 0.82)
    steel_galv = make_mat("PoleGalvanizedSteel", (0.46, 0.50, 0.53), 0.36, 0.78)
    transformer_gray = make_mat("TransformerEnamel", (0.30, 0.35, 0.38), 0.42, 0.45)
    ceramic = make_mat("PorcelainInsulator", (0.82, 0.86, 0.88), 0.20)
    warn_yellow = make_mat("PoleSafetyBand", (0.92, 0.68, 0.08), 0.40)
    lamp_glow = make_mat("StreetLedWarmGlow", (1.0, 0.88, 0.64), 0.22, emission=2.2)

    add_cyl("PoleBaseCollar", 0.22, 0.24, (0.0, 0.0, 0.12), concrete, vertices=32)
    add_cone("TaperedConcretePole", 0.165, 0.105, 4.45, (0.0, 0.0, 2.34), concrete, vertices=32)
    for z in (0.65, 0.92):
        add_cyl("SafetyWarningBand", 0.166, 0.11, (0.0, 0.0, z), warn_yellow, vertices=32)

    # 상단 완철(Crossarm) 2단 및 애자(Insulator) 6기
    for cz in (3.82, 4.26):
        add_box("SteelCrossarm", (1.36, 0.08, 0.08), (0.0, -0.14, cz), steel_galv, 0.008)
        for ix in (-0.54, 0.0, 0.54):
            add_cyl("CeramicInsulatorPin", 0.038, 0.14, (ix, -0.14, cz + 0.10), ceramic, vertices=20)
    add_pipe_curve("CrossarmDiagonalBraceL", [(-0.46, -0.14, 3.80), (0.0, -0.12, 3.48)], 0.014, steel_galv)
    add_pipe_curve("CrossarmDiagonalBraceR", [(0.46, -0.14, 3.80), (0.0, -0.12, 3.48)], 0.014, steel_galv)

    # 주상 변압기 2기 & 방열 핀·고압 부싱
    for tx, ty in ((-0.28, 0.22), (0.28, 0.22)):
        add_cyl("PoleTransformerTank", 0.19, 0.68, (tx, ty, 2.92), transformer_gray, vertices=28)
        add_cyl("TransformerTopLid", 0.205, 0.05, (tx, ty, 3.27), steel_galv, vertices=28)
        for bx in (-0.06, 0.06):
            add_cone("HighVoltageBushing", 0.032, 0.018, 0.18, (tx + bx, ty, 3.40), ceramic, vertices=16)
    add_box("TransformerMountBracket", (0.76, 0.12, 0.12), (0.0, 0.16, 2.92), steel_galv, 0.008)

    # 곡선 가로등 암 & 발광 헤드 + 하단 통신 배전함
    add_pipe_curve(
        "CurvedStreetlampArm",
        [(0.0, -0.12, 3.22), (0.25, -0.45, 3.42), (0.62, -0.78, 3.48)],
        0.026,
        steel_galv,
    )
    add_box("StreetlampHeadHousing", (0.26, 0.42, 0.09), (0.68, -0.84, 3.46), steel_galv, 0.012, rot=(0.12, 0.0, -0.58))
    add_box("StreetlampEmitterPanel", (0.20, 0.32, 0.03), (0.68, -0.84, 3.41), lamp_glow, 0.004, rot=(0.12, 0.0, -0.58))
    add_box("TelecomJunctionBox", (0.34, 0.20, 0.52), (0.0, -0.22, 1.55), steel_galv, 0.01)
    add_pipe_curve("RiserCableConduit", [(0.11, -0.15, 0.20), (0.11, -0.15, 2.85)], 0.018, steel_galv)


# 3. 옥상 대형 공조기·물탱크·배관 설비 세트 V9
def build_rooftop_hvac_watertank_rig_v9() -> None:
    skid_dark = make_mat("HvacStructuralFrame", (0.14, 0.16, 0.18), 0.45, 0.72)
    hvac_sheet = make_mat("HvacPowderSheet", (0.76, 0.79, 0.81), 0.42, 0.35)
    tank_teal = make_mat("RooftopWatertankTeal", (0.16, 0.46, 0.58), 0.38, 0.12)
    copper_pipe = make_mat("InsulatedPipeBrass", (0.68, 0.48, 0.24), 0.32, 0.80)
    accent_red = make_mat("ValveWheelRed", (0.76, 0.14, 0.12), 0.35, 0.25)

    # 하부 H빔 스키드 프레임
    for y in (-0.68, 0.68):
        add_box("SteelSkidBeam", (2.65, 0.12, 0.14), (0.0, y, 0.07), skid_dark, 0.008)
    for x in (-1.20, 0.0, 1.20):
        add_box("SteelSkidCross", (0.12, 1.48, 0.12), (x, 0.0, 0.06), skid_dark, 0.008)

    # 좌측 듀얼 팬 대형 공조기(Chiller)
    add_box("DualChillerCabinet", (1.35, 1.12, 1.18), (-0.56, 0.0, 0.73), hvac_sheet, 0.016)
    for fx in (-0.88, -0.24):
        add_cyl("TopExhaustShroud", 0.27, 0.18, (fx, 0.0, 1.38), skid_dark, vertices=32)
        add_cyl("FanHubCore", 0.08, 0.12, (fx, 0.0, 1.39), copper_pipe, vertices=20)
        for b in range(4):
            ang = b * PI * 0.5 + 0.35
            add_box("FanBlade", (0.42, 0.07, 0.015), (fx, 0.0, 1.39), hvac_sheet, 0.003, rot=(0.25, 0.0, ang))
    for lz in (0.42, 0.64, 0.86, 1.08):
        add_box("FrontIntakeLouver", (1.18, 0.03, 0.06), (-0.56, -0.57, lz), skid_dark, 0.004, rot=(0.35, 0.0, 0.0))

    # 우측 원통형 옥상 물탱크 & 점검 사다리
    add_cyl("WaterTankPedestal", 0.56, 0.24, (0.72, 0.0, 0.26), skid_dark, vertices=32)
    add_cyl("RooftopWaterTankBody", 0.54, 1.62, (0.72, 0.0, 1.18), tank_teal, vertices=36)
    add_sphere("WaterTankDomeCap", (0.54, 0.54, 0.24), (0.72, 0.0, 1.98), tank_teal)
    add_cyl("TankTopManhole", 0.18, 0.12, (0.72, 0.0, 2.22), skid_dark, vertices=24)

    for lx in (0.56, 0.88):
        add_pipe_curve("InspectionLadderRail", [(lx, -0.58, 0.14), (lx, -0.58, 2.18)], 0.016, skid_dark)
    for rz in (0.45, 0.78, 1.11, 1.44, 1.77, 2.08):
        add_pipe_curve("InspectionLadderRung", [(0.56, -0.58, rz), (0.88, -0.58, rz)], 0.011, skid_dark)

    # 연결 배관 매니폴드 & 적색 밸브 핸들
    add_pipe_curve(
        "ChillerSupplyPipe",
        [(-0.02, -0.32, 0.95), (0.20, -0.32, 0.95), (0.20, -0.32, 0.52), (0.42, -0.32, 0.52)],
        0.042,
        copper_pipe,
    )
    add_cyl("ShutoffValveWheel", 0.09, 0.025, (0.20, -0.39, 0.74), accent_red, rot=(PI / 2, 0.0, 0.0), vertices=20)


# 4. 오픈 카페 어닝 부스 & 테라스 키오스크 세트 V9
def build_cafe_terrace_kiosk_set_v9() -> None:
    walnut = make_mat("CafeWarmWalnut", (0.36, 0.22, 0.12), 0.52)
    cream_wall = make_mat("CafeStuccoCream", (0.91, 0.87, 0.80), 0.68)
    sage_awning = make_mat("CafeSageCanvas", (0.20, 0.39, 0.32), 0.78)
    brass = make_mat("CafeEspressoBrass", (0.72, 0.53, 0.24), 0.26, 0.86)
    chrome = make_mat("CafeMachineChrome", (0.76, 0.79, 0.82), 0.18, 0.92)
    warm_lamp = make_mat("CafePendantBulb", (1.0, 0.84, 0.55), 0.22, emission=1.8)

    # 우드 데크 플로어 & 후면 우드 루버 벽체
    add_box("CafeTerraceDeck", (3.10, 2.20, 0.10), (0.0, 0.0, 0.05), walnut, 0.012)
    add_box("CafeBackWall", (2.90, 0.16, 2.35), (0.0, 0.96, 1.275), cream_wall, 0.014)
    for sx in (-1.28, -0.96, -0.64, -0.32, 0.0, 0.32, 0.64, 0.96, 1.28):
        add_box("BackWallWoodSlat", (0.06, 0.05, 2.15), (sx, 0.86, 1.25), walnut, 0.005)

    # 전면 서비스 카운터 & 에스프레소 머신·패스트리 쇼케이스
    add_box("BaristaCounterBase", (2.10, 0.62, 0.96), (-0.32, 0.18, 0.58), cream_wall, 0.014)
    add_box("BaristaCounterWoodTop", (2.22, 0.72, 0.06), (-0.32, 0.18, 1.09), walnut, 0.010)
    add_box("EspressoMachineBody", (0.58, 0.42, 0.44), (-0.78, 0.20, 1.34), chrome, 0.014)
    add_box("EspressoBrassTrim", (0.60, 0.44, 0.05), (-0.78, 0.20, 1.57), brass, 0.006)
    for gx in (-0.92, -0.64):
        add_cyl("EspressoGroupHead", 0.045, 0.08, (gx, -0.02, 1.30), brass, vertices=20)
    add_box("PastryDisplayCase", (0.68, 0.44, 0.46), (0.24, 0.18, 1.35), chrome, 0.010)

    # 상단 캐노피 프레임·어닝·펜던트 조명
    for px in (-1.38, 1.38):
        add_box("CanopyCornerPost", (0.09, 0.09, 2.22), (px, -0.92, 1.21), walnut, 0.008)
    add_box("SlopedFabricAwning", (3.06, 2.18, 0.09), (0.0, 0.02, 2.52), sage_awning, 0.012, rot=(0.14, 0.0, 0.0))
    for lx in (-0.75, 0.55):
        add_sphere("WarmPendantGlobe", (0.09, 0.09, 0.09), (lx, -0.25, 2.18), warm_lamp)

    # 전면 비스트로 원탁 & 의자 2개
    add_cyl("BistroTableBase", 0.22, 0.03, (0.88, -0.58, 0.12), brass, vertices=24)
    add_cyl("BistroTableStem", 0.035, 0.68, (0.88, -0.58, 0.46), brass, vertices=20)
    add_cyl("BistroTableTop", 0.38, 0.04, (0.88, -0.58, 0.81), cream_wall, vertices=32)
    for cx_off in (0.36, 1.36):
        add_cyl("BistroStoolSeat", 0.18, 0.05, (cx_off, -0.58, 0.50), sage_awning, vertices=24)
        add_cyl("BistroStoolColumn", 0.03, 0.40, (cx_off, -0.58, 0.30), walnut, vertices=16)


# 5. 판타지 각성 룬 관문·성소 제단 V9
def build_arcane_portal_sanctum_v9() -> None:
    obsidian = make_mat("SanctumObsidianStone", (0.12, 0.13, 0.17), 0.56, 0.18)
    marble = make_mat("SanctumPaleMarble", (0.80, 0.82, 0.86), 0.38)
    gold = make_mat("SanctumOrichalcumGold", (0.78, 0.58, 0.22), 0.24, 0.90)
    rune_cyan = make_mat("SanctumManaCyan", (0.16, 0.84, 0.96), 0.15, emission=2.8)
    ember = make_mat("SanctumBrazierFlame", (1.0, 0.45, 0.12), 0.20, emission=2.2)

    # 3단 팔각 석조 단상
    for step_idx, (rad, h, z) in enumerate(((1.72, 0.20, 0.10), (1.38, 0.20, 0.30), (1.04, 0.20, 0.50))):
        add_cyl(f"OctagonDaisTier{step_idx + 1}", rad, h, (0.0, 0.0, z), obsidian if step_idx % 2 == 0 else marble, vertices=8)

    # 4기 고대 룬 오벨리스크 기둥
    for angle in (PI * 0.22, PI * 0.78, -PI * 0.22, -PI * 0.78):
        px = math.cos(angle) * 1.22
        py = math.sin(angle) * 1.22
        add_box("ObeliskPlinth", (0.36, 0.36, 0.34), (px, py, 0.56), obsidian, 0.012)
        add_cone("ObeliskShaft", 0.16, 0.10, 2.05, (px, py, 1.74), marble, vertices=6)
        add_cone("ObeliskGoldCap", 0.11, 0.01, 0.28, (px, py, 2.90), gold, vertices=6)
        add_sphere("ObeliskFloatingRune", (0.08, 0.08, 0.14), (px, py, 3.22), rune_cyan)

    # 중앙 이중 마법 포털 링 & 부유 각성 수정 코어
    ring_outer_pts = [(1.12 * math.cos(i * TAU / 64), 0.0, 2.15 + 1.12 * math.sin(i * TAU / 64)) for i in range(64)]
    ring_inner_pts = [(0.86 * math.cos(i * TAU / 56), 0.0, 2.15 + 0.86 * math.sin(i * TAU / 56)) for i in range(56)]
    add_pipe_curve("PortalOuterOrichalcumRing", ring_outer_pts, 0.075, gold, cyclic=True)
    add_pipe_curve("PortalInnerManaRing", ring_inner_pts, 0.038, rune_cyan, cyclic=True)
    add_cone("PortalCrystalUpper", 0.26, 0.01, 0.58, (0.0, 0.0, 2.44), rune_cyan, vertices=6)
    add_cone("PortalCrystalLower", 0.26, 0.01, 0.58, (0.0, 0.0, 1.86), rune_cyan, rot=(PI, 0.0, 0.0), vertices=6)

    # 전면 성소 청동 화로 2기
    for bx in (-0.68, 0.68):
        add_cyl("SanctumBrazierStand", 0.14, 0.56, (bx, -1.16, 0.48), gold, vertices=16)
        add_cone("SanctumBrazierBowl", 0.10, 0.24, 0.18, (bx, -1.16, 0.82), obsidian, vertices=18)
        add_sphere("SanctumBrazierEmber", (0.14, 0.14, 0.18), (bx, -1.16, 0.96), ember)


# 6. 웹툰 8등신 캐릭터 조형 마네킹·코트 칼라 흉상 V9
def build_stylized_hero_mannequin_bust_v9() -> None:
    clay_skin = make_mat("SculptEcorcheClay", (0.86, 0.78, 0.72), 0.46)
    coat_navy = make_mat("HeroHighCollarCoat", (0.11, 0.15, 0.24), 0.62)
    gold_trim = make_mat("HeroEpauletteGold", (0.78, 0.59, 0.24), 0.28, 0.88)
    pedestal_dark = make_mat("BustPedestalSlate", (0.15, 0.16, 0.18), 0.42, 0.35)
    hair_slate = make_mat("StylizedHairVolume", (0.18, 0.20, 0.26), 0.50)

    # 원형 전시 페데스탈 기단
    add_cyl("PedestalBaseDisc", 0.24, 0.06, (0.0, 0.0, 0.03), pedestal_dark, vertices=40)
    add_cyl("PedestalGoldRing", 0.21, 0.025, (0.0, 0.0, 0.072), gold_trim, vertices=40)
    add_cone("PedestalColumn", 0.14, 0.10, 0.18, (0.0, 0.0, 0.17), pedestal_dark, vertices=32)

    # 흉곽·쇄골·삼각근 아나토미 볼륨 (정면 V존 노출)
    add_sphere("AnatomicalRibcageTorso", (0.175, 0.125, 0.22), (0.0, 0.01, 0.49), clay_skin)
    add_cyl("AnatomicalWaistTaper", 0.115, 0.16, (0.0, 0.01, 0.31), clay_skin, vertices=28)
    for sx in (-1.0, 1.0):
        add_pipe_curve(
            "ClavicleRidge",
            [(sx * 0.02, -0.105, 0.65), (sx * 0.10, -0.095, 0.665), (sx * 0.19, -0.04, 0.655)],
            0.014,
            clay_skin,
        )
        add_sphere("DeltoidShoulderCap", (0.088, 0.085, 0.098), (sx * 0.225, 0.01, 0.615), coat_navy)

    # 개방형 U자 하이칼라 롱코트 라펠 & 황금 견장(Epaulette)
    collar_arc = [
        (0.155 * math.cos(a), 0.145 * math.sin(a) + 0.02, 0.72 + 0.03 * math.sin(a))
        for a in [(-0.22 + 1.44 * i / 18) * PI for i in range(19)]
    ]
    add_pipe_curve("OpenHighCollarRim", collar_arc, 0.032, coat_navy, cyclic=False)
    add_box("CoatBackMantle", (0.34, 0.08, 0.30), (0.0, 0.095, 0.54), coat_navy, 0.014)
    for sx in (-1.0, 1.0):
        add_box("CoatFrontLapel", (0.105, 0.048, 0.32), (sx * 0.145, -0.088, 0.50), coat_navy, 0.010, rot=(0.08, sx * 0.16, -sx * 0.22))
        add_box("LapelGoldTrim", (0.022, 0.052, 0.28), (sx * 0.098, -0.096, 0.51), gold_trim, 0.004, rot=(0.08, sx * 0.16, -sx * 0.22))
        add_box("ShoulderEpaulettePlate", (0.13, 0.12, 0.032), (sx * 0.235, 0.01, 0.695), gold_trim, 0.008, rot=(0.0, sx * 0.18, 0.0))

    # 목(흉쇄유돌근 기둥) & 웹툰 8등신 두상·턱선·코 능선·헤어 볼륨
    add_cyl("AnatomicalNeck", 0.056, 0.16, (0.0, -0.005, 0.74), clay_skin, rot=(0.05, 0.0, 0.0), vertices=28)
    add_sphere("StylizedCranium", (0.108, 0.120, 0.124), (0.0, 0.005, 0.925), clay_skin)
    add_cone("StylizedJawChinWedge", 0.088, 0.024, 0.125, (0.0, -0.032, 0.848), clay_skin, rot=(PI + 0.16, 0.0, 0.0), vertices=16)
    add_box("NoseBridgePlane", (0.018, 0.030, 0.048), (0.0, -0.112, 0.90), clay_skin, 0.005, rot=(-0.22, 0.0, 0.0))
    for sx in (-1.0, 1.0):
        add_sphere("StylizedEar", (0.018, 0.028, 0.040), (sx * 0.108, 0.005, 0.895), clay_skin)

    # 레이어드 웹툰 헤어 실루엣 블록
    add_sphere("HairCrownMass", (0.118, 0.130, 0.102), (0.0, 0.015, 0.98), hair_slate)
    for sx, ang in ((-0.052, -0.22), (0.0, 0.0), (0.052, 0.22)):
        add_cone("FrontFringeLock", 0.032, 0.005, 0.115, (sx, -0.106, 0.965), hair_slate, rot=(PI - 0.30, 0.0, ang), vertices=12)


ASSET_SPECS = [
    ("convenience_storefront_v9", "한국형 편의점·상가 파사드 V9", build_convenience_storefront_v9),
    ("urban_utility_pole_cluster_v9", "도심 전신주·변압기·가로등 클러스터 V9", build_urban_utility_pole_cluster_v9),
    ("rooftop_hvac_watertank_rig_v9", "옥상 대형 공조기·물탱크·배관 설비 V9", build_rooftop_hvac_watertank_rig_v9),
    ("cafe_terrace_kiosk_set_v9", "오픈 카페 어닝 부스·테라스 키오스크 V9", build_cafe_terrace_kiosk_set_v9),
    ("arcane_portal_sanctum_v9", "판타지 각성 룬 관문·성소 제단 V9", build_arcane_portal_sanctum_v9),
    ("stylized_hero_mannequin_bust_v9", "웹툰 8등신 캐릭터 조형 마네킹 흉상 V9", build_stylized_hero_mannequin_bust_v9),
]


def verify_glb(glb_path: Path) -> dict[str, int]:
    raw = glb_path.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", raw, 0)
    json_len, json_type = struct.unpack_from("<II", raw, 12)
    if magic != b"glTF" or version != 2 or total != len(raw) or json_type != 0x4E4F534A:
        raise RuntimeError(f"유효하지 않은 GLB 헤더: {glb_path}")
    doc = json.loads(raw[20 : 20 + json_len])
    if any("uri" in b for b in doc.get("buffers", [])) or any("uri" in img for img in doc.get("images", [])):
        raise RuntimeError(f"외부 URI 참조가 감지되었습니다: {glb_path}")
    triangles = sum(
        doc["accessors"][prim["indices"]]["count"] // 3
        for mesh in doc.get("meshes", [])
        for prim in mesh.get("primitives", [])
        if "indices" in prim
    )
    return {
        "bytes": len(raw),
        "meshes": len(doc.get("meshes", [])),
        "materials": len(doc.get("materials", [])),
        "triangles": triangles,
    }


def render_thumbnail(thumb_path: Path, low: Vector, high: Vector) -> None:
    scene = bpy.context.scene
    size = high - low
    center = (low + high) * 0.5
    extent = max(size.x, size.y, size.z, 0.5)

    stage_objs: list[bpy.types.Object] = []
    cam_dir = Vector((1.35, -2.15, 1.05)).normalized()
    bpy.ops.object.camera_add(location=center + cam_dir * extent * 3.1)
    cam = bpy.context.object
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = extent * 1.45
    scene.camera = cam
    stage_objs.append(cam)

    for label, offset, power, color in (
        ("Key", (-2.0, -2.8, 3.6), 420.0, (1.0, 0.92, 0.82)),
        ("Fill", (2.8, -1.2, 2.0), 210.0, (0.76, 0.88, 1.0)),
        ("Rim", (0.8, 2.8, 3.2), 380.0, (0.95, 0.96, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=center + Vector(offset) * extent)
        light = bpy.context.object
        light.name = f"PREVIEW_{label}"
        light.data.energy = power * (extent**2)
        light.data.size = extent * 2.2
        light.data.color = color
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
        stage_objs.append(light)

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(thumb_path)
    bpy.ops.render.render(write_still=True)

    for stage_obj in stage_objs:
        bpy.data.objects.remove(stage_obj, do_unlink=True)


def run_pack_generation() -> dict[str, dict[str, object]]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    summary: dict[str, dict[str, object]] = {}
    prev_scene = bpy.context.window.scene if bpy.context.window is not None else None

    try:
        for slug, label_ko, builder in ASSET_SPECS:
            clear_scene()
            builder()
            low, high = ground_all_meshes()
            dims = high - low

            root = bpy.data.objects.new(f"TS_{slug}", None)
            root["asset_id"] = slug
            root["asset_label_ko"] = label_ko
            root["asset_generator"] = "scripts/blender/generate_kitbash_modeling_pack_v9.py"
            root["asset_license"] = "CC0-1.0"
            root["units"] = "metres"
            bpy.context.scene.collection.objects.link(root)
            for obj in list(bpy.context.scene.objects):
                if obj.type == "MESH":
                    obj.parent = root

            glb_path = OUTPUT_DIR / f"{slug}.glb"
            bpy.ops.export_scene.gltf(
                filepath=str(glb_path),
                export_format="GLB",
                use_active_scene=True,
                export_apply=True,
                export_extras=True,
                export_materials="EXPORT",
                export_cameras=False,
                export_lights=False,
                export_animations=False,
            )
            receipt = verify_glb(glb_path)
            thumb_path = THUMB_DIR / f"{slug}.png"
            render_thumbnail(thumb_path, low, high)
            summary[slug] = {
                "labelKo": label_ko,
                "dimensionsM": [round(dims.x, 3), round(dims.y, 3), round(dims.z, 3)],
                **receipt,
            }
            print(f"KITBASH_V9_OK {slug}: {json.dumps(summary[slug], ensure_ascii=False)}", flush=True)
    finally:
        export_scene = bpy.data.scenes.get("KitbashV9_Export_Scene")
        if prev_scene is not None and prev_scene.name != "KitbashV9_Export_Scene" and bpy.context.window is not None:
            bpy.context.window.scene = prev_scene
            if export_scene is not None:
                for obj in list(export_scene.objects):
                    bpy.data.objects.remove(obj, do_unlink=True)
                bpy.data.scenes.remove(export_scene)

    manifest_path = OUTPUT_DIR / "kitbash-v9-manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "pack": "ToonStudio Kitbash Modeling Pack V9",
                "generator": "scripts/blender/generate_kitbash_modeling_pack_v9.py",
                "blenderVersion": bpy.app.version_string,
                "license": "CC0-1.0",
                "assets": summary,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return summary


if __name__ == "__main__":
    run_pack_generation()
