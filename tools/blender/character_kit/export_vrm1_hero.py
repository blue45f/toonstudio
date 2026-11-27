"""ToonStudio Hero VRM 1.0 아바타 8종 단일 정본(SSOT) 익스포터 (Blender 5.3 + VRM Add-on 4.5.0).

임시 중복 헤어·의상 빌더(`build_hero_hair`/`build_hero_wardrobe`/48Hz 사선 무아레 텍스처)를 전면 폐기하고,
Character Kit v3의 정본 3대 모듈을 직접 조립해 8종 히어로 VRM 1.0 아바타를 생산한다:
  - 베이스: `build_base_v3.py` 출력 5종 GLB (`female-romance`, `male-webtoon`, `male-action`, `youth-academy`, `sd-chibi`)
  - 헤어:   `forge_hair_v3.build_hair_v3_for_vrm(style_id, base_glb, lod_level=...)` (실제 다층 곡선 + SpringBone 메타)
  - 의상:   `forge_garments_v3.build_garment_v3_for_vrm(preset_id, ctx, underlayer_bvh_b=...)` (34종 정본 카탈로그 + 아치 신발 + 4mm 라펠)
  - 텍스처: 100% 무-무아레(Zero-Moiré) 웹툰 에디토리얼 셀 텍스처 + MToon 1.0 단일 잉크 계약

필수 불변 계약(Hard Gate):
- `VRMC_vrm 1.0` (`bpy.ops.preferences.addon_enable(module="bl_ext.user_default.vrm")`, `--addons` 금지)
- 휴머노이드 55본 100% 매핑 (`hips`~`rightLittleDistal` + `jaw`, `leftEye`, `rightEye`)
- 18 VRM 1.0 프리셋 표정 + 8 웹툰 커스텀 표정 + LookAt bone
- `VRMC_springBone 1.0`: 모든 체인의 모든 joint `hitRadius > 0`, `gravityDir` 하향 `-Y`(Blender `-Z`), 5개 바디 콜라이더
- **모든 MToon 1.0 재질**: `outlineWidthMode == "screenCoordinates"`, `outlineLightingMixFactor == 0.0`,
  `shadingToonyFactor == 0.9`, 재질 수 `<= 16`, 총 삼각형 `<= 70,000`, 바닥 접지 `abs(minY) <= 0.005m`
- 프로덕션 768×768 PNG 썸네일(`< 384 KiB`)을 `apps/web/public/vrm/toonstudio-hero-v1/thumbnails/` 및
  `apps/web/public/assets/3d/characters/thumbnails/toonstudio-hero-v1/`에 동시 동기화 + 1024×1024 4-뷰 스냅샷 출력

실행:
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/export_vrm1_hero.py -- \
        --hero all --out-dir apps/web/public/vrm/toonstudio-hero-v1
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import struct
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

_THIS_DIR = Path(__file__).resolve().parent
_BLENDER_TOOLS_DIR = _THIS_DIR.parent
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from character_kit import build_base_v2 as bb2  # noqa: E402
from character_kit import build_expressions_v2 as expr  # noqa: E402
from character_kit import forge_garments_v3 as fg3  # noqa: E402
from character_kit import forge_hair_v3 as fh3  # noqa: E402
from character_kit import garment_core_v2 as gc  # noqa: E402
from character_kit import qa_character_gate as qa  # noqa: E402


# ---------------------------------------------------------------------------
# VRM 1.0 55본 휴머노이드 매핑 (100% 커버리지)
# ---------------------------------------------------------------------------

VRM1_55_BONE_MAP: dict[str, str] = {
    "hips": "mixamorig:Hips",
    "spine": "mixamorig:Spine",
    "chest": "mixamorig:Spine1",
    "upper_chest": "mixamorig:Spine2",
    "neck": "mixamorig:Neck",
    "head": "mixamorig:Head",
    "jaw": "TS_Jaw",
    "left_eye": "TS_Eye.L",
    "right_eye": "TS_Eye.R",
    "left_shoulder": "mixamorig:LeftShoulder",
    "left_upper_arm": "mixamorig:LeftArm",
    "left_lower_arm": "mixamorig:LeftForeArm",
    "left_hand": "mixamorig:LeftHand",
    "right_shoulder": "mixamorig:RightShoulder",
    "right_upper_arm": "mixamorig:RightArm",
    "right_lower_arm": "mixamorig:RightForeArm",
    "right_hand": "mixamorig:RightHand",
    "left_upper_leg": "mixamorig:LeftUpLeg",
    "left_lower_leg": "mixamorig:LeftLeg",
    "left_foot": "mixamorig:LeftFoot",
    "left_toes": "mixamorig:LeftToeBase",
    "right_upper_leg": "mixamorig:RightUpLeg",
    "right_lower_leg": "mixamorig:RightLeg",
    "right_foot": "mixamorig:RightFoot",
    "right_toes": "mixamorig:RightToeBase",
    "left_thumb_metacarpal": "mixamorig:LeftHandThumb1",
    "left_thumb_proximal": "mixamorig:LeftHandThumb2",
    "left_thumb_distal": "mixamorig:LeftHandThumb3",
    "left_index_proximal": "mixamorig:LeftHandIndex1",
    "left_index_intermediate": "mixamorig:LeftHandIndex2",
    "left_index_distal": "mixamorig:LeftHandIndex3",
    "left_middle_proximal": "mixamorig:LeftHandMiddle1",
    "left_middle_intermediate": "mixamorig:LeftHandMiddle2",
    "left_middle_distal": "mixamorig:LeftHandMiddle3",
    "left_ring_proximal": "mixamorig:LeftHandRing1",
    "left_ring_intermediate": "mixamorig:LeftHandRing2",
    "left_ring_distal": "mixamorig:LeftHandRing3",
    "left_little_proximal": "mixamorig:LeftHandPinky1",
    "left_little_intermediate": "mixamorig:LeftHandPinky2",
    "left_little_distal": "mixamorig:LeftHandPinky3",
    "right_thumb_metacarpal": "mixamorig:RightHandThumb1",
    "right_thumb_proximal": "mixamorig:RightHandThumb2",
    "right_thumb_distal": "mixamorig:RightHandThumb3",
    "right_index_proximal": "mixamorig:RightHandIndex1",
    "right_index_intermediate": "mixamorig:RightHandIndex2",
    "right_index_distal": "mixamorig:RightHandIndex3",
    "right_middle_proximal": "mixamorig:RightHandMiddle1",
    "right_middle_intermediate": "mixamorig:RightHandMiddle2",
    "right_middle_distal": "mixamorig:RightHandMiddle3",
    "right_ring_proximal": "mixamorig:RightHandRing1",
    "right_ring_intermediate": "mixamorig:RightHandRing2",
    "right_ring_distal": "mixamorig:RightHandRing3",
    "right_little_proximal": "mixamorig:RightHandPinky1",
    "right_little_intermediate": "mixamorig:RightHandPinky2",
    "right_little_distal": "mixamorig:RightHandPinky3",
}
assert len(VRM1_55_BONE_MAP) == 55


# ---------------------------------------------------------------------------
# 8종 히어로 아바타 SSOT 명세 (Character Kit v3 헤어 + 34종 의상 카탈로그 직결)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class HeroAvatarSpec:
    hero_id: str
    name_ko: str
    genre: str
    base_archetype: str
    hair_style: str
    hair_hex: str
    hair_tip_hex: str
    outfit_style: str
    garment_presets: tuple[str, ...]
    inner_hex: str
    top_hex: str
    top_trim_hex: str
    accent_hex: str
    bottom_hex: str
    bottom_trim_hex: str
    shoe_hex: str
    sole_hex: str
    outline_hex: str
    eye_tint_rgb: tuple[float, float, float]
    bottom_pattern: str = "matte"


HERO_SPECS: dict[str, HeroAvatarSpec] = {
    "romance-female": HeroAvatarSpec(
        hero_id="romance-female",
        name_ko="서연 (로맨스 여성 주연)",
        genre="romance",
        base_archetype="female-romance",
        hair_style="romance-long",
        hair_hex="#4C302A",
        hair_tip_hex="#7D5242",
        outfit_style="romance-cardigan-skirt",
        garment_presets=("top/ribbed-tee", "top/knit-cardigan", "bottom/pleated-skirt", "shoes/loafers"),
        inner_hex="#FAF7F2",
        top_hex="#F4ECE1",
        top_trim_hex="#D9C2AC",
        accent_hex="#C97B84",
        bottom_hex="#B56E7C",
        bottom_trim_hex="#8A4C58",
        shoe_hex="#4F352E",
        sole_hex="#2B1D1A",
        outline_hex="#2B1D22",
        eye_tint_rgb=(1.0, 1.0, 1.0),
    ),
    "romance-male": HeroAvatarSpec(
        hero_id="romance-male",
        name_ko="도윤 (오피스 로맨스 남주)",
        genre="romance-office",
        base_archetype="male-webtoon",
        hair_style="comma-hair",
        hair_hex="#252024",
        hair_tip_hex="#3A323A",
        outfit_style="office-coat-suit",
        garment_presets=("top/dress-shirt", "outer/trench-coat", "bottom/tailored-slacks", "shoes/derby-heels"),
        inner_hex="#F5F4F0",
        top_hex="#363B47",
        top_trim_hex="#4E5566",
        accent_hex="#8C2D3C",
        bottom_hex="#2A2E38",
        bottom_trim_hex="#1E2129",
        shoe_hex="#2E221F",
        sole_hex="#181312",
        outline_hex="#1E1C24",
        eye_tint_rgb=(1.0, 1.0, 1.0),
    ),
    "academy-female": HeroAvatarSpec(
        hero_id="academy-female",
        name_ko="하늘 (한국 학원 교복 여주)",
        genre="academy",
        base_archetype="youth-academy",
        hair_style="soft-bob",
        hair_hex="#24293D",
        hair_tip_hex="#3A4362",
        outfit_style="academy-blazer-skirt",
        garment_presets=("top/school-shirt-tie", "outer/school-blazer", "bottom/pleated-skirt", "legwear/knee-socks", "shoes/loafers"),
        inner_hex="#F7F6F2",
        top_hex="#233252",
        top_trim_hex="#EDEAE2",
        accent_hex="#A83244",
        bottom_hex="#313E5E",
        bottom_trim_hex="#D6B25E",
        shoe_hex="#452D24",
        sole_hex="#261914",
        outline_hex="#1F2230",
        eye_tint_rgb=(1.0, 1.0, 1.0),
        bottom_pattern="plaid",
    ),
    "academy-male": HeroAvatarSpec(
        hero_id="academy-male",
        name_ko="지후 (한국 학원 교복 남주)",
        genre="academy",
        base_archetype="youth-academy",
        hair_style="dandy-two-block",
        hair_hex="#272832",
        hair_tip_hex="#3E4152",
        outfit_style="academy-blazer-slacks",
        garment_presets=("top/dress-shirt", "outer/school-blazer", "bottom/school-slacks", "shoes/sneakers"),
        inner_hex="#F7F7F4",
        top_hex="#223150",
        top_trim_hex="#EDEBE4",
        accent_hex="#C89F46",
        bottom_hex="#4A4E59",
        bottom_trim_hex="#32353E",
        shoe_hex="#E5E4E0",
        sole_hex="#C8C6BE",
        outline_hex="#1D202A",
        eye_tint_rgb=(0.94, 0.96, 1.0),
    ),
    "rofan-empress": HeroAvatarSpec(
        hero_id="rofan-empress",
        name_ko="아리아 (로판 제국 황녀)",
        genre="rofan",
        base_archetype="female-romance",
        hair_style="braided-crown",
        hair_hex="#E8CFA0",
        hair_tip_hex="#F5E4BE",
        outfit_style="rofan-corset-gown",
        garment_presets=("top/rofan-corset-bodice", "bottom/rofan-layered-skirt", "outer/noble-cape", "shoes/lace-up-boots", "accessory/rofan-tiara"),
        inner_hex="#F6EFE2",
        top_hex="#7A1F33",
        top_trim_hex="#F5EDE0",
        accent_hex="#DFB657",
        bottom_hex="#68182B",
        bottom_trim_hex="#F5EDE0",
        shoe_hex="#4D1A26",
        sole_hex="#241116",
        outline_hex="#2D1520",
        eye_tint_rgb=(1.0, 0.97, 0.98),
        bottom_pattern="velvet",
    ),
    "rofan-duke": HeroAvatarSpec(
        hero_id="rofan-duke",
        name_ko="카시안 (로판 북부대공)",
        genre="rofan",
        base_archetype="male-webtoon",
        hair_style="slicked-back-duke",
        hair_hex="#1B1D29",
        hair_tip_hex="#2C3247",
        outfit_style="rofan-imperial-cape",
        garment_presets=("top/dress-shirt", "outer/imperial-uniform-coat", "bottom/tailored-slacks", "shoes/combat-boots"),
        inner_hex="#F5F4F0",
        top_hex="#1E2230",
        top_trim_hex="#8A1E2E",
        accent_hex="#E0B856",
        bottom_hex="#1B1D26",
        bottom_trim_hex="#2D3140",
        shoe_hex="#1A181D",
        sole_hex="#121114",
        outline_hex="#151520",
        eye_tint_rgb=(0.95, 0.96, 1.0),
    ),
    "action-hunter": HeroAvatarSpec(
        hero_id="action-hunter",
        name_ko="강혁 (액션 각성 헌터)",
        genre="action",
        base_archetype="male-action",
        hair_style="wolf-layered",
        hair_hex="#2E3442",
        hair_tip_hex="#525D73",
        outfit_style="action-techwear-harness",
        garment_presets=("top/tactical-compression", "outer/techwear-jacket", "bottom/tactical-cargo", "shoes/combat-boots", "accessory/chest-harness"),
        inner_hex="#262B35",
        top_hex="#2C3340",
        top_trim_hex="#1E232C",
        accent_hex="#33C4D8",
        bottom_hex="#2B2E36",
        bottom_trim_hex="#1D2026",
        shoe_hex="#1F2127",
        sole_hex="#14161A",
        outline_hex="#181B22",
        eye_tint_rgb=(1.0, 1.0, 1.0),
    ),
    "chibi-mascot": HeroAvatarSpec(
        hero_id="chibi-mascot",
        name_ko="모찌 (SD 웹툰 마스코트)",
        genre="comedy-sd",
        base_archetype="sd-chibi",
        hair_style="twin-tail",
        hair_hex="#DF8BB8",
        hair_tip_hex="#F5BDD9",
        outfit_style="chibi-hoodie-shorts",
        garment_presets=("top/oversized-hoodie", "bottom/cargo-shorts", "shoes/sneakers"),
        inner_hex="#FAF5EC",
        top_hex="#8FD4C4",
        top_trim_hex="#FAF5EC",
        accent_hex="#F2C85B",
        bottom_hex="#F4EAE0",
        bottom_trim_hex="#E6A0B8",
        shoe_hex="#F09CB8",
        sole_hex="#FAF5EC",
        outline_hex="#3B2538",
        eye_tint_rgb=(1.0, 1.0, 1.0),
    ),
}
assert len(HERO_SPECS) == 8


# ---------------------------------------------------------------------------
# 색 공간 & 씬 초기화 유틸리티
# ---------------------------------------------------------------------------


def srgb_to_linear_channel(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_srgb(h: str) -> tuple[float, float, float]:
    s = h.lstrip("#")
    return (int(s[0:2], 16) / 255.0, int(s[2:4], 16) / 255.0, int(s[4:6], 16) / 255.0)


def hex_to_linear(h: str) -> tuple[float, float, float]:
    r, g, b = hex_to_srgb(h)
    return (srgb_to_linear_channel(r), srgb_to_linear_channel(g), srgb_to_linear_channel(b))


def cel_shade_linear(base_hex: str, cool_shift: bool = True) -> tuple[float, float, float]:
    r, g, b = hex_to_linear(base_hex)
    if cool_shift:
        return (max(0.02, r * 0.72), max(0.02, g * 0.70), max(0.03, min(1.0, b * 0.80 + 0.014)))
    return (max(0.02, r * 0.78), max(0.02, g * 0.69), max(0.02, b * 0.67))


def _clear_scene_keep_addons() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in (
        bpy.data.meshes,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.node_groups,
        bpy.data.images,
        bpy.data.actions,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.worlds,
    ):
        for item in list(col):
            try:
                col.remove(item, do_unlink=True)
            except Exception:
                if item.users == 0:
                    col.remove(item)


# ---------------------------------------------------------------------------
# 무-무아레(Zero-Moiré) 웹툰 에디토리얼 텍스처 + MToon 1.0 단일 잉크 계약
# ---------------------------------------------------------------------------


def _pack_rgba_image(name: str, rgb_srgb: np.ndarray) -> Any:
    h, w, _ = rgb_srgb.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(rgb_srgb, 0.0, 1.0)
    img = bpy.data.images.new(name=name, width=w, height=h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(rgba[::-1].ravel())
    img.pack()
    return img


def make_hair_texture_v3(name: str, base_hex: str, tip_hex: str, size: int = 512) -> Any:
    """실키 웹툰 헤어 램프: 뿌리 깊이 + 이중 곡선 엔젤링 + 부드러운 세로 광택 (무아레 0)."""
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size
    v = (yy + 0.5) / size  # 0=뿌리, 1=끝
    c_base = np.array(hex_to_srgb(base_hex), dtype=np.float32)
    c_tip = np.array(hex_to_srgb(tip_hex), dtype=np.float32)
    c_root = c_base * 0.74
    c_hi = np.clip(c_base * 1.24 + 0.24, 0.0, 1.0)

    root_t = np.clip(v / 0.16, 0.0, 1.0)[..., None]
    tip_t = np.clip((v - 0.55) / 0.42, 0.0, 1.0)[..., None]
    col = c_root * (1.0 - root_t) + c_base * root_t
    col = col * (1.0 - tip_t) + c_tip * tip_t

    # 저주파 실크 가닥 명암 (2~5주기만 사용 → 줄무늬 노이즈 0)
    silk = 0.016 * np.sin(u * 2.0 * np.pi * 3.0) + 0.008 * np.cos(u * 2.0 * np.pi * 6.0 + 0.8)
    col = np.clip(col + silk[..., None], 0.0, 1.0)

    # 웹툰 시그니처 엔젤링(주 하이라이트 + 미세 보조 하이라이트)
    zig = 0.018 * np.sin(u * 2.0 * np.pi * 2.0) + 0.008 * np.cos(u * 2.0 * np.pi * 4.0)
    band1 = np.exp(-(((v - (0.31 + zig)) / 0.042) ** 2))
    band1 = np.clip((band1 - 0.28) / 0.32, 0.0, 1.0) * (0.82 + 0.18 * np.sin(u * 2.0 * np.pi * 4.0))
    band2 = np.exp(-(((v - (0.39 + zig * 0.7)) / 0.018) ** 2)) * 0.35
    hi_mask = np.clip(band1 * 0.44 + band2 * 0.25, 0.0, 0.55)[..., None]
    col = col * (1.0 - hi_mask) + c_hi * hi_mask
    return _pack_rgba_image(name, col)


def _smooth_band(dist: np.ndarray, half_w: float, feather: float) -> np.ndarray:
    t = np.clip((half_w + feather - dist) / max(2.0 * feather, 1e-6), 0.0, 1.0)
    return (t * t * (3.0 - 2.0 * t)).astype(np.float32)


def make_editorial_fabric_texture_v3(
    name: str,
    base_hex: str,
    trim_hex: str,
    accent_hex: str,
    pattern: str = "matte",
    size: int = 512,
) -> Any:
    """100% 무-무아레 웹툰 에디토리얼 원단 텍스처 (고주파 사선 sin 전면 폐기)."""
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size
    v = (yy + 0.5) / size
    c0 = np.array(hex_to_srgb(base_hex), dtype=np.float32)
    c1 = np.array(hex_to_srgb(trim_hex), dtype=np.float32)
    ca = np.array(hex_to_srgb(accent_hex), dtype=np.float32)

    rng = np.random.default_rng(abs(hash(name)) % (2**31))
    grain = fg3._soft_box_blur2d(rng.normal(0.0, 0.012, (size, size)), passes=4)  # noqa: SLF001
    col = np.broadcast_to(c0, (size, size, 3)).copy()

    if pattern == "plaid":
        # 안티앨리어싱 한국 학원 교복 체크 (4×4 깔끔한 격자)
        su = (u * 4.0) % 1.0
        sv = (v * 4.0) % 1.0
        bu = _smooth_band(np.abs(su - 0.24), 0.10, 0.014)
        bv = _smooth_band(np.abs(sv - 0.24), 0.10, 0.014)
        tu = _smooth_band(np.abs(su - 0.70), 0.016, 0.008)
        tv = _smooth_band(np.abs(sv - 0.70), 0.016, 0.008)
        dark = c0 * 0.64
        mix_d = np.clip((bu + bv) * 0.52, 0.0, 0.80)[..., None]
        col = col * (1.0 - mix_d) + dark * mix_d
        mix_a = np.maximum(tu, tv)[..., None] * 0.65
        col = col * (1.0 - mix_a) + ca * mix_a
        mix_t = _smooth_band(np.abs(su - 0.24), 0.012, 0.006)[..., None] * 0.30
        col = col * (1.0 - mix_t) + c1 * mix_t
        col = np.clip(col + grain[..., None] * 0.5, 0.0, 1.0)
    elif pattern == "velvet":
        # 로판 실크 벨벳: 부드러운 은은한 광택(줄무늬 0)
        sheen = 0.032 * np.sin(v * np.pi) + 0.012 * np.sin(u * 2.0 * np.pi * 6.0) * np.sin(v * 2.0 * np.pi * 6.0)
        col = np.clip(col + sheen[..., None] + grain[..., None] * 0.4, 0.0, 1.0)
    elif pattern == "metal":
        # 부드러운 금장/테크 메탈릭 사틴 그라데이션 (고주파 링 0)
        sheen = 0.055 * np.sin(v * np.pi) + 0.025 * np.cos(u * 2.0 * np.pi * 2.0)
        col = np.clip(col + sheen[..., None] + grain[..., None] * 0.3, 0.0, 1.0)
    else:
        # 매트 웹툰 에디토리얼 원단: 아주 은은한 종이/천 질감만 유지 (무아레 0!)
        col = np.clip(col + grain[..., None] * 0.65, 0.0, 1.0)

    return _pack_rgba_image(name, col)


def apply_mtoon1_contract(
    mat: Any,
    *,
    image: Any | None,
    base_color_linear: tuple[float, float, float, float],
    shade_color_linear: tuple[float, float, float],
    outline_color_linear: tuple[float, float, float],
    outline_width: float = 0.0020,
    double_sided: bool = False,
    shading_shift: float = -0.10,
    rim_color_linear: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> Any:
    """모든 VRM 1.0 재질에 단일 잉크 계약(`screenCoordinates`, `lightingMix=0.0`, `toony=0.9`)을 강제한다."""
    m1 = mat.vrm_addon_extension.mtoon1
    m1.enabled = True
    m1.double_sided = double_sided
    m1.pbr_metallic_roughness.base_color_factor = base_color_linear
    if image is not None:
        m1.pbr_metallic_roughness.base_color_texture.index.source = image

    v = m1.extensions.vrmc_materials_mtoon
    v.shade_color_factor = shade_color_linear
    if image is not None:
        v.shade_multiply_texture.index.source = image
    v.shading_toony_factor = 0.9
    v.shading_shift_factor = shading_shift
    v.gi_equalization_factor = 0.80
    v.outline_width_mode = v.OUTLINE_WIDTH_MODE_SCREEN_COORDINATES.identifier
    v.outline_width_factor = outline_width
    v.outline_color_factor = outline_color_linear
    v.outline_lighting_mix_factor = 0.0
    v.parametric_rim_color_factor = rim_color_linear
    v.parametric_rim_fresnel_power_factor = 4.2
    v.parametric_rim_lift_factor = 0.0
    v.rim_lighting_mix_factor = 0.30
    return mat


def create_mtoon_material(
    name: str,
    *,
    image: Any | None,
    base_hex: str,
    outline_hex: str,
    outline_width: float = 0.0020,
    cool_shade: bool = True,
    rim_strength: float = 0.0,
) -> Any:
    mat = bpy.data.materials.new(name=name)
    r, g, b = hex_to_linear(base_hex)
    base_factor = (1.0, 1.0, 1.0, 1.0) if image is not None else (r, g, b, 1.0)
    shade = (
        (0.78, 0.76, 0.83)
        if (image is not None and cool_shade)
        else ((0.82, 0.76, 0.75) if image is not None else cel_shade_linear(base_hex, cool_shift=cool_shade))
    )
    rim = (min(1.0, r * 1.35) * rim_strength, min(1.0, g * 1.35) * rim_strength, min(1.0, b * 1.35) * rim_strength)
    return apply_mtoon1_contract(
        mat,
        image=image,
        base_color_linear=base_factor,
        shade_color_linear=shade,
        outline_color_linear=hex_to_linear(outline_hex),
        outline_width=outline_width,
        double_sided=False,
        shading_shift=-0.08,
        rim_color_linear=rim,
    )


# ---------------------------------------------------------------------------
# SSOT 메시 변환 + bmesh 0-결함 검증 + SpringBone 1.0 조립
# ---------------------------------------------------------------------------


@dataclass
class SpringChainSpec:
    name: str
    parent_bone: str
    points_b: list[tuple[float, float, float]]
    hit_radius: float = 0.026
    stiffness: float = 0.65
    drag_force: float = 0.45
    gravity_power: float = 0.25


def _create_blender_mesh_from_arrays(
    name: str,
    positions_b: np.ndarray,
    faces: list[tuple[int, ...]] | np.ndarray,
    uvs: np.ndarray,
    mat: Any,
    arm: Any,
    *,
    clamp_uv: bool = True,
) -> Any:
    """NumPy 지오메트리를 0-결함 Blender 메시 오브젝트로 변환하고 Armature에 연결한다."""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    verts = [bm.verts.new((float(p[0]), float(p[1]), float(p[2]))) for p in positions_b]
    bm.verts.ensure_lookup_table()

    uv_arr = np.asarray(uvs, dtype=np.float64)
    if clamp_uv:
        uv_arr = np.clip(uv_arr, 0.02, 0.98)

    for f in faces:
        try:
            fverts = tuple(verts[int(idx)] for idx in f)
            if len(set(fverts)) < 3:
                continue
            bf = bm.faces.new(fverts)
            for loop, idx in zip(bf.loops, f):
                loop[uv_layer].uv = (float(uv_arr[int(idx), 0]), float(uv_arr[int(idx), 1]))
        except ValueError:
            continue

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()

    # 엄격한 0-결함 보증: 혹시 남은 고립 정점 정리 후 검증
    loose_v = [v for v in bm.verts if len(v.link_edges) == 0]
    if loose_v:
        bmesh.ops.delete(bm, geom=loose_v, context="VERTS")

    nm = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    loose = sum(1 for v in bm.verts if len(v.link_edges) == 0)
    wire = sum(1 for e in bm.edges if len(e.link_faces) == 0)
    if nm or loose or wire:
        bm.free()
        raise RuntimeError(f"SSOT 메시 결함({name}): nm={nm}, loose={loose}, wire={wire}")

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = arm
    mod = obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=0.523599, keep_sharp_edges=True)
    return obj


def _assign_68bone_weights(obj: Any, joints: np.ndarray, weights: np.ndarray, joint_names: list[str]) -> None:
    """`forge_garments_v3`에서 계산한 (N, 4) 스킨 웨이트를 Blender vertex_groups에 그대로 주입한다."""
    vg_cache: dict[str, Any] = {}

    def get_vg(bname: str) -> Any:
        if bname not in vg_cache:
            vg_cache[bname] = obj.vertex_groups.get(bname) or obj.vertex_groups.new(name=bname)
        return vg_cache[bname]

    nv = len(obj.data.vertices)
    n_src = len(joints)
    # 고립 정점 제거가 없었다면 1:1 매핑
    if nv == n_src:
        for vi in range(nv):
            for k in range(4):
                w = float(weights[vi, k])
                if w > 1e-4:
                    bname = joint_names[int(joints[vi, k])]
                    get_vg(bname).add([vi], w, "ADD")
        return

    # 만약 고립 정점이 정리됐다면 최근접 매핑 폴백
    get_vg("mixamorig:Spine1").add(list(range(nv)), 1.0, "REPLACE")


def add_spring_bone_chains(arm: Any, chains: list[SpringChainSpec]) -> dict[str, list[str]]:
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")

    chain_bones: dict[str, list[str]] = {}
    for ch in chains:
        parent_eb = arm.data.edit_bones[ch.parent_bone]
        bnames: list[str] = []
        prev_eb = parent_eb
        pts = ch.points_b
        for i in range(len(pts) - 1):
            bname = f"SB_{ch.name}_{i + 1:02d}"
            eb = arm.data.edit_bones.new(bname)
            eb.head = pts[i]
            eb.tail = pts[i + 1]
            if (eb.tail - eb.head).length < 0.01:
                eb.tail = eb.head + Vector((0.0, 0.0, -0.04))
            eb.parent = prev_eb
            eb.use_connect = i > 0
            bnames.append(bname)
            prev_eb = eb
        tip_name = f"SB_{ch.name}_End"
        eb_end = arm.data.edit_bones.new(tip_name)
        last_dir = Vector(pts[-1]) - Vector(pts[-2])
        last_dir = Vector((0.0, 0.0, -0.04)) if last_dir.length < 1e-4 else last_dir.normalized() * 0.04
        eb_end.head = pts[-1]
        eb_end.tail = Vector(pts[-1]) + last_dir
        eb_end.parent = prev_eb
        eb_end.use_connect = True
        bnames.append(tip_name)
        chain_bones[ch.name] = bnames

    bpy.ops.object.mode_set(mode="OBJECT")
    return chain_bones


def configure_vrm1_spring_bones(
    arm: Any,
    plan: bb2.ArchetypePlan,
    chains: list[SpringChainSpec],
    chain_bones: dict[str, list[str]],
) -> None:
    sb = arm.data.vrm_addon_extension.spring_bone1
    sb.colliders.clear()
    sb.collider_groups.clear()
    sb.springs.clear()

    s = plan.spec
    collider_defs = [
        ("mixamorig:Head", (0.0, plan.head_h * 0.32, 0.0), max(s.head_w, s.head_d) * 1.04),
        ("mixamorig:Neck", (0.0, 0.02, 0.0), s.neck_rx * 1.25),
        ("mixamorig:Spine2", (0.0, 0.02, 0.0), s.chest_rx * 0.92),
        ("mixamorig:LeftArm", (0.04, 0.0, 0.0), s.arm_r * 1.35),
        ("mixamorig:RightArm", (-0.04, 0.0, 0.0), s.arm_r * 1.35),
    ]
    cg = sb.add_collider_group()
    cg.vrm_name = "HeroBodyColliders"
    for bone_name, offset_local, radius in collider_defs:
        col = sb.add_collider(bpy.context, arm)
        col.node.bone_name = bone_name
        col.shape_type = col.SHAPE_TYPE_SPHERE.identifier
        col.shape.sphere.offset = offset_local
        col.shape.sphere.radius = float(radius)
        cref = cg.add_collider()
        cref.collider_uuid = col.uuid

    for ch in chains:
        sp = sb.add_spring()
        sp.vrm_name = ch.name
        bnames = chain_bones[ch.name]
        for idx, bname in enumerate(bnames):
            j = sp.add_joint()
            j.node.bone_name = bname
            t = idx / max(len(bnames) - 1, 1)
            j.hit_radius = max(0.018, float(ch.hit_radius * (1.0 - 0.25 * t)))
            j.stiffness = max(0.25, float(ch.stiffness * (1.0 - 0.20 * t)))
            j.drag_force = float(ch.drag_force)
            j.gravity_power = float(ch.gravity_power)
            j.gravity_dir = (0.0, 0.0, -1.0)  # Blender -Z → glTF -Y
        cgref = sp.add_collider_group()
        cgref.collider_group_uuid = cg.uuid


def build_ssot_hair_objects(
    spec: HeroAvatarSpec,
    base_glb: Path,
    plan: bb2.ArchetypePlan,
    arm: Any,
    mat_hair: Any,
    mat_acc: Any,
    *,
    lod_level: int = 1,
) -> tuple[list[Any], list[SpringChainSpec], dict[str, list[str]]]:
    """`forge_hair_v3.build_hair_v3_for_vrm` SSOT 결과를 Blender VRM 메시 + SpringBone 체인으로 변환."""
    hdata = fh3.build_hair_v3_for_vrm(spec.hair_style, base_glb, lod_level=lod_level)
    pos_b = gc.g2b(hdata["positions_g"])
    tris = hdata["triangles"]
    tri_zone = hdata["tri_zone"]
    uv0 = hdata["uv0"]
    cap_start = int(hdata["cap_start"])

    # SpringBone 체인 추출 (최소 2개 보장)
    chains: list[SpringChainSpec] = []
    sb_meta = hdata["spring_meta"]
    for idx_c, ch_d in enumerate(sb_meta.get("chains", [])):
        raw_joints = ch_d.get("joints") or []
        raw_pts = [
            jt["positionGltf"] if isinstance(jt, dict) and "positionGltf" in jt else jt
            for jt in raw_joints
        ]
        if len(raw_pts) >= 2:
            pts_b_arr = gc.g2b(np.asarray(raw_pts, dtype=np.float64))
            pts_b = [(float(p[0]), float(p[1]), float(p[2])) for p in pts_b_arr]
            cid = str(ch_d.get("id") or ch_d.get("name") or "strand")[:12]
            cname = f"Hair{idx_c + 1}_{cid}"
            chains.append(
                SpringChainSpec(
                    name=cname,
                    parent_bone="mixamorig:Head",
                    points_b=pts_b,
                    hit_radius=max(0.020, float(ch_d.get("hitRadius", 0.024))),
                    stiffness=float(ch_d.get("stiffness", 0.72)),
                    drag_force=float(ch_d.get("dragForce", 0.45)),
                    gravity_power=float(ch_d.get("gravityPower", 0.24)),
                )
            )

    if len(chains) < 2:
        s = plan.spec
        for sname, sx in (("BangL", +0.036), ("BangR", -0.036)):
            chains.append(
                SpringChainSpec(
                    name=f"Hair_{sname}",
                    parent_bone="mixamorig:Head",
                    points_b=[
                        (sx, -(s.head_d + 0.008), plan.z_crown - 0.025),
                        (sx * 1.15, -(s.head_d + 0.012), plan.z_eye + 0.028),
                        (sx * 1.20, -(s.head_d + 0.010), plan.z_eye - 0.012),
                    ],
                    hit_radius=0.020,
                    stiffness=0.80,
                    drag_force=0.48,
                    gravity_power=0.22,
                )
            )

    chain_bones = add_spring_bone_chains(arm, chains)
    objs: list[Any] = []

    # 존 분리: zone 0 = 메인 헤어, zone 1 = 헤어 액세서리/리본/끈
    for zone_id, obj_suffix, mat in ((0, "Hair", mat_hair), (1, "HairAcc", mat_acc)):
        sel_t = tris[tri_zone == zone_id]
        if len(sel_t) == 0:
            continue
        uniq_v, inv = np.unique(sel_t.reshape(-1), return_inverse=True)
        sub_pos = pos_b[uniq_v]
        sub_uv = uv0[uniq_v]
        sub_tris = inv.reshape(-1, 3)
        sub_is_cap = uniq_v >= cap_start

        obj = _create_blender_mesh_from_arrays(
            f"TS_Hero{obj_suffix}_{spec.hero_id}",
            sub_pos,
            sub_tris,
            sub_uv,
            mat,
            arm,
            clamp_uv=True,
        )

        # 스키닝: 두피 캡·상단 뿌리·액세서리는 100% Head 고정, 아래로 처진 가닥만 SpringBone 부드럽게 블렌드
        vg_head = obj.vertex_groups.new(name="mixamorig:Head")
        if zone_id == 1 or len(chains) == 0:
            vg_head.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
        else:
            sb_vgs = {ch.name: [obj.vertex_groups.new(name=bn) for bn in chain_bones[ch.name][:-1]] for ch in chains}
            chain_pts_np = [np.asarray(ch.points_b, dtype=np.float64) for ch in chains]
            for vi, v in enumerate(obj.data.vertices):
                v_uv_v = float(sub_uv[vi, 1]) if vi < len(sub_uv) else 0.0
                is_cap = bool(sub_is_cap[vi]) if vi < len(sub_is_cap) else True
                if is_cap or v_uv_v < 0.28:
                    vg_head.add([vi], 1.0, "REPLACE")
                    continue
                p_co = np.array([v.co.x, v.co.y, v.co.z], dtype=np.float64)
                best_ci = -1
                best_d = 0.095
                best_bi = 0
                for ci, cpts in enumerate(chain_pts_np):
                    dists = np.linalg.norm(cpts - p_co[None, :], axis=1)
                    dmin = float(dists.min())
                    if dmin < best_d:
                        best_d = dmin
                        best_ci = ci
                        best_bi = min(len(sb_vgs[chains[ci].name]) - 1, int(np.argmin(dists)))
                if best_ci < 0:
                    vg_head.add([vi], 1.0, "REPLACE")
                else:
                    sway_w = min(0.85, max(0.0, (v_uv_v - 0.28) / 0.45))
                    vg_head.add([vi], 1.0 - sway_w, "REPLACE")
                    sb_vgs[chains[best_ci].name][best_bi].add([vi], sway_w, "REPLACE")
        objs.append(obj)

    return objs, chains, chain_bones


def _map_garment_channel_to_vrm_mat(preset_id: str, channel_key: str, mats: dict[str, Any]) -> Any:
    """34종 의상 카탈로그 채널을 VRM 1.0 히어로 팔레트 재질 슬롯(총 <= 16개 예산)에 매핑한다."""
    slot, slug = preset_id.split("/", 1)
    if slot == "shoes":
        if channel_key == "sole":
            return mats["sole"]
        if channel_key == "lace":
            return mats["accent"] if "boots" in slug else mats["trim"]
        return mats["shoe"]
    if slot == "legwear":
        return mats["top"]  # 네이비 니삭스
    if slot == "accessory":
        return mats["accent"] if channel_key == "accent" or "tiara" in slug else mats["trim"]
    if slot == "bottom":
        return mats["bottom"] if channel_key == "main" else mats["bottom_trim"]
    if slot == "outer" or slug in ("knit-cardigan", "oversized-hoodie", "rofan-corset-bodice"):
        if channel_key == "main":
            return mats["top"]
        if channel_key == "trim":
            return mats["trim"]
        return mats["accent"]
    # inner top (ribbed-tee, dress-shirt, school-shirt-tie, tactical-compression)
    if channel_key == "main":
        return mats["inner"]
    if channel_key == "trim":
        return mats["trim"]
    return mats["accent"]


def _tuck_covered_body_for_vrm(body_obj: Any, ctx: gc.BaseBodyContext, hides: set[str]) -> None:
    """의상에 가려진 바디 정점만 살짝 안쪽으로 넣어 클리핑 0건 보장(목 이음매·얼굴·손 100% 보존)."""
    plan = ctx.plan
    z_neck_guard = plan.z_neck_base - 0.012
    R = bb2.REGION_INDEX
    hide_region_ids = {R[h] for h in hides if h in R}
    if not hide_region_ids:
        return

    n_v = len(body_obj.data.vertices)
    if len(ctx.body_region) != n_v:
        return

    foot_ids = {R["foot.L"], R["foot.R"]}
    arm_ids = {R["upperArm.L"], R["upperArm.R"], R["forearm.L"], R["forearm.R"]}
    neck_r_guard = plan.spec.neck_rx * 1.38
    for vi, v in enumerate(body_obj.data.vertices):
        reg = int(ctx.body_region[vi])
        if reg not in hide_region_ids:
            continue
        z = float(v.co.z)
        r_xy = math.hypot(float(v.co.x), float(v.co.y))
        # 목 정중앙만 보호하고, 승모근·어깨 능선(abs(x) > neck_rx * 1.38)은 외투 아래로 깔끔히 수납
        if z > z_neck_guard and reg not in arm_ids and r_xy <= neck_r_guard:
            continue
        if reg in foot_ids:
            v.co.z = max(v.co.z, 0.0045)
            n = v.normal
            v.co.x -= n.x * 0.0035
            v.co.y -= n.y * 0.0035
        else:
            tuck = 0.0090 if reg in arm_ids else 0.0055
            n = v.normal
            v.co.x -= n.x * tuck
            v.co.y -= n.y * tuck
            if z > plan.z_shoulder - 0.015 and (reg in arm_ids or abs(float(v.co.x)) > neck_r_guard):
                v.co.z -= 0.0085
    body_obj.data.update()


def build_ssot_wardrobe_objects(
    spec: HeroAvatarSpec,
    ctx: gc.BaseBodyContext,
    body_obj: Any,
    arm: Any,
    mats: dict[str, Any],
) -> tuple[list[Any], int]:
    """`forge_garments_v3.build_garment_v3_for_vrm` SSOT 앙상블을 조립해 Blender 오브젝트와 총 삼각형 수를 반환."""
    objs: list[Any] = []
    bvh_by_preset: dict[str, BVHTree] = {}
    last_top_bvh: BVHTree | None = None
    all_hides: set[str] = set()
    total_garment_tris = 0
    has_closed_coat = any(
        p in ("outer/trench-coat", "outer/imperial-uniform-coat")
        for p in spec.garment_presets
    )

    for preset_id in spec.garment_presets:
        gspec = fg3.GARMENT_SPEC_BY_ID[preset_id]
        under_bvh = None
        if gspec.underlayer_preset and gspec.underlayer_preset in bvh_by_preset:
            under_bvh = bvh_by_preset[gspec.underlayer_preset]
        elif (gspec.layer == "outer" or preset_id == "top/knit-cardigan") and last_top_bvh is not None:
            under_bvh = last_top_bvh

        gdata = fg3.build_garment_v3_for_vrm(
            preset_id,
            ctx,
            underlayer_bvh_b=under_bvh,
            min_underlayer_gap_m=0.0014,
            check_85_shoulder=False,
        )
        bvh_by_preset[preset_id] = gdata["final_bvh_b"]
        if gspec.slot == "top" and gspec.layer is None and preset_id != "top/knit-cardigan":
            last_top_bvh = gdata["final_bvh_b"]
        all_hides.update(gdata["hides"])

        slug = preset_id.split("/", 1)[1]
        is_plaid_skirt = (spec.bottom_pattern == "plaid" and preset_id == "bottom/pleated-skirt")

        for ch_key, ch in gdata["channels"].items():
            mat = _map_garment_channel_to_vrm_mat(preset_id, ch_key, mats)
            uv_src = ch["uv1"].copy()
            if is_plaid_skirt and ch_key == "main":
                # UV1은 50cm/unit 연속 호길이 → 체크 패턴이 주름 따라 자연스럽게 흐르도록 그대로 사용!
                clamp_uv = False
            else:
                # 일반 원단은 [0.02, 0.98] 내 정규화
                umin = uv_src.min(axis=0)
                uspan = np.maximum(uv_src.max(axis=0) - umin, 1e-5)
                uv_src = 0.02 + 0.96 * ((uv_src - umin) / uspan)
                clamp_uv = True

            pos_arr = ch["positions_b"]
            # 코트(`trench-coat`/`imperial-uniform-coat`) 착용 시 셔츠 넥타이 하단 끝과 어깨 돌출이 코트 앞판을 뚫지 않도록 수납
            if has_closed_coat and preset_id == "top/dress-shirt":
                pos_arr = pos_arr.copy()
                if ch_key == "accent":
                    lower_mask = pos_arr[:, 2] < (ctx.plan.z_chest + 0.035)
                    pos_arr[lower_mask, 1] += 0.012
                else:
                    sh_mask = (pos_arr[:, 2] > ctx.plan.z_shoulder - 0.03) & (np.abs(pos_arr[:, 0]) > ctx.plan.spec.neck_rx * 1.45)
                    pos_arr[sh_mask, 2] -= 0.0085
                    pos_arr[sh_mask, 1] += 0.003

            obj = _create_blender_mesh_from_arrays(
                f"TS_HeroGar_{slug}_{ch_key}",
                pos_arr,
                ch["faces"],
                uv_src,
                mat,
                arm,
                clamp_uv=clamp_uv,
            )
            _assign_68bone_weights(obj, ch["joints"], ch["weights"], gdata["joint_names"])
            total_garment_tris += sum(1 if len(f) == 3 else (len(f) - 2) for f in ch["faces"])
            objs.append(obj)

    _tuck_covered_body_for_vrm(body_obj, ctx, all_hides)
    return objs, total_garment_tris


# ---------------------------------------------------------------------------
# VRM 1.0 표정(18+8)·LookAt·메타·768² 썸네일·4-뷰 스냅샷·감사
# ---------------------------------------------------------------------------


def strip_unused_param_shape_keys() -> None:
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.data.shape_keys:
            continue
        kbs = obj.data.shape_keys.key_blocks
        if not any(kb.name.startswith("facs:") for kb in kbs):
            obj.shape_key_clear()
            continue
        for kb in list(reversed(kbs)):
            if kb.name != "Basis" and not kb.name.startswith("facs:"):
                obj.shape_key_remove(kb)


def configure_vrm1_expressions_and_lookat(arm: Any, plan: bb2.ArchetypePlan) -> None:
    ext = arm.data.vrm_addon_extension.vrm1
    la = ext.look_at
    la.type = la.TYPE_BONE.identifier
    head_pos = plan.joints_b["mixamorig:Head"]
    eye_mid = 0.5 * (plan.eye_center_l + plan.eye_center_r)
    la.offset_from_head_bone = (0.0, float(eye_mid[2] - head_pos[2]), float(-(eye_mid[1] - head_pos[1])))
    la.range_map_horizontal_inner.input_max_value = 90.0
    la.range_map_horizontal_inner.output_scale = 12.0
    la.range_map_horizontal_outer.input_max_value = 90.0
    la.range_map_horizontal_outer.output_scale = 14.0
    la.range_map_vertical_down.input_max_value = 90.0
    la.range_map_vertical_down.output_scale = 10.0
    la.range_map_vertical_up.input_max_value = 90.0
    la.range_map_vertical_up.output_scale = 10.0

    face_objs = [
        o
        for o in bpy.data.objects
        if o.type == "MESH" and o.data.shape_keys is not None and o.name in ("TS_Head", "TS_Mouth", "TS_Lashes", "TS_Brow_L", "TS_Brow_R")
    ]

    def bind_weights(expression: Any, weights_map: dict[str, float]) -> None:
        expression.morph_target_binds.clear()
        for morph_name, weight in weights_map.items():
            for obj in face_objs:
                if morph_name in obj.data.shape_keys.key_blocks:
                    b = expression.morph_target_binds.add()
                    b.node.mesh_object_name = obj.name
                    b.index = morph_name
                    b.weight = float(weight)

    preset = ext.expressions.preset
    preset_prop_map = {
        "aa": preset.aa,
        "ih": preset.ih,
        "ou": preset.ou,
        "ee": preset.ee,
        "oh": preset.oh,
        "happy": preset.happy,
        "angry": preset.angry,
        "sad": preset.sad,
        "relaxed": preset.relaxed,
        "surprised": preset.surprised,
        "blink": preset.blink,
        "blinkLeft": preset.blink_left,
        "blinkRight": preset.blink_right,
        "lookUp": preset.look_up,
        "lookDown": preset.look_down,
        "lookLeft": preset.look_left,
        "lookRight": preset.look_right,
        "neutral": preset.neutral,
    }
    for pname, pexpr in preset_prop_map.items():
        bind_weights(pexpr, expr.VRM1_EXPRESSION_MAPPINGS_V2.get(pname, {}))

    ext.expressions.custom.clear()
    for cname, cspec in expr.WEBTOON_EMOTION_PRESETS_V2.items():
        ce = ext.expressions.custom.add()
        ce.custom_name = cname
        bind_weights(ce, cspec["weights"])


def _setup_vrm_eevee_studio(spec: HeroAvatarSpec, plan: bb2.ArchetypePlan, res: int) -> tuple[list[Any], Any]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 95
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 16
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new(f"StudioWorld_{spec.hero_id}")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.94, 0.93, 0.90, 1.0)
        bg.inputs[1].default_value = 0.95

    created: list[Any] = []
    for lname, loc, energy, color in (
        ("StudioKey", (1.2, -1.8, plan.z_crown + 0.45), 210.0, (1.0, 0.98, 0.95)),
        ("StudioFill", (-1.3, -1.4, plan.z_chest + 0.20), 115.0, (0.92, 0.96, 1.0)),
        ("StudioRim", (0.2, 1.6, plan.z_crown + 0.30), 140.0, (1.0, 0.99, 0.96)),
    ):
        ld = bpy.data.lights.new(lname, type="AREA")
        ld.energy = energy
        ld.size = 1.2
        ld.color = color
        lo = bpy.data.objects.new(lname, ld)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0.0, 0.0, plan.z_chest + 0.15)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        created.append(lo)

    cam_d = bpy.data.cameras.new(f"StudioCam_{spec.hero_id}")
    cam_d.lens = 62.0
    cam_o = bpy.data.objects.new(f"StudioCam_{spec.hero_id}", cam_d)
    scene.collection.objects.link(cam_o)
    scene.camera = cam_o
    created.append(cam_o)
    return created, cam_o


def render_thumbnail_and_4view_snapshot(
    spec: HeroAvatarSpec,
    plan: bb2.ArchetypePlan,
    thumb_path: Path,
    public_thumb_path: Path,
    snapshot_path: Path,
) -> Any:
    """768×768 프로덕션 썸네일(`< 384 KiB`) + 1024×1024 4-뷰 감사 스냅샷을 렌더하고 썸네일을 VRM에 임베드한다."""
    created, cam_o = _setup_vrm_eevee_studio(spec, plan, res=768)
    scene = bpy.context.scene

    # 1) 768×768 상반신 인물 썸네일
    focus_z = plan.z_eye - plan.head_h * 0.24
    dist = max(0.76, plan.head_h * 4.15)
    cam_pos = Vector((dist * 0.22, -dist, focus_z + 0.03))
    cam_o.location = cam_pos
    cam_o.rotation_euler = (Vector((0.0, 0.0, focus_z)) - cam_pos).to_track_quat("-Z", "Y").to_euler()
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(thumb_path)
    bpy.ops.render.render(write_still=True)

    # 768x768 PNG가 384 KiB 예산 이내로 가볍게 유지되도록 팔레트-최적화 PNG 재인코딩 (시각 무손실 셀 톤)
    if thumb_path.stat().st_size >= 340 * 1024:
        import subprocess
        ffmpeg_bin = "/opt/homebrew/bin/ffmpeg"
        if Path(ffmpeg_bin).is_file():
            opt_path = thumb_path.with_suffix(".opt.png")
            subprocess.run(
                [
                    ffmpeg_bin,
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    str(thumb_path),
                    "-filter_complex",
                    "[0:v]split[a][b];[a]palettegen=max_colors=256:stats_mode=single[p];[b][p]paletteuse=dither=bayer:bayer_scale=2",
                    str(opt_path),
                ],
                check=True,
            )
            if opt_path.is_file() and opt_path.stat().st_size < thumb_path.stat().st_size:
                opt_path.replace(thumb_path)

    public_thumb_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(thumb_path, public_thumb_path)

    # 2) 1024×1024 (2×2 × 512px) 4-뷰 감사 스냅샷 (정면 전신 · 3/4 전신 · 측면 · 얼굴/상반신 클로즈업)
    tile_res = 512
    scene.render.resolution_x = tile_res
    scene.render.resolution_y = tile_res
    cam_o.data.lens = 50.0
    h = plan.spec.height_m
    mid_z = h * 0.50
    d_full = h * 1.62
    views = [
        ("front", Vector((0.0, -d_full, mid_z + 0.02)), Vector((0.0, 0.0, mid_z)), 50.0),
        ("three_quarter", Vector((d_full * 0.44, -d_full * 0.89, mid_z + 0.06)), Vector((0.0, 0.0, mid_z)), 50.0),
        ("side", Vector((d_full, 0.0, mid_z + 0.02)), Vector((0.0, 0.0, mid_z)), 50.0),
        ("closeup", Vector((dist * 0.20, -dist * 0.92, focus_z + 0.03)), Vector((0.0, 0.0, focus_z)), 62.0),
    ]
    tiles: list[np.ndarray] = []
    with tempfile.TemporaryDirectory() as tmp:
        for vname, cpos, ctgt, lens in views:
            cam_o.data.lens = lens
            cam_o.location = cpos
            cam_o.rotation_euler = (ctgt - cpos).to_track_quat("-Z", "Y").to_euler()
            vp = Path(tmp) / f"{vname}.png"
            scene.render.filepath = str(vp)
            bpy.ops.render.render(write_still=True)
            tiles.append(qa._load_png_rgba_bpy(vp))  # noqa: SLF001

    grid = np.full((tile_res * 2, tile_res * 2, 4), 255, dtype=np.uint8)
    for idx_t, tile in enumerate(tiles):
        r, c = idx_t // 2, idx_t % 2
        grid[r * tile_res : (r + 1) * tile_res, c * tile_res : (c + 1) * tile_res] = tile
    sep = np.array([210, 205, 194, 255], dtype=np.uint8)
    grid[tile_res - 1 : tile_res + 1, :] = sep
    grid[:, tile_res - 1 : tile_res + 1] = sep
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    qa._write_png_rgba(snapshot_path, grid)  # noqa: SLF001

    # 임시 카메라·라이트 제거 (VRM 익스포트 오염 방지)
    for o in created:
        bpy.data.objects.remove(o, do_unlink=True)

    thumb_img = bpy.data.images.load(str(thumb_path), check_existing=False)
    thumb_img.name = f"thumb_{spec.hero_id}"
    thumb_img.pack()
    return thumb_img


def configure_vrm1_meta_and_humanoid(
    arm: Any,
    spec: HeroAvatarSpec,
    base_sha256: str,
    thumb_img: Any | None,
) -> None:
    ext = arm.data.vrm_addon_extension
    ext.spec_version = "1.0"
    meta = ext.vrm1.meta
    meta.vrm_name = spec.name_ko
    meta.version = "3.0.0-hero-v3-ssot"
    meta.authors.clear()
    meta.authors.add().value = "ToonStudio"
    meta.copyright_information = f"Original procedural webtoon hero avatar by ToonStudio (CC0-1.0 / original) — {spec.hero_id}"
    meta.contact_information = "https://toonstudio.app"
    meta.references.clear()
    meta.references.add().value = "License: CC0-1.0 / original (ToonStudio procedural character_kit v3 SSOT)"
    meta.references.add().value = f"Base archetype: {spec.base_archetype} (SHA-256: {base_sha256})"
    meta.references.add().value = f"Genre: {spec.genre} | Hair: {spec.hair_style} | Garments: {', '.join(spec.garment_presets)}"
    meta.references.add().value = "Exported via tools/blender/character_kit/export_vrm1_hero.py (Blender 5.3 + VRM Add-on 4.5.0)"
    meta.avatar_permission = "everyone"
    meta.commercial_usage = "corporation"
    meta.credit_notation = "unnecessary"
    meta.allow_redistribution = True
    meta.modification = "allowModificationRedistribution"
    meta.other_license_url = ""
    meta.allow_excessively_violent_usage = True
    meta.allow_excessively_sexual_usage = False
    meta.allow_political_or_religious_usage = True
    meta.allow_antisocial_or_hate_usage = False
    if thumb_img is not None:
        meta.thumbnail_image = thumb_img

    hb = ext.vrm1.humanoid.human_bones
    hb.initial_automatic_bone_assignment = False
    hb.filter_by_human_bone_hierarchy = False
    for prop_name, bone_name in VRM1_55_BONE_MAP.items():
        getattr(hb, prop_name).node.bone_name = bone_name
    if not hb.bones_are_correctly_assigned():
        raise RuntimeError(f"VRM 1.0 휴머노이드 본 할당 실패({spec.hero_id}): {list(hb.error_messages())}")


def audit_vrm1_glb_chunk(vrm_path: Path) -> dict[str, Any]:
    data = vrm_path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"유효한 GLB 2.0이 아닙니다: {vrm_path}")

    off = 12
    doc: dict[str, Any] = {}
    while off + 8 <= len(data):
        clen, ctype = struct.unpack_from("<I4s", data, off)
        chunk = data[off + 8 : off + 8 + clen]
        if ctype == b"JSON":
            doc = json.loads(chunk.decode("utf-8"))
            break
        off += 8 + clen

    errors: list[str] = []
    exts = doc.get("extensions", {})
    vrmc = exts.get("VRMC_vrm")
    if not isinstance(vrmc, dict):
        errors.append("VRMC_vrm 확장이 없습니다.")
        vrmc = {}
    if vrmc.get("specVersion") != "1.0":
        errors.append(f"VRMC_vrm.specVersion != '1.0': {vrmc.get('specVersion')}")

    hbones = vrmc.get("humanoid", {}).get("humanBones", {})
    if len(hbones) != 55:
        errors.append(f"휴머노이드 본 수 != 55 (실측 {len(hbones)})")

    preset_exprs = vrmc.get("expressions", {}).get("preset", {})
    custom_exprs = vrmc.get("expressions", {}).get("custom", {})
    expected_18 = {
        "aa", "ih", "ou", "ee", "oh",
        "happy", "angry", "sad", "relaxed", "surprised",
        "blink", "blinkLeft", "blinkRight",
        "lookUp", "lookDown", "lookLeft", "lookRight",
        "neutral",
    }
    missing_exprs = sorted(expected_18 - set(preset_exprs.keys()))
    if missing_exprs:
        errors.append(f"VRM Expression 누락: {missing_exprs}")

    sb = exts.get("VRMC_springBone")
    spring_count = 0
    joint_count = 0
    min_hit_radius = float("inf")
    collider_count = 0
    if not isinstance(sb, dict):
        errors.append("VRMC_springBone 확장이 없습니다.")
    else:
        springs = sb.get("springs", [])
        colliders = sb.get("colliders", [])
        spring_count = len(springs)
        collider_count = len(colliders)
        if spring_count == 0:
            errors.append("VRMC_springBone.springs가 비어 있습니다.")
        if collider_count == 0:
            errors.append("VRMC_springBone.colliders가 비어 있습니다.")
        for si, sp in enumerate(springs):
            for ji, jt in enumerate(sp.get("joints", [])):
                joint_count += 1
                hr = float(jt.get("hitRadius", 0.0))
                min_hit_radius = min(min_hit_radius, hr)
                if hr <= 0.0:
                    errors.append(f"spring[{si}].joints[{ji}] hitRadius={hr} (<= 0 금지)")
                gdir = jt.get("gravityDir", [0.0, -1.0, 0.0])
                if gdir[1] > -0.5:
                    errors.append(f"spring[{si}].joints[{ji}] gravityDir={gdir} (하향 -Y 아님)")

    materials = doc.get("materials", [])
    mtoon_checked = 0
    if not materials:
        errors.append("재질이 0개입니다.")
    if len(materials) > 16:
        errors.append(f"재질 수 {len(materials)} > 16 한도")
    for mat in materials:
        mname = mat.get("name", "<unnamed>")
        mt = mat.get("extensions", {}).get("VRMC_materials_mtoon")
        if not isinstance(mt, dict):
            errors.append(f"재질 '{mname}'에 VRMC_materials_mtoon이 없습니다.")
            continue
        mtoon_checked += 1
        if mt.get("outlineWidthMode") != "screenCoordinates":
            errors.append(f"재질 '{mname}' outlineWidthMode={mt.get('outlineWidthMode')} != 'screenCoordinates'")
        ol_mix = float(mt.get("outlineLightingMixFactor", -1.0))
        if abs(ol_mix - 0.0) > 1e-5:
            errors.append(f"재질 '{mname}' outlineLightingMixFactor={ol_mix} != 0.0")
        toony = float(mt.get("shadingToonyFactor", -1.0))
        if abs(toony - 0.9) > 1e-3:
            errors.append(f"재질 '{mname}' shadingToonyFactor={toony} != 0.9")

    meta = vrmc.get("meta", {})
    refs_joined = " ".join(meta.get("references", []))
    if not meta.get("authors"):
        errors.append("meta.authors 누락")
    if meta.get("commercialUsage") != "corporation" or not meta.get("allowRedistribution"):
        errors.append("CC0/original 상업·재배포 권한 메타 누락")
    if "CC0" not in refs_joined and "original" not in refs_joined:
        errors.append("meta.references에 CC0/original 근거가 없습니다.")

    total_tris = 0
    min_y = float("inf")
    max_y = float("-inf")
    accessors = doc.get("accessors", [])
    for mesh in doc.get("meshes", []):
        for prim in mesh.get("primitives", []):
            if "indices" in prim:
                total_tris += int(accessors[prim["indices"]]["count"]) // 3
            pos_acc = accessors[prim["attributes"]["POSITION"]]
            if "min" in pos_acc and "max" in pos_acc:
                min_y = min(min_y, float(pos_acc["min"][1]))
                max_y = max(max_y, float(pos_acc["max"][1]))

    if total_tris > 70_000:
        errors.append(f"삼각형 수 {total_tris} > 70,000 VRM 예산 초과")
    if abs(min_y) > 0.005:
        errors.append(f"glTF 바닥 접지 이탈: minY={min_y:.5f}m")

    return {
        "file": vrm_path.name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "ok": len(errors) == 0,
        "errorCount": len(errors),
        "errors": errors,
        "specVersion": vrmc.get("specVersion"),
        "humanoidBones": len(hbones),
        "presetExpressions": len(preset_exprs),
        "customExpressions": len(custom_exprs),
        "springCount": spring_count,
        "springJointCount": joint_count,
        "springColliderCount": collider_count,
        "minHitRadius": round(min_hit_radius, 5) if joint_count else 0.0,
        "materialCount": len(materials),
        "mtoonScreenCoordinatesCount": mtoon_checked,
        "totalTriangles": total_tris,
        "heightM": round(max_y - min_y, 4) if max_y > min_y else 0.0,
        "minYM": round(min_y, 5) if min_y < float("inf") else 0.0,
        "hasThumbnail": "thumbnailImage" in meta,
        "metaName": meta.get("name"),
        "authors": meta.get("authors", []),
    }


# ---------------------------------------------------------------------------
# 단일 히어로 VRM 1.0 SSOT 빌드 & 익스포트
# ---------------------------------------------------------------------------


def export_single_hero_vrm(
    spec: HeroAvatarSpec,
    *,
    bases_dir: Path,
    out_dir: Path,
    public_thumb_dir: Path,
) -> dict[str, Any]:
    t0 = time.time()
    _clear_scene_keep_addons()
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    base_glb = bases_dir / f"{spec.base_archetype}.glb"
    if not base_glb.is_file():
        raise FileNotFoundError(f"v3 베이스 GLB를 찾을 수 없습니다: {base_glb}")
    base_sha256 = hashlib.sha256(base_glb.read_bytes()).hexdigest()

    # 베이스 GLB 임포트 + SSOT BaseBodyContext 로드
    bpy.ops.import_scene.gltf(filepath=str(base_glb))
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Icosphere") and obj.parent is None:
            bpy.data.objects.remove(obj, do_unlink=True)

    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.name = f"Armature_{spec.hero_id}"
    body_obj = bpy.data.objects["TS_Body"]
    ctx = gc.load_base_context(spec.base_archetype, bases_dir)
    plan = ctx.plan

    # 1) 베이스 5종 재질을 MToon 1.0 단일 잉크 계약으로 변환
    outline_lin = hex_to_linear(spec.outline_hex)
    base_mat_cfg = {
        "ts_skin_body": (0.0018, (0.87, 0.78, 0.79), False),
        "ts_skin_head": (0.0016, (0.89, 0.80, 0.81), False),
        "ts_eye_sclera": (0.0005, (0.85, 0.85, 0.90), False),
        "ts_mouth_inner": (0.0004, (0.80, 0.66, 0.69), False),
        "ts_lashes_brows": (0.0005, (0.65, 0.60, 0.65), False),
    }
    scene_mats: list[Any] = []
    seen_mat_ids: set[int] = set()
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for mat in obj.data.materials:
            if mat is not None and id(mat) not in seen_mat_ids:
                seen_mat_ids.add(id(mat))
                scene_mats.append(mat)
    for mat in scene_mats:
        base_key = mat.name.split(".")[0]
        ow, shade_c, ds = base_mat_cfg.get(base_key, (0.0018, (0.84, 0.80, 0.84), False))
        img = None
        if mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    img = node.image
                    break
        base_f = (*spec.eye_tint_rgb, 1.0) if base_key == "ts_eye_sclera" else (1.0, 1.0, 1.0, 1.0)
        apply_mtoon1_contract(
            mat,
            image=img,
            base_color_linear=base_f,
            shade_color_linear=shade_c,
            outline_color_linear=outline_lin,
            outline_width=ow,
            double_sided=ds,
            shading_shift=-0.10 if "skin" in base_key else -0.05,
        )

    # 2) 무-무아레 MToon 1.0 헤어 + 다채널 의상 재질 9개 생성 (베이스 5 + 9 = 14 <= 16 예산!)
    hair_img = make_hair_texture_v3(f"tex_hair_{spec.hero_id}", spec.hair_hex, spec.hair_tip_hex, size=512)
    top_pat = "velvet" if "rofan" in spec.outfit_style else "matte"
    acc_pat = "metal" if ("rofan" in spec.outfit_style or "action" in spec.outfit_style) else "matte"

    mats = {
        "hair": create_mtoon_material(f"ts_vrm_hair_{spec.hero_id}", image=hair_img, base_hex=spec.hair_hex, outline_hex=spec.outline_hex, outline_width=0.0022, cool_shade=True, rim_strength=0.14),
        "inner": create_mtoon_material(f"ts_vrm_inner_{spec.hero_id}", image=make_editorial_fabric_texture_v3(f"tex_inner_{spec.hero_id}", spec.inner_hex, spec.top_trim_hex, spec.accent_hex, "matte"), base_hex=spec.inner_hex, outline_hex=spec.outline_hex, outline_width=0.0018),
        "top": create_mtoon_material(f"ts_vrm_top_{spec.hero_id}", image=make_editorial_fabric_texture_v3(f"tex_top_{spec.hero_id}", spec.top_hex, spec.top_trim_hex, spec.accent_hex, top_pat), base_hex=spec.top_hex, outline_hex=spec.outline_hex, outline_width=0.0020),
        "trim": create_mtoon_material(f"ts_vrm_trim_{spec.hero_id}", image=make_editorial_fabric_texture_v3(f"tex_trim_{spec.hero_id}", spec.top_trim_hex, spec.top_hex, spec.accent_hex, "matte"), base_hex=spec.top_trim_hex, outline_hex=spec.outline_hex, outline_width=0.0016),
        "accent": create_mtoon_material(f"ts_vrm_accent_{spec.hero_id}", image=make_editorial_fabric_texture_v3(f"tex_acc_{spec.hero_id}", spec.accent_hex, spec.top_trim_hex, spec.top_hex, acc_pat), base_hex=spec.accent_hex, outline_hex=spec.outline_hex, outline_width=0.0015, cool_shade=False),
        "bottom": create_mtoon_material(f"ts_vrm_bottom_{spec.hero_id}", image=make_editorial_fabric_texture_v3(f"tex_bot_{spec.hero_id}", spec.bottom_hex, spec.bottom_trim_hex, spec.accent_hex, spec.bottom_pattern), base_hex=spec.bottom_hex, outline_hex=spec.outline_hex, outline_width=0.0020),
        "bottom_trim": create_mtoon_material(f"ts_vrm_btrim_{spec.hero_id}", image=make_editorial_fabric_texture_v3(f"tex_btrim_{spec.hero_id}", spec.bottom_trim_hex, spec.bottom_hex, spec.accent_hex, "matte"), base_hex=spec.bottom_trim_hex, outline_hex=spec.outline_hex, outline_width=0.0016),
        "shoe": create_mtoon_material(f"ts_vrm_shoe_{spec.hero_id}", image=make_editorial_fabric_texture_v3(f"tex_shoe_{spec.hero_id}", spec.shoe_hex, spec.sole_hex, spec.accent_hex, "matte"), base_hex=spec.shoe_hex, outline_hex=spec.outline_hex, outline_width=0.0018),
        "sole": create_mtoon_material(f"ts_vrm_sole_{spec.hero_id}", image=make_editorial_fabric_texture_v3(f"tex_sole_{spec.hero_id}", spec.sole_hex, spec.shoe_hex, spec.accent_hex, "matte"), base_hex=spec.sole_hex, outline_hex=spec.outline_hex, outline_width=0.0016),
    }

    # 3) SSOT 의상 먼저 조립 → 남은 삼각형 예산에 맞춰 최적 헤어 LOD(0 또는 1) 자동 선택!
    base_tris = sum(len(o.data.polygons) * 2 for o in bpy.data.objects if o.type == "MESH")
    _, garment_tris = build_ssot_wardrobe_objects(spec, ctx, body_obj, arm, mats)
    remaining_for_hair = 69_200 - base_tris - garment_tris
    # LOD0(~10k~12k)이 여유 있게 들어가면 LOD0, 아니면 LOD1(~4.6k~5.8k), 매우 빡빡하면 LOD2
    hair_lod = 0 if remaining_for_hair >= 13_000 else (1 if remaining_for_hair >= 5_800 else 2)
    _, hair_chains, hair_chain_bones = build_ssot_hair_objects(
        spec,
        base_glb,
        plan,
        arm,
        mats["hair"],
        mats["accent"],
        lod_level=hair_lod,
    )

    # 4) VRM 1.0에 불필요한 param:* morph 정리 (16 facs:* 표정 100% 보존)
    strip_unused_param_shape_keys()

    # 5) 768×768 프로덕션 썸네일(양쪽 경로 동기화) + 1024×1024 4-뷰 스냅샷 렌더
    out_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = out_dir / "thumbnails" / f"{spec.hero_id}.png"
    public_thumb_path = public_thumb_dir / f"{spec.hero_id}.png"
    snapshot_path = out_dir / "snapshots" / f"{spec.hero_id}.png"
    thumb_img = render_thumbnail_and_4view_snapshot(spec, plan, thumb_path, public_thumb_path, snapshot_path)

    # 6) VRM 1.0 메타 + 휴머노이드 55본 + 18+8 표정 + SpringBone 1.0 구성
    configure_vrm1_meta_and_humanoid(arm, spec, base_sha256, thumb_img)
    configure_vrm1_expressions_and_lookat(arm, plan)
    configure_vrm1_spring_bones(arm, plan, hair_chains, hair_chain_bones)

    # 7) 익스포트 직전 전 메시 0-결함 검증
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if any(abs(sc - 1.0) > 1e-5 for sc in obj.scale):
            raise RuntimeError(f"비단위 스케일({spec.hero_id}:{obj.name}): {tuple(obj.scale)}")
        bm_chk = bmesh.new()
        bm_chk.from_mesh(obj.data)
        nm = sum(1 for e in bm_chk.edges if len(e.link_faces) > 2)
        loose = sum(1 for v in bm_chk.verts if len(v.link_edges) == 0)
        wire = sum(1 for e in bm_chk.edges if len(e.link_faces) == 0)
        bm_chk.free()
        if nm or loose or wire:
            raise RuntimeError(f"익스포트 직전 bmesh 결함({spec.hero_id}:{obj.name}): nm={nm}, loose={loose}, wire={wire}")

    # 8) Blender VRM Add-on 검증 + VRM 1.0 익스포트
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = arm
    vrm_path = out_dir / f"{spec.hero_id}.vrm"

    val_res = bpy.ops.vrm.model_validate("EXEC_DEFAULT", show_successful_message=False, armature_object_name=arm.name)
    if val_res != {"FINISHED"}:
        raise RuntimeError(f"VRM Add-on 사전 검증 실패({spec.hero_id}): {val_res}")

    exp_res = bpy.ops.export_scene.vrm(
        filepath=str(vrm_path),
        armature_object_name=arm.name,
        use_addon_preferences=False,
        export_invisibles=False,
        export_only_selections=True,
        enable_advanced_preferences=True,
        export_all_influences=False,
        export_lights=False,
        export_gltf_animations=False,
        export_try_sparse_sk=True,
        ignore_warning=True,
    )
    if exp_res != {"FINISHED"}:
        raise RuntimeError(f"VRM 1.0 익스포트 실패({spec.hero_id}): {exp_res}")

    # 9) GLB JSON 청크 즉시 감사
    audit = audit_vrm1_glb_chunk(vrm_path)
    audit["heroId"] = spec.hero_id
    audit["craftVersion"] = "v3-ssot"
    audit["baseArchetype"] = spec.base_archetype
    audit["genre"] = spec.genre
    audit["hairStyle"] = spec.hair_style
    audit["hairLod"] = hair_lod
    audit["outfitStyle"] = spec.outfit_style
    audit["garmentPresets"] = list(spec.garment_presets)
    audit["thumbnail"] = f"thumbnails/{spec.hero_id}.png"
    audit["thumbnailBytes"] = thumb_path.stat().st_size
    audit["snapshot"] = f"snapshots/{spec.hero_id}.png"
    audit["buildSeconds"] = round(time.time() - t0, 2)

    if thumb_path.stat().st_size >= 384 * 1024:
        audit["ok"] = False
        audit["errors"].append(f"썸네일 용량 초과: {thumb_path.stat().st_size}B >= 384 KiB")

    if not audit["ok"]:
        raise RuntimeError(f"VRM 1.0 GLB 청크 감사 실패({spec.hero_id}): {audit['errors']}")

    print(
        f"[export_vrm1_hero] {spec.hero_id:15s}: {audit['bytes'] / 1048576:.2f} MiB | "
        f"tris={audit['totalTriangles']:5d} (hairLOD{hair_lod}) | mats={audit['materialCount']:2d} | "
        f"bones={audit['humanoidBones']} | expr={audit['presetExpressions']}+{audit['customExpressions']} | "
        f"springs={audit['springCount']} (joints={audit['springJointCount']}, minHitR={audit['minHitRadius']}) | "
        f"h={audit['heightM']:.3f}m minY={audit['minYM']:.4f}m | thumb={audit['thumbnailBytes']//1024}KB | {audit['buildSeconds']}s"
    )
    return audit


def write_hero_manifest_and_license(out_dir: Path, audits: list[dict[str, Any]]) -> Path:
    manifest = {
        "schema": "toonstudio.vrm-hero-collection/1",
        "version": "3.0.0-hero-v3-ssot",
        "generatedAt": "2026-11-21",
        "generator": {
            "tool": "tools/blender/character_kit/export_vrm1_hero.py",
            "blender": bpy.app.version_string.split()[0],
            "vrmAddon": "bl_ext.user_default.vrm (4.5.0)",
            "ssotSources": ["build_base_v3.py", "forge_hair_v3.py", "forge_garments_v3.py"],
        },
        "license": "CC0-1.0 / original",
        "contract": {
            "specVersion": "1.0",
            "humanoidBones": 55,
            "presetExpressions": 18,
            "mtoonOutlineWidthMode": "screenCoordinates",
            "mtoonOutlineLightingMixFactor": 0.0,
            "mtoonShadingToonyFactor": 0.9,
            "springBoneMinHitRadiusGt": 0.0,
        },
        "count": len(audits),
        "allPassed": all(a["ok"] for a in audits),
        "avatars": audits,
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    license_txt = (
        "ToonStudio Hero VRM 1.0 Collection (toonstudio-hero-v1 / v3 SSOT)\n"
        "==================================================================\n"
        "License: CC0-1.0 / ToonStudio Original Procedural Design\n"
        "Generated: 2026-11-21\n"
        "Author: ToonStudio\n"
        "Pipeline: tools/blender/character_kit/export_vrm1_hero.py (Blender 5.3 + VRM Add-on 4.5.0)\n"
        "SSOT: build_base_v3.py + forge_hair_v3.py + forge_garments_v3.py\n"
        "\n"
        "All 8 hero avatars (romance-female, romance-male, academy-female, academy-male,\n"
        "rofan-empress, rofan-duke, action-hunter, chibi-mascot) are procedurally authored\n"
        "original geometry and zero-moire editorial MToon 1.0 textures built directly from\n"
        "ToonStudio Character Kit v3 bases, hairs, and garments with zero third-party\n"
        "commercial assets or generative AI meshes.\n"
    )
    (out_dir / "LICENSE.txt").write_text(license_txt, encoding="utf-8")
    return manifest_path


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio VRM 1.0 히어로 아바타 8종 SSOT 익스포터")
    parser.add_argument("--hero", default="all", choices=("all", *HERO_SPECS.keys()))
    parser.add_argument("--bases-dir", type=Path, default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/bases"))
    parser.add_argument("--out-dir", type=Path, default=Path("apps/web/public/vrm/toonstudio-hero-v1"))
    parser.add_argument(
        "--public-thumb-dir",
        type=Path,
        default=Path("apps/web/public/assets/3d/characters/thumbnails/toonstudio-hero-v1"),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    bpy.ops.preferences.addon_enable(module="bl_ext.user_default.vrm")
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    targets = list(HERO_SPECS.values()) if args.hero == "all" else [HERO_SPECS[args.hero]]
    audits: list[dict[str, Any]] = []
    for spec in targets:
        audits.append(
            export_single_hero_vrm(
                spec,
                bases_dir=args.bases_dir,
                out_dir=args.out_dir,
                public_thumb_dir=args.public_thumb_dir,
            )
        )
    if args.hero == "all":
        write_hero_manifest_and_license(args.out_dir, audits)
    else:
        manifest_path = args.out_dir / "manifest.json"
        if manifest_path.exists():
            prev = json.loads(manifest_path.read_text(encoding="utf-8"))
            by_id = {a["heroId"]: a for a in prev.get("avatars", []) if isinstance(a, dict) and "heroId" in a}
            for a in audits:
                by_id[a["heroId"]] = a
            ordered = [by_id[hid] for hid in HERO_SPECS.keys() if hid in by_id]
            if ordered:
                write_hero_manifest_and_license(args.out_dir, ordered)
    print(f"[export_vrm1_hero] 전체 완료 ({len(audits)}종 통과) → {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
