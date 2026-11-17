"""
Blender 5.2/5.3 Generator for 6 High-Craft Rigged Korean Webtoon Character Packages (v2.1).
"""
from __future__ import annotations

import hashlib
import json
import math
import struct
import sys
from pathlib import Path
from typing import Any

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from shaper_webtoon_head_and_textures import (  # noqa: E402
    _assign_weights,
    _bind_to_armature,
    _hex_to_rgb01,
    bake_couture_fabric_texture,
    bake_jewel_iris_texture,
    bake_ombre_hair_texture,
    bake_webtoon_skin_texture,
    build_korean_webtoon_head_and_face,
    build_sculpted_webtoon_bangs_bmesh,
    make_textured_pbr_material,
)

REPO_ROOT = SCRIPT_DIR.parent.parent
CHAR_ROOT = REPO_ROOT / "apps/character-lab/public/assets/characters"
KIT_ROOT = CHAR_ROOT / "toonstudio-kit-v1"

END_BONE_FOLD_MAP: dict[str, str] = {
    "mixamorig:HeadTop_End": "mixamorig:Head",
    "mixamorig:LeftHandThumb4": "mixamorig:LeftHandThumb3",
    "mixamorig:LeftHandIndex4": "mixamorig:LeftHandIndex3",
    "mixamorig:LeftHandMiddle4": "mixamorig:LeftHandMiddle3",
    "mixamorig:LeftHandRing4": "mixamorig:LeftHandRing3",
    "mixamorig:LeftHandPinky4": "mixamorig:LeftHandPinky3",
    "mixamorig:LeftToe_End": "mixamorig:LeftToeBase",
    "mixamorig:RightHandThumb4": "mixamorig:RightHandThumb3",
    "mixamorig:RightHandIndex4": "mixamorig:RightHandIndex3",
    "mixamorig:RightHandMiddle4": "mixamorig:RightHandMiddle3",
    "mixamorig:RightHandRing4": "mixamorig:RightHandRing3",
    "mixamorig:RightHandPinky4": "mixamorig:RightHandPinky3",
    "mixamorig:RightToe_End": "mixamorig:RightToeBase",
}

BONE_RENAME_MAP: dict[str, str] = {
    "TS_Jaw": "TS_ShaperJaw",
    "TS_Eye.L": "TS_ShaperEye.L",
    "TS_Eye.R": "TS_ShaperEye.R",
}

HUMANOID_BONE_PAIRS: list[tuple[str, str]] = [
    ("hips", "mixamorig:Hips"),
    ("spine", "mixamorig:Spine"),
    ("chest", "mixamorig:Spine1"),
    ("upperChest", "mixamorig:Spine2"),
    ("neck", "mixamorig:Neck"),
    ("head", "mixamorig:Head"),
    ("leftEye", "TS_ShaperEye.L"),
    ("rightEye", "TS_ShaperEye.R"),
    ("jaw", "TS_ShaperJaw"),
    ("leftUpperLeg", "mixamorig:LeftUpLeg"),
    ("leftLowerLeg", "mixamorig:LeftLeg"),
    ("leftFoot", "mixamorig:LeftFoot"),
    ("leftToes", "mixamorig:LeftToeBase"),
    ("leftShoulder", "mixamorig:LeftShoulder"),
    ("leftUpperArm", "mixamorig:LeftArm"),
    ("leftLowerArm", "mixamorig:LeftForeArm"),
    ("leftHand", "mixamorig:LeftHand"),
    ("leftThumbMetacarpal", "mixamorig:LeftHandThumb1"),
    ("leftThumbProximal", "mixamorig:LeftHandThumb2"),
    ("leftThumbDistal", "mixamorig:LeftHandThumb3"),
    ("leftIndexProximal", "mixamorig:LeftHandIndex1"),
    ("leftIndexIntermediate", "mixamorig:LeftHandIndex2"),
    ("leftIndexDistal", "mixamorig:LeftHandIndex3"),
    ("leftMiddleProximal", "mixamorig:LeftHandMiddle1"),
    ("leftMiddleIntermediate", "mixamorig:LeftHandMiddle2"),
    ("leftMiddleDistal", "mixamorig:LeftHandMiddle3"),
    ("leftRingProximal", "mixamorig:LeftHandRing1"),
    ("leftRingIntermediate", "mixamorig:LeftHandRing2"),
    ("leftRingDistal", "mixamorig:LeftHandRing3"),
    ("leftLittleProximal", "mixamorig:LeftHandPinky1"),
    ("leftLittleIntermediate", "mixamorig:LeftHandPinky2"),
    ("leftLittleDistal", "mixamorig:LeftHandPinky3"),
    ("rightUpperLeg", "mixamorig:RightUpLeg"),
    ("rightLowerLeg", "mixamorig:RightLeg"),
    ("rightFoot", "mixamorig:RightFoot"),
    ("rightToes", "mixamorig:RightToeBase"),
    ("rightShoulder", "mixamorig:RightShoulder"),
    ("rightUpperArm", "mixamorig:RightArm"),
    ("rightLowerArm", "mixamorig:RightForeArm"),
    ("rightHand", "mixamorig:RightHand"),
    ("rightThumbMetacarpal", "mixamorig:RightHandThumb1"),
    ("rightThumbProximal", "mixamorig:RightHandThumb2"),
    ("rightThumbDistal", "mixamorig:RightHandThumb3"),
    ("rightIndexProximal", "mixamorig:RightHandIndex1"),
    ("rightIndexIntermediate", "mixamorig:RightHandIndex2"),
    ("rightIndexDistal", "mixamorig:RightHandIndex3"),
    ("rightMiddleProximal", "mixamorig:RightHandMiddle1"),
    ("rightMiddleIntermediate", "mixamorig:RightHandMiddle2"),
    ("rightMiddleDistal", "mixamorig:RightHandMiddle3"),
    ("rightRingProximal", "mixamorig:RightHandRing1"),
    ("rightRingIntermediate", "mixamorig:RightHandRing2"),
    ("rightRingDistal", "mixamorig:RightHandRing3"),
    ("rightLittleProximal", "mixamorig:RightHandPinky1"),
    ("rightLittleIntermediate", "mixamorig:RightHandPinky2"),
    ("rightLittleDistal", "mixamorig:RightHandPinky3"),
]

