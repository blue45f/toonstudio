"""ToonStudio 브랜드 4:5 세로 인물 포트레이트 WebP 렌더러 (`character-pink` · `character-blue`).

Hero VRM 1.0 SSOT 아바타(`romance-female.vrm`, `rofan-empress.vrm`)를 Blender 5.3 EEVEE
아틀리에 포트레이트 세팅(약한 하이-앵글 88mm 렌즈 · 3/4 자연 포즈 · 미소 표정 ·
BVH 헤어-의상 0-관통 보정 · 턱밑 submental 소프트 툰 그림자 및 턱선 컨투어 강조 ·
3점 림 조명 · 4:5 세로 구도)으로 1440×1800 PNG 렌더한 뒤,
`/opt/homebrew/bin/ffmpeg` + `/opt/homebrew/bin/cwebp`로
네이티브 4:5 다중 해상도 WebP(`960×1200`, `640×800`, `320×400`)를 생성하고
`apps/web/public/brand/illustrated-20260928/manifest.json`의 폭·높이·바이트·SHA-256을 갱신한다.

실행:
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/render_portrait_4x5_webp.py
"""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

_THIS_DIR = Path(__file__).resolve().parent
_BLENDER_TOOLS_DIR = _THIS_DIR.parent
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from character_kit import build_base_v2 as bb2  # noqa: E402
from character_kit import export_vrm1_hero as ev  # noqa: E402


FFMPEG_BIN = "/opt/homebrew/bin/ffmpeg"
CWEBP_BIN = "/opt/homebrew/bin/cwebp"

PORTRAIT_SPECS: list[dict[str, Any]] = [
    {
        "asset_key": "character-pink",
        "label_ko": "로맨스 캐릭터",
        "vrm_file": "romance-female.vrm",
        "archetype": "female-romance",
        "bg_srgb": (0.972, 0.925, 0.938),
        "bg_accent_srgb": (0.915, 0.785, 0.825),
        "key_color": (1.0, 0.96, 0.95),
        "fill_color": (0.98, 0.90, 0.94),
        "rim_color": (1.0, 0.88, 0.92),
        "recolor": {
            "ts_vrm_top_": "#E598AC",
            "ts_vrm_trim_": "#FFF5F2",
            "ts_vrm_bottom_": "#9D556A",
            "ts_vrm_accent_": "#D46B84",
        },
        "outline_hex": "#6E4152",
        "head_yaw_deg": -8.0,
        "head_tilt_deg": 3.2,
        "smile_weight": 0.74,
        "tuck_hair_behind_garment": True,
    },
    {
        "asset_key": "character-blue",
        "label_ko": "푸른 판타지 캐릭터",
        "vrm_file": "rofan-empress.vrm",
        "archetype": "female-romance",
        "bg_srgb": (0.915, 0.945, 0.980),
        "bg_accent_srgb": (0.760, 0.845, 0.945),
        "key_color": (0.96, 0.98, 1.0),
        "fill_color": (0.86, 0.93, 1.0),
        "rim_color": (0.84, 0.94, 1.0),
        "recolor": {
            "ts_vrm_top_": "#2D528A",
            "ts_vrm_bottom_": "#213E6D",
            "ts_vrm_trim_": "#F0F5FC",
            "ts_vrm_accent_": "#E2C478",
        },
        "outline_hex": "#25395C",
        "head_yaw_deg": 9.0,
        "head_tilt_deg": -2.5,
        "smile_weight": 0.58,
        "tuck_hair_behind_garment": False,
    },
]


def _set_mtoon_or_bsdf_tint(mat: Any, hex_str: str) -> None:
    lin = ev.hex_to_linear(hex_str)
    shade = ev.cel_shade_linear(hex_str, cool_shift=True)
    if hasattr(mat, "vrm_addon_extension") and mat.vrm_addon_extension.mtoon1.enabled:
        m1 = mat.vrm_addon_extension.mtoon1
        m1.pbr_metallic_roughness.base_color_texture.index.source = None
        m1.pbr_metallic_roughness.base_color_factor = (lin[0], lin[1], lin[2], 1.0)
        v = m1.extensions.vrmc_materials_mtoon
        v.shade_multiply_texture.index.source = None
        v.shade_color_factor = shade
    if mat.use_nodes and mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                for lk in list(mat.node_tree.links):
                    if lk.to_node == node and lk.to_socket.name == "Base Color":
                        mat.node_tree.links.remove(lk)
                node.inputs["Base Color"].default_value = (lin[0], lin[1], lin[2], 1.0)


