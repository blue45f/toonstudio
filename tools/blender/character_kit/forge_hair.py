"""절차 헤어 생성기(forge_hair) — 이 저장소가 직접 만드는 헤어 7종 원본(license `original`, provenance `toonstudio-original`).

왜 필요한가
-----------
2026-10-14/15에 Hyper3D(Rodin) 파생 헤어가 상업 이용 증빙 부족으로 키트에서 빠져 헤어 슬롯이 남녀 모두 0종이 됐다. 이 모듈은 외부 생성물·에셋 없이
베이스 머리 형상에서 가닥 청크를 절차적으로 만들어 계약 어휘의 헤어 7종(`short-layered`, `soft-bob`, `romance-long`, `action-pony`, `hime-cut`,
`wolf-layered`, `twin-tail`)을 두 베이스(female=webtoon-girl, male=webtoon-boy)에 각각 맞춘다. Blender 5.2에 들어 있는 CC0 절차 헤어 노드 에셋
(`procedural_hair_node_assets.blend`)도 검토했으나, 그 노드들은 가는 실 가닥(곡선) 다발을 다루는 도구라 2만 삼각형 예산 안의 청크형 툰 헤어와
UV 램프 규약(가닥 길이 = V)을 직접 맞추기 어려워 쓰지 않았다(산출물에 그 에셋이 들어가지 않는다).

설계(모두 glTF 좌표: Y 위, +Z 앞, 캐릭터 왼쪽 +X, 미터, T-포즈 레스트)
---------------------------------------------------------------------
1. `HeadFrame` — 베이스 npz(`base_model_<base>.npz`)에서 머리 표면 장(場)을 만든다. 두개골 구 맞춤 중심 C에서 사방으로 쏜 광선의 바깥 교차 반지름
   `r_raw(θ, φ)`(θ: +Z에서 +X로 도는 방위, φ: +Y에서 잰 극각)를 2.5° 격자로 재고, 열림 연산(최소→최대 필터)으로 귀·코를 지운 두개골 장
   `r_skull`과 팽창으로 귀를 덮는 장 `r_cover`를 만든다. 눈썹·눈·귀·턱·목덜미·어깨 높이 같은 랜드마크와 충돌 표면(몸+머리+눈썹+속눈썹),
   스킨·morph를 옮겨 올 머리·몸 표면도 여기서 준비한다. 두 베이스의 머리 크기·`neck_lift` 차이는 이 장이 그대로 반영한다.
2. 스타일 빌더(`STYLES`) — 형태 매개변수(`p`, 각 −1…1)를 받아 가닥 청크(`Lock`)의 가이드 곡선을 만든다. 덩어리는 가마(또는 묶음점)에서
   대원으로 퍼지는 바퀴살(`Sketch.ring`)이라 서로 교차하지 않고, 출발 각 순서대로 이웃끼리 경계를 공유하는 띠 고리(스타일당 큰 덩어리 13~17개)가 된다.
   두피 위 구간은 C 기준 `r + h`(층 높이)로 따라가고, 수평 반지름이 가장 큰 곳에서 떨어져 늘어진 뒤 끝을 안·밖으로 만다(`hang`·`long`),
   짧은 머리는 그 아래를 두피 자오선으로 내려가 머리에 붙어 끝난다(`short`), 포니·트윈은 머리선에서 묶음점으로 당긴다(`converge`).
   앞머리(굵은 끝 3~5개)·옆머리(귀 앞·뒤)·뒷머리·안쪽 층·꼬리·특수 요소(히메컷 옆 직모·일자 끝, 울프컷 윗층)를 그룹으로 나눈다.
   길이·폭·휨의 변주는 결정적 PRNG(`Prng`, `apps/character-lab/src/shared/prng.ts`의 mulberry32와 같은 수열, 시드 = fnv1a32(스타일/베이스)).
   빌더는 매개변수와 무관하게 같은 순서로 같은 수의 난수를 뽑아 가닥 수·순서가 매개변수에 따라 바뀌지 않는다(형태 슬라이더의 위상 고정).
3. 충돌 — 가이드 곡선 점을 충돌 표면 바깥(가닥 반두께 + 1.5 mm)으로 밀고 곡선을 다듬기를 반복한다(목·어깨·등·귀를 타고 흘러내린다).
4. 스윕 — 띠 그룹(`sweep_strip_group`)은 이웃 가닥과 경계 곡선(두 가이드의 중점 + 곡면 처짐 보정 + 1 mm 겹침)을 공유하는 판 조각으로 쓴다.
   경계는 끝 갈래(`split_len`)에서 풀려 뾰족한 손가락 끝이 되고, 이웃의 좌우는 실제 위치로 정해(고리 순서가 아니라) 풀린 끝이 꼬이지 않는다.
   길이가 비슷한 이웃은 끝끼리 맞춰 짝짓는다. 홀로 선 가닥(`sweep_lock`)은 납작한 타원 단면 관이다. 모두 닫힌 메시(뿌리 부채꼴 마개, 끝 한 점 또는 일자 마개).
   툰 음영 법선은 바깥 면에서 덩어리 바깥 방향(엔벨로프)을 써서 헤어 전체가 큰 덩어리로 음영되고 가닥 경계는 외곽선·AO가 맡는다.
5. 두피 덮개 — 스타일 머리선 표(`table_hairline`) 안쪽 두피를 1.0 mm 바깥에서 떠 낸 얇은 덮개(머리 메시를 뚫지 않는다). 머리선에 걸친 삼각형은
   바깥 꼭짓점을 머리선 위로 옮겨 남긴다(가르마·목덜미에서 덮개 끝이 들쭉날쭉 물러나지 않게). 가닥 사이 틈으로 피부가 비치지 않게 한다.
6. 스킨 — 턱 높이 위는 머리 본 100 %, 그 아래로 늘어진 긴 머리는 목→가슴 위(Spine2)→가슴(Spine1)→척추(Spine)로 높이에 따라 완만하게 넘기고,
   어깨 위에 얹힌 부분은 어깨 본을 조금 섞는다. 덮개는 머리 표면 스킨을 그대로 받는다.
7. morph — 머리 부착 체형 8종(`param:{height,legLength,neckLength,headSize}:±`). 머리 쪽은 최근접 머리 표면점 델타 + 그 morph의 머리 닮음 배율로
   오프셋을 늘린 값, 몸 쪽은 최근접 몸 표면점 델타이며 둘을 머리 본 가중치로 섞는다(스킨과 같은 비율이라 늘어진 머리도 몸을 따라간다).
8. UV·텍스처(계약 D8) — UV0의 V = 가닥 길이 방향(뿌리 → 끝), U = 가닥 폭(앞·뒷면 대칭). 텍스처는 회색 램프(뿌리 0.78 → 끝 0.96)에 지그재그
   하이라이트 밴드(1.0)를 V 0.30~0.42에 고정해 두고, 가닥마다 V를 구간별로 다시 매겨 그 밴드가 그 가닥이 '천사의 고리' 높이(`band_y`)를 지나는 곳에
   오게 한다(모든 가닥의 밴드가 머리 둘레의 한 수평 고리로 이어진다). 평균 휘도 ≥ 0.78(검증기 V13 하한 0.75), 레시피 헤어색 = 밴드 색이다.
   `COLOR_0`은 회색 AO 곱(안쪽 층·뿌리·안쪽 면·가닥 옆선이 어둡다)만 쓴다.
9. LOD 3단 — 같은 가이드 곡선을 단면 변 수·마디 간격만 줄여 다시 쓸고(LOD2는 안쪽 층을 뺀다) 삼각형이 단조 감소한다. LOD0 ≤ 20k, 파일 ≤ 1.5 MiB.
10. GLB(`write_hair_glb`) — `KHR_mesh_quantization`(계약 허용): NORMAL 정규화 BYTE, UV0·UV1 정규화 UNSIGNED_SHORT, WEIGHTS_0 정규화 UNSIGNED_SHORT
   (정점마다 정수 합 65535 → 복원 합 정확히 1), morph 정규화 SHORT(+sparse). `COLOR_0`은 정규화 UNSIGNED_BYTE VEC3(알파 없음).

헤어 채널(hair channels) — 커스터마이즈용 규약(이 절이 규약 문서의 정본이다)
-----------------------------------------------------------------------
- `TEXCOORD_1`(UV1, 정규화 UNSIGNED_SHORT): V = 가닥 흐름값(strand-flow, 뿌리 0 → 끝 1, 가닥마다 단조 증가),
  U = 층 부호(0 = 바깥 층, 0.5 = 브릿지 줄기, 1 = 안쪽 층·머리끈·덮개). 셰이더가 그라데이션·투톤·옴브레를 V로, 안쪽 컬러를 U로 만든다.
  현재 계약은 `COLOR_0`을 회색 AO로만 허용하므로(V14) 버텍스 컬러 대신 UV1에 싣는다(`COLOR_0`은 알파 없는 VEC3 — VEC4면 Babylon이 알파 블렌드로 그린다).
- `TEXCOORD_0`(UV0): V = 밝기 램프 좌표(뿌리 어두움 → 끝 밝음, 밴드 V 0.30~0.42가 '천사의 고리' 높이에 오도록 가닥마다 다시 매김), U = 가닥 폭.
- 색 영역(v2 산출물): 한 LOD 메시를 세 프리미티브로 나눈다 — `hair`(본체), `hair-tip`(가닥 끝 `tip_frac` 구간, 2~25 cm, 염색·끝 색),
  `hair-accent`(안쪽 층·브릿지 줄기·머리끈). 재질은 `ts_hair_<스타일>`, `ts_hair_tip_<스타일>`, `ts_hair_accent_<스타일>`.
  제안 역할 = 영역 이름(`hair`·`hair-tip`·`hair-accent`), 제안 colorKey: `hair`, `hairTip`, `hairAccent`(모두 recolor, 같은 램프 텍스처).
- 형태 슬라이더(v2 산출물): `shape:<이름>:+` / `shape:<이름>:-` morph(LOD0·LOD1, LOD2는 체형 morph만). 이름은 `SHAPE_KEYS[스타일]`
  (length·volume·bangs·sideLength·wave·curl·tail, 스타일마다 4~5개 = morph 8~10개). 같은 PRNG 수열로 매개변수 ±1 빌드를 다시 만들어 뺀 값이라
  위상이 같고, 극값(가중치 1)은 그 빌드와 똑같다(빌드 때 관통·눈 가림을 잰다). 현재 계약 morph 어휘 밖이라 v1 산출물에는 넣지 않는다.
- 헤어 부속(별도 GLB, `ACCESSORIES` 12종): 메시 노드 `TS_HairAccessory_<id>` 하나, 머리 본 100 % 스킨, morph = 머리 부착 체형 8 + `shape:fit:±`.
  색 영역(프리미티브·재질) — `hair-accessory`(`ts_hairacc_<id>`, colorKey `hairAccessory`), `hair-accessory-accent`(`ts_hairacc_accent_<id>`,
  colorKey `hairAccessoryAccent`), 아호게는 `hair`(`ts_hairacc_hair_<id>`, colorKey `hair`, 헤어 램프 텍스처). 앵커(`accessory_anchors`):
  `crown`·`temple-L`·`back-crown`·`near-twin-tie-L/R`(두피 위 `ACCESSORY_BASE_H`)와 `pony-tie`·`pony-tie-top`·`twin-tie-L/R`(머리끈 기준·꼬리 축).
  `shape:fit:+`는 바깥으로 `FIT_OUT_M`, `shape:fit:-`는 안으로 `FIT_IN_M`(1당) 옮겨 헤어 부피에 맞춘다. 스타일별 권장 파일·fit은 `accessory_fit_report`.

진입 스크립트는 `forge_build_hair.py`, 시험은 `tests/test_forge_hair.py`다. 이 모듈은 numpy와 `surface.Surface`(mathutils BVH, bpy 필요)만 쓴다.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field, replace
from typing import Any, Callable

import numpy as np

from . import garment_fit as gf
from .base_assembly import BaseModel, QuantizedGlbWriter
from .garment_presets import morph_names
from .surface import Surface, vertex_normals

# ---------------------------------------------------------------- 상수

#: 계약 어휘의 헤어 7종(`SLOT_PRESET_IDS.hair`의 이름 부분)
HAIR_STYLE_IDS = ("short-layered", "soft-bob", "romance-long", "action-pony", "hime-cut", "wolf-layered", "twin-tail")
#: 헤어가 가져야 하는 morph(계약 `KIT_MORPH_COVERAGE.hair`: 머리 부착 체형 8개)
HAIR_MORPHS = tuple(morph_names("head"))
#: 스타일별 형태 슬라이더(`shape:<이름>:±`, v2 산출물)
SHAPE_KEYS: dict[str, tuple[str, ...]] = {
    "short-layered": ("length", "volume", "bangs", "sideLength"),
    "soft-bob": ("length", "volume", "bangs", "sideLength", "curl"),
    "romance-long": ("length", "volume", "bangs", "sideLength", "wave"),
    "action-pony": ("tail", "volume", "bangs", "sideLength"),
    "hime-cut": ("length", "volume", "bangs", "sideLength"),
    "wolf-layered": ("length", "volume", "bangs", "sideLength"),
    "twin-tail": ("tail", "volume", "bangs", "sideLength", "wave"),
}
#: 색 영역(v2 프리미티브 순서)과 제안 colorKey
ZONES = ("hair", "hair-tip", "hair-accent")
ZONE_COLOR_KEYS = {"hair": "hair", "hair-tip": "hairTip", "hair-accent": "hairAccent"}
#: 두피 덮개를 머리 표면에서 띄우는 거리(m). 0.5~1.5 mm 안이어야 머리를 뚫지 않고 가닥 밑에 숨는다.
CAP_OFFSET_M = 0.0010
#: 가닥 표면과 충돌 표면 사이의 최소 간격(m)
LOCK_CLEARANCE_M = 0.0015
#: 최종 정점이 충돌 표면에서 떨어져 있어야 하는 최소 거리(m)
VERTEX_MIN_DISTANCE_M = 0.0005
#: 텍스처 크기·열(가닥마다 다른 지그재그 위상) 수와 밴드 V 구간
TEXTURE_SIZE = 512
TEXTURE_COLUMNS = 4
BAND_V = (0.30, 0.42)
BAND_HALF_M = 0.0065
#: recolor 텍스처 평균 휘도 목표(검증기 V13 하한 0.75 + JPEG 여유)
TEXTURE_MIN_MEAN = 0.78
#: LOD별 기본 마디 간격(m)·단면 변 수(넓은 가닥, 좁은 가닥)·덮개 정이십면체 세분 단계
LOD_SPACING_M = (0.0100, 0.019, 0.032)
LOD_SIDES = ((8, 6), (6, 5), (4, 4))
LOD_CAP_LEVEL = (3, 3, 2)
#: 곡률 적응 표본: 1 rad 꺾일 때 이만큼(m) 길이를 더 준 것처럼 마디를 촘촘하게 둔다
CURVATURE_WEIGHT_M = 0.018
#: 머리 본 가중치가 1에서 0으로 내려가는 높이 구간의 아래쪽은 어깨선(`shoulder_y`)에서 이만큼 아래
SKIN_HEAD_BELOW_SHOULDER_M = 0.02
#: 하이라이트 고리 높이(두개골 중심 C 위, m)
RING_ABOVE_CENTER_M = 0.048


# ---------------------------------------------------------------- 결정적 PRNG (mulberry32 · fnv1a32)


def fnv1a32(text: str) -> int:
    """`shared/hash.ts`의 fnv1a32(UTF-8 바이트의 FNV-1a 32bit)."""
    value = 0x811C9DC5
    for byte in text.encode("utf-8"):
        value ^= byte
        value = (value * 0x01000193) & 0xFFFFFFFF
    return value


class Prng:
    """`shared/prng.ts`의 mulberry32와 같은 수열을 내는 결정적 난수원. 전역 난수는 쓰지 않는다."""

    def __init__(self, seed: int) -> None:
        self._state = int(seed) & 0xFFFFFFFF

    def next(self) -> float:
        """[0, 1) 균등 난수."""
        self._state = (self._state + 0x6D2B79F5) & 0xFFFFFFFF
        t = self._state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    def uniform(self, low: float, high: float) -> float:
        return low + (high - low) * self.next()

    def jitter(self, amount: float) -> float:
        """[-amount, amount) 균등."""
        return amount * (2.0 * self.next() - 1.0)

    def gaussian(self) -> float:
        """Box-Muller(prng.ts의 nextGaussian과 같은 식)."""
        u1 = 1.0 - self.next()
        u2 = self.next()
        return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)


def style_seed(style_id: str, base_id: str) -> int:
    return fnv1a32(f"forge-hair/{style_id}/{base_id}")


# ---------------------------------------------------------------- 벡터 도구


def unit(vectors: np.ndarray) -> np.ndarray:
    vectors = np.asarray(vectors, dtype=np.float64)
    length = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return vectors / np.maximum(length, 1e-12)


def smoothstep(edge0: float, edge1: float, x: np.ndarray | float) -> np.ndarray:
    """edge0→edge1에서 0→1(edge1 < edge0이면 1→0)."""
    span = edge1 - edge0
    t = np.clip((np.asarray(x, dtype=np.float64) - edge0) / (span if abs(span) > 1e-12 else 1e-12), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def sph(theta_deg: float | np.ndarray, phi_deg: float | np.ndarray) -> np.ndarray:
    """방위 θ(+Z=0°, +X=90°)·극각 φ(+Y=0°)의 단위 방향."""
    theta = np.radians(theta_deg)
    phi = np.radians(phi_deg)
    return np.stack(np.broadcast_arrays(np.sin(phi) * np.sin(theta), np.cos(phi), np.sin(phi) * np.cos(theta)), axis=-1).astype(np.float64)


def to_sph(directions: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """단위 방향 → (θ, φ) 라디안. θ ∈ [0, 2π)."""
    d = unit(directions)
    theta = np.mod(np.arctan2(d[..., 0], d[..., 2]), 2.0 * np.pi)
    phi = np.arccos(np.clip(d[..., 1], -1.0, 1.0))
    return theta, phi


def slerp(a: np.ndarray, b: np.ndarray, t: np.ndarray) -> np.ndarray:
    """단위 벡터 a→b 구면 선형 보간. t (n,) → (n,3)."""
    a, b = unit(a), unit(b)
    t = np.asarray(t, dtype=np.float64)[:, None]
    dot = float(np.clip(a @ b, -1.0, 1.0))
    omega = math.acos(dot)
    if omega < 1e-6:
        return unit(a[None, :] * (1.0 - t) + b[None, :] * t)
    s = math.sin(omega)
    return unit((np.sin((1.0 - t) * omega) / s) * a[None, :] + (np.sin(t * omega) / s) * b[None, :])


def rotate(vectors: np.ndarray, axis: np.ndarray, angle: np.ndarray | float) -> np.ndarray:
    """로드리게스 회전(점마다 축·각이 달라도 된다)."""
    vectors = np.asarray(vectors, dtype=np.float64)
    axis = unit(np.broadcast_to(axis, vectors.shape))
    angle = np.broadcast_to(np.asarray(angle, dtype=np.float64), vectors.shape[:-1])[..., None]
    cos, sin = np.cos(angle), np.sin(angle)
    return vectors * cos + np.cross(axis, vectors) * sin + axis * np.sum(axis * vectors, axis=-1, keepdims=True) * (1.0 - cos)


# ---------------------------------------------------------------- 곡선 도구


def arc_lengths(points: np.ndarray) -> np.ndarray:
    seg = np.linalg.norm(np.diff(points, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(seg)])


def resample(points: np.ndarray, spacing: float | None = None, count: int | None = None) -> np.ndarray:
    """호 길이 기준 균일 재표본(양 끝 유지)."""
    points = np.asarray(points, dtype=np.float64)
    s = arc_lengths(points)
    total = float(s[-1])
    if count is None:
        count = max(2, int(math.ceil(total / max(spacing or 0.004, 1e-6))) + 1)
    if total < 1e-9:
        return np.repeat(points[:1], count, axis=0)
    targets = np.linspace(0.0, total, count)
    return np.stack([np.interp(targets, s, points[:, k]) for k in range(3)], axis=1)


def adaptive_resample(points: np.ndarray, count: int, curvature_weight: float = CURVATURE_WEIGHT_M) -> np.ndarray:
    """곡률이 큰 곳(컬·꺾임)에 마디를 더 두는 재표본: 비용 = 호 길이 + 가중치 × 꺾인 각."""
    fine = resample(points, spacing=0.0015)
    if len(fine) < 3:
        return resample(points, count=count)
    tangent = unit(np.diff(fine, axis=0))
    turn = np.concatenate([[0.0], np.arccos(np.clip(np.einsum("ij,ij->i", tangent[1:], tangent[:-1]), -1.0, 1.0)), [0.0]])
    seg = np.concatenate([[0.0], np.linalg.norm(np.diff(fine, axis=0), axis=1)])
    cost = np.cumsum(seg + curvature_weight * turn)
    targets = np.linspace(0.0, float(cost[-1]), count)
    return np.stack([np.interp(targets, cost, fine[:, k]) for k in range(3)], axis=1)


def catmull_rom(control: np.ndarray, samples: int = 10) -> np.ndarray:
    """균일 Catmull-Rom 스플라인(모든 제어점을 지난다)."""
    control = np.asarray(control, dtype=np.float64)
    if len(control) < 3:
        return resample(control, count=max(2, samples * max(1, len(control) - 1)))
    padded = np.vstack([2 * control[0] - control[1], control, 2 * control[-1] - control[-2]])
    out = []
    t = np.linspace(0.0, 1.0, samples, endpoint=False)[:, None]
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1], padded[i], padded[i + 1], padded[i + 2]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t**2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t**3))
    out.append(control[-1:])
    return np.vstack(out)


def smooth_polyline(points: np.ndarray, iterations: int, lam: float = 0.35, fixed: tuple[bool, bool] = (True, False)) -> np.ndarray:
    """곡선 라플라시안 평활(양 끝 고정 여부 선택)."""
    p = np.array(points, dtype=np.float64)
    for _ in range(iterations):
        mid = 0.5 * (p[:-2] + p[2:])
        p[1:-1] += lam * (mid - p[1:-1])
        if not fixed[1] and len(p) > 2:
            p[-1] += lam * 0.5 * ((2 * p[-2] - p[-3]) - p[-1])
    return p


def concat_paths(*paths: np.ndarray) -> np.ndarray:
    """이어 붙이기(이웃 경로의 겹치는 끝점은 하나로)."""
    out: list[np.ndarray] = []
    for path in paths:
        path = np.asarray(path, dtype=np.float64)
        if out and np.linalg.norm(out[-1][-1] - path[0]) < 1e-6:
            path = path[1:]
        if len(path):
            out.append(path)
    return np.vstack(out)


def parallel_frames(points: np.ndarray, first_normal: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """평행 이동 프레임(접선, 법선, 종법선)."""
    tangent = unit(np.gradient(points, axis=0))
    normals = np.zeros_like(points)
    n = first_normal - (first_normal @ tangent[0]) * tangent[0]
    n = n / max(float(np.linalg.norm(n)), 1e-9)
    for i in range(len(points)):
        n = n - (n @ tangent[i]) * tangent[i]
        n = n / max(float(np.linalg.norm(n)), 1e-9)
        normals[i] = n
    return tangent, normals, unit(np.cross(tangent, normals))


# ---------------------------------------------------------------- 머리 장(場)


def _filter_grid(grid: np.ndarray, size_phi: int, size_theta: int, op: Callable[[np.ndarray, np.ndarray], np.ndarray]) -> np.ndarray:
    """(φ, θ) 격자에 최소·최대 필터를 건다. θ는 주기, φ는 가장자리 복제."""
    out = grid.copy()
    for shift in range(1, size_theta + 1):
        out = op(out, np.roll(grid, shift, axis=1))
        out = op(out, np.roll(grid, -shift, axis=1))
    staged = out.copy()
    padded = np.pad(staged, ((size_phi, size_phi), (0, 0)), mode="edge")
    for shift in range(1, size_phi + 1):
        out = op(out, padded[size_phi - shift : size_phi - shift + len(grid)])
        out = op(out, padded[size_phi + shift : size_phi + shift + len(grid)])
    return out


def _blur_grid(grid: np.ndarray, passes: int = 3) -> np.ndarray:
    out = grid.copy()
    for _ in range(passes):
        out = (out + np.roll(out, 1, axis=1) + np.roll(out, -1, axis=1)) / 3.0
        padded = np.pad(out, ((1, 1), (0, 0)), mode="edge")
        out = (padded[:-2] + padded[1:-1] + padded[2:]) / 3.0
    return out


@dataclass
class HeadFrame:
    """베이스 한 개의 머리 표면 장·랜드마크·충돌 표면·스킨/morph 원천."""

    base_id: str
    center: np.ndarray
    step_deg: float
    r_raw: np.ndarray  # (P, T) 바깥 교차 반지름(귀·코 포함)
    r_skull: np.ndarray  # (P, T) 열림 연산 + 평활(귀·코 제거)
    r_cover: np.ndarray  # (P, T) 팽창 + 평활(귀를 덮는 바깥 장)
    marks: dict[str, Any]
    collision: Any  # Surface: 몸 + 머리 + 눈썹 + 속눈썹(T-포즈, 용접)
    collision_field: np.ndarray
    head: Any  # Surface: TS_Head(용접)
    head_field: np.ndarray
    head_joints: np.ndarray
    head_weights: np.ndarray
    head_deltas: dict[str, np.ndarray]
    head_scale: dict[str, float]
    body: Any  # Surface: TS_Body(용접)
    body_deltas: dict[str, np.ndarray]
    joint_names: list[str]
    joint_parents: list[int]
    joint_tpose: np.ndarray

    # ---- 장 조회
    def radius(self, directions: np.ndarray, kind: str = "skull") -> np.ndarray:
        grid = {"skull": self.r_skull, "cover": self.r_cover, "raw": self.r_raw}[kind]
        theta, phi = to_sph(np.atleast_2d(directions))
        step = math.radians(self.step_deg)
        fp = np.clip(phi / step, 0.0, grid.shape[0] - 1.000001)
        ft = theta / step
        i0 = np.floor(fp).astype(int)
        j0 = np.floor(ft).astype(int) % grid.shape[1]
        j1 = (j0 + 1) % grid.shape[1]
        a = fp - i0
        b = ft - np.floor(ft)
        i1 = np.minimum(i0 + 1, grid.shape[0] - 1)
        return (1 - a) * ((1 - b) * grid[i0, j0] + b * grid[i0, j1]) + a * ((1 - b) * grid[i1, j0] + b * grid[i1, j1])

    def scalp(self, directions: np.ndarray, height: np.ndarray | float, kind: str = "skull") -> np.ndarray:
        directions = unit(np.atleast_2d(directions))
        return self.center + directions * (self.radius(directions, kind) + np.asarray(height, dtype=np.float64))[..., None]

    def joint(self, name: str) -> np.ndarray:
        return self.joint_tpose[self.joint_names.index(name)]


def _weld(positions: np.ndarray, triangles: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(대표 위치, 대표 삼각형, 원래 정점 → 대표 번호)."""
    index, welded = gf.weld_vertices(np.asarray(positions, dtype=np.float64))
    return welded, index[np.asarray(triangles, dtype=np.int64)], index


