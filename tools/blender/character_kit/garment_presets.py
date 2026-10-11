"""Hyper3D 생성 의상·헤어·소품의 프리셋 표 (리타깃 입력).

`build_parts.py`가 이 표를 읽어 정리·축소된 Rodin 메시를 키트 파츠 GLB로 만든다. 값은 2026-10-11 파일럿(티셔츠·청바지·스니커즈·보브 헤어)과
2차 배치(셔츠·후디·슬랙스·반바지·로퍼·캡·헤드폰)의 육안·수치 확인에서 정했고, 새 프리셋은 같은 형식으로 더한다.

공통 필드
- `slot`/`name`/`role`/`nodes`/`material`: 키트 계약의 파츠 규칙(`authored-kit-spec.md` 3.5절). 헤어 `nodes`는 LOD 순서다.
- `morph_scope`: `body`(체형 9키± = 18개: 상의·하의·신발) 또는 `head`(머리 부착 4키± = 8개: 헤어·소품). 계약 `KIT_MORPH_COVERAGE`와 같다.
- `decimate`: LOD별 목표 삼각형 수(상의·하의 ≤ 25k, 신발 ≤ 8k, 소품 ≤ 6k, 헤어 LOD0 ≤ 20k, 파츠 GLB ≤ 1.5 MiB가 실제 한도).
- `pose`: 의상이 만들어진 포즈 `t`(몸 T-포즈 표면에 바로 맞춤) 또는 `a`(A-포즈 몸에 맞춘 뒤 T로 변환). 포즈가 다른 몸에 맞추면 소매가 날개처럼 펼쳐진다.
- `uv`·`scalp_cap`(헤어): `uv="strands"`는 정점을 위치로 합치고 원통 UV + 세로 가닥 줄무늬 텍스처를 새로 만든다(원본 UV 섬이 잘게 쪼개져 용량 한도를 넘었다).
  `scalp_cap`은 머리 윗부분을 4.5 mm 바깥에서 떠 낸 얇은 두피 덮개를 헤어 메시에 붙여 가닥 사이로 피부가 비치는 것을 막는다(`retarget_garment.build_scalp_cap`).
- `normal_transfer`(헤어 0.85·상의 0.6·하의 0.4): 정점 법선을 가장 가까운 몸·머리 표면 법선 쪽으로 옮기는 비율 0~1. 신발·소품은 형태 자체가 디자인이라 쓰지 않는다. 가닥 시트의 제각각인 법선이 툰 음영에서 검은 반점이 되는 것을 막고 두피를 따라 둥글게 음영이 지게 한다(`retarget_garment.transferred_normals`).
- `stylize`: Taubin 스무딩 반복 횟수(웹툰풍 정리: 사진식 잔주름을 지우고 큰 면과 부드러운 접힘만 남긴다, 0이면 끔).
- `align`: `icp`(평균 거리 최소화 — 몸에 밀착한 옷만), `frame`(**전신 인물**에서 BANG으로 분리한 파츠: 전신 경계 상자 정렬 + `fit_region` 부위만 부호 거리 ICP 보정. 옷만 요청해 마네킹 몸 일부가 같이 나온 생성물은 경계 상자가 사람 키가 아니라 `icp`를 쓴다), `hair`(머리 너비·정수리), `head_ref`(같은 좌표계 머리 메시 `source.ref`의 두개골 폭·정수리·중심에 맞춤 — 흉상에서 BANG으로 분리한 헤어),
  `shoes`(발 길이·발바닥), `head_prop`(머리에 얹는 소품: 머리 너비·정수리). 부피가 있는 의상은 평균 거리 정렬이 몸 쪽으로 쪼그라드므로 `icp`는 몸에 붙는 옷에만 쓴다.
- `bang_target_y`(헤어): 앞머리 아랫선을 이 높이(m, 베이스 눈썹 1.55~1.57·눈 1.52~1.54) 위로 올린다. None이면 건드리지 않는다.
- `fit_region`(`frame` 전용): `top_band`(파츠 맨 위에서 이 높이(m) 안의 정점만 맞춤에 쓴다)·`x_max`(중심에서 이 폭 안)·`standoff`(몸에서 뜨는 전형적 간격)·`shift`(기준점이 움직일 수 있는 최대 거리)·`scale`(키 비율 기준 허용 배율 구간).
- `d_min`/`d_max`/`d_max_open`: 몸 표면 기준 부호 거리(m)의 하한/상한/열린 가장자리 상한. 속옷 셸(몸 위 약 3 mm)을 가리도록 의상은 d_min을 8 mm로 둔다.
- `texture`: `garment_texture.TextureStyle` 인자(`strength`가 클수록 디테일이 진하다. 헤어는 계약상 0.55~1.0 회색이고 512²로 낸다 — 파츠 한도 1.5 MiB).
- `merge_joints`: 스킨에서 합칠 joint(턱 본이 헤어·귀 근처 소품에 번지지 않게 머리 본으로 합친다).
- `source`: `{raw, pick, clean[, ref]}` — `hyper3d_generations.json`의 항목 이름(`raw`), BANG 산출물에서 고를 메시(`pick`, 쉼표 목록이면 합친다), 정리 규칙(`clean`), `head_ref` 정렬이 기준으로 삼을 머리 메시(`ref`).
- `base_overrides`: `{"male": {...}}` — 그 베이스를 빌드할 때만 프리셋 필드(`source`·`lods`·`fit_region`·`anchor` 등)를 덮어쓴다(남성 전용 헤어·의상). `effective_spec(preset_id, base_id)`가 합친 사본을 돌려준다.
- `changesKo`: kit.json provenance의 한글 변경 내용.
"""

