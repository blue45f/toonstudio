"""Hyper3D 생성 의상의 프리셋 표 (리타깃 입력).

`retarget_garment.py`는 이 표를 읽어 정리·축소된 Rodin 메시를 키트 파츠 GLB로 만든다. 값은 2026-10-11 파일럿 4종(티셔츠·청바지·스니커즈·
보브 헤어)의 육안·수치 확인에서 정했고, 새 프리셋은 같은 형식으로 더한다.

- `align`: `icp`(평균 거리 최소화 — 몸에 밀착한 의상), `hair`(머리 너비·정수리 기준), `shoes`(발 길이·발바닥 기준).
  부피가 있는 의상은 평균 거리 정렬이 몸 쪽으로 쪼그라드므로 `icp`를 쓰지 않는다.
- `d_min`/`d_max`: 몸 표면 기준 부호 거리(m)의 하한/상한. 속옷 셸(몸 위 약 3 mm)을 가리도록 의상은 d_min을 8 mm로 둔다.
- `texture`: `garment_texture.TextureStyle` 인자(`strength`가 클수록 디테일이 진하다. 헤어는 계약상 0.55~1.0 회색이라 0.45).
- `morph_scope`: `body`(체형 9키± = 18개) 또는 `head`(머리 부착 4키± = 8개). 계약 `KIT_MORPH_COVERAGE`와 같다.
- `merge_joints`: 스킨에서 합칠 joint(턱 본이 헤어·귀 근처 의상에 번지지 않게 머리 본으로 합친다).
- `source`: `hyper3d_sources.json`의 항목 키(생성 id·원본 해시는 거기 있다).
"""

from __future__ import annotations

from typing import Any

BODY_MORPH_KEYS = ("height", "legLength", "armLength", "shoulderWidth", "neckLength", "headSize", "hip", "waist", "chestDepth")
HEAD_ATTACHED_MORPH_KEYS = ("height", "legLength", "neckLength", "headSize")


def morph_names(scope: str) -> list[str]:
    keys = BODY_MORPH_KEYS if scope == "body" else HEAD_ATTACHED_MORPH_KEYS
    return [f"param:{key}:{sign}" for key in keys for sign in ("+", "-")]


PRESETS: dict[str, dict[str, Any]] = {
    "top/tee": {
        "slot": "top",
        "name": "tee",
        "role": "top",
        "nodes": ["TS_Top_tee"],
        "material": "ts_top_tee",
        "morph_scope": "body",
        "decimate": [6500],
        "align": "icp",
        "icp": {"anchor": "top", "landmark": "collar", "scales": [0.30, 0.33, 0.36, 0.39, 0.42]},
        "d_min": 0.008,
        "d_max": 0.030,
        "texture": {"strength": 0.28, "blur_radius": 1.2, "bands": 0},
        "merge_joints": {},
        "double_sided": True,
        "source": "top/tee",
    },
    "bottom/jeans": {
        "slot": "bottom",
        "name": "jeans",
        "role": "bottom",
        "nodes": ["TS_Bottom_jeans"],
        "material": "ts_bottom_jeans",
        "morph_scope": "body",
        "decimate": [6500],
        "align": "icp",
        "icp": {"anchor": "top", "landmark": "waist", "scales": [0.46, 0.50, 0.54, 0.58, 0.62]},
        "d_min": 0.008,
        "d_max": 0.030,
        "texture": {"strength": 0.30, "blur_radius": 1.4, "bands": 0},
        "merge_joints": {},
        "double_sided": True,
        "source": "bottom/jeans",
    },
    "shoes/sneakers": {
        "slot": "shoes",
        "name": "sneakers",
        "role": "shoes",
        "nodes": ["TS_Shoes_sneakers"],
        "material": "ts_shoes_sneakers",
        "morph_scope": "body",
        "decimate": [5000],
        "align": "shoes",
        "d_min": 0.003,
        "d_max": 1.0e9,
        "texture": {"strength": 0.30, "blur_radius": 1.0, "bands": 0},
        "merge_joints": {},
        "double_sided": True,
        "source": "shoes/sneakers",
    },
    "hair/soft-bob": {
        "slot": "hair",
        "name": "soft-bob",
        "role": "hair",
        "nodes": ["TS_AuthoredHair_soft-bob_LOD0", "TS_AuthoredHair_soft-bob_LOD1", "TS_AuthoredHair_soft-bob_LOD2"],
        "material": "ts_hair_soft-bob",
        "morph_scope": "head",
        "decimate": [7000, 3500, 1800],
        "align": "hair",
        "d_min": 0.006,
        "d_max": 1.0e9,
        "texture": {"strength": 0.45, "blur_radius": 1.0, "bands": 0},
        "merge_joints": {"TS_Jaw": "mixamorig:Head"},
        "double_sided": True,
        "source": "hair/soft-bob",
    },
}