def _first_of(index: np.ndarray, count: int) -> np.ndarray:
    """대표 정점마다 원래 정점 하나(첫 번째)."""
    first = np.full(count, -1, dtype=np.int64)
    order = np.arange(len(index))[::-1]
    first[index[order]] = order
    return first


def build_head_frame(base: BaseModel, base_id: str, step_deg: float = 2.5) -> HeadFrame:
    """베이스 npz에서 `HeadFrame`을 만든다(bpy 필요: mathutils BVH)."""
    head = base.mesh("head_")
    body = base.mesh("body_")
    head_pos = head["tpose_positions"].astype(np.float64)
    body_pos = body["tpose_positions"].astype(np.float64)
    brows = [base.arrays[f"mesh/TS_Brow_{side}/0/tpose_positions"].astype(np.float64) for side in ("L", "R")]
    brow_tris = [base.arrays[f"mesh/TS_Brow_{side}/0/triangles"].astype(np.int64) for side in ("L", "R")]
    lashes = base.arrays["mesh/TS_Lashes/0/tpose_positions"].astype(np.float64)
    lash_tris = base.arrays["mesh/TS_Lashes/0/triangles"].astype(np.int64)
    eyes = [base.arrays[f"mesh/TS_Eye_{side}/0/tpose_positions"].astype(np.float64) for side in ("L", "R")]

    # 두개골 구 맞춤(눈썹 위 머리 정점) → 중심 C (좌우 대칭이라 x = 0)
    brow_top = float(max(b[:, 1].max() for b in brows))
    cap = head_pos[head_pos[:, 1] > brow_top + 0.012]
    solution, *_ = np.linalg.lstsq(np.c_[2.0 * cap, np.ones(len(cap))], (cap**2).sum(axis=1), rcond=None)
    center = np.array([0.0, float(solution[1]), float(solution[2])])

    head_w, head_tris_w, head_index = _weld(head_pos, head["triangles"])
    head_surface = Surface(head_w, head_tris_w)
    head_field = vertex_normals(head_w, head_tris_w)

    # 바깥 교차 반지름 격자
    thetas = np.arange(0.0, 360.0, step_deg)
    phis = np.arange(0.0, 162.5 + 1e-9, step_deg)
    tt, pp = np.meshgrid(thetas, phis)
    dirs = sph(tt.ravel(), pp.ravel())
    reach = 0.35
    hits, tri = head_surface.ray(center + dirs * reach, -dirs, reach)
    radius = np.where(tri >= 0, np.linalg.norm(hits - center, axis=1), np.nan).reshape(tt.shape)
    for i in range(radius.shape[0]):  # 빗나간 광선(목 구멍 쪽)은 위 행 값으로 채운다
        bad = np.isnan(radius[i])
        if bad.any():
            radius[i, bad] = radius[i - 1, bad] if i > 0 else np.nanmean(radius[i])
    window = int(round(12.5 / step_deg))
    opened = _filter_grid(_filter_grid(radius, window, window, np.minimum), window, window, np.maximum)
    r_skull = _blur_grid(opened, 3)
    dilated = _filter_grid(radius, int(round(7.5 / step_deg)), int(round(7.5 / step_deg)), np.maximum)
    r_cover = np.maximum(_blur_grid(dilated, 2), r_skull)

    # 랜드마크
    eye_l = eyes[0]
    ear = head_pos[np.abs(head_pos[:, 0]) > 0.068]
    ear_l = ear[ear[:, 0] > 0]
    front = head_pos[(np.abs(head_pos[:, 0]) < 0.006)]
    front_profile = front[front[:, 2] > center[2]]
    chin_y = float(front_profile[front_profile[:, 2] > 0.11, 1].min())
    shoulder = body_pos[(np.abs(body_pos[:, 0]) > 0.075) & (np.abs(body_pos[:, 0]) < 0.125) & (body_pos[:, 1] > 1.25) & (body_pos[:, 1] < 1.47)]
    torso = body_pos[body["region"] == base.region_ids.index("torso")]
    marks: dict[str, Any] = {
        "top_y": float(head_pos[:, 1].max()),
        "brow_top_y": brow_top,
        "brow_bottom_y": float(min(b[:, 1].min() for b in brows)),
        "brow_front_z": float(max(b[:, 2].max() for b in brows)),
        "brow_outer_x": float(brows[0][:, 0].max()),
        "eye_center": eye_l.mean(axis=0),
        "eye_top_y": float(eye_l[:, 1].max()),
        "eye_bottom_y": float(eye_l[:, 1].min()),
        "eye_inner_x": float(eye_l[:, 0].min()),
        "eye_outer_x": float(eye_l[:, 0].max()),
        "eye_front_z": float(eye_l[:, 2].max()),
        "ear_top_y": float(ear_l[:, 1].max()),
        "ear_bottom_y": float(ear_l[:, 1].min()),
        "ear_front_z": float(ear_l[:, 2].max()),
        "ear_back_z": float(ear_l[:, 2].min()),
        "ear_x": float(ear_l[:, 0].max()),
        "chin_y": chin_y,
        "nape_y": float(base.arrays["joint_tpose"][base.joint_names.index("mixamorig:Head")][1]) + 0.008,
        "shoulder_y": float(np.percentile(shoulder[:, 1], 99.5)) if len(shoulder) else 1.40,
        "back_z": float(np.percentile(torso[torso[:, 1] > 1.15, 2], 0.5)),
        "chest_z": float(np.percentile(torso[(torso[:, 1] > 1.10) & (torso[:, 1] < 1.30), 2], 99.5)),
        "head_back_z": float(head_pos[:, 2].min()),
        "head_half_width": float(np.abs(head_pos[head_pos[:, 1] > brow_top, 0]).max()),
    }
    ys = np.arange(1.50, marks["top_y"] + 1e-9, 0.005)
    forehead = []
    for y in ys:
        band = front_profile[np.abs(front_profile[:, 1] - y) < 0.004]
        forehead.append(float(band[:, 2].max()) if len(band) else np.nan)
    marks["forehead_y"] = ys
    marks["forehead_z"] = np.array(forehead)

    # 충돌 표면: 몸 + 머리 + 눈썹 + 속눈썹
    parts = [(body_pos, body["triangles"]), (head_pos, head["triangles"]), (brows[0], brow_tris[0]), (brows[1], brow_tris[1]), (lashes, lash_tris)]
    positions, triangles, offset = [], [], 0
    for p, t in parts:
        positions.append(p)
        triangles.append(np.asarray(t, dtype=np.int64) + offset)
        offset += len(p)
    coll_w, coll_tris_w, _ = _weld(np.vstack(positions), np.vstack(triangles))
    collision = Surface(coll_w, coll_tris_w)
    collision_field = vertex_normals(coll_w, coll_tris_w)

    # 스킨·morph 원천
    head_first = _first_of(head_index, len(head_w))
    head_names = [str(v) for v in head["morph_names"]]
    head_deltas = {name: head["morph_delta"][head_names.index(name)].astype(np.float64)[head_first] for name in HAIR_MORPHS}
    head_joints = head["joints"].astype(np.int64)[head_first]
    head_weights = head["weights"].astype(np.float64)[head_first]
    cranium = head_w[:, 1] > brow_top
    head_scale = {}
    for name, delta in head_deltas.items():
        q = head_w[cranium]
        p = q + delta[cranium]
        qc, pc = q - q.mean(axis=0), p - p.mean(axis=0)
        head_scale[name] = float(np.sum(qc * pc) / np.sum(qc * qc))
    body_w, body_tris_w, body_index = _weld(body_pos, body["triangles"])
    body_first = _first_of(body_index, len(body_w))
    body_names = [str(v) for v in body["morph_names"]]
    body_deltas = {name: body["morph_delta"][body_names.index(name)].astype(np.float64)[body_first] for name in HAIR_MORPHS}
    return HeadFrame(
        base_id=base_id,
        center=center,
        step_deg=step_deg,
        r_raw=radius,
        r_skull=r_skull,
        r_cover=r_cover,
        marks=marks,
        collision=collision,
        collision_field=collision_field,
        head=head_surface,
        head_field=head_field,
        head_joints=head_joints,
        head_weights=head_weights,
        head_deltas=head_deltas,
        head_scale=head_scale,
        body=Surface(body_w, body_tris_w),
        body_deltas=body_deltas,
        joint_names=list(base.joint_names),
        joint_parents=list(base.joint_parents),
        joint_tpose=base.arrays["joint_tpose"].astype(np.float64),
    )


# ---------------------------------------------------------------- 가닥 청크


@dataclass
class Lock:
    """가닥 청크 하나: 가이드 곡선(뿌리 → 끝)과 단면·명암·색 영역 설정."""

    points: np.ndarray
    width: float
    thickness: float
    group: str
    layer: int = 0  # 0 = 바깥 층, 1 = 안쪽 층(그늘·안쪽 컬러, LOD2에서 뺀다)
    tip: str = "point"  # point: 한 점으로 모이는 끝 / blunt: 뭉툭하게 자른 끝
    taper_len: float = 0.03  # 끝에서 가늘어지는 길이(m)
    taper_power: float = 0.85  # < 1 이면 둥근 끝, > 1 이면 가는 바늘 끝
    root_scale: float = 0.80  # 뿌리 폭 배율(뿌리에서 최대 폭까지 2 cm에 걸쳐 커진다)
    thickness_tip: float = 0.40  # 끝 직전 두께 배율(폭보다 덜 얇아진다)
    twist_deg: float = 0.0
    band_y: float | None = None  # 하이라이트 고리 높이(가닥이 이 높이를 지나는 곳에 밴드)
    hints: np.ndarray | None = None  # 점마다 단면 바깥 방향 힌트(None이면 머리·축 바깥)
    ao: float = 1.0
    accent: bool = False  # 색 영역 hair-accent(안쪽 층·브릿지 줄기)
    bridge: bool = False  # 브릿지 줄기(UV1.U = 0.5)
    tip_frac: float = 0.30  # 색 영역 hair-tip이 차지하는 끝 쪽 길이 비율(2~25 cm로 자른다)
    strip: str | None = None  # 띠 그룹 이름(같은 그룹의 이웃 가닥과 경계를 공유하는 판 조각), None이면 홀로 선 관
    split_len: float = 0.03  # 띠 가닥이 이웃과 갈라져 혼자 뾰족해지는 끝 길이(m)

    def length(self) -> float:
        return float(arc_lengths(self.points)[-1])


@dataclass
class Tie:
    """머리끈(포니·트윈테일 묶음): 축 둘레 납작한 고리."""

    center: np.ndarray
    axis: np.ndarray
    radius: float
    tube: float


@dataclass
class StyleBuild:
    style_id: str
    base_id: str
    params: dict[str, float]
    locks: list[Lock]
    ties: list[Tie]
    cap_region: Callable[[np.ndarray], np.ndarray]  # 방향 (n,3) → 덮개 포함 여부 (n,)
    band_y: float
    strip_specs: dict[str, dict[str, Any]] = field(default_factory=dict)  # 띠 그룹 → {closed, edge, bulge}


def hint_for(frame: HeadFrame, points: np.ndarray) -> np.ndarray:
    """기본 단면 방향: 두피 위는 C에서 바깥, C 아래로 늘어진 곳은 세로축(C를 지나는 수직선)에서 수평 바깥."""
    radial = unit(points - frame.center)
    horizontal = points - frame.center
    horizontal[:, 1] = 0.0
    horizontal = unit(horizontal)
    k = smoothstep(frame.center[1] - 0.03, frame.center[1] - 0.12, points[:, 1])[:, None]
    return unit((1.0 - k) * radial + k * horizontal)


# ---------------------------------------------------------------- 스타일 작성 도구