from __future__ import annotations

from typing import Any

BODY_MORPH_KEYS = ("height", "legLength", "armLength", "shoulderWidth", "neckLength", "headSize", "hip", "waist", "chestDepth")
HEAD_ATTACHED_MORPH_KEYS = ("height", "legLength", "neckLength", "headSize")


def morph_names(scope: str) -> list[str]:
    keys = BODY_MORPH_KEYS if scope == "body" else HEAD_ATTACHED_MORPH_KEYS
    return [f"param:{key}:{sign}" for key in keys for sign in ("+", "-")]


_JAW_TO_HEAD = {"TS_Jaw": "mixamorig:Head"}


def _top(name: str, *, source: dict[str, Any], pose: str, align: str, changes: str, decimate: int = 6500, strength: float = 0.28, stylize: int = 8, **extra: Any) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "slot": "top",
        "name": name,
        "role": "top",
        "nodes": [f"TS_Top_{name}"],
        "material": f"ts_top_{name}",
        "morph_scope": "body",
        "decimate": [decimate],
        "pose": pose,
        "stylize": stylize,
        "align": align,
        "d_min": 0.008,
        "d_max": 0.045,
        "d_max_open": 0.060,
        "hem_standoff": {"d_min": 0.034, "above": 0.03, "blend": 0.08},
        "fit_region": {"top_band": 0.28, "x_max": 0.19, "standoff": 0.02, "shift": 0.12, "scale": (0.92, 1.08)},
        "texture": {"strength": strength, "blur_radius": 1.2, "bands": 0},
        "normal_transfer": 0.6,
        "merge_joints": {},
        "double_sided": True,
        "source": source,
        "changesKo": changes,
    }
    spec.update(extra)
    return spec


def _bottom(name: str, *, source: dict[str, Any], pose: str, align: str, changes: str, decimate: int = 6500, strength: float = 0.30, stylize: int = 8, **extra: Any) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "slot": "bottom",
        "name": name,
        "role": "bottom",
        "nodes": [f"TS_Bottom_{name}"],
        "material": f"ts_bottom_{name}",
        "morph_scope": "body",
        "decimate": [decimate],
        "pose": pose,
        "stylize": stylize,
        "align": align,
        "d_min": 0.008,
        "d_max": 0.030,
        "d_max_open": 0.060,
        "fit_region": {"top_band": 0.14, "standoff": 0.02, "shift": 0.10, "scale": (0.92, 1.08)},
        "texture": {"strength": strength, "blur_radius": 1.4, "bands": 0},
        "normal_transfer": 0.4,
        "merge_joints": {},
        "double_sided": True,
        "source": source,
        "changesKo": changes,
    }
    spec.update(extra)
    return spec


