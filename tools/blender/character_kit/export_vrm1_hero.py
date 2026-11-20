"""ToonStudio VRM 1.0 히어로 아바타 8종 생성·익스포트·감사 파이프라인 (Blender 5.3 + VRM Add-on 4.5.0).

5종 v2 베이스(`female-romance`, `male-webtoon`, `male-action`, `youth-academy`, `sd-chibi`) ×
장르 대표 헤어·다채널 의상·신발·소품·SpringBone 물리 체인 조합으로 8종 히어로 VRM 1.0 아바타를 제작한다:
  1. `romance-female`  — 로맨스 여주 (`female-romance`, 웨이브 롱 헤어 + 크림 가디건 + 플리츠 미디스커트 + 로퍼)
  2. `romance-male`    — 현대 로맨스 남주 (`male-webtoon`, 쉼표머리 + 테일러드 코트/넥타이 + 슬랙스 + 더비 슈즈)
  3. `academy-female`  — 한국 학원 여주 (`youth-academy`, 소프트 보브 + 네이비 교복 블레이저 + 체크 플리츠 스커트 + 니삭스 + 로퍼)
  4. `academy-male`    — 한국 학원 남주 (`youth-academy`, 투블럭 댄디컷 + 교복 블레이저/넥타이 + 슬랙스 + 스니커즈)
  5. `rofan-empress`   — 로판 황녀/황후 (`female-romance`, 브레이드 업스타일 롱컬 + 버건디 코르셋 볼가운 + 골드 티아라/초커 + 부츠)
  6. `rofan-duke`      — 로판 북부대공 (`male-webtoon`, 올백 노블컷 + 제국 장교 롱코트/견장 + 숄더 망토 + 롱 부츠)
  7. `action-hunter`   — 액션 헌터/각성자 (`male-action`, 울프 레이어드 컷 + 테크웨어 자켓/체스트 하네스 + 카고 팬츠 + 컴뱃 부츠)
  8. `chibi-mascot`    — SD 마스코트 (`sd-chibi`, 하이 트윈테일 + 파스텔 오버사이즈 후디 + 쇼츠 + 스니커즈 + 별 헤어핀)

필수 불변 계약(Hard Gate):
- `VRMC_vrm 1.0` 정식 규격 (`bpy.ops.preferences.addon_enable(module="bl_ext.user_default.vrm")`, `--addons` 금지)
- 휴머노이드 55본 100% 매핑 (`hips`~`rightLittleDistal` + `jaw`, `leftEye`, `rightEye`)
- 18 VRM 1.0 Expression 프리셋(`aa/ih/ou/ee/oh`, `happy/angry/sad/relaxed/surprised`, `blink/blinkLeft/blinkRight`,
  `lookUp/Down/Left/Right`, `neutral`) + 웹툰 커스텀 표정 8종
- `VRMC_springBone 1.0`: 모든 체인의 모든 joint `hitRadius > 0`, 두상·목·몸통·팔 콜라이더 연동
- **모든 MToon 1.0 재질**: `outlineWidthMode == "screenCoordinates"`, `outlineLightingMixFactor == 0.0`,
  `shadingToonyFactor == 0.9` (단일 잉크 계약)
- `bmesh` 0-결함 (`true_nonmanifold == 0`, `loose_verts == 0`, `wire_edges == 0`, `zero_area == 0`),
  미터 스케일(`1.0=1m`), `scale=(1,1,1)`, 바닥 접지(`Z=0` Blender / `Y=0` glTF), UV `[0,1]` 마진 `>= 0.015`
- CC0-1.0 / original 라이선스 메타 + 512x512 임베드 썸네일 보존

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
import struct
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

_THIS_DIR = Path(__file__).resolve().parent
_BLENDER_TOOLS_DIR = _THIS_DIR.parent
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from character_kit import build_base_v2 as bb2  # noqa: E402
from character_kit import build_expressions_v2 as expr  # noqa: E402


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
# 8종 히어로 아바타 명세
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
    top_hex: str
    top_trim_hex: str
    accent_hex: str
    bottom_hex: str
    bottom_trim_hex: str
    shoe_hex: str
    outline_hex: str
    eye_tint_rgb: tuple[float, float, float]


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
        top_hex="#F4ECE1",
        top_trim_hex="#D9C2AC",
        accent_hex="#C97B84",
        bottom_hex="#B56E7C",
        bottom_trim_hex="#8A4C58",
        shoe_hex="#4F352E",
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
        top_hex="#363B47",
        top_trim_hex="#F3F2EE",
        accent_hex="#8C2D3C",
        bottom_hex="#2A2E38",
        bottom_trim_hex="#1E2129",
        shoe_hex="#2E221F",
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
        top_hex="#233252",
        top_trim_hex="#F2F0EC",
        accent_hex="#A83244",
        bottom_hex="#313E5E",
        bottom_trim_hex="#D6B25E",
        shoe_hex="#452D24",
        outline_hex="#1F2230",
        eye_tint_rgb=(1.0, 1.0, 1.0),
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
        top_hex="#223150",
        top_trim_hex="#F5F5F2",
        accent_hex="#C89F46",
        bottom_hex="#4A4E59",
        bottom_trim_hex="#32353E",
        shoe_hex="#E5E4E0",
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
        top_hex="#7A1F33",
        top_trim_hex="#F5EDE0",
        accent_hex="#DFB657",
        bottom_hex="#68182B",
        bottom_trim_hex="#DFB657",
        shoe_hex="#4D1A26",
        outline_hex="#2D1520",
        eye_tint_rgb=(1.0, 0.97, 0.98),
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
        top_hex="#1E2230",
        top_trim_hex="#8A1E2E",
        accent_hex="#E0B856",
        bottom_hex="#1B1D26",
        bottom_trim_hex="#D4AC4E",
        shoe_hex="#1A181D",
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
        top_hex="#252933",
        top_trim_hex="#3C4352",
        accent_hex="#33C4D8",
        bottom_hex="#2B2E36",
        bottom_trim_hex="#4A505E",
        shoe_hex="#1F2127",
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
        top_hex="#8FD4C4",
        top_trim_hex="#FAF5EC",
        accent_hex="#F2C85B",
        bottom_hex="#F4EAE0",
        bottom_trim_hex="#E6A0B8",
        shoe_hex="#F09CB8",
        outline_hex="#3B2538",
        eye_tint_rgb=(1.0, 1.0, 1.0),
    ),
}

assert len(HERO_SPECS) == 8


# ---------------------------------------------------------------------------
# 색 공간·유틸리티
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
    """웹툰 셀 음영용 조화 셰이드 색(단순 회색 대신 약간의 채도+냉/난색 시프트)."""
    r, g, b = hex_to_linear(base_hex)
    if cool_shift:
        return (max(0.02, r * 0.68), max(0.02, g * 0.66), max(0.03, min(1.0, b * 0.78 + 0.015)))
    return (max(0.02, r * 0.76), max(0.02, g * 0.66), max(0.02, b * 0.64))


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
# 절차 512x512 웹툰 텍스처 생성기 (헤어 램프 / 트윌 / 체크 / 니트 / 벨벳 / 테크웨어 / 금속)
# ---------------------------------------------------------------------------


def _pack_rgba_image(name: str, rgb_srgb: np.ndarray) -> Any:
    """(H, W, 3) float32 [0..1] sRGB 배열을 Blender packed PNG 이미지로 생성."""
    h, w, _ = rgb_srgb.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(rgb_srgb, 0.0, 1.0)
    img = bpy.data.images.new(name=name, width=w, height=h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "sRGB"
    # Blender 픽셀은 bottom-to-top
    img.pixels.foreach_set(rgba[::-1].ravel())
    img.pack()
    return img


def make_hair_texture(name: str, base_hex: str, tip_hex: str, size: int = 512) -> Any:
    """뿌리(V=0) → 끝(V=1) 그라데이션 + 엔젤링 툰 하이라이트 + 미세 가닥 결."""
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size
    v = (yy + 0.5) / size  # 0=뿌리, 1=끝
    c_base = np.array(hex_to_srgb(base_hex), dtype=np.float32)
    c_tip = np.array(hex_to_srgb(tip_hex), dtype=np.float32)
    c_root = c_base * 0.72
    c_hi = np.clip(c_base * 1.28 + 0.22, 0.0, 1.0)

    # 뿌리 어두움 → 본체 → 끝 그라데이션
    root_t = np.clip(v / 0.18, 0.0, 1.0)[..., None]
    tip_t = np.clip((v - 0.58) / 0.40, 0.0, 1.0)[..., None]
    col = c_root * (1.0 - root_t) + c_base * root_t
    col = col * (1.0 - tip_t) + c_tip * tip_t

    # 부드러운 세로 결(가닥당 4~9가닥 미세 음영 — 과도한 줄무늬 방지)
    strands = 0.022 * np.sin(u * 2.0 * np.pi * 4.0) + 0.012 * np.sin(u * 2.0 * np.pi * 9.0 + 1.1)
    col = np.clip(col + strands[..., None], 0.0, 1.0)

    # 지그재그 엔젤링 하이라이트 밴드 (V ≈ 0.28..0.38)
    zig = 0.022 * np.sin(u * 2.0 * np.pi * 3.0) + 0.010 * np.cos(u * 2.0 * np.pi * 6.0)
    band_center = 0.32 + zig
    band = np.exp(-(((v - band_center) / 0.048) ** 2))
    band_crisp = np.clip((band - 0.30) / 0.30, 0.0, 1.0) * (0.78 + 0.22 * np.sin(u * 2.0 * np.pi * 8.0))
    col = col * (1.0 - band_crisp[..., None] * 0.48) + c_hi * (band_crisp[..., None] * 0.48)
    return _pack_rgba_image(name, col)


def make_fabric_texture(
    name: str,
    base_hex: str,
    trim_hex: str,
    accent_hex: str,
    pattern: str = "twill",
    size: int = 512,
) -> Any:
    """의상 장르별 절차 원단 텍스처 (twill / plaid / knit / velvet / techwear / leather / metal)."""
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size
    v = (yy + 0.5) / size
    c0 = np.array(hex_to_srgb(base_hex), dtype=np.float32)
    c1 = np.array(hex_to_srgb(trim_hex), dtype=np.float32)
    ca = np.array(hex_to_srgb(accent_hex), dtype=np.float32)
    col = np.broadcast_to(c0, (size, size, 3)).copy()

    if pattern == "twill":
        weave = 0.025 * np.sin((u + v) * 2.0 * np.pi * 48.0) + 0.012 * np.sin((u - v) * 2.0 * np.pi * 24.0)
        # 하단(V near 0) 미세 앰비언트 셰이딩
        hem_grad = 0.04 * (1.0 - v)
        col = np.clip(col + weave[..., None] - hem_grad[..., None], 0.0, 1.0)
    elif pattern == "plaid":
        # 한국 학원 교복 체크 타탄 패턴
        su = (u * 8.0) % 1.0
        sv = (v * 8.0) % 1.0
        band_u = ((su > 0.12) & (su < 0.34)).astype(np.float32)
        band_v = ((sv > 0.12) & (sv < 0.34)).astype(np.float32)
        thin_u = (np.abs(su - 0.68) < 0.032).astype(np.float32)
        thin_v = (np.abs(sv - 0.68) < 0.032).astype(np.float32)
        dark = c0 * 0.62
        mix_dark = np.clip((band_u + band_v) * 0.55, 0.0, 0.85)[..., None]
        col = col * (1.0 - mix_dark) + dark * mix_dark
        mix_acc = np.maximum(thin_u, thin_v)[..., None] * 0.72
        col = col * (1.0 - mix_acc) + ca * mix_acc
        mix_trim = (np.abs(su - 0.23) < 0.018).astype(np.float32)[..., None] * 0.35
        col = col * (1.0 - mix_trim) + c1 * mix_trim
    elif pattern == "knit":
        rib = 0.018 * np.sin(u * 2.0 * np.pi * 28.0) + 0.006 * np.sin(v * 2.0 * np.pi * 48.0)
        hem_grad = 0.035 * (1.0 - v)
        col = np.clip(col + rib[..., None] - hem_grad[..., None], 0.0, 1.0)
    elif pattern == "velvet":
        # 로판 벨벳 광택 + 하단 금사 보더
        sheen = 0.05 * np.sin(v * np.pi) + 0.02 * np.sin(u * 2.0 * np.pi * 16.0)
        col = np.clip(col + sheen[..., None], 0.0, 1.0)
        border = ((v > 0.05) & (v < 0.115)).astype(np.float32)
        filigree = (0.5 + 0.5 * np.sin(u * 2.0 * np.pi * 24.0) * np.sin((v - 0.05) / 0.065 * np.pi)) * border
        col = col * (1.0 - filigree[..., None] * 0.78) + ca * (filigree[..., None] * 0.78)
    elif pattern == "techwear":
        # 매트 나일론 립스탑 격자 + 미세 시안/메탈 스티치 라인
        grid = (0.018 * (np.sin(u * 2.0 * np.pi * 64.0) * np.sin(v * 2.0 * np.pi * 64.0)))
        panel = ((np.abs(v - 0.16) < 0.008) | (np.abs(v - 0.82) < 0.008)).astype(np.float32)
        col = np.clip(col + grid[..., None], 0.0, 1.0)
        col = col * (1.0 - panel[..., None] * 0.65) + ca * (panel[..., None] * 0.65)
    elif pattern == "metal":
        brush = 0.06 * np.sin(v * 2.0 * np.pi * 18.0) + 0.04 * np.cos(u * 2.0 * np.pi * 6.0)
        col = np.clip(col + brush[..., None], 0.0, 1.0)
    else:  # leather / smooth
        grain = 0.02 * np.sin(u * 2.0 * np.pi * 30.0 + np.sin(v * 2.0 * np.pi * 20.0))
        col = np.clip(col + grain[..., None], 0.0, 1.0)

    return _pack_rgba_image(name, col)


# ---------------------------------------------------------------------------
# MToon 1.0 단일 잉크 계약 재질 빌더/변환기
# ---------------------------------------------------------------------------


def apply_mtoon1_contract(
    mat: Any,
    *,
    image: Any | None,
    base_color_linear: tuple[float, float, float, float],
    shade_color_linear: tuple[float, float, float],
    outline_color_linear: tuple[float, float, float],
    outline_width: float = 0.0022,
    double_sided: bool = False,
    shading_shift: float = -0.10,
    rim_color_linear: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> Any:
    """모든 재질에 VRM 1.0 MToon 단일 잉크 계약을 일괄 강제한다.

    불변 규약:
    - `outlineWidthMode == "screenCoordinates"`
    - `outlineLightingMixFactor == 0.0`
    - `shadingToonyFactor == 0.9`
    """
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
    v.gi_equalization_factor = 0.78
    v.outline_width_mode = v.OUTLINE_WIDTH_MODE_SCREEN_COORDINATES.identifier
    v.outline_width_factor = outline_width
    v.outline_color_factor = outline_color_linear
    v.outline_lighting_mix_factor = 0.0
    v.parametric_rim_color_factor = rim_color_linear
    v.parametric_rim_fresnel_power_factor = 4.0
    v.parametric_rim_lift_factor = 0.0
    v.rim_lighting_mix_factor = 0.35
    return mat


def create_mtoon_material(
    name: str,
    *,
    image: Any | None,
    base_hex: str,
    outline_hex: str,
    outline_width: float = 0.0022,
    cool_shade: bool = True,
    rim_strength: float = 0.0,
) -> Any:
    mat = bpy.data.materials.new(name=name)
    r, g, b = hex_to_linear(base_hex)
    base_factor = (1.0, 1.0, 1.0, 1.0) if image is not None else (r, g, b, 1.0)
    shade = (0.76, 0.73, 0.80) if (image is not None and cool_shade) else (
        (0.80, 0.74, 0.73) if image is not None else cel_shade_linear(base_hex, cool_shift=cool_shade)
    )
    rim = (min(1.0, r * 1.4) * rim_strength, min(1.0, g * 1.4) * rim_strength, min(1.0, b * 1.4) * rim_strength)
    return apply_mtoon1_contract(
        mat,
        image=image,
        base_color_linear=base_factor,
        shade_color_linear=shade,
        outline_color_linear=hex_to_linear(outline_hex),
        outline_width=outline_width,
        double_sided=False,
        rim_color_linear=rim,
    )


# ---------------------------------------------------------------------------
# 수밀 폐곡면 bmesh 지오메트리 프리미티브 (0-결함 보장)
# ---------------------------------------------------------------------------


def _ensure_clean_bmesh(bm: bmesh.types.BMesh, name: str) -> None:
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    nm = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    loose = sum(1 for v in bm.verts if len(v.link_edges) == 0)
    wire = sum(1 for e in bm.edges if len(e.link_faces) == 0)
    zero_f = sum(1 for f in bm.faces if f.calc_area() < 1e-10)
    if nm or loose or wire or zero_f:
        raise RuntimeError(f"bmesh 결함({name}): true_nm={nm}, loose={loose}, wire={wire}, zero_area={zero_f}")


def _finalize_mesh_object(
    bm: bmesh.types.BMesh,
    name: str,
    mat: Any,
    armature: Any,
) -> Any:
    _ensure_clean_bmesh(bm, name)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = armature
    mod = obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = armature

    # Blender 5.3 스무스 규약 (use_auto_smooth 금지)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=0.523599, keep_sharp_edges=True)
    return obj


def _add_thick_loft_shell(
    bm: bmesh.types.BMesh,
    uv_layer: Any,
    rings_outer: np.ndarray,
    *,
    thickness: float = 0.0045,
    close_bottom: bool = False,
    close_top: bool = False,
) -> list[bmesh.types.BMVert]:
    """(M, N, 3) 폐곡선 링 배열로 100% 수밀 폐곡면 두께 셸을 구축한다.

    외벽 + 내벽(법선 안쪽 `thickness`) + 상/하단 림을 닫아 `non_manifold == 0` 보장.
    UV는 `[0.02, 0.98]` 범위 내 배치한다.
    """
    m, n, _ = rings_outer.shape
    # 각 링 중심 기준 반경 안쪽으로 내벽 생성
    centers = rings_outer.mean(axis=1, keepdims=True)
    radial = rings_outer - centers
    r_len = np.linalg.norm(radial, axis=2, keepdims=True)
    r_dir = radial / np.maximum(r_len, 1e-6)
    safe_t = np.minimum(thickness, r_len * 0.35)
    rings_inner = rings_outer - r_dir * safe_t

    out_v: list[list[bmesh.types.BMVert]] = []
    in_v: list[list[bmesh.types.BMVert]] = []
    for i in range(m):
        out_v.append([bm.verts.new(tuple(rings_outer[i, j])) for j in range(n)])
        if not (close_bottom and close_top):
            in_v.append([bm.verts.new(tuple(rings_inner[i, j])) for j in range(n)])

    def make_quad(v0, v1, v2, v3, u0, u1, vv0, vv1):
        f = bm.faces.new((v0, v1, v2, v3))
        uvs = ((u0, vv0), (u1, vv0), (u1, vv1), (u0, vv1))
        for loop, uv in zip(f.loops, uvs):
            loop[uv_layer].uv = uv

    # 외벽 (v=0.02..0.98)
    for i in range(m - 1):
        vv0 = 0.02 + 0.96 * (i / max(m - 1, 1))
        vv1 = 0.02 + 0.96 * ((i + 1) / max(m - 1, 1))
        for j in range(n):
            jn = (j + 1) % n
            u0 = 0.02 + 0.96 * (j / n)
            u1 = 0.02 + 0.96 * ((j + 1) / n)
            make_quad(out_v[i][j], out_v[i][jn], out_v[i + 1][jn], out_v[i + 1][j], u0, u1, vv0, vv1)

    if close_bottom and close_top:
        # 완전 솔리드 닫힌 캡(예: 칼라/허리띠/신발 본체)
        c_bot = bm.verts.new(tuple(rings_outer[0].mean(axis=0)))
        c_top = bm.verts.new(tuple(rings_outer[-1].mean(axis=0)))
        for j in range(n):
            jn = (j + 1) % n
            f0 = bm.faces.new((c_bot, out_v[0][jn], out_v[0][j]))
            for loop in f0.loops:
                loop[uv_layer].uv = (0.5, 0.04)
            f1 = bm.faces.new((c_top, out_v[-1][j], out_v[-1][jn]))
            for loop in f1.loops:
                loop[uv_layer].uv = (0.5, 0.96)
        return [v for row in out_v for v in row] + [c_bot, c_top]

    # 내벽 (감김 반대)
    for i in range(m - 1):
        vv0 = 0.02 + 0.96 * (i / max(m - 1, 1))
        vv1 = 0.02 + 0.96 * ((i + 1) / max(m - 1, 1))
        for j in range(n):
            jn = (j + 1) % n
            u0 = 0.02 + 0.96 * (j / n)
            u1 = 0.02 + 0.96 * ((j + 1) / n)
            make_quad(in_v[i][jn], in_v[i][j], in_v[i + 1][j], in_v[i + 1][jn], u0, u1, vv0, vv1)

    # 하단·상단 림 닫기
    for j in range(n):
        jn = (j + 1) % n
        u0 = 0.02 + 0.96 * (j / n)
        u1 = 0.02 + 0.96 * ((j + 1) / n)
        make_quad(in_v[0][j], in_v[0][jn], out_v[0][jn], out_v[0][j], u0, u1, 0.02, 0.03)
        make_quad(out_v[-1][j], out_v[-1][jn], in_v[-1][jn], in_v[-1][j], u0, u1, 0.97, 0.98)

    return [v for row in out_v for v in row] + [v for row in in_v for v in row]


def _add_tapered_strand(
    bm: bmesh.types.BMesh,
    uv_layer: Any,
    curve_pts: np.ndarray,
    widths: np.ndarray,
    thicknesses: np.ndarray,
    n_profile: int = 8,
    crescent: float = 0.22,
    head_center: np.ndarray | None = None,
) -> list[tuple[bmesh.types.BMVert, float]]:
    """아몬드/초승달 단면의 수밀 닫힌 헤어 가닥 청크를 스윕한다. 반환: [(vert, t_along_strand)]."""
    k = len(curve_pts)
    assert k >= 3
    tangents = np.zeros_like(curve_pts)
    tangents[0] = curve_pts[1] - curve_pts[0]
    tangents[-1] = curve_pts[-1] - curve_pts[-2]
    if k > 2:
        tangents[1:-1] = curve_pts[2:] - curve_pts[:-2]
    t_norm = np.linalg.norm(tangents, axis=1, keepdims=True)
    tangents = tangents / np.maximum(t_norm, 1e-6)

    # 단면 프레임: outward normal은 두개골 중심에서 바깥 방향을 우선 참조
    hc = head_center if head_center is not None else np.array([0.0, 0.01, float(curve_pts[0, 2]) - 0.06])
    rings_verts: list[list[bmesh.types.BMVert]] = []
    vert_ts: list[tuple[bmesh.types.BMVert, float]] = []

    angles = np.linspace(0.0, 2.0 * math.pi, n_profile, endpoint=False)
    for i in range(k):
        t_frac = i / max(k - 1, 1)
        p = curve_pts[i]
        tan = tangents[i]
        out_hint = p - hc
        out_hint = out_hint - np.dot(out_hint, tan) * tan
        on = np.linalg.norm(out_hint)
        if on < 1e-5:
            fallback = np.array([0.0, -1.0, 0.0]) if abs(tan[1]) < 0.8 else np.array([1.0, 0.0, 0.0])
            out_hint = fallback - np.dot(fallback, tan) * tan
            on = np.linalg.norm(out_hint)
        nrm = out_hint / max(on, 1e-6)
        side = np.cross(tan, nrm)
        sn = np.linalg.norm(side)
        side = side / max(sn, 1e-6)

        w = float(widths[i])
        th = float(thicknesses[i])
        ring: list[bmesh.types.BMVert] = []
        for ang in angles:
            ca = math.cos(ang)
            sa = math.sin(ang)
            # 아몬드/초승달 단면: 좌우 뾰족하고 바깥쪽 볼록
            sx = ca * w * 0.5
            sy = (sa * th * 0.5) + crescent * th * 0.5 * (1.0 - ca * ca)
            pt = p + side * sx + nrm * sy
            v = bm.verts.new(tuple(pt))
            ring.append(v)
            vert_ts.append((v, t_frac))
        rings_verts.append(ring)

    # 뿌리 마개 & 끝 뾰족한 팁
    root_c = bm.verts.new(tuple(curve_pts[0] - tangents[0] * 0.004))
    tip_v = bm.verts.new(tuple(curve_pts[-1] + tangents[-1] * max(0.008, float(widths[-1]) * 0.35)))
    vert_ts.append((root_c, 0.0))
    vert_ts.append((tip_v, 1.0))

    for i in range(k - 1):
        vv0 = 0.02 + 0.94 * (i / max(k - 1, 1))
        vv1 = 0.02 + 0.94 * ((i + 1) / max(k - 1, 1))
        for j in range(n_profile):
            jn = (j + 1) % n_profile
            u0 = 0.02 + 0.96 * (j / n_profile)
            u1 = 0.02 + 0.96 * ((j + 1) / n_profile)
            f = bm.faces.new((rings_verts[i][j], rings_verts[i][jn], rings_verts[i + 1][jn], rings_verts[i + 1][j]))
            for loop, uv in zip(f.loops, ((u0, vv0), (u1, vv0), (u1, vv1), (u0, vv1))):
                loop[uv_layer].uv = uv

    for j in range(n_profile):
        jn = (j + 1) % n_profile
        u0 = 0.02 + 0.96 * (j / n_profile)
        u1 = 0.02 + 0.96 * ((j + 1) / n_profile)
        fr = bm.faces.new((root_c, rings_verts[0][jn], rings_verts[0][j]))
        for loop, uv in zip(fr.loops, ((0.5, 0.02), (u1, 0.03), (u0, 0.03))):
            loop[uv_layer].uv = uv
        ft = bm.faces.new((rings_verts[-1][j], rings_verts[-1][jn], tip_v))
        for loop, uv in zip(ft.loops, ((u0, 0.96), (u1, 0.96), (0.5, 0.98))):
            loop[uv_layer].uv = uv

    return vert_ts


def _add_beveled_box(
    bm: bmesh.types.BMesh,
    uv_layer: Any,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    rot_euler: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel_w: float = 0.002,
) -> list[bmesh.types.BMVert]:
    """버튼·버클·포켓·스트랩·견장용 수밀 베벨 박스."""
    res = bmesh.ops.create_cube(bm, size=1.0)
    verts = res["verts"]
    sx, sy, sz = size
    rot_m = Euler(rot_euler, "XYZ").to_matrix()
    c_vec = Vector(center)
    for v in verts:
        v.co = (rot_m @ Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))) + c_vec
    if bevel_w > 1e-5:
        edges = list({e for v in verts for e in v.link_edges})
        bev = bmesh.ops.bevel(
            bm,
            geom=edges,
            offset=min(bevel_w, min(sx, sy, sz) * 0.25),
            segments=1,
            profile=0.5,
            affect="EDGES",
            clamp_overlap=True,
        )
        verts = [v for v in (list(bev.get("verts", [])) + [v for f in bev.get("faces", []) if f.is_valid for v in f.verts]) if v.is_valid]
        verts = list(dict.fromkeys(verts))
    faces = list({f for v in verts if v.is_valid for f in v.link_faces if f.is_valid})
    for f in faces:
        n = f.normal
        ax = int(np.argmax([abs(n.x), abs(n.y), abs(n.z)]))
        for loop in f.loops:
            p = loop.vert.co - c_vec
            if ax == 0:
                u, vv = p.y / max(sy, 1e-4) + 0.5, p.z / max(sz, 1e-4) + 0.5
            elif ax == 1:
                u, vv = p.x / max(sx, 1e-4) + 0.5, p.z / max(sz, 1e-4) + 0.5
            else:
                u, vv = p.x / max(sx, 1e-4) + 0.5, p.y / max(sy, 1e-4) + 0.5
            loop[uv_layer].uv = (0.04 + 0.92 * min(max(u, 0.0), 1.0), 0.04 + 0.92 * min(max(vv, 0.0), 1.0))
    return verts


def _add_uv_sphere_solid(
    bm: bmesh.types.BMesh,
    uv_layer: Any,
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    u_seg: int = 16,
    v_seg: int = 10,
) -> list[bmesh.types.BMVert]:
    """수밀 타원구(단추·보석·리본 매듭·번)."""
    res = bmesh.ops.create_uvsphere(bm, u_segments=u_seg, v_segments=v_seg, radius=1.0)
    verts = res["verts"]
    rx, ry, rz = radii
    cx, cy, cz = center
    for v in verts:
        v.co = Vector((v.co.x * rx + cx, v.co.y * ry + cy, v.co.z * rz + cz))
    faces = list({f for v in verts for f in v.link_faces})
    for f in faces:
        for loop in f.loops:
            p = loop.vert.co
            dx = (p.x - cx) / max(rx, 1e-5)
            dy = (p.y - cy) / max(ry, 1e-5)
            dz = (p.z - cz) / max(rz, 1e-5)
            u = 0.03 + 0.94 * (math.atan2(dy, dx) / (2.0 * math.pi) + 0.5)
            vv = 0.03 + 0.94 * (math.asin(max(-1.0, min(1.0, dz))) / math.pi + 0.5)
            loop[uv_layer].uv = (u, vv)
    return verts


# ---------------------------------------------------------------------------
# 베이스 바디 샘플러 (BVH + KDTree + 스킨 가중치 전사)
# ---------------------------------------------------------------------------


class BaseBodySampler:
    """임포트된 v2 베이스의 TS_Body / TS_Head 실제 기하·웨이트를 계측하고 의상/헤어 피팅을 제공한다."""

    def __init__(self, arm: Any, body_obj: Any, head_obj: Any, plan: bb2.ArchetypePlan) -> None:
        self.arm = arm
        self.body_obj = body_obj
        self.head_obj = head_obj
        self.plan = plan

        self.body_co = np.array([list(v.co) for v in body_obj.data.vertices], dtype=np.float64)
        self.head_co = np.array([list(v.co) for v in head_obj.data.vertices], dtype=np.float64)

        # 정점별 주 본 이름 파악 (팔 vs 몸통 분리용)
        vg_names = [vg.name for vg in body_obj.vertex_groups]
        self.body_vgroups: list[list[tuple[str, float]]] = []
        self.body_is_arm = np.zeros(len(self.body_co), dtype=bool)
        self.body_is_leg_l = np.zeros(len(self.body_co), dtype=bool)
        self.body_is_leg_r = np.zeros(len(self.body_co), dtype=bool)
        for vi, v in enumerate(body_obj.data.vertices):
            pairs = [(vg_names[g.group], float(g.weight)) for g in v.groups if g.weight > 1e-4]
            pairs.sort(key=lambda x: x[1], reverse=True)
            self.body_vgroups.append(pairs[:4])
            top_b = pairs[0][0] if pairs else ""
            if any(k in top_b for k in ("Arm", "ForeArm", "Hand")):
                self.body_is_arm[vi] = True
            if "LeftUpLeg" in top_b or "LeftLeg" in top_b or "LeftFoot" in top_b or "LeftToe" in top_b:
                self.body_is_leg_l[vi] = True
            if "RightUpLeg" in top_b or "RightLeg" in top_b or "RightFoot" in top_b or "RightToe" in top_b:
                self.body_is_leg_r[vi] = True

        self.body_kd = KDTree(len(self.body_co))
        for i, co in enumerate(self.body_co):
            self.body_kd.insert(Vector(co), i)
        self.body_kd.balance()

        bm_h = bmesh.new()
        bm_h.from_mesh(head_obj.data)
        self.head_bvh = BVHTree.FromBMesh(bm_h)
        bm_h.free()

        bm_b = bmesh.new()
        bm_b.from_mesh(body_obj.data)
        self.body_bvh = BVHTree.FromBMesh(bm_b)
        bm_b.free()

    def sample_torso_ring(
        self,
        z: float,
        n_seg: int = 44,
        *,
        ease: float = 0.010,
        flare_x: float = 0.0,
        flare_y: float = 0.0,
        pleat_count: int = 0,
        pleat_amp: float = 0.0,
        min_rx: float | None = None,
        min_ry: float | None = None,
    ) -> np.ndarray:
        """높이 z에서 몸통/골반 정점의 매끄러운 외곽 링을 샘플링하고 의상 여유(ease)와 주름을 더한다."""
        # 가랑이 아래 높이는 다리 분리로 링이 찌그러지지 않도록 가랑이 기준 단면을 참조해 매끄럽게 플레어
        z_sample = max(z, self.plan.z_crotch + 0.008)
        band = 0.022 if self.plan.spec.archetype_id != "sd-chibi" else 0.016
        mask = (~self.body_is_arm) & (np.abs(self.body_co[:, 2] - z_sample) <= band)
        pts = self.body_co[mask]
        if len(pts) < 12:
            mask = (~self.body_is_arm) & (np.abs(self.body_co[:, 2] - z_sample) <= band * 2.5)
            pts = self.body_co[mask]
        yc = float(np.median(pts[:, 1])) if len(pts) else 0.008
        angles = np.linspace(0.0, 2.0 * math.pi, n_seg, endpoint=False)
        radii = np.zeros(n_seg, dtype=np.float64)

        if len(pts) >= 8:
            dx = pts[:, 0]
            dy = pts[:, 1] - yc
            p_ang = np.mod(np.arctan2(dx, -dy), 2.0 * math.pi)  # 0 = 전면(-Y), pi/2 = 좌(+X)
            p_rad = np.hypot(dx, dy)
            sector = (2.0 * math.pi / n_seg) * 1.15
            for i, a in enumerate(angles):
                diff = np.abs(np.mod(p_ang - a + math.pi, 2.0 * math.pi) - math.pi)
                near = p_rad[diff <= sector]
                radii[i] = float(np.max(near)) if len(near) else float(np.median(p_rad))
            # 매끄러운 원형 저역 필터(천의 자연스러운 텐션, 울퉁불퉁함 제거)
            fft = np.fft.rfft(radii)
            fft[7:] = 0.0
            smooth_r = np.fft.irfft(fft, n=n_seg)
            radii = np.maximum(radii, smooth_r)
            pad = np.concatenate([radii[-2:], radii, radii[:2]])
            radii = np.maximum(radii, 0.15 * pad[:-4] + 0.20 * pad[1:-3] + 0.30 * pad[2:-2] + 0.20 * pad[3:-1] + 0.15 * pad[4:])
        else:
            radii[:] = self.plan.spec.waist_rx

        ring = np.zeros((n_seg, 3), dtype=np.float64)
        for i, a in enumerate(angles):
            r = radii[i] + ease
            if pleat_count > 0 and pleat_amp > 0.0:
                # 실제 3D 칼주름 파형 (삼각파+코사인 블렌드)
                phase = (a * pleat_count) / (2.0 * math.pi)
                frac = phase - math.floor(phase)
                tri = 1.0 - 2.0 * abs(frac - 0.5)
                r += pleat_amp * (tri - 0.35)
            sx = math.sin(a)
            sy = -math.cos(a)
            rx = r + flare_x * abs(sx)
            ry = r + flare_y * abs(sy)
            if min_rx is not None:
                rx = max(rx, min_rx)
            if min_ry is not None:
                ry = max(ry, min_ry)
            ring[i, 0] = rx * sx
            ring[i, 1] = yc + ry * sy
            ring[i, 2] = z
        return ring

    def sample_arm_ring(self, side_sign: float, x: float, n_seg: int = 24, *, ease: float = 0.009, extra_r: float = 0.0) -> np.ndarray:
        """팔(T-포즈 ±X축) 단면 링."""
        band = 0.018
        mask = self.body_is_arm & (self.body_co[:, 0] * side_sign > 0.0) & (np.abs(self.body_co[:, 0] - x) <= band)
        pts = self.body_co[mask]
        yc = float(np.median(pts[:, 1])) if len(pts) else 0.010
        zc = float(np.median(pts[:, 2])) if len(pts) else self.plan.z_shoulder
        r_est = float(np.max(np.hypot(pts[:, 1] - yc, pts[:, 2] - zc))) if len(pts) >= 6 else self.plan.spec.arm_r
        r = r_est + ease + extra_r
        angles = np.linspace(0.0, 2.0 * math.pi, n_seg, endpoint=False)
        ring = np.zeros((n_seg, 3), dtype=np.float64)
        for i, a in enumerate(angles):
            ring[i, 0] = x
            ring[i, 1] = yc + r * math.cos(a)
            ring[i, 2] = zc + r * math.sin(a) * (1.0 if side_sign > 0 else -1.0)
        return ring

    def sample_leg_ring(self, side_sign: float, z: float, n_seg: int = 26, *, ease: float = 0.009, extra_r: float = 0.0) -> np.ndarray:
        """다리(±X) 타원 단면 링 (X축 골반 스파이크 차단 + Y축 대퇴사두근 완전 포용)."""
        s = self.plan.spec
        leg_mask = self.body_is_leg_l if side_sign > 0 else self.body_is_leg_r
        # 가랑이 직하(골반 외곽 웨이트)와 발목 직하(발등 정점)는 제외하고 순수 허벅지~종아리 단면만 계측
        crotch_margin = 0.022 if s.archetype_id == "sd-chibi" else 0.042
        z_safe = min(max(z, self.plan.z_ankle * 1.15), self.plan.z_crotch - crotch_margin)
        band = 0.018
        mask = leg_mask & (self.body_co[:, 0] * side_sign > 0.004) & (np.abs(self.body_co[:, 2] - z_safe) <= band)
        pts = self.body_co[mask]
        hip_x_nom = s.hip_rx * 0.48
        if len(pts) < 6:
            xc, yc = side_sign * hip_x_nom, 0.004
            rx_est, ry_est = s.calf_r, s.calf_r
        else:
            xc_raw = float(np.median(pts[:, 0]))
            xc_abs = min(max(abs(xc_raw), s.hip_rx * 0.34), s.hip_rx * 0.54)
            xc = side_sign * xc_abs
            yc = float(np.median(pts[:, 1]))
            # X/Y를 독립 계측: X는 골반 외곽선 이내로 엄격 차단, Y(대퇴 앞뒤 두께)는 실제 근육을 100% 감쌈
            rx_raw = float(np.percentile(np.abs(pts[:, 0] - xc), 94))
            ry_raw = float(np.percentile(np.abs(pts[:, 1] - yc), 99))
            if z_safe >= self.plan.z_knee:
                t_th = min(max((z_safe - self.plan.z_knee) / max(self.plan.z_crotch - self.plan.z_knee, 0.05), 0.0), 1.0)
                r_cap = (s.knee_r * (1.0 - t_th) + s.thigh_r * t_th) * 1.16
            else:
                t_cf = min(max((z_safe - self.plan.z_ankle) / max(self.plan.z_knee - self.plan.z_ankle, 0.05), 0.0), 1.0)
                r_cap = (s.ankle_r * (1.0 - t_cf) + max(s.calf_r, s.knee_r) * t_cf) * 1.16
            rx_est = min(rx_raw, r_cap, max(s.hip_rx * 0.98 - xc_abs, s.ankle_r))
            ry_est = max(min(ry_raw, r_cap * 1.32), rx_est)
        rx = rx_est + ease + extra_r
        ry = ry_est + ease + max(extra_r, 0.0)
        angles = np.linspace(0.0, 2.0 * math.pi, n_seg, endpoint=False)
        ring = np.zeros((n_seg, 3), dtype=np.float64)
        for i, a in enumerate(angles):
            ring[i, 0] = xc + rx * math.sin(a)
            ring[i, 1] = yc - ry * math.cos(a)
            ring[i, 2] = z
        return ring

    def push_outside_head_body(self, pts: np.ndarray, clearance: float = 0.0055) -> np.ndarray:
        """헤어 커브 제어점이 두상/목/몸통을 관통하지 않도록 BVH 바깥으로 밀어낸다."""
        out = pts.copy()
        head_c = np.array([0.0, 0.008, self.plan.z_eye + self.plan.head_h * 0.05])
        for i in range(len(out)):
            p = Vector(out[i])
            for bvh in (self.head_bvh, self.body_bvh):
                loc, nrm, _, dist = bvh.find_nearest(p)
                if loc is None:
                    continue
                delta = p - loc
                signed = delta.dot(nrm)
                if signed < clearance and dist < 0.045:
                    push_dir = nrm if nrm.length > 1e-5 else (p - Vector(head_c)).normalized()
                    p = loc + push_dir * clearance
            out[i] = np.array([p.x, p.y, p.z])
        return out

    def transfer_body_skin_weights(self, obj: Any, *, force_bone: str | None = None, k_neighbors: int = 3) -> None:
        """TS_Body의 최근접 k정점에서 정규화된 스킨 웨이트(최대 4본)를 전사한다."""
        if force_bone is not None:
            vg = obj.vertex_groups.get(force_bone) or obj.vertex_groups.new(name=force_bone)
            vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
            return

        vg_cache: dict[str, Any] = {}

        def get_vg(bname: str) -> Any:
            if bname not in vg_cache:
                vg_cache[bname] = obj.vertex_groups.get(bname) or obj.vertex_groups.new(name=bname)
            return vg_cache[bname]

        for vi, v in enumerate(obj.data.vertices):
            nbrs = self.body_kd.find_n(v.co, k_neighbors)
            acc: dict[str, float] = {}
            for _, idx, dist in nbrs:
                inv_d = 1.0 / max(dist, 1e-4)
                for bname, w in self.body_vgroups[idx]:
                    acc[bname] = acc.get(bname, 0.0) + w * inv_d
            if not acc:
                get_vg("mixamorig:Spine1").add([vi], 1.0, "REPLACE")
                continue
            top4 = sorted(acc.items(), key=lambda x: x[1], reverse=True)[:4]
            total = sum(w for _, w in top4)
            for bname, w in top4:
                get_vg(bname).add([vi], w / max(total, 1e-8), "REPLACE")

    def transfer_skirt_skin_weights(self, obj: Any, z_waist: float, z_hem: float) -> None:
        """스커트/코트 자락용 부드러운 골반→양다리 블렌드 스킨 웨이트 (다리 사이 찢어짐 방지)."""
        vg_hips = obj.vertex_groups.new(name="mixamorig:Hips")
        vg_spine = obj.vertex_groups.new(name="mixamorig:Spine")
        vg_lleg = obj.vertex_groups.new(name="mixamorig:LeftUpLeg")
        vg_rleg = obj.vertex_groups.new(name="mixamorig:RightUpLeg")
        span = max(z_waist - z_hem, 0.05)
        for vi, v in enumerate(obj.data.vertices):
            t_down = min(max((z_waist - v.co.z) / span, 0.0), 1.0)
            if t_down < 0.22:
                w_sp = 0.25 * (1.0 - t_down / 0.22)
                vg_hips.add([vi], 1.0 - w_sp, "REPLACE")
                if w_sp > 0.01:
                    vg_spine.add([vi], w_sp, "REPLACE")
            else:
                leg_share = 0.62 * min(max((t_down - 0.18) / 0.62, 0.0), 1.0)
                w_hips = 1.0 - leg_share
                side_t = 0.5 + 0.5 * math.tanh(v.co.x / 0.045)
                w_l = leg_share * side_t
                w_r = leg_share * (1.0 - side_t)
                vg_hips.add([vi], w_hips, "REPLACE")
                if w_l > 1e-3:
                    vg_lleg.add([vi], w_l, "REPLACE")
                if w_r > 1e-3:
                    vg_rleg.add([vi], w_r, "REPLACE")

    def tuck_covered_body_regions(self, z_min: float, z_max: float, *, include_legs: bool = False, include_feet: bool = True, tuck_m: float = 0.0025) -> None:
        """불투명 의상/신발 아래 완전히 가려진 몸통/발 정점을 법선 안쪽으로 살짝 넣어 관통 0건 보장(목 이음매·손·얼굴 절대 불변)."""
        plan = self.plan
        z_neck_guard = plan.z_neck_base - 0.025
        for vi, v in enumerate(self.body_obj.data.vertices):
            z = float(v.co.z)
            if z > z_neck_guard:
                continue
            if include_feet and z < plan.z_ankle * 0.85:
                # 신발 내부 발 정점을 살짝 안쪽/위로 밀어 신발 밑창 관통 방지 (전체 아바타 접지는 신발 밑창 Z=0 유지)
                v.co.z = max(v.co.z, 0.0035)
                n = v.normal
                v.co.x -= n.x * 0.0020
                v.co.y -= n.y * 0.0020
                continue
            if self.body_is_arm[vi]:
                continue
            if not include_legs and z < plan.z_crotch - 0.01:
                continue
            if z_min <= z <= z_max:
                n = v.normal
                v.co.x -= n.x * tuck_m
                v.co.y -= n.y * tuck_m
        self.body_obj.data.update()


# ---------------------------------------------------------------------------
# SpringBone 보조 본 체인 추가기
# ---------------------------------------------------------------------------


@dataclass
class SpringChainSpec:
    name: str
    parent_bone: str
    points_b: list[tuple[float, float, float]]  # Blender 좌표계(3~5점 → 2~4본)
    hit_radius: float = 0.032
    stiffness: float = 0.65
    drag_force: float = 0.45
    gravity_power: float = 0.25


def add_spring_bone_chains(arm: Any, chains: list[SpringChainSpec]) -> dict[str, list[str]]:
    """Armature EDIT 모드에서 SpringBone 보조 본 체인을 생성하고 체인별 본 이름 목록을 반환한다."""
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
        # 끝 가상 팁 본(VRM 1.0 SpringBone 마지막 관절 꼬리 역할)
        tip_name = f"SB_{ch.name}_End"
        eb_end = arm.data.edit_bones.new(tip_name)
        last_dir = Vector(pts[-1]) - Vector(pts[-2])
        if last_dir.length < 1e-4:
            last_dir = Vector((0.0, 0.0, -0.04))
        else:
            last_dir = last_dir.normalized() * 0.04
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
    """VRM 1.0 VRMC_springBone 콜라이더·그룹·조인트 설정 (모든 joint `hitRadius > 0`, 중력 Blender -Z → glTF -Y)."""
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
            # 끝으로 갈수록 부드럽게 흔들리되 모든 joint hitRadius > 0 보장
            t = idx / max(len(bnames) - 1, 1)
            j.hit_radius = max(0.018, float(ch.hit_radius * (1.0 - 0.25 * t)))
            j.stiffness = max(0.25, float(ch.stiffness * (1.0 - 0.20 * t)))
            j.drag_force = float(ch.drag_force)
            j.gravity_power = float(ch.gravity_power)
            # 중요: Blender VRM Add-on 4.5.0은 Blender 좌표(0, 0, -1)를 glTF (0, -1, 0)으로 변환!
            j.gravity_dir = (0.0, 0.0, -1.0)
        cgref = sp.add_collider_group()
        cgref.collider_group_uuid = cg.uuid


# ---------------------------------------------------------------------------
# 3계층 웹툰 헤어 빌더 (두피 볼륨 캡 + 아몬드 청크 가닥 + SpringBone 스키닝)
# ---------------------------------------------------------------------------


def _build_scalp_dome(bm: bmesh.types.BMesh, uv_layer: Any, plan: bb2.ArchetypePlan, *, volume_boost: float = 0.012) -> list[bmesh.types.BMVert]:
    """두상 상부를 완전히 감싸 피부 비침을 차단하는 수밀 두피 볼륨 캡."""
    s = plan.spec
    hc_y = 0.010
    z_base = plan.z_eye + plan.head_h * 0.02
    z_top = plan.z_crown + volume_boost + 0.010
    n_rings = 9
    n_seg = 28
    rings = np.zeros((n_rings, n_seg, 3), dtype=np.float64)
    angles = np.linspace(0.0, 2.0 * math.pi, n_seg, endpoint=False)

    for i in range(n_rings):
        t = i / (n_rings - 1)  # 0=헤어라인, 1=정수리 부근
        phi = (1.0 - t) * (math.pi * 0.52) + t * 0.10
        sin_p = math.sin(phi)
        cos_p = math.cos(phi)
        rx = (s.head_w + volume_boost) * sin_p
        ry = (s.head_d + volume_boost) * sin_p
        for j, a in enumerate(angles):
            # 앞쪽 이마 헤어라인은 눈썹 위까지 높게, 뒤통수는 목덜미 쪽으로 자연스럽게 내림
            front_lift = max(0.0, math.cos(a)) * (1.0 - t) * (plan.head_h * 0.16)
            back_drop = max(0.0, -math.cos(a)) * (1.0 - t) * (plan.head_h * 0.24)
            z = z_base + (z_top - z_base) * (0.28 + 0.72 * cos_p) + front_lift - back_drop
            rings[i, j, 0] = rx * math.sin(a)
            rings[i, j, 1] = hc_y - ry * math.cos(a)
            rings[i, j, 2] = z

    return _add_thick_loft_shell(bm, uv_layer, rings, thickness=0.005, close_bottom=True, close_top=True)


def build_hero_hair(
    spec: HeroAvatarSpec,
    sampler: BaseBodySampler,
    arm: Any,
    mat_hair: Any,
    mat_accent: Any,
) -> tuple[list[Any], list[SpringChainSpec], dict[str, list[str]]]:
    """장르별 3계층 웹툰 헤어(수밀 청크 가닥 + 두피 캡 + 헤어 부속 + SpringBone 체인)를 조형한다."""
    plan = sampler.plan
    s = plan.spec
    hc = np.array([0.0, 0.010, plan.z_eye + plan.head_h * 0.06], dtype=np.float64)
    rw = s.head_w + 0.014
    rd = s.head_d + 0.014
    hh = plan.head_h
    z_crown = plan.z_crown + 0.012
    z_eye = plan.z_eye
    z_chin = plan.z_chin
    z_sh = plan.z_shoulder

    # 1) 스타일별 SpringBone 체인 설계
    chains: list[SpringChainSpec] = []
    style = spec.hair_style
    if style == "romance-long":
        for name, x_off, y_off, z_end in (
            ("HairBackC", 0.0, rd + 0.020, plan.z_waist + 0.03),
            ("HairBackL", rw * 0.62, rd + 0.010, plan.z_waist + 0.06),
            ("HairBackR", -rw * 0.62, rd + 0.010, plan.z_waist + 0.06),
            ("HairSideL", rw * 0.98, -0.020, plan.z_chest + 0.01),
            ("HairSideR", -rw * 0.98, -0.020, plan.z_chest + 0.01),
        ):
            z0 = z_eye + hh * 0.12
            pts = [
                (x_off, y_off, z0),
                (x_off * 1.06, y_off + 0.010, z0 * 0.65 + z_end * 0.35),
                (x_off * 1.10, y_off + 0.014, z0 * 0.30 + z_end * 0.70),
                (x_off * 1.08, y_off + 0.008, z_end),
            ]
            chains.append(SpringChainSpec(name, "mixamorig:Head", pts, hit_radius=0.034, stiffness=0.55, drag_force=0.42, gravity_power=0.30))
    elif style == "soft-bob":
        for name, x_sign in (("HairSideL", 1.0), ("HairSideR", -1.0)):
            pts = [
                (x_sign * rw * 0.95, -0.005, z_eye + hh * 0.10),
                (x_sign * rw * 1.04, -0.006, z_eye - hh * 0.18),
                (x_sign * rw * 0.88, -0.014, z_chin - 0.015),
            ]
            chains.append(SpringChainSpec(name, "mixamorig:Head", pts, hit_radius=0.028, stiffness=0.80, drag_force=0.45, gravity_power=0.22))
    elif style == "braided-crown":
        for name, x_sign in (("HairCurlL", 1.0), ("HairCurlR", -1.0)):
            pts = [
                (x_sign * rw * 0.96, 0.015, z_eye + hh * 0.04),
                (x_sign * rw * 1.08, 0.002, z_chin - 0.03),
                (x_sign * rw * 1.12, -0.016, plan.z_chest + 0.04),
                (x_sign * rw * 1.05, -0.020, plan.z_chest - 0.07),
            ]
            chains.append(SpringChainSpec(name, "mixamorig:Head", pts, hit_radius=0.032, stiffness=0.60, drag_force=0.42, gravity_power=0.28))
    elif style == "twin-tail":
        for name, x_sign in (("TwinTailL", 1.0), ("TwinTailR", -1.0)):
            pts = [
                (x_sign * (rw + 0.022), 0.035, z_eye + hh * 0.24),
                (x_sign * (rw + 0.085), 0.055, z_eye + hh * 0.06),
                (x_sign * (rw + 0.115), 0.065, z_chin - 0.05),
                (x_sign * (rw + 0.095), 0.060, plan.z_waist + 0.02),
            ]
            chains.append(SpringChainSpec(name, "mixamorig:Head", pts, hit_radius=0.038, stiffness=0.48, drag_force=0.38, gravity_power=0.35))
    elif style in ("comma-hair", "dandy-two-block"):
        for name, x_off in (("HairBangL", rw * 0.34), ("HairBangR", -rw * 0.34)):
            pts = [
                (x_off, -rd * 0.92, z_crown - hh * 0.10),
                (x_off * 0.92, -rd * 1.06, z_eye + hh * 0.14),
                (x_off * 0.72, -rd * 1.02, z_eye + hh * 0.01),
            ]
            chains.append(SpringChainSpec(name, "mixamorig:Head", pts, hit_radius=0.022, stiffness=0.95, drag_force=0.50, gravity_power=0.16))
    elif style == "slicked-back-duke":
        pts = [
            (rw * 0.18, -rd * 0.92, z_crown - hh * 0.08),
            (rw * 0.14, -rd * 1.08, z_eye + hh * 0.14),
            (rw * 0.06, -rd * 1.04, z_eye - hh * 0.02),
        ]
        chains.append(SpringChainSpec("HairDukeLock", "mixamorig:Head", pts, hit_radius=0.020, stiffness=0.90, drag_force=0.48, gravity_power=0.18))
    elif style == "wolf-layered":
        for name, x_off, y_off, z_end in (
            ("HairMulletL", rw * 0.52, rd + 0.016, z_sh - 0.03),
            ("HairMulletR", -rw * 0.52, rd + 0.016, z_sh - 0.03),
            ("HairSideL", rw * 0.96, -0.015, z_chin - 0.03),
            ("HairSideR", -rw * 0.96, -0.015, z_chin - 0.03),
        ):
            pts = [
                (x_off, y_off, z_eye + hh * 0.06),
                (x_off * 1.08, y_off + 0.010, z_chin),
                (x_off * 1.14, y_off + 0.008, z_end),
            ]
            chains.append(SpringChainSpec(name, "mixamorig:Head", pts, hit_radius=0.028, stiffness=0.75, drag_force=0.45, gravity_power=0.22))

    # SpringBone 본을 먼저 Armature에 추가해야 스키닝 가능
    chain_bones = add_spring_bone_chains(arm, chains)

    # 2) 헤어 본체 메쉬 구축
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    scalp_verts = _build_scalp_dome(bm, uv_layer, plan, volume_boost=0.014 if style != "slicked-back-duke" else 0.011)

    # 정점별 (chain_name, t_along) 매핑 기록
    vert_chain_tag: dict[int, tuple[str | None, float]] = {}

    def add_strand(
        pts_list: list[tuple[float, float, float]],
        w_root: float,
        w_mid: float,
        w_tip: float,
        th_scale: float = 0.52,
        chain_name: str | None = None,
        crescent: float = 0.24,
    ) -> None:
        arr = np.array(pts_list, dtype=np.float64)
        # 제어점을 매끄럽게 9~11 세그먼트로 보간
        t_in = np.linspace(0.0, 1.0, len(arr))
        n_out = max(8, len(arr) * 2 + 1)
        t_out = np.linspace(0.0, 1.0, n_out)
        smooth = np.stack([np.interp(t_out, t_in, arr[:, d]) for d in range(3)], axis=1)
        # 부드러운 Laplacian 2회로 꺾임 제거 (양 끝 고정)
        for _ in range(2):
            smooth[1:-1] = 0.25 * smooth[:-2] + 0.50 * smooth[1:-1] + 0.25 * smooth[2:]
        smooth = sampler.push_outside_head_body(smooth, clearance=0.0055)
        widths = np.where(
            t_out < 0.45,
            w_root + (w_mid - w_root) * (t_out / 0.45),
            w_mid + (w_tip - w_mid) * ((t_out - 0.45) / 0.55),
        )
        thicknesses = widths * th_scale
        vts = _add_tapered_strand(bm, uv_layer, smooth, widths, thicknesses, n_profile=8, crescent=crescent, head_center=hc)
        for v, tf in vts:
            vert_chain_tag[id(v)] = (chain_name, tf)

    # 공통 앞머리(스타일별 개성, 관자놀이까지 매끄럽게 감싸 빈틈 제거)
    if style in ("romance-long", "soft-bob", "twin-tail"):
        n_bangs = 9 if style != "twin-tail" else 11
        for bi in range(n_bangs):
            frac = (bi / (n_bangs - 1)) * 2.0 - 1.0  # -1..+1
            ang = frac * (1.18 if style == "twin-tail" else 1.06)
            x0 = math.sin(ang) * rw * 0.35
            x1 = math.sin(ang) * rw * 0.98
            y0 = hc[1] - math.cos(ang) * rd * 0.48
            y1 = hc[1] - math.cos(ang) * (rd + 0.015)
            z_tip = z_eye + hh * (0.045 + 0.025 * abs(frac) - (0.04 if style == "twin-tail" else 0.0))
            pts = [
                (x0, y0, z_crown + 0.008),
                (x1 * 0.84, y1 - 0.008, z_crown - hh * 0.15),
                (x1 * 1.02, y1 - 0.004, z_eye + hh * 0.15),
                (x1 * 0.96, y1 + 0.004, z_tip),
            ]
            w_b = hh * (0.16 if style != "twin-tail" else 0.22)
            add_strand(pts, w_b * 0.72, w_b, w_b * 0.24, th_scale=0.45)
        if style == "twin-tail":
            # SD 치비 관자놀이·볼 감싸는 옆머리 가닥 보강
            for sign in (1.0, -1.0):
                for ang_side in (1.18, 1.48):
                    sx = sign * math.sin(ang_side)
                    sy = -math.cos(ang_side)
                    pts = [
                        (sx * rw * 0.32, hc[1] + sy * rd * 0.32, z_crown + 0.006),
                        (sx * rw * 0.86, hc[1] + sy * rd * 0.86, z_crown - hh * 0.14),
                        (sx * (rw + 0.014), hc[1] + sy * (rd + 0.014), z_eye - hh * 0.02),
                        (sx * (rw * 0.96), hc[1] + sy * (rd * 0.96), z_chin - 0.005),
                    ]
                    add_strand(pts, hh * 0.18, hh * 0.22, hh * 0.08, th_scale=0.52)
    elif style in ("comma-hair", "dandy-two-block", "wolf-layered"):
        # 남성 7:3 / 6:4 가닥 앞머리 + 쉼표 컬 (관자놀이까지 깔끔히 커버)
        n_bangs = 10
        part_x = rw * (0.28 if style == "comma-hair" else 0.18)
        for bi in range(n_bangs):
            frac = (bi / (n_bangs - 1)) * 2.0 - 1.0
            ang = frac * 1.20
            x1 = math.sin(ang) * rw * 0.99
            y1 = hc[1] - math.cos(ang) * (rd + 0.015)
            curl_in = (-0.018 * math.copysign(1.0, frac)) if style == "comma-hair" else (0.006 * frac)
            z_tip = z_eye + hh * (0.025 + 0.025 * abs(frac))
            pts = [
                (part_x, hc[1] - rd * 0.35, z_crown + 0.012),
                (x1 * 0.78, y1 - 0.014, z_crown - hh * 0.12),
                (x1 * 1.03, y1 - 0.009, z_eye + hh * 0.14),
                (x1 * 0.92 + curl_in, y1 + 0.002, z_tip),
            ]
            ch_name = ("HairBangL" if frac >= 0 else "HairBangR") if style in ("comma-hair", "dandy-two-block") else None
            add_strand(pts, hh * 0.15, hh * 0.18, hh * 0.04, th_scale=0.52, chain_name=ch_name)
    elif style == "slicked-back-duke":
        # 뒤로 넘긴 볼륨 웨이브 + 포인트 잔머리 1가닥
        for bi in range(7):
            frac = (bi / 6.0) * 2.0 - 1.0
            ang = frac * 0.95
            x_f = math.sin(ang) * rw * 0.82
            pts = [
                (x_f * 0.75, hc[1] - rd * 0.88, z_eye + hh * 0.28),
                (x_f * 0.95, hc[1] - rd * 0.65, z_crown + 0.024),
                (x_f * 1.02, hc[1] + rd * 0.25, z_crown + 0.014),
                (x_f * 0.92, hc[1] + rd * 1.06, z_eye + hh * 0.08),
                (x_f * 0.78, hc[1] + rd * 1.02, z_chin - 0.02),
            ]
            add_strand(pts, hh * 0.16, hh * 0.20, hh * 0.08, th_scale=0.50)
        # 포인트 내려온 잔머리
        add_strand(
            [
                (rw * 0.22, hc[1] - rd * 0.82, z_crown - hh * 0.06),
                (rw * 0.20, hc[1] - rd * 1.12, z_eye + hh * 0.18),
                (rw * 0.12, hc[1] - rd * 1.10, z_eye + hh * 0.02),
                (rw * 0.04, hc[1] - rd * 1.02, z_eye - hh * 0.08),
            ],
            hh * 0.06,
            hh * 0.075,
            hh * 0.018,
            th_scale=0.55,
            chain_name="HairDukeLock",
        )
    elif style == "braided-crown":
        # 로판 우아한 5:5 커튼 뱅 + 정수리 브레이드 링 + 뒷머리 번 + 양쪽 롱 컬
        for sign in (1.0, -1.0):
            for k_i in range(3):
                off = k_i * 0.22
                pts = [
                    (sign * rw * 0.08, hc[1] - rd * 0.50, z_crown + 0.010),
                    (sign * rw * (0.52 + off), hc[1] - rd * (1.04 - off * 0.35), z_eye + hh * 0.22),
                    (sign * rw * (0.98 + off * 0.14), hc[1] - rd * (0.72 - off * 0.45), z_eye - hh * 0.02),
                    (sign * rw * 1.02, hc[1] + rd * 0.10, z_chin - 0.01),
                ]
                add_strand(pts, hh * 0.12, hh * 0.16, hh * 0.04, th_scale=0.48)
        # 땋은 머리 크라운 밴드(16구슬 꼬임 토러스)
        for bi in range(18):
            ang = -math.pi * 0.62 + (bi / 17.0) * math.pi * 1.24
            bx = math.sin(ang) * (rw + 0.010)
            by = hc[1] - math.cos(ang) * (rd + 0.010)
            bz = z_crown - hh * 0.12 + 0.010 * math.cos(ang * 1.2)
            _add_uv_sphere_solid(bm, uv_layer, (bx, by, bz), (0.016, 0.016, 0.014), u_seg=10, v_seg=6)
        # 뒷머리 귀족 업스타일 번
        _add_uv_sphere_solid(bm, uv_layer, (0.0, hc[1] + rd + 0.022, z_eye + hh * 0.10), (rw * 0.56, 0.048, hh * 0.24), u_seg=16, v_seg=10)
        # 어깨 앞으로 흘러내리는 로판 롱 컬 2가닥(SpringBone)
        for sign, cname in ((1.0, "HairCurlL"), (-1.0, "HairCurlR")):
            for sub in (-0.016, 0.016):
                pts = [
                    (sign * rw * 0.90, hc[1] + 0.018 + sub, z_eye + hh * 0.08),
                    (sign * (rw + 0.024), hc[1] + 0.008 + sub, z_chin - 0.02),
                    (sign * (rw + 0.032), hc[1] - 0.016 + sub * 0.6, plan.z_chest + 0.06),
                    (sign * (rw + 0.016), hc[1] - 0.028 + sub * 0.4, plan.z_chest - 0.04),
                    (sign * (rw + 0.026), hc[1] - 0.012, plan.z_chest - 0.10),
                ]
                add_strand(pts, hh * 0.13, hh * 0.16, hh * 0.045, th_scale=0.62, chain_name=cname)

    # 스타일별 측면·뒷머리 볼륨 청크 (정수리 돔 곡선을 부드럽게 타고 흘러 각진 모서리 제거)
    if style == "romance-long":
        # 등 허리까지 흐르는 S컬 롱 헤어 13가닥 + 페이스 프레이밍 옆머리
        for i in range(13):
            frac = (i / 12.0) * 2.0 - 1.0  # -1..+1
            ang = math.pi + frac * 1.32
            sx = math.sin(ang)
            sy = -math.cos(ang)
            wave = 0.015 * math.sin(i * 1.4)
            z_end = plan.z_waist + 0.02 + 0.045 * abs(frac)
            pts = [
                (sx * rw * 0.25, hc[1] + sy * rd * 0.25, z_crown + 0.010),
                (sx * rw * 0.78, hc[1] + sy * rd * 0.78, z_crown - hh * 0.14),
                (sx * (rw + 0.012), hc[1] + sy * (rd + 0.014), z_eye + hh * 0.04),
                (sx * (rw + 0.022) + wave, hc[1] + sy * (rd + 0.026), z_chin - 0.03),
                (sx * (rw + 0.036) - wave, hc[1] + sy * (rd + 0.038), plan.z_chest),
                (sx * (rw + 0.030) + wave, hc[1] + sy * (rd + 0.032), z_end),
            ]
            cname = "HairBackC" if abs(frac) < 0.35 else ("HairBackL" if sx > 0 else "HairBackR")
            add_strand(pts, hh * 0.17, hh * 0.23, hh * 0.07, th_scale=0.50, chain_name=cname)
        for sign, cname in ((1.0, "HairSideL"), (-1.0, "HairSideR")):
            pts = [
                (sign * rw * 0.35, hc[1] - rd * 0.20, z_crown + 0.004),
                (sign * rw * 0.85, hc[1] - rd * 0.36, z_crown - hh * 0.16),
                (sign * (rw + 0.010), hc[1] - rd * 0.42, z_eye - hh * 0.06),
                (sign * (rw + 0.014), hc[1] - rd * 0.30, z_chin - 0.04),
                (sign * (rw + 0.010), hc[1] - rd * 0.22, plan.z_chest + 0.02),
            ]
            add_strand(pts, hh * 0.13, hh * 0.15, hh * 0.035, th_scale=0.48, chain_name=cname)
    elif style == "soft-bob":
        # 턱선 C컬 안쪽 말림 보브 12가닥
        for i in range(12):
            frac = (i / 11.0) * 2.0 - 1.0
            ang = math.pi + frac * 1.42
            sx = math.sin(ang)
            sy = -math.cos(ang)
            pts = [
                (sx * rw * 0.24, hc[1] + sy * rd * 0.24, z_crown + 0.009),
                (sx * rw * 0.78, hc[1] + sy * rd * 0.78, z_crown - hh * 0.14),
                (sx * (rw + 0.014), hc[1] + sy * (rd + 0.014), z_eye + hh * 0.02),
                (sx * (rw + 0.018), hc[1] + sy * (rd + 0.016), z_chin + 0.025),
                (sx * (rw * 0.84), hc[1] + sy * (rd * 0.86), z_chin - 0.020),
            ]
            cname = ("HairSideL" if sx > 0 else "HairSideR") if abs(frac) > 0.55 else None
            add_strand(pts, hh * 0.18, hh * 0.22, hh * 0.10, th_scale=0.52, chain_name=cname)
    elif style in ("comma-hair", "dandy-two-block"):
        # 깔끔한 남성 투블럭/댄디 옆·뒷머리 (귀선~목선 위로 깔끔히 테이퍼)
        for i in range(11):
            frac = (i / 10.0) * 2.0 - 1.0
            ang = math.pi + frac * 1.48
            sx = math.sin(ang)
            sy = -math.cos(ang)
            z_end = (z_chin + hh * 0.14) if style == "dandy-two-block" else (z_chin + hh * 0.06)
            pts = [
                (sx * rw * 0.22, hc[1] + sy * rd * 0.22, z_crown + 0.010),
                (sx * rw * 0.78, hc[1] + sy * rd * 0.78, z_crown - hh * 0.13),
                (sx * (rw + 0.011), hc[1] + sy * (rd + 0.012), z_eye + hh * 0.04),
                (sx * (rw * 0.88), hc[1] + sy * (rd * 0.90), z_end),
            ]
            add_strand(pts, hh * 0.17, hh * 0.19, hh * 0.06, th_scale=0.48)
    elif style == "wolf-layered":
        # 날카로운 깃털형 옆머리 + 목선 멀릿
        for i in range(12):
            frac = (i / 11.0) * 2.0 - 1.0
            ang = math.pi + frac * 1.44
            sx = math.sin(ang)
            sy = -math.cos(ang)
            is_side = abs(frac) > 0.62
            z_end = (z_chin - 0.03) if is_side else (z_sh - 0.035)
            flare = 0.026 if not is_side else 0.018
            pts = [
                (sx * rw * 0.24, hc[1] + sy * rd * 0.24, z_crown + 0.012),
                (sx * rw * 0.80, hc[1] + sy * rd * 0.80, z_crown - hh * 0.13),
                (sx * (rw + 0.014), hc[1] + sy * (rd + 0.014), z_eye + hh * 0.02),
                (sx * (rw + 0.012), hc[1] + sy * (rd + 0.015), z_chin + 0.01),
                (sx * (rw + flare), hc[1] + sy * (rd + flare), z_end),
            ]
            cname = ("HairSideL" if sx > 0 else "HairSideR") if is_side else ("HairMulletL" if sx >= 0 else "HairMulletR")
            add_strand(pts, hh * 0.16, hh * 0.20, hh * 0.05, th_scale=0.50, chain_name=cname)
    elif style == "twin-tail":
        # 뒤통수 단정한 베이스 + 좌우 대형 트윈테일 컬(각 4청크)
        for i in range(9):
            frac = (i / 8.0) * 2.0 - 1.0
            ang = math.pi + frac * 1.30
            sx = math.sin(ang)
            sy = -math.cos(ang)
            pts = [
                (sx * rw * 0.25, hc[1] + sy * rd * 0.25, z_crown + 0.010),
                (sx * rw * 0.80, hc[1] + sy * rd * 0.80, z_crown - hh * 0.14),
                (sx * (rw + 0.014), hc[1] + sy * (rd + 0.014), z_eye + hh * 0.02),
                (sx * (rw * 0.85), hc[1] + sy * (rd * 0.85), z_chin + 0.01),
            ]
            add_strand(pts, hh * 0.19, hh * 0.21, hh * 0.09, th_scale=0.50)
        for sign, cname in ((1.0, "TwinTailL"), (-1.0, "TwinTailR")):
            root = np.array([sign * (rw + 0.018), hc[1] + 0.032, z_eye + hh * 0.24])
            for k_t in range(4):
                theta_o = (k_t / 4.0) * 2.0 * math.pi
                ox = math.cos(theta_o) * 0.018
                oy = math.sin(theta_o) * 0.018
                pts = [
                    tuple(root),
                    (root[0] + sign * 0.068 + ox, root[1] + 0.018 + oy, root[2] + 0.015),
                    (root[0] + sign * 0.105 + ox * 1.4, root[1] + 0.035 + oy * 1.4, z_chin - 0.02),
                    (root[0] + sign * 0.088 + ox * 0.8, root[1] + 0.030 + oy * 0.8, plan.z_waist + 0.03),
                ]
                add_strand(pts, hh * 0.16, hh * 0.25, hh * 0.06, th_scale=0.68, chain_name=cname)

    # bmesh 정점 인덱스 기반 스키닝 전에 태그 맵을 순서 리스트로 고정
    bm.verts.ensure_lookup_table()
    v_tags: list[tuple[str | None, float]] = [vert_chain_tag.get(id(v), (None, 0.0)) for v in bm.verts]
    hair_obj = _finalize_mesh_object(bm, f"TS_HeroHair_{spec.hair_style}", mat_hair, arm)

    # 스키닝: 두피/고정 가닥 = mixamorig:Head 100%, SpringBone 가닥 = 체인 따라 부드럽게 블렌드
    vg_head = hair_obj.vertex_groups.new(name="mixamorig:Head")
    vg_cache: dict[str, Any] = {"mixamorig:Head": vg_head}

    def get_vg(name: str) -> Any:
        if name not in vg_cache:
            vg_cache[name] = hair_obj.vertex_groups.new(name=name)
        return vg_cache[name]

    for vi, (cname, tf) in enumerate(v_tags):
        if cname is None or tf < 0.20 or cname not in chain_bones:
            vg_head.add([vi], 1.0, "REPLACE")
            continue
        bnames = chain_bones[cname][:-1]  # _End 제외 실제 변형 본들
        if not bnames:
            vg_head.add([vi], 1.0, "REPLACE")
            continue
        # tf in [0.20, 1.0] → Head에서 체인 본 0..K-1로 매끄럽게 전이
        u = (tf - 0.20) / 0.80
        f_idx = u * len(bnames)
        i0 = int(math.floor(f_idx))
        frac = f_idx - i0
        if i0 == 0:
            w_h = 1.0 - frac
            w_b = frac
            if w_h > 1e-3:
                vg_head.add([vi], w_h, "REPLACE")
            if w_b > 1e-3:
                get_vg(bnames[0]).add([vi], w_b, "REPLACE")
        elif i0 >= len(bnames):
            get_vg(bnames[-1]).add([vi], 1.0, "REPLACE")
        else:
            w0 = 1.0 - frac
            w1 = frac
            if w0 > 1e-3:
                get_vg(bnames[i0 - 1]).add([vi], w0, "REPLACE")
            if w1 > 1e-3:
                get_vg(bnames[i0]).add([vi], w1, "REPLACE")

    objs = [hair_obj]

    # 3) 헤어 액세서리 (로판 티아라 / 치비 트윈테일 리본+별핀)
    if style == "braided-crown":
        bm_acc = bmesh.new()
        uv_acc = bm_acc.loops.layers.uv.new("UVMap")
        # 왕관 아치 띠 + 5개 스파이크 + 중앙 보석
        n_arc = 15
        for i in range(n_arc):
            ang = -1.05 + (i / (n_arc - 1)) * 2.10
            ax = math.sin(ang) * (rw + 0.013)
            ay = hc[1] - math.cos(ang) * (rd + 0.013)
            az = z_crown - hh * 0.08 + 0.012 * math.cos(ang * 1.4)
            _add_beveled_box(bm_acc, uv_acc, (ax, ay, az), (0.016, 0.008, 0.010), (0.0, 0.0, ang), bevel_w=0.0015)
            if i in (3, 5, 7, 9, 11):
                sp_h = 0.036 if i == 7 else (0.025 if i in (5, 9) else 0.017)
                _add_beveled_box(bm_acc, uv_acc, (ax, ay - 0.002, az + sp_h * 0.55), (0.009, 0.006, sp_h), (0.0, 0.0, ang), bevel_w=0.0015)
                _add_uv_sphere_solid(bm_acc, uv_acc, (ax, ay - 0.005, az + sp_h * 0.85), (0.0055, 0.0045, 0.0065), u_seg=10, v_seg=6)
        tiara_obj = _finalize_mesh_object(bm_acc, "TS_HeroAccessory_Tiara", mat_accent, arm)
        sampler.transfer_body_skin_weights(tiara_obj, force_bone="mixamorig:Head")
        objs.append(tiara_obj)
    elif style == "twin-tail":
        bm_acc = bmesh.new()
        uv_acc = bm_acc.loops.layers.uv.new("UVMap")
        for sign in (1.0, -1.0):
            rx = sign * (rw + 0.022)
            ry = hc[1] + 0.030
            rz = z_eye + hh * 0.25
            _add_uv_sphere_solid(bm_acc, uv_acc, (rx, ry, rz), (0.022, 0.020, 0.020), u_seg=12, v_seg=8)
            _add_beveled_box(bm_acc, uv_acc, (rx + sign * 0.012, ry - 0.010, rz + 0.022), (0.044, 0.014, 0.024), (0.2, -sign * 0.4, 0.0), bevel_w=0.003)
            _add_beveled_box(bm_acc, uv_acc, (rx + sign * 0.012, ry + 0.012, rz - 0.020), (0.044, 0.014, 0.024), (-0.2, sign * 0.4, 0.0), bevel_w=0.003)
        # 앞머리 왼쪽 트윈 바 헤어핀(앞머리에 밀착 배치)
        _add_beveled_box(bm_acc, uv_acc, (rw * 0.56, hc[1] - rd - 0.009, z_eye + hh * 0.25), (0.040, 0.006, 0.008), (0.0, 0.20, -0.45), bevel_w=0.0015)
        _add_beveled_box(bm_acc, uv_acc, (rw * 0.58, hc[1] - rd - 0.008, z_eye + hh * 0.22), (0.036, 0.006, 0.007), (0.0, 0.22, -0.42), bevel_w=0.0015)
        acc_obj = _finalize_mesh_object(bm_acc, "TS_HeroAccessory_HairRibbon", mat_accent, arm)
        sampler.transfer_body_skin_weights(acc_obj, force_bone="mixamorig:Head")
        objs.append(acc_obj)

    return objs, chains, chain_bones


# ---------------------------------------------------------------------------
# 장르별 다채널 의상 + 신발 + 소품 빌더 (0-결함 수밀 폐곡면)
# ---------------------------------------------------------------------------


def _build_sleeves_bmesh(
    bm: bmesh.types.BMesh,
    uv_layer: Any,
    sampler: BaseBodySampler,
    *,
    length_frac: float = 0.88,
    ease: float = 0.010,
    puff_shoulder: float = 0.0,
    cuff_flare: float = 0.0,
) -> None:
    """양쪽 팔 소매(어깨 델토이드 중첩 ~ 손목 전)를 수밀 폐곡면 셸로 생성한다."""
    plan = sampler.plan
    for sign in (1.0, -1.0):
        # 어깨 안쪽까지 넉넉히 중첩시켜 몸통-소매 틈 0mm 보장
        x_sh = sign * (plan.spec.shoulder_half_w * 0.66)
        x_hand = float(plan.joints_b[f"mixamorig:{'Left' if sign > 0 else 'Right'}Hand"][0])
        x_end = x_sh + (x_hand - x_sh) * length_frac
        n_rings = 11
        n_seg = 22
        rings = np.zeros((n_rings, n_seg, 3), dtype=np.float64)
        for i in range(n_rings):
            t = i / (n_rings - 1)
            x = x_sh + (x_end - x_sh) * t
            extra = puff_shoulder * math.sin(min(t * 2.2, 1.0) * math.pi) if t < 0.45 else 0.0
            if t < 0.16:
                # 어깨 캡 볼륨을 쇄골 라인에 매끄럽게 밀착
                extra += 0.008 * (1.0 - t / 0.16)
            if t > 0.80:
                extra += cuff_flare * ((t - 0.80) / 0.20)
            rings[i] = sampler.sample_arm_ring(sign, x, n_seg=n_seg, ease=ease, extra_r=extra)
        _add_thick_loft_shell(bm, uv_layer, rings, thickness=0.004)


def _build_shoes_object(
    name: str,
    sampler: BaseBodySampler,
    arm: Any,
    mat_shoe: Any,
    *,
    boot_height_frac: float = 0.0,
    chunky: float = 0.0,
) -> Any:
    """바닥 Z=0.0000m에 정확히 접지하는 수밀 로퍼/스니커즈/부츠."""
    plan = sampler.plan
    s = plan.spec
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    z_ankle = plan.z_ankle
    z_top = z_ankle * (1.28 if boot_height_frac <= 0.0 else (1.4 + boot_height_frac * (plan.z_knee - z_ankle) / max(z_ankle, 0.02)))
    hip_x = s.hip_rx * 0.46
    sole_w = s.foot_w * (1.26 + chunky * 0.16)
    sole_l_front = s.foot_len * (1.06 + chunky * 0.06)
    sole_l_back = s.foot_len * 0.28

    for sign in (1.0, -1.0):
        # 1) 신발 발등+밑창 솔리드 (Z=0.0000 ~ z_ankle*1.12)
        n_z = 8
        n_seg = 24
        rings = np.zeros((n_z, n_seg, 3), dtype=np.float64)
        angles = np.linspace(0.0, 2.0 * math.pi, n_seg, endpoint=False)
        xc = sign * hip_x * 0.92
        for i in range(n_z):
            t = i / (n_z - 1)
            z = t * (z_ankle * 1.08)
            # 밑창(t=0..0.22)은 넓고 평탄, 발등(t>0.3)은 발목 쪽으로 좁아짐
            taper_f = 1.0 if t < 0.28 else (1.0 - 0.62 * ((t - 0.28) / 0.72) ** 1.25)
            taper_w = 1.0 if t < 0.25 else (1.0 - 0.28 * ((t - 0.25) / 0.75))
            l_f = sole_l_front * taper_f
            l_b = sole_l_back * (1.0 - 0.15 * t)
            w_h = sole_w * taper_w
            for j, a in enumerate(angles):
                sx = math.sin(a)
                cf = math.cos(a)  # +1 앞(-Y), -1 뒤(+Y)
                y = -cf * l_f if cf >= 0 else -cf * l_b
                rings[i, j, 0] = xc + sx * w_h
                rings[i, j, 1] = y + 0.008
                rings[i, j, 2] = z
        _add_thick_loft_shell(bm, uv_layer, rings, thickness=0.004, close_bottom=True, close_top=True)

        # 2) 부츠 샤프트(필요 시)
        if boot_height_frac > 0.05:
            n_b = 7
            b_rings = np.zeros((n_b, 24, 3), dtype=np.float64)
            for i in range(n_b):
                t = i / (n_b - 1)
                z = z_ankle * 0.88 + (z_top - z_ankle * 0.88) * t
                b_rings[i] = sampler.sample_leg_ring(sign, z, n_seg=24, ease=0.011 + 0.004 * t)
            _add_thick_loft_shell(bm, uv_layer, b_rings, thickness=0.0045)

    shoe_obj = _finalize_mesh_object(bm, name, mat_shoe, arm)
    sampler.transfer_body_skin_weights(shoe_obj, k_neighbors=3)
    return shoe_obj


def build_hero_wardrobe(
    spec: HeroAvatarSpec,
    sampler: BaseBodySampler,
    arm: Any,
    mats: dict[str, Any],
) -> tuple[list[Any], list[SpringChainSpec], dict[str, list[str]]]:
    """8종 히어로 장르별 다채널 의상 + 신발 + 소품 + 의상 SpringBone 체인을 구축한다."""
    plan = sampler.plan
    s = plan.spec
    style = spec.outfit_style
    objs: list[Any] = []
    cloth_chains: list[SpringChainSpec] = []

    z_neck_b = plan.z_neck_base
    z_sh = plan.z_shoulder
    z_chest = plan.z_chest
    z_waist = plan.z_waist
    z_hips = plan.z_hips
    z_crotch = plan.z_crotch
    z_knee = plan.z_knee
    z_ankle = plan.z_ankle

    # 1) 의상 SpringBone 체인 사전 생성 (망토 / 코트 자락 / 리본 / 후드 끈)
    if style == "rofan-imperial-cape":
        for cname, x_off in (("CapeL", s.shoulder_half_w * 0.92), ("CapeC", 0.0), ("CapeR", -s.shoulder_half_w * 0.92)):
            y0 = s.chest_ry + 0.045
            pts = [
                (x_off, y0, z_neck_b - 0.01),
                (x_off * 1.15, y0 + 0.035, z_waist + 0.04),
                (x_off * 1.28, y0 + 0.068, z_crotch - 0.05),
                (x_off * 1.38, y0 + 0.095, z_knee + 0.04),
            ]
            cloth_chains.append(SpringChainSpec(cname, "mixamorig:Spine2", pts, hit_radius=0.040, stiffness=0.45, drag_force=0.40, gravity_power=0.35))
    elif style == "rofan-corset-gown":
        for cname, x_sign in (("GownRibbonL", 1.0), ("GownRibbonR", -1.0)):
            y0 = s.hip_ry + 0.07
            pts = [
                (x_sign * 0.045, y0, z_waist - 0.01),
                (x_sign * 0.085, y0 + 0.06, z_hips - 0.03),
                (x_sign * 0.115, y0 + 0.11, z_crotch - 0.14),
            ]
            cloth_chains.append(SpringChainSpec(cname, "mixamorig:Hips", pts, hit_radius=0.032, stiffness=0.50, drag_force=0.42, gravity_power=0.30))
    elif style in ("office-coat-suit", "academy-blazer-slacks"):
        pts = [
            (0.0, -(s.chest_ry + 0.025), z_neck_b - 0.03),
            (0.0, -(s.chest_ry + 0.028), z_chest),
            (0.0, -(s.chest_ry + 0.026), z_waist + 0.05),
        ]
        cloth_chains.append(SpringChainSpec("NeckTie", "mixamorig:Spine2", pts, hit_radius=0.022, stiffness=0.85, drag_force=0.50, gravity_power=0.25))
    elif style == "academy-blazer-skirt":
        pts = [
            (0.0, -(s.chest_ry + 0.026), z_neck_b - 0.04),
            (0.0, -(s.chest_ry + 0.030), z_chest + 0.01),
            (0.0, -(s.chest_ry + 0.030), z_chest - 0.06),
        ]
        cloth_chains.append(SpringChainSpec("CollarRibbon", "mixamorig:Spine2", pts, hit_radius=0.022, stiffness=0.80, drag_force=0.48, gravity_power=0.25))
    elif style == "chibi-hoodie-shorts":
        for cname, x_sign in (("HoodStringL", 1.0), ("HoodStringR", -1.0)):
            pts = [
                (x_sign * 0.026, -(s.chest_ry + 0.028), z_neck_b - 0.01),
                (x_sign * 0.030, -(s.chest_ry + 0.032), z_chest - 0.02),
                (x_sign * 0.032, -(s.chest_ry + 0.030), z_waist + 0.02),
            ]
            cloth_chains.append(SpringChainSpec(cname, "mixamorig:Spine2", pts, hit_radius=0.018, stiffness=0.65, drag_force=0.42, gravity_power=0.32))
    elif style == "action-techwear-harness":
        pts = [
            (s.hip_rx + 0.022, 0.01, z_hips),
            (s.hip_rx + 0.034, 0.015, z_crotch - 0.05),
            (s.hip_rx + 0.038, 0.018, z_crotch - 0.16),
        ]
        cloth_chains.append(SpringChainSpec("TechStrap", "mixamorig:Hips", pts, hit_radius=0.022, stiffness=0.70, drag_force=0.45, gravity_power=0.30))

    cloth_chain_bones = add_spring_bone_chains(arm, cloth_chains) if cloth_chains else {}

    # 2) 상의(Inner + Top/Outer) 구축
    bm_top = bmesh.new()
    uv_top = bm_top.loops.layers.uv.new("UVMap")
    bm_trim = bmesh.new()
    uv_trim = bm_trim.loops.layers.uv.new("UVMap")
    bm_acc = bmesh.new()
    uv_acc = bm_acc.loops.layers.uv.new("UVMap")

    # 상의 높이 범위 & 여유 결정 (하의와 명확한 층간 간격으로 교차 0건 보장)
    if style == "rofan-corset-gown":
        z_top_lo = z_waist - 0.018
        z_top_hi = z_neck_b - 0.025
        top_ease = 0.0095
    elif style == "romance-cardigan-skirt":
        # 하이웨이스트 플리츠 스커트 안으로 깔끔히 넣은 니트 톱 (스커트가 위에서 감쌈)
        z_top_lo = z_waist - 0.020
        z_top_hi = z_neck_b + 0.004
        top_ease = 0.0105
    elif style in ("office-coat-suit", "rofan-imperial-cape"):
        z_top_lo = z_crotch - 0.14
        z_top_hi = z_neck_b + 0.010
        top_ease = 0.0175
    elif style in ("academy-blazer-skirt", "academy-blazer-slacks"):
        # 교복 블레이저: 스커트/슬랙스 허리 바깥을 넉넉히 덮음 (+7mm 층간 간격)
        z_top_lo = z_hips - 0.020
        z_top_hi = z_neck_b + 0.006
        top_ease = 0.0175
    elif style == "chibi-hoodie-shorts":
        z_top_lo = z_hips - 0.020
        z_top_hi = z_neck_b + 0.012
        top_ease = 0.0185
    else:
        z_top_lo = z_hips - 0.015
        z_top_hi = z_neck_b + 0.006
        top_ease = 0.0175

    n_tr = 12
    n_ts = 44
    torso_rings = np.zeros((n_tr, n_ts, 3), dtype=np.float64)
    for i in range(n_tr):
        t = i / (n_tr - 1)
        z = z_top_lo + (z_top_hi - z_top_lo) * t
        flare = 0.0
        if style in ("office-coat-suit", "rofan-imperial-cape") and z < z_waist:
            flare = 0.025 * ((z_waist - z) / max(z_waist - z_top_lo, 0.05))
        elif style == "chibi-hoodie-shorts" and t < 0.4:
            flare = 0.010 * (1.0 - t / 0.4)
        torso_rings[i] = sampler.sample_torso_ring(z, n_seg=n_ts, ease=top_ease, flare_x=flare, flare_y=flare * 0.85)
    _add_thick_loft_shell(bm_top, uv_top, torso_rings, thickness=0.005)

    # 소매
    if style == "rofan-corset-gown":
        _build_sleeves_bmesh(bm_trim, uv_trim, sampler, length_frac=0.40, ease=0.010, puff_shoulder=0.026)
    elif style == "chibi-hoodie-shorts":
        _build_sleeves_bmesh(bm_top, uv_top, sampler, length_frac=0.84, ease=0.016, cuff_flare=-0.004)
    else:
        _build_sleeves_bmesh(bm_top, uv_top, sampler, length_frac=0.90, ease=0.011, puff_shoulder=0.004 if "rofan" in style else 0.0)

    # 트림/칼라/셔츠/라펠/버튼/장식 디테일
    if style in ("academy-blazer-skirt", "academy-blazer-slacks", "office-coat-suit"):
        # 화이트 셔츠 스탠드 칼라 (상의 위 네크라인 바깥으로 깔끔히 돌출 — 교차 방지)
        collar_rings = np.stack([
            sampler.sample_torso_ring(z_neck_b - 0.008, n_seg=32, ease=top_ease + 0.004),
            sampler.sample_torso_ring(z_neck_b + 0.022, n_seg=32, ease=0.008),
        ], axis=0)
        _add_thick_loft_shell(bm_trim, uv_trim, collar_rings, thickness=0.0035)
        # V넥 라펠 좌/우 3D 입체 패널
        for sign in (1.0, -1.0):
            _add_beveled_box(
                bm_top,
                uv_top,
                (sign * s.chest_rx * 0.24, -(s.chest_ry + 0.018), z_chest + 0.028),
                (0.036, 0.009, (z_neck_b - z_chest) * 1.15),
                (0.08, sign * 0.24, -sign * 0.14),
                bevel_w=0.002,
            )
            # 라펠 파이핑(교복 화이트 트림)
            if "academy" in style:
                _add_beveled_box(
                    bm_trim,
                    uv_trim,
                    (sign * s.chest_rx * 0.30, -(s.chest_ry + 0.022), z_chest + 0.026),
                    (0.008, 0.007, (z_neck_b - z_chest) * 1.12),
                    (0.08, sign * 0.24, -sign * 0.14),
                    bevel_w=0.0015,
                )
        # 단추 3개 + 가슴 엠블럼/포켓
        for bi in range(3):
            bz = z_waist + 0.015 + bi * 0.048
            _add_uv_sphere_solid(bm_acc, uv_acc, (0.012, -(s.chest_ry + 0.020), bz), (0.0085, 0.005, 0.0085), u_seg=10, v_seg=6)
        # 넥타이 또는 리본 보우
        if style == "academy-blazer-skirt":
            _add_uv_sphere_solid(bm_acc, uv_acc, (0.0, -(s.chest_ry + 0.024), z_neck_b - 0.038), (0.014, 0.011, 0.013), u_seg=10, v_seg=6)
            for sign in (1.0, -1.0):
                _add_beveled_box(bm_acc, uv_acc, (sign * 0.034, -(s.chest_ry + 0.024), z_neck_b - 0.040), (0.042, 0.008, 0.024), (0.0, sign * 0.18, -sign * 0.16), bevel_w=0.002)
                _add_beveled_box(bm_acc, uv_acc, (sign * 0.016, -(s.chest_ry + 0.025), z_neck_b - 0.088), (0.020, 0.006, 0.068), (0.05, -sign * 0.12, 0.0), bevel_w=0.0015)
        else:
            _add_beveled_box(bm_acc, uv_acc, (0.0, -(s.chest_ry + 0.022), z_neck_b - 0.032), (0.024, 0.010, 0.022), (0.0, 0.0, 0.0), bevel_w=0.002)
            _add_beveled_box(bm_acc, uv_acc, (0.0, -(s.chest_ry + 0.024), z_chest - 0.02), (0.030, 0.008, max(0.14, z_neck_b - z_waist - 0.05)), (0.04, 0.0, 0.0), bevel_w=0.002)
    elif style == "romance-cardigan-skirt":
        # 아이보리 블라우스 칼라 + 단추 4개 (허리 위 톱 구간에만 배치해 스커트와 비중첩)
        collar_rings = np.stack([
            sampler.sample_torso_ring(z_neck_b - 0.006, n_seg=32, ease=top_ease + 0.004),
            sampler.sample_torso_ring(z_neck_b + 0.018, n_seg=32, ease=0.008),
        ], axis=0)
        _add_thick_loft_shell(bm_trim, uv_trim, collar_rings, thickness=0.0035)
        for bi in range(4):
            bz = z_waist + 0.042 + bi * 0.046
            _add_uv_sphere_solid(bm_acc, uv_acc, (0.0, -(s.chest_ry + 0.020), bz), (0.008, 0.005, 0.008), u_seg=10, v_seg=6)
    elif style == "rofan-corset-gown":
        # 골드 코르셋 트림 + 벨벳 초커 + 브로치 + 뒷리본
        choker_rings = np.stack([
            sampler.sample_torso_ring(plan.z_neck_cut - 0.020, n_seg=28, ease=0.003),
            sampler.sample_torso_ring(plan.z_neck_cut - 0.004, n_seg=28, ease=0.003),
        ], axis=0)
        _add_thick_loft_shell(bm_top, uv_top, choker_rings, thickness=0.0025)
        _add_uv_sphere_solid(bm_acc, uv_acc, (0.0, -(s.neck_ry + 0.008), plan.z_neck_cut - 0.012), (0.009, 0.006, 0.011), u_seg=10, v_seg=6)
        # 허리 골드 코르셋 벨트 + 브로치
        belt_rings = np.stack([
            sampler.sample_torso_ring(z_waist - 0.016, n_seg=40, ease=top_ease + 0.004),
            sampler.sample_torso_ring(z_waist + 0.016, n_seg=40, ease=top_ease + 0.004),
        ], axis=0)
        _add_thick_loft_shell(bm_acc, uv_acc, belt_rings, thickness=0.004)
        _add_uv_sphere_solid(bm_acc, uv_acc, (0.0, -(s.chest_ry + 0.028), z_chest + 0.025), (0.016, 0.009, 0.020), u_seg=12, v_seg=8)
    elif style == "rofan-imperial-cape":
        # 제국 스탠드 칼라 + 더블 골드 단추 6개 + 양쪽 골드 견장 + 숄더 망토
        collar_rings = np.stack([
            sampler.sample_torso_ring(z_neck_b - 0.010, n_seg=32, ease=0.012),
            sampler.sample_torso_ring(z_neck_b + 0.036, n_seg=32, ease=0.013),
        ], axis=0)
        _add_thick_loft_shell(bm_top, uv_top, collar_rings, thickness=0.0045)
        for sign in (1.0, -1.0):
            # 골드 견장
            _add_beveled_box(bm_acc, uv_acc, (sign * s.shoulder_half_w * 0.88, 0.005, z_sh + s.arm_r + 0.022), (0.095, 0.064, 0.018), (0.0, sign * 0.16, 0.0), bevel_w=0.004)
            # 더블 브레스티드 금단추
            for bi in range(4):
                bz = z_waist + 0.015 + bi * 0.056
                _add_uv_sphere_solid(bm_acc, uv_acc, (sign * 0.042, -(s.chest_ry + 0.024), bz), (0.009, 0.0055, 0.009), u_seg=10, v_seg=6)
        # 허리 제국 벨트 & 버클
        belt_rings = np.stack([
            sampler.sample_torso_ring(z_waist - 0.020, n_seg=40, ease=top_ease + 0.005),
            sampler.sample_torso_ring(z_waist + 0.020, n_seg=40, ease=top_ease + 0.005),
        ], axis=0)
        _add_thick_loft_shell(bm_acc, uv_acc, belt_rings, thickness=0.005)
        # 숄더 망토 (등 뒤로 우아하게 흐르는 별도 SpringBone 메시)
        bm_cape = bmesh.new()
        uv_cape = bm_cape.loops.layers.uv.new("UVMap")
        c_rows = 10
        c_cols = 14
        cape_grid = np.zeros((c_rows, c_cols, 3), dtype=np.float64)
        for ri in range(c_rows):
            t = ri / (c_rows - 1)
            z = (z_neck_b + 0.005) * (1.0 - t) + (z_knee + 0.04) * t
            half_w = (s.shoulder_half_w * 1.02) * (1.0 + 0.42 * t)
            y_back = (s.chest_ry + 0.032) + 0.095 * (t ** 1.15)
            for ci in range(c_cols):
                u_f = (ci / (c_cols - 1)) * 2.0 - 1.0  # -1..+1
                x = u_f * half_w
                # 등 아치 + 밑단 자연 주름
                arch = -0.025 * (1.0 - u_f * u_f) + 0.014 * t * math.sin(u_f * 4.5)
                cape_grid[ri, ci] = (x, y_back + arch, z)
        # 두꺼운 수밀 망토 시트(앞면+뒷면+4변 닫힘)
        front_v = [[bm_cape.verts.new(tuple(cape_grid[r, c])) for c in range(c_cols)] for r in range(c_rows)]
        back_v = [[bm_cape.verts.new(tuple(cape_grid[r, c] + np.array([0.0, 0.007, 0.0]))) for c in range(c_cols)] for r in range(c_rows)]
        for r in range(c_rows - 1):
            v0 = 0.02 + 0.96 * (r / (c_rows - 1))
            v1 = 0.02 + 0.96 * ((r + 1) / (c_rows - 1))
            for c in range(c_cols - 1):
                u0 = 0.02 + 0.96 * (c / (c_cols - 1))
                u1 = 0.02 + 0.96 * ((c + 1) / (c_cols - 1))
                f1 = bm_cape.faces.new((front_v[r][c], front_v[r][c + 1], front_v[r + 1][c + 1], front_v[r + 1][c]))
                for lp, uv in zip(f1.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
                    lp[uv_cape].uv = uv
                f2 = bm_cape.faces.new((back_v[r][c + 1], back_v[r][c], back_v[r + 1][c], back_v[r + 1][c + 1]))
                for lp, uv in zip(f2.loops, ((u1, v0), (u0, v0), (u0, v1), (u1, v1))):
                    lp[uv_cape].uv = uv
        for c in range(c_cols - 1):
            for va, vb, vc, vd in (
                (back_v[0][c], back_v[0][c + 1], front_v[0][c + 1], front_v[0][c]),
                (front_v[-1][c], front_v[-1][c + 1], back_v[-1][c + 1], back_v[-1][c]),
            ):
                fe = bm_cape.faces.new((va, vb, vc, vd))
                for lp in fe.loops:
                    lp[uv_cape].uv = (0.5, 0.04)
        for r in range(c_rows - 1):
            for va, vb, vc, vd in (
                (front_v[r][0], front_v[r + 1][0], back_v[r + 1][0], back_v[r][0]),
                (back_v[r][-1], back_v[r + 1][-1], front_v[r + 1][-1], front_v[r][-1]),
            ):
                fe = bm_cape.faces.new((va, vb, vc, vd))
                for lp in fe.loops:
                    lp[uv_cape].uv = (0.04, 0.5)
        cape_obj = _finalize_mesh_object(bm_cape, "TS_HeroCape_Noble", mats["trim"], arm)
        # 망토 SpringBone 스키닝 (CapeL / CapeC / CapeR)
        vg_sp2 = cape_obj.vertex_groups.new(name="mixamorig:Spine2")
        c_vgs = {cn: [cape_obj.vertex_groups.new(name=bn) for bn in cloth_chain_bones[cn][:-1]] for cn in ("CapeL", "CapeC", "CapeR")}
        z_c_top = z_neck_b + 0.005
        z_c_bot = z_knee + 0.04
        for vi, v in enumerate(cape_obj.data.vertices):
            t_d = min(max((z_c_top - v.co.z) / max(z_c_top - z_c_bot, 0.1), 0.0), 1.0)
            if t_d < 0.15:
                vg_sp2.add([vi], 1.0, "REPLACE")
            else:
                cname = "CapeL" if v.co.x > 0.08 else ("CapeR" if v.co.x < -0.08 else "CapeC")
                b_list = c_vgs[cname]
                bi = min(len(b_list) - 1, int(((t_d - 0.15) / 0.85) * len(b_list)))
                b_list[bi].add([vi], 1.0, "REPLACE")
        objs.append(cape_obj)
    elif style == "action-techwear-harness":
        # 하이칼라 테크웨어 + 체스트 하네스 스트랩 & 메탈 버클
        collar_rings = np.stack([
            sampler.sample_torso_ring(z_neck_b - 0.010, n_seg=32, ease=0.015),
            sampler.sample_torso_ring(z_neck_b + 0.048, n_seg=32, ease=0.018),
        ], axis=0)
        _add_thick_loft_shell(bm_trim, uv_trim, collar_rings, thickness=0.005)
        # X자 체스트 하네스 + 중앙 발광 코어 버클
        for sign in (1.0, -1.0):
            _add_beveled_box(bm_trim, uv_trim, (sign * s.chest_rx * 0.42, -(s.chest_ry + 0.022), z_chest + 0.01), (0.036, 0.012, (z_neck_b - z_waist) * 0.92), (0.0, sign * 0.10, 0.0), bevel_w=0.002)
            _add_beveled_box(bm_trim, uv_trim, (sign * s.chest_rx * 0.42, (s.chest_ry + 0.022), z_chest + 0.01), (0.036, 0.012, (z_neck_b - z_waist) * 0.92), (0.0, -sign * 0.10, 0.0), bevel_w=0.002)
        belt_rings = np.stack([
            sampler.sample_torso_ring(z_waist - 0.022, n_seg=40, ease=top_ease + 0.008),
            sampler.sample_torso_ring(z_waist + 0.022, n_seg=40, ease=top_ease + 0.008),
        ], axis=0)
        _add_thick_loft_shell(bm_trim, uv_trim, belt_rings, thickness=0.006)
        _add_beveled_box(bm_acc, uv_acc, (0.0, -(s.chest_ry + 0.028), z_chest + 0.01), (0.055, 0.014, 0.042), bevel_w=0.003)
        _add_beveled_box(bm_acc, uv_acc, (0.0, -(s.waist_ry + 0.028), z_waist), (0.064, 0.016, 0.046), bevel_w=0.003)
    elif style == "chibi-hoodie-shorts":
        # 후드 백 파우치 + 캥거루 포켓 + 후드 끈 2가닥
        _add_uv_sphere_solid(bm_top, uv_top, (0.0, s.chest_ry + 0.038, z_neck_b + 0.012), (s.chest_rx * 0.85, 0.052, 0.052), u_seg=14, v_seg=10)
        _add_beveled_box(bm_trim, uv_trim, (0.0, -(s.waist_ry + 0.028), z_waist - 0.015), (s.waist_rx * 1.42, 0.024, 0.078), bevel_w=0.005)
        for sign in (1.0, -1.0):
            _add_beveled_box(bm_trim, uv_trim, (sign * 0.028, -(s.chest_ry + 0.028), z_chest - 0.018), (0.010, 0.008, 0.095), bevel_w=0.002)
            _add_uv_sphere_solid(bm_acc, uv_acc, (sign * 0.028, -(s.chest_ry + 0.030), z_chest - 0.066), (0.008, 0.008, 0.009), u_seg=8, v_seg=6)

    top_obj = _finalize_mesh_object(bm_top, f"TS_HeroTop_{spec.hero_id}", mats["top"], arm)
    sampler.transfer_body_skin_weights(top_obj)
    objs.append(top_obj)

    if len(bm_trim.verts) > 0:
        trim_obj = _finalize_mesh_object(bm_trim, f"TS_HeroTrim_{spec.hero_id}", mats["trim"], arm)
        sampler.transfer_body_skin_weights(trim_obj)
        objs.append(trim_obj)
    else:
        bm_trim.free()

    if len(bm_acc.verts) > 0:
        acc_obj = _finalize_mesh_object(bm_acc, f"TS_HeroAccent_{spec.hero_id}", mats["accent"], arm)
        sampler.transfer_body_skin_weights(acc_obj)
        objs.append(acc_obj)
    else:
        bm_acc.free()

    # 3) 하의 (스커트 / 로판 볼가운 / 슬랙스 / 카고 팬츠 / 쇼츠 + 니삭스)
    bm_bot = bmesh.new()
    uv_bot = bm_bot.loops.layers.uv.new("UVMap")
    is_skirt = style in ("romance-cardigan-skirt", "academy-blazer-skirt", "rofan-corset-gown")

    if style == "rofan-corset-gown":
        # 로판 다층 풀 볼가운 스커트 (허리 → 발목 위, 웅장한 A-라인/벨 실루엣 + 페티코트 볼륨)
        n_sr = 14
        n_ss = 48
        s_rings = np.zeros((n_sr, n_ss, 3), dtype=np.float64)
        z_hem = z_ankle + 0.035
        for i in range(n_sr):
            t = i / (n_sr - 1)  # 0=밑단, 1=허리
            z = z_hem + (z_waist - z_hem) * t
            bell = math.sin((1.0 - t) * math.pi * 0.62)
            rad_x = s.waist_rx + 0.010 + 0.34 * bell
            rad_y = s.waist_ry + 0.010 + 0.31 * bell
            s_rings[i] = sampler.sample_torso_ring(
                z,
                n_seg=n_ss,
                ease=0.012,
                pleat_count=12,
                pleat_amp=0.014 * (1.0 - t),
                min_rx=rad_x,
                min_ry=rad_y,
            )
        _add_thick_loft_shell(bm_bot, uv_bot, s_rings, thickness=0.006)
        bot_obj = _finalize_mesh_object(bm_bot, f"TS_HeroBottom_{spec.hero_id}", mats["bottom"], arm)
        sampler.transfer_skirt_skin_weights(bot_obj, z_waist, z_hem)
        objs.append(bot_obj)
    elif style in ("romance-cardigan-skirt", "academy-blazer-skirt"):
        # 16주름 실제 3D 플리츠 스커트 (romance는 하이웨이스트 외층, academy는 블레이저 안쪽 깔끔한 허리)
        z_hem = (z_knee - 0.05) if style == "romance-cardigan-skirt" else (z_knee + (z_crotch - z_knee) * 0.24)
        z_sk_top = (z_waist + 0.015) if style == "romance-cardigan-skirt" else (z_hips + 0.012)
        sk_ease = 0.0165 if style == "romance-cardigan-skirt" else 0.0105
        n_sr = 12
        n_ss = 64  # 16주름 × 4세그먼트/주름 → 날카로운 실제 칼주름!
        s_rings = np.zeros((n_sr, n_ss, 3), dtype=np.float64)
        for i in range(n_sr):
            t = i / (n_sr - 1)  # 0=밑단, 1=상단
            z = z_hem + (z_sk_top - z_hem) * t
            hip_t = min(max((1.0 - t) / 0.34, 0.0), 1.0)
            hip_s = hip_t * hip_t * (3.0 - 2.0 * hip_t)
            flare = 0.072 * ((1.0 - t) ** 1.15)
            w_base_x = (s.waist_rx if style == "romance-cardigan-skirt" else s.hip_rx) + sk_ease
            w_base_y = (s.waist_ry if style == "romance-cardigan-skirt" else s.hip_ry) + sk_ease
            target_rx = w_base_x * (1.0 - hip_s) + (s.hip_rx + sk_ease + 0.004) * hip_s + flare * 0.88
            target_ry = w_base_y * (1.0 - hip_s) + (s.hip_ry + sk_ease + 0.004) * hip_s + flare * 0.80
            s_rings[i] = sampler.sample_torso_ring(
                z,
                n_seg=n_ss,
                ease=sk_ease,
                flare_x=flare * 0.45,
                flare_y=flare * 0.40,
                pleat_count=16,
                pleat_amp=0.010 * (1.0 - t * 0.82),
                min_rx=target_rx,
                min_ry=target_ry,
            )
        _add_thick_loft_shell(bm_bot, uv_bot, s_rings, thickness=0.0045)
        if style == "romance-cardigan-skirt":
            wb_rings = np.stack([
                sampler.sample_torso_ring(z_sk_top - 0.018, n_seg=44, ease=sk_ease + 0.002),
                sampler.sample_torso_ring(z_sk_top + 0.010, n_seg=44, ease=sk_ease + 0.002),
            ], axis=0)
            _add_thick_loft_shell(bm_bot, uv_bot, wb_rings, thickness=0.004)
        bot_obj = _finalize_mesh_object(bm_bot, f"TS_HeroBottom_{spec.hero_id}", mats["bottom"], arm)
        sampler.transfer_skirt_skin_weights(bot_obj, z_sk_top, z_hem)
        objs.append(bot_obj)

        # 학원 교복 니삭스 (무릎 아래 ~ 발목 신발 내부)
        if style == "academy-blazer-skirt":
            bm_sock = bmesh.new()
            uv_sock = bm_sock.loops.layers.uv.new("UVMap")
            for sign in (1.0, -1.0):
                n_kr = 8
                k_rings = np.zeros((n_kr, 22, 3), dtype=np.float64)
                z_k_top = z_knee - 0.025
                z_k_bot = z_ankle * 1.05
                for i in range(n_kr):
                    t = i / (n_kr - 1)
                    z = z_k_bot + (z_k_top - z_k_bot) * t
                    k_rings[i] = sampler.sample_leg_ring(sign, z, n_seg=22, ease=0.0045)
                _add_thick_loft_shell(bm_sock, uv_sock, k_rings, thickness=0.0025)
            sock_obj = _finalize_mesh_object(bm_sock, f"TS_HeroLegwear_{spec.hero_id}", mats["top"], arm)
            sampler.transfer_body_skin_weights(sock_obj)
            objs.append(sock_obj)
    else:
        # 바지 / 카고 팬츠 / 쇼츠 (골반부 + 양다리 튜브 — 가랑이 완전 밀폐 & 다리 상단 골반 내부 매끄럽게 중첩)
        is_shorts = style == "chibi-hoodie-shorts"
        z_leg_end = (z_crotch - (z_crotch - z_knee) * 0.48) if is_shorts else (z_ankle * 0.96)
        p_ease = 0.0165 if style == "action-techwear-harness" else (0.0105 if is_shorts else 0.0085)
        crotch_drop = 0.010 if is_shorts else (0.032 if style == "action-techwear-harness" else 0.018)
        leg_overlap = 0.018 if is_shorts else 0.032
        # 골반 대역 (가랑이 아래까지 내려 바닥 밀폐 → 피부/속옷 틈 0mm)
        pelv_rings = np.stack([
            sampler.sample_torso_ring(z_crotch - crotch_drop, n_seg=36, ease=p_ease * 0.92),
            sampler.sample_torso_ring(z_crotch + 0.016, n_seg=36, ease=p_ease),
            sampler.sample_torso_ring(z_hips, n_seg=36, ease=p_ease),
            sampler.sample_torso_ring(z_waist, n_seg=36, ease=p_ease * 0.85),
        ], axis=0)
        _add_thick_loft_shell(bm_bot, uv_bot, pelv_rings, thickness=0.0045, close_bottom=True, close_top=True)
        for sign in (1.0, -1.0):
            n_lr = 10 if not is_shorts else 6
            l_rings = np.zeros((n_lr, 24, 3), dtype=np.float64)
            z_leg_top = z_crotch + leg_overlap
            for i in range(n_lr):
                t = i / (n_lr - 1)
                z = z_leg_end + (z_leg_top - z_leg_end) * t
                # 상단 2링은 골반 셸 안쪽으로 자연스럽게 수렴시켜 단차·날개 0mm 보장
                top_taper = -0.0035 * max(0.0, (t - 0.75) / 0.25)
                l_rings[i] = sampler.sample_leg_ring(sign, z, n_seg=24, ease=p_ease, extra_r=top_taper)
            _add_thick_loft_shell(bm_bot, uv_bot, l_rings, thickness=0.0045)
            # 액션 헌터: 카고 포켓 + 3D 무릎 패드
            if style == "action-techwear-harness":
                xc_thigh = sign * (s.hip_rx * 0.50 + s.thigh_r + 0.018)
                _add_beveled_box(bm_bot, uv_bot, (xc_thigh, 0.0, (z_crotch + z_knee) * 0.52), (0.032, 0.088, 0.115), bevel_w=0.004)
                _add_beveled_box(bm_bot, uv_bot, (sign * s.hip_rx * 0.46, -(s.knee_r + 0.022), z_knee), (0.085, 0.026, 0.095), bevel_w=0.005)

        bot_obj = _finalize_mesh_object(bm_bot, f"TS_HeroBottom_{spec.hero_id}", mats["bottom"], arm)
        sampler.transfer_body_skin_weights(bot_obj)
        objs.append(bot_obj)

    # 4) 신발 / 부츠 (Z=0.0000 접지 보장)
    boot_h = 0.0
    if style == "rofan-duke" or style == "rofan-imperial-cape":
        boot_h = 0.65
    elif style == "action-techwear-harness":
        boot_h = 0.35
    elif style == "rofan-corset-gown":
        boot_h = 0.25
    chunky = 1.0 if style in ("chibi-hoodie-shorts", "action-techwear-harness", "academy-blazer-slacks") else 0.0
    shoe_obj = _build_shoes_object(f"TS_HeroShoes_{spec.hero_id}", sampler, arm, mats["shoe"], boot_height_frac=boot_h, chunky=chunky)
    objs.append(shoe_obj)

    # 5) 불투명 의상·신발 하부 몸통/발 미세 인셋으로 클리핑 0건 보장
    tuck_z_min = z_ankle if (not is_skirt and style != "chibi-hoodie-shorts") else (
        (z_crotch - (z_crotch - z_knee) * 0.42) if style == "chibi-hoodie-shorts" else z_hips - 0.02
    )
    sampler.tuck_covered_body_regions(
        z_min=tuck_z_min,
        z_max=z_top_hi - 0.015,
        include_legs=(not is_skirt),
        include_feet=True,
        tuck_m=0.0075 if style == "action-techwear-harness" else (0.0042 if not is_skirt else 0.0028),
    )

    return objs, cloth_chains, cloth_chain_bones


# ---------------------------------------------------------------------------
# VRM 1.0 메타·휴머노이드·표정(18프리셋+8커스텀)·시선·썸네일 구성
# ---------------------------------------------------------------------------


def strip_unused_param_shape_keys() -> None:
    """VRM 1.0 아바타에 불필요한 `param:*` 체형/얼굴 morph를 정리하고 모든 `facs:*` 표정 morph를 보존한다."""
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.data.shape_keys:
            continue
        kbs = obj.data.shape_keys.key_blocks
        # facs:* 가 하나도 없으면 shape_keys 전체 제거 (TS_Body, TS_Eye_L/R)
        has_facs = any(kb.name.startswith("facs:") for kb in kbs)
        if not has_facs:
            obj.shape_key_clear()
            continue
        for kb in list(reversed(kbs)):
            if kb.name != "Basis" and not kb.name.startswith("facs:"):
                obj.shape_key_remove(kb)


def configure_vrm1_expressions_and_lookat(arm: Any, plan: bb2.ArchetypePlan) -> None:
    """18종 VRM 1.0 프리셋 표정 + 8종 웹툰 커스텀 표정 + 본 기반 시선 추적(LookAt) 설정."""
    ext = arm.data.vrm_addon_extension.vrm1

    # LookAt (bone 모드 — TS_Eye.L/R 직접 구동)
    la = ext.look_at
    la.type = la.TYPE_BONE.identifier
    head_pos = plan.joints_b["mixamorig:Head"]
    eye_mid = 0.5 * (plan.eye_center_l + plan.eye_center_r)
    # glTF(X, Y_up, Z_fwd) 기준 머리 본 → 눈 중심 오프셋
    la.offset_from_head_bone = (
        0.0,
        float(eye_mid[2] - head_pos[2]),
        float(-(eye_mid[1] - head_pos[1])),
    )
    la.range_map_horizontal_inner.input_max_value = 90.0
    la.range_map_horizontal_inner.output_scale = 12.0
    la.range_map_horizontal_outer.input_max_value = 90.0
    la.range_map_horizontal_outer.output_scale = 14.0
    la.range_map_vertical_down.input_max_value = 90.0
    la.range_map_vertical_down.output_scale = 10.0
    la.range_map_vertical_up.input_max_value = 90.0
    la.range_map_vertical_up.output_scale = 10.0

    # 표정 바인딩 대상 메시 수집 (TS_Head, TS_Mouth, TS_Lashes, TS_Brow_L, TS_Brow_R)
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

    # 웹툰 커스텀 표정 8종 추가
    ext.expressions.custom.clear()
    for cname, cspec in expr.WEBTOON_EMOTION_PRESETS_V2.items():
        ce = ext.expressions.custom.add()
        ce.custom_name = cname
        bind_weights(ce, cspec["weights"])


def render_embedded_thumbnail(spec: HeroAvatarSpec, plan: bb2.ArchetypePlan, tmp_path: Path) -> Any:
    """BLENDER_EEVEE 512x512 상반신 인물 썸네일을 렌더해 VRM 1.0 meta.thumbnail_image로 임베드한다."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 16

    world = bpy.data.worlds.new(f"ThumbWorld_{spec.hero_id}")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.95, 0.94, 0.91, 1.0)
        bg.inputs[1].default_value = 0.92

    created: list[Any] = []
    for lname, loc, energy, color in (
        ("ThumbKey", (1.1, -1.6, plan.z_crown + 0.35), 220.0, (1.0, 0.98, 0.95)),
        ("ThumbFill", (-1.1, -1.2, plan.z_chest + 0.15), 110.0, (0.90, 0.95, 1.0)),
    ):
        ld = bpy.data.lights.new(lname, type="AREA")
        ld.energy = energy
        ld.size = 1.1
        ld.color = color
        lo = bpy.data.objects.new(lname, ld)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0.0, 0.0, plan.z_eye)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        created.append(lo)

    cam_d = bpy.data.cameras.new(f"ThumbCam_{spec.hero_id}")
    cam_d.lens = 65.0
    cam_o = bpy.data.objects.new(f"ThumbCam_{spec.hero_id}", cam_d)
    scene.collection.objects.link(cam_o)
    scene.camera = cam_o
    created.append(cam_o)

    focus_z = plan.z_eye - plan.head_h * 0.22
    dist = max(0.82, plan.head_h * 4.4)
    cam_pos = Vector((dist * 0.22, -dist, focus_z + 0.04))
    cam_o.location = cam_pos
    cam_o.rotation_euler = (Vector((0.0, 0.0, focus_z)) - cam_pos).to_track_quat("-Z", "Y").to_euler()

    scene.render.filepath = str(tmp_path)
    bpy.ops.render.render(write_still=True)

    # 렌더용 임시 카메라/라이트 제거 (VRM 익스포트 오염 방지)
    for o in created:
        bpy.data.objects.remove(o, do_unlink=True)

    thumb_img = bpy.data.images.load(str(tmp_path), check_existing=False)
    thumb_img.name = f"thumb_{spec.hero_id}"
    thumb_img.pack()
    return thumb_img


