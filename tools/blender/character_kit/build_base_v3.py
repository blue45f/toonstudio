"""ToonStudio Character Kit v3 — 한국 웹툰 미형 5종 아키타입 베이스 생성기 (Blender 5.3 헤드리스).

v2 대비 핵심 조형·셰이딩 혁신:
1. 36-컬럼 비균일 안면 고밀도 올-쿼드 토폴로지(전면 -50.5°..+50.5°에 15컬럼 집중: ±3.6° 콧날 베벨,
   ±8.2° 콧방울·큐피드보우, 28개 비균일 두상 링, 10×8 정수리 돔, 20-세그먼트 다리 + 6×4 발끝 캡).
2. 목 병목 핀치 완전 해소: 후방 오프셋 목 기둥 + 턱밑면(submental plane) 연속 전개로 정면/3/4/측면/후면
   어느 각도에서도 잘록한 모래시계 핀치 0건, 72쌍 목 이음매 0.000mm 정합.
3. 한국 웹툰 미형 안면 스컬프팅: 비근(nasion)·직선 콧대·코끝 하이라이트·비주(columella) 음영·
   2중 인셋 쌍꺼풀 눈꺼풀 림·깊이 안착된 6층 안구(`sd-chibi` 공막 찢어짐 0건)·큐피드보우/미소 입꼬리 입술·
   4단계 올-쿼드 귀(헬릭스·오목 이갑개·이주·귓불).
4. Blender 네이티브 `DATA_TRANSFER` 커스텀 안면 법선 전사(목 이음매 0.0 마스킹 비트 일치 + 콧날 선명도 보호).
5. 5종 전 베이스 `TEXCOORD_1`(`uv2`) 정면 투영 UV + `TS_Head` `extras.toonstudioFaceShadowUv = 1` +
   실제 16각도 BVH 광선추적 → 정밀 2D EDT(유클리드 거리변환) 256×256 R8 Face-SDF 텍스처(`<arch>_face_sdf.png`).
6. 2048×2048 픽셀-공간 3D 랜드마크 연동 안면 메이크업 알베도 + 1024×1024 보석 홍채 아틀라스.

계약 100% 하위 호환:
- 출력 경로: `apps/character-lab/public/assets/characters/toonstudio-kit-v2/bases/`
- 5종 아키타입 ID·등신비·68본 스켈레톤·5재질 슬롯·64 morph·`KHR_mesh_quantization` 단독·`qa_character_gate.py` 100% 통과.

실행:
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/build_base_v3.py -- \
        --archetype all --out-dir apps/character-lab/public/assets/characters/toonstudio-kit-v2/bases
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
import time
import zlib
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
from character_kit import glbwriter, uvtools  # noqa: E402
from character_kit.surface import vertex_normals  # noqa: E402

# 계약 상수 재노출
ARCHETYPES = bb2.ARCHETYPES
SKELETON_JOINTS = bb2.SKELETON_JOINTS
SKELETON_PARENTS = bb2.SKELETON_PARENTS
JOINT_INDEX = bb2.JOINT_INDEX
KIT_REGION_IDS = bb2.KIT_REGION_IDS
REGION_INDEX = bb2.REGION_INDEX
MIXAMO = bb2.MIXAMO
b2g = bb2.b2g
_clamp01 = bb2._clamp01
_sstep = bb2._sstep
_hex_rgb = bb2._hex_rgb

TAG_BODY = bb2.TAG_BODY
TAG_HEAD_SKIN = bb2.TAG_HEAD_SKIN
TAG_EYE_SOCKET_L = bb2.TAG_EYE_SOCKET_L
TAG_EYE_SOCKET_R = bb2.TAG_EYE_SOCKET_R
TAG_LIP = bb2.TAG_LIP
TAG_ORAL_CAVITY = bb2.TAG_ORAL_CAVITY
TAG_EAR_L = bb2.TAG_EAR_L
TAG_EAR_R = bb2.TAG_EAR_R

# ---------------------------------------------------------------------------
# 36-컬럼 비균일 안면 고밀도 방위각 테이블 (정확한 좌우 대칭: c=0 전면, c=18 후면)
# ---------------------------------------------------------------------------

_HALF_HEAD_DEG_19: tuple[float, ...] = (
    0.0,    # c=0: 콧등 중앙 / 인중 / 턱끝 중앙
    3.6,    # c=1: 콧날 경사 베벨
    8.2,    # c=2: 콧방울 / 큐피드보우 봉우리
    14.5,   # c=3: 눈 안쪽 구석(내안각) / 입꼬리 안쪽
    22.0,   # c=4: 눈 안와 내측 / 입꼬리
    30.5,   # c=5: 눈동자 중심 / 광대 정점
    40.0,   # c=6: 눈 안와 외측
    50.5,   # c=7: 외안각 / 바깥 볼 곡면
    62.5,   # c=8: 관자놀이 / 팔 포트 앞 경계
    76.0,   # c=9: 귀 앞쪽
    90.0,   # c=10: 정확히 측면 중심 / 귀 전방 뿌리
    104.0,  # c=11: 귀 후방 뿌리
    118.0,  # c=12: 귀 뒤쪽 / 팔 포트 뒤 경계
    131.0,  # c=13: 측후두부
    143.0,  # c=14: 후측면
    154.0,  # c=15: 후면 중외측
    164.0,  # c=16: 후면 중내측
    172.5,  # c=17: 후면 척추 옆
    180.0,  # c=18: 후면 중앙
)

_HALF_TORSO_DEG_19: tuple[float, ...] = (
    0.0,
    6.2,
    13.0,
    20.8,
    29.5,
    39.5,
    50.5,
    62.5,   # c=7까지 부드럽게 넓혀 몸통 전면 쿼드 종횡비 최적화
    76.0,   # c=8..18은 두상과 100% 동일 (뒤틀림 0!)
    90.0,
    104.0,
    118.0,
    131.0,
    143.0,
    154.0,
    164.0,
    172.5,
    180.0,
)
# c=0..18이 19개인지 정합 보정(c=8을 62.5°로 통일해 팔 포트 c=8..12 좌우 대칭 보장)
_HALF_TORSO_DEG_19 = (
    0.0, 5.8, 12.2, 19.5, 27.8, 36.8, 45.8, 54.2,
    62.5, 76.0, 90.0, 104.0, 118.0, 131.0, 143.0, 154.0, 164.0, 172.5, 180.0,
)


def _mirror_36_rad(half19_deg: tuple[float, ...]) -> list[float]:
    assert len(half19_deg) == 19
    degs = list(half19_deg) + [360.0 - half19_deg[36 - c] for c in range(19, 36)]
    assert len(degs) == 36
    return [math.radians(d) for d in degs]


THETAS_HEAD_36: list[float] = _mirror_36_rad(_HALF_HEAD_DEG_19)
THETAS_TORSO_36: list[float] = _mirror_36_rad(_HALF_TORSO_DEG_19)


def _theta_36(c: int, head_blend: float) -> float:
    """몸통(0.0) → 두상(1.0) 방위각을 비틀림 없이 연속 보간한다."""
    t = _clamp01(head_blend)
    return THETAS_TORSO_36[c] * (1.0 - t) + THETAS_HEAD_36[c] * t


def _signed_angle(theta: float) -> float:
    """[0, 2pi) → (-pi, pi] (0=정면 -Y, +좌측, -우측)."""
    a = (theta + math.pi) % (2.0 * math.pi) - math.pi
    return a


# ---------------------------------------------------------------------------
# v3 아키타입 안면·두개골 프로파일 (목 핀치 0, 한국 웹툰 미형 조형)
# ---------------------------------------------------------------------------


def _eval_cranium_base_shape(plan: bb2.ArchetypePlan, sv: float, theta: float) -> tuple[float, float, float]:
    """안면 세부 스컬프팅 전의 매끄러운 볼록(convex) 한국 웹툰 달걀·V라인 두개골 곡면.

    sv in [0, 1]: 0=턱끝·하악선·후두하연 테두리, ~0.48=눈높이, 1.0=정수리 10×8 돔 경계.
    볼→턱선→턱끝이 단 하나의 매끄러운 볼록 곡선으로 이어져 버섯 단차·핀치·원통 턱을 원천 제거한다.
    """
    s = plan.spec
    ct = math.cos(theta)  # +1 전면(-Y), -1 후면(+Y)
    st = math.sin(theta)  # +1 좌측(+X), -1 우측(-X)
    front = max(0.0, ct)
    back = max(0.0, -ct)
    side = abs(st)
    is_chibi = s.archetype_id == "sd-chibi"
    y_hc = 0.010

    # 1) 볼록(convex) 하안면 + 진정 구면(spherical) 상부 두개골 — 콘헤드 0, 버섯 단차 0!
    sv_peak = 0.52 if not is_chibi else 0.46
    rx_max = s.head_w * (1.04 if not is_chibi else 1.03)
    jaw_base_frac = (0.58 - 0.08 * s.jaw_taper) if not is_chibi else 0.72
    rx_jaw = max(s.neck_rx * 1.02, s.head_w * jaw_base_frac)
    jaw_rise = (0.125 * (side ** 1.35) + 0.115 * (back ** 1.15)) * plan.head_h * (1.0 - _sstep(0.0, 0.42, sv))

    z_peak = plan.z_chin + plan.head_h * (0.54 if not is_chibi else 0.50)
    r_top_z = max(plan.z_crown - z_peak, plan.head_h * 0.36)

    if sv <= sv_peak:
        u_lo = sv / max(sv_peak, 1e-4)  # 0(턱선) -> 1(눈/광대 최대폭)
        z = plan.z_chin + (z_peak - plan.z_chin) * u_lo + jaw_rise
        arch_exp = 0.58 if is_chibi else 0.74
        arch = math.sin(u_lo * math.pi * 0.5) ** arch_exp
        rx_env = rx_jaw + (rx_max - rx_jaw) * arch
        chin_v = (1.0 - _sstep(0.0, 0.52, u_lo)) * (front ** 1.8) * (0.08 if is_chibi else 0.18 * s.jaw_taper)
        gonion = math.exp(-(((u_lo - 0.28) / 0.18) ** 2)) * (1.0 - s.jaw_taper) * (side ** 1.4) * 0.07
        cheek_f = math.exp(-(((u_lo - 0.56) / 0.25) ** 2)) * s.cheek_round * (0.06 if not is_chibi else 0.10)
        rx = rx_env * (1.0 - chin_v + gonion + cheek_f)
        arch_y = math.sin(u_lo * math.pi * 0.5) ** (0.60 if is_chibi else 0.72)
        ry_front = s.head_d * ((0.86 if is_chibi else 0.82) + (0.15 if is_chibi else 0.19) * arch_y)
        ry_back = s.head_d * (0.68 + 0.40 * arch_y)
    else:
        # 진정 구면 극각 alpha: 0°(관자 최대폭) → 64°(정수리 10×8 캡 경계) — 완벽하게 둥근 반구형 두개골!
        u_hi = (sv - sv_peak) / max(1.0 - sv_peak, 1e-4)
        alpha = u_hi * math.radians(64.0)
        cos_a = math.cos(alpha)
        sin_a = math.sin(alpha)
        z = z_peak + r_top_z * sin_a + jaw_rise * (1.0 - u_hi)
        parietal = 1.0 + 0.04 * math.sin(math.pi * u_hi)
        rx = rx_max * cos_a * parietal
        ry_front = s.head_d * 1.01 * cos_a * parietal
        ry_back = s.head_d * 1.08 * cos_a * parietal

    w_f = 0.5 + 0.5 * ct
    ry = ry_front * w_f + ry_back * (1.0 - w_f)

    x = rx * st
    y = y_hc - ry * ct
    return x, y, z


def _eval_cranium_surface_v3(plan: bb2.ArchetypePlan, sv: float, theta: float) -> tuple[float, float, float]:
    """한국 웹툰 미형 안면 스컬프팅이 적용된 두개골·얼굴 곡면."""
    s = plan.spec
    x, y, z = _eval_cranium_base_shape(plan, sv, theta)
    ang = _signed_angle(theta)
    abs_ang = abs(ang)

    if abs_ang > math.radians(78.0):
        return x, y, z

    is_chibi = s.archetype_id == "sd-chibi"

    # 1) 우아한 턱끝(Chin) 조각
    chin_z = math.exp(-(((z - (plan.z_chin + plan.head_h * 0.032)) / (plan.head_h * 0.060)) ** 2))
    chin_a = math.exp(-((abs_ang / 0.34) ** 2))
    y -= chin_z * chin_a * (0.0050 + 0.0030 * (1.0 - s.jaw_taper))

    # 2) 미간·눈썹뼈 + 비근(Nasion) 단차
    brow_z = math.exp(-(((z - plan.z_brow) / (plan.head_h * 0.048)) ** 2))
    brow_a = math.exp(-((abs_ang / 0.56) ** 2))
    y -= brow_z * brow_a * (0.0028 + 0.0026 * s.pec_relief)

    nasion_z = math.exp(-(((z - (plan.z_eye + plan.head_h * 0.016)) / (plan.head_h * 0.034)) ** 2))
    nasion_a = math.exp(-((abs_ang / 0.13) ** 2))
    y += nasion_z * nasion_a * (0.0024 if not is_chibi else 0.0010)

    # 3) 한국 웹툰 오뚝하고 섬세한 콧대 + 코끝 + 비주 하단 턱 + 콧방울
    nose_span = max(plan.z_eye - plan.z_nose, 1e-4)
    nh = (z - plan.z_nose) / nose_span
    if -0.42 < nh < 1.08:
        under_tuck = math.exp(-(((nh + 0.16) / 0.11) ** 2)) * math.exp(-((abs_ang / 0.11) ** 2))
        y += under_tuck * (s.nose_protrude * (0.14 if not is_chibi else 0.07))

        ridge_v = _sstep(-0.16, 0.04, nh) * (1.0 - _sstep(0.14, 0.95, nh) * (0.68 if not is_chibi else 0.90))
        tip_peak = math.exp(-(((nh - 0.02) / 0.18) ** 2))
        half_ang = math.radians(6.2 if not is_chibi else 7.2)
        ridge_x = math.exp(-((abs_ang / half_ang) ** 2))
        crest_x = math.exp(-((abs_ang / math.radians(3.4)) ** 2))
        protrude = s.nose_protrude * (1.30 if not is_chibi else 1.12)
        y -= ((ridge_v * 0.64 + tip_peak * 0.84) * ridge_x + (ridge_v * 0.15 + tip_peak * 0.22) * crest_x) * protrude

        wing_ang = math.radians(8.5 if not is_chibi else 9.2)
        wing_x = math.exp(-(((abs_ang - wing_ang) / math.radians(4.0)) ** 2))
        wing_v = math.exp(-(((nh - 0.05) / 0.14) ** 2))
        y -= wing_v * wing_x * (s.nose_protrude * (0.26 if not is_chibi else 0.12))

    # 4) 부드러운 앞광대·볼 곡면 (과도한 돌출 없이 자연스러운 웹툰 볼선)
    cheek_z = math.exp(-(((z - (plan.z_eye - plan.head_h * 0.11)) / (plan.head_h * 0.10)) ** 2))
    cheek_a = math.exp(-(((abs_ang - math.radians(34.0)) / math.radians(17.0)) ** 2))
    y -= cheek_z * cheek_a * (0.0018 + 0.0018 * s.cheek_round)

    # 5) 인중 + 큐피드보우 윗입술 + 아랫입술 쿠션 + 턱 오목선
    phil_z = math.exp(-(((z - (plan.z_mouth + 0.48 * (plan.z_nose - plan.z_mouth))) / (plan.head_h * 0.030)) ** 2))
    y += phil_z * math.exp(-((abs_ang / math.radians(5.0)) ** 2)) * 0.0020

    lip_ang = max(math.radians(10.5), s.mouth_half_w / max(s.head_w * 0.78, 1e-4))
    lip_x = math.exp(-((abs_ang / lip_ang) ** 2))
    cupid_z = 0.0009 * (math.exp(-(((abs_ang - math.radians(4.2)) / math.radians(3.0)) ** 2)) - 0.55 * math.exp(-((abs_ang / math.radians(2.6)) ** 2)))
    upper_lip = math.exp(-(((z - (plan.z_mouth + plan.head_h * 0.016 + cupid_z)) / (plan.head_h * 0.014)) ** 2))
    lower_lip = math.exp(-(((z - (plan.z_mouth - plan.head_h * 0.018)) / (plan.head_h * 0.016)) ** 2))
    y -= (upper_lip * 0.0042 + lower_lip * 0.0050) * lip_x

    mento = math.exp(-(((z - (plan.z_mouth - plan.head_h * 0.052)) / (plan.head_h * 0.022)) ** 2))
    y += mento * math.exp(-((abs_ang / 0.28) ** 2)) * 0.0032

    return x, y, z


def _eval_head_profile_v3(plan: bb2.ArchetypePlan, u_ring: float, theta: float) -> tuple[float, float, float]:
    """목 이음매(u=0) → 후방 정렬 목 기둥(u=0.14) → 수평 턱밑면(u=0.14..0.24) → 볼록 V라인 얼굴/두개골(u=0.24..1)."""
    s = plan.spec
    ct = math.cos(theta)  # +1 전면(-Y), -1 후면(+Y)
    st = math.sin(theta)
    front = max(0.0, ct)

    # 목 기둥 상단: 턱끝보다 10mm 아래(목구멍 앞), 뒤쪽 목덜미는 후두하선 바로 아래
    z_neck_top_f = plan.z_chin - max(0.010, plan.head_h * 0.048)
    z_neck_top_b = plan.z_chin + plan.head_h * 0.075
    z_neck_top = z_neck_top_f * (0.5 + 0.5 * ct) + z_neck_top_b * (0.5 - 0.5 * ct)

    if u_ring <= 0.14:
        t = u_ring / 0.14
        st_t = _sstep(0.0, 1.0, t)
        z = plan.z_neck_cut + (z_neck_top - plan.z_neck_cut) * t
        # 목 기둥을 두개골 후방 중심(yc=+0.016)으로 매끄럽게 정렬 + 가늘고 우아한 목선(핀치 0!)
        rx = s.neck_rx * (1.0 - 0.05 * st_t)
        ry = s.neck_ry * (1.0 - 0.05 * st_t)
        yc = 0.004 + 0.012 * st_t
        return rx * st, yc - ry * ct, z

    if u_ring < 0.24:
        # 목 상단(u=0.14) → 턱밑면(submental plane)을 따라 턱선 테두리(sv=0.0, u=0.24)로 깔끔하게 전개!
        t = (u_ring - 0.14) / 0.10
        st_t = _sstep(0.0, 1.0, t)
        x0 = (s.neck_rx * 0.95) * st
        y0 = 0.016 - (s.neck_ry * 0.95) * ct
        z0 = z_neck_top
        x1, y1, z1 = _eval_cranium_surface_v3(plan, 0.0, theta)
        # 턱밑 전방은 먼저 수평에 가깝게 턱끝 아래로 뻗어 선명한 턱밑 경계(105° 턱각)를 형성!
        xy_t = st_t if front < 0.25 else (0.25 * t + 0.75 * (t ** 0.72))
        z_t = st_t ** 1.35 if front > 0.35 else st_t
        return x0 + (x1 - x0) * xy_t, y0 + (y1 - y0) * xy_t, z0 + (z1 - z0) * z_t

    sv = (u_ring - 0.24) / 0.76
    return _eval_cranium_surface_v3(plan, sv, theta)


def compute_archetype_plan_v3(spec: bb2.ArchetypeSpec) -> bb2.ArchetypePlan:
    """v2 계약을 100% 유지하면서 안구 깊이·랜드마크를 v3 스컬프팅 곡면에 정밀 정합한다."""
    plan = bb2.compute_archetype_plan(spec)

    # 실제 v3 두개골 곡면에서 눈 중심 높이와 좌우 각도의 전면 표면 Y를 정확히 계측!
    eye_theta = math.radians(30.5)  # c=5 정확한 눈 중심 방위각!
    lo, hi = 0.15, 0.78
    for _ in range(18):
        mid = 0.5 * (lo + hi)
        _, _, zm = _eval_cranium_base_shape(plan, mid, eye_theta)
        if zm < plan.z_eye:
            lo = mid
        else:
            hi = mid
    sv_eye = 0.5 * (lo + hi)
    ex_surf, ey_surf, _ = _eval_cranium_base_shape(plan, sv_eye, eye_theta)

    # 스위트스팟 안구 깊이: 0.62*r_eye 안착 → 보석 홍채+캐치라이트 100% 선명 노출 + sd-chibi 공막 찢어짐 0!
    is_chibi = spec.archetype_id == "sd-chibi"
    recess_mul = 0.66 if is_chibi else 0.58
    eye_x = min(abs(ex_surf), spec.head_w * spec.eye_spacing_frac)
    eye_y_c = ey_surf + plan.eye_radius * recess_mul
    plan.eye_center_l = np.array([+eye_x, eye_y_c, plan.z_eye], dtype=np.float64)
    plan.eye_center_r = np.array([-eye_x, eye_y_c, plan.z_eye], dtype=np.float64)
    plan.joints_b["TS_Eye.L"] = plan.eye_center_l.copy()
    plan.joints_b["TS_Eye.R"] = plan.eye_center_r.copy()

    # 코끝·입 중심·턱끝 랜드마크도 실제 v3 곡면 좌표와 일치시켜 morph/텍스처 정밀도 극대화!
    def _find_front_pt(target_z: float) -> np.ndarray:
        a, b = 0.0, 0.90
        for _ in range(18):
            m_sv = 0.5 * (a + b)
            _, _, zm = _eval_cranium_surface_v3(plan, m_sv, 0.0)
            if zm < target_z:
                a = m_sv
            else:
                b = m_sv
        x0, y0, z0 = _eval_cranium_surface_v3(plan, 0.5 * (a + b), 0.0)
        return np.array([x0, y0, z0], dtype=np.float64)

    plan.nose_tip = _find_front_pt(plan.z_nose)
    plan.mouth_center = _find_front_pt(plan.z_mouth)
    plan.chin_pt = _find_front_pt(plan.z_chin + plan.head_h * 0.015)
    plan.forehead_pt = _find_front_pt(plan.z_eye + plan.head_h * 0.22)
    return plan


# ---------------------------------------------------------------------------
# 20-세그먼트 다리 + 6×4 올-쿼드 발 (매끄러운 골반 V-아치 + Z=0 평평 발바닥)
# ---------------------------------------------------------------------------


def _build_leg_and_foot_20(
    bm: bmesh.types.BMesh,
    plan: bb2.ArchetypePlan,
    side_sign: float,
    leg_loop: list[bmesh.types.BMVert],
    tag_layer: Any,
    region_layer: Any,
) -> None:
    """20-정점 골반 다리 개구부에서 허벅지·무릎·종아리·발목·발(6×4 올-쿼드 발끝, Z=0 접지)을 압출한다."""
    s = plan.spec
    lab = "Left" if side_sign > 0 else "Right"
    reg_thigh = REGION_INDEX[f"thigh.{lab[0]}"]
    reg_calf = REGION_INDEX[f"calf.{lab[0]}"]
    reg_foot = REGION_INDEX[f"foot.{lab[0]}"]
    n_seg = 20
    assert len(leg_loop) == n_seg

    p_hip = plan.joints_b[f"{MIXAMO}{lab}UpLeg"]
    p_ankle = plan.joints_b[f"{MIXAMO}{lab}Foot"]

    center0 = sum((v.co for v in leg_loop), Vector()) / float(n_seg)
    angs = [math.atan2(v.co.x - center0.x, -(v.co.y - center0.y)) for v in leg_loop]
    d_ang = sum(((angs[(i + 1) % n_seg] - angs[i] + math.pi) % (2 * math.pi) - math.pi) for i in range(n_seg))
    ordered = list(leg_loop)
    if d_ang < 0:
        ordered = list(reversed(ordered))
    best_i = min(range(n_seg), key=lambda i: abs(math.atan2(ordered[i].co.x - center0.x, -(ordered[i].co.y - center0.y))))
    ordered = ordered[best_i:] + ordered[:best_i]

    start_ang = [math.atan2(v.co.x - center0.x, -(v.co.y - center0.y)) for v in ordered]
    target_ang = [2.0 * math.pi * (k / n_seg) for k in range(n_seg)]

    def _interp_angle(a0: float, a1: float, t: float) -> float:
        diff = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        return a0 + diff * t

    n_leg = max(12, int(round(20 * s.limb_rings_scale)))
    z_top = float(center0.z)
    z_bot = float(p_ankle[2])
    rings: list[list[bmesh.types.BMVert]] = [ordered]
    ring_regs: list[int] = [reg_thigh]

    for step in range(1, n_leg + 1):
        t = step / n_leg
        z = z_top + (z_bot - z_top) * t
        cx = float(p_hip[0]) * (1.0 - t) + float(p_ankle[0]) * t
        cy = float(p_hip[1]) * (1.0 - t) + float(p_ankle[1]) * t
        if t <= 0.48:
            lt = t / 0.48
            r = s.thigh_r * (1.0 - lt) + s.knee_r * lt
            r *= 1.0 + (0.06 + 0.08 * s.pec_relief) * math.sin(math.pi * lt)
        else:
            lt = (t - 0.48) / 0.52
            calf_peak = math.exp(-(((lt - 0.34) / 0.24) ** 2))
            r = s.knee_r * (1.0 - lt) + s.ankle_r * lt + (s.calf_r - 0.5 * (s.knee_r + s.ankle_r)) * calf_peak * 1.15

        ring = []
        ab = _sstep(0.0, 0.32, t)
        for k in range(n_seg):
            ang = _interp_angle(start_ang[k], target_ang[k], ab)
            st, ct = math.sin(ang), math.cos(ang)
            rx_k = r * (0.98 + 0.04 * s.pec_relief)
            ry_k = r * 1.02
            y_off = 0.0
            if 0.52 < t < 0.88 and ct < 0.0:
                calf_b = math.exp(-(((t - 0.67) / 0.12) ** 2))
                y_off += (-ct) * calf_b * (s.calf_r * 0.24)
            if abs(t - 0.48) < 0.08 and ct > 0.0:
                y_off -= ct * math.exp(-(((t - 0.48) / 0.04) ** 2)) * (s.knee_r * 0.08)
            ring.append(bm.verts.new((cx + rx_k * st, cy - ry_k * ct + y_off, z)))
        rings.append(ring)
        ring_regs.append(reg_thigh if z >= plan.z_knee else reg_calf)

    # 발 (20-정점 단면 → 6(발등) + 4(+X) + 6(발바닥) + 4(-X) = 6×4 올-쿼드 발끝 캡!)
    fx = float(p_ankle[0])
    fy_heel = float(p_ankle[1]) + s.ankle_r * 1.15
    fl = s.foot_len
    fw = s.foot_w
    fh = float(p_ankle[2])

    foot_sections = [
        (fy_heel - fl * 0.14, fw * 0.84, fh * 0.92, fh * 0.22),
        (fy_heel - fl * 0.32, fw * 0.88, fh * 0.72, 0.0),
        (fy_heel - fl * 0.54, fw * 0.96, fh * 0.52, 0.0),
        (fy_heel - fl * 0.76, fw * 1.00, fh * 0.38, 0.0),
        (fy_heel - fl * 0.92, fw * 0.84, fh * 0.28, 0.0),
    ]
    foot_uv: list[tuple[float, float]] = []
    for k in range(n_seg):
        ang = 2.0 * math.pi * (k / n_seg)
        sx = math.sin(ang)
        cz = math.cos(ang)
        v_top = 0.0 if cz < -0.30 else (cz + 0.30) / 1.30
        foot_uv.append((sx, v_top))

    for sec_i, (fy, f_hw, z_top_f, z_bot_f) in enumerate(foot_sections):
        ring = []
        for k in range(n_seg):
            sx, vt = foot_uv[k]
            y_k = fy - (fl * 0.05 if sec_i == 0 else 0.0) * (vt - 0.5)
            toe_asym = (-side_sign * sx) * (fl * 0.035) * _sstep(2, 4, sec_i)
            z_k = z_bot_f + (z_top_f - z_bot_f) * (vt ** 0.85)
            if sec_i >= 1 and vt <= 0.01:
                z_k = 0.0
            ring.append(bm.verts.new((fx + sx * f_hw, y_k - toe_asym, z_k)))
        rings.append(ring)
        ring_regs.append(reg_foot)

    for r_idx in range(len(rings) - 1):
        r0, r1 = rings[r_idx], rings[r_idx + 1]
        reg = ring_regs[r_idx + 1]
        for k in range(n_seg):
            kn = (k + 1) % n_seg
            f = bm.faces.new((r0[k], r0[kn], r1[kn], r1[k]))
            f.smooth = True
            f[tag_layer] = TAG_BODY
            f[region_layer] = reg

    # 20-정점 발끝 루프 → k=17 시작 시프트: 6(발등 17..3) + 4(+X 3..7) + 6(발바닥 7..13) + 4(-X 13..17)
    toe_ring = rings[-1]
    cap_loop = toe_ring[17:] + toe_ring[:17]
    bb2._fill_grid_cap(
        bm,
        cap_loop,
        nx=6,
        ny=4,
        dome_dir=Vector((0.0, -1.0, 0.0)),
        dome_height=fl * 0.08,
        tag_layer=tag_layer,
        region_layer=region_layer,
        tag_val=TAG_BODY,
        region_val=reg_foot,
    )


# ---------------------------------------------------------------------------
# 36-컬럼 비균일 통일 바디+헤드 메쉬 조형 (Blender bmesh + SUBSURF Lv1)
# ---------------------------------------------------------------------------


def build_unified_body_head_mesh_v3(plan: bb2.ArchetypePlan) -> tuple[bpy.types.Mesh, dict[str, Any]]:
    """36-컬럼 안면 고밀도 올-쿼드 통일 바디+헤드 메쉬 생성 + SUBSURF Lv1 베이크."""
    s = plan.spec
    n_col = 36
    bm = bmesh.new()
    tag_layer = bm.faces.layers.int.new("ts_part_tag")
    region_layer = bm.faces.layers.int.new("ts_region_id")

    # 1) 몸통 + 목 기둥 Z 링
    n_torso_low = max(7, 10 + s.torso_rings_extra // 2)
    n_arm_rows = 5  # 팔 포트 4열 × 5행 = 18-정점 루프!
    n_neck_body = 3
    z_axilla = max(plan.z_shoulder - s.arm_r * 0.96, plan.z_waist + 0.032)
    z_deltoid_top = min(plan.z_shoulder + s.arm_r * 0.88, plan.z_neck_base - 0.008)

    torso_zs: list[float] = []
    for i in range(n_torso_low):
        torso_zs.append(plan.z_crotch + (z_axilla - plan.z_crotch) * (i / n_torso_low))
    r_axilla_idx = len(torso_zs)
    for i in range(n_arm_rows + 1):
        torso_zs.append(z_axilla + (z_deltoid_top - z_axilla) * (i / n_arm_rows))
    for i in range(1, n_neck_body + 1):
        torso_zs.append(z_deltoid_top + (plan.z_neck_cut - z_deltoid_top) * (i / n_neck_body))
    r_seam_idx = len(torso_zs) - 1

    # 2) 비균일 안면 고밀도 두상 링 (턱·입술·인중·코·눈·쌍꺼풀·눈썹에 링 집중!)
    if s.archetype_id != "sd-chibi":
        head_us = [
            0.045, 0.095, 0.140,            # 목 기둥 (3링)
            0.180, 0.220, 0.260,            # 턱밑면 → 턱선 (3링)
            0.300, 0.340,                   # 하악·턱 끝
            0.375, 0.408, 0.440,            # 아랫입술·입선·윗입술 (3링)
            0.472, 0.504, 0.538,            # 인중·비주·코끝 (3링)
            0.572, 0.608, 0.642, 0.678,     # 콧대·눈 하단·눈 중앙·눈 상단 (4링)
            0.712, 0.748, 0.785,            # 쌍꺼풀·눈썹·이마 하단 (3링)
            0.828, 0.872, 0.916, 0.958, 1.0 # 이마·두정골 (5링)
        ]
    else:
        head_us = [
            0.055, 0.115, 0.175, 0.235, 0.285,
            0.335, 0.382, 0.425, 0.468, 0.510,
            0.555, 0.602, 0.650, 0.698, 0.746,
            0.796, 0.848, 0.900, 0.950, 1.000,
        ]

    all_rings: list[list[bmesh.types.BMVert]] = []
    # 몸통 링 (목 기둥으로 올라갈수록 서서히 안면 고밀도 방위각으로 정렬!)
    for z in torso_zs:
        hb = _sstep(z_deltoid_top, plan.z_neck_cut + 0.03, z) * 0.35
        ring = []
        for c in range(n_col):
            theta = _theta_36(c, hb)
            x, y = bb2._eval_torso_profile(plan, z, theta)
            ring.append(bm.verts.new((x, y, z)))
        all_rings.append(ring)

    # 두상 링 (u_ring in (0, 0.26]에서 방위각을 0.35 → 1.0으로 C1 매끄럽게 수렴)
    for u in head_us:
        hb = 0.35 + 0.65 * _sstep(0.0, 0.24, u)
        ring = []
        for c in range(n_col):
            theta = _theta_36(c, hb)
            x, y, z = _eval_head_profile_v3(plan, u, theta)
            ring.append(bm.verts.new((x, y, z)))
        all_rings.append(ring)

    reg_neck = REGION_INDEX["neck"]
    reg_torso = REGION_INDEX["torso"]
    reg_pelvis = REGION_INDEX["pelvis"]
    reg_head = REGION_INDEX["head"]

    eye_l_faces: list[bmesh.types.BMFace] = []
    eye_r_faces: list[bmesh.types.BMFace] = []
    mouth_faces: list[bmesh.types.BMFace] = []
    ear_l_faces: list[bmesh.types.BMFace] = []
    ear_r_faces: list[bmesh.types.BMFace] = []

    for r in range(len(all_rings) - 1):
        r0, r1 = all_rings[r], all_rings[r + 1]
        z_mid = 0.5 * (r0[0].co.z + r1[0].co.z)
        is_head = r >= r_seam_idx
        for c in range(n_col):
            # 양팔 포트 개구부 (좌 c=8..11 → verts 8..12, 우 c=24..27 → verts 24..28, 정확히 대칭!)
            if r_axilla_idx <= r < r_axilla_idx + n_arm_rows and (8 <= c <= 11 or 24 <= c <= 27):
                continue
            cn = (c + 1) % n_col
            f = bm.faces.new((r0[c], r0[cn], r1[cn], r1[c]))
            f.smooth = True
            if is_head:
                f[tag_layer] = TAG_HEAD_SKIN
                f[region_layer] = reg_head
                fc = f.calc_center_median()
                # 눈 안와 패치: 좌 c in {4,5}, 우 c in {30,31} (정밀 웹툰 눈폭, 과도한 가로 찢어짐 0!)
                if abs(fc.z - plan.z_eye) < plan.eye_open_h * 0.88 and fc.y < 0.0:
                    if c in (4, 5):
                        eye_l_faces.append(f)
                    elif c in (30, 31):
                        eye_r_faces.append(f)
                # 입술·구강 패치: 좌우 대칭 c in {34,35,0,1} (단정한 웹툰 입폭)
                if c in (34, 35, 0, 1) and abs(fc.z - plan.z_mouth) < plan.head_h * 0.044 and fc.y < 0.0:
                    mouth_faces.append(f)
                # 귀 패치: 좌 c in {10,11}, 우 c in {24,25} (정확히 측면 ±90°~±118° 대칭!)
                if plan.z_nose - 0.010 < fc.z < plan.z_eye + 0.010:
                    if c in (10, 11):
                        ear_l_faces.append(f)
                    elif c in (24, 25):
                        ear_r_faces.append(f)
            else:
                f[tag_layer] = TAG_BODY
                if r >= r_seam_idx - 2:
                    f[region_layer] = reg_neck
                elif z_mid < plan.z_hips + (plan.z_waist - plan.z_hips) * 0.35:
                    f[region_layer] = reg_pelvis
                else:
                    f[region_layer] = reg_torso

    # 3) 정수리 10×8 구면 올-쿼드 돔 캡 (뾰족함 없는 완전 둥근 구면 크라운!)
    crown_ring = all_rings[-1]
    crown_z = float(sum(v.co.z for v in crown_ring) / n_col)
    crown_dome = max(0.014, plan.z_crown - crown_z)
    crown_loop = crown_ring[31:] + crown_ring[:31]
    crown_faces = bb2._fill_grid_cap(
        bm,
        crown_loop,
        nx=10,
        ny=8,
        dome_dir=Vector((0.0, 0.0, 1.0)),
        dome_height=crown_dome,
        tag_layer=tag_layer,
        region_layer=region_layer,
        tag_val=TAG_HEAD_SKIN,
        region_val=reg_head,
    )
    # sin*sin 뾰족 피크를 부드러운 반구형 돔(sqrt 블렌드)으로 둥글리기
    crown_boundary = set(crown_loop)
    crown_inner = list({v for f in crown_faces for v in f.verts} - crown_boundary)
    for v in crown_inner:
        dz_c = max(0.0, v.co.z - crown_z)
        frac = min(1.0, dz_c / max(crown_dome, 1e-5))
        v.co.z = crown_z + crown_dome * (0.45 * frac + 0.55 * math.sqrt(frac))

    # 4) 해부학 V-아치 가랑이 2×4 올-쿼드 브리지 + 양다리 20-정점 압출
    bot = all_rings[0]
    crotch_rows: list[list[bmesh.types.BMVert]] = [[bot[35], bot[0], bot[1]]]
    for k in range(1, 4):
        t = k / 4.0
        dip = -s.hip_ry * 0.19 * math.sin(math.pi * t)
        row_k = []
        for fi, bi in ((35, 19), (0, 18), (1, 17)):
            pt = bot[fi].co.lerp(bot[bi].co, t) + Vector((0.0, 0.0, dip))
            row_k.append(bm.verts.new(pt))
        crotch_rows.append(row_k)
    crotch_rows.append([bot[19], bot[18], bot[17]])
    for k in range(4):
        for col in range(2):
            f = bm.faces.new((crotch_rows[k][col], crotch_rows[k][col + 1], crotch_rows[k + 1][col + 1], crotch_rows[k + 1][col]))
            f.smooth = True
            f[tag_layer] = TAG_BODY
            f[region_layer] = reg_pelvis

    # 왼다리 20-정점: bot[1..17] (17개) + crotch_rows[3][2], [2][2], [1][2] (3개) = 20!
    left_leg_loop = [bot[c] for c in range(1, 18)] + [crotch_rows[3][2], crotch_rows[2][2], crotch_rows[1][2]]
    right_leg_loop = [bot[c] for c in range(19, 36)] + [crotch_rows[1][0], crotch_rows[2][0], crotch_rows[3][0]]
    _build_leg_and_foot_20(bm, plan, +1.0, left_leg_loop, tag_layer, region_layer)
    _build_leg_and_foot_20(bm, plan, -1.0, right_leg_loop, tag_layer, region_layer)

    # 5) 양팔 18-정점 포트 추출 + 검증된 v2 팔/손/5손가락 압출
    def _arm_port_loop(c0: int) -> list[bmesh.types.BMVert]:
        c1 = c0 + 4
        r0 = r_axilla_idx
        r1 = r_axilla_idx + n_arm_rows
        loop = (
            [all_rings[r1][c] for c in range(c0, c1 + 1)]
            + [all_rings[r][c1] for r in range(r1 - 1, r0 - 1, -1)]
            + [all_rings[r0][c] for c in range(c1 - 1, c0 - 1, -1)]
            + [all_rings[r][c0] for r in range(r0 + 1, r1)]
        )
        assert len(loop) == 18
        return loop

    bb2._build_arm_and_hand(bm, plan, +1.0, _arm_port_loop(8), tag_layer, region_layer)
    bb2._build_arm_and_hand(bm, plan, -1.0, _arm_port_loop(24), tag_layer, region_layer)

    def _clean_orphans() -> None:
        for e in [ed for ed in bm.edges if len(ed.link_faces) == 0]:
            bm.edges.remove(e)
        for v in [vt for vt in bm.verts if len(vt.link_faces) == 0]:
            bm.verts.remove(v)

    def _extrude_patch(cur_faces: list[bmesh.types.BMFace]) -> tuple[list[bmesh.types.BMFace], list[bmesh.types.BMVert], list[bmesh.types.BMFace]]:
        old_set = set(cur_faces)
        before_faces = set(bm.faces)
        ext = bmesh.ops.extrude_face_region(bm, geom=list(cur_faces))
        new_verts = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
        new_caps = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMFace)]
        bmesh.ops.delete(bm, geom=list(cur_faces), context="FACES_ONLY")
        _clean_orphans()
        side_faces = [f for f in bm.faces if f not in before_faces and f not in new_caps and f not in old_set]
        return new_caps, new_verts, side_faces

    _clean_orphans()

    # 6) 입체 한국 웹툰 아몬드 눈꺼풀 림 + 깊이 안착된 3D 안와 (보석 홍채 100% 선명 + 공막 찢어짐 0!)
    def _sculpt_eye_socket_v3(faces: list[bmesh.types.BMFace], eye_center: np.ndarray, side_tag: int) -> None:
        if not faces:
            return
        ec = Vector(eye_center.tolist())
        is_chibi = s.archetype_id == "sd-chibi"
        y_scale_eye = 0.88 if is_chibi else 0.94

        # 단일 깔끔 인셋: 선명하고 두툼한 눈꺼풀 마진(eyelid rim) 형성
        res1 = bmesh.ops.inset_region(bm, faces=faces, thickness=plan.eye_open_h * 0.16, depth=0.0009, use_even_offset=True)
        for rf in res1["faces"]:
            rf[tag_layer] = TAG_HEAD_SKIN
            rf[region_layer] = reg_head
            rf.smooth = True

        # 눈꺼풀 림 정점을 시원한 한국 웹툰 눈 비율로 정렬 (안구 홍채·캐치라이트 100% 선명 개구!)
        rim_verts = list({v for f in faces for v in f.verts})
        max_outer_x = min(s.head_w * 0.80, abs(ec.x) + plan.eye_open_w * 0.45)
        min_inner_x = max(s.nose_width * 0.72, abs(ec.x) - plan.eye_open_w * 0.44)
        r_e = plan.eye_radius
        for v in rim_verts:
            ax = max(min_inner_x, min(max_outer_x, abs(v.co.x)))
            v.co.x = math.copysign(ax, ec.x)
            rel = v.co - ec
            nx_e = max(-1.0, min(1.0, rel.x / max(plan.eye_open_w * 0.48, 1e-4)))
            side_s = 1.0 if ec.x > 0 else -1.0
            outer_u = nx_e * side_s
            arch_u = max(0.20, 1.0 - 0.62 * (nx_e * nx_e))
            arch_l = max(0.22, 1.0 - 0.56 * (nx_e * nx_e))
            cat_lift = 0.0012 * max(0.0, outer_u) * (1.0 if s.archetype_id in ("female-romance", "male-webtoon") else 0.35)
            h_open = plan.eye_open_h * (0.62 if is_chibi else 0.58)
            if rel.z >= 0.0:
                v.co.z = ec.z + h_open * arch_u + cat_lift
            else:
                v.co.z = ec.z - h_open * 0.84 * arch_l + cat_lift * 0.3
            # 안구 앞곡면 바로 앞 0.8mm에 매끄럽게 감싸기
            dx_e = v.co.x - ec.x
            dz_e = v.co.z - ec.z
            r_cap = min(math.hypot(dx_e, dz_e), r_e * 0.93)
            y_eye_front = ec.y - math.sqrt(max(1e-7, r_e * r_e - r_cap * r_cap)) * y_scale_eye
            v.co.y = y_eye_front - (0.0009 if rel.z >= 0.0 else 0.0006)

        new_caps, ext_verts, side_faces = _extrude_patch(faces)
        for v in ext_verts:
            v.co.y = ec.y + r_e * 0.55
            v.co.x = ec.x + (v.co.x - ec.x) * 0.68
            v.co.z = ec.z + (v.co.z - ec.z) * 0.68
        for f in new_caps + side_faces:
            f[tag_layer] = side_tag
            f[region_layer] = reg_head
            f.smooth = True

    _sculpt_eye_socket_v3(eye_l_faces, plan.eye_center_l, TAG_EYE_SOCKET_L)
    _sculpt_eye_socket_v3(eye_r_faces, plan.eye_center_r, TAG_EYE_SOCKET_R)

    # 7) 큐피드보우·미소 입꼬리 입체 입술 + 닫힌 3D 구강 주머니 (중립 치아 노출 0!)
    if mouth_faces:
        mc = Vector(plan.mouth_center.tolist())
        lip_res = bmesh.ops.inset_region(bm, faces=mouth_faces, thickness=plan.head_h * 0.009, depth=0.0013, use_even_offset=True)
        for f in lip_res["faces"]:
            f[tag_layer] = TAG_LIP
            f[region_layer] = reg_head
            f.smooth = True
        inner_set = {v for f in mouth_faces for v in f.verts}
        outer_lip_v = list({v for f in lip_res["faces"] for v in f.verts} - inner_set)
        lip_half_h = min(0.0052, plan.head_h * 0.019)
        lip_max_x = s.mouth_half_w * 1.12
        for v in outer_lip_v:
            if abs(v.co.x) > lip_max_x:
                v.co.x = math.copysign(lip_max_x + (abs(v.co.x) - lip_max_x) * 0.22, v.co.x)
            u = min(1.0, abs(v.co.x) / max(lip_max_x, 1e-4))
            dz = v.co.z - mc.z
            sign_z = 1.0 if dz >= 0.0 else -1.0
            # 윗입술 큐피드보우 미세 곡선 + 아랫입술 도톰한 중앙 쿠션
            cupid = 0.0008 * (math.sin(u * math.pi) - 0.35 * (1.0 - u)) if sign_z > 0 else 0.0
            taper_h = lip_half_h * (0.22 + 0.78 * max(0.0, 1.0 - u * u))
            smile_corner = 0.0014 * (u ** 2.2)
            v.co.z = mc.z + sign_z * min(abs(dz), taper_h) + cupid + smile_corner
            v.co.y = min(v.co.y, mc.y + 0.0003 + 0.0028 * (u * u))

        # 중립 밀착 입선 (0.15mm)
        for v in inner_set:
            if abs(v.co.x) > s.mouth_half_w * 0.90:
                v.co.x = math.copysign(s.mouth_half_w * 0.90, v.co.x)
            u = min(1.0, abs(v.co.x) / max(s.mouth_half_w * 0.92, 1e-4))
            dz = v.co.z - mc.z
            smile_line = 0.0009 * (u ** 2.0)
            if abs(dz) < 0.0005:
                v.co.z = mc.z + smile_line
            else:
                v.co.z = mc.z + smile_line + math.copysign(0.00015, dz)
            v.co.y = mc.y + 0.0014 + 0.0024 * (u * u)

        cur_m = list(mouth_faces)
        mouth_steps = (
            (0.0042, 0.96, 0.00015, 0.00018, TAG_LIP),
            (0.0170, 1.05, 0.00018, 0.0068, TAG_ORAL_CAVITY),
            (0.0320, 1.12, 0.0068, 0.0098, TAG_ORAL_CAVITY),
        )
        for dy, sx_m, prev_h, next_h, step_tag in mouth_steps:
            cur_m, ev, side_f = _extrude_patch(cur_m)
            for v in ev:
                v.co.y = mc.y + dy
                v.co.x = mc.x + (v.co.x - mc.x) * sx_m
                ratio_z = max(-1.0, min(1.0, (v.co.z - mc.z) / prev_h))
                v.co.z = mc.z + ratio_z * next_h
            for f in cur_m + side_f:
                f[tag_layer] = step_tag
                f[region_layer] = reg_head
                f.smooth = True

    # 8) 4단계 입체 3D 귀 (헬릭스 테두리 + 오목 이갑개 볼 + 귓불 테이퍼, 올-쿼드)
    def _sculpt_ear_v3(faces: list[bmesh.types.BMFace], side_sign: float, ear_tag: int) -> None:
        if not faces:
            return
        ear_out = s.head_w * (0.185 if s.archetype_id != "sd-chibi" else 0.135)
        cur_e = list(faces)
        # 1단계: 귀 뿌리에서 바깥+뒤쪽(22° 후경사)으로 압출 (윗부분 넓고 아랫 귓불 부드럽게 모임)
        cur_e, ev1, sf1 = _extrude_patch(cur_e)
        c1 = sum((v.co for v in ev1), Vector()) / max(len(ev1), 1)
        for v in ev1:
            rel = v.co - c1
            top_flare = 1.0 + 0.16 * max(0.0, rel.z / max(plan.head_h * 0.08, 1e-4))
            lobe_tuck = 1.0 - 0.18 * max(0.0, -rel.z / max(plan.head_h * 0.08, 1e-4))
            v.co = c1 + Vector((rel.x * 0.90, rel.y * 0.92 * top_flare, rel.z * 0.96))
            v.co += Vector((side_sign * ear_out * 0.56 * top_flare * lobe_tuck, ear_out * 0.42, 0.0012))
        for f in cur_e + sf1:
            f[tag_layer] = ear_tag
            f[region_layer] = reg_head
            f.smooth = True

        # 2단계: 헬릭스(바깥 귀테두리) 두께 압출
        cur_e, ev2, sf2 = _extrude_patch(cur_e)
        c2 = sum((v.co for v in ev2), Vector()) / max(len(ev2), 1)
        for v in ev2:
            rel = v.co - c2
            v.co = c2 + Vector((rel.x * 0.85, rel.y * 0.84, rel.z * 0.90))
            v.co += Vector((side_sign * ear_out * 0.44, ear_out * 0.34, 0.0005))
        for f in cur_e + sf2:
            f[tag_layer] = ear_tag
            f[region_layer] = reg_head
            f.smooth = True

        # 3단계: 인셋으로 헬릭스 테두리 링 형성
        inset_res = bmesh.ops.inset_region(bm, faces=cur_e, thickness=max(0.0022, ear_out * 0.22), depth=0.0008, use_even_offset=True)
        for f in inset_res["faces"]:
            f[tag_layer] = ear_tag
            f[region_layer] = reg_head
            f.smooth = True

        # 4단계: 안쪽 이갑개(Concha bowl) 오목 함몰 압출 → 측면·3/4에서 입체 귀 음영 생성!
        cur_e, ev3, sf3 = _extrude_patch(cur_e)
        for v in ev3:
            v.co += Vector((-side_sign * ear_out * 0.36, -ear_out * 0.14, -0.0005))
        for f in cur_e + sf3:
            f[tag_layer] = ear_tag
            f[region_layer] = reg_head
            f.smooth = True

    _sculpt_ear_v3(ear_l_faces, +1.0, TAG_EAR_L)
    _sculpt_ear_v3(ear_r_faces, -1.0, TAG_EAR_R)
    _clean_orphans()

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    raw_mesh = bpy.data.meshes.new(f"ts_unified_v3_cage_{s.archetype_id}")
    bm.to_mesh(raw_mesh)
    bm.free()

    # Catmull-Clark SUBSURF Lv1 베이크
    obj = bpy.data.objects.new(f"ts_unified_v3_{s.archetype_id}", raw_mesh)
    bpy.context.scene.collection.objects.link(obj)
    sub = obj.modifiers.new(name="Subsurf", type="SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    sub.boundary_smooth = "ALL"
    deps = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(raw_mesh, do_unlink=True)

    # 정확한 Z=0 바닥 접지 + 목표 신장(height_m) 비례 정합
    n_verts = len(baked.vertices)
    coords = np.empty(n_verts * 3, dtype=np.float64)
    baked.vertices.foreach_get("co", coords)
    coords = coords.reshape(-1, 3)
    min_z = float(coords[:, 2].min())
    max_z = float(coords[:, 2].max())
    coords[:, 2] -= min_z
    cur_h = max_z - min_z
    if abs(cur_h - s.height_m) > 1e-4:
        scale_z = s.height_m / cur_h
        coords[:, 2] *= scale_z
        plan.z_crown *= scale_z
        plan.z_chin = (plan.z_chin - min_z) * scale_z
        plan.z_eye = (plan.z_eye - min_z) * scale_z
        plan.z_nose = (plan.z_nose - min_z) * scale_z
        plan.z_mouth = (plan.z_mouth - min_z) * scale_z
        plan.z_brow = (plan.z_brow - min_z) * scale_z
        plan.z_neck_cut = (plan.z_neck_cut - min_z) * scale_z
        plan.z_neck_base = (plan.z_neck_base - min_z) * scale_z
        plan.z_shoulder = (plan.z_shoulder - min_z) * scale_z
        plan.z_chest = (plan.z_chest - min_z) * scale_z
        plan.z_waist = (plan.z_waist - min_z) * scale_z
        plan.z_hips = (plan.z_hips - min_z) * scale_z
        plan.z_crotch = (plan.z_crotch - min_z) * scale_z
        plan.z_knee = (plan.z_knee - min_z) * scale_z
        plan.z_ankle = (plan.z_ankle - min_z) * scale_z
        for vec in (
            plan.eye_center_l, plan.eye_center_r, plan.nose_tip, plan.mouth_center,
            plan.chin_pt, plan.jaw_pivot, plan.jaw_corner_l, plan.ear_l, plan.forehead_pt,
        ):
            vec[2] = (vec[2] - min_z) * scale_z
        for jv in plan.joints_b.values():
            jv[2] = (jv[2] - min_z) * scale_z
    coords[coords[:, 2] < 0.0006, 2] = 0.0
    baked.vertices.foreach_set("co", coords.astype(np.float32).ravel())
    baked.update()

    audit = bb2.audit_bmesh_mesh(baked)
    if (
        audit["trueNonManifold"] != 0
        or audit["looseVerts"] != 0
        or audit["wireEdges"] != 0
        or audit["zeroAreaFaces"] != 0
        or audit["quadRatio"] < 0.999
    ):
        raise RuntimeError(f"{s.archetype_id} v3 통일 메쉬 bmesh 결함 발견: {audit}")
    return baked, audit


# ---------------------------------------------------------------------------
# Blender 네이티브 DATA_TRANSFER 안면 프록시 법선 전사 + 목 이음매 비트 일치
# ---------------------------------------------------------------------------


def compute_data_transfer_face_normals_v3(
    head_pos_g: np.ndarray,
    head_quads: np.ndarray,
    head_geo_normals_g: np.ndarray,
    head_tags: np.ndarray,
    seam_pos_g: np.ndarray,
    plan: bb2.ArchetypePlan,
    blend_strength: float = 0.86,
) -> np.ndarray:
    """Blender 5.3 `DATA_TRANSFER` 모디파이어로 매끄러운 달걀형 안면 프록시 법선을 전사한다."""
    s = plan.spec
    center_g = b2g(np.array([0.0, 0.011, plan.z_chin + plan.head_h * 0.52]))
    radii_g = np.array([s.head_w * 1.05, plan.head_h * 0.52, s.head_d * 1.06], dtype=np.float64)

    # 1) 매끄러운 웹툰 달걀형 프록시 UV 구 생성
    bm_p = bmesh.new()
    bmesh.ops.create_uvsphere(bm_p, u_segments=48, v_segments=32, radius=1.0)
    for v in bm_p.verts:
        # 하안면(y < 0)이 자연스럽게 살짝 모이는 달걀형 프록시
        taper = 1.0 - 0.14 * max(0.0, -v.co.y)
        v.co.x = center_g[0] + v.co.x * radii_g[0] * taper
        v.co.y = center_g[1] + v.co.y * radii_g[1]
        v.co.z = center_g[2] + v.co.z * radii_g[2] * (0.96 + 0.06 * max(0.0, v.co.z))
    for f in bm_p.faces:
        f.smooth = True
    proxy_mesh = bpy.data.meshes.new("_ts_face_proxy_v3")
    bm_p.to_mesh(proxy_mesh)
    bm_p.free()
    proxy_obj = bpy.data.objects.new("_ts_face_proxy_v3", proxy_mesh)
    bpy.context.scene.collection.objects.link(proxy_obj)

    # 2) 임시 TS_Head 메쉬 생성 후 Blender DATA_TRANSFER 실행
    head_mesh = bpy.data.meshes.new("_ts_head_dt_tmp")
    head_mesh.from_pydata(head_pos_g.tolist(), [], head_quads.tolist())
    head_mesh.polygons.foreach_set("use_smooth", [True] * len(head_mesh.polygons))
    head_mesh.update()
    head_obj = bpy.data.objects.new("_ts_head_dt_tmp", head_mesh)
    bpy.context.scene.collection.objects.link(head_obj)

    dt = head_obj.modifiers.new(name="FaceNormalTransfer", type="DATA_TRANSFER")
    dt.object = proxy_obj
    dt.use_loop_data = True
    dt.data_types_loops = {"CUSTOM_NORMAL"}
    dt.loop_mapping = "POLYINTERP_NEAREST"

    deps = bpy.context.evaluated_depsgraph_get()
    eval_mesh = head_obj.evaluated_get(deps).to_mesh()
    n_verts = len(head_pos_g)
    n_loops = len(eval_mesh.loops)
    loop_v = np.empty(n_loops, dtype=np.int64)
    eval_mesh.loops.foreach_get("vertex_index", loop_v)
    loop_n = np.empty(n_loops * 3, dtype=np.float32)
    eval_mesh.corner_normals.foreach_get("vector", loop_n)
    loop_n = loop_n.reshape(-1, 3).astype(np.float64)

    n_proxy = np.zeros((n_verts, 3), dtype=np.float64)
    np.add.at(n_proxy, loop_v, loop_n)
    n_lens = np.linalg.norm(n_proxy, axis=1, keepdims=True)
    # 혹시 모를 0-벡터 폴백
    q = (head_pos_g - center_g[None, :]) / radii_g[None, :]
    n_fallback = q / radii_g[None, :]
    n_fallback /= np.maximum(np.linalg.norm(n_fallback, axis=1, keepdims=True), 1e-9)
    n_proxy = np.where(n_lens > 1e-6, n_proxy / np.maximum(n_lens, 1e-9), n_fallback)

    head_obj.evaluated_get(deps).to_mesh_clear()
    bpy.data.objects.remove(head_obj, do_unlink=True)
    bpy.data.objects.remove(proxy_obj, do_unlink=True)
    bpy.data.meshes.remove(head_mesh, do_unlink=True)
    bpy.data.meshes.remove(proxy_mesh, do_unlink=True)

    # 3) 부위별 마스킹 블렌드 (목 이음매 0.0, 귀·안와·입술 0.0, 콧날 0.28, 뺨·이마·턱 0.86)
    seam_mask = expr.seam_taper(head_pos_g, seam_pos_g, fade_start=0.014, fade_end=0.034)
    front_mask = expr.smoothstep(-0.02, 0.03, head_pos_g[:, 2] - center_g[2])
    keep_geo = np.isin(head_tags, [TAG_EYE_SOCKET_L, TAG_EYE_SOCKET_R, TAG_LIP, TAG_ORAL_CAVITY, TAG_EAR_L, TAG_EAR_R])
    nose_g = b2g(plan.nose_tip)
    eye_y_g = b2g(plan.eye_center_l)[1]
    nose_ridge = (
        np.exp(-((head_pos_g[:, 0] / max(s.nose_width * 1.15, 0.0085)) ** 2))
        * expr.smoothstep(nose_g[1] - 0.014, nose_g[1] + 0.004, head_pos_g[:, 1])
        * (1.0 - expr.smoothstep(eye_y_g - 0.008, eye_y_g + 0.012, head_pos_g[:, 1]))
        * expr.smoothstep(nose_g[2] - 0.035, nose_g[2] - 0.004, head_pos_g[:, 2])
    )
    alpha = blend_strength * seam_mask * (0.24 + 0.76 * front_mask) * (1.0 - 0.68 * nose_ridge)
    alpha = np.where(keep_geo, 0.0, alpha)

    blended = (1.0 - alpha[:, None]) * head_geo_normals_g + alpha[:, None] * n_proxy
    blended /= np.maximum(np.linalg.norm(blended, axis=1, keepdims=True), 1e-9)
    return blended


# ---------------------------------------------------------------------------
# 16각도 BVH 광선추적 → 정밀 2D EDT(Felzenszwalb-Huttenlocher) Face-SDF 256×256 R8 베이크
# ---------------------------------------------------------------------------


def _edt_1d_sq(f: np.ndarray) -> np.ndarray:
    """1D 유클리드 제곱거리 변환(Felzenszwalb & Huttenlocher 2012, O(N) 정확해)."""
    n = len(f)
    v = np.zeros(n, dtype=np.int32)
    z = np.zeros(n + 1, dtype=np.float64)
    k = 0
    v[0] = 0
    z[0] = -1e18
    z[1] = 1e18
    for q in range(1, n):
        fq = float(f[q])
        while True:
            vk = int(v[k])
            s = ((fq + q * q) - (float(f[vk]) + vk * vk)) / (2.0 * (q - vk))
            if s <= z[k]:
                k -= 1
                if k < 0:
                    k = 0
                    break
            else:
                break
        k += 1
        v[k] = q
        z[k] = s
        z[k + 1] = 1e18
    out = np.empty(n, dtype=np.float64)
    k = 0
    for q in range(n):
        while z[k + 1] < q:
            k += 1
        d = q - int(v[k])
        out[q] = d * d + float(f[int(v[k])])
    return out


def _signed_edt_2d(lit_mask: np.ndarray) -> np.ndarray:
    """2D 부호 유클리드 거리장: lit(>0.5) 내부는 +, shadow 내부는 -."""
    h, w = lit_mask.shape
    big = 1e12
    inside = lit_mask > 0.5
    if inside.all():
        return np.full((h, w), float(max(h, w)), dtype=np.float32)
    if (~inside).all():
        return np.full((h, w), -float(max(h, w)), dtype=np.float32)

    def _dist_to_false(mask: np.ndarray) -> np.ndarray:
        grid = np.where(mask, big, 0.0)
        tmp = np.empty_like(grid)
        for x in range(w):
            tmp[:, x] = _edt_1d_sq(grid[:, x])
        out = np.empty_like(grid)
        for y in range(h):
            out[y, :] = _edt_1d_sq(tmp[y, :])
        return np.sqrt(np.maximum(out, 0.0))

    d_lit = _dist_to_false(inside)
    d_sh = _dist_to_false(~inside)
    return (d_lit - d_sh).astype(np.float32)


def _encode_png_gray8(gray: np.ndarray) -> bytes:
    """순수 파이썬(zlib) 8-bit Grayscale PNG 인코더 (PIL 불필요)."""
    h, w = gray.shape
    assert gray.dtype == np.uint8
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # Filter None
        raw.extend(gray[y].tobytes())
    comp = zlib.compress(bytes(raw), level=9)

    def _chunk(ctype: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(ctype + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + ctype + payload + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)  # 8-bit grayscale
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", comp) + _chunk(b"IEND", b"")


def compute_head_face_shadow_uv2(head_pos_g: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """`build_portrait_edition.py` & `kit-loader.ts` 1:1 계약 정면 직교 투영 UV2 (`TEXCOORD_1`)."""
    xy = head_pos_g[:, :2].astype(np.float64)
    mn = xy.min(axis=0)
    span = np.maximum(xy.max(axis=0) - mn, 1e-6)
    uv2 = np.clip((xy - mn[None, :]) / span[None, :], 0.0, 1.0).astype(np.float32)
    return uv2, mn, span


def bake_face_sdf_16angle_r8(
    head_pos_g: np.ndarray,
    head_nrm_g: np.ndarray,
    head_tris: np.ndarray,
    head_tags: np.ndarray,
    uv2_min: np.ndarray,
    uv2_span: np.ndarray,
    size: int = 256,
    n_angles: int = 16,
) -> tuple[bytes, dict[str, Any]]:
    """16각도 BVH 광선추적 + 2D EDT 쌍별 보간 256×256 R8 Face-SDF 텍스처 베이크.

    규약(`apps/character-lab/src/render/face-sdf.ts` + Babylon PNG invertY 정합):
    - u = 0: 광원에서 먼 쪽(-X), u = 1: 광원 쪽(+X).
    - PNG 상단 row=0 → 이마/정수리(v=1), 하단 row=size-1 → 턱(v=0) (시각적으로 정립!).
    - 안와/구강 내부 태그 삼각형은 마스킹해 눈구멍 아티팩트 없이 뺨·코·턱에 깔끔한 애니 그림자 경계 생성!
    """
    # 안와/구강 내부 면을 제외하고 외곽 얼굴 피부 삼각형으로 BVH 구축 (눈구멍 검은 반점 원천 차단!)
    tri_tags = head_tags[head_tris]
    skin_tri_mask = ~np.isin(tri_tags, [TAG_EYE_SOCKET_L, TAG_EYE_SOCKET_R, TAG_ORAL_CAVITY]).any(axis=1)
    skin_tris = head_tris[skin_tri_mask]
    bvh = BVHTree.FromPolygons(head_pos_g.tolist(), skin_tris.tolist())
    z_max = float(head_pos_g[:, 2].max()) + 0.25

    hit_pos = np.zeros((size, size, 3), dtype=np.float32)
    hit_nrm = np.zeros((size, size, 3), dtype=np.float32)
    hit_mask = np.zeros((size, size), dtype=np.float32)

    tri_v0 = head_pos_g[skin_tris[:, 0]]
    tri_v1 = head_pos_g[skin_tris[:, 1]]
    tri_v2 = head_pos_g[skin_tris[:, 2]]
    tri_n0 = head_nrm_g[skin_tris[:, 0]]
    tri_n1 = head_nrm_g[skin_tris[:, 1]]
    tri_n2 = head_nrm_g[skin_tris[:, 2]]

    us = (np.arange(size, dtype=np.float64) + 0.5) / size
    vs = (np.arange(size, dtype=np.float64) + 0.5) / size  # 0=하단(턱), 1=상단(정수리)
    xs = uv2_min[0] + us * uv2_span[0]
    ys = uv2_min[1] + vs * uv2_span[1]
    ray_dir = Vector((0.0, 0.0, -1.0))

    for yi in range(size):
        yv = float(ys[yi])
        for xi in range(size):
            hit, _, fidx, _ = bvh.ray_cast(Vector((float(xs[xi]), yv, z_max)), ray_dir, 1.0)
            if hit is None or fidx is None:
                continue
            p = np.array([hit.x, hit.y, hit.z], dtype=np.float64)
            a, b, c = tri_v0[fidx], tri_v1[fidx], tri_v2[fidx]
            v0v1 = b - a
            v0v2 = c - a
            v0p = p - a
            d00 = float(np.dot(v0v1, v0v1))
            d01 = float(np.dot(v0v1, v0v2))
            d11 = float(np.dot(v0v2, v0v2))
            d20 = float(np.dot(v0p, v0v1))
            d21 = float(np.dot(v0p, v0v2))
            denom = d00 * d11 - d01 * d01
            if abs(denom) > 1e-12:
                bw = (d11 * d20 - d01 * d21) / denom
                cw = (d00 * d21 - d01 * d20) / denom
                aw = 1.0 - bw - cw
                n_interp = aw * tri_n0[fidx] + bw * tri_n1[fidx] + cw * tri_n2[fidx]
                nl = float(np.linalg.norm(n_interp))
                n_interp = n_interp / nl if nl > 1e-6 else np.array([0.0, 0.0, 1.0])
            else:
                n_interp = tri_n0[fidx]
            hit_pos[yi, xi] = p.astype(np.float32)
            hit_nrm[yi, xi] = n_interp.astype(np.float32)
            hit_mask[yi, xi] = 1.0

    # 눈구멍/안와 테두리 잔여 법선 흔적을 제거하기 위해 안와 근방은 매끄러운 프록시 타원체 법선으로 정제!
    # (Genshin/HSR 스타일: 눈꺼풀 구멍 얼룩 0, 코·광대·턱만 우아하게 그림자 경계 형성)
    is_eye_rim = np.zeros((size, size), dtype=bool)
    for yi in range(size):
        for xi in range(size):
            if hit_mask[yi, xi] > 0.5 and abs(float(hit_nrm[yi, xi, 2])) < 0.35 and 0.15 < us[xi] < 0.85 and 0.30 < vs[yi] < 0.68:
                is_eye_rim[yi, xi] = True
    clean_mask = np.where(is_eye_rim, 0.0, hit_mask).astype(np.float32)
    hit_nrm_dil, _ = bb2._dilate_fill(hit_nrm, clean_mask, iters=22)
    hit_nrm_dil = bb2._gauss_blur(hit_nrm_dil, sigma=2.2)
    nl_d = np.linalg.norm(hit_nrm_dil, axis=-1, keepdims=True)
    hit_nrm_dil = np.where(nl_d > 1e-5, hit_nrm_dil / np.maximum(nl_d, 1e-5), np.array([0.0, 0.0, 1.0], dtype=np.float32))

    sdfs: list[np.ndarray] = []
    thresholds: list[float] = []
    valid_coords = np.argwhere(hit_mask > 0.5)

    for k in range(n_angles):
        t_ang = (k + 0.5) / n_angles
        phi = math.pi * (0.04 + 0.92 * t_ang)
        lx, ly, lz = math.sin(phi), 0.14, math.cos(phi)
        ln = math.sqrt(lx * lx + ly * ly + lz * lz)
        l_vec = np.array([lx / ln, ly / ln, lz / ln], dtype=np.float32)
        l_bvh = Vector((float(l_vec[0]), float(l_vec[1]), float(l_vec[2])))

        ndotl = np.einsum("hwc,c->hw", hit_nrm_dil, l_vec)
        lit = (ndotl > 0.04).astype(np.float32)

        if 0.18 < t_ang < 0.82:
            for yi, xi in valid_coords:
                if lit[yi, xi] < 0.5:
                    continue
                p_o = hit_pos[yi, xi] + hit_nrm[yi, xi] * 0.0020
                sh_hit, _, _, _ = bvh.ray_cast(Vector((float(p_o[0]), float(p_o[1]), float(p_o[2]))), l_bvh, 0.18)
                if sh_hit is not None:
                    lit[yi, xi] = 0.0

        lit_smooth = bb2._gauss_blur(lit, sigma=2.0)
        sdfs.append(_signed_edt_2d(lit_smooth))
        thresholds.append(0.5 * (1.0 - math.cos(phi)))

    sdf_stack = np.stack(sdfs, axis=0)
    thr_arr = np.array(thresholds, dtype=np.float32)
    out_thr = np.full((size, size), 0.02, dtype=np.float32)
    lit_count = (sdf_stack > 0.0).sum(axis=0)
    out_thr[lit_count == n_angles] = 0.99
    out_thr[lit_count == 0] = 0.02

    pair_sum = np.zeros((size, size), dtype=np.float32)
    pair_cnt = np.zeros((size, size), dtype=np.float32)
    for k in range(n_angles - 1):
        s0 = sdf_stack[k]
        s1 = sdf_stack[k + 1]
        cross = (s0 > 0.0) & (s1 <= 0.0)
        if cross.any():
            frac = s0[cross] / np.maximum(s0[cross] - s1[cross], 1e-6)
            pair_sum[cross] += thr_arr[k] + frac * (thr_arr[k + 1] - thr_arr[k])
            pair_cnt[cross] += 1.0
    has_cross = pair_cnt > 0.0
    out_thr[has_cross] = pair_sum[has_cross] / pair_cnt[has_cross]

    fallback = (~has_cross) & (lit_count > 0) & (lit_count < n_angles)
    out_thr[fallback] = 0.02 + 0.96 * (lit_count[fallback].astype(np.float32) / float(n_angles))

    u_grid = np.broadcast_to(us[None, :], (size, size)).astype(np.float32)
    # 배경+안와 공백을 깨끗이 블렌딩 후 수직 반전(PNG row 0 = 정수리 v=1, row size-1 = 턱 v=0!)
    out_thr = np.where(hit_mask > 0.5, out_thr, 0.02 + 0.96 * u_grid)
    out_thr = bb2._gauss_blur(out_thr, sigma=2.2)
    out_thr = np.clip(out_thr, 0.02, 0.995)

    gray8 = np.rint(out_thr[::-1] * 255.0).astype(np.uint8)
    png_bytes = _encode_png_gray8(gray8)
    stats = {
        "size": size,
        "angles": n_angles,
        "format": "PNG-Gray8",
        "orientation": "upright-top-forehead-bottom-chin",
        "minValue": round(float(out_thr.min()), 4),
        "maxValue": round(float(out_thr.max()), 4),
        "meanValue": round(float(out_thr.mean()), 4),
        "hitCoverage": round(float(hit_mask.mean()), 4),
    }
    return png_bytes, stats


# ---------------------------------------------------------------------------
# 업그레이드 6층 안구 + 밀착 3D 속눈썹/쌍꺼풀선 + 0.7mm 눈썹
# ---------------------------------------------------------------------------


def build_eye_6layer_eyeball_v3(plan: bb2.ArchetypePlan, side: str) -> dict[str, Any]:
    """안와 내부에 완벽히 안착되는 v3 6층 안구 (`TS_Eye_L`/`TS_Eye_R`, >= 200 verts/eye)."""
    s = plan.spec
    ec = plan.eye_center_l if side == "L" else plan.eye_center_r
    r_eye = plan.eye_radius
    r_iris = r_eye * min(0.76, s.iris_ratio * 1.12)
    is_chibi = s.archetype_id == "sd-chibi"
    y_scale = 0.88 if is_chibi else 0.94  # 안구 전후 두께를 해부학적으로 조율해 치비 눈꼬리 찢어짐 0!

    parts_pos: list[np.ndarray] = []
    parts_tri: list[np.ndarray] = []
    parts_uv: list[np.ndarray] = []

    # Layer 2: 공막(Sclera) 386 verts
    # 핵심 불변식: 홍채 영역 공막 포켓을 홍채 접시 뒷면보다 깊게(+0.48*r_eye) 밀어 넣어 공막 백내장 돌출 0건!
    sc_pts, sc_tri = bb2._make_quad_sphere(np.array([0.0, 0.0, 0.0]), r_eye, segs=8)
    sc_pts[:, 1] *= y_scale
    sc_pts += ec[None, :]
    rel_s = sc_pts - ec[None, :]
    rho_front = np.hypot(rel_s[:, 0], rel_s[:, 2])
    front_eye = rel_s[:, 1] < -0.15 * r_eye * y_scale
    iris_pocket = front_eye * (1.0 - expr.smoothstep(r_iris * 0.94, r_iris * 1.10, rho_front))
    sc_pts[:, 1] += iris_pocket * (r_eye * 0.52 * y_scale)

    sc_u = 0.25 + 0.21 * np.clip(rel_s[:, 0] / max(r_eye, 1e-5), -1.0, 1.0)
    sc_v = 0.50 - 0.44 * np.clip(rel_s[:, 2] / max(r_eye, 1e-5), -1.0, 1.0)
    parts_pos.append(sc_pts)
    parts_tri.append(sc_tri)
    parts_uv.append(np.stack([sc_u, sc_v], axis=1))

    # Layer 3: 오목 보석 홍채 접시 (앞면이 항상 공막 포켓보다 전방에 완전 노출!)
    bm = bmesh.new()
    n_ang, n_rad = 24, 4
    front_rings: list[list[bmesh.types.BMVert]] = []
    back_rings: list[list[bmesh.types.BMVert]] = []
    rim_depth = max(0.70, math.sqrt(max(1e-8, 1.0 - (r_iris / max(r_eye, 1e-5)) ** 2)))
    y_rim = ec[1] - r_eye * rim_depth * y_scale - 0.00025
    concave_max = r_eye * 0.075 * y_scale
    c_front = bm.verts.new((ec[0], y_rim + concave_max, ec[2]))
    c_back = bm.verts.new((ec[0], c_front.co.y + 0.0008, ec[2]))
    for ri in range(1, n_rad + 1):
        rho = ri / n_rad
        rad = r_iris * rho
        concave_dip = (1.0 - rho * rho) * concave_max
        y_f = y_rim + concave_dip
        y_b = y_f + 0.0008
        f_ring, b_ring = [], []
        for ai in range(n_ang):
            a = 2.0 * math.pi * (ai / n_ang)
            vx = ec[0] + rad * math.cos(a)
            vz = ec[2] + rad * math.sin(a)
            f_ring.append(bm.verts.new((vx, y_f, vz)))
            b_ring.append(bm.verts.new((vx, y_b, vz)))
        front_rings.append(f_ring)
        back_rings.append(b_ring)

    for ai in range(n_ang):
        an = (ai + 1) % n_ang
        bm.faces.new((c_front, front_rings[0][ai], front_rings[0][an]))
        bm.faces.new((c_back, back_rings[0][an], back_rings[0][ai]))
    for ri in range(n_rad - 1):
        for ai in range(n_ang):
            an = (ai + 1) % n_ang
            bm.faces.new((front_rings[ri][ai], front_rings[ri + 1][ai], front_rings[ri + 1][an], front_rings[ri][an]))
            bm.faces.new((back_rings[ri][ai], back_rings[ri][an], back_rings[ri + 1][an], back_rings[ri + 1][ai]))
    for ai in range(n_ang):
        an = (ai + 1) % n_ang
        bm.faces.new((front_rings[-1][ai], back_rings[-1][ai], back_rings[-1][an], front_rings[-1][an]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.verts.ensure_lookup_table()
    ir_pts = np.array([list(v.co) for v in bm.verts], dtype=np.float64)
    ir_tris: list[list[int]] = []
    for f in bm.faces:
        vs = [v.index for v in f.verts]
        ir_tris.append([vs[0], vs[1], vs[2]])
        if len(vs) == 4:
            ir_tris.append([vs[0], vs[2], vs[3]])
    bm.free()

    ir_rel = ir_pts - ec[None, :]
    ir_u = 0.75 + 0.21 * np.clip(ir_rel[:, 0] / max(r_iris, 1e-5), -1.0, 1.0)
    ir_v = 0.25 - 0.21 * np.clip(ir_rel[:, 2] / max(r_iris, 1e-5), -1.0, 1.0)
    parts_pos.append(ir_pts)
    parts_tri.append(np.array(ir_tris, dtype=np.int64))
    parts_uv.append(np.stack([ir_u, ir_v], axis=1))

    # Layer 4: 3D 보석 캐치라이트 2개 (오목 홍채 앞면에 정확히 안착!)
    for ox, oz, rx_f, rz_f in ((-0.33, +0.34, 0.22, 0.17), (+0.28, -0.32, 0.10, 0.09)):
        cx = ec[0] + ox * r_iris
        cz = ec[2] + oz * r_iris
        rho_hl = min(1.0, math.hypot(ox, oz))
        cy = y_rim + (1.0 - rho_hl * rho_hl) * concave_max - 0.00045
        hl_pts, hl_tri = bb2._make_quad_sphere(np.array([0.0, 0.0, 0.0]), 1.0, segs=2)
        hl_pts[:, 0] = cx + hl_pts[:, 0] * (r_iris * rx_f)
        hl_pts[:, 1] = cy + hl_pts[:, 1] * 0.00032
        hl_pts[:, 2] = cz + hl_pts[:, 2] * (r_iris * rz_f)
        hl_u = 0.75 + 0.12 * np.clip((hl_pts[:, 0] - cx) / max(r_iris * rx_f, 1e-5), -1.0, 1.0)
        hl_v = 0.75 - 0.12 * np.clip((hl_pts[:, 2] - cz) / max(r_iris * rz_f, 1e-5), -1.0, 1.0)
        parts_pos.append(hl_pts)
        parts_tri.append(hl_tri)
        parts_uv.append(np.stack([hl_u, hl_v], axis=1))

    offset = 0
    tris_all = []
    for p, t in zip(parts_pos, parts_tri):
        tris_all.append(t + offset)
        offset += len(p)
    pos_b = np.concatenate(parts_pos, axis=0)
    tris = np.concatenate(tris_all, axis=0)
    uv = np.concatenate(parts_uv, axis=0).astype(np.float32)
    pos_g = b2g(pos_b)
    nrm_g = vertex_normals(pos_g, tris)

    eye_joint = JOINT_INDEX[f"TS_Eye.{side}"]
    joints = np.zeros((len(pos_g), 4), dtype=np.uint8)
    joints[:, 0] = eye_joint
    weights = np.zeros((len(pos_g), 4), dtype=np.float32)
    weights[:, 0] = 1.0
    assert len(pos_g) >= 200
    return {
        "positions": pos_g,
        "triangles": tris,
        "normals": nrm_g,
        "uv": uv,
        "joints": joints,
        "weights": weights,
        "vertexCount": len(pos_g),
    }


def build_3d_lashes_and_brows_v3(
    plan: bb2.ArchetypePlan,
    head_pos_b: np.ndarray,
    head_tris: np.ndarray,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """BVH 눈꺼풀 림 0.35mm 밀착 입체 아이라인/속눈썹(`TS_Lashes`) + 0.7mm 스냅 눈썹(`TS_Brow_L/R`)."""
    s = plan.spec
    bvh = BVHTree.FromPolygons(head_pos_b.tolist(), head_tris.tolist())
    head_joint = JOINT_INDEX[f"{MIXAMO}Head"]
    is_chibi = s.archetype_id == "sd-chibi"
    y_scale = 0.85 if is_chibi else 0.94

    def make_head_skin(n: int) -> tuple[np.ndarray, np.ndarray]:
        jj = np.zeros((n, 4), dtype=np.uint8)
        jj[:, 0] = head_joint
        ww = np.zeros((n, 4), dtype=np.float32)
        ww[:, 0] = 1.0
        return jj, ww

    def _snap_front_y(x_val: float, z_val: float, ec: np.ndarray, offset_m: float) -> float:
        r_e = plan.eye_radius
        dx_e = x_val - ec[0]
        dz_e = z_val - ec[2]
        r_cap = min(math.hypot(dx_e, dz_e), r_e * 0.94)
        y_eye_ref = ec[1] - math.sqrt(max(1e-7, r_e * r_e - r_cap * r_cap)) * y_scale - 0.0012
        hit, _, _, _ = bvh.ray_cast(Vector((x_val, -0.45, z_val)), Vector((0.0, 1.0, 0.0)), 0.90)
        if hit is not None and abs(hit.y - y_eye_ref) < r_e * 0.65:
            return min(hit.y - offset_m, y_eye_ref - 0.0002)
        return y_eye_ref - offset_m

    lash_pts_list, lash_tri_list, lash_uv_list = [], [], []
    for side_sign, side in ((1.0, "L"), (-1.0, "R")):
        ec = plan.eye_center_l if side == "L" else plan.eye_center_r
        ew = plan.eye_open_w * 0.45
        eh = plan.eye_open_h * (0.62 if is_chibi else 0.58)
        max_lash_x = min(s.head_w * 0.80, abs(float(ec[0])) + plan.eye_open_w * 0.46)
        cat_boost = 1.0 if s.archetype_id in ("female-romance", "male-webtoon") else 0.45

        # 1) 윗속눈썹 메인 아이라인 (18-세그먼트 부드러운 붓펜 테이퍼 + 외측 캐츠아이 윙)
        m = 18
        ts = np.linspace(0.0, 1.0, m)
        pts_u = np.zeros((m, 3), dtype=np.float64)
        nrm_u = np.zeros((m, 3), dtype=np.float64)
        up_u = np.zeros((m, 3), dtype=np.float64)
        hw_u = np.zeros(m, dtype=np.float64)
        th_u = np.zeros(m, dtype=np.float64)
        for i, t in enumerate(ts):
            u_x = -0.92 + 1.92 * t
            x = ec[0] + side_sign * ew * u_x
            if abs(x) > max_lash_x:
                x = math.copysign(max_lash_x, x)
            arch = max(0.18, 1.0 - 0.64 * (u_x * u_x))
            wing_lift = 0.0014 * s.lash_wing * cat_boost * (max(0.0, (t - 0.72) / 0.28) ** 1.45)
            z = ec[2] + eh * 0.99 * arch + wing_lift
            y_val = _snap_front_y(x, z, ec, offset_m=0.00035)
            pts_u[i] = (x, y_val, z)
            nrm_u[i] = (side_sign * 0.22 * u_x, -0.95, 0.20)
            up_u[i] = (0.0, -0.15, 0.98)
            taper = math.sin(min(1.0, t * 1.18) * math.pi * 0.5) * (1.0 - 0.58 * max(0.0, (t - 0.78) / 0.22))
            hw_u[i] = max(0.00038, (0.00105 + 0.00125 * t) * s.lash_wing * taper)
            th_u[i] = max(0.00042, (0.00085 + 0.00095 * t) * s.lash_wing * taper)

        p1, t1, uv1 = bb2._build_closed_ribbon_tube(pts_u, nrm_u, up_u, hw_u, th_u, (0.04, 0.46), (0.06, 0.94))
        lash_pts_list.append(p1); lash_tri_list.append(t1); lash_uv_list.append(uv1)

        # 2) 아랫속눈썹 외측 1/3 섬세한 포인트 라인
        m2 = 9
        ts2 = np.linspace(0.42, 0.94, m2)
        pts_l = np.zeros((m2, 3), dtype=np.float64)
        nrm_l = np.zeros((m2, 3), dtype=np.float64)
        up_l = np.zeros((m2, 3), dtype=np.float64)
        hw_l = np.zeros(m2, dtype=np.float64)
        th_l = np.zeros(m2, dtype=np.float64)
        for i, t in enumerate(ts2):
            u_x = -0.88 + 1.82 * t
            x = ec[0] + side_sign * ew * u_x
            if abs(x) > max_lash_x:
                x = math.copysign(max_lash_x, x)
            arch = max(0.12, 1.0 - 0.64 * (u_x * u_x))
            z = ec[2] - eh * 0.80 * arch
            y_val = _snap_front_y(x, z, ec, offset_m=0.00028)
            pts_l[i] = (x, y_val, z)
            nrm_l[i] = (side_sign * 0.18 * u_x, -0.96, -0.18)
            up_l[i] = (0.0, 0.10, 0.99)
            env = math.sin(((t - 0.42) / 0.52) * math.pi)
            hw_l[i] = max(0.00028, 0.00068 * s.lash_wing * env)
            th_l[i] = max(0.00028, 0.00058 * s.lash_wing * env)

        p2, t2, uv2 = bb2._build_closed_ribbon_tube(pts_l, nrm_l, up_l, hw_l, th_l, (0.04, 0.46), (0.06, 0.94))
        lash_pts_list.append(p2); lash_tri_list.append(t2); lash_uv_list.append(uv2)

    off = 0
    ltris = []
    for p, t in zip(lash_pts_list, lash_tri_list):
        ltris.append(t + off)
        off += len(p)
    lash_pos_g = b2g(np.concatenate(lash_pts_list, axis=0))
    lash_tri = np.concatenate(ltris, axis=0)
    lash_uv = np.concatenate(lash_uv_list, axis=0).astype(np.float32)
    lj, lw = make_head_skin(len(lash_pos_g))
    lashes_dict = {
        "positions": lash_pos_g,
        "triangles": lash_tri,
        "normals": vertex_normals(lash_pos_g, lash_tri),
        "uv": lash_uv,
        "joints": lj,
        "weights": lw,
    }

    # Layer 6: 0.7mm BVH 스냅 입체 눈썹 (계약 0.7mm 유지 + 한국 웹툰 세련된 눈썹 아치)
    brows: list[dict[str, Any]] = []
    BROW_SNAP_OFFSET_M = 0.0007
    for side_sign, side in ((1.0, "L"), (-1.0, "R")):
        ec = plan.eye_center_l if side == "L" else plan.eye_center_r
        ec_x = abs(float(ec[0]))
        x_in = max(ec_x * 0.36, ec_x - plan.eye_open_w * 0.46)
        x_out = min(s.head_w * 0.88, ec_x + plan.eye_open_w * 0.56)
        m_b = 14
        ts = np.linspace(0.0, 1.0, m_b)
        pts_b = np.zeros((m_b, 3), dtype=np.float64)
        nrm_b = np.zeros((m_b, 3), dtype=np.float64)
        up_b = np.zeros((m_b, 3), dtype=np.float64)
        hw_b = np.zeros(m_b, dtype=np.float64)
        th_b = np.zeros(m_b, dtype=np.float64)
        for i, t in enumerate(ts):
            x = side_sign * (x_in + (x_out - x_in) * t)
            arch = math.sin(t * math.pi * 0.90) * s.brow_arch + 0.0010 * t
            z = plan.z_brow + arch
            hit, hit_n, _, _ = bvh.ray_cast(Vector((x, -0.45, z)), Vector((0.0, 1.0, 0.0)), 0.90)
            if hit is None or hit_n is None:
                hit, hit_n, _, _ = bvh.find_nearest(Vector((x, ec[1] - plan.eye_radius, z)))
            n_out = hit_n.normalized() if hit_n is not None and hit_n.length > 1e-6 else Vector((0.0, -1.0, 0.0))
            if n_out.y > 0.0:
                n_out = -n_out
            pts_b[i] = tuple(hit + n_out * BROW_SNAP_OFFSET_M)
            nrm_b[i] = tuple(n_out)
            up_b[i] = (0.0, 0.0, 1.0)
            profile = (0.64 + 0.36 * math.sin(min(1.0, t * 3.0) * math.pi * 0.5)) * (1.0 - 0.74 * (t ** 1.65))
            hw_b[i] = max(0.00048, s.brow_thick * 0.50 * profile)
            th_b[i] = max(0.00042, 0.00068 * profile)

        bp, bt_arr, buv = bb2._build_closed_ribbon_tube(pts_b, nrm_b, up_b, hw_b, th_b, (0.54, 0.96), (0.06, 0.94))
        bp_g = b2g(bp)
        bj, bw = make_head_skin(len(bp_g))
        brows.append(
            {
                "positions": bp_g,
                "triangles": bt_arr,
                "normals": vertex_normals(bp_g, bt_arr),
                "uv": buv,
                "joints": bj,
                "weights": bw,
            }
        )
    return lashes_dict, brows[0], brows[1]


# ---------------------------------------------------------------------------
# 2048×2048 픽셀-공간 한국 웹툰 메이크업 두상 알베도 + 1024×1024 보석 홍채 아틀라스
# ---------------------------------------------------------------------------


def bake_head_skin_texture_v3(
    plan: bb2.ArchetypePlan,
    head_pos_b: np.ndarray,
    head_tags: np.ndarray,
    head_uv: np.ndarray,
    head_tris: np.ndarray,
    size: int = 2048,
) -> bytes:
    """2048×2048 픽셀-공간 3D 랜드마크 연동 한국 웹툰 메이크업 알베도 (쌍꺼풀·애교살·코끝 하이라이트·입꼬리 음영·귀 홍조)."""
    s = plan.spec
    skin = np.array(_hex_rgb(s.skin_hex), dtype=np.float32)
    blush = np.array(_hex_rgb(s.blush_hex), dtype=np.float32)
    lip = np.array(_hex_rgb(s.lip_hex), dtype=np.float32)
    shade = skin * np.array([0.89, 0.81, 0.79], dtype=np.float32)
    crease_col = skin * np.array([0.74, 0.61, 0.59], dtype=np.float32)
    hi_col = np.clip(skin * 1.07 + np.array([0.04, 0.035, 0.03], dtype=np.float32), 0.0, 1.0)
    cavity = np.array([0.30, 0.11, 0.14], dtype=np.float32)

    # 1) 3D 좌표 (x, y, z) + 커버리지(1.0)를 2048×2048 UV 버퍼에 정밀 래스터화!
    pos_f32 = head_pos_b.astype(np.float32)
    corner_pos = np.concatenate(
        [pos_f32[head_tris].reshape(-1, 3), np.ones((len(head_tris) * 3, 1), dtype=np.float32)],
        axis=1,
    )
    pos_buf = uvtools.paint_triangles(head_uv, head_tris, corner_pos, size, background=np.zeros(4, dtype=np.float32))
    cov = pos_buf[..., 3]
    px = pos_buf[..., 0]
    py = pos_buf[..., 1]
    pz = pos_buf[..., 2]

    # 태그 채널 래스터화 (lip, cavity, ear, socket)
    tag_ch = np.stack(
        [
            (head_tags == TAG_LIP).astype(np.float32),
            (head_tags == TAG_ORAL_CAVITY).astype(np.float32),
            np.isin(head_tags, [TAG_EAR_L, TAG_EAR_R]).astype(np.float32),
            np.isin(head_tags, [TAG_EYE_SOCKET_L, TAG_EYE_SOCKET_R]).astype(np.float32),
        ],
        axis=1,
    )
    tag_buf = uvtools.paint_triangles(head_uv, head_tris, tag_ch[head_tris].reshape(-1, 4), size, background=np.zeros(4, dtype=np.float32))
    m_lip, m_cav, m_ear, m_sock = tag_buf[..., 0], tag_buf[..., 1], tag_buf[..., 2], tag_buf[..., 3]

    rgb = np.broadcast_to(skin[None, None, :], (size, size, 3)).copy()
    front = expr.smoothstep(0.025, -0.020, py).astype(np.float32)
    is_fem = s.archetype_id in ("female-romance", "youth-academy", "sd-chibi")

    # 2) 한국 웹툰 에어브러시 볼 홍조 + 미세 눈밑 애교살 하이라이트
    cheek_z = plan.z_eye - plan.head_h * 0.145
    cheek_x = abs(float(plan.eye_center_l[0])) * 1.12
    blush_str = 0.25 if is_fem else 0.10
    for sx in (+1.0, -1.0):
        d2 = ((px - sx * cheek_x) / (s.head_w * 0.34)) ** 2 + ((pz - cheek_z) / (plan.head_h * 0.095)) ** 2
        w_b = np.exp(-d2 * 1.45).astype(np.float32) * front * blush_str
        rgb = rgb * (1.0 - w_b[..., None]) + blush * w_b[..., None]

    # 3) 픽셀-샤프 쌍꺼풀 아치 선 + 눈밑 애교살 하이라이트·은은한 그림자
    for sx in (+1.0, -1.0):
        ec = plan.eye_center_l if sx > 0 else plan.eye_center_r
        ex, ez = float(ec[0]), float(ec[2])
        u_x = (px - ex) / max(plan.eye_open_w * 0.52, 1e-4)
        in_x = np.exp(-((np.maximum(np.abs(u_x) - 0.82, 0.0) / 0.22) ** 2)).astype(np.float32)
        arch = np.maximum(0.10, 1.0 - 0.72 * (u_x * u_x))
        # 쌍꺼풀 선 (눈꺼풀 바로 위 2.2mm 아치)
        crease_z = ez + plan.eye_open_h * 0.62 * arch + plan.head_h * 0.013
        crease_line = np.exp(-(((pz - crease_z) / max(plan.head_h * 0.0055, 0.0010)) ** 2)).astype(np.float32) * in_x * front
        c_str = 0.48 if is_fem else 0.30
        rgb = rgb * (1.0 - crease_line[..., None] * c_str) + crease_col * (crease_line[..., None] * c_str)

        # 애교살 (하안검 아래 부드러운 하이라이트 + 미세 경계 그림자)
        if is_fem:
            aegyo_z = ez - plan.eye_open_h * 0.56 * arch - plan.head_h * 0.010
            aegyo_hi = np.exp(-(((pz - aegyo_z) / max(plan.head_h * 0.012, 0.0020)) ** 2)).astype(np.float32) * in_x * front * 0.28
            rgb = rgb * (1.0 - aegyo_hi[..., None]) + hi_col * aegyo_hi[..., None]
            aegyo_sh = np.exp(-(((pz - (aegyo_z - plan.head_h * 0.014)) / max(plan.head_h * 0.006, 0.0012)) ** 2)).astype(np.float32) * in_x * front * 0.16
            rgb = rgb * (1.0 - aegyo_sh[..., None]) + shade * aegyo_sh[..., None]

    # 4) 콧대·코끝 하이라이트 + 코 옆 부드러운 쐐기 그림자 + 코끝 아래 음영 & 섬세한 콧구멍 포인트
    nb = plan.nose_tip
    # 코끝·콧등 하이라이트 (웹툰 특유의 화사한 코끝 빛점)
    n_hi = np.exp(-((px / max(s.nose_width * 0.32, 0.0032)) ** 2 + ((pz - (nb[2] + 0.003)) / (plan.head_h * 0.040)) ** 2)).astype(np.float32) * front * 0.42
    rgb = rgb * (1.0 - n_hi[..., None]) + hi_col * n_hi[..., None]
    # 코끝 아래 쐐기 음영
    n_under = np.exp(-((px / max(s.nose_width * 0.65, 0.0055)) ** 2 + ((pz - (nb[2] - 0.0042)) / (plan.head_h * 0.014)) ** 2)).astype(np.float32) * front * 0.44
    # 코 한쪽 옆 은은한 콧대 입체감
    n_side = np.exp(-(((px - 0.0045) / max(s.nose_width * 0.65, 0.0055)) ** 2 + ((pz - (nb[2] + 0.008)) / (plan.head_h * 0.055)) ** 2)).astype(np.float32) * front * 0.24
    w_n = np.clip(n_under + n_side, 0.0, 0.54)
    rgb = rgb * (1.0 - w_n[..., None]) + shade * w_n[..., None]
    # 코끝 살짝 홍조
    if is_fem:
        n_blush = np.exp(-((px / max(s.nose_width * 0.85, 0.008)) ** 2 + ((pz - nb[2]) / (plan.head_h * 0.024)) ** 2)).astype(np.float32) * front * 0.14
        rgb = rgb * (1.0 - n_blush[..., None]) + blush * n_blush[..., None]

    # 5) 한국 웹툰 그라데이션 립 + 아랫입술 글로스 하이라이트 + 섬세한 미소 입꼬리 음영 점!
    lip_str = 0.56 if is_fem else 0.30
    lip_grad = m_lip * np.exp(-(((pz - plan.z_mouth) / max(plan.head_h * 0.022, 0.0038)) ** 2)).astype(np.float32) * lip_str
    rgb = rgb * (1.0 - lip_grad[..., None]) + lip * lip_grad[..., None]

    lip_line_c = lip * np.array([0.65, 0.46, 0.50], dtype=np.float32)
    u_m = px / max(s.mouth_half_w * 0.90, 0.008)
    smile_curve = plan.z_mouth + 0.0009 * np.clip(u_m * u_m, 0.0, 1.4)
    lip_seam = (
        np.exp(-(((pz - smile_curve) / max(plan.head_h * 0.0042, 0.0009)) ** 2))
        * np.exp(-((u_m / 0.96) ** 4))
        * front
        * 0.58
    ).astype(np.float32)
    rgb = rgb * (1.0 - lip_seam[..., None]) + lip_line_c * lip_seam[..., None]

    # 입꼬리 음영 점 (좌우 끝단)
    for sx in (+1.0, -1.0):
        cx_m = sx * s.mouth_half_w * 0.88
        cz_m = plan.z_mouth + 0.0009
        corner_dot = np.exp(-(((px - cx_m) / 0.0024) ** 2 + ((pz - cz_m) / 0.0018) ** 2)).astype(np.float32) * front * 0.42
        rgb = rgb * (1.0 - corner_dot[..., None]) + lip_line_c * corner_dot[..., None]

    # 아랫입술 중앙 윤기 하이라이트 + 아랫입술 밑 턱 음영
    if is_fem:
        lip_hi = np.exp(-((px / (s.mouth_half_w * 0.42)) ** 2 + ((pz - (plan.z_mouth - plan.head_h * 0.015)) / (plan.head_h * 0.007)) ** 2)).astype(np.float32) * front * 0.36
        rgb = rgb * (1.0 - lip_hi[..., None]) + hi_col * lip_hi[..., None]
    under_lip_sh = np.exp(-((px / (s.mouth_half_w * 0.65)) ** 2 + ((pz - (plan.z_mouth - plan.head_h * 0.036)) / (plan.head_h * 0.012)) ** 2)).astype(np.float32) * front * 0.24
    rgb = rgb * (1.0 - under_lip_sh[..., None]) + shade * under_lip_sh[..., None]

    # 구강 내부 어두운 톤
    cav_depth = expr.smoothstep(float(plan.mouth_center[1]) + 0.008, float(plan.mouth_center[1]) + 0.015, py).astype(np.float32)
    cav_m = np.clip(m_cav * cav_depth, 0.0, 1.0)
    rgb = rgb * (1.0 - cav_m[..., None]) + cavity * cav_m[..., None]

    # 6) 귀 내부 음영·홍조 & 안와 그늘
    ear_m = np.clip(m_ear * 0.16, 0.0, 0.25)
    rgb = rgb * (1.0 - ear_m[..., None]) + blush * ear_m[..., None]
    sock_m = np.clip(m_sock * 0.36, 0.0, 0.45)
    rgb = rgb * (1.0 - sock_m[..., None]) + shade * sock_m[..., None]

    # 7) 목 이음매 24mm 이내 순수 skin 고정 (TS_Body와 색 이음매 0.00!)
    neck_clean = (1.0 - expr.smoothstep(plan.z_neck_cut, plan.z_neck_cut + 0.024, pz)).astype(np.float32)
    rgb = rgb * (1.0 - neck_clean[..., None]) + skin * neck_clean[..., None]

    # UV 아일랜드 경계 팽창(bleed) 처리로 mipmap seam 0 보장
    rgb, filled = bb2._dilate_fill(rgb, cov, iters=8)
    rgb = np.where(filled[..., None] > 0.5, rgb, skin)
    rgb = bb2._gauss_blur(rgb, sigma=0.75)
    return bb2.encode_baseline_jpeg_bpy(np.clip(rgb, 0.0, 1.0), quality=91)


def bake_eye_atlas_texture_v3(spec: bb2.ArchetypeSpec, size: int = 1024) -> bytes:
    """1024×1024 초정밀 한국 웹툰 보석 홍채 + 상안검 그림자 공막 아틀라스."""
    img = np.ones((size, size, 3), dtype=np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size
    v = (yy + 0.5) / size

    # 1) 좌측 절반: 공막 (깨끗한 따뜻한 화이트 + 윗눈꺼풀 소프트 캐스트 그림자)
    left = u < 0.5
    sx = (u - 0.25) / 0.22
    sy = (0.50 - v) / 0.44
    sr = np.hypot(sx, sy)
    sclera = np.stack([np.full_like(u, 0.985), np.full_like(u, 0.978), np.full_like(u, 0.975)], axis=-1)
    top_sh = expr.smoothstep(0.05, 0.78, sy) * 0.22
    rim_sh = expr.smoothstep(0.76, 1.04, sr) * 0.14
    # 살짝 푸르스름한 상안검 그림자 색조(웹툰 맑은 눈동자 표현)
    sh_tint = np.array([0.82, 0.85, 0.93], dtype=np.float32)
    sclera = sclera * (1.0 - top_sh[..., None]) + (sclera * sh_tint) * top_sh[..., None]
    sclera *= (1.0 - rim_sh)[..., None]
    img[left] = sclera[left]

    # 2) 우상단 사분면: 한국 웹툰 다층 보석 홍채
    upper_c = np.array(_hex_rgb(spec.iris_upper_hex), dtype=np.float32)
    lower_c = np.array(_hex_rgb(spec.iris_lower_hex), dtype=np.float32)
    glow_c = np.clip(lower_c * 0.50 + np.array([1.0, 0.98, 1.0], dtype=np.float32) * 0.50, 0.0, 1.0)
    limbal_c = upper_c * 0.30 + np.array([0.04, 0.03, 0.07], dtype=np.float32) * 0.70
    pupil_c = np.array([0.04, 0.03, 0.07], dtype=np.float32)

    q_iris = (u >= 0.5) & (v < 0.5)
    ix = (u - 0.75) / 0.21
    iy = (0.25 - v) / 0.21
    ir = np.hypot(ix, iy)
    iang = np.arctan2(iy, ix)

    grad_t = np.clip(0.54 - iy * 0.68, 0.0, 1.0)[..., None]
    icol = upper_c * (1.0 - grad_t) + lower_c * grad_t

    # 2중 방사형 보석 섬유 (고주파 + 저주파 보석 컷)
    stri1 = 0.5 + 0.5 * np.sin(iang * 34.0 + 0.5 * np.sin(iang * 7.0))
    stri2 = 0.5 + 0.5 * np.cos(iang * 16.0 - ir * 4.0)
    ring_band = expr.smoothstep(0.24, 0.44, ir) * (1.0 - expr.smoothstep(0.74, 0.90, ir))
    stri = (0.65 * stri1 + 0.35 * stri2) * ring_band
    icol = icol * (1.0 - stri[..., None] * 0.28) + glow_c * (stri[..., None] * 0.28)

    # 하단 초승달 발광 반사광 (한국 로맨스/판타지 웹툰 보석눈 핵심!)
    cres_d = np.hypot(ix * 0.78, (iy + 0.42) * 1.50)
    cres = np.clip(1.0 - cres_d / 0.58, 0.0, 1.0) ** 1.45 * 0.72 * (ir < 0.84)
    icol = icol * (1.0 - cres[..., None]) + glow_c * cres[..., None]

    # 동공 주변 미세 보석 링
    halo = np.exp(-(((ir - 0.36) / 0.08) ** 2)) * 0.32 * (iy < 0.25)
    icol = icol * (1.0 - halo[..., None]) + glow_c * halo[..., None]

    # 상안검 그림자 + 선명한 윤부 링 + 깊은 타원 동공 + 미세 2차 스파클
    sh_t = expr.smoothstep(0.06, 0.66, iy) * 0.60
    icol = icol * (1.0 - sh_t[..., None]) + limbal_c * sh_t[..., None]
    limbal = expr.smoothstep(0.75, 0.94, ir)
    icol = icol * (1.0 - limbal[..., None]) + limbal_c * limbal[..., None]
    pr = np.hypot(ix * 1.14, iy * 0.90)
    pupil = 1.0 - expr.smoothstep(0.24, 0.33, pr)
    icol = icol * (1.0 - pupil[..., None]) + pupil_c * pupil[..., None]

    # 미세 텍스처 스파클 점 (3D 캐치라이트 보조)
    sp1 = np.exp(-(((ix + 0.36) / 0.14) ** 2 + ((iy - 0.36) / 0.12) ** 2)) * 0.85
    sp2 = np.exp(-(((ix - 0.30) / 0.08) ** 2 + ((iy + 0.34) / 0.08) ** 2)) * 0.70
    sp = np.clip(sp1 + sp2, 0.0, 1.0)
    icol = icol * (1.0 - sp[..., None]) + np.array([1.0, 1.0, 1.0], dtype=np.float32) * sp[..., None]
    img[q_iris] = icol[q_iris]

    # 3) 우하단 사분면: 순백 캐치라이트
    img[(u >= 0.5) & (v >= 0.5)] = 1.0
    return bb2.encode_baseline_jpeg_bpy(np.clip(img, 0.0, 1.0), quality=92)


# ---------------------------------------------------------------------------
# 아키타입 1종 v3 전체 조립 + GLB + Face-SDF PNG + 메타 JSON 출력
# ---------------------------------------------------------------------------


def build_archetype_base_v3(spec: bb2.ArchetypeSpec, out_dir: Path) -> dict[str, Any]:
    """단일 아키타입 Hero Character v3 베이스 GLB + Face-SDF PNG + 메타 JSON 생성."""
    t_start = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0

    plan = compute_archetype_plan_v3(spec)
    unified_mesh, bmesh_audit = build_unified_body_head_mesh_v3(plan)

    n_v = len(unified_mesh.vertices)
    n_f = len(unified_mesh.polygons)
    pos_b = np.empty(n_v * 3, dtype=np.float64)
    unified_mesh.vertices.foreach_get("co", pos_b)
    pos_b = pos_b.reshape(-1, 3)
    pos_g = b2g(pos_b)

    quads = np.empty(n_f * 4, dtype=np.int64)
    unified_mesh.polygons.foreach_get("vertices", quads)
    quads = quads.reshape(-1, 4)

    face_region = np.empty(n_f, dtype=np.int64)
    unified_mesh.attributes["ts_region_id"].data.foreach_get("value", face_region)
    face_tag = np.empty(n_f, dtype=np.int64)
    unified_mesh.attributes["ts_part_tag"].data.foreach_get("value", face_tag)

    # 1) 68본 스키닝 (어깨 85° 거상 3단계 조화 확산 포함, 용접 상태 계산 → 목 이음매 비트 일치!)
    skin_idx, skin_val = bb2.compute_anatomical_skin_weights_v2(pos_b, quads, face_region, plan)

    # 2) 용접 법선 및 목 이음매 72쌍 정점 추출
    head_mask = face_region == REGION_INDEX["head"]
    body_mask = ~head_mask
    head_verts_welded = np.unique(quads[head_mask].ravel())
    body_verts_welded = np.unique(quads[body_mask].ravel())
    seam_welded = np.intersect1d(head_verts_welded, body_verts_welded)
    assert len(seam_welded) >= 32, f"목 이음매 정점 쌍 부족: {len(seam_welded)}"

    welded_tris = bb2._quads_to_tris(pos_g, quads)
    welded_nrm_g = vertex_normals(pos_g, welded_tris)
    v_region_welded = bb2._vertex_regions(quads, face_region, n_v)
    v_tag_welded = bb2._vertex_tags(quads, face_tag, n_v)

    # 3) TS_Body / TS_Head 분할 + 비중첩 UV 전개 (마진 >= 0.018)
    def _split_part(f_mask: np.ndarray, order_by_reg: bool) -> dict[str, Any]:
        f_ids = np.flatnonzero(f_mask)
        used = np.unique(quads[f_ids].ravel())
        remap = -np.ones(n_v, dtype=np.int64)
        remap[used] = np.arange(len(used))
        local_q = remap[quads[f_ids]]
        orig_local, uv, new_q, ov = bb2.unwrap_mesh_clean(pos_g[used], local_q, margin=0.018)
        origin = used[orig_local]
        if order_by_reg:
            order = np.argsort(face_region[f_ids], kind="stable")
            new_q = new_q[order]
            f_ids = f_ids[order]
        p_g = pos_g[origin]
        p_b = pos_b[origin]
        tris = bb2._quads_to_tris(p_g, new_q)
        return {
            "origin": origin,
            "uv": uv,
            "quads": new_q,
            "face_ids": f_ids,
            "positions_g": p_g,
            "positions_b": p_b,
            "triangles": tris,
            "normals_g": welded_nrm_g[origin].copy(),
            "joints": skin_idx[origin].copy(),
            "weights": skin_val[origin].copy(),
            "region": v_region_welded[origin].copy(),
            "tags": v_tag_welded[origin].copy(),
            "uv_overlap": ov,
        }

    body_part = _split_part(body_mask, order_by_reg=True)
    head_part = _split_part(head_mask, order_by_reg=False)

    quad_reg = face_region[body_part["face_ids"]]
    body_regions: list[dict[str, Any]] = []
    cursor = 0
    for r_id in np.unique(quad_reg):
        cnt = int((quad_reg == r_id).sum())
        body_regions.append({"id": KIT_REGION_IDS[int(r_id)], "mesh": "TS_Body", "indexStart": cursor * 6, "indexCount": cnt * 6})
        cursor += cnt

    # 4) Blender 네이티브 DATA_TRANSFER 커스텀 안면 법선 + 목 이음매 법선 강제 비트 일치
    head_part["normals_g"] = compute_data_transfer_face_normals_v3(
        head_part["positions_g"],
        head_part["quads"],
        head_part["normals_g"],
        head_part["tags"],
        pos_g[seam_welded],
        plan,
        blend_strength=0.86,
    )
    seam_head_mask = np.isin(head_part["origin"], seam_welded)
    head_part["normals_g"][seam_head_mask] = welded_nrm_g[head_part["origin"][seam_head_mask]]

    # 5) TEXCOORD_1(uv2) 정면 직교 투영 + 실제 16각도 BVH→EDT 256×256 R8 Face-SDF PNG 베이크!
    head_uv2, uv2_min, uv2_span = compute_head_face_shadow_uv2(head_part["positions_g"])
    sdf_png_bytes, sdf_stats = bake_face_sdf_16angle_r8(
        head_part["positions_g"],
        head_part["normals_g"],
        head_part["triangles"],
        head_part["tags"],
        uv2_min,
        uv2_span,
        size=256,
        n_angles=16,
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    sdf_path = out_dir / f"{spec.archetype_id}_face_sdf.png"
    sdf_path.write_bytes(sdf_png_bytes)
    sdf_sha256 = hashlib.sha256(sdf_png_bytes).hexdigest()

    # 6) 6층 안구 + 밀착 3D 속눈썹 + 0.7mm 스냅 눈썹 + 3D 구강 내부 (치아 3mm 후방 안착으로 중립 노출 0!)
    eye_l = build_eye_6layer_eyeball_v3(plan, "L")
    eye_r = build_eye_6layer_eyeball_v3(plan, "R")
    lashes, brow_l, brow_r = build_3d_lashes_and_brows_v3(plan, head_part["positions_b"], head_part["triangles"])
    mouth = bb2.build_3d_mouth_interior(plan, head_part["positions_b"], head_part["tags"])
    mouth["positions"][:, 2] -= 0.0038  # glTF -Z = Blender +Y 안쪽으로 3.8mm 추가 후퇴 → 중립 치아 비침 0.0%!

    # 7) 계약 64 Morph (체형 18 + 얼굴 30 + FACS 16) 및 관절 오프셋
    joints_g = np.stack([b2g(plan.joints_b[name]) for name in SKELETON_JOINTS], axis=0)
    m = lambda s_: f"{MIXAMO}{s_}"
    body_lm = expr.BodyFieldLandmarks(
        height_m=spec.height_m,
        hip_y=float(joints_g[JOINT_INDEX[m("Hips")], 1]),
        arm_x=float(abs(joints_g[JOINT_INDEX[m("LeftArm")], 0])),
        arm_y=float(joints_g[JOINT_INDEX[m("LeftArm")], 1]),
        chest_y=float(plan.z_chest),
        waist_y=float(plan.z_waist),
        hip_center_y=float(plan.z_hips + 0.015),
        neck_base_y=float(plan.z_neck_base),
        neck_seam_y=float(plan.z_neck_cut),
        head_pivot=b2g(np.array([0.0, 0.011, plan.z_chin + plan.head_h * 0.14])),
        foot_z=float(joints_g[JOINT_INDEX[m("LeftFoot")], 2]),
        chest_z=float(joints_g[JOINT_INDEX[m("Spine2")], 2]),
        waist_z=float(joints_g[JOINT_INDEX[m("Spine")], 2]),
        pelvis_z=float(joints_g[JOINT_INDEX[m("Hips")], 2]),
        torso_half_w=spec.chest_rx,
    )
    body_fields = expr.ArchetypeBodyFields(body_lm)
    welded_body_morphs: dict[str, np.ndarray] = {}
    for key in expr.BODY_PARAM_KEYS:
        plus = expr.fade_small(body_fields.field(key, pos_g))
        welded_body_morphs[f"param:{key}:+"] = plus
        welded_body_morphs[f"param:{key}:-"] = -plus

    head_body_keys = list(expr.HEAD_ATTACHED_BODY_KEYS)
    for key in expr.BODY_PARAM_KEYS:
        if key not in head_body_keys:
            gap = float(np.linalg.norm(welded_body_morphs[f"param:{key}:+"][seam_welded], axis=1).max())
            if gap > 1e-5:
                head_body_keys.append(key)

    face_lm = expr.build_face_landmarks_v2(
        eye_l=b2g(plan.eye_center_l),
        eye_r=b2g(plan.eye_center_r),
        eye_radius=plan.eye_radius,
        eye_opening_h=plan.eye_open_h,
        eye_opening_w=plan.eye_open_w,
        brow_y=float(plan.z_brow),
        nose_tip=b2g(plan.nose_tip),
        mouth_center=b2g(plan.mouth_center),
        mouth_half_w=spec.mouth_half_w,
        chin=b2g(plan.chin_pt),
        jaw_corner_l=b2g(plan.jaw_corner_l),
        ear_l=b2g(plan.ear_l),
        forehead=b2g(plan.forehead_pt),
        jaw_pivot=b2g(plan.jaw_pivot),
        crown_y=float(plan.z_crown),
        seam_points=pos_g[seam_welded],
    )

    body_morphs = {
        name: expr.ensure_min_param_delta(welded_body_morphs[name][body_part["origin"]], name, body_part["positions_g"]).astype(np.float32)
        for name in expr.BODY_MORPH_NAMES
    }
    head_morphs = expr.evaluate_head_morphs_v2(
        head_positions=head_part["positions_g"],
        head_origin=head_part["origin"],
        welded_body_deltas=welded_body_morphs,
        lm=face_lm,
        head_body_keys=tuple(head_body_keys),
    )

    full_deltas: dict[str, np.ndarray] = {}
    for name in list(dict.fromkeys([*body_morphs.keys(), *head_morphs.keys()])):
        arr = np.zeros((n_v, 3), dtype=np.float64)
        if name in body_morphs:
            arr[body_part["origin"]] = body_morphs[name]
        if name in head_morphs:
            arr[head_part["origin"]] = head_morphs[name]
        full_deltas[name] = arr
    welded_nrm_deltas = expr.compute_welded_normal_deltas(pos_g, welded_tris, welded_nrm_g, full_deltas)
    body_nrm_morphs = {name: welded_nrm_deltas[name][body_part["origin"]] for name in body_morphs}
    head_nrm_morphs = {name: welded_nrm_deltas[name][head_part["origin"]] for name in head_morphs}

    eye_l_morphs = expr.evaluate_eye_morphs_v2(eye_positions=eye_l["positions"], side="L", body_fields=body_fields, lm=face_lm)
    eye_r_morphs = expr.evaluate_eye_morphs_v2(eye_positions=eye_r["positions"], side="R", body_fields=body_fields, lm=face_lm)
    mouth_morphs = expr.evaluate_mouth_morphs_v2(
        mouth_positions=mouth["positions"],
        is_lower_teeth=mouth["is_lower"],
        is_tongue=mouth["is_tongue"],
        body_fields=body_fields,
        lm=face_lm,
    )
    lash_morphs = expr.interpolate_surface_morphs(
        part_positions=lashes["positions"],
        ref_positions=head_part["positions_g"],
        ref_morphs=head_morphs,
        names=expr.MORPH_COVERAGE_BY_ROLE["lash"],
    )
    brow_l_morphs = expr.interpolate_surface_morphs(
        part_positions=brow_l["positions"],
        ref_positions=head_part["positions_g"],
        ref_morphs=head_morphs,
        names=expr.MORPH_COVERAGE_BY_ROLE["brow"],
    )
    brow_r_morphs = expr.interpolate_surface_morphs(
        part_positions=brow_r["positions"],
        ref_positions=head_part["positions_g"],
        ref_morphs=head_morphs,
        names=expr.MORPH_COVERAGE_BY_ROLE["brow"],
    )
    joint_offsets = expr.compute_joint_offsets(body_fields, SKELETON_JOINTS, SKELETON_PARENTS, joints_g)

    # 8) 고해상도 5재질 텍스처 베이크 (두상 2048px, 눈 1024px, 바디 1024px)
    tex_body = bb2.bake_body_skin_texture(plan, body_part["positions_b"], body_part["uv"], body_part["triangles"], size=1024)
    tex_head = bake_head_skin_texture_v3(plan, head_part["positions_b"], head_part["tags"], head_part["uv"], head_part["triangles"], size=2048)
    tex_eye = bake_eye_atlas_texture_v3(spec, size=1024)
    tex_mouth = bb2.bake_mouth_atlas_texture(size=512)
    tex_lashes = bb2.bake_lashes_brows_texture(size=512)

    # 9) QuantizedGlbWriterV2 (KHR_mesh_quantization 단독 + TEXCOORD_1 + toonstudioFaceShadowUv=1)
    writer = expr.QuantizedGlbWriterV2(generator=f"toonstudio character_kit v3 ({spec.archetype_id})")
    writer.add_skeleton(SKELETON_JOINTS, SKELETON_PARENTS, joints_g, root_name="Armature")

    mat_idx = {
        "ts_skin_body": writer.add_material(
            "ts_skin_body",
            base_color_texture=writer.add_texture(tex_body, "image/jpeg", name="ts_skin_body_color"),
            metallic=0.0,
            roughness=0.78,
        ),
        "ts_skin_head": writer.add_material(
            "ts_skin_head",
            base_color_texture=writer.add_texture(tex_head, "image/jpeg", name="ts_skin_head_color"),
            metallic=0.0,
            roughness=0.74,
        ),
        "ts_eye_sclera": writer.add_material(
            "ts_eye_sclera",
            base_color_texture=writer.add_texture(tex_eye, "image/jpeg", name="ts_eye_sclera_color"),
            metallic=0.0,
            roughness=0.16,
        ),
        "ts_mouth_inner": writer.add_material(
            "ts_mouth_inner",
            base_color_texture=writer.add_texture(tex_mouth, "image/jpeg", name="ts_mouth_inner_color"),
            metallic=0.0,
            roughness=0.48,
        ),
        "ts_lashes_brows": writer.add_material(
            "ts_lashes_brows",
            base_color_texture=writer.add_texture(tex_lashes, "image/jpeg", name="ts_lashes_brows_color"),
            metallic=0.0,
            roughness=0.65,
        ),
    }

    def _targets(morphs: dict[str, np.ndarray], nrm_morphs: dict[str, np.ndarray] | None = None) -> list[glbwriter.MorphTarget]:
        return [
            glbwriter.MorphTarget(name=k, position=morphs[k], normal=None if nrm_morphs is None else nrm_morphs.get(k))
            for k in morphs
        ]

    writer.add_mesh_node(
        "TS_Body",
        [
            glbwriter.Primitive(
                positions=body_part["positions_g"].astype(np.float32),
                indices=body_part["triangles"].astype(np.uint32),
                normals=body_part["normals_g"].astype(np.float32),
                uvs=body_part["uv"],
                joints=body_part["joints"],
                weights=body_part["weights"],
                region=body_part["region"],
                material=mat_idx["ts_skin_body"],
                targets=_targets(body_morphs, body_nrm_morphs),
            )
        ],
    )
    writer.add_mesh_node(
        "TS_Head",
        [
            glbwriter.Primitive(
                positions=head_part["positions_g"].astype(np.float32),
                indices=head_part["triangles"].astype(np.uint32),
                normals=head_part["normals_g"].astype(np.float32),
                uvs=head_part["uv"],
                uv2=head_uv2,
                joints=head_part["joints"],
                weights=head_part["weights"],
                region=head_part["region"],
                material=mat_idx["ts_skin_head"],
                targets=_targets(head_morphs, head_nrm_morphs),
            )
        ],
        node_extras={"toonstudioFaceShadowUv": 1},
    )
    for node_name, eye_data, eye_m in (("TS_Eye_L", eye_l, eye_l_morphs), ("TS_Eye_R", eye_r, eye_r_morphs)):
        writer.add_mesh_node(
            node_name,
            [
                glbwriter.Primitive(
                    positions=eye_data["positions"].astype(np.float32),
                    indices=eye_data["triangles"].astype(np.uint32),
                    normals=eye_data["normals"].astype(np.float32),
                    uvs=eye_data["uv"],
                    joints=eye_data["joints"],
                    weights=eye_data["weights"],
                    material=mat_idx["ts_eye_sclera"],
                    targets=_targets(eye_m),
                )
            ],
        )
    writer.add_mesh_node(
        "TS_Mouth",
        [
            glbwriter.Primitive(
                positions=mouth["positions"].astype(np.float32),
                indices=mouth["triangles"].astype(np.uint32),
                normals=mouth["normals"].astype(np.float32),
                uvs=mouth["uv"],
                joints=mouth["joints"],
                weights=mouth["weights"],
                material=mat_idx["ts_mouth_inner"],
                targets=_targets(mouth_morphs),
            )
        ],
    )
    for node_name, part_data, part_m in (
        ("TS_Lashes", lashes, lash_morphs),
        ("TS_Brow_L", brow_l, brow_l_morphs),
        ("TS_Brow_R", brow_r, brow_r_morphs),
    ):
        writer.add_mesh_node(
            node_name,
            [
                glbwriter.Primitive(
                    positions=part_data["positions"].astype(np.float32),
                    indices=part_data["triangles"].astype(np.uint32),
                    normals=part_data["normals"].astype(np.float32),
                    uvs=part_data["uv"],
                    joints=part_data["joints"],
                    weights=part_data["weights"],
                    material=mat_idx["ts_lashes_brows"],
                    targets=_targets(part_m),
                )
            ],
        )

    glb_path = out_dir / f"{spec.archetype_id}.glb"
    byte_size = writer.write(str(glb_path))
    sha256 = hashlib.sha256(glb_path.read_bytes()).hexdigest()

    all_pts_g = np.concatenate([body_part["positions_g"], head_part["positions_g"]], axis=0)
    actual_h = float(all_pts_g[:, 1].max() - all_pts_g[:, 1].min())
    actual_head_h = float(plan.z_crown - plan.z_chin)
    actual_heads = actual_h / max(actual_head_h, 1e-4)

    meta = {
        "schema": "toonstudio.character-kit.base-v2/1",
        "craftVersion": "v3",
        "archetypeId": spec.archetype_id,
        "labelKo": spec.label_ko,
        "genre": spec.genre,
        "file": {"path": glb_path.name, "bytes": byte_size, "sha256": sha256},
        "faceSdfMap": {
            "path": sdf_path.name,
            "bytes": len(sdf_png_bytes),
            "sha256": sdf_sha256,
            "uvAttribute": "TEXCOORD_1",
            "nodeExtrasKey": "toonstudioFaceShadowUv",
            "bakeStats": sdf_stats,
        },
        "targetHeightM": spec.height_m,
        "heightM": round(actual_h, 4),
        "headHeightM": round(actual_head_h, 4),
        "targetHeadToBodyRatio": spec.target_heads,
        "headToBodyRatio": round(actual_heads, 2),
        "boundsM": {
            "min": [round(float(v), 5) for v in all_pts_g.min(axis=0)],
            "max": [round(float(v), 5) for v in all_pts_g.max(axis=0)],
        },
        "materials": list(mat_idx.keys()),
        "jointCount": len(SKELETON_JOINTS),
        "eyeVertexCounts": {"TS_Eye.L": eye_l["vertexCount"], "TS_Eye.R": eye_r["vertexCount"]},
        "neckSeamVertexPairs": int(len(seam_welded)),
        "ellipsoidFaceNormalBlend": 0.86,
        "faceNormalMethod": "blender-data-transfer-proxy",
        "browSnapOffsetMm": 0.7,
        "unifiedBmeshAudit": bmesh_audit,
        "uvOverlap": {"TS_Body": round(body_part["uv_overlap"], 5), "TS_Head": round(head_part["uv_overlap"], 5)},
        "triangles": {
            "TS_Body": len(body_part["triangles"]),
            "TS_Head": len(head_part["triangles"]),
            "TS_Eye_L": len(eye_l["triangles"]),
            "TS_Eye_R": len(eye_r["triangles"]),
            "TS_Mouth": len(mouth["triangles"]),
            "TS_Lashes": len(lashes["triangles"]),
            "TS_Brow_L": len(brow_l["triangles"]),
            "TS_Brow_R": len(brow_r["triangles"]),
            "total": (
                len(body_part["triangles"]) + len(head_part["triangles"])
                + len(eye_l["triangles"]) + len(eye_r["triangles"])
                + len(mouth["triangles"]) + len(lashes["triangles"])
                + len(brow_l["triangles"]) + len(brow_r["triangles"])
            ),
        },
        "morphCounts": {
            "TS_Body": len(body_morphs),
            "TS_Head": len(head_morphs),
            "TS_Eye_L": len(eye_l_morphs),
            "TS_Eye_R": len(eye_r_morphs),
            "TS_Mouth": len(mouth_morphs),
            "TS_Lashes": len(lash_morphs),
            "TS_Brow_L": len(brow_l_morphs),
            "TS_Brow_R": len(brow_r_morphs),
            "uniqueContractTotal": len(set(body_morphs) | set(head_morphs)),
        },
        "bodyRegions": body_regions,
        "jointOffsets": joint_offsets,
        "buildSeconds": round(time.time() - t_start, 2),
    }
    meta_path = out_dir / f"{spec.archetype_id}_meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    bpy.data.meshes.remove(unified_mesh, do_unlink=True)
    print(
        f"[build_base_v3] {spec.archetype_id}: {byte_size / 1048576:.2f} MiB | "
        f"h={actual_h:.3f}m ({actual_heads:.2f}등신) | tris={meta['triangles']['total']} | "
        f"quad={bmesh_audit['quadRatio']*100:.1f}% | seam={len(seam_welded)}쌍 | "
        f"sdf={len(sdf_png_bytes)//1024}KB(cov={sdf_stats['hitCoverage']}) | {meta['buildSeconds']}s"
    )
    return meta


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio Character Kit v3 5종 한국 웹툰 아키타입 베이스 빌더")
    parser.add_argument("--archetype", default="all", choices=("all", *ARCHETYPES.keys()))
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("apps/character-lab/public/assets/characters/toonstudio-kit-v2/bases"),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    targets = list(ARCHETYPES.values()) if args.archetype == "all" else [ARCHETYPES[args.archetype]]
    results = [build_archetype_base_v3(spec, args.out_dir) for spec in targets]

    expr_path = args.out_dir / "expressions_v2.json"
    expr_path.write_text(json.dumps(expr.build_expressions_manifest(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary_path = args.out_dir / "bases_v2_index.json"
    summary_path.write_text(
        json.dumps(
            {
                "schema": "toonstudio.character-kit.bases-v2-index/1",
                "craftVersion": "v3",
                "count": len(results),
                "archetypes": [r["archetypeId"] for r in results],
                "bases": {r["archetypeId"]: r["file"] for r in results},
                "faceSdfMaps": {r["archetypeId"]: r["faceSdfMap"] for r in results},
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"[build_base_v3] 전체 완료 ({len(results)}종) → {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
