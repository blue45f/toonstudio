#!/usr/bin/env python3
"""
ToonOffice 2D(toon-office-v1) 스프라이트 빌드 파이프라인.

이미지 생성 서브에이전트가 만든 마젠타(#FF00FF) 배경 원화 시트를 결정적으로 가공한다.

1. 크로마키: 픽셀의 "마젠타 정도" k = (min(R, B) - G) / 255로 알파를 만들고, 반투명 가장자리의 마젠타 번짐(spill)을 중화한다.
   유리처럼 배경이 비치는 부분은 반투명으로 남는다.
2. 오브젝트 시트: 스프라이트마다 원화 좌표 사각형을 지정하고, 그 안의 연결 성분만 모아 투명 여백을 잘라낸다.
3. 캐릭터 시트(9열 × 4행, 셀 128×192):
   - 0열: 정지/착석 기준 자세(머리 중심 가로 정렬 + 발끝 기준선 FOOT_BASELINE=188 + 행별 키 TARGET_HEIGHT=174 정규화).
   - 1~8열: 정방향 기준 원화에서 합성한 8프레임 연속 보행 주기(위상 φ = 2π·k/8).
     · 정면(0행)·후면(3행): 좌우 다리 교차 들림/디딤, 원근 음영, 팔·어깨 역위상 스윙, 2박자 상하 바운스.
     · 측면(1행 왼쪽·2행 오른쪽): 골반 축(hip pivot) 회전 + 무릎 굽힘(knee flex) 2관절 다리 교차(원경 다리 음영 분리 + 근경 다리)와 팔 스윙.
4. 본사 프리뷰 카드(hq-preview.webp)와 결과 WebP·SHA-256 manifest를 apps/web/public/assets/virtual-studio/toon-office-v1/에 쓴다.

사용법:
  python3 scripts/build-virtual-studio-toon-office-v1.py --source-dir <원화 폴더>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "apps/web/public/assets/virtual-studio/toon-office-v1"
DEFAULT_SOURCE_DIR = Path("/Users/hjunkim/.gemini/antigravity-cli/brain/97335b3c-f2e6-4b24-b8eb-eb56e28c1460")

CELL_W, CELL_H = 128, 192
CHAR_COLS, CHAR_ROWS = 9, 4
FOOT_BASELINE = 188
TARGET_HEIGHT = 174
KEY_LOW, KEY_HIGH = 0.22, 0.55

SOURCES = {
    "desks": "toonoffice_v2_desks_1793121837589.jpg",
    "furniture": "toonoffice_v2_furniture_1793121869913.jpg",
    "pantry": "toonoffice_v2_pantry_1793121943559.jpg",
    "decor": "toonoffice_v2_floor_decor_1793121971867.jpg",
    "props_a": "toonoffice_props_a_1793121182087.jpg",
    "props_b": "toonoffice_props_b_1793121202369.jpg",
    "char_artist": "toonoffice_char_artist_1793121293856.jpg",
    "char_pd": "toonoffice_char_pd_1793121381329.jpg",
    "char_writer": "toonoffice_char_writer_1793121426814.jpg",
    "char_colorist": "toonoffice_char_colorist_1793121447513.jpg",
    "char_bgartist": "toonoffice_char_bgartist_1793121474053.jpg",
}

# (시트, 원화 좌표 사각형 x0, y0, x1, y1, 후처리)
OBJECTS: dict[str, tuple[str, tuple[int, int, int, int], str | None]] = {
    "desk-artist": ("desks", (20, 80, 285, 335), None),
    "desk-inking": ("desks", (280, 70, 515, 335), None),
    "desk-colorist": ("desks", (512, 70, 755, 335), None),
    "desk-3d": ("desks", (752, 70, 1004, 335), None),
    "desk-lettering": ("desks", (20, 620, 272, 950), None),
    "desk-producer": ("desks", (270, 715, 514, 950), None),
    "desk-writer": ("desks", (512, 715, 756, 950), None),
    "reception-desk": ("desks", (752, 740, 1004, 950), None),
    "storyboard-wall": ("furniture", (20, 140, 335, 462), None),
    "review-screen": ("furniture", (335, 105, 532, 462), None),
    "kanban-board": ("furniture", (535, 165, 792, 462), None),
    "bookshelf": ("furniture", (795, 115, 1004, 462), None),
    "table-round": ("furniture", (50, 492, 302, 732), None),
    "table-conference": ("furniture", (342, 512, 762, 732), None),
    "printer-station": ("furniture", (528, 735, 787, 968), None),
    "focus-booth": ("furniture", (795, 532, 1004, 1004), None),
    "coffee-machine": ("pantry", (25, 35, 307, 322), None),
    "vending-machine": ("pantry", (318, 22, 507, 322), None),
    "sofa": ("pantry", (518, 66, 848, 302), None),
    "filing-cabinet": ("pantry", (858, 28, 1004, 322), None),
    "comic-box": ("pantry", (25, 772, 287, 998), None),
    "supply-cart": ("pantry", (312, 700, 507, 998), None),
    "side-table": ("pantry", (548, 768, 732, 998), None),
    "partition": ("pantry", (762, 712, 1004, 998), None),
    "rug-rect": ("decor", (38, 42, 302, 502), "rotate"),
    "rug-round": ("decor", (300, 122, 592, 412), None),
    "poster": ("decor", (598, 78, 802, 322), None),
    "wall-clock": ("decor", (803, 88, 988, 272), None),
    "window": ("decor", (33, 618, 362, 937), None),
    "neon-balloon": ("decor", (358, 718, 537, 884), None),
    "pinboard": ("decor", (533, 708, 807, 897), None),
    "wall-tv": ("decor", (812, 622, 994, 952), None),
    "water-cooler": ("props_a", (333, 92, 462, 422), None),
    "beanbag": ("props_a", (42, 706, 288, 934), None),
    "plant-monstera": ("props_a", (298, 566, 542, 934), None),
    "floor-lamp": ("props_a", (582, 566, 712, 934), None),
    "chair-back": ("props_b", (38, 138, 262, 472), None),
    "chair-front": ("props_b", (278, 78, 507, 472), None),
    "exercise-ball": ("props_b", (762, 232, 988, 432), None),
    "paper-bin": ("props_b", (42, 672, 252, 952), None),
    "plant-olive": ("props_b", (518, 556, 757, 952), None),
}

# (원화 시트 키, 측면 골반 분리 비율 hip_rel_y, 측면 단일 다리 폭 px, 서류가방 보존 여부)
CHARACTERS: dict[str, tuple[str, float, float, bool]] = {
    "artist": ("char_artist", 0.715, 17.5, False),
    "pd": ("char_pd", 0.725, 18.0, True),
    "writer": ("char_writer", 0.725, 16.5, False),
    "colorist": ("char_colorist", 0.755, 17.5, False),
    "bgartist": ("char_bgartist", 0.715, 19.5, False),
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def chroma_key(image: Image.Image) -> np.ndarray:
    """RGB 원화를 마젠타 키로 RGBA float 배열(0~255)로 바꾼다."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    key = (np.minimum(r, b) - g) / 255.0
    alpha = np.clip((KEY_HIGH - key) / (KEY_HIGH - KEY_LOW), 0.0, 1.0)
    spill = np.clip(np.minimum(r, b) - g, 0.0, None)
    r2 = r - spill * 0.92
    b2 = b - spill * 0.92
    out = np.stack([r2, g, b2, alpha * 255.0], axis=-1)
    return np.clip(out, 0, 255)


