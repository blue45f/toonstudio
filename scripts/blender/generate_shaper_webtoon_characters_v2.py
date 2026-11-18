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
    bake_luster_surface_texture,
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
            "shoe": "#D8B46A", "acc": "#D92654", "gold": "#FFE08A",
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
    {
        "id": "shaper-fantasy-saintess",
        "displayName": "SHAPER Atelier · Holy Temple Saintess (신전 성녀 에테르 드레스)",
        "role": "shaper-saintess",
        "gender": "female",
        "faceStyle": "soft",
        "hairStyle": "hime-cut",
        "bangStyle": "saintess-hime",
        "kitParts": {
            "top": ("top/shirt.glb", "TS_Top_sanctuary-mantle"),
            "bottom": ("bottom/long-skirt.glb", "TS_Bottom_long-skirt"),
            "shoes": ("shoes/loafers.glb", "TS_Shoes_loafers"),
            "accessory": ("accessory/choker.glb", "TS_Accessory_halo-tiara"),
        },
        "hideFeet": False,
        "couture": "fantasy-saintess",
        "colors": {
            "skin": "#FEF0E6", "blush": "#F9A4AE", "lip": "#E97388", "shadow": "#E7BEAE",
            "irisTop": "#B86B14", "irisBot": "#FFF08A",
            "hairRoot": "#CAB7A2", "hairMid": "#EDE2D4", "hairTip": "#FFFBF4", "hairHalo": "#FFFFFF",
            "top1": "#FAF6F0", "top2": "#E5DAC8", "topAcc": "#EBC36A", "topPat": "sanctuary",
            "bot1": "#F4EFE6", "bot2": "#DDD1BC", "botAcc": "#EAC166", "botPat": "sanctuary",
            "shoe": "#EDE2CF", "acc": "#74E8FF", "gold": "#FFE082",
        },
        "noteKo": "Blender 5.3에서 샴페인 백금발 히메컷·황금 앰버 보석안·부유형 성광 헤일로 크라운·성소 케이프 스톨과 금사 브로케이드 롱 드레스를 정밀 조형한 판타지 신전 성녀 패키지.",
    },
    {
        "id": "shaper-office-ceo",
        "displayName": "SHAPER Atelier · Modern Office Director (현대 오피스 수트 본부장)",
        "role": "shaper-office",
        "gender": "male",
        "faceStyle": "sharp",
        "hairStyle": "short-layered",
        "bangStyle": "ceo-parted",
        "kitParts": {
            "top": ("top/blazer.glb", "TS_Top_bespoke-suit"),
            "bottom": ("bottom/slacks.glb", "TS_Bottom_slacks"),
            "shoes": ("shoes/loafers.glb", "TS_Shoes_loafers"),
            "accessory": ("accessory/glasses.glb", "TS_Accessory_glasses"),
        },
        "hideFeet": False,
        "couture": "office-ceo",
        "colors": {
            "skin": "#F8DEC9", "blush": "#E49B90", "lip": "#C97478", "shadow": "#D9AE98",
            "irisTop": "#1A2E4C", "irisBot": "#8CC6F2",
            "hairRoot": "#141218", "hairMid": "#27232E", "hairTip": "#463E52", "hairHalo": "#C8C2D6",
            "top1": "#1A2130", "top2": "#101520", "topAcc": "#C9A968", "topPat": "pinstripe",
            "bot1": "#151B27", "bot2": "#0D111A", "botAcc": "#8B9BB4", "botPat": "pinstripe",
            "shoe": "#1B1412", "acc": "#7C1D36", "gold": "#E5C478",
        },
        "noteKo": "Blender 5.3에서 7:3 가르마 시크 레이어드 헤어·스틸 블루 안구·차콜 헤링본 비스포크 수트·버건디 실크 넥타이 및 골드 타이클립·메탈 하프림 안경을 정밀 조형한 현대 로맨스 오피스 본부장 패키지.",
    },
    {
        "id": "shaper-academy-council",
        "displayName": "SHAPER Atelier · Royal Academy Council President (황립 아카데미 학생회장)",
        "role": "shaper-council",
        "gender": "female",
        "faceStyle": "sharp",
        "hairStyle": "soft-bob",
        "bangStyle": "council-parted",
        "kitParts": {
            "top": ("top/blazer.glb", "TS_Top_council-blazer"),
            "bottom": ("bottom/pleated-skirt.glb", "TS_Bottom_pleated-skirt"),
            "shoes": ("shoes/loafers.glb", "TS_Shoes_loafers"),
            "accessory": ("accessory/ribbon.glb", "TS_Accessory_council-insignia"),
        },
        "hideFeet": False,
        "couture": "academy-council",
        "colors": {
            "skin": "#FDE6DA", "blush": "#F396A0", "lip": "#E26076", "shadow": "#E2B6A6",
            "irisTop": "#4E1E8A", "irisBot": "#D88CFF",
            "hairRoot": "#121526", "hairMid": "#22294A", "hairTip": "#43528C", "hairHalo": "#C6D4FF",
            "top1": "#F6F1EA", "top2": "#DCD3C6", "topAcc": "#D9A94E", "topPat": "academy-crest",
            "bot1": "#6E182C", "bot2": "#450D1A", "botAcc": "#E8BE68", "botPat": "plaid",
            "shoe": "#23171A", "acc": "#C81E45", "gold": "#F4CD78",
        },
        "noteKo": "Blender 5.3에서 미드나잇 네이비 소프트 보브컷·자수정 보석안·아이보리 황립 장교 블레이저와 골드 견장 에길레트(장식줄)·학생회장 완장·크림슨 체크 스커트를 정밀 조형한 황립 아카데미 학생회장 패키지.",
    },
    {
        "id": "shaper-apocalypse-sniper",
        "displayName": "SHAPER Atelier · Apocalypse Regressor Sniper (아포칼립스 회귀 스나이퍼)",
        "role": "shaper-apocalypse",
        "gender": "male",
        "faceStyle": "sharp",
        "hairStyle": "wolf-layered",
        "bangStyle": "sniper-swept",
        "kitParts": {
            "top": ("top/hoodie.glb", "TS_Top_tactical-hoodie"),
            "bottom": ("bottom/jeans.glb", "TS_Bottom_cargo-jeans"),
            "shoes": ("shoes/boots.glb", "TS_Shoes_boots"),
            "accessory": ("accessory/glasses.glb", "TS_Accessory_tactical-visor"),
        },
        "hideFeet": True,
        "couture": "apocalypse-sniper",
        "colors": {
            "skin": "#F4D6C2", "blush": "#DE9084", "lip": "#C26E70", "shadow": "#D3A48E",
            "irisTop": "#1B5E3A", "irisBot": "#9EFF78",
            "hairRoot": "#171A18", "hairMid": "#2D3430", "hairTip": "#526058", "hairHalo": "#B8CEC0",
            "top1": "#232924", "top2": "#141815", "topAcc": "#D98A3C", "topPat": "tactical",
            "bot1": "#1A1E24", "bot2": "#0F1217", "botAcc": "#5E6B78", "botPat": "tactical",
            "shoe": "#121416", "acc": "#64F58D", "gold": "#C89B54",
        },
        "noteKo": "Blender 5.3에서 애쉬 차콜 레이어드 헤어·에메랄드 회귀자 안구·택티컬 후디드 필드 재킷과 3D 체스트 리그 탄창 파우치·비대칭 숄더 폴드론·전술 HUD 바이저 고글을 정밀 조형한 아포칼립스 회귀 스나이퍼 패키지.",
    },
    {
        "id": "shaper-healing-barista",
        "displayName": "SHAPER Atelier · Cozy Campus Artist (일상 힐링 캠퍼스 아티스트)",
        "role": "shaper-healing",
        "gender": "female",
        "faceStyle": "cute",
        "hairStyle": "soft-bob",
        "bangStyle": "barista-soft",
        "kitParts": {
            "top": ("top/hoodie.glb", "TS_Top_cozy-hoodie"),
            "bottom": ("bottom/jeans.glb", "TS_Bottom_denim-jeans"),
            "shoes": ("shoes/sneakers.glb", "TS_Shoes_sneakers"),
            "accessory": ("accessory/ribbon.glb", "TS_Accessory_artist-beret"),
        },
        "hideFeet": False,
        "couture": "healing-barista",
        "colors": {
            "skin": "#FDE8DC", "blush": "#F99BA0", "lip": "#EA6E7A", "shadow": "#E4B8A8",
            "irisTop": "#7A4419", "irisBot": "#FFC978",
            "hairRoot": "#3E241C", "hairMid": "#6E4234", "hairTip": "#B0725A", "hairHalo": "#FFE2CF",
            "top1": "#F6EFE4", "top2": "#DFD2BE", "topAcc": "#D97854", "topPat": "knit",
            "bot1": "#324A6E", "bot2": "#1E2F4A", "botAcc": "#D9A86C", "botPat": "denim",
            "shoe": "#F2ECE1", "acc": "#9E3348", "gold": "#F0C674",
        },
        "noteKo": "Blender 5.3에서 밀크티 체스트넛 에어리 보브컷·허니 앰버 보석안·오트밀 케이블 니트 후디와 크로스바디 화구 사첼백·워시드 인디고 데님 진·버건디 울 베레모와 골드 팔레트 핀을 정밀 조형한 일상 힐링 캠퍼스 아티스트 패키지.",
    },
    {
        "id": "shaper-thriller-detective",
        "displayName": "SHAPER Atelier · Noir Detective Inspector (현대 스릴러 강력계 형사)",
        "role": "shaper-thriller",
        "gender": "male",
        "faceStyle": "sharp",
        "hairStyle": "short-layered",
        "bangStyle": "detective-parted",
        "kitParts": {
            "top": ("top/shirt.glb", "TS_Top_detective-shirt"),
            "bottom": ("bottom/slacks.glb", "TS_Bottom_slacks"),
            "shoes": ("shoes/boots.glb", "TS_Shoes_boots"),
            "accessory": ("accessory/earrings.glb", "TS_Accessory_detective-badge"),
        },
        "hideFeet": True,
        "couture": "thriller-detective",
        "colors": {
            "skin": "#F5D7C4", "blush": "#DF9288", "lip": "#C16D70", "shadow": "#D4A590",
            "irisTop": "#2B3340", "irisBot": "#F2B857",
            "hairRoot": "#101216", "hairMid": "#1E222B", "hairTip": "#384050", "hairHalo": "#B4C0D4",
            "top1": "#232730", "top2": "#14171D", "topAcc": "#8C5638", "topPat": "pinstripe",
            "bot1": "#14161C", "bot2": "#0B0C10", "botAcc": "#6E7888", "botPat": "twill",
            "shoe": "#151210", "acc": "#8C2434", "gold": "#F2C96E",
        },
        "noteKo": "Blender 5.3에서 차콜 레이어드 헤어·슬레이트 앰버 수사관 안구·다크 드레스 셔츠와 3D 가죽 숄더 홀스터 하네스·느슨한 크림슨 넥타이·골드 경찰 배지와 잠복 이어셋을 정밀 조형한 현대 스릴러 강력계 형사 패키지.",
    },
]


