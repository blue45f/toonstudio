"""얼굴 파라미터 15종·FACS 16 유닛의 해석 변위 필드 (numpy 이식본).

원본은 `apps/character-lab/src/domains/humanoid/morph/face-fields.ts`(이하 TS 원본)다. 이 모듈은 그 필드를 정점 배열
단위로 벡터화해 그대로 옮긴 것이며, Blender 빌더가 HBM 머리 메시 정점에 얼굴 morph 델타를 계산할 때 쓴다.
TS 원본과의 수치 일치(절대 오차 1e-9)는 `tests/test_face_fields_parity.py`가 TS 평가 결과와 비교해 고정한다.

좌표계는 머리 로컬 단위 반경 공간이다(+x = 캐릭터 왼쪽, +y = 위, +z = 앞). 좌우 대칭은 x 부호와 |x| 마스크만으로
만들어진다. 변위 단위도 같은 공간이므로 shape key는 `기준 좌표 + 가중치 * 변위`로 만든다.

스코프(점마다 하나)는 TS의 문자열 대신 정수 코드를 쓴다(`SCOPE_NAMES[코드]`가 TS 문자열).

    SCOPE_SURFACE=0  머리·눈썹·속눈썹 등 머리 표면 위 정점(거리 falloff 마스크)
    SCOPE_EYE_LEFT=1, SCOPE_EYE_RIGHT=2  안구 파츠(강체 변위)
    SCOPE_TEETH=3, SCOPE_TONGUE=4        치아·혀

`followInner`: 치아·혀는 입 안 공동 벽(머리 표면)과 같은 필드로 움직여야 피부를 뚫지 않으므로, 전용 처리가 있는 필드
(FACS `jawOpen`·`mouthFunnel`·`tongueOut`)만 빼고 모든 필드가 teeth/tongue 스코프를 surface로 평가한다. 얼굴 파라미터
15종에는 전용 처리가 없어 전부 surface를 따른다.

TS와 맞추려고 지킨 JS 의미: `Math.max/min` 클램프, `x >= 0 ? 1 : -1`(0과 -0은 +1), `Math.hypot(...) || 1`(길이 0이면 1),
컴팩트 서포트 `t >= 1 → 0`. 경계 비교에 쓰이는 거리·`t` 계산은 TS와 같은 연산 순서를 유지해 경계점에서도 분기가 같다.
(`exp`·`sin`·`cos`·`hypot`는 JS 엔진과 마지막 비트(≈1e-16) 차이가 날 수 있으며, 시험이 그 차이를 1e-9 이하로 고정한다.)

사용 예::

    import numpy as np
    from character_kit import face_fields as ff

    points = np.array([[0.0, -0.43, 0.78], [0.33, 0.10, 0.90]])   # (N, 3) float64
    delta = ff.morph_delta("facs:jawOpen", points, ff.SCOPE_SURFACE)   # (N, 3)
    minus = ff.morph_delta("param:eyeSize:-", points, np.array([0, 1]))   # 점마다 스코프
"""

from __future__ import annotations

import functools
from collections.abc import Callable

import numpy as np
from numpy.typing import ArrayLike, NDArray

__all__ = [
    "FACE_PARAM_KEYS",
    "FACS_UNITS",
    "HEAD_LANDMARKS",
    "SCOPE_EYE_LEFT",
    "SCOPE_EYE_RIGHT",
    "SCOPE_NAMES",
    "SCOPE_SURFACE",
    "SCOPE_TEETH",
    "SCOPE_TONGUE",
    "face_param_delta",
    "facs_delta",
    "jaw_mask_local",
    "morph_delta",
]

# ---------------------------------------------------------------------------
# 공개 상수 (TS 원본과 같은 값·같은 순서)
# ---------------------------------------------------------------------------

SCOPE_SURFACE = 0
SCOPE_EYE_LEFT = 1
SCOPE_EYE_RIGHT = 2
SCOPE_TEETH = 3
SCOPE_TONGUE = 4
#: 스코프 코드 → TS 문자열 ("surface" | "eye-left" | "eye-right" | "teeth" | "tongue")
SCOPE_NAMES = ("surface", "eye-left", "eye-right", "teeth", "tongue")