def components(mask: np.ndarray, min_area: int) -> list[dict]:
    """4-연결 성분. 각 성분의 bbox·면적·픽셀 목록을 돌려준다."""
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    found: list[dict] = []
    ys, xs = np.nonzero(mask)
    for start_y, start_x in zip(ys.tolist(), xs.tolist()):
        if seen[start_y, start_x]:
            continue
        queue = deque([(start_y, start_x)])
        seen[start_y, start_x] = True
        pixels_y: list[int] = []
        pixels_x: list[int] = []
        while queue:
            y, x = queue.popleft()
            pixels_y.append(y)
            pixels_x.append(x)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
        if len(pixels_y) < min_area:
            continue
        found.append({
            "x0": min(pixels_x), "y0": min(pixels_y), "x1": max(pixels_x) + 1, "y1": max(pixels_y) + 1,
            "area": len(pixels_y), "ys": np.array(pixels_y), "xs": np.array(pixels_x),
        })
    return found


def to_image(rgba: np.ndarray) -> Image.Image:
    return Image.fromarray(np.round(np.clip(rgba, 0, 255)).astype(np.uint8))


def isolate(rgba: np.ndarray, rect: tuple[int, int, int, int]) -> Image.Image:
    """사각형 안 연결 성분(사각형 안에 중심이 있는 것)만 남겨 잘라낸다."""
    x0, y0, x1, y1 = rect
    crop = rgba[y0:y1, x0:x1].copy()
    mask = crop[..., 3] > 24
    keep = np.zeros(mask.shape, dtype=bool)
    for component in components(mask, 24):
        cx = (component["x0"] + component["x1"]) / 2
        cy = (component["y0"] + component["y1"]) / 2
        touches_edge = component["x0"] == 0 or component["y0"] == 0 or component["x1"] == mask.shape[1] or component["y1"] == mask.shape[0]
        if touches_edge and component["area"] < 400:
            continue
        if 0 <= cx <= mask.shape[1] and 0 <= cy <= mask.shape[0]:
            keep[component["ys"], component["xs"]] = True
    grown = keep.copy()
    grown[1:, :] |= keep[:-1, :]
    grown[:-1, :] |= keep[1:, :]
    grown[:, 1:] |= keep[:, :-1]
    grown[:, :-1] |= keep[:, 1:]
    crop[..., 3] = np.where(grown, crop[..., 3], 0)
    ys, xs = np.nonzero(crop[..., 3] > 8)
    if not len(ys):
        raise RuntimeError(f"empty sprite rect {rect}")
    return to_image(crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


def skin_facing(frame: Image.Image) -> str | None:
    """머리 영역 피부색 무게중심이 머리 중심보다 왼쪽이면 left, 오른쪽이면 right."""
    rgba = np.asarray(frame, dtype=np.int32)
    height = rgba.shape[0]
    head = rgba[: max(1, int(height * 0.36))]
    opaque = head[..., 3] > 128
    if not opaque.any():
        return None
    r, g, b = head[..., 0], head[..., 1], head[..., 2]
    skin = opaque & (r > 200) & (g > 150) & (g < 232) & (b > 115) & (b < 215) & (r > g) & (g > b) & (r - b > 25)
    if skin.sum() < 30:
        return None
    _, xs = np.nonzero(opaque)
    head_center = (xs.min() + xs.max()) / 2
    skin_center = np.nonzero(skin)[1].mean()
    if abs(skin_center - head_center) < 1.5:
        return None
    return "left" if skin_center < head_center else "right"


def character_frames(rgba: np.ndarray) -> list[list[Image.Image]]:
    """시트를 4행 × 3열 원화 프레임으로 나눈다. 작은 조각(펜·머리끈)은 가장 가까운 큰 성분에 붙인다."""
    mask = rgba[..., 3] > 40
    found = components(mask, 60)
    big = [component for component in found if component["area"] >= 2500]
    small = [component for component in found if component["area"] < 2500]
    if len(big) != 12:
        raise RuntimeError(f"expected 12 character frames, found {len(big)}")
    for piece in small:
        best = min(big, key=lambda c: max(0, c["x0"] - piece["x1"], piece["x0"] - c["x1"]) + max(0, c["y0"] - piece["y1"], piece["y0"] - c["y1"]))
        gap = max(0, best["x0"] - piece["x1"], piece["x0"] - best["x1"]) + max(0, best["y0"] - piece["y1"], piece["y0"] - best["y1"])
        if gap <= 18:
            best["xs"] = np.concatenate([best["xs"], piece["xs"]])
            best["ys"] = np.concatenate([best["ys"], piece["ys"]])
            best["x0"], best["y0"] = min(best["x0"], piece["x0"]), min(best["y0"], piece["y0"])
            best["x1"], best["y1"] = max(best["x1"], piece["x1"]), max(best["y1"], piece["y1"])
    big.sort(key=lambda c: (c["y0"] + c["y1"]) / 2)
    rows = [sorted(big[index * 3:(index + 1) * 3], key=lambda c: (c["x0"] + c["x1"]) / 2) for index in range(4)]
    frames: list[list[Image.Image]] = []
    for row in rows:
        row_frames = []
        for component in row:
            pad = 2
            x0, y0 = max(0, component["x0"] - pad), max(0, component["y0"] - pad)
            x1, y1 = min(rgba.shape[1], component["x1"] + pad), min(rgba.shape[0], component["y1"] + pad)
            crop = rgba[y0:y1, x0:x1].copy()
            keep = np.zeros(crop.shape[:2], dtype=bool)
            keep[component["ys"] - y0, component["xs"] - x0] = True
            grown = keep.copy()
            grown[1:, :] |= keep[:-1, :]
            grown[:-1, :] |= keep[1:, :]
            grown[:, 1:] |= keep[:, :-1]
            grown[:, :-1] |= keep[:, 1:]
            crop[..., 3] = np.where(grown, crop[..., 3], 0)
            row_frames.append(to_image(crop))
        frames.append(row_frames)
    return frames


def normalize_base_cell(frame: Image.Image) -> np.ndarray:
    """단일 기준 프레임을 머리 중심(x=64)과 발끝 기준선(y=188), 키(174px)로 정규화한 128×192 RGBA 배열로 만든다."""
    arr = np.asarray(frame, dtype=np.float32)
    mask = arr[..., 3] > 24
    ys, xs = np.nonzero(mask)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    crop = frame.crop((x0, y0, x1, y1))
    scale = TARGET_HEIGHT / max(1, crop.height)
    width = max(1, round(crop.width * scale))
    height = TARGET_HEIGHT
    resized = crop.resize((width, height), Image.Resampling.LANCZOS)
    r_arr = np.asarray(resized, dtype=np.float32)
    head_mask = r_arr[: max(1, int(height * 0.42)), :, 3] > 128
    h_xs = np.nonzero(head_mask)[1]
    anchor_x = float((h_xs.min() + h_xs.max()) / 2) if len(h_xs) else width / 2.0

    cell = np.zeros((CELL_H, CELL_W, 4), dtype=np.float32)
    ox = int(round(CELL_W / 2 - anchor_x))
    oy = FOOT_BASELINE - height
    for sy in range(height):
        dy = oy + sy
        if not (0 <= dy < CELL_H):
            continue
        for sx in range(width):
            dx = ox + sx
            if 0 <= dx < CELL_W:
                cell[dy, dx] = r_arr[sy, sx]
    return cell


def extract_single_side_leg(base: np.ndarray, hip_y: int, leg_width: float) -> tuple[np.ndarray, float]:
    """측면 기준 자세에서 외곽선을 보존한 단일 다리 스프라이트와 골반 중심 x를 추출한다."""
    leg = np.zeros_like(base)
    start_y = max(0, hip_y - 6)
    hip_xs: list[float] = []
    for y in range(hip_y + 2, min(CELL_H, hip_y + 18)):
        xs = np.nonzero(base[y, :, 3] > 64)[0]
        if len(xs):
            hip_xs.append(0.5 * (float(xs.min()) + float(xs.max())))
    hip_cx = float(np.median(hip_xs)) if hip_xs else 64.0

    for y in range(start_y, CELL_H):
        row = base[y]
        xs = np.nonzero(row[:, 3] > 32)[0]
        if len(xs) < 3:
            continue
        x0, x1 = float(xs.min()), float(xs.max())
        if y < hip_y + 13 and (x1 - x0) > 35:
            x1 = min(x1, hip_cx + 14.0)
        if y < hip_y + 10 and (x1 - x0) > 32 and (hip_cx - x0) > 16:
            x0 = max(x0, hip_cx - 12.0)

        span = max(1.0, x1 - x0)
        shoe_t = float(np.clip((y - (FOOT_BASELINE - 14)) / 6.0, 0.0, 1.0))
        desired_w = leg_width * (1.0 + 0.30 * shoe_t)
        new_span = min(span, desired_w)
        cx = hip_cx + 2.2 * shoe_t
        dst_x0 = cx - new_span / 2.0
        outline_w = 2.8

        for dx in range(max(0, int(dst_x0) - 1), min(CELL_W, int(dst_x0 + new_span) + 2)):
            pos = dx - dst_x0
            if 0.0 <= pos <= new_span:
                if span > new_span + 3.5:
                    if pos < outline_w:
                        sx = x0 + pos
                    else:
                        rem = (pos - outline_w) / max(1e-4, new_span - outline_w)
                        front_start = x1 - (new_span - outline_w)
                        sx = front_start + rem * (new_span - outline_w)
                else:
                    sx = x0 + (pos / max(1e-4, new_span)) * span
                ix = int(math.floor(sx))
                fx = sx - ix
                if 0 <= ix < CELL_W - 1:
                    leg[y, dx] = row[ix] * (1.0 - fx) + row[ix + 1] * fx
    return leg, hip_cx


def sample_bilinear(img: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    height, width, _ = img.shape
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = x0 + 1
    y1 = y0 + 1
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    valid00 = (x0 >= 0) & (x0 < width) & (y0 >= 0) & (y0 < height)
    valid10 = (x1 >= 0) & (x1 < width) & (y0 >= 0) & (y0 < height)
    valid01 = (x0 >= 0) & (x0 < width) & (y1 >= 0) & (y1 < height)
    valid11 = (x1 >= 0) & (x1 < width) & (y1 >= 0) & (y1 < height)
    x0c = np.clip(x0, 0, width - 1)
    x1c = np.clip(x1, 0, width - 1)
    y0c = np.clip(y0, 0, height - 1)
    y1c = np.clip(y1, 0, height - 1)
    v00 = np.where(valid00[..., None], img[y0c, x0c], 0.0)
    v10 = np.where(valid10[..., None], img[y0c, x1c], 0.0)
    v01 = np.where(valid01[..., None], img[y1c, x0c], 0.0)
    v11 = np.where(valid11[..., None], img[y1c, x1c], 0.0)
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy


def alpha_over(dst: np.ndarray, src: np.ndarray) -> np.ndarray:
    sa = src[..., 3:4] / 255.0
    da = dst[..., 3:4] / 255.0
    out_a = sa + da * (1.0 - sa)
    safe_a = np.where(out_a > 1e-5, out_a, 1.0)
    out_rgb = (src[..., :3] * sa + dst[..., :3] * da * (1.0 - sa)) / safe_a
    out = np.concatenate([out_rgb, out_a * 255.0], axis=-1)
    return np.where(out_a > 1e-5, out, 0.0)


def synthesize_front_back_frame(base: np.ndarray, phase: float) -> np.ndarray:
    """정면(down)·후면(up) 8프레임 보행 합성."""
    yy, xx = np.meshgrid(np.arange(CELL_H, dtype=np.float32), np.arange(CELL_W, dtype=np.float32), indexing="ij")
    top_y = FOOT_BASELINE - TARGET_HEIGHT
    rel_y = np.clip((yy - top_y) / TARGET_HEIGHT, 0.0, 1.0)
    s = math.sin(phase)

    bob_y = -abs(s) * 2.8
    sway_x = s * 1.6

    head_w = np.clip((0.50 - rel_y) / 0.06, 0.0, 1.0)
    torso_w = np.sin(np.clip((rel_y - 0.46) / 0.28, 0.0, 1.0) * math.pi)
    leg_t = np.clip((rel_y - 0.69) / 0.31, 0.0, 1.0)
    arm_w = np.clip((np.abs(xx - 64.0) - 9.0) / 20.0, 0.0, 1.0) * torso_w

    side = np.tanh((xx - 64.0) / 2.2)
    leg_phase = -side * s

    lift = np.maximum(0.0, leg_phase) * 12.5 * (leg_t ** 1.12)
    plant = np.maximum(0.0, -leg_phase) * 2.8 * leg_t
    dy_leg = -lift + plant
    dx_leg = side * np.maximum(0.0, leg_phase) * 2.0 * leg_t

    dy_arm = side * s * 6.4 * arm_w
    dx_arm = -s * 2.2 * arm_w
    dx_head = s * 1.1 * head_w

    src_x = xx - (sway_x * (1.0 - 0.45 * head_w) + dx_leg + dx_arm + dx_head)
    src_y = yy - (bob_y + dy_leg + dy_arm)

    sampled = sample_bilinear(base, src_x, src_y)
    shade_factor = 1.0 - 0.15 * np.maximum(0.0, leg_phase) * np.clip((rel_y - 0.72) / 0.15, 0.0, 1.0)
    sampled[..., :3] = np.clip(sampled[..., :3] * shade_factor[..., None], 0.0, 255.0)
    return sampled


def synthesize_side_frame(
    base: np.ndarray,
    single_leg: np.ndarray,
    hip_cx: float,
    hip_rel_y: float,
    phase: float,
    keep_briefcase: bool = False,
) -> np.ndarray:
    """측면(right) 골반 회전 + 무릎 굽힘 2관절 교차 보행 합성."""
    yy, xx = np.meshgrid(np.arange(CELL_H, dtype=np.float32), np.arange(CELL_W, dtype=np.float32), indexing="ij")
    top_y = FOOT_BASELINE - TARGET_HEIGHT
    rel_y = np.clip((yy - top_y) / TARGET_HEIGHT, 0.0, 1.0)
    s = math.sin(phase)
    bob_y = -abs(s) * 2.8

    hip_x = hip_cx
    hip_y = float(top_y + TARGET_HEIGHT * hip_rel_y)

    upper_alpha = np.clip(((hip_rel_y + 0.008) - rel_y) / 0.012, 0.0, 1.0)
    if keep_briefcase:
        briefcase_keep = (xx > hip_x + 5.0) & (rel_y < 0.79)
        upper_alpha = np.where(briefcase_keep, 1.0, upper_alpha)

    upper_src = base.copy()
    upper_src[..., 3] *= upper_alpha

    leg_alpha = np.clip((rel_y - (hip_rel_y - 0.025)) / 0.015, 0.0, 1.0)
    leg_src = single_leg.copy()
    leg_src[..., 3] *= leg_alpha

    def render_rotated_leg(leg_phi: float, brightness: float) -> np.ndarray:
        ls = math.sin(leg_phi)
        lc = math.cos(leg_phi)
        theta_hip = ls * 0.35
        knee_bend = max(0.0, lc) * 0.24
        lift_y = -max(0.0, lc) * 4.2 - abs(ls) * 1.2

        dx = xx - hip_x
        dy = yy - (hip_y + bob_y + lift_y)
        knee_t = np.clip((dy - 14.0) / 32.0, 0.0, 1.0)
        theta = theta_hip - knee_bend * knee_t
        cos_t = np.cos(theta)
        sin_t = np.sin(theta)
        src_dx = dx * cos_t - dy * sin_t
        src_dy = dx * sin_t + dy * cos_t
        sx = hip_x + src_dx
        sy = hip_y + src_dy
        out = sample_bilinear(leg_src, sx, sy)
        out[..., :3] = np.clip(out[..., :3] * brightness, 0.0, 255.0)
        return out

    far_leg = render_rotated_leg(phase + math.pi, 0.76)
    near_leg = render_rotated_leg(phase, 1.0)

    shoulder_x = hip_x
    arm_radial = np.exp(-((xx - shoulder_x) ** 2) / (2.0 * (13.5 ** 2))) * np.sin(np.clip((rel_y - 0.47) / 0.25, 0.0, 1.0) * math.pi)
    dx_arm = -s * 6.5 * arm_radial
    dy_arm = -abs(s) * 1.5 * arm_radial
    ux = xx - dx_arm
    uy = yy - (bob_y + dy_arm)
    upper = sample_bilinear(upper_src, ux, uy)

    combined = alpha_over(far_leg, near_leg)
    combined = alpha_over(combined, upper)
    return combined


def build_character(rgba: np.ndarray, hip_rel_y: float, leg_width: float, keep_briefcase: bool) -> tuple[Image.Image, dict]:
    frames = character_frames(rgba)
    down_base = normalize_base_cell(frames[0][0])
    side_raw = frames[2][0]
    facing = skin_facing(side_raw)
    if facing == "left":
        side_raw = side_raw.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    right_raw_base = normalize_base_cell(side_raw)
    hip_y = int((FOOT_BASELINE - TARGET_HEIGHT) + TARGET_HEIGHT * hip_rel_y)
    single_leg, hip_cx = extract_single_side_leg(right_raw_base, hip_y, leg_width=leg_width)
    right_base = synthesize_side_frame(right_raw_base, single_leg, hip_cx, hip_rel_y, 0.0, keep_briefcase=keep_briefcase)
    up_base = normalize_base_cell(frames[3][0])

    sheet = Image.new("RGBA", (CELL_W * CHAR_COLS, CELL_H * CHAR_ROWS), (0, 0, 0, 0))
    for col in range(CHAR_COLS):
        if col == 0:
            d_f, r_f, u_f = down_base, right_base, up_base
        else:
            phi = ((col - 1) / float(CHAR_COLS - 1)) * math.pi * 2.0
            d_f = synthesize_front_back_frame(down_base, phi)
            r_f = synthesize_side_frame(right_raw_base, single_leg, hip_cx, hip_rel_y, phi, keep_briefcase=keep_briefcase)
            u_f = synthesize_front_back_frame(up_base, phi)
        l_f = r_f[:, ::-1, :].copy()
        for row_idx, arr in enumerate((d_f, l_f, r_f, u_f)):
            sheet.alpha_composite(to_image(arr), (col * CELL_W, row_idx * CELL_H))

    return sheet, {"cols": CHAR_COLS, "rows": CHAR_ROWS, "facing": f"{facing or '?'}->right", "hipCx": round(hip_cx, 2)}


def build_hq_preview(objects: dict[str, Image.Image], characters: dict[str, Image.Image]) -> Image.Image:
    """웹툰 스튜디오 본사(toon-hq) 갤러리 카드용 640×360 프리뷰 이미지를 합성한다."""
    width, height = 640, 360
    canvas = Image.new("RGBA", (width, height), (220, 187, 146, 255))
    draw = ImageDraw.Draw(canvas)
    # 바닥 플랭크 줄무늬와 북쪽 벽면
    for y in range(96, height, 18):
        draw.line([(0, y), (width, y)], fill=(185, 145, 104, 255), width=1)
    draw.rectangle([0, 0, width, 96], fill=(238, 228, 211, 255))
    draw.rectangle([0, 0, width, 14], fill=(95, 76, 61, 255))
    draw.rectangle([0, 88, width, 96], fill=(154, 128, 102, 255))

    def paste_sprite(img: Image.Image, cx: int, base_y: int, target_w: int) -> None:
        aspect = img.height / max(1, img.width)
        tw = max(1, target_w)
        th = max(1, round(tw * aspect))
        resized = img.resize((tw, th), Image.Resampling.LANCZOS)
        canvas.alpha_composite(resized, (round(cx - tw / 2), round(base_y - th)))

    paste_sprite(objects["window"], 130, 82, 110)
    paste_sprite(objects["wall-clock"], 320, 62, 38)
    paste_sprite(objects["window"], 510, 82, 110)
    paste_sprite(objects["rug-round"], 320, 292, 170)
    paste_sprite(objects["storyboard-wall"], 110, 165, 125)
    paste_sprite(objects["kanban-board"], 530, 165, 120)
    paste_sprite(objects["desk-artist"], 220, 236, 132)
    paste_sprite(objects["desk-colorist"], 420, 236, 132)
    paste_sprite(objects["plant-monstera"], 52, 318, 66)
    paste_sprite(objects["sofa"], 320, 326, 145)
    paste_sprite(objects["exercise-ball"], 565, 318, 46)

    for key, cx, by, col, row in (("artist", 215, 275, 2, 2), ("pd", 320, 265, 0, 0), ("colorist", 435, 278, 6, 1)):
        sheet = characters[key]
        cell = sheet.crop((col * CELL_W, row * CELL_H, (col + 1) * CELL_W, (row + 1) * CELL_H))
        paste_sprite(cell, cx, by, 58)

    return canvas


def save_webp(image: Image.Image, path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=90, method=6, exact=False)
    return sha256_bytes(path.read_bytes())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    args = parser.parse_args()
    keyed: dict[str, np.ndarray] = {}
    source_hashes: dict[str, str] = {}
    for sheet, file_name in SOURCES.items():
        path = args.source_dir / file_name
        if not path.exists():
            raise SystemExit(f"missing source sheet: {path}")
        source_hashes[sheet] = sha256_bytes(path.read_bytes())
        keyed[sheet] = chroma_key(Image.open(path))

    manifest: dict = {
        "version": 2,
        "cell": {"width": CELL_W, "height": CELL_H, "cols": CHAR_COLS, "rows": CHAR_ROWS},
        "sources": source_hashes,
        "objects": {},
        "characters": {},
    }
    built_objects: dict[str, Image.Image] = {}
    for key, (sheet, rect, post) in OBJECTS.items():
        sprite = isolate(keyed[sheet], rect)
        if post == "rotate":
            sprite = sprite.rotate(90, expand=True)
        built_objects[key] = sprite
        digest = save_webp(sprite, OUT_DIR / "objects" / f"{key}.webp")
        manifest["objects"][key] = {"width": sprite.width, "height": sprite.height, "sha256": digest}
        print(f"object {key:18s} {sprite.width}x{sprite.height}")

    built_chars: dict[str, Image.Image] = {}
    for name, (sheet, hip_rel_y, leg_width, keep_briefcase) in CHARACTERS.items():
        image, info = build_character(keyed[sheet], hip_rel_y, leg_width, keep_briefcase)
        built_chars[name] = image
        digest = save_webp(image, OUT_DIR / "characters" / f"{name}.webp")
        manifest["characters"][name] = {"width": image.width, "height": image.height, "sha256": digest, **info}
        print(f"character {name:10s} {image.width}x{image.height} info={info}")

    preview = build_hq_preview(built_objects, built_chars)
    preview_digest = save_webp(preview, OUT_DIR / "hq-preview.webp")
    manifest["preview"] = {"width": preview.width, "height": preview.height, "sha256": preview_digest}
    print(f"preview hq-preview.webp {preview.width}x{preview.height}")

    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main()
