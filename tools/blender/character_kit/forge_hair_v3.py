"""ToonStudio Character Kit v3 — 12종 한국 웹툰 히어로 헤어 생성기 & VRM 1.0 SSOT 엔진 (Blender 5.3).

v2(`forge_hair_v2.py`) 대비 핵심 시각·조형 혁신:
1. 뒷머리 Z-파이팅 점선 지퍼 완전 제거:
   - Layer 0 수밀 두피 볼륨 캡 확장(`+4.2mm`) + Layer 1 이웃 가닥 간 명시적 교대 반경 층분리(`+3.6mm`,
     중간 두께 교차 차단) + Layer 2 명시적 `+3.0mm` 외측 리프트 + Layer 3 `+5.2mm` 실루엣 리프트.
2. 바코드/울타리 앞머리 탈피 & 깃털 끝 테이퍼:
   - 끝단 폭 하한 `0.14 → 0.048` 깃털 테이퍼(zero-area 0개 유지), 3단계 리듬 폭(앵커·메인·포인트 잔머리)
     + 앞머리 안쪽 음영 베일(soft inner veil) 추가.
3. 3대 핵심 헤어 리스컬프팅:
   - `comma-hair`: 한국 드라마/로맨스 남주 7:3 볼륨 아치 + 선명한 안쪽 C-훅 쉼표 컬 + 자연 옆쓸림.
   - `slicked-back-duke`: 로판 북부대공 웅장한 올백 포마드 웨이브 + 날렵한 템플 스윕 + 이마 포인트 컬.
   - `braided-crown`: 두상에 밀착되는 정교한 3가닥 헤링본 브레이드 크라운 + 풍성한 로우 시뇽 번 + 로맨틱 나선 롱컬.
4. VRM 1.0 단일 정본(SSOT) API:
   - `build_hair_v3_for_vrm(style_id, base_glb, lod_level)` 공개 → `export_vrm1_hero.py`가 5종 어느 베이스에도
     동일한 v3 고품질 헤어를 직접 조립(중복 조잡 헤어 빌더 영구 폐기!).

실행:
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/forge_hair_v3.py -- \
        --out-dir apps/character-lab/public/assets/characters/toonstudio-kit-v2/parts/hair \
        --preview-sheet loop-stack/v2-previews/char/hair-12-sheet-v3.png
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from dataclasses import replace
from pathlib import Path
from typing import Any, Callable

import bpy
import numpy as np

_THIS_DIR = Path(__file__).resolve().parent
_BLENDER_TOOLS_DIR = _THIS_DIR.parent
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from character_kit import build_base_v2 as bb2  # noqa: E402
from character_kit import forge_hair_v2 as fh2  # noqa: E402
from character_kit import garment_fit as gf  # noqa: E402

HAIR_STYLES_12 = fh2.HAIR_STYLES_12
STYLE_META_MAP = fh2.STYLE_META_MAP

# ---------------------------------------------------------------------------
# v3 업그레이드 패치: 깃털 끝 테이퍼 + 확장 두피 캡 + 명시적 반경 층분리(지퍼 0!)
# ---------------------------------------------------------------------------


def width_thick_profile_v3(strand: fh2.BezierStrand, s: np.ndarray, length: float) -> tuple[np.ndarray, np.ndarray]:
    """한국 웹툰 붓터치 깃털 끝 테이퍼 (`0.14 → 0.048`, zero-area 0 보장)."""
    s = np.asarray(s, dtype=np.float64)
    grow = strand.root_scale + (1.0 - strand.root_scale) * fh2.smoothstep(0.0, min(0.022, 0.28 * length), s)
    to_tip = np.maximum(length - s, 0.0)
    if strand.tip == "blunt":
        u = fh2.smoothstep(0.008, 0.0, to_tip)
        w = grow * (1.0 - 0.12 * u)
        th = grow * (1.0 - 0.28 * u)
        return np.maximum(w, 0.14), np.maximum(th, 0.18)
    taper = max(min(strand.taper_len * 1.18, 0.88 * length), 0.005)
    u = np.clip(1.0 - to_tip / taper, 0.0, 1.0)
    shrink = np.clip(1.0 - u, 0.0, 1.0) ** max(0.72, strand.taper_power * 0.92)
    # 깃털처럼 가늘어지되 끝 직전 링 붕괴 방지(하한 0.048 / 두께 0.15 → zero-area 0!)
    w = grow * np.maximum(shrink, 0.048)
    th = grow * np.maximum(strand.thickness_tip * 0.72 + (1.0 - strand.thickness_tip * 0.72) * shrink, 0.15)
    return w, th


def _apply_v3_radial_stratification(frame: fh2.HeadFrameV2, strands: list[fh2.BezierStrand]) -> list[fh2.BezierStrand]:
    """Layer 1 이웃 가닥 지퍼 교차 제거 + Layer 2(+2.8mm) / Layer 3(+5.2mm) 명시적 반경 층분리."""
    if not strands:
        return strands

    c = frame.center

    def _azimuth(st: fh2.BezierStrand) -> float:
        mid = st.points[len(st.points) // 2] - c
        return math.atan2(float(mid[0]), float(mid[2]))

    # Layer 1 및 Layer 2 비-번/브레이드 가닥을 방위각순 정렬해 짝/홀 교대 반경 분리(두께 교차 지퍼 원천 제거!)
    l1_main_ids = [
        i for i, st in enumerate(strands)
        if st.layer == 1 and st.group in ("back", "side", "crown") and st.group != "under"
    ]
    l1_main_ids.sort(key=lambda i: _azimuth(strands[i]))
    l1_rank = {idx: rank for rank, idx in enumerate(l1_main_ids)}

    l2_main_ids = [
        i for i, st in enumerate(strands)
        if st.layer == 2 and st.group not in ("braid", "bun", "pony", "tail")
    ]
    l2_main_ids.sort(key=lambda i: _azimuth(strands[i]))
    l2_rank = {idx: rank for rank, idx in enumerate(l2_main_ids)}

    out: list[fh2.BezierStrand] = []
    for i, st in enumerate(strands):
        pts = st.points.copy()
        s_arc = fh2.arc_lengths(pts)
        length = max(float(s_arc[-1]), 1e-6)
        t = s_arc / length
        # 뿌리(t<0.06)는 두피에 깔끔히 밀착, 상단부터 즉시 층간 반경 분리 적용!
        ramp = fh2.smoothstep(0.05, 0.24, t)
        out_dir = fh2.default_outward_hint(frame, pts)

        radial_lift = 0.0
        new_thick = st.thickness
        new_width = st.width
        if st.layer == 1:
            if st.group == "under":
                radial_lift = -0.0004
            elif i in l1_rank:
                # 짝수 가닥: 안쪽 베이스 셸, 홀수 가닥: 두께 이상(+5.6~6.8mm) 바깥 계단식 겹침 → 지퍼 교차 0!
                is_outer = (l1_rank[i] % 2 == 1)
                new_thick = st.thickness * 0.72
                radial_lift = max(0.0056, new_thick * 0.78) if is_outer else 0.0
                if not is_outer:
                    new_width = st.width * 0.94
        elif st.layer == 2:
            if i in l2_rank:
                is_outer2 = (l2_rank[i] % 2 == 1)
                new_thick = st.thickness * 0.80
                radial_lift = 0.0058 if is_outer2 else 0.0018
        elif st.layer == 3:
            if st.group in ("bang", "side", "whisp"):
                radial_lift = 0.0026

        if abs(radial_lift) > 1e-6:
            pts = pts + out_dir * (radial_lift * ramp)[:, None]
        out.append(replace(st, points=pts, thickness=new_thick, width=new_width))
    return out


# ---------------------------------------------------------------------------
# 3대 핵심 헤어 리스컬프팅 + 3-스케일 리듬 앞머리 보강
# ---------------------------------------------------------------------------


def _add_rhythmic_bang_veil_and_wisps(s: fh2.SketchV2, style_id: str) -> None:
    """앞머리 스타일에 은은한 안쪽 베일 + 비대칭 깃털 포인트 잔머리(3-스케일 리듬!)를 추가한다."""
    m = s.m
    if style_id in ("soft-bob", "twin-tail", "short-layered", "wolf-layered", "action-pony"):
        # 안쪽 이마 음영 베일 2가닥 (앞머리 사이 휑한 피부 끊김 방지 + 깊이감!)
        for sgn in (-1.0, 1.0):
            ctrl_v = s.bang_ctrl(
                sgn * 18.0,
                m["brow_top_y"] + 0.004,
                phi_root=18.0,
                h_root=0.0085,
                h_arch=0.0135,
                h_tip=0.0065,
                drift_deg=sgn * 6.0,
            )
            s.add_strand(
                ctrl_v,
                0.030,
                0.0055,
                1,
                "under",
                profile="crescent",
                ao=0.78,
                taper_len=0.022,
                tip_frac=0.15,
                lod2_keep=False,
                sway_scale=0.22,
            )
        # 3-스케일 리듬: 섬세한 비대칭 포인트 잔머리 3가닥 (바코드 앞머리 완전 탈피!)
        wisp_specs = [(-26.0, 0.003, -8.0, 0.0095), (-4.0, -0.003, 5.0, 0.0085), (22.0, 0.002, 9.0, 0.0095)]
        for th, dy, dr, w in wisp_specs:
            ctrl_w = s.bang_ctrl(
                th,
                m["brow_bottom_y"] + dy - 0.004,
                phi_root=15.0,
                h_root=0.014,
                h_arch=0.023,
                h_tip=0.0115,
                drift_deg=dr,
                curl_in_z=0.002,
            )
            s.add_strand(
                ctrl_w,
                w,
                0.0052,
                3,
                "whisp",
                profile="diamond",
                taper_len=0.032,
                tip_frac=0.35,
                lod2_keep=False,
                sway_scale=0.65,
            )


def build_comma_hair_v3(s: fh2.SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """9(v3). 한국 웹툰 로맨스 남주 시그니처 7:3 쉼표머리: 풍성한 크라운 리프트 + 입체 C-훅 쉼표 컬."""
    m = s.m

    # Layer 1: 깔끔한 언더컷 옆머리 + 볼륨감 있는 둥근 뒤통수(비교차 교대 겹침)
    for th in (-102.0, -80.0, 80.0, 102.0):
        ctrl = s.meridian_ctrl(th, 46.0, 94.0, 0.005, 0.0065, 0.004, n_ctrl=5, kind="skull")
        s.add_strand(ctrl, 0.038, 0.0065, 1, "under", profile="crescent", ao=0.76, accent=True, taper_len=0.018, tip_frac=0.0, lod2_keep=True, sway_scale=0.10)
    for th in (-164.0, -142.0, -118.0, 118.0, 142.0, 164.0, 180.0):
        ctrl = s.meridian_ctrl(th, 10.0, 126.0, 0.009, 0.0155, 0.006, n_ctrl=6, kind="skull")
        s.add_strand(ctrl, 0.048, 0.010, 1, "back", profile="crescent", taper_len=0.028, tip_frac=0.18, lod2_keep=True, sway_scale=0.20)

    # Layer 2: 7:3 비대칭 크라운 볼륨 웨이브 (가르마 루트 리프트 강조!)
    for idx, th in enumerate((-160.0, -132.0, -100.0, -68.0, 50.0, 78.0, 108.0, 138.0, 168.0, 180.0)):
        ab = abs(th)
        phi_e = float(np.interp(ab, [48.0, 90.0, 180.0], [78.0, 90.0, 112.0]))
        h_mid = 0.024 if th > 0.0 else 0.020
        ctrl = s.meridian_ctrl(th, 6.0, phi_e, 0.014, h_mid, 0.013, n_ctrl=6, theta_drift_deg=(12.0 if th > 0 else -12.0), kind="skull")
        s.add_strand(ctrl, 0.042, 0.0105, 2, "mid", profile="almond", taper_len=0.032, tip_frac=0.22, lod2_keep=(idx % 2 == 0), sway_scale=0.35)

    # Layer 3A: 7-side 시그니처 쉼표(C) 컬 4청크 (3-스케일: 메인 굵은 C-아치 + 보조 레이어 + 얇은 이마 쉼표 끝!)
    comma_specs = [
        (0.0, 0.032, 0.0125, -0.002, 0.003, True),    # 메인 쉼표 아치
        (9.0, 0.026, 0.0105, 0.005, 0.000, True),     # 바깥 볼륨 레이어
        (-8.0, 0.022, 0.0095, -0.005, 0.005, True),   # 안쪽 C-훅 포인트
        (4.0, 0.013, 0.0065, -0.008, 0.007, False),   # 깃털 잔머리 쉼표 끝
    ]
    for dth, w, thk, dy_off, fwd_b, keep_l2 in comma_specs:
        p0 = s.scalp_pt(-20.0 + dth * 0.35, 20.0, 0.013, "skull")
        p1 = s.scalp_pt(-2.0 + dth * 0.55, 34.0, 0.026 + fwd_b * 0.4, "skull") + np.array([0.0, 0.011, 0.008])
        p2 = s.scalp_pt(22.0 + dth, 54.0, 0.029 + fwd_b, "skull") + np.array([0.008, 0.006, 0.013])
        p3 = s.scalp_pt(25.0 + dth * 0.9, 74.0, 0.022 + fwd_b * 0.5, "skull") + np.array([0.005, -0.005 - 0.007 * s.bang_q, 0.010])
        p4 = s.scalp_pt(4.0 + dth * 0.45, 86.0 + 4.0 * s.bang_q, 0.013, "skull") + np.array([-0.011, dy_off - 0.009 * s.bang_q, 0.005])
        p4[1] = max(p4[1], m["eye_top_y"] + 0.001)
        s.add_strand(np.asarray([p0, p1, p2, p3, p4], dtype=np.float64), w, thk, 3, "bang", profile="diamond", taper_len=0.036, tip_frac=0.26, lod2_keep=keep_l2, sway_scale=0.58, spring_chain="bang_comma")

    # Layer 3B: 3-side 시원하게 이마를 살짝 드러내며 바깥으로 넘어가는 세련된 스윕 4가닥
    for th0, th1, y_off, w, keep_l2 in (
        (-24.0, -48.0, 0.011, 0.028, True),
        (-32.0, -58.0, 0.005, 0.025, True),
        (-40.0, -68.0, 0.001, 0.021, True),
        (-20.0, -34.0, -0.002, 0.012, False),
    ):
        p0 = s.scalp_pt(th0, 20.0, 0.013, "skull")
        p1 = s.scalp_pt(th0 - 4.0, 38.0, 0.025, "skull") + np.array([0.0, 0.008, 0.008])
        p2 = s.scalp_pt(0.5 * (th0 + th1), 60.0, 0.022, "skull") + np.array([-0.005, 0.001, 0.006])
        p3 = s.scalp_pt(th1, 80.0 + 3.0 * s.bang_q, 0.012, "skull") + np.array([0.0, y_off - 0.006 * s.bang_q, 0.002])
        s.add_strand(np.asarray([p0, p1, p2, p3], dtype=np.float64), w, 0.0095, 3, "bang", profile="almond", taper_len=0.032, tip_frac=0.24, lod2_keep=keep_l2, sway_scale=0.50, spring_chain="bang_sweep")

    for sgn in (1.0, -1.0):
        ctrl_sb = s.meridian_ctrl(sgn * 66.0, 62.0, 104.0, 0.006, 0.0075, 0.004, n_ctrl=5, kind="skull")
        s.add_strand(ctrl_sb, 0.016, 0.0055, 3, "side", profile="diamond", taper_len=0.022, tip_frac=0.14, lod2_keep=True, sway_scale=0.10)

    s.add_spring("bang_comma", "bang", stiffness=0.84, drag=0.45, gravity=0.24, hit_radius=0.016, joints=4)
    s.add_spring("bang_sweep", "bang", stiffness=0.88, drag=0.48, gravity=0.22, hit_radius=0.015, joints=4)
    return fh2.table_hairline([(0.0, 50.0), (40.0, 58.0), (72.0, 86.0), (96.0, 90.0), (125.0, 110.0), (180.0, 124.0)])


def build_slicked_back_duke_v3(s: fh2.SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """10(v3). 로판 북부대공 반깐·올백 노블컷: 웅장한 포마드 웨이브 + 날카로운 관자 스윕 + 이마 포인트 컬."""
    m = s.m

    # Layer 1: 뒤로 빗어 넘긴 슬릭 사이드 + 단정한 귀족 뒷머리
    for th in (-104.0, -82.0, 82.0, 104.0):
        ctrl = s.meridian_ctrl(th, 42.0, 94.0, 0.006, 0.008, 0.0045, n_ctrl=5, theta_drift_deg=(16.0 if th > 0 else -16.0), kind="skull")
        s.add_strand(ctrl, 0.038, 0.0072, 1, "under", profile="crescent", ao=0.78, accent=True, taper_len=0.018, tip_frac=0.0, lod2_keep=True, sway_scale=0.08)
    for th in (-164.0, -140.0, -118.0, 118.0, 140.0, 164.0, 180.0):
        ctrl = s.meridian_ctrl(th, 14.0, 128.0, 0.0095, 0.0155, 0.006, n_ctrl=6, kind="skull")
        s.add_strand(ctrl, 0.048, 0.0105, 1, "back", profile="crescent", taper_len=0.028, tip_frac=0.20, lod2_keep=True, sway_scale=0.18)

    # Layer 2: 이마선에서 우아하게 치솟아 뒤로 흐르는 슬릭 노블 포마드 웨이브 9청크 (과도한 중앙 혹 제거!)
    for idx, x_th in enumerate((-44.0, -32.0, -21.0, -10.0, 0.0, 10.0, 21.0, 32.0, 44.0)):
        sh = 0.0014 if (idx % 2 == 0) else -0.0008
        arch_lift = 0.0155 - 0.000024 * (x_th * x_th) + sh
        p0 = s.scalp_pt(x_th, 50.0, 0.0065, "skull")
        p1 = s.scalp_pt(x_th * 0.94, 30.0, arch_lift, "skull") + np.array([0.0, 0.0038, 0.0035])
        p2 = s.scalp_pt(x_th * 0.78, 8.0, arch_lift * 0.92, "skull") + np.array([0.0, 0.0020, 0.0])
        back_th = (180.0 - x_th * 1.45) % 360.0
        p3 = s.scalp_pt(back_th, 36.0, 0.0145 + sh, "skull")
        p4 = s.scalp_pt(back_th, 76.0, 0.0130 + sh, "skull")
        p5 = s.scalp_pt(back_th, 110.0, 0.0085 + sh * 0.5, "skull")
        s.add_strand(np.asarray([p0, p1, p2, p3, p4, p5], dtype=np.float64), 0.036, 0.0095, 2, "crown", profile="almond", taper_len=0.034, tip_frac=0.22, lod2_keep=(idx % 2 == 0 or abs(x_th) <= 10.0), sway_scale=0.18)

    # Layer 3: 북부대공 시그니처 — 이마 한쪽으로 곡선미 있게 흘러내린 포인트 가닥 + 보조 잔머리 + 템플 스윕
    p0 = s.scalp_pt(-14.0, 40.0, 0.016, "skull")
    p1 = s.scalp_pt(-19.0, 54.0, 0.027, "skull") + np.array([0.0, 0.006, 0.010])
    p2 = s.scalp_pt(-9.0, 72.0, 0.020, "skull") + np.array([0.005, -0.004, 0.011])
    p3 = s.scalp_pt(-15.0, 88.0 + 6.0 * s.bang_q, 0.013, "skull") + np.array([-0.002, -0.015 - 0.012 * s.bang_q, 0.008])
    p3[1] = max(p3[1], m["eye_top_y"] - 0.003)
    s.add_strand(np.asarray([p0, p1, p2, p3], dtype=np.float64), 0.017, 0.0075, 3, "whisp", profile="diamond", taper_len=0.042, tip_frac=0.34, lod2_keep=True, sway_scale=0.85, spring_chain="whisp_point")

    # 동반 미세 가닥
    p0b = s.scalp_pt(-10.0, 42.0, 0.015, "skull")
    p1b = s.scalp_pt(-12.0, 58.0, 0.024, "skull") + np.array([0.0, 0.004, 0.008])
    p2b = s.scalp_pt(-2.0, 78.0 + 4.0 * s.bang_q, 0.014, "skull") + np.array([0.002, -0.008 - 0.008 * s.bang_q, 0.006])
    s.add_strand(np.asarray([p0b, p1b, p2b], dtype=np.float64), 0.010, 0.0052, 3, "whisp", profile="diamond", taper_len=0.032, tip_frac=0.35, lod2_keep=False, sway_scale=0.90, spring_chain="whisp_point")

    # 반대쪽 반깐 포인트 스윕
    q0 = s.scalp_pt(22.0, 42.0, 0.015, "skull")
    q1 = s.scalp_pt(30.0, 56.0, 0.023, "skull") + np.array([0.0, 0.003, 0.007])
    q2 = s.scalp_pt(42.0, 72.0 + 4.0 * s.bang_q, 0.013, "skull") + np.array([0.005, -0.005 - 0.006 * s.bang_q, 0.004])
    s.add_strand(np.asarray([q0, q1, q2], dtype=np.float64), 0.016, 0.0068, 3, "bang", profile="diamond", taper_len=0.028, tip_frac=0.28, lod2_keep=True, sway_scale=0.55)

    for sgn in (1.0, -1.0):
        t0 = s.scalp_pt(sgn * 54.0, 62.0, 0.013, "skull")
        t1 = s.scalp_pt(sgn * 84.0, 74.0, 0.016, "skull")
        t2 = s.scalp_pt(sgn * 118.0, 92.0, 0.013, "skull")
        s.add_strand(np.asarray([t0, t1, t2], dtype=np.float64), 0.026, 0.009, 3, "side", profile="almond", taper_len=0.028, tip_frac=0.20, lod2_keep=True, sway_scale=0.12)
        ctrl_sb = s.meridian_ctrl(sgn * 66.0, 64.0, 102.0, 0.0055, 0.0065, 0.004, n_ctrl=5, kind="skull")
        s.add_strand(ctrl_sb, 0.014, 0.005, 3, "side", profile="diamond", taper_len=0.018, tip_frac=0.12, lod2_keep=False, sway_scale=0.08)

    s.add_spring("whisp_point", "whisp", stiffness=0.80, drag=0.44, gravity=0.28, hit_radius=0.014, joints=4)
    return fh2.table_hairline([(0.0, 48.0), (38.0, 56.0), (70.0, 84.0), (96.0, 90.0), (125.0, 110.0), (180.0, 126.0)])


def build_braided_crown_v3(s: fh2.SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """11(v3). 로판 황녀 브레이드 업스타일: 정교한 밀착 3가닥 브레이드 + 풍성한 시뇽 번 + 로맨틱 나선 롱컬."""
    m = s.m
    bun_dir = fh2.sph(180.0, 64.0)
    bun_center = s.frame.scalp(bun_dir, 0.024 + 0.006 * s.vol, "skull")[0]
    bun_axis = fh2.unit(bun_center - s.c)

    # Layer 1: 이마·옆·목덜미에서 시뇽 번으로 매끄럽게 올려 묶은 13 두피 청크
    targets = [
        (-36.0, 54.0), (-12.0, 52.0), (12.0, 52.0), (36.0, 54.0),
        (60.0, 74.0), (88.0, 96.0), (118.0, 118.0), (150.0, 132.0),
        (180.0, 136.0), (-150.0, 132.0), (-118.0, 118.0), (-88.0, 96.0), (-60.0, 74.0),
    ]
    for th, ph in targets:
        ctrl = s.converge_ctrl(th, ph, bun_center - bun_axis * 0.012, h_root=0.006, h_mid=0.012)
        s.add_strand(ctrl, 0.044, 0.009, 1, "crown", profile="crescent", taper_len=0.016, tip_frac=0.0, lod2_keep=True, sway_scale=0.04)

    # Layer 2A: 두상에 밀착되는 정교한 3가닥 9.5회 교차 땋은 크라운 밴드
    tilt = math.radians(22.0)
    top_v = np.array([0.0, math.cos(tilt), math.sin(tilt)])
    x_v = np.array([1.0, 0.0, 0.0])
    plane_n = fh2.unit(np.cross(x_v, top_v))
    u_arc = np.linspace(-0.56 * math.pi, 0.56 * math.pi, 56)
    arc_dirs = fh2.unit(np.outer(np.cos(u_arc), top_v) + np.outer(np.sin(u_arc), x_v))
    arc_base = s.frame.scalp(arc_dirs, 0.0140 + 0.0035 * s.vol, "skull")
    arc_out = fh2.unit(arc_base - s.c)
    arc_lat = fh2.unit(np.tile(plane_n, (len(arc_base), 1)) - np.einsum("ij,j->i", arc_out, plane_n)[:, None] * arc_out)
    for k in range(3):
        phase = 2.0 * math.pi * k / 3.0
        ang = 2.0 * math.pi * 9.5 * np.linspace(0.0, 1.0, len(u_arc)) + phase
        p_braid = arc_base + arc_lat * (0.0075 * np.sin(ang))[:, None] + arc_out * (0.0040 * np.cos(2.0 * ang))[:, None]
        s.add_strand(
            fh2.resample_polyline(p_braid, count=26),
            0.013,
            0.0085,
            2,
            "braid",
            profile="round",
            hints=fh2.resample_polyline(arc_out, count=26),
            taper_len=0.018,
            tip_frac=0.0,
            lod2_keep=(k < 2),
            sway_scale=0.03,
        )

    # Layer 2B: 풍성한 4단 로우 시뇽 번
    hlp = np.array([0.0, 1.0, 0.0])
    bu = fh2.unit(np.cross(bun_axis, hlp))
    bv = fh2.unit(np.cross(bun_axis, bu))
    for ring_i, (rad_b, off_ax, w_b) in enumerate(((0.040, 0.000, 0.023), (0.033, 0.013, 0.021), (0.023, 0.024, 0.018), (0.012, 0.031, 0.015))):
        ang = np.linspace(0.0, 2.0 * math.pi * 0.94, 18) + ring_i * 0.9
        r_scaled = rad_b * (1.0 + 0.16 * s.vol)
        pts_b = bun_center[None, :] + bun_axis[None, :] * (off_ax + 0.0022 * np.sin(ang * 3.0))[:, None] + (np.cos(ang)[:, None] * bu + np.sin(ang)[:, None] * bv) * r_scaled
        s.add_strand(pts_b, w_b, 0.013, 2, "bun", profile="round", hints=fh2.unit(pts_b - bun_center[None, :]), taper_len=0.018, tip_frac=0.10, lod2_keep=(ring_i < 2), sway_scale=0.04)

    # 구조 장식: 로판 황녀 금장 필릿 + 진주 5개 + 시뇽 왕관 서클릿
    fillet_dirs = fh2.unit(np.outer(np.cos(u_arc[4:-4]), fh2.unit(np.array([0.0, math.cos(math.radians(33.0)), math.sin(math.radians(33.0))]))) + np.outer(np.sin(u_arc[4:-4]), x_v))
    fillet_pts = s.frame.scalp(fillet_dirs, 0.0175 + 0.0035 * s.vol, "skull")
    s.add_ornament(fh2.make_tube_ornament("royal_fillet", fh2.resample_polyline(fillet_pts, count=22), np.full(22, 0.0030), sides=6))
    s.add_ornament(fh2.make_torus_ornament("bun_circlet", bun_center - bun_axis * 0.004, bun_axis, 0.044 * (1.0 + 0.14 * s.vol), 0.0035, axial_scale=1.1, segs=22, sides=6))
    for pk in (-0.30, -0.15, 0.0, 0.15, 0.30):
        pd = fh2.unit(math.cos(pk * math.pi) * fh2.unit(np.array([0.0, math.cos(math.radians(33.0)), math.sin(math.radians(33.0))])) + math.sin(pk * math.pi) * x_v)
        pp = s.frame.scalp(pd, 0.0210 + 0.0035 * s.vol, "skull")[0]
        s.add_ornament(fh2.make_ellipsoid_ornament(f"royal_pearl_{pk:+.2f}", pp, (0.0040, 0.0040, 0.0040), level=1))

    # Layer 3: 로판 황녀 우아한 커튼 뱅 4가닥 + 깃털 잔머리 2 + 로맨틱 나선 롱컬 4가닥
    for sgn in (1.0, -1.0):
        ctrl_b1 = s.bang_ctrl(sgn * 13.0, m["eye_top_y"] + 0.007, phi_root=20.0, h_root=0.012, h_arch=0.020, h_tip=0.009, drift_deg=sgn * 28.0)
        s.add_strand(ctrl_b1, 0.026, 0.008, 3, "bang", profile="almond", taper_len=0.032, tip_frac=0.22, lod2_keep=True, sway_scale=0.40)
        ctrl_b2 = s.bang_ctrl(sgn * 34.0, m["eye_top_y"] + 0.002, phi_root=22.0, h_root=0.011, h_arch=0.019, h_tip=0.0085, drift_deg=sgn * 20.0)
        s.add_strand(ctrl_b2, 0.022, 0.0075, 3, "bang", profile="almond", taper_len=0.032, tip_frac=0.24, lod2_keep=False, sway_scale=0.45)
        ctrl_w = s.bang_ctrl(sgn * 7.0, m["eye_top_y"] + 0.002, phi_root=22.0, h_root=0.012, h_arch=0.021, h_tip=0.010, drift_deg=sgn * 14.0)
        s.add_strand(ctrl_w, 0.010, 0.0052, 3, "whisp", profile="diamond", taper_len=0.028, tip_frac=0.30, lod2_keep=False, sway_scale=0.60)

    for sgn, ch in ((1.0, "curl_L"), (-1.0, "curl_R")):
        t_c = np.linspace(0.0, 1.0, 28)
        p_top = s.scalp_pt(sgn * 62.0, 74.0, 0.014, "skull")
        y_end = m["chest_y"] + 0.02 - 0.012 * s.bang_q
        spine_y = p_top[1] + (y_end - p_top[1]) * t_c
        spine_x = p_top[0] + sgn * 0.015 * fh2.smoothstep(0.0, 0.5, t_c)
        spine_z = p_top[2] + (m["chest_z"] - p_top[2] + 0.014) * fh2.smoothstep(0.15, 0.90, t_c)
        helix_r = 0.0125 * fh2.smoothstep(0.14, 0.44, t_c) * (1.0 - 0.32 * fh2.smoothstep(0.75, 1.0, t_c)) * (1.0 + 0.25 * s.vol)
        ang = sgn * 2.0 * math.pi * 3.1 * t_c
        curl_pts = np.stack([spine_x + helix_r * np.cos(ang), spine_y, spine_z + helix_r * np.sin(ang)], axis=1)
        s.add_strand(fh2.resample_polyline(curl_pts, count=18), 0.024, 0.010, 3, "side", profile="almond", twist_deg=sgn * 60.0, taper_len=0.062, tip_frac=0.32, lod2_keep=True, sway_scale=1.10, spring_chain=ch)
        ang2 = ang + math.pi * 0.85
        curl_pts2 = np.stack([spine_x + (helix_r * 0.8 + 0.004) * np.cos(ang2), spine_y + 0.018 * t_c, spine_z + (helix_r * 0.8 + 0.004) * np.sin(ang2)], axis=1)
        s.add_strand(fh2.resample_polyline(curl_pts2[:22], count=14), 0.014, 0.0068, 3, "whisp", profile="almond", taper_len=0.050, tip_frac=0.35, lod2_keep=False, sway_scale=1.05, spring_chain=ch)

    s.add_spring("curl_L", "curl", stiffness=0.58, drag=0.36, gravity=0.34, hit_radius=0.018, joints=5)
    s.add_spring("curl_R", "curl", stiffness=0.58, drag=0.36, gravity=0.34, hit_radius=0.018, joints=5)
    return fh2.table_hairline([(0.0, 52.0), (42.0, 58.0), (68.0, 78.0), (96.0, 98.0), (124.0, 120.0), (154.0, 132.0), (180.0, 136.0)])


STYLE_BUILDERS_V3: dict[str, Callable[[fh2.SketchV2], Callable[[np.ndarray], np.ndarray]]] = {
    **fh2.STYLE_BUILDERS,
    "comma-hair": build_comma_hair_v3,
    "slicked-back-duke": build_slicked_back_duke_v3,
    "braided-crown": build_braided_crown_v3,
}


def _install_v3_hooks() -> None:
    """`forge_hair_v2` 엔진의 테이퍼·두피 캡 오프셋을 v3 규격으로 업그레이드한다."""
    fh2.width_thick_profile = width_thick_profile_v3
    fh2.CAP_OUTER_OFFSET_M = 0.0040  # 실키한 연속 두피 베이스 볼륨 강화!


def build_hair_style_v3(frame: fh2.HeadFrameV2, style_id: str, params: dict[str, float] | None = None) -> fh2.HairStyleBuild:
    """v3 반경 층분리 + 3-스케일 리듬 앞머리 + 리스컬프팅 스타일 빌더."""
    _install_v3_hooks()
    params = dict(params or {})
    rng = fh2.Prng(fh2.fnv1a32(f"toonstudio-hair-v3/{style_id}/{frame.archetype_id}"))
    sketch = fh2.SketchV2(frame, rng, style_id, params)
    cap_region = STYLE_BUILDERS_V3[style_id](sketch)
    _add_rhythmic_bang_veil_and_wisps(sketch, style_id)

    stratified = _apply_v3_radial_stratification(frame, sketch.strands)
    sway_val = float(params.get("sway", 0.0))
    strands = []
    for st in stratified:
        st_c = fh2.collide_strand(frame, st)
        if abs(sway_val) > 1e-6:
            st_c = fh2.apply_sway_to_strand(frame, st_c, sway_val)
        strands.append(st_c)
    return fh2.HairStyleBuild(
        style_id=style_id,
        archetype_id=frame.archetype_id,
        params=params,
        strands=strands,
        ornaments=sketch.ornaments,
        cap_region=cap_region,
        band_y=sketch.band_y,
        spring_specs=sketch.spring_specs,
    )


# ---------------------------------------------------------------------------
# VRM 1.0 단일 정본(SSOT) 공개 API — 임의의 v3 베이스 아키타입에 직접 피팅
# ---------------------------------------------------------------------------


def build_hair_v3_for_vrm(style_id: str, base_glb: Path, *, lod_level: int = 0) -> dict[str, Any]:
    """`export_vrm1_hero.py` 전용 SSOT 빌더: 지정한 베이스 GLB 위에 Hero Hair v3 메시·SpringBone을 직접 조형."""
    _install_v3_hooks()
    archetype_id = base_glb.stem
    frame = fh2.load_v2_head_frame(base_glb, archetype_id)
    meta = STYLE_META_MAP[style_id]
    base_build = build_hair_style_v3(frame, style_id, {})
    density = meta.lod_density[lod_level]
    geo = fh2._assemble_lod_geometry(frame, base_build, lod_level, density)  # noqa: SLF001
    P = geo["positions"]
    T = geo["triangles"]
    normals = fh2._blended_toon_normals(P, T, geo["env"], geo["outer"], amount=0.68)  # noqa: SLF001
    spring_meta = fh2.build_springbone_metadata(frame, base_build)
    return {
        "styleId": style_id,
        "archetypeId": archetype_id,
        "positions_g": P,
        "triangles": T,
        "tri_zone": geo["tri_zone"],
        "normals_g": normals,
        "uv0": geo["uv0"],
        "uv1": geo["uv1"],
        "color0": np.stack([geo["ao"], geo["ao"], geo["ao"]], axis=1),
        "cap_start": geo["cap_start"],
        "spring_meta": spring_meta,
        "meta": meta,
    }


# ---------------------------------------------------------------------------
# 12종 전체 v3 헤어 GLB 빌드 + QA + 전/후면 12종 컨택트시트 렌더
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio Character Kit v3 12종 웹툰 헤어 포지")
    parser.add_argument("--style", default="all", choices=("all", *[m.style_id for m in HAIR_STYLES_12]))
    parser.add_argument("--bases-dir", type=Path, default=Path("apps/character-lab/public/assets/characters/toonstudio-kit-v2/bases"))
    parser.add_argument("--out-dir", type=Path, default=Path("apps/character-lab/public/assets/characters/toonstudio-kit-v2/parts/hair"))
    parser.add_argument("--preview-sheet", type=Path, default=Path("loop-stack/v2-previews/char/hair-12-sheet-v3.png"))
    parser.add_argument("--skip-render", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    t0 = time.time()
    _install_v3_hooks()
    fh2.build_hair_style = build_hair_style_v3  # type: ignore[assignment]
    args = _parse_args(sys.argv[1:] if argv is None else argv)

    targets = list(HAIR_STYLES_12) if args.style == "all" else [STYLE_META_MAP[args.style]]
    # twin-tail은 v3 안쪽 베일·잔머리 추가분 반영해 LOD1 링 간격(spacing)을 살짝 넓혀 4k~6k 예산 준수
    targets = [
        replace(m, lod_density=(m.lod_density[0], round(m.lod_density[1] * 1.14, 4), m.lod_density[2]))
        if m.style_id == "twin-tail"
        else m
        for m in targets
    ]
    index_doc = fh2.build_all_hairs(
        targets,
        args.bases_dir,
        args.out_dir,
        None if args.skip_render else args.preview_sheet,
        tile_res=512,
        skip_render=args.skip_render,
    )
    # craftVersion v3 메타 표시
    idx_path = args.out_dir / "hair_v2_index.json"
    if idx_path.is_file():
        doc = json.loads(idx_path.read_text(encoding="utf-8"))
        doc["craftVersion"] = "v3"
        idx_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    all_passed = bool(index_doc.get("allPassed"))
    passed_cnt = sum(1 for item in index_doc.get("items", {}).values() if item.get("passed"))
    print(f"[forge_hair_v3] 완료: {passed_cnt}/{len(targets)} PASS ({time.time() - t0:.1f}s) → {args.out_dir}")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