#: 머리 로컬 좌표 기준 얼굴 랜드마크(TS `HEAD_LANDMARKS`). 모듈 상수가 import 시점에 이 값으로 계산되므로 수정하지 않는다.
HEAD_LANDMARKS = {
    "eye": (0.33, 0.1, 0.6),  # 왼눈(안구) 중심. 오른눈은 x 부호 반전
    "eyeballRadius": 0.19,
    "brow": (0.36, 0.33, 0.8),  # 눈썹 중심
    "noseTip": (0.0, -0.12, 0.98),
    "noseBridge": (0.0, 0.08, 0.86),
    "mouth": (0.0, -0.43, 0.78),  # 입선 중심(위·아래 입술의 가운데). 턱 마스크·입 필드의 기준 y
    "mouthHalfWidth": 0.3,  # 입꼬리 x
    "chin": (0.0, -0.92, 0.42),
    "jawCorner": (0.62, -0.5, 0.1),
    "cheek": (0.7, -0.2, 0.42),
    "forehead": (0.0, 0.55, 0.7),
    "ear": (0.86, 0.0, -0.05),  # 왼귀 기부 중심
    "jawPivot": (0.0, -0.3, -0.1),  # 턱 관절(jaw 본)
    "scalpMinY": 0.3,  # 두피(헤어 앵커) 경계
}

#: 얼굴 파라미터 15종 (`contracts/params.ts` FACE_PARAM_KEYS 순서)
FACE_PARAM_KEYS = (
    "faceShape",
    "jawWidth",
    "chinLength",
    "cheekVolume",
    "forehead",
    "eyeSize",
    "eyeSpacing",
    "eyeTilt",
    "noseHeight",
    "noseWidth",
    "noseDepth",
    "mouthWidth",
    "lipFullness",
    "earSize",
    "earAngle",
)

#: FACS 유닛 16종 (`contracts/expression.ts` FACS_UNITS 순서)
FACS_UNITS = (
    "browInnerUp",
    "browOuterUp",
    "browDown",
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "eyeWide",
    "eyeSquint",
    "cheekPuff",
    "noseSneer",
    "jawOpen",
    "mouthSmile",
    "mouthFrown",
    "mouthPucker",
    "mouthFunnel",
    "mouthPress",
    "tongueOut",
)

# ---------------------------------------------------------------------------
# 내부 상수 (TS 모듈 상수)
# ---------------------------------------------------------------------------

_Array = NDArray[np.float64]
#: 정규화된 점 (N,3)과 스코프 (N,) 정수 배열 → (N,3) 변위
_Field = Callable[[_Array, NDArray[np.int64]], _Array]


def _landmark(name: str) -> _Array:
    return np.array(HEAD_LANDMARKS[name], dtype=np.float64)


_EYE = _landmark("eye")
_BROW = _landmark("brow")
_NOSE_TIP = _landmark("noseTip")
_MOUTH = _landmark("mouth")
_JAW_CORNER = _landmark("jawCorner")
_CHEEK = _landmark("cheek")
_FOREHEAD = _landmark("forehead")
_EAR = _landmark("ear")
_JAW_PIVOT = _landmark("jawPivot")
_MOUTH_Y = float(_MOUTH[1])

_NOSE_WING = np.array([0.16, -0.18, 0.88])
_NOSE_HEIGHT_CENTER = np.array([0.0, -0.05, 0.92])
_NOSE_SNEER_CENTER = np.array([_NOSE_WING[0], -0.15, _NOSE_WING[2]])
_MOUTH_CORNER = np.array([HEAD_LANDMARKS["mouthHalfWidth"], _MOUTH_Y, 0.76])
#: 입꼬리 마스크 반경: 가운데는 거의 움직이지 않고 꼬리만 올라/내려가게 한다(치아·입 안 바닥이 피부를 뚫지 않게).
_MOUTH_CORNER_SIGMA = 0.15
_EAR_CENTER = np.array([_EAR[0] + 0.06, _EAR[1], _EAR[2]])
#: 귀 마스크 반경(귀 케이지 0.3 + 주변 피부). 정중선까지 거리(0.92)보다 작아 대칭이 구성적으로 보장된다.
_EAR_MASK_RADIUS = 0.6
#: 눈 주변 마스크 반경(컴팩트 서포트): 눈썹·눈꺼풀까지 닿고 코·입·볼에는 새지 않는다.
_EYE_MASK_RADIUS = 0.55
_UPPER_LID = np.array([_EYE[0], 0.26, 0.78])
_LOWER_LID = np.array([_EYE[0], -0.06, 0.78])
_BROW_INNER = np.array([0.18, 0.33, 0.82])
_BROW_OUTER = np.array([0.5, 0.33, 0.68])
_CHEEK_PUFF = np.array([0.55, -0.35, 0.55])
_TONGUE_OUT_DELTA = np.array([0.0, -0.02, 0.35])