class Sketch:
    """스타일 빌더가 쓰는 작도 도구(머리 장 기준 좌표, PRNG, 형태 매개변수)."""

    def __init__(self, frame: HeadFrame, prng: Prng, style_id: str, params: dict[str, float]) -> None:
        self.frame = frame
        self.rng = prng
        self.style_id = style_id
        self.p = params
        self.male = frame.base_id == "male"
        self.c = frame.center
        self.m = frame.marks
        self.locks: list[Lock] = []
        self.ties: list[Tie] = []
        self.strip_specs: dict[str, dict[str, Any]] = {}
        self.band_y = float(frame.center[1] + RING_ABOVE_CENTER_M)

    def strip(self, name: str, *, closed: bool = False, edge: float = 0.62, bulge: float = 0.18, diverge: float = 0.8, columns: tuple[int, int, int] | None = None, spacing: float = 1.0) -> str:
        """띠 그룹을 등록한다. 같은 그룹에 넣은 가닥은 넣은 순서대로 이웃끼리 경계를 공유해 한 덩어리 판(껍질)이 되고 끝에서 갈라진다.
        `closed`면 마지막과 첫 가닥도 잇는다(고리), `edge`는 경계 두께 비율, `bulge`는 가닥 가운데 볼록함(두께 비율),
        `diverge`는 두 가이드 거리가 두 폭 평균의 이 배수를 넘으면 경계를 푸는 기준(바퀴살 그룹은 크게 둬 끝에서만 갈라지게 한다),
        `columns`는 LOD별 단면 가로 표본 수, `spacing`은 길이 방향 고리 간격 배율(완만한 긴 꼬리는 크게 둬 정점을 아낀다)."""
        self.strip_specs[name] = {"closed": closed, "edge": edge, "bulge": bulge, "diverge": diverge, "columns": columns or STRIP_COLUMNS, "spacing": spacing}
        return name

    # ---- 바퀴살(가마·묶음점에서 대원으로 퍼지는 경로: 서로 교차하지 않는다)
    def spoke_basis(self, origin: np.ndarray, forward: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        o = unit(origin)
        f = unit(forward - (forward @ o) * o)
        return o, f, np.cross(o, f)

    def spoke_dirs(self, origin: np.ndarray, forward: np.ndarray, psi: float, gammas: np.ndarray) -> np.ndarray:
        """`origin`에서 출발 각 ψ(° — 0 = `forward` 쪽, +90 = origin × forward 쪽)로 떠나는 대원 위 각거리 γ(°)의 방향들."""
        o, f, side = self.spoke_basis(origin, forward)
        v = math.cos(math.radians(psi)) * f + math.sin(math.radians(psi)) * side
        g = np.radians(np.asarray(gammas, dtype=np.float64))[:, None]
        return unit(np.cos(g) * o + np.sin(g) * v)

    def psi_for(self, origin: np.ndarray, forward: np.ndarray, theta: float, phi: float) -> float:
        """바퀴살이 방위 θ·극각 φ 근처를 지나도록 하는 출발 각 ψ(°)."""
        target = sph(theta, phi)
        best, best_d = 0.0, -2.0
        gammas = np.linspace(0.0, 179.0, 180)
        for psi in np.arange(-180.0, 180.0, 0.5):
            d = float((self.spoke_dirs(origin, forward, float(psi), gammas) @ target).max())
            if d > best_d:
                best, best_d = float(psi), d
        return best

    def spoke(self, origin: np.ndarray, forward: np.ndarray, psi: float, gamma0: float, gamma1: float, height: Callable[[np.ndarray, np.ndarray], np.ndarray], kind: str = "skull", step: float = 1.0) -> np.ndarray:
        """바퀴살 경로: γ0…γ1(°) 구간을 두피 장 + 층 높이 `height(방향들, γ들)`로 따라간다. `kind="blend"`면 귀 높이 아래에서 귀를 덮는 장으로 넘어간다."""
        gammas = np.arange(gamma0, gamma1 + 1e-9, step)
        dirs = self.spoke_dirs(origin, forward, psi, gammas)
        h = np.asarray(height(dirs, gammas), dtype=np.float64)
        if kind == "blend":
            skull = self.frame.scalp(dirs, h, "skull")
            cover = self.frame.scalp(dirs, h, "cover")
            k = smoothstep(85.0, 110.0, np.degrees(np.arccos(np.clip(dirs[:, 1], -1.0, 1.0))))[:, None]
            return (1.0 - k) * skull + k * cover
        return self.frame.scalp(dirs, h, kind)

    def spoke_to_height(self, origin: np.ndarray, forward: np.ndarray, psi: float, y: float, h: float, gamma0: float = 3.0) -> float:
        """바퀴살이 두피 장 + h 위에서 높이 y에 닿는 γ(°)."""
        gammas = np.arange(gamma0, 179.0, 0.25)
        pts = self.frame.scalp(self.spoke_dirs(origin, forward, psi, gammas), h, "skull")
        below = np.flatnonzero(pts[:, 1] <= y)
        return float(gammas[below[0]]) if len(below) else float(gammas[-1])

    def q(self, key: str) -> float:
        """형태 매개변수(없으면 0)."""
        return float(self.p.get(key, 0.0))

    # ---- 두피 위 호
    def arc(self, d0: np.ndarray, d1: np.ndarray, h0: float, h1: float, via: np.ndarray | None = None, kind: str = "skull", spacing: float = 0.003, ease: float = 1.0) -> np.ndarray:
        """d0 → (via) → d1 구면 호를 두피 장 + 층 높이(h0 → h1)로 따라간다. `ease` > 1 이면 높이가 늦게 오른다."""
        d0, d1 = unit(d0), unit(d1)
        span = math.acos(float(np.clip(d0 @ d1, -1.0, 1.0)))
        if via is not None:
            via = unit(via)
            span = math.acos(float(np.clip(d0 @ via, -1.0, 1.0))) + math.acos(float(np.clip(via @ d1, -1.0, 1.0)))
        count = max(4, int(span * 0.08 / spacing) + 2)
        t = np.linspace(0.0, 1.0, count)
        if via is None:
            dirs = slerp(d0, d1, t)
        else:
            first, second = slerp(d0, via, t), slerp(via, d1, t)
            dirs = np.array([slerp(a, b, np.array([ti]))[0] for a, b, ti in zip(first, second, t, strict=True)])
        h = h0 + (h1 - h0) * smoothstep(0.0, 1.0, t**ease)
        if kind == "blend":
            skull = self.frame.scalp(dirs, h, "skull")
            cover = self.frame.scalp(dirs, h, "cover")
            k = smoothstep(0.35, 0.75, t)[:, None]
            return (1.0 - k) * skull + k * cover
        return self.frame.scalp(dirs, h, kind)

    def drop_index(self, points: np.ndarray, min_phi_deg: float = 55.0) -> int:
        """두피에서 떨어지는 지점: C를 지나는 세로축에서의 수평 거리가 가장 큰 점(그 아래로 머리가 안으로 말려 들어간다)."""
        rel = points - self.c
        rho = np.hypot(rel[:, 0], rel[:, 2])
        phi = np.degrees(np.arccos(np.clip(unit(rel)[:, 1], -1.0, 1.0)))
        rho = np.where(phi >= min_phi_deg, rho, -np.inf)
        return int(np.argmax(rho))

    def hang(self, start: np.ndarray, controls: list[np.ndarray], samples: int = 14) -> np.ndarray:
        """시작 경로 끝에서 접선을 이어 제어점들을 지나는 늘어진 구간."""
        start = np.asarray(start, dtype=np.float64)
        tangent = unit(start[-1] - start[max(0, len(start) - 4)])
        lead = start[-1] + tangent * 0.008
        head = start[-2:] if len(start) >= 2 else start[-1:]
        curve = catmull_rom(np.vstack([head, lead[None, :], np.asarray(controls, dtype=np.float64)]), samples)
        k = int(np.argmin(np.linalg.norm(curve - start[-1], axis=1)))
        return concat_paths(start, curve[k:])

    def outward(self, point: np.ndarray) -> np.ndarray:
        """C를 지나는 세로축에서 수평 바깥 방향."""
        rel = np.asarray(point, dtype=np.float64) - self.c
        rel[1] = 0.0
        return unit(rel)

    def phi_at_height(self, theta_deg: float, y: float, kind: str = "skull", h: float = 0.0, phi_range: tuple[float, float] = (15.0, 140.0)) -> float:
        """방위 θ의 두피 장(+h) 위에서 높이가 y인 극각(°)."""
        phis = np.linspace(phi_range[0], phi_range[1], 251)
        pts = self.frame.scalp(sph(np.full_like(phis, theta_deg), phis), h, kind)
        return float(np.interp(-y, -pts[:, 1], phis))

    def wave(self, points: np.ndarray, amplitude: float, waves: float, phase: float, start: float = 0.35, axis: np.ndarray | None = None) -> np.ndarray:
        """끝으로 갈수록 커지는 굽이(옆 방향 또는 `axis` 방향)."""
        points = resample(points, spacing=0.003)
        s = arc_lengths(points)
        t = s / max(s[-1], 1e-9)
        if axis is None:
            tangent = unit(np.gradient(points, axis=0))
            direction = unit(np.cross(tangent, hint_for(self.frame, points)))
        else:
            direction = np.broadcast_to(unit(axis), points.shape)
        envelope = smoothstep(start, min(1.0, start + 0.3), t)
        return points + direction * (amplitude * envelope * np.sin(2.0 * math.pi * waves * (t - start) + phase))[:, None]

    def add(self, points: np.ndarray, width: float, thickness: float, group: str, **kwargs: Any) -> Lock:
        kwargs.setdefault("band_y", self.band_y)
        lock = Lock(points=resample(points, spacing=0.003), width=width, thickness=thickness, group=group, **kwargs)
        self.locks.append(lock)
        return lock

    # ---- 자주 쓰는 그룹
    def hanging(
        self,
        theta: float,
        origin: np.ndarray,
        y_end: float,
        *,
        h_root: float,
        h_drop: float,
        flare: float,
        curl_in: float,
        curl_up: float = 0.0,
        phi_far: float = 128.0,
        kind: str = "blend",
        root_t: float = 0.08,
        via_back: tuple[float, float, float] | None = None,
        min_drop: float = 0.025,
        lift: float = 0.0,
    ) -> np.ndarray:
        """`origin`(정수리 쪽 방향)에서 방위 θ의 두피를 타고 내려와 떨어진 뒤 `y_end`까지 늘어지고 끝을 안으로 만 경로.

        `via_back` = (x, y, z) 지나갈 점(긴 머리를 어깨 뒤로 넘길 때), `lift` = 층 높이에 더할 값(m)."""
        far = sph(theta, phi_far)
        root = slerp(origin, far, np.array([root_t]))[0]
        on_head = self.arc(root, far, h_root + lift, h_drop + lift, kind=kind)
        k = self.drop_index(on_head)
        head_part = on_head[: k + 1]
        drop = head_part[-1]
        out = self.outward(drop)
        y_end = min(y_end, drop[1] - min_drop)
        fall = drop[1] - y_end
        controls = [drop + np.array([0.0, -0.40 * fall, 0.0]) + out * flare]
        if via_back is not None:
            controls = [np.asarray(via_back, dtype=np.float64)]
        end = np.array([drop[0], y_end, drop[2]]) + out * (0.4 * flare - curl_in)
        if via_back is not None:
            end = np.array([via_back[0], y_end, via_back[2]]) - out * curl_in
        else:
            controls.append(drop + np.array([0.0, -0.80 * fall, 0.0]) + out * (0.75 * flare - 0.25 * curl_in))
        controls.append(end)
        if curl_up > 0.0:
            controls.append(end + np.array([0.0, curl_up, 0.0]) - out * curl_in * 0.7)
        return self.hang(head_part, controls)

    def tail_ring(
        self,
        name: str,
        tie: np.ndarray,
        controls: list[np.ndarray],
        count: int,
        *,
        thickness: float,
        radius: tuple[float, float, float],
        start_dir: np.ndarray,
        group: str = "tail",
        spread_end: float = 0.010,
        wave: tuple[float, float] = (0.0, 1.0),
        split_len: float = 0.06,
        stagger: float = 0.05,
        edge: float = 0.62,
        bulge: float = 0.22,
        columns: tuple[int, int, int] = (3, 3, 2),
        spacing: float = 1.7,
    ) -> np.ndarray:
        """꼬리: 묶음점에서 `controls`를 지나는 축 둘레의 닫힌 띠 고리(`count` 덩어리). radius = (묶음, 중간, 끝 반지름).
        덩어리끼리 경계를 공유해 둥근 다발이 되고 끝에서 갈라진다. 축 점들을 돌려준다."""
        ring = self.strip(name, closed=True, edge=edge, bulge=bulge, diverge=99.0, columns=columns, spacing=spacing)
        axis = catmull_rom(np.vstack([tie[None, :], (tie + unit(start_dir) * 0.012)[None, :], np.asarray(controls, dtype=np.float64)]), 16)
        axis = resample(axis, spacing=0.003)
        s = arc_lengths(axis)
        t = s / max(s[-1], 1e-9)
        helper = np.array([0.0, 1.0, 0.0]) if abs(unit(start_dir)[1]) < 0.85 else np.array([1.0, 0.0, 0.0])
        _, normal, binormal = parallel_frames(axis, np.cross(unit(start_dir), helper))
        r0, r1, r2 = radius
        bulk = np.where(t < 0.25, r0 + (r1 - r0) * smoothstep(0.0, 0.25, t), r1 + (r2 - r1) * smoothstep(0.25, 1.0, t))
        for j in range(count):
            psi = 2.0 * math.pi * (j + 0.5) / count + self.rng.jitter(0.12)
            cut = 1.0 - stagger * self.rng.next()
            phase = self.rng.uniform(0.0, 2.0 * math.pi)
            split = split_len * self.rng.uniform(0.9, 1.15)
            direction = np.cos(psi) * normal + np.sin(psi) * binormal
            radial = bulk + spread_end * smoothstep(0.7, 1.0, t)
            pts = axis + direction * radial[:, None]
            if wave[0] > 0.0:
                pts = pts + binormal * (wave[0] * smoothstep(0.25, 0.55, t) * np.sin(2.0 * math.pi * wave[1] * t + 0.6 * phase))[:, None]
            keep = t <= cut
            circumference = 2.0 * math.pi * float(np.median(radial)) / count
            self.add(pts[keep], 1.6 * circumference, thickness, group, hints=direction[keep], taper_len=split, taper_power=0.85, root_scale=0.7, tip_frac=0.30, strip=ring, split_len=split)
        return axis

    def ring(self, name: str, origin: np.ndarray, forward: np.ndarray, entries: list[dict[str, Any]], *, closed: bool = True, open_at: float = 0.0, edge: float = 0.60, bulge: float = 0.24, columns: tuple[int, int, int] | None = None, spacing: float = 1.0) -> None:
        """바퀴살 덩어리 고리: 항목마다 출발 각 ψ를 정해(`psi` 또는 겨냥점 `theta`·`aim`) ψ 순서로 놓는다. 바퀴살은 교차하지 않아 이웃끼리 경계를 공유한다.
        `closed=False`면 ψ = `open_at`에서 고리가 열린다(가르마). 항목마다 난수를 같은 개수 소비해 형태 매개변수와 무관하게 위상이 같다."""
        group = self.strip(name, closed=closed, edge=edge, bulge=bulge, diverge=99.0, columns=columns, spacing=spacing)
        planned = []
        for entry in entries:
            psi = entry.get("psi")
            if psi is None:
                psi = self.psi_for(origin, forward, entry["theta"], entry.get("aim", 100.0))
            planned.append(((psi - open_at) % 360.0, psi, entry))
        planned.sort(key=lambda item: item[0])
        for _, psi, entry in planned:
            jit_psi = self.rng.jitter(1.0)
            jit_end = self.rng.jitter(1.0)
            jit_thick = self.rng.uniform(0.94, 1.06)
            jit_split = self.rng.uniform(0.9, 1.15)
            jit_phase = self.rng.uniform(0.0, 2.0 * math.pi)
            pts = self.clump_path(origin, forward, psi + entry.get("psi_jitter", 1.0) * jit_psi, entry, jit_end, jit_phase)
            split = entry.get("split_len", 0.035) * jit_split
            self.add(
                pts,
                entry.get("width", 0.045),
                entry.get("thickness", 0.009) * jit_thick,
                entry.get("group", entry["kind"]),
                tip=entry.get("tip", "point"),
                taper_len=entry.get("taper_len", split),
                taper_power=entry.get("taper_power", 0.8),
                strip=group,
                split_len=split,
                layer=entry.get("layer", 0),
                ao=entry.get("ao", 1.0),
                accent=entry.get("accent", False),
                bridge=entry.get("bridge", False),
                tip_frac=entry.get("tip_frac", 0.30),
                band_y=entry.get("band_y", self.band_y),
                hints=None,
            )

    def short_path(self, origin: np.ndarray, forward: np.ndarray, psi: float, e: dict[str, Any], jit_end: float) -> np.ndarray:
        """머리에 붙어 끝나는 짧은 덩어리: 가장 넓은 곳(수평 반지름 최대)까지는 바퀴살 대원을 따르고, 그 아래는 그 방위의 두피 자오선을 따라
        수직으로 내려가 `y_end`에서 끝난다(대원을 계속 따르면 귀 밑으로 돌아 뺨·턱 앞으로 간다). 높이는 뿌리 h_root → 가운데 h_mid → 끝 h_end, 끝 `flick`만큼 바깥으로 튄다."""
        h_root, h_mid, h_end = e.get("h_root", 0.005), e.get("h_mid", 0.010), e.get("h_end", 0.005)
        y_end = e["y_end"] + e.get("end_jitter", 0.003) * jit_end
        gamma0 = e.get("gamma0", 3.0)
        flick = e.get("flick", 0.0)
        probe = self.spoke(origin, forward, psi, gamma0, 150.0, lambda d, g: np.full(len(g), h_mid), kind="blend")
        widest = self.drop_index(probe, 50.0)
        hit = np.flatnonzero(probe[: widest + 1, 1] <= y_end)
        dirs_head = self.spoke_dirs(origin, forward, psi, np.arange(gamma0, 150.0 + 1e-9, 1.0))
        if len(hit):
            dirs = dirs_head[: int(hit[0]) + 1]
        else:
            dirs = dirs_head[: widest + 1]
            theta_w, phi_w = to_sph(dirs[-1])
            phis = np.arange(np.degrees(phi_w), 165.0, 0.8)
            meridian = sph(np.full(len(phis), np.degrees(theta_w)), phis)
            down = self.frame.scalp(meridian, h_end, "cover")
            stop = np.flatnonzero(down[:, 1] <= y_end)
            meridian = meridian[: (int(stop[0]) + 1) if len(stop) else len(meridian)]
            dirs = np.vstack([dirs, meridian[1:]])
        n = len(dirs)
        u = np.linspace(0.0, 1.0, n)
        h = h_root + (h_mid - h_root) * smoothstep(0.0, 0.45, u) - (h_mid - h_end) * smoothstep(0.45, 1.0, u) + flick * smoothstep(0.72, 1.0, u)
        skull = self.frame.scalp(dirs, h, "skull")
        cover = self.frame.scalp(dirs, h, "cover")
        k = smoothstep(85.0, 110.0, np.degrees(np.arccos(np.clip(dirs[:, 1], -1.0, 1.0))))[:, None]
        return (1.0 - k) * skull + k * cover

    def clump_path(self, origin: np.ndarray, forward: np.ndarray, psi: float, e: dict[str, Any], jit_end: float, jit_phase: float) -> np.ndarray:
        """덩어리 경로(종류별). 모두 `origin`에서 출발하는 대원(바퀴살)을 두피 장 + 층 높이로 따라간 뒤 종류에 따라 끝난다.

        bang: 머리선에서 부풀었다가 이마 앞으로 내려와 `y_tip`에서 끝(옆 `drift`°로 쓸어 넘김 가능)
        short: 머리 위에서 `y_end`에 닿아 끝(끝 `flick` m만큼 바깥으로 튐) — 숏·층
        hang: 머리가 안으로 말려 드는 곳에서 떨어져 `y_end`까지 늘어진 뒤 끝을 안(`curl_in`)·위(`curl_up`)로 만다(`fwd`·`out_end`로 끝을 앞·바깥으로)
        long: 떨어진 뒤 어깨 뒤(`route="back"`) 또는 앞(`route="front"`)을 지나 `y_end`까지(굽이 `wave`)
        converge: `origin`(묶음점)에서 겨냥점까지의 바퀴살을 뒤집어 머리선 → 묶음점으로 당겨진 가닥"""
        kind = e["kind"]
        m = self.m
        gamma0 = e.get("gamma0", 3.0)
        if kind == "bang":
            y_tip = e["y_tip"] + e.get("end_jitter", 0.0015) * jit_end
            h_root, h_line, h_tip = e.get("h_root", 0.005), e.get("h_line", 0.013), e.get("h_tip", 0.0055)
            gamma_end = self.spoke_to_height(origin, forward, psi, y_tip, h_tip, gamma0)
            gamma_line = min(self.spoke_to_height(origin, forward, psi, e.get("line_y", m["brow_top_y"] + 0.045), h_line, gamma0), gamma_end - 2.0)

            def bang_h(dirs: np.ndarray, gammas: np.ndarray) -> np.ndarray:
                rise = smoothstep(gamma0 + 1.0, gamma_line, gammas)
                fall = smoothstep(gamma_line, gamma_end, gammas)
                return h_root + (h_line - h_root) * rise - (h_line - h_tip) * fall

            pts = self.spoke(origin, forward, psi, gamma0, gamma_end, bang_h)
            drift = e.get("drift", 0.0)
            if drift:
                gam = np.linspace(gamma0, gamma_end, len(pts))
                angle = np.radians(drift) * smoothstep(gamma_line - 4.0, gamma_end, gam)
                rel = pts - self.c
                pts = self.c + rotate(rel, np.array([0.0, 1.0, 0.0]), angle)
            return pts
        if kind == "short":
            return self.short_path(origin, forward, psi, e, jit_end)
        if kind == "converge":
            target = sph(e["theta"], e["aim"])
            gammas = np.linspace(0.0, 179.0, 359)
            dirs = self.spoke_dirs(origin, forward, psi, gammas)
            gamma_end = float(gammas[int(np.argmax(dirs @ target))]) + e.get("overshoot", 0.0)
            h_tie, h_root = e.get("h_tie", 0.008), e.get("h_root", 0.004)
            gamma_start = e.get("gamma_tie", 4.0)

            def conv_h(dirs: np.ndarray, gammas: np.ndarray) -> np.ndarray:
                return h_root + (h_tie - h_root) * smoothstep(gamma_start + 14.0, gamma_start, gammas)

            pts = self.spoke(origin, forward, psi, gamma_start, gamma_end, conv_h, kind="skull")
            return pts[::-1]
        # hang · long: 바퀴살로 내려와 수평 반지름이 가장 큰 곳에서 떨어진다
        h_root, h_drop = e.get("h_root", 0.005), e.get("h_drop", 0.012)

        def hang_h(dirs: np.ndarray, gammas: np.ndarray) -> np.ndarray:
            return h_root + (h_drop - h_root) * smoothstep(gamma0 + 1.0, 70.0, gammas)

        on_head = self.spoke(origin, forward, psi, gamma0, e.get("gamma_far", 128.0), hang_h, kind="blend")
        index = self.drop_index(on_head, e.get("min_drop_phi", 55.0))
        head_part = on_head[: index + 1]
        drop = head_part[-1]
        out = self.outward(drop)
        y_end = e["y_end"] + e.get("end_jitter", 0.003) * jit_end
        if kind == "hang":
            y_end = min(y_end, drop[1] - 0.025)
            fall = drop[1] - y_end
            flare, curl_in, curl_up = e.get("flare", 0.004), e.get("curl_in", 0.009), e.get("curl_up", 0.003)
            fwd = np.array([0.0, 0.0, e.get("fwd", 0.0)])
            out_end = e.get("out_end", 0.0)
            mid = drop + np.array([0.0, -0.40 * fall, 0.0]) + out * flare + 0.4 * fwd
            low = drop + np.array([0.0, -0.80 * fall, 0.0]) + out * (0.75 * flare - 0.25 * curl_in + 0.5 * out_end) + 0.8 * fwd
            end_point = np.array([drop[0], y_end, drop[2]]) + out * (0.4 * flare - curl_in + out_end) + fwd
            controls = [mid, low, end_point]
            if curl_up > 0.0 or out_end > 0.0:
                controls.append(end_point + np.array([0.0, curl_up + 0.5 * out_end, 0.0]) - out * (0.7 * curl_in - 0.8 * out_end))
            return self.hang(head_part, controls)
        # long
        route = e.get("route", "back")
        shoulder_y = m["shoulder_y"]
        side = 1.0 if drop[0] >= 0.0 else -1.0
        x_end = e.get("x_end", drop[0])
        if route == "back":
            z_back = m["back_z"] - e.get("standoff", 0.012)
            via = np.array([drop[0] * 1.02, shoulder_y + 0.02, min(drop[2], z_back + 0.012)])
            end_point = np.array([x_end, y_end, z_back - 0.004])
        else:
            via = np.array([side * max(abs(drop[0]), 0.080), shoulder_y + 0.012, e.get("z_front", 0.075)])
            end_point = np.array([side * e.get("x_front", 0.090), y_end, e.get("z_end", m["chest_z"] - 0.010)])
        fall = drop[1] - y_end
        mid = drop + np.array([0.0, -0.25 * (drop[1] - via[1]), 0.0]) + out * e.get("flare", 0.004)
        low = 0.5 * (via + end_point) + np.array([0.0, 0.0, 0.0])
        pts = self.hang(head_part, [mid, via, low, end_point])
        amp, waves = e.get("wave", (0.0, 1.5))
        if amp > 0.0:
            pts = self.wave(pts, amp, waves, jit_phase, start=e.get("wave_start", 0.45))
        return pts


# ---------------------------------------------------------------- 충돌


def width_profile(lock: Lock, s: np.ndarray, length: float) -> tuple[np.ndarray, np.ndarray]:
    """뿌리에서 거리 s(m)에서 (폭 배율, 두께 배율)."""
    s = np.asarray(s, dtype=np.float64)
    grow = lock.root_scale + (1.0 - lock.root_scale) * smoothstep(0.0, min(0.02, 0.3 * length), s)
    to_tip = length - s
    if lock.tip == "blunt":
        u = smoothstep(0.006, 0.0, to_tip)
        return grow * (1.0 - 0.18 * u), grow * (1.0 - 0.30 * u)
    taper = max(min(lock.taper_len, 0.85 * length), 1e-4)
    u = np.clip(1.0 - to_tip / taper, 0.0, 1.0)
    shrink = np.clip(1.0 - u, 0.0, 1.0) ** lock.taper_power
    return grow * shrink, grow * (lock.thickness_tip + (1.0 - lock.thickness_tip) * shrink)


def collide_lock(frame: HeadFrame, lock: Lock, iterations: int = 7) -> Lock:
    """가이드 곡선을 충돌 표면 바깥(반두께 + 간격)으로 밀고 다듬기를 반복한다."""
    p = resample(lock.points, spacing=0.003)
    s = arc_lengths(p)
    _, thick = width_profile(lock, s, float(s[-1]))
    clearance = 0.5 * lock.thickness * thick + LOCK_CLEARANCE_M
    for iteration in range(iterations):
        d, _, normal = gf.signed_distance(p, frame.collision, frame.collision_field)
        push = np.maximum(clearance - d, 0.0)
        p = p + push[:, None] * normal
        if iteration < iterations - 1:
            p = smooth_polyline(p, 1, 0.3, fixed=(True, False))
    return replace(lock, points=p)


# ---------------------------------------------------------------- 스윕


def lock_hints(frame: HeadFrame, lock: Lock, points: np.ndarray) -> np.ndarray:
    """점마다 헤어 덩어리 바깥 방향(사용자 힌트가 있으면 그것을 길이 비율로 보간)."""
    if lock.hints is not None:
        # 힌트는 원래 경로를 고르게 표본한 순서대로 둔다(가이드가 재표본·충돌 처리돼도 길이 비율로 대응시킨다)
        s_src = np.linspace(0.0, 1.0, len(lock.hints))
        s_dst = arc_lengths(points) / max(arc_lengths(points)[-1], 1e-9)
        return unit(np.stack([np.interp(s_dst, s_src, lock.hints[:, k]) for k in range(3)], axis=1))
    return hint_for(frame, points)


def lock_frames(frame: HeadFrame, lock: Lock, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """점마다 (접선, 단면 바깥 N, 옆 B). 힌트가 접선과 거의 평행하면 앞 프레임을 평행 이동한다."""
    tangent = unit(np.gradient(points, axis=0))
    hints = lock_hints(frame, lock, points)
    normals = np.zeros_like(points)
    previous = None
    for i in range(len(points)):
        h = hints[i] - (hints[i] @ tangent[i]) * tangent[i]
        strength = float(np.linalg.norm(h))
        if previous is None:
            n = h / max(strength, 1e-9) if strength > 0.2 else unit(np.cross(tangent[i], np.array([1.0, 0.0, 0.0])))
        else:
            transported = previous - (previous @ tangent[i]) * tangent[i]
            transported = transported / max(float(np.linalg.norm(transported)), 1e-9)
            blend = float(smoothstep(0.15, 0.45, strength))
            n = unit((1.0 - blend) * transported + blend * (h / max(strength, 1e-9)))
            if n @ transported < 0.0:
                n = -n
        normals[i] = n
        previous = n
    if lock.twist_deg:
        s = arc_lengths(points) / max(arc_lengths(points)[-1], 1e-9)
        normals = rotate(normals, tangent, np.radians(lock.twist_deg) * s)
    binormals = unit(np.cross(tangent, normals))
    return tangent, normals, binormals


@dataclass
class SweptLock:
    positions: np.ndarray
    triangles: np.ndarray
    t: np.ndarray  # 정점의 길이 비율(뿌리 0 → 끝 1)
    s: np.ndarray  # 정점의 뿌리에서 거리(m)
    lateral: np.ndarray  # 가닥 폭 방향 위치 0(왼쪽 가장자리) … 1(오른쪽) — UV0 U
    outer: np.ndarray  # +1 바깥 면 … −1 안쪽 면 — 툰 법선 섞기·AO
    shade: np.ndarray  # 단면 모양 AO(안쪽 면·가장자리·띠 경계선이 어둡다)
    env: np.ndarray  # 정점의 헤어 덩어리 바깥 방향(머리 중심·세로축·꼬리 축에서 바깥, 접선에 투영하지 않은 값) — 툰 음영 법선
    count: int  # 가이드 표본 수(형태 변형이 같은 위상을 쓰도록)


def lock_point_count(lock: Lock, level: int) -> int:
    length = lock.length()
    return int(np.clip(round(length / LOD_SPACING_M[level]) + 1, 4, 64))


def sweep_lock(frame: HeadFrame, lock: Lock, level: int, count: int | None = None) -> SweptLock:
    """가닥 하나를 납작한 타원 단면으로 쓴다. 뿌리는 부채꼴 마개, 끝은 한 점(point) 또는 마개(blunt)로 닫는다."""
    count = lock_point_count(lock, level) if count is None else count
    points = adaptive_resample(lock.points, count)
    tangent, normals, binormals = lock_frames(frame, lock, points)
    s = arc_lengths(points)
    length = float(s[-1])
    t = s / max(length, 1e-9)
    wide, narrow = LOD_SIDES[level]
    sides = wide if lock.width >= 0.018 else narrow
    width_scale, thick_scale = width_profile(lock, s, length)
    half_w = 0.5 * lock.width * width_scale
    half_t = 0.5 * lock.thickness * thick_scale
    ring_count = count - 1 if lock.tip == "point" else count
    alphas = np.linspace(0.0, 2.0 * math.pi, sides, endpoint=False) + (math.pi / sides if sides % 2 == 0 else 0.0)
    rings = [points[i] + np.outer(np.cos(alphas) * half_w[i], binormals[i]) + np.outer(np.sin(alphas) * half_t[i], normals[i]) for i in range(ring_count)]
    positions = np.vstack(rings)
    env_rings = lock_hints(frame, lock, points)
    vt = np.repeat(t[:ring_count], sides)
    vs = np.repeat(s[:ring_count], sides)
    va = np.tile(alphas, ring_count)
    ve = np.repeat(env_rings[:ring_count], sides, axis=0)
    triangles = []
    for i in range(ring_count - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            c, d = a + sides, b + sides
            triangles += [[a, c, b], [b, c, d]]
    root_center = points[0] - tangent[0] * 0.25 * float(half_t[0])
    root_index = len(positions)
    positions = np.vstack([positions, root_center])
    vt, vs, va = np.append(vt, 0.0), np.append(vs, 0.0), np.append(va, -math.pi / 2)
    ve = np.vstack([ve, env_rings[0]])
    for k in range(sides):
        triangles.append([root_index, k, (k + 1) % sides])
    last = (ring_count - 1) * sides
    tip_point = points[-1] if lock.tip == "point" else points[-1] + tangent[-1] * 0.35 * float(half_t[-1])
    tip_index = len(positions)
    positions = np.vstack([positions, tip_point])
    vt, vs, va = np.append(vt, 1.0), np.append(vs, length), np.append(va, math.pi / 2)
    ve = np.vstack([ve, env_rings[-1]])
    for k in range(sides):
        triangles.append([tip_index, last + (k + 1) % sides, last + k])
    triangles = np.asarray(triangles, dtype=np.int64)
    if gf.mesh_signed_volume(positions, triangles) < 0.0:
        triangles = triangles[:, [0, 2, 1]]
    shade = (1.0 - 0.14 * np.clip(-np.sin(va), 0.0, 1.0)) * (1.0 - 0.10 * np.abs(np.cos(va)) ** 3)
    return SweptLock(positions=positions, triangles=triangles, t=vt, s=vs, lateral=0.5 + 0.5 * np.cos(va), outer=np.sin(va), shade=shade, env=ve, count=count)


#: 띠 단면의 가로 표본 수(LOD별): 왼쪽 경계 … 오른쪽 경계
STRIP_COLUMNS = (6, 4, 2)
#: 띠 경계가 이웃보다 살짝 넘어가 겹치는 폭(m) — 형태 변형·표본 차이로 생길 수 있는 머리카락 굵기 틈을 막는다
STRIP_OVERLAP_M = 0.0010


def strip_ring_lengths(length: float, spacing: float, count: int | None) -> np.ndarray:
    """띠 가닥의 고리 위치(뿌리에서 거리): 그룹 공통 간격으로 놓아 이웃과 같은 거리에서 경계를 잰다. 마지막 고리는 끝."""
    if count is None:
        count = max(5, int(math.ceil(length / spacing)) + 1)
    rings = np.minimum(np.arange(count) * spacing, length)
    rings[-1] = length
    # 끝 쪽 고리가 끝에 겹치면 남은 길이에 고르게 편다
    crowded = rings >= length - 1e-6
    crowded[-1] = False
    if crowded.any():
        first = int(np.argmax(crowded))
        rings[first:] = np.linspace(rings[first - 1] if first > 0 else 0.0, length, count - first + 1)[1:]
    return rings


def sweep_strip_group(frame: HeadFrame, locks: list[Lock], spec: dict[str, Any], level: int, counts: list[int] | None = None) -> list[SweptLock]:
    """띠 그룹: 이웃 가닥과 경계(같은 거리의 두 가이드 중점·평균 법선·평균 두께)를 공유하는 판 조각들.

    경계에서는 두 조각의 바깥 면이 같은 곡선 위에서 만나 한 껍질이 되고(관끼리 겹치면 표면이 번갈아 뚫고 나와 벽돌 무늬가 된다), 두 가이드가 벌어지는 곳
    (거리 > 두 폭 평균의 `diverge`배) 또는 어느 한쪽이 끝(`split_len`)에 들어서는 곳부터 경계가 각자의 자유 가장자리로 풀려 뾰족한 손가락이 된다.
    이웃 짝은 `pairing`(뿌리 거리 + 길이 차가 작으면 끝끼리 맞춤)으로 정한다. 조각마다 닫힌 메시(뿌리 부채꼴 마개 + 끝 한 점 또는 일자 마개)다."""
    J = len(locks)
    spacing = LOD_SPACING_M[level] * float(spec.get("spacing", 1.0))
    columns = int(spec.get("columns", STRIP_COLUMNS)[level])
    fs = np.linspace(-1.0, 1.0, columns)
    edge, bulge, closed = float(spec.get("edge", 0.62)), float(spec.get("bulge", 0.18)), bool(spec.get("closed", False))
    rings = [strip_ring_lengths(lock.length(), spacing, None if counts is None else counts[j]) for j, lock in enumerate(locks)]
    full = [arc_lengths(lock.points) for lock in locks]

    def sample(j: int, s: np.ndarray) -> np.ndarray:
        return np.stack([np.interp(s, full[j], locks[j].points[:, k]) for k in range(3)], axis=1)

    def frames_at(j: int, s: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        pts = sample(j, s)
        _, normal, binormal = lock_frames(frame, locks[j], pts)
        env = lock_hints(frame, locks[j], pts)
        width, thick = width_profile(locks[j], s, float(full[j][-1]))
        return pts, normal, binormal, env, locks[j].thickness * thick

    neighbours: dict[int, tuple[int | None, int | None]] = {}
    for j in range(J):
        left = j - 1 if j > 0 else (J - 1 if closed and J > 2 else None)
        right = j + 1 if j < J - 1 else (0 if closed and J > 2 else None)
        neighbours[j] = (left, right)

    pairs: dict[tuple[int, int], dict[str, Any]] = {}

    def pairing(j: int, k: int) -> dict[str, Any]:
        """이웃 쌍(j, k)의 대응과 경계 공유 비율. 짧은 가닥 a의 뿌리 거리 σ에 긴 가닥 b의 거리 s_b(σ) = σ + ΔL·w(σ/L_a)를 짝짓는다:
        길이 차 ΔL이 짧은 쪽의 25 % 미만이면(앞머리끼리·뒷머리끼리) 끝 쪽에서 끝끼리 맞추고(w: 0.35→0.9에서 0→1), 아니면 뿌리 거리 그대로 짝짓는다.
        뿌리 거리로만 짝지으면 길이가 1~2 cm 다른 이웃 앞머리가 같은 거리에서 높이가 1 cm 넘게 어긋나, 긴 쪽이 끝보다 한참 위에서 풀려
        머리선 근처에 마름모 구멍이 생긴다(2026-10-23 실측). 풀림은 끝 갈래(`split_len`) 앞 `release`(갈래 길이의 절반, 0.5~1.5 cm)에 걸쳐 일어나고,
        둘 다 일자 끝이면 짧은 쪽 끝까지 붙어 있다(히메컷 끝선). 결과는 σ 격자 위 값이라 두 조각이 같은 경계 곡선을 쓴다(대칭)."""
        key = (min(j, k), max(j, k))
        if key in pairs:
            return pairs[key]
        a, b = (j, k) if full[j][-1] <= full[k][-1] else (k, j)
        la, lb = float(full[a][-1]), float(full[b][-1])
        dl = lb - la
        align = dl < 0.25 * la
        sigma = np.linspace(0.0, la, 600)
        sb = sigma + (dl * smoothstep(0.35, 0.9, sigma / max(la, 1e-9)) if align else 0.0)
        if locks[a].tip == "blunt" and locks[b].tip == "blunt":
            share = np.ones_like(sigma)
        else:
            distance = np.linalg.norm(sample(a, sigma) - sample(b, sb), axis=1)
            limit = float(spec.get("diverge", 0.8)) * 0.5 * (locks[a].width + locks[b].width)
            apart = np.flatnonzero(distance > limit)
            sigma_d = float(sigma[apart[0]]) if len(apart) else la
            sigma_d = min(sigma_d, la - locks[a].split_len, float(np.interp(lb - locks[b].split_len, sb, sigma)))
            release = float(np.clip(0.5 * min(locks[a].split_len, locks[b].split_len), 0.005, 0.015))
            share = smoothstep(sigma_d, sigma_d - release, sigma)
        pairs[key] = {"a": a, "b": b, "sigma": sigma, "sb": sb, "share": share}
        return pairs[key]

    def neighbour_at(j: int, k: int, s: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """조각 j의 고리 거리 s에서 (이웃 k의 짝 거리, 경계 공유 비율). 짝 범위를 벗어난 고리는 공유 0."""
        pair = pairing(j, k)
        sigma, sb, share = pair["sigma"], pair["sb"], pair["share"]
        if j == pair["a"]:
            beyond = s > sigma[-1] + 1e-9
            sig = np.minimum(s, sigma[-1])
            s_other = np.interp(sig, sigma, sb)
        else:
            beyond = s > sb[-1] + 1e-9
            sig = np.interp(np.minimum(s, sb[-1]), sb, sigma)
            s_other = sig
        a = np.where(beyond, 0.0, np.interp(sig, sigma, share))
        return s_other, a

    out: list[SweptLock] = []
    for j, lock in enumerate(locks):
        s = rings[j]
        length = float(full[j][-1])
        count = len(s)
        G, Nn, Bn, E, TH = frames_at(j, s)
        free_half = 0.5 * lock.width * width_profile(lock, s, length)[0]
        tops, bottoms, laterals, envs, shades = [], [], [], [], []
        side_data = {}
        # 이웃이 이 조각의 옆 방향(Bn)으로 어느 쪽에 있는지는 고리 순서가 아니라 실제 위치로 정한다. 순서로 정하면 바퀴살 방향에 따라 이웃이 반대쪽에
        # 있을 때 경계가 풀린 끝에서 자유 가장자리가 반대편으로 넘어가 조각이 나비넥타이처럼 꼬이고 머리선에 구멍이 난다(2026-10-23 실측).
        candidates = []
        for default_sign, other in ((-1, neighbours[j][0]), (1, neighbours[j][1])):
            if other is None:
                continue
            so, share = neighbour_at(j, other, s)
            Go, No, _, Eo, THo = frames_at(other, np.minimum(so, float(full[other][-1])))
            proj = np.einsum("ij,ij->i", Go - G, Bn)
            held = share > 0.5
            side = int(np.sign(np.median(proj[held] if held.any() else proj))) or default_sign
            candidates.append([side, default_sign, share, Go, No, Eo, THo])
        if len(candidates) == 2 and candidates[0][0] == candidates[1][0]:
            for candidate in candidates:
                candidate[0] = candidate[1]
        for sign in (-1, 1):
            free_point = G + sign * Bn * free_half[:, None]
            match = [candidate for candidate in candidates if candidate[0] == sign]
            if not match:
                side_data[sign] = (free_point, Nn, E, edge * TH, np.zeros(count))
                continue
            _, _, share, Go, No, Eo, THo = match[0]
            a = share[:, None]
            # 두 가이드의 중점은 곡면(머리·꼬리 다발)의 현(弦) 위라 바깥 면보다 처진다(5 cm 간격·반지름 8 cm에서 약 4 mm → 경계가 두피로 파고들어 틈).
            # 두 바깥 방향 사이 각 θn과 거리 d로 원호의 처짐(sagitta ≈ d/2·tan(θn/4))만큼 평균 바깥 방향으로 되돌린다.
            chord = np.linalg.norm(G - Go, axis=1)
            turn = np.arccos(np.clip(np.einsum("ij,ij->i", E, Eo), -1.0, 1.0))
            sagitta = 0.5 * chord * np.tan(0.25 * turn)
            mid = 0.5 * (G + Go) + unit(E + Eo) * sagitta[:, None] + sign * Bn * STRIP_OVERLAP_M
            point = a * mid + (1.0 - a) * free_point
            normal = unit(a * unit(Nn + No) + (1.0 - a) * Nn)
            envelope = unit(a * unit(E + Eo) + (1.0 - a) * E)
            thick = a[:, 0] * (edge * 0.5 * (TH + THo)) + (1.0 - a[:, 0]) * (edge * TH)
            side_data[sign] = (point, normal, envelope, thick, a[:, 0])
        for f in fs:
            sign = 1 if f > 0 else -1
            w = abs(f)
            bp, bn, be, bt, _ = side_data[sign]
            position = G + (bp - G) * w
            normal = unit((1.0 - w) * Nn + w * bn)
            envelope = unit((1.0 - w) * E + w * be)
            thickness = (1.0 - w) * TH + w * bt
            bump = bulge * TH * (1.0 - w * w)
            tops.append(position + normal * (0.5 * thickness + bump)[:, None])
            bottoms.append(position - normal * (0.5 * thickness)[:, None])
            laterals.append(np.full(count, 0.5 * (f + 1.0)))
            envs.append(envelope)
            shades.append(np.full(count, 1.0 - 0.22 * w**3))
        ring_vertices = np.concatenate([np.stack(tops, axis=1), np.stack(bottoms[::-1], axis=1)], axis=1)
        lateral = np.concatenate([np.stack(laterals, axis=1), np.stack(laterals[::-1], axis=1)], axis=1)
        envelope = np.concatenate([np.stack(envs, axis=1), np.stack(envs[::-1], axis=1)], axis=1)
        outer = np.concatenate([np.ones((count, columns)), -np.ones((count, columns))], axis=1)
        shade = np.concatenate([np.stack(shades, axis=1), np.full((count, columns), 0.84)], axis=1)
        sides = 2 * columns
        blunt = lock.tip == "blunt"
        # 뾰족한 끝은 마지막 고리 대신 끝점 하나로 모으고, 일자 끝은 마지막 고리까지 두고 얇은 마개로 닫는다(끝점으로 모으면 고리 간격만큼의 톱니가 생긴다)
        ring_count = count if blunt else count - 1
        positions = ring_vertices[:ring_count].reshape(-1, 3)
        triangles = []
        for i in range(ring_count - 1):
            for k in range(sides):
                a0, b0 = i * sides + k, i * sides + (k + 1) % sides
                c0, d0 = a0 + sides, b0 + sides
                triangles += [[a0, c0, b0], [b0, c0, d0]]
        tangent0 = unit(G[1] - G[0])
        tangent1 = unit(G[-1] - G[-2])
        root_index = len(positions)
        tip_index = root_index + 1
        tip_point = ring_vertices[ring_count - 1].mean(axis=0) + tangent1 * 0.2 * float(TH[-1]) if blunt else G[-1]
        positions = np.vstack([positions, G[0] - tangent0 * 0.25 * float(TH[0]), tip_point])
        for k in range(sides):
            triangles.append([root_index, k, (k + 1) % sides])
        last = (ring_count - 1) * sides
        for k in range(sides):
            triangles.append([tip_index, last + (k + 1) % sides, last + k])
        triangles = np.asarray(triangles, dtype=np.int64)
        if gf.mesh_signed_volume(positions, triangles) < 0.0:
            triangles = triangles[:, [0, 2, 1]]
        out.append(
            SweptLock(
                positions=positions,
                triangles=triangles,
                t=np.concatenate([np.repeat(s[:ring_count] / max(length, 1e-9), sides), [0.0, 1.0]]),
                s=np.concatenate([np.repeat(s[:ring_count], sides), [0.0, length]]),
                lateral=np.concatenate([lateral[:ring_count].reshape(-1), [0.5, 0.5]]),
                outer=np.concatenate([outer[:ring_count].reshape(-1), [-1.0, 1.0]]),
                shade=np.concatenate([shade[:ring_count].reshape(-1), [0.84, 1.0]]),
                env=np.vstack([envelope[:ring_count].reshape(-1, 3), E[0], E[-1]]),
                count=count,
            )
        )
    return out


def tie_mesh(tie: Tie, level: int) -> tuple[np.ndarray, np.ndarray]:
    """머리끈: 축 둘레 토러스(단면은 축 방향으로 길다)."""
    segments = (16, 12, 8)[level]
    sides = (6, 5, 4)[level]
    axis = unit(tie.axis)
    helper = np.array([0.0, 1.0, 0.0]) if abs(axis[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = unit(np.cross(axis, helper))
    v = np.cross(axis, u)
    positions = []
    for i in range(segments):
        a = 2.0 * math.pi * i / segments
        radial = math.cos(a) * u + math.sin(a) * v
        for k in range(sides):
            b = 2.0 * math.pi * k / sides
            positions.append(tie.center + radial * (tie.radius + tie.tube * math.cos(b)) + axis * (tie.tube * 1.4 * math.sin(b)))
    triangles = []
    for i in range(segments):
        j = (i + 1) % segments
        for k in range(sides):
            nk = (k + 1) % sides
            a, b, c, d = i * sides + k, i * sides + nk, j * sides + k, j * sides + nk
            triangles += [[a, b, d], [a, d, c]]
    positions = np.asarray(positions, dtype=np.float64)
    triangles = np.asarray(triangles, dtype=np.int64)
    if gf.mesh_signed_volume(positions, triangles) < 0.0:
        triangles = triangles[:, [0, 2, 1]]
    return positions, triangles


# ---------------------------------------------------------------- 두피 덮개


def icosphere(level: int) -> tuple[np.ndarray, np.ndarray]:
    golden = (1.0 + math.sqrt(5.0)) / 2.0
    vertices = [(-1, golden, 0), (1, golden, 0), (-1, -golden, 0), (1, -golden, 0), (0, -1, golden), (0, 1, golden), (0, -1, -golden), (0, 1, -golden), (golden, 0, -1), (golden, 0, 1), (-golden, 0, -1), (-golden, 0, 1)]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    verts = [unit(np.array(v, dtype=np.float64)) for v in vertices]
    for _ in range(level):
        cache: dict[tuple[int, int], int] = {}
        new_faces = []

        def midpoint(a: int, b: int) -> int:
            key = (min(a, b), max(a, b))
            if key not in cache:
                verts.append(unit(verts[a] + verts[b]))
                cache[key] = len(verts) - 1
            return cache[key]

        for a, b, c in faces:
            ab, bc, ca = midpoint(a, b), midpoint(b, c), midpoint(c, a)
            new_faces += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = new_faces
    return np.array(verts), np.array(faces, dtype=np.int64)


def build_cap(frame: HeadFrame, region: Callable[[np.ndarray], np.ndarray], level: int) -> tuple[np.ndarray, np.ndarray]:
    """두피 덮개: 정이십면체 방향을 머리 표면(바깥 교차점)에 놓고 머리 법선 방향으로 `CAP_OFFSET_M` 띄운다. 머리선 안쪽 면만 남긴다."""
    dirs, faces = icosphere(LOD_CAP_LEVEL[level])
    inside = region(dirs)
    limit = getattr(region, "limit", None)
    if limit is None:
        keep = inside[faces].all(axis=1)
    else:
        # 머리선 표가 있으면 머리선에 걸친 삼각형도 남기고 바깥 꼭짓점을 같은 방위의 머리선 위로 옮긴다(삼각형을 버리면 덮개 끝이 한 변 길이(~8°)만큼
        # 들쭉날쭉 안으로 물러나 가르마·목덜미에 피부가 비친다)
        keep = inside[faces].any(axis=1)
        theta, _ = to_sph(dirs)
        theta_deg = np.degrees(theta)
        moved = sph(theta_deg, limit(theta_deg))
        dirs = np.where(inside[:, None], dirs, moved)
    faces = faces[keep]
    used = np.unique(faces)
    remap = np.full(len(dirs), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    dirs = dirs[used]
    faces = remap[faces]
    # 옮긴 꼭짓점 때문에 넓이가 거의 0인 삼각형은 버린다
    area = np.linalg.norm(np.cross(dirs[faces[:, 1]] - dirs[faces[:, 0]], dirs[faces[:, 2]] - dirs[faces[:, 0]]), axis=1)
    faces = faces[area > 1e-7]
    reach = 0.35
    hits, tri = frame.head.ray(frame.center + dirs * reach, -dirs, reach)
    surface_points = np.where((tri >= 0)[:, None], hits, frame.scalp(dirs, 0.0, "skull"))
    closest = frame.head.closest(surface_points)
    normal = unit(closest.interpolate(frame.head.triangles, frame.head_field))
    positions = closest.point + normal * CAP_OFFSET_M
    # 평평한 삼각형이 곡면 머리를 파고들지 않게: 무게중심·변 중점이 표면에 가까우면 그 꼭짓점을 조금 더 띄운다
    for _ in range(6):
        probes = np.vstack([positions[faces].mean(axis=1), 0.5 * (positions[faces[:, 0]] + positions[faces[:, 1]]), 0.5 * (positions[faces[:, 1]] + positions[faces[:, 2]]), 0.5 * (positions[faces[:, 2]] + positions[faces[:, 0]])])
        owners = np.vstack([faces, faces, faces, faces])
        d, _, _ = gf.signed_distance(probes, frame.collision, frame.collision_field)
        bad = d < 0.6 * CAP_OFFSET_M
        if not bad.any():
            break
        lift = np.zeros(len(positions))
        np.maximum.at(lift, owners[bad].ravel(), np.repeat(0.6 * CAP_OFFSET_M - d[bad] + 0.0002, 3))
        positions = positions + normal * lift[:, None]
    fn = np.cross(positions[faces[:, 1]] - positions[faces[:, 0]], positions[faces[:, 2]] - positions[faces[:, 0]])
    outward = np.einsum("ij,ij->i", fn, positions[faces].mean(axis=1) - frame.center) >= 0.0
    faces[~outward] = faces[~outward][:, [0, 2, 1]]
    return positions, faces


def table_hairline(table: list[tuple[float, float]]) -> Callable[[np.ndarray], np.ndarray]:
    """|θ|(°) → 덮개 최대 극각 φ(°) 꺾은선 표로 머리선 영역을 만든다."""
    xs = np.array([row[0] for row in table], dtype=np.float64)
    ys = np.array([row[1] for row in table], dtype=np.float64)

    def limit(theta_deg: np.ndarray) -> np.ndarray:
        """방위 θ(°)의 덮개 최대 극각(°)."""
        theta_deg = np.asarray(theta_deg, dtype=np.float64) % 360.0
        signed = np.where(theta_deg > 180.0, theta_deg - 360.0, theta_deg)
        return np.interp(np.abs(signed), xs, ys)

    def region(directions: np.ndarray) -> np.ndarray:
        theta, phi = to_sph(directions)
        return np.degrees(phi) <= limit(np.degrees(theta))

    region.limit = limit  # type: ignore[attr-defined]
    return region


# ---------------------------------------------------------------- 스킨·morph


def chain_skin(frame: HeadFrame, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """헤어 정점 스킨: 턱 위는 머리 본, 아래로 늘어진 곳은 목→척추 사슬(높이 보간) + 어깨 위 어깨 본. (joints, weights, 머리 가중치)."""
    names = frame.joint_names
    head = names.index("mixamorig:Head")
    chain = [names.index(n) for n in ("mixamorig:Neck", "mixamorig:Spine2", "mixamorig:Spine1", "mixamorig:Spine")]
    chain_y = np.array([frame.joint_tpose[j][1] for j in chain])
    shoulders = {1.0: names.index("mixamorig:LeftShoulder"), -1.0: names.index("mixamorig:RightShoulder")}
    y = points[:, 1]
    y_hi = frame.marks["chin_y"] + 0.012
    y_lo = frame.marks["shoulder_y"] - SKIN_HEAD_BELOW_SHOULDER_M
    w_head = smoothstep(y_lo, y_hi, y)
    distance = np.linalg.norm(points - frame.center, axis=1)
    w_head = np.where(y > y_lo, np.maximum(w_head, smoothstep(0.105, 0.09, distance)), w_head)
    rest = 1.0 - w_head
    count = len(points)
    dense: dict[int, np.ndarray] = {head: w_head.copy()}
    order = np.argsort(-chain_y)
    cy = chain_y[order]
    cj = [chain[i] for i in order]
    for joint in cj:
        dense.setdefault(joint, np.zeros(count))
    pos = np.clip(y, cy[-1], cy[0])
    for k in range(len(cy) - 1):
        upper, lower = cy[k], cy[k + 1]
        inside = (pos <= upper) & (pos >= lower) if k == len(cy) - 2 else (pos <= upper) & (pos > lower)
        frac = np.where(inside, (pos - lower) / max(upper - lower, 1e-9), 0.0)
        dense[cj[k]] += np.where(inside, rest * frac, 0.0)
        dense[cj[k + 1]] += np.where(inside, rest * (1.0 - frac), 0.0)
    dense[cj[0]] += np.where(y > cy[0], rest, 0.0)
    side = np.sign(points[:, 0])
    band = smoothstep(frame.marks["shoulder_y"] - 0.10, frame.marks["shoulder_y"] - 0.04, y) * smoothstep(frame.marks["shoulder_y"] + 0.05, frame.marks["shoulder_y"] + 0.01, y)
    share = 0.35 * smoothstep(0.075, 0.11, np.abs(points[:, 0])) * band
    for sign, joint in shoulders.items():
        mask = side == sign
        moved = np.zeros(count)
        for j in cj:
            take = dense[j] * share * mask
            dense[j] = dense[j] - take
            moved += take
        dense[joint] = dense.get(joint, np.zeros(count)) + moved
    joints_list = sorted(dense)
    matrix = np.stack([dense[j] for j in joints_list], axis=1)
    order4 = np.argsort(-matrix, axis=1, kind="stable")[:, :4]
    weights = np.take_along_axis(matrix, order4, axis=1)
    weights = np.where(weights > 1e-4, weights, 0.0)
    weights /= np.maximum(weights.sum(axis=1, keepdims=True), 1e-12)
    joints = np.array(joints_list, dtype=np.int64)[order4]
    joints = np.where(weights > 0.0, joints, 0)
    return joints, weights, w_head


def head_bound_skin(frame: HeadFrame, points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """머리 표면 최근접점의 스킨(덮개용): 세 꼭짓점 가중치를 무게중심으로 섞어 상위 4개, 턱 본은 머리 본으로 합친다."""
    hits = frame.head.closest(points)
    binding = gf.Binding(hits.triangle, hits.bary, np.zeros(len(points)), np.zeros((len(points), 2)))
    joints, weights = gf.transfer_skin(binding, frame.head.triangles, frame.head_joints, frame.head_weights)
    jaw = frame.joint_names.index("TS_Jaw")
    head = frame.joint_names.index("mixamorig:Head")
    joints = np.where(joints == jaw, head, joints)
    merged_j = np.zeros_like(joints)
    merged_w = np.zeros_like(weights)
    for row in range(len(joints)):
        acc: dict[int, float] = {}
        for j, w in zip(joints[row].tolist(), weights[row].tolist(), strict=True):
            if w > 0.0:
                acc[j] = acc.get(j, 0.0) + w
        ranked = sorted(acc.items(), key=lambda item: -item[1])[:4]
        total = sum(w for _, w in ranked) or 1.0
        for slot, (j, w) in enumerate(ranked):
            merged_j[row, slot] = j
            merged_w[row, slot] = w / total
    return merged_j, merged_w


def hair_deltas(frame: HeadFrame, points: np.ndarray, w_head: np.ndarray) -> dict[str, np.ndarray]:
    """morph 델타: 머리 몫 = 최근접 머리 표면 델타 + (닮음 배율 − 1)·오프셋, 몸 몫 = 최근접 몸 표면 델타. 머리 본 가중치로 섞는다."""
    hits_h = frame.head.closest(points)
    offset = points - hits_h.point
    need_body = w_head < 1.0 - 1e-6
    body_hits = frame.body.closest(points[need_body]) if need_body.any() else None
    out: dict[str, np.ndarray] = {}
    for name in HAIR_MORPHS:
        head_part = hits_h.interpolate(frame.head.triangles, frame.head_deltas[name]) + (frame.head_scale[name] - 1.0) * offset
        delta = head_part * w_head[:, None]
        if body_hits is not None:
            body_part = body_hits.interpolate(frame.body.triangles, frame.body_deltas[name])
            delta[need_body] += body_part * (1.0 - w_head[need_body])[:, None]
        out[name] = delta
    return out


# ---------------------------------------------------------------- 텍스처(UV 램프)


def ramp_value(v: np.ndarray) -> np.ndarray:
    """V → 회색 값: 뿌리 구간(0~0.30) 0.80→0.91(뿌리 가까이만 어둡다), 밴드 구간(0.30~0.42) 텍스처가 덧칠, 아래 구간(0.42~1) 0.91→0.97."""
    v = np.asarray(v, dtype=np.float64)
    upper = 0.80 + 0.11 * smoothstep(0.0, 0.12, v)
    lower = 0.91 + 0.06 * smoothstep(BAND_V[1], 1.0, v)
    k = smoothstep(BAND_V[0], BAND_V[1], v)
    return (1.0 - k) * upper + k * lower


def hair_texture(size: int = TEXTURE_SIZE, quality: int = 92, seed: int = 7) -> tuple[bytes, dict[str, Any]]:
    """헤어 상대색 램프 텍스처(회색 JPEG). 행 = V(위 0 = 뿌리), 열 = 지그재그 위상이 다른 4종."""
    from PIL import Image

    rng = Prng(seed)
    v = (np.arange(size) + 0.5) / size
    column_width = size // TEXTURE_COLUMNS
    image = np.zeros((size, size), dtype=np.float64)
    knots = np.array([rng.next() for _ in range(size // 3 + 4)])
    xs = np.arange(size) / 3.0
    i0 = np.floor(xs).astype(int)
    frac = xs - i0
    frac = frac * frac * (3.0 - 2.0 * frac)
    strand = knots[i0] * (1.0 - frac) + knots[i0 + 1] * frac
    band_center = 0.5 * (BAND_V[0] + BAND_V[1])
    band_half = 0.5 * (BAND_V[1] - BAND_V[0])
    for column in range(TEXTURE_COLUMNS):
        x0, x1 = column * column_width, (column + 1) * column_width
        local_u = (np.arange(x0, x1) - x0 + 0.5) / column_width
        value = ramp_value(v)[:, None] * np.ones((1, x1 - x0))
        lines = 1.0 - 0.045 * (strand[x0:x1][None, :] - 0.5) * smoothstep(0.03, 0.2, v)[:, None]
        value = value * lines
        teeth = 2.0 + column % 2
        phase = 0.25 * column
        zig = 0.35 * band_half * (np.abs(((local_u * teeth + phase) % 1.0) - 0.5) * 4.0 - 1.0)
        dist = np.abs(v[:, None] - (band_center + zig[None, :])) / (0.62 * band_half)
        band = smoothstep(1.0, 0.55, dist)
        value = value + (1.0 - value) * 0.96 * band
        image[:, x0:x1] = value
    mean = float(image.mean())
    if mean < TEXTURE_MIN_MEAN:
        image = 1.0 - (1.0 - image) * ((1.0 - TEXTURE_MIN_MEAN) / max(1.0 - mean, 1e-6))
    gray = np.clip(image * 255.0 + 0.5, 0, 255).astype(np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(np.stack([gray, gray, gray], axis=-1), mode="RGB").save(buffer, format="JPEG", quality=quality, subsampling=0, optimize=True)
    data = buffer.getvalue()
    return data, {"bytes": len(data), "size": size, "meanLuminance": round(float(gray.mean()) / 255.0, 4), "minLuminance": round(float(gray.min()) / 255.0, 4), "columns": TEXTURE_COLUMNS}


def band_distance(lock: Lock) -> float | None:
    """뿌리에서 처음 `band_y` 아래로 내려가는 곳까지의 거리(m). 뿌리가 이미 아래거나 끝까지 위면 None."""
    if lock.band_y is None:
        return None
    p = lock.points
    if p[0, 1] <= lock.band_y:
        return None
    below = np.flatnonzero(p[:, 1] <= lock.band_y)
    if not len(below):
        return None
    i = int(below[0])
    s = arc_lengths(p)
    y0, y1 = p[i - 1, 1], p[i, 1]
    f = (y0 - lock.band_y) / max(y0 - y1, 1e-9)
    return float(s[i - 1] + f * (s[i] - s[i - 1]))


def lock_v(lock: Lock, s: np.ndarray, band_s: float | None) -> np.ndarray:
    """UV0 V(밝기 램프 좌표): 밴드가 가닥이 고리 높이를 지나는 곳에 오도록 구간별로 다시 매긴다."""
    length = max(lock.length(), 1e-6)
    t = np.clip(s / length, 0.0, 1.0)
    if lock.layer > 0:
        return 0.04 + 0.22 * t
    if band_s is None:
        if lock.points[0, 1] <= (lock.band_y if lock.band_y is not None else -np.inf):
            return BAND_V[1] + 0.03 + (0.99 - BAND_V[1] - 0.03) * t
        return 0.02 + (BAND_V[0] - 0.04) * t
    a = max(band_s - BAND_HALF_M, 0.004)
    b = min(band_s + BAND_HALF_M, length - 0.002)
    if b <= a + 1e-4:
        return 0.02 + (BAND_V[0] - 0.04) * t
    return np.interp(s, [0.0, a, b, length], [0.02, BAND_V[0], BAND_V[1], 0.99])


# ---------------------------------------------------------------- LOD 조립


@dataclass
class LodMesh:
    positions: np.ndarray
    triangles: np.ndarray
    tri_zone: np.ndarray  # 삼각형 색 영역(0 hair, 1 hair-tip, 2 hair-accent)
    normals: np.ndarray
    uvs: np.ndarray
    uv1: np.ndarray  # (U 층 부호, V 흐름값)
    color: np.ndarray  # (N,4) 회색 AO
    joints: np.ndarray
    weights: np.ndarray
    deltas: dict[str, np.ndarray]
    shapes: dict[str, np.ndarray]  # `shape:<이름>:±` 델타
    groups: np.ndarray
    group_names: list[str]
    lock_counts: list[int]
    shape_normals: dict[str, np.ndarray] = field(default_factory=dict)  # `shape:*` 극값의 툰 법선 − 기본 법선


def lod_geometry(frame: HeadFrame, build: StyleBuild, level: int, counts: list[int] | None = None) -> dict[str, Any]:
    """한 LOD의 기하(정점·삼각형·UV·AO·흐름값·색 영역·법선 힌트). `counts`를 주면 가닥 표본 수를 그대로 쓴다(형태 변형용).

    띠 그룹(`Lock.strip`)은 그룹 단위로 한 번에 쓰고(`sweep_strip_group`), 나머지는 홀로 선 관(`sweep_lock`)이다. 안쪽 층(layer > 0)은 LOD2에서 뺀다."""
    positions, triangles, uvs, uv1, colors, hints, groups, zones, outer = [], [], [], [], [], [], [], [], []
    group_names: list[str] = []
    used_counts: list[int] = []
    offset = 0
    column_width = 1.0 / TEXTURE_COLUMNS
    included = [lock for lock in build.locks if not (level >= 2 and lock.layer > 0)]
    swept: dict[int, SweptLock] = {}
    order: list[int] = []
    done_strips: set[str] = set()
    for index, lock in enumerate(included):
        if lock.strip is None:
            count = None if counts is None else counts[index]
            swept[index] = sweep_lock(frame, lock, level, count)
            order.append(index)
            continue
        if lock.strip in done_strips:
            continue
        done_strips.add(lock.strip)
        members = [k for k, other in enumerate(included) if other.strip == lock.strip]
        member_counts = None if counts is None else [counts[k] for k in members]
        for k, piece in zip(members, sweep_strip_group(frame, [included[k] for k in members], build.strip_specs.get(lock.strip, {}), level, member_counts), strict=True):
            swept[k] = piece
    used_counts = [swept[k].count for k in range(len(included))]
    for index, lock in enumerate(included):
        piece = swept[index]
        column = (index * 3) % TEXTURE_COLUMNS
        u = (column + 0.12 + 0.76 * piece.lateral) * column_width
        band_s = band_distance(lock)
        v = lock_v(lock, piece.s, band_s)
        root_ao = 0.86 + 0.14 * smoothstep(0.0, 0.025, piece.s)
        ao = np.clip(lock.ao * root_ao * piece.shade, 0.35, 1.0)
        layer_code = 1.0 if lock.layer > 0 else (0.5 if lock.bridge else 0.0)
        positions.append(piece.positions)
        triangles.append(piece.triangles + offset)
        uvs.append(np.stack([u, v], axis=1))
        uv1.append(np.stack([np.full(len(piece.t), layer_code), piece.t], axis=1))
        colors.append(ao)
        hints.append(piece.env)
        outer.append(piece.outer)
        if lock.group not in group_names:
            group_names.append(lock.group)
        groups.append(np.full(len(piece.positions), group_names.index(lock.group)))
        tri_t = piece.t[piece.triangles].mean(axis=1)
        length = max(lock.length(), 1e-6)
        tip_len = float(np.clip(lock.tip_frac * length, 0.02, 0.25)) if lock.tip_frac > 0.0 else 0.0
        tip_start = 1.0 - tip_len / length if tip_len > 0.0 else 2.0
        zone = np.where(tri_t >= tip_start, 1, 0)
        if lock.accent:
            zone = np.full(len(zone), 2)
        zones.append(zone)
        offset += len(piece.positions)
    for tie in build.ties:
        p, t = tie_mesh(tie, level)
        positions.append(p)
        triangles.append(t + offset)
        uvs.append(np.tile([[0.5 * column_width, 0.02]], (len(p), 1)))
        uv1.append(np.tile([[1.0, 0.0]], (len(p), 1)))
        colors.append(np.full(len(p), 0.45))
        hints.append(vertex_normals(p, t))
        outer.append(np.zeros(len(p)))
        if "tie" not in group_names:
            group_names.append("tie")
        groups.append(np.full(len(p), group_names.index("tie")))
        zones.append(np.full(len(t), 2))
        offset += len(p)
    cap_p, cap_t = build_cap(frame, build.cap_region, level)
    cap_start = offset
    positions.append(cap_p)
    triangles.append(cap_t + offset)
    uvs.append(np.tile([[0.5 * column_width, 0.03]], (len(cap_p), 1)))
    uv1.append(np.tile([[1.0, 0.0]], (len(cap_p), 1)))
    colors.append(np.full(len(cap_p), 0.62))
    hints.append(vertex_normals(cap_p, cap_t))
    outer.append(np.zeros(len(cap_p)))
    if "cap" not in group_names:
        group_names.append("cap")
    groups.append(np.full(len(cap_p), group_names.index("cap")))
    zones.append(np.zeros(len(cap_t), dtype=np.int64))
    P = np.vstack(positions)
    T = np.vstack(triangles)
    # 최종 충돌: 충돌 표면에 너무 가까운(또는 안쪽) 정점을 민다(덮개는 build_cap이 이미 맞췄다)
    # (오목한 곳 — 어깨 위·목 옆 — 은 한 번 밀면 다른 면 안으로 들어갈 수 있어 세 번 반복한다)
    for _ in range(3):
        d, _, normal = gf.signed_distance(P[:cap_start], frame.collision, frame.collision_field)
        push = np.maximum(VERTEX_MIN_DISTANCE_M + 0.0003 - d, 0.0)
        if not (push > 0.0).any():
            break
        P[:cap_start] = P[:cap_start] + push[:, None] * normal
    return {
        "positions": P,
        "triangles": T,
        "tri_zone": np.concatenate(zones),
        "uvs": np.vstack(uvs),
        "uv1": np.vstack(uv1),
        "ao": np.concatenate(colors),
        "hints": unit(np.vstack(hints)),
        "outer": np.concatenate(outer),
        "groups": np.concatenate(groups),
        "group_names": group_names,
        "cap_start": cap_start,
        "counts": used_counts,
    }


def blended_normals(positions: np.ndarray, triangles: np.ndarray, envelope: np.ndarray, outer: np.ndarray, amount: float) -> np.ndarray:
    """툰 음영용 법선: 가닥 단면의 바깥 반쪽(sin α > 0)은 헤어 덩어리 바깥 방향(엔벨로프)을 쓰고 안쪽 반쪽은 기하 법선을 지킨다.

    가닥마다 접선이 달라 접선에 수직인 단면 법선을 쓰면 2단 툰 램프가 이웃 가닥마다 밝음·그늘로 갈려 벽돌 무늬가 된다. 엔벨로프 법선을 쓰면 헤어 전체가
    한 덩어리로 음영되고 가닥 경계는 외곽선·AO·실루엣이 맡는다. 안쪽 면까지 바깥을 보게 하면 hull 외곽선이 얇은 끝을 뚫고 나오므로 섞지 않는다."""
    geometric = vertex_normals(positions, triangles)
    k = amount * smoothstep(-0.15, 0.55, outer)
    return unit((1.0 - k)[:, None] * geometric + k[:, None] * envelope)


def assemble_lod(frame: HeadFrame, build: StyleBuild, level: int, variants: dict[str, StyleBuild] | None = None, normal_blend: float = 1.0) -> LodMesh:
    """한 LOD의 정점 배열(스윕한 가닥 + 머리끈 + 두피 덮개)과 스킨·morph·UV·AO·법선. `variants`(형태 변형 빌드)가 있으면 `shape:*` 델타를 만든다."""
    geo = lod_geometry(frame, build, level)
    P = geo["positions"]
    cap_start = geo["cap_start"]
    joints, weights, w_head = chain_skin(frame, P)
    cap_j, cap_w = head_bound_skin(frame, P[cap_start:])
    joints[cap_start:], weights[cap_start:] = cap_j, cap_w
    w_head[cap_start:] = 1.0
    deltas = hair_deltas(frame, P, w_head)
    normals = blended_normals(P, geo["triangles"], geo["hints"], geo["outer"], normal_blend)
    shapes: dict[str, np.ndarray] = {}
    shape_normals: dict[str, np.ndarray] = {}
    for name, variant in (variants or {}).items():
        other = lod_geometry(frame, variant, level, counts=geo["counts"])
        if other["positions"].shape != P.shape:
            raise ValueError(f"{build.style_id} {name}: 형태 변형의 위상이 다르다({other['positions'].shape} != {P.shape})")
        shapes[name] = other["positions"] - P
        # 극값에서 끝이 크게 돌면(길이+에서 바깥으로 튀는 끝 등) 기본 법선으로는 그늘 면이 되어 끝이 검게 보인다 → 법선 델타도 만든다
        shape_normals[name] = blended_normals(other["positions"], geo["triangles"], other["hints"], other["outer"], normal_blend) - normals
    ao = geo["ao"]
    return LodMesh(
        positions=P,
        triangles=geo["triangles"],
        tri_zone=geo["tri_zone"],
        normals=normals,
        uvs=geo["uvs"],
        uv1=geo["uv1"],
        color=np.stack([ao, ao, ao, np.ones_like(ao)], axis=1),
        joints=joints,
        weights=weights,
        deltas=deltas,
        shapes=shapes,
        groups=geo["groups"],
        group_names=geo["group_names"],
        lock_counts=geo["counts"],
        shape_normals=shape_normals,
    )


# ---------------------------------------------------------------- 스타일 빌드 진입점


def build_style(frame: HeadFrame, style_id: str, params: dict[str, float] | None = None) -> StyleBuild:
    """스타일 빌더를 돌리고 모든 가닥을 충돌 처리한다. 같은 (스타일, 베이스)는 매개변수와 무관하게 같은 PRNG 수열을 쓴다."""
    if style_id not in STYLES:
        raise KeyError(f"알 수 없는 헤어 스타일: {style_id}")
    params = dict(params or {})
    sketch = Sketch(frame, Prng(style_seed(style_id, frame.base_id)), style_id, params)
    cap_region = STYLES[style_id](sketch)
    locks = [collide_lock(frame, lock) for lock in sketch.locks]
    return StyleBuild(style_id=style_id, base_id=frame.base_id, params=params, locks=locks, ties=sketch.ties, cap_region=cap_region, band_y=sketch.band_y, strip_specs=dict(sketch.strip_specs))


def shape_variants(frame: HeadFrame, style_id: str) -> dict[str, StyleBuild]:
    """`shape:<이름>:±` 형태 변형 빌드(매개변수 ±1)."""
    out: dict[str, StyleBuild] = {}
    for key in SHAPE_KEYS[style_id]:
        for sign, value in (("+", 1.0), ("-", -1.0)):
            out[f"shape:{key}:{sign}"] = build_style(frame, style_id, {key: value})
    return out


# ---------------------------------------------------------------- GLB


def node_name(style_id: str, level: int) -> str:
    return f"TS_AuthoredHair_{style_id}_LOD{level}"


def material_name(style_id: str, zone: str = "hair") -> str:
    return {"hair": f"ts_hair_{style_id}", "hair-tip": f"ts_hair_tip_{style_id}", "hair-accent": f"ts_hair_accent_{style_id}"}[zone]


def _drop_tiny(delta: np.ndarray, floor: float = 5e-5) -> np.ndarray:
    """길이 `floor`(0.05 mm) 미만인 morph 델타를 0으로(형태 변형의 재빌드 잡음이 sparse를 막지 않게)."""
    delta = np.asarray(delta, dtype=np.float32).copy()
    delta[np.linalg.norm(delta, axis=1) < floor] = 0.0
    return delta


def quantize_normals(normals: np.ndarray) -> np.ndarray:
    """단위 법선을 정규화 BYTE(÷127)로 바꾼다. 복원 길이 오차는 1 % 미만(검증기 허용 5 %)."""
    return np.clip(np.rint(unit(np.asarray(normals, dtype=np.float64)) * 127.0), -127, 127).astype(np.int8)


def quantize_weights(weights: np.ndarray) -> np.ndarray:
    """스킨 가중치를 정규화 UNSIGNED_SHORT(÷65535)로 바꾸되 정점마다 정수 합이 정확히 65535가 되게 가장 큰 칸이 반올림 나머지를 흡수한다
    (복원 합 = 1, 계약 허용 오차 1e-3. 칸 하나의 오차 ≤ 1.5e-5). 가중치 0인 칸은 0으로 남는다."""
    w = np.clip(np.asarray(weights, dtype=np.float64), 0.0, None)
    w = w / np.maximum(w.sum(axis=1, keepdims=True), 1e-12)
    q = np.rint(w * 65535.0).astype(np.int64)
    rows = np.arange(len(q))
    top = np.argmax(w, axis=1)
    q[rows, top] += 65535 - q.sum(axis=1)
    return np.clip(q, 0, 65535).astype(np.uint16)


class CompactGlbWriter(QuantizedGlbWriter):
    """헤어용 작성기: NORMAL은 정규화 BYTE VEC3(`KHR_mesh_quantization`, 4바이트 간격), UV0·UV1은 정규화 UNSIGNED_SHORT,
    COLOR_0은 정규화 UNSIGNED_BYTE VEC3(코어 glTF 허용 형식, 알파 없음), WEIGHTS_0은 정규화 UNSIGNED_SHORT(정점마다 정수 합 65535 → 복원 합 정확히 1),
    morph는 정규화 SHORT(+sparse, 0.05 mm 미만 델타는 0으로 둬 sparse가 잘 듣게 한다)."""

    def add_byte_normals(self, normals: np.ndarray) -> int:
        q = quantize_normals(normals)
        padded = np.zeros((len(q), 4), dtype=np.int8)
        padded[:, :3] = q
        view = self.add_buffer_view(padded.tobytes(), target=34962, byte_stride=4)
        accessors = self._list("accessors")
        accessors.append({"bufferView": view, "componentType": 5120, "normalized": True, "count": int(len(q)), "type": "VEC3"})
        return len(accessors) - 1

    def add_compact_mesh(self, name: str, prims: list[dict[str, Any]], target_names: list[str]) -> int:
        mesh_prims = []
        for prim in prims:
            count = len(prim["positions"])
            weights_q = quantize_weights(prim["weights"])
            # 반올림으로 0이 된 칸의 joint 번호도 0으로(계약 V8: 가중치 0인 칸은 joint 0)
            joints = np.where(weights_q > 0, np.asarray(prim["joints"]), 0)
            attributes = {
                "POSITION": self.add_accessor(np.ascontiguousarray(prim["positions"], dtype=np.float32), target=34962, with_bounds=True),
                "NORMAL": self.add_byte_normals(prim["normals"]),
                "TEXCOORD_0": self.add_accessor(np.ascontiguousarray(np.rint(np.clip(prim["uvs"], 0.0, 1.0) * 65535.0), dtype=np.uint16), target=34962, normalized=True),
                "TEXCOORD_1": self.add_accessor(np.ascontiguousarray(np.rint(np.clip(prim["uv1"], 0.0, 1.0) * 65535.0), dtype=np.uint16), target=34962, normalized=True),
                # COLOR_0은 VEC3로 쓴다: Babylon glTF 로더는 VEC4 정점색을 보면 `hasVertexAlpha = true`로 메시를 알파 블렌드(깊이 쓰기 없음·정렬 안 됨)
                # 패스로 보내 덮개·가닥 안쪽 면이 바깥 면 위로 비친다(2026-10-23 실측: 정수리 어두운 면·벽돌 무늬의 원인). 정규화 UNSIGNED_BYTE 3개 + 4바이트 간격.
                "COLOR_0": self.add_accessor(np.ascontiguousarray(np.rint(np.clip(prim["color"][:, :3], 0.0, 1.0) * 255.0), dtype=np.uint8), target=34962, normalized=True, byte_stride=4),
                "JOINTS_0": self.add_accessor(np.ascontiguousarray(joints, dtype=np.uint8), target=34962),
                "WEIGHTS_0": self.add_accessor(weights_q, target=34962, normalized=True),
            }
            index_dtype = np.uint16 if count <= 0xFFFF else np.uint32
            entry: dict[str, Any] = {
                "attributes": attributes,
                "indices": self.add_accessor(np.asarray(prim["triangles"]).reshape(-1).astype(index_dtype), target=34963),
                "mode": 4,
                "material": prim["material"],
            }
            if target_names:
                normal_targets = prim.get("normal_targets") or {}
                entry["targets"] = []
                for target_name in target_names:  # `name`(메시·노드 이름)을 덮어쓰지 않게 다른 변수명을 쓴다
                    target = {"POSITION": self.add_morph_accessor(_drop_tiny(prim["targets"][target_name]))}
                    if normal_targets:
                        # 한 프리미티브의 morph는 모두 같은 속성 집합을 갖게 한다(법선 델타가 없는 타깃은 bufferView 없는 0 accessor — 0바이트)
                        target["NORMAL"] = self.add_morph_accessor(normal_targets.get(target_name, np.zeros((count, 3), dtype=np.float32)))
                    entry["targets"].append(target)
            mesh_prims.append(entry)
        mesh: dict[str, Any] = {"name": name, "primitives": mesh_prims}
        if target_names:
            mesh["extras"] = {"targetNames": list(target_names)}
        meshes = self._list("meshes")
        meshes.append(mesh)
        nodes = self._list("nodes")
        nodes.append({"name": name, "mesh": len(meshes) - 1, "skin": self._skin})
        self._scene_nodes.append(len(nodes) - 1)
        return len(nodes) - 1


def _primitive_arrays(lod: LodMesh, triangle_mask: np.ndarray, target_names: list[str], material: int, normal_threshold: float | None = None) -> dict[str, Any]:
    """삼각형 부분집합의 프리미티브 배열(쓰인 정점만, 번호 다시 매김). `normal_threshold`를 주면 형태 키에 법선 델타를 더하되
    길이가 그 값보다 작은 정점은 0으로 둔다(sparse — 크게 도는 끝만 싣는다)."""
    tris = lod.triangles[triangle_mask]
    used = np.unique(tris)
    remap = np.full(len(lod.positions), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    targets = {}
    normal_targets = {}
    for name in target_names:
        source = lod.deltas[name] if name in lod.deltas else lod.shapes[name]
        targets[name] = source[used].astype(np.float32)
        if normal_threshold is not None and name in lod.shape_normals:
            delta = lod.shape_normals[name][used].astype(np.float32)
            delta[np.linalg.norm(delta, axis=1) < normal_threshold] = 0.0
            if delta.any():
                normal_targets[name] = delta
    return {
        "positions": lod.positions[used],
        "normals": lod.normals[used],
        "uvs": lod.uvs[used],
        "uv1": lod.uv1[used],
        "color": lod.color[used],
        "joints": lod.joints[used],
        "weights": lod.weights[used],
        "triangles": remap[tris],
        "targets": targets,
        "normal_targets": normal_targets,
        "material": material,
    }


def write_hair_glb(path: Any, style_id: str, base: BaseModel, lods: list[LodMesh], texture_jpeg: bytes, *, zoned: bool = False, shape_lods: int = 0, shape_normal_threshold: float | None = None) -> int:
    """헤어 파츠 GLB를 쓴다. `zoned=False`(v1, 현재 계약): LOD마다 프리미티브 하나·재질 하나, morph 8개.
    `zoned=True`(v2, 제안): LOD마다 프리미티브 3개(hair, hair-tip, hair-accent)·재질 3개, 앞 `shape_lods`개 LOD에 `shape:*` morph를 더한다.
    `shape_normal_threshold`를 주면 LOD0의 형태 키에 법선 델타(그 길이 이상인 정점만)를 더한다."""
    from pathlib import Path

    writer = CompactGlbWriter(generator="toonstudio character_kit forge_hair")
    joint_names = base.joint_names
    parents = {name: (None if parent < 0 else joint_names[parent]) for name, parent in zip(joint_names, base.joint_parents, strict=True)}
    writer.add_skeleton(joint_names, parents, base.arrays["joint_tpose"].astype(np.float64))
    texture = writer.add_texture(texture_jpeg, "image/jpeg", name=f"{material_name(style_id)}_basecolor")
    zones = ZONES if zoned else ("hair",)
    materials = {zone: writer.add_material(material_name(style_id, zone), base_color_texture=texture, base_color_factor=(1.0, 1.0, 1.0, 1.0), double_sided=True, metallic=0.0, roughness=0.8) for zone in zones}
    for level, lod in enumerate(lods):
        target_names = list(HAIR_MORPHS) + (sorted(lod.shapes) if zoned and level < shape_lods else [])
        if zoned:
            threshold = shape_normal_threshold if level == 0 else None
            prims = [_primitive_arrays(lod, lod.tri_zone == index, target_names, materials[zone], threshold) for index, zone in enumerate(ZONES) if (lod.tri_zone == index).any()]
        else:
            prims = [_primitive_arrays(lod, np.ones(len(lod.triangles), dtype=bool), target_names, materials["hair"])]
        writer.add_compact_mesh(node_name(style_id, level), prims, target_names)
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    return writer.write(str(out))


# ---------------------------------------------------------------- 품질 점검


def rasterize_front(points2d: np.ndarray, triangles: np.ndarray, box: tuple[float, float, float, float], resolution: float = 0.0005) -> np.ndarray:
    """정사영(xy) 삼각형 덮임 마스크. box = (x0, x1, y0, y1)."""
    x0, x1, y0, y1 = box
    width = max(1, int(math.ceil((x1 - x0) / resolution)))
    height = max(1, int(math.ceil((y1 - y0) / resolution)))
    mask = np.zeros((height, width), dtype=bool)
    gx = x0 + (np.arange(width) + 0.5) * resolution
    gy = y0 + (np.arange(height) + 0.5) * resolution
    tri = points2d[triangles]
    lo = tri.min(axis=1)
    hi = tri.max(axis=1)
    hit = (hi[:, 0] >= x0) & (lo[:, 0] <= x1) & (hi[:, 1] >= y0) & (lo[:, 1] <= y1)
    for (ax, ay), (bx, by), (cx, cy) in tri[hit]:
        i0 = max(0, int((min(ax, bx, cx) - x0) / resolution))
        i1 = min(width - 1, int((max(ax, bx, cx) - x0) / resolution) + 1)
        j0 = max(0, int((min(ay, by, cy) - y0) / resolution))
        j1 = min(height - 1, int((max(ay, by, cy) - y0) / resolution) + 1)
        if i1 < i0 or j1 < j0:
            continue
        X, Y = np.meshgrid(gx[i0 : i1 + 1], gy[j0 : j1 + 1])
        denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(denom) < 1e-14:
            continue
        w0 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / denom
        w1 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / denom
        w2 = 1.0 - w0 - w1
        mask[j0 : j1 + 1, i0 : i1 + 1] |= (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
    return mask


def qa_metrics(frame: HeadFrame, positions: np.ndarray, triangles: np.ndarray, groups: np.ndarray | None = None, group_names: list[str] | None = None) -> dict[str, Any]:
    """관통(충돌 표면까지 부호 거리)·눈/눈썹 가림(정면 정사영, 눈 앞쪽 삼각형만)·치수."""
    d, _, _ = gf.signed_distance(positions, frame.collision, frame.collision_field)
    m = frame.marks
    eye = m["eye_center"]
    eye_box = (m["eye_inner_x"], m["eye_outer_x"], m["eye_bottom_y"], m["eye_top_y"])
    brow_box = (0.008, m["brow_outer_x"], m["brow_bottom_y"], m["brow_top_y"])
    in_front = positions[:, 2] > eye[2] - 0.005
    tri_front = in_front[triangles].all(axis=1)
    covered_eye, covered_brow = [], []
    for sign in (1.0, -1.0):
        pts = positions[:, :2] * np.array([sign, 1.0])
        covered_eye.append(float(rasterize_front(pts, triangles[tri_front], eye_box).mean()))
        covered_brow.append(float(rasterize_front(pts, triangles[tri_front], brow_box).mean()))
    hair = np.ones(len(positions), dtype=bool)
    if groups is not None and group_names is not None and "cap" in group_names:
        hair = groups != group_names.index("cap")
    p = positions[hair]
    return {
        "vertices": int(len(positions)),
        "triangles": int(len(triangles)),
        "minDistanceMm": round(float(d.min()) * 1000.0, 3),
        "verticesInside": int((d < 0.0).sum()),
        "verticesUnder0p5mm": int((d < VERTEX_MIN_DISTANCE_M).sum()),
        "eyeCoverage": [round(v, 4) for v in covered_eye],
        "browCoverage": [round(v, 4) for v in covered_brow],
        "boundsMin": [round(float(v), 4) for v in p.min(axis=0)],
        "boundsMax": [round(float(v), 4) for v in p.max(axis=0)],
        "lowestY": round(float(p[:, 1].min()), 4),
    }


# ---------------------------------------------------------------- 스타일
#
# 스타일 빌더는 `Sketch`를 받아 가닥(`s.add`, `s.hanging`, `s.bangs`, `s.tail`, `s.converge`)·머리끈(`s.ties`)을 채우고 두피 덮개 영역 함수를 돌려준다.
# 길이·높이는 랜드마크 기준(눈썹 위 `brow_top_y`, 턱 `chin_y`, 목덜미 `nape_y`, 어깨 `shoulder_y`)이라 두 베이스에 같은 코드가 맞는다.
# 형태 매개변수 `s.q(이름)`(−1…1)은 길이·높이·부피에만 곱해지고 난수 소비 순서에는 영향을 주지 않는다.


FORWARD = np.array([0.0, 0.0, 1.0])


def _under_layer(s: Sketch, origin: np.ndarray, count: int, theta_range: tuple[float, float], end_y: Callable[[float], float], curl_in: float = 0.004) -> None:
    """껍질 아래 두피 가까이(층 높이 2.6~3 mm, 두께 3.6 mm)의 안쪽 층: 끝 사이로 비치는 곳을 어둡게(AO 0.8) 메운다. 색 영역은 hair-accent(안쪽 컬러)."""
    under = s.strip("under", edge=0.7, bulge=0.1, diverge=99.0)
    lo, hi = theta_range
    for i in range(count):
        theta = lo + (hi - lo) * (i + 0.5) / count
        pts = s.hanging(theta, origin, end_y(theta), h_root=0.0026, h_drop=0.0030, flare=0.0, curl_in=curl_in, root_t=0.55)
        s.add(pts, 0.050, 0.0036, "under", layer=1, ao=0.80, taper_len=0.03, taper_power=0.7, accent=True, strip=under, split_len=0.03)


def _bang(theta: float, y_tip: float, **kw: Any) -> dict[str, Any]:
    entry = {"kind": "bang", "theta": theta, "aim": 72.0, "y_tip": y_tip, "group": "bang", "width": 0.040, "thickness": 0.0085, "taper_power": 1.05, "split_len": 0.018, "tip_frac": 0.35}
    entry.update(kw)
    return entry


def style_soft_bob(s: Sketch) -> Callable[[np.ndarray], np.ndarray]:
    """소프트 보브: 볼륨 있는 둥근 헬멧 실루엣, 턱선에서 안으로 말리는 끝(C컬), 눈썹 바로 위 굵은 끝 4개 앞머리, 관자 앞머리, 귀를 덮는 옆머리.

    정수리 뒤 가마에서 퍼지는 바퀴살 15덩어리(앞머리 4 · 관자 2 · 얼굴 테두리 2 · 옆 4 · 뒤 3)가 닫힌 띠 고리 하나로 경계를 공유한다."""
    m, male = s.m, s.male
    length, volume, curl, side_len, bangs_q = s.q("length"), s.q("volume"), s.q("curl"), s.q("sideLength"), s.q("bangs")
    end_side = m["chin_y"] + (0.040 if male else 0.020) - 0.022 * length
    end_back = m["nape_y"] - (0.004 if male else 0.010) - 0.020 * length
    h_drop = (0.0095 if male else 0.0125) * (1.0 + 0.45 * volume)
    flare = (0.003 if male else 0.004) * (1.0 + 0.8 * volume)
    curl_in = (0.007 if male else 0.009) * (1.0 + 0.6 * curl)
    curl_up = (0.002 if male else 0.003) * (1.0 + 0.6 * curl)
    whorl = sph(180.0, 22.0)
    bang_y = m["brow_top_y"] - (0.004 if male else 0.003) - 0.008 * bangs_q
    h_line = 0.013 + 0.003 * volume
    entries = [_bang(theta, bang_y + d, h_line=h_line) for theta, d in ((-33.0, 0.006), (-11.0, 0.0), (11.0, 0.003), (33.0, 0.007))]
    for sign in (1.0, -1.0):
        entries.append(_bang(sign * 50.0, m["eye_top_y"] + 0.007 - 0.004 * bangs_q, aim=80.0, h_line=h_line))
        entries.append({"kind": "hang", "theta": sign * 61.0, "aim": 100.0, "group": "side-front", "y_end": end_side + 0.004 - 0.015 * side_len, "h_drop": h_drop, "flare": 0.002, "curl_in": 0.6 * curl_in, "curl_up": 0.0, "fwd": 0.007, "width": 0.042, "thickness": 0.0092, "split_len": 0.034, "taper_power": 0.7, "accent": sign > 0, "bridge": sign > 0})
        for theta in (86.0, 112.0):
            back = theta
            entries.append({"kind": "hang", "theta": sign * theta, "aim": 105.0, "group": "side", "y_end": float(np.interp(back, [80.0, 115.0, 180.0], [end_side, 0.5 * (end_side + end_back), end_back])), "h_drop": h_drop, "flare": flare, "curl_in": curl_in, "curl_up": curl_up, "width": 0.045, "thickness": 0.0095, "split_len": 0.036, "taper_power": 0.7})
    for theta in (142.0, 180.0, 218.0):
        back = abs(((theta + 180.0) % 360.0) - 180.0)
        entries.append({"kind": "hang", "theta": theta, "aim": 110.0, "group": "back", "y_end": float(np.interp(back, [80.0, 115.0, 180.0], [end_side, 0.5 * (end_side + end_back), end_back])), "h_drop": h_drop, "flare": flare, "curl_in": curl_in, "curl_up": curl_up, "width": 0.045, "thickness": 0.0095, "split_len": 0.036, "taper_power": 0.7})
    s.ring("ring", whorl, FORWARD, entries, closed=True)
    _under_layer(s, whorl, 9, (84.0, 276.0), lambda theta: float(np.interp(abs(((theta + 180.0) % 360.0) - 180.0), [80.0, 180.0], [end_side, end_back])) + 0.018, 0.4 * curl_in)
    return table_hairline([(0.0, 58.0), (40.0, 66.0), (75.0, 98.0), (100.0, 104.0), (130.0, 122.0), (180.0, 132.0)])


def style_short_layered(s: Sketch) -> Callable[[np.ndarray], np.ndarray]:
    """숏 레이어드: 머리 모양을 따라가는 짧은 껍질(옆은 귀 윗부분을 살짝 덮고, 뒤는 길이가 번갈아 다른 다섯 갈래로 목덜미까지),
    뒤통수 둘레에 껍질 위로 얹혀 바깥으로 살짝 튀는 윗층(레이어 여섯 갈래), 오른쪽(캐릭터 기준)으로 쓸어 넘긴 사이드 앞머리."""
    m, male = s.m, s.male
    length, volume, side_len, bangs_q = s.q("length"), s.q("volume"), s.q("sideLength"), s.q("bangs")
    whorl = sph(180.0, 30.0)
    h_mid = (0.0055 if male else 0.0060) * (1.0 + 0.5 * volume)
    side_end = (m["ear_top_y"] + 0.006 if male else m["ear_top_y"] - 0.006) - 0.012 * side_len
    nape_end = m["nape_y"] - (0.006 if male else 0.012) - 0.012 * length
    bang_y = m["brow_top_y"] - 0.002 - 0.008 * bangs_q
    short = {"kind": "short", "h_root": 0.0045, "h_mid": h_mid, "h_end": 0.0040, "thickness": 0.0075, "taper_power": 0.9, "split_len": 0.024, "width": 0.042}
    entries = []
    for theta, d in ((-30.0, -0.004), (-8.0, 0.004), (16.0, 0.012)):
        entries.append(_bang(theta, bang_y + d, drift=-13.0, h_line=0.012 + 0.003 * volume, split_len=0.020, taper_power=1.1))
    entries.append(_bang(-50.0, m["eye_top_y"] + 0.008 - 0.004 * bangs_q, aim=80.0, drift=-6.0, split_len=0.016))
    entries.append(_bang(42.0, m["brow_top_y"] + 0.010, aim=78.0, split_len=0.016))
    for sign in (1.0, -1.0):
        entries.append(dict(short, theta=sign * 64.0, aim=98.0, y_end=side_end + 0.008, group="side", flick=0.002))
        entries.append(dict(short, theta=sign * 88.0, aim=104.0, y_end=side_end, group="side", flick=0.002))
        entries.append(dict(short, theta=sign * 114.0, aim=112.0, y_end=0.5 * (side_end + nape_end) + 0.006, group="side"))
    # 뒤: 길이가 번갈아 다른 다섯 갈래(목덜미 단차)
    for theta, extra in ((140.0, 0.020), (160.0, 0.004), (180.0, 0.0), (200.0, 0.004), (220.0, 0.020)):
        entries.append(dict(short, theta=theta, aim=118.0, y_end=nape_end + extra, group="back", h_end=0.0035, width=0.038, split_len=0.026))
    s.ring("ring", whorl, FORWARD, entries, closed=True)
    # 윗층: 뒤통수 둘레에 껍질 바로 위로 얹혀 끝이 바깥으로 살짝 튀는 여섯 갈래(가운데 높이 = 껍질 바깥면 + 반두께)
    layer = {"kind": "short", "h_root": 0.0105, "h_mid": 0.0150 + 0.5 * (h_mid - 0.006), "h_end": 0.0145, "flick": 0.004, "thickness": 0.0075, "taper_power": 1.1, "split_len": 0.024, "width": 0.050, "group": "layer"}
    layer_y = m["ear_top_y"] + (0.036 if male else 0.030)
    s.ring("layer", whorl, FORWARD, [dict(layer, theta=theta, aim=96.0, y_end=layer_y) for theta in (100.0, 132.0, 164.0, 196.0, 228.0, 260.0)], closed=False, open_at=0.0)
    return table_hairline([(0.0, 58.0), (40.0, 68.0), (75.0, 94.0), (100.0, 100.0), (125.0, 114.0), (180.0, 126.0)])


def style_romance_long(s: Sketch) -> Callable[[np.ndarray], np.ndarray]:
    """로맨스 롱: 가운데 가르마(정수리 가마에서 이마까지 열린 고리), 바깥으로 쓸어 넘긴 커튼 앞머리, 어깨 앞으로 내려오는 얼굴 테두리 긴 머리,
    어깨 뒤로 넘겨 등 가운데까지 내려오는 뒷머리(가운데가 조금 긴 V 끝, 아래쪽 부드러운 웨이브)."""
    m, male = s.m, s.male
    length, volume, side_len, bangs_q, wave = s.q("length"), s.q("volume"), s.q("sideLength"), s.q("bangs"), s.q("wave")
    whorl = sph(180.0, 16.0)
    back_end = (1.30 if male else 1.12) - 0.08 * length
    front_end = (1.34 if male else 1.22) - 0.07 * side_len
    h_drop = (0.009 if male else 0.011) * (1.0 + 0.45 * volume)
    amp = (0.008 if male else 0.012) * (1.0 + wave)
    entries = []
    for sign in (1.0, -1.0):
        entries.append(_bang(sign * 16.0, m["eye_top_y"] + 0.006 - 0.006 * bangs_q, aim=70.0, drift=sign * 34.0, h_line=0.013 + 0.003 * volume, split_len=0.026, taper_power=1.1, width=0.034))
        entries.append({"kind": "long", "route": "front", "theta": sign * 44.0, "aim": 96.0, "group": "front", "y_end": front_end, "h_drop": h_drop, "width": 0.042, "thickness": 0.0090, "split_len": 0.07, "taper_power": 0.9, "wave": (amp, 1.5), "wave_start": 0.40, "z_front": 0.072, "x_front": 0.088, "accent": sign > 0, "bridge": sign > 0})
        for theta, x_end in ((76.0, 0.095), (104.0, 0.090)):
            entries.append({"kind": "long", "route": "back", "theta": sign * theta, "aim": 104.0, "group": "side", "y_end": back_end + 0.03, "h_drop": h_drop, "width": 0.045, "thickness": 0.0095, "split_len": 0.08, "taper_power": 0.9, "wave": (amp, 1.5), "wave_start": 0.40, "x_end": sign * x_end})
        for theta, x_end, extra in ((132.0, 0.075, 0.018), (156.0, 0.040, 0.006)):
            entries.append({"kind": "long", "route": "back", "theta": sign * theta, "aim": 110.0, "group": "back", "y_end": back_end + extra, "h_drop": h_drop, "width": 0.045, "thickness": 0.0095, "split_len": 0.08, "taper_power": 0.9, "wave": (amp, 1.5), "wave_start": 0.40, "x_end": sign * x_end})
    entries.append({"kind": "long", "route": "back", "theta": 180.0, "aim": 112.0, "group": "back", "y_end": back_end, "h_drop": h_drop, "width": 0.045, "thickness": 0.0095, "split_len": 0.08, "taper_power": 0.9, "wave": (amp, 1.5), "wave_start": 0.40, "x_end": 0.0})
    s.ring("ring", whorl, FORWARD, entries, closed=False, open_at=0.0, columns=(5, 4, 2), spacing=1.3)
    return table_hairline([(0.0, 58.0), (40.0, 66.0), (75.0, 98.0), (100.0, 104.0), (130.0, 122.0), (180.0, 132.0)])


def style_hime_cut(s: Sketch) -> Callable[[np.ndarray], np.ndarray]:
    """히메컷: 일자로 뭉툭하게 자른 앞머리, 귀 앞에서 턱 높이로 일자로 자른 옆 직모(히메 사이드), 그 뒤로 길게 곧게 내려와 수평으로 자른 뒷머리(단차)."""
    m, male = s.m, s.male
    length, volume, side_len, bangs_q = s.q("length"), s.q("volume"), s.q("sideLength"), s.q("bangs")
    whorl = sph(180.0, 20.0)
    back_end = (1.33 if male else 1.14) - 0.08 * length
    panel_end = m["chin_y"] + 0.002 - 0.02 * side_len
    bang_y = m["brow_top_y"] - 0.002 - 0.008 * bangs_q
    h_drop = (0.0085 if male else 0.0100) * (1.0 + 0.45 * volume)
    blunt = {"tip": "blunt", "split_len": 0.0005, "taper_len": 0.004}
    entries = [_bang(theta, bang_y, h_line=0.012 + 0.003 * volume, width=0.034, **blunt) for theta in (-36.0, -18.0, 0.0, 18.0, 36.0)]
    for sign in (1.0, -1.0):
        entries.append(_bang(sign * 50.0, bang_y, aim=76.0, h_line=0.012, width=0.030, **blunt))
        for theta in (62.0, 76.0):
            entries.append({"kind": "hang", "theta": sign * theta, "aim": 100.0, "group": "panel", "y_end": panel_end, "h_drop": h_drop, "flare": 0.0, "curl_in": 0.0, "curl_up": 0.0, "fwd": 0.004, "width": 0.040, "thickness": 0.0085, "accent": sign > 0 and theta < 70.0, "bridge": sign > 0 and theta < 70.0, **blunt})
        for theta, x_end in ((98.0, 0.092), (122.0, 0.080), (146.0, 0.050)):
            entries.append({"kind": "long", "route": "back", "theta": sign * theta, "aim": 108.0, "group": "back", "y_end": back_end, "h_drop": h_drop, "width": 0.045, "thickness": 0.0090, "x_end": sign * x_end, "end_jitter": 0.0, **blunt})
    entries.append({"kind": "long", "route": "back", "theta": 180.0, "aim": 112.0, "group": "back", "y_end": back_end, "h_drop": h_drop, "width": 0.045, "thickness": 0.0090, "x_end": 0.0, "end_jitter": 0.0, **blunt})
    for entry in entries:
        entry.setdefault("end_jitter", 0.0004)
    s.ring("ring", whorl, FORWARD, entries, closed=True, columns=(5, 4, 2), spacing=1.2)
    return table_hairline([(0.0, 58.0), (40.0, 66.0), (75.0, 98.0), (100.0, 104.0), (130.0, 122.0), (180.0, 132.0)])


def style_wolf_layered(s: Sketch) -> Callable[[np.ndarray], np.ndarray]:
    """울프컷: 정수리에 볼륨 있는 짧은 윗층(바깥으로 튐), 턱선에서 바깥으로 튀는 옆머리, 목덜미를 따라 어깨까지 내려와 바깥으로 뻗는 뒷꼬리(멀릿),
    가닥이 들쭉날쭉한 앞머리."""
    m, male = s.m, s.male
    length, volume, side_len, bangs_q = s.q("length"), s.q("volume"), s.q("sideLength"), s.q("bangs")
    whorl = sph(180.0, 26.0)
    h_drop = (0.010 if male else 0.012) * (1.0 + 0.45 * volume)
    side_end = m["chin_y"] + (0.040 if male else 0.028) - 0.02 * side_len
    tail_end = m["shoulder_y"] + (0.012 if male else -0.006) - 0.05 * length
    bang_y = m["brow_top_y"] - 0.002 - 0.008 * bangs_q
    entries = []
    for theta, d, drift in ((-30.0, 0.008, -8.0), (-10.0, 0.002, -3.0), (10.0, 0.005, 3.0), (30.0, 0.010, 8.0)):
        entries.append(_bang(theta, bang_y + d, drift=drift, h_line=0.014 + 0.003 * volume, split_len=0.024, taper_power=1.2, width=0.036))
    for sign in (1.0, -1.0):
        entries.append({"kind": "hang", "theta": sign * 54.0, "aim": 98.0, "group": "side-front", "y_end": side_end + 0.012, "h_drop": h_drop, "flare": 0.002, "curl_in": 0.0, "curl_up": 0.0, "fwd": 0.004, "out_end": 0.006, "width": 0.038, "thickness": 0.0085, "split_len": 0.04, "taper_power": 1.1, "accent": sign > 0, "bridge": sign > 0})
        for theta in (80.0, 106.0):
            entries.append({"kind": "hang", "theta": sign * theta, "aim": 104.0, "group": "side", "y_end": side_end, "h_drop": h_drop, "flare": 0.003, "curl_in": 0.0, "curl_up": 0.0, "out_end": 0.012, "width": 0.042, "thickness": 0.0090, "split_len": 0.042, "taper_power": 1.1})
    for theta in (140.0, 163.0, 197.0, 220.0):
        entries.append({"kind": "hang", "theta": theta, "aim": 112.0, "group": "tail", "y_end": tail_end + (0.02 if theta in (140.0, 220.0) else 0.0), "h_drop": h_drop, "flare": -0.004, "curl_in": 0.0, "curl_up": 0.0, "out_end": 0.014, "width": 0.042, "thickness": 0.0085, "split_len": 0.05, "taper_power": 1.15})
    s.ring("ring", whorl, FORWARD, entries, closed=True)
    layer = {"kind": "short", "h_root": 0.0120, "h_mid": 0.0075 + h_drop, "h_end": 0.0065 + h_drop, "flick": 0.010, "thickness": 0.0080, "taper_power": 1.15, "split_len": 0.034, "width": 0.050, "group": "layer"}
    s.ring("layer", whorl, FORWARD, [dict(layer, theta=theta, aim=95.0, y_end=m["ear_top_y"] + (0.022 if male else 0.014)) for theta in (64.0, 92.0, 120.0, 150.0, 180.0, 210.0, 240.0, 268.0, 296.0)], closed=False, open_at=0.0)
    return table_hairline([(0.0, 58.0), (40.0, 66.0), (75.0, 98.0), (100.0, 104.0), (130.0, 122.0), (180.0, 132.0)])


def style_action_pony(s: Sketch) -> Callable[[np.ndarray], np.ndarray]:
    """액션 포니: 머리선에서 뒤 정수리 높은 묶음점으로 매끈하게 당겨진 두피 덩어리, 머리끈, 묶음에서 뒤로 솟았다가 등으로 떨어지는 굵은 꼬리,
    옆으로 쓸어 넘긴 짧은 앞머리와 귀 앞 얼굴 테두리 두 가닥."""
    m, male = s.m, s.male
    tail_len, volume, side_len, bangs_q = s.q("tail"), s.q("volume"), s.q("sideLength"), s.q("bangs")
    tie_dir = sph(180.0, 42.0)
    tie, tie_center, start_dir = pony_tie(s.frame)
    conv = {"kind": "converge", "h_root": 0.0035, "h_tie": 0.0085, "thickness": 0.0055, "split_len": 0.010, "taper_power": 1.0, "width": 0.045, "group": "scalp", "tip_frac": 0.0}
    # 뒤 머리선은 목덜미(귀 아래 끝 높이, 목덜미 1.5~2 cm 위)까지 내려와 당겨 올린다 — 더 높으면 뒤에서 귀 사이로 맨 두피 띠가 보인다
    targets = [(-36.0, 57.0), (-12.0, 55.0), (12.0, 55.0), (36.0, 57.0), (56.0, 74.0), (80.0, 98.0), (114.0, 122.0), (148.0, 136.0), (180.0, 140.0), (212.0, 136.0), (246.0, 122.0), (280.0, 98.0), (304.0, 74.0)]
    s.ring("scalp", tie_dir, FORWARD, [dict(conv, theta=theta, aim=aim) for theta, aim in targets], closed=True, columns=(5, 4, 2))
    back = np.array([0.0, 0.0, -1.0])
    s.ties.append(Tie(center=tie_center, axis=start_dir, radius=0.017, tube=0.0055))
    controls = pony_tail_controls(s.frame, tie, tail_len)
    s.tail_ring("tail", tie + back * 0.006, controls, 7, thickness=0.010, radius=(0.016, 0.027 * (1.0 + 0.2 * volume), 0.014), start_dir=start_dir, split_len=0.075, wave=(0.006, 1.0))
    bang_y = m["brow_top_y"] - 0.004 - 0.008 * bangs_q
    bang_origin = sph(0.0, 16.0)
    bangs = [_bang(theta, bang_y + d, drift=-10.0, h_root=0.011, h_line=0.016 + 0.003 * volume, h_tip=0.0065, aim=74.0, width=0.044, thickness=0.0080, split_len=0.018, taper_power=1.1) for theta, d in ((-30.0, -0.004), (-8.0, 0.002), (14.0, 0.008), (34.0, 0.016))]
    s.ring("bangs", bang_origin, np.array([0.0, -0.3, 1.0]), bangs, closed=False, open_at=180.0)
    for sign in (1.0, -1.0):
        frame = {"kind": "hang", "theta": sign * 62.0, "aim": 100.0, "group": "side-front", "y_end": m["chin_y"] + (0.03 if male else 0.008) - 0.02 * side_len, "h_root": 0.011, "h_drop": 0.013, "flare": 0.0, "curl_in": 0.0, "curl_up": 0.0, "fwd": 0.008, "width": 0.020, "thickness": 0.0060, "split_len": 0.045, "taper_power": 1.1, "accent": sign > 0, "bridge": sign > 0}
        s.ring(f"frame-{'L' if sign > 0 else 'R'}", sph(sign * 34.0, 34.0), FORWARD, [frame], closed=False)
    return table_hairline([(0.0, 52.0), (40.0, 54.0), (60.0, 70.0), (85.0, 94.0), (115.0, 119.0), (150.0, 133.0), (180.0, 137.0)])


def style_twin_tail(s: Sketch) -> Callable[[np.ndarray], np.ndarray]:
    """트윈테일: 가운데 가르마로 좌우를 나눠 귀 위 뒤쪽 두 묶음점으로 당긴 두피 덩어리, 머리끈 둘, 바깥·뒤로 솟았다가 어깨 뒤로 길게 떨어지는 꼬리 둘,
    눈썹 위 앞머리와 짧은 옆머리."""
    m, male = s.m, s.male
    tail_len, volume, side_len, bangs_q, wave = s.q("tail"), s.q("volume"), s.q("sideLength"), s.q("bangs"), s.q("wave")
    conv = {"kind": "converge", "h_root": 0.0035, "h_tie": 0.0080, "thickness": 0.0055, "split_len": 0.010, "taper_power": 1.0, "width": 0.045, "group": "scalp", "tip_frac": 0.0}
    for sign in (1.0, -1.0):
        tie_dir = sph(sign * 116.0, 50.0)
        tie, tie_center, start_dir = twin_tie(s.frame, sign)
        targets = [(sign * 6.0, 30.0), (sign * 8.0, 54.0), (sign * 30.0, 56.0), (sign * 52.0, 72.0), (sign * 78.0, 96.0), (sign * 108.0, 120.0), (sign * 140.0, 134.0), (sign * 176.0, 140.0), (sign * 177.0, 104.0), (sign * 178.0, 66.0)]
        open_at = s.psi_for(tie_dir, FORWARD, sign * -60.0, 20.0)
        s.ring(f"scalp-{'L' if sign > 0 else 'R'}", tie_dir, FORWARD, [dict(conv, theta=theta, aim=aim) for theta, aim in targets], closed=False, open_at=open_at, columns=(5, 4, 2))
        out = np.array([sign, 0.0, 0.0])
        s.ties.append(Tie(center=tie_center, axis=start_dir, radius=0.015, tube=0.005))
        controls = twin_tail_controls(s.frame, tie, sign, tail_len)
        s.tail_ring(f"tail-{'L' if sign > 0 else 'R'}", tie + out * 0.005, controls, 5, thickness=0.0095, radius=(0.014, 0.024 * (1.0 + 0.2 * volume), 0.012), start_dir=start_dir, split_len=0.07, wave=((0.010 if not male else 0.006) * (1.0 + wave), 1.5))
    bang_y = m["brow_top_y"] - 0.002 - 0.008 * bangs_q
    bangs = [_bang(theta, bang_y + d, h_root=0.011, h_line=0.016 + 0.003 * volume, h_tip=0.0065, aim=74.0, width=0.036, thickness=0.0078, split_len=0.018, taper_power=1.1) for theta, d in ((-33.0, 0.007), (-11.0, 0.0), (11.0, 0.003), (33.0, 0.008))]
    for sign in (1.0, -1.0):
        bangs.append(_bang(sign * 50.0, m["eye_top_y"] + 0.008 - 0.004 * bangs_q, aim=80.0, h_root=0.011, h_line=0.015, h_tip=0.0065, width=0.032, thickness=0.0072, split_len=0.016, taper_power=1.1))
    s.ring("bangs", sph(0.0, 14.0), np.array([0.0, -0.3, 1.0]), bangs, closed=False, open_at=180.0)
    for sign in (1.0, -1.0):
        frame = {"kind": "hang", "theta": sign * 64.0, "aim": 100.0, "group": "side-front", "y_end": m["eye_center"][1] - (0.040 if male else 0.050) - 0.02 * side_len, "h_root": 0.011, "h_drop": 0.013, "flare": 0.0, "curl_in": 0.002, "curl_up": 0.0, "fwd": 0.006, "width": 0.022, "thickness": 0.0060, "split_len": 0.035, "taper_power": 1.0, "accent": sign > 0, "bridge": sign > 0}
        s.ring(f"frame-{'L' if sign > 0 else 'R'}", sph(sign * 36.0, 30.0), FORWARD, [frame], closed=False)
    return table_hairline([(0.0, 50.0), (40.0, 52.0), (60.0, 68.0), (85.0, 92.0), (115.0, 119.0), (150.0, 132.0), (180.0, 137.0)])


STYLES: dict[str, Callable[[Sketch], Callable[[np.ndarray], np.ndarray]]] = {
    "short-layered": style_short_layered,
    "soft-bob": style_soft_bob,
    "romance-long": style_romance_long,
    "action-pony": style_action_pony,
    "hime-cut": style_hime_cut,
    "wolf-layered": style_wolf_layered,
    "twin-tail": style_twin_tail,
}


# ---------------------------------------------------------------- 헤어 부속(별도 GLB)
#
# 헤어와 독립된 모듈 부속 12종(아호게 3 · 묶음/리본 3 · 핀/집게 2 · 머리띠 2 · 비녀/댕기 2). 한 메시 노드 `TS_HairAccessory_<id>`, 머리 본 100 % 스킨,
# 머리 부착 morph 8개 + `shape:fit:±`. 역할(제안) — 본체 `hair-accessory`(colorKey `hairAccessory`), 장식 `hair-accessory-accent`
# (colorKey `hairAccessoryAccent`), 아호게는 머리카락이라 `hair`(colorKey `hair`, 헤어 램프 텍스처를 그대로 쓴다).
# 배치는 앵커(`accessory_anchors`) 기준이다. 자유 부속(아호게·핀·집게·머리띠·리본)은 두피 위 기본 높이 `ACCESSORY_BASE_H`(헤어 겉면 평균)에 놓이고
# `shape:fit:+`(바깥 +10 mm)·`shape:fit:-`(안쪽 −8 mm)로 스타일의 헤어 부피에 맞춘다. 묶음 부속(곱창끈·방울끈·비녀·댕기)은 액션 포니 묶음점이 기본이고
# 트윈테일용은 두 묶음점에 하나씩 놓은 변형 파일(`<id>@twin-tail`)이다. 스타일별 권장 fit·적용 가능 여부는 `accessory_fit_report`가 잰다.

HAIR_ACCESSORY_IDS = ("ahoge-single", "ahoge-twin", "ahoge-curl", "ribbon-bow", "scrunchie", "bead-tie", "pin-cross", "clip-star", "headband-plain", "headband-bow", "binyeo", "daenggi")
ACCESSORY_ZONES = ("hair-accessory", "hair-accessory-accent", "hair")
ACCESSORY_COLOR_KEYS = {"hair-accessory": "hairAccessory", "hair-accessory-accent": "hairAccessoryAccent", "hair": "hair"}
ACCESSORY_MORPHS = tuple(HAIR_MORPHS) + ("shape:fit:+", "shape:fit:-")
#: 자유 부속의 기본 높이(두피 위, m) — 7종 헤어 겉면 높이의 가운데 값
ACCESSORY_BASE_H = 0.016
#: `shape:fit:±` 1당 반지름 방향 이동(m) — +1이면 두피 위 30 mm(울프컷 정수리 층)까지, −1이면 8 mm(포니·트윈의 당겨 붙인 두피 머리)까지 맞는다
FIT_OUT_M = 0.014
FIT_IN_M = 0.008
ACCESSORY_TEXTURE_SIZE = 256
#: 부속 삼각형 예산(계약 `triangles.accessory`)
ACCESSORY_TRIANGLES = 6000


@dataclass
class AccessoryPiece:
    """부속 조각 하나(닫힌 메시): 색 영역·UV0·흐름값(UV1 V)·AO."""

    positions: np.ndarray
    triangles: np.ndarray
    zone: str
    uvs: np.ndarray
    flow: np.ndarray
    ao: float | np.ndarray = 1.0


@dataclass
class Anchor:
    """부속 앵커: 원점(두피 위 기본 높이 또는 묶음 중심), 바깥 방향, 위(접평면 안, 정수리 쪽), 옆(캐릭터 왼쪽 +X 쪽)."""

    name: str
    origin: np.ndarray
    out: np.ndarray
    up: np.ndarray
    side: np.ndarray
    axis: np.ndarray | None = None  # 묶음 부속: 꼬리 축 점열(묶음 → 끝)
    radius: float = 0.0  # 묶음 부속: 머리끈 반지름


def pony_tie(frame: HeadFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """액션 포니 묶음: (두피 위 묶음점, 머리끈 중심, 꼬리 시작 방향). 스타일 빌더와 부속이 같은 값을 쓴다."""
    tie = frame.scalp(unit(sph(180.0, 42.0)), 0.006, "skull")[0]
    return tie, tie + unit(tie - frame.center) * 0.004, unit(np.array([0.0, 0.45, -1.0]))


def pony_tail_controls(frame: HeadFrame, tie: np.ndarray, tail_len: float) -> list[np.ndarray]:
    m, male = frame.marks, frame.base_id == "male"
    end_y = (m["shoulder_y"] + 0.02 if male else 1.30) - 0.06 * tail_len
    return [tie + np.array([0.0, 0.028, -0.050]), tie + np.array([0.0, -0.010, -0.092]), np.array([0.0, m["shoulder_y"] + 0.05, m["back_z"] - 0.050]), np.array([0.0, end_y, m["back_z"] - 0.030])]


def twin_tie(frame: HeadFrame, sign: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """트윈테일 한쪽 묶음(sign +1 = 캐릭터 왼쪽): (두피 위 묶음점, 머리끈 중심, 꼬리 시작 방향)."""
    tie = frame.scalp(unit(sph(sign * 116.0, 50.0)), 0.006, "skull")[0]
    return tie, tie + unit(tie - frame.center) * 0.004, unit(np.array([sign * 0.75, 0.35, -0.55]))


def twin_tail_controls(frame: HeadFrame, tie: np.ndarray, sign: float, tail_len: float) -> list[np.ndarray]:
    m, male = frame.marks, frame.base_id == "male"
    end_y = (1.30 if male else 1.06) - 0.08 * tail_len
    out = np.array([sign, 0.0, 0.0])
    return [tie + out * 0.030 + np.array([0.0, 0.020, -0.020]), tie + out * 0.058 + np.array([0.0, -0.030, -0.040]), np.array([sign * 0.112, m["shoulder_y"] + 0.035, m["back_z"] - 0.035]), np.array([sign * 0.118, end_y, m["back_z"] - 0.028])]


def tail_axis(start: np.ndarray, start_dir: np.ndarray, controls: list[np.ndarray]) -> np.ndarray:
    """꼬리 축(묶음 → 끝, 3 mm 간격) — `Sketch.tail_ring`과 같은 식."""
    axis = catmull_rom(np.vstack([start[None, :], (start + unit(start_dir) * 0.012)[None, :], np.asarray(controls, dtype=np.float64)]), 16)
    return resample(axis, spacing=0.003)


def _surface_anchor(frame: HeadFrame, name: str, theta: float, phi: float, h: float = ACCESSORY_BASE_H) -> Anchor:
    d = unit(sph(theta, phi))
    origin = frame.scalp(d, h, "skull")[0]
    # 접평면: 두피 장의 기울기를 따라 정수리(φ 감소) 쪽이 위
    d_up = unit(sph(theta, max(phi - 2.0, 0.01)))
    up_point = frame.scalp(d_up, h, "skull")[0]
    up = up_point - origin
    out = unit(np.cross(unit(np.cross(up, d)), up)) if np.linalg.norm(up) > 1e-9 else d
    if out @ d < 0.0:
        out = -out
    up = unit(up - (up @ out) * out)
    side = unit(np.cross(up, out))
    return Anchor(name=name, origin=origin, out=out, up=up, side=side)


def _tie_anchor(frame: HeadFrame, name: str, center: np.ndarray, start_dir: np.ndarray, axis: np.ndarray, radius: float) -> Anchor:
    out = unit(start_dir)
    up_hint = np.array([0.0, 1.0, 0.0])
    side = unit(np.cross(up_hint, out)) if abs(out @ up_hint) < 0.95 else np.array([1.0, 0.0, 0.0])
    up = unit(np.cross(out, side))
    return Anchor(name=name, origin=center, out=out, up=up, side=side, axis=axis, radius=radius)


def accessory_anchors(frame: HeadFrame) -> dict[str, Anchor]:
    """부속 앵커(머리 기준, T-포즈 m). 자유 부속 앵커는 두피 위 `ACCESSORY_BASE_H`, 묶음 앵커는 머리끈 중심과 꼬리 축."""
    anchors = {
        "crown": _surface_anchor(frame, "crown", 0.0, 16.0),
        "temple-L": _surface_anchor(frame, "temple-L", 66.0, 52.0),
        "back-crown": _surface_anchor(frame, "back-crown", 180.0, 40.0),
    }
    for sign, label in ((1.0, "L"), (-1.0, "R")):
        anchors[f"near-twin-tie-{label}"] = _surface_anchor(frame, f"near-twin-tie-{label}", sign * 100.0, 48.0)
    tie, center, start_dir = pony_tie(frame)
    anchors["pony-tie"] = _tie_anchor(frame, "pony-tie", center, start_dir, tail_axis(tie + np.array([0.0, 0.0, -0.006]), start_dir, pony_tail_controls(frame, tie, 0.0)), 0.017)
    # 포니 리본: 머리끈 고리의 위쪽 바깥(머리에서 먼 쪽)에 얹고 꼬리 자락은 꼬리를 따라 뒤로 흐른다
    axis = anchors["pony-tie"].out
    top = unit(np.array([0.0, 1.0, 0.0]) - axis[1] * axis)
    anchors["pony-tie-top"] = Anchor(name="pony-tie-top", origin=center + top * (0.017 + 0.0075), out=top, up=-axis, side=np.array([1.0, 0.0, 0.0]), axis=anchors["pony-tie"].axis, radius=0.017)
    for sign, label in ((1.0, "L"), (-1.0, "R")):
        tie, center, start_dir = twin_tie(frame, sign)
        out = np.array([sign, 0.0, 0.0])
        anchors[f"twin-tie-{label}"] = _tie_anchor(frame, f"twin-tie-{label}", center, start_dir, tail_axis(tie + out * 0.005, start_dir, twin_tail_controls(frame, tie, sign, 0.0)), 0.015)
    return anchors


# ---- 부속 기본 도형


def _closed_ring_strip(rings: np.ndarray, closed_path: bool, cap_points: tuple[np.ndarray, np.ndarray] | None) -> tuple[np.ndarray, np.ndarray]:
    """고리 점열 (n, k, 3)을 잇는다(고리마다 닫힌 단면). `closed_path`면 마지막 고리를 첫 고리와 잇고, 아니면 두 끝을 `cap_points`로 부채꼴 마개."""
    n, k, _ = rings.shape
    positions = rings.reshape(-1, 3)
    tris = []
    last = n if closed_path else n - 1
    for i in range(last):
        j = (i + 1) % n
        for c in range(k):
            a, b = i * k + c, i * k + (c + 1) % k
            cc, d = j * k + c, j * k + (c + 1) % k
            tris += [[a, cc, b], [b, cc, d]]
    if not closed_path and cap_points is not None:
        start = len(positions)
        positions = np.vstack([positions, cap_points[0][None, :], cap_points[1][None, :]])
        end_ring = (n - 1) * k
        for c in range(k):
            tris.append([start, c, (c + 1) % k])
            tris.append([start + 1, end_ring + (c + 1) % k, end_ring + c])
    triangles = np.asarray(tris, dtype=np.int64)
    if gf.mesh_signed_volume(positions, triangles) < 0.0:
        triangles = triangles[:, [0, 2, 1]]
    return positions, triangles


def flat_strip(path: np.ndarray, width_dir: np.ndarray, normal_dir: np.ndarray, widths: np.ndarray, thickness: float, *, columns: int = 5, closed_path: bool = False, bulge: float = 0.25, notch: float = 0.0) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """납작한 띠(리본·머리띠): 경로 점마다 폭 방향·면 법선·폭. 단면은 윗면 `columns`점 + 아랫면 `columns`점(가운데가 `bulge`만큼 볼록).
    `notch` > 0 이면 끝을 V자(제비꼬리)로 판다. 돌려주는 것: (정점, 삼각형, UV0, 흐름값)."""
    path = np.asarray(path, dtype=np.float64)
    n = len(path)
    fs = np.linspace(-1.0, 1.0, columns)
    s = arc_lengths(path)
    length = max(float(s[-1]), 1e-9)
    tangent = unit(np.gradient(path, axis=0))
    rings = np.zeros((n, 2 * columns, 3))
    for i in range(n):
        wd = unit(width_dir[i] - (width_dir[i] @ tangent[i]) * tangent[i])
        nd = unit(normal_dir[i] - (normal_dir[i] @ tangent[i]) * tangent[i] - (normal_dir[i] @ wd) * wd)
        top, bottom = [], []
        for f in fs:
            base = path[i] + wd * (0.5 * widths[i] * f)
            if notch > 0.0 and i == n - 1:
                base = base - tangent[i] * notch * (1.0 - abs(f))
            bump = bulge * thickness * (1.0 - f * f)
            top.append(base + nd * (0.5 * thickness + bump))
            bottom.append(base - nd * (0.5 * thickness))
        rings[i] = np.vstack([np.array(top), np.array(bottom[::-1])])
    caps = None if closed_path else (path[0] - tangent[0] * 0.3 * thickness, path[-1] + tangent[-1] * 0.3 * thickness - (tangent[-1] * notch if notch > 0.0 else 0.0))
    positions, triangles = _closed_ring_strip(rings, closed_path, caps)
    lateral = np.concatenate([0.5 * (fs + 1.0), 0.5 * (fs[::-1] + 1.0)])
    u = np.tile(lateral, n)
    v = np.repeat(s / length, 2 * columns)
    if not closed_path:
        u = np.concatenate([u, [0.5, 0.5]])
        v = np.concatenate([v, [0.0, 1.0]])
    uvs = np.stack([u, v], axis=1)
    return positions, triangles, uvs, v.copy()


def tube(path: np.ndarray, radii: np.ndarray, sides: int = 8, closed_path: bool = False, squash: float = 1.0, up: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """원(또는 `squash`로 납작한 타원) 단면 관. 돌려주는 것: (정점, 삼각형, UV0, 흐름값)."""
    path = np.asarray(path, dtype=np.float64)
    n = len(path)
    s = arc_lengths(path)
    length = max(float(s[-1]), 1e-9)
    hint = up if up is not None else (np.array([0.0, 1.0, 0.0]) if abs(unit(path[-1] - path[0])[1]) < 0.9 else np.array([1.0, 0.0, 0.0]))
    tangent, normal, binormal = parallel_frames(path, np.cross(unit(path[min(1, n - 1)] - path[0]), hint))
    alphas = np.linspace(0.0, 2.0 * math.pi, sides, endpoint=False)
    rings = np.stack([path[i] + np.outer(np.cos(alphas) * radii[i], binormal[i]) + np.outer(np.sin(alphas) * radii[i] * squash, normal[i]) for i in range(n)])
    caps = None if closed_path else (path[0] - tangent[0] * 0.4 * float(radii[0]), path[-1] + tangent[-1] * 0.4 * float(radii[-1]))
    positions, triangles = _closed_ring_strip(rings, closed_path, caps)
    u = np.tile((alphas / (2.0 * math.pi)), n)
    v = np.repeat(s / length, sides)
    if not closed_path:
        u = np.concatenate([u, [0.5, 0.5]])
        v = np.concatenate([v, [0.0, 1.0]])
    return positions, triangles, np.stack([u, v], axis=1), v.copy()


def ellipsoid(center: np.ndarray, axes: tuple[np.ndarray, np.ndarray, np.ndarray], radii: tuple[float, float, float], level: int = 2) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """타원체(구슬·꽃잎·매듭). 돌려주는 것: (정점, 삼각형, UV0, 흐름값)."""
    dirs, faces = icosphere(level)
    a, b, c = (unit(np.asarray(x, dtype=np.float64)) for x in axes)
    positions = center + dirs[:, :1] * radii[0] * a + dirs[:, 1:2] * radii[1] * b + dirs[:, 2:3] * radii[2] * c
    if gf.mesh_signed_volume(positions, faces) < 0.0:
        faces = faces[:, [0, 2, 1]]
    v = 0.5 - 0.5 * dirs[:, 1]
    return positions, faces, np.stack([0.5 + 0.5 * dirs[:, 0], v], axis=1), v


def star_prism(center: np.ndarray, out: np.ndarray, up: np.ndarray, r_out: float, r_in: float, thickness: float, points: int = 5, round_tips: float = 0.25) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """두께 있는 별(집게 장식): 윗면은 가운데가 솟은 낮은 피라미드, 옆면, 평평한 바닥."""
    out, up = unit(out), unit(up)
    side = unit(np.cross(up, out))
    outline = []
    for k in range(2 * points):
        ang = math.pi / 2.0 + math.pi * k / points
        r = r_out if k % 2 == 0 else r_in
        if k % 2 == 0 and round_tips > 0.0:
            for da in (-0.06, 0.06):
                outline.append((r * (1.0 - 0.06 * round_tips), ang + da))
        else:
            outline.append((r, ang))
    ring = np.array([center + side * (r * math.cos(a)) + up * (r * math.sin(a)) for r, a in outline])
    m = len(ring)
    top_ring = ring + out * thickness
    bottom_ring = ring
    apex = center + out * (thickness * 1.6)
    bottom_center = center
    positions = np.vstack([top_ring, bottom_ring, apex[None, :], bottom_center[None, :]])
    tris = []
    for i in range(m):
        j = (i + 1) % m
        tris += [[i, j, 2 * m], [m + j, m + i, 2 * m + 1], [i, m + i, j], [j, m + i, m + j]]
    triangles = np.asarray(tris, dtype=np.int64)
    if gf.mesh_signed_volume(positions, triangles) < 0.0:
        triangles = triangles[:, [0, 2, 1]]
    rel = positions - center
    u = 0.5 + 0.5 * (rel @ side) / r_out
    v = 0.5 + 0.5 * (rel @ up) / r_out
    return positions, triangles, np.stack([u, v], axis=1), np.clip(v, 0.0, 1.0)


def _piece(arrays: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray], zone: str, ao: float | np.ndarray = 1.0) -> AccessoryPiece:
    positions, triangles, uvs, flow = arrays
    return AccessoryPiece(positions=positions, triangles=triangles, zone=zone, uvs=np.clip(uvs, 0.0, 1.0), flow=np.clip(flow, 0.0, 1.0), ao=ao)


def _hair_strand(frame: HeadFrame, path: np.ndarray, width: float, thickness: float, taper_len: float, column: int) -> AccessoryPiece:
    """아호게 가닥: 헤어 가닥과 같은 납작 타원 스윕·헤어 램프 UV(끝 쪽 밝은 구간)."""
    lock = Lock(points=resample(path, spacing=0.002), width=width, thickness=thickness, group="ahoge", taper_len=taper_len, taper_power=1.05, root_scale=0.85, thickness_tip=0.45, band_y=None)
    piece = sweep_lock(frame, lock, 0, count=int(np.clip(round(lock.length() / 0.005) + 1, 8, 40)))
    column_width = 1.0 / TEXTURE_COLUMNS
    u = (column + 0.12 + 0.76 * piece.lateral) * column_width
    v = BAND_V[1] + 0.04 + (0.98 - BAND_V[1] - 0.04) * piece.t
    shade = np.clip(piece.shade, 0.6, 1.0) * (0.9 + 0.1 * smoothstep(0.0, 0.02, piece.s))
    return AccessoryPiece(positions=piece.positions, triangles=piece.triangles, zone="hair", uvs=np.stack([u, v], axis=1), flow=piece.t, ao=shade)


def _local(anchor: Anchor, x: float, y: float, z: float) -> np.ndarray:
    """앵커 좌표(옆 x, 위 y, 바깥 z) → 모델 좌표."""
    return anchor.origin + anchor.side * x + anchor.up * y + anchor.out * z


def _lift(anchor: Anchor, fit: float) -> Anchor:
    """fit(−1…1)만큼 앵커를 바깥으로 밀거나 당긴다."""
    shift = FIT_OUT_M * fit if fit >= 0.0 else FIT_IN_M * fit
    return replace(anchor, origin=anchor.origin + anchor.out * shift)


# ---- 부속별 작도


def acc_ahoge(frame: HeadFrame, anchor: Anchor, fit: float, variant: str) -> list[AccessoryPiece]:
    """아호게: 정수리 앞에서 솟아 앞으로 휘는 가닥(single), 좌우로 갈라진 두 가닥(twin), 위로 솟아 고리처럼 말린 가닥(curl).
    뿌리는 헤어 겉면 6 mm 아래에서 시작해 헤어 속에 묻힌다."""
    a = _lift(anchor, fit)
    if variant == "single":
        control = [(0.0, 0.0, -0.007), (0.0, -0.002, 0.016), (0.0, 0.006, 0.036), (0.0, 0.022, 0.050), (0.0, 0.040, 0.050), (0.0, 0.052, 0.040)]
        return [_hair_strand(frame, catmull_rom(np.array([_local(a, *p) for p in control]), 8), 0.013, 0.0045, 0.040, 1)]
    if variant == "twin":
        pieces = []
        for sign, column in ((1.0, 0), (-1.0, 2)):
            control = [(0.0, 0.0, -0.007), (sign * 0.003, -0.001, 0.014), (sign * 0.012, 0.004, 0.032), (sign * 0.026, 0.014, 0.042), (sign * 0.038, 0.024, 0.040)]
            pieces.append(_hair_strand(frame, catmull_rom(np.array([_local(a, *p) for p in control]), 8), 0.011, 0.0040, 0.034, column))
        return pieces
    # curl: 위로 솟았다가 앞으로 돌아 작은 고리를 만든다
    pts = [_local(a, 0.0, 0.0, -0.007), _local(a, 0.0, -0.001, 0.012), _local(a, 0.0, 0.002, 0.028)]
    loop_center = np.array([0.0, 0.016, 0.034])
    for ang in np.radians(np.arange(-150.0, 160.0, 15.0)):
        r = 0.013 * (1.0 - 0.25 * (ang + math.radians(150.0)) / math.radians(300.0))
        pts.append(_local(a, 0.0, loop_center[1] + r * math.sin(ang), loop_center[2] + r * math.cos(ang)))
    return [_hair_strand(frame, catmull_rom(np.array(pts), 6), 0.010, 0.0040, 0.030, 3)]


def _bow(center: np.ndarray, out: np.ndarray, up: np.ndarray, side: np.ndarray, scale: float, zone: str, tails: bool = True) -> list[AccessoryPiece]:
    """리본 매듭: 가운데 매듭(납작한 고리) + 좌우 고리(매듭 쪽이 좁고 바깥 끝이 넓다) + 아래로 늘어진 두 꼬리(제비꼬리 끝)."""
    pieces = []
    th = 0.0018
    # 좌우 고리: (옆, 바깥) 평면의 긴 고리, 폭은 위 방향
    for sign in (1.0, -1.0):
        u = np.linspace(0.0, 2.0 * math.pi, 41)[:-1]
        reach = 0.040 * scale
        x = sign * 0.5 * reach * (1.0 - np.cos(u))
        z = 0.011 * scale * np.sin(u) + 0.004 * scale
        y = 0.006 * scale * 0.5 * (1.0 - np.cos(u))
        path = center + np.outer(x, side) + np.outer(y, up) + np.outer(z, out)
        far = 0.5 * (1.0 - np.cos(u))
        widths = (0.010 + 0.020 * far**0.8) * scale
        loop_mid = center + side * (sign * 0.5 * reach) + out * (0.004 * scale)
        normal_dir = unit(path - loop_mid - np.outer((path - loop_mid) @ up, up))
        pos, tri, uv, flow = flat_strip(path, np.tile(up, (len(path), 1)), normal_dir, widths, th, columns=5, closed_path=True, bulge=0.15)
        inner = np.einsum("ij,ij->i", unit(pos - loop_mid), np.tile(out, (len(pos), 1)))
        pieces.append(_piece((pos, tri, uv, flow), zone, ao=0.86 + 0.14 * smoothstep(-0.5, 0.5, inner)))
    if tails:
        for sign in (1.0, -1.0):
            ts = np.linspace(0.0, 1.0, 14)
            path = center[None, :] + np.outer(sign * (0.004 + 0.016 * ts) * scale, side) - np.outer((0.004 + 0.048 * ts) * scale, up) + np.outer((0.003 + 0.004 * ts) * scale, out)
            widths = (0.015 + 0.006 * ts) * scale
            width_dir = np.tile(unit(side * 0.85 - up * sign * 0.25), (len(path), 1))
            pos, tri, uv, flow = flat_strip(path, width_dir, np.tile(out, (len(path), 1)), widths, th, columns=5, bulge=0.1, notch=0.007 * scale)
            pieces.append(_piece((pos, tri, uv, flow), zone, ao=0.95))
    # 매듭: (위, 바깥) 평면의 작은 고리, 폭은 옆 방향
    u = np.linspace(0.0, 2.0 * math.pi, 21)[:-1]
    path = center + np.outer(0.009 * scale * np.sin(u), up) + np.outer(0.006 * scale * np.cos(u) + 0.006 * scale, out)
    normal_dir = unit(path - (center + out * 0.006 * scale))
    pos, tri, uv, flow = flat_strip(path, np.tile(side, (len(path), 1)), normal_dir, np.full(len(path), 0.013 * scale), th * 1.2, columns=4, closed_path=True, bulge=0.2)
    pieces.append(_piece((pos, tri, uv, flow), zone, ao=0.9))
    return pieces


def acc_ribbon_bow(frame: HeadFrame, anchor: Anchor, fit: float) -> list[AccessoryPiece]:
    """큰 리본: 앵커 바깥면에 붙은 매듭과 고리·꼬리(본체 색)."""
    a = _lift(anchor, fit)
    return _bow(a.origin + a.out * 0.002, a.out, a.up, a.side, 1.0, "hair-accessory")


def _tie_frame(anchor: Anchor) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    axis = unit(anchor.out)
    helper = np.array([0.0, 1.0, 0.0]) if abs(axis[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = unit(np.cross(axis, helper))
    return axis, u, np.cross(axis, u)


def acc_scrunchie(frame: HeadFrame, anchor: Anchor, fit: float) -> list[AccessoryPiece]:
    """곱창 머리끈: 머리끈을 감싸는 주름진 천 고리(반지름 방향 9주름·축 방향 출렁임)."""
    axis, u, v = _tie_frame(anchor)
    major = anchor.radius + 0.006 + 0.003 * fit
    segments, sides = 54, 10
    rings = []
    for i in range(segments):
        a = 2.0 * math.pi * i / segments
        radial = math.cos(a) * u + math.sin(a) * v
        ruffle = 1.0 + 0.22 * math.sin(9.0 * a) + 0.08 * math.sin(4.0 * a + 0.7)
        wobble = 0.0025 * math.sin(9.0 * a + 1.3)
        ring = []
        for k in range(sides):
            b = 2.0 * math.pi * k / sides
            minor = 0.0085 * ruffle
            ring.append(anchor.origin + axis * (wobble + minor * 1.25 * math.sin(b)) + radial * (major + minor * math.cos(b)))
        rings.append(ring)
    rings = np.array(rings)
    pos, tri = _closed_ring_strip(rings, True, None)
    uvs = np.stack([np.tile(np.arange(sides) / sides, segments), np.repeat(np.arange(segments) / segments, sides)], axis=1)
    fold = 0.5 + 0.5 * np.repeat(np.array([math.sin(9.0 * 2.0 * math.pi * i / segments) for i in range(segments)]), sides)
    return [AccessoryPiece(positions=pos, triangles=tri, zone="hair-accessory", uvs=uvs, flow=uvs[:, 1], ao=0.84 + 0.16 * fold)]


def acc_bead_tie(frame: HeadFrame, anchor: Anchor, fit: float) -> list[AccessoryPiece]:
    """방울 머리끈: 가는 고무줄 고리 + 바깥쪽 위에 구슬 두 개(장식 색)."""
    axis, u, v = _tie_frame(anchor)
    major = anchor.radius + 0.0035 + 0.003 * fit
    ang = np.linspace(0.0, 2.0 * math.pi, 41)[:-1]
    path = anchor.origin + np.outer(np.cos(ang), u) * major + np.outer(np.sin(ang), v) * major
    band = tube(path, np.full(len(path), 0.0026), sides=6, closed_path=True, squash=1.3, up=axis)
    pieces = [_piece(band, "hair-accessory", ao=0.92)]
    up_world = np.array([0.0, 1.0, 0.0])
    top = unit(up_world - (up_world @ axis) * axis)
    side = unit(np.cross(axis, top))
    for sign in (1.0, -1.0):
        center = anchor.origin + top * (major + 0.0075) + side * sign * 0.0085
        pieces.append(_piece(ellipsoid(center, (side, top, axis), (0.0085, 0.0085, 0.0085), level=2), "hair-accessory-accent"))
    return pieces


def acc_pin_cross(frame: HeadFrame, anchor: Anchor, fit: float) -> list[AccessoryPiece]:
    """X자 실핀 두 개: 헤어 겉면에 눕힌 가는 납작 막대(물결 무늬 윗면)."""
    a = _lift(anchor, fit)
    pieces = []
    for sign in (1.0, -1.0):
        ang = math.radians(90.0 + sign * 28.0)
        direction = unit(math.cos(ang) * a.side + math.sin(ang) * a.up)
        ts = np.linspace(-0.5, 0.5, 24)
        path = a.origin[None, :] + np.outer(ts * 0.046, direction) + np.outer(0.0012 * np.sin(ts * 9.0 * math.pi) * (ts > -0.1), a.out) + a.out * (0.0012 + 0.0010 * (sign > 0))
        widths = np.full(len(path), 0.0034)
        pos, tri, uv, flow = flat_strip(path, np.tile(unit(np.cross(a.out, direction)), (len(path), 1)), np.tile(a.out, (len(path), 1)), widths, 0.0016, columns=4, bulge=0.3)
        pieces.append(_piece((pos, tri, uv, flow), "hair-accessory"))
    return pieces


def acc_clip_star(frame: HeadFrame, anchor: Anchor, fit: float) -> list[AccessoryPiece]:
    """별 집게: 헤어 결을 따라 눕힌 둥근 막대 집게 + 그 위 별 장식(장식 색)."""
    a = _lift(anchor, fit)
    ts = np.linspace(-0.5, 0.5, 16)
    direction = unit(a.up * 0.95 + a.side * 0.30)
    path = a.origin[None, :] + np.outer(ts * 0.040, direction) + a.out * 0.0016
    widths = 0.0095 * (1.0 - 0.35 * np.abs(ts * 2.0) ** 3)
    base = flat_strip(path, np.tile(unit(np.cross(a.out, direction)), (len(path), 1)), np.tile(a.out, (len(path), 1)), widths, 0.0028, columns=5, bulge=0.35)
    star = star_prism(a.origin + a.out * 0.0040 + direction * 0.004, a.out, direction, 0.0125, 0.0055, 0.0030)
    return [_piece(base, "hair-accessory", ao=0.95), _piece(star, "hair-accessory-accent")]


def _band_path(frame: HeadFrame, h: float, samples: int = 72, surface: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """머리띠 경로: C를 지나고 X축을 품은 평면(정수리 앞 25°로 기운)의 대원을 두피 장 + h로 따라가며 양 끝은 귀 윗선 높이에서 멈춘다.
    `surface`(헤어 정점)를 주면 높이를 그 헤어 겉면 높이(방향마다 원뿔 5°의 최대, 이웃 9점 이동 평균) + 2.5 mm로 바꾼다 — 스타일 맞춤 머리띠.
    돌려주는 것: (점, 폭 방향, 바깥 방향)."""
    tilt = math.radians(25.0)
    top = np.array([0.0, math.cos(tilt), math.sin(tilt)])
    x = np.array([1.0, 0.0, 0.0])
    plane_n = unit(np.cross(x, top))
    ts = np.linspace(-0.62 * math.pi, 0.62 * math.pi, 4 * samples)
    dirs = unit(np.outer(np.cos(ts), top) + np.outer(np.sin(ts), x))
    heights = np.full(len(dirs), h)
    if surface is not None:
        found = np.array([hair_surface_height(frame, surface, d, 5.0) for d in dirs], dtype=object)
        raw = np.array([np.nan if v is None else float(v) for v in found])
        if np.isfinite(raw).any():
            raw = np.where(np.isfinite(raw), raw, np.nanmin(raw))
            kernel = np.ones(9) / 9.0
            smooth = np.convolve(np.pad(raw, 4, mode="edge"), kernel, mode="valid")
            heights = np.maximum(smooth, 0.006) + 0.0025 + (h - ACCESSORY_BASE_H)
    pts = frame.scalp(dirs, heights, "cover")
    keep = pts[:, 1] >= frame.marks["ear_top_y"] + 0.006
    idx = np.flatnonzero(keep)
    pts = pts[idx[0] : idx[-1] + 1]
    dirs = dirs[idx[0] : idx[-1] + 1]
    pts = resample(pts, count=samples)
    radial = unit(pts - frame.center)
    width = unit(np.tile(plane_n, (len(pts), 1)) - np.einsum("ij,j->i", radial, plane_n)[:, None] * radial)
    return pts, width, radial


def acc_headband(frame: HeadFrame, anchor: Anchor, fit: float, with_bow: bool, surface: np.ndarray | None = None) -> list[AccessoryPiece]:
    """머리띠: 귀 위에서 귀 위까지 헤어 겉면을 타는 둥근 띠(폭 14 mm). bow면 왼쪽 위에 작은 리본(장식 색).
    `surface`(스타일 헤어 정점)를 주면 그 헤어 겉면을 따라 휘는 스타일 맞춤 띠(`<id>@<스타일>.glb`)가 된다."""
    shift = FIT_OUT_M * fit if fit >= 0.0 else FIT_IN_M * fit
    h = ACCESSORY_BASE_H + shift
    pts, width_dir, radial = _band_path(frame, h, surface=surface)
    ts = np.linspace(0.0, 1.0, len(pts))
    widths = 0.014 * (1.0 - 0.45 * smoothstep(0.88, 1.0, np.abs(2.0 * ts - 1.0)))
    band = flat_strip(pts + radial * 0.0016, width_dir, radial, widths, 0.0032, columns=6, bulge=0.45)
    pieces = [_piece(band, "hair-accessory")]
    if with_bow:
        k = int(0.32 * (len(pts) - 1))
        tangent = unit(pts[min(k + 1, len(pts) - 1)] - pts[k - 1])
        side = tangent if tangent[0] > 0.0 else -tangent
        pieces += _bow(pts[k] + radial[k] * 0.0045, radial[k], width_dir[k] if width_dir[k][2] > 0.0 else -width_dir[k], side, 0.62, "hair-accessory-accent", tails=False)
    return pieces


def acc_binyeo(frame: HeadFrame, anchor: Anchor, fit: float) -> list[AccessoryPiece]:
    """비녀: 묶음 바로 위 헤어 겉면을 가로로 지르는 가는 막대(한쪽 끝 뾰족, 13 cm) + 반대쪽 끝 매화 장식(꽃잎 5 + 꽃술, 장식 색)."""
    axis, _, _ = _tie_frame(anchor)
    up_world = np.array([0.0, 1.0, 0.0])
    top = unit(up_world - (up_world @ axis) * axis)
    side = unit(np.cross(axis, top))
    side = side if side[0] > 0.0 else -side
    center = anchor.origin + top * (anchor.radius + 0.006 + 0.003 * fit) + axis * 0.004
    ts = np.linspace(-1.0, 1.0, 30)
    path = center + np.outer(ts * 0.065, side) - np.outer(0.004 * ts * ts, top)
    radii = 0.0028 * np.where(ts < -0.75, smoothstep(-1.02, -0.75, ts), 1.0) + 0.0004
    rod = tube(path, radii, sides=8, up=top)
    pieces = [_piece(rod, "hair-accessory")]
    head = path[-1] + side * 0.004
    face = unit(axis * 0.6 + top * 0.8)
    face_side = unit(np.cross(face, side))
    for k in range(5):
        ang = 2.0 * math.pi * k / 5.0 + math.pi / 2.0
        direction = unit(math.cos(ang) * side + math.sin(ang) * face_side)
        petal_center = head + direction * 0.0085
        pieces.append(_piece(ellipsoid(petal_center, (direction, np.cross(face, direction), face), (0.0062, 0.0052, 0.0022), level=2), "hair-accessory-accent"))
    pieces.append(_piece(ellipsoid(head + face * 0.0018, (side, face_side, face), (0.0036, 0.0036, 0.0028), level=2), "hair-accessory", ao=0.9))
    knob = path[0] - side * 0.002
    pieces.append(_piece(ellipsoid(knob, (side, top, axis), (0.0035, 0.0035, 0.0035), level=1), "hair-accessory"))
    return pieces


def acc_daenggi(frame: HeadFrame, anchor: Anchor, fit: float) -> list[AccessoryPiece]:
    """댕기: 묶음을 감싸는 납작한 띠 매듭 + 꼬리 축을 따라 아래로 늘어진 넓은 두 자락(18 cm, 끝 25 %는 금박 장식 색)."""
    axis, u, v = _tie_frame(anchor)
    pieces = []
    ang = np.linspace(0.0, 2.0 * math.pi, 33)[:-1]
    r = anchor.radius + 0.0045 + 0.003 * fit
    ring = anchor.origin + axis * 0.004 + np.outer(np.cos(ang), u) * r + np.outer(np.sin(ang), v) * r
    pos, tri, uv, flow = flat_strip(ring, np.tile(axis, (len(ring), 1)), unit(ring - anchor.origin - axis * 0.004), np.full(len(ring), 0.016), 0.0020, columns=4, closed_path=True, bulge=0.2)
    pieces.append(_piece((pos, tri, uv, flow), "hair-accessory", ao=0.92))
    tail = anchor.axis if anchor.axis is not None else anchor.origin + np.outer(np.linspace(0.0, 0.2, 40), axis)
    s = arc_lengths(tail)
    total = max(float(s[-1]), 1e-9)
    for sign in (1.0, -1.0):
        keep = s <= 0.18 + 0.012 * sign
        path = tail[keep]
        tangent = unit(np.gradient(path, axis=0))
        # 꼬리 다발의 바깥면(머리 중심에서 먼 쪽)을 타고 내려간다
        rel = path - frame.center
        outward = unit(rel - np.einsum("ij,ij->i", rel, tangent)[:, None] * tangent)
        lateral = unit(np.cross(tangent, outward))
        t = s[keep] / total
        # 꼬리 굵기(`tail_ring` 포니 반지름 16 → 27 → 14 mm)의 겉면 + 가닥 반두께 5 mm + 간격 2 mm
        bulk = np.where(t < 0.25, 0.016 + 0.011 * smoothstep(0.0, 0.25, t), 0.027 - 0.013 * smoothstep(0.25, 1.0, t))
        bundle = np.maximum(bulk, anchor.radius) + 0.007 + 0.003 * fit
        tt = arc_lengths(path) / max(arc_lengths(path)[-1], 1e-9)
        offset = path + outward * bundle[:, None] + lateral * (sign * (0.009 + 0.010 * tt))[:, None]
        widths = 0.026 + 0.008 * tt
        pos, tri, uv, flow = flat_strip(offset, lateral, outward, widths, 0.0020, columns=5, bulge=0.12)
        zone_split = flow >= 0.75
        main_tri = ~zone_split[tri].all(axis=1)
        for zone, mask in (("hair-accessory", main_tri), ("hair-accessory-accent", ~main_tri)):
            if mask.any():
                pieces.append(_piece((pos, tri[mask], uv, flow), zone, ao=0.95))
    return pieces


#: 부속 정의: (앵커, 작도 함수, 종류). 종류 free = 자유 부속(fit = 바깥 이동), tie = 묶음 부속(포니 기본, 트윈 변형).
ACCESSORIES: dict[str, tuple[str, Callable[[HeadFrame, Anchor, float], list[AccessoryPiece]], str]] = {
    "ahoge-single": ("crown", lambda f, a, fit: acc_ahoge(f, a, fit, "single"), "free"),
    "ahoge-twin": ("crown", lambda f, a, fit: acc_ahoge(f, a, fit, "twin"), "free"),
    "ahoge-curl": ("crown", lambda f, a, fit: acc_ahoge(f, a, fit, "curl"), "free"),
    "ribbon-bow": ("back-crown", acc_ribbon_bow, "free"),
    "scrunchie": ("pony-tie", acc_scrunchie, "tie"),
    "bead-tie": ("pony-tie", acc_bead_tie, "tie"),
    "pin-cross": ("temple-L", acc_pin_cross, "free"),
    "clip-star": ("temple-L", acc_clip_star, "free"),
    "headband-plain": ("crown", lambda f, a, fit: acc_headband(f, a, fit, False), "free"),
    "headband-bow": ("crown", lambda f, a, fit: acc_headband(f, a, fit, True), "free"),
    "binyeo": ("pony-tie", acc_binyeo, "tie"),
    "daenggi": ("pony-tie", acc_daenggi, "tie"),
}
#: 스타일별 배치 변형: (부속, 스타일) → 앵커 이름들(여럿이면 한 GLB에 모두 놓는다)
ACCESSORY_PLACEMENTS: dict[tuple[str, str], tuple[str, ...]] = {
    ("ribbon-bow", "action-pony"): ("pony-tie-top",),
    ("ribbon-bow", "twin-tail"): ("near-twin-tie-L", "near-twin-tie-R"),
    **{(acc, "twin-tail"): ("twin-tie-L", "twin-tie-R") for acc in ("scrunchie", "bead-tie", "binyeo", "daenggi")},
    # 머리띠는 헤어 겉면 높이가 경로를 따라 크게 달라(앞머리 볼록·정수리 얇음·옆머리 부풂) 하나의 fit으로는 뜨거나 묻힌다 → 스타일 맞춤 파일
    **{(acc, style): ("crown",) for acc in ("headband-plain", "headband-bow") for style in HAIR_STYLE_IDS},
}
#: 스타일 헤어 겉면에 맞춰 다시 만드는 부속(배치 변형에 그 스타일 헤어 정점을 넘긴다)
SURFACE_FITTED_ACCESSORIES = ("headband-plain", "headband-bow")


def build_accessory(frame: HeadFrame, accessory_id: str, anchors: dict[str, Anchor], anchor_names: tuple[str, ...] | None = None, surface: np.ndarray | None = None) -> dict[str, Any]:
    """부속 하나의 정점 배열(조각 합침)·스킨·morph(머리 8 + fit ±). 위상은 fit과 무관하다.
    `surface`(스타일 헤어 정점)는 `SURFACE_FITTED_ACCESSORIES`(머리띠)에만 쓰여 그 헤어 겉면을 따라 휜다."""
    default_anchor, builder, _ = ACCESSORIES[accessory_id]
    names = anchor_names or (default_anchor,)
    if surface is not None and accessory_id in SURFACE_FITTED_ACCESSORIES:
        with_bow = accessory_id == "headband-bow"
        builder = lambda f, a, fit: acc_headband(f, a, fit, with_bow, surface=surface)  # noqa: E731

    def assemble(fit: float) -> list[AccessoryPiece]:
        pieces: list[AccessoryPiece] = []
        for name in names:
            pieces += builder(frame, anchors[name], fit)
        return pieces

    def pushed(pieces: list[AccessoryPiece]) -> np.ndarray:
        """조각 정점을 합쳐 충돌 표면(몸·머리) 바깥 0.8 mm로 민다 — 곱창끈처럼 머리에 닿는 쪽은 눌려 납작해진다."""
        points = np.vstack([piece.positions for piece in pieces])
        for _ in range(3):
            d, _, normal = gf.signed_distance(points, frame.collision, frame.collision_field)
            push = np.maximum(0.0008 - d, 0.0)
            if not (push > 0.0).any():
                break
            points = points + push[:, None] * normal
        return points

    base = assemble(0.0)
    plus, minus = assemble(1.0), assemble(-1.0)
    positions, triangles, uvs, flows, aos, zones = [], [], [], [], [], []
    offset = 0
    for piece in base:
        positions.append(piece.positions)
        triangles.append(piece.triangles + offset)
        uvs.append(piece.uvs)
        flows.append(piece.flow)
        aos.append(np.broadcast_to(np.asarray(piece.ao, dtype=np.float64), (len(piece.positions),)).copy())
        zones.append(np.full(len(piece.triangles), ACCESSORY_ZONES.index(piece.zone)))
        offset += len(piece.positions)
    P = pushed(base)
    shapes = {"shape:fit:+": pushed(plus) - P, "shape:fit:-": pushed(minus) - P}
    T = np.vstack(triangles)
    head = frame.joint_names.index("mixamorig:Head")
    joints = np.zeros((len(P), 4), dtype=np.int64)
    joints[:, 0] = head
    weights = np.zeros((len(P), 4))
    weights[:, 0] = 1.0
    deltas = hair_deltas(frame, P, np.ones(len(P)))
    deltas.update(shapes)
    ao = np.clip(np.concatenate(aos), 0.35, 1.0)
    uv0 = np.vstack(uvs)
    flow = np.concatenate(flows)
    return {
        "positions": P,
        "triangles": T,
        "tri_zone": np.concatenate(zones),
        "normals": vertex_normals(P, T),
        "uvs": uv0,
        "uv1": np.stack([np.zeros(len(P)), flow], axis=1),
        "color": np.stack([ao, ao, ao, np.ones_like(ao)], axis=1),
        "joints": joints,
        "weights": weights,
        "deltas": deltas,
        "anchors": list(names),
    }


def accessory_texture(size: int = ACCESSORY_TEXTURE_SIZE, quality: int = 92) -> tuple[bytes, dict[str, Any]]:
    """부속 상대색 텍스처(회색 JPEG): 천·광택 띠(U 가운데 밝은 줄)와 가장자리 살짝 어둡게. 평균 휘도 ≥ 0.80."""
    from PIL import Image

    u = (np.arange(size) + 0.5) / size
    v = (np.arange(size) + 0.5) / size
    uu, vv = np.meshgrid(u, v)
    value = 0.90 - 0.08 * (np.abs(uu - 0.5) * 2.0) ** 3
    sheen = smoothstep(0.16, 0.0, np.abs(uu - 0.42)) * 0.10
    weave = 0.012 * np.sin(vv * size * 0.9) * np.sin(uu * size * 0.9)
    image = np.clip(value + sheen + weave, 0.0, 1.0)
    gray = np.clip(image * 255.0 + 0.5, 0, 255).astype(np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(np.stack([gray, gray, gray], axis=-1), mode="RGB").save(buffer, format="JPEG", quality=quality, subsampling=0, optimize=True)
    data = buffer.getvalue()
    return data, {"bytes": len(data), "size": size, "meanLuminance": round(float(gray.mean()) / 255.0, 4)}


def accessory_node_name(accessory_id: str) -> str:
    return f"TS_HairAccessory_{accessory_id}"


def accessory_material_name(accessory_id: str, zone: str) -> str:
    return {"hair-accessory": f"ts_hairacc_{accessory_id}", "hair-accessory-accent": f"ts_hairacc_accent_{accessory_id}", "hair": f"ts_hairacc_hair_{accessory_id}"}[zone]


def write_accessory_glb(path: Any, accessory_id: str, base: BaseModel, mesh: dict[str, Any], hair_tex: bytes, acc_tex: bytes) -> int:
    """부속 GLB: 색 영역마다 프리미티브·재질 하나(헤어 영역은 헤어 램프 텍스처, 나머지는 천 텍스처), morph = 머리 8 + `shape:fit:±`."""
    from pathlib import Path

    writer = CompactGlbWriter(generator="toonstudio character_kit forge_hair accessories")
    joint_names = base.joint_names
    parents = {name: (None if parent < 0 else joint_names[parent]) for name, parent in zip(joint_names, base.joint_parents, strict=True)}
    writer.add_skeleton(joint_names, parents, base.arrays["joint_tpose"].astype(np.float64))
    used = [zone for index, zone in enumerate(ACCESSORY_ZONES) if (mesh["tri_zone"] == index).any()]
    textures: dict[str, int] = {}
    if "hair" in used:
        textures["hair"] = writer.add_texture(hair_tex, "image/jpeg", name=f"ts_hairacc_hair_{accessory_id}_basecolor")
    if any(zone != "hair" for zone in used):
        textures["fabric"] = writer.add_texture(acc_tex, "image/jpeg", name=f"ts_hairacc_{accessory_id}_basecolor")
    materials = {zone: writer.add_material(accessory_material_name(accessory_id, zone), base_color_texture=textures["hair" if zone == "hair" else "fabric"], double_sided=False, metallic=0.0, roughness=0.75) for zone in used}
    lod = LodMesh(positions=mesh["positions"], triangles=mesh["triangles"], tri_zone=mesh["tri_zone"], normals=mesh["normals"], uvs=mesh["uvs"], uv1=mesh["uv1"], color=mesh["color"], joints=mesh["joints"], weights=mesh["weights"], deltas=mesh["deltas"], shapes={}, groups=np.zeros(len(mesh["positions"]), dtype=np.int64), group_names=["accessory"], lock_counts=[])
    names = list(ACCESSORY_MORPHS)
    prims = [_primitive_arrays(lod, mesh["tri_zone"] == ACCESSORY_ZONES.index(zone), names, materials[zone]) for zone in used]
    writer.add_compact_mesh(accessory_node_name(accessory_id), prims, names)
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    return writer.write(str(out))


def hair_surface_height(frame: HeadFrame, hair_positions: np.ndarray, direction: np.ndarray, cone_deg: float = 7.0, reach: float = 0.035) -> float | None:
    """방향 `direction` 둘레 원뿔(반각 `cone_deg`) 안 헤어 정점의 두피 위 최대 높이(m). 두피에서 `reach`보다 먼 정점(머리 뒤로 지나가는 꼬리·머리끈)은
    부속이 얹힐 겉면이 아니라 뺀다. 헤어가 없으면 None."""
    rel = hair_positions - frame.center
    dist = np.linalg.norm(rel, axis=1)
    d = unit(np.atleast_2d(direction))[0]
    inside = (rel @ d) / np.maximum(dist, 1e-9) >= math.cos(math.radians(cone_deg))
    if not inside.any():
        return None
    dirs = rel[inside] / dist[inside, None]
    height = dist[inside] - frame.radius(dirs, "skull")
    height = height[height <= reach]
    return float(height.max()) if len(height) else None


def recommended_fit(height: float | None, clearance: float = 0.0025) -> float | None:
    """헤어 겉면 높이에 맞는 `shape:fit` 값(−1…1, 부속 밑면이 겉면 위 `clearance`에 오도록). 헤어가 없으면 None."""
    if height is None:
        return None
    need = height + clearance - ACCESSORY_BASE_H
    value = need / FIT_OUT_M if need >= 0.0 else need / FIT_IN_M
    return round(float(np.clip(value, -1.0, 1.0)), 2)


def accessory_fit_report(frame: HeadFrame, anchors: dict[str, Anchor], style_positions: dict[str, np.ndarray]) -> dict[str, dict[str, Any]]:
    """부속 × 스타일 권장 배치: {파일, 앵커, fit, 헤어 겉면 높이(mm)}. 묶음 부속은 액션 포니(기본 파일)·트윈테일(변형 파일)에만 쓰고 나머지는 None(적용 불가).
    자유 부속의 fit은 앵커 둘레 헤어 겉면 높이(머리띠는 띠 경로를 따라 잰 높이의 80 백분위)에서 정한다."""
    report: dict[str, dict[str, Any]] = {}
    for accessory_id, (anchor_name, _, kind) in ACCESSORIES.items():
        rows: dict[str, Any] = {}
        for style_id, positions in style_positions.items():
            names = ACCESSORY_PLACEMENTS.get((accessory_id, style_id))
            if kind == "tie":
                if style_id == "action-pony":
                    rows[style_id] = {"file": f"{accessory_id}.glb", "anchors": [anchor_name], "fit": 0.0}
                elif names:
                    rows[style_id] = {"file": f"{accessory_id}@{style_id}.glb", "anchors": list(names), "fit": 0.0}
                else:
                    rows[style_id] = None
                continue
            use = names or (anchor_name,)
            if all(anchors[name].axis is not None for name in use):
                rows[style_id] = {"file": f"{accessory_id}@{style_id}.glb" if names else f"{accessory_id}.glb", "anchors": list(use), "fit": 0.0}
                continue
            if accessory_id in SURFACE_FITTED_ACCESSORIES:
                rows[style_id] = {"file": f"{accessory_id}@{style_id}.glb", "anchors": list(use), "fit": 0.0, "surfaceFitted": True}
                continue
            found = [hair_surface_height(frame, positions, unit(anchors[name].origin - frame.center)) for name in use]
            found = [h for h in found if h is not None]
            height = max(found) if found else None
            rows[style_id] = {"file": f"{accessory_id}@{style_id}.glb" if names else f"{accessory_id}.glb", "anchors": list(use), "fit": recommended_fit(height), "hairHeightMm": None if height is None else round(height * 1000.0, 1)}
        report[accessory_id] = rows
    return report


def anchor_table(anchors: dict[str, Anchor]) -> dict[str, Any]:
    """앵커 문서용 표(모델 좌표 m, T-포즈): 원점·바깥·위·옆, 묶음 앵커는 머리끈 반지름과 꼬리 축 처음 5점."""
    table: dict[str, Any] = {}
    for name, anchor in anchors.items():
        row: dict[str, Any] = {key: [round(float(v), 4) for v in getattr(anchor, key)] for key in ("origin", "out", "up", "side")}
        if anchor.axis is not None:
            row["tieRadius"] = anchor.radius
            row["axisHead"] = [[round(float(v), 4) for v in point] for point in anchor.axis[:5]]
        table[name] = row
    return table