def configure_vrm1_meta_and_humanoid(
    arm: Any,
    spec: HeroAvatarSpec,
    base_sha256: str,
    thumb_img: Any | None,
) -> None:
    """VRM 1.0 CC0-1.0 / original 메타 및 55본 휴머노이드 매핑 고정."""
    ext = arm.data.vrm_addon_extension
    ext.spec_version = "1.0"
    meta = ext.vrm1.meta
    meta.vrm_name = spec.name_ko
    meta.version = "2.0.0-hero-v1"
    meta.authors.clear()
    meta.authors.add().value = "ToonStudio"
    meta.copyright_information = f"Original procedural webtoon hero avatar by ToonStudio (CC0-1.0 / original) — {spec.hero_id}"
    meta.contact_information = "https://toonstudio.app"
    meta.references.clear()
    meta.references.add().value = "License: CC0-1.0 / original (ToonStudio procedural character_kit v2)"
    meta.references.add().value = f"Base archetype: {spec.base_archetype} (SHA-256: {base_sha256})"
    meta.references.add().value = f"Genre preset: {spec.genre} | Hair: {spec.hair_style} | Outfit: {spec.outfit_style}"
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


# ---------------------------------------------------------------------------
# GLB JSON 청크 엄격 감사기 (vrm-toolkit 사각지대 보완: MToon + SpringBone + Grounding)
# ---------------------------------------------------------------------------