def _shoes(name: str, *, source: dict[str, Any], changes: str, decimate: int = 5000) -> dict[str, Any]:
    return {
        "slot": "shoes",
        "name": name,
        "role": "shoes",
        "nodes": [f"TS_Shoes_{name}"],
        "material": f"ts_shoes_{name}",
        "morph_scope": "body",
        "decimate": [decimate],
        "pose": "t",
        "stylize": 2,
        "align": "shoes",
        "d_min": 0.003,
        "d_max": 1.0e9,
        "texture": {"strength": 0.30, "blur_radius": 1.0, "bands": 0},
        "merge_joints": {},
        "double_sided": True,
        "source": source,
        "changesKo": changes,
    }


def _hair(name: str, *, source: dict[str, Any], changes: str, lods: tuple[int, int, int] = (7000, 3500, 1800), stylize: int = 3, align: str = "hair", bang_target_y: float | None = None, **extra: Any) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "slot": "hair",
        "name": name,
        "role": "hair",
        "nodes": [f"TS_AuthoredHair_{name}_LOD{index}" for index in range(len(lods))],
        "material": f"ts_hair_{name}",
        "morph_scope": "head",
        "decimate": list(lods),
        "pose": "t",
        "stylize": stylize,
        "align": align,
        "d_min": 0.006,
        "d_max": 1.0e9,
        "fit_region": {"top_band": 0.10, "standoff": 0.012, "shift": 0.10, "scale": (0.85, 1.15)},
        "bang_target_y": bang_target_y,
        "texture": {"strength": 0.20, "blur_radius": 0.8, "bands": 0, "gamma": 0.65, "size": 512},
        "uv": "strands",
        "scalp_cap": {},
        "normal_transfer": 0.85,
        "merge_joints": dict(_JAW_TO_HEAD),
        "double_sided": True,
        "source": source,
        "changesKo": changes,
    }
    spec.update(extra)
    return spec


def _prop(name: str, *, source: dict[str, Any], head_prop: dict[str, float], changes: str, decimate: int = 3500) -> dict[str, Any]:
    return {
        "slot": "accessory",
        "name": name,
        "role": "accessory",
        "nodes": [f"TS_Accessory_{name}"],
        "material": f"ts_accessory_{name}",
        "morph_scope": "head",
        "decimate": [decimate],
        "pose": "t",
        "stylize": 0,
        "align": "head_prop",
        "head_prop": head_prop,
        "d_min": 0.004,
        "d_max": 1.0e9,
        "texture": {"strength": 0.25, "blur_radius": 0.8, "bands": 0},
        "merge_joints": dict(_JAW_TO_HEAD),
        "double_sided": True,
        "source": source,
        "changesKo": changes,
    }


def _proc_prop(name: str, *, changes: str) -> dict[str, Any]:
    """절차 생성 소품(`proc_accessories`): 원본이 이미 베이스 좌표라 정렬 없이(`align="none"`) 머리 표면에 결합한다."""
    spec = _prop(name, source={"proc": name}, head_prop={}, changes=changes, decimate=100000)
    spec["align"] = "none"
    spec["flat_texture"] = True
    # 몸에서 계산해 놓은 위치(귓볼에 박힌 스터드·눈 앞의 테)를 침투 해소가 밀지 않게 하한을 풀어 둔다.
    spec["d_min"] = -1.0e9
    return spec


def effective_spec(preset_id: str, base_id: str) -> dict[str, Any]:
    """프리셋 표 항목에 베이스별 덮어쓰기(`base_overrides[base_id]`)를 적용한 사본. 베이스마다 원본이 다른 파츠(남성 전용 헤어·의상)에 쓴다."""
    spec = dict(PRESETS[preset_id])
    overrides = spec.pop("base_overrides", {})
    spec.update(overrides.get(base_id, {}))
    return spec