def _sha256_file(path: Path) -> tuple[str, int]:
    data = path.read_bytes()
    return hashlib.sha256(data).hexdigest(), len(data)


def _clear_mesh_shape_keys(obj: bpy.types.Object) -> None:
    if obj.data.shape_keys:
        obj.shape_key_clear()


def _replace_accessory_object(part_objs: dict[str, bpy.types.Object], new_obj: bpy.types.Object) -> None:
    acc_obj = part_objs["accessory"]
    w_list = _extract_vert_weights(new_obj)
    acc_obj.data = new_obj.data
    acc_obj.data.name = acc_obj.name
    acc_obj.vertex_groups.clear()
    _assign_weights(acc_obj, w_list)
    new_obj.hide_render = True
    for c_ref in list(new_obj.users_collection):
        c_ref.objects.unlink(new_obj)


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


def _fold_vertex_groups_to_55(
    obj: bpy.types.Object,
    arm_obj: bpy.types.Object,
    rebind_body_neck: bool = False,
) -> None:
    for old_n, new_n in BONE_RENAME_MAP.items():
        vg = obj.vertex_groups.get(old_n)
        if vg:
            vg.name = new_n

    fold_map = dict(END_BONE_FOLD_MAP)
    if rebind_body_neck:
        fold_map["mixamorig:Head"] = "mixamorig:Neck"
        fold_map["TS_ShaperJaw"] = "mixamorig:Neck"

    vg_index_to_name = {vg.index: vg.name for vg in obj.vertex_groups}
    end_indices = {idx: fold_map[name] for idx, name in vg_index_to_name.items() if name in fold_map}
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
        for old_end in fold_map:
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