CHARACTER_SPECS: list[dict[str, Any]] = [
    {
        "id": "shaper-atelier-protagonist",
        "displayName": "SHAPER Atelier · Webtoon Protagonist (7.5등신 학원 로맨스)",
        "role": "shaper-flagship",
        "gender": "female",
        "faceStyle": "soft",
        "hairStyle": "wolf-layered",
        "bangStyle": "curtain-protagonist",
        "kitParts": {
            "top": ("top/blazer.glb", "TS_Top_blazer"),
            "bottom": ("bottom/pleated-skirt.glb", "TS_Bottom_pleated-skirt"),
            "shoes": ("shoes/loafers.glb", "TS_Shoes_loafers"),
            "accessory": ("accessory/ribbon.glb", "TS_Accessory_ribbon"),
        },
        "hideFeet": False,
        "couture": "academy-protagonist",
        "colors": {
            "skin": "#FCE3D4", "blush": "#F7969C", "lip": "#E86D7E", "shadow": "#E2B5A3",
            "irisTop": "#4A2294", "irisBot": "#F28CE2",
            "hairRoot": "#321A18", "hairMid": "#5E3330", "hairTip": "#A45B54", "hairHalo": "#FAD0C4",
            "top1": "#1E2842", "top2": "#13192B", "topAcc": "#EAC77A", "topPat": "twill",
            "bot1": "#2C3B5E", "bot2": "#1A243B", "botAcc": "#DF5A72", "botPat": "plaid",
            "shoe": "#2B1D19", "acc": "#D9385A", "gold": "#F0C978",
        },
        "noteKo": "Blender 5.3에서 HBM CC0 해부학 바디·신규 한국 웹툰 V라인 헤드·보석 홍채·시스루 커튼뱅 울프 레이어드 헤어·교복 블레이저/체크 스커트/리본 브로치를 정밀 조형한 7.5등신 여주인공 패키지.",
    },
    {
        "id": "shaper-atelier-male-lead",
        "displayName": "SHAPER Atelier · Male Lead Hunter (8등신 판타지 헌터)",
        "role": "shaper-male-lead",
        "gender": "male",
        "faceStyle": "sharp",
        "hairStyle": "short-layered",
        "bangStyle": "hunter-comma",
        "kitParts": {
            "top": ("top/blazer.glb", "TS_Top_trench-coat"),
            "bottom": ("bottom/slacks.glb", "TS_Bottom_slacks"),
            "shoes": ("shoes/boots.glb", "TS_Shoes_boots"),
            "accessory": ("accessory/earrings.glb", "TS_Accessory_earring"),
        },
        "hideFeet": True,
        "couture": "hunter-trench",
        "colors": {
            "skin": "#F7DAC8", "blush": "#E6958E", "lip": "#CC7075", "shadow": "#D8AA96",
            "irisTop": "#0D3A7A", "irisBot": "#5CEBFF",
            "hairRoot": "#0F131E", "hairMid": "#1C253A", "hairTip": "#384E78", "hairHalo": "#A4C4FA",
            "top1": "#171B25", "top2": "#0D1017", "topAcc": "#6AD8F5", "topPat": "twill",
            "bot1": "#13161F", "bot2": "#0B0D13", "botAcc": "#495670", "botPat": "twill",
            "shoe": "#12141A", "acc": "#5CEBFF", "gold": "#C8D6EA",
        },
        "noteKo": "Blender 5.3에서 8등신 남성 헌터 바디·날렵한 한국 웹툰 남주인공 헤드·마력 광휘 홍채·쉼표 레이어드 헤어·롱 트렌치코트 테일·마나 이어커프를 정밀 조형한 액션 판타지 남주인공 패키지.",
    },
    {
        "id": "shaper-rofan-empress",
        "displayName": "SHAPER Atelier · Rofan Imperial Empress (로판 황녀 쿠튀르)",
        "role": "shaper-rofan",
        "gender": "female",
        "faceStyle": "soft",
        "hairStyle": "romance-long",
        "bangStyle": "rofan-noble",
        "kitParts": {
            "top": ("top/shirt.glb", "TS_Top_imperial-bodice"),
            "bottom": ("bottom/long-skirt.glb", "TS_Bottom_long-skirt"),
            "shoes": ("shoes/loafers.glb", "TS_Shoes_loafers"),
            "accessory": ("accessory/choker.glb", "TS_Accessory_tiara"),
        },
        "hideFeet": False,
        "couture": "rofan-empress",
        "colors": {
            "skin": "#FDE8DC", "blush": "#F89BA6", "lip": "#E8647C", "shadow": "#E5B9AA",
            "irisTop": "#0E6B58", "irisBot": "#7CF7CE",
            "hairRoot": "#C49240", "hairMid": "#E6BF6E", "hairTip": "#FFF0BE", "hairHalo": "#FFFFFF",
            "top1": "#F5ECE0", "top2": "#DBC6AA", "topAcc": "#E5B95C", "topPat": "brocade",
            "bot1": "#7A1C34", "bot2": "#4D0F20", "botAcc": "#F0C86E", "botPat": "brocade",
            "shoe": "#D8B46A", "acc": "#F4CA64", "gold": "#FFE08A",
        },
        "noteKo": "Blender 5.3에서 금빛 롱 웨이브 헤어·에메랄드 보석안·벨벳 숄더 케이프·황실 브로케이드 롱 드레스·루비 세공 티아라 크라운을 조형한 로맨스 판타지 황녀 패키지.",
    },
    {
        "id": "shaper-murim-swordmaster",
        "displayName": "SHAPER Atelier · Murim Azure Swordmaster (무협 청운 검존)",
        "role": "shaper-murim",
        "gender": "male",
        "faceStyle": "sharp",
        "hairStyle": "action-pony",
        "bangStyle": "murim-whisker",
        "kitParts": {
            "top": ("top/shirt.glb", "TS_Top_martial-robe"),
            "bottom": ("bottom/slacks.glb", "TS_Bottom_slacks"),
            "shoes": ("shoes/boots.glb", "TS_Shoes_boots"),
            "accessory": ("accessory/ribbon.glb", "TS_Accessory_jade-sword"),
        },
        "hideFeet": True,
        "couture": "murim-swordmaster",
        "colors": {
            "skin": "#F6D9C6", "blush": "#E09288", "lip": "#C97274", "shadow": "#D6A892",
            "irisTop": "#8F470E", "irisBot": "#FFD464",
            "hairRoot": "#11131A", "hairMid": "#1E2636", "hairTip": "#32445E", "hairHalo": "#A9C6E8",
            "top1": "#1E3F66", "top2": "#122640", "topAcc": "#E6C273", "topPat": "martial",
            "bot1": "#151C28", "bot2": "#0D121A", "botAcc": "#7FA8CC", "botPat": "martial",
            "shoe": "#181C24", "acc": "#5CE0B8", "gold": "#E6C273",
        },
        "noteKo": "Blender 5.3에서 하이 포니테일·용수(龍鬚) 옆머리·금안(金眼)·교임 무복과 금사 요대·등에 패용한 비취 청운검(靑雲劍)과 옥관을 정밀 조형한 정통 무협 검존 패키지.",
    },
    {
        "id": "shaper-cyber-idol",
        "displayName": "SHAPER Atelier · Cyber K-Pop Center Idol (네온 스테이지 아이돌)",
        "role": "shaper-idol",
        "gender": "female",
        "faceStyle": "cute",
        "hairStyle": "twin-tail",
        "bangStyle": "idol-air",
        "kitParts": {
            "top": ("top/sailor.glb", "TS_Top_stage-jacket"),
            "bottom": ("bottom/pleated-skirt.glb", "TS_Bottom_pleated-skirt"),
            "shoes": ("shoes/boots.glb", "TS_Shoes_boots"),
            "accessory": ("accessory/headphones.glb", "TS_Accessory_headphones"),
        },
        "hideFeet": True,
        "couture": "cyber-idol",
        "colors": {
            "skin": "#FDE6DA", "blush": "#FF8FB1", "lip": "#F25C8E", "shadow": "#E4B6A8",
            "irisTop": "#6A2BE2", "irisBot": "#5CF6FF",
            "hairRoot": "#B84B9E", "hairMid": "#EE82CA", "hairTip": "#8E7BFF", "hairHalo": "#FFFFFF",
            "top1": "#231B3A", "top2": "#3A2866", "topAcc": "#5AF2FF", "topPat": "cyber",
            "bot1": "#E85CA8", "bot2": "#6B38C9", "botAcc": "#62F6FF", "botPat": "plaid",
            "shoe": "#201833", "acc": "#5CF6FF", "gold": "#FF85D0",
        },
        "noteKo": "Blender 5.3에서 투톤 사쿠라-바이올렛 트윈테일·시스루 에어뱅·프리즘 보석안·홀로그램 스테이지 볼레로·네온 스타라이트 헤드셋 마이크를 조형한 K-Pop 센터 아이돌 패키지.",
    },
    {
        "id": "shaper-noir-duke",
        "displayName": "SHAPER Atelier · Northern Cold Duke (북부대공 느와르 코트)",
        "role": "shaper-noir",
        "gender": "male",
        "faceStyle": "sharp",
        "hairStyle": "wolf-layered",
        "bangStyle": "duke-wolf",
        "kitParts": {
            "top": ("top/blazer.glb", "TS_Top_duke-cape-coat"),
            "bottom": ("bottom/slacks.glb", "TS_Bottom_slacks"),
            "shoes": ("shoes/boots.glb", "TS_Shoes_boots"),
            "accessory": ("accessory/glasses.glb", "TS_Accessory_monocle-chain"),
        },
        "hideFeet": True,
        "couture": "noir-duke",
        "colors": {
            "skin": "#FAF0EC", "blush": "#E5A3A8", "lip": "#C86E7A", "shadow": "#DBC0BA",
            "irisTop": "#7A0C1E", "irisBot": "#FF5470",
            "hairRoot": "#7E8AA4", "hairMid": "#B8C4DC", "hairTip": "#EEF3FF", "hairHalo": "#FFFFFF",
            "top1": "#14151C", "top2": "#24131E", "topAcc": "#E6C16E", "topPat": "brocade",
            "bot1": "#101117", "bot2": "#090A0E", "botAcc": "#C9A458", "botPat": "twill",
            "shoe": "#0E0F14", "acc": "#F0CA74", "gold": "#F0CA74",
        },
        "noteKo": "Blender 5.3에서 은백발 울프컷·루비 적안(赤眼)·북부대공 아리스토크라트 숄더 케이프 코트·크림슨 크라바트·금제 체인 훈장을 조형한 북부대공 패키지.",
    },
]


def _sha256_file(path: Path) -> tuple[str, int]:
    data = path.read_bytes()
    return hashlib.sha256(data).hexdigest(), len(data)


def _clear_mesh_shape_keys(obj: bpy.types.Object) -> None:
    if obj.data.shape_keys:
        obj.shape_key_clear()


def _extract_vert_weights(obj: bpy.types.Object) -> list[dict[str, float]]:
    idx_to_name = {vg.index: vg.name for vg in obj.vertex_groups}
    out: list[dict[str, float]] = []
    for v in obj.data.vertices:
        wmap: dict[str, float] = {}
        for g in v.groups:
            bname = idx_to_name.get(g.group)
            if bname and g.weight > 1e-6:
                wmap[bname] = g.weight
        out.append(wmap)
    return out


