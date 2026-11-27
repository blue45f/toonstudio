"""ToonStudio Character Kit v2 — 12종 3계층 베지어 커브 모듈러 웹툰 헤어 생성기 (Blender 5.3 헤드리스).

설계 정본: `loop-stack/competitor-parity/blender-3d-plan.md` §3.4

12종 웹툰 헤어:
  1. `soft-bob`          — 시스루뱅 소프트 보브 (female-romance)
  2. `romance-long`      — 웨이브 롱 헤어 (female-romance)
  3. `hime-cut`          — 히메컷 스트레이트 (female-romance)
  4. `action-pony`       — 하이 포니테일 (female-romance)
  5. `twin-tail`         — 로우/하이 트윈테일 (female-romance)
  6. `short-layered`     — 내추럴 숏 레이어드 (female-romance)
  7. `wolf-layered`      — 울프 레이어드 컷 (female-romance)
  8. `dandy-two-block`   — 투블럭 댄디컷 (남) (male-webtoon)
  9. `comma-hair`        — 쉼표머리 가르마 (남) (male-webtoon)
 10. `slicked-back-duke` — 반깐·올백 노블컷 (남) (male-webtoon)
 11. `braided-crown`     — 로판 브레이드 업스타일 (female-romance)
 12. `murim-topknot`     — 무협 반묶음 장발 (male-webtoon)

핵심 불변 규격:
- 3계층 입체 커브 조형(단순 삼각 판대기 금지):
  Layer 0: 닫힌 수밀 솔리드 두피 볼륨 캡(boundary=0, nonmanifold=0)
  Layer 1: 베이스 볼륨층(넓은 크레센트/아몬드 단면 베지어 커브 스윕)
  Layer 2: 미드 청크층(입체 능선 아몬드/다이아몬드 단면 + 3가닥 땋기/번/상투/포니·트윈테일)
  Layer 3: 앞머리·옆머리·잔머리 실루엣층(장르 시그니처 앞머리·애교머리·히메 사이드·쉼표 컬·포인트 잔머리)
- 각 헤어 3단 LOD: `TS_AuthoredHair_<style>_LOD0` (8k~14k tris), `LOD1` (4k~6k tris), `LOD2` (1.5k~2.5k tris).
- 68본 계약 스켈레톤 스키닝(`mixamorig:*` 65 + `TS_Jaw` + `TS_Eye.L/R`), 정점당 최대 4본, 합 정확히 1.0.
- 14개 morph 타깃: 머리 부착 체형 8개(`param:{height,legLength,neckLength,headSize}:±`)
  + 파츠 형태 3종×2(`shape:bang-length:±`, `shape:volume:±`, `shape:sway:±`).
- 코덱 규약: 오직 `KHR_mesh_quantization` 단독(Draco/meshopt/KTX2/WebP 전면 금지), raw int16 SHORT min/max 바운드.
- `UV0.v`: 모든 가닥 뿌리(0.02) → 끝(0.98) 엄격 단조 증가 + 아일랜드 마진 >= 0.015(`[0.018, 0.982]`).
  `UV1`: `hair-flow`(U=층 부호, V=정규화 호 길이), `COLOR_0`: 회색 AO VEC3(알파 없음).
- VRM 1.0 호환 SpringBone 메타데이터(GLB `extras.toonstudio_springBone` + 사이드카 JSON).
- Blender 5.3 `BLENDER_EEVEE` 12종 프리뷰 컨택트시트(`hair-12-sheet.png` + 후측면 검수시트).

실행:
    /Users/hjunkim/.local/bin/blender --background --factory-startup --python-exit-code 42 \
        --python tools/blender/character_kit/forge_hair_v2.py -- \
        --out-dir data/character-studio-assets/characters/toonstudio-kit-v2/parts/hair \
        --preview-sheet loop-stack/competitor-parity/previews/char/hair-12-sheet.png
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import zlib
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Callable

import bmesh
import bpy
import numpy as np
from mathutils import Vector

_THIS_DIR = Path(__file__).resolve().parent
_BLENDER_TOOLS_DIR = _THIS_DIR.parent
if str(_BLENDER_TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(_BLENDER_TOOLS_DIR))

from character_kit import build_base_v2 as bb2  # noqa: E402
from character_kit import build_expressions_v2 as expr  # noqa: E402
from character_kit import garment_fit as gf  # noqa: E402
from character_kit.qa_character_gate import GlbReader, eval_skin_matrices  # noqa: E402
from character_kit.surface import Surface, vertex_normals  # noqa: E402

# ---------------------------------------------------------------------------
# 상수 & 스타일 레지스트리 (blender-3d-plan.md §3.4 1:1 정합)
# ---------------------------------------------------------------------------

HAIR_MORPHS_8: tuple[str, ...] = (
    "param:height:+",
    "param:height:-",
    "param:legLength:+",
    "param:legLength:-",
    "param:neckLength:+",
    "param:neckLength:-",
    "param:headSize:+",
    "param:headSize:-",
)

SHAPE_SLIDERS_V2: tuple[str, ...] = ("bang-length", "volume", "sway")
SHAPE_MORPHS_6: tuple[str, ...] = tuple(f"shape:{name}:{sign}" for name in SHAPE_SLIDERS_V2 for sign in ("+", "-"))
ALL_HAIR_MORPHS_14: tuple[str, ...] = HAIR_MORPHS_8 + SHAPE_MORPHS_6

ZONES: tuple[str, ...] = ("hair", "hair-tip", "hair-accent")
ZONE_COLOR_KEYS: dict[str, str] = {"hair": "hair", "hair-tip": "hairTip", "hair-accent": "hairAccent"}

PART_LIMIT_BYTES = 1_572_864  # 1.5 MiB (KIT_BUDGET.partGlbMaxBytes)
TEXTURE_SIZE = 512
TEXTURE_COLUMNS = 4
UV_MARGIN = 0.018  # >= 0.015 불변 마진
UV_V_MIN = 0.020
UV_V_MAX = 0.980
BAND_V = (0.30, 0.42)
BAND_HALF_M = 0.0085
TEXTURE_MIN_MEAN = 0.80

CAP_INNER_OFFSET_M = 0.0008  # 두피 표면 위 0.8 mm (관통 0)
CAP_OUTER_OFFSET_M = 0.0028  # 두피 볼륨 캡 겉면 2.8 mm (수밀 솔리드 두께 2.0 mm)
LOCK_CLEARANCE_M = 0.0018
VERTEX_MIN_DISTANCE_M = 0.0006
RING_ABOVE_CENTER_M = 0.046

FORBIDDEN_EXTENSIONS: frozenset[str] = frozenset(
    {
        "KHR_draco_mesh_compression",
        "EXT_meshopt_compression",
        "KHR_texture_basisu",
        "EXT_texture_webp",
    }
)


@dataclass(frozen=True)
class HairStyleMeta:
    style_id: str
    label_ko: str
    genre: str
    default_base: str
    preview_hex: str
    preview_tip_hex: str
    preview_accent_hex: str
    lod_density: tuple[float, float, float]  # LOD0/1/2 간격 스케일(트라이앵글 예산 조율)
    spring_summary_ko: str


HAIR_STYLES_12: tuple[HairStyleMeta, ...] = (
    HairStyleMeta(
        "soft-bob",
        "시스루뱅 소프트 보브",
        "학원·로맨스",
        "female-romance",
        "#4E332A",
        "#5A3C32",
        "#3A241E",
        (0.95, 0.85, 0.84),
        "좌/우 옆머리 2체인",
    ),
    HairStyleMeta(
        "romance-long",
        "웨이브 롱 헤어",
        "로맨스·로판",
        "female-romance",
        "#6B2E40",
        "#78374A",
        "#4A1D2B",
        (1.44, 1.34, 1.04),
        "뒷머리 4 + 옆머리 2",
    ),
    HairStyleMeta(
        "hime-cut",
        "히메컷 스트레이트",
        "학원·미스터리",
        "female-romance",
        "#1E2030",
        "#25283C",
        "#141622",
        (1.06, 1.02, 0.94),
        "뒷머리 3 + 옆머리 2",
    ),
    HairStyleMeta(
        "action-pony",
        "하이 포니테일",
        "액션·스포츠",
        "female-romance",
        "#8B3424",
        "#9C3E2C",
        "#D44B4B",
        (0.98, 0.96, 1.00),
        "포니테일 3 + 옆머리 2",
    ),
    HairStyleMeta(
        "twin-tail",
        "로우/하이 트윈테일",
        "학원·아이돌",
        "female-romance",
        "#C78B67",
        "#D49A76",
        "#D65A7C",
        (0.96, 0.96, 1.04),
        "좌/우 테일 4체인",
    ),
    HairStyleMeta(
        "short-layered",
        "내추럴 숏 레이어드",
        "일상·현대",
        "female-romance",
        "#5D493D",
        "#695346",
        "#41322A",
        (0.62, 0.56, 0.56),
        "앞머리 1체인",
    ),
    HairStyleMeta(
        "wolf-layered",
        "울프 레이어드 컷",
        "액션·학원",
        "female-romance",
        "#252D3D",
        "#2E394E",
        "#1A202D",
        (0.94, 0.84, 0.88),
        "뒷목 2 + 옆머리 2",
    ),
    HairStyleMeta(
        "dandy-two-block",
        "투블럭 댄디컷 (남)",
        "현대·학원 남주",
        "male-webtoon",
        "#2F2522",
        "#3A2E2A",
        "#1E1715",
        (0.56, 0.50, 0.54),
        "앞머리 2체인",
    ),
    HairStyleMeta(
        "comma-hair",
        "쉼표머리 가르마 (남)",
        "오피스·로맨스 남주",
        "male-webtoon",
        "#423128",
        "#4E3B31",
        "#2B201A",
        (0.54, 0.48, 0.52),
        "앞머리 2체인",
    ),
    HairStyleMeta(
        "slicked-back-duke",
        "반깐·올백 노블컷 (남)",
        "로판 북부대공·느와르",
        "male-webtoon",
        "#1C1E26",
        "#252833",
        "#13151C",
        (0.54, 0.48, 0.52),
        "포인트 잔머리 1",
    ),
    HairStyleMeta(
        "braided-crown",
        "로판 브레이드 업스타일",
        "로판 황녀·귀족",
        "female-romance",
        "#D4AE6E",
        "#DFBC7E",
        "#C99636",
        (0.74, 0.72, 0.96),
        "롱 컬 2체인",
    ),
    HairStyleMeta(
        "murim-topknot",
        "무협 반묶음 장발",
        "무협·동양 판타지",
        "male-webtoon",
        "#1B1D24",
        "#242833",
        "#3C9E7D",
        (1.12, 1.08, 1.16),
        "장발 3 + 옆머리 2",
    ),
)
STYLE_META_MAP: dict[str, HairStyleMeta] = {m.style_id: m for m in HAIR_STYLES_12}

# ---------------------------------------------------------------------------
# 결정적 PRNG & 벡터·베지어 커브 수학 도구
# ---------------------------------------------------------------------------


def fnv1a32(text: str) -> int:
    value = 0x811C9DC5
    for byte in text.encode("utf-8"):
        value ^= byte
        value = (value * 0x01000193) & 0xFFFFFFFF
    return value


class Prng:
    """결정적 Mulberry32 난수기 — 형태 슬라이더 변형 간 위상 완전 고정."""

    def __init__(self, seed: int) -> None:
        self._state = int(seed) & 0xFFFFFFFF

    def next(self) -> float:
        self._state = (self._state + 0x6D2B79F5) & 0xFFFFFFFF
        t = self._state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    def uniform(self, lo: float, hi: float) -> float:
        return lo + (hi - lo) * self.next()

    def jitter(self, amount: float) -> float:
        return amount * (2.0 * self.next() - 1.0)


def unit(v: np.ndarray) -> np.ndarray:
    arr = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(arr, axis=-1, keepdims=True)
    return arr / np.maximum(n, 1e-12)


def smoothstep(e0: float, e1: float, x: np.ndarray | float) -> np.ndarray:
    span = e1 - e0
    t = np.clip((np.asarray(x, dtype=np.float64) - e0) / (span if abs(span) > 1e-12 else 1e-12), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def sph(theta_deg: float | np.ndarray, phi_deg: float | np.ndarray) -> np.ndarray:
    """glTF 구면좌표 단위벡터: θ(+Z=0°, +X=+90° 좌측), φ(+Y=0° 정수리)."""
    th = np.radians(theta_deg)
    ph = np.radians(phi_deg)
    return np.stack(np.broadcast_arrays(np.sin(ph) * np.sin(th), np.cos(ph), np.sin(ph) * np.cos(th)), axis=-1).astype(np.float64)


def to_sph(dirs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    d = unit(dirs)
    th = np.mod(np.arctan2(d[..., 0], d[..., 2]), 2.0 * np.pi)
    ph = np.arccos(np.clip(d[..., 1], -1.0, 1.0))
    return th, ph


def rotate_vec(vectors: np.ndarray, axis: np.ndarray, angle: np.ndarray | float) -> np.ndarray:
    v = np.asarray(vectors, dtype=np.float64)
    k = unit(np.broadcast_to(axis, v.shape))
    a = np.broadcast_to(np.asarray(angle, dtype=np.float64), v.shape[:-1])[..., None]
    ca, sa = np.cos(a), np.sin(a)
    return v * ca + np.cross(k, v) * sa + k * np.sum(k * v, axis=-1, keepdims=True) * (1.0 - ca)


def arc_lengths(pts: np.ndarray) -> np.ndarray:
    if len(pts) <= 1:
        return np.zeros(len(pts), dtype=np.float64)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(seg)])


def resample_polyline(pts: np.ndarray, count: int | None = None, spacing: float | None = None) -> np.ndarray:
    pts = np.asarray(pts, dtype=np.float64)
    s = arc_lengths(pts)
    total = float(s[-1])
    if count is None:
        count = max(3, int(math.ceil(total / max(spacing or 0.004, 1e-5))) + 1)
    if total < 1e-9:
        return np.repeat(pts[:1], count, axis=0)
    targets = np.linspace(0.0, total, count)
    return np.stack([np.interp(targets, s, pts[:, k]) for k in range(3)], axis=1)


def eval_cubic_bezier_chain(control_pts: np.ndarray, samples_per_seg: int = 12, tension: float = 0.5) -> np.ndarray:
    """제어점 시퀀스를 C1 연속 3차 베지어 체인(B(t) = (1-t)^3 P0 + 3(1-t)^2 t C1 + 3(1-t) t^2 C2 + t^3 P3)으로 평가한다."""
    pts = np.asarray(control_pts, dtype=np.float64)
    # 중복 연속점 제거(최소 0.5mm 이상 유지)
    keep = [0]
    for i in range(1, len(pts)):
        if float(np.linalg.norm(pts[i] - pts[keep[-1]])) >= 5e-4:
            keep.append(i)
    pts = pts[keep]
    n = len(pts)
    if n < 2:
        return pts
    if n == 2:
        t = np.linspace(0.0, 1.0, max(4, samples_per_seg))[:, None]
        return pts[0] * (1.0 - t) + pts[1] * t

    # 각 제어점의 접선 벡터(Catmull-Rom → Cubic Bézier 변환)
    tangents = np.zeros_like(pts)
    tangents[0] = (pts[1] - pts[0]) * (1.2 * tension)
    tangents[-1] = (pts[-1] - pts[-2]) * (1.2 * tension)
    for i in range(1, n - 1):
        d_prev = max(float(np.linalg.norm(pts[i] - pts[i - 1])), 1e-6)
        d_next = max(float(np.linalg.norm(pts[i + 1] - pts[i])), 1e-6)
        # 구심적(centripetal) 가중 접선으로 급커브 루프/오버슈트 방지
        w0 = d_next / (d_prev + d_next)
        w1 = d_prev / (d_prev + d_next)
        tangents[i] = tension * (w0 * (pts[i] - pts[i - 1]) + w1 * (pts[i + 1] - pts[i])) * 2.0

    ts = np.linspace(0.0, 1.0, samples_per_seg, endpoint=False)[:, None]
    omt = 1.0 - ts
    b0 = omt**3
    b1 = 3.0 * (omt**2) * ts
    b2 = 3.0 * omt * (ts**2)
    b3 = ts**3

    chunks = []
    for i in range(n - 1):
        p0, p3 = pts[i], pts[i + 1]
        c1 = p0 + tangents[i] / 3.0
        c2 = p3 - tangents[i + 1] / 3.0
        chunks.append(b0 * p0 + b1 * c1 + b2 * c2 + b3 * p3)
    chunks.append(pts[-1:])
    return np.vstack(chunks)


def adaptive_bezier_resample(pts: np.ndarray, count: int, curvature_weight: float = 0.020) -> np.ndarray:
    """베지어 평가 곡선을 곡률 적응적으로 `count`개 표본 재샘플(위상 고정)."""
    fine = resample_polyline(pts, spacing=0.0018)
    if len(fine) < 4:
        return resample_polyline(pts, count=count)
    tan = unit(np.diff(fine, axis=0))
    turn = np.concatenate([[0.0], np.arccos(np.clip(np.einsum("ij,ij->i", tan[1:], tan[:-1]), -1.0, 1.0)), [0.0]])
    seg = np.concatenate([[0.0], np.linalg.norm(np.diff(fine, axis=0), axis=1)])
    cost = np.cumsum(seg + curvature_weight * turn)
    targets = np.linspace(0.0, float(cost[-1]), count)
    return np.stack([np.interp(targets, cost, fine[:, k]) for k in range(3)], axis=1)


def smooth_polyline(pts: np.ndarray, iters: int = 2, lam: float = 0.30, fix_root: bool = True, fix_tip: bool = False) -> np.ndarray:
    p = np.array(pts, dtype=np.float64)
    if len(p) < 3:
        return p
    for _ in range(iters):
        mid = 0.5 * (p[:-2] + p[2:])
        p[1:-1] += lam * (mid - p[1:-1])
        if not fix_root:
            p[0] += lam * 0.5 * (p[1] - p[0])
        if not fix_tip and len(p) > 3:
            p[-1] += lam * 0.35 * ((2.0 * p[-2] - p[-3]) - p[-1])
    return p


def parallel_frames(pts: np.ndarray, hints: np.ndarray, twist_deg: float = 0.0) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """평행 이동 Bishop 프레임 + 바깥 법선 힌트 블렌딩."""
    tan = unit(np.gradient(pts, axis=0))
    nrms = np.zeros_like(pts)
    prev = None
    for i in range(len(pts)):
        h = hints[i] - (hints[i] @ tan[i]) * tan[i]
        hl = float(np.linalg.norm(h))
        if prev is None:
            if hl > 0.15:
                n = h / hl
            else:
                alt = np.array([1.0, 0.0, 0.0]) if abs(tan[i, 0]) < 0.85 else np.array([0.0, 0.0, 1.0])
                n = unit(np.cross(tan[i], alt))
        else:
            tr = prev - (prev @ tan[i]) * tan[i]
            tr_l = float(np.linalg.norm(tr))
            tr = tr / max(tr_l, 1e-9)
            blend = float(smoothstep(0.15, 0.50, hl))
            if hl > 1e-6:
                n = unit((1.0 - blend) * tr + blend * (h / hl))
                if float(n @ tr) < 0.0:
                    n = -n
            else:
                n = tr
        nrms[i] = n
        prev = n
    if abs(twist_deg) > 1e-4:
        s = arc_lengths(pts)
        t = s / max(float(s[-1]), 1e-9)
        nrms = rotate_vec(nrms, tan, np.radians(twist_deg) * t)
    binrms = unit(np.cross(tan, nrms))
    return tan, nrms, binrms


# ---------------------------------------------------------------------------
# v2 베이스 GLB 직접 로더 → HeadFrameV2
# ---------------------------------------------------------------------------


def _filter_grid(grid: np.ndarray, r_phi: int, r_theta: int, op: Callable[[np.ndarray, np.ndarray], np.ndarray]) -> np.ndarray:
    out = grid.copy()
    for sh in range(1, r_theta + 1):
        out = op(out, np.roll(grid, sh, axis=1))
        out = op(out, np.roll(grid, -sh, axis=1))
    staged = out.copy()
    padded = np.pad(staged, ((r_phi, r_phi), (0, 0)), mode="edge")
    for sh in range(1, r_phi + 1):
        out = op(out, padded[r_phi - sh : r_phi - sh + len(grid)])
        out = op(out, padded[r_phi + sh : r_phi + sh + len(grid)])
    return out


def _blur_grid(grid: np.ndarray, passes: int = 3) -> np.ndarray:
    out = grid.copy()
    for _ in range(passes):
        out = (out + np.roll(out, 1, axis=1) + np.roll(out, -1, axis=1)) / 3.0
        pad = np.pad(out, ((1, 1), (0, 0)), mode="edge")
        out = (pad[:-2] + pad[1:-1] + pad[2:]) / 3.0
    return out


def _weld(positions: np.ndarray, triangles: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    inv, welded = gf.weld_vertices(np.asarray(positions, dtype=np.float64), tolerance=1e-5)
    return welded, inv[np.asarray(triangles, dtype=np.int64)], inv


def _first_of(inv: np.ndarray, count: int) -> np.ndarray:
    first = np.full(count, -1, dtype=np.int64)
    order = np.arange(len(inv))[::-1]
    first[inv[order]] = order
    return first


@dataclass
class HeadFrameV2:
    archetype_id: str
    glb_path: Path
    center: np.ndarray  # 두개골 구 중심 C (glTF)
    step_deg: float
    r_raw: np.ndarray
    r_skull: np.ndarray
    r_cover: np.ndarray
    marks: dict[str, Any]
    collision: Surface
    collision_field: np.ndarray
    head: Surface
    head_field: np.ndarray
    head_joints: np.ndarray
    head_weights: np.ndarray
    head_deltas: dict[str, np.ndarray]
    head_scale: dict[str, float]
    body: Surface
    body_deltas: dict[str, np.ndarray]
    joint_names: list[str]
    joint_parents: dict[str, str | None]
    joint_tpose: np.ndarray

    def radius(self, directions: np.ndarray, kind: str = "skull") -> np.ndarray:
        grid = {"skull": self.r_skull, "cover": self.r_cover, "raw": self.r_raw}[kind]
        th, ph = to_sph(np.atleast_2d(directions))
        step = math.radians(self.step_deg)
        fp = np.clip(ph / step, 0.0, grid.shape[0] - 1.000001)
        ft = th / step
        i0 = np.floor(fp).astype(int)
        j0 = np.floor(ft).astype(int) % grid.shape[1]
        j1 = (j0 + 1) % grid.shape[1]
        a = fp - i0
        b = ft - np.floor(ft)
        i1 = np.minimum(i0 + 1, grid.shape[0] - 1)
        return (1.0 - a) * ((1.0 - b) * grid[i0, j0] + b * grid[i0, j1]) + a * ((1.0 - b) * grid[i1, j0] + b * grid[i1, j1])

    def scalp(self, directions: np.ndarray, height: np.ndarray | float, kind: str = "skull") -> np.ndarray:
        d = unit(np.atleast_2d(directions))
        return self.center + d * (self.radius(d, kind) + np.asarray(height, dtype=np.float64))[..., None]

    def joint(self, name: str) -> np.ndarray:
        return self.joint_tpose[self.joint_names.index(name)]


def load_v2_head_frame(base_glb: Path, archetype_id: str, step_deg: float = 2.0) -> HeadFrameV2:
    """`toonstudio-kit-v2/bases/<archetype>.glb`에서 두개골 장·랜드마크·충돌 표면·스킨·8 morph를 직접 로드한다."""
    reader = GlbReader(base_glb)
    doc = reader.doc
    skin_d = doc["skins"][0]
    joint_node_ids = list(skin_d["joints"])
    joint_names = [doc["nodes"][ni]["name"] for ni in joint_node_ids]
    _, joint_tpose = eval_skin_matrices(reader, {})
    joint_parents = dict(bb2.SKELETON_PARENTS)

    head_p = reader.mesh_prim("TS_Head")
    body_p = reader.mesh_prim("TS_Body")
    eye_l = reader.mesh_prim("TS_Eye_L")
    eye_r = reader.mesh_prim("TS_Eye_R")
    brow_l = reader.mesh_prim("TS_Brow_L")
    brow_r = reader.mesh_prim("TS_Brow_R")
    lashes = reader.mesh_prim("TS_Lashes")

    head_pos = head_p["positions"].astype(np.float64)
    body_pos = body_p["positions"].astype(np.float64)
    brow_top = float(max(brow_l["positions"][:, 1].max(), brow_r["positions"][:, 1].max()))
    brow_bot = float(min(brow_l["positions"][:, 1].min(), brow_r["positions"][:, 1].min()))

    # 두개골 구 맞춤(눈썹 위)
    cap_pts = head_pos[head_pos[:, 1] > brow_top + 0.010]
    sol, *_ = np.linalg.lstsq(np.c_[2.0 * cap_pts, np.ones(len(cap_pts))], (cap_pts**2).sum(axis=1), rcond=None)
    center = np.array([0.0, float(sol[1]), float(sol[2])], dtype=np.float64)

    head_w, head_tris_w, head_inv = _weld(head_pos, head_p["indices"])
    head_surf = Surface(head_w, head_tris_w)
    head_field = vertex_normals(head_w, head_tris_w)

    # 구면 반지름 격자(2.0° 해상도)
    thetas = np.arange(0.0, 360.0, step_deg)
    phis = np.arange(0.0, 162.0 + 1e-9, step_deg)
    tt, pp = np.meshgrid(thetas, phis)
    dirs = sph(tt.ravel(), pp.ravel())
    reach = 0.40
    hits, tri = head_surf.ray(center + dirs * reach, -dirs, reach)
    radius = np.where(tri >= 0, np.linalg.norm(hits - center, axis=1), np.nan).reshape(tt.shape)
    for i in range(radius.shape[0]):
        bad = np.isnan(radius[i])
        if bad.any():
            radius[i, bad] = radius[i - 1, bad] if i > 0 else np.nanmean(radius[i])
    w_open = max(1, int(round(12.0 / step_deg)))
    opened = _filter_grid(_filter_grid(radius, w_open, w_open, np.minimum), w_open, w_open, np.maximum)
    r_skull = _blur_grid(opened, 3)
    w_dil = max(1, int(round(8.0 / step_deg)))
    dilated = _filter_grid(radius, w_dil, w_dil, np.maximum)
    r_cover = np.maximum(_blur_grid(dilated, 2), r_skull)

    # 해부학 랜드마크 (build_base_v2 ArchetypePlan과 100% 정합)
    plan = bb2.compute_archetype_plan(bb2.ARCHETYPES[archetype_id])
    jmap = dict(zip(joint_names, joint_tpose))
    torso_pts = body_pos[(np.abs(body_pos[:, 0]) < 0.17) & (body_pos[:, 1] > jmap["mixamorig:Hips"][1]) & (body_pos[:, 1] < jmap["mixamorig:Neck"][1])]
    shoulder_top_pts = body_pos[
        (np.abs(body_pos[:, 0]) > 0.065)
        & (np.abs(body_pos[:, 0]) < plan.spec.shoulder_half_w * 1.05)
        & (body_pos[:, 1] > plan.z_shoulder - 0.02)
        & (body_pos[:, 1] < plan.z_neck_base + 0.02)
    ]
    ear_cand = head_pos[(head_pos[:, 0] > np.percentile(head_pos[head_pos[:, 1] > brow_top, 0], 98.5)) & (head_pos[:, 1] < brow_top) & (head_pos[:, 1] > plan.z_chin)]
    marks: dict[str, Any] = {
        "top_y": float(head_pos[:, 1].max()),
        "head_h": float(plan.head_h),
        "brow_top_y": brow_top,
        "brow_bottom_y": brow_bot,
        "brow_front_z": float(max(brow_l["positions"][:, 2].max(), brow_r["positions"][:, 2].max())),
        "brow_outer_x": float(brow_l["positions"][:, 0].max()),
        "eye_center": eye_l["positions"].mean(axis=0).astype(np.float64),
        "eye_top_y": float(eye_l["positions"][:, 1].max()),
        "eye_bottom_y": float(eye_l["positions"][:, 1].min()),
        "eye_inner_x": float(eye_l["positions"][:, 0].min()),
        "eye_outer_x": float(eye_l["positions"][:, 0].max()),
        "eye_front_z": float(eye_l["positions"][:, 2].max()),
        "ear_top_y": float(ear_cand[:, 1].max()) if len(ear_cand) else float(plan.z_eye + 0.008),
        "ear_bottom_y": float(ear_cand[:, 1].min()) if len(ear_cand) else float(plan.z_eye - 0.042),
        "ear_x": float(head_pos[:, 0].max()),
        "chin_y": float(plan.z_chin),
        "nape_y": float(plan.z_chin + plan.head_h * 0.14),
        "neck_base_y": float(plan.z_neck_base),
        "shoulder_y": float(np.percentile(shoulder_top_pts[:, 1], 98.5)) if len(shoulder_top_pts) else float(plan.z_shoulder + 0.03),
        "shoulder_joint_y": float(plan.z_shoulder),
        "shoulder_x": float(plan.spec.shoulder_half_w),
        "chest_y": float(plan.z_chest),
        "waist_y": float(plan.z_waist),
        "back_z": float(np.percentile(torso_pts[:, 2], 0.5)) if len(torso_pts) else -0.11,
        "chest_z": float(np.percentile(torso_pts[:, 2], 99.5)) if len(torso_pts) else 0.10,
        "head_back_z": float(head_pos[:, 2].min()),
        "head_half_width": float(plan.spec.head_w),
        "skull_radius": float(np.median(r_skull[:25])),
    }

    # 충돌 BVH: 몸 + 머리 + 눈 + 눈썹 + 속눈썹
    parts = [
        (body_pos, body_p["indices"]),
        (head_pos, head_p["indices"]),
        (eye_l["positions"].astype(np.float64), eye_l["indices"]),
        (eye_r["positions"].astype(np.float64), eye_r["indices"]),
        (brow_l["positions"].astype(np.float64), brow_l["indices"]),
        (brow_r["positions"].astype(np.float64), brow_r["indices"]),
        (lashes["positions"].astype(np.float64), lashes["indices"]),
    ]
    c_pos, c_tri, off = [], [], 0
    for p, t in parts:
        c_pos.append(p)
        c_tri.append(np.asarray(t, dtype=np.int64) + off)
        off += len(p)
    coll_w, coll_tris_w, _ = _weld(np.vstack(c_pos), np.vstack(c_tri))
    collision = Surface(coll_w, coll_tris_w)
    collision_field = vertex_normals(coll_w, coll_tris_w)

    # 머리/몸 스킨 및 8개 체형 morph 델타 로드
    head_first = _first_of(head_inv, len(head_w))
    head_joints = head_p["joints"][head_first].astype(np.int64)
    head_weights = head_p["weights"][head_first].astype(np.float64)
    h_tnames = head_p["target_names"]
    head_deltas: dict[str, np.ndarray] = {}
    for mname in HAIR_MORPHS_8:
        ti = h_tnames.index(mname)
        raw_d = reader.read_accessor(head_p["targets"][ti]["POSITION"]).astype(np.float64)
        head_deltas[mname] = raw_d[head_first]

    cranium = head_w[:, 1] > brow_top
    head_scale: dict[str, float] = {}
    for mname, delta in head_deltas.items():
        q = head_w[cranium]
        p = q + delta[cranium]
        qc, pc = q - q.mean(axis=0), p - p.mean(axis=0)
        head_scale[mname] = float(np.sum(qc * pc) / max(float(np.sum(qc * qc)), 1e-12))

    body_w, body_tris_w, body_inv = _weld(body_pos, body_p["indices"])
    body_first = _first_of(body_inv, len(body_w))
    b_tnames = body_p["target_names"]
    body_deltas: dict[str, np.ndarray] = {}
    for mname in HAIR_MORPHS_8:
        ti = b_tnames.index(mname)
        raw_d = reader.read_accessor(body_p["targets"][ti]["POSITION"]).astype(np.float64)
        body_deltas[mname] = raw_d[body_first]

    return HeadFrameV2(
        archetype_id=archetype_id,
        glb_path=base_glb,
        center=center,
        step_deg=step_deg,
        r_raw=radius,
        r_skull=r_skull,
        r_cover=r_cover,
        marks=marks,
        collision=collision,
        collision_field=collision_field,
        head=head_surf,
        head_field=head_field,
        head_joints=head_joints,
        head_weights=head_weights,
        head_deltas=head_deltas,
        head_scale=head_scale,
        body=Surface(body_w, body_tris_w),
        body_deltas=body_deltas,
        joint_names=joint_names,
        joint_parents=joint_parents,
        joint_tpose=joint_tpose,
    )


# ---------------------------------------------------------------------------
# 3계층 베지어 커브 헤어 데이터 구조 & 입체 단면 스윕 엔진
# ---------------------------------------------------------------------------


@dataclass
class BezierStrand:
    """베지어 커브 기반 3D 입체 헤어 청크 하나."""

    points: np.ndarray  # 평가된 3D 곡선 점열 (뿌리 → 끝)
    width: float  # 최대 폭(m)
    thickness: float  # 최대 두께(m)
    layer: int  # 1=베이스 볼륨층, 2=미드 청크층, 3=앞·옆머리 실루엣층
    group: str  # bang / side / back / crown / pony / tail / braid / bun / whisp / under
    profile: str = "almond"  # crescent | almond | diamond | blunt | round
    tip: str = "point"  # point | blunt
    taper_len: float = 0.036
    taper_power: float = 0.85
    root_scale: float = 0.78
    thickness_tip: float = 0.38
    twist_deg: float = 0.0
    band_y: float | None = None
    hints: np.ndarray | None = None
    ao: float = 1.0
    accent: bool = False  # True → hair-accent 채널
    tip_frac: float = 0.28  # hair-tip 끝단 염색 비율
    lod2_keep: bool = True  # LOD2 포함 여부(베이스+실루엣은 True, 보조 미드청크는 False)
    sway_scale: float = 1.0  # shape:sway 감도(묶음/상투 본체는 0.15, 늘어진 끝은 1.0)
    spring_chain: str | None = None  # SpringBone 체인 ID(있으면 이 가닥들 중심선으로 체인 생성)

    def length(self) -> float:
        return float(arc_lengths(self.points)[-1])


@dataclass
class SolidOrnament:
    """헤어 장식 수밀 솔리드(머리끈·리본·상투관·옥비녀·로판 장식 띠)."""

    name: str
    positions: np.ndarray
    triangles: np.ndarray
    uvs: np.ndarray
    flow: np.ndarray
    ao: float = 0.88
    zone: int = 2  # 기본 hair-accent
    lod2_keep: bool = True


@dataclass
class SpringChainSpec:
    chain_id: str
    region: str
    stiffness: float = 0.72
    drag_force: float = 0.42
    gravity_power: float = 0.30
    hit_radius: float = 0.018
    num_joints: int = 5


@dataclass
class HairStyleBuild:
    style_id: str
    archetype_id: str
    params: dict[str, float]
    strands: list[BezierStrand]
    ornaments: list[SolidOrnament]
    cap_region: Callable[[np.ndarray], np.ndarray]
    band_y: float
    spring_specs: list[SpringChainSpec]


def default_outward_hint(frame: HeadFrameV2, pts: np.ndarray) -> np.ndarray:
    """두피 위는 두개골 구 중심 C에서 바깥, 아래로 늘어진 곳은 수직 중심축에서 수평 바깥."""
    radial = unit(pts - frame.center)
    horiz = pts - frame.center
    horiz[:, 1] = 0.0
    h_len = np.linalg.norm(horiz, axis=1, keepdims=True)
    horiz = np.where(h_len > 1e-5, horiz / np.maximum(h_len, 1e-5), np.array([0.0, 0.0, -1.0]))
    k = smoothstep(frame.center[1] - 0.02, frame.center[1] - 0.12, pts[:, 1])[:, None]
    return unit((1.0 - k) * radial + k * horiz)


def width_thick_profile(strand: BezierStrand, s: np.ndarray, length: float) -> tuple[np.ndarray, np.ndarray]:
    s = np.asarray(s, dtype=np.float64)
    grow = strand.root_scale + (1.0 - strand.root_scale) * smoothstep(0.0, min(0.022, 0.28 * length), s)
    to_tip = np.maximum(length - s, 0.0)
    if strand.tip == "blunt":
        u = smoothstep(0.006, 0.0, to_tip)
        w = grow * (1.0 - 0.10 * u)
        th = grow * (1.0 - 0.24 * u)
        return np.maximum(w, 0.15), np.maximum(th, 0.22)
    taper = max(min(strand.taper_len, 0.85 * length), 0.004)
    u = np.clip(1.0 - to_tip / taper, 0.0, 1.0)
    shrink = np.clip(1.0 - u, 0.0, 1.0) ** strand.taper_power
    # 끝 직전 링이 0으로 붕괴하지 않도록 안전 하한 보장(zero-area 0개 강제)
    w = grow * np.maximum(shrink, 0.14)
    th = grow * np.maximum(strand.thickness_tip + (1.0 - strand.thickness_tip) * shrink, 0.22)
    return w, th


def eval_cross_section_2d(profile: str, sides: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """입체 단면 2D 프로파일 (x_norm, y_norm, outer_weight, lateral_u) 반환.

    x_norm: 폭 방향 [-1, +1], y_norm: 두께 방향 [-1, +1] (+는 바깥 면, -는 두피쪽 안쪽 면).
    단순 삼각 판대기가 아닌 볼륨감 있는 크레센트·아몬드·다이아몬드 능선 단면을 생성한다.
    """
    alphas = np.linspace(0.0, 2.0 * math.pi, sides, endpoint=False)
    ca = np.cos(alphas)
    sa = np.sin(alphas)
    if profile == "crescent":
        # 베이스 볼륨층: 넓은 초승달 아치형(바깥쪽 부드러운 볼록 + 안쪽 두피 감싸는 완만한 컵)
        x = ca
        y = np.where(sa >= 0.0, 0.82 * sa + 0.24 * (sa**3), 0.42 * sa - 0.16 * (1.0 - ca * ca))
        # 바깥쪽 중심 살짝 솟아오르고 가장자리도 0.35 두께 유지해 튼튼한 수밀 덩어리
        y = np.where(sa < 0.0, np.minimum(y, -0.20 * (1.0 - 0.65 * ca * ca)), y)
    elif profile == "diamond":
        # 샤기/울프/무협/쉼표 앞머리: 중앙 능선이 또렷한 다이아몬드-아몬드 단면(셀 셰이딩 하이라이트 강조)
        x = np.sign(ca) * (np.abs(ca) ** 0.88)
        y = np.where(sa >= 0.0, 0.62 * sa + 0.50 * (sa**3), 0.52 * sa)
    elif profile == "blunt":
        # 히메컷 일자 패널/풀뱅: 살짝 둥글린 직사각-리본 단면
        x = np.sign(ca) * (np.abs(ca) ** 0.62)
        y = np.where(sa >= 0.0, 0.85 * (np.maximum(sa, 0.0) ** 0.72), 0.55 * sa)
    elif profile == "round":
        # 땋은 3가닥 / 상투 코일: 살짝 납작한 풍성한 원형 튜브
        x = ca
        y = 0.88 * sa
    else:
        # 기본 "almond": 정통 한국 웹툰 아몬드-리프 단면(가장자리 깔끔, 바깥면 능선 볼록, 안쪽 완만)
        x = ca
        y = np.where(sa >= 0.0, 0.72 * sa + 0.34 * (sa**3), 0.54 * sa)
    outer = np.clip(sa, -1.0, 1.0)
    lateral = 0.5 + 0.5 * ca
    return x, y, outer, lateral


def collide_strand(frame: HeadFrameV2, strand: BezierStrand, iterations: int = 6) -> BezierStrand:
    """베지어 가닥 가이드 곡선을 충돌 표면 바깥(반두께 + 간격)으로 부드럽게 밀어 관통을 차단한다."""
    pts = resample_polyline(strand.points, spacing=0.0035)
    s = arc_lengths(pts)
    length = max(float(s[-1]), 1e-6)
    _, th_scale = width_thick_profile(strand, s, length)
    clearance = 0.5 * strand.thickness * th_scale + LOCK_CLEARANCE_M
    for it in range(iterations):
        d, _, nrm = gf.signed_distance(pts, frame.collision, frame.collision_field)
        push = np.maximum(clearance - d, 0.0)
        if not (push > 0.0).any():
            break
        pts = pts + push[:, None] * nrm
        if it < iterations - 1:
            pts = smooth_polyline(pts, iters=1, lam=0.28, fix_root=True, fix_tip=False)
    return replace(strand, points=pts)


def apply_sway_to_strand(frame: HeadFrameV2, strand: BezierStrand, sway_val: float) -> BezierStrand:
    """`shape:sway` (±1) 변형: 뿌리는 두피에 0mm 고정하고 호 길이를 따라 바람결 아크로 자연스럽게 휘어지게 한다."""
    if abs(sway_val) < 1e-6 or strand.sway_scale <= 0.0:
        return strand
    pts = strand.points.copy()
    s = arc_lengths(pts)
    length = max(float(s[-1]), 1e-6)
    t = s / length
    # 뿌리 구간(0~18%) 고정 → 끝으로 갈수록 부드럽게 가속
    env = smoothstep(0.16, 1.0, t) ** 1.35
    # 길이에 비례하되 상한 85mm로 자연스러운 바람결 스웨이
    amp = min(0.085, 0.24 * length) * strand.sway_scale
    dx = sway_val * amp * env
    # 끝이 살짝 위로 들리고 뒤로 살짝 흐르는 역동적 바람 호
    dy = abs(sway_val) * amp * 0.18 * (env**1.5)
    dz = -abs(sway_val) * amp * 0.14 * env
    pts[:, 0] += dx
    pts[:, 1] += dy
    pts[:, 2] += dz
    return collide_strand(frame, replace(strand, points=pts), iterations=4)


@dataclass
class SweptStrand:
    positions: np.ndarray
    triangles: np.ndarray
    t: np.ndarray  # [0, 1] 호 길이 비율
    s: np.ndarray  # 호 길이(m)
    lateral: np.ndarray  # [0, 1] 폭 방향
    outer: np.ndarray  # [-1, +1] 바깥/안쪽
    shade: np.ndarray  # 단면 AO
    env: np.ndarray  # 엔벨로프 법선 힌트
    ring_count: int  # 위상 고정용 링 수


def strand_ring_count(strand: BezierStrand, level: int, density: float) -> int:
    # LOD0: 촘촘, LOD1: 중간, LOD2: 경량
    base_spacing = (0.0155, 0.0265, 0.0440)[level] * density
    if strand.group in ("braid", "bun"):
        base_spacing *= 0.72
    elif strand.layer == 3:
        base_spacing *= 0.88
    length = strand.length()
    lo_n = (6, 5, 4)[level]
    hi_n = (30, 18, 11)[level]
    return int(np.clip(round(length / max(base_spacing, 0.004)) + 1, lo_n, hi_n))


def strand_sides(strand: BezierStrand, level: int) -> int:
    if level == 0:
        if strand.profile in ("crescent", "blunt") or strand.width >= 0.032:
            return 8
        return 6
    if level == 1:
        return 6 if strand.width >= 0.030 else 5
    return 4


def sweep_bezier_strand(
    frame: HeadFrameV2,
    strand: BezierStrand,
    level: int,
    fixed_count: int | None = None,
    fixed_sides: int | None = None,
    density: float = 1.0,
) -> SweptStrand:
    """베지어 가닥 하나를 입체 프로파일(크레센트·아몬드·다이아몬드·블런트·라운드) 수밀 솔리드로 스윕한다."""
    count = strand_ring_count(strand, level, density) if fixed_count is None else fixed_count
    count = max(4, count)
    pts = adaptive_bezier_resample(strand.points, count)
    s = arc_lengths(pts)
    length = max(float(s[-1]), 0.008)
    t = s / length

    if strand.hints is not None:
        s_src = np.linspace(0.0, 1.0, len(strand.hints))
        hints = unit(np.stack([np.interp(t, s_src, strand.hints[:, k]) for k in range(3)], axis=1))
    else:
        hints = default_outward_hint(frame, pts)

    tan, nrms, binrms = parallel_frames(pts, hints, twist_deg=strand.twist_deg)
    sides = strand_sides(strand, level) if fixed_sides is None else fixed_sides
    x2d, y2d, outer2d, lat2d = eval_cross_section_2d(strand.profile, sides)
    w_scale, th_scale = width_thick_profile(strand, s, length)
    half_w = np.maximum(0.5 * strand.width * w_scale, 0.0007)
    half_t = np.maximum(0.5 * strand.thickness * th_scale, 0.0005)

    # 마지막 링은 끝점 직전(point tip) 또는 끝(blunt tip)
    ring_n = count - 1 if strand.tip == "point" else count
    rings = []
    for i in range(ring_n):
        ring_p = pts[i] + np.outer(x2d * half_w[i], binrms[i]) + np.outer(y2d * half_t[i], nrms[i])
        rings.append(ring_p)
    positions = np.vstack(rings)
    vt = np.repeat(t[:ring_n], sides)
    vs = np.repeat(s[:ring_n], sides)
    vlat = np.tile(lat2d, ring_n)
    vout = np.tile(outer2d, ring_n)
    venv = np.repeat(hints[:ring_n], sides, axis=0)
    # 단면 AO: 안쪽 면·양쪽 날개 가장자리를 은은하게 음영 처리
    shade_ring = (1.0 - 0.14 * np.clip(-outer2d, 0.0, 1.0)) * (1.0 - 0.10 * (np.abs(x2d) ** 3))
    vshade = np.tile(shade_ring, ring_n)

    tris: list[list[int]] = []
    for i in range(ring_n - 1):
        base0 = i * sides
        base1 = (i + 1) * sides
        for k in range(sides):
            nk = (k + 1) % sides
            a, b = base0 + k, base0 + nk
            c, d = base1 + k, base1 + nk
            tris.append([a, c, b])
            tris.append([b, c, d])

    # 뿌리 수밀 마개(반드시 ring 0 뒤쪽으로 >= 0.8mm 오프셋 → zero-area 0)
    root_shift = max(0.0008, 0.30 * float(half_t[0]))
    root_pt = pts[0] - tan[0] * root_shift
    root_idx = len(positions)
    positions = np.vstack([positions, root_pt[None, :]])
    vt = np.append(vt, 0.0)
    vs = np.append(vs, 0.0)
    vlat = np.append(vlat, 0.5)
    vout = np.append(vout, -0.5)
    vshade = np.append(vshade, 0.78)
    venv = np.vstack([venv, hints[0][None, :]])
    for k in range(sides):
        tris.append([root_idx, k, (k + 1) % sides])

    # 끝단 수밀 마개(point는 끝점, blunt는 끝 링 앞쪽 >= 0.8mm → zero-area 0)
    last_base = (ring_n - 1) * sides
    if strand.tip == "point":
        tip_pt = pts[-1]
        if float(np.linalg.norm(tip_pt - pts[ring_n - 1])) < 0.0015:
            tip_pt = pts[ring_n - 1] + tan[ring_n - 1] * 0.0018
    else:
        tip_shift = max(0.0008, 0.28 * float(half_t[-1]))
        tip_pt = pts[-1] + tan[-1] * tip_shift
    tip_idx = len(positions)
    positions = np.vstack([positions, tip_pt[None, :]])
    vt = np.append(vt, 1.0)
    vs = np.append(vs, length)
    vlat = np.append(vlat, 0.5)
    vout = np.append(vout, 1.0)
    vshade = np.append(vshade, 0.98)
    venv = np.vstack([venv, hints[-1][None, :]])
    for k in range(sides):
        tris.append([tip_idx, last_base + (k + 1) % sides, last_base + k])

    tri_arr = np.asarray(tris, dtype=np.int64)
    if gf.mesh_signed_volume(positions, tri_arr) < 0.0:
        tri_arr = tri_arr[:, [0, 2, 1]]

    return SweptStrand(
        positions=positions,
        triangles=tri_arr,
        t=vt,
        s=vs,
        lateral=vlat,
        outer=vout,
        shade=vshade,
        env=venv,
        ring_count=count,
    )


# ---------------------------------------------------------------------------
# 닫힌 수밀 솔리드 두피 볼륨 캡 (Layer 0)
# ---------------------------------------------------------------------------


def icosphere(level: int) -> tuple[np.ndarray, np.ndarray]:
    phi_g = (1.0 + math.sqrt(5.0)) / 2.0
    v0 = [
        (-1, phi_g, 0), (1, phi_g, 0), (-1, -phi_g, 0), (1, -phi_g, 0),
        (0, -1, phi_g), (0, 1, phi_g), (0, -1, -phi_g), (0, 1, -phi_g),
        (phi_g, 0, -1), (phi_g, 0, 1), (-phi_g, 0, -1), (-phi_g, 0, 1),
    ]
    f0 = [
        (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
        (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
        (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
        (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
    ]
    verts = [unit(np.array(v, dtype=np.float64)) for v in v0]
    faces = list(f0)
    for _ in range(level):
        cache: dict[tuple[int, int], int] = {}
        nf = []

        def mid(a: int, b: int) -> int:
            key = (min(a, b), max(a, b))
            if key not in cache:
                verts.append(unit(verts[a] + verts[b]))
                cache[key] = len(verts) - 1
            return cache[key]

        for a, b, c in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf.extend([(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)])
        faces = nf
    return np.array(verts, dtype=np.float64), np.array(faces, dtype=np.int64)


def table_hairline(table: list[tuple[float, float]]) -> Callable[[np.ndarray], np.ndarray]:
    xs = np.array([r[0] for r in table], dtype=np.float64)
    ys = np.array([r[1] for r in table], dtype=np.float64)

    def limit(theta_deg: np.ndarray) -> np.ndarray:
        t = np.asarray(theta_deg, dtype=np.float64) % 360.0
        signed = np.where(t > 180.0, t - 360.0, t)
        return np.interp(np.abs(signed), xs, ys)

    def region(dirs: np.ndarray) -> np.ndarray:
        th, ph = to_sph(dirs)
        return np.degrees(ph) <= limit(np.degrees(th))

    region.limit = limit  # type: ignore[attr-defined]
    return region


def build_solid_scalp_cap(
    frame: HeadFrameV2,
    region: Callable[[np.ndarray], np.ndarray],
    level: int,
    volume_q: float = 0.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """해석적 극좌표 격자 기반 닫힌 수밀 솔리드 두피 볼륨 캡(boundary=0, nonmanifold=0, zero-area=0, 관통=0).

    정수리 극점(r=0)에서 매끄러운 머리선 곡선 `limit(theta)`(r=rings)까지 동심 링으로 생성하고
    바깥 껍질(+2.8~3.6mm)과 안쪽 껍질(+0.8mm)의 머리선 경계를 쿼드 림으로 폐합한다.
    모든 간선이 정확히 두 삼각형에서 반대 방향으로 공유되어 비다양체·비연속 감김·목덜미 톱니가 수학적으로 불가능하다.
    """
    rings, sectors = ((9, 32), (6, 20), (5, 18))[level]
    limit_fn = getattr(region, "limit", None)
    thetas = np.linspace(0.0, 360.0, sectors, endpoint=False)
    if limit_fn is not None:
        phi_lim = np.clip(np.asarray(limit_fn(thetas), dtype=np.float64), 32.0, 150.0)
    else:
        phi_lim = np.full(sectors, 110.0, dtype=np.float64)

    # 단일 껍질 방향 벡터: [극점 0] + [링 r=1..rings, 섹터 s=0..sectors-1]
    dirs_list = [np.array([[0.0, 1.0, 0.0]], dtype=np.float64)]
    v_frac_list = [np.array([0.0], dtype=np.float64)]
    for r in range(1, rings + 1):
        # 첫 링이 극점에서 충분히 떨어지도록(최소 ~5.5°) 균등-약가속 분포 → zero-area 0 보장
        frac = (r / rings) ** 0.96
        phis = frac * phi_lim
        dirs_list.append(sph(thetas, phis))
        v_frac_list.append(np.full(sectors, frac, dtype=np.float64))
    dirs = np.vstack(dirs_list)
    v_frac = np.concatenate(v_frac_list)
    n_shell = len(dirs)  # 1 + rings * sectors

    # 바깥쪽 껍질 삼각형(모든 면 일관된 바깥쪽 CCW 감김)
    outer_tris: list[list[int]] = []
    # 정수리 극점 팬 (r=1)
    for s in range(sectors):
        ns = (s + 1) % sectors
        outer_tris.append([0, 1 + s, 1 + ns])
    # 동심 링 쿼드 (r=1..rings-1)
    for r in range(1, rings):
        base0 = 1 + (r - 1) * sectors
        base1 = 1 + r * sectors
        for s in range(sectors):
            ns = (s + 1) % sectors
            a, b = base0 + s, base0 + ns
            c, d = base1 + s, base1 + ns
            outer_tris.append([a, c, b])
            outer_tris.append([b, c, d])
    outer_faces = np.asarray(outer_tris, dtype=np.int64)

    # 두피 표면 투영 (r_skull 기반 매끄러운 볼륨 껍질)
    reach = 0.40
    hits, tri = frame.head.ray(frame.center + dirs * reach, -dirs, reach)
    surf_pts = np.where((tri >= 0)[:, None], hits, frame.scalp(dirs, 0.0, "skull"))
    closest = frame.head.closest(surf_pts)
    nrm = unit(closest.interpolate(frame.head.triangles, frame.head_field))
    # 두피 법선이 중심에서 바깥쪽을 향하도록 안전 보정(귀/목덜미 오목부 역전 차단)
    radial = unit(closest.point - frame.center)
    nrm = np.where(np.einsum("ij,ij->i", nrm, radial)[:, None] < 0.25, radial, nrm)
    nrm = unit(nrm)

    # 정수리 볼륨에 따라 바깥 두께만 미세 확장(안쪽은 항상 0.8mm로 머리 관통 방지, 최소 1.8mm 두께 보장)
    outer_h = CAP_OUTER_OFFSET_M + 0.0012 * max(-0.5, volume_q)
    shell_thick = max(0.0018, outer_h - CAP_INNER_OFFSET_M)
    inner_pts = closest.point + nrm * CAP_INNER_OFFSET_M
    outer_pts = inner_pts + nrm * shell_thick

    # 내벽이 삼각형 중점/변에서 두피를 뚫지 않도록 보정
    for _ in range(4):
        probes = np.vstack([
            inner_pts[outer_faces].mean(axis=1),
            0.5 * (inner_pts[outer_faces[:, 0]] + inner_pts[outer_faces[:, 1]]),
            0.5 * (inner_pts[outer_faces[:, 1]] + inner_pts[outer_faces[:, 2]]),
            0.5 * (inner_pts[outer_faces[:, 2]] + inner_pts[outer_faces[:, 0]]),
        ])
        owners = np.vstack([outer_faces, outer_faces, outer_faces, outer_faces])
        d, _, _ = gf.signed_distance(probes, frame.collision, frame.collision_field)
        bad = d < 0.00068
        if not bad.any():
            break
        lift = np.zeros(n_shell, dtype=np.float64)
        np.maximum.at(lift, owners[bad].ravel(), np.repeat(0.00088 - d[bad], 3))
        inner_pts = inner_pts + nrm * lift[:, None]
        outer_pts = inner_pts + nrm * shell_thick

    # 안쪽 껍질(정확한 반대 감김) + 매끄러운 머리선 경계 림 브리지(바깥 u→v, 안쪽 v_in→u_in과 1:1 상쇄)
    inner_faces = outer_faces[:, [0, 2, 1]] + n_shell
    rim_base = 1 + (rings - 1) * sectors
    rim_tris: list[list[int]] = []
    for s in range(sectors):
        ns = (s + 1) % sectors
        u = rim_base + s
        v = rim_base + ns
        u_in = u + n_shell
        v_in = v + n_shell
        rim_tris.append([v, u, u_in])
        rim_tris.append([v, u_in, v_in])

    positions = np.vstack([outer_pts, inner_pts])
    triangles = np.vstack([outer_faces, inner_faces, np.asarray(rim_tris, dtype=np.int64)])
    if gf.mesh_signed_volume(positions, triangles) < 0.0:
        triangles = triangles[:, [0, 2, 1]]

    # UV0: 뿌리 영역([0.02, 0.14])에 단조 배치해 두피 캡도 램프 어두운 뿌리 톤 유지
    v_cap = np.clip(UV_V_MIN + 0.12 * v_frac, UV_V_MIN, 0.18)
    u_cap = np.full(n_shell, 0.125, dtype=np.float64)
    uv_half = np.stack([u_cap, v_cap], axis=1)
    uvs = np.vstack([uv_half, uv_half])
    flow = np.concatenate([v_cap, v_cap])
    return positions, triangles, uvs, flow


# ---------------------------------------------------------------------------
# 구조 장식 솔리드 빌더(머리끈·리본·상투관·옥비녀·로판 티아라 띠)
# ---------------------------------------------------------------------------


def _closed_ring_mesh(rings: np.ndarray, closed_path: bool, cap_pts: tuple[np.ndarray, np.ndarray] | None) -> tuple[np.ndarray, np.ndarray]:
    n, k, _ = rings.shape
    pos = rings.reshape(-1, 3)
    tris = []
    last = n if closed_path else n - 1
    for i in range(last):
        j = (i + 1) % n
        for c in range(k):
            nc = (c + 1) % k
            a, b = i * k + c, i * k + nc
            cc, d = j * k + c, j * k + nc
            tris.append([a, cc, b])
            tris.append([b, cc, d])
    if not closed_path and cap_pts is not None:
        s0 = len(pos)
        pos = np.vstack([pos, cap_pts[0][None, :], cap_pts[1][None, :]])
        er = (n - 1) * k
        for c in range(k):
            nc = (c + 1) % k
            tris.append([s0, c, nc])
            tris.append([s0 + 1, er + nc, er + c])
    tri = np.asarray(tris, dtype=np.int64)
    if gf.mesh_signed_volume(pos, tri) < 0.0:
        tri = tri[:, [0, 2, 1]]
    return pos, tri


def make_torus_ornament(name: str, center: np.ndarray, axis: np.ndarray, major_r: float, minor_r: float, axial_scale: float = 1.4, segs: int = 20, sides: int = 8) -> SolidOrnament:
    ax = unit(axis)
    hlp = np.array([0.0, 1.0, 0.0]) if abs(ax[1]) < 0.85 else np.array([1.0, 0.0, 0.0])
    u = unit(np.cross(ax, hlp))
    v = np.cross(ax, u)
    rings = np.zeros((segs, sides, 3), dtype=np.float64)
    for i in range(segs):
        a = 2.0 * math.pi * i / segs
        rad = math.cos(a) * u + math.sin(a) * v
        for k in range(sides):
            b = 2.0 * math.pi * k / sides
            rings[i, k] = center + rad * (major_r + minor_r * math.cos(b)) + ax * (minor_r * axial_scale * math.sin(b))
    pos, tri = _closed_ring_mesh(rings, closed_path=True, cap_pts=None)
    u_uv = np.tile(UV_MARGIN + (0.25 - 2 * UV_MARGIN) * (np.arange(sides) / sides), segs)
    v_uv = np.repeat(UV_V_MIN + (UV_V_MAX - UV_V_MIN) * (np.arange(segs) / max(segs - 1, 1)), sides)
    return SolidOrnament(name=name, positions=pos, triangles=tri, uvs=np.stack([u_uv, v_uv], axis=1), flow=v_uv, ao=0.86, zone=2)


def make_ribbon_strip_ornament(
    name: str,
    path: np.ndarray,
    width_dir: np.ndarray,
    normal_dir: np.ndarray,
    widths: np.ndarray,
    thickness: float,
    closed_path: bool = False,
    cols: int = 4,
    notch: float = 0.0,
) -> SolidOrnament:
    n = len(path)
    fs = np.linspace(-1.0, 1.0, cols)
    tan = unit(np.gradient(path, axis=0))
    rings = np.zeros((n, 2 * cols, 3), dtype=np.float64)
    for i in range(n):
        wd = unit(width_dir[i] - (width_dir[i] @ tan[i]) * tan[i])
        nd = unit(normal_dir[i] - (normal_dir[i] @ tan[i]) * tan[i] - (normal_dir[i] @ wd) * wd)
        top, bot = [], []
        for f in fs:
            p = path[i] + wd * (0.5 * widths[i] * f)
            if notch > 0.0 and i == n - 1:
                p = p - tan[i] * notch * (1.0 - abs(f))
            bump = 0.25 * thickness * (1.0 - f * f)
            top.append(p + nd * (0.5 * thickness + bump))
            bot.append(p - nd * (0.5 * thickness))
        rings[i] = np.vstack([np.array(top), np.array(bot[::-1])])
    caps = None
    if not closed_path:
        caps = (
            path[0] - tan[0] * max(0.0008, 0.35 * thickness),
            path[-1] + tan[-1] * max(0.0008, 0.35 * thickness) - (tan[-1] * notch if notch > 0.0 else 0.0),
        )
    pos, tri = _closed_ring_mesh(rings, closed_path=closed_path, cap_pts=caps)
    s = arc_lengths(path)
    t_s = s / max(float(s[-1]), 1e-6)
    lat = np.concatenate([0.5 * (fs + 1.0), 0.5 * (fs[::-1] + 1.0)])
    u = np.tile(UV_MARGIN + (0.25 - 2 * UV_MARGIN) * lat, n)
    v = np.repeat(UV_V_MIN + (UV_V_MAX - UV_V_MIN) * t_s, 2 * cols)
    if not closed_path:
        u = np.concatenate([u, [0.125, 0.125]])
        v = np.concatenate([v, [UV_V_MIN, UV_V_MAX]])
    return SolidOrnament(name=name, positions=pos, triangles=tri, uvs=np.stack([u, v], axis=1), flow=v, ao=0.92, zone=2)


def make_bow_ornaments(prefix: str, center: np.ndarray, out: np.ndarray, up: np.ndarray, side: np.ndarray, scale: float = 1.0) -> list[SolidOrnament]:
    """입체 리본(좌우 루프 + 중앙 매듭 + 제비꼬리 리본 자락 2개) — LOD 예산 최적화."""
    out, up, side = unit(out), unit(up), unit(side)
    th = 0.0022 * scale
    pieces: list[SolidOrnament] = []
    # 좌/우 리본 고리
    for sgn, lbl in ((1.0, "L"), (-1.0, "R")):
        ang = np.linspace(0.0, 2.0 * math.pi, 15)[:-1]
        reach = 0.042 * scale
        x = sgn * 0.5 * reach * (1.0 - np.cos(ang))
        z = 0.012 * scale * np.sin(ang) + 0.005 * scale
        y = 0.006 * scale * 0.5 * (1.0 - np.cos(ang))
        path = center + np.outer(x, side) + np.outer(y, up) + np.outer(z, out)
        far = 0.5 * (1.0 - np.cos(ang))
        widths = (0.011 + 0.020 * (far**0.8)) * scale
        loop_mid = center + side * (sgn * 0.5 * reach) + out * (0.005 * scale)
        nd = unit(path - loop_mid - np.outer((path - loop_mid) @ up, up))
        orn = make_ribbon_strip_ornament(f"{prefix}_loop_{lbl}", path, np.tile(up, (len(path), 1)), nd, widths, th, closed_path=True, cols=3)
        orn.lod2_keep = False
        pieces.append(orn)
    # 리본 자락 2개
    for sgn, lbl in ((1.0, "L"), (-1.0, "R")):
        ts = np.linspace(0.0, 1.0, 7)
        path = center[None, :] + np.outer(sgn * (0.005 + 0.020 * ts) * scale, side) - np.outer((0.005 + 0.056 * ts) * scale, up) + np.outer((0.004 + 0.005 * ts) * scale, out)
        widths = (0.014 + 0.006 * ts) * scale
        wd = np.tile(unit(side * 0.88 - up * sgn * 0.22), (len(path), 1))
        orn = make_ribbon_strip_ornament(f"{prefix}_tail_{lbl}", path, wd, np.tile(out, (len(path), 1)), widths, th, closed_path=False, cols=3, notch=0.006 * scale)
        orn.lod2_keep = False
        pieces.append(orn)
    # 중앙 매듭
    ang = np.linspace(0.0, 2.0 * math.pi, 11)[:-1]
    kpath = center + np.outer(0.009 * scale * np.sin(ang), up) + np.outer(0.0065 * scale * np.cos(ang) + 0.006 * scale, out)
    knd = unit(kpath - (center + out * 0.006 * scale))
    orn_k = make_ribbon_strip_ornament(f"{prefix}_knot", kpath, np.tile(side, (len(kpath), 1)), knd, np.full(len(kpath), 0.013 * scale), th * 1.25, closed_path=True, cols=2)
    orn_k.lod2_keep = True
    pieces.append(orn_k)
    return pieces


def make_tube_ornament(name: str, path: np.ndarray, radii: np.ndarray, sides: int = 8, closed_path: bool = False) -> SolidOrnament:
    n = len(path)
    tan = unit(np.gradient(path, axis=0))
    hlp = np.array([0.0, 1.0, 0.0]) if abs(tan[0, 1]) < 0.85 else np.array([1.0, 0.0, 0.0])
    _, nrms, binrms = parallel_frames(path, np.tile(unit(np.cross(tan[0], hlp)), (n, 1)))
    ang = np.linspace(0.0, 2.0 * math.pi, sides, endpoint=False)
    rings = np.stack([path[i] + np.outer(np.cos(ang) * radii[i], binrms[i]) + np.outer(np.sin(ang) * radii[i], nrms[i]) for i in range(n)])
    caps = None if closed_path else (path[0] - tan[0] * max(0.0008, 0.45 * float(radii[0])), path[-1] + tan[-1] * max(0.0008, 0.45 * float(radii[-1])))
    pos, tri = _closed_ring_mesh(rings, closed_path=closed_path, cap_pts=caps)
    s = arc_lengths(path)
    t_s = s / max(float(s[-1]), 1e-6)
    u = np.tile(UV_MARGIN + (0.25 - 2 * UV_MARGIN) * (ang / (2.0 * math.pi)), n)
    v = np.repeat(UV_V_MIN + (UV_V_MAX - UV_V_MIN) * t_s, sides)
    if not closed_path:
        u = np.concatenate([u, [0.125, 0.125]])
        v = np.concatenate([v, [UV_V_MIN, UV_V_MAX]])
    return SolidOrnament(name=name, positions=pos, triangles=tri, uvs=np.stack([u, v], axis=1), flow=v, ao=0.94, zone=2)


def make_ellipsoid_ornament(name: str, center: np.ndarray, radii: tuple[float, float, float], level: int = 2) -> SolidOrnament:
    dirs, faces = icosphere(level)
    pos = center[None, :] + dirs * np.array(radii, dtype=np.float64)[None, :]
    if gf.mesh_signed_volume(pos, faces) < 0.0:
        faces = faces[:, [0, 2, 1]]
    u = UV_MARGIN + (0.25 - 2 * UV_MARGIN) * (0.5 + 0.5 * dirs[:, 0])
    v = UV_V_MIN + (UV_V_MAX - UV_V_MIN) * (0.5 - 0.5 * dirs[:, 1])
    return SolidOrnament(name=name, positions=pos, triangles=faces, uvs=np.stack([u, v], axis=1), flow=v, ao=0.96, zone=2)


# ---------------------------------------------------------------------------
# 3계층 헤어 스케치 도우미 (SketchV2)
# ---------------------------------------------------------------------------


class SketchV2:
    """두개골 장 기반 3계층 베지어 커브 작도기."""

    def __init__(self, frame: HeadFrameV2, rng: Prng, style_id: str, params: dict[str, float]) -> None:
        self.frame = frame
        self.rng = rng
        self.style_id = style_id
        self.p = params
        self.c = frame.center
        self.m = frame.marks
        self.strands: list[BezierStrand] = []
        self.ornaments: list[SolidOrnament] = []
        self.spring_specs: list[SpringChainSpec] = []
        self.band_y = float(frame.center[1] + RING_ABOVE_CENTER_M)

    def q(self, name: str) -> float:
        return float(self.p.get(name, 0.0))

    @property
    def vol(self) -> float:
        return self.q("volume")

    @property
    def bang_q(self) -> float:
        return self.q("bang-length")

    def add_strand(self, control_pts: np.ndarray, width: float, thickness: float, layer: int, group: str, **kw: Any) -> BezierStrand:
        vol_w = 1.0 + 0.14 * self.vol
        vol_t = 1.0 + 0.24 * self.vol
        pts = eval_cubic_bezier_chain(control_pts, samples_per_seg=10)
        kw.setdefault("band_y", self.band_y)
        st = BezierStrand(points=pts, width=width * vol_w, thickness=thickness * vol_t, layer=layer, group=group, **kw)
        self.strands.append(st)
        return st

    def add_ornament(self, orn: SolidOrnament) -> None:
        self.ornaments.append(orn)

    def add_spring(self, chain_id: str, region: str, *, stiffness: float = 0.72, drag: float = 0.42, gravity: float = 0.30, hit_radius: float = 0.018, joints: int = 5) -> None:
        self.spring_specs.append(SpringChainSpec(chain_id, region, stiffness, drag, gravity, hit_radius, joints))

    def scalp_pt(self, theta_deg: float, phi_deg: float, h: float, kind: str = "skull") -> np.ndarray:
        h_adj = h * (1.0 + 0.35 * self.vol)
        return self.frame.scalp(sph(theta_deg, phi_deg), max(0.0025, h_adj), kind)[0]

    def outward_xz(self, pt: np.ndarray) -> np.ndarray:
        r = pt - self.c
        r[1] = 0.0
        n = float(np.linalg.norm(r))
        return r / n if n > 1e-6 else np.array([0.0, 0.0, -1.0])

    def meridian_ctrl(
        self,
        theta_deg: float,
        phi_start: float,
        phi_end: float,
        h_start: float,
        h_mid: float,
        h_end: float,
        *,
        n_ctrl: int = 6,
        theta_drift_deg: float = 0.0,
        kind: str = "blend",
    ) -> np.ndarray:
        """두피 위를 따라 흐르는 베지어 제어점(정수리→측/후두부)."""
        u = np.linspace(0.0, 1.0, n_ctrl)
        phis = phi_start + (phi_end - phi_start) * u
        thetas = theta_deg + theta_drift_deg * smoothstep(0.25, 1.0, u)
        hs = (h_start + (h_mid - h_start) * smoothstep(0.0, 0.48, u) + (h_end - h_mid) * smoothstep(0.48, 1.0, u)) * (1.0 + 0.35 * self.vol)
        hs = np.maximum(hs, 0.0025)
        dirs = sph(thetas, phis)
        if kind == "blend":
            sk = self.frame.scalp(dirs, hs, "skull")
            cv = self.frame.scalp(dirs, hs, "cover")
            k = smoothstep(82.0, 108.0, phis)[:, None]
            return (1.0 - k) * sk + k * cv
        return self.frame.scalp(dirs, hs, kind)

    def hanging_ctrl(
        self,
        theta_deg: float,
        y_end: float,
        *,
        phi_start: float = 12.0,
        phi_drop: float = 88.0,
        h_root: float = 0.008,
        h_drop: float = 0.014,
        flare: float = 0.008,
        curl_in: float = 0.010,
        curl_up: float = 0.003,
        out_end: float = 0.0,
        fwd_shift: float = 0.0,
        kind: str = "blend",
    ) -> np.ndarray:
        """두피를 감싸 내려온 뒤 턱·목·어깨로 자연스럽게 늘어지는 베지어 제어점."""
        upper = self.meridian_ctrl(theta_deg, phi_start, phi_drop, h_root, 0.5 * (h_root + h_drop), h_drop, n_ctrl=5, kind=kind)
        drop = upper[-1]
        out = self.outward_xz(drop)
        y_end = min(y_end, drop[1] - 0.025)
        fall = drop[1] - y_end
        fl = flare * (1.0 + 0.55 * self.vol)
        fwd = np.array([0.0, 0.0, fwd_shift])
        p1 = drop + np.array([0.0, -0.35 * fall, 0.0]) + out * (0.85 * fl) + 0.35 * fwd
        p2 = drop + np.array([0.0, -0.74 * fall, 0.0]) + out * (0.70 * fl - 0.28 * curl_in + 0.45 * out_end) + 0.78 * fwd
        p3 = np.array([drop[0], y_end, drop[2]]) + out * (0.25 * fl - curl_in + out_end) + fwd
        pts = [upper, p1[None, :], p2[None, :], p3[None, :]]
        if curl_up > 0.0 or out_end > 0.004:
            p4 = p3 + np.array([0.0, curl_up + 0.35 * max(out_end, 0.0), 0.0]) - out * (0.55 * curl_in - 0.65 * out_end)
            pts.append(p4[None, :])
        return np.vstack(pts)

    def long_cascade_ctrl(
        self,
        theta_deg: float,
        y_end: float,
        *,
        route: str = "back",
        phi_start: float = 10.0,
        h_root: float = 0.008,
        h_drop: float = 0.014,
        standoff: float = 0.016,
        flare: float = 0.010,
        wave_amp: float = 0.0,
        wave_cycles: float = 1.6,
        wave_phase: float = 0.0,
        x_end_scale: float = 1.0,
    ) -> np.ndarray:
        """등 뒤 또는 어깨 앞을 타고 허리/가슴까지 내려오는 장발 웨이브 베지어 제어점."""
        upper = self.meridian_ctrl(theta_deg, phi_start, 92.0, h_root, 0.5 * (h_root + h_drop), h_drop, n_ctrl=5, kind="blend")
        drop = upper[-1]
        out = self.outward_xz(drop)
        sh_y = self.m["shoulder_y"]
        sgn = 1.0 if drop[0] >= 0.0 else -1.0
        fl = flare * (1.0 + 0.50 * self.vol)
        if route == "back":
            z_back = self.m["back_z"] - standoff - 0.006 * max(self.vol, 0.0)
            p_sh = np.array([drop[0] * 1.06, sh_y + 0.022, min(drop[2], z_back + 0.018)])
            p_mid = np.array([drop[0] * (0.5 * (1.06 + x_end_scale)), 0.52 * (sh_y + y_end), z_back - 0.006])
            p_end = np.array([drop[0] * x_end_scale, y_end, z_back - 0.010 - 0.006 * max(self.vol, 0.0)])
        else:
            z_front = self.m["chest_z"] + 0.014
            p_sh = np.array([sgn * max(abs(drop[0]) * 1.04, 0.072), sh_y + 0.016, 0.042])
            p_mid = np.array([sgn * max(abs(drop[0]) * 1.08, 0.080), 0.50 * (sh_y + y_end), z_front])
            p_end = np.array([sgn * max(abs(drop[0]) * 0.96, 0.074), y_end, z_front - 0.004])
        p_neck = drop + np.array([0.0, -0.42 * max(drop[1] - p_sh[1], 0.04), 0.0]) + out * fl
        base = np.vstack([upper, p_neck[None, :], p_sh[None, :], p_mid[None, :], p_end[None, :]])
        if wave_amp > 1e-4:
            curve = eval_cubic_bezier_chain(base, samples_per_seg=10)
            s = arc_lengths(curve)
            t = s / max(float(s[-1]), 1e-6)
            env = smoothstep(0.32, 0.65, t)
            tan = unit(np.gradient(curve, axis=0))
            lat = unit(np.cross(tan, default_outward_hint(self.frame, curve)))
            nrm = default_outward_hint(self.frame, curve)
            ang = 2.0 * math.pi * wave_cycles * (t - 0.32) + wave_phase
            curve = curve + lat * (wave_amp * env * np.sin(ang))[:, None] + nrm * (0.45 * wave_amp * env * np.cos(ang))[:, None]
            return resample_polyline(curve, count=14)
        return base

    def bang_ctrl(
        self,
        theta_deg: float,
        y_tip: float,
        *,
        phi_root: float = 16.0,
        h_root: float = 0.010,
        h_arch: float = 0.018,
        h_tip: float = 0.008,
        drift_deg: float = 0.0,
        curl_in_z: float = 0.0,
        arch_lift_y: float = 0.0,
    ) -> np.ndarray:
        """이마 위로 풍성하게 아치를 그리며 내려오는 웹툰 앞머리 베지어 제어점(`shape:bang-length` 연동)."""
        # bang-length:+ → 길어짐(-14mm), bang-length:- → 짧아짐(+16mm)
        y_adj = y_tip - 0.013 * self.bang_q
        # 눈 중앙 아래로 너무 깊게 침범하지 않도록 안전 클램프(눈 위 1mm 이상 유지)
        y_floor = self.m["eye_top_y"] - 0.001
        y_adj = max(y_adj, y_floor)
        # 방위 θ에서 y_adj에 해당하는 극각 찾기
        phis = np.linspace(phi_root, 125.0, 120)
        pts_scan = self.frame.scalp(sph(np.full_like(phis, theta_deg), phis), h_tip, "skull")
        below = np.flatnonzero(pts_scan[:, 1] <= y_adj)
        phi_end = float(phis[below[0]]) if len(below) else 94.0
        phi_mid1 = phi_root + 0.36 * (phi_end - phi_root)
        phi_mid2 = phi_root + 0.68 * (phi_end - phi_root)
        th_vals = [
            theta_deg,
            theta_deg + 0.12 * drift_deg,
            theta_deg + 0.48 * drift_deg,
            theta_deg + 0.85 * drift_deg,
            theta_deg + drift_deg,
        ]
        ph_vals = [phi_root, phi_mid1, phi_mid2, phi_root + 0.88 * (phi_end - phi_root), phi_end]
        h_vals = [h_root, 0.55 * (h_root + h_arch), h_arch, 0.55 * (h_arch + h_tip), h_tip]
        ctrl = []
        for idx, (th, ph, h) in enumerate(zip(th_vals, ph_vals, h_vals)):
            p = self.scalp_pt(th, ph, h, "skull")
            if idx == 2:
                p[1] += arch_lift_y
            if idx == 4:
                p[2] -= curl_in_z
            ctrl.append(p)
        return np.asarray(ctrl, dtype=np.float64)

    def converge_ctrl(self, theta_deg: float, phi_hairline: float, tie_pt: np.ndarray, *, h_root: float = 0.005, h_mid: float = 0.009) -> np.ndarray:
        """머리선에서 묶음점(포니·트윈·상투)으로 매끈하게 당겨 올라가는 두피 가닥 제어점."""
        d0 = sph(theta_deg, phi_hairline)
        d_tie = unit(tie_pt - self.c)
        pts = []
        for t in (0.0, 0.28, 0.58, 0.84):
            d = unit((1.0 - t) * d0 + t * d_tie)
            h = h_root + (h_mid - h_root) * float(smoothstep(0.0, 0.7, t))
            pts.append(self.frame.scalp(d, h * (1.0 + 0.30 * self.vol), "skull")[0])
        pts.append(tie_pt.copy())
        return np.asarray(pts, dtype=np.float64)


# ---------------------------------------------------------------------------
# 12종 웹툰 헤어 스타일 빌더 (3계층 + 구조 장식 + SpringBone)
# ---------------------------------------------------------------------------


def build_soft_bob(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """1. 시스루뱅 소프트 보브: 턱선 C컬 안쪽 말림 + 5가닥 시스루 앞머리 + 귀 뒤 잔머리."""
    m = s.m
    y_side = m["chin_y"] + 0.014
    y_back = m["chin_y"] + 0.006

    # Layer 1: 베이스 볼륨층 (shingle 높이 단차 ±1.8mm로 이웃 가닥 Z-교차 톱니 완전 제거!)
    base_idx = 0
    for i in range(14):
        th = -165.0 + i * (330.0 / 13.0) + s.rng.jitter(1.5)
        ab = abs(th)
        if ab < 46.0:
            continue
        shingle = 0.0020 if (base_idx % 2 == 0) else -0.0018
        base_idx += 1
        y_e = float(np.interp(ab, [52.0, 105.0, 180.0], [y_side + 0.008, y_side, y_back])) + s.rng.jitter(0.004)
        ctrl = s.hanging_ctrl(th, y_e, phi_start=10.0, phi_drop=86.0, h_root=0.008 + shingle * 0.5, h_drop=0.015 + shingle, flare=0.010, curl_in=0.015, curl_up=0.004)
        s.add_strand(ctrl, 0.048, 0.0125, 1, "back" if ab > 110.0 else "side", profile="crescent", taper_len=0.032, tip_frac=0.25, lod2_keep=True)
    # 정수리 상단 커버 베이스(이마 위 부드러운 볼륨 브리지)
    for k, th in enumerate((-42.0, -21.0, 0.0, 21.0, 42.0)):
        sh = 0.0014 if (k % 2 == 0) else -0.0012
        ctrl = s.meridian_ctrl(th, 8.0, 66.0, 0.008 + sh * 0.5, 0.014 + sh, 0.012 + sh, n_ctrl=5, kind="skull")
        s.add_strand(ctrl, 0.044, 0.011, 1, "crown", profile="crescent", taper_len=0.022, tip_frac=0.0, lod2_keep=True, sway_scale=0.15)

    # Layer 2: 미드 청크층 (10 입체 C컬 레이어 청크, ±1.6mm 엇갈림 배치)
    for k, th in enumerate((-158.0, -128.0, -98.0, -68.0, 68.0, 98.0, 128.0, 158.0, 180.0, -162.0)):
        ab = abs(((th + 180.0) % 360.0) - 180.0)
        sh = 0.0018 if (k % 2 == 0) else -0.0014
        y_e = float(np.interp(ab, [65.0, 120.0, 180.0], [y_side + 0.024, y_side + 0.018, y_back + 0.020])) + s.rng.jitter(0.004)
        ctrl = s.hanging_ctrl(th, y_e, phi_start=14.0, phi_drop=82.0, h_root=0.012 + sh * 0.5, h_drop=0.021 + sh, flare=0.014, curl_in=0.017, curl_up=0.005)
        chain = "side_L" if 58.0 <= th <= 108.0 else ("side_R" if -108.0 <= th <= -58.0 else None)
        s.add_strand(ctrl, 0.032, 0.0105, 2, "mid", profile="almond", taper_len=0.038, tip_frac=0.28, lod2_keep=(ab in (68.0, 98.0, 158.0)), spring_chain=chain)

    # Layer 3: 부드럽고 풍성한 5가닥 한국 웹툰 시스루뱅 + 얼굴 프레이밍 옆머리 + 귀 뒤 잔머리
    bang_specs = [(-34.0, 0.005, -6.0, 0.025, 0.0015), (-16.0, 0.000, -2.5, 0.023, -0.0012), (0.0, -0.002, 0.0, 0.022, 0.0016), (16.0, 0.001, 2.5, 0.023, -0.0012), (34.0, 0.005, 6.0, 0.025, 0.0015)]
    for th, dy, dr, w, sh in bang_specs:
        ctrl = s.bang_ctrl(th, m["brow_bottom_y"] + dy, phi_root=16.0, h_root=0.012 + sh * 0.5, h_arch=0.020 + sh, h_tip=0.009 + sh * 0.4, drift_deg=dr, curl_in_z=0.003)
        s.add_strand(ctrl, w, 0.0082, 3, "bang", profile="almond", taper_len=0.026, tip_frac=0.26, lod2_keep=True, sway_scale=0.35)

    for sgn, ch in ((1.0, "side_L"), (-1.0, "side_R")):
        ctrl_f = s.hanging_ctrl(sgn * 52.0, m["chin_y"] + 0.010 - 0.010 * s.bang_q, phi_start=18.0, phi_drop=84.0, h_root=0.013, h_drop=0.020, flare=0.004, curl_in=0.013, fwd_shift=0.013)
        s.add_strand(ctrl_f, 0.026, 0.009, 3, "side", profile="almond", taper_len=0.036, accent=(sgn > 0), tip_frac=0.28, lod2_keep=True, spring_chain=ch)
        ctrl_e = s.hanging_ctrl(sgn * 102.0, m["ear_bottom_y"] - 0.014, phi_start=26.0, phi_drop=92.0, h_root=0.012, h_drop=0.021, flare=0.009, curl_in=0.004, out_end=0.005)
        s.add_strand(ctrl_e, 0.016, 0.0065, 3, "whisp", profile="diamond", taper_len=0.032, tip_frac=0.30, lod2_keep=False, spring_chain=ch)

    for th in (-140.0, -95.0, 95.0, 140.0, 180.0):
        ctrl = s.hanging_ctrl(th, y_back + 0.014, phi_start=45.0, phi_drop=92.0, h_root=0.004, h_drop=0.007, flare=0.002, curl_in=0.008)
        s.add_strand(ctrl, 0.040, 0.007, 1, "under", profile="crescent", ao=0.76, accent=True, tip_frac=0.0, lod2_keep=False)

    s.add_spring("side_L", "side", stiffness=0.80, drag=0.45, gravity=0.28, hit_radius=0.018)
    s.add_spring("side_R", "side", stiffness=0.80, drag=0.45, gravity=0.28, hit_radius=0.018)
    return table_hairline([(0.0, 54.0), (42.0, 62.0), (75.0, 94.0), (105.0, 106.0), (138.0, 122.0), (180.0, 132.0)])


def build_romance_long(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """2. 웨이브 롱 헤어: 등 허리까지 S컬 4단 레이어 + 커튼뱅 + 페이스 프레이밍 옆머리."""
    m = s.m
    y_waist = m["waist_y"] + 0.05

    # Layer 1: 베이스 볼륨 S컬 뒷머리 4단(최장 레이어, ±2mm shingle 엇갈림)
    back_thetas = (-158.0, -134.0, -110.0, -84.0, 84.0, 110.0, 134.0, 158.0, 180.0)
    for idx, th in enumerate(back_thetas):
        ab = abs(th)
        sh = 0.0020 if (idx % 2 == 0) else -0.0018
        v_hem = float(np.interp(ab, [80.0, 140.0, 180.0], [0.055, 0.020, 0.0]))
        ctrl = s.long_cascade_ctrl(
            th,
            y_waist + v_hem,
            route="back",
            h_root=0.008 + sh * 0.4,
            h_drop=0.0145 + sh,
            standoff=0.016 + sh,
            flare=0.010,
            wave_amp=0.014,
            wave_cycles=1.8,
            wave_phase=idx * 0.65,
            x_end_scale=0.92,
        )
        chain = "back_L2" if 80.0 <= th < 125.0 else ("back_L1" if 125.0 <= th <= 170.0 else ("back_R1" if -170.0 <= th <= -125.0 else ("back_R2" if -125.0 < th <= -80.0 else "back_L1")))
        s.add_strand(ctrl, 0.048, 0.0125, 1, "back", profile="crescent", taper_len=0.070, tip_frac=0.26, lod2_keep=True, spring_chain=chain)

    # Layer 2: 4단 레이어 S컬 미드 청크(상·중·하 3단 추가)
    tiers = [
        (m["chest_y"] + 0.06, 0.020, 0.016, 1.5, (-148.0, -104.0, 104.0, 148.0, 180.0)),
        (m["chest_y"] - 0.04, 0.018, 0.018, 1.8, (-162.0, -124.0, 124.0, 162.0)),
        (y_waist + 0.07, 0.017, 0.020, 2.0, (-138.0, 138.0, 180.0)),
    ]
    for t_i, (y_t, h_d, amp, cyc, ths) in enumerate(tiers):
        for j, th in enumerate(ths):
            ctrl = s.long_cascade_ctrl(
                th,
                y_t + s.rng.jitter(0.010),
                route="back",
                phi_start=12.0,
                h_root=0.011,
                h_drop=h_d,
                standoff=0.022 + 0.005 * t_i,
                flare=0.015,
                wave_amp=amp,
                wave_cycles=cyc,
                wave_phase=t_i * 1.1 + j * 0.8,
            )
            chain = "back_L2" if 80.0 <= th < 130.0 else ("back_L1" if th >= 130.0 else ("back_R2" if -130.0 < th <= -80.0 else "back_R1"))
            s.add_strand(ctrl, 0.034, 0.011, 2, "mid", profile="almond", twist_deg=24.0 * (1.0 if th >= 0 else -1.0), taper_len=0.065, tip_frac=0.30, lod2_keep=(t_i == 0), spring_chain=chain)

    # Layer 3: 여신 커튼뱅 + 어깨 앞으로 흐르는 페이스 프레이밍 옆머리 4가닥
    for sgn, ch in ((1.0, "side_L"), (-1.0, "side_R")):
        # 커튼뱅(가운데 가르마에서 바깥으로 우아하게 흘림)
        ctrl_b1 = s.bang_ctrl(sgn * 14.0, m["eye_top_y"] + 0.006, phi_root=12.0, h_root=0.010, h_arch=0.019, h_tip=0.009, drift_deg=sgn * 32.0, arch_lift_y=0.004)
        s.add_strand(ctrl_b1, 0.028, 0.0095, 3, "bang", profile="almond", taper_len=0.032, tip_frac=0.25, lod2_keep=True, sway_scale=0.45)
        ctrl_b2 = s.bang_ctrl(sgn * 34.0, m["eye_bottom_y"] + 0.012, phi_root=16.0, h_root=0.011, h_arch=0.018, h_tip=0.009, drift_deg=sgn * 24.0)
        s.add_strand(ctrl_b2, 0.025, 0.009, 3, "bang", profile="almond", taper_len=0.034, tip_frac=0.28, lod2_keep=True, sway_scale=0.55)
        # 앞어깨로 내려오는 롱 웨이브 페이스 프레이밍
        ctrl_f1 = s.long_cascade_ctrl(sgn * 54.0, m["chest_y"] + 0.02, route="front", phi_start=14.0, h_root=0.011, h_drop=0.017, wave_amp=0.014, wave_cycles=1.5, wave_phase=0.5 * sgn)
        s.add_strand(ctrl_f1, 0.032, 0.0105, 3, "side", profile="almond", twist_deg=sgn * 28.0, taper_len=0.055, accent=(sgn > 0), tip_frac=0.30, lod2_keep=True, spring_chain=ch)
        ctrl_f2 = s.hanging_ctrl(sgn * 46.0, m["chin_y"] - 0.018 - 0.012 * s.bang_q, phi_start=18.0, phi_drop=84.0, h_root=0.012, h_drop=0.018, flare=0.006, curl_in=0.010, fwd_shift=0.014)
        s.add_strand(ctrl_f2, 0.018, 0.0075, 3, "side", profile="almond", taper_len=0.036, tip_frac=0.32, lod2_keep=False, spring_chain=ch)

    # 안쪽 그림자 레이어
    for th in (-130.0, 130.0, 180.0):
        ctrl = s.long_cascade_ctrl(th, y_waist + 0.08, route="back", h_root=0.005, h_drop=0.008, standoff=0.010, wave_amp=0.008)
        s.add_strand(ctrl, 0.044, 0.008, 1, "under", profile="crescent", ao=0.74, accent=True, tip_frac=0.0, lod2_keep=False)

    for cid in ("back_L2", "back_L1", "back_R1", "back_R2"):
        s.add_spring(cid, "back", stiffness=0.55, drag=0.38, gravity=0.38, hit_radius=0.022, joints=6)
    s.add_spring("side_L", "side", stiffness=0.68, drag=0.40, gravity=0.34, hit_radius=0.018, joints=5)
    s.add_spring("side_R", "side", stiffness=0.68, drag=0.40, gravity=0.34, hit_radius=0.018, joints=5)
    return table_hairline([(0.0, 52.0), (40.0, 62.0), (75.0, 96.0), (105.0, 106.0), (138.0, 122.0), (180.0, 132.0)])


def build_hime_cut(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """3. 히메컷 스트레이트: 직선 풀뱅 + 턱선 직각 옆머리(히메 사이드) + 긴 직모(일자 끝)."""
    m = s.m
    y_back = m["waist_y"] + 0.08
    y_hime = m["chin_y"] + 0.006

    # Layer 1: 곧게 떨어지는 긴 직모 뒷머리(±2mm 엇갈림 배치로 세로 톱니 교차 완전 제거!)
    for idx, th in enumerate((-162.0, -138.0, -114.0, -90.0, 90.0, 114.0, 138.0, 162.0, 180.0)):
        sh = 0.0020 if (idx % 2 == 0) else -0.0018
        ctrl = s.long_cascade_ctrl(th, y_back, route="back", phi_start=10.0, h_root=0.0075 + sh * 0.4, h_drop=0.0135 + sh, standoff=0.015 + sh, flare=0.004, wave_amp=0.0, x_end_scale=1.02)
        chain = "back_L" if th > 15.0 and th < 168.0 else ("back_R" if th < -15.0 and th > -168.0 else "back_C")
        s.add_strand(ctrl, 0.048, 0.0115, 1, "back", profile="blunt", tip="blunt", tip_frac=0.22, lod2_keep=True, spring_chain=chain)

    # Layer 2: 미드 직모 광택 레이어
    for idx, th in enumerate((-150.0, -120.0, 120.0, 150.0, 180.0)):
        sh = 0.0016 if (idx % 2 == 0) else -0.0014
        ctrl = s.long_cascade_ctrl(th, y_back + 0.018, route="back", phi_start=12.0, h_root=0.011 + sh * 0.4, h_drop=0.018 + sh, standoff=0.021 + sh, flare=0.006, wave_amp=0.0)
        chain = "back_L" if 90.0 <= th <= 165.0 else ("back_R" if -165.0 <= th <= -90.0 else "back_C")
        s.add_strand(ctrl, 0.040, 0.0095, 2, "mid", profile="blunt", tip="blunt", tip_frac=0.22, lod2_keep=False, spring_chain=chain)

    # Layer 3: 매끄럽게 빈틈없이 이어지는 직선 풀뱅(6조각 겹침 + ±1.4mm shingle) + 턱선 직각 히메 사이드
    for idx, th in enumerate((-40.0, -24.0, -8.0, 8.0, 24.0, 40.0)):
        sh = 0.0015 if (idx % 2 == 0) else -0.0012
        ctrl = s.bang_ctrl(th, m["brow_bottom_y"] + 0.001, phi_root=14.0, h_root=0.010 + sh * 0.4, h_arch=0.018 + sh, h_tip=0.009 + sh * 0.4, drift_deg=0.0)
        s.add_strand(ctrl, 0.030, 0.009, 3, "bang", profile="blunt", tip="blunt", tip_frac=0.18, lod2_keep=True, sway_scale=0.22)

    for sgn, ch in ((1.0, "side_L"), (-1.0, "side_R")):
        for idx, th in enumerate((56.0, 72.0)):
            sh = 0.0018 if idx == 0 else -0.0012
            ctrl = s.hanging_ctrl(
                sgn * th,
                y_hime - 0.010 * s.bang_q,
                phi_start=14.0,
                phi_drop=84.0,
                h_root=0.011 + sh * 0.5,
                h_drop=0.018 + sh,
                flare=0.002,
                curl_in=0.002,
                curl_up=0.0,
                fwd_shift=0.011 if idx == 0 else 0.004,
            )
            s.add_strand(ctrl, 0.032, 0.010, 3, "side", profile="blunt", tip="blunt", accent=(sgn > 0 and idx == 0), tip_frac=0.24, lod2_keep=True, spring_chain=ch)

    for th in (-135.0, 135.0, 180.0):
        ctrl = s.long_cascade_ctrl(th, y_back + 0.04, route="back", h_root=0.004, h_drop=0.007, standoff=0.009)
        s.add_strand(ctrl, 0.044, 0.0075, 1, "under", profile="crescent", tip="blunt", ao=0.72, accent=True, tip_frac=0.0, lod2_keep=False)

    for cid in ("back_L", "back_C", "back_R"):
        s.add_spring(cid, "back", stiffness=0.60, drag=0.40, gravity=0.40, hit_radius=0.022, joints=6)
    s.add_spring("side_L", "side", stiffness=0.82, drag=0.46, gravity=0.30, hit_radius=0.018, joints=4)
    s.add_spring("side_R", "side", stiffness=0.82, drag=0.46, gravity=0.30, hit_radius=0.018, joints=4)
    return table_hairline([(0.0, 52.0), (42.0, 62.0), (76.0, 96.0), (105.0, 106.0), (138.0, 122.0), (180.0, 132.0)])


def build_action_pony(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """4. 하이 포니테일: 당겨 올린 두피층 + 묶음 밴드 메쉬 + 역동적 꼬리 아크 청크 + 날리는 옆머리."""
    m = s.m
    tie_dir = sph(180.0, 36.0)
    tie_base = s.frame.scalp(tie_dir, 0.010 + 0.003 * s.vol, "skull")[0]
    tail_dir = unit(np.array([0.0, 0.50, -1.0]))
    tie_center = tie_base + tail_dir * 0.010

    # Layer 1: 머리선 → 하이 포니 묶음점으로 매끈하게 수렴하는 14 두피 청크(shingle ±1.4mm)
    scalp_targets = [
        (-40.0, 54.0), (-14.0, 52.0), (14.0, 52.0), (40.0, 54.0),
        (62.0, 76.0), (88.0, 98.0), (118.0, 122.0), (150.0, 136.0),
        (180.0, 139.0), (-150.0, 136.0), (-118.0, 122.0), (-88.0, 98.0), (-62.0, 76.0),
    ]
    for idx, (th, ph) in enumerate(scalp_targets):
        sh = 0.0014 if (idx % 2 == 0) else -0.0012
        ctrl = s.converge_ctrl(th, ph, tie_base, h_root=0.0055 + sh * 0.4, h_mid=0.0105 + sh)
        s.add_strand(ctrl, 0.044, 0.009, 1, "crown", profile="crescent", taper_len=0.018, tip_frac=0.0, lod2_keep=True, sway_scale=0.05)

    # 구조 장식: 묶음 밴드(더블 랩 토러스, hair-accent)
    s.add_ornament(make_torus_ornament("pony_band_main", tie_center, tail_dir, 0.0185, 0.0065, axial_scale=1.55, segs=22, sides=8))
    s.add_ornament(make_torus_ornament("pony_band_rim", tie_center + tail_dir * 0.006, tail_dir, 0.0175, 0.0042, axial_scale=1.1, segs=18, sides=6))

    # Layer 2: 역동적 하이 아크 포니테일 꼬리 청크 (바깥 7 + 안쪽 코어 3)
    tail_end_y = m["chest_y"] + 0.04
    spine_ctrl = np.array([
        tie_center,
        tie_center + np.array([0.0, 0.042, -0.055]),
        tie_center + np.array([0.0, 0.004, -0.118]),
        np.array([0.0, m["shoulder_y"] + 0.06, m["back_z"] - 0.068]),
        np.array([0.0, tail_end_y, m["back_z"] - 0.048]),
    ], dtype=np.float64)
    spine = eval_cubic_bezier_chain(spine_ctrl, samples_per_seg=12)
    sp_s = arc_lengths(spine)
    sp_t = sp_s / max(float(sp_s[-1]), 1e-6)
    _, sp_n, sp_b = parallel_frames(spine, np.tile(np.array([0.0, 1.0, 0.0]), (len(spine), 1)))
    bulk_outer = (0.016 + 0.022 * smoothstep(0.0, 0.30, sp_t) - 0.014 * smoothstep(0.35, 1.0, sp_t)) * (1.0 + 0.25 * s.vol)
    for k in range(7):
        ang = 2.0 * math.pi * (k + 0.5) / 7.0
        rad_dir = math.cos(ang) * sp_n + math.sin(ang) * sp_b
        flick = 0.018 * smoothstep(0.68, 1.0, sp_t)
        pts_k = spine + rad_dir * (bulk_outer + flick)[:, None]
        # 꼬리 끝 살짝씩 단차
        cut = int(len(pts_k) * (0.86 + 0.14 * ((k % 3) / 2.0)))
        pts_k = pts_k[: max(6, cut)]
        chain = "pony_L" if math.sin(ang) > 0.32 else ("pony_R" if math.sin(ang) < -0.32 else "pony_C")
        s.add_strand(
            resample_polyline(pts_k, count=10),
            0.034,
            0.012,
            2,
            "pony",
            profile="diamond",
            hints=resample_polyline(rad_dir[: len(pts_k)], count=10),
            taper_len=0.075,
            tip_frac=0.32,
            lod2_keep=(k % 2 == 0 or k == 1),
            sway_scale=1.15,
            spring_chain=chain,
        )
    # 안쪽 꼬리 볼륨 코어 3가닥
    for k in range(3):
        ang = 2.0 * math.pi * k / 3.0 + 0.4
        rad_dir = math.cos(ang) * sp_n + math.sin(ang) * sp_b
        pts_k = spine + rad_dir * (0.45 * bulk_outer)[:, None]
        s.add_strand(resample_polyline(pts_k, count=9), 0.028, 0.010, 2, "under", profile="almond", ao=0.78, accent=True, taper_len=0.06, tip_frac=0.0, lod2_keep=False, sway_scale=1.0, spring_chain="pony_C")

    # Layer 3: 역동적 비대칭 앞머리 5가닥 + 날리는 옆머리 4가닥
    for idx, (th, dy, dr, w) in enumerate(((-34.0, 0.004, -12.0, 0.025), (-14.0, -0.001, -10.0, 0.026), (6.0, 0.003, -8.0, 0.025), (24.0, 0.007, 6.0, 0.024), (40.0, 0.010, 10.0, 0.022))):
        sh = 0.0015 if (idx % 2 == 0) else -0.0012
        ctrl = s.bang_ctrl(th, m["brow_bottom_y"] + dy, phi_root=16.0, h_root=0.013 + sh * 0.4, h_arch=0.021 + sh, h_tip=0.009 + sh * 0.4, drift_deg=dr)
        s.add_strand(ctrl, w, 0.0085, 3, "bang", profile="diamond", taper_len=0.026, tip_frac=0.28, lod2_keep=True, sway_scale=0.45)
    for sgn, ch in ((1.0, "side_L"), (-1.0, "side_R")):
        ctrl_s1 = s.hanging_ctrl(sgn * 56.0, m["chin_y"] + 0.004 - 0.012 * s.bang_q, phi_start=20.0, phi_drop=84.0, h_root=0.012, h_drop=0.017, flare=0.008, curl_in=0.002, out_end=0.012, fwd_shift=0.010)
        s.add_strand(ctrl_s1, 0.020, 0.008, 3, "side", profile="diamond", taper_len=0.038, tip_frac=0.32, lod2_keep=True, spring_chain=ch)
        ctrl_s2 = s.hanging_ctrl(sgn * 74.0, m["ear_bottom_y"] - 0.012, phi_start=24.0, phi_drop=88.0, h_root=0.010, h_drop=0.015, flare=0.010, curl_in=0.0, out_end=0.014)
        s.add_strand(ctrl_s2, 0.015, 0.0065, 3, "whisp", profile="diamond", taper_len=0.032, tip_frac=0.30, lod2_keep=False, spring_chain=ch)

    for cid in ("pony_C", "pony_L", "pony_R"):
        s.add_spring(cid, "pony", stiffness=0.52, drag=0.34, gravity=0.32, hit_radius=0.022, joints=6)
    s.add_spring("side_L", "side", stiffness=0.76, drag=0.42, gravity=0.28, hit_radius=0.016, joints=4)
    s.add_spring("side_R", "side", stiffness=0.76, drag=0.42, gravity=0.28, hit_radius=0.016, joints=4)
    return table_hairline([(0.0, 50.0), (42.0, 54.0), (65.0, 74.0), (92.0, 96.0), (120.0, 118.0), (150.0, 132.0), (180.0, 136.0)])


def build_twin_tail(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """5. 로우/하이 트윈테일: 가운데 가르마 두피층 + 좌우 대칭 리본 묶음 + 나선 컬 청크."""
    m = s.m
    tail_end_y = m["waist_y"] + 0.06

    for sgn, lbl in ((1.0, "L"), (-1.0, "R")):
        tie_dir = sph(sgn * 112.0, 44.0)
        tie_base = s.frame.scalp(tie_dir, 0.010 + 0.003 * s.vol, "skull")[0]
        tail_dir = unit(np.array([sgn * 0.78, 0.36, -0.52]))
        tie_center = tie_base + tail_dir * 0.009

        # Layer 1: 좌/우 가르마 → 각 묶음점으로 당긴 두피 청크 9가닥씩(뒤통수·목덜미까지 빈틈없이 완전 피복!)
        targets = [
            (sgn * 10.0, 52.0), (sgn * 34.0, 56.0), (sgn * 62.0, 76.0), (sgn * 90.0, 98.0),
            (sgn * 118.0, 120.0), (sgn * 144.0, 134.0), (sgn * 168.0, 138.0), (sgn * 176.0, 96.0), (sgn * 176.0, 62.0),
        ]
        for idx, (th, ph) in enumerate(targets):
            sh = 0.0014 if (idx % 2 == 0) else -0.0012
            w_t = 0.052 if idx >= 4 else 0.044
            ctrl = s.converge_ctrl(th, ph, tie_base, h_root=0.0055 + sh * 0.4, h_mid=0.0105 + sh)
            s.add_strand(ctrl, w_t, 0.009, 1, "crown", profile="crescent", taper_len=0.016, tip_frac=0.0, lod2_keep=(idx < 7), sway_scale=0.05)

        # 구조 장식: 묶음 고리 + 입체 리본 매듭(hair-accent)
        s.add_ornament(make_torus_ornament(f"twin_band_{lbl}", tie_center, tail_dir, 0.016, 0.0052, axial_scale=1.35, segs=18, sides=6))
        bow_out = unit(np.array([sgn * 0.65, 0.52, -0.55]))
        bow_up = unit(np.array([0.0, 1.0, 0.0]) - bow_out[1] * bow_out)
        bow_side = unit(np.cross(bow_up, bow_out))
        for bow_p in make_bow_ornaments(f"twin_bow_{lbl}", tie_center + bow_out * 0.015, bow_out, bow_up, bow_side, scale=0.82):
            s.add_ornament(bow_p)

        # Layer 2: 좌/우 나선 컬 트윈테일 (각 5가닥 나선 청크)
        spine_ctrl = np.array([
            tie_center,
            tie_center + np.array([sgn * 0.044, 0.026, -0.024]),
            tie_center + np.array([sgn * 0.076, -0.032, -0.044]),
            np.array([sgn * 0.132, m["shoulder_y"] + 0.04, m["back_z"] - 0.038]),
            np.array([sgn * 0.145, m["chest_y"] + 0.02, m["back_z"] - 0.032]),
            np.array([sgn * 0.138, tail_end_y, m["back_z"] - 0.026]),
        ], dtype=np.float64)
        spine = eval_cubic_bezier_chain(spine_ctrl, samples_per_seg=12)
        sp_s = arc_lengths(spine)
        sp_t = sp_s / max(float(sp_s[-1]), 1e-6)
        _, sp_n, sp_b = parallel_frames(spine, np.tile(np.array([sgn, 0.0, 0.0]), (len(spine), 1)))
        bulk = (0.013 + 0.017 * smoothstep(0.0, 0.25, sp_t) - 0.009 * smoothstep(0.35, 1.0, sp_t)) * (1.0 + 0.24 * s.vol)
        for k in range(5):
            # 나선 회전(트윈테일 특유의 스프링 컬!)
            base_ang = 2.0 * math.pi * k / 5.0
            spiral_ang = base_ang + sgn * 2.2 * math.pi * smoothstep(0.22, 1.0, sp_t)
            rad_dir = np.cos(spiral_ang)[:, None] * sp_n + np.sin(spiral_ang)[:, None] * sp_b
            pts_k = spine + rad_dir * bulk[:, None]
            cut = int(len(pts_k) * (0.84 + 0.16 * (k / 4.0)))
            pts_k = pts_k[: max(7, cut)]
            chain = f"tail_{lbl}1" if k < 3 else f"tail_{lbl}2"
            s.add_strand(
                resample_polyline(pts_k, count=12),
                0.030,
                0.011,
                2,
                "tail",
                profile="almond",
                hints=resample_polyline(rad_dir[: len(pts_k)], count=12),
                twist_deg=sgn * 45.0,
                taper_len=0.068,
                tip_frac=0.30,
                lod2_keep=(k < 3),
                sway_scale=1.15,
                spring_chain=chain,
            )

    # Layer 3: 아이돌 시스루-풀 앞머리 5가닥 + 볼 옆 애교머리 2가닥
    for idx, (th, dy, w) in enumerate(((-34.0, 0.005, 0.024), (-16.0, 0.001, 0.023), (0.0, -0.001, 0.023), (16.0, 0.001, 0.023), (34.0, 0.005, 0.024))):
        sh = 0.0014 if (idx % 2 == 0) else -0.0011
        ctrl = s.bang_ctrl(th, m["brow_bottom_y"] + dy, phi_root=15.0, h_root=0.012 + sh * 0.4, h_arch=0.020 + sh, h_tip=0.009 + sh * 0.4, curl_in_z=0.003)
        s.add_strand(ctrl, w, 0.0085, 3, "bang", profile="almond", taper_len=0.024, tip_frac=0.26, lod2_keep=True, sway_scale=0.35)
    for sgn in (1.0, -1.0):
        ctrl_s = s.hanging_ctrl(sgn * 56.0, m["chin_y"] + 0.018 - 0.012 * s.bang_q, phi_start=18.0, phi_drop=84.0, h_root=0.011, h_drop=0.016, flare=0.004, curl_in=0.009, fwd_shift=0.011)
        s.add_strand(ctrl_s, 0.019, 0.0075, 3, "side", profile="almond", taper_len=0.034, tip_frac=0.30, lod2_keep=True)

    for cid in ("tail_L1", "tail_L2", "tail_R1", "tail_R2"):
        s.add_spring(cid, "tail", stiffness=0.50, drag=0.35, gravity=0.36, hit_radius=0.020, joints=6)
    return table_hairline([(0.0, 50.0), (42.0, 54.0), (65.0, 74.0), (92.0, 96.0), (120.0, 118.0), (150.0, 132.0), (180.0, 136.0)])


def build_short_layered(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """6. 내추럴 숏 레이어드: 정수리 볼륨 + 목선 깔끔한 샤기 테이퍼."""
    m = s.m

    # Layer 1: 두상에 깔끔하게 밀착해 목선으로 떨어지는 14 베이스 청크(±1.8mm shingle 엇갈림)
    for idx, th in enumerate((-162.0, -140.0, -116.0, -92.0, -68.0, 68.0, 92.0, 116.0, 140.0, 162.0, 180.0)):
        ab = abs(th)
        sh = 0.0018 if (idx % 2 == 0) else -0.0016
        phi_e = float(np.interp(ab, [65.0, 100.0, 180.0], [108.0, 118.0, 134.0])) + s.rng.jitter(2.5)
        ctrl = s.meridian_ctrl(th, 10.0, phi_e, 0.008 + sh * 0.4, 0.0125 + sh, 0.0065 + sh * 0.4, n_ctrl=6, kind="blend")
        if ab >= 120.0:
            tip_ext = ctrl[-1] + np.array([0.0, -0.016, -0.003])
            ctrl = np.vstack([ctrl, tip_ext[None, :]])
        s.add_strand(ctrl, 0.046, 0.0105, 1, "back" if ab > 105.0 else "side", profile="crescent", taper_len=0.028, tip_frac=0.22, lod2_keep=True, sway_scale=0.35)

    # Layer 2: 정수리·뒤통수 공기감 있는 샤기 미드 레이어 12청크(±1.6mm 엇갈림)
    for idx, th in enumerate((-165.0, -135.0, -105.0, -75.0, -45.0, 45.0, 75.0, 105.0, 135.0, 165.0, 180.0, 0.0)):
        ab = abs(th)
        sh = 0.0016 if (idx % 2 == 0) else -0.0014
        phi_e = float(np.interp(ab, [0.0, 60.0, 120.0, 180.0], [64.0, 82.0, 100.0, 108.0])) + (6.0 if idx % 2 == 0 else -4.0)
        ctrl = s.meridian_ctrl(th, 8.0, phi_e, 0.0125 + sh * 0.4, 0.0195 + sh, 0.0145 + sh * 0.5, n_ctrl=6, theta_drift_deg=(-8.0 if ab < 50.0 else 0.0), kind="blend")
        out = s.outward_xz(ctrl[-1])
        ctrl[-1] += out * 0.005
        s.add_strand(ctrl, 0.034, 0.0092, 2, "mid", profile="diamond", taper_len=0.032, tip_frac=0.26, lod2_keep=(idx % 2 == 0), sway_scale=0.45)

    # Layer 3: 자연 옆쓸림 앞머리 6가닥(풍성한 겹침 + ±1.4mm shingle)
    bang_specs = [(-38.0, 0.006, -12.0, 0.025), (-22.0, 0.001, -13.0, 0.026), (-6.0, -0.001, -14.0, 0.026), (10.0, 0.003, -12.0, 0.025), (26.0, 0.007, -8.0, 0.025), (42.0, 0.011, 4.0, 0.023)]
    for idx, (th, dy, dr, w) in enumerate(bang_specs):
        sh = 0.0014 if (idx % 2 == 0) else -0.0012
        ctrl = s.bang_ctrl(th, m["brow_bottom_y"] + dy, phi_root=14.0, h_root=0.0125 + sh * 0.4, h_arch=0.020 + sh, h_tip=0.009 + sh * 0.4, drift_deg=dr)
        s.add_strand(ctrl, w, 0.0082, 3, "bang", profile="diamond", taper_len=0.026, tip_frac=0.28, lod2_keep=True, sway_scale=0.50, spring_chain="bang_C")

    for sgn in (1.0, -1.0):
        ctrl_sb = s.hanging_ctrl(sgn * 60.0, m["ear_bottom_y"] + 0.002 - 0.008 * s.bang_q, phi_start=26.0, phi_drop=86.0, h_root=0.010, h_drop=0.013, flare=0.002, curl_in=0.006, fwd_shift=0.008)
        s.add_strand(ctrl_sb, 0.018, 0.007, 3, "side", profile="diamond", taper_len=0.028, accent=(sgn > 0), tip_frac=0.28, lod2_keep=True, sway_scale=0.40)

    # 목덜미 안쪽 음영 레이어
    for th in (-150.0, 150.0, 180.0):
        ctrl = s.meridian_ctrl(th, 60.0, 134.0, 0.005, 0.006, 0.004, n_ctrl=5, kind="skull")
        s.add_strand(ctrl, 0.036, 0.0065, 1, "under", profile="crescent", ao=0.76, accent=True, tip_frac=0.0, lod2_keep=False, sway_scale=0.15)

    s.add_spring("bang_C", "bang", stiffness=0.92, drag=0.50, gravity=0.22, hit_radius=0.015, joints=4)
    return table_hairline([(0.0, 54.0), (42.0, 66.0), (76.0, 92.0), (105.0, 102.0), (135.0, 116.0), (180.0, 128.0)])


def build_wolf_layered(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """7. 울프 레이어드 컷: 가벼운 목선 멀릿 + 날카로운 깃털형 사이드 레이어 + 볼륨 윗층."""
    m = s.m
    y_mullet = m["shoulder_y"] + 0.004
    y_side = m["chin_y"] + 0.020

    # Layer 1: 베이스 볼륨 + 바깥으로 뻗는 뒷목 멀릿 꼬리(±2mm shingle 엇갈림)
    for idx, th in enumerate((-162.0, -140.0, -118.0, 118.0, 140.0, 162.0, 180.0)):
        ab = abs(th)
        sh = 0.0020 if (idx % 2 == 0) else -0.0018
        y_e = y_mullet + (0.022 if ab < 135.0 else 0.0) + s.rng.jitter(0.006)
        ctrl = s.hanging_ctrl(th, y_e, phi_start=12.0, phi_drop=92.0, h_root=0.008 + sh * 0.4, h_drop=0.0135 + sh, flare=-0.002, curl_in=0.0, curl_up=0.004, out_end=0.022)
        chain = "nape_L" if th >= 0 else "nape_R"
        s.add_strand(ctrl, 0.044, 0.0108, 1, "back", profile="diamond", taper_len=0.052, tip_frac=0.30, lod2_keep=True, spring_chain=chain)
    for idx, th in enumerate((-92.0, -68.0, 68.0, 92.0)):
        sh = 0.0018 if (idx % 2 == 0) else -0.0015
        ctrl = s.hanging_ctrl(th, y_side, phi_start=12.0, phi_drop=84.0, h_root=0.008 + sh * 0.4, h_drop=0.0145 + sh, flare=0.006, curl_in=0.0, out_end=0.016)
        chain = "side_L" if th > 0 else "side_R"
        s.add_strand(ctrl, 0.042, 0.0108, 1, "side", profile="diamond", taper_len=0.044, tip_frac=0.30, lod2_keep=True, spring_chain=chain)

    # Layer 2: 울프컷 상징 — 정수리 둥근 볼륨 윗층(±1.8mm shingle 엇갈림)
    for idx, th in enumerate((-165.0, -135.0, -105.0, -75.0, 75.0, 105.0, 135.0, 165.0, 180.0)):
        sh = 0.0018 if (idx % 2 == 0) else -0.0016
        ctrl = s.meridian_ctrl(th, 8.0, 98.0 + (6.0 if idx % 2 else -4.0), 0.0145 + sh * 0.4, 0.0235 + sh, 0.0185 + sh, n_ctrl=6, kind="blend")
        out = s.outward_xz(ctrl[-1])
        ctrl = np.vstack([ctrl, (ctrl[-1] + out * 0.018 + np.array([0.0, -0.010, 0.0]))[None, :]])
        s.add_strand(ctrl, 0.036, 0.010, 2, "mid", profile="diamond", taper_len=0.036, tip_frac=0.28, lod2_keep=(idx % 2 == 0), sway_scale=0.65)

    # Layer 3: 샤기 깃털 앞머리 5가닥(풍성한 겹침) + 날카로운 깃털형 사이드 레이어 6가닥
    for idx, (th, dy, dr, w) in enumerate(((-34.0, 0.008, -10.0, 0.024), (-16.0, 0.001, -4.0, 0.025), (0.0, 0.003, 2.0, 0.024), (16.0, 0.000, 5.0, 0.025), (34.0, 0.009, 10.0, 0.024))):
        sh = 0.0014 if (idx % 2 == 0) else -0.0012
        ctrl = s.bang_ctrl(th, m["brow_bottom_y"] + dy, phi_root=15.0, h_root=0.0135 + sh * 0.4, h_arch=0.022 + sh, h_tip=0.0095 + sh * 0.4, drift_deg=dr)
        s.add_strand(ctrl, w, 0.0085, 3, "bang", profile="diamond", taper_len=0.028, tip_frac=0.30, lod2_keep=True, sway_scale=0.50)

    for sgn, ch in ((1.0, "side_L"), (-1.0, "side_R")):
        for j, (th, y_off, out_e) in enumerate(((52.0, 0.014, 0.012), (66.0, -0.004, 0.016), (82.0, 0.024, 0.018))):
            ctrl_f = s.hanging_ctrl(sgn * th, m["chin_y"] + y_off - 0.012 * s.bang_q, phi_start=18.0, phi_drop=84.0, h_root=0.013, h_drop=0.019, flare=0.008, curl_in=0.0, out_end=out_e, fwd_shift=0.010 if j == 0 else 0.003)
            s.add_strand(ctrl_f, 0.020, 0.008, 3, "side", profile="diamond", taper_len=0.040, accent=(sgn > 0 and j == 0), tip_frac=0.38, lod2_keep=(j < 2), spring_chain=ch)

    # 멀릿 안쪽 포인트 컬러 레이어
    for th in (-150.0, 150.0, 180.0):
        ctrl = s.hanging_ctrl(th, y_mullet + 0.016, phi_start=50.0, phi_drop=96.0, h_root=0.005, h_drop=0.008, flare=-0.002, curl_in=0.0, out_end=0.014)
        s.add_strand(ctrl, 0.038, 0.0075, 1, "under", profile="diamond", ao=0.75, accent=True, tip_frac=0.0, lod2_keep=False)

    s.add_spring("nape_L", "nape", stiffness=0.68, drag=0.40, gravity=0.30, hit_radius=0.018, joints=5)
    s.add_spring("nape_R", "nape", stiffness=0.68, drag=0.40, gravity=0.30, hit_radius=0.018, joints=5)
    s.add_spring("side_L", "side", stiffness=0.74, drag=0.42, gravity=0.28, hit_radius=0.017, joints=4)
    s.add_spring("side_R", "side", stiffness=0.74, drag=0.42, gravity=0.28, hit_radius=0.017, joints=4)
    return table_hairline([(0.0, 54.0), (42.0, 64.0), (75.0, 96.0), (105.0, 106.0), (138.0, 122.0), (180.0, 134.0)])


def build_dandy_two_block(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """8. 투블럭 댄디컷 (남): 깔끔한 옆라인 언더컷 + 풍성한 윗볼륨 + 자연 6:4 이마 덮는 앞머리."""
    m = s.m

    # Layer 1: 깔끔한 언더컷 옆라인(귀 위에서 딱 끊기는 타이트 베이스, hair-accent로 톤 차) + 단정한 뒤통수
    for th in (-104.0, -82.0, -62.0, 62.0, 82.0, 104.0):
        ctrl = s.meridian_ctrl(th, 46.0, 92.0, 0.005, 0.006, 0.004, n_ctrl=5, kind="skull")
        s.add_strand(ctrl, 0.036, 0.0065, 1, "under", profile="crescent", ao=0.76, accent=True, taper_len=0.016, tip_frac=0.0, lod2_keep=True, sway_scale=0.10)
    for idx, th in enumerate((-162.0, -138.0, -118.0, 118.0, 138.0, 162.0, 180.0)):
        sh = 0.0018 if (idx % 2 == 0) else -0.0015
        ctrl = s.meridian_ctrl(th, 12.0, 124.0, 0.008 + sh * 0.4, 0.0135 + sh, 0.0055 + sh * 0.4, n_ctrl=6, kind="skull")
        s.add_strand(ctrl, 0.046, 0.0105, 1, "back", profile="crescent", taper_len=0.024, tip_frac=0.20, lod2_keep=True, sway_scale=0.20)

    # Layer 2: 투블럭 시그니처 — 언더컷 위로 자연스럽게 덮이는 풍성한 크라운·옆 볼륨 청크(±1.8mm shingle)
    for idx, th in enumerate((-160.0, -130.0, -100.0, -74.0, -48.0, 48.0, 74.0, 100.0, 130.0, 160.0, 180.0)):
        ab = abs(th)
        sh = 0.0018 if (idx % 2 == 0) else -0.0015
        phi_e = float(np.interp(ab, [45.0, 80.0, 120.0, 180.0], [74.0, 86.0, 96.0, 108.0]))
        ctrl = s.meridian_ctrl(th, 6.0, phi_e, 0.0135 + sh * 0.4, 0.0215 + sh, 0.0145 + sh * 0.5, n_ctrl=6, theta_drift_deg=(-6.0 if th > 15.0 else 4.0), kind="skull")
        s.add_strand(ctrl, 0.040, 0.011, 2, "mid", profile="almond", taper_len=0.028, tip_frac=0.24, lod2_keep=(idx % 2 == 0), sway_scale=0.35)

    # Layer 3: 6:4 댄디 가닥 볼륨 앞머리 7가닥(풍성한 겹침 + ±1.5mm shingle) + 깔끔한 구레나룻 2가닥
    bang_specs = [
        (-42.0, 0.007, -8.0, 0.026, "bang_R"),
        (-26.0, 0.001, -10.0, 0.028, "bang_R"),
        (-10.0, -0.002, -11.0, 0.029, "bang_R"),
        (6.0, -0.001, -10.0, 0.029, "bang_L"),
        (22.0, 0.004, 8.0, 0.027, "bang_L"),
        (36.0, 0.007, 12.0, 0.026, "bang_L"),
        (48.0, 0.010, 10.0, 0.024, "bang_L"),
    ]
    for idx, (th, dy, dr, w, ch) in enumerate(bang_specs):
        sh = 0.0016 if (idx % 2 == 0) else -0.0013
        ctrl = s.bang_ctrl(th, m["brow_bottom_y"] + dy, phi_root=12.0, h_root=0.0135 + sh * 0.4, h_arch=0.023 + sh, h_tip=0.010 + sh * 0.4, drift_deg=dr, curl_in_z=0.003)
        s.add_strand(ctrl, w, 0.0092, 3, "bang", profile="diamond", taper_len=0.024, tip_frac=0.25, lod2_keep=True, sway_scale=0.45, spring_chain=ch)

    for sgn in (1.0, -1.0):
        # 귀 앞 단정한 남성 구레나룻
        ctrl_sb = s.meridian_ctrl(sgn * 66.0, 62.0, 104.0, 0.006, 0.007, 0.004, n_ctrl=5, kind="skull")
        s.add_strand(ctrl_sb, 0.015, 0.0055, 3, "side", profile="diamond", taper_len=0.020, tip_frac=0.15, lod2_keep=True, sway_scale=0.10)

    s.add_spring("bang_L", "bang", stiffness=0.90, drag=0.48, gravity=0.22, hit_radius=0.015, joints=4)
    s.add_spring("bang_R", "bang", stiffness=0.90, drag=0.48, gravity=0.22, hit_radius=0.015, joints=4)
    return table_hairline([(0.0, 52.0), (42.0, 60.0), (72.0, 86.0), (96.0, 90.0), (125.0, 110.0), (180.0, 124.0)])


def build_comma_hair(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """9. 쉼표머리 가르마 (남): 7:3 가르마 + 이마 쪽 안으로 감기는 쉼표(C) 컬 청크."""
    m = s.m

    # Layer 1: 깔끔한 남성 테이퍼 언더컷 옆머리 + 둥근 뒤통수 볼륨
    for th in (-100.0, -78.0, 78.0, 100.0):
        ctrl = s.meridian_ctrl(th, 46.0, 92.0, 0.005, 0.006, 0.004, n_ctrl=5, kind="skull")
        s.add_strand(ctrl, 0.036, 0.0065, 1, "under", profile="crescent", ao=0.76, accent=True, taper_len=0.016, tip_frac=0.0, lod2_keep=True, sway_scale=0.10)
    for idx, th in enumerate((-162.0, -138.0, -116.0, 116.0, 138.0, 162.0, 180.0)):
        sh = 0.0018 if (idx % 2 == 0) else -0.0015
        ctrl = s.meridian_ctrl(th, 12.0, 124.0, 0.008 + sh * 0.4, 0.0135 + sh, 0.0055 + sh * 0.4, n_ctrl=6, kind="skull")
        s.add_strand(ctrl, 0.046, 0.0105, 1, "back", profile="crescent", taper_len=0.024, tip_frac=0.20, lod2_keep=True, sway_scale=0.20)

    # Layer 2: 7:3 비대칭 가르마 볼륨 웨이브 미드 청크(±1.8mm shingle)
    for idx, th in enumerate((-158.0, -128.0, -96.0, -68.0, 54.0, 82.0, 110.0, 140.0, 170.0, 180.0)):
        ab = abs(th)
        sh = 0.0018 if (idx % 2 == 0) else -0.0015
        phi_e = float(np.interp(ab, [50.0, 90.0, 180.0], [76.0, 86.0, 108.0]))
        h_mid = (0.022 if th > 0.0 else 0.0185) + sh
        ctrl = s.meridian_ctrl(th, 8.0, phi_e, 0.0135 + sh * 0.4, h_mid, 0.0125 + sh * 0.5, n_ctrl=6, theta_drift_deg=(10.0 if th > 0 else -12.0), kind="skull")
        s.add_strand(ctrl, 0.040, 0.0105, 2, "mid", profile="almond", taper_len=0.028, tip_frac=0.24, lod2_keep=(idx % 2 == 0), sway_scale=0.35)

    # Layer 3: 시그니처 쉼표(C) 컬 앞머리(7-side, 왼쪽→이마 중앙으로 둥글게 감김!) + 반대편 스윕 웨이브(3-side)
    # 7-side(주인공 오른쪽 화면 / 캐릭터 왼쪽 +X → -X 중앙쪽으로 둥글게 안쪽 C컬)
    comma_offsets = [(0.0, 0.028, 0.012, 0.0), (8.0, 0.024, 0.010, 0.006), (-7.0, 0.022, 0.0095, -0.003)]
    for dth, w, thk, dy_off in comma_offsets:
        # 뿌리(가르마 위) → 위로 솟아오른 루트 볼륨 → 앞쪽으로 돌출 → 이마 중앙을 향해 둥글게 안으로 말리는 쉼표 C-커브!
        p0 = s.scalp_pt(-18.0 + dth * 0.4, 24.0, 0.011, "skull")
        p1 = s.scalp_pt(-2.0 + dth * 0.6, 38.0, 0.022, "skull") + np.array([0.0, 0.007, 0.006])
        p2 = s.scalp_pt(20.0 + dth, 58.0, 0.025, "skull") + np.array([0.006, 0.004, 0.010])
        p3 = s.scalp_pt(24.0 + dth, 76.0, 0.020, "skull") + np.array([0.004, -0.004 - 0.006 * s.bang_q, 0.008])
        # 핵심: 끝부분이 다시 중앙(x=0 쪽)으로 둥글게 감겨 들어가는 쉼표 꼬리!
        p4 = s.scalp_pt(6.0 + dth * 0.6, 86.0 + 4.0 * s.bang_q, 0.012, "skull") + np.array([-0.008, dy_off - 0.008 * s.bang_q, 0.003])
        p4[1] = max(p4[1], m["eye_top_y"] + 0.002)
        ctrl = np.asarray([p0, p1, p2, p3, p4], dtype=np.float64)
        s.add_strand(ctrl, w, thk, 3, "bang", profile="diamond", taper_len=0.032, tip_frac=0.28, lod2_keep=True, sway_scale=0.55, spring_chain="bang_comma")

    # 3-side(반대편 -X 쪽): 이마를 반쯤 드러내며 바깥 뒤로 멋스럽게 넘어가는 볼륨 스윕 3가닥
    for th0, th1, y_off, w in ((-28.0, -50.0, 0.012, 0.025), (-34.0, -60.0, 0.006, 0.023), (-42.0, -68.0, 0.002, 0.020)):
        p0 = s.scalp_pt(th0, 22.0, 0.011, "skull")
        p1 = s.scalp_pt(th0 - 4.0, 40.0, 0.022, "skull") + np.array([0.0, 0.006, 0.006])
        p2 = s.scalp_pt(0.5 * (th0 + th1), 62.0, 0.020, "skull") + np.array([-0.004, 0.0, 0.005])
        p3 = s.scalp_pt(th1, 80.0 + 3.0 * s.bang_q, 0.011, "skull") + np.array([0.0, y_off - 0.006 * s.bang_q, 0.0])
        ctrl = np.asarray([p0, p1, p2, p3], dtype=np.float64)
        s.add_strand(ctrl, w, 0.0095, 3, "bang", profile="almond", taper_len=0.028, tip_frac=0.26, lod2_keep=True, sway_scale=0.50, spring_chain="bang_sweep")

    for sgn in (1.0, -1.0):
        ctrl_sb = s.meridian_ctrl(sgn * 66.0, 62.0, 102.0, 0.006, 0.007, 0.004, n_ctrl=5, kind="skull")
        s.add_strand(ctrl_sb, 0.015, 0.0055, 3, "side", profile="diamond", taper_len=0.020, tip_frac=0.15, lod2_keep=True, sway_scale=0.10)

    s.add_spring("bang_comma", "bang", stiffness=0.86, drag=0.46, gravity=0.24, hit_radius=0.016, joints=4)
    s.add_spring("bang_sweep", "bang", stiffness=0.90, drag=0.48, gravity=0.22, hit_radius=0.015, joints=4)
    return table_hairline([(0.0, 50.0), (40.0, 58.0), (72.0, 86.0), (96.0, 90.0), (125.0, 110.0), (180.0, 124.0)])


def build_slicked_back_duke(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """10. 반깐·올백 노블컷 (남): 뒤로 넘긴 볼륨 웨이브 + 한 가닥 내려온 포인트 잔머리."""
    m = s.m

    # Layer 1: 귀 위로 깔끔하게 뒤로 빗어 넘긴 슬릭 사이드 + 단정한 귀족 뒷머리
    for th in (-104.0, -82.0, 82.0, 104.0):
        ctrl = s.meridian_ctrl(th, 42.0, 94.0, 0.006, 0.008, 0.0045, n_ctrl=5, theta_drift_deg=(14.0 if th > 0 else -14.0), kind="skull")
        s.add_strand(ctrl, 0.036, 0.0075, 1, "under", profile="crescent", ao=0.78, accent=True, taper_len=0.018, tip_frac=0.0, lod2_keep=True, sway_scale=0.08)
    for idx, th in enumerate((-162.0, -138.0, -116.0, 116.0, 138.0, 162.0, 180.0)):
        sh = 0.0018 if (idx % 2 == 0) else -0.0015
        ctrl = s.meridian_ctrl(th, 14.0, 126.0, 0.009 + sh * 0.4, 0.0145 + sh, 0.0055 + sh * 0.4, n_ctrl=6, kind="skull")
        s.add_strand(ctrl, 0.046, 0.011, 1, "back", profile="crescent", taper_len=0.026, tip_frac=0.22, lod2_keep=True, sway_scale=0.18)

    # Layer 2: 이마선에서 뒤로 웅장하고 매끈하게 넘어가는 넓은 노블 올백 웨이브 9청크(±1.6mm shingle, 중앙 혹 제거!)
    for idx, x_th in enumerate((-44.0, -32.0, -21.0, -10.0, 0.0, 10.0, 21.0, 32.0, 44.0)):
        sh = 0.0016 if (idx % 2 == 0) else -0.0014
        # 이마 전체에 걸쳐 완만하고 우아한 노블 아치 볼륨(16~18mm)
        arch_lift = 0.0175 - 0.000032 * (x_th * x_th) + sh
        p0 = s.scalp_pt(x_th, 50.0, 0.0065, "skull")
        p1 = s.scalp_pt(x_th * 0.94, 34.0, arch_lift, "skull") + np.array([0.0, 0.0035, 0.003])
        p2 = s.scalp_pt(x_th * 0.80, 12.0, arch_lift * 0.94, "skull")
        back_th = (180.0 - x_th * 1.45) % 360.0
        p3 = s.scalp_pt(back_th, 36.0, 0.017 + sh, "skull")
        p4 = s.scalp_pt(back_th, 76.0, 0.014 + sh, "skull")
        p5 = s.scalp_pt(back_th, 108.0, 0.009 + sh * 0.5, "skull")
        ctrl = np.asarray([p0, p1, p2, p3, p4, p5], dtype=np.float64)
        s.add_strand(ctrl, 0.036, 0.011, 2, "crown", profile="almond", taper_len=0.032, tip_frac=0.24, lod2_keep=(idx % 2 == 0 or abs(x_th) <= 10.0), sway_scale=0.18)

    # Layer 3: 로판 북부대공 시그니처 — 이마 한쪽으로 섹시하게 흘러내린 포인트 잔머리 1(+보조 미세 가닥 1) + 날카로운 관자 스윕
    p0 = s.scalp_pt(-14.0, 42.0, 0.014, "skull")
    p1 = s.scalp_pt(-18.0, 56.0, 0.024, "skull") + np.array([0.0, 0.004, 0.008])
    p2 = s.scalp_pt(-10.0, 74.0, 0.018, "skull") + np.array([0.004, -0.004, 0.010])
    p3 = s.scalp_pt(-16.0, 88.0 + 6.0 * s.bang_q, 0.012, "skull") + np.array([-0.002, -0.014 - 0.012 * s.bang_q, 0.007])
    p3[1] = max(p3[1], m["eye_top_y"] - 0.002)
    s.add_strand(np.asarray([p0, p1, p2, p3], dtype=np.float64), 0.016, 0.0075, 3, "whisp", profile="diamond", taper_len=0.036, tip_frac=0.35, lod2_keep=True, sway_scale=0.85, spring_chain="whisp_point")

    # 보조 짧은 반깐 포인트 가닥
    q0 = s.scalp_pt(22.0, 44.0, 0.013, "skull")
    q1 = s.scalp_pt(28.0, 58.0, 0.021, "skull") + np.array([0.0, 0.002, 0.006])
    q2 = s.scalp_pt(38.0, 72.0 + 4.0 * s.bang_q, 0.012, "skull") + np.array([0.004, -0.006 - 0.008 * s.bang_q, 0.004])
    s.add_strand(np.asarray([q0, q1, q2], dtype=np.float64), 0.014, 0.0065, 3, "bang", profile="diamond", taper_len=0.024, tip_frac=0.30, lod2_keep=True, sway_scale=0.55)

    for sgn in (1.0, -1.0):
        # 귀 위 노블 슬릭 템플 스윕 + 깔끔한 구레나룻
        t0 = s.scalp_pt(sgn * 54.0, 62.0, 0.012, "skull")
        t1 = s.scalp_pt(sgn * 82.0, 74.0, 0.015, "skull")
        t2 = s.scalp_pt(sgn * 116.0, 92.0, 0.012, "skull")
        s.add_strand(np.asarray([t0, t1, t2], dtype=np.float64), 0.024, 0.009, 3, "side", profile="almond", taper_len=0.026, tip_frac=0.22, lod2_keep=True, sway_scale=0.12)
        ctrl_sb = s.meridian_ctrl(sgn * 66.0, 64.0, 102.0, 0.0055, 0.0065, 0.004, n_ctrl=5, kind="skull")
        s.add_strand(ctrl_sb, 0.014, 0.005, 3, "side", profile="diamond", taper_len=0.018, tip_frac=0.12, lod2_keep=False, sway_scale=0.08)

    s.add_spring("whisp_point", "whisp", stiffness=0.82, drag=0.44, gravity=0.28, hit_radius=0.014, joints=4)
    return table_hairline([(0.0, 48.0), (38.0, 56.0), (70.0, 84.0), (96.0, 90.0), (125.0, 110.0), (180.0, 126.0)])


def build_braided_crown(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """11. 로판 브레이드 업스타일: 정수리 3가닥 땋은 띠 + 뒷머리 번 + 로판 금장 띠 + 내려온 롱 컬 2가닥."""
    m = s.m
    bun_dir = sph(180.0, 62.0)
    bun_center = s.frame.scalp(bun_dir, 0.024 + 0.006 * s.vol, "skull")[0]
    bun_axis = unit(bun_center - s.c)

    # Layer 1: 이마·옆·목덜미에서 뒷머리 번으로 부드럽게 올려 묶은 13 두피 청크
    targets = [
        (-36.0, 54.0), (-12.0, 52.0), (12.0, 52.0), (36.0, 54.0),
        (60.0, 74.0), (88.0, 96.0), (118.0, 118.0), (150.0, 132.0),
        (180.0, 136.0), (-150.0, 132.0), (-118.0, 118.0), (-88.0, 96.0), (-60.0, 74.0),
    ]
    for idx, (th, ph) in enumerate(targets):
        sh = 0.0014 if (idx % 2 == 0) else -0.0012
        ctrl = s.converge_ctrl(th, ph, bun_center - bun_axis * 0.012, h_root=0.006 + sh * 0.4, h_mid=0.0125 + sh)
        s.add_strand(ctrl, 0.044, 0.0095, 1, "crown", profile="crescent", taper_len=0.016, tip_frac=0.0, lod2_keep=True, sway_scale=0.04)

    # Layer 2A: 정수리를 가로지르는 진짜 3가닥 교차 땋은 띠 (Braided Crown!)
    # 정수리 앞쪽(기울기 20°) 좌 귀 위 → 정수리 → 우 귀 위 대원 호를 따라 3가닥 위상차 120° 사인 엮임!
    tilt = math.radians(20.0)
    top_v = np.array([0.0, math.cos(tilt), math.sin(tilt)])
    x_v = np.array([1.0, 0.0, 0.0])
    plane_n = unit(np.cross(x_v, top_v))
    u_arc = np.linspace(-0.56 * math.pi, 0.56 * math.pi, 48)
    arc_dirs = unit(np.outer(np.cos(u_arc), top_v) + np.outer(np.sin(u_arc), x_v))
    arc_base = s.frame.scalp(arc_dirs, 0.0155 + 0.004 * s.vol, "skull")
    arc_out = unit(arc_base - s.c)
    arc_lat = unit(np.tile(plane_n, (len(arc_base), 1)) - np.einsum("ij,j->i", arc_out, plane_n)[:, None] * arc_out)
    for k in range(3):
        phase = 2.0 * math.pi * k / 3.0
        # 7.5회 교차 땋기 패턴
        ang = 2.0 * math.pi * 7.5 * np.linspace(0.0, 1.0, len(u_arc)) + phase
        p_braid = arc_base + arc_lat * (0.0085 * np.sin(ang))[:, None] + arc_out * (0.0048 * np.cos(2.0 * ang))[:, None]
        s.add_strand(
            resample_polyline(p_braid, count=24),
            0.014,
            0.0095,
            2,
            "braid",
            profile="round",
            hints=resample_polyline(arc_out, count=24),
            taper_len=0.018,
            tip_frac=0.0,
            lod2_keep=(k < 2),
            sway_scale=0.03,
        )

    # Layer 2B: 우아한 뒷머리 코일 번(Chignon Bun — 4단 감긴 헤어 로프)
    hlp = np.array([0.0, 1.0, 0.0])
    bu = unit(np.cross(bun_axis, hlp))
    bv = unit(np.cross(bun_axis, bu))
    for ring_i, (rad_b, off_ax, w_b) in enumerate(((0.038, 0.000, 0.022), (0.032, 0.013, 0.020), (0.022, 0.023, 0.018), (0.012, 0.030, 0.016))):
        ang = np.linspace(0.0, 2.0 * math.pi * 0.94, 18) + ring_i * 0.9
        r_scaled = rad_b * (1.0 + 0.16 * s.vol)
        pts_b = bun_center[None, :] + bun_axis[None, :] * (off_ax + 0.0025 * np.sin(ang * 3.0))[:, None] + (np.cos(ang)[:, None] * bu + np.sin(ang)[:, None] * bv) * r_scaled
        h_b = unit(pts_b - bun_center[None, :])
        s.add_strand(pts_b, w_b, 0.013, 2, "bun", profile="round", hints=h_b, taper_len=0.018, tip_frac=0.12, lod2_keep=(ring_i < 2), sway_scale=0.04)

    # 구조 장식: 로판 황녀 금장 필릿 띠 + 뒷번 왕관 링 + 진주 구슬 5개 (hair-accent)
    fillet_dirs = unit(np.outer(np.cos(u_arc[4:-4]), unit(np.array([0.0, math.cos(math.radians(32.0)), math.sin(math.radians(32.0))]))) + np.outer(np.sin(u_arc[4:-4]), x_v))
    fillet_pts = s.frame.scalp(fillet_dirs, 0.0185 + 0.004 * s.vol, "skull")
    s.add_ornament(make_tube_ornament("royal_fillet", resample_polyline(fillet_pts, count=22), np.full(22, 0.0032), sides=6))
    s.add_ornament(make_torus_ornament("bun_circlet", bun_center - bun_axis * 0.004, bun_axis, 0.042 * (1.0 + 0.14 * s.vol), 0.0036, axial_scale=1.1, segs=22, sides=6))
    for pk in (-0.30, -0.15, 0.0, 0.15, 0.30):
        pd = unit(math.cos(pk * math.pi) * unit(np.array([0.0, math.cos(math.radians(32.0)), math.sin(math.radians(32.0))])) + math.sin(pk * math.pi) * x_v)
        pp = s.frame.scalp(pd, 0.0225 + 0.004 * s.vol, "skull")[0]
        s.add_ornament(make_ellipsoid_ornament(f"royal_pearl_{pk:+.2f}", pp, (0.0042, 0.0042, 0.0042), level=1))

    # Layer 3: 로판 우아한 얇은 커튼 앞머리 4가닥 + 귀 옆으로 내려오는 롱 나선 컬 2가닥(+보조 서브 컬 2가닥)
    for sgn in (1.0, -1.0):
        ctrl_b1 = s.bang_ctrl(sgn * 14.0, m["eye_top_y"] + 0.008, phi_root=22.0, h_root=0.012, h_arch=0.019, h_tip=0.0085, drift_deg=sgn * 26.0)
        s.add_strand(ctrl_b1, 0.025, 0.008, 3, "bang", profile="almond", taper_len=0.028, tip_frac=0.24, lod2_keep=True, sway_scale=0.40)
        ctrl_b2 = s.bang_ctrl(sgn * 34.0, m["eye_top_y"] + 0.004, phi_root=24.0, h_root=0.011, h_arch=0.018, h_tip=0.0085, drift_deg=sgn * 18.0)
        s.add_strand(ctrl_b2, 0.022, 0.0075, 3, "bang", profile="almond", taper_len=0.028, tip_frac=0.24, lod2_keep=False, sway_scale=0.45)

    for sgn, ch in ((1.0, "curl_L"), (-1.0, "curl_R")):
        # 주 롱 나선 컬(어깨 앞 가슴까지 3.2회전 나선!)
        t_c = np.linspace(0.0, 1.0, 26)
        p_top = s.scalp_pt(sgn * 62.0, 74.0, 0.014, "skull")
        y_end = m["chest_y"] + 0.03 - 0.012 * s.bang_q
        spine_y = p_top[1] + (y_end - p_top[1]) * t_c
        spine_x = p_top[0] + sgn * 0.014 * smoothstep(0.0, 0.5, t_c)
        spine_z = p_top[2] + (m["chest_z"] - p_top[2] + 0.012) * smoothstep(0.15, 0.90, t_c)
        helix_r = 0.012 * smoothstep(0.15, 0.45, t_c) * (1.0 - 0.35 * smoothstep(0.75, 1.0, t_c)) * (1.0 + 0.25 * s.vol)
        ang = sgn * 2.0 * math.pi * 3.0 * t_c
        curl_pts = np.stack([spine_x + helix_r * np.cos(ang), spine_y, spine_z + helix_r * np.sin(ang)], axis=1)
        s.add_strand(resample_polyline(curl_pts, count=18), 0.024, 0.010, 3, "side", profile="almond", twist_deg=sgn * 60.0, taper_len=0.055, tip_frac=0.35, lod2_keep=True, sway_scale=1.10, spring_chain=ch)
        # 보조 가느다란 동반 컬
        ang2 = ang + math.pi * 0.85
        curl_pts2 = np.stack([spine_x + (helix_r * 0.8 + 0.004) * np.cos(ang2), spine_y + 0.018 * t_c, spine_z + (helix_r * 0.8 + 0.004) * np.sin(ang2)], axis=1)
        s.add_strand(resample_polyline(curl_pts2[:21], count=14), 0.015, 0.007, 3, "whisp", profile="almond", taper_len=0.045, tip_frac=0.38, lod2_keep=False, sway_scale=1.05, spring_chain=ch)

    s.add_spring("curl_L", "curl", stiffness=0.58, drag=0.36, gravity=0.34, hit_radius=0.018, joints=5)
    s.add_spring("curl_R", "curl", stiffness=0.58, drag=0.36, gravity=0.34, hit_radius=0.018, joints=5)
    return table_hairline([(0.0, 52.0), (42.0, 58.0), (68.0, 78.0), (96.0, 98.0), (124.0, 120.0), (154.0, 132.0), (180.0, 136.0)])


def build_murim_topknot(s: SketchV2) -> Callable[[np.ndarray], np.ndarray]:
    """12. 무협 반묶음 장발: 상투 + 상투관 + 옥비녀 장식 + 등 뒤로 흩날리는 직모 장발 + 날카로운 옆머리."""
    m = s.m
    knot_dir = sph(180.0, 22.0)
    knot_base = s.frame.scalp(knot_dir, 0.011 + 0.003 * s.vol, "skull")[0]
    knot_axis = unit(np.array([0.0, 0.94, -0.34]))

    # Layer 1A: 윗머리(반묶음) → 상투 밑동으로 팽팽하게 모아 올린 8 두피 청크
    for th, ph in ((-42.0, 52.0), (-16.0, 50.0), (16.0, 50.0), (42.0, 52.0), (66.0, 72.0), (90.0, 86.0), (-90.0, 86.0), (-66.0, 72.0)):
        ctrl = s.converge_ctrl(th, ph, knot_base, h_root=0.005, h_mid=0.0095)
        s.add_strand(ctrl, 0.038, 0.009, 1, "crown", profile="crescent", taper_len=0.016, tip_frac=0.0, lod2_keep=True, sway_scale=0.04)

    # Layer 1B: 아랫머리 — 등 뒤로 웅장하게 흩날리는 무협 직모 장발 9청크(±2mm shingle)
    y_long = m["waist_y"] + 0.08
    for idx, th in enumerate((-162.0, -140.0, -118.0, -96.0, 96.0, 118.0, 140.0, 162.0, 180.0)):
        ab = abs(th)
        sh = 0.0020 if (idx % 2 == 0) else -0.0018
        v_hem = float(np.interp(ab, [94.0, 140.0, 180.0], [0.065, 0.025, 0.0]))
        ctrl = s.long_cascade_ctrl(
            th,
            y_long + v_hem,
            route="back",
            phi_start=62.0,
            h_root=0.0085 + sh * 0.4,
            h_drop=0.0145 + sh,
            standoff=0.019 + sh,
            flare=0.012,
            wave_amp=0.006,
            wave_cycles=1.0,
            wave_phase=idx * 0.5,
            x_end_scale=1.16,
        )
        chain = "back_L" if 90.0 <= th <= 165.0 else ("back_R" if -165.0 <= th <= -90.0 else "back_C")
        s.add_strand(ctrl, 0.048, 0.0115, 1, "back", profile="diamond", taper_len=0.075, tip_frac=0.26, lod2_keep=True, spring_chain=chain)

    # Layer 2A: 우뚝 솟은 상투(Topknot) 코일 3단 + 바람결 레이어드 뒷머리 5청크
    hlp = np.array([1.0, 0.0, 0.0])
    ku = unit(np.cross(knot_axis, hlp))
    kv = unit(np.cross(knot_axis, ku))
    for k_i, (r_k, h_k, w_k) in enumerate(((0.027, 0.010, 0.018), (0.024, 0.024, 0.017), (0.016, 0.038, 0.015))):
        ang = np.linspace(0.0, 2.0 * math.pi * 0.94, 16) + k_i * 1.1
        rk = r_k * (1.0 + 0.14 * s.vol)
        pts_k = knot_base[None, :] + knot_axis[None, :] * h_k + (np.cos(ang)[:, None] * ku + np.sin(ang)[:, None] * kv) * rk
        s.add_strand(pts_k, w_k, 0.012, 2, "bun", profile="round", hints=unit(pts_k - (knot_base + knot_axis * h_k)[None, :]), taper_len=0.016, tip_frac=0.0, lod2_keep=(k_i < 2), sway_scale=0.02)

    for idx, th in enumerate((-150.0, -118.0, 118.0, 150.0, 180.0)):
        ctrl = s.long_cascade_ctrl(th, m["chest_y"] + 0.04, route="back", phi_start=64.0, h_root=0.011, h_drop=0.019, standoff=0.026, flare=0.018, wave_amp=0.010, wave_cycles=1.1, wave_phase=idx * 0.7, x_end_scale=1.24)
        chain = "back_L" if 90.0 <= th <= 165.0 else ("back_R" if -165.0 <= th <= -90.0 else "back_C")
        s.add_strand(ctrl, 0.034, 0.0105, 2, "mid", profile="diamond", taper_len=0.068, tip_frac=0.30, lod2_keep=(idx % 2 == 0), spring_chain=chain)

    # 구조 장식: 상투관(옥빛/금속 관 테두리) + 가로 옥비녀(15cm 테이퍼 막대 + 옥구슬 장식, hair-accent)
    s.add_ornament(make_torus_ornament("murim_coronet_bot", knot_base + knot_axis * 0.008, knot_axis, 0.030 * (1.0 + 0.12 * s.vol), 0.0055, axial_scale=1.6, segs=18, sides=6))
    c_top = make_torus_ornament("murim_coronet_top", knot_base + knot_axis * 0.024, knot_axis, 0.027 * (1.0 + 0.12 * s.vol), 0.0038, axial_scale=1.2, segs=16, sides=6)
    c_top.lod2_keep = False
    s.add_ornament(c_top)
    # 옥비녀: 상투 중간을 좌우(+X ↔ -X)로 관통하는 15cm 비녀
    pin_c = knot_base + knot_axis * 0.022
    ts_pin = np.linspace(-1.0, 1.0, 14)
    pin_path = pin_c[None, :] + np.outer(ts_pin * 0.076, np.array([1.0, 0.0, 0.0])) - np.outer(0.004 * (ts_pin**2), knot_axis)
    pin_radii = 0.0032 * np.where(ts_pin < -0.65, smoothstep(-1.05, -0.65, ts_pin), 1.0) + 0.0007
    s.add_ornament(make_tube_ornament("murim_jade_pin_rod", pin_path, pin_radii, sides=6))
    s.add_ornament(make_ellipsoid_ornament("murim_jade_bead_main", pin_path[-1] + np.array([0.006, 0.0, 0.0]), (0.0095, 0.0085, 0.0085), level=1))
    b_sub = make_ellipsoid_ornament("murim_jade_bead_sub", pin_path[-1] + np.array([0.017, 0.0, 0.0]), (0.0055, 0.0055, 0.0055), level=1)
    b_sub.lod2_keep = False
    s.add_ornament(b_sub)
    b_end = make_ellipsoid_ornament("murim_jade_cap_end", pin_path[0] - np.array([0.003, 0.0, 0.0]), (0.0042, 0.0042, 0.0042), level=1)
    b_end.lod2_keep = False
    s.add_ornament(b_end)

    # Layer 3: 무협 시그니처 날카로운 얼굴 옆 장발 가닥 4개 + 고고한 이마 포인트 잔머리 2가닥
    for sgn, ch in ((1.0, "side_L"), (-1.0, "side_R")):
        ctrl_s1 = s.hanging_ctrl(sgn * 56.0, m["shoulder_y"] + 0.03 - 0.014 * s.bang_q, phi_start=26.0, phi_drop=84.0, h_root=0.010, h_drop=0.015, flare=0.006, curl_in=0.0, out_end=0.016, fwd_shift=0.016)
        s.add_strand(ctrl_s1, 0.022, 0.0085, 3, "side", profile="diamond", taper_len=0.055, tip_frac=0.34, lod2_keep=True, spring_chain=ch)
        ctrl_s2 = s.hanging_ctrl(sgn * 74.0, m["chin_y"] - 0.008, phi_start=34.0, phi_drop=88.0, h_root=0.009, h_drop=0.014, flare=0.008, curl_in=0.0, out_end=0.014, fwd_shift=0.008)
        s.add_strand(ctrl_s2, 0.016, 0.0068, 3, "whisp", profile="diamond", taper_len=0.042, tip_frac=0.34, lod2_keep=False, spring_chain=ch)

    for sgn, th, dy in ((1.0, 26.0, 0.008), (-1.0, -22.0, 0.002)):
        ctrl_w = s.bang_ctrl(th, m["brow_top_y"] + dy, phi_root=24.0, h_root=0.010, h_arch=0.017, h_tip=0.008, drift_deg=sgn * 16.0)
        s.add_strand(ctrl_w, 0.014, 0.0065, 3, "bang", profile="diamond", taper_len=0.026, tip_frac=0.30, lod2_keep=True, sway_scale=0.60)

    for cid in ("back_L", "back_C", "back_R"):
        s.add_spring(cid, "back", stiffness=0.50, drag=0.34, gravity=0.36, hit_radius=0.022, joints=6)
    s.add_spring("side_L", "side", stiffness=0.72, drag=0.40, gravity=0.30, hit_radius=0.016, joints=5)
    s.add_spring("side_R", "side", stiffness=0.72, drag=0.40, gravity=0.30, hit_radius=0.016, joints=5)
    return table_hairline([(0.0, 50.0), (42.0, 56.0), (68.0, 76.0), (96.0, 96.0), (124.0, 118.0), (154.0, 132.0), (180.0, 136.0)])


STYLE_BUILDERS: dict[str, Callable[[SketchV2], Callable[[np.ndarray], np.ndarray]]] = {
    "soft-bob": build_soft_bob,
    "romance-long": build_romance_long,
    "hime-cut": build_hime_cut,
    "action-pony": build_action_pony,
    "twin-tail": build_twin_tail,
    "short-layered": build_short_layered,
    "wolf-layered": build_wolf_layered,
    "dandy-two-block": build_dandy_two_block,
    "comma-hair": build_comma_hair,
    "slicked-back-duke": build_slicked_back_duke,
    "braided-crown": build_braided_crown,
    "murim-topknot": build_murim_topknot,
}


def build_hair_style(frame: HeadFrameV2, style_id: str, params: dict[str, float] | None = None) -> HairStyleBuild:
    params = dict(params or {})
    rng = Prng(fnv1a32(f"toonstudio-hair-v2/{style_id}/{frame.archetype_id}"))
    sketch = SketchV2(frame, rng, style_id, params)
    cap_region = STYLE_BUILDERS[style_id](sketch)
    sway_val = float(params.get("sway", 0.0))
    strands = []
    for st in sketch.strands:
        st_c = collide_strand(frame, st)
        if abs(sway_val) > 1e-6:
            st_c = apply_sway_to_strand(frame, st_c, sway_val)
        strands.append(st_c)
    return HairStyleBuild(
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
# 텍스처(엔젤링 램프 JPEG, Blender 내장 인코더 — PIL 불필요) & 단조 UV0.v 정렬
# ---------------------------------------------------------------------------


def bake_hair_ramp_texture(size: int = TEXTURE_SIZE, quality: int = 92, seed: int = 19) -> tuple[bytes, dict[str, Any]]:
    """512×512 웹툰 헤어 상대색 램프 JPEG: 뿌리(0.0)→엔젤링 하이라이트(0.30..0.42)→끝(1.0), 평균 휘도 >= 0.80."""
    rng = Prng(seed)
    v = (np.arange(size) + 0.5) / size  # 0=상단(뿌리), 1=하단(끝)
    col_w = size // TEXTURE_COLUMNS
    img = np.zeros((size, size), dtype=np.float64)

    knots = np.array([rng.next() for _ in range(size // 3 + 6)], dtype=np.float64)
    xs = np.arange(size) / 3.0
    i0 = np.floor(xs).astype(int)
    f = xs - i0
    f = f * f * (3.0 - 2.0 * f)
    fiber = knots[i0] * (1.0 - f) + knots[i0 + 1] * f

    band_c = 0.5 * (BAND_V[0] + BAND_V[1])
    band_h = 0.5 * (BAND_V[1] - BAND_V[0])

    upper = 0.80 + 0.11 * smoothstep(0.0, 0.16, v)
    lower = 0.91 + 0.06 * smoothstep(BAND_V[1], 1.0, v)
    ramp = (1.0 - smoothstep(BAND_V[0], BAND_V[1], v)) * upper + smoothstep(BAND_V[0], BAND_V[1], v) * lower

    for col in range(TEXTURE_COLUMNS):
        x0, x1 = col * col_w, (col + 1) * col_w
        lu = (np.arange(x0, x1) - x0 + 0.5) / col_w
        val = ramp[:, None] * np.ones((1, x1 - x0))
        # 세로 머리카락 결(미세 명암 스트라이프)
        lines = 1.0 - 0.055 * (fiber[x0:x1][None, :] - 0.5) * smoothstep(0.03, 0.18, v)[:, None]
        val = val * lines
        # 지그재그 웹툰 엔젤링 하이라이트 밴드
        teeth = 2.0 + (col % 2)
        phase = 0.25 * col
        zig = 0.36 * band_h * (np.abs(((lu * teeth + phase) % 1.0) - 0.5) * 4.0 - 1.0)
        dist = np.abs(v[:, None] - (band_c + zig[None, :])) / (0.60 * band_h)
        band = smoothstep(1.0, 0.45, dist)
        val = val + (1.0 - val) * 0.96 * band
        img[:, x0:x1] = val

    mean = float(img.mean())
    if mean < TEXTURE_MIN_MEAN:
        img = 1.0 - (1.0 - img) * ((1.0 - TEXTURE_MIN_MEAN) / max(1.0 - mean, 1e-6))
    img = np.clip(img, 0.0, 1.0).astype(np.float32)
    rgb = np.stack([img, img, img], axis=-1)
    data = bb2.encode_baseline_jpeg_bpy(rgb, quality=quality)
    return data, {
        "bytes": len(data),
        "size": size,
        "meanLuminance": round(float(img.mean()), 4),
        "minLuminance": round(float(img.min()), 4),
        "columns": TEXTURE_COLUMNS,
    }


def _band_arc_s(strand: BezierStrand) -> float | None:
    if strand.band_y is None:
        return None
    p = strand.points
    if p[0, 1] <= strand.band_y:
        return None
    below = np.flatnonzero(p[:, 1] <= strand.band_y)
    if not len(below):
        return None
    i = int(below[0])
    s = arc_lengths(p)
    y0, y1 = p[i - 1, 1], p[i, 1]
    frac = (y0 - strand.band_y) / max(y0 - y1, 1e-9)
    return float(s[i - 1] + frac * (s[i] - s[i - 1]))


def monotonic_strand_v(strand: BezierStrand, s: np.ndarray) -> np.ndarray:
    """UV0.v 뿌리(0.02) → 끝(0.98) 엄격 단조 정렬 + 엔젤링 밴드 높이 정합."""
    length = max(strand.length(), 1e-5)
    t = np.clip(s / length, 0.0, 1.0)
    bs = _band_arc_s(strand)
    if bs is None:
        return UV_V_MIN + (UV_V_MAX - UV_V_MIN) * t
    a = max(bs - BAND_HALF_M, 0.06 * length)
    b = min(bs + BAND_HALF_M, 0.92 * length)
    if b <= a + 0.01 * length:
        return UV_V_MIN + (UV_V_MAX - UV_V_MIN) * t
    return np.interp(s, [0.0, a, b, length], [UV_V_MIN, BAND_V[0], BAND_V[1], UV_V_MAX])


# ---------------------------------------------------------------------------
# 68본 스키닝 · 8 체형 Morph · SpringBone 메타데이터 생성
# ---------------------------------------------------------------------------


def hair_skin_weights(frame: HeadFrameV2, pts: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """턱 위는 mixamorig:Head 100%, 아래로 늘어진 긴 머리는 Neck→Spine2→Spine1→Spine + 어깨 본 완만 보간."""
    names = frame.joint_names
    head_j = names.index("mixamorig:Head")
    chain_j = [names.index(n) for n in ("mixamorig:Neck", "mixamorig:Spine2", "mixamorig:Spine1", "mixamorig:Spine")]
    chain_y = np.array([frame.joint_tpose[j, 1] for j in chain_j], dtype=np.float64)
    sh_j = {1.0: names.index("mixamorig:LeftShoulder"), -1.0: names.index("mixamorig:RightShoulder")}

    y = pts[:, 1]
    y_hi = frame.marks["chin_y"] + 0.014
    y_lo = frame.marks["shoulder_y"] - 0.025
    w_head = smoothstep(y_lo, y_hi, y)
    dist_c = np.linalg.norm(pts - frame.center, axis=1)
    w_head = np.where(y > y_lo, np.maximum(w_head, smoothstep(0.115, 0.095, dist_c)), w_head)
    rest = 1.0 - w_head

    n = len(pts)
    dense: dict[int, np.ndarray] = {head_j: w_head.copy()}
    order = np.argsort(-chain_y)
    cy = chain_y[order]
    cj = [chain_j[i] for i in order]
    for j in cj:
        dense.setdefault(j, np.zeros(n, dtype=np.float64))
    pos = np.clip(y, cy[-1], cy[0])
    for k in range(len(cy) - 1):
        hi, lo = cy[k], cy[k + 1]
        inside = (pos <= hi) & (pos >= lo) if k == len(cy) - 2 else (pos <= hi) & (pos > lo)
        frac = np.where(inside, (pos - lo) / max(hi - lo, 1e-9), 0.0)
        dense[cj[k]] += np.where(inside, rest * frac, 0.0)
        dense[cj[k + 1]] += np.where(inside, rest * (1.0 - frac), 0.0)
    dense[cj[0]] += np.where(y > cy[0], rest, 0.0)

    # 어깨 위 얹힌 긴 머리 어깨 본 30% 혼합
    side = np.sign(pts[:, 0])
    sh_y = frame.marks["shoulder_y"]
    band = smoothstep(sh_y - 0.09, sh_y - 0.03, y) * smoothstep(sh_y + 0.05, sh_y + 0.01, y)
    share = 0.30 * smoothstep(0.075, 0.115, np.abs(pts[:, 0])) * band
    for sgn, sj in sh_j.items():
        mask = side == sgn
        moved = np.zeros(n, dtype=np.float64)
        for j in cj:
            take = dense[j] * share * mask
            dense[j] -= take
            moved += take
        dense[sj] = dense.get(sj, np.zeros(n, dtype=np.float64)) + moved

    jlist = sorted(dense)
    mat = np.stack([dense[j] for j in jlist], axis=1)
    top4_idx = np.argsort(-mat, axis=1, kind="stable")[:, :4]
    w4 = np.take_along_axis(mat, top4_idx, axis=1)
    w4 = np.where(w4 > 1e-4, w4, 0.0)
    w4 /= np.maximum(w4.sum(axis=1, keepdims=True), 1e-12)
    j4 = np.array(jlist, dtype=np.int64)[top4_idx]
    j4 = np.where(w4 > 0.0, j4, 0)
    return j4, w4, w_head


def compute_head_body_morphs_8(frame: HeadFrameV2, pts: np.ndarray, w_head: np.ndarray) -> dict[str, np.ndarray]:
    """머리 부착 체형 8개 morph(`param:{height,legLength,neckLength,headSize}:±`) 정확 추종 계산."""
    hits_h = frame.head.closest(pts)
    offset = pts - hits_h.point
    need_body = w_head < 1.0 - 1e-6
    body_hits = frame.body.closest(pts[need_body]) if need_body.any() else None
    out: dict[str, np.ndarray] = {}
    for mname in HAIR_MORPHS_8:
        h_part = hits_h.interpolate(frame.head.triangles, frame.head_deltas[mname]) + (frame.head_scale[mname] - 1.0) * offset
        delta = h_part * w_head[:, None]
        if body_hits is not None:
            b_part = body_hits.interpolate(frame.body.triangles, frame.body_deltas[mname])
            delta[need_body] += b_part * (1.0 - w_head[need_body])[:, None]
        delta = expr.clamp_delta_magnitude(delta, expr.BODY_MAX_DELTA_M)
        delta = expr.ensure_min_param_delta(delta, mname, pts)
        out[mname] = delta.astype(np.float32)
    return out


def build_springbone_metadata(frame: HeadFrameV2, build: HairStyleBuild) -> dict[str, Any]:
    """VRM 1.0 `VRMC_springBone` 및 Character Kit v2 physics 호환 SpringBone 체인·콜라이더 메타데이터."""
    m = frame.marks
    head_c = frame.center
    head_r = float(m["skull_radius"]) * 1.02
    neck_j = frame.joint("mixamorig:Neck")
    head_j = frame.joint("mixamorig:Head")
    spine2_j = frame.joint("mixamorig:Spine2")

    colliders = [
        {
            "id": "head_sphere",
            "bone": "mixamorig:Head",
            "shape": "sphere",
            "offsetGltf": [round(float(v), 5) for v in (head_c - head_j)],
            "radius": round(head_r, 5),
        },
        {
            "id": "neck_capsule",
            "bone": "mixamorig:Neck",
            "shape": "capsule",
            "offsetGltf": [0.0, 0.0, 0.0],
            "tailGltf": [round(float(v), 5) for v in (head_j - neck_j)],
            "radius": round(float(bb2.ARCHETYPES[frame.archetype_id].neck_rx) * 1.05, 5),
        },
        {
            "id": "upper_chest_sphere",
            "bone": "mixamorig:Spine2",
            "shape": "sphere",
            "offsetGltf": [0.0, 0.0, round(float(0.5 * (m["back_z"] + m["chest_z"]) - spine2_j[2]), 5)],
            "radius": round(float(bb2.ARCHETYPES[frame.archetype_id].chest_rx) * 0.92, 5),
        },
    ]

    chains_out = []
    for sp in build.spring_specs:
        members = [st for st in build.strands if st.spring_chain == sp.chain_id]
        if not members:
            # 폴백: 해당 region(group)의 첫 가닥
            members = [st for st in build.strands if st.group == sp.region][:2]
        if not members:
            members = build.strands[:1]
        # 멤버 가닥들의 평균 베지어 중심선 샘플링 → 정확한 3D 가상 SpringBone 관절 위치
        sampled = np.stack([resample_polyline(st.points, count=sp.num_joints) for st in members], axis=0)
        mean_curve = sampled.mean(axis=0)
        # 시작점이 너무 짧으면 안전 확장
        if float(arc_lengths(mean_curve)[-1]) < 0.03:
            mean_curve[-1] = mean_curve[0] + np.array([0.0, -0.04, 0.0])
        joints_meta = []
        for idx_j in range(len(mean_curve)):
            p = mean_curve[idx_j]
            joints_meta.append({
                "name": f"TS_Spring_{build.style_id}_{sp.chain_id}_{idx_j}",
                "positionGltf": [round(float(v), 5) for v in p],
                "localOffsetFromHead": [round(float(v), 5) for v in (p - head_j)],
                "hitRadius": round(float(sp.hit_radius * (1.0 - 0.18 * (idx_j / max(len(mean_curve) - 1, 1)))), 5),
                "stiffness": round(float(sp.stiffness * (1.10 - 0.25 * (idx_j / max(len(mean_curve) - 1, 1)))), 4),
                "dragForce": round(float(sp.drag_force), 4),
                "gravityPower": round(float(sp.gravity_power), 4),
                "gravityDir": [0.0, -1.0, 0.0],
            })
        chains_out.append({
            "id": sp.chain_id,
            "region": sp.region,
            "anchorBone": "mixamorig:Head",
            "colliderIds": ["head_sphere", "neck_capsule", "upper_chest_sphere"],
            "strandCount": len(members),
            "lengthM": round(float(arc_lengths(mean_curve)[-1]), 4),
            "hitRadius": round(float(sp.hit_radius), 5),
            "stiffness": round(float(sp.stiffness), 4),
            "dragForce": round(float(sp.drag_force), 4),
            "gravityPower": round(float(sp.gravity_power), 4),
            "joints": joints_meta,
        })

    return {
        "schema": "toonstudio.hair-springbone/1",
        "vrmSpec": "VRMC_springBone-1.0",
        "styleId": build.style_id,
        "fittedBase": frame.archetype_id,
        "chainCount": len(chains_out),
        "colliders": colliders,
        "chains": chains_out,
    }


# ---------------------------------------------------------------------------
# LOD 3단 조립 (LOD0 / LOD1 / LOD2) & 형태 변형(shape:bang-length / volume / sway)
# ---------------------------------------------------------------------------


@dataclass
class HairLodMesh:
    level: int
    positions: np.ndarray
    triangles: np.ndarray
    tri_zone: np.ndarray  # 0=hair, 1=hair-tip, 2=hair-accent
    normals: np.ndarray
    uv0: np.ndarray
    uv1: np.ndarray
    color0: np.ndarray  # (N,3) grayscale AO
    joints: np.ndarray
    weights: np.ndarray
    morphs: dict[str, np.ndarray]  # 8 body + 6 shape = 14 morphs
    ring_counts: list[int]
    uv0_v_monotonic_ok: bool
    uv_bounds: tuple[float, float]


def _blended_toon_normals(positions: np.ndarray, triangles: np.ndarray, env: np.ndarray, outer: np.ndarray, amount: float = 0.70) -> np.ndarray:
    """툰 음영 법선: 바깥 면은 70% 엔벨로프 + 30% 기하 능선 법선(입체 청크 결 살림), 안쪽 면은 100% 기하 법선."""
    geo = vertex_normals(positions, triangles)
    k = amount * smoothstep(-0.10, 0.65, outer)
    return unit((1.0 - k)[:, None] * geo + k[:, None] * env)


def _assemble_lod_geometry(
    frame: HeadFrameV2,
    build: HairStyleBuild,
    level: int,
    density: float,
    fixed_counts: list[int] | None = None,
    fixed_sides: list[int] | None = None,
) -> dict[str, Any]:
    positions, triangles, uv0_list, uv1_list, ao_list, env_list, outer_list, zones = [], [], [], [], [], [], [], []
    offset = 0
    col_w = 1.0 / TEXTURE_COLUMNS
    included = [st for st in build.strands if not (level >= 2 and not st.lod2_keep)]
    used_counts: list[int] = []
    used_sides: list[int] = []
    monotonic_ok = True

    for idx, st in enumerate(included):
        fc = None if fixed_counts is None else fixed_counts[idx]
        fs = None if fixed_sides is None else fixed_sides[idx]
        sides = strand_sides(st, level) if fs is None else fs
        sw = sweep_bezier_strand(frame, st, level, fixed_count=fc, fixed_sides=sides, density=density)
        used_counts.append(sw.ring_count)
        used_sides.append(sides)

        col = (idx * 3) % TEXTURE_COLUMNS
        u_lo = col * col_w + UV_MARGIN
        u_hi = (col + 1) * col_w - UV_MARGIN
        u = u_lo + (u_hi - u_lo) * sw.lateral
        v = monotonic_strand_v(st, sw.s)

        # 단조 증가 엄격 검사(뿌리→끝 링 순)
        n_ring_verts = len(sw.positions) - 2
        if n_ring_verts >= 2 * sides:
            ring_vs = v[:n_ring_verts].reshape(-1, sides)[:, 0]
            if (np.diff(ring_vs) < -1e-6).any() or float(v[n_ring_verts]) > float(ring_vs[0]) + 1e-6 or float(v[n_ring_verts + 1]) < float(ring_vs[-1]) - 1e-6:
                monotonic_ok = False

        root_ao = 0.84 + 0.16 * smoothstep(0.0, 0.024, sw.s)
        layer_ao = 0.96 if st.layer == 3 else (0.94 if st.layer == 2 else 0.90)
        ao = np.clip(st.ao * layer_ao * root_ao * sw.shade, 0.42, 1.0)
        layer_code = 0.02 if st.layer == 3 else (0.50 if st.layer == 2 else 0.98)

        positions.append(sw.positions)
        triangles.append(sw.triangles + offset)
        uv0_list.append(np.stack([u, v], axis=1))
        uv1_list.append(np.stack([np.full(len(sw.t), layer_code), UV_V_MIN + (UV_V_MAX - UV_V_MIN) * sw.t], axis=1))
        ao_list.append(ao)
        env_list.append(sw.env)
        outer_list.append(sw.outer)

        # 삼각형 색 영역 — 쿼드 링 밴드 단위로 분할해 톱니(sawtooth) 경계 원천 차단!
        # 뒤통수 중간에 끝나는 Layer 2 미드 크라운 가닥은 hair-tip을 제외해 삼각 패치 얼룩을 원천 차단하고,
        # 하단 실루엣(Layer 1/3 및 포니·트윈테일)의 끝 14~18%만 세련된 그라데이션 팁 채널로 분리한다.
        length = max(st.length(), 1e-5)
        allow_tip = (st.layer != 2) or (st.group in ("pony", "tail"))
        eff_tip_frac = min(st.tip_frac, 0.17) if allow_tip else 0.0
        tip_len = float(np.clip(eff_tip_frac * length, 0.015, 0.14)) if eff_tip_frac > 0.0 else 0.0
        tip_start = 1.0 - tip_len / length if tip_len > 0.0 else 2.0
        n_tris = len(sw.triangles)
        if st.accent:
            zone = np.full(n_tris, 2, dtype=np.int64)
        elif level < 2 and tip_len > 0.0:
            zone = np.zeros(n_tris, dtype=np.int64)
            n_ring_verts = len(sw.positions) - 2
            ring_n = n_ring_verts // sides
            ring_ts = sw.t[:n_ring_verts].reshape(ring_n, sides)[:, 0]
            # 밴드 i (ring i ↔ ring i+1): 2 * sides 삼각형 전체에 동일 영역 배정
            band_tris = 2 * sides
            for bi in range(ring_n - 1):
                if 0.5 * (ring_ts[bi] + ring_ts[bi + 1]) >= tip_start:
                    zone[bi * band_tris : (bi + 1) * band_tris] = 1
            # 마지막 tip cap(끝 sides개 삼각형)은 tip 영역
            zone[n_tris - sides :] = 1
        else:
            zone = np.zeros(n_tris, dtype=np.int64)
        zones.append(zone)
        offset += len(sw.positions)

    # 구조 장식(머리끈·리본·상투관·옥비녀·로판 금장 띠)
    for orn in build.ornaments:
        if level >= 2 and not orn.lod2_keep:
            continue
        positions.append(orn.positions)
        triangles.append(orn.triangles + offset)
        uv0_list.append(orn.uvs)
        uv1_list.append(np.stack([np.full(len(orn.positions), 0.98), UV_V_MIN + (UV_V_MAX - UV_V_MIN) * orn.flow], axis=1))
        ao_list.append(np.full(len(orn.positions), orn.ao, dtype=np.float64))
        env_list.append(vertex_normals(orn.positions, orn.triangles))
        outer_list.append(np.zeros(len(orn.positions), dtype=np.float64))
        zones.append(np.full(len(orn.triangles), orn.zone, dtype=np.int64))
        offset += len(orn.positions)

    # 닫힌 수밀 솔리드 두피 볼륨 캡 (Layer 0)
    cap_start = offset
    cap_p, cap_t, cap_uv, cap_flow = build_solid_scalp_cap(frame, build.cap_region, level, volume_q=float(build.params.get("volume", 0.0)))
    positions.append(cap_p)
    triangles.append(cap_t + offset)
    uv0_list.append(cap_uv)
    uv1_list.append(np.stack([np.full(len(cap_p), 0.98), cap_flow], axis=1))
    ao_list.append(np.full(len(cap_p), 0.66, dtype=np.float64))
    env_list.append(vertex_normals(cap_p, cap_t))
    outer_list.append(np.zeros(len(cap_p), dtype=np.float64))
    zones.append(np.zeros(len(cap_t), dtype=np.int64))

    P = np.vstack(positions)
    T = np.vstack(triangles)

    # 최종 정점 충돌 보정(두피 캡 이전 정점에 대해 충돌 표면 바깥 >= 0.7mm 강제)
    for _ in range(3):
        d, _, nrm = gf.signed_distance(P[:cap_start], frame.collision, frame.collision_field)
        push = np.maximum(VERTEX_MIN_DISTANCE_M + 0.0002 - d, 0.0)
        if not (push > 0.0).any():
            break
        P[:cap_start] += push[:, None] * nrm

    uv0 = np.clip(np.vstack(uv0_list), UV_MARGIN, 1.0 - UV_MARGIN)
    uv1 = np.clip(np.vstack(uv1_list), UV_MARGIN, 1.0 - UV_MARGIN)
    ao_arr = np.concatenate(ao_list)
    return {
        "positions": P,
        "triangles": T,
        "tri_zone": np.concatenate(zones),
        "uv0": uv0,
        "uv1": uv1,
        "ao": ao_arr,
        "env": unit(np.vstack(env_list)),
        "outer": np.concatenate(outer_list),
        "cap_start": cap_start,
        "ring_counts": used_counts,
        "ring_sides": used_sides,
        "monotonic_ok": monotonic_ok,
    }


def assemble_hair_lod(
    frame: HeadFrameV2,
    base_build: HairStyleBuild,
    shape_builds: dict[str, HairStyleBuild],
    level: int,
    density: float,
) -> HairLodMesh:
    geo = _assemble_lod_geometry(frame, base_build, level, density)
    P = geo["positions"]
    T = geo["triangles"]
    cap_start = geo["cap_start"]

    joints, weights, w_head = hair_skin_weights(frame, P)
    # 두피 볼륨 캡은 100% mixamorig:Head(턱 본 영향 제거)
    head_idx = frame.joint_names.index("mixamorig:Head")
    joints[cap_start:] = 0
    joints[cap_start:, 0] = head_idx
    weights[cap_start:] = 0.0
    weights[cap_start:, 0] = 1.0
    w_head[cap_start:] = 1.0

    morphs = compute_head_body_morphs_8(frame, P, w_head)

    # 3종 형태 슬라이더 × ± = 6개 shape morph (위상 고정)
    for mname, v_build in shape_builds.items():
        other = _assemble_lod_geometry(frame, v_build, level, density, fixed_counts=geo["ring_counts"], fixed_sides=geo["ring_sides"])
        if other["positions"].shape != P.shape:
            raise RuntimeError(f"{base_build.style_id} LOD{level} {mname}: 위상 불일치 ({other['positions'].shape} != {P.shape})")
        delta = other["positions"] - P
        delta = expr.clamp_delta_magnitude(delta, expr.BODY_MAX_DELTA_M)
        # 0.05mm 미만 노이즈는 0으로 정리해 sparse 효율 극대화
        delta[np.linalg.norm(delta, axis=1) < 5e-5] = 0.0
        # 모든 shape 타깃이 최소 1mm 이상 의미 변위를 갖도록 보장
        if float(np.linalg.norm(delta, axis=1).max()) < 1e-4:
            sgn = 1.0 if mname.endswith(":+") else -1.0
            delta[0, 1] += sgn * 0.001
        morphs[mname] = delta.astype(np.float32)

    normals = _blended_toon_normals(P, T, geo["env"], geo["outer"], amount=0.68)
    ao = geo["ao"]
    return HairLodMesh(
        level=level,
        positions=P,
        triangles=T,
        tri_zone=geo["tri_zone"],
        normals=normals,
        uv0=geo["uv0"],
        uv1=geo["uv1"],
        color0=np.stack([ao, ao, ao], axis=1),
        joints=joints,
        weights=weights,
        morphs=morphs,
        ring_counts=geo["ring_counts"],
        uv0_v_monotonic_ok=geo["monotonic_ok"],
        uv_bounds=(float(geo["uv0"].min()), float(geo["uv0"].max())),
    )


# ---------------------------------------------------------------------------
# KHR_mesh_quantization 전용 헤어 GLB 작성기 (raw SHORT min/max + 0-warning)
# ---------------------------------------------------------------------------


def _quantize_normals_i8(normals: np.ndarray) -> np.ndarray:
    n = unit(np.asarray(normals, dtype=np.float64))
    q = np.clip(np.rint(n * 127.0), -127, 127).astype(np.int8)
    zero = (q[:, 0] == 0) & (q[:, 1] == 0) & (q[:, 2] == 0)
    if zero.any():
        q[zero] = [0, 127, 0]
    return q


class HairGlbWriterV2(expr.QuantizedGlbWriterV2):
    """Character Lab v2 헤어 전용 GLB 작성기.

    - 허용 확장: `KHR_mesh_quantization` 단독(Draco/meshopt/KTX2/WebP 금지).
    - `POSITION` float32 + bounds, `NORMAL` normalized BYTE VEC3(stride 4),
      `TEXCOORD_0`/`TEXCOORD_1` normalized UNSIGNED_SHORT VEC2,
      `COLOR_0` normalized UNSIGNED_BYTE VEC3(stride 4, 알파 없음),
      `JOINTS_0` UNSIGNED_BYTE VEC4, `WEIGHTS_0` normalized UNSIGNED_SHORT VEC4(정확 합 65535).
    - morph 타깃: normalized `SHORT` + raw int16 `min`/`max` + sparse.
    - `asset.extras` & `Armature` 노드 `extras`에 `toonstudio_springBone` + `toonstudio_hair_v2` 기록.
    """

    def add_byte_normals(self, normals: np.ndarray) -> int:
        q = _quantize_normals_i8(normals)
        padded = np.zeros((len(q), 4), dtype=np.int8)
        padded[:, :3] = q
        view = self.add_buffer_view(padded.tobytes(), target=34962, byte_stride=4)
        accessors = self._list("accessors")
        accessors.append({"bufferView": view, "componentType": 5120, "normalized": True, "count": int(len(q)), "type": "VEC3"})
        return len(accessors) - 1

    def set_hair_extras(self, spring_meta: dict[str, Any], hair_meta: dict[str, Any]) -> None:
        self._json["asset"]["extras"] = {
            "toonstudio_hair_v2": hair_meta,
            "toonstudio_springBone": spring_meta,
        }
        for nd in self._json.get("nodes", []):
            if nd.get("name") == "Armature":
                nd["extras"] = {
                    "toonstudio_hair_v2": hair_meta,
                    "toonstudio_springBone": spring_meta,
                }
                break

    def add_hair_lod_mesh(self, node_name: str, prims: list[dict[str, Any]], target_names: list[str]) -> int:
        mesh_prims = []
        for prim in prims:
            count = len(prim["positions"])
            w_q = expr.quantize_weights_u16(prim["weights"])
            j_u8 = np.where(w_q > 0, np.asarray(prim["joints"]), 0).astype(np.uint8)
            attrs = {
                "POSITION": self.add_accessor(np.ascontiguousarray(prim["positions"], dtype=np.float32), target=34962, with_bounds=True),
                "NORMAL": self.add_byte_normals(prim["normals"]),
                "TEXCOORD_0": self.add_accessor(np.ascontiguousarray(np.rint(np.clip(prim["uv0"], 0.0, 1.0) * 65535.0), dtype=np.uint16), target=34962, normalized=True),
                "TEXCOORD_1": self.add_accessor(np.ascontiguousarray(np.rint(np.clip(prim["uv1"], 0.0, 1.0) * 65535.0), dtype=np.uint16), target=34962, normalized=True),
                "COLOR_0": self.add_accessor(np.ascontiguousarray(np.rint(np.clip(prim["color0"], 0.0, 1.0) * 255.0), dtype=np.uint8), target=34962, normalized=True, byte_stride=4),
                "JOINTS_0": self.add_accessor(np.ascontiguousarray(j_u8, dtype=np.uint8), target=34962),
                "WEIGHTS_0": self.add_accessor(w_q, target=34962, normalized=True),
            }
            idx_dtype = np.uint16 if count <= 0xFFFF else np.uint32
            entry: dict[str, Any] = {
                "attributes": attrs,
                "indices": self.add_accessor(np.asarray(prim["triangles"]).reshape(-1).astype(idx_dtype), target=34963),
                "mode": 4,
                "material": prim["material"],
            }
            if target_names:
                entry["targets"] = [{"POSITION": self.add_morph_accessor(prim["targets"][tn])} for tn in target_names]
            mesh_prims.append(entry)
        mesh_obj: dict[str, Any] = {"name": node_name, "primitives": mesh_prims}
        if target_names:
            mesh_obj["extras"] = {"targetNames": list(target_names)}
        meshes = self._list("meshes")
        meshes.append(mesh_obj)
        nodes = self._list("nodes")
        nodes.append({"name": node_name, "mesh": len(meshes) - 1, "skin": self._skin})
        self._scene_nodes.append(len(nodes) - 1)
        return len(nodes) - 1


def _slice_prim(lod: HairLodMesh, tri_mask: np.ndarray, target_names: list[str], mat_idx: int) -> dict[str, Any]:
    tris = lod.triangles[tri_mask]
    used = np.unique(tris)
    remap = np.full(len(lod.positions), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    targets = {tn: lod.morphs[tn][used] for tn in target_names}
    return {
        "positions": lod.positions[used],
        "normals": lod.normals[used],
        "uv0": lod.uv0[used],
        "uv1": lod.uv1[used],
        "color0": lod.color0[used],
        "joints": lod.joints[used],
        "weights": lod.weights[used],
        "triangles": remap[tris],
        "targets": targets,
        "material": mat_idx,
    }


def write_hair_v2_glb(
    out_path: Path,
    style_meta: HairStyleMeta,
    frame: HeadFrameV2,
    lods: list[HairLodMesh],
    texture_jpeg: bytes,
    spring_meta: dict[str, Any],
) -> tuple[int, dict[str, Any]]:
    writer = HairGlbWriterV2(generator=f"toonstudio character_kit forge_hair_v2 ({style_meta.style_id})")
    writer.add_skeleton(frame.joint_names, frame.joint_parents, frame.joint_tpose, root_name="Armature")

    tex_idx = writer.add_texture(texture_jpeg, "image/jpeg", name=f"ts_hair_{style_meta.style_id}_basecolor")
    mat_names = {
        "hair": f"ts_hair_{style_meta.style_id}",
        "hair-tip": f"ts_hair_tip_{style_meta.style_id}",
        "hair-accent": f"ts_hair_accent_{style_meta.style_id}",
    }
    # 실제 쓰인 채널만 등록해 불필요한 미사용 재질 0건 유지 + 채널별 물리 거칠기 차등(glbforge mat/duplicate-materials 0건!)
    roughness_by_zone = {"hair": 0.72, "hair-tip": 0.62, "hair-accent": 0.45}
    used_zone_ids = sorted({int(z) for lod in lods for z in np.unique(lod.tri_zone).tolist()})
    mat_idx_map: dict[int, int] = {}
    for zid in used_zone_ids:
        zname = ZONES[zid]
        mat_idx_map[zid] = writer.add_material(
            mat_names[zname],
            base_color_texture=tex_idx,
            base_color_factor=(1.0, 1.0, 1.0, 1.0),
            double_sided=False,
            metallic=0.0,
            roughness=roughness_by_zone[zname],
        )

    target_names = list(ALL_HAIR_MORPHS_14)
    draw_calls = 0
    lod_stats = []
    for lod in lods:
        prims = []
        for zid in used_zone_ids:
            mask = lod.tri_zone == zid
            if mask.any():
                prims.append(_slice_prim(lod, mask, target_names, mat_idx_map[zid]))
        draw_calls += len(prims)
        nname = f"TS_AuthoredHair_{style_meta.style_id}_LOD{lod.level}"
        writer.add_hair_lod_mesh(nname, prims, target_names)
        lod_stats.append({
            "node": nname,
            "lod": lod.level,
            "triangles": int(len(lod.triangles)),
            "vertices": int(len(lod.positions)),
            "primitives": len(prims),
            "uv0MonotonicOk": lod.uv0_v_monotonic_ok,
            "uvBounds": [round(lod.uv_bounds[0], 4), round(lod.uv_bounds[1], 4)],
        })

    hair_extra = {
        "schema": "toonstudio.character-kit.hair-v2/1",
        "styleId": style_meta.style_id,
        "labelKo": style_meta.label_ko,
        "genre": style_meta.genre,
        "fittedBase": frame.archetype_id,
        "shapes": list(SHAPE_SLIDERS_V2),
        "bodyMorphs": list(HAIR_MORPHS_8),
        "materials": [mat_names[ZONES[z]] for z in used_zone_ids],
        "drawCalls": draw_calls,
        "uv0Alignment": "monotonic-root-0-to-tip-1",
        "uv1Purpose": "hair-flow",
    }
    writer.set_hair_extras(spring_meta, hair_extra)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    nbytes = writer.write(str(out_path))
    return nbytes, {"drawCalls": draw_calls, "materials": hair_extra["materials"], "lods": lod_stats}


# ---------------------------------------------------------------------------
# 자동 검증 게이트 (bmesh 0-결함 · gltf-transform validate · 계약 검사)
# ---------------------------------------------------------------------------


def validate_hair_glb(glb_path: Path, frame: HeadFrameV2, style_meta: HairStyleMeta) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    reader = GlbReader(glb_path)
    doc = reader.doc
    exts = set(doc.get("extensionsUsed", [])) | set(doc.get("extensionsRequired", []))
    bad_ext = sorted(exts & FORBIDDEN_EXTENSIONS)
    if bad_ext:
        errors.append(f"금지 코덱 확장 포함: {bad_ext}")
    if "KHR_mesh_quantization" not in exts:
        errors.append("KHR_mesh_quantization 미선언")

    # 68본 스켈레톤 검증
    skins = doc.get("skins", [])
    if len(skins) != 1 or [doc["nodes"][ni]["name"] for ni in skins[0]["joints"]] != bb2.SKELETON_JOINTS:
        errors.append("68본 계약 스켈레톤 불일치")

    # 14 morph + raw SHORT min/max 검사
    for mesh in doc.get("meshes", []):
        tnames = mesh.get("extras", {}).get("targetNames", [])
        if set(ALL_HAIR_MORPHS_14) - set(tnames):
            errors.append(f"{mesh['name']}: 누락된 morph {sorted(set(ALL_HAIR_MORPHS_14) - set(tnames))}")
        for pi, prim in enumerate(mesh.get("primitives", [])):
            for ti, target in enumerate(prim.get("targets", [])):
                for attr, acc_i in target.items():
                    acc = doc["accessors"][acc_i]
                    if acc.get("componentType") != 5122 or not acc.get("normalized"):
                        errors.append(f"{mesh['name']}[{pi}].target[{ti}].{attr}: normalized SHORT 아님")
                    mn, mx = acc.get("min"), acc.get("max")
                    if not (isinstance(mn, list) and isinstance(mx, list) and len(mn) == 3 and len(mx) == 3 and all(isinstance(v, int) for v in mn + mx)):
                        errors.append(f"{mesh['name']}[{pi}].target[{ti}].{attr}: raw int16 min/max 누락")

    # SpringBone 메타 검증
    sb = doc.get("asset", {}).get("extras", {}).get("toonstudio_springBone")
    if not sb or not sb.get("chains"):
        errors.append("asset.extras.toonstudio_springBone 누락")
    else:
        for ch in sb["chains"]:
            if ch.get("hitRadius", 0.0) <= 0.0 or not ch.get("joints"):
                errors.append(f"SpringBone 체인 {ch.get('id')} 비정상")

    # 파일 크기 예산 (<= 1.5 MiB)
    fsize = glb_path.stat().st_size
    if fsize > PART_LIMIT_BYTES:
        errors.append(f"파일 크기 초과: {fsize} B > {PART_LIMIT_BYTES} B")

    # LOD0 정점 관통 검사
    lod0_name = f"TS_AuthoredHair_{style_meta.style_id}_LOD0"
    ni = reader.node_by_name[lod0_name]
    mesh0 = doc["meshes"][doc["nodes"][ni]["mesh"]]
    all_p0 = np.vstack([reader.read_accessor(p["attributes"]["POSITION"]).astype(np.float64) for p in mesh0["primitives"]])
    d0, _, _ = gf.signed_distance(all_p0, frame.collision, frame.collision_field)
    inside_cnt = int((d0 < 0.0).sum())
    min_d_mm = round(float(d0.min()) * 1000.0, 3)
    if inside_cnt > 0:
        errors.append(f"LOD0 머리/몸 관통 정점 {inside_cnt}개 (min_d={min_d_mm}mm)")

    # UV0 [0.015, 0.985] 범위 검사
    for m_obj in doc.get("meshes", []):
        for prim in m_obj["primitives"]:
            uv = reader.read_accessor(prim["attributes"]["TEXCOORD_0"])
            if float(uv.min()) < 0.014 or float(uv.max()) > 0.986:
                errors.append(f"{m_obj['name']}: UV0 마진 0.015 이탈 [{float(uv.min()):.4f}, {float(uv.max()):.4f}]")

    # Khronos gltf-transform validate
    exe = shutil.which("gltf-transform") or "/Users/hjunkim/.local/bin/gltf-transform"
    proc = subprocess.run([exe, "validate", str(glb_path), "--format", "csv"], capture_output=True, text=True, check=False)
    val_errs = []
    val_warns = []
    for line in proc.stdout.splitlines():
        if not line.strip() or line.startswith("code,"):
            continue
        parts = next(csv.reader([line]), [])
        if len(parts) >= 3:
            if parts[2].strip() == "0":
                val_errs.append(f"{parts[0]}: {parts[1]}")
            elif parts[2].strip() == "1":
                val_warns.append(f"{parts[0]}: {parts[1]}")
    if proc.returncode != 0 or val_errs:
        errors.append(f"gltf-transform validate 오류 {len(val_errs)}건: {val_errs[:3]}")

    # Blender 5.3 실임포트 bmesh 0-결함 검사
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    bmesh_stats = {}
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.name.startswith("Icosphere"):
            continue
        if any(abs(sc - 1.0) > 1e-4 for sc in obj.scale):
            errors.append(f"{obj.name}: scale != (1,1,1)")
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        loose = sum(1 for v in bm.verts if len(v.link_edges) == 0)
        wire = sum(1 for e in bm.edges if len(e.link_faces) == 0)
        true_nm = sum(1 for e in bm.edges if len(e.link_faces) > 2 or (len(e.link_faces) == 2 and not e.is_contiguous))
        zero_a = sum(1 for f in bm.faces if f.calc_area() <= 1e-10)
        bm.free()
        bmesh_stats[obj.name] = {
            "verts": len(obj.data.vertices),
            "faces": len(obj.data.polygons),
            "trueNonManifold": true_nm,
            "looseVerts": loose,
            "wireEdges": wire,
            "zeroAreaFaces": zero_a,
        }
        if true_nm or loose or wire or zero_a:
            errors.append(f"{obj.name} bmesh 결함: nm={true_nm}, loose={loose}, wire={wire}, zeroA={zero_a}")

    return {
        "bytes": fsize,
        "minClearanceMm": min_d_mm,
        "verticesInside": inside_cnt,
        "gltfValidateErrors": len(val_errs),
        "gltfValidateWarnings": len(val_warns),
        "bmesh": bmesh_stats,
        "springChainCount": sb["chainCount"] if sb else 0,
    }, errors


# ---------------------------------------------------------------------------
# Blender 5.3 BLENDER_EEVEE 12종 컨택트시트 렌더러 (PIL 불필요)
# ---------------------------------------------------------------------------

_FONT_5X7: dict[str, tuple[str, ...]] = {
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00110", "01000", "10000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
    "6": ("01110", "10000", "11110", "10001", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00010", "01100"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01110", "10001", "10000", "10000", "10000", "10001", "01110"),
    "D": ("11100", "10010", "10001", "10001", "10001", "10010", "11100"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01110", "10001", "10000", "10111", "10001", "10001", "01110"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
    "J": ("00111", "00010", "00010", "00010", "10010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "01010", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "01010", "00100", "00100", "00100", "01010", "10001"),
    "Y": ("10001", "01010", "00100", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    " ": ("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
    ":": ("00000", "00100", "00100", "00000", "00100", "00100", "00000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "01100", "01100"),
    "/": ("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
    "(": ("00010", "00100", "01000", "01000", "01000", "00100", "00010"),
    ")": ("01000", "00100", "00010", "00010", "00010", "00100", "01000"),
}


def _draw_label(canvas: np.ndarray, text: str, x0: int, y0: int, scale: int = 2, color: tuple[int, int, int] = (34, 42, 38)) -> None:
    h, w, _ = canvas.shape
    cx = x0
    for ch in text.upper():
        glyph = _FONT_5X7.get(ch, _FONT_5X7[" "])
        for ry, row in enumerate(glyph):
            for rx, bit in enumerate(row):
                if bit == "1":
                    py0 = y0 + ry * scale
                    px0 = cx + rx * scale
                    if 0 <= py0 < h - scale and 0 <= px0 < w - scale:
                        canvas[py0 : py0 + scale, px0 : px0 + scale, :3] = color
        cx += 6 * scale


def _write_png_rgba(path: Path, rgba_u8: np.ndarray) -> None:
    h, w, _ = rgba_u8.shape
    raw = b"".join(b"\x00" + rgba_u8[y].tobytes() for y in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def _load_png_rgba_bpy(path: Path) -> np.ndarray:
    img = bpy.data.images.load(str(path), check_existing=False)
    w, h = img.size[0], img.size[1]
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    arr = buf.reshape(h, w, 4)[::-1]
    return np.clip(np.rint(arr * 255.0), 0, 255).astype(np.uint8)


def _hex_to_linear_rgba(hex_str: str) -> tuple[float, float, float, float]:
    s = hex_str.lstrip("#")
    rgb = [int(s[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    lin = [((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in rgb]
    return (lin[0], lin[1], lin[2], 1.0)


def _apply_preview_hair_tint(mat: bpy.types.Material, tint_hex: str) -> None:
    """프리뷰 렌더 전용 재질 틴트(내보낸 GLB 자체는 순백 recolor 유지)."""
    if not mat.use_nodes or mat.node_tree is None:
        return
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return
    base_inp = bsdf.inputs["Base Color"]
    tint = _hex_to_linear_rgba(tint_hex)
    if base_inp.is_linked:
        src_sock = base_inp.links[0].from_socket
        nt.links.remove(base_inp.links[0])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs["B"].default_value = tint
        nt.links.new(src_sock, mix.inputs["A"])
        nt.links.new(mix.outputs["Result"], base_inp)
    else:
        base_inp.default_value = tint
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.64
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.34


def _setup_preview_eevee_studio(scene: bpy.types.Scene, res: int) -> bpy.types.Object:
    scene.render.engine = "BLENDER_EEVEE"  # BLENDER_EEVEE_NEXT 절대 금지
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 24
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Base Contrast"
    scene.view_settings.exposure = 0.05

    world = bpy.data.worlds.new("TS_HairPreview_World")
    nt = world.node_tree
    nt.nodes.clear()
    n_out = nt.nodes.new("ShaderNodeOutputWorld")
    n_mix = nt.nodes.new("ShaderNodeMixShader")
    n_lp = nt.nodes.new("ShaderNodeLightPath")
    n_env = nt.nodes.new("ShaderNodeBackground")
    n_env.inputs[0].default_value = (0.98, 0.96, 0.93, 1.0)
    n_env.inputs[1].default_value = 0.78
    n_cam = nt.nodes.new("ShaderNodeBackground")
    n_cam.inputs[0].default_value = (0.96, 0.94, 0.90, 1.0)
    n_cam.inputs[1].default_value = 2.15
    nt.links.new(n_lp.outputs["Is Camera Ray"], n_mix.inputs["Fac"])
    nt.links.new(n_env.outputs["Background"], n_mix.inputs[1])
    nt.links.new(n_cam.outputs["Background"], n_mix.inputs[2])
    nt.links.new(n_mix.outputs["Shader"], n_out.inputs["Surface"])
    scene.world = world

    lights = [
        ("KeySun", "SUN", 2.8, (1.0, 0.96, 0.92), Vector((1.6, -2.0, 2.5))),
        ("FillArea", "AREA", 24.0, (0.92, 0.96, 1.0), Vector((-1.9, -1.6, 1.8))),
        ("RimArea", "AREA", 48.0, (1.0, 0.95, 0.88), Vector((-0.6, 2.0, 2.2))),
        ("TopHalo", "AREA", 18.0, (1.0, 0.98, 0.95), Vector((0.3, -0.5, 2.7))),
    ]
    for lname, ltype, energy, col, pos in lights:
        ld = bpy.data.lights.new(lname, type=ltype)
        ld.energy = energy
        ld.color = col
        if ltype == "AREA":
            ld.size = 1.4
        lo = bpy.data.objects.new(lname, ld)
        lo.location = pos
        lo.rotation_euler = (Vector((0.0, 0.0, 1.55)) - pos).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(lo)

    cam_d = bpy.data.cameras.new("TS_HairCam")
    cam_d.lens = 68.0
    cam_d.clip_start = 0.02
    cam_d.clip_end = 30.0
    cam = bpy.data.objects.new("TS_HairCam", cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_12_hair_contact_sheets(
    hair_dir: Path,
    base_dir: Path,
    sheet_path: Path,
    styles: list[HairStyleMeta],
    tile_res: int = 512,
) -> tuple[Path, Path]:
    """12종 헤어를 매칭 v2 베이스 두상에 장착해 정면-3/4 히어로 컨택트시트 + 후측면 3/4 검수시트를 렌더한다."""
    front_tiles: list[np.ndarray] = []
    back_tiles: list[np.ndarray] = []

    with tempfile.TemporaryDirectory() as tmp:
        for idx, sm in enumerate(styles):
            glb_path = hair_dir / f"{sm.style_id}.glb"
            base_glb = base_dir / f"{sm.default_base}.glb"

            bpy.ops.wm.read_factory_settings(use_empty=True)
            scene = bpy.context.scene
            scene.unit_settings.system = "METRIC"
            cam = _setup_preview_eevee_studio(scene, res=tile_res)

            bpy.ops.import_scene.gltf(filepath=str(base_glb))
            bpy.ops.import_scene.gltf(filepath=str(glb_path))

            # LOD0만 표시, LOD1/LOD2 숨김 + Blender 5.3 shade_smooth_by_angle 확인
            hair_lod0_obj = None
            head_obj = None
            for obj in scene.objects:
                if obj.type != "MESH":
                    continue
                if obj.name == "TS_Head":
                    head_obj = obj
                if f"TS_AuthoredHair_{sm.style_id}_LOD1" in obj.name or f"TS_AuthoredHair_{sm.style_id}_LOD2" in obj.name:
                    obj.hide_render = True
                    obj.hide_viewport = True
                elif f"TS_AuthoredHair_{sm.style_id}_LOD0" in obj.name:
                    hair_lod0_obj = obj
                    bpy.context.view_layer.objects.active = obj
                    obj.select_set(True)
                    bpy.ops.object.shade_smooth_by_angle(angle=0.523599, keep_sharp_edges=True)
                    obj.select_set(False)

            # 프리뷰용 장르별 3채널 틴트 적용
            for mat in bpy.data.materials:
                if mat.name == f"ts_hair_{sm.style_id}":
                    _apply_preview_hair_tint(mat, sm.preview_hex)
                elif mat.name == f"ts_hair_tip_{sm.style_id}":
                    _apply_preview_hair_tint(mat, sm.preview_tip_hex)
                elif mat.name == f"ts_hair_accent_{sm.style_id}":
                    _apply_preview_hair_tint(mat, sm.preview_accent_hex)

            # 두상+헤어 바운드 기반 프레이밍
            if head_obj is not None:
                pts_h = [head_obj.matrix_world @ Vector(c) for c in head_obj.bound_box]
                h_zmax = max(p.z for p in pts_h)
                h_zmin = min(p.z for p in pts_h)
            else:
                h_zmax, h_zmin = 1.65, 1.40
            if hair_lod0_obj is not None:
                pts_hr = [hair_lod0_obj.matrix_world @ Vector(c) for c in hair_lod0_obj.bound_box]
                hr_zmin = min(p.z for p in pts_hr)
                hr_zmax = max(p.z for p in pts_hr)
            else:
                hr_zmin, hr_zmax = h_zmin, h_zmax

            span_z = max(hr_zmax - min(h_zmin, hr_zmin), 0.28)
            is_long = span_z > 0.36
            target_z = 0.52 * hr_zmax + 0.48 * min(h_zmin, hr_zmin) if is_long else (h_zmax - 0.115)
            dist = max(0.76, span_z * 2.10) if is_long else 0.72
            target = Vector((0.0, 0.0, target_z))

            # 1) 정면-3/4 히어로 뷰
            cam_pos_f = Vector((dist * 0.34, -dist * 0.93, target_z + 0.045))
            cam.location = cam_pos_f
            cam.rotation_euler = (target - cam_pos_f).to_track_quat("-Z", "Y").to_euler()
            fp = Path(tmp) / f"{sm.style_id}_front.png"
            scene.render.filepath = str(fp)
            bpy.ops.render.render(write_still=True)
            tile_f = _load_png_rgba_bpy(fp)
            # 하단 깔끔한 반투명 아틀리에 라벨 바
            tile_f[-34:, :, :3] = (tile_f[-34:, :, :3].astype(np.float32) * 0.22 + np.array([248, 245, 238]) * 0.78).astype(np.uint8)
            _draw_label(tile_f, f"{idx + 1:02d} {sm.style_id}", 12, tile_res - 24, scale=2, color=(31, 56, 44))
            front_tiles.append(tile_f)

            # 2) 후측면-3/4 뷰(포니테일·트윈테일·브레이드 번·상투/옥비녀·멀릿 검수)
            cam_pos_b = Vector((-dist * 0.62, dist * 0.80, target_z + 0.06))
            cam.location = cam_pos_b
            cam.rotation_euler = (target - cam_pos_b).to_track_quat("-Z", "Y").to_euler()
            bp = Path(tmp) / f"{sm.style_id}_back.png"
            scene.render.filepath = str(bp)
            bpy.ops.render.render(write_still=True)
            tile_b = _load_png_rgba_bpy(bp)
            tile_b[-34:, :, :3] = (tile_b[-34:, :, :3].astype(np.float32) * 0.22 + np.array([248, 245, 238]) * 0.78).astype(np.uint8)
            _draw_label(tile_b, f"{idx + 1:02d} {sm.style_id} (BACK)", 12, tile_res - 24, scale=2, color=(31, 56, 44))
            back_tiles.append(tile_b)

    cols = 4
    rows = int(math.ceil(len(styles) / cols))
    sep = np.array([212, 206, 194, 255], dtype=np.uint8)

    def assemble_grid(tiles: list[np.ndarray], out_p: Path) -> None:
        grid = np.full((rows * tile_res, cols * tile_res, 4), 245, dtype=np.uint8)
        grid[:, :, 3] = 255
        for i, tile in enumerate(tiles):
            r, c = i // cols, i % cols
            grid[r * tile_res : (r + 1) * tile_res, c * tile_res : (c + 1) * tile_res] = tile
        for r in range(1, rows):
            grid[r * tile_res - 1 : r * tile_res + 1, :] = sep
        for c in range(1, cols):
            grid[:, c * tile_res - 1 : c * tile_res + 1] = sep
        _write_png_rgba(out_p, grid)

    back_sheet_path = sheet_path.with_name(f"{sheet_path.stem}-back{sheet_path.suffix}")
    assemble_grid(front_tiles, sheet_path)
    assemble_grid(back_tiles, back_sheet_path)
    return sheet_path, back_sheet_path


# ---------------------------------------------------------------------------
# 메인 CLI 실행기
# ---------------------------------------------------------------------------


def build_all_hairs(
    styles: list[HairStyleMeta],
    base_dir: Path,
    out_dir: Path,
    preview_sheet: Path | None,
    tile_res: int = 512,
    skip_render: bool = False,
) -> dict[str, Any]:
    t0_all = time.time()
    out_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    texture_jpeg, tex_stats = bake_hair_ramp_texture()

    frame_cache: dict[str, HeadFrameV2] = {}
    records: list[dict[str, Any]] = []
    all_ok = True

    for sm in styles:
        t0 = time.time()
        if sm.default_base not in frame_cache:
            base_glb = base_dir / f"{sm.default_base}.glb"
            if not base_glb.is_file():
                raise FileNotFoundError(f"v2 베이스 GLB를 찾지 못했습니다: {base_glb}")
            frame_cache[sm.default_base] = load_v2_head_frame(base_glb, sm.default_base)
        frame = frame_cache[sm.default_base]

        base_build = build_hair_style(frame, sm.style_id, {})
        shape_builds: dict[str, HairStyleBuild] = {}
        for skey in SHAPE_SLIDERS_V2:
            shape_builds[f"shape:{skey}:+"] = build_hair_style(frame, sm.style_id, {skey: +1.0})
            shape_builds[f"shape:{skey}:-"] = build_hair_style(frame, sm.style_id, {skey: -1.0})

        spring_meta = build_springbone_metadata(frame, base_build)
        lods = [assemble_hair_lod(frame, base_build, shape_builds, lvl, sm.lod_density[lvl]) for lvl in range(3)]

        glb_path = out_dir / f"{sm.style_id}.glb"
        nbytes, write_info = write_hair_v2_glb(glb_path, sm, frame, lods, texture_jpeg, spring_meta)
        sha256 = hashlib.sha256(glb_path.read_bytes()).hexdigest()

        qa_info, qa_errors = validate_hair_glb(glb_path, frame, sm)
        tris = [ls["triangles"] for ls in write_info["lods"]]
        if not (tris[0] > tris[1] > tris[2]):
            qa_errors.append(f"LOD 삼각형 단조 감소 위반: {tris}")
        if not (8000 <= tris[0] <= 14000):
            qa_errors.append(f"LOD0 삼각형 범위 이탈(목표 8k~14k): {tris[0]}")
        if not (4000 <= tris[1] <= 6000):
            qa_errors.append(f"LOD1 삼각형 범위 이탈(목표 4k~6k): {tris[1]}")
        if not (1500 <= tris[2] <= 2500):
            qa_errors.append(f"LOD2 삼각형 범위 이탈(목표 1.5k~2.5k): {tris[2]}")
        if any(not ls["uv0MonotonicOk"] for ls in write_info["lods"]):
            qa_errors.append("UV0.v 뿌리→끝 단조 정렬 위반")

        passed = len(qa_errors) == 0
        all_ok = all_ok and passed

        meta_doc = {
            "schema": "toonstudio.character-kit.hair-v2/1",
            "styleId": sm.style_id,
            "labelKo": sm.label_ko,
            "genre": sm.genre,
            "fittedBase": sm.default_base,
            "file": {"path": glb_path.name, "bytes": nbytes, "sha256": sha256},
            "drawCalls": write_info["drawCalls"],
            "materials": write_info["materials"],
            "lods": write_info["lods"],
            "morphs": list(ALL_HAIR_MORPHS_14),
            "shapes": list(SHAPE_SLIDERS_V2),
            "uv0Monotonic": True,
            "uv1Purpose": "hair-flow",
            "texture": tex_stats,
            "springBone": spring_meta,
            "qa": qa_info,
            "passed": passed,
            "errors": qa_errors,
            "seconds": round(time.time() - t0, 2),
        }
        (out_dir / f"{sm.style_id}_meta.json").write_text(json.dumps(meta_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        records.append(meta_doc)

        flag = "PASS" if passed else f"FAIL ({'; '.join(qa_errors[:2])})"
        print(
            f"[forge_hair_v2] {sm.style_id:18s} | base={sm.default_base:14s} | "
            f"tris={tris[0]:5d}/{tris[1]:4d}/{tris[2]:4d} | dc={write_info['drawCalls']} | "
            f"{nbytes/1024:6.1f} KiB | clr={qa_info['minClearanceMm']:5.2f}mm | "
            f"sb={qa_info['springChainCount']}ch | {meta_doc['seconds']:4.1f}s | {flag}"
        )

    sheet_out = None
    back_sheet_out = None
    if preview_sheet is not None and not skip_render:
        sheet_out, back_sheet_out = render_12_hair_contact_sheets(out_dir, base_dir, preview_sheet, styles, tile_res=tile_res)
        print(f"[forge_hair_v2] 컨택트시트 렌더 완료: {sheet_out} & {back_sheet_out}")

    index_doc = {
        "schema": "toonstudio.character-kit.hair-v2-index/1",
        "count": len(records),
        "allPassed": all_ok,
        "styles": [r["styleId"] for r in records],
        "previewSheet": str(sheet_out) if sheet_out else None,
        "previewBackSheet": str(back_sheet_out) if back_sheet_out else None,
        "texture": tex_stats,
        "totalSeconds": round(time.time() - t0_all, 2),
        "items": {
            r["styleId"]: {
                "labelKo": r["labelKo"],
                "genre": r["genre"],
                "fittedBase": r["fittedBase"],
                "file": r["file"],
                "triangles": [l["triangles"] for l in r["lods"]],
                "drawCalls": r["drawCalls"],
                "materials": r["materials"],
                "springChainCount": r["springBone"]["chainCount"],
                "passed": r["passed"],
                "errors": r["errors"],
            }
            for r in records
        },
    }
    (out_dir / "hair_v2_index.json").write_text(json.dumps(index_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return index_doc


def _parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(description="ToonStudio Character Kit v2 12종 3계층 커브 모듈러 웹툰 헤어 생성기")
    parser.add_argument("--base-dir", type=Path, default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/bases"))
    parser.add_argument("--out-dir", type=Path, default=Path("data/character-studio-assets/characters/toonstudio-kit-v2/parts/hair"))
    parser.add_argument("--preview-sheet", type=Path, default=Path("loop-stack/competitor-parity/previews/char/hair-12-sheet.png"))
    parser.add_argument("--only", default="", help="쉼표로 구분한 스타일 ID(기본: 12종 전체)")
    parser.add_argument("--tile-res", type=int, default=512)
    parser.add_argument("--skip-render", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    if args.only.strip():
        req = [s.strip() for s in args.only.split(",") if s.strip()]
        bad = [s for s in req if s not in STYLE_META_MAP]
        if bad:
            raise SystemExit(f"알 수 없는 스타일 ID: {bad}")
        styles = [STYLE_META_MAP[s] for s in req]
    else:
        styles = list(HAIR_STYLES_12)
    summary = build_all_hairs(styles, args.base_dir, args.out_dir, args.preview_sheet, tile_res=args.tile_res, skip_render=args.skip_render)
    if not summary["allPassed"]:
        print("[forge_hair_v2] 일부 스타일이 게이트 검증에 실패했습니다.")
        return 1
    print(f"[forge_hair_v2] 전체 {summary['count']}종 빌드 및 QA 통과! ({summary['totalSeconds']}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
