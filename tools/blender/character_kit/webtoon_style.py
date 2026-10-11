"""웹툰풍 얼굴 스타일화: 완성된 베이스의 머리·눈·입·속눈썹·눈썹과 머리 관절 위치를 하나의 매끄러운 변형 필드로 한꺼번에 옮긴다 (numpy).

왜 만든 뒤에 바꾸는가
---------------------
HBM(Human Base Meshes) 머리는 사실 비례다. 한국 웹툰 미형 주인공(`docs/webtoon-style-guide.md`의 L1 레인)은 머리가 작고(7.6~8.6두신) 눈이 사람보다
1.3~1.7배 크며(눈 너비/얼굴 높이 0.21~0.27, 사람 약 0.16) 코는 작은 선이고 턱은 V라인이다. 슬라이더 범위(±1)는 눈 크기 ±20 %뿐이라 웹툰 눈에
닿지 못한다. 그래서 **중립 상태 자체**를 웹툰 쪽으로 옮기고, 슬라이더는 그 둘레에서 움직이게 한다.
`base_assembly`의 얼굴 정합(`fit_head_frame` 등)은 HBM 여성 머리의 좌표 상수에 기대므로 입력 메시를 바꾸지 않고, 베이스를 다 만든 뒤 같은 변형 필드를
모든 머리 부착 메시와 홍채 파츠에 똑같이 적용한다(필드는 위치의 함수라 눈동자·눈꺼풀·속눈썹·눈썹이 서로 어긋나지 않는다).

변형 필드(모두 목 이음매에서 0으로 줄어 몸과 이어진다)
1. 머리 크기: 이음매 중심을 기준으로 머리 전체 배율.
2. 아래 얼굴: 입 높이에서 턱끝으로 갈수록 폭을 줄이고(V라인) 입~턱 길이를 줄인다.
3. 뺨: 광대 아래 뺨을 살짝 깎는다.
4. 눈: 눈 중심 둘레(안쪽 반경 100 %, 바깥 반경 0 %)에서 가로·세로·깊이 배율. 안구 메시도 같은 배율을 받아 눈꺼풀 개구부와 같이 커진다.
5. 코: 코 중심 둘레에서 코뿌리 쪽으로 폭·길이·돌출을 줄인다.
6. 입: 입 중심 둘레에서 폭·두께·돌출을 줄인다.

적용 대상
- 머리 메시(`TS_Head`)의 T-포즈 위치와 A-포즈 위치(머리는 A→T 변환에서 움직이지 않는다), 눈·입 안·속눈썹·눈썹 메시, 리그의 머리 하위 관절.
- 법선은 변형 뒤 다시 계산한다(몸/머리 이음매는 용접 정점 기준으로 같은 값을 지킨다).
morph 델타는 상대 변위라 그대로 둔다(변형 전 기하로 계산돼 머리가 14 % 작아진 만큼 델타가 상대적으로 14 % 커지는 정도의 오차다).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from . import base_assembly as ba
from . import eyes_mouth as em
from . import fields_face as ff
from . import hbm
from .surface import vertex_normals

#: 머리에 붙어 같은 변형을 받는 메시 노드
HEAD_ATTACHED_NODES = ("TS_Head", "TS_Eye_L", "TS_Eye_R", "TS_Mouth", "TS_Lashes", "TS_Brow_L", "TS_Brow_R")
#: 같은 변형을 받는 리그 관절(머리 하위). 목·척추는 몸의 일부라 건드리지 않는다.
HEAD_JOINTS = ("mixamorig:Head", "mixamorig:HeadTop_End", "TS_Jaw", "TS_Eye.L", "TS_Eye.R")


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    """edge0 → edge1에서 0 → 1로 오른다. edge1 < edge0이면 1 → 0으로 내려간다."""
    span = edge1 - edge0
    t = np.clip((np.asarray(x, dtype=np.float64) - edge0) / (span if abs(span) > 1e-12 else 1e-12), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


@dataclass(frozen=True)
class LookStyle:
    """웹툰풍 얼굴·몸 변형의 크기. 값은 `docs/webtoon-style-guide.md`의 관찰 범위(L1 미형 세미리얼)에서 정하고 렌더로 확인한다."""

    id: str
    source_hbm: str | None = None  # 몸·머리 원본 HBM npz(`hbm_<이름>.npz`). None이면 베이스 id와 같다. 미소년은 근육질 HBM 남성 대신 가는 HBM 여성 몸에서 시작한다
    head_scale: float = 1.0  # 머리 전체(목 이음매 기준) 배율. 7.6~8.6두신이 되려면 사실 머리(약 6.9두신)를 12~15 % 줄인다
    layout: tuple[float, float] | None = None  # 정수리~턱 높이에서 눈 중심·입 중심이 위에서 몇 %에 오게 할지 (눈, 입). 사실 얼굴은 (0.47, 0.81)이다. 눈을 아래로, 이마를 길게, 입~턱을 짧게 옮기는 애니 인형 비례. 코는 눈~입 사이에서 같이 움직인다(HBM '코끝' 지표가 해부학 코끝이 아니라 쓰지 않는다)
    target_head: str | None = None  # 얼굴 모양을 따를 목표 흉상(hyper3d_generations.json의 항목 이름, 예: "fig-anime-f"). 베이스 머리를 그 모양으로 옮긴 뒤 아래 변형을 얹는다
    target_strength: float = 1.0  # 목표 모양을 따르는 정도 0~1
    target_iterations: int = 22
    head_width: float = 1.0  # 머리 폭(x)만 따로 줄이는 배율(목 이음매 쪽은 0). 눈 간격이 멀고 얼굴이 넓어 가면처럼 보일 때 쓴다
    eye_scale: tuple[float, float, float] = (1.0, 1.0, 1.0)  # 눈 중심 둘레 가로·세로·깊이 배율
    eye_lift: float = 0.0  # 눈 중심 둘레를 위(+)·아래(−)로 옮기는 양(m)
    eye_falloff: tuple[float, float] = (0.020, 0.044)  # 안쪽 반경(완전 적용)·바깥 반경(0)
    nose_scale: tuple[float, float, float] = (1.0, 1.0, 1.0)  # 코 폭·길이(높이)·돌출 배율(코뿌리 기준)
    mouth_scale: tuple[float, float, float] = (1.0, 1.0, 1.0)  # 입 폭·두께·돌출 배율(입 중심 기준)
    mouth_lift: float = 0.0  # 입꼬리를 위로 올리는 양(m). 사실 중립 입은 꼬리가 처져 화난 듯 보여, 웹툰 중립 표정(살짝 부드러운 입)으로 올린다
    jaw_narrow: float = 0.0  # 턱끝에서 폭을 줄이는 비율(V라인)
    chin_shorten: float = 0.0  # 입~턱끝 길이를 줄이는 비율
    cheek_slim: float = 0.0  # 광대 아래 뺨을 깎는 비율
    iris_radius_m: float = 0.0060  # 홍채 덮개 반지름(변형 전 좌표 기준 m; 변형이 눈을 키우므로 최종은 이 값 × 눈 배율)
    lash_style: str = "strands"  # 속눈썹 텍스처: "strands"(가닥) 또는 "liner"(바깥으로 두꺼워지는 아이라인 띠, 웹툰·애니 눈매)
    brow_thin: float = 0.0  # 눈썹 띠의 두께를 줄이는 비율 0~1(아치는 유지). 사실 눈썹은 굵어 웹툰풍 얼굴에서 화난 듯 보인다
    brow_lift: float = 0.0  # 눈썹을 위로 올리는 양(m). 눈이 커져 눈썹과 가까워진 만큼 눈썹을 띄워 찡그린 인상을 푼다(눈썹 메시만 옮긴다)
    neutral_body: tuple[tuple[str, float], ...] = ()  # 중립 몸에 미리 구워 넣는 체형 가중치(예: ("shoulderWidth", -0.8)). 체형 필드와 관절 위치가 같이 움직인다
    body_smooth_iterations: int = 0  # HBM 몸통·팔·다리 근육 요철을 펴는 Taubin 반복 횟수(0이면 끔). 미소년처럼 매끈한 몸이 필요할 때
    neutral_facs: tuple[tuple[str, float], ...] = ()  # 중립 얼굴에 미리 구워 넣는 표정 가중치(예: ("facs:mouthSmile", 0.4)). 사실 중립 얼굴은 화난 듯 보여 부드러운 중립을 만든다
    face_smooth: float = 0.0  # 얼굴 피부 요철(비순구·광대·콧등 주름)을 펴는 세기 0~1. 사실 머리의 미세한 굴곡이 툰 음영에서 줄무늬 그림자가 된다
    face_smooth_iterations: int = 14
    neck_lift: float = 0.0  # 머리·목 위쪽 전체를 위로 들어 올려 목 기둥을 만드는 양(m). HBM 머리는 턱이 목 앞을 덮고 목이 어깨 판과 바로 이어져 초커·후드 접힘·칼라가 얹힐 자유로운 목이 없다
    neck_lift_range: tuple[float, float] = (1.300, 1.372)  # 들어 올림이 0에서 전체로 오르는 높이 구간(m). 이 아래(어깨·몸통)는 그대로, 위(머리)는 통째로 올라가고 사이의 목은 늘어난다
    neck_lift_width: tuple[float, float] = (0.050, 0.085)  # 들어 올림이 전체에서 0으로 줄어드는 좌우 거리 구간(m). 어깨 끝·팔은 올라가지 않는다(목 기둥 반폭 5 cm 안쪽은 전부 올라간다)
    neck_lift_head: tuple[float, float] = (1.385, 1.425)  # 이 높이 위(턱 각·귀·머리)는 좌우 거리와 상관없이 통째로 올라가 귀가 아래로 늘어나지 않는다
    face_normal_soften: float = 0.0  # 얼굴 정점 법선을 큰 형태(약 2.5 cm 이하 요철을 지운 머리)의 법선 쪽으로 옮기는 세기 0~1. 지오메트리는 그대로 두고 툰 음영 경계선(비순구·광대·관자 곡선)만 지운다
    face_normal_iterations: int = 80  # 큰 형태 법선을 만드는 라플라시안 반복 횟수(많을수록 더 둥근 알 모양)


NONE = LookStyle(id="none")

#: 미소녀(10대 후반~20대 초반 이상화 여성, L1 미형): 작은 머리, 큰 눈, 작은 코·입, V라인 턱
WEBTOON_GIRL = LookStyle(
    id="webtoon-girl",
    layout=(0.54, 0.86),
    head_scale=0.92,
    head_width=0.94,
    eye_scale=(1.50, 1.65, 1.15),
    eye_lift=0.0,
    nose_scale=(0.78, 0.85, 0.55),
    mouth_scale=(0.92, 0.88, 0.90),
    mouth_lift=0.020,
    jaw_narrow=0.20,
    chin_shorten=0.0,
    cheek_slim=0.12,
    iris_radius_m=0.0125,
    brow_thin=0.35,
    brow_lift=-0.006,
    lash_style="liner",
    neutral_body=(("waist", -0.25),),
    neutral_facs=(("facs:mouthSmile", 1.4), ("facs:browOuterUp", 0.20), ("facs:browInnerUp", 0.10)),
    face_smooth=1.0,
    face_smooth_iterations=36,
    face_normal_soften=0.9,
    neck_lift=0.028,
)

#: 미소년(꽃미남, L1 미형): 얼굴 구성은 여성보다 덜 극단적이고 눈은 가로로 길게 크며 코는 가늘고 턱끝은 가늘다. 눈썹은 여성보다 굵게 남긴다.
WEBTOON_BOY = LookStyle(
    id="webtoon-boy",
    source_hbm="female",
    layout=(0.52, 0.84),
    head_scale=0.92,
    head_width=0.95,
    eye_scale=(1.30, 1.36, 1.10),
    eye_lift=0.0,
    nose_scale=(0.85, 0.90, 0.70),
    mouth_scale=(0.95, 0.90, 0.92),
    mouth_lift=0.012,
    jaw_narrow=0.14,
    chin_shorten=0.0,
    cheek_slim=0.08,
    iris_radius_m=0.0108,
    brow_thin=0.25,
    brow_lift=-0.004,
    lash_style="liner",
    neutral_body=(("chestDepth", -2.6), ("shoulderWidth", 0.35), ("hip", -1.2), ("waist", 0.2)),
    body_smooth_iterations=22,
    neutral_facs=(("facs:mouthSmile", 0.9), ("facs:browOuterUp", 0.12)),
    face_smooth=1.0,
    face_smooth_iterations=30,
    face_normal_soften=0.8,
    neck_lift=0.026,
)

STYLES: dict[str, LookStyle] = {style.id: style for style in (NONE, WEBTOON_GIRL, WEBTOON_BOY)}


def resolve_style(style_id: str, override_json: str | None = None) -> LookStyle:
    """스타일 id와 선택적 JSON 덮어쓰기(`LookStyle` 필드 이름: 값, 튜플은 배열)로 스타일을 만든다 — 값을 렌더로 맞출 때 쓴다."""
    import dataclasses
    import json

    style = STYLES[style_id]
    if not override_json:
        return style
    patch = json.loads(override_json)
    fields = {f.name for f in dataclasses.fields(LookStyle)}
    unknown = sorted(set(patch) - fields)
    if unknown:
        raise SystemExit(f"LookStyle에 없는 필드: {unknown}")
    def convert(value):
        return tuple(convert(item) for item in value) if isinstance(value, list) else value

    return dataclasses.replace(style, **{key: convert(value) for key, value in patch.items()})


#: 근육·요철을 펴도 되는 HBM 분할 번호: 가슴·복부·골반, 위팔, 아래팔, 허벅지, 종아리. 머리·손·발·손가락은 윤곽을 지켜야 해서 뺀다.
SMOOTHABLE_SETS = frozenset({1, 19, 18, 20, 21, 11, 12, 23, 24, 15, 16})


def thin_strip(points: np.ndarray, amount: float, bin_width: float = 0.004) -> np.ndarray:
    """눈썹처럼 가는 띠 메시를 두께 방향(y)으로 얇게 한다: 같은 x 구간 정점들의 평균 높이에서 벌어진 만큼을 `amount` 비율로 줄인다(아치는 유지)."""
    out = points.copy()
    bins = np.floor(points[:, 0] / bin_width).astype(np.int64)
    for value in np.unique(bins).tolist():
        mask = bins == value
        mean_y = points[mask, 1].mean()
        out[mask, 1] = mean_y + (points[mask, 1] - mean_y) * (1.0 - amount)
    return out


def smooth_hbm_body(body: hbm.Body, iterations: int) -> int:
    """HBM 몸(A-포즈)의 근육 요철을 Taubin(수축 없는) 평활화로 펴고 평활화한 정점 수를 돌려준다. 머리·손·발과 머리 이음매는 그대로다."""
    if iterations <= 0:
        return 0
    from . import skin

    sets = body.vertex_sets()
    free = np.array([bool(vertex_sets) and vertex_sets <= SMOOTHABLE_SETS for vertex_sets in sets])
    ptr, idx = skin.vertex_adjacency(body.faces, len(body.positions))
    body.positions = skin.taubin_smooth(body.positions, np.flatnonzero(free), ptr, idx, iterations=iterations)
    body.face_center = body.positions[body.faces].mean(axis=1)
    return int(free.sum())


#: 머리·목 높이를 움직이는 체형 키. 빌더의 얼굴 정합 상수가 여성 HBM 머리 좌표라 이 키를 구우면 얼굴이 어긋난다.
HEAD_MOVING_BODY_KEYS = frozenset({"height", "legLength", "neckLength", "headSize"})


def shape_context_body(ctx: ba.Context, style: LookStyle) -> dict[str, Any]:
    """중립 몸에 체형 가중치를 구워 넣는다: T-포즈 위치·A-포즈 위치(같은 변위)·법선·리그 관절. 이후 빌드의 속옷·morph 필드가 모양 바뀐 몸 위에서 계산된다."""
    if not style.neutral_body:
        return {}
    moving = sorted({key for key, _ in style.neutral_body} & HEAD_MOVING_BODY_KEYS)
    if moving:
        raise ValueError(f"neutral_body에 머리를 움직이는 키가 있다: {moving} — 얼굴 정합 상수(입·눈·턱 절대 좌표)가 어긋난다. 몸통·엉덩이·어깨 키만 쓴다.")
    delta = np.zeros_like(ctx.t_pos)
    joint_delta = np.zeros_like(ctx.rig.t_pose)
    for key, weight in style.neutral_body:
        delta += weight * ba.fade_small(ctx.fields.field(key, ctx.t_pos))
        joint_delta += weight * ba.fade_small(ctx.fields.field(key, ctx.rig.t_pose))
    ctx.t_pos = ctx.t_pos + delta
    ctx.body.positions = ctx.body.positions + delta
    ctx.body.face_center = ctx.body.positions[ctx.body.faces].mean(axis=1)
    # 눈 메시(HBM 몸과 별개 배열)도 같은 필드로 옮긴다. 머리를 움직이는 키(legLength·height·neckLength·headSize)를 구우면 얼굴 정합 상수가 어긋나 눈·홍채가 어긋난다.
    for side, (positions, triangles) in list(ctx.body.eyes.items()):
        eye_delta = sum((weight * ba.fade_small(ctx.fields.field(key, positions)) for key, weight in style.neutral_body), np.zeros_like(positions))
        ctx.body.eyes[side] = (positions + eye_delta, triangles)
    for side, (positions, triangles) in list(ctx.body.iris.items()):
        iris_delta = sum((weight * ba.fade_small(ctx.fields.field(key, positions)) for key, weight in style.neutral_body), np.zeros_like(positions))
        ctx.body.iris[side] = (positions + iris_delta, triangles)
    ctx.normals = ba.welded_normals(ctx.t_pos, ctx.quads)
    ctx.rig.t_pose = ctx.rig.t_pose + joint_delta
    ctx.rig.a_pose = ctx.rig.a_pose + joint_delta
    return {"neutralBody": [list(item) for item in style.neutral_body], "maxBodyDeltaMm": round(float(np.abs(delta).max()) * 1000.0, 1)}


@dataclass(frozen=True)
class Landmarks:
    """변형 전 얼굴 지표(glTF 좌표, m). 베이스 메시가 아니라 HBM 분할 번호와 눈 메시에서 읽는다."""

    eye_l: np.ndarray
    eye_r: np.ndarray
    nose_tip: np.ndarray
    mouth: np.ndarray
    chin: np.ndarray
    seam: np.ndarray  # (K,3) 머리/몸 이음매 정점 위치
    crown_y: float = 0.0  # 정수리 높이(m)


def landmarks_from_context(ctx: ba.Context) -> Landmarks:
    """HBM 분할 번호(코·입술·턱 집합)와 눈 메시에서 지표를 읽는다(여성·남성 공통, 하드코딩 좌표 없음)."""
    body = ctx.body
    p = ctx.t_pos

    def set_vertices(set_id: int) -> np.ndarray:
        return np.unique(body.faces[body.face_set == set_id].ravel())

    eye_l, _ = em.fit_sphere(body.eyes["L"][0])
    eye_r, _ = em.fit_sphere(body.eyes["R"][0])
    nose = set_vertices(hbm.NOSE_SET)
    nose_mid = nose[np.abs(p[nose, 0]) < 0.006]
    nose_tip = p[nose_mid[np.argmax(p[nose_mid, 2])]]
    lips = p[set_vertices(hbm.LIP_SET)]
    mouth = np.array([0.0, float(lips[:, 1].mean()), float(lips[np.abs(lips[:, 0]) < 0.01, 2].mean())])
    jaw = set_vertices(hbm.JAW_SET)
    jaw_mid = jaw[np.abs(p[jaw, 0]) < 0.004]
    chin = p[jaw_mid[np.argmin(p[jaw_mid, 1])]]
    head_vertices = np.unique(ctx.quads[ctx.head_mask].ravel())
    return Landmarks(eye_l=np.asarray(eye_l), eye_r=np.asarray(eye_r), nose_tip=nose_tip, mouth=mouth, chin=chin, seam=p[ctx.seam], crown_y=float(p[head_vertices][:, 1].max()))


def registration_for_context(ctx: ba.Context, style: LookStyle):
    """HBM 머리 정점(변형 전)을 목표 흉상 얼굴 모양으로 옮기는 `FaceRegistration`을 만든다. 베이스 빌더와 홍채 빌더가 같은 결과를 얻도록 `ctx` 의 HBM 머리만 쓴다."""
    if not style.target_head:
        return None
    import json
    from pathlib import Path

    from . import face_register

    ledger = json.loads((Path(__file__).resolve().parent / "hyper3d_generations.json").read_text(encoding="utf-8"))
    entry = next((item for item in ledger["entries"] if item["name"] == style.target_head), None)
    if entry is None or "rawFile" not in entry:
        raise SystemExit(f"목표 흉상 {style.target_head}이(가) hyper3d_generations.json에 없거나 원본(rawFile)이 없다")
    raw = Path.home() / ".cache" / "toonstudio-kit" / "hyper3d-raw" / entry["rawFile"]
    target_positions, target_triangles = face_register.load_target(raw)
    head_vertices = np.unique(ctx.quads[ctx.head_mask].ravel())
    remap = np.full(len(ctx.t_pos), -1, dtype=np.int64)
    remap[head_vertices] = np.arange(len(head_vertices))
    quads = remap[ctx.quads[ctx.head_mask]]
    triangles = np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]])
    positions = ctx.t_pos[head_vertices]
    mask = ff.seam_taper(positions, ctx.t_pos[ctx.seam], fade_start=0.015, fade_end=0.06)
    registration = face_register.FaceRegistration(positions, triangles, mask, target_positions, target_triangles, strength=style.target_strength, iterations=style.target_iterations)
    return registration


def displaced_landmarks(marks: "Landmarks", registration) -> "Landmarks":
    """정합 변위를 받은 얼굴 지표(눈·코·입·턱)."""
    if registration is None:
        return marks
    moved = registration.apply(np.stack([marks.eye_l, marks.eye_r, marks.nose_tip, marks.mouth, marks.chin]))
    return Landmarks(eye_l=moved[0], eye_r=moved[1], nose_tip=moved[2], mouth=moved[3], chin=moved[4], seam=marks.seam, crown_y=marks.crown_y)


class StyleField:
    """위치 → 변형된 위치. 목 이음매에서 멀어질수록 커지는 마스크를 곱해 몸과 이어지게 한다."""

    def __init__(self, landmarks: Landmarks, style: LookStyle):
        self.landmarks = landmarks
        self.style = style
        self.pivot = np.array([0.0, float(landmarks.seam[:, 1].mean()), float(landmarks.seam[:, 2].mean())])

    def seam_mask(self, points: np.ndarray) -> np.ndarray:
        return ff.seam_taper(points, self.landmarks.seam, fade_start=0.010, fade_end=0.050)

    def _layout(self, points: np.ndarray, crown_y: float) -> np.ndarray:
        """높이(y)를 구간별 선형으로 늘이고 줄여 눈·입이 `layout` 비율에 오게 한다(턱끝·정수리 높이는 그대로, 코는 눈~입 사이에서 같이 움직인다). 가로·깊이는 건드리지 않고 목 이음매 쪽은 마스크로 0."""
        layout = self.style.layout
        if layout is None:
            return points
        marks = self.landmarks
        eye_y = 0.5 * (marks.eye_l[1] + marks.eye_r[1])
        height = crown_y - marks.chin[1]
        src = np.array([marks.chin[1], marks.mouth[1], eye_y, crown_y])
        dst = np.array([marks.chin[1], crown_y - layout[1] * height, crown_y - layout[0] * height, crown_y])
        warped = np.interp(points[:, 1], src, dst)
        warped = np.where(points[:, 1] < src[0], points[:, 1] + (dst[0] - src[0]), warped)
        out = points.copy()
        out[:, 1] = points[:, 1] + (warped - points[:, 1]) * self.seam_mask(points)
        return out

    def _head_scale(self, points: np.ndarray) -> np.ndarray:
        scale = self.style.head_scale
        width = self.style.head_width
        if scale == 1.0 and width == 1.0:
            return points
        mask = self.seam_mask(points)
        out = points + (mask * (scale - 1.0))[:, None] * (points - self.pivot)
        if width != 1.0:
            out[:, 0] = out[:, 0] * (1.0 + (width - 1.0) * mask)
        return out

    def _lower_face(self, points: np.ndarray, mouth_y: float, chin_y: float) -> np.ndarray:
        style = self.style
        if style.jaw_narrow == 0.0 and style.chin_shorten == 0.0:
            return points
        span = max(mouth_y - chin_y, 1e-6) + 0.012
        u = np.clip((mouth_y + 0.012 - points[:, 1]) / span, 0.0, 1.0)
        taper = smoothstep(0.0, 1.0, u) * self.seam_mask(points)
        out = points.copy()
        out[:, 0] = points[:, 0] * (1.0 - style.jaw_narrow * taper)
        out[:, 1] = points[:, 1] + style.chin_shorten * taper * (mouth_y - points[:, 1])
        return out

    def _cheeks(self, points: np.ndarray, nose_y: float, mouth_y: float) -> np.ndarray:
        if self.style.cheek_slim == 0.0:
            return points
        band = smoothstep(nose_y + 0.02, nose_y - 0.005, points[:, 1]) * smoothstep(mouth_y - 0.03, mouth_y, points[:, 1])
        side = smoothstep(0.02, 0.05, np.abs(points[:, 0]))
        out = points.copy()
        out[:, 0] = points[:, 0] * (1.0 - self.style.cheek_slim * band * side * self.seam_mask(points))
        return out

    def _eye(self, points: np.ndarray, center: np.ndarray) -> np.ndarray:
        kx, ky, kz = self.style.eye_scale
        inner, outer = self.style.eye_falloff
        rel = points - center
        weight = 1.0 - smoothstep(inner, outer, np.linalg.norm(rel, axis=1))
        displacement = np.stack([(kx - 1.0) * rel[:, 0], (ky - 1.0) * rel[:, 1] + self.style.eye_lift, (kz - 1.0) * rel[:, 2]], axis=1)
        return points + weight[:, None] * displacement

    def _nose(self, points: np.ndarray, tip: np.ndarray, root: np.ndarray) -> np.ndarray:
        sx, sy, sz = self.style.nose_scale
        center = tip + np.array([0.0, 0.012, -0.012])
        weight = 1.0 - smoothstep(0.014, 0.034, np.linalg.norm(points - center, axis=1))
        rel = points - root
        displacement = np.stack([(sx - 1.0) * rel[:, 0], (sy - 1.0) * rel[:, 1], (sz - 1.0) * rel[:, 2]], axis=1)
        return points + weight[:, None] * displacement

    def _mouth(self, points: np.ndarray, center: np.ndarray) -> np.ndarray:
        sx, sy, sz = self.style.mouth_scale
        weight = 1.0 - smoothstep(0.022, 0.044, np.linalg.norm(points - center, axis=1))
        rel = points - center
        corner = smoothstep(0.006, 0.024, np.abs(rel[:, 0]))
        displacement = np.stack([(sx - 1.0) * rel[:, 0], (sy - 1.0) * rel[:, 1] + self.style.mouth_lift * corner, (sz - 1.0) * rel[:, 2]], axis=1)
        return points + weight[:, None] * displacement

    def apply(self, points: np.ndarray) -> np.ndarray:
        """점 (N,3)을 변형한다. 지표는 머리 크기 변형을 먼저 받아 그 위에서 나머지 변형이 이어진다."""
        style = self.style
        if style is NONE or style.id == "none":
            return np.asarray(points, dtype=np.float64).copy()
        marks = self.landmarks
        crown = marks.crown_y
        # 얼굴 구성(눈·코·입 높이) 워프 → 머리 크기 변형을 받은 지표
        laid = self._layout(np.stack([marks.eye_l, marks.eye_r, marks.nose_tip, marks.mouth, marks.chin]), crown)
        shrunk = self._head_scale(laid)
        eye_l, eye_r, tip, mouth, chin = shrunk
        root = np.array([0.0, 0.5 * (eye_l[1] + eye_r[1]) - 0.004, tip[2] - 0.02])
        out = self._head_scale(self._layout(np.asarray(points, dtype=np.float64), crown))
        out = self._lower_face(out, float(mouth[1]), float(chin[1]))
        out = self._cheeks(out, float(tip[1]), float(mouth[1]))
        out = self._eye(out, eye_l)
        out = self._eye(out, eye_r)
        out = self._nose(out, tip, root)
        out = self._mouth(out, mouth)
        return out


#: 분할 번호별 평활화 세기(얼굴 요철을 펴되 눈·입 윤곽은 지킨다)
SMOOTH_STRENGTH_BY_SET = {17: 0.9, 22: 0.85, 7: 0.55, 4: 0.2, 5: 0.2, 8: 0.1, 2: 0.15, 3: 0.15}


def smooth_strength(ctx: ba.Context, head: ba.Prim) -> np.ndarray:
    """용접 정점(`origin`)마다 평활화 세기(0~1). HBM 분할 번호 → 세기, 이음매는 0, 경계는 이웃 평균으로 부드럽게 잇는다.
    UV 이음매로 갈라진 복제 정점은 같은 값을 가져야 갈라지지 않으므로 용접 번호 기준 배열 `(origin.max()+1,)`을 돌려준다."""
    sets = ctx.body.vertex_sets()
    count = int(head.origin.max()) + 1
    strength = np.zeros(count)
    for origin in np.unique(head.origin).tolist():
        values = [SMOOTH_STRENGTH_BY_SET[s] for s in sets[origin] if s in SMOOTH_STRENGTH_BY_SET]
        # 눈·입·귀에 닿은 정점은 윤곽을 지키려고 가장 낮은 값을 쓴다
        strength[origin] = min(values) if values else 0.0
    seam = np.zeros(count, dtype=bool)
    seam[np.intersect1d(head.origin, ctx.seam)] = True
    strength[seam] = 0.0
    welded_triangles = head.origin[head.triangles]
    edges = np.unique(np.sort(np.concatenate([welded_triangles[:, [0, 1]], welded_triangles[:, [1, 2]], welded_triangles[:, [2, 0]]]), axis=1), axis=0)
    degree = np.zeros(count)
    np.add.at(degree, edges[:, 0], 1.0)
    np.add.at(degree, edges[:, 1], 1.0)
    for _ in range(3):
        total = np.zeros_like(strength)
        np.add.at(total, edges[:, 0], strength[edges[:, 1]])
        np.add.at(total, edges[:, 1], strength[edges[:, 0]])
        strength = 0.5 * strength + 0.5 * total / np.maximum(degree, 1.0)
    strength[seam] = 0.0
    return strength


def weighted_taubin(positions: np.ndarray, triangles: np.ndarray, strength: np.ndarray, iterations: int, lam: float = 0.5, mu: float = -0.53) -> np.ndarray:
    """정점마다 다른 세기(`strength`, 정점 수와 같은 길이)로 Taubin(수축 없는) 라플라시안 평활화한다. 삼각형은 같은 정점 번호 체계여야 한다."""
    edges = np.unique(np.sort(np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]]), axis=1), axis=0)
    degree = np.zeros(len(positions))
    np.add.at(degree, edges[:, 0], 1.0)
    np.add.at(degree, edges[:, 1], 1.0)
    degree = np.maximum(degree, 1.0)[:, None]
    out = positions.copy()
    for step in range(iterations * 2):
        factor = lam if step % 2 == 0 else mu
        total = np.zeros_like(out)
        np.add.at(total, edges[:, 0], out[edges[:, 1]])
        np.add.at(total, edges[:, 1], out[edges[:, 0]])
        out += (strength * factor)[:, None] * (total / degree - out)
    return out


def restyle_build(build: ba.BaseBuild, style: LookStyle) -> dict[str, Any]:
    """완성된 베이스(`build_base` 결과)의 머리 부착 메시와 머리 관절을 스타일 필드로 옮기고 법선을 다시 계산한다. 보고를 돌려준다."""
    if style.id == "none":
        return {"style": "none"}
    ctx = build.ctx
    registration = registration_for_context(ctx, style)
    field = StyleField(displaced_landmarks(landmarks_from_context(ctx), registration), style)
    by_name = {mesh.name: mesh for mesh in build.meshes}
    before_height = float(np.concatenate([by_name["TS_Body"].prims[0].positions, by_name["TS_Head"].prims[0].positions])[:, 1].max())
    moved_vertices = 0
    for name in HEAD_ATTACHED_NODES:
        for prim in by_name[name].prims:
            if registration is not None:
                # 목표 얼굴 모양 정합(변형 전 HBM 기하 기준 변위). 머리는 A-포즈 위치에도 같은 변위를 준다.
                shift = registration.offset(prim.positions)
                prim.positions = prim.positions + shift
                if prim.apose is not None:
                    prim.apose = prim.apose + shift
            # 표정 가중치는 변형 전 기하에 얹는다(델타가 그 기하로 계산됐다). 머리는 A-포즈 위치에도 같은 변위를 준다.
            baked = np.zeros_like(prim.positions)
            for facs_name, weight in style.neutral_facs:
                if facs_name in prim.morphs:
                    baked += weight * prim.morphs[facs_name].astype(np.float64)
            if baked.any():
                prim.positions = prim.positions + baked
                if prim.apose is not None:
                    prim.apose = prim.apose + baked
            prim.positions = field.apply(prim.positions)
            if prim.apose is not None:
                prim.apose = field.apply(prim.apose)
            moved_vertices += len(prim.positions)
    if style.brow_thin > 0.0 or style.brow_lift:
        for name in ("TS_Brow_L", "TS_Brow_R"):
            for prim in by_name[name].prims:
                if style.brow_thin > 0.0:
                    thinned = thin_strip(prim.positions, style.brow_thin)
                    if prim.apose is not None:
                        prim.apose = prim.apose + (thinned - prim.positions)
                    prim.positions = thinned
                if style.brow_lift:
                    prim.positions = prim.positions + np.array([0.0, style.brow_lift, 0.0])
                    if prim.apose is not None:
                        prim.apose = prim.apose + np.array([0.0, style.brow_lift, 0.0])
    if style.face_smooth > 0.0:
        head = by_name["TS_Head"].prims[0]
        # 용접 정점(origin) 기준으로 평활화해야 UV 이음매로 갈라진 복제 정점이 같이 움직인다(따로 움직이면 이음매에 틈이 벌어진다).
        count = int(head.origin.max()) + 1
        welded = np.zeros((count, 3))
        welded[head.origin] = head.positions
        smoothed_welded = weighted_taubin(welded, head.origin[head.triangles], smooth_strength(ctx, head) * style.face_smooth, style.face_smooth_iterations)
        smoothed = smoothed_welded[head.origin]
        if head.apose is not None:
            head.apose = head.apose + (smoothed - head.positions)  # 머리는 A→T에서 움직이지 않으므로 같은 변위를 준다
        head.positions = smoothed
    for joint_name in HEAD_JOINTS:
        if joint_name in ctx.names:
            index = ctx.names.index(joint_name)
            if registration is not None:
                ctx.rig.t_pose[index] = registration.apply(ctx.rig.t_pose[index][None, :])[0]
                ctx.rig.a_pose[index] = registration.apply(ctx.rig.a_pose[index][None, :])[0]
            ctx.rig.t_pose[index] = field.apply(ctx.rig.t_pose[index][None, :])[0]
            ctx.rig.a_pose[index] = field.apply(ctx.rig.a_pose[index][None, :])[0]
    if style.neck_lift:
        lift_build(build, style)
    snap_brows_to_head(by_name)
    _recompute_normals(by_name)
    if style.face_normal_soften > 0.0:
        head = by_name["TS_Head"].prims[0]
        count = int(head.origin.max()) + 1
        welded = np.zeros((count, 3))
        welded[head.origin] = head.positions
        welded_normals = np.zeros((count, 3))
        welded_normals[head.origin] = head.normals
        welded_normals = softened_face_normals(welded, head.origin[head.triangles], welded_normals, smooth_strength(ctx, head), style.face_normal_soften, style.face_normal_iterations)
        head.normals = welded_normals[head.origin]
    after_height = float(np.concatenate([by_name["TS_Body"].prims[0].positions, by_name["TS_Head"].prims[0].positions])[:, 1].max())
    return {
        "style": style.id,
        "headTopBeforeM": round(before_height, 4),
        "headTopAfterM": round(after_height, 4),
        "movedVertices": moved_vertices,
        "registration": None if registration is None else {"target": style.target_head, **registration.report},
    }


def laplacian_smooth_welded(positions: np.ndarray, triangles: np.ndarray, strength: np.ndarray, iterations: int, lam: float = 0.5) -> np.ndarray:
    """정점마다 다른 세기로 수축하는 라플라시안 평활화(Taubin과 달리 되돌리지 않는다). 큰 형태의 법선을 얻는 용도라 수축은 상관없다."""
    edges = np.unique(np.sort(np.concatenate([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]]), axis=1), axis=0)
    degree = np.zeros(len(positions))
    np.add.at(degree, edges[:, 0], 1.0)
    np.add.at(degree, edges[:, 1], 1.0)
    degree = np.maximum(degree, 1.0)[:, None]
    out = positions.copy()
    for _ in range(iterations):
        total = np.zeros_like(out)
        np.add.at(total, edges[:, 0], out[edges[:, 1]])
        np.add.at(total, edges[:, 1], out[edges[:, 0]])
        out += (strength * lam)[:, None] * (total / degree - out)
    return out


def softened_face_normals(welded: np.ndarray, triangles: np.ndarray, normals: np.ndarray, strength: np.ndarray, amount: float, iterations: int) -> np.ndarray:
    """얼굴 용접 정점 법선(`normals`)을, 머리를 크게 평활화한 복사본의 법선과 `amount × strength` 비율로 섞는다(단위 길이).

    세기 0인 정점(목 이음매·눈·입·귀 가장자리)은 원래 법선을 지켜 몸 법선과의 연속성과 눈매·입선을 잃지 않는다.
    """
    if amount <= 0.0 or iterations <= 0:
        return normals
    reference = laplacian_smooth_welded(welded, triangles, (strength > 0.0).astype(np.float64), iterations)
    low = vertex_normals(reference, triangles)
    weight = (amount * np.clip(strength / 0.9, 0.0, 1.0))[:, None]
    blended = (1.0 - weight) * normals + weight * low
    return blended / np.maximum(np.linalg.norm(blended, axis=1, keepdims=True), 1e-12)


def neck_lift_offset(positions: np.ndarray, style: LookStyle) -> np.ndarray:
    """T-포즈 위치 (N,3)에서 `neck_lift` 변위 (N,) — 높이 구간에서 0→전체로 오르고 목에서 멀어지면 0으로 줄어든다."""
    y0, y1 = style.neck_lift_range
    x0, x1 = style.neck_lift_width
    h0, h1 = style.neck_lift_head
    lateral = smoothstep(x0, x1, np.abs(positions[:, 0])) * (1.0 - smoothstep(h0, h1, positions[:, 1]))
    return style.neck_lift * smoothstep(y0, y1, positions[:, 1]) * (1.0 - lateral)


def lift_build(build: ba.BaseBuild, style: LookStyle) -> None:
    """모든 메시(T·A-포즈 같은 변위)와 리그 관절을 `neck_lift`만큼 올린다. morph 델타는 상대값이라 그대로다."""
    ctx = build.ctx
    for mesh in build.meshes:
        for prim in mesh.prims:
            shift = np.zeros_like(prim.positions)
            shift[:, 1] = neck_lift_offset(prim.positions, style)
            prim.positions = prim.positions + shift
            if prim.apose is not None:
                prim.apose = prim.apose + shift
    joint_shift = np.zeros_like(ctx.rig.t_pose)
    joint_shift[:, 1] = neck_lift_offset(ctx.rig.t_pose, style)
    ctx.rig.t_pose = ctx.rig.t_pose + joint_shift
    ctx.rig.a_pose = ctx.rig.a_pose + joint_shift


#: 눈썹 띠를 머리 표면 위로 띄우는 거리(m). 깊이 버퍼 다툼과 외곽선 셸에 묻히지 않을 만큼이다
BROW_OFFSET_M = 0.0007


def snap_brows_to_head(by_name: dict[str, ba.MeshNode]) -> None:
    """얼굴 평활화·눈썹 올림이 끝난 뒤 눈썹 띠 정점을 머리 표면 위 `BROW_OFFSET_M`로 다시 붙인다.

    띠는 평활화 전 머리 표면 위 0.4 mm에 투영돼 있어, 평활화와 올림 뒤에는 일부가 피부 속에 묻혀 점선처럼 보였다.
    """
    from .surface import Surface

    head = by_name["TS_Head"].prims[0]
    surface = Surface(head.positions, head.triangles)
    for name in ("TS_Brow_L", "TS_Brow_R"):
        for prim in by_name[name].prims:
            hits = surface.closest(prim.positions, max_distance=0.02)
            found = hits.triangle >= 0
            snapped = prim.positions.copy()
            snapped[found] = hits.point[found] + BROW_OFFSET_M * hits.normal[found]
            if prim.apose is not None:
                prim.apose = prim.apose + (snapped - prim.positions)
            prim.positions = snapped


def _recompute_normals(by_name: dict[str, ba.MeshNode]) -> None:
    """변형한 메시의 법선을 다시 계산한다. 몸/머리는 용접 정점(origin) 기준으로 같은 값을 지켜 이음매에 틈이 안 보이게 한다."""
    body = by_name["TS_Body"].prims[0]
    head = by_name["TS_Head"].prims[0]
    count = int(max(body.origin.max(), head.origin.max())) + 1
    welded = np.zeros((count, 3))
    welded[body.origin] = body.positions
    welded[head.origin] = head.positions
    triangles = np.concatenate([body.origin[body.triangles], head.origin[head.triangles]])
    normals = vertex_normals(welded, triangles)
    body.normals = normals[body.origin]
    head.normals = normals[head.origin]
    for name in HEAD_ATTACHED_NODES:
        if name == "TS_Head":
            continue
        for prim in by_name[name].prims:
            prim.normals = vertex_normals(prim.positions, prim.triangles)


def style_iris_nodes(ctx: ba.Context, nodes: list[ba.MeshNode], style: LookStyle) -> None:
    """홍채 파츠(`TS_Iris`·`TS_Highlight`)의 위치를 같은 필드로 옮기고 법선을 다시 계산한다."""
    if style.id == "none":
        return
    registration = registration_for_context(ctx, style)
    field = StyleField(displaced_landmarks(landmarks_from_context(ctx), registration), style)
    for node in nodes:
        for prim in node.prims:
            if registration is not None:
                prim.positions = registration.apply(prim.positions)
            prim.positions = field.apply(prim.positions)
            if style.neck_lift:
                prim.positions = prim.positions + np.column_stack([np.zeros(len(prim.positions)), neck_lift_offset(prim.positions, style), np.zeros(len(prim.positions))])
            prim.normals = vertex_normals(prim.positions, prim.triangles)