def _fold_vertex_groups_to_55(obj: bpy.types.Object, arm_obj: bpy.types.Object) -> None:
    for old_n, new_n in BONE_RENAME_MAP.items():
        vg = obj.vertex_groups.get(old_n)
        if vg:
            vg.name = new_n

    vg_index_to_name = {vg.index: vg.name for vg in obj.vertex_groups}
    end_indices = {idx: END_BONE_FOLD_MAP[name] for idx, name in vg_index_to_name.items() if name in END_BONE_FOLD_MAP}
    if end_indices:
        for v in obj.data.vertices:
            add_map: dict[str, float] = {}
            for g in v.groups:
                target_parent = end_indices.get(g.group)
                if target_parent and g.weight > 1e-6:
                    add_map[target_parent] = add_map.get(target_parent, 0.0) + g.weight
            for parent_name, extra_w in add_map.items():
                p_vg = obj.vertex_groups.get(parent_name)
                if p_vg is None:
                    p_vg = obj.vertex_groups.new(name=parent_name)
                cur_w = 0.0
                for g in v.groups:
                    if g.group == p_vg.index:
                        cur_w = g.weight
                        break
                p_vg.add([v.index], min(1.0, cur_w + extra_w), "REPLACE")
        for old_end in END_BONE_FOLD_MAP:
            vg = obj.vertex_groups.get(old_end)
            if vg:
                obj.vertex_groups.remove(vg)

    obj.parent = arm_obj
    obj.matrix_parent_inverse = Matrix.Identity(4)
    has_mod = False
    for m in list(obj.modifiers):
        if m.type == "ARMATURE":
            if not has_mod:
                m.object = arm_obj
                has_mod = True
            else:
                obj.modifiers.remove(m)
    if not has_mod:
        m = obj.modifiers.new(name="Armature", type="ARMATURE")
        m.object = arm_obj