def audit_vrm1_glb_chunk(vrm_path: Path) -> dict[str, Any]:
    """VRM 1.0 바이너리의 GLB JSON 청크를 직접 해독해 모든 하드 계약을 실측 검증한다."""
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

    # 1) 휴머노이드 55본
    hbones = vrmc.get("humanoid", {}).get("humanBones", {})
    if len(hbones) != 55:
        errors.append(f"휴머노이드 본 수 != 55 (실측 {len(hbones)})")

    # 2) 18 VRM 1.0 프리셋 표정
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

    # 3) SpringBone 1.0 & hitRadius > 0
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

    # 4) 모든 MToon 재질 screenCoordinates & outlineLightingMixFactor == 0.0 & shadingToonyFactor == 0.9
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

    # 5) CC0 / original 메타 보존 검사
    meta = vrmc.get("meta", {})
    refs_joined = " ".join(meta.get("references", []))
    if not meta.get("authors"):
        errors.append("meta.authors 누락")
    if meta.get("commercialUsage") != "corporation" or not meta.get("allowRedistribution"):
        errors.append("CC0/original 상업·재배포 권한 메타 누락")
    if "CC0" not in refs_joined and "original" not in refs_joined:
        errors.append("meta.references에 CC0/original 근거가 없습니다.")

    # 6) 삼각형 수·접지(minY) 계측
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
# 단일 히어로 VRM 1.0 빌드 & 익스포트
# ---------------------------------------------------------------------------