#: 턱 마스크의 세로 전환 반폭: 입 구멍 안(|x| <= 0.26)은 위·아래 입술 사이에서 급히, 볼·턱선 쪽은 완만히
_JAW_BAND_MIN = 0.016
_JAW_BAND_SPREAD = 0.2

# ---------------------------------------------------------------------------
# 입력 검증
# ---------------------------------------------------------------------------


def _as_points(points: ArrayLike) -> _Array:
    p = np.asarray(points, dtype=np.float64)
    if p.ndim != 2 or p.shape[1] != 3:
        raise ValueError(f"points는 (N,3) 배열이어야 합니다: shape={p.shape}")
    if not np.isfinite(p).all():
        raise ValueError("points에 NaN 또는 무한대가 있습니다(조용한 전파를 막으려고 거부합니다).")
    return p


def _as_scopes(scope: int | ArrayLike, count: int) -> NDArray[np.int64]:
    s = np.asarray(scope)
    if not np.issubdtype(s.dtype, np.integer):
        raise ValueError(f"scope는 정수 또는 정수 배열이어야 합니다: dtype={s.dtype}")
    if s.ndim == 0:
        s = np.full(count, int(s), dtype=np.int64)
    elif s.shape != (count,):
        raise ValueError(f"scope 배열의 shape은 ({count},) 이어야 합니다: shape={s.shape}")
    s = s.astype(np.int64, copy=False)
    if s.size and (int(s.min()) < SCOPE_SURFACE or int(s.max()) > SCOPE_TONGUE):
        raise ValueError(f"scope 코드는 {SCOPE_SURFACE}..{SCOPE_TONGUE} 이어야 합니다: {SCOPE_NAMES}")
    return s


# ---------------------------------------------------------------------------
# 수치 헬퍼 (TS 헬퍼와 1:1. p는 (N,3), 중심 c는 (3,) 또는 (N,3))
# ---------------------------------------------------------------------------


def _vec3(x: ArrayLike, y: ArrayLike, z: ArrayLike) -> _Array:
    """성분 세 개(각각 (N,) 배열 또는 스칼라)를 (N,3)으로 쌓는다. 셋 다 스칼라면 (3,)이다."""
    xs, ys, zs = np.broadcast_arrays(x, y, z)
    return np.stack((xs, ys, zs), axis=-1)


def _scale(v: _Array, k: ArrayLike) -> _Array:
    return v * np.asarray(k, dtype=np.float64)[..., np.newaxis]


def _masked(mask: NDArray[np.bool_], value: _Array) -> _Array:
    """mask가 참인 점은 value, 거짓인 점은 0 (TS의 `return ZERO`). value는 (N,3) 또는 (3,)."""
    return np.where(mask[:, np.newaxis], value, 0.0)


def _dist2(p: _Array, c: _Array) -> _Array:
    d = p - c
    return d[:, 0] * d[:, 0] + d[:, 1] * d[:, 1] + d[:, 2] * d[:, 2]


def _near(p: _Array, c: _Array, sigma: float) -> _Array:
    """특징점 c 근방 가우시안 마스크."""
    return np.exp(-_dist2(p, c) / (2.0 * sigma * sigma))


def _mirror(c: _Array) -> _Array:
    return np.array([-c[0], c[1], c[2]])


def _near_mirrored(p: _Array, c: _Array, sigma: float) -> _Array:
    """좌우 대칭 특징(c와 거울 c')의 확률적 합집합 1-(1-a)(1-b). 정중선에서 미분이 연속이라 V자 꺾임이 없다."""
    a = _near(p, c, sigma)
    b = _near(p, _mirror(c), sigma)
    return a + b - a * b


