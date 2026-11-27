"""ToonStudio Character Kit v2 — 6대 웹툰 장르 다채널 의상 파츠 생성기 (34종, Blender 5.3 헤드리스).

`blender-3d-plan.md` 3.5절 A의 6대 의상군 전체 34개 파츠를 단순 바디 오프셋이 아닌
실제 재단선·칼라·라펠·16주름·소매 커프스·단추·포켓·견장·케이프·무릎패드·하네스·Y자 교차깃·자락분할·옥패
솔리드/베벨 토폴로지로 제작하고, 다채널 재질(1~3)·UV0 비중첩·UV1 cm 균일 밀도(50 cm/unit)·
체형 morph 18개·형태 morph(`shape:*`)·`bodyRegions` 숨김·층간 간격(`inner>=1.5mm`, `outer>=4.0mm`)·
85° 어깨 거상 비관통·`bmesh` 0-결함·6장르 EEVEE 컨택트시트를 일괄 실행한다.

실행:
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/forge_garments_v2.py -- \
        --out-dir data/character-studio-assets/characters/toonstudio-kit-v2/parts/garments \
        --preview-dir loop-stack/competitor-parity/previews/char
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

_THIS_DIR = Path(__file__).resolve().parent
_BLENDER_TOOLS_DIR = _THIS_DIR.parent
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from character_kit import build_base_v2 as bb2  # noqa: E402
from character_kit import garment_core_v2 as gc  # noqa: E402
from character_kit import qa_character_gate as qa  # noqa: E402

# ---------------------------------------------------------------------------
# 공통 소형 디테일 헬퍼 (단추·포켓·플랩·패드·스트랩·자락 분할)
# ---------------------------------------------------------------------------


def _surface_point_front(ctx: gc.BaseBodyContext, z: float, theta: float, extra_r: float) -> tuple[np.ndarray, np.ndarray]:
    """몸통 높이 z, 방위각 theta에서 반지름 + extra_r 위치와 바깥 단위 벡터."""
    x, y, _ = ctx.sample_torso_radius(z, theta)
    d = np.array([math.sin(theta), -math.cos(theta), 0.0], dtype=np.float64)
    return np.array([x, y, z], dtype=np.float64) + d * extra_r, d


def _add_button_row(
    gb: gc.GarmentBuilder,
    z_list: list[float],
    theta: float,
    ease: float,
    *,
    radius: float = 0.0075,
    thickness: float = 0.0036,
    channel: str = "accent",
) -> None:
    ctx = gb.ctx
    for z in z_list:
        pt, d = _surface_point_front(ctx, z, theta, ease)
        gb.add_beveled_cylinder(pt, pt + d * thickness, radius, radius * 0.92, segs=12, channel=channel, skin_zone="torso", part_tag="button")


def _add_welt_or_patch_pocket(
    gb: gc.GarmentBuilder,
    z_center: float,
    theta_center: float,
    ease: float,
    *,
    half_angle: float = 0.16,
    half_h: float = 0.042,
    depth: float = 0.0065,
    with_flap: bool = True,
    channel: str = "main",
    flap_channel: str | None = None,
    button_channel: str | None = None,
) -> None:
    """입체 주머니 본체 + 선택 베벨 포켓 플랩 + 단추."""
    ctx = gb.ctx
    m, n = 4, 5
    grid = np.empty((m, n, 3), dtype=np.float64)
    for i in range(m):
        z = (z_center - half_h) + (2.0 * half_h) * (i / (m - 1))
        for j in range(n):
            th = (theta_center - half_angle) + (2.0 * half_angle) * (j / (n - 1))
            pt, _ = _surface_point_front(ctx, z, th, ease)
            grid[i, j] = pt
    out_dir = np.array([math.sin(theta_center), -math.cos(theta_center), 0.0], dtype=np.float64)
    gb.add_offset_panel(grid, depth, outward_dir=out_dir, channel=channel, skin_zone="torso", part_tag="pocket")

    if with_flap:
        f_grid = np.empty((3, n, 3), dtype=np.float64)
        for i in range(3):
            z = (z_center + half_h * 0.42) + (half_h * 0.68) * (i / 2.0)
            for j in range(n):
                th = (theta_center - half_angle * 1.06) + (2.0 * half_angle * 1.06) * (j / (n - 1))
                pt, _ = _surface_point_front(ctx, z, th, ease + depth + 0.0012)
                f_grid[i, j] = pt
        gb.add_offset_panel(f_grid, 0.0034, outward_dir=out_dir, channel=flap_channel or channel, skin_zone="torso", part_tag="pocket_flap")
        if button_channel is not None:
            bp, bd = _surface_point_front(ctx, z_center + half_h * 0.65, theta_center, ease + depth + 0.0046)
            gb.add_beveled_cylinder(bp, bp + bd * 0.0032, 0.0055, segs=10, channel=button_channel, skin_zone="torso", part_tag="button")


def _add_placket_strip(
    gb: gc.GarmentBuilder,
    z_bot: float,
    z_top: float,
    ease: float,
    *,
    half_w_rad: float = 0.11,
    thickness: float = 0.0032,
    channel: str = "main",
    part_tag: str = "placket",
) -> None:
    ctx = gb.ctx
    m, n = 8, 4
    grid = np.empty((m, n, 3), dtype=np.float64)
    for i in range(m):
        z = z_bot + (z_top - z_bot) * (i / (m - 1))
        for j in range(n):
            th = -half_w_rad + (2.0 * half_w_rad) * (j / (n - 1))
            pt, _ = _surface_point_front(ctx, z, th, ease)
            grid[i, j] = pt
    gb.add_offset_panel(grid, thickness, outward_dir=np.array([0.0, -1.0, 0.0]), channel=channel, skin_zone="torso", part_tag=part_tag)


def _add_open_jacket_body(
    gb: gc.GarmentBuilder,
    *,
    z_hem: float,
    z_neck: float,
    z_v_join: float,
    base_ease: float,
    waist_cinch: float = 0.0,
    shoulder_pad: float = 0.008,
    flare_below_z: float | None = None,
    flare_rate: float = 0.0,
    thickness: float = 0.0034,
    v_open_top_rad: float = 0.56,
    front_gap_bottom_rad: float = 0.04,
    channel: str = "main",
    trim_piping_channel: str | None = None,
    split_lower_panels: bool = False,
) -> None:
    """앞여밈이 열린 블레이저/정장/가디건/트렌치/제국 코트/도포 몸통 셸(반지름 드레이프 + 허리·밑단 깔끔 여유)."""
    ctx = gb.ctx
    p = ctx.plan
    n_z = 16
    z_stops = np.linspace(z_hem, z_neck, n_z)
    n_seg = 36

    r_raw = np.empty((n_z, n_seg), dtype=np.float64)
    th_mat = np.empty((n_z, n_seg), dtype=np.float64)
    ycs = np.empty(n_z, dtype=np.float64)
    centers = np.zeros((n_z, 3), dtype=np.float64)

    for i, z in enumerate(z_stops):
        zf = float(z)
        yc = ctx._torso_y_center(zf)  # noqa: SLF001
        ycs[i] = yc
        centers[i] = (0.0, yc, zf)
        t_v = gc.smoothstep_f(z_v_join, z_neck, zf)
        gap_rad = front_gap_bottom_rad + (v_open_top_rad - front_gap_bottom_rad) * t_v
        thetas = np.linspace(gap_rad, 2.0 * math.pi - gap_rad, n_seg)
        th_mat[i] = thetas
        for j, th in enumerate(thetas):
            _, _, r_body = ctx.sample_torso_radius(zf, float(th))
            w_sh = gc.smoothstep_f(p.z_chest, p.z_shoulder + 0.025, zf) * (abs(math.sin(th)) ** 1.4)
            w_waist = math.exp(-(((zf - p.z_waist) / 0.07) ** 2))
            e = base_ease + shoulder_pad * w_sh - waist_cinch * w_waist
            if flare_below_z is not None and zf < flare_below_z:
                e += (flare_below_z - zf) * flare_rate
            r_raw[i, j] = r_body + max(e, 0.0105)

    # 반지름 공간에서 드레이프 평활(직선 하강 엔벨로프 → 이너 셔츠보다 항상 바깥에서 곧게 떨어짐!)
    r_drape = gc.smooth_drape_radii(r_raw, vertical_passes=3, angular_passes=2, closed_u=False, hang_slope=0.0025)
    inner_g = np.empty((n_z, n_seg, 3), dtype=np.float64)
    for i, z in enumerate(z_stops):
        zf = float(z)
        yc = ycs[i]
        for j in range(n_seg):
            th = th_mat[i, j]
            rr = r_drape[i, j]
            inner_g[i, j] = (rr * math.sin(th), yc - rr * math.cos(th), zf)

    outer_g = gc.offset_grid_radial(inner_g, centers, thickness)

    if split_lower_panels and z_hem < p.z_hips - 0.10:
        split_idx = int(np.searchsorted(z_stops, p.z_hips - 0.03))
        split_idx = max(3, min(n_z - 4, split_idx))
        gb.add_thick_shell(outer_g[split_idx:], inner_g[split_idx:], closed_u=False, channel=channel, skin_zone="torso", bevel_rim=True, part_tag="torso")
        c1 = n_seg // 3
        c2 = (2 * n_seg) // 3
        for j0, j1, ptag in ((0, c1, "skirt_l"), (c1 + 1, c2, "skirt_back"), (c2 + 1, n_seg, "skirt_r")):
            gb.add_thick_shell(
                outer_g[: split_idx + 2, j0:j1],
                inner_g[: split_idx + 2, j0:j1],
                closed_u=False,
                channel=channel,
                skin_zone="skirt",
                bevel_rim=True,
                part_tag=ptag,
            )
    else:
        gb.add_thick_shell(outer_g, inner_g, closed_u=False, channel=channel, skin_zone="torso", bevel_rim=True, part_tag="torso")

    if trim_piping_channel is not None:
        gb.add_swept_tube(outer_g[:, 0], 0.0022, n_prof=6, channel=trim_piping_channel, skin_zone="torso", part_tag="front_trim")
        gb.add_swept_tube(outer_g[:, -1], 0.0022, n_prof=6, channel=trim_piping_channel, skin_zone="torso", part_tag="front_trim")
        gb.add_swept_tube(outer_g[0, :], 0.0022, n_prof=6, channel=trim_piping_channel, skin_zone="torso", part_tag="hem_trim")


# ===========================================================================
# 1. 한국 학원 교복 (Korean Academy Uniform — 6종)
# ===========================================================================


def build_school_shirt_tie(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_bot = p.z_hips - 0.015
    z_top = p.z_neck_base + 0.006
    z_stops = np.linspace(z_bot, z_top, 14)

    # 1) 맞춤 셔츠 몸통 (치마·바지 허리선 안으로 깔끔히 들어가는 슬림 이너 핏, >= 2.0mm)
    in_g, c_g = gc.build_torso_grid(
        ctx, z_stops, 32,
        lambda z, th: 0.0024 + 0.0014 * gc.smoothstep_f(p.z_waist, p.z_chest, z),
        closed_u=True, hang_slope=0.0,
    )
    out_g = gc.offset_grid_radial(in_g, c_g, 0.0019)
    gb.add_thick_shell(out_g, in_g, closed_u=True, channel="main", skin_zone="torso", bevel_rim=True, part_tag="torso")

    # 2) 소매 + 트림 커프스
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.78, x_end_frac=0.92,
        ease_fn=lambda ta, ph: 0.0034 + 0.0015 * (1.0 - ta),
        thickness=0.0020, channel="main", cuff_channel="trim", cuff_len=0.048, cuff_step=0.0015,
    )

    # 3) 입체 접힘 셔츠 칼라 + 파이핑 + 앞 플래킷 + 단추 5개
    gc.add_stand_or_folded_collar(
        gb, z_base=p.z_neck_base + 0.002, stand_h=0.024, fold_drop=0.036, flare_out=0.013,
        ease=0.0042, thickness=0.0024, front_gap_rad=0.22, channel="main", trim_edge_channel="trim", folded=True,
    )
    _add_placket_strip(gb, z_bot + 0.01, z_top - 0.008, ease=0.0062, half_w_rad=0.10, thickness=0.0022, channel="main")
    _add_button_row(gb, np.linspace(p.z_waist, p.z_chest + 0.05, 5).tolist(), 0.0, ease=0.0085, radius=0.0045, thickness=0.0025, channel="accent")

    # 4) 학원 교복 시그니처 리본 보우 (여성/유스) 또는 넥타이 (남성)
    style = "ribbon" if ctx.archetype_id in ("female-romance", "youth-academy", "sd-chibi") else "necktie"
    gc.add_necktie_or_ribbon(gb, z_collar=p.z_neck_base + 0.012, z_tip=p.z_waist + 0.02, base_ease=0.0065, style=style, channel="accent", trim_channel="trim")

    # 5) 좌측 가슴 포켓 웰트
    _add_welt_or_patch_pocket(gb, p.z_chest + 0.012, +0.44, ease=0.0065, half_angle=0.14, half_h=0.032, depth=0.0032, with_flap=False, channel="trim")
    return gb


def build_school_blazer(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_hem = p.z_crotch - 0.015
    z_neck = p.z_neck_base + 0.004
    z_btn = p.z_waist + 0.024
    ease = 0.0135

    # 1) 테일러드 학원 네이비 블레이저 본체 (앞 V오프닝 + 아이보리 파이핑 + 플리츠 스커트 위 깔끔 플레어!)
    _add_open_jacket_body(
        gb, z_hem=z_hem, z_neck=z_neck, z_v_join=z_btn,
        base_ease=ease, waist_cinch=0.0015, shoulder_pad=0.0095,
        flare_below_z=p.z_waist + 0.01, flare_rate=0.14, thickness=0.0035,
        v_open_top_rad=0.58, front_gap_bottom_rad=0.03,
        channel="main", trim_piping_channel="trim",
    )

    # 2) 소매 + 트림 커프스 띠 + 소매 금단추 3쌍
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.76, x_end_frac=0.90,
        ease_fn=lambda ta, ph: 0.0125 + 0.0035 * (1.0 - ta),
        thickness=0.0034, channel="main", cuff_channel="trim", cuff_len=0.032, cuff_step=0.0022,
    )
    for side, lab in ((+1, "Left"), (-1, "Right")):
        x_h = abs(float(ctx.joint_b(f"{bb2.MIXAMO}{lab}Hand")[0]))
        x_sh = abs(float(ctx.joint_b(f"{bb2.MIXAMO}{lab}Arm")[0]))
        x_cuff = x_sh + (x_h - x_sh) * 0.84
        for bi in range(3):
            xb = x_cuff - bi * 0.013
            ax = ctx.arm_axis_pt(side, xb)
            r_arm = ctx.sample_arm_ring(side, xb, 12, 0.0165)
            pt = r_arm[6]  # 소매 바깥 뒤쪽(+Y)
            gb.add_beveled_cylinder(pt, pt + np.array([0.0, 0.0032, 0.0]), 0.0045, segs=10, channel="accent", skin_zone=f"arm.{lab[0]}", part_tag="cuff_btn")

    # 3) 노치드 라펠 + 아이보리 파이핑 + 뒤 칼라
    gc.add_tailored_lapels(gb, z_top=z_neck - 0.01, z_button=z_btn, base_ease=ease + 0.003, lapel_width=0.044, thickness=0.0034, peaked=False, channel="main", piping_channel="trim")
    gc.add_stand_or_folded_collar(gb, z_base=z_neck - 0.002, stand_h=0.022, fold_drop=0.026, flare_out=0.016, ease=ease + 0.002, thickness=0.0030, front_gap_rad=0.62, channel="main", trim_edge_channel="trim", folded=True)

    # 4) 금장 앞단추 2개 + 양쪽 힙 포켓 플랩 + 좌측 가슴 엠블럼 방패
    _add_button_row(gb, [z_btn, z_btn - 0.068], 0.06, ease=ease + 0.0045, radius=0.0085, thickness=0.0042, channel="accent")
    for s_th in (+0.56, -0.56):
        _add_welt_or_patch_pocket(gb, p.z_hips + 0.008, s_th, ease=ease + 0.004, half_angle=0.18, half_h=0.036, depth=0.005, with_flap=True, channel="main", flap_channel="trim")
    # 가슴 교표 엠블럼 방패
    ep, ed = _surface_point_front(ctx, p.z_chest + 0.020, +0.46, ease + 0.0052)
    gb.add_beveled_box(ep + ed * 0.0025, (0.028, 0.0045, 0.034), rot_euler=(0.0, 0.0, +0.42), bevel_width=0.0014, channel="accent", skin_zone="torso", part_tag="crest")
    return gb


def build_pleated_skirt(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_waist = p.z_waist + 0.010
    z_yoke_bot = p.z_hips + 0.012
    z_hem = p.z_knee + 0.095

    # 1) 구조화된 허리밴드 + 요크 (trim)
    z_wb = np.linspace(z_waist - 0.034, z_waist + 0.004, 4)
    wb_in, wb_c = gc.build_torso_grid(ctx, z_wb, 36, lambda z, th: 0.0048, closed_u=True)
    wb_out = gc.offset_grid_radial(wb_in, wb_c, 0.0042)
    gb.add_thick_shell(wb_out, wb_in, closed_u=True, channel="trim", skin_zone="torso", bevel_rim=True, part_tag="waistband")

    # 2) 실제 16주름 칼주름 스커트 메쉬! (주름당 4세그먼트 = 64세그먼트 원주 + UV1 호길이 연속 체크 패턴!)
    n_pleats = 16
    n_seg = n_pleats * 4  # 64 세그먼트 → 모든 주름 능선·골짜기가 칼처럼 뚜렷함!
    z_sk = np.linspace(z_hem, z_waist - 0.028, 12)
    sk_in, sk_c = gc.build_torso_grid(
        ctx, z_sk, n_seg,
        lambda z, th: 0.0065 + 0.012 * gc.smoothstep_f(z_yoke_bot, z_hem, z),
        closed_u=True,
        flare_below_z=z_yoke_bot,
        flare_rate=0.22,
        pleat_count=n_pleats,
        pleat_depth_fn=lambda z: 0.002 + 0.019 * gc.smoothstep_f(z_waist - 0.025, z_hem, z),
    )
    sk_out = gc.offset_grid_radial(sk_in, sk_c, 0.0026)
    gb.add_thick_shell(sk_out, sk_in, closed_u=True, channel="main", skin_zone="skirt", bevel_rim=True, part_tag="skirt")

    # 3) 밑단 콘트라스트 더블 라인 트림 (주름 따라감)
    gb.add_swept_tube(sk_out[1], 0.0022, n_prof=6, closed_curve=True, channel="trim", skin_zone="skirt", part_tag="hem_stripe")
    gb.add_swept_tube(sk_out[2], 0.0018, n_prof=6, closed_curve=True, channel="trim", skin_zone="skirt", part_tag="hem_stripe")
    return gb


def build_school_slacks(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    gc.add_trouser_legs_and_pelvis(
        gb, z_waist=p.z_waist + 0.008, z_hem=p.z_ankle + 0.005,
        waist_ease=0.0045, hip_ease=0.0085, thigh_ease=0.013, calf_ease=0.011,
        thickness=0.0028, front_crease=0.0065, channel="main",
        waistband_channel="trim", waistband_h=0.036, belt_loops=True,
        belt_buckle_channel="trim", cuff_turnup_h=0.028, cuff_channel="main",
    )
    return gb


def build_knee_socks(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_top = p.z_knee - 0.032
    z_bot = p.z_ankle * 0.55
    n_rings = 10
    n_seg = 20
    zs = np.linspace(z_bot, z_top, n_rings)

    for side, lab in ((+1, "Left"), (-1, "Right")):
        s_in = np.empty((n_rings, n_seg, 3), dtype=np.float64)
        s_out = np.empty((n_rings, n_seg, 3), dtype=np.float64)
        for i, z in enumerate(zs):
            axis = ctx.leg_axis_pt(side, float(z))
            ring = ctx.sample_leg_ring(side, float(z), n_seg, 0.0028, clamp_midline=True)
            rad = ring - axis[None, :]
            rad[:, 2] = 0.0
            rn = np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
            # 상단 시보리 밴드(상위 2링) 살짝 두툼한 리브 단차
            th = 0.0020 + (0.0014 if i >= n_rings - 2 else 0.0)
            s_in[i] = ring
            s_out[i] = ring + (rad / rn) * th
        gb.add_thick_shell(s_out, s_in, closed_u=True, channel="main", skin_zone=f"leg.{lab[0]}", bevel_rim=True, part_tag="sock")
        # 상단 2줄 입체 리브 스트라이프
        gb.add_swept_tube(s_out[-2], 0.0018, n_prof=6, closed_curve=True, channel="main", skin_zone=f"leg.{lab[0]}", part_tag="sock_rib")
    return gb


def build_loafers(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    gc.add_sculpted_footwear(
        gb, shaft_height=p.z_ankle * 1.02, sole_thick=0.013, heel_height=0.022,
        penny_strap=True, channel_upper="main", channel_sole="sole", channel_lace="lace",
    )
    return gb


# ===========================================================================
# 2. 현대 일상 캐주얼 (Modern Everyday Casual — 6종)
# ===========================================================================


def build_oversized_hoodie(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_hem = p.z_hips - 0.012
    z_rib_top = z_hem + 0.052
    z_neck = p.z_neck_base + 0.006

    # 1) 오버사이즈 드롭숄더 몸통 (직선 드레이프로 스트릿 핏 구현)
    z_stops = np.linspace(z_rib_top - 0.008, z_neck, 14)
    in_g, c_g = gc.build_torso_grid(
        ctx, z_stops, 34,
        lambda z, th: 0.022 + 0.006 * gc.smoothstep_f(p.z_waist, p.z_chest, z),
        closed_u=True, hang_slope=0.0015,
    )
    out_g = gc.offset_grid_radial(in_g, c_g, 0.0038)
    gb.add_thick_shell(out_g, in_g, closed_u=True, channel="main", skin_zone="torso", bevel_rim=True, part_tag="torso")

    # 2) 밑단 시보리 리브 밴드 (trim, 데님 허리밴드 바깥으로 깔끔하게 덮이는 스트릿 핏!)
    z_rib = np.linspace(z_hem, z_rib_top, 4)
    r_in, r_c = gc.build_torso_grid(
        ctx, z_rib, 34,
        lambda z, th: 0.020 + 0.004 * gc.smoothstep_f(z_hem, z_rib_top, z) + 0.0012 * math.sin(th * 28.0),
        closed_u=True,
    )
    r_out = gc.offset_grid_radial(r_in, r_c, 0.0044)
    gb.add_thick_shell(r_out, r_in, closed_u=True, channel="trim", skin_zone="torso", bevel_rim=True, part_tag="hem_rib")

    # 3) 넉넉한 소매 + 리브 시보리 커프스
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.75, x_end_frac=0.92,
        ease_fn=lambda ta, ph: 0.018 + 0.006 * math.sin(ta * math.pi),
        thickness=0.0036, channel="main", cuff_channel="trim", cuff_len=0.052, cuff_step=0.0024,
    )

    # 4) 등 뒤로 자연스럽게 접혀 걸친 입체 3D 후드!
    m_h, n_h = 8, 22
    h_thetas = np.linspace(0.24, 2.0 * math.pi - 0.24, n_h)
    hood_grid = np.empty((m_h, n_h, 3), dtype=np.float64)
    yc = ctx._torso_y_center(z_neck)  # noqa: SLF001
    for i in range(m_h):
        t = i / (m_h - 1)  # 0=목둘레 → 0.5=뒤로 둥글게 넘김 → 1=등 위 접힌 끝단
        for j, th in enumerate(h_thetas):
            _, _, r_n = ctx.sample_torso_radius(p.z_neck_base, float(th))
            back = max(0.0, -math.cos(th))  # 뒤쪽(+Y)으로 깊게 처지는 후드 주머니!
            z_cur = z_neck + 0.036 * math.sin(t * math.pi * 0.72) - (0.095 * back + 0.018 * (1.0 - back)) * (t ** 1.35)
            r_cur = r_n + 0.016 + (0.048 * back + 0.018) * math.sin(t * math.pi * 0.85) + 0.025 * back * t
            hood_grid[i, j] = (r_cur * math.sin(th), yc - r_cur * math.cos(th), z_cur)
    gb.add_offset_panel(hood_grid, 0.0055, outward_dir=np.array([0.0, 0.6, 0.8]), channel="main", skin_zone="torso", part_tag="hood")
    gb.add_swept_tube(hood_grid[2], 0.0032, n_prof=6, channel="trim", skin_zone="torso", part_tag="hood_rim")

    # 5) 앞면 입체 캥거루 포켓 (사선 손 넣는 입구 형태)
    km, kn = 5, 9
    k_grid = np.empty((km, kn, 3), dtype=np.float64)
    z_k0, z_k1 = z_rib_top + 0.006, p.z_waist + 0.068
    for i in range(km):
        v = i / (km - 1)
        z = z_k0 + (z_k1 - z_k0) * v
        # 상단이 좁고 하단이 넓은 사다리꼴 캥거루 포켓!
        ang_w = 0.58 - 0.18 * v
        for j in range(kn):
            u = (j / (kn - 1)) * 2.0 - 1.0
            th = u * ang_w
            pt, _ = _surface_point_front(ctx, z, th, 0.025)
            k_grid[i, j] = pt
    gb.add_offset_panel(k_grid, 0.0075, outward_dir=np.array([0.0, -1.0, 0.0]), channel="main", skin_zone="torso", part_tag="kangaroo_pocket")

    # 6) 메탈 아일렛 그로밋 2개 + 늘어지는 후드 끈(드로스트링) + 메탈 애글릿 끝단 + 가슴 패치
    for side in (+1.0, -1.0):
        ep, ed = _surface_point_front(ctx, z_neck - 0.012, side * 0.24, 0.025)
        gb.add_beveled_cylinder(ep, ep + ed * 0.0038, 0.0052, segs=10, channel="accent", skin_zone="torso", part_tag="eyelet")
        # 끈 곡선
        cord_pts = []
        for ci in range(8):
            ct = ci / 7.0
            zc = (z_neck - 0.014) - ct * 0.145
            cp, _ = _surface_point_front(ctx, zc, side * (0.24 + 0.03 * math.sin(ct * math.pi)), 0.028 + 0.004 * math.sin(ct * math.pi))
            cord_pts.append(cp)
        cord_arr = np.stack(cord_pts, axis=0)
        gb.add_swept_tube(cord_arr, 0.0026, n_prof=6, channel="trim", skin_zone="torso", part_tag="drawstring")
        gb.add_beveled_cylinder(cord_arr[-1], cord_arr[-1] + np.array([0.0, 0.0, -0.014]), 0.0032, segs=8, channel="accent", skin_zone="torso", part_tag="aglet")

    lp, ld = _surface_point_front(ctx, p.z_chest + 0.028, +0.44, 0.028)
    gb.add_beveled_box(lp + ld * 0.0022, (0.034, 0.004, 0.018), rot_euler=(0.0, 0.0, +0.40), bevel_width=0.0012, channel="accent", skin_zone="torso", part_tag="logo_patch")
    return gb


def build_knit_cardigan(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_hem = p.z_hips - 0.032
    z_neck = p.z_neck_base + 0.004
    ease = 0.0165

    _add_open_jacket_body(
        gb, z_hem=z_hem, z_neck=z_neck, z_v_join=p.z_chest - 0.02,
        base_ease=ease, waist_cinch=0.0, shoulder_pad=0.005,
        flare_below_z=p.z_waist, flare_rate=0.15,
        thickness=0.0042, v_open_top_rad=0.52, front_gap_bottom_rad=0.05,
        channel="main", trim_piping_channel="trim",
    )
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.76, x_end_frac=0.91,
        ease_fn=lambda ta, ph: 0.0135 + 0.0035 * math.sin(ta * math.pi),
        thickness=0.0040, channel="main", cuff_channel="trim", cuff_len=0.050, cuff_step=0.0025,
    )
    # 4개 뿔/우드 단추 + 패치 포켓 2개
    _add_button_row(gb, np.linspace(p.z_hips + 0.02, p.z_chest - 0.03, 4).tolist(), 0.08, ease=ease + 0.0055, radius=0.009, thickness=0.0042, channel="accent")
    for s_th in (+0.52, -0.52):
        _add_welt_or_patch_pocket(gb, p.z_hips + 0.018, s_th, ease=ease + 0.005, half_angle=0.18, half_h=0.044, depth=0.0055, with_flap=False, channel="main", flap_channel="trim")
        # 포켓 상단 리브 스트라이프
        p0, _ = _surface_point_front(ctx, p.z_hips + 0.062, s_th - 0.17, ease + 0.011)
        p1, _ = _surface_point_front(ctx, p.z_hips + 0.062, s_th + 0.17, ease + 0.011)
        gb.add_swept_tube(np.stack([p0, p1]), 0.0025, n_prof=6, channel="trim", skin_zone="torso", part_tag="pocket_rib")
    return gb


def build_ribbed_tee(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_bot = p.z_hips - 0.018
    z_top = p.z_neck_base - 0.006
    z_stops = np.linspace(z_bot, z_top, 12)

    in_g, c_g = gc.build_torso_grid(
        ctx, z_stops, 32,
        lambda z, th: 0.0026 + 0.0012 * gc.smoothstep_f(p.z_waist, p.z_chest, z) + 0.0005 * math.sin(th * 24.0),
        closed_u=True, hang_slope=0.0,
    )
    out_g = gc.offset_grid_radial(in_g, c_g, 0.0020)
    gb.add_thick_shell(out_g, in_g, closed_u=True, channel="main", skin_zone="torso", bevel_rim=True, part_tag="torso")

    # 반소매 + 이중 스티치 커프스
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.78, x_end_frac=0.38,
        ease_fn=lambda ta, ph: 0.0065 + 0.0025 * ta,
        thickness=0.0024, n_rings=7, channel="main", cuff_channel="trim", cuff_len=0.018, cuff_step=0.0014,
    )
    # 크루넥 리브 링
    z_nk = np.linspace(z_top - 0.014, z_top + 0.004, 3)
    nk_in, nk_c = gc.build_torso_grid(ctx, z_nk, 32, lambda z, th: 0.0062, closed_u=True)
    nk_out = gc.offset_grid_radial(nk_in, nk_c, 0.0036)
    gb.add_thick_shell(nk_out, nk_in, closed_u=True, channel="trim", skin_zone="torso", bevel_rim=True, part_tag="collar")

    # 미니멀 가슴 포켓 + 직조 탭
    _add_welt_or_patch_pocket(gb, p.z_chest + 0.012, +0.44, ease=0.0072, half_angle=0.14, half_h=0.036, depth=0.0035, with_flap=False, channel="accent")
    return gb


def build_wide_denim(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    gc.add_trouser_legs_and_pelvis(
        gb, z_waist=p.z_waist + 0.005, z_hem=p.z_ankle * 0.72,
        waist_ease=0.0055, hip_ease=0.012, thigh_ease=0.026, calf_ease=0.034,
        thickness=0.0034, front_crease=0.0, channel="main",
        waistband_channel="trim", waistband_h=0.040, belt_loops=True,
        belt_buckle_channel="trim", cuff_turnup_h=0.045, cuff_channel="trim",
    )
    # 뒷면 데님 패치 포켓 2개 + 앞면 리벳 단추 2개
    for s_th in (math.pi - 0.42, math.pi + 0.42):
        _add_welt_or_patch_pocket(gb, p.z_hips - 0.018, s_th, ease=0.0155, half_angle=0.22, half_h=0.048, depth=0.0048, with_flap=False, channel="main")
    for s_th in (+0.48, -0.48):
        rp, rd = _surface_point_front(ctx, p.z_waist - 0.042, s_th, 0.011)
        gb.add_beveled_cylinder(rp, rp + rd * 0.0030, 0.0042, segs=8, channel="trim", skin_zone="torso", part_tag="rivet")
    return gb


def build_cargo_shorts(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_hem = p.z_knee + 0.020
    gc.add_trouser_legs_and_pelvis(
        gb, z_waist=p.z_waist + 0.004, z_hem=z_hem,
        waist_ease=0.0055, hip_ease=0.012, thigh_ease=0.024, calf_ease=0.026,
        thickness=0.0032, channel="main", waistband_channel="trim", waistband_h=0.040,
        belt_loops=True, belt_buckle_channel="trim",
    )
    # 좌/우 허벅지 입체 벨로우즈 카고 포켓 + 플랩 + 스냅 단추
    z_pk = 0.5 * (p.z_crotch + p.z_knee) + 0.02
    for side, lab in ((+1, "Left"), (-1, "Right")):
        ring = ctx.sample_leg_ring(side, z_pk, 16, 0.028)
        pt_out = ring[4] if side > 0 else ring[12]  # 허벅지 바깥쪽 (+X or -X)
        out_v = np.array([float(side), 0.0, 0.0])
        gb.add_beveled_box(pt_out + out_v * 0.008, (0.016, 0.088, 0.105), bevel_width=0.003, channel="main", skin_zone=f"leg.{lab[0]}", rigid=False, part_tag="cargo_pocket")
        gb.add_beveled_box(pt_out + out_v * 0.014 + np.array([0.0, 0.0, 0.042]), (0.009, 0.094, 0.032), bevel_width=0.002, channel="trim", skin_zone=f"leg.{lab[0]}", rigid=False, part_tag="pocket_flap")
    return gb


def build_sneakers(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    gc.add_sculpted_footwear(
        gb, shaft_height=p.z_ankle * 1.15, sole_thick=0.020, heel_height=0.028,
        lugged_sole=True, lace_rows=5, channel_upper="main", channel_sole="sole", channel_lace="lace",
    )
    return gb


# ===========================================================================
# 3. 오피스 정장 수트 (Office Formal Suit — 6종)
# ===========================================================================


def build_dress_shirt(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_bot = p.z_hips - 0.015
    z_top = p.z_neck_base + 0.006
    z_stops = np.linspace(z_bot, z_top, 14)

    in_g, c_g = gc.build_torso_grid(ctx, z_stops, 32, lambda z, th: 0.0024 + 0.0014 * gc.smoothstep_f(p.z_waist, p.z_chest, z), closed_u=True, hang_slope=0.0)
    out_g = gc.offset_grid_radial(in_g, c_g, 0.0019)
    gb.add_thick_shell(out_g, in_g, closed_u=True, channel="main", skin_zone="torso", bevel_rim=True, part_tag="torso")

    gc.add_tailored_sleeves(
        gb, x_start_frac=0.78, x_end_frac=0.93,
        ease_fn=lambda ta, ph: 0.0034 + 0.0015 * (1.0 - ta),
        thickness=0.0020, channel="main", cuff_channel="trim", cuff_len=0.056, cuff_step=0.0016,
    )
    gc.add_stand_or_folded_collar(
        gb, z_base=p.z_neck_base + 0.002, stand_h=0.028, fold_drop=0.040, flare_out=0.015,
        ease=0.0044, thickness=0.0024, front_gap_rad=0.20, channel="main", trim_edge_channel="trim", folded=True,
    )
    _add_placket_strip(gb, z_bot + 0.01, z_top - 0.006, ease=0.0060, half_w_rad=0.09, thickness=0.0022, channel="main")
    gc.add_necktie_or_ribbon(gb, z_collar=p.z_neck_base + 0.014, z_tip=p.z_waist + 0.01, base_ease=0.0065, style="necktie", channel="accent", trim_channel="trim")
    return gb


def build_tailored_suit(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_hem = p.z_crotch - 0.032
    z_neck = p.z_neck_base + 0.004
    z_btn = p.z_waist + 0.025
    ease = 0.0125

    _add_open_jacket_body(
        gb, z_hem=z_hem, z_neck=z_neck, z_v_join=z_btn,
        base_ease=ease, waist_cinch=0.0045, shoulder_pad=0.014,
        flare_below_z=p.z_waist, flare_rate=0.04, thickness=0.0038,
        v_open_top_rad=0.60, front_gap_bottom_rad=0.025,
        channel="main", trim_piping_channel=None,
    )
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.76, x_end_frac=0.90,
        ease_fn=lambda ta, ph: 0.0135 + 0.0040 * (1.0 - ta),
        thickness=0.0036, channel="main", cuff_channel="main", cuff_len=0.0,
    )
    # 피크드/노치드 라펠 + 윗칼라 + 포켓스퀘어 + 단추
    gc.add_tailored_lapels(gb, z_top=z_neck - 0.010, z_button=z_btn, base_ease=ease + 0.0035, lapel_width=0.056, thickness=0.0038, peaked=True, channel="main", piping_channel="trim")
    gc.add_stand_or_folded_collar(gb, z_base=z_neck - 0.002, stand_h=0.024, fold_drop=0.028, flare_out=0.017, ease=ease + 0.002, thickness=0.0032, front_gap_rad=0.64, channel="main", folded=True)
    _add_button_row(gb, [z_btn, z_btn - 0.075], 0.05, ease=ease + 0.005, radius=0.009, thickness=0.0042, channel="accent")
    for s_th in (+0.56, -0.56):
        _add_welt_or_patch_pocket(gb, p.z_hips + 0.010, s_th, ease=ease + 0.0045, half_angle=0.18, half_h=0.036, depth=0.005, with_flap=True, channel="main")
    # 좌측 가슴 웰트 포켓 + 화이트 포켓스퀘어 (trim)
    _add_welt_or_patch_pocket(gb, p.z_chest + 0.022, +0.44, ease=ease + 0.0045, half_angle=0.13, half_h=0.010, depth=0.004, with_flap=False, channel="main")
    pp, pd = _surface_point_front(ctx, p.z_chest + 0.036, +0.44, ease + 0.0065)
    gb.add_beveled_box(pp + pd * 0.002, (0.036, 0.0045, 0.018), rot_euler=(0.0, 0.14, +0.40), bevel_width=0.0012, channel="trim", skin_zone="torso", part_tag="pocket_square")
    return gb


def build_trench_coat(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_hem = p.z_knee - 0.10
    z_neck = p.z_neck_base + 0.006
    z_btn = p.z_chest - 0.02
    ease = 0.0155

    # 분할 하단 롱 트렌치 코트 본체
    _add_open_jacket_body(
        gb, z_hem=z_hem, z_neck=z_neck, z_v_join=z_btn,
        base_ease=ease, waist_cinch=0.005, shoulder_pad=0.012,
        flare_below_z=p.z_hips, flare_rate=0.14, thickness=0.0040,
        v_open_top_rad=0.58, front_gap_bottom_rad=0.04,
        channel="main", split_lower_panels=True,
    )
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.75, x_end_frac=0.91,
        ease_fn=lambda ta, ph: 0.0165 + 0.0045 * (1.0 - ta),
        thickness=0.0038, channel="main", cuff_channel="trim", cuff_len=0.030, cuff_step=0.0028,
    )
    # 와이드 스톰 라펠 + 칼라
    gc.add_tailored_lapels(gb, z_top=z_neck - 0.008, z_button=z_btn, base_ease=ease + 0.004, lapel_width=0.068, thickness=0.0040, peaked=True, channel="main")
    gc.add_stand_or_folded_collar(gb, z_base=z_neck, stand_h=0.034, fold_drop=0.042, flare_out=0.022, ease=ease + 0.003, thickness=0.0035, front_gap_rad=0.60, channel="main", folded=True)

    # 우측 가슴 건플랩(스톰 실드) + 좌/우 어깨 견장 탭
    _add_welt_or_patch_pocket(gb, p.z_chest + 0.035, -0.42, ease=ease + 0.0055, half_angle=0.26, half_h=0.052, depth=0.0045, with_flap=False, channel="main")
    for side in (+1.0, -1.0):
        x0 = side * (p.spec.neck_rx + 0.015)
        x1 = side * (p.spec.shoulder_half_w * 0.94)
        ep_g = np.empty((2, 5, 3), dtype=np.float64)
        for j in range(5):
            u = j / 4.0
            xc = x0 + (x1 - x0) * u
            z_sh = p.z_neck_base - 0.012 - 0.024 * u + ease + 0.012
            ep_g[0, j] = (xc, -0.018, z_sh)
            ep_g[1, j] = (xc, +0.024, z_sh)
        gb.add_offset_panel(ep_g, 0.0042, outward_dir=np.array([0.0, 0.0, 1.0]), channel="trim", skin_zone="torso", part_tag="epaulette")

    # 허리 트렌치 벨트 + 메탈 사각 버클 + 더블브레스트 8단추
    z_bt = np.linspace(p.z_waist - 0.022, p.z_waist + 0.022, 4)
    bt_in, bt_c = gc.build_torso_grid(ctx, z_bt, 34, lambda z, th: ease + 0.0045, closed_u=True)
    bt_out = gc.offset_grid_radial(bt_in, bt_c, 0.0055)
    gb.add_thick_shell(bt_out, bt_in, closed_u=True, channel="trim", skin_zone="torso", bevel_rim=True, part_tag="belt")
    bp, bd = _surface_point_front(ctx, p.z_waist, 0.0, ease + 0.0115)
    gb.add_beveled_box(bp + bd * 0.003, (0.052, 0.008, 0.048), bevel_width=0.002, channel="accent", skin_zone="torso", part_tag="belt_buckle")
    for s_th in (+0.26, -0.26):
        _add_button_row(gb, np.linspace(p.z_hips - 0.04, p.z_chest - 0.02, 4).tolist(), s_th, ease=ease + 0.005, radius=0.0095, thickness=0.0042, channel="accent")
    return gb


def build_tailored_slacks(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    gc.add_trouser_legs_and_pelvis(
        gb, z_waist=p.z_waist + 0.008, z_hem=p.z_ankle * 0.85,
        waist_ease=0.0045, hip_ease=0.0085, thigh_ease=0.013, calf_ease=0.012,
        thickness=0.0028, front_crease=0.0075, channel="main",
        waistband_channel="trim", waistband_h=0.036, belt_loops=True,
        belt_buckle_channel="trim",
    )
    return gb


def build_pencil_skirt(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_waist = p.z_waist + 0.018
    z_hem = p.z_knee - 0.035

    z_wb = np.linspace(z_waist - 0.040, z_waist + 0.004, 4)
    wb_in, wb_c = gc.build_torso_grid(ctx, z_wb, 32, lambda z, th: 0.0072, closed_u=True)
    wb_out = gc.offset_grid_radial(wb_in, wb_c, 0.0045)
    gb.add_thick_shell(wb_out, wb_in, closed_u=True, channel="trim", skin_zone="torso", bevel_rim=True, part_tag="waistband")

    # 무릎 아래로 우아하게 좁아지는 오피스 펜슬 스커트 (이너 셔츠 위 깔끔 덮힘)
    z_sk = np.linspace(z_hem, z_waist - 0.034, 14)
    sk_in, sk_c = gc.build_torso_grid(
        ctx, z_sk, 36,
        lambda z, th: 0.0085 + 0.010 * gc.smoothstep_f(z_waist, p.z_hips, z) - 0.004 * gc.smoothstep_f(p.z_crotch, z_hem, z),
        closed_u=True, hang_slope=0.003,
    )
    sk_out = gc.offset_grid_radial(sk_in, sk_c, 0.0028)
    gb.add_thick_shell(sk_out, sk_in, closed_u=True, channel="main", skin_zone="skirt", bevel_rim=True, part_tag="skirt")
    # 허리 골드 클래스프
    bp, bd = _surface_point_front(ctx, z_waist - 0.018, 0.0, 0.0115)
    gb.add_beveled_box(bp + bd * 0.0025, (0.036, 0.006, 0.022), bevel_width=0.0018, channel="trim", skin_zone="torso", part_tag="clasp")
    return gb


def build_derby_heels(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    gc.add_sculpted_footwear(
        gb, shaft_height=p.z_ankle * 1.00, sole_thick=0.012, heel_height=0.026,
        lace_rows=4, channel_upper="main", channel_sole="sole", channel_lace="lace",
    )
    return gb


# ===========================================================================
# 4. 로판 드레스 · 제국 제복 (Romance Fantasy & Imperial Uniform — 6종)
# ===========================================================================


def build_rofan_corset_bodice(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_top = p.z_chest + 0.062
    z_waist_base = p.z_waist - 0.012

    # 1) 스위트하트 네크라인 + 바스크 V-허리 코르셋 보디스 (8개 보닝 리브 포함!)
    n_z, n_seg = 14, 36
    thetas = np.linspace(0.0, 2.0 * math.pi, n_seg, endpoint=False)
    in_g = np.empty((n_z, n_seg, 3), dtype=np.float64)
    centers = np.zeros((n_z, 3), dtype=np.float64)
    for i in range(n_z):
        v = i / (n_z - 1)
        for j, th in enumerate(thetas):
            front = max(0.0, math.cos(th))
            # 앞 중앙이 V자로 내려오는 바스크 허리선 + 스위트하트 가슴 곡선!
            z_lo = z_waist_base - 0.058 * (front ** 2.6)
            sweetheart = -0.020 * math.exp(-((min(th, 2 * math.pi - th)) / 0.22) ** 2) + 0.014 * math.exp(-(((min(th, 2 * math.pi - th) - 0.45) / 0.28) ** 2))
            z_hi = z_top + sweetheart
            z = z_lo + (z_hi - z_lo) * v
            yc = ctx._torso_y_center(z)  # noqa: SLF001
            if j == 0:
                centers[i] = (0.0, yc, z)
            _, _, r_b = ctx.sample_torso_radius(z, float(th))
            # 8개 수직 코르셋 보닝 리브 부조
            boning = 0.0018 * (0.5 + 0.5 * math.cos(th * 8.0))
            rr = r_b + 0.0042 + boning
            in_g[i, j] = (rr * math.sin(th), yc - rr * math.cos(th), z)
    out_g = gc.offset_grid_radial(in_g, centers, 0.0032)
    gb.add_thick_shell(out_g, in_g, closed_u=True, channel="main", skin_zone="torso", bevel_rim=True, part_tag="corset")

    # 2) 로판 시그니처 랜턴 퍼프 소매 (상완 풍성한 볼륨 → 아래팔 핏 레이스 소매!)
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.80, x_end_frac=0.88,
        ease_fn=lambda ta, ph: (
            0.0055
            + 0.036 * math.sin(min(1.0, ta / 0.44) * math.pi) * (1.0 if ta < 0.46 else 0.0)
            + 0.0035 * math.sin(ph * 6.0) * (1.0 if ta < 0.44 else 0.0)
        ),
        thickness=0.0028, n_rings=14, n_seg=22,
        channel="main", cuff_channel="trim", cuff_len=0.045, cuff_step=0.0035,
    )

    # 3) 스위트하트 네크라인 + 바스크 허리 레이스 프릴 트림 (물결 러플!)
    neck_ring = out_g[-1].copy()
    for j in range(n_seg):
        neck_ring[j, 2] += 0.0045 + 0.0030 * math.sin(j * 1.4)
    gb.add_swept_tube(neck_ring, 0.0055, n_prof=8, closed_curve=True, channel="trim", skin_zone="torso", part_tag="lace_neck")
    gb.add_swept_tube(out_g[0], 0.0042, n_prof=6, closed_curve=True, channel="trim", skin_zone="torso", part_tag="lace_hem")

    # 4) 앞면 코르셋 리본 레이싱 + 가슴 보석 골드 브로치 (accent)
    for ri in range(4):
        zr = p.z_waist + 0.015 + ri * 0.032
        p_l, _ = _surface_point_front(ctx, zr, +0.12, 0.010)
        p_m, _ = _surface_point_front(ctx, zr + 0.006, 0.0, 0.012)
        p_r, _ = _surface_point_front(ctx, zr, -0.12, 0.010)
        gb.add_swept_tube(np.stack([p_l, p_m, p_r]), 0.0020, n_prof=6, channel="accent", skin_zone="torso", part_tag="corset_lace")

    bp, bd = _surface_point_front(ctx, p.z_chest + 0.042, 0.0, 0.012)
    gb.add_beveled_cylinder(bp, bp + bd * 0.0055, 0.018, 0.016, segs=14, channel="accent", skin_zone="torso", part_tag="brooch_bezel")
    gb.add_gem_or_bead(bp + bd * 0.0075, (0.011, 0.006, 0.015), segs=3, channel="accent", skin_zone="torso", part_tag="brooch_gem")
    return gb


def build_rofan_layered_skirt(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_waist = p.z_waist + 0.005
    z_floor_clear = 0.045

    # Tier 1: 페티코트 풀 랭스 벨 스커트 (허리 → 바닥 4.5cm 위까지 풍성한 A-벨 드레이프!)
    n_z1, n_seg = 16, 48
    z_t1 = np.linspace(z_floor_clear, z_waist, n_z1)
    t1_in, t1_c = gc.build_torso_grid(
        ctx, z_t1, n_seg,
        lambda z, th: 0.0065 + 0.025 * gc.smoothstep_f(z_waist, p.z_hips, z),
        closed_u=True,
        flare_below_z=z_waist - 0.02,
        flare_rate=0.31,
        pleat_count=12,
        pleat_depth_fn=lambda z: 0.018 * (gc.smoothstep_f(z_waist, z_floor_clear, z) ** 1.1),
    )
    t1_out = gc.offset_grid_radial(t1_in, t1_c, 0.0032)
    gb.add_thick_shell(t1_out, t1_in, closed_u=True, channel="main", skin_zone="skirt", bevel_rim=True, part_tag="skirt_tier1")
    gb.add_swept_tube(t1_out[0], 0.0065, n_prof=8, closed_curve=True, channel="trim", skin_zone="skirt", part_tag="hem_lace_1")

    # Tier 2: 스캘럽 물결 중간 오버드레이프 티어 (무릎선)
    z_t2_bot = p.z_knee + 0.02
    z_t2 = np.linspace(z_t2_bot, z_waist - 0.01, 10)
    t2_in, t2_c = gc.build_torso_grid(
        ctx, z_t2, 44,
        lambda z, th: 0.016 + 0.036 * gc.smoothstep_f(z_waist, z_t2_bot, z) + 0.014 * math.sin(th * 8.0) * gc.smoothstep_f(z_waist, z_t2_bot, z),
        closed_u=True,
        flare_below_z=z_waist - 0.02,
        flare_rate=0.36,
    )
    # 스캘럽 물결 밑단 Z 변조
    for j in range(44):
        t2_in[0, j, 2] += 0.028 * abs(math.sin(j * math.pi * 8.0 / 44.0))
    t2_out = gc.offset_grid_radial(t2_in, t2_c, 0.0032)
    gb.add_thick_shell(t2_out, t2_in, closed_u=True, channel="main", skin_zone="skirt", bevel_rim=True, part_tag="skirt_tier2")
    gb.add_swept_tube(t2_out[0], 0.0055, n_prof=8, closed_curve=True, channel="trim", skin_zone="skirt", part_tag="hem_lace_2")

    # Tier 3: 로열 허리 새시 + 뒷면 대형 리본 버슬 (trim)
    z_wb = np.linspace(z_waist - 0.042, z_waist + 0.006, 4)
    wb_in, wb_c = gc.build_torso_grid(ctx, z_wb, 36, lambda z, th: 0.010, closed_u=True)
    wb_out = gc.offset_grid_radial(wb_in, wb_c, 0.0055)
    gb.add_thick_shell(wb_out, wb_in, closed_u=True, channel="trim", skin_zone="torso", bevel_rim=True, part_tag="waist_sash")
    # 뒤 허리 리본 매듭
    rp, rd = _surface_point_front(ctx, z_waist - 0.018, math.pi, 0.022)
    gb.add_beveled_box(rp + rd * 0.010, (0.038, 0.022, 0.032), bevel_width=0.005, channel="trim", skin_zone="torso", part_tag="back_bow")
    for sx in (+1.0, -1.0):
        gb.add_beveled_box(rp + rd * 0.016 + np.array([sx * 0.055, 0.004, -0.005]), (0.075, 0.016, 0.048), rot_euler=(0.0, sx * 0.18, sx * 0.25), bevel_width=0.004, channel="trim", skin_zone="torso", part_tag="back_bow")
    return gb


def build_imperial_uniform_coat(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_hem = p.z_knee - 0.08
    z_neck = p.z_neck_base + 0.008
    ease = 0.0145

    # 1) 북부대공/제국 장교 롱 제복 코트 (하단 분할 자락 + 골드 파이핑)
    _add_open_jacket_body(
        gb, z_hem=z_hem, z_neck=z_neck, z_v_join=p.z_chest + 0.045,
        base_ease=ease, waist_cinch=0.0065, shoulder_pad=0.016,
        flare_below_z=p.z_hips, flare_rate=0.18, thickness=0.0040,
        v_open_top_rad=0.22, front_gap_bottom_rad=0.04,
        channel="main", trim_piping_channel="trim", split_lower_panels=True,
    )

    # 2) 하이 스탠드 만다린 칼라 + 금장 테두리
    gc.add_stand_or_folded_collar(
        gb, z_base=z_neck - 0.002, stand_h=0.042, fold_drop=0.0, flare_out=0.006,
        ease=ease + 0.002, thickness=0.0038, front_gap_rad=0.16,
        channel="trim", trim_edge_channel="accent", folded=False,
    )

    # 3) 턴백 장교 커프스 소매
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.75, x_end_frac=0.91,
        ease_fn=lambda ta, ph: 0.015 + 0.0045 * (1.0 - ta),
        thickness=0.0038, channel="main", cuff_channel="trim", cuff_len=0.072, cuff_step=0.0038,
    )

    # 4) 제국 금장 견장 폴드런 + 프린지 리지 (양쪽 어깨 — 85° 팔 거상 시 상완과 비간섭 높이!)
    for side in (+1.0, -1.0):
        x_in = side * (p.spec.neck_rx + 0.022)
        x_out = side * (p.spec.shoulder_half_w * 0.96)
        z_sh = p.z_neck_base + 0.006 + ease
        gb.add_beveled_box(
            (0.5 * (x_in + x_out), 0.004, z_sh),
            (abs(x_out - x_in), 0.064, 0.014),
            rot_euler=(0.0, -side * 0.16, 0.0),
            bevel_width=0.003, channel="accent", skin_zone="torso", part_tag="epaulette",
        )
        # 프린지 금술 끝단 5가닥 (팔 관절 상단 18mm 위로 클리어)
        for fi in range(5):
            yf = -0.022 + fi * 0.011
            p0 = np.array([x_out, yf, z_sh - 0.006])
            p1 = np.array([x_out + side * 0.018, yf, z_sh - 0.024])
            gb.add_swept_tube(np.stack([p0, p1]), 0.0032, n_prof=6, channel="accent", skin_zone="torso", part_tag="epaulette_fringe")

    # 5) 더블 브레스트 10개 금단추 + 황금 에귈레트 장식줄(가슴 2겹 현수선!) + 허리 벨트
    for s_th in (+0.28, -0.28):
        _add_button_row(gb, np.linspace(p.z_waist - 0.01, p.z_chest + 0.04, 5).tolist(), s_th, ease=ease + 0.0055, radius=0.009, thickness=0.0045, channel="accent")

    for loop_drop in (0.045, 0.088):
        pts_cord = []
        for ci in range(10):
            t = ci / 9.0
            th = -0.82 * (1.0 - t) + 0.26 * t
            z_c = (p.z_shoulder + 0.01) * (1.0 - t) + (p.z_chest + 0.02) * t - loop_drop * math.sin(t * math.pi)
            cp, _ = _surface_point_front(ctx, z_c, th, ease + 0.010 + 0.005 * math.sin(t * math.pi))
            pts_cord.append(cp)
        gb.add_swept_tube(np.stack(pts_cord), 0.0032, n_prof=6, channel="accent", skin_zone="torso", part_tag="aiguillette")

    # 허리 제복 새시 벨트 + 금장 버클
    z_bt = np.linspace(p.z_waist - 0.024, p.z_waist + 0.024, 4)
    bt_in, bt_c = gc.build_torso_grid(ctx, z_bt, 34, lambda z, th: ease + 0.005, closed_u=True)
    bt_out = gc.offset_grid_radial(bt_in, bt_c, 0.0055)
    gb.add_thick_shell(bt_out, bt_in, closed_u=True, channel="trim", skin_zone="torso", bevel_rim=True, part_tag="belt")
    bp, bd = _surface_point_front(ctx, p.z_waist, 0.0, ease + 0.012)
    gb.add_beveled_box(bp + bd * 0.003, (0.056, 0.009, 0.052), bevel_width=0.0022, channel="accent", skin_zone="torso", part_tag="buckle")
    return gb


def build_noble_cape(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_top = p.z_neck_base + 0.010
    z_hem = p.z_knee - 0.06

    # 1) 등 뒤로 흐르는 9-웨이브 귀족 롱 케이프 (어깨 관절 뒤쪽 theta in [0.64*pi, 1.36*pi] → -45°~+85° 팔 가동 100% 자유!)
    n_z, n_seg = 16, 30
    z_stops = np.linspace(z_hem, z_top, n_z)
    thetas = np.linspace(0.64 * math.pi, 1.36 * math.pi, n_seg)
    in_g = np.empty((n_z, n_seg, 3), dtype=np.float64)
    centers = np.zeros((n_z, 3), dtype=np.float64)
    for i, z in enumerate(z_stops):
        zf = float(z)
        t_down = (z_top - zf) / max(z_top - z_hem, 1e-4)  # 0=어깨, 1=자락 끝
        yc = ctx._torso_y_center(zf)  # noqa: SLF001
        centers[i] = (0.0, yc, zf)
        for j, th in enumerate(thetas):
            _, _, r_b = ctx.sample_torso_radius(max(p.z_crotch, zf), float(th))
            # 아래로 갈수록 뒤로 크게 퍼지며 9개 드레이프 주름 생성 (등 뒤 +Y 여유 확보로 85° 팔 거상 비간섭)
            base_r = max(r_b + 0.028, p.spec.shoulder_half_w * 0.88 + 0.28 * (t_down ** 1.05))
            wave = 0.022 * (t_down ** 1.2) * math.sin((j / (n_seg - 1)) * math.pi * 9.0)
            rr = base_r + wave
            in_g[i, j] = (rr * math.sin(th), yc - rr * math.cos(th) + 0.036 + 0.052 * t_down, zf)

    out_g = gc.offset_grid_radial(in_g, centers, 0.0040)
    gb.add_thick_shell(out_g, in_g, closed_u=False, channel="main", skin_zone="cape", bevel_rim=True, part_tag="cape")

    # 2) 퍼/벨벳 숄더 칼라 요크 + 자락 금사 보더 (trim)
    gb.add_swept_tube(out_g[-1] + np.array([0.0, 0.0, 0.008]), 0.015, n_prof=10, channel="trim", skin_zone="cape", part_tag="fur_collar")
    gb.add_swept_tube(out_g[0], 0.0050, n_prof=6, channel="trim", skin_zone="cape", part_tag="cape_border")
    gb.add_swept_tube(out_g[:, 0], 0.0042, n_prof=6, channel="trim", skin_zone="cape", part_tag="cape_border")
    gb.add_swept_tube(out_g[:, -1], 0.0042, n_prof=6, channel="trim", skin_zone="cape", part_tag="cape_border")

    # 3) 좌/우 쇄골 원형 문장 클래스프 + 황금 현수선 체인 (accent)
    clasp_l, dl = _surface_point_front(ctx, p.z_neck_base - 0.022, +0.44, 0.018)
    clasp_r, dr = _surface_point_front(ctx, p.z_neck_base - 0.022, -0.44, 0.018)
    gb.add_beveled_cylinder(clasp_l, clasp_l + dl * 0.007, 0.015, segs=12, channel="accent", skin_zone="torso", part_tag="clasp")
    gb.add_beveled_cylinder(clasp_r, clasp_r + dr * 0.007, 0.015, segs=12, channel="accent", skin_zone="torso", part_tag="clasp")
    chain_pts = []
    for ci in range(11):
        t = ci / 10.0
        th = 0.44 * (1.0 - t) + (-0.44) * t
        zc = (p.z_neck_base - 0.022) - 0.032 * math.sin(t * math.pi)
        cp, _ = _surface_point_front(ctx, zc, th, 0.022 + 0.004 * math.sin(t * math.pi))
        chain_pts.append(cp)
    gb.add_swept_tube(np.stack(chain_pts), 0.0030, n_prof=6, channel="accent", skin_zone="torso", part_tag="cape_chain")
    return gb


def build_lace_up_boots(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    gc.add_sculpted_footwear(
        gb, shaft_height=p.z_ankle + (p.z_knee - p.z_ankle) * 0.48,
        sole_thick=0.012, heel_height=0.034, lace_rows=7, top_cuff_band=True,
        channel_upper="main", channel_sole="sole", channel_lace="lace",
    )
    return gb


def build_rofan_tiara(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    s = p.spec
    y_hc = 0.008
    z_band = p.z_crown - p.head_h * 0.14
    rx = s.head_w * 0.94
    ry = s.head_d * 0.94

    # 1) 왕관 베이스 아치 밴드 + 상단 고딕 물결 필리그리 아치 (gold main)
    n_arc = 21
    angs = np.linspace(-0.62 * math.pi, +0.62 * math.pi, n_arc)
    base_pts = np.empty((n_arc, 3), dtype=np.float64)
    crest_pts = np.empty((n_arc, 3), dtype=np.float64)
    for i, a in enumerate(angs):
        x = rx * math.sin(a)
        y = y_hc - ry * math.cos(a)
        base_pts[i] = (x, y, z_band)
        # 중앙 플뢰르드리스 첨탑 + 좌우 2단 피크
        c_peak = math.exp(-((a / 0.24) ** 2)) * 0.044
        s_peak = math.exp(-(((abs(a) - 0.58) / 0.22) ** 2)) * 0.026
        t_peak = math.exp(-(((abs(a) - 1.05) / 0.22) ** 2)) * 0.014
        crest_pts[i] = (x * 1.03, y - 0.003 * math.cos(a), z_band + 0.008 + c_peak + s_peak + t_peak)

    gb.add_swept_tube(base_pts, 0.0036, n_prof=8, channel="main", skin_zone="head", rigid=True, part_tag="tiara_band")
    gb.add_swept_tube(crest_pts, 0.0030, n_prof=8, channel="main", skin_zone="head", rigid=True, part_tag="tiara_crest")

    # 수직 필리그리 기둥 7개 + 중앙/측면 보석 (accent)
    for idx_p in (2, 5, 8, 10, 12, 15, 18):
        gb.add_swept_tube(np.stack([base_pts[idx_p], crest_pts[idx_p]]), 0.0024, n_prof=6, channel="main", skin_zone="head", rigid=True, part_tag="tiara_strut")
        is_center = idx_p == 10
        g_rad = (0.0068, 0.0052, 0.0105) if is_center else (0.0042, 0.0038, 0.0058)
        gb.add_gem_or_bead(crest_pts[idx_p] + np.array([0.0, -0.0025, 0.003]), g_rad, segs=3, channel="accent", skin_zone="head", rigid=True, part_tag="tiara_gem")
    return gb


# ===========================================================================
# 5. 액션 테크웨어 · 헌터 (Action Techwear & Hunter — 5종)
# ===========================================================================


def build_tactical_compression(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_bot = p.z_hips - 0.020
    z_top = p.z_neck_base + 0.032  # 목터틀 하이넥 컴프레션!
    z_stops = np.linspace(z_bot, z_top, 16)

    in_g, c_g = gc.build_torso_grid(ctx, z_stops, 32, lambda z, th: 0.0028 + 0.0010 * gc.smoothstep_f(p.z_waist, p.z_chest, z), closed_u=True)
    out_g = gc.offset_grid_radial(in_g, c_g, 0.0022)
    gb.add_thick_shell(out_g, in_g, closed_u=True, channel="main", skin_zone="torso", bevel_rim=True, part_tag="torso")

    # 롱 컴프레션 슬리브 + 강화 팔꿈치/손목 밴드
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.78, x_end_frac=0.95,
        ease_fn=lambda ta, ph: 0.0036,
        thickness=0.0022, channel="main", cuff_channel="trim", cuff_len=0.048, cuff_step=0.0018,
    )
    # 하이넥 보강 칼라 밴드 + 흉부 전술 발광 셰브론 바
    z_nk = np.linspace(p.z_neck_base - 0.004, z_top + 0.002, 4)
    nk_in, nk_c = gc.build_torso_grid(ctx, z_nk, 28, lambda z, th: 0.0052, closed_u=True)
    nk_out = gc.offset_grid_radial(nk_in, nk_c, 0.0028)
    gb.add_thick_shell(nk_out, nk_in, closed_u=True, channel="trim", skin_zone="torso", bevel_rim=True, part_tag="collar")

    # 흉부 택티컬 아머 리브 & 사이버 액센트 바
    p_l, _ = _surface_point_front(ctx, p.z_chest + 0.035, +0.36, 0.0072)
    p_m, _ = _surface_point_front(ctx, p.z_chest + 0.012, 0.0, 0.0080)
    p_r, _ = _surface_point_front(ctx, p.z_chest + 0.035, -0.36, 0.0072)
    gb.add_swept_tube(np.stack([p_l, p_m, p_r]), 0.0034, n_prof=6, channel="accent", skin_zone="torso", part_tag="tech_chevron")
    return gb


def build_techwear_jacket(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_hem = p.z_hips + 0.005  # 크롭 테크웨어 실루엣
    z_neck = p.z_neck_base + 0.010
    ease = 0.0145

    # 1) 크롭 비대칭 방풍 셸 재킷 본체
    _add_open_jacket_body(
        gb, z_hem=z_hem, z_neck=z_neck, z_v_join=p.z_neck_base - 0.035,
        base_ease=ease, waist_cinch=0.0, shoulder_pad=0.014,
        thickness=0.0040, v_open_top_rad=0.22, front_gap_bottom_rad=0.03,
        channel="main", trim_piping_channel="trim",
    )

    # 2) 하이 스톰 펀넬 칼라 (테크웨어 시그니처!)
    gc.add_stand_or_folded_collar(
        gb, z_base=z_neck - 0.006, stand_h=0.068, fold_drop=0.0, flare_out=0.022,
        ease=ease + 0.004, thickness=0.0042, front_gap_rad=0.14,
        channel="main", trim_edge_channel="accent", folded=False,
    )

    # 3) 관절 여유 넉넉한 테크 슬리브 + 벨크로 커프스 탭 + 좌측 팔 유틸리티 포켓
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.75, x_end_frac=0.91,
        ease_fn=lambda ta, ph: 0.0165 + 0.0065 * math.sin(ta * math.pi),
        thickness=0.0038, channel="main", cuff_channel="trim", cuff_len=0.036, cuff_step=0.0034,
    )
    x_bic = abs(float(ctx.joint_b(f"{bb2.MIXAMO}LeftArm")[0])) + 0.11
    b_ring = ctx.sample_arm_ring(+1, x_bic, 12, 0.028)
    # 상완 전면-외측에 밀착하는 슬림 유틸리티 포켓 (팔 위 돌출 제거 + >= 10mm 여유!)
    gb.add_beveled_box(b_ring[1] + np.array([0.0, -0.006, 0.004]), (0.068, 0.014, 0.044), rot_euler=(0.45, 0.0, 0.0), bevel_width=0.0022, channel="trim", skin_zone="arm.L", rigid=False, part_tag="sleeve_pocket")

    # 4) 가슴 대각 방수 지퍼 포켓 2개 + 양옆 힙에서 수직 드리운 전술 웨빙 스트랩 + 메탈 D링
    for s_th in (+0.45, -0.45):
        _add_welt_or_patch_pocket(gb, p.z_chest + 0.018, s_th, ease=ease + 0.0055, half_angle=0.18, half_h=0.040, depth=0.0075, with_flap=True, channel="trim", flap_channel="trim", button_channel="accent")
    for s_th in (+1.05, -1.05):
        anchor_top, d_out = _surface_point_front(ctx, z_hem + 0.018, s_th, ease + 0.012)
        s_pts = [
            anchor_top,
            anchor_top + d_out * 0.006 + np.array([0.0, 0.0, -0.065]),
            anchor_top + d_out * 0.012 + np.array([0.0, 0.0, -0.125]),
        ]
        gb.add_swept_tube(np.stack(s_pts), 0.0052, n_prof=6, channel="trim", skin_zone="torso", part_tag="hanging_strap")
        gb.add_beveled_box(anchor_top + d_out * 0.004, (0.020, 0.008, 0.022), rot_euler=(0.0, 0.0, s_th), bevel_width=0.0018, channel="accent", skin_zone="torso", part_tag="d_ring")
    return gb


def build_tactical_cargo(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    gc.add_trouser_legs_and_pelvis(
        gb, z_waist=p.z_waist + 0.006, z_hem=p.z_ankle + 0.012,
        waist_ease=0.0055, hip_ease=0.012, thigh_ease=0.022, calf_ease=0.012,
        thickness=0.0034, channel="main", waistband_channel="trim", waistband_h=0.044,
        belt_loops=True, belt_buckle_channel="trim",
    )
    # 1) 양쪽 대형 거셋 카고 포켓 + 허벅지 조임 스트랩
    z_pk = 0.52 * p.z_crotch + 0.48 * p.z_knee
    for side, lab in ((+1, "Left"), (-1, "Right")):
        ring = ctx.sample_leg_ring(side, z_pk, 16, 0.025)
        pt_out = ring[4] if side > 0 else ring[12]
        out_v = np.array([float(side), 0.0, 0.0])
        gb.add_beveled_box(pt_out + out_v * 0.010, (0.020, 0.095, 0.125), bevel_width=0.0035, channel="main", skin_zone=f"leg.{lab[0]}", rigid=False, part_tag="cargo_pocket")
        gb.add_beveled_box(pt_out + out_v * 0.016 + np.array([0.0, 0.0, 0.048]), (0.010, 0.102, 0.036), bevel_width=0.0022, channel="trim", skin_zone=f"leg.{lab[0]}", rigid=False, part_tag="pocket_flap")

        # 2) 관절 분리 곡면 무릎 아머 패드 (무릎 전면 곡면을 감싸는 폐곡면 패드 → 관통 0 + 10mm 중첩!)
        kp_grid = np.empty((5, 7, 3), dtype=np.float64)
        for ki in range(5):
            zk = (p.z_knee - 0.056) + 0.112 * (ki / 4.0)
            k_ring = ctx.sample_leg_ring(side, zk, 24, 0.022)
            # 정면(-Y) 기준 좌우 -3..+3 인덱스 (약 ±45° 곡면)
            for kj, idx_r in enumerate((-3, -2, -1, 0, 1, 2, 3)):
                kp_grid[ki, kj] = k_ring[idx_r % 24]
        gb.add_offset_panel(kp_grid, 0.0085, outward_dir=np.array([0.0, -1.0, 0.0]), channel="trim", skin_zone=f"leg.{lab[0]}", part_tag="knee_pad")
        # 무릎 뒤 고정 스트랩
        k_ring_mid = ctx.sample_leg_ring(side, p.z_knee, 20, 0.020)
        gb.add_swept_tube(k_ring_mid, 0.0045, n_prof=6, closed_curve=True, channel="trim", skin_zone=f"leg.{lab[0]}", part_tag="knee_strap")
    return gb


def build_combat_boots(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    gc.add_sculpted_footwear(
        gb, shaft_height=p.z_ankle + (p.z_knee - p.z_ankle) * 0.45,
        sole_thick=0.022, heel_height=0.034, lugged_sole=True,
        lace_rows=6, ankle_buckle=True,
        channel_upper="main", channel_sole="sole", channel_lace="lace",
    )
    return gb


def build_chest_harness(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    ease = 0.028  # techwear-jacket(18.5mm) 위 깔끔 레이어링!

    # 1) 전면 MOLLE 중앙 흉부 파우치 + 좌우 탄창/포션 파우치 2개
    c_pt, c_d = _surface_point_front(ctx, p.z_chest - 0.015, 0.0, ease)
    gb.add_beveled_box(c_pt + c_d * 0.014, (0.145, 0.028, 0.115), bevel_width=0.004, channel="main", skin_zone="torso", part_tag="chest_rig")
    # 발광 헌터 상태 코어 바 (accent)
    gb.add_beveled_box(c_pt + c_d * 0.030 + np.array([0.0, 0.0, 0.025]), (0.085, 0.008, 0.014), bevel_width=0.002, channel="accent", skin_zone="torso", part_tag="status_bar")

    for side in (+1.0, -1.0):
        pp, pd = _surface_point_front(ctx, p.z_chest - 0.025, side * 0.56, ease + 0.002)
        gb.add_beveled_box(pp + pd * 0.014, (0.056, 0.026, 0.095), rot_euler=(0.0, 0.0, side * 0.52), bevel_width=0.0035, channel="main", skin_zone="torso", part_tag="side_pouch")
        gb.add_beveled_box(pp + pd * 0.027 + np.array([0.0, 0.0, 0.022]), (0.024, 0.008, 0.022), rot_euler=(0.0, 0.0, side * 0.52), bevel_width=0.0018, channel="accent", skin_zone="torso", part_tag="cobra_buckle")

        # 2) 좌/우 어깨 웨빙 스트랩 (앞 가슴 → 어깨 위 → 등 X-교차!)
        strap_pts = [
            _surface_point_front(ctx, p.z_chest + 0.035, side * 0.36, ease + 0.003)[0],
            _surface_point_front(ctx, p.z_shoulder + 0.015, side * 0.55, ease + 0.006)[0],
            np.array([side * (p.spec.neck_rx + 0.048), 0.006, p.z_neck_base + 0.002 + ease]),
            _surface_point_front(ctx, p.z_shoulder + 0.010, math.pi - side * 0.52, ease + 0.008)[0],
            _surface_point_front(ctx, p.z_waist + 0.04, math.pi + side * 0.28, ease + 0.008)[0],
        ]
        gb.add_swept_tube(np.stack(strap_pts), 0.011, n_prof=6, channel="main", skin_zone="torso", part_tag="shoulder_strap")
        # 쇄골 퀵릴리즈 코브라 버클
        gb.add_beveled_box(strap_pts[1] + np.array([0.0, -0.008, 0.0]), (0.028, 0.012, 0.034), bevel_width=0.002, channel="accent", skin_zone="torso", part_tag="cobra_buckle")

    # 3) 흉곽 둘레 고정 벨트 스트랩
    rib_ring = ctx.sample_torso_ring(p.z_chest - 0.030, 32, ease + 0.003)
    gb.add_swept_tube(rib_ring, 0.0085, n_prof=6, closed_curve=True, channel="main", skin_zone="torso", part_tag="rib_strap")
    return gb


# ===========================================================================
# 6. 무협 · 동양 판타지 (Murim & Eastern Fantasy — 5종)
# ===========================================================================


def _add_y_cross_lapel(
    gb: gc.GarmentBuilder,
    *,
    z_neck: float,
    z_waist: float,
    ease: float,
    lapel_w: float = 0.036,
    thickness: float = 0.0034,
    channel: str = "trim",
    part_tag: str = "y_collar",
) -> None:
    """우임(좌측 옷깃이 우측 옷깃 위로 교차) 입체 Y자 무협 깃 (실제 3D 층 중첩!)."""
    ctx = gb.ctx
    m, n = 10, 4
    # 1) 아래쪽(오른쪽 어깨 → 왼쪽 허리) 먼저 깔고, 2) 위쪽(왼쪽 어깨 → 오른쪽 허리)을 +4.5mm 바깥에 중첩!
    for layer_idx, (s_start, s_end, extra_lift) in enumerate(((-1.0, +0.42, 0.0), (+1.0, -0.52, 0.0046))):
        grid = np.empty((m, n, 3), dtype=np.float64)
        for i in range(m):
            t = i / (m - 1)  # 0=목 뒤/옆, 1=반대쪽 허리 교차점
            z = z_neck * (1.0 - t) + z_waist * t
            th_c = (s_start * 0.56) * (1.0 - t) + (s_end * 0.56) * t
            for j in range(n):
                u = (j / (n - 1)) - 0.5
                th = th_c + u * (lapel_w / 0.14)
                pt, _ = _surface_point_front(ctx, z, th, ease + extra_lift)
                grid[i, j] = pt
        gb.add_offset_panel(grid, thickness, outward_dir=np.array([0.0, -1.0, 0.0]), channel=channel, skin_zone="torso", part_tag=f"{part_tag}_{layer_idx}")


def build_murim_dobok_inner(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_bot = p.z_hips - 0.025
    z_top = p.z_neck_base + 0.004
    z_stops = np.linspace(z_bot, z_top, 14)

    in_g, c_g = gc.build_torso_grid(ctx, z_stops, 32, lambda z, th: 0.0026 + 0.0014 * gc.smoothstep_f(p.z_waist, p.z_chest, z), closed_u=True, hang_slope=0.0)
    out_g = gc.offset_grid_radial(in_g, c_g, 0.0020)
    gb.add_thick_shell(out_g, in_g, closed_u=True, channel="main", skin_zone="torso", bevel_rim=True, part_tag="torso")

    # 테이퍼 무협 소매 + 손목 보호대(팔토시) 커프스
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.78, x_end_frac=0.92,
        ease_fn=lambda ta, ph: 0.0042 + 0.0020 * (1.0 - ta),
        thickness=0.0022, channel="main", cuff_channel="trim", cuff_len=0.075, cuff_step=0.0018,
    )
    # 우임 교차 Y자 흰 동정 깃 + 우측 흉곽 매듭 고름(accent)
    _add_y_cross_lapel(gb, z_neck=z_top, z_waist=p.z_waist, ease=0.0054, lapel_w=0.032, thickness=0.0026, channel="trim", part_tag="dongjeong")
    kp, kd = _surface_point_front(ctx, p.z_waist + 0.045, -0.45, 0.0085)
    gb.add_beveled_box(kp + kd * 0.003, (0.018, 0.009, 0.016), rot_euler=(0.0, 0.0, -0.42), bevel_width=0.0025, channel="accent", skin_zone="torso", part_tag="goreum_knot")
    for drop_dx in (-0.010, +0.012):
        pts = [
            kp + kd * 0.003,
            _surface_point_front(ctx, p.z_waist - 0.03, -0.45 + drop_dx * 3.0, 0.015)[0],
            _surface_point_front(ctx, p.z_waist - 0.11, -0.44 + drop_dx * 4.5, 0.017)[0],
        ]
        gb.add_swept_tube(np.stack(pts), 0.0030, n_prof=6, channel="accent", skin_zone="torso", part_tag="goreum")
    return gb


def build_murim_dopo_robe(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    z_hem = p.z_ankle + 0.09
    z_neck = p.z_neck_base + 0.008
    ease = 0.0155

    # 1) 4분할 자락 롱 무협 도포 본체 (앞트임·옆트임 분할로 발차기/고굴곡 비관통!)
    _add_open_jacket_body(
        gb, z_hem=z_hem, z_neck=z_neck, z_v_join=p.z_waist + 0.01,
        base_ease=ease, waist_cinch=0.004, shoulder_pad=0.012,
        flare_below_z=p.z_hips, flare_rate=0.20, thickness=0.0038,
        v_open_top_rad=0.52, front_gap_bottom_rad=0.08,
        channel="main", trim_piping_channel="trim", split_lower_panels=True,
    )

    # 2) 무협 시그니처 넓은 광수(廣袖) 소매 + 비단 브로케이드 소매단 트림
    gc.add_tailored_sleeves(
        gb, x_start_frac=0.72, x_end_frac=0.90,
        ease_fn=lambda ta, ph: 0.016 + 0.018 * (ta ** 1.2),
        thickness=0.0035, n_rings=14, n_seg=22,
        channel="main", cuff_channel="trim", cuff_len=0.044, cuff_step=0.0032,
        wide_hang_fn=lambda ta: 0.145 * (ta ** 1.35),  # 아래팔로 갈수록 우아하게 14.5cm 처지는 무협 광수!
    )

    # 3) 깊은 Y자 교차 외깃 (금사/비단 브로케이드 트림) + 어깨 구름문양 클립 (accent)
    _add_y_cross_lapel(gb, z_neck=z_neck, z_waist=p.z_waist - 0.015, ease=ease + 0.0055, lapel_w=0.048, thickness=0.0038, channel="trim", part_tag="dopo_lapel")
    for side in (+1.0, -1.0):
        mp, md = _surface_point_front(ctx, p.z_chest + 0.065, side * 0.56, ease + 0.008)
        gb.add_beveled_cylinder(mp, mp + md * 0.0045, 0.012, segs=12, channel="accent", skin_zone="torso", part_tag="cloud_clasp")
    return gb


def build_murim_wide_pants(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    # 허벅지는 넉넉하고 종아리 하단에서 각반으로 조여드는 전통 무협 바지!
    gc.add_trouser_legs_and_pelvis(
        gb, z_waist=p.z_waist + 0.005, z_hem=p.z_ankle + 0.015,
        waist_ease=0.006, hip_ease=0.018, thigh_ease=0.036, calf_ease=0.014,
        thickness=0.0032, channel="main", waistband_channel="trim", waistband_h=0.045,
        belt_loops=False, baggy_gather_ankle=True,
    )
    # 종아리 하단 X자 각반/행전 랩 (trim)
    for side, lab in ((+1, "Left"), (-1, "Right")):
        for wi in range(4):
            zw = p.z_ankle + 0.045 + wi * 0.036
            ring = ctx.sample_leg_ring(side, zw, 20, 0.012 + 0.001 * (wi % 2), clamp_midline=True)
            gb.add_swept_tube(ring, 0.0045, n_prof=6, closed_curve=True, channel="trim", skin_zone=f"leg.{lab[0]}", part_tag="shin_wrap")
    return gb


def build_waist_sash(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    ease = 0.029  # murim-dopo-robe 위를 단단히 동여매는 광대 허리띠!

    # 1) 9.5cm 폭 광대 비단 허리띠 (주름 3단)
    z_wb = np.linspace(p.z_waist - 0.048, p.z_waist + 0.046, 6)
    in_g, c_g = gc.build_torso_grid(
        ctx, z_wb, 36,
        lambda z, th: ease + 0.0025 * math.sin((z - p.z_waist) * 140.0),
        closed_u=True,
    )
    out_g = gc.offset_grid_radial(in_g, c_g, 0.0058)
    gb.add_thick_shell(out_g, in_g, closed_u=True, channel="main", skin_zone="waist_sash", bevel_rim=True, part_tag="sash")

    # 2) 좌전방으로 길게 드리운 비단 허리끈 2가닥
    for dx_th, len_m in ((+0.34, 0.42), (+0.48, 0.34)):
        t_grid = np.empty((10, 4, 3), dtype=np.float64)
        for i in range(10):
            t = i / 9.0
            z = (p.z_waist - 0.03) - t * len_m
            yc = ctx._torso_y_center(max(p.z_crotch, z))  # noqa: SLF001
            _, _, r_hip = ctx.sample_torso_radius(p.z_hips, dx_th)
            r_cur = r_hip + ease + 0.010 + 0.048 * (t ** 1.15)
            th_c = dx_th + 0.08 * math.sin(t * math.pi)
            for j in range(4):
                u = (j / 3.0) - 0.5
                th = th_c + u * 0.16
                t_grid[i, j] = (r_cur * math.sin(th), yc - r_cur * math.cos(th), z)
        gb.add_offset_panel(t_grid, 0.0036, outward_dir=np.array([0.4, -0.9, 0.0]), channel="main", skin_zone="skirt", part_tag="sash_tail")

    # 3) 조각 원형 옥패(玉佩) + 황금 매듭 + 노리개 술(accent)
    jp, jd = _surface_point_front(ctx, p.z_waist - 0.088, +0.20, ease + 0.022)
    gb.add_beveled_cylinder(jp, jp + jd * 0.0085, 0.026, segs=16, channel="accent", skin_zone="waist_sash", part_tag="jade_pendant")
    # 중앙 구멍 장식 금링 + 상단 연결끈 + 하단 노리개 술
    gb.add_beveled_cylinder(jp + jd * 0.007, jp + jd * 0.011, 0.009, segs=10, channel="main", skin_zone="waist_sash", part_tag="jade_center")
    gb.add_swept_tube(np.stack([jp + np.array([0.0, 0.0, 0.055]), jp + np.array([0.0, 0.0, 0.022])]), 0.0032, n_prof=6, channel="accent", skin_zone="waist_sash", part_tag="jade_cord")
    gb.add_beveled_cylinder(jp + np.array([0.0, 0.0, -0.026]), jp + np.array([0.0, 0.0, -0.105]), 0.006, 0.013, segs=10, channel="accent", skin_zone="waist_sash", part_tag="tassel")
    return gb


def build_murim_boots(ctx: gc.BaseBodyContext) -> gc.GarmentBuilder:
    gb = gc.GarmentBuilder(ctx)
    p = ctx.plan
    gc.add_sculpted_footwear(
        gb, shaft_height=p.z_ankle + (p.z_knee - p.z_ankle) * 0.40,
        sole_thick=0.018, heel_height=0.020, toe_upturn=0.016, top_cuff_band=True,
        channel_upper="main", channel_sole="sole", channel_lace="lace",
    )
    return gb


# ===========================================================================
# 6대 장르 34종 의상 카탈로그 명세 (blender-3d-plan.md 3.5절 A 1:1 완전 정합)
# ===========================================================================


@dataclass(frozen=True)
class GarmentSpec:
    preset_id: str
    genre: str
    genre_ko: str
    slot: str  # top | bottom | shoes | accessory
    layer: str | None  # None | inner | outer | legwear
    default_base: str
    builder: Callable[[gc.BaseBodyContext], gc.GarmentBuilder]
    channels: list[gc.ChannelMaterialSpec]
    hides: list[str]
    shapes: list[str]
    min_clearance_mm: float
    underlayer_preset: str | None = None
    is_shoes: bool = False
    check_85_shoulder: bool = True


def _mat(ch_key: str, role: str, suffix: str | None, slug: str, v2_ch: str, hex_col: str, fabric: str, metallic: float = 0.0, roughness: float = 0.80) -> gc.ChannelMaterialSpec:
    name = f"ts_{role}_{suffix}_{slug}" if suffix else f"ts_{role}_{slug}"
    return gc.ChannelMaterialSpec(ch_key, name, v2_ch, hex_col, fabric, metallic, roughness)


GARMENT_CATALOG: list[GarmentSpec] = [
    # ---------- 1. 한국 학원 교복 (6종) ----------
    GarmentSpec(
        "top/school-shirt-tie", "korean-academy", "한국 학원 교복", "top", None, "female-romance",
        build_school_shirt_tie,
        [
            _mat("main", "top", None, "school-shirt-tie", "top", "#F5F4F0", "cotton_poplin", 0.0, 0.78),
            _mat("trim", "top", "trim", "school-shirt-tie", "top-trim", "#D9DFEB", "cotton_poplin", 0.0, 0.76),
            _mat("accent", "top", "accent", "school-shirt-tie", "top-accent", "#8B1E32", "silk_brocade", 0.0, 0.48),
        ],
        ["torso", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["hem-length", "collar-open"],
        min_clearance_mm=1.8,
    ),
    GarmentSpec(
        "outer/school-blazer", "korean-academy", "한국 학원 교복", "top", "outer", "female-romance",
        build_school_blazer,
        [
            _mat("main", "outer", None, "school-blazer", "outer", "#1E2A44", "wool_twill", 0.0, 0.82),
            _mat("trim", "outer", "trim", "school-blazer", "outer-trim", "#EFE9DC", "cotton_poplin", 0.0, 0.76),
            _mat("accent", "outer", "accent", "school-blazer", "outer-accent", "#D9B252", "leather_metal", 1.0, 0.28),
        ],
        ["torso", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["blazer-open", "hem-length"],
        min_clearance_mm=5.0, underlayer_preset="top/school-shirt-tie",
    ),
    GarmentSpec(
        "bottom/pleated-skirt", "korean-academy", "한국 학원 교복", "bottom", None, "female-romance",
        build_pleated_skirt,
        [
            _mat("main", "bottom", None, "pleated-skirt", "bottom", "#3E4A68", "tartan_pleat", 0.0, 0.80),
            _mat("trim", "bottom", "trim", "pleated-skirt", "bottom-trim", "#232C42", "wool_twill", 0.0, 0.82),
        ],
        ["pelvis"],
        ["skirt-length", "pleat-flare"],
        min_clearance_mm=2.0, check_85_shoulder=False,
    ),
    GarmentSpec(
        "bottom/school-slacks", "korean-academy", "한국 학원 교복", "bottom", None, "female-romance",
        build_school_slacks,
        [
            _mat("main", "bottom", None, "school-slacks", "bottom", "#3A4254", "wool_twill", 0.0, 0.84),
            _mat("trim", "bottom", "trim", "school-slacks", "bottom-trim", "#222630", "leather_metal", 0.0, 0.50),
        ],
        ["pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R"],
        ["hem-length", "leg-width"],
        min_clearance_mm=2.0, check_85_shoulder=False,
    ),
    GarmentSpec(
        "legwear/knee-socks", "korean-academy", "한국 학원 교복", "bottom", "legwear", "female-romance",
        build_knee_socks,
        [
            _mat("main", "legwear", None, "knee-socks", "legwear", "#202430", "denim_knit", 0.0, 0.88),
        ],
        ["calf.L", "calf.R"],
        ["sock-height"],
        min_clearance_mm=1.6, check_85_shoulder=False,
    ),
    GarmentSpec(
        "shoes/loafers", "korean-academy", "한국 학원 교복", "shoes", None, "female-romance",
        build_loafers,
        [
            _mat("main", "shoes", None, "loafers", "shoes", "#3B241D", "leather_metal", 0.0, 0.42),
            _mat("sole", "shoes", "sole", "loafers", "shoes-sole", "#1E1918", "leather_metal", 0.0, 0.62),
            _mat("lace", "shoes", "lace", "loafers", "shoes-lace", "#CFA854", "leather_metal", 1.0, 0.28),
        ],
        ["foot.L", "foot.R"],
        ["heel-height"],
        min_clearance_mm=1.5, is_shoes=True, check_85_shoulder=False,
    ),

    # ---------- 2. 현대 일상 캐주얼 (6종) ----------
    GarmentSpec(
        "top/ribbed-tee", "modern-casual", "현대 일상 캐주얼", "top", None, "youth-academy",
        build_ribbed_tee,
        [
            _mat("main", "top", None, "ribbed-tee", "top", "#F0EDE6", "denim_knit", 0.0, 0.84),
            _mat("trim", "top", "trim", "ribbed-tee", "top-trim", "#D4D0C8", "denim_knit", 0.0, 0.86),
            _mat("accent", "top", "accent", "ribbed-tee", "top-accent", "#2C5949", "cotton_poplin", 0.0, 0.78),
        ],
        ["torso", "upperArm.L", "upperArm.R"],
        ["hem-length", "sleeve-roll"],
        min_clearance_mm=1.8,
    ),
    GarmentSpec(
        "top/oversized-hoodie", "modern-casual", "현대 일상 캐주얼", "top", None, "youth-academy",
        build_oversized_hoodie,
        [
            _mat("main", "top", None, "oversized-hoodie", "top", "#5C7468", "denim_knit", 0.0, 0.88),
            _mat("trim", "top", "trim", "oversized-hoodie", "top-trim", "#E8E3D8", "denim_knit", 0.0, 0.86),
            _mat("accent", "top", "accent", "oversized-hoodie", "top-accent", "#C79646", "leather_metal", 1.0, 0.30),
        ],
        ["torso", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["hem-length", "sleeve-roll"],
        min_clearance_mm=2.5,
    ),
    GarmentSpec(
        "top/knit-cardigan", "modern-casual", "현대 일상 캐주얼", "top", "outer", "youth-academy",
        build_knit_cardigan,
        [
            _mat("main", "outer", None, "knit-cardigan", "outer", "#C8B8A2", "denim_knit", 0.0, 0.90),
            _mat("trim", "outer", "trim", "knit-cardigan", "outer-trim", "#9E8B74", "denim_knit", 0.0, 0.90),
            _mat("accent", "outer", "accent", "knit-cardigan", "outer-accent", "#4A3122", "leather_metal", 0.0, 0.45),
        ],
        ["torso", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["hem-length", "sleeve-roll"],
        min_clearance_mm=5.0, underlayer_preset="top/ribbed-tee",
    ),
    GarmentSpec(
        "bottom/wide-denim", "modern-casual", "현대 일상 캐주얼", "bottom", None, "youth-academy",
        build_wide_denim,
        [
            _mat("main", "bottom", None, "wide-denim", "bottom", "#3E5879", "denim_knit", 0.0, 0.86),
            _mat("trim", "bottom", "trim", "wide-denim", "bottom-trim", "#C89D66", "cotton_poplin", 0.0, 0.78),
        ],
        ["pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R"],
        ["hem-length", "leg-width"],
        min_clearance_mm=2.2, check_85_shoulder=False,
    ),
    GarmentSpec(
        "bottom/cargo-shorts", "modern-casual", "현대 일상 캐주얼", "bottom", None, "youth-academy",
        build_cargo_shorts,
        [
            _mat("main", "bottom", None, "cargo-shorts", "bottom", "#6C6A58", "cotton_poplin", 0.0, 0.86),
            _mat("trim", "bottom", "trim", "cargo-shorts", "bottom-trim", "#3B3A32", "tech_ripstop", 0.0, 0.82),
        ],
        ["pelvis", "thigh.L", "thigh.R"],
        ["hem-length", "leg-width"],
        min_clearance_mm=2.2, check_85_shoulder=False,
    ),
    GarmentSpec(
        "shoes/sneakers", "modern-casual", "현대 일상 캐주얼", "shoes", None, "youth-academy",
        build_sneakers,
        [
            _mat("main", "shoes", None, "sneakers", "shoes", "#394B43", "tech_ripstop", 0.0, 0.78),
            _mat("sole", "shoes", "sole", "sneakers", "shoes-sole", "#F0ECE4", "leather_metal", 0.0, 0.68),
            _mat("lace", "shoes", "lace", "sneakers", "shoes-lace", "#FAF8F3", "cotton_poplin", 0.0, 0.84),
        ],
        ["foot.L", "foot.R"],
        ["sole-height"],
        min_clearance_mm=1.5, is_shoes=True, check_85_shoulder=False,
    ),

    # ---------- 3. 오피스 정장 수트 (6종) ----------
    GarmentSpec(
        "top/dress-shirt", "office-suit", "오피스 정장 수트", "top", None, "male-webtoon",
        build_dress_shirt,
        [
            _mat("main", "top", None, "dress-shirt", "top", "#F4F6FA", "cotton_poplin", 0.0, 0.76),
            _mat("trim", "top", "trim", "dress-shirt", "top-trim", "#D4DCE8", "leather_metal", 1.0, 0.28),
            _mat("accent", "top", "accent", "dress-shirt", "top-accent", "#2A3E63", "silk_brocade", 0.0, 0.45),
        ],
        ["torso", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["collar-open", "sleeve-roll"],
        min_clearance_mm=1.8,
    ),
    GarmentSpec(
        "outer/tailored-suit", "office-suit", "오피스 정장 수트", "top", "outer", "male-webtoon",
        build_tailored_suit,
        [
            _mat("main", "outer", None, "tailored-suit", "outer", "#262B36", "wool_twill", 0.0, 0.82),
            _mat("trim", "outer", "trim", "tailored-suit", "outer-trim", "#F3F1EC", "silk_brocade", 0.0, 0.48),
            _mat("accent", "outer", "accent", "tailored-suit", "outer-accent", "#181B22", "leather_metal", 0.0, 0.42),
        ],
        ["torso", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["blazer-open", "shoulder-pad"],
        min_clearance_mm=5.0, underlayer_preset="top/dress-shirt",
    ),
    GarmentSpec(
        "outer/trench-coat", "office-suit", "오피스 정장 수트", "top", "outer", "male-webtoon",
        build_trench_coat,
        [
            _mat("main", "outer", None, "trench-coat", "outer", "#B89E7A", "wool_twill", 0.0, 0.82),
            _mat("trim", "outer", "trim", "trench-coat", "outer-trim", "#947B5A", "wool_twill", 0.0, 0.82),
            _mat("accent", "outer", "accent", "trench-coat", "outer-accent", "#4D3624", "leather_metal", 0.0, 0.42),
        ],
        ["torso", "pelvis", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["coat-flare", "hem-length"],
        min_clearance_mm=5.5, underlayer_preset="top/dress-shirt",
    ),
    GarmentSpec(
        "bottom/tailored-slacks", "office-suit", "오피스 정장 수트", "bottom", None, "male-webtoon",
        build_tailored_slacks,
        [
            _mat("main", "bottom", None, "tailored-slacks", "bottom", "#262B36", "wool_twill", 0.0, 0.82),
            _mat("trim", "bottom", "trim", "tailored-slacks", "bottom-trim", "#2D221C", "leather_metal", 0.0, 0.44),
        ],
        ["pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R"],
        ["hem-length", "leg-width"],
        min_clearance_mm=2.0, check_85_shoulder=False,
    ),
    GarmentSpec(
        "bottom/pencil-skirt", "office-suit", "오피스 정장 수트", "bottom", None, "female-romance",
        build_pencil_skirt,
        [
            _mat("main", "bottom", None, "pencil-skirt", "bottom", "#2E3440", "wool_twill", 0.0, 0.82),
            _mat("trim", "bottom", "trim", "pencil-skirt", "bottom-trim", "#C9A55A", "leather_metal", 1.0, 0.30),
        ],
        ["pelvis", "thigh.L", "thigh.R"],
        ["skirt-length", "hip-ease"],
        min_clearance_mm=2.0, check_85_shoulder=False,
    ),
    GarmentSpec(
        "shoes/derby-heels", "office-suit", "오피스 정장 수트", "shoes", None, "male-webtoon",
        build_derby_heels,
        [
            _mat("main", "shoes", None, "derby-heels", "shoes", "#1E1B1A", "leather_metal", 0.0, 0.38),
            _mat("sole", "shoes", "sole", "derby-heels", "shoes-sole", "#2E241E", "leather_metal", 0.0, 0.56),
            _mat("lace", "shoes", "lace", "derby-heels", "shoes-lace", "#151312", "cotton_poplin", 0.0, 0.78),
        ],
        ["foot.L", "foot.R"],
        ["heel-height"],
        min_clearance_mm=1.5, is_shoes=True, check_85_shoulder=False,
    ),

    # ---------- 4. 로판 드레스 · 제국 제복 (6종) ----------
    GarmentSpec(
        "top/rofan-corset-bodice", "rofan-imperial", "로판 드레스 · 제국 제복", "top", None, "female-romance",
        build_rofan_corset_bodice,
        [
            _mat("main", "top", None, "rofan-corset-bodice", "top", "#7A203A", "silk_brocade", 0.0, 0.48),
            _mat("trim", "top", "trim", "rofan-corset-bodice", "top-trim", "#F6EFE2", "silk_brocade", 0.0, 0.62),
            _mat("accent", "top", "accent", "rofan-corset-bodice", "top-accent", "#E0B956", "leather_metal", 1.0, 0.24),
        ],
        ["torso", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["puff-volume", "waist-cinch"],
        min_clearance_mm=2.0,
    ),
    GarmentSpec(
        "bottom/rofan-layered-skirt", "rofan-imperial", "로판 드레스 · 제국 제복", "bottom", None, "female-romance",
        build_rofan_layered_skirt,
        [
            _mat("main", "bottom", None, "rofan-layered-skirt", "bottom", "#882442", "silk_brocade", 0.0, 0.50),
            _mat("trim", "bottom", "trim", "rofan-layered-skirt", "bottom-trim", "#F5EDE0", "silk_brocade", 0.0, 0.64),
        ],
        ["pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R"],
        ["skirt-volume", "skirt-length"],
        min_clearance_mm=2.4, check_85_shoulder=False,
    ),
    GarmentSpec(
        "outer/imperial-uniform-coat", "rofan-imperial", "로판 드레스 · 제국 제복", "top", "outer", "male-webtoon",
        build_imperial_uniform_coat,
        [
            _mat("main", "outer", None, "imperial-uniform-coat", "outer", "#1B2133", "wool_twill", 0.0, 0.78),
            _mat("trim", "outer", "trim", "imperial-uniform-coat", "outer-trim", "#781B2C", "silk_brocade", 0.0, 0.54),
            _mat("accent", "outer", "accent", "imperial-uniform-coat", "outer-accent", "#E2BC56", "leather_metal", 1.0, 0.25),
        ],
        ["torso", "pelvis", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["coat-flare", "collar-up"],
        min_clearance_mm=5.5, underlayer_preset="top/dress-shirt",
    ),
    GarmentSpec(
        "outer/noble-cape", "rofan-imperial", "로판 드레스 · 제국 제복", "top", "outer", "female-romance",
        build_noble_cape,
        [
            _mat("main", "outer", None, "noble-cape", "outer", "#4D172B", "silk_brocade", 0.0, 0.56),
            _mat("trim", "outer", "trim", "noble-cape", "outer-trim", "#F2EAD8", "denim_knit", 0.0, 0.84),
            _mat("accent", "outer", "accent", "noble-cape", "outer-accent", "#E2BC56", "leather_metal", 1.0, 0.25),
        ],
        [],
        ["cape-billow", "hem-length"],
        min_clearance_mm=6.0, underlayer_preset="top/rofan-corset-bodice",
    ),
    GarmentSpec(
        "shoes/lace-up-boots", "rofan-imperial", "로판 드레스 · 제국 제복", "shoes", None, "female-romance",
        build_lace_up_boots,
        [
            _mat("main", "shoes", None, "lace-up-boots", "shoes", "#47252B", "leather_metal", 0.0, 0.44),
            _mat("sole", "shoes", "sole", "lace-up-boots", "shoes-sole", "#211618", "leather_metal", 0.0, 0.58),
            _mat("lace", "shoes", "lace", "lace-up-boots", "shoes-lace", "#DFB962", "leather_metal", 1.0, 0.30),
        ],
        ["foot.L", "foot.R"],
        ["heel-height"],
        min_clearance_mm=1.5, is_shoes=True, check_85_shoulder=False,
    ),
    GarmentSpec(
        "accessory/rofan-tiara", "rofan-imperial", "로판 드레스 · 제국 제복", "accessory", None, "female-romance",
        build_rofan_tiara,
        [
            _mat("main", "accessory", None, "rofan-tiara", "accessory", "#E5BF5B", "leather_metal", 1.0, 0.24),
            _mat("accent", "accessory", "accent", "rofan-tiara", "accessory-accent", "#C72A52", "silk_brocade", 0.0, 0.16),
        ],
        [],
        ["crown-height"],
        min_clearance_mm=1.5, check_85_shoulder=False,
    ),

    # ---------- 5. 액션 테크웨어 · 헌터 (5종) ----------
    GarmentSpec(
        "top/tactical-compression", "action-techwear", "액션 테크웨어 · 헌터", "top", None, "male-action",
        build_tactical_compression,
        [
            _mat("main", "top", None, "tactical-compression", "top", "#262B33", "tech_ripstop", 0.0, 0.72),
            _mat("trim", "top", "trim", "tactical-compression", "top-trim", "#1A1E24", "tech_ripstop", 0.0, 0.64),
            _mat("accent", "top", "accent", "tactical-compression", "top-accent", "#35C5D6", "leather_metal", 0.0, 0.28),
        ],
        ["torso", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["collar-up", "sleeve-roll"],
        min_clearance_mm=1.8,
    ),
    GarmentSpec(
        "outer/techwear-jacket", "action-techwear", "액션 테크웨어 · 헌터", "top", "outer", "male-action",
        build_techwear_jacket,
        [
            _mat("main", "outer", None, "techwear-jacket", "outer", "#2E353E", "tech_ripstop", 0.0, 0.76),
            _mat("trim", "outer", "trim", "techwear-jacket", "outer-trim", "#1B1F26", "tech_ripstop", 0.0, 0.70),
            _mat("accent", "outer", "accent", "techwear-jacket", "outer-accent", "#3AC8D8", "leather_metal", 1.0, 0.26),
        ],
        ["torso", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["collar-up", "hem-length"],
        min_clearance_mm=5.5, underlayer_preset="top/tactical-compression",
    ),
    GarmentSpec(
        "bottom/tactical-cargo", "action-techwear", "액션 테크웨어 · 헌터", "bottom", None, "male-action",
        build_tactical_cargo,
        [
            _mat("main", "bottom", None, "tactical-cargo", "bottom", "#2D3338", "tech_ripstop", 0.0, 0.82),
            _mat("trim", "bottom", "trim", "tactical-cargo", "bottom-trim", "#181B20", "leather_metal", 0.0, 0.46),
        ],
        ["pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R"],
        ["leg-width", "hem-length"],
        min_clearance_mm=2.2, check_85_shoulder=False,
    ),
    GarmentSpec(
        "shoes/combat-boots", "action-techwear", "액션 테크웨어 · 헌터", "shoes", None, "male-action",
        build_combat_boots,
        [
            _mat("main", "shoes", None, "combat-boots", "shoes", "#22252A", "leather_metal", 0.0, 0.48),
            _mat("sole", "shoes", "sole", "combat-boots", "shoes-sole", "#14161A", "leather_metal", 0.0, 0.68),
            _mat("lace", "shoes", "lace", "combat-boots", "shoes-lace", "#5A6572", "leather_metal", 1.0, 0.34),
        ],
        ["foot.L", "foot.R"],
        ["sole-height"],
        min_clearance_mm=1.5, is_shoes=True, check_85_shoulder=False,
    ),
    GarmentSpec(
        "accessory/chest-harness", "action-techwear", "액션 테크웨어 · 헌터", "accessory", None, "male-action",
        build_chest_harness,
        [
            _mat("main", "accessory", None, "chest-harness", "accessory", "#1C2026", "tech_ripstop", 0.0, 0.72),
            _mat("accent", "accessory", "accent", "chest-harness", "accessory-accent", "#35C5D6", "leather_metal", 1.0, 0.28),
        ],
        [],
        ["rig-tightness"],
        min_clearance_mm=6.0, underlayer_preset="outer/techwear-jacket",
    ),

    # ---------- 6. 무협 · 동양 판타지 (5종) ----------
    GarmentSpec(
        "top/murim-dobok-inner", "murim-fantasy", "무협 · 동양 판타지", "top", None, "male-webtoon",
        build_murim_dobok_inner,
        [
            _mat("main", "top", None, "murim-dobok-inner", "top", "#D9D6CE", "cotton_poplin", 0.0, 0.84),
            _mat("trim", "top", "trim", "murim-dobok-inner", "top-trim", "#FAF8F3", "silk_brocade", 0.0, 0.68),
            _mat("accent", "top", "accent", "murim-dobok-inner", "top-accent", "#2B564A", "silk_brocade", 0.0, 0.56),
        ],
        ["torso", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["collar-open", "sleeve-roll"],
        min_clearance_mm=2.0,
    ),
    GarmentSpec(
        "outer/murim-dopo-robe", "murim-fantasy", "무협 · 동양 판타지", "top", "outer", "male-webtoon",
        build_murim_dopo_robe,
        [
            _mat("main", "outer", None, "murim-dopo-robe", "outer", "#1E3738", "silk_brocade", 0.0, 0.62),
            _mat("trim", "outer", "trim", "murim-dopo-robe", "outer-trim", "#E8DEC8", "silk_brocade", 0.0, 0.54),
            _mat("accent", "outer", "accent", "murim-dopo-robe", "outer-accent", "#D8B35B", "leather_metal", 1.0, 0.26),
        ],
        ["torso", "pelvis", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R"],
        ["robe-flow", "hem-length"],
        min_clearance_mm=5.5, underlayer_preset="top/murim-dobok-inner",
    ),
    GarmentSpec(
        "bottom/murim-wide-pants", "murim-fantasy", "무협 · 동양 판타지", "bottom", None, "male-webtoon",
        build_murim_wide_pants,
        [
            _mat("main", "bottom", None, "murim-wide-pants", "bottom", "#242B30", "cotton_poplin", 0.0, 0.84),
            _mat("trim", "bottom", "trim", "murim-wide-pants", "bottom-trim", "#C9BFA9", "cotton_poplin", 0.0, 0.82),
        ],
        ["pelvis", "thigh.L", "thigh.R", "calf.L", "calf.R"],
        ["leg-width", "hem-length"],
        min_clearance_mm=2.4, check_85_shoulder=False,
    ),
    GarmentSpec(
        "accessory/waist-sash", "murim-fantasy", "무협 · 동양 판타지", "accessory", None, "male-webtoon",
        build_waist_sash,
        [
            _mat("main", "accessory", None, "waist-sash", "accessory", "#7D232A", "silk_brocade", 0.0, 0.52),
            _mat("accent", "accessory", "accent", "waist-sash", "accessory-accent", "#4AA384", "silk_brocade", 0.0, 0.26),
        ],
        [],
        ["sash-flow"],
        min_clearance_mm=6.0, underlayer_preset="outer/murim-dopo-robe", check_85_shoulder=False,
    ),
    GarmentSpec(
        "shoes/murim-boots", "murim-fantasy", "무협 · 동양 판타지", "shoes", None, "male-webtoon",
        build_murim_boots,
        [
            _mat("main", "shoes", None, "murim-boots", "shoes", "#1E2226", "cotton_poplin", 0.0, 0.78),
            _mat("sole", "shoes", "sole", "murim-boots", "shoes-sole", "#EAE4D8", "cotton_poplin", 0.0, 0.82),
            _mat("lace", "shoes", "lace", "murim-boots", "shoes-lace", "#D5B159", "silk_brocade", 0.0, 0.48),
        ],
        ["foot.L", "foot.R"],
        ["sole-height"],
        min_clearance_mm=1.5, is_shoes=True, check_85_shoulder=False,
    ),
]


# ===========================================================================
# 6대 장르 풀 착장 BLENDER_EEVEE 컨택트시트 + 85° 포즈 검증 시트 렌더러
# ===========================================================================

SIX_GENRE_ENSEMBLES: list[tuple[str, str, list[str], bool]] = [
    ("1_korean_academy", "female-romance", ["school-shirt-tie", "school-blazer", "pleated-skirt", "knee-socks", "loafers"], False),
    ("2_modern_casual", "youth-academy", ["oversized-hoodie", "wide-denim", "sneakers"], False),
    ("3_office_suit", "male-webtoon", ["dress-shirt", "tailored-suit", "tailored-slacks", "derby-heels"], False),
    ("4_rofan_imperial", "female-romance", ["rofan-corset-bodice", "rofan-layered-skirt", "noble-cape", "lace-up-boots", "rofan-tiara"], False),
    ("5_action_techwear", "male-action", ["tactical-compression", "techwear-jacket", "tactical-cargo", "combat-boots", "chest-harness"], False),
    ("6_murim_fantasy", "male-webtoon", ["murim-dobok-inner", "murim-dopo-robe", "murim-wide-pants", "waist-sash", "murim-boots"], False),
]

EXTRA_AND_POSE_ENSEMBLES: list[tuple[str, str, list[str], bool]] = [
    ("a_imperial_coat", "male-webtoon", ["dress-shirt", "imperial-uniform-coat", "tailored-slacks", "derby-heels"], False),
    ("b_trench_coat", "male-webtoon", ["dress-shirt", "trench-coat", "tailored-slacks", "derby-heels"], False),
    ("c_cardigan_shorts", "youth-academy", ["ribbed-tee", "knit-cardigan", "cargo-shorts", "sneakers"], False),
    ("d_pencil_skirt_slacks", "female-romance", ["school-shirt-tie", "pencil-skirt", "knee-socks", "loafers"], False),
    ("e_pose85_blazer", "female-romance", ["school-shirt-tie", "school-blazer", "pleated-skirt", "knee-socks", "loafers"], True),
    ("f_pose85_techwear", "male-action", ["tactical-compression", "techwear-jacket", "tactical-cargo", "combat-boots", "chest-harness"], True),
]


def _render_ensemble_tile(
    bases_dir: Path,
    garments_dir: Path,
    base_id: str,
    part_slugs: list[str],
    pose_85: bool,
    res: int,
    out_png: Path,
) -> np.ndarray:
    """베이스 + 다중 레이어 의상을 함께 임포트해 `BLENDER_EEVEE` 3/4 풀바디 타일을 렌더한다."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"

    # 1) 베이스 + 의상 GLB 임포트
    bpy.ops.import_scene.gltf(filepath=str(bases_dir / f"{base_id}.glb"))
    for slug in part_slugs:
        p = garments_dir / f"{slug}.glb"
        if p.is_file():
            bpy.ops.import_scene.gltf(filepath=str(p))

    # Blender 5.3 스무스 (use_auto_smooth 금지!)
    armatures = [o for o in scene.objects if o.type == "ARMATURE"]
    meshes = [o for o in scene.objects if o.type == "MESH" and not o.name.startswith("Icosphere")]
    for obj in meshes:
        if obj.name.startswith(("TS_Top", "TS_Outer", "TS_Bottom", "TS_Legwear", "TS_Shoes", "TS_Accessory")):
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.shade_smooth_by_angle(angle=0.523599, keep_sharp_edges=True)
            obj.select_set(False)

    # 85° 어깨 거상 포즈를 베이스 & 모든 의상 아마추어에 동일 적용!
    if pose_85:
        for arm in armatures:
            pb = arm.pose.bones
            for bname, world_axis, deg in (
                ("mixamorig:LeftShoulder", Vector((0.0, -1.0, 0.0)), +21.25),
                ("mixamorig:LeftArm", Vector((0.0, -1.0, 0.0)), +63.75),
                ("mixamorig:RightShoulder", Vector((0.0, -1.0, 0.0)), +10.0),
                ("mixamorig:RightArm", Vector((0.0, -1.0, 0.0)), +45.0),
            ):
                if bname in pb:
                    bone_m = pb[bname].bone.matrix_local.to_3x3()
                    local_axis = (bone_m.inverted() @ world_axis).normalized()
                    q_loc = Matrix.Rotation(math.radians(deg), 3, local_axis).to_quaternion()
                    pb[bname].rotation_mode = "QUATERNION"
                    pb[bname].rotation_quaternion = q_loc
        bpy.context.view_layer.update()

    # 아틀리에 바닥 원판 추가 (접지 그림자 확인용)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.95, depth=0.012, location=(0.0, 0.0, -0.006))
    floor = bpy.context.active_object
    fmat = bpy.data.materials.new("TS_AtelierFloor")
    fmat.use_nodes = True
    bsdf = fmat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (0.86, 0.83, 0.78, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.90
    floor.data.materials.append(fmat)

    cam = qa._setup_eevee_studio(scene, res=res)  # noqa: SLF001
    h = bb2.ARCHETYPES[base_id].height_m
    mid_z = h * 0.50
    dist = h * (1.58 if not pose_85 else 1.82)
    cam_pos = Vector((dist * 0.44, -dist * 0.90, mid_z + h * (0.06 if not pose_85 else 0.14)))
    cam_tgt = Vector((0.0, 0.0, mid_z + (h * 0.10 if pose_85 else 0.0)))
    qa._aim_camera(cam, cam_pos, cam_tgt, lens=50.0)  # noqa: SLF001

    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)
    return qa._load_png_rgba_bpy(out_png)  # noqa: SLF001