def export_single_hero_vrm(
    spec: HeroAvatarSpec,
    *,
    bases_dir: Path,
    out_dir: Path,
) -> dict[str, Any]:
    t0 = time.time()
    _clear_scene_keep_addons()
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    base_glb = bases_dir / f"{spec.base_archetype}.glb"
    if not base_glb.is_file():
        raise FileNotFoundError(f"v2 베이스 GLB를 찾을 수 없습니다: {base_glb}")
    base_sha256 = hashlib.sha256(base_glb.read_bytes()).hexdigest()

    bpy.ops.import_scene.gltf(filepath=str(base_glb))
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Icosphere") and obj.parent is None:
            bpy.data.objects.remove(obj, do_unlink=True)

    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.name = f"Armature_{spec.hero_id}"
    body_obj = bpy.data.objects["TS_Body"]
    head_obj = bpy.data.objects["TS_Head"]
    plan = bb2.compute_archetype_plan(bb2.ARCHETYPES[spec.base_archetype])
    sampler = BaseBodySampler(arm, body_obj, head_obj, plan)

    # 1) 베이스 5종 재질을 MToon 1.0 단일 잉크 계약으로 변환 (실제 씬 메시 부착 재질 기준)
    outline_lin = hex_to_linear(spec.outline_hex)
    base_mat_cfg = {
        "ts_skin_body": (0.0020, (0.86, 0.77, 0.78), False),
        "ts_skin_head": (0.0018, (0.88, 0.79, 0.80), False),
        "ts_eye_sclera": (0.0006, (0.82, 0.82, 0.88), False),
        "ts_mouth_inner": (0.0005, (0.78, 0.65, 0.68), False),
        "ts_lashes_brows": (0.0006, (0.65, 0.60, 0.65), False),
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
        ow, shade_c, ds = base_mat_cfg.get(base_key, (0.0020, (0.82, 0.78, 0.82), False))
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

    # 2) 헤어·의상 다채널 MToon 1.0 재질 생성 (총 재질 수 10~11개 <= 16 예산)
    hair_img = make_hair_texture(f"tex_hair_{spec.hero_id}", spec.hair_hex, spec.hair_tip_hex, size=512)
    top_pat = (
        "knit" if "cardigan" in spec.outfit_style or "hoodie" in spec.outfit_style
        else "velvet" if "rofan" in spec.outfit_style
        else "techwear" if "action" in spec.outfit_style
        else "twill"
    )
    bot_pat = (
        "plaid" if spec.outfit_style == "academy-blazer-skirt"
        else "velvet" if spec.outfit_style == "rofan-corset-gown"
        else "techwear" if "action" in spec.outfit_style
        else "twill"
    )
    acc_pat = "metal" if ("rofan" in spec.outfit_style or "action" in spec.outfit_style) else "twill"

    mats = {
        "hair": create_mtoon_material(f"ts_vrm_hair_{spec.hero_id}", image=hair_img, base_hex=spec.hair_hex, outline_hex=spec.outline_hex, outline_width=0.0024, cool_shade=True, rim_strength=0.14),
        "top": create_mtoon_material(
            f"ts_vrm_top_{spec.hero_id}",
            image=make_fabric_texture(f"tex_top_{spec.hero_id}", spec.top_hex, spec.top_trim_hex, spec.accent_hex, pattern=top_pat),
            base_hex=spec.top_hex,
            outline_hex=spec.outline_hex,
            outline_width=0.0022,
        ),
        "trim": create_mtoon_material(
            f"ts_vrm_trim_{spec.hero_id}",
            image=make_fabric_texture(f"tex_trim_{spec.hero_id}", spec.top_trim_hex, spec.top_hex, spec.accent_hex, pattern="twill"),
            base_hex=spec.top_trim_hex,
            outline_hex=spec.outline_hex,
            outline_width=0.0018,
        ),
        "accent": create_mtoon_material(
            f"ts_vrm_accent_{spec.hero_id}",
            image=make_fabric_texture(f"tex_acc_{spec.hero_id}", spec.accent_hex, spec.top_trim_hex, spec.top_hex, pattern=acc_pat),
            base_hex=spec.accent_hex,
            outline_hex=spec.outline_hex,
            outline_width=0.0016,
            cool_shade=False,
        ),
        "bottom": create_mtoon_material(
            f"ts_vrm_bottom_{spec.hero_id}",
            image=make_fabric_texture(f"tex_bot_{spec.hero_id}", spec.bottom_hex, spec.bottom_trim_hex, spec.accent_hex, pattern=bot_pat),
            base_hex=spec.bottom_hex,
            outline_hex=spec.outline_hex,
            outline_width=0.0022,
        ),
        "shoe": create_mtoon_material(
            f"ts_vrm_shoe_{spec.hero_id}",
            image=make_fabric_texture(f"tex_shoe_{spec.hero_id}", spec.shoe_hex, spec.bottom_trim_hex, spec.accent_hex, pattern="leather"),
            base_hex=spec.shoe_hex,
            outline_hex=spec.outline_hex,
            outline_width=0.0020,
        ),
    }

    # 3) 헤어 + 의상 + SpringBone 보조 본 구축
    _, hair_chains, hair_chain_bones = build_hero_hair(spec, sampler, arm, mats["hair"], mats["accent"])
    _, cloth_chains, cloth_chain_bones = build_hero_wardrobe(spec, sampler, arm, mats)
    all_chains = [*hair_chains, *cloth_chains]
    all_chain_bones = {**hair_chain_bones, **cloth_chain_bones}

    # 4) VRM 1.0에 불필요한 param:* morph 제거 (16 facs:* 표정 morph 100% 유지)
    strip_unused_param_shape_keys()

    # 5) 512x512 EEVEE 썸네일 렌더 & 임베드
    out_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir = out_dir / "thumbnails"
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumb_dir / f"{spec.hero_id}.png"
    thumb_img = render_embedded_thumbnail(spec, plan, thumb_path)

    # 6) VRM 1.0 메타 + 휴머노이드 55본 + 18 표정(+8 커스텀) + SpringBone 1.0 구성
    configure_vrm1_meta_and_humanoid(arm, spec, base_sha256, thumb_img)
    configure_vrm1_expressions_and_lookat(arm, plan)
    configure_vrm1_spring_bones(arm, plan, all_chains, all_chain_bones)

    # 7) 모든 메시 오브젝트 bmesh 0-결함 최종 검증
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

    # 9) GLB JSON 청크 즉시 감사 (MToon screenCoordinates + SpringBone hitRadius > 0 + 55본 + 18표정)
    audit = audit_vrm1_glb_chunk(vrm_path)
    audit["heroId"] = spec.hero_id
    audit["baseArchetype"] = spec.base_archetype
    audit["genre"] = spec.genre
    audit["hairStyle"] = spec.hair_style
    audit["outfitStyle"] = spec.outfit_style
    audit["thumbnail"] = f"thumbnails/{spec.hero_id}.png"
    audit["buildSeconds"] = round(time.time() - t0, 2)

    if not audit["ok"]:
        raise RuntimeError(f"VRM 1.0 GLB 청크 감사 실패({spec.hero_id}): {audit['errors']}")

    print(
        f"[export_vrm1_hero] {spec.hero_id}: {audit['bytes'] / 1048576:.2f} MiB | "
        f"tris={audit['totalTriangles']} | mats={audit['materialCount']} (screenCoordinates={audit['mtoonScreenCoordinatesCount']}) | "
        f"bones={audit['humanoidBones']} | expr={audit['presetExpressions']}+{audit['customExpressions']} | "
        f"springs={audit['springCount']} (joints={audit['springJointCount']}, minHitR={audit['minHitRadius']}) | "
        f"h={audit['heightM']:.3f}m minY={audit['minYM']:.4f}m | {audit['buildSeconds']}s"
    )
    return audit


def write_hero_manifest_and_license(out_dir: Path, audits: list[dict[str, Any]]) -> Path:
    manifest = {
        "schema": "toonstudio.vrm-hero-collection/1",
        "version": "1.0.0",
        "generatedAt": "2026-11-20",
        "generator": {
            "tool": "tools/blender/character_kit/export_vrm1_hero.py",
            "blender": bpy.app.version_string.split()[0],
            "vrmAddon": "bl_ext.user_default.vrm (4.5.0)",
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
        "ToonStudio Hero VRM 1.0 Collection (toonstudio-hero-v1)\n"
        "=======================================================\n"
        "License: CC0-1.0 / ToonStudio Original Procedural Design\n"
        "Generated: 2026-11-20\n"
        "Author: ToonStudio\n"
        "Pipeline: tools/blender/character_kit/export_vrm1_hero.py (Blender 5.3 + VRM Add-on 4.5.0)\n"
        "\n"
        "All 8 hero avatars (romance-female, romance-male, academy-female, academy-male,\n"
        "rofan-empress, rofan-duke, action-hunter, chibi-mascot) are procedurally authored\n"
        "original geometry and textures built from ToonStudio Character Kit v2 bases with\n"
        "zero third-party commercial assets or generative AI meshes. Commercial use,\n"
        "modification, and redistribution are permitted without restriction.\n"
    )
    (out_dir / "LICENSE.txt").write_text(license_txt, encoding="utf-8")
    return manifest_path


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio VRM 1.0 히어로 아바타 8종 익스포터")
    parser.add_argument(
        "--hero",
        default="all",
        choices=("all", *HERO_SPECS.keys()),
        help="익스포트할 히어로 ID 또는 all",
    )
    parser.add_argument(
        "--bases-dir",
        type=Path,
        default=Path("apps/character-lab/public/assets/characters/toonstudio-kit-v2/bases"),
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("apps/web/public/vrm/toonstudio-hero-v1"),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    # 규약: --addons 플래그 금지, 스크립트 첫 단계에서 VRM 애드온 직접 활성화
    bpy.ops.preferences.addon_enable(module="bl_ext.user_default.vrm")
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    targets = list(HERO_SPECS.values()) if args.hero == "all" else [HERO_SPECS[args.hero]]
    audits: list[dict[str, Any]] = []
    for spec in targets:
        audits.append(export_single_hero_vrm(spec, bases_dir=args.bases_dir, out_dir=args.out_dir))
    if args.hero == "all":
        write_hero_manifest_and_license(args.out_dir, audits)
    else:
        # 단일 히어로 재생성 시 기존 manifest.json의 해당 엔트리만 최신 실측값으로 병합 갱신
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