# 만들어 보았으나 이번 키트에 넣지 않은 프리셋과 사유 — `build_kit_json.py`가 kit.json `unavailable`의 한글 사유로 그대로 쓴다(지금은 없다).
HELD_PRESETS_KO: dict[str, str] = {}

PRESETS: dict[str, dict[str, Any]] = {
    # ---------------------------------------------------------------- 상의
    "top/tee": _top(
        "tee",
        source={"raw": "tshirt-01", "pick": None, "clean": "tee"},
        pose="t",
        align="icp",
        icp={"anchor": "top", "landmark": "collar", "scales": [0.30, 0.33, 0.36, 0.39, 0.42]},
        changes="옷만 요청한 티셔츠 생성물에서 마네킹 목 조각을 지우고, 베이스 T-포즈 몸에 맞춰 리타깃(정렬·충돌 해소·웹툰풍 스무딩·표면 결합), 6,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    "top/shirt": _top(
        "shirt",
        source={"raw": "shirt-f-v3-bang", "pick": "root.2", "clean": "top-no-skin"},
        pose="t",
        align="frame",
        decimate=6500,
        stylize=3,
        fit_region={"top_band": 0.28, "x_max": 0.19, "standoff": 0.02, "shift": 0.03, "scale": (0.97, 1.03)},
        d_max=0.045,
        base_overrides={"male": {"source": {"raw": "shirt-m-v3-bang", "pick": "root.1", "clean": "top-no-skin"}}},
        changes="베이스 T-포즈 몸에 뾰족한 칼라·칼라 스탠드·앞단을 입체로 넣은 프록시 셔츠(앞·뒤 2장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 긴팔 셔츠 파츠를 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 6,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크. 남성 베이스는 남성 프록시로 따로 생성한 셔츠를 쓴다.",
    ),
    "top/sailor": _top(
        "sailor",
        source={"raw": "sailor-f-v3-bang", "pick": "root.6,root.8,root.4,root.1,root.9", "clean": "top-multi"},
        pose="t",
        align="frame",
        decimate=8000,
        stylize=3,
        fit_region={"top_band": 0.28, "x_max": 0.19, "standoff": 0.02, "shift": 0.03, "scale": (0.97, 1.03)},
        d_max=0.045,
        base_overrides={"male": {"source": {"raw": "sailor-m-v3-bang", "pick": "root.2,root.4,root.0,root.7", "clean": "top-multi"}}},
        changes="베이스 T-포즈 몸에 앞 V 칼라·뒤 사각 칼라·스카프 매듭을 입체로 넣은 프록시 세일러 상의(앞·뒤 2장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 몸통·칼라 조각·소매단을 합쳐 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 8,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크(네이비 칼라·빨간 스카프는 휘도 영역과 입체 지오메트리로 남는다).",
    ),
    "top/blazer": _top(
        "blazer",
        source={"raw": "blazer-f-v3-bang", "pick": "root.1,root.5", "clean": "top-multi"},
        pose="t",
        align="frame",
        decimate=8000,
        stylize=3,
        fit_region={"top_band": 0.28, "x_max": 0.19, "standoff": 0.02, "shift": 0.03, "scale": (0.97, 1.03)},
        d_max=0.045,
        base_overrides={"male": {"source": {"raw": "blazer-m-v3-bang", "pick": "root.4,root.3", "clean": "top-multi"}}},
        changes="베이스 T-포즈 몸에 노치 라펠·가슴 주머니·플랩 주머니·단추를 입체로 넣은 프록시 블레이저(앞·뒤 2장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 블레이저 파츠와 안쪽 셔츠 칼라 조각을 합쳐 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 8,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크. 남성 베이스는 남성 프록시로 따로 생성한 블레이저를 쓴다.",
    ),
    "top/hoodie": _top(
        "hoodie",
        source={"raw": "hoodie-f-v3-bang", "pick": "root.2", "clean": "top-no-skin"},
        pose="t",
        align="frame",
        decimate=8000,
        stylize=3,
        fit_region={"top_band": 0.28, "x_max": 0.19, "standoff": 0.02, "shift": 0.03, "scale": (0.97, 1.03)},
        d_max=0.12,
        d_max_open=0.12,
        base_overrides={"male": {"source": {"raw": "hoodie-m-v3-bang", "pick": "root.2", "clean": "top-no-skin"}}},
        changes="베이스 T-포즈 몸에 등에 걸친 두툼한 후드 주머니·목 둘레 후드 접힘·캥거루 주머니·끈을 입체로 넣은 프록시 후디(앞·뒤·옆 3장)를 입힌 렌더를 참조 이미지로 생성한 전신(T-포즈)에서 BANG으로 분리한 후디 파츠(후드 포함)를 포즈 변환 없이 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 8,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    # ---------------------------------------------------------------- 하의
    "bottom/jeans": _bottom(
        "jeans",
        source={"raw": "jeans-01", "pick": None, "clean": "jeans"},
        pose="t",
        align="icp",
        icp={"anchor": "top", "landmark": "waist", "scales": [0.46, 0.50, 0.54, 0.58, 0.62]},
        changes="옷만 요청한 청바지 생성물에서 마네킹 허리·발목·신발 조각을 지우고, 베이스 T-포즈 몸에 맞춰 리타깃(정렬·충돌 해소·웹툰풍 스무딩·표면 결합), 6,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    "bottom/slacks": _bottom(
        "slacks",
        source={"raw": "slacks-bang", "pick": "root.2", "clean": "keep"},
        pose="t",
        align="anchor",
        anchor={"landmark": "waist", "offset": 0.056, "length_m": 0.996},
        d_max=0.040,
        changes="바지만 요청했지만 마네킹 몸이 함께 나온 생성물을 BANG으로 분리한 바지 파츠를 베이스 T-포즈 몸에 허리선 기준으로 맞춰 리타깃, 웹툰풍 스무딩, 6,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    "bottom/shorts": _bottom(
        "shorts",
        source={"raw": "shorts-bang", "pick": "root.8", "clean": "keep"},
        pose="t",
        align="anchor",
        anchor={"landmark": "waist", "offset": 0.056, "length_m": 0.433},
        decimate=4000,
        d_max=0.050,
        changes="반바지만 요청했지만 마네킹 몸이 함께 나온 생성물을 BANG으로 분리한 반바지 파츠를 베이스 T-포즈 몸에 허리선 기준으로 맞춰 리타깃, 웹툰풍 스무딩, 4,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    "bottom/pleated-skirt": _bottom(
        "pleated-skirt",
        source={"raw": "g1-bang", "pick": "root.2", "clean": "keep"},
        pose="t",
        align="anchor",
        anchor={"landmark": "waist", "offset": 0.003, "length_m": 0.33},
        decimate=8000,
        stylize=1,
        normal_transfer=0.2,  # 주름이 디자인이라 법선을 거의 지키고 얼룩만 줄인다
        d_max=0.30,
        d_max_open=0.30,
        changes="교복 여학생 전신 생성물을 BANG으로 분리한 주름치마 파츠를 베이스 T-포즈 몸에 맞춰 리타깃(퍼짐과 주름을 유지하도록 약한 스무딩·충돌 해소만), 8,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    "bottom/long-skirt": _bottom(
        "long-skirt",
        source={"raw": "g3-bang", "pick": "root.11", "clean": "keep"},
        pose="t",
        align="anchor",
        anchor={"landmark": "waist", "offset": -0.015, "length_m": 0.74},
        decimate=8000,
        stylize=4,
        d_max=0.30,
        d_max_open=0.30,
        changes="롱스커트 여성 전신 생성물을 BANG으로 분리한 A라인 롱스커트 파츠를 베이스 T-포즈 몸에 맞춰 리타깃, 웹툰풍 스무딩, 8,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    # ---------------------------------------------------------------- 신발
    "shoes/sneakers": _shoes(
        "sneakers",
        source={"raw": "sneakers-01", "pick": None, "clean": "sneakers"},
        changes="스니커즈 한 켤레 생성물을 그대로 쓰되 베이스 발 길이에 맞춰 리타깃, 5,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    "shoes/loafers": _shoes(
        "loafers",
        source={"raw": "loafers-01", "pick": None, "clean": "sneakers"},
        changes="로퍼 한 켤레 생성물을 그대로 쓰되 베이스 발 길이에 맞춰 리타깃, 5,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    "shoes/boots": _shoes(
        "boots",
        source={"raw": "boots-01", "pick": None, "clean": "sneakers"},
        changes="끈 달린 앵클부츠 한 켤레 생성물을 그대로 쓰되 베이스 발 길이에 맞춰 리타깃, 5,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    "shoes/sandals": _shoes(
        "sandals",
        source={"raw": "sandals-01", "pick": None, "clean": "sneakers"},
        changes="스트랩 샌들 한 켤레 생성물을 그대로 쓰되 베이스 발 길이에 맞춰 리타깃, 5,000 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    # ---------------------------------------------------------------- 헤어
    "hair/soft-bob": _hair(
        "soft-bob",
        scalp_cap={"back_drop": 0.165},
        source={"raw": "hair-bob3-bang", "pick": "root.3", "clean": "keep", "ref": "root.2"},
        align="head_ref",
        lods=(3300, 1800, 950),
        bang_target_y=1.602,
        base_overrides={"male": {"source": {"raw": "hair-bob3m-bang", "pick": "root.2", "clean": "keep", "ref": "root.1"}}},
        changes="청크형(저폴리 3,000 설정) 보브 헤어 흉상 생성물을 BANG으로 분리한 헤어 파츠를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(3,300/1,800/950 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.",
    ),
    "hair/hime-cut": _hair(
        "hime-cut",
        scalp_cap={"back_drop": 0.22},
        source={"raw": "hair-hime3-bang", "pick": "root.2", "clean": "keep", "ref": "root.1"},
        align="head_ref",
        lods=(5200, 2800, 1500),
        changes="청크형(저폴리 5,000 설정) 히메컷 헤어 흉상 생성물(블런트 뱅·볼 옆 머리)을 BANG으로 분리한 헤어 파츠를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(5,200/2,800/1,500 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.",
    ),
    "hair/short-layered": _hair(
        "short-layered",
        scalp_cap={"back_drop": 0.115},
        source={"raw": "hair-short3-bang", "pick": "root.0,root.1", "clean": "keep-multi", "ref": "root.3"},
        align="head_ref",
        lods=(5000, 2700, 1400),
        bang_target_y=1.600,
        base_overrides={"male": {"source": {"raw": "hair-short3m-bang", "pick": "root.2", "clean": "keep", "ref": "root.3"}}},
        changes="청크형(저폴리 5,000 설정) 숏 레이어드 헤어 흉상 생성물(옆으로 쓸어 넘긴 앞머리)을 BANG으로 분리한 겉 껍데기·안쪽 조각 두 덩어리를 합쳐 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(5,000/2,700/1,400 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.",
    ),
    "hair/wolf-layered": _hair(
        "wolf-layered",
        scalp_cap={"back_drop": 0.19},
        source={"raw": "hair-wolf3-bang", "pick": "root.0,root.4", "clean": "keep-multi", "ref": "root.5"},
        align="head_ref",
        lods=(6000, 3200, 1700),
        bang_target_y=1.600,
        base_overrides={"male": {"source": {"raw": "hair-wolf3m", "pick": None, "clean": "hair-dark"}, "align": "hair"}},
        changes="청크형(저폴리 5,000 설정) 울프 컷 헤어 흉상 생성물(커튼 뱅 레이어드)을 BANG으로 분리한 겉 껍데기·뒤쪽 조각 두 덩어리를 합쳐 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, 앞머리를 눈썹 위로 올림, LOD 3단(6,000/3,200/1,700 삼각형), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.",
    ),
    "hair/action-pony": _hair(
        "action-pony",
        scalp_cap={"back_drop": 0.15},
        source={"raw": "hair-pony3-bang", "pick": "root.4", "clean": "keep", "ref": "root.3"},
        align="head_ref",
        lods=(5000, 2700, 1400),
        bang_target_y=1.590,
        base_overrides={"male": {"source": {"raw": "hair-pony3m-bang", "pick": "root.1", "clean": "keep", "ref": "root.0"}}},
        changes="청크형(저폴리 5,000 설정) 하이 포니테일 헤어 흉상 생성물을 BANG으로 분리한 헤어 파츠(정수리 묶음 + 긴 꼬리)를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(5,000/2,700/1,400 삼각형), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.",
    ),
    "hair/twin-tail": _hair(
        "twin-tail",
        scalp_cap={"back_drop": 0.17},
        source={"raw": "hair-twin3-bang", "pick": "root.0", "clean": "keep", "ref": "root.4"},
        align="head_ref",
        lods=(5000, 2700, 1400),
        changes="청크형(저폴리 5,000 설정) 트윈테일 헤어 흉상 생성물을 BANG으로 분리한 헤어 파츠(양쪽 높은 묶음 + 긴 꼬리 둘)를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(5,000/2,700/1,400 삼각형), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.",
    ),
    "hair/romance-long": _hair(
        "romance-long",
        scalp_cap={"back_drop": 0.22},
        source={"raw": "hair-romance3-bang", "pick": "root.3", "clean": "keep", "ref": "root.0"},
        align="head_ref",
        lods=(4500, 2400, 1300),
        changes="청크형(저폴리 5,000 설정) 가운데 가르마 긴 생머리 흉상 생성물을 BANG으로 분리한 헤어 파츠를 같은 좌표계 머리 메시의 두개골 폭·정수리에 맞춰 베이스 머리로 리타깃, LOD 3단(4,500/2,400/1,300 삼각형, 두피 덮개 별도), 정점을 합치고 원통 UV와 세로 가닥 줄무늬 텍스처를 새로 만듦.",
    ),
    # ---------------------------------------------------------------- 소품
    "accessory/cap": _prop(
        "cap",
        source={"raw": "cap-01", "pick": None, "clean": "keep"},
        head_prop={"width_margin": 0.030, "top_offset": 0.034, "z_offset": -0.004},
        changes="야구모자 생성물을 베이스 머리 너비에 맞춰 정수리 위에 얹도록 리타깃, 3,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    "accessory/ribbon": _prop(
        "ribbon",
        source={"raw": "ribbon-01", "pick": None, "clean": "keep"},
        head_prop={"target_width": 0.075, "x_offset": 0.052, "top_offset": 0.022, "z_offset": 0.006},
        decimate=2500,
        changes="헤어 리본 생성물을 너비 7.5 cm로 줄여 머리 왼쪽 위(귀 위쪽)에 얹도록 리타깃, 2,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
    "accessory/glasses": _proc_prop(
        "glasses",
        changes="베이스 눈·귀 위치에서 절차 생성한 둥근 사각 테 안경(테 굵기 1.3 mm, 브리지, 귀에 걸치는 다리)을 변환 없이 머리 표면에 결합해 스킨·morph를 붙임. Hyper3D 생성물이 아닌 원본(license: original).",
    ),
    "accessory/earrings": _proc_prop(
        "earrings",
        changes="베이스 귓볼 위치에서 절차 생성한 드롭 귀걸이(스터드 구슬 + 사슬 + 작은 구슬)를 변환 없이 머리 표면에 결합해 스킨·morph를 붙임. Hyper3D 생성물이 아닌 원본(license: original).",
    ),
    "accessory/choker": _proc_prop(
        "choker",
        changes="베이스(머리를 2.6~2.8 cm 들어 올려 만든 자유로운 목 기둥) 턱 바닥에서 6 cm 위 목 둘레를 따라 절차 생성한 폭 9 mm 띠와 앞쪽 작은 원판 장식 초커를 변환 없이 머리 표면에 결합해 스킨·morph를 붙임. Hyper3D 생성물이 아닌 원본(license: original).",
    ),
    "accessory/headphones": _prop(
        "headphones",
        source={"raw": "headphones-01", "pick": None, "clean": "keep"},
        head_prop={"width_margin": 0.050, "top_offset": 0.020, "z_offset": -0.010},
        changes="헤드폰 생성물을 베이스 머리 너비에 맞춰 귀 바깥에 오도록 리타깃, 3,500 삼각형으로 축소, 텍스처를 상대색 JPEG로 재베이크.",
    ),
}