def render_contact_sheet(
    bases_dir: Path,
    garments_dir: Path,
    ensembles: list[tuple[str, str, list[str], bool]],
    out_sheet: Path,
    res: int = 512,
) -> None:
    tiles: list[np.ndarray] = []
    with tempfile.TemporaryDirectory() as tmp:
        for label, base_id, slugs, pose85 in ensembles:
            tp = Path(tmp) / f"{label}.png"
            print(f"[render] {label} ({base_id}, pose85={pose85}): {', '.join(slugs)}")
            tiles.append(_render_ensemble_tile(bases_dir, garments_dir, base_id, slugs, pose85, res, tp))

    grid = np.full((res * 2, res * 3, 4), 255, dtype=np.uint8)
    for idx_t, tile in enumerate(tiles[:6]):
        row, col = idx_t // 3, idx_t % 3
        grid[row * res : (row + 1) * res, col * res : (col + 1) * res] = tile
    sep = np.array([208, 202, 190, 255], dtype=np.uint8)
    grid[res - 1 : res + 1, :] = sep
    grid[:, res - 1 : res + 1] = sep
    grid[:, 2 * res - 1 : 2 * res + 1] = sep
    out_sheet.parent.mkdir(parents=True, exist_ok=True)
    qa._write_png_rgba(out_sheet, grid)  # noqa: SLF001
    print(f"[render] 컨택트시트 저장 완료: {out_sheet} ({grid.shape[1]}x{grid.shape[0]})")


