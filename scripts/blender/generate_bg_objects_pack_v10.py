"""ToonStudio Background Objects Pack V10 — 8종 고밀도 배경 전용 오브젝트 CC0-1.0 생성기.

배경 3D 및 배경 오브젝트 전용 범위:
- 캐릭터·데생인형·브러시 에셋이나 타 활성 세션의 Blender 장면(예: ToonStudio_Ecorche_Scene)을
  절대 건드리지 않도록 전용 임시 장면(KitbashV10_Export_Scene)과 생성 데이터블록 추적 집합만 사용한다.
- 모든 에셋은 미터(m) 휴먼스케일, 바닥 Z=0(glTF Y=0) 정렬, 베벨(Bevel)·가중 법선(Weighted Normal),
  5~7종 Principled BSDF 재질, 외부 URI 0개의 자체 포함 GLB 및 256×256 PNG 썸네일로 출력된다.
- 추가로 8종 전체를 한눈에 시각 검증할 수 있는 고해상도(1280×720) 2×4 턴테이블 컨택트 시트도 렌더링한다.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
import struct

import bpy
from mathutils import Vector

PI = math.pi
TAU = math.tau


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
OUTPUT_DIR = ROOT / "apps/web/public/assets/3d/kitbash-v10"
THUMB_DIR = OUTPUT_DIR / "thumbnails"

CREATED_OBJECTS: list[bpy.types.Object] = []
CREATED_MESHES: list[bpy.types.Mesh] = []
CREATED_CURVES: list[bpy.types.Curve] = []
CREATED_MATERIALS: dict[str, bpy.types.Material] = {}
CREATED_LIGHTS: list[bpy.types.Light] = []
CREATED_CAMERAS: list[bpy.types.Camera] = []


def get_export_scene() -> bpy.types.Scene:
    scene = bpy.data.scenes.get("KitbashV10_Export_Scene")
    if scene is None:
        scene = bpy.data.scenes.new("KitbashV10_Export_Scene")
        scene.unit_settings.system = "METRIC"
        scene.unit_settings.scale_length = 1.0
    if bpy.context.window is not None:
        bpy.context.window.scene = scene
    return scene


def clear_v10_only() -> None:
    scene = get_export_scene()
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    CREATED_OBJECTS.clear()
    for mesh in list(CREATED_MESHES):
        if mesh.name in bpy.data.meshes and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    CREATED_MESHES.clear()
    for curve in list(CREATED_CURVES):
        if curve.name in bpy.data.curves and curve.users == 0:
            bpy.data.curves.remove(curve)
    CREATED_CURVES.clear()
    for mat in list(CREATED_MATERIALS.values()):
        if mat.name in bpy.data.materials and mat.users == 0:
            bpy.data.materials.remove(mat)
    CREATED_MATERIALS.clear()
    for light in list(CREATED_LIGHTS):
        if light.name in bpy.data.lights and light.users == 0:
            bpy.data.lights.remove(light)
    CREATED_LIGHTS.clear()
    for cam in list(CREATED_CAMERAS):
        if cam.name in bpy.data.cameras and cam.users == 0:
            bpy.data.cameras.remove(cam)
    CREATED_CAMERAS.clear()


def set_active(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def make_mat(
    key: str,
    color: tuple[float, float, float],
    roughness: float = 0.48,
    metallic: float = 0.0,
    emission: float = 0.0,
    alpha: float = 1.0,
) -> bpy.types.Material:
    mat_name = f"TSV10_{key}"
    if mat_name in CREATED_MATERIALS:
        return CREATED_MATERIALS[mat_name]
    mat = bpy.data.materials.new(mat_name)
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
    CREATED_MATERIALS[mat_name] = mat
    return mat


def finish_mesh(
    obj: bpy.types.Object,
    mat: bpy.types.Material,
    bevel_width: float = 0.006,
    bevel_segments: int = 2,
    smooth: bool = True,
) -> bpy.types.Object:
    obj.name = f"V10_{obj.name}"
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    set_active(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel_width > 0.0:
        bevel = obj.modifiers.new("V10Bevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = bevel_segments
        bevel.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    if smooth and bevel_width > 0.0:
        wn = obj.modifiers.new("V10WeightedNormal", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
        wn.weight = 50
        bpy.ops.object.modifier_apply(modifier=wn.name)
    CREATED_OBJECTS.append(obj)
    if isinstance(obj.data, bpy.types.Mesh):
        CREATED_MESHES.append(obj.data)
    return obj


def add_box(
    name: str,
    size: tuple[float, float, float],
    loc: tuple[float, float, float],
    mat: bpy.types.Material,
    bevel: float = 0.008,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    safe_bevel = min(bevel, min(size) * 0.26)
    return finish_mesh(obj, mat, bevel_width=safe_bevel, bevel_segments=2, smooth=True)


def add_cyl(
    name: str,
    radius: float,
    depth: float,
    loc: tuple[float, float, float],
    mat: bpy.types.Material,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 28,
    bevel: float = 0.005,
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
    segments: int = 28,
    rings: int = 16,
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


def add_pipe(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    mat: bpy.types.Material,
    cyclic: bool = False,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"V10Curve_{name}", "CURVE")
    CREATED_CURVES.append(curve)
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    curve.use_fill_caps = True
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for pt, co in zip(spline.points, points):
        pt.co = (*co, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(f"V10_{name}", curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    set_active(obj)
    bpy.ops.object.convert(target="MESH")
    for poly in obj.data.polygons:
        poly.use_smooth = True
    CREATED_OBJECTS.append(obj)
    if isinstance(obj.data, bpy.types.Mesh):
        CREATED_MESHES.append(obj.data)
    return obj


def ground_scene_meshes() -> tuple[Vector, Vector]:
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


# 1. 골목길 2단 에어컨 실외기 앵글·가스계량기·배관 세트 V10
def build_alley_ac_meter_pipe_wall_v10() -> None:
    galv = make_mat("AlleyAngleGalv", (0.42, 0.45, 0.49), 0.36, 0.78)
    sheet = make_mat("AcIvorySheet", (0.83, 0.82, 0.78), 0.45, 0.18)
    grille_dark = make_mat("AcFanGrilleDark", (0.13, 0.15, 0.18), 0.42, 0.55)
    copper = make_mat("RefrigerantCopper", (0.72, 0.44, 0.22), 0.28, 0.86)
    meter_gray = make_mat("GasMeterEnamel", (0.56, 0.60, 0.63), 0.40, 0.48)
    valve_yellow = make_mat("GasSafetyYellow", (0.92, 0.68, 0.10), 0.35, 0.15)

    # 2단 철제 앵글 프레임 기둥 4본 및 선반 단
    for fx in (-0.48, 0.48):
        for fy in (-0.24, 0.24):
            add_box("RackAnglePost", (0.045, 0.045, 1.76), (fx, fy, 0.88), galv, 0.005)
    for fz in (0.14, 0.96):
        add_box("RackShelfFrame", (1.02, 0.52, 0.04), (0.0, 0.0, fz), galv, 0.006)

    # 하단·상단 에어컨 실외기 2기 + 팬 그릴·날개·측면 루버
    for idx, uz in enumerate((0.46, 1.28)):
        add_box(f"AcUnitCabinet{idx + 1}", (0.86, 0.38, 0.58), (0.0, 0.02, uz), sheet, 0.012)
        add_cyl(f"AcFanShroud{idx + 1}", 0.21, 0.03, (-0.12, -0.18, uz), grille_dark, rot=(PI / 2, 0.0, 0.0), vertices=32)
        add_cyl(f"AcFanHub{idx + 1}", 0.055, 0.04, (-0.12, -0.185, uz), copper, rot=(PI / 2, 0.0, 0.0), vertices=18)
        for b in range(3):
            ang = b * TAU / 3 + 0.3
            add_box(f"AcFanBlade{idx + 1}_{b}", (0.34, 0.012, 0.06), (-0.12, -0.18, uz), grille_dark, 0.002, rot=(0.0, ang, 0.18))
        add_box(f"AcControlPanel{idx + 1}", (0.18, 0.02, 0.42), (0.28, -0.18, uz), meter_gray, 0.004)

    # 우측 도시가스 계량기 & 황색 가스 배관·밸브 + 동관 묶음
    add_box("GasMeterBody", (0.28, 0.18, 0.34), (0.74, 0.06, 1.28), meter_gray, 0.012)
    add_box("GasMeterWindow", (0.16, 0.02, 0.07), (0.74, -0.04, 1.36), grille_dark, 0.003)
    add_pipe("GasSupplyPipe", [(0.66, 0.06, 0.05), (0.66, 0.06, 1.62), (0.74, 0.06, 1.62), (0.74, 0.06, 1.45)], 0.022, valve_yellow)
    add_pipe("GasOutletPipe", [(0.82, 0.06, 1.45), (0.82, 0.06, 1.84)], 0.022, valve_yellow)
    add_box("GasShutoffHandle", (0.09, 0.03, 0.025), (0.66, 0.01, 0.98), valve_yellow, 0.004)
    add_pipe("CopperCoolantLineA", [(0.44, 0.12, 0.38), (0.56, 0.12, 0.38), (0.56, 0.12, 1.72)], 0.018, copper)
    add_pipe("CopperCoolantLineB", [(0.44, 0.16, 1.20), (0.52, 0.16, 1.20), (0.52, 0.16, 1.72)], 0.015, copper)


# 2. 지하철 개찰구·교통카드 단말기·플랩 게이트 V10
def build_subway_turnstile_gate_set_v10() -> None:
    stainless = make_mat("TurnstileStainless", (0.74, 0.77, 0.80), 0.24, 0.90)
    obsidian = make_mat("TurnstileTopGlass", (0.10, 0.12, 0.15), 0.16, 0.20)
    flap_glass = make_mat("TurnstileFlapRedTint", (0.88, 0.24, 0.28), 0.14, 0.05, alpha=0.45)
    card_cyan = make_mat("CardReaderCyanGlow", (0.12, 0.76, 0.96), 0.18, emission=2.2)
    arrow_green = make_mat("GatePassArrowGreen", (0.15, 0.88, 0.45), 0.20, emission=2.0)
    tactile_yellow = make_mat("PlatformTactileTile", (0.88, 0.70, 0.14), 0.55)

    # 하단 플랫폼 데크 & 점자 유도 타일
    add_box("StationFloorPad", (1.68, 1.56, 0.05), (0.0, 0.0, 0.025), obsidian, 0.006)
    for tx in (-0.42, 0.0, 0.42):
        add_box("TactileGuideTile", (0.30, 0.30, 0.012), (tx, -0.58, 0.056), tactile_yellow, 0.003)

    # 좌·우 개찰구 게이트 하우징 2기 (통로 간격 0.58m)
    for gx in (-0.46, 0.46):
        add_box("GatePedestalBody", (0.26, 1.32, 0.94), (gx, 0.0, 0.52), stainless, 0.018)
        add_cyl("GateFrontNose", 0.13, 0.94, (gx, -0.66, 0.52), stainless, vertices=28, bevel=0.01)
        add_cyl("GateRearNose", 0.13, 0.94, (gx, 0.66, 0.52), stainless, vertices=28, bevel=0.01)
        add_box("GateTopDeckGlass", (0.24, 1.44, 0.04), (gx, 0.0, 1.00), obsidian, 0.008)
        # 전면 카드 태그 리더 패드 & 전면 녹색 진입 표시등
        add_box("CardTapReaderSlant", (0.16, 0.22, 0.05), (gx, -0.54, 1.03), obsidian, 0.006, rot=(0.24, 0.0, 0.0))
        add_cyl("CardTapGlowRing", 0.058, 0.012, (gx, -0.54, 1.06), card_cyan, rot=(0.24, 0.0, 0.0), vertices=24)
        add_box("FrontPassIndicator", (0.12, 0.02, 0.18), (gx, -0.79, 0.68), arrow_green, 0.004)

    # 중앙 양방향 강화유리 플랩 도어 한 쌍
    for sx in (-1.0, 1.0):
        add_box("GlassBarrierFlap", (0.23, 0.022, 0.66), (sx * 0.20, -0.05, 0.54), flap_glass, 0.004)
        add_cyl("FlapHingeShaft", 0.024, 0.70, (sx * 0.32, -0.05, 0.54), stainless, vertices=18)


# 3. 웹툰 작업실 듀얼 모니터·액정태블릿 작업 데스크 V10
def build_creator_dual_monitor_desk_v10() -> None:
    walnut = make_mat("DeskTopWalnut", (0.40, 0.26, 0.15), 0.48)
    matte_black = make_mat("DeskFrameMatte", (0.11, 0.12, 0.14), 0.38, 0.65)
    screen_ui = make_mat("PenDisplayCanvasGlow", (0.78, 0.88, 0.98), 0.15, emission=1.25)
    peg_white = make_mat("PegboardPowderWhite", (0.90, 0.91, 0.92), 0.52)
    warm_led = make_mat("DeskTaskBarLamp", (1.0, 0.90, 0.72), 0.20, emission=2.0)
    brass_cup = make_mat("StylusHolderBrass", (0.74, 0.56, 0.24), 0.28, 0.85)

    # 전동 모션데스크 T자 다리 및 월넛 상판
    for lx in (-0.68, 0.68):
        add_box("DeskFootRunner", (0.08, 0.64, 0.035), (lx, 0.0, 0.018), matte_black, 0.006)
        add_box("DeskLiftColumn", (0.07, 0.09, 0.70), (lx, 0.04, 0.38), matte_black, 0.006)
    add_box("DeskUnderCrossbar", (1.36, 0.08, 0.05), (0.0, 0.04, 0.71), matte_black, 0.005)
    add_box("MotionDeskHeightPad", (0.11, 0.05, 0.022), (0.56, -0.36, 0.725), matte_black, 0.004)
    add_box("WalnutDesktopSlab", (1.64, 0.78, 0.036), (0.0, 0.0, 0.755), walnut, 0.008)

    # 중앙 24인치 액정 펜 태블릿 + 틸트 스탠드 & 스타일러스 홀더
    add_box("PenTabletTiltStand", (0.34, 0.22, 0.16), (-0.10, -0.02, 0.85), matte_black, 0.008, rot=(0.48, 0.0, 0.0))
    add_box("PenDisplayChassis", (0.60, 0.36, 0.026), (-0.10, -0.10, 0.90), matte_black, 0.006, rot=(0.68, 0.0, 0.0))
    add_box("PenDisplayScreen", (0.54, 0.31, 0.006), (-0.10, -0.112, 0.912), screen_ui, 0.002, rot=(0.68, 0.0, 0.0))
    add_box("ShortcutTourBox", (0.09, 0.15, 0.022), (-0.48, -0.18, 0.785), matte_black, 0.005, rot=(0.0, 0.0, 0.22))
    add_cyl("StylusCupHolder", 0.038, 0.095, (0.30, -0.18, 0.82), brass_cup, vertices=24)
    add_cyl("StylusPenBody", 0.007, 0.15, (0.30, -0.18, 0.88), matte_black, rot=(0.18, 0.12, 0.0), vertices=14)

    # 좌상단 레퍼런스 서브 모니터 + 모니터 암 + 우측 타공판 선반 & 북스피커
    add_pipe("MonitorArmPost", [(-0.56, 0.30, 0.77), (-0.56, 0.30, 1.26), (-0.42, 0.16, 1.28)], 0.018, matte_black)
    add_box("SubRefMonitorBody", (0.52, 0.024, 0.32), (-0.42, 0.14, 1.28), matte_black, 0.005, rot=(0.08, 0.0, -0.32))
    add_box("SubRefMonitorPanel", (0.49, 0.006, 0.29), (-0.41, 0.128, 1.28), screen_ui, 0.002, rot=(0.08, 0.0, -0.32))
    add_box("BackPegboardPanel", (0.56, 0.022, 0.54), (0.46, 0.34, 1.05), peg_white, 0.005)
    add_box("PegboardMiniShelf", (0.36, 0.12, 0.018), (0.46, 0.27, 1.12), walnut, 0.004)
    for sx in (-0.70, 0.70):
        add_box("StudioMonitorSpeaker", (0.13, 0.16, 0.22), (sx, 0.20, 0.885), matte_black, 0.008)
    add_pipe("TaskLampArch", [(0.18, 0.32, 0.77), (0.18, 0.32, 1.42), (-0.08, 0.02, 1.44)], 0.012, matte_black)
    add_box("TaskLampLedBar", (0.42, 0.032, 0.018), (-0.08, 0.02, 1.43), warm_led, 0.004)


# 4. 도심 분리수거 스테이션·카페 입간판·볼라드 클러스터 V10
def build_street_recycling_station_a_board_v10() -> None:
    frame_slate = make_mat("RecycleSlateSteel", (0.16, 0.19, 0.23), 0.42, 0.68)
    bin_silver = make_mat("RecycleBodySilver", (0.72, 0.75, 0.78), 0.36, 0.55)
    lid_blue = make_mat("RecyclePlasticBlue", (0.14, 0.46, 0.82), 0.38)
    lid_green = make_mat("RecycleGlassGreen", (0.16, 0.58, 0.36), 0.38)
    lid_amber = make_mat("RecycleCanAmber", (0.88, 0.54, 0.12), 0.38)
    oak_wood = make_mat("SignBoardOak", (0.48, 0.31, 0.17), 0.56)
    chalk_slate = make_mat("ChalkboardMatte", (0.12, 0.14, 0.13), 0.82)

    # 분리수거 캐노피 쉘터 및 3구 분리수거 빈
    add_box("StationBasePad", (1.68, 0.78, 0.05), (-0.32, 0.0, 0.025), frame_slate, 0.008)
    for px in (-1.08, 0.44):
        add_box("ShelterSidePost", (0.06, 0.06, 1.48), (px, 0.26, 0.76), frame_slate, 0.006)
    add_box("ShelterSlopedRoof", (1.64, 0.82, 0.05), (-0.32, 0.04, 1.52), frame_slate, 0.008, rot=(0.18, 0.0, 0.0))

    for bx, lid_mat in ((-0.82, lid_blue), (-0.32, lid_green), (0.18, lid_amber)):
        add_box("RecycleBinBody", (0.42, 0.48, 0.86), (bx, 0.0, 0.48), bin_silver, 0.012)
        add_box("RecycleColorHood", (0.43, 0.50, 0.18), (bx, 0.0, 0.98), lid_mat, 0.012)
        add_cyl("RecycleThrowSlot", 0.075, 0.04, (bx, -0.24, 0.98), frame_slate, rot=(PI / 2, 0.0, 0.0), vertices=24)

    # 우측 원목 A보드 카페 입간판 + 전면 반사띠 볼라드 2기 (입간판 가림 방지 배치)
    for sy, tilt in ((-0.16, 0.22), (0.16, -0.22)):
        add_box("ABoardWoodFrame", (0.54, 0.04, 0.96), (0.82, sy - 0.06, 0.46), oak_wood, 0.008, rot=(tilt, 0.0, -0.22))
        add_box("ABoardChalkFace", (0.44, 0.012, 0.72), (0.82, sy - 0.06 + (-0.024 if sy < 0 else 0.024), 0.50), chalk_slate, 0.003, rot=(tilt, 0.0, -0.22))

    for bol_x in (-1.08, 1.32):
        add_cyl("StreetSteelBollard", 0.068, 0.78, (bol_x, -0.44, 0.39), frame_slate, vertices=28)
        add_cyl("BollardReflectBand", 0.071, 0.09, (bol_x, -0.44, 0.64), lid_amber, vertices=28)
        add_sphere("BollardDomeTop", (0.068, 0.068, 0.045), (bol_x, -0.44, 0.78), bin_silver)


# 5. 교실 와이드 칠판·교탁·3×3 사물함 세트 V10
def build_classroom_podium_locker_wall_v10() -> None:
    board_green = make_mat("ChalkboardGreen", (0.13, 0.30, 0.22), 0.62)
    alu_rail = make_mat("BoardAluminumFrame", (0.76, 0.78, 0.80), 0.28, 0.82)
    oak_podium = make_mat("PodiumWarmOak", (0.54, 0.36, 0.20), 0.52)
    locker_steel = make_mat("StudentLockerSteel", (0.68, 0.73, 0.78), 0.42, 0.45)
    locker_trim = make_mat("LockerDarkHandle", (0.18, 0.21, 0.25), 0.38, 0.60)
    wall_plaster = make_mat("ClassroomCreamWall", (0.91, 0.89, 0.84), 0.74)
    clock_white = make_mat("ClassroomClockFace", (0.94, 0.95, 0.96), 0.30)

    # 자립형 교실 전면 벽체 패널 & 하부 원목 웨인스코팅 걸레받이 (공중 부양 방지)
    add_box("ClassroomFrontWallBackdrop", (3.76, 0.12, 2.56), (0.14, 0.40, 1.28), wall_plaster, 0.010)
    add_box("ClassroomWoodWainscot", (3.78, 0.14, 0.78), (0.14, 0.39, 0.39), oak_podium, 0.008)

    # 좌측 와이드 칠판 + 알루미늄 몰딩 + 분필받이·지우개 + 상단 벽시계
    add_box("BlackboardBacking", (2.36, 0.05, 1.18), (-0.52, 0.32, 1.48), alu_rail, 0.008)
    add_box("BlackboardGreenSurface", (2.26, 0.02, 1.08), (-0.52, 0.29, 1.48), board_green, 0.003)
    add_box("ChalkTrayLedge", (2.36, 0.11, 0.035), (-0.52, 0.25, 0.88), alu_rail, 0.005)
    add_box("BoardEraserBlock", (0.16, 0.06, 0.045), (-0.12, 0.24, 0.92), oak_podium, 0.005)
    add_cyl("WallClockRim", 0.16, 0.04, (-0.52, 0.32, 2.28), locker_trim, rot=(PI / 2, 0.0, 0.0), vertices=32)
    add_cyl("WallClockDial", 0.14, 0.045, (-0.52, 0.315, 2.28), clock_white, rot=(PI / 2, 0.0, 0.0), vertices=32)

    # 전면 원목 교탁 & 구즈넥 마이크
    add_box("TeacherPodiumPlinth", (0.86, 0.56, 0.08), (-0.52, -0.34, 0.04), locker_trim, 0.006)
    add_box("TeacherPodiumBody", (0.80, 0.50, 0.96), (-0.52, -0.34, 0.56), oak_podium, 0.012)
    add_box("TeacherPodiumSlantTop", (0.88, 0.58, 0.05), (-0.52, -0.34, 1.06), oak_podium, 0.008, rot=(0.14, 0.0, 0.0))
    add_pipe("PodiumGooseneckMic", [(-0.32, -0.44, 1.08), (-0.32, -0.48, 1.28), (-0.38, -0.54, 1.34)], 0.008, locker_trim)

    # 우측 3×3 학생 철제 사물함 캐비닛 베이
    add_box("LockerBankCabinet", (1.16, 0.44, 1.78), (1.34, 0.12, 0.89), locker_steel, 0.012)
    for r in range(3):
        for c in range(3):
            lx = 0.98 + c * 0.36
            lz = 0.34 + r * 0.55
            add_box(f"LockerDoor_{r}_{c}", (0.33, 0.022, 0.51), (lx, -0.11, lz), locker_steel, 0.005)
            add_box(f"LockerHandle_{r}_{c}", (0.025, 0.03, 0.09), (lx + 0.11, -0.125, lz), locker_trim, 0.003)


# 6. 한옥 장독대 석단·옹기 항아리 군락·석등·기와담장 V10
def build_hanok_jangdokdae_courtyard_v10() -> None:
    granite = make_mat("JangdokGraniteStone", (0.64, 0.63, 0.60), 0.78)
    stucco = make_mat("HanokWallLime", (0.85, 0.81, 0.74), 0.74)
    giwa_dark = make_mat("HanokGiwaCharcoal", (0.19, 0.21, 0.24), 0.58)
    onggi_dark = make_mat("OnggiGlazeBrown", (0.24, 0.13, 0.08), 0.26)
    onggi_amber = make_mat("OnggiWarmTerracotta", (0.36, 0.19, 0.11), 0.32)
    lantern_glow = make_mat("StoneLanternWarmWindow", (1.0, 0.84, 0.52), 0.22, emission=1.9)

    # 후면 전통 토담 & 암수키와 지붕
    add_box("CourtyardWallBase", (2.86, 0.32, 0.36), (0.0, 0.78, 0.18), granite, 0.012)
    add_box("CourtyardStuccoWall", (2.80, 0.26, 1.15), (0.0, 0.78, 0.935), stucco, 0.012)
    add_box("GiwaWallEaveCap", (2.96, 0.48, 0.12), (0.0, 0.78, 1.56), giwa_dark, 0.014)
    for rx in [(-1.32 + i * 0.264) for i in range(11)]:
        add_cyl("GiwaRidgeRoll", 0.055, 0.52, (rx, 0.78, 1.64), giwa_dark, rot=(PI / 2, 0.0, 0.0), vertices=16)

    # 2단 장대석 장독대 석단
    add_box("JangdokTier1Stone", (2.10, 1.24, 0.18), (-0.28, -0.02, 0.09), granite, 0.014)
    add_box("JangdokTier2Stone", (1.86, 0.62, 0.18), (-0.28, 0.22, 0.27), granite, 0.014)

    # 배흘림 옹기 항아리 6기 (대독 3 · 중독 2 · 소독 1) + 전통 뚜껑
    jar_specs = [
        (-0.82, 0.22, 0.36, 0.24, 0.31, onggi_dark),
        (-0.28, 0.22, 0.36, 0.26, 0.34, onggi_amber),
        (0.26, 0.22, 0.36, 0.23, 0.30, onggi_dark),
        (-0.62, -0.32, 0.18, 0.18, 0.23, onggi_amber),
        (-0.08, -0.32, 0.18, 0.19, 0.24, onggi_dark),
        (0.38, -0.34, 0.18, 0.14, 0.18, onggi_amber),
    ]
    for idx, (jx, jy, base_z, rad, half_h, jmat) in enumerate(jar_specs):
        add_sphere(f"OnggiBellyJar_{idx}", (rad, rad, half_h), (jx, jy, base_z + half_h * 0.92), jmat)
        add_cyl(f"OnggiJarRim_{idx}", rad * 0.72, 0.05, (jx, jy, base_z + half_h * 1.76), jmat, vertices=28)
        add_cone(f"OnggiJarLid_{idx}", rad * 0.84, rad * 0.16, 0.09, (jx, jy, base_z + half_h * 1.84), onggi_dark, vertices=28)

    # 우측 전통 사각 화강암 석등
    add_box("LanternBasePlinth", (0.44, 0.44, 0.14), (1.06, -0.14, 0.07), granite, 0.010)
    add_cyl("LanternOctagonShaft", 0.10, 0.56, (1.06, -0.14, 0.42), granite, vertices=8)
    add_box("LanternLightChamber", (0.28, 0.28, 0.26), (1.06, -0.14, 0.84), granite, 0.008)
    add_box("LanternWarmCore", (0.20, 0.30, 0.16), (1.06, -0.14, 0.84), lantern_glow, 0.004)
    add_cone("LanternRoofCap", 0.34, 0.06, 0.20, (1.06, -0.14, 1.07), giwa_dark, vertices=4, rot=(0.0, 0.0, PI * 0.25))


# 7. 병원 복도 3인 대기 벤치·수액 폴대·호출 모니터 세트 V10
def build_hospital_corridor_station_v10() -> None:
    chrome = make_mat("HospitalChromeSteel", (0.78, 0.81, 0.84), 0.20, 0.92)
    mint_seat = make_mat("WardMintPowder", (0.32, 0.64, 0.62), 0.42, 0.25)
    frame_dark = make_mat("BenchBeamCharcoal", (0.18, 0.20, 0.23), 0.38, 0.65)
    ward_wall = make_mat("WardCleanWall", (0.92, 0.94, 0.95), 0.62)
    iv_bag = make_mat("SalineFluidPack", (0.72, 0.88, 0.96), 0.12, alpha=0.52)
    board_screen = make_mat("QueueMonitorGlow", (0.16, 0.58, 0.88), 0.18, emission=1.5)

    # 자립형 병원 복도 파티션 벽체 & 범퍼 핸드레일 (모니터·소독기 공중 부양 제거)
    add_box("HospitalCorridorWall", (2.36, 0.12, 2.08), (0.02, 0.38, 1.04), ward_wall, 0.010)
    add_box("HospitalWallBumperRail", (2.38, 0.05, 0.14), (0.02, 0.30, 0.88), mint_seat, 0.008)

    # 3인용 타공 스틸 병원 대기 벤치
    add_box("BenchMainSupportBeam", (1.68, 0.10, 0.08), (-0.28, -0.04, 0.36), frame_dark, 0.008)
    for lx in (-0.88, 0.32):
        add_box("BenchLegColumn", (0.07, 0.10, 0.34), (lx, -0.04, 0.19), chrome, 0.006)
        add_box("BenchFloorFoot", (0.09, 0.54, 0.03), (lx, -0.04, 0.015), chrome, 0.005)
    for sx in (-0.84, -0.28, 0.28):
        add_box("WardSeatPan", (0.48, 0.44, 0.035), (sx, -0.08, 0.42), mint_seat, 0.008, rot=(-0.05, 0.0, 0.0))
        add_box("WardSeatBack", (0.48, 0.035, 0.44), (sx, 0.15, 0.64), mint_seat, 0.008, rot=(-0.18, 0.0, 0.0))
    for ax in (-1.11, 0.55):
        add_pipe("BenchArmrestLoop", [(ax, 0.12, 0.42), (ax, -0.24, 0.58), (ax, -0.24, 0.38)], 0.016, chrome)

    # 우측 5발 이동식 스테인리스 IV 수액 폴대 & 수액팩 2조
    add_cyl("IvPoleCenterHub", 0.045, 0.08, (0.94, -0.08, 0.09), frame_dark, vertices=20)
    for i in range(5):
        ang = i * TAU / 5
        cx, cy = 0.94 + math.cos(ang) * 0.24, -0.08 + math.sin(ang) * 0.24
        add_pipe(f"IvSpiderLeg_{i}", [(0.94, -0.08, 0.09), (cx, cy, 0.05)], 0.014, chrome)
        add_cyl(f"IvCasterWheel_{i}", 0.028, 0.022, (cx, cy, 0.028), frame_dark, rot=(0.0, PI / 2, ang), vertices=16)
    add_cyl("IvTelescopicMast", 0.016, 1.68, (0.94, -0.08, 0.92), chrome, vertices=20)
    add_pipe("IvRamHornHookL", [(0.94, -0.08, 1.74), (0.80, -0.08, 1.78), (0.77, -0.08, 1.72)], 0.008, chrome)
    add_pipe("IvRamHornHookR", [(0.94, -0.08, 1.74), (1.08, -0.08, 1.78), (1.11, -0.08, 1.72)], 0.008, chrome)
    for bx in (0.80, 1.08):
        add_box("SalineFluidPouch", (0.10, 0.045, 0.21), (bx, -0.08, 1.56), iv_bag, 0.012)

    # 후면 벽걸이 진료 호출 디스플레이 & 손소독제 디스펜서 (벽면 밀착)
    add_box("QueueDisplayBezel", (0.96, 0.05, 0.56), (-0.28, 0.30, 1.52), frame_dark, 0.008)
    add_box("QueueDisplayScreen", (0.90, 0.012, 0.50), (-0.28, 0.272, 1.52), board_screen, 0.003)
    add_box("SanitizerDispenser", (0.13, 0.10, 0.26), (0.48, 0.27, 1.28), make_mat("DispenserWhite", (0.93, 0.95, 0.96), 0.32), 0.010)


# 8. 판타지 마탑 아치 서가·연금술 포션·촛대 세트 V10
def build_fantasy_alchemy_bookshelf_rack_v10() -> None:
    dark_oak = make_mat("GrimoireDarkOak", (0.24, 0.15, 0.09), 0.56)
    brass_ornate = make_mat("AlchemyOrnateBrass", (0.76, 0.57, 0.22), 0.26, 0.88)
    book_crimson = make_mat("TomeCrimsonLeather", (0.52, 0.12, 0.15), 0.62)
    book_indigo = make_mat("TomeArcaneIndigo", (0.16, 0.20, 0.44), 0.60)
    potion_cyan = make_mat("ManaElixirGlow", (0.14, 0.84, 0.96), 0.12, emission=2.4)
    potion_magenta = make_mat("VitalityElixirGlow", (0.92, 0.22, 0.58), 0.12, emission=2.1)
    candle_flame = make_mat("BeeswaxCandleFlame", (1.0, 0.72, 0.24), 0.20, emission=2.6)

    # 고딕 아치 서가 본체 및 선반 4단 (아치 반경 기둥 내측 정합)
    add_box("BookshelfPlinth", (1.56, 0.48, 0.12), (-0.18, 0.0, 0.06), dark_oak, 0.010)
    for sx in (-0.90, 0.54):
        add_box("BookshelfSidePillar", (0.10, 0.44, 2.08), (sx, 0.0, 1.16), dark_oak, 0.010)
        add_sphere("PillarBrassFinial", (0.055, 0.055, 0.075), (sx, 0.0, 2.24), brass_ornate)
    add_box("BookshelfBackPanel", (1.48, 0.04, 2.06), (-0.18, 0.20, 1.15), dark_oak, 0.006)
    for sz in (0.58, 1.06, 1.54, 2.02):
        add_box("BookshelfPlank", (1.42, 0.40, 0.04), (-0.18, 0.0, sz), dark_oak, 0.006)
    arch_pts = [(-0.18 + 0.68 * math.cos(PI * i / 20), 0.0, 2.04 + 0.32 * math.sin(PI * i / 20)) for i in range(21)]
    add_pipe("GothicCrownArch", arch_pts, 0.048, brass_ornate)

    # 다단 고서(Grimoire) 묶음 블록 8조
    book_rows = [
        (-0.72, 0.74, 0.28, book_crimson),
        (-0.48, 0.72, 0.25, book_indigo),
        (-0.18, 0.75, 0.30, brass_ornate),
        (0.18, 0.73, 0.26, book_crimson),
        (-0.68, 1.22, 0.27, book_indigo),
        (-0.36, 1.24, 0.29, book_crimson),
        (-0.70, 1.70, 0.26, brass_ornate),
        (0.22, 1.71, 0.28, book_indigo),
    ]
    for idx, (bx, bz, bh, bmat) in enumerate(book_rows):
        add_box(f"GrimoireCluster_{idx}", (0.18, 0.26, bh), (bx, -0.02, bz), bmat, 0.006)

    # 발광 마나·엘릭서 연금술 플라스크 4기 + 우측 황동 3구 스탠드 촛대
    for px, pz, pmat in ((-0.02, 1.18, potion_cyan), (0.24, 1.18, potion_magenta), (-0.28, 1.66, potion_cyan), (-0.04, 1.66, potion_magenta)):
        add_sphere("AlchemyPotionFlask", (0.075, 0.075, 0.085), (px, -0.04, pz), pmat)
        add_cyl("AlchemyFlaskNeck", 0.024, 0.07, (px, -0.04, pz + 0.095), brass_ornate, vertices=18)

    add_cyl("CandelabraBase", 0.18, 0.05, (0.86, -0.08, 0.025), brass_ornate, vertices=28)
    add_cyl("CandelabraStem", 0.026, 1.22, (0.86, -0.08, 0.66), brass_ornate, vertices=20)
    add_pipe("CandelabraBranch", [(0.68, -0.08, 1.28), (0.86, -0.08, 1.18), (1.04, -0.08, 1.28)], 0.015, brass_ornate)
    for cx in (0.68, 0.86, 1.04):
        add_cyl("WaxCandleStick", 0.022, 0.16, (cx, -0.08, 1.38), stucco := make_mat("BeeswaxIvory", (0.94, 0.90, 0.78), 0.45), vertices=16)
        add_sphere("CandleFlameGlow", (0.020, 0.020, 0.042), (cx, -0.08, 1.49), candle_flame)


ASSET_SPECS = [
    ("alley_ac_meter_pipe_wall_v10", "골목길 2단 실외기·가스계량기·배관 세트 (V10)", build_alley_ac_meter_pipe_wall_v10),
    ("subway_turnstile_gate_set_v10", "지하철 개찰구·교통카드 플랩 게이트 (V10)", build_subway_turnstile_gate_set_v10),
    ("creator_dual_monitor_desk_v10", "웹툰 작업실 듀얼모니터·액정태블릿 데스크 (V10)", build_creator_dual_monitor_desk_v10),
    ("street_recycling_station_a_board_v10", "도심 분리수거 스테이션·입간판·볼라드 (V10)", build_street_recycling_station_a_board_v10),
    ("classroom_podium_locker_wall_v10", "교실 와이드 칠판·교탁·3×3 사물함 (V10)", build_classroom_podium_locker_wall_v10),
    ("hanok_jangdokdae_courtyard_v10", "한옥 장독대 석단·옹기 군락·석등·기와담장 (V10)", build_hanok_jangdokdae_courtyard_v10),
    ("hospital_corridor_station_v10", "병원 복도 대기석·수액 폴대·호출 보드 (V10)", build_hospital_corridor_station_v10),
    ("fantasy_alchemy_bookshelf_rack_v10", "판타지 마탑 아치 서가·포션·촛대 세트 (V10)", build_fantasy_alchemy_bookshelf_rack_v10),
]


def verify_glb(glb_path: Path) -> dict[str, int]:
    raw = glb_path.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", raw, 0)
    json_len, json_type = struct.unpack_from("<II", raw, 12)
    if magic != b"glTF" or version != 2 or total != len(raw) or json_type != 0x4E4F534A:
        raise RuntimeError(f"유효하지 않은 GLB 헤더: {glb_path}")
    doc = json.loads(raw[20 : 20 + json_len])
    if any("uri" in b for b in doc.get("buffers", [])) or any("uri" in img for img in doc.get("images", [])):
        raise RuntimeError(f"외부 URI 참조 감지: {glb_path}")
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


def render_preview(thumb_path: Path, low: Vector, high: Vector, res_x: int = 256, res_y: int = 256) -> None:
    scene = bpy.context.scene
    size = high - low
    center = (low + high) * 0.5
    extent = max(size.x, size.y, size.z, 0.5)

    stage_objs: list[bpy.types.Object] = []
    cam_dir = Vector((1.28, -2.25, 1.08)).normalized()
    bpy.ops.object.camera_add(location=center + cam_dir * extent * 3.1)
    cam = bpy.context.object
    CREATED_CAMERAS.append(cam.data)
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = extent * 1.42
    scene.camera = cam
    stage_objs.append(cam)

    for label, offset, power, color in (
        ("Key", (-2.0, -2.8, 3.6), 440.0, (1.0, 0.93, 0.84)),
        ("Fill", (2.8, -1.2, 2.0), 220.0, (0.78, 0.89, 1.0)),
        ("Rim", (0.8, 2.8, 3.2), 390.0, (0.95, 0.96, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=center + Vector(offset) * extent)
        light = bpy.context.object
        CREATED_LIGHTS.append(light.data)
        light.name = f"V10_PREVIEW_{label}"
        light.data.energy = power * (extent**2)
        light.data.size = extent * 2.2
        light.data.color = color
        light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
        stage_objs.append(light)

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(thumb_path)
    bpy.ops.render.render(write_still=True)

    for stage_obj in stage_objs:
        bpy.data.objects.remove(stage_obj, do_unlink=True)


def run_v10_generation() -> dict[str, dict[str, object]]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    summary: dict[str, dict[str, object]] = {}
    prev_scene = bpy.context.window.scene if bpy.context.window is not None else None

    try:
        for slug, label_ko, builder in ASSET_SPECS:
            clear_v10_only()
            builder()
            low, high = ground_scene_meshes()
            dims = high - low

            root = bpy.data.objects.new(f"TS_{slug}", None)
            CREATED_OBJECTS.append(root)
            root["asset_id"] = slug
            root["asset_label_ko"] = label_ko
            root["asset_generator"] = "scripts/blender/generate_bg_objects_pack_v10.py"
            root["asset_license"] = "CC0-1.0"
            root["asset_scope"] = "bg3d-background-object-only"
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
            render_preview(thumb_path, low, high, 256, 256)
            summary[slug] = {
                "labelKo": label_ko,
                "dimensionsM": [round(dims.x, 3), round(dims.y, 3), round(dims.z, 3)],
                **receipt,
            }
            print(f"BG_V10_OK {slug}: {json.dumps(summary[slug], ensure_ascii=False)}", flush=True)
    finally:
        clear_v10_only()
        export_scene = bpy.data.scenes.get("KitbashV10_Export_Scene")
        if prev_scene is not None and prev_scene.name != "KitbashV10_Export_Scene" and bpy.context.window is not None:
            bpy.context.window.scene = prev_scene
            if export_scene is not None:
                bpy.data.scenes.remove(export_scene)

    manifest_path = OUTPUT_DIR / "kitbash-v10-manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "pack": "ToonStudio Background Objects Modeling Pack V10",
                "scope": "background-3d-and-background-objects-only",
                "generator": "scripts/blender/generate_bg_objects_pack_v10.py",
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
    run_v10_generation()
