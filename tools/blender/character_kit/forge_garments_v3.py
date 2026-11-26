"""ToonStudio Character Kit v3 — 6대 웹툰 장르 상업급 다채널 의상 포지 + VRM 1.0 SSOT 빌더.

`forge_garments_v2.py` / `garment_core_v2.py`의 34종 카탈로그와 0-결함·68본 스키닝·18 체형 morph·
85° 어깨 거상 비관통 계약을 100% 보존하면서 아래 3가지 시각·조형 업그레이드를 적용한다:

1. **1024×1024 무-무아레(Zero-Moiré) 웹툰 에디토리얼 원단 텍스처 (`bake_fabric_textures_v3`)**
   - 고주파 `sin(160..192)` 사선 줄무늬를 전면 제거하여 중·원거리 무아레/지브라 현상 0건 달성.
   - 평균 휘도 `>= 0.90` (recolor 100% 호환), 부드러운 종이/직조 미세 결 + 교복 플리츠용 안티앨리어싱 체크.
2. **4mm 테일러드 라펠·고지 노치 밀착 보강 (`add_tailored_lapels_v3`)**
   - 재킷 본체에서 붕 뜨던 막대형 라펠을 제거하고 가슴 곡면에 2.8~5.5mm 밀착·접힘 입체감 부여.
3. **조각 아치·힐 블록·웰트 림 신발/부츠 (`add_sculpted_footwear_v3`)**
   - 매끈한 아몬드 토박스, 오목한 아치 허리, 분리된 블록 힐 + 아웃솔·어퍼 경계 3D 웰트 림으로 덩어리 구두 해소.
   - `Z = 0.000` 정밀 접지 유지.
4. **VRM 1.0 단일 소스(SSOT) API (`build_garment_v3_for_vrm`)**
   - 8종 히어로 VRM 1.0 익스포터(`export_vrm1_hero.py`)가 34종 의상 카탈로그의 실제 지오메트리·스킨 웨이트·
     층간 간격 보정 결과를 임의의 베이스 아키타입(5종 전부)에 직접 피팅해 공유한다.

실행:
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/forge_garments_v3.py -- \
        --out-dir data/character-studio-assets/characters/toonstudio-kit-v2/parts/garments \
        --preview-dir loop-stack/v2-previews/char
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
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
from character_kit import forge_garments_v2 as fg2  # noqa: E402
from character_kit import garment_core_v2 as gc  # noqa: E402


# ---------------------------------------------------------------------------
# 1. 1024×1024 무-무아레(Zero-Moiré) 웹툰 에디토리얼 원단 텍스처 뱅크
# ---------------------------------------------------------------------------


def _smooth_band(dist: np.ndarray, half_w: float, feather: float) -> np.ndarray:
    t = np.clip((half_w + feather - dist) / max(2.0 * feather, 1e-6), 0.0, 1.0)
    return (t * t * (3.0 - 2.0 * t)).astype(np.float32)


def _soft_box_blur2d(arr: np.ndarray, passes: int = 3) -> np.ndarray:
    """타일링(wrap) 2D 박스 블러 — 고주파 픽셀 노이즈/무아레를 완전히 평활한다."""
    out = arr.astype(np.float32, copy=True)
    for _ in range(passes):
        out = (
            out
            + np.roll(out, 1, axis=0)
            + np.roll(out, -1, axis=0)
            + np.roll(out, 1, axis=1)
            + np.roll(out, -1, axis=1)
        ) * 0.2
    return out


def bake_fabric_textures_v3(size: int = 1024) -> dict[str, bytes]:
    """7종 1024² 무-무아레(Zero-Moiré) 고휘도(평균 휘도 >= 0.90) 에디토리얼 원단 텍스처."""
    yy, xx = np.mgrid[0:size, 0:size]
    u = (xx + 0.5) / size
    v = (yy + 0.5) / size
    rng = np.random.default_rng(20261121)

    # 저주파 다중스케일 천 결 (블러로 완전 안티앨리어싱 → 무아레 0!)
    grain_fine = _soft_box_blur2d(rng.normal(0.0, 0.018, (size, size)), passes=4)
    grain_broad = _soft_box_blur2d(rng.normal(0.0, 0.024, (size // 4, size // 4)), passes=4)
    grain_broad = np.repeat(np.repeat(grain_broad, 4, axis=0), 4, axis=1)

    def _to_jpg(gray: np.ndarray, tint: tuple[float, float, float] = (1.0, 1.0, 1.0), quality: int = 90) -> bytes:
        g = np.clip(gray, 0.78, 1.0).astype(np.float32)
        m = float(g.mean())
        if m < 0.91:
            g = 1.0 - (1.0 - g) * ((1.0 - 0.925) / max(1.0 - m, 1e-4))
        rgb = np.stack([g * tint[0], g * tint[1], g * tint[2]], axis=-1)
        return bb2.encode_baseline_jpeg_bpy(np.clip(rgb, 0.0, 1.0), quality=quality)

    textures: dict[str, bytes] = {}

    # 1) wool_twill: 정장·블레이저·코트용 매트 울 (사선 줄무늬 완전 제거, 은은한 펠트 결만 유지)
    wool = 0.955 + grain_fine * 0.65 + grain_broad * 0.55
    textures["wool_twill"] = _to_jpg(wool)

    # 2) cotton_poplin: 셔츠·티·도복용 산뜻한 코튼 (완벽히 깨끗한 셀 표면)
    poplin = 0.968 + grain_fine * 0.42 + grain_broad * 0.30
    textures["cotton_poplin"] = _to_jpg(poplin)

    # 3) tartan_pleat: 한국 학원 교복 체크 (안티앨리어싱 스무스스텝 격자, recolor 100% 호환)
    cx = np.abs(((u * 6.0) % 1.0) - 0.5)
    cy = np.abs(((v * 6.0) % 1.0) - 0.5)
    broad = (_smooth_band(cx, 0.135, 0.014) + _smooth_band(cy, 0.135, 0.014)) * 0.068
    pin = (_smooth_band(np.abs(cx - 0.30), 0.014, 0.008) + _smooth_band(np.abs(cy - 0.30), 0.014, 0.008)) * 0.072
    tartan = 0.978 - broad - pin + grain_fine * 0.35
    textures["tartan_pleat"] = _to_jpg(tartan)

    # 4) denim_knit: 데님·니트 부드러운 저주파 세로 골 (16주기만 사용해 무아레 원천 차단)
    knit = 0.948 + 0.008 * np.sin(u * 16.0 * 2.0 * math.pi) + grain_fine * 0.70 + grain_broad * 0.60
    textures["denim_knit"] = _to_jpg(knit)

    # 5) silk_brocade: 로판·무협 실크 다마스크 (우아한 8×8 저주파 은은한 문양)
    damask = 0.960 + 0.016 * np.sin(u * 8.0 * 2.0 * math.pi) * np.sin(v * 8.0 * 2.0 * math.pi) + grain_fine * 0.25
    textures["silk_brocade"] = _to_jpg(damask)

    # 6) tech_ripstop: 테크웨어 매트 립스탑 (16×16 부드러운 미세 격자, 원거리 앨리어싱 0)
    gx = _smooth_band(np.abs(((u * 16.0) % 1.0) - 0.5), 0.032, 0.016)
    gy = _smooth_band(np.abs(((v * 16.0) % 1.0) - 0.5), 0.032, 0.016)
    ripstop = 0.958 - 0.022 * np.maximum(gx, gy) + grain_fine * 0.45
    textures["tech_ripstop"] = _to_jpg(ripstop)

    # 7) leather_metal: 매트 사틴 가죽/금속 (밴딩·줄무늬 0, 균일한 고급 광택 기저)
    leather = 0.964 + grain_broad * 0.42 + grain_fine * 0.32
    textures["leather_metal"] = _to_jpg(leather)

    return textures


# ---------------------------------------------------------------------------
# 2. v3 테일러드 라펠 (4mm 밀착 접힘 + 선명한 고지 노치)
# ---------------------------------------------------------------------------


def add_tailored_lapels_v3(
    gb: gc.GarmentBuilder,
    *,
    z_top: float,
    z_button: float,
    base_ease: float,
    lapel_width: float = 0.046,
    thickness: float = 0.0038,
    peaked: bool = False,
    channel: str = "main",
    piping_channel: str | None = None,
) -> None:
    """재킷 가슴 곡면에 밀착해 접히는 4mm 상업급 노치드/피크드 라펠."""
    ctx = gb.ctx
    m = 12
    n = 6
    for side in (+1.0, -1.0):
        grid = np.empty((m, n, 3), dtype=np.float64)
        for i in range(m):
            t = i / (m - 1)  # 0=단추 V끝, 1=목/칼라 접합부
            z = z_button + (z_top - z_button) * t
            # V-프런트 안쪽 개구선이 단추에서 목 칼라로 자연스럽게 이어짐
            x_in = side * (0.010 + 0.048 * (t ** 0.88))
            if peaked:
                # 뾰족하게 올라가는 피크드 라펠 (제국 제복·수트)
                w_prof = math.sin(t * math.pi * 0.92) * (1.0 + 0.36 * math.exp(-(((t - 0.70) / 0.12) ** 2)))
            else:
                # 선명한 고지 노치 홈 (t ≈ 0.76)
                notch = 1.0 - 0.34 * math.exp(-(((t - 0.76) / 0.055) ** 2))
                w_prof = math.sin(min(1.0, t * 1.12) * math.pi * 0.85) * notch
            w_cur = max(0.009, lapel_width * w_prof)
            for j in range(n):
                u = j / (n - 1)  # 0=안쪽 접힘선, 1=바깥 라펠 엣지
                x = x_in + side * w_cur * u
                th = math.atan2(x, 0.115)
                _, y_surf, _ = ctx.sample_torso_radius(z, th)
                # 안쪽 엣지(u=0)는 재킷 본체에 2.6mm 밀착, 중간에서 부드럽게 부풀었다가 바깥 끝(u=1)이 안으로 살짝 안착!
                fold_arch = 0.0026 + 0.0032 * math.sin(u * math.pi * 0.88) - 0.0008 * (u ** 2)
                lift = base_ease + fold_arch
                y = y_surf - lift
                grid[i, j] = (x, y, z)
        gb.add_offset_panel(
            grid,
            thickness,
            outward_dir=np.array([0.0, -1.0, 0.0]),
            channel=channel,
            skin_zone="torso",
            part_tag="lapel",
            is_detail=True,
        )
        if piping_channel is not None:
            edge_pts = grid[:, -1] + np.array([0.0, -thickness * 0.85, 0.0])
            gb.add_swept_tube(edge_pts, 0.0018, n_prof=6, channel=piping_channel, skin_zone="torso", part_tag="lapel_trim")


# ---------------------------------------------------------------------------
# 3. v3 조각 아치·블록 힐·웰트 림 신발/부츠 (덩어리 구두 해소 + Z=0.000 접지)
# ---------------------------------------------------------------------------


def add_sculpted_footwear_v3(
    gb: gc.GarmentBuilder,
    *,
    shaft_height: float,
    sole_thick: float = 0.015,
    heel_height: float = 0.024,
    toe_upturn: float = 0.0,
    lugged_sole: bool = False,
    lace_rows: int = 0,
    penny_strap: bool = False,
    ankle_buckle: bool = False,
    top_cuff_band: bool = False,
    channel_upper: str = "main",
    channel_sole: str = "sole",
    channel_lace: str = "lace",
) -> None:
    """아몬드 토박스 + 잘록한 아치 허리 + 분리된 블록 힐 + 웰트 림을 갖춘 v3 신발/부츠."""
    ctx = gb.ctx
    p = ctx.plan

    for side, lab, fbounds in ((+1, "Left", ctx.foot_bounds_l), (-1, "Right", ctx.foot_bounds_r)):
        fmin, fmax = fbounds
        cx = 0.5 * (float(fmin[0]) + float(fmax[0]))
        y_toe = float(fmin[1]) - 0.014  # 앞코 (-Y)
        y_heel = float(fmax[1]) + 0.009  # 뒤꿈치 (+Y)
        hw = 0.5 * (float(fmax[0]) - float(fmin[0])) + 0.0075
        foot_len = max(y_heel - y_toe, 0.09)
        z_instep = max(float(fmax[2]) * 0.60, p.z_ankle * 0.84)
        zone = f"foot.{lab[0]}"

        # 1) 아몬드 토박스 + 잘록한 아치 허리 + 뒤꿈치 라스트 윤곽 (28점)
        n_out = 28
        contour_xy: list[tuple[float, float, float]] = []
        for k in range(n_out):
            ang = 2.0 * math.pi * (k / n_out)
            ct = math.cos(ang)  # +1 앞코, -1 뒤꿈치
            st = math.sin(ang)
            t_fh = 0.5 * (1.0 - ct)  # 0=앞코, 1=뒤꿈치
            # 앞볼(t~0.30) 넉넉 + 아치 허리(t~0.62) 명확히 잘록(-0.20) + 뒤꿈치(t~0.88) 탄탄
            ball = 0.16 * math.exp(-(((t_fh - 0.30) / 0.18) ** 2))
            arch_cinch = -0.20 * math.exp(-(((t_fh - 0.62) / 0.14) ** 2))
            heel_cup = -0.08 * gc.smoothstep_f(0.74, 1.0, t_fh)
            width_mod = 0.90 + ball + arch_cinch + heel_cup
            if t_fh < 0.15:
                # 날렵한 아몬드 토박스
                width_mod *= 0.72 + 0.28 * (t_fh / 0.15) ** 0.75
            # 발 내측(medial) 아치를 살짝 더 오목하게 비대칭 조각
            is_medial = (st * side) < 0.0
            if is_medial:
                width_mod -= 0.06 * math.exp(-(((t_fh - 0.58) / 0.15) ** 2))
            x = cx + st * hw * width_mod
            y = y_toe + t_fh * foot_len
            contour_xy.append((x, y, t_fh))

        # 2) 아웃솔 + 오목 아치 브릿지 + 분리된 블록 힐 (Z = 0.000 엄수!)
        has_heel_cut = (heel_height - sole_thick) >= 0.005 and not lugged_sole
        bm_sole = bmesh.new()
        sole_bot: list[bmesh.types.BMVert] = []
        sole_mid: list[bmesh.types.BMVert] = []
        sole_top: list[bmesh.types.BMVert] = []
        welt_pts: list[np.ndarray] = []

        for x, y, t_fh in contour_xy:
            # 앞코 살짝 들림 + 힐 구두 아치 컷아웃 (바닥 접지는 앞볼·뒤꿈치 Z=0.000!)
            z_b = 0.0
            if toe_upturn > 0.0:
                z_b += toe_upturn * max(0.0, (0.20 - t_fh) / 0.20) ** 1.6
            else:
                z_b += 0.0022 * max(0.0, (0.14 - t_fh) / 0.14) ** 1.8
            if has_heel_cut:
                # 아치 중앙(t_fh ∈ [0.46, 0.70]) 바닥을 살짝 띄워 실제 구두 굽 실루엣 생성!
                arch_lift = min(0.0075, (heel_height - sole_thick) * 0.65)
                z_b += arch_lift * math.exp(-(((t_fh - 0.58) / 0.095) ** 2))

            h_top = sole_thick + max(0.0, heel_height - sole_thick) * gc.smoothstep_f(0.60, 0.73, t_fh)
            sole_bot.append(bm_sole.verts.new((x, y, z_b)))
            # 아웃솔 측벽은 하단에서 살짝 넓어졌다가 상단 웰트로 정리
            sole_mid.append(bm_sole.verts.new((cx + (x - cx) * 1.035, y, z_b + max(0.004, (h_top - z_b) * 0.55))))
            sole_top.append(bm_sole.verts.new((cx + (x - cx) * 1.015, y, h_top)))
            welt_pts.append(np.array([cx + (x - cx) * 1.022, y, h_top + 0.0012], dtype=np.float64))

        for k in range(n_out):
            kn = (k + 1) % n_out
            bm_sole.faces.new((sole_bot[k], sole_bot[kn], sole_mid[kn], sole_mid[k]))
            bm_sole.faces.new((sole_mid[k], sole_mid[kn], sole_top[kn], sole_top[k]))
        c_bot = bm_sole.verts.new((cx, 0.5 * (y_toe + y_heel), 0.002 if has_heel_cut else 0.0))
        c_top = bm_sole.verts.new((cx, 0.5 * (y_toe + y_heel), sole_thick))
        for k in range(n_out):
            kn = (k + 1) % n_out
            bm_sole.faces.new((c_bot, sole_bot[kn], sole_bot[k]))
            bm_sole.faces.new((c_top, sole_top[k], sole_top[kn]))
        gb._finalize_bmesh_chunk(bm_sole, channel=channel_sole, skin_zone=zone, part_tag="sole")

        # 3D 웰트 림(아웃솔·어퍼 경계 입체 파이핑 — 구두 실루엣 선명도 핵심!)
        gb.add_swept_tube(
            np.stack(welt_pts, axis=0),
            0.0024,
            n_prof=6,
            closed_curve=True,
            channel=channel_sole,
            skin_zone=zone,
            part_tag="sole_welt",
        )

        # 컴뱃 부츠/스니커즈 러그 트레드 돌기
        if lugged_sole:
            for ti in range(5):
                t_fh = 0.14 + ti * 0.17
                yl = y_toe + t_fh * foot_len
                gb.add_beveled_box(
                    (cx, yl, 0.0045),
                    (hw * 1.68, 0.014, 0.009),
                    bevel_width=0.0018,
                    channel=channel_sole,
                    skin_zone=zone,
                    rigid=False,
                    part_tag="sole_lug",
                )

        # 3) 날렵한 발등 어퍼 돔 (앞코 낮고 매끈한 경사 + 뒤꿈치 힐 카운터)
        bm_up = bmesh.new()
        u_rings: list[list[bmesh.types.BMVert]] = []
        n_u_layers = 7
        ax_ankle = ctx.leg_axis_pt(side, p.z_ankle)
        for li in range(n_u_layers):
            lv = li / (n_u_layers - 1)
            ring: list[bmesh.types.BMVert] = []
            for x, y, t_fh in contour_xy:
                h_sole = sole_thick + max(0.0, heel_height - sole_thick) * gc.smoothstep_f(0.60, 0.73, t_fh)
                t_back = gc.smoothstep_f(0.26, 0.72, t_fh)
                z_lo = h_sole - 0.0015
                # 앞코 높이를 살짝 낮춰 뭉툭한 덩어리 구두 느낌 해소
                toe_cap_h = 0.0185 + (0.004 if lugged_sole else 0.0)
                z_hi = z_lo + toe_cap_h + (z_instep - z_lo + 0.013) * t_back
                shrink = lv ** 1.30
                tx = x * (1.0 - shrink * 0.44) + float(ax_ankle[0]) * (shrink * 0.44)
                ty = y * (1.0 - shrink * (1.0 - t_back) * 0.80) + float(ax_ankle[1]) * (shrink * (1.0 - t_back) * 0.80)
                tz = z_lo + (z_hi - z_lo) * math.sin(lv * math.pi * 0.5)
                if lv > 0.85 and toe_upturn > 0:
                    tz += toe_upturn * 0.25 * (1.0 - t_fh)
                ring.append(bm_up.verts.new((tx, ty, tz)))
            u_rings.append(ring)

        for li in range(n_u_layers - 1):
            for k in range(n_out):
                kn = (k + 1) % n_out
                bm_up.faces.new((u_rings[li][k], u_rings[li][kn], u_rings[li + 1][kn], u_rings[li + 1][k]))
        c_u0 = bm_up.verts.new((cx, 0.5 * (y_toe + y_heel), sole_thick))
        c_u1 = bm_up.verts.new((float(ax_ankle[0]), float(ax_ankle[1]), z_instep + 0.007))
        for k in range(n_out):
            kn = (k + 1) % n_out
            bm_up.faces.new((c_u0, u_rings[0][kn], u_rings[0][k]))
            bm_up.faces.new((c_u1, u_rings[-1][k], u_rings[-1][kn]))
        gb._finalize_bmesh_chunk(bm_up, channel=channel_upper, skin_zone=zone, part_tag="shoe_upper")

        # 4) 발목/종아리 부츠 샤프트
        z_shaft_top = max(z_instep + 0.016, shaft_height)
        n_sh = max(5, int(round((z_shaft_top - z_instep) / 0.04)) + 2)
        z_sh_arr = np.linspace(z_instep - 0.012, z_shaft_top, n_sh)
        n_sseg = 22
        sh_in = np.empty((n_sh, n_sseg, 3), dtype=np.float64)
        sh_out = np.empty((n_sh, n_sseg, 3), dtype=np.float64)
        for i, z in enumerate(z_sh_arr):
            axis = ctx.leg_axis_pt(side, float(z))
            ease_b = 0.0062 + 0.0028 * (i / max(n_sh - 1, 1))
            ring = ctx.sample_leg_ring(side, float(z), n_sseg, ease_b, clamp_midline=True)
            rad = ring - axis[None, :]
            rad[:, 2] = 0.0
            rn = np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
            sh_in[i] = ring
            sh_out[i] = ring + (rad / rn) * 0.0034
        gb.add_thick_shell(sh_out, sh_in, closed_u=True, channel=channel_upper, skin_zone=zone, bevel_rim=True, part_tag="boot_shaft")

        # 5) 페니 로퍼 안장 스트랩 + 골드 바
        if penny_strap:
            y_strap = y_toe + foot_len * 0.42
            gb.add_beveled_box(
                (cx, y_strap, z_instep * 0.67),
                (hw * 1.78, 0.026, 0.011),
                rot_euler=(0.35, 0.0, 0.0),
                bevel_width=0.002,
                channel=channel_upper,
                skin_zone=zone,
                rigid=False,
                part_tag="strap",
            )
            gb.add_beveled_box(
                (cx, y_strap - 0.004, z_instep * 0.71),
                (0.022, 0.008, 0.005),
                rot_euler=(0.35, 0.0, 0.0),
                bevel_width=0.001,
                channel=channel_lace,
                skin_zone=zone,
                rigid=False,
                part_tag="penny_bar",
            )

        # 6) 3D 교차 신발끈
        if lace_rows > 0:
            y_l0 = y_toe + foot_len * 0.34
            y_l1 = y_toe + foot_len * 0.56
            z_l0 = sole_thick + 0.032
            z_l1 = max(z_instep + 0.010, z_shaft_top - 0.022) if shaft_height > 0.14 else z_instep + 0.009
            for ri in range(lace_rows):
                t = ri / max(lace_rows - 1, 1)
                z_r = z_l0 + (z_l1 - z_l0) * t
                if z_r > z_instep + 0.015:
                    ring_f = ctx.sample_leg_ring(side, z_r, 8, 0.0110)
                    y_r = float(ring_f[0, 1])
                    xw = hw * 0.46
                else:
                    y_r = y_l0 + (y_l1 - y_l0) * t - 0.0055
                    xw = hw * (0.54 - 0.10 * t)
                p_l = np.array([cx - xw, y_r, z_r])
                p_m = np.array([cx, y_r - 0.0042, z_r + 0.002])
                p_r = np.array([cx + xw, y_r, z_r])
                gb.add_swept_tube(np.stack([p_l, p_m, p_r]), 0.0022, n_prof=6, channel=channel_lace, skin_zone=zone, part_tag="lace")

        # 7) 상단 커프 밴드 / 버클 스트랩
        if top_cuff_band or ankle_buckle:
            z_b = z_shaft_top - 0.018
            zb_arr = np.linspace(z_b - 0.011, z_b + 0.011, 3)
            b_in = np.empty((3, n_sseg, 3), dtype=np.float64)
            b_out = np.empty((3, n_sseg, 3), dtype=np.float64)
            for i, z in enumerate(zb_arr):
                axis = ctx.leg_axis_pt(side, float(z))
                ring = ctx.sample_leg_ring(side, float(z), n_sseg, 0.0118, clamp_midline=True)
                rad = ring - axis[None, :]
                rad[:, 2] = 0.0
                rn = np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
                b_in[i] = ring
                b_out[i] = ring + (rad / rn) * 0.0036
            gb.add_thick_shell(b_out, b_in, closed_u=True, channel=channel_lace, skin_zone=zone, bevel_rim=True, part_tag="boot_band", is_detail=True)
            if ankle_buckle:
                r_side = ctx.sample_leg_ring(side, z_b, 8, 0.017)
                pt_out = r_side[2] if side > 0 else r_side[6]
                gb.add_beveled_box(pt_out, (0.007, 0.022, 0.024), bevel_width=0.0015, channel=channel_lace, skin_zone=zone, rigid=False, part_tag="boot_buckle")


def install_v3_garment_hooks() -> None:
    """garment_core_v2에 v3 무-무아레 텍스처·밀착 라펠·아치 신발 빌더를 장착한다."""
    gc.bake_fabric_textures = bake_fabric_textures_v3  # type: ignore[assignment]
    gc.add_tailored_lapels = add_tailored_lapels_v3  # type: ignore[assignment]
    gc.add_sculpted_footwear = add_sculpted_footwear_v3  # type: ignore[assignment]


GARMENT_SPEC_BY_ID: dict[str, fg2.GarmentSpec] = {s.preset_id: s for s in fg2.GARMENT_CATALOG}


# ---------------------------------------------------------------------------
# 4. VRM 1.0 단일 소스(SSOT) 공용 API
# ---------------------------------------------------------------------------


def build_garment_v3_for_vrm(
    preset_id: str,
    ctx: gc.BaseBodyContext,
    *,
    underlayer_bvh_b: BVHTree | None = None,
    min_underlayer_gap_m: float = 0.0014,
    check_85_shoulder: bool = False,
) -> dict[str, Any]:
    """VRM 1.0 히어로 아바타용 SSOT 의상 지오메트리·스킨 웨이트·채널 빌더.

    34종 카탈로그 중 `preset_id`를 지정한 `BaseBodyContext`(5종 아무 아키타입 가능)에
    직접 재단·피팅하고 레스트/하위 레이어 간격을 보정한 뒤 채널별 메시 데이터를 반환한다.
    """
    install_v3_garment_hooks()
    spec = GARMENT_SPEC_BY_ID[preset_id]
    gb = spec.builder(ctx)

    all_pos_b: list[np.ndarray] = []
    all_joints: list[np.ndarray] = []
    all_weights: list[np.ndarray] = []
    all_uv1: list[np.ndarray] = []
    all_zones: list[str] = []
    chunk_slices: list[tuple[int, int, gc.MeshChunk]] = []
    all_tris_local: list[np.ndarray] = []
    v_cursor = 0

    for ch in gb.chunks:
        j_c, w_c = gc.compute_chunk_skin_weights(ctx, ch)
        nv = len(ch.positions)
        all_pos_b.append(ch.positions)
        all_joints.append(j_c)
        all_weights.append(w_c)
        all_uv1.append(ch.uv1)
        all_zones.extend([ch.skin_zone] * nv)
        chunk_slices.append((v_cursor, v_cursor + nv, ch))
        t_c = gc._polys_to_tris_simple(ch.faces)  # noqa: SLF001
        if len(t_c):
            all_tris_local.append(t_c + v_cursor)
        v_cursor += nv

    merged_pos_b = np.concatenate(all_pos_b, axis=0)
    merged_joints = np.concatenate(all_joints, axis=0)
    merged_weights = np.concatenate(all_weights, axis=0)
    merged_uv1 = np.concatenate(all_uv1, axis=0)
    merged_tris = np.concatenate(all_tris_local, axis=0)

    refined_pos_b, clearance = gc.enforce_clearance_and_85_pose(
        ctx,
        merged_pos_b,
        merged_tris,
        merged_joints,
        merged_weights,
        min_body_clearance_m=spec.min_clearance_mm / 1000.0,
        is_shoes=spec.is_shoes,
        underlayer_bvh_b=underlayer_bvh_b,
        min_underlayer_gap_m=min_underlayer_gap_m,
        check_85_shoulder=check_85_shoulder and spec.check_85_shoulder,
        zones=all_zones,
    )
    if spec.is_shoes:
        z_min_shoe = float(refined_pos_b[:, 2].min())
        if abs(z_min_shoe) > 1e-5:
            refined_pos_b[:, 2] -= z_min_shoe

    final_bvh_b = BVHTree.FromPolygons(refined_pos_b.tolist(), merged_tris.tolist())

    channels_out: dict[str, dict[str, Any]] = {}
    for mspec in spec.channels:
        ch_key = mspec.channel_key
        c_pos: list[np.ndarray] = []
        c_joints: list[np.ndarray] = []
        c_weights: list[np.ndarray] = []
        c_uv1: list[np.ndarray] = []
        c_faces: list[tuple[int, ...]] = []
        c_tags: list[str] = []
        off = 0
        for s_i, e_i, ch in chunk_slices:
            if ch.channel != ch_key:
                continue
            c_pos.append(refined_pos_b[s_i:e_i])
            c_joints.append(merged_joints[s_i:e_i])
            c_weights.append(merged_weights[s_i:e_i])
            c_uv1.append(merged_uv1[s_i:e_i])
            c_tags.extend([ch.part_tag] * (e_i - s_i))
            for f in ch.faces:
                c_faces.append(tuple(idx + off for idx in f))
            off += e_i - s_i
        if not c_pos:
            continue
        channels_out[ch_key] = {
            "spec": mspec,
            "positions_b": np.concatenate(c_pos, axis=0),
            "faces": c_faces,
            "uv1": np.concatenate(c_uv1, axis=0),
            "joints": np.concatenate(c_joints, axis=0),
            "weights": np.concatenate(c_weights, axis=0),
            "part_tags": c_tags,
        }

    return {
        "preset_id": preset_id,
        "spec": spec,
        "channels": channels_out,
        "hides": list(spec.hides),
        "clearance": clearance,
        "final_bvh_b": final_bvh_b,
        "joint_names": list(bb2.SKELETON_JOINTS),
    }


# ---------------------------------------------------------------------------
# 5. CLI 오케스트레이터 (34종 v3 의상 일괄 빌드 + v3 컨택트시트 렌더)
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio Character Kit v3 6대 장르 34종 의상 포지")
    parser.add_argument("--bases-dir", type=Path, default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/bases"))
    parser.add_argument("--out-dir", type=Path, default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/parts/garments"))
    parser.add_argument("--preview-dir", type=Path, default=Path("loop-stack/v2-previews/char"))
    parser.add_argument("--genre", default="all", help="all 또는 장르 slug")
    parser.add_argument("--part", default="all", help="all 또는 단일 파츠 slug")
    parser.add_argument("--res", type=int, default=512)
    parser.add_argument("--skip-render", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    t0 = time.time()
    install_v3_garment_hooks()
    args = _parse_args(sys.argv[1:] if argv is None else argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    textures_bank = bake_fabric_textures_v3(size=1024)

    ctx_cache: dict[str, gc.BaseBodyContext] = {}

    def get_ctx(base_id: str) -> gc.BaseBodyContext:
        if base_id not in ctx_cache:
            ctx_cache[base_id] = gc.load_base_context(base_id, args.bases_dir)
        return ctx_cache[base_id]

    specs = [
        s
        for s in fg2.GARMENT_CATALOG
        if (args.genre == "all" or s.genre == args.genre)
        and (args.part == "all" or s.preset_id.endswith(f"/{args.part}") or s.preset_id == args.part)
    ]

    bvh_by_preset: dict[str, BVHTree] = {}
    results: list[gc.GarmentExportResult] = []
    failed_count = 0

    for spec in specs:
        ctx = get_ctx(spec.default_base)
        gb = spec.builder(ctx)
        slug = spec.preset_id.split("/", 1)[1]
        out_path = args.out_dir / f"{slug}.glb"
        under_bvh = bvh_by_preset.get(spec.underlayer_preset) if spec.underlayer_preset else None

        res = gc.assemble_and_export_garment(
            ctx=ctx,
            gb=gb,
            preset_id=spec.preset_id,
            genre=spec.genre,
            slot=spec.slot,
            layer=spec.layer,
            channel_specs=spec.channels,
            hides=spec.hides,
            shape_names=spec.shapes,
            textures_bank=textures_bank,
            out_path=out_path,
            min_body_clearance_m=spec.min_clearance_mm / 1000.0,
            underlayer_bvh_b=under_bvh,
            min_underlayer_gap_m=0.0012,
            check_85_shoulder=spec.check_85_shoulder,
            is_shoes=spec.is_shoes,
        )
        if res.final_bvh_b is not None:
            bvh_by_preset[spec.preset_id] = res.final_bvh_b
        results.append(res)
        if not res.passed:
            failed_count += 1
        status = "PASS" if res.passed else "FAIL"
        p85 = res.clearance["poses"].get("raise_85_deg", {})
        print(
            f"[forge_garments_v3] {status} | {spec.preset_id:30s} ({spec.default_base:14s}) | "
            f"{res.bytes/1024:6.1f} KB | tris={res.triangles:5d} | ch={len(res.materials)} | "
            f"uv0_ov={res.uv0_overlap:.4f} | uv1={res.uv1_density['medianCmPerUnit']:5.1f}cm | "
            f"clr={res.clearance['restMinClearanceMm']:5.2f}mm | "
            f"p85_pen={p85.get('penetratingVerts', '-')} | valErr={res.gltf_validator['errorCount']}"
        )
        if res.errors:
            for e in res.errors:
                print(f"    !! ERROR: {e}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    registry: dict[str, Any] = {
        "schema": "toonstudio.character-kit.garments-v2-registry/1",
        "craftVersion": "v3",
        "uv1CmPerUnit": gc.UV1_CM_PER_UNIT,
        "count": len(results),
        "genres": sorted({r.genre for r in results}),
        "parts": {},
    }
    qa_summary: dict[str, Any] = {
        "schema": "toonstudio.character-kit.garments-v2-qa/1",
        "craftVersion": "v3",
        "total": len(results),
        "passed": len(results) - failed_count,
        "failed": failed_count,
        "elapsedSeconds": round(time.time() - t0, 2),
        "results": {},
    }
    for r in results:
        registry["parts"][r.preset_id] = {
            "genre": r.genre,
            "slot": r.slot,
            "layer": r.layer,
            "node": r.node_name,
            "targetBase": r.target_base,
            "file": {"path": r.glb_path.name, "bytes": r.bytes, "sha256": r.sha256},
            "materials": r.materials,
            "hides": r.hides,
            "shapes": r.shapes,
            "uv1": {"purpose": "pattern", "cmPerUnit": gc.UV1_CM_PER_UNIT},
            "triangles": r.triangles,
            "vertices": r.vertices,
        }
        qa_summary["results"][r.glb_path.name] = {
            "presetId": r.preset_id,
            "passed": r.passed,
            "errors": r.errors,
            "bytes": r.bytes,
            "triangles": r.triangles,
            "channels": len(r.materials),
            "uv0Overlap": r.uv0_overlap,
            "uv1DensityCm": r.uv1_density,
            "clearance": r.clearance,
            "bmeshAudit": r.bmesh_audit,
            "gltfValidator": r.gltf_validator,
        }

    (args.out_dir / "garments_v2_registry.json").write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (args.out_dir / "garments_qa_summary.json").write_text(
        json.dumps(qa_summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    if not args.skip_render and args.genre == "all" and args.part == "all":
        fg2.render_contact_sheet(
            args.bases_dir,
            args.out_dir,
            fg2.SIX_GENRE_ENSEMBLES,
            args.preview_dir / "garments-6-sheet-v3.png",
            res=args.res,
        )
        fg2.render_contact_sheet(
            args.bases_dir,
            args.out_dir,
            fg2.EXTRA_AND_POSE_ENSEMBLES,
            args.preview_dir / "garments-extra-and-85pose-sheet-v3.png",
            res=args.res,
        )

    print(
        f"[forge_garments_v3] 완료: {len(results) - failed_count}/{len(results)} PASS "
        f"({time.time() - t0:.1f}s) → {args.out_dir}"
    )
    return 0 if failed_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