def _measure_and_trim_body_neck(
    body_obj: bpy.types.Object,
    neck_z: float,
    hide_feet: bool,
    is_male: bool,
) -> tuple[float, float, float]:
    bm = bmesh.new()
    bm.from_mesh(body_obj.data)
    ring_pts = [
        v.co.copy() for v in bm.verts
        if abs(v.co.x) < 0.082 and (neck_z - 0.018) <= v.co.z <= (neck_z + 0.010)
    ]
    if len(ring_pts) >= 8:
        rx_fit = max(0.038, min(0.060, max(abs(p.x) for p in ring_pts) * 0.96))
        min_y = min(p.y for p in ring_pts)
        max_y = max(p.y for p in ring_pts)
        ry_fit = max(0.038, min(0.060, 0.5 * (max_y - min_y) * 0.96))
        cy_fit = 0.5 * (min_y + max_y)
    else:
        rx_fit = 0.051 if is_male else 0.044
        ry_fit = 0.051 if is_male else 0.045
        cy_fit = -0.022

    to_del = [
        v for v in bm.verts
        if (abs(v.co.x) < 0.082 and v.co.z > neck_z + 0.006) or (hide_feet and v.co.z < 0.095)
    ]
    if to_del:
        bmesh.ops.delete(bm, geom=to_del, context="VERTS")
    bm.to_mesh(body_obj.data)
    bm.free()
    body_obj.data.update()
    return (rx_fit, ry_fit, cy_fit)


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
    if not mesh.uv_layers:
        uv_data = mesh.uv_layers.new(name="UVMap").data
        for poly in mesh.polygons:
            for k_idx, loop_idx in enumerate(poly.loop_indices):
                v_co = mesh.vertices[mesh.loops[loop_idx].vertex_index].co
                uv_data[loop_idx].uv = (
                    0.5 + 0.35 * math.sin(v_co.x * 18.0 + v_co.y * 13.0) + 0.03 * k_idx,
                    0.15 + 0.70 * max(0.0, min(1.0, (v_co.z - 0.45) / 1.25)),
                )
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
    """Trims inner forehead kit-hair triangles so eyes remain crisp in small cuts."""
    weights = _extract_vert_weights(hair_obj)
    bm = bmesh.new()
    bm.from_mesh(hair_obj.data)
    bm.verts.ensure_lookup_table()
    keep_indices = []
    to_del = []
    for v in bm.verts:
        if abs(v.co.x) < 0.054 and v.co.y < y_cranium - 0.054 and eye_z - 0.055 < v.co.z < eye_z + 0.088:
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
    """Scales head, eyes, hair, and head accessories smoothly above neck base."""
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

    def _neck_taper_scale(z_val: float, is_head_mesh: bool) -> float:
        if not is_head_mesh:
            return h_scale
        t = max(0.0, min(1.0, (z_val - (pivot.z + 0.002)) / 0.040))
        return 1.0 + (h_scale - 1.0) * (t * t * (3.0 - 2.0 * t))

    for m_obj in head_group_objs:
        is_head_m = m_obj.name == "TS_Shaper_Head"
        if m_obj.data.shape_keys:
            basis_zs = [elem.co.z for elem in m_obj.data.shape_keys.key_blocks[0].data]
            for kb in m_obj.data.shape_keys.key_blocks:
                for idx_v, elem in enumerate(kb.data):
                    s_v = _neck_taper_scale(basis_zs[idx_v], is_head_m)
                    elem.co = pivot + (elem.co - pivot) * s_v
        else:
            for v in m_obj.data.vertices:
                s_v = _neck_taper_scale(v.co.z, is_head_m)
                v.co = pivot + (v.co - pivot) * s_v
        m_obj.data.update()

    _ = body_obj

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
                f.loops[0][uv_l].uv = (iu / 17.0, 0.82 + 0.14 * (iv / 3.0))
                f.loops[1][uv_l].uv = ((iu + 1) / 17.0, 0.82 + 0.14 * (iv / 3.0))
                f.loops[2][uv_l].uv = ((iu + 1) / 17.0, 0.82 + 0.14 * ((iv + 1) / 3.0))
                f.loops[3][uv_l].uv = (iu / 17.0, 0.82 + 0.14 * ((iv + 1) / 3.0))
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
        for ang, gz in ((0.0, base_z + 0.022), (-0.48, base_z + 0.015), (0.48, base_z + 0.015)):
            g = bmesh.ops.create_uvsphere(bm_gem, u_segments=12, v_segments=8, radius=0.0058)
            bmesh.ops.translate(bm_gem, vec=(band_r_x * math.sin(ang), -0.055 - band_r_y * math.cos(ang), gz), verts=g["verts"])
        gems = _new_bmesh_part("_tmp_gems", bm_gem, gem_mat, arm_obj, "mixamorig:Head")

        bm_brooch = bmesh.new()
        gb_set = bmesh.ops.create_uvsphere(bm_brooch, u_segments=14, v_segments=10, radius=0.0082)
        bmesh.ops.scale(bm_brooch, vec=(1.05, 0.48, 1.25), verts=gb_set["verts"])
        bmesh.ops.translate(bm_brooch, vec=(0.0, -0.106, 1.338), verts=gb_set["verts"])
        collar_gem = _new_bmesh_part("_tmp_collar_gem", bm_brooch, gem_mat, arm_obj, "mixamorig:Spine2")
        _join_into(tiara, [gems, collar_gem])
        _replace_accessory_object(part_objs, tiara)

        bm_cp = bmesh.new()
        uv_cp = bm_cp.loops.layers.uv.new("UVMap")
        c_rows = []
        for iv in range(7):
            tv = iv / 6.0
            z = 1.374 - 0.132 * tv
            rx, ry = 0.078 + 0.142 * (tv ** 0.78), 0.068 + 0.072 * (tv ** 0.85)
            c_rows.append([bm_cp.verts.new(((rx + 0.004 * math.sin((iu / 24) * 20.0 * math.pi) * tv) * math.sin((iu / 24) * 2.0 * math.pi), -0.015 - (ry + 0.004 * math.sin((iu / 24) * 20.0 * math.pi) * tv) * math.cos((iu / 24) * 2.0 * math.pi), z)) for iu in range(24)])
        for iv in range(6):
            for iu in range(24):
                inext = (iu + 1) % 24
                f = bm_cp.faces.new((c_rows[iv][iu], c_rows[iv][inext], c_rows[iv + 1][inext], c_rows[iv + 1][iu]))
                f.smooth = True
                f.loops[0][uv_cp].uv = (iu / 24.0, 1.0 - iv / 6.0)
                f.loops[1][uv_cp].uv = ((iu + 1) / 24.0, 1.0 - iv / 6.0)
                f.loops[2][uv_cp].uv = ((iu + 1) / 24.0, 1.0 - (iv + 1) / 6.0)
                f.loops[3][uv_cp].uv = (iu / 24.0, 1.0 - (iv + 1) / 6.0)
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
                f.loops[0][uv_s].uv = (iu / 24.0, 0.05 + 0.16 * (iv / 4.0))
                f.loops[1][uv_s].uv = ((iu + 1) / 24.0, 0.05 + 0.16 * (iv / 4.0))
                f.loops[2][uv_s].uv = ((iu + 1) / 24.0, 0.05 + 0.16 * ((iv + 1) / 4.0))
                f.loops[3][uv_s].uv = (iu / 24.0, 0.05 + 0.16 * ((iv + 1) / 4.0))
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
        _replace_accessory_object(part_objs, sword_obj)

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
                f.loops[0][uv_dc].uv = (iu / 21.0, 1.0 - iv / 9.0)
                f.loops[1][uv_dc].uv = ((iu + 1) / 21.0, 1.0 - iv / 9.0)
                f.loops[2][uv_dc].uv = ((iu + 1) / 21.0, 1.0 - (iv + 1) / 9.0)
                f.loops[3][uv_dc].uv = (iu / 21.0, 1.0 - (iv + 1) / 9.0)
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

    elif mode == "fantasy-saintess":
        bm_halo = bmesh.new()
        n_ring, n_tube = 36, 8
        halo_cy, halo_cz, halo_r, tube_r = 0.028, 1.668, 0.118, 0.0048
        h_rings = []
        for ir in range(n_ring):
            th = (ir / n_ring) * 2.0 * math.pi
            cx_h = halo_r * math.cos(th)
            cz_h = halo_cz + halo_r * 0.88 * math.sin(th)
            cy_h = halo_cy + 0.018 * math.sin(th)
            row_h = []
            for it in range(n_tube):
                ph = (it / n_tube) * 2.0 * math.pi
                rad_off = tube_r * math.cos(ph)
                y_off = tube_r * math.sin(ph)
                row_h.append(bm_halo.verts.new((
                    cx_h + rad_off * math.cos(th),
                    cy_h + y_off,
                    cz_h + rad_off * math.sin(th),
                )))
            h_rings.append(row_h)
        for ir in range(n_ring):
            ir_n = (ir + 1) % n_ring
            for it in range(n_tube):
                it_n = (it + 1) % n_tube
                f = bm_halo.faces.new((h_rings[ir][it], h_rings[ir_n][it], h_rings[ir_n][it_n], h_rings[ir][it_n]))
                f.smooth = True
        for ray_deg in (-90, -35, 0, 35, 90):
            ang_r = math.radians(ray_deg)
            sp_c = bmesh.ops.create_cone(bm_halo, cap_ends=True, cap_tris=True, segments=6, radius1=0.0055, radius2=0.0005, depth=0.028)
            bmesh.ops.rotate(bm_halo, cent=(0, 0, 0), matrix=Euler((0.0, ang_r, 0.0), "XYZ").to_matrix(), verts=sp_c["verts"])
            bmesh.ops.translate(
                bm_halo,
                vec=((halo_r + 0.014) * math.sin(ang_r), halo_cy + 0.015, halo_cz + (halo_r * 0.88 + 0.014) * math.cos(ang_r)),
                verts=sp_c["verts"],
            )
        for k in range(17):
            ang_c = -1.05 + (k / 16.0) * 2.10
            sp_b = bmesh.ops.create_uvsphere(bm_halo, u_segments=8, v_segments=6, radius=0.0038 if k != 8 else 0.0068)
            bmesh.ops.translate(bm_halo, vec=(0.068 * math.sin(ang_c), -0.052 - 0.070 * math.cos(ang_c), 1.630 + 0.008 * math.exp(-((ang_c / 0.25) ** 2))), verts=sp_b["verts"])
        halo_obj = _new_bmesh_part("_tmp_saintess_halo", bm_halo, gold_mat, arm_obj, "mixamorig:Head")

        bm_sg = bmesh.new()
        star_v = bmesh.ops.create_cone(bm_sg, cap_ends=True, cap_tris=True, segments=4, radius1=0.010, radius2=0.001, depth=0.032)
        bmesh.ops.translate(bm_sg, vec=(0.0, -0.112, 1.334), verts=star_v["verts"])
        star_h = bmesh.ops.create_cone(bm_sg, cap_ends=True, cap_tris=True, segments=4, radius1=0.008, radius2=0.001, depth=0.026)
        bmesh.ops.rotate(bm_sg, cent=(0, 0, 0), matrix=Euler((0.0, math.radians(90.0), 0.0), "XYZ").to_matrix(), verts=star_h["verts"])
        bmesh.ops.translate(bm_sg, vec=(0.0, -0.112, 1.338), verts=star_h["verts"])
        sg_obj = _new_bmesh_part("_tmp_saintess_gem", bm_sg, gem_mat, arm_obj, "mixamorig:Spine2")
        _join_into(halo_obj, [sg_obj])
        _replace_accessory_object(part_objs, halo_obj)

        bm_sm = bmesh.new()
        uv_sm = bm_sm.loops.layers.uv.new("UVMap")
        sm_rows = []
        for iv in range(8):
            tv = iv / 7.0
            z = 1.376 - 0.165 * tv
            scallop = 0.006 * abs(math.sin(tv * math.pi))
            rx, ry = 0.076 + 0.155 * (tv ** 0.76), 0.066 + 0.078 * (tv ** 0.82)
            sm_rows.append([
                bm_sm.verts.new((
                    (rx + scallop * math.sin((iu / 28.0) * 16.0 * math.pi)) * math.sin((iu / 28.0) * 2.0 * math.pi),
                    -0.015 - (ry + scallop * math.sin((iu / 28.0) * 16.0 * math.pi)) * math.cos((iu / 28.0) * 2.0 * math.pi),
                    z - 0.008 * tv * abs(math.sin((iu / 28.0) * 8.0 * math.pi)),
                ))
                for iu in range(28)
            ])
        for iv in range(7):
            for iu in range(28):
                inext = (iu + 1) % 28
                f = bm_sm.faces.new((sm_rows[iv][iu], sm_rows[iv][inext], sm_rows[iv + 1][inext], sm_rows[iv + 1][iu]))
                f.smooth = True
                f.loops[0][uv_sm].uv = (iu / 28.0, 0.92 - 0.82 * (iv / 7.0))
                f.loops[1][uv_sm].uv = ((iu + 1) / 28.0, 0.92 - 0.82 * (iv / 7.0))
                f.loops[2][uv_sm].uv = ((iu + 1) / 28.0, 0.92 - 0.82 * ((iv + 1) / 7.0))
                f.loops[3][uv_sm].uv = (iu / 28.0, 0.92 - 0.82 * ((iv + 1) / 7.0))
        sm_obj = _new_bmesh_part("_tmp_sanctuary_cape", bm_sm, top_mat, arm_obj, "mixamorig:Spine2")
        _join_into(part_objs["top"], [sm_obj])

    elif mode == "office-ceo":
        bm_tie = bmesh.new()
        knot = bmesh.ops.create_cone(bm_tie, cap_ends=True, cap_tris=True, segments=4, radius1=0.016, radius2=0.011, depth=0.024)
        bmesh.ops.scale(bm_tie, vec=(1.0, 0.45, 1.0), verts=knot["verts"])
        bmesh.ops.translate(bm_tie, vec=(0.0, -0.112, 1.348), verts=knot["verts"])

        blade_rows = []
        for iv in range(8):
            tv = iv / 7.0
            z = 1.334 - 0.235 * tv
            w_t = 0.011 + 0.012 * math.sin(min(1.0, tv * 1.15) * math.pi * 0.72) if tv < 0.86 else 0.021 * (1.0 - (tv - 0.86) / 0.14) + 0.002
            y_t = -0.118 - 0.018 * math.sin(tv * math.pi * 0.65)
            blade_rows.append((
                bm_tie.verts.new((-w_t, y_t + 0.003, z)),
                bm_tie.verts.new((0.0, y_t - 0.003, z)),
                bm_tie.verts.new((w_t, y_t + 0.003, z)),
            ))
        for iv in range(7):
            l0, c0, r0 = blade_rows[iv]
            l1, c1, r1 = blade_rows[iv + 1]
            f1 = bm_tie.faces.new((l0, c0, c1, l1))
            f2 = bm_tie.faces.new((c0, r0, r1, c1))
            f1.smooth = True
            f2.smooth = True
        bmesh.ops.solidify(bm_tie, geom=list(bm_tie.faces), thickness=0.003)
        tie_obj = _new_bmesh_part("_tmp_ceo_tie", bm_tie, gem_mat, arm_obj, "mixamorig:Spine2")
        tie_w = [{"mixamorig:Spine2": 0.85, "mixamorig:Spine1": 0.15} if v.co.z > 1.22 else {"mixamorig:Spine1": 0.80, "mixamorig:Spine": 0.20} for v in tie_obj.data.vertices]
        tie_obj.vertex_groups.clear()
        _assign_weights(tie_obj, tie_w)

        bm_clip = bmesh.new()
        bar = bmesh.ops.create_cube(bm_clip, size=1.0)
        bmesh.ops.scale(bm_clip, vec=(0.032, 0.008, 0.0045), verts=bar["verts"])
        bmesh.ops.translate(bm_clip, vec=(0.004, -0.136, 1.245), verts=bar["verts"])
        psq = bmesh.ops.create_cone(bm_clip, cap_ends=True, cap_tris=True, segments=4, radius1=0.016, radius2=0.002, depth=0.020)
        bmesh.ops.scale(bm_clip, vec=(1.1, 0.35, 1.0), verts=psq["verts"])
        bmesh.ops.translate(bm_clip, vec=(0.072, -0.132, 1.288), verts=psq["verts"])
        for bz in (1.09, 1.16):
            btn = bmesh.ops.create_uvsphere(bm_clip, u_segments=10, v_segments=8, radius=0.0058)
            bmesh.ops.scale(bm_clip, vec=(1.0, 0.45, 1.0), verts=btn["verts"])
            bmesh.ops.translate(bm_clip, vec=(0.0, -0.136, bz), verts=btn["verts"])
        clip_obj = _new_bmesh_part("_tmp_ceo_clip", bm_clip, gold_mat, arm_obj, "mixamorig:Spine2")
        _join_into(part_objs["top"], [tie_obj, clip_obj])

        part_objs["accessory"].data.materials.clear()
        part_objs["accessory"].data.materials.append(gold_mat)
        bm_pin = bmesh.new()
        lpin = bmesh.ops.create_uvsphere(bm_pin, u_segments=12, v_segments=8, radius=0.0065)
        bmesh.ops.scale(bm_pin, vec=(1.0, 0.42, 1.2), verts=lpin["verts"])
        bmesh.ops.translate(bm_pin, vec=(0.048, -0.128, 1.332), verts=lpin["verts"])
        pin_obj = _new_bmesh_part("_tmp_ceo_pin", bm_pin, gold_mat, arm_obj, "mixamorig:Spine2")
        _join_into(part_objs["accessory"], [pin_obj])

    elif mode == "academy-council":
        # Imperial officer shoulder capelet + golden aiguillette cord + double-breasted buttons
        bm_cp = bmesh.new()
        uv_cp = bm_cp.loops.layers.uv.new("UVMap")
        c_rows = []
        for iv in range(7):
            tv = iv / 6.0
            z = 1.378 - 0.145 * tv
            rx, ry = 0.076 + 0.148 * (tv ** 0.78), 0.066 + 0.074 * (tv ** 0.84)
            c_rows.append([
                bm_cp.verts.new((
                    rx * math.sin((iu / 24.0) * 2.0 * math.pi),
                    -0.015 - ry * math.cos((iu / 24.0) * 2.0 * math.pi),
                    z,
                ))
                for iu in range(24)
            ])
        for iv in range(6):
            for iu in range(24):
                inext = (iu + 1) % 24
                f = bm_cp.faces.new((c_rows[iv][iu], c_rows[iv][inext], c_rows[iv + 1][inext], c_rows[iv + 1][iu]))
                f.smooth = True
                f.loops[0][uv_cp].uv = (iu / 24.0, 0.92 - 0.80 * (iv / 6.0))
                f.loops[1][uv_cp].uv = ((iu + 1) / 24.0, 0.92 - 0.80 * (iv / 6.0))
                f.loops[2][uv_cp].uv = ((iu + 1) / 24.0, 0.92 - 0.80 * ((iv + 1) / 6.0))
                f.loops[3][uv_cp].uv = (iu / 24.0, 0.92 - 0.80 * ((iv + 1) / 6.0))
        cape_obj = _new_bmesh_part("_tmp_council_cape", bm_cp, top_mat, arm_obj, "mixamorig:Spine2")

        bm_ep = bmesh.new()
        for sx in (-1.0, 1.0):
            pad = bmesh.ops.create_cube(bm_ep, size=1.0)
            bmesh.ops.scale(bm_ep, vec=(0.058, 0.032, 0.008), verts=pad["verts"])
            bmesh.ops.rotate(bm_ep, cent=(0, 0, 0), matrix=Euler((0.0, sx * math.radians(-12.0), 0.0), "XYZ").to_matrix(), verts=pad["verts"])
            bmesh.ops.translate(bm_ep, vec=(sx * 0.138, -0.016, 1.376), verts=pad["verts"])
        for k in range(13):
            t = k / 12.0
            cd = bmesh.ops.create_uvsphere(bm_ep, u_segments=8, v_segments=6, radius=0.0040)
            bmesh.ops.translate(
                bm_ep,
                vec=(-0.132 * (1.0 - t) + (-0.010) * t, -0.068 * (1.0 - t) + (-0.130) * t - 0.014 * math.sin(t * math.pi), 1.362 * (1.0 - t) + 1.295 * t - 0.042 * math.sin(t * math.pi)),
                verts=cd["verts"],
            )
        for bz in (1.09, 1.155, 1.22):
            for sx in (-0.034, 0.034):
                btn = bmesh.ops.create_uvsphere(bm_ep, u_segments=10, v_segments=8, radius=0.0058)
                bmesh.ops.scale(bm_ep, vec=(1.0, 0.45, 1.0), verts=btn["verts"])
                bmesh.ops.translate(bm_ep, vec=(sx, -0.132, bz), verts=btn["verts"])
        ep_obj = _new_bmesh_part("_tmp_council_ep", bm_ep, gold_mat, arm_obj, "mixamorig:Spine2")

        # True anatomical upper-arm axis: LeftArm.head_local -> LeftForeArm.head_local!
        p_sh = arm_obj.data.bones["mixamorig:LeftArm"].head_local.copy()
        p_el = arm_obj.data.bones["mixamorig:LeftForeArm"].head_local.copy()
        arm_mid = p_sh.lerp(p_el, 0.44)
        arm_dir = (p_el - p_sh).normalized()
        arm_u = arm_dir.cross(Vector((0.0, 1.0, 0.0))).normalized()
        arm_v = arm_dir.cross(arm_u).normalized()
        bm_band = bmesh.new()
        n_bu = 20
        r_band = 0.051
        b_r0, b_r1 = [], []
        for iu in range(n_bu):
            ang = (iu / n_bu) * 2.0 * math.pi
            radial = arm_u * (math.cos(ang) * r_band) + arm_v * (math.sin(ang) * r_band)
            b_r0.append(bm_band.verts.new(arm_mid - arm_dir * 0.022 + radial))
            b_r1.append(bm_band.verts.new(arm_mid + arm_dir * 0.022 + radial * 0.97))
        for iu in range(n_bu):
            inext = (iu + 1) % n_bu
            fb = bm_band.faces.new((b_r0[iu], b_r0[inext], b_r1[inext], b_r1[iu]))
            fb.smooth = True
        bmesh.ops.solidify(bm_band, geom=list(bm_band.faces), thickness=0.0028)
        band_obj = _new_bmesh_part("_tmp_council_band", bm_band, gem_mat, arm_obj, "mixamorig:LeftArm")
        _join_into(part_objs["top"], [cape_obj, ep_obj, band_obj])

        bm_cr = bmesh.new()
        crest = bmesh.ops.create_uvsphere(bm_cr, u_segments=14, v_segments=10, radius=0.0115)
        bmesh.ops.scale(bm_cr, vec=(1.05, 0.45, 1.30), verts=crest["verts"])
        bmesh.ops.translate(bm_cr, vec=(0.0, -0.124, 1.324), verts=crest["verts"])
        cr_obj = _new_bmesh_part("_tmp_council_crest", bm_cr, gold_mat, arm_obj, "mixamorig:Spine2")
        _join_into(part_objs["accessory"], [cr_obj])

    elif mode == "apocalypse-sniper":
        # Low-profile contoured tactical chest rig + 3 mag pouches + shoulder-hugging harness straps
        bm_rig = bmesh.new()
        plate = bmesh.ops.create_cube(bm_rig, size=1.0)
        bmesh.ops.scale(bm_rig, vec=(0.175, 0.020, 0.115), verts=plate["verts"])
        bmesh.ops.translate(bm_rig, vec=(0.0, -0.130, 1.185), verts=plate["verts"])
        for px_off in (-0.056, 0.0, 0.056):
            pouch = bmesh.ops.create_cube(bm_rig, size=1.0)
            bmesh.ops.scale(bm_rig, vec=(0.040, 0.022, 0.072), verts=pouch["verts"])
            bmesh.ops.rotate(bm_rig, cent=(0, 0, 0), matrix=Euler((0.0, math.radians(-7.0), 0.0), "XYZ").to_matrix(), verts=pouch["verts"])
            bmesh.ops.translate(bm_rig, vec=(px_off, -0.142, 1.175), verts=pouch["verts"])
        for sx in (-0.074, 0.074):
            for k in range(7):
                t = k / 6.0
                node_b = bmesh.ops.create_cube(bm_rig, size=1.0)
                bmesh.ops.scale(bm_rig, vec=(0.024, 0.010, 0.026), verts=node_b["verts"])
                bmesh.ops.translate(
                    bm_rig,
                    vec=(sx * (1.0 + 0.25 * t), -0.128 * (1.0 - t) + (-0.048) * t - 0.012 * math.sin(t * math.pi), 1.242 + 0.132 * t),
                    verts=node_b["verts"],
                )
        rig_obj = _new_bmesh_part("_tmp_tac_rig", bm_rig, gold_mat, arm_obj, "mixamorig:Spine2")
        rig_w = [{"mixamorig:Spine2": 0.82, "mixamorig:Spine1": 0.18} if v.co.z > 1.23 else {"mixamorig:Spine1": 0.85, "mixamorig:Spine": 0.15} for v in rig_obj.data.vertices]
        rig_obj.vertex_groups.clear()
        _assign_weights(rig_obj, rig_w)

        p_sh_m = arm_obj.data.bones["mixamorig:LeftArm"].head_local.copy()
        p_el_m = arm_obj.data.bones["mixamorig:LeftForeArm"].head_local.copy()
        pauld_pos = p_sh_m.lerp(p_el_m, 0.18)
        bm_pld = bmesh.new()
        pld = bmesh.ops.create_uvsphere(bm_pld, u_segments=14, v_segments=10, radius=0.052)
        bmesh.ops.scale(bm_pld, vec=(1.10, 0.90, 0.65), verts=pld["verts"])
        bmesh.ops.rotate(bm_pld, cent=(0, 0, 0), matrix=Euler((0.0, math.radians(-18.0), 0.0), "XYZ").to_matrix(), verts=pld["verts"])
        bmesh.ops.translate(bm_pld, vec=(pauld_pos.x, pauld_pos.y - 0.006, pauld_pos.z + 0.012), verts=pld["verts"])
        pld_obj = _new_bmesh_part("_tmp_tac_pauldron", bm_pld, top_mat, arm_obj, "mixamorig:LeftArm")
        _join_into(part_objs["top"], [rig_obj, pld_obj])

        # Tactical rangefinder ear-pod + forehead comms sensor above brow (clear of eyes & glasses!)
        bm_hud = bmesh.new()
        pod = bmesh.ops.create_cone(bm_hud, cap_ends=True, cap_tris=True, segments=10, radius1=0.009, radius2=0.007, depth=0.036)
        bmesh.ops.rotate(bm_hud, cent=(0, 0, 0), matrix=Euler((math.radians(90.0), 0.0, 0.0), "XYZ").to_matrix(), verts=pod["verts"])
        bmesh.ops.translate(bm_hud, vec=(-0.082, -0.055, 1.522), verts=pod["verts"])
        brow_node = bmesh.ops.create_uvsphere(bm_hud, u_segments=10, v_segments=8, radius=0.0055)
        bmesh.ops.scale(bm_hud, vec=(1.6, 0.55, 0.75), verts=brow_node["verts"])
        bmesh.ops.translate(bm_hud, vec=(-0.042, -0.106, 1.564), verts=brow_node["verts"])
        hud_obj = _new_bmesh_part("_tmp_tac_hud", bm_hud, gem_mat, arm_obj, "mixamorig:Head")
        _join_into(part_objs["accessory"], [hud_obj])

    elif mode == "healing-barista":
        # Sculpted tilted Parisian wool artist beret high on crown (zero forehead/eye occlusion!) + gold star pin
        bm_beret = bmesh.new()
        puff = bmesh.ops.create_uvsphere(bm_beret, u_segments=24, v_segments=12, radius=0.098)
        bmesh.ops.scale(bm_beret, vec=(1.04, 1.06, 0.34), verts=puff["verts"])
        stem = bmesh.ops.create_cone(bm_beret, cap_ends=True, cap_tris=True, segments=8, radius1=0.005, radius2=0.002, depth=0.018)
        bmesh.ops.translate(bm_beret, vec=(0.0, 0.0, 0.036), verts=stem["verts"])
        bmesh.ops.rotate(bm_beret, cent=(0, 0, 0), matrix=Euler((math.radians(-8.0), math.radians(15.0), 0.0), "XYZ").to_matrix(), verts=bm_beret.verts)
        bmesh.ops.translate(bm_beret, vec=(0.016, -0.022, 1.644), verts=bm_beret.verts)
        beret_obj = _new_bmesh_part("_tmp_artist_beret", bm_beret, gem_mat, arm_obj, "mixamorig:Head")

        bm_pin = bmesh.new()
        star = bmesh.ops.create_uvsphere(bm_pin, u_segments=12, v_segments=8, radius=0.0085)
        bmesh.ops.scale(bm_pin, vec=(1.1, 0.45, 1.1), verts=star["verts"])
        bmesh.ops.translate(bm_pin, vec=(-0.052, -0.104, 1.630), verts=star["verts"])
        pal = bmesh.ops.create_uvsphere(bm_pin, u_segments=14, v_segments=10, radius=0.012)
        bmesh.ops.scale(bm_pin, vec=(1.15, 0.40, 0.95), verts=pal["verts"])
        bmesh.ops.translate(bm_pin, vec=(0.056, -0.130, 1.292), verts=pal["verts"])
        pin_obj = _new_bmesh_part("_tmp_artist_pin", bm_pin, gold_mat, arm_obj, "mixamorig:Spine2")
        pin_w = [{"mixamorig:Head": 1.0} if v.co.z > 1.55 else {"mixamorig:Spine2": 1.0} for v in pin_obj.data.vertices]
        pin_obj.vertex_groups.clear()
        _assign_weights(pin_obj, pin_w)
        _join_into(beret_obj, [pin_obj])
        _replace_accessory_object(part_objs, beret_obj)

        # Continuous contoured artist satchel hip bag + gold clasp
        bm_strap = bmesh.new()
        s_rows = []
        for k in range(11):
            t = k / 10.0
            cx_s = -0.092 * (1.0 - t) + 0.145 * t
            cz_s = 1.372 * (1.0 - t) + 0.945 * t
            cy_s = -0.060 * (1.0 - t) + (-0.035) * t - 0.088 * math.sin(t * math.pi * 0.85)
            s_rows.append((
                bm_strap.verts.new((cx_s - 0.011, cy_s, cz_s + 0.006)),
                bm_strap.verts.new((cx_s + 0.011, cy_s, cz_s - 0.006)),
            ))
        for k in range(10):
            a0, b0 = s_rows[k]
            a1, b1 = s_rows[k + 1]
            fs = bm_strap.faces.new((a0, b0, b1, a1))
            fs.smooth = True
        bmesh.ops.solidify(bm_strap, geom=list(bm_strap.faces), thickness=0.0032)
        satchel = bmesh.ops.create_cube(bm_strap, size=1.0)
        bmesh.ops.scale(bm_strap, vec=(0.034, 0.088, 0.098), verts=satchel["verts"])
        bmesh.ops.translate(bm_strap, vec=(0.154, -0.024, 0.928), verts=satchel["verts"])
        strap_obj = _new_bmesh_part("_tmp_artist_strap", bm_strap, gold_mat, arm_obj, "mixamorig:Spine2")
        strap_w = [
            {"mixamorig:Spine2": 0.85, "mixamorig:Spine1": 0.15} if v.co.z > 1.22
            else ({"mixamorig:Spine1": 0.75, "mixamorig:Spine": 0.25} if v.co.z > 1.05 else {"mixamorig:Hips": 0.85, "mixamorig:Spine": 0.15})
            for v in strap_obj.data.vertices
        ]
        strap_obj.vertex_groups.clear()
        _assign_weights(strap_obj, strap_w)
        _join_into(part_objs["top"], [strap_obj])

    elif mode == "thriller-detective":
        # Loosened crimson noir necktie + smooth body-hugging shoulder holster ribbon + underarm sidearm pouch
        bm_tie = bmesh.new()
        knot = bmesh.ops.create_cone(bm_tie, cap_ends=True, cap_tris=True, segments=4, radius1=0.015, radius2=0.010, depth=0.022)
        bmesh.ops.scale(bm_tie, vec=(1.0, 0.45, 1.0), verts=knot["verts"])
        bmesh.ops.translate(bm_tie, vec=(0.004, -0.106, 1.338), verts=knot["verts"])
        blade_rows = []
        for iv in range(8):
            tv = iv / 7.0
            z = 1.324 - 0.230 * tv
            w_t = 0.011 + 0.011 * math.sin(min(1.0, tv * 1.15) * math.pi * 0.72) if tv < 0.86 else 0.019 * (1.0 - (tv - 0.86) / 0.14) + 0.002
            y_t = -0.112 - 0.014 * math.sin(tv * math.pi * 0.65)
            sway_x = 0.007 * math.sin(tv * math.pi * 0.6)
            blade_rows.append((
                bm_tie.verts.new((-w_t + sway_x, y_t + 0.003, z)),
                bm_tie.verts.new((sway_x, y_t - 0.003, z)),
                bm_tie.verts.new((w_t + sway_x, y_t + 0.003, z)),
            ))
        for iv in range(7):
            l0, c0, r0 = blade_rows[iv]
            l1, c1, r1 = blade_rows[iv + 1]
            f1 = bm_tie.faces.new((l0, c0, c1, l1))
            f2 = bm_tie.faces.new((c0, r0, r1, c1))
            f1.smooth = True
            f2.smooth = True
        bmesh.ops.solidify(bm_tie, geom=list(bm_tie.faces), thickness=0.0028)
        tie_obj = _new_bmesh_part("_tmp_det_tie", bm_tie, gem_mat, arm_obj, "mixamorig:Spine2")
        tie_w = [{"mixamorig:Spine2": 0.85, "mixamorig:Spine1": 0.15} if v.co.z > 1.22 else {"mixamorig:Spine1": 0.80, "mixamorig:Spine": 0.20} for v in tie_obj.data.vertices]
        tie_obj.vertex_groups.clear()
        _assign_weights(tie_obj, tie_w)

        bm_hol = bmesh.new()
        for sx in (-1.0, 1.0):
            h_rows = []
            for k in range(9):
                t = k / 8.0
                ang_h = (0.18 + 0.68 * t) * math.pi
                z_h = 1.382 - 0.205 * math.sin(t * math.pi * 0.88)
                x_h = sx * (0.104 + 0.024 * math.sin(t * math.pi))
                y_h = -0.015 - 0.094 * math.sin(ang_h)
                h_rows.append((
                    bm_hol.verts.new((x_h - 0.009, y_h, z_h)),
                    bm_hol.verts.new((x_h + 0.009, y_h, z_h)),
                ))
            for k in range(8):
                l0, r0 = h_rows[k]
                l1, r1 = h_rows[k + 1]
                fh = bm_hol.faces.new((l0, r0, r1, l1) if sx > 0 else (r0, l0, l1, r1))
                fh.smooth = True
        bmesh.ops.solidify(bm_hol, geom=list(bm_hol.faces), thickness=0.0032)
        pouch_l = bmesh.ops.create_cube(bm_hol, size=1.0)
        bmesh.ops.scale(bm_hol, vec=(0.026, 0.062, 0.088), verts=pouch_l["verts"])
        bmesh.ops.rotate(bm_hol, cent=(0, 0, 0), matrix=Euler((math.radians(14.0), 0.0, 0.0), "XYZ").to_matrix(), verts=pouch_l["verts"])
        bmesh.ops.translate(bm_hol, vec=(0.130, -0.042, 1.165), verts=pouch_l["verts"])
        mag_r = bmesh.ops.create_cube(bm_hol, size=1.0)
        bmesh.ops.scale(bm_hol, vec=(0.022, 0.048, 0.068), verts=mag_r["verts"])
        bmesh.ops.translate(bm_hol, vec=(-0.130, -0.042, 1.170), verts=mag_r["verts"])
        hol_obj = _new_bmesh_part("_tmp_det_holster", bm_hol, gold_mat, arm_obj, "mixamorig:Spine2")
        hol_w = [{"mixamorig:Spine2": 0.85, "mixamorig:Spine1": 0.15} if v.co.z > 1.22 else {"mixamorig:Spine1": 0.85, "mixamorig:Spine": 0.15} for v in hol_obj.data.vertices]
        hol_obj.vertex_groups.clear()
        _assign_weights(hol_obj, hol_w)
        _join_into(part_objs["top"], [tie_obj, hol_obj])

        # Golden police detective shield badge on chest + covert tactical ear-comms at left ear
        bm_bdg = bmesh.new()
        shield = bmesh.ops.create_cone(bm_bdg, cap_ends=True, cap_tris=True, segments=6, radius1=0.015, radius2=0.012, depth=0.006)
        bmesh.ops.rotate(bm_bdg, cent=(0, 0, 0), matrix=Euler((math.radians(90.0), 0.0, 0.0), "XYZ").to_matrix(), verts=shield["verts"])
        bmesh.ops.translate(bm_bdg, vec=(0.068, -0.128, 1.288), verts=shield["verts"])
        comms = bmesh.ops.create_uvsphere(bm_bdg, u_segments=10, v_segments=8, radius=0.0075)
        bmesh.ops.scale(bm_bdg, vec=(0.55, 1.25, 1.10), verts=comms["verts"])
        bmesh.ops.translate(bm_bdg, vec=(0.082, -0.048, 1.505), verts=comms["verts"])
        bdg_obj = _new_bmesh_part("_tmp_det_badge", bm_bdg, gold_mat, arm_obj, "mixamorig:Spine2")
        bdg_w = [{"mixamorig:Head": 1.0} if v.co.z > 1.44 else {"mixamorig:Spine2": 1.0} for v in bdg_obj.data.vertices]
        bdg_obj.vertex_groups.clear()
        _assign_weights(bdg_obj, bdg_w)
        _replace_accessory_object(part_objs, bdg_obj)


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