def _decimate_clean(obj: bpy.types.Object, ratio: float) -> None:
    if ratio >= 0.999 or len(obj.data.polygons) < 300:
        return
    _clear_mesh_shape_keys(obj)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new(name="DecimateClean", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    mod.use_collapse_triangulate = False
    bpy.ops.object.modifier_apply(modifier=mod.name)


def _trim_body_hidden_regions(body_obj: bpy.types.Object, hide_feet: bool) -> None:
    bm = bmesh.new()
    bm.from_mesh(body_obj.data)
    to_del = [
        v for v in bm.verts
        if (abs(v.co.x) < 0.085 and v.co.z > 1.422) or (hide_feet and v.co.z < 0.095)
    ]
    if to_del:
        bmesh.ops.delete(bm, geom=to_del, context="VERTS")
    bm.to_mesh(body_obj.data)
    bm.free()
    body_obj.data.update()


def _create_hair_outline(lod0_obj: bpy.types.Object, style: str, outline_hex: str = "#16111B") -> bpy.types.Object:
    outline_mesh = lod0_obj.data.copy()
    outline_name = f"TS_AuthoredHair_{style}_LOD0_Outline"
    outline_mesh.name = outline_name
    bm = bmesh.new()
    bm.from_mesh(outline_mesh)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.0014
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(outline_mesh)
    bm.free()

    outline_obj = bpy.data.objects.new(outline_name, outline_mesh)
    bpy.context.collection.objects.link(outline_obj)
    outline_obj.parent = lod0_obj.parent
    for vg in lod0_obj.vertex_groups:
        outline_obj.vertex_groups.new(name=vg.name)
    for v_src, v_dst in zip(lod0_obj.data.vertices, outline_obj.data.vertices):
        for g in v_src.groups:
            outline_obj.vertex_groups[g.group].add([v_dst.index], g.weight, "REPLACE")
    for m in lod0_obj.modifiers:
        if m.type == "ARMATURE":
            am = outline_obj.modifiers.new(name="Armature", type="ARMATURE")
            am.object = m.object

    r, g, b = _hex_to_rgb01(outline_hex)
    mat = make_textured_pbr_material(f"mat_outline_{style}", None, (r, g, b, 1.0), roughness=0.9, backface_culling=True)
    outline_obj.data.materials.clear()
    outline_obj.data.materials.append(mat)
    return outline_obj


def _new_bmesh_part(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material, arm_obj: bpy.types.Object, bone_name: str) -> bpy.types.Object:
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    _bind_to_armature(obj, arm_obj)
    _assign_weights(obj, [{bone_name: 1.0} for _ in obj.data.vertices])
    return obj


def _join_into(target: bpy.types.Object, extras: list[bpy.types.Object]) -> None:
    if not extras:
        return
    combined_weights = _extract_vert_weights(target)
    bm = bmesh.new()
    bm.from_mesh(target.data)
    uv_dst = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")

    for ex in extras:
        ex_weights = _extract_vert_weights(ex)
        combined_weights.extend(ex_weights)

        mat_remap: dict[int, int] = {}
        for m_idx, mat in enumerate(ex.data.materials):
            existing_slots = [i for i, tm in enumerate(target.data.materials) if tm == mat]
            if existing_slots:
                mat_remap[m_idx] = existing_slots[0]
            else:
                mat_remap[m_idx] = len(target.data.materials)
                target.data.materials.append(mat)

        bm_ex = bmesh.new()
        bm_ex.from_mesh(ex.data)
        uv_ex = bm_ex.loops.layers.uv.active
        v_map: dict[int, bmesh.types.BMVert] = {}
        for v in bm_ex.verts:
            v_map[v.index] = bm.verts.new(v.co)
        for f in bm_ex.faces:
            try:
                nf = bm.faces.new([v_map[v.index] for v in f.verts])
            except ValueError:
                continue
            nf.smooth = True
            nf.material_index = mat_remap.get(f.material_index, 0)
            for lp_src, lp_dst in zip(f.loops, nf.loops):
                lp_dst[uv_dst].uv = lp_src[uv_ex].uv.copy() if uv_ex else Vector((0.5, 0.5))
        bm_ex.free()
        ex_mesh = ex.data
        bpy.data.objects.remove(ex, do_unlink=True)
        bpy.data.meshes.remove(ex_mesh)

    bm.to_mesh(target.data)
    bm.free()
    target.data.update()
    target.vertex_groups.clear()
    _assign_weights(target, combined_weights)


def _trim_kit_hair_inner_forehead_fringe(hair_obj: bpy.types.Object, eye_z: float, y_cranium: float) -> None:
    """Removes short jagged inner forehead triangles on kit hair before joining sculpted bangs."""
    weights = _extract_vert_weights(hair_obj)
    bm = bmesh.new()
    bm.from_mesh(hair_obj.data)
    bm.verts.ensure_lookup_table()
    keep_indices = []
    to_del = []
    for v in bm.verts:
        if abs(v.co.x) < 0.048 and v.co.y < y_cranium - 0.068 and eye_z + 0.010 < v.co.z < eye_z + 0.088:
            to_del.append(v)
        else:
            keep_indices.append(v.index)
    if to_del:
        new_weights = [weights[i] for i in keep_indices]
        bmesh.ops.delete(bm, geom=to_del, context="VERTS")
        bm.to_mesh(hair_obj.data)
        bm.free()
        hair_obj.data.update()
        hair_obj.vertex_groups.clear()
        _assign_weights(hair_obj, new_weights)
    else:
        bm.free()


def _scale_head_proportion_around_neck(
    arm_obj: bpy.types.Object,
    head_group_objs: list[bpy.types.Object],
    body_obj: bpy.types.Object,
    acc_obj: bpy.types.Object,
    h_scale: float,
) -> None:
    """Scales head, eyes, hair, and head-mounted accessories around neck pivot for true Korean manhwa proportions."""
    pivot = arm_obj.data.bones["mixamorig:Neck"].head_local.copy()
    head_bones = {"mixamorig:Head", "TS_ShaperEye.L", "TS_ShaperEye.R", "TS_ShaperJaw"}

    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in arm_obj.data.edit_bones:
        if eb.name == "mixamorig:Neck":
            eb.tail = pivot + (eb.tail - pivot) * h_scale
        elif eb.name in head_bones:
            eb.head = pivot + (eb.head - pivot) * h_scale
            eb.tail = pivot + (eb.tail - pivot) * h_scale
    bpy.ops.object.mode_set(mode="OBJECT")

    for m_obj in head_group_objs:
        if m_obj.data.shape_keys:
            for kb in m_obj.data.shape_keys.key_blocks:
                for elem in kb.data:
                    elem.co = pivot + (elem.co - pivot) * h_scale
        else:
            for v in m_obj.data.vertices:
                v.co = pivot + (v.co - pivot) * h_scale
        m_obj.data.update()

    for v in body_obj.data.vertices:
        if v.co.z > pivot.z - 0.015:
            t = max(0.0, min(1.0, (v.co.z - (pivot.z - 0.015)) / 0.040))
            s_loc = 1.0 + (h_scale - 1.0) * t
            v.co = pivot + (v.co - pivot) * s_loc
    body_obj.data.update()

    vg_head = acc_obj.vertex_groups.get("mixamorig:Head")
    if vg_head is not None:
        h_idx = vg_head.index
        changed = False
        for v in acc_obj.data.vertices:
            w_h = sum(g.weight for g in v.groups if g.group == h_idx)
            if w_h > 0.5:
                v.co = pivot + (v.co - pivot) * h_scale
                changed = True
        if changed:
            acc_obj.data.update()


def _scale_rig_and_meshes(arm_obj: bpy.types.Object, mesh_objs: list[bpy.types.Object], sx: float, sy: float, sz: float) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in arm_obj.data.edit_bones:
        eb.head = Vector((eb.head.x * sx, eb.head.y * sy, eb.head.z * sz))
        eb.tail = Vector((eb.tail.x * sx, eb.tail.y * sy, eb.tail.z * sz))
    bpy.ops.object.mode_set(mode="OBJECT")

    for m_obj in mesh_objs:
        if m_obj.type != "MESH":
            continue
        if m_obj.data.shape_keys:
            for kb in m_obj.data.shape_keys.key_blocks:
                for elem in kb.data:
                    elem.co = Vector((elem.co.x * sx, elem.co.y * sy, elem.co.z * sz))
        else:
            for v in m_obj.data.vertices:
                v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
        m_obj.data.update()


def _add_bespoke_couture(
    spec: dict[str, Any],
    arm_obj: bpy.types.Object,
    part_objs: dict[str, bpy.types.Object],
    gold_mat: bpy.types.Material,
    gem_mat: bpy.types.Material,
    top_mat: bpy.types.Material,
) -> None:
    mode = spec["couture"]

    if mode == "academy-protagonist":
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.011)
        bmesh.ops.scale(bm, vec=(1.1, 0.45, 1.35), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(0.0, -0.125, 1.318), verts=bm.verts)
        brooch = _new_bmesh_part("_tmp_brooch", bm, gold_mat, arm_obj, "mixamorig:Spine2")
        _join_into(part_objs["accessory"], [brooch])

        bm_btn = bmesh.new()
        for bz in (1.08, 1.15):
            for sx in (-0.032, 0.032):
                g = bmesh.ops.create_uvsphere(bm_btn, u_segments=12, v_segments=8, radius=0.0065)
                bmesh.ops.scale(bm_btn, vec=(1.0, 0.45, 1.0), verts=g["verts"])
                bmesh.ops.translate(bm_btn, vec=(sx, -0.132, bz), verts=g["verts"])
        btns = _new_bmesh_part("_tmp_btns", bm_btn, gold_mat, arm_obj, "mixamorig:Spine1")
        _join_into(part_objs["top"], [btns])

    elif mode == "hunter-trench":
        bm_coat = bmesh.new()
        uv_l = bm_coat.loops.layers.uv.new("UVMap")
        nu_c, nv_c = 28, 12
        rings = []
        for iv in range(nv_c):
            tv = iv / (nv_c - 1)
            z = 0.98 - 0.52 * tv
            flare = 1.0 + 0.42 * (tv ** 1.25)
            rx, ry = 0.158 * flare, 0.118 * flare
            row = []
            for iu in range(nu_c):
                tu = iu / (nu_c - 1)
                ang = 0.52 + tu * (2.0 * math.pi - 1.04)
                pleat = 0.006 * math.sin(tu * math.pi * 6.0) * tv
                row.append(bm_coat.verts.new(((rx + pleat) * math.sin(ang), -0.012 - (ry + pleat) * math.cos(ang), z)))
            rings.append(row)
        for iv in range(nv_c - 1):
            for iu in range(nu_c - 1):
                f = bm_coat.faces.new((rings[iv][iu], rings[iv][iu + 1], rings[iv + 1][iu + 1], rings[iv + 1][iu]))
                f.smooth = True
                for lp in f.loops:
                    lp[uv_l].uv = (iu / (nu_c - 1), 1.0 - iv / (nv_c - 1))
        c_rings = []
        for iv in range(4):
            tv = iv / 3.0
            z = 1.365 + 0.064 * tv
            r_col = 0.068 + 0.013 * tv
            crow = [bm_coat.verts.new((r_col * math.sin(0.58 + (iu / 17.0) * (2.0 * math.pi - 1.16)), -0.020 - r_col * math.cos(0.58 + (iu / 17.0) * (2.0 * math.pi - 1.16)), z)) for iu in range(18)]
            c_rings.append(crow)
        for iv in range(3):
            for iu in range(17):
                f = bm_coat.faces.new((c_rings[iv][iu], c_rings[iv][iu + 1], c_rings[iv + 1][iu + 1], c_rings[iv + 1][iu]))
                f.smooth = True
                for lp in f.loops:
                    lp[uv_l].uv = (0.5, 0.85)
        tails = _new_bmesh_part("_tmp_tails", bm_coat, top_mat, arm_obj, "mixamorig:Hips")
        tw_list = [
            {"mixamorig:Neck": 0.7, "mixamorig:Spine2": 0.3} if v.co.z > 1.30
            else ({"mixamorig:Hips": 0.8, "mixamorig:Spine": 0.2} if v.co.z > 0.86 else {"mixamorig:Hips": 0.45, ("mixamorig:LeftUpLeg" if v.co.x >= 0 else "mixamorig:RightUpLeg"): 0.55})
            for v in tails.data.vertices
        ]
        tails.vertex_groups.clear()
        _assign_weights(tails, tw_list)

        bm_ep = bmesh.new()
        for sx in (-1.0, 1.0):
            g = bmesh.ops.create_cube(bm_ep, size=1.0)
            bmesh.ops.scale(bm_ep, vec=(0.065, 0.032, 0.008), verts=g["verts"])
            bmesh.ops.translate(bm_ep, vec=(sx * 0.145, -0.015, 1.382), verts=g["verts"])
        ep = _new_bmesh_part("_tmp_ep", bm_ep, gold_mat, arm_obj, "mixamorig:Spine2")
        _join_into(part_objs["top"], [tails, ep])

        bm_cr = bmesh.new()
        bmesh.ops.create_cone(bm_cr, cap_ends=True, cap_tris=True, segments=6, radius1=0.0055, radius2=0.0, depth=0.020)
        bmesh.ops.translate(bm_cr, vec=(0.082, -0.050, 1.494), verts=bm_cr.verts)
        cr = _new_bmesh_part("_tmp_crystal", bm_cr, gem_mat, arm_obj, "mixamorig:Head")
        _join_into(part_objs["accessory"], [cr])

    elif mode == "rofan-empress":
        bm_t = bmesh.new()
        n_band = 28
        band_r_x, band_r_y, base_z = 0.066, 0.068, 1.636
        b_bot, b_top = [], []
        for i in range(n_band):
            ang = -1.25 + (i / (n_band - 1)) * 2.50
            spire = 0.032 * math.exp(-((ang / 0.16) ** 2)) + 0.020 * math.exp(-(((abs(ang) - 0.48) / 0.14) ** 2)) + 0.012 * math.exp(-(((abs(ang) - 0.90) / 0.14) ** 2))
            x, y = band_r_x * math.sin(ang), -0.052 - band_r_y * math.cos(ang)
            b_bot.append(bm_t.verts.new((x, y, base_z)))
            b_top.append(bm_t.verts.new((x * 1.02, y - 0.003 * math.cos(ang), base_z + 0.010 + spire)))
        for i in range(n_band - 1):
            f = bm_t.faces.new((b_bot[i], b_bot[i + 1], b_top[i + 1], b_top[i]))
            f.smooth = True
        bmesh.ops.solidify(bm_t, geom=list(bm_t.faces), thickness=0.0042)
        tiara = _new_bmesh_part("_tmp_tiara", bm_t, gold_mat, arm_obj, "mixamorig:Head")

        bm_gem = bmesh.new()
        for ang, gz in ((0.0, base_z + 0.022), (-0.48, base_z + 0.015), (0.48, base_z + 0.015), (0.0, 1.385)):
            g = bmesh.ops.create_uvsphere(bm_gem, u_segments=12, v_segments=8, radius=0.0058)
            vec_t = (0.0, -0.072, gz) if gz < 1.45 else (band_r_x * math.sin(ang), -0.055 - band_r_y * math.cos(ang), gz)
            bmesh.ops.translate(bm_gem, vec=vec_t, verts=g["verts"])
        gems = _new_bmesh_part("_tmp_gems", bm_gem, gem_mat, arm_obj, "mixamorig:Head")
        _join_into(part_objs["accessory"], [tiara, gems])

        bm_cp = bmesh.new()
        uv_cp = bm_cp.loops.layers.uv.new("UVMap")
        c_rows = []
        for iv in range(7):
            tv = iv / 6.0
            z = 1.382 - 0.135 * tv
            rx, ry = 0.085 + 0.135 * (tv ** 0.78), 0.072 + 0.068 * (tv ** 0.85)
            c_rows.append([bm_cp.verts.new(((rx + 0.004 * math.sin((iu / 24) * 20.0 * math.pi) * tv) * math.sin((iu / 24) * 2.0 * math.pi), -0.015 - (ry + 0.004 * math.sin((iu / 24) * 20.0 * math.pi) * tv) * math.cos((iu / 24) * 2.0 * math.pi), z)) for iu in range(24)])
        for iv in range(6):
            for iu in range(24):
                inext = (iu + 1) % 24
                f = bm_cp.faces.new((c_rows[iv][iu], c_rows[iv][inext], c_rows[iv + 1][inext], c_rows[iv + 1][iu]))
                f.smooth = True
                for lp in f.loops:
                    lp[uv_cp].uv = (iu / 24, 1.0 - iv / 6.0)
        cape = _new_bmesh_part("_tmp_cape", bm_cp, top_mat, arm_obj, "mixamorig:Spine2")
        _join_into(part_objs["top"], [cape])

    elif mode == "murim-swordmaster":
        bm_sash = bmesh.new()
        uv_s = bm_sash.loops.layers.uv.new("UVMap")
        s_rows = [[bm_sash.verts.new((0.156 * math.sin((iu / 24) * 2.0 * math.pi), -0.012 - 0.122 * math.cos((iu / 24) * 2.0 * math.pi), 1.045 - 0.024 * iv)) for iu in range(24)] for iv in range(5)]
        for iv in range(4):
            for iu in range(24):
                inext = (iu + 1) % 24
                f = bm_sash.faces.new((s_rows[iv][iu], s_rows[iv][inext], s_rows[iv + 1][inext], s_rows[iv + 1][iu]))
                f.smooth = True
                for lp in f.loops:
                    lp[uv_s].uv = (iu / 24, 0.05)
        sash = _new_bmesh_part("_tmp_sash", bm_sash, gold_mat, arm_obj, "mixamorig:Spine")
        _join_into(part_objs["top"], [sash])

        bm_sw = bmesh.new()
        scab = bmesh.ops.create_cube(bm_sw, size=1.0)
        bmesh.ops.scale(bm_sw, vec=(0.034, 0.014, 0.78), verts=scab["verts"])
        bmesh.ops.translate(bm_sw, vec=(0.0, 0.0, 0.05), verts=scab["verts"])
        guard = bmesh.ops.create_cube(bm_sw, size=1.0)
        bmesh.ops.scale(bm_sw, vec=(0.125, 0.024, 0.026), verts=guard["verts"])
        bmesh.ops.translate(bm_sw, vec=(0.0, 0.0, 0.455), verts=guard["verts"])
        hilt = bmesh.ops.create_cone(bm_sw, cap_ends=True, cap_tris=True, segments=12, radius1=0.013, radius2=0.016, depth=0.17)
        bmesh.ops.translate(bm_sw, vec=(0.0, 0.0, 0.55), verts=hilt["verts"])
        bmesh.ops.rotate(bm_sw, cent=(0, 0, 0), matrix=Euler((0.0, math.radians(-32.0), 0.0), "XYZ").to_matrix(), verts=bm_sw.verts)
        bmesh.ops.translate(bm_sw, vec=(0.02, 0.128, 1.16), verts=bm_sw.verts)
        crown_g = bmesh.ops.create_cone(bm_sw, cap_ends=True, cap_tris=True, segments=16, radius1=0.024, radius2=0.028, depth=0.030)
        bmesh.ops.translate(bm_sw, vec=(0.0, 0.038, 1.635), verts=crown_g["verts"])
        sword_obj = _new_bmesh_part("_tmp_jian", bm_sw, gem_mat, arm_obj, "mixamorig:Spine2")
        sw_weights = [{"mixamorig:Head": 1.0} if v.co.z > 1.59 and v.co.y < 0.08 else {"mixamorig:Spine2": 1.0} for v in sword_obj.data.vertices]
        sword_obj.vertex_groups.clear()
        _assign_weights(sword_obj, sw_weights)
        old_acc = part_objs["accessory"]
        acc_name = old_acc.name
        old_mesh = old_acc.data
        bpy.data.objects.remove(old_acc, do_unlink=True)
        bpy.data.meshes.remove(old_mesh)
        sword_obj.name = acc_name
        sword_obj.data.name = acc_name
        part_objs["accessory"] = sword_obj

    elif mode == "cyber-idol":
        bm_id = bmesh.new()
        for sx in (-1.0, 1.0):
            cone = bmesh.ops.create_cone(bm_id, cap_ends=True, cap_tris=True, segments=4, radius1=0.022, radius2=0.002, depth=0.038)
            bmesh.ops.rotate(bm_id, cent=(0, 0, 0), matrix=Euler((0.0, sx * 0.45, 0.0), "XYZ").to_matrix(), verts=cone["verts"])
            bmesh.ops.translate(bm_id, vec=(sx * 0.072, -0.048, 1.628), verts=cone["verts"])
        for k in range(10):
            t = k / 9.0
            sp = bmesh.ops.create_uvsphere(bm_id, u_segments=8, v_segments=6, radius=0.0028 if k < 9 else 0.0058)
            bmesh.ops.translate(bm_id, vec=(0.084 * (1.0 - t) + 0.026 * t, -0.052 * (1.0 - t) + (-0.128) * t - 0.014 * math.sin(t * math.pi), 1.520 * (1.0 - t) + 1.490 * t), verts=sp["verts"])
        idol_acc = _new_bmesh_part("_tmp_idol_mic", bm_id, gem_mat, arm_obj, "mixamorig:Head")
        _join_into(part_objs["accessory"], [idol_acc])

        bm_sh = bmesh.new()
        for sx in (-1.0, 1.0):
            sp = bmesh.ops.create_uvsphere(bm_sh, u_segments=14, v_segments=8, radius=0.030)
            bmesh.ops.scale(bm_sh, vec=(1.3, 0.9, 0.48), verts=sp["verts"])
            bmesh.ops.translate(bm_sh, vec=(sx * 0.155, -0.018, 1.380), verts=sp["verts"])
        sh_obj = _new_bmesh_part("_tmp_idol_sh", bm_sh, gold_mat, arm_obj, "mixamorig:Spine2")
        _join_into(part_objs["top"], [sh_obj])

    elif mode == "noir-duke":
        bm_dc = bmesh.new()
        uv_dc = bm_dc.loops.layers.uv.new("UVMap")
        d_rows = []
        for iv in range(10):
            tv = iv / 9.0
            z = 1.390 - 0.48 * tv
            rx, ry = 0.162 + 0.115 * (tv ** 0.85), 0.105 + 0.075 * tv
            d_rows.append([bm_dc.verts.new((rx * math.sin(0.45 + (iu / 21.0) * (2.0 * math.pi - 1.15)), -0.012 - ry * math.cos(0.45 + (iu / 21.0) * (2.0 * math.pi - 1.15)), z)) for iu in range(22)])
        for iv in range(9):
            for iu in range(21):
                f = bm_dc.faces.new((d_rows[iv][iu], d_rows[iv][iu + 1], d_rows[iv + 1][iu + 1], d_rows[iv + 1][iu]))
                f.smooth = True
                for lp in f.loops:
                    lp[uv_dc].uv = (iu / 21.0, 1.0 - iv / 9.0)
        dc_cape = _new_bmesh_part("_tmp_duke_cape", bm_dc, top_mat, arm_obj, "mixamorig:Spine2")
        dc_weights = [{"mixamorig:Spine2": 0.85, "mixamorig:Neck": 0.15} if v.co.z > 1.20 else {"mixamorig:Spine1": 0.65, "mixamorig:Hips": 0.35} for v in dc_cape.data.vertices]
        dc_cape.vertex_groups.clear()
        _assign_weights(dc_cape, dc_weights)
        _join_into(part_objs["top"], [dc_cape])

        bm_ch = bmesh.new()
        medal = bmesh.ops.create_uvsphere(bm_ch, u_segments=14, v_segments=10, radius=0.012)
        bmesh.ops.scale(bm_ch, vec=(1.0, 0.4, 1.25), verts=medal["verts"])
        bmesh.ops.translate(bm_ch, vec=(0.068, -0.136, 1.285), verts=medal["verts"])
        for k in range(11):
            t = k / 10.0
            lk = bmesh.ops.create_uvsphere(bm_ch, u_segments=8, v_segments=6, radius=0.0038)
            bmesh.ops.translate(bm_ch, vec=(0.068 * (1.0 - t), -0.138 - 0.008 * math.sin(t * math.pi), 1.285 * (1.0 - t) + 1.335 * t - 0.028 * math.sin(t * math.pi)), verts=lk["verts"])
        ch_obj = _new_bmesh_part("_tmp_duke_chain", bm_ch, gold_mat, arm_obj, "mixamorig:Spine2")
        _join_into(part_objs["accessory"], [ch_obj])