# ===========================================================================
# CLI 오케스트레이터
# ===========================================================================


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio Character Kit v2 6대 장르 34종 의상 포지")
    parser.add_argument("--bases-dir", type=Path, default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/bases"))
    parser.add_argument("--out-dir", type=Path, default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/parts/garments"))
    parser.add_argument("--preview-dir", type=Path, default=Path("loop-stack/competitor-parity/previews/char"))
    parser.add_argument("--genre", default="all", help="all 또는 장르 slug (korean-academy 등)")
    parser.add_argument("--part", default="all", help="all 또는 단일 파츠 slug")
    parser.add_argument("--res", type=int, default=512)
    parser.add_argument("--skip-render", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    t0 = time.time()
    args = _parse_args(sys.argv[1:] if argv is None else argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    textures_bank = gc.bake_fabric_textures(size=512)

    # 필요 아키타입 베이스 로드 캐시
    ctx_cache: dict[str, gc.BaseBodyContext] = {}

    def get_ctx(base_id: str) -> gc.BaseBodyContext:
        if base_id not in ctx_cache:
            ctx_cache[base_id] = gc.load_base_context(base_id, args.bases_dir)
        return ctx_cache[base_id]

    specs = [
        s for s in GARMENT_CATALOG
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
            f"[forge_garments_v2] {status} | {spec.preset_id:30s} ({spec.default_base:14s}) | "
            f"{res.bytes/1024:6.1f} KB | tris={res.triangles:5d} | ch={len(res.materials)} | "
            f"uv0_ov={res.uv0_overlap:.4f} | uv1={res.uv1_density['medianCmPerUnit']:5.1f}cm | "
            f"clr={res.clearance['restMinClearanceMm']:5.2f}mm | "
            f"p85_pen={p85.get('penetratingVerts', '-')} | valErr={res.gltf_validator['errorCount']}"
        )
        if res.errors:
            for e in res.errors:
                print(f"    !! ERROR: {e}")

    # 레지스트리 + QA 요약 JSON 기록
    args.out_dir.mkdir(parents=True, exist_ok=True)
    registry: dict[str, Any] = {
        "schema": "toonstudio.character-kit.garments-v2-registry/1",
        "uv1CmPerUnit": gc.UV1_CM_PER_UNIT,
        "count": len(results),
        "genres": sorted({r.genre for r in results}),
        "parts": {},
    }
    qa_summary: dict[str, Any] = {
        "schema": "toonstudio.character-kit.garments-v2-qa/1",
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

    # 6대 장르 풀 착장 컨택트시트 + 추가 파츠/85° 포즈 검증 시트 렌더
    if not args.skip_render and args.genre == "all" and args.part == "all":
        render_contact_sheet(
            args.bases_dir,
            args.out_dir,
            SIX_GENRE_ENSEMBLES,
            args.preview_dir / "garments-6-sheet.png",
            res=args.res,
        )
        render_contact_sheet(
            args.bases_dir,
            args.out_dir,
            EXTRA_AND_POSE_ENSEMBLES,
            args.preview_dir / "garments-extra-and-85pose-sheet.png",
            res=args.res,
        )

    print(
        f"[forge_garments_v2] 완료: {len(results) - failed_count}/{len(results)} PASS "
        f"({time.time() - t0:.1f}s) → {args.out_dir}"
    )
    return 0 if failed_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