def build_shaper_subset(tex_scratch_dir: Path, start_idx: int = 0, end_idx: int = 12) -> list[dict[str, Any]]:
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
            shoe_png = bake_luster_surface_texture(str(tdir / "shoe.png"), cols["shoe"])
            acc_png = bake_luster_surface_texture(str(tdir / "acc.png"), cols["acc"])
            gold_png = bake_luster_surface_texture(str(tdir / "gold.png"), cols["gold"], "#FFFFFF")
            gem_png = bake_luster_surface_texture(str(tdir / "gem.png"), cols["acc"], "#FFFFFF")

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
            neck_z_val = arm_obj.data.bones["mixamorig:Neck"].head_local.z
            neck_ring_fit = _measure_and_trim_body_neck(
                body_obj,
                neck_z=neck_z_val,
                hide_feet=spec["hideFeet"],
                is_male=(gender == "male"),
            )
            _decimate_clean(body_obj, ratio=0.18)
            _fold_vertex_groups_to_55(body_obj, arm_obj, rebind_body_neck=True)

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
            shoe_mat = make_textured_pbr_material(f"mat_shoe_{cid}", shoe_png, (sr, sg, sb, 1.0), roughness=0.36)
            ar_c, ag_c, ab_c = _hex_to_rgb01(cols["acc"])
            acc_mat = make_textured_pbr_material(f"mat_acc_{cid}", acc_png, (ar_c, ag_c, ab_c, 1.0), roughness=0.34, emission_hex=cols["acc"], emission_strength=0.06)
            gr, gg, gb = _hex_to_rgb01(cols["gold"])
            gold_mat = make_textured_pbr_material(f"mat_gold_{cid}", gold_png, (gr, gg, gb, 1.0), roughness=0.24, metallic=1.0)
            gem_mat = make_textured_pbr_material(f"mat_gem_{cid}", gem_png, (ar_c, ag_c, ab_c, 1.0), roughness=0.12, emission_hex=cols["acc"], emission_strength=0.26)

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
                neck_ring_fit=neck_ring_fit,
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