def _pose_portrait_avatar(arm: Any, spec: dict[str, Any]) -> None:
    """한국 웹툰 에디토리얼 3/4 포트레이트 포즈(팔 내림 · 우아한 목 비례 · 턱 당김 · 미소)."""
    pb = arm.pose.bones

    def _rot_bone(bname: str, world_axis: Vector, deg: float) -> None:
        if bname not in pb:
            return
        bone_m = pb[bname].bone.matrix_local.to_3x3()
        local_axis = (bone_m.inverted() @ world_axis).normalized()
        q_loc = Matrix.Rotation(math.radians(deg), 3, local_axis).to_quaternion()
        pb[bname].rotation_mode = "QUATERNION"
        pb[bname].rotation_quaternion = pb[bname].rotation_quaternion @ q_loc

    # 팔을 T-포즈에서 자연스럽게 아래로(어깨·상완에 회전을 분산해 카디건 어깨 주름/외곽선 관통 원천 차단)
    _rot_bone("mixamorig:LeftShoulder", Vector((0.0, -1.0, 0.0)), -18.0)
    _rot_bone("mixamorig:LeftArm", Vector((0.0, -1.0, 0.0)), -34.0)
    _rot_bone("mixamorig:LeftForeArm", Vector((0.0, 0.0, 1.0)), -12.0)
    _rot_bone("mixamorig:RightShoulder", Vector((0.0, -1.0, 0.0)), +18.0)
    _rot_bone("mixamorig:RightArm", Vector((0.0, -1.0, 0.0)), +34.0)
    _rot_bone("mixamorig:RightForeArm", Vector((0.0, 0.0, 1.0)), +12.0)

    # 포트레이트 클로즈업에서 목이 과도하게 길어 보이지 않도록 목 본 세로 비례를 18% 단정하게 정돈
    if "mixamorig:Neck" in pb:
        pb["mixamorig:Neck"].scale = (1.0, 0.82, 1.0)

    # 상체·목·고개 3/4 우아한 비틀기 + 자연스러운 턱 당김(-X 회전)으로 V라인 턱선 강조
    _rot_bone("mixamorig:Spine1", Vector((0.0, 0.0, 1.0)), spec["head_yaw_deg"] * 0.45)
    _rot_bone("mixamorig:Neck", Vector((0.0, 0.0, 1.0)), spec["head_yaw_deg"] * 0.30)
    _rot_bone("mixamorig:Neck", Vector((1.0, 0.0, 0.0)), -3.0)
    _rot_bone("mixamorig:Head", Vector((0.0, 0.0, 1.0)), spec["head_yaw_deg"] * 0.50)
    _rot_bone("mixamorig:Head", Vector((0.0, -1.0, 0.0)), spec["head_tilt_deg"])
    _rot_bone("mixamorig:Head", Vector((1.0, 0.0, 0.0)), -7.5)

    # 긴 머리 스프링본은 어깨 뒤(+Y)로 살짝 넘겨 자연스러운 드레이프 유도
    for bname in pb.keys():
        if bname.startswith("SB_"):
            _rot_bone(bname, Vector((1.0, 0.0, 0.0)), 4.0)

    # 부드러운 미소 표정 블렌드셰이프 활성화
    smile = float(spec["smile_weight"])
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.data.shape_keys:
            continue
        kbs = obj.data.shape_keys.key_blocks
        for kname, w in (
            ("facs:mouthSmileLeft", smile),
            ("facs:mouthSmileRight", smile),
            ("facs:cheekSquintLeft", smile * 0.35),
            ("facs:cheekSquintRight", smile * 0.35),
            ("facs:browOuterUpLeft", smile * 0.20),
            ("facs:browOuterUpRight", smile * 0.20),
        ):
            if kname in kbs:
                kbs[kname].value = w

    bpy.context.view_layer.update()