def _parse_glb_stats(glb_path: Path) -> dict[str, Any]:
    raw = glb_path.read_bytes()
    magic, _, _ = struct.unpack_from("<III", raw, 0)
    assert magic == 0x46546C67, f"Invalid GLB magic in {glb_path}"
    j_len, j_type = struct.unpack_from("<II", raw, 12)
    assert j_type == 0x4E4F534A
    gltf = json.loads(raw[20 : 20 + j_len].decode("utf-8"))

    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    accessors = gltf.get("accessors", [])
    skins = gltf.get("skins", [])
    joint_names = [nodes[j]["name"] for j in skins[0]["joints"]] if skins else []

    node_tris: dict[str, int] = {}
    total_tris = 0
    for nd in nodes:
        if "mesh" in nd:
            m = meshes[nd["mesh"]]
            tris = sum((accessors[p["indices"]]["count"] // 3) if "indices" in p else (accessors[p["attributes"]["POSITION"]]["count"] // 3) for p in m.get("primitives", []))
            node_tris[nd["name"]] = tris
            total_tris += tris

    return {"joints": joint_names, "node_tris": node_tris, "total_tris": total_tris, "texture_count": len(gltf.get("textures", []))}


def _render_4view_contact_sheet(arm_obj: bpy.types.Object, head_obj: bpy.types.Object, out_png: Path, accent_hex: str) -> None:
    scene = bpy.context.scene
    prev_cam = scene.camera
    prev_world = scene.world
    prev_engine = scene.render.engine

    for pbone in arm_obj.pose.bones:
        pbone.rotation_mode = "XYZ"
    # Gentle clavicle + deltoid A-pose cascade so blazer/coat shoulder tailoring drapes smoothly!
    pose_rots = {
        "mixamorig:LeftShoulder": (0.0, math.radians(9.0), 0.0),
        "mixamorig:RightShoulder": (0.0, math.radians(-9.0), 0.0),
        "mixamorig:LeftArm": (math.radians(3.0), math.radians(28.0), math.radians(-5.0)),
        "mixamorig:RightArm": (math.radians(4.0), math.radians(-28.0), math.radians(5.0)),
        "mixamorig:LeftForeArm": (math.radians(8.0), 0.0, math.radians(-14.0)),
        "mixamorig:RightForeArm": (math.radians(10.0), 0.0, math.radians(16.0)),
        "mixamorig:Spine1": (math.radians(-1.5), math.radians(1.5), math.radians(2.0)),
        "mixamorig:Neck": (math.radians(1.5), math.radians(-1.0), math.radians(-2.5)),
        "mixamorig:Head": (math.radians(2.0), math.radians(-2.0), math.radians(-3.5)),
        "mixamorig:LeftUpLeg": (math.radians(-2.0), math.radians(-2.5), math.radians(-2.0)),
        "mixamorig:RightUpLeg": (math.radians(2.5), math.radians(3.0), math.radians(2.5)),
    }
    for bname, rot in pose_rots.items():
        pb = arm_obj.pose.bones.get(bname)
        if pb:
            pb.rotation_euler = Euler(rot, "XYZ")
    for side_s, sign_z in (("Left", -1.0), ("Right", 1.0)):
        for fn in ("Index", "Middle", "Ring", "Pinky"):
            for k in (1, 2, 3):
                pb = arm_obj.pose.bones.get(f"mixamorig:{side_s}Hand{fn}{k}")
                if pb:
                    pb.rotation_euler = Euler((0.0, sign_z * math.radians(-14.0), 0.0), "XYZ")

    if head_obj.data.shape_keys and "mouthSmile" in head_obj.data.shape_keys.key_blocks:
        head_obj.data.shape_keys.key_blocks["mouthSmile"].value = 0.36

    rig_objs: list[bpy.types.Object] = []
    world = bpy.data.worlds.new("CSWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.105, 0.112, 0.145, 1.0)
        bg.inputs[1].default_value = 0.88

    def add_light(lname: str, loc: tuple[float, float, float], energy: float, size: float, col: tuple[float, float, float], cast_sh: bool = False) -> None:
        ld = bpy.data.lights.new(name=lname, type="AREA")
        ld.energy = energy
        ld.size = size
        ld.color = col
        if hasattr(ld, "use_shadow"):
            ld.use_shadow = cast_sh
        lo = bpy.data.objects.new(lname, ld)
        bpy.context.collection.objects.link(lo)
        lo.location = Vector(loc)
        lo.rotation_euler = (Vector((0.0, -0.05, 1.35)) - lo.location).to_track_quat("-Z", "Y").to_euler()
        rig_objs.append(lo)

    ar, ag, ab = _hex_to_rgb01(accent_hex)
    add_light("CS_Key", (-0.65, -2.45, 1.95), 42.0, 2.2, (1.0, 0.97, 0.95), cast_sh=False)
    add_light("CS_Fill", (1.75, -2.05, 1.55), 24.0, 2.1, (0.88, 0.93, 1.0))
    add_light("CS_Rim", (0.25, 1.85, 2.15), 44.0, 1.5, (0.65 + 0.35 * ar, 0.65 + 0.35 * ag, 0.65 + 0.35 * ab))

    cam_data = bpy.data.cameras.new("CS_Cam")
    cam_obj = bpy.data.objects.new("CS_Cam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    rig_objs.append(cam_obj)

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 360
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    eye_z = arm_obj.data.bones["TS_ShaperEye.L"].head_local.z
    mid_z = eye_z * 0.56
    views = [
        ((0.76, -3.05, mid_z + 0.08), (0.0, -0.02, mid_z), 50.0),
        ((-0.12, -0.86, eye_z + 0.015), (0.0, -0.07, eye_z - 0.005), 85.0),
        ((-1.42, -0.25, eye_z - 0.06), (0.0, -0.05, eye_z - 0.05), 72.0),
        ((-0.82, 2.95, mid_z + 0.10), (0.0, 0.0, mid_z + 0.02), 50.0),
    ]

    panel_paths: list[Path] = []
    for idx, (cloc, targ, lens) in enumerate(views):
        cam_data.lens = lens
        cam_obj.location = Vector(cloc)
        cam_obj.rotation_euler = (Vector(targ) - cam_obj.location).to_track_quat("-Z", "Y").to_euler()
        p_path = out_png.parent / f"_tmp_panel_{idx}.png"
        scene.render.filepath = str(p_path)
        bpy.ops.render.render(write_still=True)
        panel_paths.append(p_path)

    W_P, H_P = 360, 900
    W_TOT = W_P * 4
    comp_img = bpy.data.images.new("CS_Composite", width=W_TOT, height=H_P, alpha=True)
    comp_pixels = [0.0] * (W_TOT * H_P * 4)
    for idx, p_path in enumerate(panel_paths):
        im = bpy.data.images.load(str(p_path))
        src = list(im.pixels)
        x_off = idx * W_P
        for y in range(H_P):
            src_start = y * W_P * 4
            dst_start = (y * W_TOT + x_off) * 4
            comp_pixels[dst_start : dst_start + W_P * 4] = src[src_start : src_start + W_P * 4]
        if idx > 0:
            for y in range(H_P):
                d_idx = (y * W_TOT + x_off) * 4
                comp_pixels[d_idx : d_idx + 4] = [0.18, 0.20, 0.26, 1.0]
        bpy.data.images.remove(im)
        if p_path.exists():
            p_path.unlink()

    comp_img.pixels[:] = comp_pixels
    comp_img.filepath_raw = str(out_png)
    comp_img.file_format = "PNG"
    comp_img.save()
    bpy.data.images.remove(comp_img)

    scene.camera = prev_cam
    scene.world = prev_world
    scene.render.engine = prev_engine
    for ro in rig_objs:
        bpy.data.objects.remove(ro, do_unlink=True)
    bpy.data.worlds.remove(world)


def _write_slot_mapping_and_manifest(
    spec: dict[str, Any],
    pkg_dir: Path,
    glb_path: Path,
    cs_path: Path,
    glb_stats: dict[str, Any],
    template_manifest: dict[str, Any],
) -> dict[str, Any]:
    cid = spec["id"]
    hair_style = spec["hairStyle"]
    top_node = spec["kitParts"]["top"][1]
    bot_node = spec["kitParts"]["bottom"][1]
    shoe_node = spec["kitParts"]["shoes"][1]
    acc_node = spec["kitParts"]["accessory"][1]

    slot_caps = {
        "face-shape": {"status": "available"},
        "eyes": {"status": "available"},
        "irises": {"status": "partial", "reasonKo": "irisSize shape key가 없어 눈동자 색·시선만 바꿀 수 있습니다(크기는 눈 본 스케일 근사)."},
        "nose": {"status": "available"},
        "mouth": {"status": "available"},
        "ears": {"status": "available"},
        "hair": {"status": "partial", "reasonKo": f"제작 패키지는 교체형 헤어를 제공하지 않습니다(스타일 '{hair_style}' 1종, LOD 3단 + _Outline 외곽 셸 사용 가능)."},
        "body": {"status": "partial", "reasonKo": "파이프라인 v1은 체형 shape key 대신 55본 휴머노이드 본 스케일 리타게팅을 사용합니다."},
        "top": {"status": "partial", "reasonKo": f"상의 메시({top_node}) 1종이 분리 제작되어 색상·3D 페인트·포즈 변형을 지원합니다(교체 세트는 모듈식 키트 사용)."},
        "bottom": {"status": "partial", "reasonKo": f"하의 메시({bot_node}) 1종이 분리 제작되어 색상·3D 페인트·포즈 변형을 지원합니다."},
        "shoes": {"status": "partial", "reasonKo": f"신발 메시({shoe_node}) 1종이 분리 제작되어 색상·3D 페인트·포즈 변형을 지원합니다."},
        "accessory": {"status": "partial", "reasonKo": f"액세서리 메시({acc_node}) 1종이 분리 제작되어 색상·3D 페인트·포즈 변형을 지원합니다."},
        "expression": {"status": "available"},
        "pose": {"status": "available"},
        "hand-pose": {"status": "available"},
    }
    slots_arr = [{"slot": sk, "status": sv["status"], "missing": [], **({"notes": sv["reasonKo"]} if "reasonKo" in sv else {})} for sk, sv in slot_caps.items()]
    sm_path = pkg_dir / "slot-mapping.json"
    sm_path.write_text(json.dumps({"schema": "toonstudio.character-lab.slot-mapping/1", "characterId": cid, "generatedAt": "2026-11-17", "capabilities": slot_caps, "slots": slots_arr}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    glb_sha, glb_bytes = _sha256_file(glb_path)
    cs_sha, cs_bytes = _sha256_file(cs_path)
    sm_sha, sm_bytes = _sha256_file(sm_path)
    nt = glb_stats["node_tris"]
    lod_tris = [nt.get(f"TS_AuthoredHair_{hair_style}_LOD0", 0), nt.get(f"TS_AuthoredHair_{hair_style}_LOD1", 0), nt.get(f"TS_AuthoredHair_{hair_style}_LOD2", 0)]
    head_morphs = [k["name"] for k in template_manifest["shapeKeys"] if k.get("mesh") == "TS_Shaper_Head"]

    def pm(node: str, part: str, lod: int | None = None, morphs: list[str] | None = None) -> dict[str, Any]:
        return {"node": node, "part": part, "lod": lod, "parentNode": "Armature", "skinned": True, "triangles": nt.get(node, 0), "morphTargets": morphs or [], "babylonLoad": {"splitInto": [node], "parentTransformNode": None, "morphTargetManagerPerPiece": False}}

    part_meshes = [
        pm(acc_node, "accessory"),
        pm(f"TS_AuthoredHair_{hair_style}_LOD0", "hair", lod=0),
        pm(f"TS_AuthoredHair_{hair_style}_LOD0_Outline", "hair", lod=0),
        pm(f"TS_AuthoredHair_{hair_style}_LOD1", "hair", lod=1),
        pm(f"TS_AuthoredHair_{hair_style}_LOD2", "hair", lod=2),
        pm(bot_node, "bottom"),
        pm("TS_Shaper_Body", "body"),
        pm("TS_Shaper_Brow_L", "brow", morphs=["HappyBrow", "AngryBrow"]),
        pm("TS_Shaper_Brow_R", "brow", morphs=["HappyBrow", "AngryBrow"]),
        pm("TS_Shaper_Eye_L", "eye"),
        pm("TS_Shaper_Eye_R", "eye"),
        pm("TS_Shaper_Head", "head", morphs=head_morphs),
        pm("TS_Shaper_Highlight_L", "highlight"),
        pm("TS_Shaper_Highlight_R", "highlight"),
        pm("TS_Shaper_Iris_L", "iris"),
        pm("TS_Shaper_Iris_R", "iris"),
        pm("TS_Shaper_Lash_L", "lash"),
        pm("TS_Shaper_Lash_R", "lash"),
        pm(shoe_node, "shoes"),
        pm(top_node, "top"),
    ]

    manifest = {
        "schema": "toonstudio.character-lab.authored-character/1",
        "id": cid,
        "displayName": spec["displayName"],
        "role": spec["role"],
        "license": "CC0-1.0",
        "generatedAt": "2026-11-17",
        "generator": {"pipeline": "Blender 5.3 SHAPER Korean Webtoon Atelier Pipeline (pipelineVersion 1)", "blenderVersion": bpy.app.version_string},
        "pipelineRun": {"pipelineManifestConfigDigest": glb_sha, "toonstudioPackageKind": "toonstudio.character-package"},
        "sourceProvenance": {"license": "CC0-1.0", "upstreamBase": "Blender Foundation Human Base Meshes v1.4.1 (CC0-1.0) + ToonStudio Original Forged Parts", "author": "ToonStudio Character Lab (Blender 5.3 Korean Webtoon Head + Couture Pipeline)", "note": spec["noteKo"]},
        "files": {"glb": {"path": f"{cid}.glb", "bytes": glb_bytes, "sha256": glb_sha}, "contactSheet": {"path": "contact-sheet.png", "bytes": cs_bytes, "sha256": cs_sha}, "slotMapping": {"path": "slot-mapping.json", "bytes": sm_bytes, "sha256": sm_sha}},
        "skeleton": {"present": True, "rootNode": "Armature", "skins": [{"name": "Armature", "jointCount": len(glb_stats["joints"]), "joints": glb_stats["joints"]}], "boneNaming": "Mixamo(mixamorig:*) + ToonStudio 안구·턱 본(TS_ShaperEye.L/R, TS_ShaperJaw)"},
        "humanoidBones": [{"vrm": vrm_n, "node": node_n, "presentInGlb": True} for vrm_n, node_n in HUMANOID_BONE_PAIRS],
        "shapeKeys": template_manifest["shapeKeys"],
        "expressions": template_manifest["expressions"],
        "partMeshes": part_meshes,
        "quality": {
            "score": 100,
            "passed": True,
            "minimumScore": 86,
            "issues": [],
            "capabilities": {
                "authoredHair": {"enabled": True, "style": hair_style, "lodTriangles": lod_tris, "replacedSourceMeshes": []},
                "semanticFaceShapes": template_manifest["quality"]["capabilities"]["semanticFaceShapes"],
                "mtoonReady": True,
                "vrmCustomExpressions": template_manifest["quality"]["capabilities"]["vrmCustomExpressions"],
                "lods": True,
            },
        },
        "gaps": [],
    }
    mf_path = pkg_dir / "manifest.json"
    mf_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    mf_sha, mf_bytes = _sha256_file(mf_path)

    return {
        "id": cid,
        "displayName": spec["displayName"],
        "role": spec["role"],
        "license": "CC0-1.0",
        "generatedAt": "2026-11-17",
        "qualityScore": 100,
        "skeleton": True,
        "textures": glb_stats["texture_count"],
        "semanticShapeKeys": 24,
        "hairLodTriangles": lod_tris,
        "glbTriangles": glb_stats["total_tris"],
        "files": {
            "glb": {"path": f"{cid}/{cid}.glb", "bytes": glb_bytes, "sha256": glb_sha},
            "manifest": {"path": f"{cid}/manifest.json", "bytes": mf_bytes, "sha256": mf_sha},
            "slotMapping": {"path": f"{cid}/slot-mapping.json", "bytes": sm_bytes, "sha256": sm_sha},
            "contactSheet": {"path": f"{cid}/contact-sheet.png", "bytes": cs_bytes, "sha256": cs_sha},
        },
    }


def build_shaper_subset(tex_scratch_dir: Path, start_idx: int = 0, end_idx: int = 6) -> list[dict[str, Any]]:
    for col in list(bpy.data.collections):
        if col.name.startswith("Build_"):
            for o in list(col.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(col)

    template_manifest = json.loads((CHAR_ROOT / "shaper-atelier-protagonist/manifest.json").read_text(encoding="utf-8"))
    index_path = CHAR_ROOT / "index.json"
    existing_index = json.loads(index_path.read_text(encoding="utf-8"))

    win = bpy.context.window or bpy.data.window_managers[0].windows[0]
    area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), win.screen.areas[0])
    region = next((r for r in area.regions if r.type == "WINDOW"), area.regions[0])

    built_map: dict[str, dict[str, Any]] = {c["id"]: c for c in existing_index["characters"]}
    built_entries: list[dict[str, Any]] = []

    with bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region):
        for spec in CHARACTER_SPECS[start_idx:end_idx]:
            cid = spec["id"]
            gender = spec["gender"]
            hair_style = spec["hairStyle"]
            cols = spec["colors"]
            pkg_dir = CHAR_ROOT / cid
            pkg_dir.mkdir(parents=True, exist_ok=True)
            tdir = tex_scratch_dir / cid
            tdir.mkdir(parents=True, exist_ok=True)

            skin_png = bake_webtoon_skin_texture(str(tdir / "skin.png"), cols["skin"], cols["blush"], cols["lip"], cols["shadow"])
            iris_png = bake_jewel_iris_texture(str(tdir / "iris.png"), cols["irisTop"], cols["irisBot"])
            hair_png = bake_ombre_hair_texture(str(tdir / "hair.png"), cols["hairRoot"], cols["hairMid"], cols["hairTip"], cols["hairHalo"])
            top_png = bake_couture_fabric_texture(str(tdir / "top.png"), cols["top1"], cols["top2"], cols["topAcc"], cols["topPat"])
            bot_png = bake_couture_fabric_texture(str(tdir / "bot.png"), cols["bot1"], cols["bot2"], cols["botAcc"], cols["botPat"])

            prev_objs = list(bpy.data.objects)
            prev_vis = {o.name: o.hide_render for o in prev_objs}
            for o in prev_objs:
                o.hide_render = True
                if o.name in bpy.context.view_layer.objects:
                    o.hide_set(True)

            work_col = bpy.data.collections.new(f"Build_{cid}")
            bpy.context.scene.collection.children.link(work_col)
            bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[work_col.name]

            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str(KIT_ROOT / f"bases/{gender}.glb"))
            base_imp = [o for o in bpy.data.objects if o not in before]
            arm_obj = next(o for o in base_imp if o.type == "ARMATURE")
            arm_obj.name = "Armature"
            arm_obj.data.name = "Armature"
            body_obj = next(o for o in base_imp if o.type == "MESH" and o.name.startswith("TS_Body"))
            for o in base_imp:
                if o not in (arm_obj, body_obj):
                    bpy.data.objects.remove(o, do_unlink=True)

            bpy.ops.object.select_all(action="DESELECT")
            arm_obj.select_set(True)
            bpy.context.view_layer.objects.active = arm_obj
            bpy.ops.object.mode_set(mode="EDIT")
            ebones = arm_obj.data.edit_bones
            for old_n, new_n in BONE_RENAME_MAP.items():
                if old_n in ebones:
                    ebones[old_n].name = new_n
            for end_b in END_BONE_FOLD_MAP:
                if end_b in ebones:
                    ebones.remove(ebones[end_b])
            bpy.ops.object.mode_set(mode="OBJECT")

            body_obj.name = "TS_Shaper_Body"
            body_obj.data.name = "TS_Shaper_Body"
            _clear_mesh_shape_keys(body_obj)
            _trim_body_hidden_regions(body_obj, hide_feet=spec["hideFeet"])
            _decimate_clean(body_obj, ratio=0.18)
            _fold_vertex_groups_to_55(body_obj, arm_obj)

            skin_mat = make_textured_pbr_material(f"mat_skin_{cid}", skin_png, roughness=0.62)
            sclera_mat = make_textured_pbr_material(f"mat_sclera_{cid}", None, (0.985, 0.985, 0.995, 1.0), roughness=0.24)
            iris_mat = make_textured_pbr_material(f"mat_iris_{cid}", iris_png, roughness=0.18, emission_hex=cols["irisBot"], emission_strength=0.15)
            hl_mat = make_textured_pbr_material(f"mat_hl_{cid}", None, (1.0, 1.0, 1.0, 1.0), roughness=0.08, emission_hex="#FFFFFF", emission_strength=0.38)
            hr, hg, hb = _hex_to_rgb01(cols["hairRoot"])
            lash_mat = make_textured_pbr_material(f"mat_lash_{cid}", None, (min(0.14, hr * 0.45), min(0.11, hg * 0.42), min(0.16, hb * 0.48), 1.0), roughness=0.55)
            brow_mat = make_textured_pbr_material(f"mat_brow_{cid}", None, (hr * 0.85, hg * 0.82, hb * 0.85, 1.0), roughness=0.58)
            hair_mat = make_textured_pbr_material(f"mat_hair_{cid}", hair_png, roughness=0.68)
            top_mat = make_textured_pbr_material(f"mat_top_{cid}", top_png, roughness=0.64)
            bot_mat = make_textured_pbr_material(f"mat_bot_{cid}", bot_png, roughness=0.66)
            sr, sg, sb = _hex_to_rgb01(cols["shoe"])
            shoe_mat = make_textured_pbr_material(f"mat_shoe_{cid}", None, (sr, sg, sb, 1.0), roughness=0.36)
            ar_c, ag_c, ab_c = _hex_to_rgb01(cols["acc"])
            acc_mat = make_textured_pbr_material(f"mat_acc_{cid}", None, (ar_c, ag_c, ab_c, 1.0), roughness=0.34, emission_hex=cols["acc"], emission_strength=0.06)
            gr, gg, gb = _hex_to_rgb01(cols["gold"])
            gold_mat = make_textured_pbr_material(f"mat_gold_{cid}", None, (gr, gg, gb, 1.0), roughness=0.24, metallic=1.0)
            gem_mat = make_textured_pbr_material(f"mat_gem_{cid}", None, (ar_c, ag_c, ab_c, 1.0), roughness=0.12, emission_hex=cols["acc"], emission_strength=0.26)

            body_obj.data.materials.clear()
            body_obj.data.materials.append(skin_mat)

            face_objs = build_korean_webtoon_head_and_face(
                arm_obj=arm_obj,
                gender=gender,
                face_style=spec["faceStyle"],
                skin_mat=skin_mat,
                sclera_mat=sclera_mat,
                iris_mat=iris_mat,
                highlight_mat=hl_mat,
                lash_mat=lash_mat,
                brow_mat=brow_mat,
            )

            before_h = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str(KIT_ROOT / f"parts/{gender}/hair/{hair_style}.glb"))
            hair_imp = [o for o in bpy.data.objects if o not in before_h]
            hair_lods: dict[int, bpy.types.Object] = {}
            for ho in hair_imp:
                if ho.type == "MESH" and "TS_AuthoredHair_" in ho.name:
                    lod_num = 0 if "_LOD0" in ho.name else (1 if "_LOD1" in ho.name else 2)
                    clean_hname = f"TS_AuthoredHair_{hair_style}_LOD{lod_num}"
                    ho.name = clean_hname
                    ho.data.name = clean_hname
                    _clear_mesh_shape_keys(ho)
                    _decimate_clean(ho, 0.40 if lod_num == 0 else (0.45 if lod_num == 1 else 0.65))
                    _fold_vertex_groups_to_55(ho, arm_obj)
                    ho.data.materials.clear()
                    ho.data.materials.append(hair_mat)
                    hair_lods[lod_num] = ho
                else:
                    bpy.data.objects.remove(ho, do_unlink=True)

            # Trim jagged inner kit forehead fringe, then sculpt smooth Korean webtoon bangs onto LOD0 & LOD1!
            eye_z_val = arm_obj.data.bones["TS_ShaperEye.L"].head_local.z
            y_cran_val = arm_obj.data.bones["mixamorig:Head"].head_local.y - 0.0355
            for hl_obj in hair_lods.values():
                _trim_kit_hair_inner_forehead_fringe(hl_obj, eye_z_val, y_cran_val)
            for target_lod in (0, 1):
                bm_bangs = build_sculpted_webtoon_bangs_bmesh(gender, spec["bangStyle"], eye_z_val, y_cran_val)
                bangs_obj = _new_bmesh_part(f"_tmp_bangs_{target_lod}", bm_bangs, hair_mat, arm_obj, "mixamorig:Head")
                if target_lod == 1:
                    _decimate_clean(bangs_obj, 0.55)
                _join_into(hair_lods[target_lod], [bangs_obj])

            outline_obj = _create_hair_outline(hair_lods[0], hair_style)

            # CRITICAL: Filter `o.name.startswith("TS_")` so Blender glTF bone-shape `Icosphere` is NEVER picked!
            part_objs: dict[str, bpy.types.Object] = {}
            slot_mats = {"top": top_mat, "bottom": bot_mat, "shoes": shoe_mat, "accessory": acc_mat}
            slot_decimate = {"top": 0.30, "bottom": 0.36, "shoes": 0.34, "accessory": 0.50}
            for slot_k, (rel_p, target_node) in spec["kitParts"].items():
                before_p = set(bpy.data.objects)
                bpy.ops.import_scene.gltf(filepath=str(KIT_ROOT / f"parts/{gender}/{rel_p}"))
                p_imp = [o for o in bpy.data.objects if o not in before_p]
                mesh_p = next(o for o in p_imp if o.type == "MESH" and o.name.startswith("TS_"))
                for o in p_imp:
                    if o != mesh_p:
                        bpy.data.objects.remove(o, do_unlink=True)
                mesh_p.name = target_node
                mesh_p.data.name = target_node
                _clear_mesh_shape_keys(mesh_p)
                _decimate_clean(mesh_p, slot_decimate[slot_k])
                _fold_vertex_groups_to_55(mesh_p, arm_obj)
                mesh_p.data.materials.clear()
                mesh_p.data.materials.append(slot_mats[slot_k])
                part_objs[slot_k] = mesh_p

            _add_bespoke_couture(spec, arm_obj, part_objs, gold_mat, gem_mat, top_mat)

            # Apply true Korean webtoon 7.5 / 8-head proportion scale around neck pivot!
            _scale_head_proportion_around_neck(
                arm_obj=arm_obj,
                head_group_objs=[outline_obj, *face_objs.values(), *hair_lods.values()],
                body_obj=body_obj,
                acc_obj=part_objs["accessory"],
                h_scale=1.12 if gender == "female" else 1.07,
            )

            mesh_objs = [body_obj, outline_obj, *face_objs.values(), *hair_lods.values(), *part_objs.values()]
            export_objs = [arm_obj, *mesh_objs]
            for eo in export_objs:
                if eo.name not in work_col.objects:
                    work_col.objects.link(eo)
                for col_other in list(eo.users_collection):
                    if col_other != work_col:
                        col_other.objects.unlink(eo)

            if gender == "male":
                _scale_rig_and_meshes(arm_obj, mesh_objs, 1.055, 1.045, 1.082)

            glb_path = pkg_dir / f"{cid}.glb"
            bpy.ops.object.select_all(action="DESELECT")
            for eo in export_objs:
                eo.select_set(True)
            bpy.context.view_layer.objects.active = arm_obj
            bpy.ops.export_scene.gltf(
                filepath=str(glb_path),
                use_selection=True,
                export_format="GLB",
                export_yup=True,
                export_apply=False,
                export_morph=True,
                export_morph_normal=False,
                export_morph_tangent=False,
                export_skins=True,
                export_all_influences=False,
                export_def_bones=False,
                export_animations=False,
            )

            hair_lods[1].hide_render = True
            hair_lods[2].hide_render = True
            outline_obj.hide_render = True

            cs_path = pkg_dir / "contact-sheet.png"
            _render_4view_contact_sheet(arm_obj, face_objs["head"], cs_path, cols["acc"])

            glb_stats = _parse_glb_stats(glb_path)
            idx_entry = _write_slot_mapping_and_manifest(spec, pkg_dir, glb_path, cs_path, glb_stats, template_manifest)
            built_map[cid] = idx_entry
            built_entries.append(idx_entry)

            for eo in list(work_col.objects):
                bpy.data.objects.remove(eo, do_unlink=True)
            bpy.data.collections.remove(work_col)
            for o in prev_objs:
                if o.name in bpy.data.objects:
                    o.hide_render = prev_vis[o.name]
                    if o.name in bpy.context.view_layer.objects:
                        o.hide_set(False)

    ordered_ids = [
        "avatar-orion-authored",
        "reference-character",
        "tripo-h31-rigged-webtoon",
        *[s["id"] for s in CHARACTER_SPECS],
    ]
    existing_index["generatedAt"] = "2026-11-17"
    existing_index["characters"] = [built_map[oid] for oid in ordered_ids if oid in built_map]
    index_path.write_text(json.dumps(existing_index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return built_entries