def _smooth01(x: ArrayLike, edge0: ArrayLike, edge1: ArrayLike) -> _Array:
    t = np.maximum(0.0, np.minimum(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def _lateral(x: _Array, width: float = 0.08) -> _Array:
    """좌우 방향 계수: 정중선에서 0, 양쪽에서 +-1(대칭 보존)."""
    return np.maximum(-1.0, np.minimum(1.0, x / width))


def _side_sign(x: _Array) -> _Array:
    """JS `x >= 0 ? 1 : -1` (0과 -0은 +1)."""
    return np.where(x >= 0.0, 1.0, -1.0)


def _lip_sign(y: _Array) -> _Array:
    """위·아래 입술 계수(입 중심선에서 0)."""
    return np.maximum(-1.0, np.minimum(1.0, (y - _MOUTH_Y) / 0.05))


def _eye_center_for(x: _Array) -> _Array:
    """x 쪽 눈 중심. 정중선(|x| < 0.06) 근처에서는 중심 x를 선형으로 0까지 줄여 변위 x 성분이 x의 홀함수가 되게 한다."""
    return _vec3(_lateral(x, 0.06) * _EYE[0], _EYE[1], _EYE[2])


def _bump(p: _Array, c: _Array, radius: float) -> _Array:
    """컴팩트 서포트 마스크 (1-(d/R)^2)^2. d >= R이면 정확히 0이라 정중선 등 먼 정점에 새지 않는다."""
    t = _dist2(p, c) / (radius * radius)
    return np.where(t >= 1.0, 0.0, (1.0 - t) * (1.0 - t))


def _bump_mirrored(p: _Array, c: _Array, radius: float) -> _Array:
    """좌우 대칭 특징(c와 거울 c' 중 가까운 쪽)의 컴팩트 서포트 마스크."""
    return np.maximum(_bump(p, c, radius), _bump(p, _mirror(c), radius))


def _rotation_delta(p: _Array, c: _Array, axis: int, theta: ArrayLike) -> _Array:
    """점 p를 중심 c 기준으로 축(0=x, 1=y, 2=z) 둘레로 theta 회전했을 때의 변위. theta는 스칼라 또는 (N,)."""
    d = p - c
    cos = np.cos(theta)
    sin = np.sin(theta)
    out = np.zeros_like(p)
    if axis == 0:
        out[:, 1] = d[:, 1] * cos - d[:, 2] * sin - d[:, 1]
        out[:, 2] = d[:, 1] * sin + d[:, 2] * cos - d[:, 2]
    elif axis == 1:
        out[:, 0] = d[:, 0] * cos + d[:, 2] * sin - d[:, 0]
        out[:, 2] = -d[:, 0] * sin + d[:, 2] * cos - d[:, 2]
    else:
        out[:, 0] = d[:, 0] * cos - d[:, 1] * sin - d[:, 0]
        out[:, 1] = d[:, 0] * sin + d[:, 1] * cos - d[:, 1]
    return out


def _radial(p: _Array, k: _Array) -> _Array:
    """원점에서 바깥(반경) 방향으로 크기 k만큼. 길이 0이면 JS `|| 1`처럼 1로 대신한다."""
    length = np.hypot(np.hypot(p[:, 0], p[:, 1]), p[:, 2])
    length = np.where((length == 0.0) | np.isnan(length), 1.0, length)
    return (p / length[:, np.newaxis]) * k[:, np.newaxis]


def _jaw_mask(p: _Array) -> _Array:
    band = _JAW_BAND_MIN + _JAW_BAND_SPREAD * _smooth01(np.abs(p[:, 0]), 0.26, 0.6)
    return _smooth01(_MOUTH_Y - p[:, 1], -band, band) * _smooth01(p[:, 2], -0.5, -0.2)


def _jaw_rotation(p: _Array, m: ArrayLike, angle: float = 0.35) -> _Array:
    return _rotation_delta(p, _JAW_PIVOT, 0, angle * m)


def _eye_rigid(p: _Array, side: _Array, kind: str) -> _Array:
    """눈 강체 변위(안구 스코프): 크기·간격·기울기. side는 점마다 +1(왼눈)/-1(오른눈)."""
    c = _vec3(side * _EYE[0], _EYE[1], _EYE[2])
    if kind == "size":
        return _scale(p - c, 0.2)
    if kind == "spacing":
        return _vec3(0.08 * side, 0.0, 0.0)  # 위치와 무관한 상수 변위
    if kind == "tilt":
        return _rotation_delta(p, c, 2, side * 0.25)
    raise ValueError(f"알 수 없는 눈 강체 종류: {kind!r}")


# ---------------------------------------------------------------------------
# 스코프 처리 데코레이터 (TS 필드의 `if (scope !== "surface") return ZERO` 등)
# ---------------------------------------------------------------------------


def _surface_only(surface_value: Callable[[_Array], _Array]) -> _Field:
    """surface 스코프 점에만 변위를 주고 나머지 스코프(안구·치아·혀)는 0으로 둔다."""

    def field(p: _Array, scope: NDArray[np.int64]) -> _Array:
        return _masked(scope == SCOPE_SURFACE, surface_value(p))

    field.__name__ = surface_value.__name__  # 트레이스백에서 필드 이름이 보이게 한다(서명이 달라 wraps는 쓰지 않는다)
    return field


def _eye_scoped(kind: str) -> Callable[[Callable[[_Array], _Array]], _Field]:
    """안구 스코프(eye-left/right)는 `_eye_rigid` 강체 변위, surface는 마스크 변위, 그 밖은 0."""

    def decorate(surface_value: Callable[[_Array], _Array]) -> _Field:
        surface_field = _surface_only(surface_value)

        def field(p: _Array, scope: NDArray[np.int64]) -> _Array:
            is_left = scope == SCOPE_EYE_LEFT
            is_eye = is_left | (scope == SCOPE_EYE_RIGHT)
            side = np.where(is_left, 1.0, -1.0)  # 안구가 아닌 점의 side는 아래 마스크에서 버려진다
            return np.where(is_eye[:, np.newaxis], _eye_rigid(p, side, kind), surface_field(p, scope))

        field.__name__ = surface_value.__name__
        return field

    return decorate


# ---------------------------------------------------------------------------
# 얼굴 파라미터 15종 ("+" 방향 변위. "-"는 부호 반전)
# ---------------------------------------------------------------------------


@_surface_only
def _face_shape(p: _Array) -> _Array:
    m = _smooth01(-p[:, 1], -0.1, 0.7) * _smooth01(p[:, 2], -0.6, -0.1)
    return _vec3(0.12 * p[:, 0] * m, 0.06 * m * np.maximum(0.0, -p[:, 1]), 0.0)


@_surface_only
def _jaw_width(p: _Array) -> _Array:
    return _vec3(0.15 * _lateral(p[:, 0]) * _near_mirrored(p, _JAW_CORNER, 0.45), 0.0, 0.0)


@_surface_only
def _chin_length(p: _Array) -> _Array:
    # 턱 아래쪽(입선 아래, 입술 높이 아래부터 턱 끝으로 갈수록 커짐)만 움직여 입·윗니·입 안 바닥이 따라 움직이지 않는다
    m = _jaw_mask(p) * _smooth01(-p[:, 1], 0.5, 0.95)
    return _vec3(0.0, -0.15 * m, 0.03 * m)


@_surface_only
def _cheek_volume(p: _Array) -> _Array:
    return _radial(p, 0.1 * _near_mirrored(p, _CHEEK, 0.4))


@_surface_only
def _forehead_param(p: _Array) -> _Array:
    m = _bump(p, _FOREHEAD, 0.55)
    return _vec3(0.0, 0.04 * m, 0.1 * m)


@_eye_scoped("size")
def _eye_size(p: _Array) -> _Array:
    return _scale(p - _eye_center_for(p[:, 0]), 0.2 * _bump_mirrored(p, _EYE, _EYE_MASK_RADIUS))


@_eye_scoped("spacing")
def _eye_spacing(p: _Array) -> _Array:
    return _vec3(0.08 * _lateral(p[:, 0]) * _bump_mirrored(p, _EYE, _EYE_MASK_RADIUS + 0.05), 0.0, 0.0)


@_eye_scoped("tilt")
def _eye_tilt(p: _Array) -> _Array:
    x = p[:, 0]
    m = _bump_mirrored(p, _EYE, _EYE_MASK_RADIUS)
    return _rotation_delta(p, _eye_center_for(x), 2, _side_sign(x) * 0.25 * m * np.abs(_lateral(x, 0.05)))


@_surface_only
def _nose_height(p: _Array) -> _Array:
    return _vec3(0.0, 0.12 * _bump(p, _NOSE_HEIGHT_CENTER, 0.4), 0.0)


@_surface_only
def _nose_width(p: _Array) -> _Array:
    return _vec3(0.1 * _lateral(p[:, 0]) * _bump_mirrored(p, _NOSE_WING, 0.3), 0.0, 0.0)


@_surface_only
def _nose_depth(p: _Array) -> _Array:
    return _vec3(0.0, 0.0, 0.14 * _bump(p, _NOSE_TIP, 0.35))


@_surface_only
def _mouth_width(p: _Array) -> _Array:
    return _vec3(0.1 * _lateral(p[:, 0]) * _near_mirrored(p, _MOUTH_CORNER, 0.22), 0.0, 0.0)


@_surface_only
def _lip_fullness(p: _Array) -> _Array:
    m = _near(p, _MOUTH, 0.25)
    return _vec3(0.0, 0.03 * _lip_sign(p[:, 1]) * m, 0.08 * m)


def _ear_mask_and_base(p: _Array) -> tuple[_Array, _Array]:
    """귀 마스크와 x 부호 쪽 귀 기부 중심 (earSize·earAngle 공통부)."""
    m = _bump_mirrored(p, _EAR_CENTER, _EAR_MASK_RADIUS)
    return m, _vec3(_side_sign(p[:, 0]) * _EAR[0], _EAR[1], _EAR[2])


@_surface_only
def _ear_size(p: _Array) -> _Array:
    m, base = _ear_mask_and_base(p)
    return _scale(p - base, 0.3 * m)


@_surface_only
def _ear_angle(p: _Array) -> _Array:
    m, base = _ear_mask_and_base(p)
    return _rotation_delta(p, base, 1, -_side_sign(p[:, 0]) * 0.3 * m)


# ---------------------------------------------------------------------------
# FACS 16 유닛
# ---------------------------------------------------------------------------


@_surface_only
def _brow_inner_up(p: _Array) -> _Array:
    m = _near_mirrored(p, _BROW_INNER, 0.22)
    return _vec3(0.0, 0.1 * m, 0.01 * m)


@_surface_only
def _brow_outer_up(p: _Array) -> _Array:
    return _vec3(0.0, 0.1 * _near_mirrored(p, _BROW_OUTER, 0.22), 0.0)


@_surface_only
def _brow_down(p: _Array) -> _Array:
    m = _near_mirrored(p, _BROW, 0.3)
    return _vec3(-0.02 * _lateral(p[:, 0]) * m, -0.1 * m, 0.0)


def _blink(side: int) -> _Field:
    """눈 감기: side(+1 왼눈/-1 오른눈) 쪽 x 부호의 표면만 움직이고 정중선 띠(|x| < 0.03)는 제외한다."""
    upper = np.array([side * _UPPER_LID[0], _UPPER_LID[1], _UPPER_LID[2]])
    lower = np.array([side * _LOWER_LID[0], _LOWER_LID[1], _LOWER_LID[2]])

    @_surface_only
    def field(p: _Array) -> _Array:
        x = p[:, 0]
        mu = _near(p, upper, 0.22)
        ml = _near(p, lower, 0.16)
        value = _vec3(0.0, -0.2 * mu + 0.04 * ml, 0.02 * mu)
        return _masked((_side_sign(x) == side) & (np.abs(x) >= 0.03), value)

    return field


@_surface_only
def _eye_wide(p: _Array) -> _Array:
    return _vec3(0.0, 0.08 * _near_mirrored(p, _UPPER_LID, 0.2) + 0.03 * _near_mirrored(p, _BROW, 0.25), 0.0)


@_surface_only
def _eye_squint(p: _Array) -> _Array:
    return _vec3(0.0, 0.07 * _near_mirrored(p, _LOWER_LID, 0.18) - 0.03 * _near_mirrored(p, _UPPER_LID, 0.2), 0.0)


@_surface_only
def _cheek_puff(p: _Array) -> _Array:
    return _radial(p, 0.14 * _near_mirrored(p, _CHEEK_PUFF, 0.4))


@_surface_only
def _nose_sneer(p: _Array) -> _Array:
    return _vec3(0.0, 0.08 * _near_mirrored(p, _NOSE_SNEER_CENTER, 0.22), 0.0)


def _jaw_rigid(p: _Array, scope: NDArray[np.int64], angle: float) -> _Array:
    """치아(입선 아래만)·혀의 강체 턱 회전: jawOpen·mouthFunnel의 teeth/tongue 분기."""
    rigid = ((scope == SCOPE_TEETH) & (p[:, 1] < _MOUTH_Y)) | (scope == SCOPE_TONGUE)
    return _masked(rigid, _jaw_rotation(p, 1.0, angle))


def _jaw_open(p: _Array, scope: NDArray[np.int64]) -> _Array:
    # surface는 턱 마스크로 가중한 회전, 치아·혀는 마스크 없는 강체 회전(전용 처리)
    return _masked(scope == SCOPE_SURFACE, _jaw_rotation(p, _jaw_mask(p))) + _jaw_rigid(p, scope, 0.35)


@_surface_only
def _mouth_smile(p: _Array) -> _Array:
    m = _near_mirrored(p, _MOUTH_CORNER, _MOUTH_CORNER_SIGMA)
    return _vec3(0.06 * _lateral(p[:, 0]) * m, 0.08 * m, -0.02 * m)


@_surface_only
def _mouth_frown(p: _Array) -> _Array:
    m = _near_mirrored(p, _MOUTH_CORNER, _MOUTH_CORNER_SIGMA)
    return _vec3(0.02 * _lateral(p[:, 0]) * m, -0.08 * m, 0.0)


@_surface_only
def _mouth_pucker(p: _Array) -> _Array:
    m = _near(p, _MOUTH, 0.28)
    return _vec3(-0.08 * _lateral(p[:, 0], 0.15) * m, 0.0, 0.1 * m)


def _mouth_funnel(p: _Array, scope: NDArray[np.int64]) -> _Array:
    # surface는 입술 모음 + 약한 턱 회전(0.08), 치아·혀는 같은 각도의 강체 회전(전용 처리)
    m = _near(p, _MOUTH, 0.3)
    surface = _vec3(0.0, 0.06 * _lip_sign(p[:, 1]) * m, 0.1 * m) + _jaw_rotation(p, _jaw_mask(p), 0.08)
    return _masked(scope == SCOPE_SURFACE, surface) + _jaw_rigid(p, scope, 0.08)


@_surface_only
def _mouth_press(p: _Array) -> _Array:
    m = _near(p, _MOUTH, 0.25)
    return _vec3(0.0, -0.03 * _lip_sign(p[:, 1]) * m, -0.04 * m)


def _tongue_out(p: _Array, scope: NDArray[np.int64]) -> _Array:
    # 혀는 위치와 무관한 상수 변위(전용 처리). surface는 입술 가운데만 살짝 움직이고 치아는 0이다.
    surface = _vec3(0.0, 0.04 * _lip_sign(p[:, 1]) * _near(p, _MOUTH, 0.2), 0.0)
    return _masked(scope == SCOPE_SURFACE, surface) + _masked(scope == SCOPE_TONGUE, _TONGUE_OUT_DELTA)


# ---------------------------------------------------------------------------
# followInner 적용과 레지스트리 (TS `followInner`·`innerFollowsSurface`)
# ---------------------------------------------------------------------------


def _inner_follows_surface(field: _Field) -> _Field:
    """치아·혀 스코프를 surface로 바꿔 평가한다(입 안 공동 벽과 같은 필드)."""

    @functools.wraps(field)
    def wrapped(p: _Array, scope: NDArray[np.int64]) -> _Array:
        inner = (scope == SCOPE_TEETH) | (scope == SCOPE_TONGUE)
        return field(p, np.where(inner, SCOPE_SURFACE, scope))

    return wrapped


def _follow_inner(defs: dict[str, _Field], own: tuple[str, ...] = ()) -> dict[str, _Field]:
    return {key: field if key in own else _inner_follows_surface(field) for key, field in defs.items()}


_FACE_PARAM_FIELD_DEFS: dict[str, _Field] = {
    "faceShape": _face_shape,
    "jawWidth": _jaw_width,
    "chinLength": _chin_length,
    "cheekVolume": _cheek_volume,
    "forehead": _forehead_param,
    "eyeSize": _eye_size,
    "eyeSpacing": _eye_spacing,
    "eyeTilt": _eye_tilt,
    "noseHeight": _nose_height,
    "noseWidth": _nose_width,
    "noseDepth": _nose_depth,
    "mouthWidth": _mouth_width,
    "lipFullness": _lip_fullness,
    "earSize": _ear_size,
    "earAngle": _ear_angle,
}

_FACS_FIELD_DEFS: dict[str, _Field] = {
    "browInnerUp": _brow_inner_up,
    "browOuterUp": _brow_outer_up,
    "browDown": _brow_down,
    "eyeBlinkLeft": _blink(1),
    "eyeBlinkRight": _blink(-1),
    "eyeWide": _eye_wide,
    "eyeSquint": _eye_squint,
    "cheekPuff": _cheek_puff,
    "noseSneer": _nose_sneer,
    "jawOpen": _jaw_open,
    "mouthSmile": _mouth_smile,
    "mouthFrown": _mouth_frown,
    "mouthPucker": _mouth_pucker,
    "mouthFunnel": _mouth_funnel,
    "mouthPress": _mouth_press,
    "tongueOut": _tongue_out,
}

if tuple(_FACE_PARAM_FIELD_DEFS) != FACE_PARAM_KEYS or tuple(_FACS_FIELD_DEFS) != FACS_UNITS:
    raise RuntimeError("필드 정의 키가 FACE_PARAM_KEYS·FACS_UNITS와 다릅니다(순서 포함).")

_FACE_PARAM_FIELDS = _follow_inner(_FACE_PARAM_FIELD_DEFS)
#: 턱 열림·입 깔때기·혀 내밀기는 치아·혀 전용 처리가 있어 그대로 둔다.
_FACS_FIELDS = _follow_inner(_FACS_FIELD_DEFS, own=("jawOpen", "mouthFunnel", "tongueOut"))

# ---------------------------------------------------------------------------
# 공개 함수
# ---------------------------------------------------------------------------


def face_param_delta(key: str, points: ArrayLike, scope: int | ArrayLike) -> _Array:
    """얼굴 파라미터 `key`의 "+" 방향 변위(머리 로컬 단위, 단위 반경 공간).

    Args:
        key: `FACE_PARAM_KEYS` 중 하나.
        points: (N,3) float64 머리 로컬 좌표(유한값).
        scope: 정수 하나(전체 적용) 또는 (N,) 정수 배열. `SCOPE_*` 코드.

    Returns:
        (N,3) float64 변위. 해당 스코프에서 움직이지 않는 점은 0이다.
    """
    field = _FACE_PARAM_FIELDS.get(key)
    if field is None:
        raise ValueError(f"알 수 없는 얼굴 파라미터 키: {key!r} (가능: {', '.join(FACE_PARAM_KEYS)})")
    p = _as_points(points)
    return field(p, _as_scopes(scope, p.shape[0]))


def facs_delta(unit: str, points: ArrayLike, scope: int | ArrayLike) -> _Array:
    """FACS 유닛 `unit`의 변위. 인자·반환 규약은 `face_param_delta`와 같다."""
    field = _FACS_FIELDS.get(unit)
    if field is None:
        raise ValueError(f"알 수 없는 FACS 유닛: {unit!r} (가능: {', '.join(FACS_UNITS)})")
    p = _as_points(points)
    return field(p, _as_scopes(scope, p.shape[0]))


def morph_delta(name: str, points: ArrayLike, scope: int | ArrayLike) -> _Array:
    """morph 이름으로 변위를 계산한다.

    `name`은 `param:<키>:+`, `param:<키>:-`, `facs:<유닛>` 형식이다. "-"는 "+"의 부호 반전이다(0은 -0.0이 아니라 0.0).
    체형 파라미터(`param:height:+` 등)는 이 모듈의 범위가 아니므로 거부한다.
    """
    parts = name.split(":")
    if len(parts) == 3 and parts[0] == "param" and parts[2] in ("+", "-"):
        delta = face_param_delta(parts[1], points, scope)
        return delta if parts[2] == "+" else 0.0 - delta  # 0.0 - x: 부호 반전하되 -0.0을 만들지 않는다
    if len(parts) == 2 and parts[0] == "facs":
        return facs_delta(parts[1], points, scope)
    raise ValueError(f"morph 이름 형식이 아닙니다: {name!r} (param:<키>:+|-, facs:<유닛>)")


def jaw_mask_local(points: ArrayLike) -> _Array:
    """턱 마스크(TS `jawMaskLocal`): 입선(`HEAD_LANDMARKS["mouth"][1]`) 아래 1, 위 0, 귀 쪽(뒤)으로 갈수록 0.

    위 입술은 머리, 아래 입술은 턱을 따른다. 점마다 하나의 값이라 (N,3) 점에 대해 (N,) float64를 돌려준다.
    """
    return _jaw_mask(_as_points(points))