def _measure_posed_chin_and_eye(plan: bb2.ArchetypePlan) -> tuple[Vector, float]:
    """포즈 적용 후 평가된 TS_Head 메시에서 실제 턱끝(목 이음매가 아닌 하악 전방 돌출점) 3D 좌표와 눈 높이를 정밀 측정한다."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    head_obj = bpy.data.objects.get("TS_Head")
    if head_obj is None:
        return Vector((0.0, -0.062, plan.z_chin)), plan.z_eye

    eval_obj = head_obj.evaluated_get(depsgraph)
    eval_mesh = eval_obj.to_mesh()
    mw = eval_obj.matrix_world
    pts = [mw @ v.co for v in eval_mesh.vertices]
    eval_obj.to_mesh_clear()

    z_min = min(p.z for p in pts)
    z_max = max(p.z for p in pts)
    # 목 이음매(z_min)보다 24~56mm 위쪽(하악/턱끝 대역)에서 정면(-Y)으로 가장 돌출된 턱끝 정점군을 추출
    chin_band = [
        p for p in pts
        if abs(p.x) < 0.022 and (z_min + 0.024) <= p.z <= (z_min + 0.056)
    ]
    if not chin_band:
        chin_band = [p for p in pts if abs(p.x) < 0.030 and p.z <= z_min + 0.065]
    chin_band.sort(key=lambda p: p.y)
    front_chin = chin_band[: max(4, len(chin_band) // 10)]
    chin_pos = sum(front_chin, Vector((0.0, 0.0, 0.0))) / len(front_chin)
    eye_z = chin_pos.z + (z_max - chin_pos.z) * 0.46
    return chin_pos, eye_z


def _resolve_portrait_hair_garment_clearance(
    chin_pos: Vector,
    plan: bb2.ArchetypePlan,
    *,
    tuck_behind: bool,
) -> int:
    """포즈된 헤어 메시를 의상 BVH와 대조해 어깨·가슴 의상 관통 정점을 0건으로 정리한다."""
    depsgraph = bpy.context.evaluated_depsgraph_get()

    # 1) 모든 상의/아우터/보디스 의상의 포즈 적용 폴리곤으로 단일 BVH 구축
    gar_verts: list[Vector] = []
    gar_polys: list[tuple[int, ...]] = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.name.startswith("TS_HeroGar_"):
            continue
        if "tiara" in obj.name:
            continue
        eo = obj.evaluated_get(depsgraph)
        em = eo.to_mesh()
        mw = eo.matrix_world
        base_idx = len(gar_verts)
        gar_verts.extend(mw @ v.co for v in em.vertices)
        for p in em.polygons:
            if len(p.vertices) >= 3:
                gar_polys.append(tuple(base_idx + vi for vi in p.vertices))
        eo.to_mesh_clear()

    if not gar_polys:
        return 0
    gar_bvh = BVHTree.FromPolygons(gar_verts, gar_polys)

    # 어깨/등 상단 의상의 실제 최대 +Y(등 뒤 경계)를 실측해 뒷머리가 어깨 두께 내부에 걸리지 않도록 완전 회피
    shoulder_gar_y = [v.y for v in gar_verts if (plan.z_chest - 0.05) <= v.z <= (plan.z_neck_base + 0.06) and abs(v.x) < 0.28]
    garment_back_y = max(shoulder_gar_y) if shoulder_gar_y else 0.085

    adjusted_total = 0
    z_shoulder_band = chin_pos.z - 0.012

    for hair_obj in list(bpy.data.objects):
        if hair_obj.type != "MESH" or not hair_obj.name.startswith("TS_HeroHair_"):
            continue

        # 포즈 평가된 지오메트리를 베이크해 Armature 제거 후 정밀 클리어런스 적용
        eo = hair_obj.evaluated_get(depsgraph)
        baked_mesh = bpy.data.meshes.new_from_object(eo, preserve_all_data_layers=True, depsgraph=depsgraph)
        old_mesh = hair_obj.data
        world_m = hair_obj.matrix_world.copy()
        inv_world = world_m.inverted()

        for mod in list(hair_obj.modifiers):
            if mod.type == "ARMATURE":
                hair_obj.modifiers.remove(mod)
        hair_obj.data = baked_mesh
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)

        # 인접 그래프 구축(부드러운 라플라시안 완화용)
        adj: list[list[int]] = [[] for _ in range(len(baked_mesh.vertices))]
        for e in baked_mesh.edges:
            a, b = e.vertices[0], e.vertices[1]
            adj[a].append(b)
            adj[b].append(a)

        touched: set[int] = set()
        for vi, v in enumerate(baked_mesh.vertices):
            wco = world_m @ v.co
            if wco.z > z_shoulder_band:
                continue

            loc, norm, _idx, dist = gar_bvh.find_nearest(wco)
            if loc is None:
                continue
            signed = (wco - loc).dot(norm)

            if tuck_behind:
                # 카디건(character-pink): 어깨·가슴 대역에 근접·관통하는 모든 헤어 가닥을 의상 등 뒤(garment_back_y + 18mm)로 완전히 수납
                in_shoulder_or_chest = (wco.z < plan.z_neck_base + 0.045) and (
                    dist < 0.048 or signed < 0.022 or wco.y < garment_back_y + 0.008
                )
                if in_shoulder_or_chest:
                    new_wco = wco.copy()
                    # 어깨/등 두께 전체를 완전히 넘겨 등 뒤(+Y)에 깨끗하게 배치 → 어깨 상단 관통 0건
                    new_wco.y = max(wco.y + 0.024, garment_back_y + 0.018)
                    v.co = inv_world @ new_wco
                    touched.add(vi)
            else:
                # 로판 황녀(character-blue): 앞머리 롤이 드레스 앞쪽으로 깨끗하게 뜨도록 최소 10mm 외측 확보
                if signed < 0.008 and dist < 0.022:
                    push_dir = norm if norm.length > 1e-5 else Vector((0.0, -1.0, 0.0))
                    new_wco = loc + push_dir * 0.012
                    v.co = inv_world @ new_wco
                    touched.add(vi)

        # 이동된 정점 경계만 2회 부드럽게 완화한 뒤 다시 등 뒤 경계 최종 보증
        if touched:
            for _ in range(2):
                next_pos: dict[int, Vector] = {}
                for vi in touched:
                    nbs = adj[vi]
                    if not nbs:
                        continue
                    avg = sum((baked_mesh.vertices[nb].co for nb in nbs), Vector((0.0, 0.0, 0.0))) / len(nbs)
                    next_pos[vi] = baked_mesh.vertices[vi].co.lerp(avg, 0.30)
                for vi, co in next_pos.items():
                    baked_mesh.vertices[vi].co = co
            if tuck_behind:
                for vi in touched:
                    wco = world_m @ baked_mesh.vertices[vi].co
                    if wco.z < plan.z_neck_base + 0.040 and wco.y < garment_back_y + 0.016:
                        wco.y = garment_back_y + 0.018
                        baked_mesh.vertices[vi].co = inv_world @ wco
            baked_mesh.update()
            adjusted_total += len(touched)

    return adjusted_total


def _splice_mtoon_color_multiplier(mat: Any, mul_color_socket: Any, label: str) -> bool:
    """MToon 1.0 노드 그룹의 Lit/Shade 컬러 입력 직전에 곱셈(MULTIPLY) 셰이더를 깔끔하게 삽입한다."""
    if not mat.use_nodes or not mat.node_tree:
        return False
    nt = mat.node_tree
    mtoon_out = next((n for n in nt.nodes if n.type == "GROUP" and "Mtoon1Output" in n.name), None)
    if mtoon_out is None:
        return False

    patched = False
    for sock_name in ("Lit Color Texture Color", "Shade Color Texture"):
        in_sock = mtoon_out.inputs.get(sock_name)
        if in_sock is None or not in_sock.is_linked:
            continue
        orig_link = in_sock.links[0]
        from_sock = orig_link.from_socket
        nt.links.remove(orig_link)

        n_mul = nt.nodes.new("ShaderNodeMix")
        n_mul.name = f"PortraitTint_{label}_{sock_name[:4]}"
        n_mul.data_type = "RGBA"
        n_mul.blend_type = "MULTIPLY"
        n_mul.inputs["Factor"].default_value = 1.0
        nt.links.new(from_sock, n_mul.inputs[6])
        nt.links.new(mul_color_socket, n_mul.inputs[7])
        nt.links.new(n_mul.outputs[2], in_sock)
        patched = True
    return patched


def _inject_submental_toon_shadow(chin_pos: Vector, plan: bb2.ArchetypePlan) -> None:
    """`ts_skin_head`(상부 목·턱)와 `ts_skin_body`(하부 목) 양쪽에 동일한 3D 좌표 기반
    턱밑(submental) 소프트 툰 V-그림자를 이음매 없이(Seamless) 주입한다."""

    def _build_unified_submental_nodes(nt: Any, *, include_jaw_contour: bool, include_collarbone: bool) -> Any:
        n_geo = nt.nodes.new("ShaderNodeNewGeometry")

        # rel = pos - chin_pos
        n_sub = nt.nodes.new("ShaderNodeVectorMath")
        n_sub.operation = "SUBTRACT"
        n_sub.inputs[1].default_value = (chin_pos.x, chin_pos.y, chin_pos.z)
        nt.links.new(n_geo.outputs["Position"], n_sub.inputs[0])

        n_sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(n_sub.outputs["Vector"], n_sep.inputs["Vector"])

        n_abs_x = nt.nodes.new("ShaderNodeMath")
        n_abs_x.operation = "ABSOLUTE"
        nt.links.new(n_sep.outputs["X"], n_abs_x.inputs[0])

        # dz_down = chin_pos.z - pos.z (턱끝 아래로 내려갈수록 양수)
        n_dz = nt.nodes.new("ShaderNodeMath")
        n_dz.operation = "MULTIPLY"
        n_dz.inputs[1].default_value = -1.0
        nt.links.new(n_sep.outputs["Z"], n_dz.inputs[0])

        # V-크레센트 턱밑 그림자 형태: 중앙 목선에서 42mm 내려오고 양옆 턱선으로 부드럽게 상승
        n_x_term = nt.nodes.new("ShaderNodeMath")
        n_x_term.operation = "MULTIPLY"
        n_x_term.inputs[1].default_value = 0.72
        nt.links.new(n_abs_x.outputs["Value"], n_x_term.inputs[0])

        n_dz_eff = nt.nodes.new("ShaderNodeMath")
        n_dz_eff.operation = "ADD"
        nt.links.new(n_dz.outputs["Value"], n_dz_eff.inputs[0])
        nt.links.new(n_x_term.outputs["Value"], n_dz_eff.inputs[1])

        # 하단 소프트 툰 경계 (44mm ~ 52mm 사이 깔끔한 한국 웹툰 V-크레센트 2톤 페더)
        n_low = nt.nodes.new("ShaderNodeMapRange")
        n_low.clamp = True
        n_low.interpolation_type = "SMOOTHSTEP"
        n_low.inputs["From Min"].default_value = 0.044
        n_low.inputs["From Max"].default_value = 0.052
        n_low.inputs["To Min"].default_value = 1.0
        n_low.inputs["To Max"].default_value = 0.0
        nt.links.new(n_dz_eff.outputs["Value"], n_low.inputs["Value"])

        # 상단 시작: 턱끝 앞볼륨(0..5mm)은 100% 매끄러운 피부로 보존하고 턱 바로 아래(6..13mm)부터 깔끔하게 시작
        n_top = nt.nodes.new("ShaderNodeMapRange")
        n_top.clamp = True
        n_top.interpolation_type = "SMOOTHSTEP"
        n_top.inputs["From Min"].default_value = 0.005
        n_top.inputs["From Max"].default_value = 0.013
        n_top.inputs["To Min"].default_value = 0.0
        n_top.inputs["To Max"].default_value = 1.0
        nt.links.new(n_dz.outputs["Value"], n_top.inputs["Value"])

        # Y 필터: 실제 턱끝 앞표면(rel.y < 0.012)은 100% 밝게 유지하고 목 기둥(rel.y >= +0.018)에만 툰 그림자 투사
        n_y_min = nt.nodes.new("ShaderNodeMapRange")
        n_y_min.clamp = True
        n_y_min.interpolation_type = "SMOOTHSTEP"
        n_y_min.inputs["From Min"].default_value = 0.012
        n_y_min.inputs["From Max"].default_value = 0.022
        n_y_min.inputs["To Min"].default_value = 0.0
        n_y_min.inputs["To Max"].default_value = 1.0
        nt.links.new(n_sep.outputs["Y"], n_y_min.inputs["Value"])

        n_y_max = nt.nodes.new("ShaderNodeMapRange")
        n_y_max.clamp = True
        n_y_max.interpolation_type = "SMOOTHSTEP"
        n_y_max.inputs["From Min"].default_value = 0.085
        n_y_max.inputs["From Max"].default_value = 0.115
        n_y_max.inputs["To Min"].default_value = 1.0
        n_y_max.inputs["To Max"].default_value = 0.0
        nt.links.new(n_sep.outputs["Y"], n_y_max.inputs["Value"])

        n_m1 = nt.nodes.new("ShaderNodeMath")
        n_m1.operation = "MULTIPLY"
        nt.links.new(n_low.outputs["Result"], n_m1.inputs[0])
        nt.links.new(n_top.outputs["Result"], n_m1.inputs[1])

        n_m2 = nt.nodes.new("ShaderNodeMath")
        n_m2.operation = "MULTIPLY"
        nt.links.new(n_y_min.outputs["Result"], n_m2.inputs[0])
        nt.links.new(n_y_max.outputs["Result"], n_m2.inputs[1])

        n_main_mask = nt.nodes.new("ShaderNodeMath")
        n_main_mask.operation = "MULTIPLY"
        nt.links.new(n_m1.outputs["Value"], n_main_mask.inputs[0])
        nt.links.new(n_m2.outputs["Value"], n_main_mask.inputs[1])

        # 턱 바로 밑 14mm 코어 섀도우(턱-목 입체 분리)
        n_core_low = nt.nodes.new("ShaderNodeMapRange")
        n_core_low.clamp = True
        n_core_low.interpolation_type = "SMOOTHSTEP"
        n_core_low.inputs["From Min"].default_value = 0.008
        n_core_low.inputs["From Max"].default_value = 0.019
        n_core_low.inputs["To Min"].default_value = 1.0
        n_core_low.inputs["To Max"].default_value = 0.0
        nt.links.new(n_dz_eff.outputs["Value"], n_core_low.inputs["Value"])

        n_core_mask = nt.nodes.new("ShaderNodeMath")
        n_core_mask.operation = "MULTIPLY"
        nt.links.new(n_core_low.outputs["Result"], n_core_mask.inputs[0])
        nt.links.new(n_main_mask.outputs["Value"], n_core_mask.inputs[1])

        # 컬러 합성 체인 시작 (따뜻한 한국 웹툰 피치-로즈 툰 음영)
        cur_color_node = nt.nodes.new("ShaderNodeMix")
        cur_color_node.data_type = "RGBA"
        cur_color_node.inputs[6].default_value = (1.0, 1.0, 1.0, 1.0)
        cur_color_node.inputs[7].default_value = (0.85, 0.70, 0.73, 1.0)
        nt.links.new(n_main_mask.outputs["Value"], cur_color_node.inputs["Factor"])
        cur_sock = cur_color_node.outputs[2]

        n_core_mix = nt.nodes.new("ShaderNodeMix")
        n_core_mix.data_type = "RGBA"
        n_core_mix.inputs[7].default_value = (0.72, 0.54, 0.58, 1.0)
        nt.links.new(n_core_mask.outputs["Value"], n_core_mix.inputs["Factor"])
        nt.links.new(cur_sock, n_core_mix.inputs[6])
        cur_sock = n_core_mix.outputs[2]

        if include_collarbone:
            collar_dz = chin_pos.z - (plan.z_neck_base - 0.022)
            n_cz = nt.nodes.new("ShaderNodeMath")
            n_cz.operation = "SUBTRACT"
            n_cz.inputs[1].default_value = collar_dz
            nt.links.new(n_dz.outputs["Value"], n_cz.inputs[0])

            n_cza = nt.nodes.new("ShaderNodeMath")
            n_cza.operation = "ABSOLUTE"
            nt.links.new(n_cz.outputs["Value"], n_cza.inputs[0])

            n_czb = nt.nodes.new("ShaderNodeMapRange")
            n_czb.clamp = True
            n_czb.interpolation_type = "SMOOTHSTEP"
            n_czb.inputs["From Min"].default_value = 0.003
            n_czb.inputs["From Max"].default_value = 0.013
            n_czb.inputs["To Min"].default_value = 1.0
            n_czb.inputs["To Max"].default_value = 0.0
            nt.links.new(n_cza.outputs["Value"], n_czb.inputs["Value"])

            n_cxb = nt.nodes.new("ShaderNodeMapRange")
            n_cxb.clamp = True
            n_cxb.interpolation_type = "SMOOTHSTEP"
            n_cxb.inputs["From Min"].default_value = 0.014
            n_cxb.inputs["From Max"].default_value = 0.052
            n_cxb.inputs["To Min"].default_value = 1.0
            n_cxb.inputs["To Max"].default_value = 0.0
            nt.links.new(n_abs_x.outputs["Value"], n_cxb.inputs["Value"])

            n_cm = nt.nodes.new("ShaderNodeMath")
            n_cm.operation = "MULTIPLY"
            nt.links.new(n_czb.outputs["Result"], n_cm.inputs[0])
            nt.links.new(n_cxb.outputs["Result"], n_cm.inputs[1])

            n_col_mix = nt.nodes.new("ShaderNodeMix")
            n_col_mix.data_type = "RGBA"
            n_col_mix.inputs[7].default_value = (0.93, 0.84, 0.86, 1.0)
            nt.links.new(n_cm.outputs["Value"], n_col_mix.inputs["Factor"])
            nt.links.new(cur_sock, n_col_mix.inputs[6])
            cur_sock = n_col_mix.outputs[2]

        if include_jaw_contour:
            # 턱끝 바로 아랫면(Normal.Z < -0.42)에만 섬세한 웹툰 턱선 라인 강조(볼·턱 볼륨은 깨끗하게 유지)
            n_sep_n = nt.nodes.new("ShaderNodeSeparateXYZ")
            nt.links.new(n_geo.outputs["Normal"], n_sep_n.inputs["Vector"])

            n_z_jaw = nt.nodes.new("ShaderNodeMapRange")
            n_z_jaw.clamp = True
            n_z_jaw.interpolation_type = "SMOOTHSTEP"
            n_z_jaw.inputs["From Min"].default_value = -0.018
            n_z_jaw.inputs["From Max"].default_value = 0.008
            n_z_jaw.inputs["To Min"].default_value = 0.0
            n_z_jaw.inputs["To Max"].default_value = 1.0
            nt.links.new(n_dz.outputs["Value"], n_z_jaw.inputs["Value"])

            n_z_jaw_hi = nt.nodes.new("ShaderNodeMapRange")
            n_z_jaw_hi.clamp = True
            n_z_jaw_hi.interpolation_type = "SMOOTHSTEP"
            n_z_jaw_hi.inputs["From Min"].default_value = 0.006
            n_z_jaw_hi.inputs["From Max"].default_value = 0.022
            n_z_jaw_hi.inputs["To Min"].default_value = 1.0
            n_z_jaw_hi.inputs["To Max"].default_value = 0.0
            nt.links.new(n_dz.outputs["Value"], n_z_jaw_hi.inputs["Value"])

            n_nz_rim = nt.nodes.new("ShaderNodeMapRange")
            n_nz_rim.clamp = True
            n_nz_rim.interpolation_type = "SMOOTHSTEP"
            n_nz_rim.inputs["From Min"].default_value = -0.68
            n_nz_rim.inputs["From Max"].default_value = -0.40
            n_nz_rim.inputs["To Min"].default_value = 1.0
            n_nz_rim.inputs["To Max"].default_value = 0.0
            nt.links.new(n_sep_n.outputs["Z"], n_nz_rim.inputs["Value"])

            n_j1 = nt.nodes.new("ShaderNodeMath")
            n_j1.operation = "MULTIPLY"
            nt.links.new(n_z_jaw.outputs["Result"], n_j1.inputs[0])
            nt.links.new(n_z_jaw_hi.outputs["Result"], n_j1.inputs[1])

            n_j_mask = nt.nodes.new("ShaderNodeMath")
            n_j_mask.operation = "MULTIPLY"
            nt.links.new(n_j1.outputs["Value"], n_j_mask.inputs[0])
            nt.links.new(n_nz_rim.outputs["Result"], n_j_mask.inputs[1])

            n_jaw_mix = nt.nodes.new("ShaderNodeMix")
            n_jaw_mix.data_type = "RGBA"
            n_jaw_mix.inputs[7].default_value = (0.66, 0.48, 0.53, 1.0)
            nt.links.new(n_j_mask.outputs["Value"], n_jaw_mix.inputs["Factor"])
            nt.links.new(cur_sock, n_jaw_mix.inputs[6])
            cur_sock = n_jaw_mix.outputs[2]

        return cur_sock

    body_mat = bpy.data.materials.get("ts_skin_body")
    if body_mat and body_mat.use_nodes and body_mat.node_tree:
        sock = _build_unified_submental_nodes(body_mat.node_tree, include_jaw_contour=False, include_collarbone=True)
        _splice_mtoon_color_multiplier(body_mat, sock, "SubmentalNeck")

    head_mat = bpy.data.materials.get("ts_skin_head")
    if head_mat and head_mat.use_nodes and head_mat.node_tree:
        sock = _build_unified_submental_nodes(head_mat.node_tree, include_jaw_contour=False, include_collarbone=False)
        _splice_mtoon_color_multiplier(head_mat, sock, "SubmentalHead")


def _clean_inner_garment_shoulder_outlines(plan: bb2.ArchetypePlan) -> None:
    """아우터(카디건) 아래 이너 티셔츠 어깨선의 MToon Outline(NODES)이 카디건 어깨를 뚫는 아티팩트를 제거한다."""
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if "ribbed-tee" in obj.name:
            # 아우터 카디건 아래에 겹치는 이너 티셔츠의 외곽선 모디파이어는 비활성화해 어깨 관통 슬릿 0건 보장
            for mod in obj.modifiers:
                if mod.type == "NODES" and "Outline" in mod.name:
                    mod.show_viewport = False
                    mod.show_render = False
            # 어깨 바깥쪽 이너 정점을 아래(-Z)·안쪽(+Y)으로 6mm 수납
            for v in obj.data.vertices:
                if abs(v.co.x) > 0.055 and v.co.z > plan.z_chest + 0.05:
                    v.co.z -= 0.006
                    v.co.y += 0.004
            obj.data.update()
        elif obj.name == "TS_HeroGar_knit-cardigan_main":
            # 카디건 어깨 솔기 미세 틈새(bmesh 소형 경계 구멍) 봉합 + 양면 렌더로 뒤쪽 머리가 비쳐 보이는 현상 0건 보장
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            shoulder_b_edges = [
                e for e in bm.edges
                if e.is_boundary
                and all(abs(v.co.x) > 0.045 and v.co.z > plan.z_shoulder - 0.045 for v in e.verts)
            ]
            if shoulder_b_edges:
                bmesh.ops.holes_fill(bm, edges=shoulder_b_edges, sides=12)
                bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
                bm.to_mesh(obj.data)
            bm.free()
            obj.data.update()
            for mat in obj.data.materials:
                mat.use_backface_culling = False
                if hasattr(mat, "vrm_addon_extension") and mat.vrm_addon_extension.mtoon1.enabled:
                    mat.vrm_addon_extension.mtoon1.double_sided = True
                    mat.vrm_addon_extension.mtoon1.extensions.vrmc_materials_mtoon.outline_width_factor = 0.0010


def _render_portrait_master_png(vrm_path: Path, spec: dict[str, Any], out_png: Path) -> None:
    ev._clear_scene_keep_addons()  # noqa: SLF001
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    bpy.ops.import_scene.vrm(filepath=str(vrm_path))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")

    # 에디토리얼 핑크 / 블루 팔레트 톤 보정 + 부드러운 잉크 외곽선 + 2톤 셀 셰이딩 깊이 강화
    recolor: dict[str, str] = spec["recolor"]
    outline_lin = ev.hex_to_linear(spec["outline_hex"])
    for mat in bpy.data.materials:
        for prefix, hex_val in recolor.items():
            if mat.name.startswith(prefix):
                _set_mtoon_or_bsdf_tint(mat, hex_val)
        if hasattr(mat, "vrm_addon_extension") and mat.vrm_addon_extension.mtoon1.enabled:
            v = mat.vrm_addon_extension.mtoon1.extensions.vrmc_materials_mtoon
            v.outline_color_factor = outline_lin
            v.outline_width_factor = min(float(v.outline_width_factor), 0.0014)
            v.gi_equalization_factor = 0.48

    _pose_portrait_avatar(arm, spec)

    plan = bb2.compute_archetype_plan(bb2.ARCHETYPES[spec["archetype"]])
    chin_pos, posed_eye_z = _measure_posed_chin_and_eye(plan)

    # 포즈 후 이너 어깨 외곽선 정리 + 헤어-의상 BVH 관통 0건 정리 + 턱밑 소프트 툰 그림자 주입
    if spec["tuck_hair_behind_garment"]:
        _clean_inner_garment_shoulder_outlines(plan)
        bpy.context.view_layer.update()
    adj_cnt = _resolve_portrait_hair_garment_clearance(
        chin_pos,
        plan,
        tuck_behind=bool(spec["tuck_hair_behind_garment"]),
    )
    print(f"[render_portrait_4x5_webp] {spec['asset_key']}: chin_z={chin_pos.z:.4f}m, hair_clearance_verts={adj_cnt}")
    _inject_submental_toon_shadow(chin_pos, plan)

    # 스튜디오 배경 사이클로라마 평면 (깔끔한 2톤 아틀리에 파스텔)
    bpy.ops.mesh.primitive_plane_add(
        size=4.0,
        location=(0.0, 1.35, plan.z_chest + 0.15),
        rotation=(math.radians(90.0), 0.0, 0.0),
    )
    bg_plane = bpy.context.active_object
    bg_mat = bpy.data.materials.new(f"PortraitBackdrop_{spec['asset_key']}")
    bg_mat.use_nodes = True
    nt = bg_mat.node_tree
    nt.nodes.clear()
    n_out = nt.nodes.new("ShaderNodeOutputMaterial")
    n_em = nt.nodes.new("ShaderNodeEmission")
    n_grad = nt.nodes.new("ShaderNodeTexGradient")
    n_grad.gradient_type = "SPHERICAL"
    n_tc = nt.nodes.new("ShaderNodeTexCoord")
    n_map = nt.nodes.new("ShaderNodeMapping")
    n_map.inputs["Location"].default_value = (-0.5, -0.58, 0.0)
    n_map.inputs["Scale"].default_value = (1.6, 1.4, 1.0)
    n_mix = nt.nodes.new("ShaderNodeMix")
    n_mix.data_type = "RGBA"
    c_main = tuple(ev.srgb_to_linear_channel(c) for c in spec["bg_srgb"])
    c_acc = tuple(ev.srgb_to_linear_channel(c) for c in spec["bg_accent_srgb"])
    n_mix.inputs[6].default_value = (*c_acc, 1.0)
    n_mix.inputs[7].default_value = (*c_main, 1.0)
    n_em.inputs["Strength"].default_value = 1.0
    nt.links.new(n_tc.outputs["Generated"], n_map.inputs["Vector"])
    nt.links.new(n_map.outputs["Vector"], n_grad.inputs["Vector"])
    nt.links.new(n_grad.outputs["Fac"], n_mix.inputs["Factor"])
    nt.links.new(n_mix.outputs[2], n_em.inputs["Color"])
    nt.links.new(n_em.outputs["Emission"], n_out.inputs["Surface"])
    bg_plane.data.materials.append(bg_mat)

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 1800  # 정확히 4:5 세로 포트레이트
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 32
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new(f"PortraitWorld_{spec['asset_key']}")
    scene.world = world
    world.use_nodes = True
    wbg = world.node_tree.nodes.get("Background")
    if wbg:
        wbg.inputs[0].default_value = (*c_main, 1.0)
        wbg.inputs[1].default_value = 0.62

    # 주광(SUN)으로 선명한 웹툰 2톤 셰이딩 + 부드러운 필/림 보조광
    sun_d = bpy.data.lights.new("PSunKey", type="SUN")
    sun_d.energy = 2.0
    sun_d.color = spec["key_color"]
    sun_d.angle = math.radians(8.0)
    sun_o = bpy.data.objects.new("PSunKey", sun_d)
    scene.collection.objects.link(sun_o)
    sun_o.rotation_euler = (
        Vector((0.0, 0.0, chin_pos.z)) - Vector((1.05, -1.65, posed_eye_z + 0.95))
    ).to_track_quat("-Z", "Y").to_euler()

    for lname, loc, energy, color in (
        ("PFill", (-1.35, -1.55, plan.z_chest + 0.20), 95.0, spec["fill_color"]),
        ("PRim", (-0.35, 1.05, posed_eye_z + 0.35), 165.0, spec["rim_color"]),
    ):
        ld = bpy.data.lights.new(lname, type="AREA")
        ld.energy = energy
        ld.size = 1.15
        ld.color = color
        lo = bpy.data.objects.new(lname, ld)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0.0, 0.0, chin_pos.z)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    cam_d = bpy.data.cameras.new("PortraitCam")
    cam_d.lens = 88.0
    cam_o = bpy.data.objects.new("PortraitCam", cam_d)
    scene.collection.objects.link(cam_o)
    scene.camera = cam_o

    # 약한 하이-앵글(7° 내려다보는 시점) 한국 웹툰 미형 포트레이트 프레이밍 (목 비례 단정 · 턱선 강조 · 머리 여백 확보)
    focus_z = chin_pos.z - 0.068
    dist = plan.head_h * 6.50
    yaw_sign = 1.0 if spec["head_yaw_deg"] < 0 else -1.0
    cam_pos = Vector((yaw_sign * dist * 0.14, -dist, posed_eye_z + 0.130))
    cam_o.location = cam_pos
    cam_o.rotation_euler = (Vector((0.0, 0.0, focus_z)) - cam_pos).to_track_quat("-Z", "Y").to_euler()

    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)


def _encode_webp_variant(master_png: Path, out_webp: Path, width: int, height: int, quality: int = 90) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        resized_png = Path(tmp) / f"{out_webp.stem}.png"
        subprocess.run(
            [
                FFMPEG_BIN,
                "-y",
                "-loglevel",
                "error",
                "-i",
                str(master_png),
                "-vf",
                f"scale={width}:{height}:flags=lanczos",
                str(resized_png),
            ],
            check=True,
        )
        subprocess.run(
            [CWEBP_BIN, "-quiet", "-q", str(quality), "-m", "6", str(resized_png), "-o", str(out_webp)],
            check=True,
        )
    raw = out_webp.read_bytes()
    return {
        "file": out_webp.name,
        "width": width,
        "height": height,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def main() -> int:
    bpy.ops.preferences.addon_enable(module="bl_ext.user_default.vrm")

    vrm_dir = Path("apps/web/public/vrm/toonstudio-hero-v1")
    out_dir = Path("apps/web/public/brand/illustrated-20260928")
    manifest_path = out_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    variants_plan = [
        ("-320", 320, 400, 88),
        ("-640", 640, 800, 90),
        ("-960", 960, 1200, 90),
        ("", 960, 1200, 92),
    ]

    with tempfile.TemporaryDirectory() as tmp:
        for spec in PORTRAIT_SPECS:
            asset_key = spec["asset_key"]
            vrm_path = vrm_dir / spec["vrm_file"]
            if not vrm_path.is_file():
                raise FileNotFoundError(f"VRM 파일이 없습니다: {vrm_path}")

            master_png = Path(tmp) / f"{asset_key}_master.png"
            _render_portrait_master_png(vrm_path, spec, master_png)

            variant_records: list[dict[str, Any]] = []
            for suffix, w, h, q in variants_plan:
                out_webp = out_dir / f"{asset_key}{suffix}.webp"
                rec = _encode_webp_variant(master_png, out_webp, w, h, quality=q)
                variant_records.append(rec)
                print(
                    f"[render_portrait_4x5_webp] {out_webp.name:26s} | {w}x{h} (4:5) | "
                    f"{rec['bytes']/1024:6.1f} KiB | sha256={rec['sha256'][:12]}..."
                )

            manifest["assets"][asset_key] = {
                "source": f"toonstudio-hero-v1/{spec['vrm_file']}",
                "aspectRatio": "4:5",
                "generatedAt": "2026-11-21",
                "generator": "tools/blender/character_kit/render_portrait_4x5_webp.py",
                "labelKo": spec["label_ko"],
                "variants": variant_records,
            }

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[render_portrait_4x5_webp] 완료 → {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
